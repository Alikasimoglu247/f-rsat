import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { db } from "../db";
import { HttpError } from "../http";
import { digest } from "./parser";
import { ingestEml, recordUnreadableGmail } from "./ingestion";
import {
  readTokens,
  saveTokens,
  forgetTokens,
  seal,
  unseal,
  GMAIL_SCOPE,
  gmailConfiguration,
} from "./secrets";
import type { GmailTokens } from "./secrets";

export const mailboxSelectionSchema = z
  .object({
    labelIds: z.array(z.string().regex(/^[A-Za-z0-9_-]{1,150}$/)).max(20),
    senders: z
      .array(
        z
          .string()
          .toLowerCase()
          .regex(/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/),
      )
      .max(20),
    lookbackDays: z.number().int().min(1).max(365).default(7),
  })
  .strict()
  .refine(
    (v) => v.labelIds.length + v.senders.length > 0,
    "En az bir etiket veya gönderici seçin.",
  );
export function selectionMatches(
  labels: string[],
  sender: string,
  selection: { labelIds: string[]; senders: string[] },
) {
  return (
    !!(selection.labelIds.length + selection.senders.length) &&
    selection.labelIds.every((id) => labels.includes(id)) &&
    (!selection.senders.length ||
      selection.senders.includes(sender.toLowerCase()))
  );
}
export function gmailQuery(
  selection: { senders: string[] },
  after: Date,
  before: Date,
) {
  return `${selection.senders.length ? `(${selection.senders.map((sender) => `from:${sender}`).join(" OR ")}) ` : ""}after:${Math.floor(after.getTime() / 1000)} before:${Math.floor(before.getTime() / 1000)}`;
}
export async function ensureMailbox() {
  return db.mailboxConnection.upsert({
    where: { id: "personal" },
    create: {},
    update: {},
  });
}
async function lockMailboxMutation(tx: Prisma.TransactionClient) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(451812)::text`;
  const lease = await tx.analysisRun.findUnique({
    where: { id: "gmail-sync-lease" },
  });
  if (
    lease?.status === "RUNNING" &&
    Date.now() - lease.startedAt.getTime() < 10 * 60_000
  )
    throw new HttpError(
      409,
      "Gmail alımı sürüyor; seçim veya hesap değişikliği için tamamlanmasını bekleyin.",
    );
}
function redirectUri() {
  const value = process.env.GMAIL_REDIRECT_URI ?? "";
  const uri = new URL(value),
    app = new URL(process.env.APP_BASE_URL ?? "http://127.0.0.1:3000");
  if (
    uri.origin !== app.origin ||
    uri.pathname !== "/api/email/gmail/callback" ||
    uri.search ||
    uri.hash ||
    uri.username ||
    uri.password ||
    (uri.protocol !== "https:" &&
      !["127.0.0.1", "localhost"].includes(uri.hostname))
  )
    throw new HttpError(
      400,
      "Gmail redirect URI uygulama origin'i ve /api/email/gmail/callback ile eşleşmeli.",
    );
  return uri.toString();
}
const oauthStateSchema = z.object({
  state: z.string(),
  verifier: z.string(),
  expires: z.number(),
});
export async function beginGmailConsent() {
  if (!gmailConfiguration().configured)
    throw new HttpError(
      400,
      "Gmail sunucu yapılandırması eksik; gizli değerleri sunucu ortamında tanımlayın.",
    );
  const redirect = redirectUri();
  await ensureMailbox();
  const state = randomBytes(32).toString("base64url"),
    verifier = randomBytes(32).toString("base64url"),
    expires = Date.now() + 10 * 60_000;
  await db.oAuthAttempt.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 86400_000) } },
  });
  await db.oAuthAttempt.create({
    data: { stateHash: digest(state), expiresAt: new Date(expires) },
  });
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  for (const [name, value] of Object.entries({
    client_id: process.env.GMAIL_CLIENT_ID!,
    redirect_uri: redirect,
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state,
    code_challenge: Buffer.from(digest(verifier), "hex").toString("base64url"),
    code_challenge_method: "S256",
  }))
    url.searchParams.set(name, value);
  return {
    authorizationUrl: url.toString(),
    cookie: seal({ state, verifier, expires }),
    secure: new URL(redirect).protocol === "https:",
  };
}
async function googleJson(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const value = response.headers.get("retry-after");
    const seconds =
      value && /^\d+$/.test(value)
        ? Number(value)
        : value
          ? (Date.parse(value) - Date.now()) / 1000
          : 60;
    throw new GoogleRequestError(
      response.status,
      new Date(
        Date.now() +
          Math.max(60, Number.isFinite(seconds) ? seconds : 60) * 1000,
      ),
    );
  }
  const reader = response.body?.getReader();
  if (!reader) throw new HttpError(502, "Google boş yanıt verdi.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 2_800_000) {
      await reader.cancel();
      throw new HttpError(502, "Google yanıtı boyut sınırını aştı.");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new HttpError(502, "Google yanıt biçimi geçersiz.");
  }
}
class GoogleRequestError extends HttpError {
  constructor(
    public remoteStatus: number,
    public retryAfter: Date,
  ) {
    super(
      502,
      `Google isteği başarısız (HTTP ${remoteStatus}); yetki/kota durumunu kontrol edin.`,
    );
  }
}
const tokenResponse = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().int().min(1).max(86400),
  scope: z.literal(GMAIL_SCOPE),
  token_type: z.literal("Bearer"),
});
async function exchange(parameters: Record<string, string>) {
  return tokenResponse.parse(
    await googleJson("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GMAIL_CLIENT_ID!,
        client_secret: process.env.GMAIL_CLIENT_SECRET!,
        ...parameters,
      }),
    }),
  );
}
export async function completeGmailConsent(
  code: string,
  state: string,
  cookie: string,
) {
  let attempt: z.infer<typeof oauthStateSchema>;
  try {
    attempt = oauthStateSchema.parse(unseal(cookie));
  } catch {
    throw new HttpError(400, "OAuth oturumu geçersiz.");
  }
  if (!code || attempt.state !== state || attempt.expires < Date.now())
    throw new HttpError(400, "OAuth state/oturum süresi geçersiz.");
  const claimed = await db.oAuthAttempt.updateMany({
    where: {
      stateHash: digest(state),
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { usedAt: new Date() },
  });
  if (!claimed.count)
    throw new HttpError(400, "OAuth oturumu kullanılmış veya süresi dolmuş.");
  const token = await exchange({
    grant_type: "authorization_code",
    code,
    code_verifier: attempt.verifier,
    redirect_uri: redirectUri(),
  });
  if (!token.refresh_token)
    throw new HttpError(
      400,
      "Google kalıcı salt-okunur yetki vermedi; yeniden onaylayın.",
    );
  const refreshToken = token.refresh_token;
  const profile = z
    .object({ emailAddress: z.email() })
    .parse(
      await googleJson(
        "https://gmail.googleapis.com/gmail/v1/users/me/profile",
        { headers: { Authorization: `Bearer ${token.access_token}` } },
      ),
    );
  const accountHash = digest(profile.emailAddress.toLowerCase());
  const previous = await ensureMailbox();
  await db.$transaction(async (tx) => {
    await lockMailboxMutation(tx);
    await saveTokens({
      accessToken: token.access_token,
      refreshToken,
      scope: token.scope,
      expiresAt: Date.now() + token.expires_in * 1000,
      accountHash,
    });
    await tx.mailboxConnection.update({
      where: { id: "personal" },
      data: {
        status: "AUTHORIZED",
        accountHash,
        lastError: null,
        retryAfter: null,
        ...(previous.accountHash !== accountHash
          ? {
              scanAfter: null,
              scanBefore: null,
              pageToken: null,
              lastSuccessAt: null,
              lastFetched: 0,
              lastImported: 0,
              labelIds: [],
              senders: [],
            }
          : {}),
      },
    });
  });
}
async function activeTokens() {
  if (!gmailConfiguration().configured)
    throw new HttpError(400, "Gmail sunucu ayarları eksik.");
  // Serialize refreshes across the web and scheduler processes. Secrets never enter PostgreSQL.
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(451811)::text`;
      const token = await readTokens();
      if (token.expiresAt > Date.now() + 60_000) return token;
      const refreshed = await exchange({
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      });
      const next = {
        ...token,
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token ?? token.refreshToken,
        expiresAt: Date.now() + refreshed.expires_in * 1000,
      };
      await saveTokens(next);
      return next;
    },
    { timeout: 30_000 },
  );
}
async function gmailGet(path: string, tokens: GmailTokens) {
  return googleJson(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
  });
}
export async function gmailLabels() {
  const tokens = await activeTokens();
  return z
    .object({
      labels: z
        .array(z.object({ id: z.string(), name: z.string() }))
        .default([]),
    })
    .parse(await gmailGet("labels", tokens)).labels;
}
export async function saveMailboxSelection(
  input: z.infer<typeof mailboxSelectionSchema>,
) {
  await ensureMailbox();
  return db.$transaction(async (tx) => {
    await lockMailboxMutation(tx);
    return tx.mailboxConnection.update({
      where: { id: "personal" },
      data: {
        ...input,
        labelIds: [...new Set(input.labelIds)],
        senders: [...new Set(input.senders)],
        scanAfter: null,
        scanBefore: null,
        pageToken: null,
      },
    });
  });
}
export async function disconnectGmail() {
  await ensureMailbox();
  await db.$transaction(async (tx) => {
    await lockMailboxMutation(tx);
    await forgetTokens();
    await tx.mailboxConnection.update({
      where: { id: "personal" },
      data: {
        status: "DISCONNECTED",
        accountHash: null,
        lastSuccessAt: null,
        lastError: null,
        scanAfter: null,
        scanBefore: null,
        pageToken: null,
      },
    });
    await tx.listingSource.updateMany({
      where: {
        id: { in: ["sahibinden-email", "arabam-email"] },
        accessStatus: "CONNECTED",
      },
      data: { accessStatus: "DISCONNECTED" },
    });
  });
}
const metadataSchema = z.object({
  id: z.string(),
  labelIds: z.array(z.string()).default([]),
  internalDate: z.string().regex(/^\d+$/),
  payload: z
    .object({
      headers: z
        .array(z.object({ name: z.string(), value: z.string() }))
        .default([]),
    })
    .optional(),
});
function senderAddress(value: string) {
  return (value.match(/<([^<>]+)>/)?.[1] ?? value).trim().toLowerCase();
}
export async function syncGmail() {
  const mailbox = await ensureMailbox();
  if (
    !["AUTHORIZED", "CONNECTED", "ERROR"].includes(mailbox.status) ||
    !mailbox.accountHash
  )
    throw new HttpError(400, "Gmail kullanıcı onayıyla bağlanmalı.");
  const selection = mailboxSelectionSchema.parse({
    labelIds: mailbox.labelIds,
    senders: mailbox.senders,
    lookbackDays: mailbox.lookbackDays,
  });
  if (mailbox.retryAfter && mailbox.retryAfter.getTime() > Date.now())
    return { status: "DEFERRED", fetched: 0, inserted: 0, pending: 0 };
  // A persistent short lease prevents concurrent readers from advancing the same pagination cursor.
  const key = "gmail-sync-lease";
  const claimed = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(451812)::text`;
    const current = await tx.mailboxConnection.findUniqueOrThrow({
      where: { id: "personal" },
    });
    if (current.updatedAt.getTime() !== mailbox.updatedAt.getTime())
      throw new HttpError(
        409,
        "Gmail seçimi değişti; işlemi yeniden başlatın.",
      );
    const run = await tx.analysisRun.findUnique({ where: { id: key } });
    if (
      run?.status === "RUNNING" &&
      Date.now() - run.startedAt.getTime() < 10 * 60_000
    )
      return false;
    await tx.analysisRun.upsert({
      where: { id: key },
      create: { id: key, status: "RUNNING", errors: [] },
      update: {
        status: "RUNNING",
        startedAt: new Date(),
        errors: [],
        attempts: { increment: 1 },
      },
    });
    return true;
  });
  if (!claimed)
    return { status: "RUNNING", fetched: 0, inserted: 0, pending: 0 };
  let fetched = 0,
    inserted = 0,
    pending = 0;
  const newBySource = new Map<string, number>();
  try {
    const tokens = await activeTokens();
    if (tokens.accountHash !== mailbox.accountHash)
      throw new HttpError(
        400,
        "Gmail hesap eşleşmesi geçersiz; yeniden bağlanın.",
      );
    const after =
        mailbox.scanAfter ??
        new Date(Date.now() - selection.lookbackDays * 86400_000),
      before = mailbox.scanBefore ?? new Date();
    let pageToken = mailbox.pageToken ?? undefined;
    await db.mailboxConnection.update({
      where: { id: "personal" },
      data: { scanAfter: after, scanBefore: before },
    });
    for (let page = 0; page < 5; page++) {
      const query = new URLSearchParams({
        q: gmailQuery(selection, after, before),
        maxResults: "100",
        includeSpamTrash: "false",
      });
      selection.labelIds.forEach((label) => query.append("labelIds", label));
      if (pageToken) query.set("pageToken", pageToken);
      let response;
      try {
        response = z
          .object({
            messages: z
              .array(z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]+$/) }))
              .default([]),
            nextPageToken: z.string().optional(),
          })
          .parse(await gmailGet(`messages?${query}`, tokens));
      } catch (error) {
        if (
          pageToken &&
          error instanceof GoogleRequestError &&
          error.remoteStatus === 400
        )
          await db.mailboxConnection.update({
            where: { id: "personal" },
            data: { pageToken: null },
          });
        throw error;
      }
      for (const item of response.messages) {
        await db.analysisRun.update({
          where: { id: key },
          data: { startedAt: new Date() },
        });
        const deliveryKey = digest(`${tokens.accountHash}:${item.id}`);
        if (await db.emailDelivery.findUnique({ where: { key: deliveryKey } }))
          continue;
        const metadata = metadataSchema.parse(
          await gmailGet(
            `messages/${item.id}?format=metadata&metadataHeaders=From`,
            tokens,
          ),
        );
        if (metadata.id !== item.id)
          throw new HttpError(502, "Gmail mesaj kimliği çelişiyor.");
        const headers =
          metadata.payload?.headers.filter(
            (h) => h.name.toLowerCase() === "from",
          ) ?? [];
        const sender =
          headers.length === 1 ? senderAddress(headers[0].value) : "";
        if (!sender || headers.length !== 1) continue;
        if (!selectionMatches(metadata.labelIds, sender, selection)) continue;
        const raw = z
          .object({
            id: z.string(),
            raw: z.string().max(2_700_000),
            labelIds: z.array(z.string()).default([]),
          })
          .parse(await gmailGet(`messages/${item.id}?format=raw`, tokens));
        if (raw.id !== item.id)
          throw new HttpError(502, "Gmail ham mesaj kimliği çelişiyor.");
        if (!selectionMatches(raw.labelIds, sender, selection)) continue;
        let result;
        const bytes = Buffer.from(raw.raw, "base64url"),
          receivedAt = new Date(Number(metadata.internalDate));
        try {
          result = await ingestEml(bytes, {
            transport: "GMAIL",
            deliveryKey,
            receivedAt,
            expectedSender: sender,
            gmailLabelIds: raw.labelIds,
          });
        } catch (error) {
          if (!(error instanceof HttpError) || error.status !== 400)
            throw error;
          result = await recordUnreadableGmail(
            bytes,
            sender,
            deliveryKey,
            receivedAt,
            raw.labelIds,
          );
        }
        fetched++;
        if (!result.replayed) {
          inserted += result.message.inserted;
          for (const proposal of result.message.proposals as unknown as {
            providerId: string;
            outcome?: string;
          }[]) {
            if (proposal.outcome === "inserted")
              newBySource.set(
                proposal.providerId,
                (newBySource.get(proposal.providerId) ?? 0) + 1,
              );
          }
        }
        if (result.message.status !== "IMPORTED") pending++;
      }
      pageToken = response.nextPageToken;
      await db.mailboxConnection.update({
        where: { id: "personal" },
        data: { pageToken: pageToken ?? null },
      });
      if (!pageToken) break;
    }
    for (const sourceId of ["sahibinden-email", "arabam-email"])
      await db.listingSource.updateMany({
        where: { id: sourceId },
        data: { lastNewCount: newBySource.get(sourceId) ?? 0 },
      });
    await db.mailboxConnection.update({
      where: { id: "personal" },
      data: {
        status: "CONNECTED",
        lastSuccessAt: new Date(),
        lastError: null,
        lastFetched: fetched,
        lastImported: inserted,
        retryAfter: null,
        ...(pageToken
          ? {}
          : {
              scanAfter: new Date(before.getTime() - 48 * 3600_000),
              scanBefore: null,
              pageToken: null,
            }),
      },
    });
    await db.analysisRun.update({
      where: { id: key },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        processed: fetched,
      },
    });
    console.info(
      JSON.stringify({
        event: "gmail.sync.completed",
        fetched,
        inserted,
        pending,
        hasMore: !!pageToken,
      }),
    );
    return {
      status: pageToken ? "MORE_PENDING" : "COMPLETED",
      fetched,
      inserted,
      pending,
    };
  } catch (error) {
    const message =
      "Gmail alımı başarısız; yetki/kota/filtre/yanıt biçimini kontrol edin. Mesajlar veya kimlik bilgileri loglanmaz.";
    await db.mailboxConnection.update({
      where: { id: "personal" },
      data: {
        status: "ERROR",
        lastError: message,
        ...(error instanceof GoogleRequestError &&
        [403, 429, 503].includes(error.remoteStatus)
          ? { retryAfter: error.retryAfter }
          : {}),
      },
    });
    await db.analysisRun.update({
      where: { id: key },
      data: {
        status: "FAILED",
        errors: [{ message }],
        completedAt: new Date(),
      },
    });
    throw new HttpError(502, message);
  }
}

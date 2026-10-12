import { beforeEach, afterEach, afterAll, it, expect, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { db } from "../../src/lib/db";
import { ensureSources } from "../../src/lib/providers/registry";
import {
  ingestEml,
  approveMessage,
  reprocessMessage,
} from "../../src/lib/email/ingestion";
import {
  syncGmail,
  beginGmailConsent,
  completeGmailConsent,
  ensureMailbox,
  saveMailboxSelection,
  disconnectGmail,
} from "../../src/lib/email/gmail";
import {
  saveTokens,
  readTokens,
  GMAIL_SCOPE,
} from "../../src/lib/email/secrets";
let dir: string;
const fixture = () =>
  readFile("tests/fixtures/emails/sahibinden-synthetic.eml");
beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "Listing", "ListingSource", "ImportJob", "AnalysisRun", "AppSettings", "SearchProfile", "EmailMessage", "EmailTemplate", "MailboxConnection", "OAuthAttempt" CASCADE',
  );
  await ensureSources(db);
  dir = await mkdtemp(join(tmpdir(), "radar-gmail-integration-"));
  vi.stubEnv("GMAIL_TOKEN_STORE", join(dir, "secrets", "gmail.enc"));
  vi.stubEnv(
    "GMAIL_TOKEN_ENCRYPTION_KEY",
    randomBytes(32).toString("base64url"),
  );
  vi.stubEnv("GMAIL_CLIENT_ID", "test-client");
  vi.stubEnv("GMAIL_CLIENT_SECRET", "test-secret");
  vi.stubEnv(
    "GMAIL_REDIRECT_URI",
    "http://127.0.0.1:3000/api/email/gmail/callback",
  );
  vi.stubEnv("APP_BASE_URL", "http://127.0.0.1:3000");
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error(
        "Unexpected external request: tests never contact live accounts",
      );
    }),
  );
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  await rm(dir, { recursive: true, force: true });
});
afterAll(() => db.$disconnect());
it("bilinmeyen .eml incelemede kalır; kullanıcı onayı olmadan gerçek ilan oluşturmaz", async () => {
  const result = await ingestEml(await fixture());
  expect(result.message.status).toBe("NEEDS_REVIEW");
  expect(await db.listing.count()).toBe(0);
  expect((await ingestEml(await fixture())).replayed).toBe(true);
  expect(await db.emailMessage.count()).toBe(1);
  await approveMessage(result.message.id);
  expect(await db.listing.count()).toBe(1);
  expect(await db.listingPriceHistory.count()).toBe(1);
  const source = await db.listingSource.findUniqueOrThrow({
    where: { id: "sahibinden-email" },
  });
  expect(source.accessStatus).toBe("USER_APPROVED");
  expect(
    (await db.emailTemplate.findFirstOrThrow()).liveValidatedAt,
  ).toBeNull();
  await reprocessMessage(result.message.id);
  expect(await db.listingPriceHistory.count()).toBe(1);
});
it("onaylı aynı şablon yeni fiyatı otomatik alır; ilan ve e-posta tekrarları ayıklanır", async () => {
  const raw = (await fixture()).toString();
  const first = await ingestEml(Buffer.from(raw));
  await approveMessage(first.message.id);
  const changed = await ingestEml(
    Buffer.from(raw.replace("4.250.000,50 TL", "4.000.000,25 TL")),
  );
  expect(changed.message.updated).toBe(1);
  expect(changed.message.status).toBe("IMPORTED");
  expect(await db.listing.count()).toBe(1);
  expect(await db.listingPriceHistory.count()).toBe(2);
  const stored = await db.listing.findFirstOrThrow();
  expect(stored.price.toFixed(2)).toBe("4000000.25");
  expect(stored.sourceId).toBe("sahibinden-email");
  expect(stored.provenance).toHaveProperty("emailReceiptId", first.message.id);
});
it("eksik/çelişkili örnek şablon onayı almaz; farklı gönderici yeniden incelemeye gider", async () => {
  const raw = (await fixture()).toString();
  const incomplete = await ingestEml(
    Buffer.from(raw.replace("Konum: İstanbul / Kadıköy", "")),
  );
  await expect(approveMessage(incomplete.message.id)).rejects.toThrow();
  const first = await ingestEml(Buffer.from(raw));
  await approveMessage(first.message.id);
  const other = await ingestEml(
    Buffer.from(
      raw.replace("notifications@sahibinden.com", "different@sahibinden.com"),
    ),
  );
  expect(other.message.status).toBe("NEEDS_REVIEW");
  expect(await db.listing.count()).toBe(1);
});
it("eşzamanlı .eml işlemleri tek receipt ve tek gözlem oluşturur", async () => {
  const raw = await fixture();
  await Promise.all([ingestEml(raw), ingestEml(raw)]);
  expect(await db.emailMessage.count()).toBe(1);
  const first = await db.emailMessage.findFirstOrThrow();
  await Promise.all([approveMessage(first.id), approveMessage(first.id)]);
  expect(await db.listing.count()).toBe(1);
  expect(await db.listingPriceHistory.count()).toBe(1);
});
async function authorize() {
  await ensureMailbox();
  await db.mailboxConnection.update({
    where: { id: "personal" },
    data: {
      status: "AUTHORIZED",
      accountHash: "a".repeat(64),
      labelIds: ["Label_123"],
      senders: ["notifications@sahibinden.com"],
    },
  });
  await saveTokens({
    accessToken: "test-access",
    refreshToken: "test-refresh",
    expiresAt: Date.now() + 3600_000,
    scope: GMAIL_SCOPE,
    accountHash: "a".repeat(64),
  });
}
it("Gmail protokolü salt okunur seçili mesajı okur, metadata/raw filtrelerini uygular ve tekrar alımı ayıklar", async () => {
  const raw = await fixture(),
    first = await ingestEml(raw);
  await approveMessage(first.message.id);
  await authorize();
  const requests: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (value: string) => {
      const url = new URL(value);
      requests.push(url.pathname + "?" + url.searchParams.toString());
      if (url.pathname.endsWith("/messages")) {
        expect(url.searchParams.get("q")).toContain(
          "from:notifications@sahibinden.com",
        );
        expect(url.searchParams.getAll("labelIds")).toEqual(["Label_123"]);
        return Response.json({ messages: [{ id: "chosen" }, { id: "other" }] });
      }
      if (url.pathname.endsWith("/messages/other"))
        return Response.json({
          id: "other",
          labelIds: ["INBOX"],
          internalDate: String(Date.now()),
          payload: {
            headers: [{ name: "From", value: "notifications@sahibinden.com" }],
          },
        });
      if (url.searchParams.get("format") === "metadata")
        return Response.json({
          id: "chosen",
          labelIds: ["Label_123"],
          internalDate: String(Date.now()),
          payload: {
            headers: [{ name: "From", value: "notifications@sahibinden.com" }],
          },
        });
      return Response.json({
        id: "chosen",
        labelIds: ["Label_123"],
        raw: raw.toString("base64url"),
      });
    }),
  );
  expect((await syncGmail()).status).toBe("COMPLETED");
  expect(
    requests.filter((r) => r.includes("/other") && r.includes("format=raw")),
  ).toHaveLength(0);
  expect(await db.emailDelivery.count()).toBe(1);
  expect(await db.listing.count()).toBe(1);
  expect(
    (
      await db.mailboxConnection.findUniqueOrThrow({
        where: { id: "personal" },
      })
    ).status,
  ).toBe("CONNECTED");
  const before = requests.filter((r) => r.includes("/chosen")).length;
  await syncGmail();
  expect(requests.filter((r) => r.includes("/chosen")).length).toBe(before);
});
it("raw gönderen değişmişse veya kullanıcı seçim yapmamışsa hiçbir ilan almaz", async () => {
  await authorize();
  const raw = (await fixture())
    .toString()
    .replace("notifications@sahibinden.com", "attacker@example.com");
  vi.stubGlobal(
    "fetch",
    vi.fn(async (value: string) => {
      const url = new URL(value);
      if (url.pathname.endsWith("/messages"))
        return Response.json({ messages: [{ id: "chosen" }] });
      if (url.searchParams.get("format") === "metadata")
        return Response.json({
          id: "chosen",
          labelIds: ["Label_123"],
          internalDate: String(Date.now()),
          payload: {
            headers: [{ name: "From", value: "notifications@sahibinden.com" }],
          },
        });
      return Response.json({
        id: "chosen",
        labelIds: ["Label_123"],
        raw: Buffer.from(raw).toString("base64url"),
      });
    }),
  );
  expect((await syncGmail()).pending).toBe(1);
  const failed = await db.emailMessage.findFirstOrThrow();
  expect(failed.status).toBe("ERROR");
  expect(failed.proposals).toEqual([]);
  expect(failed.sender).toBe("notifications@sahibinden.com");
  expect(await db.listing.count()).toBe(0);
  await db.mailboxConnection.update({
    where: { id: "personal" },
    data: { labelIds: [], senders: [] },
  });
  await expect(syncGmail()).rejects.toThrow();
});
it("Google 429 Retry-After süresinde yeniden istek yapmaz", async () => {
  await authorize();
  const request = vi.fn(
    async () =>
      new Response("", { status: 429, headers: { "Retry-After": "120" } }),
  );
  vi.stubGlobal("fetch", request);
  await expect(syncGmail()).rejects.toThrow();
  expect((await syncGmail()).status).toBe("DEFERRED");
  expect(request).toHaveBeenCalledTimes(1);
});
it("OAuth state tek kullanımlı, PKCE ve sadece gmail.readonly; daha geniş scope reddedilir", async () => {
  const grant = await beginGmailConsent(),
    url = new URL(grant.authorizationUrl);
  expect(url.searchParams.get("scope")).toBe(GMAIL_SCOPE);
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  const state = url.searchParams.get("state")!;
  await expect(
    completeGmailConsent("code", "wrong-state", grant.cookie),
  ).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (value: string) =>
      value.includes("/token")
        ? Response.json({
            access_token: "test-access",
            refresh_token: "test-refresh",
            expires_in: 3600,
            scope: GMAIL_SCOPE,
            token_type: "Bearer",
          })
        : Response.json({ emailAddress: "test@example.com" }),
    ),
  );
  await completeGmailConsent("test-code", state, grant.cookie);
  expect(
    (
      await db.mailboxConnection.findUniqueOrThrow({
        where: { id: "personal" },
      })
    ).status,
  ).toBe("AUTHORIZED");
  await expect(
    completeGmailConsent("test-code", state, grant.cookie),
  ).rejects.toThrow();
  await disconnectGmail();
  const broad = await beginGmailConsent();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({
        access_token: "test-access",
        refresh_token: "test-refresh",
        expires_in: 3600,
        scope: "https://www.googleapis.com/auth/gmail.modify",
        token_type: "Bearer",
      }),
    ),
  );
  await expect(
    completeGmailConsent(
      "code",
      new URL(broad.authorizationUrl).searchParams.get("state")!,
      broad.cookie,
    ),
  ).rejects.toThrow();
  expect(
    (
      await db.mailboxConnection.findUniqueOrThrow({
        where: { id: "personal" },
      })
    ).status,
  ).toBe("DISCONNECTED");
});
it("aktif Gmail alımı sırasında filtre veya hesap değiştirilemez", async () => {
  await authorize();
  await db.analysisRun.create({
    data: { id: "gmail-sync-lease", status: "RUNNING", errors: [] },
  });
  await expect(
    saveMailboxSelection({ labelIds: ["INBOX"], senders: [], lookbackDays: 7 }),
  ).rejects.toThrow();
  await expect(disconnectGmail()).rejects.toThrow();
});
it("Gmail beş sayfada durur ve sonraki alım aynı sabit pencerede cursor'dan devam eder", async () => {
  const raw = (await fixture()).toString();
  const sample = await ingestEml(Buffer.from(raw));
  await approveMessage(sample.message.id);
  await authorize();
  let originalQuery = "",
    listCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (value: string) => {
      const url = new URL(value);
      if (url.pathname.endsWith("/messages")) {
        listCalls++;
        const number = Number(
          url.searchParams.get("pageToken")?.replace("p", "") ?? 1,
        );
        if (!originalQuery) originalQuery = url.searchParams.get("q")!;
        expect(url.searchParams.get("q")).toBe(originalQuery);
        return Response.json({
          messages: [{ id: `p${number}` }],
          ...(number < 6 ? { nextPageToken: `p${number + 1}` } : {}),
        });
      }
      const number = Number(url.pathname.split("/").at(-1)!.replace("p", "")),
        id = `p${number}`;
      if (url.searchParams.get("format") === "metadata")
        return Response.json({
          id,
          labelIds: ["Label_123"],
          internalDate: String(Date.now()),
          payload: {
            headers: [{ name: "From", value: "notifications@sahibinden.com" }],
          },
        });
      return Response.json({
        id,
        labelIds: ["Label_123"],
        raw: Buffer.from(
          raw.replace("1234567890", String(1234567890 + number)),
        ).toString("base64url"),
      });
    }),
  );
  const first = await syncGmail();
  expect(first.status).toBe("MORE_PENDING");
  expect(first.inserted).toBe(5);
  expect(listCalls).toBe(5);
  expect(
    (
      await db.mailboxConnection.findUniqueOrThrow({
        where: { id: "personal" },
      })
    ).pageToken,
  ).toBe("p6");
  expect(
    (
      await db.listingSource.findUniqueOrThrow({
        where: { id: "sahibinden-email" },
      })
    ).lastNewCount,
  ).toBe(5);
  const second = await syncGmail();
  expect(second.status).toBe("COMPLETED");
  expect(second.inserted).toBe(1);
  expect(listCalls).toBe(6);
  expect(await db.listing.count()).toBe(7);
  expect(await db.emailDelivery.count()).toBe(6);
  expect(
    (
      await db.mailboxConnection.findUniqueOrThrow({
        where: { id: "personal" },
      })
    ).pageToken,
  ).toBeNull();
});
it("yarıda kalan sayfa yeniden alınır; kalıcı receipt önceki kaydı çoğaltmaz", async () => {
  const raw = (await fixture()).toString();
  const sample = await ingestEml(Buffer.from(raw));
  await approveMessage(sample.message.id);
  await authorize();
  let fail = true;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (value: string) => {
      const url = new URL(value),
        id = url.pathname.split("/").at(-1)!;
      if (url.pathname.endsWith("/messages"))
        return Response.json({ messages: [{ id: "one" }, { id: "two" }] });
      if (id === "two" && fail) return new Response("", { status: 401 });
      if (url.searchParams.get("format") === "metadata")
        return Response.json({
          id,
          labelIds: ["Label_123"],
          internalDate: String(Date.now()),
          payload: {
            headers: [{ name: "From", value: "notifications@sahibinden.com" }],
          },
        });
      return Response.json({
        id,
        labelIds: ["Label_123"],
        raw: Buffer.from(
          raw.replace("1234567890", id === "one" ? "1234567891" : "1234567892"),
        ).toString("base64url"),
      });
    }),
  );
  await expect(syncGmail()).rejects.toThrow();
  expect(await db.emailDelivery.count()).toBe(1);
  expect(await db.listing.count()).toBe(2);
  fail = false;
  expect((await syncGmail()).status).toBe("COMPLETED");
  expect(await db.emailDelivery.count()).toBe(2);
  expect(await db.listing.count()).toBe(3);
  expect(await db.listingPriceHistory.count()).toBe(3);
});
it("süresi biten token salt-okunur kapsamla yenilenir; sırlar DB'ye girmez", async () => {
  await authorize();
  await saveTokens({
    accessToken: "expired-test",
    refreshToken: "test-refresh",
    expiresAt: Date.now() - 1,
    scope: GMAIL_SCOPE,
    accountHash: "a".repeat(64),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (value: string, init?: RequestInit) => {
      if (value.endsWith("/token")) {
        const body = new URLSearchParams(String(init?.body));
        expect(body.get("grant_type")).toBe("refresh_token");
        expect(body.get("refresh_token")).toBe("test-refresh");
        return Response.json({
          access_token: "renewed-test",
          expires_in: 3600,
          scope: GMAIL_SCOPE,
          token_type: "Bearer",
        });
      }
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer renewed-test",
      );
      return Response.json({ messages: [] });
    }),
  );
  expect((await syncGmail()).status).toBe("COMPLETED");
  expect((await readTokens()).accessToken).toBe("renewed-test");
  expect(JSON.stringify(await db.mailboxConnection.findMany())).not.toContain(
    "test-refresh",
  );
});

import { cookies } from "next/headers";
import { z } from "zod";
import { json, HttpError } from "../http";
import { emailStatus } from "./coverage";
import {
  ingestEml,
  approveMessage,
  reprocessMessage,
  resolveIdentityReview,
} from "./ingestion";
import {
  beginGmailConsent,
  gmailLabels,
  mailboxSelectionSchema,
  saveMailboxSelection,
  syncGmail,
  disconnectGmail,
} from "./gmail";
export const OAUTH_COOKIE = "radar_gmail_oauth";
export async function emailGet(path: string[]) {
  if (!path.length) return json(await emailStatus());
  if (path.join("/") === "gmail/labels")
    return json({ labels: await gmailLabels() });
  throw new HttpError(404, "E-posta uç noktası bulunamadı.");
}
export async function emailPost(path: string[], body: unknown) {
  const route = path.join("/");
  if (route === "eml") {
    const input = z
      .object({
        rawBase64: z
          .string()
          .min(1)
          .max(2_666_668)
          .regex(/^[A-Za-z0-9+/]+={0,2}$/),
        permitted: z.literal(true),
      })
      .strict()
      .parse(body);
    const raw = Buffer.from(input.rawBase64, "base64");
    if (raw.toString("base64") !== input.rawBase64)
      throw new HttpError(400, "EML kodlaması geçersiz.");
    return json(await ingestEml(raw), 201);
  }
  if (route === "approve") {
    const input = z
      .object({
        messageId: z.string().min(1),
        realPermittedSample: z.literal(true),
        extractionReviewed: z.literal(true),
      })
      .strict()
      .parse(body);
    return json(await approveMessage(input.messageId));
  }
  if (route === "reprocess")
    return json(
      await reprocessMessage(
        z
          .object({ messageId: z.string().min(1) })
          .strict()
          .parse(body).messageId,
      ),
    );
  if (route === "review") {
    const input = z
      .object({
        reviewId: z.string(),
        action: z.enum(["DISMISS", "CREATE_SEPARATE"]),
      })
      .strict()
      .parse(body);
    return json(await resolveIdentityReview(input.reviewId, input.action));
  }
  if (route === "gmail/connect") {
    z.object({ consent: z.literal(true) })
      .strict()
      .parse(body);
    const grant = await beginGmailConsent();
    const response = json({ authorizationUrl: grant.authorizationUrl });
    response.cookies.set(OAUTH_COOKIE, grant.cookie, {
      httpOnly: true,
      sameSite: "lax",
      secure: grant.secure,
      maxAge: 600,
      path: "/api/email/gmail/callback",
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
  if (route === "gmail/selection") {
    const input = z
      .object({
        selection: mailboxSelectionSchema,
        consentDailyRead: z.literal(true),
      })
      .strict()
      .parse(body);
    await saveMailboxSelection(input.selection);
    return json({ saved: true });
  }
  if (route === "gmail/sync") {
    z.object({}).strict().parse(body);
    return json(await syncGmail());
  }
  if (route === "gmail/disconnect") {
    z.object({ consent: z.literal(true) })
      .strict()
      .parse(body);
    await disconnectGmail();
    const cookie = await cookies();
    cookie.delete(OAUTH_COOKIE);
    return json({ disconnected: true });
  }
  throw new HttpError(404, "E-posta uç noktası bulunamadı.");
}

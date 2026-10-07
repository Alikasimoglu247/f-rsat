import nodemailer from "nodemailer";
import { db } from "./db";
import type { ListingView } from "./listings";
import { money } from "./constants";
export function credentialStatus() {
  return {
    telegram:
      !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID,
    email:
      !!process.env.SMTP_HOST &&
      !!process.env.SMTP_FROM &&
      !!process.env.SMTP_TO &&
      !!process.env.SMTP_USER === !!process.env.SMTP_PASSWORD,
    ai:
      process.env.AI_ENABLED === "true" &&
      !!process.env.AI_API_KEY &&
      !!process.env.AI_MODEL,
    feed:
      !!process.env.AUTHORIZED_FEED_URL && !!process.env.AUTHORIZED_FEED_HOST,
  };
}
export function notificationBody(listing: ListingView) {
  const a = listing.assessment;
  return [
    listing.isDemo ? "[DEMO] Gerçek ilan değildir." : null,
    listing.title,
    `İstenen fiyat: ${money(listing.price)}`,
    a?.medianPrice
      ? `Emsal istenen fiyat aralığı: ${money(a.rangeLow)} – ${money(a.rangeHigh)}`
      : "Emsal aralığı: kanıt yetersiz.",
    `Puan: ${a?.score ?? "Yok"} / Güven: ${a?.confidence ?? "Yetersiz"}`,
    `Doğrulama uyarıları: ${a?.riskFlags.map((flag) => flag.label).join(" ") || "Kayıtlı uyarı yok; hukuki/teknik doğrulama yapılmadı."}`,
    listing.sourceUrl
      ? `Kaynak: ${listing.sourceUrl}`
      : "Doğrudan kaynak URL’si sağlanmamış.",
    "İstenen fiyat analizi; satış fiyatı veya yatırım tavsiyesi değil.",
  ]
    .filter(Boolean)
    .join("\n");
}
export class DeliveryError extends Error {
  constructor(
    message: string,
    public readonly ambiguous = false,
  ) {
    super(message);
  }
}
export async function sendNotification(
  channel: string,
  body: string,
  title: string,
) {
  const credentials = credentialStatus();
  if (channel === "TELEGRAM") {
    if (!credentials.telegram)
      throw new DeliveryError("Telegram kimlik bilgileri yapılandırılmamış.");
    try {
      const response = await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          redirect: "error",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: body.slice(0, 4000),
            disable_web_page_preview: true,
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );
      if (!response.ok)
        throw new DeliveryError(`Telegram HTTP ${response.status}`);
      const result = (await response.json()) as { ok?: boolean };
      if (!result.ok) throw new DeliveryError("Telegram teslimatı reddetti.");
    } catch (error) {
      if (error instanceof DeliveryError) throw error;
      throw new DeliveryError(
        "Telegram teslimat sonucu belirsiz; otomatik tekrar gönderilmeyecek.",
        true,
      );
    }
  } else if (channel === "EMAIL") {
    if (!credentials.email) throw new DeliveryError("SMTP yapılandırılmamış.");
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      requireTLS: process.env.SMTP_SECURE !== "true",
      ...(process.env.SMTP_USER
        ? {
            auth: {
              user: process.env.SMTP_USER,
              pass: process.env.SMTP_PASSWORD,
            },
          }
        : {}),
      connectionTimeout: 15_000,
      socketTimeout: 15_000,
    });
    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM,
        to: process.env.SMTP_TO,
        subject: title,
        text: body,
      });
    } catch {
      throw new DeliveryError(
        "SMTP teslimat sonucu belirsiz; otomatik tekrar gönderilmeyecek.",
        true,
      );
    } finally {
      transporter.close();
    }
  } else throw new DeliveryError("Desteklenmeyen bildirim kanalı.");
}
export async function dispatchNotifications() {
  const settings = await db.appSettings.findUniqueOrThrow({
    where: { id: "personal" },
  });
  const channels = [
    ...(settings.telegramEnabled ? ["TELEGRAM"] : []),
    ...(settings.emailEnabled ? ["EMAIL"] : []),
  ];
  const queued = await db.notification.findMany({
    where: {
      channel: { in: channels },
      status: { in: ["PENDING", "FAILED"] },
      attempts: { lt: 3 },
    },
    take: 100,
  });
  let sent = 0;
  for (const item of queued) {
    const claim = await db.notification.updateMany({
      where: { id: item.id, status: { in: ["PENDING", "FAILED"] } },
      data: { status: "SENDING", attempts: { increment: 1 } },
    });
    if (!claim.count) continue;
    try {
      await sendNotification(item.channel, item.body, item.title);
      await db.notification.update({
        where: { id: item.id },
        data: { status: "SENT", sentAt: new Date(), lastError: null },
      });
      sent++;
    } catch (error) {
      await db.notification.update({
        where: { id: item.id },
        data: {
          status:
            error instanceof DeliveryError && error.ambiguous
              ? "UNKNOWN"
              : "FAILED",
          lastError:
            error instanceof DeliveryError
              ? error.message
              : "Teslimat başarısız.",
        },
      });
    }
  }
  // A worker that died mid-delivery cannot safely retry without risking a duplicate.
  await db.notification.updateMany({
    where: {
      status: "SENDING",
      createdAt: { lt: new Date(Date.now() - 3600_000) },
    },
    data: {
      status: "UNKNOWN",
      lastError:
        "İş kesildi; uzak teslimat doğrulanamadı. Elle kontrol gerekli.",
    },
  });
  return { sent };
}

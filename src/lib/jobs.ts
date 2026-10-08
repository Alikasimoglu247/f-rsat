import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { analyzeAll, importRecords, listingInclude } from "./listings";
import type { ListingView } from "./listings";
import { ensureSources } from "./providers/registry";
import { licensedFeed } from "./providers/adapters";
import type { ProviderAdapter } from "./providers/adapters";
import { dispatchNotifications, notificationBody } from "./notifications";
import { syncGmail } from "./email/gmail";
import { matchesProfile, pilotSummaries } from "./pilots";
import { dateTime } from "./constants";
export const localDay = (now = new Date()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
export async function retry<T>(
  operation: () => Promise<T>,
  attempts = 3,
  pause: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
) {
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      last = error;
      if (attempt + 1 < attempts) await pause(250 * 2 ** attempt);
    }
  }
  throw last;
}
export async function runDaily(
  options: {
    manual?: boolean;
    key?: string;
    providers?: ProviderAdapter[];
  } = {},
) {
  await ensureSources(db);
  const revision = await db.listing.aggregate({
    _max: { updatedAt: true },
    _count: true,
  });
  const preferences = await db.appSettings.findUnique({
    where: { id: "personal" },
  });
  const rules = await db.alert.findMany({
    include: { profile: true },
    orderBy: { id: "asc" },
  });
  const mailbox = await db.mailboxConnection.findUnique({
    where: { id: "personal" },
  });
  const templates = await db.emailTemplate.findMany({
    select: { id: true, status: true },
    orderBy: { id: "asc" },
  });
  const digest = createHash("sha256")
    .update(
      `${revision._count}:${revision._max.updatedAt?.toISOString()}:${JSON.stringify(preferences)}:${JSON.stringify(rules)}:${JSON.stringify({ account: mailbox?.accountHash, labels: mailbox?.labelIds, senders: mailbox?.senders, templates })}`,
    )
    .digest("hex")
    .slice(0, 16);
  const key =
    options.key ??
    `${options.manual ? "manual" : "daily"}:m21:${localDay()}${options.manual ? `:${digest}` : ""}`;
  const claim = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(451808)::text`;
    const existing = await tx.analysisRun.findUnique({ where: { id: key } });
    if (existing?.status === "COMPLETED") return "completed";
    if (
      existing?.status === "RUNNING" &&
      Date.now() - existing.startedAt.getTime() < 5 * 60_000
    )
      return "running";
    await tx.analysisRun.upsert({
      where: { id: key },
      create: { id: key, status: "RUNNING", errors: [] },
      update: {
        status: "RUNNING",
        startedAt: new Date(),
        attempts: { increment: 1 },
        errors: [],
      },
    });
    return "claimed";
  });
  if (claim !== "claimed")
    return {
      id: key,
      status: claim === "completed" ? "ALREADY_COMPLETED" : "RUNNING",
      processed: 0,
    };
  const failures: { source: string; message: string }[] = [];
  let automaticIntake = false;
  try {
    if (
      mailbox?.accountHash &&
      ["AUTHORIZED", "CONNECTED", "ERROR"].includes(mailbox.status) &&
      mailbox.labelIds.length + mailbox.senders.length > 0
    ) {
      try {
        const result = await retry(() => syncGmail());
        automaticIntake =
          result.status === "COMPLETED" || result.status === "MORE_PENDING";
        if (["DEFERRED", "RUNNING", "MORE_PENDING"].includes(result.status))
          failures.push({
            source: "gmail",
            message:
              "Gmail alımı ertelendi veya devam sayfası bekliyor; kısmi veriler analiz edildi.",
          });
      } catch {
        failures.push({
          source: "gmail",
          message:
            "İzinli Gmail kaynağı alınamadı; diğer kaynaklar ve mevcut verilerle analiz devam etti.",
        });
      }
    }
    for (const provider of options.providers ?? [licensedFeed]) {
      if (!provider.authorized()) continue;
      let attempts = 0;
      try {
        const records = await retry(() => {
          attempts++;
          return provider.collect();
        });
        await importRecords(records, provider.sourceId, "FEED");
        await db.sourceSyncLog.create({
          data: {
            sourceId: provider.sourceId,
            status: "SUCCESS",
            attempts,
            message: `${records.length} kayıt işlendi.`,
          },
        });
      } catch {
        const message =
          "Yetkili kaynak senkronizasyonu başarısız; ağ/izin/veri sözleşmesini kontrol edin.";
        failures.push({ source: provider.sourceId, message });
        await db.listingSource.update({
          where: { id: provider.sourceId },
          data: { accessStatus: "ERROR", lastError: message },
        });
        await db.sourceSyncLog.create({
          data: {
            sourceId: provider.sourceId,
            status: "FAILED",
            attempts,
            message,
          },
        });
      }
    }
    const processed = await db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(451809)::text`;
        const count = await analyzeAll(tx);
        const settings = await tx.appSettings.findUniqueOrThrow({
          where: { id: "personal" },
        });
        const alerts = await tx.alert.findMany({
          where: { enabled: true },
          include: { profile: true },
        });
        const opportunities = await tx.listing.findMany({
          where: {
            assessment: { score: { gte: 0 } },
            ...(settings.includeDemoNotifications ? {} : { isDemo: false }),
          },
          include: listingInclude,
        });
        for (const listing of opportunities) {
          const matching = alerts.filter(
            (alert) =>
              (listing.assessment!.score ?? 0) >= alert.minScore &&
              matchesProfile(listing, alert.profile),
          );
          const rules = alerts.length
            ? matching.map((alert) => ({
                id: alert.id,
                minScore: alert.minScore,
              }))
            : [{ id: null, minScore: settings.minScore }];
          for (const rule of rules) {
            if ((listing.assessment!.score ?? 0) < rule.minScore) continue;
            const body = notificationBody(
              JSON.parse(JSON.stringify(listing)) as ListingView,
            );
            const channels = [
              "IN_APP",
              ...(settings.telegramEnabled ? ["TELEGRAM"] : []),
              ...(settings.emailEnabled ? ["EMAIL"] : []),
            ];
            for (const channel of channels) {
              const dedupKey = `${listing.id}:${listing.price.toFixed(2)}:${channel}`;
              await tx.notification.upsert({
                where: { dedupKey },
                create: {
                  dedupKey,
                  listingId: listing.id,
                  alertId: rule.id,
                  title: listing.title,
                  body,
                  channel,
                  status: channel === "IN_APP" ? "AVAILABLE" : "PENDING",
                },
                update: {},
              });
            }
          }
        }
        const best = opportunities
          .filter(
            (listing) =>
              !listing.isDemo &&
              listing.identityStatus === "ACTIVE" &&
              listing.assessment?.confidence !== "INSUFFICIENT" &&
              (listing.assessment?.score ?? 0) >=
                Math.max(70, settings.minScore),
          )
          .sort(
            (a, b) => (b.assessment?.score ?? 0) - (a.assessment?.score ?? 0),
          )
          .slice(0, 10);
        const pilots = await pilotSummaries(tx);
        const reportBody = [
          `FırsatRadar — ${localDay()} (Europe/Istanbul)`,
          "Yalnızca gerçek kayıtlar; istenen fiyat karşılaştırması, doğrulanmış satış değeri değildir.",
          best.length
            ? `${best.length} yeterli kanıtlı fırsat:`
            : "Yeterli kanıt ve puan eşiğini karşılayan gerçek fırsat yok. Eksik verili ilanlar fırsat olarak sunulmadı.",
          ...best.map((listing) =>
            notificationBody(
              JSON.parse(JSON.stringify(listing)) as ListingView,
            ),
          ),
          ...pilots.flatMap((p) => [
            `${p.name}: ${p.totalReal} gerçek ilan; bugün ${p.discoveredToday} yeni; ${p.priceDrops} fiyat düşüşü; ${p.opportunities} yeterli emsalli fırsat.`,
            p.top.length
              ? p.top
                  .map((l) =>
                    notificationBody(
                      JSON.parse(JSON.stringify(l)) as ListingView,
                    ),
                  )
                  .join("\n\n")
              : "Bu pilotta yeterli emsalli gerçek fırsat yok.",
            p.reduced.length
              ? "Fiyat düşüşleri (tek başına fırsat değildir):\n" +
                p.reduced
                  .map(
                    (l) =>
                      `${l.title}: ${l.price.toFixed(2)} TL — ${l.sourceUrl ?? "Kaynak URL yok"}`,
                  )
                  .join("\n")
              : "Takip edilen fiyat düşüşü yok.",
            p.lastSuccessfulIngestion
              ? `Pilotun son gerçek Gmail alımı: ${dateTime(p.lastSuccessfulIngestion)} (Europe/Istanbul)`
              : "Bu pilot için başarılı canlı bildirim alımı doğrulanmadı.",
          ]),
          automaticIntake
            ? "İzinli Gmail taraması bu çalışmada gerçekleşti; şablon ve pilot kapsaması ayrı doğrulanır."
            : "Bu çalışmada başarılı otomatik Gmail alımı doğrulanmadı. Mevcut kayıtlar analiz edildi.",
          failures.length
            ? `${failures.length} kaynakta alım eksik/hatalı; kaynak günlüklerini inceleyin.`
            : "Analiz ve rapor hazırlama tamamlandı.",
        ].join("\n\n");
        await tx.dailyReport.upsert({
          where: { runId: key },
          create: {
            runId: key,
            body: reportBody,
            listingIds: [
              ...new Set(
                [...best, ...pilots.flatMap((p) => p.top)].map((l) => l.id),
              ),
            ],
          },
          update: {
            body: reportBody,
            listingIds: [
              ...new Set(
                [...best, ...pilots.flatMap((p) => p.top)].map((l) => l.id),
              ),
            ],
          },
        });
        await tx.analysisRun.update({
          where: { id: key },
          data: {
            status: failures.length ? "PARTIAL" : "COMPLETED",
            processed: count,
            errors: failures as Prisma.InputJsonValue,
            completedAt: new Date(),
          },
        });
        return count;
      },
      { timeout: 120_000 },
    );
    const delivery = await dispatchNotifications();
    console.info(
      JSON.stringify({
        event: "analysis.completed",
        runId: key,
        processed,
        sourceFailures: failures.length,
        sent: delivery.sent,
      }),
    );
    return {
      id: key,
      status: failures.length ? "PARTIAL" : "COMPLETED",
      processed,
      sourceFailures: failures.length,
      ...delivery,
    };
  } catch (error) {
    await db.analysisRun.update({
      where: { id: key },
      data: {
        status: "FAILED",
        errors: [
          {
            message:
              "Analiz işi başarısız; sunucu/veritabanı durumunu kontrol edin.",
          },
        ],
        completedAt: new Date(),
      },
    });
    console.error(JSON.stringify({ event: "analysis.failed", runId: key }));
    throw error;
  }
}

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { analyzeAll, importRecords, listingInclude } from "./listings";
import type { ListingView } from "./listings";
import { ensureSources } from "./providers/registry";
import { licensedFeed } from "./providers/adapters";
import type { ProviderAdapter } from "./providers/adapters";
import { dispatchNotifications, notificationBody } from "./notifications";
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
  const digest = createHash("sha256")
    .update(
      `${revision._count}:${revision._max.updatedAt?.toISOString()}:${JSON.stringify(preferences)}:${JSON.stringify(rules)}`,
    )
    .digest("hex")
    .slice(0, 16);
  const key =
    options.key ??
    `${options.manual ? "manual" : "daily"}:${localDay()}${options.manual ? `:${digest}` : ""}`;
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
  try {
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
          const matching = alerts.filter((alert) => {
            const p = alert.profile;
            return (
              (listing.assessment!.score ?? 0) >= alert.minScore &&
              (!p.category || listing.category === p.category) &&
              (!p.province || listing.province === p.province) &&
              (!p.district ||
                listing.district.toLocaleLowerCase("tr-TR") ===
                  p.district.toLocaleLowerCase("tr-TR")) &&
              (!p.minPrice || listing.price.gte(p.minPrice)) &&
              (!p.maxPrice || listing.price.lte(p.maxPrice))
            );
          });
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

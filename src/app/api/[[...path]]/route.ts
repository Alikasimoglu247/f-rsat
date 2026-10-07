import { db } from "@/lib/db";
import { browseListings, dashboard } from "@/lib/queries";
import { importRecords, listingInclude } from "@/lib/listings";
import { listingSchema, settingsSchema, profileSchema } from "@/lib/validation";
import { importRequestSchema, parseImport } from "@/lib/imports";
import { ensureSources } from "@/lib/providers/registry";
import { credentialStatus, dispatchNotifications } from "@/lib/notifications";
import { runDaily } from "@/lib/jobs";
import { optionalAiExplanation } from "@/lib/ai";
import type { ListingView } from "@/lib/listings";
import { failure, HttpError, json, readJson } from "@/lib/http";
import { z } from "zod";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path?: string[] }> };
export async function GET(request: Request, context: Context) {
  try {
    const path = (await context.params).path ?? [];
    if (path[0] === "health") {
      await db.$queryRaw`SELECT 1`;
      return json({ status: "ok", database: "connected" });
    }
    if (path[0] === "dashboard") return json(await dashboard());
    if (path[0] === "listings" && path[1]) {
      const listing = await db.listing.findUnique({
        where: { id: path[1] },
        include: {
          ...listingInclude,
          comparableLinks: {
            include: { comparable: { include: listingInclude } },
          },
        },
      });
      if (!listing) throw new HttpError(404, "İlan bulunamadı.");
      return json(listing);
    }
    if (path[0] === "listings")
      return json(
        await browseListings(
          Object.fromEntries(new URL(request.url).searchParams),
        ),
      );
    if (path[0] === "sources")
      return json({
        sources: await db.listingSource.findMany({
          include: {
            logs: { orderBy: { createdAt: "desc" }, take: 5 },
            _count: { select: { listings: true } },
          },
          orderBy: { name: "asc" },
        }),
        imports: await db.importJob.findMany({
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
      });
    if (path[0] === "notifications")
      return json({
        notifications: await db.notification.findMany({
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
        runs: await db.analysisRun.findMany({
          orderBy: { startedAt: "desc" },
          take: 20,
        }),
      });
    if (path[0] === "settings")
      return json({
        settings: await db.appSettings.findUniqueOrThrow({
          where: { id: "personal" },
          select: {
            telegramEnabled: true,
            emailEnabled: true,
            minScore: true,
            includeDemoNotifications: true,
          },
        }),
        credentials: credentialStatus(),
        schedule: process.env.DAILY_CRON ?? "0 9 * * *",
        timezone: "Europe/Istanbul",
        profiles: await db.searchProfile.findMany({
          include: { alerts: true },
          orderBy: { createdAt: "desc" },
        }),
      });
    throw new HttpError(404, "Uç nokta bulunamadı.");
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const path = (await context.params).path ?? [],
      body = await readJson(request);
    if (path[0] === "listings") {
      const input = listingSchema.parse(body);
      await ensureSources(db);
      return json(await importRecords([input], "manual", "MANUAL"), 201);
    }
    if (path[0] === "import") {
      const input = importRequestSchema.parse(body);
      const records = parseImport(input.content, input.format);
      await ensureSources(db);
      return json(
        await importRecords(records, input.format.toLowerCase(), input.format),
        201,
      );
    }
    if (path[0] === "watchlist") {
      const input = z
        .object({ listingId: z.string().min(1), saved: z.boolean() })
        .strict()
        .parse(body);
      if (!(await db.listing.findUnique({ where: { id: input.listingId } })))
        throw new HttpError(404, "İlan bulunamadı.");
      if (input.saved)
        await db.watchlist.upsert({
          where: { listingId: input.listingId },
          create: { listingId: input.listingId },
          update: {},
        });
      else
        await db.watchlist.deleteMany({
          where: { listingId: input.listingId },
        });
      return json({ saved: input.saved });
    }
    if (path[0] === "analyze") {
      z.object({}).strict().parse(body);
      return json(await runDaily({ manual: true }));
    }
    if (path[0] === "settings") {
      const input = settingsSchema.parse(body),
        credentials = credentialStatus();
      if (input.telegramEnabled && !credentials.telegram)
        throw new HttpError(
          400,
          "Önce sunucu ortamında Telegram değişkenlerini tanımlayın.",
        );
      if (input.emailEnabled && !credentials.email)
        throw new HttpError(
          400,
          "Önce sunucu ortamında SMTP değişkenlerini tanımlayın.",
        );
      return json(
        await db.appSettings.upsert({
          where: { id: "personal" },
          create: input,
          update: input,
        }),
      );
    }
    if (path[0] === "profiles") {
      const { minScore, ...profile } = profileSchema.parse(body);
      return json(
        await db.searchProfile.create({
          data: { ...profile, alerts: { create: { minScore } } },
        }),
        201,
      );
    }
    if (path[0] === "notifications" && path[1] === "dispatch") {
      z.object({}).strict().parse(body);
      return json(await dispatchNotifications());
    }
    if (path[0] === "notifications" && path[1])
      return json(
        await db.notification.update({
          where: { id: path[1] },
          data: { readAt: new Date() },
        }),
      );
    if (path[0] === "ai" && path[1]) {
      const listing = await db.listing.findUnique({
        where: { id: path[1] },
        include: listingInclude,
      });
      if (!listing) throw new HttpError(404, "İlan bulunamadı.");
      return json(
        await optionalAiExplanation(
          JSON.parse(JSON.stringify(listing)) as ListingView,
        ),
      );
    }
    throw new HttpError(404, "Uç nokta bulunamadı.");
  } catch (error) {
    return failure(error);
  }
}

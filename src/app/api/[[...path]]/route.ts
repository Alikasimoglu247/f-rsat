import { db } from "@/lib/db";
import { saveBrowserIntake } from "@/lib/browser-intake";
import { browserResearchState,queueBrowserJob,claimBrowserJob,finishBrowserJob,failBrowserJob } from "@/lib/research/browser-jobs";
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
import { newRealListings } from "@/lib/discovery";
import { liveReadiness } from "@/lib/readiness";
import { verifyBodyType, bodyReviewSchema } from "@/lib/vehicle-review";
import { emailGet, emailPost } from "@/lib/email/api";
import { sourceCoverage } from "@/lib/email/coverage";
import { investmentReport } from "@/lib/investment-report";
import { productReport } from "@/lib/product-report";
import {
  exportResearchBundle,
  importResearchBundle,
} from "@/lib/research/transfer";
import {
  requireLocalControl,
  claimResearchTask,
  executeResearchTask,
} from "@/lib/research/control";
import { after } from "next/server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path?: string[] }> };
export async function GET(request: Request, context: Context) {
  try {
    const path = (await context.params).path ?? [];
    if(path.join("/")==="browser-research")return json(await browserResearchState());
    if (path.join("/") === "product") return json(await productReport());
    if (path.join("/") === "research/export")
      return new Response(
        JSON.stringify(await exportResearchBundle(), null, 2),
        {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition":
              'attachment; filename="FIRSATRADAR_GERCEK_VERI.json"',
            "Cache-Control": "no-store",
          },
        },
      );
    if (path[0] === "email") return await emailGet(path.slice(1));
    if (path[0] === "health") {
      await db.$queryRaw`SELECT 1`;
      return json({ status: "ok", database: "connected" });
    }
    if (path[0] === "dashboard") return json(await dashboard());
    if (path.join("/") === "investment") return json(await investmentReport());
    if (path[0] === "readiness") return json(await liveReadiness());
    if (path[0] === "discovery")
      return json(
        await newRealListings(
          Object.fromEntries(new URL(request.url).searchParams),
        ),
      );
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
    if (path[0] === "sources") return json(await sourceCoverage());
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
        reports: await db.dailyReport.findMany({
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
      });
    if (path[0] === "settings")
      return json({
        settings: (await db.appSettings.findUnique({
          where: { id: "personal" },
          select: {
            telegramEnabled: true,
            emailEnabled: true,
            minScore: true,
            includeDemoNotifications: true,
          },
        })) ?? {
          telegramEnabled: false,
          emailEnabled: false,
          minScore: 70,
          includeDemoNotifications: false,
        },
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
      body = await readJson(
        request,
        path[0] === "research" && path[1] === "transfer"
          ? 15_000_000
          : path[0] === "email" && path[1] === "eml"
            ? 2_750_000
            : 2_100_000,
      );
    if (path[0] === "browser-research" || path.join("/") === "browser-intake") {
      // Next's Docker URL uses 0.0.0.0 internally. Validate the public Host
      // against configured origin before passing a normalized request to the guard.
      const configured = new URL(process.env.APP_BASE_URL ?? request.url);
      if (request.headers.get("host") !== configured.host)
        throw new HttpError(403, "Uygulamanın yerel adresini kullanın.");
      requireLocalControl(new Request(new URL(new URL(request.url).pathname, configured.origin), {headers:request.headers}));
      if(path[0]==="browser-intake")return json(await saveBrowserIntake(body),201);
      if(path[1]==="queue"){const v=z.object({url:z.url()}).strict().parse(body);return json(await queueBrowserJob(v.url),202);}
      if(path[1]==="claim"){const v=z.object({id:z.string()}).strict().parse(body);return json(await claimBrowserJob(v.id));}
      if(path[1]==="capture"){const v=z.object({id:z.string(),leaseToken:z.string(),page:z.unknown(),links:z.array(z.url()).max(50).default([])}).strict().parse(body);return json(await finishBrowserJob(v.id,v.leaseToken,v.page,v.links));}
      if(path[1]==="fail"){const v=z.object({id:z.string(),leaseToken:z.string(),reason:z.string().max(400)}).strict().parse(body);return json(await failBrowserJob(v.id,v.leaseToken,v.reason));}
      throw new HttpError(404,"Tarayıcı işlemi bulunamadı.");
    }
    if (path[0] === "research") {
      requireLocalControl(request);
      if (path[1] === "transfer") {
        const input = z
          .object({ bundle: z.unknown(), apply: z.boolean().default(false) })
          .strict()
          .parse(body);
        return json(await importResearchBundle(input.bundle, input.apply));
      }
      if (["start", "reevaluate"].includes(path[1])) {
        z.object({}).strict().parse(body);
        const action = path[1] === "start" ? "RESEARCH" : "REEVALUATE";
        const task = await claimResearchTask(action);
        after(() => executeResearchTask(task.id, action));
        return json({ id: task.id, status: task.status }, 202);
      }
    }
    if (path[0] === "email") return await emailPost(path.slice(1), body);
    if (path[0] === "listings" && path.length === 1) {
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
      if (path[1]) {
        if (!(await db.searchProfile.findUnique({ where: { id: path[1] } })))
          throw new HttpError(404, "Profil bulunamadı.");
        return json(
          await db.$transaction(async (tx) => {
            const saved = await tx.searchProfile.update({
              where: { id: path[1] },
              data: {
                ...profile,
                category: profile.category ?? null,
                province: profile.province ?? null,
                district: profile.district ?? null,
                minPrice: profile.minPrice ?? null,
                maxPrice: profile.maxPrice ?? null,
                transactionType: profile.transactionType ?? null,
              },
            });
            await tx.alert.updateMany({
              where: { profileId: saved.id },
              data: { minScore },
            });
            return saved;
          }),
        );
      }
      return json(
        await db.searchProfile.create({
          data: { ...profile, alerts: { create: { minScore } } },
        }),
        201,
      );
    }
    if (path[0] === "listings" && path[1] && path[2] === "body-type")
      return json(await verifyBodyType(path[1], bodyReviewSchema.parse(body)));
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

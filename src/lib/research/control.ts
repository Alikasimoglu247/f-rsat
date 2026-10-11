import { timingSafeEqual } from "node:crypto";
import { db } from "../db";
import { HttpError } from "../http";
import { analyzeAll } from "../listings";
import { runResearch } from "./loop";
import { ensurePilotProfiles } from "../pilots";
import { ensureSources } from "../providers/registry";

export function requireLocalControl(request: Request) {
  const expected = new URL(process.env.APP_BASE_URL ?? request.url);
  const origin = request.headers.get("origin");
  if (
    !origin ||
    origin !== expected.origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new HttpError(
      403,
      "Bu işlem uygulamanın kendi sayfasından başlatılmalı.",
    );
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(expected.hostname);
  const token = process.env.APP_ACCESS_TOKEN;
  if (
    !token &&
    !["127.0.0.1", "localhost", "[::1]"].includes(new URL(request.url).hostname)
  )
    throw new HttpError(
      403,
      "Yerel olmayan istek için erişim anahtarı gerekli.",
    );
  if (!local && !token)
    throw new HttpError(
      403,
      "Yerel erişim veya yapılandırılmış erişim denetimi gerekli.",
    );
  if (token) {
    const expectedAuth = Buffer.from(
      `Basic ${Buffer.from(`radar:${token}`).toString("base64")}`,
    );
    const supplied = Buffer.from(request.headers.get("authorization") ?? "");
    if (
      supplied.length !== expectedAuth.length ||
      !timingSafeEqual(supplied, expectedAuth)
    )
      throw new HttpError(401, "Kimlik doğrulama gerekli.");
  }
}

export async function claimResearchTask(
  action: "RESEARCH" | "REEVALUATE",
  now = new Date(),
) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(451812)::text`;
    const recent = new Date(now.getTime() - 30 * 60_000);
    const running = await tx.researchRun.findFirst({
      where: { status: "RUNNING", startedAt: { gt: recent } },
    });
    const task = await tx.researchTask.findFirst({
      where: { status: "RUNNING", requestedAt: { gt: recent } },
    });
    if (running || task)
      throw new HttpError(
        409,
        "Bir araştırma veya değerlendirme zaten çalışıyor.",
      );
    const last = await tx.researchTask.findFirst({
      orderBy: { requestedAt: "desc" },
    });
    if (last && now.getTime() - last.requestedAt.getTime() < 60_000)
      throw new HttpError(429, "Yeni işlem için bir dakika bekleyin.");
    await tx.researchTask.updateMany({
      where: { status: "RUNNING" },
      data: {
        status: "INTERRUPTED",
        completedAt: now,
        result: { reason: "Süreç kesildi; tamamlanmış sayılmadı." },
      },
    });
    return tx.researchTask.create({
      data: { action, status: "RUNNING", requestedAt: now, result: {} },
    });
  });
}

export async function executeResearchTask(
  id: string,
  action: "RESEARCH" | "REEVALUATE",
) {
  try {
    await ensureSources(db);
    await ensurePilotProfiles(db);
    const result =
      action === "RESEARCH"
        ? await runResearch({ trigger: "MANUAL" })
        : await db.$transaction(
            async (tx) => {
              await tx.$queryRaw`SELECT pg_advisory_xact_lock(451812)::text`;
              if (
                await tx.researchRun.findFirst({
                  where: {
                    status: "RUNNING",
                    startedAt: { gt: new Date(Date.now() - 30 * 60_000) },
                  },
                })
              )
                throw new HttpError(
                  409,
                  "Kaynak araştırması başladı; değerlendirme ertelendi.",
                );
              // Conservative recomputation: the investment report independently checks
              // dated legal/availability evidence before it exposes any opportunity.
              const processed = await analyzeAll(tx);
              return { status: "COMPLETED", processed, networkResearch: false };
            },
            { timeout: 60_000 },
          );
    await db.researchTask.update({
      where: { id },
      data: {
        status: result.status === "RUNNING" ? "BUSY" : result.status,
        completedAt: new Date(),
        result: JSON.parse(JSON.stringify(result)),
      },
    });
  } catch {
    await db.researchTask.update({
      where: { id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        result: {
          reason:
            "İşlem tamamlanamadı; veritabanı ve kaynak durumunu kontrol edin.",
        },
      },
    });
  }
}

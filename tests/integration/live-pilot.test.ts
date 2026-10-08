import { beforeEach, afterEach, afterAll, it, expect, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { db } from "../../src/lib/db";
import { ensureSources } from "../../src/lib/providers/registry";
import { ensurePilotProfiles, pilotSummaries } from "../../src/lib/pilots";
import { ingestEml, approveMessage } from "../../src/lib/email/ingestion";
import {
  correctEmailFields,
  correctionSchema,
} from "../../src/lib/email/corrections";
import { newRealListings } from "../../src/lib/discovery";
import { listingInclude } from "../../src/lib/listings";
import { runDaily } from "../../src/lib/jobs";
import { liveReadiness } from "../../src/lib/readiness";
import {
  heartbeatScheduler,
  schedulerStatus,
} from "../../src/lib/scheduler-health";
const raw = async () =>
  (
    await readFile("tests/fixtures/emails/sahibinden-synthetic.eml", "utf8")
  ).replaceAll("Kadıköy", "Silivri");
const correction = (messageId: string, fields: Record<string, unknown>) =>
  correctionSchema.parse({
    messageId,
    proposalIndex: 0,
    fields,
    evidenceNote: "Sentetik kaynak belgesi incelendi; canlı doğrulama değildir",
    reviewed: true,
  });
beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "Listing", "ListingSource", "ImportJob", "AnalysisRun", "AppSettings", "SearchProfile", "EmailMessage", "EmailTemplate", "MailboxConnection", "OAuthAttempt", "SchedulerHealth" CASCADE',
  );
  await ensureSources(db);
  await ensurePilotProfiles(db);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("No live service permission in test");
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());
afterAll(() => db.$disconnect());
it("ayrıştırılamayan bildirim etiketle doğru pilota atanır; yerel örnek Gmail sayılmaz", async () => {
  await db.searchProfile.update({
    where: { id: "pilot-silivri" },
    data: {
      mailLabelIds: ["Label_Silivri"],
      mailSenders: ["notifications@sahibinden.com"],
    },
  });
  await db.emailMessage.createMany({
    data: [
      {
        contentHash: "unreadable-selected",
        transport: "GMAIL",
        sender: "notifications@sahibinden.com",
        subject: "test",
        status: "ERROR",
        proposals: [],
        errors: [],
        seenViaGmailAt: new Date(),
        gmailLabelIds: ["Label_Silivri"],
      },
      {
        contentHash: "wrong-label",
        transport: "GMAIL",
        sender: "notifications@sahibinden.com",
        subject: "test",
        status: "ERROR",
        proposals: [],
        errors: [],
        seenViaGmailAt: new Date(),
        gmailLabelIds: ["Other"],
      },
    ],
  });
  await ingestEml(Buffer.from(await raw()), { pilotIds: ["pilot-silivri"] });
  const p = (await pilotSummaries(db)).find((p) => p.id === "pilot-silivri")!;
  expect(p.funnel).toMatchObject({
    gmailNotifications: 1,
    localEmlSamples: 1,
    parsedListings: 1,
    pendingListings: 1,
    savedReal: 0,
    matchedListings: 0,
    unparsedNotifications: 1,
  });
  expect(p.unassignedGmail).toBe(1);
  expect(p.zeroReasons.join(" ")).toContain("ayrıştırılamadı");
  expect(await db.listing.count()).toBe(0);
});
it("eksik alan tamamlaması audit oluşturur; otomatik onay veya yeni şablon uydurmaz", async () => {
  const text = (await raw()).replace("Konum: İstanbul / Silivri\n", "");
  const m = (
    await ingestEml(Buffer.from(text), { pilotIds: ["pilot-silivri"] })
  ).message;
  await expect(approveMessage(m.id)).rejects.toThrow();
  await correctEmailFields(
    correction(m.id, {
      province: "İstanbul",
      district: "Silivri",
      transactionType: "SATILIK",
      neighborhood: "Alibey",
    }),
  );
  expect(await db.emailFieldCorrection.count()).toBe(1);
  expect(await db.listing.count()).toBe(0);
  expect(await db.emailTemplate.count()).toBe(0);
  await approveMessage(m.id);
  expect(await db.listing.count()).toBe(1);
  const p = (await pilotSummaries(db)).find((p) => p.id === "pilot-silivri")!;
  expect(p.funnel).toMatchObject({
    gmailNotifications: 0,
    parsedListings: 1,
    userCompletedListings: 1,
    pendingListings: 0,
    savedReal: 1,
    matchedListings: 1,
    supportedOpportunities: 0,
  });
  const later = await ingestEml(
    Buffer.from(text.replace("1234567890", "1234567891")),
    { pilotIds: ["pilot-silivri"] },
  );
  expect(later.message.status).not.toBe("IMPORTED");
  expect(await db.listing.count()).toBe(1);
});
it("kaydedilmiş ilanın eksik alanları tamamlanır; fiyat, kimlik, gözlem tarihi ve tarihçe korunur", async () => {
  const m = (await ingestEml(Buffer.from(await raw()))).message;
  await approveMessage(m.id);
  const before = await db.listing.findFirstOrThrow({ include: listingInclude });
  await correctEmailFields(
    correction(m.id, {
      transactionType: "SATILIK",
      neighborhood: "Alibey",
      netM2: "100",
      grossM2: "125",
    }),
  );
  const after = await db.listing.findFirstOrThrow({ include: listingInclude });
  expect(after.id).toBe(before.id);
  expect(after.externalId).toBe(before.externalId);
  expect(after.price.toString()).toBe(before.price.toString());
  expect(after.lastObservedAt).toEqual(before.lastObservedAt);
  expect(after.prices).toEqual(before.prices);
  expect(after.property?.netM2?.toString()).toBe("100");
  await expect(
    correctEmailFields(correction(m.id, { price: "1" })),
  ).rejects.toThrow("üzerine yazılamaz");
  await expect(
    correctEmailFields(correction(m.id, { externalId: "999" })),
  ).rejects.toThrow();
  expect(() => correction(m.id, { bodyTypeVerified: true })).toThrow();
  expect(() => correction(m.id, { isDemo: true })).toThrow();
  expect(await db.emailFieldCorrection.count()).toBe(1);
});
it("gerçek puansız ilan yeni ekranda kalır; demo, eksik veri ve yetersiz emsal fırsat olmaz", async () => {
  const m = (await ingestEml(Buffer.from(await raw()))).message;
  await approveMessage(m.id);
  await correctEmailFields(
    correction(m.id, { transactionType: "SATILIK", neighborhood: "Alibey" }),
  );
  await runDaily({ key: "m22-insufficient-report", providers: [] });
  const result = await newRealListings({ pilotId: "pilot-silivri" });
  expect(result.total).toBe(1);
  expect(result.listings[0].opportunity).toBe(false);
  expect(result.listings[0].comparableStatus).toBe("INSUFFICIENT");
  expect(result.listings[0].missingFields).toContain("Net m²");
  const p = (await pilotSummaries(db)).find((p) => p.id === "pilot-silivri")!;
  expect(p.funnel.insufficientListings).toBe(1);
  expect(p.opportunities).toBe(0);
  const report = await db.dailyReport.findUniqueOrThrow({
    where: { runId: "m22-insufficient-report" },
  });
  expect(report.body).toContain("Huni:");
  expect(report.body).toContain("emsal yetersiz");
  expect(report.listingIds).toEqual([]);
  await db.listing.updateMany({ data: { isDemo: true } });
  expect((await newRealListings({})).total).toBe(0);
});
it("son 7 günlük düşüş eski maksimumdan türetilmez; aynı olay tekrar sayılmaz ve rapora yansır", async () => {
  const m = (await ingestEml(Buffer.from(await raw()))).message;
  await approveMessage(m.id);
  await correctEmailFields(correction(m.id, { transactionType: "SATILIK" }));
  const l = await db.listing.findFirstOrThrow();
  await db.listingPriceHistory.deleteMany();
  const now = new Date();
  const ago = (d: number) => new Date(now.getTime() - d * 86400_000);
  await db.listingPriceHistory.createMany({
    data: [
      {
        listingId: l.id,
        price: "5000000",
        observedAt: ago(30),
        provenance: {},
      },
      {
        listingId: l.id,
        price: "4000000",
        observedAt: ago(20),
        provenance: {},
      },
      { listingId: l.id, price: "4000000", observedAt: ago(5), provenance: {} },
      { listingId: l.id, price: "3900000", observedAt: ago(2), provenance: {} },
      { listingId: l.id, price: "3900000", observedAt: ago(1), provenance: {} },
    ],
  });
  const p = (await pilotSummaries(db, now)).find(
    (p) => p.id === "pilot-silivri",
  )!;
  expect(p.priceDrops).toBe(1);
  expect(p.recentDropCount).toBe(1);
  expect(p.recentDrops[0]).toMatchObject({
    previousPrice: "4000000.00",
    newPrice: "3900000.00",
    amount: "100000.00",
    percentage: "2.5000",
    observedAt: ago(2),
  });
  await runDaily({ key: "m22-drop-report", providers: [] });
  expect(
    (
      await db.dailyReport.findUniqueOrThrow({
        where: { runId: "m22-drop-report" },
      })
    ).body,
  ).toContain("4000000.00 TL → 3900000.00 TL");
});
it("hazırlık canlı erişim iddiası yapmaz; scheduler yok, çalışıyor, eski ve durmuş durumlarını ayırır", async () => {
  expect((await schedulerStatus()).status).toBe("NOT_STARTED");
  await heartbeatScheduler("test-instance", "0 9 * * *");
  expect((await schedulerStatus()).status).toBe("RUNNING");
  expect((await schedulerStatus(new Date(Date.now() + 131000))).status).toBe(
    "STALE",
  );
  await db.schedulerHealth.update({
    where: { id: "personal" },
    data: { status: "STOPPED" },
  });
  expect((await schedulerStatus()).status).toBe("STOPPED");
  const status = await liveReadiness();
  expect(status.samples).toMatchObject({
    uploaded: 0,
    gmailMatchedTemplates: 0,
    needsRealExamples: true,
  });
  expect(status.gmail.status).toBe("DISCONNECTED");
  expect(status.channels.every((c) => c.lastVerifiedSentAt === null)).toBe(
    true,
  );
  expect(fetch).not.toHaveBeenCalled();
});

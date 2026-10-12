import { beforeEach, afterAll, it, expect } from "vitest";
import { db } from "../../src/lib/db";
import { ensureSources } from "../../src/lib/providers/registry";
import { importRecords, listingInclude } from "../../src/lib/listings";
import { listingSchema } from "../../src/lib/validation";

beforeEach(async () => {
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "Listing", "ListingSource", "ImportJob", "AnalysisRun", "AppSettings", "SearchProfile", "EmailMessage", "EmailTemplate", "MailboxConnection", "OAuthAttempt" CASCADE',
  );
  await ensureSources(db);
});
afterAll(() => db.$disconnect());
const row = (extra = {}) =>
  listingSchema.parse({
    title: "Kimlik regresyon test ilanı",
    category: "EV",
    province: "İstanbul",
    district: "Kadıköy",
    price: "1234567.89",
    ...extra,
  });

it("aynı özelliklerde farklı kaynaklar ve harici ID'ler ayrı ilanlardır", async () => {
  await importRecords(
    [row({ externalId: "42" }), row({ externalId: "43" })],
    "csv",
    "CSV",
  );
  await importRecords([row({ externalId: "42" })], "json", "JSON");
  expect(await db.listing.count()).toBe(3);
  expect(await db.listingPriceHistory.count()).toBe(3);
});
it("URL tek başına yalnızca aynı kaynakta kimliktir; eski kaynak ve tarihçe korunur", async () => {
  const sourceUrl = "https://example.com/listing/42";
  const a = await importRecords([row({ sourceUrl })], "csv", "CSV");
  await importRecords([row({ sourceUrl })], "json", "JSON");
  const changed = await importRecords(
    [
      row({
        sourceUrl: sourceUrl + "?utm_source=email",
        externalId: "42",
        price: "1100000.25",
      }),
    ],
    "csv",
    "CSV",
  );
  expect(changed.updated).toBe(1);
  const stored = await db.listing.findUniqueOrThrow({
    where: { id: a.ids[0] },
    include: listingInclude,
  });
  expect(stored.sourceId).toBe("csv");
  expect(stored.prices.map((p) => p.price.toFixed(2))).toEqual([
    "1234567.89",
    "1100000.25",
  ]);
  expect(stored.provenance).toHaveProperty("originalSourceUrl", sourceUrl);
  expect(await db.listing.count()).toBe(2);
});
it("ID önceliklidir; farklı ID'nin URL çatışması kaydı değiştirmeden incelemeye gider", async () => {
  const a = await importRecords(
    [
      row({ externalId: "a", sourceUrl: "https://example.com/a" }),
      row({ externalId: "b", sourceUrl: "https://example.com/b" }),
    ],
    "csv",
    "CSV",
  );
  const conflict = row({
    externalId: "a",
    sourceUrl: "https://example.com/b",
    price: "1.00",
  });
  const result = await importRecords([conflict], "csv", "CSV");
  await importRecords([conflict], "csv", "CSV");
  expect(result.reviewed).toBe(1);
  expect(await db.listingReview.count()).toBe(1);
  expect(
    (
      await db.listing.findUniqueOrThrow({ where: { id: a.ids[0] } })
    ).price.toFixed(2),
  ).toBe("1234567.89");
  expect(await db.listingPriceHistory.count()).toBe(2);
});
it("güçlü kimliği olmayan benzer ilanları otomatik birleştirmez", async () => {
  await importRecords([row()], "manual", "MANUAL");
  const result = await importRecords(
    [row({ price: "1000000" })],
    "manual",
    "MANUAL",
  );
  expect(result.reviewed).toBe(1);
  expect(await db.listing.count()).toBe(1);
  expect(await db.listingPriceHistory.count()).toBe(1);
});
it("aynı CSV içinde farklı platformlar aynı harici ID'yi kullanırsa fiyatlarını birleştirmez", async () => {
  await importRecords(
    [row({ externalId: "42", sourceUrl: "https://platform-a.example/42" })],
    "csv",
    "CSV",
  );
  const result = await importRecords(
    [
      row({
        externalId: "42",
        sourceUrl: "https://platform-b.example/42",
        price: "1.00",
      }),
    ],
    "csv",
    "CSV",
  );
  expect(result.reviewed).toBe(1);
  expect((await db.listing.findFirstOrThrow()).price.toFixed(2)).toBe(
    "1234567.89",
  );
  expect(await db.listingPriceHistory.count()).toBe(1);
});
it("eski bir bildirim güncel fiyatı geri almaz; geçmiş gözlem idempotent eklenir", async () => {
  const now = new Date();
  await importRecords([row({ externalId: "42" })], "csv", "CSV", {
    observedAt: now,
  });
  const old = new Date(now.getTime() - 86400_000);
  await importRecords(
    [row({ externalId: "42", price: "1400000.75" })],
    "csv",
    "CSV",
    { observedAt: old },
  );
  await importRecords(
    [row({ externalId: "42", price: "1400000.75" })],
    "csv",
    "CSV",
    { observedAt: old },
  );
  const stored = await db.listing.findFirstOrThrow({ include: listingInclude });
  expect(stored.price.toFixed(2)).toBe("1234567.89");
  expect(stored.lastObservedAt).toEqual(now);
  expect(stored.prices).toHaveLength(2);
});

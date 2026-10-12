import { expect, it } from "vitest";
import { parseAuthorizedFeed } from "../../src/lib/research/authorized-feed";
import { dataQuality } from "../../src/lib/data-quality";
const at = "2026-10-12T06:30:00Z";
const feed = () => ({
  format: "firsatradar-authorized-listings",
  version: 1,
  source: {
    id: "synthetic-office",
    name: "SENTETİK test ofisi",
    documentationUrl: "https://test.example/permission",
    grantReference: "synthetic-grant",
    allowStorage: true,
    allowComparison: true,
    allowReuse: true,
  },
  records: [
    {
      kind: "LISTING",
      listing: {
        title: "SENTETİK 2+1 daire",
        category: "EV",
        province: "İstanbul",
        district: "Silivri",
        neighborhood: "Alibey",
        price: "4400000",
        isDemo: false,
        externalId: "synthetic-1",
        sourceUrl: "https://test.example/listing/1",
        rooms: "2+1",
        propertyType: "Daire",
        netM2: "100",
        grossM2: "120",
      },
      publishedAt: "2026-10-10",
      sourceUpdatedAt: null,
      observedAt: at,
      priceVerifiedAt: at,
      availabilityStatus: "ACTIVE",
      availabilityVerifiedAt: at,
    },
  ],
});
const grant = { sourceId: "synthetic-office", reference: "synthetic-grant" };
it("sunucu izni olmadan veya kullanım hakkı eksikken feed okunamaz", () => {
  expect(() =>
    parseAuthorizedFeed(feed(), { ...grant, reference: "different" }),
  ).toThrow("izni");
  const f = feed();
  f.source.allowComparison = false;
  expect(() => parseAuthorizedFeed(f, grant)).toThrow();
});
it("yetkili JSON sözleşmesi özgün tarih/kimlik ve ayrı fiyat/satış teyidi üretir", () => {
  const a = parseAuthorizedFeed(feed(), grant);
  expect(a.candidates).toHaveLength(1);
  expect(a.candidates[0].observedAt).toBe(at);
  expect(a.checks[0].httpStatus).toBeUndefined();
  expect(dataQuality(a.candidates[0], new Date(at)).eligible).toBe(true);
  expect(parseAuthorizedFeed(feed(), grant)).toEqual(a);
});
it("güncel erişim eski/teyitsiz fiyatı yenilemez; değerleme fiyatı ilan diye alınmaz", () => {
  const f = feed();
  f.records[0].publishedAt = "2024-10-18";
  f.records[0].priceVerifiedAt = null as unknown as string;
  const c = parseAuthorizedFeed(f, grant).candidates[0];
  expect(dataQuality(c, new Date(at)).eligible).toBe(false);
  expect(() =>
    parseAuthorizedFeed(
      { ...feed(), records: [{ ...feed().records[0], kind: "VALUATION" }] },
      grant,
    ),
  ).toThrow();
});

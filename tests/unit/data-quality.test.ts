import { expect, it } from "vitest";
import { dataQuality } from "../../src/lib/data-quality";
import { comparablePrice } from "../../src/lib/analysis";
import {
  research,
  researchCandidateFresh,
  researchDecision,
  type ResearchCandidate,
} from "../../src/lib/investment";
const now = new Date("2026-10-12T06:30:00Z");
const input = {
  externalId: "synthetic-2024",
  sourceUrl: "https://test.example/listing/2024",
  price: "450000.00",
  publishedAt: "2024-10-18",
  pageCheckedAt: now,
  availabilityStatus: "UNKNOWN",
};
const confirmed = () => ({
  ...input,
  priceVerification: "VERIFIED",
  priceVerifiedAt: now,
  availabilityStatus: "ACTIVE",
  availabilityVerifiedAt: now,
  verificationEvidence: {
    price: {
      method: "AUTHORIZED_FEED",
      reference: "https://test.example/feed-contract",
      externalId: input.externalId,
      sourceUrl: input.sourceUrl,
      verifiedAt: now.toISOString(),
      price: input.price,
    },
    availability: {
      method: "AUTHORIZED_FEED",
      reference: "https://test.example/feed-contract",
      externalId: input.externalId,
      sourceUrl: input.sourceUrl,
      verifiedAt: now.toISOString(),
      status: "ACTIVE",
    },
  },
});
it("2024 ilanı HTTP/sayfa kontrolü bugün olsa bile arşiv ve emsale uygun değildir", () => {
  expect(dataQuality(input, now)).toMatchObject({
    status: "HISTORICAL",
    eligible: false,
  });
  const c: ResearchCandidate = {
    ...research.candidates[1],
    publishedAt: "2024-10-18",
    observedAt: now.toISOString(),
    pageCheckedAt: now,
  };
  const data = {
    ...research,
    candidates: [c],
    sources: research.sources.map((s) =>
      s.id === c.sourceId
        ? { ...s, retrievedAt: c.observedAt, checkStatus: "VALID" }
        : s,
    ),
  };
  expect(researchCandidateFresh(c, now, data)).toBe(false);
  expect(researchDecision(c, now, null, data)).toMatchObject({
    priceCurrent: false,
    unitPrice: null,
    verdict: "Yetersiz veri",
  });
});
it("yakın yayın tarihi ve erişim, fiyat/satış teyidi yerine geçmez", () => {
  expect(
    dataQuality({ ...input, publishedAt: "2026-10-11" }, now),
  ).toMatchObject({ status: "PAGE_SEEN_UNCONFIRMED", eligible: false });
});
it("eski ilanda iki ayrı güncel ve kimlikle eşleşen teyit varsa yeniden güncel olabilir", () => {
  expect(dataQuality(confirmed(), now)).toMatchObject({
    status: "CONFIRMED_CURRENT",
    eligible: true,
  });
  expect(
    dataQuality({ ...confirmed(), availabilityVerifiedAt: null }, now).eligible,
  ).toBe(false);
});
it("yanlış fiyat/kimlik, gelecekteki veya eski teyit ve inceleme bekleyen kimlik reddedilir", () => {
  expect(dataQuality({ ...confirmed(), price: "400000" }, now).eligible).toBe(
    false,
  );
  expect(
    dataQuality({ ...confirmed(), externalId: "other" }, now).eligible,
  ).toBe(false);
  expect(
    dataQuality(
      { ...confirmed(), priceVerifiedAt: "2026-10-13T00:00:00Z" },
      now,
    ).eligible,
  ).toBe(false);
  expect(
    dataQuality(
      { ...confirmed(), priceVerifiedAt: "2026-09-01T00:00:00Z" },
      now,
    ).eligible,
  ).toBe(false);
  expect(
    dataQuality({ ...confirmed(), identityReviewRequired: true }, now).eligible,
  ).toBe(false);
});
it("kaldırılan veya erişimi başarısız ilan geçerli fiyat kanıtı değildir", () => {
  expect(
    dataQuality({ ...confirmed(), availabilityStatus: "SOLD" }, now),
  ).toMatchObject({ status: "UNAVAILABLE", eligible: false });
  expect(
    dataQuality({ ...confirmed(), pageStatus: "ACCESS_BLOCKED" }, now).eligible,
  ).toBe(false);
});
it("teyitsiz kayıt doğrudan fiyat emsali yapılamaz", () => {
  const e = {
    id: "synthetic",
    title: "Sentetik",
    category: "ARSA" as const,
    province: "İstanbul",
    district: "Silivri",
    price: "440000",
    isDemo: false,
    lastObservedAt: now,
    quality: { eligible: false },
  };
  expect(comparablePrice(e, { ...e, id: "other" }, now)).toBeNull();
});

import { expect, it } from "vitest";
import { research, supportedFact } from "../../src/lib/investment";
import { mergeResearch, researchChanges } from "../../src/lib/research/store";
import type { AcquisitionResult } from "../../src/lib/research/types";

const now = new Date("2026-10-09T21:05:00Z");
const empty = (): AcquisitionResult => ({
  sources: [],
  facts: [],
  candidates: [],
  checks: [],
  discoveries: [],
});
it("resmî duyuru URL'si değişince eski kaynağı ve yinelenen fact ID'sini yeni duyuruyla değiştirir", () => {
  const before = structuredClone(research);
  const original = before.sources.find((item) => item.id === "policy")!;
  const updated = {
    ...original,
    url: "https://www.tcmb.gov.tr/new-release",
    retrievedAt: now.toISOString(),
    checkStatus: "VALID",
  };
  const result = mergeResearch(
    before,
    {
      ...empty(),
      sources: [updated],
      facts: [
        {
          ...before.facts.find((item) => item.id === "policy-rate")!,
          value: 40,
          period: "2026-10-09",
        },
      ],
      checks: [
        {
          url: original.url,
          status: "UNSUPPORTED",
          checkedAt: now.toISOString(),
        },
      ],
    },
    now,
  );
  expect(result.sources.filter((item) => item.id === "policy")).toHaveLength(1);
  expect(result.facts.filter((item) => item.id === "policy-rate")).toHaveLength(
    1,
  );
  expect(supportedFact("policy-rate", now, result)?.value).toBe(40);
  expect(result.sources.find((item) => item.id === "policy")?.url).toBe(
    updated.url,
  );
  expect(before.sources.find((item) => item.id === "policy")?.url).toBe(
    original.url,
  );
});
it("kaynak başarısızlığı önceki gözlemi mutasyona uğratmaz ve tek geçersizleştirme olayı oluşturur", () => {
  const before = structuredClone(research);
  const source = before.sources.find((item) => item.id === "genc-300")!;
  const failed = mergeResearch(
    before,
    {
      ...empty(),
      checks: [
        { url: source.url, status: "FAILED", checkedAt: now.toISOString() },
      ],
    },
    now,
  );
  expect(
    before.sources.find((item) => item.id === source.id)?.checkStatus,
  ).toBeUndefined();
  expect(
    researchChanges(before, failed, now).filter(
      (item) => item.kind === "SOURCE_INVALIDATED",
    ),
  ).toHaveLength(1);
  const second = mergeResearch(
    failed,
    {
      ...empty(),
      checks: [
        { url: source.url, status: "FAILED", checkedAt: now.toISOString() },
      ],
    },
    now,
  );
  expect(
    researchChanges(failed, second, now).filter(
      (item) => item.kind === "SOURCE_INVALIDATED",
    ),
  ).toHaveLength(0);
});
it("fiyatın kaybolmasını fiyat düşüşü diye kaydetmez", () => {
  const before = structuredClone(research);
  const candidate = before.candidates.find((item) => item.id === "genc-300")!;
  const next = mergeResearch(
    before,
    {
      ...empty(),
      sources: [
        {
          ...before.sources.find((item) => item.id === candidate.sourceId)!,
          retrievedAt: now.toISOString(),
          checkStatus: "VALID",
        },
      ],
      candidates: [
        { ...candidate, price: null, observedAt: now.toISOString() },
      ],
    },
    now,
  );
  const changes = researchChanges(before, next, now);
  expect(changes.some((item) => item.kind === "PRICE_CHANGED")).toBe(false);
  expect(changes.some((item) => item.kind === "CANDIDATE_CHANGED")).toBe(true);
});

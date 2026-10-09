import { describe, expect, it } from "vitest";
import type { Assessment } from "../../src/lib/analysis";
import {
  candidateLegalVerified,
  research,
  researchDecision,
  sourceFresh,
  supportedFact,
  type ResearchCandidate,
  type ResearchEvidenceField,
  type ResearchSnapshot,
} from "../../src/lib/investment";
import { researchListingInput } from "../../src/lib/research-import";

// These controlled snapshots test revisions; they are not live market observations.
const now = new Date("2026-10-09T21:05:00Z");
const data = () => structuredClone(research);
const candidateById = (snapshot: ResearchSnapshot, id = "genc-300") =>
  snapshot.candidates.find((candidate) => candidate.id === id)!;

it("yeni aynı segment adayı alternatif gerekçesini değiştirir; belge eksikliği fırsata dönüşmez", () => {
  const snapshot = data();
  const subject = candidateById(snapshot);
  const before = researchDecision(subject, now, null, snapshot);
  const url = "https://example.com/synthetic-alternative";
  snapshot.sources.push({
    ...snapshot.sources.find((item) => item.id === subject.sourceId)!,
    id: "synthetic-alt",
    url,
    retrievedAt: now.toISOString(),
    checkStatus: "VALID",
  });
  snapshot.facts.push({
    id: "synthetic-alt-offer",
    sourceId: "synthetic-alt",
    label: "Sentetik alternatif fiyat testi",
    value: null,
    unit: "",
    period: "2026-10",
    scope: "Değirmenköy",
  });
  snapshot.candidates.push({
    ...subject,
    id: "synthetic-alt",
    sourceId: "synthetic-alt",
    sourceUrl: url,
    externalId: "synthetic-alt",
    title: "Sentetik alternatif",
    price: "500000",
    sizeM2: "365",
    observedAt: now.toISOString(),
    factIds: ["synthetic-alt-offer"],
  });
  const after = researchDecision(subject, now, null, snapshot);
  expect(after.alternatives).not.toBe(before.alternatives);
  expect(after.alternatives).toContain(
    "Sentetik alternatif (500000 TL, 365 m²)",
  );
  expect(after.factIds).toContain("synthetic-alt-offer");
  expect(after.verdict).toBe("Yetersiz veri");
  expect(after.assessment).toBeNull();
});

function verifiedDocument(
  snapshot: ResearchSnapshot,
  candidate: ResearchCandidate,
  field: ResearchEvidenceField,
) {
  const id = `synthetic-document-${field}`;
  if (
    !snapshot.sources.some(
      (source) => source.id === "synthetic-cadastral-office",
    )
  )
    snapshot.sources.push({
      id: "synthetic-cadastral-office",
      name: "Sentetik birim testi belgesi",
      url: "https://example.com/synthetic-unit-test-document",
      retrievedAt: now.toISOString(),
      kind: "OFFICIAL",
      validForDays: 1,
      sha256: "b".repeat(64),
      usageNote: "Yalnızca sentetik test; gerçek belge değildir.",
      checkStatus: "VALID",
    });
  snapshot.facts.push({
    id,
    sourceId: "synthetic-cadastral-office",
    label: "Sentetik aday ve alan eşleşmesi",
    value: null,
    unit: null,
    period: "2026-10-09",
    scope: candidate.id,
    subjectId: candidate.id,
    field,
    text: candidate[field as keyof ResearchCandidate] as string,
  });
  candidate.evidence ??= {};
  candidate.evidence[field] = [id];
  candidate.factIds.push(id);
}

describe("tekrar araştırma ile kanıta bağlı karar revizyonu", () => {
  it("dinamik fiyat ve risk değişimini kullanır; eski JSON'a bağlı kalıp fırsat üretmez", () => {
    const first = data();
    const before = researchDecision(
      candidateById(first, "genc-farm250"),
      now,
      null,
      first,
    );
    const second = data();
    const candidate = candidateById(second, "genc-farm250");
    candidate.price = "270000";
    candidate.sharedOwnership = "Müstakil";
    candidate.riskSignals = [];
    candidate.limitations = [
      "Sentetik ikinci gözlem: güncel tapu belgesi henüz yok.",
    ];
    const after = researchDecision(candidate, now, null, second);
    expect(before.verdict).toBe("Riskli");
    expect(after).toMatchObject({
      price: "270000",
      unitPrice: "1080.00",
      verdict: "Yetersiz veri",
      priceCurrent: true,
    });
    expect(after.whyCould[0].text).toContain("270000 TL");
    expect(
      after.whyNot.some((reason) =>
        reason.text.includes("Hisseli tapu beyanı"),
      ),
    ).toBe(false);
    expect(after.missing).toContain("Tapu/pay ve takyidat belgeleri");
    expect(researchListingInput(candidate, now, second)?.price).toBe("270000");
  });

  it("başarısız yeni kontrolde eski fiyatı tarihle saklar ancak puanını ve eski risk kanıtını kullanmaz", () => {
    const snapshot = data();
    const candidate = candidateById(snapshot, "genc-farm250");
    snapshot.sources.find(
      (source) => source.id === candidate.sourceId,
    )!.checkStatus = "BLOCKED";
    const fictitiousHighScore: Assessment = {
      medianPrice: "1000000",
      rangeLow: "900000",
      rangeHigh: "1100000",
      relativeDifference: "-50",
      priceChange: null,
      sampleCount: 8,
      confidence: "HIGH",
      score: 95,
      riskFlags: [],
      explanation: "Sentetik test puanı",
      comparables: [],
    };
    const result = researchDecision(
      candidate,
      now,
      fictitiousHighScore,
      snapshot,
    );
    expect(result).toMatchObject({
      price: "425000",
      priceCurrent: false,
      unitPrice: null,
      verdict: "Yetersiz veri",
      assessment: null,
    });
    expect(result.whyCould).toHaveLength(0);
    expect(result.whyNot.some((reason) => reason.kind === "PUBLISHER")).toBe(
      false,
    );
    expect(result.features).toHaveLength(0);
    expect(researchListingInput(candidate, now, snapshot)).toBeNull();
    expect(supportedFact(candidate.factIds[0], now, snapshot)).toBeNull();
  });

  it("yeni politika faizini gerekçeye yansıtır; farklı dönem enflasyonunu konut fiyatıyla karıştırmaz", () => {
    const snapshot = data();
    snapshot.facts.find((fact) => fact.id === "policy-rate")!.value = 42;
    snapshot.facts.find((fact) => fact.id === "housing-istanbul")!.period =
      "2026-09";
    const decision = researchDecision(
      candidateById(snapshot),
      now,
      null,
      snapshot,
    );
    expect(
      decision.whyNot.some((reason) =>
        reason.text.includes("politika faizi %42"),
      ),
    ).toBe(true);
    const housingReason = decision.whyNot.find((reason) =>
      reason.evidenceIds.includes("housing-istanbul"),
    )!;
    expect(housingReason.evidenceIds).toContain("cpi-september");
    expect(housingReason.evidenceIds).not.toContain("cpi-august");
    expect(housingReason.text).toContain("2026-09");
    expect(decision.factIds).toContain("cpi-september");
  });

  it("yayıncıdaki dolu hukuk alanlarını ve ilçeye ait resmî raporu parsel belgesi saymaz", () => {
    const snapshot = data();
    const candidate = candidateById(snapshot);
    Object.assign(candidate, {
      classification: "ARSA",
      zoning: "Konut",
      sharedOwnership: "Müstakil",
      roadAccess: "Yasal yola cephe",
      legalStatus: "Takyidat yok",
      evidence: { zoning: ["mimarsinan-plan"], roadAccess: ["genc-300-offer"] },
    });
    expect(candidateLegalVerified(candidate, now, snapshot)).toBe(false);
    const imported = researchListingInput(candidate, now, snapshot)!;
    expect(imported).toMatchObject({
      zoning: undefined,
      roadAccess: undefined,
      classification: undefined,
      sharedOwnership: undefined,
      legalStatus: undefined,
    });
    expect(researchDecision(candidate, now, null, snapshot).missing).toContain(
      "Belgeli yasal yol erişimi",
    );
  });

  it("yalnızca bu aday/alan/değerle eşleşen taze resmî kanıt eksiklerini azaltır", () => {
    const snapshot = data();
    const candidate = candidateById(snapshot);
    Object.assign(candidate, {
      classification: "ARSA",
      zoning: "Konut",
      sharedOwnership: "Müstakil",
      roadAccess: "Yasal yola cephe",
      legalStatus: "Takyidat yok",
    });
    for (const field of [
      "classification",
      "zoning",
      "sharedOwnership",
      "roadAccess",
      "parcelNumber",
      "legalStatus",
    ] as const)
      verifiedDocument(snapshot, candidate, field);
    expect(candidateLegalVerified(candidate, now, snapshot)).toBe(true);
    const result = researchDecision(candidate, now, null, snapshot);
    expect(result.missing).not.toContain("Güncel resmî imar ve arazi sınıfı");
    expect(result.missing).not.toContain("Tapu/pay ve takyidat belgeleri");
    expect(result.missing).toContain("Satış süresi ve likidite kanıtı");
    expect(result.verdict).toBe("Yetersiz veri");
    expect(researchListingInput(candidate, now, snapshot)?.zoning).toBe(
      "Konut",
    );
    snapshot.facts.find(
      (fact) => fact.id === "synthetic-document-zoning",
    )!.subjectId = "other-parcel";
    expect(candidateLegalVerified(candidate, now, snapshot)).toBe(false);
    snapshot.facts.find(
      (fact) => fact.id === "synthetic-document-zoning",
    )!.subjectId = candidate.id;
    snapshot.sources.find(
      (source) => source.id === "synthetic-cadastral-office",
    )!.checkStatus = "NOT_FOUND";
    expect(candidateLegalVerified(candidate, now, snapshot)).toBe(false);
    expect(
      researchListingInput(candidate, now, snapshot)?.zoning,
    ).toBeUndefined();
  });

  it("belirsiz harici ilan numarası yerine URL'yi korur ve geçersiz fiyatı içe aktarmaz", () => {
    const snapshot = data();
    const candidate = candidateById(snapshot);
    candidate.externalReferenceConflict = true;
    expect(
      researchListingInput(candidate, now, snapshot)?.externalId,
    ).toBeUndefined();
    candidate.price = "0";
    expect(researchListingInput(candidate, now, snapshot)).toBeNull();
    expect(researchDecision(candidate, now, null, snapshot).price).toBeNull();
  });

  it("kaynakta eski SHA ve yeni başarısız kontrol olsa da taze saymaz; sonsuz süre kabul etmez", () => {
    const source = data().sources[0];
    expect(sourceFresh({ ...source, checkStatus: "UNCHANGED" }, now)).toBe(
      true,
    );
    expect(sourceFresh({ ...source, checkStatus: "CAPTCHA" }, now)).toBe(false);
    expect(sourceFresh({ ...source, validForDays: Infinity }, now)).toBe(false);
  });

  it("sayfa yeniden okunmuş olsa bile süresi biten veya yerini yeni kanıta bırakan bilgiyi kullanmaz", () => {
    const snapshot = data();
    const policy = snapshot.facts.find((fact) => fact.id === "policy-rate")!;
    policy.validUntil = "2026-10-09T21:00:00Z";
    expect(supportedFact(policy.id, now, snapshot)).toBeNull();
    expect(
      researchDecision(
        candidateById(snapshot),
        now,
        null,
        snapshot,
      ).whyNot.some((reason) => reason.evidenceIds.includes(policy.id)),
    ).toBe(false);
    policy.validUntil = "2026-10-10T21:00:00Z";
    policy.superseded = true;
    expect(supportedFact(policy.id, now, snapshot)).toBeNull();
    policy.superseded = false;
    expect(supportedFact(policy.id, now, snapshot)?.value).toBe(37);
  });
});

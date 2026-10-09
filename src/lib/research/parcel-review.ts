import { createHash } from "node:crypto";
import { researchCandidateFresh, type ResearchSnapshot } from "../investment";
import { canonicalUrl } from "../listings";

/** Same parcel/area can be a repost or separate shares; neither is assumed. */
export function potentialParcelGroups(snapshot: ResearchSnapshot, now: Date) {
  const groups = new Map<string, ResearchSnapshot["candidates"]>();
  for (const candidate of snapshot.candidates) {
    if (
      !["ARSA", "TARLA"].includes(candidate.category) ||
      !/^\d+\/\d+$/.test(candidate.parcelNumber ?? "") ||
      !candidate.sizeM2 ||
      !researchCandidateFresh(candidate, now, snapshot)
    )
      continue;
    const key = [
      candidate.province,
      candidate.district,
      candidate.neighborhood,
      candidate.category,
      candidate.parcelNumber,
      candidate.sizeM2,
    ]
      .map((value) => value!.normalize("NFC").trim().toLocaleLowerCase("tr-TR"))
      .join("|");
    const group = groups.get(key) ?? [];
    if (
      !group.some(
        (item) =>
          canonicalUrl(item.sourceUrl) === canonicalUrl(candidate.sourceUrl),
      )
    )
      group.push(candidate);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([key, candidates]) => ({
      candidates,
      dedupKey: createHash("sha256")
        .update(
          `parcel-review:${key}:${candidates
            .map((item) => canonicalUrl(item.sourceUrl))
            .sort()
            .join("|")}`,
        )
        .digest("hex"),
      reason: `${candidates[0].parcelNumber} ada/parsel ve ${candidates[0].sizeM2} m² beyanı birden fazla ilan URL'sinde yer alıyor. Yeniden yayın veya ayrı paylar olabilir; bağımsız taşınmazlar olduğu doğrulanmadı, otomatik birleşme ve bağımsız emsal sayımı yapılmadı.`,
    }));
}

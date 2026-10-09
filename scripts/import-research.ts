import "dotenv/config";
import { db } from "../src/lib/db";
import { analyzeAll, importRecords } from "../src/lib/listings";
import { research } from "../src/lib/investment";
import { researchListingInput } from "../src/lib/research-import";

// No network, messages or synthetic prices. Import only dated, cited public observations.
// Re-running preserves source identity and does not invent new price observations.
try {
  const results = [];
  for (const candidate of research.candidates) {
    const record = researchListingInput(candidate);
    if (!record) continue;
    const source = research.sources.find(
      (item) => item.id === candidate.sourceId,
    )!;
    const sourceId = candidate.id.startsWith("genc-")
      ? "research-genccity"
      : "research-akgun";
    await db.listingSource.upsert({
      where: { id: sourceId },
      update: {},
      create: {
        id: sourceId,
        name:
          sourceId === "research-genccity"
            ? "Genç City — kişisel araştırma"
            : "Akgün Gayrimenkul — kişisel araştırma",
        method: "PUBLIC_RESEARCH",
        accessStatus: "AVAILABLE",
        categories: ["ARSA", "TARLA"],
        regions: ["İstanbul / Silivri"],
        authorization:
          "Tekil halka açık sayfalardan sınırlı kişisel araştırma; sürekli veri akışı veya ticari yeniden kullanım izni doğrulanmadı.",
      },
    });
    const result = await importRecords([record], sourceId, "PUBLIC_RESEARCH", {
      observedAt: new Date(candidate.observedAt),
      provenance: {
        researchCandidateId: candidate.id,
        sourceSha256: source.sha256,
        publishedAt: candidate.publishedAt,
        availabilityVerified: false,
        evidenceStatus: "PUBLISHER_CLAIM",
        zoningVerified: false,
        externalReferenceConflict: candidate.id === "akgun-3653",
      },
    });
    results.push({
      candidate: candidate.id,
      inserted: result.inserted,
      updated: result.updated,
      duplicates: result.duplicates,
      reviewed: result.reviewed,
    });
  }
  await db.$transaction((tx) => analyzeAll(tx), { timeout: 60_000 });
  console.log(
    JSON.stringify({
      results,
      pricedResearchCandidates: results.length,
      unavailablePriceCandidates: research.candidates.filter(
        (item) => item.price == null,
      ).length,
    }),
  );
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : "Araştırma içe aktarımı başarısız.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}

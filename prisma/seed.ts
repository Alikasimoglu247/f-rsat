import "dotenv/config";
import { Prisma } from "@prisma/client";
import { db } from "../src/lib/db";
import { ensureSources } from "../src/lib/providers/registry";
import { analyzeAll, importRecords } from "../src/lib/listings";
import { demoListings } from "./demo";
import { ensurePilotProfiles } from "../src/lib/pilots";
try {
  await ensureSources(db);
  await ensurePilotProfiles(db);
  const result = await importRecords(demoListings(), "demo", "SEED");
  const originals = await db.listing.findMany({
    where: {
      isDemo: true,
      externalId: {
        in: ["demo-ev-0", "demo-araba-0", "demo-arsa-0", "demo-tarla-0"],
      },
    },
    include: { prices: true },
  });
  for (const listing of originals) {
    if (listing.prices.length > 1) continue;
    const previous = listing.price.mul("1.12").toFixed(2);
    await db.listingPriceHistory.create({
      data: {
        listingId: listing.id,
        price: previous,
        observedAt: new Date(Date.now() - 7 * 86400_000),
        provenance: {
          method: "DEMO",
          isDemo: true,
          verification: "FICTIONAL_OBSERVATION",
        },
      },
    });
    await db.listingPriceHistory.create({
      data: {
        listingId: listing.id,
        price: listing.price.mul("1.05").toFixed(2),
        observedAt: new Date(Date.now() - 3 * 86400_000),
        provenance: {
          method: "DEMO",
          isDemo: true,
          verification: "FICTIONAL_OBSERVATION",
        },
      },
    });
  }
  await db.$transaction((tx) => analyzeAll(tx), { timeout: 120_000 });
  console.info(
    JSON.stringify({
      event: "seed.completed",
      ...result,
      notice: "Tüm seed ilanları açıkça DEMO olarak etiketlidir.",
    }),
  );
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message.replace(
          /(postgres(?:ql)?:\/\/)[^@\s]+@/g,
          "$1[redacted]@",
        )
      : "Seed başarısız.",
  );
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
void Prisma;

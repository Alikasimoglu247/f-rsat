import { db } from "../../src/lib/db";
import type { Prisma } from "@prisma/client";
import type { ResearchCandidate } from "../../src/lib/investment";
// Synthetic confirmations only. Never used by application imports or real DB.
export function syntheticConfirmation(
  c: { externalId?: string | null; sourceUrl?: string | null; price: unknown },
  at = new Date(),
) {
  const proof = {
    method: "SELLER_CONFIRMATION",
    reference: "https://test.example/synthetic-confirmation",
    externalId: c.externalId,
    sourceUrl: c.sourceUrl,
    verifiedAt: at.toISOString(),
  };
  return {
    pageCheckedAt: at.toISOString(),
    priceVerification: "VERIFIED",
    priceVerifiedAt: at.toISOString(),
    availabilityStatus: "ACTIVE",
    availabilityVerifiedAt: at.toISOString(),
    verificationEvidence: {
      price: { ...proof, price: String(c.price) },
      availability: { ...proof, status: "ACTIVE" },
    },
  };
}
export function confirmCandidate(c: ResearchCandidate, at: Date) {
  Object.assign(c, syntheticConfirmation(c, at));
}
export async function confirmTestRows(where: Prisma.ListingWhereInput) {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith("_test"))
    throw new Error("Synthetic confirmations require guarded test DB");
  const at = new Date();
  for (const row of await db.listing.findMany({
    where: { ...where, isDemo: false },
  })) {
    const sourceUrl =
        row.sourceUrl ?? `https://test.example/synthetic/${row.id}`,
      externalId = row.externalId ?? row.id;
    const fields = syntheticConfirmation({ ...row, sourceUrl, externalId }, at);
    await db.listing.update({
      where: { id: row.id },
      data: {
        ...fields,
        sourceUrl,
        externalId,
        publishedAt: new Date(at.getTime() - 86400_000),
      },
    });
  }
}

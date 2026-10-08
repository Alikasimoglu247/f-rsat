import { z } from "zod";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { listingInclude } from "./listings";
import { categoryKeys, provinces } from "./constants";
import { priceSchema } from "./validation";
import { mailboxHealth } from "./email/coverage";
import { pilotSummaries } from "./pilots";
export const filtersSchema = z
  .object({
    q: z.string().max(100).optional(),
    category: z.enum(categoryKeys).optional(),
    province: z.enum(provinces).optional(),
    district: z.string().max(80).optional(),
    minPrice: priceSchema.optional(),
    maxPrice: priceSchema.optional(),
    demo: z.enum(["all", "demo", "real"]).default("all"),
    watch: z.enum(["true", "false"]).optional(),
    sort: z.enum(["score", "price", "recent"]).default("score"),
  })
  .refine(
    (v) =>
      !v.minPrice ||
      !v.maxPrice ||
      new Prisma.Decimal(v.minPrice).lte(v.maxPrice),
    "Alt fiyat üst fiyattan büyük olamaz.",
  );
export async function browseListings(params: Record<string, string>) {
  const f = filtersSchema.parse(
    Object.fromEntries(Object.entries(params).filter(([, v]) => v !== "")),
  );
  const where: Prisma.ListingWhereInput = {
    ...(f.q ? { title: { contains: f.q, mode: "insensitive" } } : {}),
    ...(f.category ? { category: f.category } : {}),
    ...(f.province ? { province: f.province } : {}),
    ...(f.district
      ? { district: { equals: f.district, mode: "insensitive" } }
      : {}),
    ...(f.minPrice || f.maxPrice
      ? {
          price: {
            ...(f.minPrice ? { gte: f.minPrice } : {}),
            ...(f.maxPrice ? { lte: f.maxPrice } : {}),
          },
        }
      : {}),
    ...(f.demo === "all" ? {} : { isDemo: f.demo === "demo" }),
    ...(f.watch === "true" ? { watch: { isNot: null } } : {}),
  };
  const orderBy: Prisma.ListingOrderByWithRelationInput[] =
    f.sort === "price"
      ? [{ price: "asc" }]
      : f.sort === "recent"
        ? [{ createdAt: "desc" }]
        : [
            { assessment: { score: { sort: "desc", nulls: "last" } } },
            { createdAt: "desc" },
          ];
  const [listings, total] = await Promise.all([
    db.listing.findMany({ where, include: listingInclude, orderBy, take: 500 }),
    db.listing.count({ where }),
  ]);
  return { listings, total, limit: 500 };
}
export async function dashboard() {
  const [
    total,
    real,
    demo,
    newListings,
    reductions,
    highConfidence,
    sources,
    top,
    lastRun,
    categoryCounts,
    emailHealth,
    pilots,
  ] = await Promise.all([
    db.listing.count(),
    db.listing.count({ where: { isDemo: false } }),
    db.listing.count({ where: { isDemo: true } }),
    db.listing.count({
      where: { createdAt: { gte: new Date(Date.now() - 86400_000) } },
    }),
    db.opportunityAssessment.count({ where: { priceChange: { lt: 0 } } }),
    db.opportunityAssessment.count({
      where: { confidence: "HIGH", score: { gte: 70 } },
    }),
    db.listingSource.findMany({ orderBy: { name: "asc" } }),
    Promise.all(
      categoryKeys.map((category) =>
        db.listing.findFirst({
          where: { category },
          include: listingInclude,
          orderBy: [{ assessment: { score: { sort: "desc", nulls: "last" } } }],
        }),
      ),
    ),
    db.analysisRun.findFirst({
      where: { id: { not: "gmail-sync-lease" } },
      orderBy: { startedAt: "desc" },
    }),
    db.listing.groupBy({ by: ["category"], _count: true }),
    mailboxHealth(),
    pilotSummaries(db),
  ]);
  return {
    total,
    pilots,
    real,
    demo,
    newListings,
    reductions,
    highConfidence,
    sources: sources.map((source) =>
      source.accessStatus === "CONNECTED" &&
      ["sahibinden-email", "arabam-email"].includes(source.id) &&
      emailHealth.status !== "CONNECTED"
        ? { ...source, accessStatus: emailHealth.status }
        : source,
    ),
    top: top.filter((item) => item !== null),
    lastRun,
    categoryCounts: categoryCounts.map((item) => ({
      category: item.category,
      count: item._count,
    })),
  };
}

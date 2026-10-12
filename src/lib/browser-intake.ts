import { z } from "zod";
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { listingSchema } from "./validation";
import { canonicalUrl, saveRecord } from "./listings";
import { HttpError } from "./http";

const timestamp = z.iso.datetime({ offset: true }).refine(
  v => new Date(v).getTime() <= Date.now() + 300000, "Gelecek gözlem zamanı kabul edilmez.",
);
export const browserIntakeSchema = z.object({
  record: listingSchema,
  observedAt: timestamp,
  sourceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  sourceDateKind: z.enum(["PUBLISHED", "UPDATED", "UNSPECIFIED"]).default("UNSPECIFIED"),
  authorization: z.enum(["OWN_DATA", "WRITTEN_PERMISSION", "LICENSED_EXPORT", "USER_SELECTED_NOTE"]),
  authorizationReference: z.string().trim().min(8).max(500),
}).strict().superRefine((v, ctx) => {
  if (!v.record.sourceUrl) ctx.addIssue({code:"custom", path:["record","sourceUrl"], message:"Kaynak URL gerekli."});
  if (v.sourceDate && (!Number.isFinite(Date.parse(v.sourceDate)) || new Date(v.sourceDate).toISOString().slice(0,10) !== v.sourceDate || v.sourceDate > new Date(v.observedAt).toLocaleDateString("sv-SE",{timeZone:"Europe/Istanbul"})))
    ctx.addIssue({code:"custom",path:["sourceDate"],message:"Geçerli, gözlemden ileri olmayan ilan tarihi gerekli."});
});
export async function saveBrowserIntake(raw: unknown) {
  const input = browserIntakeSchema.parse(raw);
  return db.$transaction(async tx => {
    // Shares the existing import lock, including manual entries.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(451807)::text`;
    const sourceId = input.record.isDemo ? "browser-pilot-demo" : "manual";
    await tx.listingSource.upsert({where:{id:sourceId}, update:{}, create:{
      id:sourceId, name:input.record.isDemo ? "Tarayıcı pilotu — ÖRNEK VERİ" : "Manuel giriş", method:input.record.isDemo ? "DEMO" : "MANUAL", authorization:"Kullanıcının tek tek girdiği not; veri yeniden kullanım izni değildir", accessStatus:"AVAILABLE", categories:["EV","ARABA","ARSA","TARLA"],
    }});
    const observedAt = new Date(input.observedAt);
    const sourceUrl = canonicalUrl(input.record.sourceUrl)!;
    const provenance = {method:"USER_SELECTED_AUTHORIZED_DATA", authorization:input.authorization, authorizationReference:input.authorizationReference, sourceDate:input.sourceDate ?? null, sourceDateKind:input.sourceDateKind};
    const saved = await saveRecord(tx, input.record, sourceId, undefined, {
      observedAt, provenance,
      quality:{pageCheckedAt:observedAt, ...(input.sourceDate && input.sourceDateKind !== "UNSPECIFIED" ? {
        [input.sourceDateKind === "PUBLISHED" ? "publishedAt" : "sourceUpdatedAt"]:new Date(`${input.sourceDate}T00:00:00+03:00`),
      }:{}), priceVerification:"UNVERIFIED", availabilityStatus:"UNKNOWN"},
    });
    if (!saved.id) throw new HttpError(409,"İlan kimliği çelişiyor; kayıt değiştirilmedi.");
    // An unchanged price is still a dated observation, but replay is idempotent.
    const exists = await tx.listingPriceHistory.findFirst({where:{listingId:saved.id, observedAt, price:input.record.price}});
    if (!exists) await tx.listingPriceHistory.create({data:{listingId:saved.id, observedAt, price:new Prisma.Decimal(input.record.price), provenance:{...provenance, sourceUrl, verification:"PAGE_PRICE_UNCONFIRMED"}}});
    const listing = await tx.listing.findUniqueOrThrow({where:{id:saved.id}});
    if (observedAt.getTime() >= listing.lastObservedAt.getTime()) await tx.listing.update({where:{id:saved.id}, data:{provenance:{...provenance, sourceUrl, observedAt:input.observedAt, verification:"PAGE_PRICE_UNCONFIRMED"}}});
    return {...saved, observationKey:createHash("sha256").update(`${saved.id}:${input.observedAt}:${input.record.price}`).digest("hex"), priceVerified:false, availability:"UNKNOWN"};
  });
}

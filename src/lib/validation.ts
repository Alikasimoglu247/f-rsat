import { z } from "zod";
import { categoryKeys, provinces } from "./constants";

const optionalText = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.string().trim().max(300).optional(),
);
export const priceSchema = z
  .string()
  .trim()
  .regex(
    /^\d{1,16}(\.\d{1,2})?$/,
    "Fiyatı noktalı ondalık metin olarak girin (örn. 1250000.50).",
  )
  .refine((value) => /[1-9]/.test(value), "Değer sıfırdan büyük olmalı.");
const optionalDecimal = z.preprocess(
  (value) => (value === "" || value == null ? undefined : value),
  priceSchema.optional(),
);
const integer = (max: number) =>
  z.preprocess(
    (value) => (value === "" || value == null ? undefined : value),
    z.coerce.number().int().min(0).max(max).optional(),
  );
export const listingSchema = z
  .object({
    title: z.string().trim().min(5, "Başlık en az 5 karakter olmalı.").max(180),
    category: z.enum(categoryKeys),
    province: z.enum(provinces),
    district: z.string().trim().min(2).max(80),
    neighborhood: optionalText,
    price: priceSchema,
    sourceUrl: z.preprocess(
      (value) => (value === "" || value == null ? undefined : value),
      z
        .url()
        .max(2048)
        .refine((value) => {
          const url = new URL(value);
          return (
            ["http:", "https:"].includes(url.protocol) &&
            !url.username &&
            !url.password
          );
        }, "Yalnızca kimlik bilgisi içermeyen HTTP(S) URL kabul edilir.")
        .optional(),
    ),
    externalId: optionalText,
    isDemo: z
      .preprocess(
        (value) =>
          value === "true"
            ? true
            : value === "false" || value === "" || value == null
              ? false
              : value,
        z.boolean(),
      )
      .default(false),
    sizeM2: optionalDecimal,
    propertyType: optionalText,
    rooms: optionalText,
    buildingAge: integer(300),
    condition: optionalText,
    legalStatus: optionalText,
    earthquakeInfo: optionalText,
    make: optionalText,
    model: optionalText,
    trim: optionalText,
    modelYear: z.preprocess(
      (value) => (value === "" || value == null ? undefined : value),
      z.coerce
        .number()
        .int()
        .min(1900)
        .max(new Date().getUTCFullYear() + 1)
        .optional(),
    ),
    mileage: integer(5_000_000),
    fuel: optionalText,
    transmission: optionalText,
    damageHistory: optionalText,
    classification: optionalText,
    zoning: optionalText,
    roadAccess: optionalText,
    parcelNumber: optionalText,
    sharedOwnership: optionalText,
    agriculturalRestrictions: optionalText,
  })
  .strict();
export type ListingInput = z.infer<typeof listingSchema>;
export const settingsSchema = z
  .object({
    telegramEnabled: z.boolean(),
    emailEnabled: z.boolean(),
    minScore: z.number().int().min(0).max(100),
    includeDemoNotifications: z.boolean(),
  })
  .strict();
export const profileSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    category: z.enum(categoryKeys).optional(),
    province: z.enum(provinces).optional(),
    district: optionalText,
    minPrice: optionalDecimal,
    maxPrice: optionalDecimal,
    minScore: z.number().int().min(0).max(100).default(70),
  })
  .refine(
    (v) =>
      !v.minPrice || !v.maxPrice || Number(v.minPrice) <= Number(v.maxPrice),
    "Alt fiyat üst fiyattan büyük olamaz.",
  );

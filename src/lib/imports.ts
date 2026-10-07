import { parse } from "csv-parse/sync";
import { z } from "zod";
import { listingSchema } from "./validation";
import type { ListingInput } from "./validation";
export class ImportValidationError extends Error {
  constructor(public readonly rows: { row: number; message: string }[]) {
    super("Dosyadaki hataları düzeltin. Hiçbir ilan kaydedilmedi.");
  }
}
export class ImportFormatError extends Error {}
export function parseImport(
  content: string,
  format: "CSV" | "JSON" | "EMAIL",
): ListingInput[] {
  if (Buffer.byteLength(content, "utf8") > 2_000_000)
    throw new ImportFormatError("Dosya en fazla 2 MB olabilir.");
  let records: unknown;
  try {
    const json =
      format === "JSON" ||
      (format === "EMAIL" && content.trimStart().startsWith("["));
    records = json
      ? JSON.parse(content)
      : parse(content, {
          columns: true,
          skip_empty_lines: true,
          bom: true,
          trim: true,
          max_record_size: 20_000,
        });
  } catch {
    throw new ImportFormatError("Dosya geçerli UTF-8 CSV veya JSON değil.");
  }
  if (!Array.isArray(records) || !records.length || records.length > 500)
    throw new ImportFormatError("Dosya 1–500 ilan içermeli.");
  const errors: { row: number; message: string }[] = [];
  const result: ListingInput[] = [];
  records.forEach((record, index) => {
    const parsed = listingSchema.safeParse(record);
    if (parsed.success) result.push(parsed.data);
    else
      errors.push({
        row: index + (format === "CSV" ? 2 : 1),
        message: parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
      });
  });
  if (errors.length) throw new ImportValidationError(errors);
  return result;
}
export const importRequestSchema = z
  .object({
    format: z.enum(["CSV", "JSON", "EMAIL"]),
    content: z.string().min(1).max(2_000_000),
    permissionConfirmed: z.literal(true, {
      error: "Veriyi içe aktarma hakkınızı onaylayın.",
    }),
  })
  .strict();

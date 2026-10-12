import { NextResponse } from "next/server";
import { z } from "zod";
import { ImportValidationError, ImportFormatError } from "./imports";
export async function readJson(request: Request, maxBytes = 2_100_000) {
  const origin = request.headers.get("origin");
  const expectedOrigin = new URL(process.env.APP_BASE_URL ?? request.url)
    .origin;
  if (origin && origin !== expectedOrigin)
    throw new HttpError(403, "Farklı origin üzerinden değişiklik yapılamaz.");
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new HttpError(415, "application/json gerekli.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "İstek gövdesi gerekli.");
  let bytes = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, "İstek boyut sınırını aşıyor.");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new HttpError(400, "Geçersiz JSON.");
  }
}
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
export function json(value: unknown, status = 200) {
  return NextResponse.json(JSON.parse(JSON.stringify(value)), { status });
}
export function failure(error: unknown) {
  if (error instanceof HttpError)
    return json({ error: error.message }, error.status);
  if (error instanceof z.ZodError)
    return json(
      {
        error: "Girilen alanları kontrol edin.",
        issues: error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      },
      400,
    );
  if (error instanceof ImportValidationError)
    return json({ error: error.message, rows: error.rows }, 400);
  if (error instanceof ImportFormatError)
    return json({ error: error.message }, 400);
  console.error(
    JSON.stringify({
      event: "api.failure",
      kind: error instanceof Error ? error.name : "Unknown",
    }),
  );
  return json(
    {
      error:
        "İşlem tamamlanamadı. Veri biçimini ve sunucu/veritabanı durumunu kontrol edin.",
    },
    500,
  );
}

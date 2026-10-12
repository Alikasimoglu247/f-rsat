import { createHash } from "node:crypto";
import { setGlobalProxyFromEnv } from "node:http";
import { safeResearchUrl } from "./policy";
import type { ResearchFetchResult } from "./types";

export class ResearchTransportError extends Error {
  constructor(
    public code: "POLICY_REVIEW" | "ACCESS_BLOCKED" | "FAILED",
    message: string,
    public httpStatus?: number,
  ) {
    super(message);
    this.name = "ResearchTransportError";
  }
}
let proxyInitialized = false;
export async function fetchResearchPage(
  value: string,
  options: { maxBytes?: number; timeoutMs?: number } = {},
): Promise<ResearchFetchResult> {
  if (!safeResearchUrl(value))
    throw new ResearchTransportError(
      "POLICY_REVIEW",
      "Kaynak veya yönlendirme izinli araştırma kapsamı dışında.",
    );
  // Node 24 uses the managed proxy and configured CA. TLS verification remains enabled.
  if (!proxyInitialized) {
    setGlobalProxyFromEnv();
    proxyInitialized = true;
  }
  const maxBytes = Math.min(options.maxBytes ?? 1_500_000, 2_000_000);
  const signal = AbortSignal.timeout(
    Math.min(options.timeoutMs ?? 18_000, 30_000),
  );
  const url = value;
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (!safeResearchUrl(url))
      throw new ResearchTransportError(
        "POLICY_REVIEW",
        "Yönlendirme araştırma politikasına uygun değil.",
      );
    const response = await fetch(url, {
      redirect: "manual",
      signal,
      headers: {
        "User-Agent":
          "FirsatRadarResearch/0.2 (bounded personal public-source research)",
        Accept: "text/html,application/pdf,text/plain;q=0.8",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location)
        throw new ResearchTransportError(
          "FAILED",
          "Yönlendirme adresi eksik.",
          response.status,
        );
      const target = new URL(location, url).href;
      // A redirect could move into a robots-disallowed path even on an approved host.
      // The new target must enter acquisition's robots/terms gate as a separate source.
      if (!safeResearchUrl(target))
        throw new ResearchTransportError(
          "POLICY_REVIEW",
          "İzin verilmeyen yönlendirme izlenmedi.",
          response.status,
        );
      throw new ResearchTransportError(
        "POLICY_REVIEW",
        "Yönlendirme hedefi ayrı erişim politikası incelemesi gerektiriyor; izlenmedi.",
        response.status,
      );
    }
    if ([401, 403, 429].includes(response.status)) {
      await response.body?.cancel();
      throw new ResearchTransportError(
        "ACCESS_BLOCKED",
        "Kaynak erişimi reddetti; yeniden deneme veya koruma aşma yapılmadı.",
        response.status,
      );
    }
    const reader = response.body?.getReader(),
      chunks: Uint8Array[] = [];
    let length = 0;
    if (reader)
      for (;;) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        length += chunk.byteLength;
        if (length > maxBytes) {
          await reader.cancel();
          throw new ResearchTransportError(
            "FAILED",
            "Kaynak yanıtı güvenli boyut sınırını aştı.",
            response.status,
          );
        }
        chunks.push(chunk);
      }
    const bytes = Buffer.concat(chunks),
      contentType = response.headers.get("content-type") ?? "";
    return {
      url,
      status: response.status,
      body: bytes.toString(contentType.includes("pdf") ? "latin1" : "utf8"),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      checkedAt: new Date().toISOString(),
      contentType,
    };
  }
  throw new ResearchTransportError("FAILED", "Yönlendirme sınırı aşıldı.");
}

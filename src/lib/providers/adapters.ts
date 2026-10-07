import { parseImport } from "../imports";
import type { ListingInput } from "../validation";
export interface ProviderAdapter {
  sourceId: string;
  authorized: () => boolean;
  collect: () => Promise<ListingInput[]>;
}
export const licensedFeed: ProviderAdapter = {
  sourceId: "licensed-feed",
  authorized: () =>
    !!process.env.AUTHORIZED_FEED_URL && !!process.env.AUTHORIZED_FEED_HOST,
  async collect() {
    if (!this.authorized()) throw new Error("Yetkili feed yapılandırılmamış.");
    const endpoint = new URL(process.env.AUTHORIZED_FEED_URL!);
    if (
      endpoint.protocol !== "https:" ||
      endpoint.hostname !== process.env.AUTHORIZED_FEED_HOST ||
      endpoint.username ||
      endpoint.password ||
      /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(endpoint.hostname)
    )
      throw new Error("Feed sabit, izin verilen genel HTTPS hedefinde olmalı.");
    const response = await fetch(endpoint, {
      redirect: "error",
      headers: process.env.AUTHORIZED_FEED_TOKEN
        ? { Authorization: `Bearer ${process.env.AUTHORIZED_FEED_TOKEN}` }
        : {},
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Feed HTTP ${response.status}`);
    if (Number(response.headers.get("content-length") ?? 0) > 2_000_000)
      throw new Error("Feed boyut sınırını aşıyor.");
    return parseImport(await response.text(), "JSON");
  },
};

import { parseImport } from "../imports";
import type { ListingInput } from "../validation";
import { setGlobalProxyFromEnv } from "node:http";
import { lookup } from "node:dns/promises";
export interface ProviderAdapter {
  sourceId: string;
  authorized: () => boolean;
  collect: () => Promise<ListingInput[]>;
}
export const licensedFeed: ProviderAdapter = {
  sourceId: "licensed-feed",
  authorized: () =>
    !!process.env.AUTHORIZED_FEED_URL &&
    !!process.env.AUTHORIZED_FEED_HOST &&
    !!process.env.AUTHORIZED_FEED_GRANT_REFERENCE &&
    !!process.env.AUTHORIZED_FEED_SOURCE_ID,
  async collect() {
    return parseImport(JSON.stringify(await readLicensedJson()), "JSON");
  },
};
export async function readLicensedJson(): Promise<unknown> {
  if (!licensedFeed.authorized())
    throw new Error("Yetkili feed ve kullanım izni yapılandırılmamış.");
  const endpoint = new URL(process.env.AUTHORIZED_FEED_URL!);
  if (
    endpoint.protocol !== "https:" ||
    endpoint.hostname !== process.env.AUTHORIZED_FEED_HOST ||
    endpoint.username ||
    endpoint.password ||
    endpoint.hostname === "sahibinden.com" ||
    endpoint.hostname.endsWith(".sahibinden.com") ||
    /^(localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/.test(endpoint.hostname)
  )
    throw new Error("Feed sabit, izin verilen genel HTTPS hedefinde olmalı.");
  const addresses = await lookup(endpoint.hostname, { all: true });
  if (
    !addresses.length ||
    addresses.some((a) =>
      /^(0\.|10\.|127\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.|::|f[cd]|fe[89ab])/i.test(
        a.address,
      ),
    )
  )
    throw new Error("Feed hedefi genel ağ adresi olmalı.");
  setGlobalProxyFromEnv();
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
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Feed gövdesi eksik.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const r = await reader.read();
    if (r.done) break;
    size += r.value.byteLength;
    if (size > 2_000_000) {
      await reader.cancel();
      throw new Error("Feed boyut sınırını aşıyor.");
    }
    chunks.push(r.value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

import { notFound } from "next/navigation";
import { RadarPage } from "@/components/radar-page";
import type { PageMode } from "@/components/radar-page";
const routes: Record<string, PageMode> = {
  "": "dashboard",
  firsatlar: "listings",
  "yeni-ilanlar": "discovery",
  "fiyat-gecmisi": "history",
  "takip-listem": "watch",
  "veri-kaynaklari": "sources",
  bildirimler: "notifications",
  ayarlar: "settings",
};
export default async function Page({
  params,
}: {
  params: Promise<{ path?: string[] }>;
}) {
  const path = (await params).path ?? [];
  if (path[0] === "ilan" && path.length === 2)
    return <RadarPage mode="detail" listingId={path[1]} />;
  if (path.join("/") === "firsatlar/yeni") return <RadarPage mode="manual" />;
  const mode = routes[path.join("/")];
  if (!mode) notFound();
  return <RadarPage mode={mode} />;
}

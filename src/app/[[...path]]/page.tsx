import { notFound } from "next/navigation";
import { RadarPage } from "@/components/radar-page";
import type { PageMode } from "@/components/radar-page";
import { ProductPage } from "@/components/product-page";
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
  if (!path.length) return <ProductPage mode="overview" />;
  if (path.join("/") === "genel-bakis/eski")
    return <RadarPage mode="dashboard" />;
  if (path.join("/") === "kesfet") return <ProductPage mode="explore" />;
  if (path.join("/") === "takip-listem") return <ProductPage mode="watch" />;
  if (path.join("/") === "takip-listem/eski") return <RadarPage mode="watch" />;
  if (path.join("/") === "arastirma-merkezi")
    return <ProductPage mode="research" />;
  if (path.join("/") === "fiyat-gecmisi") return <ProductPage mode="history" />;
  if (path[0] === "ilan" && path.length === 2)
    return <RadarPage mode="detail" listingId={path[1]} />;
  if (path.join("/") === "firsatlar/yeni") return <RadarPage mode="manual" />;
  const mode = routes[path.join("/")];
  if (!mode) notFound();
  return <RadarPage mode={mode} />;
}

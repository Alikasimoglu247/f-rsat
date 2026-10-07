"use client";
import Link from "next/link";
import {
  Bookmark,
  ArrowUpRight,
  Home,
  Car,
  Map,
  Sprout,
  MapPin,
  AlertTriangle,
  LoaderCircle,
  Radar,
} from "lucide-react";
import { Button } from "./ui/button";
import { categoryLabels, money } from "@/lib/constants";
import type { ListingView } from "@/lib/listings";
import type { Category } from "@/lib/constants";
export const categoryIcons = { EV: Home, ARABA: Car, ARSA: Map, TARLA: Sprout };
export function DemoBadge() {
  return <span className="badge demo">DEMO</span>;
}
export function Empty({
  title = "Henüz veri yok",
  description = "İlan ekleyin veya kullanım hakkına sahip olduğunuz verileri içe aktarın.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="empty-state">
      <Radar size={35} />
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="animate-spin" size={23} />
      Veriler yükleniyor…
    </div>
  );
}
export function ErrorBox({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="error-box" role="alert">
      <AlertTriangle size={18} />
      <span>{message}</span>
      {retry && (
        <Button size="sm" variant="outline" onClick={retry}>
          Tekrar dene
        </Button>
      )}
    </div>
  );
}
export function Score({ value }: { value: number | null | undefined }) {
  return (
    <span
      className={
        value == null
          ? "score unavailable"
          : value >= 70
            ? "score good"
            : "score average"
      }
    >
      {value ?? "—"}
      <small>{value == null ? "Kanıt yetersiz" : "/ 100"}</small>
    </span>
  );
}
export function CategoryMark({ category }: { category: Category }) {
  const Icon = categoryIcons[category];
  return (
    <span className={`category-mark ${category.toLowerCase()}`}>
      <Icon size={22} />
    </span>
  );
}
export function ListingCard({
  listing,
  onWatch,
}: {
  listing: ListingView;
  onWatch?: (listing: ListingView) => void;
}) {
  const Icon = categoryIcons[listing.category],
    a = listing.assessment;
  return (
    <article className="listing-card">
      <div className={`listing-art ${listing.category.toLowerCase()}`}>
        <Icon size={63} strokeWidth={1.1} />
        <div className="art-orbit" />
        <span className="art-caption">
          {categoryLabels[listing.category]} · {listing.province}
        </span>
        <div className="card-badges">
          {listing.isDemo ? (
            <DemoBadge />
          ) : (
            <span className="badge real">Kullanıcı verisi</span>
          )}
          {a?.relativeDifference && Number(a.relativeDifference) > 0 && (
            <span className="badge discount">
              %{Number(a.relativeDifference).toFixed(0)} medyan altında
            </span>
          )}
        </div>
        {onWatch && (
          <button
            className={listing.watch ? "watch-button saved" : "watch-button"}
            aria-label={`${listing.title} ${listing.watch ? "takipten çıkar" : "takibe al"}`}
            aria-pressed={!!listing.watch}
            onClick={() => onWatch(listing)}
          >
            <Bookmark
              size={17}
              fill={listing.watch ? "currentColor" : "none"}
            />
          </button>
        )}
      </div>
      <div className="listing-body">
        <div className="listing-location">
          <MapPin size={12} />
          {listing.province} / {listing.district}
        </div>
        <h3>
          <Link href={`/ilan/${listing.id}`}>{listing.title}</Link>
        </h3>
        <div className="listing-facts">
          {listing.category === "ARABA"
            ? `${listing.vehicle?.modelYear ?? "Yıl bilinmiyor"} · ${listing.vehicle?.mileage?.toLocaleString("tr-TR") ?? "?"} km · ${listing.vehicle?.transmission ?? "Vites ?"}`
            : `${listing.property?.sizeM2 ?? listing.land?.sizeM2 ?? "?"} m² · ${listing.property?.rooms ?? listing.land?.classification ?? "Bilgi eksik"}`}
        </div>
        <div className="listing-price-row">
          <div>
            <span className="micro-label">İSTENEN FİYAT</span>
            <strong>{money(listing.price)}</strong>
          </div>
          <Score value={a?.score} />
        </div>
        <div className="listing-footer">
          <span>
            {a?.sampleCount ?? 0} emsal ·{" "}
            {a?.confidence === "HIGH"
              ? "Yüksek güven"
              : a?.confidence === "MEDIUM"
                ? "Orta güven"
                : "Analiz yetersiz"}
          </span>
          <Link
            href={`/ilan/${listing.id}`}
            aria-label={`${listing.title} detaylarını gör`}
          >
            <ArrowUpRight size={18} />
          </Link>
        </div>
      </div>
    </article>
  );
}

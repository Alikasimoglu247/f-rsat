"use client";
import Link from "next/link";
import { useState } from "react";
import type { ListingView } from "@/lib/listings";
import { money, dateTime, categoryLabels } from "@/lib/constants";
import { fieldGroups } from "./form-fields";
import { useApi } from "./use-api";
import { Loading, ErrorBox, Empty } from "./shared";
import { Button } from "./ui/button";
type Data = {
  total: number;
  page: number;
  limit: number;
  profiles: { id: string; name: string }[];
  listings: {
    listing: ListingView;
    missingFields: string[];
    comparableStatus: string;
    opportunity: boolean;
  }[];
};
const statuses: Record<string, string> = {
  NOT_ANALYZED: "Henüz analiz edilmedi",
  OUTDATED: "Güncel analiz bekliyor",
  INSUFFICIENT: "En az 5 yeterli emsal bulunamadı",
  SUPPORTED: "Yeterli emsal var",
};
export function DiscoveryPage() {
  const [pilotId, setPilotId] = useState(""),
    [page, setPage] = useState(1);
  const { data, loading, error, refresh } = useApi<Data>(
    `discovery?pilotId=${encodeURIComponent(pilotId)}&page=${page}`,
  );
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} retry={refresh} />;
  if (!data) return null;
  return (
    <div className="page-stack">
      <section className="panel">
        <label>
          Pilot filtresi
          <select
            value={pilotId}
            onChange={(e) => {
              setPilotId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tüm gerçek ilanlar</option>
            {data.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <p>
          {data.total} gerçek ilan · demo kayıtları dahil değildir. Pilot
          filtresi işlem, bütçe ve doğrulanmış gövde tipini de uygular; bunları
          tamamlamadan ilanı tüm gerçek ilanlarda görebilirsin.
        </p>
      </section>
      {!data.total && <Empty title="Henüz gerçek ilan yok" />}
      {data.listings.map(
        ({ listing: l, missingFields, comparableStatus, opportunity }) => {
          const details = { ...l.property, ...l.vehicle, ...l.land } as Record<
            string,
            unknown
          >;
          return (
            <article className="panel" key={l.id} aria-label={l.title}>
              <h2>
                <Link href={`/ilan/${l.id}`}>{l.title}</Link>
              </h2>
              {opportunity && (
                <span className="badge positive">Yeterli kanıtlı fırsat</span>
              )}
              <p>
                {money(l.price)} · {l.province} / {l.district} /{" "}
                {l.neighborhood ?? "Mahalle bilgisi yok"}
              </p>
              <p>
                {categoryLabels[l.category]} · Kaynak: {l.source.name} · İlan
                ID: {l.externalId ?? "Yok"}
              </p>
              {l.sourceUrl ? (
                <a href={l.sourceUrl} rel="noopener noreferrer" target="_blank">
                  İlan bağlantısı
                </a>
              ) : (
                <p>Kaynak bağlantısı eksik.</p>
              )}
              <dl className="info-list">
                <div>
                  <dt>İşlem</dt>
                  <dd>{l.transactionType ?? "Bilgi yok"}</dd>
                </div>
                {fieldGroups[l.category].map((f) => (
                  <div key={f.name}>
                    <dt>{f.label}</dt>
                    <dd>
                      {details[f.name] == null || details[f.name] === ""
                        ? "Bilgi yok"
                        : String(details[f.name])}
                    </dd>
                  </div>
                ))}
              </dl>
              <p>
                Eksik veriler:{" "}
                {missingFields.length
                  ? missingFields.join(", ")
                  : "Karşılaştırma için gerekli alanlar dolu; kaynak beyanları bağımsız doğrulanmadı."}
              </p>
              <p>
                Emsal yeterlilik durumu:{" "}
                {statuses[comparableStatus] ?? comparableStatus} ·{" "}
                {l.assessment?.sampleCount ?? 0} emsal
              </p>
              <p className="helper">
                Son fiyat gözlemi: {dateTime(l.lastObservedAt)}. Eksik verilerle
                veya yetersiz emsalle fırsat etiketi verilmez.
              </p>
            </article>
          );
        },
      )}
      <div className="form-actions">
        <Button
          variant="outline"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          Önceki sayfa
        </Button>
        <span>Sayfa {page}</span>
        <Button
          variant="outline"
          disabled={page * data.limit >= data.total}
          onClick={() => setPage(page + 1)}
        >
          Sonraki sayfa
        </Button>
      </div>
    </div>
  );
}

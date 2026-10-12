"use client";
import Link from "next/link";
import { BrowserIntake } from "./browser-intake";
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
export function DiscoveryPage({notesOnly = false}: {notesOnly?:boolean} = {}) {
  const [pilotId, setPilotId] = useState(""),
    [samples, setSamples] = useState(false),
    [page, setPage] = useState(1);
  const { data, loading, error, refresh } = useApi<Data>(
    `discovery?pilotId=${encodeURIComponent(pilotId)}&page=${page}&samples=${samples}&notes=${notesOnly}`,
  );
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} retry={refresh} />;
  if (!data) return null;
  return (
    <div className="page-stack">
      <BrowserIntake />
      <section className="panel">
        <label><input type="checkbox" checked={samples} onChange={e=>{setSamples(e.target.checked);setPilotId("");setPage(1);}}/> Üç kayıtlık teknik pilotu göster (örnek veri)</label>
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
          {data.total} {samples ? "örnek ilan — gerçek piyasa verisi değildir" : notesOnly ? "kişisel ilan notu · mevcut araştırma kayıtları aşağıdadır" : "gerçek ilan · demo kayıtları dahil değildir"}. Pilot
          filtresi işlem, bütçe ve doğrulanmış gövde tipini de uygular; bunları
          tamamlamadan ilanı tüm gerçek ilanlarda görebilirsin.
        </p>
      </section>
      {!data.total && <Empty title={notesOnly ? "Henüz kişisel ilan notu eklenmedi" : "Henüz gerçek ilan yok"} />}
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
              <Button variant="outline" onClick={()=>window.dispatchEvent(new CustomEvent("radar:browser-note",{detail:{...details,title:l.title,category:l.category,province:l.province,district:l.district,neighborhood:l.neighborhood,sourceUrl:l.sourceUrl,externalId:l.externalId,price:l.price,isDemo:l.isDemo,sourceDate:l.provenance?.sourceDate,sourceDateKind:l.provenance?.sourceDateKind??"UNSPECIFIED"}}))}>Yeni fiyat gözlemi gir</Button>
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
                Kaynakta belirtilen tarih: {String(l.provenance?.sourceDate ?? "Bilgi yok")} ({String(l.provenance?.sourceDateKind ?? "Türü belirsiz")}).
                Sayfa gözlemi: {dateTime(l.provenance?.observedAt as string | undefined)}.
                Fiyat teyidi: {l.provenance?.verification === "PAGE_PRICE_UNCONFIRMED" ? "Yok" : "Ayrıntılara bakın"}.
                Satış durumu: {l.provenance?.verification === "PAGE_PRICE_UNCONFIRMED" ? "Teyitsiz" : "Ayrıntılara bakın"}.
              </p>
              <details><summary>Fiyat gözlemleri ({l.prices?.length ?? 0})</summary>
                {l.prices?.map((p, i) => <p key={i}>{dateTime(p.observedAt)} · {money(p.price)}</p>)}
              </details>
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


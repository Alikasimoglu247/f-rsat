"use client";
import Link from "next/link";
import { createContext, useContext, useState } from "react";
import { useApi } from "./use-api";
import { ErrorBox, Loading } from "./shared";
import { dateTime, money } from "@/lib/constants";
import type { InvestmentReport } from "@/lib/investment-report";
import type { Decision, Reason } from "@/lib/investment";

const EvidenceLabels = createContext<Record<string, string>>({});
const runLabels: Record<string, string> = {
  COMPLETED: "Tamamlandı",
  SUCCEEDED: "Tamamlandı",
  PARTIAL: "Kısmen tamamlandı",
  FAILED: "Başarısız",
  RUNNING: "Devam ediyor",
};
const checkLabels: Record<string, string> = {
  PARSED: "Alanları ayrıştırıldı",
  ACCESS_BLOCKED: "Kaynak erişimi engelledi",
  FAILED: "Kontrol başarısız",
  POLICY_REVIEW: "Kullanım izni incelenmeli",
  ROBOTS_DENIED: "Otomatik erişime izin yok",
  UNSUPPORTED: "Kaynak yapısı doğrulanamadı",
  BUDGET_DEFERRED: "Bu çalışmanın istek sınırı nedeniyle ertelendi",
};
function changedEvidence(value: string | null) {
  if (!value) return "Kanıt yok";
  try {
    const item = JSON.parse(value) as {
      value?: number | null;
      period?: string | null;
      unit?: string | null;
      text?: string | null;
    };
    if (!item || typeof item !== "object") return value.slice(0, 240);
    const observed =
      typeof item.value === "number"
        ? `${item.value}${item.unit ?? ""}`
        : (item.text?.slice(0, 240) ?? "Açıklanmamış");
    return `${observed}${item.period ? ` (${item.period})` : ""}`;
  } catch {
    return value.slice(0, 240);
  }
}
function EvidenceLinks({ ids }: { ids: string[] }) {
  const labels = useContext(EvidenceLabels);
  return ids.length ? (
    <span className="investment-refs">
      {ids.map((id) => (
        <a key={id} href={`#fact-${id}`}>
          Kaynak: {labels[id] ?? "Araştırma kanıtı"}
        </a>
      ))}
    </span>
  ) : null;
}
function Reasons({ items }: { items: Reason[] }) {
  return (
    <ul>
      {items.map((item, i) => (
        <li key={i}>
          {item.text}
          <EvidenceLinks ids={item.evidenceIds} />
        </li>
      ))}
    </ul>
  );
}
function Candidate({
  decision,
}: {
  decision: Decision & { priceCurrent?: boolean };
}) {
  return (
    <article className="panel investment-candidate">
      <div className="investment-candidate-heading">
        <div>
          <span className="eyebrow">
            {decision.origin === "RESEARCH"
              ? "KAYNAKTA BULUNAN ADAY"
              : "GERÇEK VERİTABANI İLANI"}{" "}
            · {decision.category}
          </span>
          <h2>{decision.title}</h2>
          <p>{decision.location}</p>
        </div>
        <strong className="investment-verdict">{decision.verdict}</strong>
      </div>
      <p>
        <strong>
          {decision.price == null
            ? "Fiyat açıklanmamış"
            : money(decision.price)}
        </strong>{" "}
        · Kaynak gözlemi: {dateTime(decision.observedAt)}
      </p>
      {decision.priceCurrent === false && (
        <p role="status">
          Geçmiş veya uzlaştırılmamış fiyat/özellik gözlemi. Güncel kaydı
          destekleyen kaynak ve kimlik doğrulaması tamamlanmadı; fiyat
          karşılaştırmasında kullanılmıyor.
        </p>
      )}
      {decision.publishedAt && (
        <p>
          Kaynak ilan tarihi: {decision.publishedAt}. Bugün sayfada bulunması,
          güncel satış mevcudiyetinin teyidi değildir.
        </p>
      )}
      {decision.unitPrice && (
        <p>
          Hesaplanan istenen birim fiyat:{" "}
          <strong>{money(decision.unitPrice)} / m²</strong> · yayıncı alan
          beyanı; değerleme değil.
        </p>
      )}
      {decision.sourceUrl && (
        <a href={decision.sourceUrl} target="_blank" rel="noreferrer">
          Orijinal kaynak sayfası ↗
        </a>
      )}
      <p>{decision.features.join(" · ")}</p>
      <div className="investment-two-column">
        <section>
          <h3>Neden fırsat olabilir?</h3>
          {decision.whyCould.length ? (
            <Reasons items={decision.whyCould} />
          ) : (
            <p>Güncel kaynak kanıtı olmadan olumlu gerekçe üretilemedi.</p>
          )}
        </section>
        <section>
          <h3>Neden fırsat olmayabilir?</h3>
          <Reasons items={decision.whyNot} />
        </section>
      </div>
      <h3>Hangi bilgiler eksik?</h3>
      <ul>
        {decision.missing.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <h3>Daha iyi alternatif var mı?</h3>
      <p>{decision.alternatives}</p>
      <h3>Emsal yeterliliği</h3>
      <p>
        {decision.assessment
          ? `${decision.assessment.sampleCount} eşleşen gerçek emsal. ${decision.assessment.score == null ? "Fırsat puanı üretilemedi." : `Mevcut fiyat motorunun puanı: ${decision.assessment.score}; yatırım getirisi tahmini değildir.`}`
          : "Güncel ve aynı nitelikte yeterli emsal doğrulanamadı; fırsat puanı üretilemedi."}
      </p>
      {decision.origin === "DATABASE" && (
        <Link href={`/ilan/${decision.id}`}>
          Fiyat geçmişini ve eşleşen emsalleri incele →
        </Link>
      )}
      <EvidenceLinks ids={decision.factIds} />
    </article>
  );
}
export function InvestmentPage() {
  const { data, loading, error, refresh } =
    useApi<InvestmentReport>("investment");
  const [pilotKey, setPilotKey] = useState("SILIVRI");
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} retry={refresh} />;
  if (!data) return null;
  const pilot = data.pilots.find((item) => item.pilotKey === pilotKey)!;
  const labels = Object.fromEntries(
    data.facts.map((fact) => [
      fact.id,
      data.sources.find((source) => source.id === fact.sourceId)?.name ??
        "Kaynak kaydı eksik",
    ]),
  );
  const nominal = data.facts.find((fact) => fact.id === "housing-istanbul");
  const inflation = data.facts.find(
    (fact) =>
      fact.id.startsWith("cpi-") &&
      fact.period === nominal?.period &&
      fact.current,
  );
  const latestRun = data.researchLoop.history[0];
  const changeOrder = [
    "DECISION_REVISED",
    "PRICE_CHANGED",
    "SOURCE_INVALIDATED",
    "FACT_CHANGED",
    "NEW_CANDIDATE",
    "CANDIDATE_CHANGED",
  ];
  const displayedChanges = [...(latestRun?.changes ?? [])]
    .sort((a, b) => changeOrder.indexOf(a.kind) - changeOrder.indexOf(b.kind))
    .slice(0, 12);
  const schedulerStatus =
    {
      RUNNING: "Çalışıyor; güncel süreç sinyali var",
      NOT_STARTED: "Başlatılmamış",
      STOPPED: "Durdurulmuş",
      STALE: "Süreç sinyali eskimiş; çalıştığı doğrulanamıyor",
    }[data.researchLoop.scheduler.status] ?? data.researchLoop.scheduler.status;
  return (
    <EvidenceLabels.Provider value={labels}>
      <div className="investment-page">
        <div className="page-heading">
          <div>
            <span className="eyebrow">KAYNAKLARA DAYALI KARAR AJANI</span>
            <h1>Yatırım analizi</h1>
            <p>
              Piyasa koşulları, adaylar ve belirsizlikler birlikte
              değerlendirilir.
            </p>
          </div>
        </div>
        <div
          className="investment-tabs"
          role="group"
          aria-label="Analiz pilotu"
        >
          {data.pilots.map((item) => (
            <button
              key={item.pilotKey}
              className="investment-tab"
              aria-pressed={pilotKey === item.pilotKey}
              onClick={() => setPilotKey(item.pilotKey)}
            >
              {item.pilotKey === "SILIVRI"
                ? "Silivri Gayrimenkul"
                : "Marmara SUV"}
            </button>
          ))}
        </div>
        <p className="investment-context">
          Araştırma: {dateTime(data.researchedAt)} · Değerlendirme:{" "}
          {dateTime(data.evaluatedAt)}.{" "}
          {data.researchLoop.mode === "LEGACY_SNAPSHOT"
            ? "Önceki tarihli pilot gözlemi gösteriliyor; araştırma döngüsü henüz çalıştırılmadı."
            : "Kaydedilmiş araştırma çalışmasının kanıtları gösteriliyor. Sayfayı açmak yeni internet araştırması başlatmaz; geçersiz veya eskimiş kanıtlar kararı desteklemez."}
        </p>
        <section className="panel" aria-label="Araştırma döngüsü">
          <h2>Araştırma döngüsü</h2>
          <p>
            Araştırılan segment: {latestRun?.segment ?? "Henüz seçilmedi"}. Arsa
            ile tarla, hisseli ile müstakil tapu ve farklı imar hakları ortak
            emsal yapılmaz.
          </p>
          {latestRun?.strategy && (
            <p>Segment seçiminin gerekçesi: {latestRun.strategy.reason}</p>
          )}
          <p>
            Zamanlayıcı: <strong>{schedulerStatus}</strong> · Saat dilimi:{" "}
            {data.researchLoop.scheduler.timezone} · Program:{" "}
            {data.researchLoop.scheduler.schedule === "0 9 * * *"
              ? "Her sabah 09.00"
              : data.researchLoop.scheduler.schedule === "* * * * * *"
                ? "Kısa süreli zamanlayıcı denemesi"
                : "Özel zamanlama"}
          </p>
          <p>
            Son süreç sinyali:{" "}
            {dateTime(data.researchLoop.scheduler.lastHeartbeatAt)}
            {data.researchLoop.scheduler.nextPlannedRunAt && (
              <>
                {" "}
                · Planlanan sonraki tetik:{" "}
                {dateTime(data.researchLoop.scheduler.nextPlannedRunAt)}
              </>
            )}
            . Plan veya süreç sinyali, 09.00 araştırmasının gerçekleştiğini
            kanıtlamaz.
          </p>
          {data.researchLoop.dailyRunCount === 0 && (
            <p role="status">
              Kayıtlı son çalışmalarda günlük programla tamamlanan araştırma
              yok. Elle çalıştırma ve zamanlayıcı denemesi günlük çalışma olarak
              sayılmaz.
            </p>
          )}
          {!latestRun ? (
            <p>Kaydedilmiş araştırma çalışması yok.</p>
          ) : (
            <>
              <p>
                Son çalışma: {dateTime(latestRun.startedAt)} ·{" "}
                {runLabels[latestRun.status] ?? latestRun.status} ·{" "}
                {latestRun.trigger === "MANUAL"
                  ? "Elle çalıştırıldı"
                  : latestRun.trigger === "SCHEDULED_PROBE"
                    ? "Gerçek zamanlayıcı denemesi"
                    : "Günlük program tetikledi"}
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Çalışma / tetik</th>
                      <th>Kontrol / alınan yanıt</th>
                      <th>Yeni kaynak / aday</th>
                      <th>Fiyat / kanıt değişimi</th>
                      <th>Karar değişimi / geçersiz kaynak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.researchLoop.history.map((run) => (
                      <tr key={run.id}>
                        <td>
                          {dateTime(run.startedAt)}
                          <br />
                          {run.trigger === "MANUAL"
                            ? "Elle"
                            : run.trigger === "SCHEDULED_PROBE"
                              ? "Zamanlayıcı denemesi"
                              : "Günlük"}
                          {" · "}
                          {runLabels[run.status] ?? run.status}
                          <br />
                          <small>
                            Çalışma {run.id} · {run.segment}
                          </small>
                        </td>
                        <td>
                          {run.checkedUrls} / {run.fetchedChecks}
                        </td>
                        <td>
                          {run.newSourceUrls} / {run.newCandidates}
                        </td>
                        <td>
                          {run.priceChanges} / {run.factChanges}
                        </td>
                        <td>
                          {run.decisionRevisions} / {run.invalidatedSources}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p>
                Son çalışmada {latestRun.inserted} yeni gerçek ilan kaydedildi;{" "}
                {latestRun.updated} kayıt güncellendi.{" "}
                {latestRun.unchangedCandidates} adayın fiyat/özellik beyanı
                değişmedi. Aynı fiyat gözlemi yeni fiyat indirimi olarak
                sayılmaz.
              </p>
              <details>
                <summary>
                  Son çalışmada kararlar neden yeniden değerlendirildi?
                </summary>
                {latestRun.changes.length ? (
                  <ul>
                    {displayedChanges.map((change, i) => (
                      <li key={`${change.kind}-${change.key}-${i}`}>
                        <strong>
                          {data.pilots
                            .flatMap((item) => item.decisions)
                            .find(
                              (item) =>
                                item.sourceUrl === change.key ||
                                item.id === change.key,
                            )?.title ??
                            data.facts.find((item) => item.id === change.key)
                              ?.label ??
                            "Kaynak kontrolü"}
                          :{" "}
                        </strong>
                        {change.reason}
                        {change.kind === "PRICE_CHANGED" && (
                          <>
                            {" "}
                            Önceki fiyat:{" "}
                            {change.before
                              ? money(change.before)
                              : "Bilinmiyor"}
                            ; yeni fiyat:{" "}
                            {change.after
                              ? money(change.after)
                              : "Açıklanmamış"}
                            .
                          </>
                        )}
                        {change.kind === "DECISION_REVISED" && (
                          <>
                            {" "}
                            Önceki sonuç: {change.before}; yeni sonuç:{" "}
                            {change.after}.
                          </>
                        )}
                        {change.kind === "FACT_CHANGED" && (
                          <>
                            {" "}
                            Önceki kanıt: {changedEvidence(change.before)}; yeni
                            kanıt: {changedEvidence(change.after)}.
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    Yeni geçerli kanıt veya fiyat değişimi bulunmadı; önceki
                    karar korunuyor.
                  </p>
                )}
              </details>
              <details>
                <summary>Son kaynak kontrolleri ve engeller</summary>
                <ul>
                  {latestRun.checks.map((check, i) => (
                    <li key={`${check.url}-${i}`}>
                      <a href={check.url} target="_blank" rel="noreferrer">
                        {data.sources.find((source) => source.url === check.url)
                          ?.name ?? new URL(check.url).hostname}
                      </a>
                      : {checkLabels[check.status] ?? check.status}
                      {check.reason && <> · {check.reason}</>}
                    </li>
                  ))}
                </ul>
                <p>
                  {data.researchLoop.blockedResourceCount} kaynak erişim veya
                  kullanım incelemesi nedeniyle bekliyor. Erişim engelleri
                  aşılmaz.
                </p>
              </details>
            </>
          )}
        </section>
        <div className="stats-grid investment-stats">
          {[
            ["Kaynakta bulunan aday", pilot.researchCount],
            ["Gerçek veritabanı ilanı", pilot.databaseCount],
            ["Fiyatı açıklanmış aday", pilot.pricedCount],
            ["İncelemeye değer", pilot.reviewCount],
          ].map(([label, value]) => (
            <div className="stat-card" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <p>
          {pilot.analyzedCount} aday gerekçeli değerlendirildi;{" "}
          {pilot.comparableSupported} kayıt yeterli fiyat emsaline sahip. Demo
          kayıtlar bu ekranda kullanılmaz.
        </p>
        {pilot.profileMissing && (
          <p role="status">
            Bu pilotun arama profili bulunamadı; veritabanı eşleşmeleri
            gösterilemiyor.
          </p>
        )}
        {pilotKey === "SILIVRI" ? (
          <>
            <section className="panel">
              <h2>Silivri için yatırım tezi</h2>
              <p>
                İstanbul konut endeksindeki nominal artış, Silivri’de her
                taşınmazın reel kazanç sağladığını göstermez. Mahalle ve
                taşınmaz türüne uygun fiyat/kira örnekleri, hukuki durum ve
                finansman maliyeti birlikte doğrulanmalı.
              </p>
              <p>
                {data.istanbulRealChange == null ? (
                  "Güncel ve aynı döneme ait kanıt eksik; reel değişim yeniden hesaplanamadı."
                ) : (
                  <>
                    {nominal?.period} döneminde İstanbul nominal konut artışı %
                    {String(nominal?.value).replace(".", ",")}; aynı ay yıllık
                    TÜFE %{String(inflation?.value).replace(".", ",")}.
                    Hesaplanan reel değişim{" "}
                    <strong>
                      %{data.istanbulRealChange.replace(".", ",")}
                    </strong>
                    . Formül: (1 + nominal artış) / (1 + aynı dönem enflasyon) −
                    1. İl endeksi; mahalle değeri ve gelecek getiri tahmini
                    değildir.
                  </>
                )}
                <EvidenceLinks ids={data.realChangeFactIds} />
              </p>
              <p>
                Politika faizi, konut kredisi veya net mevduat getirisi yerine
                kullanılamaz. Yeni kiracı kira endeksi de TL kira bedeli veya
                kira çarpanı değildir. Yerel talep, gerçekleşmiş satış sayısı ve
                satış süresi için doğrulanmış ölçüm bu pilotta yok.
              </p>
              <EvidenceLinks ids={["policy-rate", "rent-istanbul"]} />
              <p>
                {data.facts.find(
                  (fact) => fact.id === "silivri-july-asking-context",
                )?.current
                  ? "Haberde aktarılan Silivri daire istatistiği ayrı bir bağlam verisidir. Örneklemi/modeli bağımsız doğrulanmadı; villa, arsa, tarla ve mahalle değerlemesine aktarılmaz."
                  : "Silivri daire istatistiği için güncel geçerli kaynak kanıtı yok; önceki haber aktarımı değerlemeye kullanılmıyor."}
              </p>
              <EvidenceLinks ids={["silivri-july-asking-context"]} />
            </section>
            <section className="panel">
              <h2>Piyasa kanıtları ve güncellik</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Gösterge</th>
                      <th>Gözlenen değer</th>
                      <th>Dönem / kapsam</th>
                      <th>Kanıt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.facts
                      .filter((fact) => fact.value != null)
                      .map((fact) => (
                        <tr key={fact.id}>
                          <td>{fact.label}</td>
                          <td>
                            {fact.current
                              ? fact.unit === "%"
                                ? `%${String(fact.value).replace(".", ",")}`
                                : `${money(fact.value)} / m²`
                              : "Kaynak eskidi; güncel değer olarak kullanılmıyor"}
                          </td>
                          <td>
                            {fact.period} · {fact.scope}
                          </td>
                          <td>
                            <EvidenceLinks ids={[fact.id]} />
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="panel">
              <h2>Mahalle kapsamı</h2>
              <p>
                Doğrulanmış mahalle ortalaması bulunmadan İstanbul endeksinden
                TL/m² veya kira türetilmez.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Mahalle</th>
                      <th>Satış TL/m²</th>
                      <th>Aylık kira</th>
                      <th>Önemli bulgu</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.neighborhoods.map((item) => (
                      <tr key={item.name}>
                        <td>{item.name}</td>
                        <td>Doğrulanamadı</td>
                        <td>Doğrulanamadı</td>
                        <td>
                          {item.current
                            ? item.finding
                            : "Güncel mahalle fiyatı, kira veya bölgesel gelişme kanıtı doğrulanamadı."}
                          <EvidenceLinks ids={item.evidenceIds} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="panel">
              <h2>Konut, arsa ve tarla karşılaştırması</h2>
              <p>
                Aşağıdakiler koşullu yatırım tezleridir. Ölçülmüş getiri veya
                kesin değer artışı sıralaması yapılmadı.
              </p>
              <div className="investment-strategies">
                {data.strategies.map((item) => (
                  <section key={item.category}>
                    <h3>{item.name}</h3>
                    {item.current ? (
                      <>
                        <p>
                          <strong>Potansiyel:</strong> {item.upside}
                        </p>
                        <p>
                          <strong>Risk:</strong> {item.downside}
                        </p>
                        <p>
                          <strong>Likidite:</strong> {item.liquidity}
                        </p>
                      </>
                    ) : (
                      <p>
                        Güncel kanıtlar tamamlanmadan bu yatırım tezi yeniden
                        doğrulanamadı.
                      </p>
                    )}
                    <p>
                      <strong>Eksik:</strong> {item.missing.join(" · ")}
                    </p>
                    <EvidenceLinks ids={item.evidenceIds} />
                  </section>
                ))}
              </div>
            </section>
          </>
        ) : (
          <section className="panel">
            <h2>Marmara SUV karar modeli</h2>
            <p>
              Mevcut gerçek ilan motoru aynı marka/model/donanım, benzer
              yıl/kilometre, yakıt/vites ve hasar beyanını eşleştirir.
              SUV/Crossover gövde tipi için kaynak kanıtı onaylı olmalı; farklı
              segment araçlar doğrudan emsal yapılmaz.
            </p>
            <p>
              Alım fiyatına ek olarak sigorta, vergi, bakım, yakıt/şarj,
              finansman ve yeniden satış riski değerlendirilmeli. Bu giderler
              veya gelecekteki değer kaybı ölçülmeden toplam sahip olma maliyeti
              ve getiri üretilmez. Politika faizi taşıt kredisi oranı değildir.
            </p>
            <p>
              Bu pilotta güncel SUV piyasa endeksi veya maliyet kanıtı
              eklenmedi. Aynı gerekçe/eksik veri/alternatif karar şeması, mevcut
              gerçek SUV kayıtlarına uygulanır.
            </p>
            {data.facts.filter(
              (fact) => fact.current && fact.id.startsWith("togg-t10x-"),
            ).length > 0 && (
              <>
                <h3>Yeni araç finansmanı: alternatif alım koşulları</h3>
                <p>
                  Togg’un yayımladığı T10X kredi koşulları ikinci el ilan fiyatı
                  veya gerçekleşmiş satış değildir. Farklı model fiyatlarına
                  doğrudan emsal yapılmaz; nakit fiyat, uygunluk ve bütün
                  masraflar doğrulanmadan toplam maliyet avantajı çıkarılmaz.
                </p>
                <ul>
                  {data.facts
                    .filter(
                      (fact) =>
                        fact.current && fact.id.startsWith("togg-t10x-"),
                    )
                    .slice(0, 4)
                    .map((fact) => (
                      <li key={fact.id}>
                        {fact.label}
                        <EvidenceLinks ids={[fact.id]} />
                      </li>
                    ))}
                </ul>
              </>
            )}
          </section>
        )}
        {pilotKey === "SILIVRI" && (
          <section className="panel">
            <h2>Adayların fiyat ve risk karşılaştırması</h2>
            <p>
              İstenen fiyatlar aynı tür/haklara sahip değil; bu tablo fırsat
              sıralaması veya ortak emsal medyanı değildir.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Aday</th>
                    <th>İstenen fiyat</th>
                    <th>Beyan üzerinden TL/m²</th>
                    <th>Sonuç</th>
                  </tr>
                </thead>
                <tbody>
                  {pilot.decisions.map((item) => (
                    <tr key={item.id}>
                      <td>{item.title}</td>
                      <td>
                        {item.price == null
                          ? "Açıklanmamış"
                          : money(item.price)}
                        {item.priceCurrent === false && (
                          <>
                            <br />
                            <small>Geçmiş gözlem; güncel değil</small>
                          </>
                        )}
                      </td>
                      <td>
                        {item.unitPrice == null
                          ? "Hesaplanamadı"
                          : money(item.unitPrice)}
                      </td>
                      <td>{item.verdict}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
        <section aria-label="Aday değerlendirmeleri">
          <h2>
            {pilotKey === "SILIVRI"
              ? "Silivri ilan adayları"
              : "Marmara SUV ilanları"}
          </h2>
          {pilot.decisions.length ? (
            pilot.decisions.map((decision) => (
              <Candidate
                key={`${decision.origin}-${decision.id}`}
                decision={decision}
              />
            ))
          ) : (
            <div className="panel">
              <p>
                Bu pilotta doğrulanabilir gerçek ilan yok. Demo araçlar veya
                başka bölgedeki ilanlar sonuçlara eklenmedi.
              </p>
            </div>
          )}
        </section>
        {pilotKey === "SILIVRI" && (
          <section className="panel">
            <h2>Kararı destekleyen kaynaklar</h2>
            <p>
              Resmî bilgi, yayıncı beyanı, ikincil haber aktarımı ve gerekçeli
              çıkarım ayrı tutulur. Beyanlar ve model istatistikleri bağımsız
              doğrulama değildir.
            </p>
            <div className="investment-evidence">
              {data.facts.map((fact) => {
                const source = data.sources.find(
                  (item) => item.id === fact.sourceId,
                );
                if (!source) return null;
                return (
                  <div
                    key={fact.id}
                    id={`fact-${fact.id}`}
                    className="investment-fact"
                  >
                    <strong>{fact.label}</strong>
                    <p>
                      {fact.period ?? "Dönem belirtilmemiş"} · {fact.scope} ·{" "}
                      {source.kind === "OFFICIAL"
                        ? "Resmî kaynak"
                        : source.kind === "SECONDARY"
                          ? "İkincil haber aktarımı"
                          : "Yayıncı beyanı"}
                    </p>
                    <a href={source.url} target="_blank" rel="noreferrer">
                      {source.name} ↗
                    </a>
                    <p>
                      Alınma: {dateTime(source.retrievedAt)} ·{" "}
                      {source.fresh
                        ? "Araştırma yaş sınırı içinde"
                        : "Geçersiz veya eskimiş kaynak; kararı desteklemiyor"}
                    </p>
                    <small>{source.usageNote}</small>
                  </div>
                );
              })}
            </div>
            <details>
              <summary>Kullanılmayan kaynaklar</summary>
              <ul>
                {data.excludedSources.map((item) => (
                  <li key={item.name}>
                    {item.name}: {item.reason}
                  </li>
                ))}
              </ul>
            </details>
          </section>
        )}
      </div>
    </EvidenceLabels.Provider>
  );
}

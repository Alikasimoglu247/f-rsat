"use client";
import Link from "next/link";
import { createContext, useContext, useState } from "react";
import { useApi } from "./use-api";
import { ErrorBox, Loading } from "./shared";
import { dateTime, money } from "@/lib/constants";
import type { InvestmentReport } from "@/lib/investment-report";
import type { Decision, Reason } from "@/lib/investment";

const EvidenceLabels = createContext<Record<string, string>>({});
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
function Candidate({ decision }: { decision: Decision }) {
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
          : "Fiyat/alan eksik; emsal fiyat analizi ve fırsat puanı üretilemedi."}
      </p>
      {decision.assessment && (
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
      data.sources.find((source) => source.id === fact.sourceId)!.name,
    ]),
  );
  const nominal = data.facts.find((fact) => fact.id === "housing-istanbul");
  const inflation = data.facts.find((fact) => fact.id === "cpi-august");
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
          {dateTime(data.evaluatedAt)}. Bu, tarihli bir araştırma gözlemidir;
          sürekli canlı ilan taraması değildir. Yeniden değerlendirme
          veritabanındaki gerçek kayıtları ve kaynak yaşını kontrol eder.
        </p>
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
                <EvidenceLinks ids={["housing-istanbul", "cpi-august"]} />
              </p>
              <p>
                Politika faizi, konut kredisi veya net mevduat getirisi yerine
                kullanılamaz. Yeni kiracı kira endeksi de TL kira bedeli veya
                kira çarpanı değildir. Yerel talep, gerçekleşmiş satış sayısı ve
                satış süresi için doğrulanmış ölçüm bu pilotta yok.
              </p>
              <EvidenceLinks ids={["policy-rate", "rent-istanbul"]} />
              <p>
                Temmuz 2026 için haberde aktarılan Silivri daire istatistiği
                ayrı bir bağlam verisidir. Örneklemi/modeli bağımsız
                doğrulanmadı; Selimpaşa villası, arsa veya tarla değerlemesine
                ve mahalle ortalamasına aktarılmaz.
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
                          {item.finding}
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
                    <p>
                      <strong>Potansiyel:</strong> {item.upside}
                    </p>
                    <p>
                      <strong>Risk:</strong> {item.downside}
                    </p>
                    <p>
                      <strong>Likidite:</strong> {item.liquidity}
                    </p>
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
                )!;
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
                        : "Eskimiş kaynak; yeniden doğrulama gerekli"}
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

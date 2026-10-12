"use client";
import Link from "next/link";
import { DiscoveryPage } from "./discovery";
import { BrowserResearch } from "./browser-research";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Activity,
  Search,
  ShieldAlert,
  MapPin,
  Home,
  Car,
  Layers,
  RefreshCw,
  Download,
  Upload,
  Clock,
  CheckCircle2,
  Sparkles,
  Bookmark,
  Scale,
} from "lucide-react";
import { api, useApi } from "./use-api";
import { ErrorBox, Loading } from "./shared";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { PriceChart } from "./charts";
import { categoryLabels, dateTime, money } from "@/lib/constants";
import type { ProductReport } from "@/lib/product-report";
import type { Decision, Reason } from "@/lib/investment";
import type { ListingView } from "@/lib/listings";
import { comparisonWarnings } from "@/lib/comparison";

type Mode =
  "overview" | "explore" | "analysis" | "research" | "history" | "watch";
type Item = ProductReport["listings"][number];
const statusLabel: Record<string, string> = {
  RUNNING: "Çalışıyor",
  COMPLETED: "Tamamlandı",
  PARTIAL: "Kısmen tamamlandı",
  FAILED: "Başarısız",
  DEFERRED: "Kaynaklar bekleme süresinde",
  INTERRUPTED: "Kesildi",
  STOPPED: "Durdurulmuş",
  STALE: "Heartbeat güncel değil",
  NOT_STARTED: "Henüz başlamadı",
  ACCESS_BLOCKED: "Erişim engellendi",
  POLICY_REVIEW: "İzin incelemesi",
  ROBOTS_DENIED: "Otomatik erişime kapalı",
  PARSED: "Ayrıştırıldı",
  UNSUPPORTED: "Şablon doğrulanamadı",
  BUDGET_DEFERRED: "İstek sınırı nedeniyle ertelendi",
};
const textStatus = (s: string) => statusLabel[s] ?? s;
const titles: Record<Mode, [string, string]> = {
  watch: [
    "Takip Listem",
    "Kaydettiğiniz gerçek adaylar, kaynak gözlemleri ve fiyat geçmişleri",
  ],
  overview: [
    "Piyasayı izle. Kanıtla karar ver.",
    "Kişisel yatırım araştırma merkeziniz",
  ],
  explore: [
    "Doğru adayları keşfet",
    "Gerçek kayıtlar · kaynaklı fiyatlar · açık belirsizlikler",
  ],
  analysis: [
    "Yatırım analizi",
    "Fiyatın ötesine bakın. Tezi, riski ve eksik kanıtı birlikte değerlendirin.",
  ],
  research: [
    "Araştırma Merkezi",
    "Ajanın gerçek çalışmaları ve bir sonraki araştırma yönü",
  ],
  history: [
    "Fiyat geçmişi",
    "Kaydedilmiş gözlemler. Aynı fiyat tekrarları değişim sayılmaz.",
  ],
};
const safeLink = (value: string | null | undefined) =>
  value && /^https:\/\//.test(value) ? value : undefined;
function sourceName(d: Decision, data: ProductReport) {
  return (
    data.investment.sources.find((s) => s.url === d.sourceUrl)?.name ??
    data.listings.find((l) => l.id === d.id)?.source.name ??
    "Kaynak"
  );
}
function riskTitle(d: Decision) {
  if (!d.priceCurrent) return "Kaynak / fiyat güncelliği";
  if (d.verdict === "Riskli") return "Hukuki / yayıncı beyanı riski";
  return d.category === "ARABA"
    ? "Kondisyon ve emsal kanıtı eksik"
    : "Hukuki kanıt ve emsal eksik";
}
function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`v2-pill ${tone}`}>{children}</span>;
}

export function ProductPage({ mode }: { mode: Mode }) {
  const { data, error, loading, refresh } = useApi<ProductReport>("product");
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState(""),
    [actionError, setActionError] = useState("");
  const [transfer, setTransfer] = useState(false);
  const active =
    pending ||
    !!data?.running ||
    !!data?.tasks.some((t) => t.status === "RUNNING");
  useEffect(() => {
    const timer = setInterval(refresh, active ? 2000 : 30_000);
    return () => clearInterval(timer);
  }, [refresh, active]);
  async function run(action: "start" | "reevaluate") {
    setPending(true);
    setActionError("");
    setMessage("");
    try {
      await api("research/" + action, {});
      setMessage(
        action === "start"
          ? "Araştırma başlatıldı. Kaynak kontrolleri aşağıda güncellenecek."
          : "Kayıtlı veriler yeniden değerlendiriliyor; ağ araştırması yapılmıyor.",
      );
      refresh();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  if (loading) return <Loading />;
  if (error || !data)
    return (
      <ErrorBox
        message={error || "Veritabanına ulaşılamadı."}
        retry={refresh}
      />
    );
  const actions = (
    <div className="v2-actions">
      <Button
        variant="outline"
        disabled={active}
        onClick={() => run("reevaluate")}
      >
        <RefreshCw size={16} />
        Yeniden değerlendir
      </Button>
      <Button disabled={active} onClick={() => run("start")}>
        <Search size={16} />
        {active ? "Araştırma devam ediyor" : "Yeni araştırma başlat"}
      </Button>
    </div>
  );
  return (
    <div className="v2-page">
      <header className="v2-heading">
        <div>
          <span className="v2-eyebrow">
            FIRSATRADAR /{" "}
            {mode === "overview"
              ? "GENEL BAKIŞ"
              : titles[mode][0].toLocaleUpperCase("tr")}
          </span>
          <h1>{titles[mode][0]}</h1>
          <p>{titles[mode][1]}</p>
        </div>
        {actions}
      </header>
      {actionError && <ErrorBox message={actionError} />}
      {message && (
        <p className="v2-notice" role="status">
          {message}
        </p>
      )}
      {data.tasks[0] && !active && (
        <p className="v2-task-result">
          Son uygulama işlemi: {textStatus(data.tasks[0].status)} ·{" "}
          {dateTime(data.tasks[0].completedAt)}{" "}
          {data.tasks[0].status === "DEFERRED" &&
            "Yeni ağ araştırması yapılmadı; izinli kaynakların bekleme süresi korunuyor."}
        </p>
      )}
      {!data.counts.real && (
        <Setup
          data={data}
          active={active}
          onStart={() => run("start")}
          onTransfer={() => setTransfer(true)}
        />
      )}
      {mode === "overview" && (
        <Overview
          data={data}
          active={active}
          onTransfer={() => setTransfer(true)}
        />
      )}
      {mode === "explore" && <><BrowserResearch /><details><summary>Kişisel notlar ve teknik pilot</summary><section aria-label="Kişisel ilan gözlemleri"><DiscoveryPage notesOnly /></section></details></>}
      {(mode === "explore" || mode === "analysis" || mode === "watch") && (
        <Candidates
          data={data}
          analysis={mode === "analysis"}
          watchOnly={mode === "watch"}
        />
      )}
      {mode === "research" && (
        <>
          <section className="v2-panel v2-transfer-strip">
            <div>
              <h2>Veri yönetimi</h2>
              <p>
                Cloud ve Windows ayrı veritabanlarıdır. Paketler mevcut
                kayıtları silmeden birleştirilir.
              </p>
            </div>
            <div className="v2-actions">
              <a
                className="v2-link-button"
                href="/api/research/export"
                download
              >
                <Download size={16} />
                Paketi dışa aktar
              </a>
              <Button variant="outline" onClick={() => setTransfer(true)}>
                <Upload size={16} />
                Araştırma paketi yükle
              </Button>
            </div>
          </section>
          <Research data={data} />
          <SourceChecks data={data} />
        </>
      )}
      {mode === "history" && <History data={data} />}
      <Transfer open={transfer} onOpenChange={setTransfer} refresh={refresh} />
    </div>
  );
}

function Setup({
  data,
  active,
  onStart,
  onTransfer,
}: {
  data: ProductReport;
  active: boolean;
  onStart: () => void;
  onTransfer: () => void;
}) {
  const steps = [
    ["Veritabanı hazır", true],
    ["Gerçek kayıtlar aktarıldı", data.counts.real > 0],
    [
      "Araştırma worker’ı çalışıyor",
      data.investment.researchLoop.scheduler.status === "RUNNING",
    ],
    [
      "Kaynak ayrıştırması doğrulandı",
      data.investment.researchLoop.history.some((r) => r.parsedSources > 0),
    ],
    ["İlk araştırma gerçekleştirildi", data.counts.researchRuns > 0],
  ] as const;
  return (
    <section className="v2-setup" aria-label="İlk kurulum durumu">
      <div>
        <Pill tone="amber">İlk kurulum</Pill>
        <h2>Bu ortamda henüz gerçek ilan yok.</h2>
        <p>
          Cloud’da bulunan kayıtlar Windows’a otomatik taşınmaz. Araştırma
          paketini yükleyin veya izinli kaynaklarda ilk araştırmayı başlatın.
        </p>
        <div className="v2-actions">
          <Button variant="outline" onClick={onTransfer}>
            <Upload size={16} />
            Araştırma paketi yükle
          </Button>
          <Button disabled={active} onClick={onStart}>
            İlk araştırmayı başlat <ArrowRight size={16} />
          </Button>
        </div>
      </div>
      <ol className="v2-checklist">
        {steps.map(([label, done]) => (
          <li key={label}>
            <CheckCircle2
              size={17}
              className={done ? "checked" : "unchecked"}
            />
            <span>{label}</span>
            <small>{done ? "Hazır" : "Bekliyor"}</small>
          </li>
        ))}
      </ol>
    </section>
  );
}
function Overview({
  data,
  active,
  onTransfer,
}: {
  data: ProductReport;
  active: boolean;
  onTransfer: () => void;
}) {
  const report = data.investment,
    scheduler = report.researchLoop.scheduler;
  const last = report.researchLoop.history.find(
    (r) =>
      ["COMPLETED", "PARTIAL", "SUCCEEDED"].includes(r.status) &&
      r.parsedSources > 0,
  );
  const opportunities = report.pilots.reduce((n, p) => n + p.reviewCount, 0);
  return (
    <>
      <section className="v2-agent-bar">
        <span
          className={`v2-status-dot ${active || scheduler.status === "RUNNING" ? "online" : ""}`}
        />
        <div>
          <strong>
            {active
              ? "Ajan kaynakları araştırıyor"
              : scheduler.status === "RUNNING"
                ? "Ajan zamanlanmış araştırmaya hazır"
                : "Ajan bekliyor · worker doğrulanmadı"}
          </strong>
          <span>
            Son veri içeren araştırma: {dateTime(last?.completedAt)}
            {last?.status === "PARTIAL" ? " · kısmi sonuç" : ""}
          </span>
        </div>
        <div className="v2-next">
          <Clock size={16} />
          <span>
            Sonraki zamanlanmış araştırma
            <strong>
              {scheduler.nextPlannedRunAt
                ? dateTime(scheduler.nextPlannedRunAt)
                : "Çalışan worker bekleniyor"}
            </strong>
          </span>
        </div>
        <Link href="/arastirma-merkezi" aria-label="Araştırma Merkezi’ni aç">
          <ArrowUpRight size={20} />
        </Link>
      </section>
      {data.counts.real > 0 && (
        <div className="v2-stats">
          {[
            [
              "Takip edilen gerçek ilan",
              data.counts.real,
              `${data.counts.properties} gayrimenkul · ${data.counts.vehicles} SUV`,
            ],
            [
              "Son turda yeni kayıt",
              report.researchLoop.history[0]?.inserted ?? 0,
              last ? "Son araştırma sonucu" : "Araştırma bekleniyor",
            ],
            [
              "7 günlük fiyat düşüşü",
              data.recentDrops.length,
              "Ardışık geçerli gözlemler",
            ],
            ["İncelemeye değer", opportunities, "Yeterli kanıt gerektirir"],
          ].map(([label, value, note]) => (
            <div className="v2-stat" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
              <small>{note}</small>
            </div>
          ))}
        </div>
      )}
      <div className="v2-domains">
        {report.pilots.map((p) => (
          <section
            className={`v2-domain ${p.pilotKey === "MARMARA_SUV" ? "vehicle" : "property"}`}
            key={p.pilotKey}
          >
            <div className="v2-domain-art">
              {p.pilotKey === "MARMARA_SUV" ? (
                <Car size={88} strokeWidth={1.2} />
              ) : (
                <Home size={88} strokeWidth={1.2} />
              )}
              <span>
                ARAŞTIRMA ALANI / {p.pilotKey === "MARMARA_SUV" ? "02" : "01"}
              </span>
            </div>
            <div className="v2-domain-body">
              <div className="v2-inline">
                <h2>
                  {p.pilotKey === "SILIVRI"
                    ? "Silivri Gayrimenkul"
                    : "Marmara SUV"}
                </h2>
                <Pill>{p.databaseCount} gerçek ilan</Pill>
              </div>
              <p>
                {p.pilotKey === "SILIVRI"
                  ? "Mahalle, tür, tapu ve imar sınıfları ayrı değerlendirilir. Yayıncı beyanı hukuki doğrulama değildir."
                  : "Marka, model, donanım ve kondisyon eşleşmeden farklı araçlar fiyat emsali sayılmaz."}
              </p>
              <div className="v2-domain-metrics">
                <span>
                  <b>{p.activeCount}</b> Teyitli güncel kayıt
                </span>
                <span>
                  <b>{p.comparableSupported}</b> Yeterli emsal
                </span>
                <span>
                  <b>{p.archiveCount}</b> Arşiv / eski gözlem
                </span>
              </div>
              <div className="v2-domain-bottom">
                <span>
                  <ShieldAlert size={15} />
                  {p.pilotKey === "SILIVRI"
                    ? "Tapu / imar kanıtı ve emsal eksik"
                    : "Hasar / kondisyon kanıtı eksik"}
                </span>
                <Link href={`/kesfet?pilot=${p.pilotKey}`}>
                  Adayları incele <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </section>
        ))}
      </div>
      <Market data={data} />
      <div className="v2-bottom-grid">
        <section className="v2-panel">
          <div className="v2-section-heading">
            <h2>Son araştırma faaliyetleri</h2>
            <Link href="/arastirma-merkezi">
              Tümünü gör <ArrowUpRight size={15} />
            </Link>
          </div>
          {report.researchLoop.history.length ? (
            report.researchLoop.history.slice(0, 3).map((r) => (
              <div className="v2-activity" key={r.id}>
                <span className="v2-activity-icon">
                  <Activity size={18} />
                </span>
                <div>
                  <strong>
                    {r.strategy?.segmentId === "MARMARA_SUV"
                      ? "Marmara SUV"
                      : "Silivri gayrimenkul"}{" "}
                    · {textStatus(r.status)}
                  </strong>
                  <p>
                    {r.checkedUrls} kontrol · {r.inserted} yeni kayıt ·{" "}
                    {r.priceChanges} fiyat değişimi
                  </p>
                </div>
                <time>{dateTime(r.completedAt ?? r.startedAt)}</time>
              </div>
            ))
          ) : (
            <div className="v2-empty">
              <Search />
              <h3>Araştırma geçmişi henüz yok</h3>
              <p>Başlatılan gerçek çalışmalar burada görünecek.</p>
            </div>
          )}
        </section>
        <section className="v2-panel">
          <span className="v2-eyebrow">SONRAKİ ARAŞTIRMA HEDEFİ</span>
          <h2>{data.nextStrategy.label}</h2>
          <p className="v2-target-reason">{data.nextStrategy.reason}</p>
          {data.nextStrategy.deferredUntil && (
            <Pill tone="amber">
              En erken: {dateTime(data.nextStrategy.deferredUntil)}
            </Pill>
          )}
          <Link className="v2-text-link" href="/arastirma-merkezi">
            Stratejiyi ve kaynakları incele <ArrowRight size={16} />
          </Link>
        </section>
      </div>
      <section className="v2-footnote">
        <span>
          {data.counts.demo} demo kayıt gerçek sonuçlardan ayrı tutuluyor.{" "}
          {report.researchLoop.blockedResourceCount} kaynak erişim / izin
          incelemesinde.
        </span>
        <button onClick={onTransfer}>
          Cloud kayıtlarını aktar <Upload size={15} />
        </button>
      </section>
    </>
  );
}

function Market({ data }: { data: ProductReport }) {
  const report = data.investment;
  const latestCpi = report.facts
    .filter((f) => /^cpi-/.test(f.id))
    .sort((a, b) => (b.period ?? "").localeCompare(a.period ?? ""))[0];
  const facts = report.facts.filter((f) =>
    ["policy-rate", "housing-istanbul", latestCpi?.id].includes(f.id),
  );
  return (
    <section className="v2-panel v2-market">
      <div className="v2-section-heading">
        <div>
          <span className="v2-eyebrow">PİYASA KOŞULLARI</span>
          <h2>Kararların ekonomik bağlamı</h2>
        </div>
        <Pill>Resmî kaynaklar</Pill>
      </div>
      <div className="v2-market-facts">
        {facts.map((f) => (
          <div key={f.id}>
            <span>{f.label}</span>
            <strong>
              {f.value == null
                ? "Açıklanmamış"
                : new Intl.NumberFormat("tr-TR").format(f.value)}
              {f.unit}
            </strong>
            <small>
              {f.period} ·{" "}
              {f.current ? "Güncel kanıt" : "Arşiv — güncelliği doğrulanmadı"}
            </small>
          </div>
        ))}
      </div>
      <p>
        Politika faizi mevduat / kredi teklifi değildir. İstanbul konut endeksi
        Silivri arazi değerlemesi değildir; kira, satış mevcudiyeti ve net
        getiri doğrulanmadı.
      </p>
      <details>
        <summary>Kaynaklar ve hesaplama yöntemi</summary>
        <SourceLibrary
          data={data}
          factIds={[...facts.map((f) => f.id), ...report.realChangeFactIds]}
        />
        <p>
          {report.istanbulRealChange == null
            ? "Güncel ve aynı döneme ait kanıt eksik; reel değişim hesaplanmadı."
            : `Aynı dönem İstanbul konut endeksi / TÜFE reel değişimi: %${report.istanbulRealChange}. (1 + nominal değişim) / (1 + enflasyon) − 1.`}
        </p>
      </details>
    </section>
  );
}

type Filters = {
  q: string;
  category: string;
  location: string;
  min: string;
  max: string;
  areaMin: string;
  areaMax: string;
  make: string;
  fuel: string;
  yearMin: string;
  kmMax: string;
  trim: string;
  legal: string;
  zoning: string;
  fresh: string;
  verdict: string;
};
const initialFilters: Filters = {
  q: "",
  category: "",
  location: "",
  min: "",
  max: "",
  areaMin: "",
  areaMax: "",
  make: "",
  fuel: "",
  yearMin: "",
  kmMax: "",
  trim: "",
  legal: "",
  zoning: "",
  fresh: "",
  verdict: "",
};
function Candidates({
  data,
  analysis,
  watchOnly = false,
}: {
  data: ProductReport;
  analysis: boolean;
  watchOnly?: boolean;
}) {
  const [pilot, setPilot] = useState("SILIVRI"),
    [archive, setArchive] = useState(false),
    [filters, setFilters] = useState(initialFilters),
    [detail, setDetail] = useState<Decision | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [compare, setCompare] = useState(false);
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("pilot");
    if (value === "MARMARA_SUV") setPilot(value);
  }, []);
  const report = data.investment.pilots.find((p) => p.pilotKey === pilot)!;
  const allItems = archive
    ? [...report.decisions.filter((d) => !d.priceCurrent), ...report.archive]
    : report.decisions;
  const storedFor = (d: Decision) => data.listings.find((l) => l.id === d.id);
  const items = watchOnly
    ? allItems.filter((d) => !!storedFor(d)?.watch)
    : allItems;
  const set = (key: keyof Filters, value: string) =>
    setFilters((f) => ({ ...f, [key]: value }));
  const knownValues = (get: (l: Item) => string | null | undefined) =>
    [
      ...new Set(
        data.listings
          .filter((l) =>
            pilot === "MARMARA_SUV"
              ? l.category === "ARABA"
              : l.category !== "ARABA",
          )
          .map(get)
          .filter((s): s is string => !!s),
      ),
    ].sort();
  const filtered = items.filter((d) => {
    const l = storedFor(d),
      area = l?.land?.sizeM2 ?? l?.property?.sizeM2 ?? l?.property?.netM2;
    return (
      (!filters.q ||
        `${d.title} ${d.location}`
          .toLocaleLowerCase("tr")
          .includes(filters.q.toLocaleLowerCase("tr"))) &&
      (!filters.category || d.category === filters.category) &&
      (!filters.location ||
        (pilot === "SILIVRI" ? l?.neighborhood : l?.province) ===
          filters.location) &&
      (!filters.min ||
        (d.price != null && Number(d.price) >= Number(filters.min))) &&
      (!filters.max ||
        (d.price != null && Number(d.price) <= Number(filters.max))) &&
      (!filters.areaMin ||
        (area != null && Number(area) >= Number(filters.areaMin))) &&
      (!filters.areaMax ||
        (area != null && Number(area) <= Number(filters.areaMax))) &&
      (!filters.make || l?.vehicle?.make === filters.make) &&
      (!filters.fuel || l?.vehicle?.fuel === filters.fuel) &&
      (!filters.trim || l?.vehicle?.trim === filters.trim) &&
      (!filters.yearMin ||
        (l?.vehicle?.modelYear != null &&
          l.vehicle.modelYear >= Number(filters.yearMin))) &&
      (!filters.kmMax ||
        (l?.vehicle?.mileage != null &&
          l.vehicle.mileage <= Number(filters.kmMax))) &&
      (!filters.legal ||
        (l?.land?.sharedOwnership ??
          l?.property?.legalStatus ??
          "Bilinmiyor") === filters.legal) &&
      (!filters.zoning ||
        (l?.land?.zoning ?? "Bilinmiyor") === filters.zoning) &&
      (!filters.fresh ||
        (filters.fresh === "current" ? d.priceCurrent : !d.priceCurrent)) &&
      (!filters.verdict || d.verdict === filters.verdict)
    );
  });
  function select(id: string) {
    setSelected((s) =>
      s.includes(id)
        ? s.filter((x) => x !== id)
        : s.length < 3
          ? [...s, id]
          : s,
    );
  }
  const field = (key: keyof Filters, label: string, type = "number") => (
    <label>
      {label}
      <input
        type={type}
        min={type === "number" ? 0 : undefined}
        value={filters[key]}
        onChange={(e) => set(key, e.target.value)}
      />
    </label>
  );
  const dropdown = (key: keyof Filters, label: string, values: string[]) => (
    <label>
      {label}
      <select value={filters[key]} onChange={(e) => set(key, e.target.value)}>
        <option value="">Tümü</option>
        {values.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      <div className="v2-browse-bar">
        <div className="v2-tabs" aria-label="Araştırma alanı">
          {[
            ["SILIVRI", "Silivri Gayrimenkul", Home],
            ["MARMARA_SUV", "Marmara SUV", Car],
          ].map(([key, label, Icon]) => {
            const Mark = Icon as typeof Home;
            return (
              <button
                key={key as string}
                className={pilot === key ? "active" : ""}
                onClick={() => {
                  setPilot(key as string);
                  setFilters(initialFilters);
                  setSelected([]);
                }}
              >
                <Mark size={17} />
                {label as string}
              </button>
            );
          })}
        </div>
        <button
          className={`v2-archive-toggle ${archive ? "active" : ""}`}
          aria-pressed={archive}
          onClick={() => setArchive(!archive)}
        >
          <Layers size={16} />
          {archive
            ? "Gerçek kayıtlara dön"
            : `Geçmiş araştırma arşivi (${report.archiveCount})`}
        </button>
      </div>
      {analysis && <Market data={data} />}
      {archive && (
        <p className="v2-notice">
          Geçmiş araştırma arşivi. Bu fiyatlar güncel canlı ilan veya yatırım
          fırsatı değildir; zamanları değiştirilmedi.
        </p>
      )}
      <section className="v2-filters" aria-label="İlan filtreleri">
        <label className="v2-search">
          İlan ara
          <div>
            <Search size={16} />
            <input
              placeholder="Başlık veya konum"
              value={filters.q}
              onChange={(e) => set("q", e.target.value)}
            />
          </div>
        </label>
        {dropdown(
          "location",
          pilot === "SILIVRI" ? "Mahalle" : "İl",
          knownValues((l) =>
            pilot === "SILIVRI" ? l.neighborhood : l.province,
          ),
        )}
        {pilot === "SILIVRI" ? (
          <label>
            Taşınmaz türü
            <select
              value={filters.category}
              onChange={(e) => set("category", e.target.value)}
            >
              <option value="">Tümü</option>
              {["EV", "ARSA", "TARLA"].map((k) => (
                <option key={k} value={k}>
                  {categoryLabels[k as "EV"]}
                </option>
              ))}
            </select>
          </label>
        ) : (
          dropdown(
            "make",
            "Marka",
            knownValues((l) => l.vehicle?.make),
          )
        )}
        {field("min", "En düşük fiyat (₺)")}
        {field("max", "En yüksek fiyat (₺)")}
        <details>
          <summary>Diğer filtreler</summary>
          <div className="v2-filter-more">
            {pilot === "SILIVRI" ? (
              <>
                {field("areaMin", "En az m²")}
                {field("areaMax", "En çok m²")}
                {dropdown("legal", "Tapu / hisse bilgisi", [
                  ...knownValues(
                    (l) => l.land?.sharedOwnership ?? l.property?.legalStatus,
                  ),
                  "Bilinmiyor",
                ])}
                {dropdown("zoning", "İmar bilgisi", [
                  ...knownValues((l) => l.land?.zoning),
                  "Bilinmiyor",
                ])}
              </>
            ) : (
              <>
                {dropdown(
                  "fuel",
                  "Yakıt",
                  knownValues((l) => l.vehicle?.fuel),
                )}
                {dropdown(
                  "trim",
                  "Donanım",
                  knownValues((l) => l.vehicle?.trim),
                )}
                {field("yearMin", "En eski model yılı")}
                {field("kmMax", "En çok kilometre")}
              </>
            )}
            {dropdown("verdict", "Araştırma kararı", [
              "İncelemeye değer",
              "Riskli",
              "Yetersiz veri",
            ])}
            <label>
              Kaynak güncelliği
              <select
                value={filters.fresh}
                onChange={(e) => set("fresh", e.target.value)}
              >
                <option value="">Tümü</option>
                <option value="current">İlan ve fiyat teyidi var</option>
                <option value="old">Eski / uzlaştırılmamış</option>
              </select>
            </label>
            <Button variant="ghost" onClick={() => setFilters(initialFilters)}>
              Filtreleri temizle
            </Button>
          </div>
        </details>
      </section>
      <div className="v2-results-heading">
        <p>
          <strong>{filtered.length}</strong>{" "}
          {archive ? "arşiv adayı" : "gerçek veritabanı ilanı"} ·{" "}
          {report.comparableSupported} yeterli emsale sahip fırsat
        </p>
        <Pill>Öncelik ≠ yatırım puanı</Pill>
      </div>
      {!filtered.length && (
        <div className="v2-empty">
          <Search size={32} />
          <h2>
            {items.length
              ? "Bu filtrelerle eşleşen ilan yok"
              : "Bu pilotta henüz gerçek kayıt yok"}
          </h2>
          <p>
            {items.length
              ? "Filtreleri değiştirerek kayıtları inceleyin."
              : "Araştırma başlatın veya Cloud araştırma paketini yükleyin. Demo ve eski JSON adayları gerçek ilan sayılmaz."}
          </p>
          <Link href="/arastirma-merkezi" className="v2-text-link">
            Araştırma Merkezi’ni aç <ArrowRight size={16} />
          </Link>
        </div>
      )}
      <div className="v2-candidate-grid">
        {filtered.map((d) => (
          <CandidateCard
            key={d.id}
            d={d}
            listing={storedFor(d)}
            name={sourceName(d, data)}
            onOpen={() => setDetail(d)}
            onSelect={() => select(d.id)}
            selected={selected.includes(d.id)}
            selectDisabled={
              !storedFor(d) ||
              (selected.length >= 3 && !selected.includes(d.id))
            }
          />
        ))}
      </div>
      {selected.length > 0 && (
        <div className="v2-compare-tray">
          <Scale size={19} />
          <strong>{selected.length} aday seçildi</strong>
          <span>Yan yana inceleme; uygun olmayanlar emsal sayılmaz.</span>
          <Button
            disabled={selected.length < 2}
            onClick={() => setCompare(true)}
          >
            Karşılaştır
          </Button>
          <Button variant="ghost" onClick={() => setSelected([])}>
            Temizle
          </Button>
        </div>
      )}
      <CandidateDetail d={detail} data={data} onClose={() => setDetail(null)} />
      <Comparison
        open={compare}
        onOpenChange={setCompare}
        items={data.listings.filter((l) => selected.includes(l.id))}
        decisions={report.decisions}
      />
    </>
  );
}

function CandidateCard({
  d,
  listing,
  name,
  onOpen,
  onSelect,
  selected,
  selectDisabled,
}: {
  d: Decision;
  listing?: Item;
  name: string;
  onOpen: () => void;
  onSelect: () => void;
  selected: boolean;
  selectDisabled: boolean;
}) {
  const area =
    listing?.land?.sizeM2 ??
    listing?.property?.sizeM2 ??
    listing?.property?.netM2;
  const v = listing?.vehicle;
  return (
    <article className={`v2-candidate ${selected ? "selected" : ""}`}>
      <div
        className={`v2-card-art ${d.category === "ARABA" ? "vehicle" : "property"}`}
      >
        <span className="v2-card-category">
          {d.category === "ARABA"
            ? "SUV / CROSSOVER"
            : categoryLabels[d.category]}
        </span>
        {d.category === "ARABA" ? (
          <Car size={48} strokeWidth={1.2} />
        ) : (
          <Layers size={48} strokeWidth={1.2} />
        )}
        <span className="v2-card-source">{name}</span>
      </div>
      <div className="v2-card-content">
        <div className="v2-inline">
          <Pill
            tone={
              d.verdict === "Riskli"
                ? "red"
                : d.verdict === "İncelemeye değer"
                  ? "green"
                  : "amber"
            }
          >
            {d.verdict}
          </Pill>
          <Pill>
            {d.quality?.label ??
              "Sayfa yeniden görüldü; satış/fiyat teyidi yok"}
          </Pill>
        </div>
        <button className="v2-card-title" onClick={onOpen}>
          <h2>{d.title}</h2>
        </button>
        <p className="v2-location">
          <MapPin size={14} />
          {d.location}
        </p>
        <strong className="v2-price">
          {d.price == null ? "Fiyat açıklanmamış" : money(d.price)}
        </strong>
        <div className="v2-specs">
          {v ? (
            <>
              <span>{v.modelYear ?? "Yıl eksik"}</span>
              <span>
                {v.mileage == null
                  ? "Km eksik"
                  : `${new Intl.NumberFormat("tr").format(v.mileage)} km`}
              </span>
              <span>{v.fuel ?? "Yakıt eksik"}</span>
              <span>{v.trim ?? "Donanım eksik"}</span>
            </>
          ) : (
            <>
              <span>{area != null ? `${String(area)} m²` : "Alan eksik"}</span>
              <span>
                {d.unitPrice
                  ? `${money(d.unitPrice)} / m²`
                  : "Birim fiyat doğrulanamadı"}
              </span>
            </>
          )}
        </div>
        <p className="v2-risk-line">
          <ShieldAlert size={15} />
          {riskTitle(d)}
        </p>
        <small>
          Sayfa kontrolü: {dateTime(d.pageCheckedAt ?? d.observedAt)} ·{" "}
          {d.assessment?.sampleCount ?? 0} uygun emsal
        </small>
        <div className="v2-card-bottom">
          <button onClick={onOpen}>
            Analizi aç <ArrowUpRight size={15} />
          </button>
          <a
            href={safeLink(d.sourceUrl)}
            target="_blank"
            rel="noreferrer"
            aria-label={`${d.title} kaynak bağlantısı`}
          >
            Kaynak ↗
          </a>
          <label>
            <input
              type="checkbox"
              checked={selected}
              disabled={selectDisabled}
              onChange={onSelect}
            />
            Karşılaştır
          </label>
        </div>
      </div>
    </article>
  );
}

function Reasons({ items, data }: { items: Reason[]; data: ProductReport }) {
  return (
    <ul className="v2-reasons">
      {items.map((r, i) => (
        <li key={i}>
          {r.text}
          {r.evidenceIds.length > 0 && (
            <small>
              Kanıt:{" "}
              {r.evidenceIds
                .map(
                  (id) =>
                    data.investment.facts.find((f) => f.id === id)?.label ?? id,
                )
                .join(" · ")}
            </small>
          )}
        </li>
      ))}
    </ul>
  );
}
function SourceLibrary({
  data,
  factIds,
  sourceUrls = [],
}: {
  data: ProductReport;
  factIds: string[];
  sourceUrls?: string[];
}) {
  const facts = data.investment.facts.filter((f) => factIds.includes(f.id)),
    sourceIds = new Set(facts.map((f) => f.sourceId));
  return (
    <div className="v2-source-library">
      {data.investment.sources
        .filter((s) => sourceIds.has(s.id) || sourceUrls.includes(s.url))
        .map((s) => (
          <section key={s.id}>
            <div className="v2-inline">
              <a href={safeLink(s.url)} target="_blank" rel="noreferrer">
                {s.name} <ArrowUpRight size={14} />
              </a>
              <Pill>{s.kind === "OFFICIAL" ? "Resmî" : "Yayıncı beyanı"}</Pill>
              <Pill tone={s.fresh ? "green" : "amber"}>
                {s.fresh
                  ? "Kaynak belgesi yeniden kontrol edildi"
                  : "Arşiv / geçersiz"}
              </Pill>
            </div>
            <small>Kaynak gözlemi: {dateTime(s.retrievedAt)}</small>
            {facts
              .filter((f) => f.sourceId === s.id)
              .map((f) => (
                <p id={`fact-${f.id}`} key={f.id}>
                  <strong>{f.label}</strong>:{" "}
                  {f.value != null
                    ? `${f.value}${f.unit ?? ""}`
                    : (f.text ?? "Nitel kaynak beyanı")}{" "}
                  {f.period && `(${f.period})`}
                </p>
              ))}
          </section>
        ))}
    </div>
  );
}
function CandidateDetail({
  d,
  data,
  onClose,
}: {
  d: Decision | null;
  data: ProductReport;
  onClose: () => void;
}) {
  const l = d ? data.listings.find((l) => l.id === d.id) : undefined;
  const [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  async function watch() {
    if (!l) return;
    setSaving(true);
    try {
      await api("watchlist", { listingId: l.id, saved: !l.watch });
      window.dispatchEvent(new Event("radar:refresh"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog
      open={!!d}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="v2-detail">
        <DialogTitle asChild>
          <h2>{d?.title}</h2>
        </DialogTitle>
        <DialogDescription>
          {d?.location} · Kaynaklı yatırım araştırması
        </DialogDescription>
        {d && (
          <>
            <div className="v2-detail-price">
              <strong>{money(d.price)}</strong>
              <Pill tone={d.verdict === "Riskli" ? "red" : "amber"}>
                {d.verdict}
              </Pill>
            </div>
            <p>
              {riskTitle(d)}.{" "}
              {d.quality?.label ??
                "Geçmiş veya teyitsiz fiyat; güncel emsal değildir."}
            </p>
            <p>
              Yayın: {d.publishedAt ?? "Bilinmiyor"} · Kaynak güncellemesi:{" "}
              {d.sourceUpdatedAt ? dateTime(d.sourceUpdatedAt) : "Bilinmiyor"}
            </p>
            <p>
              Fiyat teyidi:{" "}
              {d.priceVerifiedAt ? dateTime(d.priceVerifiedAt) : "Yok"} · Satış
              teyidi:{" "}
              {d.availabilityVerifiedAt
                ? dateTime(d.availabilityVerifiedAt)
                : "Yok"}
            </p>
            <div className="v2-actions">
              <a
                className="v2-link-button"
                href={safeLink(d.sourceUrl)}
                target="_blank"
                rel="noreferrer"
              >
                Orijinal kaynağı aç <ArrowUpRight size={16} />
              </a>
              {l && (
                <Button variant="outline" disabled={saving} onClick={watch}>
                  <Bookmark size={16} />
                  {l.watch ? "Takipten çıkar" : "Takibe al"}
                </Button>
              )}
            </div>
            {error && <ErrorBox message={error} />}
            <section>
              <h3>İlan özellikleri</h3>
              <p>
                {d.features.length
                  ? d.features.join(" · ")
                  : "Uzlaştırılmış özellik bilgisi eksik."}
              </p>
              {l?.vehicle && (
                <p>
                  {l.vehicle.make} {l.vehicle.model} · {l.vehicle.trim} ·{" "}
                  {l.vehicle.modelYear} ·{" "}
                  {l.vehicle.mileage?.toLocaleString("tr")} km ·{" "}
                  {l.vehicle.fuel} · Hasar:{" "}
                  {l.vehicle.damageHistory ?? "Doğrulanmadı"}
                </p>
              )}
              {l?.land && (
                <p>
                  {String(l.land.sizeM2 ?? "Alan eksik")} m² · Ada/parsel:{" "}
                  {l.land.parcelNumber ?? "Eksik"} · İmar:{" "}
                  {l.land.zoning ?? "Doğrulanmadı"} · Tapu/hisse:{" "}
                  {l.land.sharedOwnership ?? "Doğrulanmadı"}
                </p>
              )}
            </section>
            <section>
              <h3>Emsal yeterliliği</h3>
              <p>
                {d.assessment?.sampleCount ?? 0} uygun gerçek emsal.{" "}
                {d.assessment?.score == null
                  ? "En az beş bağımsız, güncel ve uygun emsal / özne kanıtı olmadan yatırım fiyat avantajı puanı üretilemez."
                  : `Fiyat motoru puanı ${d.assessment.score}; getiri garantisi değildir.`}
              </p>
            </section>
            <section>
              <h3>Fiyat geçmişi</h3>
              {l ? (
                <PriceObservations listing={l} />
              ) : (
                <p>
                  Bu arşiv adayı veritabanına fiyatlı ilan olarak kaydedilmedi.
                </p>
              )}
            </section>
            <section>
              <h3>Kaynaklı yatırım tezi</h3>
              {d.whyCould.length ? (
                <Reasons items={d.whyCould} data={data} />
              ) : (
                <p>
                  Yeterli güncel kanıt bulunmadığı için olumlu yatırım gerekçesi
                  üretilmedi.
                </p>
              )}
            </section>
            <section>
              <h3>Riskler</h3>
              <Reasons items={d.whyNot} data={data} />
            </section>
            <section>
              <h3>Sonraki araştırma ihtiyacı</h3>
              <ul>
                {d.missing.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </section>
            <section>
              <h3>Daha iyi alternatifler</h3>
              <p>{d.alternatives}</p>
            </section>
            <details className="v2-deep">
              <summary>
                Derin araştırma · kaynaklar, yöntem ve karar geçmişi
              </summary>
              <p>
                Mahalle / hukuki sınıf ve araçta marka / model / donanım /
                kondisyon eşleşmesi gereklidir. Araştırma önceliği bir yatırım
                fırsatı puanı değildir; ilan fiyatları gerçekleşmiş satış
                fiyatları değildir.
              </p>
              <SourceLibrary
                data={data}
                sourceUrls={d.sourceUrl ? [d.sourceUrl] : []}
                factIds={[
                  ...new Set([
                    ...d.factIds,
                    ...d.whyCould.flatMap((r) => r.evidenceIds),
                    ...d.whyNot.flatMap((r) => r.evidenceIds),
                  ]),
                ]}
              />
              <h3>Karar neden değişti?</h3>
              {data.investment.researchLoop.history.flatMap((r) =>
                r.changes
                  .filter((c) => c.key === d.sourceUrl || c.key === d.id)
                  .map((c, i) => (
                    <p key={`${r.id}-${i}`}>
                      {dateTime(r.completedAt)} · {c.reason}
                      <br />
                      {c.kind === "PRICE_CHANGED" &&
                        `${money(c.before)} → ${money(c.after)}`}
                    </p>
                  )),
              )}
              <p>
                Kaynak eskimesi veya eksik kanıt, taşınmazın / aracın değerinin
                değiştiği anlamına gelmez.
              </p>
            </details>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PriceObservations({ listing }: { listing: Item }) {
  const prices = listing.prices;
  return (
    <>
      <div className="v2-price-summary">
        <span>
          İlk gözlem<b>{money(prices[0]?.price.toString())}</b>
        </span>
        <span>
          Son fiyat<b>{money(prices.at(-1)?.price.toString())}</b>
        </span>
        <span>
          Son kaynak gözlemi<b>{dateTime(listing.lastObservedAt)}</b>
        </span>
      </div>
      {prices.length > 1 ? (
        <PriceChart
          prices={prices as unknown as NonNullable<ListingView["prices"]>}
        />
      ) : (
        <div className="v2-empty-inline">
          Bir fiyat gözlemi var. Değişim grafiği için ikinci geçerli gözlem
          bekleniyor.
        </div>
      )}
      <div className="v2-table-scroll">
        <table className="v2-table">
          <thead>
            <tr>
              <th>Gözlem zamanı</th>
              <th>İstenen fiyat</th>
              <th>Olay</th>
            </tr>
          </thead>
          <tbody>
            {prices.map((p, i) => (
              <tr key={p.id}>
                <td>{dateTime(p.observedAt)}</td>
                <td>{money(p.price.toString())}</td>
                <td>
                  {i === 0
                    ? "İlk fiyat gözlemi"
                    : Number(p.price) === Number(prices[i - 1].price)
                      ? "Aynı fiyat tekrar gözlendi"
                      : Number(p.price) < Number(prices[i - 1].price)
                        ? "Fiyat düştü"
                        : "Fiyat yükseldi"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <small>
        Aynı fiyat yeniden kontrol edildiğinde kaynak zamanı ilerleyebilir;
        fiyat değişimi veya yeni bir indirim oluşmaz.
      </small>
    </>
  );
}
function History({ data }: { data: ProductReport }) {
  const [id, setId] = useState("");
  const selected = data.listings.find((l) => l.id === id) ?? data.listings[0];
  if (!selected)
    return (
      <div className="v2-empty">
        <Clock />
        <h2>Gerçek fiyat gözlemi henüz yok</h2>
        <p>
          Cloud paketini yükleyin veya araştırma başlatın. Boş fiyat grafiği
          üretilmez.
        </p>
        <Link href="/arastirma-merkezi">Araştırma Merkezi’ni aç</Link>
      </div>
    );
  return (
    <>
      <section className="v2-panel">
        <label className="v2-history-select">
          İlan seç
          <select value={selected.id} onChange={(e) => setId(e.target.value)}>
            {data.listings.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        </label>
        <h2>{selected.title}</h2>
        <PriceObservations listing={selected} />
      </section>
      <section className="v2-panel">
        <h2>Son 7 günlük gerçek fiyat düşüşleri</h2>
        {data.recentDrops.length ? (
          data.recentDrops.map((d) => (
            <p key={d.key}>
              {d.title}: {money(d.previousPrice)} → {money(d.newPrice)} ·{" "}
              {money(d.amount)} / %{Number(d.percentage).toFixed(2)} ·{" "}
              {dateTime(d.observedAt)}
            </p>
          ))
        ) : (
          <p>
            Ardışık geçerli gözlemler arasında son 7 güne ait indirim
            kaydedilmedi.
          </p>
        )}
      </section>
    </>
  );
}

function Research({ data }: { data: ProductReport }) {
  const cycle = data.investment.researchLoop,
    s = cycle.scheduler;
  const runningSummary =
    data.running?.summary &&
    typeof data.running.summary === "object" &&
    !Array.isArray(data.running.summary)
      ? data.running.summary
      : {};
  const progress =
    runningSummary.progress &&
    typeof runningSummary.progress === "object" &&
    !Array.isArray(runningSummary.progress)
      ? runningSummary.progress
      : {};
  return (
    <section className="v2-panel" aria-label="Araştırma döngüsü">
      <div className="v2-section-heading">
        <h2>Araştırma döngüsü</h2>
        <Pill tone={s.status === "RUNNING" ? "green" : "amber"}>
          {textStatus(s.status)}
        </Pill>
      </div>
      <div className="v2-worker-grid">
        <div>
          <span>Son heartbeat</span>
          <strong>{dateTime(s.lastHeartbeatAt)}</strong>
        </div>
        <div>
          <span>Son gerçek zamanlayıcı çalışması</span>
          <strong>{dateTime(s.lastTickAt)}</strong>
          <small>
            {s.lastResult?.startsWith("SCHEDULED_PROBE")
              ? "Gerçek zamanlayıcı denemesi"
              : (s.lastResult ?? "Çalışma yok")}
          </small>
        </div>
        <div>
          <span>Sonraki planlanan çalışma</span>
          <strong>{dateTime(s.nextPlannedRunAt)}</strong>
          <small>Europe/Istanbul · {s.schedule}</small>
        </div>
      </div>
      <p role="status">
        {data.dataAcquisition.configured
          ? "İzinli veri sağlayıcısı ayarları tanımlı; bağlantı ve gerçek veri başarısı çalışma sonuçlarıyla ayrıca doğrulanmalı."
          : "Yetkili güncel ilan veri akışı bağlı değil. Araştırma şu anda resmî ekonomik/bölgesel yardımcı kaynakları kontrol eder; eski sayfa fiyatlarını güncel emsal yapmaz."}
      </p>
      <p>
        {cycle.dailyRunCount
          ? `${cycle.dailyRunCount} günlük programla tamamlanan veya kısmi araştırma (son kayıtlar).`
          : "Günlük programla tamamlanan araştırma yok. Zamanlayıcı kodunun bulunması çalıştığını kanıtlamaz."}{" "}
        Bilgisayar ve Docker açık kalmalıdır.
      </p>
      <div className="v2-strategy">
        <Sparkles size={20} />
        <div>
          <strong>{data.nextStrategy.label}</strong>
          <p>{data.nextStrategy.reason}</p>
        </div>
      </div>
      {data.running && (
        <p className="v2-notice" role="status">
          Kaynak kontrolleri sürüyor: {data.running.segment}. İstekler sınırlı;
          {typeof progress.checkedUrls === "number"
            ? ` ${progress.checkedUrls} kontrol sonucu · ${progress.candidates ?? 0} aday. `
            : " izin ve erişim kontrolleri hazırlanıyor. "}{" "}
          Tamamlandığında fiyat ve karar sonuçları güncellenecek.
        </p>
      )}
      <div className="v2-section-heading">
        <h3>Araştırma geçmişi · {data.counts.researchRuns} kayıt</h3>
        <span>Son {cycle.history.length} çalışma</span>
      </div>
      {!cycle.history.length ? (
        <div className="v2-empty-inline">
          Araştırma döngüsü bu veritabanında henüz çalıştırılmadı. Eski JSON
          yalnızca arşivdir.
        </div>
      ) : (
        cycle.history.map((r) => (
          <details className="v2-run" key={r.id}>
            <summary>
              <span className="v2-run-status">
                <Activity size={17} />
                {textStatus(r.status)}
              </span>
              <span>
                <strong>{r.segment}</strong>
                <small>
                  {dateTime(r.startedAt)} ·{" "}
                  {r.trigger === "SCHEDULED_PROBE"
                    ? "Gerçek zamanlayıcı denemesi"
                    : r.trigger === "SCHEDULED"
                      ? "Günlük program"
                      : "Manuel araştırma"}
                </small>
              </span>
              <span>
                {r.inserted} yeni · {r.priceChanges} fiyat
              </span>
            </summary>
            <div className="v2-run-body">
              <p>
                {r.checkedUrls} kaynak kontrolü · {r.parsedSources} ayrıştırılan
                kaynak · {r.newCandidates} yeni aday · {r.decisionRevisions}{" "}
                karar güncellemesi · {r.invalidatedSources} geçersiz kanıt
              </p>
              <p>{r.strategy?.reason}</p>
              <small>Çalışma kimliği: {r.id}</small>
              <h3>Kararlar neden güncellendi?</h3>
              {r.changes.length ? (
                r.changes.map((c, i) => (
                  <p key={i}>
                    {c.reason}
                    {c.kind === "PRICE_CHANGED" &&
                      ` ${money(c.before)} → ${money(c.after)}`}
                  </p>
                ))
              ) : (
                <p>Kaydedilmiş fiyat / karar değişimi yok.</p>
              )}
              <h3>Kaynak kontrolleri ve engeller</h3>
              {r.checks.map((c, i) => (
                <div className="v2-check-row" key={i}>
                  <a href={safeLink(c.url)} target="_blank" rel="noreferrer">
                    {new URL(c.url).hostname}
                  </a>
                  <Pill>{textStatus(c.status)}</Pill>
                  <span>{c.reason}</span>
                </div>
              ))}
            </div>
          </details>
        ))
      )}
    </section>
  );
}
function SourceChecks({ data }: { data: ProductReport }) {
  return (
    <section className="v2-panel">
      <div className="v2-section-heading">
        <h2>Kaynak erişimleri ve izinler</h2>
        <Pill>
          {data.investment.researchLoop.blockedResourceCount} engel / inceleme
        </Pill>
      </div>
      <p>
        Engellenen kaynaklar aşılmaz. Başka ortamdaki başarılı kontrol
        Windows’ta yeni bir bağlantı başarı kanıtı değildir.
      </p>
      <div className="v2-source-grid">
        {data.sources.map((s) => (
          <div key={s.id}>
            <strong>{s.name}</strong>
            <Pill>
              {s.lastSuccessAt
                ? "Kayıtlı başarılı gözlem"
                : "Henüz doğrulanmadı"}
            </Pill>
            <small>
              {dateTime(s.lastSuccessAt)} · {s.regions.join(" · ")}
            </small>
          </div>
        ))}
      </div>
      <details>
        <summary>Tüm kaynak kontrol sonuçları</summary>
        {data.resources.map((r) => (
          <div className="v2-check-row" key={r.url}>
            <span>{r.host}</span>
            <Pill>{textStatus(r.state)}</Pill>
            <small>{dateTime(r.lastCheckedAt)}</small>
            <p>{r.lastReason}</p>
          </div>
        ))}
      </details>
    </section>
  );
}

function Transfer({
  open,
  onOpenChange,
  refresh,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  refresh: () => void;
}) {
  const [bundle, setBundle] = useState<unknown>(),
    [preview, setPreview] = useState<{
      inserted: number;
      matched: number;
      pricesAdded: number;
      runsAdded: number;
      applied: boolean;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load(file?: File) {
    setBundle(undefined);
    setPreview(null);
    setError("");
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 14_500_000)
        throw new Error("Paket 14,5 MB sınırını aşıyor.");
      const value = JSON.parse(await file.text());
      const p = await api<NonNullable<typeof preview>>("research/transfer", {
        bundle: value,
        apply: false,
      });
      setBundle(value);
      setPreview(p);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function apply() {
    setBusy(true);
    setError("");
    try {
      setPreview(await api("research/transfer", { bundle, apply: true }));
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle asChild>
          <h2>Cloud araştırma kayıtlarını aktar</h2>
        </DialogTitle>
        <DialogDescription>
          Şifre, e-posta ve demo içermez. Mevcut kayıtlar silinmez; eski
          fiyatların gözlem zamanları korunur.
        </DialogDescription>
        <label className="v2-upload">
          Araştırma paketi (.json)
          <input
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={(e) => load(e.target.files?.[0])}
          />
        </label>
        {error && <ErrorBox message={error} />}{" "}
        {busy && <p role="status">Paket doğrulanıyor…</p>}
        {preview && (
          <div className="v2-transfer-preview" role="status">
            <h3>
              {preview.applied
                ? "Aktarım tamamlandı"
                : "Aktarım önizlemesi — henüz kayıt yazılmadı"}
            </h3>
            <p>
              {preview.inserted} yeni ilan · {preview.matched} mevcut eşleşme ·{" "}
              {preview.pricesAdded} fiyat gözlemi · {preview.runsAdded}{" "}
              araştırma çalışması
            </p>
            {!preview.applied && (
              <Button disabled={busy} onClick={apply}>
                Doğrulanan paketi içe aktar
              </Button>
            )}
          </div>
        )}
        <p className="v2-small-note">
          SHA-256 değişiklik tespit eder, yayıncı doğruluğunu garanti etmez.
          Yalnızca kendi Cloud ortamınızdan aldığınız paketi yükleyin.
        </p>
      </DialogContent>
    </Dialog>
  );
}
function Comparison({
  open,
  onOpenChange,
  items,
  decisions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: Item[];
  decisions: Decision[];
}) {
  const warnings = comparisonWarnings(
    items as unknown as ListingView[],
    decisions,
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="v2-detail">
        <DialogTitle asChild>
          <h2>Aday karşılaştırması</h2>
        </DialogTitle>
        <DialogDescription>
          Yan yana özellik incelemesi, otomatik fiyat emsali veya yatırım
          önerisi değildir.
        </DialogDescription>
        {warnings.length > 0 && (
          <div className="v2-notice">
            {warnings.map((w) => (
              <p key={w}>{w}</p>
            ))}
          </div>
        )}
        <div className="v2-table-scroll">
          <table className="v2-table">
            <thead>
              <tr>
                <th>Özellik</th>
                {items.map((l) => (
                  <th key={l.id}>{l.title}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                ["İstenen fiyat", (l: Item) => money(l.price.toString())],
                [
                  "Konum",
                  (l: Item) =>
                    [l.province, l.district, l.neighborhood]
                      .filter(Boolean)
                      .join(" / "),
                ],
                [
                  "Tür / model",
                  (l: Item) =>
                    l.vehicle
                      ? `${l.vehicle.make} ${l.vehicle.model} ${l.vehicle.trim}`
                      : categoryLabels[l.category],
                ],
                [
                  "Alan / kilometre",
                  (l: Item) =>
                    l.vehicle
                      ? `${l.vehicle.mileage ?? "Eksik"} km`
                      : `${l.land?.sizeM2 ?? l.property?.sizeM2 ?? "Eksik"} m²`,
                ],
                [
                  "Tapu / hasar",
                  (l: Item) =>
                    l.vehicle?.damageHistory ??
                    l.land?.sharedOwnership ??
                    l.property?.legalStatus ??
                    "Doğrulanmadı",
                ],
                [
                  "İmar / yıl",
                  (l: Item) =>
                    l.vehicle?.modelYear ?? l.land?.zoning ?? "Doğrulanmadı",
                ],
                ["Son gözlem", (l: Item) => dateTime(l.lastObservedAt)],
              ].map(([label, get]) => (
                <tr key={label as string}>
                  <th>{label as string}</th>
                  {items.map((l) => (
                    <td key={l.id}>
                      {(get as (l: Item) => React.ReactNode)(l)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

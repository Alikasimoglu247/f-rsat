"use client";
import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowUpRight,
  Plus,
  Play,
  LoaderCircle,
  Database,
  Sparkles,
  TrendingDown,
  Layers,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Bookmark,
  Mail,
  Send,
  SlidersHorizontal,
  Search,
  Bell,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import {
  Loading,
  ErrorBox,
  Empty,
  ListingCard,
  DemoBadge,
  Score,
  CategoryMark,
} from "./shared";
import { ManualForm, ImportDialog } from "./forms";
import { PriceChart, CoverageChart } from "./charts";
import { EmailPanel } from "./email-panel";
import { api, useApi } from "./use-api";
import {
  categoryKeys,
  categoryLabels,
  provinces,
  money,
  dateTime,
} from "@/lib/constants";
import type { Category } from "@/lib/constants";
import type { ListingView } from "@/lib/listings";

export type PageMode =
  | "dashboard"
  | "listings"
  | "detail"
  | "history"
  | "watch"
  | "sources"
  | "notifications"
  | "settings"
  | "manual";
const titles: Record<
  PageMode,
  { title: string; description: string; eyebrow: string }
> = {
  dashboard: {
    title: "Fırsatlar, radarında.",
    description:
      "Piyasanın gürültüsünü azalt. Veriye dayanan fırsatları keşfet.",
    eyebrow: "GENEL BAKIŞ",
  },
  listings: {
    title: "Fırsatları keşfet",
    description:
      "İlanları filtrele, benzerlerini karşılaştır ve kararını kanıta dayandır.",
    eyebrow: "FIRSATLAR",
  },
  detail: {
    title: "İlanın arkasındaki veriler",
    description:
      "İstenen fiyat, saklanan gözlemler, emsaller ve doğrulama uyarıları.",
    eyebrow: "İLAN DETAYI",
  },
  history: {
    title: "Fiyatın yolculuğu",
    description:
      "Yalnızca veritabanında saklanan fiyat gözlemleri. Eksik günler uydurulmaz.",
    eyebrow: "FİYAT GEÇMİŞİ",
  },
  watch: {
    title: "Gözün üzerinde olsun",
    description:
      "Kaydettiğin ilanlar, güncel fiyatları ve analizleriyle burada.",
    eyebrow: "TAKİP LİSTEM",
  },
  sources: {
    title: "Verinin nereden geldiğini bil",
    description: "Kaynak izinleri, veri tazeliği ve senkronizasyon kayıtları.",
    eyebrow: "VERİ KAYNAKLARI",
  },
  notifications: {
    title: "Önemli gelişmeler, tek yerde",
    description:
      "Fırsat bildirimleri, teslimat durumları ve günlük analiz kayıtları.",
    eyebrow: "BİLDİRİMLER",
  },
  settings: {
    title: "Radarını kendine göre ayarla",
    description: "Bildirim tercihleri ve kayıtlı arama profillerin.",
    eyebrow: "AYARLAR",
  },
  manual: {
    title: "Radarına bir ilan ekle",
    description:
      "Verini kontrol et. Bildiğin bilgileri ekle, belirsizlikleri görünür bırak.",
    eyebrow: "MANUEL GİRİŞ",
  },
};
interface Source {
  id: string;
  name: string;
  method: string;
  authorization: string;
  accessStatus: string;
  lastSuccessAt: string | null;
  lastError: string | null;
  freshnessHours: number;
  categories: Category[];
  realCount?: number;
  demoCount?: number;
  lastNewCount?: number;
  actualRegions?: string[];
  actualCategories?: Category[];
  pendingMessages?: number;
  missingFields?: string[];
  _count?: { listings: number };
  logs?: {
    id: string;
    status: string;
    message: string;
    createdAt: string;
    attempts: number;
  }[];
}
interface Run {
  id: string;
  status: string;
  processed: number;
  startedAt: string;
  completedAt: string | null;
  errors: { message: string; source?: string }[];
  attempts: number;
}
interface Dashboard {
  total: number;
  real: number;
  demo: number;
  newListings: number;
  reductions: number;
  highConfidence: number;
  sources: Source[];
  top: ListingView[];
  lastRun: Run | null;
  categoryCounts: { category: Category; count: number }[];
}
interface ListingResponse {
  listings: ListingView[];
  total: number;
  limit: number;
}
interface Detail extends ListingView {
  comparableLinks: {
    id: string;
    normalizedPrice: string;
    reason: string;
    comparable: ListingView;
  }[];
}
interface Notification {
  id: string;
  title: string;
  body: string;
  channel: string;
  status: string;
  lastError: string | null;
  readAt: string | null;
  createdAt: string;
  attempts: number;
  listingId: string;
}
interface SettingsData {
  settings: {
    telegramEnabled: boolean;
    emailEnabled: boolean;
    minScore: number;
    includeDemoNotifications: boolean;
  };
  credentials: {
    telegram: boolean;
    email: boolean;
    ai: boolean;
    feed: boolean;
  };
  schedule: string;
  timezone: string;
  profiles: {
    id: string;
    name: string;
    category: Category | null;
    province: string | null;
    district: string | null;
    minPrice: string | null;
    maxPrice: string | null;
    alerts: { minScore: number; enabled: boolean }[];
  }[];
}
const statusLabels: Record<string, string> = {
  AVAILABLE: "Kullanıma hazır",
  CONNECTED: "Doğrulanmış bağlantı",
  PLANNED: "Planlandı · bağlı değil",
  DISCONNECTED: "Bağlı değil",
  AUTHORIZED: "Google izni alındı · alım bekliyor",
  NEEDS_SAMPLE: "Gerçek örnek onayı gerekiyor",
  USER_APPROVED: "Örnek onaylı · canlı Gmail doğrulanmadı",
  MISSING_TOKEN: "Güvenli Gmail yetkisi eksik",
  REVIEW: "İnceleme bekliyor",
  DEMO: "Demo veri",
  ERROR: "Hata",
  COMPLETED: "Tamamlandı",
  PARTIAL: "Kaynak hatası var",
  FAILED: "Başarısız",
  RUNNING: "Çalışıyor",
  PENDING: "Bekliyor",
  SENT: "Teslim edildi",
  UNKNOWN: "Teslimat belirsiz",
  SENDING: "Gönderiliyor",
  SUCCESS: "Başarılı",
};
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "İşlem başarısız.";
export function RadarPage({
  mode,
  listingId,
}: {
  mode: PageMode;
  listingId?: string;
}) {
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  async function analyze() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ status: string; processed: number }>(
        "analyze",
        {},
      );
      setNotice(
        result.status === "ALREADY_COMPLETED"
          ? "Bu veri seti için analiz zaten tamamlanmış; tekrar bildirim oluşturulmadı."
          : result.status === "RUNNING"
            ? "Analiz işi zaten çalışıyor."
            : `${result.processed} ilan analiz edildi. ${statusLabels[result.status] ?? result.status}`,
      );
      window.dispatchEvent(new Event("radar:refresh"));
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  const title = titles[mode];
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">{title.eyebrow}</span>
          <h1>{title.title}</h1>
          <p>{title.description}</p>
        </div>
        <div className="heading-actions">
          {["dashboard", "listings", "sources"].includes(mode) && (
            <ImportDialog />
          )}
          <Button onClick={analyze} disabled={busy}>
            {busy ? (
              <LoaderCircle className="animate-spin" />
            ) : (
              <Play size={14} />
            )}
            Günlük analizi çalıştır
          </Button>
        </div>
      </div>
      {notice && (
        <div className="success-box" role="status">
          <CheckCircle2 size={17} />
          {notice}
        </div>
      )}
      {error && <ErrorBox message={error} />}
      <div className="evidence-banner">
        <ShieldCheck size={17} />
        <span>
          Kanıta dayalı karşılaştırma.{" "}
          <strong>Demo kayıtlar etiketlidir</strong>; piyasa satışları veya
          doğrulanmış hukuki bilgi gibi sunulmaz.
        </span>
      </div>
      {mode === "dashboard" ? (
        <DashboardPage />
      ) : mode === "listings" || mode === "watch" ? (
        <ListingsPage watch={mode === "watch"} />
      ) : mode === "detail" && listingId ? (
        <DetailPage id={listingId} />
      ) : mode === "history" ? (
        <HistoryPage />
      ) : mode === "sources" ? (
        <SourcesPage />
      ) : mode === "notifications" ? (
        <NotificationsPage />
      ) : mode === "settings" ? (
        <SettingsPage />
      ) : (
        <ManualForm />
      )}
    </>
  );
}
function DashboardPage() {
  const { data, error, loading, refresh } = useApi<Dashboard>("dashboard");
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} retry={refresh} />;
  if (!data) return null;
  const stats = [
    {
      label: "Kayıtlı ilan",
      value: data.total,
      description: `${data.real} kullanıcı verisi · ${data.demo} demo`,
      icon: Layers,
    },
    {
      label: "Yeni ilan",
      value: data.newListings,
      description: "Son 24 saat içinde eklendi",
      icon: Sparkles,
    },
    {
      label: "Fiyatı düşen",
      value: data.reductions,
      description: "Saklanan ilk gözleme göre",
      icon: TrendingDown,
    },
    {
      label: "Güçlü fırsat",
      value: data.highConfidence,
      description: "Puan ≥70 · yüksek veri güveni",
      icon: ScanIcon,
    },
  ];
  const live = data.sources.filter(
    (source) => source.accessStatus === "CONNECTED",
  );
  const successful = data.sources
    .filter((source) => source.lastSuccessAt)
    .sort(
      (a, b) =>
        new Date(b.lastSuccessAt!).getTime() -
        new Date(a.lastSuccessAt!).getTime(),
    );
  return (
    <>
      <div className="stats-grid">
        {stats.map(({ label, value, description, icon: Icon }) => (
          <div className="stat-card" key={label}>
            <div className="stat-label">
              {label}
              <Icon size={17} />
            </div>
            <strong>{value}</strong>
            <span>{description}</span>
          </div>
        ))}
      </div>
      <div className="dashboard-insights">
        <div className="panel radar-callout">
          <div className="callout-icon">
            <Sparkles size={24} />
          </div>
          <div>
            <span className="eyebrow">DAHA AZ GÜRÜLTÜ, DAHA FAZLA KANIT</span>
            <h2>Fiyat tek başına fırsat demek değil.</h2>
            <p>
              Konum, özellikler ve güncel emsaller birlikte değerlendirilir.
              Eksik bilgi olduğunda puan yerine belirsizliği gösteririz.
            </p>
            <Link href="/veri-kaynaklari">
              Veri kaynaklarını incele <ArrowUpRight size={15} />
            </Link>
          </div>
        </div>
        <div className="panel source-summary">
          <div className="panel-title">
            <h2>Veri kapsamı</h2>
            <Database size={18} />
          </div>
          <div className="source-numbers">
            <strong>
              {live.length}
              <span>canlı kaynak</span>
            </strong>
            <strong>
              11<span>desteklenen il</span>
            </strong>
            <strong>
              4<span>kategori</span>
            </strong>
          </div>
          <p className="helper">
            {live.length
              ? "Bağlı kaynaklar son başarılı senkronizasyona göre gösterilir."
              : "Canlı marketplace bağlantısı yok. Manuel giriş ve içe aktarma çalışır."}
          </p>
          <div className="last-refresh">
            <Clock size={14} />
            Son başarılı veri alımı: {dateTime(successful[0]?.lastSuccessAt)}
          </div>
        </div>
      </div>
      <div className="section-title">
        <div>
          <h2>Radarın öne çıkanları</h2>
          <p>
            Her kategoriden en yüksek puanlı kayıt. Demo ve kullanıcı verisi
            ayrı değerlendirilir.
          </p>
        </div>
        <Button asChild variant="ghost">
          <Link href="/firsatlar">
            Tüm ilanlar <ArrowUpRight />
          </Link>
        </Button>
      </div>
      {data.top.length ? (
        <div className="listing-grid dashboard-grid">
          {data.top.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      ) : (
        <Empty />
      )}
      <div className="dashboard-bottom">
        <div className="panel">
          <div className="panel-title">
            <div>
              <h2>Kategori dağılımı</h2>
              <p>Kayıtlı ilanların kategorilere göre dağılımı</p>
            </div>
            <Layers size={18} />
          </div>
          <CoverageChart counts={data.categoryCounts} />
        </div>
        <div className="panel">
          <div className="panel-title">
            <h2>Son analiz</h2>
            <RefreshCw size={18} />
          </div>
          {data.lastRun ? (
            <>
              <div className="run-status">
                <span className="status-dot" />
                {statusLabels[data.lastRun.status] ?? data.lastRun.status}
              </div>
              <dl className="info-list">
                <div>
                  <dt>İşlenen ilan</dt>
                  <dd>{data.lastRun.processed}</dd>
                </div>
                <div>
                  <dt>Başlangıç</dt>
                  <dd>{dateTime(data.lastRun.startedAt)}</dd>
                </div>
                <div>
                  <dt>Saat dilimi</dt>
                  <dd>Europe/Istanbul</dd>
                </div>
              </dl>
            </>
          ) : (
            <Empty
              title="İlk analizini başlat"
              description="Üstteki düğme ile mevcut veriyi analiz edebilirsin."
            />
          )}
        </div>
      </div>
    </>
  );
}
const ScanIcon = Search;
function ListingsPage({ watch = false }: { watch?: boolean }) {
  const [filters, setFilters] = useState<Record<string, string>>({
      category: "",
      province: "",
      district: "",
      minPrice: "",
      maxPrice: "",
      q: "",
      demo: "all",
      sort: "score",
    }),
    [applied, setApplied] = useState(""),
    [actionError, setActionError] = useState("");
  const path = `listings?${applied}${watch ? "&watch=true" : ""}`;
  const { data, error, loading, refresh } = useApi<ListingResponse>(path);
  function change(name: string, value: string) {
    setFilters((previous) => ({ ...previous, [name]: value }));
  }
  function apply(event: FormEvent) {
    event.preventDefault();
    setApplied(new URLSearchParams(filters).toString());
  }
  async function toggleWatch(listing: ListingView) {
    try {
      await api("watchlist", { listingId: listing.id, saved: !listing.watch });
      refresh();
    } catch (error) {
      setActionError(errorMessage(error));
    }
  }
  return (
    <>
      <form className="panel filters" onSubmit={apply}>
        <div className="search-row">
          <label className="search-input">
            <Search size={17} />
            <input
              value={filters.q}
              onChange={(event) => change("q", event.target.value)}
              aria-label="İlan ara"
              placeholder="Başlıkta ara…"
            />
          </label>
          <Button variant="outline" asChild>
            <Link href="/firsatlar/yeni">
              <Plus />
              İlan ekle
            </Link>
          </Button>
        </div>
        <div className="filter-fields">
          <label>
            Kategori
            <select
              value={filters.category}
              onChange={(event) => change("category", event.target.value)}
            >
              <option value="">Tüm kategoriler</option>
              {categoryKeys.map((key) => (
                <option key={key} value={key}>
                  {categoryLabels[key]}
                </option>
              ))}
            </select>
          </label>
          <label>
            İl
            <select
              value={filters.province}
              onChange={(event) => change("province", event.target.value)}
            >
              <option value="">Tüm Marmara</option>
              {provinces.map((province) => (
                <option key={province}>{province}</option>
              ))}
            </select>
          </label>
          <label>
            İlçe
            <input
              value={filters.district}
              onChange={(event) => change("district", event.target.value)}
              placeholder="Tüm ilçeler"
            />
          </label>
          <label>
            Alt fiyat (₺)
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={filters.minPrice}
              onChange={(event) => change("minPrice", event.target.value)}
              placeholder="Sınırsız"
            />
          </label>
          <label>
            Üst fiyat (₺)
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={filters.maxPrice}
              onChange={(event) => change("maxPrice", event.target.value)}
              placeholder="Sınırsız"
            />
          </label>
          <label>
            Veri türü
            <select
              value={filters.demo}
              onChange={(event) => change("demo", event.target.value)}
            >
              <option value="all">Tüm veriler</option>
              <option value="real">Kullanıcı verisi</option>
              <option value="demo">Demo veriler</option>
            </select>
          </label>
          <label>
            Sıralama
            <select
              value={filters.sort}
              onChange={(event) => change("sort", event.target.value)}
            >
              <option value="score">Fırsat puanı</option>
              <option value="price">Fiyat: artan</option>
              <option value="recent">En yeni</option>
            </select>
          </label>
          <Button type="submit">
            <SlidersHorizontal />
            Filtrele
          </Button>
        </div>
      </form>
      {actionError && <ErrorBox message={actionError} />}
      <div className="section-title">
        <span className="result-count" role="status">
          {data
            ? `${data.total} ilan${data.total > data.limit ? ` · İlk ${data.limit} gösteriliyor` : ""}`
            : "İlanlar"}
        </span>
        <span className="helper">
          Puan veriye bağlıdır; getiri garantisi değildir.
        </span>
      </div>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} retry={refresh} />
      ) : data?.listings.length ? (
        <div className="listing-grid">
          {data.listings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              onWatch={toggleWatch}
            />
          ))}
        </div>
      ) : (
        <Empty
          title={
            watch ? "Takip listen henüz boş" : "Bu filtrelerde ilan bulunamadı"
          }
          description={
            watch
              ? "İlan kartındaki yer imi ile listeni oluştur."
              : "Filtreleri genişlet veya yeni bir ilan ekle."
          }
        />
      )}
    </>
  );
}
function DetailPage({ id }: { id: string }) {
  const { data, error, loading, refresh } = useApi<Detail>(`listings/${id}`),
    [actionError, setActionError] = useState(""),
    [aiText, setAiText] = useState(""),
    [aiBusy, setAiBusy] = useState(false);
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} retry={refresh} />;
  if (!data) return null;
  const a = data.assessment,
    fields = data.property ?? data.vehicle ?? data.land ?? {};
  async function toggle() {
    try {
      await api("watchlist", { listingId: id, saved: !data!.watch });
      refresh();
    } catch (error) {
      setActionError(errorMessage(error));
    }
  }
  async function explain() {
    setAiBusy(true);
    try {
      const result = await api<{ text: string }>(`ai/${id}`, {});
      setAiText(result.text);
    } catch (error) {
      setActionError(errorMessage(error));
    } finally {
      setAiBusy(false);
    }
  }
  return (
    <>
      {actionError && <ErrorBox message={actionError} />}
      <div className="detail-overview panel">
        <CategoryMark category={data.category} />
        <div className="detail-title">
          {data.isDemo && <DemoBadge />}
          <h2>{data.title}</h2>
          <p>
            {data.province} / {data.district}
            {data.neighborhood ? ` / ${data.neighborhood}` : ""}
          </p>
        </div>
        <div className="detail-price">
          <span className="micro-label">İSTENEN FİYAT</span>
          <strong>{money(data.price)}</strong>
        </div>
        <Button variant="outline" onClick={toggle}>
          <Bookmark />
          {data.watch ? "Takipten çıkar" : "Takibe al"}
        </Button>
      </div>
      <div className="detail-grid">
        <div className="panel">
          <div className="panel-title">
            <h2>Kanıta dayalı değerlendirme</h2>
            <Score value={a?.score} />
          </div>
          {a ? (
            <>
              <p className="analysis-text">{a.explanation}</p>
              <div className="valuation-grid">
                <div>
                  <span>Emsal medyanı</span>
                  <strong>{money(a.medianPrice)}</strong>
                </div>
                <div>
                  <span>Karşılaştırma aralığı (Q1–Q3)</span>
                  <strong>
                    {a.rangeLow
                      ? `${money(a.rangeLow)} – ${money(a.rangeHigh)}`
                      : "Kanıt yetersiz"}
                  </strong>
                </div>
                <div>
                  <span>Benzer emsal</span>
                  <strong>{a.sampleCount}</strong>
                </div>
                <div>
                  <span>Veri güveni</span>
                  <strong>
                    {a.confidence === "HIGH"
                      ? "Yüksek"
                      : a.confidence === "MEDIUM"
                        ? "Orta"
                        : "Yetersiz"}
                  </strong>
                </div>
              </div>
              <p className="helper">
                Analiz: {dateTime(a.assessedAt)} · İstenen fiyatlar, doğrulanmış
                satışlar değil.
              </p>
            </>
          ) : (
            <Empty
              title="Henüz değerlendirme yok"
              description="Günlük analizi çalıştır. Yeterli emsal varsa puan ve karşılaştırma aralığı gösterilir."
            />
          )}
          <Button variant="outline" onClick={explain} disabled={aiBusy}>
            {aiBusy ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
            Kanıt açıklamasını göster
          </Button>
          {aiText && (
            <p className="analysis-text" role="status">
              {aiText}
            </p>
          )}
        </div>
        <div className="panel">
          <div className="panel-title">
            <h2>Doğrulama uyarıları</h2>
            <AlertTriangle size={19} />
          </div>
          <p className="helper">
            Bunlar kesinleşmiş sorunlar değildir. Belge ve uzman kontrolü
            gerektiren belirsizliklerdir.
          </p>
          {a?.riskFlags.length ? (
            <ul className="risk-list">
              {a.riskFlags.map((flag) => (
                <li key={flag.code}>
                  <AlertTriangle size={14} />
                  {flag.label}
                </li>
              ))}
            </ul>
          ) : (
            <p className="helper">
              Analiz yok veya kayıtlı uyarı yok. Hukuki/teknik doğrulama
              yapılmış anlamına gelmez.
            </p>
          )}
        </div>
      </div>
      <div className="detail-grid">
        <div className="panel">
          <div className="panel-title">
            <h2>Saklanan fiyat geçmişi</h2>
            <TrendingDown size={19} />
          </div>
          <PriceChart prices={data.prices ?? []} />
          <PriceTable listing={data} />
        </div>
        <div className="panel">
          <h2>İlan özellikleri</h2>
          <dl className="info-list">
            {Object.entries(fields)
              .filter(([key]) => key !== "listingId")
              .map(([key, value]) => (
                <div key={key}>
                  <dt>{fieldLabels[key] ?? key}</dt>
                  <dd>{value == null ? "Bilinmiyor" : String(value)}</dd>
                </div>
              ))}
          </dl>
          <h3 className="form-section-title">Veri kökeni</h3>
          <dl className="info-list">
            <div>
              <dt>Kaynak</dt>
              <dd>{data.source.name}</dd>
            </div>
            <div>
              <dt>Harici kimlik</dt>
              <dd>{data.externalId ?? "Sağlanmadı"}</dd>
            </div>
            <div>
              <dt>İlk alım</dt>
              <dd>{dateTime(data.collectedAt)}</dd>
            </div>
            <div>
              <dt>Son gözlem</dt>
              <dd>{dateTime(data.lastObservedAt)}</dd>
            </div>
          </dl>
          {data.sourceUrl ? (
            <a
              href={data.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="source-url"
            >
              <ExternalLink size={15} />
              Orijinal kaynak URL’si
            </a>
          ) : (
            <p className="helper">
              Kaynak URL’si yok.
              {data.isDemo ? " Bu kayıt kurgusal demo verisidir." : ""}
            </p>
          )}
        </div>
      </div>
      <div className="panel">
        <div className="panel-title">
          <div>
            <h2>Karşılaştırmada kullanılan emsaller</h2>
            <p>
              Alanlar benzerlik koşullarını karşılar; fiyatlar m² farkına göre
              normalleştirilebilir.
            </p>
          </div>
          <span className="badge">{data.comparableLinks.length} kayıt</span>
        </div>
        {data.comparableLinks.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>İlan</th>
                  <th>İstenen fiyat</th>
                  <th>Normalleştirilmiş fiyat</th>
                  <th>Benzerlik dayanağı</th>
                </tr>
              </thead>
              <tbody>
                {data.comparableLinks.map((link) => (
                  <tr key={link.id}>
                    <td>
                      <Link href={`/ilan/${link.comparable.id}`}>
                        {link.comparable.title}
                      </Link>
                      {link.comparable.isDemo && <DemoBadge />}
                    </td>
                    <td>{money(link.comparable.price)}</td>
                    <td>{money(link.normalizedPrice)}</td>
                    <td className="reason-cell">{link.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="Yeterli benzer emsal yok"
            description="Eksik özellikler, tazelik veya örnek sayısı nedeniyle puan kullanılamayabilir."
          />
        )}
      </div>
    </>
  );
}
const fieldLabels: Record<string, string> = {
  sizeM2: "Alan (m²)",
  propertyType: "Konut tipi",
  rooms: "Oda",
  buildingAge: "Bina yaşı",
  condition: "Genel durum",
  legalStatus: "Tapu beyanı",
  earthquakeInfo: "Deprem bilgisi",
  make: "Marka",
  model: "Model",
  trim: "Donanım",
  modelYear: "Model yılı",
  mileage: "Kilometre",
  fuel: "Yakıt",
  transmission: "Vites",
  damageHistory: "Hasar beyanı",
  classification: "Arazi sınıfı",
  zoning: "İmar beyanı",
  roadAccess: "Yol erişimi beyanı",
  parcelNumber: "Ada/parsel",
  sharedOwnership: "Hisse beyanı",
  agriculturalRestrictions: "Tarımsal kısıtlar",
};
function PriceTable({ listing }: { listing: ListingView }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Gözlem zamanı</th>
            <th>İstenen fiyat</th>
            <th>Veri türü</th>
          </tr>
        </thead>
        <tbody>
          {listing.prices?.map((price, index) => (
            <tr key={index}>
              <td>{dateTime(price.observedAt)}</td>
              <td>{money(price.price)}</td>
              <td>{listing.isDemo ? <DemoBadge /> : "Kayıtlı gözlem"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function HistoryPage() {
  const { data, error, loading, refresh } = useApi<ListingResponse>(
    "listings?sort=recent",
  );
  const [selected, setSelected] = useState("");
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} retry={refresh} />;
  if (!data?.listings.length) return <Empty />;
  const listing =
    data.listings.find((item) => item.id === selected) ??
    data.listings.find((item) => (item.prices?.length ?? 0) > 1) ??
    data.listings[0];
  return (
    <div className="panel">
      <div className="panel-heading">
        <div>
          <h2>İlan bazında fiyat gözlemleri</h2>
          <p>Grafikte farklı ilanların fiyatları birbirine karıştırılmaz.</p>
        </div>
        {listing.isDemo && <DemoBadge />}
      </div>
      <label className="history-select">
        İlan seç
        <select
          value={listing.id}
          onChange={(event) => setSelected(event.target.value)}
        >
          {data.listings.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </label>
      <div className="history-price">
        <strong>{money(listing.price)}</strong>
        <span>{listing.prices?.length ?? 0} kayıtlı gözlem</span>
      </div>
      <PriceChart prices={listing.prices ?? []} />
      <PriceTable listing={listing} />
    </div>
  );
}
function SourcesPage() {
  const { data, error, loading, refresh } = useApi<{
    sources: Source[];
    summary: {
      real: number;
      demo: number;
      unprocessed: number;
      missingListings: number;
    };
    imports: {
      id: string;
      format: string;
      status: string;
      total: number;
      inserted: number;
      updated: number;
      duplicates: number;
      reviewed: number;
      createdAt: string;
      errors: unknown[];
    }[];
  }>("sources");
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} retry={refresh} />;
  if (!data) return null;
  return (
    <>
      <div
        className="source-summary-stats panel"
        aria-label="Gerçek kaynak kapsamı"
      >
        <p>
          <strong>{data.summary.real}</strong> gerçek ilan
        </p>
        <p>
          <strong>{data.summary.demo}</strong> demo ilan
        </p>
        <p>
          <strong>{data.summary.unprocessed}</strong> işlenemeyen/kısmi bildirim
        </p>
        <p>
          <strong>{data.summary.missingListings}</strong> emsal bilgisi eksik
          veya kimliği incelemede gerçek ilan
        </p>
      </div>
      <EmailPanel />
      <div className="source-grid">
        {data.sources.map((source) => {
          const stale = source.lastSuccessAt
            ? Date.now() - new Date(source.lastSuccessAt).getTime() >
              source.freshnessHours * 3600_000
            : false;
          return (
            <article className="panel source-card" key={source.id}>
              <div className="panel-title">
                <h2>{source.name}</h2>
                <span
                  className={`badge ${["CONNECTED", "AVAILABLE"].includes(source.accessStatus) ? "positive" : "neutral"}`}
                >
                  {statusLabels[source.accessStatus] ?? source.accessStatus}
                </span>
              </div>
              <p>{source.authorization}</p>
              <dl className="info-list">
                <div>
                  <dt>Yöntem</dt>
                  <dd>{source.method}</dd>
                </div>
                <div>
                  <dt>Gerçek / demo kayıt</dt>
                  <dd>
                    {source.realCount ?? 0} / {source.demoCount ?? 0}
                  </dd>
                </div>
                <div>
                  <dt>Son alımda yeni</dt>
                  <dd>{source.lastNewCount ?? 0}</dd>
                </div>
                <div>
                  <dt>İşlenemeyen bildirim</dt>
                  <dd>{source.pendingMessages ?? 0}</dd>
                </div>
                <div>
                  <dt>Gerçek veri bölgeleri</dt>
                  <dd>
                    {source.actualRegions?.join(", ") ||
                      "Henüz gerçek veri yok"}
                  </dd>
                </div>
                <div>
                  <dt>Gerçek veri kategorileri</dt>
                  <dd>
                    {source.actualCategories
                      ?.map((key) => categoryLabels[key])
                      .join(", ") || "Henüz gerçek veri yok"}
                  </dd>
                </div>
                <div>
                  <dt>Bildirimde eksik alanlar</dt>
                  <dd>
                    {source.missingFields
                      ?.map(
                        (field) =>
                          ({
                            title: "Başlık",
                            category: "Kategori",
                            province: "İl",
                            district: "İlçe",
                            price: "Fiyat",
                          })[field] ?? field,
                      )
                      .join(", ") || "Kayıtlı eksik alan yok"}
                  </dd>
                </div>
                <div>
                  <dt>Son başarı</dt>
                  <dd>{dateTime(source.lastSuccessAt)}</dd>
                </div>
                <div>
                  <dt>Veri tazeliği</dt>
                  <dd>
                    {source.lastSuccessAt
                      ? stale
                        ? "Yenileme gerekli"
                        : "Tazelik penceresi içinde"
                      : "Henüz veri alınmadı"}
                  </dd>
                </div>
                <div>
                  <dt>Kategoriler</dt>
                  <dd>
                    {source.categories
                      .map((key) => categoryLabels[key])
                      .join(", ")}
                  </dd>
                </div>
              </dl>
              {source.lastError && <ErrorBox message={source.lastError} />}
              <div className="source-log">
                {source.logs?.map((log) => (
                  <div key={log.id}>
                    <span>
                      {dateTime(log.createdAt)} · {statusLabels[log.status]} ·{" "}
                      {log.attempts} deneme
                    </span>
                    <p>{log.message}</p>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
      <div className="panel import-history">
        <div className="panel-title">
          <h2>İçe aktarma geçmişi</h2>
          <ImportDialog />
        </div>
        {data.imports.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Zaman</th>
                  <th>Biçim</th>
                  <th>Durum</th>
                  <th>Yeni</th>
                  <th>Güncelleme</th>
                  <th>Tekrar</th>
                  <th>İnceleme</th>
                </tr>
              </thead>
              <tbody>
                {data.imports.map((job) => (
                  <tr key={job.id}>
                    <td>{dateTime(job.createdAt)}</td>
                    <td>{job.format}</td>
                    <td>{statusLabels[job.status]}</td>
                    <td>{job.inserted}</td>
                    <td>{job.updated}</td>
                    <td>{job.duplicates}</td>
                    <td>{job.reviewed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Henüz içe aktarma yok" />
        )}
      </div>
    </>
  );
}
function NotificationsPage() {
  const { data, error, loading, refresh } = useApi<{
    notifications: Notification[];
    runs: Run[];
    reports: {
      runId: string;
      body: string;
      listingIds: string[];
      createdAt: string;
    }[];
  }>("notifications");
  const [actionError, setActionError] = useState("");
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} retry={refresh} />;
  if (!data) return null;
  async function mark(id: string) {
    try {
      await api(`notifications/${id}`, {});
      refresh();
    } catch (error) {
      setActionError(errorMessage(error));
    }
  }
  return (
    <>
      {actionError && <ErrorBox message={actionError} />}
      <div className="panel">
        <h2>Günlük gerçek fırsat raporları</h2>
        <p className="helper">
          Telegram veya e-postaya hazır metin. Demo kayıtlar ve yetersiz kanıtlı
          ilanlar rapora fırsat olarak alınmaz; bu metin burada kendiliğinden
          gönderilmez.
        </p>
        {!data.reports.length && (
          <p>Henüz rapor yok; günlük analizi çalıştır.</p>
        )}
        {data.reports.map((report) => (
          <details className="email-receipt" key={report.runId}>
            <summary>
              {dateTime(report.createdAt)} · {report.listingIds.length} fırsat
            </summary>
            <pre className="daily-report">{report.body}</pre>
            <Button
              variant="outline"
              onClick={() =>
                void navigator.clipboard
                  .writeText(report.body)
                  .catch(() =>
                    setActionError(
                      "Rapor panoya kopyalanamadı; metni seçerek kopyalayabilirsin.",
                    ),
                  )
              }
            >
              Raporu kopyala
            </Button>
          </details>
        ))}
      </div>
      <div className="panel">
        <div className="panel-title">
          <h2>Fırsat bildirimleri</h2>
          <Bell size={20} />
        </div>
        <p className="helper">
          Demo bildirimleri varsayılan olarak kapalıdır. Telegram ve e-posta,
          kimlik bilgileri ve açık tercih olmadan gönderilmez.
        </p>
        {data.notifications.length ? (
          <div className="notification-list">
            {data.notifications.map((item) => (
              <article
                key={item.id}
                className={item.readAt ? "notification read" : "notification"}
              >
                <span className="notification-icon">
                  {item.channel === "EMAIL" ? (
                    <Mail size={18} />
                  ) : item.channel === "TELEGRAM" ? (
                    <Send size={18} />
                  ) : (
                    <Bell size={18} />
                  )}
                </span>
                <div>
                  <Link href={`/ilan/${item.listingId}`}>
                    <h3>{item.title}</h3>
                  </Link>
                  <p className="notification-body">{item.body}</p>
                  <span className="helper">
                    {dateTime(item.createdAt)} · {item.channel} ·{" "}
                    {statusLabels[item.status] ?? item.status} · {item.attempts}{" "}
                    deneme
                  </span>
                  {item.lastError && (
                    <p className="error-text">{item.lastError}</p>
                  )}
                </div>
                {!item.readAt && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => mark(item.id)}
                  >
                    Okundu
                  </Button>
                )}
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title="Henüz bildirim yok"
            description="Analiz sonucu eşiklerini karşılayan kayıtlar burada görünür. Demo bildirimlerini Ayarlar’dan açabilirsin."
          />
        )}
      </div>
      <div className="panel job-history">
        <div className="panel-title">
          <h2>Günlük iş kayıtları</h2>
          <Clock size={19} />
        </div>
        {data.runs.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Başlangıç</th>
                  <th>Durum</th>
                  <th>İşlenen</th>
                  <th>Deneme</th>
                  <th>Hata</th>
                </tr>
              </thead>
              <tbody>
                {data.runs.map((run) => (
                  <tr key={run.id}>
                    <td>{dateTime(run.startedAt)}</td>
                    <td>{statusLabels[run.status] ?? run.status}</td>
                    <td>{run.processed}</td>
                    <td>{run.attempts}</td>
                    <td>
                      {run.errors.map((error) => error.message).join(" ") ||
                        "Yok"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="Henüz iş çalıştırılmadı" />
        )}
      </div>
    </>
  );
}
function SettingsPage() {
  const state = useApi<SettingsData>("settings");
  if (state.loading) return <Loading />;
  if (state.error)
    return <ErrorBox message={state.error} retry={state.refresh} />;
  if (!state.data) return null;
  return <SettingsForm data={state.data} refresh={state.refresh} />;
}
function SettingsForm({
  data,
  refresh,
}: {
  data: SettingsData;
  refresh: () => void;
}) {
  const [settings, setSettings] = useState(data.settings),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    setError("");
    try {
      await api("settings", settings);
      setNotice("Bildirim tercihlerin kaydedildi.");
      refresh();
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  async function profile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const clean = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== ""),
    );
    setError("");
    try {
      await api("profiles", { ...clean, minScore: Number(values.minScore) });
      setNotice("Arama profili ve uyarı kuralı kaydedildi.");
      form.reset();
      refresh();
    } catch (error) {
      setError(errorMessage(error));
    }
  }
  return (
    <>
      {notice && (
        <div className="success-box" role="status">
          <CheckCircle2 size={17} />
          {notice}
        </div>
      )}
      {error && <ErrorBox message={error} />}
      <div className="settings-grid">
        <form className="panel" onSubmit={save}>
          <div className="panel-title">
            <h2>Bildirim tercihleri</h2>
            <Bell size={20} />
          </div>
          <div className="setting-row">
            <div>
              <strong>Telegram</strong>
              <p>
                {data.credentials.telegram
                  ? "Kimlik bilgileri mevcut; canlı teslimat henüz doğrulanmış olmayabilir."
                  : "TELEGRAM_BOT_TOKEN ve TELEGRAM_CHAT_ID gerekli."}
              </p>
            </div>
            <Switch
              aria-label="Telegram bildirimleri"
              checked={settings.telegramEnabled}
              disabled={!data.credentials.telegram}
              onCheckedChange={(value) =>
                setSettings((previous) => ({
                  ...previous,
                  telegramEnabled: value,
                }))
              }
            />
          </div>
          <div className="setting-row">
            <div>
              <strong>E-posta</strong>
              <p>
                {data.credentials.email
                  ? "SMTP yapılandırması mevcut; canlı teslimat ayrıca doğrulanmalıdır."
                  : "SMTP_HOST, SMTP_FROM, SMTP_TO ve gerekirse kullanıcı/parola gerekli."}
              </p>
            </div>
            <Switch
              aria-label="E-posta bildirimleri"
              checked={settings.emailEnabled}
              disabled={!data.credentials.email}
              onCheckedChange={(value) =>
                setSettings((previous) => ({
                  ...previous,
                  emailEnabled: value,
                }))
              }
            />
          </div>
          <div className="setting-row">
            <div>
              <strong>Demo bildirimleri</strong>
              <p>
                Açılırsa kurgusal kayıtlardan etiketli bildirimler üretilir.
              </p>
            </div>
            <Switch
              aria-label="Demo bildirimleri"
              checked={settings.includeDemoNotifications}
              onCheckedChange={(value) =>
                setSettings((previous) => ({
                  ...previous,
                  includeDemoNotifications: value,
                }))
              }
            />
          </div>
          <label className="score-setting">
            Varsayılan minimum fırsat puanı
            <input
              type="number"
              min={0}
              max={100}
              required
              value={settings.minScore}
              onChange={(event) =>
                setSettings((previous) => ({
                  ...previous,
                  minScore: Number(event.target.value),
                }))
              }
            />
          </label>
          <p className="helper">
            Aktif arama profili varsa profil kuralları kullanılır. Gizli
            değerleri yalnızca sunucunun .env dosyasında veya güvenli ortam
            ayarlarında tanımla.
          </p>
          <Button type="submit" disabled={busy}>
            Tercihleri kaydet
          </Button>
        </form>
        <div className="panel">
          <div className="panel-title">
            <h2>Çalışma yapılandırması</h2>
            <ShieldCheck size={20} />
          </div>
          <dl className="info-list">
            <div>
              <dt>Günlük zamanlama</dt>
              <dd>
                <code>{data.schedule}</code>
              </dd>
            </div>
            <div>
              <dt>Saat dilimi</dt>
              <dd>{data.timezone}</dd>
            </div>
            <div>
              <dt>AI</dt>
              <dd>
                {data.credentials.ai
                  ? "İsteğe bağlı yapılandırılmış"
                  : "Kapalı · deterministik açıklama"}
              </dd>
            </div>
            <div>
              <dt>Yetkili feed</dt>
              <dd>
                {data.credentials.feed
                  ? "Yapılandırılmış · kaynak durumunu kontrol et"
                  : "Bağlı değil"}
              </dd>
            </div>
          </dl>
          <p className="helper">
            Zamanlama için <code>npm run scheduler</code> sürecini çalıştır.
            DAILY_CRON ile değiştir; değişiklikten sonra süreci yeniden başlat.
            İşlemler kalıcı günlüklerle takip edilir.
          </p>
          <div className="security-note">
            <ShieldCheck size={18} />
            Satıcılara teklif gönderilmez veya otomatik iletişim kurulmaz.
          </div>
        </div>
      </div>
      <div className="panel profile-panel">
        <div className="panel-title">
          <div>
            <h2>Arama profilleri</h2>
            <p>
              Üst bütçe zorunlu değildir. Fırsat bildirimlerini kriterlerine
              göre daralt.
            </p>
          </div>
          <Search size={20} />
        </div>
        <form className="profile-form" onSubmit={profile}>
          <label>
            Profil adı
            <input
              name="name"
              required
              minLength={2}
              placeholder="İstanbul ev radarım"
            />
          </label>
          <label>
            Kategori
            <select name="category">
              <option value="">Tümü</option>
              {categoryKeys.map((key) => (
                <option key={key} value={key}>
                  {categoryLabels[key]}
                </option>
              ))}
            </select>
          </label>
          <label>
            İl
            <select name="province">
              <option value="">Tüm Marmara</option>
              {provinces.map((province) => (
                <option key={province}>{province}</option>
              ))}
            </select>
          </label>
          <label>
            İlçe
            <input name="district" />
          </label>
          <label>
            Alt fiyat
            <input name="minPrice" type="number" min="0.01" step="0.01" />
          </label>
          <label>
            Üst fiyat
            <input
              name="maxPrice"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Sınırsız"
            />
          </label>
          <label>
            Minimum puan
            <input
              name="minScore"
              type="number"
              required
              min={0}
              max={100}
              defaultValue={70}
            />
          </label>
          <Button type="submit">
            <Plus />
            Profil ekle
          </Button>
        </form>
        {data.profiles.length ? (
          <div className="profile-list">
            {data.profiles.map((profile) => (
              <div className="profile-item" key={profile.id}>
                <Search size={17} />
                <div>
                  <strong>{profile.name}</strong>
                  <p>
                    {profile.category
                      ? categoryLabels[profile.category]
                      : "Tüm kategoriler"}{" "}
                    · {profile.province ?? "Tüm Marmara"}
                    {profile.district ? ` / ${profile.district}` : ""} ·{" "}
                    {profile.maxPrice
                      ? `Üst fiyat ${money(profile.maxPrice)}`
                      : "Üst bütçe yok"}{" "}
                    · Puan ≥{profile.alerts[0]?.minScore}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty
            title="Henüz arama profili yok"
            description="Varsayılan puan eşiği tüm kategorilere uygulanır."
          />
        )}
      </div>
    </>
  );
}

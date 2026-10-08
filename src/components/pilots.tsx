"use client";
import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import {
  categoryLabels,
  categoryKeys,
  provinces,
  bodyTypes,
  pilotFuels,
  money,
  dateTime,
} from "@/lib/constants";
import type { Category } from "@/lib/constants";
import type { ListingView } from "@/lib/listings";
import { api } from "./use-api";
import { Button } from "./ui/button";
export type ProfileView = {
  id: string;
  name: string;
  category: Category | null;
  categories: Category[];
  province: string | null;
  provinces: string[];
  district: string | null;
  minPrice: string | null;
  maxPrice: string | null;
  bodyTypes: string[];
  fuels: string[];
  transactionType: string | null;
  trackPriceDrops: boolean;
  mailLabelIds: string[];
  mailSenders: string[];
  alerts: { minScore: number; enabled: boolean }[];
};
export type PilotView = {
  id: string;
  name: string;
  totalReal: number;
  discoveredToday: number;
  priceDrops: number;
  opportunities: number;
  top: ListingView[];
  reduced: ListingView[];
  lastSuccessfulIngestion: string | null;
  profile: ProfileView;
  funnel: Record<string, number>;
  zeroReasons: string[];
  unassignedGmail: number;
  recentDropCount: number;
  recentDrops: {
    key: string;
    listingId: string;
    title: string;
    previousPrice: string;
    newPrice: string;
    amount: string;
    percentage: string;
    observedAt: string;
  }[];
};
export function ProfileEditor({ profile }: { profile: ProfileView }) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const f = new FormData(event.currentTarget);
    try {
      await api(`profiles/${profile.id}`, {
        name: String(f.get("name")),
        categories: f.getAll("categories"),
        provinces: f.getAll("provinces"),
        district: f.get("district"),
        minPrice: f.get("minPrice"),
        maxPrice: f.get("maxPrice"),
        bodyTypes: f.getAll("bodyTypes"),
        fuels: f.getAll("fuels"),
        transactionType: f.get("transactionType"),
        trackPriceDrops: f.get("trackPriceDrops") === "on",
        minScore: Number(f.get("minScore")),
        mailLabelIds: String(f.get("mailLabelIds") ?? "")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
        mailSenders: String(f.get("mailSenders") ?? "")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean),
      });
      setMessage("Profil filtreleri kaydedildi.");
      window.dispatchEvent(new Event("radar:refresh"));
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const label = (v: string) => `${profile.name} · ${v}`;
  return (
    <details className="pilot-editor">
      <summary>Filtreleri düzenle: {profile.name}</summary>
      <form className="form-grid" onSubmit={save}>
        <label>
          {label("Pilot adı")}
          <input
            name="name"
            required
            minLength={2}
            maxLength={100}
            defaultValue={profile.name}
          />
        </label>
        <label>
          {label("Kategoriler")}
          <select
            multiple
            name="categories"
            defaultValue={
              profile.categories.length
                ? profile.categories
                : profile.category
                  ? [profile.category]
                  : []
            }
          >
            {categoryKeys.map((c) => (
              <option key={c} value={c}>
                {categoryLabels[c]}
              </option>
            ))}
          </select>
        </label>
        <label>
          {label("İller")}
          <select
            multiple
            name="provinces"
            defaultValue={
              profile.provinces.length
                ? profile.provinces
                : profile.province
                  ? [profile.province]
                  : []
            }
          >
            {provinces.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <label>
          {label("İlçe")}
          <input
            name="district"
            maxLength={80}
            defaultValue={profile.district ?? ""}
            placeholder="Tümü"
          />
        </label>
        <label>
          {label("İşlem")}
          <select
            name="transactionType"
            defaultValue={profile.transactionType ?? ""}
          >
            <option value="">Tümü / bilgi yok</option>
            <option value="SATILIK">Satılık</option>
            <option value="KIRALIK">Kiralık</option>
          </select>
        </label>
        <label>
          {label("Araç gövde tipleri")}
          <select multiple name="bodyTypes" defaultValue={profile.bodyTypes}>
            {bodyTypes.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label>
          {label("Yakıtlar")}
          <select multiple name="fuels" defaultValue={profile.fuels}>
            {pilotFuels.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <label>
          {label("Alt bütçe")}
          <input
            name="minPrice"
            type="number"
            min="0.01"
            step="0.01"
            defaultValue={profile.minPrice ?? ""}
            placeholder="Sınırsız"
          />
        </label>
        <label>
          {label("Üst bütçe")}
          <input
            name="maxPrice"
            type="number"
            min="0.01"
            step="0.01"
            defaultValue={profile.maxPrice ?? ""}
            placeholder="Sınırsız"
          />
        </label>
        <label>
          {label("Minimum puan")}
          <input
            name="minScore"
            type="number"
            min={0}
            max={100}
            required
            defaultValue={profile.alerts[0]?.minScore ?? 70}
          />
        </label>
        <label className="checkbox-row">
          <input
            name="trackPriceDrops"
            type="checkbox"
            defaultChecked={profile.trackPriceDrops}
          />
          {label("Fiyat düşüşlerini takip et")}
        </label>
        <label>
          {label("Bildirim etiket ID’leri")}
          <input
            name="mailLabelIds"
            defaultValue={profile.mailLabelIds?.join(",") ?? ""}
            placeholder="Virgülle ayır"
          />
        </label>
        <label>
          {label("Bildirim göndericileri")}
          <input
            name="mailSenders"
            defaultValue={profile.mailSenders?.join(",") ?? ""}
            placeholder="Virgülle ayır"
          />
        </label>
        <p className="helper">
          Bu eşleme, ayrıştırılamayan bildirimleri de pilot hunisine atar; Gmail
          erişim iznini genişletmez. İkisi de doluysa tüm etiketler ve
          göndericilerden biri eşleşmelidir.
        </p>
        <p className="helper">
          Çoklu seçimde boş bırakılan filtre tümünü kapsar. Mahalle, marka,
          model, yıl ve kilometre için pilotta üst sınır yoktur.
        </p>
        <Button type="submit" disabled={busy}>
          Pilot filtrelerini kaydet
        </Button>
        {message && <p role="status">{message}</p>}
      </form>
    </details>
  );
}
export function PilotCards({ pilots }: { pilots: PilotView[] }) {
  return (
    <section className="pilot-grid" aria-label="Gerçek veri pilotları">
      {!!pilots[0]?.unassignedGmail && (
        <p className="panel">
          {pilots[0].unassignedGmail} Gmail bildirimi hiçbir pilota atanamadı.
          Pilot etiket/gönderici eşlemesini düzenleyin.
        </p>
      )}
      {pilots.map((p) => (
        <article key={p.id} className="panel pilot-card" aria-label={p.name}>
          <h2>{p.name}</h2>
          <p className="helper">
            Yalnızca gerçek ilanlar · minimum puan{" "}
            {p.profile.alerts[0]?.minScore ?? 70} · demo ve kimliği/sınıfı
            incelemedeki kayıtlar dahil değildir.
          </p>
          <dl className="pilot-stats">
            {[
              ["Toplam gerçek ilan", p.totalReal],
              ["Bugün keşfedilen ilanlar", p.discoveredToday],
              ["Fiyatı düşen ilanlar", p.priceDrops],
              ["Yeterli emsale sahip fırsatlar", p.opportunities],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          {!p.totalReal && (
            <p className="empty-state-text">
              Bu pilotta henüz gerçek ilan yok.
            </p>
          )}
          <h3>Veri toplama hunisi</h3>
          <dl className="info-list pilot-funnel">
            {[
              ["Gmail’den gelen bildirim", "gmailNotifications"],
              ["Başarıyla ayrıştırılan ilan", "parsedListings"],
              ["İnceleme bekleyen ilan", "pendingListings"],
              ["Veritabanına kaydedilen gerçek ilan", "savedReal"],
              ["Pilot filtreleriyle eşleşen ilan", "matchedListings"],
              [
                "Emsal yetersizliği nedeniyle puanlanamayan ilan",
                "insufficientListings",
              ],
              ["Yeterli kanıta sahip fırsat", "supportedOpportunities"],
            ].map(([label, key]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>{p.funnel[key]}</dd>
              </div>
            ))}
          </dl>
          <p className="helper">
            Gmail sayısı bildirim, diğerleri tekil ilandır; bir bildirim birden
            çok ilan içerebilir. {p.funnel.localEmlSamples} yerel .eml bildirimi
            Gmail sayısına dahil değildir. Kaydedilenler manuel/CSV kayıtlarını
            da kapsar. {p.funnel.userCompletedListings} geçerli öneri kullanıcı
            tarafından tamamlandı. Sayılar saklanan tüm kayıtlar içindir.
          </p>
          {!p.opportunities && (
            <ul>
              {p.zeroReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          <Link href="/yeni-ilanlar">Puansız gerçek ilanları da göster</Link>
          <h3>Son 7 günlük fiyat düşüşleri · {p.recentDropCount} olay</h3>
          {p.recentDrops.length ? (
            <ul className="pilot-results">
              {p.recentDrops.map((d) => (
                <li key={d.key}>
                  <Link href={`/ilan/${d.listingId}`}>{d.title}</Link>
                  <span>
                    {money(d.previousPrice)} → {money(d.newPrice)} · indirim{" "}
                    {money(d.amount)} (%{d.percentage}) ·{" "}
                    {dateTime(d.observedAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>Son 7 gün içinde doğrulanabilen ardışık fiyat düşüşü yok.</p>
          )}
          <h3>En iyi 5 fırsat</h3>
          {p.top.length ? (
            <ol className="pilot-results">
              {p.top.map((l) => (
                <li key={l.id}>
                  <Link href={`/ilan/${l.id}`}>{l.title}</Link>
                  <span>
                    {money(l.price)} · Puan {l.assessment?.score} ·{" "}
                    {l.assessment?.sampleCount} emsal
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p>Yeterli emsale sahip gerçek fırsat yok.</p>
          )}
          <h3>Fiyat düşüşü takibi</h3>
          {p.reduced.length ? (
            <ul className="pilot-results">
              {p.reduced.map((l) => (
                <li key={l.id}>
                  <Link href={`/ilan/${l.id}`}>{l.title}</Link>
                  <span>
                    {money(l.price)} · Fiyat düşüşü tek başına fırsat değildir.
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>Takip edilen fiyat düşüşü yok.</p>
          )}
          <p>Son başarılı veri alımı: {dateTime(p.lastSuccessfulIngestion)}</p>
          {!p.lastSuccessfulIngestion && (
            <p className="helper">
              Bu pilot için canlı bildirim alımı doğrulanmadı. Google izni ve
              onaylı gerçek bildirim şablonu gerekir.
            </p>
          )}
          <ProfileEditor profile={p.profile} />
        </article>
      ))}
    </section>
  );
}
export function BodyTypeReview({ listingId }: { listingId: string }) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      await api(`listings/${listingId}/body-type`, {
        bodyType: f.get("bodyType"),
        bodyTypeEvidence: f.get("bodyTypeEvidence"),
        evidenceReviewed: f.get("evidenceReviewed") === "on",
      });
      setMessage(
        "Gövde tipi kanıtı kullanıcı tarafından onaylandı; sonraki analizde değerlendirilecek.",
      );
      window.dispatchEvent(new Event("radar:refresh"));
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="form-grid" onSubmit={save}>
      <label>
        Doğrulanan gövde tipi
        <select name="bodyType">
          {bodyTypes.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </label>
      <label>
        İncelenen kaynak / kanıt açıklaması
        <input
          name="bodyTypeEvidence"
          required
          minLength={8}
          maxLength={300}
          placeholder="Resmi araç belgesi veya doğrulanabilir gövde tipi kaydı"
        />
      </label>
      <label className="checkbox-row">
        <input name="evidenceReviewed" type="checkbox" required />
        Kaynak kanıtını inceledim; başlık veya model adından tahmin yapmadım.
      </label>
      <Button type="submit" disabled={busy}>
        Gövde tipini onayla
      </Button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}

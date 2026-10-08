"use client";
import { useApi } from "./use-api";
import { ErrorBox, Loading } from "./shared";
import { dateTime } from "@/lib/constants";
type Readiness = {
  gmail: {
    configured: boolean;
    status: string;
    selectionSaved: boolean;
    lastSuccessAt: string | null;
    missing: string[];
  };
  storage: { declaredPersistent: boolean; requiredForProduction: boolean };
  scheduler: {
    status: string;
    schedule: string;
    timezone: string;
    lastHeartbeatAt: string | null;
    lastTickAt: string | null;
    lastResult: string | null;
  };
  channels: {
    channel: string;
    configured: boolean;
    enabled: boolean;
    lastVerifiedSentAt: string | null;
  }[];
  samples: {
    uploaded: number;
    gmailMatchedTemplates: number;
    needsRealExamples: boolean;
  };
  ci: { url: string };
};
const states: Record<string, string> = {
  NOT_STARTED: "Başlatılmadı",
  STALE: "Son durum bilgisi eski; süreç kontrol edilmeli",
  RUNNING: "Süreç durum bildiriyor",
  STOPPED: "Durduruldu",
};
export function LiveReadiness() {
  const { data, loading, error, refresh } = useApi<Readiness>("readiness");
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} retry={refresh} />;
  if (!data) return null;
  return (
    <section className="panel" aria-label="Canlı pilot kurulumu">
      <h2>Canlı pilot kurulumu</h2>
      <p>
        Gerçek Sahibinden ve Arabam bildirimlerini Gmail’den “Orijinali indir”
        ile .eml olarak sağlamalısın. Örnekleri aşağıda incele, eksik bilgileri
        yalnızca kaynakta gördüğün bilgilerle tamamla ve ilan ID’sini kontrol
        et.
      </p>
      <p>
        {data.samples.uploaded} saklanan bildirim ·{" "}
        {data.samples.gmailMatchedTemplates} kullanıcı onayından sonra Gmail’de
        eşleşen şablon.{" "}
        {data.samples.needsRealExamples
          ? "Canlı şablon doğrulaması yok; gerçek örnekler ve Gmail alımı gerekiyor."
          : "Şablon eşleşmesi tüm ilan alanlarının bağımsız doğrulandığı anlamına gelmez."}
      </p>
      <dl className="info-list">
        <div>
          <dt>Google OAuth</dt>
          <dd>
            {data.gmail.configured
              ? "Sunucu ayarları mevcut"
              : "Sunucu ayarları eksik"}{" "}
            · {data.gmail.status} ·{" "}
            {data.gmail.selectionSaved
              ? "Bildirim seçimi kayıtlı"
              : "Bildirim seçimi yapılmadı"}
          </dd>
        </div>
        <div>
          <dt>Kalıcı token depolaması</dt>
          <dd>
            {data.storage.declaredPersistent
              ? "Yönetici kalıcı depolama tanımlamış; yeniden başlatma sonrası ayrıca doğrulanmalı"
              : "Kalıcı depolama tanımı eksik; üretim bağlantısı buna izin vermez"}
          </dd>
        </div>
        <div>
          <dt>Günlük scheduler</dt>
          <dd>
            {states[data.scheduler.status] ?? data.scheduler.status} ·{" "}
            {data.scheduler.schedule} · {data.scheduler.timezone} · son durum{" "}
            {dateTime(data.scheduler.lastHeartbeatAt)} · son görev{" "}
            {dateTime(data.scheduler.lastTickAt)} (
            {data.scheduler.lastResult ?? "Henüz çalışmadı"})
          </dd>
        </div>
        {data.channels.map((c) => (
          <div key={c.channel}>
            <dt>{c.channel === "EMAIL" ? "E-posta / SMTP" : "Telegram"}</dt>
            <dd>
              {c.configured
                ? "Kimlik bilgileri tanımlı"
                : "Kimlik bilgileri eksik"}{" "}
              · {c.enabled ? "Gönderim açık" : "Gönderim kapalı"} ·{" "}
              {c.lastVerifiedSentAt
                ? `Gerçek kayıt için servis kabulü: ${dateTime(c.lastVerifiedSentAt)}`
                : "Gerçek kayda ait canlı servis kabulü doğrulanmadı"}
            </dd>
          </div>
        ))}
      </dl>
      {!!data.gmail.missing.length && (
        <p className="helper">
          Teknik kurulum için eksik ayar adları: {data.gmail.missing.join(", ")}
          . Gizli değerler bu ekrana girilmez.
        </p>
      )}
      <p>
        <a href={data.ci.url} rel="noopener noreferrer" target="_blank">
          GitHub CI sonuçlarını kontrol et
        </a>{" "}
        · Kod testlerinin geçmesi gerçek bildirim veya canlı teslimat
        doğrulaması değildir.
      </p>
      <p className="helper">
        Adım adım rehber: depodaki CANLI_PILOT_KURULUM.md. Gerçek .eml örneği ve
        harici servis izni olmadan canlı kabul tamamlanmış sayılmaz.
      </p>
    </section>
  );
}

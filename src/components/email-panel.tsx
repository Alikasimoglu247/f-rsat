"use client";
import { useState } from "react";
import { Button } from "./ui/button";
import { api, useApi } from "./use-api";
import { ErrorBox, Loading, Empty } from "./shared";
import { money, dateTime, categoryLabels } from "@/lib/constants";
import type { EmailProposal } from "@/lib/email/parser";
import { fieldGroups } from "./form-fields";
type Message = {
  id: string;
  sender: string;
  subject: string;
  status: string;
  transport: string;
  createdAt: string;
  receivedAt: string | null;
  seenViaGmailAt: string | null;
  inserted: number;
  updated: number;
  duplicates: number;
  reviewed: number;
  proposals: EmailProposal[];
  errors: string[];
};
type EmailStatus = {
  configuration: {
    configured: boolean;
    missing: string[];
    validEncryptionKey: boolean;
  };
  mailbox: {
    status: string;
    labelIds: string[];
    senders: string[];
    lookbackDays: number;
    lastSuccessAt: string | null;
    lastError: string | null;
    lastFetched: number;
    lastImported: number;
    hasMore: boolean;
    retryAfter: string | null;
  };
  messages: Message[];
  totalMessages: number;
  totalReviews: number;
  templates: {
    id: string;
    providerId: string;
    sender: string;
    confirmedAt: string;
    liveValidatedAt: string | null;
    status: string;
  }[];
  reviews: {
    id: string;
    kind: string;
    reason: string;
    sourceId: string;
    input: { title?: string };
    candidateIds: string[];
  }[];
};
const states: Record<string, string> = {
  DISCONNECTED: "Bağlı değil",
  AUTHORIZED: "Google izni alındı",
  CONNECTED: "Son alım başarılı",
  ERROR: "Alım hatası",
  MISSING_TOKEN: "Sunucudaki güvenli yetki eksik · yeniden bağlan",
  NEEDS_REVIEW: "İnceleme bekliyor",
  IMPORTED: "Aktarıldı",
  UNSUPPORTED: "Ayrıştırılamadı",
  PARTIAL: "Kısmen aktarıldı",
};
const fieldLabels: Record<string, string> = {
  ...Object.fromEntries(
    Object.values(fieldGroups)
      .flat()
      .map((field) => [field.name, field.label]),
  ),
  title: "Başlık",
  category: "Kategori",
  province: "İl",
  district: "İlçe",
  price: "Fiyat",
  sourceUrl: "İlan bağlantısı",
  externalId: "İlan ID",
};
export function EmailPanel() {
  const { data, loading, error, refresh } = useApi<EmailStatus>("email");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [actionError, setActionError] = useState("");
  const [approved, setApproved] = useState<string[]>([]),
    [permitted, setPermitted] = useState(false),
    [labels, setLabels] = useState<{ id: string; name: string }[]>([]);
  async function perform(operation: () => Promise<void>) {
    setBusy(true);
    setActionError("");
    setMessage("");
    try {
      await operation();
      refresh();
      window.dispatchEvent(new Event("radar:refresh"));
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "İşlem tamamlanamadı.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Loading />;
  if (error) return <ErrorBox message={error} retry={refresh} />;
  if (!data) return null;
  return (
    <section className="email-workspace" aria-label="İzinli e-posta keşfi">
      <div className="panel">
        <div className="panel-title">
          <h2>İzinli e-posta keşfi</h2>
          <span className="badge neutral">
            {states[data.mailbox.status] ?? data.mailbox.status}
          </span>
        </div>
        <p>
          Gmail yalnızca salt-okunur izinle ve seçtiğin bildirimlerde
          kullanılır. İlk gerçek örneğin ayrıştırmasını onaylamadan ilanlar
          otomatik aktarılmaz. Site taraması yapılmaz.
        </p>
        <dl className="info-list">
          <div>
            <dt>Son Gmail alımı</dt>
            <dd>{dateTime(data.mailbox.lastSuccessAt)}</dd>
          </div>
          <div>
            <dt>Son alım</dt>
            <dd>
              {data.mailbox.lastFetched} bildirim · {data.mailbox.lastImported}{" "}
              yeni ilan
            </dd>
          </div>
          <div>
            <dt>Bekleyen sayfalama</dt>
            <dd>{data.mailbox.hasMore ? "Devam sayfası var" : "Yok"}</dd>
          </div>
        </dl>
        {!data.configuration.configured && (
          <p className="helper">
            Gmail için sunucuda OAuth client, redirect URI ve şifreleme anahtarı
            gerekiyor. Gizli değerler buraya girilmez. OAuth olmadan aşağıdan
            .eml yükleyebilirsin.
          </p>
        )}
        <div className="form-actions">
          <Button
            disabled={busy || !data.configuration.configured}
            onClick={() =>
              void perform(async () => {
                const grant = await api<{ authorizationUrl: string }>(
                  "email/gmail/connect",
                  { consent: true },
                );
                window.location.assign(grant.authorizationUrl);
              })
            }
          >
            Google ile salt-okunur bağlan
          </Button>
          <Button
            variant="outline"
            disabled={busy || data.mailbox.status === "DISCONNECTED"}
            onClick={() =>
              void perform(async () => {
                await api("email/gmail/disconnect", { consent: true });
                setMessage(
                  "Yerel Gmail bağlantısı kaldırıldı. Google hesabındaki uygulama iznini ayrıca iptal edebilirsin.",
                );
              })
            }
          >
            Gmail bağlantısını kaldır
          </Button>
        </div>
        <form
          className="email-selection"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            void perform(async () => {
              await api("email/gmail/selection", {
                selection: {
                  labelIds: String(form.get("labelIds") ?? "")
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  senders: String(form.get("senders") ?? "")
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                  lookbackDays: Number(form.get("lookbackDays")),
                },
                consentDailyRead: true,
              });
              setMessage(
                "Seçim kaydedildi. Bağlı Gmail'de günlük 09.00 alımı yalnızca bu seçimde çalışır.",
              );
            });
          }}
        >
          <h3>Bildirim seçimi</h3>
          <p className="helper">
            Etiket ve gönderici birlikte seçilirse ikisi de eşleşmeli. En az
            biri zorunlu. Seçimi kaydetmek, bağlı hesapta Europe/Istanbul 09.00
            otomatik alımını etkinleştirir.
          </p>
          <div className="form-grid">
            <label>
              Gmail etiket ID’leri
              <input
                name="labelIds"
                defaultValue={data.mailbox.labelIds.join(",")}
                placeholder="Label_123, Label_456"
              />
            </label>
            <label>
              Bildirim göndericileri
              <input
                name="senders"
                defaultValue={data.mailbox.senders.join(",")}
                placeholder="Kendi bildiriminin From adresi; virgülle ayır"
              />
            </label>
            <label>
              İlk alımda geçmiş gün sayısı
              <input
                name="lookbackDays"
                type="number"
                min="1"
                max="365"
                defaultValue={data.mailbox.lookbackDays}
              />
            </label>
          </div>
          <div className="form-actions">
            <Button disabled={busy}>Seçimi ve günlük alımı kaydet</Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || data.mailbox.status === "DISCONNECTED"}
              onClick={() =>
                void perform(async () =>
                  setLabels(
                    (
                      await api<{ labels: { id: string; name: string }[] }>(
                        "email/gmail/labels",
                      )
                    ).labels,
                  ),
                )
              }
            >
              Gmail etiketlerini göster
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || data.mailbox.status === "DISCONNECTED"}
              onClick={() =>
                void perform(async () => {
                  const result = await api<{
                    status: string;
                    fetched: number;
                    inserted: number;
                    pending: number;
                  }>("email/gmail/sync", {});
                  setMessage(
                    `${result.fetched} bildirim, ${result.inserted} yeni ilan, ${result.pending} inceleme. ${result.status === "DEFERRED" ? "Google bekleme süresi sürüyor." : result.status === "MORE_PENDING" ? "Devam sayfası bekliyor." : ""}`,
                  );
                })
              }
            >
              Seçili bildirimleri şimdi al
            </Button>
          </div>
          {!!labels.length && (
            <ul className="gmail-labels">
              {labels.map((label) => (
                <li key={label.id}>
                  {label.name}: <code>{label.id}</code>
                </li>
              ))}
            </ul>
          )}
        </form>
        {data.mailbox.lastError && (
          <ErrorBox message={data.mailbox.lastError} />
        )}
        {data.mailbox.retryAfter && (
          <p>Google bekleme zamanı: {dateTime(data.mailbox.retryAfter)}</p>
        )}
      </div>
      <div className="panel">
        <h2>Gerçek .eml bildirimini incele</h2>
        <p>
          Gmail’den “Orijinali indir” ile aldığın izinli bildirim dosyasını seç.
          Ekler, görseller ve dış bağlantılar yüklenmez; ham e-posta saklanmaz.
          En fazla 2 MB.
        </p>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={permitted}
            onChange={(event) => setPermitted(event.target.checked)}
          />
          Bu bildirimi ve içerdiği veriyi işleme yetkim var.
        </label>
        <label>
          Bildirim .eml dosyası
          <input
            aria-label="Bildirim .eml dosyası"
            type="file"
            accept=".eml,message/rfc822"
            disabled={busy || !permitted}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (file.size > 2_000_000) {
                setActionError("EML dosyası 2 MB sınırını aşıyor.");
                return;
              }
              void perform(async () => {
                const rawBase64 = await new Promise<string>(
                  (resolve, reject) => {
                    const reader = new FileReader();
                    reader.onerror = () =>
                      reject(new Error("Dosya okunamadı."));
                    reader.onload = () =>
                      resolve(String(reader.result).split(",")[1]);
                    reader.readAsDataURL(file);
                  },
                );
                const result = await api<{
                  message: Message;
                  replayed: boolean;
                }>("email/eml", { rawBase64, permitted: true });
                setMessage(
                  result.replayed
                    ? "Bu e-posta daha önce işlenmiş; tekrar kayıt oluşturulmadı."
                    : `${states[result.message.status]}: ${result.message.inserted} yeni ilan, ${result.message.updated} fiyat güncellemesi.`,
                );
              });
              event.target.value = "";
            }}
          />
        </label>
      </div>
      {actionError && <ErrorBox message={actionError} />}{" "}
      {message && (
        <div className="success-box" role="status">
          {message}
        </div>
      )}
      <div className="panel">
        <h2>Bildirim incelemesi</h2>
        <p>{data.totalMessages} bildirim · son 100 kayıt gösterilir.</p>
        {!data.messages.length && (
          <Empty title="Henüz gerçek bildirim alınmadı" />
        )}
        {data.messages.map((item) => (
          <details className="email-receipt" key={item.id}>
            <summary>
              {item.subject || "Başlıksız bildirim"} —{" "}
              {states[item.status] ?? item.status}
            </summary>
            <p>
              {item.sender} · {item.transport} ·{" "}
              {dateTime(item.receivedAt ?? item.createdAt)} · {item.inserted}{" "}
              yeni / {item.updated} güncelleme / {item.duplicates} tekrar /{" "}
              {item.reviewed} kimlik incelemesi
            </p>
            {item.errors.map((error, i) => (
              <p className="helper" key={i}>
                {error}
              </p>
            ))}
            {item.proposals.map((proposal, index) => (
              <article className="email-proposal" key={index}>
                <h3>{proposal.fields.title ?? "Başlık bulunamadı"}</h3>
                <p>
                  {proposal.fields.price
                    ? money(proposal.fields.price)
                    : "Fiyat bulunamadı"}{" "}
                  · {proposal.fields.province ?? "İl yok"} /{" "}
                  {proposal.fields.district ?? "İlçe yok"} ·{" "}
                  {proposal.fields.category
                    ? categoryLabels[proposal.fields.category]
                    : "Kategori yok"}
                </p>
                <p>İlan ID: {proposal.fields.externalId ?? "Yok"}</p>
                {proposal.fields.sourceUrl && (
                  <a
                    href={proposal.fields.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Kaynak ilan bağlantısı
                  </a>
                )}
                <p>
                  {proposal.missing.length
                    ? `Eksik alanlar: ${proposal.missing.map((field) => fieldLabels[field] ?? field).join(", ")}`
                    : "Zorunlu alanlar ayrıştırıldı; bilgiler bağımsız doğrulanmadı."}
                </p>
                {proposal.warnings.map((warning, i) => (
                  <p className="helper" key={i}>
                    {warning}
                  </p>
                ))}
                <details>
                  <summary>Çıkarılan tüm alanlar</summary>
                  <dl className="info-list">
                    {Object.entries(proposal.fields)
                      .filter(
                        ([field]) => !["sourceUrl", "isDemo"].includes(field),
                      )
                      .map(([field, value]) => (
                        <div key={field}>
                          <dt>{fieldLabels[field] ?? field}</dt>
                          <dd>{String(value)}</dd>
                        </div>
                      ))}
                  </dl>
                </details>
              </article>
            ))}
            {item.status !== "IMPORTED" && (
              <>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={approved.includes(item.id)}
                    onChange={(event) =>
                      setApproved((ids) =>
                        event.target.checked
                          ? [...ids, item.id]
                          : ids.filter((id) => id !== item.id),
                      )
                    }
                  />
                  Bu gerçek, izinli örnekte alanlar doğru ayrıştırılmış. Aynı
                  gönderici ve yapının otomatik aktarımına izin veriyorum.
                </label>
                <div className="form-actions">
                  <Button
                    disabled={
                      busy ||
                      !approved.includes(item.id) ||
                      !!item.errors.length ||
                      !item.proposals.length ||
                      item.proposals.some((p) => p.missing.length)
                    }
                    onClick={() =>
                      void perform(async () => {
                        await api("email/approve", {
                          messageId: item.id,
                          realPermittedSample: true,
                          extractionReviewed: true,
                        });
                        setMessage(
                          "Örnek kullanıcı tarafından onaylandı; uygun kayıtlar aktarıldı. Bu işlem canlı Gmail doğrulaması değildir.",
                        );
                      })
                    }
                  >
                    Şablonu onayla ve aktar
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      void perform(async () => {
                        await api("email/reprocess", { messageId: item.id });
                        setMessage(
                          "Onaylı şablonlarla yeniden değerlendirildi.",
                        );
                      })
                    }
                  >
                    Onaylı şablonlarla yeniden işle
                  </Button>
                </div>
              </>
            )}
          </details>
        ))}
      </div>
      <div className="panel">
        <h2>Şablon doğrulaması</h2>
        {!data.templates.length ? (
          <p>
            Henüz kullanıcı tarafından onaylanmış örnek yok. Sahibinden/Arabam
            gerçek bildirim şablonları canlı doğrulanmadı.
          </p>
        ) : (
          data.templates.map((template) => (
            <p key={template.id}>
              {template.sender} ·{" "}
              {template.status === "USER_APPROVED"
                ? "Örnek kullanıcı tarafından onaylandı"
                : "Onay kaldırıldı"}{" "}
              ·{" "}
              {template.liveValidatedAt
                ? `Gmail'de eşleşen alım: ${dateTime(template.liveValidatedAt)}`
                : "Canlı Gmail örneği henüz doğrulanmadı"}
            </p>
          ))
        )}
      </div>
      <div className="panel">
        <h2>İlan kimliği incelemesi</h2>
        <p>{data.totalReviews} bekleyen inceleme · son 100 kayıt.</p>
        {!data.reviews.length && <p>Bekleyen kimlik çatışması yok.</p>}
        {data.reviews.map((review) => (
          <article className="email-receipt" key={review.id}>
            <h3>{review.input.title ?? "Kimliği belirsiz ilan"}</h3>
            <p>{review.reason}</p>
            <div className="form-actions">
              {review.kind === "WEAK_IDENTITY" && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void perform(async () => {
                      await api("email/review", {
                        reviewId: review.id,
                        action: "CREATE_SEPARATE",
                      });
                      setMessage("Kullanıcı kararıyla ayrı ilan oluşturuldu.");
                    })
                  }
                >
                  Farklı ilan — ayrı kaydet
                </Button>
              )}
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void perform(async () => {
                    await api("email/review", {
                      reviewId: review.id,
                      action: "DISMISS",
                    });
                    setMessage(
                      "Öneri reddedildi; mevcut ilan ve fiyat geçmişi değiştirilmedi.",
                    );
                  })
                }
              >
                Öneriyi reddet
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

"use client";
import { useState } from "react";
import { fieldGroups } from "./form-fields";
import { categoryKeys, categoryLabels, provinces } from "@/lib/constants";
import type { Category } from "@/lib/constants";
import type { EmailProposal } from "@/lib/email/parser";
import { api } from "./use-api";
import { Button } from "./ui/button";
const empty = (v: unknown) =>
  v == null ||
  v === "" ||
  ["bilinmiyor", "unknown", "doğrulanmadı"].includes(
    String(v).trim().toLocaleLowerCase("tr-TR"),
  );
export function EmailCompletion({
  messageId,
  index,
  proposal,
  onSaved,
}: {
  messageId: string;
  index: number;
  proposal: EmailProposal;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState<Category | "">(
      proposal.fields.category ?? "",
    ),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState("");
  const fields = [
    { name: "title", label: "Başlık" },
    { name: "district", label: "İlçe" },
    { name: "neighborhood", label: "Mahalle" },
    { name: "transactionType", label: "İşlem (SATILIK / KIRALIK)" },
    { name: "price", label: "Fiyat (TL)", type: "number" },
    { name: "sourceUrl", label: "İlan bağlantısı" },
    { name: "externalId", label: "İlan ID" },
    ...(category ? fieldGroups[category] : []),
  ].filter((f) =>
    empty(proposal.fields[f.name as keyof typeof proposal.fields]),
  );
  return (
    <details className="pilot-editor">
      <summary>Eksik alanları kaynak kanıtıyla tamamla</summary>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          const patch = Object.fromEntries(
            [...form.entries()]
              .filter(
                ([key, v]) =>
                  !["evidenceNote", "reviewed"].includes(key) &&
                  String(v).trim(),
              )
              .map(([key, v]) => [key, String(v).trim()]),
          );
          setBusy(true);
          setStatus("");
          try {
            await api("email/complete", {
              messageId,
              proposalIndex: index,
              fields: patch,
              evidenceNote: String(form.get("evidenceNote")),
              reviewed: true,
            });
            setStatus(
              "Eksik alanlar kaydedildi; kayıt altına alındı. Şablon ve gövde onayı ayrıca yapılır.",
            );
            onSaved();
            window.dispatchEvent(new Event("radar:refresh"));
          } catch (err) {
            setStatus((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="helper">
          Yalnızca gördüğün kaynak bilgisini gir; bilinmeyen alanları boş bırak.
          Mevcut alanların, fiyat gözleminin ve ilan kimliğinin üzerine
          yazılmaz. Bu tamamlama sonraki e-postaların eksik alanlarını otomatik
          doldurmaz.
        </p>
        {!proposal.fields.category && (
          <label>
            Kategori
            <select
              aria-label="Kategori"
              name="category"
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
            >
              <option value="">Seç</option>
              {categoryKeys.map((c) => (
                <option key={c} value={c}>
                  {categoryLabels[c]}
                </option>
              ))}
            </select>
          </label>
        )}
        {!proposal.fields.province && (
          <label>
            İl
            <select aria-label="İl" name="province" defaultValue="">
              <option value="">Seç</option>
              {provinces.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
        )}
        {fields.map((f) => (
          <label key={f.name}>
            {f.label}
            <input
              aria-label={f.label}
              name={f.name}
              type={f.type ?? "text"}
              step={f.type === "number" ? "any" : undefined}
              maxLength={f.name === "sourceUrl" ? 2048 : 300}
            />
          </label>
        ))}
        <label>
          İncelediğin kaynak / belge açıklaması
          <input
            name="evidenceNote"
            required
            minLength={8}
            maxLength={300}
            placeholder="Örn. ilandaki özellikler bölümünü inceledim"
          />
        </label>
        <label className="checkbox-row">
          <input name="reviewed" type="checkbox" required />
          Bu bilgileri kaynakta kontrol ettim; eksik bilgileri uydurmadım.
        </label>
        <Button disabled={busy}>Eksik alanları kaydet</Button>
        {status && <p role="status">{status}</p>}
      </form>
    </details>
  );
}

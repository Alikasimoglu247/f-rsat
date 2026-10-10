"use client";
import Link from "next/link";
import { useState } from "react";
import type { FormEvent } from "react";
import {
  Upload,
  Plus,
  CheckCircle2,
  FileText,
  LoaderCircle,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";
import { ErrorBox } from "./shared";
import { api } from "./use-api";
import { categoriesForForm, fieldGroups } from "./form-fields";
import { categoryLabels, provinces } from "@/lib/constants";
import type { Category } from "@/lib/constants";
type ImportResult = {
  inserted: number;
  updated: number;
  duplicates: number;
  reviewed: number;
  ids: string[];
};
export function ManualForm() {
  const [category, setCategory] = useState<Category>("EV"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<ImportResult | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    setBusy(true);
    const form = new FormData(event.currentTarget),
      record = Object.fromEntries(form);
    record.category = category;
    const payload = {
      ...record,
      isDemo: form.get("isDemo") === "on",
      ...(category === "ARABA"
        ? { bodyTypeVerified: form.get("bodyTypeVerified") === "on" }
        : {}),
    };
    try {
      setResult(await api<ImportResult>("listings", payload));
      window.dispatchEvent(new Event("radar:refresh"));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel manual-form" onSubmit={submit}>
      <div className="panel-heading">
        <div>
          <h2>Yeni ilan ekle</h2>
          <p>Yalnızca bildiğin bilgileri gir. Bilinmeyen alanları boş bırak.</p>
        </div>
        <Plus size={22} />
      </div>
      <div className="form-grid">
        <label>
          İlan başlığı
          <input
            name="title"
            required
            minLength={5}
            maxLength={180}
            placeholder="Örn. Kadıköy’de 2+1 daire"
          />
        </label>
        <label>
          Kategori
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as Category)}
          >
            {categoriesForForm.map((key) => (
              <option key={key} value={key}>
                {categoryLabels[key]}
              </option>
            ))}
          </select>
        </label>
        <label>
          İl
          <select name="province" required>
            {provinces.map((province) => (
              <option key={province}>{province}</option>
            ))}
          </select>
        </label>
        <label>
          İlçe
          <input
            name="district"
            required
            minLength={2}
            maxLength={80}
            placeholder="Kadıköy"
          />
        </label>
        <label>
          Mahalle (isteğe bağlı)
          <input name="neighborhood" maxLength={300} />
        </label>
        <label>
          İstenen fiyat (₺)
          <input
            name="price"
            required
            type="number"
            min="0.01"
            step="0.01"
            placeholder="4500000"
          />
        </label>
        <label>
          Kaynak URL’si (isteğe bağlı)
          <input name="sourceUrl" type="url" placeholder="https://…" />
          <small>URL kaydedilir; otomatik tarama yapılmaz.</small>
        </label>
        <label>
          Harici ilan kimliği (isteğe bağlı)
          <input name="externalId" maxLength={300} />
        </label>
      </div>
      <label>
        İşlem türü
        <select name="transactionType">
          <option value="">Bilinmiyor</option>
          <option value="SATILIK">Satılık</option>
          <option value="KIRALIK">Kiralık</option>
        </select>
      </label>
      {category === "ARABA" && (
        <label className="checkbox-row">
          <input name="bodyTypeVerified" type="checkbox" />
          Gövde tipi kaynak kanıtını inceledim; açıklama girdim.
        </label>
      )}
      <h3 className="form-section-title">
        {categoryLabels[category]} özellikleri
      </h3>
      <div className="form-grid" key={category}>
        {fieldGroups[category].map((field) => (
          <label key={field.name}>
            {field.label}
            <input
              name={field.name}
              type={field.type ?? "text"}
              min={field.type === "number" ? 0 : undefined}
              step={
                ["sizeM2", "netM2", "grossM2"].includes(field.name)
                  ? "0.01"
                  : field.type === "number"
                    ? "1"
                    : undefined
              }
              placeholder={field.placeholder}
              maxLength={field.type === "number" ? undefined : 300}
            />
          </label>
        ))}
      </div>
      <label className="checkbox-row">
        <input name="isDemo" type="checkbox" />
        Bu bir demo/örnek ilan (gerçek veri değildir).
      </label>
      <p className="helper">
        Girilen hasar, imar, tapu ve deprem bilgileri kullanıcı beyanıdır;
        doğrulanmış kayıt olarak sunulmaz.
      </p>
      {error && <ErrorBox message={error} />}
      <div className="form-actions">
        <Button type="submit" disabled={busy}>
          {busy ? <LoaderCircle className="animate-spin" /> : <Plus />}İlanı
          kaydet
        </Button>
        <Button variant="outline" asChild>
          <Link href="/firsatlar">Vazgeç</Link>
        </Button>
      </div>
      {result && (
        <div className="success-box" role="status">
          <CheckCircle2 size={18} />
          <div>
            {result.reviewed
              ? "İlan kimliği incelemeye alındı; otomatik birleştirme yapılmadı."
              : "İlan kaydedildi."}{" "}
            {result.duplicates ? "Mevcut kayıtla eşleştirildi." : ""}{" "}
            {result.ids[0] ? (
              <Link href={`/ilan/${result.ids[0]}`}>İlanı aç →</Link>
            ) : (
              <Link href="/veri-kaynaklari">İncelemeyi aç →</Link>
            )}
            <p>Güncel karşılaştırma için günlük analizi çalıştırabilirsin.</p>
          </div>
        </div>
      )}
    </form>
  );
}
export function ImportDialog() {
  const [open, setOpen] = useState(false),
    [format, setFormat] = useState("CSV"),
    [content, setContent] = useState(""),
    [permission, setPermission] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<ImportResult | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    setBusy(true);
    try {
      setResult(
        await api<ImportResult>("import", {
          format,
          content,
          permissionConfirmed: permission,
        }),
      );
      window.dispatchEvent(new Event("radar:refresh"));
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload />
          İçe aktar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle className="text-xl font-semibold">
          İlanları içe aktar
        </DialogTitle>
        <DialogDescription className="mt-2 text-sm text-muted-foreground">
          CSV, JSON veya izinli arama e-postasının yapılandırılmış gövdesi. En
          fazla 500 kayıt / 2 MB.
        </DialogDescription>
        <form className="import-form" onSubmit={submit}>
          <label>
            Dosya biçimi
            <select
              value={format}
              onChange={(event) => {
                setFormat(event.target.value);
                setResult(null);
              }}
            >
              <option value="CSV">CSV</option>
              <option value="JSON">JSON</option>
              <option value="EMAIL">E-posta gövdesi (CSV/JSON)</option>
            </select>
          </label>
          <label>
            Dosya seç
            <input
              type="file"
              accept=".csv,.json,.txt"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (file.size > 2_000_000) {
                  setError("Dosya 2 MB sınırını aşıyor.");
                  return;
                }
                setContent(await file.text());
                setError("");
                setResult(null);
              }}
            />
          </label>
          <label>
            İçerik
            <textarea
              aria-label="İçe aktarılacak içerik"
              rows={8}
              value={content}
              onChange={(event) => setContent(event.target.value)}
              placeholder="title,category,province,district,price…"
              required
            />
          </label>
          <a className="sample-link" href="/example-import.csv" download>
            <FileText size={15} />
            Örnek CSV indir (demo kayıt)
          </a>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={permission}
              onChange={(event) => setPermission(event.target.checked)}
              required
            />
            Bu veriyi kullanma ve içe aktarma hakkım var.
          </label>
          {format === "EMAIL" && (
            <p className="helper">
              Posta kutusuna bağlanılmaz. Yalnızca yüklediğin yapılandırılmış
              mesaj gövdesi işlenir.
            </p>
          )}
          {error && <ErrorBox message={error} />}
          <Button type="submit" disabled={busy || !permission}>
            {busy ? <LoaderCircle className="animate-spin" /> : <Upload />}İçe
            aktarmayı başlat
          </Button>
          {result && (
            <div className="success-box" role="status">
              <CheckCircle2 size={18} />
              {result.inserted} yeni · {result.updated} güncellendi ·{" "}
              {result.duplicates} tekrar · {result.reviewed} inceleme. İşlem
              tamamlandı.
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

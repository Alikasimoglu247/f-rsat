"use client";
import { ErrorBox } from "@/components/shared";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <ErrorBox
      message="Sayfa yüklenemedi. Veritabanı ve sunucu durumunu kontrol edin."
      retry={reset}
    />
  );
}

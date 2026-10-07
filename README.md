# Fırsat

Türkçe fırsat listeleme uygulaması. React, TypeScript ve Vite ile hazırlanmıştır.

Arama, kategori filtresi, fiyat/indirim sıralaması, ürün detayları ve tarayıcıda saklanan favoriler içerir. Ürünler ve fiyatlar örnek veridir; canlı mağaza entegrasyonu veya satın alma bağlantısı bulunmaz. Veritabanı, servis veya API anahtarı gerekmez.

## Geliştirme

Node.js 22.12+ gerekir; bulut ortamında Node.js 24 kullanılır.

```sh
npm ci
npm run dev
```

Geliştirme sunucusu 5173 portunu kullanır. `src/deals.ts` örnek ürünleri, `src/App.tsx` arayüzü içerir.

## Doğrulama

```sh
npm run build
npx playwright install chromium
npm test
```

Sistem Chromium'u hazırsa indirmek yerine kullanılabilir:

```sh
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm test
```

Testler arama, filtreleme, sıralama, favorilerin kalıcılığı, ürün detayları ve mobil görünümü doğrular. `npm run preview` derlenmiş uygulamayı 4173 portunda başlatır.

Bulut ortamının yazılabilir npm önbelleği:

```sh
export NPM_CONFIG_CACHE=/workspace/.cache/npm
```

Her bulut görevi zaten ayrı bir ortamda çalışır. `/workspace/f-rsat` içindeki mevcut depoyu kullan; ayrıca Git worktree oluşturma.

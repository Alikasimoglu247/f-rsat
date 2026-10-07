# FırsatRadar AI

Türkçe, kişisel emlak ve ikinci el araç fırsat keşif uygulaması. Next.js App Router, TypeScript, Tailwind, shadcn/ui (Radix), PostgreSQL, Prisma 7 ve Recharts. **İstenen fiyatlar analiz edilir; ekspertiz, satış değeri veya yatırım tavsiyesi üretilmez.**

## Başlatma

Node.js 24, npm, Docker ve Docker Compose gerekir.

```sh
cd /workspace/f-rsat
cp .env.example .env # yalnızca .env yoksa; mevcut ayarlarını koru
npm ci
docker compose up -d --wait
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Başka bir makinede projenin kök dizinini kullanın. Tarayıcıya `http://127.0.0.1:3000` yazın. `APP_BASE_URL` kullandığınız adresle aynı olmalıdır; farklı origin'den değişiklik istekleri reddedilir. Yerel örnek PostgreSQL parolasını gerçek ortamlarda değiştirin. Gerçek sırlar yalnızca `.env` veya güvenli ortam ayarlarında tutulur.

Seed dört kategoride dokuzar, toplam **36 açıkça DEMO etiketli kayıt** oluşturur. Dört ilanda üçer kurgusal fiyat gözlemi vardır. Tekrar çalıştırılması ilan sayısını artırmaz; seed'e ait demo kayıtlarını yeniler, gerçek kayıtları silmez. Sadece kendi verinizle başlamak için seed'i atlayabilirsiniz.

## Çalışan işlevler

- Dashboard: kayıtlı/yeni ilanlar, fiyat düşüşleri, yüksek güvenli fırsatlar, kaynak kapsamı ve son analiz.
- Ev, Araba, Arsa, Tarla; Marmara'nın 11 ilinde il/ilçe/fiyat/başlık/veri türü filtreleri. Üst bütçe zorunlu değildir.
- Manuel kayıt ve kaynak URL'si. **URL saklanır; otomatik ziyaret veya scraping yapılmaz.**
- CSV/JSON ve izinli arama e-postasının yapılandırılmış CSV/JSON gövdesini içe aktarma. Mailbox/IMAP bağlantısı yoktur.
- İşlemsel mükerrer önleme, Decimal fiyatlar, kaynak/harici kimlik/alım zamanı ve veri kökeni.
- Veritabanında takip listesi, saklanan fiyat geçmişi, kullanılan emsaller ve doğrulanmamış risk uyarıları.
- Kayıtlı arama profilleri, puan eşikleri, günlük analiz ve bildirim/iş/kaynak hata günlükleri.
- Sekiz ana ekran, açık/koyu tema, mobil görünüm, loading/empty/error durumları.

## Analiz sınırları

Konutta konum/tip/oda/alan/bina yaşı/durum; araçta marka/model/donanım/yıl/km/yakıt/vites ve aynı **beyan edilen** hasar bilgisi; arazide konum/sınıf/alan/imar/yol erişimi eşleştirilir. Konut/arazi fiyatları hedef m²'ye normalleştirilir. 30 günden eski gözlemler dışlanır, IQR aykırı fiyat filtresi uygulanır. Sonrasında en az **5** yeterli emsal kalmazsa değerleme ve puan **yoktur**.

Medyan, Q1–Q3 aralığı, göreli fark, örnek sayısı, veri güveni ve ilk saklanan fiyata göre değişim hesaplanır. Puan deterministiktir. Yüksek örnekleme güveni, hukuki/tapu/hasar/imar doğrulaması değildir. Demo ve kullanıcı kayıtları birbirine emsal olmaz. Bilinmeyen bilgiler uydurulmaz.

## İçe aktarma

**İçe aktar** düğmesiyle dosya seçin veya içerik yapıştırın, veri kullanım hakkınızı onaylayın. Alanlar [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) ve [örnek CSV](public/example-import.csv) içinde.

```csv
title,category,province,district,price,isDemo,sizeM2,propertyType,rooms,buildingAge,condition
[DEMO] Örnek daire,EV,İstanbul,Kadıköy,4500000.50,true,100,Daire,2+1,10,İyi
```

UTF-8, virgül ayıracı, en fazla 500 kayıt/2 MB. JSON fiyatı da metindir: `"4500000.50"`. Hatalı dosya kısmen saklanmaz. Normalleştirilmiş URL, kaynak içi harici kimlik ve parmak izi tekrarları önler. Farklı fiyat yeni gözlem oluşturur; aynı fiyat geçmişi şişirmez. İçe aktarmadan sonra **Günlük analizi çalıştır**. Manuel iş kimliği veri ve kural değişikliklerini dikkate alır; aynı durum tekrar bildirim oluşturmaz. Kaynak kimliği olmayan benzer içerikler parmak iziyle birleşebilir; özgün URL/harici kimlik sağlayın.

## Otomasyon ve isteğe bağlı bağlantılar

```sh
npm run job:daily
npm run scheduler
```

Varsayılan `DAILY_CRON=0 9 * * *`, **Europe/Istanbul**. Scheduler ayrı sürekli süreçtir; web sunucusu tek başına zamanlamayı başlatmaz. Cron değişikliğinde scheduler'ı yeniden başlatın. İş kilitleri, sınırlı retry, kaynak hata izolasyonu ve kalıcı günlükler vardır.

**Telegram / SMTP:** `.env.example` değişkenlerini sunucuda tanımlayın, web/scheduler süreçlerini yeniden başlatın, Ayarlar'da kanalı açın. Gizli değerler arayüze veya loglara verilmez. Kimlik bilgileri yokken yalnızca uygulama içi bildirimler çalışır. Demo bildirimleri varsayılan kapalıdır. Uzak sistemlerde exactly-once garanti edilemez; kesilen/belirsiz teslimat otomatik yeniden gönderilmez. Gerçek hizmet teslimatı bu sürümde kullanıcı kimlik bilgileri olmadan doğrulanmadı.

**Yetkili API / lisanslı feed:** kullanım hakkınız olan sabit HTTPS JSON endpoint için `AUTHORIZED_FEED_URL`, `AUTHORIZED_FEED_HOST` ve gerekirse `AUTHORIZED_FEED_TOKEN`. Aynı import sözleşmesini kullanır. Başarılı senkronizasyondan önce bağlı gösterilmez. Sahibinden, Arabam, Hepsiemlak, Emlakjet **planlanmış ve bağlı değildir**. API varlığı varsayılmaz; CAPTCHA/oturum/hız sınırı veya erişim kısıtı aşılmaz. Bulut ağ ayarlarında seçtiğiniz hizmetin alan adı izni ayrıca gerekebilir.

**İsteğe bağlı AI:** `AI_ENABLED=true`, `AI_API_KEY`, `AI_MODEL`, OpenAI uyumlu `AI_BASE_URL`. AI yalnızca mevcut Türkçe kanıt cümlelerinin kimliklerini seçer; serbest fiyat/hasar/tapu iddiası üretemez. Sayılar ve puanlar deterministik motorda kalır. Kapalıyken kanıt açıklaması çalışır. Canlı sağlayıcı ayrıca doğrulanmalıdır.

Satıcılara otomatik teklif veya ileti gönderilmez.

## Test ve üretim derlemesi

```sh
npm run test
npm run db:test
npm run test:integration
npm run lint
npm run typecheck
npm run build
npx playwright install chromium # sistem Chromium'u yoksa
npm run test:e2e
```

Bulut tarayıcısı: `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:e2e`.

Entegrasyon yalnızca ayrı `*_test` DB kullanır. E2E komutu ayrı `*_e2e` DB oluşturur, **yalnızca bu test DB'sini** temizler, seed uygular ve üretim sunucusunu 3001 portunda başlatır. Önce `npm run build` gerekir. Geliştirme DB'si değişmez. `TEST_DATABASE_URL` ve gerekirse `E2E_DATABASE_URL` ile ayarlanır. Protokol test doubles başarısı gerçek SMTP/Telegram/AI teslimatı değildir.

```sh
npm run build
npm run start
```

Bu ilk sürüm tek kullanıcılı yerel uygulamadır. İnternete açılırsa HTTPS ve `APP_ACCESS_TOKEN` ile HTTP Basic auth kullanın (kullanıcı adı `radar`); çok kullanıcılı yetki yönetimi yoktur. PostgreSQL loopback üzerinden yayınlanır. Docker volume veriyi tutar; `docker compose down -v` veriyi siler, geliştirme için kullanmayın.

## Mimari ve bulut

[Mimari](docs/ARCHITECTURE.md) · [Uygulama planı](docs/IMPLEMENTATION_PLAN.md) · [Kaynaklar](docs/DATA_SOURCES.md)

Prisma 7 pg adaptörü ve WASM sorgu derleyicisi kullanılır. Standart Prisma CLI temiz kurulumda migration aracı için **binaries.prisma.sh** erişimi ister; bulut ağ ayarlarında bu alan adına izin verin. Checksum/TLS kontrolleri kapatılmaz. Bulutta `NPM_CONFIG_CACHE=/workspace/.cache/npm` yazılabilir önbellek sağlar. Her bulut görevi ayrıdır; mevcut `/workspace/f-rsat` deposunu kullanın, ayrıca Git worktree oluşturmayın. Docker/Next.js/scheduler süreçlerinin yayımlama veya yeni görev sonrasında sürmesi varsayılmaz; kayıtlı başlangıç talimatları bunları yeniden başlatır.

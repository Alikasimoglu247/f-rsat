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
- CSV/JSON, yapılandırılmış e-posta gövdesi ve MIME `.eml` bildirimi içe aktarma; kullanıcı onaylı Gmail API salt-okunur alımı. IMAP bağlantısı yoktur.
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

UTF-8, virgül ayıracı, en fazla 500 kayıt/2 MB. JSON fiyatı da metindir: `"4500000.50"`. Hatalı dosya kısmen saklanmaz. Önce **kaynak + harici ilan ID**, sonra **aynı kaynağın kanonik URL'si** eşleştirilir. Farklı kaynak veya ID'lerdeki benzer ilanlar ayrı kalır. İçerik parmak izi artık otomatik birleşme nedeni değildir: kimliği olmayan benzer kayıt ve ID/URL çatışması Veri Kaynakları'ndaki inceleme kuyruğuna gider. Böyle bir dosyanın birebir tekrarı da güçlü kimlik verilmediyse otomatik fiyat güncellemez. İçe aktarmadan sonra **Günlük analizi çalıştır**. Yeni fiyat saklanan gözlem oluşturur; aynı fiyat tarihçeyi şişirmez. Eski e-posta güncel fiyatı geri almaz.

## M2: Gmail ve gerçek bildirimler

M2'ye geçerken `npm ci`, `npm run db:generate`, `npm run db:migrate`, `npm run build` çalıştırın; web ve scheduler süreçlerini yeniden başlatın. Mevcut kayıtlar ve fiyat gözlemleri silinmez. M1'de farklı kaynaklardan fiyat kökeni görülen eski kayıtlar incelemeye işaretlenir ve puanlamadan çıkarılır. Daha önce yanlış birleşip üzerine yazılmış bilgilerin tamamı otomatik geri kazanılamaz.

OAuth olmadan **Veri Kaynakları → Gerçek .eml bildirimini incele** üzerinden Gmail'in “Orijinali indir” çıktısını yükleyebilirsiniz. Eksik alanlar uydurulmaz; izleme bağlantıları takip edilmez. İlk örneğin alanlarını kontrol edip gerçek/izinli olduğunu onaylamadan şablon otomatik aktarılmaz. Kaynak, gönderici, kategori ve kart yapısı değişirse tekrar inceleme gerekir. Gerçek platform örnekleri henüz depoda doğrulanmadı; sentetik test fixture'ları üretime seed edilmez.

Gmail için Google Cloud'da Gmail API'yi etkinleştirin, OAuth consent screen/test kullanıcılarını ve **Web application** client'ını oluşturun. Redirect URI: `APP_BASE_URL` + `/api/email/gmail/callback`. `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REDIRECT_URI` ve 32 bayt base64url `GMAIL_TOKEN_ENCRYPTION_KEY` yalnızca güvenli sunucu ortamında bulunmalı. Web ve scheduler aynı anahtar/token yolunu kullanır; tokenlar varsayılan `.local/secrets/gmail.enc` dosyasında AES-GCM ile şifrelenir (dizin 0700, dosya 0600). Google bağlantısını arayüzde **Google ile salt-okunur bağlan** ile kullanıcı başlatır; sadece `gmail.readonly` istenir.

Bağlantı sonrası etiketleri gösterin; bir veya daha fazla **etiket ID'si** veya gerçek bildirimin **From adresini** seçin. İkisi varsa ikisi de eşleşmeli. Seçimi kaydetmek bağlı hesapta 09.00 günlük alımına açık izin verir. İlk geçmiş penceresi 7 gün, ayarlanabilir. Bir alım en fazla 5 × 100 mesaj sayfası işler; kalıcı cursor kalan sayfayı sonraki alımda sürdürür, tamamlanan pencerelerde 48 saat tekrar tarama mesaj kimlikleriyle ayıklanır. Kota/Retry-After beklemesi ve kaynak hata izolasyonu uygulanır. Yerel bağlantıyı kaldırmak token dosyasını siler; Google hesabındaki uygulama iznini ayrıca iptal edebilirsiniz.

**Canlı doğrulama yapılmadı:** Gmail OAuth ve Sahibinden/Arabam gerçek bildirim şablonları kullanıcı hesabı ve izinli gerçek örnekler gerektirir. OAuth izni, başarılı Gmail alımı, kullanıcı şablon onayı ve Gmail'de eşleşen şablon ayrı durumlar olarak gösterilir. Kısa bildirimlerde özellik/emsal eksikse ilan saklanabilir ama puan üretilmez. `gmail.readonly` kısıtlı kapsamdır; Google'ın test kullanıcıları, token ömrü, yayın doğrulaması ve gerekirse güvenlik değerlendirmesi koşullarını uygulayın. Ayrıntılar: [M2 veri akışı ve doğrulama](docs/M2_EMAIL_DISCOVERY.md).

## Otomasyon ve isteğe bağlı bağlantılar

**M2.1 pilotları:** Dashboard'da Silivri Gayrimenkul ve Marmara SUV kartları, varsayılan sınırsız bütçeli/70 puanlı profillerle gelir. Filtreler Dashboard veya Ayarlar'dan düzenlenir ve tekrar seed'de korunur. Silivri konutlarında mahalle + net/brüt m²; arazi karşılaştırmalarında hisse/imar/yol beyanı; SUV'da kaynak kanıtı onaylı gövde tipi gerekir. Belirsiz araçlar Veri Kaynakları'nda incelemeye gider; başlıktan SUV tahmin edilmez. Gerçek verisi olmayan kartlar boş durumu ve canlı alım eksikliğini açıkça gösterir. Kurallar, migration ve kullanıcı yetkileri: [M2.1 pilotları](docs/M21_PILOTS.md).

```sh
npm run job:daily
npm run scheduler
```

Varsayılan `DAILY_CRON=0 9 * * *`, **Europe/Istanbul**. Scheduler ayrı sürekli süreçtir; web sunucusu tek başına zamanlamayı başlatmaz. Cron değişikliğinde scheduler'ı yeniden başlatın. İş kilitleri, sınırlı retry, kaynak hata izolasyonu ve kalıcı günlükler vardır.

Günlük iş önce onaylı Gmail/izinli feed kayıtlarını alır, kimlik ve tarihçe işlemlerinden sonra analiz yapar. Bildirimler ekranındaki rapor en yüksek puanlı en fazla 10 **gerçek**, yeterli kanıtlı kaydı içerir (eşik en az 70); Telegram/e-posta için kopyalanabilir. Yetersiz kayıtlar veya demo ilanlar raporda fırsat olarak sunulmaz. Mevcut tekil kanal bildirimleri yalnızca açık tercihler ve kimlik bilgileriyle gönderilir; rapor metni arayüzden kendiliğinden gönderilmez.

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

## M2.2 canlı pilot kabulü

Teknik olmayan kurulum: [CANLI_PILOT_KURULUM.md](CANLI_PILOT_KURULUM.md). Huni, alan tamamlama, fiyat olayları ve canlı doğrulama sınırları: [M22_LIVE_PILOT.md](docs/M22_LIVE_PILOT.md).

Üretim sunucusu için isteğe bağlı Compose overlay `compose.runtime.yaml` eklendi. Operatör güvenli `.env` ayarlarını hazırlamalı; konteynerlerin `DATABASE_URL` adresinde `127.0.0.1` yerine `postgres` kullanılmalı. Yeni sunucuda güçlü PostgreSQL parolası, `APP_ACCESS_TOKEN`, HTTPS reverse proxy ve yedekleme gerekir. Web/scheduler aynı şifreli kalıcı token volume’unu kullanır; şifreleme anahtarı ayrı güvenli sunucu ayarında korunur. `docker compose -f compose.yaml -f compose.runtime.yaml up --build -d` yalnızca operatör tarafından çalıştırılır; bu değişiklik otomatik yayın yapmaz. Mevcut veri volume’u ve parola taşınırken önce yedek alınmalı; `down -v` kullanılmamalı. `scripts/bootstrap.ts` gerçek kaynakları ve varsayılan pilotları kurar, demo eklemez. Günlük rapor uygulamada hazırlanır; harici kanallar mevcut fırsat bildirimlerini gönderir.

GitHub CI: [Actions](https://github.com/Alikasimoglu247/f-rsat/actions). Kod testleri gerçek bildirim veya canlı servis kabulünün yerine geçmez.

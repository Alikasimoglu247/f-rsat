# Yerleşik tarayıcı araştırma köprüsü

## Gerçek yürütme sınırı

Keşfet ekranındaki URL + “İlanı tarayıcıda incele” tek bir kullanıcı seçim isteği oluşturur. Uygulama Codex'i çağıran belgelenmemiş bir port/oturum kullanmaz. `cua` ve yerleşik tarayıcı araçları Node/Docker uygulamasında mevcut değildir. Node cron zamanı geldiğinde ResearchTask kuyruğuna iş yazar; Codex araç oturumu ayrı yürütücüdür. Kuyruk oluşturulması, tarayıcı çalışması veya veri toplanması sayılmaz.

## Codex yürütücüsü

`scripts/browser-agent-adapter.mjs` içindeki `runSelectedJob({appTab,sourceTab,jobId,url})` bu akışı tek araç çağrısında gerçekleştirir. Parametreler belgelenmiş Codex Tab araçlarıdır; adaptör bunları oluşturmaz. Node'dan Tab olmadan çağrı `BROWSER_RUNTIME_UNAVAILABLE` ile durur. Canlı Otomol ilanında bu tekrar kontrol çağrısı PREVIEW_ONLY sonucuyla doğrulandı.

1. Yerel `http://127.0.0.1:3000/kesfet` sayfasını yerleşik tarayıcıda aç. Araştırma kataloğu ve bekleyen işlerin URL'sini oku. Başka tarayıcıya veya HTTP kazımaya geçme.
2. Kullanıcı seçimi işlerinde sadece seçilen tek ilan URL'sini aç; katalog sayfasından yeni ilan keşfetme. Otomatik işler sadece sunucudaki geçerli grant/robots/koşul kayıtlarıyla alınabilir. CAPTCHA, oturum veya erişim engelinde dur; `browser-research/fail` aracılığıyla BLOCKED kaydı oluştur.
3. Yerel sayfadaki “Codex ajan bağlantısı” bölümünde ilgili iş ID'sini seç ve “Ajan isteğini al” ile 5 dakikalık lease al. Lease olmayan ve eski lease ile gelen sonuç reddedilir.
4. İlanı gerçek browser DOM'dan oku. Fiyatı başlık, kredi taksiti, kira getirisi veya benzer ilanlardan alma. Yalnızca seçili ilan bilgilerini al; kişi, telefon, fotoğraf, ilan açıklaması veya tam sayfa arşivi toplama. Gözlem zamanını araç oturumunun gerçek saatiyle kaydet.
5. Köprü, `{url,title,text,observedAt}` biçiminde sınırlı DOM metni kabul eder. Yerel “Tarayıcı DOM sonucu” alanını **ajan** doldurur ve “Tarayıcı sonucunu işle” düğmesine basar. Kullanıcı başlık/fiyat/özellik alanlarını elle yazmaz. Zod ve kaynak ayrıştırıcısı alanları mevcut ListingInput modeline dönüştürür.
6. Güncelleme tarihi yayın tarihi değildir. İlan tarihi görünmüyorsa boş kalır. Her browser sonucu UNVERIFIED fiyat + UNKNOWN satış durumudur. Satıcı/lisanslı teyit yolu ayrıdır.
7. İzin yoksa PREVIEW_ONLY: ayrıştırılmış alanlar yalnızca 10 dakikalık süreç belleğinde ve kullanıcının görüntülediği sayfada yaşar. ResearchTask kaydında URL, durum, alan isimleri ve hash vardır; başlık, fiyat ve ham sayfa yoktur. Listing/ListingPriceHistory'e yazılmaz. Yeniden başlatmada önizleme kaybolur.
8. Açık saklama/otomasyon izni varsa SAVED: mevcut sourceUrl ile aynı kayıt yeniden kullanılır; yeni kayıt kaynağa göre ayrılır. PostgreSQL ortak işlem kilidi, kimlik ve tarihli gözlem mekanizması kullanılır. Discovery işi en fazla üç aynı kaynak detail URL'sini kuyruğa ekler; yetkisiz domain ve filtre istekleri engellenir.

## Kaynak kapsamı ve yetki

Hepsiemlak, Emlakjet, arabam.com, Otomol, Genç City ve Akgün katalogdadır. Varsayılan hepsi kullanıcı yönlendirmeli incelemedir. Robots Allow veya açık sayfa görmek depolama lisansı değildir. Kullanıcı seçimi otomatik keşif yetkisi vermez.

Otomasyon için sunucu yöneticisinin `BROWSER_RESEARCH_GRANTS_JSON` ayarında ilgili kaynak için `host`, gerçek `reference`, `termsUrl`, `allowStorage`, `allowAutomation`, `robotsAllowed`, `termsAutomationAllowed`, `checkedAt`, `expiresAt`, `discoveryUrls`, `listingUrls` vermesi gerekir. Alanlar browser isteğinden alınmaz. Kontrol 7 gün içinde ve izin süresi geçerli olmalıdır; redirect URL'si istekle eşleşmezse sonuç alınmaz. İzin referansı olmadan otomatik iş başlatılmaz. Piyasadan izin almadan sentetik test izni üretim ayarına konmaz.

## Zamanlayıcı testi

`npm run browser:probe` node-cron'un gerçek bir zaman tetiklemesiyle bir BROWSER_SCHEDULE çalışma kaydı oluşturur. Bağımsız Node yürütmesinde runtime CODEX_TOOL_SESSION_REQUIRED'dır. Kaynak izni olmayan mevcut kurulumda NO_AUTHORIZED_SOURCE sonucu beklenir; bu gerçek ilan keşfi başarısı değildir. Mevcut araştırma worker'ının günlük tick'i de tarayıcı iş planını çağırır. Bilgisayar/Docker/Codex açık olmalı; Codex planlı görevi araçların erişilebilirliğini ayrıca kanıtlamalıdır.

## Veri korunması ve sayı denetimi

14 kayıtlık Windows paketinin URL/ID kümesi ile yerel 15 gerçek kayıt karşılaştırıldı. Tek ek kayıt Otomol 9462 Volvo EX40'tır; paket içindeki diğer Volvo 9458'dir. `ResearchRun cmv4ueva500030urmfry02nf9`, trigger SCHEDULED, 2026-10-12 06:00:09.433 UTC (09:00 Türkiye) ve inserted=1 kaydı bu artışı doğrular. Tarayıcı pilotu üç isDemo=true kayıt eklemiştir; 15. gerçek kayıt pilot öncesinde mevcuttu. Hiçbir kayıt silinmez. Yerel .env.windows.local ve dump'lar Git'e aktarılmaz.

## Testler

Unit: görünür DOM alanları, Türkçe tutarlar, kira/fiyat ayrımı, güncelleme tarihi, gelecekteki tarihler, protokol/domain kısıtları, grant süreleri. Ayrı `firsatradar_browser_test` DB entegrasyonu: transient preview saklanmaz, sentetik izinli kayıt yazılır, tekrar idempotent, geçmiş korunur, eski gözlem güncel fiyatı geri almaz, geri çekilmiş izin ve eski lease reddedilir. Sentetik grant gerçek kaynak izni değildir.

Resmî çalışma modeli: https://learn.chatgpt.com/docs/automations?surface=app ve https://learn.chatgpt.com/docs/browser?surface=app.

# M2 — İzinli e-posta keşfi

Referans: M1 `7f8448c`. Çalışma dalı: `feature/m2-email-discovery`. M1 ekranları ve deterministik analiz korunur.

## Aşamalar

1. Kaynak + harici ID önceliği, aynı kaynağın URL eşleşmesi, belirsiz eşleşme kuyruğu ve kayıpsız migration. Her aşamada birim/entegrasyon testleri.
2. MIME `.eml` ayrıştırma, yalnızca doğrudan Sahibinden/Arabam ilan bağlantıları, görünür alanlardan öneriler ve şablon incelemesi. Eksik alanlar doldurulmaz; HTML/resim/URL yüklenmez. İlk örneği kullanıcı incelemeden şablon otomatik aktarım için etkin değildir.
3. Gmail OAuth authorization-code + PKCE + tek kullanımlık state; sadece `gmail.readonly`. Tokenlar AES-GCM ile şifrelenmiş, izinleri sınırlı sunucu dosyasında; anahtar ve client secret yalnızca sunucu ortamında. Kullanıcının açık seçimi olmadan bağlantı/mesaj alımı yapılmaz.
4. Kullanıcının seçtiği etiket/gönderici filtreleri, sınırlı ve devam edebilir Gmail sayfalama, tekrar e-posta/ilan kontrolü, gerçek kaynak kapsamı ve günlük gerçek fırsat raporu.
5. Regresyon, migration, protokol test doubles, gerçek PostgreSQL ve üretim Playwright testleri. Ayrı branch ve inceleme PR'ı.

## Kimlik ve tarihçe

İçerik benzerliği kimlik değildir. Güçlü kimlikli farklı ilanlar ayrı saklanır. Güçlü kimliği olmayan benzer kayıt veya ID/URL çatışması otomatik birleşmez. Eski sürümün daha önce birleştirdiği bilgileri migration geri üretemez; kaynaklar arası fiyat kökeni görülen eski kayıtlar incelemeye alınır, orijinal kayıt/gözlem silinmez.

Eski e-postalar daha yeni fiyatı geri almaz. E-posta zamanı ve alım zamanı ayrı köken bilgisi olarak tutulur. Demo emsalleri gerçek kayıtlara katılmaz; incelemedeki kimlikler puanlanmaz.

## Doğrulama sınırları

Depoda gerçek Sahibinden/Arabam bildirim örneği ve Gmail OAuth yetkisi yoktur. Sentetik test fixture'ları canlı şablon doğrulaması sayılmaz ve uygulamaya seed edilmez. İlk sürüm genel, temkinli alan çıkarımı yapar; desteklenmeyen/eksik/çok anlamlı mesajlar kullanıcı incelemesine gider. Kullanıcının örnek üzerinden onayladığı şablon ile gerçek Gmail alımının başarı durumu ayrı gösterilir.

Gmail `gmail.readonly` kısıtlı kapsamıdır. Google Cloud'da Gmail API, OAuth consent screen, test kullanıcıları ve doğru redirect URI gerekir; dış kullanıcıya yayın için Google doğrulama/güvenlik değerlendirmesi gerekebilir. Test modundaki refresh token ömrü ve kullanıcı tarafından iptal edilen yetki kalıcı bağlantı olarak varsayılmaz.

## Kurulum ve kullanıcıdan gerekenler

Sunucuda `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REDIRECT_URI` ve 32 baytlık `GMAIL_TOKEN_ENCRYPTION_KEY` tanımlanmalıdır. Anahtar, OAuth tokenları ve client secret istemciye verilmez. `.env.example` yalnızca isimleri ve geliştirme redirect adresini içerir; gerçek değerler Git'e eklenmez. Token dosyası `.local/secrets/gmail.enc` altında şifrelenir; ayrı bir kalıcı güvenli volume için `GMAIL_TOKEN_STORE` kullanılabilir.

Kullanıcı bağlantı düğmesiyle Google izni verir, ardından okunacak etiket/göndericileri seçip günlük okumayı onaylar. İkisi birlikte seçilirse iki koşul da gerekir. İlk gerçek bildirim `.eml` olarak içe alınabilir; çıkarılan alanların kullanıcı tarafından incelenip onaylanması, şablonun sonraki otomatik aktarımı için gereklidir. Bu onay gerçek Gmail alımının canlı doğrulaması değildir.

M1 veritabanını güncellemeden önce yedek alın; ardından `npm ci`, `npm run db:generate`, `npm run db:migrate` ve `npm run build` çalıştırın. Web ve scheduler süreçlerini yeniden başlatın. Bu ortamda migration öncesi PostgreSQL arşivi `/workspace/.backups/firsatradar-before-m2.dump` oluşturulup dosya başlığı doğrulandı. Migration testi eski kayıtların, kaynakların, fiyat geçmişinin ve takip bilgilerinin korunduğunu kontrol eder; kaynağı belirsiz eski birleşmeler inceleme durumunda kalır.

## Çalışma ve sınırlar

Gmail alımı en fazla beş adet 100 mesajlık sayfa işler; devam imleci sonraki alıma saklanır. Yarıda kalan sayfa tekrar işlense de teslimat ve ilan mükerrerleri eklenmez. Kota/erişim engelinde bekleme zamanı uygulanır. Okunamayan mesajlar hata kaydı olarak sayılır; gövde ve ekler saklanmaz. HTML, görsel, ilan bağlantısı veya platform sayfası alım için yüklenmez.

Scheduler `Europe/Istanbul` zaman diliminde `0 9 * * *` ile çalışır. Gerçek ve yeterli emsalli kayıtlar için sıralanmış günlük metin raporu saklanır; bildirim ekranında kopyalanıp Telegram/e-posta için kullanılabilir. Tüm günlük özetin otomatik gönderimi bu değişiklikte eklenmedi; M1'in kullanıcı tercihleri ve sunucu kimlik bilgileriyle etkinleştirilen tekil bildirim kanalları korunur. Demo veya yetersiz emsalli kayıtlar gerçek günlük fırsat raporuna alınmaz.

Gerçek platform şablonları, gerçek Google yetkilendirmesi/token yenilemesi ve harici Telegram/SMTP teslimatı bu ortamda canlı doğrulanmadı. Protokol testleri kontrollü test doubles kullanır. Mevcut geliştirme veritabanı 36 DEMO, 0 gerçek ilan içerir; sentetik testler ayrı `_test` ve `_e2e` veritabanlarında çalışır. Doğrudan platform API/partner bağlantıları hâlâ planlıdır. Önceki sürümün saklamadığı özgün ilan bilgileri migration ile geri getirilemez.

## Bu ortamda tamamlanan doğrulama

- 52 birim, 28 gerçek PostgreSQL entegrasyon ve 13 üretim Playwright testi geçti; önceki dashboard/import/analiz akışları da tarayıcı regresyonlarında yer alır.
- Frozen `npm ci`, Prisma client üretimi, M2 migration'ları, tekrar seed, üretim build, lint ve TypeScript kontrolü geçti. Prisma schema ile gerçek geliştirme veritabanı arasında fark bulunmadı.
- Üretim web sürecinde health, dashboard, e-posta ve kaynak API'leri ile ana sayfa başarılı yanıt verdi. Kaynaklar 0 gerçek/36 demo, Gmail bağlantısı yok ve iki bildirim kaynağı `NEEDS_SAMPLE` durumunda.
- Ayrı scheduler `Europe/Istanbul`, `0 9 * * *` ile başladı. Günlük iş tamamlandı; aynı anahtarla tekrar çalıştırma `ALREADY_COMPLETED` döndürdü ve harici bildirim gönderilmedi.

Bu sonuçlar mevcut ortamın ve kontrollü testlerin kanıtıdır; yeni bir bulut görevinde snapshot restorasyonu veya gerçek harici entegrasyon doğrulaması değildir.

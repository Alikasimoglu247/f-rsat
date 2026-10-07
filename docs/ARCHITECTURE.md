# FırsatRadar AI mimarisi

## Kapsam

Türkçe, tek kullanıcılı kişisel uygulama. Next.js App Router + TypeScript, Tailwind CSS ve shadcn/ui bileşenleri; PostgreSQL + Prisma. İlk coğrafya Marmara'nın 11 ili. İl sınırlaması tek bir yapılandırma listesinden genişletilebilir.

## Modüler monolit

- `src/lib/validation.ts`: Zod sözleşmeleri, kategoriye özgü alanlar, parasal değerler.
- `src/lib/providers/`: yetenek kayıt defteri ve izinli sağlayıcı arayüzü. URL girişi yalnızca kayıt oluşturur.
- `src/lib/listings.ts`: işlemsel kayıt, kaynak/harici kimlik/URL/parmak iziyle mükerrer önleme, fiyat gözlemleri ve veri kökeni.
- `src/lib/analysis.ts`: saf, deterministik emsal seçimi ve puanlama.
- `src/lib/jobs.ts`: günlük iş kilidi, kaynak izolasyonu, tekrar deneme, günlükler ve bildirim kuyruğu.
- `src/lib/notifications.ts`: isteğe bağlı Telegram ve SMTP; gizli değerler yalnızca ortam değişkenleri.
- `src/app/api/`: doğrulanmış HTTP sınırları; sunucu tarafı Prisma erişimi.
- `src/components/`: Türkçe arayüz; grafikler yalnızca saklanmış fiyat gözlemlerini gösterir.

## Veri ve değerleme

İlan fiyatları PostgreSQL Decimal(18,2); HTTP ve CSV'de ondalık metin. Para hesapları Prisma Decimal ile yapılır. İlanlar emsal satış değil **istenen fiyat** verisidir. Demo ve gerçek kayıtlar birbirine emsal değildir. En az beş yeterince benzer, güncel emsal gereklidir. IQR aykırı değer filtresi sonrası örnek yetersizse puan yoktur. Emsal medyanı, alt/üst çeyrek, örnek sayısı, göreli fark, güven, fiyat değişimi ve doğrulanmamış riskler birlikte gösterilir. AI isteğe bağlıdır; sayısal sonuçları oluşturmaz veya değiştirmez.

## Güvenlik ve sınırlar

Uygulama varsayılan olarak loopback üzerinde çalışır; internet için kimlik doğrulama/HTTPS eklenmeden yayınlanmamalıdır. Değiştiren HTTP istekleri aynı-origin kontrolü, Zod doğrulaması, istek boyutu sınırı ve yapılandırılır erişim anahtarıyla korunur. Kaynak URL'leri yalnızca HTTP(S) olabilir ve sunucu tarafından ziyaret edilmez. API/feed adaptörleri yalnızca önceden izin verilen sabit HTTPS hedeflerine erişir. CAPTCHA, oturum engelleri veya hız sınırları aşılmaz. Gizli değerler veritabanı, log, istemci veya Git'e yazılmaz.

## Süreçler

Next.js uygulaması ve ayrı `npm run scheduler` süreci aynı kodu/veritabanını kullanır. Saat dilimi Europe/Istanbul; cron ve günlük iş kimliği ayarlanabilir. PostgreSQL advisory lock eşzamanlı işleri engeller; tamamlanmış günlük işler tekrar bildirim üretmez. Hatalı işler aynı kimlikle tekrar denenebilir. Kuyrukta bildirim kimliği benzersizdir. SMTP/Telegram için uzak sistemlerle tam exactly-once garanti edilemez; belirsiz teslimat otomatik tekrar gönderilmez.

## Çalıştırma

Docker Compose PostgreSQL'i kalıcı volume ile başlatır. Migration + idempotent seed sonrası geliştirme sunucusu çalışır. Demo seed gerçek verileri silmez. Birim testler saf motoru, entegrasyon testleri ayrı PostgreSQL veritabanındaki gerçek işlemleri, Playwright kullanıcı kabul akışlarını doğrular.

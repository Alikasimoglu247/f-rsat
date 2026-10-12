# M2.1 — Silivri ve Marmara SUV pilotları

PR #1 üzerinde, `feature/m2-email-discovery` dalında geliştirilir. Main dalına merge yapılmaz. M2'nin kullanıcı izinli Gmail/`.eml`, kaynak kimliği, dedup ve eksik kanıtta puan üretmeme kuralları korunur.

## Varsayılan takip profilleri

Migration ve idempotent seed iki `SearchProfile` oluşturur. Mevcut profiller silinmez; kullanıcı değişiklikleri seed tekrarında üzerine yazılmaz.

| Profil | Başlangıç filtreleri |
| --- | --- |
| Silivri Gayrimenkul Fırsatları | İstanbul / Silivri; tüm mahalleler; EV, ARSA, TARLA; SATILIK; alt/üst bütçe yok; minimum puan 70; fiyat düşüşü takibi açık |
| Marmara SUV Fırsatları | Marmara'nın 11 ili; ARABA; kanıtı kullanıcı tarafından incelenmiş SUV veya CROSSOVER; elektrikli, hibrit, benzin, dizel; marka/model/yıl/km/bütçe sınırı yok; minimum puan 70; fiyat düşüşü takibi açık |

Dashboard'daki ve Ayarlar'daki filtre düzenleyiciden il, ilçe, kategori, işlem, gövde tipi, yakıt, bütçe, puan ve fiyat düşüşü takibi değiştirilebilir. Çoklu filtreyi boş bırakmak tümünü kapsar. Bu yerel filtreler platformdaki kayıtlı aramayı değiştirmez; kullanıcı Sahibinden/Arabam'da izinli bildirimlerini kendisi tanımlar ve Gmail'de okunacak etiket/göndericileri seçer.

## Yeni bilgiler ve karşılaştırma kuralları

- `Listing.transactionType` bilinmiyorsa satılık varsayılmaz. Pilot yalnızca açık satılık verisi bulunan kayıtları içerir.
- `PropertyDetails.netM2` ve `grossM2` ayrı, nullable alanlardır. M1'in belirsiz `sizeM2` değeri net veya brüt alana taşınmaz. Gerçek Silivri konutlarında aynı mahalle, konut tipi, oda, benzer bina yaşı/durum ve hem net hem brüt alan gerekir. Net alan fiyat normalizasyonunda kullanılır; net/brüt alanların tutarlılığı ve her iki alanın benzerliği kontrol edilir.
- Silivri arsa/tarlaları aynı mahalle, sınıf, imar, yol erişimi ve hisse beyanlarıyla karşılaştırılır; fiyatlar m² üzerinden normalize edilir. Eksik veya farklı hisse durumu eşleşmez. İmar/tapu/yol bilgileri beyan olarak ve doğrulanmamış risk açıklamalarıyla sunulur; hukuki belge doğrulaması yapılmaz.
- `VehicleDetails.bodyType`, `bodyTypeVerified` ve `bodyTypeEvidence` eklendi. SUV/Crossover başlıktan, marka/modelden veya demo veriden tahmin edilmez. İlanın açık gövde tipi beyanı tek başına doğrulama değildir. Belirsiz gerçek araçlar Veri Kaynakları inceleme kuyruğuna gider; kaynak kanıtı açıklaması ve açık kullanıcı inceleme onayı gerekir. Buradaki doğrulama kullanıcı tarafından incelenen kanıtın kaydıdır; bağımsız resmi sicil sorgusu değildir.
- Kanıtı onaylı araçlar Marmara illeri arasında aynı gövde tipi, marka/model/donanım, yakıt/vites, benzer yıl/km ve aynı hasar beyanıyla karşılaştırılır. SUV, Crossover ve sedan doğrudan birbirine emsal yapılmaz. Gövde bilgisi değişirse eski onay düşer ve tekrar inceleme gerekir.

Manuel giriş, CSV/JSON ve e-posta ayrıştırıcısı yeni açık alanları kabul eder. E-posta gövdesinde `Mahalle`, `İşlem`, `Net m²`, `Brüt m²`, `Gövde tipi`, `Hisse durumu` etiketleri okunabilir; e-posta ayrıştırıcısı gövde tipini kendiliğinden doğrulamaz. Gerçek platform şablon desteği veya canlı doğrulama iddiası oluşturulmaz.

## Dashboard ve günlük takip

İki ayrı kart, yalnızca profile eşleşen gerçek ve aktif kimlikli kayıtlar için toplam sayıyı, İstanbul gece yarısından itibaren keşfi, saklanan daha yüksek bir önceki fiyata göre düşüşleri, yeterli emsalli fırsatları ve en iyi 5 fırsatı gösterir. Demo, incelemedeki kimlik ve kanıtsız SUV sınıfı dahil değildir. Fiyat düşüşü tek başına fırsat sayılmaz. Güncelliği/yeterli emsali olmayan kayıtlara fırsat etiketi verilmez.

Son başarılı canlı alım, profile eşleşen ilanın gerçekten Gmail'de işlenmiş e-posta teslimatından hesaplanır. Aynı fiyatlı sonraki teslimat da bu zamanı günceller; yerel `.eml` importu veya genel kaynak tarihi canlı pilot başarısı sayılmaz. Eşleşen canlı teslimat yoksa açıkça doğrulanmadı gösterilir.

Scheduler `Europe/Istanbul` / `0 9 * * *` ile devam eder. Seçilmiş izinli Gmail bildirimleri alınır, kimlik/fiyat geçmişi işlenir, analiz güncellenir ve iki pilotun ayrı fırsat/fiyat düşüşü bölümleri rapora eklenir. Gmail okunmadığında rapor otomatik alımı başarılı göstermez. Bildirim raporu gönderime hazır metindir; kullanıcı tercihleri/kimlik bilgileri olmadan Telegram veya e-posta gönderilmez.

## Migration ve doğrulama

`202610080004_m21_pilots` veri ekleyerek modelleri genişletir; özgün ilanlar, fiyat geçmişi, kaynak kökeni ve takip bilgileri korunur. Eski araçlara gövde tipi atanmaz; gerçek araçlar incelemeye alınır. Gerçek ilanların önbellekteki değerlendirmeleri yeni kurallarla yeniden hesaplanmak üzere geçersizleştirilir. Migration öncesi bu ortamda `/workspace/.backups/firsatradar-before-m21.dump` PostgreSQL arşivi oluşturuldu ve başlığı doğrulandı.

Kurulum: `npm run db:generate`, `npm run db:migrate`, `npm run db:seed`, `npm run build`; web ve scheduler süreçlerini yeniden başlatın. Testler ayrı `_test`/`_e2e` veritabanları kullanır; sentetik fixture'lar gerçek geliştirme verilerine aktarılmaz.

Canlı pilot için hâlâ Google OAuth ayarları, kullanıcı `gmail.readonly` izni, etiket/gönderici seçimi, izinli gerçek platform örnekleri ve gerekli sınıflandırma kanıtları gerekir. Hiçbir harici hesap bu geliştirmede bağlanmadı. Geliştirme veritabanındaki iki pilotun gerçek ilan sayısı 0'dır; 36 demo kaydı pilot sonuçlarına karışmaz.

Doğrulama: 61 birim, 35 gerçek PostgreSQL entegrasyon ve 16 üretim Playwright senaryosu geçti. Build, lint, TypeScript ve Prisma şema/veritabanı uyumu kontrol edildi. Gerçek geliştirme DB'sine migration/tekrar seed uygulandı; üretim health/dashboard/settings/e-posta API'leri iki boş gerçek pilotu doğru döndürdü. Günlük iş tamamlandı ve tekrarında `ALREADY_COMPLETED` döndü; harici bildirim gönderilmedi. Bu sonuçlar mevcut ortam ve kontrollü sentetik testlerle sınırlıdır; canlı platform şablonu/Gmail yetkisi veya yeni bulut görevinde restorasyon kanıtı değildir.

# Uygulama planı

1. Next.js/Tailwind/shadcn altyapısı, PostgreSQL Compose, 14 zorunlu Prisma modeli ve migration.
2. Validasyon, kaynak kayıt defteri, manuel/CSV/JSON/e-posta içe aktarma, mükerrer önleme ve fiyat geçmişi.
3. Kategoriye özgü emsaller, exact-decimal istatistikler, yeterlilik eşiği ve belirsizlik/risk açıklamaları; tüm kategorilerde açık demo verisi.
4. Dashboard, Fırsatlar, İlan Detayı, Fiyat Geçmişi, Takip Listem, Veri Kaynakları, Bildirimler ve Ayarlar; light/dark ve mobil arayüz.
5. Günlük analiz, kalıcı arama profilleri/uyarılar, idempotency, kaynak hata izolasyonu, isteğe bağlı SMTP/Telegram/AI.
6. Birim/entegrasyon/E2E, TypeScript, lint, üretim derlemesi ve gerçek başlatma doğrulaması; README ve tekrar kullanılabilir ortam ayarları.

## Kabul ölçütleri

Kullanıcı dört kategoriyi gezebilir, il/ilçe/fiyat filtreleyebilir, dosya içe aktarabilir, manuel ilan ekleyebilir, takip edebilir, saklanan fiyat geçmişini görebilir, yeterli emsallerin kanıtlarını inceleyebilir, günlük işi çalıştırabilir, bildirim seçeneklerini kaydedebilir ve kaynak hatalarını görebilir. Canlı hizmete erişim yokken bunların tamamı çalışmalıdır. Demo kayıtlar her ekranda etiketlenir. Yetkisiz marketplace entegrasyonları planlanmış/bağlı değil olarak görünür.

## Teslimat kapsamı

İlk sürüm kişisel, yerel kullanım içindir. Kullanıcı hesapları, çok kiracılı yetkilendirme, doğrulanmış satış fiyatları, yasal/tapu/hasar doğrulamaları ve izinsiz scraping kapsam dışıdır. Bildirim ve AI canlı doğrulaması geçerli kullanıcı yapılandırması gerektirir; test doubles ile doğrulama canlı bağlantı olarak raporlanmaz.

## Doğrulanan teslimat

Altı uygulama aşaması tamamlandı. Yazılabilir npm önbelleğiyle `scripts/setup.sh` temiz `npm ci`, Prisma client üretimi, PostgreSQL sağlık kontrolü, migration, tekrar çalıştırılabilir seed ve üretim derlemesinden geçti. Checksum/TLS doğrulaması korunarak `binaries.prisma.sh` erişimi doğrulandı.

- Vitest: 34 birim testi, 7 ayrı PostgreSQL entegrasyon testi başarılı.
- Playwright: üretim sunucusunda ayrı E2E veritabanıyla 8 kullanıcı akışı başarılı; geliştirme verileri korunur.
- ESLint ve TypeScript başarılı. Üretim sunucusunun dashboard/health/kaynak istekleri HTTP 200 döndürdü; dört kategoride toplam 36 demo, sıfır gerçek ilan doğrulandı.
- Günlük iş ve Europe/Istanbul scheduler çalıştırıldı; tekrar işlenme ve bildirim mükerrerliği test edildi.

Canlı marketplace, SMTP, Telegram ve AI sağlayıcı teslimatı doğrulanmadı. Bunların yapılandırma/adapter ve hata davranışları test edildi; bağlı oldukları iddia edilmez. Güncel pg 8 adaptöründen gelen eşzamanlı sorgu deprecation uyarısı testleri engellemez; pg 9 yükseltmesinde adaptör uyumluluğu yeniden kontrol edilmelidir.

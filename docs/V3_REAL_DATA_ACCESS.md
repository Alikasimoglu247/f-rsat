# V3 — güncellik ve resmî veri erişimi

12 Ekim 2026, Europe/Istanbul. PR #1 / `feature/m2-email-discovery`.

## Düzeltilen davranış

Eski kod sayfanın `retrievedAt`/`observedAt` zamanını fiyat güncelliği kabul ediyordu. 2024 ilanı bugün HTTP 200 verdiğinde “Kaynak güncel” olabiliyordu. Bu davranış kaldırıldı.

`Listing` üzerinde özgün **publishedAt**, yayıncı **sourceUpdatedAt**, **pageCheckedAt**, **priceVerifiedAt/priceVerification**, **availabilityVerifiedAt/availabilityStatus** ve kimlik/fiyatla eşleşen **verificationEvidence** ayrı saklanır. Bilinmeyen tarihler `null` kalır. Migration yalnızca eski provenance'da açıkça bulunan yayın tarihini ve eski araştırma kontrol zamanını taşır; hiçbir eski gözlemi fiyat veya satış teyidine dönüştürmez. İlanlar, kimlikler, demo ayrımı ve bütün fiyat geçmişleri korunur. Eski türetilmiş puanlar geçersizleştirilir.

Güncel fiyat kullanımı için özgün ID/URL, geçerli yayın tarihi, son yedi gün içinde kaynak gözlemi ve **iki ayrı**, tarihli fiyat/satış teyidi gerekir. Teyit yöntemi yetkili akış veya kayıtlı satıcı teyidi olmalı; kanıt ID/URL/fiyat/tarihle eşleşmeli. Gelecek tarih, farklı fiyat/kimlik, bekleyen kimlik incelemesi, kaldırılmış/satılmış/erişimi başarısız kaynak engellenir. Yedi gün konservatif üst sınırdır; günlük alım bunu garanti etmez.

90 günden eski yayın, güncel fiyat ve satış teyidi olmadıkça arşivdir. Yeni yayın ve `InStock`, HTTP 200, yeni sayfa kontrolü veya genel bölge raporu tek başına teyit değildir. Eski ilanın gerçekten yenilenmiş iki teyidi varsa yeniden güncel olması mümkündür; eski yayın tarihi silinmez. Araç **model yılı** ilan yayın yılı değildir.

Mevcut ekranlarda dört durum gösterilir: **Güncel ilan ve fiyat teyidi var / Sayfa yeniden görüldü; satış-fiyat teyidi yok / Eski ilan-arşiv / Kaldırılmış veya erişilemeyen ilan**. Fiyat ve satış teyidi tarihleri detayda ayrıdır. Tarihsel yayıncı riskleri ve hesaplamalar tarihsel/teyitsiz olarak korunur; güncel birim fiyat veya değerleme olmaz.

Teyitsiz fiyat metni değişirse `PRICE_CLAIM_CHANGED` kaydedilir; teyitli piyasa değişimi sayısına girmez. Ana ürünün yedi günlük indirimleri yalnızca teyitli geçmiş gözlemlerden hesaplanır. İlan kimliği ve olası aynı parsel incelemesi fiyat güncelliğinden bağımsız korunur. Emsal/fiyat avantajı ayrıca en az beş bağımsız uygun kayıt ve kategori/özne kanıtı ister; SUV'larda model/donanım/yıl/km/hasar ayrımı ve kondisyon kanıtı korunur.

## Büyük kaynaklar — ölçülen erişim matrisi

“Doğrulanmadı”, platformda API olmadığı anlamına gelmez. Aşağıdaki doküman kontrolü bir veri alım lisansı veya hesap bağlantısı değildir. Dokümante edilmiş arama/okuma endpoint'i, kapsamı ve hakları doğrulanmadan adaptör etkinleştirilmedi.

| Kaynak | İlan arama/okuma API / yalnız yükleme-yönetme ayrımı | API / CSV / JSON / XML / SFTP | Hesap, fiyat/tarih/durum alanları | Saklama, karşılaştırma ve yeniden kullanım | Ücretsiz erişim / maliyet | Bu oturumda sonuç |
|---|---|---|---|---|---|---|
| Hepsiemlak | Açık geliştirici arama/okuma sözleşmesi doğrulanmadı. Kurumsal web hizmeti, tüm piyasayı okuyan API kanıtı değildir. | Sağlayıcı aktarım sözleşmesi doğrulanmadı. | Kurumsal/bireysel hizmet şartları var; API hesap/kapsam/alanları doğrulanmadı. | Resmî şartlar otomatik program, robot, crawler ve screen scraping için önceden yazılı izin istiyor. | Webde ücretsiz hizmet olabilmesi ücretsiz API hakkı değildir; API bedeli doğrulanmadı. | Şartlar 200; izin olmadığı için veri alımı yok. |
| Emlakjet | Arama/okuma veya yalnız ilan yükleme API kapsamı doğrulanmadı. Endeksa web entegrasyonu açık üçüncü taraf API değildir. | Sağlayıcı dışa aktarım sözleşmesi doğrulanmadı. | Üyelik/paket/değerleme hizmetleri belgeli; API tarih/ilan durumu alanları doğrulanmadı. | Kullanım koşulları 6.2 ve 8.2: yazılı izinsiz otomatik erişim/kopyalama yasak. | Bazı web görüntülemeleri ücretsiz; paket/değerleme erişimi farklı. API fiyatı doğrulanmadı. | Şartlar 200; kayıt alımı etkin değil. |
| Sahibinden | Resmî okuma/yönetme API kapsamı doğrulanmadı. | Doğrulanmadı. | Hesap/OAuth/API anahtarı kullanılmadı. | Lisans doğrulanmadı. | Doğrulanmadı. | Yalnız belge erişimi için robots kontrolü **429**; kurumsal belge veya ilan isteğine devam edilmedi. |
| REIDIN | Bu çalışmada güncel resmî API sözleşmesi okunamadı; ilan sağlayıcısı olarak doğrulanmadı. | Doğrulanmadı. | Fiyat/tarih/durum ve Türkiye/ilçe kapsamı doğrulanmadı. | Doğrulanmadı. | Deneme/bedel doğrulanmadı. | Robots yönlendirmesi doğrulanamadı; alım yok. |
| Endeksa | Resmî ana sayfa erişilebilir; dış geliştirici API sözleşmesi bulunamadı. Emlakjet'in resmî şartlarında değerleme/piyasa analizi hizmeti geçiyor. | Açık portföy akışı doğrulanmadı. | Değerleme/analiz ile satıcının ilan fiyatı ve aktif stok ayrı veri türleridir. | Üçüncü taraf saklama/karşılaştırma hakkı doğrulanmadı. | Ücretsiz API/deneme ve bedel doğrulanmadı. | Ana sayfa 200; ilan API'si bağlanmadı. |
| arabam.com | Açık geliştirici ilan arama/okuma veya yükleme API dokümanı doğrulanmadı. | Doğrulanmadı. | Web erişimi, API alanlarının/hesabının kanıtı değildir. | Toplu veri kullanım izni doğrulanmadı. | Doğrulanmadı. | Resmî ana sayfa/robots erişimi var; bağlantı yok. |
| DOD | Resmî kurumsal belge sayfaları erişilebilir; tüketici arama/okuma API sözleşmesi doğrulanmadı. | Doğrulanmadı. | Stok/durum/tarih API alanları doğrulanmadı. | Yeniden kullanım lisansı doğrulanmadı. | Doğrulanmadı. | Canonical `dod.com.tr` belgeleri 200; veri alımı yok. |
| Otokoç | Doküman erişimi kısıtlı; API kapsamı doğrulanmadı. | Doğrulanmadı. | API hesabı kullanılmadı. | Robots/AI-input kısıtı nedeniyle devam edilmedi. | Doğrulanmadı. | Kaynakta duruldu. |
| İkinciyeni | Kurumsal üyelik/hizmet sözleşmeleri var; ilan okuma API'si oldukları doğrulanmadı. | Doğrulanmadı. | Üyelik ve satış/teklif hizmeti, veri API'si değildir. | Şartlar yazılı izinsiz işleme, kopyalama ve kalıcı indirmeyi yasaklıyor. | API/deneme bedeli doğrulanmadı; satın alma yok. | Resmî sözleşmeler 200; veri alınmadı. |
| VavaCars / Toyota | VavaCars robots adresi belgeye yönleniyor; Toyota kurumsal ana sayfası erişilebilir. Dış geliştirici güncel stok sözleşmesi doğrulanmadı. | Doğrulanmadı. | Yayın/güncelleme/fiyat/stok alanları doğrulanmadı. | Doğrulanmadı. | Doğrulanmadı. | İlan bağlantısı yok. |

Kanıt: [tarihli HTTP/doküman kayıtları](research/20261012-v3-access-evidence.json). İlk belge keşfinde alt dize eşleşmesi dört ilan ve bir blog URL'sini yanlış sınıflandırdı. Bunlardan ilan alanı/fiyat ithal edilmedi veya analiz yapılmadı. Filtre ilan yollarını kesin dışlayacak şekilde düzeltildi; bu erişimler başarı/izin kanıtı sayılmadı. Kısıtlar aşılmadı, hesap girişi yapılmadı.

## Somut sürdürülebilir yol ve çalışan sözleşme

Öncelik **sağlayıcının izin verdiği tarihli portföy akışı**dır. Mevcut sabit HTTPS feed adaptörü genişletildi; lisans referansı ve kaynak kimliği olmadan ağ alımı yapmaz. Yönlendirme, özel ağ hedefi, büyük gövde ve Sahibinden ilan/API hedefleri reddedilir; TLS/proxy güvenliği korunur. Alternatif olarak aynı sözleşmeyi bir ofis/satıcının izinli SFTP/ERP aktarımıyla otomatik yenilediği yerel JSON dosyası üzerinden okuyan adaptör vardır. SFTP oturumu kurulmuş gibi gösterilmez.

`src/lib/research/authorized-feed.ts` sürüm 1 sözleşmesi kaynak ID'si, belgeli kullanım referansı, saklama/karşılaştırma/yeniden kullanım hakları; özgün ID/URL; yayın, güncelleme, gözlem, fiyat teyidi ve satış teyidi tarihlerini ayrı ister. `VALUATION` kaydı ilan fiyatı yerine kabul edilmez. Destek yalnızca bu doğrulanmış uygulama sözleşmesidir; herhangi bir platformun doğrulanmamış şablonu destekleniyor denmez. `ResearchProvider` sınırı gerçek sağlayıcı adaptörünün değiştirilmesine uygundur.

Sunucu ayarları: `AUTHORIZED_FEED_URL/HOST/TOKEN/SOURCE_ID/GRANT_REFERENCE` veya `LICENSED_FEED_PATH/SOURCE_ID/GRANT_REFERENCE`. Şifre/token/lisans referansını GitHub'a koymayın. Sağlayıcıdan gereken resmî koşullar: veri alma hesabı/anahtarı ve kapsamı; tarihli aktif ilan/fiyat/durum sözleşmesi; kişisel saklama, emsal karşılaştırması, türev analiz ve güncelleme/silme hakkı. Bu haklar veya ücretli erişim olmadan bağlantı kurulmaz. Bu oturumda sağlayıcıya başvuru, e-posta, deneme hesabı veya satın alma yapılmadı; belgelenmeyen ücret uydurulmadı.

İlk hedef Silivri merkezde **Alibey / Yeni / Mimarsinan ayrı 2+1 daire grupları**; gerektiğinde Selimpaşa ve diğer hukuki sınıfları ayrı segmentler. Sağlayıcı erişimi yokken Değirmenköy'de aynı küçük siteleri dolaşmak ana strateji değildir. Varsayılan araştırma yalnızca resmî ekonomik/bölgesel yardımcı kaynakları yeniler; eski ilan fiyatlarını güncel yapmaz. Ekran “yetkili güncel ilan akışı bağlı değil” durumunu açık gösterir.

## Kabul ve sınır

Gerçek kayıtlar mevcut **14** (9 gayrimenkul, 5 SUV); yeni yetkili kaynak bağlantısı ve yeni teyitli ilan **0**. Gerçek harici izin/örnek bulunmadığından canlı entegrasyon pilotu başarı iddiası yok. Yetkili sözleşmenin DB/analiz hattı ve tekrar alımda tarih/kimlik korunması **sentetik, korumalı test DB'sinde** doğrulandı. V2'nin eski transfer paketleri V3'e aktarılabilir; yayın ve fiyat gözlem tarihleri korunur, eski fiyat teyitli olmaz. Tarihsel değerlendirme geçmişi korunur; aktarılan canlı puan yeniden hesaplanana kadar etkinleştirilmez.

Yerel kabul: **143 birim + 74 PostgreSQL + 27 Playwright = 244 test**, lint, tip kontrolü ve production build başarılı. Gerçek Cloud DB'de V3 ile bir `CENTRAL_HOME` araştırması çalıştı (`cmv4x6htn0000hkpw23abi6xu`, PARTIAL): **14 ilan / 14 özgün fiyat gözlemi / 30 araştırma**, yeni teyitli kayıt ve yeterli fırsat **0**. Bütün fiyatların özgün tarih ve tutarları V2 paketiyle tek tek karşılaştırıldı; değişmedi. 2024 ilanı gerçek uygulama detayında arşiv, fiyat/satış teyidi “Yok” olarak görüldü; tarayıcı hatası ve mobil yatay taşma gözlenmedi.

İlk eski test beklentileri HTTP/sayfa kontrolünü güncellik saydığı için başarısız oldu; yeni kurala göre düzeltildi. Pozitif emsal senaryolarına yalnız korumalı test DB'sinde açık **sentetik fiyat/satış teyidi** eklendi; kalite kapısı gevşetilmedi. Eski erişim-fail testinin UI metni yeni “Kaldırılmış veya erişilemeyen” durumuna güncellendi. Final testlerde başarısız senaryo yok. GitHub CI sonucu ilgili HEAD için ayrıca PR #1'e kaydedilir; önceki yeşil CI bu commit'in kanıtı değildir.

Windows kullanıcı veritabanına uzaktan erişim yok; eklemeli migration Windows güncelleme/başlatma sırasında uygulanır. Main'e merge, uygulama yayını veya ücretli işlem yapılmadı.

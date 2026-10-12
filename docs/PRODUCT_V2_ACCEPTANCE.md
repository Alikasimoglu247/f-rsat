# Product V2: somut kabul sonuçları

Çalışma dalı `feature/m2-email-discovery`; PR #1. Başlangıç HEAD'i `371752d`. Mevcut PostgreSQL, fiyat/kimlik motoru, adaptif araştırma ve önceki import işlevleri korunmuştur. Main'e merge ve uygulama yayını yapılmamıştır.

## Veri ve gerçek kullanım

- Cloud PostgreSQL'e gerçekten erişildi: **14 gerçek fiyatlı ilan, 14 özgün fiyat gözlemi, 36 ayrı demo kayıt**. Gayrimenkul 9 (8 arsa, 1 tarla); SUV 5. Konut fiyat kaydı yok.
- Genç City 8, Akgün Gayrimenkul 1, Otomol 5 kaynak kaydı. Kaynakta satış mevcudiyeti/hukuki doğruluk bağımsız doğrulanmış değildir. Aynı parsel olabilecek ilanlar inceleme bekler ve bağımsız emsal sayılmaz.
- Cloud paketi boş, ayrı `_test` PostgreSQL'e aktarıldı: önizleme **0 yazma**, ilk uygulama **14 ilan / 14 fiyat / 23 araştırma**, tekrar uygulama **0 yeni ilan / 0 yeni fiyat / 0 yeni araştırma**. Özgün fiyatlar ve gözlem zamanları tek tek karşılaştırıldı. Son teslimat paketi arayüz araştırmasının ardından **24 araştırma** içerir.
- Gerçek Cloud uygulamasındaki araştırma düğmesi 11 Ekim 2026 21.13–21.15 UTC'de (12 Ekim 00.13–00.15 İstanbul) çalıştırıldı. Task `cmv4bluyw00004npwwz6txs6p`, araştırma `cmv4blv2i00014npwpy3hntc5`: **23 → 24 çalışma**, **0 yeni fiyatlı ilan**, **0 fiyat değişimi**, **PARTIAL**. TCMB, UAB ve açık yayıncı kataloglarında gerçek HTTP 200 kontrolleri; önceden engelli belediye kaynağına yeniden istek yok. Desteklenmeyen AFAD çıkarımı başarı sayılmadı. Sahibinden/Gmail çağrısı yapılmadı.
- **0 doğrulanmış yatırım fırsatı.** Beş güncel, bağımsız, hukuken/teknik olarak karşılaştırılabilir emsal bulunmadan puan üretilmez. Fiyat kaydı, güncel satış teyidi değildir.

## Çalışan ürün

Genel Bakış, Keşfet, Yatırım Analizi, Araştırma Merkezi, Takip Listem ve Fiyat Geçmişi yeniden düzenlendi. Kart → aday detayı → derin araştırma hiyerarşisi; ortak ekonomik özet; bulgularla ilişkili, tekrarsız kaynaklar; açık/koyu tema ve mobil düzen çalışır. Kaynaktan izinsiz fotoğraf kopyalanmadı.

Boş veritabanında kurulum kontrolleri ve veri yükleme/araştırma eylemleri görünür. Eski JSON yalnızca arşivdir; gerçek ilan/başarılı araştırma sayısına girmez. Demo kayıtlar yeni ürün ekranlarında gerçek kayıtlarla karışmaz; eski işlevlere ikincil menüden ulaşılır.

Araştırma başlatma ve ağ kullanmadan yeniden değerlendirme, DB'de kalıcı görev kaydı, eşzamanlı kilit, hız sınırı, yerel origin/CSRF ve gerektiğinde erişim tokenı ile korunur. İlerleme gerçek kontrol/çıkarım/aday sayılarıdır; yapay yüzde değildir. Güvenli iptal uygulanmadığı için sahte durdurma düğmesi yoktur.

Aktarım şema/bütünlük/kimlik/referans denetimi ve rollback önizlemesi yapar. Kaynak+ID ve kanonik URL kullanılır; belirsiz çakışma otomatik birleştirilmez. Yerel kayıtlar, kullanıcı profili tercihleri ve daha yeni fiyatlar korunur. Posta, token, ayar, kişisel iletişim ve fotoğraflar pakete alınmaz. SHA-256 bozulmayı saptar, yayıncı kimliğini doğrulayan bir imza değildir; yalnızca güvenilen özel paketi kullanın.

## Doğrulama

**134 birim + 69 PostgreSQL + 26 Playwright senaryosu = 229 test.** Tip kontrolü, lint ve production build ayrıca çalıştırılır. Test sonuçları ve final GitHub CI bağlantısı PR #1'e yazılır. Gerçek verili masaüstü/375 px mobil Chromium kontrolünde tarayıcı hatası ve yatay taşma gözlenmedi. Sentetik kabul kayıtları yalnızca korumalı `_test` / `_e2e` veritabanlarında kullanılır.

Yerel Docker image build, 32 GB Cloud disk kotasına takıldı. Yalnızca Docker build cache temizlendi; çalışan PostgreSQL container/volume ve gerçek kayıtlar korunmuştur. İmaj build ve gerçek Windows Compose servis grafiği GitHub CI'da ayrıca doğrulanır: boş ilk kurulum, erişim denetimi, gerçek worker heartbeat'i, web/worker yeniden oluşturulunca veri ve aynı PostgreSQL'in korunması. Bu, Windows GUI/PowerShell testi değildir. Önceki konteynerler arası şifreli token kalıcılığı kontrolü korunmuştur.

İlk V2 CI denemesinde imaj ve tüm web testleri geçti; Compose kabulünün yeniden başlatma sonrası HTTP isteği eski bağlantıyı yeniden kullandığı için `UND_ERR_SOCKET` ile başarısız oldu. Container'lar sağlık kontrolünde hazırdı. Kabul istemcisinde her istek için bağlantı kapatma ve 15 saniye timeout eklendi; servis/veri/güvenlik kontrolleri kaldırılmadı. Final CI sonucu PR'da ayrıca belirtilir.

Gerçek uygulamada ağsız yeniden değerlendirme düğmesi de çalıştırıldı: kalıcı task **COMPLETED**, `networkResearch:false`; gerçek ilan/araştırma sayısı **14/24** korundu, yeterli kanıta sahip fırsat yine **0**. Analiz motoru mevcut demo kayıtlarını kendi ayrı havuzunda da günceller; gerçek ürün sonuçlarına karıştırmaz.

## Sınırlar / takip işi

- Bu Cloud oturumundan kullanıcının Windows masaüstüne erişim yok. ZIP kurulumunun kullanıcı tarafından başlatılması zorunlu; Windows'a kurulmuş gibi raporlanmaz.
- Üç adaya kadar yan yana karşılaştırma ve kategori/model/hukuki uyumsuzluk uyarıları çalışır. Ayrı model seçici, çift uçlu yıl/km filtreleri ve öncelik filtresi ikincil geliştirmelerdir; mevcut arama model adını da eşler. Veri olmayan araç durumu filtresi üretilmedi.
- Aktarım özel indirme paketiyle yapılır; Cloud ve Windows veritabanları sürekli senkronize değildir.
- Açık makinedeki worker günlük çalışır. Kapalı/uyuyan Windows için sürekli barındırma kurulmadı ve satın alınmadı.
- Eski veya eksik kanıtları yenilemek için izinli araştırma gerekir; veri aktarımı bunları güncel yapmaz.

Kullanım: [Windows V2 güncelleme](WINDOWS_V2_GUNCELLEME.md). Gerçek ekran görüntülerinden önce/sonra karşılaştırması bu konuşmada ayrı, özel HTML dosyasıdır; çalışan uygulamanın yerine sunulmaz.

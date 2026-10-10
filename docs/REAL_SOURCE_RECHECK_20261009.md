# Ağ açıldıktan sonra gerçek ilan kontrolü — 9 Ekim 2026

**Hedefe ulaşılamadı: izinli ve güncel bir ilan kaynağı doğrulanamadı.**
PostgreSQL'e gerçek ilan eklenmedi; gerçek emsal karşılaştırması üretilemedi.
Bu sonuç önceki CONNECT engelinin bütün kaynaklarda sürdüğü anlamına gelmiyor.

Çalışma `feature/m2-email-discovery` üzerinde, `1628153` sonrasında yapıldı.
Main, uygulama kodu, testler, bağımlılıklar ve veritabanı şeması değiştirilmedi.
Sahibinden ve alt alan adlarına istek gönderilmedi. Hesap işlemi, ödeme,
CAPTCHA/erişim engeli aşma veya internetten erişilebilir yayın yapılmadı.

## Somut sonuç

| Pilot                                | Kaynağından doğrulanmış kullanılabilir güncel ilan | PostgreSQL'e eklenen gerçek ilan | Analiz edilen gerçek ilan | Gerçek emsal bağlantısı |
| ------------------------------------ | -------------------------------------------------: | -------------------------------: | ------------------------: | ----------------------: |
| Silivri satılık konut / arsa / tarla |                                                  0 |                                0 |                         0 |                       0 |
| Marmara SUV / Crossover              |                                                  0 |                                0 |                         0 |                       0 |

Veritabanındaki 36 demo korundu ve gerçek sonuçlara sayılmadı. Her iki pilotun
hunisi, fırsat ve yeni ilan sayısı 0; son başarılı gerçek veri alımı yok.
Gerçek kayıtlarla sınırlı analiz girdisi 0 olduğu için analiz edilecek ilan
bulunmadı. Eski 36 demo analizinin başarı kaydı canlı veri başarısı sayılmadı.

## Ağ gerçekten değişti mi?

Evet, bazı hedeflerde. Emlakjet, Arabam, Hepsiemlak, REIDIN, OtoApi, İBB,
Kaggle, Hugging Face, NHTSA, FuelEconomy, MarketCheck, Indicata, J.D. Power,
RapidAPI ve EVDS3 için asıl sunucu yanıtı alındı. Kaydedilen 82 HTTP gözlemi
80 tekil URL'yi kapsıyor: 61 adet 200, altı yönlendirme ve 15 CONNECT reddi.
Bir tanı batch'i tekrar çalıştırılarak dosyaları güncellendi; bu sayılar
bütün araç çağrılarının toplamı değil, saklanan sonuçların sayısıdır.

**Tam internet erişimi mevcut çalışan görevde doğrulanamadı.** Örneğin:

```text
https://www.emlakplatform.com.tr/tr/api-documentation
https://www.agentiz.com/tr/partnership/aggregation
https://docs.carapis.com/markets/turkey
<urlopen error Tunnel connection failed: 403 Forbidden>
```

Aynı hata bağımsız broker adayları `propertyquestturkey.com`,
`silivriemlak.com.tr`, `interestingrealestate.com` ile `apideposu.com`,
`www.postman.com`, `www.google.com`, `developer.nada.com`,
`developers.attomdata.com` ve TÜİK'in yeni `veriportali.tuik.gov.tr`
hedefinde de görüldü. Bu, kaynağın HTTP 403 yanıtı değil; HTTPS tüneli
kurulmadan ortam ağ geçidinin reddidir. Alternatif proxy, ayna veya TLS
doğrulamasını kapatma kullanılmadı. Normal ağ yolu ile sandbox dışında
yapılan tanı da yeni API dokümanı hedeflerindeki reddi değiştirmedi.

Okunabilen ortam **taslağı** revision 11 ve 30 özel hedefli `restricted`
politikası gösterdi. Taslak, kullanıcının yayımladığı aktif yapılandırmanın
kesin kanıtı değildir; yukarıdaki gerçek istekler çalışma zamanı kanıtıdır.
Kullanıcının tam internet yetkisi doğrultusunda `allowed_domains: ["*"]`
kaydedildi. Araç `status=saved`, `requires_publish=true` döndürdü.
Kaydın ardından Emlak Platform ve Agentiz yine CONNECT 403 aldı. Yalnızca
taslak kaydedildi; mevcut göreve uygulandığı veya yayımlandığı iddia edilmedi.
Install/start komutları, paket yönetici preset'leri ve gizli değerler değiştirilmedi.

Araç sonucuna göre ortam ayarlarında bu taslağın kaydedilip yayımlanması ve
çalışan göreve yansıması gerekir. Bu işlem web uygulamasını internete açmak
değildir. Ortam veya uygulama otomatik yayımlanmadı. Tam erişimden sonra da
veri lisansı ve sağlayıcı yetkisi ayrıca doğrulanmalıdır.

## Kaynakların kullanım ve veri kontrolü

| Kaynak                                  | Birincil kanıt                                                                                                                                                                          | Sonuç                                                                                                                                                             |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Emlakjet                                | [Kullanım koşulları](https://www.emlakjet.com/kullanim-kosullari), 6.2: “Emlakjet'in önceden yazılı izni olmaksızın otomatik program, robot, web crawler …” yasak; 8.2 kopyalama kısıtı | Ana sayfa ve koşullar 200. İlan taraması / aktarımı yapılmadı; veri kullanım izni yok                                                                             |
| Arabam                                  | [Bireysel üyelik sözleşmesi](https://www.arabam.com/bireysel-uyelik-sozlesmesi), 6.2: “… derlenmesi, işlenmesi, başka veri tabanlarına aktarılması …” için izin verilmediğini söylüyor  | Ana sayfa ve koşullar 200. İlan taraması / aktarımı yapılmadı                                                                                                     |
| Hepsiemlak                              | [Kullanım koşulları](https://www.hepsiemlak.com/kullanim-kosullari): açık yazılı izin olmadan otomatik izleme/kopyalama kısıtı                                                          | Ana sayfa ve koşullar 200. İlan taraması / aktarımı yapılmadı                                                                                                     |
| OtoApi                                  | [Resmi API dokümanı](https://otoapi.com/api-dokumani): bütün uç noktalarda `X-Api-Key`; [ana sayfa](https://otoapi.com/) token için paket satın alınmasını belirtiyor                   | Türkiye ilan/değerleme API'si var. Mevcut anahtar yok, satın alma yapılmadı. Dokümandaki 150 ilan / Clio fiyatı örnek yanıttır; canlı sorgu sonucu sayılmadı      |
| MarketCheck                             | [Resmi başlangıç dokümanı](https://docs.marketcheck.com/docs/get-started/api/introduction): API anahtarı ve paket; kapsam US, Canada, UK                                                | Türkiye/Marmara kapsamı doğrulanmadı; anahtar yok. İlan sorgusu yapılmadı                                                                                         |
| REIDIN / Indicata                       | Resmi ana sayfalar API/kurumsal veri veya demo/satış süreci gösteriyor                                                                                                                  | Ücretsiz, izinsiz kullanılabilir bir güncel ilan uç noktası doğrulanmadı. REIDIN'in API bağlantısı HTTP 200 ile “can't find” içeriği verdi; çalışan API sayılmadı |
| Endeksa                                 | API/Widget sayfası HTTP 200 ile JavaScript uygulama kabuğu verdi                                                                                                                        | API sözleşmesi, ücretsiz erişim ve güncel ilan yanıtı doğrulanmadı                                                                                                |
| Emlak Platform / Agentiz                | Resmi doküman / XML paylaşım sayfası; bağımsız arama sonuçlarından bulundu                                                                                                              | CONNECT 403; erişim, ücret, lisans ve pilot kapsamı doğrulanamadı. XML ilan **gönderimi**, ilan havuzunu **okuma** yetkisi sayılmadı                              |
| Carapis / üçüncü taraf scraper adayları | Türkiye API adayları arama sonuçlarında bulundu; Carapis dokümanı CONNECT 403                                                                                                           | Platform ilanlarını kullanma izni doğrulanmadı. Scraper çalıştırılmadı, Sahibinden'e dolaylı tarama başlatılmadı                                                  |

Ana sayfanın açılması, teknik olarak çağrılabilen bir endpoint veya bir SDK
lisansı; ilanların başka veritabanında saklanması/analizi için tek başına izin
sayılmadı. Açık bir veri lisansı varsa ayrıca firma görüşmesi şart koşulmadı.

## Açık veri sorguları neden gerçek ilan üretmedi?

**İBB:** [Açık veri lisansı](https://data.ibb.gov.tr/license) atıfla kopyalama,
uyarlama ve uygulamaya eklemeye izin veriyor. Gerçek CKAN sorguları çalıştı:

- `package_search?q=emlak&rows=3`: üç kamulaştırma toplamı veri seti.
- `q=taşınmaz`, `q=ihale`, `q=arsa`: her biri 0 veri seti.
- `q=konut&rows=20`: 10 konut satış adedi, birim fiyat/endeks veya bağlam veri seti.

Bu yanıtlar tekil satılık Silivri ilanının kimliği, URL'si, fiyatı ve
özellikleri değil. Toplu İstanbul birim fiyatı bir konutun gerçek emsali
olarak kullanılmadı. NHTSA/FuelEconomy yanıtları da araç sınıflandırması/yıl
kataloğu; fiyatı ve konumu olan satılık SUV değil.

**Kaggle:** Güncelleme tarihine göre Türkiye emlak, İstanbul konut, Türkiye
araç, Arabam, SUV ve Silivri katalogları sorgulandı. Aşağıdaki adayların
asıl dataset metadata/description yanıtları da kontrol edildi:

| Veri seti                                                                                                                       | Görülen lisans / tarih                       | Veriyi aktarmama nedeni                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [Istanbul Real Estate 2024 Anonymized](https://www.kaggle.com/datasets/beraterolelk/istanbul-real-estate-2024-anonymized)       | CC0; güncelleme 29 Eylül 2026                | Açıklama: “Synthesized and calibrated …”. Yakın güncelleme tarihi gerçek ilan kanıtı değil |
| [Istanbul Real Estate 2020–2026](https://www.kaggle.com/datasets/sergionefedov/istanbul-real-estate-sales-and-rentals-20202026) | Apache 2.0; Mayıs 2026                       | Açıklama, ilan düzeyindeki özelliklerin hedonic modelden üretildiğini belirtiyor. Sentetik |
| [Istanbul Apartment Prices 2026](https://www.kaggle.com/datasets/brahimenesulusoy/istanbul-apartment-prices-2026)               | Yükleyici CC BY-SA 4.0 diyor; 9–14 Mart 2026 | Hepsiemlak scrape verisi; Ekim için eski, asıl ilan kullanım izni doğrulanmamış            |
| [Turkey Used Car Prices April 2026](https://www.kaggle.com/datasets/oguzarar/turkey-used-car-prices-april-2026)                 | Yükleyici CC BY-SA 4.0 diyor; Nisan 2026     | Güncel aktif ilan yanıtı değil; kaynak kimliği/URL'si ve asıl kullanım izni doğrulanmadı   |

Eylül tarihli Ege konut kiraları hedef bölge/işlemle eşleşmedi. Aralık 2025
araç verisi eski; araç taxonomy verisi ilan değil. Türk API kataloğunda
bu pilotlara uygun izinli canlı ilan API'si bulunmadı. Veriler indirme gününün
tarihiyle güncel ilan/emsal olarak etiketlenmedi; SUV/özellikler uydurulmadı.

## Çalışan uygulama ve testler

- `/api/health`, `/api/discovery`, `/api/readiness`: HTTP 200; PostgreSQL bağlı,
  Yeni İlanlar boş, kaynak durumları mevcut gerçek durumu gösteriyor.
- Yetkili feed URL/host/token ve OtoApi/MarketCheck/Emlak Platform anahtar
  değişkenleri mevcut değil. Sadece ad/presence kontrolü yapıldı; sır okunup
  GitHub'a gönderilmedi.
- Gmail `DISCONNECTED`; OAuth kimlik bilgileri yok. Gmail/.eml toplaması
  kullanıcıya bu görevin alternatif veri toplama işi olarak devredilmedi.
- Scheduler süreç bildiriyor: `0 9 * * *`, `Europe/Istanbul`. `lastTickAt`
  ve başarılı gerçek alım yok; Telegram/SMTP kapalı. Canlı otomasyon başarısı yok.
- **72 birim + 41 ayrı PostgreSQL entegrasyon testi = 113 test bu turda geçti.**
  Kod değişmediği için tarayıcı/build/lint süitleri tekrar çalıştırılmadı.
  Önceki commit'in 131 testli CI sonucu yeni canlı kabul testi sayılmadı.

Tüm URL/zaman/status/response hash'leri, kaynak kararları, ayrılmış gerçek/demo
sayıları ve test sonuçları [kanıt dosyasında](research/20261009-network-recheck-evidence.json).
Ham genel doküman yanıtları ignored `.local/research/` altında; özel e-posta,
hesap içeriği ve kimlik bilgisi rapora alınmadı.

## Kalan engel

Mevcut uygulama içe aktarma, kimlik, tarihçe ve analiz akışı çalışıyor; eksik
olan **fiyatı, konumu, kaynak URL/ID'si ve güncelliği doğrulanmış izinli ilan
girdisi**. Erişilen platformlar veri aktarımını kısıtlıyor, erişilen ticari
API'ler anahtar/paket istiyor; yeni bağımsız adayların bir kısmı ortam ağında
engelleniyor. Bu oturum için çalışan bir ücretsiz kaynak doğrulanamadı.
Bu bulgu dünyada böyle bir kaynak bulunmadığı iddiası değildir.

Firma bulma, e-posta gönderme, satın alma veya manuel ilan toplama kullanıcıya
devredilmedi. Ücretli işlem, veri uydurma, yetkisiz tarama veya erişim engelini
aşma yapılmadan bu ön koşullar bu görevde tamamlanamadı. Doğrulanmamış boş
bir adapter ekleyip kaynağı bağlı göstermek yerine gerçek sayılar 0 korundu.

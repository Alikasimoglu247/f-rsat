# Gerçek ilan kaynağı araştırması — 9 Ekim 2026

> Bu belge ilk ağ engelli araştırmanın tarihsel kaydıdır. Sonraki kontrolde
> ana kaynaklar erişilebilir oldu; bazı yeni hedeflerde CONNECT 403 sürüyor.
> Güncel izin/veri/test sonuçları: [Ağ sonrası yeniden kontrol](REAL_SOURCE_RECHECK_20261009.md).

**Durum: engelli; çalışan canlı ilan entegrasyonu tamamlanmadı.**

`feature/m2-email-discovery` üzerinde M2.2 `5406786` sonrasındaki araştırma.
Main'e merge, ortam yayını, internetten erişilebilir sunucu veya satın alma yapılmadı.
Sahibinden'e hiçbir istek gönderilmedi. Hesaplı sitelerde oturum açılmadı; CAPTCHA,
site veya ağ erişim kısıtları aşılmadı.

## Ölçülen sonuç

| Ölçüm | Sonuç |
|---|---:|
| Araştırılan servis/katalog adayı | 19 |
| İncelenen açık kaynak depo adayı | 10 |
| Toplam aday | 29 |
| Gerçek HTTP denemesi | 66 |
| Tekil URL | 65 |
| Kaynağa ulaşıp HTTP 200 dönen istek | 40 |
| Kaynağa ulaşıp HTTP 404 dönen istek | 4 |
| Ortamın CONNECT ağ geçidinde engellenen istek | 22 |
| Açık veri sorgusu denemesi | 5 |
| Sağlayıcıya ulaşan açık veri sorgusu | 0 |
| İndirilen araç katalog paketi | 1 |
| Kullanılabilir aktif ilan yanıtı | 0 |
| PostgreSQL'e eklenen gerçek ilan | 0 |
| Gerçek ilan için yapılan emsal analizi | 0 |

40 adet HTTP 200; GitHub/npm arama, paket, depo ve doküman yanıtları ile
bir katalog arşivini kapsar. İlan API başarısı anlamına gelmez. Beş veri sorgusu
İBB CKAN paket araması, Kaggle veri seti araması, Hugging Face veri seti araması,
NHTSA araç tipi sorgusu ve FuelEconomy yıl listesidir. Bunlar ilan veya fiyat
verisi döndürdü diye işaretlenmedi.

Tüm URL'ler, sorgu zamanları, hata katmanı, katalog örnekleri ve PostgreSQL
kontrolü [makine tarafından okunabilir kanıt dosyasında](research/20261009-source-evidence.json).
Zamanlar UTC olarak saklandı; çalışma 9 Ekim 2026 İstanbul saatinde yapıldı.
Emlakjet'e ağ taslağı kaydından sonra yapılan tek tekrar denemesi ayrı kayıttır.
Asıl sağlayıcıdan gelen bir 403 ile ortamın CONNECT reddi birbirinden ayrılmıştır.

## Servisler ve veri portalları

| Kaynak | API/veri erişimi | Kullanım izni | Gerçek kayıt | Entegrasyon |
|---|---|---|---|---|
| Emlakjet | Ana sayfa araştırma isteği CONNECT 403; içerik alınamadı | İlan saklama/analiz ve fiyatlandırma doğrulanamadı | 0 ilan | Eklenmedi |
| Hepsiemlak | Ana sayfa CONNECT 403 | Doğrulanamadı | 0 ilan | Eklenmedi |
| Arabam | Ana sayfa CONNECT 403; hesap işlemi yok | Doğrulanamadı | 0 ilan | Eklenmedi |
| REIDIN | Site CONNECT 403 | Veri erişimi, ücret ve lisans doğrulanamadı | 0 ilan/endeks | Eklenmedi |
| NADA/J.D. Power adayları | Geliştirici ve değerleme sayfası CONNECT 403 | Lisans/ücret ve Türkiye kapsamı doğrulanamadı | 0 ilan/değerleme | Eklenmedi |
| OtoApi domain adayı | `otoapi.com` CONNECT 403; resmi servis kimliği doğrulanamadı | Doğrulanamadı | 0 ilan | Eklenmedi |
| İBB açık veri | CKAN `package_search?q=emlak&rows=3` ve alternatif portal CONNECT 403 | Belirli veri seti/lisans doğrulanamadı | 0 ilan/veri seti yanıtı | Eklenmedi |
| Kaggle | Veri seti arama endpointi CONNECT 403 | Veri seti bazındaki izin doğrulanamadı | 0 ilan/veri seti yanıtı | Eklenmedi |
| Hugging Face | Açık veri seti katalog sorgusu CONNECT 403 | Veri seti bazındaki izin doğrulanamadı | 0 ilan/veri seti yanıtı | Eklenmedi |
| TÜİK | Veri portalı CONNECT 403 | Seçili veri serisi ve kullanım koşulları doğrulanamadı | 0 ilan/istatistik | Eklenmedi |
| TCMB EVDS | Portal CONNECT 403 | Seri erişimi/anahtar/koşullar bu oturumda doğrulanamadı | 0 ilan/endeks | Eklenmedi |
| NHTSA vPIC | `GetVehicleTypesForMake/toyota?format=json` CONNECT 403 | Asıl servis koşullarına ulaşılamadı | 0 doğrudan API kaydı | Eklenmedi |
| FuelEconomy | XML yıl-listesi endpointi CONNECT 403 | Asıl servis koşullarına ulaşılamadı | 0 doğrudan API kaydı | Eklenmedi |
| Endeksa | Site CONNECT 403 | İlan/değerleme erişimi, ücret ve izin doğrulanamadı | 0 ilan/değerleme | Eklenmedi |
| Indicata | Site CONNECT 403 | Veri erişimi, ücret ve saklama izni doğrulanamadı | 0 ilan | Eklenmedi |
| MarketCheck | Doküman sitesi CONNECT 403; npm istemci ve yayımlanmış PHP SDK dokümanı 200 | İstemci MIT; ilan verisinin kullanım lisansı ayrıca gerekir. API anahtarı zorunlu | 0 ilan | Türkiye kapsamı doğrulanmadı; bağlanmadı |
| RapidAPI | Arama sayfası CONNECT 403 | Listeleme ve sağlayıcıya ait veri hakkı doğrulanamadı | 0 ilan | Eklenmedi |
| ATTOM | Geliştirici dokümanı CONNECT 403 | Erişim, ülke kapsamı, ücret ve veri lisansı doğrulanamadı | 0 ilan | Eklenmedi |
| MeterApp vehicle-db | npm metadata ve 2.14.0 katalog arşivi 200; SHA-512 bütünlüğü doğrulandı | Paket ISC; alt kaynak lisansları yayıncının beyanı, asıl siteler bağımsız doğrulanamadı | 5 saklanan marka/model katalog örneği; **0 ilan** | İlan adapteri yapılmadı |

Bu tablo ücretsiz bir Türkiye ilan API'sinin dünyada bulunmadığını kanıtlamaz.
Bu ortamdan erişilebilen kaynaklar arasında yeterli izin, güncellik, aktif ilan
kimliği/URL'si, TL fiyatı ve pilot konumu birlikte doğrulanamadı.

## GitHub adaylarının teknik incelemesi

Depo lisansı, başka bir platformdan toplanmış ilan verisinin kullanım hakkını
kendiliğinden doğrulamaz. Yayımlanmış açık kaynak kodlar çalıştırılmadı; örnek
scraper veya sandbox sunucuları canlı kaynak olarak kullanılmadı.

| Aday | Erişim ve doğrulanan bulgu | Lisans/ilan hakkı | Sonuç |
|---|---|---|---|
| [gencelo/jetagent](https://github.com/gencelo/jetagent) | README 200: Emlakjet işe alım çalışması; yerel Java/Elasticsearch API | Kod LGPL-3.0; canlı ilan hakkı doğrulanmadı | Resmi canlı Emlakjet API sayılmadı |
| [hakantulgac/arabam_api](https://github.com/hakantulgac/arabam_api) | README 200: yalnızca yerel sunucu çalıştırma talimatı | Lisans ve canlı veri izni doğrulanmadı | Kullanılmadı |
| [eminfidan/arabamcom-clone-app](https://github.com/eminfidan/arabamcom-clone-app) | README 200: açıkça dummy API kullanan clone | Lisans/gerçek ilan hakkı doğrulanmadı | Demo yanıtı canlı ilan sayılmadı |
| [gmaxsoft/PHP_OTOAPI](https://github.com/gmaxsoft/PHP_OTOAPI) | README 200: Otodom/OLX Partner API; client ID/secret, API key ve OAuth code gerekir | SDK MIT; ilan verisi için partner yetkisi gerekir | Türkiye OtoApi servisiyle karıştırılmadı |
| [Kubrakara/OtoApi](https://github.com/Kubrakara/OtoApi) | README 404; tree ve `main.py` 200: Swagger/API test aracı | İlan lisansı doğrulanmadı | Otomobil ilan servisi değil |
| [yigitguleryuz/2020-Turkey-Car-Prices-Prediction](https://github.com/yigitguleryuz/2020-Turkey-Car-Prices-Prediction) | README 200: 2020 araç fiyatlarıyla ML | Veri hakkı doğrulanmadı | 2026 aktif ilan/emsal olarak aktarılmadı |
| [fatihberber20/turkey_car_price_randomforest](https://github.com/fatihberber20/turkey_car_price_randomforest) | README ve license 200: araç fiyatı ML projesi | Kod MIT; özgün ilan hakkı/güncelliği doğrulanmadı | Aktif ilan kaynağı sayılmadı |
| [Ademkck/Turkey-Car-Market---Prediction-Prices-and-EDA](https://github.com/Ademkck/Turkey-Car-Market---Prediction-Prices-and-EDA) | README 200: ilan tarihi 2020 olan veri seti | Veri hakkı doğrulanmadı | Güncel emsal/ilan sayılmadı |
| [khaled-t7s/housing-price-classification-id3](https://github.com/khaled-t7s/housing-price-classification-id3) | README ve license 200: çoğunlukla Sakarya'da 1.161 eğitim kaydı | Kod MIT; özgün ilan hakkı/güncelliği doğrulanmadı | Silivri aktif ilan kaynağı sayılmadı |
| [Abmn0/emlak_dataset](https://github.com/Abmn0/emlak_dataset) | Arama metadata 200, README 404 | Açık veri kullanım lisansı doğrulanmadı | Veri indirilmedi/aktarılmadı |

MarketCheck'in npm istemcisi ABD/Kanada ve İngiltere araç aramaları tanımlıyor.
Yayımlanmış [PHP SDK](https://github.com/MarketcheckCarsInc/marketcheck-api-sdk-php)
ABD envanterini tanımlıyor ve tüm çağrılarda API anahtarı zorunlu diyor.
Swagger üretimi genel "authorization yok" bölümü bu anahtar gereksinimini
kaldırmaz. Anahtar uydurulmadı, ücretli hesap veya çağrı yapılmadı.

## İndirilen veri neden ilan olarak kullanılmadı?

`@meterapp/vehicle-db@2.14.0` paketinin kayıtlı npm `dist.integrity` SHA-512
değeri indirilen arşivle eşleşti. JavaScript çalıştırılmadan katalogdaki JSON
verisi ayrıştırıldı. Kaynak ve sorgu zamanı kanıt JSON'unda saklandı.

Örnek kayıtların fiyatı, ilan konumu ve ilan URL'si yok. Katalogdaki bir modelin
bulunması o araç için satılık ilan veya Türkiye'ye ait gövde/donanım kanıtı
değildir. Paket yayıncısının yıl ve kaynak beyanları bağımsız araç doğrulaması
yerine geçmez. SUV onayı, fiyat skoru veya piyasa emsali üretilmedi.

İlanları olmayan bölgesel endeksler de tek başına ilan keşfi veya araç/property
özelliklerine göre emsal karşılaştırmasını sağlayamaz. TÜİK/TCMB verisi bu
oturumda dönmediği için çalışır bir piyasa karşılaştırması var denmedi.

## Çalışan uygulama kontrolü

- PostgreSQL'de 36 DEMO ve 0 gerçek ilan korundu. Araştırma kayıtları üretim
  `Listing` tablosuna eklenmedi.
- İki pilotun gerçek ilan, yeterli emsal ve fırsat sayısı 0; gerçek bildirim
  alımı yok. `/api/discovery` boş gerçek sonuç gösteriyor.
- Yerel günlük analiz mevcut 36 demo üzerinde çalıştı; dış veri toplanmadı ve
  harici teslimat yapılmadı. Aynı girdilerle tekrar `ALREADY_COMPLETED` oldu.
- Günlük raporda otomatik Gmail alımının doğrulanmadığı açıkça yazıyor ve
  gerçek fırsat ID listesi boş. Demo işlenmesi başarı kriterine sayılmadı.
- Gmail DISCONNECTED. Telegram/SMTP kapalı. 09.00 Europe/Istanbul scheduler
  süreç durum bildiriyor; gerçek sabah veri alımı doğrulanmış değil.
- Uygulama kodu, veri modeli, bağımlılık ve lockfile değiştirilmedi. Yeni veya
  varsayımsal bir provider adapteri canlı bağlı olarak kaydedilmedi.
- Bu turda mevcut 72 birim ve 41 ayrı PostgreSQL entegrasyon testi geçti.
  İzole Chromium'da iki pilotun boş durumu ve Yeni İlanlar ekranı kontrol
  edildi; dış sayfa navigasyonu engellendi. Bu kontroller gerçek sağlayıcı
  izni veya ilan alımı doğrulaması değildir.

## Ağ engeli ve devam koşulu

İzin taslağı mevcut alan adları korunarak araştırma hedefleriyle genişletildi.
Araç `status=saved`, `requires_publish=true` döndürdü. Taslak kaydı çalışan
ortamın ağ izinlerini uygulamadı; Emlakjet kontrolü yine CONNECT 403 oldu.
Ortam veya web uygulaması otomatik yayınlanmadı.

Taslakta eklenen araştırma alan adları:

`www.emlakjet.com`, `www.hepsiemlak.com`, `www.arabam.com`, `www.reidin.com`,
`developer.nada.com`, `www.jdpower.com`, `otoapi.com`, `www.otoapi.com`,
`data.ibb.gov.tr`, `data.ibb.istanbul`, `www.bing.com`, `www.kaggle.com`,
`huggingface.co`, `datasets-server.huggingface.co`, `data.tuik.gov.tr`,
`evds2.tcmb.gov.tr`, `evds3.tcmb.gov.tr`, `vpic.nhtsa.dot.gov`,
`www.fueleconomy.gov`, `www.endeksa.com`, `www.indicata.com`,
`api.marketcheck.com`, `docs.marketcheck.com`, `rapidapi.com`,
`developers.attomdata.com`.

İlk devam koşulu bu araştırma hedeflerine izin veren aktif ortam ağıdır.
Platformda ortam ayarları taslağını inceleme/kaydetme ve gerekiyorsa ortam
Review/Publish adımı gerekir; bu, web uygulamasını internete açmakla aynı
işlem değildir ve burada yapılmadı. Firma arama, e-posta gönderme veya satın
alma kullanıcıya devredilmedi.

Ağ erişimi sağlandığında önce resmi doküman, veri lisansı ve küçük veri
sorgusu doğrulanmalıdır. Yalnızca güncel, kaynak kimliği/URL'si, fiyatı ve
pilot konumu olan izinli kayıtlar adapter → importRecords → kimlik/tarihçe
→ analiz → rapor akışına alınmalıdır. Eski/izin belirsiz veriler aktif ilan
olarak aktarılmamalı; emsal eksikse fırsat puanı verilmemelidir.

# FırsatRadar — gece görevinin teslim ve kabul kaydı

Tarih: **10 Ekim 2026**, saatler Europe/Istanbul.
Dal: `feature/m2-email-discovery`; inceleme: [PR #1](https://github.com/Alikasimoglu247/f-rsat/pull/1).
Başlangıç HEAD: `8fa550d`; önceki devam kaydı: `074af6f`.

**Sonuç:** 9 gayrimenkul kaydı korundu, **5 gerçek Marmara SUV ilanı** eklendi.
14 gerçek ilan fiyat motorunda değerlendiriliyor. Fiyatı açıklanmayan tarihsel
villa ile birlikte ekranda 15 gerekçeli değerlendirme var.
**Yeterli emsalle desteklenen yatırım fırsatı 0**; bu veri kabul koşulu karşılanmadı.

Gece boyunca kesintisiz geliştirme yapıldığı iddia edilmiyor. Başlangıç kaydı
02.45'te alındı; bu teslimattaki geliştirme/araştırma “şimdi bitir” mesajıyla
yaklaşık **11.24'te** sürdürüldü. Saat 09.00'da başlayan eski iş kesilmişti.
Aşağıdakiler bugün gerçekten yapılan işlerdir; önceki özellikler yeni iş sayılmaz.

## 1. Başlangıç → son durum

| Ölçüm | Başlangıç | Son kabul |
| --- | ---: | ---: |
| Fiyatlı gerçek gayrimenkul | 9 | 9 |
| Gerçek Marmara SUV | 0 | 5 |
| Gerçek fiyat gözlemi | 9 | 14 |
| Ayrı demo kayıtları | 36 | 36 |
| Yeterli emsal / incelemeye değer fırsat | 0 / 0 | 0 / 0 |

Son sayım 12.12'de PostgreSQL'den alındı. Gayrimenkulün **sekizi** yeniden
okunabildi. Akgün kaydı ve geçmişi korundu; alanları tekrar doğrulanamadığından
güncel değerleme kanıtı değildir.

## 2. Araştırılan bölgeler ve segmentler

Değirmenköy 200–400 m² arsa/tarla; Selimpaşa 2+1 daire; merkezde Yeni,
Alibey, Mimarsinan, Cumhuriyet 2+1 ve ayrı 3+1 daire; Ortaköy, Gümüşyaka,
Çanta arazi; Marmara'nın 11 ilinde SUV/Crossover kapsamı araştırıldı.
Mahalleler, arsa/tarla, imar ve hisse sınıfları karıştırılmadı. Elde edilen
**beş SUV yalnızca İstanbul'dandır**; kapsamın 11 il olması 11 ilde veri
bulunduğu anlamına gelmez. İzmir/Ankara araçları ve sedanlar dışlandı.

## 3. Strateji değişikliği ve hafıza

Değirmenköy'de hukuki kanıt tamamlanamayınca Selimpaşa, merkez konutları ve
diğer segmentlere geçildi. Gerekçe, güncel/uygun/mükerrer aday sayıları ve
eksikler `ResearchRun.summary.strategy` içinde kalıcıdır. Boş/hatalı segment
6–24 saat, yeni aday bulunan segment bir saat bekler. Tümü beklerken
`--rounds 6` ilk turda DEFERRED döndü; yeni HTTP isteği veya run oluşmadı.

Uygun turlarda kataloglar yeniden okunur ve yeni yayımlanan URL'ler keşfedilir.
Bilinen araçları yenilemeye ve yeni keşfe ayrı bütçe ayrılır. Her tur en fazla
50 istek / 3 dakika / yanıt başına 1,5 MB; CLI en fazla altı turdur.
Yeni alan adı, erişim engeli veya robots yasağı kendiliğinden izinli yapılmaz.
Bu sistem sınırsız internet arama servisi değildir.

## 4. Yeni gerçek kaynak ve fiyatlar

Otomol'un açık sayfasında ilan kimliği, seçili fiyat ve yayımlanan JSON
birbirine bağlandı. **Kasa Tipi** alanı SUV'u doğrular; model adı yeterli değildir.
Konum şube adresi beyanıdır; aracın fiziksel bulunduğu yer bağımsız teyit edilmedi.

| Kaynak ilan | Yıl / km | İstenen fiyat | Şube ilçesi |
| --- | --- | ---: | --- |
| [Volvo EX40 Ultra](https://www.otomol.com/volvo-ex40-extended-range-ultra-2026-ikinci-el-araba-9458) | 2026 / 8.841 | 3.300.000 TL | Bakırköy |
| [Mercedes GLB 200 AMG+](https://www.otomol.com/mercedes-glb-serisi-glb-200-amg-4matic-2023-ikinci-el-araba-9242) | 2023 / 58.110 | 3.460.000 TL | Bakırköy |
| [Audi Q3 S Line](https://www.otomol.com/audi-q3-35-tfsi-s-line-2024-ikinci-el-araba-9388) | 2024 / 25.418 | 3.500.000 TL | Ataşehir |
| [Subaru Forester Xclusive](https://www.otomol.com/subaru-forester-20i-e-boxer-xclusive-2024-ikinci-el-araba-9268) | 2024 / 12.605 | 3.530.000 TL | Ataşehir |
| [BMW X3 X Line](https://www.otomol.com/bmw-x3-20i-sdrive-x-line-otomatik-2022-ikinci-el-araba-9271) | 2022 / 54.933 | 3.630.000 TL | Ataşehir |

İlk içe aktarım 11.56; beşinin tam tekrar kontrolü 12.11. Yayın tarihi yok.
Erişilebilir sayfa/InStock satış mevcudiyeti veya gerçekleşmiş satış değildir.
Ekspertiz renkleri yorumlanıp “hasarsız” yazılmadı. Batarya sağlık/garanti,
hasar, masraflar ve bağımsız kondisyon bilinmiyor.

## 5. Fiyat değişimi

**Gerçek fiyat değişimi ve son 7 gün indirimi 0.** Son tam tekrarda 5 SUV
aynı kimlik/fiyatla bulundu; 14 ilan / 14 gözlem korundu, yeni fiyat olayı yok.
Fiyat değişimi testleri ayrı sentetik veritabanındadır; piyasa indirimi sayılmaz.

## 6. Mükerrerler

344/95, 365 m² / 500.000 TL beyan eden iki GençCity ilanı ayrı URL, kimlik
ve geçmişle korunuyor; tek PENDING parsel incelemesi var, bağımsız iki emsal
sayılmaz. Benzer araçlar birleşmez. Değişmeyen parsel incelemesinde eksik
mesajını iki kez ekleyip sahte karar revizyonu oluşturan hata düzeltildi.
Regresyonda ve son canlı tekrarda değişmeyen karar revizyonu 0.

## 7. Emsal yeterliliği

Silivri'de tapu/imar/yol/sınıf/mevcudiyet kanıtları birlikte tamamlanan beş
bağımsız benzer emsal yok. Beş SUV **beş farklı modeldir**; hasar ve mevcudiyet
de eksik. Herhangi bir modele beş emsal oluşturmazlar. Eşik düşürülmedi,
fiyat avantajı veya fırsat puanı üretilmedi.

## 8. Karar dağılımı

Silivri **3 Riskli / 7 Yetersiz veri**, SUV **5 Yetersiz veri**.
Başlangıç Silivri 4/6 idi. Akgün'ün eski risk beyanı yeniden doğrulanamayınca
güncel karardan çıktı. “Yetersiz veri”ye geçiş yatırımın iyileştiği anlamına gelmez.

## 9. Somut yatırım değerlendirmesi

[GençCity 344/91 adayı](https://www.genccity.com/satilik-arsa/silivri-degirmenkoyde-300-metre-parsel-tamami-440-bin-tl/049048057054):
300 m² / 440.000 TL, yaklaşık **1.466,67 TL/m²**. Bu bölme piyasa değerlemesi
veya iskonto değildir. 365 m² / 500.000 TL beyanı yaklaşık 1.369,86 TL/m²
olsa da mükerrer parsel ve belgesiz imar/hisse/yol nedeniyle fiyat emsali değildir.
“Parselin tamamı” ayrı müstakil tapu kanıtı değildir; eski yayın tarihi bugünkü
gözlemden ayrıdır. Kesintisiz satış süresi, talep ve gelir bilinmiyor.
**Sonuç: Yetersiz veri.** Diğer adaylar kesin daha iyi yatırım diye sıralanmaz.

Volvo EX40'ın 2026 / 8.841 km beyanı ilk kullanım elemesine yardımcı olur.
Düşük kilometre batarya sağlık kanıtı değildir. Aynı donanım/yıl/km emsalleri,
hasar/servis/garanti ve masraflar olmadan 3,3 milyon TL'nin avantajı bilinmez.
Ekrandaki sonuç **Yetersiz veri**, kaynak ve eksikler açıkça gösterilir.

## 10. Ekonomi ve gelişmelerin etkisi

[TCMB](https://www.tcmb.gov.tr/) 10 Eylül politika faizi %37; gerçek mevduat
veya kredi teklifi değildir. [Yayımlanan TÜFE tablosu](https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Istatistikler/Enflasyon+Verileri)
Eylül %29,73, Ağustos %31,51 yıllık değişim içeriyor.
[Konut Fiyat Endeksi](https://www.tcmb.gov.tr/wps/wcm/connect/TR/TCMB+TR/Main+Menu/Istatistikler/Reel+Sektor+Istatistikleri/Konut+Fiyat+Endeksi/)
Ağustos İstanbul nominal %26,3; **aynı Ağustos TÜFE** ile yaklaşık -%3,96 reel
değişim. İstanbul konut göstergesi Silivri mahalle/arsa fiyatı yerine geçmez.

Ulaşım duyurusundan parselin istasyona erişimi veya tamamlanmış hizmet/değer
artışı varsayılmadı. Eski belediye/AFAD alanları güncel tapu/imar/zemin belgesi
sayılmadı. Kira, gerçek talep, likidite ve net alternatif getiri uydurulmadı.
[Togg finansmanında](https://www.togg.com.tr/sales-and-finance) sekiz T10X koşulu
ayrıştırıldı: örneğin 800.000 TL / 6 ay / aylık %0 **kredidir, araç fiyatı değil**.
Bireysel/filo uygunluğu, banka onayı, nakit fiyat ve masraflar teyitsiz olduğundan
“daha iyi alım” sonucu çıkarılmadı; diğer modellere emsal yapılmadı.

## 11. Gerçek turlar

Bugünkü yeni iş **7 manuel + 2 gerçek node-cron probu**. Toplam 17 run:
önceki yedi çalışma + kesilen günlük iş + bugünkü dokuz tur.

| İş | Run kimliği | Sonuç |
| --- | --- | --- |
| 09.00 günlük iş | `cmv1ziyow0000tcpww6njh27e` | Başladı, kesildi; FAILED |
| Selimpaşa | `cmv259hvu0000rppwbzlivo8q` | PARTIAL, yeni ilan 0 |
| Merkez 2+1 | `cmv25ehxh0000wppwpmdl3lep` | FAILED, katalogda alan yok |
| İlk gerçek SUV alımı | `cmv25tx3s0000rypwdofwdvvr` | PARTIAL, yeni gerçek ilan 5 |
| Son tam tekrar/prob | `cmv26cqpt0000rppwhclg2cy2` | COMPLETED, 0 fiyat/karar değişimi |

Boş ama gerçekten okunan katalog gelecek turlarda PARTIAL raporlanır;
eski FAILED kayıt değiştirilmedi. Kabul problarında SUV açıkça seçildi;
robots/erişim engelleri kaldırılmadı. Sonraki normal çağrı DEFERRED oldu.

## 12. Testler, CI ve kullanılabilir önizleme

**130 birim + 61 PostgreSQL + 23 tarayıcı = 214 test geçti**.
Build, lint, TypeScript başarılı. Ayrı `_test`/`_e2e` kullanıldı; gerçek DB
sıfırlanmadı. Yeni regresyonlar hafıza/bekleme/no-network, worker kilidi, kaynak
izni, JSON'un çalıştırılmaması, fiyat/ID/konum çelişkisi, yenileme-keşif dengesi,
elektrik yakıt adları, yalnızca eksik alanları gösterme, yayıncının farklı
ilçe/kategori kapsamını koruma ve değişmeyen kararları kapsar.

Docker Hub kotasına karşı önceki resmî ECR imajları/aynı sabit digestler
korundu. Yeni çözüm diye sayılmadı; CI test/build/token kalıcılık kontrolleri
kaldırılmadı. Yeni HEAD'in sonucu PR üzerinde takip edilir; eski yeşil CI
yeni commit'e başarı kanıtı değildir.

Mevcut uygulama gerçek PostgreSQL ile özel loopback sunucuda açıldı.
Silivri ve SUV masaüstü/mobil kontrolünde hata/taşma 0.
`.local/overnight/FIRSATRADAR_ONIZLEME.html` iki pilotun kaynak bağlantılı,
**çevrimdışı anlık görüntüsüdür**; araştırma başlatmaz/güncellenmez.
Bu oturumda istemci port-önizleme aracı yok; Cloud localhost kullanıcının
Windows localhost'u değildir. Uygulama internete açılmadı.

## 13. Fiilen çalışan otomasyon ve kalıcılık

Supervisor start/stop ve gerçek worker SIGKILL'inden **2 saniye sonra yeni
PID/heartbeat** doğrulandı. İkinci worker kilit nedeniyle 73 ile çıktı.
Son durumda araştırma worker'ı RUNNING, her gün **09.00 Europe/Istanbul**;
sonraki plan **11 Ekim 2026 09.00**. Bu gelecek başarı iddiası değildir.
Bugünkü 09.00 FAILED; başarılı tetikleme **SCHEDULED_PROBE**.

Günlük iş en fazla altı uygun segmenti sırayla işler; bir segment hatası diğer
segmentlere geçişi durdurmaz. Yalnızca bir segment/gün ile SUV'un haftalarca
eskimesi önlendi. Altı turluk günlük işin yarın tamamlanacağı iddia edilmedi;
durma, hata aktarımı ve tur sınırı testlerde doğrulandı.

En basit ücretsiz kalıcı seçenek: sürekli açık kullanıcı makinesi, mevcut
kalıcı PostgreSQL ve hizmet yöneticisi altında tek worker. Linux süreç
yardımcısı Cloud'da çalışıyor; Windows hizmeti kurulmadı. Cloud kapanınca
supervisor da durabilir; 24/7 barındırma doğrulanmadı.

**06.15 Thread Automation oluşturulmadı.** Aynı konuşmayı belirli saatte
yeniden başlatacak araç bu oturumda yok; cron eşdeğer değildir. İstenen
10 Ekim 2026 06.15 = 03.15 UTC için otomasyon/konuşma bağlantı kimliği yok.

## 14. Somut engeller ve kalan kabul koşulu

Turyap açık Silivri ofis/ilçe aramasında gösterilen fiyatlı eşleşme yoktu;
tüm piyasada ilan yok denmedi. GençCity daire kategorisi kullanılabilir kayıt
vermedi. Silivri Gayrimenkul portföy linki Sahibinden'di: izlenmedi.
Selimpaşa kaynağı park sayfası, Aktif Emlak Edremit portföyüydü; Silivri emsali
sayılmadı. Silivri Emlak Merkezi CONNECT 403: durduruldu. Halkbank portföyü
React kabuğu, Ziraat portföyü 404; Kuveyt Türk portföy robots `Disallow: /`:
içerik alınmadı. Gizli API veya engel aşma kullanılmadı.

Otokoç robot/scraping yasağı; İkinciyeni/OtoShops izinsiz işleme/depolama
kısıtı nedeniyle içe aktarılmadı. DOD şart metni doğrulanamadı; Borusan boş
yanıt verdi. Bu gözlemler kaynak hafızasında tutuluyor.
Otomol robots/bağlantılı politikalar kontrol edilerek küçük olgusal kişisel
araştırma yapıldı; toplu yeniden kullanım/yayım lisansı iddia edilmedi.
Ham HTML, fotoğraf, iletişim, kişisel veri ve kimlik bilgileri GitHub'a yüklenmedi.

**Main merge, canlı yayın, ücretli işlem, Gmail veya Sahibinden otomatik
isteği yok.** Teknik döngü çalışıyor; Silivri için beş uygun emsal, belge teyidi
ve doğrulanmış fiyat avantajı henüz olmadığından bütün piyasa başarı koşulları
karşılandı denmiyor.

# Tekrarlanabilir yatırım araştırması — canlı çalışma kanıtı

10 Ekim 2026, Europe/Istanbul. Çalışma dalı `feature/m2-email-discovery`;
main birleştirilmedi ve uygulama yayımlanmadı.

## Ne değişti?

Önceki `scripts/import-research.ts` ağ erişmeden tarihli JSON'u içe aktarıyordu.
Yeni `npm run research` her çağrıda gerçekten ağ araştırması yapar. Eski JSON
yalnızca başlangıç URL envanteri ve hiç çalışma yoksa tarihsel ekran verisidir;
gözlem zamanı değiştirilerek güncel veri üretilmez. Sonuçlar `ResearchRun` ve
`ResearchResource` tablolarında kalıcıdır. Yatırım Analizi mevcut ekranı bu
çalışmaların kanıtlarını, gerekçelerini ve kaynak kontrollerini okur.

Dar keşif alanı Değirmenköy'de yaklaşık 200–400 m² satılık arsa/tarladır.
Önceki 3.653 m² aday ve fiyatı açıklanmamış villa, tarihsel kapsamdan silinmez;
bu dar segmentin fiyat emsali yapılmaz.

Her çalışma resmî TCMB duyurularını/endekslerini ve ulaşım açıklamalarını,
önceki ilan sayfalarını ve kamuya açık ilk el kataloğun yeni bağlantılarını
araştırır. Yeni aday bütçesi varsayılan iki sayfa; toplam ağ isteği üst sınırı
50'dir. İzinli olmayan yeni alan adları ziyaret edilmeden incelemeye kaydedilir.
Bu, sınırsız web tarayıcısı veya ticari veri akışı lisansı değildir.

Robots yönergeleri ve bağlantılı kullanım koşulları kontrol edilir. Sahibinden,
Arabam, Emlakjet, Hepsiemlak ve RE/MAX otomatik araştırma kapsamı dışında tutulur.
Yönlendirmeler ayrı erişim kontrolü gerektirdiği için izlenmez. CAPTCHA,
401/403/429, robots yasağı veya kullanım kısıtında ilgili kaynakta işlem durur;
bu durum sonraki çalışmalara taşınır. Proxy ve TLS doğrulaması korunur.
Posta, ücretli model, hesap girişi veya dış rapor gönderimi yapılmaz.

## Gerçek çalıştırmalar

Aşağıdaki sayılar geliştirme PostgreSQL'inden okundu. Tam başlangıç/bitiş,
URL, yanıt özeti, SHA-256, ayrıştırma sonucu ve karar farkları veritabanında
saklanır; kaynak sayfaların tamamı, fotoğraflar veya iletişim bilgileri Git'e
kopyalanmadı. Test kayıtları ayrı `_test`/`_e2e` veritabanlarındadır.

| Çalışma | İstanbul saati | Alınan yanıt özeti | Yeni DB ilanı | Aynı fiyat tekrarları | Fiyat değişimi | Karar gerekçesi güncellemesi |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `cmv1htpov00005opwmdpklggh` — manuel | 00:44:28–00:45:26 | 20 | 2 | 4 | 0 | 0 |
| `cmv1itz6y0000jjpwgtf0w9jk` — ikinci manuel | 01:12:40–01:13:24 | 22 | 2 | 6 | 0 | 4 |
| `cmv1ivpdq0000rtpwjsaor2h3` — gerçek cron probu | 01:14:01–01:14:59 | 22 | 1 | 8 | 0 | 4 |
| `cmv1j082r0000mtpwrzr10m8g` — parsel çapraz kontrolü | 01:17:31–01:18:17 | 23 | 0 | 9 | 0 | 3 |

İkinci çalışmada yeniden HTTP alımı gerçekleşti, iki yeni kaynak adayı kaydedildi
ve önceki altı fiyatın değişmediği görüldü. Aynı mahalle/tür ve yaklaşık alan
grubuna yeni adaylar katılınca dört önceki adayın alternatif gerekçesi değişti.
Bu adayların imar/tapu/yol kanıtı yeterli olmadığı için yeni alternatifler
bağımsız fiyat emsali veya daha iyi yatırım sayılmadı; sonuç fırsata yükselmedi.
Karar farkları aynı karar kurallarıyla önceki ve yeni kanıt üzerinde hesaplanır;
kod değişikliği piyasa değişimi gibi sayılmaz. JSONB anahtar sırası da değişiklik
değildir.

Gerçekte değişmeyen fiyatlar değişmiş gibi gösterilmedi. Pozitif iki ardışık
fiyatın düşmesi/yükselmesi, risk beyanının değişmesi, resmî gösterge güncellemesi,
fiyatın kaybolması, kimlik çelişkisi ve geçersizleşen kaynak için regresyon
testleri vardır. Bunlar **sentetik testlerdir**, canlı piyasa olayı değildir.

## Gerçek kayıtlar ve sınırlar

Toplam **9 fiyatlı ilan kaydı**: Genç City'den 8, Akgün Gayrimenkul'den 1.
Önceden 4 kayıt vardı; bu görevde 5 yeni kayıt eklendi. Dokuz kaynak fiyatı
mevcut kimlik/fiyat geçmişi motoruyla işlendi. Dokuz fiyat geçmişi gözlemi var;
tekrar okumalar yeni fiyat olayı oluşturmadı. Ayrıca fiyatı olmayan tarihsel
villa adayı ekranda eksik veriyle görünür. Demo 36 kayıt bunlara dahil değildir.

Genç City `1094` ve `1097`, **344/95 ada/parsel, 365 m², 500.000 TL** beyanını
paylaşıyor. İki URL/harici ID korunuyor; otomatik birleşme yapılmadı.
`POSSIBLE_SHARED_PARCEL` incelemesi açıldı ve ikisi de bağımsız emsal olamaz.
Bu nedenle dokuz ilan kaydı dokuz farklı taşınmazın doğrulanması anlamına gelmez.
İlanın hâlâ satılık olduğu veya yayıncı hukuki beyanlarının doğru olduğu teyit
edilmedi.

**0 yeterli emsal puanı ve 0 incelemeye değer fırsat.** Resmî imar/arazi sınıfı,
tapu/takyidat/pay, yasal yol, satış mevcudiyeti, yerel talep ve likidite,
gerçek kira/masraf ve net alternatif yatırım maliyeti eksik kalıyor.
TCMB politika faizi gerçek mevduat veya kredi teklifi yerine kullanılmıyor.
İstanbul konut endeksi mahalle/arsa fiyatı yapılmıyor; reel değişim yalnızca
aynı dönem TÜFE ile hesaplanıyor. Geçmiş veya başarısız kontrolün fiyatı
tarihsel olarak görünür, güncel değerleme desteği değildir.

Çalışmaların durumu **PARTIAL**: Silivri Belediyesi robots adresi yönlendirmesi
ayrı izin kontrolü gerektirdiği için izlenmedi; önceki AFAD/villa şablonları için
güncel alan çıkarımı desteklenmedi. Eski ikincil haber bu döngüye izinli kaynak
olarak eklenmedi. Bunların eski kanıtı yenilenmiş gibi sunulmadı. TCMB,
UAB ve ilk el ilan kontrolleri bu eksiklere rağmen bağımsız çalıştı.

## Günlük çalışma nerede gerçekleşir?

Codex Cloud'da özel, loopback uygulaması ve mevcut PostgreSQL ile çalıştırıldı.
`npm run research:scheduler` süreç olarak başlatıldı, heartbeat **RUNNING**
doğrulandı. Program **09.00 Europe/Istanbul**; o anki sonraki saat
10 Ekim 2026 09.00 idi. Gerçek cron probu araştırmayı tetikledi ve bir ilan
daha getirdi. **09.00 günlük çalışma henüz gerçekleşmiş sayılmaz.**

Makine/oturum kapanırsa süreçlerin devam edeceği garanti değildir. Kesintisiz
günlük kullanım için PostgreSQL ve worker'ın sürekli açık yetkili bir makinede
çalışması gerekir. Bu görev bir sunucu yayımlamadı. Heartbeat, prob ve
`SCHEDULED` çalışma kayıtları ekranda ayrı gösterilir. Ayrıntılar:
[zamanlayıcı](RESEARCH_SCHEDULER.md).

Marmara SUV aynı kanıt/karar şemasını ve mevcut marka-model-donanım/yıl/km/hasar
emsal motorunu kullanmaya hazırdır. Bu döngüde gerçek SUV kaydı **0** olduğu
için fırsat veya araç piyasası getirisi üretilmedi.

CI'daki Docker Hub kotası, resmi imajların aynı içerik özetleriyle ECR Public
dağıtımına sabitlenmesiyle giderilmeye çalışıldı. Testler kaldırılmadı;
[imaj kökeni ve doğrulama](CI_IMAGE_PROVENANCE.md). Güncel commit için CI sonucu
ayrıca kontrol edilmelidir.

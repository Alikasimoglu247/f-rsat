# FırsatRadar AI: canlı pilotu adım adım kurma

Bu rehber Silivri Gayrimenkul ve Marmara SUV pilotları içindir. Şu anda gerçek Sahibinden/Arabam bildirim örnekleri ve canlı hesap yetkileri sağlanmadı. Kod testleri gerçek bildirim şablonlarının veya canlı teslimatın doğrulandığı anlamına gelmez. Demo ilanlar pilot sonuçlarına katılmaz.

## 1. Takip edeceğin aramaları kaydet

Kendi Sahibinden veya Arabam hesabında platformun resmi kayıtlı arama ve e-posta bildirim özelliğini kullan. Bildirimlerin kendi Gmail hesabına gelsin.

- **Silivri:** İstanbul, Silivri, tüm mahalleler; satılık ev, arsa ve tarla; bütçe sınırı yok.
- **Marmara SUV:** SUV / Crossover; tüm marka ve modeller; elektrikli, hibrit, benzinli ve dizel; yıl, kilometre ve bütçe sınırı yok. İller: İstanbul, Kocaeli, Sakarya, Yalova, Bursa, Bilecik, Balıkesir, Çanakkale, Tekirdağ, Edirne, Kırklareli.

Gmail’de iki ayrı etiket oluşturman bildirimleri ayırmayı kolaylaştırır. Platformun bildirim sağlamadığı bir arama için uygulama kendiliğinden site taramaz.

## 2. İlk gerçek örnekleri indir

Gmail’de **gerçek bir Sahibinden bildirimi ve gerçek bir Arabam bildirimi** aç. Mesajın üç nokta menüsünden “Orijinali göster” ve ardından “Orijinali indir” seçeneğini kullan. Dosyanın uzantısı `.eml` olmalıdır. Kopyalanmış metin veya ekran görüntüsü yeterli değildir.

Kendi mesajlarını yerel uygulamada işle. Dosyalar kişisel bilgi içerebilir; bunları GitHub’a veya herkese açık bir yere koyma. Test klasöründeki sentetik dosyalar gerçek örnek yerine geçmez.

## 3. Bildirimi yükle ve kontrol et

FırsatRadar’da **Veri Kaynakları → Canlı pilot kurulumu** bölümünü aç. Eksik bağlantı ve kurulum adımlarını burada görebilirsin. Gmail bağlantısını kurmadan da `.eml` dosyalarını inceleyebilirsin.

1. “Bu bildirimi ve içerdiği veriyi işleme yetkim var” kutusunu işaretle.
2. Bildirimin ait olduğu pilotu seç. Bu seçim, bildirimi hunide sayar; ilanın filtreye uyduğunu garanti etmez.
3. `.eml` dosyasını yükle ve “Bildirim incelemesi” kaydını aç.
4. Çıkarılan bağlantıyı, ilan ID’sini, fiyatı, kategoriyi ve konumu orijinal mesajla karşılaştır.
5. “Eksik alanları kaynak kanıtıyla tamamla” bölümünde yalnızca mesajda veya kendi incelediğin ilanda görülen bilgileri gir. İncelediğin kaynağı açıklama alanına yaz. Bilinmeyen alanları boş bırak.
6. Zorunlu alanlar doğru ve eksiksizse açık onay kutusunu işaretleyip “Şablonu onayla ve aktar” seçeneğini kullan.

Alan tamamlamaları kayıt altına alınır. Mevcut çıkarılmış bilgiler üzerine yazılmaz. Kullanıcının tamamladığı bilgiler sonraki mesajlara otomatik taşınmaz. Kart yapısı veya gönderici değişirse tekrar inceleme gerekebilir. Hiç ilan ayrıştırılamıyorsa şablon desteklenmiş sayılmaz; orijinal gerçek örnekle teknik inceleme gerekir.

Konutlarda net ve brüt m², oda sayısı, bina yaşı, konut durumu ve mahalleyi kontrol et. Arsa/tarlada alan, konum, imar, hisse ve yol erişimini kontrol et. Bunlar kaynak beyanıdır; tapu veya imar doğrulaması yerine geçmez.

SUV için başlık tek başına yeterli değildir. **Veri Kaynakları** ekranındaki gövde incelemesinde kaynaktaki gövde tipini ve incelenen kanıtı açıkça onayla. Model adı üzerinden SUV tahmini yapılmaz.

## 4. Fırsat çıkmasa da ilanı gör

**Yeni İlanlar** ekranı geçerli gerçek ilanları puanı olmasa da gösterir. Önce “Tüm gerçek ilanlar” seçimini kullan; sonra pilot filtresini seç.

Bir ilan tüm kayıtlarda görünüp pilotta görünmüyorsa işlem türü, bölge, bütçe, yakıt veya doğrulanmış gövde tipi eşleşmiyor olabilir. Ana ekrandaki pilot kartından filtreleri değiştirebilirsin.

Fırsat için karşılaştırma alanları tamamlanmalı, en az beş yeterli gerçek emsal bulunmalı ve minimum puan karşılanmalıdır. Varsayılan eşik 70’tir. Eksik veri veya yetersiz emsal varsa ilan fırsat olarak etiketlenmez.

Pilot kartındaki huni nerede durulduğunu gösterir: Gmail bildirimi → ayrıştırılan → inceleme → kaydedilen → eşleşen → emsal yetersiz → fırsat. Gmail sayısı **mesaj**, diğerleri **tekil ilan** sayısıdır. Bir mesaj birden çok ilan içerebilir. Yerel `.eml`, manuel ve CSV kayıtları ayrıca hesaba katıldığı için sayılar her zaman sırayla azalmaz. Hiçbir pilota atanamayan Gmail bildirimleri ayrıca gösterilir.

## 5. Fiyat takibini doğrula

Aynı ilan için platformdan farklı tarihte gelen ikinci bir gerçek fiyat bildirimi olduğunda onu da işle. Aynı mesajı tekrar yüklemek yeni ilan veya indirim oluşturmaz.

“Son 7 günlük fiyat düşüşleri” bölümünde önceki geçerli gözlem, yeni fiyat, indirim tutarı, yüzdesi ve tarihi görünür. Eski bir yüksek fiyat son haftanın indirimi sayılmaz. İndirim tarihi, uygulamanın elindeki gözlem tarihidir; satıcının değişiklik anı ayrıca doğrulanmış değildir. Yerel `.eml` tarihi e-posta başlığından gelir ve bağımsız doğrulanmaz. Geçmişteki fiyat düşüşleri ayrı gösterilir; tek başına fırsat değildir.

**Veri Kaynakları → Günlük analizi çalıştır** seçeneğiyle kayıtları analiz et. **Bildirimler** ekranındaki günlük raporu açıp iki pilotun hunisini, fiyat düşüşlerini ve fırsatlarını kontrol et. Rapordaki “canlı alım doğrulanmadı” ifadesi yerel yükleme ile Gmail bağlantısının farklı olduğunu hatırlatır.

## 6. Gmail bağlantısını izinle aç

Bu adım için teknik kurulumu yapan kişinin Google OAuth ayarlarını, güvenli şifreleme anahtarını ve kalıcı token depolamasını sunucuda hazırlaması gerekir. Gizli anahtarları sohbet, GitHub veya uygulama formuna yazma.

1. Kurulum ekranındaki Google ayarlarının hazır olduğunu kontrol et.
2. “Google ile salt-okunur bağlan” seçeneğini kullan; kendi hesabınla Google’ın izin ekranını tamamla. Uygulama mesajları değiştirme veya silme izni istemez.
3. “Gmail etiketlerini göster” ile bildirim etiketlerinin ID’lerini bul.
4. “Bildirim seçimi” alanına yalnızca izin verdiğin etiketleri veya gerçek bildirimdeki gönderici adreslerini yaz ve kaydet. İkisini birlikte girersen hem etiketler hem gönderici eşleşmelidir.
5. Pilot kartlarının filtre düzenleyicisinde aynı etiketi/göndericiyi ilgili pilota eşleştir. Bu, ayrıştırılamayan mesajların hangi pilota geldiğini de gösterir; Gmail erişim iznini genişletmez.
6. “Seçili bildirimleri şimdi al” seçeneğini kullan. Şablon incelemelerini tamamla. Başarılı alım zamanını ve pilot hunisini kontrol et.

Google test uygulamalarının erişimi test kullanıcıları ve sağlayıcının süre/izin kurallarıyla sınırlı olabilir. İzin iptal edilirse yeniden bağlanmak gerekir. Gmail bağlantısını kaldırabilirsin; Google hesabındaki uygulama iznini ayrıca iptal edebilirsin.

## 7. Her sabah 09.00 takibini aç

Teknik kurulum yapan kişi web uygulaması, PostgreSQL ve günlük takip sürecini sürekli çalışır duruma getirir. Web ve takip süreci aynı şifreli kalıcı token deposunu kullanmalıdır. Bu teslimatta buluta otomatik yayın yapılmadı.

Kurulum ekranında scheduler’ın “Süreç durum bildiriyor” olduğunu ve zamanlamanın `0 9 * * *`, saat diliminin `Europe/Istanbul` olduğunu gör. Son durum zamanı yaklaşık her dakika yenilenir. Bu, canlı veri geldiği anlamına gelmez; “son görev” ve gerçek Gmail alımı ayrıca kontrol edilir.

Sunucu yeniden başlatıldıktan sonra Gmail bağlantısının korunduğunu ve scheduler’ın tekrar durum bildirdiğini teknik kurulum yapan kişiyle doğrula. Kaybolan token veya eski durum bildirimi varsa sorun çözülmeden günlük takibi başarılı sayma.

## 8. Telegram veya e-postayı isteğe bağlı aç

Teknik kurulum yapan kişi kendi Telegram botunu/sohbetini veya SMTP e-posta hesabını sunucuda tanımlar. Sonra **Ayarlar** ekranından istediğin kanalı aç. Kimlik bilgisi yoksa uygulama canlı gönderimi etkinleştirmez.

Günlük rapor **Bildirimler** ekranında hazırlanır ve kopyalanabilir. Harici kanallara mevcut fırsat bildirimleri gönderilir; tüm günlük rapor kendiliğinden ayrıca gönderilmez. Canlı teslimatı gerçek bir uygun ilan bildirimi oluştuğunda hem uygulamadaki gönderim durumundan hem kendi Telegram/e-posta hesabından kontrol et. SMTP kabulü mesajın gelen kutusuna ulaştığının kanıtı değildir. Belirsiz gönderim tekrar kopya oluşturmamak için otomatik tekrarlanmaz.

## 9. Canlı kabul kontrolü

- Gerçek Sahibinden ve Arabam örneklerini orijinal mesajlarla karşılaştırdım.
- Eksik alanları kaynak bilgisiyle tamamladım; bilinmeyenleri boş bıraktım.
- Kaynak URL’si ve ilan ID’si doğru; farklı ilanlar birleşmedi.
- Silivri ve Marmara SUV filtre eşleşmelerini kontrol ettim.
- Puansız gerçek ilanları Yeni İlanlar ekranında görebiliyorum.
- Aynı ilan için iki gerçek gözlemle fiyat geçmişini ve tekrar önlemeyi kontrol ettim.
- Günlük rapor kayıtlarla uyumlu; yetersiz emsal fırsat olarak gösterilmiyor.
- Gmail’in yalnızca izin verdiğim bildirimleri okuduğunu kontrol ettim.
- Yeniden başlatma sonrası bağlantı ve 09.00 takip süreci çalışıyor.
- Açtığım harici bildirim kanalında gerçek teslimatı alıcı hesabından doğruladım.
- GitHub PR #1’in CI kontrolü yeşil; bunun canlı servis doğrulamasından ayrı olduğunu biliyorum.

Bu maddeler gerçek veriler ve kendi izinlerinle doğrulanana kadar **canlı pilot kabulü bekliyor**. PR incelemeye açıktır; main’e birleştirme ve bulut yayını ayrı işlemlerdir.

# Tarayıcı destekli kişisel gözlem pilotu

Keşfet ekranındaki “Seçtiğim ilanı kaydet / yeniden gözlemle” formu tek ilanı alır. URL otomatik ziyaret edilmez. Başlık, URL, fiyat, konum, özellikler ve Türkiye saatindeki gözlem zamanı kullanıcı tarafından girilir. Kaynaktaki tarihin yayın/güncelleme olduğu açık değilse “Kaynak belirtmiyor” seçilir; bu tarih yayın tarihi kabul edilmez.

Mevcut karttaki “Yeni fiyat gözlemi gir” kimliği ve alanları doldurur. Fiyatı ve gözlem zamanını düzenleyip kaydedin. URL izleme parametreleri temizlenir; mevcut manuel kayıtlarla aynı kaynak kimliği ve PostgreSQL işlem kilidi kullanılır. Tekrarlanan URL/ID yeni ilan yaratmaz. Aynı fiyatın farklı zamanlardaki gözlemleri saklanır; aynı fiyat-zamanın tekrar gönderilmesi geçmişi çoğaltmaz. Eski bir gözlem güncel fiyatı geri almaz.

Kaynakta gösterilen fiyat = teyitsiz istenen fiyat. Satış durumu UNKNOWN; fiyat teyidi UNVERIFIED. Tek bir tarihli sayfa görüntülemesi satıcı veya lisanslı veri teyidine dönüşmez. Bu uç nokta teyit alanlarını kabul etmez. Fiyat teyidi ayrı, kanıt gerektiren mevcut modelde korunur; yeni teyitsiz gözlemle güncel teyit bayrağı kaldırılır.

Üç teknik kayıt kurgusaldır, example.invalid URL'leri kullanır ve isDemo=true ile browser-pilot-demo kaynağında tutulur. Keşfet’te ayrı örnek veri seçeneği vardır; varsayılan gerçek listeye girmezler. scripts/browser-pilot-test.ts PostgreSQL üzerinde kimlik, eşzamanlı tekrar, tarihli fiyat geçmişi, teyit ayrımı ve mevcut gerçek kayıtların değişmemesini doğrular. Test gerçek kayıt silmez veya güncellemez.

Günlük genişleme: kullanıcı seçimiyle günlük gözlem girişi veya yazılı kullanım hakkı bulunan CSV/JSON/e-posta teslimleri aynı kimlik ve tarih modeline bağlanabilir. Planlanan çalışmada kaynak başına açık yetki, gözlem zamanları, son başarılı iş, hata/erişim engeli ve tekrar anahtarı kaydedilmelidir. Kaynak kısıtı olan platformlarda tarayıcı crawler çalıştırılmaz. Mevcut araştırma scheduler’ına bu üç marketplace eklenmedi.

Uygulama Docker Desktop'ta mevcut PostgreSQL volume'u ile çalışır. Bu pilot şema migration'ı gerektirmez. Ana dala merge yapılmaz; dağıtılmış Windows klasörü Git deposu değildir. Düzenlenen mevcut dosyaların yedeği .local/browser-pilot-backup içindedir.

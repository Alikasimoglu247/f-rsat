# Windows'taki mevcut FırsatRadar'ı V2'ye güncelleme

GitHub'a kod gönderilmesi bilgisayarınızdaki eski ZIP klasörünü güncellemez. Bu teslimattaki özel **FIRSATRADAR_V2_WINDOWS.zip** hem yeni kodu hem Cloud'dan alınan gerçek araştırma paketini içerir. Paket internette yayımlanmaz; bu konuşmadan indirilir.

1. Docker Desktop'ı açın. Mevcut FırsatRadar kurulumunuz çalışıyor olsun; güncelleyicinin önce veritabanı yedeğini alması gerekir.
2. Yeni ZIP'i ayrı bir klasöre çıkarın. **FIRSATRADAR_V2_KUR.cmd** dosyasını çift tıklayın.
3. Açılan pencerede **eski FırsatRadar klasörünüzü** seçin: `.env.windows.local` bulunan klasör. Yeni ZIP klasörünü seçmeyin.

Güncelleyici önce PostgreSQL yedeği alır, değiştireceği mevcut kod dosyalarını saklar, ayar dosyasına dokunmaz ve aynı `firsatradar_radar_postgres` volume'unu kullanır. Web ve araştırma worker'ını yeniden oluşturur; sağlık kontrolleri başarılı olunca uygulamayı açar. Özel araştırma paketini önce önizleyip sonra işlemsel olarak birleştirir. Aynı paketi yeniden aktarmak ilan/fiyat geçmişini çoğaltmaz.

Beklenen sonuç: mevcut yerel kayıtlarınıza ek olarak **9 gayrimenkul ve 5 SUV**, toplam **14 kaynaklı gerçek fiyat kaydı**. Her fiyatın özgün gözlem tarihi korunur. Kaydın aktarılmış olması ilanı yeni, hâlâ satılık veya yatırım fırsatı yapmaz. Kaynak eskimesi, belirsiz kimlik ve eksik emsaller uygulamada gösterilir; şu an doğrulanmış fırsat sayısı **0**.

Aktarım sırasında araştırma çalışıyorsa aktarım durur. Araştırmanın bitmesini bekleyip **Araştırma Merkezi → Araştırma paketi yükle** üzerinden ZIP'teki `FIRSATRADAR_GERCEK_VERI.json` dosyasını seçin, önizleyin ve uygulayın. Aktif iş bitmeden kayıtlar değiştirilmez.

Yedekler eski kurulumunuzun `.local/windows-backups/TARIH-SAAT` klasöründedir. Hata olursa bu konumu ve hata mesajını koruyun. **Volume silmeyin, veritabanını sıfırlamayın, seed çalıştırmayın.** Yedek otomatik olarak geri yüklenmez. Eski `.env.windows.local` dosyasını paylaşmayın veya GitHub'a yüklemeyin.

Sonraki yalnızca kod güncellemelerinde eski klasördeki **FIRSATRADAR_GUNCELLE.cmd** kullanılabilir; GitHub dalının ZIP'ini alır. GitHub paketi özel araştırma verisini içermez. Git checkout kullanan kurulumlar otomatik dosya kopyalayıcısından korunur; kendi feature dalını güncelleyip mevcut başlatıcı kullanılmalıdır.

Günlük araştırma bilgisayar ve Docker açıkken **09.00 Europe/Istanbul** çalışır. Uyuyan veya kapalı bilgisayarda çalışma garanti edilmez. Araştırma Merkezi'nde gerçek worker heartbeat'i, son çalışma ve sonraki planı kontrol edin. Kodda cron bulunması kesintisiz otomasyonun kanıtı değildir.

Bu sürümün web arayüzü Linux Chromium'da; aynı Windows Compose servisleri GitHub CI'da Linux Docker üzerinde test edilir. Windows 11'de dosya seçici ve PowerShell 5.1 güncellemesi doğrudan çalıştırılmamıştır. Güncel Docker Desktop / Compose gerekir; eski Compose `--no-env-resolution` seçeneğini tanımıyorsa güncelleme veri değiştirmeden durur.

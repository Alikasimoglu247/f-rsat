# FırsatRadar AI — Windows'ta çift tıklayarak çalıştırma

## İlk kullanım

1. **Docker Desktop** kurulu, açık ve Linux containers modunda çalışıyor olmalı. Windows'ta WSL 2 desteği gerekir. İlk kurulum / Docker image indirme internet gerektirir.
2. Bu dalın GitHub ZIP dosyasını indirip **klasöre çıkarın**. Dosyaları ZIP içinden çalıştırmayın.
3. `FIRSATRADAR_BASLAT.cmd` dosyasına çift tıklayın. İlk kurulum, Node.js veya PostgreSQL'in bilgisayara elle kurulmasını istemez; Docker imajlarını indirir, veritabanı migration'larını ve demo eklemeyen bootstrap işlemini uygular.
4. Başarılı olunca tarayıcı `http://127.0.0.1:3000/yatirim-analizi` sayfasında açılır. Sadece **bu bilgisayardan** erişilir.

Dosya `.env.windows.local` yoksa 192 bit rastgele PostgreSQL parolasıyla bir kez üretilir. Mevcutsa **asla üzerine yazılmaz**; gerçek şifreleri paylaşmayın. Başka `.env` dosyaları değiştirilmez. Veriler Docker volume'unda kalır. Dosyayı silmek veya şifreyi değiştirmek mevcut volume'a erişimi bozabilir; yedek alın.

**İlk yerel kurulumun veritabanı boştur.** Daha önce Codex Cloud'da görülen 14 gerçek fiyat kaydı **GitHub'da değil, Cloud PostgreSQL'indedir**; bunlar kendiliğinden Windows'a taşınmaz. Bu farkı demo veya sahte fiyatlarla gizlemiyoruz. Bulut verisini aktarmak için ayrı bir güvenli ve kaynağı doğrulanmış dışa aktarım gerekir. Sistem ilk yerel araştırmaları çalıştırdıkça izinli erişebildiği kayıtları ekleyebilir; 14 eski kaydın tamamının tekrar bulunması garanti değildir.

## Her gün

- `FIRSATRADAR_BASLAT.cmd`: mevcut verilerle uygulamayı ve araştırma worker'ını açar; aynı kayıtları sıfırlamaz.
- `SIMDI_ARASTIR.cmd`: o anda sınırlı, kaynak izinlerine uyan en çok 6 araştırma turu çalıştırır. İzin / eşleştirme / bekleme kuralları geçerlidir; 0 yeni ilan başarısızlık olmak zorunda değildir.
- `FIRSATRADAR_DURDUR.cmd`: uygulamayı durdurur; **veritabanını silmez**.

Araştırma worker'ı `INVESTMENT_RESEARCH_CRON=0 9 * * *` varsayılanıyla her gün **09.00 Europe/Istanbul** çalışır. Docker Desktop çalışıyor ve bilgisayar uyanık olmalıdır. Yeniden başlatmada Docker Desktop otomatik çalışmıyorsa başlatıcıyı tekrar açın. Cron bulunması, Windows kapalıyken araştırma gerçekleştiği anlamına gelmez. Gmail/SMTP veya dışarı veri yayını etkinleştirilmez.

## Yardım ve güvenlik

- Gereksinimler: Windows 10/11, Docker Desktop (Linux containers, WSL2), internet, imaj/DB için yeterli boş disk alanı.
- `docker compose --project-name firsatradar --env-file .env.windows.local -f compose.windows.yaml ps` ile servis durumunu inceleyebilirsiniz.
- Sorun olursa `docker compose --project-name firsatradar --env-file .env.windows.local -f compose.windows.yaml logs --tail 60 web research migrate` komutu hizmet günlüklerini gösterir; gizli içerikleri paylaşmadan önce inceleyin.
- Port 3000 doluysa başlatma hata verir; başka uygulamanın süreçlerini kendiliğinden sonlandırmaz.
- **`docker compose down -v` KULLANMAYIN:** `-v` PostgreSQL verilerini siler. Başlatıcı ve durdurucu bu komutu çalıştırmaz.
- Yerel web yalnızca `127.0.0.1:3000` adresinde yayınlanır. İnternete, ağdaki diğer cihazlara veya GitHub Pages'e yayımlanmaz. PostgreSQL portu hiç yayınlanmaz.
- `APP_ACCESS_TOKEN` bu kişisel localhost kurulumunda boş bırakılmıştır; internete açmak için uygun değildir. İnternet yayını bilinçli olarak kapsam dışıdır.
- Kurulumu Docker Desktop yüklü gerçek bir Windows makinede henüz test etmedik. GitHub CI ve YAML kontrolü Windows UX onayının yerine geçmez.

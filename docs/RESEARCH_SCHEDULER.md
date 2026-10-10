# Günlük yatırım araştırmasının çalışma ortamı

Araştırma süreci posta bağlantısından bağımsızdır. Sahibinden'e istek göndermez;
yalnızca araştırma döngüsündeki izinli kaynakları kullanır. E-posta veya Telegram
göndermez.

```sh
npx tsx scripts/research-scheduler.ts
```

Varsayılan zamanlama her gün **09.00, Europe/Istanbul**. İsteğe bağlı
`INVESTMENT_RESEARCH_CRON` bu araştırma sürecinin zamanlamasını değiştirir;
mevcut posta zamanlayıcısının `DAILY_CRON` ayarıyla ilişkili değildir.

Her günlük tetiklemede en fazla altı ayrı, bekleme süresi dolmuş segment
araştırılır; böylece SUV yalnızca haftalık sıra geldiğinde kontrol edilmez.
Bir segmentin başarısızlığı diğer izinli segmentleri engellemez. Tümü hata
verirse günlük sonuç FAILED, karışık/eksik sonuçlarda PARTIAL olur.
Aktif başka iş veya tüm segmentlerin beklemesi halinde tekrar yapılmaz.
Prob kabul mekanizması tek turdur; günlük altı turun fiilen tamamlandığı
yalnızca gerçek SCHEDULED kayıtlarıyla doğrulanabilir.

Bu komutun çalıştığı makine açık, süreç çalışır, ağ ve PostgreSQL erişimi hazır
olmalıdır. Codex Cloud oturumu kapanırsa günlük araştırma devam edeceğine dair
bir garanti yoktur. Kod veya cron ifadesinin depoda bulunması, kesintisiz bir
sunucu kurulmuş olması anlamına gelmez. Bu değişiklik uygulamayı yayımlamaz.

`SchedulerHealth` tablosundaki `investment-research` satırı 60 saniyede bir
heartbeat alır. Son heartbeat 130 saniyeden eskiyse durum `STALE`; düzgün
kapanışta `STOPPED`; henüz başlatılmamışsa `NOT_STARTED` olur. Bir sonraki
planlanan saat ileriye dönük hesaplamadır. Gerçek tetiklenme için
`lastTickAt`, `lastResult` ve ilgili araştırma çalışması incelenmelidir.
Posta zamanlayıcısının `personal` satırı değiştirilmez.

Gerçek cron tetiklenmesini beklemeden sonlu bir zamanlayıcı kontrolü:

```sh
npx tsx scripts/research-scheduler.ts --probe
```

Prob bir sonraki saniyede **node-cron tarafından** bir kez tetiklenir, gerçek
araştırma döngüsünü `SCHEDULED_PROBE` olarak çalıştırır ve kapanır. Bu kontrol
09.00 çalışmasının gerçekleştiği veya yarın makinenin açık olacağı iddiası
değildir. PostgreSQL testlerindeki prob gerçek saati kullanır fakat araştırma
işini yerel sentetik bir işle değiştirir; dış kaynaklara erişmez.

## En basit kalıcı çalışma seçeneği

Linux Cloud ortamında araştırma sürecini özel, arayüzden bağımsız bir supervisor
ile yönetmek için:

```sh
npm run research:worker -- start
npm run research:worker -- status
npm run research:worker -- stop
npm run research:worker -- restart
```

Komutlar `.local/research-worker/events.jsonl` dosyasına olay kaydeder. Süreç
sahipliği PID ile birlikte `/proc` komut satırı ve rastgele başlangıç kimliğiyle
kontrol edilir; başka sunucular kapatılmaz. İkinci worker PostgreSQL oturum
kilidini alamaz ve 73 koduyla çıkar. Supervisor bunu yeniden denemez. Worker
çökmesinde en fazla beş yeniden başlatma, 2–60 saniye bekleme uygulanır;
normal durdurma devam eden işi bitirmeye çalışır. Cloud makinesinin kendisi
kapanırsa supervisor da kapanır. Bu yardımcı Windows hizmeti değildir.

10 Ekim 2026 kabulünde gerçek worker SIGKILL ile sonlandırıldı; iki saniye
sonra yeni PID ve yeni heartbeat oluştu. `stop` kayıtları koruyarak kapattı;
`start` tekrar açtı. İkinci gerçek worker 73 ile reddedildi. Son canlı cron
probu 12.11 Europe/Istanbul'da 5 SUV'u yeniden okuyup tamamlandı; 14 gerçek
ilan ve 14 fiyat gözlemi değişmedi. Sabah 09.00 çalışması ise başladıktan sonra
kesildi ve FAILED olarak kaydedildi. Prob bu günlük başarısızlığı silmez.

Tek seferde bağımsız araştırma turları:

```sh
npm run research -- --rounds 6
```

En fazla altı tur yapılır. Segment hafızası PostgreSQL `ResearchRun.summary`
içindedir; boş/hatalı segmentler 6–24 saat bekler, yeni kayıt bulunan segment
bir saat bekler. Tümü beklemedeyse ilk tur DEFERRED döner, ağ isteği ve yeni
çalışma kaydı oluşmaz. Her toplama turu en fazla 50 istek / 3 dakika ve yanıt
başına 1,5 MB ile sınırlıdır. Erişim/robots/şart engelleri bekleme dolunca
otomatik kaldırılmaz. Kaynak kapsamı dışındaki gözlemler yeniden tarihlenmez.

Bilinen ilanlar yenilenirken katalogdan yeni adaylar için de bütçe ayrılır;
çok sayıda eski ilan yeni keşfi durdurmaz. Aynı model olmayan SUV'lar veya
imar/hisse sınıfı farklı araziler beşli emsal kümesi oluşturmaz.

Yeni bir hizmet satın almadan, kullanıcının sürekli açık kendi bilgisayarında
kalıcı PostgreSQL ve **tek bir araştırma worker'ı** yeterlidir. Worker mevcut
`npm run research:scheduler` komutunu çalıştırır; işletim sisteminin hizmet
yöneticisi açılışta başlatıp süreç çökerse yeniden başlatır. Web arayüzü yalnızca
yerelden açılabilir; internetten erişim veya Gmail bağlantısı gerekmez.

Windows bilgisayarda uyku/kapalı durum günlük görevi durdurur. Bilgisayar sürekli
açık tutulamayacaksa daha sonra kullanıcıya ait sürekli açık bir makine gerekir.
Bu mimari seçildi; Windows'a hizmet kurulmadı ve kesintisiz çalışma doğrulanmadı.
Depodaki `compose.runtime.yaml` dosyasının `scheduler` servisi posta içindir;
araştırma worker'ı olarak olduğu gibi kullanılmamalıdır.

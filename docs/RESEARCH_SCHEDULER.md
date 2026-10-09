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

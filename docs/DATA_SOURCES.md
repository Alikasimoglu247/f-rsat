# Veri kaynakları ve izinler

| Kaynak                      | Yöntem                                        | MVP durumu                                   | Gereken izin                                           |
| --------------------------- | --------------------------------------------- | -------------------------------------------- | ------------------------------------------------------ |
| Manuel giriş / URL          | Kullanıcının girdiği alanlar                  | Çalışır                                      | Kullanıcının sağlama hakkı; URL'den veri çekilmez      |
| CSV / JSON                  | Kullanıcının yüklediği kayıtlar               | Çalışır                                      | İçeriğin kullanım hakkı                                |
| Kaydedilmiş arama e-postası | Kullanıcının yüklediği izinli e-posta gövdesi | Yapılandırılmış JSON/CSV gövdesi içe aktarma | Postaya ve veriye erişim hakkı; mailbox bağlantısı yok |
| Demo                        | Yerel seed                                    | Açıkça demo                                  | Gerçek marketplace ilanı değildir                      |
| Resmi API / lisanslı feed   | Sabit izinli HTTPS JSON adaptörü              | Yapılandırılabilir; canlı doğrulanmadı       | Sağlayıcı anlaşması, API anahtarı ve izinli hedef      |
| Sahibinden                  | Yetkili anlaşmaya bağlı                       | Planlandı, bağlı değil                       | Açık yetki/anlaşma gerekir                             |
| Arabam                      | Yetkili anlaşmaya bağlı                       | Planlandı, bağlı değil                       | Açık yetki/anlaşma gerekir                             |
| Hepsiemlak                  | Yetkili anlaşmaya bağlı                       | Planlandı, bağlı değil                       | Açık yetki/anlaşma gerekir                             |
| Emlakjet                    | Yetkili anlaşmaya bağlı                       | Planlandı, bağlı değil                       | Açık yetki/anlaşma gerekir                             |

M2 e-posta kanalları ayrı kaynaklardır: `sahibinden-email` ve `arabam-email`. `.eml` yükleme ve Gmail API `gmail.readonly` alımı uygulanmıştır; gerçek platform şablonları henüz canlı doğrulanmamıştır. Kullanıcı ilk örneği onaylamadan otomatik aktarım yoktur. Gmail OAuth izni, seçili etiket/gönderici alımı ve şablonun Gmail'de eşleşmesi ayrı durumlarla raporlanır. [Kurulum ve sınırlar](M2_EMAIL_DISCOVERY.md).

API varlığı varsayılmaz. Stealth browser, proxy rotasyonu, CAPTCHA aşma, uydurma kimlik veya erişim engellerini aşma yoktur. Her kaynak için yöntem, yetki, durum, son başarı, hata, tazelik ve kategori kapsamı saklanır. Bir başarılı senkronizasyon gerçekleşmeden canlı kaynak bağlı sayılmaz.

## İçe aktarma sözleşmesi

UTF-8 CSV başlıkları `title,category,province,district,price,sourceUrl,externalId,isDemo` ve kategori alanları (`sizeM2,propertyType,rooms,buildingAge,condition`, `make,model,trim,modelYear,mileage,fuel,transmission,damageHistory`, `classification,zoning,roadAccess,parcelNumber,sharedOwnership,agriculturalRestrictions`). Kategoriler `EV,ARABA,ARSA,TARLA`; fiyat pozitif ondalık metindir. Bilinmeyen alanlar boş bırakılır, doğrulanmış gibi sunulmaz. JSON aynı alanları nesne dizisi olarak kabul eder. E-posta içe aktarımı aynı yapıda bir JSON/CSV gövdesini açık kullanıcı yüklemesiyle alır; keyfi HTML mesajlarından veri uydurmaz.

En fazla 500 kayıt/2 MB. Tüm dosya önce doğrulanır; validasyon hatasında dosya kaydedilmez. Önce kaynak + harici ID, sonra aynı kaynağın kanonik URL'si kullanılır. Farklı kaynak/ID'lerde benzer kayıtlar birleşmez. Güçlü kimliği olmayan benzer kayıt ve ID/URL/alan adı çatışması, diğer geçerli kayıtların aktarımını engellemeden incelemeye alınır; yeni/güncellenen/tekrar/inceleme sayıları ayrı döner. Yeni fiyat farklıysa gözlem eklenir; aynı fiyat yeniden alınırsa tarihçe şişmez. Koleksiyon zamanı, kaynak, import job ve köken korunur.
# M2.1 pilot alanları

İçe aktarmada `transactionType` (SATILIK/KIRALIK), `netM2`, `grossM2`, `bodyType`, `bodyTypeVerified`, `bodyTypeEvidence` desteklenir. Alan bilgileri metin decimal; bilinmeyenler boş bırakılır. `bodyTypeVerified=true` için tanınan gövde sınıfı ve incelenmiş kaynak kanıtı açıklaması gerekir. E-posta ayrıştırıcısı bu onayı vermez. Mevcut `sizeM2` net/brüt varsayılmaz. Pilot kapsamı ve eksik kanıtta dışlama kuralları [M2.1 pilot belgesinde](M21_PILOTS.md).

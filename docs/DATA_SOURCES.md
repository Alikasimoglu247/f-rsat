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

API varlığı varsayılmaz. Stealth browser, proxy rotasyonu, CAPTCHA aşma, uydurma kimlik veya erişim engellerini aşma yoktur. Her kaynak için yöntem, yetki, durum, son başarı, hata, tazelik ve kategori kapsamı saklanır. Bir başarılı senkronizasyon gerçekleşmeden canlı kaynak bağlı sayılmaz.

## İçe aktarma sözleşmesi

UTF-8 CSV başlıkları `title,category,province,district,price,sourceUrl,externalId,isDemo` ve kategori alanları (`sizeM2,propertyType,rooms,buildingAge,condition`, `make,model,trim,modelYear,mileage,fuel,transmission,damageHistory`, `classification,zoning,roadAccess,parcelNumber,sharedOwnership,agriculturalRestrictions`). Kategoriler `EV,ARABA,ARSA,TARLA`; fiyat pozitif ondalık metindir. Bilinmeyen alanlar boş bırakılır, doğrulanmış gibi sunulmaz. JSON aynı alanları nesne dizisi olarak kabul eder. E-posta içe aktarımı aynı yapıda bir JSON/CSV gövdesini açık kullanıcı yüklemesiyle alır; keyfi HTML mesajlarından veri uydurmaz.

En fazla 500 kayıt/2 MB. Tüm dosya önce doğrulanır; hatalı satırlar satır numarasıyla raporlanır ve dosya kısmen kaydedilmez. Normalleştirilmiş URL, kaynak içi harici kimlik ve içerik parmak izi tekrarları önler. Yeni fiyat farklıysa gözlem eklenir; aynı fiyat yeniden içe aktarılırsa tarihçe şişmez. Koleksiyon zamanı, kaynak, import job ve köken korunur.

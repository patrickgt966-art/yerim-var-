# Güvenlik politikası

## Desteklenen sürümler

Yalnızca `main` dalındaki en güncel sürüm desteklenir.

## Açık bildirme

Güvenlik açıklarını **herkese açık issue olarak bildirme.** Bunun yerine GitHub'ın özel bildirim özelliğini kullan:

1. Deponun **Security** sekmesine git.
2. **Report a vulnerability** ile özel bir güvenlik bildirimi oluştur.

Açığın ne olduğunu, nasıl tekrar üretileceğini ve olası etkisini yaz. İlk yanıtı birkaç gün içinde vermeye çalışırız; bu gönüllü bir projedir, kesin süre taahhüt edemeyiz. Düzeltme yayımlanana kadar ayrıntıları paylaşmamanı rica ederiz.

## Kapsam

Uygulamanın hesabı ve sunucusu yoktur. Ağa giden tek istek İzmir Büyükşehir Belediyesi açık veri API'sinedir. Özellikle ilgilendiklerimiz:

- Konumun veya cihazdaki verilerin (favoriler, aktif park) cihaz dışına sızması
- API yanıtındaki kötü niyetli veriyle uygulamanın çökertilmesi veya yanıltıcı içerik gösterilmesi
- Açılan bağlantıların (Apple Haritalar, GitHub) manipüle edilmesi

İzmir açık veri API'sinin kendisindeki sorunlar belediyeye bildirilmelidir.

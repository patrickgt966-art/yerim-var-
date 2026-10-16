# Güvenlik politikası

## Desteklenen sürümler

Yalnızca `main` dalındaki en güncel sürüm desteklenir.

## Açık bildirme

Güvenlik açıklarını **herkese açık issue olarak bildirme.** Bunun yerine GitHub'ın özel bildirim özelliğini kullan:

1. Deponun **Security** sekmesine git.
2. **Report a vulnerability** ile özel bir güvenlik bildirimi oluştur.

Açığın ne olduğunu, nasıl tekrar üretileceğini ve olası etkisini yaz. İlk yanıtı birkaç gün içinde vermeye çalışırız; bu gönüllü bir projedir, kesin süre taahhüt edemeyiz. Düzeltme yayımlanana kadar ayrıntıları paylaşmamanı rica ederiz.

## Kapsam

Uygulamanın hesabı yoktur. Tek sunucu isteğe bağlı Yerim ✨ içindir (`server/yerim-ai`, Cloudflare Worker). Ağa giden istekler seçili şehrin doluluk API'sine (İzmir Büyükşehir Belediyesi ya da İBB / İSPARK), Apple Haritalar'a (harita, adres ve yer araması) ve kullanıcı onay verdiyse Yerim ✨ sunucusuna gider; ayrıntılar [gizlilik politikasında](docs/gizlilik.html). Özellikle ilgilendiklerimiz:

- Konumun veya cihazdaki verilerin (favoriler, aktif park) cihaz dışına sızması
- API yanıtındaki kötü niyetli veriyle uygulamanın çökertilmesi veya yanıltıcı içerik gösterilmesi
- Açılan bağlantıların (Apple Haritalar, GitHub) manipüle edilmesi
- Yerim ✨ sunucusunun kötüye kullanılması (günlük sınırların aşılması, Anthropic anahtarının sızması) ya da modelin uygulamanın verisinde olmayan bir bilgiyi gösterebilmesi

Açık veri API'lerinin kendisindeki sorunlar ilgili kuruma (İzmir Büyükşehir Belediyesi, İBB) bildirilmelidir.

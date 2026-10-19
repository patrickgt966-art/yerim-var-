# App Store metinleri

App Store Connect'e kopyalanacak metinler. Uzunluk sınırları Apple'ın; sayılar yanlarında.
Anahtar kelimeler virgülle, boşluksuz ayrılır; ad ve alt başlıktaki kelimeler tekrar yazılmaz
(Apple onları zaten arar). Türkçe harfler bazı ölçümlerde 2 bayt sayıldığı için anahtar kelime
satırı 100'ün altında tutuldu.

## Türkçe (birincil dil)

**Ad (30):** Yerim Var: Yemek ve Park

**Alt başlık (30):** Otopark bul, yemek bul

**Anahtar kelimeler (100):**
```
park yeri,boş yer,ispark,izmir,istanbul,ankara,bursa,antalya,otoparkı,lokanta,mekan,ücret
```

**Tanıtım metni (170, sürüm göndermeden değiştirilebilir):**
> Otopark mı arıyorsun, yemek yeri mi? İkisini ayrı ayrı ya da birlikte bul. İzmir ve İstanbul'da canlı boş yer sayısı. Hesap yok, reklam yok, takip yok.

**Açıklama:**
> Yerim Var iki işi bir arada yapar: park edecek yer bulur, yiyecek yer bulur. İstersen ayrı ayrı, istersen birlikte kullan.
>
> OTOPARK
> • Yakındaki ya da gideceğin semtteki otoparkları sıralar: İzmir ve İstanbul'da canlı boş yer sayısıyla, diğer şehirlerde kapasiteyle.
> • Bilinen yerlerde resmî tarifeyi gösterir.
>
> YEMEK
> • Canın ne çekiyorsa ara: balık, kebap, kahvaltı, künefe ya da bir mekânın adı.
> • Her yerin yanında, istersen en yakın otoparka kaç dakika yürüneceği de yazar.
>
> YERİM ASİSTANI
> • Kendi cümlenle sor: "Kadıköy'de otopark", "Alsancak'ta akşam balık" ya da "Bornova'da yanında otoparkı olan kahvaltı yeri".
> • Park ettiğin yeri ve süreyi hatırlar; istersen süre dolmadan hatırlatır, kilit ekranında süreyi gösterir.
> • Yol tarifini sevdiğin uygulamada açar: Apple Haritalar, Google Haritalar, Yandex Navigasyon ya da Waze.
>
> ŞEHİRLER
> İzmir, İstanbul, Ankara, Bursa ve Antalya.
>
> GİZLİLİK
> Hesap açman gerekmez. Reklam ve takip yoktur. Konumun sunucumuza gönderilmez. Yerim'e yazdığın mesajlar, yalnızca sen izin verirsen cevap için yapay zekâya gider.
>
> VERİ
> Otopark ve restoran bilgileri açık veriden gelir (İzmir Büyükşehir Belediyesi, İSPARK, OpenStreetMap). Uygulama resmî bir belediye uygulaması değildir. Bir yer kapanmışsa ya da bilgisi yanlışsa uygulamadan bildirebilirsin.

**Bu sürümde yenilikler (ilk sürüm):**
> Yerim Var'ın ilk sürümü: otopark ve yemek arama, canlı boş yer sayısı ve Yerim asistanı.

**Kategori:** Birincil: Yemek ve İçecek · İkincil: Navigasyon

**Yaş sınırı:** 4+ (yapay zekâ sohbeti için Apple'ın sorduğu "kullanıcı içeriği" sorularını
dürüstçe yanıtla; sohbet kişiler arası değil).

**Destek adresi:** `https://yerimvar.app` · **Gizlilik adresi:** `https://yerimvar.app/gizlilik`

**Fiyat:** Ücretsiz · **Satış ülkeleri:** önce yalnızca Türkiye (AB'de satış için "trader status"
beyanı gerekir; Türkiye'de gerekmez).

### App Privacy formu (App Store Connect → App Privacy)
- Veri toplama: **Evet, toplanıyor**.
- **Identifiers → Device ID:** Uygulama işlevi (günlük ✨ hakkı sayacı). Kimliğe bağlı değil, takip yok.
- **User Content → Other User Content:** Uygulama işlevi (Yerim'e yazılan mesajlar, yer bildirimleri).
  Kimliğe bağlı değil, takip yok.
- **Diagnostics → Crash Data:** Uygulama işlevi (uygulama hata verirse hata mesajı ve sürüm).
  Kimliğe bağlı değil, takip yok.
- Konum: **toplanmıyor** (konum cihazda kalır, sunucuya gitmez).
- Takip (tracking): **Hayır**.

### TestFlight → Test Information (dış test için)
**Beta App Description:**
> Yerim Var iki işi bir arada yapar: otopark bulur, yemek yeri bulur; ayrı ayrı ya da birlikte kullanılır. İzmir, İstanbul, Ankara, Bursa ve Antalya'da çalışır; İzmir ve İstanbul'da canlı boş yer sayısı vardır. Yerim asistanına kendi cümlenle yazabilirsin.

**What to Test:**
> Yemek ya da semt arayıp sonuçlara bak (ör. "Alsancak'ta balık", "Kadıköy'de otopark"). Bir otoparkta "Park ettim" de, hatırlatıcı kur, kilit ekranındaki süreyi ve bildirimi dene. Yerim'e birkaç soru sor. Yanlış ya da kapanmış bir yer görürsen yerin sayfasından bildir; uygulamadaki hatalar için TestFlight'tan ekran görüntüsüyle geri bildirim gönder.

**Feedback Email / Contact:** geliştirici hesabındaki e-posta (herkese görünmez).
**Sign-in required:** Hayır.

### İnceleme notu (App Review Information → Notes)
> Hesap gerekmez; uygulamanın tamamı giriş yapmadan denenebilir. Konum izni isteğe bağlıdır: izin verilmezse şehir merkezine göre sonuç gösterilir. Yerim asistanı (yapay zekâ) ilk kullanımda açık onay ister; günde 10 ücretsiz mesajla sınırlıdır. Canlı otopark verisi İzmir ve İstanbul'da vardır; denemek için şehir olarak İzmir seçilebilir. Uygulama herhangi bir kamu kurumunu temsil etmez; veriler açık veri lisanslarıyla kullanılır.

### Ekran görüntüsü başlıkları (6.9" iPhone, sırayla)
1. **Boş yeri gitmeden gör** — otopark listesi, canlı boş yer sayısıyla
2. **Canın ne çekiyorsa bul** — yemek listesi (balık, kebap, kahvaltı…)
3. **Kendi cümlenle sor** — Yerim sohbeti, örnek bir cevapla
4. **Arabanı ve süreni unutma** — aktif park kartı ve hatırlatıcı
5. **Reklam yok, hesap yok, takip yok** — profil/gizlilik ekranı

## English

**Name (30):** Yerim Var: Food & Parking

**Subtitle (30):** Find parking, find food

**Keywords (100):**
```
parking,car park,ispark,izmir,istanbul,ankara,bursa,antalya,dinner,free spot,turkey,places
```

**Promotional text (170):**
> Looking for a car park or a place to eat? Find either one, or both together. Live free spaces in İzmir and İstanbul. No account, no ads, no tracking.

**Description:**
> Yerim Var does two jobs: it finds a place to park and a place to eat. Use them on their own or together.
>
> PARKING
> • Lists car parks near you or in the area you're going to: live free spaces in İzmir and İstanbul, capacity elsewhere.
> • Shows the official tariff where we have it.
>
> FOOD
> • Search for what you feel like: fish, kebab, breakfast, künefe or a place's name.
> • Each place can also show how many minutes you walk from the nearest car park.
>
> YERIM ASSISTANT
> • Ask in your own words: "parking in Kadıköy", "fish dinner in Alsancak" or "breakfast in Bornova with parking nearby".
> • Remembers where you parked and for how long; can remind you before time runs out and shows the timer on the Lock Screen.
> • Opens directions in the app you like: Apple Maps, Google Maps, Yandex Navi or Waze.
>
> CITIES
> İzmir, İstanbul, Ankara, Bursa and Antalya.
>
> PRIVACY
> No account needed. No ads, no tracking. Your location is never sent to our server. Messages to Yerim go to an AI model only if you allow it.
>
> DATA
> Car park and restaurant data comes from open data (İzmir Metropolitan Municipality, İSPARK, OpenStreetMap). This is not an official municipal app. If a place has closed or its info is wrong, you can report it in the app.

**What's New (first release):**
> The first release of Yerim Var: car park and food search, live free spaces and the Yerim assistant.

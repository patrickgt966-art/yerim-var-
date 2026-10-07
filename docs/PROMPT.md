# Yerim Var — Claude Code geliştirme brifi

Proje: "Yerim Var" — İzmir için boş otopark bulma uygulaması. iOS, App Store hedefli, açık kaynak (MIT). Bu repo: `patrickgt966-art/yerim-var-`.

## Amaç
Kullanıcı gideceği yeri yazar ve çevredeki otoparkları görür: boş yer sayısı, ücret ve yürüme süresi. Bu bir NAVİGASYON uygulaması DEĞİL, park uygulaması. Uygulamada yol tarifi yok. "Buraya park et" butonu Apple Haritalar'ı açar: Linking ile `http://maps.apple.com/?daddr=<lat>,<lng>&dirflg=d`.

## Repoda hazır olanlar
- `design/1-baslangic.{png,html}`, `design/2-arama.{png,html}`, `design/3-sonuc.{png,html}`: referans ekranlar. Birebir takip et. HTML'lerdeki renk, ölçü ve animasyon değerlerini (keyframe süreleri, `prefers-reduced-motion`) kaynak kabul et.
- `design/yerim-var-icon-1024.png`: ALFA KANALI VAR, App Store reddeder. `scripts/build-icons` ile `assets/brand/icon.svg`'den alfasız 1024×1024 PNG üret.
- `design/yerim-var-android-foreground-432.png`: v1 yalnız iOS. Android için sakla, app.json'a bağlama.
- `docs/inspiration.md`: benzer açık kaynak uygulamaların incelemesi ve İzmir API ön bulguları. Önce bunu oku. GPL/AGPL kodu KOPYALAMA, yalnız fikir al.

## Stack
- Expo (güncel SDK) + TypeScript (strict) + Expo Router
- react-native-maps (iOS'ta Apple Maps), expo-location, react-native-svg
- @gorhom/bottom-sheet (+ reanimated, gesture-handler)
- Zustand (persist + AsyncStorage), TanStack Query
- i18next + expo-localization (Türkçe; metinler koda gömülmez)
- jest-expo + @testing-library/react-native, ESLint + Prettier, npm (lockfile commit edilir)
- Hesap ve backend YOK (v1)

## Marka ve tasarım sistemi
- Renkler: navy #0B3C49, turuncu #FF8A1F, açık turuncu #FFB27A, sarı #FFE08A, krem #FFF1E3, yüzey #F4F7F8, çizgi #D3DCDF, ikincil metin #5C7580
- Doluluk: çok boş #0E7C6B, az #B45309, dolu #B91C1C
- Fontlar: Bricolage Grotesque (başlık/rakam), Plus Jakarta Sans (gövde); @expo-google-fonts, OFL
- Motifler:
  - kesik çizgili park yeri çerçevesi
  - asimetrik köşe (22/22/22/6)
  - yer şeridi: 10 hücre; dolu gri, boş yeşil/turuncu kesik çizgili; yanında "14 / 60"
  - park yeri şeklinde pin: P + sayı, doluluk rengine göre; harita üzerinde çizgili alan
  - P rozeti
- İzmir dokusu: Asansör, Saat Kulesi, vapur, Körfez silueti (SVG)
- Marka işareti: kesik çizgili U park yerinde yukarıdan turuncu araba. Yüz/ağız/gülümseyen pin YOK
- Tokenlar tek yerde (`src/theme`), karanlık mod paleti dahil. Tasarımı olmayan ekranlarda mevcut dili sürdür ve README'de listele

## Ekranlar (v1)
1. **Başlangıç** (`1-baslangic`): animasyonlu park alanı, P tabelası, `yerim [var!]` wordmark, "Gideceğin yerin yanında boş park yeri bul.", "Başla". Animasyonlar Reduce Motion açıkken kapanır. Konum izni açıklama ekranından sonra istenir. Reddedilirse uygulama aramayla çalışmaya devam eder.
2. **Arama** (`2-arama`):
   - "Nereye park edeceksin?" + arama kutusu (expo-location geocode/MapKit; ücretli/anahtarlı servis yok)
   - "Şimdi park" / "2 saat park" çipleri (tahmini ücreti etkiler)
   - Ev/İş Ekle (yerel)
   - "İzmir'de popüler yerler": Saat Kulesi, Kordon, Kemeraltı, Karşıyaka İskelesi
   - "Aktif park" kartı (ad, not örn. "Kat 2 · B-14", geçen süre, tahmini ücret)
   - Tab bar: Ara, Harita, ortada "Hemen bul" (konuma en yakın, boş yeri olan otopark), Favoriler, Profil
   - Profil: hesap yok; ayarlar, veri kaynakları + son güncelleme, açık kaynak lisansları, gizlilik, GitHub bağlantısı
3. **Sonuç** (`3-sonuc`):
   - üst bar: geri, konum adı, filtre
   - harita + bottom sheet: "12 otopark · 41 boş yer", "Alsancak'a yürüme mesafesine göre"
   - filtre çipleri: Tümü / Kapalı / İskeleye yakın / Şarj. Verisi olmayan filtreyi gizle, uydurma
   - ilk kart vurgulu: "En yakın", "Güncellendi: HH:mm" / "Bilinmiyor", ad, "~2 dk yürüyüş · ₺60/saat · Kapalı · 7/24", yer şeridi, büyük boş yer sayısı, "Buraya park et", "Detay"
   - yürüme süresi mesafeden tahmin edilir ve "~" ile gösterilir
4. **Detay**: saatlik tarife, çalışma saatleri, kapasite, "Resmi tarife / Tahmini", kaynak + son güncelleme. "Bildir" butonu önceden doldurulmuş bir GitHub issue ("fiyat/veri yanlış" şablonu) açar.
5. **Favoriler ve aktif park**: başlangıç saati, süre ve tahmini ücret sayacı (yerel). Bildirim veya arka plan işi yok.

## Veri
- Kaynak: İzmir Büyükşehir Açık Veri Portalı (acikveri.bizizmir.com), "Otopark Doluluk ve Lokasyon Bilgileri".
- İLK İŞ: `docs/inspiration.md`'deki API bulgularını kendin tekrar doğrula. API'yi gerçekten çağır, ham örneği `docs/data-source.md`'ye koy ve şunları raporla:
  - endpoint, şema ve alan tipleri
  - güncelleme sıklığı (aralıklı iki çağrı)
  - fiyat alanı var mı
  - kimlik doğrulama/CORS
  - veri lisansı ve atıf şartı
  Erişemiyorsan dur ve sor.
- Ön bulgular (`docs/inspiration.md`, canlı doğrulanmadı):
  - Muhtemel uç nokta `GET https://openapi.izmir.bel.tr/api/ibb/izum/otoparklar`: anonim, JSON dizi.
  - Kayıtlarda **zaman damgası yok**, kapasite `free + occupied`'dan türetilir.
  - **Fiyat tutarı yok**, yalnızca `isPaid` var. Tarifeler ayrı ve 2022 tarihli bir CKAN kaynağında, otopark adıyla eşleşiyor.
- KARAR (onaylandı): Kaynak zaman damgası vermediği için tazelik istemcideki `fetchedAt` ile ölçülür.
  - Kartlarda "Canlı" yerine "Güncellendi: HH:mm" yazar.
  - Veri 15 dakikadan eskiyse veya alınamadıysa, boş yer sayısı yerine "Bilinmiyor" yazar.
  - Mock veride "Örnek veri" yazar.
  - "Canlı" etiketi ancak kaynak gerçek bir ölçüm zamanı verirse kullanılır.
  - Bu mantık saf bir fonksiyon olsun ve test edilsin.
- Normalizasyon Zod ile yapılır. Bozuk kayıt atılır, şema kayarsa son başarılı önbellek "çevrimdışı" etiketiyle gösterilir.
- Çekme: ~120 sn, yalnız uygulama ön plandayken; pull-to-refresh; 10 sn zaman aşımı, 2 deneme.
- Veri lisansı CC BY 4.0 (doğrula). Atıf ve "Resmî uygulama değildir" notu Profil'de ve README'de yer alır.
- `ParkingProvider` arayüzü + `IzmirOpenDataProvider` + `MockProvider`. API hata verir ya da zaman aşımına uğrarsa mock'a düş ve arayüzde "Örnek veri gösteriliyor" uyarısı göster.
- Model alanları: `id`, `name`, `lat`, `lng`, `capacity`, `free`, `isIndoor`, `openingHours`, `source`, `updatedAt` (ISO), `occupancyKind: 'live'|'estimated'`, `priceKind: 'official'|'estimated'`.
- KURAL: Doğrulanmamış veri asla "Canlı" diye etiketlenmez.
- Fiyatlar `data/tariffs.json` içinde dursun; her kayıtta `validFrom`, `source` (URL) ve `verifiedAt` olsun. Resmi kaynaktan doğrulanmadan "Resmi tarife" yazılmaz.
- Konum ve favoriler cihazdan çıkmaz. Ağa giden tek istek açık veri API'sidir.

## App Store
- `NSLocationWhenInUseUsageDescription`: "Yakınındaki boş otoparkları göstermek için konumunu kullanırız." Arka plan konumu YOK.
- Analitik, reklam veya crash SDK'sı yok. Hesap zorunluluğu yok.
- Gizlilik manifesti `ios.privacyManifests` ile (required-reason API'ler beyan edilir).
- HIG:
  - dokunma alanı ≥44pt, yazı ≥12pt
  - safe area'lara uy
  - Dynamic Type bozulmaz
  - karanlık modda okunabilir
- Erişilebilirlik:
  - butonlarda Türkçe `accessibilityLabel`
  - renk tek başına anlam taşımaz
  - yer şeridi tek öğe olarak okunur: "60 yerden 14'ü boş"
- app.json:
  - ad: "Yerim Var: Otopark Bul" (ana ekranda "Yerim Var")
  - `com.yerimvar.app` (taslak)
  - `supportsTablet: false`
  - `ITSAppUsesNonExemptEncryption: false`

## Açık kaynak
- Kod lisansı MIT (`LICENSE` hazır). Font OFL lisansları `licenses/` altına konur. İzmir açık veri atfı README'de ve Profil'de yer alır.
- `TRADEMARKS.md`: ad, logo ve ikon MIT dışında; fork'lar başka ad ve ikon kullanır.
- Eklenecekler:
  - `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` (Contributor Covenant), `SECURITY.md`
  - `.github/ISSUE_TEMPLATE/` (hata, özellik, fiyat/veri yanlış)
  - `.github/pull_request_template.md`
- CI (`.github/workflows/ci.yml`): `npm ci`, lint, `tsc --noEmit`, testler.
- Repoya sır veya `.env` girmez. Conventional Commits; her adım ayrı commit, ayrı PR.

## Çalışma şekli
1. Kısa bir plan göster (klasör yapısı, bileşenler, veri modeli). Onay beklemeden iskeleti kur.
2. Sıra:
   1. Veri doğrulama
   2. Tokenlar + ParkingCard, SlotStrip, PPin, BottomSheet
   3. Arama
   4. Sonuç
   5. Detay
   6. Favoriler / aktif park
   7. Başlangıç animasyonları
   8. İkonlar + app.json
   9. Açık kaynak dosyaları
3. Her adımın sonunda doğrula:
   - `npx tsc --noEmit`
   - `npm run lint`
   - `npm test`
   - `npx expo-doctor`
   - `npx expo export --platform ios`
   Hepsi temiz olmadan ilerleme.
4. README'ye şunları yaz:
   - çalıştırma adımları
   - veri bulguları
   - App Store öncesi eksikler: Developer hesabı, gerçek bundle ID, gizlilik politikası URL'si, ekran görüntüleri, doğrulanmamış tarifeler, cihazda test
5. Durup SOR: API erişilemiyorsa, tarife doğrulanamıyorsa, tasarım bu metinle çelişiyorsa, yeni bir dış servis veya SDK gerekiyorsa. Diğer küçük teknik kararlarda makul varsayılanla ilerle ve README'ye not düş.

## Alt ajan: benzer uygulamalardan esinlenme
Bir bileşeni veya veri katmanını yazmadan önce, model olarak **Sonnet 5.5** kullanan bir alt ajan (Agent aracı, `model: "sonnet"`) başlat. Ajan arka planda çalışsın ve şunu yapsın:
- O konunun açık kaynak örneklerinin gerçek kaynak koduna baksın. Örnek kaynaklar: ParkAPI/ParkenDD, şehir açık veri park uygulamaları, react-native-maps + bottom sheet örnekleri.
- Bakılacak konular:
  - doluluk verisinin normalizasyonu
  - eski veri ve "Tahmini" etiketi
  - polling/cache aralıkları
  - marker performansı ve kümeleme
  - harita ↔ bottom sheet etkileşimi
  - erişilebilirlik
  - Apple Haritalar deep link
- Bulguları `docs/inspiration.md`'ye eklesin: repo URL'si, lisans, dosya yolu, önerilen uygulama.
- Yalnızca MIT/Apache/BSD kodu uyarlanabilir; uyarlanan her yer atıfla işaretlenir. GPL/AGPL'den yalnız fikir alınır.
- Esinlenmeye gerek yoksa "gerek yok" desin; zorla bir şey uydurmasın.

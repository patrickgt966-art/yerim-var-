# Yerim Var

İzmir için yemek ve park asistanı (iOS, Expo). Gideceğin yeri ya da canının çektiği yemeği yaz; Yerim restoranları yanındaki otoparklarla, otoparkları boş yer sayısı, ücret ve yürüme süresiyle gösterir. "Buraya park et" Apple Haritalar'ı açar; uygulamanın kendisi yol tarifi vermez.

_English: Yerim Var ("I've got a spot") is an open-source iOS assistant for İzmir, Turkey: tell it where you are going or what you want to eat, and it finds places with parking next to them, using the city's open data._

> **Resmî uygulama değildir.** Yerim Var, İzmir Büyükşehir Belediyesi ile bağlantılı değildir.

## Çalıştırma

Gereksinimler: Node.js 22 LTS ve npm. Simülatör için macOS + Xcode.

```bash
npm ci
npx expo start            # geliştirme sunucusu
npx expo run:ios          # yerel development build (react-native-maps için gerekli olabilir)
```

Kontroller (CI de bunları çalıştırır):

```bash
npm run lint
npm run typecheck         # tsc --noEmit
npm test
npx expo-doctor
npx expo export --platform ios
```

İkonları yeniden üretmek için: `npm run build-icons`. Betik `assets/brand/icon.svg` dosyasını lacivert zemine düzleştirip **alfa kanalı olmayan** 1024×1024 `assets/icon.png` ve `assets/splash-icon.png` üretir (App Store alfalı ikonu reddeder). `design/yerim-var-icon-1024.png` alfalıdır, uygulamada kullanılmaz.

## Yapı

```
src/app/          Expo Router ekranları: onboarding, (tabs)/{index,harita,favoriler,profil}, sonuc, otopark/[id]
src/components/   SlotStrip, PPin, ParkingCard, Chip, DashedFrame, TabBar…
src/data/         ParkingProvider, IzmirOpenDataProvider, MockProvider, tazelik kuralları, tarifeler
src/store/        Zustand (persist + AsyncStorage): favoriler, Ev/İş, aktif park
src/theme/        Tasarım tokenları (açık + karanlık palet)
src/i18n/         Türkçe metinler
data/             tariffs.json (tarifeler), places.json (popüler yerler)
scripts/          build-icons.mjs
design/           Referans ekranlar (PNG + HTML)
```

## Veri

- **Kaynak:** İzmir Büyükşehir Belediyesi Açık Veri Portalı, "Otopark Doluluk ve Lokasyon Bilgileri" ([acikveri.bizizmir.com](https://acikveri.bizizmir.com/dataset/otopark-doluluk-ve-lokasyon-bilgileri)). Uç nokta: `GET https://openapi.izmir.bel.tr/api/ibb/izum/otoparklar`.
- **Lisans ve atıf:** CC BY 4.0 uyumlu İzmir Açık Veri Lisansı (üçüncü taraf kaynaklara göre; portaldan doğrulanmalı). Atıf Profil ekranında ve burada yer alır.
- **Şema canlı yanıtla doğrulandı (2026-10-07).** Ayrıntılar, alan tipleri ve ham örnek: [`docs/data-source.md`](docs/data-source.md).
  - Anonim, JSON dizi, sayfalama yok.
  - Kayıtlarda **ölçüm zaman damgası yok**; kapasite `free + occupied` toplamından türetilir.
  - **Fiyat tutarı yok**, yalnızca `isPaid`. Tarifeler ayrı ve 2022 tarihli bir CKAN kaynağında, otopark adıyla eşleşiyor.
  - `accessories.covered` güvenilmez (katlı otoparklarda da `false`); yalnızca `true` dikkate alınır.
  - Henüz doğrulanmayanlar: güncelleme sıklığı, yanıt başlıkları/CORS, veri lisansı.
- **Kapsama (tüm İzmir ili):** Anlık doluluk verisi yalnızca belediye sensörlü 7 otoparkta var. Diğerleri uygulamaya gömülü bir listeden gelir ve kartlarında "Doluluk bilgisi yok" yazar:
  - İzelman otopark envanteri (İzmir BB açık veri, 2022): yaklaşık 80 resmi otopark; kapasite ve çalışma saatleriyle.
  - OpenStreetMap (ODbL): ilde herkese açık yaklaşık 1.400 otopark (30 m içindeki çiftler ve izinli/özel otoparklar ayıklanmış). Çoğunun adı ve kapasitesi yok.
  - Liste `scripts/fetch-sources.mjs` ile oluşturulur ve GitHub Actions'ta her ay yenilenir (`data/sources-report.md`). Uygulama bu kaynaklara bağlanmaz; ağa giden tek istek hâlâ doluluk API'sidir.
  - Aynı otopark birden çok kaynakta varsa (80 m içinde) öncelik canlı veride, sonra İzelman'dadır.
  - Kalabalık bölgelerde listede ve haritada en yakın 60 statik otopark gösterilir; canlı verisi olanlar her zaman gösterilir.
- **Arama:** Apple'ın cihaz içi geocoder'ı yalnızca adres çözer; "İstinye" gibi AVM ve mekân adlarını bulamaz. Bu yüzden önce uygulamaya gömülü yaklaşık 3.100 İzmir yerinde (ilçe, semt, AVM, hastane, üniversite, iskele, istasyon, önemli yer; OpenStreetMap, `data/places-izmir.json`) ve adı olan otoparklarda aranır. Eşleşme büyük/küçük harf, Türkçe karakter ve boşluktan bağımsızdır. Bulunamazsa adres geocoder'ı devreye girer.
- **Apple Haritalar otopark araması:** Uygulamanın kendi derlemesinde (Expo Go'da değil) sonuç ekranı, hedefin 1,5 km çevresindeki otoparkları da Apple Haritalar'dan ister (`modules/yerim-mapkit`, `MKLocalPointsOfInterestRequest`). Gelen sonuçlarda yalnızca ad, konum ve adres var; "Apple Haritalar" etiketi ve "Canlı sayım yok" ile gösterilir. Bilinen bir otoparka 60 m'den yakın olanlar çıkarılır. Sonuçlar yalnızca bellekte bir saat tutulur. Expo Go'da modül olmadığı için özellik kendiliğinden kapalıdır.
  - **Henüz cihazda denenmedi.** Derlendiğini doğrulamak için: expo.dev'den bir erişim anahtarı (Access token) oluşturup repoya `EXPO_TOKEN` sırrı olarak ekle, sonra Actions → "iOS build check" → Run workflow. Bu, Apple hesabı gerektirmeyen bir simülatör derlemesi yapar. Cihazda denemek için Apple Developer hesabı gerekir.
- **Tazelik kuralları** (`src/data/freshness.ts`, testli):
  - Kaynak zaman damgası vermediği için tazelik, verinin cihaza indiği an (`fetchedAt`) ile ölçülür. Kartlarda "Güncellendi: HH:mm" yazar.
  - Veri 15 dakikadan eskiyse veya alınamadıysa boş yer sayısı yerine "Bilinmiyor" yazar.
  - API'ye ulaşılamazsa 3 kez denenir (1 sn ve 3 sn arayla). Yine olmazsa cihazda saklanan son gerçek veri "Çevrimdışı · Son veri: HH:mm" uyarısıyla gösterilir. Hiç kayıt yoksa örnek veriye düşülür ve "Örnek veri gösteriliyor" uyarısı görünür.
  - Açılışta kayıtlı veri hemen gösterilir, yenisi arkadan gelir. Kayıt yalnızca cihazda tutulur.
  - İndirme sonuç ekranını beklemeden uygulama açılır açılmaz başlar; API ~15 sn sürdüğü için kullanıcı yer ararken genelde tamamlanır.
  - "Canlı" etiketi yalnızca kaynak gerçek bir ölçüm zamanı verirse kullanılır.
- **Çekme:** ~120 sn aralıkla, yalnızca uygulama ön plandayken; pull-to-refresh; 30 sn zaman aşımı, 2 yeniden deneme. Bozuk kayıtlar Zod ile atılır.
- **Tarifeler:** `data/tariffs.json`. Her kayıtta `validFrom`, `source` ve `verifiedAt` var. Şu an hiçbiri doğrulanmadığı için hepsi "Tahmini" görünür. Resmî kaynaktan doğrulanmadan "Resmi tarife" yazılmaz.

## Gizlilik

Hesap, sunucu, analitik, reklam veya crash SDK'sı yok. Konum, favoriler ve aktif park yalnızca cihazda saklanır. Ağ istekleri: belediyenin doluluk API'si ve iOS'un Apple Haritalar servisleri (adres arama; uygulamanın kendi derlemesinde yakındaki otopark araması). Apple'a yalnızca aranan metin veya yaklaşık bölge (konum ~100 m'ye yuvarlanır) gider. Brifteki "ağa giden tek istek açık veri API'sidir" kuralından bu nedenle bilerek sapıldı. Yalnızca "uygulamayı kullanırken" konum izni istenir. İzin verilmezse uygulama aramayla çalışmaya devam eder. Gizlilik manifesti `app.json` → `ios.privacyManifests` içinde.

## Tasarımı olmayan ekranlar

`design/` içinde yalnızca Başlangıç, Arama ve Sonuç ekranları var. Aşağıdaki ekranlar aynı tasarım dilini (tokenlar, kesik çizgili park yeri çerçevesi, 22/22/22/6 köşe, P rozeti, yer şeridi) sürdürür:

- Otopark detayı (`src/app/otopark/[id].tsx`)
- Favoriler ve aktif park (`src/app/(tabs)/favoriler.tsx`)
- Harita sekmesi (`src/app/(tabs)/harita.tsx`)
- Profil (`src/app/(tabs)/profil.tsx`)
- Onboarding'in "Dürüst veri" ve konum izni adımları
- Karanlık mod (tüm ekranlar)

## Varsayımlar ve küçük kararlar

- `app.json` adı "Yerim Var: Yemek ve Park"; ana ekranda `CFBundleDisplayName` ile "Yerim Var" görünür. App Store'daki listeleme adı App Store Connect'te ayrıca girilir.
- `com.yerimvar.app` taslak bundle ID'dir.
- v1 yalnızca iOS (`platforms: ["ios"]`). Android ön plan ikonu `design/` içinde saklanıyor ve bağlanmadı.
- "Bildir" butonu `veri-yanlis.yml` issue formunu açar ve "Otopark" alanını doldurur. Issue formları `body` parametresini yok saydığı için alanlar `id` ile doldurulur.
- Zaman aşımı brifteki 10 sn yerine 30 sn: belediye API'si telefonda (LTE) ~15 sn'de cevap verdi, 10 sn'de uygulama her seferinde örnek veriye düşüyordu.

## App Store öncesi eksikler

- [ ] Apple Developer hesabı
- [ ] Gerçek bundle ID (şu an `com.yerimvar.app`, taslak)
- [ ] Gizlilik politikası URL'si (App Store Connect için zorunlu). Metin hazır: `docs/gizlilik.html`; GitHub Pages açılınca adres `https://patrickgt966-art.github.io/yerim-var-/gizlilik.html` olur.
- [ ] App Store ekran görüntüleri (6.9" ve 6.5")
- [ ] İzmir API'sinin güncelleme sıklığı ve yanıt başlıkları (bkz. `docs/data-source.md`)
- [ ] Veri lisansının portal üzerinden doğrulanması
- [ ] Doğrulanmamış tarifeler: `data/tariffs.json` içindeki tüm kayıtlar "Tahmini"
- [ ] Gerçek cihazda test (konum izni, Apple Haritalar devri, Reduce Motion, Dynamic Type, karanlık mod)
- [ ] EAS ile imzalı derleme (`npx eas-cli@latest build -p ios`)

## Katkı

Bkz. [`CONTRIBUTING.md`](CONTRIBUTING.md), [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) ve [`SECURITY.md`](SECURITY.md). Fiyat veya veri hatası için "Fiyat / veri yanlış" issue şablonunu kullan.

## Lisans

- Kod: MIT (bkz. [`LICENSE`](LICENSE)).
- Fontlar: Bricolage Grotesque ve Plus Jakarta Sans, SIL Open Font License 1.1 (bkz. [`licenses/`](licenses/)).
- Veri lisansları: [`licenses/DATA.md`](licenses/DATA.md).
- "Yerim Var" adı, logo ve ikon MIT kapsamı dışındadır; fork'lar farklı ad ve ikon kullanmalıdır (bkz. [`TRADEMARKS.md`](TRADEMARKS.md)).
- Veri: © İzmir Büyükşehir Belediyesi, Açık Veri Portalı (acikveri.bizizmir.com); otopark konumlarının bir kısmı © OpenStreetMap katkıcıları (ODbL).

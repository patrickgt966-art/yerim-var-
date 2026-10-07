# Yerim Var

İzmir için boş otopark bulma uygulaması (iOS, Expo). Gideceğin yeri yaz, çevredeki otoparkları boş yer sayısı, ücret ve yürüme süresiyle gör. "Buraya park et" Apple Haritalar'ı açar; uygulamanın kendisi yol tarifi vermez.

_English: Yerim Var ("I've got a spot") is an open-source iOS app for finding free parking spaces in İzmir, Turkey, using the city's open data._

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
- **Tazelik kuralları** (`src/data/freshness.ts`, testli):
  - Kaynak zaman damgası vermediği için tazelik, verinin cihaza indiği an (`fetchedAt`) ile ölçülür. Kartlarda "Güncellendi: HH:mm" yazar.
  - Veri 15 dakikadan eskiyse veya alınamadıysa boş yer sayısı yerine "Bilinmiyor" yazar.
  - API'ye ulaşılamazsa 3 kez denenir (1 sn ve 3 sn arayla). Yine olmazsa cihazda saklanan son gerçek veri "Çevrimdışı · Son veri: HH:mm" uyarısıyla gösterilir. Hiç kayıt yoksa örnek veriye düşülür ve "Örnek veri gösteriliyor" uyarısı görünür.
  - Açılışta kayıtlı veri hemen gösterilir, yenisi arkadan gelir. Kayıt yalnızca cihazda tutulur.
  - "Canlı" etiketi yalnızca kaynak gerçek bir ölçüm zamanı verirse kullanılır.
- **Çekme:** ~120 sn aralıkla, yalnızca uygulama ön plandayken; pull-to-refresh; 10 sn zaman aşımı, 2 yeniden deneme. Bozuk kayıtlar Zod ile atılır.
- **Tarifeler:** `data/tariffs.json`. Her kayıtta `validFrom`, `source` ve `verifiedAt` var. Şu an hiçbiri doğrulanmadığı için hepsi "Tahmini" görünür. Resmî kaynaktan doğrulanmadan "Resmi tarife" yazılmaz.

## Gizlilik

Hesap, sunucu, analitik, reklam veya crash SDK'sı yok. Konum, favoriler ve aktif park yalnızca cihazda saklanır. Ağa giden tek istek açık veri API'sidir. Yalnızca "uygulamayı kullanırken" konum izni istenir. İzin verilmezse uygulama aramayla çalışmaya devam eder. Gizlilik manifesti `app.json` → `ios.privacyManifests` içinde.

## Tasarımı olmayan ekranlar

`design/` içinde yalnızca Başlangıç, Arama ve Sonuç ekranları var. Aşağıdaki ekranlar aynı tasarım dilini (tokenlar, kesik çizgili park yeri çerçevesi, 22/22/22/6 köşe, P rozeti, yer şeridi) sürdürür:

- Otopark detayı (`src/app/otopark/[id].tsx`)
- Favoriler ve aktif park (`src/app/(tabs)/favoriler.tsx`)
- Harita sekmesi (`src/app/(tabs)/harita.tsx`)
- Profil (`src/app/(tabs)/profil.tsx`)
- Onboarding'in "Dürüst veri" ve konum izni adımları
- Karanlık mod (tüm ekranlar)

## Varsayımlar ve küçük kararlar

- `app.json` adı "Yerim Var: Otopark Bul"; ana ekranda `CFBundleDisplayName` ile "Yerim Var" görünür. App Store'daki listeleme adı App Store Connect'te ayrıca girilir.
- `com.yerimvar.app` taslak bundle ID'dir.
- v1 yalnızca iOS (`platforms: ["ios"]`). Android ön plan ikonu `design/` içinde saklanıyor ve bağlanmadı.
- "Bildir" butonu `veri-yanlis.yml` issue formunu açar ve "Otopark" alanını doldurur. Issue formları `body` parametresini yok saydığı için alanlar `id` ile doldurulur.

## App Store öncesi eksikler

- [ ] Apple Developer hesabı
- [ ] Gerçek bundle ID (şu an `com.yerimvar.app`, taslak)
- [ ] Gizlilik politikası URL'si (App Store Connect için zorunlu)
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
- "Yerim Var" adı, logo ve ikon MIT kapsamı dışındadır; fork'lar farklı ad ve ikon kullanmalıdır (bkz. [`TRADEMARKS.md`](TRADEMARKS.md)).
- Veri: © İzmir Büyükşehir Belediyesi, Açık Veri Portalı (acikveri.bizizmir.com), CC BY 4.0.

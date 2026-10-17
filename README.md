# Yerim Var

İzmir, İstanbul, Ankara, Bursa ve Antalya için yemek ve park asistanı (iOS, Expo). Şehir onboarding'de ve Profil'de seçilir. Gideceğin yeri ya da canının çektiği yemeği yaz; Yerim restoranları yanındaki otoparklarla, otoparkları boş yer sayısı, ücret ve yürüme süresiyle gösterir. "Buraya park et" Apple Haritalar'ı açar; uygulamanın kendisi yol tarifi vermez.

_English: Yerim Var ("I've got a spot") is an open-source iOS assistant for İzmir, İstanbul, Ankara, Bursa and Antalya (Turkey): tell it where you are going or what you want to eat, and it finds places with parking next to them, using open data (live car park occupancy in İzmir and İstanbul)._

> **Resmî uygulama değildir.** Yerim Var; İzmir Büyükşehir Belediyesi, İBB / İSPARK ve verisini kullandığı diğer kurumlarla bağlantılı değildir.

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
src/app/          Expo Router ekranları: onboarding, (tabs)/{index,harita,favoriler,profil}, sohbet, sonuc,
                  otopark/[id], restoranlar, restoran/[id], ara, yer-ara, konum-sec
src/components/   BrandWordmark, CityPicker, ParkingCard, SlotStrip, PPin, TabBar, home/ (HomeSkyline…),
                  chat/, coach/ (ilk açılış ipuçları)…
src/data/         cities.ts (şehirler), cityData.ts (şehir başına gömülü dosyalar), repository.ts,
                  IzmirOpenDataProvider, IsparkProvider, MockProvider, tazelik kuralları, tarifeler
src/lib/ai/       Yerim ✨ istemcisi ve sunucuyla ortak protokol
src/store/        Zustand (persist + AsyncStorage): favoriler, Ev/İş, aktif park, şehir, ✨ hakkı, ipuçları
src/theme/        Tasarım tokenları (açık + karanlık palet)
src/i18n/         Türkçe metinler
data/             Şehir başına otopark, yer, raylı istasyon ve restoran dosyaları; tariffs.json
server/yerim-ai/  Yerim ✨ için Cloudflare Worker
modules/          yerim-mapkit (Apple Haritalar araması, yerel modül)
scripts/          build-icons.mjs, fetch-sources.mjs, fetch-overture.py, fetch-ispark-sample.mjs, ai-eval.ts
design/           Referans ekranlar (PNG + HTML)
```

## Veri

**Şehirler** (`src/data/cities.ts`): İzmir, İstanbul, Ankara, Bursa ve Antalya. Beşi de açık.

| Şehir    | Canlı doluluk                            | Otopark |   Yer | Raylı istasyon | Restoran (OSM + Overture) |
| -------- | ---------------------------------------- | ------: | ----: | -------------: | ------------------------: |
| İzmir    | İzmir BB açık veri (sensörlü ~7 otopark) |   1.489 | 3.510 |            165 |            2.435 + 12.809 |
| İstanbul | İBB / İSPARK (~243 otopark)              |   4.681 | 7.259 |            296 |            5.055 + 36.412 |
| Ankara   | yok                                      |   2.526 | 3.825 |            167 |               798 + 9.678 |
| Bursa    | yok                                      |     560 | 1.716 |             89 |               263 + 6.965 |
| Antalya  | yok                                      |   1.204 | 3.034 |             70 |             1.220 + 9.092 |

- Ankara, Bursa ve Antalya'da canlı kaynak yok. Otoparklar OpenStreetMap'ten kapasite bilgisiyle gelir; uygulama arıza uyarısı yerine sakin bir not gösterir ve doluluk için ağa istek atmaz. Bursa için Bursa BB açık veri portalındaki (Açık Yeşil, CKAN) "otopark" veri seti isteğe bağlı kaynak olarak denenir; son çalışmada alınamadı.
- Gömülü dosyalar `scripts/fetch-sources.mjs` (OpenStreetMap, İzmir açık veri, Bursa Açık Yeşil) ve `scripts/fetch-overture.py` (Overture Maps restoranları) ile üretilir. GitHub Actions bunları her ayın 1'inde çalıştırır (`.github/workflows/data-refresh.yml`); rapor `data/sources-report.md`. Overpass sorguları şehir başına kutulara bölünür ve tekrar denenir.
- **Overture restoranları:** her şehirde güven eşiği 0,7; şehir dosyası en fazla 10 MB; zayıf kayıtlar için sıkı kural (şehrin kendi alan kodlu telefonu, web sitesi, sosyal hesap ya da ikinci kaynak); web sitesi kontrolü; kara liste (`data/overture-blocklist.json`). Her Overture yerinde "Bilgi eski olabilir" yazar.

### İzmir

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
  - Liste `scripts/fetch-sources.mjs` ile oluşturulur ve GitHub Actions'ta her ay yenilenir (`data/sources-report.md`). Uygulama bu kaynaklara bağlanmaz; otopark için ağa giden tek istek seçili şehrin doluluk API'sidir.
  - Aynı otopark birden çok kaynakta varsa (80 m içinde) öncelik canlı veride, sonra İzelman'dadır.
  - Kalabalık bölgelerde listede ve haritada en yakın 60 statik otopark gösterilir; canlı verisi olanlar her zaman gösterilir.

### İstanbul

- İBB Açık Veri / İSPARK otopark doluluğu (`GET https://api.ibb.gov.tr/ispark/Park`): ~243 otopark, boş yer sayısıyla. İstanbul seçildiğinde boş yer sayıları buradan gelir. Şema açık kaynak istemcilerden alındı; GitHub Actions'tan çekilen canlı örnekle (`data/raw/ispark-sample.json`) uyuşuyor.
- `ParkDetay?id=` uç noktası tarife ve aylık abonelik ücretini de veriyor (`data/raw/ispark-detail-sample.json`); uygulama henüz kullanmıyor.
- Diğer otoparklar OpenStreetMap'ten gelir (4.681).

### Ortak

- **Arama:** Apple'ın cihaz içi geocoder'ı yalnızca adres çözer; "İstinye" gibi AVM ve mekân adlarını bulamaz. Bu yüzden önce seçili şehrin gömülü yer listesinde (İzmir'de yaklaşık 3.500 yer: ilçe, semt, AVM, hastane, üniversite, iskele, istasyon, önemli yer; OpenStreetMap, `data/places-<şehir>.json`) ve adı olan otoparklarda aranır. Eşleşme büyük/küçük harf, Türkçe karakter ve boşluktan bağımsızdır. Bulunamazsa adres geocoder'ı devreye girer.
- **Apple Haritalar otopark araması:** Uygulamanın kendi derlemesinde (Expo Go'da değil) sonuç ekranı, hedefin 1,5 km çevresindeki otoparkları da Apple Haritalar'dan ister (`modules/yerim-mapkit`, `MKLocalPointsOfInterestRequest`). Gelen sonuçlarda yalnızca ad, konum ve adres var; "Apple Haritalar" etiketi ve "Canlı sayım yok" ile gösterilir. Bilinen bir otoparka 60 m'den yakın olanlar çıkarılır. Sonuçlar yalnızca bellekte bir saat tutulur. Expo Go'da modül olmadığı için özellik kendiliğinden kapalıdır.
  - **Henüz cihazda denenmedi.** Derlendiğini doğrulamak için: expo.dev'den bir erişim anahtarı (Access token) oluşturup repoya `EXPO_TOKEN` sırrı olarak ekle, sonra Actions → "iOS build check" → Run workflow. Bu, Apple hesabı gerektirmeyen bir simülatör derlemesi yapar. Cihazda denemek için Apple Developer hesabı gerekir.
- **Tazelik kuralları** (`src/data/freshness.ts`, testli):
  - Kaynak zaman damgası vermediği için tazelik, verinin cihaza indiği an (`fetchedAt`) ile ölçülür. Kartlarda "Güncellendi: HH:mm" yazar.
  - Veri 15 dakikadan eskiyse veya alınamadıysa boş yer sayısı yerine "Bilinmiyor" yazar.
  - API'ye ulaşılamazsa 3 kez denenir (1 sn ve 3 sn arayla). Yine olmazsa cihazda saklanan son gerçek veri "Çevrimdışı · Son veri: HH:mm" uyarısıyla gösterilir. Hiç kayıt yoksa İzmir'de örnek veriye düşülür ve "Örnek veri gösteriliyor" uyarısı görünür; diğer şehirlerde yalnızca gömülü otoparklar gösterilir.
  - Açılışta kayıtlı veri hemen gösterilir, yenisi arkadan gelir. Kayıt yalnızca cihazda tutulur.
  - İndirme sonuç ekranını beklemeden uygulama açılır açılmaz başlar; API ~15 sn sürdüğü için kullanıcı yer ararken genelde tamamlanır.
  - "Canlı" etiketi yalnızca kaynak gerçek bir ölçüm zamanı verirse kullanılır.
- **Çekme:** ~120 sn aralıkla, yalnızca uygulama ön plandayken; pull-to-refresh; 30 sn zaman aşımı, 2 yeniden deneme. Bozuk kayıtlar Zod ile atılır.
- **Tarifeler:** `data/tariffs.json`. Her kayıtta `validFrom`, `source` ve `verifiedAt` var. Şu an hiçbiri doğrulanmadığı için hepsi "Tahmini" görünür. Resmî kaynaktan doğrulanmadan "Resmi tarife" yazılmaz.

## Yapay zekâ (isteğe bağlı)

Kullanıcı onay verdiyse her sohbet mesajı önce bir Cloudflare Worker üzerinden Claude Haiku'daki yönlendiriciye gider (`server/yerim-ai`, `/understand`). Model önce mesajın ne demek istediğini kısa ve gizli bir cümleyle (`meaning`) yazar, sonra düz bir yapılandırılmış şemayla `search`, `chat` ya da `unknown` döner. Ne istendiği anlaşılmazsa uygulama tahmin etmek yerine "anlayamadım" der.

Yemek aramalarında `/pick`, bizim veriden en çok 40 yeri görür (yakındakiler ve arama alanının biraz dışındaki 10 yer): herkese açık adı ve türü (kategori, beslenme etiketi, tür, mutfak) ile yürüme süresi, otoparka uzaklık, otoparkın ücretsiz olup olmadığı, boş yer ve açık/kapalı bilgisi. Hangilerinin isteğe uyduğunu (`fit`, `noneFit`) değerlendirip birini seçer. Yalnızca sıra numaraları döner; her kart bizim kaydımızdır. Hiçbiri uymuyorsa bunu söyler. Menü verisi yok; uygunluk ad, tür ve varsa beslenme etiketine (OSM `diet:*`, Overture vegan/vejetaryen/helal kategorileri) göre yargılanır. Canlı yapay zekâ sınavı `scripts/ai-eval.ts` yapay zekâ dosyalarına dokunan her PR'da çalışır (GitHub'da `ANTHROPIC_API_KEY` sırrı gerekir).

Cevaplardaki bilgi yalnızca uygulamanın verisinden gelir; modelin serbest metni denetlenir, geçmeyen atılır. Tek sayaç: cihaz başına günde 10 yapay zekâ mesajı (ilk mesaj dahil). Yapay zekâ mesajı okuduysa aramayı onun okuması belirler; uygulamanın kelime kuralları buna bir şey eklemez ya da onu ezmez. Hak bitince, yönlendiriciden 12 sn içinde cevap gelmezse ya da ağ hatası olursa uygulama kendi kurallarıyla cevap verir ve bunu söyler. Geliştirmede expo terminali `[ai] understood: ...` satırını yazar (tür, kategori, yemek; mesaj metni asla).

Sunucudaki her değişiklik `cd server/yerim-ai && npx wrangler deploy` ile yayınlanır (bunu proje sahibi yapar). Sınırları değiştirmek için `server/yerim-ai/wrangler.toml` içindeki `[vars]` değerini düzenleyip yayınlamak yeter; uygulama sürümü çıkarmak gerekmez. Ayrıntılar, kurulum ve günlük izleme (`npx wrangler tail`): [`server/yerim-ai/README.md`](server/yerim-ai/README.md).

## Gizlilik

Hesap, analitik, reklam veya crash SDK'sı yok. Konum, favoriler ve aktif park yalnızca cihazda saklanır. Tek sunucumuz isteğe bağlı Yerim ✨ içindir (`server/yerim-ai`, Cloudflare): kullanıcı onay verirse sohbet mesajı, son birkaç mesaj ve seçili şehrin kimliği yapay zekâya gider; yer seçiminde buna uygulamanın kendi verisinden yakındaki yerlerin herkese açık adı, türü ve şu bilgiler (yürüme süresi, otopark uzaklığı, ücretsiz mi, boş yer, açık mı) eklenir. Koordinat gitmez, hesap yoktur. Sunucu metni kaydetmez; günlük hak sayımı için rastgele bir cihaz kimliğine ve IP adresine bağlı sayaçları en fazla iki gün tutar. Diğer ağ istekleri: seçili şehrin canlı doluluk API'si (İzmir için İzmir Büyükşehir Belediyesi, İstanbul için İBB / İSPARK; Ankara, Bursa ve Antalya'da doluluk isteği yok) ve iOS'un Apple Haritalar servisleri (adres arama; uygulamanın kendi derlemesinde yakındaki otopark araması). Apple'a yalnızca aranan metin veya yaklaşık bölge (konum ~100 m'ye yuvarlanır) gider. Brifteki "ağa giden tek istek açık veri API'sidir" kuralından bu nedenle bilerek sapıldı. Yalnızca "uygulamayı kullanırken" konum izni istenir. İzin verilmezse uygulama aramayla çalışmaya devam eder. Gizlilik manifesti `app.json` → `ios.privacyManifests` içinde.

## Tasarımı olmayan ekranlar

`design/` içinde yalnızca Başlangıç, Arama ve Sonuç ekranları var. Aşağıdaki ekranlar aynı tasarım dilini (tokenlar, kesik çizgili park yeri çerçevesi, 22/22/22/6 köşe, P rozeti, yer şeridi) sürdürür:

- Otopark detayı (`src/app/otopark/[id].tsx`)
- Favoriler ve aktif park (`src/app/(tabs)/favoriler.tsx`)
- Harita sekmesi (`src/app/(tabs)/harita.tsx`)
- Profil (`src/app/(tabs)/profil.tsx`)
- Onboarding'in dört adımı (Merhaba, Şehrini seç, Yerim ile konuş, Konum) ve ana sayfadaki tek seferlik ipucu balonları
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
- Veri: © İzmir Büyükşehir Belediyesi, Açık Veri Portalı (acikveri.bizizmir.com); İstanbul için İBB Açık Veri / İSPARK; otopark, yer ve restoranların bir kısmı © OpenStreetMap katkıcıları (ODbL); restoranların bir kısmı Overture Maps (CDLA-Permissive-2.0).

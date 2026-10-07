# Yerim Var — İlham ve Ön Araştırma Raporu

Tarih: 2026-10-07. Kapsam: yalnızca araştırma, hiçbir repoya kod değişikliği yapılmadı.

## Özet

- **İzmir API'sine bu ortamdan ulaşılamadı.** `acikveri.bizizmir.com` ve `openapi.izmir.bel.tr` ağ çıkış proxy'si tarafından engellendi (HTTP 403 / `EGRESS_BLOCKED`). Aşağıdaki şema canlı yanıttan değil, üçüncü taraf açık kaynak kodlardan (özellikle `parkio` repo'sundaki 2026-07-30 tarihli fixture ve `izmir-open-data-js` tip tanımları) derlendi. Canlı doğrulama yerel makinede yapılmalı (bkz. son bölüm).
- Gerçek uç nokta: `GET https://openapi.izmir.bel.tr/api/ibb/izum/otoparklar` (anonim, JSON dizi). Belge zaman damgası **yok**; yani "canlı mı bayat mı" bilgisi sadece istemcinin kendi çekme zamanından türetilebilir. Bu, "canlı / tahmini" etiketlemesinin tasarım merkezi olmalı.
- Fiyat: doluluk uç noktasında **tutar alanı yok**, yalnızca `isPaid` (bool) ve `payment.{cash,card,sms}` var. Saatlik tarifeler ayrı bir CKAN kaynağında (İzelman "Otopark Ücretleri") ve tablo biçiminde.
- Web/RN'de tam anlamıyla "kopyalanacak" bir İzmir otopark mobil uygulaması bulunamadı. En değerli bulgular: (1) ParkAPI/ParkenDD'nin durum modeli (`open|closed|nodata|unknown`, `last_updated` vs `last_downloaded`, 60 dk'dan eski veri uyarısı), (2) parkio'nun İzmir'e özel tazelik politikası ve doğrulama kuralları (lisansı belirsiz, sadece fikir), (3) `izmir-open-data-js` (Apache-2.0) tip tanımları.
- Çoğu depo için "son aktivite" tarihini **doğrulayamadım** (GitHub API proxy'de 403; yalnızca raw dosyalara erişildi). Aşağıda kesin bilmediğim yerde açıkça "doğrulanmadı" yazdım.

## Repo bazında bulgular

### 1. offenesdresden/ParkAPI
- URL: https://github.com/offenesdresden/ParkAPI — Lisans: **MIT** (LICENSE doğrulandı, © 2015 Kilian Koeltzsch)
- Stack: Python 3.7+, PostgreSQL, şehir başına scraper. Son aktivite: doğrulanmadı (README hâlâ Travis rozeti taşıyor, eski görünüyor).
- Borrow edilecekler:
  - **Normalize edilmiş lot şeması**: `free` opsiyonel ("canlı veri yoksa eksik olabilir"), `state: open|closed|nodata|unknown`, `forecast: bool`, `last_updated` (kaynak) ile `last_downloaded` (bizim çekme zamanımız) ayrı alan. Bu ayrım bizim için kritik çünkü İzmir kaynak zaman damgası vermiyor.
  - Scraper sözleşmesi: "state sadece open/closed/nodata olabilir, diğer durumları bunlara eşle" (`park_api/cities/Sample_City.py`).
  - Sunucu kaynağı seyrek çekip önbellekten sunar ("kaynak sunucuya yük binmesin"). v1'de backend yok; benzer mantığı istemcide TanStack Query `staleTime` ile uygulayacağız.
  - `opening_hours` / `fee_hours` OSM opening_hours sözdizimiyle (opsiyonel alanlar).

### 2. kiliankoe/ParkenDD (iOS) ve kiliankoe/ParkKit
- URL: https://github.com/kiliankoe/ParkenDD , https://github.com/kiliankoe/ParkKit — Lisans: **MIT** (ikisi de doğrulandı). Stack: Swift/UIKit. Son aktivite: doğrulanmadı; kod Swift 3 dönemi söz dizimi ve SwiftyTimer kullanıyor, büyük olasılıkla durağan. 553 commit, 53 yıldız (GitHub sayfası).
- Borrow edilecekler (fikir ve küçük mantık; MIT olduğu için uyarlanabilir, atıf notu bırakın):
  - **Doluluk renk/etiket mantığı** (`ParkenDD/Colors.swift`, `LotlistView/LotCell.swift`): yüzde `0.1..0.99` aralığına kıstırılıyor, `total == 0` ise 0.99 varsayılıyor; `closed` -> gri + "X", `nodata` -> açık gri + "?". Yani **renk tek başına bilgi taşımıyor**; sayı ve metin ("%NN dolu") da gösteriliyor, bu erişilebilirlik için iyi desen. Gri tonlama ayarı (`Defaults.grayscaleUI`) renk körlüğü için ayrı bir mod örneği.
  - **Bayat veri uyarısı** (`LotlistViewController.showOutdatedDataWarning`): `lastUpdated` 60 dakikadan eskiyse kırmızı başlık + uyarı toast'ı; aksi halde "Son güncelleme: dd.MM.yyyy HH:mm" gösteriliyor.
  - Yenileme: `Timer.every(5.minutes, updateData)` + pull-to-refresh + hata durumunda ayrı işleyici.
  - Konum: kullanıcı 100 m'den fazla hareket edince yeniden sıralama (`Location.swift`) — gereksiz yeniden hesaplamayı önler.
  - Sıralama tipleri: standart / mesafe / alfabetik / boş sayısı; `skipNodataLots` ayarı ve `favoriteLots` yerel saklama (UserDefaults) — bizim yerel favoriler ile birebir uyumlu.
  - ParkKit: ParkAPI için ince bir istemci sarmalayıcı; tip güvenli model örneği.

### 3. jklmnn/ParkenDD (Android)
- URL: https://github.com/jklmnn/ParkenDD — Lisans: **GPL-3.0** (LICENSE başlığı doğrulandı).
- **Kod kopyalanmayacak.** Sadece ürün fikri olarak (liste + harita + tahmin) bakılabilir; ben kaynak kodunu okumadım.

### 4. AtaCanYmc/izmir-open-data-js (ve -py, -go kardeşleri)
- URL: https://github.com/AtaCanYmc/izmir-open-data-js — Lisans: **Apache-2.0** (LICENSE doğrulandı). Stack: TypeScript, `fetch`, tarayıcıda CKAN için JSONP. Son aktivite: repo kimliği yakın zamanda oluşturulmuş görünüyor; tarih doğrulanmadı.
- İzmir'e özgü en güvenilir tip kaynağı. `src/endpoints/otopark.ts`:
  ```ts
  getList() { return client.get<OtoparkBilgisi[]>("izum/otoparklar"); }
  // base: https://openapi.izmir.bel.tr/api/
  ```
  `OtoparkBilgisi`: `ufid, name, status: "Closed"|"Opened", type: "OnStreet"|"OffStreet", provider, lat, lng, isPaid, nonstop, openingHours, occupancy.total.{free,occupied}, occupancy.disabled?, accessibility, poi, payment, accessories`.
  - Tarifeler: CKAN `datastore_search?resource_id=b45d2e9f-f258-476e-a12d-d0ff62471ee0` (alanlar `"0-1 Saat"`, `"0-2 saat"` ... `"0-24 saat"`, `"Aylık Abone Ücreti"` gibi; bazıları `number|null`, bazıları `string|null` — tip tutarsızlığı var, parse savunmacı olmalı).
  - Not: istemcide **yeniden deneme, önbellek veya zaman aşımı yok** (düz `fetch`, `!res.ok` ise hata). Bunu biz eklemeliyiz. JSONP yalnızca tarayıcı CORS kısıtı içindi; RN'de gerekmez ama CKAN uç noktalarında CORS olmadığı bilgisi değerli.
  - Apache-2.0: tip tanımlarını atıfla uyarlamak MIT projeye uyumlu; yine de kendi Zod şemamızı yazmak daha temiz.

### 5. AtaCanYmc/izbb-acikveri-haritalari
- URL: https://github.com/AtaCanYmc/izbb-acikveri-haritalari — Lisans: README rozetinde **Apache-2.0**, ancak repo kökünde LICENSE dosyası bulunamadı (raw 404) — lisans netleşene kadar sadece fikir. Stack: web (React/Vite benzeri, PWA), 36 harita.
- Borrow: otoparklar için `loadParkingPoints` -> `izmirOpenDataClient.otopark.getList()` sonra `mapOtopark` ve `compactPoints` (geçersiz noktaları ayıklama) ve `withErrorHandling(..., [])` ile hata olunca boş liste fallback'i; harita katmanında marker clustering ve "kaynak etiketi + kaynak URL" (`sourceLabel`, `sourceUrl`) göstermesi. Kaynak atfı CC BY 4.0 gereği bizde de görünür olmalı.

### 6. ADBERILGEN35/parkio
- URL: https://github.com/ADBERILGEN35/parkio — Lisans: **seçilmemiş** (LICENSE dosyası "License Pending" diyor) -> **hiçbir kod kopyalanamaz, yalnızca fikir.** Stack: Java 21/Spring Boot mikroservisleri + React web + Expo mobil. Son aktivite: dokümanlarda doğrulama tarihi 2026-07-30 (sürüm `v1.0.0-rc1`).
- Bu, İzmir doluluk API'sini en ciddi biçimde belgeleyen depo. `docs/architecture/wp-data-01-municipal-parking-source-foundation.md`:
  - Kaynak: `https://openapi.izmir.bel.tr/api/ibb/izum/otoparklar`, anonim GET, 2026-07-30'da 200 + `application/json; charset=utf-8`, sayfalama yok, **gözlem zaman damgası yok** (çekme zamanı kullanılıyor), lisans CC BY 4.0 (İzmir BB Açık Veri Lisansı).
  - **Tazelik durumları:** `LIVE, AGING, STALE, UNAVAILABLE, INVALID`; İzmir için varsayılan aging 300 sn, stale 900 sn. Canlı/aging değilse `availableSpaces = null` döner (konum/kapasite kalır). Bu doğrudan bizim "canlı mı, tahmini mi, bilinmiyor mu" etiketlemesine uyuyor.
  - Çekme aralığı yapılandırması: `fixed-delay-ms: 120000` (2 dk), zaman aşımı ve yeniden deneme ayarlı.
  - **Şema kayması koruması:** üst düzey anahtarların parmak izi; zorunlu anahtarlar (`ufid, lat, lng, occupancy`) yoksa tüm çalıştırma başarısız, tek kayıt bozuksa yalnızca o kayıt atılır (`PARTIAL_SUCCESS`).
  - `IzumRecordValidator`: `ufid` boş değil, `lat` [-90,90], `lng` [-180,180] ve sonlu, `occupancy.total` var, `free`/`occupied` negatif değil. `IzumNormalizer`: `capacity = free + occupied` (ikisi de varsa, yoksa null).
  - İzelman envanter/tarife CSV'si "son güncelleme 2022-11-28, düzensiz" olduğu için bilerek devre dışı bırakılmış: "ürün/hukuk kapısı olmadan güncel tarife gibi gösterilmemeli". Biz de fiyatı "tahmini/eski" diye etiketlemeliyiz.
  - Test fixture: `services/parking-service/src/test/resources/fixtures/municipal/izum/otoparklar-sample.json` (aşağıdaki şema bölümünde kullanıldı). Not: bu depodaki Expo mobil kodunda Apple/Google Maps derin bağlantısı araması sonuç vermedi; haritaya aktarma örneği buradan alınamadı.

### 7. TryingOutSomething/cz2006-carpark-finder
- URL: https://github.com/TryingOutSomething/cz2006-carpark-finder — Lisans: LICENSE dosyası yok (raw 404) -> **kopyalanamaz**. Stack: eski Expo SDK 49, React Native, `react-native-maps ~0.24`, `rn-bottom-drawer`, MongoDB Stitch. Son aktivite: eski (bağımlılıklar 2019-2023), bakımsız kabul edin.
- Borrow: yalnızca ürün kavramı (en yakın otopark + boş yer sayısı). Teknik olarak güncel değil; bizim yığın (gorhom bottom-sheet + Reanimated) çok daha modern.

### 8. rit3zh/expo-apple-maps-sheet
- URL: https://github.com/rit3zh/expo-apple-maps-sheet — Lisans dosyası bulunamadı (raw 404) -> sadece fikir. Stack: Expo SDK 54, expo-router 6, RN 0.81, `react-native-maps ^1.26`, `@lodev09/react-native-true-sheet`, `expo-haptics`, `expo-glass-effect`.
- Borrow (fikir): Apple Maps tarzı yerel sheet için `react-native-true-sheet` alternatifi (iOS yerel sheet, harita ile birlikte detent'ler). Biz @gorhom/bottom-sheet kullanıyoruz; yerel his gerekirse TrueSheet karşılaştırılmalı. Haptics ile "park here" onayı.

### 9. Kütüphaneler (kopyalamadan bağımlılık olarak)
- `venits/react-native-map-clustering` (**MIT**, v4.0.0, `supercluster ^8`): `radius = ekranGenişliği*0.06`, `maxZoom = 20`, `minPoints = 2`, `tracksViewChanges = false` varsayılanları; cluster'ı bölge değişince (`onRegionChangeComplete`) hesaplıyor. Marker performansı için `tracksViewChanges={false}` önemli.
- `react-native-maps` (MIT, 1.29.x), `@gorhom/bottom-sheet` (MIT, 5.2.x), `react-native-true-sheet` (MIT). Güncel sürümler raw `package.json`'dan okundu.
- Not: İzmir'de nokta sayısı yüzlerle sınırlı (ufid'li otopark listesi); cluster zorunlu olmayabilir. Önce düz marker + `tracksViewChanges=false` ile ölçün, cluster'ı yalnızca düşük zoom'da ekleyin.

## Uygulanacak öneriler (önceliklendirilmiş)

**P0 — v1 çekirdeği**
1. **Dört durumlu doluluk modeli:** `live | aging | stale | unknown` (+ `closed`). Kaynak zaman damgası yok; `fetchedAt` istemcide tutulur. Eşikler başlangıç değeri olarak parkio'dan: aging > 5 dk, stale > 15 dk. Stale/unknown iken boş yer sayısını **gösterme**, "Bilinmiyor" yaz (parkio `availableSpaces=null`). ParkenDD ayrımı: `lastUpdated` vs `lastDownloaded` alanlarını ayrı tut.
2. **"Canlı" etiketi dürüst olsun:** kaynak zaman damgası olmadığı için "Canlı" yerine "Güncellendi: 14:32 (2 dk önce)" göster; İzelman tarifeleri/kapasite için "Eski veri (2022)" rozeti.
3. **Savunmacı normalizasyon (Zod):** `ufid` zorunlu, `lat/lng` sonlu ve İzmir sınırları içinde (ek mantık kontrolü), `free/occupied` >= 0, `capacity = free + occupied`, kapasite 0 ise doluluk yüzdesi hesaplama. Bozuk kayıt atılsın, diğerleri gösterilsin (parkio `PARTIAL_SUCCESS`), ama **tüm zorunlu anahtarlar kayboldu ise** (şema kayması) hata ekranı + son başarılı önbellek.
4. **Doluluk göstergesi erişilebilirliği:** renk + sayı + metin ("12 boş, %80 dolu") birlikte; `accessibilityLabel` bunları okusun; renk körlüğü için ikon/şekil farkı veya gri tonlama modu (ParkenDD `grayscaleUI`). Yüzdeyi 0.1-0.99 aralığına kıstırma ve `total==0` özel durumu.
5. **Çekme/önbellek:** TanStack Query `staleTime ~60-120 sn`, `refetchInterval ~120 sn` yalnızca ön plandayken (`AppState`), pull-to-refresh, ağ yoksa son başarılı yanıtı AsyncStorage/MMKV'de tutup "Çevrimdışı — son veri: HH:mm" göster. Zaman aşımı ~10 sn + 2 deneme (izmir-open-data-js'te hiç yok).
6. **Apple Maps'e devir:** `maps://?daddr=lat,lng&dirflg=d` veya `https://maps.apple.com/?daddr=...&q=<ad>`; `Linking.canOpenURL` yerine doğrudan `openURL` + hata yakalama. (Bu araştırmada incelenen repolarda bu desene dair kod örneği bulamadım; Apple'ın belgelerinden doğrulayın.)

**P1**
7. **Sıralama/filtre:** mesafe, boş yer, ücretsiz (`isPaid=false`); `nonstop`, engelli kontenjanı (`occupancy.disabled`), araç ölçüleri (`accessibility.maxHeight/maxLength`); kapalı/nodata otoparkları gizleme seçeneği (ParkenDD `skipNodataLots`).
8. **Kullanıcı 100 m'den fazla hareket ettiğinde yeniden sıralama** (ParkenDD `Location.swift`) — pil ve CPU tasarrufu.
9. **Kaynak atfı:** CC BY 4.0 metni uygulama içinde ("İzmir Büyükşehir Belediyesi Açık Veri Portalı") + "Resmî uygulama değildir" notu (parkio bunu yapıyor).
10. **Harita performansı:** `tracksViewChanges={false}`, marker için sabit boyutlu görünüm, gerekirse `react-native-map-clustering` (MIT) yalnızca uzak zoom'da. Sheet ile harita: seçili marker -> sheet snap + `animateToRegion`; sheet yüksekliğine göre harita `edgePadding`.

**P2**
11. Tarife: CKAN `Otopark Ücretleri` kaynağını **ayrı, "eski olabilir" etiketli** modül olarak ekle; sayı/string tutarsızlığına karşı parse.
12. Haptics ve yerel sheet (TrueSheet) değerlendirmesi.
13. Şema parmak izi: yanıt anahtarlarını loglayıp (yerelde) değişimde Sentry benzeri uyarı (v1'de backend yok; opsiyonel).

## Lisans uyarıları

| Depo | Lisans | Ne yapılabilir |
|---|---|---|
| offenesdresden/ParkAPI | MIT | Uyarlanabilir (telif notu ile) |
| kiliankoe/ParkenDD (iOS), ParkKit | MIT | Uyarlanabilir (telif notu ile) |
| jklmnn/ParkenDD (Android) | **GPL-3.0** | **Kod kopyalanamaz**, yalnızca fikir. MIT projeye karıştırmayın |
| AtaCanYmc/izmir-open-data-js (-py, -go) | Apache-2.0 | Uyumlu; atıf + NOTICE gereksinimlerine uyun |
| AtaCanYmc/izbb-acikveri-haritalari | README'de Apache-2.0, LICENSE dosyası yok | Netleşene kadar yalnızca fikir |
| ADBERILGEN35/parkio | **Lisans yok ("License Pending")** | Varsayılan olarak tüm hakları saklı: **kopyalamayın**, yalnızca fikir ve doğrulanabilir olgular |
| TryingOutSomething/cz2006-carpark-finder | Lisans dosyası yok | Kopyalamayın |
| rit3zh/expo-apple-maps-sheet | Lisans dosyası bulunamadı | Kopyalamayın, fikir |
| react-native-map-clustering, react-native-maps, gorhom/bottom-sheet, react-native-true-sheet | MIT | Bağımlılık olarak kullanılabilir |

Veri lisansı: İzmir Açık Veri Lisansı (parkio'ya göre CC BY 4.0 ile uyumlu) — atıf zorunlu. Kendi doğrulamanızı portal sayfasından yapın, ben erişemedim.

## İzmir API bulguları

**Erişim durumu:** Bu oturumdan hem `https://acikveri.bizizmir.com/...` hem `https://openapi.izmir.bel.tr/...` denendi; çıkış proxy'si CONNECT aşamasında 403 verdi. Dolayısıyla **canlı yanıt görülmedi**; aşağıdakiler üçüncü taraf depolardan türetilmiştir ve doğrulanması gerekir.

**Uç nokta:** `GET https://openapi.izmir.bel.tr/api/ibb/izum/otoparklar` — anonim, `application/json; charset=utf-8`, kök seviyede **JSON dizi**, sayfalama yok (parkio, 2026-07-30). Portal sayfası: https://acikveri.bizizmir.com/dataset/otopark-doluluk-ve-lokasyon-bilgileri.

**Kayıt şeması** (parkio fixture + izmir-open-data-js tipleri; gerçek örnek):
```json
{
  "ufid": "NEDAP-TR-IZM-006",
  "name": "06 1393 Sk. Yol Kenarı Otopark",
  "provider": "İZELMAN A.Ş",
  "type": "OnStreet",            // "OnStreet" | "OffStreet"
  "status": "Opened",            // "Opened" | "Closed"
  "lat": 38.432968, "lng": 27.145272,
  "address": "",                 // boş olabilir
  "isPaid": true, "nonstop": false,
  "openingHours": { "monday": "07:00 – 22:00", "...": "..." },  // gün adı -> metin (en dash)
  "occupancy": { "total": { "free": 1, "occupied": 60 } },      // "disabled": {free, occupied} opsiyonel
  "accessibility": { "lpgAllowed": true, "disabled": true, "maxLength": 400, "maxHeight": 0, "maxWidth": 250 },
  "poi": { "metroStation": false, "trainStation": false, "busStation": true, "tramStation": true },
  "payment": { "cash": true, "card": false, "sms": false },
  "accessories": { "covered": false, "barrier": false, "cctv": false },
  "entrances": [], "exits": []
}
```
Gözlemler: `maxHeight: 0` büyük olasılıkla "bilinmiyor" anlamında (varsayım, doğrulanmalı); `address` boş gelebiliyor; `capacity` alanı yok, `free + occupied` ile türetiliyor.

**Güncelleme sıklığı:** Doluluk kaydında **zaman damgası alanı yok**, kaynağın yenileme periyodu belgelenmiş olarak bulunamadı. Sensör (NEDAP kimlikleri) tabanlı olduğu için dakikalar mertebesinde olması beklenir ama bu bir **tahmindir**. parkio'nun 120 sn çekme ve 300/900 sn tazelik eşikleri onların seçimidir, kaynak garantisi değil. Yerelde bir saat boyunca 1 dk aralıkla çekip yanıt hash'inin ne zaman değiştiğini ölçmeniz önerilir.

**Fiyat alanı:** Doluluk yanıtında **tutar yok**; yalnızca `isPaid` ve `payment.*`. Tarifeler ayrı CKAN kaynağı (`resource_id=b45d2e9f-f258-476e-a12d-d0ff62471ee0`, `datastore_search`); sütunlar süre aralıklarına göre (`"0-1 Saat"`, `"0-2 saat"`, ... `"0-24 saat"`, motosiklet/engelli/abonelik) ve otopark adı `"Otopark / Fiyat"` ile geliyor — `ufid` ile **anahtarlı değil**, ad eşlemesi gerekir (kırılgan). İzelman envanter CSV'si portalda 2022-11-28 tarihli ve düzensiz güncelleniyor (parkio).

**Yerelde doğrulama komutları (Türkiye'den/serbest ağdan):**
```bash
curl -sS -D- https://openapi.izmir.bel.tr/api/ibb/izum/otoparklar | head -40   # başlıklar: Date, Last-Modified, Cache-Control, CORS
curl -sS https://openapi.izmir.bel.tr/api/ibb/izum/otoparklar | jq 'length, (.[0]|keys), ([.[].type]|unique), ([.[].status]|unique)'
```
Bakılacaklar: `Last-Modified`/`ETag` var mı (koşullu istek için), boş/negatif `free`, `Closed` kayıtlarda `free` değeri, kayıt sayısı, yanıt boyutu.

# Veri kaynağı: İzmir otopark doluluk API'si

Son kontrol: **2026-10-07**. Proje sahibi yanıtı Türkiye'den bir tarayıcıda açtı. Geliştirme ortamı bu alan adına erişemiyor (ağ politikası 403).

Uygulama beş şehri destekler (`src/data/cities.ts`). Canlı doluluk yalnızca İzmir'de (bu belge) ve İstanbul'da (aşağıda, "İstanbul: İBB / İSPARK") var. Ankara, Bursa ve Antalya'da canlı kaynak yok; otoparklar OpenStreetMap'ten kapasite bilgisiyle gelir ve doluluk için istek atılmaz.

## Uç nokta

```
GET https://openapi.izmir.bel.tr/api/ibb/izum/otoparklar
```

- Kimlik doğrulama yok (tarayıcıda anahtarsız açıldı).
- Yanıt kök seviyede bir **JSON dizi**. Sayfalama yok.
- **Yanıt yavaş:** iPhone Safari'de (LTE) açılması ~15 sn sürdü. Uygulama ilk sürümde 10 sn sonra vazgeçip örnek veriye düşüyordu; zaman aşımı ilk denemede 20 sn'ye, yeniden denemede 30 sn'ye çıkarıldı (30 sn geçtikten sonra yeni deneme başlamaz). Bekleme sırasında cihazda kayıtlı son veri gösterilir.
- Portal sayfası: https://acikveri.bizizmir.com/dataset/otopark-doluluk-ve-lokasyon-bilgileri

## Ham örnek

Tam yanıt testte fixture olarak duruyor: [`src/data/__tests__/fixtures/izmir-live-2026-10-07.json`](../src/data/__tests__/fixtures/izmir-live-2026-10-07.json) (7 kayıt). Bir kayıt:

```json
{
  "ufid": "CPS-TR-IZM-M1-01",
  "name": "Konak Katlı Otopark",
  "provider": "İZELMAN A.Ş",
  "type": "OffStreet",
  "status": "Opened",
  "lat": 38.415959,
  "lng": 27.129392,
  "address": "",
  "isPaid": true,
  "nonstop": true,
  "openingHours": { "monday": "–", "tuesday": "–", "...": "–" },
  "occupancy": {
    "total": { "free": 661, "occupied": 227 },
    "disabled": { "free": 15, "occupied": 4 }
  },
  "payment": { "cash": true, "card": false, "sms": false },
  "accessories": { "covered": false, "barrier": true, "cctv": false },
  "accessibility": {
    "lpgAllowed": false,
    "disabled": true,
    "maxLength": 400,
    "maxHeight": 0,
    "maxWidth": 250
  },
  "poi": { "metroStation": true, "trainStation": false, "busStation": true, "tramStation": false },
  "entrances": [{ "lat": 38.415959, "name": "Konak Katlı Otopark", "lng": 27.129392 }],
  "exits": []
}
```

## Şema ve alan tipleri

| Alan                                 | Tip                           | Not                                                                       |
| ------------------------------------ | ----------------------------- | ------------------------------------------------------------------------- |
| `ufid`                               | string                        | Kalıcı kimlik. `NEDAP-…` yol kenarı sensörleri, `CPS-…` katlı otoparklar. |
| `name`                               | string                        | Yazım hataları var ("Merekezi"); olduğu gibi gösterilir.                  |
| `provider`                           | string                        | Örnekte hep "İZELMAN A.Ş".                                                |
| `type`                               | `"OnStreet"` \| `"OffStreet"` | Yol kenarı / otopark binası.                                              |
| `status`                             | `"Opened"` (örnekte)          | `"Closed"` görülmedi.                                                     |
| `lat`, `lng`                         | number                        |                                                                           |
| `address`                            | string                        | Örnekteki tüm kayıtlarda boş.                                             |
| `isPaid`                             | boolean                       | Ücret **tutarı yok**.                                                     |
| `nonstop`                            | boolean                       | 7/24 açık.                                                                |
| `openingHours`                       | `{ monday…sunday: string }`   | `"07:00 – 22:00"` biçiminde (en dash). 7/24 otoparklarda her gün `"–"`.   |
| `occupancy.total.free`, `.occupied`  | number                        | Kapasite = `free + occupied`.                                             |
| `occupancy.disabled`                 | `{ free, occupied }`          | İsteğe bağlı, yalnızca katlı otoparklarda.                                |
| `payment.{cash,card,sms}`            | boolean                       |                                                                           |
| `accessories.{covered,barrier,cctv}` | boolean                       | `covered` güvenilmez (aşağıya bak).                                       |
| `accessibility`                      | object                        | `maxHeight: 0` büyük ihtimalle "bilinmiyor".                              |
| `poi.*Station`                       | boolean                       | Yakında istasyon var mı.                                                  |
| `entrances`, `exits`                 | `{ lat, lng, name }[]`        | Çoğunlukla boş.                                                           |

## Bulgular ve uygulamadaki karşılıkları

- **Zaman damgası yok.** Kayıtlarda ölçüm zamanını veren bir alan yok. Tazelik, verinin cihaza indiği an (`fetchedAt`) ile ölçülür: kartlarda "Güncellendi: HH:mm" yazar, "Canlı" yazmaz. Kayıtlar `occupancyKind: 'estimated'` olarak işaretlenir.
- **Fiyat alanı yok.** Yalnızca `isPaid` var. İzmir tarifeleri `data/tariffs.json` içinde ve hepsi "Tahmini".
- **`openingHours` içindeki `"–"` bir saat değildir.** Normalizasyonda atılır; 7/24 bilgisi `nonstop` alanından gelir.
- **`accessories.covered` güvenilmez.** "Konak Katlı Otopark" ve "Hatay Katlı Pazaryeri" katlı otoparklar olduğu halde `covered: false` geliyor. Bu yüzden yalnızca `true` değerine güvenilir, `false` "bilinmiyor" sayılır. Örnekte `true` olan kayıt olmadığı için "Kapalı" filtresi gizlenir.
- `isPaid: false` olan yol kenarı kayıtları da var (ör. "24 Kordon 4 (Batı)"). Bu kayıtlarda `payment` alanlarının hepsi `false`.
- `type: "OffStreet"` alanını "Kapalı otopark" diye yorumlamadık: açık otopark alanları da OffStreet olabilir.

## Tekrarlı çağrılar (2026-10-07)

Aynı gün üç kez çekildi:

| Çağrı | Kayıt sayısı | Boş yer sayıları                                   |
| ----- | ------------ | -------------------------------------------------- |
| 1     | 7            | 1, 0, 16, 1, 1, 97 (Hatay), 661 (Konak)            |
| 2     | 7            | Birebir aynı                                       |
| 3     | 6            | "Hatay Katlı Pazaryeri" yok; kalanlar birebir aynı |

Çıkarımlar:

- **Sayılar donuk olabilir.** Hiçbir otoparkta değişiklik görülmedi. Kaynak ölçüm zamanı vermediği için bu "Canlı" olarak gösterilmemesi gerektiğini doğruluyor. Uygulamadaki "Güncellendi: HH:mm" yalnızca indirme zamanıdır, ölçüm zamanı değildir.
- **Kayıt kümesi değişebiliyor.** Bir otopark yanıttan düşebiliyor. Uygulamada detay ekranı bu durumda "bulunamadı" gösterir, favoriler kendi kopyasını sakladığı için kaybolmaz.

## Doğrulanamayanlar

Tarayıcıda görülen yanıttan bunlar anlaşılmıyor:

- [ ] **Güncelleme sıklığı.** Üç çağrıda değişiklik görülmedi; farklı saatlerde (ör. sabah ve akşam) tekrar bakılmalı.
- [ ] **Yanıt başlıkları** (`Cache-Control`, `Last-Modified`, `ETag`) ve **CORS** (`Access-Control-Allow-Origin`). iOS uygulaması için CORS gerekmez; yalnızca web sürümü için önemli.
- [ ] **Veri lisansı.** Üçüncü taraf kaynaklara göre İzmir Açık Veri Lisansı, CC BY 4.0 ile uyumlu. Portal sayfasından teyit edilmeli.
- [ ] **Toplam kayıt sayısı.** Örnekte 7 kayıt var; yanıtın tamamı olup olmadığı belli değil.

## İstanbul: İBB / İSPARK

Son kontrol: **2026-10-16**, GitHub Actions'tan (`scripts/fetch-ispark-sample.mjs`, veri görevinin bir adımı). Ham yanıtlar: `data/raw/ispark-sample.json` ve `data/raw/ispark-detail-sample.json`.

```
GET https://api.ibb.gov.tr/ispark/Park
GET https://api.ibb.gov.tr/ispark/ParkDetay?id=<parkID>
```

- `Park`: anahtarsız, JSON dizi, yaklaşık 244 kayıt. Alanlar: `parkID`, `parkName`, `lat` ve `lng` (metin), `capacity`, `emptyCapacity`, `workHours` ("24 Saat"), `parkType` ("KAPALI OTOPARK", "AÇIK OTOPARK"…), `freeTime` (dakika), `district`, `isOpen` (1/0). Uygulama bu uç noktayı kullanır (`src/data/isparkProvider.ts`); biçim örnekle uyuşuyor.
- **Zaman damgası yok** (listede). Tazelik İzmir'deki gibi indirme anından ölçülür.
- `ParkDetay?id=`: ek olarak `updateDate` ("16.10.2026 18:45:25"), `monthlyFee`, `tariff` ("0-1 Saat : 110,00;1-2 Saat : 140,00;…"), `address` ve `areaPolygon`. Uygulama bunu çalışırken çağırmaz: `scripts/fetch-ispark-tariffs.mjs` her otoparkın `tariff` ve `monthlyFee` alanlarını `data/tariffs-ispark.json` dosyasına yazar (244 otopark, haftalık, `.github/workflows/ispark-tariffs.yml`), uygulama bu dosyayı gömülü taşır ve "Resmi tarife" olarak gösterir.
- Doğrulanamayanlar: güncelleme sıklığı, yanıt başlıkları, veri lisansı, telefondan erişim.

## Ankara, Bursa, Antalya: resmi otopark tarifeleri (2026-10-18)

Bu üç şehirde makinece okunur (açık veri / API) bir otopark ücret kaynağı bulunamadı. Haber, blog ve üçüncü taraf uygulamalardaki fiyatlar kullanılmadı.

- **Bursa (BURULAŞ):** `data/tariffs-bursa.json`, elle tutulur. Tek kayıt: Bursa Şehirlerarası ve Uluslararası Otobüs Terminali otoparkı (`osm-way-345889573`, OSM'de `operator: Burulaş Bursa Terminal Otoparkı`). Kaynak: https://www.burulas.com.tr/hizmetler/terminal/otopark-tarifesi (sayfada tarih yok; eski 80 TL'lik tablo `/bursa-otobus-terminali/hakkinda/` sayfasında duruyor ve kullanılmadı). 0-25 dk ücretsiz, "1 Saate Kadar" 100 TL ... "12 Saate Kadar" 290 TL; 12-24 saat bantları sayfadaki "12 saatten sonra her saat için 5,00 TL ilave edilir" kuralından hesaplandı. Terminalin yanındaki iki isimsiz OSM otoparkı (`osm-node-3525140237`, `osm-way-191171828`) eşleştirilmedi. BURPARK şehir içi fiyat listesi sayfası (https://www.burulas.com.tr/bursa-otoparklari/fiyat-listesi/) "güncellenmektedir" diyor, tablo yok. Uludağ BURPARK otoparkları için Büyükşehir'in 2 Ocak 2026 basın bülteni otomobil günlük 350 TL diyor, ama otopark adlarını vermiyor; Uludağ'daki `osm-way-1463140767` (operator: Bursa Büyükşehir Belediyesi) bu yüzden eşleştirilmedi.
- **Ankara (ANPARK / BELTAŞ):** Resmi 2026 tarifesi var (Büyükşehir Meclisi Aralık 2025 kararı; https://www.anpark.com.tr/otopark-fiyat-tarifeleri ve https://www.anpark.com.tr/2026-guncel-fiyat-bilgisi/), ancak yalnızca görsel olarak yayımlanmış; rakamlar metin olarak okunamadı, dosya yazılmadı. AŞTİ'nin kendi sayfası (https://www.asti.com.tr/asti-otopark.html) tarihsiz ve tablosu net değil.
- **Antalya (ANET):** Tarife Büyükşehir Meclisi'nin 18.04.2025 tarihli 332 sayılı kararına dayanıyor; ANET 05.02.2026'da güncelleme istedi. Kararın ya da ANET'in fiyat tablosunun yayımlanmış metni bulunamadı, dosya yazılmadı.

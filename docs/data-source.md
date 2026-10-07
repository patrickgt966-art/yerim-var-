# Veri kaynağı: İzmir otopark doluluk API'si

Son kontrol: **2026-10-07**. Proje sahibi yanıtı Türkiye'den bir tarayıcıda açtı. Geliştirme ortamı bu alan adına erişemiyor (ağ politikası 403).

## Uç nokta

```
GET https://openapi.izmir.bel.tr/api/ibb/izum/otoparklar
```

- Kimlik doğrulama yok (tarayıcıda anahtarsız açıldı).
- Yanıt kök seviyede bir **JSON dizi**. Sayfalama yok.
- Yanıt bazen gecikiyor: ilk denemede sekme uzun süre yüklendi. Uygulamadaki 10 sn zaman aşımı ve örnek veriye düşme bu durum için var.
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
- **Fiyat alanı yok.** Yalnızca `isPaid` var. Tarifeler `data/tariffs.json` içinde ve hepsi "Tahmini".
- **`openingHours` içindeki `"–"` bir saat değildir.** Normalizasyonda atılır; 7/24 bilgisi `nonstop` alanından gelir.
- **`accessories.covered` güvenilmez.** "Konak Katlı Otopark" ve "Hatay Katlı Pazaryeri" katlı otoparklar olduğu halde `covered: false` geliyor. Bu yüzden yalnızca `true` değerine güvenilir, `false` "bilinmiyor" sayılır. Örnekte `true` olan kayıt olmadığı için "Kapalı" filtresi gizlenir.
- `isPaid: false` olan yol kenarı kayıtları da var (ör. "24 Kordon 4 (Batı)"). Bu kayıtlarda `payment` alanlarının hepsi `false`.
- `type: "OffStreet"` alanını "Kapalı otopark" diye yorumlamadık: açık otopark alanları da OffStreet olabilir.

## Doğrulanamayanlar

Tarayıcıda görülen yanıttan bunlar anlaşılmıyor:

- [ ] **Güncelleme sıklığı.** 2 dakika arayla iki çağrı yapıp `free` değerlerinin değişip değişmediğine bakılmalı.
- [ ] **Yanıt başlıkları** (`Cache-Control`, `Last-Modified`, `ETag`) ve **CORS** (`Access-Control-Allow-Origin`). iOS uygulaması için CORS gerekmez; yalnızca web sürümü için önemli.
- [ ] **Veri lisansı.** Üçüncü taraf kaynaklara göre İzmir Açık Veri Lisansı, CC BY 4.0 ile uyumlu. Portal sayfasından teyit edilmeli.
- [ ] **Toplam kayıt sayısı.** Örnekte 7 kayıt var; yanıtın tamamı olup olmadığı belli değil.

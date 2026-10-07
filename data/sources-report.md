# Veri kaynakları raporu

## OpenStreetMap (ODbL)

- Ham öğe: 1651, herkese açık: 1504, çiftler ayıklanınca: 1431
- Adı olan: 55, kapasitesi olan: 41, ücretli işaretli: 73

## İzmir açık veri portalı ("otopark" araması)

- **Otopark Ücretleri** / Otopark Ücretleri  (CSV, Izmir Metropolitan Municipality Open Data License, güncelleme: 2024-09-02T06:55:29.106194) — 39 kayıt; alanlar: _id:int, Otopark / Fiyat:text, 0-1 Saat:numeric, 0-2 saat:numeric, 2-4 saat:numeric, 4-6 saat:numeric, 0-3 saat:text, 0-6 saat:numeric, 3-6 saat:text, 6-12 saat:numeric, 0-12 saat:numeric, 12-24 saat:numeric, 0-24 saat:numeric, 0-24 Saat(Motosiklet ):numeric, 0-12 Saat(Motosiklet ):text, 17:00-09:00 Arası (16 Saat):numeric, 19:00-09:00 Arası (14 Saat):numeric, Kayıp Bilet:numeric, Aylık Abone Ücreti:numeric, Motosiklet Aylık Abone Ücreti:numeric, 0-24 Saat(Engelli Aracı ):numeric
- **Otopark Ücretleri** / Otopark Ücretleri (XLSX, Izmir Metropolitan Municipality Open Data License, güncelleme: 2026-02-16T07:39:54.714199) — 32 kayıt; alanlar: _id:int, Otopark / Fiyat:text, 0-1 Saat:numeric, 0-2 saat:numeric, 2-4 saat:numeric, 4-6 saat:numeric, 0-3 saat:text, 0-6 saat:numeric, 3-6 saat:text, 6-12 saat:numeric, 1-12 saat:numeric, 0-12 saat:numeric, 12-24 saat:numeric, 0-24 saat:numeric, 0-12 Saat(Motosiklet ):numeric, 12-24 Saat(Motosiklet ):numeric, 0-24 Saat(Motosiklet ):numeric, Kayıp Bilet:numeric, Aylık Abone Ücreti:numeric, Aylık Alan Abonelik Ücreti:numeric, Motosiklet Aylık Abone Ücreti:numeric, 0-12 Saat(Engelli Aracı ):numeric, 12-24 Saat(Engelli Aracı ):numeric, 0-24 Saat(Engelli Aracı ):numeric
- **Otopark Doluluk ve Lokasyon Bilgileri** / Otopark doluluk adetleri ve lokasyonları (API, Izmir Metropolitan Municipality Open Data License, güncelleme: ?)
- **İzelman Otoparkları Lokasyon, Kapasite ve Çalışma Saati Verisi** / Yol Kenarı Otoparklar (CSV, Izmir Metropolitan Municipality Open Data License, güncelleme: 2022-11-25T13:48:25.182198) — 48 kayıt; alanlar: _id:int, OTOPARK_ADI:text, ILCE:text, MAHALLE:text, ADRES_VEYA_TARIF:text, ACILIS_SAATI:text, KAPANIS_SAATI:text, KAPASITE:numeric, ENLEM:numeric, BOYLAM:numeric
- **İzelman Otoparkları Lokasyon, Kapasite ve Çalışma Saati Verisi** / Kapalı Alan Otoparklar (CSV, Izmir Metropolitan Municipality Open Data License, güncelleme: 2022-11-25T13:43:59.698909) — 23 kayıt; alanlar: _id:int, OTOPARK_ADI:text, ILCE:text, MAHALLE:text, ADRES:text, EK_BILGI:text, ACILIS_SAATI:text, KAPANIS_SAATI:text, KAPASITE:numeric, ENLEM:numeric, BOYLAM:numeric
- **İzelman Otoparkları Lokasyon, Kapasite ve Çalışma Saati Verisi** / Yol Kenarı Dışındaki Açık Alan Otoparklar (CSV, Izmir Metropolitan Municipality Open Data License, güncelleme: 2022-11-28T06:02:45.656699) — 11 kayıt; alanlar: _id:int, OTOPARK_ADI:text, ILCE:text, MAHALLE:text, ADRES:text, YER_TARIFI:text, ACILIS_SAATI:text, KAPANIS_SAATI:text, KAPASITE:numeric, ENLEM:numeric, BOYLAM:numeric
- **İzelman Otoparkları Lokasyon, Kapasite ve Çalışma Saati Verisi** / Mustafa Kemal Sahil Bulvarı Bariyerli Abone Otoparkları (CSV, Izmir Metropolitan Municipality Open Data License, güncelleme: 2022-11-28T06:28:24.682391) — 17 kayıt; alanlar: _id:int, BLOK_ADI:text, ILCE:text, MAHALLE:text, ADRES_VEYA_TARIF:text, ACILIS_SAATI:text, KAPANIS_SAATI:text, KAPASITE:numeric, ENLEM:numeric, BOYLAM:numeric

## Canlı doluluk API erişimi (GitHub sunucusundan)

- HTTP 200, 7 kayıt

## Sonuç

- İzelman envanteri: 82 otopark.
- OSM'den İzelman ile çakışan 47 kayıt çıkarıldı.
- data/parkings-static.json: 1466 otopark.
- data/places-izmir.json: 3462 yer (arama için).

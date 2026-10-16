# Veri kaynakları raporu

## OpenStreetMap (ODbL)

- Ham öğe: 1728, herkese açık: 1576, çiftler ayıklanınca: 1454
- Adı olan: 52, kapasitesi olan: 41, ücretli işaretli: 72
- Giriş noktasından türeyen: 22, bina olarak işaretli: 1

## İzmir açık veri portalı ("otopark" araması)

- **İzelman Otoparkları Lokasyon, Kapasite ve Çalışma Saati Verisi** / Mustafa Kemal Sahil Bulvarı Bariyerli Abone Otoparkları (CSV, Izmir Metropolitan Municipality Open Data License, güncelleme: 2022-11-28T06:28:24.682391) — 17 kayıt; alanlar: _id:int, BLOK_ADI:text, ILCE:text, MAHALLE:text, ADRES_VEYA_TARIF:text, ACILIS_SAATI:text, KAPANIS_SAATI:text, KAPASITE:numeric, ENLEM:numeric, BOYLAM:numeric
- **Otopark Doluluk ve Lokasyon Bilgileri** / Otopark doluluk adetleri ve lokasyonları (API, Izmir Metropolitan Municipality Open Data License, güncelleme: ?)
- **İzelman Otoparkları Lokasyon, Kapasite ve Çalışma Saati Verisi** / Kapalı Alan Otoparklar (CSV, Izmir Metropolitan Municipality Open Data License, güncelleme: 2022-11-25T13:43:59.698909) — 23 kayıt; alanlar: _id:int, OTOPARK_ADI:text, ILCE:text, MAHALLE:text, ADRES:text, EK_BILGI:text, ACILIS_SAATI:text, KAPANIS_SAATI:text, KAPASITE:numeric, ENLEM:numeric, BOYLAM:numeric
- **Otopark Ücretleri** / Otopark Ücretleri  (CSV, Izmir Metropolitan Municipality Open Data License, güncelleme: 2024-09-02T06:55:29.106194) — 39 kayıt; alanlar: _id:int, Otopark / Fiyat:text, 0-1 Saat:numeric, 0-2 saat:numeric, 2-4 saat:numeric, 4-6 saat:numeric, 0-3 saat:text, 0-6 saat:numeric, 3-6 saat:text, 6-12 saat:numeric, 0-12 saat:numeric, 12-24 saat:numeric, 0-24 saat:numeric, 0-24 Saat(Motosiklet ):numeric, 0-12 Saat(Motosiklet ):text, 17:00-09:00 Arası (16 Saat):numeric, 19:00-09:00 Arası (14 Saat):numeric, Kayıp Bilet:numeric, Aylık Abone Ücreti:numeric, Motosiklet Aylık Abone Ücreti:numeric, 0-24 Saat(Engelli Aracı ):numeric
- **İzelman Otoparkları Lokasyon, Kapasite ve Çalışma Saati Verisi** / Yol Kenarı Dışındaki Açık Alan Otoparklar (CSV, Izmir Metropolitan Municipality Open Data License, güncelleme: 2022-11-28T06:02:45.656699) — 11 kayıt; alanlar: _id:int, OTOPARK_ADI:text, ILCE:text, MAHALLE:text, ADRES:text, YER_TARIFI:text, ACILIS_SAATI:text, KAPANIS_SAATI:text, KAPASITE:numeric, ENLEM:numeric, BOYLAM:numeric
- **İzelman Otoparkları Lokasyon, Kapasite ve Çalışma Saati Verisi** / Yol Kenarı Otoparklar (CSV, Izmir Metropolitan Municipality Open Data License, güncelleme: 2022-11-25T13:48:25.182198) — 48 kayıt; alanlar: _id:int, OTOPARK_ADI:text, ILCE:text, MAHALLE:text, ADRES_VEYA_TARIF:text, ACILIS_SAATI:text, KAPANIS_SAATI:text, KAPASITE:numeric, ENLEM:numeric, BOYLAM:numeric
- **Otopark Ücretleri** / Otopark Ücretleri (XLSX, Izmir Metropolitan Municipality Open Data License, güncelleme: 2026-02-16T07:39:54.714199) — 32 kayıt; alanlar: _id:int, Otopark / Fiyat:text, 0-1 Saat:numeric, 0-2 saat:numeric, 2-4 saat:numeric, 4-6 saat:numeric, 0-3 saat:text, 0-6 saat:numeric, 3-6 saat:text, 6-12 saat:numeric, 1-12 saat:numeric, 0-12 saat:numeric, 12-24 saat:numeric, 0-24 saat:numeric, 0-12 Saat(Motosiklet ):numeric, 12-24 Saat(Motosiklet ):numeric, 0-24 Saat(Motosiklet ):numeric, Kayıp Bilet:numeric, Aylık Abone Ücreti:numeric, Aylık Alan Abonelik Ücreti:numeric, Motosiklet Aylık Abone Ücreti:numeric, 0-12 Saat(Engelli Aracı ):numeric, 12-24 Saat(Engelli Aracı ):numeric, 0-24 Saat(Engelli Aracı ):numeric

## Canlı doluluk API erişimi (GitHub sunucusundan)

- HTTP 200, 6 kayıt

- Overpass alınamadı (raylı sistem istasyonları; tüm sunucular ve denemeler).
## Sonuç

- İzelman envanteri: 82 otopark.
- OSM'den İzelman ile çakışan 47 kayıt çıkarıldı.
- Adsız otoparklardan yakın yer adı bulunan: 685.
- data/parkings-static.json: 1489 otopark.
- data/places-izmir.json: 3510 yer (arama için).
- Raylı istasyon listesi alınamadı; data/rail-izmir.json değiştirilmedi.

## Yeme-içme yerleri (OpenStreetMap, inceleme verisi)

- Ayıklanan (anlamsız ad / yeme-içme dışı): 7
- Toplam: 2435 (bakery 170, bar 82, biergarten 4, cafe 832, confectionery 32, fast_food 414, food_court 24, ice_cream 20, pastry 61, pub 29, restaurant 767)
- Mutfak türü: 26%, çalışma saati: 8%, telefon: 8%, web: 6%, Instagram: 1%
- En sık mutfak türleri: coffee_shop 157, turkish 144, burger 86, pizza 60, kebab 54, chicken 31, sandwich 31, seafood 31, regional 30, fish 22, breakfast 16, dessert 12, italian 10, pasta 10, tea 10
- data/food-izmir.json: 2435 yer.

## İzmir açık veri portalında yeme-içme / turizm veri setleri

- "restoran": sonuç yok
- "lokanta": sonuç yok
- "kafe": İzelman Kitap Kafe Konum Verisi
- "turizm": Bademsu Fabrikası Üretim Verileri · Günübirlik Gezi Tekneleri Bilgileri · Halk Ekmek Büfeleri Satış Noktaları · Halk Ekmek Fabrikası Üretim Verileri · Halkın Bakkalı Siparişi Alınan Paket Tür ve Miktarları · İlçelerde Yaşayan T.C. Vatandaşı ve Yabancı Uyruklu Nüfus  Bilgileri · İzmir İli Müze ve Ören Yerleri Ziyaret Saatleri · İzmir Su Fabrikası Üretim Verileri · Kamu Kurum ve Kuruluşları · Kruvaziyer Gemi Bilgileri · Müze Ziyaretçi İstatistikleri · Ören Yerleri İstatikleri · Turizm Amaçlı Sportif Faaliyetler · Turizm Bilgilendirme Ofisleri Konum Verisi · Turizm Tesisleri · Turuncu Çember Sertifikası Alan İşletmeler Listesi · Yiyecek, İçecek Büfeleri
- "işletme": 1.Sınıf Gayri Müessese Kapsamındaki İşletme Sayısı İle Akaryakıt Ve/Veya Otogaz Satış İstasyonu Sayısı · Günübirlik Gezi Tekneleri Bilgileri · Tesisler ve Atıksu Miktarları · Turizm Amaçlı Sportif Faaliyetler · Turizm Tesisleri

## İstanbul · OpenStreetMap (ODbL)

- Ham öğe: 5904, herkese açık: 5394, çiftler ayıklanınca: 4681
- Adı olan: 583, kapasitesi olan: 166, ücretli işaretli: 483
- Giriş noktasından türeyen: 387, bina olarak işaretli: 4

- İstanbul: yer adları · yer adları: 15 kutu, 14 tam başarılı; eksik bölgeler (güney,batı,kuzey,doğu): 41.3,29.7,41.4,29.95.
- İstanbul: yer adları · bina adları (ağır regex): 15 kutu, 2 tam başarılı (eşik %90; bu grup atıldı); eksik bölgeler (güney,batı,kuzey,doğu): 40.8,29.45,40.9,29.7 | 40.8,29.7,40.9,29.95 | 40.9,29.45,41,29.7 | 40.9,29.7,41,29.95 | 41,27.95,41.1,28.2 | 41,28.2,41.1,28.45 | 41.1,27.95,41.2,28.2 | 41.1,28.2,41.2,28.45 | 41,28.45,41.1,28.7 | 41,28.7,41.1,28.95 | 41.1,28.45,41.2,28.7 | 41.1,28.7,41.2,28.95 | 41,28.95,41.1,29.2 | 41,29.2,41.1,29.45 | 41.1,28.95,41.2,29.2 | 41.1,29.2,41.2,29.45 | 41,29.45,41.1,29.7 | 41,29.7,41.1,29.95 | 41.1,29.45,41.2,29.7 | 41.1,29.7,41.2,29.95 | 41.2,27.95,41.3,28.2 | 41.2,28.2,41.3,28.45 | 41.3,27.95,41.4,28.2 | 41.3,28.2,41.4,28.45 | 41.2,28.45,41.3,28.7 | 41.2,28.7,41.3,28.95 | 41.3,28.45,41.4,28.7 | 41.3,28.7,41.4,28.95 | 41.2,28.95,41.3,29.2 | 41.2,29.2,41.3,29.45 | 41.3,28.95,41.4,29.2 | 41.3,29.2,41.4,29.45 | 41.2,29.45,41.3,29.7 | 41.2,29.7,41.3,29.95 | 41.3,29.45,41.4,29.7 | 41.3,29.7,41.4,29.95 | 41.4,27.95,41.5,28.2 | 41.4,28.2,41.5,28.45 | 41.5,27.95,41.6,28.2 | 41.5,28.2,41.6,28.45 | 41.4,28.45,41.5,28.7 | 41.4,28.7,41.5,28.95 | 41.5,28.45,41.6,28.7 | 41.5,28.7,41.6,28.95 | 41.4,28.95,41.5,29.2 | 41.4,29.2,41.5,29.45 | 41.5,28.95,41.6,29.2 | 41.5,29.2,41.6,29.45 | 41.4,29.45,41.5,29.7 | 41.4,29.7,41.5,29.95 | 41.5,29.45,41.6,29.7 | 41.5,29.7,41.6,29.95.
## İstanbul · Sonuç

- Adsız otoparklardan yakın yer adı bulunan: 2005.
- data/parkings-static-istanbul.json: 4681 otopark.
- data/places-istanbul.json: 7259 yer (arama için).
- data/rail-istanbul.json: 296 istasyon.

## İstanbul · Yeme-içme yerleri (OpenStreetMap, inceleme verisi)

- İstanbul: yeme-içme · restoran: 15 kutu, 3 tam başarılı (eşik %50; bu grup atıldı); eksik bölgeler (güney,batı,kuzey,doğu): 40.9,29.2,41,29.45 | 41,28.2,41.1,28.45 | 41.1,28.95,41.2,29.2 | 41,29.45,41.1,29.7 | 41,29.7,41.1,29.95 | 41.1,29.45,41.2,29.7 | 41.1,29.7,41.2,29.95 | 41.2,27.95,41.3,28.2 | 41.2,28.2,41.3,28.45 | 41.3,27.95,41.4,28.2 | 41.3,28.2,41.4,28.45 | 41.2,28.45,41.3,28.7 | 41.2,28.7,41.3,28.95 | 41.3,28.45,41.4,28.7 | 41.3,28.7,41.4,28.95 | 41.2,28.95,41.3,29.2 | 41.2,29.2,41.3,29.45 | 41.3,28.95,41.4,29.2 | 41.3,29.2,41.4,29.45 | 41.2,29.45,41.3,29.7 | 41.2,29.7,41.3,29.95 | 41.3,29.45,41.4,29.7 | 41.3,29.7,41.4,29.95 | 41.4,27.95,41.5,28.2 | 41.4,28.2,41.5,28.45 | 41.5,27.95,41.6,28.2 | 41.5,28.2,41.6,28.45 | 41.4,28.45,41.5,28.7 | 41.4,28.7,41.5,28.95 | 41.5,28.45,41.6,28.7 | 41.5,28.7,41.6,28.95 | 41.4,28.95,41.5,29.2 | 41.4,29.2,41.5,29.45 | 41.5,28.95,41.6,29.2 | 41.5,29.2,41.6,29.45 | 41.4,29.45,41.5,29.7 | 41.4,29.7,41.5,29.95 | 41.5,29.45,41.6,29.7 | 41.5,29.7,41.6,29.95.
- İstanbul: yeme-içme · kafe, bar, pastane: 15 kutu, 0 tam başarılı (eşik %50; bu grup atıldı); eksik bölgeler (güney,batı,kuzey,doğu): 40.8,28.45,40.9,28.7 | 40.8,28.7,40.9,28.95 | 40.9,28.45,41,28.7 | 40.9,28.7,41,28.95 | 40.8,28.95,40.9,29.2 | 40.8,29.2,40.9,29.45 | 40.9,28.95,41,29.2 | 40.9,29.2,41,29.45 | 40.8,29.45,40.9,29.7 | 40.8,29.7,40.9,29.95 | 40.9,29.45,41,29.7 | 40.9,29.7,41,29.95 | 41,27.95,41.1,28.2 | 41,28.2,41.1,28.45 | 41.1,27.95,41.2,28.2 | 41.1,28.2,41.2,28.45 | 41,28.45,41.1,28.7 | 41,28.7,41.1,28.95 | 41.1,28.45,41.2,28.7 | 41.1,28.7,41.2,28.95 | 41,28.95,41.1,29.2 | 41,29.2,41.1,29.45 | 41.1,28.95,41.2,29.2 | 41.1,29.2,41.2,29.45 | 41,29.45,41.1,29.7 | 41,29.7,41.1,29.95 | 41.1,29.45,41.2,29.7 | 41.1,29.7,41.2,29.95 | 41.2,27.95,41.3,28.2 | 41.2,28.2,41.3,28.45 | 41.3,27.95,41.4,28.2 | 41.3,28.2,41.4,28.45 | 41.2,28.45,41.3,28.7 | 41.2,28.7,41.3,28.95 | 41.3,28.45,41.4,28.7 | 41.3,28.7,41.4,28.95 | 41.2,28.95,41.3,29.2 | 41.2,29.2,41.3,29.45 | 41.3,28.95,41.4,29.2 | 41.3,29.2,41.4,29.45 | 41.2,29.45,41.3,29.7 | 41.2,29.7,41.3,29.95 | 41.3,29.45,41.4,29.7 | 41.3,29.7,41.4,29.95 | 41.4,27.95,41.5,28.2 | 41.4,28.2,41.5,28.45 | 41.5,27.95,41.6,28.2 | 41.5,28.2,41.6,28.45 | 41.4,28.45,41.5,28.7 | 41.4,28.7,41.5,28.95 | 41.5,28.45,41.6,28.7 | 41.5,28.7,41.6,28.95 | 41.4,28.95,41.5,29.2 | 41.4,29.2,41.5,29.45 | 41.5,28.95,41.6,29.2 | 41.5,29.2,41.6,29.45 | 41.4,29.45,41.5,29.7 | 41.4,29.7,41.5,29.95 | 41.5,29.45,41.6,29.7 | 41.5,29.7,41.6,29.95.
- Yeme-içme listesi alınamadı; data/food-istanbul.json değiştirilmedi.

## Ankara · OpenStreetMap (ODbL)

- Ham öğe: 3221, herkese açık: 2887, çiftler ayıklanınca: 2526
- Adı olan: 77, kapasitesi olan: 65, ücretli işaretli: 33
- Giriş noktasından türeyen: 78, bina olarak işaretli: 1

- Ankara: yer adları · yer adları: 15 kutu, 12 tam başarılı (eşik %90; sonuç kullanılmadı); eksik bölgeler (güney,batı,kuzey,doğu): 40.225,31.25,40.4375,31.6063 | 40.4375,31.6063,40.65,31.9625 | 40.225,31.9625,40.4375,32.3187 | 40.225,32.3187,40.4375,32.675 | 40.4375,31.9625,40.65,32.3187 | 40.4375,32.3187,40.65,32.675 | 40.225,32.675,40.4375,33.0313 | 40.225,33.0313,40.4375,33.3875 | 40.4375,32.675,40.65,33.0313 | 40.4375,33.0313,40.65,33.3875.
## Ankara · Sonuç

- Adsız otoparklardan yakın yer adı bulunan: 941.
- data/parkings-static-ankara.json: 2526 otopark.
- Yer listesi alınamadı; data/places-ankara.json değiştirilmedi.
- data/rail-ankara.json: 167 istasyon.

## Ankara · Yeme-içme yerleri (OpenStreetMap, inceleme verisi)

- Ankara: yeme-içme · restoran: 15 kutu, 8 tam başarılı; eksik bölgeler (güney,batı,kuzey,doğu): 39.8,31.25,40.0125,31.6063 | 39.8,31.6063,40.0125,31.9625 | 40.0125,31.25,40.225,31.6063 | 40.0125,31.6063,40.225,31.9625 | 39.8,31.9625,40.0125,32.3187 | 39.8,32.3187,40.0125,32.675 | 40.0125,31.9625,40.225,32.3187 | 40.0125,32.3187,40.225,32.675 | 39.8,32.675,40.0125,33.0313 | 39.8,33.0313,40.0125,33.3875 | 40.0125,32.675,40.225,33.0313 | 40.0125,33.0313,40.225,33.3875 | 39.8,33.3875,40.0125,33.7438 | 39.8,33.7438,40.0125,34.1 | 40.0125,33.3875,40.225,33.7438 | 40.0125,33.7438,40.225,34.1 | 40.225,31.25,40.4375,31.6063 | 40.225,31.6063,40.4375,31.9625 | 40.4375,31.25,40.65,31.6063 | 40.4375,31.6063,40.65,31.9625 | 40.225,31.9625,40.4375,32.3187 | 40.225,32.3187,40.4375,32.675 | 40.4375,31.9625,40.65,32.3187 | 40.4375,32.3187,40.65,32.675 | 40.225,32.675,40.4375,33.0313 | 40.225,33.0313,40.4375,33.3875 | 40.4375,32.675,40.65,33.0313 | 40.4375,33.0313,40.65,33.3875.
- Ankara: yeme-içme · kafe, bar, pastane: 15 kutu, 0 tam başarılı (eşik %50; bu grup atıldı); eksik bölgeler (güney,batı,kuzey,doğu): 38.95,31.25,39.1625,31.6063 | 38.95,31.6063,39.1625,31.9625 | 39.1625,31.25,39.375,31.6063 | 39.1625,31.6063,39.375,31.9625 | 38.95,31.9625,39.1625,32.3187 | 38.95,32.3187,39.1625,32.675 | 39.1625,31.9625,39.375,32.3187 | 39.1625,32.3187,39.375,32.675 | 38.95,32.675,39.1625,33.0313 | 38.95,33.0313,39.1625,33.3875 | 39.1625,32.675,39.375,33.0313 | 39.1625,33.0313,39.375,33.3875 | 38.95,33.3875,39.1625,33.7438 | 38.95,33.7438,39.1625,34.1 | 39.1625,33.3875,39.375,33.7438 | 39.1625,33.7438,39.375,34.1 | 39.375,31.25,39.5875,31.6063 | 39.375,31.6063,39.5875,31.9625 | 39.5875,31.25,39.8,31.6063 | 39.5875,31.6063,39.8,31.9625 | 39.375,31.9625,39.5875,32.3187 | 39.375,32.3187,39.5875,32.675 | 39.5875,31.9625,39.8,32.3187 | 39.5875,32.3187,39.8,32.675 | 39.375,32.675,39.5875,33.0313 | 39.375,33.0313,39.5875,33.3875 | 39.5875,32.675,39.8,33.0313 | 39.5875,33.0313,39.8,33.3875 | 39.375,33.3875,39.5875,33.7438 | 39.375,33.7438,39.5875,34.1 | 39.5875,33.3875,39.8,33.7438 | 39.5875,33.7438,39.8,34.1 | 39.8,31.25,40.0125,31.6063 | 39.8,31.6063,40.0125,31.9625 | 40.0125,31.25,40.225,31.6063 | 40.0125,31.6063,40.225,31.9625 | 39.8,31.9625,40.0125,32.3187 | 39.8,32.3187,40.0125,32.675 | 40.0125,31.9625,40.225,32.3187 | 40.0125,32.3187,40.225,32.675 | 39.8,32.675,40.0125,33.0313 | 39.8,33.0313,40.0125,33.3875 | 40.0125,32.675,40.225,33.0313 | 40.0125,33.0313,40.225,33.3875 | 39.8,33.3875,40.0125,33.7438 | 39.8,33.7438,40.0125,34.1 | 40.0125,33.3875,40.225,33.7438 | 40.0125,33.7438,40.225,34.1 | 40.225,31.25,40.4375,31.6063 | 40.225,31.6063,40.4375,31.9625 | 40.4375,31.25,40.65,31.6063 | 40.4375,31.6063,40.65,31.9625 | 40.225,31.9625,40.4375,32.3187 | 40.225,32.3187,40.4375,32.675 | 40.4375,31.9625,40.65,32.3187 | 40.4375,32.3187,40.65,32.675 | 40.225,32.675,40.4375,33.0313 | 40.225,33.0313,40.4375,33.3875 | 40.4375,32.675,40.65,33.0313 | 40.4375,33.0313,40.65,33.3875.
- Ayıklanan (anlamsız ad / yeme-içme dışı): 0
- Toplam: 41 (restaurant 41)
- Mutfak türü: 49%, çalışma saati: 5%, telefon: 12%, web: 2%, Instagram: 2%
- En sık mutfak türleri: turkish 16, kebab 5, fish 1, italian 1, pasta 1, pizza 1, soup 1
- data/food-ankara.json: 798 → 41 kayıt, çok düştü; yazılmadı.

## Bursa · OpenStreetMap (ODbL)

- Ham öğe: 613, herkese açık: 588, çiftler ayıklanınca: 560
- Adı olan: 39, kapasitesi olan: 9, ücretli işaretli: 35
- Giriş noktasından türeyen: 5, bina olarak işaretli: 0

## Bursa açık veri portalı (Açık Yeşil, "otopark" veri seti)

- Veri seti alınamadı (isteğe bağlı kaynak; yalnızca OSM kullanıldı).

- Bursa: yer adları · yer adları: 11 kutu, 7 tam başarılı (eşik %90; sonuç kullanılmadı); eksik bölgeler (güney,batı,kuzey,doğu): 39.9167,29.125,40.1,29.3438 | 40.1,29.3438,40.2833,29.5625 | 40.2833,28.25,40.4667,28.4688 | 40.2833,29.3438,40.4667,29.5625 | 40.4667,29.125,40.65,29.3438 | 40.4667,29.3438,40.65,29.5625 | 40.2833,29.5625,40.4667,29.7813 | 40.2833,29.7813,40.4667,30 | 40.4667,29.5625,40.65,29.7813 | 40.4667,29.7813,40.65,30.
## Bursa · Sonuç

- Adsız otoparklardan yakın yer adı bulunan: 227.
- data/parkings-static-bursa.json: 560 otopark.
- Yer listesi alınamadı; data/places-bursa.json değiştirilmedi.
- data/rail-bursa.json: 89 istasyon.

## Bursa · Yeme-içme yerleri (OpenStreetMap, inceleme verisi)

- Bursa: yeme-içme · restoran: 11 kutu, 11 tam başarılı.
- Bursa: yeme-içme · kafe, bar, pastane: 11 kutu, 2 tam başarılı (eşik %50; bu grup atıldı); eksik bölgeler (güney,batı,kuzey,doğu): 39.55,29.5625,39.7334,29.7813 | 39.55,29.7813,39.7334,30 | 39.7334,29.5625,39.9167,29.7813 | 39.7334,29.7813,39.9167,30 | 39.9167,28.25,40.1,28.4688 | 39.9167,28.4688,40.1,28.6875 | 40.1,28.25,40.2833,28.4688 | 40.1,28.4688,40.2833,28.6875 | 39.9167,28.6875,40.1,28.9063 | 39.9167,28.9063,40.1,29.125 | 40.1,28.6875,40.2833,28.9063 | 40.1,28.9063,40.2833,29.125 | 39.9167,29.125,40.1,29.3438 | 39.9167,29.3438,40.1,29.5625 | 40.1,29.125,40.2833,29.3438 | 40.1,29.3438,40.2833,29.5625 | 39.9167,29.5625,40.1,29.7813 | 39.9167,29.7813,40.1,30 | 40.1,29.5625,40.2833,29.7813 | 40.1,29.7813,40.2833,30 | 40.2833,28.25,40.4667,28.4688 | 40.2833,28.4688,40.4667,28.6875 | 40.4667,28.25,40.65,28.4688 | 40.4667,28.4688,40.65,28.6875 | 40.2833,28.6875,40.4667,28.9063 | 40.2833,28.9063,40.4667,29.125 | 40.4667,28.6875,40.65,28.9063 | 40.4667,28.9063,40.65,29.125 | 40.2833,29.125,40.4667,29.3438 | 40.2833,29.3438,40.4667,29.5625 | 40.4667,29.125,40.65,29.3438 | 40.4667,29.3438,40.65,29.5625 | 40.2833,29.5625,40.4667,29.7813 | 40.2833,29.7813,40.4667,30 | 40.4667,29.5625,40.65,29.7813 | 40.4667,29.7813,40.65,30.
- Ayıklanan (anlamsız ad / yeme-içme dışı): 1
- Toplam: 263 (restaurant 263)
- Mutfak türü: 39%, çalışma saati: 6%, telefon: 11%, web: 7%, Instagram: 2%
- En sık mutfak türleri: turkish 75, kebab 8, regional 7, burger 4, italian 4, steak_house 4, breakfast 3, chicken 3, coffee_shop 3, fish 3, barbecue 2, fish_and_chips 2, grill 2, local 2, pizza 2
- data/food-bursa.json: 263 yer.

## Antalya · OpenStreetMap (ODbL)

- Ham öğe: 1380, herkese açık: 1281, çiftler ayıklanınca: 1204
- Adı olan: 38, kapasitesi olan: 43, ücretli işaretli: 36
- Giriş noktasından türeyen: 8, bina olarak işaretli: 0

- Antalya: yer adları · yer adları: 11 kutu, 11 tam başarılı.
- Antalya: yer adları · bina adları (ağır regex): 11 kutu, 4 tam başarılı (eşik %90; bu grup atıldı); eksik bölgeler (güney,batı,kuzey,doğu): 36.5167,30.1,36.775,30.525 | 36.5167,30.525,36.775,30.95 | 36.775,30.1,37.0333,30.525 | 36.775,30.525,37.0333,30.95 | 36.5167,30.95,36.775,31.375 | 36.5167,31.375,36.775,31.8 | 36.775,30.95,37.0333,31.375 | 36.775,31.375,37.0333,31.8 | 36.5167,31.8,36.775,32.225 | 36.5167,32.225,36.775,32.65 | 36.775,31.8,37.0333,32.225 | 36.775,32.225,37.0333,32.65 | 37.0333,29.25,37.2916,29.675 | 37.0333,29.675,37.2916,30.1 | 37.2916,29.25,37.55,29.675 | 37.2916,29.675,37.55,30.1 | 37.0333,30.1,37.2916,30.525 | 37.0333,30.525,37.2916,30.95 | 37.2916,30.1,37.55,30.525 | 37.2916,30.525,37.55,30.95 | 37.0333,30.95,37.2916,31.375 | 37.0333,31.375,37.2916,31.8 | 37.2916,30.95,37.55,31.375 | 37.2916,31.375,37.55,31.8 | 37.0333,31.8,37.2916,32.225 | 37.0333,32.225,37.2916,32.65 | 37.2916,31.8,37.55,32.225 | 37.2916,32.225,37.55,32.65.
## Antalya · Sonuç

- Adsız otoparklardan yakın yer adı bulunan: 390.
- data/parkings-static-antalya.json: 1204 otopark.
- data/places-antalya.json: 3034 yer (arama için).
- data/rail-antalya.json: 70 istasyon.

## Antalya · Yeme-içme yerleri (OpenStreetMap, inceleme verisi)

- Antalya: yeme-içme · restoran: 11 kutu, 9 tam başarılı; eksik bölgeler (güney,batı,kuzey,doğu): 37.0333,30.95,37.2916,31.375 | 37.0333,31.375,37.2916,31.8 | 37.2916,30.95,37.55,31.375 | 37.2916,31.375,37.55,31.8 | 37.0333,31.8,37.2916,32.225 | 37.0333,32.225,37.2916,32.65 | 37.2916,31.8,37.55,32.225 | 37.2916,32.225,37.55,32.65.
- Antalya: yeme-içme · kafe, bar, pastane: 11 kutu, 0 tam başarılı (eşik %50; bu grup atıldı); eksik bölgeler (güney,batı,kuzey,doğu): 36,29.25,36.2584,29.675 | 36,29.675,36.2584,30.1 | 36.2584,29.25,36.5167,29.675 | 36.2584,29.675,36.5167,30.1 | 36,30.1,36.2584,30.525 | 36,30.525,36.2584,30.95 | 36.2584,30.1,36.5167,30.525 | 36.2584,30.525,36.5167,30.95 | 36,31.8,36.2584,32.225 | 36,32.225,36.2584,32.65 | 36.2584,31.8,36.5167,32.225 | 36.2584,32.225,36.5167,32.65 | 36.5167,29.25,36.775,29.675 | 36.5167,29.675,36.775,30.1 | 36.775,29.25,37.0333,29.675 | 36.775,29.675,37.0333,30.1 | 36.5167,30.1,36.775,30.525 | 36.5167,30.525,36.775,30.95 | 36.775,30.1,37.0333,30.525 | 36.775,30.525,37.0333,30.95 | 36.5167,30.95,36.775,31.375 | 36.5167,31.375,36.775,31.8 | 36.775,30.95,37.0333,31.375 | 36.775,31.375,37.0333,31.8 | 36.5167,31.8,36.775,32.225 | 36.5167,32.225,36.775,32.65 | 36.775,31.8,37.0333,32.225 | 36.775,32.225,37.0333,32.65 | 37.0333,29.25,37.2916,29.675 | 37.0333,29.675,37.2916,30.1 | 37.2916,29.25,37.55,29.675 | 37.2916,29.675,37.55,30.1 | 37.0333,30.1,37.2916,30.525 | 37.0333,30.525,37.2916,30.95 | 37.2916,30.1,37.55,30.525 | 37.2916,30.525,37.55,30.95 | 37.0333,30.95,37.2916,31.375 | 37.0333,31.375,37.2916,31.8 | 37.2916,30.95,37.55,31.375 | 37.2916,31.375,37.55,31.8 | 37.0333,31.8,37.2916,32.225 | 37.0333,32.225,37.2916,32.65 | 37.2916,31.8,37.55,32.225 | 37.2916,32.225,37.55,32.65.
- Ayıklanan (anlamsız ad / yeme-içme dışı): 5
- Toplam: 1220 (restaurant 1220)
- Mutfak türü: 35%, çalışma saati: 13%, telefon: 14%, web: 9%, Instagram: 2%
- En sık mutfak türleri: turkish 196, regional 55, fish 47, pizza 40, kebab 37, burger 35, seafood 30, steak_house 28, chicken 26, italian 26, international 23, coffee_shop 20, breakfast 17, mediterranean 16, barbecue 14
- data/food-antalya.json: 1220 yer.

## Overture Maps (CDLA-Permissive-2.0)

- Release: 2026-09-23.1 (2026-10-16)
- İzmir province polygon: found
- Raw candidates (food kinds inside the polygon): 20431
- Kept (confidence >= 0.7): 13882
- Removed as OSM duplicates: 1061
- Doğrulanmış (2+ kaynak ya da güven ≥ 0,9): 6042
- Ad süzgeciyle atılan: 184 (en sık 10 eşleşen kelime: market 62, lokali 27, catering 24, dernegi 20, dugun salonu 13, organizasyon 10, dugun 7, toptan 7, performance hall 6, ekipmanlari 3)
- Elle kontrolde kapanmış/taşınmış bulunup çıkarılan: 12
- Şüpheli (İzmir dışı sabit hat ya da kasap/şarküteri): 998
- Web sitesi kontrolü: 3457 kontrol edildi, 1766 açık, 1531 açılmıyor, 160 belirsiz
- Kayıt sayıları (İzmir): ham 20431, kapalı 0, kullanılamaz ad 13, ad süzgeci 184, aday 20234; güven < 0.7 6340, Overture içi kopya/boyut sınırı 12, OSM kopyası 1061, elle çıkarılan 12; son 12809
- Önceki çalıştırmaya göre: +0 yeni, −0 kaybolan
- Per kind: bar 807, cafe 3400, fast_food 658, food_court 4, restaurant 7940
- data/food-overture-izmir.json: 1.97 MB

## Overture Maps (CDLA-Permissive-2.0) · İstanbul

- Release: 2026-09-23.1 (2026-10-16)
- İstanbul province polygon: found
- Raw candidates (food kinds inside the polygon): 57906
- Kept (confidence >= 0.7): 38673
- Removed as OSM duplicates: 2261
- Doğrulanmış (2+ kaynak ya da güven ≥ 0,9): 17431
- Ad süzgeciyle atılan: 343 (en sık 10 eşleşen kelime: market 82, catering 76, dernegi 64, organizasyon 23, malzemeleri 23, lokali 21, toptan 10, dugun salonu 10, bakkal 7, makinalari 6)
- Elle kontrolde kapanmış/taşınmış bulunup çıkarılan: 0
- Şüpheli (İstanbul dışı sabit hat ya da kasap/şarküteri): 2923
- Web sitesi kontrolü: 9777 kontrol edildi, 5113 açık, 4018 açılmıyor, 646 belirsiz
- Kayıt sayıları (İstanbul): ham 57906, kapalı 0, kullanılamaz ad 344, ad süzgeci 343, aday 57219; güven < 0.7 18502, Overture içi kopya/boyut sınırı 44, OSM kopyası 2261, elle çıkarılan 0, zayıf kayıt (iletişim bilgisi yok) 0; son 36412
- Önceki çalıştırmaya göre: +0 yeni, −0 kaybolan
- Per kind: bar 1703, cafe 10293, fast_food 2243, food_court 28, restaurant 22145
- data/food-overture-istanbul.json: 5.96 MB

## Overture Maps (CDLA-Permissive-2.0) · Ankara

- Release: 2026-09-23.1 (2026-10-16)
- Ankara province polygon: found
- Raw candidates (food kinds inside the polygon): 14852
- Kept (confidence >= 0.7): 10028
- Removed as OSM duplicates: 350
- Doğrulanmış (2+ kaynak ya da güven ≥ 0,9): 4635
- Ad süzgeciyle atılan: 114 (en sık 10 eşleşen kelime: market 48, lokali 16, catering 14, dernegi 12, organizasyon 5, supermarket 3, dugun salonu 3, makinalari 2, toptan 2, malzemeleri 2)
- Elle kontrolde kapanmış/taşınmış bulunup çıkarılan: 0
- Şüpheli (Ankara dışı sabit hat ya da kasap/şarküteri): 760
- Web sitesi kontrolü: 2514 kontrol edildi, 1514 açık, 834 açılmıyor, 166 belirsiz
- Kayıt sayıları (Ankara): ham 14852, kapalı 0, kullanılamaz ad 20, ad süzgeci 114, aday 14718; güven < 0.7 4675, Overture içi kopya/boyut sınırı 15, OSM kopyası 350, elle çıkarılan 0, zayıf kayıt (iletişim bilgisi yok) 0; son 9678
- Önceki çalıştırmaya göre: +0 yeni, −0 kaybolan
- Per kind: bar 462, cafe 2647, fast_food 645, food_court 8, restaurant 5916
- data/food-overture-ankara.json: 1.57 MB

## Overture Maps (CDLA-Permissive-2.0) · Bursa

- Release: 2026-09-23.1 (2026-10-16)
- Bursa province polygon: found
- Raw candidates (food kinds inside the polygon): 10577
- Kept (confidence >= 0.7): 7090
- Removed as OSM duplicates: 125
- Doğrulanmış (2+ kaynak ya da güven ≥ 0,9): 3366
- Ad süzgeciyle atılan: 92 (en sık 10 eşleşen kelime: market 23, dernegi 23, lokali 16, catering 9, organizasyon 6, bakkal 3, dugun 3, dugun salonu 3, toptan 2, okul 1)
- Elle kontrolde kapanmış/taşınmış bulunup çıkarılan: 0
- Şüpheli (Bursa dışı sabit hat ya da kasap/şarküteri): 417
- Web sitesi kontrolü: 1787 kontrol edildi, 1010 açık, 703 açılmıyor, 74 belirsiz
- Kayıt sayıları (Bursa): ham 10577, kapalı 0, kullanılamaz ad 26, ad süzgeci 92, aday 10459; güven < 0.7 3366, Overture içi kopya/boyut sınırı 3, OSM kopyası 125, elle çıkarılan 0, zayıf kayıt (iletişim bilgisi yok) 0; son 6965
- Önceki çalıştırmaya göre: +1 yeni, −18 kaybolan
- Kaybolanlardan örnekler: Aragula italian özlüce, Atmosfer, BigChefs, Box Eat Lab, Caglayan Et Mangal ve Gazino, Ciğerci Hamza, Dayı Kürek Lahmacun, Karçiçeği Iznik, Köfteci Yusuf, Kofteci Yusuf
- Per kind: bar 242, cafe 1782, fast_food 478, food_court 2, restaurant 4461
- data/food-overture-bursa.json: 1.09 MB

## Overture Maps (CDLA-Permissive-2.0) · Antalya

- Release: 2026-09-23.1 (2026-10-16)
- Antalya province polygon: found
- Raw candidates (food kinds inside the polygon): 14542
- Kept (confidence >= 0.7): 9614
- Removed as OSM duplicates: 522
- Doğrulanmış (2+ kaynak ya da güven ≥ 0,9): 4184
- Ad süzgeciyle atılan: 97 (en sık 10 eşleşen kelime: market 51, catering 10, organizasyon 6, dernegi 6, dugun salonu 5, malzemeleri 4, dugun 3, performance hall 2, bakkal 2, lokali 2)
- Elle kontrolde kapanmış/taşınmış bulunup çıkarılan: 0
- Şüpheli (Antalya dışı sabit hat ya da kasap/şarküteri): 560
- Web sitesi kontrolü: 2425 kontrol edildi, 1363 açık, 966 açılmıyor, 96 belirsiz
- Kayıt sayıları (Antalya): ham 14542, kapalı 0, kullanılamaz ad 27, ad süzgeci 97, aday 14418; güven < 0.7 4798, Overture içi kopya/boyut sınırı 6, OSM kopyası 522, elle çıkarılan 0, zayıf kayıt (iletişim bilgisi yok) 0; son 9092
- Önceki çalıştırmaya göre: +77 yeni, −6 kaybolan
- Kaybolanlardan örnekler: Amoor Beach & Restaurant, Kırmızı Meyhane, Rota 07 Restaurant | Et Balık Meze, Sardelaki, Şişçi İbo Korkuteli Şubesi, Zeugma
- Per kind: bar 840, cafe 1970, fast_food 552, food_court 3, restaurant 5727
- data/food-overture-antalya.json: 1.41 MB

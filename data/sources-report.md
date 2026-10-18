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

- HTTP 200, 5 kayıt

## Sonuç

- İzelman envanteri: 82 otopark.
- OSM'den İzelman ile çakışan 47 kayıt çıkarıldı.
- Adsız otoparklardan yakın yer adı bulunan: 685.
- data/parkings-static.json: 1489 otopark.
- data/tariffs-izmir.json: 24 tarife (İzelman fiyat listesi).
- data/places-izmir.json: 3510 yer (arama için).
- data/rail-izmir.json: 165 istasyon.

## Yeme-içme yerleri (OpenStreetMap, inceleme verisi)

- Ayıklanan (anlamsız ad / yeme-içme dışı): 7
- Toplam: 2436 (bakery 170, bar 82, biergarten 4, cafe 832, confectionery 32, fast_food 414, food_court 24, ice_cream 20, pastry 61, pub 29, restaurant 768)
- Mutfak türü: 26%, çalışma saati: 8%, telefon: 8%, web: 6%, Instagram: 1%
- En sık mutfak türleri: coffee_shop 157, turkish 144, burger 86, pizza 60, kebab 54, chicken 31, sandwich 31, seafood 31, regional 30, fish 22, breakfast 16, dessert 12, italian 10, pasta 10, tea 10
- data/food-izmir.json: 2436 yer.

## İzmir açık veri portalında yeme-içme / turizm veri setleri

- "restoran": sonuç yok
- "lokanta": sonuç yok
- "kafe": İzelman Kitap Kafe Konum Verisi
- "turizm": Bademsu Fabrikası Üretim Verileri · Günübirlik Gezi Tekneleri Bilgileri · Halk Ekmek Büfeleri Satış Noktaları · Halk Ekmek Fabrikası Üretim Verileri · Halkın Bakkalı Siparişi Alınan Paket Tür ve Miktarları · İlçelerde Yaşayan T.C. Vatandaşı ve Yabancı Uyruklu Nüfus  Bilgileri · İzmir İli Müze ve Ören Yerleri Ziyaret Saatleri · İzmir Su Fabrikası Üretim Verileri · Kamu Kurum ve Kuruluşları · Kruvaziyer Gemi Bilgileri · Müze Ziyaretçi İstatistikleri · Ören Yerleri İstatikleri · Turizm Amaçlı Sportif Faaliyetler · Turizm Bilgilendirme Ofisleri Konum Verisi · Turizm Tesisleri · Turuncu Çember Sertifikası Alan İşletmeler Listesi · Yiyecek, İçecek Büfeleri
- "işletme": 1.Sınıf Gayri Müessese Kapsamındaki İşletme Sayısı İle Akaryakıt Ve/Veya Otogaz Satış İstasyonu Sayısı · Günübirlik Gezi Tekneleri Bilgileri · Tesisler ve Atıksu Miktarları · Turizm Amaçlı Sportif Faaliyetler · Turizm Tesisleri

## İstanbul · OpenStreetMap (ODbL)

- Ham öğe: 5905, herkese açık: 5395, çiftler ayıklanınca: 4682
- Adı olan: 583, kapasitesi olan: 166, ücretli işaretli: 486
- Giriş noktasından türeyen: 387, bina olarak işaretli: 4

- İstanbul: yer adları · yer adları: 15 kutu, 12 tam başarılı (eşik %90; sonuç kullanılmadı); eksik bölgeler (güney,batı,kuzey,doğu): 41.5,27.95,41.6,28.2 | 41.4,28.95,41.5,29.2 | 41.4,29.2,41.5,29.45 | 41.5,28.95,41.6,29.2 | 41.5,29.2,41.6,29.45 | 41.4,29.45,41.5,29.7 | 41.4,29.7,41.5,29.95 | 41.5,29.45,41.6,29.7 | 41.5,29.7,41.6,29.95.
## İstanbul · Sonuç

- Adsız otoparklardan yakın yer adı bulunan: 2005.
- data/parkings-static-istanbul.json: 4682 otopark.
- Yer listesi alınamadı; data/places-istanbul.json değiştirilmedi.
- data/rail-istanbul.json: 296 istasyon.

## İstanbul · Yeme-içme yerleri (OpenStreetMap, inceleme verisi)

- İstanbul: yeme-içme · restoran: 15 kutu, 15 tam başarılı.
- İstanbul: yeme-içme · kafe, bar, pastane: 15 kutu, 2 tam başarılı (eşik %50; sonuç kullanılmadı); eksik bölgeler (güney,batı,kuzey,doğu): 40.8,29.45,40.9,29.7 | 40.8,29.7,40.9,29.95 | 40.9,29.45,41,29.7 | 40.9,29.7,41,29.95 | 41,27.95,41.1,28.2 | 41,28.2,41.1,28.45 | 41.1,27.95,41.2,28.2 | 41.1,28.2,41.2,28.45 | 41,28.45,41.1,28.7 | 41,28.7,41.1,28.95 | 41.1,28.45,41.2,28.7 | 41.1,28.7,41.2,28.95 | 41,28.95,41.1,29.2 | 41,29.2,41.1,29.45 | 41.1,28.95,41.2,29.2 | 41.1,29.2,41.2,29.45 | 41,29.45,41.1,29.7 | 41,29.7,41.1,29.95 | 41.1,29.45,41.2,29.7 | 41.1,29.7,41.2,29.95 | 41.2,27.95,41.3,28.2 | 41.2,28.2,41.3,28.45 | 41.3,27.95,41.4,28.2 | 41.3,28.2,41.4,28.45 | 41.2,28.45,41.3,28.7 | 41.2,28.7,41.3,28.95 | 41.3,28.45,41.4,28.7 | 41.3,28.7,41.4,28.95 | 41.2,28.95,41.3,29.2 | 41.2,29.2,41.3,29.45 | 41.3,28.95,41.4,29.2 | 41.3,29.2,41.4,29.45 | 41.2,29.45,41.3,29.7 | 41.2,29.7,41.3,29.95 | 41.3,29.45,41.4,29.7 | 41.3,29.7,41.4,29.95 | 41.4,27.95,41.5,28.2 | 41.4,28.2,41.5,28.45 | 41.5,27.95,41.6,28.2 | 41.5,28.2,41.6,28.45 | 41.4,28.45,41.5,28.7 | 41.4,28.7,41.5,28.95 | 41.5,28.45,41.6,28.7 | 41.5,28.7,41.6,28.95 | 41.4,28.95,41.5,29.2 | 41.4,29.2,41.5,29.45 | 41.5,28.95,41.6,29.2 | 41.5,29.2,41.6,29.45 | 41.4,29.45,41.5,29.7 | 41.4,29.7,41.5,29.95 | 41.5,29.45,41.6,29.7 | 41.5,29.7,41.6,29.95.
- Yeme-içme listesi alınamadı; data/food-istanbul.json değiştirilmedi.

## Ankara · OpenStreetMap (ODbL)

- Ham öğe: 3222, herkese açık: 2888, çiftler ayıklanınca: 2527
- Adı olan: 77, kapasitesi olan: 65, ücretli işaretli: 33
- Giriş noktasından türeyen: 78, bina olarak işaretli: 1

- Ankara: yer adları · yer adları: 16 kutu, 13 tam başarılı (eşik %90; sonuç kullanılmadı); eksik bölgeler (güney,batı,kuzey,doğu): 40.4813,32.1125,40.75,32.55 | 40.2125,32.55,40.4813,32.9875 | 40.2125,32.9875,40.4813,33.425 | 40.4813,32.55,40.75,32.9875 | 40.4813,32.9875,40.75,33.425 | 40.2125,33.425,40.4813,33.8625 | 40.2125,33.8625,40.4813,34.3 | 40.4813,33.425,40.75,33.8625 | 40.4813,33.8625,40.75,34.3.
## Ankara · Sonuç

- Adsız otoparklardan yakın yer adı bulunan: 942.
- data/parkings-static-ankara.json: 2527 otopark.
- Yer listesi alınamadı; data/places-ankara.json değiştirilmedi.
- data/rail-ankara.json: 156 istasyon.

## Ankara · Yeme-içme yerleri (OpenStreetMap, inceleme verisi)

- Ankara: yeme-içme · restoran: 16 kutu, 11 tam başarılı (eşik %50; sonuç kullanılmadı); eksik bölgeler (güney,batı,kuzey,doğu): 39.675,33.425,39.9437,33.8625 | 39.675,33.8625,39.9437,34.3 | 39.9437,33.425,40.2125,33.8625 | 39.9437,33.8625,40.2125,34.3 | 40.2125,30.8,40.4813,31.2375 | 40.2125,31.2375,40.4813,31.675 | 40.4813,30.8,40.75,31.2375 | 40.4813,31.2375,40.75,31.675 | 40.2125,31.675,40.4813,32.1125 | 40.2125,32.1125,40.4813,32.55 | 40.4813,31.675,40.75,32.1125 | 40.4813,32.1125,40.75,32.55 | 40.2125,32.55,40.4813,32.9875 | 40.2125,32.9875,40.4813,33.425 | 40.4813,32.55,40.75,32.9875 | 40.4813,32.9875,40.75,33.425 | 40.2125,33.425,40.4813,33.8625 | 40.2125,33.8625,40.4813,34.3 | 40.4813,33.425,40.75,33.8625 | 40.4813,33.8625,40.75,34.3.
- Yeme-içme listesi alınamadı; data/food-ankara.json değiştirilmedi.

## Bursa · OpenStreetMap (ODbL)

- Ham öğe: 596, herkese açık: 572, çiftler ayıklanınca: 539
- Adı olan: 39, kapasitesi olan: 9, ücretli işaretli: 34
- Giriş noktasından türeyen: 6, bina olarak işaretli: 0

## Bursa açık veri portalı (Açık Yeşil, "otopark" veri seti)

- Veri seti alınamadı (isteğe bağlı kaynak; yalnızca OSM kullanıldı).

- Bursa: yer adları · yer adları: 11 kutu, 11 tam başarılı.
- Bursa: yer adları · bina adları (ağır regex): 11 kutu, 7 tam başarılı (eşik %90; sonuç kullanılmadı); eksik bölgeler (güney,batı,kuzey,doğu): 40.2833,28.25,40.4667,28.4688 | 40.2833,28.4688,40.4667,28.6875 | 40.4667,28.25,40.65,28.4688 | 40.4667,28.4688,40.65,28.6875 | 40.2833,28.6875,40.4667,28.9063 | 40.2833,28.9063,40.4667,29.125 | 40.4667,28.6875,40.65,28.9063 | 40.4667,28.9063,40.65,29.125 | 40.2833,29.125,40.4667,29.3438 | 40.2833,29.3438,40.4667,29.5625 | 40.4667,29.125,40.65,29.3438 | 40.4667,29.3438,40.65,29.5625 | 40.2833,29.5625,40.4667,29.7813 | 40.2833,29.7813,40.4667,30 | 40.4667,29.5625,40.65,29.7813 | 40.4667,29.7813,40.65,30.
## Bursa · Sonuç

- Adsız otoparklardan yakın yer adı bulunan: 218.
- data/parkings-static-bursa.json: 539 otopark.
- Yer listesi alınamadı; data/places-bursa.json değiştirilmedi.
- data/rail-bursa.json: 89 istasyon.

## Bursa · Yeme-içme yerleri (OpenStreetMap, inceleme verisi)

- Bursa: yeme-içme · restoran: 11 kutu, 8 tam başarılı (eşik %50; sonuç kullanılmadı); eksik bölgeler (güney,batı,kuzey,doğu): 40.2833,28.6875,40.4667,28.9063 | 40.2833,28.9063,40.4667,29.125 | 40.4667,28.6875,40.65,28.9063 | 40.4667,28.9063,40.65,29.125 | 40.2833,29.125,40.4667,29.3438 | 40.2833,29.3438,40.4667,29.5625 | 40.4667,29.125,40.65,29.3438 | 40.4667,29.3438,40.65,29.5625 | 40.2833,29.5625,40.4667,29.7813 | 40.2833,29.7813,40.4667,30 | 40.4667,29.5625,40.65,29.7813 | 40.4667,29.7813,40.65,30.
- Yeme-içme listesi alınamadı; data/food-bursa.json değiştirilmedi.

## Antalya · OpenStreetMap (ODbL)

- Ham öğe: 1381, herkese açık: 1282, çiftler ayıklanınca: 1205
- Adı olan: 38, kapasitesi olan: 43, ücretli işaretli: 36
- Giriş noktasından türeyen: 8, bina olarak işaretli: 0

- Antalya: yer adları · yer adları: 11 kutu, 11 tam başarılı.
- Antalya: yer adları · bina adları (ağır regex): 11 kutu, 7 tam başarılı (eşik %90; sonuç kullanılmadı); eksik bölgeler (güney,batı,kuzey,doğu): 37.0333,29.25,37.2916,29.675 | 37.0333,29.675,37.2916,30.1 | 37.2916,29.25,37.55,29.675 | 37.2916,29.675,37.55,30.1 | 37.0333,30.1,37.2916,30.525 | 37.0333,30.525,37.2916,30.95 | 37.2916,30.1,37.55,30.525 | 37.2916,30.525,37.55,30.95 | 37.0333,30.95,37.2916,31.375 | 37.0333,31.375,37.2916,31.8 | 37.2916,30.95,37.55,31.375 | 37.2916,31.375,37.55,31.8 | 37.0333,31.8,37.2916,32.225 | 37.0333,32.225,37.2916,32.65 | 37.2916,31.8,37.55,32.225 | 37.2916,32.225,37.55,32.65.
## Antalya · Sonuç

- Adsız otoparklardan yakın yer adı bulunan: 390.
- data/parkings-static-antalya.json: 1205 otopark.
- Yer listesi alınamadı; data/places-antalya.json değiştirilmedi.
- data/rail-antalya.json: 70 istasyon.

## Antalya · Yeme-içme yerleri (OpenStreetMap, inceleme verisi)

- Antalya: yeme-içme · restoran: 11 kutu, 9 tam başarılı (eşik %50; sonuç kullanılmadı); eksik bölgeler (güney,batı,kuzey,doğu): 37.0333,30.95,37.2916,31.375 | 37.0333,31.375,37.2916,31.8 | 37.2916,30.95,37.55,31.375 | 37.2916,31.375,37.55,31.8 | 37.0333,31.8,37.2916,32.225 | 37.0333,32.225,37.2916,32.65 | 37.2916,31.8,37.55,32.225 | 37.2916,32.225,37.55,32.65.
- Yeme-içme listesi alınamadı; data/food-antalya.json değiştirilmedi.

## Overture Maps (CDLA-Permissive-2.0)

- Release: 2026-09-23.1 (2026-10-18)
- İzmir province polygon: found
- Raw candidates (food kinds inside the polygon): 20431
- Kept (confidence >= 0.7): 13882
- Removed as OSM duplicates: 1063
- Doğrulanmış (2+ kaynak ya da güven ≥ 0,9): 6042
- Ad süzgeciyle atılan: 184 (en sık 10 eşleşen kelime: market 62, lokali 27, catering 24, dernegi 20, dugun salonu 13, organizasyon 10, dugun 7, toptan 7, performance hall 6, ekipmanlari 3)
- Elle kontrolde kapanmış/taşınmış bulunup çıkarılan: 12
- Şüpheli (İzmir dışı sabit hat ya da kasap/şarküteri): 925
- Web sitesi kontrolü: 3457 kontrol edildi, 1721 açık, 1412 açılmıyor, 324 belirsiz
- Kayıt sayıları (İzmir): ham 20431, kapalı 0, kullanılamaz ad 13, ad süzgeci 184, aday 20234; güven < 0.7 6340, Overture içi kopya/boyut sınırı 12, OSM kopyası 1063, elle çıkarılan 12; son 12807
- Önceki çalıştırmaya göre: +0 yeni, −0 kaybolan
- Per kind: bar 807, cafe 3400, fast_food 658, food_court 4, restaurant 7938
- data/food-overture-izmir.json: 1.98 MB

## Overture Maps (CDLA-Permissive-2.0) · İstanbul

- Release: 2026-09-23.1 (2026-10-18)
- İstanbul province polygon: found
- Raw candidates (food kinds inside the polygon): 57906
- Kept (confidence >= 0.7): 38673
- Removed as OSM duplicates: 2261
- Doğrulanmış (2+ kaynak ya da güven ≥ 0,9): 17431
- Ad süzgeciyle atılan: 343 (en sık 10 eşleşen kelime: market 82, catering 76, dernegi 64, organizasyon 23, malzemeleri 23, lokali 21, toptan 10, dugun salonu 10, bakkal 7, makinalari 6)
- Elle kontrolde kapanmış/taşınmış bulunup çıkarılan: 0
- Şüpheli (İstanbul dışı sabit hat ya da kasap/şarküteri): 2724
- Web sitesi kontrolü: 9777 kontrol edildi, 5036 açık, 3703 açılmıyor, 1038 belirsiz
- Kayıt sayıları (İstanbul): ham 57906, kapalı 0, kullanılamaz ad 344, ad süzgeci 343, aday 57219; güven < 0.7 18502, Overture içi kopya/boyut sınırı 44, OSM kopyası 2261, elle çıkarılan 0, zayıf kayıt (iletişim bilgisi yok) 0; son 36412
- Önceki çalıştırmaya göre: +0 yeni, −0 kaybolan
- Per kind: bar 1703, cafe 10293, fast_food 2243, food_court 28, restaurant 22145
- data/food-overture-istanbul.json: 5.97 MB

## Overture Maps (CDLA-Permissive-2.0) · Ankara

- Release: 2026-09-23.1 (2026-10-18)
- Ankara province polygon: found
- Raw candidates (food kinds inside the polygon): 14852
- Kept (confidence >= 0.7): 10028
- Removed as OSM duplicates: 350
- Doğrulanmış (2+ kaynak ya da güven ≥ 0,9): 4635
- Ad süzgeciyle atılan: 114 (en sık 10 eşleşen kelime: market 48, lokali 16, catering 14, dernegi 12, organizasyon 5, supermarket 3, dugun salonu 3, makinalari 2, toptan 2, malzemeleri 2)
- Elle kontrolde kapanmış/taşınmış bulunup çıkarılan: 0
- Şüpheli (Ankara dışı sabit hat ya da kasap/şarküteri): 711
- Web sitesi kontrolü: 2514 kontrol edildi, 1274 açık, 973 açılmıyor, 267 belirsiz
- Kayıt sayıları (Ankara): ham 14852, kapalı 0, kullanılamaz ad 20, ad süzgeci 114, aday 14718; güven < 0.7 4675, Overture içi kopya/boyut sınırı 15, OSM kopyası 350, elle çıkarılan 0, zayıf kayıt (iletişim bilgisi yok) 0; son 9678
- Önceki çalıştırmaya göre: +0 yeni, −0 kaybolan
- Per kind: bar 462, cafe 2647, fast_food 645, food_court 8, restaurant 5916
- data/food-overture-ankara.json: 1.57 MB

## Overture Maps (CDLA-Permissive-2.0) · Bursa

- Release: 2026-09-23.1 (2026-10-18)
- Bursa province polygon: found
- Raw candidates (food kinds inside the polygon): 10577
- Kept (confidence >= 0.7): 7090
- Removed as OSM duplicates: 125
- Doğrulanmış (2+ kaynak ya da güven ≥ 0,9): 3366
- Ad süzgeciyle atılan: 92 (en sık 10 eşleşen kelime: market 23, dernegi 23, lokali 16, catering 9, organizasyon 6, bakkal 3, dugun 3, dugun salonu 3, toptan 2, okul 1)
- Elle kontrolde kapanmış/taşınmış bulunup çıkarılan: 0
- Şüpheli (Bursa dışı sabit hat ya da kasap/şarküteri): 388
- Web sitesi kontrolü: 1787 kontrol edildi, 950 açık, 661 açılmıyor, 176 belirsiz
- Kayıt sayıları (Bursa): ham 10577, kapalı 0, kullanılamaz ad 26, ad süzgeci 92, aday 10459; güven < 0.7 3366, Overture içi kopya/boyut sınırı 3, OSM kopyası 125, elle çıkarılan 0, zayıf kayıt (iletişim bilgisi yok) 0; son 6965
- Önceki çalıştırmaya göre: +0 yeni, −0 kaybolan
- Per kind: bar 242, cafe 1782, fast_food 478, food_court 2, restaurant 4461
- data/food-overture-bursa.json: 1.09 MB

## Overture Maps (CDLA-Permissive-2.0) · Antalya

- Release: 2026-09-23.1 (2026-10-18)
- Antalya province polygon: found
- Raw candidates (food kinds inside the polygon): 14542
- Kept (confidence >= 0.7): 9614
- Removed as OSM duplicates: 522
- Doğrulanmış (2+ kaynak ya da güven ≥ 0,9): 4184
- Ad süzgeciyle atılan: 97 (en sık 10 eşleşen kelime: market 51, catering 10, organizasyon 6, dernegi 6, dugun salonu 5, malzemeleri 4, dugun 3, performance hall 2, bakkal 2, lokali 2)
- Elle kontrolde kapanmış/taşınmış bulunup çıkarılan: 0
- Şüpheli (Antalya dışı sabit hat ya da kasap/şarküteri): 516
- Web sitesi kontrolü: 2425 kontrol edildi, 1330 açık, 883 açılmıyor, 212 belirsiz
- Kayıt sayıları (Antalya): ham 14542, kapalı 0, kullanılamaz ad 27, ad süzgeci 97, aday 14418; güven < 0.7 4798, Overture içi kopya/boyut sınırı 6, OSM kopyası 522, elle çıkarılan 0, zayıf kayıt (iletişim bilgisi yok) 0; son 9092
- Önceki çalıştırmaya göre: +0 yeni, −0 kaybolan
- Per kind: bar 840, cafe 1970, fast_food 552, food_court 3, restaurant 5727
- data/food-overture-antalya.json: 1.41 MB

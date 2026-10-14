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

## Sonuç

- İzelman envanteri: 82 otopark.
- OSM'den İzelman ile çakışan 47 kayıt çıkarıldı.
- Adsız otoparklardan yakın yer adı bulunan: 685.
- data/parkings-static.json: 1489 otopark.
- data/places-izmir.json: 3509 yer (arama için).
- data/rail-izmir.json: 165 istasyon.

## Yeme-içme yerleri (OpenStreetMap, inceleme verisi)

- Overpass alınamadı (yeme-içme; tüm sunucular ve denemeler).
- Yeme-içme listesi alınamadı; data/food-izmir.json değiştirilmedi.

## İzmir açık veri portalında yeme-içme / turizm veri setleri

- "restoran": sonuç yok
- "lokanta": sonuç yok
- "kafe": İzelman Kitap Kafe Konum Verisi
- "turizm": Bademsu Fabrikası Üretim Verileri · Günübirlik Gezi Tekneleri Bilgileri · Halk Ekmek Büfeleri Satış Noktaları · Halk Ekmek Fabrikası Üretim Verileri · Halkın Bakkalı Siparişi Alınan Paket Tür ve Miktarları · İlçelerde Yaşayan T.C. Vatandaşı ve Yabancı Uyruklu Nüfus  Bilgileri · İzmir İli Müze ve Ören Yerleri Ziyaret Saatleri · İzmir Su Fabrikası Üretim Verileri · Kamu Kurum ve Kuruluşları · Kruvaziyer Gemi Bilgileri · Müze Ziyaretçi İstatistikleri · Ören Yerleri İstatikleri · Turizm Amaçlı Sportif Faaliyetler · Turizm Bilgilendirme Ofisleri Konum Verisi · Turizm Tesisleri · Turuncu Çember Sertifikası Alan İşletmeler Listesi · Yiyecek, İçecek Büfeleri
- "işletme": 1.Sınıf Gayri Müessese Kapsamındaki İşletme Sayısı İle Akaryakıt Ve/Veya Otogaz Satış İstasyonu Sayısı · Günübirlik Gezi Tekneleri Bilgileri · Tesisler ve Atıksu Miktarları · Turizm Amaçlı Sportif Faaliyetler · Turizm Tesisleri

## İstanbul · OpenStreetMap (ODbL)

- Ham öğe: 5615, herkese açık: 5151, çiftler ayıklanınca: 4523
- Adı olan: 574, kapasitesi olan: 157, ücretli işaretli: 459
- Giriş noktasından türeyen: 398, bina olarak işaretli: 0

- Overpass alınamadı (İstanbul: yer adları 2/4; tüm sunucular ve denemeler).
- Uyarı: yedek yer listesi okunamadı (ENOENT: no such file or directory, open '/home/runner/work/yerim-var-/yerim-var-/data/places-istanbul.json'); adsız otoparklar adlandırılmadı.
## İstanbul · Sonuç

- Adsız otoparklardan yakın yer adı bulunan: 0.
- data/parkings-static-istanbul.json: 4523 otopark.
- Yer listesi alınamadı; data/places-istanbul.json değiştirilmedi.
- data/rail-istanbul.json: 296 istasyon.

## İstanbul · Yeme-içme yerleri (OpenStreetMap, inceleme verisi)

- Overpass alınamadı (İstanbul: yeme-içme 1/3; tüm sunucular ve denemeler).
- Yeme-içme listesi alınamadı; data/food-istanbul.json değiştirilmedi.

## Overture Maps (CDLA-Permissive-2.0)

- Release: 2026-09-23.1 (2026-10-14)
- İzmir province polygon: found
- Raw candidates (food kinds inside the polygon): 20431
- Kept (confidence >= 0.6): 15730
- Removed as OSM duplicates: 1099
- Doğrulanmış (2+ kaynak ya da güven ≥ 0,9): 6048
- Ad süzgeciyle atılan: 184 (en sık 10 eşleşen kelime: market 62, lokali 27, catering 24, dernegi 20, dugun salonu 13, organizasyon 10, dugun 7, toptan 7, performance hall 6, ekipmanlari 3)
- Elle kontrolde kapanmış/taşınmış bulunup çıkarılan: 13
- Şüpheli (İzmir dışı sabit hat ya da kasap/şarküteri): 1113
- Web sitesi kontrolü: 3000 kontrol edildi, 1482 açık, 1385 açılmıyor, 133 belirsiz
- Önceki çalıştırmaya göre: +0 yeni, −0 kaybolan
- Per kind: bar 957, cafe 3871, fast_food 747, food_court 4, restaurant 9052
- data/food-overture-izmir.json: 2.21 MB

## Overture Maps (CDLA-Permissive-2.0) · İstanbul

- Release: 2026-09-23.1 (2026-10-14)
- İstanbul province polygon: found
- Raw candidates (food kinds inside the polygon): 57906
- Kept (confidence >= 0.9): 13842
- Removed as OSM duplicates: 0
- Doğrulanmış (2+ kaynak ya da güven ≥ 0,9): 13794
- Ad süzgeciyle atılan: 343 (en sık 10 eşleşen kelime: market 82, catering 76, dernegi 64, organizasyon 23, malzemeleri 23, lokali 21, toptan 10, dugun salonu 10, bakkal 7, makinalari 6)
- Elle kontrolde kapanmış/taşınmış bulunup çıkarılan: 0
- Şüpheli (İstanbul dışı sabit hat ya da kasap/şarküteri): 48
- Web sitesi kontrolü: 3000 kontrol edildi, 1739 açık, 1120 açılmıyor, 141 belirsiz
- Önceki çalıştırmaya göre: +13842 yeni, −0 kaybolan
- Per kind: bar 636, cafe 3645, fast_food 771, restaurant 8790
- data/food-overture-istanbul.json: 2.46 MB

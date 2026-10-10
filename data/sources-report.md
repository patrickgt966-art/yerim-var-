# Veri kaynakları raporu

## OpenStreetMap (ODbL)

- Ham öğe: 1729, herkese açık: 1576, çiftler ayıklanınca: 1454
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
- data/places-izmir.json: 3504 yer (arama için).

## Yeme-içme yerleri (OpenStreetMap, inceleme verisi)

- Ayıklanan (anlamsız ad / yeme-içme dışı): 7
- Toplam: 2435 (bakery 170, bar 82, biergarten 4, cafe 832, confectionery 32, fast_food 414, food_court 24, ice_cream 20, pastry 61, pub 29, restaurant 767)
- Mutfak türü: 26%, çalışma saati: 8%, telefon: 8%, web: 6%, Instagram: 1%
- En sık mutfak türleri: coffee_shop 157, turkish 144, burger 85, pizza 60, kebab 54, chicken 31, sandwich 31, seafood 31, regional 30, fish 22, breakfast 16, dessert 12, italian 10, pasta 10, tea 10
- data/food-izmir.json: 2435 yer.

## İzmir açık veri portalında yeme-içme / turizm veri setleri

- "restoran": sonuç yok
- "lokanta": sonuç yok
- "kafe": İzelman Kitap Kafe Konum Verisi
- "turizm": Bademsu Fabrikası Üretim Verileri · Günübirlik Gezi Tekneleri Bilgileri · Halk Ekmek Büfeleri Satış Noktaları · Halk Ekmek Fabrikası Üretim Verileri · Halkın Bakkalı Siparişi Alınan Paket Tür ve Miktarları · İlçelerde Yaşayan T.C. Vatandaşı ve Yabancı Uyruklu Nüfus  Bilgileri · İzmir İli Müze ve Ören Yerleri Ziyaret Saatleri · İzmir Su Fabrikası Üretim Verileri · Kamu Kurum ve Kuruluşları · Kruvaziyer Gemi Bilgileri · Müze Ziyaretçi İstatistikleri · Ören Yerleri İstatikleri · Turizm Amaçlı Sportif Faaliyetler · Turizm Bilgilendirme Ofisleri Konum Verisi · Turizm Tesisleri · Turuncu Çember Sertifikası Alan İşletmeler Listesi · Yiyecek, İçecek Büfeleri
- "işletme": 1.Sınıf Gayri Müessese Kapsamındaki İşletme Sayısı İle Akaryakıt Ve/Veya Otogaz Satış İstasyonu Sayısı · Günübirlik Gezi Tekneleri Bilgileri · Tesisler ve Atıksu Miktarları · Turizm Amaçlı Sportif Faaliyetler · Turizm Tesisleri

## Overture Maps (CDLA-Permissive-2.0)

- Release: 2026-09-23.1 (2026-10-10)
- Izmir province polygon: found
- Raw candidates (food kinds inside the polygon): 20431
- Kept (confidence >= 0.6): 15743
- Removed as OSM duplicates: 1099
- Doğrulanmış (2+ kaynak ya da güven ≥ 0,9): 6053
- Ad süzgeciyle atılan: 184 (en sık 10 eşleşen kelime: market 62, lokali 27, catering 24, dernegi 20, dugun salonu 13, organizasyon 10, dugun 7, toptan 7, performance hall 6, ekipmanlari 3)
- Şüpheli (İzmir dışı sabit hat ya da kasap/şarküteri): 162
- Web sitesi kontrolü: yapılmadı (önbellek yok)
- Önceki çalıştırmaya göre: +0 yeni, −0 kaybolan
- Per kind: bar 957, cafe 3874, fast_food 747, food_court 4, restaurant 9062
- data/food-overture-izmir.json: 2.27 MB

# Veri kaynakları raporu

## OpenStreetMap (ODbL)

- Ham öğe: 1651, herkese açık: 1504, çiftler ayıklanınca: 1431
- Adı olan: 51, kapasitesi olan: 41, ücretli işaretli: 73

## İzmir açık veri portalı ("otopark" araması)

- **İzelman Otoparkları Lokasyon, Kapasite ve Çalışma Saati Verisi** / Mustafa Kemal Sahil Bulvarı Bariyerli Abone Otoparkları (CSV, Izmir Metropolitan Municipality Open Data License, güncelleme: 2022-11-28T06:28:24.682391) — 17 kayıt; alanlar: _id:int, BLOK_ADI:text, ILCE:text, MAHALLE:text, ADRES_VEYA_TARIF:text, ACILIS_SAATI:text, KAPANIS_SAATI:text, KAPASITE:numeric, ENLEM:numeric, BOYLAM:numeric
- **Otopark Doluluk ve Lokasyon Bilgileri** / Otopark doluluk adetleri ve lokasyonları (API, Izmir Metropolitan Municipality Open Data License, güncelleme: ?)
- **İzelman Otoparkları Lokasyon, Kapasite ve Çalışma Saati Verisi** / Kapalı Alan Otoparklar (CSV, Izmir Metropolitan Municipality Open Data License, güncelleme: 2022-11-25T13:43:59.698909) — 23 kayıt; alanlar: _id:int, OTOPARK_ADI:text, ILCE:text, MAHALLE:text, ADRES:text, EK_BILGI:text, ACILIS_SAATI:text, KAPANIS_SAATI:text, KAPASITE:numeric, ENLEM:numeric, BOYLAM:numeric
- **Otopark Ücretleri** / Otopark Ücretleri  (CSV, Izmir Metropolitan Municipality Open Data License, güncelleme: 2024-09-02T06:55:29.106194) — 39 kayıt; alanlar: _id:int, Otopark / Fiyat:text, 0-1 Saat:numeric, 0-2 saat:numeric, 2-4 saat:numeric, 4-6 saat:numeric, 0-3 saat:text, 0-6 saat:numeric, 3-6 saat:text, 6-12 saat:numeric, 0-12 saat:numeric, 12-24 saat:numeric, 0-24 saat:numeric, 0-24 Saat(Motosiklet ):numeric, 0-12 Saat(Motosiklet ):text, 17:00-09:00 Arası (16 Saat):numeric, 19:00-09:00 Arası (14 Saat):numeric, Kayıp Bilet:numeric, Aylık Abone Ücreti:numeric, Motosiklet Aylık Abone Ücreti:numeric, 0-24 Saat(Engelli Aracı ):numeric
- **İzelman Otoparkları Lokasyon, Kapasite ve Çalışma Saati Verisi** / Yol Kenarı Dışındaki Açık Alan Otoparklar (CSV, Izmir Metropolitan Municipality Open Data License, güncelleme: 2022-11-28T06:02:45.656699) — 11 kayıt; alanlar: _id:int, OTOPARK_ADI:text, ILCE:text, MAHALLE:text, ADRES:text, YER_TARIFI:text, ACILIS_SAATI:text, KAPANIS_SAATI:text, KAPASITE:numeric, ENLEM:numeric, BOYLAM:numeric
- **İzelman Otoparkları Lokasyon, Kapasite ve Çalışma Saati Verisi** / Yol Kenarı Otoparklar (CSV, Izmir Metropolitan Municipality Open Data License, güncelleme: 2022-11-25T13:48:25.182198) — 48 kayıt; alanlar: _id:int, OTOPARK_ADI:text, ILCE:text, MAHALLE:text, ADRES_VEYA_TARIF:text, ACILIS_SAATI:text, KAPANIS_SAATI:text, KAPASITE:numeric, ENLEM:numeric, BOYLAM:numeric
- **Otopark Ücretleri** / Otopark Ücretleri (XLSX, Izmir Metropolitan Municipality Open Data License, güncelleme: 2026-02-16T07:39:54.714199) — 32 kayıt; alanlar: _id:int, Otopark / Fiyat:text, 0-1 Saat:numeric, 0-2 saat:numeric, 2-4 saat:numeric, 4-6 saat:numeric, 0-3 saat:text, 0-6 saat:numeric, 3-6 saat:text, 6-12 saat:numeric, 1-12 saat:numeric, 0-12 saat:numeric, 12-24 saat:numeric, 0-24 saat:numeric, 0-12 Saat(Motosiklet ):numeric, 12-24 Saat(Motosiklet ):numeric, 0-24 Saat(Motosiklet ):numeric, Kayıp Bilet:numeric, Aylık Abone Ücreti:numeric, Aylık Alan Abonelik Ücreti:numeric, Motosiklet Aylık Abone Ücreti:numeric, 0-12 Saat(Engelli Aracı ):numeric, 12-24 Saat(Engelli Aracı ):numeric, 0-24 Saat(Engelli Aracı ):numeric

## Canlı doluluk API erişimi (GitHub sunucusundan)

- HTTP 200, 7 kayıt

## Sonuç

- İzelman envanteri: 82 otopark.
- OSM'den İzelman ile çakışan 47 kayıt çıkarıldı.
- Adsız otoparklardan yakın yer adı bulunan: 668.
- data/parkings-static.json: 1466 otopark.
- Yer listesi alınamadı; data/places-izmir.json değiştirilmedi.

## Yeme-içme yerleri (OpenStreetMap, inceleme verisi)

- Overpass alınamadı (yeme-içme; tüm sunucular ve denemeler).
- Yeme-içme listesi alınamadı; data/food-izmir.json değiştirilmedi.

## İzmir açık veri portalında yeme-içme / turizm veri setleri

- "restoran": sonuç yok
- "lokanta": sonuç yok
- "kafe": İzelman Kitap Kafe Konum Verisi
- "turizm": Bademsu Fabrikası Üretim Verileri · Günübirlik Gezi Tekneleri Bilgileri · Halk Ekmek Büfeleri Satış Noktaları · Halk Ekmek Fabrikası Üretim Verileri · Halkın Bakkalı Siparişi Alınan Paket Tür ve Miktarları · İlçelerde Yaşayan T.C. Vatandaşı ve Yabancı Uyruklu Nüfus  Bilgileri · İzmir İli Müze ve Ören Yerleri Ziyaret Saatleri · İzmir Su Fabrikası Üretim Verileri · Kamu Kurum ve Kuruluşları · Kruvaziyer Gemi Bilgileri · Müze Ziyaretçi İstatistikleri · Ören Yerleri İstatikleri · Turizm Amaçlı Sportif Faaliyetler · Turizm Bilgilendirme Ofisleri Konum Verisi · Turizm Tesisleri · Turuncu Çember Sertifikası Alan İşletmeler Listesi · Yiyecek, İçecek Büfeleri
- "işletme": 1.Sınıf Gayri Müessese Kapsamındaki İşletme Sayısı İle Akaryakıt Ve/Veya Otogaz Satış İstasyonu Sayısı · Günübirlik Gezi Tekneleri Bilgileri · Tesisler ve Atıksu Miktarları · Turizm Amaçlı Sportif Faaliyetler · Turizm Tesisleri

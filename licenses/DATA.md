# Veri lisansları

Uygulamanın kodu MIT lisanslıdır. Uygulamayla birlikte dağıtılan ve uygulamanın kullandığı **veriler** kendi lisanslarına tabidir.

## İzmir Büyükşehir Belediyesi Açık Veri

- Kaynak: https://acikveri.bizizmir.com
- Kullanılan veri setleri:
  - "Otopark Doluluk ve Lokasyon Bilgileri": anlık doluluk, uygulama tarafından çekilir.
  - "İzelman Otoparkları Lokasyon, Kapasite ve Çalışma Saati Verisi": `data/parkings-static.json` içindeki `izelman-*` kayıtları.
- Lisans: İzmir Büyükşehir Belediyesi Açık Veri Lisansı (atıf zorunlu).
- Atıf: "İzmir Büyükşehir Belediyesi Açık Veri Portalı". Uygulamada Profil ekranında ve otopark detayında gösterilir.

## İBB Açık Veri / İSPARK (İstanbul)

- Kaynak: https://api.ibb.gov.tr/ispark/Park (İstanbul seçiliyken uygulama tarafından çekilir; anlık boş yer sayısı).
- Lisans: portal üzerinden henüz doğrulanmadı.
- Atıf: "İBB Açık Veri / İSPARK". Uygulamada Profil ekranında gösterilir.

## Bursa Büyükşehir Belediyesi Açık Veri (Açık Yeşil)

- Bursa için "otopark" veri seti veri betiğinde isteğe bağlı kaynak olarak denenir. Son çalışmada alınamadı; şu an uygulamada bu kaynaktan kayıt yok.

## OpenStreetMap

- `data/parkings-static*.json` içindeki `osm-*` kayıtları, `data/places-*.json`, `data/rail-*.json` ve `data/food-<şehir>.json` (İzmir, İstanbul, Ankara, Bursa, Antalya) © OpenStreetMap katkıcıları.
- Lisans: Open Database License (ODbL) 1.0. Tam metin: https://opendatacommons.org/licenses/odbl/1-0/
- Atıf: "© OpenStreetMap katkıcıları". Uygulamada Profil ekranında ve otopark detayında gösterilir.
- ODbL bir paylaşım-benzeri (share-alike) lisanstır. Bu veriden türetilmiş bir **veritabanını** yayımlarsan, onu da ODbL ile yayımlaman gerekir. Bu yükümlülük kodu kapsamaz.

## Overture Maps

- `data/food-overture-<şehir>.json`: Overture Maps Foundation yer verisinden restoranlar.
- Lisans: CDLA-Permissive-2.0. Uygulamada restoran sayfasında "Veri: Overture Maps (CDLA-Permissive-2.0)" ve Profil ekranında gösterilir.

Veriyi yenilemek için: `node scripts/fetch-sources.mjs` ve `python scripts/fetch-overture.py` (GitHub Actions'ta her ay otomatik çalışır, bkz. `.github/workflows/data-refresh.yml`).

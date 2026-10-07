# Veri lisansları

Uygulamanın kodu MIT lisanslıdır. Uygulamayla birlikte dağıtılan ve uygulamanın kullandığı **veriler** kendi lisanslarına tabidir.

## İzmir Büyükşehir Belediyesi Açık Veri

- Kaynak: https://acikveri.bizizmir.com
- Kullanılan veri setleri:
  - "Otopark Doluluk ve Lokasyon Bilgileri": anlık doluluk, uygulama tarafından çekilir.
  - "İzelman Otoparkları Lokasyon, Kapasite ve Çalışma Saati Verisi": `data/parkings-static.json` içindeki `izelman-*` kayıtları.
- Lisans: İzmir Büyükşehir Belediyesi Açık Veri Lisansı (atıf zorunlu).
- Atıf: "İzmir Büyükşehir Belediyesi Açık Veri Portalı". Uygulamada Profil ekranında ve otopark detayında gösterilir.

## OpenStreetMap

- `data/parkings-static.json` içindeki `osm-*` kayıtları © OpenStreetMap katkıcıları.
- Lisans: Open Database License (ODbL) 1.0. Tam metin: https://opendatacommons.org/licenses/odbl/1-0/
- Atıf: "© OpenStreetMap katkıcıları". Uygulamada Profil ekranında ve otopark detayında gösterilir.
- ODbL bir paylaşım-benzeri (share-alike) lisanstır. Bu veriden türetilmiş bir **veritabanını** yayımlarsan, onu da ODbL ile yayımlaman gerekir. Bu yükümlülük kodu kapsamaz.

Veriyi yenilemek için: `node scripts/fetch-sources.mjs` (GitHub Actions'ta her ay otomatik çalışır, bkz. `.github/workflows/data-refresh.yml`).

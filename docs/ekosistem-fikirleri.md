# Yerim Var — Ekosistem Fikir Notları (restoran ve ötesi)

Tarih: 2026-10-08. Durum: **fikir aşaması**, koda dokunulmadı. Mockup görselleri `design/ekosistem/` altında.
Mockup'lar ilham içindir, birebir hedef değildir: "tasarıma aldanma, fikre bak".

## Çekirdek fikir
- Otoparkla başladı, restoran ilk "kategori". Hedef çoklu ekosistem.
- Marka zaten söylüyor: **Yerim Var = "yer var mı?"** Dört çeşit yer: park yeri, masa yeri, sıra yeri (berber, tamirci), saat yeri (halı saha).
- Değer "nasıl giderim" değil, **"şimdi gidersem durum ne?"** Yol tarifi zaten Apple Haritalar'a devrediliyor.
- Hedef yerler: insanların internetten/GPS'ten bakmadığı, ağızdan ağza bulunan, sık tekrar eden yerel mekânlar (berber, esnaf lokantası, halı saha, çay bahçesi, pazar, fırın, tamirci, oto yıkama, nöbetçi eczane) + rutinler (Ev/İş, okul çıkışı, cuma namazı, devlet daireleri). Hastane gibi "adam internetten bakar" yerler öncelik değil.

## Kurallar
1. **Statik veriyle listelenmez.** Bir mekân ancak bir "yer durumu" taşıyorsa görünür: canlı (sensör), bildirilmiş (kullanıcı/esnaf) ya da geçmişten tahmin. Aksi halde rehber olur, Google Maps'le yarışırız.
2. Açık veri (OSM, Overture, Foursquare OS Places) sadece **tohum**: mekân = açık veri, durum = insanlar. Aylık betik (`scripts/fetch-sources.mjs` genişletilir), gömülü JSON, backend yok.
3. Önce otopark verisi güçlensin; restoran `Yer` soyutlamasını kanıtlasın; sonra yeni kategoriler.
4. Genişlikten önce derinlik: tek mahalle (örn. Alsancak/Karşıyaka) ile başla.
5. Canlı doluluk yalnızca 7 sensörlü otoparkta var; sözü "boş yer garantisi" değil "yakın otoparklar + tahmini yürüme süresi, canlı veri bonus" olmalı.

## Eklenebilecekler (öncelik sırası)
1. Akşam maliyeti hesabı (yemek süresi + park tarifesi, "tahmini"), park hatırlatıcısı, "arabam nerede".
2. **Kullanıcı raporu** ("şu an dolu/boş" tek dokunuş). Veri açığını kapatır; zorunlu. Spam koruması ve minik backend gerekir.
3. Yoğunluk tahmini (geçmiş veriyi biz biriktiririz; API yalnızca anlık veri verir).
4. Proaktif yapı: bildirim, widget, Siri kısayolu ("işe park var mı?"). Expo SDK 57 desteği kodlamadan önce docs'tan doğrulanmalı.
5. Etkinlik uyarısı, hava/gece, çoklu durak planı, park et ve devam et (metro/vapur), grup buluşma linki, EV şarj, engelli park.
6. Ticari: restoran ortaklığı (fişle park indirimi/vale), esnaf paneli veya WhatsApp ile "yer var/dolu" bildirimi.

## Risk
- Mevcut uygulama hesapsız, backend'siz, "resmî değil" açık veri uygulaması. Durum bildirimi, hesap, moderasyon, esnaf tarafı bunu **farklı bir ürün** yapar; bilinçli karar gerekir.
- Esnafta veri kaynağı yok: müşteri bildirimi (hızlı, güvenilirliği düşük) + esnaf sahiplenme (güvenilir, ikna zor) karışımı.
- Web sitesi scraping: robots.txt/şartlara uy, KVKK, kırılgan; yalnızca OSM `website` etiketinden yapılandırılmış saat/telefon makul. Canlı durum web sitelerinde yok.
- Açık: OSM kapsam sayımı yapılamadı (`overpass-api.de` ortamda engelli). İzin verilirse İzmir'de kategori başına mekân/saat/telefon/web oranı sayılacak.

## Mockup 1 (restoran + otopark, 12 ekran)
Açılış, ana sayfa (Restoran Bul / Otopark Bul), harita (Restoranlar/Otoparklar geçişi), restoran detayı (Yakındaki Otoparklar sekmesi), otopark detayı, filtre, listeler, rota özeti, favoriler (iki sekme), profil.
Notlar: otopark kartlarında **boş yer sayısı yok** (asıl vaat); puan/yorum/fiyat/menü/giriş için kaynak yok (bkz. kurallar); rota ekranı Apple Haritalar devri ile özetlenebilir.

## Mockup 2 (AI + abonelik + rezervasyon, 10 ekran) — not edildi
- **Yerim Var AI:** ana sayfada öne çıkan "Bana uygun bir yer bul" kartı, ortada AI sekmesi; doğal dille istek ("3 kişiyiz, kişi başı 600 TL, et yemek istiyoruz, otopark olsun") → bütçe, kişi sayısı ve otopark durumuna göre öneri kartları. Hazır istekler: "Romantik bir yer bul", "Uygun fiyatlı restoran bul", "Otoparklı restoran bul", "Ne yiyeceğimi bilmiyorum".
- **Abonelik (Free / AI ₺99,99 / AI+ ₺199,99 aylık, yıllıkta %20 indirim):** Free = temel restoran/menü/otopark bilgisi/filtre; AI = restoran önerileri, bütçeye göre arama, otopark önceliği, menü karşılaştırma, yorum analizi, sınırlı AI; AI+ = sınırsız AI, kişisel zevke göre öneri, restoran karşılaştırma, detaylı yorum analizi, otopark durumu önceliği, özel/gizli mekân önerileri, yeni açılan mekânlardan erken haber, reklamsız.
- **Rezervasyon:** restoran detayından tarih/saat/kişi sayısı/not ile rezervasyon; otopark detayı "restoran otoparkı: misafire ücretsiz, 50 araç, restorana 50 m, vale var, canlı güncelleniyor".
- **Profil:** abonelik yönetimi, favoriler, rezervasyonlar, arama geçmişi, ödeme yöntemleri, bildirimler.
- Değerlendirme (açık sorular, karar verilmedi):
  - AI önerisi gerçek veri ister (puan, fiyat, menü, yorum); bizde yok. "Statik veriyle listelenmez" kuralıyla çelişir; AI ancak elimizdeki durum verisini (otopark/yer durumu) akıllıca birleştirirse değer katar.
  - AI maliyeti (LLM API) ve abonelik: backend, ödeme (App Store IAP), hesap gerektirir. Hesapsız yapıdan büyük sıçrama.
  - Rezervasyon restoran tarafı ortaklığı ister (esnaf paneli / entegrasyon); tek başına "rezervasyon yap" düğmesi sahte vaat olur.
  - Para kazanma için daha doğal aday: restoran ortaklığı (park indirimi) ve esnaf görünürlüğü; abonelik ikincil olabilir.

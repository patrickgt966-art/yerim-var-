# Yol haritası

Son güncelleme: 2026-10-09. Öncelik sırası yukarıdan aşağıya. Her değişiklik bir alt ajana ayrıca kontrol ettirilir.

## 1. Sıradaki işler

- [x] **Listede olmayan yerleri Apple Haritalar'da anlık aramak.** (Kodlandı; uygulamanın kendi derlemesinde cihazda denenmesi gerekiyor.) "Sevil 2 İş Hanı" gibi gömülü listede olmayan bir yer yazılınca Apple Haritalar'a sorulur (`modules/yerim-mapkit` içine `MKLocalSearch` ile yer araması). Sıra: gömülü liste → Apple yer araması → adres araması. Yalnızca uygulamanın kendi derlemesinde çalışır.
  - Bu iş, apartmanları ve iş hanlarını listeye gömme fikrinin yerini alır. Gömülü liste küçük kalır (ilçe, semt, AVM, iskele, istasyon, belediye otoparkları); uzun kuyruk anlık gelir.
- [ ] **Yürüme süresinin kontrolü.** Şu an kuş uçuşu mesafeden hesaplanıyor, bu yüzden olduğundan kısa çıkabilir. Gerçek yürüme süreleriyle karşılaştırılıp bir düzeltme katsayısı eklenecek. Uygulamanın kendi derlemesinde gerçek süre Apple'dan alınacak (`MKDirections`, yürüyüş).
- [ ] **Belediyenin Şubat 2026 tarifelerini bağlamak.** Veri `data/raw/` içindeki "Otopark Ücretleri" XLSX'inde. Otopark adıyla eşleştirilip `data/tariffs.json`'a kaynak ve tarihle eklenecek. Böylece fiyat ve "2 saat park" tahmini gerçek veriyle çalışır.
- [x] **Fazla genel otopark adlarını ayıklamak.** "Çocuk parkı", "Halk Park", "Merkez", "Pazaryeri", "Atatürk Büstü" gibi her yerde olan adlar ve apartman/site adları artık "X yakını" için kullanılmıyor (`GENERIC_LANDMARK`, `scripts/fetch-sources.mjs`). 37 otoparkın adı değişti; 22'si yakınında uygun yer olmadığı için "Adsız otopark" oldu.
- [ ] **Kontrol edilmemiş son değişiklikler:** veri görevinde `git pull --rebase` ve ana dalla birleştirme.

## 2. Önerilen yeni özellikler

### Hızlı kazanımlar (mevcut veriyle)

- [ ] **Engelli park yeri doluluğu.** Belediye API'si katlı otoparklarda `occupancy.disabled` alanını zaten veriyor ama kullanmıyoruz. Kartta ve detayda "♿ 15 boş" olarak gösterilebilir.
- [ ] **Sıralama seçenekleri:** en yakın, en çok boş yer, en ucuz (tarifelerden sonra).
- [ ] **Yeni filtreler:** Ücretsiz, 7/24, Engelli yeri, LPG'li araç girebilir (`accessibility.lpgAllowed`), yükseklik sınırı.
- [ ] **Park et & devam et.** İZBAN/metro istasyonu ya da iskeleye yürüme mesafesindeki otoparkları öne çıkar (OSM `park_ride` etiketi ve gömülü istasyon/iskele listesi). İzmir'de vapura ya da metroya aktarma yapanlar için.
- [ ] **İngilizce dil desteği.** Metinler zaten `src/i18n` içinde; turistler için `en.ts` eklenir.

### Aracımı bul (aktif park kartını güçlendirmek)

- [ ] Park edince aracın konumunu, istenirse kat/sıra fotoğrafını ve notu cihazda saklamak. "Aracıma dön" düğmesi Apple Haritalar'ı yürüyüş tarifiyle açar.
- [ ] Ücretli sürenin dolmasına 10 dakika kala yerel bildirim. Sunucu gerekmez. Brif v1'de bildirim istemediği için senin onayın gerekiyor.

### iPhone'a özel (uygulamanın kendi derlemesiyle)

- [ ] **Canlı Etkinlik (Dynamic Island / kilit ekranı):** aktif park süresi ve tahmini ücret.
- [ ] **Ana ekran widget'ı:** favori otoparkların boş yer sayısı.
- [ ] **Siri ve Kestirmeler:** "Yerim Var, Kordon'da yer var mı?"
- [ ] **CarPlay:** Apple'ın "otopark" uygulama kategorisi var. Arabanın ekranında en yakın boş otopark gösterilir. Apple'dan ayrıca izin (entitlement) alınması gerekir.

### Veri ve topluluk (sunucu ya da dış iş birliği gerektirir, v2)

- [ ] **Saatlik doluluk tahmini** ("Pazartesi 09:00'da genelde dolu"). Geçmiş veri gerekir; cihazda toplanabilir ya da ileride küçük bir sunucuyla yapılabilir.
- [ ] **"Burada yer var / dolu" kullanıcı bildirimi.** Canlı verisi olmayan otoparklar için. Sunucu gerekir.
- [ ] **Belediyeyle iletişim:** daha fazla sensörlü otoparkın açık veriye eklenmesi, veri güncelleme sıklığı ve zaman damgası alanı talebi. Kapsamı en çok bu artırır.

## Restoran + park (8 Ekim'de konuşuldu)

**Ürün fikri (2026-10-08):** Yerim Var, "gideceğin yere arabayla gitme" uygulaması olur. Kullanıcı nereye gideceğine karar verir, uygulama oraya varmanın park kısmını çözer.

- İki giriş kapısı aynı akışa çıkar:
  - **Restoran Bul:** Kategori ya da aramayla restoranı seç. Restoran sayfasında "Yakındaki otoparklar" hazır gelir. Rezervasyonu yap, otoparkı seç, uygulama yürüyüşü gösterir ("otopark 150 m, restorana 5 dk").
  - **Otopark Bul:** Bugünkü uygulama.
- Asıl değer bağlantıda: **yer seç → park yeri bul → yürü → otur.** Restoran uygulamaları parkı, otopark uygulamaları "nereye gidiyorum" sorusunu çözmüyor.
- Genişleyebilir: aynı akış kafe, kuaför, hastane, AVM ve konser alanı için de çalışır ("Gideceğin yerin yanında yerin var").
- Tasarım taslağı (12 ekran) fikri anlatmak için; görünüm aynı olmak zorunda değil. Taslaktan akılda kalanlar: ana sayfada iki büyük kart, kategoriler, haritada Restoranlar/Otoparklar geçişi, restoran detayında "Yakındaki Otoparklar" sekmesi, otopark + yürüyüş rota özeti, favorilerde iki sekme.
- Uygulamaya geçerken: her restoran ve otopark kartında boş yer sayısı görünmeli. Puan, yorum, fotoğraf ve kişi başı fiyatın açık kaynağı yok. Yol tarifi Apple Haritalar'a devredilir. Rezervasyon bizim sistemimize geçene kadar hesap gerekmez.
- Bu akşam konuşulacaklar: hangi kapıyla başlanacağı, restoran dışında hangi yer türlerinin geleceği, rezervasyonun hangi aşamada olacağı.

Karar taslağı: doğrudan rezervasyon yerine **ara → listele → restoranın kendi rezervasyon sayfasına yönlendir**. Asıl fark park: "restoranı seç → yanındaki boş otoparkı gör → rezervasyon yap → oraya park et".

**Karar (2026-10-08):** Tasarım taslağındaki akış (12 ekran) eldeki veriyle kurulacak; görünüm kendi markamızla. Puan, yorum, fotoğraf ve fiyat için ücretli kaynak kullanılmayacak, şu iki yolla toplanacak:

1. **Kendimiz toplarız:** Seçilen semtlerde ("Yerim Var önerir") fiyat aralığı, ortam etiketleri ve fotoğraf elle eklenir. Taslak liste `data/food-izmir.json`'dan çıkarılır.
2. **Restoranlar kendisi girer:** Basit bir kayıt formu (ad, konum, telefon, fiyat aralığı, fotoğraf); onaydan sonra listeye girer. Sunucu ya da form servisi gerekir; seçimi ayrıca yapılacak.

Sıra:

- [ ] **Akış (hemen, sunucusuz), 4 parça:** (1) restoran verisini bağlamak, restoran listesi ve detayı; (2) ana sayfada Restoran/Otopark modu ve kategoriler; (3) haritada restoran pinleri; (4) favorilerde iki sekme ve rota özeti. Her parça kendi başına çalışır ve ayrı kaydedilir.
- [ ] **Akışın kapsamı:** Ana sayfada Restoran/Otopark modu, kategoriler, restoran listesi ve detayı ("Nereye park edersin?"), haritada restoran pinleri, favorilerde iki sekme, rota özeti. Veri: OpenStreetMap + Apple Haritalar araması.
- [ ] **Veri toplama:** Semt seçimi ve fiyat/ortam etiketleri; restoran kayıt formu.
- [ ] **Hesap gelince:** Kullanıcı puanları, yorumlar, profil.

- [ ] **1. aşama, yönlendirme (sunucu yok):** Aramada "Konak et restoranı" gibi sorgular restoranları listeler. Her restoranın yanında "Yakınında 3 otopark · en yakında 14 boş yer" yazar. Restoran ekranında "Rezervasyon yap" (restoranın sitesi), "Ara" ve "Buraya park et" düğmeleri olur.
  - Veri: Apple Haritalar araması (ad, adres, telefon, web sitesi; uygulamanın kendi derlemesinde) ve OpenStreetMap restoranları (mutfak türüyle, yedek olarak).
  - Apple yer aramasıyla aynı altyapı; o işten hemen sonra yapılması doğal.
- [ ] **2. aşama, iş birliği:** Mevcut rezervasyon platformlarına bağlanmak (masa müsaitliği uygulamada görünür, rezervasyonu platform yapar). Hangi platformların bunu dışarıya açtığı araştırılmalı.
- [ ] **3. aşama, kendi sistemimiz:** Sunucu, hesap (SMS doğrulama), restoran paneli, KVKK. Ancak 1. ve 2. aşama talep gösterirse. Fark yaratabilecek fikirler: rezervasyonla birlikte otopark yeri, otopark ücretini restoranın karşılaması.
- Dikkat: Park ana iş olarak kalsın. Hesap ve kişisel veri gelince gizlilik metni ve App Store bilgileri değişir. App Store adı "Otopark Bul" yerine daha genel olabilir.

**Karar (2026-10-08): Google yok, Apple Haritalar + açık kaynak.** Google Places ücretli olduğu için kullanılmayacak. Konum, arama, adres, telefon ve web sitesi Apple Haritalar'dan (uygulamanın kendi derlemesinde, ücretsiz); restoran ve otopark listeleri OpenStreetMap ve belediye açık verisinden gelir. Fiyat, fotoğraf, menü ve ortam bilgisini biz ya da restoranlar girer; puan ve yorum hesaplar gelince kullanıcılardan gelir.

**Bekleyen kararlar**

- [ ] Fiyat ve ortam etiketlemesine hangi 2–3 semtle başlanacak?
- [ ] Restoran kayıt formu: başlangıç için Google Form yeterli mi?
- [ ] Sonnet kontrolü her adımda mı, her parçanın sonunda mı (limit tasarrufu)?

**Restoran verisinin durumu**

- `data/food-izmir.json`: OpenStreetMap'ten 2.172 yeme-içme yeri (temizlendi: 7 hatalı kayıt silindi, 3 çift birleştirildi). Bilgi doluluğu düşük: mutfak türü %29, telefon %9, saat %8.
- [ ] Belediye portalındaki "Turizm Tesisleri", "Turuncu Çember Sertifikası Alan İşletmeler" ve "Yiyecek, İçecek Büfeleri" veri setlerinin içeriğine bakmak (telefon, adres, konum var mı?).

**Taslaklar**

- Ekran taslağı (tuval): https://claude.ai/artifact/Qar9Jakc6hHYL4YcVTt18n
- Dokunarak gezilen prototip: https://claude.ai/artifact/EH2NWRTH6tWMfocm13mUA9

## Yapay zeka (8 Ekim'de seçildi: 1 ve 4)

- [ ] **Konuşur gibi arama:** "Kordon'da çocukla gidebileceğim, parkı kolay bir balıkçı, kişi başı 500 TL altı" gibi bir cümle filtrelere (konum, mutfak, bütçe, ortam, park kolaylığı) çevrilir. Önce telefonun içindeki Apple yapay zekasıyla (ücretsiz, veri cihazdan çıkmaz, yalnızca destekleyen iPhone'larda); desteklemeyen telefonlarda normal arama devam eder. Uygulamanın kendi derlemesi gerekir.
- [ ] **Arka planda veri tamamlama:** Restoranlarda eksik mutfak türü (ve mümkünse ortam) ad ve web sitesinden tahmin edilir. Bu iş bizim veri sürecimizde yapılır, kullanıcıya gösterilmez; sonuçlar "tahmini" diye işaretlenir ve elle kontrol edilir.
- Sonraya: "Senin için" önerileri, tabela fotoğrafından fiyat okuma, bulut yapay zeka (sunucu ve hesaplarla birlikte; maliyet ve gizlilik o zaman planlanır).

## Bekleyenler ve çalışma kuralı

- [ ] [PR #3](https://github.com/patrickgt966-art/yerim-var-/pull/3)'ü birleştirmek (son çalışmaların hepsi orada).
- Çalışma kuralı: her değişiklik bir alt ajana (Sonnet) ayrıca kontrol ettirilir; bulguları düzeltilip öyle kaydedilir.

## 3. App Store öncesi

- [ ] Apple Developer hesabı (99 $/yıl). Apple Haritalar özellikleri ve TestFlight için gerekli.
- [ ] `EXPO_TOKEN` sırrı ve "iOS build check" çalıştırmak (isteğe bağlı derleme doğrulaması).
- [ ] GitHub ayarı: "Allow GitHub Actions to create and approve pull requests" (aylık veri PR'ları için).
- [ ] Gizlilik politikası sayfası (GitHub Pages yeterli) ve App Store ekran görüntüleri.
- [ ] Gerçek bundle ID.
- [ ] TestFlight ile birkaç kişiye beta.
- [ ] VoiceOver ve Dynamic Type ile cihazda erişilebilirlik turu.
- [ ] Uçtan uca testler (ör. Maestro): arama → sonuç → detay → park et.

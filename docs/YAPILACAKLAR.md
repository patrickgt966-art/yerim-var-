# Yapılacaklar

Son güncelleme: 18 Ekim 2026 (akşam).

## Sıradaki büyük işler (bu sırayla)

1. **Codex ile test ettirmek.** Yapay zeka ve beş şehrin akışlarını bağımsız bir gözle uçtan uca denetletmek.
2. ~~**Gerçek konuşmalarla sınav seti.**~~ Yapıldı: `scripts/ai-eval.ts` ("AI eval" görevi) yapay zekâ dosyalarına dokunan her PR'da ve elle çalışır; büyük ve uç sınavlar (`ai-eval-big.yml`, `ai-eval-extreme.yml`) elle ya da sınav dosyaları değişince. Kalan: sınavı gerçek kullanıcı konuşmalarından yeni örneklerle büyütmek.
3. **Yapay zekayı daha zeki yapmak.**
   - Arama cevaplarının metnini de yapay zeka yazsın (bilgiler yine bizim veriden, dil daha doğal).
   - Takip sorularını daha iyi anlasın ("diyet menü" → semt sorusu → "yakınımda" zincirini tek istekte birleştirsin).
4. **Menü verisi.** Elimizde yok: vejetaryen gibi istekler yerin adı, türü ve varsa beslenme etiketine (OSM `diet:*`, Overture kategorileri) göre yargılanıyor; etiketsiz yerlerde yalnızca ad ve tür var.
5. ~~**"Burası kapanmış" düğmesi.**~~ Yapıldı: bildirimler yeri işaretler, gizleme kararı yönetim sayfasında (`yerimvar.app/admin`).

### Şehirlerde kalanlar

- Bursa: Açık Yeşil (Bursa BB) "otopark" veri seti son çalışmada alınamadı; tekrar denenecek.
- ~~İstanbul: İSPARK tarifesi otopark detay sayfasında.~~ Yapıldı: 244 otoparkın resmi tarifesi ve aylık ücreti `data/tariffs-ispark.json` içinde (haftalık yenilenir), detayda "Resmi tarife".
- İSPARK canlı verisi telefonda denenecek (biçim GitHub'dan alınan canlı örnekle uyuşuyor).

## Şimdi yapılabilir (hesap gerekmez)

1. ~~**Sohbet "Listede aç" düğmesi**~~ Yapıldı: liste "hariç" ve "ücretsiz otopark" filtrelerini taşıyor.
2. **Yemek sözlüğü**: telefonda yanlış ya da eksik çıkan her yemek eklenecek (şu an ~380 yemek).
3. **Restoran sayfası**: kategori yoksa yedek etiket, Türkçe çalışma saatleri (sadece ~200 yerde saat var).
4. ~~**İngilizce arayüz.**~~ Yapıldı (`src/i18n/en.ts`; telefon Türkçe değilse İngilizce, Profil'den değişir).
5. **ROADMAP.md güncellemesi.** Alt ajan bölümü güncellendi; planın geri kalanı hâlâ 9 Ekim tarihli.

## Veri olmadan yapılamayanlar (kaynak lazım)

- ~~Vejetaryen / diyet etiketleri~~ Yapıldı: OSM `diet:*` ve Overture kategorileri (bkz. aşağıda Yerim ✨ durumu).
- Otopark ücret tarifeleri: İstanbul'da 244 resmi İSPARK tarifesi var; diğer şehirlerde yalnızca `data/tariffs.json` içindeki 4 tahmini tarife.
- Engelli erişimi (1.489 otoparkın 11'inde var)
- Rezervasyon bilgisi (12 restoranda var)

## Fikirler (yapılacaklar listesiyle birlikte sunulur)

### Tek ekran ana sayfa (taslak hazır, karar bekliyor)

- Taslaklar yan yana: https://claude.ai/artifact/5ynm5BFPMceJfftomEhiLU (A: iki sekme, şu anki · B: tek ekran)
- B: tek arama kutusu, "Yakınımda otopark / yemek" düğmeleri, otopark ve restoranlar aynı listede.

### Veri doğruluğu

- **Denetim sonucu (10 Ekim)**: 50 Overture yerinden 37 açık, 5 taşınmış, 8 kapanmış. 13 hatalı yer kara listede; tüm Overture yerlerinde "Bilgi eski olabilir".
- **Foursquare çapraz kontrolü**: `FSQ_TOKEN` gerekir.
- **Apple ile toplu kontrol** (Apple hesabından sonra): önce denetlenen 50 yerle dene.

### Uygulama boyutu

- Beş şehirle gömülü veri ~17,5 MB (sıkıştırılmamış JSON). Şehir verisini ilk açılışta indirme düşünülür.

## Yerim ✨ durumu

- Açık: sunucu `https://yerim-ai.patrickgt966.workers.dev`, günde 10 ücretsiz mesaj, onay kartı, hak göstergesi, son hak notu.
- Onay verildiyse her mesaj önce yönlendiriciye (`/understand`) gider; model kısa bir `meaning` yazar, sonra `search` / `chat` / `unknown` döner. Anlamazsa "anlayamadım" der, tahmin etmez.
- Yönlendirici 12 sn içinde cevap vermezse, ağ hatasında ya da hak bitince uygulama kendi kurallarıyla cevap verir ve bunu söyler.
- `/pick` yakındaki en çok 40 yeri adı ve türüyle görür, uyanları seçer; yalnızca sıra numarası döner.
- Sınav: kurallar 51/59 (kuralla çözülebilenlerin hepsi doğru); kalanlar belirsiz istekler ve takip soruları (`docs/chat-eval.md`; `WRITE_CHAT_EVAL=1 npx jest src/data/__tests__/chatEval.test.ts` ile yenilenir).
- Canlı yapay zekâ sınavı (`scripts/ai-eval.ts`, `src/data/eval/aiCases.ts`): argo, dolgu kelime, iki mesaja bölünmüş istek ve seçim kararları; yapay zekâ dosyalarına dokunan her PR'da çalışır (GitHub'da `ANTHROPIC_API_KEY` sırrı gerekir), %85'in altında kırmızı olur.
- Beslenme verisi: OSM `diet:*` etiketleri (vejetaryen, vegan, pesketaryen, glutensiz) ve Overture vegan/vejetaryen/glutensiz kategorileri; helal bilinçli olarak yok (Türkiye'de neredeyse her yer helal, az sayıda etiketli yer yanlış izlenim verir); detay sayfasında ve yapay zekâ seçiminde gösterilir.
- Seçim, arama alanının biraz dışındaki 10 yeri de görür; yakında uyan yoksa onları seçer.
- Canlı sınav çalıştırıldı ve bulgulara göre düzeltildi (ilk çalıştırma, büyük ve uç sınavlar).
- Sonraki: abonelik (Yerim+, sınırsız ✨), sunucu kayıtlarına göre ince ayar.

## Apple Developer hesabından sonra

Ödeme 18 Ekim'de yapıldı, onay bekleniyor. Onay gelince gerekenler: **Team ID** (developer.apple.com → Account → Membership details) ve bir **Expo hesabı** (expo.dev).

**Hesap onayını beklerken hazırlanabilecekler**
- Universal Link (uygulama tarafı): `app.json` içine `ios.associatedDomains: ["applinks:yerimvar.app"]` ve `/r/[id]`, `/p/[id]` bağlantılarını restoran/otopark ekranına yönlendiren ekranlar. Team ID gelince worker'da `APPLE_TEAM_ID` doldurulup deploy edilecek (`/.well-known/apple-app-site-association` hazır).
- `eas.json` kontrolü: development, preview (TestFlight) ve production profilleri.

**Onaydan sonra**
1. `npx eas-cli@latest build --platform ios --profile production` → TestFlight ile telefona kurulum.
2. Cihazda denenecekler: Canlı Etkinlik (kilit ekranı, Dynamic Island), bildirim düğmeleri ("Yol tarifi", "15 dk uzat"), 10 dk uyarısı, puan isteği, harita seçimi (yüklü uygulamalar), Apple araması.
3. App Store Connect kaydı: metinler `docs/app-store.md` içinde; gizlilik adresi `https://yerimvar.app/gizlilik`; App Privacy formu (Device ID, Other User Content, takip yok).
4. Mağaza ekran görüntüleri (6.9" iPhone; ilk karede canlı boş yer sayısı).
5. Yayınlanınca: `server/yerim-ai/wrangler.toml` içinde `APP_STORE_URL` ve `APP_STORE_ID` doldurulup deploy (sitede "Yerim Var'ı indir" düğmesi çıkar).
6. Sonra: ana ekran widget'ı, uygulama içinde rota çizgisi (otoparktan restorana yürüme), Apple ile toplu yer doğrulaması.

## Sıradaki küçük işler (hesap gerekmez)

- Semt sayfalarının görünümü (yerimvar.app): bağlantılar uygulamanın etiket stiline.
- Ağır yazım hataları: "isgender", "aalnya", "muanya", "sicanda" gibi yazımlar için genel harf benzerliği kuralı.
- Plan paylaşımı da yerimvar.app bağlantısıyla (şu an Apple Haritalar bağlantısı).
- Gaziemir ve Bursa BURULAŞ tarifelerinin kontrolü; Ankara ANPARK tarifesi (rakamlar bekleniyor).

## Karar bekleyenler

- Ana sayfa: A mı B mi?
- Destek e-posta adresi, geri bildirim formu

## Tamamlananlar (17–18 Ekim)

- Yer bildirimi (kapanmış / konum / bilgi yanlış): yeri işaretler, gizleme kararı `yerimvar.app/admin` sayfasında.
- Park: Canlı Etkinlik, "Arabama dön", bildirim düğmeleri, 10 dk uyarısı, son süreyi hatırlama, pencere yerine "Geri al", puan isteği.
- Yol tarifi uygulaması seçimi (Apple, Google, Yandex, Waze).
- Tanıtım 2 ekran, ana sayfanın açık temasında ve gerçek logoyla; ipucu turu 1 adım.
- Klavyedeki "Ara" ad yazılınca doğrudan açıyor; konum kapalıyken liste bunu söylüyor.
- Yerim ✨: semtler, ilçe yazım hataları her şehirde, sohbetteki ilçeyi koruma, metre hassasiyeti, istem önbelleği (test maliyeti ~0,5 $ → ~0,12 $).
- yerimvar.app: paylaşım sayfaları, gizlilik sayfası, 2.239 semt sayfası (otopark, restoran, yemek türü), Google Search Console ve site haritası; www yönlendirmesi, SPF/DMARC.
- Mağaza metinleri: `docs/app-store.md`.

## Tamamlananlar (12–16 Ekim)

- Şehirler: İstanbul tamamlandı (İSPARK canlı doluluk, yer, raylı sistem, restoran verisi); Ankara, Bursa ve Antalya eklendi (canlı veri yok, otoparklar kapasite bilgisiyle; arıza uyarısı yerine sakin not). Şehir onboarding'de ve Profil'de seçiliyor; ana sayfa silueti şehre göre.
- Veri: aylık görev beş şehri topluyor (300 dk); Overpass kutulara bölündü ve tekrar deniyor; Overture'da her şehirde 0,7 güven eşiği, şehir başına 10 MB sınırı, sıkı zayıf kayıt kuralı
- Yerim ✨: her mesajı yapay zeka anlıyor (`/understand`, önce gizli `meaning`, düz şema); anlamazsa "anlayamadım" diyor; yönlendirici bekleme süresi 9 sn
- Yerim ✨ seçim: `/pick` yakındaki 40 yerin adını ve türünü görüp uyanları değerlendiriyor (`fit`, `noneFit`); uyan yoksa söylüyor
- Arayüz: başlıkta gerçek logo (BrandWordmark); Yerim sekmesi, ✨ hakkı, şehir düğmesi ve arama kartı için tek seferlik ipucu balonları
- Onboarding: 4 adım (Merhaba, Şehrini seç, Yerim ile konuş, Konum); eski "Dürüst veri" adımı ve Skyline bileşeni kaldırıldı
- Belgeler: README, gizlilik metni ve veri belgeleri beş şehre göre güncellendi

## Tamamlananlar (10–11 Ekim)

- Yemek: Dünya mutfağı kategorisi (Japon, Çin, İtalyan, Meksika, Hint, Tay, Kore, Orta Doğu); sözlük ~180 → ~380 yemek; isimde tam kelime eşleşmesi ("pişi" artık "Pişiricisi"ni, "lokma" "Lokman"ı bulmuyor)
- Restoran ekranı: üstte otoparklı harita

- Veri: Overture web sitesi kontrolü ve aylık fark raporu; 13 kapanmış yer kara listede; raylı sistem istasyonları (165); otomatik veri PR'ları için GitHub izni
- Otopark: İzelman kimlikleri sabit (favoriler kaybolmuyor); Ücretsiz / 7/24 / Raylı sisteme yakın filtreleri
- Restoran: harita + alt panel (otopark ekranı gibi); otopark ekranında "Yakındaki restoranlar" haritada; sıralama (tezgâhlar aşağı, gerçek meyhane/lokanta önde)
- İsimler: ~1.000 bozuk ad düzeltildi (büyük/küçük harf, Türkçe harf, reklam metni)
- Yazılar: ~30 uzun yazı kısaltıldı; gizlilik metni ✨ ile güncel
- Sohbet: yemeğe göre arama (sözlük + "adında geçiyor / büyük ihtimalle var"), bilinmeyen yemeklerde Haiku ve "yemek mi yer mi?" sorusu, olumsuz cümleler, takip soruları, ana sayfada yazarken titreme düzeltildi
- Yerim ✨: Cloudflare sunucusu yayında, Anthropic anahtarı sunucuda, daha dolu anlatım (açık/kapalı, ücretsiz otopark, boş yer), güvenlik filtresi

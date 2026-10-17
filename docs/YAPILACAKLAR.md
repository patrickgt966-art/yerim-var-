# Yapılacaklar

Son güncelleme: 16 Ekim 2026.

## Sıradaki büyük işler (bu sırayla)

1. **Codex ile test ettirmek.** Yapay zeka ve beş şehrin akışlarını bağımsız bir gözle uçtan uca denetletmek.
2. **Gerçek konuşmalarla sınav seti.** Her değişiklikte ölçelim (`scripts/ai-eval.ts`, elle çalışan "AI eval" görevi).
3. **Yapay zekayı daha zeki yapmak.**
   - Arama cevaplarının metnini de yapay zeka yazsın (bilgiler yine bizim veriden, dil daha doğal).
   - Takip sorularını daha iyi anlasın ("diyet menü" → semt sorusu → "yakınımda" zincirini tek istekte birleştirsin).
4. **Menü / diyet verisi.** Elimizde yok: vejetaryen gibi istekler yalnızca yerin adı ve türüne göre yargılanıyor.
5. **"Burası kapanmış" düğmesi.** Kullanıcı bildirimleriyle kapanmış yerleri gizlemek (Cloudflare sunucusu artık var).

### Şehirlerde kalanlar
- Bursa: Açık Yeşil (Bursa BB) "otopark" veri seti son çalışmada alınamadı; tekrar denenecek.
- İstanbul: İSPARK tarifesi (`ParkDetay?id=`, aylık ücret dahil) otopark detay sayfasında gösterilebilir. Önerildi, karar verilmedi.
- İSPARK canlı verisi telefonda denenecek (biçim GitHub'dan alınan canlı örnekle uyuşuyor).

## Şimdi yapılabilir (hesap gerekmez)

1. **Sohbet "Listede aç" düğmesi**: liste "hariç" ve "ücretsiz otopark" filtrelerini taşımıyor.
2. **Yemek sözlüğü**: telefonda yanlış ya da eksik çıkan her yemek eklenecek (şu an ~380 yemek).
3. **Restoran sayfası**: kategori yoksa yedek etiket, Türkçe çalışma saatleri (sadece ~200 yerde saat var).
4. **İngilizce arayüz.**
5. **ROADMAP.md güncellemesi.**

## Veri olmadan yapılamayanlar (kaynak lazım)

- Vejetaryen / diyet etiketleri
- Otopark ücret tarifeleri (sadece 3 tarife var)
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

## Yerim ✨ (Haiku) durumu

- Açık: sunucu `https://yerim-ai.patrickgt966.workers.dev`, günde 10 ücretsiz mesaj, onay kartı, hak göstergesi, son hak notu.
- Onay verildiyse her mesaj önce yönlendiriciye (`/understand`) gider; model kısa bir `meaning` yazar, sonra `search` / `chat` / `unknown` döner. Anlamazsa "anlayamadım" der, tahmin etmez.
- Yönlendirici 12 sn içinde cevap vermezse, ağ hatasında ya da hak bitince uygulama kendi kurallarıyla cevap verir ve bunu söyler.
- `/pick` yakındaki en çok 40 yeri adı ve türüyle görür, uyanları seçer; yalnızca sıra numarası döner.
- Sınav: kurallar 51/59 (kuralla çözülebilenlerin hepsi doğru); kalanlar belirsiz istekler ve takip soruları (`docs/chat-eval.md`).
- Canlı yapay zekâ sınavı (`scripts/ai-eval.ts`, `src/data/eval/aiCases.ts`): argo, dolgu kelime, iki mesaja bölünmüş istek ve seçim kararları; yapay zekâ dosyalarına dokunan her PR'da çalışır (GitHub'da `ANTHROPIC_API_KEY` sırrı gerekir), %85'in altında kırmızı olur.
- Beslenme verisi: OSM `diet:*` etiketleri (vejetaryen, vegan, pesketaryen, helal, glutensiz) ve Overture vegan/vejetaryen/helal kategorileri; detay sayfasında ve yapay zekâ seçiminde gösterilir.
- Seçim, arama alanının biraz dışındaki 10 yeri de görür; yakında uyan yoksa onları seçer.
- Sonraki: abonelik (Yerim+, sınırsız ✨), Haiku sınavının ilk çalıştırılması, sunucu kayıtlarına göre ince ayar.

## Apple Developer hesabından sonra

- Dev build (Expo Go yerine) — Apple araması kodda var, Expo Go'da kapalı
- Apple Haritalar araması ve toplu doğrulama
- Yürüme süreleri, widget'lar
- App Store'a gönderim (onay kartı ve gizlilik metni hazır)

## Karar bekleyenler

- Ana sayfa: A mı B mi?
- Apple Developer hesabı (yıllık 99$)
- GitHub Pages (gizlilik sayfası için)
- Destek e-posta adresi, geri bildirim formu
- İSPARK tarifesi otopark detay sayfasında gösterilsin mi?

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

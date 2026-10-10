# Yapılacaklar

Son güncelleme: 11 Ekim 2026.

## Senden bekleyenler (önce bunlar)

1. Bilgisayarda `git stash` + `git pull` (#37–#39 birleşti; yerel kopya güncel olsun).
2. Sunucuyu güncelle: `server\yerim-ai` klasöründe `npx wrangler deploy` (Haiku'nun yemek bilgisini vermesi için şart; yapıldıysa geç).
3. Telefonda test: "lahmacun yemek istiyorum", "kuşbaşı", "bana en yakın tavuk pilavcı bul", "çiğ börek", takip soruları ("daha yakını var mı", "otoparkı ücretsiz olsun", "bir de Buca'da bak"), 5. ✨ hakkında "son hakkındı" notu.
4. (İsteğe bağlı) Haiku sınavı: GitHub → Settings → Secrets → `ANTHROPIC_API_KEY` ekle, sonra Actions → **AI eval** → Run workflow (~3 sent).
5. Max 5x aboneliğin varsa: claude.ai faturalama ayarlarından Console hesabını bağla (aylık 100$ API kredisi).

## Şimdi yapılabilir (hesap gerekmez)

1. **Sohbet "Listede aç" düğmesi**: liste "hariç" ve "ücretsiz otopark" filtrelerini taşımıyor.
2. **Dünya mutfağı kategorisi**: sushi, ramen, makarna, steak için ayrı kategori ve sözlük.
3. **Yemek sözlüğünü büyütmek**: telefonda yanlış ya da eksik çıkan her yemek eklenecek (şu an ~180 yemek).
4. **Restoran sayfası**: kategori yoksa yedek etiket, Türkçe çalışma saatleri (sadece ~200 yerde saat var).
5. **İngilizce arayüz.**
6. **ROADMAP.md güncellemesi.**
7. Ufak: "pişi" Otopark bölümünde hâlâ gevşek eşleşiyor (Balık Pişiricisi).

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
- **"Burası kapanmış mı?" düğmesi**: kullanıcı bildirimleriyle gizleme (Cloudflare sunucusu artık var).
- **Foursquare çapraz kontrolü**: `FSQ_TOKEN` gerekir.
- **Apple ile toplu kontrol** (Apple hesabından sonra): önce denetlenen 50 yerle dene.

### Uygulama boyutu
- Şu an ~15–20 MB indirme, gömülü veri 3,2 MB. Başka şehir eklenirse şehir verisini ilk açılışta indirme düşünülür.

## Yerim ✨ (Haiku) durumu

- Açık: sunucu `https://yerim-ai.patrickgt966.workers.dev`, günde 5 ücretsiz mesaj, onay kartı, hak göstergesi, son hak notu.
- Haiku ne zaman çağrılır: kuralların anlamadığı kelime kalırsa. Selam, küfür, anlamsız mesaj hak harcamaz.
- Sınav: kurallar 51/59 (kuralla çözülebilenlerin hepsi doğru); kalanlar belirsiz istekler ve takip soruları.
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
- Başka şehir (İstanbul) araştırılsın mı?

## Tamamlananlar (10–11 Ekim)

- Veri: Overture web sitesi kontrolü ve aylık fark raporu; 13 kapanmış yer kara listede; raylı sistem istasyonları (165); otomatik veri PR'ları için GitHub izni
- Otopark: İzelman kimlikleri sabit (favoriler kaybolmuyor); Ücretsiz / 7/24 / Raylı sisteme yakın filtreleri
- Restoran: harita + alt panel (otopark ekranı gibi); otopark ekranında "Yakındaki restoranlar" haritada; sıralama (tezgâhlar aşağı, gerçek meyhane/lokanta önde)
- İsimler: ~1.000 bozuk ad düzeltildi (büyük/küçük harf, Türkçe harf, reklam metni)
- Yazılar: ~30 uzun yazı kısaltıldı; gizlilik metni ✨ ile güncel
- Sohbet: yemeğe göre arama (sözlük + "adında geçiyor / büyük ihtimalle var"), bilinmeyen yemeklerde Haiku ve "yemek mi yer mi?" sorusu, olumsuz cümleler, takip soruları, ana sayfada yazarken titreme düzeltildi
- Yerim ✨: Cloudflare sunucusu yayında, Anthropic anahtarı sunucuda, daha dolu anlatım (açık/kapalı, ücretsiz otopark, boş yer), güvenlik filtresi

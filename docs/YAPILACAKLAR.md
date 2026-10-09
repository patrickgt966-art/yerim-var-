# Yapılacaklar

Son güncelleme: 9 Ekim 2026. Önerilen başlangıç sırası: 6 → 2 → 1 → 8.

## Şimdi yapılabilir (Apple hesabı gerekmez)

1. Restoran sıralaması:
   - meyhaneler daha doğru sıralansın
   - lokanta kalitesi
   - kokoreç tezgâhları aşağıya inecek
2. Restoran sayfası:
   - rezervasyon bilgisi
   - çalışma saatleri Türkçe
   - kategori yoksa yedek etiket
   - eşleşmeyen mutfak türleri
3. Vejetaryen / diyet etiketleri
4. Daha sade yazılar
5. Bozuk isimlerin düzeltilmesi (Kemeraltı gibi)
6. İzelman otoparklarının kimliği sabit kalsın (favoriler kaybolmasın)
7. Engelli erişimi bilgisi otopark sayfasında görünsün
8. Otopark ücret tarifeleri
9. Daha fazla filtre (kapalı, ücretsiz, 7/24 vb.)
10. Park et & devam et (İZBAN/metro yanı otoparklar)
11. İngilizce arayüz
12. Doğal dille arama ("Alsancak'ta akşam 2 saat")
13. ROADMAP.md güncellemesi

## Akıllı arama planı

### Faz A: telefonda (şimdi)
0. Veri kontrolü (uzak ilçelerde restoran/otopark sayısı)
1. Metin temizleme: selamlaşma, küfür (tam kelime), dolgu, nitelik kelimeleri ("Puan bilgimiz yok")
2. Türkçe ek çözme (köfteci → köfte, mendereste → Menderes)
3. İlçe ve semt tanıma (30 ilçe + merkez noktaları)
4. Kategori kelimelerini genişletme (pirzola, kuzu, antrikot…)
5. Tek kutuda iki okuma: isim + kategori
6. "Otopark şart" filtresi (kendi otoparkı veya ≤300 m), boş sonuçta 500 m / yakın ilçe seçenekleri
7. Olumsuz cümle güvenliği; emin olunamayan cümle "belirsiz" işaretlenir
8. "Şunu anladım" etiketleri (kaldırılabilir)
9. Yönlendirme kartı (selam, küfür, anlamsız metin)
10. Senaryo cümleleri otomatik test

### Faz B: Haiku (Anthropic API hesabından sonra)
- Cloudflare aracı sunucu, anahtar koda girmez
- Sadece "belirsiz" cümleler gider; selam, küfür, konum asla
- Haiku sadece çevirir, sonucu bizim veri ve Apple bulur
- Önbellek, onay ekranı, gizlilik sayfası
- İşlem sırası: bizim veri → Apple (temiz metin) → Haiku (tek çağrı, Apple için arama metni de döner) → bizim veri + Apple → Haritada işaretle

**Haklar (karar verildi):**
- Sohbet ve kurallı arama herkese sınırsız
- ✨ Akıllı yardım (Haiku): ücretsiz günde 5, abone sınırsız (adil kullanım ~200/gün)
- Haiku'nun kullanıldığı cevapta "✨ Akıllı yardım" etiketi
- Hak bitince: bizim veri + Apple araması aynen çalışır; Yerim bir kez "Bugünkü akıllı yardım hakkın bitti, yarın yenilenir. Yerim+ ile sınırsız." der
- Sayaç sunucuda, rastgele cihaz numarasıyla; kişisel veri yok, kayıt ertesi gün silinir
- Abonelik doğrulaması Apple üzerinden (abonelik altyapısıyla birlikte)

### Faz C: Apple iş yeri araması (Apple Developer hesabından sonra)
- Veritabanında olmayan dükkânlar + yanındaki otoparklar

## Apple Developer hesabından sonra

14. Dev build (Expo Go yerine)
15. Apple Haritalar araması (veritabanında olmayan yerler)
16. Yürüme süreleri
17. Yapay zekâ özelliği
18. Widget'lar
19. App Store'a gönderim

## Karar bekleyenler

- Apple Developer hesabı (yıllık 99$)
- GitHub Pages'i açmak (gizlilik sayfası için gerekli)
- Hangi ilçeler öncelikli?
- Geri bildirim formu olsun mu?
- Destek e-posta adresi
- İstanbul verisi araştırılsın mı?

## Tamamlananlar (son)

- Şehir seçimi: şimdilik yalnızca İzmir açık, diğer şehirler "Yakında"
- "Yakındaki restoranlar" filtresi "Tümü"nün yanına alındı
- Alt panelin geri düğmesini kapatması düzeltildi
- Ev/İş silme, adres arama, haritada işaretleme

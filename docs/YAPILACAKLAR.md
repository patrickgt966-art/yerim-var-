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

## Fikirler (yapılacaklar listesiyle birlikte sunulur)

### Tek ekran ana sayfa (taslak hazır)
- Taslak: https://claude.ai/artifact/5ynm5BFPMceJfftomEhiLU → "Ana sayfa · Tek sekme (taslak)"
- "Otopark / Restoran" geçiş düğmesi kalkar; tek arama kutusu: "Yer, yemek ya da otopark yaz" (sohbeti açar)
- Üstte iki hızlı düğme: "Yakınımda otopark" ve "Yakınımda yemek"
- Aktif park kartı (sadece park edilmişse), "Canın ne çekiyor?" 8 yemek kategorisi, "Yerim'e sor" örnek cümleleri
- "Yakınında": otoparklar ve restoranlar aynı listede (otoparkta boş yer, restoranda yanındaki otopark mesafesi)
- Ev / İş, "İzmir'de popüler" (yer + yemek aramaları karışık), ortada "Yerim!" düğmesi
- Durum: şimdilik geçiş düğmesi kalıyor (karar: C); kullanıcı onaylarsa ana sayfa bu taslağa göre kurulur

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

### Faz B: Yerim ✨ (Haiku) — son plan

**İki mod**
- Yerim: kurallarla çalışır, herkese sınırsız, bedava.
- Yerim ✨: Haiku konuşur. Ücretsiz günde 5 mesaj, abone sınırsız (adil kullanım ~200/gün).

**Mesaj akışı (sırayı kod yönetir, Haiku değil)**
1. Telefonda ön kontrol: selam/teşekkür → hazır samimi cevap, hak düşmez. Küfür → sakin cevap, hak düşmez.
2. Telefon cümleyi kurallarla anlamaya çalışır. Anlarsa 3. adım atlanır.
3. ✨ Anlama çağrısı: Haiku cümleyi çevirir (ilçe, yemek, otopark şartı, Apple için arama metni) veya "konu dışı" der.
4. Arama telefonda: bizim veri → bulamazsa Apple (yer adına benziyorsa) → bulamazsa (Faz 3) internet araması, "doğrulanmadı" etiketiyle.
5. ✨ Anlatım çağrısı: Haiku sadece bulunan sonuç listesini görür ve kendi diliyle anlatır.
6. Hiçbir şey yoksa: "Bulamadım hocam, haritada gösterir misin?" + Haritada işaretle.

**Güvenlik kuralları**
- Haiku'nun cevabındaki her yer adı sonuç listesinde olmalı; değilse cevap atılır, hazır şablon gösterilir.
- Puan, fiyat, güncel olay (maç, haber, hava) uydurmaz; boş yer sayısını sadece veri güncelse söyler.
- Konum gönderilmez; mesafeler telefonda hesaplanır. Mesaj ≤ 200 karakter, geçmişten son 6 mesaj.
- İnternet yok / hata / hak bitti → sessizce kurallı Yerim'e düşer.

**Hak kuralları**
- Hak = Haiku'nun cevap verdiği mesaj. Selam, teşekkür, küfür ve hata hak düşürmez.
- Hak bitince bir kez: "Bugünkü ✨ hakların bitti, yarın yenilenir. Ben yine buradayım!"
- Sayaç sunucuda, rastgele cihaz numarasıyla; kişisel veri yok, ertesi gün silinir.

**Maliyet:** mesaj başına ~0,0006 $; ücretsiz kullanıcı en fazla ~9 cent/ay.

**Aşamalar**
- Aşama 0 (şimdi): hitap kelimeleri, Apple'a gitme kuralı, konu dışı kalıpları, stadyum otoparkları, restoran açık/kapalı bilgisi
- Aşama 1: Apple Developer hesabı → dev build → Apple araması
- Aşama 2: Anthropic hesabı → Cloudflare aracı → Yerim ✨ + onay ekranı + gizlilik sayfası
- Aşama 3: internet araması (Apple'ın ne sıklıkla bulamadığı görüldükten sonra karar)
- Aşama 4: abonelik (Yerim+)

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

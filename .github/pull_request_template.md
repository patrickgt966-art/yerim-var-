## Ne değişti?

<!-- Kısa özet. İlgili issue varsa: Closes #… -->

## Neden?

## Nasıl test edildi?

<!-- Simülatör/cihaz, iOS sürümü; arayüz değiştiyse ekran görüntüsü (açık + karanlık mod). -->

## Kontrol listesi

- [ ] Başlık Conventional Commits biçiminde (`feat:`, `fix:`, `docs:`…)
- [ ] `npm run lint`, `npm run typecheck`, `npm test` temiz
- [ ] `npx expo-doctor` ve `npx expo export --platform ios` temiz
- [ ] Yeni metinler `src/i18n/` içinde; renkler `src/theme/` tokenlarından
- [ ] Erişilebilirlik: `accessibilityLabel`, ≥ 44 pt dokunma alanı, Reduce Motion, karanlık mod
- [ ] Doğrulanmamış veri "Canlı" / "Resmi tarife" olarak etiketlenmiyor
- [ ] Yeni ağ isteği, SDK, analitik veya sır (`.env`, anahtar) eklenmedi

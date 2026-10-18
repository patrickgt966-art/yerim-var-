# Katkı rehberi

Yerim Var'a katkı vermek istediğin için teşekkürler. Bu belge kısa tutuldu; takıldığın yerde bir issue aç.

## Başlamadan

- Davranış kurallarımız: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)
- Güvenlik açıkları issue olarak **açılmaz**: [`SECURITY.md`](SECURITY.md)
- Fiyat, saat veya konum hatası mı gördün? Kod gerekmez: "Fiyat / veri yanlış" issue şablonunu kullan. Uygulamadaki otopark detayında "Bildir" butonu bunu senin için doldurur.

## Geliştirme ortamı

Gereksinimler: Node.js 22 LTS, npm. iOS simülatörü için macOS + Xcode.

```bash
npm ci
npx expo start        # geliştirme sunucusu
```

`react-native-maps` ve diğer yerel modüller nedeniyle bir development build gerekebilir: `npx expo run:ios`.

## Göndermeden önce

PR açmadan önce şunların hepsi temiz olmalı (CI de aynılarını çalıştırır):

```bash
npm run lint
npm run typecheck     # tsc --noEmit
npm test
npx expo-doctor
npx expo export --platform ios
```

## Kurallar

- **Commit mesajları** [Conventional Commits](https://www.conventionalcommits.org/) biçiminde: `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `refactor:`…
- **Her PR tek bir konuya** odaklansın.
- **Metinler koda gömülmez.** Kullanıcıya görünen her metin hem `src/i18n/tr.ts` (Türkçe) hem `src/i18n/en.ts` (İngilizce) içine girer; İngilizcesi olmayan bir Türkçe anahtar `src/i18n/__tests__/en.test.ts` testini düşürür.
- **Tasarım tokenları** yalnızca `src/theme/` içinde tanımlanır; renkleri koda yazma. Uygulama yalnızca açık paleti kullanır (karanlık mod yok, bkz. `src/theme/index.ts`).
- **Erişilebilirlik:** dokunma alanı ≥ 44 pt, butonlarda Türkçe `accessibilityLabel`, renk tek başına anlam taşımaz, Reduce Motion açıkken animasyon kapanır.
- **Veri dürüstlüğü:** doğrulanmamış veri asla "Canlı" ya da "Resmi tarife" diye etiketlenmez. `data/tariffs-ispark.json` elle düzenlenmez (`scripts/fetch-ispark-tariffs.mjs` üretir). `data/tariffs.json` içinde bir tarifeyi `official` yapıyorsan `source` (URL), `validFrom` ve `verifiedAt` alanlarını doldur.
- **Gizlilik:** analitik, reklam, crash raporlama veya izleme SDK'sı eklenmez. Konum ve favoriler bizim sunucumuza gitmez; konum yalnızca ~100 m'ye yuvarlanarak Apple Haritalar aramasına gider. Yeni bir dış servis veya ağ isteği eklemeden önce bir issue'da tartış.
- **Sır yok:** `.env`, API anahtarı veya sertifika commit etme.
- **Bağımlılıklar** `npx expo install <paket>` ile eklenir; lockfile commit edilir.
- **Lisans:** yalnızca MIT/Apache/BSD lisanslı kod uyarlanabilir ve uyarlanan yer atıfla işaretlenir. GPL/AGPL koddan yalnızca fikir alınır.

Katkıların MIT lisansı altında yayımlanır. Ad ve ikon için bkz. [`TRADEMARKS.md`](TRADEMARKS.md).

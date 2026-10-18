# Subagent orkestrasyonu

Ana Claude Code oturumu **Opus** ile çalışır ve orkestratördür. Opus kod yazmaz; planlar,
spec yazar, subagent'lara dağıtır, sonuçları birleştirir ve merge kararını verir. Kod, test ve
review subagent'larda yapılır. Amaç: Opus context'ini küçük tutmak (maliyet) ve bağımsız
işleri paralel koşturmak (hız).

## Roller ve modeller

| Agent | Model | İş | Ne zaman |
|---|---|---|---|
| (ana oturum) | opus | plan, spec, interface/contract, merge kararı | her görev |
| `code-explore` | haiku | spec'teki terim için file:line bulur | implementasyondan önce |
| `expo-docs` | haiku | SDK 57 API'sini docs.expo.dev'den getirir | emin olunmayan Expo/RN API'si |
| `spec-coder` | sonnet | mevcut satırları spec'e göre yamalar | küçük, yerel değişiklik |
| `ui-coder` | sonnet | yeni ekran / component, theme + i18n kurallarıyla | `src/app`, `src/components` |
| `server-coder` | sonnet | Cloudflare Worker + protocol | `server/yerim-ai`, `src/lib/ai/protocol.ts` |
| `test-writer` | sonnet | spec'in acceptance criteria'larına test yazar, koşar | her implementasyondan sonra, ayrı agent |
| `command-runner` | haiku | lint / tsc / jest / expo-doctor; sadece durum | doğrulama adımları |
| `code-reviewer` | sonnet | diff'i spec'e ve AGENTS.md kurallarına göre inceler | her PR |
| `risk-reviewer` | opus | maliyet, veri kaybı, gizlilik, release | sadece yüksek riskli dosyalar (aşağıda) |
| `i18n-docs` | haiku | i18n key parity, README/docs satırları, prettier | review sonrası mekanik kuyruk |

Yüksek riskli dosyalar (risk-reviewer zorunlu): `src/lib/ai/**`, `server/yerim-ai/**`,
`src/store/migrate.ts`, cihaz dışına veri gönderen her şey (`location`, `report`, `share`),
`app.json`, `eas.json`, `wrangler.toml`, `.github/workflows/**`.

## Standart akış

1. **Spec** (Opus, ana oturumda): görev → modüller → her modül için
   - dokunulacak dosyalar
   - public interface (tip, prop, endpoint şeması) — paralel worker'lar çakışmasın diye önce bu sabitlenir
   - acceptance criteria (test edilebilir cümleler)
   - yasaklar ("şu dosyaya dokunma")
2. **Keşif** (haiku, paralel): `code-explore` ilgili yerleri bulur; API şüphesi varsa `expo-docs`.
   Çıktıları spec'e eklenir, worker'lar codebase'i baştan taramaz.
3. **Implementasyon** (sonnet, paralel): bağımsız modüller aynı anda, her biri kendi worktree'sinde
   (`isolation: worktree`). Bağımlı modüller sıralı.
4. **Test** (sonnet, ayrı agent): `test-writer` implementasyonu görmeden criteria'dan test yazar.
   Kod yazan agent kendi testini yazmaz.
5. **Doğrulama** (haiku): `command-runner` ile `npm run lint`, `npx tsc --noEmit`, `npx jest --ci`.
   Kırmızı → ilgili coder'a sadece failing file:line ile geri gönder, tüm diff'i değil.
6. **Review**: `code-reviewer` (sonnet). Yüksek riskli dosya varsa ek olarak `risk-reviewer` (opus).
   BLOCKER varsa 3'e dön.
7. **Kuyruk** (haiku): `i18n-docs` key parity + docs + prettier.
8. **Merge kararı** (Opus): test çıktısı + review verdict'leri kanıt. "Çalışıyor" cümlesi kanıt değildir.

## Maliyet kuralları

- Subagent'lar Opus'a özet + diff + exit code döndürür, dosya içeriği değil. Dosya dökümü
  isteyen bir ihtiyaç varsa haiku'ya özetlettir.
- Extended thinking sadece ana oturumda. Worker'ların `effort` değeri agent dosyasında sabit;
  görev bazında yükseltme.
- Escalation: sonnet aynı spec'te iki kez başarısız olursa spec'i düzelt (genelde sorun spec'tedir).
  Üçüncü denemede o modülü opus ile koş. "Her ihtimale karşı opus" yok.
- Opus'u subagent olarak sadece `risk-reviewer`'da kullan.
- Canlı AI eval'leri (`ai-eval*.yml`) her koşuda para yakar; `protocol.ts` veya prompt değişmediyse
  tetikleme. Değiştiyse önce `limit` ile küçük koş.
- Paralellik sadece dosya kümeleri kesişmeyen işler için. Kesişiyorsa sıralı yap; merge conflict
  çözmek paralelliğin kazancından pahalıdır.

## Spec şablonu (subagent prompt'u)

```
GÖREV: <bir cümle>
DOSYALAR: <yazılabilir liste> | DOKUNMA: <liste>
INTERFACE: <tip/prop/şema, kesin>
CRITERIA:
  1. ...
  2. ...
BAĞLAM: <code-explore / expo-docs çıktısı, file:line>
BİTİŞ: <hangi komut, hangi exit code> — çıktıyı raporla, yorumlama.
```

## Hangi coder?

- Var olan satırları değiştiren küçük iş → `spec-coder`
- Yeni ekran/component veya UI davranışı → `ui-coder`
- Worker, quota, Anthropic çağrısı, protocol → `server-coder`
- Üçünü aynı görevde karıştırma; modüle böl.

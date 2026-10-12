# yerim-ai

Yerim ✨ için Cloudflare Worker. Henüz yayınlanmadı; aşağıdaki adımlarla yayınlanır.

1. console.anthropic.com adresinde hesap aç, bakiye yükle, aylık harcama limiti belirle ve bir API anahtarı oluştur.
2. `cd server/yerim-ai && npm install`
3. `npx wrangler login`
4. `npx wrangler kv namespace create QUOTA` — çıkan id'yi `wrangler.toml` içindeki `REPLACE_WITH_KV_ID` yerine yaz.
5. `npx wrangler secret put ANTHROPIC_API_KEY` — anahtar asla koda veya sohbete yazılmaz.
6. `npx wrangler deploy` — çıkan URL'yi `app.json` içinde `expo.extra.aiUrl` alanına yaz.
7. Uygulamayı yeniden başlat.

## Limitler

- Cihaz başına günde 10 ✨ (aynı mesajın /understand + /pick ya da /plan çağrıları tek ✨ sayılır; /narrate eski sürümler için duruyor, yeni uygulama kullanmıyor).
- IP başına günde 100 çağrı (`AI_DAILY_PER_IP`; `/chat` de bu sayaca girer).
- `/chat` (selam, teşekkür, veda, sohbetle ilgili laflar; Haiku, kısa cevap): ✨ hakkından düşmez, kendi sınırları vardır. Cihaz başına günde 15 cevap (`CHAT_DAILY_PER_DEVICE`), tüm cihazlar için günde 10000 (`CHAT_GLOBAL_DAILY`; dolunca Anthropic'e istek gitmez, 429 `reason: "global"`), aynı cihazdan iki çağrı arası en az 1000 ms (`CHAT_MIN_INTERVAL_MS`, 429 `reason: "slow"`). Anthropic hata verirse ya da cevap vermezse cihaz ve genel sayaç geri verilir. Sınır dolunca uygulama kendi hazır cevaplarına döner.
- Günlük sıfırlama İstanbul saatine göredir.

## Sınırları değiştirmek

Sınırlar `wrangler.toml` içindeki `[vars]` bölümünde durur (`CHAT_DAILY_PER_DEVICE`, `CHAT_GLOBAL_DAILY`, `AI_DAILY_PER_IP`, `CHAT_MIN_INTERVAL_MS`). Değeri değiştir, sonra `npx wrangler deploy` çalıştır; kod değişikliği ve uygulama güncellemesi gerekmez. Değer yoksa ya da geçersizse varsayılan kullanılır.

## Gizlilik

Yalnızca mesaj metni (ve kısa sohbet geçmişi) gönderilir; konum asla gönderilmez.

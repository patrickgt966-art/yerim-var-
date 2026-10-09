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

- Cihaz başına günde 5 ✨ (aynı mesajın anlama + anlatma çağrıları tek ✨ sayılır).
- IP başına günde 100 çağrı.
- Günlük sıfırlama İstanbul saatine göredir.

## Gizlilik

Yalnızca mesaj metni (ve kısa sohbet geçmişi) gönderilir; konum asla gönderilmez.

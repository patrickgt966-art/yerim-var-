# yerim-ai

Yerim ✨ için Cloudflare Worker. Yayında: `https://yerim-ai.patrickgt966.workers.dev` (`app.json` → `expo.extra.aiUrl`). Sunucudaki her değişiklik `cd server/yerim-ai && npx wrangler deploy` ile yayınlanır; bunu proje sahibi yapar.

Sıfırdan kurmak için:

1. console.anthropic.com adresinde hesap aç, bakiye yükle, aylık harcama limiti belirle ve bir API anahtarı oluştur.
2. `cd server/yerim-ai && npm install`
3. `npx wrangler login`
4. `npx wrangler kv namespace create QUOTA` — çıkan id'yi `wrangler.toml` içindeki `REPLACE_WITH_KV_ID` yerine yaz.
5. `npx wrangler secret put ANTHROPIC_API_KEY` — anahtar asla koda veya sohbete yazılmaz.
6. `npx wrangler deploy` — çıkan URL'yi `app.json` içinde `expo.extra.aiUrl` alanına yaz.
7. Uygulamayı yeniden başlat.

## Limitler

Tek sayaç: her mesaj önce Haiku'ya gider (`/understand`, yönlendirici). Model önce kısa ve gizli bir `meaning` cümlesi yazar, sonra düz bir yapılandırılmış şemayla `search`, `chat` ya da `unknown` döner. Yemek aramalarında `/pick` yakındaki en çok 15 yeri adı ve türüyle görür, uyanları (`fit`, `noneFit`) değerlendirip birini seçer; yalnızca sıra numaraları döner.

- Cihaz başına günde 10 yapay zekâ mesajı, ilk mesaj dahil (`FREE_DAILY`, `src/lib/ai/protocol.ts`; ayrı bir sohbet hakkı yok). `/understand`, `/pick`, `/plan`, `/narrate` ve eski uygulamalar için duran `/chat` aynı sayaçtan düşer. Aynı mesajın (aynı `messageId`) birden çok çağrısı tek hak sayılır.
- Tüm cihazlar için günde 10000 mesaj (`AI_GLOBAL_DAILY`; eski adı `CHAT_GLOBAL_DAILY` yeni ad boşsa okunur). Dolunca Anthropic'e istek gitmez, 429 `reason: "global"`.
- IP başına günde 100 çağrı (`AI_DAILY_PER_IP`, tüm uç noktalar).
- Aynı cihazdan iki yeni mesaj arası en az 1000 ms (`CHAT_MIN_INTERVAL_MS`, 429 `reason: "slow"`); aynı mesajın `/pick` ve `/plan` çağrıları buna takılmaz.
- Anthropic hata verirse ya da cevap vermezse hak (cihaz ve genel sayaç) geri verilir.
- Uygulama yönlendiriciyi 9 sn içinde alamazsa bekleyişten vazgeçer ve `POST /cancel { deviceId, messageId }` gönderir; sunucu o mesajın hakkını geri verir (çağrı sürüyorsa bitince verir; tekrar çağrılması zarar vermez). Cihaz başına günde en fazla 5 iptal geri ödenir.
- Günlük sıfırlama İstanbul saatine göredir.

## Sınırları değiştirmek

Sınırlar `wrangler.toml` içindeki `[vars]` bölümünde durur (`AI_GLOBAL_DAILY`, `AI_DAILY_PER_IP`, `CHAT_MIN_INTERVAL_MS`). Değeri değiştir, sonra `cd server/yerim-ai && npx wrangler deploy` çalıştır; uygulama güncellemesi (App Store sürümü) gerekmez. Değer yoksa ya da geçersizse varsayılan kullanılır. Cihaz başına günlük hak (10) kod içindedir ve uygulamanın göstergesiyle aynı olmalıdır: değiştirmek hem sunucuyu hem uygulamayı etkiler.

## Günlük (gecikme)

Her yapay zekâ çağrısı için tek satır JSON yazılır: `{"endpoint":"/understand","ms":812,"outcome":"ok","remaining":7}`. `outcome`: `ok`, `refusal`, `error` ya da `timeout-cancelled` (uygulama vazgeçti ve hak geri verildi). Mesaj metni ve cihaz kimliği asla yazılmaz. Canlı izlemek için:

```bash
cd server/yerim-ai && npx wrangler tail --format pretty
```

## Gizlilik

Gönderilenler: mesaj metni, kısa sohbet geçmişi, seçili şehrin kimliği, rastgele cihaz kimliği ve `/pick` için uygulamanın kendi verisinden yakındaki yerlerin herkese açık adı, türü ve bilgileri (yürüme süresi, otopark uzaklığı, ücretsiz mi, boş yer, açık mı). Konum (koordinat) asla gönderilmez. Hak sayaçları (cihaz kimliği ve IP adresine bağlı) KV'de en fazla iki gün tutulur.

# yerim-ai

Yerim ✨ için Cloudflare Worker. Yayında: `https://yerim-ai.patrickgt966.workers.dev` (`app.json` → `expo.extra.aiUrl`). Sunucudaki her değişiklik `cd server/yerim-ai && npx wrangler deploy` ile yayınlanır; bunu proje sahibi yapar.

Sıfırdan kurmak için:

1. console.anthropic.com adresinde hesap aç, bakiye yükle, aylık harcama limiti belirle ve bir API anahtarı oluştur.
2. `cd server/yerim-ai && npm install`
3. `npx wrangler login`
4. `npx wrangler kv namespace create QUOTA` — çıkan id'yi `wrangler.toml` içindeki `[[kv_namespaces]]` bölümünün `id` alanına yaz (depodaki id proje sahibinin hesabına aittir). Sayaçların çalıştığı Durable Object (`QuotaCounter`) ilk `deploy` ile kendiliğinden oluşur.
5. `npx wrangler secret put ANTHROPIC_API_KEY` — anahtar asla koda veya sohbete yazılmaz.
6. `npx wrangler deploy` — çıkan URL'yi `app.json` içinde `expo.extra.aiUrl` alanına yaz.
7. Uygulamayı yeniden başlat.

## Limitler

Tek sayaç: her mesaj önce Haiku'ya gider (`/understand`, yönlendirici). Model önce kısa ve gizli bir `meaning` cümlesi yazar, sonra düz bir yapılandırılmış şemayla `search`, `chat` ya da `unknown` döner. Yemek aramalarında `/pick` yakındaki en çok 40 yeri (`MAX_PICK_CANDIDATES`) adı ve türüyle görür, uyanları (`fit`, `noneFit`) değerlendirip birini seçer; yalnızca sıra numaraları döner.

- Cihaz başına günde 10 yapay zekâ mesajı, ilk mesaj dahil (`FREE_DAILY`, `src/lib/ai/protocol.ts`; ayrı bir sohbet hakkı yok). `/understand`, `/pick`, `/plan`, `/narrate` ve eski uygulamalar için duran `/chat` aynı sayaçtan düşer. Aynı mesajın (aynı `messageId`) birden çok çağrısı tek hak sayılır.
- Tüm cihazlar için günde 10000 mesaj (`AI_GLOBAL_DAILY`; eski adı `CHAT_GLOBAL_DAILY` yeni ad boşsa okunur). Dolunca Anthropic'e istek gitmez, 429 `reason: "global"`.
- IP başına günde 100 çağrı (`AI_DAILY_PER_IP`, tüm uç noktalar). IPv4 adresi tek başına, IPv6 adresi /64 önekiyle sayılır (bir abone ya da sunucu genelde bütün bir /64'e sahiptir).
- Aynı cihazdan iki yeni mesaj arası en az 1000 ms (`CHAT_MIN_INTERVAL_MS`, 429 `reason: "slow"`); aynı mesajın `/pick` ve `/plan` çağrıları buna takılmaz.
- Anthropic'e ulaşılamazsa ya da HTTP hatası dönerse (faturalanmayan çağrı) hak (cihaz ve genel sayaç) geri verilir. Anthropic cevap verip faturaladıysa ama cevap kullanılamıyorsa (kesik, şemaya uymayan, reddedilen ya da boş) hak düşer ve o aşama aynı içeriğe bağlı kalır.
- İstanbul'da gece yarısını geçen bir mesaj ilk düştüğü günden sayılır; sonraki aşamaları ücretsizdir ve iadesi de o güne yapılır.
- Uygulama yönlendiriciyi 12 sn içinde (`ROUTER_TIMEOUT_MS`) alamazsa bekleyişten vazgeçer ve `POST /cancel { deviceId, messageId }` gönderir; sunucu o mesajın hakkını bir kez geri verir (hak henüz düşmediyse çağrı bitince verir; tekrar çağrılması ikinci bir iade getirmez). İptal işareti bir kez kullanılınca silinir. Cihaz başına günde en fazla 5 iptal geri ödenir.
- Günlük sıfırlama İstanbul saatine göredir.

## Sınırları değiştirmek

Sınırlar `wrangler.toml` içindeki `[vars]` bölümünde durur (`AI_GLOBAL_DAILY`, `AI_DAILY_PER_IP`, `CHAT_MIN_INTERVAL_MS`). Değeri değiştir, sonra `cd server/yerim-ai && npx wrangler deploy` çalıştır; uygulama güncellemesi (App Store sürümü) gerekmez. Değer yoksa ya da geçersizse varsayılan kullanılır. Cihaz başına günlük hak (10) kod içindedir ve uygulamanın göstergesiyle aynı olmalıdır: değiştirmek hem sunucuyu hem uygulamayı etkiler.

## Günlük (gecikme)

Her yapay zekâ çağrısı için tek satır JSON yazılır: `{"endpoint":"/understand","ms":812,"outcome":"ok","remaining":7}`. `outcome`: `ok`, `refusal`, `error` ya da `timeout-cancelled` (uygulama vazgeçti ve hak geri verildi). Mesaj metni ve cihaz kimliği asla yazılmaz. Canlı izlemek için:

```bash
cd server/yerim-ai && npx wrangler tail --format pretty
```

## Yönetici sayfası

İşaretlenen yerleri görmek ve gizlemek için tarayıcıda `https://<worker>/admin` adresini aç ve yönetici anahtarını (`ADMIN_TOKEN`) gir; anahtar yalnızca o sekmenin `sessionStorage` alanında kalır, sayfanın kendisinde anahtar ya da veri yoktur. `ADMIN_TOKEN` tanımlı değilse sayfa 404 döner. `GET /admin/flagged?city=` ve `POST /admin/review` için `curl` komutları (`Authorization: Bearer <ADMIN_TOKEN>`) eskisi gibi çalışır.

## Gizlilik

Gönderilenler: mesaj metni, kısa sohbet geçmişi, seçili şehrin kimliği, rastgele cihaz kimliği ve `/pick` için uygulamanın kendi verisinden yakındaki yerlerin herkese açık adı, türü ve bilgileri (yürüme süresi, otopark uzaklığı, ücretsiz mi, boş yer, açık mı). Konum (koordinat) asla gönderilmez. Hak sayaçları (cihaz kimliği ve IP adresine bağlı) `QuotaCounter` Durable Object'inde tutulur ve en geç 49 saat içinde silinir: süreleri ilk yazıldıkları anda 48 saat olarak konur, sonraki yazmalar uzatmaz; süresi dolanları saatlik bir alarm siler.

## Tür denetimi

```bash
cd server/yerim-ai && npm run typecheck
```

Kök `npx tsc --noEmit` sunucuyu kapsamaz (`server` hariç tutulur); Worker kodunu bu komut denetler.

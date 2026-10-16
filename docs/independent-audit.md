# Yerim Var bağımsız denetimi

İncelenen taban: `main`, `5a394c3ecd19d2a3cf0c7ed27b3a7fade8ddb986`.
Konumlar aşağıda bu **tabanın satırlarıdır**. Gerçek Anthropic API'si çağrılmadı;
Worker, istemci ve asistan testlerinde mock kullanıldı. Veri yenileme çalıştırılıp
paketlenmiş veriler değiştirilmedi. Sırlar ve `wrangler.toml` değiştirilmedi.

13 bulgu: 2 high, 10 medium, 1 low. 12 bulgu için önce başarısız regresyon üretildi,
sonra dar kapsamlı düzeltme yapıldı. Dağıtık KV yarışı bu denetimde açık kaldı; sonradan
Durable Object ile kapatıldı (bulgu 1).

## Bulgular

### 1. high — KV sayaçları eşzamanlı isteklerle aşılabiliyor — DÜZELTİLDİ (sonradan)

- **Konum:** `server/yerim-ai/src/quota.ts:62`, `:105`, `:199`, `:221`.
- **Hata:** Cihaz, IP ve global sayaçları ayrı `get` / `put` işlemleriyle güncelleniyor.
  Kontrol ile artırma atomik değil. İade işlemleri de aynı şekilde yarışıyor.
- **Yeniden üretim:** Aynı fake KV üzerinde `Promise.all` ile IP sınırı 1 olan iki
  `ipGuard` çağrısı → `[true, true]`, kayıtlı sayaç `1`. Cihaz sınırı 10 ve global
  sınır 1 iken 12 farklı mesajı eşzamanlı `takeUse` ile gönder → 12'si de kabul,
  cihazda kalan hak `9`. Bu sonuç gecikmesiz bir Map ile bile üretildi;
  Cloudflare KV'nin eventual consistency davranışı ayrıca koruma sağlamaz.
- **Önerilen düzeltme:** Kontrol, harcama, aşama kimliği ve iadeyi tek bir atomik
  işlemde tutan Durable Object / işlemsel depolama kullanın. IP ve global sınırlar
  da aynı tutarlılık güvencesine ihtiyaç duyar. İzolat içi mutex yeterli değildir.
  Bu değişiklik Worker bağlaması gerektirdiğinden, `wrangler.toml` yasağı altında
  uygulanmadı. Diğer düzeltmeler bu açığı kapatmış gibi değerlendirilmemelidir.
- **Sonradan düzeltme:** Sayaç adımlarının hepsi `server/yerim-ai/src/store.ts` içinde tek
  işlem hâline getirildi ve `QuotaCounter` Durable Object'inde sırayla çalışıyor
  (`wrangler.toml`: `QUOTA_DO`). Testler: `server/yerim-ai/src/__tests__/store.test.ts`.

### 2. high — Aynı messageId ile farklı sorular ücretsiz çalıştırılabiliyor — DÜZELTİLDİ

- **Konum:** `server/yerim-ai/src/quota.ts:183`, `:196`; `server/yerim-ai/src/index.ts:195`.
- **Hata:** Önceden ücretlendirilmiş kimlik, istek içeriğine bakılmadan ücretsiz
  kabul ediliyor; Worker her defasında modeli yeniden çağırıyor.
- **Yeniden üretim:** `/understand {deviceId:"dev-1",messageId:"reused",text:"ilk soru",...}`
  → `remaining:9`; aynı uç noktaya aynı kimlikle `text:"tamamen farklı bir soru"`
  → yine başarılı model çağrısı ve `remaining:9`. IP sınırına kadar tekrar edilebilir.
- **Düzeltme:** Her mesaj/aşama için doğrulanmış isteğin SHA-256 özeti tutuluyor;
  başka içerikle kimlik kullanımı 409 alıyor. İstek metni/cevap KV'ye yazılmıyor.
  Aynı isteğin tekrarları ve aynı mesajın `/pick` gibi sonraki aşamaları çalışıyor.
  Aynı isteğin yeniden denenmesi hâlâ upstream çağrısı yapabilir; bu düzeltme
  cevap önbelleği veya API çağrısı başına sert maliyet sınırı değildir.
  KV yarışı nedeniyle bu bağlama da dağıtık atomiklik garantisi değildir (bulgu 1).
- **Test:** `server/yerim-ai/src/__tests__/worker.test.ts`; mevcut tekrar/iade E2E testleri.

### 3. medium — Kısmi Overpass sonucu sağlam bir bölgenin kayıtlarını silebiliyor — DÜZELTİLDİ

- **Konum:** `scripts/fetch-sources.mjs:426`, `:958`.
- **Hata:** Başarısız kutulara rağmen yüzdesel başarı eşiği tutarsa sonuç yazılabiliyor.
  Toplam kayıt sayısının %70 koruması, tek bir bölgenin tamamen kaybolmasını yakalamıyor.
- **Yeniden üretim:** Dört kutunun üçü başarılı, sonuncu ve dört alt kutusu başarısız;
  eşik %50 → üç kutuluk dizi döner. Eski toplamın %75'i kaldığında `writeData`
  dosyayı kabul eder; son kutudaki bütün eski kayıtlar kaybolur.
- **Düzeltme:** Herhangi bir grupta eksik kutu kaldığında `null`; mevcut dosya korunuyor.
  İsteğe bağlı landmark grubu kesintisi de eski kayıtları sildirmiyor. Sonuç, hatalı bir koşuda daha
  eski fakat tam verinin kalmasıdır.
- **Test:** `scripts/__tests__/fetch-sources.test.ts` (gerçek betik tanımları, mock ağ).

### 4. medium — Geçici DNS kesintisi işletme sitelerini ölü sayıyor — DÜZELTİLDİ

- **Konum:** `scripts/fetch-overture.py:428`.
- **Hata:** Bütün `socket.gaierror` sonuçları `dead`. Yenileme sunucusunun geçici
  DNS sorunu yüzünden bağlantılar silinebiliyor ve doğrulanmamış işletmeler
  `sp:1` ile şüpheli işaretlenebiliyor. Kayıt sayısı değişmediği için %70 koruması işlemez.
- **Yeniden üretim:** `classify(socket.gaierror(socket.EAI_AGAIN,"temporary failure"))`
  → `dead` (beklenen `unknown`). Bu sonuç `_check_url` için iki protokolde de
  oluşursa `check_websites`, `w` alanını siler ve doğrulanmamış kayda `sp:1` ekler.
- **Düzeltme:** Yalnızca kalıcı isim bulunamama (`EAI_NONAME`) ölü; geçici/diğer
  çözümleyici hataları belirsiz kalıyor.
- **Test:** Betiğin `--selftest` testi, gerçek ağ çağrısı olmadan.

### 5. medium — JSON gövdesindeki timeout iptal/iade yolunu atlıyor — DÜZELTİLDİ

- **Konum:** `src/lib/ai/client.ts:165`, `:172`, `:203`.
- **Hata:** HTTP başlığı geldikten sonra gövde beklerken abort olursa iç `catch`,
  timeout'u schema/HTTP hatasına çeviriyor; `/cancel` gönderilmiyor. 429 gövdesi
  durumunda yanlışlıkla cihaz kotası tükenmiş de sayılabiliyor.
- **Yeniden üretim:** Anında HTTP 200 veya 429 başlığı; `json()` abort'a kadar
  bekliyor → 9 sn sonunda `schema`/`quota`, iptal çağrısı yok.
- **Düzeltme:** Gövde okunurken timeout oluşursa ortak timeout yakalayıcısına geçiliyor;
  `detail:"timeout"` ve arka planda `/cancel` üretiliyor.
- **Test:** `src/lib/ai/__tests__/client.test.ts`, iki HTTP durumu ve sahte saat.

### 6. medium — Eski Worker için tekrar, 9 saniyelik bütçeyi yeniden başlatıyor — DÜZELTİLDİ

- **Konum:** `src/lib/ai/client.ts:119`; `src/data/assistant.ts:915`.
- **Hata:** Şehir alanı nedeniyle 400 veren eski Worker'a tekrar tam 9 sn veriliyor.
  Asistan 9 sn'de kurala dönse de arka plandaki model isteği neredeyse 18 sn sürebiliyor;
  geç cevap/iade ve hak göstergesinin değişmesi mümkün.
- **Yeniden üretim:** İlk 400 yanıtı 8,9 sn'de; şehir alanı çıkarılan ikinci istek
  hiç bitmiyor → istemci hâlâ 9. saniyede bekliyor, ancak 17,9 sn'de timeout.
- **Düzeltme:** Tekrar yalnızca ilk isteğin bütçesinden kalan süreyi kullanıyor.
- **Test:** `src/lib/ai/__tests__/client.test.ts`, 8,9 sn + bekleyen tekrar.

### 7. medium — Tamamen geçersiz fit listesi “her aday olur”a dönüşüyor — DÜZELTİLDİ

- **Konum:** `src/lib/ai/protocol.ts:657`; `src/lib/ai/verify.ts:98`.
- **Hata:** `fit` süzülüp boşalınca kısıt kaldırılıyor. Modelin uygun ilan etmediği
  bir kart `closest` / `open_now` gerekçesiyle seçilebiliyor.
- **Yeniden üretim:** Üç aday; `{pick:0,fit:[99],reasons:["open_now"]}` ve aday 0 açık
  → önce kabul. `toPick` de `[99]` bilgisini `[]` yaparak bu kabulü mümkün kılıyor.
- **Düzeltme:** Başlangıçta dolu bir `fit`, seçilen geçerli indeksi içermiyorsa reddediliyor.
  Eski Worker'ın eksik `fit` alanı ve bilinçli `fit:[]` desteği korunuyor.
- **Test:** `protocol.test.ts` ve `verify.test.ts`.

### 8. medium — Küçük harfli tek kelimelik mekân adı serbest metinden geçiyor — DÜZELTİLDİ

- **Konum:** `src/lib/ai/freeText.ts:193`.
- **Hata:** Tek kelimelik isim yalnızca cümle başında aranıyor; cümle ortasında küçük
  harfle yazılırsa büyük harf denetimi de yakalamıyor.
- **Yeniden üretim:** `names:["Mado"]`, tone `"Bence mado tercih edilebilir."`
  → metin kabul; yasaklanan mekân tavsiyesi gösterilebilir.
- **Düzeltme:** Bilinen isimler, mevcut uzunluk eşiğiyle, bütün metinde kelime sınırında aranıyor.
- **Test:** `freeText.test.ts`; `madem` gibi yalnızca önek benzerliği taşıyan kelime kabul ediliyor.

### 9. medium — Şehir değişirken eski “Haritada gör” koordinatı kalıyor — DÜZELTİLDİ

- **Konum:** `src/app/(tabs)/harita.tsx:94`, `:108`.
- **Hata:** Yerel merkez sıfırlansa da route koordinatı önce geliyor. Yeni şehrin
  otoparkları eski şehrin merkezinde aranıyor; harita boş veya yanlış konumda kalıyor.
- **Yeniden üretim:** İzmir'de `lat=38.43&lng=27.14&ts=1` → İstanbul seç → merkez
  hâlâ `{38.43,27.14}`, İstanbul merkezi değil.
- **Düzeltme:** Parametre ziyareti açıldığı şehre bağlanıyor ve şehir değişiminde
  geçersizleşiyor. Eski şehre dönüş bunu diriltmiyor; sonraki yeni harita ziyareti kabul ediliyor.
- **Test:** `src/components/__tests__/MapCity.test.tsx`, gerçek ekran ve store.

### 10. medium — Ankara tarama kutusu Şereflikoçhisar'ı kapsamıyor — DÜZELTİLDİ

- **Konum:** `scripts/fetch-sources.mjs:107`.
- **Hata:** Yer/yemek taramasının alt enlemi 38,95; uygulama ise daha geniş Ankara
  alanını destekliyor. Güneydeki ilçeler OSM arama/yemek verisinde eksik kalıyor.
- **Yeniden üretim:** Şereflikoçhisar merkezi `{lat:38.9381,lng:33.5386}` → üretilen
  kutuların hiçbirinde değil.
- **Düzeltme:** Kutu uygulamanın Ankara sınırlarıyla eşitlendi; eski kutuya göre
  tanımlanmış kuzeydoğu atlaması kaldırıldı. Overpass il poligonu filtresi sürüyor.
- **Test:** `scripts/__tests__/fetch-sources.test.ts`, Ankara'nın 25 ilçe merkezi.

### 11. medium — IP sınırı cihazın günlük hakkını sıfırlatıyor — DÜZELTİLDİ

- **Konum:** `server/yerim-ai/src/index.ts:190`; `src/lib/ai/client.ts:143`;
  `src/app/sohbet.tsx:63`.
- **Hata:** IP limiti genel 429 dönüyor. İstemci bunu cihaz kotası sayıp `markOut()`
  çağırıyor; kalan hak yanlış gösteriliyor ve yönlendirici devre dışı kalıyor.
- **Yeniden üretim:** Mock IP limiti 1; bir başarılı mesajdan sonra ikinci çağrı
  → Worker `{error:"rate_limited"}`, istemci `reason:"quota"`; cihazda gerçekte 9 hak var.
  Ortak NAT kullanan farklı cihazlarla varsayılan sınırda da aynı durum oluşur.
- **Düzeltme:** Worker `reason:"ip"` ve gerçek `remaining` döndürüyor; istemci bu
  nedeni geçici AI hatası olarak işliyor. Yerel kota sıfırlanmıyor.
- **Test:** Worker ve istemci testleri.

### 12. medium — Alan adı listesi ve ASCII rakam denetimi serbest metinde aşılabiliyor — DÜZELTİLDİ

- **Konum:** `src/lib/ai/freeText.ts:121`, `:143`.
- **Hata:** URL filtresi birkaç uzantıyı listeliyor; rakam kontrolü yalnızca ASCII.
  Modelin link veya rakam yazması böylece her durumda engellenmiyor.
- **Yeniden üretim:** Tone `"Detaylar için ornek.xyz adresine bak."`, aynı metnin
  `.dev` biçimi ve `"Bedel ٣₺."` → üçü de kabul ediliyor.
- **Düzeltme:** Alan adı biçimi Unicode harfleriyle uzantı listesi olmadan; sayılar
  `\p{N}` ile denetleniyor. Bunlar metni düzenlemiyor, geçersiz metni reddediyor.
- **Test:** `freeText.test.ts`, üç girişin önce geçtiği ve sonra reddedildiği regresyonlar.

### 13. low — Aday adı kesilirken emoji yarıya bölünebiliyor — DÜZELTİLDİ

- **Konum:** `src/data/assistant.ts:2304`, `:2317`.
- **Hata:** `.slice(0,80)` bir UTF-16 surrogate çiftini bölüyor; geçersiz Unicode,
  Anthropic isteğinin 400 almasına ve bütün pick aşamasının kurala dönmesine yol açabilir.
- **Yeniden üretim:** Kendi restoran kaydımızın adı `"a".repeat(79)+"🍔"`
  → aday adı 79 harf + tek yüksek surrogate. Regresyon, gönderilen adayda bunu doğruladı.
- **Düzeltme:** Ad ve tür etiketleri mevcut `clipText` yardımcısıyla kesiliyor.
- **Test:** `assistantAi.test.ts`, gerçek kayıt kimliği ve mock AI isteği.

## Doğru bulunanlar ve sınırlar

- **Structured output:** Worker'ın kullandığı gerçek, sabitlenmiş SDK'nın
  `zodOutputFormat` çıktısı API çağrısı olmadan incelendi. `understand`: 0 union,
  0 optional, 0 `$defs/$ref`; `chat`: 0/0/0; `pick(15)` ve `parkPick(5)`: 3/0/0;
  `plan(5,15)`: 1/0/0. 16 union / 24 optional sınırları aşılmıyor; `anyOf` içinde
  `$defs` yok. `UnderstandingModelSchema` düz ve zorunlu alanlı; boş sentinel'lar
  uygulamanın eski union biçimine çevriliyor.
- **Total dönüşüm:** `toUnderstanding` dış girdiyi `try/catch` içinde okuyor,
  uzunluk/listeleri sınırlıyor ve dönüşü `UnderstandingSchema.safeParse` ile doğruluyor.
  Bozuk alan, bilinmeyen kod, null ve hatalı model çıktısı testleri/fuzz mevcut.
- **Kart kimliği:** AI yeni kayıt/URL/koordinat oluşturamıyor. Uygulama yalnızca
  gönderdiği aday kartı indeksle alıyor. Plan parkı da seçilen restoranın kendi
  seçeneklerinden olmalı. Bilinmeyen/geçersiz indeks ve gerekçeler reddediliyor.
  `noneFit`, tercih işaretini göstermiyor; eldeki kartlar dürüst uyarıyla kalıyor.
- **Prompt injection:** OSM/Overture adı hâlâ güvenilmeyen metindir; JSON'a almak
  talimat etkisini kanıtlanmış biçimde ortadan kaldırmaz. Modelin `fit` kararı
  semantik bir model yargısıdır; bunun manipüle edilemeyeceği iddia edilemez.
  Model girdisinde API anahtarı, IP ve cihaz kimliği yok; araç/ağ erişimi de yok.
  Bu nedenle isim yoluyla bunları sızdıran bir kanal saptanmadı. Mock testinden
  gerçek model üzerinde injection başarısı sonucu çıkarılmadı. Somut metin filtresi
  açığı bulgu 8'de düzeltildi; kart ve gerçek gerekçe denetimi ayrıca sürüyor.
- **Kota/iade:** Normal, sıralı akışta bir mesajın understand/pick/plan aşamaları
  tek hak; API hatası, refusal, okunamayan çıktı ve iptal idempotent iade ediliyor.
  Devam aşaması başarısızsa önceden başarılı understand hakkı ikinci kez iade
  edilmiyor. Günde 5 iptal iadesi sınırı bilinçli mevcut davranış; sonsuz iade yok.
  Cihaz kimliği istemcinin beyanıdır; fiziksel cihaz doğrulaması yoktur. Kimlik
  değiştirme/sıfırlama per-device sayacı aşabilir; IP/global katmanı bu yüzden önemlidir.
- **Fallback:** HTTP, ağ, schema, refusal, router timeout ve kota durumlarında
  kural cevabı/uygun yeniden sorma şablonu var. Pick/plan doğrulanmazsa mevcut
  kural kartları kalıyor. Her uç noktanın toplam süre sınırı aynı değildir:
  router 9 sn, pick/plan 12 sn; 9 sn tüm sohbet işleminin toplam bütçesi değildir.
- **Uyumluluk:** Eksik şehir eski uygulama için İzmir'e düşüyor; eksik yeni search
  alanları istemcide varsayılan alıyor; eski `offtopic` chat'e çevriliyor; eksik
  `fit` eski pick davranışını koruyor. Eski Worker'ın şehir 400'ü tek tekrar ile
  karşılanıyor (artık aynı süre bütçesinde). 15 adayı bilmeyen daha eski bir
  Worker `/pick` için 400 verebilir; güvenli kural cevabı kalır, bütün yeni AI
  özelliklerinin eski Worker'da eşdeğer çalıştığı iddia edilmiyor.
- **Şehirler:** Provider/query/cache anahtarları şehre bağlı; canlı yükleme başında
  şehir sabitleniyor. Statik restoran/otopark/yer/raylı sistem indeksleri şehir
  anahtarlı. Sohbet şehre göre yeniden açılıyor; son aramalar sıfırlanıyor.
  Ev/İş, favoriler ve aktif parkın korunması store'da açıkça kullanıcı verisi olarak tasarlanmış.
- **İSPARK:** String ve virgüllü koordinatlar, `emptyCapacity` 0/null/bozuk/aşırı
  değer, kapasite 0, `isOpen` 0/1/boolean/string, saatler, kopya kimlik ve boş/
  şema değiştirmiş yanıtlar mevcut fixture/capture testleriyle doğrulandı.
  İSPARK ve İzmir kaynaklarında ölçüm zamanı uydurulmuyor; eski doluluk gizleniyor.
- **Ankara/Bursa/Antalya:** Canlı provider yok, ağdan doluluk beklenmiyor;
  `static-only` normal sonuç, kesinti hatası değil. Banner testleri üç şehirde
  sakin “canlı veri yok” metnini ve alert/kesinti bulunmadığını doğruluyor.
- **Veri betikleri:** Overpass HTTP 200 içindeki `remark` kısmi sonuçları reddediyor;
  genel %70 düşüş koruması var. Overture il poligonu, ülke ve kategori süzgeçleri,
  boyut sınırı ve %70 koruması var. Telefon alan kodları İzmir 232, İstanbul
  212/216, Ankara 312, Bursa 224, Antalya 242 olarak doğru aktarılıyor.
  Workflow yenilemeyi main'e otomatik yayınlamıyor; zamanlanmış/manual koşu PR
  oluşturuyor. Bu denetimde dış veri indirme veya gerçek AI eval workflow'u çalıştırılmadı.

## Kontroller

Node `22.23.3` kullanıldı (CI'nin Node 22 ana sürümü). `npm ci` aynı lockfile ile
çalıştırıldı; npm önbelleği yazılabilir `/tmp` altına alındı. Expo'nun ortamda
yazılamayan kullanıcı dizinine telemetri yazma girişimini engellemek için
`EXPO_NO_TELEMETRY=1` kullanıldı; uygulama yapılandırması değiştirilmedi.

| Komut | Temiz main | Düzeltmeli dal |
| --- | --- | --- |
| `npm ci` | 0 — 1086 paket, 22 sn; peer/deprecation uyarıları | Aynı kurulum/lockfile |
| `npm run lint` | 0 — 0 hata, 1 mevcut uyarı | 0 — aynı uyarı |
| `npm run typecheck` | 0 — hata yok | 0 — hata yok |
| `npm test -- --ci` | 0 — 65 suite, 1268 test; 688,386 sn | 0 — 67 suite, 1285 test; 672,405 sn |
| `npx expo-doctor` | 1 — 19/21; iki ağ kontrolü başarısız | Native/config değişmedi |
| `npx expo export --platform ios --output-dir dist` | 0 — iOS HBC üretildi | 0 — iOS HBC üretildi |

Temiz main testi, değişikliklerden etkilenmemesi için aynı commit'in ayrı temiz
kopyasında, kurulan aynı node_modules ile çalıştırıldı. Son dal testi doğrudan
çalışma deposunda, yukarıdaki komutun aynısıyla tamamlandı.

Lint'in tek uyarısı önceden mevcut `scripts/ai-eval.ts:1` kullanılmayan
`eslint-disable` satırı; bu stil bulgusu düzeltilmedi. `expo-doctor` çıktısı:

```text
Running 21 checks on your project...
TypeError: fetch failed
Error: getaddrinfo EAI_AGAIN exp.host
19/21 checks passed. 2 checks failed.
✖ Check Expo config (app.json/ app.config.js) schema
✖ Validate packages against React Native Directory package metadata
Directory check failed with unexpected server response
```

Bu çıktı bir uygulama hatasını kanıtlamıyor; ağ nedeniyle tam doctor doğrulaması
alınamadı. Telemetri kapatılmadan ilk Expo denemesi ortamın kullanıcı dizinine
`.expo` yazamadığı için durmuştu; telemetri kapalı tekrarında export başarılı oldu.

Ek doğrulamalar: `fetch-overture.py --selftest` → `selftest ok`; gerçek SDK şema
incelemesi → 5/5; regresyonlarda önce başarısız, düzeltmeden sonra başarılı koşular.
Worker'ın ek `--skipLibCheck` kontrolü de geçti. Ham Worker TypeScript kontrolünde, önceden var olan DOM/Cloudflare/Node
bildirim çatışmaları görüldü; kök CI typecheck'i Worker'ı dışlıyor. Bu bildirimi
bir çalışma zamanı hatası gibi raporlamadım ve tsconfig refaktörü yapmadım.

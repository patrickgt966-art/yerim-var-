import { BANNED_WORDS, validateFreeText } from '../freeText';

const ctx = {
  names: ['Aysel Abla Lokantası', 'Mado', 'Konak Otopark'],
  districts: ['Bornova', 'Konak'],
};

describe('validateFreeText', () => {
  it.each([
    ['tone', 'Yıldönümünüz kutlu olsun!'],
    ['tone', 'Kalabalık bir grup için rahat bir seçim yapalım.'],
    ['clarify', 'Hangi semtte yemek istersiniz?'],
    ['clarify', 'Hangi otoparka bakalım, Bornova mı Konak mı?'],
    [
      'dishNote',
      'Kibbe, bulgur ve kıymayla yapılan, içli köfteye benzeyen bir Orta Doğu yemeğidir.',
    ],
  ] as const)('accepts %s: "%s"', (zone, text) => {
    expect(validateFreeText(zone, text, ctx)).toBe(text);
  });

  it.each([
    ['tone', "Aysel Abla'da otopark ücretsiz!"],
    ['tone', '3 dakika uzaklıkta'],
    ['dishNote', 'En lezzetli kibbe burada'],
    ['tone', "Saat 22'ye kadar açık"],
    ['tone', 'a'.repeat(200)],
    ['tone', 'Detaylar için www.ornek.com adresine bak.'],
    ['tone', 'Bak https://ornek.com'],
  ] as const)('rejects %s: "%s"', (zone, text) => {
    expect(validateFreeText(zone, text, ctx)).toBeNull();
  });

  it('applies the length limit of each zone', () => {
    const t90 = 'Merhaba ' + 'a'.repeat(82);
    expect(validateFreeText('tone', t90.slice(0, 90))).not.toBeNull();
    expect(validateFreeText('tone', t90 + 'a')).toBeNull();
    expect(validateFreeText('clarify', 'Hangi semt ' + 'a'.repeat(70))).toBeNull(); // 81 chars
    expect(validateFreeText('dishNote', 'Bir yemektir ' + 'a'.repeat(128))).toBeNull(); // 141
  });

  it('rejects newlines, @, #, digits, more than two sentences and a second emoji', () => {
    expect(validateFreeText('tone', 'Selam\nnasılsın')).toBeNull();
    expect(validateFreeText('tone', 'Selam @arkadas')).toBeNull();
    expect(validateFreeText('tone', 'Harika #yemek')).toBeNull();
    expect(validateFreeText('tone', 'Afiyet olsun 2 kişi')).toBeNull();
    expect(validateFreeText('tone', 'Selam. Nasılsın. İyi misin.')).toBeNull();
    expect(validateFreeText('tone', 'Afiyet olsun 😊')).toBe('Afiyet olsun 😊');
    expect(validateFreeText('tone', 'Afiyet olsun 😊😊')).toBeNull();
  });

  it('rejects non-strings and empty text', () => {
    expect(validateFreeText('tone', null)).toBeNull();
    expect(validateFreeText('tone', undefined)).toBeNull();
    expect(validateFreeText('tone', 42)).toBeNull();
    expect(validateFreeText('tone', '   ')).toBeNull();
  });

  it('rejects a capitalised word in the middle of a sentence', () => {
    expect(validateFreeText('tone', 'Bence Zeytinli güzel')).toBeNull();
    expect(validateFreeText('tone', 'Bu akşam Bornova güzel')).toBeNull();
    // Known regions are fine in the clarify question and the dish note, never in the tone.
    expect(validateFreeText('dishNote', 'Hatay mutfağından bir tatlıdır.')).not.toBeNull();
    expect(validateFreeText('tone', 'Afiyet olsun, Hatay mutfağı güzeldir')).toBeNull();
  });

  it('rejects names from our data: whole multi-word names and a one-word name opening a sentence', () => {
    expect(validateFreeText('tone', 'aysel abla lokantası güzel', ctx)).toBeNull();
    expect(validateFreeText('tone', 'Mado derim', ctx)).toBeNull();
    expect(validateFreeText('tone', 'Mado', ctx)).toBeNull();
  });

  it('allows district names only in the clarify question', () => {
    expect(validateFreeText('clarify', 'Bornova mı Konak mı?', ctx)).toBe('Bornova mı Konak mı?');
    expect(validateFreeText('tone', 'bornova çok güzel', ctx)).toBeNull();
    expect(validateFreeText('dishNote', 'bornova tarafında yapılır', ctx)).toBeNull();
  });

  it('allows park words only in the clarify question', () => {
    expect(validateFreeText('clarify', 'Arabayı nereye bırakmak istersin, otopark mı?')).toBe(
      'Arabayı nereye bırakmak istersin, otopark mı?',
    );
    expect(validateFreeText('tone', 'Önce park edelim')).toBeNull();
    expect(validateFreeText('dishNote', 'Otopark gerektirmeyen bir yemek')).toBeNull();
  });

  it('keeps a dish note about the food, not a place', () => {
    expect(validateFreeText('dishNote', 'Bu restoran bunu iyi yapar')).toBeNull();
    expect(validateFreeText('dishNote', 'Yakında bir mekan bulalım')).toBeNull();
    expect(validateFreeText('dishNote', 'Bu bir yer değil, bir yemektir')).toBeNull();
    expect(validateFreeText('dishNote', 'Yerel bir tatlıdır.')).not.toBeNull();
  });

  it.each([
    'güvenli bir seçim',
    'güvenlik kamerası var',
    'kameralı otopark',
    'bekçisi var',
    'araç yüksekliği uygun',
    'rezervasyon yaptır',
    'ücretsiz bir yer',
    'ucuz ve güzel',
    'romantik bir akşam',
    'manzaralı bir yer',
    'sakin bir köşe',
    'en iyi seçim',
    'kesin beğenirsin',
    'meşhur bir yemek',
    'açıkça söyleyeyim',
    'yorumlar çok iyi',
  ])('rejects the claim "%s"', (text) => {
    expect(validateFreeText('tone', text)).toBeNull();
  });

  it('lists the banned words it checks', () => {
    for (const w of ['ucretsiz', 'acik', 'saat', 'dakika', 'guvenli', 'yuksekl', 'rezervasyon']) {
      expect(BANNED_WORDS).toContain(w);
    }
  });
});

describe('validateFreeText for the off-topic redirect', () => {
  const c = { names: ['Aysel Abla Lokantası', 'Mado'], districts: ['Bornova'] };

  it('accepts a short friendly redirect', () => {
    const t = 'Maçı izleyemedim 😄 Ama aç kalma, ne yemek istersin?';
    expect(validateFreeText('offtopic', t, c)).toBe(t);
  });

  it.each([
    'Mado bunu bilir mi acaba',
    'Bornova tarafında bir şey yiyelim',
    'Skor 3-1 bitti, yemeğe gidelim',
    'Ücretsiz bir yemek bulalım',
    'Otopark bulmakta iyiyim',
    'a'.repeat(121),
  ])('rejects "%s"', (t) => {
    expect(validateFreeText('offtopic', t, c)).toBeNull();
  });

  it('allows up to 120 characters, more than the tone', () => {
    const t = 'Selam ' + 'a'.repeat(110);
    expect(validateFreeText('offtopic', t)).toBe(t);
    expect(validateFreeText('tone', t)).toBeNull();
  });
});

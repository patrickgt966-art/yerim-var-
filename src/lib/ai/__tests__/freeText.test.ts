import { setActiveCity } from '@/data/cities';

import { BANNED_TURKISH_WORDS, BANNED_WORDS, validateFreeText } from '../freeText';

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

  it('rejects a known one-word place name in lowercase inside a sentence', () => {
    expect(validateFreeText('tone', 'Bence mado tercih edilebilir.', ctx)).toBeNull();
    expect(validateFreeText('dishNote', 'Bu tatlı mado için özeldir.', ctx)).toBeNull();
    expect(validateFreeText('tone', 'Afiyet olsun, madem buradasın.', ctx)).not.toBeNull();
  });

  it.each([
    'Detaylar için ornek.xyz adresine bak.',
    'Detaylar için ornek.dev adresine bak.',
    'Bedel ٣₺.',
  ])('rejects URLs and Unicode digits outside the original ASCII/domain allowlist: %s', (text) =>
    expect(validateFreeText('tone', text, ctx)).toBeNull(),
  );

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
    for (const w of ['ucretsiz', 'saat', 'dakika', 'mesafe', 'guvenli', 'yuksekl', 'rezervasyon']) {
      expect(BANNED_WORDS).toContain(w);
    }
    expect(BANNED_TURKISH_WORDS).toEqual(expect.arrayContaining(['açık', 'ünlü']));
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

describe('validateFreeText: chat zone (small talk)', () => {
  it.each([
    'Size de iyi günler! Park yeri mi, yemek mi?',
    'Selam! Ben Yerim, yemek ya da otopark bulurum.',
    'Merhaba! Ben Yerim Var asistanı, yemek ya da otopark bulmana yardım ederim.',
    "Hi! I'm the Yerim Var assistant, I find food and parking.",
    'Rica ederim, ne demek 😄',
    'Görüşürüz! İyi yolculuklar.',
  ])('accepts "%s"', (text) => {
    expect(validateFreeText('chat', text, ctx)).toBe(text);
  });

  it.each([
    'Size de 2 iyi gün!',
    'Yakında ucuz bir yer var.',
    'Bu otopark şu an boş ve ücretsiz.',
    'Konak Otopark güzel bir yer olabilir.',
    "Bornova'da bir şey bulalım.",
    'Selam! Nasılsın? Ne yapıyorsun? Ben iyiyim.',
    'Selam! '.repeat(25),
    'Detay için www.ornek.com adresine bak.',
    'Selam 😄😄',
    '',
  ])('rejects "%s"', (text) => {
    expect(validateFreeText('chat', text, ctx)).toBeNull();
  });

  it('allows parking words in a chat reply but not in the tone', () => {
    const text = 'Park yeri mi arıyoruz?';
    expect(validateFreeText('chat', text, ctx)).toBe(text);
    expect(validateFreeText('tone', text, ctx)).toBeNull();
  });
});

describe('validateFreeText and the city', () => {
  afterEach(() => setActiveCity('izmir'));

  it('lets a clarify question name a district of the active city only', () => {
    expect(validateFreeText('clarify', 'Kadıköy mü Beşiktaş mı?')).toBeNull();
    setActiveCity('istanbul');
    expect(validateFreeText('clarify', 'Kadıköy mü Beşiktaş mı?')).toBe('Kadıköy mü Beşiktaş mı?');
    expect(validateFreeText('clarify', 'Bornova mı Konak mı?')).toBeNull();
  });

  it('keeps the active city district out of a dish note', () => {
    setActiveCity('istanbul');
    expect(validateFreeText('dishNote', 'Kadıköy usulü bir tatlıdır')).toBeNull();
  });

  it('accepts any city name in a clarify question', () => {
    expect(validateFreeText('clarify', 'İstanbul mu İzmir mi?')).toBe('İstanbul mu İzmir mi?');
  });
});

describe('validateFreeText in English', () => {
  it('keeps a plain English line, with "I"', () => {
    expect(validateFreeText('tone', "Sounds good, I think you'll like it")).not.toBeNull();
    expect(validateFreeText('clarify', 'Which part of town are you in?')).not.toBeNull();
  });

  it('drops the same claims as in Turkish', () => {
    for (const s of [
      'It is cheap and close',
      'The best kebab around',
      'Open until late tonight',
      'Plenty of free spaces',
      'A quiet and romantic spot',
      'Great reviews from locals',
    ]) {
      expect(validateFreeText('tone', s)).toBeNull();
    }
    expect(validateFreeText('dishNote', 'This place makes it fresh')).toBeNull();
  });
});

describe('validateFreeText: distance and proximity claims', () => {
  it.each([
    ['tone', 'Kısa bir yürüyüş mesafesinde, afiyet olsun!'],
    ['tone', 'İki adım mesafede güzel bir seçim.'],
    ['tone', 'Yürüyerek gidebilirsin!'],
    ['tone', 'Just a short walk away!'],
    ['tone', 'Good food is near!'],
    ['tone', 'Good food is near'],
    ['tone', 'It is not far'],
    ['tone', 'Give me a min'],
    ['tone', 'Right around the corner!'],
    ['chat', 'Just a short walk away!'],
    ['dishNote', 'Kibbe is a dish you can find at walking distance.'],
  ] as const)('rejects %s: "%s"', (zone, text) => {
    expect(validateFreeText(zone, text, ctx)).toBeNull();
  });

  it('still lets an everyday word through that only starts like one', () => {
    expect(validateFreeText('tone', 'Nearly there, enjoy!')).not.toBeNull();
    expect(validateFreeText('tone', 'Fare enough, enjoy!')).not.toBeNull();
  });
});

describe('validateFreeText: hunger is not "açık"', () => {
  it.each([
    ['tone', 'Acıktıysan hemen güzel bir şey bulalım!'],
    ['chat', 'Acıktın mı? Hadi bir şeyler bulalım!'],
    ['tone', 'Acıkmışsın, hadi bakalım!'],
  ] as const)('accepts %s: "%s"', (zone, text) => {
    expect(validateFreeText(zone, text, ctx)).toBe(text);
  });

  it.each([
    'Bu akşam açık bir yer bulalım!',
    'Açıkçası harika bir seçim.',
    'Burası acik, gel!',
    'Is it acik?',
    'Ünlü bir yer bulalım!',
  ])('still rejects "%s"', (text) => {
    expect(validateFreeText('tone', text, ctx)).toBeNull();
  });
});

describe('validateFreeText: dish notes in English and about foreign cuisines', () => {
  it.each([
    'Kibbe is a Middle Eastern dish made of bulgur and minced meat.',
    'Gyoza are Japanese dumplings filled with meat or vegetables.',
    'Carbonara is an Italian pasta with egg and cheese.',
    'Souvlaki is a Greek dish of grilled meat on a skewer.',
    'Pho is a Vietnamese noodle soup from the Far East.',
    'Ramen, Uzak Doğu mutfağının sevilen erişte çorbalarından biridir.',
    'Ramen, Uzakdoğu mutfağından bir erişte çorbasıdır.',
    'Cağ kebabı, Erzurum mutfağına özgü bir kebaptır.',
    'Pho, Vietnam mutfağından bir erişte çorbasıdır.',
    'Falafel, Lübnan ve Güneydoğu mutfaklarında da sevilen bir yemektir.',
    'Boyoz, Ege mutfağında önemli bir yeri olan yağlı bir hamur işidir.',
    'Pişi, mayalı hamurdan kızartılarak yapılan unlu bir kahvaltılıktır.',
    'Gözleme, peynir ve/veya ıspanakla yapılan bir hamur işidir.',
  ])('accepts "%s"', (text) => {
    expect(validateFreeText('dishNote', text, ctx)).toBe(text);
  });

  it.each([
    'Kibbe is a Middle Eastern dish, best eaten here.',
    'Uzak bir yerde yapılan bir yemektir.',
    'Boyoz, bu yerde yapılan bir hamur işidir.',
    'Pho is a Vietnamese soup from a famous place nearby.',
    'Pho, Bornova tarafında yapılan bir çorbadır.',
    'Detaylar için site/sayfa/pho adresine bak.',
    'Pho is served at Mado on weekends.',
  ])('still rejects "%s"', (text) => {
    expect(validateFreeText('dishNote', text, ctx)).toBeNull();
  });

  it('keeps foreign region names out of the tone', () => {
    expect(validateFreeText('tone', 'Bir Uzak Doğu akşamı, afiyet olsun!')).toBeNull();
    expect(validateFreeText('tone', 'Uzakta değil, afiyet olsun!')).toBeNull();
  });
});

describe('validateFreeText: polite phrases are not claims', () => {
  it.each([
    ['chat', 'Safe travels, come back when you are hungry!'],
    ['chat', "Feel free to tell me what you're craving!"],
    ['chat', 'All the best, see you soon!'],
    ['chat', 'Kesinlikle, ne arıyorsunuz?'],
    ['tone', 'Gluten-free it is!'],
    ['tone', 'Best wishes on your anniversary!'],
  ] as const)('accepts %s: "%s"', (zone, text) => {
    expect(validateFreeText(zone, text, ctx)).toBe(text);
  });

  it.each([
    'Parking is free there.',
    'A safe spot for your car.',
    'The best kebab around.',
    'Kesin beğenirsin, en iyisi!',
    'Kesin yer var!',
  ])('still rejects "%s"', (text) => {
    expect(validateFreeText('chat', text, ctx)).toBeNull();
  });
});

describe('validateFreeText: words that are also district names', () => {
  afterEach(() => setActiveCity('izmir'));

  it('reads "kas" (muscle) as a word, not the district Kaş, in a text with accents', () => {
    setActiveCity('antalya');
    const t = 'Kas yapmak için güzel bir hedef, protein bulalım!';
    expect(validateFreeText('tone', t)).toBe(t);
    expect(validateFreeText('tone', "Kaş'ta güzel bir akşam!")).toBeNull();
    expect(validateFreeText('tone', 'Off to Kas tonight!')).toBeNull();
  });

  it('lets a dish named after a district through, not the district itself', () => {
    expect(validateFreeText('tone', 'Menemen ile güne başlamak gibisi yok!')).not.toBeNull();
    expect(
      validateFreeText('dishNote', 'Menemen, domates, biber ve yumurtayla yapılır.'),
    ).not.toBeNull();
    expect(
      validateFreeText('dishNote', 'Kemalpaşa tatlısı, peynirli bir şerbetli tatlıdır.'),
    ).not.toBeNull();
    expect(validateFreeText('tone', "Menemen'de bir şey bulalım!")).toBeNull();
    setActiveCity('bursa');
    expect(
      validateFreeText('dishNote', 'İnegöl köftesi, kıymadan yapılan bir köftedir.'),
    ).not.toBeNull();
    expect(validateFreeText('dishNote', "İnegöl'de yapılan bir köftedir.")).toBeNull();
  });
});

import type { AiReplyFacts, AiReplyKind } from '../protocol';
import { MAX_REPLY_TEXT_CHARS, validateReply } from '../replyCheck';

const food: AiReplyFacts = {
  where: 'Alsancak',
  what: 'balık restoranı',
  count: 12,
  items: [
    { name: 'Mavi Balık Restoranı', walkMin: 3, openNow: true },
    { name: 'Kordon Meyhanesi', walkMin: 5 },
    { name: 'Yıldız Pide', walkMin: 7 },
  ],
  daypart: 'evening',
};
const foodWithPark: AiReplyFacts = {
  ...food,
  requireParking: true,
  items: [{ name: 'Mavi Balık Restoranı', walkMin: 3, parkWalkMin: 2, freeSpots: 14, free: true }],
};
const park: AiReplyFacts = {
  where: 'Konak',
  count: 4,
  parkSearch: true,
  items: [{ name: 'Kemeraltı Otoparkı', walkMin: 4, freeSpots: 22 }],
};
const noCounts: AiReplyFacts = {
  where: 'Konak',
  count: 4,
  parkSearch: true,
  items: [{ name: 'Kemeraltı Otoparkı', walkMin: 4 }],
};
const allow = ['İzmir', 'Alsancak', 'Konak'];

type Case = [string, string, AiReplyFacts, string | null, { kind?: AiReplyKind }?];
const cases: Case[] = [
  // OK
  ['plain', "Alsancak'ta balık için 12 yer buldum.", food, "Alsancak'ta balık için 12 yer buldum."],
  [
    'two sentences',
    'Akşam için güzel bir seçim. Mavi Balık Restoranı 3 dakika yürüme mesafesinde.',
    food,
    'Akşam için güzel bir seçim. Mavi Balık Restoranı 3 dakika yürüme mesafesinde.',
  ],
  [
    'name with a suffix',
    "En yakın olanı Mavi Balık Restoranı'nın önü, 3 dk.",
    food,
    "En yakın olanı Mavi Balık Restoranı'nın önü, 3 dk.",
  ],
  [
    'Turkish number word in the facts',
    'Üç dakikalık yürüyüşle Mavi Balık Restoranı var.',
    food,
    'Üç dakikalık yürüyüşle Mavi Balık Restoranı var.',
  ],
  ['bir as an article', 'Akşam için güzel bir yer var.', food, 'Akşam için güzel bir yer var.'],
  [
    'English number word',
    'Mavi Balık Restoranı is three minutes away.',
    food,
    'Mavi Balık Restoranı is three minutes away.',
  ],
  ['name by a partial match', 'Kordon Meyhanesi de yakın.', food, 'Kordon Meyhanesi de yakın.'],
  [
    'a rating word that is part of a name',
    'Yıldız Pide 7 dakika uzaklıkta.',
    food,
    'Yıldız Pide 7 dakika uzaklıkta.',
  ],
  [
    'a district from the allow-list',
    "İzmir'de akşam yemeği için Alsancak iyi.",
    food,
    "İzmir'de akşam yemeği için Alsancak iyi.",
  ],
  [
    'parking words with parking facts',
    'Mavi Balık Restoranı için otopark 2 dakika, 14 boş yer var.',
    foodWithPark,
    'Mavi Balık Restoranı için otopark 2 dakika, 14 boş yer var.',
  ],
  [
    'free with a free fact',
    'Otopark ücretsiz, 14 boş yer var.',
    foodWithPark,
    'Otopark ücretsiz, 14 boş yer var.',
  ],
  [
    'parking talk on a parking search',
    'Konak civarında 4 otopark buldum, en yakını 4 dakika.',
    park,
    'Konak civarında 4 otopark buldum, en yakını 4 dakika.',
  ],
  [
    'greeting that asks parking or food',
    'Selam! Otopark mu yemek mi bakıyorsun?',
    {},
    'Selam! Otopark mu yemek mi bakıyorsun?',
    { kind: 'greeting' },
  ],
  [
    'one emoji after two sentences',
    'Selam! Ne bakıyorsun? 😊',
    {},
    'Selam! Ne bakıyorsun? 😊',
    { kind: 'greeting' },
  ],
  [
    'whitespace and newlines are folded',
    '  Alsancak için\n12 yer var.  ',
    food,
    'Alsancak için 12 yer var.',
  ],
  [
    'the app name',
    'Yerim burada, Alsancak için 12 yer var.',
    food,
    'Yerim burada, Alsancak için 12 yer var.',
  ],
  // Not OK
  ['an invented name', 'Deniz Yıldızı Restoran Alsancak’ta harika.', food, null],
  ['an invented name mid-sentence', "Bence Sahil Lokantası'na uğra.", food, null],
  ['a wrong count', "Alsancak'ta 15 yer buldum.", food, null],
  ['a wrong walking time', 'Mavi Balık Restoranı 9 dakika uzakta.', food, null],
  ['a wrong number word', 'Beş dakikada Mavi Balık Restoranı var.', foodWithPark, null],
  ['an English number word that is no fact', 'It is two minutes away.', food, null],
  ['bir dakika when 1 is not a fact', 'Bir dakikada gidersin.', food, null],
  ['a price in lira sign', 'Balık 250₺ civarı.', food, null],
  ['TL', 'Balık için 250 TL yeter.', food, null],
  ['price words', 'Fiyatlar makul görünüyor.', food, null],
  ['cheap', 'Ucuz ve güzel bir yer.', food, null],
  ['a rating word', 'Mavi Balık Restoranı 4 yıldızlı bir yer.', food, null],
  ['puan', 'Puanı yüksek bir yer.', food, null],
  [
    'parking words without parking facts',
    'Alsancak’ta 12 yer var, otopark da bulunur.',
    food,
    null,
  ],
  ['park as a word start', 'Arabanı parka bırakıp yürüyebilirsin.', food, null],
  [
    'parking in English without parking facts',
    'Plenty of places, and parking is easy.',
    food,
    null,
  ],
  [
    'free without a free fact',
    'Otopark ücretsiz.',
    { ...foodWithPark, items: [{ name: 'A', walkMin: 3, parkWalkMin: 2 }] },
    null,
  ],
  // Room claims need a live free count; the menu is not on the cards.
  [
    'room claim, no live count (22 otopark)',
    "Konak'ta şu an boş yeri olan 4 otopark buldum.",
    noCounts,
    null,
  ],
  [
    'room claim, no live count (bir otopark)',
    "Konak'ta boş yeri olan bir otopark buldum.",
    noCounts,
    null,
  ],
  [
    'room claim, no live count (kartlar)',
    'Kartlarda şu an boş yer sayılarına bakabilirsin.',
    noCounts,
    null,
  ],
  ['müsait without a live count', 'Konak’ta müsait otoparklar var.', noCounts, null],
  ['boş yer var without a live count', 'Kemeraltı Otoparkı’nda boş yer var.', noCounts, null],
  [
    'room claim with a live count',
    "Konak'ta boş yeri olan 4 otopark buldum.",
    park,
    "Konak'ta boş yeri olan 4 otopark buldum.",
  ],
  [
    'a negated room statement',
    "Konak'ta 4 otopark buldum, boş yer bilgisi elimde yok.",
    noCounts,
    "Konak'ta 4 otopark buldum, boş yer bilgisi elimde yok.",
  ],
  ['menus from the cards', 'Kartlardan menülere bakıp seçebilirsin.', food, null],
  ['menu from the cards, reversed', 'Menüye kartlardan bak.', food, null],
  [
    'not found next to shown results',
    'Kumpir için şu an uygun bir aday bulamadık, başka bir istekle tekrar deneyebilirsin.',
    food,
    null,
  ],
  ['could not find next to shown results', "I couldn't find anything for that.", food, null],
  [
    'not found with nothing shown',
    'Bu aramada bir şey bulamadım.',
    { where: 'Alsancak', what: 'balık', count: 0 },
    'Bu aramada bir şey bulamadım.',
    { kind: 'none_found' },
  ],
  ['a link', 'Detaylar için www.ornek.com adresine bak.', food, null],
  ['a handle', 'Bize @yerimvar yaz.', food, null],
  ['three sentences', 'Selam. Alsancak güzel. 12 yer var.', food, null],
  ['too long', `Alsancak ${'güzel '.repeat(60)}12 yer.`, food, null],
  ['empty', '   ', food, null],
];

describe('validateReply', () => {
  for (const [name, text, facts, expected, opts] of cases) {
    it(name, () => {
      expect(validateReply(text, facts, { allow, ...opts })).toBe(expected);
    });
  }

  it('keeps the limit at 260 characters', () => {
    const ok = 'a'.repeat(MAX_REPLY_TEXT_CHARS - 1) + '.';
    expect(validateReply(ok, food, { allow })).toBe(ok);
    expect(validateReply(ok + 'a', food, { allow })).toBeNull();
  });

  it('is not a string: null', () => {
    expect(validateReply(undefined, food)).toBeNull();
    expect(validateReply(null, food)).toBeNull();
  });
});

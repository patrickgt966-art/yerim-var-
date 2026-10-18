import { createInstance } from 'i18next';

import { cityExamples, setActiveCity } from '@/data/cities';
import { understandSystem } from '@/lib/ai/protocol';
import { suggestions } from '@/components/chat/model';
import type { ChatContext } from '@/data/assistant';

import tr from '../tr';
import { quartersOf } from '@/data/quarters';

const IZMIR_PLACES = [
  'Kordon',
  'Karşıyaka',
  'Buca',
  'Bostanlı',
  'Göztepe',
  'Fuar',
  'İZBAN',
  'Alsancak',
  'Konak',
  'Bornova',
];

const EXAMPLE_KEYS = [
  'chat.sugElsewhere_0',
  'chat.sugElsewhere_1',
  'chat.hello_1',
  'chat.convoHowTo',
  'chat.unknown_1',
  'chat.exAlsancak',
  'chat.exKonak',
  'chat.exBreakfast',
  'chat.exFish',
  'ara.example2',
  'ara.example3',
  'home.example1',
  'home.example2',
  'home.example3',
];

const i18n = createInstance();
void i18n.init({
  resources: { tr: { translation: tr } },
  lng: 'tr',
  interpolation: { escapeValue: false },
});

const resolve = (key: string) => i18n.t(key, cityExamples());

const leaves = (o: unknown, path = ''): string[] =>
  typeof o === 'string'
    ? [path]
    : Object.entries(o as Record<string, unknown>).flatMap(([k, v]) =>
        leaves(v, path ? `${path}.${k}` : k),
      );

afterEach(() => setActiveCity('izmir'));

describe('city example texts', () => {
  it('knows every key it checks', () => {
    for (const key of EXAMPLE_KEYS) expect(i18n.exists(key)).toBe(true);
  });

  it('keeps the İzmir texts as they were', () => {
    setActiveCity('izmir');
    expect(EXAMPLE_KEYS.map(resolve)).toEqual([
      "bir de Karşıyaka'da bak",
      "bir de Bornova'da bak",
      'Selam! Yer adı ya da "Bornova\'da köfteci" gibi yazabilirsin.',
      'Şöyle çalışıyorum: gideceğin yeri yaz ("Alsancak otopark") ya da canın ne çekiyorsa ("Bornova\'da köfteci"). Ben de yakındaki otoparkları ve restoranları listelerim.',
      'Anlayamadım. "Konak otopark" ya da "yakınımda balıkçı" gibi yazabilirsin.',
      'Alsancak otopark',
      'Konak',
      'Alsancak kahvaltı',
      'Bornova balık',
      "Konak'ta ücretsiz otopark",
      'köfte değil balık, Karşıyaka',
      "Bornova'da kuşbaşı",
      "Konak'ta ücretsiz otopark",
      'Alsancak kahvaltı',
    ]);
  });

  it('names the İstanbul places while İstanbul is active', () => {
    setActiveCity('istanbul');
    expect(EXAMPLE_KEYS.map(resolve)).toEqual([
      "bir de Üsküdar'da bak",
      "bir de Taksim'de bak",
      'Selam! Yer adı ya da "Taksim\'de köfteci" gibi yazabilirsin.',
      'Şöyle çalışıyorum: gideceğin yeri yaz ("Kadıköy otopark") ya da canın ne çekiyorsa ("Taksim\'de köfteci"). Ben de yakındaki otoparkları ve restoranları listelerim.',
      'Anlayamadım. "Beşiktaş otopark" ya da "yakınımda balıkçı" gibi yazabilirsin.',
      'Kadıköy otopark',
      'Beşiktaş',
      'Kadıköy kahvaltı',
      'Taksim balık',
      "Beşiktaş'ta ücretsiz otopark",
      'köfte değil balık, Üsküdar',
      "Taksim'de kuşbaşı",
      "Beşiktaş'ta ücretsiz otopark",
      'Kadıköy kahvaltı',
    ]);
  });

  it('names the Ankara places while Ankara is active', () => {
    setActiveCity('ankara');
    const out = EXAMPLE_KEYS.map(resolve);
    expect(cityExamples()).toMatchObject({ a: 'Kızılay', b: 'Çankaya', c: 'Tunalı' });
    expect(out).toContain("bir de Bahçelievler'de bak");
    expect(out).toContain('Selam! Yer adı ya da "Tunalı\'da köfteci" gibi yazabilirsin.');
  });

  it('names the Antalya places while Antalya is active', () => {
    setActiveCity('antalya');
    const out = EXAMPLE_KEYS.map(resolve);
    expect(cityExamples()).toMatchObject({ a: 'Konyaaltı', b: 'Lara', c: 'Kaleiçi' });
    expect(out).toContain("bir de Muratpaşa'da bak");
    expect(out).toContain('Selam! Yer adı ya da "Kaleiçi\'nde köfteci" gibi yazabilirsin.');
  });

  it('has no İzmir place name in any text, chat suggestion or prompt with Antalya active', () => {
    setActiveCity('antalya');
    const ctx = { sort: 'distance', freeParking: true, place: null } as unknown as ChatContext;
    const texts = [
      ...leaves(tr).map(resolve),
      ...suggestions(ctx, (k, o) => i18n.t(k, o)),
      understandSystem('antalya'),
    ];
    for (const text of texts) {
      for (const place of IZMIR_PLACES) expect(text).not.toContain(place);
    }
  });

  it('names the Bursa places while Bursa is active', () => {
    setActiveCity('bursa');
    const out = EXAMPLE_KEYS.map(resolve);
    expect(cityExamples()).toMatchObject({ a: 'Nilüfer', b: 'Osmangazi', c: 'Mudanya' });
    expect(out).toContain("bir de Görükle'de bak");
    expect(out).toContain('Selam! Yer adı ya da "Mudanya\'da köfteci" gibi yazabilirsin.');
  });

  it('has no İzmir place name in any text, chat suggestion or prompt with Bursa active', () => {
    setActiveCity('bursa');
    const ctx = { sort: 'distance', freeParking: true, place: null } as unknown as ChatContext;
    const texts = [
      ...leaves(tr).map(resolve),
      ...suggestions(ctx, (k, o) => i18n.t(k, o)),
      understandSystem('bursa'),
    ];
    for (const text of texts) {
      for (const place of IZMIR_PLACES) expect(text).not.toContain(place);
    }
  });

  it('has no İzmir place name in any text, chat suggestion or prompt with Ankara active', () => {
    setActiveCity('ankara');
    const ctx = { sort: 'distance', freeParking: true, place: null } as unknown as ChatContext;
    const texts = [
      ...leaves(tr).map(resolve),
      ...suggestions(ctx, (k, o) => i18n.t(k, o)),
      understandSystem('ankara'),
    ];
    for (const text of texts) {
      for (const place of IZMIR_PLACES) expect(text).not.toContain(place);
    }
  });

  it('has no İzmir place name in any text with İstanbul active', () => {
    setActiveCity('istanbul');
    const texts = leaves(tr).map(resolve);
    expect(texts.length).toBeGreaterThan(500);
    for (const text of texts) {
      for (const place of IZMIR_PLACES) expect(text).not.toContain(place);
    }
  });

  it('has none in the chat suggestions or the router prompt either', () => {
    setActiveCity('istanbul');
    const ctx = { sort: 'distance', freeParking: true, place: null } as unknown as ChatContext;
    const out = [...suggestions(ctx, (k, o) => i18n.t(k, o)), understandSystem('istanbul')];
    // A name both cities have (İstanbul's Göztepe) is İstanbul's own in its quarter list.
    const own = new Set(quartersOf('istanbul').map((q) => q.n));
    for (const text of out) {
      for (const place of IZMIR_PLACES.filter((p) => !own.has(p)))
        expect(text).not.toContain(place);
    }
  });

  it('suggests another district when the user is already in the one it would name', () => {
    setActiveCity('istanbul');
    const ctx = {
      sort: 'distance',
      freeParking: true,
      place: { label: 'Üsküdar' },
    } as unknown as ChatContext;
    expect(suggestions(ctx, (k, o) => i18n.t(k, o))).toContain("bir de Taksim'de bak");
  });
});

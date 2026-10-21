import i18n from 'i18next';

import { activeCity, cityExamples } from '@/data/cities';
import { fold } from '@/data/search';
import tr from '@/i18n/tr';

/**
 * Ready-made phrases the app itself offers as taps: example questions (home, search, chat),
 * craving tiles and follow-up suggestions. The rule-based assistant reads Turkish, so in another UI language a
 * tapped phrase is sent to it as the Turkish twin of the same key; the user still sees the
 * phrase they tapped.
 */
const PHRASE_KEYS: readonly string[] = [
  'chat.exAlsancak',
  'chat.exKonak',
  'chat.exNear',
  'chat.greetPark',
  'chat.greetFood',
  'chat.exStadium',
  'chat.exKofte',
  'chat.exBreakfast',
  'chat.exFish',
  'chat.sugNearer',
  'chat.sugFreePark',
  'chat.sugOther',
  'chat.parkAskYes',
  'chat.parkAskNo',
  'chat.sugElsewhere_0',
  'chat.sugElsewhere_1',
  'chat.clarifyNear',
  'home.example1',
  'home.example2',
  'home.example3',
  'ara.example1',
  'ara.example2',
  'ara.example3',
  'ara.example4',
  // The home's craving tiles and the "what kind of food?" answer chips.
  ...Object.keys(tr.home.cravings).map((k) => `home.cravings.${k}`),
  ...Object.keys(tr.food.cats).map((k) => `food.cats.${k}`),
];

const norm = (s: string) =>
  fold(s)
    .replace(/[?!.,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * The text to hand the assistant for a message: unchanged in Turkish or when it is not one of
 * the app's own phrases, else the Turkish phrase with the same meaning and the same places.
 */
export function ruleQuery(text: string): string {
  if (i18n.language === 'tr') return text;
  const opts = { ...cityExamples(), city: activeCity().name };
  const wanted = norm(text);
  if (!wanted) return text;
  // eslint-disable-next-line import/no-named-as-default-member
  const toTurkish = i18n.getFixedT('tr');
  for (const key of PHRASE_KEYS) {
    // eslint-disable-next-line import/no-named-as-default-member
    if (norm(i18n.t(key, opts)) === wanted) return toTurkish(key, opts);
  }
  return text;
}

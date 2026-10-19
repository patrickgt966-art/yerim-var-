// Cases for the reply section of the live AI eval (scripts/ai-eval.ts): the facts of a turn as the
// app builds them, and what the user wrote. The model writes the wording; the eval counts how many
// of its texts validateReply (src/lib/ai/replyCheck.ts) accepts, so the pass-rate says how often
// the app would show the AI's words and how often it would fall back to its template.
import type { AiReplyFacts, AiReplyKind } from '@/lib/ai/protocol';

export type ReplyCase = {
  name: string;
  kind: AiReplyKind;
  userText: string;
  facts: AiReplyFacts;
};

export const REPLY_CASES: ReplyCase[] = [
  { name: 'greeting: selam', kind: 'greeting', userText: 'Selam', facts: { daypart: 'noon' } },
  {
    name: 'greeting: naber',
    kind: 'greeting',
    userText: 'naber kanka',
    facts: { daypart: 'evening' },
  },
  {
    name: 'greeting: english',
    kind: 'greeting',
    userText: 'Hi there',
    facts: { daypart: 'morning' },
  },
  {
    name: 'food: fish at Alsancak',
    kind: 'food',
    userText: 'Alsancak balık',
    facts: {
      where: 'Alsancak',
      what: 'balık restoranı',
      count: 14,
      items: [
        { name: 'Kordon Balıkçısı', walkMin: 3, openNow: true },
        { name: 'Deniz Yıldızı', walkMin: 5 },
        { name: 'Liman Meyhanesi', walkMin: 6 },
      ],
      daypart: 'evening',
    },
  },
  {
    name: 'food: dish only found by name',
    kind: 'food',
    userText: 'kumpir',
    facts: {
      where: 'Konumun',
      what: 'kumpir',
      count: 4,
      dishByNameOnly: true,
      items: [{ name: 'Kumpir Durağı', walkMin: 8 }],
      daypart: 'noon',
    },
  },
  {
    name: 'food: a wider search',
    kind: 'food',
    userText: 'Urla çiğ köfte',
    facts: {
      where: 'Urla',
      what: 'çiğ köfte',
      count: 3,
      widened: true,
      items: [
        { name: 'Çiğköftem', walkMin: 12 },
        { name: 'Urla Çiğ Köfte', walkMin: 14 },
      ],
      daypart: 'night',
    },
  },
  {
    name: 'food: parking asked for',
    kind: 'food',
    userText: 'Bornova otoparklı kebap',
    facts: {
      where: 'Bornova',
      what: 'kebapçı',
      count: 6,
      requireParking: true,
      items: [
        { name: 'Ocakbaşı Hasan', walkMin: 2, parkWalkMin: 1, freeSpots: 12, free: true },
        { name: 'Nalbant Kebap', walkMin: 4, parkWalkMin: 3 },
      ],
      daypart: 'evening',
    },
  },
  {
    name: 'park: Konak',
    kind: 'park',
    userText: 'Konak otopark',
    facts: {
      where: 'Konak',
      count: 9,
      parkSearch: true,
      items: [
        { name: 'Kemeraltı Otoparkı', walkMin: 3, freeSpots: 40 },
        { name: 'Konak Pier Otopark', walkMin: 5, free: true },
      ],
      daypart: 'noon',
    },
  },
  {
    name: 'name: a restaurant by name',
    kind: 'name',
    userText: 'Köfteci Yusuf',
    facts: {
      what: 'Köfteci Yusuf',
      count: 3,
      items: [
        { name: 'Köfteci Yusuf', walkMin: 6 },
        { name: 'Köfteci Yusuf Karşıyaka', walkMin: 22 },
      ],
    },
  },
  {
    name: 'choice question: protein',
    kind: 'choice_question',
    userText: 'kaslıyım bana yer bul',
    facts: { where: 'Konumun', choices: ['Balık', 'Et', 'Tavuk', 'Hepsi'] },
  },
  {
    name: 'none found: food',
    kind: 'none_found',
    userText: 'Karaburun suşi',
    facts: { where: 'Karaburun', what: 'suşi', count: 0 },
  },
  {
    name: 'none found: parking',
    kind: 'none_found',
    userText: 'Foça ücretsiz otopark',
    facts: { where: 'Foça', count: 0, parkSearch: true, freeOnly: true },
  },
];

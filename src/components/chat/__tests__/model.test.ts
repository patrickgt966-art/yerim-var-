import '@/i18n';
import i18n from 'i18next';

import type { ChatCard } from '@/data/assistant';

import { cardModel, formatDistance } from '../model';

/* eslint-disable import/no-named-as-default-member */
const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, o) as string;

const parking: ChatCard = {
  kind: 'parking',
  id: 'p1',
  name: 'Otopark',
  distanceM: 1234,
  free: 18,
  capacity: 100,
  open: 'open',
};
const restaurant = {
  kind: 'restaurant',
  id: 'r1',
  name: 'Köfteci',
  distanceM: 300,
  parkingM: 120,
  narr: { parkingFree: 24, parkingPaid: true },
  parkAsked: true,
} as unknown as ChatCard;
// The same card of a food ask that did not include parking.
const foodOnly = { ...restaurant, parkAsked: undefined } as unknown as ChatCard;

afterEach(async () => {
  await i18n.changeLanguage('tr');
});

describe('chat card distances', () => {
  it('use a decimal comma in Turkish and a point in English', async () => {
    await i18n.changeLanguage('tr');
    expect(formatDistance(1234, t)).toBe('1,2 km');
    await i18n.changeLanguage('en');
    expect(formatDistance(1234, t)).toBe('1.2 km');
  });
});

describe('chat food card without a parking ask', () => {
  it('is about food: no car park line, no easy-parking badge, none in the spoken label', () => {
    const m = cardModel(foodOnly, 0, undefined, t);
    expect(m.pill).toBeNull();
    expect(m.pillMark).toBe(false);
    expect(m.badge).toBeNull();
    expect(m.label).not.toMatch(/otopark|24|120/i);
  });
});

describe('chat card counts', () => {
  it('show the free count while the reply is fresh', () => {
    expect(cardModel(parking, 0, undefined, t).pill).toContain('18');
    const m = cardModel(restaurant, 0, undefined, t);
    expect(m.pill).toContain('24');
    expect(m.badge).toBe('easy');
  });

  it('drop counts and the easy-parking badge once the reply is old', () => {
    expect(cardModel(parking, 0, undefined, t, true).pill).not.toContain('18');
    const m = cardModel(restaurant, 0, undefined, t, true);
    expect(m.pill).not.toContain('24');
    expect(m.badge).toBeNull();
  });
});

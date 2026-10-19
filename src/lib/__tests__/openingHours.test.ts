import '@/i18n';

import { getFixedT } from 'i18next';

import { formatOpeningHours } from '../openingHours';

const tr = getFixedT('tr');
const en = getFixedT('en');
const fmt = (raw: string) => formatOpeningHours(raw, (k) => tr(k));
const fmtEn = (raw: string) => formatOpeningHours(raw, (k) => en(k));

describe('formatOpeningHours', () => {
  it('names the days in Turkish', () => {
    expect(fmt('Mo 10:00-12:00')).toEqual(['Pzt 10:00–12:00']);
    expect(fmt('Tu,We,Th 10:00-12:00')).toEqual(['Sal, Çar, Per 10:00–12:00']);
    expect(fmt('Fr 10:00-12:00')).toEqual(['Cum 10:00–12:00']);
    expect(fmt('Sa 10:00-12:00')).toEqual(['Cmt 10:00–12:00']);
    expect(fmt('Su 10:00-12:00')).toEqual(['Paz 10:00–12:00']);
  });

  it('writes a day range with an en dash', () => {
    expect(fmt('Mo-Fr 09:00-18:00')).toEqual(['Pzt–Cum 09:00–18:00']);
    expect(fmt('Mo-Su 10:00-22:00')).toEqual(['Pzt–Paz 10:00–22:00']);
  });

  it('reads 24/7', () => {
    expect(fmt('24/7')).toEqual(['7/24 açık']);
  });

  it('reads off and closed', () => {
    expect(fmt('Su off')).toEqual(['Paz kapalı']);
    expect(fmt('Su closed')).toEqual(['Paz kapalı']);
    expect(fmt('off')).toEqual(['kapalı']);
  });

  it('puts every ";" rule on its own line', () => {
    expect(fmt('Mo-Fr 09:00-18:00; Sa 10:00-14:00; Su off')).toEqual([
      'Pzt–Cum 09:00–18:00',
      'Cmt 10:00–14:00',
      'Paz kapalı',
    ]);
    expect(fmt('Mo-Fr 09:00-18:00;')).toEqual(['Pzt–Cum 09:00–18:00']);
  });

  it('joins several time ranges with a comma', () => {
    expect(fmt('Mo-Sa 09:00-14:00,17:00-23:00')).toEqual(['Pzt–Cmt 09:00–14:00, 17:00–23:00']);
  });

  it('reads PH as public holidays', () => {
    expect(fmt('Mo-Fr 09:00-18:00; PH off')).toEqual([
      'Pzt–Cum 09:00–18:00',
      'Resmî tatiller kapalı',
    ]);
    expect(fmt('Sa,Su,PH 10:00-16:00')).toEqual(['Cmt, Paz, Resmî tatiller 10:00–16:00']);
  });

  it('keeps times without a day and pads the hour', () => {
    expect(fmt('9:00-22:00')).toEqual(['09:00–22:00']);
    expect(fmt('Mo-Su 00:00-24:00')).toEqual(['Pzt–Paz 00:00–24:00']);
  });

  it('has English day names and words', () => {
    expect(fmtEn('Mo-Fr 09:00-18:00; Sa 10:00-14:00; Su off; PH off')).toEqual([
      'Mon–Fri 09:00–18:00',
      'Sat 10:00–14:00',
      'Sun closed',
      'Public holidays closed',
    ]);
    expect(fmtEn('24/7')).toEqual(['Open 24/7']);
  });

  it.each([
    'sunrise-sunset',
    'Mo-Fr 09:00-18:00; Sa sunrise-sunset',
    'Mo-Fr 09:00-18:00, Sa 10:00-14:00',
    'Mo-Fr 25:00-26:00',
    'Mo-Fr 09:00-18:99',
    'Mon-Fri 09:00-18:00',
    'Mo-Fr 09:00-18:00 "by appointment"',
    'Mo-Su 24/7',
    'week 1-10 Mo 09:00-12:00',
    'Pazartesi 09:00-18:00',
  ])('returns the raw text unchanged when it cannot read all of %p', (raw) => {
    expect(fmt(raw)).toEqual([raw]);
  });

  it('has nothing to show for an empty value', () => {
    expect(fmt('')).toEqual([]);
    expect(fmt('  ')).toEqual([]);
  });
});

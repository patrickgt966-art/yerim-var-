import { openState } from '../openNow';

// Formats taken from data/parkings-static.json.
const text = (openingHoursText: string) => ({ openingHoursText });
// 2026-10-07 is a Wednesday, 2026-10-11 a Sunday (local time).
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m);

describe('openState', () => {
  it('live isOpen wins over everything', () => {
    expect(openState({ isOpen: false, nonstop: true }, at(7, 12))).toBe('closed');
    expect(openState({ isOpen: true, openingHoursText: '07:00–08:00' }, at(7, 12))).toBe('open');
  });

  it('nonstop is open', () => {
    expect(openState({ isOpen: null, nonstop: true }, at(7, 3))).toBe('open');
  });

  it('reads the uniform HH:MM–HH:MM text', () => {
    expect(openState(text('07:00–21:00'), at(7, 12))).toBe('open');
    expect(openState(text('07:00–21:00'), at(7, 21))).toBe('closed');
    expect(openState(text('06:30–16:00'), at(7, 6, 29))).toBe('closed');
    expect(openState(text('06:30–16:00'), at(7, 6, 30))).toBe('open');
    expect(openState(text('08:00-22:00'), at(7, 9))).toBe('open');
  });

  it('handles overnight ranges', () => {
    expect(openState(text('22:00–02:00'), at(7, 23))).toBe('open');
    expect(openState(text('22:00–02:00'), at(7, 1))).toBe('open');
    expect(openState(text('22:00–02:00'), at(7, 12))).toBe('closed');
  });

  it('reads "Pazar Günleri Kapalı"', () => {
    const t = text('07:00–20:00, Pazar Günleri Kapalı');
    expect(openState(t, at(11, 12))).toBe('closed');
    expect(openState(t, at(7, 12))).toBe('open');
  });

  it('uses the per-day table', () => {
    const openingHours = { wednesday: '08:00-18:00' };
    expect(openState({ openingHours }, at(7, 9))).toBe('open');
    expect(openState({ openingHours }, at(7, 19))).toBe('closed');
  });

  it('is unknown for anything else', () => {
    expect(openState(text('Abone Otoparkı'), at(7, 12))).toBe('unknown');
    expect(openState(text('Mo-Fr 08:00-18:00'), at(7, 12))).toBe('unknown');
    expect(openState({}, at(7, 12))).toBe('unknown');
    expect(openState({ openingHoursText: null }, at(7, 12))).toBe('unknown');
  });
});

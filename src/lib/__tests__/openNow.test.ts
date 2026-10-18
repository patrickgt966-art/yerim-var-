import { closesLate, openState } from '../openNow';

// Formats taken from data/parkings-static.json.
const text = (openingHoursText: string) => ({ openingHoursText });
// 2026-10-07 is a Wednesday, 2026-10-11 a Sunday; h:m is Turkey time (UTC+3).
const at = (day: number, h: number, m = 0) => new Date(Date.UTC(2026, 9, day, h - 3, m));

describe('openState', () => {
  it('uses Turkey time whatever the device zone is', () => {
    // 22:30 UTC Saturday is 01:30 Sunday in Turkey.
    const t = text('07:00–20:00, Pazar Günleri Kapalı');
    expect(openState(t, new Date('2026-10-10T22:30:00Z'))).toBe('closed');
    // 05:00 UTC is 08:00 in Turkey: open.
    expect(openState(text('07:00–21:00'), new Date('2026-10-07T05:00:00Z'))).toBe('open');
    expect(openState(text('07:00–21:00'), new Date('2026-10-07T03:59:00Z'))).toBe('closed');
  });

  it('live isOpen wins over everything', () => {
    expect(openState({ isOpen: false, nonstop: true }, at(7, 12))).toBe('closed');
    expect(openState({ isOpen: true, openingHoursText: '07:00–08:00' }, at(7, 12))).toBe('open');
  });

  it('trusts a cached isOpen only as long as a free count (15 min)', () => {
    const fetchedAt = at(6, 23, 30).toISOString(); // closed at 23:30 (hours 08:00-23:00)
    const cached = { isOpen: false, openingHoursText: '08:00-23:00', fetchedAt, updatedAt: null };
    expect(openState(cached, at(6, 23, 40))).toBe('closed');
    // The next noon, from the cache: the hours decide, not the old flag.
    expect(openState(cached, at(7, 12))).toBe('open');
    // Open at 22:00, still shown at 02:00 from the cache: the hours say closed.
    const late = { isOpen: true, openingHoursText: '08:00-23:00', fetchedAt: at(6, 22).toISOString() };
    expect(openState(late, at(7, 2))).toBe('closed');
    // No hours to fall back on: unknown, never the stale flag.
    expect(openState({ isOpen: true, fetchedAt: at(6, 22).toISOString() }, at(7, 2))).toBe('unknown');
    // The measurement time counts when the source gives one.
    const measured = { isOpen: false, fetchedAt: at(7, 12).toISOString(), updatedAt: at(7, 10).toISOString() };
    expect(openState(measured, at(7, 12))).toBe('unknown');
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

  // OSM opening_hours forms found in data/food-*.json.
  it('reads "24/7" and an every-day prefix', () => {
    expect(openState(text('24/7'), at(7, 3))).toBe('open');
    expect(openState(text('Mo-Su 09:00-23:00'), at(11, 12))).toBe('open');
    expect(openState(text('Mo-Su 09:00-23:00'), at(11, 23, 30))).toBe('closed');
    expect(openState(text('Mo-Su 10:00 - 22:00'), at(7, 21))).toBe('open');
    expect(openState(text('10.00-02.00'), at(7, 1))).toBe('open');
  });

  it('reads day ranges, day lists and wrapping ranges; unnamed days are closed', () => {
    const weekdays = text('Mo-Fr 08:00-18:00');
    expect(openState(weekdays, at(7, 12))).toBe('open'); // Wednesday
    expect(openState(weekdays, at(11, 12))).toBe('closed'); // Sunday
    expect(openState(text('Su,Tu-Sa 09:00-17:00'), at(11, 10))).toBe('open');
    expect(openState(text('Su,Tu-Sa 09:00-17:00'), at(12, 10))).toBe('closed'); // Monday
    expect(openState(text('We-Mo 10:00-20:00'), at(13, 12))).toBe('closed'); // Tuesday
    expect(openState(text('We-Mo 10:00-20:00'), at(11, 12))).toBe('open');
    expect(openState(text('Mo, We-Su 10:00-20:00'), at(13, 12))).toBe('closed');
  });

  it('applies later rules over earlier ones, with "off" and several ranges a day', () => {
    const t = text('Mo-Fr 09:00-18:00; Sa 10:00-14:00; Su off');
    expect(openState(t, at(10, 12))).toBe('open'); // Saturday
    expect(openState(t, at(10, 15))).toBe('closed');
    expect(openState(t, at(11, 12))).toBe('closed');
    const split = text('Mo-Su 11:00-15:00, 18:00-23:00');
    expect(openState(split, at(7, 16))).toBe('closed');
    expect(openState(split, at(7, 19))).toBe('open');
    expect(openState(text('Mo off; Tu-Su 10:00-20:00'), at(12, 12))).toBe('closed');
    // Holiday rules say nothing about ordinary days.
    expect(openState(text('Mo-Sa 09:00-18:00; PH closed'), at(7, 12))).toBe('open');
    expect(openState(text('Mo-Su,PH 09:00-18:00'), at(7, 12))).toBe('open');
  });

  it('runs an overnight range into the next day only', () => {
    const t = text('Fr-Sa 18:00-03:00');
    expect(openState(t, at(10, 2))).toBe('open'); // Saturday 02:00, from Friday
    expect(openState(t, at(11, 2))).toBe('open'); // Sunday 02:00, from Saturday
    expect(openState(t, at(12, 2))).toBe('closed'); // Monday 02:00: Sunday is closed
    expect(openState(t, at(9, 2))).toBe('closed'); // Friday 02:00: Thursday is closed
  });

  it('is unknown for anything else', () => {
    expect(openState(text('Abone Otoparkı'), at(7, 12))).toBe('unknown');
    expect(openState(text('sunrise-sunset'), at(7, 12))).toBe('unknown');
    expect(openState(text('Mo-Fr 09:00-18:00; Jul-Aug off'), at(7, 12))).toBe('unknown');
    expect(openState(text('Mo-Sa:09:00-18:00'), at(7, 12))).toBe('unknown');
    expect(openState({}, at(7, 12))).toBe('unknown');
    expect(openState({ openingHoursText: null }, at(7, 12))).toBe('unknown');
  });
});

describe('closesLate', () => {
  it('reads the OSM forms for the day asked', () => {
    expect(closesLate(text('24/7'), at(7, 12))).toBe(true);
    expect(closesLate(text('Mo-Su 12:00-02:00'), at(7, 12))).toBe(true);
    expect(closesLate(text('Mo-Su 09:00-21:00'), at(7, 12))).toBe(false);
    const weekend = text('Mo-Th 10:00-21:00; Fr-Sa 10:00-01:00');
    expect(closesLate(weekend, at(10, 12))).toBe(true); // Saturday
    expect(closesLate(weekend, at(7, 12))).toBe(false); // Wednesday
    expect(closesLate(weekend, at(11, 12))).toBe(false); // Sunday: closed
    expect(closesLate(text('07:00–23:00, Pazar Günleri Kapalı'), at(11, 12))).toBe(false);
    expect(closesLate(text('sunrise-sunset'), at(7, 12))).toBe(false);
  });
});

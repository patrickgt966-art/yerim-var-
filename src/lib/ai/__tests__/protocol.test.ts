import { fillPlaceholders, isGroundedReply, todayIstanbul } from '../protocol';

describe('fillPlaceholders', () => {
  it('replaces {n} with the n-th name', () => {
    expect(fillPlaceholders('{1} ve {2} yakın', ['Ada', 'Bora'])).toBe('Ada ve Bora yakın');
  });
});

describe('isGroundedReply', () => {
  it('accepts a grounded reply', () => {
    expect(isGroundedReply('Tabi hocam! {1} otoparka 90 m, {2} de yakın.', [90], 2)).toBe(true);
  });

  it('rejects a number that is not allowed', () => {
    expect(isGroundedReply('Tabi hocam! {1} otoparka 95 m.', [90], 2)).toBe(false);
  });

  it('rejects a placeholder beyond the result count', () => {
    expect(isGroundedReply('Tabi hocam! {1} ve {3} yakın.', [90], 2)).toBe(false);
  });

  it('rejects blocked words', () => {
    expect(isGroundedReply('{1} puanı yüksek.', [], 2)).toBe(false);
    expect(isGroundedReply('{1} için 150 TL', [150], 2)).toBe(false);
  });

  it('rejects replies over 400 characters', () => {
    expect(isGroundedReply('a'.repeat(401), [], 2)).toBe(false);
  });
});

describe('todayIstanbul', () => {
  it('uses UTC+3', () => {
    expect(todayIstanbul('2026-10-09T22:30:00Z')).toBe('2026-10-10');
    expect(todayIstanbul(new Date('2026-10-09T20:59:00Z'))).toBe('2026-10-09');
  });
});

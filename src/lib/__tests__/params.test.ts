import { firstParam, parseLatLng } from '@/lib/params';

describe('parseLatLng', () => {
  it('parses valid coordinates and trims', () => {
    expect(parseLatLng('38.43', ' 27.14 ')).toEqual({ lat: 38.43, lng: 27.14 });
    expect(parseLatLng('0', '0')).toEqual({ lat: 0, lng: 0 });
  });
  it('rejects empty, blank and missing values', () => {
    expect(parseLatLng('38.43', '')).toBeNull();
    expect(parseLatLng(' ', ' ')).toBeNull();
    expect(parseLatLng(undefined, '27')).toBeNull();
  });
  it('takes the first of repeated params', () => {
    expect(parseLatLng(['38.4', '1'], ['27.1', '2'])).toEqual({ lat: 38.4, lng: 27.1 });
    expect(parseLatLng([], '27')).toBeNull();
  });
  it('rejects non-finite and out-of-range values', () => {
    expect(parseLatLng('abc', '27')).toBeNull();
    expect(parseLatLng('Infinity', '27')).toBeNull();
    expect(parseLatLng('99999', '27')).toBeNull();
    expect(parseLatLng('38', '181')).toBeNull();
    expect(parseLatLng('-90', '-180')).toEqual({ lat: -90, lng: -180 });
  });
});

describe('firstParam', () => {
  it('normalises arrays and undefined', () => {
    expect(firstParam(['a', 'b'])).toBe('a');
    expect(firstParam('a')).toBe('a');
    expect(firstParam(undefined)).toBeUndefined();
  });
});

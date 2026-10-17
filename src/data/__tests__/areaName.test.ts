import { useApp } from '@/store/app';

import { areaName } from '../search';

describe('areaName', () => {
  beforeEach(() => useApp.getState().setCity('izmir'));

  it('names the neighbourhood of a point in the city', () => {
    expect(areaName({ lat: 38.437, lng: 27.143 })).toEqual(expect.any(String));
  });

  it('names nothing far from every neighbourhood (open sea)', () => {
    expect(areaName({ lat: 38.6, lng: 26.6 })).toBeUndefined();
  });
});

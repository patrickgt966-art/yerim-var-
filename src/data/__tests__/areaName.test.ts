import { useApp } from '@/store/app';

import { activeCity } from '../cities';
import { areaName, searchPlaces } from '../search';

describe('areaName', () => {
  beforeEach(() => useApp.getState().setCity('izmir'));

  it('names the neighbourhood of a point in the city', () => {
    expect(areaName({ lat: 38.437, lng: 27.143 })).toEqual(expect.any(String));
  });

  it('names nothing far from every neighbourhood (open sea)', () => {
    expect(areaName({ lat: 38.6, lng: 26.6 })).toBeUndefined();
  });

  it('a district without its own OSM town node is named at its centre', () => {
    expect(areaName({ lat: 38.4189, lng: 27.1287 })).toBe('Konak');
    useApp.getState().setCity('ankara');
    const cankaya = activeCity().districtCenters.find((d) => d.name === 'Çankaya')!;
    expect(areaName(cankaya)).toBe('Çankaya');
  });

  it('search hits carry their own district, not a neighbour across the water', () => {
    useApp.getState().setCity('istanbul');
    const taksim = searchPlaces('Taksim', 3).find((h) => h.kind === 'station');
    expect(taksim?.district).toBe('Beyoğlu');
    const pier = searchPlaces('Kadıköy', 4).find((h) => h.kind === 'pier');
    expect(pier?.district).toBe('Kadıköy');
  });
});

import { isNearRail } from '../places';

describe('isNearRail', () => {
  it('is false far from every station', () => {
    // Middle of the Aegean, far from any İzmir station.
    expect(isNearRail({ lat: 38.5, lng: 25.5 })).toBe(false);
  });
});

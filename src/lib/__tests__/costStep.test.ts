import '@/i18n';

import * as Notifications from 'expo-notifications';

import { nextPriceStep, tariffFor } from '@/data/tariffs';
import type { ActivePark } from '@/store/app';

import { COST_STEP_ID, costStepPlan, syncCostStep } from '../costStep';

jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DATE: 'date' },
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  scheduleNotificationAsync: jest.fn(async () => 'park-cost-step'),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
}));

const N = Notifications as unknown as Record<string, jest.Mock>;
// İSPARK 104: 15 free minutes, then 0-1 h 170, 1-2 h 220, 2-4 h 300, 4-8 h 370, a day 500.
const ID = 'ispark-104';
const START = new Date('2026-10-23T10:00:00Z');
const min = (m: number) => new Date(START.getTime() + m * 60_000);
const park: ActivePark = {
  parkingId: ID,
  name: 'Kadıköy Otoparkı',
  startedAt: START.toISOString(),
  hourly: null,
  lat: 40.99,
  lng: 29.03,
};

describe('nextPriceStep', () => {
  const t = tariffFor(ID)!;
  it('walks the band edges where the price rises', () => {
    expect(nextPriceStep(t, 0)).toEqual({ atMin: 15, from: 0, to: 170 });
    expect(nextPriceStep(t, 16)).toEqual({ atMin: 60, from: 170, to: 220 });
    expect(nextPriceStep(t, 61)).toEqual({ atMin: 120, from: 220, to: 300 });
    expect(nextPriceStep(t, 300)).toEqual({ atMin: 480, from: 370, to: 500 });
    expect(nextPriceStep(t, 481)).toEqual({ atMin: 1440, from: 500, to: 1000 });
  });

  it('has nothing for a car park without bands', () => {
    expect(tariffFor('no-such-car-park')).toBeNull();
  });
});

describe('costStepPlan', () => {
  it('warns ten minutes before the next step that is still ahead', () => {
    expect(costStepPlan(park, min(0))).toEqual({ at: min(5), from: 0, to: 170 });
    expect(costStepPlan(park, min(30))).toEqual({ at: min(50), from: 170, to: 220 });
    // At 50 minutes the 60-minute warning is due now: the next one is planned instead.
    expect(costStepPlan(park, min(50))).toEqual({ at: min(110), from: 220, to: 300 });
  });

  it('plans nothing without a tariff', () => {
    expect(costStepPlan({ ...park, parkingId: 'osm-1' }, min(0))).toBeNull();
  });
});

describe('syncCostStep', () => {
  beforeEach(() => jest.clearAllMocks());

  it('replaces the scheduled warning with the next one', async () => {
    await syncCostStep(park, min(30));
    expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith(COST_STEP_ID);
    expect(N.scheduleNotificationAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: COST_STEP_ID,
        content: expect.objectContaining({
          title: 'Ücret 10 dk sonra artıyor',
          body: 'Kadıköy Otoparkı: şimdiye kadar ~170 TL, 10 dk sonra ~220 TL olacak.',
          data: { kind: 'park' },
        }),
        trigger: { type: 'date', date: min(50) },
      }),
    );
  });

  it('only cancels when the park ended, and never asks for permission', async () => {
    await syncCostStep(null);
    expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith(COST_STEP_ID);
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
    N.getPermissionsAsync!.mockResolvedValueOnce({ granted: false });
    await syncCostStep(park, min(30));
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

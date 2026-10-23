import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import {
  __setParkWidgetForTests,
  clearWidget,
  NEAREST_MIN_INTERVAL_MS,
  setWidgetNearest,
  setWidgetParked,
  type ParkWidgetHandle,
  type ParkWidgetProps,
} from '../parkWidget';
import { onParkChange, refreshParkActivity } from '../parkActivity';
import type { ActivePark } from '@/store/app';

jest.mock('expo', () => ({
  ...jest.requireActual('expo'),
  requireOptionalNativeModule: jest.fn(() => null),
}));

const T0 = new Date('2026-10-17T10:00:00Z').getTime();
const near = (over: Partial<Parameters<typeof setWidgetNearest>[0]> = {}) => ({
  name: 'Alsancak Katlı',
  walkMin: 4,
  free: 12,
  at: T0,
  ...over,
});

let w: { updateSnapshot: jest.Mock };
const last = () => w.updateSnapshot.mock.calls.at(-1)?.[0] as ParkWidgetProps;

beforeEach(() => {
  jest.useFakeTimers();
  w = { updateSnapshot: jest.fn() };
  __setParkWidgetForTests(w as ParkWidgetHandle);
});
afterEach(() => {
  __setParkWidgetForTests(undefined);
  jest.useRealTimers();
});

describe('the widget feed', () => {
  it('a started park becomes a parked snapshot, an ended one an unparked snapshot', () => {
    setWidgetParked({ name: 'Konak Otoparkı', startedAt: T0 }, T0);
    expect(last().parked).toEqual({ name: 'Konak Otoparkı', startedAt: T0 });
    expect(last().nearest).toBeNull();
    expect(last().labels.parked).toBe('Park edildi');
    setWidgetParked(null, T0 + 1000);
    expect(last().parked).toBeNull();
  });

  it('translates the labels and times at snapshot time', () => {
    setWidgetNearest(near(), T0 + NEAREST_MIN_INTERVAL_MS);
    const n = last().nearest!;
    expect(n).toMatchObject({
      name: 'Alsancak Katlı',
      walkMin: 4,
      free: 12,
      walkText: '~4 dk yürüme',
    });
    expect(n.freeText).toBe('12 boş yer');
    expect(n.asOfText).toMatch(/^\d\d:\d\d itibarıyla$/);
  });

  it('leaves out the free count when none is known', () => {
    setWidgetNearest(near({ free: null }), T0 + NEAREST_MIN_INTERVAL_MS);
    expect(last().nearest).toMatchObject({ free: null, freeText: null });
  });

  it('pushes nearest at most once a minute, only when it changed', () => {
    const t = T0 + NEAREST_MIN_INTERVAL_MS;
    setWidgetNearest(near(), t);
    expect(w.updateSnapshot).toHaveBeenCalledTimes(1);
    // Same car park, same numbers, a newer data time: nothing to say.
    setWidgetNearest(near({ at: t }), t + 5000);
    expect(w.updateSnapshot).toHaveBeenCalledTimes(1);
    // A change inside the minute waits for the minute to pass, then goes out once.
    setWidgetNearest(near({ walkMin: 5 }), t + 10_000);
    setWidgetNearest(near({ walkMin: 6 }), t + 20_000);
    expect(w.updateSnapshot).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(NEAREST_MIN_INTERVAL_MS);
    expect(w.updateSnapshot).toHaveBeenCalledTimes(2);
    expect(last().nearest?.walkMin).toBe(6);
    // After the minute a change goes straight out.
    jest.setSystemTime(Date.now() + 2 * NEAREST_MIN_INTERVAL_MS);
    setWidgetNearest(near({ walkMin: 7 }), Date.now());
    expect(w.updateSnapshot).toHaveBeenCalledTimes(3);
  });

  it('skips nearest while parked and shows it again after the park ends', () => {
    setWidgetParked({ name: 'Konak Otoparkı', startedAt: T0 }, T0);
    w.updateSnapshot.mockClear();
    setWidgetNearest(near(), T0 + 5 * NEAREST_MIN_INTERVAL_MS);
    expect(w.updateSnapshot).not.toHaveBeenCalled();
    setWidgetParked(null, T0 + 6 * NEAREST_MIN_INTERVAL_MS);
    expect(last().parked).toBeNull();
    expect(last().nearest?.name).toBe('Alsancak Katlı');
  });

  it('clearWidget empties it', () => {
    setWidgetNearest(near(), T0 + NEAREST_MIN_INTERVAL_MS);
    clearWidget();
    expect(last()).toMatchObject({ parked: null, nearest: null });
  });

  it('never throws, also when the widget does', () => {
    w.updateSnapshot.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => setWidgetParked({ name: 'x', startedAt: T0 }, T0)).not.toThrow();
    expect(() => setWidgetNearest(near(), T0)).not.toThrow();
    expect(() => clearWidget()).not.toThrow();
  });
});

describe('without the native module', () => {
  const nativeModule = jest.mocked(requireOptionalNativeModule);
  afterEach(() => {
    Platform.OS = 'ios';
  });

  it('is a no-op on Android, in Expo Go and when the layout cannot load', () => {
    __setParkWidgetForTests(undefined);
    Platform.OS = 'android';
    expect(() => setWidgetParked({ name: 'x', startedAt: T0 })).not.toThrow();
    Platform.OS = 'ios';
    __setParkWidgetForTests(undefined);
    nativeModule.mockReturnValue(null);
    expect(() => setWidgetNearest(near())).not.toThrow();
    expect(() => clearWidget()).not.toThrow();
    // The native module is there but expo-widgets refuses to load.
    __setParkWidgetForTests(undefined);
    nativeModule.mockReturnValue({} as never);
    jest.doMock('../parkWidgetLayout', () => {
      throw new Error('Cannot find native module ExpoWidgets');
    });
    expect(() => setWidgetParked(null)).not.toThrow();
    nativeModule.mockReturnValue(null);
  });
});

describe('the park in the store', () => {
  const park = (over: Partial<ActivePark> = {}): ActivePark => ({
    parkingId: 'test-no-tariff',
    name: 'Konak Otoparkı',
    startedAt: new Date(T0).toISOString(),
    hourly: 40,
    lat: 38.4,
    lng: 27.1,
    ...over,
  });

  it('starting, resuming and ending a park reach the widget', async () => {
    await onParkChange(park(), null, T0);
    expect(last().parked).toEqual({ name: 'Konak Otoparkı', startedAt: T0 });
    w.updateSnapshot.mockClear();
    await refreshParkActivity(park(), T0 + 1000);
    expect(last().parked?.startedAt).toBe(T0);
    await onParkChange(null, park(), T0 + 2000);
    expect(last().parked).toBeNull();
    await refreshParkActivity(null, T0 + 3000);
    expect(last().parked).toBeNull();
  });

  it('an unreadable start time counts as not parked', async () => {
    await refreshParkActivity(park({ startedAt: 'nonsense' }), T0);
    expect(last().parked).toBeNull();
  });
});

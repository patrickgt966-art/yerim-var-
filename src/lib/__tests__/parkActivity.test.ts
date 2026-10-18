import { Alert } from 'react-native';

import type { Parking } from '@/data/types';
import { useApp, type ActivePark } from '@/store/app';

import {
  __setLiveActivityFactoryForTests,
  type LiveActivityFactory,
  type LiveActivityHandle,
} from '../liveActivity';
import {
  LIVE_ACTIVITY_MAX_MS,
  nextCostChange,
  parkActivityProps,
  refreshParkActivity,
  watchParkActivity,
} from '../parkActivity';
import { parkedHere } from '../parkHere';

const T0 = new Date('2026-10-17T10:00:00Z').getTime();
const MIN = 60_000;
const hhmm = (ms: number) => {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// No tariff for these ids, so the cost is the hourly estimate: every started hour at 40 TL.
const park = (over: Partial<ActivePark> = {}): ActivePark => ({
  parkingId: 'test-no-tariff',
  name: 'Konak Otoparkı',
  startedAt: new Date(T0).toISOString(),
  hourly: 40,
  lat: 38.4,
  lng: 27.1,
  ...over,
});

type FakeHandle = LiveActivityHandle & { update: jest.Mock; end: jest.Mock };
let running: FakeHandle[] = [];
let n = 0;
const factory = {
  start: jest.fn((..._args: Parameters<LiveActivityFactory['start']>) => {
    const id = `a${n}`;
    const h: FakeHandle = {
      getId: () => id,
      update: jest.fn(async () => {}),
      end: jest.fn(async () => {
        running = running.filter((x) => x !== h);
      }),
    };
    n += 1;
    running.push(h);
    return h;
  }),
  getInstances: jest.fn(() => [...running]),
} satisfies LiveActivityFactory;

const flush = () =>
  new Promise((r) => jest.requireActual<typeof globalThis>('timers').setImmediate(r));

beforeEach(() => {
  jest.useFakeTimers({ now: T0 + 30 * MIN, doNotFake: ['setImmediate'] });
  jest.clearAllMocks();
  running = [];
  useApp.setState({ active: null });
  __setLiveActivityFactoryForTests(factory);
});
afterEach(() => {
  jest.useRealTimers();
  __setLiveActivityFactoryForTests(undefined);
});

describe('nextCostChange', () => {
  it('finds the next started hour', () => {
    expect(nextCostChange(park(), T0, T0 + 30 * MIN)).toEqual({ at: T0 + 60 * MIN, cost: 80 });
    expect(nextCostChange(park(), T0, T0 + 60 * MIN + 1)).toEqual({
      at: T0 + 120 * MIN,
      cost: 120,
    });
  });

  it('follows a banded tariff (0-1, 1-2, 2-4 saat, Günlük)', () => {
    const banded = park({ parkingId: 'mock-alsancak-katli', hourly: 60 });
    expect(nextCostChange(banded, T0, T0 + 70 * MIN)).toEqual({ at: T0 + 120 * MIN, cost: 130 });
    expect(nextCostChange(banded, T0, T0 + 150 * MIN)).toEqual({ at: T0 + 240 * MIN, cost: 250 });
    expect(nextCostChange(banded, T0, T0 + 300 * MIN)).toBeNull();
  });

  it('is null without a price, or past the limit', () => {
    expect(nextCostChange(park({ hourly: null }), T0, T0)).toBeNull();
    expect(nextCostChange(park(), T0, T0 + 30 * MIN, T0 + 50 * MIN)).toBeNull();
  });
});

describe('parkActivityProps', () => {
  it('names the park, the start, the cost and the next band', () => {
    const { props, nextChangeAt } = parkActivityProps(park(), T0 + 30 * MIN);
    expect(props).toMatchObject({
      name: 'Konak Otoparkı',
      label: 'Park hâlinde',
      startedAt: T0,
      endsAt: T0 + LIVE_ACTIVITY_MAX_MS,
      cost: '~40 TL',
      nextCost: '~80 TL',
      nextText: `${hhmm(T0 + 60 * MIN)} sonrası ~80 TL`,
      colors: { bg: '#0B3C49', accent: '#FF8A1F' },
    });
    expect(nextChangeAt).toBe(T0 + 60 * MIN);
  });

  it('shows no cost without a tariff', () => {
    const { props, nextChangeAt } = parkActivityProps(park({ hourly: null }), T0 + 30 * MIN);
    expect(props).toMatchObject({ cost: null, nextCost: null, nextText: null });
    expect(nextChangeAt).toBeNull();
  });
});

describe('the Live Activity follows the park in the store', () => {
  let stop: () => void = () => {};
  beforeEach(async () => {
    await useApp.persist.rehydrate();
    stop = watchParkActivity();
    await flush();
    jest.clearAllMocks();
  });
  afterEach(() => stop());

  it('"Buraya park ettim" starts it', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    parkedHere({ id: 'test-no-tariff', name: 'Kadıköy Katlı', lat: 40.99, lng: 29.03 } as Parking);
    await flush();
    expect(factory.start).toHaveBeenCalledTimes(1);
    const [props, url, staleDate] = factory.start.mock.calls[0]!;
    expect(props.name).toBe('Kadıköy Katlı');
    expect(props.startedAt).toBe(Date.now());
    expect(url).toBe('yerimvar://');
    // No price known for it: stale only at the 24 h limit.
    expect(props.cost).toBeNull();
    expect(staleDate).toEqual(new Date(Date.now() + LIVE_ACTIVITY_MAX_MS));
  });

  it('updates the cost when the band changes, while the app runs', async () => {
    useApp.getState().startPark(park());
    await flush();
    const h = running[0]!;
    expect(factory.start.mock.calls[0]?.[0]).toMatchObject({ cost: '~40 TL' });
    expect(factory.start.mock.calls[0]?.[2]).toEqual(new Date(T0 + 60 * MIN));
    jest.advanceTimersByTime(30 * MIN);
    await flush();
    expect(h.update).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1000);
    await flush();
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update.mock.calls[0]?.[0]).toMatchObject({ cost: '~80 TL', nextCost: '~120 TL' });
  });

  it('updates, not restarts, when the same park changes (reminder, still parked)', async () => {
    useApp.getState().startPark(park());
    await flush();
    useApp.getState().confirmPark();
    await flush();
    expect(factory.start).toHaveBeenCalledTimes(1);
    expect(running[0]!.update).toHaveBeenCalledTimes(1);
  });

  it('"Parkı bitir" ends it at once', async () => {
    useApp.getState().startPark(park());
    await flush();
    const h = running[0]!;
    useApp.getState().endPark();
    await flush();
    expect(h.end).toHaveBeenCalledWith('immediate');
    expect(running).toHaveLength(0);
  });

  it('a new park replaces the old activity', async () => {
    useApp.getState().startPark(park());
    await flush();
    const old = running[0]!;
    useApp.getState().startPark(park({ parkingId: 'other', startedAt: new Date().toISOString() }));
    await flush();
    expect(factory.start).toHaveBeenCalledTimes(2);
    expect(old.end).toHaveBeenCalledWith('immediate');
    expect(running).toHaveLength(1);
  });

  it('ends after 24 h, the park itself stays', async () => {
    useApp.getState().startPark(park());
    await flush();
    const h = running[0]!;
    await refreshParkActivity(useApp.getState().active, T0 + LIVE_ACTIVITY_MAX_MS);
    expect(h.end).toHaveBeenCalledWith('immediate');
    expect(useApp.getState().active).not.toBeNull();
  });
});

describe('refreshParkActivity (launch, back from the background)', () => {
  it('updates an activity from an earlier launch, never starts one', async () => {
    await refreshParkActivity(park(), T0 + 30 * MIN);
    expect(factory.start).not.toHaveBeenCalled();
    factory.start(parkActivityProps(park()).props);
    jest.clearAllMocks();
    __setLiveActivityFactoryForTests(factory);
    await refreshParkActivity(park(), T0 + 30 * MIN);
    expect(running[0]!.update).toHaveBeenCalledTimes(1);
    expect(factory.start).not.toHaveBeenCalled();
  });

  it('ends a left-over activity when there is no park', async () => {
    factory.start(parkActivityProps(park()).props);
    const h = running[0]!;
    await refreshParkActivity(null);
    expect(h.end).toHaveBeenCalledWith('immediate');
  });
});

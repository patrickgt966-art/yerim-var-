import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import {
  __setLiveActivityFactoryForTests,
  endLiveActivity,
  isLiveActivitySupported,
  startLiveActivity,
  updateLiveActivity,
  type LiveActivityFactory,
  type LiveActivityHandle,
  type ParkActivityProps,
} from '../liveActivity';

jest.mock('expo', () => ({
  ...jest.requireActual('expo'),
  requireOptionalNativeModule: jest.fn(() => null),
}));

const fakeFactory: { current: LiveActivityFactory | null } = { current: null };
jest.mock('../parkActivityLayout', () => ({
  createParkActivityFactory: () => {
    if (!fakeFactory.current) throw new Error('Cannot find native module ExpoWidgets');
    return fakeFactory.current;
  },
}));

const props: ParkActivityProps = {
  name: 'Konak Otoparkı',
  label: 'Park hâlinde',
  startedAt: 0,
  endsAt: 86_400_000,
  cost: '~40 TL',
  nextCost: '~80 TL',
  nextText: '01:00 sonrası ~80 TL',
  colors: { bg: '#0B3C49', text: '#FFFFFF', muted: '#9FE3D2', accent: '#FF8A1F' },
};

type FakeHandle = LiveActivityHandle & { update: jest.Mock; end: jest.Mock };
const handle = (id: string): FakeHandle => ({
  getId: () => id,
  update: jest.fn(async () => {}),
  end: jest.fn(async () => {}),
});

function fake(running: FakeHandle[] = []) {
  const started = handle('new');
  const f = {
    start: jest.fn(() => {
      running.push(started);
      return started;
    }),
    getInstances: jest.fn(() => [...running]),
  };
  return { f, started, running };
}

const nativeModule = jest.mocked(requireOptionalNativeModule);

beforeEach(() => {
  jest.clearAllMocks();
  nativeModule.mockReturnValue(null);
  __setLiveActivityFactoryForTests(undefined);
});

describe('without the native module (Expo Go, Android, older builds)', () => {
  it('does nothing and never loads expo-widgets', async () => {
    expect(isLiveActivitySupported()).toBe(false);
    expect(startLiveActivity(props)).toBe(false);
    expect(await updateLiveActivity(props)).toBe(false);
    await expect(endLiveActivity()).resolves.toBeUndefined();
    expect(nativeModule).toHaveBeenCalledWith('ExpoWidgets');
  });

  it('is off on Android even if a module answers', () => {
    const os = Platform.OS;
    Object.defineProperty(Platform, 'OS', { value: 'android', configurable: true });
    nativeModule.mockReturnValue({});
    try {
      expect(isLiveActivitySupported()).toBe(false);
      expect(nativeModule).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
    }
  });

  it('stays off when the layout cannot be loaded', () => {
    nativeModule.mockReturnValue({});
    fakeFactory.current = null;
    expect(isLiveActivitySupported()).toBe(false);
  });
});

describe('with the native module', () => {
  it('loads the layout once the module is there', () => {
    const { f } = fake();
    nativeModule.mockReturnValue({});
    fakeFactory.current = f;
    expect(isLiveActivitySupported()).toBe(true);
    expect(startLiveActivity(props, { url: 'yerimvar://' })).toBe(true);
    expect(f.start).toHaveBeenCalledWith(props, 'yerimvar://', undefined);
  });

  it('start replaces an older activity of ours', () => {
    const old = handle('old');
    const { f, started } = fake([old]);
    __setLiveActivityFactoryForTests(f);
    const stale = new Date(3_600_000);
    expect(startLiveActivity(props, { staleDate: stale })).toBe(true);
    expect(f.start).toHaveBeenCalledWith(props, undefined, stale);
    expect(old.end).toHaveBeenCalledWith('immediate');
    expect(started.end).not.toHaveBeenCalled();
  });

  it('start gives false when iOS refuses (Live Activities off)', () => {
    const { f } = fake();
    f.start.mockImplementation(() => {
      throw new Error('LiveActivitiesNotSupported');
    });
    __setLiveActivityFactoryForTests(f);
    expect(startLiveActivity(props)).toBe(false);
  });

  it('update picks up an activity from an earlier launch, never starts one', async () => {
    const earlier = handle('earlier');
    const { f } = fake([earlier]);
    __setLiveActivityFactoryForTests(f);
    expect(await updateLiveActivity(props)).toBe(true);
    expect(earlier.update).toHaveBeenCalledWith(props, undefined);

    const none = fake();
    __setLiveActivityFactoryForTests(none.f);
    expect(await updateLiveActivity(props)).toBe(false);
    expect(none.f.start).not.toHaveBeenCalled();
  });

  it('update gives false once the system ended it, and lets go of it', async () => {
    const { f, started, running } = fake();
    __setLiveActivityFactoryForTests(f);
    startLiveActivity(props);
    started.update.mockRejectedValueOnce(new Error('LiveActivityNotFound'));
    running.length = 0;
    expect(await updateLiveActivity(props)).toBe(false);
    expect(await updateLiveActivity(props)).toBe(false);
    expect(started.update).toHaveBeenCalledTimes(1);
  });

  it('end ends every activity of ours, quietly', async () => {
    const a = handle('a');
    const b = handle('b');
    b.end.mockRejectedValueOnce(new Error('gone'));
    __setLiveActivityFactoryForTests(fake([a, b]).f);
    await expect(endLiveActivity()).resolves.toBeUndefined();
    expect(a.end).toHaveBeenCalledWith('immediate');
    expect(b.end).toHaveBeenCalledWith('immediate');
  });
});

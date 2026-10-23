import '@/i18n';

import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { useCoachRegistry } from '@/components/coach/registry';
import { setActiveCity } from '@/data/cities';
import { useApp } from '@/store/app';
import { useCoach } from '@/store/coach';
import { useNudge } from '@/store/nudge';

import { MascotNudge } from '../MascotNudge';

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
  useFocusEffect: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 34, left: 0 }),
}));
jest.mock('@/data/useParkings', () => ({ useParkings: () => ({ data: { parkings: [] } }) }));
// Reanimated needs the native worklets runtime: static stand-ins are enough here.
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View },
    useReducedMotion: () => true,
    useSharedValue: (v: number) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withSpring: (v: unknown) => v,
    withTiming: (v: unknown) => v,
  };
});

// Alsancak, İzmir: plenty of restaurants around in the bundled data.
const HERE = { lat: 38.4361, lng: 27.1425 };

describe('MascotNudge', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(2026, 9, 23, 19, 30) });
    setActiveCity('izmir');
    useApp.setState({ city: 'izmir', favorites: [], favoriteRestaurants: [], active: null });
    useCoach.setState({ coachDone: true });
    useNudge.getState().reset();
    useCoachRegistry.setState({ homeFocused: true });
  });
  afterEach(() => jest.useRealTimers());

  it('peeks with a teaser at dinner time, opens on a tap and remembers the day', async () => {
    await render(<MascotNudge nearby={{ here: HERE }} />);
    expect(screen.queryByText('Bir fikrim var')).toBeNull();
    await act(() => jest.advanceTimersByTime(2600));
    expect(screen.getByText('Bir fikrim var')).toBeTruthy();
    expect(useNudge.getState()).toMatchObject({ lastDay: '2026-10-23', lastKind: 'meal' });

    await fireEvent.press(screen.getByLabelText(/^Bir fikrim var: Akşam yemeği vakti!/));
    expect(screen.getByText('Akşam yemeği vakti!')).toBeTruthy();
    expect(screen.getByText(/^Yakında .* var\.$/)).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Sonra'));
    expect(useNudge.getState().laters).toBe(1);
  });

  it('goes back by itself when nobody taps it', async () => {
    await render(<MascotNudge nearby={{ here: HERE }} />);
    await act(() => jest.advanceTimersByTime(2600));
    expect(screen.getByText('Bir fikrim var')).toBeTruthy();
    await act(() => jest.advanceTimersByTime(9000));
    expect(screen.queryByText('Bir fikrim var')).toBeNull();
  });

  it('stays away during the tour, when turned off, or once today’s was shown', async () => {
    useCoach.setState({ coachDone: false });
    const view = await render(<MascotNudge nearby={{ here: HERE }} />);
    await act(() => jest.advanceTimersByTime(5000));
    expect(screen.queryByText('Bir fikrim var')).toBeNull();
    await view.unmount();

    useCoach.setState({ coachDone: true });
    useNudge.getState().setEnabled(false);
    const off = await render(<MascotNudge nearby={{ here: HERE }} />);
    await act(() => jest.advanceTimersByTime(5000));
    expect(screen.queryByText('Bir fikrim var')).toBeNull();
    await off.unmount();

    useNudge.getState().setEnabled(true);
    useNudge.getState().shown('favNearby', new Date());
    await render(<MascotNudge nearby={{ here: HERE }} />);
    await act(() => jest.advanceTimersByTime(5000));
    expect(screen.queryByText('Bir fikrim var')).toBeNull();
  });
});

import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { useApp } from '@/store/app';

import { LAUNCH_MS, LaunchIntro } from '../LaunchIntro';

let mockReduce = false;
// Reanimated needs the native worklets runtime: static stand-ins are enough here.
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View },
    Easing: { in: () => 0, quad: 0 },
    useReducedMotion: () => mockReduce,
    // Stable like the real one, so effects that list it do not re-run.
    useSharedValue: (v: number) => jest.requireActual('react').useRef({ value: v }).current,
    useAnimatedStyle: () => ({}),
    withDelay: (_d: number, v: unknown) => v,
    withSequence: (...v: unknown[]) => v[0],
    withSpring: (v: unknown) => v,
    withTiming: (v: unknown) => v,
  };
});

const logo = () => screen.queryByLabelText('Yerim Var', { includeHiddenElements: true });

describe('LaunchIntro', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockReduce = false;
    useApp.setState({ onboarded: true });
  });
  afterEach(() => jest.useRealTimers());

  it('plays for about a second on a normal launch, then gets out of the way', async () => {
    await render(<LaunchIntro />);
    expect(logo()).toBeTruthy();
    await act(() => jest.advanceTimersByTime(LAUNCH_MS - 100));
    expect(logo()).toBeTruthy();
    await act(() => jest.advanceTimersByTime(200));
    expect(logo()).toBeNull();
  });

  it('a tap skips it', async () => {
    await render(<LaunchIntro />);
    await fireEvent.press(screen.getByLabelText('Yerim Var', { includeHiddenElements: true }));
    expect(logo()).toBeNull();
  });

  it('does not play on the first launch (the welcome does) or with Reduce Motion', async () => {
    useApp.setState({ onboarded: false });
    const first = await render(<LaunchIntro />);
    expect(logo()).toBeNull();
    await first.unmount();
    useApp.setState({ onboarded: true });
    mockReduce = true;
    await render(<LaunchIntro />);
    expect(logo()).toBeNull();
  });
});

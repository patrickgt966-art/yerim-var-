import '@/i18n';

import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { WelcomeIntro } from '../WelcomeIntro';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, right: 0, bottom: 34, left: 0 }),
}));
let mockReduce = false;
// Reanimated needs the native worklets runtime: static stand-ins are enough here.
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View },
    Easing: { out: () => 0, quad: 0, cubic: 0 },
    useReducedMotion: () => mockReduce,
    useSharedValue: (v: number) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withDelay: (_d: number, v: unknown) => v,
    withSequence: (...v: unknown[]) => v[0],
    withSpring: (v: unknown) => v,
    withTiming: (v: unknown) => v,
  };
});

describe('WelcomeIntro', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockReduce = false;
  });
  afterEach(() => jest.useRealTimers());

  it('tells its short story, the words typing in, then offers to start', async () => {
    const onDone = jest.fn();
    await render(<WelcomeIntro onDone={onDone} />);
    expect(screen.queryByText('Selam, ben Yerim!')).toBeNull();
    await act(() => jest.advanceTimersByTime(2200));
    // Halfway through typing: the start of the line, not all of it.
    await act(() => jest.advanceTimersByTime(300));
    expect(screen.queryByText('Selam, ben Yerim!')).toBeNull();
    expect(screen.getByText(/^Selam/)).toBeTruthy();
    // In small steps, so each beat's typing starts as it would on a device.
    for (let i = 0; i < 50; i++) await act(() => jest.advanceTimersByTime(100));
    expect(screen.getByText('Selam, ben Yerim!')).toBeTruthy();
    expect(screen.getByText('Yemek mi arıyorsun? Bulurum.')).toBeTruthy();
    expect(screen.getByText('Park yeri mi? Onu da bulurum.')).toBeTruthy();
    await fireEvent.press(screen.getByText('Başlayalım'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('can be skipped at any moment', async () => {
    const onDone = jest.fn();
    await render(<WelcomeIntro onDone={onDone} />);
    await fireEvent.press(screen.getByLabelText('Geç'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('with Reduce Motion it is the last frame at once', async () => {
    mockReduce = true;
    await render(<WelcomeIntro onDone={() => {}} />);
    expect(screen.getByText('Selam, ben Yerim!')).toBeTruthy();
    expect(screen.getByText('Başlayalım')).toBeTruthy();
  });
});

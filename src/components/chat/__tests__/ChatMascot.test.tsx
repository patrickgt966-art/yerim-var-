import '@/i18n';

import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ChatMascot } from '../ChatMascot';

// Reanimated needs the native worklets runtime: static stand-ins are enough here.
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View },
    Easing: { out: () => 0, inOut: () => 0, quad: 0 },
    useReducedMotion: () => false,
    useSharedValue: (v: number) => jest.requireActual('react').useRef({ value: v }).current,
    useAnimatedStyle: () => ({}),
    withRepeat: (v: unknown) => v,
    withSequence: (...v: unknown[]) => v[0],
    withTiming: (v: unknown) => v,
  };
});

const base = { typing: false, typed: false, sends: 0, cheerKey: null, left: null, onTap: () => {} };
const HIDDEN = { includeHiddenElements: true };
const dots = () => screen.queryAllByTestId('thinking-dots', HIDDEN);

describe('ChatMascot', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows thinking dots only while an answer is on its way', async () => {
    const view = await render(<ChatMascot {...base} />);
    expect(dots()).toHaveLength(0);
    await view.rerender(<ChatMascot {...base} typing sends={1} />);
    expect(dots()).toHaveLength(1);
  });

  it('holds up the count when smart answers run low', async () => {
    await render(<ChatMascot {...base} left={2} />);
    expect(screen.getByText('2 hak', HIDDEN)).toBeTruthy();
  });

  it('is a button that fills in an example question', async () => {
    const onTap = jest.fn();
    await render(<ChatMascot {...base} onTap={onTap} />);
    const yerim = screen.getByLabelText('Yerim');
    expect(yerim.props.accessibilityHint).toBe('Yazı kutusuna örnek bir soru yazar');
    await fireEvent.press(yerim);
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it('cheers for a moment when places come back, then settles', async () => {
    const view = await render(<ChatMascot {...base} />);
    await view.rerender(<ChatMascot {...base} cheerKey="m3" />);
    await act(() => jest.advanceTimersByTime(10));
    // Arms up while cheering: the mascot draws a second raised arm.
    const raised = () => JSON.stringify(view.toJSON()).includes('M108 64Q');
    expect(raised()).toBe(true);
    await act(() => jest.advanceTimersByTime(2500));
    expect(raised()).toBe(false);
  });
});

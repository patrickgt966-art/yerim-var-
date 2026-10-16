import '@/i18n';

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useCoach } from '@/store/coach';

import { COACH_START_DELAY, CoachOverlay } from '../CoachOverlay';
import { useCoachRegistry } from '../registry';

// Reanimated needs the native worklets runtime. The mock records the `entering` animations.
const mockEntering: unknown[] = [];
let mockReduce = false;
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: {
      View: ({ entering, ...rest }: { entering?: unknown }) => {
        mockEntering.push(entering);
        return <View {...rest} />;
      },
    },
    FadeIn: { duration: () => 'fade' },
    useReducedMotion: () => mockReduce,
  };
});

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

// Window rects as the targets would report them (measureInWindow).
const RECTS = {
  yerim: { x: 162, y: 740, w: 66, h: 66 },
  ai: { x: 300, y: 60, w: 60, h: 34 },
  city: { x: 200, y: 56, w: 90, h: 44 },
  search: { x: 16, y: 190, w: 358, h: 130 },
};

const TEXTS = {
  yerim:
    'Bu Yerim, yapay zeka asistanın. Ne yemek istediğini ya da nereye gideceğini yaz, o bulsun.',
  ai: 'Günlük yapay zeka hakların. Her mesaj 1 hak harcar, gece yenilenir.',
  city: 'Şehrini buradan değiştir.',
  search: 'Yemek, yer ya da otopark yaz; ya da hazır örneklerden birine dokun.',
};

const mount = () =>
  render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <CoachOverlay />
    </SafeAreaProvider>,
  );

describe('CoachOverlay', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockEntering.length = 0;
    mockReduce = false;
    useCoach.setState({ coachDone: false, step: 0 });
    useCoachRegistry.setState({ rects: { ...RECTS }, homeFocused: true });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('waits about 600 ms after home has laid out, then shows the first bubble', async () => {
    await mount();
    expect(screen.queryByLabelText(TEXTS.yerim)).toBeNull();
    await act(() => jest.advanceTimersByTime(COACH_START_DELAY - 50));
    expect(screen.queryByLabelText(TEXTS.yerim)).toBeNull();
    await act(() => jest.advanceTimersByTime(100));
    expect(screen.getByLabelText(TEXTS.yerim)).toBeTruthy();
    expect(screen.getByLabelText('Devam')).toBeTruthy();
    expect(screen.getByLabelText('Geç')).toBeTruthy();
  });

  it('does not start before the home targets are measured or while home is not focused', async () => {
    useCoachRegistry.setState({ rects: { yerim: RECTS.yerim }, homeFocused: true });
    await mount();
    await act(() => jest.advanceTimersByTime(2000));
    expect(screen.queryByLabelText('Geç')).toBeNull();
    await act(() => {
      useCoachRegistry.setState({ rects: { ...RECTS }, homeFocused: false });
    });
    await act(() => jest.advanceTimersByTime(2000));
    expect(screen.queryByLabelText('Geç')).toBeNull();
  });

  it('goes through the four steps by tapping the bubble or the backdrop, then is done', async () => {
    await mount();
    await act(() => jest.advanceTimersByTime(COACH_START_DELAY + 10));

    await fireEvent.press(screen.getByLabelText(TEXTS.yerim));
    expect(screen.getByLabelText(TEXTS.ai)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Devam'));
    expect(screen.getByLabelText(TEXTS.city)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText(TEXTS.city));
    expect(screen.getByLabelText(TEXTS.search)).toBeTruthy();
    expect(useCoach.getState().coachDone).toBe(false);

    await fireEvent.press(screen.getByLabelText('Devam'));
    expect(useCoach.getState().coachDone).toBe(true);
    expect(screen.queryByLabelText('Geç')).toBeNull();
  });

  it('skips the ✨ step when its target does not exist', async () => {
    useCoachRegistry.setState({
      rects: { yerim: RECTS.yerim, city: RECTS.city, search: RECTS.search },
    });
    await mount();
    await act(() => jest.advanceTimersByTime(COACH_START_DELAY + 10));
    await fireEvent.press(screen.getByLabelText(TEXTS.yerim));
    expect(screen.getByLabelText(TEXTS.city)).toBeTruthy();
  });

  it('"Geç" ends it at once, and it never shows again', async () => {
    const view = await mount();
    await act(() => jest.advanceTimersByTime(COACH_START_DELAY + 10));
    await fireEvent.press(screen.getByLabelText('Geç'));
    expect(useCoach.getState().coachDone).toBe(true);
    expect(screen.queryByLabelText(TEXTS.yerim)).toBeNull();

    await view.unmount();
    await mount();
    await act(() => jest.advanceTimersByTime(5000));
    expect(screen.queryByLabelText('Geç')).toBeNull();
  });

  it('fades in, or does not animate at all with Reduce Motion', async () => {
    await mount();
    await act(() => jest.advanceTimersByTime(COACH_START_DELAY + 10));
    expect(mockEntering.length).toBeGreaterThan(0);
    expect(mockEntering.every((e) => e === 'fade')).toBe(true);

    await screen.unmount();
    mockEntering.length = 0;
    mockReduce = true;
    await mount();
    await act(() => jest.advanceTimersByTime(COACH_START_DELAY + 10));
    expect(screen.getByLabelText('Geç')).toBeTruthy();
    expect(mockEntering.length).toBeGreaterThan(0);
    expect(mockEntering.every((e) => e === undefined)).toBe(true);
  });
});

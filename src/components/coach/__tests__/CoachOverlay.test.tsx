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
    Keyframe: class {
      duration() {
        return 'hop';
      }
    },
    useReducedMotion: () => mockReduce,
  };
});

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

// Window rects as the targets would report them (measureInWindow).
const RECTS = {
  search: { x: 16, y: 190, w: 358, h: 130 },
};

// The first step opens with Yerim's hello.
const SEARCH_TEXT =
  'Selam, ben Yerim! Buraya ne istediğini yaz: bir yemek, bir semt ya da otopark. Gerisini ben bulurum.';
const ALL_RECTS = {
  ...RECTS,
  park: { x: 16, y: 340, w: 174, h: 130 },
  food: { x: 200, y: 340, w: 174, h: 130 },
  map: { x: 96, y: 760, w: 52, h: 34 },
  yerim: { x: 162, y: 728, w: 66, h: 66 },
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

  it('waits about 600 ms after home has laid out, then shows the search bubble', async () => {
    await mount();
    expect(screen.queryByLabelText(SEARCH_TEXT)).toBeNull();
    await act(() => jest.advanceTimersByTime(COACH_START_DELAY - 50));
    expect(screen.queryByLabelText(SEARCH_TEXT)).toBeNull();
    await act(() => jest.advanceTimersByTime(100));
    expect(screen.getByLabelText(SEARCH_TEXT)).toBeTruthy();
    expect(screen.getByLabelText('Devam')).toBeTruthy();
    expect(screen.getByLabelText('Geç')).toBeTruthy();
  });

  it('does not start before the search card is measured or while home is not focused', async () => {
    useCoachRegistry.setState({ rects: {}, homeFocused: true });
    await mount();
    await act(() => jest.advanceTimersByTime(2000));
    expect(screen.queryByLabelText('Geç')).toBeNull();
    await act(() => {
      useCoachRegistry.setState({ rects: { ...RECTS }, homeFocused: false });
    });
    await act(() => jest.advanceTimersByTime(2000));
    expect(screen.queryByLabelText('Geç')).toBeNull();
  });

  it('starts as soon as the search card is measured, without the city button', async () => {
    useCoachRegistry.setState({ rects: { search: RECTS.search }, homeFocused: true });
    await mount();
    await act(() => jest.advanceTimersByTime(COACH_START_DELAY + 10));
    expect(screen.getByLabelText(SEARCH_TEXT)).toBeTruthy();
  });

  it('with every target on screen, Yerim walks all five steps in order', async () => {
    useCoachRegistry.setState({ rects: { ...ALL_RECTS }, homeFocused: true });
    await mount();
    await act(() => jest.advanceTimersByTime(COACH_START_DELAY + 10));
    const bubble = screen.getByLabelText(SEARCH_TEXT);
    expect(bubble.props.accessibilityValue?.text).toBe('İpucu 1 / 5');
    expect(bubble.props.accessibilityHint).toBe('Sonraki ipucuna geçer');
    const texts = [
      'Otopark bul: yakındaki otoparkları, varsa canlı boş yer sayısıyla gösteririm.',
      'Yemek bul: yakındaki restoranlar; otoparkı yakın olanları öne alırım.',
      'Harita: otopark iğnelerinin rengi doluluğu söyler. Restoranlar da orada.',
      "Ben hep buradayım. Uzun bir isteğin varsa Yerim'e dokun, sor yeter.",
    ];
    await fireEvent.press(bubble);
    for (const [i, text] of texts.entries()) {
      const b = screen.getByLabelText(text);
      expect(b.props.accessibilityValue?.text).toBe(`İpucu ${i + 2} / 5`);
      expect(screen.queryByText('Selam, ben Yerim!')).toBeNull();
      await fireEvent.press(b);
    }
    expect(useCoach.getState().coachDone).toBe(true);
  });

  it('has one step: no step counter, and tapping the bubble or "Devam" ends it', async () => {
    await mount();
    await act(() => jest.advanceTimersByTime(COACH_START_DELAY + 10));
    expect(screen.getByLabelText(SEARCH_TEXT).props.accessibilityValue?.text).toBeUndefined();
    expect(screen.queryByText(/İpucu/)).toBeNull();
    expect(screen.getByLabelText(SEARCH_TEXT).props.accessibilityHint).toBe('İpucunu kapatır');

    await fireEvent.press(screen.getByLabelText(SEARCH_TEXT));
    expect(useCoach.getState().coachDone).toBe(true);
    expect(screen.queryByLabelText('Geç')).toBeNull();
  });

  it('"Devam" on the backdrop ends it too', async () => {
    await mount();
    await act(() => jest.advanceTimersByTime(COACH_START_DELAY + 10));
    await fireEvent.press(screen.getByLabelText('Devam'));
    expect(useCoach.getState().coachDone).toBe(true);
  });

  it('"Geç" ends it at once, and it never shows again', async () => {
    const view = await mount();
    await act(() => jest.advanceTimersByTime(COACH_START_DELAY + 10));
    await fireEvent.press(screen.getByLabelText('Geç'));
    expect(useCoach.getState().coachDone).toBe(true);
    expect(screen.queryByLabelText(SEARCH_TEXT)).toBeNull();

    await view.unmount();
    await mount();
    await act(() => jest.advanceTimersByTime(5000));
    expect(screen.queryByLabelText('Geç')).toBeNull();
  });

  it('fades in, or does not animate at all with Reduce Motion', async () => {
    await mount();
    await act(() => jest.advanceTimersByTime(COACH_START_DELAY + 10));
    expect(mockEntering.length).toBeGreaterThan(0);
    // The layer fades in; Yerim hops in.
    expect(mockEntering.every((e) => e === 'fade' || e === 'hop')).toBe(true);
    expect(mockEntering).toContain('hop');

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

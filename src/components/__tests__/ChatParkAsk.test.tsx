import '@/i18n';

import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { Alert } from 'react-native';

import ChatScreen from '@/app/sohbet';
import { setActiveCity } from '@/data/cities';
import tr from '@/i18n/tr';
import { openDirections } from '@/lib/directions';
import { useApp } from '@/store/app';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@/lib/location', () => ({
  currentLocation: jest.fn(async () => ({ lat: 38.437, lng: 27.143 })),
}));
jest.mock('@/lib/directions', () => ({ openDirections: jest.fn(async () => 'opened') }));
jest.mock('@/data/useParkings', () => ({ useParkings: () => ({ data: undefined }) }));
// Reanimated needs the native worklets runtime: static stand-ins are enough here.
jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  return {
    __esModule: true,
    default: { View },
    Easing: { out: () => 0, inOut: () => 0, ease: 0, linear: 0 },
    useReducedMotion: () => true,
    useSharedValue: (v: number) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withRepeat: (v: unknown) => v,
    withSequence: (v: unknown) => v,
    withTiming: (v: unknown) => v,
    withDelay: (_d: number, v: unknown) => v,
  };
});

const mockOpen = openDirections as jest.Mock;
const WAIT = { timeout: 5000 };
jest.setTimeout(30_000);
const mockAlert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

beforeEach(() => {
  jest.clearAllMocks();
  setActiveCity('izmir');
  useApp.setState({ city: 'izmir' });
});

/** Types a message and waits for Yerim's cards: their "Yol tarifi" buttons. */
async function ask(text: string) {
  await render(<ChatScreen />);
  await fireEvent.changeText(screen.getByLabelText(tr.chat.placeholder), text);
  await fireEvent.press(screen.getByLabelText(tr.chat.send));
  return screen.findAllByText(tr.chat.directions, {}, WAIT);
}

describe('"Yol tarifi" in the chat', () => {
  it('on a food card without a parking ask: asks first, opens nothing', async () => {
    const buttons = await ask('Bornova köfteci');
    // The cards are about food: no car park line.
    expect(screen.queryByText(tr.chat.noParkNear)).toBeNull();
    expect(screen.queryByText(/yakınında otopark/)).toBeNull();
    expect(screen.queryByText(/^\d+ m · /)).toBeNull();
    await fireEvent.press(buttons[0]!);
    expect(await screen.findByText(/Arabayla mı gidiyorsun\?/, {}, WAIT)).toBeTruthy();
    expect(screen.getByText(tr.chat.parkAskYes)).toBeTruthy();
    expect(screen.getByText(tr.chat.parkAskNo)).toBeTruthy();
    expect(mockOpen).not.toHaveBeenCalled();
  });

  it('Hayır, yol tarifini aç: the map app opens for the restaurant', async () => {
    const buttons = await ask('Bornova köfteci');
    await fireEvent.press(buttons[0]!);
    const question = await screen.findByText(/Arabayla mı gidiyorsun\?/, {}, WAIT);
    const name = /^Arabayla mı gidiyorsun\? (.*) yakınındaki/.exec(
      String(question.props.children),
    )![1];
    await fireEvent.press(screen.getByText(tr.chat.parkAskNo));
    await waitFor(() => expect(mockOpen).toHaveBeenCalledTimes(1), WAIT);
    expect(mockOpen).toHaveBeenCalledWith(
      { lat: expect.any(Number), lng: expect.any(Number) },
      name,
    );
    expect(await screen.findByText(/yolculuklar/i, {}, WAIT)).toBeTruthy();
    expect(mockAlert).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('Evet, otopark göster: car parks near the restaurant, nothing opened yet', async () => {
    const buttons = await ask('Bornova köfteci');
    await fireEvent.press(buttons[0]!);
    await fireEvent.press(await screen.findByText(tr.chat.parkAskYes, {}, WAIT));
    expect(await screen.findByText(/\d+ otopark/, {}, WAIT)).toBeTruthy();
    expect(mockOpen).not.toHaveBeenCalled();
    // A car park card's "Yol tarifi" opens its directions at once.
    const carParkButtons = await screen.findAllByText(tr.chat.directions, {}, WAIT);
    await fireEvent.press(carParkButtons[carParkButtons.length - 1]!);
    await waitFor(() => expect(mockOpen).toHaveBeenCalledTimes(1), WAIT);
  });

  it('on a food card of a parking ask: directions open at once, no question', async () => {
    const buttons = await ask('Bornova otoparklı köfteci');
    await fireEvent.press(buttons[0]!);
    await waitFor(() => expect(mockOpen).toHaveBeenCalledTimes(1), WAIT);
    expect(screen.queryByText(/Arabayla mı gidiyorsun\?/)).toBeNull();
  });
});

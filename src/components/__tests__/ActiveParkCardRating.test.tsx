import '@/i18n';

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

import { ActiveParkCard } from '@/components/ActiveParkCard';
import { maybeAskForRating } from '@/lib/rating';
import { useApp, type ActivePark } from '@/store/app';

jest.mock('@/lib/reminders', () => ({
  REMINDER_CHOICES: [30, 60, 120, 180],
  scheduleParkReminder: jest.fn(),
}));
jest.mock('@/lib/parkHere', () => ({ backToCar: jest.fn() }));
jest.mock('@/lib/rating', () => ({ maybeAskForRating: jest.fn(async () => {}) }));

const parkStarted = (minutesAgo: number): ActivePark => ({
  parkingId: 'no-tariff-id',
  name: 'Alsancak Katlı',
  lat: 38.437,
  lng: 27.142,
  startedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  hourly: null,
});

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  useApp.setState({ active: null, parksDone: 0, ratingAskedAt: null });
});

afterEach(() => {
  jest.useRealTimers();
});

async function pressEndAndConfirm() {
  await fireEvent.press(screen.getByRole('button', { name: 'Parkı bitir' }));
  const buttons = alertSpy.mock.calls[0]![2] as AlertButton[];
  await act(async () => {
    buttons.find((b) => b.style === 'destructive')!.onPress!();
  });
}

describe('ending a park counts for the rating prompt', () => {
  it('counts a park of 10 minutes or more and asks after a short delay', async () => {
    const active = parkStarted(15);
    useApp.setState({ active });
    await render(<ActiveParkCard active={active} />);
    await pressEndAndConfirm();
    expect(useApp.getState().active).toBeNull();
    expect(useApp.getState().parksDone).toBe(1);
    expect(maybeAskForRating).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    expect(maybeAskForRating).toHaveBeenCalledTimes(1);
  });

  it('does not count a park shorter than 10 minutes', async () => {
    const active = parkStarted(5);
    useApp.setState({ active });
    await render(<ActiveParkCard active={active} />);
    await pressEndAndConfirm();
    expect(useApp.getState().active).toBeNull();
    expect(useApp.getState().parksDone).toBe(0);
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(maybeAskForRating).not.toHaveBeenCalled();
  });

  it('does not count the undo', async () => {
    const active = parkStarted(2);
    useApp.setState({ active });
    await render(<ActiveParkCard active={active} />);
    await fireEvent.press(screen.getByRole('button', { name: 'Yanlışlıkla mı? Geri al' }));
    expect(useApp.getState().active).toBeNull();
    expect(useApp.getState().parksDone).toBe(0);
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(maybeAskForRating).not.toHaveBeenCalled();
  });
});

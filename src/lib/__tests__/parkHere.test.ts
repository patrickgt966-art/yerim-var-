import * as Notifications from 'expo-notifications';
import { Alert } from 'react-native';

import type { Parking } from '@/data/types';
import { useApp } from '@/store/app';

import { openDirections } from '../directions';
import { parkedHere, parkHere } from '../parkHere';

// Hoisted above the imports by jest.
jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DATE: 'date' },
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
}));
jest.mock('../directions', () => ({ openDirections: jest.fn(async () => 'opened') }));

const N = Notifications as unknown as Record<string, jest.Mock>;
const p = { id: 'ispark-1', name: 'Kadıköy Katlı', lat: 40.99, lng: 29.03 } as Parking;
const other = { id: 'old', name: 'Eski', lat: 40.9, lng: 29.0 } as Parking;
const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  jest.clearAllMocks();
  useApp.setState({ active: null, lastReminderMin: null });
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  N.scheduleNotificationAsync!.mockResolvedValueOnce('main').mockResolvedValueOnce('early');
});
afterEach(() => jest.restoreAllMocks());

describe('parkHere', () => {
  it('starts the timer and opens drive directions without asking', () => {
    parkHere(p);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(useApp.getState().active?.parkingId).toBe('ispark-1');
    expect(openDirections).toHaveBeenCalledWith(p, 'Kadıköy Katlı', 'drive');
  });

  it('keeps the destination of a restaurant visit', () => {
    const destination = { kind: 'restaurant', id: 'r1', name: 'Balık', lat: 40.99, lng: 29.04 };
    parkHere(p, destination as never);
    expect(useApp.getState().active?.destination).toEqual(destination);
  });

  it('only opens directions when the same car park is already running', () => {
    useApp.setState({ lastReminderMin: null });
    parkHere(p, { kind: 'restaurant', id: 'r1', name: 'Balık', lat: 40.99, lng: 29.04 });
    useApp.getState().setParkReminder({ id: 'n', at: '2026-10-17T13:00:00.000Z' });
    const before = useApp.getState().active;
    jest.mocked(openDirections).mockClear();
    parkHere(p);
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(useApp.getState().active).toBe(before);
    expect(useApp.getState().active?.reminder?.id).toBe('n');
    expect(useApp.getState().active?.destination?.id).toBe('r1');
    expect(openDirections).toHaveBeenCalledTimes(1);
    expect(openDirections).toHaveBeenCalledWith(p, 'Kadıköy Katlı', 'drive');
  });

  it('asks once before replacing a different running park', () => {
    parkHere(other);
    jest.mocked(openDirections).mockClear();
    parkHere(p);
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(useApp.getState().active?.parkingId).toBe('old');
    expect(openDirections).not.toHaveBeenCalled();
    const buttons = jest.mocked(Alert.alert).mock.calls[0]?.[2] ?? [];
    expect(buttons).toHaveLength(2);
    buttons[0]?.onPress?.();
    expect(useApp.getState().active?.parkingId).toBe('ispark-1');
    expect(openDirections).toHaveBeenCalledWith(p, 'Kadıköy Katlı', 'drive');
  });

  it('cancelling the replace question changes nothing', () => {
    parkHere(other);
    jest.mocked(openDirections).mockClear();
    parkHere(p);
    const buttons = jest.mocked(Alert.alert).mock.calls[0]?.[2] ?? [];
    buttons[1]?.onPress?.();
    expect(useApp.getState().active?.parkingId).toBe('old');
    expect(openDirections).not.toHaveBeenCalled();
  });

  it('tells the user when the map app cannot open', async () => {
    jest.mocked(openDirections).mockResolvedValueOnce('failed');
    parkHere(p);
    await flush();
    expect(Alert.alert).toHaveBeenCalledWith(expect.stringContaining('Haritalar'));
  });
});

describe('the automatic reminder of a new park', () => {
  it('is scheduled and stored when a length was chosen before and notifications are allowed', async () => {
    useApp.setState({ lastReminderMin: 60 });
    N.getPermissionsAsync!.mockResolvedValue({ granted: true });
    parkedHere(p);
    await flush();
    expect(N.scheduleNotificationAsync).toHaveBeenCalledTimes(2);
    expect(useApp.getState().active?.reminder).toEqual(
      expect.objectContaining({ id: 'main', earlyId: 'early' }),
    );
  });

  it('is skipped, without asking, when notifications are not allowed', async () => {
    useApp.setState({ lastReminderMin: 60 });
    N.getPermissionsAsync!.mockResolvedValue({ granted: false, canAskAgain: true });
    parkedHere(p);
    await flush();
    expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(useApp.getState().active?.reminder).toBeUndefined();
  });

  it('is skipped when no length was ever chosen', async () => {
    N.getPermissionsAsync!.mockResolvedValue({ granted: true });
    parkedHere(p);
    await flush();
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('is cancelled again when the park ended in the meantime', async () => {
    useApp.setState({ lastReminderMin: 30 });
    N.getPermissionsAsync!.mockResolvedValue({ granted: true });
    parkedHere(p);
    useApp.getState().endPark();
    await flush();
    expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith('main');
    expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledWith('early');
  });
});

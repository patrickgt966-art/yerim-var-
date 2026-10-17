import * as Notifications from 'expo-notifications';

import { cancelParkReminder, scheduleParkReminder } from '@/lib/reminders';

import { useApp, type ActivePark } from '../app';
import { migrateAppState } from '../migrate';

// Hoisted above the imports by jest.
jest.mock('expo-notifications', () => ({
  SchedulableTriggerInputTypes: { DATE: 'date' },
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(async () => 'notif-1'),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
}));

const N = Notifications as unknown as Record<string, jest.Mock>;
const park: ActivePark = {
  parkingId: 'p1',
  name: 'Konak Otoparkı',
  startedAt: new Date().toISOString(),
  hourly: 40,
  lat: 38.4,
  lng: 27.1,
};

beforeEach(() => {
  jest.clearAllMocks();
  useApp.setState({ active: null });
});

describe('scheduleParkReminder', () => {
  const text = { title: 'T', body: 'B' };
  const now = new Date('2026-10-17T12:00:00Z');

  it('asks once, then schedules a dated notification', async () => {
    N.getPermissionsAsync!.mockResolvedValue({ granted: false, canAskAgain: true });
    N.requestPermissionsAsync!.mockResolvedValue({ granted: true });
    const r = await scheduleParkReminder(60, text, now);
    expect(r).toEqual({ id: 'notif-1', at: '2026-10-17T13:00:00.000Z' });
    expect(N.scheduleNotificationAsync).toHaveBeenCalledWith({
      content: { title: 'T', body: 'B', sound: true },
      trigger: { type: 'date', date: new Date('2026-10-17T13:00:00Z') },
    });
  });

  it('gives null when notifications are not allowed', async () => {
    N.getPermissionsAsync!.mockResolvedValue({ granted: false, canAskAgain: false });
    expect(await scheduleParkReminder(30, text, now)).toBeNull();
    expect(N.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('cancels quietly, even one that is gone', async () => {
    N.cancelScheduledNotificationAsync!.mockRejectedValueOnce(new Error('gone'));
    await expect(cancelParkReminder('x')).resolves.toBeUndefined();
    await cancelParkReminder(undefined);
    expect(N.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
  });
});

describe('the park reminder in the store', () => {
  it('is set and cleared on the running park only', () => {
    useApp.getState().setParkReminder({ id: 'n', at: '2026-10-17T13:00:00Z' });
    expect(useApp.getState().active).toBeNull();
    useApp.getState().startPark(park);
    useApp.getState().setParkReminder({ id: 'n', at: '2026-10-17T13:00:00Z' });
    expect(useApp.getState().active?.reminder).toEqual({ id: 'n', at: '2026-10-17T13:00:00Z' });
    useApp.getState().setParkReminder(null);
    expect(useApp.getState().active).not.toHaveProperty('reminder');
  });

  it('drops a broken stored reminder and keeps a good one', () => {
    const load = (reminder: unknown) =>
      (migrateAppState({ active: { ...park, reminder } }, 3) as { active: ActivePark }).active;
    expect(load({ id: 'n', at: '2026-10-17T13:00:00Z' }).reminder?.id).toBe('n');
    expect(load({ id: 3 })).not.toHaveProperty('reminder');
    expect(load('x')).not.toHaveProperty('reminder');
  });
});

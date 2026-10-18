import * as Notifications from 'expo-notifications';

import { useApp, type ActivePark } from '@/store/app';

import { openDirections } from '../directions';
import { handleParkResponse, listenParkNotifications } from '../parkNotifications';

// Hoisted above the imports by jest.
jest.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  SchedulableTriggerInputTypes: { DATE: 'date' },
  setNotificationHandler: jest.fn(),
  setNotificationCategoryAsync: jest.fn(async () => ({})),
  getPermissionsAsync: jest.fn(async () => ({ granted: true })),
  requestPermissionsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(async () => 'next'),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  addNotificationResponseReceivedListener: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(async () => null),
}));
jest.mock('../directions', () => ({ openDirections: jest.fn(async () => 'opened') }));

const N = Notifications as unknown as Record<string, jest.Mock>;
const park: ActivePark = {
  parkingId: 'p1',
  name: 'Konak Otoparkı',
  startedAt: new Date().toISOString(),
  hourly: null,
  lat: 38.4,
  lng: 27.1,
};

let seq = 0;
/** A response to a notification with a fresh identifier, unless one is given. */
const response = (action: string, data: Record<string, unknown> = { kind: 'park' }, id?: string) =>
  ({
    actionIdentifier: action,
    notification: { request: { identifier: id ?? `n${++seq}`, content: { data } } },
  }) as unknown as Notifications.NotificationResponse;

const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeAll(async () => {
  await useApp.persist.rehydrate();
});

beforeEach(() => {
  jest.clearAllMocks();
  useApp.setState({ active: park });
});

describe('handleParkResponse', () => {
  it('"Yol tarifi" opens walking directions to the running park', () => {
    handleParkResponse(response('walk'));
    expect(openDirections).toHaveBeenCalledWith(
      expect.objectContaining({ lat: 38.4, lng: 27.1 }),
      'Konak Otoparkı',
      'walk',
    );
  });

  it('does nothing for "Yol tarifi" when no park is running', () => {
    useApp.setState({ active: null });
    handleParkResponse(response('walk'));
    expect(openDirections).not.toHaveBeenCalled();
  });

  it('"15 dk uzat" schedules a reminder 15 minutes from now and stores it', async () => {
    const before = Date.now();
    handleParkResponse(response('extend'));
    await flush();
    expect(N.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    const reminder = useApp.getState().active?.reminder;
    expect(reminder?.id).toBe('next');
    expect(reminder?.earlyId).toBeUndefined();
    const at = new Date(reminder!.at).getTime();
    expect(at).toBeGreaterThanOrEqual(before + 15 * 60_000);
    expect(at).toBeLessThan(Date.now() + 15 * 60_000 + 1);
  });

  it('ignores notifications of other kinds', async () => {
    handleParkResponse(response('walk', { kind: 'other' }));
    handleParkResponse(response('extend', {}));
    await flush();
    expect(openDirections).not.toHaveBeenCalled();
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('handles the same response once, however often it arrives', async () => {
    handleParkResponse(response('extend', { kind: 'park' }, 'same'));
    handleParkResponse(response('extend', { kind: 'park' }, 'same'));
    await flush();
    expect(N.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
  });

  it('a plain tap does nothing extra', async () => {
    handleParkResponse(response(Notifications.DEFAULT_ACTION_IDENTIFIER));
    await flush();
    expect(openDirections).not.toHaveBeenCalled();
    expect(N.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe('listenParkNotifications', () => {
  it('listens once and reads the response that launched the app', async () => {
    N.getLastNotificationResponseAsync!.mockResolvedValueOnce(response('walk'));
    listenParkNotifications();
    listenParkNotifications();
    await flush();
    expect(N.addNotificationResponseReceivedListener).toHaveBeenCalledTimes(1);
    expect(N.addNotificationResponseReceivedListener).toHaveBeenCalledWith(handleParkResponse);
    expect(N.getLastNotificationResponseAsync).toHaveBeenCalledTimes(1);
    expect(openDirections).toHaveBeenCalledTimes(1);
  });
});

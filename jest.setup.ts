// Tests read the Turkish UI unless they switch the language themselves; the jest-expo mock of
// expo-localization says en-US.
jest.mock('expo-localization', () => ({
  ...jest.requireActual('expo-localization'),
  getLocales: () => [{ languageTag: 'tr-TR', languageCode: 'tr', regionCode: 'TR' }],
}));

// parkHere pulls in the reminders; keep the real native module (and its Expo Go warning) out of
// tests. Tests that check notifications mock it themselves.
jest.mock('expo-notifications', () => ({
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  SchedulableTriggerInputTypes: { DATE: 'date' },
  setNotificationHandler: jest.fn(),
  setNotificationCategoryAsync: jest.fn(async () => ({})),
  addNotificationResponseReceivedListener: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ granted: false, canAskAgain: false })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: false })),
  scheduleNotificationAsync: jest.fn(async () => 'notification-id'),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
}));

// Haptics are a native module; tests that care about them spy on `feel` instead.
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(async () => {}),
  selectionAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

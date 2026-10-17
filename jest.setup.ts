// Tests read the Turkish UI unless they switch the language themselves; the jest-expo mock of
// expo-localization says en-US.
jest.mock('expo-localization', () => ({
  ...jest.requireActual('expo-localization'),
  getLocales: () => [{ languageTag: 'tr-TR', languageCode: 'tr', regionCode: 'TR' }],
}));

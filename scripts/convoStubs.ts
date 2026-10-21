// Lets the convo eval import the chat assistant (src/data/assistant.ts) under plain Node. Import
// this file first. It answers `require` of the three native-only packages the assistant's import
// graph names with small stand-ins: react-native (not used by the assistant itself), expo-localization
// (the device language, Turkish here) and AsyncStorage (the report store; nothing is persisted).
// The app code itself is not touched.
import Module from 'node:module';

type Loader = { _load: (request: string, ...rest: unknown[]) => unknown };
const loader = Module as unknown as Loader;
const original = loader._load;

const memory = {
  getItem: async () => null,
  setItem: async () => {},
  removeItem: async () => {},
};

loader._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === 'react-native')
    return { Share: { share: async () => ({}) }, Platform: { OS: 'ios' } };
  if (request === 'expo-localization') return { getLocales: () => [{ languageCode: 'tr' }] };
  if (request === '@react-native-async-storage/async-storage') {
    return { __esModule: true, default: memory };
  }
  return original.call(this, request, ...rest);
};

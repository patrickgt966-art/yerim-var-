// Lets the build script import app modules that name React Native (src/lib/share.ts uses `Share`)
// under plain Node. Import this file first. It only answers `require('react-native')` with an
// empty stand-in; the app code itself is not touched.
import Module from 'node:module';

type Loader = { _load: (request: string, ...rest: unknown[]) => unknown };
const loader = Module as unknown as Loader;
const original = loader._load;

loader._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === 'react-native') return { Share: { share: async () => ({}) } };
  return original.call(this, request, ...rest);
};

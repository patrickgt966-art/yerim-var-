import { Keyframe } from 'react-native-reanimated';

/**
 * Yerim's way of arriving: a springy hop. It drops in stretched, lands squashed, bounces a little
 * and settles. Used wherever the mascot appears; callers skip it when reduce-motion is on.
 */
export const HOP_IN = new Keyframe({
  0: { opacity: 0, transform: [{ translateY: -28 }, { scaleX: 0.9 }, { scaleY: 1.12 }] },
  45: { opacity: 1, transform: [{ translateY: 0 }, { scaleX: 1.14 }, { scaleY: 0.84 }] },
  75: { opacity: 1, transform: [{ translateY: -4 }, { scaleX: 0.97 }, { scaleY: 1.04 }] },
  100: { opacity: 1, transform: [{ translateY: 0 }, { scaleX: 1 }, { scaleY: 1 }] },
}).duration(520);

// Small touches you can feel when Yerim moves: one helper, so every place uses the same three
// kinds and a phone without haptics (or the web) simply feels nothing.
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export type Feel =
  /** Yerim lands somewhere: a light tap. */
  | 'land'
  /** Something opens or a step changes: the lightest tick. */
  | 'tick'
  /** The user took Yerim up on something. */
  | 'yes';

export function feel(kind: Feel): void {
  if (Platform.OS === 'web') return;
  const run =
    kind === 'land'
      ? () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      : kind === 'tick'
        ? () => Haptics.selectionAsync()
        : () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  try {
    void run().catch(() => {});
  } catch {
    // No haptics engine: nothing to feel.
  }
}

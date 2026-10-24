import type { BottomSheetBackgroundProps } from '@gorhom/bottom-sheet';
import { View } from 'react-native';

import { useColors } from '@/theme';

import { Paper } from './Paper';

/** Bottom sheet background: warm paper with its faint dots, the same rounded top as before. */
export function PaperSheet({ style }: BottomSheetBackgroundProps) {
  const c = useColors();
  return (
    <View
      pointerEvents="none"
      style={[
        style,
        {
          backgroundColor: c.bg,
          borderTopLeftRadius: 32,
          borderTopRightRadius: 32,
          overflow: 'hidden',
        },
      ]}
    >
      <Paper />
    </View>
  );
}

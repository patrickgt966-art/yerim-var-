import { View, type ViewProps } from 'react-native';

import { Txt } from '@/components/Txt';
import { asym, brand } from '@/theme';

import { MascotFace } from './Mascot';

/**
 * A line said by Yerim: its small orange tile with a face that fits the news, then the text.
 * Used where something is off (no internet, no live counts), so the app explains itself in
 * Yerim's voice instead of a bare warning.
 */
export function YerimNote({
  text,
  eyes = 'open',
  bg,
  fg,
  ...rest
}: {
  text: string;
  eyes?: 'open' | 'sad' | 'up';
  bg: string;
  fg: string;
} & Pick<ViewProps, 'accessibilityRole'>) {
  return (
    <View
      {...rest}
      style={[
        asym(14, 4),
        { backgroundColor: bg, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
      ]}
    >
      <View
        style={[
          asym(11, 3),
          {
            width: 32,
            height: 32,
            backgroundColor: brand.orange,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{ rotate: '-4deg' }],
          },
        ]}
      >
        <MascotFace size={22} eyes={eyes} />
      </View>
      <Txt variant="caption" color={fg} style={{ flex: 1 }}>
        {text}
      </Txt>
    </View>
  );
}

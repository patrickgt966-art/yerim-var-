import { View } from 'react-native';

import { Mascot, type MascotPose } from '@/components/mascot/Mascot';
import { Txt } from '@/components/Txt';
import { asym, useColors } from '@/theme';

/** Yerim standing at the edge of a screen with a short line in a speech bubble. */
export function MascotSays({
  text,
  pose = { eyes: 'happy', mouth: 'smile' },
  size = 88,
}: {
  text: string;
  pose?: MascotPose;
  size?: number;
}) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4 }}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Mascot size={size} {...pose} />
      </View>
      <View
        style={[
          asym(18, 5),
          {
            flex: 1,
            marginBottom: size * 0.22,
            paddingVertical: 9,
            paddingHorizontal: 12,
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: c.peachLine,
            shadowColor: '#0B3C49',
            shadowOpacity: 0.12,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 6 },
            elevation: 2,
          },
        ]}
      >
        <Txt style={{ fontSize: 13, lineHeight: 18 }}>{text}</Txt>
      </View>
    </View>
  );
}

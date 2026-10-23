import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Txt } from '@/components/Txt';
import { brand, fonts, useColors } from '@/theme';

/** A hand-drawn underline: one loose stroke, a little uneven. */
export function Squiggle({
  width,
  color = brand.orange,
}: {
  width: number | `${number}%`;
  color?: string;
}) {
  return (
    <Svg width={width} height={10} viewBox="0 0 120 10" preserveAspectRatio="none">
      <Path
        d="M3 7c18-4 36-5 56-2s38 2 58-3"
        fill="none"
        stroke={color}
        strokeWidth={3.6}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/**
 * A hand-written note (Caveat), a little tilted: greetings, small asides. Used sparingly, so it
 * reads like someone wrote it. Accessible as plain text.
 */
export function HandNote({
  children,
  size = 20,
  color,
  tilt = -2,
  underline,
}: {
  children: ReactNode;
  size?: number;
  color?: string;
  tilt?: number;
  /** Width of a hand-drawn underline under it. */
  underline?: number;
}) {
  const c = useColors();
  return (
    <View style={{ alignSelf: 'flex-start', transform: [{ rotate: `${tilt}deg` }] }}>
      <Txt
        maxFontSizeMultiplier={1.4}
        style={{ fontFamily: fonts.hand, fontSize: size, lineHeight: size * 1.15 }}
        color={color ?? c.accentStrong}
      >
        {children}
      </Txt>
      {underline ? (
        <View style={{ marginTop: -3 }} accessibilityElementsHidden>
          <Squiggle width={underline} />
        </View>
      ) : null}
    </View>
  );
}

/** Under the chosen text tab: the hand-drawn underline instead of a ruler-straight bar. */
export function TabSquiggle({ on }: { on: boolean }) {
  if (!on) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 5, right: 5, bottom: 2 }}>
      <Squiggle width="100%" />
    </View>
  );
}

/** Greeting for the hour: 05-11 Günaydın, 11-17 İyi günler, 17-22 İyi akşamlar, else İyi geceler. */
export function greetingKey(hour: number): 'morning' | 'day' | 'evening' | 'night' {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'day';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Txt } from '@/components/Txt';
import { brand, fonts, HIT, useColors } from '@/theme';

/** Small caps-style group title ("KISAYOLLAR"), announced as a header. */
export function SectionTitle({ text, right }: { text: string; right?: ReactNode }) {
  return (
    <View
      style={{
        paddingTop: 18,
        paddingBottom: 8,
        paddingHorizontal: 20,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <Txt
        accessibilityRole="header"
        secondary
        style={{
          fontFamily: fonts.bodyExtraBold,
          fontSize: 13,
          lineHeight: 18,
          letterSpacing: 0.3,
        }}
      >
        {text}
      </Txt>
      {right}
    </View>
  );
}

/** White rounded block that holds a list of rows. */
export function Group({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <View
      style={{
        marginHorizontal: 16,
        backgroundColor: c.card,
        borderRadius: 20,
        overflow: 'hidden',
      }}
    >
      {children}
    </View>
  );
}

/** Square icon holder at the start of a row. */
export function Tile({ bg, children }: { bg: string; children: ReactNode }) {
  return (
    <View
      style={{
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </View>
  );
}

export function Row({
  icon,
  title,
  subtitle,
  trailing,
  onPress,
  label,
  first,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  onPress: () => void;
  label: string;
  first: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 56,
        paddingVertical: 8,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: c.surface,
        backgroundColor: pressed ? c.surface : c.card,
      })}
    >
      {icon}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt
          numberOfLines={2}
          style={{ fontFamily: fonts.bodyExtraBold, fontSize: 14, lineHeight: 19 }}
        >
          {title}
        </Txt>
        {!!subtitle && (
          <Txt secondary numberOfLines={2} style={{ fontSize: 12, lineHeight: 16 }}>
            {subtitle}
          </Txt>
        )}
      </View>
      {trailing}
    </Pressable>
  );
}

/** Pill-shaped suggestion; 36pt tall with a hit area that reaches the 44pt minimum. */
export function SuggestionChip({
  label,
  bg,
  onPress,
  selected,
}: {
  label: string;
  bg: string;
  onPress: () => void;
  /** Set for a choice among several: marks it for screen readers and outlines the chosen one. */
  selected?: boolean;
}) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      hitSlop={{ top: (HIT - 36) / 2, bottom: (HIT - 36) / 2 }}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 36,
        paddingHorizontal: 12,
        borderRadius: 18,
        justifyContent: 'center',
        backgroundColor: bg,
        opacity: pressed ? 0.7 : 1,
        ...(selected === undefined
          ? null
          : { borderWidth: 1.5, borderColor: selected ? brand.orangeLight : 'transparent' }),
      })}
    >
      <Txt
        style={{
          fontFamily: selected ? fonts.bodyExtraBold : fonts.bodyBold,
          fontSize: 13,
          lineHeight: 18,
        }}
        color={c.text}
      >
        {label}
      </Txt>
    </Pressable>
  );
}

export function ChipWrap({ children }: { children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16 }}>
      {children}
    </View>
  );
}

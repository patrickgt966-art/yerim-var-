import { Pressable, View } from 'react-native';

import { Txt } from '@/components/Txt';
import { fonts, HIT, useColors } from '@/theme';

import { TabSquiggle } from './Hand';

/** Text tabs; the chosen one gets a hand-drawn underline (Home "Hepsi / Otopark / Yemek"). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
  /** Spoken name of the whole group. */
  label: string;
}) {
  const c = useColors();
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', gap: 4 }}
    >
      {options.map((o) => {
        const selected = value === o.id;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.id)}
            style={{ minHeight: HIT, paddingHorizontal: 10, justifyContent: 'center' }}
          >
            <Txt
              style={{
                fontFamily: selected ? fonts.bodyExtraBold : fonts.body,
                fontSize: 14,
                lineHeight: 19,
              }}
              color={selected ? c.text : c.textSecondary}
            >
              {o.label}
            </Txt>
            <TabSquiggle on={selected} />
          </Pressable>
        );
      })}
    </View>
  );
}

import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { asym, brand, useColors } from '@/theme';

import { Dashes } from './Dashes';

/** mint = car park, peach = food, plain = everything else. */
export type TicketTone = 'plain' | 'mint' | 'peach';

/** A list card as a rounded paper ticket: soft surface, thin edge, a little lift. */
export function TicketCard({
  tone = 'plain',
  children,
  style,
}: {
  tone?: TicketTone;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useColors();
  const bg = tone === 'mint' ? c.mintSoft : tone === 'peach' ? c.peachSoft : c.card;
  const edge = tone === 'peach' ? c.peachLine : c.line;
  return (
    <View
      style={[
        asym(22, 6),
        {
          backgroundColor: bg,
          borderWidth: 1,
          borderColor: edge,
          shadowColor: brand.navy,
          shadowOpacity: 0.06,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 2 },
          elevation: 1,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** The dashed tear line between the parts of a ticket. */
export function TicketDivider({ inset = 14 }: { inset?: number }) {
  const c = useColors();
  return (
    <View pointerEvents="none" style={{ marginHorizontal: inset }}>
      <Dashes color={c.rowDash} />
    </View>
  );
}

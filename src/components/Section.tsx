import type { ReactNode } from 'react';
import { View } from 'react-native';

import { asym, useColors } from '@/theme';

import { Txt } from './Txt';

export function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  const c = useColors();
  return (
    <View
      style={[
        asym(22, 6),
        { backgroundColor: c.card, borderWidth: 1, borderColor: c.line, padding: 16, gap: 10 },
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexWrap: 'wrap',
        }}
      >
        <Txt variant="bodyBold" accessibilityRole="header" style={{ fontSize: 16 }}>
          {title}
        </Txt>
        {right}
      </View>
      {children}
    </View>
  );
}

export function Row({ label, value }: { label: string; value: string }) {
  return (
    <View
      style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}
    >
      <Txt secondary>{label}</Txt>
      <Txt variant="bodyBold">{value}</Txt>
    </View>
  );
}

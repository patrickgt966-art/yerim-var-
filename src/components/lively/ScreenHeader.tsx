import type { ReactNode } from 'react';
import { View } from 'react-native';

import { ScreenHeader } from '@/components/ScreenHeader';

import { HandNote } from './Hand';

/** Screen title with a hand-written line under it ("sevdiğin yerler burada" style). */
export function LiveHeader({
  title,
  note,
  back,
  right,
}: {
  title: string;
  note?: string;
  back?: boolean;
  right?: ReactNode;
}) {
  return (
    <View>
      <ScreenHeader title={title} back={back} right={right} />
      {!!note && <HandNote size={21}>{note}</HandNote>}
    </View>
  );
}

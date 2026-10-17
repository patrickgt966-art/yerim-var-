import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/Icon';
import { Txt } from '@/components/Txt';
import { fonts, HIT, useColors } from '@/theme';

import { YAvatar } from './YAvatar';

/** Paper header: back, Y tile, title + green status line, and an optional right-hand pill. */
export function ChatHeader({ top, right }: { top: number; right?: ReactNode }) {
  const c = useColors();
  const { t } = useTranslation();
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingTop: top,
          paddingBottom: 10,
          paddingLeft: 8,
          paddingRight: 12,
          backgroundColor: c.bg,
          borderBottomWidth: 1,
          borderBottomColor: c.chipBg,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
        style={{ width: HIT, height: HIT, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name="back" size={22} color={c.text} strokeWidth={2.4} />
      </Pressable>
      <YAvatar size={36} />
      <View
        accessible
        accessibilityRole="header"
        accessibilityLabel={`${t('chat.title')}, ${t('chat.status')}`}
        style={{ flex: 1, marginLeft: 4 }}
      >
        <Txt
          accessible={false}
          style={{ fontFamily: fonts.display, fontSize: 17, lineHeight: 22 }}
          numberOfLines={1}
        >
          {t('chat.title')}
        </Txt>
        <Txt
          accessible={false}
          color={c.badgeFreshText}
          style={{ fontFamily: fonts.bodyBold, fontSize: 12, lineHeight: 16 }}
          numberOfLines={1}
        >
          {'● ' + t('chat.status')}
        </Txt>
      </View>
      {right}
    </View>
  );
}

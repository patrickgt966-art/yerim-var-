import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { HIT, useColors } from '@/theme';

import { Icon } from './Icon';
import { Txt } from './Txt';

export function ScreenHeader({
  title,
  back,
  right,
}: {
  title: string;
  back?: boolean;
  right?: ReactNode;
}) {
  const c = useColors();
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: HIT }}>
      {back && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          style={{
            width: HIT,
            height: HIT,
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: -10,
          }}
        >
          <Icon name="back" size={22} color={c.text} strokeWidth={2.2} />
        </Pressable>
      )}
      <Txt
        variant="title"
        accessibilityRole="header"
        style={{ flex: 1, fontSize: 26, lineHeight: 32 }}
      >
        {title}
      </Txt>
      {right}
    </View>
  );
}

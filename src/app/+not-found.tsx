import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/Button';
import { Txt } from '@/components/Txt';
import { fonts, useColors } from '@/theme';

/** Shown for unknown links, e.g. an old or mistyped deep link. */
export default function NotFound() {
  const c = useColors();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: c.bg,
        paddingTop: insets.top + 24,
        paddingHorizontal: 20,
        gap: 14,
        justifyContent: 'center',
      }}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <Txt accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 24 }}>
        {t('notFound.title')}
      </Txt>
      <Txt secondary>{t('notFound.body')}</Txt>
      <Button label={t('notFound.home')} onPress={() => router.replace('/')} />
    </View>
  );
}

import type { ErrorBoundaryProps } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { reportError } from '@/lib/crashReport';
import { brand } from '@/theme';

/**
 * The root layout's error screen: a short message and "Tekrar dene". Plain views and the fixed
 * brand colours only, so it still draws when the error came from the theme or a store. The error
 * is reported once (see reportError).
 */
export function RootErrorBoundary({ retry, error }: ErrorBoundaryProps) {
  const { t } = useTranslation();
  useEffect(() => reportError(error, false), [error]);
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
        backgroundColor: brand.paper,
      }}
    >
      <Text style={{ color: brand.navy, fontSize: 18, fontWeight: '700', textAlign: 'center' }}>
        {t('common.errorTitle')}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => void retry()}
        style={{
          minHeight: 48,
          paddingHorizontal: 24,
          borderRadius: 24,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: brand.orange,
        }}
      >
        <Text style={{ color: brand.navy, fontSize: 16, fontWeight: '700' }}>
          {t('common.retry')}
        </Text>
      </Pressable>
    </View>
  );
}

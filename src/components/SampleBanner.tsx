import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { asym, useColors } from '@/theme';

import { Txt } from './Txt';

export function SampleBanner() {
  const c = useColors();
  const { t } = useTranslation();
  return (
    <View
      accessibilityRole="alert"
      style={[asym(14, 4), { backgroundColor: c.warnBg, padding: 10 }]}
    >
      <Txt variant="caption" color={c.warnText}>
        {t('freshness.sampleBanner')}
      </Txt>
    </View>
  );
}

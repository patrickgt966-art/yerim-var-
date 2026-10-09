import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { hasRealTariffs } from '@/data/tariffs';
import { useParkings } from '@/data/useParkings';
import type { ParkMode } from '@/store/app';

import { Chip } from './Chip';

/**
 * "Şimdi" / "2 saat" switch. Hidden while no real car park has a tariff,
 * because the 2 hour estimate would say "Ücretli" for every one of them.
 */
export function ModeChips({ mode, onChange }: { mode: ParkMode; onChange: (m: ParkMode) => void }) {
  const { t } = useTranslation();
  const { data } = useParkings();
  if (!data || !hasRealTariffs(data.parkings)) return null;
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginHorizontal: 16, marginTop: 12 }}>
      <Chip
        label={t('search.now')}
        icon="clock"
        selected={mode === 'now'}
        onPress={() => onChange('now')}
      />
      <Chip
        label={t('search.twoHours')}
        icon="hourglass"
        selected={mode === 'twoHours'}
        onPress={() => onChange('twoHours')}
      />
    </View>
  );
}

import { Linking } from 'react-native';

import type { Parking } from '@/data/types';

export const REPO_URL = 'https://github.com/patrickgt966-art/yerim-var-';

/** Opens a prefilled "fiyat/veri yanlış" issue. No backend in v1. */
export function reportWrongData(p: Parking) {
  const title = `Veri yanlış: ${p.name}`;
  const body = [
    `**Otopark:** ${p.name}`,
    `**Kimlik:** \`${p.id}\``,
    `**Kaynak:** ${p.source}`,
    '',
    '**Ne yanlış?** (fiyat, saat, konum, kapasite…)',
    '',
    '**Doğrusu ne / kaynağın ne?**',
    '',
  ].join('\n');
  const url = `${REPO_URL}/issues/new?template=veri-yanlis.yml&title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
  return Linking.openURL(url);
}

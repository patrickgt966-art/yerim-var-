import { Linking } from 'react-native';

import type { Parking } from '@/data/types';

export const REPO_URL = 'https://github.com/patrickgt966-art/yerim-var-';

/**
 * URL of a prefilled "fiyat/veri yanlış" issue. The template is an issue
 * form (.github/ISSUE_TEMPLATE/veri-yanlis.yml), which ignores `body`;
 * fields are prefilled by their `id` instead.
 */
export function wrongDataIssueUrl(p: Parking) {
  // Built by hand: React Native's URLSearchParams is incomplete.
  const query = Object.entries({
    template: 'veri-yanlis.yml',
    title: `Veri yanlış: ${p.name}`,
    otopark: `${p.name} (${p.id}) · veri kaynağı: ${p.source}`,
  })
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return `${REPO_URL}/issues/new?${query}`;
}

/** Opens the prefilled issue in the browser. No backend in v1. */
export function reportWrongData(p: Parking) {
  return Linking.openURL(wrongDataIssueUrl(p));
}

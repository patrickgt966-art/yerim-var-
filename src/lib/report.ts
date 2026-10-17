import { Linking } from 'react-native';

import type { Restaurant } from '@/data/restaurants';
import type { Parking } from '@/data/types';

export const REPO_URL = 'https://github.com/patrickgt966-art/yerim-var-';

/**
 * URL of a prefilled "fiyat/veri yanlış" issue. The template is an issue
 * form (.github/ISSUE_TEMPLATE/veri-yanlis.yml), which ignores `body`;
 * fields are prefilled by their `id` instead.
 */
export function wrongDataIssueUrl(p: Parking) {
  return issueUrl({
    template: 'veri-yanlis.yml',
    title: `Veri yanlış: ${p.name}`,
    otopark: `${p.name} (${p.id}) · veri kaynağı: ${p.source}`,
  });
}

/** The same for a restaurant (.github/ISSUE_TEMPLATE/restoran-yanlis.yml); the point finds it on the map. */
export function wrongRestaurantIssueUrl(r: Restaurant) {
  return issueUrl({
    template: 'restoran-yanlis.yml',
    title: `Restoran bilgisi yanlış: ${r.name}`,
    restoran: `${r.name} (${r.id}) · veri kaynağı: ${r.source} · ${r.lat.toFixed(5)},${r.lng.toFixed(5)}`,
  });
}

function issueUrl(fields: Record<string, string>) {
  // Built by hand: React Native's URLSearchParams is incomplete.
  const query = Object.entries(fields)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return `${REPO_URL}/issues/new?${query}`;
}

/** Opens the prefilled issue in the browser. No backend in v1. */
export function reportWrongData(p: Parking) {
  return Linking.openURL(wrongDataIssueUrl(p));
}

export function reportWrongRestaurant(r: Restaurant) {
  return Linking.openURL(wrongRestaurantIssueUrl(r));
}

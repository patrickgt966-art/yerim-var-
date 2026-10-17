// Sharing a place or a plan through the system share sheet (WhatsApp, Messages, ...). Only what the
// screen already shows goes out: the public name, the address we hold, and an Apple Maps link.
import type { TFunction } from 'i18next';
import { Share } from 'react-native';

import type { LatLng } from '@/data/geo';

/** An Apple Maps link that opens on any phone (the web map where the Maps app is missing). */
export function mapsLink(p: LatLng, name: string): string {
  return `https://maps.apple.com/?ll=${p.lat},${p.lng}&q=${encodeURIComponent(name)}`;
}

/** "Name · address\nlink\n— Yerim Var" */
export function placeShareText(
  place: LatLng & { name: string; address?: string | null },
  t: TFunction,
): string {
  const head = [place.name, place.address].filter(Boolean).join(' · ');
  return [head, mapsLink(place, place.name), t('share.footer')].join('\n');
}

/** The plan's steps numbered, the reason, and the car park to drive to. */
export function planShareText(
  plan: { steps: string[]; why: string | null; dest: LatLng & { name: string } },
  t: TFunction,
): string {
  return [
    t('chat.planTitle'),
    ...plan.steps.map((s, i) => `${i + 1}. ${s}`),
    ...(plan.why ? [plan.why] : []),
    mapsLink(plan.dest, plan.dest.name),
    t('share.footer'),
  ].join('\n');
}

/** Opens the share sheet; a closed sheet or a failure is not an error to show. */
export async function shareText(message: string): Promise<void> {
  try {
    await Share.share({ message });
  } catch {
    // The user closed the sheet, or sharing is not available.
  }
}

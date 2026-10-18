// Sharing a place or a plan through the system share sheet (WhatsApp, Messages, ...). Only what the
// screen already shows goes out: the public name, the address we hold, and a link to our share page.
import type { TFunction } from 'i18next';
import { Share } from 'react-native';

import type { LatLng } from '@/data/geo';

/** An Apple Maps link that opens on any phone (the web map where the Maps app is missing). */
export function mapsLink(p: LatLng, name: string): string {
  return `https://maps.apple.com/?ll=${p.lat},${p.lng}&q=${encodeURIComponent(name)}`;
}

/** Where shared links point: our own pages (the worker serves them), not a map service. */
export const SHARE_BASE = 'https://yerimvar.app';

/** What a share link carries: 'r' = restaurant, 'p' = car park. */
export type ShareKind = 'r' | 'p';

const round5 = (n: number): string => String(Math.round(n * 1e5) / 1e5);

/** A link to our share page for a place; it carries only the name, location and address. */
export function shareLink(
  kind: ShareKind,
  p: { id: string; name: string; lat: number; lng: number; address?: string | null },
): string {
  const query = [
    `n=${encodeURIComponent(p.name.slice(0, 80))}`,
    `ll=${round5(p.lat)},${round5(p.lng)}`,
    ...(p.address ? [`a=${encodeURIComponent(p.address.slice(0, 100))}`] : []),
  ];
  return `${SHARE_BASE}/${kind}/${encodeURIComponent(p.id)}?${query.join('&')}`;
}

/** "Name · address\nlink\n— Yerim Var" */
export function placeShareText(
  kind: ShareKind,
  place: LatLng & { id: string; name: string; address?: string | null },
  t: TFunction,
): string {
  const head = [place.name, place.address].filter(Boolean).join(' · ');
  return [head, shareLink(kind, place), t('share.footer')].join('\n');
}

/** The plan's steps numbered, the reason, and the car park to drive to. */
export function planShareText(
  plan: {
    steps: string[];
    why: string | null;
    dest: LatLng & { name: string; id?: string; kind?: ShareKind };
  },
  t: TFunction,
): string {
  const { dest } = plan;
  return [
    t('chat.planTitle'),
    ...plan.steps.map((s, i) => `${i + 1}. ${s}`),
    ...(plan.why ? [plan.why] : []),
    dest.id && dest.kind
      ? shareLink(dest.kind, { ...dest, id: dest.id })
      : mapsLink(dest, dest.name),
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

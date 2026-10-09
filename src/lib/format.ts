import type { TFunction } from 'i18next';

import { estimateCost, tariffFor } from '@/data/tariffs';
import type { Parking } from '@/data/types';
import type { ParkMode } from '@/store/app';

/** `spoken` swaps symbols (₺, /, ~) for words so VoiceOver reads them naturally. */
export function priceText(
  p: Parking,
  t: TFunction,
  mode: ParkMode = 'now',
  spoken = false,
): string | null {
  const tariff = tariffFor(p.id);
  if (tariff?.hourly != null) {
    if (mode === 'twoHours')
      return t(spoken ? 'common.a11yTwoHourCost' : 'common.twoHourCost', {
        price: estimateCost(tariff.hourly, 120),
      });
    return t(spoken ? 'common.a11yPerHour' : 'common.perHour', { price: tariff.hourly });
  }
  if (p.isPaid === false) return t('common.freeOfCharge');
  if (p.isPaid === true) return t('common.paid');
  return null;
}

export function metaLine(
  p: Parking & { walk?: number },
  t: TFunction,
  mode: ParkMode = 'now',
  spoken = false,
): string {
  const parts: (string | null)[] = [
    p.walk != null
      ? t(spoken ? 'common.a11yMinutes' : 'common.minutesShort', { count: p.walk })
      : null,
    priceText(p, t, mode, spoken),
    p.isIndoor == null ? null : p.isIndoor ? t('common.indoor') : t('common.outdoor'),
    p.isOpen === false
      ? t('common.closed')
      : p.nonstop
        ? t(spoken ? 'common.a11yNonstop' : 'common.nonstop')
        : null,
    p.access === 'customers'
      ? t('common.customers')
      : p.access === 'subscribers'
        ? t('common.subscribers')
        : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

export function durationText(ms: number, t: TFunction): string {
  const total = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? t('activePark.duration', { h, m }) : t('activePark.durationMin', { m });
}

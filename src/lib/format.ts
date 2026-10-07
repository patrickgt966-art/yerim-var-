import type { TFunction } from 'i18next';

import { estimateCost, tariffFor } from '@/data/tariffs';
import type { Parking } from '@/data/types';
import type { ParkMode } from '@/store/app';

export function priceText(p: Parking, t: TFunction, mode: ParkMode = 'now'): string | null {
  const tariff = tariffFor(p.id);
  if (tariff?.hourly != null) {
    if (mode === 'twoHours')
      return t('common.twoHourCost', { price: estimateCost(tariff.hourly, 120) });
    return t('common.perHour', { price: tariff.hourly });
  }
  if (p.isPaid === false) return t('common.freeOfCharge');
  if (p.isPaid === true) return t('common.paid');
  return null;
}

export function metaLine(
  p: Parking & { walk?: number },
  t: TFunction,
  mode: ParkMode = 'now',
): string {
  const parts: (string | null)[] = [
    p.walk != null ? t('common.minutesShort', { count: p.walk }) : null,
    priceText(p, t, mode),
    p.isIndoor == null ? null : p.isIndoor ? t('common.indoor') : t('common.outdoor'),
    p.isOpen === false ? t('common.closed') : p.nonstop ? t('common.nonstop') : null,
  ];
  return parts.filter(Boolean).join(' · ');
}

export function durationText(ms: number, t: TFunction): string {
  const total = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? t('activePark.duration', { h, m }) : t('activePark.durationMin', { m });
}

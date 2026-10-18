type T = (key: string, opts?: Record<string, unknown>) => string;

/** Vehicle words of the İSPARK band labels, longest first, with their i18n key. */
const VEHICLES: readonly [RegExp, string][] = [
  [/^kamyonet\/jeep\/minib[uü]s$/i, 'detail.vehicle.van'],
  [/^minib[uü]s-kamyonet$/i, 'detail.vehicle.van'],
  [/^kamyon$/i, 'detail.vehicle.truck'],
  [/^t[ıi]r$/i, 'detail.vehicle.lorry'],
  [/^otob[uü]s$/i, 'detail.vehicle.bus'],
  [/^otomobil$/i, 'detail.vehicle.car'],
];

function vehicle(word: string, t: T): string | null {
  const hit = VEHICLES.find(([re]) => re.test(word));
  return hit ? t(hit[1]) : null;
}

/** "Tam Gün" + " · Truck": a band name and, when the band is for one vehicle kind, that kind. */
function withVehicle(base: string, rest: string | undefined, t: T): string | null {
  if (!rest) return base;
  const v = vehicle(rest.trim(), t);
  return v ? t('detail.bandFor', { band: base, vehicle: v }) : null;
}

/**
 * A tariff band label from the data ("0-1 Saat", "Tam Gün Kamyon", "25 Dk-1 Saat", "Günlük",
 * "Vale") in the app's language. A label it cannot read is shown as it is.
 */
export function tariffBandLabel(label: string, t: T): string {
  const s = label.trim().replace(/\s+/g, ' ');
  let m = /^(\d+) ?dk ?- ?(\d+) saat(?: (.+))?$/i.exec(s);
  if (m) return withVehicle(t('detail.bandMinHours', { from: m[1], to: m[2] }), m[3], t) ?? label;
  m = /^(\d+) ?- ?(\d+) saat(?: (.+))?$/i.exec(s);
  if (m) return withVehicle(t('detail.bandHours', { from: m[1], to: m[2] }), m[3], t) ?? label;
  m = /^tam g[uü]n(?: (.+))?$/i.exec(s);
  if (m) return withVehicle(t('detail.bandFullDay'), m[1], t) ?? label;
  if (/^g[uü]nl[uü]k$/i.test(s)) return t('detail.bandDaily');
  if (/^etkinlik$/i.test(s)) return t('detail.bandEvent');
  if (/^vale$/i.test(s)) return t('detail.bandValet');
  return vehicle(s, t) ?? label;
}

/** The tariff's source line; the hand-kept sample values say so in the app's language. */
export function tariffSourceLabel(source: string, t: T): string {
  return /\(mock\)/i.test(source) ? t('detail.sourceMock') : source;
}

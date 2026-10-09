export type PickPurpose = 'search' | 'home' | 'work';

export function parsePurpose(v: string | undefined): PickPurpose {
  return v === 'home' || v === 'work' ? v : 'search';
}

/** Params for the map picker (/konum-sec); empty values are left out. */
export function pickerParams(opts: {
  purpose: PickPurpose;
  q?: string;
  food?: boolean;
  cat?: string;
}) {
  const q = opts.q?.trim();
  return {
    purpose: opts.purpose,
    ...(q ? { q } : {}),
    ...(opts.food ? { mode: 'food' } : {}),
    ...(opts.cat ? { cat: opts.cat } : {}),
  };
}

/** Label for a picked point: street first, then (search only) the typed text, then the fallback. */
export function pickedLabel(
  street: string | null | undefined,
  q: string | undefined,
  fallback: string,
): string {
  return street?.trim() || q?.trim() || fallback;
}

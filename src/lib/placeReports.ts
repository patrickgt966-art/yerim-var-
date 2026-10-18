import { activeCity } from '@/data/cities';
import { aiBaseUrl } from '@/lib/ai/client';
import { useAi } from '@/store/ai';
import { useReports, type ReportKind } from '@/store/reports';

const TIMEOUT_MS = 8000;
/** The server's hidden list is fetched at most this often per city. */
const HIDDEN_MAX_AGE_MS = 6 * 3600_000;

async function call(path: string, init: RequestInit, fetchImpl: typeof fetch): Promise<unknown> {
  const url = aiBaseUrl();
  if (!url) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${url.replace(/\/+$/, '')}${path}`, {
      ...init,
      signal: controller.signal,
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Records the user's report of a place: kept on the device at once (a place reported closed is
 * hidden here right away), then sent anonymously to the server: the place, the reason, the city
 * and the device's random id, which the server keeps only hashed. True when the server took it;
 * the report stays on the device either way.
 */
export async function sendPlaceReport(
  placeId: string,
  place: 'food' | 'parking',
  kind: ReportKind,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  useReports.getState().addMine(placeId, kind);
  const out = await call(
    '/report',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: useAi.getState().deviceId,
        placeId,
        place,
        kind,
        city: activeCity().id,
      }),
    },
    fetchImpl,
  );
  return (out as { ok?: unknown } | null)?.ok === true;
}

/** Fetches the places the server hides in the city, unless fetched in the last few hours. */
export async function refreshHiddenPlaces(
  city: string = activeCity().id,
  { force = false, fetchImpl = fetch }: { force?: boolean; fetchImpl?: typeof fetch } = {},
): Promise<void> {
  const last = useReports.getState().server[city]?.at ?? 0;
  if (!force && Date.now() - last < HIDDEN_MAX_AGE_MS) return;
  const out = (await call(
    `/hidden?city=${encodeURIComponent(city)}`,
    { method: 'GET' },
    fetchImpl,
  )) as {
    ids?: unknown;
  } | null;
  if (!out || !Array.isArray(out.ids)) return;
  useReports.getState().setServer(
    city,
    out.ids.filter((x): x is string => typeof x === 'string'),
  );
}

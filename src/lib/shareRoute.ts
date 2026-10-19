// Opening a yerimvar.app share link (see share.ts `shareLink`) inside the app.
import { cityAt, type City } from '@/data/cities';

import { parseLatLng } from './params';

const HOME = '/';

// https://yerimvar.app/r/<id>?... or the bare path /r/<id>?... (what a router hands over).
const SHARE = /^(?:https?:\/\/yerimvar\.app)?\/([rp])\/([^/?#]+)\/?(\?[^#]*)?(?:#.*)?$/i;
const OUR_SITE = /^https?:\/\/yerimvar\.app(?:[/?#]|$)/i;

/**
 * Where a link goes in the app: `/restoran/<id>` for /r/<id>, `/otopark/<id>` for /p/<id>, the query
 * kept as it is. Any other yerimvar.app link (or a broken share link) goes home; null when the link
 * is not ours, so other links (dev client, notifications) pass through unchanged.
 */
export function shareRoute(url: string): string | null {
  const m = SHARE.exec(url);
  if (m) {
    let id: string;
    try {
      id = decodeURIComponent(m[2] as string);
    } catch {
      return HOME;
    }
    if (!id) return HOME;
    const screen = (m[1] as string).toLowerCase() === 'r' ? 'restoran' : 'otopark';
    return `/${screen}/${encodeURIComponent(id)}${m[3] ?? ''}`;
  }
  return OUR_SITE.test(url) ? HOME : null;
}

/** The `ll=<lat>,<lng>` param of a share link as a point. */
function parseLl(ll: string | undefined) {
  const [lat, lng, ...rest] = (ll ?? '').split(',');
  return rest.length === 0 ? parseLatLng(lat, lng) : null;
}

/**
 * The open city to switch to for a shared place that is not in the active city: the one whose area
 * holds the link's `ll`. Undefined when there is no usable `ll`, it lies outside every open city,
 * or it is the active city already (so the screen shows its not-found state, never loops).
 */
export function cityForSharedPlace(ll: string | undefined, activeId: string): City | undefined {
  const p = parseLl(ll);
  const city = p ? cityAt(p) : undefined;
  return city && city.id !== activeId ? city : undefined;
}

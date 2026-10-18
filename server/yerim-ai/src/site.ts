// The public pages of yerimvar.app: the share pages (/r/:id, /p/:id), the home page, the privacy
// page and the share image. Pure functions that return Responses; no storage, no cookies, no
// scripts, no logging. Everything a share page shows comes from the link itself.
import { CITIES } from '../../../src/data/cities';
import gizlilikHtml from '../../../docs/gizlilik.html';
import ogImage from '../../../assets/icon.png';
import logoImage from '../../../assets/brand/wordmark.png';
import { PLACE_RE } from './reports';
import {
  appButton,
  CSP,
  documentHtml,
  esc,
  LOGO,
  securityHeaders,
  type SiteEnv,
} from './siteShell';

export { esc, type SiteEnv };

// The privacy page has its own inline <style> and nothing else.
const CSP_TEXT =
  "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const html = (body: string, csp = CSP, maxAge = 3600): Response =>
  new Response(body, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': `public, max-age=${maxAge}`,
      ...securityHeaders(csp),
    },
  });

function page(opts: { title: string; head: string; body: string; env: SiteEnv }): Response {
  return html(documentHtml(opts));
}

/** GET /: the home page. */
export function homePage(env: SiteEnv, req?: Request): Response {
  const host = req ? new URL(req.url).host : 'yerimvar.app';
  const desc = 'Gideceğin yerin yanında park yeri var mı, gitmeden gör.';
  return page({
    title: 'Yerim Var',
    env,
    head:
      `<meta name="description" content="${esc(desc)}">` +
      `<meta property="og:title" content="Yerim Var">` +
      `<meta property="og:description" content="${esc(desc)}">` +
      `<meta property="og:image" content="https://${esc(host)}/og.png">` +
      `<meta property="og:type" content="website">` +
      `<meta name="twitter:card" content="summary">`,
    body:
      `<div class="card">${LOGO}<p class="pitch">${esc(desc)}</p>` +
      `<ul><li>otoparkı yakın restoranlar</li><li>canlı boş yer (İzmir, İstanbul)</li>` +
      `<li>hesap yok, reklam yok, takip yok</li></ul>${appButton(env)}` +
      `<h2>Şehirler</h2><ul class="links">${CITIES.filter((c) => c.available)
        .map((c) => `<li><a href="/${esc(c.id)}">${esc(c.name)}</a></li>`)
        .join('')}</ul></div>`,
  });
}

/** "lat,lng" inside Turkey, or null. */
function parseLl(v: string | null): { lat: number; lng: number } | null {
  const m = /^(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)$/.exec(v ?? '');
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!(lat >= 35.5 && lat <= 42.5 && lng >= 25.5 && lng <= 45)) return null;
  return { lat, lng };
}

/** GET /r/:id and /p/:id: the share page; an invalid link gives the home page. */
export function sharePage(kind: 'r' | 'p', id: string, req: Request, env: SiteEnv): Response {
  const url = new URL(req.url);
  const name = (url.searchParams.get('n') ?? '').trim();
  const address = (url.searchParams.get('a') ?? '').trim();
  const ll = parseLl(url.searchParams.get('ll'));
  if (!PLACE_RE.test(id) || name.length < 1 || name.length > 80 || !ll || address.length > 100) {
    return homePage(env, req);
  }
  const kindLabel = kind === 'r' ? 'Restoran' : 'Otopark';
  const coords = `${ll.lat},${ll.lng}`;
  const apple = `https://maps.apple.com/?daddr=${coords}&q=${encodeURIComponent(name)}`;
  const google = `https://www.google.com/maps/dir/?api=1&destination=${coords}`;
  const desc = `${kindLabel} · Yerim Var ile bulundu${address ? ` · ${address}` : ''}`;
  return page({
    title: `${name} · Yerim Var`,
    env,
    head:
      `<meta name="robots" content="noindex">` +
      `<meta property="og:title" content="${esc(name)}">` +
      `<meta property="og:description" content="${esc(desc)}">` +
      `<meta property="og:image" content="https://${esc(url.host)}/og.png">` +
      `<meta property="og:url" content="${esc(url.href)}">` +
      `<meta property="og:type" content="website">` +
      `<meta name="twitter:card" content="summary">`,
    body:
      `<div class="card">${LOGO}<h1>${esc(name)}</h1>` +
      `<p class="kind">${kindLabel}${address ? ` · ${esc(address)}` : ''}</p>` +
      `<a class="btn secondary" href="${esc(apple)}">Apple Haritalar'da aç</a>` +
      `<a class="btn secondary" href="${esc(google)}">Google Haritalar'da aç</a>` +
      `${appButton(env)}</div>`,
  });
}

/** GET /gizlilik: docs/gizlilik.html as it is. */
export const privacyPage = (): Response => html(gizlilikHtml, CSP_TEXT);

/** GET /og.png: the share preview image (the app icon). */
export const ogImagePage = (): Response =>
  new Response(ogImage, {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=604800',
      'x-content-type-options': 'nosniff',
    },
  });

/** GET /logo.png: the Yerim Var wordmark shown at the top of every page. */
export const logoImagePage = (): Response =>
  new Response(logoImage, {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=604800',
      'x-content-type-options': 'nosniff',
    },
  });

/** GET /.well-known/apple-app-site-association: only once the Apple team id is set. */
export function appSiteAssociation(env: SiteEnv): Response {
  if (!env.APPLE_TEAM_ID) return new Response('not_found', { status: 404 });
  return new Response(
    JSON.stringify({
      applinks: {
        details: [
          {
            appIDs: [`${env.APPLE_TEAM_ID}.com.yerimvar.app`],
            components: [{ '/': '/r/*' }, { '/': '/p/*' }],
          },
        ],
      },
    }),
    { headers: { 'content-type': 'application/json' } },
  );
}

/** Routes the site's GET paths; null when the path is not one of them. */
export function siteRoute(path: string, req: Request, env: SiteEnv): Response | null {
  if (path === '/') return homePage(env, req);
  if (path === '/gizlilik') return privacyPage();
  if (path === '/og.png') return ogImagePage();
  if (path === '/logo.png') return logoImagePage();
  if (path === '/.well-known/apple-app-site-association') return appSiteAssociation(env);
  const m = /^\/([rp])\/([^/]+)$/.exec(path);
  if (m) {
    let id: string;
    try {
      id = decodeURIComponent(m[2] as string);
    } catch {
      return homePage(env, req);
    }
    return sharePage(m[1] as 'r' | 'p', id, req, env);
  }
  return null;
}

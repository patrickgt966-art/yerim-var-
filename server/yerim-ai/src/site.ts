// The public pages of yerimvar.app: the share pages (/r/:id, /p/:id), the home page, the privacy
// page and the share image. Pure functions that return Responses; no storage, no cookies, no
// scripts, no logging. Everything a share page shows comes from the link itself.
import gizlilikHtml from '../../../docs/gizlilik.html';
import ogImage from '../../../assets/icon.png';
import logoImage from '../../../assets/brand/wordmark.png';
import { PLACE_RE } from './reports';

/** The optional App Store settings from wrangler.toml [vars] (empty strings when not set). */
export interface SiteEnv {
  APP_STORE_URL?: string;
  APP_STORE_ID?: string;
  APPLE_TEAM_ID?: string;
}

/** HTML-escapes a value for text and quoted attributes: & < > " '. */
export const esc = (v: string): string =>
  v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
// The privacy page has its own inline <style> and nothing else.
const CSP_TEXT =
  "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const securityHeaders = (csp: string): Record<string, string> => ({
  'content-security-policy': csp,
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
});

const html = (body: string, csp = CSP, maxAge = 3600): Response =>
  new Response(body, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': `public, max-age=${maxAge}`,
      ...securityHeaders(csp),
    },
  });

const CSS = `
*{box-sizing:border-box}
body{margin:0;background:#FBF7F1;color:#0B3C49;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:480px;margin:0 auto;padding:24px 16px 32px}
.logo{display:block;margin:0 auto 16px;max-width:100%;height:auto}
.card{background:#fff;border-radius:22px 22px 22px 6px;padding:20px;box-shadow:0 2px 12px rgba(11,60,73,.08)}
h1{font-size:24px;line-height:1.25;margin:0 0 6px;font-weight:800;overflow-wrap:anywhere}
.kind{margin:0 0 16px;color:#4F6F78;overflow-wrap:anywhere}
.btn{display:flex;align-items:center;justify-content:center;min-height:48px;margin:10px 0 0;padding:0 16px;border-radius:14px;font-weight:700;text-decoration:none;text-align:center}
.primary{background:#FF8A1F;color:#0B3C49}
.secondary{background:#fff;color:#0B3C49;border:2px solid #0B3C49}
.muted{color:#4F6F78;margin:16px 0 0;text-align:center}
ul{margin:12px 0 0;padding-left:20px}
li{margin:6px 0}
.pitch{font-size:20px;line-height:1.3;font-weight:800;margin:0}
footer{margin-top:20px;text-align:center;color:#4F6F78;font-size:14px}
footer a{color:#0B3C49}
`
  .trim()
  .replace(/\n/g, '');

const LOGO = '<img class="logo" src="/logo.png" alt="Yerim Var" width="160" height="110">';

const FOOTER =
  '<footer><p>Yerim Var: yemek ve park, bir arada.</p><p><a href="/gizlilik">Gizlilik</a></p></footer>';

function appButton(env: SiteEnv): string {
  return env.APP_STORE_URL
    ? `<a class="btn primary" href="${esc(env.APP_STORE_URL)}">Yerim Var'ı indir</a>`
    : '<p class="muted">Yerim Var yakında App Store\'da.</p>';
}

function page(opts: { title: string; head: string; body: string; env: SiteEnv }): Response {
  const banner = opts.env.APP_STORE_ID
    ? `<meta name="apple-itunes-app" content="app-id=${esc(opts.env.APP_STORE_ID)}">`
    : '';
  return html(
    `<!doctype html><html lang="tr"><head><meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1">` +
      `<title>${esc(opts.title)}</title>${banner}${opts.head}<style>${CSS}</style></head>` +
      `<body><main>${opts.body}${FOOTER}</main></body></html>`,
  );
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
      `<li>hesap yok, reklam yok, takip yok</li></ul>${appButton(env)}</div>`,
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

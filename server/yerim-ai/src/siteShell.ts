// The look shared by the Worker's pages (site.ts) and the static SEO pages that
// scripts/build-site.ts writes: styles, logo, footer, escaping and the document frame.
// Plain strings only (no Worker or Node imports), so both sides can import it.

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

/** The CSP of the pages built here: inline styles and the site's own images, nothing else. */
export const CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/** The security headers every HTML page of the site carries, with the CSP it needs. */
export const securityHeaders = (csp: string): Record<string, string> => ({
  'content-security-policy': csp,
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
});

export const CSS = `
*{box-sizing:border-box}
body{margin:0;background:#FBF7F1;color:#0B3C49;font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:480px;margin:0 auto;padding:24px 16px 32px}
main.wide{max-width:720px}
.logo{display:block;margin:0 auto 16px;max-width:100%;height:auto}
.card{background:#fff;border-radius:22px 22px 22px 6px;padding:20px;box-shadow:0 2px 12px rgba(11,60,73,.08)}
h1{font-size:24px;line-height:1.25;margin:0 0 6px;font-weight:800;overflow-wrap:anywhere}
h2{font-size:18px;line-height:1.3;margin:24px 0 4px;font-weight:800}
.kind{margin:0 0 16px;color:#4F6F78;overflow-wrap:anywhere}
.btn{display:flex;align-items:center;justify-content:center;min-height:48px;margin:10px 0 0;padding:0 16px;border-radius:14px;font-weight:700;text-decoration:none;text-align:center}
.primary{background:#FF8A1F;color:#0B3C49}
.secondary{background:#fff;color:#0B3C49;border:2px solid #0B3C49}
.muted{color:#4F6F78;margin:16px 0 0;text-align:center}
ul{margin:12px 0 0;padding-left:20px}
li{margin:6px 0}
.pitch{font-size:20px;line-height:1.3;font-weight:800;margin:0}
.scroll{overflow-x:auto}
table{width:100%;border-collapse:collapse;margin:12px 0 0;font-size:15px}
th,td{text-align:left;padding:8px 6px;border-bottom:1px solid #E7E0D6;vertical-align:top}
th{color:#4F6F78;font-weight:700}
.rows{list-style:none;padding:0}
.rows li{padding:8px 0;border-bottom:1px solid #E7E0D6}
.sub{display:block;color:#4F6F78;font-size:15px}
.links{display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0}
.links a{display:inline-block;padding:6px 12px;border:2px solid #0B3C49;border-radius:14px;font-weight:700;text-decoration:none;color:#0B3C49}
.note{color:#4F6F78;font-size:14px}
footer{margin-top:20px;text-align:center;color:#4F6F78;font-size:14px}
footer a{color:#0B3C49}
`
  .trim()
  .replace(/\n/g, '');

export const LOGO = '<img class="logo" src="/logo.png" alt="Yerim Var" width="160" height="110">';

/** The page footer; `extra` is more paragraphs (already HTML) shown above the privacy link. */
export const footerHtml = (extra = ''): string =>
  `<footer><p>Yerim Var: yemek ve park, bir arada.</p>${extra}<p><a href="/gizlilik">Gizlilik</a></p></footer>`;

export const FOOTER = footerHtml();

export function appButton(env: SiteEnv): string {
  return env.APP_STORE_URL
    ? `<a class="btn primary" href="${esc(env.APP_STORE_URL)}">Yerim Var'ı indir</a>`
    : '<p class="muted">Yerim Var yakında App Store\'da.</p>';
}

/** A whole HTML document: `head` and `body` are HTML, `title` is plain text. */
export function documentHtml(opts: {
  title: string;
  head: string;
  body: string;
  env: SiteEnv;
  /** A wider column for tables and long lists. */
  wide?: boolean;
  /** Extra footer paragraphs (HTML). */
  footer?: string;
}): string {
  const banner = opts.env.APP_STORE_ID
    ? `<meta name="apple-itunes-app" content="app-id=${esc(opts.env.APP_STORE_ID)}">`
    : '';
  return (
    `<!doctype html><html lang="tr"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${esc(opts.title)}</title>${banner}${opts.head}<style>${CSS}</style></head>` +
    `<body><main${opts.wide ? ' class="wide"' : ''}>${opts.body}${footerHtml(opts.footer)}</main></body></html>`
  );
}

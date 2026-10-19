// The public pages of yerimvar.app: share pages, home, privacy, share image, app-site association.
jest.mock('@anthropic-ai/sdk', () => ({ __esModule: true, default: class {} }), { virtual: true });
jest.mock('@anthropic-ai/sdk/helpers/zod', () => ({ zodOutputFormat: () => ({}) }), {
  virtual: true,
});

// wrangler bundles these two files as modules (text and bytes); jest has no such rule, so read the
// very same files here.
jest.mock('../../../../docs/gizlilik.html', () => ({
  __esModule: true,
  default: require('fs').readFileSync(
    require('path').join(__dirname, '../../../../docs/gizlilik.html'),
    'utf8',
  ),
}));
jest.mock('../../../../assets/icon.png', () => {
  const buf: Buffer = require('fs').readFileSync(
    require('path').join(__dirname, '../../../../assets/icon.png'),
  );
  return {
    __esModule: true,
    default: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
});

jest.mock('../../../../assets/brand/wordmark.png', () => {
  const buf: Buffer = require('fs').readFileSync(
    require('path').join(__dirname, '../../../../assets/brand/wordmark.png'),
  );
  return {
    __esModule: true,
    default: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
});

import worker, { type Env } from '../index';
import { esc } from '../site';

const envOf = (vars: Partial<Env> = {}): Env =>
  ({ QUOTA: {}, ANTHROPIC_API_KEY: 'k', ...vars }) as unknown as Env;

const get = async (path: string, vars: Partial<Env> = {}) => {
  const res = await worker.fetch(new Request(`https://yerimvar.app${path}`), envOf(vars));
  return {
    res,
    text: /(text|json)/.test(res.headers.get('content-type') ?? '') ? await res.text() : '',
  };
};

const HOME_PITCH = 'Gideceğin yerin yanında park yeri var mı, gitmeden gör.';
const share = '/r/osm-n1?n=K%C3%B6fteci%20Yusuf&ll=38.43,27.14&a=Alsancak';

describe('esc', () => {
  it('escapes & < > " and a single quote', () => {
    expect(esc(`<script>alert("x")</script> & 'y'`)).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;',
    );
  });
});

describe('share pages', () => {
  it('a restaurant page: 200, headers, name, address, both map links, no script', async () => {
    const { res, text } = await get(share);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
    expect(res.headers.get('content-security-policy')).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(text).toContain('<html lang="tr">');
    expect(text).toContain('<h1>Köfteci Yusuf</h1>');
    expect(text).toContain('Restoran · Alsancak');
    expect(text).toContain('<title>Köfteci Yusuf · Yerim Var</title>');
    expect(text).toContain('<meta name="robots" content="noindex">');
    expect(text).toContain(
      'href="https://maps.apple.com/?daddr=38.43,27.14&amp;q=K%C3%B6fteci%20Yusuf"',
    );
    expect(text).toContain(
      'href="https://www.google.com/maps/dir/?api=1&amp;destination=38.43,27.14"',
    );
    expect(text).toContain('property="og:image" content="https://yerimvar.app/og.png"');
    expect(text).toContain(
      'property="og:description" content="Restoran · Yerim Var ile bulundu · Alsancak"',
    );
    expect(text).toContain('href="/gizlilik"');
    expect(text).not.toContain('<script');
  });

  it('a car park page says Otopark', async () => {
    const { res, text } = await get('/p/ispark-12?n=Konak&ll=38.41,27.12');
    expect(res.status).toBe(200);
    expect(text).toContain('<p class="kind">Otopark</p>');
    expect(text).toContain('content="Otopark · Yerim Var ile bulundu"');
  });

  it('App Store: a muted line when empty, a button and a banner when set', async () => {
    const off = (await get(share)).text;
    expect(off).toContain("Yerim Var yakında App Store'da.");
    expect(off).not.toContain("Yerim Var'ı indir");
    expect(off).not.toContain('apple-itunes-app');
    const on = (
      await get(share, { APP_STORE_URL: 'https://apps.apple.com/app/id1', APP_STORE_ID: '1' })
    ).text;
    expect(on).toContain(
      '<a class="btn primary" href="https://apps.apple.com/app/id1">Yerim Var\'ı indir</a>',
    );
    expect(on).not.toContain('yakında');
    expect(on).toContain('<meta name="apple-itunes-app" content="app-id=1">');
  });

  it.each([
    ['ll outside Turkey', '/r/osm-n1?n=A&ll=10,10'],
    ['ll not numbers', '/r/osm-n1?n=A&ll=a,b'],
    ['ll missing', '/r/osm-n1?n=A'],
    ['name missing', '/r/osm-n1?ll=38.43,27.14'],
    ['name blank', '/r/osm-n1?n=%20%20&ll=38.43,27.14'],
    ['name too long', `/r/osm-n1?n=${'a'.repeat(81)}&ll=38.43,27.14`],
    ['address too long', `/r/osm-n1?n=A&ll=38.43,27.14&a=${'b'.repeat(101)}`],
    ['bad id', '/p/bad%20id%3Cx?n=A&ll=38.43,27.14'],
  ])('%s gives the home page', async (_name, path) => {
    const { res, text } = await get(path);
    expect(res.status).toBe(200);
    expect(text).toContain(HOME_PITCH);
    expect(text).not.toContain('noindex');
  });

  it('escapes a hostile name everywhere and encodes it in URLs', async () => {
    const name = `<script>alert("x")</script>'&`;
    const a = `"><img src=x onerror=1>`;
    const { res, text } = await get(
      `/r/osm-n1?n=${encodeURIComponent(name)}&ll=38.43,27.14&a=${encodeURIComponent(a)}`,
    );
    expect(res.status).toBe(200);
    expect(text).not.toContain('<script');
    expect(text).not.toContain('<img src=x'); // the logo <img> is the only one
    expect(text).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&#39;&amp;');
    expect(text).toContain(`q=${esc(encodeURIComponent(name))}`);
  });
});

describe('other pages', () => {
  it('the home page: pitch, bullets, privacy link, indexable', async () => {
    const { res, text } = await get('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(text).toContain(HOME_PITCH);
    expect(text).toContain('otoparkı yakın restoranlar');
    expect(text).toContain('canlı boş yer (İzmir, İstanbul)');
    expect(text).toContain('hesap yok, reklam yok, takip yok');
    expect(text).toContain('href="/gizlilik"');
    expect(text).not.toContain('noindex');
  });

  it('the home page lists the open cities with links to their pages', async () => {
    const { text } = await get('/');
    expect(text).toContain('<h2>Şehirler</h2>');
    for (const [id, name] of [
      ['izmir', 'İzmir'],
      ['istanbul', 'İstanbul'],
      ['ankara', 'Ankara'],
      ['antalya', 'Antalya'],
      ['bursa', 'Bursa'],
    ]) {
      expect(text).toContain(`<a href="/${id}">${name}</a>`);
    }
  });

  it('/gizlilik serves the privacy page as html', async () => {
    const { res, text } = await get('/gizlilik');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('content-security-policy')).not.toContain('script-src');
    expect(text).toContain('Gizlilik Politikası');
    expect(text).toContain('yerimvar.app');
  });

  it('/og.png is the icon', async () => {
    const res = await worker.fetch(new Request('https://yerimvar.app/og.png'), envOf());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('public, max-age=604800');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes.slice(1, 4))).toEqual([0x50, 0x4e, 0x47]);
  });

  it('/logo.png is the wordmark', async () => {
    const res = await worker.fetch(new Request('https://yerimvar.app/logo.png'), envOf());
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toBe('public, max-age=604800');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(Array.from(bytes.slice(1, 4))).toEqual([0x50, 0x4e, 0x47]);
  });

  it('the home page shows the logo image inside the card', async () => {
    const { text } = await get('/');
    expect(text).toContain(
      '<div class="card"><img class="logo" src="/logo.png" alt="Yerim Var" width="160" height="110">',
    );
  });

  it('apple-app-site-association: 404 without a team id, the json with one', async () => {
    const path = '/.well-known/apple-app-site-association';
    expect((await get(path)).res.status).toBe(404);
    const { res, text } = await get(path, { APPLE_TEAM_ID: 'YBC82Z2MP5' });
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(JSON.parse(text)).toEqual({
      applinks: {
        details: [
          {
            appIDs: ['YBC82Z2MP5.com.yerimvar.app'],
            components: [{ '/': '/r/*' }, { '/': '/p/*' }],
          },
        ],
      },
    });
  });

  it('only GET: a POST to / is still the old 404', async () => {
    const res = await worker.fetch(
      new Request('https://yerimvar.app/', { method: 'POST' }),
      envOf(),
    );
    expect(res.status).toBe(404);
  });
});

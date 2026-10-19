import { cityForSharedPlace, shareRoute } from '@/lib/shareRoute';
import { shareLink } from '@/lib/share';

describe('shareRoute', () => {
  it('maps /r/<id> to the restaurant and /p/<id> to the car park, keeping the query', () => {
    const q = '?n=K%C3%B6fteci%20Yusuf&ll=38.43,27.14&a=Alsancak';
    expect(shareRoute(`https://yerimvar.app/r/osm-n1${q}`)).toBe(`/restoran/osm-n1${q}`);
    expect(shareRoute(`https://yerimvar.app/p/ispark-12${q}`)).toBe(`/otopark/ispark-12${q}`);
    expect(shareRoute('/r/osm-n1?n=x')).toBe('/restoran/osm-n1?n=x');
    expect(shareRoute('https://yerimvar.app/r/osm-n1')).toBe('/restoran/osm-n1');
    expect(shareRoute('https://yerimvar.app/r/osm-n1/?n=x')).toBe('/restoran/osm-n1?n=x');
  });

  it('opens what shareLink makes', () => {
    const link = shareLink('r', { id: 'ov-a/b', name: 'Çiğ Köfte', lat: 38.4, lng: 27.1 });
    expect(shareRoute(link)).toBe(
      `/restoran/ov-a%2Fb?n=${encodeURIComponent('Çiğ Köfte')}&ll=38.4,27.1`,
    );
  });

  it('sends any other yerimvar.app link, and a broken id, home', () => {
    expect(shareRoute('https://yerimvar.app/')).toBe('/');
    expect(shareRoute('https://yerimvar.app/gizlilik')).toBe('/');
    expect(shareRoute('https://yerimvar.app/izmir/alsancak-otopark')).toBe('/');
    expect(shareRoute('https://yerimvar.app/r/')).toBe('/');
    expect(shareRoute('https://yerimvar.app/r/%E0%A4%A')).toBe('/');
    expect(shareRoute('https://yerimvar.app/x/abc')).toBe('/');
  });

  it('leaves links that are not ours alone', () => {
    expect(shareRoute('/restoran/abc')).toBeNull();
    expect(shareRoute('yerimvar://sonuc')).toBeNull();
    expect(shareRoute('https://example.com/r/abc')).toBeNull();
    expect(shareRoute('https://yerimvar.app.evil.com/r/abc')).toBeNull();
    expect(shareRoute('exp://192.168.1.2:8081')).toBeNull();
  });
});

describe('cityForSharedPlace', () => {
  it('picks the open city whose area holds ll, when it is not the active one', () => {
    expect(cityForSharedPlace('41.0422,29.0067', 'izmir')?.id).toBe('istanbul');
    expect(cityForSharedPlace('38.4237,27.1428', 'istanbul')?.id).toBe('izmir');
  });
  it('is undefined for the active city, no ll, a bad ll or a point in no open city', () => {
    expect(cityForSharedPlace('38.4237,27.1428', 'izmir')).toBeUndefined();
    expect(cityForSharedPlace(undefined, 'izmir')).toBeUndefined();
    expect(cityForSharedPlace('abc', 'izmir')).toBeUndefined();
    expect(cityForSharedPlace('38.4,27.1,3', 'istanbul')).toBeUndefined();
    expect(cityForSharedPlace('0,0', 'izmir')).toBeUndefined();
  });
});

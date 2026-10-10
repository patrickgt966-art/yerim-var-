#!/usr/bin/env python3
"""Fetch food places in Izmir province from Overture Maps and write data/food-overture-izmir.json.

Usage: [OVERTURE_RELEASE=2025-10-22.0] python scripts/fetch-overture.py
Needs Python 3.11+, pyarrow and shapely (pip install pyarrow shapely).
"""
import json
import math
import os
import re
import socket
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

import pyarrow.dataset as ds
import shapely.wkb
from pyarrow import fs
from shapely.geometry import Point
from shapely.ops import unary_union
from shapely.prepared import prep

ROOT = Path(__file__).resolve().parent.parent
OSM_FILE = ROOT / 'data' / 'food-izmir.json'
OUT_FILE = ROOT / 'data' / 'food-overture-izmir.json'
REPORT_FILE = ROOT / 'data' / 'sources-report.md'
WEB_CACHE_FILE = 'data/overture-web-check.json'
WEB_MAX_URLS = 6000
WEB_WORKERS = 32
WEB_TIMEOUT = 8  # seconds per request
WEB_BUDGET = 15 * 60  # seconds; no new checks are started after this
WEB_USER_AGENT = 'YerimVarDataCheck/1.0 (+https://github.com/patrickgt966-art/yerim-var-)'

BUCKET = 'overturemaps-us-west-2'
MIN_CONFIDENCE = 0.6
STRICT_CONFIDENCE = 0.7
MAX_BYTES = int(2.5 * 1024 * 1024)
MIN_KEEP_RATIO = 0.7  # refuse to shrink the file below this share of the old count
VERIFIED_CONFIDENCE = 0.9
VERIFIED_SOURCES = 2

CLOSED = ('permanently_closed', 'temporarily_closed')
BAD_NAME = re.compile(r'(eczane|anaokulu|ilkokulu|ortaokulu|lisesi)', re.I)

# Name drop rule: whole-word match on the folded name (so 'Marketing Cafe' is not hit by 'market').
DROP_WORDS = (
    'malzeme', 'malzemeleri', 'toptan', 'ekipman', 'ekipmanlari', 'makine', 'makinalari',
    'lokali', 'dernegi', 'dernek', 'sendika', 'music hall', 'performance hall', 'konser salonu',
    'dugun salonu', 'dugun', 'nikah salonu', 'kina', 'catering', 'organizasyon', 'market',
    'supermarket', 'bakkal', 'su deposu', 'tup', 'eczane', 'okul', 'kurs',
)
DROP_NAME = re.compile(
    r'\b(' + '|'.join(re.escape(w) for w in sorted(DROP_WORDS, key=len, reverse=True)) + r')\b')
# Butcher / deli names are kept but flagged suspect, unless the name is clearly a restaurant (word-start match).
SUSPECT_NAME = re.compile(r'\b(kasap|sarkuteri|sarkuterisi)\b')
KASAP_OK = re.compile(r'\b(lokanta|restoran|izgara|kebap|et ev)')

# First phone, spaces/()/- stripped: +90 2xx / 0 2xx / 2xx landline (10 digits after the prefix).
LANDLINE = re.compile(r'^(?:\+90|0)?(2\d{2})\d{7}$')
IZMIR_AREA_CODE = '232'

# basic_category -> app kind (see KIND_KEYS in src/data/restaurants.ts)
KIND_BY_CATEGORY = {
    'restaurant': 'restaurant',
    'casual_eatery': 'restaurant',
    'cafe': 'cafe',
    'coffee_shop': 'cafe',
    'fast_food_restaurant': 'fast_food',
    'bar': 'bar',
    'food_court': 'food_court',
}
# taxonomy.primary -> app kind, for places whose basic_category is not a food one
KIND_BY_TAXONOMY = {
    'bakery': 'bakery',
    'pastry_shop': 'pastry',
    'dessert_shop': 'pastry',
    'patisserie': 'pastry',
}
# taxonomy value -> cuisine string understood by CATEGORY_RULES / CUISINE_KEYS
CUISINE_BY_TAXONOMY = {
    'seafood_restaurant': 'seafood',
    'fish_restaurant': 'fish',
    'kebab_restaurant': 'kebab',
    'turkish_restaurant': 'turkish',
    'breakfast_and_brunch_restaurant': 'breakfast',
    'pizza_restaurant': 'pizza',
    'burger_restaurant': 'burger',
    'steakhouse': 'steak_house',
    'soup_restaurant': 'soup',
    'dessert_shop': 'dessert',
    'ice_cream_shop': 'ice_cream',
    'pastry_shop': 'pastry',
    'patisserie': 'pastry',
    'bakery': 'breakfast',
    'italian_restaurant': 'italian',
    'chinese_restaurant': 'chinese',
    'japanese_restaurant': 'japanese',
    'sushi_restaurant': 'sushi',
    'asian_restaurant': 'asian',
    'mediterranean_restaurant': 'mediterranean',
    'chicken_restaurant': 'chicken',
    'sandwich_shop': 'sandwich',
    'coffee_shop': 'coffee_shop',
    'tea_room': 'tea',
    'barbecue_restaurant': 'barbecue',
    'donut_shop': 'donut',
    'bagel_shop': 'bagel',
    'meyhane': 'meyhane',
}


def fold(s):
    """Lower-case, Turkish letters mapped to ASCII, punctuation dropped (like fold() in search.ts)."""
    s = s.replace('İ', 'i').replace('I', 'ı').lower()
    s = s.translate(str.maketrans('ışğüöç', 'isguoc'))
    s = unicodedata.normalize('NFD', s)
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9 ]+', ' ', s)).strip()


def fail(msg):
    print(f'error: {msg}', file=sys.stderr)
    sys.exit(1)


def open_s3():
    opts = {}
    proxy = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')
    if proxy:
        opts['proxy_options'] = proxy
    return fs.S3FileSystem(anonymous=True, region='us-west-2', **opts)


def find_release(s3):
    """OVERTURE_RELEASE, else the lexicographically largest release directory."""
    if os.environ.get('OVERTURE_RELEASE'):
        return os.environ['OVERTURE_RELEASE']
    infos = s3.get_file_info(fs.FileSelector(f'{BUCKET}/release/'))
    names = [i.base_name for i in infos if i.type == fs.FileType.Directory]
    if not names:
        fail('no Overture release found')
    return max(names)


def bbox_filter(x0, x1, y0, y1):
    f = lambda k: ds.field('bbox', k)
    return (f('xmin') >= x0) & (f('xmax') <= x1) & (f('ymin') >= y0) & (f('ymax') <= y1)


def open_dataset(s3, release, theme, typ):
    path = f'{BUCKET}/release/{release}/theme={theme}/type={typ}/'
    return ds.dataset(path, filesystem=s3, format='parquet')


def find_polygon(s3, release):
    """Union of the Izmir province (region) polygons, or None."""
    dset = open_dataset(s3, release, 'divisions', 'division_area')
    cols = ['geometry', 'subtype', 'country', 'names', 'bbox']
    missing = [c for c in cols if c not in dset.schema.names]
    if missing:
        print(f'divisions schema lacks {missing}; schema is:', file=sys.stderr)
        print(dset.schema, file=sys.stderr)
        sys.exit(2)
    flt = bbox_filter(25.9, 28.7, 37.6, 39.6)
    geoms = []
    for batch in dset.to_batches(columns=cols, filter=flt):
        for row in batch.to_pylist():
            name = (row['names'] or {}).get('primary') or ''
            if row['subtype'] == 'region' and row['country'] == 'TR' and fold(name) in {'izmir'}:
                geoms.append(shapely.wkb.loads(row['geometry']))
    return unary_union(geoms) if geoms else None


def usable_name(name):
    if not name or not name.strip():
        return False
    f = fold(name)
    return len(re.findall(r'[a-z]', f)) >= 2 and not BAD_NAME.search(f)


def drop_reason(name):
    """The matched word if the folded name hits the drop rule, else None."""
    f = fold(name)
    m = DROP_NAME.search(f)
    return m.group(1) if m else None


def is_suspect_name(name):
    """True for butcher / deli names (kasap, sarkuteri) that do not also look like a restaurant."""
    f = fold(name)
    return bool(SUSPECT_NAME.search(f)) and not KASAP_OK.search(f)


def is_suspect_phone(phone):
    """True for a Turkish landline whose area code is not Izmir's 232 (mobile, 444 and 850 are fine)."""
    if not phone:
        return False
    m = LANDLINE.match(re.sub(r'[\s()\-]', '', phone))
    return bool(m) and m.group(1) != IZMIR_AREA_CODE


def kind_of(row):
    tax = row.get('taxonomy') or {}
    return KIND_BY_CATEGORY.get(row.get('basic_category')) or KIND_BY_TAXONOMY.get(tax.get('primary'))


def cuisines_of(row):
    tax = row.get('taxonomy') or {}
    out = []
    for v in [tax.get('primary'), *(tax.get('alternates') or [])]:
        c = CUISINE_BY_TAXONOMY.get(v)
        if c and c not in out:
            out.append(c)
    return out


def is_corroborated(row):
    """2+ distinct source datasets other than 'Overture' itself, or confidence >= 0.9."""
    datasets = {s.get('dataset') for s in (row.get('sources') or []) if s}
    datasets.discard('Overture')
    datasets.discard(None)
    return len(datasets) >= VERIFIED_SOURCES or (row.get('confidence') or 0.0) >= VERIFIED_CONFIDENCE


def to_record(row, kind):
    """Compact record with the keys of data/food-izmir.json; null keys are dropped."""
    bb = row['bbox']
    phone = (row.get('phones') or [None])[0]
    suspect = is_suspect_phone(phone) or is_suspect_name(row['names']['primary'])
    rec = {
        'id': 'ov-' + row['id'].replace('-', '')[:16],
        'n': row['names']['primary'].strip(),
        'a': round((bb['ymin'] + bb['ymax']) / 2, 5),
        'o': round((bb['xmin'] + bb['xmax']) / 2, 5),
        'k': kind,
        'c': cuisines_of(row),
        'p': phone,
        'w': (row.get('websites') or [None])[0],
        'ad': ((row.get('addresses') or [{}])[0] or {}).get('freeform'),
        'v': 1 if is_corroborated(row) and not suspect else None,
        'sp': 1 if suspect else None,
    }
    return {k: v for k, v in rec.items() if v}


def read_candidates(s3, release, poly):
    """All food places inside the polygon, with confidence; returns (list, raw count, dropped-word Counter)."""
    dset = open_dataset(s3, release, 'places', 'place')
    cols = ['id', 'names', 'basic_category', 'taxonomy', 'confidence', 'operating_status',
            'phones', 'websites', 'addresses', 'bbox', 'sources']
    x0, y0, x1, y1 = poly.bounds
    prepared = prep(poly)
    out, raw, dropped = [], 0, Counter()
    for batch in dset.to_batches(columns=cols, filter=bbox_filter(x0, x1, y0, y1)):
        for row in batch.to_pylist():
            kind = kind_of(row)
            if not kind:
                continue
            bb = row['bbox']
            if not prepared.contains(Point((bb['xmin'] + bb['xmax']) / 2, (bb['ymin'] + bb['ymax']) / 2)):
                continue
            raw += 1
            if row.get('operating_status') in CLOSED:
                continue
            if not usable_name((row.get('names') or {}).get('primary')):
                continue
            word = drop_reason(row['names']['primary'])
            if word:
                dropped[word] += 1
                continue
            out.append((row.get('confidence') or 0.0, to_record(row, kind)))
    return out, raw, dropped


class Grid:
    """Points bucketed in ~150 m cells for fast 'anything within R metres' lookups."""

    CELL = 0.0015

    def __init__(self):
        self.cells = {}

    def _key(self, a, o):
        return (math.floor(a / self.CELL), math.floor(o / self.CELL))

    def add(self, a, o, item):
        self.cells.setdefault(self._key(a, o), []).append((a, o, item))

    def near(self, a, o, radius_m):
        ka, ko = self._key(a, o)
        for da in (-1, 0, 1):
            for do in (-1, 0, 1):
                for pa, po, item in self.cells.get((ka + da, ko + do), ()):
                    d = math.hypot((pa - a) * 111_320, (po - o) * 111_320 * math.cos(math.radians(a)))
                    if d <= radius_m:
                        yield item


def dedupe_overture(cands):
    """Same folded name within 50 m: keep the higher confidence."""
    grid, kept = Grid(), []
    for _, rec in sorted(cands, key=lambda c: (-c[0], c[1]['id'])):
        name = fold(rec['n'])
        if any(n == name for n in grid.near(rec['a'], rec['o'], 50)):
            continue
        grid.add(rec['a'], rec['o'], name)
        kept.append(rec)
    return kept


def load_osm():
    if not OSM_FILE.exists():
        return []
    items = json.loads(OSM_FILE.read_text(encoding='utf-8')).get('items', [])
    return [i for i in items if 'a' in i and 'o' in i and i.get('n')]


def build_osm_grid(osm):
    grid = Grid()
    for i in osm:
        grid.add(i['a'], i['o'], fold(i['n']))
    return grid


def is_osm_duplicate(rec, grid):
    name = fold(rec['n'])
    first = name.split(' ')[0] if name else ''
    for other in grid.near(rec['a'], rec['o'], 100):
        if other == name:
            return True
        short = min(name, other, key=len)
        if len(short) >= 5 and (name in other or other in name):
            return True
    for other in grid.near(rec['a'], rec['o'], 15):
        if first and other.split(' ')[0] == first:
            return True
    return False


def select(cands, threshold, osm_grid):
    """Confidence filter, Overture-internal dedupe, then OSM dedupe."""
    good = [c for c in cands if c[0] >= threshold]
    unique = dedupe_overture(good)
    fresh, seen = [], set()
    for rec in unique:
        if rec['id'] in seen or is_osm_duplicate(rec, osm_grid):
            continue
        seen.add(rec['id'])
        fresh.append(rec)
    fresh.sort(key=lambda r: (fold(r['n']), r['a'], r['o']))
    return fresh, len(unique) - len(fresh)


def classify(result):
    """'ok' | 'dead' | 'unknown' for an HTTP status code or an exception raised by a request."""
    if isinstance(result, urllib.error.HTTPError):
        return classify(result.code)
    if isinstance(result, urllib.error.URLError):
        return classify(result.reason) if isinstance(result.reason, BaseException) else 'unknown'
    if isinstance(result, (socket.gaierror, ConnectionRefusedError)):
        return 'dead'
    if isinstance(result, int):
        if 200 <= result < 400 or result in (401, 403, 405, 429):
            return 'ok'
        if result in (404, 410):
            return 'dead'
    return 'unknown'


def normalise_url(url):
    """Lower-case host, no trailing '/'; a missing scheme becomes http://. None if not http(s)."""
    url = (url or '').strip()
    if not url:
        return None
    if '://' not in url:
        url = 'http://' + url
    try:
        parts = urllib.parse.urlsplit(url)
    except ValueError:
        return None
    if parts.scheme.lower() not in ('http', 'https') or not parts.netloc:
        return None
    return urllib.parse.urlunsplit(
        (parts.scheme.lower(), parts.netloc.lower(), parts.path, parts.query, parts.fragment)).rstrip('/')


def _status(url, method, extra=None):
    req = urllib.request.Request(url, method=method, headers={'User-Agent': WEB_USER_AGENT, **(extra or {})})
    try:
        with urllib.request.urlopen(req, timeout=WEB_TIMEOUT) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        return e.code


def _probe(url):
    """HEAD (GET with Range on 405/501); returns the status code or the exception raised."""
    try:
        status = _status(url, 'HEAD')
        if status in (405, 501):
            status = _status(url, 'GET', {'Range': 'bytes=0-0'})
        return status
    except Exception as e:  # classify() decides what it means
        return e


def _check_url(url, deadline):
    """(url, verdict), or (url, None) when the time budget ran out before the check started."""
    if time.monotonic() > deadline:
        return url, None
    first = classify(_probe(url))
    if first == 'ok':
        return url, first
    # http:// failed -> try https:// once, and vice versa.
    alt = ('https://' + url[7:]) if url.startswith('http://') else ('http://' + url[8:])
    second = classify(_probe(alt))
    if second == 'ok':
        return url, 'ok'
    return url, 'dead' if first == second == 'dead' else 'unknown'


def check_websites(items, cache_path=WEB_CACHE_FILE):
    """Mark records whose website is dead (drop w and v, set sp 1). Network only when YERIM_WEB_CHECK == '1'.

    Returns a stats dict for the report: mode 'network' | 'cache' | 'none', the counts, the cache date.
    """
    path = Path(cache_path)
    if not path.is_absolute():
        path = ROOT / path
    results, checked_on = {}, None
    if path.exists():
        try:
            doc = json.loads(path.read_text(encoding='utf-8'))
            results = dict(doc.get('results') or {})
            checked_on = doc.get('checked')
        except (ValueError, OSError, AttributeError):
            results = {}
    stats = {'mode': 'cache' if results or checked_on else 'none', 'checked': 0, 'ok': 0, 'dead': 0,
             'unknown': 0, 'marked': 0, 'date': checked_on}

    if os.environ.get('YERIM_WEB_CHECK') == '1':
        urls = {u for u in (normalise_url(i.get('w')) for i in items) if u}
        # Never-checked URLs first, then earlier 'unknown' ones, so a capped run makes progress over time.
        order = {None: 0, 'unknown': 1}
        todo = sorted(urls, key=lambda u: (order.get(results.get(u), 2), u))[:WEB_MAX_URLS]
        deadline = time.monotonic() + WEB_BUDGET
        with ThreadPoolExecutor(max_workers=WEB_WORKERS) as pool:
            for url, verdict in pool.map(lambda u: _check_url(u, deadline), todo):
                if verdict is None:
                    continue  # budget exhausted: stays as it was (unknown if never checked)
                results[url] = verdict
                stats['checked'] += 1
                stats[verdict] += 1
        stats['mode'] = 'network'
        stats['date'] = date.today().isoformat()
        doc = {
            '$comment': 'Generated by scripts/fetch-overture.py (YERIM_WEB_CHECK=1): liveness of Overture website URLs. '
                        'ok = answered (or blocked us), dead = 404/410, DNS failure or connection refused, '
                        'unknown = timeout, 5xx, SSL error or not checked.',
            'checked': stats['date'],
            'results': results,
        }
        path.write_text(json.dumps(doc, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n',
                        encoding='utf-8')

    if stats['mode'] != 'none':
        for rec in items:
            url = normalise_url(rec.get('w'))
            if url and results.get(url) == 'dead':
                rec.pop('w', None)
                rec.pop('v', None)
                rec['sp'] = 1
                stats['marked'] += 1
    return stats


def render(release, items):
    comment = (
        f'Generated by scripts/fetch-overture.py from Overture Maps places release {release}. '
        '© Overture Maps Foundation, CDLA-Permissive-2.0 (data from Meta, Microsoft and others). '
        'Food places not already in data/food-izmir.json (OpenStreetMap). Keys as in food-izmir.json; v 1 = corroborated (2+ sources or confidence ≥ 0.9); sp 1 = suspect (non-İzmir landline area code or kasap/şarküteri name).'
    )
    doc = {'$comment': comment, 'release': release, 'items': items}
    return json.dumps(doc, ensure_ascii=False, separators=(',', ':'))


def existing_count():
    if not OUT_FILE.exists():
        return 0
    try:
        return len(json.loads(OUT_FILE.read_text(encoding='utf-8')).get('items', []))
    except (ValueError, OSError):
        return 0


def previous_items():
    """Items of the file about to be overwritten ([] if missing or unreadable)."""
    if not OUT_FILE.exists():
        return []
    try:
        return json.loads(OUT_FILE.read_text(encoding='utf-8')).get('items', [])
    except (ValueError, OSError):
        return []


def diff_lines(old_items, items):
    """Report lines for what changed since the previous run, keyed by id."""
    new_ids = {r['id'] for r in items}
    old_ids = {r['id'] for r in old_items}
    gone = sorted((r for r in old_items if r['id'] not in new_ids), key=lambda r: (fold(r.get('n', '')), r['id']))
    lines = [f'- Önceki çalıştırmaya göre: +{len(new_ids - old_ids)} yeni, −{len(gone)} kaybolan']
    if gone:
        lines.append('- Kaybolanlardan örnekler: ' + ', '.join(r.get('n', r['id']) for r in gone[:10]))
    return lines


def web_line(web):
    if web['mode'] == 'network':
        return (f"- Web sitesi kontrolü: {web['checked']} kontrol edildi, {web['ok']} açık, "
                f"{web['dead']} açılmıyor, {web['unknown']} belirsiz")
    if web['mode'] == 'cache':
        return (f"- Web sitesi kontrolü: önbellekten ({web['date'] or '?'}), "
                f"{web['marked']} açılmayan site işaretlendi")
    return '- Web sitesi kontrolü: yapılmadı (önbellek yok)'


def append_report(release, raw, kept, dupes, items, size, threshold, dropped, web, diff):
    kinds = {}
    for r in items:
        kinds[r['k']] = kinds.get(r['k'], 0) + 1
    lines = [
        '',
        '## Overture Maps (CDLA-Permissive-2.0)',
        '',
        f'- Release: {release} ({date.today().isoformat()})',
        '- Izmir province polygon: found',
        f'- Raw candidates (food kinds inside the polygon): {raw}',
        f'- Kept (confidence >= {threshold}): {kept}',
        f'- Removed as OSM duplicates: {dupes}',
        f'- Doğrulanmış (2+ kaynak ya da güven ≥ 0,9): {sum(1 for r in items if r.get("v") == 1)}',
        f'- Ad süzgeciyle atılan: {sum(dropped.values())} (en sık 10 eşleşen kelime: '
        + (', '.join(f'{w} {n}' for w, n in dropped.most_common(10)) or '-') + ')',
        f'- Şüpheli (İzmir dışı sabit hat ya da kasap/şarküteri): {sum(1 for r in items if r.get("sp") == 1)}',
        web_line(web),
        *diff,
        '- Per kind: ' + ', '.join(f'{k} {n}' for k, n in sorted(kinds.items())),
        f'- data/food-overture-izmir.json: {size / 1024 / 1024:.2f} MB',
        '',
    ]
    section = '\n'.join(lines)
    text = REPORT_FILE.read_text(encoding='utf-8') if REPORT_FILE.exists() else ''
    heading = '## Overture Maps (CDLA-Permissive-2.0)'
    m = re.search(r'^' + re.escape(heading) + r'[^\n]*\n.*?(?=^## |\Z)', text, re.M | re.S)
    if m:
        # Replace the existing Overture section (up to the next "## " heading or EOF).
        tail = text[m.end():]
        text = text[:m.start()] + section.lstrip('\n') + ('\n' if tail else '') + tail
    else:
        text += section
    REPORT_FILE.write_text(text, encoding='utf-8')


def main():
    s3 = open_s3()
    release = find_release(s3)
    print(f'Overture release: {release}')
    poly = find_polygon(s3, release)
    if poly is None:
        fail('Izmir province polygon not found; nothing written')
    cands, raw, dropped = read_candidates(s3, release, poly)
    osm_grid = build_osm_grid(load_osm())
    threshold = MIN_CONFIDENCE
    items, dupes = select(cands, threshold, osm_grid)
    text = render(release, items)
    if len(text.encode('utf-8')) > MAX_BYTES:
        threshold = STRICT_CONFIDENCE
        print(f'file over {MAX_BYTES} bytes; raising confidence threshold to {threshold}')
        items, dupes = select(cands, threshold, osm_grid)
        text = render(release, items)
    web = check_websites(items)
    text = render(release, items)
    old = existing_count()
    if old and len(items) < MIN_KEEP_RATIO * old:
        print(f'refusing to write: {len(items)} items is under 70% of the existing {old}')
        return
    diff = diff_lines(previous_items(), items)
    OUT_FILE.write_text(text + '\n', encoding='utf-8')
    size = len(text.encode('utf-8')) + 1
    append_report(release, raw, len(items) + dupes, dupes, items, size, threshold, dropped, web, diff)
    print(f'wrote {len(items)} items ({size} bytes), {dupes} OSM duplicates removed')


def _selftest():
    for n in ('Veyseloğlu 2.el Fırın Ve Pastane Malzemeleri', 'Bucaspor Taraftarlar Lokali',
              'IQ Music and Performance Hall'):
        assert drop_reason(n), n
    for n in ('Kebapçı Seyit Usta', 'Marketing Cafe', 'Kasap Fuat Et Lokantası'):
        assert not drop_reason(n), n
    assert not is_suspect_name('Kasap Fuat Et Lokantası')
    for n in ('Kasap Ahmet', 'Erol Şarküteri'):
        assert not drop_reason(n) and is_suspect_name(n), n
    assert is_suspect_phone('+902663381104')
    assert not is_suspect_phone('+902324463476')
    assert not is_suspect_phone('+905393289990')
    assert not is_suspect_phone('(0232) 220 22 11')
    for status, want in ((200, 'ok'), (301, 'ok'), (403, 'ok'), (404, 'dead'), (410, 'dead'), (503, 'unknown')):
        assert classify(status) == want, status
    assert classify(socket.gaierror()) == 'dead'
    assert classify(socket.timeout()) == 'unknown'
    print('selftest ok')


if __name__ == '__main__':
    if '--selftest' in sys.argv[1:]:
        _selftest()
    else:
        main()

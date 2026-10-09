#!/usr/bin/env python3
"""Fetch food places in Izmir province from Overture Maps and write data/food-overture-izmir.json.

Usage: [OVERTURE_RELEASE=2025-10-22.0] python scripts/fetch-overture.py
Needs Python 3.11+, pyarrow and shapely (pip install pyarrow shapely).
"""
import json
import math
import os
import re
import sys
import unicodedata
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

BUCKET = 'overturemaps-us-west-2'
MIN_CONFIDENCE = 0.6
STRICT_CONFIDENCE = 0.7
MAX_BYTES = int(2.5 * 1024 * 1024)
MIN_KEEP_RATIO = 0.7  # refuse to shrink the file below this share of the old count
VERIFIED_CONFIDENCE = 0.9
VERIFIED_SOURCES = 2

CLOSED = ('permanently_closed', 'temporarily_closed')
BAD_NAME = re.compile(r'(eczane|anaokulu|ilkokulu|ortaokulu|lisesi)', re.I)

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
    rec = {
        'id': 'ov-' + row['id'].replace('-', '')[:16],
        'n': row['names']['primary'].strip(),
        'a': round((bb['ymin'] + bb['ymax']) / 2, 5),
        'o': round((bb['xmin'] + bb['xmax']) / 2, 5),
        'k': kind,
        'c': cuisines_of(row),
        'p': (row.get('phones') or [None])[0],
        'w': (row.get('websites') or [None])[0],
        'ad': ((row.get('addresses') or [{}])[0] or {}).get('freeform'),
        'v': 1 if is_corroborated(row) else None,
    }
    return {k: v for k, v in rec.items() if v}


def read_candidates(s3, release, poly):
    """All food places inside the polygon, with confidence; returns (list, raw count)."""
    dset = open_dataset(s3, release, 'places', 'place')
    cols = ['id', 'names', 'basic_category', 'taxonomy', 'confidence', 'operating_status',
            'phones', 'websites', 'addresses', 'bbox', 'sources']
    x0, y0, x1, y1 = poly.bounds
    prepared = prep(poly)
    out, raw = [], 0
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
            out.append((row.get('confidence') or 0.0, to_record(row, kind)))
    return out, raw


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


def render(release, items):
    comment = (
        f'Generated by scripts/fetch-overture.py from Overture Maps places release {release}. '
        '© Overture Maps Foundation, CDLA-Permissive-2.0 (data from Meta, Microsoft and others). '
        'Food places not already in data/food-izmir.json (OpenStreetMap). Keys as in food-izmir.json; v 1 = corroborated (2+ sources or confidence ≥ 0.9).'
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


def append_report(release, raw, kept, dupes, items, size, threshold):
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
    cands, raw = read_candidates(s3, release, poly)
    osm_grid = build_osm_grid(load_osm())
    threshold = MIN_CONFIDENCE
    items, dupes = select(cands, threshold, osm_grid)
    text = render(release, items)
    if len(text.encode('utf-8')) > MAX_BYTES:
        threshold = STRICT_CONFIDENCE
        print(f'file over {MAX_BYTES} bytes; raising confidence threshold to {threshold}')
        items, dupes = select(cands, threshold, osm_grid)
        text = render(release, items)
    old = existing_count()
    if old and len(items) < MIN_KEEP_RATIO * old:
        print(f'refusing to write: {len(items)} items is under 70% of the existing {old}')
        return
    OUT_FILE.write_text(text + '\n', encoding='utf-8')
    size = len(text.encode('utf-8')) + 1
    append_report(release, raw, len(items) + dupes, dupes, items, size, threshold)
    print(f'wrote {len(items)} items ({size} bytes), {dupes} OSM duplicates removed')


if __name__ == '__main__':
    main()

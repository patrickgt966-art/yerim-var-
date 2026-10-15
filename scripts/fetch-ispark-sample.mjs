// Captures a small live sample of the İSPARK API (api.ibb.gov.tr) into data/raw/ so the
// real response shape can be reviewed. Never fails: errors are written as { error }.
//
// Usage: node scripts/fetch-ispark-sample.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://api.ibb.gov.tr/ispark';
const UA = 'yerim-var data refresh (github.com/patrickgt966-art/yerim-var-)';

async function get(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // not JSON: keep a text excerpt
    }
    return { status: res.status, json, text: json === null ? text.slice(0, 2000) : null };
  } finally {
    clearTimeout(timer);
  }
}

const save = (file, payload) =>
  writeFile(path.join(root, 'data/raw', file), JSON.stringify(payload, null, 1) + '\n');

await mkdir(path.join(root, 'data/raw'), { recursive: true });

let first = null;
try {
  const r = await get(`${BASE}/Park`);
  const list = Array.isArray(r.json)
    ? r.json
    : (Object.values(r.json ?? {}).find((v) => Array.isArray(v)) ?? []);
  first = list[0] ?? null;
  await save('ispark-sample.json', {
    url: `${BASE}/Park`,
    status: r.status,
    total: list.length,
    records: list.slice(0, 20),
    ...(r.text ? { text: r.text } : {}),
  });
  console.log(`İSPARK Park: HTTP ${r.status}, ${list.length} kayıt`);
} catch (e) {
  await save('ispark-sample.json', { error: String(e?.message ?? e) }).catch(() => {});
  console.warn(`İSPARK Park başarısız: ${e?.message ?? e}`);
}

try {
  const id = first?.parkID ?? first?.parkId ?? first?.ParkID ?? first?.id;
  if (id == null) throw new Error('ilk kayıtta parkID bulunamadı');
  const tried = [];
  let result = null;
  for (const param of ['id', 'parkID']) {
    const url = `${BASE}/ParkDetay?${param}=${encodeURIComponent(id)}`;
    const r = await get(url);
    tried.push({ url, status: r.status });
    result = { url, status: r.status, tried, detail: r.json, ...(r.text ? { text: r.text } : {}) };
    if (r.status >= 200 && r.status < 300 && r.json != null) break;
  }
  await save('ispark-detail-sample.json', result);
  console.log(`İSPARK ParkDetay: HTTP ${result.status}`);
} catch (e) {
  await save('ispark-detail-sample.json', { error: String(e?.message ?? e) }).catch(() => {});
  console.warn(`İSPARK ParkDetay başarısız: ${e?.message ?? e}`);
}

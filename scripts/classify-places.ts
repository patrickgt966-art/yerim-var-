/* eslint-disable import/no-unresolved -- SDK lives in server/yerim-ai/node_modules, absent in the main CI job. */
/**
One-time (incremental) AI classification of the places whose food category the rules do not read
 * from a name keyword or a cuisine tag (src/data/restaurants.ts: categorySource): places in no
 * category (hotels, markets, clubs ...) and places that only get their kind's fallback category
 * (a plain restaurant is lokanta). The answers go to data/category-guess.json, which the
 * app bundles and uses as an *estimated* category. The app itself never calls the AI for this.
 *
 * Uses the Anthropic Message Batches API (half price, asynchronous): one request per chunk of 40
 * places, all in one batch, polled every 60 s. Later runs only ask about places that are in neither
 * `items` of data/category-guess.json nor in data/category-guess-seen.json (script only, never bundled).
 *
 * Usage: ANTHROPIC_API_KEY=... npx tsx scripts/classify-places.ts [--dry-run] [--limit N]
 *   --dry-run  print the candidates per city and the estimated cost, then stop (needs no key)
 *   --limit N  ask about at most N places (cities in order)
 * The pure parts (chunks, prompt, parsing, merge, cost) are in scripts/classify/core.ts.
 */
import './site/nativeStubs'; // must stay first: it stands in for react-native

import * as fs from 'node:fs';
import * as path from 'node:path';

import Anthropic from '../server/yerim-ai/node_modules/@anthropic-ai/sdk/index.mjs';

import { CITIES, setActiveCity } from '@/data/cities';
import { distanceMeters } from '@/data/geo';
import {
  allRestaurants,
  categoryByRules,
  categorySource,
  type FoodCategory,
} from '@/data/restaurants';
import { fold, resetSearchIndex, searchPlaces } from '@/data/search';

import {
  MODEL,
  addUsage,
  buildParams,
  chunk,
  costUsd,
  customId,
  doneIds,
  emptyUsage,
  estimateCost,
  mergeGuess,
  nearestDistrict,
  parseAnswer,
  parseCustomId,
  pickCandidates,
  textOf,
  type Candidate,
  type Classified,
  type GuessFile,
  type SeenFile,
} from './classify/core';

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'data/category-guess.json');
const SEEN = path.join(ROOT, 'data/category-guess-seen.json');
const POLL_MS = 60_000;

function readArgs(argv: string[]): { dryRun: boolean; limit: number } {
  let limit = Infinity;
  const at = argv.findIndex((a) => a === '--limit' || a.startsWith('--limit='));
  if (at >= 0) {
    const raw = argv[at]!.includes('=') ? argv[at]!.split('=')[1] : argv[at + 1];
    const n = Number(raw);
    if (raw !== undefined && raw !== '') {
      if (!Number.isInteger(n) || n < 1)
        throw new Error(`--limit needs a whole number, got "${raw}"`);
      limit = n;
    }
  }
  return { dryRun: argv.includes('--dry-run'), limit };
}

function readExisting(): { guess: GuessFile; seen: string[] } {
  const read = <T>(file: string): Partial<T> =>
    fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<T>) : {};
  const guess = read<GuessFile>(OUT);
  return { guess: { ...guess, items: guess.items ?? {} }, seen: read<SeenFile>(SEEN).seen ?? [] };
}

/** District centres of the active city, found by the place search like scripts/build-site.ts does. */
function districtCenters(names: readonly string[]): { name: string; lat: number; lng: number }[] {
  const out: { name: string; lat: number; lng: number }[] = [];
  for (const name of names) {
    const want = fold(name);
    const hit = searchPlaces(name, 6).find((h) => !h.far && fold(h.name) === want);
    if (hit) out.push({ name, lat: hit.lat, lng: hit.lng });
  }
  return out;
}

type Chunk = { city: string; places: Candidate[] };

async function main(): Promise<void> {
  const { dryRun, limit } = readArgs(process.argv.slice(2));
  const existing = readExisting();
  const done = doneIds(existing.guess.items, existing.seen);
  console.log(
    `${path.relative(ROOT, OUT)}: ${Object.keys(existing.guess.items).length} classified; ` +
      `${path.relative(ROOT, SEEN)}: ${existing.seen.length} seen`,
  );

  // Candidates per open city: in no category by the rules, not asked about yet.
  const byCity: { city: string; places: Candidate[] }[] = [];
  let left = limit;
  for (const city of CITIES.filter((c) => c.available)) {
    setActiveCity(city.id);
    resetSearchIndex();
    const centers = districtCenters(city.districts);
    // Not read from a name keyword or cuisine tag: no category at all, or only the kind's fallback.
    const open = allRestaurants().filter((r) => categorySource(r) !== 'rules');
    const picked = pickCandidates(open, done, left);
    left -= picked.length;
    const sources = picked.map((r) => categorySource(r));
    const none = sources.filter((x) => x === null).length;
    byCity.push({
      city: city.id,
      places: picked.map((r) => ({
        id: r.id,
        current: categoryByRules(r),
        name: r.name,
        kind: r.kind,
        cuisine: r.cuisines.join(';'),
        district: nearestDistrict(centers, r, distanceMeters),
      })),
    });
    console.log(
      `  ${city.id}: ${open.length} not decided by name or tag, ${picked.length} to classify ` +
        `(${picked.length - none} fallback by kind, ${none} in no category)`,
    );
  }

  const chunks = new Map<string, Chunk>();
  for (const { city, places } of byCity) {
    chunk(places).forEach((c, k) => chunks.set(customId(city, k), { city, places: c }));
  }
  const total = byCity.reduce((n, c) => n + c.places.length, 0);
  const est = estimateCost([...chunks.values()].map((c) => c.places));
  console.log(
    `candidates: ${total} in ${chunks.size} requests; estimated cost (batch prices, rough, no cache hit assumed): ` +
      `$${est.usd.toFixed(4)} (~${est.usage.input} input, ~${est.usage.output} output tokens)`,
  );
  if (dryRun) {
    console.log('dry run: nothing submitted.');
    return;
  }
  if (total === 0) {
    console.log('nothing to classify.');
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set (use --dry-run to see the plan without it)');
  }

  const client = new Anthropic();
  const batch = await client.messages.batches.create({
    requests: [...chunks].map(([id, c]) => ({ custom_id: id, params: buildParams(c.places) })),
  });
  console.log(`batch ${batch.id} submitted (${chunks.size} requests); polling every 60 s`);
  for (;;) {
    const state = await client.messages.batches.retrieve(batch.id);
    if (state.processing_status === 'ended') {
      const n = state.request_counts;
      console.log(
        `batch ended: ${n.succeeded} succeeded, ${n.errored} errored, ${n.expired} expired, ${n.canceled} canceled`,
      );
      break;
    }
    console.log(
      `  ${state.processing_status}: ${state.request_counts.processing} requests still processing`,
    );
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }

  // Results come in any order: key them by custom_id.
  const usage = emptyUsage();
  const fresh: { id: string; answer: Classified; current: FoodCategory | null }[] = [];
  const skipped: string[] = [];
  for await (const r of await client.messages.batches.results(batch.id)) {
    const c = chunks.get(r.custom_id);
    if (!c || !parseCustomId(r.custom_id)) {
      skipped.push(`${r.custom_id}: not a request of this run`);
      continue;
    }
    if (r.result.type !== 'succeeded') {
      skipped.push(`${r.custom_id}: ${r.result.type}`);
      continue;
    }
    const message = r.result.message;
    addUsage(usage, message.usage);
    const text = textOf(message);
    if ('skip' in text) {
      skipped.push(`${r.custom_id}: ${text.skip}`);
      continue;
    }
    const parsed = parseAnswer(text.text, c.places.length);
    if (!parsed.ok) {
      skipped.push(`${r.custom_id}: ${parsed.reason}`);
      continue;
    }
    for (const [i, answer] of parsed.answers)
      fresh.push({ id: c.places[i]!.id, answer, current: c.places[i]!.current });
    const missing = c.places.length - parsed.answers.size;
    if (missing > 0)
      skipped.push(
        `${r.custom_id}: ${missing} of ${c.places.length} places unanswered (asked again next run)`,
      );
  }

  if (fresh.length > 0) {
    const merged = mergeGuess(existing.guess, existing.seen, fresh, {
      generatedAt: new Date().toISOString(),
      model: MODEL,
    });
    fs.writeFileSync(OUT, JSON.stringify(merged.guess, null, 2) + '\n');
    fs.writeFileSync(SEEN, JSON.stringify(merged.seen, null, 2) + '\n');
    console.log(
      `wrote ${path.relative(ROOT, OUT)}: ${Object.keys(merged.guess.items).length} classified; ` +
        `${path.relative(ROOT, SEEN)}: ${merged.seen.seen.length} seen`,
    );
  } else {
    console.log('no usable answers; file unchanged.');
  }
  console.log(
    `tokens: input ${usage.input}, cache read ${usage.cacheRead}, cache write ${usage.cacheWrite}, output ${usage.output}; ` +
      `cost $${costUsd(usage).toFixed(4)} (batch prices)`,
  );
  if (skipped.length > 0) {
    console.log(`skipped / incomplete: ${skipped.length}`);
    for (const s of skipped) console.log(`  ${s}`);
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

// Does the dish a reading (or a search) holds fit the dish a case expects? The expectation is a
// list of folded stems ("carbona", "iskend", "sebasti"); the reading is whatever spelling the model
// or the user used ("karbonara", "kesadilya", "cheesecake" for a San Sebastian). Both sides go
// through the app's own dish resolvers (foodLexicon's alias table, the dish dictionary of
// dishes.ts) and then through a sound fold, so a transliteration is the same dish.
import { DISHES, dishProfile } from '../dishes';
import { aliasTargets, respellAlias } from '../foodLexicon';
import { fold } from '@/lib/ai/protocol';

/**
 * The sound of a folded text: c/q -> k, w -> v, x -> ks, ph -> f, the voiced stops b d g as their
 * voiceless p t k (kebab = kebap), y dropped, doubled letters once. "carbonara" and "karbonara",
 * "quesadilla" and "kesadilya", "kebab" and "kebap" fold alike.
 */
export function soundOf(text: string): string {
  return fold(text)
    .replace(/qu/g, 'k')
    .replace(/ph/g, 'f')
    .replace(/[cq]/g, 'k')
    .replace(/w/g, 'v')
    .replace(/x/g, 'ks')
    .replace(/b/g, 'p')
    .replace(/d/g, 't')
    .replace(/g/g, 'k')
    .replace(/y/g, '')
    .replace(/([a-z])\1+/g, '$1');
}

/** The spellings the app's resolvers know for a folded dish text: itself, its alias and its dictionary dish. */
function formsOf(text: string): string[] {
  const f = fold(text);
  if (f === '') return [];
  const out = new Set<string>([f]);
  const alias = respellAlias(f);
  if (alias) out.add(alias.folded);
  for (const word of f.split(' ')) {
    const w = respellAlias(word);
    if (w) out.add(w.folded);
  }
  const profile = dishProfile(f, false);
  if (profile) out.add(profile.dish);
  return [...out];
}

/** The dishes a stem of an expected dish name may stand for: the stem, alias targets, dictionary dishes. */
function expansionsOf(stem: string): string[] {
  const w = fold(stem);
  const out = new Set<string>([w]);
  for (const t of aliasTargets(w)) out.add(t);
  for (const p of DISHES) if (w.length >= 3 && p.dish.startsWith(w)) out.add(p.dish);
  return [...out];
}

/**
 * True when `got` (a reading's or a search's dish) is one of the expected dishes `wants` (folded
 * stems): by plain fold, or through the alias resolver and the sound fold on both sides.
 */
export function dishFits(got: string | null | undefined, wants: readonly string[]): boolean {
  const g = fold(got ?? '');
  if (g === '') return false;
  if (wants.some((w) => g.includes(fold(w)))) return true;
  const gotSounds = formsOf(g).map(soundOf);
  return wants.some((w) =>
    expansionsOf(w).some((x) => {
      const s = soundOf(x);
      return s !== '' && gotSounds.some((gs) => gs.includes(s));
    }),
  );
}

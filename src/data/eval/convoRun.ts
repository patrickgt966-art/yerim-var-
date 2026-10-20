// Plays one conversation of the convo eval through the app's real assistant (answer / refine /
// pickFromCards of src/data/assistant.ts), the way the chat screen (src/app/sohbet.tsx) drives it:
// the same context carried from turn to turn, the same history sent to the router, a tapped chip
// applied the way the screen applies it, a typed answer to Yerim's question, and a changed city
// starting the thread over. The AI layer is a `ConvoAi`; the live eval binds it to the model with
// the Worker's prompts, a test binds it to a fake. What the user saw comes back as ObservedTurn.
import { aiHistory } from '@/components/chat/model';
import {
  answer,
  askParking,
  emptyContext,
  pickFromCards,
  refine,
  type AssistantDeps,
  type BotMessage,
  type ChatAction,
  type ChatCard,
  type ChatContext,
} from '@/data/assistant';
import { CHOICES, memberLabel } from '@/data/choices';
import { activeCity, setActiveCity } from '@/data/cities';
import { getRestaurant } from '@/data/restaurants';
import { staticParkings } from '@/data/staticParkings';
import i18n from '@/i18n';
import { validateReply } from '@/lib/ai/replyCheck';
import {
  REPLY_TIMEOUT_MS,
  ROUTER_TIMEOUT_MS,
  type AiReplyFacts,
  type AiReplyKind,
  type ChatTurn,
  type ParkPickCandidate,
  type ParkPickResponse,
  type PickCandidate,
  type PickResponse,
  type PlanCandidate,
  type PlanResponse,
  type PlanWhen,
  type Understanding,
  fold,
} from '@/lib/ai/protocol';
import { KIND_TAP, type ConvoCase, type ConvoTurn } from './convoCases';
import type { ObservedAction, ObservedCard, ObservedTurn, ObservedWording } from './convoScore';

/**
 * The model behind the AI layer. A method that throws is an outage (the turn is void and the run is
 * repeated); one that returns null made no usable answer (the app falls back to its own rules).
 */
export type ConvoAi = {
  understand(req: {
    text: string;
    history: ChatTurn[];
    section: 'park' | 'food';
    city: string;
    lastCards?: { count: number; kind: 'restaurant' | 'parking' };
  }): Promise<Understanding | null>;
  pick(req: {
    text: string;
    candidates: PickCandidate[];
    city: string;
  }): Promise<PickResponse | null>;
  pickPark(req: {
    text: string;
    candidates: ParkPickCandidate[];
    city: string;
  }): Promise<ParkPickResponse | null>;
  plan(req: {
    text: string;
    when: PlanWhen;
    candidates: PlanCandidate[];
    city: string;
  }): Promise<PlanResponse | null>;
  reply(req: {
    userText: string;
    kind: AiReplyKind;
    facts: AiReplyFacts;
    city: string;
  }): Promise<string | null>;
};

export type Transcript = {
  turns: ObservedTurn[];
  /** An AI call failed for a reason that is not the model's: the conversation must be played again. */
  infra: boolean;
  /** The assistant itself threw (a bug the screen would show as "something went wrong"). */
  error?: string;
};

/** Saturday 17 October 2026 at `hour` o'clock Istanbul time (UTC+3), so a run is reproducible. */
export const eveningOf = (hour: number): Date => new Date(Date.UTC(2026, 9, 17, hour - 3, 0, 0));

const message = (e: unknown): string =>
  (e instanceof Error ? e.message : 'unknown error').split('\n')[0]!.slice(0, 200);

type Resolved = { kind: 'chip'; action: ChatAction } | { kind: 'missing' };

const KIND_LABELS = new Set(CHOICES.flatMap((e) => e.members.map((m) => memberLabel(m, 'tr'))));

/** The chip of the last reply a tap names: "@n" is the nth kind chip, else the label (folded too). */
function chipOf(last: BotMessage | null, label: string): Resolved {
  const actions = (last?.actions ?? []).filter((a) => a.kind !== 'open');
  const nth = KIND_TAP.exec(label);
  if (nth) {
    const kinds = actions.filter((a) => KIND_LABELS.has(a.label));
    const hit = kinds[Math.min(Number(nth[1]), kinds.length) - 1];
    return hit ? { kind: 'chip', action: hit } : { kind: 'missing' };
  }
  const hit =
    actions.find((a) => a.label === label) ?? actions.find((a) => fold(a.label) === fold(label));
  return hit ? { kind: 'chip', action: hit } : { kind: 'missing' };
}

const observedCard = (c: ChatCard): ObservedCard => ({
  kind: c.kind,
  name: c.name,
  parkingM: c.kind === 'restaurant' ? c.parkingM : null,
  distanceM: c.distanceM,
  parkAsked: c.kind === 'restaurant' && c.parkAsked === true,
});

/**
 * A tap on "Yol tarifi" of a food card, the way the chat screen takes it: a card of an ask with
 * parking opens the map at once, any other one asks the parking question first.
 */
function directionsTap(
  card: Extract<ChatCard, { kind: 'restaurant' }>,
  ctx: ChatContext,
  deps: AssistantDeps,
): { reply: BotMessage; ctx: ChatContext } {
  const r = getRestaurant(card.id);
  if (card.parkAsked && r) {
    const directions = { lat: r.lat, lng: r.lng, name: r.name };
    return { reply: { text: '', cards: [], actions: [], directions }, ctx };
  }
  return askParking(card, ctx, deps);
}

/** Plays the conversation; never throws. */
export async function playConversation(c: ConvoCase, ai: ConvoAi): Promise<Transcript> {
  let city: string = c.city;
  setActiveCity(city);
  let ctx: ChatContext = emptyContext(c.section);
  let messages: ChatTurn[] = [];
  let last: BotMessage | null = null;
  const now = eveningOf(c.hour);
  const out: Transcript = { turns: [], infra: false };

  for (const turn of c.turns) {
    // The thread belongs to one city: another city starts it over, as the screen does.
    if (turn.input.type === 'say' && turn.input.city && turn.input.city !== city) {
      city = turn.input.city;
      setActiveCity(city);
      ctx = emptyContext(c.section);
      messages = [];
      last = null;
    }
    const obs = await playTurn(turn, { ai, ctx, messages, last, now });
    out.turns.push(obs.observed);
    if (obs.observed.infra) out.infra = true;
    if (obs.error) {
      out.error = obs.error;
      break;
    }
    ctx = obs.ctx;
    last = obs.reply;
    messages = [
      ...messages,
      { role: 'user', text: obs.observed.input },
      { role: 'bot', text: obs.reply.text },
    ];
  }
  return out;
}

type TurnState = {
  ai: ConvoAi;
  ctx: ChatContext;
  messages: ChatTurn[];
  last: BotMessage | null;
  now: Date;
};

async function playTurn(
  turn: ConvoTurn,
  s: TurnState,
): Promise<{ observed: ObservedTurn; ctx: ChatContext; reply: BotMessage; error?: string }> {
  const { ai, ctx, now } = s;
  const city = activeCity();
  const label = turn.input.text;
  const observed: ObservedTurn = {
    input: label,
    tapMissing: false,
    routerCalls: 0,
    understood: null,
    routerFailed: false,
    text: '',
    cards: [],
    actions: [],
    ctx: {
      place: null,
      cat: null,
      dish: null,
      requireParking: false,
      freeParking: false,
      ask: null,
      choice: null,
    },
    wordings: [],
    directions: null,
    parkAsk: { before: ctx.parkAsk?.name ?? null, after: null },
    infra: false,
  };
  const pending: Promise<unknown>[] = [];
  const outage = (e: unknown) => {
    observed.infra = true;
    observed.error = message(e);
  };
  const history = aiHistory(s.messages, 0);
  const earlier = history
    .filter((h) => h.role === 'user')
    .map((h) => h.text)
    .reverse();

  const deps: AssistantDeps = {
    here: async () => city.center,
    geocode: async () => null,
    parkings: staticParkings(),
    t: (key, opts) => i18n.t(key, { city: city.name, ...opts }) as string,
    now,
    ai: {
      understand: async (_text, lastCards) => {
        observed.routerCalls++;
        const started = Date.now();
        try {
          const u = await ai.understand({
            text: observedText,
            history,
            section: ctx.section,
            city: city.id,
            ...(lastCards ? { lastCards } : {}),
          });
          // The app gave up waiting at ROUTER_TIMEOUT_MS: it answered without the AI.
          if (Date.now() - started > ROUTER_TIMEOUT_MS) {
            outage(new Error('the router answered after the app stopped waiting'));
            return { ok: false, reason: 'error', detail: 'timeout' };
          }
          if (!u) {
            observed.routerFailed = true;
            return { ok: false, reason: 'error', detail: 'schema' };
          }
          observed.understood = u;
          return { ok: true, value: u, remaining: 99 };
        } catch (e) {
          observed.routerFailed = true;
          outage(e);
          return { ok: false, reason: 'error', detail: 'network' };
        }
      },
      earlier: () => earlier,
      usesLeft: () => 99,
      pick: async (req) => {
        try {
          const v = await ai.pick({ text: req.text, candidates: req.candidates, city: city.id });
          return v ? { ok: true, value: v, remaining: 99 } : { ok: false, reason: 'error' };
        } catch (e) {
          outage(e);
          return { ok: false, reason: 'error' };
        }
      },
      pickPark: async (req) => {
        try {
          const v = await ai.pickPark({
            text: req.text,
            candidates: req.candidates,
            city: city.id,
          });
          return v ? { ok: true, value: v, remaining: 99 } : { ok: false, reason: 'error' };
        } catch (e) {
          outage(e);
          return { ok: false, reason: 'error' };
        }
      },
      plan: async (req) => {
        try {
          const v = await ai.plan({
            text: req.text,
            when: req.when,
            candidates: req.candidates,
            city: city.id,
          });
          return v ? { ok: true, value: v, remaining: 99 } : { ok: false, reason: 'error' };
        } catch (e) {
          outage(e);
          return { ok: false, reason: 'error' };
        }
      },
      reply: (req) => {
        const started = Date.now();
        const p = (async () => {
          const w: ObservedWording = {
            kind: req.kind,
            raw: null,
            accepted: null,
            shown: false,
            late: false,
            hasFreeSpots: (req.facts.items ?? []).some((i) => i.freeSpots !== undefined),
          };
          observed.wordings.push(w);
          try {
            w.raw = await ai.reply({ ...req, city: city.id });
          } catch (e) {
            outage(e);
          }
          w.late = Date.now() - started > REPLY_TIMEOUT_MS;
          w.accepted = validateReply(w.raw, req.facts, {
            kind: req.kind,
            allow: [city.name, ...city.districts],
          });
          return w.raw;
        })();
        pending.push(p);
        return p;
      },
      quotaNotice: () => false,
      failNotice: () => true,
    },
  };

  // What the user did: a tap on a chip, or a typed message (also a tapped "say" chip).
  let observedText = label;
  let chip: ChatAction | null = null;
  if (turn.input.type === 'tap') {
    const hit = chipOf(s.last, label);
    if (hit.kind === 'chip') {
      chip = hit.action;
      // The user sees what they tapped: the chip's own label.
      observed.input = chip.label;
      if (chip.kind === 'say') observedText = chip.text;
    } else observed.tapMissing = true;
  }
  // "Yol tarifi" on a food card, as the chat screen does it: the parking offer, or the map at once.
  const card =
    turn.input.type === 'directions'
      ? s.last?.cards.find(
          (c): c is Extract<ChatCard, { kind: 'restaurant' }> => c.kind === 'restaurant',
        )
      : undefined;
  if (turn.input.type === 'directions' && !card) observed.tapMissing = true;
  let reply: BotMessage;
  let nextCtx: ChatContext;
  try {
    const res = card
      ? directionsTap(card, ctx, deps)
      : chip?.kind === 'refine'
        ? await refine(ctx, chip.patch, deps)
        : chip?.kind === 'pick'
          ? await pickFromCards(chip.cards, chip.query, ctx, deps)
          : await answer(observedText, ctx, deps);
    reply = res.reply;
    nextCtx = res.ctx;
  } catch (e) {
    await Promise.allSettled(pending);
    return {
      observed: { ...observed, text: '' },
      ctx,
      reply: { text: '', cards: [], actions: [] },
      error: `assistant threw: ${message(e)}`,
    };
  }
  // A wording still running when the app stopped waiting is late: it is settled before scoring.
  await Promise.allSettled(pending);
  for (const w of observed.wordings) {
    w.shown = w.accepted !== null && !w.late && reply.text.includes(w.accepted);
  }

  observed.text = reply.text;
  observed.cards = reply.cards.map(observedCard);
  observed.actions = reply.actions.map((a): ObservedAction => ({ kind: a.kind, label: a.label }));
  observed.directions = reply.directions ? { name: reply.directions.name } : null;
  observed.parkAsk = { before: ctx.parkAsk?.name ?? null, after: nextCtx.parkAsk?.name ?? null };
  observed.ctx = {
    place: nextCtx.place?.label ?? null,
    cat: nextCtx.cat,
    dish: nextCtx.dish,
    requireParking: nextCtx.requireParking,
    freeParking: nextCtx.freeParking,
    ask: nextCtx.ask ?? null,
    choice: nextCtx.choice ?? null,
  };
  return { observed, ctx: nextCtx, reply };
}

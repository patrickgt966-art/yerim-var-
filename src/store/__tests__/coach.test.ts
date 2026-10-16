import AsyncStorage from '@react-native-async-storage/async-storage';

import { COACH_STEPS, resolveStep, useCoach, type CoachKey } from '../coach';

const KEY = 'yerim-var/coach';
const ALL: readonly CoachKey[] = COACH_STEPS;

async function rehydrateWith(state: Record<string, unknown>) {
  await AsyncStorage.setItem(KEY, JSON.stringify({ state, version: 1 }));
  await useCoach.persist.rehydrate();
}

describe('coach store', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useCoach.setState({ coachDone: false, step: 0 });
  });

  it('starts not done, at the first step', () => {
    expect(useCoach.getState().coachDone).toBe(false);
    expect(useCoach.getState().step).toBe(0);
  });

  it('walks the steps in order and sets coachDone after the last', () => {
    const seen: number[] = [useCoach.getState().step];
    for (let i = 0; i < COACH_STEPS.length - 1; i++) {
      useCoach.getState().next(ALL);
      seen.push(useCoach.getState().step);
      expect(useCoach.getState().coachDone).toBe(false);
    }
    expect(seen).toEqual([0, 1, 2, 3]);
    useCoach.getState().next(ALL);
    expect(useCoach.getState().coachDone).toBe(true);
  });

  it('skips a step whose target is missing (the ✨ pill without AI consent)', () => {
    const noAi = ALL.filter((k) => k !== 'ai');
    expect(resolveStep(1, noAi)).toBe(2);
    useCoach.getState().next(noAi);
    expect(useCoach.getState().step).toBe(2);
  });

  it('finishes when no later target is left', () => {
    useCoach.setState({ step: 2 });
    useCoach.getState().next(['yerim', 'ai', 'city']);
    expect(useCoach.getState().coachDone).toBe(true);
    expect(resolveStep(0, [])).toBeNull();
  });

  it('skip ends the tour at once', () => {
    useCoach.getState().skip();
    expect(useCoach.getState().coachDone).toBe(true);
  });

  it('persists coachDone and keeps it after a restart (rehydrate)', async () => {
    useCoach.getState().skip();
    await new Promise((r) => setTimeout(r, 0));
    const stored = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}');
    expect(stored.state).toEqual({ coachDone: true });
    const saved = (await AsyncStorage.getItem(KEY)) ?? '';
    // Simulate a restart: a fresh in-memory store, the saved string still in storage.
    useCoach.setState({ coachDone: false, step: 3 });
    await new Promise((r) => setTimeout(r, 0));
    await AsyncStorage.setItem(KEY, saved);
    await useCoach.persist.rehydrate();
    expect(useCoach.getState().coachDone).toBe(true);
    // The step is not persisted: an interrupted tour starts over.
    expect(useCoach.getState().step).toBe(3);
  });

  it('does not persist the step', async () => {
    useCoach.getState().next(ALL);
    await new Promise((r) => setTimeout(r, 0));
    const stored = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}');
    expect(stored.state).toEqual({ coachDone: false });
  });

  it('treats corrupt persisted values as not done', async () => {
    await rehydrateWith({ coachDone: 'yes' });
    expect(useCoach.getState().coachDone).toBe(false);
    await rehydrateWith({ coachDone: true });
    expect(useCoach.getState().coachDone).toBe(true);
  });
});

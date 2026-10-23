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
    useCoach.setState({ coachDone: false, step: 0, seenHints: [] });
  });

  it('starts not done, at the first step', () => {
    expect(useCoach.getState().coachDone).toBe(false);
    expect(useCoach.getState().step).toBe(0);
  });

  it("tours the home screen's main jobs, then the map tab and the Yerim button", () => {
    expect([...COACH_STEPS]).toEqual(['search', 'park', 'food', 'map', 'yerim']);
  });

  it('walks every step, then sets coachDone', () => {
    for (let i = 1; i < COACH_STEPS.length; i++) {
      useCoach.getState().next(ALL);
      expect(useCoach.getState().step).toBe(i);
      expect(useCoach.getState().coachDone).toBe(false);
    }
    useCoach.getState().next(ALL);
    expect(useCoach.getState().coachDone).toBe(true);
  });

  it('skips steps whose target is not on screen', () => {
    useCoach.getState().next(['search', 'map']);
    expect(useCoach.getState().step).toBe(3);
  });

  it('finishes when no target is left on screen', () => {
    useCoach.getState().next([]);
    expect(useCoach.getState().coachDone).toBe(true);
    expect(resolveStep(0, [])).toBeNull();
    expect(resolveStep(0, ['search'])).toBe(0);
    expect(resolveStep(1, ['search'])).toBeNull();
  });

  it('skip ends the tour at once', () => {
    useCoach.getState().skip();
    expect(useCoach.getState().coachDone).toBe(true);
  });

  it('persists coachDone and keeps it after a restart (rehydrate)', async () => {
    useCoach.getState().skip();
    await new Promise((r) => setTimeout(r, 0));
    const stored = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}');
    expect(stored.state).toEqual({ coachDone: true, seenHints: [] });
    const saved = (await AsyncStorage.getItem(KEY)) ?? '';
    // Simulate a restart: a fresh in-memory store, the saved string still in storage.
    useCoach.setState({ coachDone: false, step: 1 });
    await new Promise((r) => setTimeout(r, 0));
    await AsyncStorage.setItem(KEY, saved);
    await useCoach.persist.rehydrate();
    expect(useCoach.getState().coachDone).toBe(true);
    // The step is not persisted: an interrupted tour starts over.
    expect(useCoach.getState().step).toBe(1);
  });

  it('does not persist the step', async () => {
    useCoach.setState({ step: 1 });
    await new Promise((r) => setTimeout(r, 0));
    const stored = JSON.parse((await AsyncStorage.getItem(KEY)) ?? '{}');
    expect(stored.state).toEqual({ coachDone: false, seenHints: [] });
  });

  it('remembers first-visit hints once, and keeps only known ones', async () => {
    useCoach.getState().seeHint('profil');
    useCoach.getState().seeHint('profil');
    expect(useCoach.getState().seenHints).toEqual(['profil']);
    await rehydrateWith({ coachDone: true, seenHints: ['favoriler', 'nope', 3] });
    expect(useCoach.getState().seenHints).toEqual(['favoriler']);
    await rehydrateWith({ coachDone: true, seenHints: 'x' });
    expect(useCoach.getState().seenHints).toEqual([]);
    useCoach.getState().seeHint('favoriler');
    useCoach.getState().reset();
    expect(useCoach.getState().seenHints).toEqual([]);
  });

  it('treats corrupt persisted values as not done', async () => {
    await rehydrateWith({ coachDone: 'yes' });
    expect(useCoach.getState().coachDone).toBe(false);
    await rehydrateWith({ coachDone: true });
    expect(useCoach.getState().coachDone).toBe(true);
  });
});

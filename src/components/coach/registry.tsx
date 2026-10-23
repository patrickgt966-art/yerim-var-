import { useCallback, useEffect, useRef } from 'react';
import { type StyleProp, View, type ViewStyle } from 'react-native';
import { create } from 'zustand';

import { type CoachKey, useCoach } from '@/store/coach';

export type Rect = { x: number; y: number; w: number; h: number };

type Registry = {
  /** Window rects (measureInWindow) of the coach targets, by key. */
  rects: Partial<Record<CoachKey, Rect>>;
  /** The home tab is the focused screen. The tour only runs there. */
  homeFocused: boolean;
  setRect: (key: CoachKey, rect: Rect) => void;
  clearRect: (key: CoachKey) => void;
  setHomeFocused: (v: boolean) => void;
};

export const useCoachRegistry = create<Registry>()((set) => ({
  rects: {},
  homeFocused: false,
  setRect: (key, rect) =>
    set((s) => {
      const old = s.rects[key];
      // Same rect: keep the state object, so nothing re-renders.
      if (old && old.x === rect.x && old.y === rect.y && old.w === rect.w && old.h === rect.h)
        return s;
      return { rects: { ...s.rects, [key]: rect } };
    }),
  clearRect: (key) =>
    set((s) => {
      if (!(key in s.rects)) return s;
      const { [key]: _gone, ...rects } = s.rects;
      return { rects };
    }),
  setHomeFocused: (homeFocused) => set({ homeFocused }),
}));

// Every mounted target's measure function. The overlay asks for a fresh rect when it opens
// and on each step, because a scroll does not trigger onLayout.
const measurers = new Map<CoachKey, () => void>();

export function measureTarget(key: CoachKey) {
  measurers.get(key)?.();
}

export function measureAllTargets() {
  measurers.forEach((m) => m());
}

/**
 * Registers a view as the target of coach step `key`. Spread the result on the view
 * (`<Pressable {...coach}>`): it measures its window rect on layout and when the overlay asks.
 * Does nothing once the tour is done.
 */
export function useCoachTarget(key: CoachKey) {
  const ref = useRef<View>(null);
  const done = useCoach((s) => s.coachDone);
  const measure = useCallback(() => {
    // The view is gone (the ✨ pill hides without AI consent): drop its old rect.
    if (!ref.current) {
      useCoachRegistry.getState().clearRect(key);
      return;
    }
    ref.current.measureInWindow((x, y, w, h) => {
      if ([x, y, w, h].every(Number.isFinite) && w > 0 && h > 0) {
        useCoachRegistry.getState().setRect(key, { x, y, w, h });
      }
    });
  }, [key]);
  useEffect(() => {
    if (done) return;
    measurers.set(key, measure);
    return () => {
      if (measurers.get(key) === measure) measurers.delete(key);
      useCoachRegistry.getState().clearRect(key);
    };
  }, [done, key, measure]);
  // `collapsable: false` keeps the native view on Android, so it can be measured.
  return { ref, onLayout: done ? undefined : measure, collapsable: false } as const;
}

/** A view that is the target of coach step `coachKey`; a plain view when the key is null. */
export function CoachTarget({
  coachKey,
  style,
  children,
}: {
  coachKey: CoachKey | null;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  if (!coachKey) return <View style={style}>{children}</View>;
  return (
    <MeasuredTarget coachKey={coachKey} style={style}>
      {children}
    </MeasuredTarget>
  );
}

function MeasuredTarget({
  coachKey,
  style,
  children,
}: {
  coachKey: CoachKey;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const coach = useCoachTarget(coachKey);
  return (
    <View {...coach} style={style}>
      {children}
    </View>
  );
}

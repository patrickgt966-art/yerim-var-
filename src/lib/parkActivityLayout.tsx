// The park Live Activity's SwiftUI layout (expo-widgets + @expo/ui). Load it through
// src/lib/liveActivity.ts only: importing expo-widgets throws where its native module is missing.
//
// The 'widget' function below is turned into a string at build time and run by the widget
// extension, not by the app. It cannot use anything from this file's scope (no helpers, no theme
// imports): everything it shows, colours included, comes in through `props`.
import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  activityBackgroundTint,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  monospacedDigit,
  multilineTextAlignment,
  padding,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityComponent } from 'expo-widgets';

import type { LiveActivityFactory, ParkActivityProps } from './liveActivity';

/** The name the activity is stored under; changing it orphans activities already running. */
export const PARK_ACTIVITY_NAME = 'ParkTimer';

const ParkTimerActivity: LiveActivityComponent<ParkActivityProps> = (props, environment) => {
  'widget';
  const c = props.colors;
  // Past the next band change the app may be asleep: show the newer price rather than the old one.
  const stale = !!environment.isStale && props.nextCost != null;
  const cost = stale ? props.nextCost : props.cost;
  const next = stale ? null : props.nextText;
  const timer = (size: number) => (
    <Text
      timerInterval={{ lower: new Date(props.startedAt), upper: new Date(props.endsAt) }}
      countsDown={false}
      modifiers={[
        font({ size, weight: 'bold', design: 'rounded' }),
        monospacedDigit(),
        foregroundStyle(c.text),
      ]}
    />
  );
  const car = (size: number) => <Image systemName="car.fill" size={size} color={c.accent} />;

  return {
    banner: (
      <HStack
        spacing={12}
        modifiers={[padding({ all: 16 }), activityBackgroundTint(c.bg)]}
        alignment="center"
      >
        {car(24)}
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle(c.muted)]}>
            {props.label}
          </Text>
          <Text
            modifiers={[font({ size: 17, weight: 'bold' }), foregroundStyle(c.text), lineLimit(1)]}
          >
            {props.name}
          </Text>
          {timer(28)}
        </VStack>
        <Spacer />
        {cost != null && (
          <VStack alignment="trailing" spacing={2}>
            <Text modifiers={[font({ size: 22, weight: 'heavy' }), foregroundStyle(c.accent)]}>
              {cost}
            </Text>
            {next != null && (
              <Text
                modifiers={[
                  font({ size: 12, weight: 'medium' }),
                  foregroundStyle(c.muted),
                  multilineTextAlignment('trailing'),
                  lineLimit(2),
                ]}
              >
                {next}
              </Text>
            )}
          </VStack>
        )}
      </HStack>
    ),
    // Apple Watch Smart Stack and CarPlay: one compact column, high contrast, nothing long.
    bannerSmall: (
      <VStack
        alignment="leading"
        spacing={2}
        modifiers={[padding({ all: 8 }), activityBackgroundTint(c.bg)]}
      >
        <HStack spacing={4} alignment="center">
          {car(14)}
          <Text
            modifiers={[
              font({ size: 13, weight: 'semibold' }),
              foregroundStyle(c.muted),
              lineLimit(1),
            ]}
          >
            {props.name}
          </Text>
        </HStack>
        {timer(26)}
        {cost != null && (
          <Text
            modifiers={[
              font({ size: 13, weight: 'bold' }),
              foregroundStyle(c.accent),
              lineLimit(1),
            ]}
          >
            {cost}
          </Text>
        )}
      </VStack>
    ),
    compactLeading: car(14),
    compactTrailing: (
      <Text
        timerInterval={{ lower: new Date(props.startedAt), upper: new Date(props.endsAt) }}
        countsDown={false}
        modifiers={[
          font({ size: 14, weight: 'semibold' }),
          monospacedDigit(),
          foregroundStyle(c.accent),
          frame({ maxWidth: 64 }),
          multilineTextAlignment('trailing'),
        ]}
      />
    ),
    minimal: car(14),
    expandedLeading: (
      <VStack alignment="leading" spacing={2} modifiers={[padding({ leading: 4 })]}>
        {car(18)}
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(c.muted)]}>
          {props.label}
        </Text>
      </VStack>
    ),
    expandedTrailing:
      cost != null ? (
        <Text
          modifiers={[
            font({ size: 20, weight: 'heavy' }),
            foregroundStyle(c.accent),
            padding({ trailing: 4 }),
          ]}
        >
          {cost}
        </Text>
      ) : undefined,
    expandedCenter: (
      <Text modifiers={[font({ size: 15, weight: 'bold' }), foregroundStyle(c.text), lineLimit(1)]}>
        {props.name}
      </Text>
    ),
    expandedBottom: (
      <HStack spacing={8} alignment="firstTextBaseline">
        {timer(26)}
        <Spacer />
        {next != null && (
          <Text
            modifiers={[
              font({ size: 12, weight: 'medium' }),
              foregroundStyle(c.muted),
              multilineTextAlignment('trailing'),
              lineLimit(2),
            ]}
          >
            {next}
          </Text>
        )}
      </HStack>
    ),
  };
};

export function createParkActivityFactory(): LiveActivityFactory {
  return createLiveActivity<ParkActivityProps>(PARK_ACTIVITY_NAME, ParkTimerActivity);
}

// The "Yerim Var" widget's SwiftUI layout (expo-widgets + @expo/ui). Load it through
// src/lib/parkWidget.ts only: importing expo-widgets throws where its native module is missing.
//
// The 'widget' function below is turned into a string at build time and run by the widget
// extension, not by the app. It cannot use anything from this file's scope (no helpers, no theme
// imports, no i18next): everything it shows, colours and translated texts included, comes in
// through `props`. Widgets cannot run code on tap, so the only interaction is a link: the whole
// widget opens the app (widgetURL) and, on the medium size, two Links open the home actions.
import { HStack, Image, Link, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  monospacedDigit,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

import type { ParkWidgetHandle, ParkWidgetProps } from './parkWidget';

/** Must match the `name` of the widget in the expo-widgets plugin config in app.json. */
export const PARK_WIDGET_NAME = 'ParkWidget';

const ParkWidget = (props: ParkWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const c = props.colors;
  const l = props.labels;
  const family = environment.widgetFamily;
  const accessory = family.indexOf('accessory') === 0;
  const mode = environment.widgetRenderingMode;
  // Tinted (accented) and lock screen (vibrant) widgets are recoloured by the system: custom
  // colours would vanish or clash, so they only apply to the full colour home screen widget.
  const colored = !accessory && (mode == null || mode === 'fullColor');
  const fg = (kind: 'text' | 'muted' | 'accent') =>
    colored
      ? foregroundStyle(c[kind])
      : foregroundStyle(kind === 'muted' ? 'secondary' : 'primary');
  const bg = containerBackground(colored ? c.bg : 'clear', 'widget');

  const parked = props.parked;
  const nearest = parked ? null : props.nearest;
  // Both the app and the widget extension open yerimvar:// links; the home screen shows the park.
  const home = 'yerimvar://';
  const findPark = 'yerimvar://sonuc?near=1';

  const timer = (size: number, maxWidth?: number) => (
    <Text
      timerInterval={{
        lower: new Date(parked ? parked.startedAt : 0),
        upper: new Date((parked ? parked.startedAt : 0) + 7 * 24 * 60 * 60 * 1000),
      }}
      countsDown={false}
      modifiers={[
        font({ size, weight: 'bold', design: 'rounded' }),
        monospacedDigit(),
        fg('text'),
        lineLimit(1),
        ...(maxWidth ? [frame({ maxWidth })] : []),
      ]}
    />
  );
  const car = (size: number) => (
    <Image systemName="car.fill" size={size} color={colored ? c.accent : undefined} />
  );
  const line = (text: string, size: number, kind: 'text' | 'muted' | 'accent', lines?: number) => (
    <Text modifiers={[font({ size, weight: 'semibold' }), fg(kind), lineLimit(lines ?? 1)]}>
      {text}
    </Text>
  );

  // The big figure: the timer while parked, the walking time otherwise.
  const figure = (size: number) =>
    parked ? timer(size) : nearest ? line(nearest.walkText, size, 'accent') : null;

  if (family === 'accessoryInline') {
    return (
      <HStack spacing={4} modifiers={[widgetURL(home)]}>
        {parked ? (
          <>
            {line(l.parkedShort + ':', 14, 'text')}
            {timer(14)}
          </>
        ) : nearest ? (
          line(l.nearest + ' ' + l.walkShort, 14, 'text')
        ) : (
          line(l.app, 14, 'text')
        )}
      </HStack>
    );
  }

  if (family === 'accessoryCircular') {
    return (
      <VStack spacing={1} modifiers={[widgetURL(home), bg]}>
        {car(14)}
        {parked ? (
          timer(12, 44)
        ) : nearest ? (
          <>
            {line(String(nearest.walkMin), 16, 'text')}
            {line(l.min, 10, 'muted')}
          </>
        ) : null}
      </VStack>
    );
  }

  if (family === 'accessoryRectangular') {
    return (
      <VStack alignment="leading" spacing={1} modifiers={[widgetURL(home), bg]}>
        {line(parked ? l.parked : nearest ? l.nearest : l.app, 12, 'muted')}
        {line(parked ? parked.name : nearest ? nearest.name : l.findPark, 14, 'text')}
        {parked
          ? timer(14)
          : nearest
            ? line(
                nearest.walkText + (nearest.freeText ? ' · ' + nearest.freeText : ''),
                12,
                'text',
              )
            : line(l.findFood, 12, 'muted')}
      </VStack>
    );
  }

  if (family === 'systemSmall') {
    return (
      <VStack alignment="leading" spacing={4} modifiers={[widgetURL(home), bg]}>
        <HStack spacing={6}>
          {car(16)}
          {line(parked ? l.parked : nearest ? l.nearest : l.app, 12, 'muted')}
        </HStack>
        {parked || nearest ? (
          <>
            {line(parked ? parked.name : nearest ? nearest.name : '', 15, 'text', 2)}
            <Spacer />
            {figure(parked ? 24 : 18)}
            {nearest && nearest.freeText ? line(nearest.freeText, 12, 'text') : null}
            {nearest ? line(nearest.asOfText, 10, 'muted') : null}
          </>
        ) : (
          <>
            <Spacer />
            {line(l.findPark, 17, 'text')}
            {line(l.findFood, 17, 'text')}
          </>
        )}
      </VStack>
    );
  }

  // systemMedium (and any larger size, which this widget does not offer): two columns.
  return (
    <HStack spacing={12} modifiers={[widgetURL(home), bg]}>
      <VStack alignment="leading" spacing={4}>
        <HStack spacing={6}>
          {car(18)}
          {line(parked ? l.parked : nearest ? l.nearest : l.app, 13, 'muted')}
        </HStack>
        {parked || nearest ? (
          line(parked ? parked.name : nearest ? nearest.name : '', 17, 'text', 2)
        ) : (
          <Link
            label={l.findPark}
            destination={findPark}
            modifiers={[font({ size: 18, weight: 'bold' }), fg('text')]}
          />
        )}
        <Spacer />
        {nearest ? line(nearest.asOfText, 11, 'muted') : null}
        {!parked && !nearest ? (
          <Link
            label={l.findFood}
            destination={home}
            modifiers={[font({ size: 18, weight: 'bold' }), fg('text')]}
          />
        ) : null}
      </VStack>
      <Spacer />
      {parked || nearest ? (
        <VStack alignment="trailing" spacing={4}>
          <Spacer />
          {figure(parked ? 30 : 20)}
          {nearest && nearest.freeText ? line(nearest.freeText, 14, 'text') : null}
        </VStack>
      ) : null}
    </HStack>
  );
};

export function createParkWidget(): ParkWidgetHandle {
  return createWidget<ParkWidgetProps>(PARK_WIDGET_NAME, ParkWidget);
}

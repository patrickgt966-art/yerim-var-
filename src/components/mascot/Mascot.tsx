import Svg, { Circle, Ellipse, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { fonts } from '@/theme';

import {
  DISPLAY_FONT,
  FACE_VIEWBOX,
  faceShapes,
  MASCOT_VIEWBOX,
  mascotShapes,
  type FaceEyes,
  type MascotPose,
  type Shape,
} from './geometry';

export {
  MASCOT_FOOT,
  MASCOT_HEAD_Y,
  MASCOT_VIEWBOX,
  type MascotArm,
  type MascotEyes,
  type MascotMouth,
  type MascotPose,
  type MascotProp,
} from './geometry';

/** Draws geometry shapes with react-native-svg. */
function Draw({ shapes }: { shapes: Shape[] }) {
  return (
    <>
      {shapes.map((sh, i) => {
        switch (sh[0]) {
          case 'g':
            return (
              <G key={i} {...sh[1]}>
                <Draw shapes={sh[2]} />
              </G>
            );
          case 'text': {
            const { font, ...rest } = sh[1];
            return (
              <SvgText
                key={i}
                {...rest}
                fontFamily={font === DISPLAY_FONT ? fonts.display : undefined}
              >
                {sh[2]}
              </SvgText>
            );
          }
          case 'path':
            return <Path key={i} {...(sh[1] as { d: string })} />;
          case 'ellipse':
            return <Ellipse key={i} {...sh[1]} />;
          case 'circle':
            return <Circle key={i} {...sh[1]} />;
          case 'rect':
            return <Rect key={i} {...sh[1]} />;
        }
      })}
    </>
  );
}

/**
 * Yerim, the app's mascot: the Yerim button come alive. It says how it feels with its eyes and
 * carries what the moment is about (a fork, a P sign, a star, a question). The drawing itself lives
 * in `geometry.ts`, shared with the design drafts. Decorative: whatever it says is in text next to it.
 */
export function Mascot({ size = 120, ...pose }: MascotPose & { size?: number }) {
  const { x, y, w, h } = MASCOT_VIEWBOX;
  return (
    <Svg
      width={size}
      height={(size * h) / w}
      viewBox={`${x} ${y} ${w} ${h}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Draw shapes={[mascotShapes(pose)]} />
    </Svg>
  );
}

/** Just the face, for the Yerim button and other small places: two eyes, cheeks, a mouth. */
export function MascotFace({
  size = 34,
  color,
  eyes = 'open',
}: {
  size?: number;
  color?: string;
  eyes?: FaceEyes;
}) {
  return (
    <Svg
      width={size}
      height={(size * FACE_VIEWBOX.h) / FACE_VIEWBOX.w}
      viewBox={`0 0 ${FACE_VIEWBOX.w} ${FACE_VIEWBOX.h}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Draw shapes={faceShapes(eyes, color)} />
    </Svg>
  );
}

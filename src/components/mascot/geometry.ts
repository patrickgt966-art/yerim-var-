/**
 * Yerim's drawing as plain data: the single source for the app's `Mascot` (react-native-svg) and
 * for the design drafts' `design/maskot.js` (generated from this file by
 * `npm run build-mascot`; a test fails when the two drift apart). No React, no React Native here.
 *
 * The body is the Yerim button's shape come alive: three round corners and a tight bottom-left one,
 * flat orange with a darker belly, a highlight, cheeks and navy feet.
 */
import { brand } from '@/theme/tokens';

export type Attrs = Record<string, string | number>;
/** An SVG element: tag, attributes, children (only `g` has children; `text` has its text). */
export type Shape =
  ['path' | 'ellipse' | 'circle' | 'rect', Attrs] | ['g', Attrs, Shape[]] | ['text', Attrs, string];

export type MascotEyes = 'open' | 'blink' | 'happy' | 'side' | 'down' | 'up' | 'curious' | 'sad';
export type MascotMouth = 'smile' | 'open' | 'o' | 'flat' | 'none';
export type MascotArm = 'rest' | 'wave' | 'wave2' | 'point' | 'up' | 'hold';
export type MascotProp = 'none' | 'fork' | 'park' | 'ask' | 'star';

const N = brand.navy;
const O = brand.orange;
const OD = '#F07A12';
const W = '#FFFFFF';
const CHEEK = 'rgba(255,110,80,0.32)';
const CX = 62;
const CY = 56;
const L = CX - 12;
const R = CX + 12;
/** Text in the drawing uses the display face; each renderer maps the role to a font. */
export const DISPLAY_FONT = 'display';

/** The drawing's box: arms, props and the question bubble reach past the body. */
export const MASCOT_VIEWBOX = { x: -26, y: -34, w: 176, h: 156 } as const;
/** Where the feet touch the ground and where the head starts, in viewBox units. */
export const MASCOT_FOOT = { x: 62, y: 112 } as const;
export const MASCOT_HEAD_Y = 12;

const stroke = (w: number, color: string = N): Attrs => ({
  fill: 'none',
  stroke: color,
  strokeWidth: w,
  strokeLinecap: 'round',
});

const eyeDot = (x: number, y: number, rx = 5, ry = 6.8, hx = 1.8, hy = -2.4): Shape[] => [
  ['ellipse', { cx: x, cy: y, rx, ry, fill: N }],
  ['circle', { cx: x + hx, cy: y + hy, r: 1.8, fill: W }],
];

export const EYES: Record<MascotEyes, Shape[]> = {
  open: [...eyeDot(L, CY), ...eyeDot(R, CY)],
  blink: [['path', { d: `M${L - 5} ${CY + 1}h10M${R - 5} ${CY + 1}h10`, ...stroke(3.6) }]],
  happy: [
    ['path', { d: `M${L - 6} ${CY + 2}q6-8 12 0M${R - 6} ${CY + 2}q6-8 12 0`, ...stroke(3.6) }],
  ],
  side: [
    ...eyeDot(L - 3, CY + 2, 5, 6.4, -1.2, -2.2),
    ...eyeDot(R - 3, CY + 2, 5, 6.4, -1.2, -2.2),
  ],
  down: [...eyeDot(L, CY + 3, 5, 6, 1.4, -1.6), ...eyeDot(R, CY + 3, 5, 6, 1.4, -1.6)],
  up: [...eyeDot(L + 1, CY - 3, 5, 6.8, 1.6, -2.8), ...eyeDot(R + 1, CY - 3, 5, 6.8, 1.6, -2.8)],
  curious: [
    ...eyeDot(L, CY + 1, 4.4, 5.6),
    ...eyeDot(R, CY - 1, 6, 8),
    ['path', { d: `M${R - 6} ${CY - 13}q6-4 12 1`, ...stroke(3) }],
  ],
  sad: [
    ...eyeDot(L, CY + 2, 4.6, 5.8),
    ...eyeDot(R, CY + 2, 4.6, 5.8),
    ['path', { d: `M${L - 7} ${CY - 8}l9-3M${R + 7} ${CY - 8}l-9-3`, ...stroke(3) }],
  ],
};

export const MOUTHS: Record<MascotMouth, Shape[]> = {
  none: [],
  smile: [['path', { d: `M${CX - 7} ${CY + 12}q7 7 14 0`, ...stroke(3.6) }]],
  open: [
    [
      'path',
      {
        d: `M${CX - 9} ${CY + 10}q9 14 18 0z`,
        fill: N,
        stroke: N,
        strokeWidth: 2,
        strokeLinejoin: 'round',
      },
    ],
    ['path', { d: `M${CX - 4} ${CY + 15.5}q4 3 8 0`, ...stroke(2.8, '#E8604C') }],
  ],
  o: [['ellipse', { cx: CX, cy: CY + 14, rx: 4, ry: 5, fill: N }]],
  flat: [['path', { d: `M${CX - 8} ${CY + 15}q4-4 8 0t8 0`, ...stroke(3.2) }]],
};

/** An arm from the shoulder (x1,y1) to the hand (x2,y2), slightly bent. */
const limb = (x1: number, y1: number, x2: number, y2: number): Shape[] => [
  [
    'path',
    {
      d: `M${x1} ${y1}Q${(x1 + x2) / 2 + 3} ${(y1 + y2) / 2 + 5} ${x2} ${y2}`,
      ...stroke(7.5, O),
    },
  ],
  ['circle', { cx: x2, cy: y2, r: 5.4, fill: O }],
];
const RIGHT_REST = limb(108, 70, 122, 84);

export const ARMS: Record<MascotArm, Shape[]> = {
  rest: [...limb(16, 70, 2, 84), ...RIGHT_REST],
  wave: [...limb(16, 66, -4, 40), ...RIGHT_REST],
  wave2: [...limb(16, 66, -10, 54), ...RIGHT_REST],
  point: [...limb(16, 72, -6, 98), ...RIGHT_REST],
  up: [...limb(16, 64, -2, 38), ...limb(108, 64, 126, 38)],
  hold: [...limb(16, 70, 2, 84), ...limb(108, 70, 124, 62)],
};

export const PROPS: Record<MascotProp, Shape[]> = {
  none: [],
  fork: [
    [
      'g',
      { transform: 'translate(126 58) rotate(18)' },
      [
        ['rect', { x: -2, y: -4, width: 4, height: 26, rx: 2, fill: N }],
        ['path', { d: 'M-7 -20v10a7 7 0 0 0 14 0v-10M0 -20v12', ...stroke(3.2) }],
      ],
    ],
  ],
  park: [
    [
      'g',
      { transform: 'translate(126 58) rotate(10)' },
      [
        ['rect', { x: -2, y: 2, width: 4, height: 22, rx: 2, fill: N }],
        ['rect', { x: -14, y: -24, width: 28, height: 28, rx: 8, fill: brand.mintText }],
        [
          'text',
          { x: 0, y: -3, textAnchor: 'middle', fontSize: 20, fill: W, font: DISPLAY_FONT },
          'P',
        ],
      ],
    ],
  ],
  star: [
    [
      'g',
      { transform: 'translate(126 50) rotate(12)' },
      [
        [
          'path',
          {
            d: 'm0 -20 6 12 13 2-9.5 9 2.2 13L0 10l-11.7 6 2.2-13-9.5-9 13-2z',
            fill: brand.yellow,
            stroke: N,
            strokeWidth: 2.4,
            strokeLinejoin: 'round',
          },
        ],
      ],
    ],
  ],
  ask: [
    [
      'g',
      { transform: 'translate(118 2)' },
      [
        [
          'path',
          {
            d: 'M-14 -26h28a8 8 0 0 1 8 8v10a8 8 0 0 1-8 8h-14l-8 7v-7h-6a8 8 0 0 1-8-8v-10a8 8 0 0 1 8-8z',
            fill: W,
            stroke: N,
            strokeWidth: 2.4,
          },
        ],
        [
          'text',
          {
            x: 0,
            y: -8,
            textAnchor: 'middle',
            fontSize: 17,
            fill: brand.orangeStrong,
            font: DISPLAY_FONT,
          },
          '?',
        ],
      ],
    ],
  ],
};

/** Ground shadow and feet: drawn first, behind everything. */
export const GROUND: Shape[] = [
  ['ellipse', { cx: 62, cy: 116, rx: 40, ry: 5, fill: 'rgba(11,60,73,0.12)' }],
  ['rect', { x: 34, y: 99, width: 15, height: 13, rx: 6.5, fill: N }],
  ['rect', { x: 74, y: 99, width: 15, height: 13, rx: 6.5, fill: N }],
];

/** The body, its belly, highlight and cheeks: drawn over the arms. */
export const SHELL: Shape[] = [
  [
    'path',
    {
      d: 'M50 12H78a32 32 0 0 1 32 32V72a32 32 0 0 1-32 32H20a6 6 0 0 1-6-6V44a32 32 0 0 1 32-32z',
      fill: O,
    },
  ],
  ['path', { d: 'M14 80V98a6 6 0 0 0 6 6H78a32 32 0 0 0 31-25c-18 12-58 15-95 1z', fill: OD }],
  [
    'ellipse',
    {
      cx: 42,
      cy: 29,
      rx: 12,
      ry: 6,
      fill: 'rgba(255,255,255,0.38)',
      transform: 'rotate(-22 42 29)',
    },
  ],
  ['ellipse', { cx: CX - 23, cy: CY + 10, rx: 6, ry: 3.6, fill: CHEEK }],
  ['ellipse', { cx: CX + 23, cy: CY + 10, rx: 6, ry: 3.6, fill: CHEEK }],
];

export type MascotPose = {
  eyes?: MascotEyes;
  mouth?: MascotMouth;
  arm?: MascotArm;
  prop?: MascotProp;
  /** Degrees; the body leans a little by default, like the Yerim button. */
  tilt?: number;
};

/** The arm when none is asked for: a prop is held in the right hand (the question floats). */
export const defaultArm = (prop: MascotProp): MascotArm =>
  prop !== 'none' && prop !== 'ask' ? 'hold' : 'rest';

/** The whole figure for a pose, in drawing order, inside the leaning group. */
export function mascotShapes({
  eyes = 'open',
  mouth = 'smile',
  arm,
  prop = 'none',
  tilt = -4,
}: MascotPose): Shape {
  return [
    'g',
    { transform: `rotate(${tilt} 62 100)` },
    [
      ...GROUND,
      ...ARMS[arm ?? defaultArm(prop)],
      ...SHELL,
      ...EYES[eyes],
      ...MOUTHS[mouth],
      ...PROPS[prop],
    ],
  ];
}

// --- The small face (Yerim button, chat avatar, notes): viewBox 0 0 34 28 ---

export type FaceEyes = 'open' | 'happy' | 'blink' | 'up' | 'sad';
export const FACE_VIEWBOX = { w: 34, h: 28 } as const;

export function faceShapes(eyes: FaceEyes, color: string = N): Shape[] {
  const s = (w: number): Attrs => stroke(w, color);
  const two = (y: number, rx: number, ry: number, hx: number, hy: number, dx = 0): Shape[] => [
    ['ellipse', { cx: 10 + dx, cy: y, rx, ry, fill: color }],
    ['ellipse', { cx: 24 + dx, cy: y, rx, ry, fill: color }],
    ...(hx || hy
      ? ([
          ['circle', { cx: 10 + dx + hx, cy: y + hy, r: 1.3, fill: W }],
          ['circle', { cx: 24 + dx + hx, cy: y + hy, r: 1.3, fill: W }],
        ] as Shape[])
      : []),
  ];
  const eyesShapes: Record<FaceEyes, Shape[]> = {
    open: two(10, 3.6, 4.8, 1.3, -1.8),
    up: two(7.6, 3.6, 4.8, 1.2, -2.2, 0.6),
    happy: [['path', { d: 'M5.5 11q4.5-6 9 0M19.5 11q4.5-6 9 0', ...s(2.8) }]],
    blink: [['path', { d: 'M6 10.5h8M20 10.5h8', ...s(2.8) }]],
    sad: [...two(11, 3.2, 4, 0, 0), ['path', { d: 'M5.5 4.5l6 -2M28.5 4.5l-6 -2', ...s(2.4) }]],
  };
  return [
    ...eyesShapes[eyes],
    ['ellipse', { cx: 4.5, cy: 17, rx: 3.2, ry: 2, fill: 'rgba(255,110,80,0.35)' }],
    ['ellipse', { cx: 29.5, cy: 17, rx: 3.2, ry: 2, fill: 'rgba(255,110,80,0.35)' }],
    ['path', { d: eyes === 'sad' ? 'M12 20q2.5-2.5 5 0t5 0' : 'M12 18q5 5 10 0', ...s(2.8) }],
  ];
}

/** Shapes as an SVG string (design drafts, the generated maskot.js, tests). */
export function toSvgString(shapes: Shape[], font: (role: string) => string): string {
  const attr = (a: Attrs) =>
    Object.entries(a)
      .filter(([k]) => k !== 'font')
      .map(([k, v]) => ` ${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}="${v}"`)
      .join('');
  return shapes
    .map((sh) => {
      if (sh[0] === 'g') return `<g${attr(sh[1])}>${toSvgString(sh[2], font)}</g>`;
      if (sh[0] === 'text') {
        const role = sh[1].font as string | undefined;
        const f = role ? ` font-family="${font(role)}" font-weight="800"` : '';
        return `<text${attr(sh[1])}${f}>${sh[2]}</text>`;
      }
      return `<${sh[0]}${attr(sh[1])}/>`;
    })
    .join('');
}

import Svg, { Circle, Ellipse, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { brand, fonts } from '@/theme';

export type MascotEyes = 'open' | 'blink' | 'happy' | 'side' | 'down' | 'up' | 'curious' | 'sad';
export type MascotMouth = 'smile' | 'open' | 'o' | 'flat' | 'none';
export type MascotArm = 'rest' | 'wave' | 'wave2' | 'point' | 'up' | 'hold';
export type MascotProp = 'none' | 'fork' | 'park' | 'ask' | 'star';

export type MascotPose = {
  eyes?: MascotEyes;
  mouth?: MascotMouth;
  arm?: MascotArm;
  prop?: MascotProp;
  /** Degrees; the body leans a little by default, like the Yerim button. */
  tilt?: number;
};

const N = brand.navy;
const O = brand.orange;
const OD = '#F07A12';
const CHEEK = 'rgba(255,110,80,0.32)';
const CX = 62;
const CY = 56;
const L = CX - 12;
const R = CX + 12;

/** The drawing's box: arms, props and the question bubble reach past the body. */
export const MASCOT_VIEWBOX = { x: -26, y: -34, w: 176, h: 156 } as const;
/** Where the feet touch the ground and where the head starts, in viewBox units. */
export const MASCOT_FOOT = { x: 62, y: 112 } as const;
export const MASCOT_HEAD_Y = 12;

function EyeDot({ x, y, rx = 5, ry = 6.8, hx = 1.8, hy = -2.4 }: Record<string, number>) {
  return (
    <>
      <Ellipse cx={x} cy={y} rx={rx} ry={ry} fill={N} />
      <Circle cx={x! + hx} cy={y! + hy} r={1.8} fill="#FFFFFF" />
    </>
  );
}

function Eyes({ kind }: { kind: MascotEyes }) {
  switch (kind) {
    case 'blink':
      return (
        <Path
          d={`M${L - 5} ${CY + 1}h10M${R - 5} ${CY + 1}h10`}
          stroke={N}
          strokeWidth={3.6}
          strokeLinecap="round"
        />
      );
    case 'happy':
      return (
        <Path
          d={`M${L - 6} ${CY + 2}q6-8 12 0M${R - 6} ${CY + 2}q6-8 12 0`}
          fill="none"
          stroke={N}
          strokeWidth={3.6}
          strokeLinecap="round"
        />
      );
    case 'side':
      return (
        <>
          <EyeDot x={L - 3} y={CY + 2} rx={5} ry={6.4} hx={-1.2} hy={-2.2} />
          <EyeDot x={R - 3} y={CY + 2} rx={5} ry={6.4} hx={-1.2} hy={-2.2} />
        </>
      );
    case 'down':
      return (
        <>
          <EyeDot x={L} y={CY + 3} rx={5} ry={6} hx={1.4} hy={-1.6} />
          <EyeDot x={R} y={CY + 3} rx={5} ry={6} hx={1.4} hy={-1.6} />
        </>
      );
    case 'up':
      return (
        <>
          <EyeDot x={L + 1} y={CY - 3} hx={1.6} hy={-2.8} />
          <EyeDot x={R + 1} y={CY - 3} hx={1.6} hy={-2.8} />
        </>
      );
    case 'curious':
      return (
        <>
          <EyeDot x={L} y={CY + 1} rx={4.4} ry={5.6} />
          <EyeDot x={R} y={CY - 1} rx={6} ry={8} />
          <Path
            d={`M${R - 6} ${CY - 13}q6-4 12 1`}
            fill="none"
            stroke={N}
            strokeWidth={3}
            strokeLinecap="round"
          />
        </>
      );
    case 'sad':
      return (
        <>
          <EyeDot x={L} y={CY + 2} rx={4.6} ry={5.8} />
          <EyeDot x={R} y={CY + 2} rx={4.6} ry={5.8} />
          <Path
            d={`M${L - 7} ${CY - 8}l9-3M${R + 7} ${CY - 8}l-9-3`}
            stroke={N}
            strokeWidth={3}
            strokeLinecap="round"
          />
        </>
      );
    default:
      return (
        <>
          <EyeDot x={L} y={CY} />
          <EyeDot x={R} y={CY} />
        </>
      );
  }
}

function Mouth({ kind }: { kind: MascotMouth }) {
  switch (kind) {
    case 'none':
      return null;
    case 'open':
      return (
        <>
          <Path
            d={`M${CX - 9} ${CY + 10}q9 14 18 0z`}
            fill={N}
            stroke={N}
            strokeWidth={2}
            strokeLinejoin="round"
          />
          <Path
            d={`M${CX - 4} ${CY + 15.5}q4 3 8 0`}
            fill="none"
            stroke="#E8604C"
            strokeWidth={2.8}
            strokeLinecap="round"
          />
        </>
      );
    case 'o':
      return <Ellipse cx={CX} cy={CY + 14} rx={4} ry={5} fill={N} />;
    case 'flat':
      return (
        <Path
          d={`M${CX - 8} ${CY + 15}q4-4 8 0t8 0`}
          fill="none"
          stroke={N}
          strokeWidth={3.2}
          strokeLinecap="round"
        />
      );
    default:
      return (
        <Path
          d={`M${CX - 7} ${CY + 12}q7 7 14 0`}
          fill="none"
          stroke={N}
          strokeWidth={3.6}
          strokeLinecap="round"
        />
      );
  }
}

/** An arm from the shoulder (x1,y1) to the hand (x2,y2), slightly bent. */
function Limb({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return (
    <>
      <Path
        d={`M${x1} ${y1}Q${(x1 + x2) / 2 + 3} ${(y1 + y2) / 2 + 5} ${x2} ${y2}`}
        fill="none"
        stroke={O}
        strokeWidth={7.5}
        strokeLinecap="round"
      />
      <Circle cx={x2} cy={y2} r={5.4} fill={O} />
    </>
  );
}

const RIGHT_REST = <Limb x1={108} y1={70} x2={122} y2={84} />;

function Arms({ kind }: { kind: MascotArm }) {
  switch (kind) {
    case 'wave':
      return (
        <>
          <Limb x1={16} y1={66} x2={-4} y2={40} />
          {RIGHT_REST}
        </>
      );
    case 'wave2':
      return (
        <>
          <Limb x1={16} y1={66} x2={-10} y2={54} />
          {RIGHT_REST}
        </>
      );
    case 'point':
      return (
        <>
          <Limb x1={16} y1={72} x2={-6} y2={98} />
          {RIGHT_REST}
        </>
      );
    case 'up':
      return (
        <>
          <Limb x1={16} y1={64} x2={-2} y2={38} />
          <Limb x1={108} y1={64} x2={126} y2={38} />
        </>
      );
    case 'hold':
      return (
        <>
          <Limb x1={16} y1={70} x2={2} y2={84} />
          <Limb x1={108} y1={70} x2={124} y2={62} />
        </>
      );
    default:
      return (
        <>
          <Limb x1={16} y1={70} x2={2} y2={84} />
          {RIGHT_REST}
        </>
      );
  }
}

function Prop({ kind }: { kind: MascotProp }) {
  switch (kind) {
    case 'fork':
      return (
        <G transform="translate(126 58) rotate(18)">
          <Rect x={-2} y={-4} width={4} height={26} rx={2} fill={N} />
          <Path
            d="M-7 -20v10a7 7 0 0 0 14 0v-10M0 -20v12"
            fill="none"
            stroke={N}
            strokeWidth={3.2}
            strokeLinecap="round"
          />
        </G>
      );
    case 'park':
      return (
        <G transform="translate(126 58) rotate(10)">
          <Rect x={-2} y={2} width={4} height={22} rx={2} fill={N} />
          <Rect x={-14} y={-24} width={28} height={28} rx={8} fill={brand.mintText} />
          <SvgText
            x={0}
            y={-3}
            textAnchor="middle"
            fontFamily={fonts.display}
            fontSize={20}
            fill="#FFFFFF"
          >
            P
          </SvgText>
        </G>
      );
    case 'star':
      return (
        <G transform="translate(126 50) rotate(12)">
          <Path
            d="m0 -20 6 12 13 2-9.5 9 2.2 13L0 10l-11.7 6 2.2-13-9.5-9 13-2z"
            fill={brand.yellow}
            stroke={N}
            strokeWidth={2.4}
            strokeLinejoin="round"
          />
        </G>
      );
    case 'ask':
      return (
        <G transform="translate(118 2)">
          <Path
            d="M-14 -26h28a8 8 0 0 1 8 8v10a8 8 0 0 1-8 8h-14l-8 7v-7h-6a8 8 0 0 1-8-8v-10a8 8 0 0 1 8-8z"
            fill="#FFFFFF"
            stroke={N}
            strokeWidth={2.4}
          />
          <SvgText
            x={0}
            y={-8}
            textAnchor="middle"
            fontFamily={fonts.display}
            fontSize={17}
            fill={brand.orangeStrong}
          >
            ?
          </SvgText>
        </G>
      );
    default:
      return null;
  }
}

/**
 * Yerim, the app's mascot: the Yerim button come alive. Three round corners and a tight
 * bottom-left one (a map pin's tip, a speech bubble's tail), flat orange, navy feet. It says
 * how it feels with its eyes and carries what the moment is about (a fork, a P sign, a question).
 * Decorative: whatever it says is in text next to it.
 */
export function Mascot({
  size = 120,
  eyes = 'open',
  mouth = 'smile',
  arm,
  prop = 'none',
  tilt = -4,
}: MascotPose & { size?: number }) {
  const arms: MascotArm = arm ?? (prop !== 'none' && prop !== 'ask' ? 'hold' : 'rest');
  const { x, y, w, h } = MASCOT_VIEWBOX;
  return (
    <Svg
      width={size}
      height={(size * h) / w}
      viewBox={`${x} ${y} ${w} ${h}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <G transform={`rotate(${tilt} 62 100)`}>
        <Ellipse cx={62} cy={116} rx={40} ry={5} fill="rgba(11,60,73,0.12)" />
        <Rect x={34} y={99} width={15} height={13} rx={6.5} fill={N} />
        <Rect x={74} y={99} width={15} height={13} rx={6.5} fill={N} />
        <Arms kind={arms} />
        <Path
          d="M50 12H78a32 32 0 0 1 32 32V72a32 32 0 0 1-32 32H20a6 6 0 0 1-6-6V44a32 32 0 0 1 32-32z"
          fill={O}
        />
        <Path d="M14 80V98a6 6 0 0 0 6 6H78a32 32 0 0 0 31-25c-18 12-58 15-95 1z" fill={OD} />
        <Ellipse
          cx={42}
          cy={29}
          rx={12}
          ry={6}
          fill="rgba(255,255,255,0.38)"
          transform="rotate(-22 42 29)"
        />
        <Ellipse cx={CX - 23} cy={CY + 10} rx={6} ry={3.6} fill={CHEEK} />
        <Ellipse cx={CX + 23} cy={CY + 10} rx={6} ry={3.6} fill={CHEEK} />
        <Eyes kind={eyes} />
        <Mouth kind={mouth} />
        <Prop kind={prop} />
      </G>
    </Svg>
  );
}

/** Just the face, for the Yerim button and other small places: two eyes, cheeks, a smile. */
export function MascotFace({
  size = 34,
  color = brand.navy,
  eyes = 'open',
}: {
  size?: number;
  color?: string;
  eyes?: 'open' | 'happy' | 'blink' | 'up' | 'sad';
}) {
  return (
    <Svg
      width={size}
      height={(size * 28) / 34}
      viewBox="0 0 34 28"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {eyes === 'happy' ? (
        <Path
          d="M5.5 11q4.5-6 9 0M19.5 11q4.5-6 9 0"
          fill="none"
          stroke={color}
          strokeWidth={2.8}
          strokeLinecap="round"
        />
      ) : eyes === 'blink' ? (
        <Path
          d="M6 10.5h8M20 10.5h8"
          fill="none"
          stroke={color}
          strokeWidth={2.8}
          strokeLinecap="round"
        />
      ) : eyes === 'sad' ? (
        <>
          <Ellipse cx={10} cy={11} rx={3.2} ry={4} fill={color} />
          <Ellipse cx={24} cy={11} rx={3.2} ry={4} fill={color} />
          <Path
            d="M5.5 4.5l6 -2M28.5 4.5l-6 -2"
            fill="none"
            stroke={color}
            strokeWidth={2.4}
            strokeLinecap="round"
          />
        </>
      ) : eyes === 'up' ? (
        <>
          <Ellipse cx={10.6} cy={7.6} rx={3.6} ry={4.8} fill={color} />
          <Ellipse cx={24.6} cy={7.6} rx={3.6} ry={4.8} fill={color} />
          <Circle cx={11.8} cy={5.4} r={1.3} fill="#FFFFFF" />
          <Circle cx={25.8} cy={5.4} r={1.3} fill="#FFFFFF" />
        </>
      ) : (
        <>
          <Ellipse cx={10} cy={10} rx={3.6} ry={4.8} fill={color} />
          <Ellipse cx={24} cy={10} rx={3.6} ry={4.8} fill={color} />
          <Circle cx={11.3} cy={8.2} r={1.3} fill="#FFFFFF" />
          <Circle cx={25.3} cy={8.2} r={1.3} fill="#FFFFFF" />
        </>
      )}
      <Ellipse cx={4.5} cy={17} rx={3.2} ry={2} fill="rgba(255,110,80,0.35)" />
      <Ellipse cx={29.5} cy={17} rx={3.2} ry={2} fill="rgba(255,110,80,0.35)" />
      <Path
        d={eyes === 'sad' ? 'M12 20q2.5-2.5 5 0t5 0' : 'M12 18q5 5 10 0'}
        fill="none"
        stroke={color}
        strokeWidth={2.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

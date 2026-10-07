import Svg, { Circle, Path, Rect } from 'react-native-svg';

type Props = {
  size?: number;
  /** Colour of the dashed bay. */
  bay?: string;
  /** Colour of the windows (usually the background). */
  glass?: string;
  wheels?: boolean;
  lights?: boolean;
};

/** Brand mark: orange car parked in a dashed U-shaped bay, seen from above. */
export function CarMark({
  size = 120,
  bay = '#FFFFFF',
  glass = '#0B3C49',
  wheels = true,
  lights = true,
}: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" accessible={false}>
      <Path
        d="M24 106V18H96V106"
        fill="none"
        stroke={bay}
        strokeWidth={4.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="9 9"
      />
      <Rect x={40} y={36} width={40} height={62} rx={16} fill="#FF8A1F" />
      <Rect x={46} y={50} width={28} height={15} rx={5} fill={glass} />
      <Rect x={47} y={80} width={26} height={9} rx={3} fill={glass} />
      {lights && (
        <>
          <Circle cx={49} cy={43} r={3.5} fill="#FFE08A" />
          <Circle cx={71} cy={43} r={3.5} fill="#FFE08A" />
        </>
      )}
      {wheels && (
        <>
          <Rect x={35.5} y={49} width={5} height={14} rx={2.5} fill={bay} />
          <Rect x={79.5} y={49} width={5} height={14} rx={2.5} fill={bay} />
          <Rect x={35.5} y={76} width={5} height={14} rx={2.5} fill={bay} />
          <Rect x={79.5} y={76} width={5} height={14} rx={2.5} fill={bay} />
        </>
      )}
    </Svg>
  );
}

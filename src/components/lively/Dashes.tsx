import Svg, { Line } from 'react-native-svg';

/** A dashed line across a card, drawn (RN's dashed borders only work on all four sides). */
export function Dashes({ color, opacity = 1 }: { color: string; opacity?: number }) {
  return (
    <Svg height={2} width="100%" accessible={false}>
      <Line
        x1={0}
        y1={1}
        x2="100%"
        y2={1}
        stroke={color}
        strokeOpacity={opacity}
        strokeWidth={2}
        strokeDasharray="6 5"
      />
    </Svg>
  );
}

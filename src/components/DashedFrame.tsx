import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';

type Props = {
  color: string;
  radius?: number;
  /** Bottom-left corner radius (the signature tight corner). */
  tight?: number;
  strokeWidth?: number;
  dash?: [number, number];
};

function roundedPath(w: number, h: number, r: number, bl: number, inset: number) {
  const x0 = inset;
  const y0 = inset;
  const x1 = w - inset;
  const y1 = h - inset;
  const rr = Math.min(r, (w - 2 * inset) / 2, (h - 2 * inset) / 2);
  const rb = Math.min(bl, rr);
  return [
    `M${x0 + rr},${y0}`,
    `H${x1 - rr}`,
    `A${rr},${rr} 0 0 1 ${x1},${y0 + rr}`,
    `V${y1 - rr}`,
    `A${rr},${rr} 0 0 1 ${x1 - rr},${y1}`,
    `H${x0 + rb}`,
    `A${rb},${rb} 0 0 1 ${x0},${y1 - rb}`,
    `V${y0 + rr}`,
    `A${rr},${rr} 0 0 1 ${x0 + rr},${y0}`,
    'Z',
  ].join(' ');
}

/**
 * Dashed "parking bay" outline with asymmetric corners, drawn in SVG because
 * native dashed borders do not support per-corner radii reliably.
 * Place inside a relatively positioned container.
 */
export function DashedFrame({
  color,
  radius = 22,
  tight = 6,
  strokeWidth = 1.5,
  dash = [6, 5],
}: Props) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || size.w !== width || size.h !== height) setSize({ w: width, h: height });
  };
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {size && (
        <Svg width={size.w} height={size.h}>
          <Path
            d={roundedPath(size.w, size.h, radius, tight, strokeWidth / 2)}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={dash}
            fill="none"
          />
        </Svg>
      )}
    </View>
  );
}

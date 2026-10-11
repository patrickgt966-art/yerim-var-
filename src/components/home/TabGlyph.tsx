import Svg, { Circle, Path } from 'react-native-svg';

export type TabGlyphName = 'home' | 'map' | 'chat' | 'heart' | 'user';

/** Tab bar icons from the B3 mockup (24x24 grid). */
export function TabGlyph({
  name,
  color,
  size = 20,
  strokeWidth = 2,
}: {
  name: TabGlyphName;
  color: string;
  size?: number;
  strokeWidth?: number;
}) {
  const common = {
    fill: 'none',
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      {name === 'home' && <Path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z" {...common} />}
      {name === 'map' && <Path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14" {...common} />}
      {name === 'chat' && (
        <>
          <Path d="M5 18l-1 3 3.5-1.5A8 8 0 1 0 4 12" {...common} />
          <Path d="M9 11h6M9 14h4" {...common} />
        </>
      )}
      {name === 'heart' && (
        <Path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" {...common} />
      )}
      {name === 'user' && (
        <>
          <Circle cx={12} cy={8} r={4} {...common} />
          <Path d="M4 21c1-4 4.5-6 8-6s7 2 8 6" {...common} />
        </>
      )}
    </Svg>
  );
}

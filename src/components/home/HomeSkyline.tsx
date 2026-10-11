import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { brand } from '@/theme';

/**
 * İzmir silhouette along the bottom of the home hero (design B3): Kadifekale
 * hills, the Saat Kulesi, Kordon palms, the Asansör, a ferry on the bay and
 * the Bayraklı towers.
 */
export function HomeSkyline() {
  return (
    <Svg
      width="100%"
      height={92}
      viewBox="0 0 390 92"
      preserveAspectRatio="xMidYMax slice"
      accessible={false}
      pointerEvents="none"
      // Ends just above the search card, which overlaps the hero by 34.
      style={{ position: 'absolute', left: 0, right: 0, bottom: 30, opacity: 0.24 }}
    >
      <G fill={brand.white}>
        {/* Kadifekale hills behind everything */}
        <Path
          d="M0 92V62c30-12 60-18 92-14s52 10 80 6 40-12 64-10 34 10 54 12v30z"
          fillOpacity={0.45}
        />
        {/* Saat Kulesi */}
        <Rect x={60} y={74} width={20} height={18} />
        <Rect x={63} y={58} width={14} height={16} />
        <Rect x={61} y={56} width={18} height={3} />
        <Rect x={65} y={44} width={10} height={12} />
        <Rect x={63.5} y={42} width={13} height={3} />
        <Rect x={66.5} y={33} width={7} height={9} />
        <Circle cx={70} cy={31} r={4.5} />
        <Rect x={69.3} y={20} width={1.4} height={8} />
        {/* Kordon palms */}
        <Path d="M30 92c1-12 3-22 6-30h2c-2 8-4 18-4 30z" />
        <Path d="M37 62c-6-4-13-4-18 0 6-1 11 0 15 3zM37 62c5-5 12-6 18-3-6 0-11 2-15 5zM37 62c-2-6-7-9-12-9 4 2 7 5 9 10zM37 62c3-5 8-7 13-6-5 1-8 4-10 8z" />
        <Path d="M104 92c0-10 2-18 5-25h2c-2 7-3 15-3 25z" />
        <Path d="M110 67c-5-3-11-3-15 0 5-1 9 0 12 2zM110 67c4-4 10-5 15-2-5 0-9 1-12 4zM110 67c-2-5-6-7-10-7 3 1 6 4 7 8z" />
        {/* Asansör */}
        <Rect x={146} y={40} width={9} height={52} />
        <Rect x={141} y={33} width={19} height={8} />
        <Path d="M139 33l11.5-6 11.5 6z" />
        {/* Ferry on the bay */}
        <Path d="M188 86h40l-5 6h-31z" />
        <Rect x={195} y={79} width={24} height={7} rx={2} />
        <Rect x={203} y={73} width={6} height={6} />
        {/* Bayraklı towers */}
        <Path d="M262 92V50h12v42z" />
        <Path d="M280 92V22l6-6 6 6v70z" />
        <Path d="M296 92V30l6-6 6 6v62z" />
        <Path d="M314 92V10c4-4 10-4 14 0v82z" />
        <Path d="M334 92V40h12v52z" />
        <Path d="M350 92V56h10v36z" />
        <Path d="M364 92V46l8-4 8 4v46z" />
        {/* Waves of the bay */}
        <Path
          d="M0 90c8-3 16-3 24 0s16 3 24 0 16-3 24 0 16 3 24 0 16-3 24 0 16 3 24 0 16-3 24 0 16 3 24 0 16-3 24 0 16 3 24 0 16-3 24 0 16 3 24 0 16-3 24 0 16 3 24 0 16-3 24 0 16 3 24 0v2H0z"
          fillOpacity={0.7}
        />
      </G>
    </Svg>
  );
}

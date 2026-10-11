import Svg, { Path } from 'react-native-svg';

export type CravingId =
  | 'breakfast'
  | 'lahmacun'
  | 'kebab'
  | 'fish'
  | 'soup'
  | 'chickenRice'
  | 'dessert'
  | 'coffee'
  | 'meyhane';

/** Line icon paths from the B3 mockup (24x24 grid). */
const PATHS: Record<CravingId, string> = {
  breakfast: 'M4 10h16M6 10a6 6 0 0 1 12 0M5 14h14l-1 4H6z',
  lahmacun: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 10h.01M15 9h.01M11 14h.01M15 15h.01',
  kebab: 'M5 15c0-5 4-9 9-9 3 0 5 2 5 5 0 5-5 8-9 8-3 0-5-1-5-4zM9 14h.01M13 11h.01',
  fish: 'M3 12c3-4 7-5 11-4 2 .5 4 2 7 4-3 2-5 3.5-7 4-4 1-8 0-11-4zM17 12h.01',
  soup: 'M4 11h16a8 8 0 0 1-16 0zM9 7c0-1 1-1 1-2M14 7c0-1 1-1 1-2',
  chickenRice: 'M4 13h16a8 8 0 0 1-16 0zM8 10l2-3 2 3 2-3 2 3',
  dessert: 'M6 12h12l-2 8H8zM8 12a4 4 0 0 1 8 0M12 4v4',
  coffee: 'M4 8h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM17 10h2a2 2 0 0 1 0 4h-2M8 3v2M12 3v2',
  meyhane: 'M7 3h10l-1 8a4 4 0 0 1-8 0zM12 15v6M8 21h8',
};

export const CRAVING_IDS = Object.keys(PATHS) as CravingId[];

export function CravingIcon({
  id,
  size = 26,
  color,
}: {
  id: CravingId;
  size?: number;
  color: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Path
        d={PATHS[id]}
        fill="none"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

import { useWindowDimensions } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { useApp } from '@/store/app';
import { brand } from '@/theme';

/**
 * Silhouette along the bottom of the home hero (design B3), drawn for the
 * selected city; an unknown city gets İzmir's.
 */
export function HomeSkyline() {
  // Full width at the drawing's own proportions, so no landmark is cropped.
  const { width } = useWindowDimensions();
  const city = useApp((s) => s.city);
  return (
    <Svg
      width="100%"
      height={Math.round((width * 92) / 390)}
      viewBox="0 0 390 92"
      preserveAspectRatio="xMidYMax meet"
      accessible={false}
      pointerEvents="none"
      // Ends just above the search card, which overlaps the hero by 34.
      style={{ position: 'absolute', left: 0, right: 0, bottom: 30 }}
    >
      {city === 'istanbul' ? (
        <IstanbulSkyline />
      ) : city === 'ankara' ? (
        <AnkaraSkyline />
      ) : city === 'bursa' ? (
        <BursaSkyline />
      ) : (
        <IzmirSkyline />
      )}
    </Svg>
  );
}

/**
 * İzmir: Kadifekale hills, the Saat Kulesi, Kordon palms, the Asansör, a ferry
 * on the bay and the Bayraklı towers.
 */
function IzmirSkyline() {
  return (
    <G testID="skyline-izmir" fill={brand.white} fillOpacity={0.32}>
      {/* Kadifekale hills behind everything */}
      <Path
        d="M0 92V62c30-12 60-18 92-14s52 10 80 6 40-12 64-10 34 10 54 12v30z"
        fillOpacity={0.12}
      />
      {/* Saat Kulesi, in orange so the city reads at a glance */}
      <G fill={brand.orangeLight} fillOpacity={0.85}>
        <Rect x={60} y={74} width={20} height={18} />
        <Rect x={63} y={58} width={14} height={16} />
        <Rect x={61} y={56} width={18} height={3} />
        <Rect x={65} y={44} width={10} height={12} />
        <Rect x={63.5} y={42} width={13} height={3} />
        <Rect x={66.5} y={33} width={7} height={9} />
        <Circle cx={70} cy={31} r={4.5} />
        <Rect x={69.3} y={20} width={1.4} height={8} />
      </G>
      {/* Kordon palms */}
      <G fill={brand.mint} fillOpacity={0.45}>
        <Path d="M30 92c1-12 3-22 6-30h2c-2 8-4 18-4 30z" />
        <Path d="M37 62c-6-4-13-4-18 0 6-1 11 0 15 3zM37 62c5-5 12-6 18-3-6 0-11 2-15 5zM37 62c-2-6-7-9-12-9 4 2 7 5 9 10zM37 62c3-5 8-7 13-6-5 1-8 4-10 8z" />
        <Path d="M104 92c0-10 2-18 5-25h2c-2 7-3 15-3 25z" />
        <Path d="M110 67c-5-3-11-3-15 0 5-1 9 0 12 2zM110 67c4-4 10-5 15-2-5 0-9 1-12 4zM110 67c-2-5-6-7-10-7 3 1 6 4 7 8z" />
      </G>
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
        fillOpacity={0.3}
      />
    </G>
  );
}

/**
 * İstanbul: the Boğaz bridge, Galata Kulesi (the orange accent), a mosque with
 * dome and minarets, Kız Kulesi on its rock and a vapur on the water. Shapes that
 * overlap share one path so the translucent fill does not double up.
 */
function IstanbulSkyline() {
  return (
    <G testID="skyline-istanbul" fill={brand.white} fillOpacity={0.32}>
      {/* Hills behind everything */}
      <Path
        d="M110 92V66c24-10 48-16 78-12s46 10 76 7 52-10 80-6 46 8 46 8V92z"
        fillOpacity={0.12}
      />
      {/* Boğaz bridge: towers and deck, then the main cable with its hangers */}
      <Path d="M13.5 92V22h5v70zM95.5 92V22h5v70zM0 67v-2.5h118V67zM11 34h10v2.5H11zM93 34h10v2.5H93z" />
      <Path
        d="M0 62L16 24Q57 72 98 24L114 62M24.2 32.6V65M32.4 39.4V65M40.6 44.2V65M48.8 47V65M57 48V65M65.2 47V65M73.4 44.2V65M81.6 39.4V65M89.8 32.6V65"
        fill="none"
        stroke={brand.white}
        strokeOpacity={0.32}
        strokeWidth={0.9}
      />
      {/* Galata Kulesi, in orange so the city reads at a glance */}
      <G fill={brand.orangeLight} fillOpacity={0.85}>
        <Path d="M130 92V44H150V92zM127 44V38H153V44zM131 38V28H149V38zM128 29L140 8L152 29zM139.3 8V2H140.7V8z" />
      </G>
      {/* Cypress trees */}
      <G fill={brand.mint} fillOpacity={0.45}>
        <Path d="M168 92c-3-8-3-16 0-26 3 10 3 18 0 26zM258 92c-3-8-3-16 0-26 3 10 3 18 0 26z" />
      </G>
      {/* Mosque: courtyard body, central dome, two half domes and two minarets */}
      <Path d="M186 92V68H242V92zM197 68A17 17 0 0 1 231 68zM213.3 51V40H214.7V51zM186 68A8 8 0 0 1 202 68zM226 68A8 8 0 0 1 242 68zM182 92V30H186V92zM179.5 44V41H188.5V44zM181.5 30L184 14L186.5 30zM242 92V30H246V92zM239.5 44V41H248.5V44zM241.5 30L244 14L246.5 30z" />
      {/* Kız Kulesi on its rock */}
      <Path d="M286 92C289 84 294 80 300 80S311 84 314 92zM295 80V64H305V80zM293.5 64V61.5H306.5V64zM297 61.5V54H303V61.5zM296.5 54A3.5 3.5 0 0 1 303.5 54zM299.4 50.5V44H300.6V50.5zM289 80V74H294.5V80z" />
      {/* Sea around the rock */}
      <G fill={brand.mint} fillOpacity={0.45}>
        <Path d="M272 89c4-2 8-2 12 0s8 2 12 0v2c-4 2-8 2-12 0s-8-2-12 0zM304 89c4-2 8-2 12 0s8 2 12 0v2c-4 2-8 2-12 0s-8-2-12 0z" />
      </G>
      {/* Vapur: hull, two decks, funnel */}
      <Path d="M336 85H380L374 92H340zM342 85V79H374V85zM349 79V74H368V79zM355 74V64H361V74zM354 64V62H362V64z" />
      {/* Waves of the Boğaz */}
      <Path
        d="M0 90c8-3 16-3 24 0s16 3 24 0 16-3 24 0 16 3 24 0 16-3 24 0 16 3 24 0 16-3 24 0 16 3 24 0 16-3 24 0 16 3 24 0 16-3 24 0 16 3 24 0 16-3 24 0 16 3 24 0 16-3 24 0 16 3 24 0v2H0z"
        fillOpacity={0.3}
      />
    </G>
  );
}

/**
 * Ankara: Ankara Kalesi on its hill, Anıtkabir (colonnade on a platform), Atakule (the orange
 * accent, a slim tower with a disc), Kocatepe Camii (big dome, four minarets) and gentle hills
 * instead of waves. Shapes that overlap share one path so the translucent fill does not double up.
 */
function AnkaraSkyline() {
  return (
    <G testID="skyline-ankara" fill={brand.white} fillOpacity={0.32}>
      {/* Rolling hills behind everything */}
      <Path
        d="M0 92V68c40-10 84-10 126-2s72 6 112-2 86-8 120 0c14 3 24 6 32 8V92z"
        fillOpacity={0.12}
      />
      {/* Ankara Kalesi: the hill, then the walls and towers with their battlements */}
      <Path d="M0 92V74C16 66 30 60 46 58S88 62 104 76S112 86 118 92z" />
      <Path d="M30 58V46H86V58zM24 58V38H36V58zM52 58V28H66V58zM80 58V36H92V58zM24 38V35h2V38zM28 38V35h2V38zM32 38V35h2V38zM52 28V25h2V28zM56 28V25h2V28zM60 28V25h2V28zM64 28V25h2V28zM80 36V33h2V36zM84 36V33h2V36zM88 36V33h2V36zM38 46V43h2V46zM42 46V43h2V46zM46 46V43h2V46zM70 46V43h2V46zM74 46V43h2V46zM78 46V43h2V46z" />
      {/* Cypress trees */}
      <G fill={brand.mint} fillOpacity={0.45}>
        <Path d="M122 92c-3-8-3-16 0-26 3 10 3 18 0 26zM222 92c-3-7-3-14 0-22 3 8 3 15 0 22zM372 92c-3-8-3-16 0-26 3 10 3 18 0 26z" />
      </G>
      {/* Anıtkabir: platform, steps, towers, colonnade with its beam and the Hall of Honour */}
      <Path d="M128 92V86H214V92zM136 86V82H206V86zM134 82V58H146V82zM196 82V58H208V82zM132.5 58V55H147.5V58zM194.5 58V55H209.5V58zM148 66V61H194V66zM158 61V50H184V61zM156 50L171 43L186 50zM150 82V66h2.4V82zM155 82V66h2.4V82zM160 82V66h2.4V82zM165 82V66h2.4V82zM170 82V66h2.4V82zM175 82V66h2.4V82zM180 82V66h2.4V82zM185 82V66h2.4V82zM190 82V66h2.4V82z" />
      {/* Atakule, in orange so the city reads at a glance */}
      <G fill={brand.orangeLight} fillOpacity={0.85}>
        <Path d="M236 92L240.5 40H245.5L250 92zM229 36H257L253 44H233zM233 36A10 8 0 0 1 253 36zM242.4 28V12H243.6V28z" />
      </G>
      {/* Kocatepe Camii: courtyard body, central dome, two half domes and four minarets */}
      <Path d="M280 92V68H340V92zM293 68A17 17 0 0 1 327 68zM309.4 51V42H310.6V51zM280 68A9 9 0 0 1 298 68zM322 68A9 9 0 0 1 340 68zM272.5 92V36H275.5V92zM270.5 46V43.5H277.5V46zM272 36L274 22L276 36zM284.5 92V36H287.5V92zM282.5 46V43.5H289.5V46zM284 36L286 22L288 36zM332.5 92V36H335.5V92zM330.5 46V43.5H337.5V46zM332 36L334 22L336 36zM344.5 92V36H347.5V92zM342.5 46V43.5H349.5V46zM344 36L346 22L348 36z" />
      {/* Gentle ground line */}
      <Path
        d="M0 90c40-2 84-2 130 0s86 2 130 0 90-2 130 0v2H0z"
        fillOpacity={0.3}
      />
    </G>
  );
}

/**
 * Bursa: Uludağ as a big mountain behind everything (with a few snow patches), the Yeşil Türbe
 * (octagonal tomb under a ribbed dome, the mint accent), the Ulu Cami (a wide block under a row of
 * nine small domes, two minarets) and the Tophane Saat Kulesi on its hill (the orange accent).
 * Shapes that overlap share one path so the translucent fill does not double up.
 */
function BursaSkyline() {
  return (
    <G testID="skyline-bursa" fill={brand.white} fillOpacity={0.32}>
      {/* Uludağ: the long ridge behind everything, then its snow patches */}
      <Path
        d="M0 92V64L36 58L84 44L132 26L178 12L206 6L232 16L262 30L300 44L346 54L390 60V92z"
        fillOpacity={0.12}
      />
      <Path d="M178 12L206 6L232 16L218 20L206 14L196 22L186 16z" fillOpacity={0.14} />
      {/* Foothills */}
      <Path
        d="M0 92V78C40 70 90 72 130 76S220 80 260 74 340 68 390 74V92z"
        fillOpacity={0.14}
      />
      {/* Cypress trees */}
      <G fill={brand.mint} fillOpacity={0.45}>
        <Path d="M84 92c-3-8-3-16 0-26 3 10 3 18 0 26zM240 92c-3-7-3-14 0-22 3 8 3 15 0 22zM352 92c-3-8-3-16 0-26 3 10 3 18 0 26zM372 92c-3-6-3-12 0-18 3 6 3 12 0 18z" />
      </G>
      {/* Yeşil Türbe, in mint: platform, octagonal body, drum, ribbed dome and finial */}
      <G fill={brand.mint} fillOpacity={0.8}>
        <Path d="M28 92V86H76V92zM32 86V64L38 58H66L72 64V86zM40 58V52H64V58zM40 52C40 42 45 37 52 33C59 37 64 42 64 52zM51.4 33V25H52.6V33z" />
      </G>
      {/* Ulu Cami: wide block, a row of nine small domes and two minarets */}
      <Path d="M106 92V64H214V92zM106 64A6 6 0 0 1 118 64zM118 64A6 6 0 0 1 130 64zM130 64A6 6 0 0 1 142 64zM142 64A6 6 0 0 1 154 64zM154 64A6 6 0 0 1 166 64zM166 64A6 6 0 0 1 178 64zM178 64A6 6 0 0 1 190 64zM190 64A6 6 0 0 1 202 64zM202 64A6 6 0 0 1 214 64zM100 92V30H104V92zM97.5 44V41H106.5V44zM99.5 30L102 14L104.5 30zM216 92V30H220V92zM213.5 44V41H222.5V44zM215.5 30L218 14L220.5 30z" />
      {/* Tophane hill and Saat Kulesi, in orange so the city reads at a glance */}
      <Path d="M246 92V84C260 76 274 72 296 70S330 76 346 92z" />
      <G fill={brand.orangeLight} fillOpacity={0.85}>
        <Path d="M286 72V62H306V72zM289 62V36H303V62zM287 36V34H305V36zM290 34V24H302V34zM288.5 24L296 10L303.5 24zM295.3 10V4H296.7V10z" />
      </G>
      {/* Gentle ground line */}
      <Path
        d="M0 90c40-2 84-2 130 0s86 2 130 0 90-2 130 0v2H0z"
        fillOpacity={0.3}
      />
    </G>
  );
}

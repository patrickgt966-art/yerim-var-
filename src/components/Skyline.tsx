import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** İzmir skyline: Asansör, Saat Kulesi and the bay. From design/2-arama.html. */
export function Skyline({
  width = 230,
  height = 150,
  tint = 'rgba(255,255,255,0.14)',
  bg = '#0B3C49',
}) {
  return (
    <Svg width={width} height={height} viewBox="0 0 230 150" accessible={false}>
      {/* Asansör */}
      <Rect x={70} y={62} width={9} height={62} fill={tint} />
      <Rect x={63} y={52} width={23} height={13} rx={2} fill={tint} />
      <Rect x={72} y={44} width={5} height={9} fill={tint} />
      {/* Saat Kulesi */}
      <Rect x={12} y={78} width={36} height={42} fill={tint} />
      <Rect x={16} y={52} width={28} height={28} fill={tint} />
      <Rect x={19} y={30} width={22} height={24} fill={tint} />
      <Circle cx={30} cy={42} r={6} fill={bg} />
      <Path d="M19 30Q30 8 41 30Z" fill={tint} />
      <Rect x={29} y={2} width={2} height={10} fill={tint} />
      {/* Körfez */}
      <Rect x={0} y={124} width={230} height={26} fill="rgba(255,255,255,0.05)" />
      <Path
        d="M0 130q10-6 20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0t20 0"
        fill="none"
        stroke={tint}
        strokeWidth={2}
      />
    </Svg>
  );
}

export function Ferry({ width = 40, height = 18, color = 'rgba(255,255,255,0.4)' }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 80 36" accessible={false}>
      <Path d="M2 22H78L70 32H12Z" fill={color} />
      <Rect x={16} y={12} width={40} height={10} rx={2} fill={color} />
      <Rect x={24} y={5} width={24} height={7} rx={2} fill={color} />
      <Rect x={34} y={0} width={6} height={6} fill="#FF8A1F" />
    </Svg>
  );
}

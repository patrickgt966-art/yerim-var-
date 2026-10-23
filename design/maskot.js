/*
  Yerim maskotu (V3, "Yerim damlası"): Yerim düğmesinin şekli canlanır. Üç köşesi yuvarlak, sol alt
  köşesi sivri (konum iğnesinin ucu, konuşma balonunun kuyruğu). Düz turuncu, altta koyu turuncu gölge,
  sol üstte parlama, lacivert ayaklar, yanak allığı. Kontur yok; yumuşak çizgi.
  Yemeğe de otoparka da elindekini değiştirerek gider: çatal, P tabelası, soru balonu.

  yerimMascot({ size, eyes, mouth, arm, prop, tilt })
    eyes:  open | blink | happy | side | up | down | curious | sad
    mouth: smile | open | o | flat | none
    arm:   rest | wave | wave2 | point | up | hold   (hold: sağ el eşyayı tutar)
    prop:  none | fork | park | ask
  yerimMascotLayers(size, { eyes:[...], mouth:[...], arm:[...], prop:[...] }):
    sahne için; her değişken <g id="eyes-open" opacity="0"> gibi ayrı katman.
*/
(function () {
  const N = '#0B3C49', O = '#FF8A1F', OD = '#F07A12', W = '#fff', CH = 'rgba(255,110,80,.32)';
  const VB = [-26, -34, 176, 156]; // kollar, eşyalar ve soru balonu taşar
  const CX = 62, CY = 56;

  const body =
    `<ellipse cx="62" cy="116" rx="40" ry="5" fill="rgba(11,60,73,.12)"/>` +
    `<rect x="34" y="99" width="15" height="13" rx="6.5" fill="${N}"/><rect x="74" y="99" width="15" height="13" rx="6.5" fill="${N}"/>`;
  const shell =
    `<path d="M50 12H78a32 32 0 0 1 32 32V72a32 32 0 0 1-32 32H20a6 6 0 0 1-6-6V44a32 32 0 0 1 32-32z" fill="${O}"/>` +
    `<path d="M14 80V98a6 6 0 0 0 6 6H78a32 32 0 0 0 31-25c-18 12-58 15-95 1z" fill="${OD}"/>` +
    `<ellipse cx="42" cy="29" rx="12" ry="6" fill="rgba(255,255,255,.38)" transform="rotate(-22 42 29)"/>` +
    `<ellipse cx="${CX - 23}" cy="${CY + 10}" rx="6" ry="3.6" fill="${CH}"/><ellipse cx="${CX + 23}" cy="${CY + 10}" rx="6" ry="3.6" fill="${CH}"/>`;

  const eyeDot = (x, y, rx = 5, ry = 6.8, hx = 1.8, hy = -2.4) =>
    `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${N}"/><circle cx="${x + hx}" cy="${y + hy}" r="1.8" fill="${W}"/>`;
  const L = CX - 12, R = CX + 12;
  const eyes = {
    open: eyeDot(L, CY) + eyeDot(R, CY),
    blink: `<path d="M${L - 5} ${CY + 1}h10M${R - 5} ${CY + 1}h10" stroke="${N}" stroke-width="3.6" stroke-linecap="round"/>`,
    happy: `<path d="M${L - 6} ${CY + 2}q6-8 12 0M${R - 6} ${CY + 2}q6-8 12 0" fill="none" stroke="${N}" stroke-width="3.6" stroke-linecap="round"/>`,
    side: eyeDot(L - 3, CY + 2, 5, 6.4, -1.2, -2.2) + eyeDot(R - 3, CY + 2, 5, 6.4, -1.2, -2.2),
    down: eyeDot(L, CY + 3, 5, 6, 1.4, -1.6) + eyeDot(R, CY + 3, 5, 6, 1.4, -1.6),
    up: eyeDot(L + 1, CY - 3, 5, 6.8, 1.6, -2.8) + eyeDot(R + 1, CY - 3, 5, 6.8, 1.6, -2.8),
    curious: eyeDot(L, CY + 1, 4.4, 5.6) + eyeDot(R, CY - 1, 6, 8) + `<path d="M${R - 6} ${CY - 13}q6-4 12 1" fill="none" stroke="${N}" stroke-width="3" stroke-linecap="round"/>`,
    sad: eyeDot(L, CY + 2, 4.6, 5.8) + eyeDot(R, CY + 2, 4.6, 5.8) +
      `<path d="M${L - 7} ${CY - 8}l9-3M${R + 7} ${CY - 8}l-9-3" stroke="${N}" stroke-width="3" stroke-linecap="round"/>`,
  };
  const mouth = {
    none: '',
    smile: `<path d="M${CX - 7} ${CY + 12}q7 7 14 0" fill="none" stroke="${N}" stroke-width="3.6" stroke-linecap="round"/>`,
    open: `<path d="M${CX - 9} ${CY + 10}q9 14 18 0z" fill="${N}" stroke="${N}" stroke-width="2" stroke-linejoin="round"/><path d="M${CX - 4} ${CY + 15.5}q4 3 8 0" fill="none" stroke="#E8604C" stroke-width="2.8" stroke-linecap="round"/>`,
    o: `<ellipse cx="${CX}" cy="${CY + 14}" rx="4" ry="5" fill="${N}"/>`,
    flat: `<path d="M${CX - 8} ${CY + 15}q4-4 8 0t8 0" fill="none" stroke="${N}" stroke-width="3.2" stroke-linecap="round"/>`,
  };
  const limb = (x1, y1, x2, y2) =>
    `<path d="M${x1} ${y1}Q${(x1 + x2) / 2 + 3} ${(y1 + y2) / 2 + 5} ${x2} ${y2}" fill="none" stroke="${O}" stroke-width="7.5" stroke-linecap="round"/><circle cx="${x2}" cy="${y2}" r="5.4" fill="${O}"/>`;
  const RIGHT_REST = limb(108, 70, 122, 84);
  const arms = {
    rest: limb(16, 70, 2, 84) + RIGHT_REST,
    wave: limb(16, 66, -4, 40) + RIGHT_REST,
    wave2: limb(16, 66, -10, 54) + RIGHT_REST,
    point: limb(16, 72, -6, 98) + RIGHT_REST,
    up: limb(16, 64, -2, 38) + limb(108, 64, 126, 38),
    hold: limb(16, 70, 2, 84) + limb(108, 70, 124, 62),
  };
  const props = {
    none: '',
    fork: `<g transform="translate(126 58) rotate(18)"><rect x="-2" y="-4" width="4" height="26" rx="2" fill="${N}"/><path d="M-7 -20v10a7 7 0 0 0 14 0v-10M0 -20v12" fill="none" stroke="${N}" stroke-width="3.2" stroke-linecap="round"/></g>`,
    park: `<g transform="translate(126 58) rotate(10)"><rect x="-2" y="2" width="4" height="22" rx="2" fill="${N}"/><rect x="-14" y="-24" width="28" height="28" rx="8" fill="#0E6B5A"/><text x="0" y="-3" text-anchor="middle" font-family="Bricolage Grotesque,Plus Jakarta Sans,sans-serif" font-weight="800" font-size="20" fill="#fff">P</text></g>`,
    ask: `<g transform="translate(118 2)"><path d="M-14 -26h28a8 8 0 0 1 8 8v10a8 8 0 0 1-8 8h-14l-8 7v-7h-6a8 8 0 0 1-8-8v-10a8 8 0 0 1 8-8z" fill="#fff" stroke="${N}" stroke-width="2.4"/><text x="0" y="-8" text-anchor="middle" font-family="Bricolage Grotesque,Plus Jakarta Sans,sans-serif" font-weight="800" font-size="17" fill="#C2410C">?</text></g>`,
  };

  function open(size) {
    const h = (size * VB[3]) / VB[2];
    return `<svg width="${size}" height="${h}" viewBox="${VB.join(' ')}" style="overflow:visible;display:block" aria-hidden="true">`;
  }
  window.yerimMascot = function ({ size = 120, eyes: e = 'open', mouth: m = 'smile', arm: a = 'rest', prop: p = 'none', tilt = -4 } = {}) {
    if (p !== 'none' && p !== 'ask' && a === 'rest') a = 'hold';
    return open(size) + `<g transform="rotate(${tilt} 62 100)">` + body + arms[a] + shell + eyes[e] + mouth[m] + props[p] + '</g></svg>';
  };
  window.yerimMascotLayers = function (size, ids) {
    const g = (k, v, inner) => `<g id="${k}-${v}" opacity="0">${inner}</g>`;
    let s = open(size) + `<g transform="rotate(-4 62 100)">` + body;
    for (const v of ids.arm || []) s += g('arm', v, arms[v]);
    s += shell;
    for (const v of ids.eyes || []) s += g('eyes', v, eyes[v]);
    for (const v of ids.mouth || []) s += g('mouth', v, mouth[v]);
    for (const v of ids.prop || []) s += g('prop', v, props[v]);
    return s + '</g></svg>';
  };
  window.yerimMascotViewBox = VB;
})();

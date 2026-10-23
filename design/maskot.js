/*
  Yerim maskotu: piksel arabacık. Düz renk, kare pikseller, kontur yok; ifade gözlerle verilir.
  16 x 13'lük ızgara: kabin (gözler), gövde (sarı farlar), koyu tampon, lacivert tekerlek-ayaklar,
  yan aynalar kol, antenin ucu sarı piksel.

  yerimMascot({ size, eyes, mouth, arm, antenna, cheeks })
    eyes:    open | blink | happy | side | up | curious | sad | sleepy
    mouth:   none | smile | open | o | flat
    arm:     rest | wave | wave2 | point | up
    antenna: mid | left | right | droop
  yerimMascotLayers(size): sahne için katmanlı SVG; her değişken <g data-k="eyes:open"> içinde.
*/
(function () {
  const C = { o: '#FF8A1F', d: '#E06E0C', n: '#0B3C49', y: '#FFE08A', w: '#FFFFFF', p: '#FFB27A' };
  const BASE = [
    '................', // 0 anten ucu (ayrı katman)
    '................', // 1 anten çubuğu (ayrı katman)
    '...oooooooooo...', // 2 kabin
    '...oooooooooo...', // 3
    '...oooooooooo...', // 4 gözler
    '...oooooooooo...', // 5
    '.oooooooooooooo.', // 6 gövde
    '.oyyooooooooyyo.', // 7 farlar
    '.oyyooooooooyyo.', // 8
    '.oooooooooooooo.', // 9
    '.dddddddddddddd.', // 10 tampon
    '..nn........nn..', // 11 tekerlek-ayak
    '..nn........nn..', // 12
  ];
  const parts = {
    eyes: {
      open: [[5, 4, 'n'], [5, 5, 'n'], [10, 4, 'n'], [10, 5, 'n']],
      blink: [[4, 5, 'n'], [5, 5, 'n'], [6, 5, 'n'], [9, 5, 'n'], [10, 5, 'n'], [11, 5, 'n']],
      happy: [[4, 5, 'n'], [5, 4, 'n'], [6, 5, 'n'], [9, 5, 'n'], [10, 4, 'n'], [11, 5, 'n']],
      side: [[4, 4, 'n'], [4, 5, 'n'], [9, 4, 'n'], [9, 5, 'n']],
      up: [[5, 3, 'n'], [5, 4, 'n'], [10, 3, 'n'], [10, 4, 'n']],
      curious: [[5, 4, 'n'], [5, 5, 'n'], [10, 3, 'n'], [11, 3, 'n'], [10, 4, 'n'], [11, 4, 'n'], [10, 5, 'n'], [11, 5, 'n']],
      sad: [[5, 5, 'n'], [10, 5, 'n'], [4, 4, 'n'], [11, 4, 'n']],
      sleepy: [[4, 5, 'n'], [5, 5, 'n'], [10, 5, 'n'], [11, 5, 'n']],
    },
    mouth: {
      none: [],
      smile: [[6, 8, 'n'], [9, 8, 'n'], [7, 9, 'n'], [8, 9, 'n']],
      open: [[6, 8, 'n'], [7, 8, 'n'], [8, 8, 'n'], [9, 8, 'n'], [7, 9, 'p'], [8, 9, 'p']],
      o: [[7, 8, 'n'], [8, 8, 'n'], [7, 9, 'n'], [8, 9, 'n']],
      flat: [[6, 9, 'n'], [7, 9, 'n'], [8, 9, 'n'], [9, 9, 'n']],
    },
    arm: {
      rest: [[0, 7, 'o'], [15, 7, 'o']],
      wave: [[0, 7, 'o'], [15, 6, 'o'], [16, 5, 'o'], [17, 4, 'o']],
      wave2: [[0, 7, 'o'], [15, 6, 'o'], [16, 6, 'o'], [17, 5, 'o']],
      point: [[0, 8, 'o'], [-1, 9, 'o'], [-2, 10, 'o'], [15, 7, 'o']],
      up: [[0, 6, 'o'], [-1, 5, 'o'], [-2, 4, 'o'], [15, 6, 'o'], [16, 5, 'o'], [17, 4, 'o']],
    },
    antenna: {
      mid: [[11, 1, 'd'], [11, 0, 'y']],
      left: [[11, 1, 'd'], [10, 0, 'y']],
      right: [[11, 1, 'd'], [12, 0, 'y']],
      droop: [[11, 1, 'd'], [12, 1, 'y']],
    },
  };
  // ızgaranın görünür alanı: kollar ve anten taşar
  const X0 = -3, Y0 = -1, W = 22, H = 15;
  const rect = (x, y, c) => `<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="${C[c]}"/>`;
  function base() {
    const out = [];
    BASE.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') out.push(rect(x, y, ch)); }));
    return out.join('');
  }
  const draw = (list) => list.map(([x, y, c]) => rect(x, y, c)).join('');
  const shadow = `<rect x="1" y="13.2" width="14" height=".8" fill="rgba(11,60,73,.14)"/>`;
  function open(size) {
    const h = (size * H) / W;
    return `<svg width="${size}" height="${h}" viewBox="${X0} ${Y0} ${W} ${H}" shape-rendering="crispEdges" style="overflow:visible;display:block" aria-hidden="true">`;
  }
  window.yerimMascot = function ({ size = 120, eyes = 'open', mouth = 'none', arm = 'rest', antenna = 'mid', extra = '' } = {}) {
    return open(size) + shadow + base() + draw(parts.eyes[eyes]) + draw(parts.mouth[mouth]) + draw(parts.arm[arm]) + draw(parts.antenna[antenna]) + extra + '</svg>';
  };
  window.yerimMascotLayers = function (size, ids) {
    let s = open(size) + shadow + base();
    for (const k of ['eyes', 'mouth', 'arm', 'antenna'])
      for (const v of ids[k] || [])
        s += `<g id="${k}-${v}" opacity="0">${draw(parts[k][v])}</g>`;
    return s + '</svg>';
  };
})();

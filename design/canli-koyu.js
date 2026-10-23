// "Canlı" taslakların karanlık hali: adres satırına ?koyu eklenince uygulamanın koyu paletine
// (src/theme/tokens.ts darkPalette) yakın renklerle çizer. Yalnızca taslak önizlemesi.
(function () {
  if (!/[?&]koyu\b/.test(location.search)) return;
  document.documentElement.classList.add('koyu');
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'canli-koyu.css';
  document.head.appendChild(l);
})();

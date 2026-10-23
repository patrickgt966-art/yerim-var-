/*
  "Canlı" taslakların ortak parçaları (4-anasayfa-canli ile aynı dil): durum çubuğu ve
  beyaz yüzen sekme çubuğu (seçili sekmede nane hap, ortada maskot yüzlü Yerim düğmesi).
  Kullanım: <div data-status></div> ve <div data-tabbar="harita"></div>
*/
(function () {
  const status = `<div style="height:47px;display:flex;align-items:flex-end;justify-content:space-between;padding:0 28px 6px;font-weight:800;font-size:15px;color:#0B3C49">
  <span>9:41</span>
  <svg width="68" height="12" viewBox="0 0 68 12" aria-hidden="true"><g fill="#0B3C49"><rect x="0" y="7" width="3" height="5" rx="1"/><rect x="5" y="5" width="3" height="7" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/><rect x="42" y="1" width="22" height="10" rx="3" fill="none" stroke="#0B3C49" stroke-width="1.4"/><rect x="44" y="3" width="15" height="6" rx="1.5"/><rect x="65" y="4" width="2" height="4" rx="1"/></g></svg>
</div>`;
  const icons = {
    index: '<path d="M4 11 12 4l8 7v9h-5v-6H9v6H4z"/>',
    harita: '<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
    favoriler: '<path d="M12 20s-8-4.8-8-10.4A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8 2.6C20 15.2 12 20 12 20z"/>',
    profil: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  };
  const labels = { index: 'Ana sayfa', harita: 'Harita', favoriler: 'Favoriler', profil: 'Profil' };
  const FACE = '<svg width="34" height="28" viewBox="0 0 34 28" aria-hidden="true"><ellipse cx="10" cy="10" rx="3.6" ry="4.8" fill="#0B3C49"/><ellipse cx="24" cy="10" rx="3.6" ry="4.8" fill="#0B3C49"/><circle cx="11.3" cy="8.2" r="1.3" fill="#fff"/><circle cx="25.3" cy="8.2" r="1.3" fill="#fff"/><ellipse cx="4.5" cy="17" rx="3.2" ry="2" fill="rgba(255,110,80,.35)"/><ellipse cx="29.5" cy="17" rx="3.2" ry="2" fill="rgba(255,110,80,.35)"/><path d="M12 18q5 5 10 0" fill="none" stroke="#0B3C49" stroke-width="2.8" stroke-linecap="round"/></svg>';
  const tab = (k, on) => `<div style="display:flex;flex-direction:column;align-items:center;gap:3px;color:${on ? '#0B3C49' : '#4F6A75'};font-weight:${on ? 800 : 700};font-size:11px">
    <span style="width:46px;height:30px;border-radius:15px;background:${on ? '#E2F1EA' : 'transparent'};display:flex;align-items:center;justify-content:center"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="${on ? '#0B3C49' : '#4F6A75'}" stroke-width="${on ? 2.3 : 2}" stroke-linejoin="round">${icons[k]}</svg></span>${labels[k]}</div>`;
  const bar = (active) => `<div style="position:absolute;left:12px;right:12px;bottom:22px;height:76px;border-radius:26px;background:#fff;display:flex;align-items:center;justify-content:space-around;padding:0 6px;box-shadow:0 10px 26px -8px rgba(11,60,73,.28);z-index:20;font-family:'Plus Jakarta Sans',system-ui,sans-serif">
  ${tab('index', active === 'index')}${tab('harita', active === 'harita')}
  <div style="margin-top:-34px;display:flex;flex-direction:column;align-items:center;gap:4px;color:#0B3C49;font-weight:800;font-size:11px">
    <div style="width:62px;height:62px;border-radius:22px 22px 22px 8px;background:#FF8A1F;border:4px solid #fff;display:flex;align-items:center;justify-content:center;transform:rotate(-4deg);box-shadow:0 8px 16px -6px rgba(255,138,31,.6)">${FACE}</div>Yerim</div>
  ${tab('favoriler', active === 'favoriler')}${tab('profil', active === 'profil')}
</div>`;
  window.canliTabBar = bar;
  document.querySelectorAll('[data-status]').forEach((el) => (el.outerHTML = status));
  document.querySelectorAll('[data-tabbar]').forEach((el) => (el.outerHTML = bar(el.dataset.tabbar)));
})();

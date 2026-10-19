import { CITIES } from '../../../src/data/cities';

/** The cities the worker accepts (the same list CitySchema validates with), inlined into the page. */
const CITY_CHOICES = CITIES.filter((c) => c.available).map((c) => ({ id: c.id, name: c.name }));

/**
 * The maintainer's page for flagged places (GET /admin): only the UI, no secret and no data. It
 * asks for the ADMIN_TOKEN, keeps it in sessionStorage and talks to /admin/flagged and
 * /admin/review on the same origin. All data is inserted with textContent.
 */
export const ADMIN_PAGE_HTML = `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Yerim Var yönetici</title>
<style>
*{box-sizing:border-box}
body{margin:0;padding:16px;background:#FBF7F1;color:#0B3C49;font:16px/1.4 system-ui,-apple-system,"Segoe UI",sans-serif;overflow-wrap:anywhere}
main{max-width:640px;margin:0 auto}
h1{font-size:22px;margin:0 0 16px}
h2{font-size:18px;margin:24px 0 12px}
label{display:block;font-weight:600;margin-bottom:6px}
input,select,button{font:inherit;min-height:44px;border-radius:12px}
input,select{width:100%;padding:8px 12px;border:1px solid #0B3C49;background:#fff;color:#0B3C49}
button{padding:8px 16px;border:2px solid #0B3C49;background:#fff;color:#0B3C49;font-weight:700;cursor:pointer}
button.primary{background:#FF8A1F;border-color:#FF8A1F;color:#0B3C49}
button.danger{background:#0B3C49;color:#fff}
button:disabled{opacity:.5;cursor:default}
.row{display:flex;gap:8px;align-items:flex-end;margin-bottom:12px}
.row>.grow{flex:1;min-width:0}
.msg{min-height:22px;margin:8px 0;font-weight:600}
.msg.err{color:#B3261E}
.card{background:#fff;border-radius:16px;padding:12px;margin-bottom:12px;border:1px solid rgba(11,60,73,.15)}
.card .id{font-weight:700}
.card p{margin:4px 0}
.badge{display:inline-block;margin-left:8px;padding:2px 10px;border-radius:999px;background:#FF8A1F;font-size:13px;font-weight:700}
.actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
a{color:#0B3C49;font-weight:600}
[hidden]{display:none!important}
</style>
</head>
<body>
<main>
<h1>Yerim Var yönetici</h1>
<form id="login">
<label for="token">Yönetici anahtarı</label>
<div class="row">
<div class="grow"><input id="token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
<button class="primary" type="submit">Giriş</button>
</div>
</form>
<section id="panel" hidden>
<div class="row">
<div class="grow"><label for="city">Şehir</label><select id="city"></select></div>
<button id="refresh" type="button">Yenile</button>
</div>
</section>
<div id="msg" class="msg" role="status"></div>
<div id="list"></div>
<section id="crashes" hidden>
<h2>Hatalar</h2>
<div id="crashList"></div>
</section>
</main>
<script>
(function () {
  var CITIES = ${JSON.stringify(CITY_CHOICES).replace(/</g, '\\u003c')};
  var KEY = 'yerim-admin-token';
  var token = '';
  var loadId = 0;
  var $ = function (id) { return document.getElementById(id); };

  function readToken() { try { return sessionStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function saveToken(v) { try { sessionStorage.setItem(KEY, v); } catch (e) {} }
  function clearToken() { token = ''; try { sessionStorage.removeItem(KEY); } catch (e) {} }

  function say(text, isError) {
    var m = $('msg');
    m.textContent = text || '';
    m.className = isError ? 'msg err' : 'msg';
  }
  function showLogin() {
    $('login').hidden = false;
    $('panel').hidden = true;
    $('list').textContent = '';
    $('crashes').hidden = true;
    $('crashList').textContent = '';
  }
  function showPanel() {
    $('login').hidden = true;
    $('panel').hidden = false;
  }
  function el(tag, text, cls) {
    var e = document.createElement(tag);
    if (text != null) e.textContent = text;
    if (cls) e.className = cls;
    return e;
  }

  // Returns the parsed JSON, or null after showing why it failed (a 401 also signs out).
  function api(path, init) {
    init = init || {};
    init.headers = { Authorization: 'Bearer ' + token };
    if (init.body) init.headers['Content-Type'] = 'application/json';
    return fetch(path, init).then(function (res) {
      if (res.status === 401) {
        clearToken();
        showLogin();
        say('Anahtar yanlış', true);
        return null;
      }
      if (res.status === 429) { say('Çok fazla deneme; biraz bekle', true); return null; }
      if (!res.ok) { say('Bir hata oldu (' + res.status + ')', true); return null; }
      return res.json();
    }, function () { say('Bağlantı kurulamadı', true); return null; });
  }

  // Where a place id points to on a map, or null: osm-n123 / osm-node-123, -w / -way-, -r / -relation-, apple-LAT,LNG.
  function mapLink(id) {
    var m = /^osm-(n|node|w|way|r|relation)-?(\\d+)$/.exec(id);
    if (m) {
      var kind = { n: 'node', node: 'node', w: 'way', way: 'way', r: 'relation', relation: 'relation' }[m[1]];
      return 'https://www.openstreetmap.org/' + kind + '/' + m[2];
    }
    m = /^apple-(-?\\d{1,3}(?:\\.\\d+)?),(-?\\d{1,3}(?:\\.\\d+)?)$/.exec(id);
    if (m) return 'https://maps.apple.com/?ll=' + m[1] + ',' + m[2];
    return null;
  }

  function review(city, placeId, action) {
    if (action === 'hide' && !confirm('Bu yer herkesten gizlensin mi?\\n' + placeId)) return;
    say('');
    api('/admin/review', {
      method: 'POST',
      body: JSON.stringify({ city: city, placeId: placeId, action: action })
    }).then(function (r) { if (r) load(); });
  }

  function card(city, p) {
    var c = el('div', null, 'card');
    var head = el('p');
    head.appendChild(el('span', p.placeId, 'id'));
    if (p.hidden) head.appendChild(el('span', 'Gizli', 'badge'));
    c.appendChild(head);
    c.appendChild(el('p', p.place === 'food' ? 'Yemek' : p.place === 'parking' ? 'Otopark' : 'Tür bilinmiyor'));
    c.appendChild(el('p', 'Kapalı diyen ağ: ' + p.closedNetworks + ' · gün: ' + p.closedDays));
    c.appendChild(el('p', 'Konum yanlış: ' + p.location + ' · Bilgi yanlış: ' + p.info));
    var url = mapLink(String(p.placeId));
    if (url) {
      var a = el('a', 'Haritada aç');
      a.setAttribute('href', url);
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
      var line = el('p');
      line.appendChild(a);
      c.appendChild(line);
    }
    var actions = el('div', null, 'actions');
    var hide = el('button', 'Gizle', 'danger');
    hide.type = 'button';
    hide.onclick = function () { review(city, p.placeId, 'hide'); };
    var keep = el('button', 'Açık, kalsın');
    keep.type = 'button';
    keep.onclick = function () { review(city, p.placeId, 'keep'); };
    actions.appendChild(hide);
    actions.appendChild(keep);
    c.appendChild(actions);
    return c;
  }

  function load() {
    var city = $('city').value;
    var mine = ++loadId;
    say('Yükleniyor…');
    return api('/admin/flagged?city=' + encodeURIComponent(city)).then(function (data) {
      if (!data || mine !== loadId) return;
      say('');
      var list = $('list');
      list.textContent = '';
      var places = data.places || [];
      if (!places.length) { say('Bu şehirde işaretli yer yok.'); return; }
      places.forEach(function (p) { list.appendChild(card(city, p)); });
    });
  }

  // The app's JS error reports, most frequent first (GET /admin/crashes); text only, via textContent.
  function loadCrashes() {
    return api('/admin/crashes').then(function (data) {
      if (!data) return;
      var box = $('crashList');
      box.textContent = '';
      var crashes = data.crashes || [];
      $('crashes').hidden = false;
      if (!crashes.length) { box.appendChild(el('p', 'Hata raporu yok.')); return; }
      crashes.forEach(function (x) {
        var s = x.sample || {};
        var c = el('div', null, 'card');
        c.appendChild(el('p', s.message, 'id'));
        c.appendChild(el('p', 'Sayı: ' + x.count + ' · Son: ' + x.last + (s.fatal ? ' · ölümcül' : '')));
        c.appendChild(el('p', 'Sürüm: ' + s.appVersion + ' (' + s.buildNumber + ') · ' + s.os + ' ' + s.osVersion));
        c.appendChild(el('p', 'Ekran: ' + s.route));
        box.appendChild(c);
      });
    });
  }

  function start(fromLogin) {
    showPanel();
    say('');
    load().then(function () { if (fromLogin) $('token').value = ''; });
    loadCrashes();
  }

  CITIES.forEach(function (c) {
    var o = el('option', c.name);
    o.value = c.id;
    $('city').appendChild(o);
  });
  $('city').onchange = load;
  $('refresh').onclick = load;
  $('login').onsubmit = function (e) {
    e.preventDefault();
    var v = $('token').value;
    if (!v) return;
    token = v;
    saveToken(v);
    start(true);
  };

  token = readToken();
  if (token) start(false);
})();
</script>
</body>
</html>
`;

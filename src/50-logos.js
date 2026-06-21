/* =============================================================================
 * 50 — CHANNEL LOGOS (real D-Smart logos via /v1/item/filter, cached) +
 *      monogram fallback tile. <img> isn't CORS-bound so logos load directly.
 * ============================================================================= */
var LOGO_KEY = 'dsg_logos_v3', logoMap = {};
try { logoMap = JSON.parse(localStorage.getItem(LOGO_KEY) || '{}') || {}; } catch (e) { logoMap = {}; }
function logoUrl(rec) { return rec ? (logoMap[rec.id] || '') : ''; }
// Warm the browser image cache so logos appear instantly while fast-zapping
// (otherwise each channel's <img> network-loads the first time it's shown).
var _logoWarm = {};
function preloadLogos() { for (var id in logoMap) { var u = logoMap[id]; if (u && !_logoWarm[id]) { _logoWarm[id] = 1; var im = new Image(); im.src = u; } } }
function loadLogos() {
  var ids = allChans.map(function (c) { return c.id; }).filter(function (id) { return !logoMap[id]; });
  if (!ids.length) { dbg('logos cached (' + Object.keys(logoMap).length + ')'); preloadLogos(); return; }
  var CH = 20, chunks = [], i; for (i = 0; i < ids.length; i += CH) chunks.push(ids.slice(i, i + CH)); // /v1/item/filter caps ~20 results/req
  var done = 0;
  chunks.forEach(function (group) {
    fetch(EP(AUTH.catalogHost) + '/v1/item/filter/?mcdn-langauge-code=' + AUTH.langCode + '&platform=web',
      { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: AUTH.cmsApiKey, langcode: AUTH.langCode }, body: JSON.stringify({ ids: group }) })
      .then(function (r) { return r.json(); }).then(function (j) {
        var arr = Array.isArray(j) ? j : (j && (j.result || j.items || j.data)) || [];
        arr.forEach(function (it) { var lg = (it.images || []).filter(function (x) { return x.type === 'Logo'; })[0]; if (lg && lg.url) logoMap[String(it.id)] = lg.url; });
        try { localStorage.setItem(LOGO_KEY, JSON.stringify(logoMap)); } catch (e) {}
      }).catch(function () {}).then(function () {
        if (++done === chunks.length) { dbg('logos loaded (' + Object.keys(logoMap).length + ')'); preloadLogos(); if (guideOpen) drawGuide(); if (bannerEl && _bannerId) { var rc = recById(_bannerId); if (rc) bannerEl.querySelector('.dsg-logobox').innerHTML = logoCell(rc); } }
      });
  });
}
// logo cell = monogram tile (always) + real logo img on top (hidden once it loads)
function monoInitials(name) {
  var s = (name || '').replace(/[^0-9A-Za-zÇĞİÖŞÜçğıöşü ]/g, '').replace(/\s+/g, ' ').trim();
  var p = s.split(' '); if (p.length >= 2 && p[1]) return (p[0].charAt(0) + p[1].charAt(0)).toLocaleUpperCase('tr'); return s.slice(0, 2).toLocaleUpperCase('tr');
}
function monoColor(rec) { var t = String(rec.id || rec.ad || ''), h = 0, i; for (i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) & 0xffffff; var hue = h % 360; return 'linear-gradient(135deg,hsl(' + hue + ',46%,34%),hsl(' + ((hue + 38) % 360) + ',48%,22%))'; }
function logoCell(rec) {
  var u = logoUrl(rec), mono = '<span class="dsg-mono" style="background:' + monoColor(rec) + '">' + esc(monoInitials(rec.ad)) + '</span>';
  return mono + (u ? '<img src="' + u + '" alt="" onload="this.parentNode.classList.add(\'dsg-haslogo\')" onerror="this.remove()">' : '');
}

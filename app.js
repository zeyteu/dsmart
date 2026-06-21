/* =============================================================================
 * D-Smart Go App  —  app.js  (AUTO-GENERATED — do not edit by hand)
 * Source: src/  ·  Rebuild: pwsh tools/build.ps1
 * ============================================================================= */
(function () {
  'use strict';

/* ======================== src/00-config.js ======================== */
/* =============================================================================
 * 00 — CONFIG + tiny helpers
 * -----------------------------------------------------------------------------
 *  AUTH/STREAM (reverse-engineered & validated, HTTP 200):
 *   - login   POST m0or3rmb5coe.merlincdn.net/membership/login/mobile?key=<crm>
 *             body {Email:"",Mobile:"+90"+phone,Password,RememberMe:true,DeviceId:null}
 *             -> `token` response header (+ Result.Products)
 *   - play    POST m9zgxauuw7mb.merlincdn.net/content?key=<crm>
 *             headers apikey:<cms>, sec:<ticketSecurity>, token (premium), langcode
 *             body {id, products, primary:{streamType,type,...}}  -> signed HLS url
 *   - primary per channel from /v1/item customFields (daion/hasinitialdvr/hasdvr)
 *   - FREE channels (21) play anonymously; premium + catch-up need login.
 *  EPG from global-epg-prod.erstream.com (static key). Player = bare hls.js.
 *  CORS blocks the cross-origin POSTs in a desktop browser; fine on the Tizen webview.
 * ============================================================================= */

// ---- config ---------------------------------------------------------------
var AUTH = {
  crmKey: 'ac3f095f717f2665f3e8787d8f62ebc1',
  cmsApiKey: 'a8fbff0087d146ddbfa26a13ebbf83c6',
  sec: 'Grqf3ayZlLoTSxirPazh6ovzDc20oqU4etTKgLbz77a8dc46',
  langCode: 'tr',
  loginHost: 'm0or3rmb5coe.merlincdn.net',
  contentHost: 'm9zgxauuw7mb.merlincdn.net',
  catalogHost: 'iwxa44sbbqmf.merlincdn.net',
  epgHost: 'global-epg-prod.erstream.com',
  epgKey: 'pln1jFxpWu1AMwtH1PIU',
  token: '', products: []
};
var SET = { bannerMs: 5000, numberTimeoutMs: 2500, favHoldMs: 650, seekSeconds: 15, seekHideMs: 4500,
  reconnectCheckMs: 2000, reconnectStallMs: 7000, reconnectHardAfter: 3 };
var KEY = { Up: 38, Down: 40, Left: 37, Right: 39, OK: 13, Back: 10009, Exit: 10182,
  ChUp: 427, ChDown: 428, Red: 403, Green: 404, MediaPP: 10252, MediaPlay: 415, MediaPause: 19,
  Rew: 412, Fwd: 417, Info: 457 };

// API endpoint base. On the TV: direct https. On the localhost:8088 dev-proxy
// (proxy.py): same-origin "/_p/<host>" so a normal browser can read the
// responses AND the proxy injects Origin:dsmartgo that /content requires.
var PROXY = (location.port === '8088') ? '/_p/' : (window.DSG_PROXY_BASE || '');
function EP(h) { return PROXY ? PROXY + h : 'https://' + h; }
function PX(u) { return PROXY && /^https?:\/\//.test(u) ? PROXY + u.replace(/^https?:\/\//, '') : u; }

function $(id) { return document.getElementById(id); }
function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function clockText() { var d = new Date(); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
function fmtClock(ms) { var d = new Date(ms); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }

var dbgLines = [];
function dbg(m) {
  var t = new Date().toISOString().slice(11, 19);
  dbgLines.push('[' + t + '] ' + m); if (dbgLines.length > 200) dbgLines.shift();
  var el = $('dbg'); if (el) { el.textContent = dbgLines.join('\n'); el.scrollTop = el.scrollHeight; }
  try { console.log('[DSG]', m); } catch (e) {}
}

/* ======================== src/10-channels.js ======================== */
/* =============================================================================
 * 10 — CHANNELS + FAVORITES (persisted id list) + zapping nav list
 * ============================================================================= */
var allChans = window.CHANNELS || [];
var chans = allChans, guestMode = false, cur = 0;
function recById(id) { for (var i = 0; i < allChans.length; i++) if (allChans[i].id === String(id)) return allChans[i]; return null; }

var FAV_KEY = 'dsg_favorites';
function favList() { try { var h = localStorage.getItem(FAV_KEY); if (h) return JSON.parse(h); } catch (e) {} return []; }
function isFav(id) { var f = favList(); for (var i = 0; i < f.length; i++) if (String(f[i]) === String(id)) return true; return false; }
function toggleFav(id) {
  if (!id) return; var f = favList(), idx = -1;
  for (var i = 0; i < f.length; i++) if (String(f[i]) === String(id)) { idx = i; break; }
  var rec = recById(id), name = rec ? rec.ad : id;
  if (idx === -1) { f.push(String(id)); toast('★ Favori: ' + name); } else { f.splice(idx, 1); toast('☆ Çıkarıldı: ' + name); }
  try { localStorage.setItem(FAV_KEY, JSON.stringify(f)); } catch (e) {}
  if (guideOpen) drawGuide(); if (bannerEl) bannerEl.querySelector('.dsg-star').textContent = isFav(activeId()) ? '★' : '';
}
// Zapping list: favorites if any (in channel order), else the active list.
function navList() {
  var f = favList(); if (f && f.length) { var out = []; for (var i = 0; i < chans.length; i++) if (isFav(chans[i].id)) out.push(chans[i]); if (out.length) return out; }
  return chans;
}
function activeId() { return (chans[cur] || {}).id; }

/* ======================== src/20-epg.js ======================== */
/* =============================================================================
 * 20 — EPG (erstream): per-channel schedule + bulk "now playing" for the guide
 * ============================================================================= */
var epgCache = {}, nowCache = {}, nowCacheAt = 0;
function epgRange(e) {
  var d = new Date(e.date);
  function set(h) { var p = (h || '00:00:00').split(':'); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), +p[0] || 0, +p[1] || 0, +p[2] || 0).getTime(); }
  var s = set(e.startHour), en = set(e.endHour); if (en <= s) en += 86400000;
  return { start: s, end: en, name: e.name || '', desc: e.description || '' };
}
function fetchSchedule(id) {
  var c = epgCache[id]; if (c && (Date.now() - c.at) < 600000) return Promise.resolve(c.list);
  var d = new Date(), iso = function (x) { return x.getFullYear() + '-' + pad2(x.getMonth() + 1) + '-' + pad2(x.getDate()); };
  var y = new Date(d.getTime() - 86400000), t = new Date(d.getTime() + 86400000);
  var u = EP(AUTH.epgHost) + '/Epg/GetChannelEpgWithRange?includeEnding=true&fillResponse=true&key=' + AUTH.epgKey +
    '&cmsId=' + id + '&startDate=' + iso(y) + '&endDate=' + iso(t) + '&timezone=03&lang=tr';
  return fetch(u).then(function (r) { return r.json(); }).then(function (arr) {
    var list = (arr || []).map(epgRange).sort(function (a, b) { return a.start - b.start; });
    epgCache[id] = { at: Date.now(), list: list }; return list;
  }).catch(function () { return []; });
}
function nowNext(id) {
  return fetchSchedule(id).then(function (list) {
    var n = Date.now(), now = null, next = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].start <= n && n < list[i].end) { now = list[i]; next = list[i + 1] || null; break; }
      if (list[i].start > n) { next = list[i]; break; }
    }
    return { now: now, next: next };
  });
}
// Bulk "now playing" for the guide (one POST for all visible channels).
function fetchBulkNow(ids) {
  if (Date.now() - nowCacheAt < 120000 && ids.every(function (i) { return nowCache[i] !== undefined; })) return Promise.resolve(nowCache);
  var qs = ids.map(function (i) { return 'cmsId=' + i; }).join('&');
  return fetch(EP(AUTH.epgHost) + '/Epg/GetAllChannelsCurrentShow?' + qs + '&key=' + AUTH.epgKey + '&timezone=03&lang=tr&bulkType=List', { method: 'POST' })
    .then(function (r) { return r.json(); }).then(function (arr) {
      (arr || []).forEach(function (e) { nowCache[e.cmsId] = e.name || ''; });
      nowCacheAt = Date.now(); return nowCache;
    }).catch(function () { return nowCache; });
}

/* ======================== src/30-stream.js ======================== */
/* =============================================================================
 * 30 — AUTH + STREAM RESOLVE (login, /v1/item primary, /content, daion enrich)
 * ============================================================================= */
function trimProducts(list) {
  return (list || []).map(function (p) {
    return { ProductId: p.ProductId, LicenseEndDate: p.LicenseEndDate, GraceEndDate: p.GraceEndDate,
      SessionControlOption: p.SessionControlOption ? { totalCount: p.SessionControlOption.totalCount } : undefined, PackageAssetName: p.PackageAssetName };
  });
}
function login(phone, password) {
  phone = (phone || '').replace(/\D/g, '');
  var body = JSON.stringify({ Email: '', Mobile: '+90' + phone, Password: password, RememberMe: true, DeviceId: null });
  dbg('login POST +90' + phone.slice(0, 3) + '…');
  return fetch(EP(AUTH.loginHost) + '/membership/login/mobile?key=' + AUTH.crmKey,
    { method: 'POST', credentials: PROXY ? 'omit' : 'include', headers: { 'Content-Type': 'application/json' }, body: body })
    .then(function (r) { var tok = r.headers.get('token'); return r.text().then(function (t) { var j = null; try { j = JSON.parse(t); } catch (e) {} return { status: r.status, j: j, tok: tok }; }); },
      function (e) { dbg('login NET FAIL ' + e); throw new Error('Bağlantı/CORS hatası (TV’de olmaz)'); })
    .then(function (o) {
      var res = o.j && (o.j.Result || o.j.result);
      if (res && res.SessionId) {
        AUTH.products = res.Products || []; AUTH.token = o.tok || AUTH.token;
        try { localStorage.setItem('dsg_auth', JSON.stringify({ token: AUTH.token, products: AUTH.products })); } catch (e) {}
        dbg('login OK — ' + AUTH.products.length + ' product(s)'); return res;
      }
      var j = o.j; throw new Error('HTTP ' + o.status + (j ? ' · ' + (j.errorCode != null ? 'kod ' + j.errorCode + ' ' : '') + (j.message || j.errorMessage || '') : ''));
    });
}
function loadAuth() { try { var s = JSON.parse(localStorage.getItem('dsg_auth') || 'null'); if (s && s.token) { AUTH.token = s.token; AUTH.products = s.products || []; return true; } } catch (e) {} return false; }

var metaCache = {};
function channelMeta(id) {
  if (metaCache[id]) return Promise.resolve(metaCache[id]);
  return fetch(EP(AUTH.catalogHost) + '/v1/item/' + id + '?mcdn-langauge-code=' + AUTH.langCode + '&platform=web',
    { headers: { 'apikey': AUTH.cmsApiKey, 'langcode': AUTH.langCode } })
    .then(function (r) { return r.json(); }).then(function (j) {
      var cf = j.customFields || [];
      function g(n) { for (var i = 0; i < cf.length; i++) if (cf[i].field === n) return cf[i].value || cf[i].code || ''; return ''; }
      var primary;
      if (/true/i.test(g('Daion'))) primary = { streamType: 'daion', type: 'HLS-Daion' };
      else if (/true/i.test(g('HasInitialDvr'))) primary = { streamType: 'hasinitialdvr', type: 'HLS-Auto', dvrQueryParam: { dvr: parseInt(g('InitialDvrDuration') || '0', 10) } };
      else primary = { streamType: 'hasdvr', type: 'HLS-Auto' };
      return (metaCache[id] = { primary: primary, dvr: parseInt(g('DvrDuration') || '0', 10) });
    }).catch(function () { return { primary: { streamType: 'hasdvr', type: 'HLS-Auto' }, dvr: 0 }; });
}
function contentPost(id, primary, withAuth) {
  var headers = { 'Content-Type': 'application/json', 'apikey': AUTH.cmsApiKey, 'sec': AUTH.sec, 'langcode': AUTH.langCode };
  if (withAuth && AUTH.token) headers.token = AUTH.token;
  var body = JSON.stringify({ id: Number(id), products: withAuth ? trimProducts(AUTH.products) : [], primary: primary });
  return fetch(EP(AUTH.contentHost) + '/content?key=' + AUTH.crmKey, { method: 'POST', credentials: 'omit', headers: headers, body: body })
    .then(function (r) { var tok = r.headers.get('token'); if (tok) AUTH.token = tok; return r.text().then(function (t) { var j = null; try { j = JSON.parse(t); } catch (e) {} return { status: r.status, j: j }; }); });
}
function unwrap(o) {
  var res = (o.j && (o.j.result || o.j.Result)) || {};
  if (res.drmTicket) { dbg('  -> DRM (phase 2)'); throw new Error('DRM'); }
  var url = res.primary && res.primary.url;
  dbg('  -> ' + (url ? 'signed (' + url.split('/')[2] + ')' : 'no url (HTTP ' + o.status + ')'));
  if (!url) throw new Error('no-url'); return url;
}
// daion gives a BASE manifest url (userid/rid/st/e). The player must enrich it
// with &ce=2&app=dsmart_web (+ ppid from POST /options/init) or daion 404s.
function enrichDaion(url) {
  if (!/daioncdn\.net/.test(url) || /[?&]app=/.test(url)) return Promise.resolve(url);
  var host = (url.match(/^https?:\/\/([^/]+)/) || [])[1] || '';
  var initUrl = EP(host) + '/options/init';
  return fetch(initUrl, { method: 'POST', credentials: PROXY ? 'omit' : 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    .then(function (r) { return r.json(); }).then(function (j) { return (j.result || {}).idHash || ''; })
    .catch(function () { return ''; })
    .then(function (ppid) { var u = url + '&ce=2&app=dsmart_web' + (ppid ? '&ppid=' + ppid : ''); dbg('  daion enriched' + (ppid ? ' ppid=' + ppid.slice(0, 8) : '')); return u; });
}
function resolveStream(ch) {
  return channelMeta(ch.id).then(function (meta) {
    dbg('content anon id=' + ch.id + ' ' + meta.primary.streamType);
    return contentPost(ch.id, meta.primary, false).then(function (o) {
      if (o.status === 200) return unwrap(o);
      if (!AUTH.token) { dbg('  -> ' + o.status + ' premium — login gerekli'); throw new Error('LOGIN'); }
      dbg('  -> ' + o.status + ' premium — login ile tekrar'); return contentPost(ch.id, meta.primary, true).then(unwrap);
    });
  }).then(enrichDaion);
}

/* ======================== src/40-player.js ======================== */
/* =============================================================================
 * 40 — PLAYER (bare hls.js; plays both live and catch-up VOD signed urls)
 * ============================================================================= */
var hls = null, videoEl;
function unmute(v) { try { v.muted = false; if (!v.volume) v.volume = 1; } catch (e) {} }
function play(url) {
  var v = videoEl; url = PX(url);
  // The <video> ships with `muted` so autoplay can start; unmute as soon as real
  // playback begins, otherwise live TV stays silent on the device.
  v.onplaying = function () { unmute(v); };
  if (window.Hls && window.Hls.isSupported()) {
    if (hls) { try { hls.destroy(); } catch (e) {} }
    hls = new window.Hls({ liveSyncDuration: 6, backBufferLength: 90, maxBufferLength: 20 });
    hls.on(window.Hls.Events.MANIFEST_PARSED, function (_, d) { dbg('hls MANIFEST_PARSED levels=' + (d.levels ? d.levels.length : 0)); v.play().then(function () { unmute(v); }).catch(function () {}); });
    hls.on(window.Hls.Events.ERROR, function (_, d) { if (d.fatal) dbg('hls FATAL ' + d.type + '/' + d.details); });
    hls.loadSource(url); hls.attachMedia(v);
  } else if (v.canPlayType('application/vnd.apple.mpegurl')) { v.src = url; v.play().then(function () { unmute(v); }).catch(function () {}); }
  else dbg('No HLS support');
  rcReset();
}

/* ======================== src/45-ui.js ======================== */
/* =============================================================================
 * 45 — OVERLAY refs + toast
 * ============================================================================= */
var bannerEl, seekEl, numberEl, guideEl, listInnerEl, tabEl, reconnectEl, toastEl, splashEl, catchupEl;
function grabEls() {
  videoEl = $('video'); bannerEl = $('dsg-banner'); seekEl = $('dsg-seek'); numberEl = $('dsg-number');
  guideEl = $('dsg-guide'); listInnerEl = guideEl.querySelector('.dsg-inner'); tabEl = guideEl.querySelector('.dsg-tabs');
  reconnectEl = $('dsg-reconnect'); toastEl = $('dsg-toast'); splashEl = $('dsg-splash'); catchupEl = $('dsg-catchup');
}
var _toastT = null;
function toast(t) { if (!toastEl) return; toastEl.textContent = t; toastEl.classList.add('dsg-show'); clearTimeout(_toastT); _toastT = setTimeout(function () { toastEl.classList.remove('dsg-show'); }, 1800); }

/* ======================== src/50-logos.js ======================== */
/* =============================================================================
 * 50 — CHANNEL LOGOS (real D-Smart logos via /v1/item/filter, cached) +
 *      monogram fallback tile. <img> isn't CORS-bound so logos load directly.
 * ============================================================================= */
var LOGO_KEY = 'dsg_logos_v3', logoMap = {};
try { logoMap = JSON.parse(localStorage.getItem(LOGO_KEY) || '{}') || {}; } catch (e) { logoMap = {}; }
function logoUrl(rec) { return rec ? (logoMap[rec.id] || '') : ''; }
function loadLogos() {
  var ids = allChans.map(function (c) { return c.id; }).filter(function (id) { return !logoMap[id]; });
  if (!ids.length) { dbg('logos cached (' + Object.keys(logoMap).length + ')'); return; }
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
        if (++done === chunks.length) { dbg('logos loaded (' + Object.keys(logoMap).length + ')'); if (guideOpen) drawGuide(); if (bannerEl && _bannerId) { var rc = recById(_bannerId); if (rc) bannerEl.querySelector('.dsg-logobox').innerHTML = logoCell(rc); } }
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

/* ======================== src/55-banner.js ======================== */
/* =============================================================================
 * 55 — ZAPPING BANNER (logo + EPG now/next + progress + clock + fav star)
 * ============================================================================= */
var _bannerT = null, _bannerId = null;
function fillBanner(rec, ep) {
  bannerEl.querySelector('.dsg-no').textContent = rec.no || '';
  bannerEl.querySelector('.dsg-logobox').innerHTML = logoCell(rec);
  bannerEl.querySelector('.dsg-name').textContent = rec.ad;
  var prog = bannerEl.querySelector('.dsg-prog'), progr = bannerEl.querySelector('.dsg-progress'), nx = bannerEl.querySelector('.dsg-next');
  if (ep && ep.now) {
    prog.textContent = ep.now.name + '  ' + fmtClock(ep.now.start) + '-' + fmtClock(ep.now.end);
    var pct = Math.max(0, Math.min(100, (Date.now() - ep.now.start) / (ep.now.end - ep.now.start) * 100));
    progr.style.display = ''; progr.querySelector('i').style.width = pct + '%';
  } else { prog.textContent = ''; progr.style.display = 'none'; }
  if (ep && ep.next) { nx.innerHTML = '<b>SONRAKİ</b>' + esc(ep.next.name) + '  ' + fmtClock(ep.next.start); nx.style.display = ''; }
  else nx.style.display = 'none';
  bannerEl.querySelector('.dsg-star').textContent = isFav(rec.id) ? '★' : '';
  bannerEl.querySelector('.dsg-clock').textContent = clockText();
}
function showBanner(rec, preview) {
  if (!bannerEl || !rec) return;
  _bannerId = rec.id;
  fillBanner(rec, null);
  nowNext(rec.id).then(function (ep) { if (_bannerId === rec.id && bannerEl.classList.contains('dsg-show')) fillBanner(rec, ep); });
  bannerEl.classList.toggle('dsg-preview', !!preview);
  bannerEl.classList.add('dsg-show');
  clearTimeout(_bannerT); _bannerT = setTimeout(function () { bannerEl.classList.remove('dsg-show'); }, SET.bannerMs);
}

/* ======================== src/60-guide.js ======================== */
/* =============================================================================
 * 60 — CHANNEL GUIDE (logos + live now-playing EPG + favorites tab)
 * ============================================================================= */
var guideOpen = false, guideFav = false, guideIdx = 0, guideItems = [], ROW_VH = 8.9;
function rowPx() { return Math.round(window.innerHeight * ROW_VH / 100); }
function guideData() { if (guideFav) { var o = []; for (var i = 0; i < chans.length; i++) if (isFav(chans[i].id)) o.push(chans[i]); return o; } return chans; }
function drawGuide() {
  guideItems = guideData();
  tabEl.innerHTML = guideFav ? 'Tüm Kanallar &nbsp; <b>★ Favoriler (' + guideItems.length + ')</b>'
    : '<b>Tüm Kanallar (' + guideItems.length + ')</b> &nbsp; ★ Favoriler';
  var act = activeId(), html = '';
  for (var i = 0; i < guideItems.length; i++) {
    var r = guideItems[i];
    html += '<div class="dsg-row' + (i === guideIdx ? ' dsg-focus' : '') + '" data-id="' + r.id + '">'
      + '<div class="dsg-r-no">' + (r.no || '') + '</div>'
      + '<div class="dsg-r-logo">' + logoCell(r) + '</div>'
      + '<div class="dsg-r-mid"><div class="dsg-r-name">' + esc(r.ad) + (r.id === act ? ' ▶' : '') + '</div>'
      + '<div class="dsg-r-prog" data-now="' + r.id + '">' + esc(nowCache[r.id] || '') + '</div></div>'
      + '<div class="dsg-r-star">' + (isFav(r.id) ? '★' : '') + '</div></div>';
  }
  listInnerEl.innerHTML = html; scrollGuide();
  // fill "now playing" from bulk EPG
  fetchBulkNow(guideItems.map(function (c) { return c.id; })).then(function (map) {
    [].forEach.call(listInnerEl.querySelectorAll('.dsg-r-prog'), function (el) { var nm = map[el.getAttribute('data-now')]; if (nm) el.textContent = nm; });
  });
}
function scrollGuide() {
  var list = $('dsg-list'); var vis = list.clientHeight || (window.innerHeight - 108), rh = rowPx();
  var top = guideIdx * rh - (vis / 2 - rh / 2), max = Math.max(0, guideItems.length * rh - vis);
  if (top < 0) top = 0; if (top > max) top = max;
  listInnerEl.style.transform = 'translateY(' + (-top) + 'px)';
}
function openGuide(fav) {
  if (fav === undefined) fav = guideFav; guideFav = !!fav;
  guideItems = guideData(); guideIdx = 0;
  var act = activeId(); for (var i = 0; i < guideItems.length; i++) if (guideItems[i].id === act) { guideIdx = i; break; }
  guideEl.classList.add('dsg-show'); guideOpen = true; drawGuide(); setTimeout(scrollGuide, 0);
}
function closeGuide() { guideEl.classList.remove('dsg-show'); guideOpen = false; }
function moveGuide(d) {
  if (!guideItems.length) return;
  guideIdx = (guideIdx + d + guideItems.length) % guideItems.length;
  var rows = listInnerEl.children; for (var i = 0; i < rows.length; i++) rows[i].classList.toggle('dsg-focus', i === guideIdx);
  scrollGuide();
}

/* ======================== src/65-tune.js ======================== */
/* =============================================================================
 * 65 — TUNE + fast-zap (CH+/- preview) + number entry
 * ============================================================================= */
function indexOfId(id) { for (var i = 0; i < chans.length; i++) if (chans[i].id === String(id)) return i; return -1; }
function tune(i) {
  if (i < 0) i = chans.length - 1; if (i >= chans.length) i = 0;
  _catchupMode = false; // tuning a live channel exits catch-up VOD
  cur = i; var c = chans[i]; showBanner(c); dbg('TUNE ' + c.ad);
  resolveStream(c).then(play).catch(function (e) {
    var m = String(e); dbg('resolve fail ' + c.slug + ': ' + m);
    if (m === 'Error: LOGIN') {
      if (guestMode) toast(c.ad + ': bu kanal şu an açılamadı'); // free channel: never bounce a guest back to login
      else { toast(c.ad + ': premium — giriş gerekli'); _pendingTune = i; showLogin(); }
    }
    else toast(c.ad + (m === 'Error: DRM' ? ': DRM (faz 2)' : ': akış alınamadı'));
  });
}
// CH+/- fast zap: spin a preview banner, tune only when you stop.
var _zapIdx = -1, _zapTimer = null, _zapActive = false, _zapList = null;
function changeChannel(dir) {
  var list = navList(); if (!list.length) return;
  if (!_zapActive) { _zapList = list; var idx = -1, a = activeId(); for (var i = 0; i < list.length; i++) if (list[i].id === a) { idx = i; break; } _zapIdx = (idx === -1 ? 0 : idx); _zapActive = true; }
  _zapIdx = (_zapIdx + dir + _zapList.length) % _zapList.length;
  showBanner(_zapList[_zapIdx], true);
  clearTimeout(_zapTimer); _zapTimer = setTimeout(commitZap, 650);
}
function commitZap() {
  if (!_zapActive) return; var rec = _zapList[_zapIdx]; _zapActive = false;
  if (rec && rec.id !== activeId()) { var gi = indexOfId(rec.id); if (gi >= 0) tune(gi); }
}
var numBuf = '', _numTimer = null;
function showNumber() { if (numberEl) { numberEl.firstChild.nodeValue = numBuf || '0'; numberEl.classList.add('dsg-show'); } }
function hideNumber() { if (numberEl) numberEl.classList.remove('dsg-show'); numBuf = ''; }
function pushDigit(d) { numBuf += d; if (numBuf.length > 4) numBuf = numBuf.slice(-4); showNumber(); clearTimeout(_numTimer); _numTimer = setTimeout(confirmNumber, SET.numberTimeoutMs); }
function confirmNumber() { var no = parseInt(numBuf, 10); hideNumber(); if (!no) return; for (var i = 0; i < chans.length; i++) if (parseInt(chans[i].no, 10) === no) { tune(i); return; } toast('Kanal yok #' + no); }

/* ======================== src/70-seek.js ======================== */
/* =============================================================================
 * 70 — DVR SEEK bar (rewind live within the buffer; also drives catch-up VOD)
 * ============================================================================= */
var seekVisible = false, scrubbing = false, scrubTarget = 0, _seekHideT = null, _seekTick = null;
function seekable() { var v = videoEl; if (!v || !v.seekable || !v.seekable.length) return null; return { start: v.seekable.start(0), end: v.seekable.end(0) }; }
function showSeek() {
  var s = seekable(); if (!s) { toast('Bu kanalda geri sarma yok'); return; }
  seekVisible = true; scrubbing = false; scrubTarget = videoEl.currentTime; seekEl.classList.add('dsg-show');
  paintSeek(); clearInterval(_seekTick); _seekTick = setInterval(paintSeek, 500); armSeekHide();
}
function hideSeek() { seekVisible = false; scrubbing = false; seekEl.classList.remove('dsg-show'); clearInterval(_seekTick); clearTimeout(_seekHideT); }
function armSeekHide() { clearTimeout(_seekHideT); _seekHideT = setTimeout(hideSeek, SET.seekHideMs); }
function paintSeek() {
  var s = seekable(); if (!s) return; var v = videoEl;
  var pos = scrubbing ? scrubTarget : v.currentTime, span = Math.max(1, s.end - s.start);
  var pct = Math.max(0, Math.min(100, (pos - s.start) / span * 100));
  seekEl.querySelector('.dsg-sk-played').style.width = pct + '%';
  seekEl.querySelector('.dsg-sk-buf').style.width = '100%';
  seekEl.querySelector('.dsg-sk-handle').style.left = pct + '%';
  var behind = Math.max(0, s.end - pos), live = behind < 8;
  seekEl.querySelector('.dsg-sk-live').classList.toggle('dsg-on', live);
  seekEl.querySelector('.dsg-sk-cur').textContent = live ? 'CANLI' : ('-' + Math.floor(behind / 60) + ':' + pad2(Math.floor(behind % 60)));
  seekEl.querySelector('.dsg-sk-pp').textContent = v.paused ? '▶' : 'II';
}
function scrub(sec) {
  var s = seekable(); if (!s) return;
  if (!seekVisible) showSeek();
  if (!scrubbing) { scrubbing = true; scrubTarget = videoEl.currentTime; }
  scrubTarget = Math.max(s.start + 1, Math.min(s.end - 1, scrubTarget + sec));
  paintSeek(); armSeekHide();
  clearTimeout(scrub._c); scrub._c = setTimeout(function () { try { videoEl.currentTime = scrubTarget; } catch (e) {} scrubbing = false; }, 220);
}
function seekToLive() { var s = seekable(); if (s) { try { videoEl.currentTime = s.end - 1; } catch (e) {} } videoEl.play().catch(function () {}); paintSeek(); }
function togglePlay() { if (videoEl.paused) videoEl.play().catch(function () {}); else videoEl.pause(); paintSeek(); armSeekHide(); }

/* ======================== src/75-catchup.js ======================== */
/* =============================================================================
 * 75 — CATCH-UP / "Geri İzle" (reverse-EPG VOD, days back)
 * -----------------------------------------------------------------------------
 * Opened with Down while the seek bar is up. Recipe (login + mega_ott / film-dizi
 * package required; anon -> 500308): POST /content with
 *   primary:{streamType:'hasreverseepg', type:'HLS-Auto',
 *            dvrQueryParam:{tstart,tend}}   (program unix start/end, SECONDS)
 * -> a full VOD of that past program on ercdn (index.m3u8, playlistType:VOD) —
 * NOT daion, so no options/init enrichment, just hls.js.
 * ============================================================================= */
var catchupOpen = false, cuItems = [], cuIdx = 0, cuDay = 0, cuChId = null, cuAll = [], _catchupMode = false, CU_ROW_VH = 7.7;
var TR_DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'], CU_DAYS_BACK = 6;
function contentCatchup(id, tstart, tend) {
  var headers = { 'Content-Type': 'application/json', apikey: AUTH.cmsApiKey, sec: AUTH.sec, langcode: AUTH.langCode };
  if (AUTH.token) headers.token = AUTH.token;
  var body = JSON.stringify({ id: Number(id), products: trimProducts(AUTH.products), primary: { streamType: 'hasreverseepg', type: 'HLS-Auto', dvrQueryParam: { tstart: tstart, tend: tend } } });
  return fetch(EP(AUTH.contentHost) + '/content?key=' + AUTH.crmKey, { method: 'POST', credentials: 'omit', headers: headers, body: body })
    .then(function (r) { return r.text().then(function (t) { var j = null; try { j = JSON.parse(t); } catch (e) {} return { status: r.status, j: j }; }); });
}
function fetchCatchupEpg(id) {
  var isoD = function (x) { return x.getFullYear() + '-' + pad2(x.getMonth() + 1) + '-' + pad2(x.getDate()); };
  var d = new Date(), s = new Date(d.getTime() - CU_DAYS_BACK * 86400000), e = new Date(d.getTime() + 86400000);
  var u = EP(AUTH.epgHost) + '/Epg/GetChannelEpgWithRange?includeEnding=true&fillResponse=true&key=' + AUTH.epgKey + '&cmsId=' + id + '&startDate=' + isoD(s) + '&endDate=' + isoD(e) + '&timezone=03&lang=tr';
  return fetch(u).then(function (r) { return r.json(); }).then(function (arr) { return (arr || []).map(epgRange).sort(function (a, b) { return a.start - b.start; }); }).catch(function () { return []; });
}
function cuDayKey(off) { var d = new Date(); d.setDate(d.getDate() + off); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
function cuDayLabel(off) { var d = new Date(); d.setDate(d.getDate() + off); return TR_DAYS[d.getDay()]; }
function cuDayItems(off) {
  var k = cuDayKey(off), out = off === 0 ? [{ live: true }] : [];
  for (var i = 0; i < cuAll.length; i++) { var p = cuAll[i], dd = new Date(p.start); if (dd.getFullYear() + '-' + dd.getMonth() + '-' + dd.getDate() === k) out.push(p); }
  return out;
}
function cuFocusNow() { var now = Date.now(); for (var i = 0; i < cuItems.length; i++) { if (!cuItems[i].live && cuItems[i].start <= now && now < cuItems[i].end) { cuIdx = i; return; } } cuIdx = cuItems.length > 1 ? (cuDay === 0 ? 0 : 1) : 0; }
function openCatchup() {
  if (!catchupEl) return;
  if (seekVisible) hideSeek(); if (bannerEl) bannerEl.classList.remove('dsg-show');
  cuChId = activeId(); catchupOpen = true; catchupEl.classList.add('dsg-show');
  catchupEl.querySelector('.dsg-cu-sub').textContent = (recById(cuChId) || {}).ad || '';
  cuDay = 0; cuAll = []; cuItems = [{ live: true }]; cuIdx = 0; drawCatchup();
  fetchCatchupEpg(cuChId).then(function (list) { cuAll = list; cuItems = cuDayItems(0); cuFocusNow(); drawCatchup(); });
}
function closeCatchup() { catchupOpen = false; if (catchupEl) catchupEl.classList.remove('dsg-show'); }
function drawCatchup() {
  if (!catchupEl) return; var inner = catchupEl.querySelector('.dsg-cu-inner'); if (!inner) return;
  var ds = catchupEl.querySelector('.dsg-cu-days-inner'), dh = '';
  for (var o = -CU_DAYS_BACK; o <= 0; o++) dh += '<span class="dsg-cu-day' + (o === cuDay ? ' dsg-on' : '') + '">' + esc(cuDayLabel(o)) + '</span>';
  if (ds) { ds.innerHTML = dh; scrollCatchupDays(); }
  var now = Date.now(), html = '';
  for (var i = 0; i < cuItems.length; i++) {
    var it = cuItems[i], focus = (i === cuIdx ? ' dsg-focus' : '');
    if (it.live) { html += '<div class="dsg-cu-row dsg-cu-live' + focus + '"><span class="dsg-cu-time">●</span><span class="dsg-cu-name">Canlıya dön</span></div>'; continue; }
    var isNow = it.start <= now && now < it.end, isPast = it.end <= now;
    var dim = (isNow || isPast) ? '' : ' dsg-dim';
    var badge = isNow ? '<span class="dsg-cu-badge">ŞİMDİ</span>' : (isPast ? '<span class="dsg-cu-badge" style="background:rgba(255,255,255,.18)">baştan ▸</span>' : '');
    html += '<div class="dsg-cu-row' + focus + dim + '"><span class="dsg-cu-time">' + esc(fmtClock(it.start)) + '</span><span class="dsg-cu-name">' + esc(it.name) + '</span>' + badge + '</div>';
  }
  inner.innerHTML = html; scrollCatchup();
}
function scrollCatchupDays() {
  var box = catchupEl.querySelector('.dsg-cu-days'), inner = box && box.querySelector('.dsg-cu-days-inner'); if (!inner) return;
  var on = inner.querySelector('.dsg-cu-day.dsg-on'); if (!on) { inner.style.transform = 'translateX(0)'; return; }
  var vis = box.clientWidth, full = inner.scrollWidth, center = on.offsetLeft + on.offsetWidth / 2;
  var left = center - vis / 2, max = Math.max(0, full - vis);
  if (left < 0) left = 0; if (left > max) left = max; inner.style.transform = 'translateX(' + (-left) + 'px)';
}
function scrollCatchup() {
  var box = catchupEl.querySelector('.dsg-cu-list'), inner = catchupEl.querySelector('.dsg-cu-inner'); if (!box || !inner) return;
  var vis = box.clientHeight || (window.innerHeight - 108), rh = Math.round(window.innerHeight * CU_ROW_VH / 100);
  var top = cuIdx * rh - (vis / 2 - rh / 2), max = Math.max(0, cuItems.length * rh - vis);
  if (top < 0) top = 0; if (top > max) top = max; inner.style.transform = 'translateY(' + (-top) + 'px)';
}
function moveCatchup(d) { if (!cuItems.length) return; cuIdx += d; if (cuIdx < 0) cuIdx = cuItems.length - 1; if (cuIdx >= cuItems.length) cuIdx = 0; drawCatchup(); }
function catchupDay(d) { var n = cuDay + d; if (n > 0) n = 0; if (n < -CU_DAYS_BACK) n = -CU_DAYS_BACK; if (n === cuDay) return; cuDay = n; cuItems = cuDayItems(n); cuFocusNow(); drawCatchup(); }
function runCatchup() {
  var it = cuItems[cuIdx]; if (!it) return;
  if (it.live) { closeCatchup(); _catchupMode = false; tune(cur); toast('● Canlı'); return; }
  if (it.start > Date.now()) { toast('Henüz yayınlanmadı'); return; }
  if (!AUTH.token) { toast('Geri izleme için giriş gerekli'); return; }
  var tstart = Math.floor(it.start / 1000), tend = Math.floor(it.end / 1000), nm = it.name;
  toast('Yükleniyor: ' + nm + ' …'); closeCatchup();
  contentCatchup(cuChId, tstart, tend).then(function (o) {
    var prim = ((o.j && (o.j.result || o.j.Result)) || {}).primary || {};
    if (o.status === 200 && prim.url) { _catchupMode = true; dbg('catchup VOD ' + nm + ' -> ' + prim.url.split('/')[2]); play(prim.url); showBanner(recById(cuChId)); toast('▸ ' + nm + ' (baştan)'); setTimeout(showSeek, 900); return; }
    dbg('catchup fail ' + o.status + ' ' + (prim.errorMessage || ''));
    toast(/package|paket/i.test(prim.errorMessage || '') ? 'Paketiniz geri izlemeyi içermiyor' : 'Geri izleme alınamadı');
  });
}

/* ======================== src/80-reconnect.js ======================== */
/* =============================================================================
 * 80 — AUTO-RECONNECT watchdog (stall / error / offline recovery)
 * ============================================================================= */
var rcTimer = null, rcLastT = 0, rcLastAdv = 0, rcTries = 0, rcOn = false, rcWasOffline = false;
function showRc(m) { if (reconnectEl) { reconnectEl.querySelector('.dsg-rc-txt').textContent = m; reconnectEl.classList.add('dsg-show'); } }
function hideRc() { if (reconnectEl) reconnectEl.classList.remove('dsg-show'); }
function rcReset() { rcLastAdv = Date.now(); rcTries = 0; rcOn = false; hideRc(); }
function rcRecover(why) {
  rcOn = true; rcTries++; showRc(navigator.onLine === false ? 'Bağlantı bekleniyor…' : 'Yeniden bağlanılıyor…'); dbg('reconnect #' + rcTries + ' (' + why + ')');
  if (rcTries <= SET.reconnectHardAfter) { var p = videoEl.play(); if (p && p.catch) p.catch(function () {}); if (hls) try { hls.startLoad(); } catch (e) {} }
  else { rcTries = 0; if (!_catchupMode) tune(cur); } // don't yank a catch-up VOD back to live
  rcLastAdv = Date.now();
}
function rcTick() {
  var v = videoEl; if (!v) return; var now = Date.now();
  if (navigator.onLine === false) { rcWasOffline = true; rcOn = true; showRc('Bağlantı bekleniyor…'); return; }
  if (rcWasOffline) { rcWasOffline = false; rcRecover('online'); return; }
  if (v.error) { rcRecover('error'); return; }
  if (document.hidden || v.paused) { rcLastT = v.currentTime; rcLastAdv = now; if (rcOn) rcReset(); return; }
  if (Math.abs(v.currentTime - rcLastT) > 0.05) { rcLastT = v.currentTime; rcLastAdv = now; if (rcOn) { rcReset(); toast('Yeniden bağlanıldı'); } return; }
  if (now - rcLastAdv > SET.reconnectStallMs) rcRecover('stall');
}
function startReconnect() {
  if (rcTimer) return; rcLastAdv = Date.now();
  try { window.addEventListener('offline', function () { rcWasOffline = true; showRc('Bağlantı bekleniyor…'); }); window.addEventListener('online', function () { rcRecover('online-evt'); }); } catch (e) {}
  rcTimer = setInterval(rcTick, SET.reconnectCheckMs);
}

/* ======================== src/85-keys.js ======================== */
/* =============================================================================
 * 85 — REMOTE KEYS (register + keydown/keyup handlers)
 * -----------------------------------------------------------------------------
 *   CH +/-   -> fast zap         Up/Down -> guide
 *   OK       -> seek bar (then Down = catch-up); hold = favorite
 *   Left/Right -> rewind/forward Back -> close overlay · 3x Back -> debug overlay
 * ============================================================================= */
function registerKeys() {
  try { if (typeof tizen !== 'undefined' && tizen.tvinputdevice) {
    ['ChannelUp', 'ChannelDown', 'ColorF0Red', 'ColorF1Green', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'Info', 'MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaRewind', 'MediaFastForward'].forEach(function (k) { try { tizen.tvinputdevice.registerKey(k); } catch (e) {} });
    dbg('tizen keys registered');
  } else dbg('no tizen API (preview)'); } catch (e) {}
}
function digitOf(k) { if (k >= 48 && k <= 57) return k - 48; if (k >= 96 && k <= 105) return k - 96; return -1; }
var _enterT = null, _enterLong = false, _backTaps = 0, _backTimer = null, _pendingTune = null;

function onKeyDown(e) {
  var k = e.keyCode;
  if (loginVisible()) { loginKey(e); return; }
  var d = digitOf(k); if (d >= 0) { e.preventDefault(); pushDigit(String(d)); return; }
  if (k === KEY.ChUp) { e.preventDefault(); changeChannel(1); return; }
  if (k === KEY.ChDown) { e.preventDefault(); changeChannel(-1); return; }
  if (k === KEY.Red) { e.preventDefault(); toggleFav(guideOpen && guideSel() ? guideSel().id : activeId()); return; }
  if (k === KEY.Green) { e.preventDefault(); if (guideOpen && guideFav) closeGuide(); else openGuide(true); return; }
  if (k === KEY.Info) { e.preventDefault(); showBanner(chans[cur]); return; }
  if (k === KEY.MediaPP || k === KEY.MediaPlay || k === KEY.MediaPause) { e.preventDefault(); if (!seekVisible) showSeek(); else togglePlay(); return; }
  if (k === KEY.Rew) { e.preventDefault(); scrub(-SET.seekSeconds); return; }
  if (k === KEY.Fwd) { e.preventDefault(); scrub(SET.seekSeconds); return; }

  if (catchupOpen) {
    if (k === KEY.Up) { e.preventDefault(); moveCatchup(-1); return; }
    if (k === KEY.Down) { e.preventDefault(); moveCatchup(1); return; }
    if (k === KEY.Left) { e.preventDefault(); catchupDay(-1); return; }  // older day
    if (k === KEY.Right) { e.preventDefault(); catchupDay(1); return; }  // newer day (toward today)
    if (k === KEY.OK) { e.preventDefault(); e.stopPropagation(); runCatchup(); return; }
    if (k === KEY.Back || k === KEY.Exit) { e.preventDefault(); e.stopPropagation(); closeCatchup(); return; }
    return;
  }
  if (guideOpen) {
    if (k === KEY.Up) { e.preventDefault(); moveGuide(-1); return; }
    if (k === KEY.Down) { e.preventDefault(); moveGuide(1); return; }
    if (k === KEY.Left) { e.preventDefault(); if (guideFav) openGuide(false); return; }
    if (k === KEY.Right) { e.preventDefault(); if (!guideFav) openGuide(true); return; }
    if (k === KEY.Back || k === KEY.Exit) { e.preventDefault(); e.stopPropagation(); closeGuide(); return; }
    if (k === KEY.OK) {
      if (_enterT) { e.preventDefault(); return; }
      e.preventDefault(); _enterLong = false;
      _enterT = setTimeout(function () { _enterLong = true; var r = guideSel(); if (r) toggleFav(r.id); }, SET.favHoldMs);
      return;
    }
    return;
  }
  // watching
  if (k === KEY.Down && seekVisible) { e.preventDefault(); openCatchup(); return; } // seek bar up + Down → catch-up
  if (k === KEY.Left) { e.preventDefault(); scrub(-SET.seekSeconds); return; }
  if (k === KEY.Right) { e.preventDefault(); scrub(SET.seekSeconds); return; }
  if (k === KEY.Up || k === KEY.Down) { e.preventDefault(); openGuide(); return; }
  if (k === KEY.OK) {
    if (scrubbing) { e.preventDefault(); try { videoEl.currentTime = scrubTarget; } catch (er) {} scrubbing = false; return; }
    if (seekVisible) { e.preventDefault(); togglePlay(); return; }
    if (_enterT) { e.preventDefault(); return; }
    e.preventDefault(); _enterLong = false;
    _enterT = setTimeout(function () { _enterLong = true; toggleFav(activeId()); }, SET.favHoldMs);
    return;
  }
  if (k === KEY.Back || k === KEY.Exit) {
    if (seekVisible) { e.preventDefault(); hideSeek(); return; }
    if (bannerEl.classList.contains('dsg-show')) { e.preventDefault(); bannerEl.classList.remove('dsg-show'); return; }
    // triple-back → debug overlay
    e.preventDefault(); _backTaps++; clearTimeout(_backTimer);
    if (_backTaps >= 3) { _backTaps = 0; $('dbg').classList.toggle('show'); } else _backTimer = setTimeout(function () { _backTaps = 0; }, 1200);
    return;
  }
}
function onKeyUp(e) {
  if (e.keyCode !== KEY.OK) return;
  var wasLong = _enterLong; if (_enterT) { clearTimeout(_enterT); _enterT = null; } _enterLong = false;
  if (wasLong) { e.preventDefault(); return; }                       // favorite toggled
  if (guideOpen) { var r = guideSel(); if (r) { var gi = indexOfId(r.id); closeGuide(); if (gi >= 0) tune(gi); } e.preventDefault(); }
  else if (!seekVisible && !scrubbing) { showSeek(); e.preventDefault(); } // OK while watching → seek bar
}
function guideSel() { return guideItems[guideIdx] || null; }

/* ======================== src/90-login.js ======================== */
/* =============================================================================
 * 90 — LOGIN screen (optional; phone + 6-digit password, or "continue as guest")
 * ============================================================================= */
var lgEls = [], lgFocus = 0;
function loginVisible() { return $('login').classList.contains('show'); }
function loginFocus(i) { if (!lgEls.length) return; lgFocus = (i < 0) ? lgEls.length - 1 : (i >= lgEls.length ? 0 : i); var el = lgEls[lgFocus]; try { el.focus(); } catch (e) {} lgEls.forEach(function (x) { x.classList.toggle('lg-on', x === el); }); }
function loginKey(e) {
  var k = e.keyCode;
  if (k === KEY.Back || k === KEY.Exit) { e.preventDefault(); closeLogin(); _pendingTune = null; return; }
  if (k === KEY.Up || k === KEY.Left) { e.preventDefault(); loginFocus(lgFocus - 1); return; }
  if (k === KEY.Down || k === KEY.Right) { e.preventDefault(); loginFocus(lgFocus + 1); return; }
  if (k === KEY.OK) { var el = lgEls[lgFocus]; if (el && el.tagName === 'BUTTON') { e.preventDefault(); el.click(); } else if (el) { try { el.focus(); el.click(); } catch (e2) {} } }
}
function showLogin() {
  if (splashEl) splashEl.style.display = 'none';
  var lg = $('login'); lg.classList.add('show');
  var phone = $('lg-phone'), pass = $('lg-pass'), btn = $('lg-btn'), guest = $('lg-guest'), err = $('lg-err');
  lgEls = [phone, pass, btn, guest]; lgFocus = 0;
  function submit() {
    err.textContent = ''; btn.textContent = 'Giriş yapılıyor…';
    login(phone.value, pass.value).then(function () {
      closeLogin(); btn.textContent = 'Giriş yap'; setGuestMode(false);
      var t = _pendingTune; _pendingTune = null; tune(t != null ? t : 0);
    }).catch(function (e) { err.textContent = 'Giriş başarısız: ' + (e && e.message ? e.message : 'kontrol et'); btn.textContent = 'Giriş yap'; });
  }
  btn.onclick = submit;
  guest.onclick = function () { closeLogin(); _pendingTune = null; setGuestMode(true); startApp(); };
  [phone, pass].forEach(function (inp) { inp.addEventListener('keydown', function (e) { if (e.keyCode === 13) { if (inp === pass) submit(); else loginFocus(lgFocus + 1); } }); });
  setTimeout(function () { loginFocus(0); }, 100);
}
function closeLogin() { $('login').classList.remove('show'); }

/* ======================== src/95-boot.js ======================== */
/* =============================================================================
 * 95 — MODES (guest/full) + BOOT (must be last: wires keys + starts the app)
 * ============================================================================= */
function setGuestMode(on) { guestMode = on; chans = on ? allChans.filter(function (c) { return c.free; }) : allChans; cur = 0; if (guideOpen) drawGuide(); dbg('mode ' + (on ? 'GUEST(' + chans.length + ')' : 'FULL(' + chans.length + ')')); }
function startApp() {
  if (splashEl) setTimeout(function () { splashEl.style.opacity = '0'; setTimeout(function () { splashEl.style.display = 'none'; }, 500); }, 400);
  tune(0);
  setInterval(function () { if (bannerEl.classList.contains('dsg-show')) bannerEl.querySelector('.dsg-clock').textContent = clockText(); }, 20000);
}
function boot() {
  grabEls(); dbg('boot — ' + allChans.length + ' channels');
  loadLogos();
  registerKeys();
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('keyup', onKeyUp, true);
  startReconnect();
  dbg('NOTE: cross-origin /content works on the Tizen webview (CORS only blocks a desktop browser).');
  if (loadAuth()) startApp(); else showLogin();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

})();

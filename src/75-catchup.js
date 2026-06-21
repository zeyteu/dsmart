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
function cuDayLabel(off) { if (off === 0) return 'Bugün'; if (off === -1) return 'Dün'; var d = new Date(); d.setDate(d.getDate() + off); return TR_DAYS[d.getDay()]; }
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

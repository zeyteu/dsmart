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

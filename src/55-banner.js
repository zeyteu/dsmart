/* =============================================================================
 * 55 — ZAPPING BANNER (logo + EPG now/next + progress + clock + fav star)
 * ============================================================================= */
var _bannerT = null, _bannerId = null, _epgT = null;
function fillBanner(rec, ep) {
  bannerEl.querySelector('.dsg-no').textContent = rec.no || '';
  bannerEl.querySelector('.dsg-logobox').innerHTML = logoCell(rec);
  bannerEl.querySelector('.dsg-name').textContent = rec.ad;
  var prog = bannerEl.querySelector('.dsg-prog'), progr = bannerEl.querySelector('.dsg-progress'), nx = bannerEl.querySelector('.dsg-next');
  if (ep && ep.now) {
    prog.textContent = ep.now.name + '  ' + fmtClock(ep.now.start) + '-' + fmtClock(ep.now.end);
    var pct = Math.max(0, Math.min(100, (Date.now() - ep.now.start) / (ep.now.end - ep.now.start) * 100));
    progr.style.display = ''; progr.querySelector('i').style.width = pct + '%';
  } else if (nowCache[rec.id]) { prog.textContent = nowCache[rec.id]; progr.style.display = 'none'; } // instant from bulk now-playing
  else { prog.textContent = ''; progr.style.display = 'none'; }
  if (ep && ep.next) { nx.innerHTML = '<b>SONRAKİ</b>' + esc(ep.next.name) + '  ' + fmtClock(ep.next.start); nx.style.display = ''; }
  else nx.style.display = 'none';
  bannerEl.querySelector('.dsg-star').textContent = isFav(rec.id) ? '★' : '';
  bannerEl.querySelector('.dsg-clock').textContent = clockText();
}
function showBanner(rec, preview) {
  if (!bannerEl || !rec) return;
  _bannerId = rec.id;
  fillBanner(rec, null); // instant: logo + name + cached now-playing (no network wait)
  // Enrich with full now/next + progress, but debounced so fast CH+/- zapping
  // doesn't fire a per-channel EPG fetch for every channel skimmed past.
  clearTimeout(_epgT);
  _epgT = setTimeout(function () {
    nowNext(rec.id).then(function (ep) { if (_bannerId === rec.id && bannerEl.classList.contains('dsg-show')) fillBanner(rec, ep); });
  }, 300);
  bannerEl.classList.toggle('dsg-preview', !!preview);
  bannerEl.classList.add('dsg-show');
  clearTimeout(_bannerT); _bannerT = setTimeout(function () { bannerEl.classList.remove('dsg-show'); }, SET.bannerMs);
}

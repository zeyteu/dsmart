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

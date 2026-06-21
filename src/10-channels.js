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

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

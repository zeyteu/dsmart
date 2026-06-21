/* =============================================================================
 * 95 — MODES (guest/full) + BOOT (must be last: wires keys + starts the app)
 * ============================================================================= */
function setGuestMode(on) { guestMode = on; chans = on ? allChans.filter(function (c) { return c.free; }) : allChans; cur = 0; if (guideOpen) drawGuide(); dbg('mode ' + (on ? 'GUEST(' + chans.length + ')' : 'FULL(' + chans.length + ')')); }
function startApp() {
  if (splashEl) setTimeout(function () { splashEl.style.opacity = '0'; setTimeout(function () { splashEl.style.display = 'none'; }, 500); }, 400);
  tune(0);
  fetchBulkNow(allChans.map(function (c) { return c.id; })); // warm now-playing for all channels so zapping shows EPG instantly
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

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

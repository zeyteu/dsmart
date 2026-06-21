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
  updatePreview(pct, pos, behind, live);
}
function scrub(sec) {
  var s = seekable(); if (!s) return;
  if (!seekVisible) showSeek();
  if (!scrubbing) { scrubbing = true; scrubTarget = videoEl.currentTime; }
  scrubTarget = Math.max(s.start + 1, Math.min(s.end - 1, scrubTarget + sec));
  paintSeek(); armSeekHide();
  clearTimeout(scrub._c); scrub._c = setTimeout(function () { try { videoEl.currentTime = scrubTarget; } catch (e) {} scrubbing = false; paintSeek(); }, 220);
}
/* --- YouTube-style scrub preview: rolling frame cache captured from the main video.
 * No second decoder (TV-safe). Covers already-played/buffered positions; if frame
 * capture is blocked (TV security) it silently no-ops and the preview just hides. --- */
var fcache = [], _capT = null, FC_MAX = 120, FC_EVERY = 1200, FC_NEAR = 6;
function frameCacheReset() { fcache = []; clearInterval(_capT); _capT = setInterval(captureFrame, FC_EVERY); }
function captureFrame() {
  var v = videoEl; if (!v || v.readyState < 2 || scrubbing) return;
  var s = seekable(); if (!s) return;
  try { var c = document.createElement('canvas'); c.width = 256; c.height = 144; c.getContext('2d').drawImage(v, 0, 0, 256, 144); fcache.push({ t: v.currentTime, c: c }); }
  catch (e) { return; }
  var minT = s.start - 4; while (fcache.length && fcache[0].t < minT) fcache.shift();
  if (fcache.length > FC_MAX) fcache.splice(0, fcache.length - FC_MAX);
}
function nearestFrame(t) {
  var best = null, bd = 1e9; for (var i = 0; i < fcache.length; i++) { var d = Math.abs(fcache[i].t - t); if (d < bd) { bd = d; best = fcache[i]; } }
  return (best && bd <= FC_NEAR) ? best : null;
}
function updatePreview(pct, pos, behind, live) {
  if (!seekEl) return; var box = seekEl.querySelector('.dsg-sk-prev'); if (!box) return;
  var fr = scrubbing ? nearestFrame(pos) : null;
  if (!fr) { box.classList.remove('dsg-on'); return; }
  var pv = box.querySelector('canvas'); try { pv.getContext('2d').drawImage(fr.c, 0, 0, pv.width, pv.height); } catch (e) {}
  box.querySelector('.dsg-sk-prev-t').textContent = '-' + Math.floor(behind / 60) + ':' + pad2(Math.floor(behind % 60));
  box.style.left = Math.max(9, Math.min(91, pct)) + '%';
  box.classList.add('dsg-on');
}
function seekToLive() { var s = seekable(); if (s) { try { videoEl.currentTime = s.end - 1; } catch (e) {} } videoEl.play().catch(function () {}); paintSeek(); }
function togglePlay() { if (videoEl.paused) videoEl.play().catch(function () {}); else videoEl.pause(); paintSeek(); armSeekHide(); }

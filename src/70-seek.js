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

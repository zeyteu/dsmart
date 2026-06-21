/* =============================================================================
 * 65 — TUNE + fast-zap (CH+/- preview) + number entry
 * ============================================================================= */
function indexOfId(id) { for (var i = 0; i < chans.length; i++) if (chans[i].id === String(id)) return i; return -1; }
function tune(i) {
  if (i < 0) i = chans.length - 1; if (i >= chans.length) i = 0;
  _catchupMode = false; // tuning a live channel exits catch-up VOD
  cur = i; var c = chans[i]; showBanner(c); dbg('TUNE ' + c.ad);
  resolveStream(c).then(play).catch(function (e) {
    var m = String(e); dbg('resolve fail ' + c.slug + ': ' + m);
    if (m === 'Error: LOGIN') {
      if (guestMode) toast(c.ad + ': bu kanal şu an açılamadı'); // free channel: never bounce a guest back to login
      else { toast(c.ad + ': premium — giriş gerekli'); _pendingTune = i; showLogin(); }
    }
    else toast(c.ad + (m === 'Error: DRM' ? ': DRM (faz 2)' : ': akış alınamadı'));
  });
}
// CH+/- fast zap: spin a preview banner, tune only when you stop.
var _zapIdx = -1, _zapTimer = null, _zapActive = false, _zapList = null;
function changeChannel(dir) {
  var list = navList(); if (!list.length) return;
  if (!_zapActive) { _zapList = list; var idx = -1, a = activeId(); for (var i = 0; i < list.length; i++) if (list[i].id === a) { idx = i; break; } _zapIdx = (idx === -1 ? 0 : idx); _zapActive = true; }
  _zapIdx = (_zapIdx + dir + _zapList.length) % _zapList.length;
  showBanner(_zapList[_zapIdx], true);
  clearTimeout(_zapTimer); _zapTimer = setTimeout(commitZap, 650);
}
function commitZap() {
  if (!_zapActive) return; var rec = _zapList[_zapIdx]; _zapActive = false;
  if (rec && rec.id !== activeId()) { var gi = indexOfId(rec.id); if (gi >= 0) tune(gi); }
}
var numBuf = '', _numTimer = null;
function showNumber() { if (numberEl) { numberEl.firstChild.nodeValue = numBuf || '0'; numberEl.classList.add('dsg-show'); } }
function hideNumber() { if (numberEl) numberEl.classList.remove('dsg-show'); numBuf = ''; }
function pushDigit(d) { numBuf += d; if (numBuf.length > 4) numBuf = numBuf.slice(-4); showNumber(); clearTimeout(_numTimer); _numTimer = setTimeout(confirmNumber, SET.numberTimeoutMs); }
function confirmNumber() { var no = parseInt(numBuf, 10); hideNumber(); if (!no) return; for (var i = 0; i < chans.length; i++) if (parseInt(chans[i].no, 10) === no) { tune(i); return; } toast('Kanal yok #' + no); }

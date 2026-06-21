/* =============================================================================
 * 90 — LOGIN screen (optional; phone + 6-digit password, or "continue as guest")
 * ============================================================================= */
var lgEls = [], lgFocus = 0;
function loginVisible() { return $('login').classList.contains('show'); }
function loginFocus(i) { if (!lgEls.length) return; lgFocus = (i < 0) ? lgEls.length - 1 : (i >= lgEls.length ? 0 : i); var el = lgEls[lgFocus]; try { el.focus(); } catch (e) {} lgEls.forEach(function (x) { x.classList.toggle('lg-on', x === el); }); }
function loginKey(e) {
  var k = e.keyCode;
  if (k === KEY.Back || k === KEY.Exit) { e.preventDefault(); closeLogin(); _pendingTune = null; return; }
  if (k === KEY.Up || k === KEY.Left) { e.preventDefault(); loginFocus(lgFocus - 1); return; }
  if (k === KEY.Down || k === KEY.Right) { e.preventDefault(); loginFocus(lgFocus + 1); return; }
  if (k === KEY.OK) { var el = lgEls[lgFocus]; if (el && el.tagName === 'BUTTON') { e.preventDefault(); el.click(); } else if (el) { try { el.focus(); el.click(); } catch (e2) {} } }
}
function showLogin() {
  if (splashEl) splashEl.style.display = 'none';
  var lg = $('login'); lg.classList.add('show');
  var phone = $('lg-phone'), pass = $('lg-pass'), btn = $('lg-btn'), guest = $('lg-guest'), err = $('lg-err');
  lgEls = [phone, pass, btn, guest]; lgFocus = 0;
  function submit() {
    err.textContent = ''; btn.textContent = 'Giriş yapılıyor…';
    login(phone.value, pass.value).then(function () {
      closeLogin(); btn.textContent = 'Giriş yap'; setGuestMode(false);
      var t = _pendingTune; _pendingTune = null; tune(t != null ? t : 0);
    }).catch(function (e) { err.textContent = 'Giriş başarısız: ' + (e && e.message ? e.message : 'kontrol et'); btn.textContent = 'Giriş yap'; });
  }
  btn.onclick = submit;
  guest.onclick = function () { closeLogin(); _pendingTune = null; setGuestMode(true); startApp(); };
  [phone, pass].forEach(function (inp) { inp.addEventListener('keydown', function (e) { if (e.keyCode === 13) { if (inp === pass) submit(); else loginFocus(lgFocus + 1); } }); });
  setTimeout(function () { loginFocus(0); }, 100);
}
function closeLogin() { $('login').classList.remove('show'); }

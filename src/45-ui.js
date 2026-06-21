/* =============================================================================
 * 45 — OVERLAY refs + toast
 * ============================================================================= */
var bannerEl, seekEl, numberEl, guideEl, listInnerEl, tabEl, reconnectEl, toastEl, splashEl, catchupEl;
function grabEls() {
  videoEl = $('video'); bannerEl = $('dsg-banner'); seekEl = $('dsg-seek'); numberEl = $('dsg-number');
  guideEl = $('dsg-guide'); listInnerEl = guideEl.querySelector('.dsg-inner'); tabEl = guideEl.querySelector('.dsg-tabs');
  reconnectEl = $('dsg-reconnect'); toastEl = $('dsg-toast'); splashEl = $('dsg-splash'); catchupEl = $('dsg-catchup');
}
var _toastT = null;
function toast(t) { if (!toastEl) return; toastEl.textContent = t; toastEl.classList.add('dsg-show'); clearTimeout(_toastT); _toastT = setTimeout(function () { toastEl.classList.remove('dsg-show'); }, 1800); }

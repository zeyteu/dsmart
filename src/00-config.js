/* =============================================================================
 * 00 — CONFIG + tiny helpers
 * -----------------------------------------------------------------------------
 *  AUTH/STREAM (reverse-engineered & validated, HTTP 200):
 *   - login   POST m0or3rmb5coe.merlincdn.net/membership/login/mobile?key=<crm>
 *             body {Email:"",Mobile:"+90"+phone,Password,RememberMe:true,DeviceId:null}
 *             -> `token` response header (+ Result.Products)
 *   - play    POST m9zgxauuw7mb.merlincdn.net/content?key=<crm>
 *             headers apikey:<cms>, sec:<ticketSecurity>, token (premium), langcode
 *             body {id, products, primary:{streamType,type,...}}  -> signed HLS url
 *   - primary per channel from /v1/item customFields (daion/hasinitialdvr/hasdvr)
 *   - FREE channels (21) play anonymously; premium + catch-up need login.
 *  EPG from global-epg-prod.erstream.com (static key). Player = bare hls.js.
 *  CORS blocks the cross-origin POSTs in a desktop browser; fine on the Tizen webview.
 * ============================================================================= */

// ---- config ---------------------------------------------------------------
var AUTH = {
  crmKey: 'ac3f095f717f2665f3e8787d8f62ebc1',
  cmsApiKey: 'a8fbff0087d146ddbfa26a13ebbf83c6',
  sec: 'Grqf3ayZlLoTSxirPazh6ovzDc20oqU4etTKgLbz77a8dc46',
  langCode: 'tr',
  loginHost: 'm0or3rmb5coe.merlincdn.net',
  contentHost: 'm9zgxauuw7mb.merlincdn.net',
  catalogHost: 'iwxa44sbbqmf.merlincdn.net',
  epgHost: 'global-epg-prod.erstream.com',
  epgKey: 'pln1jFxpWu1AMwtH1PIU',
  token: '', products: []
};
var SET = { bannerMs: 5000, numberTimeoutMs: 2500, favHoldMs: 650, seekSeconds: 15, seekHideMs: 4500,
  reconnectCheckMs: 2000, reconnectStallMs: 7000, reconnectHardAfter: 3 };
var KEY = { Up: 38, Down: 40, Left: 37, Right: 39, OK: 13, Back: 10009, Exit: 10182,
  ChUp: 427, ChDown: 428, Red: 403, Green: 404, MediaPP: 10252, MediaPlay: 415, MediaPause: 19,
  Rew: 412, Fwd: 417, Info: 457 };

// API endpoint base. On the TV: direct https. On the localhost:8088 dev-proxy
// (proxy.py): same-origin "/_p/<host>" so a normal browser can read the
// responses AND the proxy injects Origin:dsmartgo that /content requires.
var PROXY = (location.port === '8088') ? '/_p/' : (window.DSG_PROXY_BASE || '');
function EP(h) { return PROXY ? PROXY + h : 'https://' + h; }
function PX(u) { return PROXY && /^https?:\/\//.test(u) ? PROXY + u.replace(/^https?:\/\//, '') : u; }

function $(id) { return document.getElementById(id); }
function esc(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function clockText() { var d = new Date(); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }
function fmtClock(ms) { var d = new Date(ms); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); }

var dbgLines = [];
function dbg(m) {
  var t = new Date().toISOString().slice(11, 19);
  dbgLines.push('[' + t + '] ' + m); if (dbgLines.length > 200) dbgLines.shift();
  var el = $('dbg'); if (el) { el.textContent = dbgLines.join('\n'); el.scrollTop = el.scrollHeight; }
  try { console.log('[DSG]', m); } catch (e) {}
}

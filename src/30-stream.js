/* =============================================================================
 * 30 — AUTH + STREAM RESOLVE (login, /v1/item primary, /content, daion enrich)
 * ============================================================================= */
function trimProducts(list) {
  return (list || []).map(function (p) {
    return { ProductId: p.ProductId, LicenseEndDate: p.LicenseEndDate, GraceEndDate: p.GraceEndDate,
      SessionControlOption: p.SessionControlOption ? { totalCount: p.SessionControlOption.totalCount } : undefined, PackageAssetName: p.PackageAssetName };
  });
}
function login(phone, password) {
  phone = (phone || '').replace(/\D/g, '');
  var body = JSON.stringify({ Email: '', Mobile: '+90' + phone, Password: password, RememberMe: true, DeviceId: null });
  dbg('login POST +90' + phone.slice(0, 3) + '…');
  return fetch(EP(AUTH.loginHost) + '/membership/login/mobile?key=' + AUTH.crmKey,
    { method: 'POST', credentials: PROXY ? 'omit' : 'include', headers: { 'Content-Type': 'application/json' }, body: body })
    .then(function (r) { var tok = r.headers.get('token'); return r.text().then(function (t) { var j = null; try { j = JSON.parse(t); } catch (e) {} return { status: r.status, j: j, tok: tok }; }); },
      function (e) { dbg('login NET FAIL ' + e); throw new Error('Bağlantı/CORS hatası (TV’de olmaz)'); })
    .then(function (o) {
      var res = o.j && (o.j.Result || o.j.result);
      if (res && res.SessionId) {
        AUTH.products = res.Products || []; AUTH.token = o.tok || AUTH.token;
        try { localStorage.setItem('dsg_auth', JSON.stringify({ token: AUTH.token, products: AUTH.products })); } catch (e) {}
        dbg('login OK — ' + AUTH.products.length + ' product(s)'); return res;
      }
      var j = o.j; throw new Error('HTTP ' + o.status + (j ? ' · ' + (j.errorCode != null ? 'kod ' + j.errorCode + ' ' : '') + (j.message || j.errorMessage || '') : ''));
    });
}
function loadAuth() { try { var s = JSON.parse(localStorage.getItem('dsg_auth') || 'null'); if (s && s.token) { AUTH.token = s.token; AUTH.products = s.products || []; return true; } } catch (e) {} return false; }

var metaCache = {};
function channelMeta(id) {
  if (metaCache[id]) return Promise.resolve(metaCache[id]);
  return fetch(EP(AUTH.catalogHost) + '/v1/item/' + id + '?mcdn-langauge-code=' + AUTH.langCode + '&platform=web',
    { headers: { 'apikey': AUTH.cmsApiKey, 'langcode': AUTH.langCode } })
    .then(function (r) { return r.json(); }).then(function (j) {
      var cf = j.customFields || [];
      function g(n) { for (var i = 0; i < cf.length; i++) if (cf[i].field === n) return cf[i].value || cf[i].code || ''; return ''; }
      var primary;
      if (/true/i.test(g('Daion'))) primary = { streamType: 'daion', type: 'HLS-Daion' };
      else if (/true/i.test(g('HasInitialDvr'))) primary = { streamType: 'hasinitialdvr', type: 'HLS-Auto', dvrQueryParam: { dvr: parseInt(g('InitialDvrDuration') || '0', 10) } };
      else primary = { streamType: 'hasdvr', type: 'HLS-Auto' };
      return (metaCache[id] = { primary: primary, dvr: parseInt(g('DvrDuration') || '0', 10) });
    }).catch(function () { return { primary: { streamType: 'hasdvr', type: 'HLS-Auto' }, dvr: 0 }; });
}
function contentPost(id, primary, withAuth) {
  var headers = { 'Content-Type': 'application/json', 'apikey': AUTH.cmsApiKey, 'sec': AUTH.sec, 'langcode': AUTH.langCode };
  if (withAuth && AUTH.token) headers.token = AUTH.token;
  var body = JSON.stringify({ id: Number(id), products: withAuth ? trimProducts(AUTH.products) : [], primary: primary });
  return fetch(EP(AUTH.contentHost) + '/content?key=' + AUTH.crmKey, { method: 'POST', credentials: 'omit', headers: headers, body: body })
    .then(function (r) { var tok = r.headers.get('token'); if (tok) AUTH.token = tok; return r.text().then(function (t) { var j = null; try { j = JSON.parse(t); } catch (e) {} return { status: r.status, j: j }; }); });
}
function unwrap(o) {
  var res = (o.j && (o.j.result || o.j.Result)) || {};
  if (res.drmTicket) { dbg('  -> DRM (phase 2)'); throw new Error('DRM'); }
  var url = res.primary && res.primary.url;
  dbg('  -> ' + (url ? 'signed (' + url.split('/')[2] + ')' : 'no url (HTTP ' + o.status + ')'));
  if (!url) throw new Error('no-url'); return url;
}
// daion gives a BASE manifest url (userid/rid/st/e). The player must enrich it
// with &ce=2&app=dsmart_web (+ ppid from POST /options/init) or daion 404s.
function enrichDaion(url) {
  if (!/daioncdn\.net/.test(url) || /[?&]app=/.test(url)) return Promise.resolve(url);
  var host = (url.match(/^https?:\/\/([^/]+)/) || [])[1] || '';
  var initUrl = EP(host) + '/options/init';
  return fetch(initUrl, { method: 'POST', credentials: PROXY ? 'omit' : 'include', headers: { 'Content-Type': 'application/json' }, body: '{}' })
    .then(function (r) { return r.json(); }).then(function (j) { return (j.result || {}).idHash || ''; })
    .catch(function () { return ''; })
    .then(function (ppid) { var u = url + '&ce=2&app=dsmart_web' + (ppid ? '&ppid=' + ppid : ''); dbg('  daion enriched' + (ppid ? ' ppid=' + ppid.slice(0, 8) : '')); return u; });
}
function resolveStream(ch) {
  return channelMeta(ch.id).then(function (meta) {
    dbg('content anon id=' + ch.id + ' ' + meta.primary.streamType);
    return contentPost(ch.id, meta.primary, false).then(function (o) {
      if (o.status === 200) return unwrap(o);
      if (!AUTH.token) { dbg('  -> ' + o.status + ' premium — login gerekli'); throw new Error('LOGIN'); }
      dbg('  -> ' + o.status + ' premium — login ile tekrar'); return contentPost(ch.id, meta.primary, true).then(unwrap);
    });
  }).then(enrichDaion);
}

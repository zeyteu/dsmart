/* =============================================================================
 * service.js — TizenBrew background NodeJS service (CORS proxy)
 * -----------------------------------------------------------------------------
 * TizenBrew runs this inside its own Node process (vm.runInContext) when the app
 * launches. A TizenBrew "app" page is served at http://127.0.0.1:8081 — a real
 * origin — so the webview ENFORCES CORS and our cross-origin calls to
 * *.merlincdn.net / *.ercdn.net / *.daioncdn.net (which only allow the dsmartgo
 * origin) are blocked. This service runs server-side (no CORS) and forwards them,
 * injecting the Origin + a real desktop User-Agent that the WAF accepts and
 * passing `token`/apikey/sec/langcode through with their EXACT lowercase names
 * (Node's http does NOT capitalize header names). It returns Access-Control-
 * Allow-Origin:* so the app (8081) can read the response cross-port.
 *
 * The app fetches:  http://127.0.0.1:8086/p/<host>/<path?query>
 * Uses ONLY Node built-ins (http/https/url) so it needs no bundling and runs on
 * both legacy Node v4.4.3 and modern Node.
 * ============================================================================= */
'use strict';
var http = require('http');
var https = require('https');
var url = require('url');

var PORT = 8086; // own port (TizenBrew=8081, TizenTube=8085 — keep clear of both)
var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
var ORIGIN = 'https://www.dsmartgo.com.tr';
var REFERER = 'https://www.dsmartgo.com.tr/';
// request headers forwarded verbatim (lowercase) from the app to the upstream
var PASS = ['token', 'apikey', 'sec', 'langcode', 'content-type', 'accept', 'range', 'accept-language'];

function cors(h) {
  h = h || {};
  h['Access-Control-Allow-Origin'] = '*';
  h['Access-Control-Allow-Headers'] = '*';
  h['Access-Control-Allow-Methods'] = 'GET,POST,OPTIONS';
  h['Access-Control-Expose-Headers'] = 'token, Remember, Content-Range, Accept-Ranges';
  return h;
}
// Rewrite absolute http(s) URLs inside a playlist to relative /p/<host>/<path> so
// nested variant/segment/key URLs also flow back through this proxy. Relative
// (host-less) URLs already resolve against the proxied manifest base, so leave them.
function rewriteM3U8(text) {
  return text.replace(/https?:\/\/[^\s"'\r\n]+/g, function (abs) {
    var u = url.parse(abs);
    return '/p/' + u.host + (u.path || '/');
  });
}

http.createServer(function (req, res) {
  if (req.method === 'OPTIONS') { res.writeHead(204, cors({ 'Content-Length': '0' })); res.end(); return; }
  if (req.url === '/' || req.url === '/health') { res.writeHead(200, cors({ 'content-type': 'text/plain' })); res.end('ok'); return; }

  var m = /^\/p\/([^\/]+)(\/[^?]*)?(\?[\s\S]*)?$/.exec(req.url);
  if (!m) { res.writeHead(404, cors({ 'content-type': 'text/plain' })); res.end('bad proxy path'); return; }
  var host = m[1], path = (m[2] || '/') + (m[3] || '');

  var outH = { 'Origin': ORIGIN, 'Referer': REFERER, 'User-Agent': UA, 'Accept-Encoding': 'identity' };
  for (var i = 0; i < PASS.length; i++) { var k = PASS[i]; if (req.headers[k] != null) outH[k] = req.headers[k]; }

  var body = [];
  req.on('data', function (c) { body.push(c); });
  req.on('end', function () {
    var buf = Buffer.concat(body);
    if (buf.length) outH['Content-Length'] = buf.length;
    var opts = { host: host, path: path, method: req.method, headers: outH, rejectUnauthorized: false };
    var up = https.request(opts, function (r) {
      var ct = (r.headers['content-type'] || '').toLowerCase();
      var isM3U8 = /mpegurl/.test(ct) || /\.m3u8(\?|$)/.test(path);
      var h = cors({ 'content-type': r.headers['content-type'] || 'application/octet-stream' });
      if (r.headers['token']) h['token'] = r.headers['token'];           // login rolls the token via this header
      if (r.headers['content-range']) h['content-range'] = r.headers['content-range'];
      if (r.headers['accept-ranges']) h['accept-ranges'] = r.headers['accept-ranges'];
      if (isM3U8) {
        var chunks = [];
        r.on('data', function (c) { chunks.push(c); });
        r.on('end', function () {
          var t = rewriteM3U8(Buffer.concat(chunks).toString('utf8'));
          h['Content-Length'] = Buffer.byteLength(t);
          res.writeHead(r.statusCode, h); res.end(t);
        });
      } else {
        res.writeHead(r.statusCode, h); r.pipe(res);
      }
    });
    up.on('error', function (e) { try { res.writeHead(502, cors({ 'content-type': 'text/plain' })); res.end('proxy error: ' + e.message); } catch (x) {} });
    if (buf.length) up.write(buf);
    up.end();
  });
}).listen(PORT, '127.0.0.1', function () { try { console.log('DSG proxy service on http://127.0.0.1:' + PORT); } catch (e) {} });

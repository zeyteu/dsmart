#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
D-Smart Go App — local DEV proxy (PC testing only; NOT used on the TV).

Why this exists:
  /content (and login) on MerlinCDN REQUIRE an `Origin` header and only send
  CORS headers for the dsmartgo.com.tr origin. A normal browser on localhost
  therefore can't read the responses, and a `--disable-web-security` browser
  strips the Origin header entirely -> HTTP 400. On the Tizen webview none of
  this matters; this proxy just lets us run a fully working demo on a PC.

What it does:
  * serves the app's static files (index.html, app.js, channels.js, ...)
  * forwards  /_p/<host>/<path?query>  ->  https://<host>/<path?query>
      - injects  Origin/Referer = https://www.dsmartgo.com.tr
      - passes through apikey / sec / langcode / token / content-type
      - returns permissive CORS so the browser can read it
      - exposes the `token` response header (needed by login)
      - rewrites absolute URLs inside .m3u8 playlists back through the proxy
        so HLS segments/keys also load on the PC

Run:  python proxy.py            (serves on http://127.0.0.1:8088)
app.js auto-detects port 8088 and routes every API host through /_p/.
"""
import sys, os, gzip, io, re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import http.client

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8088
ROOT = os.path.dirname(os.path.abspath(__file__))
ORIGIN = "https://www.dsmartgo.com.tr"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")

# request headers we relay client -> upstream (lowercased)
PASS_REQ = ("apikey", "sec", "langcode", "token", "content-type", "accept",
            "range", "accept-language", "user-agent")
# response headers we relay upstream -> client (lowercased)
PASS_RES = ("content-type", "token", "remember", "cache-control",
            "content-range", "accept-ranges", "etag", "last-modified")

CT = {".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
      ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
      ".ico": "image/x-icon", ".map": "application/json"}

ABS_URL = re.compile(rb'https?://[^\s"\'<>]+')


def rewrite_m3u8(body):
    """Rewrite absolute http(s) URLs inside a playlist to go back through /_p/."""
    def repl(m):
        u = m.group(0)
        return b"/_p/" + re.sub(rb'^https?://', b'', u)
    return ABS_URL.sub(repl, body)


class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):  # quieter console
        pass

    # ---- CORS preflight ----
    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Max-Age", "86400")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        self._route("GET")

    def do_POST(self):
        self._route("POST")

    def _route(self, method):
        if self.path.startswith("/_p/"):
            self._proxy(method)
        else:
            self._static()

    # ---- static files ----
    def _static(self):
        p = self.path.split("?", 1)[0]
        if p in ("/", ""):
            p = "/index.html"
        fp = os.path.normpath(os.path.join(ROOT, p.lstrip("/")))
        if not fp.startswith(ROOT) or not os.path.isfile(fp):
            self.send_error(404)
            return
        with open(fp, "rb") as f:
            data = f.read()
        ext = os.path.splitext(fp)[1].lower()
        self.send_response(200)
        self.send_header("Content-Type", CT.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    # ---- proxy /_p/<host>/<rest> ----
    def _proxy(self, method):
        target = self.path[len("/_p/"):]                # host/path?query
        host, _, rest = target.partition("/")
        path = "/" + rest
        body = b""
        if method == "POST":
            ln = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(ln) if ln else b""
        # Build headers with EXACT lowercase names via http.client (urllib's
        # add_header capitalizes, e.g. token -> Token; the RODP auth layer reads
        # `token` CASE-SENSITIVELY and ignores `Token` -> treats the request as
        # anonymous -> 400 "must have package"). http.client sends names verbatim
        # and does NOT auto-inject a second Content-Type.
        out = {}
        fwd = []
        for h in PASS_REQ:
            v = self.headers.get(h)
            if v:
                out[h] = v
                fwd.append(h + "(" + str(len(v)) + ")")
        out["origin"] = ORIGIN
        out.setdefault("referer", ORIGIN + "/")
        out.setdefault("user-agent", UA)
        out["accept-encoding"] = "gzip"
        # the authenticated reverse-epg (catch-up) endpoint rejects the token
        # unless the request looks browser-real; forward the caller's UA/referer
        # when present (set above via setdefault) instead of our synthetic ones.
        try:
            conn = http.client.HTTPSConnection(host, timeout=25)
            conn.request(method, path, body=body if method == "POST" else None, headers=out)
            r = conn.getresponse()
            status, resp_headers, data = r.status, r.headers, r.read()
            conn.close()
        except Exception as e:
            self.send_response(502)
            self.send_header("Access-Control-Allow-Origin", "*")
            msg = ("proxy error: " + str(e)).encode()
            self.send_header("Content-Length", str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)
            return

        # decompress if gzipped so we can rewrite playlists
        if (resp_headers.get("Content-Encoding") or "").lower() == "gzip":
            try:
                data = gzip.GzipFile(fileobj=io.BytesIO(data)).read()
            except OSError:
                pass

        ctype = (resp_headers.get("Content-Type") or "").lower()
        if "mpegurl" in ctype or path.split("?", 1)[0].endswith(".m3u8"):
            data = rewrite_m3u8(data)

        self.send_response(status)
        for h in PASS_RES:
            v = resp_headers.get(h)
            if v:
                self.send_header(h, v)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Expose-Headers", "token, Remember, Content-Range, Accept-Ranges, x-fwd")
        self.send_header("x-fwd", ",".join(fwd))
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    print("D-Smart Go dev-proxy  ->  http://127.0.0.1:%d   (serving %s)" % (PORT, ROOT))
    print("Open http://127.0.0.1:%d/  in a NORMAL browser (no flags needed)." % PORT)
    ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()

# D-Smart Go App — standalone PoC ("Yol 2")

A **TizenBrew `apps` module** that plays D-Smart Go live TV from its **own fast UI
shell**, instead of loading the whole D-Smart React/Next website (which is what
makes the `dsmartgo-tizenbrew` *mod* slow to boot and switch).

Same idea as **TizenTube**: don't run the heavy site — reuse only its stream.

## Why this can be fast

The mod boots the full dsmartgo.com.tr SPA (≈370 KB `persist:pageData` + ads +
analytics + cookie-consent + tag-manager + the React app), then overlays UI. This
app loads `index.html` + `hls.js` + a channel list — a few KB — and renders the
guide instantly.

## Reverse-engineered playback chain (captured live)

| Step | Call | Result |
|------|------|--------|
| 1 | `POST dsmartgo.daioncdn.net/options/init` body `{}` | `{result:{idHash:"<32hex>"},success:true}` — `idHash` **is** the `ppid` token param |
| 2 | `GET <rmp-cdn>/rmp/rr/vgs-o.json` | `{data:…}` — RMP/Daion signing material |
| 3 | **@daion 2.1.5 signs the base m3u8 client-side** | `…/<slug>/<slug>.m3u8?userid&rid&st&e&ce&app&ppid&sid` (no separate sign API) |
| 4 | `hls.js` plays the signed URL | **Proven**: bare `new Hls()` → `MANIFEST_PARSED`, plays |

Other findings:
- `deeplink-api.tivizon.com/dsmart/livechannel?k=…&i=<id>` is **not** playback —
  it's a deeplink/category resolver. `k` is a static public key, not a secret.
- **Channel switching needs no auth call** — the Daion session signs every channel.
- **Free channels** (ATV, Kanal D, Show, Star, TV8…) play with **no login**
  (`userid=ed0`, anon). **Premium/locked** channels need login (`userToken`) and
  likely **Widevine/Daion DRM** on the 2nd (`HLS-Daion`) url → phase 2.

## How playback works (logged in) — the key finding

The player URL signature (`st/e/rid/…`) is **NOT computed client-side** (no md5/crypto
exists in any of D-Smart's bundles). Instead the server returns the fully-signed url
from an **authed content endpoint** when you present your account's entitlements:

```
POST https://m9zgxauuw7mb.merlincdn.net/content?key=<CONTENT_KEY>
  body: { id:<channelId>, products:<userInfo.Products>, primary:true }
  -> { result:{ drmTicket, primary:{ url:"…<SIGNED HLS>" }, secondary } }
```

- `drmTicket === null` → **clear HLS**, hls.js plays `primary.url` directly (proven).
  Premium Sinema TV returned `drmTicket:null` — no Widevine.
- `products` = `authData.userInfo.Products` (read from the logged-in session).
- The TizenBrew browser keeps the D-Smart login cookie, so the POST is authenticated.

So: **no signing to reverse-engineer.** `app.js → resolveStreamUrl()` implements exactly
this. CORS blocks it in a desktop browser but not on the Tizen webview.

## Login (self-contained)

A standalone `apps` module runs on its **own origin**, so it can't reuse
dsmartgo.com.tr's cookie/`Products` cross-origin — it logs in itself:

```
POST https://m0or3rmb5coe.merlincdn.net/membership/login/mobile
  headers: apiKey:<key>, langCode:tr, Content-Type:application/json
  body: { Email, Mobile:null, Password, RememberMe:true, DeviceId:<uuid> }
  -> { Result:{ SessionId, Products, Subscriptions, User, … } }
```

`app.js` shows a login screen → `login()` stores `SessionId` + `Products` (cached in
localStorage, restored on next launch) → `/content` is called with those Products.
All `*.merlincdn.net` calls send the static `apiKey` header + the login cookie.

## Status

✅ Fast UI shell (instant guide, banner, zapping) — verified in preview
✅ Login screen + `login()` (→ SessionId + Products), auth cached & restored
✅ Remote keys (Up/Down/OK guide, CH +/- zap, key `0` = debug overlay)
✅ hls.js player (proven to play D-Smart signed HLS)
✅ `resolveStreamUrl()` — the real `/content` call (id + products → signed url)
✅ `apiKey`/`langCode` headers + DeviceId UUID wired
🟡 **First device run** (no CORS) to confirm end-to-end + free-channel coverage
🔴 DRM channels (`drmTicket` set) = phase 2 (EME + Widevine license)

## Free vs premium (verify on device)

- **Premium** (Sinema TV…): confirmed via `/content` → `drmTicket:null` → clear HLS.
- **Free** (ATV, Kanal D…): they play in D-Smart, but their signed url comes from the
  bulk `GET /v1/item/<id>` load, **not** `/content`. The PoC calls `/content` for every
  channel — the device run shows whether `/content` also returns a signed url for free
  channel ids. If not, add the `/v1/item/<id>` path for free channels (free m3u8 params
  lack `ppid`).

> Alternative if you skip login: the same resolver works as a **mod** injected into
> dsmartgo.com.tr (same origin = free session + products), own UI on top — heavier boot
> than a pure app, zero login code.

## Why it must be finished on the TV, not in a browser

Every cross-origin call here (`options/init`, the CDN m3u8) is **CORS-blocked in a
normal browser** but **not on the Tizen webview**. The debug overlay (key `0`)
prints each step's raw result; one device run reveals exactly what the SDK appends
in step 3, which finalizes `SIGN.resolve`.

## Files

| File | Purpose |
|------|---------|
| `package.json` | TizenBrew `apps` manifest (`packageType:"apps"`, `main:index.html`) |
| `index.html` | Shell: video + guide + banner + debug overlay; loads hls.js |
| `channels.js` | 115 channels (id/slug/name/no), reused from the mod; logos via jsDelivr |
| `app.js` | UI + remote keys + session bootstrap + player + `SIGN.resolve` |

## Install (TizenBrew → Module Manager → apps)

```
github:okeozek/dsmartgo-app-poc
```

> PoC. Free-channel core only; premium/DRM and DVR/EPG are not wired yet.

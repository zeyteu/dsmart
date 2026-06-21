/* =============================================================================
 * 40 — PLAYER (bare hls.js; plays both live and catch-up VOD signed urls)
 * ============================================================================= */
var hls = null, videoEl;
function unmute(v) { try { v.muted = false; if (!v.volume) v.volume = 1; } catch (e) {} }
function play(url) {
  var v = videoEl; url = PX(url);
  // The <video> ships with `muted` so autoplay can start; unmute as soon as real
  // playback begins, otherwise live TV stays silent on the device.
  v.onplaying = function () { unmute(v); };
  if (window.Hls && window.Hls.isSupported()) {
    if (hls) { try { hls.destroy(); } catch (e) {} }
    hls = new window.Hls({ liveSyncDuration: 6, backBufferLength: 90, maxBufferLength: 20 });
    hls.on(window.Hls.Events.MANIFEST_PARSED, function (_, d) { dbg('hls MANIFEST_PARSED levels=' + (d.levels ? d.levels.length : 0)); v.play().then(function () { unmute(v); }).catch(function () {}); });
    hls.on(window.Hls.Events.ERROR, function (_, d) { if (d.fatal) dbg('hls FATAL ' + d.type + '/' + d.details); });
    hls.loadSource(url); hls.attachMedia(v);
  } else if (v.canPlayType('application/vnd.apple.mpegurl')) { v.src = url; v.play().then(function () { unmute(v); }).catch(function () {}); }
  else dbg('No HLS support');
  rcReset(); frameCacheReset();
}

/* =============================================================================
 * 40 — PLAYER (bare hls.js; plays both live and catch-up VOD signed urls)
 * ============================================================================= */
var hls = null, videoEl;
function play(url) {
  var v = videoEl; url = PX(url);
  if (window.Hls && window.Hls.isSupported()) {
    if (hls) { try { hls.destroy(); } catch (e) {} }
    hls = new window.Hls({ liveSyncDuration: 6, backBufferLength: 90, maxBufferLength: 20 });
    hls.on(window.Hls.Events.MANIFEST_PARSED, function (_, d) { dbg('hls MANIFEST_PARSED levels=' + (d.levels ? d.levels.length : 0)); v.play().catch(function () {}); });
    hls.on(window.Hls.Events.ERROR, function (_, d) { if (d.fatal) dbg('hls FATAL ' + d.type + '/' + d.details); });
    hls.loadSource(url); hls.attachMedia(v);
  } else if (v.canPlayType('application/vnd.apple.mpegurl')) { v.src = url; v.play().catch(function () {}); }
  else dbg('No HLS support');
  rcReset();
}

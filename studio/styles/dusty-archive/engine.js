/* Dusty Archive engine (style id: dusty-archive).
 *
 * A dark archive desk under one lamp, filmed by a slow pan-and-zoom camera.
 *
 * Architecture
 * - Build time: S.desk(root) makes one frame div holding a world div (the desk, the items, a world-space
 *   lamp light), then screen layers: vignette, a film canvas (grain, dust, hairs, scratches, flicker),
 *   a fade-to-black layer and the HTML overlays (lower-thirds, date stamps, subtitles, title cards).
 * - Every archival material is painted ONCE into a canvas at build time: aged paper (mottling, fibres,
 *   foxing, edge burn, creases, stains, deckled or torn edges, a baked contact shadow), procedural period
 *   photographs (13 subjects drawn in grey, then tone-mapped to sepia / silver / cyanotype / faded /
 *   modern with grain, vignette, halation, emulsion damage and scratches), halftone newsprint, typewriter
 *   text (each strike jittered and inked differently), handwriting, maps (noisy coastlines with ripple
 *   hatching), cork, felt, wood. Text on the desk is always canvas (never HTML under the camera scale,
 *   which is not seek-stable in Chromium). Things that appear over time (typed lines, written lines,
 *   redaction bars, stamps, routes, strings, ink circles) are separate canvases or SVG paths revealed
 *   by clip-path, masks or dash offsets.
 * - ONE frame function (V.onFrame, registered by S.desk) sets everything from t: the camera (a list of
 *   moves, cuts and tracks resolved by S.flush into fixed start states, plus drift, gate weave and
 *   shakes), each item's entrance pose, every updater (typing, writing, counters, routes), overlays
 *   and the film canvas (redrawn from a frame-step index, so seeking either way gives the same pixels).
 * - Timing: templates find their words (V.find, keyword props, the longest content word of a label,
 *   then a narration estimate), spread the missing ones, clamp beats into [0.2 s, duration - 1 s] and
 *   push an error if anything still ends after V.duration.
 * No network, no timers, no wall clock; randomness only from V.makeRand and fixed-seed hashes.
 * Every masthead, place, document and name the engine prints by itself is invented.
 */
(function () {
  "use strict";
  var V = window.V;
  if (!V) return;
  var S = (window.SceneStyle = window.SceneStyle || {});
  var NS = "http://www.w3.org/2000/svg";
  var doc = document;
  var W = V.width, H = V.height, D = V.duration;
  var PI = Math.PI, TAU = PI * 2;
  var TALL = V.isPortrait, SQUARE = V.isSquare;
  var FONT = {
    serif: 'Georgia, "Times New Roman", Times, serif',
    times: '"Times New Roman", Times, Georgia, serif',
    type: '"Courier New", Courier, "Nimbus Mono PS", "Liberation Mono", monospace',
    hand: '"Snell Roundhand", "Segoe Script", "URW Chancery L", "Z003", Georgia, serif',
    cond: '"Times New Roman", Times, Georgia, serif'
  };
  var C = {
    desk: "#15110D", cream: "#EDE3D0", gold: "#C8963E", muted: "#8C7F6A",
    ink: "#1E1A16", blue: "#1F3460", red: "#A3261E", stamp: "#B0281F", sepia: "#5A3A1E", pencil: "#4A4640"
  };

  // ------------------------- small utils -------------------------
  function u(px) { return V.s(px); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, p) { return a + (b - a) * p; }
  function num(v, d) { var n = typeof v === "number" ? v : parseFloat(v); return isFinite(n) ? n : d; }
  function f1(n) { return Math.round(n * 10) / 10; }
  function f2(n) { return Math.round(n * 100) / 100; }
  function f3(n) { return Math.round(n * 1000) / 1000; }
  function str(v) { return typeof v === "string" ? v.trim() : v == null ? "" : typeof v === "number" ? String(v) : ""; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function hash2(a, b) { var x = Math.sin(a * 127.1 + b * 311.7 + 74.7) * 43758.5453; return x - Math.floor(x); }
  function smooth(p) { p = clamp(p, 0, 1); return p * p * (3 - 2 * p); }
  function outC(p) { p = clamp(p, 0, 1); return 1 - Math.pow(1 - p, 3); }
  function inOutS(p) { p = clamp(p, 0, 1); return -(Math.cos(PI * p) - 1) / 2; }
  function prog(t, a, d) { return d <= 0 ? (t >= a ? 1 : 0) : clamp((t - a) / d, 0, 1); }
  function getEase(e, d) {
    if (typeof e === "function") return e;
    if (typeof e === "string" && V.ease[e]) return V.ease[e];
    return V.ease[d || "inOutSine"];
  }
  function div(cls, parent, css) {
    var n = doc.createElement("div");
    if (cls) n.className = cls;
    if (css) n.style.cssText = css;
    if (parent) parent.appendChild(n);
    return n;
  }
  function svgEl(tag, attrs, parent) {
    var n = doc.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function show(el, on) {
    var v = on ? "" : "none";
    if (el._disp !== v) { el.style.display = v; el._disp = v; }
  }
  function setS(el, k, v) {
    var c = el._c || (el._c = {});
    if (c[k] !== v) { el.style[k] = v; c[k] = v; }
  }
  function normWord(s) {
    return String(s == null ? "" : s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
  }
  // Replace dashes (en, em, minus) and curly quotes with ASCII.
  function ascii(s) {
    return str(s).replace(/[\u2012\u2013\u2014\u2015\u2212]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\u2026/g, "...");
  }
  function hexRgb(h) {
    h = String(h || "#000").replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16) || 0;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(h, a) { var c = hexRgb(h); return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + f3(a) + ")"; }
  function gray(v, a) { v = Math.round(clamp(v, 0, 255)); return a == null ? "rgb(" + v + "," + v + "," + v + ")" : "rgba(" + v + "," + v + "," + v + "," + f3(a) + ")"; }

  // ------------------------- word timing -------------------------
  var STOP = {};
  "a an the and or but of to in on at by for with from into onto over under is are was were be been being it its this that these those your you we our us my me i his her their they them he she as than then so not no yes do does did have has had will would can could should very just more most less each every all any some about here there what when who how why which also too up out if one".split(" ").forEach(function (w) { STOP[w] = 1; });
  function narrationEstimate(word, after) {
    var key = normWord(String(word).split(/\s+/)[0] || "");
    if (!key || !V.narration) return null;
    var toks = V.narration.split(/\s+/), total = toks.length;
    for (var pass = 0; pass < 2; pass++) {
      for (var i = 0; i < total; i++) {
        var est = 0.3 + (i / Math.max(1, total)) * (D - 1.2);
        if (pass === 0 && est < (after || 0) - 1e-6) continue;
        var w = normWord(toks[i]);
        if (w === key || (key.length >= 4 && w.length >= 4 && (w.indexOf(key) === 0 || key.indexOf(w) === 0))) return est;
      }
    }
    return null;
  }
  function kwFind(word, after) {
    word = str(word);
    if (!word) return null;
    var t = V.find(word, after || 0);
    if (t != null) return t;
    if (after) { t = V.find(word, 0); if (t != null && t >= (after || 0) - 1.5) return t; }
    return V.words.length ? null : narrationEstimate(word, after);
  }
  function contentWords(text) {
    return str(text).replace(/\*/g, "").split(/[^\p{L}\p{N}'.,]+/u).map(function (w) { return w.replace(/[.,']+$/, ""); }).filter(function (w) { var n = normWord(w); return n.length > 1 && !STOP[n]; });
  }
  var NUMW = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty".split(" ");
  function numberWords(w) {
    var s = String(w).replace(/[^0-9]/g, ""), n = parseInt(s, 10), out = [];
    if (!isFinite(n)) return out;
    if (n <= 20) out.push(NUMW[n]);
    if (n >= 1000000) out.push("million");
    else if (n >= 1000 && n % 1000 === 0) out.push("thousand");
    if (/^1[0-9]{3}$/.test(s) || /^20[0-9]{2}$/.test(s)) out.push(s);
    return out;
  }
  function labelTime(label, keyword, after) {
    if (keyword) { var t = kwFind(keyword, after); if (t != null) return t; }
    var ws = contentWords(label).sort(function (a, b) { return b.length - a.length; });
    var i, f;
    for (i = 0; i < ws.length; i++) { f = V.find(ws[i], after || 0); if (f != null) return f; }
    for (i = 0; i < ws.length; i++) {
      var nw = numberWords(ws[i]);
      for (var k = 0; k < nw.length; k++) { f = V.find(nw[k], after || 0); if (f != null) return f; }
    }
    if (!V.words.length) for (i = 0; i < ws.length; i++) { var e = narrationEstimate(ws[i], after); if (e != null) return e; }
    return null;
  }
  function endBy() { return Math.max(0.5, D - (D < 4 ? Math.min(0.8, D * 0.2) : 1.0)); }
  function tc(t, lo) { return clamp(t, lo != null ? lo : 0.2, endBy()); }
  // Fill missing times by spreading them between known neighbours.
  function spread(lands, a, b) {
    var n = lands.length, out = lands.slice(), i = 0;
    a = a == null ? Math.min(0.6, D * 0.1) : a;
    b = b == null ? D * 0.78 : b;
    while (i < n) {
      if (out[i] != null) { i++; continue; }
      var j = i;
      while (j < n && out[j] == null) j++;
      var cnt = j - i, left = i > 0 ? out[i - 1] : null, right = j < n ? out[j] : null, k;
      if (left == null && right == null) for (k = 0; k < cnt; k++) out[i + k] = cnt > 1 ? a + ((b - a) * k) / (cnt - 1) : a;
      else if (left == null) { var lo = Math.min(a, right * 0.5); for (k = 0; k < cnt; k++) out[i + k] = lo + ((right - lo) * k) / cnt; }
      else if (right == null) { var hi = Math.max(b, left + 0.6 * cnt); for (k = 0; k < cnt; k++) out[i + k] = left + ((hi - left) * (k + 1)) / cnt; }
      else for (k = 0; k < cnt; k++) out[i + k] = left + ((right - left) * (k + 1)) / (cnt + 1);
      i = j;
    }
    return out;
  }
  // Times for a list of {label, keyword}: in order, never decreasing, inside [lo, hi], at least gap apart.
  function beatTimes(list, o) {
    o = o || {};
    var lo = o.lo != null ? o.lo : 0.3, hi = o.hi != null ? o.hi : endBy() - 0.4;
    var prev = o.after || 0, out = [];
    list.forEach(function (it) {
      var t = labelTime(it.label, it.keyword, prev);
      if (t != null && t < prev - 0.05) t = null;
      out.push(t);
      if (t != null) prev = t + 0.05;
    });
    out = spread(out, Math.max(lo, o.first != null ? o.first : lo), Math.min(hi, D * 0.75));
    var gap = o.gap != null ? o.gap : 0.5;
    for (var i = 0; i < out.length; i++) {
      out[i] = clamp(out[i], lo, hi);
      if (i && out[i] < out[i - 1] + gap) out[i] = out[i - 1] + gap;
    }
    var n = out.length;
    if (n && out[n - 1] > hi) {
      var a = Math.min(out[0], hi - gap * (n - 1)), span = out[n - 1] - out[0], k = span > 0 ? (hi - a) / span : 1, a0 = out[0];
      a = Math.max(lo, a);
      for (i = 0; i < n; i++) out[i] = a + (out[i] - a0) * k;
    }
    return out;
  }
  // Start time of each word of `text` in order (null when not spoken).
  function wordTimes(text, after) {
    var toks = str(text).split(/\s+/).filter(Boolean), out = [], prev = after || 0;
    toks.forEach(function (tk) {
      var n = normWord(tk), t = null;
      // only content words anchor the timing; a stray "the" later in the narration must not
      if (n && !STOP[n] && n.length > 1 && V.words.length) {
        var i = V.wordIndex(tk, prev);
        if (i >= 0 && V.words[i].start < prev + 4) { t = V.words[i].start; prev = t + 0.01; }
      }
      out.push(t);
    });
    return out;
  }

  // ------------------------- layout areas -------------------------
  function safe() {
    var x0, y0, x1, y1;
    if (TALL) { x0 = W * 0.0556; x1 = W * 0.9444; y0 = H * 0.13; y1 = H * 0.755; }
    else if (SQUARE) { x0 = W * 0.07; x1 = W * 0.93; y0 = H * 0.07; y1 = H * 0.93; }
    else { x0 = W * 0.07; x1 = W * 0.93; y0 = H * 0.07; y1 = H * 0.93; }
    return { x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
  // Screen rect where the camera puts the thing it looks at (above the lower-third band when there is one).
  function contentRect(o) {
    o = o || {};
    var s = safe(), x0 = s.x0 + u(10), x1 = s.x1 - u(10), y0 = s.y0 + u(10), y1 = s.y1 - u(10);
    if (o.lower) y1 -= TALL ? u(230) : SQUARE ? u(170) : u(150);
    if (o.top) y0 += TALL ? u(70) : u(56);
    return { x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }

  // ------------------------- canvases and noise -------------------------
  var MAXC = 4096;
  function mkCanvas(w, h, cls) {
    var c = doc.createElement("canvas");
    c.width = Math.max(1, Math.min(MAXC, Math.round(w)));
    c.height = Math.max(1, Math.min(MAXC, Math.round(h)));
    if (cls) c.className = cls;
    return c;
  }
  // Pick a backing resolution so the canvas stays under the size cap.
  function resFor(w, h, want) {
    var r = num(want, 1.5);
    r = Math.min(r, (MAXC - 8) / Math.max(1, w), (MAXC - 8) / Math.max(1, h));
    return Math.max(0.4, r);
  }
  function rng(seed) { return V.makeRand((Math.floor(num(seed, 1)) >>> 0) || 1); }
  // Value noise grid with smooth bilinear sampling (used in pixel loops).
  function noiseGrid(R, n) {
    var g = new Float32Array(n * n);
    for (var i = 0; i < g.length; i++) g[i] = R();
    return function (x, y) {
      x = ((x % n) + n) % n; y = ((y % n) + n) % n;
      var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
      var x2 = (xi + 1) % n, y2 = (yi + 1) % n;
      xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf);
      var a = g[yi * n + xi], b = g[yi * n + x2], c = g[y2 * n + xi], d = g[y2 * n + x2];
      return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
    };
  }
  // Blobby mottling: tiny random canvases scaled up with smoothing (fast fbm look).
  function mottle(ctx, x, y, w, h, R, o) {
    o = o || {};
    var oct = o.octaves || [[0.06, 0.5], [0.15, 0.35], [0.4, 0.2]];
    var colr = hexRgb(o.color || "#3a2410"), lightC = hexRgb(o.light || "#ffffff");
    oct.forEach(function (oc) {
      var cw = Math.max(2, Math.round(w * oc[0] / 10)), ch = Math.max(2, Math.round(h * oc[0] / 10));
      var c = mkCanvas(cw, ch), cx = c.getContext("2d"), img = cx.createImageData(cw, ch), d = img.data;
      for (var i = 0; i < cw * ch; i++) {
        var v = R(), dark = v < 0.5, a = dark ? (0.5 - v) * 2 : (v - 0.5) * 2;
        var cc = dark ? colr : lightC;
        d[i * 4] = cc[0]; d[i * 4 + 1] = cc[1]; d[i * 4 + 2] = cc[2];
        d[i * 4 + 3] = Math.round(255 * Math.pow(a, o.pow || 1.6) * (dark ? 1 : (o.lightAmt != null ? o.lightAmt : 0.6)));
      }
      cx.putImageData(img, 0, 0);
      ctx.save();
      ctx.globalAlpha = (o.alpha != null ? o.alpha : 0.25) * oc[1] * 2;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(c, x - w * 0.02, y - h * 0.02, w * 1.04, h * 1.04);
      ctx.restore();
    });
  }
  // Grain tile (pattern source): per-pixel dark/light specks with alpha.
  var tileCache = {};
  function grainTile(seed, n, amt) {
    var key = seed + ":" + n + ":" + amt;
    if (tileCache[key]) return tileCache[key];
    var R = rng(seed), c = mkCanvas(n, n), cx = c.getContext("2d"), img = cx.createImageData(n, n), d = img.data;
    for (var i = 0; i < n * n; i++) {
      var v = (R() + R() + R()) / 3, dark = v < 0.5, a = Math.abs(v - 0.5) * 2;
      var g = dark ? 0 : 255;
      d[i * 4] = g; d[i * 4 + 1] = g; d[i * 4 + 2] = g; d[i * 4 + 3] = Math.round(255 * Math.min(1, a * amt));
    }
    cx.putImageData(img, 0, 0);
    tileCache[key] = c;
    return c;
  }
  function grainFill(ctx, x, y, w, h, seed, alpha, scale) {
    var tile = grainTile(seed || 7, 256, 1.6), pat = ctx.createPattern(tile, "repeat");
    ctx.save();
    ctx.globalAlpha = alpha;
    if (scale && scale !== 1 && pat.setTransform) pat.setTransform(new DOMMatrix([scale, 0, 0, scale, 0, 0]));
    ctx.fillStyle = pat;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
  function fibres(ctx, x, y, w, h, R, n, o) {
    o = o || {};
    ctx.save();
    ctx.lineCap = "round";
    for (var i = 0; i < n; i++) {
      var x0 = x + R() * w, y0 = y + R() * h, a = R() * TAU, L = (o.len || 10) * (0.4 + R()), b = (R() - 0.5) * L * 0.7;
      var light = R() < (o.light != null ? o.light : 0.5);
      ctx.strokeStyle = light ? "rgba(255,250,240," + f3((o.la || 0.18) * (0.5 + R())) + ")" : rgba(o.dark || "#4a3420", (o.da || 0.1) * (0.5 + R()));
      ctx.lineWidth = (o.lw || 0.6) * (0.5 + R());
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(x0 + Math.cos(a) * L / 2 - Math.sin(a) * b, y0 + Math.sin(a) * L / 2 + Math.cos(a) * b, x0 + Math.cos(a) * L, y0 + Math.sin(a) * L);
      ctx.stroke();
    }
    ctx.restore();
  }
  // Foxing: clusters of small brown age spots with soft halos.
  function foxing(ctx, x, y, w, h, R, n, o) {
    o = o || {};
    ctx.save();
    for (var i = 0; i < n; i++) {
      var edge = R() < 0.65, px, py;
      if (edge) {
        var side = Math.floor(R() * 4), d = Math.pow(R(), 2) * Math.min(w, h) * 0.18;
        px = side === 0 ? x + d : side === 1 ? x + w - d : x + R() * w;
        py = side === 2 ? y + d : side === 3 ? y + h - d : y + R() * h;
        if (side < 2) py = y + R() * h;
      } else { px = x + R() * w; py = y + R() * h; }
      var r = (o.size || 3) * (0.3 + R() * R() * 2.2);
      var g = ctx.createRadialGradient(px, py, 0, px, py, r * 2.2);
      g.addColorStop(0, rgba(o.color || "#6b3f1c", 0.35 * (0.4 + R())));
      g.addColorStop(0.45, rgba(o.color || "#6b3f1c", 0.12));
      g.addColorStop(1, rgba(o.color || "#6b3f1c", 0));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py, r * 2.2, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }
  // Coffee / water ring stain.
  function ringStain(ctx, cx, cy, r, R, o) {
    o = o || {};
    var colr = o.color || "#7a4a22";
    ctx.save();
    var g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
    g.addColorStop(0, rgba(colr, 0.03)); g.addColorStop(0.85, rgba(colr, 0.07)); g.addColorStop(1, rgba(colr, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    for (var k = 0; k < 3; k++) {
      ctx.strokeStyle = rgba(colr, (o.alpha || 0.22) * (0.5 + R() * 0.6));
      ctx.lineWidth = r * (0.015 + R() * 0.03);
      ctx.beginPath();
      var a0 = R() * TAU, span = TAU * (0.55 + R() * 0.45), rr = r * (0.9 + R() * 0.08);
      for (var i = 0; i <= 40; i++) {
        var a = a0 + span * i / 40, q = rr * (1 + Math.sin(a * 3 + k) * 0.015);
        var px = cx + Math.cos(a) * q, py = cy + Math.sin(a) * q * 0.97;
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  // A fold line: highlight + shadow pair with a soft shade on one side.
  function crease(ctx, x0, y0, x1, y1, R, o) {
    o = o || {};
    var dx = x1 - x0, dy = y1 - y0, L = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / L, ny = dx / L, k = o.k || 1;
    ctx.save();
    var g = ctx.createLinearGradient(x0 + (x1 - x0) / 2, y0 + (y1 - y0) / 2, x0 + (x1 - x0) / 2 + nx * 30 * k, y0 + (y1 - y0) / 2 + ny * 30 * k);
    g.addColorStop(0, "rgba(60,40,20,0.07)"); g.addColorStop(1, "rgba(60,40,20,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x1 + nx * 30 * k, y1 + ny * 30 * k); ctx.lineTo(x0 + nx * 30 * k, y0 + ny * 30 * k); ctx.closePath(); ctx.fill();
    function wob(off, colr, lw) {
      ctx.strokeStyle = colr; ctx.lineWidth = lw;
      ctx.beginPath();
      for (var i = 0; i <= 24; i++) {
        var p = i / 24, w0 = Math.sin(p * 9 + (o.ph || 0)) * 0.6 * k;
        var px = x0 + dx * p + nx * (off + w0), py = y0 + dy * p + ny * (off + w0);
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    wob(-0.8 * k, "rgba(255,250,235,0.35)", 1.1 * k);
    wob(0.6 * k, "rgba(70,45,20,0.22)", 0.9 * k);
    ctx.restore();
  }
  // Paper outline (array of points) with optional deckle / tear noise along each edge.
  function edgePts(w, h, R, o) {
    o = o || {};
    var amp = num(o.amp, 0), freq = num(o.freq, 0.08), pts = [], corner = num(o.corner, 0);
    var nz = noiseGrid(R, 64);
    function side(ax, ay, bx, by, sx, sy, k) {
      var L = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)), n = Math.max(2, Math.ceil(L / 6));
      for (var i = 0; i < n; i++) {
        var p = i / n, e = amp ? (nz(p * L * freq + k * 17, k * 9) - 0.5) * 2 * amp + (R() - 0.5) * amp * 0.5 : 0;
        if (corner && (p < 0.02 || p > 0.98)) e *= 0.3;
        pts.push([ax + (bx - ax) * p + sx * e, ay + (by - ay) * p + sy * e]);
      }
    }
    side(0, 0, w, 0, 0, 1, 1); side(w, 0, w, h, -1, 0, 2); side(w, h, 0, h, 0, -1, 3); side(0, h, 0, 0, 1, 0, 4);
    return pts;
  }
  function pathPts(ctx, pts) {
    ctx.beginPath();
    pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); });
    ctx.closePath();
  }
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }

  // ------------------------- paper -------------------------
  var PAPERS = {
    memo: { base: "#E9E1CC", dark: "#7a5a32", mot: 0.22, fib: 0.9, fox: 10, burn: 0.28, edge: 0.6 },
    letter: { base: "#EADDBF", dark: "#7a5022", mot: 0.3, fib: 1, fox: 16, burn: 0.42, edge: 1.0, laid: true },
    news: { base: "#DCD3BC", dark: "#6c5a3a", mot: 0.26, fib: 1.6, fox: 8, burn: 0.34, edge: 0.5 },
    parchment: { base: "#E2CFA4", dark: "#6e4a1e", mot: 0.45, fib: 1.2, fox: 22, burn: 0.6, edge: 1.4 },
    card: { base: "#F1ECDF", dark: "#7a6a50", mot: 0.14, fib: 0.6, fox: 5, burn: 0.16, edge: 0.3 },
    manila: { base: "#D9BF86", dark: "#6a4a1c", mot: 0.28, fib: 1.3, fox: 6, burn: 0.3, edge: 0.4 },
    ledger: { base: "#E6E0C6", dark: "#6a5a32", mot: 0.26, fib: 0.9, fox: 14, burn: 0.36, edge: 0.6 },
    print: { base: "#EFE7D4", dark: "#7a6440", mot: 0.16, fib: 0.5, fox: 6, burn: 0.22, edge: 0.4 },
    white: { base: "#F4F1EA", dark: "#7a7468", mot: 0.1, fib: 0.4, fox: 2, burn: 0.1, edge: 0.3 },
    kraft: { base: "#B58E5C", dark: "#4a2e12", mot: 0.3, fib: 2, fox: 0, burn: 0.3, edge: 0.6 },
    pink: { base: "#EFD6CF", dark: "#7a5040", mot: 0.16, fib: 0.6, fox: 4, burn: 0.16, edge: 0.3 },
    blue: { base: "#D3DDE4", dark: "#4a5a6a", mot: 0.16, fib: 0.6, fox: 4, burn: 0.16, edge: 0.3 },
    black: { base: "#1c1915", dark: "#000000", mot: 0.2, fib: 0.8, fox: 0, burn: 0.2, edge: 0.3 }
  };
  // Paint an aged sheet. Returns { canvas, ctx, res, pad, pts } with ctx set so 0,0 is the sheet's top-left
  // in world px (draw on it in world units). The contact shadow is baked into the padding.
  function paperCanvas(w, h, o) {
    o = o || {};
    var P = PAPERS[o.kind] || PAPERS.memo, R = rng(o.seed || 11);
    var pad = o.shadow === false ? 2 : Math.max(u(18), Math.min(w, h) * 0.05);
    var res = resFor(w + pad * 2, h + pad * 2, o.res || 1.5);
    var c = mkCanvas((w + pad * 2) * res, (h + pad * 2) * res, "ad-sheet"), ctx = c.getContext("2d");
    ctx.setTransform(res, 0, 0, res, pad * res, pad * res);
    var age = num(o.age, 1), amp = num(o.edgeAmp, P.edge * u(1.2)) * (o.edge === "straight" ? 0.15 : o.edge === "torn" ? 3 : o.edge === "deckle" ? 1.8 : 1);
    var pts = edgePts(w, h, R, { amp: amp, freq: o.edge === "deckle" ? 0.25 : 0.05, corner: 1 });
    if (o.shadow !== false) {
      ctx.save();
      ctx.filter = "blur(" + f1(pad * res * 0.32) + "px)";
      ctx.fillStyle = "rgba(0,0,0," + (o.shadowAlpha || 0.62) + ")";
      ctx.translate(pad * 0.18, pad * 0.32);
      pathPts(ctx, pts); ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.filter = "blur(" + f1(res * 1.4) + "px)";
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.translate(pad * 0.04, pad * 0.08);
      pathPts(ctx, pts); ctx.fill();
      ctx.restore();
    }
    ctx.save();
    pathPts(ctx, pts);
    ctx.clip();
    ctx.fillStyle = o.base || P.base;
    ctx.fillRect(-2, -2, w + 4, h + 4);
    if (P.laid) {
      ctx.strokeStyle = "rgba(120,90,50,0.05)"; ctx.lineWidth = 0.6;
      for (var ly = 0; ly < h; ly += u(3)) { ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(w, ly); ctx.stroke(); }
      ctx.strokeStyle = "rgba(120,90,50,0.06)"; ctx.lineWidth = 1.2;
      for (var lx = u(30); lx < w; lx += u(60)) { ctx.beginPath(); ctx.moveTo(lx, 0); ctx.lineTo(lx, h); ctx.stroke(); }
    }
    mottle(ctx, 0, 0, w, h, R, { alpha: P.mot * age, color: P.dark });
    fibres(ctx, 0, 0, w, h, R, Math.round(w * h / 1800 * P.fib), { len: u(9), lw: 0.55, la: 0.22, da: 0.09, dark: P.dark });
    grainFill(ctx, 0, 0, w, h, (o.seed || 11) % 97, 0.05 + 0.04 * age, 1 / res);
    if (age > 0.05) {
      // edge burn: darker, browner towards the edges, uneven
      ctx.save();
      ctx.filter = "blur(" + f1(Math.min(w, h) * 0.05 * res) + "px)";
      ctx.strokeStyle = rgba(P.dark, P.burn * age);
      ctx.lineWidth = Math.min(w, h) * 0.12;
      pathPts(ctx, pts); ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = rgba(P.dark, P.burn * age * 0.9);
      ctx.lineWidth = u(2.2);
      ctx.filter = "blur(" + f1(res * 1.2) + "px)";
      pathPts(ctx, pts); ctx.stroke();
      ctx.restore();
      foxing(ctx, 0, 0, w, h, R, Math.round(P.fox * age * (w * h) / 400000 + P.fox * age * 0.5), { size: u(3.2) });
      if (o.creases !== false && age > 0.3) {
        var nc = o.creases != null ? num(o.creases, 1) : (w * h > 300000 ? 1 + Math.floor(R() * 2) : R() < 0.5 ? 1 : 0);
        for (var k = 0; k < nc; k++) {
          if (R() < 0.6) { var yy = h * (0.3 + R() * 0.4); crease(ctx, -4, yy + (R() - 0.5) * 8, w + 4, yy + (R() - 0.5) * 8, R, { k: u(1), ph: R() * 9 }); }
          else { var xx = w * (0.3 + R() * 0.4); crease(ctx, xx, -4, xx + (R() - 0.5) * 8, h + 4, R, { k: u(1), ph: R() * 9 }); }
        }
      }
      if (o.stain || (o.stain !== false && R() < 0.25 * age)) {
        ringStain(ctx, w * (0.15 + R() * 0.7), h * (0.15 + R() * 0.7), Math.min(w, h) * (0.12 + R() * 0.1), R, { alpha: 0.18 });
      }
    }
    ctx.restore();
    return { canvas: c, ctx: ctx, res: res, pad: pad, pts: pts, w: w, h: h, R: R };
  }

  // ------------------------- text on canvas -------------------------
  var mctx = null;
  function fontStr(size, family, style, weight) { return (style || "normal") + " " + (weight || "normal") + " " + f1(size) + "px " + family; }
  function textW(txt, size, family, style, weight) {
    if (!mctx) mctx = doc.createElement("canvas").getContext("2d");
    mctx.font = fontStr(size, family, style, weight);
    return mctx.measureText(String(txt)).width;
  }
  function greedy(words, ws, gap, maxW) {
    var lines = [], cur = [], cw = 0;
    ws.forEach(function (w, i) {
      var nw = cur.length ? cw + gap + w : w;
      if (cur.length && nw > maxW) { lines.push(cur); cur = [i]; cw = w; } else { cur.push(i); cw = nw; }
    });
    if (cur.length) lines.push(cur);
    return lines;
  }
  // Wrap text to maxW (balanced: the narrowest width that keeps the line count). Returns array of strings.
  function wrapText(text, size, family, maxW, o) {
    o = o || {};
    var words = ascii(text).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    var ws = words.map(function (w) { return textW(w, size, family, o.style, o.weight) * (o.sx || 1); });
    var gap = textW(" ", size, family, o.style, o.weight) * (o.sx || 1);
    var g = greedy(words, ws, gap, maxW);
    if (o.balance !== false && g.length > 1) {
      var lo = Math.max.apply(null, ws), hi = maxW, best = g;
      for (var it = 0; it < 14 && hi - lo > 1; it++) {
        var mid = (lo + hi) / 2, t = greedy(words, ws, gap, mid);
        if (t.length <= g.length) { best = t; hi = mid; } else lo = mid;
      }
      g = best;
    }
    return g.map(function (l) { return l.map(function (i) { return words[i]; }).join(" "); });
  }
  // Shrink a font until text wraps into maxW x maxH (and maxLines). Returns { lines, size }.
  function fitText(text, size, family, maxW, maxH, o) {
    o = o || {};
    var lh = o.lh || 1.2, sz = size, lines = [];
    for (var it = 0; it < 40; it++) {
      lines = wrapText(text, sz, family, maxW, o);
      var widest = 0;
      lines.forEach(function (l) { widest = Math.max(widest, textW(l, sz, family, o.style, o.weight) * (o.sx || 1)); });
      var hh = sz * (1 + (lines.length - 1) * lh);
      if (widest <= maxW + 0.5 && hh <= maxH && (!o.maxLines || lines.length <= o.maxLines)) break;
      sz *= 0.94;
      if (sz < (o.min || 6)) break;
    }
    return { lines: lines, size: sz };
  }
  // Plain printed text: ink with a faint bleed. Returns width.
  function inkText(ctx, s, x, y, size, o) {
    o = o || {};
    ctx.save();
    ctx.font = fontStr(size, o.family || FONT.serif, o.style, o.weight);
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = o.align || "left";
    if (o.spacing) ctx.letterSpacing = f2(o.spacing) + "px";
    var colr = o.color || C.ink;
    if (o.sx && o.sx !== 1) { ctx.translate(x, y); ctx.scale(o.sx, 1); x = 0; y = 0; }
    if (o.bleed !== false) {
      ctx.globalAlpha = (o.alpha != null ? o.alpha : 0.92) * 0.25;
      ctx.fillStyle = colr;
      ctx.fillText(s, x + size * 0.012, y + size * 0.01);
    }
    ctx.globalAlpha = o.alpha != null ? o.alpha : 0.92;
    ctx.fillStyle = colr;
    ctx.fillText(s, x, y);
    var w = ctx.measureText(s).width;
    ctx.restore();
    return w * (o.sx || 1);
  }
  // Typewriter: every character struck on its own with jitter in position, angle and ink.
  function typeText(ctx, s, x, y, size, R, o) {
    o = o || {};
    var fam = FONT.type, adv = textW("M", size, fam, null, o.weight || "bold");
    ctx.save();
    ctx.font = fontStr(size, fam, null, o.weight || "bold");
    ctx.textBaseline = "alphabetic";
    var colr = o.color || C.ink, base = o.alpha != null ? o.alpha : 0.86;
    var rowDrift = (R() - 0.5) * size * 0.05;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === " ") continue;
      var jx = (R() - 0.5) * size * 0.05, jy = (R() - 0.5) * size * 0.06 + rowDrift, rot = (R() - 0.5) * 0.035;
      var a = base * (0.62 + R() * 0.38);
      var cx = x + i * adv + jx, cy = y + jy;
      ctx.save();
      ctx.translate(cx + adv / 2, cy);
      ctx.rotate(rot);
      ctx.fillStyle = colr;
      ctx.globalAlpha = a * 0.3;
      ctx.fillText(ch, -adv / 2 + size * 0.02, size * 0.015);
      ctx.globalAlpha = a;
      ctx.fillText(ch, -adv / 2, 0);
      if (R() < 0.06) { ctx.globalAlpha = a * 0.35; ctx.fillText(ch, -adv / 2 + size * 0.05, -size * 0.02); }
      ctx.restore();
    }
    ctx.restore();
    // ribbon wear: speckle erase over the run
    if (o.wear !== false && s.trim()) {
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      var n = Math.round(s.length * 2.2);
      for (var k = 0; k < n; k++) {
        ctx.fillStyle = "rgba(0,0,0," + f2(0.3 + R() * 0.5) + ")";
        ctx.beginPath(); ctx.arc(x + R() * s.length * adv, y - R() * size * 0.75, size * (0.02 + R() * 0.035), 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    return s.length * adv;
  }
  function typeAdv(size, weight) { return textW("M", size, FONT.type, null, weight || "bold"); }
  // Handwriting: a script stack drawn word by word with baseline drift, slant jitter and ink pressure.
  function handText(ctx, s, x, y, size, R, o) {
    o = o || {};
    var fam = o.family || FONT.hand, style = o.style || "italic", words = String(s).split(" "), gap = textW(" ", size, fam, style, o.weight) * 0.9;
    ctx.save();
    ctx.font = fontStr(size, fam, style, o.weight);
    ctx.textBaseline = "alphabetic";
    var xx = x, colr = o.color || "#23305a", drift = 0, pos = [];
    words.forEach(function (wd) {
      if (!wd) { xx += gap; return; }
      drift += (R() - 0.5) * size * 0.04;
      drift = clamp(drift, -size * 0.06, size * 0.06);
      var a = (o.alpha || 0.88) * (0.78 + R() * 0.22), ww = ctx.measureText(wd).width;
      ctx.save();
      ctx.translate(xx, y + drift);
      ctx.rotate((R() - 0.5) * 0.02);
      ctx.fillStyle = colr;
      ctx.globalAlpha = a * 0.35;
      ctx.fillText(wd, size * 0.015, size * 0.012);
      ctx.globalAlpha = a;
      ctx.fillText(wd, 0, 0);
      ctx.restore();
      pos.push([xx, ww]);
      xx += ww + gap;
    });
    ctx.restore();
    return { w: xx - x - gap, words: pos };
  }

  // ------------------------- desk surfaces -------------------------
  function paintWood(ctx, w, h, R) {
    ctx.fillStyle = "#22170F";
    ctx.fillRect(0, 0, w, h);
    var ph = u(230) * (0.9 + R() * 0.3), y = -R() * ph;
    while (y < h) {
      var tone = 26 + R() * 14, hh = ph * (0.8 + R() * 0.4);
      ctx.fillStyle = "rgb(" + Math.round(tone + 10) + "," + Math.round(tone * 0.68) + "," + Math.round(tone * 0.42) + ")";
      ctx.fillRect(0, y, w, hh);
      // grain lines along the plank
      var nl = Math.round(hh / u(5));
      for (var i = 0; i < nl; i++) {
        var yy = y + (i + R()) * hh / nl, amp = u(3 + R() * 8), fr = 0.0015 + R() * 0.003, ph0 = R() * 9, dark = R() < 0.6;
        ctx.strokeStyle = dark ? "rgba(8,4,2," + f3(0.12 + R() * 0.28) + ")" : "rgba(120,80,45," + f3(0.05 + R() * 0.12) + ")";
        ctx.lineWidth = u(0.6 + R() * 2.2);
        ctx.beginPath();
        for (var x = -20; x <= w + 20; x += 24) {
          var py = yy + Math.sin(x * fr + ph0) * amp + Math.sin(x * fr * 3.1 + ph0 * 2) * amp * 0.3;
          if (x === -20) ctx.moveTo(x, py); else ctx.lineTo(x, py);
        }
        ctx.stroke();
      }
      if (R() < 0.5) {
        var kx = R() * w, ky = y + hh * (0.3 + R() * 0.4), kr = u(14 + R() * 18);
        for (var r = 1; r <= 5; r++) {
          ctx.strokeStyle = "rgba(10,5,2," + f3(0.25 - r * 0.03) + ")";
          ctx.lineWidth = u(1.2);
          ctx.beginPath(); ctx.ellipse(kx, ky, kr * r * 0.5 * 2.2, kr * r * 0.5 * 0.7, 0, 0, TAU); ctx.stroke();
        }
      }
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(0, y + hh - u(2.5), w, u(2.5));
      ctx.fillStyle = "rgba(150,100,60,0.06)";
      ctx.fillRect(0, y + hh, w, u(1.5));
      y += hh;
    }
    mottle(ctx, 0, 0, w, h, R, { alpha: 0.35, color: "#000000", light: "#8a5a30", lightAmt: 0.4, octaves: [[0.04, 0.5], [0.12, 0.4]] });
    ctx.save();
    for (var s = 0; s < 70; s++) {
      ctx.strokeStyle = "rgba(170,120,80," + f3(0.03 + R() * 0.06) + ")";
      ctx.lineWidth = u(0.5 + R());
      var sx = R() * w, sy = R() * h, a = (R() - 0.5) * 0.8, L = u(30 + R() * 160);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a) * L, sy + Math.sin(a) * L); ctx.stroke();
    }
    ctx.restore();
  }
  function paintSpeckle(ctx, w, h, R, base, cols, n, rmax) {
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    mottle(ctx, 0, 0, w, h, R, { alpha: 0.4, color: "#1a0e04", octaves: [[0.05, 0.5], [0.2, 0.4]] });
    for (var i = 0; i < n; i++) {
      ctx.fillStyle = cols[Math.floor(R() * cols.length)];
      var r = u(0.6 + R() * rmax), x = R() * w, y = R() * h;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * (0.6 + R() * 0.5), R() * PI, 0, TAU); ctx.fill();
    }
  }
  function paintSurface(kind, w, h, seed) {
    var res = resFor(w, h, kind === "cork" ? 1 : 0.8), c = mkCanvas(w * res, h * res, "ad-desk"), ctx = c.getContext("2d"), R = rng(seed || 5);
    ctx.setTransform(res, 0, 0, res, 0, 0);
    if (kind === "felt") {
      ctx.fillStyle = "#1E3328"; ctx.fillRect(0, 0, w, h);
      mottle(ctx, 0, 0, w, h, R, { alpha: 0.45, color: "#04100a", light: "#4a7a5a", lightAmt: 0.3 });
      fibres(ctx, 0, 0, w, h, R, Math.round(w * h / 900), { len: u(4), lw: 0.7, la: 0.06, da: 0.2, dark: "#020805" });
      grainFill(ctx, 0, 0, w, h, 31, 0.12, 1 / res);
    } else if (kind === "cork") {
      paintSpeckle(ctx, w, h, R, "#9C6E40", ["rgba(70,40,15,0.55)", "rgba(190,140,90,0.5)", "rgba(110,70,35,0.6)", "rgba(50,28,10,0.5)", "rgba(220,170,110,0.35)"], Math.round(w * h / 60), 2.6);
      grainFill(ctx, 0, 0, w, h, 33, 0.14, 1 / res);
    } else if (kind === "leather") {
      ctx.fillStyle = "#3A2416"; ctx.fillRect(0, 0, w, h);
      mottle(ctx, 0, 0, w, h, R, { alpha: 0.55, color: "#0c0603", light: "#7a4e30", lightAmt: 0.45, octaves: [[0.08, 0.5], [0.3, 0.4], [0.9, 0.3]] });
      grainFill(ctx, 0, 0, w, h, 35, 0.16, 1 / res);
    } else if (kind === "lightbox") {
      ctx.fillStyle = "#1a1714"; ctx.fillRect(0, 0, w, h);
      mottle(ctx, 0, 0, w, h, R, { alpha: 0.3, color: "#000000" });
    } else if (kind === "black") {
      ctx.fillStyle = "#0C0A08"; ctx.fillRect(0, 0, w, h);
      mottle(ctx, 0, 0, w, h, R, { alpha: 0.3, color: "#000000", light: "#2a2218", lightAmt: 0.5 });
    } else paintWood(ctx, w, h, R);
    return { canvas: c, res: res };
  }

  // ------------------------- world state -------------------------
  var st = null;
  function newState() {
    return {
      items: [], updaters: [], over: [], cam: { segs: [], init: null, shakes: [], drift: 1 }, fades: [], dirty: true,
      worldW: W, worldH: H, film: { grain: 1, flicker: 1, dust: 1, scratches: 1 }, boxes: [], ends: [], seedN: 1
    };
  }
  function ensure() { if (!st) desk(V.root(), {}); return st; }
  function nextSeed() { var s = ensure(); return 1000 + (s.seedN++) * 7919; }

  function desk(root, o) {
    o = obj(o);
    root = root || V.root();
    st = newState();
    var s = st;
    s.surface = str(o.surface) || "wood";
    s.worldW = Math.max(W * 0.5, num(o.width, W));
    s.worldH = Math.max(H * 0.5, num(o.height, H));
    var frameEl = div("ad-frame", root);
    frameEl.style.cssText = "position:absolute;left:0;top:0;width:" + W + "px;height:" + H + "px;overflow:hidden;background:#0A0806";
    s.frame = frameEl;
    var world = div("ad-world", frameEl);
    world.style.cssText = "position:absolute;left:0;top:0;width:" + f1(s.worldW) + "px;height:" + f1(s.worldH) + "px;transform-origin:0 0";
    s.world = world;
    // desk canvas with generous margins so no camera move shows its edge
    var mx = Math.max(s.worldW, s.worldH) * 0.55, my = mx;
    var dk = paintSurface(s.surface, s.worldW + mx * 2, s.worldH + my * 2, 5 + (V.seed || 1));
    dk.canvas.style.cssText = "position:absolute;left:" + f1(-mx) + "px;top:" + f1(-my) + "px;width:" + f1(s.worldW + mx * 2) + "px;height:" + f1(s.worldH + my * 2) + "px";
    world.appendChild(dk.canvas);
    s.deskMargin = mx;
    if (s.surface === "lightbox") {
      var lb = div("ad-lightpanel", world);
      lb.style.cssText = "position:absolute;left:" + f1(-mx * 0.2) + "px;top:" + f1(s.worldH * 0.04) + "px;width:" + f1(s.worldW + mx * 0.4) + "px;height:" + f1(s.worldH * 0.92) + "px;";
      var lc = paperCanvas(s.worldW + mx * 0.4, s.worldH * 0.92, { kind: "white", base: "#F2EBDA", age: 0.1, seed: 77, res: 0.6, creases: false, stain: false, edge: "straight", shadowAlpha: 0.8 });
      var lctx = lc.ctx, gw = s.worldW + mx * 0.4, gh = s.worldH * 0.92;
      var g = lctx.createRadialGradient(gw / 2, gh / 2, 0, gw / 2, gh / 2, Math.max(gw, gh) * 0.6);
      g.addColorStop(0, "rgba(255,250,235,0.6)"); g.addColorStop(1, "rgba(120,100,70,0.25)");
      lctx.fillStyle = g; lctx.fillRect(0, 0, gw, gh);
      placeCanvas(lb, lc, gw, gh);
    }
    s.layers = {};
    ["back", "mid", "front"].forEach(function (k) {
      s.layers[k] = div("ad-layer ad-" + k, world, "position:absolute;left:0;top:0;width:0;height:0");
    });
    s.wsvg = svgEl("svg", { width: f1(s.worldW), height: f1(s.worldH), viewBox: "0 0 " + f1(s.worldW) + " " + f1(s.worldH), overflow: "visible" }, world);
    s.wsvg.style.cssText = "position:absolute;left:0;top:0;overflow:visible;pointer-events:none";
    s.defs = svgEl("defs", null, s.wsvg);
    s.layers.top = div("ad-layer ad-top", world, "position:absolute;left:0;top:0;width:0;height:0");
    // world-space lamp light (warm centre, falloff to dark), above the items
    var lamp = obj(o.lamp);
    var lx = num(lamp.x, s.worldW * (TALL ? 0.42 : 0.4)), ly = num(lamp.y, s.worldH * (TALL ? 0.34 : 0.3)), lr = num(lamp.r, Math.max(s.worldW, s.worldH) * 0.95);
    s.lamp = { x: lx, y: ly, r: lr };
    var light = div("ad-lamp", world);
    var lmx = mx * 1.2;
    light.style.cssText = "position:absolute;pointer-events:none;left:" + f1(-lmx) + "px;top:" + f1(-lmx) + "px;width:" + f1(s.worldW + lmx * 2) + "px;height:" + f1(s.worldH + lmx * 2) + "px;" +
      "background:radial-gradient(circle " + f1(lr) + "px at " + f1(lx + lmx) + "px " + f1(ly + lmx) + "px, rgba(255,214,150,0.10) 0%, rgba(255,200,130,0.04) 28%, rgba(10,6,3,0.18) 55%, rgba(6,4,2," + (s.surface === "lightbox" ? 0.35 : 0.62) + ") 100%)";
    s.light = light;
    var vig = div("ad-vignette", frameEl);
    vig.style.cssText = "position:absolute;left:0;top:0;width:" + W + "px;height:" + H + "px;pointer-events:none;background:radial-gradient(ellipse " + f1(W * 0.78) + "px " + f1(H * 0.78) + "px at 50% 48%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.5) 100%)";
    var film = mkCanvas(W, H, "ad-film");
    film.style.cssText = "position:absolute;left:0;top:0;width:" + W + "px;height:" + H + "px;pointer-events:none";
    frameEl.appendChild(film);
    s.filmC = film; s.filmX = film.getContext("2d");
    s.film.grain = num(o.grain, 1); s.film.flicker = num(o.flicker, 1); s.film.dust = num(o.dust, 1); s.film.scratches = num(o.scratches, 1);
    s.cam.drift = clamp(num(o.drift, 1), 0, 2);
    var fade = div("ad-fade", frameEl);
    fade.style.cssText = "position:absolute;left:0;top:0;width:" + W + "px;height:" + H + "px;background:#000;pointer-events:none;opacity:0";
    s.fadeEl = fade;
    s.overEl = div("ad-over", frameEl, "position:absolute;left:0;top:0;width:" + W + "px;height:" + H + "px;pointer-events:none");
    if (o.letterbox) {
      var lbh = typeof o.letterbox === "number" ? o.letterbox : H * (TALL ? 0.06 : 0.09);
      div("ad-lbox", frameEl, "position:absolute;left:0;top:0;width:" + W + "px;height:" + f1(lbh) + "px;background:#000");
      div("ad-lbox", frameEl, "position:absolute;left:0;top:" + f1(H - lbh) + "px;width:" + W + "px;height:" + f1(lbh) + "px;background:#000");
    }
    var c0 = obj(o.camera);
    s.cam.init = { x: num(c0.x, s.worldW / 2), y: num(c0.y, s.worldH / 2), zoom: num(c0.zoom, Math.min(W / s.worldW, H / s.worldH)), rot: num(c0.rot, 0) };
    var mine = s;
    V.onFrame(function (t) { if (st === mine) frame(t); });
    return { el: frameEl, world: world, W: s.worldW, H: s.worldH, lamp: s.lamp };
  }
  function placeCanvas(parent, pc, w, h) {
    var c = pc.canvas;
    c.style.cssText = "position:absolute;left:" + f2(-pc.pad) + "px;top:" + f2(-pc.pad) + "px;width:" + f2(w + pc.pad * 2) + "px;height:" + f2(h + pc.pad * 2) + "px";
    parent.appendChild(c);
    return c;
  }

  // ------------------------- camera -------------------------
  function camEvalSeg(seg, t) {
    if (seg.kind === "track") {
      var tgt = null;
      try { tgt = seg.fn(t); } catch (e) { V.error("[camera.track] " + (e && e.message ? e.message : e)); }
      tgt = tgt || seg.from;
      var m = seg.blend > 0 ? inOutS(prog(t, seg.at, seg.blend)) : 1;
      return camLerp(seg.from, { x: num(tgt.x, seg.from.x), y: num(tgt.y, seg.from.y), zoom: num(tgt.zoom, seg.from.zoom), rot: num(tgt.rot, seg.from.rot) }, m);
    }
    if (t >= seg.at + seg.dur) return seg.to;
    return camLerp(seg.from, seg.to, seg.ease(prog(t, seg.at, seg.dur)));
  }
  function camLerp(a, b, p) {
    var za = Math.log(Math.max(1e-3, a.zoom)), zb = Math.log(Math.max(1e-3, b.zoom));
    return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), zoom: Math.exp(lerp(za, zb, p)), rot: lerp(a.rot, b.rot, p) };
  }
  function camCompile() {
    var c = st.cam, segs = c.segs;
    segs.sort(function (a, b) { return a.at - b.at || a.id - b.id; });
    for (var i = 0; i < segs.length; i++) {
      var prev = c.init;
      for (var j = i - 1; j >= 0; j--) if (segs[j].at <= segs[i].at + 1e-9) { prev = camEvalSeg(segs[j], segs[i].at); break; }
      segs[i].from = prev;
      if (segs[i].toFn) segs[i].to = segs[i].toFn(prev);
    }
    // a track cannot see a later move's start state, so moves after a track resolve now
  }
  function camBase(t) {
    var segs = st.cam.segs;
    for (var i = segs.length - 1; i >= 0; i--) if (segs[i].at <= t + 1e-9) return camEvalSeg(segs[i], t);
    return st.cam.init;
  }
  function camAt(t) {
    var c = camBase(t), s = st, d = s.cam.drift;
    var ox = 0, oy = 0, rot = c.rot;
    if (d > 0) {
      ox += d * u(4) * (Math.sin(t * 0.41 + 1.3) + 0.5 * Math.sin(t * 0.97 + 0.2));
      oy += d * u(3) * (Math.sin(t * 0.33 + 2.1) + 0.5 * Math.sin(t * 0.79 + 1.7));
      rot += d * 0.06 * Math.sin(t * 0.27 + 0.4);
      var k = Math.floor(t * 24 + 1e-6);
      ox += d * 0.35 * (hash2(k, 1.1) - 0.5);
      oy += d * 0.55 * (hash2(k, 2.3) - 0.5);
    }
    s.cam.shakes.forEach(function (sh) {
      if (t < sh.at || t > sh.at + sh.dur) return;
      var p = (t - sh.at) / sh.dur, dec = Math.pow(1 - p, 2), k2 = Math.floor(t * 30 + 1e-6);
      ox += sh.amp * dec * (hash2(k2, 7.7) - 0.5) * 2;
      oy += sh.amp * dec * (hash2(k2, 9.1) - 0.5) * 2;
    });
    return { x: c.x, y: c.y, zoom: c.zoom, rot: rot, ox: ox, oy: oy };
  }
  function toScreen(cam, px, py) {
    var a = -cam.rot * PI / 180, ca = Math.cos(a), sa = Math.sin(a), dx = (px - cam.x) * cam.zoom, dy = (py - cam.y) * cam.zoom;
    return [W / 2 + cam.ox + dx * ca - dy * sa, H / 2 + cam.oy + dx * sa + dy * ca];
  }
  // Camera centre that puts world point (wx, wy) at screen point (sx, sy).
  function camFor(wx, wy, sx, sy, zoom, rot) {
    var a = rot * PI / 180, ca = Math.cos(a), sa = Math.sin(a), dx = (sx - W / 2) / zoom, dy = (sy - H / 2) / zoom;
    return { x: wx - (dx * ca - dy * sa), y: wy - (dx * sa + dy * ca), zoom: zoom, rot: rot };
  }
  var segId = 1;
  function addMove(at, dur, to, ease) {
    var s = ensure();
    at = Math.max(0, num(at, 0));
    dur = Math.max(0.01, num(dur, 1.6));
    if (at + dur > D + 0.05) dur = Math.max(0.01, D - at);
    var seg = { id: segId++, kind: "move", at: at, dur: dur, ease: getEase(ease, "inOutSine") };
    if (typeof to === "function") seg.toFn = to; else seg.to = to;
    s.cam.segs.push(seg);
    s.dirty = true;
    return seg;
  }
  // Normalise an item or a rect into { cx, cy, w, h, rot, point(fx, fy) }.
  function boxOf(it) {
    if (!it) return null;
    if (it.rect && typeof it.rect === "object" && it.rect.w != null && !it.point) it = it.rect;
    if (it.point && it.w != null) return { cx: it.x + it.w / 2, cy: it.y + it.h / 2, w: it.w, h: it.h, rot: it.rot || 0, point: it.point };
    var x = num(it.x, 0), y = num(it.y, 0), w = num(it.w, W), h = num(it.h, H), rot = num(it.rot, 0), cx = x + w / 2, cy = y + h / 2;
    return { cx: cx, cy: cy, w: w, h: h, rot: rot, point: function (fx, fy) { return rotPt(cx, cy, (fx - 0.5) * w, (fy - 0.5) * h, rot); } };
  }
  function rotPt(cx, cy, lx, ly, rot) {
    var a = rot * PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    return [cx + lx * ca - ly * sa, cy + lx * sa + ly * ca];
  }
  function focusState(itemOrRect, o) {
    o = o || {};
    var b = boxOf(itemOrRect);
    if (!b) return null;
    var T = o.target || contentRect({ lower: o.lower });
    var straight = o.straighten !== false && Math.abs(b.rot) < 12;
    var rot = straight ? b.rot : 0, bw = b.w, bh = b.h;
    if (!straight) { var a = b.rot * PI / 180; bw = Math.abs(b.w * Math.cos(a)) + Math.abs(b.h * Math.sin(a)); bh = Math.abs(b.w * Math.sin(a)) + Math.abs(b.h * Math.cos(a)); }
    var fill = num(o.fill, 0.86);
    var z = o.cover ? Math.max(T.w / bw, T.h / bh) : Math.min(T.w / bw, T.h / bh);
    z = z * fill * num(o.zoom, 1);
    var an = arr(o.anchor), p = b.point(num(an[0], 0.5), num(an[1], 0.5));
    return camFor(p[0], p[1], T.cx, T.cy, z, rot);
  }
  // pan-and-zoom state for a rect: zoom 1 covers the whole frame; the view is clamped inside the rect.
  function kbState(b, st0) {
    if (!b.point || b.cx == null) b = boxOf(b);
    var fx = num(st0.fx, 0.5), fy = num(st0.fy, 0.5), zm = Math.max(0.2, num(st0.zoom, 1));
    var cover = Math.max(W / b.w, H / b.h), z = cover * zm;
    var hw = W / 2 / z / b.w, hh = H / 2 / z / b.h;
    fx = hw >= 0.5 ? 0.5 : clamp(fx, hw, 1 - hw);
    fy = hh >= 0.5 ? 0.5 : clamp(fy, hh, 1 - hh);
    var p = b.point(fx, fy);
    return { x: p[0], y: p[1], zoom: z, rot: Math.abs(b.rot) < 12 ? b.rot : 0 };
  }
  var camera = {
    focus: function (it, at, dur, o) {
      o = obj(o);
      var stt = focusState(it, o);
      if (!stt) return null;
      return addMove(at, dur == null ? 1.6 : dur, stt, o.ease);
    },
    panZoom: function (it, at, dur, o) {
      o = obj(o);
      var b = boxOf(it);
      if (!b) return null;
      var a = kbState(b, obj(o.from).zoom != null || obj(o.from).fx != null ? obj(o.from) : { fx: 0.5, fy: 0.5, zoom: 1 });
      var z = kbState(b, obj(o.to).zoom != null || obj(o.to).fx != null ? obj(o.to) : { fx: 0.5, fy: 0.45, zoom: 1.2 });
      if (o.cut !== false) addMove(at, 0.01, a, "linear");
      return addMove(o.cut !== false ? num(at, 0) + 0.01 : at, dur == null ? Math.max(1, D - num(at, 0)) : dur, z, o.ease || "inOutSine");
    },
    to: function (x, y, zoom, at, dur, o) {
      o = obj(o);
      return addMove(at, dur == null ? 1.6 : dur, function (prev) { return { x: num(x, prev.x), y: num(y, prev.y), zoom: num(zoom, prev.zoom), rot: num(o.rot, prev.rot) }; }, o.ease);
    },
    wide: function (at, dur, o) {
      o = obj(o);
      var s = ensure(), T = o.target || { x0: 0, y0: 0, w: W, h: H, cx: W / 2, cy: H / 2 };
      var b = o.rect || { x: 0, y: 0, w: s.worldW, h: s.worldH };
      var stt = focusState(b, { fill: num(o.fill, 0.96), target: o.target || (o.safe ? contentRect({ lower: o.lower }) : T) });
      return addMove(at, dur == null ? 1.8 : dur, stt, o.ease);
    },
    track: function (fn, at, blend) {
      var s = ensure();
      if (typeof fn !== "function") return null;
      var seg = { id: segId++, kind: "track", at: Math.max(0, num(at, 0)), dur: 0, blend: Math.max(0, num(blend, 0.8)), fn: fn };
      s.cam.segs.push(seg);
      s.dirty = true;
      return seg;
    },
    shake: function (at, amp, dur) {
      var s = ensure();
      s.cam.shakes.push({ at: Math.max(0, num(at, 0)), amp: num(amp, u(7)), dur: Math.max(0.05, num(dur, 0.35)) });
    },
    drift: function (k) { ensure().cam.drift = clamp(num(k, 1), 0, 2); },
    set: function (x, y, zoom, rot) { var s = ensure(); s.cam.init = { x: num(x, s.worldW / 2), y: num(y, s.worldH / 2), zoom: num(zoom, 1), rot: num(rot, 0) }; s.dirty = true; },
    at: function (t) { ensure(); if (st.dirty) compile(); return camAt(num(t, 0)); },
    state: focusState,
    toScreen: function (x, y, t) { ensure(); if (st.dirty) compile(); return toScreen(camAt(num(t, V.time())), x, y); }
  };

  // ------------------------- items -------------------------
  // An item is a holder div (placement transform, set each frame) around an inner div `el` (free for
  // custom code). Canvases of the material live inside `el`.
  function makeItem(o) {
    var s = ensure();
    o = o || {};
    var w = Math.max(4, num(o.w, W * 0.3)), h = Math.max(4, num(o.h, w * 0.75));
    var x = o.cx != null ? num(o.cx, 0) - w / 2 : num(o.x, (s.worldW - w) / 2);
    var y = o.cy != null ? num(o.cy, 0) - h / 2 : num(o.y, (s.worldH - h) / 2);
    var rot = num(o.rot, 0);
    var layer = o.layer && o.layer.nodeType ? o.layer : s.layers[o.layer || "mid"] || s.layers.mid;
    var holder = div("ad-item" + (o.cls ? " " + o.cls : ""), layer);
    holder.style.cssText = "position:absolute;left:" + f2(x) + "px;top:" + f2(y) + "px;width:" + f2(w) + "px;height:" + f2(h) + "px;transform-origin:50% 50%;transform:rotate(" + f2(rot) + "deg)";
    if (o.z != null) holder.style.zIndex = String(o.z);
    var inner = div("ad-inner", holder, "position:absolute;left:0;top:0;width:" + f2(w) + "px;height:" + f2(h) + "px");
    var it = {
      el: inner, holder: holder, x: x, y: y, w: w, h: h, rot: rot, kind: o.kind || "item", label: o.label || "", acts: [], keys: [],
      rect: { x: x, y: y, w: w, h: h, rot: rot }
    };
    it.point = function (fx, fy) { return rotPt(x + w / 2, y + h / 2, (num(fx, 0.5) - 0.5) * w, (num(fy, 0.5) - 0.5) * h, rot); };
    it.local = function (lx, ly) { return rotPt(x + w / 2, y + h / 2, lx - w / 2, ly - h / 2, rot); };
    it.sub = function (lx, ly, lw, lh) {
      var c = it.local(lx + lw / 2, ly + lh / 2);
      return { x: c[0] - lw / 2, y: c[1] - lh / 2, w: lw, h: lh, rot: rot };
    };
    s.items.push(it);
    s.dirty = true;
    return it;
  }
  // Key boxes for S.inspect: local rect (item px) shown from `from` (and until `to`).
  function addKey(it, kind, label, lx, ly, lw, lh, from, to) {
    it.keys.push({ kind: kind, label: label, lx: lx, ly: ly, lw: lw, lh: lh, from: num(from, 0), to: to == null ? 1e9 : to });
  }
  var PLACE_DUR = { slide: 1.1, drop: 0.55, develop: 1.6, spin: 1.2, fade: 0.8, none: 0, rise: 0.9 };
  function place(it, at, style, o) {
    if (!it || !it.holder) return it;
    o = obj(o);
    style = PLACE_DUR[style] != null ? style : "slide";
    var a = { kind: "in", style: style, at: Math.max(0, num(at, 0)), dur: num(o.dur, PLACE_DUR[style]), from: str(o.from), rot: num(o.rot, 0) };
    if (a.at + a.dur > D + 0.02) { a.dur = Math.max(0.05, D - a.at); if (a.at > D - 0.05) V.error("[place] " + (it.label || it.kind) + " enters after the end of the scene"); }
    it.acts.push(a);
    ensure().dirty = true;
    return it;
  }
  function removeItem(it, at, o) {
    if (!it || !it.holder) return it;
    o = obj(o);
    it.acts.push({ kind: "out", at: Math.max(0, num(at, 0)), dur: num(o.dur, 0.7), from: str(o.to) });
    ensure().dirty = true;
    return it;
  }
  function slideVec(it, from) {
    var s = st, cx = it.x + it.w / 2, cy = it.y + it.h / 2, dist = Math.max(it.w, it.h) * 0.6 + Math.max(W, H) * 0.35;
    if (!from) {
      var dl = cx, dr = s.worldW - cx, dt = cy, db = s.worldH - cy, m = Math.min(dl, dr, dt * 1.2, db * 1.2);
      from = m === dl ? "left" : m === dr ? "right" : m === dt * 1.2 ? "top" : "bottom";
    }
    return from === "left" ? [-dist, dist * 0.08] : from === "right" ? [dist, -dist * 0.06] : from === "top" ? [dist * 0.06, -dist] : [-dist * 0.05, dist];
  }
  function poseOf(it, t) {
    var p = { dx: 0, dy: 0, r: 0, s: 1, o: 1, vis: true, moving: false, dev: 1 };
    var ins = it.acts.filter(function (a) { return a.kind === "in"; });
    if (ins.length) {
      var a = ins[0];
      if (t < a.at) { p.vis = false; return p; }
      var q = a.dur > 0 ? prog(t, a.at, a.dur) : 1, e;
      p.moving = q < 1;
      if (a.style === "slide") {
        e = 1 - Math.pow(1 - q, 3.2);
        var v = a.vec || (a.vec = slideVec(it, a.from));
        p.dx = v[0] * (1 - e); p.dy = v[1] * (1 - e); p.r = (a.rot || (v[0] > 0 ? 6 : -6)) * (1 - e);
      } else if (a.style === "drop") {
        e = outC(q);
        p.s = 1 + 0.07 * (1 - e); p.o = clamp(q * 2.2, 0, 1); p.dy = -u(14) * (1 - e); p.r = 1.5 * (1 - e);
      } else if (a.style === "develop") {
        p.dev = smooth(q);
      } else if (a.style === "spin") {
        e = 1 - Math.pow(1 - q, 2.6);
        p.s = 0.06 + 0.94 * e; p.r = -720 * (1 - e) + (a.rot || 0); p.o = clamp(q * 5, 0, 1);
      } else if (a.style === "fade") {
        p.o = smooth(q);
      } else if (a.style === "rise") {
        e = outC(q); p.dy = u(40) * (1 - e); p.o = smooth(q);
      }
    }
    it.acts.forEach(function (b) {
      if (b.kind !== "out" || t < b.at) return;
      var q2 = prog(t, b.at, b.dur), e2 = V.ease.inCubic(q2);
      if (q2 >= 1) { p.vis = false; return; }
      p.moving = true;
      var v2 = b.vec || (b.vec = slideVec(it, b.from));
      p.dx += v2[0] * e2 * 0.8; p.dy += v2[1] * e2 * 0.8; p.o *= 1 - smooth(q2 * 1.4 - 0.4);
    });
    return p;
  }
  function applyItem(it, t) {
    var p = poseOf(it, t);
    it._pose = p;
    show(it.holder, p.vis);
    if (!p.vis) return;
    var tr = (p.dx || p.dy ? "translate(" + f2(p.dx) + "px," + f2(p.dy) + "px) " : "") + "rotate(" + f3(it.rot + p.r) + "deg)" + (p.s !== 1 ? " scale(" + f3(p.s) + ")" : "");
    setS(it.holder, "transform", tr);
    setS(it.holder, "opacity", p.o >= 0.999 ? "1" : String(f3(p.o)));
    if (it.onDev) it.onDev(p.dev, t);
  }

  // ------------------------- film layer -------------------------
  function drawFilm(t) {
    var s = st, ctx = s.filmX, f = s.film;
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var k = Math.floor(t * 24 + 1e-6);
    if (f.grain > 0) {
      var tile = grainTile(91 + (k % 5), 256, 1.4), pat = ctx.createPattern(tile, "repeat");
      var ox = Math.floor(hash2(k, 3.3) * 256), oy = Math.floor(hash2(k, 5.9) * 256);
      if (pat.setTransform) pat.setTransform(new DOMMatrix([1, 0, 0, 1, ox, oy]));
      ctx.globalAlpha = 0.13 * f.grain;
      ctx.fillStyle = pat;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (f.flicker > 0) {
      var fl = (0.035 * hash2(k, 1.7) + 0.02 * (0.5 + 0.5 * Math.sin(t * 7.3))) * f.flicker;
      ctx.fillStyle = "rgba(0,0,0," + f3(fl) + ")";
      ctx.fillRect(0, 0, W, H);
    }
    if (f.dust > 0) {
      // specks and hairs that live for one frame
      var n = Math.floor(hash2(k, 8.1) * 3.2 * f.dust);
      for (var i = 0; i < n; i++) {
        var x = hash2(k, 10 + i) * W, y = hash2(k, 20 + i) * H, r = u(1 + hash2(k, 30 + i) * 2.5), light = hash2(k, 40 + i) < 0.35;
        ctx.fillStyle = light ? "rgba(255,245,225,0.55)" : "rgba(10,8,6,0.6)";
        if (hash2(k, 50 + i) < 0.25) {
          ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = u(1.1);
          ctx.beginPath(); ctx.moveTo(x, y);
          ctx.bezierCurveTo(x + u(20), y - u(14), x + u(10), y + u(26), x + u(34), y + u(18)); ctx.stroke();
        } else { ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.7, hash2(k, 60 + i) * PI, 0, TAU); ctx.fill(); }
      }
      // dust motes drifting in the lamp light
      for (var m = 0; m < 16; m++) {
        var sp = 0.012 + hash2(m, 1) * 0.02, mx = (hash2(m, 2) + t * sp * (hash2(m, 3) < 0.5 ? 1 : -1) + Math.sin(t * 0.5 + m) * 0.01) % 1;
        if (mx < 0) mx += 1;
        var my = (hash2(m, 4) - t * sp * 0.6 + 2) % 1, mr = u(1.5 + hash2(m, 5) * 3.5), ma = 0.05 + 0.08 * (0.5 + 0.5 * Math.sin(t * 1.3 + m * 2));
        var gx = mx * W, gy = my * H, g = ctx.createRadialGradient(gx, gy, 0, gx, gy, mr * 2);
        g.addColorStop(0, "rgba(255,236,200," + f3(ma * f.dust) + ")"); g.addColorStop(1, "rgba(255,236,200,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(gx, gy, mr * 2, 0, TAU); ctx.fill();
      }
    }
    if (f.scratches > 0) {
      var blk = Math.floor(k / 9);
      for (var j = 0; j < 2; j++) {
        if (hash2(blk, 70 + j) > 0.32 * f.scratches) continue;
        var sx = (hash2(blk, 80 + j) * 0.9 + 0.05) * W + (k % 9) * u(0.6) * (j ? -1 : 1), a = 0.08 + hash2(k, 90 + j) * 0.1;
        ctx.strokeStyle = hash2(blk, 95 + j) < 0.5 ? "rgba(255,248,230," + f3(a) + ")" : "rgba(0,0,0," + f3(a * 1.2) + ")";
        ctx.lineWidth = u(0.8 + hash2(blk, 99 + j));
        var y0 = hash2(blk, 101 + j) * H * 0.4, y1 = H - hash2(blk, 103 + j) * H * 0.3;
        ctx.beginPath(); ctx.moveTo(sx, y0); ctx.lineTo(sx + u(3) * (hash2(blk, 105) - 0.5), y1); ctx.stroke();
      }
    }
  }

  // ------------------------- frame -------------------------
  var updId = 1;
  function onUpd(fn, order) { var s = ensure(); s.updaters.push({ fn: fn, order: order || 0, id: updId++ }); s.updaters.sort(function (a, b) { return a.order - b.order || a.id - b.id; }); }
  function compile() {
    camCompile();
    st.dirty = false;
  }
  function frame(t) {
    var s = st;
    if (s.dirty) compile();
    var cam = camAt(t);
    s._cam = cam;
    var tr = "translate(" + f2(W / 2 + cam.ox) + "px," + f2(H / 2 + cam.oy) + "px) rotate(" + f3(-cam.rot) + "deg) scale(" + f3(cam.zoom) + ") translate(" + f2(-cam.x) + "px," + f2(-cam.y) + "px)";
    setS(s.world, "transform", tr);
    for (var i = 0; i < s.items.length; i++) applyItem(s.items[i], t);
    for (i = 0; i < s.updaters.length; i++) { try { s.updaters[i].fn(t); } catch (e) { V.error("[update] " + (e && e.message ? e.message : e)); } }
    var lf = 1 - 0.05 * s.film.flicker * (0.5 + 0.5 * Math.sin(t * 5.1 + 0.7)) * hash2(Math.floor(t * 12 + 1e-6), 4.4);
    setS(s.light, "opacity", String(f3(lf)));
    var fo = fadeLevel(t);
    setS(s.fadeEl, "opacity", String(f3(fo)));
    drawFilm(t);
  }

  // ------------------------- procedural photographs -------------------------
  // Each subject paints a grey picture (value = brightness) into ctx (w x h px) and returns its point of
  // interest { fx, fy }. Tone mapping, grain and damage come afterwards. Figures are generic and simple.
  var SUBJECTS = ["portrait", "portrait-woman", "group", "crowd", "city", "street", "building", "ship", "train", "factory", "landscape", "aircraft", "bridge"];
  var SUBJ_ALIAS = { man: "portrait", person: "portrait", woman: "portrait-woman", lady: "portrait-woman", people: "group", family: "group", team: "group", rally: "crowd", protest: "crowd", skyline: "city", town: "street", capitol: "building", liner: "ship", boat: "ship", locomotive: "train", railway: "train", mill: "factory", farm: "landscape", field: "landscape", plane: "aircraft", airplane: "aircraft" };
  function subjectId(s) { s = normWord(s); if (SUBJECTS.indexOf(s) >= 0) return s; if (s === "portraitwoman") return "portrait-woman"; return SUBJ_ALIAS[s] || null; }
  function fillG(ctx, v, a) { ctx.fillStyle = gray(v, a); }
  function vgrad(ctx, x, y0, y1, stops) {
    var g = ctx.createLinearGradient(x, y0, x, y1);
    stops.forEach(function (s) { g.addColorStop(s[0], gray(s[1], s[2])); });
    return g;
  }
  function blurOn(ctx, px) { ctx.filter = px > 0.05 ? "blur(" + f2(px) + "px)" : "none"; }
  function ell(ctx, x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU); }
  function poly(ctx, pts) { ctx.beginPath(); pts.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); }
  function skyFill(ctx, w, h, top, bot, horizon) {
    ctx.fillStyle = vgrad(ctx, 0, 0, h * (horizon || 1), [[0, top], [1, bot]]);
    ctx.fillRect(0, 0, w, h);
  }
  function clouds(ctx, w, h, R, n, y0, y1, v, k) {
    ctx.save();
    for (var i = 0; i < n; i++) {
      var cx = R() * w, cy = h * (y0 + R() * (y1 - y0)), s = (60 + R() * 140) * k;
      blurOn(ctx, s * 0.35);
      for (var j = 0; j < 6; j++) {
        fillG(ctx, v + (R() - 0.5) * 16, 0.35 + R() * 0.3);
        ell(ctx, cx + (R() - 0.5) * s * 2.4, cy + (R() - 0.6) * s * 0.5, s * (0.5 + R() * 0.6), s * (0.25 + R() * 0.25));
        ctx.fill();
      }
    }
    ctx.restore();
  }
  function smoke(ctx, x, y, dx, dy, s, v, R, n) {
    ctx.save();
    for (var i = 0; i < (n || 12); i++) {
      var p = i / (n || 12), r = s * (0.4 + p * 1.8);
      blurOn(ctx, r * 0.45);
      fillG(ctx, v + p * 30, 0.5 - p * 0.3);
      ell(ctx, x + dx * p + (R() - 0.5) * s * 0.6, y + dy * p + (R() - 0.5) * s * 0.4, r, r * 0.75);
      ctx.fill();
    }
    ctx.restore();
  }
  function windows(ctx, x, y, w, h, cols, rows, v, a, R) {
    var cw = w / cols, rh = h / rows;
    for (var i = 0; i < cols; i++) for (var j = 0; j < rows; j++) {
      if (R && R() < 0.08) continue;
      fillG(ctx, v + (R ? (R() - 0.5) * 30 : 0), a);
      ctx.fillRect(x + i * cw + cw * 0.25, y + j * rh + rh * 0.22, cw * 0.5, rh * 0.55);
    }
  }
  // A standing figure, feet at (x, y), height hh. o: { v (clothes), dress, hat, face, arms }
  function figure(ctx, x, y, hh, R, o) {
    o = o || {};
    var v = o.v != null ? o.v : 45, sw = hh * 0.125, head = hh * 0.072, hy = y - hh * 0.9;
    ctx.save();
    fillG(ctx, v);
    if (o.dress) {
      ctx.beginPath();
      ctx.moveTo(x - sw * 0.75, y - hh * 0.8);
      ctx.quadraticCurveTo(x - sw * 0.45, y - hh * 0.55, x - sw * 0.55, y - hh * 0.5);
      ctx.quadraticCurveTo(x - sw * 1.0, y - hh * 0.2, x - sw * 1.05, y);
      ctx.lineTo(x + sw * 1.05, y);
      ctx.quadraticCurveTo(x + sw * 1.0, y - hh * 0.2, x + sw * 0.55, y - hh * 0.5);
      ctx.quadraticCurveTo(x + sw * 0.45, y - hh * 0.55, x + sw * 0.75, y - hh * 0.8);
      ctx.closePath(); ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(x - sw, y - hh * 0.79);
      ctx.lineTo(x - sw * 0.82, y - hh * 0.4);
      ctx.lineTo(x - sw * 0.62, y);
      ctx.lineTo(x - sw * 0.1, y);
      ctx.lineTo(x, y - hh * 0.38);
      ctx.lineTo(x + sw * 0.1, y);
      ctx.lineTo(x + sw * 0.62, y);
      ctx.lineTo(x + sw * 0.82, y - hh * 0.4);
      ctx.lineTo(x + sw, y - hh * 0.79);
      ctx.closePath(); ctx.fill();
    }
    ell(ctx, x, y - hh * 0.79, sw * 1.02, hh * 0.045); ctx.fill();
    if (hh > 30) {
      // arms as slightly darker shapes along the sides
      ctx.strokeStyle = gray(v - 14); ctx.lineCap = "round"; ctx.lineWidth = sw * 0.42;
      ctx.beginPath(); ctx.moveTo(x - sw * 0.88, y - hh * 0.76); ctx.lineTo(x - sw * 0.98, y - hh * (o.arms ? 0.98 : 0.45)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + sw * 0.88, y - hh * 0.76); ctx.lineTo(x + sw * (o.arms ? 1.5 : 0.98), y - hh * (o.arms ? 1.05 : 0.45)); ctx.stroke();
    }
    if (!o.dress && hh > 40 && o.shirt !== false) { fillG(ctx, 205, 0.85); poly(ctx, [[x - sw * 0.26, y - hh * 0.83], [x + sw * 0.26, y - hh * 0.83], [x, y - hh * 0.66]]); ctx.fill(); fillG(ctx, 30); ctx.fillRect(x - sw * 0.05, y - hh * 0.8, sw * 0.1, hh * 0.12); }
    if (o.dress && hh > 40) { fillG(ctx, Math.min(235, v + 30), 0.8); ctx.fillRect(x - sw * 0.2, y - hh * 0.84, sw * 0.4, hh * 0.05); }
    // neck + head, light from the left
    fillG(ctx, (o.face != null ? o.face : 165) - 25);
    ctx.fillRect(x - head * 0.35, hy + head * 0.6, head * 0.7, hh * 0.05);
    fillG(ctx, o.face != null ? o.face : 165);
    ell(ctx, x, hy, head * 0.8, head); ctx.fill();
    if (hh > 60) {
      fillG(ctx, 20, 0.3); ell(ctx, x + head * 0.3, hy + head * 0.05, head * 0.48, head * 0.92); ctx.fill();
      fillG(ctx, 45, 0.75);
      ell(ctx, x - head * 0.3, hy - head * 0.08, head * 0.13, head * 0.08); ctx.fill();
      ell(ctx, x + head * 0.3, hy - head * 0.08, head * 0.13, head * 0.08); ctx.fill();
      fillG(ctx, 90, 0.6); ctx.fillRect(x - head * 0.22, hy + head * 0.45, head * 0.44, head * 0.08);
    }
    fillG(ctx, o.hair != null ? o.hair : 40);
    if (o.dress) { ctx.beginPath(); ctx.ellipse(x, hy - head * 0.3, head * 0.95, head * 0.82, 0, PI * 0.95, TAU + 0.05 * PI); ctx.fill(); ell(ctx, x, hy - head * 1.05, head * 0.45, head * 0.32); ctx.fill(); }
    else { ctx.beginPath(); ctx.ellipse(x, hy - head * 0.22, head * 0.85, head * 0.82, 0, PI * 1.02, TAU - 0.02 * PI); ctx.fill(); }
    var hat = o.hat;
    if (hat === "bowler") { fillG(ctx, 25); ell(ctx, x, hy - head * 0.62, head * 1.2, head * 0.2); ctx.fill(); ctx.beginPath(); ctx.ellipse(x, hy - head * 0.66, head * 0.78, head * 0.78, 0, PI, TAU); ctx.fill(); }
    else if (hat === "cap") { fillG(ctx, 55); ctx.beginPath(); ctx.ellipse(x, hy - head * 0.45, head * 0.95, head * 0.62, 0, PI, TAU); ctx.fill(); ell(ctx, x + head * 0.45, hy - head * 0.45, head * 0.7, head * 0.16); ctx.fill(); }
    else if (hat === "boater") { fillG(ctx, 205); ell(ctx, x, hy - head * 0.66, head * 1.35, head * 0.18); ctx.fill(); ctx.fillRect(x - head * 0.72, hy - head * 1.12, head * 1.44, head * 0.48); fillG(ctx, 40); ctx.fillRect(x - head * 0.72, hy - head * 0.8, head * 1.44, head * 0.13); }
    else if (hat === "lady") { fillG(ctx, 60); ell(ctx, x, hy - head * 0.75, head * 1.6, head * 0.28); ctx.fill(); fillG(ctx, 190, 0.8); ell(ctx, x - head * 0.6, hy - head * 1.02, head * 0.5, head * 0.28); ctx.fill(); }
    ctx.restore();
  }
  var HATS = ["bowler", "cap", "bowler", "none", "boater", "cap", "bowler"];
  // Large studio portrait bust (head about a third of the height). Generic, soft, never a likeness.
  function bust(ctx, w, h, R, woman) {
    var k = Math.min(w, h) / 1000, cx = w * 0.5, hy = h * (woman ? 0.4 : 0.37), hr = Math.min(w * 0.165, h * 0.135), hh = hr * 1.3;
    var g = ctx.createRadialGradient(cx - hr * 0.8, hy - hh * 0.2, 0, cx, hy + hh, Math.max(w, h) * 0.8);
    g.addColorStop(0, gray(178)); g.addColorStop(0.45, gray(128)); g.addColorStop(1, gray(58));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.save(); blurOn(ctx, 46 * k);
    for (var i = 0; i < 16; i++) { fillG(ctx, 80 + R() * 100, 0.22); ell(ctx, R() * w, R() * h, (80 + R() * 220) * k, (60 + R() * 160) * k, R()); ctx.fill(); }
    ctx.restore();
    ctx.save(); blurOn(ctx, 2.2 * k);
    // shoulders and body
    var sy = hy + hh * 1.22, sw = w * 0.47;
    function bodyPath() {
      ctx.beginPath();
      ctx.moveTo(cx - hr * 0.5, hy + hh * 0.9);
      ctx.bezierCurveTo(cx - hr * 0.7, sy, cx - sw * 0.75, sy + hh * 0.05, cx - sw * 0.95, sy + hh * 0.6);
      ctx.lineTo(cx - sw * 1.08, h * 1.02); ctx.lineTo(cx + sw * 1.08, h * 1.02);
      ctx.lineTo(cx + sw * 0.95, sy + hh * 0.6);
      ctx.bezierCurveTo(cx + sw * 0.75, sy + hh * 0.05, cx + hr * 0.7, sy, cx + hr * 0.5, hy + hh * 0.9);
      ctx.closePath();
    }
    var bg = ctx.createLinearGradient(cx - sw, 0, cx + sw, 0);
    if (woman) { bg.addColorStop(0, gray(222)); bg.addColorStop(0.45, gray(205)); bg.addColorStop(1, gray(130)); }
    else { bg.addColorStop(0, gray(72)); bg.addColorStop(0.4, gray(40)); bg.addColorStop(1, gray(20)); }
    ctx.fillStyle = bg; bodyPath(); ctx.fill();
    if (!woman) {
      fillG(ctx, 226); poly(ctx, [[cx - hr * 0.5, hy + hh * 1.0], [cx + hr * 0.5, hy + hh * 1.0], [cx + hr * 0.28, h * 0.9], [cx - hr * 0.28, h * 0.9]]); ctx.fill();
      fillG(ctx, 242);
      poly(ctx, [[cx - hr * 0.52, hy + hh * 0.92], [cx - hr * 0.04, hy + hh * 1.3], [cx - hr * 0.5, hy + hh * 1.36]]); ctx.fill();
      fillG(ctx, 205);
      poly(ctx, [[cx + hr * 0.52, hy + hh * 0.92], [cx + hr * 0.04, hy + hh * 1.3], [cx + hr * 0.5, hy + hh * 1.36]]); ctx.fill();
      fillG(ctx, 26);
      poly(ctx, [[cx - hr * 0.11, hy + hh * 1.28], [cx + hr * 0.11, hy + hh * 1.28], [cx + hr * 0.17, h * 0.88], [cx, h * 0.93], [cx - hr * 0.17, h * 0.88]]); ctx.fill();
      fillG(ctx, 34); ell(ctx, cx, hy + hh * 1.3, hr * 0.13, hh * 0.07); ctx.fill();
      fillG(ctx, 58);
      poly(ctx, [[cx - hr * 0.55, hy + hh * 1.05], [cx - hr * 0.3, h * 0.98], [cx - sw * 0.5, h * 0.98], [cx - sw * 0.42, sy + hh * 0.3]]); ctx.fill();
      fillG(ctx, 16);
      poly(ctx, [[cx + hr * 0.55, hy + hh * 1.05], [cx + hr * 0.3, h * 0.98], [cx + sw * 0.5, h * 0.98], [cx + sw * 0.42, sy + hh * 0.3]]); ctx.fill();
      ctx.strokeStyle = gray(100, 0.6); ctx.lineWidth = 3 * k;
      ctx.beginPath(); ctx.moveTo(cx - hr * 0.55, hy + hh * 1.05); ctx.lineTo(cx - sw * 0.42, sy + hh * 0.3); ctx.stroke();
    } else {
      // lace yoke, pleats, high collar and brooch
      ctx.save(); bodyPath(); ctx.clip();
      ctx.globalAlpha = 0.35;
      for (var lc = 0; lc < 90; lc++) { fillG(ctx, 150); var lx = cx + (R() - 0.5) * sw * 1.1, ly = sy + R() * hh * 0.8; ell(ctx, lx, ly, 4 * k, 4 * k); ctx.fill(); }
      ctx.globalAlpha = 0.25; ctx.strokeStyle = gray(120); ctx.lineWidth = 3 * k;
      for (var pl = -4; pl <= 4; pl++) { ctx.beginPath(); ctx.moveTo(cx + pl * hr * 0.22, sy + hh * 0.7); ctx.lineTo(cx + pl * hr * 0.3, h); ctx.stroke(); }
      ctx.restore();
      fillG(ctx, 232); ctx.fillRect(cx - hr * 0.5, hy + hh * 0.62, hr, hh * 0.62);
      ctx.strokeStyle = gray(170, 0.7); ctx.lineWidth = 2 * k;
      for (var cl = 1; cl < 6; cl++) { ctx.beginPath(); ctx.moveTo(cx - hr * 0.5, hy + hh * (0.62 + cl * 0.1)); ctx.lineTo(cx + hr * 0.5, hy + hh * (0.62 + cl * 0.1)); ctx.stroke(); }
      fillG(ctx, 150, 0.6); ctx.fillRect(cx + hr * 0.25, hy + hh * 0.62, hr * 0.25, hh * 0.62);
      fillG(ctx, 45); ell(ctx, cx, hy + hh * 1.3, hr * 0.15, hr * 0.19); ctx.fill();
      fillG(ctx, 210); ell(ctx, cx, hy + hh * 1.3, hr * 0.09, hr * 0.12); ctx.fill();
      fillG(ctx, 55, 0.9); ctx.fillRect(0, h * 0.95, w, h * 0.06);
    }
    if (!woman) { fillG(ctx, 140); ctx.fillRect(cx - hr * 0.42, hy + hh * 0.55, hr * 0.84, hh * 0.45); }
    fillG(ctx, 60, 0.5); ell(ctx, cx + hr * 0.08, hy + hh * 0.86, hr * 0.48, hh * 0.13); ctx.fill();
    // ears
    fillG(ctx, 160); ell(ctx, cx - hr * 0.97, hy + hh * 0.02, hr * 0.15, hh * 0.19); ctx.fill();
    fillG(ctx, 118); ell(ctx, cx + hr * 0.97, hy + hh * 0.02, hr * 0.15, hh * 0.19); ctx.fill();
    // head lit from the upper left
    var hg = ctx.createRadialGradient(cx - hr * 0.45, hy - hh * 0.35, hr * 0.1, cx + hr * 0.1, hy, hr * 1.3);
    hg.addColorStop(0, gray(218)); hg.addColorStop(0.5, gray(184)); hg.addColorStop(1, gray(108));
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.moveTo(cx, hy - hh);
    ctx.bezierCurveTo(cx + hr * 1.04, hy - hh, cx + hr * 1.04, hy + hh * 0.3, cx + hr * 0.62, hy + hh * 0.74);
    ctx.quadraticCurveTo(cx + hr * 0.2, hy + hh * 1.04, cx, hy + hh * 1.02);
    ctx.quadraticCurveTo(cx - hr * 0.2, hy + hh * 1.04, cx - hr * 0.62, hy + hh * 0.74);
    ctx.bezierCurveTo(cx - hr * 1.04, hy + hh * 0.3, cx - hr * 1.04, hy - hh, cx, hy - hh);
    ctx.fill();
    ctx.restore();
    // modelling: shadow side, cheekbone light, jaw shade
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, hy - hh);
    ctx.bezierCurveTo(cx + hr * 1.04, hy - hh, cx + hr * 1.04, hy + hh * 0.3, cx + hr * 0.62, hy + hh * 0.74);
    ctx.quadraticCurveTo(cx + hr * 0.2, hy + hh * 1.04, cx, hy + hh * 1.02);
    ctx.quadraticCurveTo(cx - hr * 0.2, hy + hh * 1.04, cx - hr * 0.62, hy + hh * 0.74);
    ctx.bezierCurveTo(cx - hr * 1.04, hy + hh * 0.3, cx - hr * 1.04, hy - hh, cx, hy - hh);
    ctx.clip();
    blurOn(ctx, 18 * k);
    fillG(ctx, 70, 0.45); ell(ctx, cx + hr * 0.85, hy + hh * 0.15, hr * 0.5, hh * 0.95); ctx.fill();
    fillG(ctx, 235, 0.35); ell(ctx, cx - hr * 0.42, hy + hh * 0.12, hr * 0.28, hh * 0.18); ctx.fill();
    fillG(ctx, 80, 0.4); ell(ctx, cx + hr * 0.1, hy + hh * 0.95, hr * 0.7, hh * 0.18); ctx.fill();
    ctx.restore();
    // features, soft
    ctx.save(); blurOn(ctx, 4 * k);
    var ey = hy - hh * 0.02, ex = hr * 0.37;
    fillG(ctx, 105, 0.6); ell(ctx, cx - ex, ey - hh * 0.02, hr * 0.25, hh * 0.13); ctx.fill(); ell(ctx, cx + ex, ey - hh * 0.02, hr * 0.27, hh * 0.14); ctx.fill();
    fillG(ctx, woman ? 92 : 62, 0.8);
    ell(ctx, cx - ex, ey - hh * 0.17, hr * 0.24, hh * (woman ? 0.03 : 0.045), -0.08); ctx.fill();
    ell(ctx, cx + ex, ey - hh * 0.17, hr * 0.24, hh * (woman ? 0.03 : 0.045), 0.08); ctx.fill();
    fillG(ctx, 50, 0.85); ell(ctx, cx - ex, ey, hr * 0.12, hh * 0.035); ctx.fill(); ell(ctx, cx + ex, ey, hr * 0.12, hh * 0.035); ctx.fill();
    fillG(ctx, 35, 0.9); ell(ctx, cx - ex + hr * 0.02, ey, hr * 0.05, hh * 0.03); ctx.fill(); ell(ctx, cx + ex + hr * 0.02, ey, hr * 0.05, hh * 0.03); ctx.fill();
    // nose: lit ridge, shadow to the right, nostrils
    fillG(ctx, 225, 0.4); ell(ctx, cx - hr * 0.04, ey + hh * 0.2, hr * 0.05, hh * 0.18); ctx.fill();
    fillG(ctx, 100, 0.55); poly(ctx, [[cx + hr * 0.05, ey + hh * 0.05], [cx + hr * 0.2, ey + hh * 0.4], [cx + hr * 0.02, ey + hh * 0.44]]); ctx.fill();
    fillG(ctx, 85, 0.6); ell(ctx, cx + hr * 0.02, ey + hh * 0.43, hr * 0.15, hh * 0.035); ctx.fill();
    // mouth and chin
    var my = ey + hh * 0.62;
    fillG(ctx, woman ? 110 : 95, 0.8); ell(ctx, cx, my, hr * 0.22, hh * 0.022); ctx.fill();
    fillG(ctx, 205, 0.4); ell(ctx, cx - hr * 0.02, my + hh * 0.06, hr * 0.13, hh * 0.03); ctx.fill();
    fillG(ctx, 115, 0.4); ell(ctx, cx + hr * 0.03, my + hh * 0.17, hr * 0.15, hh * 0.05); ctx.fill();
    if (woman) { fillG(ctx, 120, 0.35); ell(ctx, cx, my - hh * 0.005, hr * 0.17, hh * 0.04); ctx.fill(); }
    if (!woman && R() < 0.7) {
      fillG(ctx, 60, 0.85);
      ctx.beginPath();
      ctx.moveTo(cx - hr * 0.34, my - hh * 0.02);
      ctx.quadraticCurveTo(cx - hr * 0.2, my - hh * 0.15, cx, my - hh * 0.13);
      ctx.quadraticCurveTo(cx + hr * 0.2, my - hh * 0.15, cx + hr * 0.34, my - hh * 0.02);
      ctx.quadraticCurveTo(cx + hr * 0.15, my - hh * 0.07, cx, my - hh * 0.06);
      ctx.quadraticCurveTo(cx - hr * 0.15, my - hh * 0.07, cx - hr * 0.34, my - hh * 0.02);
      ctx.fill();
    }
    ctx.restore();
    // hair: a soft mass with an uneven hairline and a sheen
    ctx.save(); blurOn(ctx, 5 * k);
    if (woman) {
      fillG(ctx, 50); ell(ctx, cx + hr * 0.05, hy - hh * 1.2, hr * 0.42, hh * 0.18); ctx.fill();
      fillG(ctx, 58);
      ctx.beginPath();
      ctx.moveTo(cx - hr * 0.98, hy + hh * 0.2);
      ctx.bezierCurveTo(cx - hr * 1.32, hy - hh * 0.5, cx - hr * 0.95, hy - hh * 1.22, cx, hy - hh * 1.2);
      ctx.bezierCurveTo(cx + hr * 0.95, hy - hh * 1.22, cx + hr * 1.32, hy - hh * 0.5, cx + hr * 0.98, hy + hh * 0.2);
      ctx.bezierCurveTo(cx + hr * 0.9, hy - hh * 0.25, cx + hr * 0.6, hy - hh * 0.5, cx + hr * 0.05, hy - hh * 0.58);
      ctx.lineTo(cx - hr * 0.05, hy - hh * 0.58);
      ctx.bezierCurveTo(cx - hr * 0.6, hy - hh * 0.5, cx - hr * 0.9, hy - hh * 0.25, cx - hr * 0.98, hy + hh * 0.2);
      ctx.fill();
      blurOn(ctx, 9 * k);
      fillG(ctx, 150, 0.4); ell(ctx, cx - hr * 0.55, hy - hh * 0.85, hr * 0.3, hh * 0.12, -0.5); ctx.fill();
      fillG(ctx, 25, 0.45); ell(ctx, cx + hr * 0.75, hy - hh * 0.4, hr * 0.25, hh * 0.4); ctx.fill();
      blurOn(ctx, 3 * k);
      fillG(ctx, 220); ell(ctx, cx - hr * 0.98, hy + hh * 0.3, hr * 0.04, hr * 0.04); ctx.fill(); ell(ctx, cx + hr * 0.98, hy + hh * 0.3, hr * 0.04, hr * 0.04); ctx.fill();
    } else {
      fillG(ctx, 40);
      ctx.beginPath();
      ctx.moveTo(cx - hr * 1.0, hy + hh * 0.05);
      ctx.bezierCurveTo(cx - hr * 1.12, hy - hh * 0.85, cx - hr * 0.5, hy - hh * 1.12, cx + hr * 0.12, hy - hh * 1.08);
      ctx.bezierCurveTo(cx + hr * 0.85, hy - hh * 1.04, cx + hr * 1.12, hy - hh * 0.6, cx + hr * 1.0, hy + hh * 0.02);
      ctx.bezierCurveTo(cx + hr * 0.95, hy - hh * 0.35, cx + hr * 0.82, hy - hh * 0.55, cx + hr * 0.6, hy - hh * 0.62);
      ctx.quadraticCurveTo(cx + hr * 0.2, hy - hh * 0.7, cx - hr * 0.25, hy - hh * 0.74);
      ctx.quadraticCurveTo(cx - hr * 0.5, hy - hh * 0.66, cx - hr * 0.78, hy - hh * 0.5);
      ctx.quadraticCurveTo(cx - hr * 0.9, hy - hh * 0.3, cx - hr * 1.0, hy + hh * 0.05);
      ctx.fill();
      blurOn(ctx, 10 * k);
      fillG(ctx, 140, 0.4); ell(ctx, cx - hr * 0.35, hy - hh * 0.88, hr * 0.38, hh * 0.1, -0.2); ctx.fill();
      fillG(ctx, 22, 0.5); ell(ctx, cx + hr * 0.7, hy - hh * 0.55, hr * 0.3, hh * 0.3); ctx.fill();
    }
    ctx.restore();
    return { fx: 0.5, fy: (hy - hh * 0.05) / h };
  }
  function pGroup(ctx, w, h, R) {
    var k = Math.min(w, h) / 1000;
    ctx.fillStyle = vgrad(ctx, 0, 0, h, [[0, 150], [0.55, 128], [1, 96]]);
    ctx.fillRect(0, 0, w, h);
    // brick facade with windows behind
    fillG(ctx, 118); ctx.fillRect(0, h * 0.08, w, h * 0.5);
    ctx.strokeStyle = gray(95, 0.5); ctx.lineWidth = 1.2 * k;
    for (var by = h * 0.08; by < h * 0.58; by += 16 * k) { ctx.beginPath(); ctx.moveTo(0, by); ctx.lineTo(w, by); ctx.stroke(); }
    windows(ctx, w * 0.04, h * 0.1, w * 0.92, h * 0.22, 6, 1, 55, 0.9, R);
    fillG(ctx, 92); ctx.fillRect(0, h * 0.58, w, h * 0.42);
    var n1 = w > h ? 7 : 5, n2 = w > h ? 6 : 4, span = w * 0.84, x0 = w * 0.08, sz = Math.min(h * 0.62, span / n1 * 4.2);
    ctx.save(); blurOn(ctx, 1.4 * k);
    for (var i = 0; i < n1; i++) {
      var fx = x0 + span * (i + 0.5) / n1 + (R() - 0.5) * 8 * k, fem = R() < 0.35;
      figure(ctx, fx, h * 0.86, sz * (0.95 + R() * 0.08), R, { v: fem ? 175 : 40 + R() * 25, dress: fem, face: 175 + R() * 20, hat: R() < 0.25 ? "bowler" : "none" });
    }
    for (var j = 0; j < n2; j++) {
      var fx2 = x0 + span * (j + 0.5) / n2 + (R() - 0.5) * 8 * k, fem2 = R() < 0.4;
      figure(ctx, fx2, h * 1.03, sz * 0.82, R, { v: fem2 ? 190 : 50 + R() * 25, dress: fem2, face: 180 + R() * 20, hat: "none" });
    }
    ctx.restore();
    return { fx: 0.5, fy: 0.4 };
  }
  function pCrowd(ctx, w, h, R) {
    var k = Math.min(w, h) / 1000;
    skyFill(ctx, w, h, 210, 185, 0.4);
    // facade with columns
    fillG(ctx, 165); ctx.fillRect(0, h * 0.12, w, h * 0.42);
    fillG(ctx, 140); ctx.fillRect(0, h * 0.12, w, h * 0.05);
    for (var c = 0; c < 9; c++) { var cx = w * (0.05 + c * 0.112); fillG(ctx, 190); ctx.fillRect(cx, h * 0.18, w * 0.035, h * 0.34); fillG(ctx, 120, 0.6); ctx.fillRect(cx + w * 0.026, h * 0.18, w * 0.009, h * 0.34); }
    fillG(ctx, 90, 0.5); ctx.fillRect(0, h * 0.5, w, h * 0.06);
    // banners (blank)
    for (var b = 0; b < 3; b++) { fillG(ctx, 215, 0.9); var bx = w * (0.15 + b * 0.3); ctx.fillRect(bx, h * 0.25, w * 0.12, h * 0.1); fillG(ctx, 120, 0.5); ctx.fillRect(bx, h * 0.33, w * 0.12, h * 0.02); }
    // rows of people from far to near
    var rows = 9;
    for (var r = 0; r < rows; r++) {
      var p = r / (rows - 1), yy = h * (0.58 + p * 0.5), hh = h * (0.07 + p * p * 0.5), n = Math.round(w / (hh * 0.33)) + 2;
      ctx.save(); blurOn(ctx, (1 - p) * 2.2 * k + 0.6 * k);
      for (var i = 0; i < n; i++) {
        var fx = (i + R() * 0.8 - 0.4) * w / (n - 2);
        var tone = lerp(150, 35, p) + (R() - 0.5) * 30;
        figure(ctx, fx, yy + (R() - 0.5) * hh * 0.08, hh * (0.9 + R() * 0.2), R, { v: tone, face: lerp(185, 160, p), hat: HATS[Math.floor(R() * HATS.length)], arms: R() < 0.12, shirt: p > 0.4 });
      }
      ctx.restore();
    }
    return { fx: 0.5, fy: 0.62 };
  }
  function skyline(ctx, w, base, R, k, v, hmin, hmax, blur, spires) {
    ctx.save(); blurOn(ctx, blur);
    var x = -20 * k;
    while (x < w) {
      var bw = (40 + R() * 110) * k, bh = hmin + R() * (hmax - hmin), tone = v + (R() - 0.5) * 18;
      fillG(ctx, tone);
      ctx.fillRect(x, base - bh, bw, bh + 2);
      if (R() < 0.35) { ctx.fillRect(x + bw * 0.2, base - bh - bh * 0.12, bw * 0.6, bh * 0.12); if (spires && R() < 0.5) poly(ctx, [[x + bw * 0.4, base - bh * 1.12], [x + bw * 0.6, base - bh * 1.12], [x + bw * 0.5, base - bh * 1.45]]), ctx.fill(); }
      windows(ctx, x + bw * 0.08, base - bh * 0.95, bw * 0.84, bh * 0.9, Math.max(2, Math.round(bw / (14 * k))), Math.max(2, Math.round(bh / (22 * k))), tone + 35, 0.55, R);
      fillG(ctx, tone - 25, 0.5); ctx.fillRect(x + bw * 0.8, base - bh, bw * 0.2, bh);
      x += bw + R() * 10 * k;
    }
    ctx.restore();
  }
  function pCity(ctx, w, h, R) {
    var k = Math.min(w, h) / 1000, hz = h * 0.7;
    skyFill(ctx, w, h, 205, 228, 0.7);
    clouds(ctx, w, h, R, 5, 0.05, 0.3, 238, k);
    skyline(ctx, w, hz, R, k, 178, h * 0.12, h * 0.3, 3 * k, true);
    skyline(ctx, w, hz + h * 0.02, R, k, 128, h * 0.18, h * 0.46, 1.6 * k, true);
    for (var s = 0; s < 3; s++) smoke(ctx, w * (0.2 + R() * 0.6), hz - h * 0.35, -w * 0.15, -h * 0.12, 18 * k, 150, R, 10);
    skyline(ctx, w, hz + h * 0.05, R, k, 70, h * 0.08, h * 0.24, 0.8 * k, false);
    // river with reflections
    ctx.fillStyle = vgrad(ctx, 0, hz + h * 0.05, h, [[0, 140], [1, 95]]);
    ctx.fillRect(0, hz + h * 0.05, w, h);
    ctx.save(); blurOn(ctx, 1.2 * k);
    for (var i = 0; i < 160; i++) { fillG(ctx, R() < 0.5 ? 185 : 80, 0.25 + R() * 0.25); ctx.fillRect(R() * w, hz + h * 0.06 + R() * (h * 0.29), (20 + R() * 80) * k, 2.2 * k); }
    ctx.restore();
    return { fx: 0.5, fy: 0.45 };
  }
  function pStreet(ctx, w, h, R) {
    var k = Math.min(w, h) / 1000, vx = w * 0.52, vy = h * 0.46;
    skyFill(ctx, w, h, 215, 200, 0.5);
    // facades as perspective quads
    function side(left) {
      var xs = left ? 0 : w, xv = left ? vx - w * 0.06 : vx + w * 0.06;
      var topNear = h * -0.05, botNear = h * 0.86, topFar = vy - h * 0.16, botFar = vy + h * 0.03;
      fillG(ctx, left ? 120 : 150);
      poly(ctx, [[xs, topNear], [xv, topFar], [xv, botFar], [xs, botNear]]); ctx.fill();
      // window columns in perspective
      for (var i = 0; i < 9; i++) {
        var p0 = i / 9, p1 = (i + 0.55) / 9;
        var e0 = 1 - Math.pow(1 - p0, 1.8), e1 = 1 - Math.pow(1 - p1, 1.8);
        var xa = lerp(xs, xv, e0), xb = lerp(xs, xv, e1);
        for (var fl = 0; fl < 4; fl++) {
          var f0 = 0.08 + fl * 0.17, f1 = f0 + 0.1;
          var ya0 = lerp(lerp(topNear, botNear, f0), lerp(topFar, botFar, f0), e0), ya1 = lerp(lerp(topNear, botNear, f1), lerp(topFar, botFar, f1), e0);
          var yb0 = lerp(lerp(topNear, botNear, f0), lerp(topFar, botFar, f0), e1), yb1 = lerp(lerp(topNear, botNear, f1), lerp(topFar, botFar, f1), e1);
          fillG(ctx, 55 + R() * 40, 0.85);
          poly(ctx, [[xa, ya0], [xb, yb0], [xb, yb1], [xa, ya1]]); ctx.fill();
        }
        // awnings at street level
        if (R() < 0.6) {
          var g0 = 0.76, g1 = 0.83;
          fillG(ctx, R() < 0.5 ? 200 : 70, 0.9);
          poly(ctx, [[xa, lerp(lerp(topNear, botNear, g0), lerp(topFar, botFar, g0), e0)], [xb, lerp(lerp(topNear, botNear, g0), lerp(topFar, botFar, g0), e1)], [xb, lerp(lerp(topNear, botNear, g1), lerp(topFar, botFar, g1), e1) + 6 * k], [xa, lerp(lerp(topNear, botNear, g1), lerp(topFar, botFar, g1), e0) + 10 * k]]);
          ctx.fill();
        }
      }
    }
    side(true); side(false);
    // street
    fillG(ctx, 112);
    poly(ctx, [[0, h * 0.86], [vx - w * 0.06, vy + h * 0.03], [vx + w * 0.06, vy + h * 0.03], [w, h * 0.86], [w, h], [0, h]]); ctx.fill();
    ctx.strokeStyle = gray(70, 0.5); ctx.lineWidth = 2 * k;
    for (var r = 0; r < 2; r++) { var rx = vx + (r ? 1 : -1) * w * 0.012; ctx.beginPath(); ctx.moveTo(rx, vy + h * 0.03); ctx.lineTo(rx + (r ? 1 : -1) * w * 0.25, h); ctx.stroke(); }
    ctx.strokeStyle = gray(90, 0.35); ctx.lineWidth = 1.2 * k;
    for (var cb = 0; cb < 26; cb++) { var cy = lerp(vy + h * 0.05, h, Math.pow(cb / 26, 1.7)); ctx.beginPath(); ctx.moveTo(0, cy); ctx.lineTo(w, cy); ctx.stroke(); }
    // lamp posts
    for (var lp = 0; lp < 4; lp++) {
      var e = 1 - Math.pow(1 - lp / 4, 1.6), lx = lerp(w * 0.12, vx - w * 0.07, e), ly = lerp(h * 0.9, vy + h * 0.035, e), lh = lerp(h * 0.42, h * 0.06, e);
      fillG(ctx, 35); ctx.fillRect(lx - lh * 0.015, ly - lh, lh * 0.03, lh); ell(ctx, lx, ly - lh, lh * 0.05, lh * 0.06); ctx.fill();
    }
    // pedestrians
    ctx.save(); blurOn(ctx, 1.1 * k);
    for (var pp = 0; pp < 16; pp++) {
      var ee = R(), left = R() < 0.5, px = left ? lerp(w * 0.05, vx - w * 0.08, ee) : lerp(w * 0.95, vx + w * 0.08, ee), py = lerp(h * 0.92, vy + h * 0.04, ee), ph = lerp(h * 0.34, h * 0.05, ee);
      figure(ctx, px, py, ph, R, { v: 40 + R() * 60, dress: R() < 0.3, hat: HATS[Math.floor(R() * HATS.length)] });
    }
    ctx.restore();
    // motor car
    var cx = w * 0.42, cyy = h * 0.9, cs = Math.min(w, h) * 0.26;
    ctx.save(); blurOn(ctx, 0.9 * k);
    fillG(ctx, 30);
    roundRect(ctx, cx - cs * 0.9, cyy - cs * 0.55, cs * 1.8, cs * 0.32, cs * 0.05); ctx.fill();
    roundRect(ctx, cx - cs * 0.45, cyy - cs * 0.92, cs * 0.9, cs * 0.42, cs * 0.06); ctx.fill();
    fillG(ctx, 150, 0.8); ctx.fillRect(cx - cs * 0.38, cyy - cs * 0.85, cs * 0.32, cs * 0.26); ctx.fillRect(cx + cs * 0.04, cyy - cs * 0.85, cs * 0.32, cs * 0.26);
    fillG(ctx, 205); ell(ctx, cx + cs * 0.92, cyy - cs * 0.42, cs * 0.06, cs * 0.06); ctx.fill();
    [-0.58, 0.58].forEach(function (o) {
      fillG(ctx, 18); ell(ctx, cx + cs * o, cyy - cs * 0.2, cs * 0.22, cs * 0.22); ctx.fill();
      fillG(ctx, 150); ell(ctx, cx + cs * o, cyy - cs * 0.2, cs * 0.08, cs * 0.08); ctx.fill();
      ctx.strokeStyle = gray(120); ctx.lineWidth = 2 * k;
      for (var sp = 0; sp < 8; sp++) { var a = sp * PI / 4; ctx.beginPath(); ctx.moveTo(cx + cs * o, cyy - cs * 0.2); ctx.lineTo(cx + cs * o + Math.cos(a) * cs * 0.18, cyy - cs * 0.2 + Math.sin(a) * cs * 0.18); ctx.stroke(); }
    });
    ctx.restore();
    return { fx: 0.42, fy: 0.72 };
  }
  function pBuilding(ctx, w, h, R) {
    var k = Math.min(w, h) / 1000, cx = w * 0.5, base = h * 0.78, s = Math.min(w * 0.9, h * 1.05);
    skyFill(ctx, w, h, 200, 230, 0.78);
    clouds(ctx, w, h, R, 4, 0.05, 0.3, 240, k);
    // wings
    fillG(ctx, 185); ctx.fillRect(cx - s * 0.5, base - s * 0.2, s, s * 0.2);
    windows(ctx, cx - s * 0.48, base - s * 0.18, s * 0.26, s * 0.16, 7, 2, 90, 0.8, R);
    windows(ctx, cx + s * 0.22, base - s * 0.18, s * 0.26, s * 0.16, 7, 2, 90, 0.8, R);
    fillG(ctx, 150); ctx.fillRect(cx - s * 0.5, base - s * 0.215, s, s * 0.02);
    // portico + columns
    fillG(ctx, 200); ctx.fillRect(cx - s * 0.18, base - s * 0.26, s * 0.36, s * 0.26);
    for (var c = 0; c < 8; c++) { var x = cx - s * 0.165 + c * s * 0.046; fillG(ctx, 232); ctx.fillRect(x, base - s * 0.22, s * 0.022, s * 0.21); fillG(ctx, 120, 0.7); ctx.fillRect(x + s * 0.016, base - s * 0.22, s * 0.007, s * 0.21); }
    fillG(ctx, 210); poly(ctx, [[cx - s * 0.2, base - s * 0.26], [cx + s * 0.2, base - s * 0.26], [cx, base - s * 0.34]]); ctx.fill();
    fillG(ctx, 140, 0.6); poly(ctx, [[cx - s * 0.16, base - s * 0.265], [cx + s * 0.16, base - s * 0.265], [cx, base - s * 0.32]]); ctx.fill();
    // drum, dome, lantern
    fillG(ctx, 205); ctx.fillRect(cx - s * 0.12, base - s * 0.45, s * 0.24, s * 0.12);
    for (var d = 0; d < 9; d++) { fillG(ctx, d % 2 ? 230 : 130, 0.8); ctx.fillRect(cx - s * 0.115 + d * s * 0.026, base - s * 0.44, s * 0.012, s * 0.1); }
    var dg = ctx.createLinearGradient(cx - s * 0.13, 0, cx + s * 0.13, 0);
    dg.addColorStop(0, gray(235)); dg.addColorStop(0.6, gray(190)); dg.addColorStop(1, gray(120));
    ctx.fillStyle = dg;
    ctx.beginPath(); ctx.ellipse(cx, base - s * 0.45, s * 0.13, s * 0.17, 0, PI, TAU); ctx.fill();
    ctx.strokeStyle = gray(130, 0.6); ctx.lineWidth = 1.6 * k;
    for (var rb = 1; rb < 8; rb++) { var rx = s * 0.13 * Math.cos(PI * rb / 8); ctx.beginPath(); ctx.ellipse(cx, base - s * 0.45, Math.abs(rx), s * 0.17, 0, PI, TAU); ctx.stroke(); }
    fillG(ctx, 215); ctx.fillRect(cx - s * 0.02, base - s * 0.67, s * 0.04, s * 0.06);
    fillG(ctx, 150); poly(ctx, [[cx - s * 0.026, base - s * 0.67], [cx + s * 0.026, base - s * 0.67], [cx, base - s * 0.71]]); ctx.fill();
    // steps + lawn + trees
    for (var st2 = 0; st2 < 6; st2++) { fillG(ctx, st2 % 2 ? 175 : 210); ctx.fillRect(cx - s * (0.14 + st2 * 0.012), base + st2 * s * 0.008, s * (0.28 + st2 * 0.024), s * 0.008); }
    ctx.fillStyle = vgrad(ctx, 0, base, h, [[0, 120], [1, 85]]); ctx.fillRect(0, base + s * 0.048, w, h);
    ctx.save(); blurOn(ctx, 2 * k);
    for (var tr = 0; tr < 10; tr++) { var tx = R() < 0.5 ? R() * (cx - s * 0.5) : cx + s * 0.5 + R() * (w - cx - s * 0.5), tr2 = (40 + R() * 60) * k; fillG(ctx, 50 + R() * 30); ell(ctx, tx, base - tr2 * 0.6, tr2, tr2 * 1.1); ctx.fill(); }
    ctx.restore();
    return { fx: 0.5, fy: (base - s * 0.4) / h };
  }
  function pShip(ctx, w, h, R) {
    var k = Math.min(w, h) / 1000, hz = h * 0.6, L = Math.max(w * 0.95, h * 0.95), x0 = w * 0.5 - L * 0.5 + (w < h ? L * 0.12 : 0), hullH = L * 0.075;
    skyFill(ctx, w, h, 196, 226, 0.6);
    clouds(ctx, w, h, R, 5, 0.05, 0.35, 235, k);
    // far shore
    ctx.save(); blurOn(ctx, 2.5 * k); fillG(ctx, 175); ctx.fillRect(0, hz - h * 0.025, w, h * 0.03); ctx.restore();
    ctx.fillStyle = vgrad(ctx, 0, hz, h, [[0, 150], [1, 105]]);
    ctx.fillRect(0, hz, w, h - hz);
    var top = hz - hullH * 0.55;
    // smoke
    for (var sm = 0; sm < 4; sm++) smoke(ctx, x0 + L * (0.35 + sm * 0.11), top - hullH * 2.2, -L * 0.22, -hullH * 0.6, hullH * 0.4, 110, R, 12);
    // funnels
    for (var f = 0; f < 4; f++) {
      var fx = x0 + L * (0.33 + f * 0.11), fw = L * 0.035, fh = hullH * 2.0;
      fillG(ctx, 165); poly(ctx, [[fx, top - hullH * 0.9], [fx + fw, top - hullH * 0.9], [fx + fw - fh * 0.12, top - hullH * 0.9 - fh], [fx - fh * 0.12, top - hullH * 0.9 - fh]]); ctx.fill();
      fillG(ctx, 30); poly(ctx, [[fx - fh * 0.098, top - hullH * 0.9 - fh * 0.82], [fx + fw - fh * 0.098, top - hullH * 0.9 - fh * 0.82], [fx + fw - fh * 0.12, top - hullH * 0.9 - fh], [fx - fh * 0.12, top - hullH * 0.9 - fh]]); ctx.fill();
      fillG(ctx, 105, 0.7); poly(ctx, [[fx + fw * 0.68, top - hullH * 0.9], [fx + fw, top - hullH * 0.9], [fx + fw - fh * 0.098, top - hullH * 0.9 - fh * 0.82], [fx + fw * 0.68 - fh * 0.098, top - hullH * 0.9 - fh * 0.82]]); ctx.fill();
    }
    // masts and lines
    ctx.strokeStyle = gray(60, 0.8); ctx.lineWidth = 2 * k;
    [0.12, 0.86].forEach(function (m) { ctx.beginPath(); ctx.moveTo(x0 + L * m, top); ctx.lineTo(x0 + L * m - hullH * 0.2, top - hullH * 3.6); ctx.stroke(); });
    ctx.lineWidth = 0.8 * k; ctx.strokeStyle = gray(70, 0.55);
    ctx.beginPath(); ctx.moveTo(x0 + L * 0.02, top - hullH * 0.3); ctx.lineTo(x0 + L * 0.12 - hullH * 0.2, top - hullH * 3.6); ctx.lineTo(x0 + L * 0.33, top - hullH * 2.9); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x0 + L * 0.98, top - hullH * 0.5); ctx.lineTo(x0 + L * 0.86 - hullH * 0.2, top - hullH * 3.6); ctx.lineTo(x0 + L * 0.66, top - hullH * 2.9); ctx.stroke();
    // superstructure decks
    fillG(ctx, 222); ctx.fillRect(x0 + L * 0.2, top - hullH * 0.9, L * 0.62, hullH * 0.9);
    fillG(ctx, 208); ctx.fillRect(x0 + L * 0.26, top - hullH * 1.35, L * 0.48, hullH * 0.45);
    windows(ctx, x0 + L * 0.21, top - hullH * 0.85, L * 0.6, hullH * 0.8, 46, 2, 70, 0.8, R);
    windows(ctx, x0 + L * 0.27, top - hullH * 1.3, L * 0.46, hullH * 0.38, 30, 1, 80, 0.7, R);
    fillG(ctx, 120, 0.6); ctx.fillRect(x0 + L * 0.2, top - hullH * 0.05, L * 0.62, hullH * 0.06);
    // hull with sheer, lit from above
    var hg2 = ctx.createLinearGradient(0, top - hullH * 0.4, 0, hz + hullH * 0.45);
    hg2.addColorStop(0, gray(58)); hg2.addColorStop(0.35, gray(36)); hg2.addColorStop(1, gray(20));
    ctx.fillStyle = hg2;
    ctx.beginPath();
    ctx.moveTo(x0, top - hullH * 0.25);
    ctx.quadraticCurveTo(x0 + L * 0.5, top + hullH * 0.08, x0 + L, top - hullH * 0.45);
    ctx.lineTo(x0 + L * 0.965, hz + hullH * 0.45);
    ctx.lineTo(x0 + L * 0.04, hz + hullH * 0.45);
    ctx.closePath(); ctx.fill();
    fillG(ctx, 205, 0.9); ctx.fillRect(x0 + L * 0.03, hz + hullH * 0.12, L * 0.94, hullH * 0.05);
    fillG(ctx, 160, 0.8);
    for (var ph = 0; ph < 60; ph++) { ell(ctx, x0 + L * (0.06 + ph * 0.0148), top + hullH * 0.18, hullH * 0.045, hullH * 0.045); ctx.fill(); }
    // water glints and reflection
    ctx.save(); blurOn(ctx, 1.4 * k);
    fillG(ctx, 40, 0.35); ctx.fillRect(x0 + L * 0.05, hz + hullH * 0.45, L * 0.9, hullH * 1.2);
    for (var i = 0; i < 220; i++) { fillG(ctx, R() < 0.55 ? 195 : 85, 0.3 + R() * 0.3); ctx.fillRect(R() * w, hz + R() * (h - hz), (10 + R() * 60) * k, 2 * k); }
    ctx.restore();
    // tug
    fillG(ctx, 45); var tx = Math.min(w * 0.86, x0 + L * 1.04), ty = hz + hullH * 1.6;
    poly(ctx, [[tx - hullH * 1.2, ty], [tx + hullH * 1.3, ty], [tx + hullH, ty + hullH * 0.45], [tx - hullH, ty + hullH * 0.45]]); ctx.fill();
    fillG(ctx, 190); ctx.fillRect(tx - hullH * 0.45, ty - hullH * 0.5, hullH * 0.8, hullH * 0.5);
    fillG(ctx, 30); ctx.fillRect(tx + hullH * 0.1, ty - hullH * 1.1, hullH * 0.22, hullH * 0.6);
    return { fx: clamp((x0 + L * 0.5) / w, 0.2, 0.8), fy: (top - hullH) / h };
  }
  function pTrain(ctx, w, h, R) {
    var k = Math.min(w, h) / 1000, base = h * 0.74, L = Math.min(w * 1.05, h * 1.5), x0 = w * 0.5 - L * 0.5 - (w < h ? L * 0.15 : 0), bh = L * 0.13;
    skyFill(ctx, w, h, 200, 222, 0.74);
    clouds(ctx, w, h, R, 3, 0.05, 0.3, 236, k);
    ctx.save(); blurOn(ctx, 3 * k); fillG(ctx, 160); ctx.fillRect(0, base - h * 0.08, w, h * 0.08); ctx.restore();
    // steam and smoke
    smoke(ctx, x0 + L * 0.78, base - bh * 2.6, -L * 0.65, -bh * 1.4, bh * 0.45, 225, R, 16);
    smoke(ctx, x0 + L * 0.72, base - bh * 0.15, L * 0.2, bh * 0.1, bh * 0.25, 230, R, 8);
    // tender
    fillG(ctx, 40); ctx.fillRect(x0, base - bh * 1.55, L * 0.26, bh * 1.2);
    fillG(ctx, 60, 0.7); ctx.fillRect(x0 + L * 0.01, base - bh * 1.45, L * 0.24, bh * 0.12);
    // cab
    fillG(ctx, 34); ctx.fillRect(x0 + L * 0.27, base - bh * 2.2, L * 0.15, bh * 1.85);
    fillG(ctx, 25); ctx.fillRect(x0 + L * 0.255, base - bh * 2.32, L * 0.18, bh * 0.14);
    fillG(ctx, 150, 0.8); ctx.fillRect(x0 + L * 0.29, base - bh * 2.0, L * 0.05, bh * 0.45); ctx.fillRect(x0 + L * 0.355, base - bh * 2.0, L * 0.05, bh * 0.45);
    // boiler
    var bg = ctx.createLinearGradient(0, base - bh * 1.75, 0, base - bh * 0.55);
    bg.addColorStop(0, gray(70)); bg.addColorStop(0.25, gray(150)); bg.addColorStop(0.45, gray(60)); bg.addColorStop(1, gray(28));
    ctx.fillStyle = bg; ctx.fillRect(x0 + L * 0.42, base - bh * 1.75, L * 0.42, bh * 1.2);
    fillG(ctx, 22); ell(ctx, x0 + L * 0.84, base - bh * 1.15, bh * 0.2, bh * 0.6); ctx.fill();
    fillG(ctx, 90, 0.8); for (var bd = 0; bd < 4; bd++) ctx.fillRect(x0 + L * (0.48 + bd * 0.09), base - bh * 1.75, L * 0.008, bh * 1.2);
    // chimney, dome, headlamp
    fillG(ctx, 25); ctx.fillRect(x0 + L * 0.77, base - bh * 2.35, L * 0.04, bh * 0.62); ctx.fillRect(x0 + L * 0.76, base - bh * 2.4, L * 0.06, bh * 0.1);
    ell(ctx, x0 + L * 0.62, base - bh * 1.8, L * 0.035, bh * 0.22); ctx.fill();
    fillG(ctx, 225); ell(ctx, x0 + L * 0.86, base - bh * 1.55, bh * 0.1, bh * 0.1); ctx.fill();
    // running board, cylinder, pilot
    fillG(ctx, 30); ctx.fillRect(x0 + L * 0.27, base - bh * 0.6, L * 0.6, bh * 0.12);
    ctx.fillRect(x0 + L * 0.76, base - bh * 0.6, L * 0.1, bh * 0.38);
    poly(ctx, [[x0 + L * 0.86, base - bh * 0.3], [x0 + L * 0.95, base], [x0 + L * 0.86, base]]); ctx.fill();
    // wheels
    function wheel(x, r) {
      fillG(ctx, 18); ell(ctx, x, base - r, r, r); ctx.fill();
      fillG(ctx, 95); ell(ctx, x, base - r, r * 0.2, r * 0.2); ctx.fill();
      ctx.strokeStyle = gray(105); ctx.lineWidth = r * 0.07;
      for (var sp = 0; sp < 12; sp++) { var a = sp * PI / 6; ctx.beginPath(); ctx.moveTo(x, base - r); ctx.lineTo(x + Math.cos(a) * r * 0.86, base - r + Math.sin(a) * r * 0.86); ctx.stroke(); }
      ctx.strokeStyle = gray(70); ctx.lineWidth = r * 0.08; ctx.beginPath(); ctx.arc(x, base - r, r * 0.9, 0, TAU); ctx.stroke();
    }
    [0.47, 0.57, 0.67].forEach(function (p) { wheel(x0 + L * p, bh * 0.48); });
    wheel(x0 + L * 0.8, bh * 0.25);
    [0.05, 0.13, 0.21].forEach(function (p) { wheel(x0 + L * p, bh * 0.25); });
    ctx.strokeStyle = gray(160); ctx.lineWidth = bh * 0.06; ctx.beginPath(); ctx.moveTo(x0 + L * 0.47, base - bh * 0.4); ctx.lineTo(x0 + L * 0.67, base - bh * 0.4); ctx.lineTo(x0 + L * 0.78, base - bh * 0.42); ctx.stroke();
    // rails and platform
    fillG(ctx, 95); ctx.fillRect(0, base, w, h - base);
    fillG(ctx, 60); for (var tie = 0; tie < 40; tie++) ctx.fillRect(tie * w / 30, base + bh * 0.05, w / 60, bh * 0.15);
    fillG(ctx, 175); ctx.fillRect(0, base + bh * 0.02, w, bh * 0.04);
    fillG(ctx, 145); ctx.fillRect(0, base + bh * 0.38, w, h);
    fillG(ctx, 205, 0.8); ctx.fillRect(0, base + bh * 0.38, w, bh * 0.04);
    ctx.save(); blurOn(ctx, 1.4 * k);
    for (var fp = 0; fp < 5; fp++) figure(ctx, w * (0.1 + R() * 0.8), base + bh * 1.6 + R() * bh * 0.5, bh * 2.4, R, { v: 35 + R() * 40, hat: HATS[Math.floor(R() * HATS.length)], dress: R() < 0.3 });
    ctx.restore();
    return { fx: clamp((x0 + L * 0.62) / w, 0.25, 0.75), fy: (base - bh * 1.2) / h };
  }
  function pFactory(ctx, w, h, R) {
    var k = Math.min(w, h) / 1000, base = h * 0.72;
    skyFill(ctx, w, h, 170, 205, 0.72);
    // chimneys and smoke first (behind roofs)
    var nC = w > h ? 5 : 3;
    for (var c = 0; c < nC; c++) {
      var cx = w * (0.15 + c * 0.7 / Math.max(1, nC - 1)) + (R() - 0.5) * 30 * k, ch = h * (0.42 + R() * 0.2), cw = Math.min(w, h) * 0.035;
      smoke(ctx, cx, base - ch - h * 0.02, w * 0.3, -h * 0.18, cw * 1.6, 70 + R() * 40, R, 16);
      fillG(ctx, 75 + R() * 20);
      poly(ctx, [[cx - cw, base], [cx + cw, base], [cx + cw * 0.65, base - ch], [cx - cw * 0.65, base - ch]]); ctx.fill();
      fillG(ctx, 40); ctx.fillRect(cx - cw * 0.75, base - ch, cw * 1.5, ch * 0.04);
      fillG(ctx, 120, 0.5); for (var b = 1; b < 4; b++) ctx.fillRect(cx - cw * 0.8, base - ch * b / 4, cw * 1.6, ch * 0.012);
    }
    // sawtooth halls
    var x = 0;
    while (x < w) {
      var hw = (120 + R() * 140) * k, hh = h * (0.1 + R() * 0.08), tone = 70 + R() * 30;
      fillG(ctx, tone); ctx.fillRect(x, base - hh, hw, hh);
      var teeth = Math.max(2, Math.round(hw / (40 * k)));
      for (var t = 0; t < teeth; t++) { var tx = x + t * hw / teeth; fillG(ctx, tone - 20); poly(ctx, [[tx, base - hh], [tx + hw / teeth, base - hh], [tx + hw / teeth, base - hh - h * 0.05]]); ctx.fill(); fillG(ctx, 190, 0.6); ctx.fillRect(tx + hw / teeth - 6 * k, base - hh - h * 0.045, 4 * k, h * 0.04); }
      windows(ctx, x + hw * 0.05, base - hh * 0.85, hw * 0.9, hh * 0.6, Math.max(2, Math.round(hw / (18 * k))), 2, tone + 60, 0.6, R);
      x += hw + 6 * k;
    }
    // yard and canal
    fillG(ctx, 85); ctx.fillRect(0, base, w, h * 0.08);
    ctx.strokeStyle = gray(150, 0.6); ctx.lineWidth = 2 * k;
    for (var r = 0; r < 2; r++) { ctx.beginPath(); ctx.moveTo(0, base + h * (0.03 + r * 0.03)); ctx.lineTo(w, base + h * (0.03 + r * 0.03)); ctx.stroke(); }
    ctx.fillStyle = vgrad(ctx, 0, base + h * 0.08, h, [[0, 130], [1, 90]]); ctx.fillRect(0, base + h * 0.08, w, h);
    ctx.save(); blurOn(ctx, 1.5 * k);
    for (var i = 0; i < 120; i++) { fillG(ctx, R() < 0.5 ? 170 : 60, 0.3); ctx.fillRect(R() * w, base + h * 0.09 + R() * h * 0.2, (20 + R() * 60) * k, 2 * k); }
    ctx.restore();
    return { fx: 0.5, fy: 0.45 };
  }
  function pLandscape(ctx, w, h, R) {
    var k = Math.min(w, h) / 1000, hz = h * 0.5;
    skyFill(ctx, w, h, 190, 232, 0.5);
    clouds(ctx, w, h, R, 7, 0.04, 0.38, 240, k * 1.3);
    function hill(y, amp, v, blur, stripes) {
      ctx.save(); blurOn(ctx, blur);
      fillG(ctx, v);
      ctx.beginPath(); ctx.moveTo(0, h);
      var ph = R() * 9, fr = 2 + R() * 2;
      for (var x = 0; x <= w; x += w / 40) ctx.lineTo(x, y + Math.sin(x / w * fr + ph) * amp + Math.sin(x / w * fr * 2.7 + ph) * amp * 0.3);
      ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
      if (stripes) {
        ctx.clip();
        for (var s = 0; s < 14; s++) { fillG(ctx, v + (s % 2 ? 18 : -14), 0.6); var sx = R() * w; poly(ctx, [[sx, y - amp], [sx + w * 0.08, y - amp], [sx + w * 0.3, h], [sx - w * 0.05, h]]); ctx.fill(); }
      }
      ctx.restore();
    }
    hill(hz, h * 0.03, 175, 3 * k, false);
    hill(hz + h * 0.06, h * 0.05, 140, 1.5 * k, true);
    // windmill on the ridge
    var mx = w * 0.66, my = hz + h * 0.04, mh = h * 0.24;
    fillG(ctx, 55); poly(ctx, [[mx - mh * 0.12, my], [mx + mh * 0.12, my], [mx + mh * 0.06, my - mh], [mx - mh * 0.06, my - mh]]); ctx.fill();
    ctx.beginPath(); ctx.ellipse(mx, my - mh, mh * 0.09, mh * 0.08, 0, PI, TAU); ctx.fill();
    ctx.strokeStyle = gray(45); ctx.lineWidth = 3 * k;
    for (var sl = 0; sl < 4; sl++) {
      var a = sl * PI / 2 + 0.4, ex = mx + Math.cos(a) * mh * 0.62, ey = my - mh + Math.sin(a) * mh * 0.62;
      ctx.beginPath(); ctx.moveTo(mx, my - mh); ctx.lineTo(ex, ey); ctx.stroke();
      fillG(ctx, 120, 0.8);
      var px = -Math.sin(a) * mh * 0.08, py = Math.cos(a) * mh * 0.08;
      poly(ctx, [[mx + Math.cos(a) * mh * 0.15, my - mh + Math.sin(a) * mh * 0.15], [ex, ey], [ex + px, ey + py], [mx + Math.cos(a) * mh * 0.15 + px, my - mh + Math.sin(a) * mh * 0.15 + py]]); ctx.fill();
    }
    hill(hz + h * 0.2, h * 0.04, 110, 0.8 * k, true);
    // trees and fence
    ctx.save(); blurOn(ctx, 1.8 * k);
    for (var tr = 0; tr < 7; tr++) {
      var tx = w * (0.05 + tr * 0.14 + R() * 0.05), ty = hz + h * (0.17 + R() * 0.05), r = (26 + R() * 34) * k;
      fillG(ctx, 40); ctx.fillRect(tx - r * 0.07, ty - r * 0.9, r * 0.14, r * 0.95);
      for (var cl2 = 0; cl2 < 7; cl2++) { fillG(ctx, 45 + R() * 40); ell(ctx, tx + (R() - 0.5) * r * 1.3, ty - r * (1.1 + R() * 0.8), r * (0.45 + R() * 0.35), r * (0.4 + R() * 0.3)); ctx.fill(); }
    }
    ctx.restore();
    ctx.strokeStyle = gray(60); ctx.lineWidth = 3 * k;
    for (var fp = 0; fp < 12; fp++) { var fx = fp * w / 11, fy = h * 0.86 + fp * h * 0.006; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - h * 0.06); ctx.stroke(); }
    ctx.lineWidth = 2 * k; ctx.beginPath(); ctx.moveTo(0, h * 0.83); ctx.lineTo(w, h * 0.896); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, h * 0.85); ctx.lineTo(w, h * 0.916); ctx.stroke();
    // cart track
    fillG(ctx, 150, 0.7);
    poly(ctx, [[w * 0.36, h], [w * 0.485, hz + h * 0.23], [w * 0.5, hz + h * 0.23], [w * 0.5, h]]); ctx.fill();
    ctx.strokeStyle = gray(120, 0.6); ctx.lineWidth = 3 * k;
    ctx.beginPath(); ctx.moveTo(w * 0.4, h); ctx.lineTo(w * 0.488, hz + h * 0.23); ctx.moveTo(w * 0.47, h); ctx.lineTo(w * 0.496, hz + h * 0.23); ctx.stroke();
    return { fx: mx / w, fy: (my - mh * 0.7) / h };
  }
  function pAircraft(ctx, w, h, R) {
    var k = Math.min(w, h) / 1000, cx = w * 0.5, cy = h * 0.45, s = Math.min(w * 0.8, h * 1.1);
    skyFill(ctx, w, h, 185, 230, 1);
    clouds(ctx, w, h, R, 8, 0.1, 0.95, 238, k * 1.2);
    ctx.save(); blurOn(ctx, 3 * k); fillG(ctx, 150); ctx.fillRect(0, h * 0.9, w, h * 0.1); ctx.restore();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.06); blurOn(ctx, 0.8 * k);
    fillG(ctx, 70);
    // lower and upper wings
    roundRect(ctx, -s * 0.48, s * 0.05, s * 0.96, s * 0.045, s * 0.02); ctx.fill();
    fillG(ctx, 60);
    roundRect(ctx, -s * 0.5, -s * 0.12, s * 1.0, s * 0.05, s * 0.02); ctx.fill();
    fillG(ctx, 110, 0.6); for (var rb = 0; rb < 14; rb++) ctx.fillRect(-s * 0.48 + rb * s * 0.07, -s * 0.12, s * 0.006, s * 0.05);
    // struts and wires
    ctx.strokeStyle = gray(40); ctx.lineWidth = 3 * k;
    [-0.36, -0.18, 0.18, 0.36].forEach(function (p) { ctx.beginPath(); ctx.moveTo(s * p, -s * 0.07); ctx.lineTo(s * p, s * 0.05); ctx.stroke(); });
    ctx.lineWidth = 1 * k; ctx.strokeStyle = gray(60, 0.8);
    [[-0.36, -0.18], [0.18, 0.36]].forEach(function (pr) { ctx.beginPath(); ctx.moveTo(s * pr[0], -s * 0.07); ctx.lineTo(s * pr[1], s * 0.05); ctx.moveTo(s * pr[1], -s * 0.07); ctx.lineTo(s * pr[0], s * 0.05); ctx.stroke(); });
    // fuselage seen from the side-front
    var fg = ctx.createLinearGradient(0, -s * 0.07, 0, s * 0.08);
    fg.addColorStop(0, gray(170)); fg.addColorStop(1, gray(80));
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.moveTo(-s * 0.08, -s * 0.06); ctx.lineTo(s * 0.08, -s * 0.06); ctx.lineTo(s * 0.05, s * 0.09); ctx.lineTo(-s * 0.05, s * 0.09); ctx.closePath(); ctx.fill();
    fillG(ctx, 35); ell(ctx, 0, -s * 0.085, s * 0.03, s * 0.025); ctx.fill();
    fillG(ctx, 200, 0.6); ell(ctx, -s * 0.015, -s * 0.09, s * 0.012, s * 0.008); ctx.fill();
    // propeller disc
    ctx.save(); blurOn(ctx, 3 * k); fillG(ctx, 150, 0.35); ell(ctx, 0, 0, s * 0.11, s * 0.11); ctx.fill(); ctx.restore();
    fillG(ctx, 30); ell(ctx, 0, 0, s * 0.015, s * 0.015); ctx.fill();
    // wheels
    ctx.strokeStyle = gray(40); ctx.lineWidth = 3 * k;
    ctx.beginPath(); ctx.moveTo(-s * 0.04, s * 0.09); ctx.lineTo(-s * 0.1, s * 0.17); ctx.moveTo(s * 0.04, s * 0.09); ctx.lineTo(s * 0.1, s * 0.17); ctx.stroke();
    fillG(ctx, 25); ell(ctx, -s * 0.11, s * 0.18, s * 0.025, s * 0.03); ctx.fill(); ell(ctx, s * 0.11, s * 0.18, s * 0.025, s * 0.03); ctx.fill();
    // tail
    fillG(ctx, 85); poly(ctx, [[-s * 0.015, -s * 0.06], [s * 0.015, -s * 0.06], [0, -s * 0.16]]); ctx.fill();
    ctx.restore();
    return { fx: 0.5, fy: (cy - s * 0.02) / h };
  }
  function pBridge(ctx, w, h, R) {
    var k = Math.min(w, h) / 1000, wl = h * 0.66, dk = h * 0.6;
    skyFill(ctx, w, h, 198, 228, 0.66);
    clouds(ctx, w, h, R, 4, 0.05, 0.3, 238, k);
    skyline(ctx, w, wl, R, k, 185, h * 0.04, h * 0.14, 3 * k, true);
    ctx.fillStyle = vgrad(ctx, 0, wl, h, [[0, 160], [1, 100]]); ctx.fillRect(0, wl, w, h - wl);
    var t1 = w * (w > h ? 0.27 : 0.12), t2 = w * (w > h ? 0.73 : 0.88), th = h * 0.42, tw = Math.min(w, h) * 0.05;
    function tower(x) {
      fillG(ctx, 70); ctx.fillRect(x - tw, dk - th, tw * 2, th + (wl - dk) + h * 0.04);
      fillG(ctx, 175, 0.9);
      [0.12, 0.5].forEach(function (p) { ctx.beginPath(); var ay = dk - th + th * p; ctx.moveTo(x - tw * 0.55, ay + th * 0.25); ctx.lineTo(x - tw * 0.55, ay + th * 0.06); ctx.quadraticCurveTo(x, ay - th * 0.04, x + tw * 0.55, ay + th * 0.06); ctx.lineTo(x + tw * 0.55, ay + th * 0.25); ctx.closePath(); ctx.fill(); });
      fillG(ctx, 45, 0.7); ctx.fillRect(x + tw * 0.6, dk - th, tw * 0.4, th);
      fillG(ctx, 55); ctx.fillRect(x - tw * 1.15, dk - th - h * 0.012, tw * 2.3, h * 0.014);
    }
    // cables
    ctx.strokeStyle = gray(50); ctx.lineWidth = 3 * k;
    function cable(xa, ya, xb, yb, sag) {
      ctx.beginPath(); ctx.moveTo(xa, ya); ctx.quadraticCurveTo((xa + xb) / 2, Math.max(ya, yb) + sag, xb, yb); ctx.stroke();
    }
    cable(-w * 0.1, dk - h * 0.02, t1, dk - th, th * 0.15);
    cable(t1, dk - th, t2, dk - th, th * 1.6);
    cable(t2, dk - th, w * 1.1, dk - h * 0.02, th * 0.15);
    ctx.lineWidth = 1 * k; ctx.strokeStyle = gray(70, 0.8);
    for (var s = 1; s < 30; s++) { var p = s / 30, x = lerp(t1, t2, p), q = 4 * p * (1 - p), yc = dk - th + (th * 1.6 / 2) * q * 2 * 0.5 + 0; ctx.beginPath(); ctx.moveTo(x, dk - th + th * 0.8 * q); ctx.lineTo(x, dk); ctx.stroke(); }
    // deck
    fillG(ctx, 55); ctx.fillRect(-10, dk, w + 20, h * 0.02);
    fillG(ctx, 120, 0.7); ctx.fillRect(-10, dk + h * 0.02, w + 20, h * 0.006);
    tower(t1); tower(t2);
    ctx.save(); blurOn(ctx, 1.3 * k);
    fillG(ctx, 60, 0.3); ctx.fillRect(t1 - tw, wl + h * 0.02, tw * 2, h * 0.2); ctx.fillRect(t2 - tw, wl + h * 0.02, tw * 2, h * 0.2);
    for (var i = 0; i < 160; i++) { fillG(ctx, R() < 0.5 ? 190 : 90, 0.3); ctx.fillRect(R() * w, wl + R() * (h - wl), (15 + R() * 50) * k, 2 * k); }
    ctx.restore();
    // a boat
    fillG(ctx, 40); var bx = w * 0.55, by = h * 0.8; poly(ctx, [[bx - 60 * k, by], [bx + 70 * k, by], [bx + 55 * k, by + 16 * k], [bx - 50 * k, by + 16 * k]]); ctx.fill();
    ctx.fillRect(bx - 10 * k, by - 70 * k, 3 * k, 70 * k); fillG(ctx, 210, 0.85); poly(ctx, [[bx - 7 * k, by - 66 * k], [bx + 40 * k, by - 6 * k], [bx - 7 * k, by - 6 * k]]); ctx.fill();
    return { fx: 0.5, fy: (dk - th * 0.6) / h };
  }
  var PAINTERS = {
    portrait: function (c, w, h, R) { return bust(c, w, h, R, false); },
    "portrait-woman": function (c, w, h, R) { return bust(c, w, h, R, true); },
    group: pGroup, crowd: pCrowd, city: pCity, street: pStreet, building: pBuilding, ship: pShip,
    train: pTrain, factory: pFactory, landscape: pLandscape, aircraft: pAircraft, bridge: pBridge
  };
  function aspectFor(subject, fmtHint) {
    if (subject === "portrait" || subject === "portrait-woman") return 0.8;
    if (fmtHint === "tall") return 0.8;
    if (fmtHint === "square") return 1.25;
    return 1.5;
  }
  function defaultAspect(subject) { return aspectFor(subject, TALL ? "tall" : SQUARE ? "square" : "wide"); }

  // ------------------------- tones -------------------------
  var TONES = {
    sepia: { stops: [[0, [34, 20, 10]], [0.45, [118, 82, 48]], [0.8, [206, 174, 130]], [1, [240, 226, 196]]], con: 1.2, lift: 0.04, vig: 0.42, grain: 18, stain: 0.12, blur: 0.7 },
    silver: { stops: [[0, [18, 18, 19]], [0.5, [118, 116, 112]], [0.85, [208, 206, 199]], [1, [238, 236, 230]]], con: 1.08, lift: 0.02, vig: 0.35, grain: 16, stain: 0.06, blur: 0.45 },
    cyanotype: { stops: [[0, [10, 32, 72]], [0.5, [38, 92, 148]], [0.85, [150, 190, 214]], [1, [222, 234, 238]]], con: 1.1, lift: 0.03, vig: 0.3, grain: 14, stain: 0.08, blur: 0.6 },
    faded: { stops: [[0, [92, 74, 56]], [0.5, [158, 132, 102]], [0.85, [214, 196, 164]], [1, [236, 226, 204]]], con: 0.82, lift: 0.12, vig: -0.18, grain: 14, stain: 0.18, blur: 1.0 },
    modern: { stops: [[0, [22, 26, 34]], [0.45, [104, 108, 112]], [0.8, [196, 190, 178]], [1, [246, 242, 234]]], con: 1.05, lift: 0, vig: 0.12, grain: 5, stain: 0, blur: 0 },
    news: { stops: [[0, [20, 18, 16]], [1, [235, 232, 225]]], con: 1.25, lift: 0, vig: 0.15, grain: 8, stain: 0, blur: 0.4 }
  };
  function toneId(t) { t = normWord(t); return TONES[t] && t !== "news" ? t : null; }
  function toneMap(ctx, w, h, tone, R, o) {
    o = o || {};
    var T = TONES[tone] || TONES.sepia, img = ctx.getImageData(0, 0, w, h), d = img.data, n = noiseGrid(R, 32);
    var stops = T.stops, sc = Math.max(w, h) / 6, damage = num(o.damage, 1);
    for (var y = 0; y < h; y++) {
      var vy = (y / h - 0.5) * 2;
      for (var x = 0; x < w; x++) {
        var i = (y * w + x) * 4, L = d[i] / 255;
        L = (L - 0.5) * T.con + 0.5;
        var vx = (x / w - 0.5) * 2, e = vx * vx * 0.6 + vy * vy * 0.7;
        L *= 1 - T.vig * e * 0.6;
        if (T.vig < 0) L = L + (-T.vig) * e * 0.4 * (1 - L);
        if (T.stain && damage > 0) { var nz = n(x / sc, y / sc) - 0.5; L += nz * T.stain * damage * 0.7; }
        L = T.lift + L * (1 - T.lift);
        L = L < 0 ? 0 : L > 1 ? 1 : L;
        var k = 0;
        while (k < stops.length - 2 && L > stops[k + 1][0]) k++;
        var a = stops[k], b = stops[k + 1], p = (L - a[0]) / (b[0] - a[0] || 1);
        p = p < 0 ? 0 : p > 1 ? 1 : p;
        var gr = (R() + R() - 1) * T.grain;
        d[i] = a[1][0] + (b[1][0] - a[1][0]) * p + gr;
        d[i + 1] = a[1][1] + (b[1][1] - a[1][1]) * p + gr;
        d[i + 2] = a[1][2] + (b[1][2] - a[1][2]) * p + gr;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    if (tone === "modern") {
      // a little colour for "today": cool sky, warm ground
      ctx.save();
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(90,140,200,0.18)"); g.addColorStop(0.55, "rgba(120,140,150,0.05)"); g.addColorStop(1, "rgba(170,120,70,0.14)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }
  // Scratches, dust, cracks and corner wear on a finished photograph.
  function photoDamage(ctx, w, h, R, tone, amt, face) {
    if (tone === "modern" || amt <= 0) return;
    var k = Math.min(w, h) / 1000;
    ctx.save();
    ctx.lineCap = "round";
    for (var i = 0; i < Math.round((face ? 6 : 10) * amt); i++) {
      var x = R() * w;
      if (face && x > w * 0.3 && x < w * 0.7) x = x < w / 2 ? x - w * 0.22 : x + w * 0.22;
      var y = R() * h, a = PI / 2 + (R() - 0.5) * 0.6, L = (60 + R() * 400) * k;
      ctx.strokeStyle = R() < 0.75 ? "rgba(255,248,232," + f3(0.18 + R() * 0.3) + ")" : "rgba(20,12,6," + f3(0.15 + R() * 0.2) + ")";
      ctx.lineWidth = (0.6 + R() * 1.4) * k;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(a) * L * 0.5 + (R() - 0.5) * 20 * k, y + Math.sin(a) * L * 0.5, x + Math.cos(a) * L, y + Math.sin(a) * L);
      ctx.stroke();
    }
    for (var j = 0; j < Math.round(70 * amt); j++) {
      ctx.fillStyle = R() < 0.8 ? "rgba(255,250,240," + f3(0.3 + R() * 0.5) + ")" : "rgba(15,10,5,0.5)";
      var r = (0.6 + R() * R() * 3.5) * k;
      ctx.beginPath(); ctx.arc(R() * w, R() * h, r, 0, TAU); ctx.fill();
    }
    if (tone === "sepia" || tone === "faded") {
      // fine emulsion crack across one corner
      if (R() < 0.7 * amt) {
        var cx = R() < 0.5 ? w * (0.04 + R() * 0.12) : w * (0.84 + R() * 0.12), cy = R() < 0.5 ? 0 : h, dir = cx < w / 2 ? 1 : -1;
        ctx.strokeStyle = "rgba(250,240,220,0.4)"; ctx.lineWidth = 1.1 * k;
        ctx.beginPath(); ctx.moveTo(cx, cy);
        var px = cx, py = cy, ang = (cy > 0 ? -1 : 1) * (0.9 + R() * 0.4);
        for (var s2 = 0; s2 < 40; s2++) { ang += (R() - 0.5) * 0.5; px += Math.cos(ang) * 0 + dir * (R() - 0.35) * 6 * k; py += Math.sin(ang) * 7 * k; ctx.lineTo(px, py); }
        ctx.stroke();
      }
      // silvered, worn corner
      var corner = Math.floor(R() * 4), qx = corner % 2 ? w : 0, qy = corner > 1 ? h : 0, cr = Math.min(w, h) * (0.12 + R() * 0.1);
      var g = ctx.createRadialGradient(qx, qy, 0, qx, qy, cr);
      g.addColorStop(0, "rgba(240,225,195,0.55)"); g.addColorStop(1, "rgba(240,225,195,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    ctx.restore();
  }
  // Make a clean drawing read as a photograph: lens softness (more at the edges), uneven exposure,
  // clumped grain and halation around the highlights. Works on the grey picture before toning.
  function photoPass(c, ctx, w, h, R, T, tone) {
    var k = Math.min(w, h) / 1000, tmp = mkCanvas(w, h), tx = tmp.getContext("2d");
    var soft = (tone === "modern" ? 0.6 : 1.4 + T.blur * 1.2) * k;
    tx.filter = "blur(" + f2(soft) + "px)"; tx.drawImage(c, 0, 0); tx.filter = "none";
    ctx.clearRect(0, 0, w, h); ctx.drawImage(tmp, 0, 0);
    if (tone !== "modern") {
      // edges softer than the centre
      tx.clearRect(0, 0, w, h); tx.filter = "blur(" + f2(soft * 3.2) + "px)"; tx.drawImage(c, 0, 0); tx.filter = "none";
      tx.globalCompositeOperation = "destination-in";
      var g = tx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.72);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,1)");
      tx.fillStyle = g; tx.fillRect(0, 0, w, h); tx.globalCompositeOperation = "source-over";
      ctx.drawImage(tmp, 0, 0);
      // halation: a glow bleeding out of the bright areas
      tx.clearRect(0, 0, w, h); tx.filter = "blur(" + f2(12 * k) + "px) brightness(1.15) contrast(1.6)"; tx.drawImage(c, 0, 0); tx.filter = "none";
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.09; ctx.drawImage(tmp, 0, 0); ctx.restore();
    }
    // uneven exposure and development
    mottle(ctx, 0, 0, w, h, R, { alpha: tone === "modern" ? 0.06 : 0.2, color: "#000000", light: "#ffffff", lightAmt: 0.7, octaves: [[0.03, 0.5], [0.09, 0.4]] });
    // clumped grain (two scales)
    var g1 = mkCanvas(Math.ceil(w / 2.2), Math.ceil(h / 2.2)), gx = g1.getContext("2d"), img = gx.createImageData(g1.width, g1.height), d = img.data;
    for (var i = 0; i < g1.width * g1.height; i++) { var v = R() < 0.5 ? 0 : 255; d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v; d[i * 4 + 3] = Math.round(R() * 70); }
    gx.putImageData(img, 0, 0);
    ctx.save(); ctx.globalAlpha = tone === "modern" ? 0.15 : 0.45; ctx.imageSmoothingEnabled = true; ctx.drawImage(g1, 0, 0, w, h); ctx.restore();
  }
  // Paint a finished photograph image (no border) into a new canvas of w x h px.
  function photoImage(subject, tone, w, h, seed, o) {
    o = o || {};
    w = Math.max(8, Math.round(w)); h = Math.max(8, Math.round(h));
    var c = mkCanvas(w, h), ctx = c.getContext("2d"), R = rng(seed);
    var paint = PAINTERS[subject] || PAINTERS.portrait;
    ctx.fillStyle = gray(128); ctx.fillRect(0, 0, w, h);
    var focus = paint(ctx, w, h, R) || { fx: 0.5, fy: 0.45 };
    ctx.filter = "none";
    var T = TONES[tone] || TONES.sepia;
    photoPass(c, ctx, w, h, R, T, tone);
    if (o.raw) return { canvas: c, focus: focus };
    if ((subject === "portrait" || subject === "portrait-woman") && (tone === "sepia" || tone === "faded") && !o.noOval) {
      var og = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.36, w / 2, h * 0.45, Math.max(w, h) * 0.62);
      og.addColorStop(0, "rgba(255,255,255,0)"); og.addColorStop(1, "rgba(235,235,235,0.9)");
      ctx.fillStyle = og; ctx.fillRect(0, 0, w, h);
    }
    toneMap(ctx, w, h, tone, R, { damage: o.damage });
    photoDamage(ctx, w, h, R, tone, num(o.damage, 1), subject === "portrait" || subject === "portrait-woman");
    return { canvas: c, focus: focus };
  }
  // Halftone newsprint reproduction of a subject (dots on paper colour, transparent elsewhere).
  function halftoneImage(subject, w, h, seed, cell) {
    var src = photoImage(subject, "news", w, h, seed, { raw: true });
    var cols = Math.max(4, Math.round(w / cell)), rows = Math.max(4, Math.round(h / cell));
    var sm = mkCanvas(cols, rows), sx = sm.getContext("2d");
    sx.imageSmoothingEnabled = true; sx.imageSmoothingQuality = "high";
    sx.drawImage(src.canvas, 0, 0, cols, rows);
    var px = sx.getImageData(0, 0, cols, rows).data;
    var c = mkCanvas(w, h), ctx = c.getContext("2d"), R = rng(seed + 3);
    ctx.fillStyle = "rgba(30,26,22,0.08)"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#1c1915";
    var cw = w / cols, ch = h / rows;
    for (var j = 0; j < rows; j++) for (var i = 0; i < cols; i++) {
      var L = px[(j * cols + i) * 4] / 255;
      L = clamp((L - 0.5) * 1.25 + 0.5, 0, 1);
      var r = Math.sqrt(1 - L) * cw * 0.72;
      if (r < cw * 0.06) continue;
      var ox = (j % 2) * cw * 0.5;
      ctx.globalAlpha = 0.82 + R() * 0.18;
      ctx.beginPath(); ctx.arc(i * cw + cw / 2 + ox, j * ch + ch / 2, r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    return { canvas: c, focus: src.focus };
  }

  // ------------------------- photo item -------------------------
  var BORDER_FOR = { sepia: "cream", silver: "deckle", cyanotype: "white", faded: "cream", modern: "white" };
  function photo(o) {
    o = obj(o);
    var s = ensure();
    var subject = subjectId(o.subject) || "portrait", tone = toneId(o.tone) || "sepia";
    var aspect = num(o.aspect, defaultAspect(subject));
    var w = Math.max(u(60), num(o.w, TALL ? W * 0.8 : W * 0.5));
    var border = str(o.border) || BORDER_FOR[tone] || "cream";
    var bpx = border === "none" ? 0 : border === "mount" ? w * 0.08 : border === "deckle" ? w * 0.05 : w * 0.045;
    var cap = ascii(o.caption);
    var bottomExtra = border === "none" ? 0 : cap ? Math.max(bpx * 1.9, w * 0.085) : border === "mount" ? bpx * 1.6 : bpx;
    var iw = w - bpx * 2, ih = iw / aspect, h = bpx + ih + bottomExtra;
    var seed = num(o.seed, nextSeed());
    var it = makeItem({ x: o.x, y: o.y, cx: o.cx, cy: o.cy, w: w, h: h, rot: num(o.rot, 0), kind: "photo", label: subject, layer: o.layer });
    var kind = border === "mount" ? "black" : tone === "modern" ? "white" : "print";
    var pc = paperCanvas(w, h, { kind: kind, base: border === "mount" ? "#2a2018" : border === "white" ? "#F2EEE4" : null, edge: border === "deckle" ? "deckle" : "straight", seed: seed, res: num(o.res, 1.6), age: tone === "modern" ? 0.15 : num(o.age, 0.8), creases: o.crease ? 1 : false, stain: tone === "modern" ? false : null });
    var ctx = pc.ctx, res = pc.res;
    // image (painted at backing resolution)
    var img = photoImage(subject, tone, iw * res, ih * res, seed + 1, { damage: o.damage });
    ctx.save();
    if (border === "mount") { ctx.strokeStyle = "rgba(200,160,80,0.75)"; ctx.lineWidth = u(2); ctx.strokeRect(bpx - u(6), bpx - u(6), iw + u(12), ih + u(12)); }
    ctx.drawImage(img.canvas, bpx, bpx, iw, ih);
    if (border !== "none") { ctx.strokeStyle = "rgba(40,25,10,0.25)"; ctx.lineWidth = u(1); ctx.strokeRect(bpx, bpx, iw, ih); }
    ctx.restore();
    if (border === "deckle") {
      ctx.save(); ctx.strokeStyle = "rgba(255,255,255,0.4)"; ctx.lineWidth = u(1.2); ctx.strokeRect(bpx * 0.45, bpx * 0.45, w - bpx * 0.9, h - bpx * 0.9); ctx.restore();
    }
    if (cap && border !== "none") {
      var csz = Math.min(bottomExtra * 0.5, u(40) * w / (W * 0.5)), fit = fitText(cap, csz, FONT.hand, iw * 0.9, bottomExtra * 0.8, { style: "italic", maxLines: 1 });
      handText(ctx, fit.lines.join(" "), bpx + iw * 0.04, bpx + ih + bottomExtra * 0.62, fit.size, rng(seed + 5), { color: border === "mount" ? "#d8c9a8" : "#3a3a48" });
    }
    var holder = it.el;
    placeCanvas(holder, pc, w, h);
    // develop cover (fades away during a "develop" entrance)
    var cover = div("ad-develop", holder, "position:absolute;left:" + f2(bpx) + "px;top:" + f2(bpx) + "px;width:" + f2(iw) + "px;height:" + f2(ih) + "px;background:" + (tone === "cyanotype" ? "#E3E9E6" : tone === "silver" || tone === "modern" ? "#ECEAE3" : "#EDE2C8") + ";opacity:0");
    it.onDev = function (p) { setS(cover, "opacity", p >= 0.999 ? "0" : String(f3(1 - p))); };
    if (o.mounts || (o.mounts == null && border !== "mount" && border !== "none" && tone !== "modern")) {
      var mc = mkCanvas((w + 40) * 1, (h + 40) * 1), mx = mc.getContext("2d"), ms = Math.min(iw, ih) * 0.1;
      mx.translate(20, 20);
      [[bpx, bpx, 1, 1], [bpx + iw, bpx, -1, 1], [bpx, bpx + ih, 1, -1], [bpx + iw, bpx + ih, -1, -1]].forEach(function (q) {
        mx.save();
        mx.shadowColor = "rgba(0,0,0,0.4)"; mx.shadowBlur = 3; mx.shadowOffsetY = 1.5;
        mx.fillStyle = "#151210";
        poly(mx, [[q[0] - q[2] * ms * 0.18, q[1] - q[3] * ms * 0.18], [q[0] + q[2] * ms, q[1] - q[3] * ms * 0.18], [q[0] - q[2] * ms * 0.18, q[1] + q[3] * ms]]);
        mx.fill();
        mx.restore();
        mx.strokeStyle = "rgba(255,255,255,0.12)"; mx.lineWidth = 1;
        mx.beginPath(); mx.moveTo(q[0] + q[2] * ms, q[1] - q[3] * ms * 0.18); mx.lineTo(q[0] - q[2] * ms * 0.18, q[1] + q[3] * ms); mx.stroke();
      });
      mc.style.cssText = "position:absolute;left:-20px;top:-20px;width:" + f2(w + 40) + "px;height:" + f2(h + 40) + "px";
      holder.appendChild(mc);
    }
    if (o.tape) tape({ parent: it, x: w * 0.5, y: -u(4), w: Math.min(u(150), w * 0.3), rot: -3 + rng(seed)() * 6 });
    it.subject = subject; it.tone = tone; it.border = bpx;
    it.img = { x: bpx, y: bpx, w: iw, h: ih };
    it.imgRect = function () { return it.sub(bpx, bpx, iw, ih); };
    var fp = it.local(bpx + iw * img.focus.fx, bpx + ih * img.focus.fy);
    it.focus = { x: fp[0], y: fp[1], fx: img.focus.fx, fy: img.focus.fy };
    addKey(it, "photo", subject, 0, 0, w, h);
    return it;
  }

  // ------------------------- item canvases -------------------------
  // A canvas inside an item, covering local rect (lx, ly, lw, lh); ctx draws in item-local world px.
  function itemCanvas(it, lx, ly, lw, lh, res, cls) {
    res = resFor(lw, lh, res || 1.6);
    var c = mkCanvas(lw * res, lh * res, cls || "ad-layer-c"), ctx = c.getContext("2d");
    ctx.setTransform(res, 0, 0, res, -lx * res, -ly * res);
    c.style.cssText = "position:absolute;left:" + f2(lx) + "px;top:" + f2(ly) + "px;width:" + f2(lw) + "px;height:" + f2(lh) + "px";
    (it.el || it).appendChild(c);
    return { canvas: c, ctx: ctx, res: res };
  }
  function itemSvg(it) {
    if (it._svg) return it._svg;
    var sv = svgEl("svg", { width: f2(it.w), height: f2(it.h), viewBox: "0 0 " + f2(it.w) + " " + f2(it.h), overflow: "visible" }, it.el);
    sv.style.cssText = "position:absolute;left:0;top:0;overflow:visible;pointer-events:none";
    it._svg = sv;
    return sv;
  }
  var STAMP_FONT = '"Arial Black", "Helvetica Neue", Arial, sans-serif';
  var INK = { red: "#A8261E", blue: "#24407A", black: "#1A1816", green: "#2C5A3A", violet: "#5A3A78" };

  // ------------------------- typed document -------------------------
  function wrapMono(text, cpl) {
    var words = ascii(text).split(/\s+/).filter(Boolean), lines = [], cur = "";
    words.forEach(function (w) {
      while (w.length > cpl) { if (cur) { lines.push(cur); cur = ""; } lines.push(w.slice(0, cpl)); w = w.slice(cpl); }
      if (!cur) cur = w; else if (cur.length + 1 + w.length <= cpl) cur += " " + w; else { lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function documentItem(o) {
    o = obj(o);
    var w = num(o.w, TALL ? W * 0.84 : SQUARE ? W * 0.62 : W * 0.44), h = num(o.h, w * 1.3);
    var seed = num(o.seed, nextSeed()), R = rng(seed);
    var it = makeItem({ x: o.x, y: o.y, cx: o.cx, cy: o.cy, w: w, h: h, rot: num(o.rot, 0), kind: "document", label: str(o.title) || "document", layer: o.layer });
    var pc = paperCanvas(w, h, { kind: o.paper || "memo", seed: seed, res: num(o.res, 1.7), age: num(o.age, 1) });
    placeCanvas(it.el, pc, w, h);
    var ctx = pc.ctx, m = w * 0.09, cpl = num(o.cpl, 0);
    if (!cpl) {
      // fewest characters per line (largest type) that still fits the page
      var nf = [o.date, o.to, o.from, o.subject, o.ref].filter(function (v) { return ascii(v); }).length, bodyLen = ascii(o.body).length;
      cpl = 52;
      for (var c2 = 30; c2 <= 52; c2 += 2) {
        var sz2 = (w - m * 2) / (c2 * 0.6), lh2 = sz2 * 1.42, lines2 = Math.ceil(bodyLen * 1.12 / c2) + nf * 1.25 + (o.title ? 1.5 : 0) + (o.classification ? 2.2 : 0) + 1.2;
        var head2 = ascii(o.header) ? sz2 * 3.2 : 0;
        if (m * 0.72 + head2 + lines2 * lh2 <= h * 0.8) { cpl = c2; break; }
      }
    }
    var size = (w - m * 2) / (cpl * 0.6) * 0.98, adv = typeAdv(size), lh = size * 1.42;
    var cls = ascii(o.classification).toUpperCase();
    var y = m * 0.72, typed = [];
    function centerX(s) { return w / 2 - s.length * adv / 2; }
    if (cls) { typed.push({ text: cls, x: centerX(cls), y: y, color: INK.red, fast: 1 }); y += lh * 1.1; }
    var header = ascii(o.header).toUpperCase();
    if (header) {
      // letterhead: printed serif, small caps feel
      var hf = fitText(header, size * 1.15, FONT.times, w - m * 2, size * 3, { weight: "bold", maxLines: 2 });
      hf.lines.forEach(function (ln, i) { inkText(ctx, ln, w / 2, y + i * hf.size * 1.25, hf.size, { family: FONT.times, weight: "bold", align: "center", spacing: hf.size * 0.12, color: "#2a2622" }); });
      y += hf.size * 1.25 * hf.lines.length;
      ctx.save(); ctx.strokeStyle = "rgba(40,35,30,0.75)"; ctx.lineWidth = u(1.4); ctx.beginPath(); ctx.moveTo(m, y - hf.size * 0.4); ctx.lineTo(w - m, y - hf.size * 0.4); ctx.stroke();
      ctx.lineWidth = u(0.6); ctx.beginPath(); ctx.moveTo(m, y - hf.size * 0.4 + u(4)); ctx.lineTo(w - m, y - hf.size * 0.4 + u(4)); ctx.stroke(); ctx.restore();
      y += lh * 0.7;
    }
    var title = ascii(o.title).toUpperCase();
    if (title) { var tt = title.split("").join(" "); if (tt.length > cpl) tt = title; typed.push({ text: tt, x: centerX(tt), y: y, fast: 1 }); y += lh * 1.5; }
    var fields = [["DATE:", o.date], ["TO:", o.to], ["FROM:", o.from], ["SUBJECT:", o.subject], ["REF:", o.ref]];
    fields.forEach(function (f) {
      var v = ascii(f[1]);
      if (!v) return;
      var line = (f[0] + "          ").slice(0, 10) + v;
      wrapMono(line, cpl).forEach(function (ln, i) { typed.push({ text: i ? "          " + ln : ln, x: m, y: y, fast: 1 }); y += lh; });
    });
    if (typed.length) {
      y += lh * 0.3;
      ctx.save(); ctx.strokeStyle = "rgba(30,26,22,0.6)"; ctx.lineWidth = u(1); ctx.setLineDash([u(5), u(3)]); ctx.beginPath(); ctx.moveTo(m, y - lh * 0.55); ctx.lineTo(w - m, y - lh * 0.55); ctx.stroke(); ctx.restore();
      y += lh * 0.4;
    }
    var bodyLines = wrapMono("xxxxx " + ascii(o.body || ""), cpl);
    if (bodyLines.length) { bodyLines[0] = bodyLines[0].replace(/^xxxxx ?/, ""); if (!bodyLines[0]) bodyLines.shift(); }
    var bodyStart = typed.length;
    var maxY = h - m * (cls ? 1.25 : 0.8);
    // shrink when the body would run off the page
    var need = y + bodyLines.length * lh;
    if (need > maxY && bodyLines.length) {
      var room = (maxY - y) / bodyLines.length;
      if (room < lh) lh = Math.max(size * 1.05, room);
    }
    bodyLines.forEach(function (ln, i) { typed.push({ text: (i === 0 ? "     " : "") + ln, x: m, y: y, body: true }); y += lh; });
    if (!ascii(o.body)) bodyLines = [];
    if (cls) typed.push({ text: cls, x: centerX(cls), y: h - m * 0.55, color: INK.red, fast: 1 });
    // timing: fields twice as fast as the body
    var a = num(o.typeAt, 0.6), b = Math.max(a + 0.5, num(o.typeEnd, a + 6));
    var weight = 0;
    typed.forEach(function (ln) { weight += ln.text.length * (ln.fast ? 0.35 : 1); });
    var tcur = a;
    typed.forEach(function (ln, i) {
      ln.start = tcur;
      ln.dur = (b - a) * ln.text.length * (ln.fast ? 0.35 : 1) / Math.max(1, weight);
      ln.end = ln.start + ln.dur;
      tcur = ln.end;
      // the strip canvas holding this line's strikes
      var sx = ln.x - adv * 0.3, sy = ln.y - size * 1.0, sw = ln.text.length * adv + adv * 0.8, sh = size * 1.45;
      var lc = itemCanvas(it, sx, sy, Math.max(2, sw), sh, pc.res, "ad-typed");
      typeText(lc.ctx, ln.text, ln.x, ln.y, size, rng(seed + 31 + i), { color: ln.color });
      ln.el = lc.canvas; ln.sx = sx; ln.sw = sw;
      ln.cy = ln.y - size * 0.35;
      show(lc.canvas, false);
    });
    if (o.clip) { var pcl = paperclip({ cx: it.local(w * 0.12, u(26))[0], cy: it.local(w * 0.12, u(26))[1], rot: num(o.rot, 0) + 8, layer: "front" }); pcl.clutter = true; }
    var api = it;
    api.lines = typed;
    api.bodyLines = typed.slice(bodyStart, bodyStart + bodyLines.length);
    api.typedEnd = tcur;
    api.size = size; api.adv = adv; api.margin = m;
    api.lineFy = function (i) { var ln = typed[clamp(Math.round(num(i, 0)), 0, typed.length - 1)]; return ln ? ln.cy / h : 0.5; };
    // head of the typing at time t: { x, y } world, and the line index
    api.head = function (t) {
      var idx = 0;
      for (var i = 0; i < typed.length; i++) if (t >= typed[i].start) idx = i;
      var ln = typed[idx], p = ln ? prog(t, ln.start, ln.dur) : 0;
      var lp = it.local(ln.x + ln.text.length * adv * p, ln.cy);
      return { x: lp[0], y: lp[1], line: idx, ly: ln.cy };
    };
    // redaction bars over phrases of the body
    var bars = [];
    arr(o.redact).forEach(function (ph, pi) {
      ph = ascii(ph).toLowerCase();
      if (!ph) return;
      var found = false;
      api.bodyLines.forEach(function (ln) {
        var lt = ln.text.toLowerCase(), from = 0, idx;
        while ((idx = lt.indexOf(ph, from)) >= 0) {
          bars.push({ line: ln, c0: idx, c1: idx + ph.length, pi: pi });
          from = idx + ph.length; found = true;
        }
      });
      if (!found) {
        // phrase broken across lines: black out each of its words
        ph.split(/\s+/).forEach(function (wd) {
          api.bodyLines.forEach(function (ln) { var j = ln.text.toLowerCase().indexOf(wd); if (j >= 0 && wd.length > 2) bars.push({ line: ln, c0: j, c1: j + wd.length, pi: pi }); });
        });
      }
    });
    bars.forEach(function (bar, bi) {
      var ln = bar.line, bx = ln.x + bar.c0 * adv - adv * 0.25, bw = (bar.c1 - bar.c0) * adv + adv * 0.5, by = ln.y - size * 0.92, bh = size * 1.18;
      var bc = itemCanvas(it, bx - u(3), by - u(3), bw + u(6), bh + u(6), pc.res, "ad-redact"), bctx = bc.ctx, BR = rng(seed + 300 + bi);
      bctx.fillStyle = "#0E0D0C";
      bctx.beginPath();
      bctx.moveTo(bx, by + (BR() - 0.5) * u(2));
      for (var k = 1; k <= 10; k++) bctx.lineTo(bx + bw * k / 10, by + (BR() - 0.5) * u(2.5));
      for (k = 10; k >= 0; k--) bctx.lineTo(bx + bw * k / 10 + (k === 10 ? u(1.5) : 0), by + bh + (BR() - 0.5) * u(2.5));
      bctx.closePath(); bctx.fill();
      bctx.fillStyle = "rgba(255,255,255,0.05)";
      for (k = 0; k < 6; k++) bctx.fillRect(bx, by + bh * BR(), bw, u(0.7));
      bar.el = bc.canvas;
      bar.at = ln.start + ln.dur * Math.min(1, bar.c1 / Math.max(1, ln.text.length)) + 0.35;
      bar.dur = 0.35;
      show(bc.canvas, false);
    });
    api.bars = bars;
    api.redactAt = function (t) { bars.forEach(function (b) { b.at = num(t, b.at); }); };
    onUpd(function (t) {
      typed.forEach(function (ln) {
        var k = Math.floor(ln.text.length * prog(t, ln.start, ln.dur) + 1e-6);
        while (k > 0 && k < ln.text.length && ln.text[k - 1] === " ") k--;
        show(ln.el, k > 0);
        if (k > 0) setS(ln.el, "clipPath", k >= ln.text.length ? "none" : "inset(0 " + f2(Math.max(0, ln.sw - (ln.x - ln.sx) - k * adv)) + "px 0 0)");
      });
      bars.forEach(function (b) {
        var p = prog(t, b.at, b.dur);
        show(b.el, p > 0);
        if (p > 0) setS(b.el, "clipPath", p >= 1 ? "none" : "inset(0 " + f1((1 - smooth(p)) * 100) + "% 0 0)");
      });
    });
    api.bodyLines.forEach(function (ln, i) { var nx = api.bodyLines[i + 2]; addKey(it, "line", ln.text, ln.x, ln.y - size, ln.text.length * adv, size * 1.3, ln.start, nx ? nx.start : null); });
    return api;
  }

  // ------------------------- rubber stamp -------------------------
  function stampArt(text, colr, R, size) {
    text = ascii(text).toUpperCase() || "FILED";
    var words = text.split(/\s+/).slice(0, 3), lines = words.length > 2 ? [words.slice(0, 2).join(" "), words.slice(2).join(" ")] : [words.join(" ")];
    var fs = size, sp = fs * 0.08;
    var tw = 0;
    lines.forEach(function (l) { tw = Math.max(tw, textW(l, fs, STAMP_FONT, null, "900") + sp * l.length); });
    var pad = fs * 0.45, bw = tw + pad * 2, bh = fs * (lines.length * 1.05) + pad * 1.4, res = 2;
    var c = mkCanvas((bw + fs) * res, (bh + fs) * res), ctx = c.getContext("2d");
    ctx.setTransform(res, 0, 0, res, fs / 2 * res, fs / 2 * res);
    var ink = INK[colr] || colr || INK.red;
    ctx.strokeStyle = ink; ctx.fillStyle = ink;
    ctx.lineWidth = fs * 0.12; roundRect(ctx, 0, 0, bw, bh, fs * 0.18); ctx.stroke();
    ctx.lineWidth = fs * 0.04; roundRect(ctx, fs * 0.16, fs * 0.16, bw - fs * 0.32, bh - fs * 0.32, fs * 0.1); ctx.stroke();
    ctx.font = fontStr(fs, STAMP_FONT, null, "900");
    ctx.letterSpacing = f2(sp) + "px";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    lines.forEach(function (l, i) { ctx.fillText(l, bw / 2 + sp / 2, bh / 2 + (i - (lines.length - 1) / 2) * fs * 1.02 + fs * 0.04); });
    // worn rubber: uneven ink, gaps and speckles
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "destination-out";
    mottle(ctx, 0, 0, c.width, c.height, R, { alpha: 0.9, color: "#000000", lightAmt: 0, octaves: [[0.5, 0.5], [2.5, 0.5]] });
    for (var i = 0; i < 260; i++) { ctx.fillStyle = "rgba(0,0,0," + f2(0.4 + R() * 0.6) + ")"; ctx.beginPath(); ctx.arc(R() * c.width, R() * c.height, (0.5 + R() * 2.2) * res, 0, TAU); ctx.fill(); }
    for (var j = 0; j < 4; j++) { ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(0, R() * c.height, c.width, (1 + R() * 3) * res); }
    ctx.globalCompositeOperation = "source-over";
    return { canvas: c, w: bw + fs, h: bh + fs };
  }
  function stamp(item, text, o) {
    o = obj(o);
    var it = item && item.el ? item : null;
    if (!it) return null;
    var R = rng(num(o.seed, nextSeed()));
    var size = num(o.size, Math.min(it.w * 0.11, u(58)));
    var art = stampArt(text, o.color || "red", R, size);
    var fx = num(o.fx, 0.68), fy = num(o.fy, 0.78), rot = num(o.rot, -8 + R() * 6);
    var cx = it.w * fx, cy = it.h * fy;
    var el = art.canvas;
    el.className = "ad-stamp";
    el.style.cssText = "position:absolute;left:" + f2(cx - art.w / 2) + "px;top:" + f2(cy - art.h / 2) + "px;width:" + f2(art.w) + "px;height:" + f2(art.h) + "px;transform-origin:50% 50%;opacity:0.88";
    it.el.appendChild(el);
    var at = Math.max(0, num(o.at, 1));
    show(el, false);
    onUpd(function (t) {
      var p = prog(t, at, 0.14);
      show(el, t >= at);
      if (t < at) return;
      setS(el, "transform", "rotate(" + f2(rot) + "deg) scale(" + f3(1 + 0.4 * (1 - outC(p))) + ")");
      setS(el, "opacity", String(f3(0.88 * clamp(p * 2.5, 0, 1))));
    });
    if (o.shake !== false) camera.shake(at + 0.1, u(8), 0.35);
    addKey(it, "stamp", text, cx - art.w / 2, cy - art.h / 2, art.w, art.h, at, at + 1.8);
    return { el: el, at: at, cx: cx, cy: cy, w: art.w, h: art.h, point: function () { return it.local(cx, cy); } };
  }

  // ------------------------- newspaper -------------------------
  var FILLER = ("the city council met late into the evening while officials declined to comment on reports from the harbour district where crowds had gathered since morning according to witnesses the committee will resume its work tomorrow and a full statement is expected before noon residents were advised to remain calm as prices rose sharply across the market and several firms closed their doors early in the afternoon the mayor said the situation was under control though many remained doubtful about the coming week trains were delayed for hours and the telegraph office reported heavy traffic through the night a spokesman for the board confirmed that the meeting had been called in haste and that further measures would follow if conditions did not improve").split(" ");
  var COLHEADS = ["LATE BULLETINS", "CITY IN SUSPENSE", "OFFICIALS SILENT", "MORE ON PAGE TWO", "CROWDS GATHER", "BOARD MEETS TONIGHT", "WEATHER AND TIDES", "MARKET NOTES"];
  var ROMAN = ["XII", "XXIV", "XXXVII", "XLII", "LIX", "LXXVIII", "LXXXIV", "XCI"];
  function fillerLines(ctx, x, y, cw, y1, size, R, o) {
    o = o || {};
    var lh = size * 1.22, wi = Math.floor(R() * FILLER.length), first = true;
    ctx.save();
    ctx.font = fontStr(size, FONT.times);
    ctx.fillStyle = o.color || "rgba(28,25,22,0.86)";
    var spc = ctx.measureText(" ").width;
    while (y < y1) {
      if (o.heads && R() < 0.09 && !first) {
        var hd = COLHEADS[Math.floor(R() * COLHEADS.length)];
        ctx.save(); ctx.font = fontStr(size * 1.05, FONT.times, null, "bold"); ctx.textAlign = "center"; ctx.fillText(hd, x + cw / 2, y + size * 0.4, cw); ctx.restore();
        y += lh * 1.5; continue;
      }
      var words = [], ww = 0, indent = first ? size * 1.2 : 0;
      while (true) {
        var wd = FILLER[wi % FILLER.length]; wi++;
        var wl = ctx.measureText(wd).width;
        if (words.length && ww + spc + wl > cw - indent) { wi--; break; }
        words.push([wd, wl]); ww += (words.length > 1 ? spc : 0) + wl;
        if (words.length > 40) break;
      }
      var last = R() < 0.1, gap = words.length > 1 && !last ? (cw - indent - (ww - spc * (words.length - 1))) / (words.length - 1) : spc;
      var xx = x + indent;
      words.forEach(function (p) { ctx.fillText(p[0], xx, y); xx += p[1] + gap; });
      first = last;
      y += lh;
    }
    ctx.restore();
  }
  function newspaper(o) {
    o = obj(o);
    var w = num(o.w, TALL ? W * 0.9 : SQUARE ? W * 0.7 : H * 0.88), h = num(o.h, w * 1.36);
    var seed = num(o.seed, nextSeed()), R = rng(seed);
    var it = makeItem({ x: o.x, y: o.y, cx: o.cx, cy: o.cy, w: w, h: h, rot: num(o.rot, 0), kind: "newspaper", label: str(o.headline) || "newspaper", layer: o.layer });
    var pc = paperCanvas(w, h, { kind: "news", seed: seed, res: num(o.res, 1.8), age: num(o.age, 0.9), creases: 1 });
    placeCanvas(it.el, pc, w, h);
    var ctx = pc.ctx, m = w * 0.045, iw = w - m * 2, ink = "#1D1A17", y = m;
    var name = ascii(o.name) || "The Evening Courier";
    // ears
    var earW = iw * 0.16, earH = w * 0.07;
    ctx.save(); ctx.strokeStyle = ink; ctx.lineWidth = u(1);
    ctx.strokeRect(m, y, earW, earH); ctx.strokeRect(w - m - earW, y, earW, earH);
    var es = earH * 0.2;
    inkText(ctx, "LATE CITY", m + earW / 2, y + earH * 0.38, es, { family: FONT.times, weight: "bold", align: "center", color: ink });
    inkText(ctx, "EDITION", m + earW / 2, y + earH * 0.72, es, { family: FONT.times, weight: "bold", align: "center", color: ink });
    var price = ascii(o.price).toUpperCase() || "TWO CENTS";
    var pf = fitText(price, es, FONT.times, earW * 0.86, earH * 0.7, { weight: "bold", maxLines: 2, balance: true });
    pf.lines.forEach(function (ln, i) { inkText(ctx, ln, w - m - earW / 2, y + earH * (pf.lines.length > 1 ? 0.38 + i * 0.34 : 0.56), pf.size, { family: FONT.times, weight: "bold", align: "center", color: ink }); });
    ctx.restore();
    // masthead
    var mf = fitText(name, w * 0.11, FONT.times, iw - earW * 2 - m, earH * 1.25, { weight: "bold", maxLines: 1 });
    inkText(ctx, mf.lines.join(" "), w / 2, y + earH * 0.5 + mf.size * 0.36, mf.size, { family: FONT.times, weight: "bold", align: "center", color: ink, spacing: mf.size * 0.01 });
    y += Math.max(earH, mf.size) + m * 0.35;
    // dateline
    ctx.fillStyle = ink; ctx.fillRect(m, y, iw, u(2.4)); ctx.fillRect(m, y + u(4), iw, u(0.9));
    var ds = w * 0.016, dy = y + u(6) + ds * 1.25;
    inkText(ctx, "VOL. " + ROMAN[Math.floor(R() * ROMAN.length)] + "  No. " + (10000 + Math.floor(R() * 20000)), m, dy, ds, { family: FONT.times, color: ink });
    var date = ascii(o.date).toUpperCase();
    if (date) inkText(ctx, date, w / 2, dy, ds, { family: FONT.times, align: "center", color: ink, weight: "bold" });
    inkText(ctx, price, w - m, dy, ds, { family: FONT.times, align: "right", color: ink });
    y = dy + ds * 0.6;
    ctx.fillRect(m, y, iw, u(0.9)); ctx.fillRect(m, y + u(2.2), iw, u(2.4));
    y += m * 0.55;
    // kicker
    var kick = ascii(o.kicker).toUpperCase();
    if (kick) {
      var ks = w * 0.034, kw = textW(kick, ks, FONT.times, null, "bold") + ks * 1.4 + kick.length * ks * 0.18;
      ctx.fillStyle = ink; ctx.fillRect(w / 2 - kw / 2, y, kw, ks * 1.45);
      inkText(ctx, kick, w / 2, y + ks * 1.08, ks, { family: FONT.times, weight: "bold", align: "center", color: "#E4DCC6", spacing: ks * 0.18, bleed: false, alpha: 1 });
      y += ks * 1.45 + m * 0.35;
    }
    // headline: condensed bold capitals
    var head = ascii(o.headline).toUpperCase() || "EXTRA";
    var hy0 = y, hs = w * 0.13, sx = 0.8;
    var hf = fitText(head, hs, FONT.cond, iw, h * 0.26, { weight: "bold", maxLines: 3, sx: sx, lh: 0.98, min: w * 0.03 });
    hf.lines.forEach(function (ln, i) {
      var lw = textW(ln, hf.size, FONT.cond, null, "bold") * sx, ssx = sx * Math.min(1.15, iw / Math.max(1, lw));
      if (lw > iw * 0.82 || hf.lines.length === 1) ssx = sx * Math.min(1.22, iw / Math.max(1, lw));
      inkText(ctx, ln, w / 2 - textW(ln, hf.size, FONT.cond, null, "bold") * ssx / 2, y + hf.size * 0.84, hf.size, { family: FONT.cond, weight: "bold", color: ink, sx: ssx, alpha: 0.95 });
      y += hf.size * 0.98;
    });
    var hRect = { x: m, y: hy0 - m * 0.1, w: iw, h: y - hy0 + m * 0.2 };
    y += m * 0.2;
    // deck
    var sub = ascii(o.subhead);
    if (sub) {
      ctx.fillStyle = ink; ctx.fillRect(w * 0.3, y, w * 0.4, u(1));
      y += m * 0.4;
      var sf = fitText(sub, w * 0.034, FONT.times, iw * 0.86, h * 0.09, { weight: "bold", maxLines: 3 });
      sf.lines.forEach(function (ln) { inkText(ctx, ln, w / 2, y + sf.size * 0.85, sf.size, { family: FONT.times, weight: "bold", align: "center", color: ink }); y += sf.size * 1.2; });
      y += m * 0.25;
      ctx.fillRect(w * 0.3, y, w * 0.4, u(1));
      y += m * 0.35;
    }
    var deckEnd = y;
    ctx.fillStyle = ink; ctx.fillRect(m, y, iw, u(1.2)); y += m * 0.3;
    // body: columns with the photo in the middle
    var ncol = w > u(700) ? 5 : 4, gut = m * 0.4, cw = (iw - gut * (ncol - 1)) / ncol, fs = Math.max(u(5), cw * 0.06);
    var subj = subjectId(o.subject), phRect = null;
    var pcSpan = ncol === 5 ? 3 : 2, px0 = m + (ncol === 5 ? 1 : 1) * (cw + gut), pw = pcSpan * cw + (pcSpan - 1) * gut, ph = pw * 0.68;
    if (subj) {
      if (y + ph > h - m * 2.4) ph = Math.max(pw * 0.4, h - m * 2.4 - y);
      var tone = toneId(o.tone) || "silver";
      var ht = halftoneImage(subj, pw * pc.res, ph * pc.res, seed + 9, Math.max(3, w * 0.0065 * pc.res));
      ctx.save(); ctx.globalAlpha = tone === "sepia" ? 0.85 : 0.95; ctx.drawImage(ht.canvas, px0, y, pw, ph); ctx.restore();
      ctx.strokeStyle = ink; ctx.lineWidth = u(1); ctx.strokeRect(px0, y, pw, ph);
      phRect = { x: px0, y: y, w: pw, h: ph };
      var cap = ascii(o.caption);
      var cy2 = y + ph + fs * 1.6;
      if (cap) {
        var cf = fitText(cap, fs * 1.25, FONT.times, pw, fs * 4, { style: "italic", maxLines: 2 });
        cf.lines.forEach(function (ln) { inkText(ctx, ln, px0 + pw / 2, cy2, cf.size, { family: FONT.times, style: "italic", align: "center", color: ink }); cy2 += cf.size * 1.3; });
      }
      fillerLines(ctx, px0, cy2 + fs * 0.8, pw, h - m * 1.2, fs, R, { heads: true });
      for (var c = 0; c < ncol; c++) {
        var cx = m + c * (cw + gut);
        if (c >= 1 && c < 1 + pcSpan) continue;
        fillerLines(ctx, cx, y + fs, cw, h - m * 1.2, fs, R, { heads: true });
      }
    } else {
      for (var c2 = 0; c2 < ncol; c2++) fillerLines(ctx, m + c2 * (cw + gut), y + fs, cw, h - m * 1.2, fs, R, { heads: true });
    }
    for (var r = 1; r < ncol; r++) { var rx = m + r * (cw + gut) - gut / 2; if (subj && rx > px0 && rx < px0 + pw) { ctx.fillRect(rx, phRect.y + phRect.h + fs * 0.4, u(0.6), h - m * 1.3 - phRect.y - phRect.h); continue; } ctx.fillRect(rx, deckEnd + m * 0.3, u(0.6), h - m * 1.3 - deckEnd); }
    it.headlineRect = it.sub(hRect.x, hRect.y, hRect.w, hRect.h);
    it.headlineLocal = hRect;
    it.photoLocal = phRect;
    it.photoRect = phRect ? it.sub(phRect.x, phRect.y, phRect.w, phRect.h) : null;
    it.headlineAt = [0.5, (hRect.y + hRect.h / 2) / h];
    it.photoAt = phRect ? [(phRect.x + phRect.w / 2) / w, (phRect.y + phRect.h / 2) / h] : null;
    addKey(it, "headline", head, hRect.x, hRect.y, hRect.w, hRect.h);
    return it;
  }

  // ------------------------- parchment map -------------------------
  function blobPts(cx, cy, r, R, n, rough) {
    var pts = [], ph = R() * 9, ph2 = R() * 9;
    n = n || 64;
    for (var i = 0; i < n; i++) {
      var a = i / n * TAU, q = r * (1 + Math.sin(a * 3 + ph) * 0.18 + Math.sin(a * 5 + ph2) * 0.1 * (rough || 1) + (R() - 0.5) * 0.08 * (rough || 1));
      pts.push([cx + Math.cos(a) * q, cy + Math.sin(a) * q * 0.85]);
    }
    return pts;
  }
  var SEA_NAMES = ["Mare Quietum", "The Western Sea", "Gulf of Storms", "The Narrow Water", "Bay of Lanterns"];
  function mapItem(o) {
    o = obj(o);
    var w = num(o.w, TALL ? W * 0.9 : SQUARE ? W * 0.84 : W * 0.86), h = num(o.h, TALL ? H * 0.6 : SQUARE ? H * 0.8 : H * 0.84);
    var seed = num(o.seed, nextSeed()), R = rng(seed), terrain = str(o.terrain) || "continent";
    var it = makeItem({ x: o.x, y: o.y, cx: o.cx, cy: o.cy, w: w, h: h, rot: num(o.rot, 0), kind: "map", label: str(o.title) || "map", layer: o.layer });
    var pc = paperCanvas(w, h, { kind: "parchment", seed: seed, res: num(o.res, 1.5), age: 1, creases: 2, edge: "deckle" });
    placeCanvas(it.el, pc, w, h);
    var ctx = pc.ctx, mn = Math.min(w, h), INKC = "#3B2A18", SEA = "rgba(120,95,60,";
    // places: given positions or an auto path across the sheet
    var places = arr(o.places).slice(0, 8).map(function (p) { return obj(p); });
    var n = places.length;
    var titleBox = TALL ? { x: w * 0.18, y: h * 0.03, w: w * 0.64, h: h * 0.12 } : { x: w * 0.04, y: h * 0.05, w: w * 0.34, h: h * 0.16 };
    places.forEach(function (p, i) {
      var t = n > 1 ? i / (n - 1) : 0.5, px, py;
      if (TALL) { py = 0.25 + t * 0.62; px = 0.5 + (i % 2 ? 0.2 : -0.2) * (n > 2 ? 1 : 0.6) + (R() - 0.5) * 0.06; }
      else { px = 0.12 + t * 0.76; py = 0.5 + (i % 2 ? 0.16 : -0.12) + (R() - 0.5) * 0.06; if (i === 0) py = Math.max(py, 0.36); }
      p.fx = clamp(num(p.x, px), 0.06, 0.94); p.fy = clamp(num(p.y, py), 0.08, 0.92);
      p.lx = p.fx * w; p.ly = p.fy * h;
    });
    // land masses
    var blobs = [];
    if (terrain === "islands") {
      places.forEach(function (p) { blobs.push(blobPts(p.lx, p.ly, mn * (0.07 + R() * 0.04), R, 56, 1.3)); });
      for (var e = 0; e < 7; e++) { var ex = w * (0.08 + R() * 0.84), ey = h * (0.1 + R() * 0.8), ok = true; places.forEach(function (p) { if (Math.abs(p.lx - ex) < mn * 0.16 && Math.abs(p.ly - ey) < mn * 0.16) ok = false; }); if (ok) blobs.push(blobPts(ex, ey, mn * (0.02 + R() * 0.035), R, 40, 1.4)); }
    } else if (terrain === "coast") {
      var pts = [[-w * 0.2, -h * 0.2]];
      for (var i = 0; i <= 30; i++) { var yy = -h * 0.1 + h * 1.2 * i / 30; pts.push([w * (TALL ? 0.66 : 0.6) + Math.sin(i * 0.7 + R() * 0.5) * w * 0.05 + (R() - 0.5) * w * 0.03, yy]); }
      pts.push([-w * 0.2, h * 1.2]);
      blobs.push(pts);
      places.forEach(function (p) { blobs.push(blobPts(p.lx, p.ly, mn * 0.1, R, 48, 1)); });
    } else if (terrain === "inland") {
      blobs.push([[-w * 0.2, -h * 0.2], [w * 1.2, -h * 0.2], [w * 1.2, h * 1.2], [-w * 0.2, h * 1.2]]);
    } else {
      places.forEach(function (p) { blobs.push(blobPts(p.lx, p.ly, mn * (0.2 + R() * 0.08), R, 72, 1)); });
      for (var b = 0; b < 3; b++) blobs.push(blobPts(w * (0.2 + R() * 0.6), h * (0.25 + R() * 0.5), mn * (0.2 + R() * 0.12), R, 72, 1));
    }
    ctx.save();
    pathPts(ctx, pc.pts); ctx.clip();
    // sea tint and ripple lines around every coast
    ctx.fillStyle = "rgba(110,120,110,0.10)"; ctx.fillRect(0, 0, w, h);
    if (terrain !== "inland") {
      var gap = mn * 0.012, rc = mkCanvas(pc.canvas.width, pc.canvas.height), rx = rc.getContext("2d");
      rx.setTransform(pc.res, 0, 0, pc.res, pc.pad * pc.res, pc.pad * pc.res);
      for (var kq = 5; kq >= 1; kq--) {
        rx.globalCompositeOperation = "source-over";
        rx.strokeStyle = SEA + f3(0.42 - kq * 0.06) + ")"; rx.lineWidth = kq * gap * 2;
        blobs.forEach(function (bp) { pathPts(rx, bp); rx.stroke(); });
        rx.globalCompositeOperation = "destination-out";
        rx.strokeStyle = "#000"; rx.lineWidth = kq * gap * 2 - u(1.2);
        blobs.forEach(function (bp) { pathPts(rx, bp); rx.stroke(); });
      }
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(rc, 0, 0); ctx.restore();
      ctx.fillStyle = "rgba(110,120,110,0.08)"; ctx.fillRect(0, 0, w, h);
      // coastline: thick stroke, then land on top leaves the outer half
      ctx.strokeStyle = INKC; ctx.lineWidth = u(3.2);
      blobs.forEach(function (bp) { pathPts(ctx, bp); ctx.stroke(); });
    }
    ctx.fillStyle = "#E3CC98";
    blobs.forEach(function (bp) { pathPts(ctx, bp); ctx.fill(); });
    // land texture, hills and trees
    ctx.save();
    ctx.beginPath(); blobs.forEach(function (bp) { bp.forEach(function (p, i) { if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath(); }); ctx.clip();
    mottle(ctx, 0, 0, w, h, R, { alpha: 0.35, color: "#6a4a1e", light: "#f4e2b0", octaves: [[0.08, 0.5], [0.25, 0.4]] });
    function nearPlace(x, y, d) { for (var q = 0; q < places.length; q++) if (Math.abs(places[q].lx - x) < d && Math.abs(places[q].ly - y) < d * 0.7) return true; return x > titleBox.x - 10 && x < titleBox.x + titleBox.w + 10 && y > titleBox.y - 10 && y < titleBox.y + titleBox.h + 10; }
    for (var hm = 0; hm < 46; hm++) {
      var hx = R() * w, hyy = R() * h, hs2 = mn * (0.012 + R() * 0.012);
      if (nearPlace(hx, hyy, mn * 0.12)) continue;
      ctx.strokeStyle = "rgba(59,42,24,0.75)"; ctx.lineWidth = u(1.2);
      ctx.beginPath(); ctx.moveTo(hx - hs2, hyy); ctx.quadraticCurveTo(hx - hs2 * 0.2, hyy - hs2 * 1.5, hx, hyy - hs2 * 1.3); ctx.quadraticCurveTo(hx + hs2 * 0.3, hyy - hs2 * 1.2, hx + hs2, hyy); ctx.stroke();
      ctx.lineWidth = u(0.6);
      for (var hh2 = 0; hh2 < 4; hh2++) { ctx.beginPath(); ctx.moveTo(hx + hs2 * (0.1 + hh2 * 0.2), hyy - hs2 * (1.1 - hh2 * 0.22)); ctx.lineTo(hx + hs2 * (0.25 + hh2 * 0.2), hyy - hs2 * 0.05); ctx.stroke(); }
    }
    for (var tr = 0; tr < 60; tr++) {
      var tx = R() * w, ty = R() * h, ts = mn * 0.006;
      if (nearPlace(tx, ty, mn * 0.1)) continue;
      ctx.strokeStyle = "rgba(59,42,24,0.6)"; ctx.lineWidth = u(0.8);
      ctx.beginPath(); ctx.arc(tx, ty, ts, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(tx, ty + ts); ctx.lineTo(tx, ty + ts * 2); ctx.stroke();
    }
    // rivers
    for (var rv = 0; rv < (terrain === "inland" ? 3 : 2); rv++) {
      var rx = w * (0.15 + R() * 0.7), ry = h * (0.15 + R() * 0.2);
      ctx.strokeStyle = "rgba(70,80,90,0.55)"; ctx.lineWidth = u(1.6);
      ctx.beginPath(); ctx.moveTo(rx, ry);
      for (var sgi = 0; sgi < 14; sgi++) { rx += (R() - 0.5) * mn * 0.06; ry += mn * 0.05; ctx.lineTo(rx, ry); ctx.lineWidth = u(1.6 + sgi * 0.1); }
      ctx.stroke();
    }
    ctx.restore();
    // graticule
    ctx.strokeStyle = "rgba(90,60,30,0.16)"; ctx.lineWidth = u(0.8);
    for (var gx = 1; gx < 8; gx++) { ctx.beginPath(); ctx.moveTo(w * gx / 8, 0); ctx.lineTo(w * gx / 8, h); ctx.stroke(); }
    for (var gy = 1; gy < 6; gy++) { ctx.beginPath(); ctx.moveTo(0, h * gy / 6); ctx.lineTo(w, h * gy / 6); ctx.stroke(); }
    // sea name
    if (terrain !== "inland") {
      var sn = SEA_NAMES[Math.floor(R() * SEA_NAMES.length)], best = null;
      for (var tries = 0; tries < 40; tries++) {
        var sx = w * (0.15 + R() * 0.7), sy = h * (0.15 + R() * 0.75), okk = true;
        for (var q2 = 0; q2 < places.length; q2++) if (Math.abs(places[q2].lx - sx) < mn * 0.25 && Math.abs(places[q2].ly - sy) < mn * 0.1) okk = false;
        if (sx > titleBox.x - mn * 0.2 && sx < titleBox.x + titleBox.w + mn * 0.2 && sy < titleBox.y + titleBox.h + mn * 0.06) okk = false;
        if (okk && ctx.isPointInPath && !blobs.some(function (bp) { pathPts(ctx, bp); return ctx.isPointInPath(sx * pc.res + pc.pad * pc.res, sy * pc.res + pc.pad * pc.res); })) { best = [sx, sy]; break; }
      }
      if (best) inkText(ctx, sn, best[0], best[1], mn * 0.03, { family: FONT.serif, style: "italic", align: "center", color: "rgba(59,42,24,0.6)", spacing: mn * 0.008 });
    }
    // compass rose
    var crx = TALL ? w * 0.84 : w * 0.9, cry = TALL ? h * 0.9 : h * 0.84, crr = mn * 0.07;
    ctx.save(); ctx.translate(crx, cry);
    ctx.strokeStyle = INKC; ctx.lineWidth = u(1);
    ctx.beginPath(); ctx.arc(0, 0, crr, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, crr * 0.82, 0, TAU); ctx.stroke();
    for (var cp = 0; cp < 8; cp++) {
      var ca = cp * PI / 4, L = cp % 2 ? crr * 0.62 : crr * 1.05;
      ctx.fillStyle = cp % 2 ? "rgba(59,42,24,0.55)" : INKC;
      poly(ctx, [[Math.cos(ca) * L, Math.sin(ca) * L], [Math.cos(ca + 0.3) * crr * 0.18, Math.sin(ca + 0.3) * crr * 0.18], [0, 0], [Math.cos(ca - 0.3) * crr * 0.18, Math.sin(ca - 0.3) * crr * 0.18]]); ctx.fill();
    }
    inkText(ctx, "N", 0, -crr * 1.12, crr * 0.32, { family: FONT.serif, weight: "bold", align: "center", color: INKC });
    ctx.restore();
    // scale bar
    var sbx = TALL ? w * 0.08 : w * 0.06, sby = h * 0.93, sbw = mn * 0.22;
    for (var sb = 0; sb < 4; sb++) { ctx.fillStyle = sb % 2 ? "#E3CC98" : INKC; ctx.fillRect(sbx + sb * sbw / 4, sby, sbw / 4, u(5)); }
    ctx.strokeStyle = INKC; ctx.lineWidth = u(0.8); ctx.strokeRect(sbx, sby, sbw, u(5));
    inkText(ctx, "LEAGUES", sbx + sbw / 2, sby - u(5), mn * 0.016, { family: FONT.serif, align: "center", color: INKC, spacing: u(2) });
    // title cartouche
    var title = ascii(o.title);
    if (title) {
      var tb = titleBox;
      ctx.fillStyle = "rgba(240,226,190,0.92)";
      roundRect(ctx, tb.x, tb.y, tb.w, tb.h, mn * 0.02); ctx.fill();
      ctx.strokeStyle = INKC; ctx.lineWidth = u(2); roundRect(ctx, tb.x, tb.y, tb.w, tb.h, mn * 0.02); ctx.stroke();
      ctx.lineWidth = u(0.8); roundRect(ctx, tb.x + u(6), tb.y + u(6), tb.w - u(12), tb.h - u(12), mn * 0.015); ctx.stroke();
      var tf = fitText(title, tb.h * 0.32, FONT.serif, tb.w * 0.84, tb.h * 0.72, { style: "italic", maxLines: 2 });
      tf.lines.forEach(function (ln, i) { inkText(ctx, ln, tb.x + tb.w / 2, tb.y + tb.h / 2 + (i - (tf.lines.length - 1) / 2) * tf.size * 1.15 + tf.size * 0.34, tf.size, { family: FONT.serif, style: "italic", align: "center", color: INKC }); });
      addKey(it, "title", title, tb.x, tb.y, tb.w, tb.h);
      it.titleKey = it.keys[it.keys.length - 1];
    }
    ctx.restore();
    // place markers and names: own canvases, inked in when named
    var sz = mn * 0.032;
    places.forEach(function (p, i) {
      var name = ascii(p.name) || "Place " + (i + 1), date = ascii(p.date);
      var nw = textW(name, sz, FONT.serif, "italic", "bold"), dw = date ? textW(date, sz * 0.7, FONT.type, null, "bold") : 0;
      var bw = Math.max(nw, dw) + sz, bh = sz * (date ? 2.3 : 1.5);
      // pick the side of the dot whose label box crosses the route legs least
      var cands = [[sz * 0.7, -sz * 0.6], [-sz * 0.7 - bw, -sz * 0.6], [-bw / 2, sz * 0.6], [-bw / 2, -bh - sz * 0.6], [sz * 0.6, sz * 0.2], [-sz * 0.6 - bw, sz * 0.2], [sz * 0.6, -bh - sz * 0.2], [-sz * 0.6 - bw, -bh - sz * 0.2]];
      var best = null, bestS = 1e9;
      cands.forEach(function (cd, ci) {
        var x0 = clamp(p.lx + cd[0], sz * 1.2, w - bw - sz * 1.2), y0 = clamp(p.ly + cd[1], sz * 1.2, h - bh - sz * 1.2), sc = ci * 0.01;
        [i - 1, i + 1].forEach(function (j) {
          if (j < 0 || j >= n) return;
          var q = places[j];
          for (var k2 = 1; k2 < 24; k2++) { var px = lerp(p.lx, q.lx, k2 / 24), py = lerp(p.ly, q.ly, k2 / 24) - (Math.abs(q.lx - p.lx) + Math.abs(q.ly - p.ly)) * 0.18 * Math.sin(PI * k2 / 24) * (j > i ? 1 : -1) * 0; if (px > x0 - sz * 0.5 && px < x0 + bw + sz * 0.5 && py > y0 - sz * 0.5 && py < y0 + bh + sz * 0.5) sc += 1; }
        });
        places.forEach(function (q, j) { if (j !== i && q.lx > x0 - sz && q.lx < x0 + bw + sz && q.ly > y0 - sz && q.ly < y0 + bh + sz) sc += 5; });
        if (x0 < titleBox.x + titleBox.w && x0 + bw > titleBox.x && y0 < titleBox.y + titleBox.h && y0 + bh > titleBox.y) sc += 8;
        if (sc < bestS) { bestS = sc; best = [x0, y0]; }
      });
      var lx = best[0], ly = best[1];
      var lc = itemCanvas(it, lx - sz * 0.3, ly - sz * 0.2, bw + sz * 0.6, bh + sz * 0.4, pc.res, "ad-place");
      var lctx = lc.ctx;
      lctx.fillStyle = "rgba(232,212,164,0.6)";
      roundRect(lctx, lx - sz * 0.2, ly, bw + sz * 0.1, bh, sz * 0.3); lctx.fill();
      inkText(lctx, name, lx + sz * 0.3, ly + sz * 1.08, sz, { family: FONT.serif, style: "italic", weight: "bold", color: "#2A1C10" });
      if (date) inkText(lctx, date, lx + sz * 0.3, ly + sz * 1.95, sz * 0.7, { family: FONT.type, weight: "bold", color: "#7A2A1A" });
      var dc = itemCanvas(it, p.lx - sz, p.ly - sz, sz * 2, sz * 2, pc.res, "ad-dot"), dctx = dc.ctx;
      dctx.fillStyle = "#7A2A1A"; dctx.beginPath(); dctx.arc(p.lx, p.ly, sz * 0.28, 0, TAU); dctx.fill();
      dctx.strokeStyle = "#2A1C10"; dctx.lineWidth = u(1.4); dctx.beginPath(); dctx.arc(p.lx, p.ly, sz * 0.55, 0, TAU); dctx.stroke();
      p.labelEl = lc.canvas; p.dotEl = dc.canvas; p.at = null; p.label = { x: lx, y: ly, w: bw, h: bh }; p.name2 = name;
      show(lc.canvas, false); show(dc.canvas, false);
    });
    it.places = places;
    it.placeAt = function (i) { var p = places[clamp(Math.round(num(i, 0)), 0, Math.max(0, n - 1))]; return p ? it.local(p.lx, p.ly) : it.point(0.5, 0.5); };
    it.drawPlaces = function (times) {
      times = arr(times);
      places.forEach(function (p, i) { p.at = num(times[i], 0.4 + i * 0.8); });
      // a name is key content until the route has moved on to the next place
      places.forEach(function (p, i) { addKey(it, "place", p.name2, p.label.x, p.label.y, p.label.w, p.label.h, p.at, i + 1 < n ? places[i + 1].at + 0.6 : null); });
      if (it.titleKey && places.length) it.titleKey.to = Math.min(it.titleKey.to, places[0].at + 0.2);
    };
    onUpd(function (t) {
      places.forEach(function (p) {
        if (p.at == null) return;
        var q = prog(t, p.at - 0.1, 0.5);
        show(p.dotEl, q > 0); show(p.labelEl, q > 0);
        if (q <= 0) return;
        setS(p.dotEl, "opacity", String(f3(clamp(q * 3, 0, 1))));
        setS(p.labelEl, "opacity", String(f3(smooth(q))));
        setS(p.labelEl, "clipPath", q >= 1 ? "none" : "inset(0 " + f1((1 - smooth(q)) * 100) + "% 0 0)");
      });
    });
    it.route = function (times, ro) { return mapRoute(it, times, obj(ro)); };
    return it;
  }
  function mapRoute(map, times, o) {
    var places = map.places, n = places.length;
    if (n < 2) return { head: function () { var p = map.placeAt(0); return { x: p[0], y: p[1] }; }, at: 0, end: 0 };
    var style = ["land", "sea", "air", "rail"].indexOf(o.style) >= 0 ? o.style : "land";
    times = arr(times).map(function (t, i) { return num(t, 0.5 + i); });
    while (times.length < n) times.push((times[times.length - 1] || 0.5) + 1);
    var R = rng(num(o.seed, 77)), mn = Math.min(map.w, map.h);
    // sampled polyline through every place
    var pts = [], segStart = [0];
    for (var i = 0; i < n - 1; i++) {
      var a = places[i], b = places[i + 1], dx = b.lx - a.lx, dy = b.ly - a.ly, L = Math.sqrt(dx * dx + dy * dy) || 1;
      var bend = style === "air" ? -0.32 : style === "sea" ? (i % 2 ? 0.18 : -0.18) : style === "rail" ? 0.05 : (i % 2 ? 0.1 : -0.1);
      var mx = (a.lx + b.lx) / 2 - dy / L * L * bend, my = (a.ly + b.ly) / 2 + dx / L * L * bend;
      if (style === "air") my = Math.min(my, (a.ly + b.ly) / 2 - L * 0.22);
      var N = 60;
      for (var k = i ? 1 : 0; k <= N; k++) {
        var p = k / N, x = (1 - p) * (1 - p) * a.lx + 2 * (1 - p) * p * mx + p * p * b.lx, y = (1 - p) * (1 - p) * a.ly + 2 * (1 - p) * p * my + p * p * b.ly;
        if (style === "land" && k > 0 && k < N) { x += Math.sin(p * 18 + i) * mn * 0.004; y += Math.cos(p * 15 + i) * mn * 0.004; }
        pts.push([x, y]);
      }
      segStart.push(pts.length - 1);
    }
    var cum = [0];
    for (var j = 1; j < pts.length; j++) { var ddx = pts[j][0] - pts[j - 1][0], ddy = pts[j][1] - pts[j - 1][1]; cum.push(cum[j - 1] + Math.sqrt(ddx * ddx + ddy * ddy)); }
    var total = cum[cum.length - 1] || 1;
    var d = pts.map(function (p, i) { return (i ? "L" : "M") + f1(p[0]) + " " + f1(p[1]); }).join("");
    var sv = itemSvg(map), id = "adr" + nextSeed();
    var defs = svgEl("defs", null, sv);
    var mask = svgEl("mask", { id: id, maskUnits: "userSpaceOnUse", x: -map.w, y: -map.h, width: map.w * 3, height: map.h * 3 }, defs);
    var mpath = svgEl("path", { d: d, fill: "none", stroke: "#fff", "stroke-width": f1(mn * 0.04), "stroke-linecap": "round", "stroke-linejoin": "round" }, mask);
    mpath.style.strokeDasharray = f1(total) + " " + f1(total + 10);
    var g = svgEl("g", { mask: "url(#" + id + ")" }, sv);
    var lw = mn * 0.006, col = "#7A2A1A";
    if (style === "rail") {
      svgEl("path", { d: d, fill: "none", stroke: col, "stroke-width": f2(lw * 1.1), "stroke-linecap": "round" }, g);
      svgEl("path", { d: d, fill: "none", stroke: col, "stroke-width": f2(lw * 3.6), "stroke-dasharray": f1(lw * 0.9) + " " + f1(lw * 3.2) }, g);
    } else {
      var dash = style === "sea" ? f1(lw * 0.2) + " " + f1(lw * 2.6) : style === "air" ? f1(lw * 4) + " " + f1(lw * 2.2) : f1(lw * 3) + " " + f1(lw * 2);
      svgEl("path", { d: d, fill: "none", stroke: col, "stroke-width": f2(style === "sea" ? lw * 1.5 : lw * 1.1), "stroke-dasharray": dash, "stroke-linecap": "round", "stroke-linejoin": "round" }, g);
    }
    // marker glyph at the head
    var mk = svgEl("g", null, sv), ms = mn * 0.045;
    var glyph = style === "air"
      ? '<path d="M' + f1(-ms) + ' 0 L' + f1(ms) + ' 0 M' + f1(ms * 0.2) + ' 0 L' + f1(-ms * 0.25) + ' ' + f1(-ms * 0.9) + ' M' + f1(ms * 0.2) + ' 0 L' + f1(-ms * 0.25) + ' ' + f1(ms * 0.9) + ' M' + f1(-ms * 0.8) + ' 0 L' + f1(-ms) + ' ' + f1(-ms * 0.35) + ' M' + f1(-ms * 0.8) + ' 0 L' + f1(-ms) + ' ' + f1(ms * 0.35) + '" stroke="#2A1C10" stroke-width="' + f2(ms * 0.16) + '" stroke-linecap="round" fill="none"/>'
      : style === "sea"
        ? '<path d="M' + f1(-ms) + ' ' + f1(ms * 0.1) + ' L' + f1(ms) + ' ' + f1(ms * 0.1) + ' L' + f1(ms * 0.7) + ' ' + f1(ms * 0.45) + ' L' + f1(-ms * 0.75) + ' ' + f1(ms * 0.45) + ' Z" fill="#2A1C10"/><path d="M0 ' + f1(ms * 0.1) + ' L0 ' + f1(-ms * 1.05) + '" stroke="#2A1C10" stroke-width="' + f2(ms * 0.08) + '"/><path d="M' + f1(ms * 0.06) + ' ' + f1(-ms * 0.95) + ' Q' + f1(ms * 0.7) + ' ' + f1(-ms * 0.45) + ' ' + f1(ms * 0.06) + ' ' + f1(-ms * 0.02) + ' Z" fill="#F2E4C0" stroke="#2A1C10" stroke-width="' + f2(ms * 0.05) + '"/><path d="M' + f1(-ms * 0.06) + ' ' + f1(-ms * 0.8) + ' Q' + f1(-ms * 0.55) + ' ' + f1(-ms * 0.4) + ' ' + f1(-ms * 0.06) + ' ' + f1(-ms * 0.05) + ' Z" fill="#F2E4C0" stroke="#2A1C10" stroke-width="' + f2(ms * 0.05) + '"/>'
        : '<circle r="' + f1(ms * 0.32) + '" fill="#7A2A1A" stroke="#2A1C10" stroke-width="' + f2(ms * 0.08) + '"/><circle r="' + f1(ms * 0.62) + '" fill="none" stroke="#7A2A1A" stroke-width="' + f2(ms * 0.05) + '" opacity="0.6"/>';
    mk.innerHTML = glyph;
    var t0 = times[0];
    // progress along the polyline for time t: each leg runs from one place's time to the next, eased
    function frac(t) {
      if (t <= times[0]) return 0;
      for (var i2 = 0; i2 < n - 1; i2++) {
        var a2 = times[i2] + 0.1, b2 = Math.max(a2 + 0.3, times[i2 + 1] - 0.05);
        if (t < b2 || i2 === n - 2) {
          var p2 = inOutS(prog(t, a2, b2 - a2));
          var c0 = cum[segStart[i2]], c1 = cum[segStart[i2 + 1]];
          return (c0 + (c1 - c0) * (t < a2 ? 0 : p2)) / total;
        }
        if (t < times[i2 + 1] + 0.1) return cum[segStart[i2 + 1]] / total;
      }
      return 1;
    }
    function ptAt(f) {
      var target = f * total, lo = 0, hi = cum.length - 1;
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (cum[mid] < target) lo = mid; else hi = mid; }
      var seg = cum[hi] - cum[lo] || 1, p = clamp((target - cum[lo]) / seg, 0, 1);
      return [lerp(pts[lo][0], pts[hi][0], p), lerp(pts[lo][1], pts[hi][1], p), Math.atan2(pts[hi][1] - pts[lo][1], pts[hi][0] - pts[lo][0])];
    }
    onUpd(function (t) {
      var f = frac(t), on = t >= t0;
      setS(mpath, "strokeDashoffset", f1(total * (1 - f)));
      mk.setAttribute("display", on ? "inline" : "none");
      if (!on) return;
      var p = ptAt(f), ang = style === "air" ? p[2] * 180 / PI : 0, flip = style === "sea" && Math.cos(p[2]) < 0 ? " scale(-1 1)" : "";
      mk.setAttribute("transform", "translate(" + f1(p[0]) + " " + f1(p[1] - (style === "sea" ? ms * 0.2 : 0)) + ") rotate(" + f1(ang) + ")" + flip);
    });
    return {
      at: t0, end: times[n - 1],
      head: function (t) { var p = ptAt(frac(t)); var q = map.local(p[0], p[1]); return { x: q[0], y: q[1] }; },
      frac: frac
    };
  }

  // ------------------------- index cards, pins and string -------------------------
  function indexCard(o) {
    o = obj(o);
    var w = num(o.w, u(400)), h = num(o.h, w * 0.6), seed = num(o.seed, nextSeed()), R = rng(seed);
    var colr = { white: "card", manila: "manila", pink: "pink", blue: "blue" }[str(o.color)] || "card";
    var it = makeItem({ x: o.x, y: o.y, cx: o.cx, cy: o.cy, w: w, h: h, rot: num(o.rot, 0), kind: "card", label: str(o.title), layer: o.layer });
    var pc = paperCanvas(w, h, { kind: colr, seed: seed, res: num(o.res, 2), age: 0.6, creases: false, stain: false });
    placeCanvas(it.el, pc, w, h);
    var lines = arr(o.lines).map(ascii).filter(Boolean), title = ascii(o.title).toUpperCase();
    var ctx = pc.ctx, top = title ? h * 0.31 : h * 0.12, lh = Math.min(h * 0.19, (h - top) / Math.max(2.4, lines.length * 1.6 + 0.6));
    if (colr !== "manila") {
      ctx.strokeStyle = "rgba(170,50,50,0.55)"; ctx.lineWidth = u(1.2); ctx.beginPath(); ctx.moveTo(0, top); ctx.lineTo(w, top); ctx.stroke();
      ctx.strokeStyle = "rgba(70,110,170,0.38)"; ctx.lineWidth = u(0.8);
      for (var y = top + lh; y < h - lh * 0.3; y += lh) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    }
    if (title) {
      var tsz = Math.min(h * 0.17, (w * 0.86) / Math.max(4, title.length * 0.6));
      if (o.typed !== false) typeText(ctx, title, w * 0.07, top - h * 0.07, tsz, R, {});
      else inkText(ctx, title, w * 0.07, top - h * 0.07, tsz, { family: FONT.serif, weight: "bold" });
    }
    var y2 = top + lh * 0.8;
    lines.forEach(function (ln) {
      var f = fitText(ln, lh * 0.95, FONT.hand, w * 0.86, lh * 2.2, { style: "italic", maxLines: 2 });
      f.lines.forEach(function (l2) { if (y2 < h - lh * 0.1) handText(ctx, l2, w * 0.07, y2, f.size, R, { color: "#253060" }); y2 += lh; });
    });
    addKey(it, "card", title, 0, 0, w, h);
    return it;
  }
  // A typed label strip (case titles, year tags). Returns an item.
  function labelStrip(text, o) {
    o = obj(o);
    text = ascii(text).toUpperCase() || "FILE";
    var h = num(o.h, u(70)), sz = h * 0.48, adv0 = typeAdv(sz), w = num(o.w, text.length * adv0 + h * 0.9);
    var maxW = num(o.maxW, W * 0.8);
    if (w > maxW) { sz *= maxW / w; adv0 = typeAdv(sz); w = maxW; }
    var seed = num(o.seed, nextSeed());
    var it = makeItem({ x: o.x, y: o.y, cx: o.cx, cy: o.cy, w: w, h: h, rot: num(o.rot, 0), kind: "label", label: text, layer: o.layer || "front" });
    var pc = paperCanvas(w, h, { kind: o.color === "white" ? "card" : "manila", seed: seed, res: 2, age: 0.5, creases: false, stain: false, edge: "straight" });
    placeCanvas(it.el, pc, w, h);
    typeText(pc.ctx, text, (w - text.length * adv0) / 2, h * 0.66, sz, rng(seed + 1), {});
    addKey(it, "label", text, 0, 0, w, h);
    return it;
  }
  function pin(item, fx, fy, o) {
    o = obj(o);
    if (!item || !item.el) return [0, 0];
    var r = num(o.r, u(13)), cx = item.w * num(fx, 0.5), cy = item.h * num(fy, 0.06), colr = o.color || "#B3261E";
    var pc = mkCanvas(r * 6, r * 6), ctx = pc.getContext("2d");
    ctx.translate(r * 2.6, r * 2.6);
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.filter = "blur(" + f1(r * 0.35) + "px)";
    ctx.beginPath(); ctx.arc(r * 0.6, r * 0.9, r * 1.05, 0, TAU); ctx.fill();
    ctx.filter = "none";
    var g = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
    g.addColorStop(0, "#ffffff"); g.addColorStop(0.25, colr); g.addColorStop(1, "#3a0a08");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
    pc.style.cssText = "position:absolute;left:" + f2(cx - r * 2.6) + "px;top:" + f2(cy - r * 2.6) + "px;width:" + f2(r * 6) + "px;height:" + f2(r * 6) + "px";
    item.el.appendChild(pc);
    return item.local(cx, cy);
  }
  function string(p1, p2, o) {
    o = obj(o);
    var s = ensure();
    p1 = arr(p1); p2 = arr(p2);
    var x1 = num(p1[0], 0), y1 = num(p1[1], 0), x2 = num(p2[0], 0), y2 = num(p2[1], 0);
    var L = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1)), sag = Math.min(u(40), L * 0.06);
    var d = "M" + f1(x1) + " " + f1(y1) + " Q" + f1((x1 + x2) / 2) + " " + f1((y1 + y2) / 2 + sag) + " " + f1(x2) + " " + f1(y2);
    var g = svgEl("g", null, s.wsvg);
    var sh = svgEl("path", { d: d, fill: "none", stroke: "rgba(0,0,0,0.35)", "stroke-width": f2(u(4)), "stroke-linecap": "round", transform: "translate(" + f1(u(3)) + " " + f1(u(5)) + ")" }, g);
    var ln = svgEl("path", { d: d, fill: "none", stroke: o.color || "#B3241C", "stroke-width": f2(u(3.2)), "stroke-linecap": "round" }, g);
    var hl = svgEl("path", { d: d, fill: "none", stroke: "rgba(255,180,160,0.35)", "stroke-width": f2(u(1)), "stroke-linecap": "round", transform: "translate(0 " + f1(-u(0.8)) + ")" }, g);
    var len = L * 1.08 + 4, at = Math.max(0, num(o.at, 0)), dur = Math.max(0.1, num(o.dur, 0.7));
    [sh, ln, hl].forEach(function (p) { p.style.strokeDasharray = f1(len) + " " + f1(len + 10); });
    onUpd(function (t) {
      var p = inOutS(prog(t, at, dur));
      g.setAttribute("display", t >= at ? "inline" : "none");
      var off = f1(len * (1 - p));
      [sh, ln, hl].forEach(function (q) { setS(q, "strokeDashoffset", off); });
    });
    return { el: g, at: at, end: at + dur };
  }

  // ------------------------- handwritten letter -------------------------
  function letter(o) {
    o = obj(o);
    var w = num(o.w, TALL ? W * 0.86 : SQUARE ? W * 0.7 : W * 0.5), h = num(o.h, w * 1.25);
    var seed = num(o.seed, nextSeed()), R = rng(seed);
    var it = makeItem({ x: o.x, y: o.y, cx: o.cx, cy: o.cy, w: w, h: h, rot: num(o.rot, 0), kind: "letter", label: "letter", layer: o.layer });
    var pc = paperCanvas(w, h, { kind: "letter", seed: seed, res: num(o.res, 1.7), age: num(o.age, 1), creases: 2 });
    placeCanvas(it.el, pc, w, h);
    var m = w * 0.1, colr = o.color || "#25305C";
    var text = ascii(o.text), sal = ascii(o.salutation), sign = ascii(o.signoff), sig = ascii(o.signature), date = ascii(o.date), place2 = ascii(o.place);
    // body size: fill the page between salutation and sign-off
    var top = m * 1.2 + (date || place2 ? w * 0.09 : 0), bottom = h - m * 0.9 - (sign || sig ? w * 0.16 : 0);
    var maxW = w - m * 2, start = w * 0.085, lines = [], size, lh;
    function addLine(s2, x, y2, sz, kind) { lines.push({ text: s2, x: x, y: y2, size: sz, kind: kind }); }
    for (var tries = 0; tries < 16; tries++) {
      var fit = fitText(text, start, FONT.hand, maxW, bottom - top - (sal ? w * 0.08 : 0), { style: "italic", lh: 1.5, balance: false, min: w * 0.02 });
      size = fit.size; lh = size * 1.5; lines = [];
      var y = m * 1.1;
      if (place2) { addLine(place2, w - m - textW(place2, size * 0.85, FONT.hand, "italic"), y + size * 0.6, size * 0.85, "meta"); y += size * 1.2; }
      if (date) { addLine(date, w - m - textW(date, size * 0.85, FONT.hand, "italic"), y + size * 0.6, size * 0.85, "meta"); y += size * 1.2; }
      y = Math.max(y + size * 0.4, top);
      if (sal) { addLine(sal, m, y + size, size, "sal"); y += lh * 1.15; }
      fit.lines.forEach(function (ln, i) { addLine(ln, m + (i === 0 ? size * 1.2 : 0), y + size, size, "body"); y += lh; });
      if (sign) { addLine(sign, w * 0.5, y + size * 1.1, size, "sign"); y += lh; }
      if (sig) { addLine(sig, w * 0.56, y + size * 1.25, size * 1.35, "sig"); y += lh; }
      if (y <= h - m * 0.55) break;
      start = size * 0.93;
    }
    // canvases per line; reveal with a soft-edged mask sweep
    lines.forEach(function (ln, i) {
      var lw = textW(ln.text, ln.size, FONT.hand, "italic") + ln.size * 1.2, lc = itemCanvas(it, ln.x - ln.size * 0.3, ln.y - ln.size * 1.15, lw + ln.size * 0.6, ln.size * 1.75, pc.res, "ad-written");
      var res2 = handText(lc.ctx, ln.text, ln.x, ln.y, ln.size, rng(seed + 50 + i), { color: colr });
      ln.el = lc.canvas; ln.w = res2.w; ln.words = res2.words; ln.ex = ln.x - ln.size * 0.3; ln.ew = lw + ln.size * 0.6;
      ln.cy = ln.y - ln.size * 0.35;
      show(lc.canvas, false);
    });
    // timing: body lines from the spoken words, the rest around them
    var a = num(o.writeAt, 0.4), b = Math.max(a + 1, num(o.writeEnd, D - 1.2));
    var body = lines.filter(function (l) { return l.kind === "body"; });
    var wt = wordTimes(text, Math.max(0, a - 0.5));
    var wi = 0, known = 0;
    body.forEach(function (ln) {
      var cnt = ln.text.split(/\s+/).filter(Boolean).length, ts = wt.slice(wi, wi + cnt).filter(function (x) { return x != null; });
      ln.start = ts.length ? ts[0] : null; ln.endW = ts.length ? ts[ts.length - 1] + 0.3 : null;
      if (ts.length) known++;
      wi += cnt;
    });
    var preDur = 0, pre = lines.filter(function (l) { return l.kind === "meta" || l.kind === "sal"; });
    var firstBody = body.length && body[0].start != null ? body[0].start : null;
    var bodyA = firstBody != null ? Math.max(a, Math.min(firstBody, b - 1)) : a + pre.length * 0.5;
    // pre lines written quickly before the body
    var preA = Math.max(0.15, bodyA - pre.length * 0.55);
    pre.forEach(function (ln, i) { ln.start = preA + i * 0.5; ln.dur = 0.5; });
    // body lines: spoken times when known, else spread by characters
    var tot = 0;
    body.forEach(function (ln) { tot += ln.text.length; });
    var bodyEnd = b - (lines.length - body.length - pre.length) * 0.6;
    var cur = bodyA;
    body.forEach(function (ln, i) {
      var share = (bodyEnd - bodyA) * ln.text.length / Math.max(1, tot);
      if (known && ln.start != null) {
        ln.start = Math.max(ln.start, i ? body[i - 1].start + body[i - 1].dur * 0.85 : ln.start);
        var nxt = null;
        for (var j = i + 1; j < body.length; j++) if (body[j].start != null) { nxt = body[j].start; break; }
        ln.dur = Math.max(0.35, Math.min((nxt != null ? nxt : ln.endW || ln.start + share) - ln.start, ln.endW != null ? ln.endW - ln.start + 0.2 : share * 1.4));
      } else { ln.start = cur; ln.dur = share; }
      cur = ln.start + ln.dur;
    });
    var postA = Math.max(cur + 0.15, Math.min(b - 0.9, cur + 0.3));
    lines.filter(function (l) { return l.kind === "sign" || l.kind === "sig"; }).forEach(function (ln, i) { ln.start = postA + i * 0.55; ln.dur = 0.55; });
    // squeeze into [0.15, end]
    var last = 0;
    lines.forEach(function (ln) { if (ln.start == null) { ln.start = cur; ln.dur = 0.4; } last = Math.max(last, ln.start + ln.dur); });
    var lim = Math.max(1, D - 0.9);
    if (last > lim) { var k = (lim - 0.15) / Math.max(0.1, last - 0.15); lines.forEach(function (ln) { ln.start = 0.15 + (ln.start - 0.15) * k; ln.dur *= k; }); last = lim; }
    it.lines = lines;
    it.end = last;
    it.lineCenter = function (i) { var ln = lines[clamp(Math.round(num(i, 0)), 0, lines.length - 1)]; return ln ? it.local(ln.x + ln.w / 2, ln.cy) : it.point(0.5, 0.5); };
    it.pen = function (t) {
      var cur2 = null;
      for (var i2 = 0; i2 < lines.length; i2++) if (t >= lines[i2].start) cur2 = lines[i2];
      if (!cur2) cur2 = lines[0];
      if (!cur2) return { x: it.x, y: it.y, line: 0 };
      var p = prog(t, cur2.start, cur2.dur), q = it.local(cur2.x + cur2.w * p, cur2.y - cur2.size * 0.25);
      return { x: q[0], y: q[1], line: lines.indexOf(cur2), writing: p > 0 && p < 1, lx: cur2.x + cur2.w * p, ly: cur2.y };
    };
    onUpd(function (t) {
      lines.forEach(function (ln) {
        var p = prog(t, ln.start, ln.dur);
        show(ln.el, p > 0);
        if (p <= 0) return;
        if (p >= 1) { setS(ln.el, "webkitMaskImage", "none"); setS(ln.el, "maskImage", "none"); return; }
        var px = ((ln.x - ln.ex) + ln.w * p) / ln.ew * 100, soft = ln.size * 0.6 / ln.ew * 100;
        var mi = "linear-gradient(90deg, #000 " + f1(px) + "%, rgba(0,0,0,0) " + f1(px + soft) + "%)";
        setS(ln.el, "webkitMaskImage", mi); setS(ln.el, "maskImage", mi);
      });
    });
    lines.forEach(function (ln, i) { var nx = lines[i + 2]; addKey(it, "line", ln.text, ln.x, ln.y - ln.size, ln.w, ln.size * 1.3, ln.start, nx ? nx.start : null); });
    return it;
  }

  // ------------------------- ledger -------------------------
  function ledger(o) {
    o = obj(o);
    var w = num(o.w, TALL ? W * 0.88 : SQUARE ? W * 0.8 : W * 0.66), h = num(o.h, TALL ? w * 1.3 : w * 0.66);
    var seed = num(o.seed, nextSeed()), R = rng(seed);
    var it = makeItem({ x: o.x, y: o.y, cx: o.cx, cy: o.cy, w: w, h: h, rot: num(o.rot, 0), kind: "ledger", label: str(o.title) || "ledger", layer: o.layer });
    var pc = paperCanvas(w, h, { kind: "ledger", seed: seed, res: num(o.res, 1.6), age: 1, creases: false });
    placeCanvas(it.el, pc, w, h);
    var ctx = pc.ctx, spread = !TALL && w > h * 1.2;
    var head = h * 0.17, rows = num(o.lines, spread ? 13 : 18), rh = (h - head - h * 0.05) / rows;
    ctx.strokeStyle = "rgba(60,100,150,0.4)"; ctx.lineWidth = u(0.8);
    for (var i = 0; i <= rows; i++) { var yy = head + i * rh; ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(w, yy); ctx.stroke(); }
    ctx.strokeStyle = "rgba(160,40,40,0.5)"; ctx.lineWidth = u(1);
    ctx.beginPath(); ctx.moveTo(0, head - u(3)); ctx.lineTo(w, head - u(3)); ctx.stroke();
    function vline(x) { ctx.beginPath(); ctx.moveTo(x, head * 0.75); ctx.lineTo(x, h); ctx.stroke(); }
    var pages = spread ? [[0, w / 2], [w / 2, w]] : [[0, w]];
    pages.forEach(function (pg) {
      var pw = pg[1] - pg[0];
      vline(pg[0] + pw * 0.08); vline(pg[0] + pw * 0.088);
      vline(pg[0] + pw * 0.7); vline(pg[0] + pw * 0.71); vline(pg[0] + pw * 0.92);
    });
    if (spread) {
      var g = ctx.createLinearGradient(w / 2 - w * 0.04, 0, w / 2 + w * 0.04, 0);
      g.addColorStop(0, "rgba(60,40,20,0)"); g.addColorStop(0.5, "rgba(60,40,20,0.35)"); g.addColorStop(1, "rgba(60,40,20,0)");
      ctx.fillStyle = g; ctx.fillRect(w / 2 - w * 0.04, 0, w * 0.08, h);
    }
    var title = ascii(o.title), year = ascii(o.year);
    var tp = pages[0], tw = (tp[1] - tp[0]);
    if (title) { var tf = fitText(title, head * 0.42, FONT.hand, tw * (year && !spread ? 0.5 : 0.82), head * 0.6, { style: "italic", maxLines: 1 }); handText(ctx, tf.lines.join(" "), tp[0] + tw * 0.1, head * 0.62, tf.size, R, { color: "#1E2A50" }); }
    if (year) { var yp = pages[pages.length - 1]; handText(ctx, year, yp[1] - (yp[1] - yp[0]) * 0.08 - textW(year, head * 0.32, FONT.hand, "italic"), head * 0.62, head * 0.32, R, { color: INK.red }); }
    it.rowH = rh; it.head = head; it.pages = pages; it.spread = spread; it.rows = rows;
    it.rowY = function (line) { return head + (num(line, 0) + 0.78) * rh; };
    // a written entry on ruled line `line`: label left, value right, written at `at`
    it.row = function (line, label, value, at, ro) {
      ro = obj(ro);
      var pg = pages[ro.page != null ? clamp(ro.page, 0, pages.length - 1) : pages.length - 1], pw = pg[1] - pg[0];
      var y = it.rowY(line), sz = rh * 0.62;
      var lab = ascii(label), val = value == null ? "" : typeof value === "number" ? (ro.prefix || "") + V.format(value, ro.decimals || 0) + (ro.suffix || "") : ascii(value);
      var lf = fitText(lab, sz, FONT.hand, pw * 0.58, sz * 1.2, { style: "italic", maxLines: 1 });
      var lx = pg[0] + pw * 0.1, vx = pg[0] + pw * 0.9, lw = textW(lf.lines.join(" "), lf.size, FONT.hand, "italic") + sz, vw = textW(val, sz, FONT.hand, "italic") + sz;
      var ent = [];
      [[lab ? lf.lines.join(" ") : "", lx, lf.size, false], [val, vx - vw + sz * 0.5, sz, true]].forEach(function (e, k) {
        if (!e[0]) return;
        var ww = textW(e[0], e[2], FONT.hand, "italic") + e[2];
        var lc = itemCanvas(it, e[1] - e[2] * 0.3, y - e[2] * 1.1, ww + e[2] * 0.6, e[2] * 1.6, pc.res, "ad-written");
        handText(lc.ctx, e[0], e[1], y, e[2], rng(seed + line * 7 + k), { color: e[3] ? "#141E40" : "#25305C" });
        if (e[3] && ro.total) { lc.ctx.strokeStyle = "#141E40"; lc.ctx.lineWidth = u(1); [0.25, 0.4].forEach(function (q) { lc.ctx.beginPath(); lc.ctx.moveTo(e[1], y + e[2] * q); lc.ctx.lineTo(e[1] + ww - e[2], y + e[2] * q); lc.ctx.stroke(); }); }
        ent.push({ el: lc.canvas, start: num(at, 1) + k * 0.35, dur: 0.55 });
        show(lc.canvas, false);
      });
      onUpd(function (t) { ent.forEach(function (e) { var p = prog(t, e.start, e.dur); show(e.el, p > 0); if (p > 0) setS(e.el, "clipPath", p >= 1 ? "none" : "inset(0 " + f1((1 - p) * 100) + "% 0 0)"); }); });
      addKey(it, "row", lab, lx, y - sz, pw * 0.82, sz * 1.4, num(at, 1));
      return { y: y, at: num(at, 1), end: num(at, 1) + 0.9, rect: function () { return it.sub(pg[0] + pw * 0.06, y - sz * 1.2, pw * 0.88, sz * 1.8); } };
    };
    // a big counted figure on the first page
    it.figure = function (value, at, dur, fo) {
      fo = obj(fo);
      var pg = pages[0], pw = pg[1] - pg[0], fyc = num(fo.fy, spread ? 0.5 : 0.3);
      var v = num(value, 0), dec = num(fo.decimals, 0), pre = ascii(fo.prefix), suf = ascii(fo.suffix);
      var full = pre + V.format(v, dec) + suf;
      var maxW = pw * 0.8, sz = Math.min(h * (spread ? 0.2 : 0.11), maxW / Math.max(1, textW(full, 100, FONT.serif, "italic", "bold") / 100));
      var bw = textW(full, sz, FONT.serif, "italic", "bold") + sz * 0.4, bh = sz * 1.3;
      var cx = pg[0] + pw / 2, cy = h * fyc;
      var fc = itemCanvas(it, cx - bw / 2, cy - bh * 0.72, bw, bh, pc.res * 1.2, "ad-figure"), fctx = fc.ctx, last = null;
      var a = num(at, 0.5), d = Math.max(0.2, num(dur, 1.4));
      function draw(sv) {
        fctx.save(); fctx.setTransform(1, 0, 0, 1, 0, 0); fctx.clearRect(0, 0, fc.canvas.width, fc.canvas.height); fctx.restore();
        fctx.save();
        fctx.font = fontStr(sz, FONT.serif, "italic", "bold"); fctx.textAlign = "center"; fctx.textBaseline = "alphabetic";
        fctx.fillStyle = "#16203F"; fctx.globalAlpha = 0.3; fctx.fillText(sv, cx + sz * 0.015, cy + sz * 0.33);
        fctx.globalAlpha = 0.9; fctx.fillText(sv, cx, cy + sz * 0.32);
        fctx.restore();
      }
      onUpd(function (t) {
        show(fc.canvas, t >= a);
        if (t < a) return;
        var p = prog(t, a, d), e = 1 - Math.pow(1 - p, 3), sv = pre + V.format(v * e, p >= 1 ? dec : dec) + suf;
        if (sv !== last) { draw(sv); last = sv; }
      });
      addKey(it, "figure", full, cx - bw / 2, cy - bh * 0.72, bw, bh, a);
      return { at: a, end: a + d, cx: cx, cy: cy, w: bw, h: bh, rect: function () { return it.sub(cx - bw / 2, cy - bh * 0.6, bw, bh); } };
    };
    it.source = function (txt, at) {
      txt = ascii(txt);
      if (!txt) return null;
      var pg = pages[pages.length - 1], pw = pg[1] - pg[0], sz = rh * 0.42, y = h - h * 0.035;
      var lc = itemCanvas(it, pg[0] + pw * 0.08, y - sz * 1.2, pw * 0.86, sz * 1.6, pc.res, "ad-written");
      inkText(lc.ctx, txt, pg[0] + pw * 0.9, y, sz, { family: FONT.serif, style: "italic", align: "right", color: "rgba(60,55,50,0.85)" });
      show(lc.canvas, false);
      var a = num(at, 1);
      onUpd(function (t) { var p = prog(t, a, 0.6); show(lc.canvas, p > 0); if (p > 0) setS(lc.canvas, "opacity", String(f3(p))); });
      return { at: a };
    };
    return it;
  }
  // Red ink circle drawn around a part of an item (fx, fy centre, fw, fh size as fractions of the item).
  function inkCircle(item, fx, fy, fw, fh, at, o) {
    o = obj(o);
    if (!item || !item.el) return null;
    var cx = item.w * num(fx, 0.5), cy = item.h * num(fy, 0.5), rx = item.w * num(fw, 0.3) / 2 * 1.12, ry = item.h * num(fh, 0.2) / 2 * 1.18;
    var R = rng(num(o.seed, nextSeed())), pts = [], a0 = -PI * 0.6 + (R() - 0.5) * 0.4;
    for (var i = 0; i <= 70; i++) {
      var p = i / 70, a = a0 + p * TAU * 1.12, q = 1 + Math.sin(p * 9 + R()) * 0.02 + p * 0.06;
      pts.push([cx + Math.cos(a) * rx * q, cy + Math.sin(a) * ry * q]);
    }
    var d = pts.map(function (pt, i) { return (i ? "L" : "M") + f1(pt[0]) + " " + f1(pt[1]); }).join("");
    var sv = itemSvg(item);
    var path = svgEl("path", { d: d, fill: "none", stroke: o.color || "#A3261E", "stroke-width": f2(num(o.width, u(4.5))), "stroke-linecap": "round", "stroke-linejoin": "round", opacity: "0.85" }, sv);
    var len = 0;
    for (var j = 1; j < pts.length; j++) len += Math.sqrt(Math.pow(pts[j][0] - pts[j - 1][0], 2) + Math.pow(pts[j][1] - pts[j - 1][1], 2));
    len += 4;
    path.style.strokeDasharray = f1(len) + " " + f1(len + 10);
    var t0 = Math.max(0, num(at, 1)), dur = num(o.dur, 0.6);
    onUpd(function (t) {
      var p = prog(t, t0, dur);
      path.setAttribute("display", p > 0 ? "inline" : "none");
      setS(path, "strokeDashoffset", f1(len * (1 - inOutS(p))));
    });
    return { el: path, at: t0, end: t0 + dur };
  }

  // ------------------------- film strip -------------------------
  function filmstrip(o) {
    o = obj(o);
    var frames = arr(o.frames).map(obj);
    if (!frames.length) frames = [{ subject: "street" }, { subject: "crowd" }, { subject: "city" }];
    var vertical = !!o.vertical, n = frames.length;
    var fw = num(o.frameW, u(560)), fh = fw / 1.5;
    // "along" runs down the strip, "across" from edge to edge; frames are always drawn upright
    var across = vertical ? fw * 1.34 : fh * 1.42, fAlong = vertical ? fh : fw, fAcross = vertical ? fw : fh, gap = fAlong * (vertical ? 0.1 : 0.07);
    var len = n * (fAlong + gap) + gap * 4;
    var w = vertical ? across : len, h = vertical ? len : across;
    var seed = num(o.seed, nextSeed());
    var it = makeItem({ x: o.x, y: o.y, cx: o.cx, cy: o.cy, w: w, h: h, rot: num(o.rot, 0), kind: "filmstrip", label: "film", layer: o.layer });
    var res = resFor(w, h, num(o.res, 1.6));
    var c = mkCanvas(w * res, h * res, "ad-film-strip"), ctx = c.getContext("2d");
    ctx.setTransform(res, 0, 0, res, 0, 0);
    function R2(al, ac, wl, wc) { return vertical ? [ac, al, wc, wl] : [al, ac, wl, wc]; }
    var base = vertical ? ctx.createLinearGradient(0, 0, w, 0) : ctx.createLinearGradient(0, 0, 0, h);
    base.addColorStop(0, "rgba(28,20,14,0.94)"); base.addColorStop(0.5, "rgba(40,28,18,0.9)"); base.addColorStop(1, "rgba(28,20,14,0.94)");
    ctx.fillStyle = base; ctx.fillRect(0, 0, w, h);
    var margin = (across - fAcross) / 2, hw = margin * 0.34, hl = margin * 0.42, step = fAlong / 4.4;
    ctx.fillStyle = "rgba(250,244,228,0.92)";
    for (var al = gap; al < len - hl; al += step) {
      [margin * 0.3, across - margin * 0.3 - hw].forEach(function (ac) { var r = R2(al, ac, hl, hw); roundRect(ctx, r[0], r[1], r[2], r[3], Math.min(hw, hl) * 0.25); ctx.fill(); });
    }
    var rects = [];
    frames.forEach(function (f, i) {
      var r = R2(gap * 2 + i * (fAlong + gap), margin, fAlong, fAcross);
      var fr = { x: r[0], y: r[1], w: r[2], h: r[3] };
      var img = photoImage(subjectId(f.subject) || "street", toneId(o.tone || f.tone) || "silver", fr.w * res, fr.h * res, seed + 20 + i, { damage: 0.6 });
      ctx.drawImage(img.canvas, fr.x, fr.y, fr.w, fr.h);
      var g = ctx.createRadialGradient(fr.x + fr.w / 2, fr.y + fr.h / 2, Math.min(fr.w, fr.h) * 0.3, fr.x + fr.w / 2, fr.y + fr.h / 2, Math.max(fr.w, fr.h) * 0.7);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.35)");
      ctx.fillStyle = g; ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
      // edge print: frame number and an arrow along the strip
      ctx.save();
      var ep = R2(gap * 2 + i * (fAlong + gap) + fAlong * 0.08, across - margin * 0.08, 0, 0);
      ctx.translate(ep[0], ep[1]);
      if (vertical) ctx.rotate(-PI / 2);
      ctx.fillStyle = "rgba(230,170,90,0.75)";
      ctx.font = fontStr(Math.min(margin * 0.36, u(22)), FONT.type, null, "bold");
      ctx.fillText(String(i + 12) + "A", vertical ? -margin * 0.95 : 0, vertical ? margin * 0.2 : -margin * 0.06);
      ctx.restore();
      rects.push(fr);
    });
    ctx.save();
    var tp = R2(gap * 2 + fAlong * 0.55, margin * 0.75, 0, 0);
    ctx.translate(tp[0], tp[1]);
    if (vertical) ctx.rotate(PI / 2);
    ctx.fillStyle = "rgba(230,170,90,0.6)"; ctx.font = fontStr(Math.min(margin * 0.3, u(18)), FONT.type, null, "bold");
    ctx.fillText("ARCHIVE SAFETY STOCK", 0, vertical ? 0 : 0);
    ctx.restore();
    c.style.cssText = "position:absolute;left:0;top:0;width:" + f2(w) + "px;height:" + f2(h) + "px";
    it.el.appendChild(c);
    it.frames = frames;
    it.frameLocal = function (i) { return rects[clamp(Math.round(num(i, 0)), 0, n - 1)]; };
    it.frameRect = function (i) { var r = it.frameLocal(i); return it.sub(r.x, r.y, r.w, r.h); };
    it.frameCenter = function (i) { var r = it.frameLocal(i); return it.local(r.x + r.w / 2, r.y + r.h / 2); };
    it.vertical = vertical;
    return it;
  }

  // ------------------------- desk props -------------------------
  function propItem(w, h, o, kind, paint, res) {
    o = obj(o);
    var it = makeItem({ x: o.x, y: o.y, cx: o.cx, cy: o.cy, w: w, h: h, rot: num(o.rot, 0), kind: kind, label: kind, layer: o.layer || "back" });
    var pad = Math.max(w, h) * 0.2, r = resFor(w + pad * 2, h + pad * 2, res || 1.2);
    var c = mkCanvas((w + pad * 2) * r, (h + pad * 2) * r), ctx = c.getContext("2d");
    ctx.setTransform(r, 0, 0, r, pad * r, pad * r);
    paint(ctx, w, h, rng(num(o.seed, nextSeed())), r);
    c.style.cssText = "position:absolute;left:" + f2(-pad) + "px;top:" + f2(-pad) + "px;width:" + f2(w + pad * 2) + "px;height:" + f2(h + pad * 2) + "px";
    it.el.appendChild(c);
    return it;
  }
  function envelope(o) {
    o = obj(o);
    var w = num(o.w, u(520)), h = w * 0.58, seed = num(o.seed, nextSeed());
    var it = makeItem({ x: o.x, y: o.y, cx: o.cx, cy: o.cy, w: w, h: h, rot: num(o.rot, 0), kind: "envelope", label: "envelope", layer: o.layer || "back" });
    var pc = paperCanvas(w, h, { kind: o.kraft ? "kraft" : "letter", seed: seed, res: 1.2, age: 1, creases: 1 });
    placeCanvas(it.el, pc, w, h);
    var ctx = pc.ctx, R = pc.R;
    ctx.strokeStyle = "rgba(90,60,30,0.3)"; ctx.lineWidth = u(1.2);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w * 0.5, h * 0.55); ctx.lineTo(w, 0); ctx.stroke();
    // postage stamp (invented design) and postmark
    var sx = w * 0.8, sy = h * 0.08, sw = w * 0.13, shh = sw * 1.2;
    ctx.fillStyle = "#EFE6D0"; ctx.fillRect(sx, sy, sw, shh);
    ctx.fillStyle = "#6A2A2A"; ctx.fillRect(sx + sw * 0.1, sy + sw * 0.1, sw * 0.8, shh - sw * 0.2);
    ctx.fillStyle = "#EFE6D0"; ell(ctx, sx + sw / 2, sy + shh * 0.45, sw * 0.26, sw * 0.3); ctx.fill();
    inkText(ctx, "3", sx + sw * 0.5, sy + shh * 0.86, sw * 0.25, { family: FONT.serif, weight: "bold", align: "center", color: "#EFE6D0", bleed: false });
    ctx.fillStyle = "#EFE6D0";
    for (var p = 0; p < 9; p++) { ctx.beginPath(); ctx.arc(sx + p * sw / 8, sy, u(2), 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(sx + p * sw / 8, sy + shh, u(2), 0, TAU); ctx.fill(); }
    ctx.strokeStyle = "rgba(30,30,40,0.6)"; ctx.lineWidth = u(1.4);
    ctx.beginPath(); ctx.arc(sx - sw * 0.25, sy + shh * 0.55, sw * 0.42, 0, TAU); ctx.stroke();
    for (var wv = 0; wv < 4; wv++) { ctx.beginPath(); for (var q = 0; q <= 20; q++) { var xx = sx - sw * 0.1 + q * sw * 0.07, yy = sy + shh * (0.3 + wv * 0.14) + Math.sin(q * 1.2) * u(2); if (q) ctx.lineTo(xx, yy); else ctx.moveTo(xx, yy); } ctx.stroke(); }
    var R2 = rng(seed + 4);
    ["Miss E. Halloran", "14 Larkmere Row", "Ashby Cross"].forEach(function (ln, i) { handText(ctx, ln, w * 0.32, h * (0.55 + i * 0.12), h * 0.075, R2, { color: "#28305a" }); });
    return it;
  }
  function loupe(o) {
    o = obj(o);
    var r = num(o.r, u(150));
    return propItem(r * 2, r * 2, o, "loupe", function (ctx, w, h) {
      var cx = w / 2, cy = h / 2;
      ctx.save(); ctx.filter = "blur(" + f1(r * 0.08) + "px)"; ctx.strokeStyle = "rgba(0,0,0,0.45)"; ctx.lineWidth = r * 0.1; ctx.beginPath(); ctx.arc(cx + r * 0.08, cy + r * 0.12, r * 0.92, 0, TAU); ctx.stroke(); ctx.restore();
      var g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, "#D9B46A"); g.addColorStop(0.35, "#8A6428"); g.addColorStop(0.7, "#4A3212"); g.addColorStop(1, "#B48A44");
      ctx.strokeStyle = g; ctx.lineWidth = r * 0.075; ctx.beginPath(); ctx.arc(cx, cy, r * 0.92, 0, TAU); ctx.stroke();
      ctx.strokeStyle = "rgba(20,12,4,0.5)"; ctx.lineWidth = r * 0.02; ctx.beginPath(); ctx.arc(cx, cy, r * 0.885, 0, TAU); ctx.stroke();
      ctx.strokeStyle = "rgba(255,250,235,0.25)"; ctx.lineWidth = u(1.5); ctx.beginPath(); ctx.arc(cx, cy, r * 0.87, 0, TAU); ctx.stroke();
      var hg = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, 0, cx - r * 0.35, cy - r * 0.4, r * 0.7);
      hg.addColorStop(0, "rgba(255,255,255,0.22)"); hg.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(cx, cy, r * 0.84, 0, TAU); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.25)"; ctx.lineWidth = r * 0.03; ctx.beginPath(); ctx.arc(cx, cy, r * 0.7, PI * 1.1, PI * 1.45); ctx.stroke();
    }, 1.4);
  }
  function pen(o) {
    o = obj(o);
    var L = num(o.length, u(520)), th = L * 0.075;
    return propItem(L, th, o, "pen", function (ctx, w, h) {
      ctx.save(); ctx.filter = "blur(" + f1(th * 0.3) + "px)"; ctx.fillStyle = "rgba(0,0,0,0.5)"; roundRect(ctx, w * 0.04, h * 0.4, w * 0.92, h * 0.9, h * 0.45); ctx.fill(); ctx.restore();
      var g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#4a4038"); g.addColorStop(0.35, "#141210"); g.addColorStop(1, "#060505");
      ctx.fillStyle = g; roundRect(ctx, w * 0.16, 0, w * 0.84, h, h * 0.45); ctx.fill();
      ctx.fillStyle = "#C8963E"; ctx.fillRect(w * 0.58, 0, w * 0.03, h); ctx.fillRect(w * 0.9, h * 0.15, w * 0.06, h * 0.12);
      var ng = ctx.createLinearGradient(0, 0, 0, h); ng.addColorStop(0, "#F0D490"); ng.addColorStop(1, "#8A6020");
      ctx.fillStyle = ng; poly(ctx, [[w * 0.17, h * 0.12], [0, h * 0.5], [w * 0.17, h * 0.88]]); ctx.fill();
      ctx.strokeStyle = "rgba(40,25,5,0.8)"; ctx.lineWidth = u(0.8); ctx.beginPath(); ctx.moveTo(w * 0.02, h * 0.5); ctx.lineTo(w * 0.12, h * 0.5); ctx.stroke();
    }, 1.4);
  }
  function stain(o) {
    o = obj(o);
    var r = num(o.r, u(110));
    return propItem(r * 2, r * 2, o, "stain", function (ctx, w, h, R) { ringStain(ctx, w / 2, h / 2, r, R, { alpha: 0.4, color: "#3a2410" }); }, 1);
  }
  function tape(o) {
    o = obj(o);
    var w = num(o.w, u(150)), h = num(o.h, w * 0.3), R = rng(num(o.seed, nextSeed()));
    var par = o.parent && o.parent.el ? o.parent.el : null;
    var c = mkCanvas((w + 10) * 1.5, (h + 10) * 1.5), ctx = c.getContext("2d");
    ctx.setTransform(1.5, 0, 0, 1.5, 7.5, 7.5);
    var pts = [];
    for (var i = 0; i <= 6; i++) pts.push([i / 6 * w, (R() - 0.5) * h * 0.08]);
    for (i = 0; i <= 6; i++) pts.push([w + (R() - 0.5) * h * 0.2, i / 6 * h]);
    for (i = 6; i >= 0; i--) pts.push([i / 6 * w, h + (R() - 0.5) * h * 0.08]);
    for (i = 6; i >= 0; i--) pts.push([(R() - 0.5) * h * 0.2, i / 6 * h]);
    ctx.fillStyle = o.clear ? "rgba(235,235,225,0.32)" : "rgba(222,206,160,0.72)";
    poly(ctx, pts); ctx.fill();
    ctx.globalCompositeOperation = "source-atop";
    mottle(ctx, 0, 0, w, h, R, { alpha: 0.3, color: "#6a5020" });
    ctx.globalCompositeOperation = "source-over";
    var x = num(o.x, 0), y = num(o.y, 0), rot = num(o.rot, 0);
    c.style.cssText = "position:absolute;left:" + f2(x - w / 2 - 5) + "px;top:" + f2(y - h / 2 - 5) + "px;width:" + f2(w + 10) + "px;height:" + f2(h + 10) + "px;transform:rotate(" + f2(rot) + "deg)";
    if (par) { par.appendChild(c); return { el: c }; }
    var it = makeItem({ cx: x, cy: y, w: w + 10, h: h + 10, rot: rot, kind: "tape", layer: o.layer || "top" });
    c.style.left = "0px"; c.style.top = "0px"; c.style.transform = "none";
    it.el.appendChild(c);
    return it;
  }
  function paperclip(o) {
    o = obj(o);
    var L = num(o.length, u(120)), wd = L * 0.32;
    return propItem(wd, L, o, "paperclip", function (ctx, w, h) {
      var g = ctx.createLinearGradient(0, 0, w, 0); g.addColorStop(0, "#9aa0a6"); g.addColorStop(0.5, "#e8ecef"); g.addColorStop(1, "#70767c");
      ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = u(3.4);
      function clip(dx, dy) {
        ctx.beginPath(); ctx.moveTo(w * 0.7 + dx, h * 0.25 + dy); ctx.lineTo(w * 0.7 + dx, h * 0.85 + dy); ctx.arc(w * 0.5 + dx, h * 0.85 + dy, w * 0.2, 0, PI); ctx.lineTo(w * 0.3 + dx, h * 0.15 + dy); ctx.arc(w * 0.55 + dx, h * 0.15 + dy, w * 0.25, PI, 0); ctx.lineTo(w * 0.8 + dx, h * 0.75 + dy); ctx.stroke();
      }
      clip(u(2), u(3)); ctx.strokeStyle = g; ctx.lineWidth = u(2.6); clip(0, 0);
    }, 1.6);
  }
  var CLUTTER_SUBJ = ["street", "city", "building", "landscape", "bridge", "train", "factory", "ship"];
  // Scatter old prints and papers on the desk around a world rect (they stay outside it).
  function clutter(rect, o) {
    o = obj(o);
    var s = ensure(), b = rect && rect.w != null ? rect : { x: s.worldW * 0.3, y: s.worldH * 0.3, w: s.worldW * 0.4, h: s.worldH * 0.4 };
    var R = rng(num(o.seed, 555)), out = [], n = num(o.count, 4);
    var mx = s.worldW * 0.04;
    var spots = TALL
      ? [[b.x + b.w * 0.15, b.y - u(230)], [b.x + b.w * 0.85, b.y + b.h + u(200)], [b.x - u(120), b.y + b.h * 0.55], [b.x + b.w + u(120), b.y + b.h * 0.3], [b.x + b.w * 0.6, b.y - u(180)]]
      : [[b.x - u(240), b.y + b.h * 0.2], [b.x + b.w + u(250), b.y + b.h * 0.75], [b.x + b.w * 0.3, b.y + b.h + u(170)], [b.x + b.w + u(200), b.y + b.h * 0.1], [b.x - u(200), b.y + b.h * 0.9]];
    var kinds = arr(o.kinds).length ? arr(o.kinds) : ["photo", "letter", "pen", "envelope", "paperclip"];
    for (var i = 0; i < Math.min(n, spots.length); i++) {
      var k = kinds[i % kinds.length], sp = spots[i], rot = (R() - 0.5) * 30;
      if (k === "photo") out.push(photo({ subject: CLUTTER_SUBJ[Math.floor(R() * CLUTTER_SUBJ.length)], tone: o.tone || "sepia", cx: sp[0], cy: sp[1], w: u(380), rot: rot, res: 0.8, layer: "back", mounts: false, damage: 1.2, seed: 9000 + i }));
      else if (k === "letter") { var l = documentItem({ cx: sp[0], cy: sp[1], w: u(420), rot: rot, layer: "back", paper: "letter", body: "Received your note of the ninth and have forwarded the papers as asked. More when I hear from the others.", typeAt: 0, typeEnd: 0.05, res: 0.7, seed: 9100 + i, cpl: 40 }); out.push(l); }
      else if (k === "pen") out.push(pen({ cx: sp[0], cy: sp[1], rot: rot * 3 }));
      else if (k === "envelope") out.push(envelope({ cx: sp[0], cy: sp[1], rot: rot, seed: 9200 + i }));
      else if (k === "paperclip") out.push(paperclip({ cx: sp[0], cy: sp[1], rot: rot * 2 }));
      else if (k === "loupe") out.push(loupe({ cx: sp[0], cy: sp[1] }));
    }
    out.forEach(function (it) { it.clutter = true; });
    return out;
  }
  // Printed text on a canvas inside an element or item. Returns { el, w, h, lines, size }.
  function textCanvas(parent, text, o) {
    o = obj(o);
    var fam = FONT[o.font] || o.font || FONT.serif, size = num(o.size, u(28)), width = num(o.width, u(500));
    var f = fitText(text, size, fam, width, num(o.maxH, size * 1.3 * num(o.maxLines, 6)), { style: o.style, weight: o.weight, maxLines: num(o.maxLines, 6), lh: num(o.lh, 1.25) });
    var hgt = f.size * (1 + (f.lines.length - 1) * num(o.lh, 1.25)) + f.size * 0.5;
    var res = num(o.res, 2), c = mkCanvas(width * res, hgt * res, "ad-text"), ctx = c.getContext("2d");
    ctx.setTransform(res, 0, 0, res, 0, 0);
    var align = o.align || "left", x = align === "center" ? width / 2 : align === "right" ? width : 0;
    f.lines.forEach(function (ln, i) { inkText(ctx, ln, x, f.size * (1 + i * num(o.lh, 1.25)), f.size, { family: fam, style: o.style, weight: o.weight, align: align, color: o.color || C.ink }); });
    c.style.cssText = "position:absolute;left:" + f2(num(o.x, 0)) + "px;top:" + f2(num(o.y, 0)) + "px;width:" + f2(width) + "px;height:" + f2(hgt) + "px";
    var par = parent && parent.el ? parent.el : parent && parent.nodeType ? parent : ensure().layers.top;
    par.appendChild(c);
    return { el: c, w: width, h: hgt, lines: f.lines, size: f.size };
  }

  // ------------------------- screen overlays -------------------------
  function overBox(kind, label, el, from, to, fn) { ensure().boxes.push({ kind: kind, label: label, el: el, from: from, to: to, fn: fn }); }
  function lowerThird(title, o) {
    o = obj(o);
    var s = ensure(), sf = safe(), at = Math.max(0, num(o.at, 0.8)), end = o.end != null ? num(o.end, D) : D + 1;
    title = ascii(title); var sub = ascii(o.sub), kick = ascii(o.kicker).toUpperCase();
    if (!title && !sub) return null;
    var align = o.align === "center" || o.align === "right" ? o.align : "left";
    var maxW = sf.w - u(20), ts = num(o.size, TALL ? u(62) : u(56)), ss = ts * 0.52;
    var tf = fitText(title, ts, FONT.serif, maxW, ts * 2.4, { style: "normal small-caps", maxLines: 2, lh: 1.05 });
    var sfit = fitText(sub, ss, FONT.serif, maxW, ss * 2.5, { style: "italic", maxLines: 2, lh: 1.2 });
    var tw = 0; tf.lines.forEach(function (l) { tw = Math.max(tw, textW(l, tf.size, FONT.serif, "normal small-caps")); });
    var sw = 0; sfit.lines.forEach(function (l) { sw = Math.max(sw, textW(l, sfit.size, FONT.serif, "italic")); });
    var bw = Math.max(tw, sw, u(120)), kh = kick ? u(30) : 0;
    var bh = kh + u(14) + tf.size * (1 + (tf.lines.length - 1) * 1.05) + (sub ? u(10) + sfit.size * (1.15 + (sfit.lines.length - 1) * 1.2) : 0);
    var x0 = align === "left" ? sf.x0 + u(10) : align === "right" ? sf.x1 - u(10) - bw : sf.cx - bw / 2, y0 = sf.y1 - u(14) - bh;
    var wrap = div("ad-lt", s.overEl, "position:absolute;left:0;top:0;width:" + W + "px;height:" + H + "px");
    var scrim = div("ad-scrim", wrap, "position:absolute;left:" + f1(x0 - u(160)) + "px;top:" + f1(y0 - u(120)) + "px;width:" + f1(bw + u(420)) + "px;height:" + f1(bh + u(240)) + "px;background:radial-gradient(ellipse at " + (align === "left" ? "30%" : align === "right" ? "70%" : "50%") + " 55%, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.38) 45%, rgba(0,0,0,0) 72%)");
    var box = div("ad-lt-box", wrap, "position:absolute;left:" + f1(x0) + "px;top:" + f1(y0) + "px;width:" + f1(bw) + "px;text-align:" + align);
    var kEl = null;
    if (kick) kEl = div("ad-lt-kick", box, "font:bold " + f1(u(20)) + "px " + FONT.type + ";letter-spacing:" + f1(u(5)) + "px;color:#C8963E;height:" + f1(kh) + "px;white-space:nowrap");
    if (kEl) kEl.textContent = kick;
    var rule = div("ad-lt-rule", box, "height:" + f1(u(3)) + "px;width:" + f1(Math.min(bw, tw + u(40))) + "px;background:#C8963E;margin:" + (align === "center" ? "0 auto " : align === "right" ? "0 0 0 auto;margin-bottom:" : "0 0 ") + f1(u(11)) + "px");
    if (align === "right") rule.style.marginLeft = "auto";
    var tEl = div("ad-lt-title", box, "font:normal small-caps normal " + f1(tf.size) + "px " + FONT.serif + ";line-height:1.05;color:#EDE3D0;white-space:nowrap;text-shadow:0 2px 10px rgba(0,0,0,0.75)");
    tf.lines.forEach(function (l, i) { if (i) tEl.appendChild(doc.createElement("br")); tEl.appendChild(doc.createTextNode(l)); });
    var sEl = null;
    if (sub) {
      sEl = div("ad-lt-sub", box, "margin-top:" + f1(u(10)) + "px;font:italic " + f1(sfit.size) + "px " + FONT.serif + ";line-height:1.2;color:#D6C9AE;white-space:nowrap;text-shadow:0 2px 8px rgba(0,0,0,0.8)");
      sfit.lines.forEach(function (l, i) { if (i) sEl.appendChild(doc.createElement("br")); sEl.appendChild(doc.createTextNode(l)); });
    }
    show(wrap, false);
    onUpd(function (t) {
      var on = t >= at && t < end + 0.6;
      show(wrap, on);
      if (!on) return;
      var out = 1 - smooth(prog(t, end, 0.5));
      setS(scrim, "opacity", String(f3(smooth(prog(t, at, 0.8)) * out)));
      setS(rule, "clipPath", "inset(0 " + f1((1 - outC(prog(t, at, 0.7))) * 100) + "% 0 0)");
      setS(rule, "opacity", String(f3(out)));
      if (kEl) setS(kEl, "opacity", String(f3(smooth(prog(t, at, 0.5)) * out)));
      var pt = prog(t, at + 0.15, 0.7);
      setS(tEl, "opacity", String(f3(smooth(pt) * out)));
      setS(tEl, "transform", "translateY(" + f1((1 - outC(pt)) * u(10)) + "px)");
      if (sEl) { var ps = prog(t, at + 0.45, 0.7); setS(sEl, "opacity", String(f3(smooth(ps) * out))); setS(sEl, "transform", "translateY(" + f1((1 - outC(ps)) * u(8)) + "px)"); }
    }, 10);
    overBox("lowerthird", title || sub, box, at, end, function (t) { return { x: x0, y: y0, w: bw, h: bh, moving: t < at + 1.15 || (t > end && t < end + 0.5) }; });
    return { el: wrap, at: at, end: end, rect: { x: x0, y: y0, w: bw, h: bh } };
  }
  function dateStamp(text, o) {
    o = obj(o);
    var s = ensure(), sf = safe(), at = Math.max(0, num(o.at, 0.4)), end = o.end != null ? num(o.end, D) : D + 1;
    text = ascii(text).toUpperCase(); var sub = ascii(o.sub).toUpperCase();
    if (!text) return null;
    var pos = ["tl", "tr", "bl", "br"].indexOf(o.pos) >= 0 ? o.pos : "tl";
    var size = num(o.size, TALL ? u(32) : u(28)), adv = textW("M", size, FONT.type, null, "bold") + size * 0.08;
    var maxC = Math.floor((sf.w * 0.6) / adv);
    if (text.length > maxC) size *= maxC / text.length, adv = textW("M", size, FONT.type, null, "bold") + size * 0.08;
    var ss = size * 0.8, sadv = textW("M", ss, FONT.type, null, "bold") + ss * 0.08;
    var bw = Math.max(text.length * adv, sub.length * sadv), bh = size * 1.25 + (sub ? ss * 1.4 : 0);
    var x0 = pos[1] === "l" ? sf.x0 + u(10) : sf.x1 - u(10) - bw, y0 = pos[0] === "t" ? sf.y0 + u(10) : sf.y1 - u(10) - bh;
    var box = div("ad-ds", s.overEl, "position:absolute;left:" + f1(x0) + "px;top:" + f1(y0) + "px;width:" + f1(bw + 4) + "px;text-align:" + (pos[1] === "l" ? "left" : "right"));
    var l1 = div("ad-ds-1", box, "font:bold " + f1(size) + "px " + FONT.type + ";letter-spacing:" + f2(size * 0.08) + "px;color:#EDE3D0;white-space:pre;height:" + f1(size * 1.25) + "px;text-shadow:0 1px 6px rgba(0,0,0,0.9)");
    l1.textContent = text;
    var l2 = null;
    if (sub) { l2 = div("ad-ds-2", box, "font:bold " + f1(ss) + "px " + FONT.type + ";letter-spacing:" + f2(ss * 0.08) + "px;color:#D9AE5E;white-space:pre;text-shadow:0 1px 6px rgba(0,0,0,0.95)"); l2.textContent = sub; }
    var d1 = Math.min(1.2, text.length * 0.05), d2 = sub ? Math.min(1, sub.length * 0.04) : 0;
    show(box, false);
    onUpd(function (t) {
      var on = t >= at && t < end + 0.6;
      show(box, on);
      if (!on) return;
      var out = 1 - smooth(prog(t, end, 0.5));
      setS(box, "opacity", String(f3(out)));
      var k = Math.floor(text.length * prog(t, at, d1) + 1e-6), cw1 = text.length * adv;
      setS(l1, "clipPath", k >= text.length ? "none" : "inset(0 " + f1(pos[1] === "l" ? bw + 4 - k * adv : (text.length - k) * adv) + "px 0 0)");
      if (l2) {
        var k2 = Math.floor(sub.length * prog(t, at + d1 + 0.15, d2) + 1e-6);
        setS(l2, "clipPath", k2 >= sub.length ? "none" : "inset(0 " + f1(pos[1] === "l" ? bw + 4 - k2 * sadv : (sub.length - k2) * sadv) + "px 0 0)");
        setS(l2, "visibility", k2 > 0 ? "visible" : "hidden");
      }
    }, 10);
    overBox("datestamp", text, box, at, end, function (t) { return { x: x0, y: y0, w: bw, h: bh, moving: false }; });
    return { el: box, at: at, end: end, rect: { x: x0, y: y0, w: bw, h: bh } };
  }
  function subtitle(text, o) {
    o = obj(o);
    var s = ensure(), sf = safe(), at = Math.max(0, num(o.at, 0.5)), end = o.end != null ? num(o.end, D) : D + 1;
    text = ascii(text);
    if (!text) return null;
    var size = num(o.size, TALL ? u(46) : u(42)), maxW = sf.w * (TALL ? 0.96 : 0.8);
    var f = fitText(text, size, FONT.serif, maxW, size * 2.6, { style: "italic", maxLines: 2, lh: 1.2 });
    var bw = 0; f.lines.forEach(function (l) { bw = Math.max(bw, textW(l, f.size, FONT.serif, "italic")); });
    var bh = f.size * (1.2 + (f.lines.length - 1) * 1.2);
    var yb = o.y != null ? num(o.y, 0) : sf.y1 - u(20) - bh, x0 = sf.cx - bw / 2;
    var wrap = div("ad-sub", s.overEl, "position:absolute;left:0;top:0;width:" + W + "px;height:" + H + "px");
    var scrim = div("ad-scrim", wrap, "position:absolute;left:" + f1(x0 - u(120)) + "px;top:" + f1(yb - u(60)) + "px;width:" + f1(bw + u(240)) + "px;height:" + f1(bh + u(120)) + "px;background:radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 50%, rgba(0,0,0,0) 72%)");
    var el = div("ad-sub-t", wrap, "position:absolute;left:" + f1(x0 - u(10)) + "px;top:" + f1(yb) + "px;width:" + f1(bw + u(20)) + "px;text-align:center;font:italic " + f1(f.size) + "px " + FONT.serif + ";line-height:1.2;color:#F0E8D8;white-space:nowrap;text-shadow:0 2px 8px rgba(0,0,0,0.9)");
    f.lines.forEach(function (l, i) { if (i) el.appendChild(doc.createElement("br")); el.appendChild(doc.createTextNode(l)); });
    show(wrap, false);
    onUpd(function (t) {
      var on = t >= at && t < end + 0.4;
      show(wrap, on);
      if (!on) return;
      var a = smooth(prog(t, at, 0.4)) * (1 - smooth(prog(t, end, 0.35)));
      setS(wrap, "opacity", String(f3(a)));
    }, 10);
    overBox("subtitle", text, el, at, end, function (t) { return { x: x0, y: yb, w: bw, h: bh, moving: t < at + 0.4 || t > end }; });
    return { el: wrap, at: at, end: end };
  }
  function titleCard(title, o) {
    o = obj(o);
    var s = ensure(), sf = safe(), at = Math.max(0, num(o.at, 0.3)), tAt = Math.max(at, num(o.titleAt, at + 0.5)), end = o.end != null ? num(o.end, D) : D + 1;
    title = ascii(title); var kick = ascii(o.kicker).toUpperCase(), sub = ascii(o.sub), date = ascii(o.date).toUpperCase();
    var maxW = sf.w * 0.94, ts = TALL ? u(104) : u(112);
    var tf = fitText(title, ts, FONT.serif, maxW, ts * 3.3, { maxLines: 3, lh: 1.05 });
    var subF = sub ? fitText(sub, ts * 0.36, FONT.serif, maxW * 0.9, ts * 1.0, { style: "italic", maxLines: 2, lh: 1.25 }) : null;
    var ks = u(26), ds = u(25);
    var hTot = (kick ? ks * 2.2 : 0) + tf.size * (1 + (tf.lines.length - 1) * 1.05) + u(36) + (subF ? subF.size * (1.25 + (subF.lines.length - 1) * 1.25) + u(16) : 0) + (date ? ds * 2.6 : 0);
    var cy = TALL ? sf.y0 + sf.h * 0.44 : sf.cy, y0 = cy - hTot / 2;
    var wrap = div("ad-title", s.overEl, "position:absolute;left:0;top:0;width:" + W + "px;height:" + H + "px");
    var scrim = div("ad-scrim", wrap, "position:absolute;left:" + f1(W / 2 - maxW * 0.7) + "px;top:" + f1(y0 - u(140)) + "px;width:" + f1(maxW * 1.4) + "px;height:" + f1(hTot + u(280)) + "px;background:radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0) 72%)");
    var col = div("ad-title-col", wrap, "position:absolute;left:" + f1(W / 2 - maxW / 2) + "px;top:" + f1(y0) + "px;width:" + f1(maxW) + "px;text-align:center");
    var kEl = null, tEl, rEl, sEl = null, dEl = null;
    if (kick) { kEl = div("ad-title-k", col, "font:bold " + f1(ks) + "px " + FONT.type + ";letter-spacing:" + f1(ks * 0.5) + "px;color:#C8963E;height:" + f1(ks * 2.2) + "px;white-space:pre"); kEl.textContent = kick; }
    tEl = div("ad-title-t", col, "font:normal " + f1(tf.size) + "px " + FONT.serif + ";line-height:1.05;color:#EFE6D4;white-space:nowrap;text-shadow:0 3px 16px rgba(0,0,0,0.8)");
    tf.lines.forEach(function (l, i) { if (i) tEl.appendChild(doc.createElement("br")); tEl.appendChild(doc.createTextNode(l)); });
    rEl = div("ad-title-r", col, "height:" + f1(u(2)) + "px;width:" + f1(Math.min(maxW * 0.5, u(360))) + "px;background:#C8963E;margin:" + f1(u(18)) + "px auto " + f1(u(16)) + "px");
    if (subF) { sEl = div("ad-title-s", col, "font:italic " + f1(subF.size) + "px " + FONT.serif + ";line-height:1.25;color:#D8CBB0;white-space:nowrap;text-shadow:0 2px 10px rgba(0,0,0,0.8);margin-bottom:" + f1(u(16)) + "px"); subF.lines.forEach(function (l, i) { if (i) sEl.appendChild(doc.createElement("br")); sEl.appendChild(doc.createTextNode(l)); }); }
    if (date) { dEl = div("ad-title-d", col, "font:bold " + f1(ds) + "px " + FONT.type + ";letter-spacing:" + f1(ds * 0.3) + "px;color:#EDE3D0;white-space:pre;margin-top:" + f1(ds * 0.6) + "px"); dEl.textContent = date; }
    var kAdv = kick ? textW("M", ks, FONT.type, null, "bold") + ks * 0.5 : 0, dAdv = date ? textW("M", ds, FONT.type, null, "bold") + ds * 0.3 : 0;
    var subAt = num(o.subAt, tAt + 0.8), dateAt = num(o.dateAt, subAt + 0.5);
    show(wrap, false);
    onUpd(function (t) {
      var on = t >= at && t < end + 0.6;
      show(wrap, on);
      if (!on) return;
      var out = 1 - smooth(prog(t, end, 0.5));
      setS(scrim, "opacity", String(f3(smooth(prog(t, at, 1)) * out)));
      if (kEl) { var kk = Math.floor(kick.length * prog(t, at, Math.min(1, kick.length * 0.06)) + 1e-6), kw = kick.length * kAdv; setS(kEl, "clipPath", kk >= kick.length ? "none" : "inset(0 " + f1((maxW - kw) / 2 + kw - kk * kAdv) + "px 0 0)"); setS(kEl, "opacity", String(f3(out))); }
      var pt = prog(t, tAt, 1.3), e = outC(pt);
      setS(tEl, "opacity", String(f3(smooth(pt * 1.4) * out)));
      setS(tEl, "filter", pt >= 1 ? "none" : "blur(" + f2((1 - e) * u(14)) + "px)");
      setS(tEl, "letterSpacing", f2((1 - e) * u(10)) + "px");
      setS(rEl, "clipPath", "inset(0 " + f1((1 - outC(prog(t, tAt + 0.6, 0.8))) * 50) + "% 0 " + f1((1 - outC(prog(t, tAt + 0.6, 0.8))) * 50) + "%)");
      setS(rEl, "opacity", String(f3(out)));
      if (sEl) setS(sEl, "opacity", String(f3(smooth(prog(t, subAt, 0.8)) * out)));
      if (dEl) { var dk = Math.floor(date.length * prog(t, dateAt, Math.min(1, date.length * 0.06)) + 1e-6), dw = date.length * dAdv; setS(dEl, "clipPath", dk >= date.length ? "none" : "inset(0 " + f1((maxW - dw) / 2 + dw - dk * dAdv) + "px 0 0)"); setS(dEl, "opacity", String(f3(out))); }
    }, 10);
    overBox("title", title, col, at, end, function (t) { return { x: W / 2 - maxW / 2, y: y0, w: maxW, h: hTot, moving: t < tAt + 1.3 }; });
    return { el: wrap, at: at, titleAt: tAt, end: end };
  }
  function fadeIn(at, dur) { var s = ensure(); s.fades.push({ dir: 1, at: Math.max(0, num(at, 0)), dur: Math.max(0.05, num(dur, 1)) }); s.fades.sort(function (a, b) { return a.at - b.at; }); }
  function fadeOut(at, dur) { var s = ensure(); s.fades.push({ dir: -1, at: Math.max(0, num(at, D - 1)), dur: Math.max(0.05, num(dur, 1)) }); s.fades.sort(function (a, b) { return a.at - b.at; }); }
  function fadeLevel(t) {
    var fs = st.fades;
    if (!fs.length) return 0;
    var fo = fs[0].dir > 0 ? 1 : 0;
    fs.forEach(function (fd) { if (t >= fd.at) { var p = smooth(prog(t, fd.at, fd.dur)); fo = fd.dir > 0 ? 1 - p : p; } });
    return fo;
  }

  // ------------------------- inspect / flush -------------------------
  function screenBox(cam, it, k, pose) {
    var corners = [[k.lx, k.ly], [k.lx + k.lw, k.ly], [k.lx, k.ly + k.lh], [k.lx + k.lw, k.ly + k.lh]];
    var cx = it.x + it.w / 2, cy = it.y + it.h / 2, rot = it.rot + (pose ? pose.r : 0), sc = pose ? pose.s : 1;
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    corners.forEach(function (c) {
      var wp = rotPt(cx + (pose ? pose.dx : 0), cy + (pose ? pose.dy : 0), (c[0] - it.w / 2) * sc, (c[1] - it.h / 2) * sc, rot), sp = toScreen(cam, wp[0], wp[1]);
      x0 = Math.min(x0, sp[0]); y0 = Math.min(y0, sp[1]); x1 = Math.max(x1, sp[0]); y1 = Math.max(y1, sp[1]);
    });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  S.labelStrip = labelStrip;
  S.inspect = function (t) {
    if (!st) return [];
    if (st.dirty) compile();
    t = num(t, 0);
    var cam = camAt(t), cam2 = camAt(Math.min(D, t + 0.05)), out = [];
    st.items.forEach(function (it) {
      if (it.clutter) return;
      var p = poseOf(it, t);
      if (!p.vis) return;
      it.keys.forEach(function (k) {
        if (t < k.from || t > k.to) return;
        var b = screenBox(cam, it, k, p), b2 = screenBox(cam2, it, k, p);
        if (b.w > W * 0.85 || b.h > H * 0.85) return; // full-frame print or page: background, not a layout box
        if (b.x < -1 || b.y < -1 || b.x + b.w > W + 1 || b.y + b.h > H + 1) return; // crosses the frame edge: context at the edge of a camera move
        var mv = p.moving || Math.abs(b2.x - b.x) + Math.abs(b2.y - b.y) + Math.abs(b2.w - b.w) > 0.5;
        out.push({ kind: k.kind, label: k.label || it.label, x: b.x, y: b.y, w: b.w, h: b.h, moving: mv });
      });
    });
    st.boxes.forEach(function (bx) {
      if (t < bx.from || t > bx.to + 0.5) return;
      var r = bx.fn(t);
      out.push({ kind: bx.kind, label: bx.label, x: r.x, y: r.y, w: r.w, h: r.h, moving: !!r.moving });
    });
    return out;
  };
  S.flush = function () {
    if (!st) return;
    compile();
    st.items.forEach(function (it) { it.acts.forEach(function (a) { if (a.at + (a.dur || 0) > D + 0.05) V.error("[flush] " + (it.label || it.kind) + " still moving after the end (" + f2(a.at + a.dur) + " s)"); }); });
    st.cam.segs.forEach(function (sg) { if (sg.kind === "move" && sg.at + sg.dur > D + 0.06) V.error("[flush] camera move ends after the scene (" + f2(sg.at + sg.dur) + " s)"); });
    try { frame(0); } catch (e) { V.error("[flush] " + (e && e.message ? e.message : e)); }
  };

  // ------------------------- templates -------------------------
  function kwOr(kw, label, def, after) {
    var t = kw ? kwFind(kw, after) : null;
    if (t == null && label) t = labelTime(label, null, after);
    return t == null ? def : t;
  }
  function focusOf(ph, f) {
    var fo = ph.focus || { fx: 0.5, fy: 0.45 };
    if (f === "left") return { fx: 0.28, fy: fo.fy };
    if (f === "right") return { fx: 0.72, fy: fo.fy };
    if (f === "top") return { fx: fo.fx, fy: 0.28 };
    if (f === "bottom") return { fx: fo.fx, fy: 0.72 };
    if (f === "center") return { fx: 0.5, fy: 0.5 };
    return { fx: fo.fx, fy: fo.fy };
  }
  function lowerSpan() { return TALL ? u(240) : u(150); }

  function tPhotoPan(root, p) {
    desk(root, {});
    var subject = subjectId(p.subject) || "portrait", tone = toneId(p.tone) || "sepia", move = str(p.move) || "push-in";
    if (["push-in", "pull-out", "pan-left", "pan-right"].indexOf(move) < 0) move = "push-in";
    var portrait = subject === "portrait" || subject === "portrait-woman";
    var aspect = defaultAspect(subject);
    var w = TALL ? W * 0.84 : SQUARE ? (portrait ? W * 0.6 : W * 0.78) : portrait ? H * 0.74 * aspect : W * 0.6;
    var ph = photo({ subject: subject, tone: tone, cx: W / 2, cy: H * (TALL ? 0.45 : 0.49), w: w, rot: -1.2, caption: p.caption, res: 1.9, seed: 4100 });
    clutter(ph.rect, { tone: tone, count: 4 });
    var title = ascii(p.title), sub = ascii(p.subtitle);
    var key = tc(kwOr(p.keyword, title || sub, Math.min(2, D * 0.3)), 0.9);
    place(ph, 0.05, "develop", { dur: clamp(key - 0.05, 1.0, 2.6) });
    var fo = focusOf(ph, str(p.focus) || "auto"), ir = ph.imgRect(), endT = Math.max(1.5, D - 0.15);
    var whole = focusState(ph, { fill: 0.94, lower: !!(title || sub) });
    camera.set(whole.x, whole.y, whole.zoom, whole.rot);
    var zCover = portrait && !TALL ? 0.62 : 1.0;
    // establishing shot of the print on the desk while it develops, then the pan-and-zoom move
    var est = { x: whole.x, y: whole.y, zoom: whole.zoom * 0.94, rot: whole.rot };
    st.cam.init = est;
    var kbAt = clamp(Math.min(key, 1.6), 0.8, Math.max(0.8, D * 0.3)), glide = Math.min(1.8, Math.max(1.0, D * 0.2));
    if (move === "push-in") {
      addMove(0.2, endT - 0.2, kbState(ir, { fx: fo.fx, fy: fo.fy, zoom: zCover * (portrait ? 1.12 : 1.22) }), "inOutSine");
    } else if (move === "pull-out") {
      st.cam.init = kbState(ir, { fx: fo.fx, fy: fo.fy, zoom: zCover * 1.3 });
      addMove(0.3, endT - 0.3, focusState(ph, { fill: 0.9, lower: !!(title || sub) }), "inOutSine");
    } else {
      var right = move === "pan-right", z = (TALL ? 1.1 : SQUARE ? 1.25 : 1.35) * (portrait && !TALL ? 0.62 : 1);
      addMove(kbAt - glide * 0.6, glide, kbState(ir, { fx: right ? 0 : 1, fy: fo.fy, zoom: z }), "inOutSine");
      addMove(kbAt - glide * 0.6 + glide, Math.max(1, endT - (kbAt - glide * 0.6 + glide)), kbState(ir, { fx: right ? 1 : 0, fy: fo.fy, zoom: z * 1.05 }), "inOutSine");
    }
    if (title || sub) lowerThird(title, { sub: sub, at: key });
    if (p.date || p.place) dateStamp(p.date || p.place, { sub: p.date ? p.place : "", at: tc(kwOr(null, p.date, 0.45), 0.3) });
  }

  function tNewspaper(root, p) {
    desk(root, {});
    var paper = newspaper({ name: p.paper, date: p.date, headline: p.headline, subhead: p.subhead, kicker: p.kicker, subject: p.subject, caption: p.caption, price: p.price, tone: p.tone, cx: W / 2, cy: H * (TALL ? 0.45 : 0.5), rot: -1.6, seed: 4200 });
    clutter(paper.rect, { count: 4, kinds: ["photo", "envelope", "letter", "pen", "paperclip"], tone: toneId(p.tone) || "silver" });
    var land = tc(kwOr(p.keyword, p.headline, 1.5), Math.min(1.3, D * 0.3));
    var spinDur = Math.min(1.2, land - 0.05);
    place(paper, land - spinDur, p.spin === false ? "drop" : "spin", { dur: spinDur, rot: 0 });
    camera.shake(land, u(6), 0.4);
    var whole = focusState(paper, { fill: 0.92 });
    var pre = { x: whole.x + u(60), y: whole.y - u(30), zoom: whole.zoom * 0.88, rot: 0 };
    st.cam.init = pre;
    addMove(Math.max(0, land - spinDur - 0.2), Math.max(0.6, spinDur), whole, "inOutSine");
    var tEnd = Math.max(land + 1.5, D - 0.15), span = tEnd - land;
    var readAt = land + Math.min(0.5, span * 0.08), readDur = Math.min(1.6, span * 0.28);
    addMove(readAt, readDur, focusState(paper.headlineRect, { fill: 0.96, straighten: true }), "inOutSine");
    if (paper.photoRect && span > 3.5) {
      var capT = labelTime(p.caption, null, land);
      var tilt = clamp(capT != null ? capT - 0.6 : readAt + readDur + span * 0.18, readAt + readDur + 0.3, tEnd - 2.6);
      addMove(tilt, Math.min(1.6, span * 0.25), focusState(paper.photoRect, { fill: 0.86 }), "inOutSine");
    }
    addMove(Math.max(readAt + readDur + 0.4, tEnd - Math.min(2.2, span * 0.32)), Math.min(2.0, span * 0.3), focusState(paper, { fill: 0.9 }), "inOutSine");
    if (p.date && D > 4) dateStamp(p.date, { at: 0.3, end: Math.max(0.8, land - 0.3) });
  }

  function tMapRoute(root, p) {
    desk(root, {});
    var places = arr(p.places).slice(0, 6).map(obj);
    if (!places.length) places = [{ name: "Port Vellan" }, { name: "Cape Sorrow" }];
    var hasLower = !!(p.subtitle);
    var m = mapItem({ title: p.title, terrain: p.terrain, places: places, cx: W / 2, cy: H * (TALL ? 0.45 : 0.5), rot: 0, seed: 4300 });
    var times = beatTimes(places.map(function (q) { return { label: q.name }; }), { lo: 0.6, gap: 0.7, hi: endBy() - (hasLower ? 1.4 : 0.8) });
    m.drawPlaces(times);
    var r = m.route(times, { style: str(p.route) || "land" });
    if (m.titleKey) m.titleKey.to = Math.max(0.2, times[0] - 0.9);
    place(m, 0.05, "fade", { dur: 0.6 });
    var whole = focusState(m, { fill: 0.96, lower: hasLower });
    st.cam.init = whole;
    var zT = whole.zoom * (TALL ? 1.55 : 1.7), last = times[times.length - 1];
    var T = contentRect({});
    var head0 = r.head(times[0]);
    addMove(Math.max(0.2, times[0] - 0.9), 0.9, function () { return inMap(camFor(head0.x, head0.y, T.cx, T.cy, zT, whole.rot)); }, "inOutSine");
    function inMap(stt) {
      // keep the safe area of the frame on the map: (screen safe rect) / zoom around the camera centre
      var sf = safe(), l = (W / 2 - sf.x0) / stt.zoom, r = (sf.x1 - W / 2) / stt.zoom, t = (H / 2 - sf.y0) / stt.zoom, b = (sf.y1 - H / 2) / stt.zoom;
      var x = m.w > l + r ? clamp(stt.x, m.x + l, m.x + m.w - r) : m.x + m.w / 2, y = m.h > t + b ? clamp(stt.y, m.y + t, m.y + m.h - b) : m.y + m.h / 2;
      return { x: x, y: y, zoom: stt.zoom, rot: stt.rot };
    }
    camera.track(function (t) {
      // follow a smoothed route head, never past the edge of the map
      var ax = 0, ay = 0, n = 0;
      for (var k = 0; k < 6; k++) { var hp = r.head(Math.max(0, t - k * 0.12)); ax += hp.x; ay += hp.y; n++; }
      return inMap(camFor(ax / n, ay / n, T.cx, T.cy, zT, whole.rot));
    }, times[0], 0.4);
    var back = Math.min(last + 0.6, D - 1.9);
    addMove(back, Math.min(1.8, D - back - 0.1), whole, "inOutSine");
    if (hasLower) lowerThird(p.subtitle, { at: Math.min(D - 1.4, back + 0.8) });
    if (p.date) dateStamp(p.date, { at: 0.35, pos: TALL ? "tl" : "tr" });
  }

  function tDocument(root, p) {
    desk(root, {});
    var stampTxt = ascii(p.stamp);
    var key = tc(kwOr(p.keyword, stampTxt, D * 0.72), 2.2);
    var typeAt = 1.05, typeEnd = clamp(key - 0.9, typeAt + 1.5, endBy() - 1.4);
    if (!stampTxt) typeEnd = clamp(D - 2.4, typeAt + 1.5, endBy() - 1.0);
    var dc = documentItem({ header: p.header, title: p.title, date: p.date, to: p.to, from: p.from, subject: p.subject, ref: p.ref, body: p.body, redact: p.redact, classification: p.classification, typeAt: typeAt, typeEnd: typeEnd, cx: W / 2, cy: H * (TALL ? 0.46 : 0.5), rot: 0.8, seed: 4400 });
    clutter(dc.rect, { count: 4, kinds: ["envelope", "photo", "paperclip", "pen"], tone: "silver" });
    place(dc, 0.1, "slide", { dur: 0.9, from: "right" });
    var whole = focusState(dc, { fill: 0.92 });
    st.cam.init = { x: whole.x, y: whole.y, zoom: whole.zoom * 0.92, rot: whole.rot };
    addMove(0, 0.9, whole, "inOutSine");
    var T = contentRect({}), zRead = Math.min(T.w / (dc.w * 0.98), whole.zoom * 1.9);
    var viewH = T.h / zRead, cpage = dc.point(0.5, 0.5);
    function readState(t) {
      var ay = 0, n = 0;
      for (var k = 0; k < 8; k++) { var hp = dc.head(Math.max(0, t - k * 0.15)); ay += hp.ly; n++; }
      var ly = clamp(ay / n, viewH * 0.45, dc.h - viewH * 0.45);
      var wp = dc.local(dc.w / 2, ly);
      return camFor(wp[0], wp[1], T.cx, T.cy, zRead, dc.rot);
    }
    camera.track(readState, typeAt - 0.1, 0.9);
    var backAt = stampTxt ? key - 1.0 : typeEnd + 0.3;
    addMove(clamp(backAt, typeAt + 0.6, D - 1.2), 0.9, focusState(dc, { fill: 0.92 }), "inOutSine");
    if (stampTxt) stamp(dc, stampTxt, { at: key, color: p.stampColor || "red", fx: 0.66, fy: 0.74, rot: -9 });
    if (dc.bars.length) dc.bars.forEach(function (b) { b.at = Math.min(b.at, key - 0.3); });
  }

  function tTimeline(root, p) {
    var events = arr(p.events).slice(0, 6).map(obj);
    if (!events.length) events = [{ date: "1900", label: "The beginning" }, { date: "1950", label: "The middle years" }];
    var n = events.length, tone = toneId(p.tone) || "sepia";
    var sp = TALL ? u(470) : u(560), m = TALL ? u(330) : u(480);
    var ww = TALL ? W : Math.max(W, m * 2 + (n - 1) * sp), wh = TALL ? Math.max(H, m * 2 + (n - 1) * sp) : H;
    desk(root, { width: ww, height: wh });
    var ribbon, rib = TALL ? { x: ww * 0.47 - u(36), y: m * 0.4, w: u(72), h: wh - m * 0.8 } : { x: m * 0.4, y: wh * 0.47 - u(36), w: ww - m * 0.8, h: u(72) };
    ribbon = makeItem({ x: rib.x, y: rib.y, w: rib.w, h: rib.h, kind: "ribbon", label: "ribbon", layer: "back" });
    var rpc = paperCanvas(rib.w, rib.h, { kind: "print", base: "#E8DCC0", seed: 4501, res: 1.4, age: 0.8, creases: false, stain: false, edge: "straight" });
    placeCanvas(ribbon.el, rpc, rib.w, rib.h);
    var rctx = rpc.ctx;
    rctx.strokeStyle = "rgba(40,30,20,0.6)"; rctx.lineWidth = u(1);
    var Lr = TALL ? rib.h : rib.w;
    for (var tk = 0; tk < Lr; tk += u(16)) {
      var big = Math.round(tk / u(16)) % 5 === 0, tl = big ? u(20) : u(10);
      rctx.beginPath();
      if (TALL) { rctx.moveTo(0, tk); rctx.lineTo(tl, tk); rctx.moveTo(rib.w, tk); rctx.lineTo(rib.w - tl, tk); }
      else { rctx.moveTo(tk, 0); rctx.lineTo(tk, tl); rctx.moveTo(tk, rib.h); rctx.lineTo(tk, rib.h - tl); }
      rctx.stroke();
    }
    var times = beatTimes(events.map(function (e) { return { label: ascii(e.date) + " " + ascii(e.label), keyword: ascii(e.date) }; }), { lo: 0.7, gap: 0.9, hi: endBy() - 1.6 });
    var groups = [];
    events.forEach(function (e, i) {
      var t = times[i], cx = TALL ? ww * 0.47 : m + i * sp, cy = TALL ? m + i * sp : wh * 0.47;
      // year printed on the ribbon
      var yr = ascii(e.date);
      if (TALL) { rctx.save(); rctx.translate(rib.w / 2, cy - rib.y); rctx.rotate(-PI / 2); typeText(rctx, yr, -yr.length * typeAdv(u(24)) / 2, u(8), u(24), rng(4600 + i), {}); rctx.restore(); }
      else typeText(rctx, yr, cx - rib.x - yr.length * typeAdv(u(24)) / 2, rib.h / 2 + u(8), u(24), rng(4600 + i), {});
      rctx.fillStyle = "rgba(160,40,30,0.8)";
      if (TALL) rctx.fillRect(rib.w * 0.15, cy - rib.y - u(26), rib.w * 0.7, u(3)); else rctx.fillRect(cx - rib.x - u(1.5), rib.h * 0.12, u(3), rib.h * 0.15);
      // tag
      var tw = TALL ? u(430) : u(400), th = tw * 0.56;
      var tx = TALL ? cx + u(70) + tw / 2 : cx, ty = TALL ? cy + u(30) : cy + u(80) + th / 2 + u(70);
      var tag = indexCard({ title: yr, lines: [e.label], color: "manila", cx: tx, cy: ty, w: tw, rot: (i % 2 ? 2.5 : -2.5), seed: 4700 + i });
      place(tag, t - 0.25, "drop", { dur: 0.5 });
      var hole = pin(tag, TALL ? 0.04 : 0.5, TALL ? 0.5 : 0.04, { r: u(9), color: "#8A6A3A" });
      string(TALL ? [cx + u(36), cy] : [cx, cy + u(36)], hole, { at: t + 0.1, dur: 0.45, color: "#7A5A30" });
      var g = { tag: tag, t: t, rect: null };
      var subj = subjectId(e.subject);
      if (subj) {
        var pw = TALL ? u(400) : u(380);
        var ph = photo({ subject: subj, tone: tone, aspect: 1.3, w: pw, cx: TALL ? cx - u(60) - pw / 2 : cx, cy: TALL ? cy : cy - u(70) - pw / 1.3 / 2 - u(40), rot: (i % 2 ? -2 : 2), res: 1.3, seed: 4800 + i, mounts: false, tape: true });
        place(ph, t + 0.15, "slide", { dur: 0.8, from: TALL ? "left" : "top" });
        g.photo = ph;
      }
      var r0 = tag.rect, r1 = g.photo ? g.photo.rect : r0;
      var x0 = Math.min(r0.x, r1.x, TALL ? cx - u(40) : cx - u(40)), y0 = Math.min(r0.y, r1.y), x1 = Math.max(r0.x + r0.w, r1.x + r1.w), y1 = Math.max(r0.y + r0.h, r1.y + r1.h);
      g.rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
      groups.push(g);
    });
    var hasLower = !!(p.title || p.subtitle);
    var fZ = function (g) { return focusState(g.rect, { fill: 0.9 }); };
    var allRect = { x: Math.min.apply(null, groups.map(function (g) { return g.rect.x; })) - u(40), y: Math.min.apply(null, groups.map(function (g) { return g.rect.y; })) - u(40) };
    allRect.w = Math.max.apply(null, groups.map(function (g) { return g.rect.x + g.rect.w; })) + u(40) - allRect.x;
    allRect.h = Math.max.apply(null, groups.map(function (g) { return g.rect.y + g.rect.h; })) + u(40) - allRect.y;
    var z0 = fZ(groups[0]);
    st.cam.init = { x: z0.x + (TALL ? 0 : -u(120)), y: z0.y + (TALL ? -u(160) : 0), zoom: z0.zoom * 0.95, rot: 0 };
    groups.forEach(function (g, i) { if (i) addMove(Math.max(0.2, g.t - 0.75), 0.95, fZ(g), "inOutSine"); else addMove(0.1, Math.max(0.5, g.t - 0.2), fZ(g), "inOutSine"); });
    var last = times[n - 1], back = Math.min(last + 1.0, D - 2.1);
    addMove(back, Math.min(1.9, D - back - 0.1), focusState(allRect, { fill: 0.96, lower: hasLower }), "inOutSine");
    if (hasLower) lowerThird(p.title, { sub: p.subtitle, at: Math.min(D - 1.3, back + 1.0) });
  }

  function tEvidence(root, p) {
    desk(root, { surface: "cork" });
    var items = arr(p.items).slice(0, 6).map(obj);
    if (!items.length) items = [{ label: "The Witness" }, { label: "The Letter" }];
    var n = items.length, tone = toneId(p.tone) || "silver", sf = safe();
    var title = ascii(p.title);
    var topPad = title ? (TALL ? u(150) : u(120)) : u(20);
    var cols = TALL ? (n <= 2 ? 1 : 2) : n <= 4 ? n : 3, rows = Math.ceil(n / cols), zig = !TALL && rows === 1 && n > 2;
    var areaX = sf.x0 + u(20), areaY = sf.y0 + topPad, areaW = sf.w - u(40), areaH = sf.h - topPad - u(20);
    var cw = areaW / cols, ch = areaH / rows, R = rng(4900);
    var times = beatTimes(items.map(function (q) { return { label: q.label }; }), { lo: 0.6, gap: 0.85, hi: endBy() - 2.0 });
    var made = [];
    items.forEach(function (q, i) {
      var r = Math.floor(i / cols), c = i % cols;
      var inRow = r === rows - 1 ? n - r * cols : cols, offX = (cols - inRow) * cw / 2;
      var cx = areaX + offX + cw * (c + 0.5) + (R() - 0.5) * cw * 0.08, cy = areaY + ch * (r + 0.5) + (R() - 0.5) * ch * 0.08 + (zig ? (i % 2 ? 1 : -1) * ch * 0.16 : 0);
      var rot = (R() - 0.5) * 7, t = times[i], it, subj = subjectId(q.subject);
      var maxW = Math.min(cw * (zig ? 0.88 : 0.82), ch * (zig ? 0.95 : 1.25), u(560));
      if (subj) {
        var pw = Math.min(cw * 0.66, ch * (zig ? 0.5 : 0.62) * 0.8, u(330));
        it = photo({ subject: subj, tone: tone, w: pw, cx: cx, cy: cy - ch * 0.04, rot: rot, caption: q.label, border: "white", mounts: false, res: 1.5, seed: 5000 + i });
        if (q.note) {
          var ncw = Math.max(pw * 1.1, Math.min(cw * 0.8, u(320)));
          var nc = indexCard({ title: "", lines: [q.note], color: "white", w: ncw, h: ncw * 0.34, cx: cx + cw * 0.05, cy: it.y + it.h + ncw * 0.1, rot: -rot * 0.6, seed: 5100 + i });
          place(nc, t + 0.25, "drop", { dur: 0.4 });
          pin(nc, 0.5, 0.08, { r: u(8), color: "#2A4A8A" });
        }
      } else {
        it = indexCard({ title: q.label, lines: q.note ? [q.note] : [], color: i % 3 === 2 ? "manila" : "white", w: maxW, cx: cx, cy: cy, rot: rot, seed: 5200 + i });
      }
      place(it, t - 0.3, "drop", { dur: 0.45 });
      var pp = pin(it, 0.5, subj ? 0.035 : 0.045);
      made.push({ it: it, pin: pp, t: t });
    });
    if (title) {
      var lab = labelStrip(title, { h: TALL ? u(74) : u(66), cx: W / 2, cy: sf.y0 + (TALL ? u(60) : u(52)), rot: -0.8, seed: 5300, color: "white", maxW: sf.w * 0.8 });
      pin(lab, 0.04, 0.5, { r: u(8) }); pin(lab, 0.96, 0.5, { r: u(8) });
    }
    var links = arr(p.links).map(obj).filter(function (l) { return made[num(l.from, -1)] && made[num(l.to, -1)] && num(l.from, 0) !== num(l.to, 0); });
    if (!links.length) for (var i = 0; i + 1 < n; i++) links.push({ from: i, to: i + 1 });
    links.forEach(function (l) {
      var a = made[num(l.from, 0)], b = made[num(l.to, 0)], at = Math.max(a.t, b.t) + 0.3;
      string(a.pin, b.pin, { at: Math.min(at, D - 1.6), dur: 0.6 });
    });
    var whole = focusState({ x: 0, y: 0, w: W, h: H }, { fill: 1.0, target: { x0: 0, y0: 0, w: W, h: H, cx: W / 2, cy: H / 2 } });
    st.cam.init = { x: whole.x, y: whole.y, zoom: 1.02, rot: 0 };
    made.forEach(function (mm, i) { var a0 = i ? mm.t - 0.75 : Math.max(0.5, mm.t - 0.75); addMove(a0, Math.max(0.6, Math.min(0.95, mm.t + 0.2 - a0)), focusState(mm.it, { fill: TALL ? 0.7 : 0.56, straighten: false }), "inOutSine"); });
    var last = times[n - 1], back = Math.min(last + 0.9, D - 1.9);
    addMove(back, Math.min(1.7, D - back - 0.1), { x: W / 2, y: H / 2, zoom: 1.0, rot: 0 }, "inOutSine");
  }

  function tLetter(root, p) {
    desk(root, {});
    var hasLower = !!(p.author || p.role);
    var lw = TALL ? W * 0.84 : SQUARE ? W * 0.66 : W * 0.46;
    var lx = TALL ? W / 2 : SQUARE ? W * 0.55 : W * 0.56, ly = TALL ? H * 0.47 : H * 0.5;
    var env = envelope({ cx: TALL ? W * 0.34 : lx - lw * 0.78, cy: TALL ? ly - lw * 0.78 : ly + H * 0.1, w: TALL ? W * 0.62 : W * 0.3, rot: TALL ? -7 : -11, layer: "back", seed: 5401 });
    var lt = letter({ text: p.quote, salutation: p.salutation, signoff: p.signoff, signature: p.signature || (p.author ? ascii(p.author).split(" ").slice(-1)[0] : ""), date: p.date, place: p.place, cx: lx, cy: ly, w: lw, rot: 1.2, seed: 5400, writeAt: 0.6, writeEnd: D - 1.6 });
    clutter({ x: lt.x - lw * 0.3, y: lt.y, w: lw * 1.6, h: lt.h }, { count: 3, kinds: ["pen", "photo", "paperclip"], tone: "sepia" });
    place(lt, 0.08, "slide", { dur: 0.9, from: TALL ? "bottom" : "right" });
    // pen that follows the writing
    var penC = mkCanvas(u(420) * 1.4, u(40) * 1.4), pctx = penC.getContext("2d"), PL = u(420), PT = u(32);
    pctx.scale(1.4, 1.4);
    var gpen = pctx.createLinearGradient(0, 0, 0, PT); gpen.addColorStop(0, "#4a4038"); gpen.addColorStop(0.4, "#151311"); gpen.addColorStop(1, "#050404");
    pctx.fillStyle = gpen; roundRect(pctx, PL * 0.16, u(2), PL * 0.8, PT - u(4), PT * 0.45); pctx.fill();
    pctx.fillStyle = "#C8963E"; pctx.fillRect(PL * 0.55, u(2), PL * 0.03, PT - u(4));
    var ng = pctx.createLinearGradient(0, 0, 0, PT); ng.addColorStop(0, "#F0D490"); ng.addColorStop(1, "#8A6020");
    pctx.fillStyle = ng; poly(pctx, [[PL * 0.17, u(6)], [0, PT / 2], [PL * 0.17, PT - u(6)]]); pctx.fill();
    penC.style.cssText = "position:absolute;left:0;top:0;width:" + f1(PL) + "px;height:" + f1(u(40)) + "px;transform-origin:0 50%;filter:drop-shadow(" + f1(u(10)) + "px " + f1(u(16)) + "px " + f1(u(8)) + "px rgba(0,0,0,0.45))";
    lt.el.appendChild(penC);
    var lines = lt.lines;
    onUpd(function (t) {
      var pp = lt.pen(t), ln = lines[pp.line];
      var vis = ln && t >= lines[0].start - 0.4 && t <= lt.end + 0.5;
      show(penC, vis);
      if (!vis) return;
      var lift = pp.writing ? 0 : 1, fade = 1 - smooth(prog(t, lt.end + 0.1, 0.4));
      var wob = Math.sin(t * 22) * u(2) * (1 - lift);
      setS(penC, "transform", "translate(" + f1(pp.lx) + "px," + f1(pp.ly - u(22) - lift * u(10) + wob) + "px) rotate(34deg)");
      setS(penC, "opacity", String(f3(fade)));
    });
    var whole = focusState(lt, { fill: 0.94 });
    st.cam.init = { x: whole.x + u(40), y: whole.y + u(20), zoom: whole.zoom * 0.9, rot: whole.rot };
    addMove(0, 1.0, whole, "inOutSine");
    var T = contentRect({}), zLine = Math.min(T.w / (lt.w * 0.92), whole.zoom * 2.2);
    var viewH = T.h / zLine;
    var bodyStart = lines.filter(function (l) { return l.kind === "body"; })[0];
    var tStart = bodyStart ? Math.max(1.1, bodyStart.start - 0.2) : 1.2;
    camera.track(function (t) {
      var ay = 0;
      for (var k = 0; k < 8; k++) { var q = lt.pen(Math.max(0, t - k * 0.15)); ay += q.ly; }
      var ly2 = clamp(ay / 8, viewH * 0.45, lt.h - viewH * 0.45);
      var wp = lt.local(lt.w / 2, ly2);
      return camFor(wp[0], wp[1], T.cx, T.cy, zLine, lt.rot);
    }, tStart, 1.0);
    var back = clamp(lt.end - 0.1, tStart + 1, D - 1.6);
    var both = { x: Math.min(env.x, lt.x) , y: Math.min(env.y, lt.y) };
    both.w = Math.max(env.x + env.w, lt.x + lt.w) - both.x; both.h = Math.max(env.y + env.h, lt.y + lt.h) - both.y;
    addMove(back, Math.min(1.5, D - back - 0.1), focusState(TALL ? lt : both, { fill: 0.92, lower: hasLower }), "inOutSine");
    if (hasLower) lowerThird(p.author, { sub: p.role, at: Math.min(D - 1.2, back + 0.5) });
  }

  function tLedger(root, p) {
    desk(root, {});
    var stats = arr(p.stats).slice(0, 4).map(obj).filter(function (q) { return isFinite(num(q.value, NaN)); });
    if (!stats.length) stats = [{ value: 100, label: "entries" }];
    var lg = ledger({ title: p.title, year: p.year, cx: W / 2, cy: H * (TALL ? 0.46 : 0.5), rot: -0.8, seed: 5500 });
    clutter(lg.rect, { count: 4, kinds: ["pen", "envelope", "paperclip", "photo"], tone: "sepia" });
    place(lg, 0.05, "slide", { dur: 0.8, from: "bottom" });
    var s0 = stats[0];
    var key = tc(kwOr(p.keyword, s0.label, 1.8), 1.6);
    var countDur = Math.min(1.4, key - 0.3);
    var fig = lg.figure(num(s0.value, 0), key - countDur, countDur, { prefix: s0.prefix, suffix: s0.suffix, decimals: s0.decimals, fy: lg.spread ? 0.46 : 0.27 });
    var circ = inkCircle(lg, (fig.cx) / lg.w, (fig.cy - fig.h * 0.08) / lg.h, (fig.w * 1.0) / lg.w, (fig.h * 0.88) / lg.h, key + 0.1, { dur: 0.55 });
    // the headline label under the figure
    var labLine = lg.spread ? Math.round((fig.cy + fig.h * 0.6 - lg.head) / lg.rowH) : Math.round((fig.cy + fig.h * 0.7 - lg.head) / lg.rowH);
    var labRow = lg.row(labLine, s0.label, null, key + 0.3, { page: 0 });
    var rest = stats.slice(1);
    var rt = beatTimes(rest.map(function (q) { return { label: q.label }; }), { lo: key + 0.9, gap: 0.8, hi: endBy() - 1.2, after: key });
    var startLine = lg.spread ? Math.max(1, Math.round(lg.rows * 0.3) - rest.length) : labLine + 2, rowsMade = [];
    rest.forEach(function (q, i) { rowsMade.push(lg.row(startLine + i * (lg.spread ? 2 : 1.5), q.label, num(q.value, 0), rt[i], { prefix: q.prefix, suffix: q.suffix, decimals: q.decimals })); });
    if (p.source) lg.source(p.source, Math.min(D - 1.2, (rt.length ? rt[rt.length - 1] : key) + 0.8));
    var whole = focusState(lg, { fill: 0.94 });
    st.cam.init = whole;
    addMove(Math.max(0.3, fig.at - 0.3), Math.max(0.6, Math.min(1.3, countDur + 0.2)), focusState(fig.rect(), { fill: TALL ? 0.62 : 0.5 }), "inOutSine");
    if (rowsMade.length) {
      var r0 = rowsMade[0].rect(), rl = rowsMade[rowsMade.length - 1].rect();
      var rowsRect = { x: Math.min(r0.x, rl.x), y: r0.y - lg.rowH, w: r0.w, h: rl.y + rl.h - r0.y + lg.rowH * 2, rot: lg.rot };
      if (!lg.spread) { var lr = labRow.rect(); rowsRect.y = Math.min(rowsRect.y, lr.y); rowsRect.h = rl.y + rl.h - rowsRect.y + lg.rowH; }
      addMove(clamp(rt[0] - 0.7, key + 0.4, D - 2.5), 1.0, focusState(rowsRect, { fill: lg.spread ? 0.62 : 0.86 }), "inOutSine");
    }
    var lastT = rowsMade.length ? rt[rt.length - 1] + 0.9 : key + 1.2;
    var back = clamp(lastT, key + 0.8, D - 1.7);
    addMove(back, Math.min(1.5, D - back - 0.1), whole, "inOutSine");
  }

  function tChapter(root, p) {
    desk(root, {});
    var subject = subjectId(p.subject) || "city", tone = toneId(p.tone) || "sepia";
    var ph = photo({ subject: subject, tone: tone, cx: W / 2, cy: H / 2, w: TALL ? W * 0.9 : W * 0.66, rot: -1, res: 1.3, seed: 5600, mounts: false });
    var dim = div("ad-dim", ph.el, "position:absolute;left:0;top:0;width:" + f1(ph.w) + "px;height:" + f1(ph.h) + "px;background:rgba(10,7,4,0.5)");
    dim.style.pointerEvents = "none";
    fadeIn(0, 1.3);
    var ir = ph.imgRect();
    st.cam.init = kbState(ir, { fx: 0.5, fy: 0.5, zoom: TALL ? 1.0 : 1.02 });
    addMove(0.05, Math.max(1, D - 0.2), kbState(ir, { fx: 0.5, fy: 0.42, zoom: TALL ? 1.12 : 1.16 }), "inOutSine");
    var chapT = tc(kwOr(null, p.chapter, 0.35), 0.3);
    var titleT = tc(kwOr(p.keyword, p.title, chapT + 0.8, chapT), Math.min(0.7, chapT + 0.4));
    var subT = tc(kwOr(null, p.subtitle, titleT + 1, titleT + 0.4), titleT + 0.6);
    var dline = [ascii(p.date), ascii(p.place)].filter(Boolean).join("   ");
    titleCard(p.title || "Chapter", { kicker: p.chapter, sub: p.subtitle, date: dline, at: Math.min(chapT, titleT - 0.2), titleAt: titleT, subAt: subT, dateAt: Math.min(endBy() - 0.6, subT + 0.6) });
  }

  function tThenNow(root, p) {
    desk(root, {});
    var th = obj(p.then), nw = obj(p.now);
    var s1 = subjectId(th.subject) || "street", s2 = subjectId(nw.subject) || s1;
    var t1 = toneId(th.tone) || "sepia", t2 = toneId(nw.tone) || "modern";
    var hasLower = !!(p.title || p.subtitle);
    var aspect = TALL ? 1.35 : 1.4, pw = TALL ? W * 0.8 : SQUARE ? W * 0.44 : W * 0.4;
    var c1 = TALL ? [W * 0.5, H * 0.3] : [W * 0.285, H * 0.47], c2 = TALL ? [W * 0.5, H * 0.62] : [W * 0.715, H * 0.47];
    var a = photo({ subject: s1, tone: t1, aspect: aspect, w: pw, cx: c1[0], cy: c1[1], rot: -2, caption: th.label, res: 1.6, seed: 5700 });
    var b = photo({ subject: s2, tone: t2, aspect: aspect, w: pw, cx: c2[0], cy: c2[1], rot: 1.8, caption: nw.label, res: 1.6, seed: 5701, mounts: false });
    function yearTag(ph, yr, seed, side) {
      yr = ascii(yr);
      if (!yr) return null;
      return labelStrip(yr, { h: u(64), cx: side ? ph.x + ph.w * 0.84 : ph.x + ph.w * 0.16, cy: side ? ph.y + ph.h - u(6) : ph.y + u(6), rot: side ? 3 : -4, seed: seed, layer: "front" });
    }
    var key = tc(kwOr(p.keyword, nw.year, D * 0.5), 1.4);
    var ya = yearTag(a, th.year, 5710, 0), yb = yearTag(b, nw.year, 5711, 1);
    place(a, 0.05, "develop", { dur: 1.2 });
    if (ya) place(ya, tc(kwOr(null, th.year, 0.6), 0.4), "drop", { dur: 0.45 });
    // the year tags are key content in the two-print view, not during the close-up on the old print
    [ya, yb].forEach(function (tg) { if (tg) tg.keys.forEach(function (k) { k.from = key + 1.3; }); });
    place(b, key - 0.5, "slide", { dur: 0.9, from: TALL ? "bottom" : "right" });
    if (yb) place(yb, key + 0.3, "drop", { dur: 0.45 });
    var ia = a.imgRect();
    st.cam.init = kbState(ia, { fx: 0.5, fy: 0.5, zoom: TALL ? 0.6 : 0.82 });
    addMove(0.1, Math.max(0.6, key - 0.9), kbState(ia, { fx: 0.45, fy: 0.45, zoom: TALL ? 0.66 : 0.92 }), "inOutSine");
    var both = { x: Math.min(a.x, b.x) - u(20), y: Math.min(a.y, b.y) - u(60) };
    both.w = Math.max(a.x + a.w, b.x + b.w) + u(20) - both.x; both.h = Math.max(a.y + a.h, b.y + b.h) + u(20) - both.y;
    addMove(key - 0.9, Math.min(1.7, D - key + 0.8), focusState(both, { fill: 0.94, lower: hasLower }), "inOutSine");
    if (hasLower) lowerThird(p.title, { sub: p.subtitle, at: Math.min(D - 1.3, key + 1.4) });
  }

  function tFilm(root, p) {
    desk(root, { surface: "lightbox" });
    var frames = arr(p.frames).slice(0, 6).map(obj);
    if (!frames.length) frames = [{ subject: "street" }, { subject: "crowd" }];
    var n = frames.length, tone = toneId(p.tone) || "silver";
    var fw = TALL ? W * 0.7 : SQUARE ? W * 0.62 : W * 0.4;
    var strip = filmstrip({ frames: frames, frameW: fw, tone: tone, vertical: TALL, x: 0, y: 0, seed: 5800 });
    var cx = W / 2, cy = TALL ? H * 0.43 : H * 0.47;
    // park the strip so frame 0 sits under the loupe, slide it frame by frame
    var times = beatTimes(frames.map(function (f) { return { label: f.caption || f.subject }; }), { lo: 0.5, gap: 1.0, hi: endBy() - 1.0 });
    var offs = [];
    for (var i = 0; i < n; i++) { var r = strip.frameLocal(i); offs.push(TALL ? [cx - (r.x + r.w / 2), cy - (r.y + r.h / 2)] : [cx - (r.x + r.w / 2), cy - (r.y + r.h / 2)]); }
    strip.holder.style.left = "0px"; strip.holder.style.top = "0px";
    var enter = TALL ? [offs[0][0], offs[0][1] + H * 0.8] : [offs[0][0] + W * 0.9, offs[0][1]];
    function offAt(t) {
      if (t < 0.6) { var q = outC(prog(t, 0.05, 0.55)); return [lerp(enter[0], offs[0][0], q), lerp(enter[1], offs[0][1], q)]; }
      var o = offs[0];
      for (var k = 1; k < n; k++) {
        var a = times[k] - 0.55, d = 0.7;
        if (t < a) break;
        var q2 = inOutS(prog(t, a, d));
        o = [lerp(offs[k - 1][0], offs[k][0], q2), lerp(offs[k - 1][1], offs[k][1], q2)];
      }
      return o;
    }
    onUpd(function (t) { var o = offAt(t); setS(strip.el, "transform", "translate(" + f2(o[0]) + "px," + f2(o[1]) + "px)"); }, -1);
    strip.keys = [];
    var lr = (TALL ? fw / 1.5 : fw / 1.5) * 0.7;
    var lp = loupe({ cx: cx + lr * 0.12, cy: cy + lr * 0.05, r: lr, layer: "front" });
    lp.keys = [];
    var fr0 = { x: cx - fw / 2, y: cy - fw / 1.5 / 2, w: fw, h: fw / 1.5 };
    st.cam.init = focusState(fr0, { fill: TALL ? 0.84 : 0.8, target: contentRect({ lower: true }) });
    addMove(0.2, Math.max(1, D - 0.4), focusState(fr0, { fill: TALL ? 0.88 : 0.86, target: contentRect({ lower: true }) }), "inOutSine");
    frames.forEach(function (f, i) {
      var cap = ascii(f.caption);
      if (!cap) return;
      var a = Math.max(0.3, times[i] - 0.15), e = i + 1 < n ? times[i + 1] - 0.6 : D + 1;
      subtitle(cap, { at: a, end: e });
    });
    if (p.title) dateStamp(p.title, { sub: p.subtitle, at: 0.3, pos: "tl" });
  }

  var TEMPLATES = {
    "photo-pan": tPhotoPan, "newspaper-headline": tNewspaper, "map-route": tMapRoute, "document-reveal": tDocument,
    "timeline-ribbon": tTimeline, "evidence-board": tEvidence, "letter-excerpt": tLetter, "stat-ledger": tLedger,
    "chapter-title": tChapter, "then-vs-now": tThenNow, "film-reel": tFilm
  };
  S.render = function (id, root, props) {
    var fn = TEMPLATES[id];
    if (!fn) throw new Error("dusty-archive: unknown template " + id);
    root = root || V.root();
    fn(root, obj(props));
  };
  S.fallback = function (root, narration) {
    root = root || V.root();
    try { while (root.firstChild) root.removeChild(root.firstChild); } catch (e) {}
    st = null;
    desk(root, {});
    var ph = photo({ subject: "landscape", tone: "sepia", cx: W / 2, cy: H * 0.47, w: TALL ? W * 0.84 : W * 0.56, rot: -1, res: 1.2, seed: 77 });
    place(ph, 0.05, "develop", { dur: 1.2 });
    var whole = focusState(ph, { fill: 0.9, lower: true });
    st.cam.init = whole;
    addMove(0.3, Math.max(1, D - 0.5), kbState(ph.imgRect(), { fx: 0.5, fy: 0.45, zoom: 1.1 }), "inOutSine");
    var words = ascii(narration).split(/\s+/).filter(Boolean).slice(0, 12).join(" ");
    if (words) subtitle(words, { at: 0.4 });
    S.flush();
  };
  S.stage = function (root) {
    desk(root, {});
    var sf = safe();
    return div("ad-stage", st.overEl, "position:absolute;left:" + f1(sf.x0) + "px;top:" + f1(sf.y0) + "px;width:" + f1(sf.w) + "px;height:" + f1(sf.h) + "px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:" + f1(u(20)) + "px");
  };

  // ------------------------- public API -------------------------
  S.desk = desk;
  S.camera = camera;
  S.place = place;
  S.removeItem = removeItem;
  S.photo = photo;
  S.document = documentItem;
  S.stamp = stamp;
  S.newspaper = newspaper;
  S.map = mapItem;
  S.indexCard = indexCard;
  S.pin = pin;
  S.string = string;
  S.letter = letter;
  S.ledger = ledger;
  S.inkCircle = inkCircle;
  S.filmstrip = filmstrip;
  S.envelope = envelope;
  S.loupe = loupe;
  S.pen = pen;
  S.stain = stain;
  S.tape = tape;
  S.paperclip = paperclip;
  S.clutter = clutter;
  S.textCanvas = textCanvas;
  S.lowerThird = lowerThird;
  S.dateStamp = dateStamp;
  S.subtitle = subtitle;
  S.titleCard = titleCard;
  S.fadeIn = fadeIn;
  S.fadeOut = fadeOut;
  S.onFrame = function (fn) { if (typeof fn === "function") onUpd(fn, 5); };
  S.safe = safe;
  S.contentRect = contentRect;
  S.fonts = { serif: FONT.serif, times: FONT.times, type: FONT.type, hand: FONT.hand };
  S.subjectIds = SUBJECTS.slice();
  S.tones = ["sepia", "silver", "cyanotype", "faded", "modern"];
  S.templates = Object.keys(TEMPLATES);
  S.paper = function (parent, w, h, o) { var pc = paperCanvas(w, h, o); placeCanvas(parent && parent.el ? parent.el : parent || ensure().layers.mid, pc, w, h); return pc; };
  S.photoImage = function (subject, tone, w, h, seed) { return photoImage(subjectId(subject) || "portrait", toneId(tone) || "sepia", w, h, num(seed, 1)).canvas; };
})();

/* Brush Strokes engine (style id: brush-strokes).
 *
 * Every scene is a history-book battle painting in warm oils, seen by a slow camera.
 *
 * Architecture
 * - Build time (S.scene): one painting (.ph) holds parallax layers sky, far, mid, ground, near. Each layer
 *   is a div in world px holding a canvas painted ONCE with the procedural oil toolkit:
 *     1. underpaint: flat and graded shapes (skies, ridges, fields, trees, walls) on a canvas;
 *     2. oilPass: Hertzmann-style restroke: brush strokes on a jittered grid, coarse to fine, each colour sampled
 *        from the underpaint, direction from a seeded flow field (value-noise fbm), bent quadratic strokes with
 *        bristle streaks and an impasto ridge (a lit edge toward the light, a dark edge away from it);
 *     3. glazes: translucent warm light and cool shadow gradients on top.
 *   A screen-space varnish canvas (canvas weave, craquelure, vignette, warm varnish) is painted once and sits
 *   over the painting, under the text overlays.
 * - Figures (soldiers, horses, guns, flags, smoke, commanders) are painted sprites: one geometry function per
 *   figure returns SVG path data (also exported as markup), painted once per faction / pose / walk phase into
 *   small canvases (base colour, light gradient, brush dabs, soft dark edge). Every frame each layer that has
 *   figures clears ONE screen-space canvas and draws its sprites sorted by ground y with the camera matrix, so
 *   figures stay sharp at any zoom. Perspective: a figure's scale follows its ground y (horizon to foreground).
 * - One frame function (V.onFrame) computes the camera from t (moves are folded in time order, each starting
 *   from the state the earlier moves give at its start), sets the layer transforms, redraws the figure canvases
 *   and calls every overlay updater with t. Nothing reads the previous frame, so seeking works both ways.
 * - Overlays (banners, versus counts, lower-thirds, quotes, captions, title cards) are HTML text over painted
 *   parchment canvases, revealed with clip-path wipes, opacity and slides (no scale on text).
 * - Timing: templates find the keyword with V.find, then a narration estimate, then a share of the duration;
 *   every beat is clamped into [0.2, duration - 1].
 * No network, no timers, no wall clock; randomness only from V.makeRand and fixed hashes.
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
  var PORT = H > W * 1.15, SQ = !PORT && W < H * 1.15;
  var UU = Math.min(W, H) / 1080;
  var SERIF = '"Times New Roman", Times, Georgia, serif';
  var SERIF2 = 'Georgia, "Times New Roman", Times, serif';

  // ------------------------- small utils -------------------------
  function u(px) { return px * UU; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, p) { return a + (b - a) * p; }
  function num(v, d) { var n = typeof v === "number" ? v : parseFloat(v); return isFinite(n) ? n : d; }
  function f1(n) { return Math.round(n * 10) / 10; }
  function f2(n) { return Math.round(n * 100) / 100; }
  function str(v) { return typeof v === "string" ? v.trim() : v == null ? "" : String(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function smooth(p) { p = clamp(p, 0, 1); return p * p * (3 - 2 * p); }
  function soft(p) { return -(Math.cos(PI * clamp(p, 0, 1)) - 1) / 2; }
  function outC(p) { p = clamp(p, 0, 1); return 1 - Math.pow(1 - p, 3); }
  function inQ(p) { p = clamp(p, 0, 1); return p * p; }
  function prog(t, a, d) { return d > 0 ? clamp((t - a) / d, 0, 1) : t >= a ? 1 : 0; }
  function hstr(s) { s = String(s); var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 100000; }
  function rng(seed) { return V.makeRand((Math.floor(num(seed, 1) * 9973 + 17) >>> 0) || 1); }
  function hash2(ix, iy, s) {
    var h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul((s | 0) + 1013, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, s) {
    var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    var a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
    var ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }
  function fbm(x, y, s, oct) { var v = 0, a = 0.5, f = 1, n = 0; oct = oct || 3; for (var i = 0; i < oct; i++) { v += a * vnoise(x * f, y * f, s + i * 17); n += a; a *= 0.5; f *= 2.03; } return v / n; }
  function noise1(t, s) { return vnoise(t, 0.5, s) * 2 - 1; }
  function svg(tag, attrs, parent) {
    var n = doc.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function div(cls, parent, text) {
    var n = doc.createElement("div");
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function place(el, x, y, w, h) {
    el.style.left = f1(x) + "px"; el.style.top = f1(y) + "px";
    if (w != null) el.style.width = f1(w) + "px";
    if (h != null) el.style.height = f1(h) + "px";
    return el;
  }
  function setS(el, k, v) { v = String(v); if (el["_s" + k] !== v) { el["_s" + k] = v; el.style[k] = v; } }
  function show(el, on) { setS(el, "display", on ? "" : "none"); }
  var COMB = new RegExp("[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]", "g");
  function normWord(s) { return String(s == null ? "" : s).toLowerCase().normalize("NFKD").replace(COMB, "").replace(/[^\p{L}\p{N}]+/gu, ""); }

  // ------------------------- colour -------------------------
  function hexRGB(h) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(h));
    if (!m) { var m3 = /^#?([0-9a-f]{3})$/i.exec(String(h)); if (m3) return hexRGB(m3[1].replace(/./g, function (c) { return c + c; })); return [128, 128, 128]; }
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbHex(c) { return "#" + ((1 << 24) | (clamp(Math.round(c[0]), 0, 255) << 16) | (clamp(Math.round(c[1]), 0, 255) << 8) | clamp(Math.round(c[2]), 0, 255)).toString(16).slice(1); }
  function mixC(a, b, p) { var x = hexRGB(a), y = hexRGB(b); return rgbHex([lerp(x[0], y[0], p), lerp(x[1], y[1], p), lerp(x[2], y[2], p)]); }
  function mulC(h, k) { var c = hexRGB(h); return rgbHex([c[0] * k, c[1] * k, c[2] * k]); }
  // shade(hex, -0.3..0.3): negative darkens toward umber, positive lightens toward warm cream
  function shade(h, k) { k = num(k, 0); return k < 0 ? mixC(h, "#140C06", -k) : mixC(h, "#FFF4DC", k); }
  function rgba(h, a) { var c = hexRGB(h); return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + f2(clamp(num(a, 1), 0, 1)) + ")"; }
  function rgbS(r, g, b) { return "rgb(" + (r < 0 ? 0 : r > 255 ? 255 : r | 0) + "," + (g < 0 ? 0 : g > 255 ? 255 : g | 0) + "," + (b < 0 ? 0 : b > 255 ? 255 : b | 0) + ")"; }
  var PAL = { umber: "#1E150D", cream: "#F3E6C8", gold: "#C8963E", muted: "#9A845F", ink: "#2A1A0E", red: "#8E1F14", blue: "#1F3566", parch: "#EEDDB4", parchDk: "#C9AE7A", goldLt: "#E6C27A", goldDk: "#8A6324" };

  // ------------------------- text -------------------------
  var mctx = null;
  function fontStr(size, o) { o = o || {}; return (o.italic ? "italic " : "") + (o.weight || 700) + " " + f1(size) + "px " + (o.family || SERIF); }
  function measure(text, size, o) {
    if (!mctx) mctx = doc.createElement("canvas").getContext("2d");
    mctx.font = fontStr(size, o);
    var w = mctx.measureText(text).width;
    if (o && o.ls) w += Math.max(0, String(text).length - 1) * o.ls * size;
    return w;
  }
  function wrapWords(words, size, maxW, o) {
    var lines = [], cur = [], cw = 0, sp = measure(" ", size, o);
    words.forEach(function (wd) {
      var ww = measure(wd, size, o);
      if (cur.length && cw + sp + ww > maxW) { lines.push({ words: cur, w: cw }); cur = []; cw = 0; }
      cw += (cur.length ? sp : 0) + ww;
      cur.push(wd);
    });
    if (cur.length) lines.push({ words: cur, w: cw });
    return lines;
  }
  // Fit text in maxW (and maxLines / maxH): shrink until it fits, then balance the lines (no orphans).
  function layoutText(text, o) {
    o = o || {};
    var words = str(text).replace(/\s+/g, " ").split(" ").filter(Boolean);
    if (!words.length) words = [""];
    var size = o.size || 60, minSize = o.minSize || size * 0.45, maxW = o.maxW || 800, lh = o.lh || 1.15, sz = size, lines;
    for (var g = 0; g < 50; g++) {
      lines = wrapWords(words, sz, maxW, o);
      var widest = 0;
      words.forEach(function (wd) { widest = Math.max(widest, measure(wd, sz, o)); });
      var okL = o.maxLines ? lines.length <= o.maxLines : true, okH = o.maxH ? lines.length * sz * lh <= o.maxH : true;
      if ((okL && okH && widest <= maxW) || sz <= minSize) break;
      sz = Math.max(minSize, sz * 0.95);
    }
    if (lines.length > 1 && o.balance !== false) {
      var lo = maxW * 0.4, hi = maxW, n = lines.length;
      for (var i = 0; i < 14; i++) {
        var mid = (lo + hi) / 2, l2 = wrapWords(words, sz, mid, o), ok = l2.length <= n;
        l2.forEach(function (l) { if (l.w > mid + 0.5) ok = false; });
        if (ok) hi = mid; else lo = mid;
      }
      lines = wrapWords(words, sz, hi + 0.5, o);
    }
    var w = 0;
    lines.forEach(function (l) { w = Math.max(w, l.w); });
    return { size: sz, lines: lines, w: w, h: lines.length * sz * lh, lh: lh };
  }
  function caps(s) { return str(s).toUpperCase(); }

  // ------------------------- word timing -------------------------
  var STOP = {};
  "a an the and or but of to in on at by for with from into onto over under is are was were be been being it its this that these those your you we our us my me i his her their they them he she as than then so not no yes do does did have has had will would can could should very just more most less each every all any some about here there what when who how why which also too up out if one".split(" ").forEach(function (w) { STOP[w] = 1; });
  function narrationEstimate(word, after) {
    var key = normWord(String(word).split(/\s+/)[0] || "");
    if (!key || !V.narration) return null;
    var toks = V.narration.split(/\s+/), total = toks.length;
    for (var pass = 0; pass < 2; pass++) {
      for (var i = 0; i < total; i++) {
        var est = 0.2 + (i / Math.max(1, total)) * (D - 0.6) * 0.95;
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
    if (after) { t = V.find(word, 0); if (t != null && t >= after - 0.5) return t; }
    return narrationEstimate(word, after);
  }
  function contentWords(text) {
    return str(text).split(/[^\p{L}\p{N}'-]+/u).filter(function (w) { var n = normWord(w); return n.length > 1 && !STOP[n]; });
  }
  function labelTime(label, keyword, after) {
    if (keyword) { var t = kwFind(keyword, after); if (t != null) return t; }
    var ws = contentWords(label).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < ws.length; i++) { var f = V.find(ws[i], after || 0); if (f != null) return f; }
    for (i = 0; i < ws.length; i++) { var e = narrationEstimate(ws[i], after); if (e != null) return e; }
    return null;
  }
  function spread(lands, a, b) {
    var n = lands.length, out = lands.slice(), i = 0;
    a = a == null ? Math.min(0.8, D * 0.1) : a;
    b = b == null ? D * 0.8 : b;
    while (i < n) {
      if (out[i] != null) { i++; continue; }
      var j = i;
      while (j < n && out[j] == null) j++;
      var cnt = j - i, left = i > 0 ? out[i - 1] : null, right = j < n ? out[j] : null, k;
      if (left == null && right == null) for (k = 0; k < cnt; k++) out[i + k] = cnt > 1 ? a + ((b - a) * k) / (cnt - 1) : a;
      else if (left == null) { var lo = Math.min(a, right * 0.5); for (k = 0; k < cnt; k++) out[i + k] = lo + ((right - lo) * k) / cnt; }
      else if (right == null) { var hi = Math.max(b, left + 0.5 * cnt); for (k = 0; k < cnt; k++) out[i + k] = left + ((hi - left) * (k + 1)) / cnt; }
      else for (k = 0; k < cnt; k++) out[i + k] = left + ((right - left) * (k + 1)) / (cnt + 1);
      i = j;
    }
    return out;
  }
  function endLimit() { return Math.max(0.4, D - (D < 4 ? 0.6 : 1.0)); }
  function tc(t) { return clamp(num(t, 0.2), 0.2, endLimit()); }
  // Keyword time for a template: keyword, else a fallback share of the duration; clamped so `need` seconds fit after it.
  function keyTime(keyword, share, need, label) {
    var t = labelTime(label || "", keyword || "", 0);
    if (t == null) t = D * (share == null ? 0.45 : share);
    return clamp(t, Math.min(0.6, D * 0.2), Math.max(0.5, D - 1 - (need || 0)));
  }
  function itemTimes(items, o) {
    o = o || {};
    var prev = o.after || 0, out = [];
    items.forEach(function (it) {
      var t = labelTime(it.label || "", it.keyword || "", prev);
      if (t != null && t < prev - 0.05) t = null;
      out.push(t);
      if (t != null) prev = t + 0.01;
    });
    out = spread(out, o.a, o.b);
    var gap = o.gap == null ? 0.35 : o.gap;
    for (var i = 1; i < out.length; i++) if (out[i] < out[i - 1] + gap) out[i] = out[i - 1] + gap;
    var lim = (o.limit || endLimit()) - (o.tail || 0);
    for (i = out.length - 1; i >= 0; i--) {
      var maxI = lim - (out.length - 1 - i) * gap * 0.6;
      if (out[i] > maxI) out[i] = maxI;
    }
    return out.map(function (t) { return tc(t - (o.lead || 0)); });
  }
  function alignWords(tokens, from, to) {
    var ws = V.words || [], nw = ws.map(function (w) { return normWord(w.word); });
    var cur = 0, out = [];
    from = from || 0;
    to = to == null ? endLimit() : to;
    while (cur < ws.length && ws[cur].start < from - 0.35) cur++;
    tokens.forEach(function (tok) {
      var n = normWord(tok), hit = -1;
      if (n) {
        for (var i = cur; i < Math.min(ws.length, cur + 5); i++) {
          if (nw[i] === n || (n.length >= 4 && nw[i].length >= 4 && (nw[i].indexOf(n) === 0 || n.indexOf(nw[i]) === 0))) { hit = i; break; }
        }
      }
      if (hit >= 0) { out.push(ws[hit].start); cur = hit + 1; } else out.push(null);
    });
    var found = out.filter(function (t) { return t != null; }).length;
    if (!found) {
      var n = tokens.length;
      return tokens.map(function (_, i) { return from + ((Math.max(from + 0.5, to) - from) * i) / Math.max(1, n); });
    }
    out = spread(out, from, to);
    for (var i = 1; i < out.length; i++) if (out[i] < out[i - 1]) out[i] = out[i - 1];
    return out;
  }
  function speechSpan() {
    var ws = V.words || [];
    if (!ws.length) return { start: 0.3, end: endLimit() };
    return { start: ws[0].start, end: Math.min(D, ws[ws.length - 1].end) };
  }

  // ------------------------- the oil toolkit -------------------------
  function mkCanvas(w, h, cls) {
    var c = doc.createElement("canvas");
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    if (cls) c.className = cls;
    return c;
  }
  // Restroke a canvas that holds its underpaint. o: sizes (brush radii in 1080p px, coarse to fine), k (px scale),
  // dir (angle or fn(x,y)), flow (radians of flow-field swing), fscale (flow feature size), len [min,max] in radii,
  // alpha, jitter (colour), impasto (share of strokes with a ridge), bristle (share with bristle streaks),
  // detail (contrast that earns fine strokes), keep (share of fine strokes kept anyway), seed, x0,y0,x1,y1 (region).
  function oilPass(c, o) {
    o = o || {};
    var ctx = c.getContext("2d"), w = c.width, h = c.height;
    if (w < 3 || h < 3) return c;
    var data = ctx.getImageData(0, 0, w, h).data;
    var seed = o.seed || 7, r = rng(seed), k = o.k || UU;
    var sizes = o.sizes || [16, 8, 4];
    var fs = (o.fscale || 260) * k, flow = o.flow == null ? 0.55 : o.flow;
    var dirF = typeof o.dir === "function" ? o.dir : null, dir0 = num(o.dir, 0);
    var Lmin = o.len ? o.len[0] : 1.3, Lmax = o.len ? o.len[1] : 3.0;
    var alpha = o.alpha == null ? 0.88 : o.alpha, jit = o.jitter == null ? 26 : o.jitter, brk = o.broken == null ? 34 : o.broken;
    var imp = o.impasto == null ? 0.3 : o.impasto, bri = o.bristle == null ? 0.45 : o.bristle;
    var thr = o.detail == null ? 26 : o.detail, keep = o.keep == null ? 0.1 : o.keep;
    var minA = o.minAlpha == null ? 150 : o.minAlpha;
    var X0 = o.x0 || 0, Y0 = o.y0 || 0, X1 = o.x1 == null ? w : o.x1, Y1 = o.y1 == null ? h : o.y1;
    var lx = -0.55, ly = -0.83;
    function idx(x, y) { x = x < 0 ? 0 : x >= w ? w - 1 : x | 0; y = y < 0 ? 0 : y >= h ? h - 1 : y | 0; return (y * w + x) * 4; }
    function lumAt(i) { return data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11 + (255 - data[i + 3]) * 0.6; }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (var pass = 0; pass < sizes.length; pass++) {
      var R = sizes[pass] * k, step = R * (pass === 0 ? 0.9 : 0.8);
      for (var gy = Y0 - step * 0.5; gy < Y1 + step * 0.5; gy += step) {
        for (var gx = X0 - step * 0.5; gx < X1 + step * 0.5; gx += step) {
          var px = gx + (r() - 0.5) * step, py = gy + (r() - 0.5) * step;
          var i = idx(px, py);
          if (data[i + 3] < minA) continue;
          if (pass > 0) {
            var d = R * 1.6, l0 = lumAt(i);
            var m = Math.max(Math.abs(lumAt(idx(px + d, py)) - l0), Math.abs(lumAt(idx(px - d, py)) - l0), Math.abs(lumAt(idx(px, py + d)) - l0), Math.abs(lumAt(idx(px, py - d)) - l0));
            if (m < thr && r() > keep) continue;
          }
          var cr = data[i], cg = data[i + 1], cb = data[i + 2];
          var ang = (dirF ? dirF(px, py) : dir0) + (fbm(px / fs, py / fs, seed, 2) - 0.5) * 2 * flow + (r() - 0.5) * 0.35;
          var L = R * (Lmin + r() * (Lmax - Lmin)), ca = Math.cos(ang), sa = Math.sin(ang);
          var j = (r() - 0.5) * jit, warm = (r() - 0.5) * jit * 0.6 + (fbm(px / (fs * 0.6), py / (fs * 0.6), seed + 77, 2) - 0.5) * brk;
          var sr = cr + j + warm, sg = cg + j + warm * 0.2, sb = cb + j - warm;
          var lw = R * (0.7 + r() * 0.55);
          var x0 = px - ca * L / 2, y0 = py - sa * L / 2, x1 = px + ca * L / 2, y1 = py + sa * L / 2, bend = (r() - 0.5) * L * 0.4;
          var qx = px - sa * bend, qy = py + ca * bend;
          ctx.globalAlpha = alpha * (0.72 + r() * 0.28);
          ctx.strokeStyle = rgbS(sr, sg, sb);
          ctx.lineWidth = lw;
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(qx, qy, x1, y1); ctx.stroke();
          var nx = -sa, ny = ca;
          if (nx * lx + ny * ly < 0) { nx = -nx; ny = -ny; }
          if (pass === 0 && r() < bri) { // bristle streaks along the stroke
            ctx.lineWidth = Math.max(0.6, lw * 0.12);
            for (var b = 0; b < 2; b++) {
              var off = (b ? -0.22 : 0.18) * lw, dk = b ? -22 : 14;
              ctx.globalAlpha = 0.3;
              ctx.strokeStyle = rgbS(sr + dk * 1.4, sg + dk * 1.4, sb + dk * 1.1);
              ctx.beginPath(); ctx.moveTo(x0 + nx * off, y0 + ny * off); ctx.quadraticCurveTo(qx + nx * off, qy + ny * off, x1 + nx * off, y1 + ny * off); ctx.stroke();
            }
          }
          if (r() < imp) { // impasto ridge
            var o2 = lw * 0.36;
            ctx.lineWidth = Math.max(0.7, lw * 0.16);
            ctx.globalAlpha = 0.3 + r() * 0.2;
            ctx.strokeStyle = rgbS(sr + 50, sg + 44, sb + 30);
            ctx.beginPath(); ctx.moveTo(x0 + nx * o2, y0 + ny * o2); ctx.quadraticCurveTo(qx + nx * o2, qy + ny * o2, x1 + nx * o2, y1 + ny * o2); ctx.stroke();
            ctx.globalAlpha = 0.22;
            ctx.strokeStyle = rgbS(sr - 56, sg - 56, sb - 48);
            ctx.beginPath(); ctx.moveTo(x0 - nx * o2, y0 - ny * o2); ctx.quadraticCurveTo(qx - nx * o2, qy - ny * o2, x1 - nx * o2, y1 - ny * o2); ctx.stroke();
          }
        }
      }
    }
    ctx.restore();
    return c;
  }
  // Oil pass that keeps the silhouette: strokes may not spill past the shape's original alpha.
  function oilInside(c, o) {
    var keep = mkCanvas(c.width, c.height);
    keep.getContext("2d").drawImage(c, 0, 0);
    oilPass(c, o);
    var ctx = c.getContext("2d");
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = "destination-in"; ctx.drawImage(keep, 0, 0); ctx.restore();
    return c;
  }
  // A translucent glaze: linear (x0,y0 -> x1,y1) or radial (cx,cy,r) gradient of [offset, colour, alpha] stops.
  function glaze(ctx, g, stops, rect) {
    var gr = g.r != null ? ctx.createRadialGradient(g.cx, g.cy, g.r0 || 0, g.cx, g.cy, g.r) : ctx.createLinearGradient(g.x0, g.y0, g.x1, g.y1);
    stops.forEach(function (s) { gr.addColorStop(s[0], rgba(s[1], s[2])); });
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = gr;
    if (rect) ctx.fillRect(rect[0], rect[1], rect[2], rect[3]);
    else ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.restore();
  }
  // Soft blob (radial gradient ellipse), used for clouds, glows, cloud shadows.
  function blob(ctx, x, y, rx, ry, colour, a, rot) {
    ctx.save();
    ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.scale(1, ry / rx);
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, rgba(colour, a)); g.addColorStop(0.55, rgba(colour, a * 0.6)); g.addColorStop(1, rgba(colour, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // Brush dabs in a box (used by S.dabs and the landscape): short strokes of the given colours.
  function dabsCtx(ctx, x, y, w, h, colours, n, size, r) {
    ctx.save();
    ctx.lineCap = "round";
    for (var i = 0; i < n; i++) {
      var px = x + r() * w, py = y + r() * h, a = (r() - 0.5) * 0.9, L = size * (1 + r() * 1.5);
      ctx.globalAlpha = 0.35 + r() * 0.45;
      ctx.strokeStyle = colours[Math.floor(r() * colours.length)] || "#806040";
      ctx.lineWidth = size * (0.5 + r() * 0.6);
      ctx.beginPath(); ctx.moveTo(px - Math.cos(a) * L / 2, py - Math.sin(a) * L / 2); ctx.lineTo(px + Math.cos(a) * L / 2, py + Math.sin(a) * L / 2); ctx.stroke();
    }
    ctx.restore();
  }
  // Canvas weave tile (threads over and under), alpha-only light and dark.
  var weaveC = null;
  function weaveTile() {
    if (weaveC) return weaveC;
    var p = Math.max(3, Math.round(4.2 * UU)), n = p * 32, c = mkCanvas(n, n), ctx = c.getContext("2d"), img = ctx.createImageData(n, n), d = img.data;
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
      var tx = Math.floor(x / p), ty = Math.floor(y / p), over = (tx + ty) % 2 === 0;
      var fx = (x % p) / p, fy = (y % p) / p;
      var v = over ? Math.sin(fy * PI) : Math.sin(fx * PI);
      var th = hash2(over ? ty : tx, over ? 3 : 5, 91), sl = hash2(x >> 1, y >> 1, 17);
      var val = v * 0.68 + th * 0.22 + sl * 0.1, i = (y * n + x) * 4;
      if (val < 0.5) { d[i] = 40; d[i + 1] = 26; d[i + 2] = 12; d[i + 3] = (0.5 - val) * 2 * 54; }
      else { d[i] = 255; d[i + 1] = 240; d[i + 2] = 205; d[i + 3] = (val - 0.5) * 2 * 26; }
    }
    ctx.putImageData(img, 0, 0);
    weaveC = c;
    return c;
  }
  // Craquelure: a network of fine cracks, denser toward the corners.
  function craquelure(ctx, w, h, seed, strength) {
    var r = rng(seed || 3), n = Math.round(130 * (w * h) / (1920 * 1080)), s = strength == null ? 1 : strength;
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (var i = 0; i < n; i++) {
      var x = r() * w, y = r() * h, dx = x / w - 0.5, dy = y / h - 0.5, edge = clamp(Math.hypot(dx, dy) * 1.9, 0.25, 1);
      var a = r() * TAU, segs = 5 + Math.floor(r() * 9), L = u(9 + r() * 14);
      var pts = [[x, y]];
      for (var k = 0; k < segs; k++) { a += (r() - 0.5) * 1.3; x += Math.cos(a) * L; y += Math.sin(a) * L; pts.push([x, y]); }
      ctx.globalAlpha = (0.07 + r() * 0.08) * edge * s;
      ctx.strokeStyle = "#1C1208"; ctx.lineWidth = Math.max(0.7, u(0.9));
      ctx.beginPath(); pts.forEach(function (p, j) { if (j) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.stroke();
      ctx.globalAlpha *= 0.6; ctx.strokeStyle = "#FFF0D0";
      ctx.beginPath(); pts.forEach(function (p, j) { if (j) ctx.lineTo(p[0] + 1, p[1] + 1); else ctx.moveTo(p[0] + 1, p[1] + 1); }); ctx.stroke();
      if (r() < 0.5) { // a branch
        var b = pts[Math.floor(r() * pts.length)], ba = a + (r() < 0.5 ? 1.2 : -1.2), bx = b[0], by = b[1];
        ctx.globalAlpha = (0.05 + r() * 0.06) * edge * s; ctx.strokeStyle = "#1C1208";
        ctx.beginPath(); ctx.moveTo(bx, by);
        for (k = 0; k < 4; k++) { ba += (r() - 0.5) * 1.1; bx += Math.cos(ba) * L * 0.8; by += Math.sin(ba) * L * 0.8; ctx.lineTo(bx, by); }
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  // Screen varnish: weave, craquelure, vignette and warm varnish over the whole painting.
  function paintVarnish(o) {
    o = o || {};
    var c = mkCanvas(W, H, "ph-varnish"), ctx = c.getContext("2d");
    ctx.fillStyle = ctx.createPattern(weaveTile(), "repeat");
    ctx.globalAlpha = o.weave == null ? 0.38 : o.weave;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    craquelure(ctx, W, H, 11, o.cracks);
    var R = Math.hypot(W, H) / 2;
    glaze(ctx, { cx: W * 0.5, cy: H * 0.46, r0: R * 0.42, r: R * 1.02 }, [[0, "#1A0F06", 0], [0.62, "#1A0F06", 0.16], [1, "#120A04", o.vignette == null ? 0.55 : o.vignette]]);
    glaze(ctx, { x0: 0, y0: 0, x1: W, y1: H }, [[0, "#C89038", 0.045], [0.5, "#B07A2A", 0.02], [1, "#8A5418", 0.07]]);
    return c;
  }
  // A parchment strip for banners: cream base, mottling, horizontal brush streaks, rough darker edges, soft shadow.
  function parchment(w, h, o) {
    o = o || {};
    var pad = Math.ceil(u(18)), c = mkCanvas(w + pad * 2, h + pad * 2), ctx = c.getContext("2d"), r = rng(o.seed || hstr(w + "x" + h));
    var base = o.base || PAL.parch, edgeC = o.edge || "#9C7A44";
    function outline(dx, dy, grow) {
      var p = new Path2D(), n = Math.max(12, Math.round((w + h) / u(14))), pts = [], i;
      for (i = 0; i <= n; i++) pts.push([pad + (w * i) / n, pad - grow + (r() - 0.5) * u(5)]);
      for (i = 0; i <= 6; i++) pts.push([pad + w + grow + (r() - 0.5) * u(5), pad + (h * i) / 6]);
      for (i = n; i >= 0; i--) pts.push([pad + (w * i) / n, pad + h + grow + (r() - 0.5) * u(5)]);
      for (i = 6; i >= 0; i--) pts.push([pad - grow + (r() - 0.5) * u(5), pad + (h * i) / 6]);
      pts.forEach(function (q, j) { if (j) p.lineTo(q[0] + dx, q[1] + dy); else p.moveTo(q[0] + dx, q[1] + dy); });
      p.closePath();
      return p;
    }
    if (o.shadow !== false) {
      ctx.save(); ctx.filter = "blur(" + f1(u(7)) + "px)"; ctx.fillStyle = "rgba(15,8,2,0.55)"; ctx.fill(outline(u(3), u(6), 0)); ctx.restore();
    }
    var shape = outline(0, 0, 0);
    ctx.save();
    ctx.clip(shape);
    ctx.fillStyle = base; ctx.fillRect(0, 0, c.width, c.height);
    for (var i = 0; i < 14; i++) blob(ctx, pad + r() * w, pad + r() * h, u(40 + r() * 120), u(20 + r() * 50), r() < 0.5 ? "#FFF6E0" : "#D9BF8C", 0.35);
    ctx.lineCap = "round";
    for (i = 0; i < Math.round((w * h) / u(900)); i++) {
      var x = pad + r() * w, y = pad + r() * h, L = u(20 + r() * 70);
      ctx.globalAlpha = 0.08 + r() * 0.1; ctx.strokeStyle = r() < 0.5 ? "#FFF8E8" : "#B89A64"; ctx.lineWidth = u(2 + r() * 5);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + L / 2, y + (r() - 0.5) * u(4), x + L, y + (r() - 0.5) * u(3)); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    var eg = ctx.createLinearGradient(0, pad, 0, pad + h);
    eg.addColorStop(0, rgba(edgeC, 0.35)); eg.addColorStop(0.18, rgba(edgeC, 0)); eg.addColorStop(0.82, rgba(edgeC, 0)); eg.addColorStop(1, rgba(edgeC, 0.42));
    ctx.fillStyle = eg; ctx.fillRect(0, 0, c.width, c.height);
    var eg2 = ctx.createLinearGradient(pad, 0, pad + w, 0);
    eg2.addColorStop(0, rgba(edgeC, 0.4)); eg2.addColorStop(0.08, rgba(edgeC, 0)); eg2.addColorStop(0.92, rgba(edgeC, 0)); eg2.addColorStop(1, rgba(edgeC, 0.4));
    ctx.fillStyle = eg2; ctx.fillRect(0, 0, c.width, c.height);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = 0.55; ctx.strokeStyle = edgeC; ctx.lineWidth = u(2);
    ctx.stroke(shape);
    if (o.rule !== false && h > u(40)) {
      ctx.globalAlpha = 0.5; ctx.strokeStyle = o.ruleC || "#8A6324"; ctx.lineWidth = u(1.6);
      var m = Math.min(u(10), h * 0.12);
      ctx.strokeRect(pad + m, pad + m, w - 2 * m, h - 2 * m);
    }
    ctx.restore();
    c._pad = pad;
    return c;
  }

  // ------------------------- skies and terrains -------------------------
  var SKIES = {
    golden: { top: "#56637A", mid: "#C29A60", hz: "#F0D398", sun: [0.76, 0.3], sunC: "#FFF2CC", glow: "#FFD27A", cloud: "#F2D6A2", cloudDk: "#86694E", light: "#FFD38E", shadow: "#2B1D12", haze: "#E2C28A", grade: "#F2C474", gradeA: 0.12, n: 7 },
    dawn: { top: "#4A5878", mid: "#B48E96", hz: "#F2C49C", sun: [0.22, 0.4], sunC: "#FFE8CC", glow: "#FFC294", cloud: "#EEC4AA", cloudDk: "#6A5A6C", light: "#FFCFA8", shadow: "#241C26", haze: "#D9B6A6", grade: "#F0B898", gradeA: 0.12, n: 6 },
    dusk: { top: "#2A2436", mid: "#984630", hz: "#E68842", sun: [0.7, 0.44], sunC: "#FFD08A", glow: "#FF8838", cloud: "#D67446", cloudDk: "#46282A", light: "#FF9A50", shadow: "#1A0E0C", haze: "#B4623C", grade: "#E07A3A", gradeA: 0.16, n: 7 },
    storm: { top: "#34383C", mid: "#5E5E58", hz: "#968E7E", sun: null, sunC: "#D8D0BC", glow: "#B8AE98", cloud: "#86837A", cloudDk: "#2A2A2A", light: "#C8C0AA", shadow: "#151515", haze: "#8A8476", grade: "#8A8478", gradeA: 0.16, n: 10 },
    noon: { top: "#4C76A2", mid: "#90B0C4", hz: "#E0DAC0", sun: [0.62, 0.12], sunC: "#FFFCEE", glow: "#FFF4D0", cloud: "#F4F0E4", cloudDk: "#909CA6", light: "#FFF2D4", shadow: "#1E2228", haze: "#C6CCC6", grade: "#F4E6C0", gradeA: 0.08, n: 5 },
    night: { top: "#0A0F1C", mid: "#18223A", hz: "#323E58", sun: [0.74, 0.2], moon: true, sunC: "#E8ECF2", glow: "#7E90B8", cloud: "#3A4660", cloudDk: "#0E1220", light: "#9AAAD0", shadow: "#05070C", haze: "#2C3850", grade: "#3A4C78", gradeA: 0.24, n: 5 },
    winter: { top: "#7A8696", mid: "#B2B8BE", hz: "#E0DDD4", sun: [0.3, 0.3], sunC: "#FFF8EC", glow: "#F2E6D0", cloud: "#E2E0DC", cloudDk: "#8A909A", light: "#F0ECE4", shadow: "#262A30", haze: "#C8CACA", grade: "#DDE2E8", gradeA: 0.1, n: 6 },
  };
  var SKY_NAMES = Object.keys(SKIES);
  var TERR = {
    fields: { lit: "#A8954E", dk: "#4E4824", far: "#7E7A50", mid: "#66682F", strips: ["#B89E52", "#8C8A3E", "#A2803E", "#7E8A40"], tree: "#3A4222", rock: "#7A6E58", mill: 1 },
    hills: { lit: "#8E8E48", dk: "#3E4222", far: "#6E7452", mid: "#56602F", tree: "#323C20", rock: "#7A7262", hills: 1 },
    forest: { lit: "#7C7E3E", dk: "#2E341A", far: "#56604A", mid: "#36401F", tree: "#28301A", rock: "#6A6252", forest: 1 },
    river: { lit: "#9C9448", dk: "#46462A", far: "#787A52", mid: "#5A6232", tree: "#364020", rock: "#766C58", river: 1 },
    coast: { lit: "#A89C62", dk: "#5A5234", far: "#7E7C64", mid: "#6A6640", tree: "#3E482A", rock: "#8A7E68", sea: 1 },
    mountains: { lit: "#8A8456", dk: "#3E3A26", far: "#6A6A66", mid: "#56583A", tree: "#303822", rock: "#7E766A", mountains: 1 },
    desert: { lit: "#D0A866", dk: "#7A5430", far: "#B89470", mid: "#AE8452", tree: "#66663A", rock: "#A07A52", desert: 1 },
    snow: { lit: "#E8E6E0", dk: "#8C94A0", far: "#B6BAC4", mid: "#A4A8B0", tree: "#2C3832", rock: "#6E6E70", snow: 1 },
    plain: { lit: "#A4904E", dk: "#544A28", far: "#867E58", mid: "#6C683C", tree: "#3C4222", rock: "#7A6E58" },
  };
  var TERR_NAMES = Object.keys(TERR);
  var SKY_SYN = { morning: "dawn", sunrise: "dawn", evening: "dusk", sunset: "dusk", afternoon: "golden", gold: "golden", day: "noon", midday: "noon", clear: "noon", grey: "storm", gray: "storm", rain: "storm", overcast: "storm", moon: "night", snow: "winter", cold: "winter" };
  var TERR_SYN = { field: "fields", farm: "fields", farmland: "fields", hill: "hills", ridge: "hills", woods: "forest", wood: "forest", trees: "forest", stream: "river", ford: "river", sea: "coast", beach: "coast", shore: "coast", mountain: "mountains", pass: "mountains", sand: "desert", dunes: "desert", winter: "snow", ice: "snow", open: "plain", steppe: "plain", grass: "plain" };
  function skyKey(n) { n = str(n).toLowerCase(); return SKIES[n] ? n : SKY_SYN[n] || "golden"; }
  function terrKey(n) { n = str(n).toLowerCase(); return TERR[n] ? n : TERR_SYN[n] || "fields"; }
  // Palette for one painting: terrain colours graded by the sky's light.
  function palette(skyName, terrName) {
    var K = SKIES[skyKey(skyName)], T = TERR[terrKey(terrName)], night = skyKey(skyName) === "night", wint = skyKey(skyName) === "winter";
    function g(c, p) { var x = mixC(c, K.light, p); if (night) x = mixC(mulC(x, 0.42), "#26324E", 0.35); if (wint && !T.snow) x = mixC(x, "#B8BCC0", 0.3); return x; }
    return {
      K: K, T: T, sky: skyKey(skyName), terr: terrKey(terrName),
      lit: g(T.lit, 0.14), dk: g(mixC(T.dk, K.shadow, 0.38), 0.02), far: mixC(mixC(g(T.far, 0.08), K.haze, 0.4), K.top, 0.28), mid: mixC(g(T.mid, 0.08), K.haze, 0.14),
      tree: g(T.tree, 0.06), rock: g(T.rock, 0.15), haze: K.haze, light: K.light, shadow: K.shadow,
      strips: (T.strips || [T.lit]).map(function (c) { return g(c, 0.2); }),
      water: night ? "#1C2638" : mixC(mixC(K.hz, "#3E5C6C", 0.5), K.top, 0.2),
      earth: g(T.desert ? "#B88A52" : T.snow ? "#9C968C" : "#8A6E44", 0.18),
      wall: g(T.desert ? "#C8A878" : "#A89A82", 0.2), roof: g("#7A3E2A", 0.1), slate: g("#4E5058", 0.08),
    };
  }

  // ------------------------- the world: layers, camera, frame loop -------------------------
  var LAYER_DEF = [["sky", 0.12], ["far", 0.34], ["mid", 0.64], ["ground", 1], ["near", 1.28]];
  var WD = null;
  function SAFE() {
    if (PORT) return { x0: (60 / 1080) * W, y0: (250 / 1920) * H, x1: (1020 / 1080) * W, y1: (1450 / 1920) * H };
    return { x0: W * 0.07, y0: H * 0.07, x1: W * 0.93, y1: H * 0.93 };
  }
  function ensure() { if (!WD) scene(V.root(), { bare: true }); return WD; }
  function scene(root, o) {
    o = obj(o);
    root = root || V.root();
    var ww = Math.max(W * 0.5, num(o.width, W)), wh = Math.max(H * 0.5, num(o.height, H));
    var hz = num(o.horizon, wh * (PORT ? 0.44 : 0.5));
    var el = div("ph", root);
    place(el, 0, 0, W, H);
    var view = div("ph-view", el);
    place(view, 0, 0, W, H);
    var m = Math.round(Math.max(W, H) * (o.bleed != null ? clamp(num(o.bleed, 0.1), 0.02, 0.4) : 0.1));
    var st = {
      el: el, view: view, ww: ww, wh: wh, hz: hz, m: m, F: Math.max(W / ww, H / wh), layers: {}, order: [], ups: [], user: [], boxes: [],
      pal: palette(o.sky, o.terrain), opts: o, id: WD ? WD.id + 1 : 1, tl: V.timeline(), pending: [],
      cam: { moves: [], shakes: [], drift: o.drift == null ? 1 : num(o.drift, 1), init: { x: ww / 2, y: wh / 2, z: 1 }, dirty: true, seq: 0 },
    };
    if (o.camera) { var c0 = obj(o.camera); st.cam.init = { x: num(c0.x, ww / 2), y: num(c0.y, wh / 2), z: Math.max(0.5, num(c0.zoom, 1)) }; }
    WD = st;
    LAYER_DEF.forEach(function (d) { st.layers[d[0]] = makeLayer(d[0], d[1]); st.order.push(st.layers[d[0]]); });
    st.fx = mkCanvas(W, H, "ph-fx"); st.fxCtx = st.fx.getContext("2d"); el.appendChild(st.fx); st.fxItems = [];
    st.varnish = paintVarnish(o.varnish);
    el.appendChild(st.varnish);
    st.box = div("ph-letterbox", el); show(st.box, false);
    st.fade = div("ph-fade", el); show(st.fade, false); st.fades = [];
    st.ov = div("ph-ov", el);
    st.top = div("ph-top", el);
    V.onFrame(function (t) { if (WD === st) frame(t); });
    if (!o.bare) landscape(o);
    if (o.letterbox) letterbox(o.letterbox === true ? 0.1 : num(o.letterbox, 0.1));
    st.api = {
      el: el, layers: st.layers, horizon: hz, ww: ww, wh: wh, pal: st.pal, sky: st.pal.sky, terrain: st.pal.terr,
      ground: function (fy) { return groundY(fy); }, persp: function (y) { return persp(y); }, safe: SAFE(), tl: st.tl,
    };
    return st.api;
  }
  function groundY(fy) { var w = ensure(); return w.hz + (w.wh - w.hz) * clamp(num(fy, 0.5), 0, 1.2); }
  // Perspective scale of a figure standing at ground y, 1 at the reference line horizon + 0.22 H.
  function persp(y) { var w = ensure(), ref = w.hz + H * 0.22; return clamp((y - w.hz) / Math.max(1, ref - w.hz), 0.06, 2.4); }
  function makeLayer(name, k) {
    var w = WD, m = w.m;
    var d = div("ph-layer ph-l-" + name, w.view);
    d.style.transformOrigin = "0 0";
    var s = svg("svg", { width: f1(w.ww + 2 * m), height: f1(w.wh + 2 * m), viewBox: -m + " " + -m + " " + f1(w.ww + 2 * m) + " " + f1(w.wh + 2 * m), class: "ph-svg" }, d);
    s.style.left = -m + "px"; s.style.top = -m + "px";
    var defs = svg("defs", {}, s), g = svg("g", {}, s);
    var L = { name: name, k: k, el: d, svg: s, defs: defs, g: g, items: [], fig: null, fctx: null, list: [], canvases: [], seq: 0, M: [1, 0, 0] };
    g.__ph = L;
    L.api = { name: name, g: g, svg: s, defs: defs, k: k, el: d };
    return L;
  }
  function layerOf(name) { var w = ensure(); return w.layers[name] || w.layers[LAYER_SYN[str(name).toLowerCase()]] || w.layers.ground; }
  var LAYER_SYN = { back: "far", background: "far", bg: "far", middle: "mid", front: "near", foreground: "near", fg: "near", main: "ground" };
  // A world-sized canvas inside a layer (painted once), inserted under the layer's svg.
  function layerCanvas(L, cls) {
    var w = WD, m = w.m, c = mkCanvas(w.ww + 2 * m, w.wh + 2 * m, "ph-paint " + (cls || ""));
    c.style.left = -m + "px"; c.style.top = -m + "px";
    c.style.width = f1(w.ww + 2 * m) + "px"; c.style.height = f1(w.wh + 2 * m) + "px";
    L.el.insertBefore(c, L.svg);
    L.canvases.push(c);
    var ctx = c.getContext("2d");
    ctx.translate(m, m);
    return { c: c, ctx: ctx };
  }
  function figLayer(L) {
    if (!L.fig) {
      L.fig = mkCanvas(W, H, "ph-fig ph-fig-" + L.name);
      L.el.parentNode.insertBefore(L.fig, L.el.nextSibling);
      L.fctx = L.fig.getContext("2d");
    }
    return L;
  }
  function addItem(layerName, item) { var L = figLayer(layerOf(layerName)); item.o = L.seq++; L.items.push(item); return item; }
  // Camera
  function camPrep() {
    var C = WD.cam;
    C.moves.sort(function (a, b) { return a.at - b.at || a.id - b.id; });
    for (var i = 0; i < C.moves.length; i++) { var mv = C.moves[i]; mv._start = mv.from ? clampCam(mv.from) : evalMoves(i, mv.at); }
    C.dirty = false;
  }
  function lerpCam(a, b, p) { return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), z: Math.exp(lerp(Math.log(a.z), Math.log(b.z), p)) }; }
  function evalMoves(n, t) {
    var C = WD.cam, s = clampCam(C.init);
    for (var i = 0; i < n; i++) {
      var mv = C.moves[i];
      if (t < mv.at - 1e-9) break;
      if (mv.kind === "track") {
        var tg = obj(mv.fn(t)), tgt = clampCam({ x: num(tg.x, s.x), y: num(tg.y, s.y), z: num(tg.zoom, num(tg.z, s.z)) });
        s = lerpCam(mv._start, tgt, mv.blend > 0 ? soft((t - mv.at) / mv.blend) : 1);
      } else {
        s = lerpCam(mv._start, mv.to, mv.dur > 0 ? mv.ease(clamp((t - mv.at) / mv.dur, 0, 1)) : 1);
      }
    }
    return s;
  }
  function clampCam(c) {
    var w = WD, z = Math.max(0.3, num(c.z, 1)), s = z * w.F, hw = W / (2 * s), hh = H / (2 * s);
    var x = num(c.x, w.ww / 2), y = num(c.y, w.wh / 2);
    x = hw * 2 >= w.ww ? w.ww / 2 : clamp(x, hw, w.ww - hw);
    y = hh * 2 >= w.wh ? w.wh / 2 : clamp(y, hh, w.wh - hh);
    return { x: x, y: y, z: z };
  }
  function camAt(t) {
    var w = WD, C = w.cam;
    if (C.dirty) camPrep();
    var s = evalMoves(C.moves.length, t);
    if (C.drift) {
      var sc = s.z * w.F;
      s = clampCam({ x: s.x + (C.drift * W * 0.006 * Math.sin(t * 0.42 + 0.7)) / sc, y: s.y + (C.drift * H * 0.004 * Math.sin(t * 0.33 + 2.1)) / sc, z: s.z * (1 + C.drift * 0.006 * Math.sin(t * 0.27)) });
    }
    return s;
  }
  function shakeAt(t) {
    var x = 0, y = 0;
    WD.cam.shakes.forEach(function (sk) {
      if (t < sk.at || t > sk.at + sk.dur) return;
      var p = (t - sk.at) / sk.dur, env = Math.pow(1 - p, 2) * sk.amp * UU;
      x += env * noise1(t * 26 + sk.seed, sk.seed); y += env * 0.8 * noise1(t * 23 + 3 + sk.seed, sk.seed + 9);
    });
    return [x, y];
  }
  function layerMatrix(k, cs, sh) {
    var w = WD, c0x = w.ww / 2, c0y = w.wh / 2, zk = Math.exp(Math.log(cs.z) * k), s = zk * w.F;
    var cx = c0x + (cs.x - c0x) * k, cy = c0y + (cs.y - c0y) * k;
    return [s, W / 2 - cx * s + sh[0] * k, H / 2 - cy * s + sh[1] * k];
  }
  function addMove(mv) { var C = ensure().cam; mv.id = C.seq++; C.moves.push(mv); C.dirty = true; return mv; }
  var camera = {
    panZoom: function (at, dur, o) {
      var w = ensure(); o = obj(o);
      var fr = obj(o.from), to = obj(o.to);
      var a = { x: num(fr.fx, 0.5) * w.ww, y: num(fr.fy, 0.5) * w.wh, z: Math.max(0.3, num(fr.zoom, 1)) };
      var b = { x: num(to.fx, 0.5) * w.ww, y: num(to.fy, 0.5) * w.wh, z: Math.max(0.3, num(to.zoom, 1.15)) };
      at = Math.max(0, num(at, 0)); dur = Math.max(0, num(dur, D - at));
      var first = !w.cam.moves.length || at <= 0.05;
      addMove({ kind: "to", at: at, dur: dur, from: o.cut || first ? a : null, to: clampCam(b), ease: V.ease[o.ease] || soft });
      if (first) w.cam.init = a;
      return camera;
    },
    to: function (x, y, zoom, at, dur, o) {
      o = obj(o); var w = ensure();
      addMove({ kind: "to", at: Math.max(0, num(at, 0)), dur: Math.max(0, num(dur, 1)), to: clampCam({ x: num(x, w.ww / 2), y: num(y, w.wh / 2), z: num(zoom, 1) }), ease: typeof o.ease === "function" ? o.ease : V.ease[o.ease] || soft, from: o.cut ? clampCam({ x: x, y: y, z: zoom }) : null });
      return camera;
    },
    focus: function (target, at, dur, o) {
      o = obj(o); var w = ensure(), r = target && target.rect ? target.rect : target;
      r = obj(r);
      var rx = num(r.x, 0), ry = num(r.y, 0), rw = Math.max(1, num(r.w, w.ww)), rh = Math.max(1, num(r.h, w.wh)), fill = num(o.fill, 0.75);
      var z = o.zoom != null ? num(o.zoom, 1) : clamp(Math.min((W * fill) / (rw * w.F), (H * fill) / (rh * w.F)), 1, 3.2);
      var an = arr(o.anchor);
      return camera.to(rx + rw * num(an[0], 0.5), ry + rh * num(an[1], 0.5), z, at, dur, o);
    },
    wide: function (at, dur) { var w = ensure(); return camera.to(w.ww / 2, w.wh / 2, 1, at, dur); },
    track: function (fn, at, blend) { if (typeof fn === "function") addMove({ kind: "track", at: Math.max(0, num(at, 0)), blend: Math.max(0, num(blend, 0.8)), fn: fn }); return camera; },
    shake: function (at, amp, dur) { var w = ensure(); w.cam.shakes.push({ at: num(at, 0), amp: num(amp, 8), dur: Math.max(0.05, num(dur, 0.4)), seed: w.cam.shakes.length * 7 + 3 }); return camera; },
    drift: function (v) { ensure().cam.drift = clamp(num(v, 1), 0, 2); return camera; },
    at: function (t) { ensure(); return camAt(num(t, 0)); },
  };
  // Screen position of a world point on a layer at time t.
  function toScreen(x, y, t, layer) {
    var w = ensure(), L = layerOf(layer || "ground"), M = layerMatrix(L.k, camAt(t), shakeAt(t));
    return [x * M[0] + M[1], y * M[0] + M[2], M[0]];
  }
  function camMoving(t) { var a = camAt(t), b = camAt(t + 0.08); return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 0.6 || Math.abs(a.z - b.z) > 0.002; }
  function frame(t) {
    var w = WD;
    if (!w) return;
    if (w.pending.length) finishPaint();
    var cs = camAt(t), sh = shakeAt(t);
    w.camNow = cs;
    for (var i = 0; i < w.order.length; i++) {
      var L = w.order[i], M = layerMatrix(L.k, cs, sh);
      L.M = M;
      setS(L.el, "transform", "translate(" + M[1].toFixed(2) + "px," + M[2].toFixed(2) + "px) scale(" + M[0].toFixed(5) + ")");
      if (L.fig) drawFigs(L, t, M);
    }
    drawFx(t);
    for (i = 0; i < w.ups.length; i++) w.ups[i](t);
    for (i = 0; i < w.user.length; i++) { try { w.user[i](t); } catch (e) { V.error("[onFrame] " + (e && e.message ? e.message : e)); } }
  }
  function drawFigs(L, t, M) {
    var ctx = L.fctx, list = L.list, i;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    list.length = 0;
    for (i = 0; i < L.items.length; i++) { var it = L.items[i]; if (it.collect) it.collect(t, list, L); }
    if (!list.length) return;
    for (i = 0; i < list.length; i++) list[i].i = i;
    list.sort(function (a, b) { return a.z - b.z || a.i - b.i; });
    for (i = 0; i < list.length; i++) {
      var d = list[i];
      if (d.fn) { ctx.setTransform(M[0], 0, 0, M[0], M[1], M[2]); ctx.globalAlpha = 1; ctx.save(); try { d.fn(ctx, t, M); } catch (e) { V.error("[draw] " + (e && e.message ? e.message : e)); } ctx.restore(); continue; }
      var sp = d.sp, s = (M[0] * d.s) / sp.ppu;
      if (!(s > 0)) continue;
      ctx.globalAlpha = d.a == null ? 1 : clamp(d.a, 0, 1);
      if (d.rot) {
        ctx.setTransform(M[0], 0, 0, M[0], M[1], M[2]);
        ctx.translate(d.x, d.y); ctx.rotate(d.rot); ctx.scale((d.flip ? -1 : 1) * d.s / sp.ppu, d.s / sp.ppu);
        ctx.drawImage(sp.c, -sp.ox, -sp.oy);
      } else {
        ctx.setTransform(d.flip ? -s : s, 0, 0, s, M[1] + d.x * M[0], M[2] + d.y * M[0]);
        ctx.drawImage(sp.c, -sp.ox, -sp.oy);
      }
    }
    // Light and depth glaze on the figures only (source-atop): the scene light, plus haze toward the horizon.
    var w = WD, P = w.pal;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-atop";
    ctx.fillStyle = rgba(P.K.grade, P.K.gradeA);
    ctx.fillRect(0, 0, W, H);
    var y0 = w.hz * M[0] + M[2], y1 = (w.hz + (w.wh - w.hz) * 0.55) * M[0] + M[2];
    if (y1 > y0 + 2 && L.name !== "near" && !w.noHaze) {
      var g = ctx.createLinearGradient(0, y0, 0, y1), ha = L.name === "far" ? 0.55 : L.name === "mid" ? 0.4 : 0.22;
      g.addColorStop(0, rgba(P.haze, ha)); g.addColorStop(1, rgba(P.haze, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.globalCompositeOperation = "source-over";
  }
  function drawFx(t) {
    var w = WD;
    if (!w.fxItems.length) { if (!w.fxClear) { w.fxCtx.clearRect(0, 0, W, H); w.fxClear = true; } return; }
    w.fxClear = false;
    var ctx = w.fxCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.clearRect(0, 0, W, H);
    w.fxItems.forEach(function (f) { ctx.save(); f(ctx, t); ctx.restore(); });
  }
  function onFrame(fn) { if (typeof fn === "function") ensure().user.push(fn); }
  function up(fn) { ensure().ups.push(fn); }
  function addBox(kind, label, from, to, get) { var b = { kind: kind, label: label, from: from, to: to == null ? 1e9 : to, get: get }; ensure().boxes.push(b); return b; }
  // Box of a world rect on screen at t (for S.inspect); marks it moving while the camera moves.
  function worldBox(x, y, w, h, layer) {
    return function (t) { var a = toScreen(x, y, t, layer), b = toScreen(x + w, y + h, t, layer); return { x: a[0], y: a[1], w: b[0] - a[0], h: b[1] - a[1], moving: camMoving(t) }; };
  }
  function fadeIn(at, dur, o) { return fadeAdd(at, dur, 1, obj(o)); }
  function fadeOut(at, dur, o) { return fadeAdd(at, dur, 0, obj(o)); }
  // Fades chain in time order: each moves the veil from its current opacity to 1 (out) or 0 (in).
  function fadeAdd(at, dur, dir, o) {
    var w = ensure();
    w.fades.push({ at: num(at, 0), dur: Math.max(0.05, num(dur, 0.6)), dir: dir, col: o.paper ? PAL.parch : "#0C0805", id: w.fades.length });
    w.fades.sort(function (x, y) { return x.at - y.at || x.id - y.id; });
    if (w.fades.length === 1) up(function (t) {
      var fs = w.fades, a = fs[0].dir ? 1 : 0, col = fs[0].col;
      for (var i = 0; i < fs.length; i++) {
        var f = fs[i];
        if (t < f.at) break;
        a = lerp(a, f.dir ? 0 : 1, soft(prog(t, f.at, f.dur)));
        col = f.col;
      }
      show(w.fade, a > 0.002);
      setS(w.fade, "opacity", f2(a));
      setS(w.fade, "background", col);
    });
  }
  function letterbox(frac) {
    var w = ensure();
    show(w.box, true);
    w.box.style.setProperty("--lb", f1(H * clamp(frac, 0, 0.2)) + "px");
  }

  // ------------------------- the pen: one drawing API for canvas and svg -------------------------
  // Primitives draw through a pen. A layer group (S.layer(x).g) paints into that layer's painting canvas, which
  // gets the oil pass at flush; a 2D context paints directly; any other svg group receives flat svg shapes.
  function penOf(target) {
    if (target && target.__ph) return canvasPen(paintCtx(target.__ph), target.__ph);
    if (target && target.getContext) return canvasPen(target.getContext("2d"));
    if (target && target.fillRect) return canvasPen(target);
    return svgPen(target || ensure().layers.ground.g);
  }
  function paintCtx(L) {
    if (!L.custom) { L.custom = layerCanvas(L, "ph-custom"); ensure().pending.push(L); }
    return L.custom.ctx;
  }
  function canvasPen(ctx, L) {
    return {
      ctx: ctx, canvas: true,
      fill: function (d, c, a) { ctx.save(); ctx.globalAlpha = a == null ? 1 : a; ctx.fillStyle = c; ctx.fill(typeof d === "string" ? new Path2D(d) : d); ctx.restore(); },
      stroke: function (d, c, wd, a) { ctx.save(); ctx.globalAlpha = a == null ? 1 : a; ctx.strokeStyle = c; ctx.lineWidth = wd; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.stroke(typeof d === "string" ? new Path2D(d) : d); ctx.restore(); },
      ellipse: function (x, y, rx, ry, c, a) { ctx.save(); ctx.globalAlpha = a == null ? 1 : a; ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU); ctx.fill(); ctx.restore(); },
      blob: function (x, y, rx, ry, c, a) { blob(ctx, x, y, Math.max(0.5, rx), Math.max(0.5, ry), c, a == null ? 1 : a); },
      grad: function (d, x0, y0, x1, y1, c0, c1, a) { ctx.save(); var g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, c0); g.addColorStop(1, c1); ctx.globalAlpha = a == null ? 1 : a; ctx.fillStyle = g; ctx.fill(typeof d === "string" ? new Path2D(d) : d); ctx.restore(); },
    };
  }
  var gradSeq = 0;
  function svgPen(g) {
    return {
      svg: true, g: g,
      fill: function (d, c, a) { svg("path", { d: d, fill: c, "fill-opacity": a == null ? null : f2(a) }, g); },
      stroke: function (d, c, wd, a) { svg("path", { d: d, fill: "none", stroke: c, "stroke-width": f2(wd), "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-opacity": a == null ? null : f2(a) }, g); },
      ellipse: function (x, y, rx, ry, c, a) { svg("ellipse", { cx: f1(x), cy: f1(y), rx: f1(rx), ry: f1(ry), fill: c, "fill-opacity": a == null ? null : f2(a) }, g); },
      blob: function (x, y, rx, ry, c, a) { svg("ellipse", { cx: f1(x), cy: f1(y), rx: f1(rx * 0.7), ry: f1(ry * 0.7), fill: c, "fill-opacity": f2((a == null ? 1 : a) * 0.5) }, g); },
      grad: function (d, x0, y0, x1, y1, c0, c1, a) {
        var root = g.ownerSVGElement || g, defs = root.querySelector("defs") || svg("defs", {}, root), id = "phg" + gradSeq++;
        var lg = svg("linearGradient", { id: id, gradientUnits: "userSpaceOnUse", x1: f1(x0), y1: f1(y0), x2: f1(x1), y2: f1(y1) }, defs);
        svg("stop", { offset: "0", "stop-color": c0 }, lg); svg("stop", { offset: "1", "stop-color": c1 }, lg);
        svg("path", { d: d, fill: "url(#" + id + ")", "fill-opacity": a == null ? null : f2(a) }, g);
      },
    };
  }
  // Oil pass on every layer canvas that custom primitives painted into.
  function finishPaint() {
    var w = WD;
    w.pending.forEach(function (L) {
      if (!L.custom || L.custom.done) return;
      L.custom.done = true;
      oilPass(L.custom.c, { sizes: L.name === "far" ? [9, 4.5] : [11, 5.5, 2.8], seed: 300 + L.k * 100, flow: 0.7, impasto: 0.3, alpha: 0.82, minAlpha: 120 });
    });
    w.pending.length = 0;
  }
  function P(pts, close) { var s = ""; for (var i = 0; i < pts.length; i++) s += (i ? "L" : "M") + f1(pts[i][0]) + " " + f1(pts[i][1]); return s + (close ? "Z" : ""); }
  // Smooth closed/open path through points (quadratic midpoints).
  function PS(pts, close) {
    if (pts.length < 3) return P(pts, close);
    var s = "M" + f1(pts[0][0]) + " " + f1(pts[0][1]), n = pts.length;
    for (var i = 1; i < n - 1; i++) { var mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; s += "Q" + f1(pts[i][0]) + " " + f1(pts[i][1]) + " " + f1(mx) + " " + f1(my); }
    s += "L" + f1(pts[n - 1][0]) + " " + f1(pts[n - 1][1]);
    return s + (close ? "Z" : "");
  }
  function ellD(cx, cy, rx, ry) { return "M" + f1(cx - rx) + " " + f1(cy) + "a" + f1(rx) + " " + f1(ry) + " 0 1 0 " + f1(rx * 2) + " 0a" + f1(rx) + " " + f1(ry) + " 0 1 0 " + f1(-rx * 2) + " 0Z"; }
  function rectD(x, y, w, h) { return "M" + f1(x) + " " + f1(y) + "h" + f1(w) + "v" + f1(h) + "h" + f1(-w) + "Z"; }
  function rr(r) { return typeof r === "function" ? r : rng(num(r, 5)); }

  // ------------------------- painting primitives (world px) -------------------------
  function dabs(g, x, y, w, h, colours, n, size, rand) {
    var p = penOf(g), r = rr(rand), cols = arr(colours).length ? colours : ["#806040"];
    if (p.canvas) { dabsCtx(p.ctx, x, y, w, h, cols, num(n, 40), num(size, u(6)), r); return; }
    for (var i = 0; i < num(n, 40); i++) { var px = x + r() * w, py = y + r() * h, L = num(size, 6) * (1 + r()); p.stroke("M" + f1(px) + " " + f1(py) + "l" + f1(L) + " " + f1((r() - 0.5) * L * 0.5), cols[i % cols.length], num(size, 6) * 0.6, 0.6); }
  }
  function ridgePts(x0, x1, y, amp, r, rough) {
    var pts = [], n = Math.max(8, Math.round((x1 - x0) / u(26))), s = Math.floor(r() * 1000), fq = 2.2 + r() * 2;
    for (var i = 0; i <= n; i++) {
      var f = i / n, h = fbm(f * fq, 0.3, s, 4);
      if (rough) h = h * 0.6 + Math.abs(fbm(f * fq * 3.1, 1.7, s + 5, 3) - 0.5) * 1.2;
      pts.push([x0 + (x1 - x0) * f, y - amp * h]);
    }
    return pts;
  }
  function ridge(g, x0, x1, y, amp, bottom, fill, rand) {
    var p = penOf(g), r = rr(rand), pts = ridgePts(x0, x1, y, amp, r);
    var d = PS(pts.concat([[x1, bottom], [x0, bottom]]), true);
    p.fill(d, fill || "#6A6A40", 1);
    return pts;
  }
  function tree(g, x, y, h, colour, rand, kind) {
    var p = penOf(g), r = rr(rand), c = colour || "#3A4222", lit = mixC(c, WD ? WD.pal.light : "#FFE0A0", 0.42), dk = shade(c, -0.4), trunk = mixC(c, "#3A2818", 0.6);
    kind = str(kind) || "round";
    if (kind === "pine") {
      p.fill(P([[x - h * 0.03, y], [x + h * 0.03, y], [x + h * 0.02, y - h * 0.3], [x - h * 0.02, y - h * 0.3]], true), trunk);
      for (var i = 0; i < 4; i++) {
        var ty = y - h * (0.18 + i * 0.2), tw = h * (0.3 - i * 0.06);
        p.fill(P([[x - tw, ty], [x + tw * (0.9 + r() * 0.2), ty + h * 0.02], [x + (r() - 0.5) * h * 0.02, ty - h * 0.34]], true), i % 2 ? c : dk);
        p.fill(P([[x - tw * 0.8, ty - h * 0.02], [x - tw * 0.1, ty - h * 0.03], [x, ty - h * 0.3]], true), lit, 0.6);
      }
      return;
    }
    if (kind === "poplar") {
      p.fill(P([[x - h * 0.02, y], [x + h * 0.02, y], [x, y - h * 0.4]], true), trunk);
      p.fill(ellD(x, y - h * 0.56, h * 0.11, h * 0.44), dk);
      p.fill(ellD(x - h * 0.03, y - h * 0.6, h * 0.07, h * 0.36), c);
      p.fill(ellD(x - h * 0.05, y - h * 0.66, h * 0.035, h * 0.22), lit, 0.7);
      return;
    }
    if (kind === "dead") {
      p.stroke(P([[x, y], [x + h * 0.02, y - h * 0.6], [x - h * 0.1, y - h * 0.9]]), trunk, h * 0.04, 1);
      p.stroke(P([[x + h * 0.01, y - h * 0.45], [x + h * 0.2, y - h * 0.7]]), trunk, h * 0.025, 1);
      p.stroke(P([[x - h * 0.02, y - h * 0.62], [x - h * 0.22, y - h * 0.68]]), trunk, h * 0.02, 1);
      return;
    }
    p.fill(P([[x - h * 0.045, y], [x + h * 0.045, y], [x + h * 0.025, y - h * 0.45], [x - h * 0.02, y - h * 0.45]], true), trunk);
    var n = 6 + Math.floor(r() * 4), cw = h * 0.34;
    for (i = 0; i < n; i++) { var a = (i / n) * TAU, rx = cw * (0.4 + r() * 0.3); p.fill(ellD(x + Math.cos(a) * cw * 0.55, y - h * 0.62 + Math.sin(a) * cw * 0.45 + cw * 0.12, rx, rx * 0.85), dk); }
    for (i = 0; i < n; i++) { a = (i / n) * TAU; rx = cw * (0.32 + r() * 0.25); p.fill(ellD(x + Math.cos(a) * cw * 0.45 - cw * 0.05, y - h * 0.66 + Math.sin(a) * cw * 0.38, rx, rx * 0.8), c); }
    for (i = 0; i < 4; i++) { rx = cw * (0.18 + r() * 0.18); p.fill(ellD(x - cw * (0.1 + r() * 0.4), y - h * (0.72 + r() * 0.18), rx, rx * 0.75), lit, 0.85); }
  }
  function forest(g, x0, x1, y, h, colour, rand, n) {
    var r = rr(rand), N = Math.max(2, Math.round(num(n, (x1 - x0) / (h * 0.35)))), c = colour || "#36401F";
    for (var row = 0; row < 2; row++) {
      for (var i = 0; i < N; i++) {
        var x = x0 + ((i + (row ? 0.5 : r() * 0.3)) / N) * (x1 - x0), hh = h * (0.75 + r() * 0.45) * (row ? 1 : 0.85);
        tree(g, x, y - (row ? 0 : h * 0.06), hh, row ? c : shade(c, -0.18), r, r() < 0.25 ? "pine" : "round");
      }
    }
  }
  // Fortress: x = left, y = ground, w = width, h = wall height. Returns geometry for figures.
  function fortress(g, x, y, w, h, o, rand) {
    o = obj(o);
    var p = penOf(g), r = rr(rand), P0 = WD ? WD.pal : palette(), stone = o.stone || P0.wall, dk = shade(stone, -0.32), lit = shade(stone, 0.18);
    var nT = Math.max(2, Math.round(num(o.towers, 3))), tw = w * 0.13, th = h * 1.55, towers = [];
    var wallTop = y - h;
    p.grad(rectD(x, wallTop, w, h), x, wallTop, x + w, y, lit, dk);
    var mw = w / Math.max(6, Math.round(w / (h * 0.16)));
    for (var cx = x; cx < x + w - mw * 0.5; cx += mw * 2) p.fill(rectD(cx, wallTop - h * 0.09, mw, h * 0.09), stone);
    for (var by = wallTop + h * 0.12; by < y - 2; by += h * 0.13) p.stroke("M" + f1(x) + " " + f1(by) + "H" + f1(x + w), dk, Math.max(0.6, h * 0.008), 0.35);
    for (var i = 0; i < nT; i++) {
      var tx = x + (w - tw) * (nT === 1 ? 0.5 : i / (nT - 1)), ty = y - th;
      p.grad(rectD(tx, ty, tw, th), tx, ty, tx + tw, y, lit, dk);
      for (var k = 0; k < 3; k++) p.fill(rectD(tx + (tw / 3) * k + tw * 0.03, ty - h * 0.08, tw * 0.22, h * 0.08), stone);
      p.fill(rectD(tx + tw * 0.42, ty + th * 0.25, tw * 0.14, th * 0.12), "#1A120C", 0.85);
      if (o.roofs !== false) p.fill(P([[tx - tw * 0.08, ty - h * 0.02], [tx + tw * 1.08, ty - h * 0.02], [tx + tw * 0.5, ty - th * 0.42]], true), i % 2 ? P0.slate : P0.roof);
      towers.push({ x: tx, y: ty, w: tw, h: th, top: o.roofs !== false ? ty - th * 0.42 : ty - h * 0.08 });
    }
    var gate = null;
    if (o.gate !== false) {
      var gw = w * 0.12, gx = x + w * 0.5 - gw / 2 + (nT % 2 ? w * 0.16 : 0), gh = h * 0.55;
      p.fill("M" + f1(gx) + " " + f1(y) + "V" + f1(y - gh * 0.7) + "Q" + f1(gx + gw / 2) + " " + f1(y - gh * 1.15) + " " + f1(gx + gw) + " " + f1(y - gh * 0.7) + "V" + f1(y) + "Z", "#1A100A", 0.92);
      gate = { x: gx, y: y - gh, w: gw, h: gh };
    }
    for (i = 0; i < 18; i++) dabsCtxOr(p, x + r() * w, wallTop + r() * h, mixC(stone, r() < 0.5 ? "#6A5E48" : "#D8CCB0", 0.4), r);
    return { x: x, y: y, w: w, h: h, wallTop: wallTop, towers: towers, gate: gate, rect: { x: x, y: y - th * 1.4, w: w, h: th * 1.4 } };
  }
  function dabsCtxOr(p, x, y, c, r) { p.ellipse(x, y, u(3 + r() * 6), u(2 + r() * 3), c, 0.35); }
  function town(g, x, y, w, h, o, rand) {
    o = obj(o);
    var p = penOf(g), r = rr(rand), P0 = WD ? WD.pal : palette(), n = Math.max(3, Math.round(num(o.houses, w / (h * 0.9)))), wall = o.wall || mixC(P0.wall, "#EADCC0", 0.3);
    var spire = o.spire !== false ? Math.floor(n * (0.3 + r() * 0.4)) : -1;
    for (var i = 0; i < n; i++) {
      var hw = (w / n) * (0.8 + r() * 0.5), hx = x + (w / n) * i + (r() - 0.5) * (w / n) * 0.3, hh = h * (0.45 + r() * 0.35), by = y - r() * h * 0.12;
      if (i === spire) {
        p.grad(rectD(hx, by - h * 1.2, hw * 0.45, h * 1.2), hx, 0, hx + hw * 0.45, 0, shade(wall, 0.1), shade(wall, -0.3));
        p.fill(P([[hx - hw * 0.03, by - h * 1.2], [hx + hw * 0.48, by - h * 1.2], [hx + hw * 0.225, by - h * 2]], true), P0.slate);
        continue;
      }
      p.grad(rectD(hx, by - hh, hw, hh), hx, 0, hx + hw, 0, shade(wall, 0.12), shade(wall, -0.28));
      p.fill(P([[hx - hw * 0.06, by - hh], [hx + hw * 1.06, by - hh], [hx + hw * 0.5, by - hh - h * 0.38]], true), r() < 0.7 ? P0.roof : P0.slate);
      p.fill(rectD(hx + hw * 0.3, by - hh * 0.6, hw * 0.14, hh * 0.22), "#2A1E14", 0.7);
    }
  }
  function camp(g, x, y, w, rows, size, colour, rand) {
    var p = penOf(g), r = rr(rand), c = colour || "#E2D6B8", nr = Math.max(1, Math.round(num(rows, 2))), sz = num(size, u(40));
    for (var j = 0; j < nr; j++) {
      var yy = y - j * sz * 0.45, n = Math.max(2, Math.round(w / (sz * 1.25))), s2 = sz * (1 - j * 0.15);
      for (var i = 0; i < n; i++) {
        var tx = x + (w * (i + 0.5 + (j % 2) * 0.3)) / n;
        p.fill(P([[tx - s2 * 0.55, yy], [tx + s2 * 0.55, yy], [tx + s2 * 0.05, yy - s2 * 0.75]], true), shade(c, -0.25));
        p.fill(P([[tx - s2 * 0.55, yy], [tx + s2 * 0.02, yy], [tx + s2 * 0.05, yy - s2 * 0.75]], true), shade(c, 0.05 + r() * 0.08));
        p.fill(P([[tx - s2 * 0.08, yy], [tx + s2 * 0.12, yy], [tx + s2 * 0.04, yy - s2 * 0.35]], true), "#2A1E14", 0.7);
      }
    }
  }
  function windmill(g, x, y, h, rand) {
    var p = penOf(g), r = rr(rand), P0 = WD ? WD.pal : palette(), wall = mixC(P0.wall, "#D8C8A8", 0.3);
    p.grad(P([[x - h * 0.13, y], [x + h * 0.13, y], [x + h * 0.08, y - h * 0.62], [x - h * 0.08, y - h * 0.62]], true), x - h * 0.13, 0, x + h * 0.13, 0, shade(wall, 0.15), shade(wall, -0.35));
    p.fill(P([[x - h * 0.11, y - h * 0.6], [x + h * 0.11, y - h * 0.6], [x, y - h * 0.76]], true), P0.roof);
    var hx = x + h * 0.02, hy = y - h * 0.62, a0 = 0.35 + r() * 0.5;
    for (var i = 0; i < 4; i++) {
      var a = a0 + (i * PI) / 2, ex = hx + Math.cos(a) * h * 0.52, ey = hy + Math.sin(a) * h * 0.52, nx = -Math.sin(a) * h * 0.06, ny = Math.cos(a) * h * 0.06;
      p.stroke(P([[hx, hy], [ex, ey]]), "#3A2A1C", Math.max(1, h * 0.018), 1);
      p.fill(P([[hx + Math.cos(a) * h * 0.1, hy + Math.sin(a) * h * 0.1], [ex, ey], [ex + nx, ey + ny], [hx + Math.cos(a) * h * 0.1 + nx, hy + Math.sin(a) * h * 0.1 + ny]], true), "#D8CCB0", 0.75);
    }
  }

  // ------------------------- the landscape painter -------------------------
  function clearLandscape() {
    var w = ensure();
    w.order.forEach(function (L) {
      L.canvases.forEach(function (c) { if (c.parentNode) c.parentNode.removeChild(c); });
      L.canvases = []; L.custom = null;
    });
    w.pending.length = 0;
  }
  function landscape(o) {
    o = obj(o);
    var w = ensure();
    clearLandscape();
    if (o.sky || o.terrain) w.pal = palette(o.sky || w.pal.sky, o.terrain || w.pal.terr);
    if (o.horizon != null) w.hz = num(o.horizon, w.hz);
    var Pl = w.pal, K = Pl.K, T = Pl.T, r = rng(num(o.seed, 11) + hstr(Pl.sky + Pl.terr));
    var ww = w.ww, wh = w.wh, hz = w.hz, m = w.m, X0 = -m, X1 = ww + m, Y1 = wh + m;
    var feat = {
      river: o.water != null ? !!o.water : !!T.river, sea: !!T.sea, road: !!o.road, mill: o.mill != null ? !!o.mill : !!T.mill, town: o.town != null ? !!o.town : false,
      camp: !!o.camp, fort: !!o.fort, treeline: o.treeline != null ? !!o.treeline : true, frameTree: o.frameTree != null ? !!o.frameTree : false,
    };
    // SKY
    var sk = layerCanvas(w.layers.sky, "ph-sky"), c = sk.ctx;
    var sg = c.createLinearGradient(0, -m, 0, hz + 2);
    sg.addColorStop(0, K.top); sg.addColorStop(0.55, K.mid); sg.addColorStop(1, K.hz);
    c.fillStyle = sg; c.fillRect(X0, -m, X1 - X0, hz + m + 2);
    c.fillStyle = K.hz; c.fillRect(X0, hz, X1 - X0, Y1 - hz);
    var sunX = K.sun ? K.sun[0] * ww : ww * 0.5, sunY = K.sun ? Math.min(K.sun[1] * wh, hz * 0.85) : hz * 0.4;
    if (o.sun != null) { var so = arr(o.sun); sunX = num(so[0], 0.7) * ww; sunY = num(so[1], 0.3) * hz; }
    w.sun = [sunX, sunY];
    if (K.sun) { blob(c, sunX, sunY, Math.max(ww, wh) * 0.34, Math.max(ww, wh) * 0.2, K.glow, Pl.sky === "night" ? 0.2 : 0.42); blob(c, sunX, sunY, u(150), u(130), K.sunC, 0.6); }
    if (Pl.sky === "night") { for (var i = 0; i < 160; i++) { c.fillStyle = rgba("#F4F0E0", 0.3 + r() * 0.6); var sx = X0 + r() * (X1 - X0), sy = -m + r() * (hz * 0.8 + m); c.fillRect(sx, sy, u(1.2 + r() * 1.6), u(1.2 + r() * 1.6)); } }
    // stratus streaks low in the sky
    for (i = 0; i < 9; i++) { var sy2 = hz * (0.55 + r() * 0.38), sx2 = X0 + r() * (X1 - X0); blob(c, sx2, sy2, u(260 + r() * 360), u(10 + r() * 14), r() < 0.5 ? K.cloud : K.cloudDk, 0.35); }
    // cumulus masses: puffs with a flat base, lit tops toward the sun, cool undersides
    var nC = K.n + Math.floor(r() * 2);
    for (i = 0; i < nC; i++) {
      var cy = lerp(hz * 0.12, hz * 0.7, Math.pow(r(), 0.9)), near = 1.2 - cy / hz, cxw = X0 + ((i + 0.2 + r() * 0.6) / nC) * (X1 - X0), cw = u(260 + r() * 380) * (0.55 + near * 0.7), ch = cw * (0.2 + r() * 0.12);
      var dirL = sunX > cxw ? 1 : -1, n2 = 6 + Math.floor(r() * 6), cpath = new Path2D(), puffs = [];
      for (var k = 0; k < n2; k++) { var fk = n2 > 1 ? k / (n2 - 1) : 0.5, pr = ch * (0.32 + r() * 0.42) * (1 - Math.abs(fk - 0.5) * 0.9), px = cxw + (fk - 0.5) * cw * 0.92, py = cy - pr * (0.35 + r() * 0.3); puffs.push([px, py, pr]); cpath.moveTo(px + pr, py); cpath.arc(px, py, pr, 0, TAU); }
      cpath.rect(cxw - cw * 0.46, cy - ch * 0.1, cw * 0.92, ch * 0.2);
      var cg = c.createLinearGradient(0, cy - ch * 1.1, 0, cy + ch * 0.15), topC = Pl.sky === "storm" ? K.cloud : mixC(K.cloud, K.sunC, 0.25), botC = Pl.sky === "storm" ? K.cloudDk : mixC(K.cloudDk, K.top, 0.25);
      cg.addColorStop(0, topC); cg.addColorStop(0.55, mixC(topC, botC, 0.45)); cg.addColorStop(1, botC);
      c.save(); c.globalAlpha = Pl.sky === "storm" ? 0.95 : 0.9; c.fillStyle = cg; c.fill(cpath); c.clip(cpath);
      puffs.forEach(function (q) { blob(c, q[0] + dirL * q[2] * 0.35, q[1] - q[2] * 0.4, q[2] * 0.8, q[2] * 0.55, mixC(K.sunC, K.cloud, 0.3), 0.55); });
      blob(c, cxw, cy + ch * 0.1, cw * 0.5, ch * 0.35, botC, 0.6);
      c.restore();
      puffs.forEach(function (q) { blob(c, q[0], q[1], q[2] * 1.5, q[2] * 1.2, topC, 0.12); });
    }
    if (Pl.sky === "storm") for (i = 0; i < 6; i++) blob(c, X0 + r() * (X1 - X0), r() * hz * 0.6, u(520), u(150), K.cloudDk, 0.55);
    if (K.sun && Pl.sky !== "storm") {
      c.save(); c.globalAlpha = Pl.sky === "night" ? 0.95 : 0.9; c.fillStyle = K.sunC; c.beginPath(); c.arc(sunX, sunY, u(Pl.sky === "night" ? 30 : 38), 0, TAU); c.fill(); c.restore();
      if (Pl.sky === "night") { c.save(); c.fillStyle = rgba("#9AA6C0", 0.5); c.beginPath(); c.arc(sunX + u(9), sunY - u(4), u(24), 0, TAU); c.fill(); c.restore(); }
    }
    if (Pl.sky === "golden" || Pl.sky === "dawn" || Pl.sky === "dusk") {
      c.save(); c.globalAlpha = 0.07;
      for (i = 0; i < 7; i++) { var a = PI * 0.3 + (i / 7) * PI * 0.45 + (r() - 0.5) * 0.1; c.fillStyle = K.sunC; c.beginPath(); c.moveTo(sunX, sunY); c.lineTo(sunX + Math.cos(a - 0.04) * ww, sunY + Math.sin(a - 0.04) * ww); c.lineTo(sunX + Math.cos(a + 0.04) * ww, sunY + Math.sin(a + 0.04) * ww); c.fill(); }
      c.restore();
    }
    oilPass(sk.c, { sizes: [24, 12, 6], seed: 21, dir: -0.08, flow: 0.9, fscale: 300, len: [1.3, 3.6], impasto: 0.25, detail: 14, keep: 0.2, jitter: 18, broken: 26 });
    glaze(sk.ctx, { cx: sunX, cy: sunY, r: Math.max(ww, wh) * 0.6 }, [[0, K.light, 0.18], [1, K.light, 0]], [X0, -m, X1 - X0, Y1 + m]);
    // FAR
    var fr = layerCanvas(w.layers.far, "ph-far"); c = fr.ctx;
    var fp = penOf(fr.c); fp.ctx.translate(0, 0);
    var farC = Pl.far;
    if (T.mountains) {
      var mp = ridgePts(X0, X1, hz, hz * 0.42, r, true);
      fp.fill(PS(mp.concat([[X1, hz + 40], [X0, hz + 40]]), true), mixC(farC, K.haze, 0.25));
      c.save(); c.clip(new Path2D(PS(mp.concat([[X1, hz + 40], [X0, hz + 40]]), true)));
      mp.forEach(function (q, j) { if (j % 2 === 0 && q[1] < hz - hz * 0.22) { blob(c, q[0], q[1] + u(16), u(70), u(26), "#F2F0EA", 0.75); } });
      glaze(c, { x0: sunX - ww * 0.4, y0: 0, x1: sunX + ww * 0.4, y1: 0 }, [[0, K.shadow, 0.18], [0.5, K.light, 0.16], [1, K.shadow, 0.18]], [X0, 0, X1 - X0, hz + 40]);
      c.restore();
    }
    var r1 = ridgePts(X0, X1, hz + 2, hz * (T.hills ? 0.16 : T.desert ? 0.05 : 0.09), r);
    if (!T.sea) fp.fill(PS(r1.concat([[X1, hz + wh * 0.08], [X0, hz + wh * 0.08]]), true), mixC(farC, K.haze, 0.1));
    if (T.sea) {
      c.fillStyle = Pl.water; c.fillRect(X0, hz - 2, X1 - X0, wh * 0.08);
      glaze(c, { x0: 0, y0: hz, x1: 0, y1: hz + wh * 0.08 }, [[0, K.hz, 0.5], [1, K.hz, 0]], [X0, hz - 2, X1 - X0, wh * 0.08]);
      for (i = 0; i < 90; i++) { c.globalAlpha = 0.25 + r() * 0.4; c.fillStyle = K.sunC; var gx = sunX + (r() - 0.5) * ww * 0.35, gy = hz + r() * wh * 0.05; c.fillRect(gx, gy, u(8 + r() * 30), u(1.5)); }
      c.globalAlpha = 1;
      var hd = ridgePts(ww * 0.72, X1, hz + 2, hz * 0.07, r);
      fp.fill(PS(hd.concat([[X1, hz + 6], [ww * 0.72, hz + 6]]), true), mixC(farC, K.haze, 0.2));
    }
    if (feat.treeline && !T.desert && !T.mountains) for (i = 0; i < 26; i++) { var tx2 = X0 + r() * (X1 - X0), ty2 = hz + u(2) + r() * u(10); if (T.sea && tx2 < ww * 0.75) continue; tree(fr.c, tx2, ty2, u(30 + r() * 26), mixC(Pl.tree, K.haze, 0.45), r, r() < 0.3 ? "poplar" : "round"); }
    if (o.town === "far" || (feat.town && !o.townMid)) town(fr.c, ww * (0.55 + r() * 0.2), hz + u(6), u(260), u(36), {}, r);
    oilPass(fr.c, { sizes: [12, 6, 3], seed: 31, dir: 0, flow: 0.4, impasto: 0.2, detail: 14, keep: 0.1, jitter: 10 });
    glaze(fr.ctx, { x0: 0, y0: hz - hz * 0.4, x1: 0, y1: hz + 20 }, [[0, K.haze, 0.05], [1, K.haze, 0.38]], [X0, -m, X1 - X0, Y1 + m]);
    // MID
    var md = layerCanvas(w.layers.mid, "ph-mid"); c = md.ctx;
    var mid = Pl.mid, midTop = hz + wh * 0.012;
    var r2 = ridgePts(X0, X1, midTop + wh * 0.03, wh * (T.hills ? 0.09 : T.mountains ? 0.07 : 0.035), r);
    penOf(md.c).fill(PS(r2.concat([[X1, hz + wh * 0.2], [X0, hz + wh * 0.2]]), true), mid);
    glaze(c, { x0: 0, y0: midTop - wh * 0.05, x1: 0, y1: hz + wh * 0.2 }, [[0, K.light, 0.14], [0.5, K.light, 0.0], [1, K.shadow, 0.25]], [X0, midTop - wh * 0.1, X1 - X0, wh * 0.4]);
    if (T.forest) forest(md.c, X0, X1, midTop + wh * 0.045, u(120), Pl.tree, r, Math.round((X1 - X0) / u(42)));
    else if (T.snow) { for (i = 0; i < 7; i++) { var px0 = X0 + r() * (X1 - X0); for (var pj = 0; pj < 9; pj++) tree(md.c, px0 + pj * u(26) + r() * u(10), midTop + wh * 0.04 + r() * u(8), u(70 + r() * 40), "#26302C", r, "pine"); } }
    else if (feat.treeline && !T.desert && !T.snow) {
      for (i = 0; i < 6; i++) { var fx0 = X0 + r() * (X1 - X0); forest(md.c, fx0, fx0 + u(120 + r() * 220), midTop + wh * 0.04 + r() * u(10), u(60 + r() * 30), Pl.tree, r); }
    }
    if (T.desert) for (i = 0; i < 4; i++) { var dx = X0 + r() * (X1 - X0); c.save(); c.globalAlpha = 0.9; penOf(md.c).fill(PS([[dx - u(240), hz + wh * 0.07], [dx, hz + wh * 0.035], [dx + u(260), hz + wh * 0.07]], true), shade(mid, 0.08)); c.restore(); tree(md.c, dx + u(60), hz + wh * 0.065, u(50), Pl.tree, r, "poplar"); }
    if (feat.mill) windmill(md.c, ww * (0.12 + r() * 0.18), midTop + wh * 0.04, u(110), r);
    if (feat.town && o.townMid) town(md.c, ww * 0.6, midTop + wh * 0.05, u(360), u(60), {}, r);
    if (feat.camp) camp(md.c, ww * 0.62, midTop + wh * 0.07, u(420), 2, u(40), "#E0D4B6", r);
    oilPass(md.c, { sizes: [11, 5.5, 2.8], seed: 41, dir: -0.3, flow: 1.1, len: [0.9, 2.0], impasto: 0.4, detail: 16, keep: 0.2 });
    glaze(md.ctx, { x0: 0, y0: hz - wh * 0.05, x1: 0, y1: hz + wh * 0.12 }, [[0, K.haze, 0.2], [1, K.haze, 0.03]], [X0, -m, X1 - X0, Y1 + m]);
    // GROUND
    var gd = layerCanvas(w.layers.ground, "ph-ground"); c = gd.ctx;
    var gTop = hz + wh * 0.04, gp = penOf(gd.c);
    var gtop = ridgePts(X0, X1, gTop + wh * 0.02, wh * 0.025, r);
    var gpath = PS(gtop.concat([[X1, Y1], [X0, Y1]]), true);
    var gg = c.createLinearGradient(0, gTop, 0, Y1);
    gg.addColorStop(0, mixC(Pl.lit, K.haze, 0.45)); gg.addColorStop(0.35, Pl.lit); gg.addColorStop(1, Pl.dk);
    c.save(); c.fillStyle = gg; c.fill(new Path2D(gpath)); c.clip(new Path2D(gpath));
    if (T.mill || Pl.terr === "fields") {
      var vpX = ww * (0.35 + r() * 0.3);
      for (i = 0; i < 9; i++) {
        var xa = X0 + ((X1 - X0) * i) / 9, xb = X0 + ((X1 - X0) * (i + 1)) / 9, sc = Pl.strips[i % Pl.strips.length];
        c.globalAlpha = 0.38; c.fillStyle = sc;
        c.beginPath(); c.moveTo(lerp(vpX, xa, 0.08), gTop + wh * 0.02); c.lineTo(lerp(vpX, xb, 0.08), gTop + wh * 0.02); c.lineTo(xb * 2 - vpX, Y1); c.lineTo(xa * 2 - vpX, Y1); c.fill();
      }
      c.globalAlpha = 1;
    }
    for (i = 0; i < 9; i++) blob(c, X0 + r() * (X1 - X0), gTop + r() * (Y1 - gTop), u(200 + r() * 400), u(50 + r() * 90), r() < 0.55 ? K.light : K.shadow, r() < 0.55 ? 0.22 : 0.22);
    if (T.desert) for (i = 0; i < 40; i++) { c.globalAlpha = 0.25; c.strokeStyle = shade(Pl.lit, r() < 0.5 ? 0.15 : -0.2); c.lineWidth = u(3); var yy = gTop + r() * (Y1 - gTop), xx = X0 + r() * (X1 - X0); c.beginPath(); c.moveTo(xx, yy); c.quadraticCurveTo(xx + u(80), yy - u(10), xx + u(200), yy); c.stroke(); }
    if (T.snow) for (i = 0; i < 16; i++) blob(c, X0 + r() * (X1 - X0), gTop + r() * (Y1 - gTop), u(300), u(46), "#7E8AA0", 0.42);
    c.globalAlpha = 1;
    if (feat.river) {
      var rvx = ww * (0.45 + (r() - 0.5) * 0.3), rp = [], rw2 = [];
      for (i = 0; i <= 16; i++) { var f = i / 16, yy2 = lerp(gTop + wh * 0.02, Y1, f); rp.push([rvx + Math.sin(f * 3.2 + r()) * ww * 0.08 * (0.3 + f) + (f - 0.5) * ww * 0.25, yy2]); rw2.push(lerp(u(12), u(150), Math.pow(f, 1.3))); }
      var left = rp.map(function (q, j) { return [q[0] - rw2[j], q[1]]; }), right = rp.map(function (q, j) { return [q[0] + rw2[j], q[1]]; }).reverse();
      var rpath = new Path2D(PS(left.concat(right), true));
      c.fillStyle = shade(Pl.dk, -0.2); c.save(); c.translate(0, u(4)); c.fill(rpath); c.restore();
      var wg = c.createLinearGradient(0, gTop, 0, Y1); wg.addColorStop(0, mixC(Pl.water, K.hz, 0.4)); wg.addColorStop(1, Pl.water);
      c.fillStyle = wg; c.fill(rpath);
      c.save(); c.clip(rpath); for (i = 0; i < 60; i++) { c.globalAlpha = 0.25 + r() * 0.35; c.fillStyle = K.sunC; var q = rp[Math.floor(r() * rp.length)]; c.fillRect(q[0] + (r() - 0.5) * u(80), q[1] + (r() - 0.5) * u(40), u(14 + r() * 40), u(2)); } c.restore();
      w.river = { pts: rp, widths: rw2 };
    }
    if (feat.road) {
      var ry = num(o.roadY, (gTop + Y1) / 2), rpts = [];
      if (o.road === "across" || o.roadAcross) { for (i = 0; i <= 12; i++) rpts.push([X0 + ((X1 - X0) * i) / 12, ry + Math.sin(i * 0.8 + r() * 0.3) * wh * 0.01]); c.globalAlpha = 0.9; c.strokeStyle = Pl.earth; c.lineWidth = num(o.roadW, u(70)); c.lineCap = "round"; c.stroke(new Path2D(PS(rpts))); c.globalAlpha = 0.4; c.strokeStyle = shade(Pl.earth, 0.18); c.lineWidth = num(o.roadW, u(70)) * 0.4; c.stroke(new Path2D(PS(rpts))); }
      else { var rx0 = ww * 0.55; for (i = 0; i <= 12; i++) { var f2_ = i / 12; rpts.push([rx0 + Math.sin(f2_ * 4) * ww * 0.05 * f2_ + (f2_ - 0.2) * ww * 0.2, lerp(gTop + wh * 0.02, Y1, f2_)]); } for (i = 0; i < rpts.length - 1; i++) { c.globalAlpha = 0.85; c.strokeStyle = Pl.earth; c.lineWidth = lerp(u(8), u(160), i / 12); c.lineCap = "round"; c.beginPath(); c.moveTo(rpts[i][0], rpts[i][1]); c.lineTo(rpts[i + 1][0], rpts[i + 1][1]); c.stroke(); } }
      c.globalAlpha = 1;
      w.road = rpts;
    }
    // broken-colour patches and grass strokes, finer toward the horizon
    for (i = 0; i < 26; i++) { var py2 = gTop + Math.pow(r(), 0.8) * (Y1 - gTop), dep = (py2 - gTop) / (Y1 - gTop); blob(c, X0 + r() * (X1 - X0), py2, u(120 + r() * 260) * (0.4 + dep), u(18 + r() * 40) * (0.4 + dep), r() < 0.5 ? mixC(Pl.lit, "#6E7A3A", 0.5) : mixC(Pl.lit, "#C8A860", 0.5), 0.35); }
    c.lineCap = "round";
    for (i = 0; i < 900; i++) { var gy3 = gTop + Math.pow(r(), 0.55) * (Y1 - gTop), dp = (gy3 - gTop) / (Y1 - gTop), gx3 = X0 + r() * (X1 - X0), gl = u(4 + dp * 22); c.globalAlpha = 0.25 + dp * 0.3; c.strokeStyle = r() < 0.55 ? shade(Pl.dk, 0.1 - r() * 0.2) : shade(Pl.lit, 0.15); c.lineWidth = u(1 + dp * 2.4); c.beginPath(); c.moveTo(gx3, gy3); c.lineTo(gx3 + (r() - 0.5) * gl * 0.6, gy3 - gl); c.stroke(); }
    c.globalAlpha = 1;
    c.restore();
    if (feat.fort) w.fort = fortress(gd.c, ww * 0.62, gTop + wh * 0.1, ww * 0.3, wh * 0.13, { towers: 3 }, r);
    oilPass(gd.c, { sizes: [18, 9, 4.5], seed: 51, dir: 0, flow: 0.35, fscale: 220, len: [1.5, 3.8], impasto: 0.4, detail: 18, keep: 0.18 });
    glaze(gd.ctx, { x0: 0, y0: gTop, x1: 0, y1: Y1 }, [[0, K.haze, 0.28], [0.22, K.haze, 0.0], [0.62, K.shadow, 0.0], [1, K.shadow, 0.55]], [X0, -m, X1 - X0, Y1 + m]);
    glaze(gd.ctx, { cx: sunX, cy: gTop, r: ww * 0.7 }, [[0, K.light, 0.14], [1, K.light, 0]], [X0, gTop - 30, X1 - X0, Y1 - gTop + 30]);
    // NEAR: dark framing grass in the corners, a few rocks, optional framing tree
    var nr = layerCanvas(w.layers.near, "ph-near"); c = nr.ctx;
    var nearY = wh + m * 0.2, corner = (o.near === false) ? 0 : 1;
    if (corner) {
      [[X0, ww * 0.26], [ww * 0.76, X1]].forEach(function (seg, si) {
        var pts = ridgePts(seg[0], seg[1], wh - wh * 0.01, wh * 0.05, r);
        var fall = function (q) { var f = si === 0 ? (q[0] - seg[0]) / (seg[1] - seg[0]) : (seg[1] - q[0]) / (seg[1] - seg[0]); return [q[0], q[1] + Math.pow(f, 1.6) * wh * 0.07]; };
        pts = pts.map(fall);
        var bank = mixC(Pl.dk, "#1A1408", 0.45);
        penOf(nr.c).fill(PS(pts.concat([[seg[1], Y1], [seg[0], Y1]]), true), bank);
        for (var gi = 0; gi < 26; gi++) { var q = pts[Math.floor(r() * pts.length)], br = u(26 + r() * 46); blob(c, q[0], q[1] + br * 0.35, br * 1.3, br * 0.8, r() < 0.6 ? bank : mixC(Pl.tree, Pl.light, 0.25), 0.8); }
        c.lineCap = "round";
        for (gi = 0; gi < 26; gi++) { var q2 = pts[Math.floor(r() * pts.length)], gx2 = q2[0] + (r() - 0.5) * u(30), base = q2[1] + u(16); c.strokeStyle = r() < 0.6 ? mixC(bank, Pl.light, 0.25) : bank; c.globalAlpha = 0.55; c.lineWidth = u(1.6 + r() * 1.4); c.beginPath(); c.moveTo(gx2, base); c.quadraticCurveTo(gx2 + u(6), base - u(20), gx2 + (r() - 0.4) * u(26), base - u(28 + r() * 34)); c.stroke(); }
        c.globalAlpha = 1;
      });
      if (r() < 0.8) { var rkx = ww * (0.06 + r() * 0.12); blob(c, rkx, wh - u(16), u(60), u(30), shade(Pl.rock, -0.3), 0.9); }
    }
    if (feat.frameTree) {
      var side = o.frameTree === "right" ? 1 : -1, tx3 = side < 0 ? -m * 0.2 : ww + m * 0.2;
      c.fillStyle = "#1E140C"; c.beginPath(); c.moveTo(tx3 - u(40) * side, Y1); c.quadraticCurveTo(tx3 + u(30) * -side, wh * 0.5, tx3 + u(60) * -side, -m); c.lineTo(tx3 + u(140) * -side, -m); c.quadraticCurveTo(tx3 + u(80) * -side, wh * 0.5, tx3 + u(60) * -side, Y1); c.fill();
      for (i = 0; i < 26; i++) blob(c, tx3 + (r() * u(420)) * -side, -m + r() * wh * 0.3, u(90 + r() * 80), u(60 + r() * 40), r() < 0.7 ? "#1C2412" : shade(Pl.tree, 0.1), 0.85);
    }
    oilPass(nr.c, { sizes: [10, 5], seed: 61, dir: -PI / 2, flow: 0.9, impasto: 0.35, detail: 18, minAlpha: 120 });
    w.groundTop = gTop;
    return w.api;
  }
  // Interior war-room: replaces the landscape with a tent or a stone hall lit by candles.
  function interior(o) {
    o = obj(o);
    var w = ensure();
    clearLandscape();
    var kind = str(o.kind) === "hall" ? "hall" : "tent", r = rng(kind === "hall" ? 71 : 73), ww = w.ww, wh = w.wh, m = w.m, X0 = -m, X1 = ww + m, Y1 = wh + m;
    w.pal = palette("dusk", "plain");
    w.pal.K = Object.assign({}, w.pal.K, { grade: "#F0A050", gradeA: 0.14, haze: "#6A4A30" });
    w.interior = kind; w.noHaze = true;
    var bk = layerCanvas(w.layers.far, "ph-room"), c = bk.ctx;
    var floorY = wh * (PORT ? 0.6 : 0.68);
    if (kind === "tent") {
      var tg = c.createLinearGradient(0, -m, 0, floorY); tg.addColorStop(0, "#5A3E24"); tg.addColorStop(0.5, "#A07A48"); tg.addColorStop(1, "#7A5A34");
      c.fillStyle = tg; c.fillRect(X0, -m, X1 - X0, floorY + m);
      for (var i = 0; i < 16; i++) { var fx = X0 + ((X1 - X0) * i) / 16 + r() * u(30); c.globalAlpha = 0.35; c.strokeStyle = i % 2 ? "#4A3018" : "#D2AE74"; c.lineWidth = u(14 + r() * 20); c.beginPath(); c.moveTo(fx, -m); c.quadraticCurveTo(fx + u(20), floorY * 0.5, fx - u(10), floorY); c.stroke(); }
      c.globalAlpha = 1;
      c.fillStyle = "#3A2614"; [0.18, 0.82].forEach(function (f) { c.fillRect(ww * f - u(10), -m, u(20), floorY + m); });
      c.globalAlpha = 0.8; c.strokeStyle = "#2E1E10"; c.lineWidth = u(5); c.beginPath(); c.moveTo(X0, wh * 0.12); c.quadraticCurveTo(ww * 0.5, wh * 0.02, X1, wh * 0.12); c.stroke(); c.globalAlpha = 1;
      // an invented campaign standard hanging at the back
      var fx2 = ww * 0.5, fw = u(150);
      c.fillStyle = "#7A1E16"; c.fillRect(fx2 - fw / 2, wh * 0.12, fw, u(200));
      c.strokeStyle = PAL.gold; c.lineWidth = u(6); c.strokeRect(fx2 - fw / 2 + u(10), wh * 0.12 + u(10), fw - u(20), u(180));
      c.fillStyle = PAL.gold; c.beginPath(); c.arc(fx2, wh * 0.12 + u(100), u(34), 0, TAU); c.fill();
      c.fillStyle = "#7A1E16"; c.beginPath(); c.arc(fx2, wh * 0.12 + u(100), u(20), 0, TAU); c.fill();
    } else {
      c.fillStyle = "#4A3E32"; c.fillRect(X0, -m, X1 - X0, floorY + m);
      for (var by = -m; by < floorY; by += u(46)) for (var bx = X0 + ((by / u(46)) % 2) * u(40); bx < X1; bx += u(80)) { c.fillStyle = mixC("#5E5244", r() < 0.5 ? "#3A3026" : "#7A6C58", r() * 0.6); c.fillRect(bx + u(2), by + u(2), u(76), u(42)); }
      [0.2, 0.8].forEach(function (f) {
        var ax = ww * f, aw = u(260), ay = wh * 0.12;
        c.fillStyle = "#1E1812"; c.beginPath(); c.moveTo(ax - aw / 2, floorY); c.lineTo(ax - aw / 2, ay + aw / 2); c.arc(ax, ay + aw / 2, aw / 2, PI, 0); c.lineTo(ax + aw / 2, floorY); c.fill();
        var lg = c.createLinearGradient(ax, ay, ax, floorY); lg.addColorStop(0, "rgba(255,214,150,0.5)"); lg.addColorStop(1, "rgba(255,214,150,0.05)");
        c.fillStyle = lg; c.beginPath(); c.moveTo(ax - aw * 0.32, floorY); c.lineTo(ax - aw * 0.32, ay + aw / 2); c.arc(ax, ay + aw / 2, aw * 0.32, PI, 0); c.lineTo(ax + aw * 0.32, floorY); c.fill();
      });
      c.fillStyle = "#24402E"; c.fillRect(ww * 0.5 - u(110), wh * 0.08, u(220), u(300));
      c.strokeStyle = PAL.gold; c.lineWidth = u(5); c.strokeRect(ww * 0.5 - u(100), wh * 0.08 + u(10), u(200), u(280));
      c.fillStyle = PAL.gold; c.beginPath(); c.moveTo(ww * 0.5, wh * 0.08 + u(80)); c.lineTo(ww * 0.5 + u(50), wh * 0.08 + u(150)); c.lineTo(ww * 0.5, wh * 0.08 + u(220)); c.lineTo(ww * 0.5 - u(50), wh * 0.08 + u(150)); c.fill();
    }
    var fl = c.createLinearGradient(0, floorY, 0, Y1); fl.addColorStop(0, "#5A3E26"); fl.addColorStop(1, "#24160C");
    c.fillStyle = fl; c.fillRect(X0, floorY, X1 - X0, Y1 - floorY);
    c.fillStyle = "#6A2A1C"; c.globalAlpha = 0.8; c.beginPath(); c.ellipse(ww * 0.5, floorY + (Y1 - floorY) * 0.5, ww * 0.42, (Y1 - floorY) * 0.4, 0, 0, TAU); c.fill(); c.globalAlpha = 1;
    oilPass(bk.c, { sizes: [16, 8, 4], seed: 81, dir: kind === "tent" ? PI / 2 : 0, flow: 0.4, impasto: 0.3, detail: 18 });
    glaze(c, { cx: ww * 0.5, cy: wh * 0.55, r0: 0, r: Math.max(ww, wh) * 0.75 }, [[0, "#FFB060", 0.22], [0.5, "#3A2010", 0.15], [1, "#0C0603", 0.7]], [X0, -m, X1 - X0, Y1 + m]);
    w.floorY = floorY;
    w.hz = floorY - wh * 0.05;
    return w.api;
  }

  // ------------------------- factions -------------------------
  // Every flag is an invented emblem (chevrons, rings, lozenges, suns, towers); no real flag or national symbol.
  var FACTIONS = {
    redcoat: { name: "Redcoats", coat: "#A8261C", trim: "#E8D9A8", belts: "#EFE8D6", trousers: "#77777C", boots: "#1C1612", hat: "shako", hatC: "#1A1A1C", plume: "#EFE8D6", weapon: "musket", tails: 1, officerHat: "bicorne", flag: { field: "#E8D9B0", pattern: "chevron", c1: "#A8261C", c2: "#C8963E" }, horse: "#5E3A22", era: "gun" },
    bluecoat: { name: "Bluecoats", coat: "#26407A", trim: "#B8281E", belts: "#EFE8D6", trousers: "#E8E2D2", boots: "#1C1612", hat: "shako", hatC: "#1A1A1C", plume: "#B8281E", weapon: "musket", tails: 1, officerHat: "bicorne", flag: { field: "#26407A", pattern: "wreath", c1: "#C8963E", c2: "#E8E2D2" }, horse: "#3A2A20", era: "gun" },
    whitecoat: { name: "Whitecoats", coat: "#E2DCCD", trim: "#8E2A2A", belts: "#F4F0E6", trousers: "#E2DCCD", boots: "#1C1612", hat: "shako", hatC: "#2A2622", plume: null, weapon: "musket", tails: 1, officerHat: "bicorne", flag: { field: "#E2C060", pattern: "lozenge", c1: "#2A2A2A", c2: "#8E2A2A" }, horse: "#8A8478", era: "gun" },
    greencoat: { name: "Greencoats", coat: "#2E4A32", trim: "#9A2A24", belts: "#EFE8D6", trousers: "#E2DCCC", boots: "#1C1612", hat: "shako", hatC: "#1A1A1C", plume: "#2E4A32", weapon: "musket", tails: 1, officerHat: "bicorne", flag: { field: "#E4DCC8", pattern: "sun", c1: "#2E4A32", c2: "#C8963E" }, horse: "#4A3020", era: "gun" },
    prussian: { name: "Prussians", coat: "#1E2840", trim: "#A8281E", belts: "#EFE8D6", trousers: "#2A2A30", boots: "#141210", hat: "pickelhaube", hatC: "#18181A", plume: null, weapon: "musket", tails: 0, officerHat: "pickelhaube", flag: { field: "#D8D4CA", pattern: "roundel", c1: "#1E2840", c2: "#C8963E" }, horse: "#2A2220", era: "gun" },
    union: { name: "Union", coat: "#233456", trim: "#7E92B4", belts: "#241A12", trousers: "#7E92B4", boots: "#1C1612", hat: "kepi", hatC: "#233456", plume: null, weapon: "musket", tails: 0, skirt: 1, officerHat: "kepi", flag: { field: "#233456", pattern: "band", c1: "#E4DCC4", c2: "#C8963E" }, horse: "#5A3820", era: "gun" },
    continental: { name: "Continentals", coat: "#2C3E6C", trim: "#D8C08A", belts: "#EFE8D6", trousers: "#D8C8A0", boots: "#1C1612", hat: "tricorne", hatC: "#1A1816", plume: null, weapon: "musket", tails: 1, officerHat: "tricorne", flag: { field: "#D8C8A0", pattern: "tower", c1: "#2C3E6C", c2: "#8E2A2A" }, horse: "#6A4426", era: "gun" },
    musketeer: { name: "Musketeers", coat: "#8A6A3E", trim: "#A82A22", belts: "#A82A22", trousers: "#4E4236", boots: "#2A1E14", hat: "cavalier", hatC: "#2A2018", plume: "#EFE8D6", weapon: "musket", tails: 0, skirt: 1, officerHat: "cavalier", flag: { field: "#7A1E1E", pattern: "band", c1: "#E8DCC0", c2: "#C8963E" }, horse: "#3A2A1E", era: "gun" },
    roman: { name: "Legion", coat: "#A8281E", armour: "#8E8C86", trim: "#C8963E", belts: "#5A3A22", trousers: null, boots: "#5A3A22", hat: "galea", hatC: "#9A9890", plume: "#A8281E", weapon: "pilum", shield: "scutum", shieldC: "#A8281E", skirt: 1, bare: 1, officerHat: "galea", flag: { field: "#A8281E", pattern: "roundel", c1: "#C8963E", c2: "#C8963E", shape: "vexillum" }, horse: "#5E3A22", era: "ancient" },
    hoplite: { name: "Hoplites", coat: "#E4DCC8", armour: "#B08A44", trim: "#8E2A2A", belts: "#5A3A22", trousers: null, boots: "#B08A44", hat: "corinthian", hatC: "#B08A44", plume: "#2A1E14", weapon: "spear", shield: "hoplon", shieldC: "#B8904A", skirt: 1, bare: 1, cloak: "#8E2A2A", officerHat: "corinthian", flag: { field: "#E4DCC8", pattern: "ring", c1: "#8E2A2A", c2: "#B08A44", shape: "pennant" }, horse: "#6A4426", era: "ancient" },
    knight: { name: "Knights", coat: "#2E4A8A", armour: "#8E8E8A", trim: "#C8963E", belts: "#5A3A22", trousers: "#8E8E8A", boots: "#6E6E6A", hat: "greathelm", hatC: "#9A9A94", plume: null, weapon: "sword", shield: "kite", shieldC: "#2E4A8A", skirt: 1, officerHat: "greathelm", flag: { field: "#2E4A8A", pattern: "lozenge", c1: "#C8963E", c2: "#E8DCC0", shape: "swallow" }, horse: "#A8A49C", era: "medieval" },
    samurai: { name: "Samurai", coat: "#3A1E1C", armour: "#3A1E1C", trim: "#A8281E", belts: "#A8281E", trousers: "#3A3430", boots: "#2A2220", hat: "kabuto", hatC: "#2A2220", plume: "#C8963E", weapon: "yari", skirt: 1, back: 1, officerHat: "kabuto", flag: { field: "#EDE8DC", pattern: "ring", c1: "#1A1A1A", c2: "#A8281E", shape: "nobori" }, horse: "#3A2A1E", era: "eastern" },
    viking: { name: "Shield wall", coat: "#6A4A2E", armour: null, trim: "#8A2A1E", belts: "#3A2A1A", trousers: "#8A7A5E", boots: "#3A2A1A", hat: "spangen", hatC: "#7A7A76", plume: null, weapon: "axe", shield: "round", shieldC: "#8A2A1E", skirt: 1, officerHat: "spangen", flag: { field: "#8A2A1E", pattern: "ring", c1: "#E4D4B0", c2: "#2A1E14", shape: "pennant" }, horse: "#6A4A2A", era: "medieval" },
    mongol: { name: "Horde", coat: "#8A5A2E", armour: null, trim: "#C8963E", belts: "#7A4A2A", trousers: "#5A4A3A", boots: "#2A1E14", hat: "furcap", hatC: "#6A4A2A", plume: null, weapon: "bow", skirt: 1, officerHat: "furcap", flag: { field: "#E4DCC8", pattern: "sun", c1: "#7A2A1E", c2: "#C8963E", shape: "pennant" }, horse: "#8A6A44", era: "eastern" },
    ottoman: { name: "Janissaries", coat: "#2E4A7A", armour: null, trim: "#A8281E", belts: "#C8963E", trousers: "#A8281E", boots: "#8A6A3A", hat: "bork", hatC: "#EDE8DC", plume: null, weapon: "musket", skirt: 1, officerHat: "bork", flag: { field: "#8E1E1E", pattern: "rosette", c1: "#C8963E", c2: "#E8DCC0" }, horse: "#E2DCD0", era: "gun" },
  };
  var FACTION_IDS = Object.keys(FACTIONS);
  var FACTION_SYN = [
    [/brit|engl|scot|redcoat|wellington|allied|allies|hanover|loyal/, "redcoat"], [/french|france|napol|imperial|grande|gaul(?!ish)/, "bluecoat"],
    [/austria|habsburg|bourbon|confeder|rebel|white/, "whitecoat"], [/russia|cossack|rifle|green/, "greencoat"], [/prussia|german|saxon(?!s)|bavar/, "prussian"],
    [/union|federal|yankee|north/, "union"], [/contin|patriot|american|colonial|minute/, "continental"], [/spain|spanish|dutch|swed|tercio|musket|pike|cavalier|royalist|parliament/, "musketeer"],
    [/roman|rome|legion|byzant|latin/, "roman"], [/greek|greece|sparta|athen|maced|hoplit|carthag|phalanx|troy|trojan/, "hoplite"], [/knight|crusad|norman|templar|teuton|medieval|frank|castil/, "knight"],
    [/japan|samurai|shogun|ashigaru|daimyo/, "samurai"], [/viking|norse|dane|danish|saxons|celt|gaulish|germanic|barbarian|goth|anglo|briton/, "viking"],
    [/mongol|khan|hun|tatar|steppe|horde|scyth|turkic/, "mongol"], [/ottoman|turk|janiss|sultan|persia|arab|saracen|mamluk|egypt|moor/, "ottoman"],
  ];
  function guessFaction(text, def) {
    var t = str(text).toLowerCase();
    if (FACTIONS[t]) return t;
    for (var i = 0; i < FACTION_SYN.length; i++) if (FACTION_SYN[i][0].test(t)) return FACTION_SYN[i][1];
    return def || "redcoat";
  }
  var ENEMY = { redcoat: "bluecoat", bluecoat: "redcoat", whitecoat: "bluecoat", greencoat: "bluecoat", prussian: "bluecoat", union: "whitecoat", continental: "redcoat", musketeer: "whitecoat", roman: "viking", hoplite: "ottoman", knight: "ottoman", samurai: "mongol", viking: "knight", mongol: "knight", ottoman: "knight" };
  function enemyOf(id) { return ENEMY[guessFaction(id)] || "bluecoat"; }
  // A faction object; variant > 0 recolours the coat so two armies of one preset stay distinguishable.
  var FCACHE = {};
  function faction(id, variant) {
    var key = guessFaction(id), v = Math.max(0, Math.round(num(variant, 0))), ck = key + ":" + v;
    if (FCACHE[ck]) return FCACHE[ck];
    var F = Object.assign({ id: key }, FACTIONS[key]);
    F.flag = Object.assign({}, F.flag);
    if (v) {
      var alt = ["#6A2A4A", "#2E5E5A", "#7A5A22", "#4A4A52"][(v - 1) % 4];
      F.coat = alt; if (F.shield) F.shieldC = alt; F.flag.field = mixC(alt, "#E8DCC0", 0.15); F.flag.pattern = "chevron"; F.flag.c1 = "#E8DCC0";
      F.variant = v;
    }
    FCACHE[ck] = F;
    return F;
  }
  function factionOf(spec, def, variant) {
    if (spec && typeof spec === "object" && spec.coat) return spec;
    var s = obj(spec), id = typeof spec === "string" ? spec : s.faction || s.name || def;
    return faction(guessFaction(id, def), variant);
  }
  function lumHex(c) { var x = hexRGB(c); return x[0] * 0.3 + x[1] * 0.59 + x[2] * 0.11; }
  function strongCol(F) { var c = F.coat; if (lumHex(c) > 160) c = F.cloak || (lumHex(F.trim || "#000") < 150 ? F.trim : "#5A4A3A"); return c; }
  function sideColours(FA, FD) {
    var a = strongCol(FA), d = strongCol(FD), x = hexRGB(a), y = hexRGB(d);
    if (Math.abs(x[0] - y[0]) + Math.abs(x[1] - y[1]) + Math.abs(x[2] - y[2]) < 110) d = x[2] > x[0] ? "#8E2A1E" : "#2E4A7A";
    return [a, d];
  }
  var SKINS = ["#E2B48E", "#D29C76", "#C0865E", "#E8C4A0", "#B07452", "#DCA882"];
  var HAIR = ["#2A1E16", "#4A3222", "#6A4A2E", "#8A8278", "#C8C2B8", "#1A1612", "#7A5232"];

  // ------------------------- figure geometry (units: feet at y 0, a man is about 100 tall, facing +x) -------------------------
  function FL() {
    var list = [];
    return {
      list: list,
      f: function (d, c, o) { o = o || {}; list.push({ t: "f", d: d, c: c, a: o.a, edge: o.edge !== false, tex: o.tex !== false }); },
      l: function (pts, c, w, o) { o = o || {}; list.push({ t: "l", d: typeof pts === "string" ? pts : P(pts), c: c, w: w, a: o.a, hi: o.hi !== false }); },
      e: function (x, y, rx, ry, c, o) { o = o || {}; list.push({ t: "f", d: ellD(x, y, rx, ry), c: c, a: o.a, edge: o.edge !== false, tex: o.tex !== false }); },
      glow: function (x, y, r, c, a) { list.push({ t: "g", x: x, y: y, r: r, c: c, a: a }); },
    };
  }
  function rot(p, cx, cy, a) { var c = Math.cos(a), s = Math.sin(a), dx = p[0] - cx, dy = p[1] - cy; return [cx + dx * c - dy * s, cy + dx * s + dy * c]; }
  function rotAll(pts, cx, cy, a) { return pts.map(function (p) { return rot(p, cx, cy, a); }); }
  function ik(sh, hand, l1, l2, bend) {
    var dx = hand[0] - sh[0], dy = hand[1] - sh[1], d = Math.min(Math.hypot(dx, dy), l1 + l2 - 0.01), a = Math.atan2(dy, dx);
    var c = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1), b = Math.acos(c) * (bend || 1);
    return [sh[0] + Math.cos(a + b) * l1, sh[1] + Math.sin(a + b) * l1];
  }
  // Hats around a head centre (cx, cy), head radius about 6.3.
  function hatShapes(g, type, F, cx, cy) {
    var hc = F.hatC || "#1A1A1C", metal = "#9A9890", brass = "#C8A048";
    switch (type) {
      case "shako":
        g.f(P([[cx - 6, cy - 4], [cx + 6.6, cy - 4], [cx + 7.6, cy - 17], [cx - 6.4, cy - 17]], true), hc);
        g.f(P([[cx + 4.5, cy - 4.4], [cx + 11.5, cy - 2.6], [cx + 4.5, cy - 6.4]], true), shade(hc, -0.2), { tex: false });
        g.e(cx + 3.2, cy - 10, 2, 2.4, brass, { edge: false, tex: false });
        if (F.plume) g.e(cx + 0.5, cy - 21, 2, 4.4, F.plume);
        break;
      case "bicorne":
        g.f("M" + (cx - 9.5) + " " + (cy - 4) + "Q" + cx + " " + (cy - 20) + " " + (cx + 9.5) + " " + (cy - 4) + "Q" + cx + " " + (cy - 8.5) + " " + (cx - 9.5) + " " + (cy - 4) + "Z", hc);
        g.e(cx + 1, cy - 11, 1.8, 1.8, F.trim || "#C8963E", { edge: false, tex: false });
        g.l([[cx - 8, cy - 6], [cx, cy - 15], [cx + 8, cy - 6]], brass, 0.7, { hi: false, a: 0.7 });
        break;
      case "tricorne":
        g.f(P([[cx - 10, cy - 4], [cx + 11, cy - 4.5], [cx + 7, cy - 12], [cx, cy - 14.5], [cx - 7, cy - 12]], true), hc);
        g.l([[cx - 10, cy - 4], [cx + 11, cy - 4.5]], "#E8E0CC", 0.9, { hi: false });
        break;
      case "kepi":
        g.f(P([[cx - 6.2, cy - 3.5], [cx + 6.2, cy - 3.5], [cx + 3.5, cy - 13], [cx - 5.5, cy - 11]], true), hc);
        g.f(P([[cx + 3.5, cy - 4], [cx + 10, cy - 2.5], [cx + 4, cy - 6]], true), "#141210", { tex: false });
        break;
      case "pickelhaube":
        g.f("M" + (cx - 7.6) + " " + (cy - 2.5) + "A7.6 8 0 0 1 " + (cx + 7.6) + " " + (cy - 2.5) + "Z", hc);
        g.l([[cx + 0.5, cy - 10], [cx + 0.5, cy - 19]], brass, 1.8);
        g.f(P([[cx + 4, cy - 3], [cx + 11, cy - 1.5], [cx + 4, cy - 5]], true), "#141210", { tex: false });
        g.e(cx + 3.6, cy - 6, 1.8, 2, brass, { edge: false, tex: false });
        break;
      case "galea":
        g.f("M" + (cx - 7.4) + " " + (cy - 1) + "A7.4 8 0 0 1 " + (cx + 7.4) + " " + (cy - 1) + "Z", metal);
        g.f(P([[cx - 7.4, cy - 1.5], [cx - 9.5, cy + 2.5], [cx - 5, cy + 1]], true), shade(metal, -0.2), { tex: false });
        g.f(P([[cx + 3, cy - 1], [cx + 5, cy + 5], [cx + 7, cy - 1]], true), shade(metal, -0.1), { tex: false });
        g.f("M" + (cx - 7) + " " + (cy - 7) + "Q" + (cx - 1) + " " + (cy - 18) + " " + (cx + 6) + " " + (cy - 8) + "L" + (cx + 4) + " " + (cy - 6) + "Q" + (cx - 1) + " " + (cy - 13) + " " + (cx - 5) + " " + (cy - 5) + "Z", F.plume || "#A8281E");
        break;
      case "corinthian":
        g.f("M" + (cx - 7.6) + " " + (cy + 3) + "L" + (cx - 7.6) + " " + (cy - 2) + "A7.6 8.4 0 0 1 " + (cx + 7.8) + " " + (cy - 2) + "L" + (cx + 7.8) + " " + (cy + 6) + "L" + (cx + 3) + " " + (cy + 7) + "L" + (cx + 3) + " " + (cy + 1) + "Z", hc);
        g.l([[cx + 2.5, cy - 1.5], [cx + 7.6, cy - 1.5]], "#1A120C", 1.2, { hi: false });
        g.f("M" + (cx - 9) + " " + (cy - 4) + "Q" + (cx - 2) + " " + (cy - 24) + " " + (cx + 7) + " " + (cy - 9) + "L" + (cx + 5) + " " + (cy - 7) + "Q" + (cx - 2) + " " + (cy - 17) + " " + (cx - 6) + " " + (cy - 3) + "Z", F.plume || "#2A1E14");
        break;
      case "greathelm":
        g.f(P([[cx - 7.2, cy + 6.5], [cx - 7.2, cy - 8], [cx - 5, cy - 10], [cx + 6, cy - 10], [cx + 8, cy - 8], [cx + 8, cy + 6.5]], true), hc);
        g.l([[cx + 1.5, cy - 2], [cx + 8, cy - 2]], "#141210", 1.3, { hi: false });
        g.l([[cx + 0.5, cy - 9.5], [cx + 0.5, cy + 6]], shade(hc, 0.25), 0.8, { hi: false, a: 0.7 });
        break;
      case "kabuto":
        g.f("M" + (cx - 7.6) + " " + (cy - 1) + "A7.6 8.2 0 0 1 " + (cx + 7.6) + " " + (cy - 1) + "Z", hc);
        g.f("M" + (cx - 6) + " " + (cy - 2) + "Q" + (cx - 14) + " " + cy + " " + (cx - 15) + " " + (cy + 7) + "L" + (cx - 5) + " " + (cy + 4) + "Z", shade(hc, 0.06));
        g.f("M" + (cx + 4) + " " + (cy - 8) + "Q" + (cx + 2) + " " + (cy - 20) + " " + (cx - 4) + " " + (cy - 23) + "Q" + (cx + 6) + " " + (cy - 19) + " " + (cx + 7) + " " + (cy - 7) + "Z", F.plume || "#C8963E", { tex: false });
        break;
      case "cavalier":
        g.f(ellD(cx + 0.5, cy - 5.5, 13, 2.8), hc);
        g.f(P([[cx - 5.5, cy - 5.5], [cx + 5.5, cy - 5.5], [cx + 4, cy - 13.5], [cx - 4, cy - 13.5]], true), hc);
        if (F.plume) g.f("M" + (cx + 2) + " " + (cy - 12) + "Q" + (cx - 8) + " " + (cy - 20) + " " + (cx - 15) + " " + (cy - 9) + "Q" + (cx - 7) + " " + (cy - 14) + " " + (cx + 1) + " " + (cy - 9) + "Z", F.plume);
        break;
      case "bork":
        g.f("M" + (cx - 6) + " " + (cy - 3) + "L" + (cx + 6) + " " + (cy - 3) + "Q" + (cx + 5) + " " + (cy - 18) + " " + (cx - 1) + " " + (cy - 24) + "Q" + (cx - 13) + " " + (cy - 22) + " " + (cx - 14) + " " + (cy - 6) + "Q" + (cx - 8) + " " + (cy - 12) + " " + (cx - 6) + " " + (cy - 3) + "Z", hc);
        g.l([[cx - 6.2, cy - 3.5], [cx + 6.2, cy - 3.5]], "#C8963E", 1.8, { hi: false });
        break;
      case "furcap":
        g.f("M" + (cx - 6.6) + " " + (cy - 4) + "A6.6 8 0 0 1 " + (cx + 6.6) + " " + (cy - 4) + "Z", F.trim || "#8E2A2A");
        g.f(P([[cx - 7.8, cy - 1.5], [cx + 7.8, cy - 1.5], [cx + 7.4, cy - 6.5], [cx - 7.4, cy - 6.5]], true), hc);
        g.l([[cx, cy - 12], [cx + 1, cy - 16]], "#C8963E", 1.2);
        break;
      case "spangen":
        g.f(P([[cx - 7.2, cy - 2], [cx + 7.6, cy - 2], [cx + 0.6, cy - 15]], true), hc);
        g.l([[cx + 5.5, cy - 3], [cx + 6.5, cy + 3]], shade(hc, -0.1), 1.3, { hi: false });
        break;
      case "none": default:
        g.f("M" + (cx - 6.3) + " " + (cy - 0.5) + "A6.3 6.6 0 0 1 " + (cx + 5.6) + " " + (cy - 3) + "Q" + (cx + 1) + " " + (cy - 5) + " " + (cx - 6.3) + " " + (cy - 0.5) + "Z", HAIR[1], { tex: false });
    }
  }
  function headShapes(g, F, cx, cy, skin, hat, hair) {
    g.e(cx, cy, 6.1, 6.6, skin);
    g.f("M" + (cx - 6) + " " + (cy - 1) + "A6 6.6 0 0 0 " + (cx - 1) + " " + (cy + 6.4) + "Q" + (cx - 4) + " " + (cy + 2) + " " + (cx - 6) + " " + (cy - 1) + "Z", shade(skin, -0.25), { edge: false, tex: false });
    g.f("M" + (cx - 6) + " " + (cy - 1.5) + "Q" + (cx - 5) + " " + (cy - 6.5) + " " + cx + " " + (cy - 6.6) + "L" + (cx - 2.5) + " " + (cy - 2) + "L" + (cx - 3) + " " + (cy + 3) + "Z", hair || HAIR[0], { edge: false, tex: false });
    g.f(P([[cx + 5.6, cy - 1], [cx + 8, cy + 1.6], [cx + 5.6, cy + 2.4]], true), shade(skin, -0.08), { edge: false, tex: false });
    g.e(cx + 3.6, cy - 1, 0.8, 0.8, "#1A120C", { edge: false, tex: false });
    hatShapes(g, hat || F.hat, F, cx, cy);
  }
  function shieldShapes(g, F, x, y, kind) {
    var c = F.shieldC || F.coat, rim = F.era === "ancient" ? "#C8A048" : "#3A2A1A", gold = "#C8963E";
    if (kind === "scutum") {
      g.f("M" + (x - 7.5) + " " + (y - 21) + "Q" + x + " " + (y - 24) + " " + (x + 7.5) + " " + (y - 21) + "L" + (x + 7.5) + " " + (y + 20) + "Q" + x + " " + (y + 23) + " " + (x - 7.5) + " " + (y + 20) + "Z", c);
      g.l([[x - 6, y - 18], [x + 6, y - 18]], gold, 1.2, { hi: false }); g.l([[x - 6, y + 18], [x + 6, y + 18]], gold, 1.2, { hi: false });
      g.e(x, y, 3, 3.4, "#C8A048"); g.l([[x, y - 15], [x, y - 5]], gold, 1, { hi: false }); g.l([[x, y + 5], [x, y + 15]], gold, 1, { hi: false });
    } else if (kind === "hoplon") {
      g.e(x, y, 15, 15.5, rim); g.e(x + 0.5, y, 12.5, 13, c);
      g.f(ellD(x + 0.5, y, 5.5, 5.8), shade(c, -0.25), { tex: false }); g.e(x + 0.5, y, 3, 3.2, "#8E2A2A", { tex: false });
    } else if (kind === "round") {
      g.e(x, y, 13.5, 14, "#5A3A22"); g.f("M" + x + " " + (y - 13) + "A12.5 13 0 0 1 " + x + " " + (y + 13) + "Z", c); g.f("M" + x + " " + (y - 13) + "A12.5 13 0 0 0 " + x + " " + (y + 13) + "Z", "#D8C8A0");
      g.e(x, y, 3.4, 3.4, "#8A8A86");
    } else if (kind === "kite") {
      g.f("M" + (x - 8) + " " + (y - 18) + "Q" + x + " " + (y - 22) + " " + (x + 8) + " " + (y - 18) + "Q" + (x + 8) + " " + (y + 4) + " " + x + " " + (y + 24) + "Q" + (x - 8) + " " + (y + 4) + " " + (x - 8) + " " + (y - 18) + "Z", c);
      g.f(P([[x - 7, y - 4], [x, y - 12], [x + 7, y - 4], [x + 7, y], [x, y - 8], [x - 7, y]], true), gold, { tex: false });
    }
  }
  // Weapon line from p0 (grip end) to p1 (point end).
  function weaponShapes(g, kind, p0, p1, o) {
    o = o || {};
    var wood = "#5A3A22", steel = "#B8B8B2", dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    function along(f, off) { return [p0[0] + dx * f + nx * (off || 0), p0[1] + dy * f + ny * (off || 0)]; }
    if (kind === "musket") {
      g.f(P([along(0, -2.2), along(0.3, -1.4), along(1, -0.9), along(1, 0.9), along(0.3, 1.2), along(0, 2.2)], true), wood, { tex: false });
      g.l([along(0.25, -0.9), along(1.02, -0.9)], "#7A7A76", 0.9, { hi: false });
      if (o.bayonet !== false) g.l([along(1, -0.6), [p1[0] + ux * 11, p1[1] + uy * 11]], steel, 0.8, { hi: false });
    } else if (kind === "spear" || kind === "yari" || kind === "pike" || kind === "lance" || kind === "pilum") {
      g.l([p0, p1], kind === "pilum" ? "#6A4A2E" : wood, kind === "pike" ? 1.4 : 1.6);
      var hl = kind === "pilum" ? 14 : kind === "yari" ? 9 : 7;
      if (kind === "pilum") g.l([p1, [p1[0] + ux * hl, p1[1] + uy * hl]], "#8A8A86", 0.9, { hi: false });
      var tip = [p1[0] + ux * (hl + 5), p1[1] + uy * (hl + 5)], b = kind === "pilum" ? [p1[0] + ux * hl, p1[1] + uy * hl] : p1;
      g.f(P([[b[0] + nx * 1.8, b[1] + ny * 1.8], tip, [b[0] - nx * 1.8, b[1] - ny * 1.8]], true), steel, { tex: false });
      if (kind === "lance" && o.pennon) g.f(P([along(0.86, 0), along(0.98, 0), [p0[0] + dx * 0.9 + nx * 7, p0[1] + dy * 0.9 + ny * 7]], true), o.pennon, { tex: false });
    } else if (kind === "sword" || kind === "sabre") {
      g.l([p0, along(0.22)], "#3A2A1A", 2);
      g.l([along(0.2, -4), along(0.2, 4)], "#C8A048", 1.4, { hi: false });
      if (kind === "sabre") g.f("M" + f1(along(0.2)[0]) + " " + f1(along(0.2)[1]) + "Q" + f1(along(0.6, 3)[0]) + " " + f1(along(0.6, 3)[1]) + " " + f1(p1[0]) + " " + f1(p1[1]) + "L" + f1(along(0.2, 1.4)[0]) + " " + f1(along(0.2, 1.4)[1]) + "Z", steel, { tex: false });
      else g.f(P([along(0.2, -1.1), [p1[0], p1[1]], along(0.2, 1.1)], true), steel, { tex: false });
    } else if (kind === "axe") {
      g.l([p0, p1], wood, 1.8);
      g.f("M" + f1(along(0.8, 0)[0]) + " " + f1(along(0.8, 0)[1]) + "Q" + f1(along(0.86, 8)[0]) + " " + f1(along(0.86, 8)[1]) + " " + f1(along(1.02, 9)[0]) + " " + f1(along(1.02, 9)[1]) + "L" + f1(along(1, 0)[0]) + " " + f1(along(1, 0)[1]) + "Z", steel, { tex: false });
    } else if (kind === "bow") {
      var c = p0, R = 16;
      g.l("M" + f1(c[0] - 2) + " " + f1(c[1] - R) + "Q" + f1(c[0] + 9) + " " + f1(c[1]) + " " + f1(c[0] - 2) + " " + f1(c[1] + R), "#4A2E1A", 1.6);
      g.l([[c[0] - 2, c[1] - R], [o.drawn ? c[0] - 12 : c[0] - 3, c[1]], [c[0] - 2, c[1] + R]], "#D8D0B8", 0.5, { hi: false });
      if (o.drawn) g.l([[c[0] - 12, c[1]], [c[0] + 14, c[1]]], "#6A4A2E", 0.8, { hi: false });
    } else if (kind === "rammer") {
      g.l([p0, p1], wood, 1.4); g.e(p1[0], p1[1], 2, 2, "#3A2A1A");
    } else if (kind === "staff") {
      g.l([p0, p1], wood, 1.6);
    }
  }
  // A foot soldier. pose: stand march aim charge officer bearer drum fallen-ish (kneel); phase: walk cycle (radians).
  function soldierShapes(F, pose, phase, v) {
    var g = FL(), skin = SKINS[(hstr(F.id) + (v | 0)) % SKINS.length], hair = HAIR[(v | 0) % 3];
    pose = pose || "stand"; phase = num(phase, 0);
    var isOff = pose === "officer" || pose === "officer-walk", run = pose === "charge", walk = run || pose === "march" || pose === "officer-walk", amp = run ? 0.64 : walk ? 0.4 : 0;
    var kneel = pose === "kneel";
    var a1 = walk ? amp * Math.sin(phase) : pose === "aim" ? 0.16 : 0.05, a2 = walk ? -amp * Math.sin(phase) : pose === "aim" ? -0.2 : -0.05;
    var bk = run ? 1.0 : 0.6, b1 = walk ? bk * Math.max(0, Math.cos(phase)) : 0, b2 = walk ? bk * Math.max(0, -Math.cos(phase)) : 0;
    if (kneel) { a1 = 1.3; b1 = 1.5; a2 = -0.1; b2 = -1.6; }
    var L1 = 22 * Math.cos(a1) + 21 * Math.cos(a1 - b1), L2 = 22 * Math.cos(a2) + 21 * Math.cos(a2 - b2);
    var hy = -Math.max(L1, L2) - 3, hx = 0;
    if (kneel) hy = -24;
    var lean = run ? 0.3 : pose === "aim" ? 0.05 : walk ? 0.05 : 0;
    var ancient = F.era === "ancient" || F.era === "medieval" || F.era === "eastern";
    var legC = F.trousers || skin, bootC = F.boots || "#1C1612";
    function leg(a, b) {
      var k = [hx + 22 * Math.sin(a), hy + 22 * Math.cos(a)], an = [k[0] + 21 * Math.sin(a - b), k[1] + 21 * Math.cos(a - b)];
      return { k: k, an: an };
    }
    function drawLeg(Lg, far) {
      var col = far ? shade(legC, -0.18) : legC;
      g.l([[hx, hy], Lg.k], col, 7.2, { hi: !far });
      g.l([Lg.k, Lg.an], col, 6, { hi: !far });
      var lowFrac = F.bare ? 0.35 : 0.42, gk = [lerp(Lg.k[0], Lg.an[0], lowFrac), lerp(Lg.k[1], Lg.an[1], lowFrac)];
      g.l([gk, Lg.an], far ? shade(bootC, -0.1) : bootC, F.bare ? 4.6 : 6.2, { hi: false });
      g.f(P([[Lg.an[0] - 3, Lg.an[1] - 1.5], [Lg.an[0] + 7, Lg.an[1] + 0.5], [Lg.an[0] + 7, Lg.an[1] + 3], [Lg.an[0] - 3, Lg.an[1] + 3]], true), shade(bootC, -0.15), { tex: false });
    }
    var LgF = leg(a2, b2), LgN = leg(a1, b1);
    // upper body points relative to the hip, rotated by lean
    function U(p) { return rot([hx + p[0], hy + p[1]], hx, hy, lean); }
    function UA(pts) { return pts.map(U); }
    var sh = U([1.5, -26]), shF = U([-3, -25.5]), neck = U([1.6, -28.5]), head = U([2.6, -35.5]);
    // hands and weapon by pose
    var wk = F.weapon, wp = null, hN, hF, bend = -1, wkind = wk, o2 = {};
    var melee = wk !== "musket";
    if (isOff) { hN = U([15, -46]); wp = [hN, U([30, -74])]; wkind = "sword"; hF = U([-2, -12]); }
    else if (pose === "bearer") { hN = [hx + 9, hy - 18]; hF = [hx + 9, hy - 34]; wp = null; }
    else if (pose === "drum") { hN = U([12, -6]); hF = U([10, -4]); }
    else if (wk === "musket") {
      if (pose === "aim" || pose === "kneel") { wp = [U([2, -24]), U([60, -26])]; hN = U([13, -23.5]); hF = U([30, -25]); }
      else if (run) { wp = [U([-6, -8]), U([52, -20])]; hN = U([5, -10]); hF = U([26, -15]); }
      else if (pose === "march") { wp = [U([10, -7]), U([-14, -66])]; hN = U([9.5, -8]); hF = U([-4 + 5 * Math.sin(phase), -4]); }
      else { wp = [[hx + 10, -1], [hx + 11.5, -62]]; hN = [hx + 10.5, hy + 8]; hF = U([-2, -4]); }
    } else if (wk === "bow") {
      if (pose === "aim" || run) { wp = [U([22, -25])]; hN = U([21, -25]); hF = U([8, -26]); o2.drawn = true; }
      else { wp = [U([12, -12])]; hN = U([11, -12]); hF = U([-2, -4]); }
    } else if (wk === "sword" || wk === "axe") {
      if (pose === "aim" || run) { hN = U([14, -42]); wp = [hN, U([24, -72])]; hF = U([10, -18]); }
      else if (pose === "march") { hN = U([7, -16]); wp = [hN, U([-8, -50])]; hF = U([8, -16]); }
      else { hN = U([9, -6]); wp = [hN, U([12, -40])]; hF = U([9, -14]); }
      if (wk === "axe") wp = [wp[0], [wp[0][0] + (wp[1][0] - wp[0][0]) * 1.0, wp[0][1] + (wp[1][1] - wp[0][1]) * 1.0]];
    } else { // spears
      var len = wk === "pilum" ? 54 : wk === "yari" ? 92 : wk === "pike" ? 130 : 110;
      if (pose === "aim" || run) { hN = U([16, -26]); hF = U([2, -24]); var ang = run ? -0.1 : -0.05, sx = hN[0] - Math.cos(ang) * len * 0.35, sy = hN[1] - Math.sin(ang) * len * 0.35; wp = [[sx, sy], [sx + Math.cos(ang) * len, sy + Math.sin(ang) * len]]; }
      else if (pose === "march") { hN = U([9, -12]); hF = U([6, -14]); wp = [[hN[0] + 3, hN[1] + 14], [hN[0] - len * 0.35, hN[1] - len * 0.92]]; }
      else { hN = [hx + 11, hy + 2]; hF = U([6, -12]); wp = [[hx + 12, -1], [hx + 13, -1 - len]]; }
    }
    // draw order: far arm, far leg, (back banner), body, near leg, head, weapon, near arm, shield
    var elF = ik(shF, hF, 12.5, 12, -1);
    g.l([shF, elF, hF], shade(F.coat, -0.3), 4.8, { hi: false });
    drawLeg(LgF, true);
    if (F.back) { var bp = U([-4, -30]); g.l([bp, [bp[0] - 2, bp[1] - 34]], "#3A2A1A", 0.9, { hi: false }); g.f(P([[bp[0] - 2, bp[1] - 34], [bp[0] - 13, bp[1] - 33], [bp[0] - 12, bp[1] - 16], [bp[0] - 2, bp[1] - 17]], true), F.flag.field, { tex: false }); g.e(bp[0] - 7.5, bp[1] - 25.5, 2.6, 3.4, F.flag.c1, { tex: false, edge: false }); }
    if (F.cloak) g.f(P(UA([[-7, -26], [-3, -24], [-6, 2], [-15, 6]]), true), F.cloak);
    if (F.tails && !ancient) g.f(P(UA([[-6, -2], [-12, 13], [-6.5, 12.5], [-1.5, -1]]), true), shade(F.coat, -0.1));
    var torso = UA([[-7, 0], [7.5, 0], [8.6, -27], [-6.6, -28]]);
    g.f(PS(torso.concat([torso[0]]), true), F.armour && F.era !== "eastern" ? F.armour : F.coat);
    if (F.skirt) g.f(P(UA([[-7.8, -2], [8.4, -2], [9.6, 12], [-9, 12]]), true), F.armour && F.era === "ancient" ? F.coat : shade(F.coat, -0.08));
    if (F.armour && F.era === "ancient") { for (var bi = 0; bi < 3; bi++) g.l(UA([[-6.5, -8 - bi * 6], [8, -8 - bi * 6]]), shade(F.armour, -0.3), 0.8, { hi: false, a: 0.8 }); }
    if (F.era === "eastern" && F.armour) for (bi = 0; bi < 4; bi++) g.l(UA([[-6.5, -5 - bi * 5.5], [8.2, -5 - bi * 5.5]]), F.trim, 0.9, { hi: false, a: 0.9 });
    if (F.era === "gun") {
      g.l(UA([[-5, -26.5], [7.8, -3]]), F.belts, 1.8, { hi: false }); g.l(UA([[6.8, -26.5], [-6, -4]]), F.belts, 1.8, { hi: false });
      g.f(P(UA([[6.6, -27], [9, -27], [9, -22], [6.4, -22]]), true), F.trim, { tex: false });
      if (!F.skirt) g.l(UA([[-7, -1], [7.6, -1]]), F.belts, 1.4, { hi: false });
    } else g.l(UA([[-7.2, -1.5], [7.8, -1.5]]), F.belts, 1.6, { hi: false });
    if (pose === "drum") { var dc = U([11, 2]); g.e(dc[0], dc[1], 7, 8, F.trim); g.e(dc[0] + 3.5, dc[1], 3.5, 8, "#D8CCB0"); g.l([[dc[0] - 4, dc[1] - 8], [dc[0] - 4, dc[1] + 8]], "#C8A048", 0.7, { hi: false }); }
    drawLeg(LgN, false);
    g.l([neck, U([2.2, -31])], skin, 4.2, { hi: false });
    headShapes(g, F, head[0], head[1], skin, isOff ? F.officerHat || F.hat : F.hat, hair);
    if (wp && wkind !== "bow") weaponShapes(g, wkind === "pike" ? "pike" : wkind, wp[0], wp[1], o2);
    if (wkind === "bow" && wp) weaponShapes(g, "bow", wp[0], wp[0], o2);
    var elN = ik(sh, hN, 12.5, 12, run || pose === "aim" ? 1 : -1);
    g.l([sh, elN, hN], F.coat, 5.2);
    g.e(hN[0], hN[1], 2, 2, skin, { edge: false, tex: false });
    if (isOff || pose === "bearer") g.l(UA([[-6, -27], [8, -2]]), F.trim, 2.2, { hi: false });
    if (F.shield && pose !== "bearer" && pose !== "drum" && !isOff) { var sp = U(F.shield === "scutum" ? [8.5, -12] : [8, -15]); shieldShapes(g, F, sp[0], sp[1], F.shield); }
    return g;
  }
  // A horse (and optional rider). pose: gallop walk stand; phase: stride (radians). Hooves at y 0, faces +x.
  function horseShapes(colour, phase, rider, pose, v, o) {
    o = o || {};
    var g = FL(), c = colour || "#5E3A22", dk = shade(c, -0.35), mane = shade(c, -0.55);
    pose = pose || "stand"; phase = num(phase, 0);
    var gal = pose === "gallop", walk = pose === "walk", amp = gal ? 0.75 : walk ? 0.3 : 0;
    var bob = gal ? -5 * Math.abs(Math.sin(phase)) : walk ? -1.2 * Math.abs(Math.sin(phase)) : 0, pitch = gal ? 0.06 * Math.sin(phase) : 0;
    var by = bob;
    function B(p) { return rot([p[0], p[1] + by], 0, -70 + by, pitch); }
    function BA(pts) { return pts.map(B); }
    function hleg(root, a, b, far, hind) {
      var r0 = B(root), k = [r0[0] + 22 * Math.sin(a), r0[1] + 22 * Math.cos(a)], an = [k[0] + 24 * Math.sin(a + (hind ? b : -b)), k[1] + 24 * Math.cos(a + (hind ? b : -b))];
      if (!gal && !walk) an[1] = Math.max(an[1], -1);
      var col = far ? shade(c, -0.22) : c;
      g.l([r0, k], col, hind ? 9 : 7, { hi: !far });
      g.l([k, an], col, 4.4, { hi: !far });
      g.f(ellD(an[0] + 1, an[1] + 1, 3.2, 2.2), "#1A1410", { tex: false, edge: false });
    }
    var s1 = Math.sin(phase), s2 = Math.sin(phase + 0.6), s3 = Math.sin(phase + PI), s4 = Math.sin(phase + PI + 0.6);
    var fb = function (s) { return gal ? 0.9 * Math.max(0, -s) : walk ? 0.4 * Math.max(0, -s) : 0; };
    hleg([-26, -58], amp * s3, fb(s3) * 0.6, true, true);
    hleg([24, -56], amp * s1 * 0.9 + (gal ? 0.15 : 0), fb(s1), true, false);
    var tailSw = gal ? 0.3 * Math.sin(phase * 1) : 0.08;
    g.f("M" + B([-38, -70]).map(f1).join(" ") + "Q" + B([-58, -66 + 10 * tailSw]).map(f1).join(" ") + " " + B([-60 - 6 * tailSw, -30]).map(f1).join(" ") + "L" + B([-52, -34]).map(f1).join(" ") + "Q" + B([-50, -60]).map(f1).join(" ") + " " + B([-36, -64]).map(f1).join(" ") + "Z", mane);
    var body = BA([[-40, -66], [-38, -80], [-10, -82], [22, -80], [36, -70], [34, -54], [20, -48], [-26, -48], [-40, -56]]);
    g.f(PS(body.concat([body[0]]), true), c);
    var headUp = gal ? -4 : pose === "stand" ? 6 : 0;
    var neck = BA([[20, -80], [36, -60], [56, -88 + headUp], [48, -104 + headUp]]);
    g.f(PS(neck.concat([neck[0]]), true), c);
    var head = BA([[46, -104 + headUp], [53, -109 + headUp], [72, -90 + headUp], [70, -84 + headUp], [60, -85 + headUp], [51, -92 + headUp]]);
    g.f(P(head, true), c);
    g.f(P(BA([[47, -104 + headUp], [45, -113 + headUp], [51, -106 + headUp]]), true), dk, { tex: false });
    g.l(BA([[22, -81], [34, -90 + headUp * 0.5], [47, -104 + headUp]]), mane, 3.6, { hi: false });
    g.e(B([58, -98 + headUp])[0], B([58, -98 + headUp])[1], 0.9, 0.9, "#0E0A08", { edge: false, tex: false });
    hleg([-24, -60], amp * s4, fb(s4) * 0.6, false, true);
    hleg([28, -58], amp * s2 * 0.9 + (gal ? 0.15 : 0), fb(s2), false, false);
    if (rider) {
      var F = rider, skin = SKINS[(hstr(F.id) + (v | 0)) % SKINS.length];
      g.f(P(BA([[-14, -82], [14, -82], [16, -64], [-16, -64]]), true), F.coat, { tex: false });
      g.l(BA([[-14, -64], [16, -64]]), F.trim || "#C8963E", 1.6, { hi: false });
      var lean = gal ? 0.28 : 0.04, hip = B([0, -84]);
      function R(p) { return rot([hip[0] + p[0], hip[1] + p[1]], hip[0], hip[1], lean); }
      var knee = B([12, -72]), foot = B([9, -52]);
      g.l([hip, knee, foot], F.trousers || shade(F.coat, -0.2), 6.4);
      g.l([[lerp(knee[0], foot[0], 0.3), lerp(knee[1], foot[1], 0.3)], foot], F.boots || "#1C1612", 6, { hi: false });
      var torso = [R([-7, 0]), R([7.5, 0]), R([8.5, -27]), R([-6.5, -28])];
      g.f(P(torso, true), F.armour && F.era !== "eastern" ? F.armour : F.coat);
      if (F.era === "gun") g.l([R([-5, -26]), R([7.5, -3])], F.belts, 1.8, { hi: false });
      var hd = R([2.6, -35.5]);
      g.l([R([1.6, -28.5]), R([2.2, -31])], skin, 4.2, { hi: false });
      headShapes(g, F, hd[0], hd[1], skin, F.hat, HAIR[(v | 0) % 3]);
      var shp = R([1.5, -26]), hand, wpn;
      var weapon = o.weapon || (F.weapon === "bow" ? "bow" : F.era === "gun" ? "sabre" : F.weapon === "yari" || F.id === "knight" ? "lance" : "sword");
      if (weapon === "lance") { hand = R([10, -14]); var la = gal ? -0.04 : -1.25; wpn = [[hand[0] - Math.cos(la) * 40, hand[1] - Math.sin(la) * 40], [hand[0] + Math.cos(la) * 90, hand[1] + Math.sin(la) * 90]]; weaponShapes(g, "lance", wpn[0], wpn[1], { pennon: F.flag.field }); }
      else if (weapon === "bow") { hand = R([22, -24]); weaponShapes(g, "bow", hand, hand, { drawn: gal }); }
      else { hand = gal ? R([16, -44]) : R([12, -10]); wpn = gal ? [hand, R([34, -70])] : [hand, R([16, -2]).map(function (q, i) { return q + (i ? 30 : 4); })]; weaponShapes(g, "sabre", wpn[0], wpn[1]); }
      var el = ik(shp, hand, 12.5, 12, gal ? 1 : -1);
      g.l([shp, el, hand], F.coat, 5.2);
      g.e(hand[0], hand[1], 2, 2, skin, { edge: false, tex: false });
      if (F.shield === "kite" || F.shield === "round" || F.shield === "hoplon") { var sp2 = R([6, -12]); shieldShapes(g, F, sp2[0], sp2[1], F.shield === "hoplon" ? "round" : F.shield); }
    } else if (o.saddle) {
      g.f(P(BA([[-12, -82], [12, -82], [14, -66], [-14, -66]]), true), o.saddle, { tex: false });
    }
    return g;
  }
  // Field gun. Wheel at x 0, muzzle toward +x; recoil shifts the whole gun back.
  function cannonShapes(F, recoil) {
    var g = FL(), wood = "#5A3A22", metal = F && F.era === "gun" ? "#4A4A46" : "#8A6A3A", rc = -num(recoil, 0);
    g.l([[rc - 2, -12], [rc - 40, -1]], shade(wood, -0.2), 6);
    g.f(P([[rc - 8, -24], [rc + 36, -29], [rc + 37, -22], [rc - 7, -16]], true), metal);
    g.e(rc - 8, -20, 4.5, 4.5, metal);
    g.l([[rc + 34, -29.5], [rc + 34, -21]], shade(metal, 0.3), 1.5, { hi: false });
    g.e(rc, -12, 12.5, 12.5, wood);
    g.e(rc, -12, 9.5, 9.5, shade(wood, -0.35), { tex: false });
    for (var i = 0; i < 6; i++) { var a = (i / 6) * PI + 0.2; g.l([[rc + Math.cos(a) * 9.5, -12 + Math.sin(a) * 9.5], [rc - Math.cos(a) * 9.5, -12 - Math.sin(a) * 9.5]], wood, 1.4, { hi: false }); }
    g.e(rc, -12, 2.6, 2.6, "#2A1E14", { tex: false });
    return g;
  }

  // ------------------------- painting a figure list into a sprite -------------------------
  // Each fill: base colour, a brushed light gradient (light from the upper left), a few dabs of broken colour and a soft
  // dark contour; lines get a lit edge. Then the whole sprite gets a warm-light / umber-shadow glaze (source-atop).
  function paintList(ctx, g, ppu, box, seed) {
    var r = rng(seed || 3), lw = 1 / ppu;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    g.list.forEach(function (s) {
      ctx.globalAlpha = s.a == null ? 1 : s.a;
      if (s.t === "g") { var gr = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r); gr.addColorStop(0, rgba(s.c, s.a)); gr.addColorStop(1, rgba(s.c, 0)); ctx.fillStyle = gr; ctx.globalAlpha = 1; ctx.fillRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2); return; }
      var p = new Path2D(s.d);
      if (s.t === "l") {
        ctx.strokeStyle = s.c; ctx.lineWidth = s.w; ctx.stroke(p);
        if (s.hi && s.w > 1.2) { ctx.save(); ctx.translate(-s.w * 0.18, -s.w * 0.2); ctx.globalAlpha = 0.35; ctx.strokeStyle = shade(s.c, 0.3); ctx.lineWidth = s.w * 0.35; ctx.stroke(p); ctx.restore(); }
        return;
      }
      ctx.fillStyle = s.c; ctx.fill(p);
      if (s.tex) {
        ctx.save(); ctx.clip(p);
        for (var i = 0; i < 4; i++) {
          var x = box[0] + r() * (box[2] - box[0]), y = box[1] + r() * (box[3] - box[1]);
          ctx.globalAlpha = 0.18 + r() * 0.16; ctx.strokeStyle = shade(s.c, r() < 0.5 ? 0.22 : -0.22); ctx.lineWidth = 1.6 + r() * 2.4;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 4 + r() * 6, y + (r() - 0.5) * 3); ctx.stroke();
        }
        ctx.restore();
      }
      if (s.edge) { ctx.globalAlpha = 0.42; ctx.strokeStyle = shade(s.c, -0.45); ctx.lineWidth = Math.max(0.55, lw * 1.1); ctx.stroke(p); }
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-atop";
    var lg = ctx.createLinearGradient(box[0], box[1], box[2] * 0.6 + box[0] * 0.4, box[3]);
    lg.addColorStop(0, "rgba(255,232,186,0.26)"); lg.addColorStop(0.5, "rgba(255,232,186,0)"); lg.addColorStop(1, "rgba(24,12,4,0.3)");
    ctx.fillStyle = lg; ctx.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
    ctx.globalCompositeOperation = "source-over";
  }
  var SPR = {};
  function ppuFor(worldUnit) { return clamp(Math.pow(2, Math.round(Math.log2(Math.max(0.05, worldUnit * 1.6)) * 2) / 2), 0.35, 8); }
  function sprite(key, box, ppu, build, o) {
    var k = key + "@" + ppu;
    if (SPR[k]) return SPR[k];
    o = o || {};
    var pad = 3, c = mkCanvas((box[2] - box[0]) * ppu + pad * 2, (box[3] - box[1]) * ppu + pad * 2), ctx = c.getContext("2d");
    ctx.setTransform(ppu, 0, 0, ppu, -box[0] * ppu + pad, -box[1] * ppu + pad);
    var g = build();
    paintList(ctx, g, ppu, box, hstr(key));
    if (o.oil) oilInside(c, { sizes: o.oil, k: ppu, seed: hstr(key) + 5, flow: 0.5, len: [0.8, 1.7], impasto: 0.45, bristle: 0.2, alpha: 0.5, minAlpha: 200, jitter: 20, broken: 12, detail: 1e9, keep: 0 });
    var sp = { c: c, ox: -box[0] * ppu + pad, oy: -box[1] * ppu + pad, ppu: ppu };
    SPR[k] = sp;
    return sp;
  }
  var WALK_N = 8;
  function soldierSprite(F, pose, ph, v, ppu) {
    var key = "s|" + F.id + (F.variant || "") + "|" + pose + "|" + ph + "|" + v;
    return sprite(key, [-30, -112, 78, 6], ppu, function () { return soldierShapes(F, pose, (ph / WALK_N) * TAU, v); });
  }
  function horseSprite(F, colour, pose, ph, v, ppu, o) {
    o = o || {};
    var key = "h|" + (F ? F.id + (F.variant || "") : "-") + "|" + colour + "|" + pose + "|" + ph + "|" + v + "|" + (o.weapon || "") + (o.saddle || "");
    return sprite(key, [-72, -150, 140, 8], ppu, function () { return horseShapes(colour, (ph / WALK_N) * TAU, F, pose, v, o); });
  }
  // Markup exports (flat svg of the same geometry, for custom drawings).
  function listMarkup(g) {
    return g.list.map(function (s) {
      if (s.t === "g") return '<circle cx="' + f1(s.x) + '" cy="' + f1(s.y) + '" r="' + f1(s.r * 0.5) + '" fill="' + s.c + '" fill-opacity="' + f2(s.a * 0.5) + '"/>';
      if (s.t === "l") return '<path d="' + s.d + '" fill="none" stroke="' + s.c + '" stroke-width="' + f2(s.w) + '" stroke-linecap="round" stroke-linejoin="round"' + (s.a != null ? ' stroke-opacity="' + f2(s.a) + '"' : "") + "/>";
      return '<path d="' + s.d + '" fill="' + s.c + '"' + (s.edge ? ' stroke="' + shade(s.c, -0.45) + '" stroke-width="0.6" stroke-opacity="0.45"' : "") + (s.a != null ? ' fill-opacity="' + f2(s.a) + '"' : "") + "/>";
    }).join("");
  }

  // ------------------------- smoke, haze, fire, weather -------------------------
  var PUFFS = {};
  function puffSprite(i, colour) {
    var key = (i % 4) + colour;
    if (PUFFS[key]) return PUFFS[key];
    var n = 160, c = mkCanvas(n, n), ctx = c.getContext("2d"), r = rng(400 + (i % 4) * 7 + hstr(colour)), lit = shade(colour, 0.22), dk = shade(colour, -0.3);
    for (var k = 0; k < 8; k++) { var a = r() * TAU, d = r() * n * 0.14, rr2 = n * (0.12 + r() * 0.08); ctx.globalAlpha = 0.75; ctx.fillStyle = dk; ctx.beginPath(); ctx.arc(n / 2 + Math.cos(a) * d + n * 0.03, n / 2 + Math.sin(a) * d + n * 0.06, rr2, 0, TAU); ctx.fill(); }
    for (k = 0; k < 10; k++) { a = r() * TAU; d = r() * n * 0.13; rr2 = n * (0.09 + r() * 0.08); ctx.globalAlpha = 0.85; ctx.fillStyle = k % 3 ? colour : lit; ctx.beginPath(); ctx.arc(n / 2 + Math.cos(a) * d - n * 0.03, n / 2 + Math.sin(a) * d - n * 0.04, rr2, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    oilPass(c, { sizes: [n * 0.05, n * 0.025], k: 1, seed: 410 + (i % 4), flow: 1.4, fscale: n * 0.4, len: [1, 2.2], alpha: 0.7, minAlpha: 40, jitter: 22, broken: 10, impasto: 0.4, detail: 10, keep: 0.4 });
    ctx.globalCompositeOperation = "destination-in";
    var m = ctx.createRadialGradient(n / 2, n / 2, n * 0.2, n / 2, n / 2, n * 0.5);
    m.addColorStop(0, "rgba(0,0,0,1)"); m.addColorStop(0.75, "rgba(0,0,0,0.85)"); m.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = m; ctx.fillRect(0, 0, n, n);
    var sp = { c: c, ox: n / 2, oy: n / 2, ppu: n / 100 };
    PUFFS[key] = sp;
    return sp;
  }
  // Particle smoke. Burst: n puffs at `at`. Continuous: a puff every life / n seconds from `at` (a column).
  function smoke(o) {
    o = obj(o);
    var w = ensure(), layer = o.layer || "ground", x = num(o.x, w.ww / 2), y = num(o.y, w.hz + H * 0.2), n = Math.max(1, Math.round(num(o.n, o.burst ? 6 : 8)));
    var size = num(o.size, u(60)), life = Math.max(0.3, num(o.life, o.burst ? 3.2 : 5)), at = num(o.at, 0), dir = arr(o.dir), dx = num(dir[0], o.burst ? 1 : 0.12), dy = num(dir[1], o.burst ? -0.15 : -1);
    var wind = num(o.wind, u(14)), col = o.color || (o.dark ? "#5A5048" : "#E6E0D2"), op = num(o.opacity, o.dark ? 0.7 : 0.8), r = rng(num(o.seed, hstr("sm" + x + y + at)));
    var speed = num(o.speed, o.burst ? size * 1.1 : size * 0.45), parts = [], until = o.until == null ? D + 0.1 : num(o.until, D);
    function add(t0) {
      var sp = speed * (0.6 + r() * 0.6), a = Math.atan2(dy, dx) + (r() - 0.5) * (o.burst ? 0.9 : 0.35);
      parts.push({ t0: t0, x: x + (r() - 0.5) * size * 0.3, y: y + (r() - 0.5) * size * 0.2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r0: size * (0.25 + r() * 0.2), r1: size * (1 + r() * 0.9), life: life * (0.75 + r() * 0.5), v: Math.floor(r() * 4), rot: r() * TAU, sp: (r() - 0.5) * 0.3, a: op * (0.7 + r() * 0.3) });
    }
    if (o.burst) for (var i = 0; i < n; i++) add(at + r() * 0.12);
    else { var step = life / n; for (var t0 = at - (o.prewarm !== false ? life : 0); t0 < until; t0 += step * (0.8 + r() * 0.4)) add(t0); }
    var item = {
      parts: parts, z: o.z != null ? num(o.z, y) : y + (o.front ? 1e5 : 0.5),
      collect: function (t, list) {
        for (var i = 0; i < parts.length; i++) {
          var p = parts[i], dt = t - p.t0;
          if (dt < 0 || dt > p.life) continue;
          var q = dt / p.life, dec = o.burst ? 1 - Math.exp(-dt * 1.6) : dt, drag = o.burst ? dec / 1.6 : dt;
          var px = p.x + p.vx * drag + wind * dt, py = p.y + p.vy * drag - (o.burst ? size * 0.12 * dt : 0);
          var rad = lerp(p.r0, p.r1, outC(q)), al = p.a * (q < 0.06 ? q / 0.06 : Math.pow(1 - q, 1.3));
          list.push({ z: item.z, sp: puffSprite(p.v, col), x: px, y: py, s: rad / 50, a: al, rot: p.rot + p.sp * dt });
        }
      },
    };
    addItem(layer, item);
    return item;
  }
  var HAZE_C = null;
  function hazeBand(colour) {
    var key = colour;
    if (HAZE_C && HAZE_C[key]) return HAZE_C[key];
    HAZE_C = HAZE_C || {};
    var w = 1024, h = 128, c = mkCanvas(w, h), ctx = c.getContext("2d"), r = rng(hstr(colour) + 9);
    for (var i = 0; i < 70; i++) blob(ctx, r() * w, h * (0.35 + r() * 0.3), u(60) + r() * 160, 18 + r() * 26, i % 3 ? colour : shade(colour, 0.2), 0.22);
    ctx.lineCap = "round";
    for (i = 0; i < 60; i++) { var x = r() * w, y = h * (0.3 + r() * 0.4); ctx.globalAlpha = 0.08; ctx.strokeStyle = shade(colour, 0.25); ctx.lineWidth = 6 + r() * 10; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 60 + r() * 140, y + (r() - 0.5) * 6); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "destination-in";
    var g = ctx.createLinearGradient(0, 0, w, 0); g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.15, "rgba(0,0,0,1)"); g.addColorStop(0.85, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    HAZE_C[key] = c;
    return c;
  }
  function haze(o) {
    o = obj(o);
    var w = ensure(), n = Math.max(1, Math.round(num(o.n, 4))), op = num(o.opacity, 0.25), y0 = num(o.y, w.hz + H * 0.08), spr = num(o.spread, H * 0.16), r = rng(num(o.seed, 77));
    var col = o.color || mixC(w.pal.haze, "#F2E6CC", 0.35), bands = [];
    for (var i = 0; i < n; i++) bands.push({ y: y0 + (n > 1 ? (i / (n - 1) - 0.5) * spr * 2 : 0), x: -w.ww * (0.2 + r() * 0.3), w: w.ww * (1.2 + r() * 0.6), h: u(70 + r() * 80), v: u(6 + r() * 12) * (r() < 0.5 ? 1 : -1), a: op * (0.6 + r() * 0.5), layer: i % 2 ? "mid" : "ground" });
    bands.forEach(function (b) {
      addItem(b.layer, { collect: function (t, list) { list.push({ z: b.layer === "mid" ? 1e6 : b.y + H * 0.2, fn: function (ctx) { ctx.globalAlpha = clamp(b.a, 0, 1); ctx.drawImage(hazeBand(col), b.x + b.v * t, b.y - b.h / 2, b.w, b.h); } }); } });
    });
    return { bands: bands };
  }
  function fire(o) {
    o = obj(o);
    var x = num(o.x, 0), y = num(o.y, 0), size = num(o.size, u(60)), at = num(o.at, 0), layer = o.layer || "ground", seed = hstr("fire" + x + y);
    var item = {
      collect: function (t, list) {
        if (t < at) return;
        var grow = soft(prog(t, at, 0.8));
        list.push({ z: num(o.z, y + 0.2), fn: function (ctx) {
          if (o.glow !== false) { var gr = ctx.createRadialGradient(x, y - size * 0.4, 0, x, y - size * 0.4, size * 2.2); gr.addColorStop(0, "rgba(255,170,70," + f2(0.45 * grow) + ")"); gr.addColorStop(1, "rgba(255,120,40,0)"); ctx.fillStyle = gr; ctx.fillRect(x - size * 2.2, y - size * 2.6, size * 4.4, size * 4.4); }
          for (var i = 0; i < 6; i++) {
            var fx = x + (i / 5 - 0.5) * size * 0.9, fh = size * grow * (0.6 + 0.5 * (0.5 + 0.5 * noise1(t * 3.1 + i * 1.7, seed + i))) * (1 - Math.abs(i / 5 - 0.5) * 0.9), sw = noise1(t * 2.3 + i, seed + 30 + i) * size * 0.12;
            var g2 = ctx.createLinearGradient(0, y, 0, y - fh);
            g2.addColorStop(0, "rgba(255,230,140,0.95)"); g2.addColorStop(0.45, "rgba(250,140,40,0.85)"); g2.addColorStop(1, "rgba(180,40,20,0)");
            ctx.fillStyle = g2;
            ctx.beginPath(); ctx.moveTo(fx - size * 0.14, y); ctx.quadraticCurveTo(fx - size * 0.16 + sw, y - fh * 0.5, fx + sw * 1.5, y - fh); ctx.quadraticCurveTo(fx + size * 0.16 + sw, y - fh * 0.5, fx + size * 0.14, y); ctx.fill();
          }
        } });
      },
    };
    addItem(layer, item);
    if (o.smoke !== false) smoke({ layer: layer, x: x, y: y - size * 0.8, size: size * 1.2, at: at, dark: true, life: 5, n: 9, z: num(o.z, y + 0.2) + 0.1, wind: u(18), prewarm: at <= 0.05 });
    return item;
  }
  function weather(kind, o) {
    o = obj(o);
    var w = ensure(), k = str(kind).toLowerCase(), r = rng(hstr("wx" + k));
    if (k !== "snow" && k !== "rain" && k !== "ash") return;
    var n = Math.round(num(o.n, k === "rain" ? 240 : k === "snow" ? 170 : 90)), ps = [];
    for (var i = 0; i < n; i++) ps.push({ x: r(), y: r(), s: 0.5 + r(), v: 0.6 + r() * 0.6, ph: r() * TAU });
    w.fxItems.push(function (ctx, t) {
      ps.forEach(function (p) {
        if (k === "rain") {
          var yy = ((p.y + t * 1.3 * p.v) % 1) * (H + 60) - 30, xx = ((p.x + t * 0.25 * p.v) % 1) * (W + 60) - 30;
          ctx.globalAlpha = 0.22 * p.s; ctx.strokeStyle = "#D8DCE0"; ctx.lineWidth = u(1.2 * p.s);
          ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx - u(8), yy - u(34) * p.s); ctx.stroke();
        } else {
          var sp = k === "snow" ? 0.09 : 0.05, yy2 = ((p.y + t * sp * p.v) % 1) * (H + 40) - 20, xx2 = ((p.x + Math.sin(t * 0.7 + p.ph) * 0.012 + t * 0.012) % 1 + 1) % 1 * W;
          ctx.globalAlpha = (k === "snow" ? 0.75 : 0.5) * (0.5 + p.s * 0.5); ctx.fillStyle = k === "snow" ? "#F6F4EE" : "#6A625A";
          ctx.beginPath(); ctx.arc(xx2, yy2, u(k === "snow" ? 2.2 : 1.6) * p.s, 0, TAU); ctx.fill();
        }
      });
    });
  }

  // ------------------------- flags -------------------------
  // Cloth texture: field, invented emblem, fringe, a light oil pass. Three tones (base, dark, light) for the wave shading.
  var FLAGTEX = {};
  function flagTexture(spec, wpx, hpx) {
    var shape = spec.shape || "rect", key = [spec.field, spec.pattern, spec.c1, spec.c2, shape, Math.round(wpx), Math.round(hpx)].join("|");
    if (FLAGTEX[key]) return FLAGTEX[key];
    var c = mkCanvas(wpx, hpx), ctx = c.getContext("2d"), w = c.width, h = c.height, c1 = spec.c1 || "#C8963E", c2 = spec.c2 || "#E8DCC0";
    ctx.save();
    var clipP = new Path2D();
    if (shape === "swallow") { clipP.moveTo(0, 0); clipP.lineTo(w, 0); clipP.lineTo(w * 0.72, h / 2); clipP.lineTo(w, h); clipP.lineTo(0, h); clipP.closePath(); }
    else if (shape === "pennant") { clipP.moveTo(0, 0); clipP.lineTo(w, h * 0.42); clipP.lineTo(w, h * 0.58); clipP.lineTo(0, h); clipP.closePath(); }
    else clipP.rect(0, 0, w, h);
    ctx.clip(clipP);
    ctx.fillStyle = spec.field || "#8E2A2A"; ctx.fillRect(0, 0, w, h);
    var cx = shape === "pennant" ? w * 0.32 : w * 0.5, cy = h * 0.5, R = Math.min(w, h) * 0.3;
    ctx.fillStyle = c1; ctx.strokeStyle = c1; ctx.lineWidth = Math.max(2, h * 0.07);
    switch (spec.pattern) {
      case "chevron": ctx.beginPath(); ctx.moveTo(0, h * 0.1); ctx.lineTo(w * 0.55, h * 0.5); ctx.lineTo(0, h * 0.9); ctx.lineTo(0, h * 0.7); ctx.lineTo(w * 0.32, h * 0.5); ctx.lineTo(0, h * 0.3); ctx.fill(); ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(w * 0.7, cy, R * 0.55, 0, TAU); ctx.fill(); break;
      case "wreath": ctx.lineWidth = Math.max(2, h * 0.06); for (var i = 0; i < 14; i++) { var a = PI * 0.6 + (i / 13) * PI * 1.8; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * R, cy + Math.sin(a) * R, R * 0.2, R * 0.09, a + PI / 2, 0, TAU); ctx.fill(); } ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(cx, cy, R * 0.35, 0, TAU); ctx.fill(); break;
      case "lozenge": ctx.beginPath(); ctx.moveTo(cx, cy - R * 1.2); ctx.lineTo(cx + R * 0.85, cy); ctx.lineTo(cx, cy + R * 1.2); ctx.lineTo(cx - R * 0.85, cy); ctx.fill(); ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(cx, cy, R * 0.3, 0, TAU); ctx.fill(); break;
      case "sun": ctx.beginPath(); for (i = 0; i < 24; i++) { var aa = (i / 24) * TAU, rr2 = i % 2 ? R * 0.62 : R * 1.05; ctx.lineTo(cx + Math.cos(aa) * rr2, cy + Math.sin(aa) * rr2); } ctx.fill(); ctx.fillStyle = spec.field; ctx.beginPath(); ctx.arc(cx, cy, R * 0.36, 0, TAU); ctx.fill(); break;
      case "roundel": ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill(); ctx.fillStyle = spec.field; ctx.beginPath(); ctx.arc(cx, cy, R * 0.62, 0, TAU); ctx.fill(); ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(cx, cy, R * 0.3, 0, TAU); ctx.fill(); break;
      case "ring": ctx.lineWidth = R * 0.32; ctx.beginPath(); ctx.arc(cx, cy, R * 0.8, 0, TAU); ctx.stroke(); ctx.fillRect(cx - R * 0.12, cy - R * 0.8, R * 0.24, R * 1.6); break;
      case "band": ctx.beginPath(); ctx.moveTo(0, h * 0.62); ctx.lineTo(w * 0.62, 0); ctx.lineTo(w * 0.88, 0); ctx.lineTo(w * 0.26, h); ctx.lineTo(0, h); ctx.fill(); ctx.fillStyle = c2; ctx.fillRect(0, 0, w, h * 0.06); ctx.fillRect(0, h * 0.94, w, h * 0.06); break;
      case "tower": ctx.fillRect(cx - R * 0.5, cy - R * 0.5, R, R * 1.3); for (i = 0; i < 3; i++) ctx.fillRect(cx - R * 0.5 + i * R * 0.4, cy - R * 0.8, R * 0.22, R * 0.35); ctx.fillStyle = spec.field; ctx.fillRect(cx - R * 0.12, cy + R * 0.25, R * 0.24, R * 0.55); break;
      case "rosette": for (i = 0; i < 8; i++) { var ab = (i / 8) * TAU; ctx.beginPath(); ctx.ellipse(cx + Math.cos(ab) * R * 0.55, cy + Math.sin(ab) * R * 0.55, R * 0.4, R * 0.18, ab, 0, TAU); ctx.fill(); } ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(cx, cy, R * 0.28, 0, TAU); ctx.fill(); break;
      default: break;
    }
    if (shape === "rect" || shape === "vexillum" || shape === "nobori") { ctx.strokeStyle = c2 === spec.field ? c1 : "#C8963E"; ctx.lineWidth = Math.max(2, h * 0.05); ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth); }
    ctx.restore();
    oilInside(c, { sizes: [Math.max(1.5, h * 0.06)], k: 1, seed: hstr(key), flow: 0.6, impasto: 0.4, alpha: 0.55, minAlpha: 150, jitter: 14 });
    function tone(k) { var t = mkCanvas(w, h), tx = t.getContext("2d"); tx.drawImage(c, 0, 0); tx.globalCompositeOperation = "source-atop"; tx.fillStyle = k < 0 ? "rgba(20,10,4,0.75)" : "rgba(255,240,210,0.6)"; tx.fillRect(0, 0, w, h); return t; }
    var out = { c: c, dk: tone(-1), lt: tone(1), w: w, h: h };
    FLAGTEX[key] = out;
    return out;
  }
  function flag(o) {
    o = obj(o);
    var w = ensure(), F = factionOf(o.faction, "redcoat", o.variant), spec = Object.assign({}, F.flag, obj(o.flag));
    var x = num(o.x, w.ww / 2), y = num(o.y, groundY(0.5)), h = num(o.h, u(160)), fw = num(o.w, h * 0.5), shape = spec.shape || "rect";
    var vertical = shape === "vexillum" || shape === "nobori", fh = vertical ? fw * (shape === "nobori" ? 2.4 : 1.1) : fw * (shape === "pennant" ? 0.6 : 0.66);
    var side = o.side != null ? (num(o.side, -1) < 0 ? -1 : 1) : -(num(o.facing, 1) < 0 ? -1 : 1), speed = num(o.speed, 1), amp = num(o.amp, 1), ph = hstr("fl" + x + y) % 100 / 15;
    var parent = o.parent, layer = o.layer || "ground", fallAt = null, falls = { at: null };
    var res = ppuFor(Math.max(1, fw / 100) * 100 / Math.max(1, fw)) ;
    var tex = flagTexture(spec, Math.max(24, Math.round(fw * 1.6)), Math.max(16, Math.round(fh * 1.6)));
    var api = {
      x: x, y: y, h: h, w: fw, spec: spec,
      rect: { x: x - fw, y: y - h, w: fw * 2, h: h },
      fall: function (at) { falls.at = num(at, 0); return api; },
      collect: function (t, list) {
        var off = parent && parent.at ? parent.at(t) : null, ox = off ? num(off.x, 0) : 0, oy = off ? num(off.y, 0) : 0, sc = off && off.s ? off.s : 1;
        if (off && off.hide) return;
        var bx = x + ox, by = y + oy, H2 = h * sc, FW = fw * sc, FH = fh * sc;
        var tilt = num(o.tilt, 0) + (off && off.tilt ? off.tilt : 0);
        if (o.fallen) tilt = (side < 0 ? 1 : -1) * 1.38;
        if (falls.at != null && t > falls.at) tilt += (side < 0 ? 1 : -1) * 1.38 * inQ(prog(t, falls.at, 0.9));
        list.push({ z: by + (o.z || 0.3), fn: function (ctx) {
          ctx.translate(bx, by); ctx.rotate(tilt);
          ctx.lineCap = "round";
          ctx.strokeStyle = "#3A2614"; ctx.lineWidth = Math.max(1, H2 * 0.016);
          ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -H2); ctx.stroke();
          ctx.strokeStyle = "#7A5A38"; ctx.lineWidth = Math.max(0.5, H2 * 0.005); ctx.beginPath(); ctx.moveTo(-H2 * 0.004, -H2 * 0.05); ctx.lineTo(-H2 * 0.004, -H2); ctx.stroke();
          ctx.fillStyle = "#D8B060"; ctx.beginPath(); ctx.moveTo(-H2 * 0.012, -H2); ctx.lineTo(0, -H2 - H2 * 0.05); ctx.lineTo(H2 * 0.012, -H2); ctx.fill();
          var still = o.fallen || (falls.at != null && t > falls.at + 0.6), N = 16, i, wv = still ? 0.15 : amp;
          if (!vertical) {
            for (i = 0; i < N; i++) {
              var u0 = i / N, u1 = (i + 1) / N, sx = Math.floor(u0 * tex.w), sw = Math.max(1, Math.ceil((u1 - u0) * tex.w) + 1);
              var wave = Math.sin(TAU * (u0 * 1.25 - t * speed * 0.9) + ph), dwav = Math.cos(TAU * (u0 * 1.25 - t * speed * 0.9) + ph);
              var dy = wv * FH * 0.16 * wave * Math.pow(u0, 0.8) + FH * 0.1 * u0 * (still ? 3 : 1);
              var dx = side * u0 * FW, dw = side * (u1 - u0) * FW * 1.04, top = -H2 * 0.98 + dy;
              ctx.save(); ctx.translate(dx, 0); ctx.scale(side, 1);
              ctx.drawImage(tex.c, sx, 0, sw, tex.h, 0, top, Math.abs(dw), FH);
              var sh = dwav * wv * Math.pow(u0, 0.5);
              if (sh > 0.05) { ctx.globalAlpha = clamp(sh * 0.45, 0, 0.5); ctx.drawImage(tex.dk, sx, 0, sw, tex.h, 0, top, Math.abs(dw), FH); }
              else if (sh < -0.05) { ctx.globalAlpha = clamp(-sh * 0.4, 0, 0.45); ctx.drawImage(tex.lt, sx, 0, sw, tex.h, 0, top, Math.abs(dw), FH); }
              ctx.restore();
            }
          } else {
            ctx.strokeStyle = "#3A2614"; ctx.lineWidth = Math.max(1, H2 * 0.012);
            if (shape === "vexillum") { ctx.beginPath(); ctx.moveTo(-FW * 0.6, -H2 * 0.92); ctx.lineTo(FW * 0.6, -H2 * 0.92); ctx.stroke(); }
            var x0 = shape === "vexillum" ? -FW / 2 : 0, top0 = shape === "vexillum" ? -H2 * 0.92 : -H2 * 0.96;
            for (i = 0; i < N; i++) {
              var v0 = i / N, v1 = (i + 1) / N, sy = Math.floor(v0 * tex.h), shh = Math.max(1, Math.ceil((v1 - v0) * tex.h) + 1);
              var sway = Math.sin(TAU * (v0 * 0.8 - t * speed * 0.6) + ph) * wv * FW * 0.06 * v0, swd = Math.cos(TAU * (v0 * 0.8 - t * speed * 0.6) + ph);
              var yy = top0 + v0 * FH, xx = x0 + sway + (shape === "nobori" ? (side < 0 ? -FW : 0) : 0);
              ctx.globalAlpha = 1;
              ctx.drawImage(tex.c, 0, sy, tex.w, shh, xx, yy, FW, (v1 - v0) * FH * 1.04);
              if (swd * wv > 0.1) { ctx.globalAlpha = clamp(swd * 0.3 * wv, 0, 0.35); ctx.drawImage(tex.dk, 0, sy, tex.w, shh, xx, yy, FW, (v1 - v0) * FH * 1.04); }
            }
            if (shape === "nobori") { ctx.globalAlpha = 1; ctx.beginPath(); ctx.moveTo(0, top0); ctx.lineTo(side < 0 ? -FW : FW, top0); ctx.stroke(); }
          }
        } });
      },
    };
    void res;
    addItem(layer, api);
    return api;
  }

  // ------------------------- armies -------------------------
  function army(o) {
    o = obj(o);
    var w = ensure(), F = factionOf(o.faction || o.preset || "redcoat", "redcoat", o.variant);
    var cav = o.cavalry === true || o.cavalry === "yes" || o.cavalry === 1, facing = num(o.facing, 1) < 0 ? -1 : 1, layer = o.layer || "ground";
    var size = Math.max(4, num(o.size, Math.min(W, H) * 0.08));
    var count = clamp(Math.round(num(o.count, cav ? 18 : 60)), 1, 220), ranks = clamp(Math.round(num(o.ranks, cav ? 2 : 3)), 1, 10), files = Math.ceil(count / ranks);
    var spacing = num(o.spacing, size * (cav ? 0.6 : 0.3)), x = num(o.x, w.ww / 2), y = num(o.y, groundY(0.55));
    var rankGap = num(o.rankGap, size * (cav ? 0.18 : 0.105)), r = rng(num(o.seed, hstr(F.id + "|" + Math.round(x) + "|" + Math.round(y))));
    var usePersp = o.persp !== false, p0 = persp(y), unit0 = size / 100;
    var men = [], k, i;
    for (k = 0; k < ranks; k++) for (i = 0; i < files; i++) {
      if (men.length >= count) break;
      men.push({ dx: (i - (files - 1) / 2) * spacing + (k % 2) * spacing * 0.5 + (r() - 0.5) * spacing * (cav ? 0.5 : 0.22), dy: -k * rankGap + (r() - 0.5) * rankGap * 0.35, k: k, i: i, v: r() < 0.5 ? 0 : 1, ph: r(), hv: 0.95 + r() * 0.09, lag: r(), fire: r(), hc: cav ? (["#5E3A22", "#7A4A26", "#2A2220", "#8A6A44", "#A8A49C"][Math.floor(r() * 5)]) : null });
    }
    var hW = (files - 1) * spacing / 2 + spacing * 0.5;
    // flag bearers (middle rank), officer and drummer in front
    var nFlags = o.flags != null ? Math.max(0, Math.round(num(o.flags, 1))) : count >= 16 ? 1 : 0;
    var bearerRank = Math.min(ranks - 1, 1), bearers = [];
    for (var fi = 0; fi < nFlags; fi++) {
      var target = (fi + 1) / (nFlags + 1), best = null, bd = 1e9;
      men.forEach(function (m) { if (m.k !== bearerRank || m.bearer) return; var d = Math.abs((m.dx + hW) / (2 * hW) - target); if (d < bd) { bd = d; best = m; } });
      if (best) { best.bearer = true; bearers.push(best); }
    }
    var extras = [];
    if (o.officer !== false && count >= 10 && !cav) extras.push({ dx: -facing * hW * 0.55, dy: size * 0.1, k: -1, v: 1, ph: 0.2, hv: 1.02, lag: 0.3, fire: 0, officer: true });
    if (o.drummer && !cav) extras.push({ dx: -facing * hW * 0.45, dy: size * 0.09, k: -1, v: 0, ph: 0.5, hv: 0.92, lag: 0.2, fire: 0, drummer: true });
    var all = men.concat(extras);
    var segs = [], poses = [], volleys = [];
    var A = {
      faction: F, F: F, x: x, y: y, size: size, facing: facing, count: count, ranks: ranks, files: files, cavalry: cav, layer: layer,
      w: hW * 2, h: size * (cav ? 1.45 : 1.1) + ranks * rankGap, flags: [],
      march: function (at, dur, dx, dy) { segs.push({ kind: "march", at: num(at, 0), dur: Math.max(0.1, num(dur, 2)), dx: num(dx, facing * size), dy: num(dy, 0) }); return A; },
      charge: function (at, dur, dist, dy) { segs.push({ kind: "charge", at: num(at, 0), dur: Math.max(0.2, num(dur, 1.6)), dx: facing * num(dist, size * 3), dy: num(dy, 0) }); return A; },
      volley: function (at) { volleys.push(num(at, 0)); return A; },
      setPose: function (pose, from, to) { poses.push({ pose: str(pose), from: num(from, 0), to: to == null ? 1e9 : num(to, 1e9) }); return A; },
      hold: function (at, dur) { segs.push({ kind: "hold", at: num(at, 0), dur: num(dur, 1), dx: 0, dy: 0 }); return A; },
      at: function (t) { return offAt(t, 0.5); },
      front: function (t) { var p = offAt(t, 0.5); return { x: x + p.x + facing * hW, y: y + p.y }; },
      bbox: function (t) { var p = offAt(t, 0.5), s = scaleAt(y + p.y); return { x: x + p.x - hW, y: y + p.y - A.h * s, w: hW * 2, h: A.h * s }; },
    };
    A.rect = { x: x - hW - size * 0.3, y: y - A.h, w: hW * 2 + size * 0.6, h: A.h };
    function scaleAt(yy) { return usePersp ? persp(yy) / p0 : 1; }
    function ease(kind, p) { return kind === "charge" ? (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2) : soft(p); }
    function offAt(t, lag) {
      var ox = 0, oy = 0;
      for (var j = 0; j < segs.length; j++) {
        var s = segs[j];
        if (t <= s.at) continue;
        var d = s.kind === "charge" ? s.dur * 0.18 * lag : s.dur * 0.04 * lag, p = clamp((t - s.at - d) / (s.dur - d * 0.5), 0, 1), e = ease(s.kind, p);
        ox += s.dx * e; oy += s.dy * e;
      }
      return { x: ox, y: oy };
    }
    function activeSeg(t) { var a = null; for (var j = 0; j < segs.length; j++) { var s = segs[j]; if (t >= s.at && t < s.at + s.dur && s.kind !== "hold") a = s; } return a; }
    function poseAt(m, t) {
      var p = o.pose || "stand", sg = activeSeg(t);
      if (sg) p = sg.kind === "charge" ? "charge" : "march";
      if (!sg && !cav) for (var j = 0; j < volleys.length; j++) { var va = volleys[j]; if (m.k >= 0 && m.k <= 1 && t >= va - 0.5 - m.fire * 0.1 && t < va + 0.95 + m.fire * 0.35) p = F.weapon === "musket" || F.weapon === "bow" ? (m.k === 0 && F.weapon === "musket" && ranks >= 3 && o.kneel !== false ? "kneel" : "aim") : "aim"; }
      for (j = 0; j < poses.length; j++) if (t >= poses[j].from && t < poses[j].to) p = poses[j].pose;
      return p;
    }
    var muzzles = [];
    // Precompute volley shots (who fires when) for flashes and smoke
    function shots() {
      if (A._shots) return A._shots;
      var out = [];
      volleys.forEach(function (va) {
        all.forEach(function (m) { if (m.k < 0 || m.k > 1 || m.bearer || cav) return; out.push({ m: m, t: va + m.fire * 0.4 + (facing > 0 ? (m.dx + hW) / (2 * hW) : 1 - (m.dx + hW) / (2 * hW)) * 0.25 }); });
      });
      A._shots = out;
      return out;
    }
    var flashC = null;
    var item = {
      collect: function (t, list) {
        for (var j = 0; j < all.length; j++) {
          var m = all[j], off = offAt(t, m.lag), yy = y + m.dy + off.y, sc = scaleAt(yy) * unit0 * m.hv, xx = x + m.dx * scaleAt(yy) + off.x, pose = poseAt(m, t), sg = activeSeg(t);
          var ph = 0;
          if (sg) { var cad = sg.kind === "charge" ? (cav ? 2.3 : 1.7) : (cav ? 1.1 : 0.95); ph = Math.floor(((t - sg.at) * cad + m.ph * (sg.kind === "charge" ? 1 : 0.12)) * WALK_N) % WALK_N; }
          var ppu = ppuFor(sc * (w.camNow ? w.camNow.z * w.F : 1));
          var sp;
          if (cav) sp = horseSprite(F, m.hc, sg ? (sg.kind === "charge" ? "gallop" : "walk") : "stand", sg ? ph : 0, m.v, ppu);
          else if (m.officer) sp = soldierSprite(F, sg ? "officer-walk" : "officer", sg ? ph : 0, m.v, ppu);
          else if (m.drummer) sp = soldierSprite(F, "drum", 0, m.v, ppu);
          else if (m.bearer) sp = soldierSprite(F, "bearer", 0, m.v, ppu);
          else sp = soldierSprite(F, pose, pose === "march" || pose === "charge" ? ph : 0, m.v, ppu);
          var bob = sg && !cav ? -Math.abs(Math.sin((ph / WALK_N) * TAU)) * sc * 2 : 0;
          list.push({ z: yy, sp: sp, x: xx, y: yy + bob, s: sc, flip: facing < 0 });
        }
        var sh = shots();
        for (j = 0; j < sh.length; j++) {
          var s = sh[j], dt = t - s.t;
          if (dt < 0 || dt > 2.6) continue;
          var mm = s.m, o2 = offAt(s.t, mm.lag), y2 = y + mm.dy + o2.y, sc2 = scaleAt(y2) * unit0 * mm.hv, kneel = mm.k === 0 && ranks >= 3 && o.kneel !== false && F.weapon === "musket";
          var mx = x + mm.dx * scaleAt(y2) + o2.x + facing * (kneel ? 66 : 70) * sc2, my = y2 - (kneel ? 47 : 74) * sc2;
          if (dt < 0.09) list.push({ z: y2 + 0.2, fn: (function (mx, my, sc2) { return function (ctx) { var g = ctx.createRadialGradient(mx, my, 0, mx, my, 14 * sc2); g.addColorStop(0, "rgba(255,248,210,1)"); g.addColorStop(0.35, "rgba(255,190,80,0.9)"); g.addColorStop(1, "rgba(255,120,20,0)"); ctx.fillStyle = g; ctx.fillRect(mx - 14 * sc2, my - 14 * sc2, 28 * sc2, 28 * sc2); }; })(mx, my, sc2) });
          var q = dt / 2.6, rad = sc2 * (14 + 46 * outC(q)), al = 0.85 * (q < 0.04 ? q / 0.04 : Math.pow(1 - q, 1.4));
          list.push({ z: y2 + 0.4, sp: puffSprite(j, "#ECE6D8"), x: mx + facing * sc2 * 30 * outC(q) + u(10) * dt, y: my - sc2 * 8 * dt, s: rad / 50, a: al, rot: j });
        }
        if (F.weapon !== "musket" && volleys.length) {
          for (j = 0; j < volleys.length; j++) {
            var va = volleys[j], dt2 = t - va;
            if (dt2 < 0 || dt2 > 1.3) continue;
            list.push({ z: y + 1e4, fn: (function (va, dt2) { return function (ctx) {
              var rr3 = rng(hstr("ar" + va + x)), range = num(o.range, W * 0.34), n = Math.min(26, Math.round(count * 0.35));
              ctx.strokeStyle = "#2A1E14"; ctx.lineCap = "round";
              for (var q2 = 0; q2 < n; q2++) {
                var d0 = rr3() * 0.25, p = clamp((dt2 - d0) / 1.0, 0, 1);
                if (p <= 0 || p >= 1) continue;
                var sx = x + (rr3() - 0.5) * hW * 2, sy = y - size * 0.75, ex = sx + facing * range * (0.8 + rr3() * 0.4), apex = size * (2.2 + rr3());
                var px = lerp(sx, ex, p), py = lerp(sy, sy + size * 0.4, p) - apex * 4 * p * (1 - p), vx = (ex - sx), vy = (size * 0.4) - apex * 4 * (1 - 2 * p);
                var L2 = Math.hypot(vx, vy) || 1, ln = size * 0.22;
                ctx.globalAlpha = 0.8; ctx.lineWidth = Math.max(0.6, size * 0.012);
                ctx.beginPath(); ctx.moveTo(px - (vx / L2) * ln, py - (vy / L2) * ln); ctx.lineTo(px, py); ctx.stroke();
              }
            }; })(va, dt2) });
          }
        }
      },
    };
    void muzzles; void flashC;
    addItem(layer, item);
    bearers.forEach(function (m) {
      var fl = flag({ faction: F, x: x + m.dx, y: y + m.dy, h: size * 1.75, w: size * 0.72, facing: facing, layer: layer, z: 0.35, parent: { at: function (t) { var off = offAt(t, m.lag), yy = y + m.dy + off.y, s = scaleAt(yy); return { x: off.x + m.dx * (s - 1) + facing * 9 * unit0 * s, y: off.y, s: s }; } } });
      A.flags.push(fl);
    });
    return A;
  }

  // ------------------------- guns -------------------------
  function cannon(o) {
    o = obj(o);
    var w = ensure(), F = factionOf(o.faction, "redcoat"), facing = num(o.facing, 1) < 0 ? -1 : 1, x = num(o.x, w.ww * 0.2), y = num(o.y, groundY(0.5)), size = num(o.size, Math.min(W, H) * 0.07), layer = o.layer || "ground";
    var unit = size / 100, fires = [], crewN = o.crew == null ? 2 : Math.max(0, Math.round(num(o.crew, 2)));
    function recoil(t) { var rc = 0; fires.forEach(function (f) { var dt = t - f; if (dt < 0 || dt > 1.6) return; rc = Math.max(rc, dt < 0.08 ? (dt / 0.08) * 14 : 14 * (1 - soft((dt - 0.08) / 1.5))); }); return rc; }
    var api = {
      x: x, y: y, size: size, facing: facing,
      rect: { x: x - (facing > 0 ? 50 : 40) * unit, y: y - 40 * unit, w: 90 * unit, h: 40 * unit },
      fire: function (at) {
        at = num(at, 0); fires.push(at);
        var mx = x + facing * 46 * unit, my = y - 27 * unit;
        smoke({ layer: layer, x: mx, y: my, burst: true, n: 8, at: at, size: size * 0.8, life: 3.6, dir: [facing, -0.12], speed: size * 1.6, z: y + 0.6, wind: u(12) });
        camera.shake(at, num(o.shake, 4), 0.35);
        return api;
      },
      collect: function (t, list) {
        var pu = ppuFor(unit * (w.camNow ? w.camNow.z * w.F : 1)), rc = recoil(t);
        var key = "c|" + F.id + "|" + Math.round(rc);
        list.push({ z: y, sp: sprite(key, [-60, -40, 60, 6], pu, function () { return cannonShapes(F, Math.round(rc)); }), x: x, y: y, s: unit, flip: facing < 0 });
        for (var i = 0; i < crewN; i++) list.push({ z: y - (i + 1) * 0.5, sp: soldierSprite(F, i === 0 ? "stand" : "march", 0, i % 2, ppuFor(unit * 1.1 * (w.camNow ? w.camNow.z * w.F : 1))), x: x - facing * (44 + i * 22) * unit, y: y - i * 3 * unit, s: unit * 1.05, flip: facing < 0 });
        fires.forEach(function (f) { var dt = t - f; if (dt < 0 || dt > 0.12) return; var mx = x + facing * 50 * unit, my = y - 26 * unit, R = 36 * unit * (1 - dt / 0.12 * 0.4); list.push({ z: y + 0.7, fn: function (ctx) { var g = ctx.createRadialGradient(mx, my, 0, mx, my, R); g.addColorStop(0, "rgba(255,250,220,1)"); g.addColorStop(0.3, "rgba(255,200,90,0.95)"); g.addColorStop(1, "rgba(255,110,20,0)"); ctx.fillStyle = g; ctx.fillRect(mx - R, my - R, R * 2, R * 2); } }); });
      },
    };
    addItem(layer, api);
    return api;
  }

  // ------------------------- single figures (free use, aftermath) -------------------------
  function figure(o) {
    o = obj(o);
    var w = ensure(), F = factionOf(o.faction, "redcoat"), facing = num(o.facing, 1) < 0 ? -1 : 1, size = num(o.size, Math.min(W, H) * 0.08), unit = size / 100;
    var kind = o.horse ? "horse" : "man", poseF = typeof o.pose === "function" ? o.pose : function () { return o.pose || "stand"; };
    var api = {
      x: num(o.x, w.ww / 2), y: num(o.y, groundY(0.6)), size: size, move: null,
      walk: function (at, dur, dx, dy) { api.move = { at: num(at, 0), dur: Math.max(0.1, num(dur, 2)), dx: num(dx, facing * size), dy: num(dy, 0) }; return api; },
      collect: function (t, list) {
        var mv = api.move, p = mv ? soft(prog(t, mv.at, mv.dur)) : 0, xx = api.x + (mv ? mv.dx * p : 0), yy = api.y + (mv ? mv.dy * p : 0), walking = mv && t > mv.at && t < mv.at + mv.dur;
        var ph = walking ? Math.floor((t - mv.at) * 0.9 * WALK_N) % WALK_N : 0, pu = ppuFor(unit * (w.camNow ? w.camNow.z * w.F : 1));
        var sp = kind === "horse" ? horseSprite(o.rider ? F : null, o.colour || F.horse, walking ? "walk" : "stand", ph, 0, pu, { saddle: o.saddle || F.coat }) : soldierSprite(F, walking ? "march" : poseF(t), ph, num(o.v, 0) % 2, pu);
        list.push({ z: yy + (o.z || 0), sp: sp, x: xx, y: yy, s: unit, flip: facing < 0, rot: o.rot || 0 });
      },
    };
    api.rect = { x: api.x - size * 0.4, y: api.y - size, w: size * 0.8, h: size };
    addItem(o.layer || "ground", api);
    return api;
  }

  // ------------------------- commanders: faces, busts, the table, the portrait -------------------------
  // A generic face from a seed (shape, hair, whiskers): an archetype, never a likeness. Head centre (cx, cy), radius ~6.3.
  function faceShapes(g, seed, F, cx, cy, o) {
    o = o || {};
    var r = rng(num(seed, 1) + 13), skin = SKINS[Math.floor(r() * 4)], hairC = HAIR[Math.floor(r() * HAIR.length)], rx = 6.1 * (0.92 + r() * 0.16), ry = 6.7 * (0.96 + r() * 0.12);
    var style = Math.floor(r() * 3), whisk = r(), beardy = F.era !== "gun" ? r() < 0.65 : r() < 0.15, mous = r() < (F.era === "gun" ? 0.35 : 0.5);
    g.l([[cx - 1.5, cy + 4], [cx - 1.2, cy + 10]], shade(skin, -0.12), 6.4, { hi: false });
    g.f("M" + f1(cx - rx) + " " + f1(cy - 1) + "Q" + f1(cx - rx) + " " + f1(cy - ry) + " " + f1(cx) + " " + f1(cy - ry) + "Q" + f1(cx + rx + 0.4) + " " + f1(cy - ry) + " " + f1(cx + rx + 0.6) + " " + f1(cy - 0.5) + "L" + f1(cx + rx + 1.8) + " " + f1(cy + 1.6) + "L" + f1(cx + rx + 0.4) + " " + f1(cy + 2.6) + "Q" + f1(cx + rx * 0.7) + " " + f1(cy + ry) + " " + f1(cx + 0.5) + " " + f1(cy + ry + 0.3) + "Q" + f1(cx - rx * 0.8) + " " + f1(cy + ry * 0.95) + " " + f1(cx - rx) + " " + f1(cy - 1) + "Z", skin);
    g.f("M" + f1(cx - rx) + " " + f1(cy - 1) + "Q" + f1(cx - rx * 0.9) + " " + f1(cy + ry * 0.9) + " " + f1(cx) + " " + f1(cy + ry + 0.2) + "Q" + f1(cx - rx * 0.4) + " " + f1(cy + 2) + " " + f1(cx - rx * 0.45) + " " + f1(cy - 2) + "Z", shade(skin, -0.22), { edge: false, tex: false });
    g.e(cx + rx * 0.45, cy + 2.4, 1.6, 1.1, "#D08A78", { a: 0.35, edge: false, tex: false });
    g.e(cx - rx * 0.62, cy + 0.2, 1.1, 1.7, shade(skin, -0.15), { tex: false });
    var hb = cy - ry * 0.35;
    if (style === 0) g.f("M" + f1(cx - rx - 0.4) + " " + f1(cy + 1.5) + "Q" + f1(cx - rx - 0.6) + " " + f1(cy - ry - 1.2) + " " + f1(cx + 1) + " " + f1(cy - ry - 0.8) + "Q" + f1(cx + rx * 0.9) + " " + f1(cy - ry * 0.8) + " " + f1(cx + rx * 0.7) + " " + f1(hb) + "Q" + f1(cx + 1) + " " + f1(cy - ry * 0.6) + " " + f1(cx - rx * 0.5) + " " + f1(cy - 0.5) + "Z", hairC);
    else if (style === 1) g.f("M" + f1(cx - rx - 0.3) + " " + f1(cy + 2) + "Q" + f1(cx - rx - 0.8) + " " + f1(cy - ry * 0.7) + " " + f1(cx - rx * 0.3) + " " + f1(cy - ry * 0.85) + "L" + f1(cx - rx * 0.2) + " " + f1(cy - ry * 0.5) + "Q" + f1(cx - rx * 0.55) + " " + f1(cy - 1) + " " + f1(cx - rx * 0.45) + " " + f1(cy + 1.5) + "Z", hairC);
    else g.f("M" + f1(cx - rx - 0.5) + " " + f1(cy + 3) + "Q" + f1(cx - rx - 1.5) + " " + f1(cy - ry - 1.5) + " " + f1(cx + 1.5) + " " + f1(cy - ry - 1.6) + "Q" + f1(cx + rx + 1.5) + " " + f1(cy - ry * 0.9) + " " + f1(cx + rx * 0.9) + " " + f1(cy - ry * 0.3) + "Q" + f1(cx + rx * 0.2) + " " + f1(cy - ry * 0.95) + " " + f1(cx - rx * 0.3) + " " + f1(cy - 1) + "Z", hairC);
    if (whisk < 0.55 && F.era === "gun") g.f(P([[cx - rx * 0.35, cy - 1], [cx - rx * 0.05, cy - 1], [cx + rx * 0.05, cy + 3.6], [cx - rx * 0.3, cy + 3.4]], true), shade(hairC, -0.1), { tex: false });
    var ex = cx + rx * 0.5, ey = cy - 0.6;
    g.l([[ex - 1.6, ey - 1.6 - r() * 0.5], [ex + 1.4, ey - 1.9]], shade(hairC, -0.2), 0.75, { hi: false });
    g.e(ex, ey, 1.05, 0.62, "#E8DCC8", { edge: false, tex: false });
    g.e(ex + 0.35, ey, 0.52, 0.55, "#2A1A10", { edge: false, tex: false });
    g.l([[ex - 1.1, ey - 0.65], [ex + 1.0, ey - 0.75]], shade(skin, -0.45), 0.4, { hi: false });
    g.f(P([[cx + rx * 0.82, cy - 0.6], [cx + rx + 1.9, cy + 2.2], [cx + rx + 0.6, cy + 2.9], [cx + rx * 0.7, cy + 2.6]], true), shade(skin, -0.12), { edge: false, tex: false });
    g.l([[cx + rx * 0.45, cy + 4.7], [cx + rx * 0.95, cy + 4.5]], shade(skin, -0.45), 0.55, { hi: false });
    if (mous) g.f("M" + f1(cx + rx * 0.35) + " " + f1(cy + 4.1) + "Q" + f1(cx + rx * 0.8) + " " + f1(cy + 3.1) + " " + f1(cx + rx + 1) + " " + f1(cy + 4.2) + "Q" + f1(cx + rx * 0.7) + " " + f1(cy + 4.9) + " " + f1(cx + rx * 0.35) + " " + f1(cy + 4.1) + "Z", shade(hairC, -0.05), { tex: false });
    if (beardy) g.f("M" + f1(cx - rx * 0.4) + " " + f1(cy + 2) + "Q" + f1(cx - rx * 0.3) + " " + f1(cy + ry + 3.5) + " " + f1(cx + rx * 0.3) + " " + f1(cy + ry + 2.8) + "Q" + f1(cx + rx + 0.6) + " " + f1(cy + ry * 0.6) + " " + f1(cx + rx + 0.4) + " " + f1(cy + 4.4) + "Q" + f1(cx + rx * 0.5) + " " + f1(cy + 5.4) + " " + f1(cx) + " " + f1(cy + 4) + "Z", hairC);
    return { skin: skin, hair: hairC };
  }
  // Upper body of a commander, waist at y 0 (shoulders at -27, head centre -36). arm: draw the near arm (false when animated).
  function bustShapes(F, seed, hat, o) {
    o = o || {};
    var g = FL(), coat = F.armour && F.era !== "eastern" && F.era !== "gun" ? F.armour : F.coat, trim = F.trim || "#C8963E", gold = "#C8963E";
    var shF = [-8.5, -26], shN = [9, -25.5];
    if (F.cloak || F.era === "ancient") g.f(P([[-11, -27], [-6, -24], [-9, 6], [-17, 6]], true), F.cloak || "#8E2A2A");
    g.l([shF, [-12, -14], [-9, -2]], shade(coat, -0.28), 6.4, { hi: false });
    g.f(PS([[-9.5, 4], [10.5, 4], [11.5, -23], [7, -28], [-5, -28.5], [-10, -24], [-9.5, 4]], true), coat);
    if (F.era === "gun") {
      g.f(P([[1.5, -28], [6, -28], [5, 4], [2, 4]], true), trim, { tex: false });
      for (var b = 0; b < 6; b++) g.e(4.6, -24 + b * 4.6, 0.75, 0.75, gold, { edge: false, tex: false });
      g.f(P([[-1, -29.5], [8.5, -29], [8, -26], [-1, -26]], true), trim, { tex: false });
      g.l([[-7, -25], [9, 2]], o.sash || "#A8281E", 2.8, { hi: false });
      g.f(ellD(shN[0], shN[1] + 0.5, 4.6, 2.2), gold); g.l([[shN[0] - 3.5, shN[1] + 1.5], [shN[0] + 4, shN[1] + 2.8]], shade(gold, -0.25), 1.6, { hi: false, a: 0.8 });
      g.f(ellD(shF[0] + 0.5, shF[1] + 0.3, 3.2, 1.8), shade(gold, -0.2), { tex: false });
      g.e(-4, -16, 1.5, 1.5, gold, { tex: false }); g.l([[-4, -20], [-4, -17.5]], "#8E2A2A", 1.2, { hi: false });
    } else if (F.era === "ancient") {
      for (b = 0; b < 4; b++) g.l([[-8.5, -20 + b * 5.5], [10, -20 + b * 5.5]], shade(coat, -0.3), 0.7, { hi: false });
      g.f(ellD(shN[0] - 1, shN[1] + 1, 4, 2.4), shade(coat, 0.1));
      g.l([[-6, -24], [10, -24]], gold, 0.8, { hi: false });
    } else if (F.era === "medieval") {
      g.f(P([[-6, -27], [9, -27], [10, 4], [-7, 4]], true), F.coat);
      g.f(P([[-2, -18], [2.5, -23], [7, -18], [2.5, -13]], true), gold, { tex: false });
    } else {
      for (b = 0; b < 5; b++) g.l([[-8.5, -22 + b * 5], [10.5, -22 + b * 5]], F.trim, 0.8, { hi: false });
      g.f(ellD(shN[0], shN[1] + 1, 5, 3), shade(coat, 0.12));
    }
    if (o.arm !== false) { g.l([shN, [13, -12], [11, -1]], coat, 6.6); g.e(11, -1, 2.3, 2.1, SKINS[0], { edge: false, tex: false }); }
    return g;
  }
  function headSprite(F, seed, hat, ppu) {
    return sprite("hd|" + F.id + "|" + seed + "|" + hat, [-16, -32, 18, 14], ppu, function () {
      var g = FL(), cx = 1, cy = -9;
      faceShapes(g, seed, F, cx, cy);
      if (hat !== "none") hatShapes(g, hat, F, cx, cy);
      return g;
    }, { oil: ppu >= 3 ? [0.42] : null });
  }
  function armSprite(F, ppu) {
    return sprite("arm|" + F.id + (F.variant || ""), [-4, -4, 30, 6], ppu, function () {
      var g = FL(), coat = F.armour && F.era !== "eastern" && F.era !== "gun" ? F.armour : F.coat;
      g.l([[0, 0], [12, 1], [23, 0]], coat, 6.4);
      if (F.era === "gun") g.l([[20, 0], [22.5, 0]], F.trim || "#E8DCC0", 6.6, { hi: false });
      g.e(26, 0, 2.6, 2.2, SKINS[0], { tex: false });
      g.l([[26, -0.4], [29.5, -0.6]], SKINS[0], 1.2, { hi: false });
      return g;
    });
  }
  function general(o) {
    o = obj(o);
    var w = ensure(), F = factionOf(o.faction, "redcoat", o.variant), facing = num(o.facing, 1) < 0 ? -1 : 1, size = num(o.size, H * 0.3), unit = size / 52;
    var seed = num(o.seed, hstr(o.name || F.id)), hat = o.hat && o.hat !== "auto" ? str(o.hat) : F.officerHat || F.hat, x = num(o.x, w.ww / 2), y = num(o.y, w.wh * 0.7), layer = o.layer || "ground";
    var talk = [], points = [], nods = [];
    var api = {
      x: x, y: y, size: size, faction: F, facing: facing,
      rect: { x: x - size * 0.45, y: y - size * 1.05, w: size * 0.9, h: size * 1.05 },
      head: function () { return { x: x + facing * 1 * unit, y: y - 45 * unit }; },
      speak: function (from, to) { talk.push({ from: num(from, 0), to: num(to, D) }); return api; },
      point: function (from, to) { points.push({ from: num(from, 0), to: num(to, from + 2) }); return api; },
      nod: function (at) { nods.push(num(at, 0)); return api; },
      collect: function (t, list) {
        var z = (w.camNow ? w.camNow.z * w.F : 1), pu = ppuFor(unit * z) * 1.4;
        var bob = 0, tilt = 0, arm = 0.95;
        talk.forEach(function (s) {
          if (t < s.from || t > s.to) return;
          (V.words || []).forEach(function (wd) { if (wd.start < s.from - 0.05 || wd.start > s.to) return; var dt = t - wd.start; if (dt >= 0 && dt < 0.35) { var k = Math.sin((dt / 0.35) * PI); bob += k * 0.6; tilt += k * 0.035 * (hstr(wd.word) % 2 ? 1 : -1); } });
          arm = Math.min(arm, 0.55 + 0.2 * Math.sin(t * 2.1 + seed));
        });
        var pa = 0;
        points.forEach(function (p) { var k = soft(prog(t, p.from, 0.5)) * (1 - soft(prog(t, p.to, 0.5))); pa = Math.max(pa, k); });
        arm = lerp(arm, 0.62, pa);
        nods.forEach(function (n) { var dt = t - n; if (dt >= 0 && dt < 0.6) tilt += Math.sin((dt / 0.6) * PI) * 0.09; });
        tilt += Math.sin(t * 0.9 + seed) * 0.012;
        list.push({ z: y - 0.2, sp: sprite("bs|" + F.id + (F.variant || "") + "|" + seed, [-20, -32, 22, 8], pu, function () { return bustShapes(F, seed, hat, { arm: false }); }, { oil: pu >= 3 ? [0.5] : null }), x: x, y: y, s: unit, flip: facing < 0 });
        var hx = x + facing * 1.2 * unit, hy = y - (27.5 - bob) * unit;
        list.push({ z: y - 0.1, sp: headSprite(F, seed, hat, pu), x: hx, y: hy, s: unit, flip: facing < 0, rot: facing * tilt });
        list.push({ z: y, sp: armSprite(F, pu), x: x + facing * 9 * unit, y: y - 25.5 * unit, s: unit, flip: facing < 0, rot: facing * arm });
      },
    };
    addItem(layer, api);
    return api;
  }
  function tableSprite(F, wpx, ppu, candles, seed) {
    return sprite("tb|" + F.id + "|" + Math.round(wpx) + "|" + candles, [-wpx * 0.56, -wpx * 0.22, wpx * 0.56, wpx * 0.24], ppu, function () {
      var g = FL(), W2 = wpx, d = W2 * 0.17, r = rng(seed || 5), cloth = F.era === "gun" ? "#4A1E18" : "#3A2A1C";
      g.f(P([[-W2 * 0.5, 0], [W2 * 0.5, 0], [W2 * 0.53, W2 * 0.22], [-W2 * 0.53, W2 * 0.22]], true), cloth);
      for (var i = 0; i < 9; i++) { var fx = -W2 * 0.5 + (W2 * i) / 8; g.l([[fx, W2 * 0.01], [fx * 1.06, W2 * 0.22]], shade(cloth, i % 2 ? -0.3 : 0.2), W2 * 0.012, { hi: false, a: 0.5 }); }
      g.l([[-W2 * 0.5, W2 * 0.004], [W2 * 0.5, W2 * 0.004]], "#C8963E", W2 * 0.006, { hi: false });
      g.f(P([[-W2 * 0.5, 0], [W2 * 0.5, 0], [W2 * 0.43, -d], [-W2 * 0.43, -d]], true), "#5A3A22");
      var mp = [[-W2 * 0.4, -d * 0.12], [W2 * 0.4, -d * 0.12], [W2 * 0.35, -d * 0.88], [-W2 * 0.35, -d * 0.88]];
      g.f(P(mp, true), "#E2CC98");
      g.l([[-W2 * 0.3, -d * 0.2], [-W2 * 0.1, -d * 0.5], [W2 * 0.05, -d * 0.45], [W2 * 0.3, -d * 0.82]], "#5E7A86", W2 * 0.008, { hi: false });
      for (i = 0; i < 14; i++) g.e(-W2 * 0.3 + r() * W2 * 0.25, -d * (0.4 + r() * 0.4), W2 * 0.012, W2 * 0.006, "#4E5E34", { tex: false, edge: false });
      g.l([[-W2 * 0.25, -d * 0.75], [W2 * 0.28, -d * 0.3]], "#7A5A38", W2 * 0.004, { hi: false, a: 0.7 });
      for (i = 0; i < 6; i++) { var bx = -W2 * 0.2 + r() * W2 * 0.4, by = -d * (0.3 + r() * 0.45); g.f(rectD(bx, by, W2 * 0.035, W2 * 0.012), i % 2 ? "#A8261C" : "#26407A", { tex: false }); }
      g.f(P([[W2 * 0.05, -d * 0.4], [W2 * 0.18, -d * 0.55], [W2 * 0.19, -d * 0.52], [W2 * 0.06, -d * 0.37]], true), "#B8B8B2", { tex: false });
      return g;
    }, { oil: [2.2, 1.1] });
  }
  function table(o) {
    o = obj(o);
    var w = ensure(), F = factionOf(o.faction, "redcoat"), x = num(o.x, w.ww / 2), y = num(o.y, w.wh * 0.72), tw = num(o.w, w.ww * 0.6), nC = o.candles == null ? 2 : Math.max(0, Math.round(num(o.candles, 2))), layer = o.layer || "ground";
    var d = tw * 0.17, seed = hstr("tb" + x);
    var cand = [];
    for (var i = 0; i < nC; i++) cand.push({ x: x + (nC === 1 ? 0.3 : -0.38 + (0.76 * i) / (nC - 1)) * tw, y: y - d * (nC === 1 ? 0.5 : 0.7), h: tw * 0.07 });
    var api = {
      x: x, y: y, w: tw, candles: cand,
      top: { x: x - tw * 0.43, y: y - d, w: tw * 0.86, h: d },
      map: { x: x - tw * 0.38, y: y - d * 0.92, w: tw * 0.76, h: d * 0.85 },
      rect: { x: x - tw * 0.53, y: y - d - tw * 0.1, w: tw * 1.06, h: d + tw * 0.32 },
      collect: function (t, list) {
        var z = (w.camNow ? w.camNow.z * w.F : 1), pu = clamp(Math.pow(2, Math.round(Math.log2(z * 1.5) * 2) / 2), 0.7, 3);
        list.push({ z: y + 0.5, sp: tableSprite(F, tw, pu, nC, seed), x: x, y: y, s: 1 });
        cand.forEach(function (c, ci) {
          list.push({ z: y + 0.6, fn: function (ctx) {
            var fl = 0.85 + 0.15 * noise1(t * 7 + ci * 3, 50 + ci), gr = ctx.createRadialGradient(c.x, c.y - c.h, 0, c.x, c.y - c.h, tw * 0.45 * fl);
            gr.addColorStop(0, "rgba(255,200,110,0.34)"); gr.addColorStop(1, "rgba(255,150,60,0)");
            ctx.fillStyle = gr; ctx.fillRect(c.x - tw * 0.5, c.y - c.h - tw * 0.5, tw, tw);
            ctx.fillStyle = "#B08A44"; ctx.fillRect(c.x - c.h * 0.22, c.y - c.h * 0.12, c.h * 0.44, c.h * 0.12);
            ctx.fillStyle = "#EEE4CC"; ctx.fillRect(c.x - c.h * 0.08, c.y - c.h, c.h * 0.16, c.h * 0.9);
            var fh = c.h * 0.34 * fl, sw = noise1(t * 5 + ci, 70 + ci) * c.h * 0.04;
            var g2 = ctx.createLinearGradient(0, c.y - c.h, 0, c.y - c.h - fh); g2.addColorStop(0, "rgba(255,240,180,1)"); g2.addColorStop(1, "rgba(255,150,40,0.2)");
            ctx.fillStyle = g2; ctx.beginPath(); ctx.moveTo(c.x - c.h * 0.06, c.y - c.h); ctx.quadraticCurveTo(c.x + sw, c.y - c.h - fh * 0.6, c.x + sw * 2, c.y - c.h - fh); ctx.quadraticCurveTo(c.x + c.h * 0.08 + sw, c.y - c.h - fh * 0.5, c.x + c.h * 0.06, c.y - c.h); ctx.fill();
          } });
        });
      },
    };
    addItem(layer, api);
    return api;
  }
  // Oval gold-framed painted bust.
  function portraitCanvas(F, seed, hat, wpx) {
    var key = "pt|" + F.id + "|" + seed + "|" + hat + "|" + Math.round(wpx);
    if (SPR[key]) return SPR[key];
    var hpx = wpx * 1.28, c = mkCanvas(wpx, hpx), ctx = c.getContext("2d"), cx = wpx / 2, cy = hpx / 2, rx = wpx * 0.5, ry = hpx * 0.5, fr = wpx * 0.07;
    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, cy, rx - fr * 0.7, ry - fr * 0.7, 0, 0, TAU); ctx.clip();
    var bg = ctx.createRadialGradient(cx - wpx * 0.12, cy - hpx * 0.18, 0, cx, cy, ry);
    bg.addColorStop(0, "#6A5232"); bg.addColorStop(0.6, "#3A2A18"); bg.addColorStop(1, "#1A120A");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, wpx, hpx);
    var k = wpx / 46;
    ctx.save(); ctx.translate(cx - 1.5 * k, hpx * 0.98); ctx.scale(k, k);
    var g = bustShapes(F, seed, hat, { arm: false });
    paintList(ctx, g, k, [-20, -32, 22, 8], seed);
    ctx.restore();
    ctx.save(); ctx.translate(cx - 0.2 * k, hpx * 0.98 - 27.5 * k); ctx.scale(k, k);
    var g2 = FL(); faceShapes(g2, seed, F, 1, -9); if (hat !== "none") hatShapes(g2, hat, F, 1, -9);
    paintList(ctx, g2, k, [-16, -32, 18, 14], seed + 1);
    ctx.restore();
    oilInside(c, { sizes: [wpx * 0.0075, wpx * 0.004], k: 1, seed: seed + 3, flow: 0.7, len: [1.6, 3.8], impasto: 0.35, alpha: 0.5, minAlpha: 100, jitter: 10, broken: 14, detail: 20, keep: 0.45 });
    glaze(ctx, { cx: cx - wpx * 0.15, cy: cy - hpx * 0.2, r: ry * 1.1 }, [[0, "#FFD8A0", 0.12], [0.6, "#000000", 0], [1, "#0A0603", 0.5]], [0, 0, wpx, hpx]);
    ctx.restore();
    ctx.save();
    ctx.lineWidth = fr; ctx.strokeStyle = "#8A6324"; ctx.beginPath(); ctx.ellipse(cx, cy, rx - fr / 2, ry - fr / 2, 0, 0, TAU); ctx.stroke();
    var gg = ctx.createLinearGradient(0, 0, wpx, hpx); gg.addColorStop(0, "#F2D488"); gg.addColorStop(0.45, "#B88A3A"); gg.addColorStop(0.7, "#E6C27A"); gg.addColorStop(1, "#6A4A1C");
    ctx.lineWidth = fr * 0.7; ctx.strokeStyle = gg; ctx.beginPath(); ctx.ellipse(cx, cy, rx - fr / 2, ry - fr / 2, 0, 0, TAU); ctx.stroke();
    ctx.lineWidth = fr * 0.12; ctx.strokeStyle = "#4A3010"; ctx.beginPath(); ctx.ellipse(cx, cy, rx - fr * 0.95, ry - fr * 0.95, 0, 0, TAU); ctx.stroke();
    for (var i = 0; i < 44; i++) { var a = (i / 44) * TAU; ctx.fillStyle = i % 2 ? "#F6E0A0" : "#8A6324"; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * (rx - fr * 0.5), cy + Math.sin(a) * (ry - fr * 0.5), fr * 0.14, 0, TAU); ctx.fill(); }
    ctx.restore();
    var sp = { c: c, ox: cx, oy: cy, ppu: 1 };
    SPR[key] = sp;
    return sp;
  }
  function portrait(o) {
    o = obj(o);
    var w = ensure(), F = factionOf(o.faction, "redcoat"), cw = num(o.w, Math.min(W, H) * 0.5), ch = cw * 1.28, cx = num(o.cx, w.ww / 2), cy = num(o.cy, w.wh / 2);
    var seed = num(o.seed, hstr(o.name || "commander")), hat = o.hat && o.hat !== "auto" ? str(o.hat) : F.officerHat || F.hat, layer = o.layer || "ground";
    var res = Math.round(cw * 1.7);
    var api = {
      cx: cx, cy: cy, w: cw, h: ch, rect: { x: cx - cw / 2, y: cy - ch / 2, w: cw, h: ch },
      collect: function (t, list) { var sp = portraitCanvas(F, seed, hat, res); list.push({ z: num(o.z, 1e5), sp: sp, x: cx, y: cy, s: cw / res, a: 1 }); },
    };
    addItem(layer, api);
    return api;
  }

  // ------------------------- screen overlays -------------------------
  function ovDiv(cls) { return div("ph-o " + (cls || ""), ensure().ov); }
  function textLines(parent, lay, o) {
    o = o || {};
    var wrap = div("ph-lines", parent);
    lay.lines.forEach(function (l) {
      var d = div("ph-line", wrap, l.words.join(" "));
      d.style.fontSize = f1(lay.size) + "px"; d.style.lineHeight = f1(lay.size * lay.lh) + "px";
    });
    wrap.style.fontFamily = o.family || SERIF; wrap.style.fontWeight = o.weight || 700; if (o.italic) wrap.style.fontStyle = "italic";
    if (o.ls) wrap.style.letterSpacing = f2(o.ls) + "em";
    wrap.style.color = o.color || PAL.ink;
    return wrap;
  }
  function bannerColour(c) { c = str(c).toLowerCase(); return c === "red" ? "#7E1A10" : c === "blue" ? "#1C3060" : c && /^#[0-9a-f]{6}$/i.test(c) ? c : PAL.ink; }
  // Cream parchment banner, big dark serif caps. pos: top bottom center. slam: drop in with a camera bump.
  function banner(text, o) {
    o = obj(o);
    var w = ensure(), sf = SAFE(), at = tc(num(o.at, 0.6)), end = num(o.end, D + 1);
    text = caps(text); if (!text) return null;
    var maxW = (sf.x1 - sf.x0) * (PORT ? 0.94 : 0.78), size = num(o.size, PORT ? u(92) : u(86));
    var lay = layoutText(text, { size: size, maxW: maxW - u(70), maxLines: PORT ? 3 : 2, minSize: u(40), lh: 1.04, ls: 0.02 });
    var sub = str(o.sub), subLay = sub ? layoutText(sub, { size: lay.size * 0.4, maxW: maxW - u(80), maxLines: 2, minSize: u(22), lh: 1.2, italic: true, weight: 400, family: SERIF2 }) : null;
    var padX = u(38), padY = u(18), bw = Math.min(maxW, lay.w + padX * 2 + u(10)), bh = lay.h + padY * 2 + (subLay ? subLay.h + u(6) : 0);
    if (subLay) bw = Math.max(bw, subLay.w + padX * 2);
    var pos = str(o.pos) || "top", cx = W / 2, y;
    if (pos === "bottom") y = (PORT ? sf.y1 - u(20) : sf.y1 - u(10)) - bh;
    else if (pos === "center" || pos === "middle") y = (sf.y0 + sf.y1) / 2 - bh / 2;
    else y = PORT ? sf.y0 + u(30) : sf.y0 + u(26);
    if (o.y != null) y = num(o.y, y);
    var el = ovDiv("ph-banner");
    place(el, cx - bw / 2, y, bw, bh);
    var pc = parchment(bw, bh, { seed: hstr(text) });
    pc.className = "ph-parch"; place(pc, -pc._pad, -pc._pad, pc.width, pc.height);
    el.appendChild(pc);
    var tx = textLines(el, lay, { color: bannerColour(o.color), ls: 0.02 });
    place(tx, 0, padY, bw, lay.h);
    var sx = null;
    if (subLay) { sx = textLines(el, subLay, { italic: true, weight: 400, family: SERIF2, color: "#4A3420" }); place(sx, 0, padY + lay.h + u(4), bw, subLay.h); }
    var slam = o.slam !== false;
    if (slam) camera.shake(at + 0.16, 5, 0.3);
    up(function (t) {
      var vis = t >= at - 0.01 && t < end + 0.4;
      show(el, vis);
      if (!vis) return;
      var p = prog(t, at, 0.36), q = prog(t, end, 0.35), dy = slam ? -u(26) * (1 - inQ(prog(t, at, 0.18))) : 0;
      setS(el, "clipPath", p < 1 ? "inset(-20% " + f1((1 - outC(p)) * 50) + "% -20% " + f1((1 - outC(p)) * 50) + "%)" : "none");
      setS(el, "transform", "translate(0px," + f1(dy - q * u(10)) + "px)");
      setS(el, "opacity", f2(1 - q));
      var tp = outC(prog(t, at, 0.22));
      setS(tx, "opacity", f2(tp)); setS(tx, "transform", "translate(0px," + f1((1 - tp) * -u(8)) + "px)");
      if (sx) setS(sx, "opacity", f2(outC(prog(t, at + 0.3, 0.4))));
    });
    addBox("banner", text, at + 0.2, end, function () { return { x: cx - bw / 2, y: y, w: bw, h: bh }; });
    return { el: el, x: cx - bw / 2, y: y, w: bw, h: bh, at: at };
  }
  function lowerThird(place_, o) {
    o = obj(o);
    var sf = SAFE(), at = tc(num(o.at, 0.6)), end = num(o.end, D + 1), title = caps(place_), sub = str(o.sub);
    if (!title && !sub) return null;
    var size = PORT ? u(52) : u(46), maxW = (sf.x1 - sf.x0) * (PORT ? 0.9 : 0.5);
    var lay = layoutText(title || " ", { size: size, maxW: maxW - u(60), maxLines: 2, minSize: u(28), lh: 1.08, ls: 0.06 });
    var sl = sub ? layoutText(sub, { size: size * 0.66, maxW: maxW - u(60), maxLines: 1, minSize: u(20), italic: true, weight: 400, family: SERIF2, lh: 1.2 }) : null;
    var padX = u(30), padY = u(16), bw = Math.max(lay.w * 1.06, sl ? sl.w : 0) + padX * 2, bh = padY * 2 + lay.h + (sl ? sl.h + u(12) : 0);
    var align = str(o.align) || "left", x = align === "right" ? sf.x1 - bw : align === "center" ? W / 2 - bw / 2 : sf.x0;
    var y = o.y != null ? num(o.y, 0) : (PORT ? sf.y1 - u(10) : sf.y1 - u(6)) - bh;
    var el = ovDiv("ph-lower");
    place(el, x, y, bw, bh);
    var pc = parchment(bw, bh, { seed: hstr(title + sub), rule: false });
    pc.className = "ph-parch"; place(pc, -pc._pad, -pc._pad, pc.width, pc.height); el.appendChild(pc);
    var tx = textLines(el, lay, { color: PAL.ink, ls: 0.06 });
    tx.style.textAlign = "left"; place(tx, padX, padY, bw - padX * 2, lay.h);
    var rule = div("ph-rule", el); place(rule, padX, padY + lay.h + u(5), Math.min(bw - padX * 2, Math.max(lay.w, u(120))), Math.max(2, u(3)));
    var sx = null;
    if (sl) { sx = textLines(el, sl, { italic: true, weight: 400, family: SERIF2, color: "#5A3E22" }); sx.style.textAlign = "left"; place(sx, padX, padY + lay.h + u(12), bw - padX * 2, sl.h); }
    up(function (t) {
      var vis = t >= at - 0.01 && t < end + 0.4;
      show(el, vis); if (!vis) return;
      var p = outC(prog(t, at, 0.45)), q = prog(t, end, 0.35);
      setS(el, "clipPath", p < 1 ? "inset(-20% " + f1((1 - p) * 100) + "% -20% 0%)" : "none");
      setS(el, "opacity", f2(1 - q));
      setS(rule, "transform", "scaleX(" + f2(outC(prog(t, at + 0.2, 0.5))) + ")");
      if (sx) setS(sx, "opacity", f2(outC(prog(t, at + 0.3, 0.4))));
    });
    addBox("lowerThird", title || sub, at + 0.3, end, function () { return { x: x, y: y, w: bw, h: bh }; });
    return { el: el, x: x, y: y, w: bw, h: bh };
  }
  function medallion(sizePx) {
    var key = "vs" + Math.round(sizePx);
    if (SPR[key]) return SPR[key].c;
    var n = Math.round(sizePx), c = mkCanvas(n + 20, n + 20), ctx = c.getContext("2d"), cx = c.width / 2, R = n / 2;
    ctx.save(); ctx.filter = "blur(6px)"; ctx.fillStyle = "rgba(10,5,0,0.6)"; ctx.beginPath(); ctx.arc(cx + 3, cx + 6, R, 0, TAU); ctx.fill(); ctx.restore();
    var g = ctx.createRadialGradient(cx - R * 0.3, cx - R * 0.35, R * 0.1, cx, cx, R);
    g.addColorStop(0, "#F6DE98"); g.addColorStop(0.55, "#C8963E"); g.addColorStop(1, "#6A4618");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cx, R, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#4A3010"; ctx.lineWidth = R * 0.06; ctx.beginPath(); ctx.arc(cx, cx, R * 0.84, 0, TAU); ctx.stroke();
    for (var i = 0; i < 32; i++) { var a = (i / 32) * TAU; ctx.fillStyle = i % 2 ? "#F6E0A0" : "#8A6324"; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R * 0.93, cx + Math.sin(a) * R * 0.93, R * 0.035, 0, TAU); ctx.fill(); }
    oilPass(c, { sizes: [Math.max(1.5, R * 0.05)], k: 1, seed: 9, flow: 1, alpha: 0.45, minAlpha: 200, jitter: 18, impasto: 0.5 });
    SPR[key] = { c: c };
    return c;
  }
  function versus(a, b, o) {
    o = obj(o); a = obj(a); b = obj(b);
    var sf = SAFE(), at = tc(num(o.at, 0.8)), end = num(o.end, D + 1), cd = num(o.countDur, 1.3);
    var FA = factionOf(a.faction, "redcoat"), FB = factionOf(b.faction, enemyOf(FA.id), b.faction && guessFaction(b.faction) === FA.id ? 1 : 0);
    var plaques = [], gap = PORT ? u(30) : u(40), medal = PORT ? u(130) : u(150);
    var numSize = PORT ? u(96) : u(92), labSize = numSize * 0.36;
    var maxPW = PORT ? (sf.x1 - sf.x0) * 0.86 : ((sf.x1 - sf.x0) - medal - gap * 2) / 2;
    [a, b].forEach(function (s, i) {
      var cnt = Math.max(0, Math.round(num(s.count, 0))), txt = cnt ? V.format(cnt, 0, true) : caps(s.label || s.name || (i ? FB.name : FA.name));
      var nl = layoutText(txt, { size: numSize, maxW: maxPW - u(70), maxLines: 1, minSize: u(40), lh: 1.0 });
      var lab = caps(cnt ? (s.label || s.name || (i ? FB.name : FA.name)) : "");
      var ll = lab ? layoutText(lab, { size: labSize, maxW: maxPW - u(60), maxLines: 1, minSize: u(18), lh: 1.15, ls: 0.12 }) : null;
      var pw = Math.min(maxPW, Math.max(nl.w, ll ? ll.w * 1.15 : 0) + u(80)), ph = nl.h + (ll ? ll.h + u(8) : 0) + u(40);
      plaques.push({ cnt: cnt, txt: txt, nl: nl, ll: ll, lab: lab, w: pw, h: ph, F: i ? FB : FA });
    });
    var top = o.y != null ? num(o.y, 0) : (str(o.pos) === "bottom" ? null : PORT ? sf.y0 + u(20) : sf.y0 + u(20));
    var layout = [];
    if (PORT) {
      var y0 = top == null ? sf.y1 - (plaques[0].h + plaques[1].h + medal * 0.6 + u(10)) : top;
      layout.push({ x: W / 2 - plaques[0].w / 2, y: y0 });
      layout.push({ x: W / 2 - plaques[1].w / 2, y: y0 + plaques[0].h + medal * 0.6 });
      var mcx = W / 2, mcy = y0 + plaques[0].h + medal * 0.3;
    } else {
      var hh = Math.max(plaques[0].h, plaques[1].h), yy = top == null ? sf.y1 - hh - u(10) : top + Math.max(0, (medal - hh) / 2);
      var tot = plaques[0].w + plaques[1].w + medal + gap * 2, x0 = W / 2 - tot / 2;
      layout.push({ x: x0, y: yy + (hh - plaques[0].h) / 2 });
      layout.push({ x: x0 + plaques[0].w + medal + gap * 2, y: yy + (hh - plaques[1].h) / 2 });
      mcx = x0 + plaques[0].w + gap + medal / 2; mcy = yy + hh / 2;
    }
    var els = [], vcols = sideColours(FA, FB);
    plaques.forEach(function (pq, i) {
      var L = layout[i], el = ovDiv("ph-vs-plaque");
      place(el, L.x, L.y, pq.w, pq.h);
      var pc = parchment(pq.w, pq.h, { seed: 31 + i, rule: false }); pc.className = "ph-parch"; place(pc, -pc._pad, -pc._pad, pc.width, pc.height); el.appendChild(pc);
      var band = div("ph-vs-band", el); place(band, i ? pq.w - u(16) : 0, 0, u(16), pq.h); band.style.background = i ? vcols[1] : vcols[0];
      var nt = textLines(el, pq.nl, { color: shade(i ? vcols[1] : vcols[0], -0.3) }); place(nt, 0, u(18), pq.w, pq.nl.h);
      var lt = pq.ll ? textLines(el, pq.ll, { color: "#4A3420", ls: 0.12 }) : null;
      if (lt) place(lt, 0, u(18) + pq.nl.h + u(6), pq.w, pq.ll.h);
      els.push({ el: el, nt: nt, lt: lt, pq: pq, L: L, line: nt.firstChild });
      addBox("versus", pq.txt, at + 0.5, end, function () { return { x: L.x, y: L.y, w: pq.w, h: pq.h }; });
    });
    var med = ovDiv("ph-vs-medal"), mc = medallion(medal);
    mc.className = "ph-medal-c"; med.appendChild(mc);
    place(med, mcx - mc.width / 2, mcy - mc.height / 2, mc.width, mc.height); place(mc, 0, 0, mc.width, mc.height);
    var vt = div("ph-vs-text", med, "VS"); place(vt, 0, 0, mc.width, mc.height); vt.style.fontSize = f1(medal * 0.42) + "px"; vt.style.lineHeight = f1(mc.height) + "px";
    camera.shake(at + 0.05, 4, 0.3);
    up(function (t) {
      var vis = t >= at - 0.01 && t < end + 0.4;
      els.forEach(function (e, i) {
        show(e.el, vis); if (!vis) return;
        var p = outC(prog(t, at + i * 0.12, 0.4)), q = prog(t, end, 0.35), dx = (i ? 1 : -1) * (PORT ? 0 : u(60)) * (1 - p), dy = PORT ? (i ? 1 : -1) * u(30) * (1 - p) : 0;
        setS(e.el, "opacity", f2(p * (1 - q))); setS(e.el, "transform", "translate(" + f1(dx) + "px," + f1(dy) + "px)");
        if (e.pq.cnt) { var c = Math.round(e.pq.cnt * outC(prog(t, at + 0.1, cd))), s = V.format(c, 0, true); if (e.line.textContent !== s) e.line.textContent = s; }
      });
      show(med, vis); if (!vis) return;
      var mp = outC(prog(t, at + 0.25, 0.35)), q2 = prog(t, end, 0.35);
      setS(med, "opacity", f2(mp * (1 - q2))); setS(med, "clipPath", "circle(" + f1(mp * 55) + "% at 50% 50%)");
    });
    addBox("versus", "VS", at + 0.6, end, function () { return { x: mcx - medal / 2, y: mcy - medal / 2, w: medal, h: medal }; });
    var bottom = Math.max(layout[0].y + plaques[0].h, layout[1].y + plaques[1].h, mcy + medal / 2);
    return { plaques: layout, medal: { x: mcx, y: mcy, r: medal / 2 }, bottom: bottom };
  }
  // Quotation: large italic serif, words light up as spoken, attribution in gold caps.
  function quote(text, o) {
    o = obj(o);
    var sf = SAFE(), at = tc(num(o.at, 0.4)), end = num(o.end, D + 1), q = str(text).replace(/^["']+|["']+$/g, "");
    if (!q) return null;
    var maxW = (sf.x1 - sf.x0) * (PORT ? 0.94 : 0.8), maxH = (sf.y1 - sf.y0) * (PORT ? 0.6 : 0.62), size = num(o.size, PORT ? u(70) : u(66));
    var lay = layoutText(q, { size: size, maxW: maxW, maxH: maxH, minSize: u(30), lh: 1.3, italic: true, weight: 400, family: SERIF2 });
    var auth = caps(o.author), al = auth ? layoutText(auth, { size: lay.size * 0.5, maxW: maxW * 0.8, maxLines: 2, minSize: u(20), lh: 1.2, ls: 0.16 }) : null;
    var orn = u(30), blockH = orn + lay.h + u(24) + (al ? al.h + u(16) : 0) + orn;
    var y = (sf.y0 + sf.y1) / 2 - blockH / 2 + (PORT ? -u(30) : 0), x0 = W / 2 - maxW / 2;
    var el = ovDiv("ph-quote"); place(el, x0, y, maxW, blockH);
    var o1 = div("ph-orn", el); place(o1, maxW / 2 - u(160), 0, u(320), orn);
    var box = div("ph-lines", el); place(box, 0, orn + u(6), maxW, lay.h);
    box.style.fontFamily = SERIF2; box.style.fontStyle = "italic"; box.style.fontWeight = 400;
    var spans = [], tokens = [];
    lay.lines.forEach(function (l) {
      var d = div("ph-line", box); d.style.fontSize = f1(lay.size) + "px"; d.style.lineHeight = f1(lay.size * lay.lh) + "px";
      l.words.forEach(function (wd, i) { var s = doc.createElement("span"); s.textContent = wd; s.className = "ph-qw"; d.appendChild(s); if (i < l.words.length - 1) d.appendChild(doc.createTextNode(" ")); spans.push(s); tokens.push(wd); });
    });
    var times = alignWords(tokens, at - 0.2, Math.min(end, endLimit()));
    var ax = null;
    if (al) { ax = textLines(el, al, { color: PAL.gold, ls: 0.16 }); place(ax, 0, orn + lay.h + u(24), maxW, al.h); }
    var o2 = div("ph-orn", el); place(o2, maxW / 2 - u(160), blockH - orn, u(320), orn);
    var authAt = o.authorAt != null ? num(o.authorAt, 0) : Math.min(endLimit(), times[times.length - 1] + 0.4);
    up(function (t) {
      var vis = t >= at - 0.3 && t < end + 0.4;
      show(el, vis); if (!vis) return;
      var p = outC(prog(t, at - 0.3, 0.5)), qq = prog(t, end, 0.35);
      setS(el, "opacity", f2(p * (1 - qq)));
      spans.forEach(function (s, i) { var k = outC(prog(t, times[i] - 0.05, 0.3)); setS(s, "color", "rgba(243,230,200," + f2(0.22 + 0.78 * k) + ")"); setS(s, "textShadow", "0 0 " + f1(u(18)) + "px rgba(0,0,0," + f2(0.4 + 0.3 * k) + ")"); });
      if (ax) { var ak = outC(prog(t, authAt, 0.5)); setS(ax, "opacity", f2(ak)); setS(ax, "transform", "translate(0px," + f1((1 - ak) * u(10)) + "px)"); }
      var ok = outC(prog(t, at - 0.2, 0.6)); setS(o1, "transform", "scaleX(" + f2(ok) + ")"); setS(o2, "transform", "scaleX(" + f2(ok) + ")");
    });
    addBox("quote", q.slice(0, 30), at + 0.3, end, function () { return { x: W / 2 - lay.w / 2, y: y + orn, w: lay.w, h: lay.h }; });
    if (al) addBox("quote-author", auth, authAt + 0.3, end, function () { return { x: W / 2 - al.w / 2, y: y + orn + lay.h + u(24), w: al.w, h: al.h }; });
    return { el: el, times: times, y: y, h: blockH };
  }
  function caption(text, o) {
    o = obj(o);
    var sf = SAFE(), at = tc(num(o.at, 0.5)), end = num(o.end, D + 1), s = str(text);
    if (!s) return null;
    var size = num(o.size, PORT ? u(48) : u(44)), lay = layoutText(s, { size: size, maxW: num(o.maxW, (sf.x1 - sf.x0) * 0.9), maxLines: 3, minSize: u(24), lh: 1.25, italic: true, weight: 400, family: SERIF2 });
    var bh = lay.h + u(30), bw = lay.w + u(70), y = o.y != null ? num(o.y, 0) : (str(o.pos) === "top" ? sf.y0 + u(10) : sf.y1 - bh - u(6)), x = clamp(num(o.cx, W / 2) - bw / 2, sf.x0 - u(30), sf.x1 + u(30) - bw);
    var el = ovDiv("ph-caption"); place(el, x, y, bw, bh);
    var tx = textLines(el, lay, { italic: true, weight: 400, family: SERIF2, color: PAL.cream }); place(tx, 0, u(15), bw, lay.h);
    up(function (t) { var vis = t >= at - 0.01 && t < end + 0.4; show(el, vis); if (!vis) return; var p = outC(prog(t, at, 0.45)), q = prog(t, end, 0.35); setS(el, "opacity", f2(p * (1 - q))); setS(el, "transform", "translate(0px," + f1((1 - p) * u(12)) + "px)"); });
    addBox("caption", s, at + 0.4, end, function () { return { x: x, y: y, w: bw, h: bh }; });
    return { el: el, x: x, y: y, w: bw, h: bh };
  }
  // Chapter title: kicker with gold rules, big caps on a cream banner, italic subtitle, gold date.
  function titleCard(title, o) {
    o = obj(o);
    var sf = SAFE(), at = tc(num(o.at, 0.3)), ta = tc(num(o.titleAt, at + 0.4)), end = num(o.end, D + 1);
    var kick = caps(o.kicker), sub = str(o.sub), date = caps(o.date);
    var cy = (sf.y0 + sf.y1) / 2 + (PORT ? -u(40) : u(0));
    var kl = kick ? layoutText(kick, { size: PORT ? u(40) : u(36), maxW: (sf.x1 - sf.x0) * 0.7, maxLines: 1, minSize: u(20), lh: 1.2, ls: 0.3 }) : null;
    var parts = [];
    var bn = banner(title, { at: ta, end: end, pos: "center", size: PORT ? u(104) : u(104), slam: true });
    if (!bn) return null;
    if (kl) {
      var ke = ovDiv("ph-kicker ph-band"), kw = kl.w + u(200), ky = bn.y - kl.h - u(26);
      place(ke, W / 2 - kw / 2, ky, kw, kl.h);
      var kt = textLines(ke, kl, { color: PAL.goldLt, ls: 0.3 }); place(kt, 0, 0, kw, kl.h);
      var r1 = div("ph-krule", ke), r2 = div("ph-krule", ke);
      place(r1, 0, kl.h / 2, u(80), Math.max(2, u(2))); place(r2, kw - u(80), kl.h / 2, u(80), Math.max(2, u(2)));
      parts.push({ el: ke, at: at });
      addBox("kicker", kick, at + 0.4, end, function () { return { x: W / 2 - kw / 2, y: ky, w: kw, h: kl.h }; });
    }
    var below = bn.y + bn.h + u(22);
    if (sub) {
      var sl = layoutText(sub, { size: PORT ? u(46) : u(42), maxW: (sf.x1 - sf.x0) * 0.82, maxLines: 2, minSize: u(24), lh: 1.25, italic: true, weight: 400, family: SERIF2 });
      var se = ovDiv("ph-sub ph-band"); place(se, W / 2 - sl.w / 2 - u(40), below, sl.w + u(80), sl.h);
      var st = textLines(se, sl, { italic: true, weight: 400, family: SERIF2, color: PAL.cream }); place(st, 0, 0, sl.w + u(80), sl.h);
      parts.push({ el: se, at: ta + 0.45 });
      var sy = below; addBox("subtitle", sub, ta + 0.8, end, function () { return { x: W / 2 - sl.w / 2, y: sy, w: sl.w, h: sl.h }; });
      below += sl.h + u(14);
    }
    if (date) {
      var dl = layoutText(date, { size: PORT ? u(34) : u(30), maxW: (sf.x1 - sf.x0) * 0.6, maxLines: 1, minSize: u(18), lh: 1.2, ls: 0.25 });
      var de = ovDiv("ph-date ph-band"); place(de, W / 2 - dl.w / 2 - u(60), below, dl.w + u(120), dl.h);
      var dt = textLines(de, dl, { color: PAL.goldLt, ls: 0.25 }); place(dt, 0, 0, dl.w + u(120), dl.h);
      parts.push({ el: de, at: ta + 0.7 });
      var dy0 = below; addBox("date", date, ta + 1.0, end, function () { return { x: W / 2 - dl.w / 2, y: dy0, w: dl.w, h: dl.h }; });
    }
    up(function (t) {
      parts.forEach(function (pp) {
        var vis = t >= pp.at - 0.01 && t < end + 0.4; show(pp.el, vis); if (!vis) return;
        var p = outC(prog(t, pp.at, 0.5)), q = prog(t, end, 0.35);
        setS(pp.el, "opacity", f2(p * (1 - q))); setS(pp.el, "transform", "translate(0px," + f1((1 - p) * u(10)) + "px)");
      });
    });
    return { banner: bn };
  }
  // A scrim that darkens the painting behind text (quotes).
  function dim(at, amount, dur) {
    var w = ensure(), el = div("ph-dim", w.el);
    w.el.insertBefore(el, w.ov);
    up(function (t) { var a = num(amount, 0.5) * soft(prog(t, num(at, 0), num(dur, 0.8))); show(el, a > 0.002); setS(el, "opacity", f2(a)); });
    return el;
  }

  // ------------------------- the battle map -------------------------
  function deskBackdrop() {
    var w = ensure(), sk = layerCanvas(w.layers.sky, "ph-desk"), c = sk.ctx, m = w.m, r = rng(91);
    var g = c.createLinearGradient(0, -m, 0, w.wh + m); g.addColorStop(0, "#3A2616"); g.addColorStop(1, "#22150A");
    c.fillStyle = g; c.fillRect(-m, -m, w.ww + 2 * m, w.wh + 2 * m);
    c.lineCap = "round";
    for (var i = 0; i < 90; i++) { var y = -m + r() * (w.wh + 2 * m); c.globalAlpha = 0.12 + r() * 0.12; c.strokeStyle = r() < 0.5 ? "#5A3A20" : "#1A0E06"; c.lineWidth = u(3 + r() * 9); c.beginPath(); c.moveTo(-m, y); c.bezierCurveTo(w.ww * 0.3, y + (r() - 0.5) * u(30), w.ww * 0.7, y + (r() - 0.5) * u(30), w.ww + m, y + (r() - 0.5) * u(20)); c.stroke(); }
    c.globalAlpha = 1;
    oilPass(sk.c, { sizes: [16, 8], seed: 93, dir: 0, flow: 0.25, impasto: 0.3 });
    glaze(c, { cx: w.ww * 0.45, cy: w.wh * 0.4, r: Math.max(w.ww, w.wh) * 0.75 }, [[0, "#FFB868", 0.18], [0.6, "#000000", 0.1], [1, "#050200", 0.6]], [-m, -m, w.ww + 2 * m, w.wh + 2 * m]);
  }
  function mapCanvas(o, wpx, hpx) {
    var c = mkCanvas(wpx, hpx), ctx = c.getContext("2d"), r = rng(o.seed || 17), k = wpx / 1500, ter = obj(o.terrain);
    ctx.fillStyle = "#E4CF9C"; ctx.fillRect(0, 0, wpx, hpx);
    for (var i = 0; i < 30; i++) blob(ctx, r() * wpx, r() * hpx, (80 + r() * 260) * k, (60 + r() * 180) * k, r() < 0.5 ? "#F2E2B8" : "#C8AE76", 0.35);
    for (i = 0; i < 6; i++) blob(ctx, r() * wpx, r() * hpx, (30 + r() * 70) * k, (24 + r() * 50) * k, "#A88A50", 0.18);
    var ink = "#3A2814", inkL = "#6A5030", waterC = "#6E8E92", forestC = "#5E6E3A";
    var X = function (f) { return f * wpx; }, Y = function (f) { return f * hpx; };
    if (ter.coast) {
      var cp = [];
      for (i = 0; i <= 12; i++) cp.push([X(0.1 + Math.sin(i * 0.9 + r()) * 0.025 + (r() - 0.5) * 0.01), Y(i / 12)]);
      ctx.fillStyle = "#86A4A4"; ctx.beginPath(); ctx.moveTo(0, 0); cp.forEach(function (q) { ctx.lineTo(q[0], q[1]); }); ctx.lineTo(0, hpx); ctx.fill();
      ctx.strokeStyle = ink; ctx.lineWidth = 2.4 * k; ctx.beginPath(); cp.forEach(function (q, j) { if (j) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.stroke();
      ctx.globalAlpha = 0.5; ctx.lineWidth = 1.4 * k;
      for (i = 0; i < 26; i++) { var wx = X(0.01 + r() * 0.07), wy = Y(r()); ctx.beginPath(); ctx.moveTo(wx, wy); ctx.quadraticCurveTo(wx + 10 * k, wy - 6 * k, wx + 20 * k, wy); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
    if (ter.hills !== false) {
      for (i = 0; i < 7; i++) {
        var hx = X(0.15 + r() * 0.7), hy = Y(0.12 + r() * 0.76), hr = (50 + r() * 70) * k;
        if (Math.abs(hx / wpx - 0.5) < 0.12 && hy / hpx > 0.25 && hy / hpx < 0.8) continue;
        blob(ctx, hx, hy, hr * 1.3, hr, "#B8955A", 0.45);
        ctx.strokeStyle = inkL; ctx.lineWidth = 1.5 * k; ctx.globalAlpha = 0.75;
        for (var a = 0; a < 14; a++) { var an = PI + (a / 13) * PI, x0 = hx + Math.cos(an) * hr, y0 = hy + Math.sin(an) * hr * 0.6; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + Math.cos(an) * hr * 0.28, y0 + Math.sin(an) * hr * 0.17); ctx.stroke(); }
        ctx.globalAlpha = 1;
      }
    }
    if (ter.forest !== false) {
      for (i = 0; i < 5; i++) {
        var fx = X(r() < 0.5 ? 0.08 + r() * 0.2 : 0.72 + r() * 0.2), fy = Y(0.15 + r() * 0.7), n = 14 + Math.floor(r() * 16);
        for (var j = 0; j < n; j++) { var tx = fx + (r() - 0.5) * 120 * k, ty = fy + (r() - 0.5) * 70 * k, tr = (7 + r() * 6) * k; ctx.fillStyle = "rgba(40,30,10,0.35)"; ctx.beginPath(); ctx.arc(tx + 2 * k, ty + 3 * k, tr, 0, TAU); ctx.fill(); ctx.fillStyle = mixC(forestC, r() < 0.5 ? "#7E8A4A" : "#3E4A26", 0.4); ctx.beginPath(); ctx.arc(tx, ty, tr, 0, TAU); ctx.fill(); ctx.strokeStyle = ink; ctx.globalAlpha = 0.5; ctx.lineWidth = 1 * k; ctx.stroke(); ctx.globalAlpha = 1; }
      }
    }
    if (ter.river !== false) {
      var rp = [], horiz = !!ter.riverAcross;
      for (i = 0; i <= 20; i++) { var f = i / 20; rp.push(horiz ? [X(f), Y(0.16 + Math.sin(f * 5 + 1) * 0.04 + f * 0.05)] : [X(0.83 + Math.sin(f * 6 + 2) * 0.04 - f * 0.06), Y(f)]); }
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.strokeStyle = ink; ctx.lineWidth = 16 * k; ctx.globalAlpha = 0.8; ctx.stroke(new Path2D(PS(rp)));
      ctx.strokeStyle = waterC; ctx.lineWidth = 12 * k; ctx.globalAlpha = 1; ctx.stroke(new Path2D(PS(rp)));
      ctx.strokeStyle = "#A8C0BC"; ctx.lineWidth = 3 * k; ctx.globalAlpha = 0.6; ctx.stroke(new Path2D(PS(rp))); ctx.globalAlpha = 1;
    }
    var towns = arr(ter.towns);
    ctx.setLineDash([7 * k, 7 * k]); ctx.strokeStyle = "#8A6A40"; ctx.lineWidth = 2.4 * k; ctx.globalAlpha = 0.8;
    for (i = 0; i < towns.length - 1; i++) { ctx.beginPath(); ctx.moveTo(X(towns[i].fx), Y(towns[i].fy)); ctx.quadraticCurveTo(X((towns[i].fx + towns[i + 1].fx) / 2 + 0.05), Y((towns[i].fy + towns[i + 1].fy) / 2), X(towns[i + 1].fx), Y(towns[i + 1].fy)); ctx.stroke(); }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    oilPass(c, { sizes: [9 * k, 4.5 * k], k: 1, seed: 19, flow: 0.5, impasto: 0.25, alpha: 0.5, jitter: 10, detail: 30, keep: 0.12 });
    towns.forEach(function (tw, ti) {
      var tx2 = X(tw.fx), ty2 = Y(tw.fy);
      for (var b = 0; b < 5; b++) { ctx.fillStyle = b % 2 ? "#8A3A24" : "#6A4A30"; ctx.fillRect(tx2 + (b - 2.5) * 9 * k + (b % 2) * 3 * k, ty2 - (b % 3) * 6 * k, 8 * k, 8 * k); }
      ctx.strokeStyle = ink; ctx.lineWidth = 1.2 * k; ctx.strokeRect(tx2 - 24 * k, ty2 - 14 * k, 48 * k, 24 * k);
      ctx.font = "italic 400 " + f1(30 * k) + "px " + SERIF2; ctx.fillStyle = ink; ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillText(str(tw.name), tx2, ty2 + 16 * k);
    });
    // compass rose
    var cx = X(0.9), cy = Y(0.13), cr = 46 * k;
    ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 1.6 * k;
    ctx.beginPath(); ctx.arc(cx, cy, cr * 0.8, 0, TAU); ctx.stroke();
    for (i = 0; i < 8; i++) { var aa = (i / 8) * TAU - PI / 2, L = i % 2 ? cr * 0.6 : cr; ctx.fillStyle = i % 4 === 0 ? "#8E2A1E" : ink; ctx.beginPath(); ctx.moveTo(cx + Math.cos(aa) * L, cy + Math.sin(aa) * L); ctx.lineTo(cx + Math.cos(aa + 0.3) * cr * 0.16, cy + Math.sin(aa + 0.3) * cr * 0.16); ctx.lineTo(cx + Math.cos(aa - 0.3) * cr * 0.16, cy + Math.sin(aa - 0.3) * cr * 0.16); ctx.fill(); }
    ctx.font = "700 " + f1(24 * k) + "px " + SERIF; ctx.fillStyle = ink; ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText("N", cx, cy - cr - 4 * k);
    // scale bar
    var sx = X(0.06), sy = Y(0.93);
    for (i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? "#E4CF9C" : ink; ctx.fillRect(sx + i * 34 * k, sy, 34 * k, 8 * k); }
    ctx.strokeStyle = ink; ctx.strokeRect(sx, sy, 136 * k, 8 * k);
    ctx.font = "italic 400 " + f1(20 * k) + "px " + SERIF2; ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.fillText("leagues", sx, sy + 12 * k);
    // border
    ctx.strokeStyle = ink; ctx.lineWidth = 4 * k; ctx.strokeRect(14 * k, 14 * k, wpx - 28 * k, hpx - 28 * k);
    ctx.lineWidth = 1.5 * k; ctx.strokeRect(24 * k, 24 * k, wpx - 48 * k, hpx - 48 * k);
    [[24, 24], [wpx / k - 24, 24], [24, hpx / k - 24], [wpx / k - 24, hpx / k - 24]].forEach(function (q) { ctx.fillStyle = "#8E2A1E"; ctx.beginPath(); ctx.arc(q[0] * k, q[1] * k, 7 * k, 0, TAU); ctx.fill(); });
    glaze(ctx, { cx: wpx / 2, cy: hpx / 2, r0: Math.min(wpx, hpx) * 0.3, r: Math.hypot(wpx, hpx) * 0.55 }, [[0, "#000000", 0], [1, "#5A3A14", 0.45]], [0, 0, wpx, hpx]);
    return c;
  }
  function arrowSamples(pts) {
    if (pts.length === 2) { var a = pts[0], b = pts[1]; pts = [a, [lerp(a[0], b[0], 0.5), lerp(a[1], b[1], 0.5)], b]; }
    var out = [], n = 48;
    for (var s = 0; s < pts.length - 1; s++) {
      var p0 = pts[Math.max(0, s - 1)], p1 = pts[s], p2 = pts[s + 1], p3 = pts[Math.min(pts.length - 1, s + 2)];
      for (var i = 0; i < n; i++) {
        var t = i / n, t2 = t * t, t3 = t2 * t;
        out.push([0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]);
      }
    }
    out.push(pts[pts.length - 1].slice());
    var L = [0];
    for (i = 1; i < out.length; i++) L.push(L[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]));
    return { pts: out, L: L, total: L[L.length - 1] };
  }
  function sampleAt(S2, f) {
    var d = clamp(f, 0, 1) * S2.total, L = S2.L, i = 1;
    while (i < L.length - 1 && L[i] < d) i++;
    var a = S2.pts[i - 1], b = S2.pts[i], seg = L[i] - L[i - 1] || 1, q = (d - L[i - 1]) / seg;
    return { x: lerp(a[0], b[0], q), y: lerp(a[1], b[1], q), a: Math.atan2(b[1] - a[1], b[0] - a[0]), i: i };
  }
  var BRUSHTEX = {};
  function brushPattern(ctx, colour) {
    if (!BRUSHTEX[colour]) {
      var n = 96, c = mkCanvas(n, n), x = c.getContext("2d"), r = rng(hstr(colour));
      x.fillStyle = colour; x.fillRect(0, 0, n, n); x.lineCap = "round";
      for (var i = 0; i < 60; i++) { var yy = r() * n; x.globalAlpha = 0.25; x.strokeStyle = shade(colour, r() < 0.5 ? 0.25 : -0.25); x.lineWidth = 2 + r() * 5; x.beginPath(); x.moveTo(-10, yy); x.lineTo(n + 10, yy + (r() - 0.5) * 12); x.stroke(); }
      BRUSHTEX[colour] = c;
    }
    return ctx.createPattern(BRUSHTEX[colour], "repeat");
  }
  function battleMap(o) {
    o = obj(o);
    var w = ensure(), x = num(o.x, w.ww * 0.1), y = num(o.y, w.wh * 0.1), mw = num(o.w, w.ww * 0.8), mh = num(o.h, w.wh * 0.8), layer = o.layer || "ground";
    var ter = obj(o.terrain), res = Math.min(3200, Math.round(mw * 1.6)), tex = null, items = [], title = caps(o.title);
    function canvasNow() { if (!tex) tex = mapCanvas({ terrain: ter, seed: o.seed }, res, Math.round(res * mh / mw)); return tex; }
    function wx(f) { return x + f * mw; }
    function wy(f) { return y + f * mh; }
    var k = mw / 1500;
    var map = {
      x: x, y: y, w: mw, h: mh, rect: { x: x, y: y, w: mw, h: mh }, k: k, boxes: [],
      at: function (fx, fy) { return { x: wx(fx), y: wy(fy) }; },
      unit: function (uo) {
        uo = obj(uo);
        var F = factionOf(uo.faction, "redcoat", uo.variant), fx = num(uo.fx, 0.5), fy = num(uo.fy, 0.5), kind = str(uo.kind) || "infantry", at = num(uo.at, 0.3);
        var bw = mw * (kind === "cavalry" ? 0.075 : 0.1) * num(uo.scale, 1), bh = bw * 0.38, label = caps(uo.label), col = uo.colour || F.coat, lfs = Math.max(16, 34 * k);
        var U = { fx: fx, fy: fy, F: F, w: bw, h: bh, follow: null, moves: [], label: label, at: at,
          pos: function (t) {
            var px = wx(fx), py = wy(fy), ang = num(uo.angle, 0);
            if (U.follow) { var a = U.follow, p = a.progress(t); if (p > 0) { var s = sampleAt(a.S, p * 0.74); px = s.x; py = s.y; ang = 0; } }
            U.moves.forEach(function (mv) { var p2 = soft(prog(t, mv.at, mv.dur)); px += mv.dx * mw * p2; py += mv.dy * mh * p2; });
            return { x: px, y: py, a: ang };
          },
          move: function (at2, dur, dfx, dfy) { U.moves.push({ at: num(at2, 0), dur: num(dur, 1), dx: num(dfx, 0), dy: num(dfy, 0) }); return U; },
        };
        items.push({ z: 2, draw: function (ctx, t) {
          if (t < at) return;
          var p = outC(prog(t, at, 0.45)), ps = U.pos(t);
          ctx.save(); ctx.translate(ps.x, ps.y - (1 - p) * bh * 1.5); ctx.rotate(ps.a); ctx.globalAlpha = p;
          ctx.fillStyle = "rgba(30,15,5,0.35)"; ctx.fillRect(-bw / 2 + bh * 0.12, -bh / 2 + bh * 0.16, bw, bh);
          ctx.fillStyle = brushPattern(ctx, col); ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
          ctx.strokeStyle = shade(col, -0.5); ctx.lineWidth = Math.max(1, bh * 0.08); ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
          ctx.strokeStyle = mixC(col, "#F0E4C8", 0.75); ctx.lineWidth = Math.max(1, bh * 0.06);
          if (kind === "cavalry") { ctx.beginPath(); ctx.moveTo(-bw / 2, bh / 2); ctx.lineTo(bw / 2, -bh / 2); ctx.stroke(); }
          else if (kind === "artillery") { ctx.beginPath(); ctx.arc(0, 0, bh * 0.22, 0, TAU); ctx.fill && ctx.stroke(); }
          else { ctx.beginPath(); ctx.moveTo(-bw / 2, -bh / 2); ctx.lineTo(bw / 2, bh / 2); ctx.moveTo(-bw / 2, bh / 2); ctx.lineTo(bw / 2, -bh / 2); ctx.stroke(); }
          ctx.fillStyle = "#3A2614"; ctx.fillRect(-bw / 2 - bh * 0.06, -bh * 1.6, bh * 0.08, bh * 1.2);
          ctx.fillStyle = F.flag.field; ctx.fillRect(-bw / 2, -bh * 1.6, bh * 0.7, bh * 0.45);
          ctx.fillStyle = F.flag.c1; ctx.fillRect(-bw / 2 + bh * 0.25, -bh * 1.5, bh * 0.2, bh * 0.25);
          if (label) { ctx.font = "700 " + f1(lfs) + "px " + SERIF; ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillStyle = "#2A1A0C"; ctx.fillText(label, 0, bh / 2 + 5 * k); }
          ctx.restore();
        } });
        if (label) map.boxes.push(addBox("map-label", label, at + 0.5, null, function (t) { var ps = U.pos(t), a = toScreen(ps.x - bw / 2, ps.y - bh * 1.6, t, layer), b = toScreen(ps.x + bw / 2, ps.y + bh / 2 + 8 * k + lfs * 1.1, t, layer); var lw = measure(label, lfs) * a[2]; var cxs = (a[0] + b[0]) / 2, ww2 = Math.max(b[0] - a[0], lw); return { x: cxs - ww2 / 2, y: a[1], w: ww2, h: b[1] - a[1], moving: camMoving(t) || !!U.follow }; }));
        return U;
      },
      arrow: function (ao) {
        ao = obj(ao);
        var F = factionOf(ao.faction, "redcoat", ao.variant), at = tc(num(ao.at, 1)), dur = Math.max(0.3, num(ao.dur, 1.4));
        var pts = [arr(ao.from), arr(ao.via).length && Array.isArray(ao.via[0]) ? null : arr(ao.via), arr(ao.to)].filter(function (q) { return q && q.length === 2; });
        if (Array.isArray(ao.via) && Array.isArray(ao.via[0])) pts = [arr(ao.from)].concat(ao.via).concat([arr(ao.to)]);
        pts = pts.map(function (q) { return [wx(num(q[0], 0.5)), wy(num(q[1], 0.5))]; });
        if (pts.length < 2) return null;
        var S2 = arrowSamples(pts), wd = num(ao.width, mw * 0.03) * (ao.dashed ? 0.7 : 1), blunt = !!ao.blunt, dashed = !!ao.dashed, col = ao.colour || F.coat;
        var A2 = { S: S2, at: at, dur: dur, F: F, progress: function (t) { return outC(prog(t, at, dur)); }, end: function () { var e = S2.pts[S2.pts.length - 1]; return { x: e[0], y: e[1] }; } };
        if (ao.unit) ao.unit.follow = A2;
        items.push({ z: 1, draw: function (ctx, t) {
          var p = A2.progress(t);
          if (p <= 0) return;
          var tip = sampleAt(S2, p), n = tip.i, headL = wd * 1.6, left = [], right = [];
          var stop = S2.total * p - headL * 0.7;
          for (var i = 0; i < S2.pts.length && S2.L[i] <= stop; i++) {
            var q = S2.pts[i], q2 = S2.pts[Math.min(S2.pts.length - 1, i + 1)], an = Math.atan2(q2[1] - q[1], q2[0] - q[0]), f = S2.L[i] / Math.max(1, S2.total * p), hw = wd * (0.28 + 0.22 * f);
            left.push([q[0] + Math.cos(an - PI / 2) * hw, q[1] + Math.sin(an - PI / 2) * hw]); right.push([q[0] + Math.cos(an + PI / 2) * hw, q[1] + Math.sin(an + PI / 2) * hw]);
          }
          void n;
          var base = sampleAt(S2, Math.max(0, stop / S2.total));
          left.push([base.x + Math.cos(base.a - PI / 2) * wd * 0.5, base.y + Math.sin(base.a - PI / 2) * wd * 0.5]);
          right.push([base.x + Math.cos(base.a + PI / 2) * wd * 0.5, base.y + Math.sin(base.a + PI / 2) * wd * 0.5]);
          var body = new Path2D(P(left.concat(right.reverse()), true));
          ctx.save();
          if (dashed) { ctx.setLineDash([wd * 0.7, wd * 0.5]); ctx.lineCap = "butt"; ctx.strokeStyle = shade(col, -0.1); ctx.lineWidth = wd * 0.32; ctx.beginPath(); for (i = 0; i < S2.pts.length && S2.L[i] <= stop; i++) { if (i) ctx.lineTo(S2.pts[i][0], S2.pts[i][1]); else ctx.moveTo(S2.pts[i][0], S2.pts[i][1]); } ctx.lineTo(base.x, base.y); ctx.stroke(); ctx.setLineDash([]); }
          else {
            ctx.translate(wd * 0.12, wd * 0.16); ctx.fillStyle = "rgba(30,15,5,0.35)"; ctx.fill(body); ctx.translate(-wd * 0.12, -wd * 0.16);
            ctx.fillStyle = brushPattern(ctx, col); ctx.fill(body);
            ctx.strokeStyle = shade(col, -0.5); ctx.lineWidth = Math.max(1, wd * 0.07); ctx.stroke(body);
          }
          var ha = tip.a, hx = tip.x, hy = tip.y;
          if (blunt) { ctx.strokeStyle = shade(col, -0.4); ctx.lineWidth = wd * 0.35; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(base.x + Math.cos(ha - PI / 2) * wd * 0.9, base.y + Math.sin(ha - PI / 2) * wd * 0.9); ctx.lineTo(base.x + Math.cos(ha + PI / 2) * wd * 0.9, base.y + Math.sin(ha + PI / 2) * wd * 0.9); ctx.stroke(); }
          else {
            var head = new Path2D(P([[hx, hy], [base.x + Math.cos(ha - PI / 2) * wd * 1.05, base.y + Math.sin(ha - PI / 2) * wd * 1.05], [base.x - Math.cos(ha) * wd * 0.15, base.y - Math.sin(ha) * wd * 0.15], [base.x + Math.cos(ha + PI / 2) * wd * 1.05, base.y + Math.sin(ha + PI / 2) * wd * 1.05]], true));
            ctx.fillStyle = brushPattern(ctx, col); ctx.fill(head);
            ctx.strokeStyle = shade(col, -0.5); ctx.lineWidth = Math.max(1, wd * 0.07); ctx.stroke(head);
          }
          ctx.restore();
        } });
        return A2;
      },
      clash: function (fx, fy, at, fac) {
        at = tc(num(at, 2)); var cx = wx(num(fx, 0.5)), cy = wy(num(fy, 0.5)), R = mw * 0.05, F = factionOf(fac, "redcoat");
        items.push({ z: 3, draw: function (ctx, t) {
          if (t < at) return;
          var p = outC(prog(t, at, 0.35)), pulse = 1 + 0.05 * Math.sin((t - at) * 6);
          ctx.save(); ctx.translate(cx, cy); ctx.scale(p * pulse, p * pulse);
          ctx.fillStyle = "#E8A040"; ctx.strokeStyle = "#6A1A0E"; ctx.lineWidth = R * 0.06;
          ctx.beginPath();
          for (var i = 0; i < 18; i++) { var a = (i / 18) * TAU, rr2 = i % 2 ? R * 0.45 : R * (0.9 + 0.2 * Math.sin(i * 2.3)); ctx.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); }
          ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.fillStyle = "#B8281E"; ctx.beginPath();
          for (i = 0; i < 14; i++) { a = (i / 14) * TAU + 0.2; rr2 = i % 2 ? R * 0.22 : R * 0.5; ctx.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2); }
          ctx.closePath(); ctx.fill();
          ctx.restore();
          void F;
        } });
        smoke({ layer: layer, x: cx, y: cy, burst: true, n: 7, at: at, size: R * 1.2, life: 3, z: 1e7, dir: [0, -1], speed: R * 0.6, wind: R * 0.1, opacity: 0.55 });
        return { x: cx, y: cy, at: at };
      },
      line: function (lo) {
        lo = obj(lo); var at = tc(num(lo.at, 0.5)), pts = arr(lo.pts).map(function (q) { return [wx(q[0]), wy(q[1])]; }), F = factionOf(lo.faction, "redcoat"), lcol = lo.colour || F.coat;
        if (pts.length < 2) return null;
        var S2 = arrowSamples(pts);
        items.push({ z: 1.5, draw: function (ctx, t) {
          var p = outC(prog(t, at, 0.8)); if (p <= 0) return;
          ctx.save(); ctx.strokeStyle = shade(lcol, -0.2); ctx.lineWidth = mw * 0.009; ctx.lineCap = "round"; ctx.beginPath();
          for (var i = 0; i < S2.pts.length && S2.L[i] <= S2.total * p; i++) { if (i) ctx.lineTo(S2.pts[i][0], S2.pts[i][1]); else ctx.moveTo(S2.pts[i][0], S2.pts[i][1]); }
          ctx.stroke();
          ctx.lineWidth = mw * 0.004;
          for (i = 4; i < S2.pts.length && S2.L[i] <= S2.total * p; i += 6) { var q = S2.pts[i], q2 = S2.pts[i - 1], an = Math.atan2(q[1] - q2[1], q[0] - q2[0]) + PI / 2; ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0] + Math.cos(an) * mw * 0.016, q[1] + Math.sin(an) * mw * 0.016); ctx.stroke(); }
          ctx.restore();
        } });
        return S2;
      },
    };
    var appear = num(o.at, 0);
    addItem(layer, {
      collect: function (t, list) {
        var c = canvasNow(), p = soft(prog(t, appear, 0.5));
        list.push({ z: -1e6, fn: function (ctx) {
          ctx.globalAlpha = p;
          ctx.fillStyle = "rgba(10,5,0,0.55)"; ctx.fillRect(x + mw * 0.008, y + mw * 0.012, mw, mh);
          ctx.drawImage(c, x, y, mw, mh);
          if (title) {
            var ts = Math.min(mh * 0.075, (mw * 0.42) / Math.max(4, title.length * 0.62)), tw = measure(title, ts, { ls: 0.08 }) + ts * 2.2, th = ts * 1.7, tx = x + mw / 2 - tw / 2, ty = y + mh * 0.045;
            ctx.fillStyle = "#EEDDB4"; ctx.strokeStyle = "#3A2814"; ctx.lineWidth = Math.max(1, ts * 0.06);
            ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + tw, ty); ctx.lineTo(tx + tw - ts * 0.4, ty + th / 2); ctx.lineTo(tx + tw, ty + th); ctx.lineTo(tx, ty + th); ctx.lineTo(tx + ts * 0.4, ty + th / 2); ctx.closePath(); ctx.fill(); ctx.stroke();
            ctx.font = "700 " + f1(ts) + "px " + SERIF; ctx.fillStyle = "#2A1A0C"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
            if (ctx.letterSpacing != null) ctx.letterSpacing = f1(ts * 0.08) + "px";
            ctx.fillText(title, x + mw / 2, ty + th / 2 + ts * 0.04);
            if (ctx.letterSpacing != null) ctx.letterSpacing = "0px";
          }
        } });
        list.push({ z: 1e6, fn: function (ctx, tt) { ctx.globalAlpha = 1; items.slice().sort(function (a, b) { return a.z - b.z; }).forEach(function (it) { ctx.save(); it.draw(ctx, tt); ctx.restore(); }); } });
      },
    });
    if (title) map.boxes.push(addBox("map-title", title, appear + 0.4, null, function (t) { var ts = Math.min(mh * 0.075, (mw * 0.42) / Math.max(4, title.length * 0.62)), tw = measure(title, ts, { ls: 0.08 }) + ts * 2.2, a = toScreen(x + mw / 2 - tw / 2, y + mh * 0.045, t, layer), b = toScreen(x + mw / 2 + tw / 2, y + mh * 0.045 + ts * 1.7, t, layer); return { x: a[0], y: a[1], w: b[0] - a[0], h: b[1] - a[1], moving: camMoving(t) }; }));
    arr(ter.towns).forEach(function (tw) { var nm = str(tw.name); if (!nm) return; map.boxes.push(addBox("map-town", nm, appear + 0.4, null, function (t) { var fs = 30 * k, ww2 = measure(nm, fs, { italic: true, weight: 400, family: SERIF2 }), a = toScreen(wx(tw.fx) - ww2 / 2, wy(tw.fy) - 14 * k, t, layer), b = toScreen(wx(tw.fx) + ww2 / 2, wy(tw.fy) + 16 * k + fs * 1.2, t, layer); return { x: a[0], y: a[1], w: b[0] - a[0], h: b[1] - a[1], moving: camMoving(t) }; })); });
    return map;
  }
  // Classic manoeuvres on a map: attacker starts at the bottom, defender at the top.
  var MANOEUVRES = ["frontal", "flank-left", "flank-right", "pincer", "feigned-retreat", "envelopment", "breakthrough", "defend"];
  function manoeuvre(map, kind, o) {
    o = obj(o);
    kind = str(kind).toLowerCase().replace(/[\s_]+/g, "-");
    if (MANOEUVRES.indexOf(kind) < 0) kind = /left/.test(kind) ? "flank-left" : /right|flank/.test(kind) ? "flank-right" : /pinc|double/.test(kind) ? "pincer" : /feign|retreat|lure/.test(kind) ? "feigned-retreat" : /envel|encirc|surround/.test(kind) ? "envelopment" : /break|punch|centre|center/.test(kind) ? "breakthrough" : /defen|hold|line/.test(kind) ? "defend" : "frontal";
    var A = factionOf(o.attacker, "roman"), Dd = factionOf(o.defender, enemyOf(A.id), o.defender && guessFaction(o.defender) === A.id ? 1 : 0);
    var at = tc(num(o.at, D * 0.4)), lim = endLimit() - 0.3, dur = clamp(num(o.dur, 1.4), 0.6, Math.max(0.6, (lim - at) * 0.6));
    var la = caps(o.attackerLabel), ld = caps(o.defenderLabel), t0 = num(o.from, 0.3), step = Math.min(0.25, Math.max(0.08, (at - t0) / 7));
    var R = {}, cols = sideColours(A, Dd), cA = cols[0], cD = cols[1];
    var dC = map.unit({ faction: Dd, colour: cD, fx: 0.5, fy: 0.27, label: ld, at: t0 }), dL = map.unit({ faction: Dd, colour: cD, fx: 0.3, fy: 0.3, at: t0 + step, kind: "cavalry" }), dR = map.unit({ faction: Dd, colour: cD, fx: 0.7, fy: 0.3, at: t0 + step * 2, kind: "cavalry" });
    var aC = map.unit({ faction: A, colour: cA, fx: 0.5, fy: 0.76, label: la, at: t0 + step * 3 }), aL = map.unit({ faction: A, colour: cA, fx: 0.27, fy: 0.74, at: t0 + step * 4, kind: "cavalry" }), aR = map.unit({ faction: A, colour: cA, fx: 0.73, fy: 0.74, at: t0 + step * 5, kind: "cavalry" });
    R.units = { attacker: [aL, aC, aR], defender: [dL, dC, dR] };
    var arrows = [], clashes = [], s2 = dur * 0.35, end = at + dur;
    function ar(f, fr, via, to, d0, dd, ex) { var a = map.arrow(Object.assign({ faction: f, colour: f === A ? cA : cD, from: fr, via: via, to: to, at: at + (d0 || 0), dur: dd || dur }, ex || {})); if (a) arrows.push(a); return a; }
    if (kind === "frontal") {
      ar(A, [0.5, 0.71], null, [0.5, 0.36], 0, dur, { unit: aC, width: map.w * 0.04 });
      ar(A, [0.27, 0.7], null, [0.3, 0.4], s2 * 0.5, dur * 0.8, { unit: aL }); ar(A, [0.73, 0.7], null, [0.7, 0.4], s2 * 0.5, dur * 0.8, { unit: aR });
      clashes.push(map.clash(0.5, 0.32, end + 0.05, A.id));
    } else if (kind === "flank-left" || kind === "flank-right") {
      var sgn = kind === "flank-left" ? -1 : 1, sx = 0.5 + sgn * 0.23;
      ar(A, [0.5, 0.71], null, [0.5, 0.45], 0, dur * 0.6, { unit: aC, width: map.w * 0.025 });
      ar(A, [sx, 0.7], [0.5 + sgn * 0.42, 0.46], [0.5 + sgn * 0.27, 0.27], s2 * 0.3, dur, { unit: sgn < 0 ? aL : aR, width: map.w * 0.04 });
      clashes.push(map.clash(0.5 + sgn * 0.23, 0.28, end + s2 * 0.3, A.id));
    } else if (kind === "pincer") {
      ar(Dd, [0.5, 0.32], null, [0.5, 0.52], 0, dur * 0.8, { unit: dC, width: map.w * 0.035 });
      ar(A, [0.5, 0.71], null, [0.5, 0.88], 0, dur * 0.6, { unit: aC, dashed: true });
      ar(A, [0.27, 0.7], [0.08, 0.45], [0.43, 0.4], s2, dur, { unit: aL, width: map.w * 0.035 });
      ar(A, [0.73, 0.7], [0.92, 0.45], [0.57, 0.4], s2, dur, { unit: aR, width: map.w * 0.035 });
      clashes.push(map.clash(0.5, 0.45, end + s2, A.id));
    } else if (kind === "feigned-retreat") {
      ar(A, [0.5, 0.71], null, [0.5, 0.86], 0, dur * 0.7, { unit: aC, dashed: true });
      ar(Dd, [0.5, 0.32], null, [0.5, 0.64], s2 * 0.3, dur * 0.85, { unit: dC, width: map.w * 0.035 });
      ar(A, [0.27, 0.7], [0.16, 0.62], [0.42, 0.62], s2 * 1.2, dur * 0.8, { unit: aL, width: map.w * 0.032 });
      ar(A, [0.73, 0.7], [0.84, 0.62], [0.58, 0.62], s2 * 1.2, dur * 0.8, { unit: aR, width: map.w * 0.032 });
      clashes.push(map.clash(0.5, 0.64, end + s2 * 0.3, A.id));
    } else if (kind === "envelopment") {
      ar(A, [0.5, 0.71], null, [0.5, 0.4], 0, dur * 0.7, { unit: aC, width: map.w * 0.03 });
      ar(A, [0.27, 0.7], [0.07, 0.35], [0.44, 0.12], s2 * 0.5, dur, { unit: aL, width: map.w * 0.034 });
      ar(A, [0.73, 0.7], [0.93, 0.35], [0.56, 0.12], s2 * 0.5, dur, { unit: aR, width: map.w * 0.034 });
      clashes.push(map.clash(0.5, 0.17, end + s2 * 0.5, A.id)); clashes.push(map.clash(0.5, 0.36, end - s2 * 0.4, A.id));
    } else if (kind === "breakthrough") {
      ar(A, [0.5, 0.72], null, [0.5, 0.1], 0, dur, { unit: aC, width: map.w * 0.05 });
      dL.move(at + dur * 0.35, dur * 0.6, -0.1, 0.02); dR.move(at + dur * 0.35, dur * 0.6, 0.1, 0.02); dC.move(at + dur * 0.3, dur * 0.5, -0.14, -0.04);
      clashes.push(map.clash(0.5, 0.3, at + dur * 0.45, A.id));
    } else {
      map.line({ faction: Dd, colour: cD, pts: [[0.18, 0.4], [0.35, 0.42], [0.5, 0.41], [0.65, 0.42], [0.82, 0.4]], at: Math.max(0.3, at - 0.8) });
      ar(A, [0.5, 0.71], null, [0.5, 0.47], 0, dur, { unit: aC, blunt: true, width: map.w * 0.035 });
      ar(A, [0.27, 0.7], null, [0.3, 0.48], s2 * 0.4, dur * 0.9, { unit: aL, blunt: true });
      ar(A, [0.73, 0.7], null, [0.7, 0.48], s2 * 0.4, dur * 0.9, { unit: aR, blunt: true });
      clashes.push(map.clash(0.5, 0.43, end + 0.05, Dd.id));
    }
    R.arrows = arrows; R.clashes = clashes; R.kind = kind; R.at = at; R.end = clashes.length ? clashes[0].at : end;
    R.focus = clashes.length ? { x: clashes[0].x, y: clashes[0].y } : { x: map.x + map.w / 2, y: map.y + map.h / 2 };
    return R;
  }

  // ------------------------- small props: wagons, crows, wreckage -------------------------
  function wagonShapes(cover) {
    var g = FL(), wood = "#6A4A2E";
    g.l([[30, -20], [62, -26]], shade(wood, -0.2), 2.4);
    g.f(P([[-42, -34], [32, -34], [30, -14], [-40, -14]], true), wood);
    g.f("M-40 -34 Q-38 -66 -6 -68 Q26 -66 30 -34 Z", cover || "#E2D6B8");
    g.l([[-30, -36], [-28, -62]], "#A89C82", 1, { hi: false, a: 0.7 }); g.l([[-6, -36], [-6, -66]], "#A89C82", 1, { hi: false, a: 0.7 }); g.l([[18, -36], [16, -62]], "#A89C82", 1, { hi: false, a: 0.7 });
    [[-26, -12], [18, -12]].forEach(function (c) { g.e(c[0], c[1], 12, 12, "#4A3220"); g.e(c[0], c[1], 9, 9, "#2A1E14", { tex: false }); for (var i = 0; i < 4; i++) { var a = (i / 4) * PI; g.l([[c[0] + Math.cos(a) * 9, c[1] + Math.sin(a) * 9], [c[0] - Math.cos(a) * 9, c[1] - Math.sin(a) * 9]], "#6A4A2E", 1.4, { hi: false }); } });
    return g;
  }
  function wagon(o) {
    o = obj(o);
    var w = ensure(), x = num(o.x, 0), y = num(o.y, 0), size = num(o.size, u(80)), unit = size / 100, facing = num(o.facing, 1) < 0 ? -1 : 1, parent = o.parent;
    var api = {
      collect: function (t, list) {
        var off = parent && parent.at ? parent.at(t) : { x: 0, y: 0 }, xx = x + off.x, yy = y + off.y, z = (w.camNow ? w.camNow.z * w.F : 1), pu = ppuFor(unit * z);
        var walking = parent && parent.moving ? parent.moving(t) : false, ph = walking ? Math.floor(t * 0.95 * WALK_N) % WALK_N : 0;
        list.push({ z: yy, sp: sprite("wg|" + (o.cover || ""), [-50, -72, 66, 4], pu, function () { return wagonShapes(o.cover); }), x: xx, y: yy, s: unit, flip: facing < 0 });
        list.push({ z: yy + 0.1, sp: horseSprite(null, o.horse || "#6A4426", walking ? "walk" : "stand", ph, 0, pu, { saddle: "#3A2A1A" }), x: xx + facing * 96 * unit, y: yy, s: unit, flip: facing < 0 });
      },
    };
    addItem(o.layer || "ground", api);
    return api;
  }
  function crows(o) {
    o = obj(o);
    var w = ensure(), n = Math.round(num(o.n, 6)), r = rng(num(o.seed, 5)), birds = [];
    for (var i = 0; i < n; i++) birds.push({ x: w.ww * (0.1 + r() * 0.8), y: w.hz * (0.35 + r() * 0.45), v: u(20 + r() * 30) * (r() < 0.7 ? 1 : -1), ph: r() * TAU, s: u(9 + r() * 7), cy: r() * TAU });
    addItem(o.layer || "far", { collect: function (t, list) {
      list.push({ z: 1e6, fn: function (ctx) {
        ctx.strokeStyle = "#1A1410"; ctx.lineCap = "round"; ctx.lineJoin = "round";
        birds.forEach(function (b) {
          var x = b.x + b.v * t + Math.sin(t * 0.4 + b.cy) * u(30), y = b.y + Math.sin(t * 0.7 + b.cy) * u(14), fl = Math.sin(t * 7 + b.ph), s = b.s;
          ctx.lineWidth = Math.max(1, s * 0.22); ctx.globalAlpha = 0.85;
          ctx.beginPath(); ctx.moveTo(x - s, y - fl * s * 0.6); ctx.quadraticCurveTo(x - s * 0.4, y - s * 0.2 - fl * s * 0.2, x, y); ctx.quadraticCurveTo(x + s * 0.4, y - s * 0.2 - fl * s * 0.2, x + s, y - fl * s * 0.6); ctx.stroke();
        });
      } });
    } });
  }
  // Static wreckage painted into the ground layer (gets the oil pass): broken wheel, drum, stray musket.
  function wreckage(x, y, s, kind) {
    var p = penOf(ensure().layers.ground.g), c = "#4A3220";
    if (kind === "wheel") {
      p.fill(ellD(x, y, s, s * 0.32), "#2A1E14", 0.4);
      p.stroke(ellD(x, y - s * 0.06, s * 0.9, s * 0.3), c, s * 0.12, 1);
      for (var i = 0; i < 5; i++) { var a = (i / 5) * PI + 0.3; p.stroke(P([[x, y - s * 0.06], [x + Math.cos(a) * s * 0.8 * (i === 2 ? 0.4 : 1), y - s * 0.06 + Math.sin(a) * s * 0.26]]), c, s * 0.06, 1); }
      p.ellipse(x, y - s * 0.06, s * 0.12, s * 0.06, "#2A1E14", 1);
    } else if (kind === "drum") {
      p.fill(ellD(x, y + s * 0.1, s * 0.7, s * 0.2), "#2A1E14", 0.35);
      p.fill(rectD(x - s * 0.5, y - s * 0.55, s, s * 0.55), "#8E2A1E", 1);
      p.ellipse(x, y - s * 0.55, s * 0.5, s * 0.16, "#D8CCB0", 1);
      p.stroke(P([[x - s * 0.5, y - s * 0.5], [x - s * 0.2, y], [x + s * 0.1, y - s * 0.5], [x + s * 0.4, y]]), "#C8A048", s * 0.04, 1);
    } else {
      p.stroke(P([[x - s, y], [x + s, y - s * 0.1]]), c, s * 0.08, 1);
    }
  }

  // ------------------------- template helpers -------------------------
  function sideSpec(v, def) { v = typeof v === "string" ? { faction: v } : obj(v); var f = guessFaction(v.faction || v.name || def, def); return { faction: f, name: str(v.name), count: num(v.count, 0) }; }
  function twoSides(a, b, defA) {
    var L = sideSpec(a, defA || "redcoat"), R = sideSpec(b, enemyOf(L.faction));
    var variant = R.faction === L.faction ? 1 : 0;
    return { L: L, R: R, FL: faction(L.faction), FR: faction(R.faction, variant), rv: variant };
  }
  function lowerFrom(props, at, end) { var pl = str(props.place), dt = str(props.date); if (pl || dt) return lowerThird(pl || dt, { sub: pl ? dt : "", at: at, end: end }); return null; }
  // Ground lines and sizes for a two-army field (perspective aware).
  function field() {
    var w = WD, hz = w.hz, span = w.wh - hz;
    var gyF = PORT ? hz + span * 0.45 : hz + span * 0.58, gyB = PORT ? hz + span * 0.22 : hz + span * 0.48;
    var k = PORT ? H * 0.066 : H * 0.08, sF = k * persp(gyF), sB = k * persp(gyB);
    return { gyF: gyF, gyB: gyB, sF: sF, sB: sB, k: k };
  }
  function ambient(o) {
    o = o || {};
    var w = WD;
    haze({ n: 4, opacity: num(o.haze, 0.22) });
    if (o.columns !== false) [0.16, 0.84].forEach(function (f, i) { smoke({ layer: "far", x: w.ww * f, y: w.hz + u(4), size: u(70), life: 7, n: 10, dir: [0.25, -1], speed: u(22), wind: u(8), opacity: 0.45, color: i ? "#9A9488" : "#B0A898", seed: 31 + i }); });
  }
  var TPL = {};

  TPL["battle-scene"] = function (root, p) {
    var sd = twoSides(p.left, p.right, "redcoat"), att = str(p.attacker) === "right" ? "right" : "left", action = str(p.action) || "volley";
    if (["volley", "charge", "cannonade", "advance", "clash", "stand"].indexOf(action) < 0) action = "volley";
    scene(root, { sky: p.sky, terrain: p.terrain });
    ambient();
    var w = WD, fd = field(), cav = str(p.cavalry);
    var xL = PORT ? w.ww * 0.36 : w.ww * 0.27, xR = PORT ? w.ww * 0.68 : w.ww * 0.73;
    var cntF = PORT ? 33 : SQ ? 40 : 64, cntB = PORT ? 39 : SQ ? 44 : 64, rk = PORT || SQ ? 3 : 4;
    var left = army({ faction: sd.FL, x: xL, y: fd.gyF, size: fd.sF, count: cav === "left" ? (PORT ? 9 : 16) : cntF, ranks: cav === "left" ? 2 : rk, facing: 1, cavalry: cav === "left", drummer: true, seed: 11 });
    var right = army({ faction: sd.FR, x: xR, y: fd.gyB, size: fd.sB, count: cav === "right" ? (PORT ? 12 : 16) : cntB, ranks: cav === "right" ? 2 : rk, facing: -1, cavalry: cav === "right", seed: 12 });
    var A = att === "left" ? left : right, B = att === "left" ? right : left;
    var ry = w.hz + (w.wh - w.hz) * 0.1, rs = fd.k * persp(ry);
    [[0.12, sd.FL, 1], [0.34, sd.FL, 1], [0.7, sd.FR, -1], [0.9, sd.FR, -1]].forEach(function (q, i) { army({ faction: q[1], x: w.ww * q[0], y: ry + (i % 2) * rs * 0.4, size: rs, count: 24, ranks: 3, facing: q[2], layer: "mid", flags: 1, officer: false, seed: 30 + i }); });
    smoke({ layer: "mid", x: w.ww * 0.52, y: ry, size: u(60), life: 6, n: 8, dir: [0.4, -0.6], speed: u(16), opacity: 0.4, seed: 33 });
    var guns = [];
    if (p.cannons !== false) {
      guns.push(cannon({ faction: sd.FL, x: PORT ? w.ww * 0.1 : w.ww * 0.07, y: fd.gyF - fd.sF * 0.5, size: fd.sF * 0.95, facing: 1 }));
      guns.push(cannon({ faction: sd.FR, x: PORT ? w.ww * 0.93 : w.ww * 0.95, y: fd.gyB - fd.sB * 0.3, size: fd.sB * 0.95, facing: -1 }));
    }
    var gA = att === "left" ? guns[0] : guns[1], gB = att === "left" ? guns[1] : guns[0];
    var tK = keyTime(p.keyword, 0.45, 2.2, p.title);
    var gapX = Math.abs((xR - right.w / 2) - (xL + left.w / 2)), dyAB = fd.gyB - fd.gyF;
    var contact = { x: (xL + left.w / 2 + xR - right.w / 2) / 2, y: (fd.gyF + fd.gyB) / 2 };
    var dir = att === "left" ? 1 : -1;
    var lim = endLimit();
    if (action === "volley") {
      A.volley(tK); if (tK + 1.9 < lim) A.volley(tK + 1.8);
      if (gA && tK + 0.6 < lim) gA.fire(tK + 0.5);
      B.march(0.3, Math.max(0.5, tK - 0.8), -dir * gapX * 0.12, 0);
    } else if (action === "charge") {
      var chD = clamp(lim - tK - 0.2, 0.8, 1.8), sy = (att === "left" ? 1 : -1) * dyAB;
      A.march(0.3, Math.max(0.5, tK - 0.5), dir * gapX * 0.1, sy * 0.06);
      A.charge(tK, chD, gapX * 0.66, sy * 0.42);
      if (!B.cavalry) B.volley(tK + 0.2);
      var cx0 = A.x + dir * (A.w / 2 + gapX * 0.74), cy0 = A.y + sy * 0.48;
      [-0.35, 0, 0.35].forEach(function (f, i) { smoke({ x: cx0 + f * A.w * 0.5, y: cy0 + f * sy * 0.2, burst: true, n: 6, at: Math.min(lim, tK + chD * (0.82 + i * 0.06)), size: fd.sF * 1.0, life: 3.2, color: "#C2AE8C", dir: [-dir * 0.3, -1], speed: fd.sF * 0.5, z: cy0 + 1e4, opacity: 0.8 }); });
      contact = { x: cx0, y: cy0 };
      if (gB && tK > 1.2) gB.fire(tK - 0.8);
    } else if (action === "cannonade") {
      var shots = [tK, tK + 0.65, tK + 1.3, tK + 1.95].filter(function (t) { return t < lim; });
      shots.forEach(function (t, i) {
        var gun = i % 2 === 0 ? gA : gB === gA ? gA : gA; if (gun) gun.fire(t);
        var bx = B.x + (i % 3 - 1) * B.w * 0.3, by = B.y + (B === right ? -fd.sB * 0.2 : fd.sF * 0.15);
        smoke({ x: bx, y: by, burst: true, n: 6, at: t + 0.45, size: B.size * 0.9, life: 2.6, color: "#A08A68", dir: [0, -1], speed: B.size * 1.2, z: by + 1e4, opacity: 0.85 });
      });
      if (!gA) A.volley(tK);
    } else if (action === "advance") {
      A.march(0.2, lim - 0.2, dir * gapX * 0.55, (att === "left" ? 1 : -1) * dyAB * 0.4);
      B.volley(tK); if (tK + 1.8 < lim) B.volley(tK + 1.7);
      if (gB) gB.fire(tK + 0.4);
    } else if (action === "clash") {
      var cd = clamp(lim - tK - 0.2, 0.8, 1.6);
      left.charge(tK, cd, gapX * 0.5, dyAB * 0.45); right.charge(tK, cd, gapX * 0.5, -dyAB * 0.45);
      smoke({ x: contact.x, y: contact.y, burst: true, n: 9, at: tK + cd * 0.9, size: fd.sF * 1.2, life: 3, color: "#B8A080", dir: [0, -1], speed: fd.sF * 0.5, z: contact.y + 1e4 });
    } else {
      A.setPose("aim", tK, 1e9);
      B.march(0.3, lim - 0.3, -dir * gapX * 0.4, (att === "left" ? -1 : 1) * dyAB * 0.3);
      if (gB) gB.fire(tK + 0.6);
    }
    var aFx = (A.x + dir * A.w * 0.2) / w.ww, aFy = (A.y - A.size * 0.6) / w.wh;
    camera.panZoom(0, tK, { from: { fx: 0.5, fy: 0.5, zoom: 1.03 }, to: { fx: lerp(0.5, aFx, 0.45), fy: lerp(0.5, aFy, 0.4), zoom: PORT ? 1.1 : 1.16 } });
    var endFx = action === "volley" || action === "stand" ? lerp(0.5, (B.x) / w.ww, 0.35) : contact.x / w.ww, endFy = (action === "volley" ? B.y - B.size : contact.y - fd.sF * 0.4) / w.wh;
    camera.to(endFx * w.ww, endFy * w.wh, PORT ? 1.16 : 1.24, tK + 0.1, Math.max(0.6, lim - tK - 0.1));
    if (action === "volley" || action === "cannonade") camera.shake(tK + 0.15, 5, 0.5);
    var tB = Math.min(tK + 0.55, Math.max(0.6, D - 1.6));
    if (str(p.title)) banner(p.title, { at: tB, pos: "top" });
    lowerFrom(p, 0.5);
  };

  TPL["versus-numbers"] = function (root, p) {
    var sd = twoSides(p.left, p.right, "hoplite");
    scene(root, { sky: p.sky, terrain: p.terrain });
    ambient({ haze: 0.18 });
    var w = WD, fd = field(), cL = Math.max(1, sd.L.count || 1000), cR = Math.max(1, sd.R.count || 1000), big = Math.max(cL, cR);
    var nL = Math.round(clamp(30 + 70 * Math.sqrt(cL / big), 20, PORT || SQ ? 60 : 100)), nR = Math.round(clamp(30 + 70 * Math.sqrt(cR / big), 20, PORT || SQ ? 60 : 100));
    var xL = PORT ? w.ww * 0.32 : w.ww * 0.26, xR = PORT ? w.ww * 0.7 : w.ww * 0.72;
    var gyF = PORT ? w.hz + (w.wh - w.hz) * 0.5 : fd.gyF, gyB = PORT ? w.hz + (w.wh - w.hz) * 0.28 : fd.gyB;
    var left = army({ faction: sd.FL, x: xL, y: gyF, size: fd.k * persp(gyF), count: nL, ranks: Math.max(3, Math.round(nL / (PORT ? 9 : SQ ? 12 : 22))), facing: 1, seed: 21 });
    var right = army({ faction: sd.FR, x: xR, y: gyB, size: fd.k * persp(gyB), count: nR, ranks: Math.max(3, Math.round(nR / (PORT ? 11 : SQ ? 13 : 24))), facing: -1, seed: 22 });
    var tK = keyTime(p.keyword, 0.4, 2.4);
    left.setPose("aim", tK + 0.2, 1e9);
    right.march(0.3, Math.max(0.6, endLimit() - 0.5), -w.ww * 0.03, 0);
    camera.panZoom(0, D, { from: { fx: 0.5, fy: 0.5, zoom: 1.02 }, to: { fx: 0.5, fy: PORT ? 0.56 : 0.55, zoom: PORT ? 1.08 : 1.14 } });
    var vs = versus({ count: sd.L.count, label: sd.L.name || sd.FL.name, faction: sd.FL }, { count: sd.R.count, label: sd.R.name || sd.FR.name, faction: sd.FR }, { at: tK, countDur: 1.3 });
    var tT = Math.min(tK + 1.9, D - 1.5), hasTitle = !!str(p.title) && tT > tK + 0.8;
    lowerFrom(p, 0.4);
    if (hasTitle) banner(p.title, { at: tT, y: vs.bottom + u(PORT ? 36 : 30), slam: true, size: PORT ? u(84) : u(72) });
  };

  TPL["battle-map"] = function (root, p) {
    var att = sideSpec(p.attacker, "roman"), def = sideSpec(p.defender, enemyOf(att.faction));
    scene(root, { bare: true, drift: 0.5 });
    WD.pal = palette("golden", "plain");
    deskBackdrop();
    var sf = SAFE(), mx, my, mw, mh;
    if (PORT) { mw = sf.x1 - sf.x0; mh = Math.min((sf.y1 - sf.y0) * 0.86, mw * 1.15); mx = sf.x0; my = sf.y0 + u(20); }
    else { mw = W * 0.84; mh = H * 0.84; mx = (W - mw) / 2; my = (H - mh) / 2; }
    var towns = arr(p.towns).slice(0, 4).map(str).filter(Boolean);
    var tpos = [[0.2, 0.18], [0.8, 0.84], [0.17, 0.86], [0.83, 0.5]];
    var map = battleMap({ x: mx, y: my, w: mw, h: mh, title: p.title, at: 0, terrain: { river: p.river !== false, coast: !!p.coast, towns: towns.map(function (n, i) { return { name: n, fx: tpos[i][0], fy: tpos[i][1] }; }) } });
    var tK = keyTime(p.keyword, 0.45, 2.4);
    var Fa = faction(att.faction), Fd = faction(def.faction, def.faction === att.faction ? 1 : 0);
    var R = manoeuvre(map, p.manoeuvre || "frontal", { attacker: Fa, defender: Fd, at: tK, attackerLabel: att.name || Fa.name, defenderLabel: def.name || Fd.name, from: 0.3 });
    camera.panZoom(0, tK, { from: { fx: 0.5, fy: 0.5, zoom: 1.0 }, to: { fx: 0.5, fy: 0.52, zoom: 1.04 } });
    var push = p.zoom !== false, tc2 = Math.min(R.end, endLimit() - 0.4);
    if (push) map.boxes.forEach(function (b) { b.to = tc2 - 0.2; });
    if (push) camera.to(lerp(map.x + map.w / 2, R.focus.x, 0.55), lerp(map.y + map.h / 2, R.focus.y, 0.55), PORT ? 1.22 : 1.3, tc2 - 0.2, Math.max(0.6, endLimit() - tc2 + 0.5));
    var tB = Math.min(tc2 + 0.3, D - 1.4), hasB = !!str(p.banner);
    var lt = str(p.place) || str(p.date) ? lowerFrom(p, 0.5, hasB ? tB - 0.2 : null) : null;
    void lt;
    if (hasB) banner(p.banner, { at: tB, pos: "bottom" });
  };

  TPL["general-council"] = function (root, p) {
    var cmd = arr(p.commanders).slice(0, 4).map(function (c) { return sideSpec(c, "bluecoat"); });
    if (!cmd.length) cmd = [sideSpec("bluecoat")];
    var setting = str(p.setting) === "hall" ? "hall" : "tent", n = cmd.length, spk = clamp(Math.round(num(p.speaker, 0)), 0, n - 1);
    scene(root, { bare: true, drift: 0.7 });
    interior({ kind: setting });
    var w = WD, lim = endLimit();
    var tw = PORT ? w.ww * 0.98 : w.ww * 0.62, ty = PORT ? w.wh * 0.67 : w.wh * 0.8;
    var tb = table({ x: w.ww / 2, y: ty, w: tw, candles: 2, faction: cmd[0].faction });
    var gs = PORT ? H * (n > 2 ? 0.225 : 0.28) : H * 0.36, span = PORT ? w.ww * (n > 2 ? 0.7 : 0.5) : Math.min(w.ww * 0.62, gs * 0.95 * n), gens = [];
    cmd.forEach(function (c, i) {
      var f = n === 1 ? 0.5 : i / (n - 1), gx = w.ww / 2 + (f - 0.5) * span, facing = gx < w.ww / 2 - 1 ? 1 : gx > w.ww / 2 + 1 ? -1 : (i === spk ? 1 : -1);
      gens.push(general({ faction: c.faction, x: gx, y: tb.top.y + gs * 0.06, size: gs * (i === spk ? 1.04 : 0.98), facing: n === 1 ? 1 : facing, seed: hstr(c.name || c.faction + i), name: c.name }));
    });
    var tK = keyTime(p.keyword, 0.6, 1.6), sp = speechSpan();
    var G = gens[spk];
    G.speak(Math.max(0.3, sp.start), Math.max(sp.start + 1, tK - 0.2)).point(Math.max(0.5, tK - 1.2), tK + 1.2);
    gens.forEach(function (g, i) { if (i !== spk) { g.nod(Math.min(lim, tK + 0.3 + i * 0.25)); g.nod(Math.max(0.6, tK - 1.6 + i * 0.3)); } });
    var focusMap = str(p.focus) !== "commanders";
    camera.panZoom(0, tK, { from: { fx: 0.5, fy: PORT ? 0.52 : 0.48, zoom: 1.02 }, to: { fx: lerp(0.5, G.x / w.ww, 0.3), fy: PORT ? 0.53 : 0.47, zoom: 1.08 } });
    if (focusMap) camera.to(tb.map.x + tb.map.w * 0.5, tb.map.y + tb.map.h * (PORT ? 0.9 : 0.75), PORT ? 1.75 : 1.7, tK + 0.2, Math.max(0.8, lim - tK));
    else camera.to(G.x, G.y - G.size * 0.55, 1.22, tK + 0.2, Math.max(0.8, lim - tK));
    // Lower third first, then each commander's name on a parchment card at the table edge (never both at once).
    var hasLT = !!(str(p.place) || str(p.date)), ltEnd = hasLT ? Math.min(tK - 0.1, Math.max(1.9, Math.min(2.6, tK - 1.6))) : 0;
    if (hasLT) lowerFrom(p, 0.4, ltEnd);
    var tagFrom = hasLT ? ltEnd + 0.35 : 0.6, tagTo = Math.max(tagFrom + 1.4, tK + 0.1);
    if (tagTo > lim + 0.5) tagTo = lim + 0.5;
    var tagY = tb.y + tb.w * 0.045, sf = SAFE();
    cmd.forEach(function (c, i) {
      var nm = str(c.name); if (!nm || tagFrom > lim - 0.6) return;
      var g = gens[i], at2 = tagFrom + i * 0.18;
      var el = ovDiv("ph-tag"), lay = layoutText(nm, { size: PORT ? u(32) : u(30), maxW: PORT ? (sf.x1 - sf.x0) / Math.max(2, n) - u(16) : u(320), maxLines: 2, minSize: u(18), italic: true, weight: 400, family: SERIF2, lh: 1.15 });
      var bw = lay.w + u(30), bh = lay.h + u(14), p0 = toScreen(g.x, tagY, 0), sx = clamp(p0[0], sf.x0 + bw / 2, sf.x1 - bw / 2), sy = Math.min(p0[1], sf.y1 - bh - u(6));
      place(el, sx - bw / 2, sy, bw, bh);
      var pc = parchment(bw, bh, { seed: 70 + i, rule: false, shadow: true }); pc.className = "ph-parch"; place(pc, -pc._pad, -pc._pad, pc.width, pc.height); el.appendChild(pc);
      var tx = textLines(el, lay, { italic: true, weight: 400, family: SERIF2, color: "#3A2814" }); place(tx, 0, u(7), bw, lay.h);
      up(function (t) { var vis = t >= at2 && t < tagTo + 0.4; show(el, vis); if (!vis) return; var k = outC(prog(t, at2, 0.4)) * (1 - prog(t, tagTo, 0.35)); setS(el, "opacity", f2(k)); setS(el, "transform", "translate(0px," + f1((1 - outC(prog(t, at2, 0.4))) * u(10)) + "px)"); });
      addBox("name-tag", nm, at2 + 0.3, tagTo, function () { return { x: sx - bw / 2, y: sy, w: bw, h: bh }; });
    });
    if (str(p.decision)) banner(p.decision, { at: tK, pos: "top", slam: true });
  };

  TPL.march = function (root, p) {
    var F = faction(sideSpec(p.army, "bluecoat").faction), dirn = str(p.direction) === "left" ? -1 : 1;
    var ww = W * (PORT ? 2.4 : 2.2);
    scene(root, { sky: p.sky || (str(p.weather) === "snow" ? "winter" : "dusk"), terrain: p.terrain, width: ww, road: "across", roadY: (PORT ? H * 0.44 : H * 0.5) + (H - (PORT ? H * 0.44 : H * 0.5)) * (PORT ? 0.3 : 0.42), roadW: u(PORT ? 110 : 90), mill: false });
    ambient({ haze: 0.2, columns: false });
    var w = WD, roadY = w.road ? w.road[Math.floor(w.road.length / 2)][1] : w.hz + (w.wh - w.hz) * 0.42;
    var size = (PORT ? H * 0.055 : H * 0.085) * persp(roadY + u(10)), lim = endLimit();
    var speed = size * 0.75, dist = speed * D, cnt = PORT ? 48 : 66, sp = size * 0.36, colLen = (cnt / 3) * sp;
    var x0 = dirn > 0 ? w.ww * 0.3 : w.ww * 0.7;
    var col = army({ faction: F, x: x0, y: roadY + size * 0.2, size: size, count: cnt, ranks: 3, spacing: sp, rankGap: size * 0.09, facing: dirn, flags: 2, drummer: true, seed: 41 });
    col.march(0, D + 0.5, dirn * dist, 0);
    var cav = null;
    if (p.cavalry !== false) { cav = army({ faction: F, x: x0 + dirn * (colLen / 2 + size * 1.6), y: roadY + size * 0.12, size: size, count: 5, ranks: 1, spacing: size * 0.9, facing: dirn, cavalry: true, flags: 0, seed: 42 }); cav.march(0, D + 0.5, dirn * dist, 0); }
    var parent = { at: function (t) { return col.at(t); }, moving: function (t) { return t < D + 0.5; } };
    wagon({ x: x0 - dirn * (colLen / 2 + size * 1.2), y: roadY + size * 0.25, size: size, facing: dirn, parent: parent, cover: "#DCCFAE" });
    wagon({ x: x0 - dirn * (colLen / 2 + size * 3.1), y: roadY + size * 0.22, size: size * 0.98, facing: dirn, parent: parent, cover: "#C8BC9C" });
    if (str(p.weather) === "snow" || str(p.weather) === "rain") weather(str(p.weather));
    smoke({ x: x0, y: roadY + size * 0.3, size: size * 0.8, life: 3, n: 10, dir: [-dirn * 0.6, -0.4], speed: size * 0.3, color: "#C8B898", opacity: 0.35, z: roadY + 1e4, seed: 7, wind: -dirn * u(6) });
    var tK = keyTime(p.keyword, 0.5, 1.4);
    var z0 = PORT ? 1.22 : 1.28;
    camera.track(function (t) { var o = col.at(t); return { x: x0 + o.x + dirn * size * 0.8, y: roadY - size * 0.6, zoom: z0 }; }, 0, 0);
    camera.track(function (t) { var o = col.at(t); return { x: x0 + o.x - dirn * size * 0.4, y: PORT ? roadY + size * 0.6 : roadY - size * 1.1, zoom: PORT ? 1.08 : 1.0 }; }, tK, Math.max(0.8, Math.min(2.2, lim - tK)));
    if (str(p.title)) banner(p.title, { at: Math.min(tK + 0.35, D - 1.6), pos: "top" });
    lowerFrom(p, 0.5);
  };

  TPL.siege = function (root, p) {
    var df = sideSpec(p.defender, "knight"), atk = sideSpec(p.attacker, enemyOf(df.faction));
    var FD = faction(df.faction), FA = faction(atk.faction, atk.faction === df.faction ? 1 : 0), side = str(p.side) === "left" ? -1 : 1;
    scene(root, { sky: p.sky || "dusk", terrain: p.terrain });
    ambient({ haze: 0.2 });
    var w = WD, hz = w.hz, span = w.wh - hz, lim = endLimit();
    var fgy = PORT ? hz + span * 0.2 : hz + span * 0.28, fw = PORT ? w.ww * 0.78 : w.ww * 0.4, fh = PORT ? H * 0.08 : H * 0.15;
    var fx = side > 0 ? (PORT ? w.ww * 0.2 : w.ww * 0.55) : (PORT ? w.ww * 0.02 : w.ww * 0.05);
    var ft = fortress(w.layers.ground.g, fx, fgy, fw, fh, { towers: PORT ? 3 : 3, roofs: p.roofs !== false }, rng(9));
    var unitS = fh / (PORT ? 1.25 : 1.4), defs = army({ faction: FD, x: fx + fw * 0.5, y: ft.wallTop + unitS * 0.08, size: unitS * 0.55, count: PORT ? 10 : 16, ranks: 1, spacing: fw / (PORT ? 11 : 17), facing: -side, flags: 1, officer: false, persp: false, seed: 51 });
    addItem("ground", { collect: function (t, list) { list.push({ z: ft.wallTop + unitS * 0.2, fn: function (ctx) { var mw = fw / Math.max(6, Math.round(fw / (fh * 0.16))), st = w.pal.wall; ctx.fillStyle = brushPattern(ctx, shade(st, -0.04)); ctx.fillRect(fx, ft.wallTop - fh * 0.005, fw, unitS * 0.26); ctx.fillStyle = brushPattern(ctx, shade(st, -0.16)); for (var cx = fx; cx < fx + fw - mw * 0.5; cx += mw * 2) ctx.fillRect(cx, ft.wallTop - fh * 0.09, mw, fh * 0.09 + 1); ctx.fillStyle = "rgba(20,12,6,0.35)"; ctx.fillRect(fx, ft.wallTop + unitS * 0.24, fw, u(3)); } }); } });
    if (p.burning !== false && ft.towers.length) { var tw = ft.towers[side > 0 ? ft.towers.length - 1 : 0]; fire({ x: tw.x + tw.w * 0.5, y: tw.top + tw.h * 0.12, size: tw.w * 0.6, at: 0, z: fgy + 5 }); }
    var agy = PORT ? hz + span * 0.48 : hz + span * 0.62, aS = (PORT ? H * 0.058 : H * 0.084) * persp(agy), ax = side > 0 ? (PORT ? w.ww * 0.42 : w.ww * 0.26) : (PORT ? w.ww * 0.6 : w.ww * 0.74);
    var atkA = army({ faction: FA, x: ax, y: agy, size: aS, count: PORT ? 27 : 54, ranks: 3, facing: side, flags: 1, seed: 52 });
    var guns = [];
    for (var i = 0; i < 3; i++) { var gyy = agy - aS * (0.55 + i * 0.22), gx = ax + side * (atkA.w * 0.5 + aS * (0.9 + i * 1.0)); guns.push(cannon({ faction: FA, x: gx, y: gyy, size: aS * 0.9 * persp(gyy) / persp(agy), facing: side })); }
    var tK = keyTime(p.keyword, 0.3, 2.6);
    var hitX = function (i) { return fx + fw * (side > 0 ? 0.22 + i * 0.22 : 0.78 - i * 0.22); };
    [0, 0.55, 1.1].forEach(function (d, i) {
      var t = tK + d; if (t > lim) return;
      guns[i % guns.length].fire(t);
      smoke({ x: hitX(i), y: fgy - fh * 0.5, burst: true, n: 7, at: t + 0.4, size: fh * 0.55, life: 2.8, color: "#A8987C", dir: [0, -1], speed: fh * 0.9, z: fgy + 10, opacity: 0.9 });
    });
    camera.shake(tK + 0.4, 6, 0.6);
    defs.volley(Math.max(0.8, tK - 1.2));
    var tA = tK + 1.7, assault = p.assault !== false && tA + 0.8 < lim;
    if (assault) {
      var arrX = fx + fw * (side > 0 ? 0.22 : 0.78), dist = Math.abs(arrX - ax), cdur = clamp(lim - tA, 0.8, 2.0);
      atkA.charge(tA, cdur, dist, (fgy - agy) * 0.9);
      defs.volley(tA + 0.3);
      addItem("ground", { collect: function (t, list) {
        if (t < tA + cdur * 0.7) return;
        var pp = outC(prog(t, tA + cdur * 0.7, 0.5));
        list.push({ z: fgy + 2, fn: function (ctx) {
          ctx.strokeStyle = "#5A3A22"; ctx.lineCap = "round"; ctx.lineWidth = Math.max(1, fh * 0.03);
          [0.1, 0.24, 0.38].forEach(function (f) { var lx = fx + fw * (side > 0 ? f : 1 - f), top = ft.wallTop + fh * 0.05, bot = fgy + fh * 0.12, sp2 = fh * 0.12, lean = side * fh * 0.3 * pp; ctx.beginPath(); ctx.moveTo(lx - lean - sp2 / 2, bot); ctx.lineTo(lx - sp2 / 2, lerp(bot, top, pp)); ctx.moveTo(lx - lean + sp2 / 2, bot); ctx.lineTo(lx + sp2 / 2, lerp(bot, top, pp)); ctx.stroke(); for (var k2 = 1; k2 < 6; k2++) { var q = k2 / 6; if (q > pp) break; ctx.beginPath(); ctx.moveTo(lerp(lx - lean - sp2 / 2, lx - sp2 / 2, q), lerp(bot, top, q)); ctx.lineTo(lerp(lx - lean + sp2 / 2, lx + sp2 / 2, q), lerp(bot, top, q)); ctx.stroke(); } });
        } });
      } });
    }
    camera.panZoom(0, tK, { from: { fx: 0.5, fy: 0.5, zoom: 1.02 }, to: { fx: (fx + fw * 0.5) / w.ww * 0.5 + 0.25, fy: PORT ? 0.48 : 0.5, zoom: 1.1 } });
    camera.to((fx + fw * 0.5 + ax) / 2, (fgy + agy) / 2 - aS, PORT ? 1.14 : 1.2, tK + 0.2, Math.max(0.6, lim - tK - 0.2));
    if (str(p.title)) banner(p.title, { at: Math.min(tK + 0.7, D - 1.6), pos: "top" });
    lowerFrom(p, 0.5);
  };

  TPL["title-banner"] = function (root, p) {
    var sd = twoSides(p.left || "redcoat", p.right, "redcoat");
    scene(root, { sky: p.sky, terrain: p.terrain, letterbox: 0.085 });
    ambient({ haze: 0.25 });
    var w = WD, fd = field();
    var a = army({ faction: sd.FL, x: w.ww * (PORT ? 0.32 : 0.26), y: fd.gyF, size: fd.sF * 0.9, count: PORT ? 30 : 60, ranks: 3, facing: 1, seed: 61 });
    var b = army({ faction: sd.FR, x: w.ww * (PORT ? 0.7 : 0.74), y: fd.gyB, size: fd.sB * 0.9, count: PORT ? 33 : 60, ranks: 3, facing: -1, seed: 62 });
    var g1 = cannon({ faction: sd.FR, layer: "mid", x: w.ww * 0.82, y: w.hz + (w.wh - w.hz) * 0.12, size: fd.k * 0.45, facing: -1, crew: 1, shake: 1 });
    var g2 = cannon({ faction: sd.FL, layer: "mid", x: w.ww * 0.14, y: w.hz + (w.wh - w.hz) * 0.13, size: fd.k * 0.45, facing: 1, crew: 1, shake: 1 });
    [1.0, 2.6, 4.2, 5.8, 7.4].forEach(function (t, i) { if (t < endLimit()) (i % 2 ? g2 : g1).fire(t); });
    b.march(0.4, Math.max(0.6, endLimit() - 0.4), -w.ww * 0.03, 0);
    void a;
    fadeIn(0, 0.7, { paper: true });
    var tK = keyTime(p.keyword, 0.25, 2.2);
    camera.panZoom(0, D, { from: { fx: 0.5, fy: 0.5, zoom: 1.12 }, to: { fx: 0.5, fy: 0.52, zoom: 1.02 } });
    titleCard(p.title || "Chapter", { kicker: p.chapter, sub: p.subtitle, date: p.date, at: Math.max(0.3, tK - 0.5), titleAt: tK });
    if (str(p.place)) lowerThird(p.place, { at: Math.min(tK + 1.2, D - 1.4), y: PORT ? null : H - H * 0.085 - u(18) - u(100) });
  };

  TPL["portrait-of-commander"] = function (root, p) {
    var F = faction(sideSpec(p.faction || "redcoat").faction), seed = hstr(str(p.name) || "commander");
    scene(root, { sky: p.sky || "dusk", terrain: p.terrain || "hills" });
    ambient({ haze: 0.22, columns: false });
    var w = WD, sf = SAFE(), hz = w.hz;
    var marchY = hz + (w.wh - hz) * (PORT ? 0.12 : 0.14), ms = (PORT ? H * 0.05 : H * 0.075) * persp(marchY);
    var col = army({ faction: F, x: w.ww * 0.5, y: marchY, size: ms, count: 60, ranks: 3, spacing: ms * 0.34, facing: 1, flags: 2, layer: "mid", seed: 71 });
    col.march(0, D + 0.5, ms * 0.6 * D, 0);
    var pw, pcx, pcy, q0 = str(p.quote);
    if (PORT) { var avail = (sf.y1 - sf.y0) - u(330) - (q0 ? u(200) : 0); pw = Math.min((sf.x1 - sf.x0) * 0.66, avail / 1.32); pcx = W / 2; pcy = sf.y0 + u(10) + pw * 0.64; }
    else if (SQ) { pw = W * 0.42; pcx = W * 0.27; pcy = H * 0.49; }
    else { pw = H * 0.6; pcx = W * 0.33; pcy = H * 0.49; }
    var pt = portrait({ cx: pcx, cy: pcy, w: pw, faction: F, seed: seed, hat: p.hat });
    var tK = keyTime(p.keyword, 0.3, 2.0, p.name);
    var P0 = { x: pcx, y: pcy - pw * 0.12 }, Z = PORT ? 1.06 : 1.14;
    camera.to(P0.x + (w.ww / 2 - P0.x) / Z, P0.y + (w.wh / 2 - P0.y) / Z, Z, 0, D);
    var plateX, plateY, plateW;
    var nm = caps(p.name || "The Commander"), role = str(p.role), dates = str(p.dates);
    if (PORT) { plateW = (sf.x1 - sf.x0) * 0.92; plateX = W / 2 - plateW / 2; plateY = pcy + pw * 0.64 * Z + u(40); }
    else if (SQ) { plateW = W * 0.4; plateX = W * 0.53; plateY = H * 0.3; }
    else { plateW = W * 0.36; plateX = W * 0.57; plateY = H * 0.3; }
    var nl = layoutText(nm, { size: PORT ? u(74) : u(76), maxW: plateW - u(70), maxLines: 2, minSize: u(36), lh: 1.05, ls: 0.03 });
    var rl = role ? layoutText(role, { size: PORT ? u(38) : u(34), maxW: plateW - u(70), maxLines: 2, minSize: u(20), lh: 1.25, italic: true, weight: 400, family: SERIF2 }) : null;
    var dl = dates ? layoutText(dates, { size: PORT ? u(32) : u(30), maxW: plateW - u(70), maxLines: 1, minSize: u(18), lh: 1.2, ls: 0.2 }) : null;
    var ph = u(34) + nl.h + (rl ? rl.h + u(14) : 0) + (dl ? dl.h + u(10) : 0) + u(30);
    var el = ovDiv("ph-plate"); place(el, plateX, plateY, plateW, ph);
    var pc = parchment(plateW, ph, { seed: seed }); pc.className = "ph-parch"; place(pc, -pc._pad, -pc._pad, pc.width, pc.height); el.appendChild(pc);
    var yy = u(30), nt = textLines(el, nl, { color: PAL.ink, ls: 0.03 }); place(nt, 0, yy, plateW, nl.h); yy += nl.h + u(6);
    var rule = div("ph-rule", el); place(rule, plateW / 2 - Math.min(plateW * 0.3, nl.w / 2), yy, Math.min(plateW * 0.6, nl.w), Math.max(2, u(3))); yy += u(10);
    var rt = null, dt = null;
    if (rl) { rt = textLines(el, rl, { italic: true, weight: 400, family: SERIF2, color: "#4A3420" }); place(rt, 0, yy, plateW, rl.h); yy += rl.h + u(8); }
    if (dl) { dt = textLines(el, dl, { color: PAL.goldDk, ls: 0.2 }); place(dt, 0, yy, plateW, dl.h); }
    up(function (t) {
      var vis = t >= tK - 0.01; show(el, vis); if (!vis) return;
      var pp = outC(prog(t, tK, 0.45));
      setS(el, "clipPath", pp < 1 ? "inset(-10% " + f1((1 - pp) * 50) + "% -10% " + f1((1 - pp) * 50) + "%)" : "none");
      if (rt) setS(rt, "opacity", f2(outC(prog(t, tK + 0.3, 0.4))));
      if (dt) setS(dt, "opacity", f2(outC(prog(t, tK + 0.5, 0.4))));
    });
    addBox("plate", nm, tK + 0.4, null, function () { return { x: plateX, y: plateY, w: plateW, h: ph }; });
    var q = str(p.quote);
    if (q) {
      var qAt = Math.min(tK + 1.1, D - 1.5);
      if (PORT) caption('"' + q + '"', { at: qAt, y: plateY + ph + u(22), maxW: (sf.x1 - sf.x0) * 0.86 });
      else caption('"' + q + '"', { at: qAt, y: plateY + ph + u(30), size: u(38), cx: plateX + plateW / 2, maxW: plateW });
    }
  };

  function wreckShapes(kind, F) {
    var g = FL(), wood = "#4E3420";
    if (kind === "wheel") {
      g.l(ellD(0, -6, 27, 8.5), wood, 3.6);
      for (var i = 0; i < 6; i++) { var a = (i / 6) * PI + 0.3; if (i === 2) continue; g.l([[0, -6], [Math.cos(a) * 25, -6 + Math.sin(a) * 7.6]], "#6A4A2E", 1.8); }
      g.e(0, -6, 4, 2.4, "#2A1E14");
    } else if (kind === "drum") {
      g.f(P([[-16, -2], [16, -4], [16, -22], [-16, -20]], true), F ? F.trim || "#8E2A1E" : "#8E2A1E");
      g.l([[-15, -2], [-4, -21], [6, -3], [15, -21]], "#C8A048", 1.2, { hi: false });
      g.e(16, -13, 4, 9.5, "#D8CCB0"); g.e(-16, -11, 3.6, 9, shade("#D8CCB0", -0.2));
      g.l([[18, -24], [34, -30]], "#5A3A22", 1.4); g.l([[20, -3], [36, 2]], "#5A3A22", 1.4);
    } else if (kind === "shako") {
      g.f(P([[-6, 0], [8, -2], [10, -14], [-6, -12]], true), "#1A1A1C"); g.e(3, -7, 2, 2.4, "#C8A048", { tex: false });
    } else if (kind === "musket") {
      weaponShapes(g, "musket", [-30, 0], [30, -3], { bayonet: false });
    } else if (kind === "cannon") {
      g.l([[-40, 0], [-6, -10]], shade(wood, -0.2), 6);
      g.f(P([[-14, -22], [30, -14], [30, -7], [-13, -15]], true), "#4A4A46");
      g.e(-14, -18, 4.5, 4.5, "#4A4A46");
      g.e(-4, -11, 12.5, 12.5, wood); g.e(-4, -11, 9.5, 9.5, shade(wood, -0.35), { tex: false });
      for (i = 0; i < 4; i++) { a = (i / 4) * PI + 0.4; g.l([[-4 + Math.cos(a) * 9, -11 + Math.sin(a) * 9], [-4 - Math.cos(a) * 9, -11 - Math.sin(a) * 9]], "#6A4A2E", 1.4, { hi: false }); }
      g.l([[18, -1], [44, -2]], wood, 2.4);
    }
    return g;
  }
  function wreck(kind, x, y, size, o) {
    o = obj(o);
    var w = ensure(), unit = size / 100, F = o.faction ? factionOf(o.faction) : null;
    addItem(o.layer || "ground", { collect: function (t, list) {
      var pu = ppuFor(unit * (w.camNow ? w.camNow.z * w.F : 1));
      list.push({ z: y, sp: sprite("wr|" + kind + "|" + (F ? F.id : ""), [-50, -40, 50, 10], pu, function () { return wreckShapes(kind, F); }), x: x, y: y, s: unit, flip: !!o.flip, rot: o.rot || 0 });
    } });
  }
  TPL.aftermath = function (root, p) {
    var hold = sideSpec(p.army, "redcoat"), lost = sideSpec(p.right, enemyOf(hold.faction));
    var FH = faction(hold.faction), FX = faction(lost.faction, lost.faction === hold.faction ? 1 : 0);
    scene(root, { sky: p.sky || "storm", terrain: p.terrain || "plain" });
    var w = WD, hz = w.hz, span = w.wh - hz, lim = endLimit();
    haze({ n: 5, opacity: 0.32 });
    [0.1, 0.3, 0.55, 0.78, 0.93].forEach(function (f, i) { smoke({ layer: "far", x: w.ww * f, y: hz + u(2), size: u(80 + i * 12), life: 9, n: 14, dir: [0.25, -1], speed: u(22), wind: u(8), opacity: 0.75, dark: true, seed: 81 + i }); });
    var gy = hz + span * (PORT ? 0.4 : 0.4), s = (PORT ? H * 0.085 : H * 0.13) * persp(gy);
    army({ faction: FH, x: w.ww * (PORT ? 0.64 : 0.64), y: gy, size: s, count: 7, ranks: 2, spacing: s * 0.42, facing: -1, flags: 1, officer: false, seed: 82 });
    figure({ horse: true, colour: "#5E3A22", x: w.ww * (PORT ? 0.3 : 0.4), y: gy + s * 0.25, size: s * persp(gy + s * 0.25) / persp(gy), facing: 1, saddle: FX.coat });
    var fy = hz + span * (PORT ? 0.58 : 0.58), fs = (PORT ? H * 0.075 : H * 0.11) * persp(fy);
    flag({ faction: FX, x: w.ww * (PORT ? 0.14 : 0.2), y: fy, h: fs * 2.3, w: fs * 1.0, fallen: true, side: 1, z: 5 });
    wreck("cannon", w.ww * (PORT ? 0.76 : 0.82), fy - fs * 0.05, fs * 1.5, { rot: -0.18 });
    wreck("wheel", w.ww * (PORT ? 0.52 : 0.64), fy + fs * 0.1, fs * 1.2);
    wreck("drum", w.ww * (PORT ? 0.36 : 0.46), fy + fs * 0.12, fs * 1.1, { faction: FX });
    wreck("shako", w.ww * (PORT ? 0.62 : 0.55), fy + fs * 0.22, fs * 0.8);
    wreck("musket", w.ww * (PORT ? 0.26 : 0.36), fy + fs * 0.3, fs * 1.1, { rot: 0.1 });
    crows({ n: PORT ? 5 : 8 });
    if (str(p.weather) === "rain" || str(p.weather) === "snow") weather(str(p.weather));
    var tK = keyTime(p.keyword, 0.5, 2.2);
    camera.panZoom(0, D, { from: { fx: 0.5, fy: 0.52, zoom: 1.14 }, to: { fx: 0.52, fy: 0.55, zoom: 1.03 } });
    var hasStats = !!(str(p.stat) || str(p.stat2));
    var bn = str(p.title) ? banner(p.title, { at: tK, pos: "top", color: "red" }) : null;
    function cnt(v) { var n = parseFloat(str(v).replace(/,/g, "")); return isFinite(n) && /^[\d,.\s]+$/.test(str(v)) ? n : 0; }
    var tS = Math.min(tK + 0.7, D - 1.6);
    if (hasStats) versus({ count: cnt(p.stat), label: str(p.statLabel) || (cnt(p.stat) ? FH.name : str(p.stat)), faction: FH }, { count: cnt(p.stat2), label: str(p.stat2Label) || (cnt(p.stat2) ? FX.name : str(p.stat2)), faction: FX }, { at: tS, pos: PORT ? "top" : "bottom", y: PORT ? (bn ? bn.y + bn.h + u(30) : SAFE().y0 + u(20)) : null, countDur: 1.2 });
    lowerFrom(p, 0.5, hasStats && !PORT ? tS - 0.15 : null);
    void lim;
  };

  TPL["timeline-of-campaign"] = function (root, p) {
    var evs = arr(p.events).slice(0, 6).map(function (e) { e = typeof e === "string" ? { date: e } : obj(e); return { date: caps(e.date), label: str(e.label) }; }).filter(function (e) { return e.date || e.label; });
    if (!evs.length) evs = [{ date: "BEGIN", label: "" }, { date: "END", label: "" }];
    var F = faction(sideSpec(p.army, "bluecoat").faction), n = evs.length;
    scene(root, { sky: p.sky, terrain: p.terrain, mill: false, road: "across", roadY: PORT ? H * 0.8 : H * 0.5 + H * 0.5 * 0.55, roadW: u(70) });
    ambient({ haze: 0.16, columns: false });
    var w = WD, sf = SAFE(), lim = endLimit();
    var times = itemTimes(evs.map(function (e) { return { label: e.date + " " + e.label, keyword: e.date.split(/\s+/)[0] }; }), { gap: 0.6, tail: 1.2, a: 0.5 });
    var bw = PORT ? Math.min(u(600), (sf.x1 - sf.x0) * 0.62) : Math.min(u(400), ((sf.x1 - sf.x0) / n) * 0.9), bh = PORT ? Math.min(u(170), ((sf.y1 - sf.y0 - u(140)) / n) * 0.92) : bw * 0.58;
    var boards = evs.map(function (e, i) {
      var bx, by;
      if (PORT) { bx = i % 2 ? sf.x1 - bw / 2 - u(8) : sf.x0 + bw / 2 + u(8); by = sf.y1 - u(150) - (i + 0.5) * ((sf.y1 - sf.y0 - u(170)) / n) + bh / 2; }
      else { bx = sf.x0 + ((i + 0.5) / n) * (sf.x1 - sf.x0); by = (i % 2 ? H * 0.56 : H * 0.45) + bh / 2; }
      return { e: e, x: bx, y: by, at: times[i] };
    });
    var r = rng(5);
    boards.forEach(function (b, i) {
      var key = "board|" + i + "|" + b.e.date + "|" + b.e.label + "|" + Math.round(bw);
      function boardCanvas() {
        if (SPR[key]) return SPR[key].c;
        var res = 2, c = mkCanvas(bw * res, bh * res), ctx = c.getContext("2d");
        ctx.fillStyle = "#6A4A2E"; ctx.fillRect(0, 0, c.width, c.height);
        for (var k2 = 0; k2 < 30; k2++) { ctx.globalAlpha = 0.25; ctx.strokeStyle = r() < 0.5 ? "#4A3220" : "#8A6A44"; ctx.lineWidth = 2 + r() * 4; var yy = r() * c.height; ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(c.width, yy + (r() - 0.5) * 8); ctx.stroke(); }
        ctx.globalAlpha = 1;
        var m = c.height * 0.08;
        ctx.fillStyle = "#EBDAB0"; ctx.fillRect(m, m, c.width - 2 * m, c.height - 2 * m);
        for (k2 = 0; k2 < 8; k2++) blob(ctx, m + r() * (c.width - 2 * m), m + r() * (c.height - 2 * m), c.width * 0.2, c.height * 0.2, r() < 0.5 ? "#F6E8C4" : "#C8AE78", 0.3);
        oilPass(c, { sizes: [c.height * 0.03, c.height * 0.015], k: 1, seed: 600 + i, flow: 0.4, impasto: 0.3, alpha: 0.55, jitter: 12 });
        ctx.strokeStyle = "#3A2814"; ctx.lineWidth = c.height * 0.012; ctx.strokeRect(m * 1.4, m * 1.4, c.width - 2.8 * m, c.height - 2.8 * m);
        var dl = layoutText(b.e.date, { size: c.height * 0.26, maxW: c.width * 0.86, maxLines: 1, minSize: c.height * 0.12, lh: 1.05, ls: 0.06 });
        var ll = b.e.label ? layoutText(b.e.label, { size: c.height * 0.15, maxW: c.width * 0.84, maxLines: 2, minSize: c.height * 0.08, lh: 1.15, italic: true, weight: 400, family: SERIF2 }) : null;
        var tot = dl.h + (ll ? ll.h + c.height * 0.04 : 0), y0 = c.height / 2 - tot / 2;
        ctx.fillStyle = "#2A1A0C"; ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.font = fontStr(dl.size); if (ctx.letterSpacing != null) ctx.letterSpacing = f1(dl.size * 0.06) + "px";
        dl.lines.forEach(function (l, j) { ctx.fillText(l.words.join(" "), c.width / 2, y0 + j * dl.size * dl.lh); });
        if (ctx.letterSpacing != null) ctx.letterSpacing = "0px";
        if (ll) { ctx.fillStyle = "#4A3420"; ctx.font = fontStr(ll.size, { italic: true, weight: 400, family: SERIF2 }); ll.lines.forEach(function (l, j) { ctx.fillText(l.words.join(" "), c.width / 2, y0 + dl.h + c.height * 0.04 + j * ll.size * ll.lh); }); }
        SPR[key] = { c: c };
        return c;
      }
      addItem("ground", { collect: function (t, list) {
        if (t < b.at - 0.05) return;
        var pp = outC(prog(t, b.at - 0.05, 0.3)), sw = prog(t, b.at + 0.15, 0.6), ang = (1 - soft(sw)) * -1.2;
        list.push({ z: b.y + bh * 0.9, fn: function (ctx) {
          var postH = bh * 0.9 * pp, topY = b.y - bh;
          ctx.fillStyle = "#3A2614"; ctx.fillRect(b.x - bw * 0.02, b.y + bh * 0.9 - postH - bh * 0.05, bw * 0.04, postH + bh * 0.05);
          ctx.fillStyle = "rgba(20,10,4,0.35)"; ctx.beginPath(); ctx.ellipse(b.x, b.y + bh * 0.9, bw * 0.12, bh * 0.05, 0, 0, TAU); ctx.fill();
          if (sw <= 0) return;
          ctx.translate(b.x - bw / 2, topY); ctx.rotate(ang);
          ctx.globalAlpha = clamp(sw * 3, 0, 1);
          ctx.fillStyle = "rgba(15,8,2,0.4)"; ctx.fillRect(bw * 0.02, bh * 0.04, bw, bh);
          ctx.drawImage(boardCanvas(), 0, 0, bw, bh);
        } });
      } });
      var bget = function (t) { var a = toScreen(b.x - bw / 2, b.y - bh, t), c2 = toScreen(b.x + bw / 2, b.y, t); return { x: a[0], y: a[1], w: c2[0] - a[0], h: c2[1] - a[1], moving: camMoving(t) }; };
      b.get = bget;
    });
    var roadY = w.road ? w.road[Math.floor(w.road.length * 0.5)][1] : H * 0.78, cs = (PORT ? H * 0.04 : H * 0.06) * persp(roadY);
    var col = army({ faction: F, x: PORT ? w.ww * 0.2 : w.ww * 0.12, y: roadY + cs * 0.1, size: cs, count: PORT ? 24 : 36, ranks: 3, spacing: cs * 0.36, facing: 1, flags: 1, seed: 91 });
    col.march(0, D + 0.5, (PORT ? w.ww * 0.5 : w.ww * 0.7), 0);
    var zF = PORT ? 1.32 : 1.42;
    boards.forEach(function (b, i) {
      var cx = b.x, cy = b.y - bh * 0.4, d = Math.max(0.5, Math.min(0.7, (i < n - 1 ? boards[i + 1].at : lim) - b.at - 0.1));
      camera.to(cx, cy, zF, Math.max(0, b.at - 0.15), d);
    });
    var tEnd = Math.min(lim - 0.2, boards[n - 1].at + 1.2);
    boards.forEach(function (b, i) { addBox("board", b.e.date, b.at + 0.75, i < n - 1 ? boards[i + 1].at - 0.2 : tEnd, b.get); addBox("board", b.e.date, tEnd + 1.0, null, b.get); });
    camera.to(w.ww / 2, w.wh / 2, 1, tEnd, Math.max(0.6, lim - tEnd + 0.4));
    if (str(p.title)) lowerThird(p.title, { sub: p.subtitle, at: Math.min(tEnd + 0.3, D - 1.2), align: PORT ? "center" : "left" });
    else if (str(p.subtitle)) caption(p.subtitle, { at: Math.min(tEnd + 0.3, D - 1.2) });
  };

  TPL["quote-from-history"] = function (root, p) {
    var F = faction(sideSpec(p.faction || "redcoat").faction), E = faction(enemyOf(F.id));
    scene(root, { sky: p.sky || "dusk", terrain: p.terrain || "hills" });
    ambient({ haze: 0.24 });
    var w = WD, hz = w.hz, span = w.wh - hz, gy = hz + span * (PORT ? 0.5 : 0.62), s = (PORT ? H * 0.05 : H * 0.07) * persp(gy);
    var a = army({ faction: F, x: w.ww * 0.3, y: gy, size: s, count: 45, ranks: 3, facing: 1, seed: 95 });
    var b = army({ faction: E, x: w.ww * 0.72, y: gy - s * 0.4, size: s * 0.9, count: 45, ranks: 3, facing: -1, seed: 96 });
    var tq = keyTime(p.keyword, 0.15, 1.5);
    a.volley(clamp(tq + 1.2, 0.8, endLimit()));
    b.march(0.2, Math.max(0.5, endLimit() - 0.2), -w.ww * 0.04, 0);
    camera.panZoom(0, D, { from: { fx: 0.48, fy: 0.5, zoom: 1.04 }, to: { fx: 0.54, fy: 0.52, zoom: 1.16 } });
    dim(0, 0.66, 0.8);
    var auth = [str(p.author), str(p.date)].filter(Boolean).join(", ");
    quote(p.quote || V.narration, { author: auth, at: Math.max(0.3, tq - 0.1) });
  };

  // ------------------------- svg helpers for custom drawings -------------------------
  function roughen(g) {
    var L = g && g.__ph;
    if (!L || L.rough) return;
    L.rough = true;
    var id = "ph-rough-" + L.name + "-" + WD.id, f = svg("filter", { id: id, x: "-5%", y: "-5%", width: "110%", height: "110%" }, L.defs);
    svg("feTurbulence", { type: "fractalNoise", baseFrequency: "0.035", numOctaves: "2", seed: "7", result: "n" }, f);
    svg("feDisplacementMap", { in: "SourceGraphic", in2: "n", scale: f1(u(4)), xChannelSelector: "R", yChannelSelector: "G" }, f);
    L.g.setAttribute("filter", "url(#" + id + ")");
  }
  function attrs(o, extra) { o = obj(o); var a = {}; for (var k in extra) a[k] = extra[k]; for (k in o) a[k] = o[k]; return a; }
  var draw = {
    path: function (g, d, fill, o) { roughen(g); return svg("path", attrs(o, { d: d, fill: fill || "none" }), g); },
    rect: function (g, x, y, w, h, fill, o) { roughen(g); return svg("rect", attrs(o, { x: f1(x), y: f1(y), width: f1(w), height: f1(h), fill: fill || "#806040" }), g); },
    circle: function (g, cx, cy, r, fill, o) { roughen(g); return svg("circle", attrs(o, { cx: f1(cx), cy: f1(cy), r: f1(r), fill: fill || "#806040" }), g); },
    ellipse: function (g, cx, cy, rx, ry, fill, o) { roughen(g); return svg("ellipse", attrs(o, { cx: f1(cx), cy: f1(cy), rx: f1(rx), ry: f1(ry), fill: fill || "#806040" }), g); },
    line: function (g, x1, y1, x2, y2, stroke, width, o) { roughen(g); return svg("line", attrs(o, { x1: f1(x1), y1: f1(y1), x2: f1(x2), y2: f1(y2), stroke: stroke || "#2A1A0E", "stroke-width": f2(num(width, 2)), "stroke-linecap": "round" }), g); },
    group: function (g, a) { return svg("g", obj(a), g || ensure().layers.ground.g); },
  };
  var gradients = {
    linear: function (defs, stops, o) {
      o = obj(o); var id = "phlg" + gradSeq++, lg = svg("linearGradient", { id: id, x1: o.x1 || "0", y1: o.y1 || "0", x2: o.x2 || "0", y2: o.y2 || "1" }, defs || ensure().layers.ground.defs);
      arr(stops).forEach(function (s, i, all) { var st = Array.isArray(s) ? s : [i / Math.max(1, all.length - 1), s]; svg("stop", { offset: String(num(st[0], 0)), "stop-color": st[1], "stop-opacity": st[2] == null ? null : String(st[2]) }, lg); });
      return "url(#" + id + ")";
    },
  };

  // ------------------------- render, fallback, inspect, stage -------------------------
  function render(id, root, props) {
    if (!TPL[id]) throw new Error("Unknown template: " + id);
    TPL[id](root || V.root(), obj(props));
  }
  function fallback(root, narration) {
    try {
      root = root || V.root();
      while (root.firstChild) root.removeChild(root.firstChild);
      WD = null;
      scene(root, { sky: "golden", terrain: "fields" });
      ambient();
      var w = WD, fd = field();
      army({ faction: "redcoat", x: w.ww * 0.28, y: fd.gyF, size: fd.sF, count: PORT ? 27 : 45, facing: 1 }).volley(Math.min(2, endLimit()));
      army({ faction: "bluecoat", x: w.ww * 0.72, y: fd.gyB, size: fd.sB, count: PORT ? 27 : 45, facing: -1 });
      camera.panZoom(0, D, { from: { fx: 0.5, fy: 0.5, zoom: 1.02 }, to: { fx: 0.5, fy: 0.55, zoom: 1.12 } });
      var text = str(narration || V.narration).split(/\s+/).slice(0, 22).join(" ");
      if (text) caption(text, { at: 0.4 });
    } catch (e) { V.error("[brush-strokes fallback] " + (e && e.message ? e.message : e)); }
  }
  function inspect(t) {
    if (!WD) return [];
    var out = [];
    WD.boxes.forEach(function (bx) {
      if (t < bx.from || t >= bx.to) return;
      var b = null;
      try { b = bx.get(t); } catch (e) { b = null; }
      if (!b) return;
      out.push({ kind: bx.kind, label: bx.label, x: b.x, y: b.y, w: b.w, h: b.h, moving: !!b.moving });
    });
    return out;
  }
  function stage(root, o) {
    var world = scene(root, o);
    var sf = SAFE(), col = div("ph-stage", WD.ov);
    place(col, sf.x0, sf.y0, sf.x1 - sf.x0, sf.y1 - sf.y0);
    world.column = col;
    return world;
  }
  function factionData(id) { var F = faction(id); return { id: F.id, name: F.name, coat: F.coat, trim: F.trim, hat: F.hat, weapon: F.weapon, shield: F.shield || null, flag: Object.assign({}, F.flag), era: F.era }; }
  var factionInfo = {};
  FACTION_IDS.forEach(function (id) { factionInfo[id] = factionData(id); });

  // ------------------------- public API -------------------------
  S.scene = scene;
  S.layer = function (name) { return layerOf(name).api; };
  S.landscape = landscape;
  S.interior = interior;
  S.camera = camera;
  S.onFrame = onFrame;
  S.fadeIn = fadeIn;
  S.fadeOut = fadeOut;
  S.letterbox = letterbox;
  S.draw = draw;
  S.svg = svg;
  S.gradients = gradients;
  S.dabs = dabs;
  S.ridge = ridge;
  S.tree = tree;
  S.forest = forest;
  S.fortress = fortress;
  S.town = town;
  S.camp = camp;
  S.windmill = windmill;
  S.mix = mixC;
  S.shade = shade;
  S.rgba = rgba;
  S.army = army;
  S.cannon = cannon;
  S.flag = flag;
  S.figure = figure;
  S.wagon = wagon;
  S.crows = crows;
  S.wreckage = wreckage;
  S.general = general;
  S.table = table;
  S.portrait = portrait;
  S.factions = FACTION_IDS.slice();
  S.factionInfo = factionInfo;
  S.faction = function (id, variant) { return faction(id, variant); };
  S.guessFaction = function (text) { return guessFaction(text); };
  S.enemyOf = enemyOf;
  S.soldierMarkup = function (F, pose, phase) { return "<g>" + listMarkup(soldierShapes(factionOf(F, "redcoat"), str(pose) || "stand", num(phase, 0) * TAU, 0)) + "</g>"; };
  S.horseMarkup = function (F, colour, phase, rider, pose) { var FF = factionOf(F, "redcoat"); return "<g>" + listMarkup(horseShapes(colour || FF.horse, num(phase, 0) * TAU, rider ? FF : null, str(pose) || (rider ? "gallop" : "stand"), 0)) + "</g>"; };
  S.hatMarkup = function (type, F) { var g = FL(); hatShapes(g, str(type) || "shako", factionOf(F, "redcoat"), 0, 0); return "<g>" + listMarkup(g) + "</g>"; };
  S.faceMarkup = function (seed, F) { var g = FL(); faceShapes(g, num(seed, 1), factionOf(F, "redcoat"), 0, 0); return "<g>" + listMarkup(g) + "</g>"; };
  S.smoke = smoke;
  S.haze = haze;
  S.fire = fire;
  S.weather = weather;
  S.battleMap = battleMap;
  S.manoeuvre = manoeuvre;
  S.manoeuvres = MANOEUVRES.slice();
  S.banner = banner;
  S.versus = versus;
  S.lowerThird = lowerThird;
  S.quote = quote;
  S.caption = caption;
  S.titleCard = titleCard;
  S.dim = dim;
  S.stage = stage;
  S.oil = { pass: oilPass, glaze: glaze, parchment: parchment, canvas: mkCanvas, varnish: paintVarnish };
  S.skies = SKY_NAMES.slice();
  S.terrains = TERR_NAMES.slice();
  S.persp = function (y) { return persp(y); };
  S.groundY = function (fy) { return groundY(fy); };
  S.toScreen = function (x, y, t, layer) { return toScreen(x, y, t == null ? V.time() : t, layer); };
  S.safe = SAFE;
  S.find = kwFind;
  S.speechSpan = speechSpan;
  S.templates = Object.keys(TPL);
  S.render = render;
  S.fallback = fallback;
  S.inspect = inspect;
  S.flush = function () { if (WD) finishPaint(); };
})();

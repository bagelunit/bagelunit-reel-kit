/* Skyline Rush engine (style id: skyline-rush).
 *
 * A cinematic aerial view of one procedural city growing on its terrain. The world is ONE
 * <canvas> per view that is redrawn from scratch for every frame; a thin DOM layer on top holds
 * the overlays (year counter, era lower-thirds, headline, city tag, chart, chips).
 *
 * Architecture
 * - Model (build time, cached per preset + style + seed + names): S.city.model() makes
 *   . the terrain: a land/water field per preset sampled on a grid that is fine (1 cell) in the
 *     city and coarse outside it; coastlines and shallows come from marching squares;
 *   . the lots: one per cell, organic in the old core, a street grid elsewhere; each lot has
 *     growth stages [{p, kind, h}] on the progress clock p (0 wilderness, 1 today);
 *   . districts, landmarks, bridges, rail, streets, boat and car lanes, trees.
 *   All randomness comes from integer hashes of the seed, so the same props give the same city.
 * - Clock: S.city.makeClock() maps years to p through the city's key dates. It does not depend
 *   on the scene's year range, so one year always shows the same city in every scene.
 * - World (build time): S.city.world() makes the canvas, the camera keys (fitted to the city),
 *   the year schedule and the labels.
 * - Frame time: ONE V.onFrame handler calls world.frame(t) for every world and update(t) for
 *   every overlay. world.frame(t): year -> p -> light; camera keys -> projection; then sky, far
 *   plane, shallows and land cells (far to near), glints, streets, rail, shadows, boats, trains
 *   and cars, then buildings, trees, landmarks, bridges, smoke and extras in one depth-sorted
 *   pass, then haze and the canvas labels. A frame never mutates state, so seeking works both ways.
 * - Timing: templates find beats with V.find(keyword) (landTimes, copied from the pilot), spread
 *   missing ones, keep a minimum gap and finish about 1 s before the end.
 *
 * Contract: window.SceneStyle (S) with S.render, S.fallback, S.flush, S.inspect and S.city.
 * No network, no timers, no wall clock, no Math.random.
 */
(function () {
  "use strict";
  var V = window.V;
  if (!V) return;
  var S = (window.SceneStyle = window.SceneStyle || {});
  var doc = document;
  var FW = V.width, FH = V.height, D = V.duration;
  var PORTRAIT = V.isPortrait;
  var PI = Math.PI, DEG = PI / 180;
  var FONT = '"Inter", "Segoe UI", "Helvetica Neue", Arial, "Noto Sans", system-ui, sans-serif';
  var PAL = { bg: "#15213A", fg: "#FFFFFF", accent: "#F2A33A", muted: "#C9D3E6" };
  var ACCENT = [242, 163, 58];
  var ARROW = String.fromCharCode(0x2192);

  // ------------------------- small utils -------------------------
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, p) { return a + (b - a) * p; }
  function num(v, d) { var n = typeof v === "number" ? v : parseFloat(v); return isFinite(n) ? n : d; }
  function int(v, d) { var n = num(v, NaN); return isFinite(n) ? Math.round(n) : d; }
  function str(v) { return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim(); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function smooth(p) { p = clamp(p, 0, 1); return p * p * (3 - 2 * p); }
  function outCubic(p) { p = clamp(p, 0, 1); return 1 - (1 - p) * (1 - p) * (1 - p); }
  function inOutSine(p) { p = clamp(p, 0, 1); return 0.5 - 0.5 * Math.cos(PI * p); }
  function outBack(p) { p = clamp(p, 0, 1); var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); }
  function prog(t, a, d) { return d <= 0 ? (t >= a ? 1 : 0) : clamp((t - a) / d, 0, 1); }
  function frac(x) { return x - Math.floor(x); }
  function hash(n) {
    var h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function hash2(a, b) {
    var h = (Math.imul(a | 0, 374761393) + Math.imul((b | 0) + 1, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function hash3(a, b, c) { return hash2(Math.imul(a | 0, 73856093) ^ (c | 0), Math.imul(b | 0, 19349663) + (c | 0) * 83492791); }
  function strHash(s) { var h = 7; s = String(s); for (var i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return h >>> 0; }
  function vnoise(x, y, seed) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = hash3(xi, yi, seed), b = hash3(xi + 1, yi, seed), c = hash3(xi, yi + 1, seed), d = hash3(xi + 1, yi + 1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, seed) { return 0.55 * vnoise(x, y, seed) + 0.3 * vnoise(x * 2.07 + 5.3, y * 2.07 + 1.7, seed + 17) + 0.15 * vnoise(x * 4.3 + 2.1, y * 4.3 + 9.2, seed + 41); }
  function normWord(s) {
    return String(s == null ? "" : s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
  }
  function slug(s) { return normWord(s); }
  function segDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    var t = l2 > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
    var qx = ax + dx * t - px, qy = ay + dy * t - py;
    return Math.sqrt(qx * qx + qy * qy);
  }
  function polyDist(px, py, pts) {
    var m = 1e9;
    for (var i = 0; i + 1 < pts.length; i++) m = Math.min(m, segDist(px, py, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
    return m;
  }

  // ------------------------- colour -------------------------
  function hex2rgb(h, d) {
    var m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(str(h));
    if (!m) return d || null;
    var s = m[1];
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    var n = parseInt(s, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mixc(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
  function mulc(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function css(c, al) {
    var r = clamp(Math.round(c[0]), 0, 255), g = clamp(Math.round(c[1]), 0, 255), b = clamp(Math.round(c[2]), 0, 255);
    if (al == null || al >= 1) return "rgb(" + r + "," + g + "," + b + ")";
    return "rgba(" + r + "," + g + "," + b + "," + Math.max(0, Math.round(al * 1000) / 1000) + ")";
  }
  function toRGB(c, d) { if (Array.isArray(c) && c.length >= 3) return c; return hex2rgb(c, d); }

  // ------------------------- DOM helpers -------------------------
  function div(cls, parent, text) {
    var e = doc.createElement("div");
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function setS(el, k, v) { v = String(v); if (el["_s" + k] !== v) { el["_s" + k] = v; el.style[k] = v; } }
  function showEl(el, on) { setS(el, "display", on ? "" : "none"); }
  function px(v) { return Math.round(v * 10) / 10 + "px"; }

  // ------------------------- text measuring and layout -------------------------
  var mctx = null;
  function mfont(weight, size) { return weight + " " + size.toFixed(1) + "px " + FONT; }
  function textW(s, weight, size, ls) {
    if (!mctx) mctx = doc.createElement("canvas").getContext("2d");
    mctx.font = mfont(weight, size);
    var w = mctx.measureText(s).width;
    if (ls) w += ls * size * Math.max(0, s.length - 1);
    return w;
  }
  // Words with an emphasis flag: "*word*" is the accent colour.
  function tokens(text, upper) {
    var s = str(text), out = [];
    if (upper) s = s.toUpperCase();
    var parts = s.split("*"), balanced = parts.length % 2 === 1;
    parts.forEach(function (part, i) {
      var em = balanced && i % 2 === 1;
      part.split(/\s+/).forEach(function (w) { if (w) out.push({ w: balanced ? w : w.replace(/\*/g, ""), em: em }); });
    });
    return out.filter(function (t) { return t.w; });
  }
  function plain(text) { return str(text).replace(/\*/g, ""); }
  // Fits text into maxW x maxLines: shrinks the size, then balances the lines (no orphan words).
  function layoutText(text, o) {
    o = o || {};
    var weight = o.weight || 700, size = o.size || 48, maxW = o.maxW || FW * 0.8, maxLines = o.maxLines || 2;
    var ls = o.ls || 0, lh = o.lh || 1.15, minSize = o.minSize || size * 0.45;
    var toks = tokens(text, o.upper);
    function wrap(s, limit) {
      var sp = textW(" ", weight, s, 0) + ls * s, lines = [], line = { t: [], w: 0 };
      toks.forEach(function (tk) {
        var ww = textW(tk.w, weight, s, ls);
        if (line.t.length && line.w + sp + ww > limit) { lines.push(line); line = { t: [], w: 0 }; }
        line.w += (line.t.length ? sp : 0) + ww;
        line.t.push(tk);
      });
      if (line.t.length) lines.push(line);
      return lines;
    }
    function widest(ls2) { var m = 0; ls2.forEach(function (l) { m = Math.max(m, l.w); }); return m; }
    var s = size, lines = wrap(s, maxW);
    for (var it = 0; it < 24; it++) {
      if ((lines.length <= maxLines && widest(lines) <= maxW + 0.5) || s <= minSize) break;
      s = Math.max(minSize, s * 0.94);
      lines = wrap(s, maxW);
    }
    if (lines.length > 1 && o.balance !== false) {
      var lo = widest(lines) * 0.35, hi = widest(lines), n0 = lines.length;
      for (var b = 0; b < 14; b++) { var mid = (lo + hi) / 2; if (wrap(s, mid).length <= n0) hi = mid; else lo = mid; }
      lines = wrap(s, hi + 0.5);
    }
    return { lines: lines, size: s, w: widest(lines), h: s * lh * lines.length, lh: lh, weight: weight, ls: ls };
  }
  // Renders a laid-out block into el (one div per line; em words in the accent colour).
  function fillText(el, lay, align) {
    while (el.firstChild) el.removeChild(el.firstChild);
    el.style.fontSize = px(lay.size);
    el.style.lineHeight = String(lay.lh);
    el.style.fontWeight = String(lay.weight);
    if (lay.ls) el.style.letterSpacing = lay.ls + "em";
    el.style.textAlign = align || "left";
    lay.lines.forEach(function (l) {
      var d = div("ct-line", el);
      l.t.forEach(function (tk, i) {
        if (i) d.appendChild(doc.createTextNode(" "));
        if (tk.em) { var sp = doc.createElement("span"); sp.className = "ct-em"; sp.textContent = tk.w; d.appendChild(sp); }
        else d.appendChild(doc.createTextNode(tk.w));
      });
    });
    return el;
  }

  // ------------------------- timing helpers (copied from the whiteboard pilot) -------------------------
  var STOP = {};
  "a an the and or but of to in on at by for with from into onto over under is are was were be been being it its this that these those your you we our us my me i his her their they them he she as than then so not no yes do does did have has had will would can could should very just more most less each every all any some about here there what when who how why which also too up out if".split(" ").forEach(function (w) { STOP[w] = 1; });
  function narrationEstimate(word, after) {
    var key = normWord(String(word).split(/\s+/)[0] || "");
    if (!key || !V.narration) return null;
    var toks = V.narration.split(/\s+/), total = toks.length;
    for (var pass = 0; pass < 2; pass++) {
      for (var i = 0; i < total; i++) {
        var est = (i / Math.max(1, total)) * D * 0.95;
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
    if (after) { t = V.find(word, 0); if (t != null && t >= (after || 0) - 2) return t; }
    return narrationEstimate(word, after);
  }
  function contentWords(text) {
    return str(text).replace(/\*/g, "").split(/[^\p{L}\p{N}'-]+/u).filter(function (w) { var n = normWord(w); return n.length > 1 && !STOP[n]; });
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
  // Beat times for a list of {label, keyword}: found words, missing ones spread, a minimum gap,
  // everything between o.first and D - o.tail.
  function landTimes(list, o) {
    o = o || {};
    var n = list.length;
    if (!n) return [];
    var lo = Math.min(o.first != null ? o.first : 0.5, D * 0.2), hi = Math.max(lo + 0.3, D - (o.tail != null ? o.tail : 1.6));
    var gap = Math.min(o.gap != null ? o.gap : 0.4, (hi - lo) / Math.max(1, n));
    var prev = o.after || 0;
    var t = list.map(function (it) { var x = labelTime(it.label, it.keyword, prev); if (x != null) prev = x + 0.01; return x; });
    t = spread(t, lo, hi);
    for (var i = 0; i < n; i++) { t[i] = clamp(t[i], lo, hi); if (i && t[i] < t[i - 1] + gap) t[i] = t[i - 1] + gap; }
    for (i = n - 1; i >= 0; i--) { var lim = hi - (n - 1 - i) * gap; if (t[i] > lim) t[i] = lim; }
    return t;
  }

  // ------------------------- safe area -------------------------
  function safe() {
    var x0, y0, x1, y1;
    if (PORTRAIT) { x0 = Math.round(FW * 0.0556); x1 = Math.round(FW * 0.9444); y0 = Math.round(FH * 0.1302); y1 = Math.round(FH * 0.7552); }
    else { x0 = Math.round(FW * 0.07); x1 = Math.round(FW * 0.93); y0 = Math.round(FH * 0.07); y1 = Math.round(FH * 0.93); }
    return { x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
  var SAFE = safe();

  // ========================= eras and clock =========================
  var ERAS = [
    { id: "wild", name: "Wilderness", p: 0 },
    { id: "settlement", name: "Settlement", p: 0.08 },
    { id: "village", name: "Village", p: 0.2 },
    { id: "town", name: "Town", p: 0.34 },
    { id: "grid", name: "The grid", p: 0.48 },
    { id: "industry", name: "Industry", p: 0.62 },
    { id: "skyscraper", name: "Skyscrapers", p: 0.76 },
    { id: "modern", name: "Modern city", p: 0.9 },
  ];
  var KEYS = ["settlement", "village", "town", "grid", "industry", "skyscraper", "modern"];
  var DEFAULT_DATES = {
    american: [1624, 1660, 1760, 1811, 1850, 1900, 1960],
    european: [50, 900, 1200, 1660, 1830, 1930, 1980],
    desert: [1833, 1900, 1930, 1950, 1970, 1990, 2005],
    asian: [1457, 1600, 1700, 1870, 1900, 1960, 1990],
  };
  function eraIndex(p) { var k = 0; for (var i = 0; i < ERAS.length; i++) if (p >= ERAS[i].p - 1e-9) k = i; return k; }
  function eraSpan(k) { return (k + 1 < ERAS.length ? ERAS[k + 1].p : 1) - ERAS[k].p; }
  function resolveDates(keyDates, style) {
    var def = DEFAULT_DATES[style] || DEFAULT_DATES.american, kd = obj(keyDates);
    var given = KEYS.map(function (k) { var v = num(kd[k], NaN); return isFinite(v) ? v : null; });
    if (!given.some(function (v) { return v != null; })) return def.slice();
    var out = given.slice(), i, j;
    for (i = 0; i < 7; i++) {
      if (out[i] != null) continue;
      var a = -1, b = -1;
      for (j = i - 1; j >= 0; j--) if (given[j] != null) { a = j; break; }
      for (j = i + 1; j < 7; j++) if (given[j] != null) { b = j; break; }
      if (a >= 0 && b >= 0) out[i] = given[a] + ((def[i] - def[a]) / Math.max(1e-6, def[b] - def[a])) * (given[b] - given[a]);
      else if (b >= 0) out[i] = given[b] - (def[b] - def[i]);
      else out[i] = given[a] + (def[i] - def[a]);
    }
    for (i = 1; i < 7; i++) if (out[i] <= out[i - 1]) out[i] = out[i - 1] + 1;
    return out.map(function (v) { return Math.round(v); });
  }
  function makeClock(yearFrom, yearTo, keyDates, style) {
    var K = resolveDates(keyDates, style || "american");
    var wild = K[0] - Math.max(25, Math.round((K[1] - K[0]) * 0.6));
    var now = Math.max(2024, K[6] + 30);
    var ys = [wild].concat(K).concat([now]);
    var ps = ERAS.map(function (e) { return e.p; }).concat([1]);
    function p(year) {
      year = num(year, ys[0]);
      if (year <= ys[0]) return 0;
      if (year >= ys[ys.length - 1]) return 1;
      for (var i = 0; i + 1 < ys.length; i++) if (year <= ys[i + 1]) return lerp(ps[i], ps[i + 1], (year - ys[i]) / Math.max(1e-6, ys[i + 1] - ys[i]));
      return 1;
    }
    function year(pp) {
      pp = clamp(num(pp, 0), 0, 1);
      for (var i = 0; i + 1 < ps.length; i++) if (pp <= ps[i + 1]) return lerp(ys[i], ys[i + 1], (pp - ps[i]) / Math.max(1e-6, ps[i + 1] - ps[i]));
      return now;
    }
    return {
      p: p, year: year, dates: K, now: now, wild: wild,
      eraYear: function (i) { return ys[clamp(i | 0, 0, ys.length - 1)]; },
      yearFrom: num(yearFrom, wild), yearTo: num(yearTo, now),
    };
  }
  var POPK = [[0, 0], [0.08, 3e-5], [0.2, 2.2e-4], [0.34, 2.2e-3], [0.48, 1.2e-2], [0.62, 6e-2], [0.76, 0.38], [0.9, 0.88], [1, 1]];
  function popFrac(p) {
    p = clamp(p, 0, 1);
    for (var i = 0; i + 1 < POPK.length; i++) {
      var a = POPK[i], b = POPK[i + 1];
      if (p <= b[0]) {
        var k = (p - a[0]) / (b[0] - a[0]);
        if (a[1] <= 0) return b[1] * k;
        return Math.exp(lerp(Math.log(a[1]), Math.log(b[1]), k));
      }
    }
    return 1;
  }
  function fmtPop(n) {
    n = Math.max(0, num(n, 0));
    if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1).replace(/\.0$/, "") + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e8 ? 0 : 1).replace(/\.0$/, "") + "M";
    if (n >= 1e4) return Math.round(n / 1e3) + "k";
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
    return String(Math.round(n));
  }
  function fmtYear(y, o) {
    o = obj(o);
    y = Math.floor(num(y, 0) + 1e-6);
    if (o.now != null && y >= Math.floor(num(o.now, 1e9))) return "NOW";
    if (y < 0) return -y + " BC";
    return String(y);
  }

  // ========================= presets (terrain + plan) =========================
  // World units are grid cells: x east, y south, z up. The city zone is x 4..42, y 4.5..31.5.
  var NX = 46, NY = 36, ZX0 = 4, ZX1 = 42, ZY0 = 4.5, ZY1 = 31.5;
  function islandPreset() {
    var T = [17, 30.5], dir = [0.362, -0.932], per = [0.932, 0.362];
    function at(t, s) { return [T[0] + dir[0] * t + per[0] * s, T[1] + dir[1] * t + per[1] * s]; }
    function ts(x, y) { var dx = x - T[0], dy = y - T[1]; return [dx * dir[0] + dy * dir[1], dx * per[0] + dy * per[1]]; }
    return {
      id: "island", sub: "an island between two rivers",
      mask: function (x, y) {
        var q = ts(x, y), t = q[0], s = q[1];
        var isl = 5.4 - Math.abs(s - 0.6 * Math.sin(t * 0.12));
        if (t < 3) isl -= (3 - t) * 1.5;
        var west = -s - 10.2 - Math.max(0, y - 29) * 0.8;
        var east = s - 9.6 - Math.max(0, y - 27) * 0.9;
        var c = at(-3, -6), islet = 1.5 - Math.hypot(x - c[0], y - c[1]);
        return Math.max(isl, west, east, islet);
      },
      hills: 0.22, forest: 0.44,
      origin: at(3.4, 0), cores: [at(5, 0.4), at(17, 0)],
      anchors: [at(4, 0), at(8, 3.6), at(15, 0), at(25.5, 0), at(11, 14), at(9, -14), at(22, 15), at(23, -14)],
      bridges: [{ s: at(8, 3), d: per, p: 0.66 }, { s: at(15, 3), d: per, p: 0.8 }, { s: at(12, -3), d: [-per[0], -per[1]], p: 0.88 }],
      rail: [at(9.5, 11.5), at(12, 22), at(14, 40)],
      park: function (x, y) { var q = ts(x, y); return q[0] > 21.5 && q[0] < 27.5 && Math.abs(q[1]) < 2.3; },
      second: function (x, y) { return Math.abs(ts(x, y)[1]) > 7.6; },
      yaw: 28, yawTall: 18,
    };
  }
  function bayPreset() {
    return {
      id: "bay", sub: "hills around a deep bay",
      mask: function (x, y) {
        var dx = (x - 23) / 10.5, dy = (y - 24.5) / 7.2, q = Math.sqrt(dx * dx + dy * dy), m = (q - 1) * 7.2;
        if (y > 27) m = Math.min(m, Math.abs(x - 13.5 - (y - 30) * 0.3) - 1.8);
        m = Math.min(m, x + 3, 38.5 - y);
        return m;
      },
      hills: 1.25, forest: 0.4,
      hillBias: function (x, y) { return clamp(0.4 + (24 - y) / 16 + (x - 23) / 30, 0, 1.4); },
      origin: [23, 16.4], cores: [[23.5, 14.8], [33, 19.5]],
      anchors: [[23, 15], [29, 17], [15, 12], [31, 10], [36, 25.5], [9.5, 21], [22, 7], [8, 28.5]],
      bridges: [{ s: [9.5, 31.5], d: [1, 0.05], p: 0.8 }, { s: [11.5, 22.5], d: [1, 0], p: 0.86 }],
      rail: [[36, 25.5], [43, 30], [62, 38]],
      park: function (x, y) { return Math.hypot(x - 13, y - 17.5) < 2.2; },
      yaw: 4, yawTall: 0,
    };
  }
  function desertPreset() {
    function xc(y) { return 20 + 2.6 * Math.sin(y * 0.23); }
    return {
      id: "desert", sub: "a creek on the desert coast", natural: "sand",
      mask: function (x, y) {
        var m = 31.5 - y + Math.sin(x * 0.2) * 0.8;
        if (y > 13) m = Math.min(m, Math.abs(x - xc(y)) - 1.25 * smooth((y - 13) / 5));
        return m;
      },
      hills: 0.12, forest: 2,
      origin: [15.6, 24], cores: [[27, 19], [33.5, 24], [39, 27]],
      anchors: [[15.6, 24], [22, 27.5], [27, 18], [37, 28], [11, 13], [8, 25], [30, 9], [40, 17]],
      bridges: [{ s: [14, 21], d: [1, 0], p: 0.86 }, { s: [16, 28], d: [1, 0], p: 0.93 }],
      rail: [[11, 13], [0, 10], [-30, 6]],
      park: null,
      oasis: function (x, y) { return y > 12 && Math.abs(x - xc(y)) < 4.5; },
      yaw: 0, yawTall: 80,
    };
  }
  function deltaPreset() {
    var ch = [
      { p: [[23, -40], [23, 8], [22, 12]], w: 1.6 },
      { p: [[22, 12], [15, 20], [9, 28], [6, 44]], w: 1.05 },
      { p: [[22, 12], [23.5, 20], [24, 28], [24, 44]], w: 1.5 },
      { p: [[22, 12], [30, 19], [36, 27], [38, 44]], w: 1.05 },
    ];
    return {
      id: "delta", sub: "islands in a river delta",
      mask: function (x, y) {
        var m = 33 - y;
        for (var i = 0; i < ch.length; i++) m = Math.min(m, polyDist(x, y, ch[i].p) - ch[i].w);
        return m;
      },
      hills: 0.08, forest: 0.5,
      origin: [20.8, 21], cores: [[21, 20], [27.5, 21]],
      anchors: [[20.5, 21], [21.6, 25], [27.5, 20.5], [16, 13], [31, 28], [12, 24], [30, 10], [8, 15]],
      bridges: [{ s: [20, 17], d: [1, 0], p: 0.72 }, { s: [20, 25.5], d: [1, 0], p: 0.9 }, { s: [12, 21], d: [1, 0.25], p: 0.8 }, { s: [26.5, 16], d: [1, -0.3], p: 0.85 }],
      rail: [[31, 28], [40, 24], [70, 20]],
      park: null,
      yaw: 2, yawTall: 0,
    };
  }
  function lakePreset() {
    var river = [[-40, 13], [8, 13.5], [22, 16.3], [31.5, 16]], branch = [[22, 16.3], [20, 24], [14, 34], [8, 52]];
    return {
      id: "lake", sub: "a river mouth on a great lake",
      mask: function (x, y) {
        var m = 31 + 1.4 * Math.sin(y * 0.26) - x;
        m = Math.min(m, polyDist(x, y, river) - 0.9, polyDist(x, y, branch) - 0.75);
        return m;
      },
      hills: 0.06, forest: 0.46,
      origin: [28.3, 14.5], cores: [[27, 18], [26.5, 10]],
      anchors: [[27, 18.6], [29.4, 23], [26, 9.5], [16, 9.5], [17, 22.5], [10, 16], [24, 28], [9, 6]],
      bridges: [{ s: [19, 13.4], d: [0, 1], p: 0.55 }, { s: [25.5, 14.2], d: [0, 1], p: 0.62 }, { s: [17, 21.5], d: [1, 0], p: 0.7 }, { s: [29.4, 13.5], d: [0, 1], p: 0.76 }],
      rail: [[17, 22.5], [8, 30], [-30, 42]],
      park: function (x, y) { return x > 27.6 && y > 20.5 && y < 25 && x < 32; },
      yaw: 270, yawTall: 262,
    };
  }
  function peninsulaPreset() {
    function xc(y) { return 22 + 1.5 * Math.sin(y / 6); }
    return {
      id: "peninsula", sub: "a hilly peninsula on a strait",
      mask: function (x, y) {
        var hw = y < 17 ? 8 : 8 * Math.sqrt(clamp((27.5 - y) / 10.5, 0, 1));
        var m = hw - Math.abs(x - xc(y));
        if (y > 27.5) m = Math.min(m, -(y - 27.5) * 1.5);
        var east = x - 37 - Math.max(0, y - 30) * 0.7 + 0.7 * Math.sin(y * 0.3);
        return Math.max(m, east);
      },
      hills: 0.75, forest: 0.42,
      hillBias: function (x, y) { return clamp(1 - Math.abs(x - xc(y)) / 7, 0.15, 1); },
      origin: [22.5, 24.5], cores: [[22.5, 19], [41, 15]],
      anchors: [[22.5, 24], [27, 25], [21, 15], [23, 7], [40, 22], [16.5, 20], [41, 10], [19, 4.8]],
      bridges: [{ s: [28, 12], d: [1, 0], p: 0.86 }, { s: [28, 19.5], d: [1, 0], p: 0.93 }],
      rail: [[22, 19], [20.5, 5], [18, -30]],
      park: null,
      second: function (x) { return x > 34; },
      yaw: 0, yawTall: 0,
    };
  }
  function riverPreset() {
    function yc(x) { return 17.5 + 4.2 * Math.sin(x * 0.16 + 0.5); }
    return {
      id: "river", sub: "a winding river on a wide plain",
      mask: function (x, y) { return Math.abs(y - yc(x)) - 1.5 - 0.3 * Math.sin(x * 0.5); },
      hills: 0.18, forest: 0.45,
      origin: [20, yc(20) - 2.6], cores: [[21, yc(21) - 3], [35, yc(35) - 3]],
      anchors: [[20, yc(20) - 2.6], [21, yc(21) + 2.8], [13, yc(13) - 5], [29, yc(29) - 6], [34, yc(34) + 5.5], [10, yc(10) + 5], [24, yc(24) + 8], [39, yc(39) - 7]],
      bridges: [{ s: [17, yc(17) - 3], d: [0, 1], p: 0.36 }, { s: [23, yc(23) - 3], d: [0, 1], p: 0.55 }, { s: [29, yc(29) - 3], d: [0, 1], p: 0.68 }, { s: [12, yc(12) - 3], d: [0, 1], p: 0.8 }, { s: [36, yc(36) - 3], d: [0, 1], p: 0.9 }],
      rail: [[34, yc(34) + 5.5], [44, yc(44) + 6], [80, 30]],
      park: function (x, y) { return Math.hypot(x - 14, y - (yc(14) + 4.5)) < 1.9; },
      yaw: 0, yawTall: 78,
    };
  }
  var PRESET_FNS = { island: islandPreset, bay: bayPreset, desert: desertPreset, delta: deltaPreset, lake: lakePreset, peninsula: peninsulaPreset, river: riverPreset };
  var PRESET_IDS = Object.keys(PRESET_FNS);

  // ========================= architecture styles =========================
  var KIND = {
    hut: { roof: "gable", fs: 0.42, rh: 0.55 },
    house: { roof: "gable", fs: 0.6, rh: 0.45 },
    stone: { roof: "gable", fs: 0.82, rh: 0.36, win: 1 },
    row: { roof: "flat", fs: 1, win: 1 },
    brick: { roof: "flat", fs: 1, win: 1 },
    factory: { roof: "flat", fs: 1, chimney: 1 },
    early: { roof: "setback", fs: 0.92, win: 1 },
    apart: { roof: "flat", fs: 0.9, win: 1 },
    glass: { roof: "crown", fs: 0.84, win: 1, glass: 1 },
    slab: { roof: "flat", fs: 0.88, win: 1 },
    villa: { roof: "hip", fs: 0.58, rh: 0.5 },
  };
  var STYLES = {
    american: {
      bw: 2, bd: 3, av: 8, oldR: 4.2, jit: 0.08, rot: 0.2, inset: [0.035, 0.17], sigma: 6.5, sigmaT: 4.3, spread: 1, plan: true,
      names: ["Old Town", "Harbor", "Midtown", "Uptown", "Factory Row", "Riverside", "Heights", "West End"],
      pal: {
        hut: [[122, 96, 66], [150, 126, 80]], house: [[170, 136, 98], [104, 76, 58]], stone: [[184, 170, 150], [92, 88, 96]],
        row: [[146, 88, 68], [84, 72, 68]], brick: [[152, 92, 70], [96, 84, 80]], factory: [[128, 80, 62], [92, 86, 84]],
        early: [[212, 200, 176], [180, 168, 148]], apart: [[176, 160, 140], [120, 116, 112]], glass: [[102, 142, 172], [168, 190, 206]],
        slab: [[184, 180, 172], [140, 138, 134]], villa: [[222, 212, 192], [118, 86, 72]],
      },
      ground: [96, 98, 104], dirt: [176, 152, 110],
    },
    european: {
      bw: 3, bd: 3, av: 0, oldR: 7.5, jit: 0.1, rot: 0.26, inset: [0.04, 0.16], sigma: 5, sigmaT: 3.6, spread: 0.9, plan: false,
      names: ["Old Quarter", "Quayside", "Cathedral Hill", "New Town", "Mill District", "Market Ward", "Garden Suburb", "Station Quarter"],
      pal: {
        hut: [[126, 100, 70], [160, 134, 84]], house: [[190, 170, 136], [150, 86, 62]], stone: [[222, 208, 182], [176, 90, 62]],
        row: [[206, 186, 152], [164, 84, 62]], brick: [[180, 120, 92], [150, 82, 64]], factory: [[140, 92, 72], [100, 92, 90]],
        early: [[214, 204, 184], [150, 146, 140]], apart: [[214, 200, 176], [160, 96, 74]], glass: [[118, 150, 172], [180, 196, 206]],
        slab: [[196, 190, 180], [150, 146, 140]], villa: [[226, 214, 192], [168, 86, 62]],
      },
      ground: [118, 112, 106], dirt: [178, 156, 116],
    },
    desert: {
      bw: 2, bd: 2, av: 6, oldR: 3.2, jit: 0.07, rot: 0.18, inset: [0.08, 0.25], sigma: 4.2, sigmaT: 3.4, spread: 1.12, plan: true, flat: true,
      names: ["Old Market", "Creekside", "Downtown", "Marina", "Industrial Zone", "Oasis Park", "Sand Hills", "Airport Road"],
      pal: {
        hut: [[190, 164, 124], [214, 190, 146]], house: [[214, 190, 150], [222, 200, 160]], stone: [[222, 204, 166], [230, 212, 176]],
        row: [[224, 208, 176], [214, 196, 164]], brick: [[200, 180, 150], [186, 170, 146]], factory: [[170, 150, 124], [150, 140, 128]],
        early: [[226, 214, 190], [200, 190, 170]], apart: [[228, 214, 186], [196, 186, 168]], glass: [[112, 166, 190], [196, 214, 222]],
        slab: [[222, 214, 198], [190, 182, 170]], villa: [[236, 226, 206], [200, 170, 140]],
      },
      ground: [176, 164, 142], dirt: [200, 178, 136],
    },
    asian: {
      bw: 3, bd: 2, av: 7, oldR: 4.5, jit: 0.08, rot: 0.2, inset: [0.04, 0.15], sigma: 9, sigmaT: 6, spread: 0.95, plan: true, hip: true,
      names: ["Old Town", "Harbourfront", "Central", "Temple Hill", "Dockyards", "Garden District", "New Town", "Tech Park"],
      pal: {
        hut: [[136, 108, 76], [120, 104, 80]], house: [[182, 160, 128], [66, 72, 86]], stone: [[196, 184, 164], [70, 76, 90]],
        row: [[180, 170, 156], [110, 108, 108]], brick: [[160, 120, 100], [100, 96, 96]], factory: [[132, 100, 84], [96, 96, 98]],
        early: [[204, 196, 180], [160, 156, 150]], apart: [[196, 190, 180], [130, 130, 132]], glass: [[92, 132, 164], [160, 186, 204]],
        slab: [[198, 196, 190], [150, 150, 150]], villa: [[214, 204, 186], [80, 84, 96]],
      },
      ground: [102, 102, 108], dirt: [170, 150, 112],
    },
  };
  var STYLE_IDS = Object.keys(STYLES);
  // Default landmarks per style: [kind, name, where, p, pEnd]
  var AUTO_LMK = {
    american: [["fort", "The fort", "origin", 0.085, 0.6], ["church", "Old church", "core", 0.3], ["cityhall", "City hall", "core", 0.5], ["station", "Central station", "rail", 0.64], ["earlytower", "First tower", "core", 0.8], ["spire", "Sky tower", "core1", 0.84], ["supertall", "One tower", "core", 0.92], ["stadium", "Stadium", "d6", 0.9]],
    european: [["fort", "The fort", "origin", 0.09, 0.42], ["cathedral", "Cathedral", "core", 0.3], ["townhall", "Town hall", "core", 0.42], ["dome", "Great dome", "d2", 0.6], ["station", "Central station", "rail", 0.64], ["tower", "Business tower", "core1", 0.91], ["tvtower", "TV tower", "d3", 0.9], ["ferris", "The wheel", "d1", 0.92]],
    desert: [["fort", "The fort", "origin", 0.09], ["dome", "Grand dome", "core", 0.5], ["watertower", "Water tower", "d4", 0.6], ["tower", "Twin tower", "core1", 0.91], ["supertall", "The spire", "core1", 0.93], ["stadium", "Stadium", "d6", 0.9], ["ferris", "The wheel", "d3", 0.92]],
    asian: [["pagoda", "Old pagoda", "origin", 0.22], ["temple", "Temple", "d3", 0.3], ["station", "Central station", "rail", 0.66], ["earlytower", "First tower", "core", 0.8], ["tvtower", "TV tower", "core1", 0.9], ["supertall", "Sky tower", "core1", 0.93], ["ferris", "The wheel", "d1", 0.92]],
  };
  // Landmark specs: footprint (w x d), height, clear radius, default p.
  var LMK = {
    tower: { w: 0.9, d: 0.9, h: 7, clear: 0 }, supertall: { w: 1.1, d: 1.1, h: 15, clear: 0.8 }, earlytower: { w: 0.9, d: 0.9, h: 4.6, clear: 0 },
    spire: { w: 0.95, d: 0.95, h: 9.5, clear: 0 }, tvtower: { w: 0.7, d: 0.7, h: 11, clear: 0.8 }, dome: { w: 1.5, d: 1.5, h: 1.7, clear: 1 },
    arch: { w: 2.2, d: 0.5, h: 3, clear: 1.2 }, obelisk: { w: 0.5, d: 0.5, h: 3.2, clear: 1 }, stadium: { w: 2.8, d: 2.2, h: 0.6, clear: 1.6 },
    ferris: { w: 1.6, d: 0.6, h: 2.6, clear: 1 }, pagoda: { w: 0.9, d: 0.9, h: 2, clear: 0.8 }, cathedral: { w: 1.8, d: 0.9, h: 1.7, clear: 1 },
    church: { w: 0.9, d: 0.6, h: 1.5, clear: 0 }, temple: { w: 1.5, d: 1.1, h: 0.9, clear: 1 }, cityhall: { w: 1.6, d: 0.9, h: 2.1, clear: 0.9 },
    townhall: { w: 1.2, d: 0.8, h: 1.5, clear: 0.6 }, station: { w: 1.8, d: 0.9, h: 0.55, clear: 1 }, depot: { w: 1.6, d: 0.8, h: 0.45, clear: 0.8 },
    watertower: { w: 0.7, d: 0.7, h: 1.2, clear: 0 }, fort: { w: 1.9, d: 1.9, h: 0.32, clear: 1.3 }, citadel: { w: 2.2, d: 2.2, h: 0.7, clear: 1.5 },
    mission: { w: 1, d: 0.7, h: 0.75, clear: 0.6 }, cranes: { w: 1, d: 1, h: 3, clear: 0 },
  };
  var LMK_KINDS = Object.keys(LMK);
  var GUESS = [
    [/new york|manhattan/, "island", "american"], [/chicago/, "lake", "american"], [/san francisco|seattle|oakland/, "bay", "american"],
    [/boston/, "peninsula", "american"], [/new orleans/, "delta", "american"], [/london|paris|rome|berlin|vienna|prague|budapest/, "river", "european"],
    [/amsterdam|venice|stockholm|st\.? petersburg/, "delta", "european"], [/istanbul|lisbon|naples|copenhagen/, "peninsula", "european"],
    [/tokyo|hong kong|sydney|rio/, "bay", "asian"], [/shanghai|bangkok|guangzhou|saigon|ho chi minh/, "delta", "asian"],
    [/dubai|las vegas|phoenix|riyadh|doha|abu dhabi|cairo/, "desert", "desert"], [/mumbai|singapore|seoul|taipei/, "peninsula", "asian"],
    [/toronto|cleveland|detroit/, "lake", "american"], [/montreal|pittsburgh|st\.? louis|minneapolis/, "river", "american"],
  ];
  function guess(city) {
    var s = str(city).toLowerCase();
    for (var i = 0; i < GUESS.length; i++) if (GUESS[i][0].test(s)) return { preset: GUESS[i][1], style: GUESS[i][2] };
    return { preset: "island", style: "american" };
  }
  function cityOpts(o) {
    o = obj(o);
    var g = guess(o.city || o.cityName);
    var preset = PRESET_FNS[str(o.preset).toLowerCase()] ? str(o.preset).toLowerCase() : g.preset;
    var style = STYLES[str(o.style).toLowerCase()] ? str(o.style).toLowerCase() : g.style;
    var seed = int(o.seed, 7);
    var names = arr(o.districts).map(str).filter(Boolean).slice(0, 8);
    return { preset: preset, style: style, seed: seed, cityName: str(o.city || o.cityName) || "New Harbor", districts: names, popNow: Math.max(1000, num(o.population != null ? o.population : o.popNow, 8000000)), keyDates: o.keyDates };
  }

  // ========================= the model =========================
  var MODELS = {};
  function axisCoords(n) {
    var steps = [2, 2, 3, 4, 6, 9, 14, 22, 40], out = [], acc = 0, k;
    for (k = 0; k < steps.length; k++) { acc += steps[k]; out.unshift(-acc); }
    for (k = 0; k <= n; k++) out.push(k);
    acc = n;
    for (k = 0; k < steps.length; k++) { acc += steps[k]; out.push(acc); }
    return out;
  }
  function square(cx, cy, w, d, ang) {
    var hw = num(w, 0.8) / 2, hd = num(d, w) / 2, c = Math.cos(ang || 0), s = Math.sin(ang || 0);
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(function (q) { return [cx + q[0] * c - q[1] * s, cy + q[0] * s + q[1] * c]; });
  }
  function scaleFp(fp, k) {
    var cx = 0, cy = 0;
    fp.forEach(function (q) { cx += q[0]; cy += q[1]; });
    cx /= fp.length; cy /= fp.length;
    return fp.map(function (q) { return [cx + (q[0] - cx) * k, cy + (q[1] - cy) * k]; });
  }
  function clipCell(P, L, flatZ) {
    var out = [];
    for (var i = 0; i < 4; i++) {
      var a = P[i], b = P[(i + 1) & 3], ina = a[3] >= L, inb = b[3] >= L;
      if (ina) out.push([a[0], a[1], flatZ != null ? flatZ : a[2]]);
      if (ina !== inb) {
        var k = (L - a[3]) / (b[3] - a[3]);
        out.push([lerp(a[0], b[0], k), lerp(a[1], b[1], k), flatZ != null ? flatZ : lerp(a[2], b[2], k), 1]);
      }
    }
    return out.length >= 3 ? out : null;
  }
  // R(p): how far from the origin the city reaches at progress p (cells).
  var RK = [[0, 0], [0.08, 0.9], [0.2, 2.7], [0.34, 5], [0.48, 7.6], [0.62, 12], [0.76, 18], [0.9, 26], [1, 34]];
  function Rinv(d, k) {
    d = d / (k || 1);
    if (d <= RK[1][1]) return RK[1][0] + (d / RK[1][1]) * 0.004;
    for (var i = 1; i + 1 < RK.length; i++) if (d <= RK[i + 1][1]) return lerp(RK[i][0], RK[i + 1][0], (d - RK[i][1]) / (RK[i + 1][1] - RK[i][1]));
    return 1 + (d - RK[RK.length - 1][1]) * 0.02;
  }
  function findBridge(maskAt, s, d, maxLen) {
    var l = Math.hypot(d[0], d[1]) || 1, dx = d[0] / l, dy = d[1] / l, step = 0.2, x = s[0], y = s[1], a = null, b = null;
    if (maskAt(x, y) <= 0.3) return null;
    for (var k = 0; k < 220; k++) {
      var nx = x + dx * step, ny = y + dy * step, m = maskAt(nx, ny);
      if (!a) { if (m <= 0.2) a = [x, y]; }
      else if (m > 0.4) { b = [nx, ny]; break; }
      x = nx; y = ny;
    }
    if (!a || !b) return null;
    var len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1.2 || len > maxLen) return null;
    return { a: [a[0] - dx * 0.6, a[1] - dy * 0.6], b: [b[0] + dx * 0.6, b[1] + dy * 0.6] };
  }

  function buildModel(o) {
    var pr = PRESET_FNS[o.preset](), cfg = STYLES[o.style], seed = o.seed;
    var M = { preset: o.preset, style: o.style, seed: seed, cityName: o.cityName, popNow: o.popNow, pr: pr, cfg: cfg, sub: pr.sub };
    var nseed = seed * 13 + 5;
    function maskAt(x, y) { return pr.mask(x, y) + (fbm(x * 0.13, y * 0.13, nseed) - 0.5) * 1.5 + (vnoise(x * 0.45, y * 0.45, nseed + 3) - 0.5) * 0.45; }
    var hseed = seed * 7 + 11;
    function hillAt(x, y) {
      var bias = pr.hillBias ? pr.hillBias(x, y) : 1;
      var inZone = x > ZX0 - 2 && x < ZX1 + 2 && y > ZY0 - 2 && y < ZY1 + 2;
      return pr.hills * bias * (inZone ? 1 : 1.8) * fbm(x * 0.07, y * 0.07, hseed) * 1.6;
    }
    function heightOf(m, x, y) { return m <= 0 ? 0 : 0.035 + 0.2 * smooth(m / 5) + hillAt(x, y) * smooth((m - 1.5) / 5); }
    function heightAt(x, y) { return heightOf(maskAt(x, y), x, y); }
    M.maskAt = maskAt; M.heightAt = heightAt;

    // ---- terrain grid ----
    var xs = axisCoords(NX), ys = axisCoords(NY), nvx = xs.length, nvy = ys.length;
    var vm = new Float32Array(nvx * nvy), vz = new Float32Array(nvx * nvy), i, j;
    for (j = 0; j < nvy; j++) for (i = 0; i < nvx; i++) { var m0 = maskAt(xs[i], ys[j]); vm[j * nvx + i] = m0; vz[j * nvx + i] = heightOf(m0, xs[i], ys[j]); }
    var ix0 = xs.indexOf(0), iy0 = ys.indexOf(0);
    var cells = [], inner = new Array(NX * NY);
    for (j = 0; j + 1 < nvy; j++) for (i = 0; i + 1 < nvx; i++) {
      var P = [[xs[i], ys[j]], [xs[i + 1], ys[j]], [xs[i + 1], ys[j + 1]], [xs[i], ys[j + 1]]];
      var idx = [j * nvx + i, j * nvx + i + 1, (j + 1) * nvx + i + 1, (j + 1) * nvx + i];
      var Q = P.map(function (q, k) { return [q[0], q[1], vz[idx[k]], vm[idx[k]]]; });
      var allLand = Q.every(function (q) { return q[3] >= 0; });
      var land = clipCell(Q, 0), shallow = allLand ? null : clipCell(Q, -1.4, 0);
      if (!land && !shallow) continue;
      var cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
      var mC = (Q[0][3] + Q[1][3] + Q[2][3] + Q[3][3]) / 4, zC = (Q[0][2] + Q[1][2] + Q[2][2] + Q[3][2]) / 4;
      var ii = i - ix0, jj = j - iy0, isIn = ii >= 0 && ii < NX && jj >= 0 && jj < NY;
      var cell = { cx: cx, cy: cy, w: xs[i + 1] - xs[i], h: ys[j + 1] - ys[j], land: land, shallow: shallow, m: mC, z: zC, inner: isIn, ii: ii, jj: jj, h0: hash3(i, j, seed + 99), fz: fbm(cx * 0.11, cy * 0.11, seed + 9) };
      // normal of the land quad (for shading)
      var gx = (Q[1][2] + Q[2][2] - Q[0][2] - Q[3][2]) / (2 * cell.w), gy = (Q[3][2] + Q[2][2] - Q[0][2] - Q[1][2]) / (2 * cell.h);
      var nl = Math.sqrt(gx * gx + gy * gy + 1);
      cell.n = [-gx / nl, -gy / nl, 1 / nl];
      if (land) {
        var shore = [];
        land.forEach(function (q) { if (q[3]) shore.push([q[0], q[1]]); });
        if (shore.length >= 2) cell.shore = shore;
        var nat = "grass";
        if (pr.natural === "sand") nat = "sand";
        else if (mC < 0.9) nat = "beach";
        else if (zC > 1.25) nat = "rock";
        else if (fbm(cx * 0.11, cy * 0.11, seed + 9) > pr.forest) nat = "forest";
        if (pr.natural === "sand" && mC < 0.9) nat = "beach";
        cell.nat = nat;
      }
      cells.push(cell);
      if (isIn) inner[jj * NX + ii] = cell;
    }
    M.terrain = { xs: xs, ys: ys, cells: cells, inner: inner };
    // water glints
    var glints = [];
    for (i = 0; glints.length < 220 && i < 1400; i++) {
      var gx2 = lerp(-6, NX + 6, hash3(i, 1, seed + 3)), gy2 = lerp(-6, NY + 8, hash3(i, 2, seed + 3));
      if (maskAt(gx2, gy2) < -0.7) glints.push({ x: gx2, y: gy2, ph: hash3(i, 3, seed) * 6.28, sp: 0.6 + hash3(i, 4, seed) * 1.4, len: 0.25 + hash3(i, 5, seed) * 0.5 });
    }
    M.glints = glints;

    // ---- plan anchors ----
    var origin = pr.origin.slice();
    M.lots = []; M.landmarks = []; M.parkCells = [];
    var lotAt = new Array(NX * NY);
    var baseAng = (hash(seed * 3 + 1) - 0.5) * 0.3;
    for (j = 0; j < NY; j++) for (i = 0; i < NX; i++) {
      var x = i + 0.5, y = j + 0.5;
      if (x < ZX0 || x > ZX1 || y < ZY0 || y > ZY1) continue;
      var c4 = [maskAt(i, j), maskAt(i + 1, j), maskAt(i + 1, j + 1), maskAt(i, j + 1)];
      if (Math.min.apply(null, c4) < 0.55) continue;
      var zs = [heightAt(i + 0.15, j + 0.15), heightAt(i + 0.85, j + 0.15), heightAt(i + 0.85, j + 0.85), heightAt(i + 0.15, j + 0.85)];
      if (Math.max.apply(null, zs) - Math.min.apply(null, zs) > 0.45) continue;
      if (pr.park && pr.park(x, y)) { M.parkCells.push(j * NX + i); continue; }
      var dO = Math.hypot(x - origin[0], y - origin[1]);
      var r1 = hash3(i, j, seed * 5 + 1), r2 = hash3(i, j, seed * 5 + 2), r3 = hash3(i, j, seed * 5 + 3), r4 = hash3(i, j, seed * 5 + 4);
      var old = dO < cfg.oldR + (r4 - 0.5) * 1.6;
      if (cfg.av && !old && i % cfg.av === cfg.av - 1) continue;
      var fp;
      if (old || !cfg.plan) {
        var jit = old ? cfg.jit : cfg.jit * 0.45, rot = old ? cfg.rot : cfg.rot * 0.3;
        var ang = baseAng + (r3 - 0.5) * 2 * rot + (old ? Math.sin(x * 0.4 + y * 0.3) * 0.15 : 0);
        var sz = old ? 0.72 + r2 * 0.12 : 0.8;
        fp = square(x + (r1 - 0.5) * 2 * jit, y + (r2 - 0.5) * 2 * jit, sz, sz * (0.9 + r1 * 0.14), ang);
      } else {
        var ins = cfg.inset, bw = cfg.bw, bd = cfg.bd;
        var l0 = i % bw === 0 ? ins[1] : ins[0], l1 = (i + 1) % bw === 0 ? ins[1] : ins[0];
        var t0 = j % bd === 0 ? ins[1] : ins[0], t1 = (j + 1) % bd === 0 ? ins[1] : ins[0];
        if (cfg.av && i % cfg.av === 0) l0 = ins[1] * 1.2;
        if (cfg.av && (i + 1) % cfg.av === cfg.av - 1) l1 = ins[1] * 1.2;
        fp = [[i + l0, j + t0], [i + 1 - l1, j + t0], [i + 1 - l1, j + 1 - t1], [i + l0, j + 1 - t1]];
      }
      var dd = dO * (1 + (fbm(x * 0.2, y * 0.2, seed + 21) - 0.5) * 0.5) + (pr.second && pr.second(x, y) ? 7 : 0);
      var born = Rinv(dd, cfg.spread) + (r4 - 0.5) * 0.025;
      if (born > 1.0) continue;
      var lot = { x: x, y: y, i: i, j: j, fp: fp, z0: (zs[0] + zs[1] + zs[2] + zs[3]) / 4, born: Math.max(0.08, born), old: old, r: [r1, r2, r3, r4, hash3(i, j, seed * 5 + 6), hash3(i, j, seed * 5 + 7)], stages: [], district: 0 };
      M.lots.push(lot);
      lotAt[j * NX + i] = lot;
    }
    M.lotAt = lotAt;
    function nearestLot(pt, maxD) {
      var best = null, bd2 = (maxD || 99) * (maxD || 99);
      M.lots.forEach(function (l) { var d2 = (l.x - pt[0]) * (l.x - pt[0]) + (l.y - pt[1]) * (l.y - pt[1]); if (d2 < bd2) { bd2 = d2; best = l; } });
      return best;
    }
    var oL = nearestLot(origin, 8);
    M.origin = oL ? [oL.x, oL.y] : origin;
    M.cores = pr.cores.map(function (c) { var l = nearestLot(c, 6); return l ? [l.x, l.y] : c.slice(); });
    M.bbox = { x0: ZX0, y0: ZY0, x1: ZX1, y1: ZY1 };

    // ---- districts ----
    var names = cfg.names.slice();
    o.districts.forEach(function (n, k) { names[k] = n; });
    var nD = Math.max(1, Math.min(8, Math.max(o.districts.length, 8)));
    M.districts = [];
    for (var k = 0; k < nD; k++) {
      var an = pr.anchors[k % pr.anchors.length], dl = nearestLot(an, 7);
      M.districts.push({ name: names[k] || "District " + (k + 1), key: slug(names[k] || "district" + k), cx: dl ? dl.x : an[0], cy: dl ? dl.y : an[1], z: dl ? dl.z0 : 0.1, index: k, lots: [], born: 2 });
    }
    M.lots.forEach(function (l) {
      var best = 0, bd3 = 1e9;
      M.districts.forEach(function (d, k2) { var d2 = (l.x - d.cx) * (l.x - d.cx) + (l.y - d.cy) * (l.y - d.cy); if (d2 < bd3) { bd3 = d2; best = k2; } });
      l.district = best;
      M.districts[best].lots.push(l);
    });
    var indD = M.districts[4];
    if (indD) indD.lots.forEach(function (l) {
      var dI = Math.hypot(l.x - indD.cx, l.y - indD.cy);
      l.born = Math.min(l.born, ERAS[5].p + 0.012 + 0.08 * clamp(dI / 7, 0, 1) + l.r[3] * 0.02);
    });
    M.districts.forEach(function (d) {
      if (!d.lots.length) return;
      var bs = d.lots.map(function (l) { return l.born; }).sort(function (a, b) { return a - b; });
      d.born = bs[Math.min(bs.length - 1, Math.floor(bs.length * 0.12))];
    });

    // ---- growth stages ----
    M.lots.forEach(function (l) {
      var dc = 1e9, dens = 0, densT = 0;
      M.cores.forEach(function (c, k3) {
        var d = Math.hypot(l.x - c[0], l.y - c[1]);
        dc = Math.min(dc, d);
        var w = Math.exp(-(d * d) / (cfg.sigma * cfg.sigma)) * (k3 === 0 ? 1 : 0.92), wt = Math.exp(-(d * d) / (cfg.sigmaT * cfg.sigmaT)) * (k3 === 0 ? 1 : 0.95);
        dens = Math.max(dens, w);
        if (o.style !== "european" || k3 === 1) densT = Math.max(densT, wt);
      });
      l.dens = dens; l.densT = o.style === "european" && l.old ? 0 : densT; l.dCoreN = clamp(dc / 20, 0, 1);
      l.stages = genStages(M, l);
    });

    // ---- streets ----
    var streets = [];
    function lotOk(ii, jj) { return ii >= 0 && jj >= 0 && ii < NX && jj < NY ? lotAt[jj * NX + ii] : null; }
    var planP = cfg.plan ? ERAS[4].p : null;
    function segBorn(la, lb, x, y) {
      var b = Math.min(la ? la.born : 9, lb ? lb.born : 9) - 0.012;
      if (planP != null && !(la && la.old) && !(lb && lb.old)) {
        var dO2 = Math.hypot(x - M.origin[0], y - M.origin[1]);
        b = Math.min(b, Math.max(planP + 0.07 * clamp(dO2 / 28, 0, 1), b - 0.2));
      }
      return b;
    }
    for (j = 0; j < NY; j++) for (i = 0; i <= NX; i++) {
      var vx = i, vy = j + 0.5;
      if (vx < ZX0 || vx > ZX1 || vy < ZY0 || vy > ZY1) continue;
      var vert = cfg.plan ? i % cfg.bw === 0 : i % 3 === 0;
      if (!vert || maskAt(vx, vy) < 0.4) continue;
      var a1 = lotOk(i - 1, j), b1 = lotOk(i, j);
      if (!a1 && !b1 && !(cfg.av && (i % cfg.av === cfg.av - 1 || i % cfg.av === 0))) continue;
      if ((a1 && a1.old) && (b1 && b1.old)) continue;
      var sb = segBorn(a1, b1, vx, vy);
      if (sb < 1.2) streets.push({ ax: vx, ay: j, bx: vx, by: j + 1, born: sb, w: 1 });
    }
    for (j = 0; j <= NY; j++) for (i = 0; i < NX; i++) {
      var hx = i + 0.5, hy = j;
      if (hx < ZX0 || hx > ZX1 || hy < ZY0 || hy > ZY1) continue;
      var hor = cfg.plan ? j % cfg.bd === 0 : j % 3 === 0;
      if (!hor || maskAt(hx, hy) < 0.4) continue;
      var a2 = lotOk(i, j - 1), b2 = lotOk(i, j);
      if (!a2 && !b2) continue;
      if ((a2 && a2.old) && (b2 && b2.old)) continue;
      var sb2 = segBorn(a2, b2, hx, hy);
      if (sb2 < 1.2) streets.push({ ax: i, ay: hy, bx: i + 1, by: hy, born: sb2, w: 1 });
    }
    if (cfg.av) for (i = 0; i < NX; i++) {
      if (i % cfg.av !== cfg.av - 1) continue;
      for (j = 0; j < NY; j++) {
        var ax2 = i + 0.5, ay2 = j + 0.5;
        if (ax2 < ZX0 || ax2 > ZX1 || ay2 < ZY0 || ay2 > ZY1 || maskAt(ax2, ay2) < 0.5) continue;
        var nb = lotOk(i - 1, j) || lotOk(i + 1, j);
        if (!nb) continue;
        streets.push({ ax: ax2, ay: j, bx: ax2, by: j + 1, born: segBorn(lotOk(i - 1, j), lotOk(i + 1, j), ax2, ay2) - 0.01, w: 1.7 });
      }
    }
    M.streets = streets;
    // old roads: a few winding roads out of the origin
    M.oldRoads = [];
    for (k = 0; k < 4; k++) {
      var ang2 = hash(seed * 11 + k) * 2 * PI, px0 = M.origin[0], py0 = M.origin[1], pts = [[px0, py0, 0.08]];
      for (var st = 0; st < 34; st++) {
        ang2 += (hash3(k, st, seed) - 0.5) * 0.5;
        var nx = px0 + Math.cos(ang2) * 0.9, ny = py0 + Math.sin(ang2) * 0.9;
        if (maskAt(nx, ny) < 0.6) {
          var turned = false;
          for (var tr = 1; tr <= 4 && !turned; tr++) {
            var a3 = ang2 + (tr % 2 ? 1 : -1) * Math.ceil(tr / 2) * 0.6;
            var qx = px0 + Math.cos(a3) * 0.9, qy = py0 + Math.sin(a3) * 0.9;
            if (maskAt(qx, qy) >= 0.6) { ang2 = a3; nx = qx; ny = qy; turned = true; }
          }
          if (!turned) break;
        }
        if (nx < ZX0 - 1 || nx > ZX1 + 1 || ny < ZY0 - 1 || ny > ZY1 + 1) break;
        px0 = nx; py0 = ny;
        pts.push([px0, py0, Rinv(Math.hypot(px0 - M.origin[0], py0 - M.origin[1]), cfg.spread) - 0.03]);
      }
      if (pts.length > 3) M.oldRoads.push(pts);
    }

    // ---- cell development: farms, streets, suburbs ----
    M.terrain.cells.forEach(function (c) {
      c.pU = 9; c.pF = 9; c.park = false;
      if (!c.land) return;
      if (c.inner) {
        var l = lotAt[c.jj * NX + c.ii];
        if (l) c.pU = l.born - 0.012;
        else {
          for (var dj = -1; dj <= 1; dj++) for (var di = -1; di <= 1; di++) { var n2 = lotOk(c.ii + di, c.jj + dj); if (n2) c.pU = Math.min(c.pU, n2.born - 0.008); }
        }
        if (M.parkCells.indexOf(c.jj * NX + c.ii) >= 0) { c.park = true; c.pU = 9; }
      }
      var dO3 = Math.hypot(c.cx - M.origin[0], c.cy - M.origin[1]);
      var farmOk = c.nat !== "rock" && c.nat !== "beach" && (pr.natural !== "sand" || (pr.oasis && pr.oasis(c.cx, c.cy)));
      if (farmOk) c.pF = Math.max(0.12, Rinv(dO3 * 0.62, cfg.spread) - 0.02);
      if (c.pU < 9) c.pF = Math.min(c.pF, Math.max(0.1, c.pU - 0.13));
      if (c.park) c.pF = 9;
      var inZone = c.cx > ZX0 - 10 && c.cx < ZX1 + 10 && c.cy > ZY0 - 10 && c.cy < ZY1 + 10;
      var dz = Math.max(0, Math.max(ZX0 - c.cx, c.cx - ZX1, ZY0 - c.cy, c.cy - ZY1));
      c.pS = !c.inner && inZone && c.nat !== "rock" ? 0.9 + 0.08 * clamp(dz / 10, 0, 1) : 9;
      if (c.inner && c.pU >= 9 && !c.park && c.cx > ZX0 - 1 && c.cx < ZX1 + 1) c.pS = 0.92;
      // trees
      c.trees = null;
      var ring = !c.inner && c.w <= 2.01 && c.h <= 2.01;
      if ((c.inner || ring) && (c.nat === "forest" || c.nat === "grass" || c.park || (pr.natural === "sand" && pr.oasis && pr.oasis(c.cx, c.cy)))) {
        var nT = c.park ? 3 : c.nat === "forest" ? (ring ? 6 : 3) : pr.natural === "sand" ? (c.h0 > 0.55 ? 1 : 0) : (c.h0 > 0.5 ? (ring ? 2 : 1) : 0);
        if (nT) {
          c.trees = [];
          for (var q = 0; q < nT; q++) {
            var tx = c.cx + (hash3(c.ii, c.jj, seed * 3 + q) - 0.5) * 0.7 * c.w, ty = c.cy + (hash3(c.jj, c.ii, seed * 3 + q + 9) - 0.5) * 0.7 * c.h;
            c.trees.push([tx, ty, heightAt(tx, ty), 0.2 + hash3(q, c.ii, c.jj) * 0.1]);
          }
        }
      }
    });

    // ---- landmarks ----
    var placeAt = {
      origin: M.origin, core: M.cores[0], core1: M.cores[1] || M.cores[0], rail: pr.rail[0],
    };
    (AUTO_LMK[o.style] || []).forEach(function (a) {
      var where = a[2], pt = placeAt[where];
      if (!pt && /^d\d$/.test(where)) { var dd2 = M.districts[+where[1]]; pt = dd2 ? [dd2.cx, dd2.cy] : null; }
      if (!pt) return;
      var Lm = addLandmarkImpl(M, a[0], a[1], { x: pt[0], y: pt[1], p: a[3], pEnd: a[4], maxD: 5, minBorn: 0 });
      if (Lm && Lm.lot.born > Lm.p) Lm.p = Math.min(0.99, Lm.lot.born + 0.01);
    });

    // ---- bridges ----
    M.bridges = [];
    pr.bridges.forEach(function (b, k4) {
      var B = findBridge(maskAt, b.s, b.d, 24);
      if (!B) return;
      var len = Math.hypot(B.b[0] - B.a[0], B.b[1] - B.a[1]);
      B.p = b.p; B.len = len; B.kind = b.p >= 0.7 && len > 4 ? "suspension" : len > 6 ? "truss" : "arch";
      B.name = len > 8 ? "Great bridge" : "Bridge " + (k4 + 1);
      M.bridges.push(B);
    });
    // ---- rail ----
    var rp = pr.rail.slice(), rl = [0];
    for (i = 1; i < rp.length; i++) rl.push(rl[i - 1] + Math.hypot(rp[i][0] - rp[i - 1][0], rp[i][1] - rp[i - 1][1]));
    M.rail = { pts: rp, cum: rl, len: rl[rl.length - 1], p: ERAS[5].p + 0.01 };
    // ---- boat lanes ----
    M.boatLanes = [];
    for (i = 0; M.boatLanes.length < 7 && i < 260; i++) {
      var bx0 = lerp(ZX0 - 6, ZX1 + 6, hash3(i, 7, seed + 41)), by0 = lerp(ZY0 - 6, ZY1 + 8, hash3(i, 8, seed + 41));
      if (maskAt(bx0, by0) > -1) continue;
      var ba = hash3(i, 9, seed) * 2 * PI, bl = 6 + hash3(i, 10, seed) * 10, bx1 = bx0 + Math.cos(ba) * bl, by1 = by0 + Math.sin(ba) * bl, ok = true;
      for (var sI = 1; sI <= 10 && ok; sI++) if (maskAt(lerp(bx0, bx1, sI / 10), lerp(by0, by1, sI / 10)) > -0.8) ok = false;
      if (ok) M.boatLanes.push({ a: [bx0, by0], b: [bx1, by1], len: bl, ph: hash3(i, 11, seed), sp: 0.35 + hash3(i, 12, seed) * 0.5 });
    }
    // ---- car runs: long straight streets ----
    var runs = {};
    streets.forEach(function (s) {
      var key = s.ax === s.bx ? "v" + s.ax : "h" + s.ay;
      (runs[key] = runs[key] || []).push(s);
    });
    M.carRuns = [];
    Object.keys(runs).forEach(function (key) {
      var ss = runs[key].slice().sort(function (a, b) { return a.ax + a.ay - (b.ax + b.ay); });
      var cur = null;
      ss.forEach(function (s) {
        if (cur && Math.abs(cur.bx - s.ax) < 0.01 && Math.abs(cur.by - s.ay) < 0.01) { cur.bx = s.bx; cur.by = s.by; cur.born = Math.max(cur.born, s.born); cur.n++; }
        else { if (cur && cur.n >= 6) M.carRuns.push(cur); cur = { ax: s.ax, ay: s.ay, bx: s.bx, by: s.by, born: s.born, n: 1 }; }
      });
      if (cur && cur.n >= 6) M.carRuns.push(cur);
    });
    M.carRuns.sort(function (a, b) { return b.n - a.n; });
    M.carRuns = M.carRuns.slice(0, 16);
    M.pop = function (p) { return M.popNow * popFrac(p); };
    return M;
  }

  function heightFor(kind, l, st) {
    var r = l.r[4], d = l.densT, h;
    switch (kind) {
      case "hut": h = 0.13 + 0.05 * r; break;
      case "house": h = 0.22 + 0.08 * r; break;
      case "stone": h = (st === "european" ? 0.42 : 0.34) + 0.18 * r; break;
      case "row": h = 0.48 + 0.3 * r + 0.2 * l.dens; break;
      case "brick": h = 0.7 + 0.5 * r + 0.4 * l.dens; break;
      case "factory": h = 0.5 + 0.25 * r; break;
      case "early": h = 1.3 + d * 4.4 + r * 2; break;
      case "apart": h = 1.0 + 0.8 * r + 0.6 * l.dens; break;
      case "glass": h = (2.0 + d * 6 + r * 2.4 + (d > 0.75 && l.r[5] > 0.86 ? 3.5 : 0)) * (st === "desert" ? 1.25 : st === "asian" ? 1.12 : st === "european" ? 0.8 : 1); break;
      case "slab": h = 1.3 + 1.1 * r; break;
      case "villa": h = 0.22 + 0.06 * r; break;
      default: h = 0.4;
    }
    return h;
  }
  function genStages(M, l) {
    var st = M.style, ind = l.district === 4, out = [], k;
    var e0 = Math.max(1, eraIndex(l.born));
    function first(e) {
      if (e <= 1) return "hut";
      if (e === 2) return "house";
      if (e === 3) return "stone";
      if (e === 4) return st === "european" && l.old ? "stone" : "row";
      if (e === 5) return ind ? "factory" : "brick";
      if (e === 6) return l.densT > 0.5 && l.r[3] < 0.75 && st !== "european" ? "early" : "apart";
      return l.densT > 0.38 ? "glass" : l.dens > 0.2 ? (l.r[5] < 0.5 ? "slab" : "apart") : "villa";
    }
    function up(e, cur, rr) {
      if (e === 2) return cur === "hut" && rr < 0.9 ? "house" : null;
      if (e === 3) return (cur === "hut" || cur === "house") && rr < 0.85 ? "stone" : null;
      if (e === 4) {
        if (st === "european" && l.old) return cur !== "stone" && rr < 0.6 ? "stone" : null;
        return (cur === "hut" || cur === "house" || cur === "stone") && rr < 0.5 + 0.4 * l.dens ? "row" : null;
      }
      if (e === 5) {
        if (ind && rr < 0.85) return "factory";
        if (st === "european" && l.old) return null;
        return (cur === "house" || cur === "stone" || cur === "row" || cur === "hut") && rr < 0.35 + 0.35 * l.dens ? "brick" : null;
      }
      if (e === 6) {
        if (l.densT > 0.5 && rr < 0.7 && !(st === "european")) return "early";
        if (st === "european" && l.old) return null;
        return rr < 0.3 && cur !== "factory" ? "apart" : null;
      }
      if (e === 7) {
        if (st === "european" && l.old) return null;
        if (cur === "early") return rr < 0.4 && l.densT > 0.55 ? "glass" : null;
        if (l.densT > 0.38 && rr < 0.8) return "glass";
        if (cur === "factory") return rr < 0.6 ? "slab" : null;
        return rr < 0.35 && l.dens > 0.15 && cur !== "slab" ? (l.r[5] < 0.5 ? "slab" : "apart") : null;
      }
      return null;
    }
    var cur = first(e0);
    out.push({ p: l.born, kind: cur, h: heightFor(cur, l, st) });
    for (k = e0 + 1; k < ERAS.length; k++) {
      var rr = hash3(l.i * 3 + k, l.j, M.seed * 17 + k);
      var nk = up(k, cur, rr);
      if (!nk) continue;
      var u = clamp(0.55 * l.dCoreN + 0.45 * hash3(l.i, l.j * 7 + k, M.seed * 7 + k), 0, 1);
      var pu = ERAS[k].p + eraSpan(k) * (0.04 + 0.86 * u);
      if (pu <= out[out.length - 1].p + 0.012) pu = out[out.length - 1].p + 0.012;
      out.push({ p: pu, kind: nk, h: heightFor(nk, l, st) });
      cur = nk;
    }
    return out;
  }
  function addLandmarkImpl(M, kind, name, o) {
    o = obj(o);
    kind = LMK[str(kind).toLowerCase()] ? str(kind).toLowerCase() : "tower";
    var spec = LMK[kind];
    var tx = num(o.x, M.cores[0][0]), ty = num(o.y, M.cores[0][1]);
    var best = null, bd = 1e9;
    M.lots.forEach(function (l) {
      if (l.landmark || l.clearAt != null) return;
      if (o.bornMax != null && l.born > o.bornMax) return;
      var d = Math.hypot(l.x - tx, l.y - ty);
      if (o.minD != null && d < o.minD) return;
      if (o.maxD != null && d > o.maxD) return;
      for (var i = 0; i < M.landmarks.length; i++) if (Math.hypot(M.landmarks[i].x - l.x, M.landmarks[i].y - l.y) < 2.2) return;
      if (d < bd) { bd = d; best = l; }
    });
    if (!best) return null;
    var p = num(o.p, Math.max(best.born + 0.01, 0.5));
    var L = {
      kind: kind, name: str(name) || kind, x: best.x, y: best.y, z0: best.z0, h: num(o.h, spec.h), p: p, pEnd: o.pEnd != null ? num(o.pEnd, 9) : 9,
      lot: best, w: spec.w, d: spec.d, color: toRGB(o.color, null), qFn: null, clearLot: !!o.clearLot,
    };
    best.landmark = L;
    if (spec.clear) M.lots.forEach(function (l) {
      if (l !== best && Math.hypot(l.x - best.x, l.y - best.y) <= spec.clear + 0.05) { l.clearAt = Math.min(l.clearAt != null ? l.clearAt : 9, p); l.clearEnd = Math.max(l.clearEnd != null ? l.clearEnd : 0, L.pEnd); }
    });
    M.landmarks.push(L);
    return L;
  }
  function getModel(opts) {
    var o = cityOpts(opts);
    var key = [o.preset, o.style, o.seed, o.cityName, o.districts.join("|"), o.popNow].join("#");
    if (!MODELS[key]) MODELS[key] = buildModel(o);
    return MODELS[key];
  }
  function fuzzy(list, name, field) {
    var n = normWord(name);
    if (!n || !list.length) return null;
    var i;
    for (i = 0; i < list.length; i++) if (normWord(list[i][field]) === n) return list[i];
    for (i = 0; i < list.length; i++) { var w = normWord(list[i][field]); if (w.indexOf(n) === 0 || n.indexOf(w) === 0) return list[i]; }
    for (i = 0; i < list.length; i++) { var w2 = normWord(list[i][field]); if (w2.indexOf(n) >= 0 || (n.length >= 4 && n.indexOf(w2) >= 0)) return list[i]; }
    var toks = str(name).toLowerCase().split(/[^a-z0-9]+/).filter(function (t) { return t.length >= 3; });
    for (i = 0; i < list.length; i++) {
      var wn = str(list[i][field]).toLowerCase();
      for (var k = 0; k < toks.length; k++) if (wn.indexOf(toks[k].slice(0, 4)) >= 0) return list[i];
    }
    return null;
  }
  function findDistrict(M, name) {
    var d = fuzzy(M.districts, name, "name");
    if (d) return d;
    var n = normWord(name);
    if (/harbo|port|dock|pier|wharf|quay|water|shore|marina|creek|bund/.test(n)) return M.districts[1];
    if (/factor|mill|indus|work|plant|yard/.test(n)) return M.districts[4] || M.districts[0];
    if (/old|core|center|centre|down|histor|market/.test(n)) return M.districts[0];
    return null;
  }
  function findLandmark(M, name) {
    var L = fuzzy(M.landmarks, name, "name") || fuzzy(M.landmarks, name, "kind");
    if (L) return L;
    var n = normWord(name);
    var map = [[/church|chapel|spire|steeple/, ["church", "cathedral", "mission"]], [/cathedral|basilica|minster/, ["cathedral", "church", "dome"]], [/fort|castle|citadel|wall/, ["fort", "citadel"]],
      [/station|rail|train|depot/, ["station", "depot"]], [/hall|council|mayor|govern/, ["cityhall", "townhall"]], [/temple|shrine|pagoda/, ["temple", "pagoda"]], [/tower|sky|tall/, ["supertall", "spire", "tower", "earlytower", "tvtower"]], [/dome|mosque/, ["dome", "cathedral"]], [/wheel|ferris/, ["ferris"]], [/stadium|arena/, ["stadium"]]];
    for (var i = 0; i < map.length; i++) if (map[i][0].test(n)) {
      for (var k = 0; k < map[i][1].length; k++) { var f = M.landmarks.filter(function (x) { return x.kind === map[i][1][k]; })[0]; if (f) return f; }
    }
    return null;
  }

  // ========================= light =========================
  var LIGHTS = {
    dawn: { top: [64, 80, 124], hor: [236, 180, 160], sunEl: 9, sunCol: [255, 202, 170], amb: 0.58, dif: 0.5, fog: [214, 186, 178], fogK: 1.0, water: [76, 100, 134], lit: 0.12, stars: 0, haze: 0 },
    day: { top: [66, 126, 198], hor: [196, 216, 232], sunEl: 46, sunCol: [255, 250, 240], amb: 0.6, dif: 0.55, fog: [200, 214, 228], fogK: 0.42, water: [56, 106, 152], lit: 0, stars: 0, haze: 0 },
    haze: { top: [120, 128, 138], hor: [204, 190, 162], sunEl: 34, sunCol: [255, 232, 198], amb: 0.62, dif: 0.48, fog: [186, 174, 152], fogK: 0.72, water: [78, 96, 108], lit: 0.05, stars: 0, haze: 0.55 },
    golden: { top: [48, 66, 116], hor: [250, 182, 112], sunEl: 14, sunCol: [255, 194, 128], amb: 0.52, dif: 0.78, fog: [226, 174, 128], fogK: 0.58, water: [68, 90, 128], lit: 0.28, stars: 0, haze: 0 },
    night: { top: [8, 12, 30], hor: [38, 48, 84], sunEl: 30, sunCol: [150, 170, 230], amb: 0.36, dif: 0.22, fog: [32, 40, 68], fogK: 0.7, water: [16, 26, 50], lit: 1, stars: 1, haze: 0 },
  };
  var AUTO_L = [[0, "dawn"], [0.1, "dawn"], [0.24, "day"], [0.54, "day"], [0.64, "haze"], [0.74, "haze"], [0.83, "day"], [0.9, "day"], [0.985, "golden"]];
  function mixLight(a, b, k) {
    var o = {};
    for (var key in a) o[key] = Array.isArray(a[key]) ? mixc(a[key], b[key], k) : lerp(a[key], b[key], k);
    return o;
  }
  function lightAt(p, mode) {
    if (LIGHTS[mode]) return mixLight(LIGHTS[mode], LIGHTS[mode], 0);
    p = clamp(num(p, 0.5), 0, 1);
    for (var i = 0; i + 1 < AUTO_L.length; i++) {
      if (p <= AUTO_L[i + 1][0]) return mixLight(LIGHTS[AUTO_L[i][1]], LIGHTS[AUTO_L[i + 1][1]], smooth((p - AUTO_L[i][0]) / (AUTO_L[i + 1][0] - AUTO_L[i][0])));
    }
    return mixLight(LIGHTS.golden, LIGHTS.golden, 0);
  }

  // ========================= projection =========================
  function makeProj(c, dist, vp) {
    var yaw = c.yaw * DEG, pit = clamp(c.pitch, 1, 89.9) * DEG;
    var cp = Math.cos(pit), sp = Math.sin(pit);
    var fx = Math.sin(yaw) * cp, fy = -Math.cos(yaw) * cp, fz = -sp;
    var rx = Math.cos(yaw), ry = Math.sin(yaw);
    var F = vp.h / 2 / Math.tan((clamp(c.fov, 4, 120) * DEG) / 2);
    return {
      ex: c.tx - fx * dist, ey: c.ty - fy * dist, ez: c.tz - fz * dist, fx: fx, fy: fy, fz: fz, rx: rx, ry: ry,
      ux: -fz * ry, uy: fz * rx, uz: fx * ry - fy * rx, F: F, cx: vp.x + vp.w / 2, cy: vp.y + vp.h / 2, near: 0.35, dist: dist, pitch: c.pitch, yaw: c.yaw,
    };
  }
  function proj(P, x, y, z) {
    var dx = x - P.ex, dy = y - P.ey, dz = z - P.ez;
    var zc = dx * P.fx + dy * P.fy + dz * P.fz;
    var xc = dx * P.rx + dy * P.ry, yc = dx * P.ux + dy * P.uy + dz * P.uz;
    var zz = zc < P.near ? P.near : zc;
    return [P.cx + (P.F * xc) / zz, P.cy - (P.F * yc) / zz, zc];
  }
  // Hot-loop projection into a flat array; returns the depth.
  function pj(P, x, y, z, out, o) {
    var dx = x - P.ex, dy = y - P.ey, dz = z - P.ez;
    var zc = dx * P.fx + dy * P.fy + dz * P.fz;
    var zz = zc < P.near ? P.near : zc;
    out[o] = P.cx + (P.F * (dx * P.rx + dy * P.ry)) / zz;
    out[o + 1] = P.cy - (P.F * (dx * P.ux + dy * P.uy + dz * P.uz)) / zz;
    return zc;
  }
  function depthOf(P, x, y, z) { return (x - P.ex) * P.fx + (y - P.ey) * P.fy + (z - P.ez) * P.fz; }
  // Projects a 3D polygon, clipping it at the near plane. Writes into out; returns the point count.
  var CS = new Float64Array(64);
  function projPoly(P, pts, out) {
    var n = pts.length, i, behind = false;
    for (i = 0; i < n; i++) if (pj(P, pts[i][0], pts[i][1], pts[i][2], out, i * 2) < P.near) behind = true;
    if (!behind) return n;
    var k = 0;
    for (i = 0; i < n; i++) {
      var a = pts[i], b = pts[(i + 1) % n], za = depthOf(P, a[0], a[1], a[2]), zb = depthOf(P, b[0], b[1], b[2]);
      if (za >= P.near) { pj(P, a[0], a[1], a[2], CS, k * 2); k++; }
      if (za >= P.near !== zb >= P.near) {
        var f = (P.near + 1e-3 - za) / (zb - za);
        pj(P, lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f), CS, k * 2);
        k++;
      }
      if (k > 30) break;
    }
    for (i = 0; i < k * 2; i++) out[i] = CS[i];
    return k >= 3 ? k : 0;
  }
  function polyPath(ctx, a, n, grow) {
    var i, cx = 0, cy = 0;
    if (grow) { for (i = 0; i < n; i++) { cx += a[i * 2]; cy += a[i * 2 + 1]; } cx /= n; cy /= n; }
    ctx.beginPath();
    for (i = 0; i < n; i++) {
      var x = a[i * 2], y = a[i * 2 + 1];
      if (grow) { var dx = x - cx, dy = y - cy, l = Math.sqrt(dx * dx + dy * dy) || 1; x += (dx / l) * grow; y += (dy / l) * grow; }
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.closePath();
  }
  function hull(pts) {
    pts.sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    function cross(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    var lo = [], hi = [], i;
    for (i = 0; i < pts.length; i++) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], pts[i]) <= 0) lo.pop(); lo.push(pts[i]); }
    for (i = pts.length - 1; i >= 0; i--) { while (hi.length >= 2 && cross(hi[hi.length - 2], hi[hi.length - 1], pts[i]) <= 0) hi.pop(); hi.push(pts[i]); }
    hi.pop(); lo.pop();
    return lo.concat(hi);
  }

  // ========================= camera keys =========================
  function Track(base) { this.base = base; this.k = []; }
  Track.prototype.to = function (v, at, dur, ease) {
    this.k.push({ v: v, at: num(at, 0), d: Math.max(0, num(dur, 1)), e: typeof ease === "function" ? ease : ease === "linear" ? function (x) { return x; } : ease === "out" ? outCubic : inOutSine, i: this.k.length });
    this.k.sort(function (a, b) { return a.at - b.at || a.i - b.i; });
    return this;
  };
  Track.prototype.val = function (t) {
    var v = this.base;
    for (var i = 0; i < this.k.length; i++) {
      var q = this.k[i];
      if (t < q.at) break;
      var p = q.d > 0 ? clamp((t - q.at) / q.d, 0, 1) : 1;
      v = lerp(v, q.v, q.e(p));
    }
    return v;
  };
  Track.prototype.moving = function (t) { for (var i = 0; i < this.k.length; i++) { var q = this.k[i]; if (t > q.at && t < q.at + q.d) return true; } return false; };
  var CAMP = ["yaw", "pitch", "dist", "fov", "tx", "ty", "tz"];

  // ========================= stage and overlays registry =========================
  var STAGES = [], WORLDS = [], OVERLAYS = [], RESERVED = [], HOOKED = false;
  function hook() {
    if (HOOKED) return;
    HOOKED = true;
    V.onFrame(function (t) {
      for (var i = 0; i < WORLDS.length; i++) { try { WORLDS[i].frame(t); } catch (e) { V.error("[skyline-rush] world: " + (e && e.message)); } }
      for (i = 0; i < OVERLAYS.length; i++) { try { OVERLAYS[i].update(t); } catch (e2) { V.error("[skyline-rush] overlay: " + (e2 && e2.message)); } }
    });
  }
  function stageOf(root) {
    root = root || V.root();
    for (var i = 0; i < STAGES.length; i++) if (STAGES[i].root === root) return STAGES[i];
    var st = div("ct-stage", root);
    var worlds = div("ct-worlds", st), ui = div("ct-ui", st);
    var s = { root: root, el: st, worlds: worlds, ui: ui };
    STAGES.push(s);
    return s;
  }
  function reserve(box, at, until) { RESERVED.push({ x: box.x, y: box.y, w: box.w, h: box.h, at: num(at, 0), until: num(until, 1e9) }); }
  function layout(mode) {
    mode = str(mode);
    if (mode === "full") return { x: 0, y: 0, w: 1, h: 1 };
    if (PORTRAIT) {
      if (mode === "top") return { x: 0.04, y: 0.29, w: 0.92, h: 0.27 };
      if (mode === "bottom") return { x: 0.04, y: 0.55, w: 0.92, h: 0.2 };
      return { x: 0.04, y: 0.31, w: 0.92, h: 0.4 };
    }
    if (mode === "left") return { x: 0.03, y: 0.14, w: 0.5, h: 0.72 };
    if (mode === "right") return { x: 0.47, y: 0.14, w: 0.5, h: 0.72 };
    return { x: 0.05, y: 0.12, w: 0.9, h: 0.72 };
  }

  // ========================= the world =========================
  function World(root, o) {
    o = obj(o);
    var W = this;
    W.o = o;
    W.M = o.model || getModel(o);
    W.clock = o.clock || makeClock(o.yearFrom, o.yearTo, o.keyDates, W.M.style);
    W.lightMode = LIGHTS[str(o.light)] ? str(o.light) : "auto";
    W.plan = !!o.plan;
    var r = obj(o.rect);
    W.rect = { x: num(r.x, 0), y: num(r.y, 0), w: num(r.w, FW), h: num(r.h, FH) };
    if (o.size) W.rect = { x: 0, y: 0, w: num(o.size[0], 320), h: num(o.size[1], 180) };
    W.cw = Math.max(16, Math.round(W.rect.w)); W.ch = Math.max(16, Math.round(W.rect.h));
    var cv = doc.createElement("canvas");
    cv.width = W.cw; cv.height = W.ch;
    cv.className = "ct-canvas";
    cv.style.left = px(W.rect.x); cv.style.top = px(W.rect.y); cv.style.width = px(W.cw); cv.style.height = px(W.ch);
    W.canvas = cv;
    W.ctx = cv.getContext("2d");
    W.stage = null;
    if (!o.offscreen) { W.stage = stageOf(root); W.stage.worlds.appendChild(cv); }
    var vpf = o.viewport || layout();
    W.vp = { x: vpf.x * W.cw, y: vpf.y * W.ch, w: vpf.w * W.cw, h: vpf.h * W.ch };
    W.labels = []; W.extras = []; W.focus = null; W.disaster = null; W.labelAlpha = null;
    W.showDistricts = o.districtLabels !== false && !o.offscreen;
    W.life = o.life !== false;
    W.presetYaw = PORTRAIT ? W.M.pr.yawTall : W.M.pr.yaw;
    if (W.plan) W.presetYaw = 0;
    var pitch0 = num(o.pitch, W.plan ? 89.9 : PORTRAIT ? 46 : 33);
    W.cam = {};
    var base = { yaw: num(o.yaw, 0), pitch: pitch0, dist: 1, fov: num(o.fov, W.plan ? 16 : 30), tx: NaN, ty: NaN, tz: NaN };
    CAMP.forEach(function (k) { W.cam[k] = new Track(base[k]); });
    W.sunAz = num(o.sunAz, 215);
    W.fitted = null;
    W.frameP = o.frameP != null ? num(o.frameP, 1) : null;
    W.frameAt = o.frame || null;
    W.REC = [];
    W.state = { t: 0, year: W.clock.yearFrom, p: 0 };
    if (o.year != null) W.setYear(num(o.year, 2024));
    else if (o.yearFrom != null || o.yearTo != null) W.yearSchedule([[0.25, W.clock.yearFrom], [Math.max(0.5, D - 0.9), W.clock.yearTo]]);
    else W.setYear(W.clock.now);
    var self = W;
    W.camera = {
      set: function (c) { c = obj(c); CAMP.forEach(function (k) { if (c[k] != null && isFinite(+c[k])) self.cam[k].base = +c[k]; }); self.fitted = null; return self.camera; },
      to: function (c, at, dur, ease) {
        c = obj(c);
        CAMP.forEach(function (k) { if (c[k] != null && isFinite(+c[k])) self.cam[k].to(+c[k], at, dur == null ? 1.5 : dur, ease); });
        return self.camera;
      },
      orbit: function (deg, dolly, at, dur) {
        var a = num(at, 0), d = num(dur, Math.max(0.5, D - a - 0.4));
        self.cam.yaw.to(self.cam.yaw.base + num(deg, 14), a, d, inOutSine);
        self.cam.dist.to(self.cam.dist.base * num(dolly, 0.88), a, d, inOutSine);
        return self.camera;
      },
      focus: function (x, y, z, dist, at, dur) {
        var a = num(at, 0), d = num(dur, 2);
        self.cam.tx.to(num(x, 0), a, d); self.cam.ty.to(num(y, 0), a, d); self.cam.tz.to(num(z, 0), a, d);
        if (dist != null) self.cam.dist.to(num(dist, 0.6), a, d);
        return self.camera;
      },
    };
    if (!o.offscreen) { WORLDS.push(W); hook(); }
  }
  World.prototype.setYear = function (y) {
    if (typeof y === "function") this.yearFn = y;
    else { var v = num(y, 2024); this.yearFn = function () { return v; }; }
    this.sched = null;
    this._pt = null;
    return this;
  };
  World.prototype.yearSchedule = function (list) {
    var ks = arr(list).map(function (k) { return [num(k && k[0], 0), num(k && k[1], NaN)]; }).filter(function (k) { return isFinite(k[1]); });
    ks.sort(function (a, b) { return a[0] - b[0]; });
    if (!ks.length) return this;
    var linear = this.o.yearEase === "linear";
    this.sched = ks;
    this._pt = null;
    this.yearFn = function (t) {
      if (t <= ks[0][0]) return ks[0][1];
      for (var i = 0; i + 1 < ks.length; i++) {
        if (t <= ks[i + 1][0]) {
          var s = (t - ks[i][0]) / Math.max(1e-6, ks[i + 1][0] - ks[i][0]);
          var e = linear ? s : 0.45 * s + 0.55 * smooth(s);
          return lerp(ks[i][1], ks[i + 1][1], e);
        }
      }
      return ks[ks.length - 1][1];
    };
    return this;
  };
  World.prototype.stateAt = function (t) {
    var y = num(this.yearFn(t), 2024);
    return { t: t, year: y, p: this.clock.p(y) };
  };
  // Growth runs in screen time: a stage that starts at progress p rises over RISE_T seconds from the
  // first moment the year schedule reaches p (anything older than the scene start is already built).
  var RISE_T = 0.6;
  World.prototype.pTable = function () {
    if (this._pt) return this._pt;
    var n = 480, ts = new Float64Array(n + 1), ps = new Float64Array(n + 1), m = -1;
    for (var i = 0; i <= n; i++) { var t = (D * i) / n; m = Math.max(m, this.clock.p(num(this.yearFn(t), 2024))); ts[i] = t; ps[i] = m; }
    return (this._pt = { ts: ts, ps: ps, n: n });
  };
  World.prototype.tOfP = function (p) {
    var T = this.pTable(), ps = T.ps;
    if (p <= ps[0] + 1e-9) return -1e9;
    if (p > ps[T.n] + 1e-9) return 1e9;
    var lo = 0, hi = T.n;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (ps[mid] >= p) hi = mid; else lo = mid; }
    var k = (p - ps[lo]) / Math.max(1e-9, ps[hi] - ps[lo]);
    return lerp(T.ts[lo], T.ts[hi], clamp(k, 0, 1));
  };
  World.prototype.since = function (p, t) { return t - this.tOfP(p); };
  World.prototype.maxP = function () {
    var s = this.sched, W = this;
    if (s) return Math.max.apply(null, s.map(function (k) { return W.clock.p(k[1]); }));
    var m = 0;
    for (var i = 0; i <= 8; i++) m = Math.max(m, W.clock.p(W.yearFn((D * i) / 8)));
    return m;
  };
  World.prototype.fitPoints = function () {
    var W = this, M = W.M, pE = W.frameP != null ? W.frameP : W.maxP(), pts = [], fa = W.frameAt;
    var hk = W.o.fitTop === false ? 0 : 1;
    if (fa && fa.x != null) {
      var rr = num(fa.r, 6), zz = num(fa.z, 0), hh = num(fa.h, 0);
      for (var a = 0; a < 16; a++) { var an = (a / 16) * 2 * PI; pts.push([fa.x + Math.cos(an) * rr, fa.y + Math.sin(an) * rr * num(fa.ry, 1), zz]); }
      if (hh) pts.push([fa.x, fa.y, zz + hh]);
      if (fa.lots) M.lots.forEach(function (l) { if (l.born > pE + 0.003 || Math.hypot(l.x - fa.x, (l.y - fa.y) / num(fa.ry, 1)) > rr) return; var s = lotNow(W, l, pE, 1); if (s) pts.push([l.x, l.y, l.z0 + s.h * hk]); });
      if (fa.lots) M.landmarks.forEach(function (L) { if (L.p <= pE && L.pEnd > pE && Math.hypot(L.x - fa.x, L.y - fa.y) <= rr) pts.push([L.x, L.y, L.z0 + L.h * hk]); });
      return pts;
    }
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0, sx = 0, sy = 0;
    M.lots.forEach(function (l) {
      if (l.born > pE + 0.003) return;
      var s = lotNow(W, l, pE, 1);
      pts.push([l.x, l.y, l.z0 + (s ? s.h * hk : 0)]);
      x0 = Math.min(x0, l.x); y0 = Math.min(y0, l.y); x1 = Math.max(x1, l.x); y1 = Math.max(y1, l.y); n++; sx += l.x; sy += l.y;
    });
    M.landmarks.forEach(function (L) { if (L.p <= pE && L.pEnd > pE) pts.push([L.x, L.y, L.z0 + L.h * hk]); });
    var cx = n ? sx / n : M.origin[0], cy = n ? sy / n : M.origin[1];
    var minR = num(W.o.minFrame, 5.5);
    if (!n) { x0 = x1 = cx; y0 = y1 = cy; }
    x0 = Math.min(x0, cx - minR); x1 = Math.max(x1, cx + minR); y0 = Math.min(y0, cy - minR * 0.75); y1 = Math.max(y1, cy + minR * 0.75);
    var m = 1.2;
    [[x0 - m, y0 - m], [x1 + m, y0 - m], [x1 + m, y1 + m], [x0 - m, y1 + m], [(x0 + x1) / 2, y0 - m], [(x0 + x1) / 2, y1 + m], [x0 - m, (y0 + y1) / 2], [x1 + m, (y0 + y1) / 2]].forEach(function (q) { pts.push([q[0], q[1], 0.05]); });
    return pts;
  };
  World.prototype.ensureCam = function () {
    if (this.fitted) return this.fitted;
    var W = this, c = {};
    CAMP.forEach(function (k) { c[k] = W.cam[k].base; });
    var pts = W.fitPoints();
    var cx = 0, cy = 0;
    pts.forEach(function (q) { cx += q[0]; cy += q[1]; });
    cx /= pts.length; cy /= pts.length;
    var endT = Math.max(0, D - 0.05), dEnd = Math.max(0.05, W.cam.dist.val(endT));
    var auto = { yaw: W.presetYaw + W.cam.yaw.val(endT), pitch: W.cam.pitch.val(endT), fov: W.cam.fov.val(endT), tx: isFinite(c.tx) ? c.tx : cx, ty: isFinite(c.ty) ? c.ty : cy, tz: isFinite(c.tz) ? c.tz : 0 };
    var f = fitCam(pts, auto, W.vp, num(W.o.fill, 0.035), !isFinite(c.tx));
    if (!W.o.fitStart && !W.cam.tx.k.length && !W.cam.ty.k.length) f.dist /= dEnd;
    if (!isFinite(W.cam.tx.base)) W.cam.tx.base = f.tx;
    if (!isFinite(W.cam.ty.base)) W.cam.ty.base = f.ty;
    if (!isFinite(W.cam.tz.base)) W.cam.tz.base = f.tz;
    W.fitted = { dist: f.dist };
    W.fogScale = f.dist;
    return W.fitted;
  };
  function fitCam(pts, cam, vp, margin, recentre) {
    var c = { yaw: cam.yaw, pitch: cam.pitch, fov: cam.fov, tx: cam.tx, ty: cam.ty, tz: cam.tz };
    var mx = vp.w * margin, my = vp.h * margin;
    function bounds(d) {
      var P = makeProj(c, d, vp), x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      for (var i = 0; i < pts.length; i++) {
        var s = proj(P, pts[i][0], pts[i][1], pts[i][2]);
        if (s[2] <= P.near * 2) return null;
        if (s[0] < x0) x0 = s[0]; if (s[0] > x1) x1 = s[0]; if (s[1] < y0) y0 = s[1]; if (s[1] > y1) y1 = s[1];
      }
      return [x0, y0, x1, y1, P];
    }
    function fits(d) { var b = bounds(d); return b && b[0] >= vp.x + mx && b[2] <= vp.x + vp.w - mx && b[1] >= vp.y + my && b[3] <= vp.y + vp.h - my; }
    var d = 40;
    for (var round = 0; round < 4; round++) {
      var lo = 1, hi = 4000;
      for (var it = 0; it < 34; it++) { var mid = Math.sqrt(lo * hi); if (fits(mid)) hi = mid; else lo = mid; }
      d = hi;
      if (!recentre || round === 3) break;
      var b = bounds(d);
      if (!b) break;
      var P = b[4], ox = (b[0] + b[2]) / 2 - (vp.x + vp.w / 2), oy = (b[1] + b[3]) / 2 - (vp.y + vp.h / 2);
      var wpp = d / P.F, fh = Math.hypot(P.fx, P.fy) || 1, sp = Math.max(0.25, Math.sin(c.pitch * DEG));
      c.tx += P.rx * ox * wpp; c.ty += P.ry * ox * wpp;
      c.tx -= (P.fx / fh) * ((oy * wpp) / sp); c.ty -= (P.fy / fh) * ((oy * wpp) / sp);
    }
    c.dist = d;
    return c;
  }
  World.prototype.camAt = function (t) {
    var W = this, f = W.ensureCam(), c = {};
    CAMP.forEach(function (k) { c[k] = W.cam[k].val(t); });
    var cam = { yaw: W.presetYaw + c.yaw, pitch: c.pitch, fov: c.fov, tx: c.tx, ty: c.ty, tz: c.tz };
    if (W.shakeFn) { var s = W.shakeFn(t); cam.tx += s[0]; cam.ty += s[1]; cam.tz += s[2] || 0; }
    return makeProj(cam, f.dist * c.dist, W.vp);
  };
  World.prototype.moving = function (t) { var W = this; return CAMP.some(function (k) { return W.cam[k].moving(t); }); };
  World.prototype.lightFor = function (p, t) {
    var L = lightAt(p, this.lightMode);
    if (this.lightFn) L = this.lightFn(L, t, p) || L;
    return L;
  };
  World.prototype.fogAmt = function (zc) {
    var s = this.fogScale || 40;
    return clamp(1 - Math.exp((-this.L.fogK * Math.max(0, zc - s * 0.72)) / s), 0, 0.975);
  };
  // Lit and fogged colour for a surface with normal n at depth zc.
  World.prototype.shadeN = function (rgb, n, zc, extra) {
    var L = this.L, sun = this.sun;
    var ndl = n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2];
    var s = L.amb + L.dif * Math.max(0, ndl) + 0.06 * n[2];
    var c = [rgb[0] * s * this.tint[0], rgb[1] * s * this.tint[1], rgb[2] * s * this.tint[2]];
    if (extra) c = extra(c);
    return mixc(c, L.fog, this.fogAmt(zc));
  };
  World.prototype.label = function (x, y, z, text, o) {
    o = obj(o);
    var L = { x: num(x, 0), y: num(y, 0), z: num(z, 0), text: str(text), at: num(o.at, 0), until: num(o.until, 1e9), color: toRGB(o.color, ACCENT), size: num(o.size, 0), lift: num(o.lift, 0), big: !!o.big, sub: str(o.sub), dot: o.dot !== false, pFrom: o.pFrom != null ? num(o.pFrom, 0) : null, follow: o.follow || null, prio: num(o.prio, 1) };
    this.labels.push(L);
    this._lplan = null;
    return L;
  };
  World.prototype.box = function (fp, z0, h, wall, roof, o) {
    o = obj(o);
    if (o.kind && KIND[o.kind]) return drawBuilding(this, this.ctx, { fp: fp, x: num(o.cx, 0), y: num(o.cy, 0), z0: z0, r: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5] }, o.kind, h, 1, { wall: toRGB(wall, null), roof: toRGB(roof, null) });
    return drawBox(this, this.ctx, fp, num(z0, 0), num(h, 1), toRGB(wall, [180, 180, 180]), toRGB(roof, toRGB(wall, [180, 180, 180])), { win: !!o.windows, glass: !!o.glass, taper: o.taper });
  };
  World.prototype.face = function (pts, rgb) { drawFace(this, this.ctx, pts, toRGB(rgb, [200, 200, 200]), true); };
  World.prototype.pyramid = function (fp, z0, h, rgb) { drawPyramid(this, this.ctx, fp, num(z0, 0), num(h, 0.5), toRGB(rgb, [160, 90, 70])); };
  World.prototype.ball = function (x, y, z, r, rgb) { drawBall(this, this.ctx, x, y, z, r, toRGB(rgb, [200, 200, 200])); };
  World.prototype.line3 = function (a, b, color, width) { drawLine3(this, this.ctx, a, b, color, width); };

  // ========================= ground colours and lot states =========================
  var NAT = { forest: [56, 90, 52], grass: [106, 134, 74], beach: [214, 200, 154], sand: [212, 188, 142], rock: [128, 122, 110] };
  var FARMS = [[156, 150, 84], [122, 142, 72], [178, 160, 98], [140, 128, 74]];
  var PARK = [84, 136, 72], SUBURB = [150, 148, 132], SHALLOW = [120, 186, 196];
  var FARM_AVG = [146, 142, 84];
  function groundRGB(W, c, p) {
    var M = W.M, cfg = M.cfg, sand = M.pr.natural === "sand", fine = c.w < 1.5 && c.h < 1.5, col;
    if (fine) col = mulc(NAT[c.nat] || NAT.grass, c.nat === "sand" || c.nat === "beach" ? 0.985 + 0.03 * c.h0 : 0.95 + 0.1 * c.h0);
    else {
      col = sand ? NAT.sand : mixc(NAT.grass, NAT.forest, 0.25 + 0.5 * smooth((c.fz - M.pr.forest + 0.08) / 0.16));
      if (c.m < 1.6) col = mixc(NAT.beach, col, smooth((c.m - 0.5) / 1.1));
      col = mixc(col, NAT.rock, smooth((c.z - 0.9) / 0.7) * 0.7);
    }
    if (p >= c.pF) col = mixc(col, sand ? [118, 146, 80] : fine ? FARMS[(c.h0 * 4) | 0] : FARM_AVG, fine ? smooth((p - c.pF) / 0.03) * 0.92 : smooth((p - c.pF) / 0.12) * 0.55);
    if (c.park && p >= 0.5) col = mixc(col, PARK, smooth((p - 0.5) / 0.04));
    if (p >= c.pU) col = mixc(col, mixc(cfg.dirt, cfg.ground, smooth((p - 0.46) / 0.2)), smooth((p - c.pU) / 0.02));
    if (p >= c.pS) col = mixc(col, M.pr.natural === "sand" ? [196, 184, 160] : SUBURB, 0.6 * smooth((p - c.pS) / 0.04));
    return col;
  }
  function lotNow(W, l, p, final) {
    if (l.clearAt != null && p >= l.clearAt && p < (l.clearEnd != null ? l.clearEnd : 9)) return null;
    var Lm = l.landmark, t = W.state ? W.state.t : 0;
    if (Lm && (Lm.clearLot || (final ? !Lm.qFn && p >= Lm.p && p < Lm.pEnd : landmarkQ(W, Lm, p, t) > 0))) return null;
    var ss = l.stages, s = -1;
    for (var i = ss.length - 1; i >= 0; i--) if (p >= ss[i].p) { s = i; break; }
    if (s < 0) return null;
    var cur = ss[s];
    var k = final ? 1 : clamp(W.since(cur.p, t) / RISE_T, 0, 1);
    if (k >= 1) return { kind: cur.kind, h: cur.h, k: 1 };
    var prev = s > 0 ? ss[s - 1] : null;
    var h0 = prev ? Math.min(prev.h, cur.h) * 0.7 : 0;
    return { kind: cur.kind, h: lerp(h0, cur.h, outCubic(k)), k: k };
  }
  function stageAtP(l, p) {
    var ss = l.stages, s = null;
    for (var i = 0; i < ss.length; i++) if (p >= ss[i].p) s = ss[i];
    return s;
  }
  function landmarkQ(W, L, p, t) {
    if (L.qFn) return clamp(num(L.qFn(t, p), 0), 0, 1);
    if (p < L.p || p >= L.pEnd) return 0;
    return clamp(W.since(L.p, t) / 1.4, 0, 1);
  }
  function smokeAmt(p) { return smooth((p - 0.6) / 0.03) * (1 - smooth((p - 0.8) / 0.06)); }

  // ========================= primitives =========================
  var BX = new Float64Array(64), TP = new Float64Array(128);
  function orient(fp) {
    var a = 0, n = fp.length;
    for (var i = 0; i < n; i++) { var p0 = fp[i], p1 = fp[(i + 1) % n]; a += p0[0] * p1[1] - p1[0] * p0[1]; }
    return a >= 0 ? fp : fp.slice().reverse();
  }
  function centroid(fp) { var x = 0, y = 0; fp.forEach(function (q) { x += q[0]; y += q[1]; }); return [x / fp.length, y / fp.length]; }
  function sideCol(W, rgb, nx, ny, fogk) {
    var L = W.L, s = L.amb + L.dif * Math.max(0, nx * W.sun[0] + ny * W.sun[1]);
    return mixc([rgb[0] * s * W.tint[0], rgb[1] * s * W.tint[1], rgb[2] * s * W.tint[2]], L.fog, fogk);
  }
  function topCol(W, rgb, fogk) {
    var L = W.L, s = L.amb + L.dif * Math.max(0, W.sun[2]) + 0.06;
    return mixc([rgb[0] * s * W.tint[0], rgb[1] * s * W.tint[1], rgb[2] * s * W.tint[2]], L.fog, fogk);
  }
  // Extruded convex prism (a box when fp has 4 corners). o: {win, glass, taper, lotR}
  function drawBox(W, ctx, fp, z0, h, wall, top, o, noTop) {
    if (!(h > 0.002)) return;
    o = o || {};
    var P = W.P, pts = orient(fp), n = pts.length, tp = o.taper ? scaleFp(pts, o.taper) : pts, z1 = z0 + h, i;
    var c = centroid(pts), zc = depthOf(P, c[0], c[1], z0 + h * 0.5);
    if (zc < P.near) return;
    var fogk = W.fogAmt(zc);
    for (i = 0; i < n; i++) { pj(P, pts[i][0], pts[i][1], z0, BX, i * 2); pj(P, tp[i][0], tp[i][1], z1, BX, (n + i) * 2); }
    for (i = 0; i < n; i++) {
      var a = i, b = (i + 1) % n, ex = pts[b][0] - pts[a][0], ey = pts[b][1] - pts[a][1], nl = Math.sqrt(ex * ex + ey * ey) || 1;
      var nx = ey / nl, ny = -ex / nl, mx = (pts[a][0] + pts[b][0]) / 2, my = (pts[a][1] + pts[b][1]) / 2;
      if (nx * (P.ex - mx) + ny * (P.ey - my) <= 0) continue;
      var col = sideCol(W, wall, nx, ny, fogk);
      ctx.beginPath();
      ctx.moveTo(BX[a * 2], BX[a * 2 + 1]); ctx.lineTo(BX[b * 2], BX[b * 2 + 1]);
      ctx.lineTo(BX[(n + b) * 2], BX[(n + b) * 2 + 1]); ctx.lineTo(BX[(n + a) * 2], BX[(n + a) * 2 + 1]);
      ctx.closePath();
      ctx.fillStyle = css(col);
      ctx.fill();
      if (o.win) drawWindows(W, ctx, a, b, n, h, col, o, zc);
    }
    if (!noTop && P.ez > z1) {
      ctx.beginPath();
      for (i = 0; i < n; i++) { if (i) ctx.lineTo(BX[(n + i) * 2], BX[(n + i) * 2 + 1]); else ctx.moveTo(BX[n * 2], BX[n * 2 + 1]); }
      ctx.closePath();
      ctx.fillStyle = css(topCol(W, top || wall, fogk));
      ctx.fill();
    }
  }
  function drawWindows(W, ctx, a, b, n, h, col, o, zc) {
    var floors = Math.min(18, Math.floor(h / 0.3)), lit = W.L.lit > 0.2;
    if (lit && floors < 2 && h > 0.2) floors = 2;
    if (floors < 2) return;
    var x0 = BX[a * 2], y0 = BX[a * 2 + 1], x1 = BX[b * 2], y1 = BX[b * 2 + 1];
    var x2 = BX[(n + b) * 2], y2 = BX[(n + b) * 2 + 1], x3 = BX[(n + a) * 2], y3 = BX[(n + a) * 2 + 1];
    var faceH = Math.abs(y3 - y0);
    if (faceH < floors * 3) floors = Math.floor(faceH / 3);
    if (floors < 2 || Math.abs(x1 - x0) + Math.abs(y1 - y0) < 4) return;
    var L = W.L, k, f, lw = clamp((0.028 * W.P.F) / zc, 0.5, 2.4) * (lit ? 1.3 : 1);
    ctx.lineWidth = lw;
    ctx.beginPath();
    for (k = 1; k < floors; k++) {
      if (lit && hash3(k, (o.lotR || 0) * 1000, a) > 0.72) continue;
      f = k / floors;
      ctx.moveTo(lerp(x0, x3, f), lerp(y0, y3, f)); ctx.lineTo(lerp(x1, x2, f), lerp(y1, y2, f));
    }
    if (lit) ctx.strokeStyle = css([255, 212, 140], clamp(L.lit, 0, 1) * 0.95);
    else ctx.strokeStyle = o.glass ? css(mixc(col, [236, 242, 248], 0.38), 0.55) : css(mulc(col, 0.74), 0.65);
    ctx.stroke();
    if (o.glass && !lit) {
      ctx.beginPath();
      for (k = 1; k < 4; k++) { f = k / 4; ctx.moveTo(lerp(x0, x1, f), lerp(y0, y1, f)); ctx.lineTo(lerp(x3, x2, f), lerp(y3, y2, f)); }
      ctx.strokeStyle = css(mulc(col, 0.7), 0.35);
      ctx.lineWidth = lw * 0.8;
      ctx.stroke();
    }
  }
  // A planar face (list of [x,y,z]). Outward normal relative to centre `cen`; culled when it faces away.
  function drawFaceSolid(W, ctx, pts, rgb, cen, twoSided) {
    var P = W.P, n = pts.length, nx = 0, ny = 0, nz = 0, i, mx = 0, my = 0, mz = 0;
    for (i = 0; i < n; i++) {
      var a = pts[i], b = pts[(i + 1) % n];
      nx += (a[1] - b[1]) * (a[2] + b[2]); ny += (a[2] - b[2]) * (a[0] + b[0]); nz += (a[0] - b[0]) * (a[1] + b[1]);
      mx += a[0]; my += a[1]; mz += a[2];
    }
    mx /= n; my /= n; mz /= n;
    var l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= l; ny /= l; nz /= l;
    if (cen && nx * (mx - cen[0]) + ny * (my - cen[1]) + nz * (mz - cen[2]) < 0) { nx = -nx; ny = -ny; nz = -nz; }
    var facing = nx * (P.ex - mx) + ny * (P.ey - my) + nz * (P.ez - mz);
    if (facing <= 0) { if (!twoSided) return; nx = -nx; ny = -ny; nz = -nz; }
    var zc = depthOf(P, mx, my, mz);
    if (zc < P.near) return;
    var k = projPoly(P, pts, TP);
    if (!k) return;
    polyPath(ctx, TP, k, 0);
    ctx.fillStyle = css(W.shadeN(rgb, [nx, ny, nz], zc));
    ctx.fill();
  }
  function drawFace(W, ctx, pts, rgb, twoSided) { drawFaceSolid(W, ctx, pts, rgb, null, twoSided !== false); }
  function drawGable(W, ctx, fp, z, rh, rgb) {
    var A = orient(fp);
    if (A.length !== 4) return drawPyramid(W, ctx, fp, z, rh, rgb);
    var e01 = Math.hypot(A[1][0] - A[0][0], A[1][1] - A[0][1]), e12 = Math.hypot(A[2][0] - A[1][0], A[2][1] - A[1][1]);
    if (e12 > e01) A = [A[1], A[2], A[3], A[0]];
    var m12 = [(A[1][0] + A[2][0]) / 2, (A[1][1] + A[2][1]) / 2], m30 = [(A[3][0] + A[0][0]) / 2, (A[3][1] + A[0][1]) / 2];
    var R1 = [m12[0], m12[1], z + rh], R0 = [m30[0], m30[1], z + rh];
    var c = [[A[0][0], A[0][1], z], [A[1][0], A[1][1], z], [A[2][0], A[2][1], z], [A[3][0], A[3][1], z]];
    var cc = centroid(A), cen = [cc[0], cc[1], z + rh * 0.3];
    drawFaceSolid(W, ctx, [c[0], c[1], R1, R0], rgb, cen);
    drawFaceSolid(W, ctx, [c[2], c[3], R0, R1], rgb, cen);
    var gab = mixc(rgb, [210, 200, 186], 0.25);
    drawFaceSolid(W, ctx, [c[1], c[2], R1], gab, cen);
    drawFaceSolid(W, ctx, [c[3], c[0], R0], gab, cen);
  }
  function drawPyramid(W, ctx, fp, z, h, rgb) {
    var A = orient(fp), cc = centroid(A), apex = [cc[0], cc[1], z + h], cen = [cc[0], cc[1], z + h * 0.3];
    for (var i = 0; i < A.length; i++) {
      var a = A[i], b = A[(i + 1) % A.length];
      drawFaceSolid(W, ctx, [[a[0], a[1], z], [b[0], b[1], z], apex], rgb, cen);
    }
  }
  function sunScreen(W) {
    var P = W.P, s = W.sun, x = s[0] * P.rx + s[1] * P.ry, y = -(s[0] * P.ux + s[1] * P.uy + s[2] * P.uz), l = Math.hypot(x, y) || 1;
    return [x / l, y / l];
  }
  function drawBall(W, ctx, x, y, z, r, rgb) {
    var P = W.P, s = proj(P, x, y, z);
    if (s[2] < P.near) return;
    var R = (r * P.F) / s[2], ss = W.sunS || [0, -1];
    ctx.beginPath(); ctx.arc(s[0], s[1], R, 0, 2 * PI);
    ctx.fillStyle = css(W.shadeN(rgb, [0, 0, 0.6], s[2])); ctx.fill();
    ctx.beginPath(); ctx.arc(s[0] + ss[0] * R * 0.28, s[1] + ss[1] * R * 0.28, R * 0.55, 0, 2 * PI);
    ctx.fillStyle = css(W.shadeN(mixc(rgb, [255, 255, 255], 0.18), [W.sun[0], W.sun[1], W.sun[2]], s[2]), 0.85); ctx.fill();
  }
  function drawDome(W, ctx, x, y, z, r, rgb) {
    var P = W.P, s = proj(P, x, y, z);
    if (s[2] < P.near) return;
    var R = (r * P.F) / s[2], sp = Math.max(0.05, Math.sin(clamp(P.pitch, 1, 89) * DEG)), ss = W.sunS || [0, -1];
    ctx.beginPath(); ctx.arc(s[0], s[1], R, PI, 2 * PI); ctx.ellipse(s[0], s[1], R, R * sp, 0, 0, PI); ctx.closePath();
    ctx.fillStyle = css(W.shadeN(rgb, [0, 0, 0.7], s[2])); ctx.fill();
    ctx.beginPath(); ctx.arc(s[0] + ss[0] * R * 0.25, s[1] - R * 0.25 + Math.max(0, ss[1]) * R * 0.1, R * 0.45, 0, 2 * PI);
    ctx.fillStyle = css(W.shadeN(mixc(rgb, [255, 255, 255], 0.2), W.sun, s[2]), 0.7); ctx.fill();
  }
  function drawLine3(W, ctx, a, b, color, width, world) {
    var P = W.P, s0 = proj(P, a[0], a[1], a[2]), s1 = proj(P, b[0], b[1], b[2]);
    if (s0[2] < P.near || s1[2] < P.near) return;
    var lw = world ? (num(width, 0.05) * P.F) / ((s0[2] + s1[2]) / 2) : num(width, 1.5);
    var col = Array.isArray(color) ? css(W.shadeN(color, [0, 0, 1], (s0[2] + s1[2]) / 2)) : str(color) || "#fff";
    ctx.beginPath(); ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]);
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.6, lw); ctx.lineCap = "round"; ctx.stroke();
  }
  function ellipsePts(x, y, rx, ry, n) { var out = []; for (var i = 0; i < n; i++) { var a = (i / n) * 2 * PI; out.push([x + Math.cos(a) * rx, y + Math.sin(a) * ry]); } return out; }

  // ========================= buildings =========================
  function drawBuilding(W, ctx, l, kind, h, k, mods) {
    var M = W.M, cfg = M.cfg, K = KIND[kind] || KIND.row, pal = cfg.pal[kind] || cfg.pal.row;
    mods = mods || {};
    var w0 = mods.wall || pal[0];
    if (!mods.wall && (kind === "slab" || kind === "apart")) w0 = [pal[0], mixc(pal[0], [150, 150, 152], 0.6), mixc(pal[0], [168, 112, 92], 0.6)][(l.r[5] * 3) | 0];
    if (!mods.wall && kind === "glass") w0 = l.r[2] > 0.62 ? mixc(pal[0], [52, 70, 92], 0.5) : l.r[2] < 0.16 ? mixc(pal[0], [196, 206, 212], 0.55) : pal[0];
    var wall = mulc(w0, 0.9 + 0.2 * l.r[0]), roof = mulc(mods.roof || pal[1], 0.95 + 0.1 * l.r[1]);
    if (mods.char) { wall = mixc(wall, [46, 38, 34], mods.char); roof = mixc(roof, [38, 32, 30], mods.char); }
    if (mods.wet) { wall = mixc(wall, [70, 110, 150], mods.wet); roof = mixc(roof, [70, 110, 150], mods.wet * 0.6); }
    if (mods.tint) { wall = mixc(wall, mods.tintCol, mods.tint); roof = mixc(roof, mods.tintCol, mods.tint); }
    if (mods.dim) { wall = mixc(wall, [44, 50, 66], mods.dim); roof = mixc(roof, [44, 50, 66], mods.dim); }
    var fp = scaleFp(l.fp, K.fs), z0 = l.z0 - 0.02;
    var rt = K.roof;
    if (cfg.flat && (kind === "house" || kind === "stone")) rt = "flat";
    if (cfg.hip && (kind === "house" || kind === "stone")) rt = "hip";
    var night = W.L.lit > 0.5, o = { win: (K.win && h > 0.55) || (night && h > 0.22), glass: K.glass, lotR: l.r[3] }, rh;
    switch (rt) {
      case "gable":
        rh = Math.max(0.05, h * K.rh);
        drawBox(W, ctx, fp, z0, h - rh, wall, roof, o, true);
        drawGable(W, ctx, fp, z0 + h - rh, rh, roof);
        break;
      case "hip":
        rh = Math.max(0.05, h * (K.rh || 0.4));
        drawBox(W, ctx, fp, z0, h - rh, wall, roof, o, true);
        drawPyramid(W, ctx, scaleFp(fp, 1.08), z0 + h - rh, rh, roof);
        break;
      case "setback":
        drawBox(W, ctx, fp, z0, h * 0.62, wall, roof, o);
        drawBox(W, ctx, scaleFp(fp, 0.76), z0 + h * 0.62, h * 0.24, wall, roof, o);
        drawBox(W, ctx, scaleFp(fp, 0.52), z0 + h * 0.86, h * 0.1, wall, roof, o);
        if (l.r[3] < 0.5) drawPyramid(W, ctx, scaleFp(fp, 0.36), z0 + h * 0.96, h * 0.05 + 0.08, mixc(roof, [120, 150, 136], 0.5));
        else drawBox(W, ctx, scaleFp(fp, 0.3), z0 + h * 0.96, h * 0.04, mixc(wall, [255, 255, 255], 0.15), roof, {});
        break;
      case "crown":
        drawBox(W, ctx, fp, z0, h * 0.93, wall, roof, o);
        drawBox(W, ctx, scaleFp(fp, 0.7), z0 + h * 0.93, h * 0.07, mixc(wall, [232, 238, 242], 0.35), roof, {});
        break;
      default:
        drawBox(W, ctx, fp, z0, h, wall, roof, o);
    }
    if (K.chimney && l.r[4] < 0.45) {
      var cc = centroid(fp), c0 = fp[0], chx = lerp(cc[0], c0[0], 0.6), chy = lerp(cc[1], c0[1], 0.6);
      drawBox(W, ctx, square(chx, chy, 0.13, 0.13), z0, h + 0.55, [124, 72, 58], [80, 56, 50]);
      var sa = smokeAmt(W.state.p);
      if (sa > 0.01 && !mods.char) drawSmoke(W, ctx, chx, chy, z0 + h + 0.6, sa, W.state.t, l.r[2]);
    }
  }
  function drawSmoke(W, ctx, x, y, z, amt, t, seed) {
    var P = W.P;
    for (var k = 0; k < 4; k++) {
      var ph = frac(t * 0.28 + k / 4 + seed);
      var s = proj(P, x + 0.6 * ph * 1.3, y - 0.25 * ph * 1.3, z + ph * 1.1);
      if (s[2] < P.near) continue;
      var R = ((0.1 + ph * 0.34) * P.F) / s[2];
      ctx.beginPath(); ctx.arc(s[0], s[1], R, 0, 2 * PI);
      ctx.fillStyle = css(mixc([158, 152, 146], W.L.fog, 0.3), amt * (1 - ph) * 0.42);
      ctx.fill();
    }
  }

  // ========================= landmarks =========================
  function drawCrane(W, ctx, cx, cy, z0, top, tx, ty) {
    var yel = [236, 176, 48];
    drawBox(W, ctx, square(cx, cy, 0.12, 0.12), z0, top - z0, yel, yel);
    var dx = tx - cx, dy = ty - cy, l = Math.hypot(dx, dy) || 1;
    dx /= l; dy /= l;
    drawLine3(W, ctx, [cx - dx * 0.5, cy - dy * 0.5, top], [cx + dx * 1.6, cy + dy * 1.6, top], yel, 0.06, true);
    drawBox(W, ctx, square(cx - dx * 0.45, cy - dy * 0.45, 0.16, 0.16), top - 0.12, 0.12, [90, 90, 96], [90, 90, 96]);
    drawLine3(W, ctx, [cx + dx * 1.3, cy + dy * 1.3, top], [cx + dx * 1.3, cy + dy * 1.3, top - 0.6], [60, 60, 66], 0.015, true);
  }
  function drawLandmark(W, ctx, L, q, t) {
    var x = L.x, y = L.y, z0 = L.z0 - 0.02, H = L.h, w = L.w, d = L.d;
    var cut = z0 + H * q + 0.001;
    var stoneC = L.color || [218, 206, 184], glassC = L.color || [108, 150, 180], steel = L.color || [176, 182, 190];
    var roofC = W.M.style === "european" ? [176, 92, 64] : [92, 90, 100], darkR = [70, 74, 86], copper = [112, 156, 136], gold = [214, 178, 96];
    function sq(s, s2) { return square(x, y, w * s, d * (s2 == null ? s : s2)); }
    function B(fp, za, h, wall, top, o) { if (za >= cut) return; drawBox(W, ctx, fp, za, Math.min(h, cut - za), wall, top || wall, o); }
    function PY(fp, za, h, c) { if (cut < za + h * 0.5) return; drawPyramid(W, ctx, fp, za, h, c); }
    function GB(fp, za, h, c) { if (cut < za + h * 0.5) return; drawGable(W, ctx, fp, za, h, c); }
    function BL(xx, yy, zz, r, c) { if (cut < zz) return; drawBall(W, ctx, xx, yy, zz, r, c); }
    function DM(xx, yy, zz, r, c) { if (cut < zz + r * 0.5) return; drawDome(W, ctx, xx, yy, zz, r, c); }
    function LN(a, b, c, ww) {
      if (a[2] > cut) return;
      var bb = b;
      if (b[2] > cut) { var f = (cut - a[2]) / (b[2] - a[2]); bb = [lerp(a[0], b[0], f), lerp(a[1], b[1], f), cut]; }
      drawLine3(W, ctx, a, bb, c, ww, true);
    }
    var gl = { win: 1, glass: 1, lotR: 0.3 }, st = { win: 1, lotR: 0.6 }, k;
    switch (L.kind) {
      case "supertall":
        B(sq(1), z0, H * 0.46, glassC, null, gl); B(sq(0.8), z0 + H * 0.46, H * 0.24, glassC, null, gl);
        B(sq(0.6), z0 + H * 0.7, H * 0.14, glassC, null, gl); B(sq(0.42), z0 + H * 0.84, H * 0.06, mixc(glassC, [240, 242, 244], 0.35));
        LN([x, y, z0 + H * 0.9], [x, y, z0 + H], [236, 236, 240], 0.07);
        break;
      case "earlytower":
        B(sq(1), z0, H * 0.58, stoneC, null, st); B(sq(0.8), z0 + H * 0.58, H * 0.2, stoneC, null, st);
        B(sq(0.62), z0 + H * 0.78, H * 0.1, stoneC, null, st); PY(sq(0.5), z0 + H * 0.88, H * 0.12, copper);
        break;
      case "spire":
        B(sq(1), z0, H * 0.5, stoneC, null, st); B(sq(0.84), z0 + H * 0.5, H * 0.16, stoneC, null, st);
        B(sq(0.68), z0 + H * 0.66, H * 0.1, stoneC, null, st); B(sq(0.52), z0 + H * 0.76, H * 0.07, steel);
        PY(sq(0.4), z0 + H * 0.83, H * 0.08, steel); LN([x, y, z0 + H * 0.9], [x, y, z0 + H], steel, 0.08);
        break;
      case "tvtower":
        B(sq(0.26), z0, H * 0.7, [208, 206, 202]); BL(x, y, z0 + H * 0.74, w * 0.38, [214, 214, 218]);
        B(sq(0.14), z0 + H * 0.78, H * 0.12, [204, 204, 208]); LN([x, y, z0 + H * 0.9], [x, y, z0 + H], [214, 70, 56], 0.05);
        break;
      case "dome":
        B(sq(1), z0, H * 0.36, stoneC); B(sq(0.62), z0 + H * 0.36, H * 0.12, stoneC);
        DM(x, y, z0 + H * 0.48, w * 0.3, W.M.style === "desert" ? gold : copper);
        B(sq(0.12), z0 + H * 0.48 + w * 0.28, H * 0.1, stoneC);
        break;
      case "arch":
        for (k = 0; k < 14; k++) {
          var u0 = -1 + (k / 14) * 2, u1 = -1 + ((k + 1) / 14) * 2;
          LN([x + u0 * w * 0.5, y, z0 + H * (1 - u0 * u0)], [x + u1 * w * 0.5, y, z0 + H * (1 - u1 * u1)], steel, 0.24);
        }
        break;
      case "obelisk":
        B(sq(1), z0, H * 0.9, stoneC, null, { taper: 0.62 }); PY(sq(0.62), z0 + H * 0.9, H * 0.1, stoneC);
        break;
      case "stadium":
        B(ellipsePts(x, y, w * 0.5, d * 0.5, 16), z0, H, [206, 206, 210], [184, 184, 190]);
        if (cut >= z0 + H) {
          drawFace(W, ctx, ellipsePts(x, y, w * 0.36, d * 0.36, 16).map(function (q2) { return [q2[0], q2[1], z0 + H + 0.002]; }), [150, 150, 158], false);
          drawFace(W, ctx, ellipsePts(x, y, w * 0.26, d * 0.24, 16).map(function (q2) { return [q2[0], q2[1], z0 + H + 0.004]; }), [92, 156, 82], false);
        }
        break;
      case "ferris":
        var zc = z0 + H * 0.55, R = H * 0.43, rot = t * 0.12;
        LN([x - w * 0.3, y, z0], [x, y, zc], steel, 0.06); LN([x + w * 0.3, y, z0], [x, y, zc], steel, 0.06);
        if (cut >= zc + R) {
          for (k = 0; k < 28; k++) {
            var a0 = (k / 28) * 2 * PI, a1 = ((k + 1) / 28) * 2 * PI;
            drawLine3(W, ctx, [x + Math.cos(a0) * R, y, zc + Math.sin(a0) * R], [x + Math.cos(a1) * R, y, zc + Math.sin(a1) * R], [232, 234, 240], 0.05, true);
          }
          for (k = 0; k < 8; k++) {
            var a2 = rot + (k / 8) * 2 * PI;
            drawLine3(W, ctx, [x, y, zc], [x + Math.cos(a2) * R, y, zc + Math.sin(a2) * R], [210, 214, 222], 0.02, true);
          }
          for (k = 0; k < 12; k++) { var a3 = rot + (k / 12) * 2 * PI; drawBall(W, ctx, x + Math.cos(a3) * R, y, zc + Math.sin(a3) * R, 0.07, k % 3 ? [236, 236, 240] : ACCENT); }
        }
        break;
      case "pagoda":
        for (k = 0; k < 5; k++) {
          var zz = z0 + k * H * 0.17, s = 1 - k * 0.13;
          B(sq(s * 0.66), zz, H * 0.11, [178, 66, 50]); PY(sq(s * 1.1), zz + H * 0.11, H * 0.06, darkR);
        }
        LN([x, y, z0 + H * 0.9], [x, y, z0 + H], gold, 0.05);
        break;
      case "cathedral":
        var nave = square(x + w * 0.08, y, w * 0.84, d * 0.62);
        B(nave, z0, H * 0.36, stoneC, null, {}); GB(nave, z0 + H * 0.36, H * 0.16, roofC);
        [[-1], [1]].forEach(function (sgn) {
          var tx = x - w * 0.42, ty = y + sgn[0] * d * 0.27;
          B(square(tx, ty, 0.3, 0.3), z0, H * 0.72, stoneC); PY(square(tx, ty, 0.32, 0.32), z0 + H * 0.72, H * 0.28, darkR);
        });
        break;
      case "church":
        var nv = square(x + w * 0.12, y, w * 0.74, d);
        B(nv, z0, H * 0.26, stoneC, null, {}); GB(nv, z0 + H * 0.26, H * 0.14, roofC);
        B(square(x - w * 0.38, y, d * 0.42, d * 0.42), z0, H * 0.58, stoneC);
        PY(square(x - w * 0.38, y, d * 0.46, d * 0.46), z0 + H * 0.58, H * 0.42, darkR);
        break;
      case "temple":
        B(sq(1), z0, H * 0.12, [204, 194, 174]); B(sq(0.78, 0.72), z0 + H * 0.12, H * 0.36, [180, 62, 48]);
        PY(sq(1.08, 1.02), z0 + H * 0.48, H * 0.24, darkR); B(sq(0.4), z0 + H * 0.72, H * 0.12, [180, 62, 48]);
        PY(sq(0.6), z0 + H * 0.84, H * 0.16, darkR);
        break;
      case "cityhall":
        B(sq(1), z0, H * 0.36, stoneC, null, st); B(sq(0.34, 0.6), z0 + H * 0.36, H * 0.42, stoneC, null, st);
        DM(x, y, z0 + H * 0.78, d * 0.18, gold); LN([x, y, z0 + H * 0.86], [x, y, z0 + H], gold, 0.04);
        break;
      case "townhall":
        B(sq(1), z0, H * 0.36, stoneC, null, {}); GB(sq(1), z0 + H * 0.36, H * 0.14, roofC);
        B(square(x, y, d * 0.34, d * 0.34), z0, H * 0.8, stoneC); PY(square(x, y, d * 0.38, d * 0.38), z0 + H * 0.8, H * 0.2, darkR);
        break;
      case "station":
        var brick = L.color || [176, 112, 86];
        B(sq(1), z0, H * 0.5, brick, null, {}); GB(sq(1), z0 + H * 0.5, H * 0.5, [132, 142, 152]);
        B(square(x - w * 0.42, y, 0.28, 0.28), z0, H * 1.9, brick); PY(square(x - w * 0.42, y, 0.3, 0.3), z0 + H * 1.9, H * 0.4, darkR);
        break;
      case "depot":
        B(sq(1), z0, H * 0.6, L.color || [164, 102, 80]); GB(sq(1), z0 + H * 0.6, H * 0.4, [104, 100, 100]);
        break;
      case "watertower":
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (s2) { LN([x + s2[0] * w * 0.3, y + s2[1] * d * 0.3, z0], [x + s2[0] * w * 0.22, y + s2[1] * d * 0.22, z0 + H * 0.6], [120, 112, 104], 0.05); });
        B(ellipsePts(x, y, w * 0.34, d * 0.34, 8), z0 + H * 0.6, H * 0.28, L.color || [184, 172, 160]);
        PY(ellipsePts(x, y, w * 0.36, d * 0.36, 8), z0 + H * 0.88, H * 0.12, [120, 110, 100]);
        break;
      case "fort":
      case "citadel":
        var fw = w, wallC = L.color || [168, 148, 116], wt = 0.12;
        B(square(x, y - fw / 2 + wt / 2, fw, wt), z0, H, wallC); B(square(x, y + fw / 2 - wt / 2, fw, wt), z0, H, wallC);
        B(square(x - fw / 2 + wt / 2, y, wt, fw), z0, H, wallC); B(square(x + fw / 2 - wt / 2, y, wt, fw), z0, H, wallC);
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (s3) { B(square(x + (s3[0] * fw) / 2, y + (s3[1] * fw) / 2, 0.42, 0.42, PI / 4), z0, H * 1.15, mulc(wallC, 0.95)); });
        if (L.kind === "citadel") { B(sq(0.32), z0, H * 1.8, wallC); PY(sq(0.34), z0 + H * 1.8, H * 0.5, darkR); }
        else { B(square(x + 0.2, y + 0.15, 0.55, 0.36), z0, 0.2, [170, 132, 96]); GB(square(x + 0.2, y + 0.15, 0.55, 0.36), z0 + 0.2, 0.12, [110, 80, 60]); }
        if (q > 0.9) {
          LN([x - 0.3, y - 0.3, z0], [x - 0.3, y - 0.3, z0 + 0.95], [90, 80, 70], 0.03);
          drawFace(W, ctx, [[x - 0.3, y - 0.3, z0 + 0.95], [x + 0.05, y - 0.3, z0 + 0.86], [x - 0.3, y - 0.3, z0 + 0.77]], ACCENT, true);
        }
        break;
      case "mission":
        var mc = L.color || [226, 206, 170];
        B(sq(1, 0.8), z0, H * 0.5, mc, null, {}); GB(sq(1, 0.8), z0 + H * 0.5, H * 0.22, [180, 96, 70]);
        B(square(x - w * 0.42, y, 0.3, 0.3), z0, H, mc);
        break;
      case "cranes":
        drawCrane(W, ctx, x, y, z0, z0 + H * q, x + 1, y);
        break;
      default:
        B(sq(1), z0, H * 0.84, glassC, mixc(glassC, [230, 236, 240], 0.3), gl);
        B(sq(0.7), z0 + H * 0.84, H * 0.11, mixc(glassC, [235, 240, 245], 0.25), null, { glass: 1 });
        LN([x, y, z0 + H * 0.95], [x, y, z0 + H], [220, 224, 230], 0.05);
    }
    if (q > 0.02 && q < 0.995 && H > 1.2 && L.kind !== "cranes") drawCrane(W, ctx, x + w * 0.85, y + d * 0.35, z0, cut + 0.45, x, y);
  }

  // ========================= bridges =========================
  function drawBridge(W, ctx, B, q) {
    var a = B.a, b = B.b, len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, dx = (b[0] - a[0]) / len, dy = (b[1] - a[1]) / len, nx = -dy, ny = dx;
    var deckZ = 0.28, half = 0.2, k;
    var col = B.kind === "suspension" ? [184, 80, 58] : B.kind === "truss" ? [98, 106, 116] : [176, 162, 140];
    function at(u, side, z) { return [a[0] + dx * len * u + nx * side, a[1] + dy * len * u + ny * side, z]; }
    function deck(u0, u1) {
      if (u1 - u0 < 0.01) return;
      var p0 = at(u0, 0, 0), p1 = at(u1, 0, 0);
      var fp = [[p0[0] + nx * half, p0[1] + ny * half], [p1[0] + nx * half, p1[1] + ny * half], [p1[0] - nx * half, p1[1] - ny * half], [p0[0] - nx * half, p0[1] - ny * half]];
      drawBox(W, ctx, fp, deckZ - 0.07, 0.07, [150, 146, 140], [124, 122, 122]);
    }
    if (B.kind === "arch") for (k = 1; k < 4; k++) { var u = k / 4; if (u <= q * 0.5 || u >= 1 - q * 0.5) { var pc = at(u, 0, 0); drawBox(W, ctx, square(pc[0], pc[1], 0.32, 0.32), 0, deckZ - 0.06, col, col); } }
    var hk = Math.min(0.5, q * 0.5);
    if (q >= 0.999) deck(0, 1); else { deck(0, hk); deck(1 - hk, 1); }
    if (B.kind === "suspension") {
      var Ht = clamp(len * 0.16, 0.9, 2.4) + deckZ;
      [0.2, 0.8].forEach(function (u2) {
        if (!(u2 <= hk + 0.02 || u2 >= 1 - hk - 0.02)) return;
        [-1, 1].forEach(function (s) { var pt = at(u2, s * half * 1.1, 0); drawBox(W, ctx, square(pt[0], pt[1], 0.13, 0.13), 0, Ht, col, col); });
        var pa = at(u2, 0, 0);
        drawBox(W, ctx, [[pa[0] + nx * half * 1.2 + dx * 0.05, pa[1] + ny * half * 1.2 + dy * 0.05], [pa[0] + nx * half * 1.2 - dx * 0.05, pa[1] + ny * half * 1.2 - dy * 0.05], [pa[0] - nx * half * 1.2 - dx * 0.05, pa[1] - ny * half * 1.2 - dy * 0.05], [pa[0] - nx * half * 1.2 + dx * 0.05, pa[1] - ny * half * 1.2 + dy * 0.05]], Ht - 0.12, 0.1, col, col);
      });
      if (q >= 0.999) {
        [-1, 1].forEach(function (s) {
          var prev = at(0, s * half, deckZ + 0.04);
          for (k = 1; k <= 24; k++) {
            var uu = k / 24, z;
            if (uu <= 0.2) z = lerp(deckZ + 0.04, Ht, uu / 0.2);
            else if (uu >= 0.8) z = lerp(Ht, deckZ + 0.04, (uu - 0.8) / 0.2);
            else { var v = (uu - 0.5) / 0.3; z = deckZ + 0.18 + (Ht - deckZ - 0.18) * v * v; }
            var cur = at(uu, s * half, z);
            drawLine3(W, ctx, prev, cur, mixc(col, [240, 240, 240], 0.15), 0.035, true);
            prev = cur;
          }
        });
      }
    } else if (B.kind === "truss" && q >= 0.999) {
      [-1, 1].forEach(function (s) {
        drawLine3(W, ctx, at(0.05, s * half, deckZ + 0.4), at(0.95, s * half, deckZ + 0.4), col, 0.04, true);
        for (k = 0; k < 10; k++) drawLine3(W, ctx, at(0.05 + k * 0.09, s * half, k % 2 ? deckZ + 0.4 : deckZ), at(0.05 + (k + 1) * 0.09, s * half, k % 2 ? deckZ : deckZ + 0.4), col, 0.025, true);
      });
    }
  }

  // ========================= frame passes =========================
  function drawSky(W, ctx, t) {
    var P = W.P, L = W.L, cw = W.cw, ch = W.ch;
    var fh = Math.hypot(P.fx, P.fy) || 1e-6;
    var hy = P.cy - (P.F * (P.fx * P.ux + P.fy * P.uy)) / (fh * fh);
    W.horizonY = hy;
    var water = mixc(L.water, L.hor, 0.12);
    W.waterRGB = water;
    if (hy > 0) {
      var g = ctx.createLinearGradient(0, Math.min(0, hy - ch * 0.9), 0, hy);
      g.addColorStop(0, css(L.top)); g.addColorStop(0.7, css(mixc(L.top, L.hor, 0.55))); g.addColorStop(0.97, css(L.hor)); g.addColorStop(1, css(mixc(L.hor, L.fog, 0.5)));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, Math.ceil(hy) + 2);
      if (L.stars > 0.02) {
        for (var i = 0; i < 150; i++) {
          var sx = hash(i * 3 + 1) * cw, sy = hash(i * 3 + 2) * hy * 0.92;
          ctx.fillStyle = css([236, 240, 255], L.stars * (0.35 + 0.6 * hash(i * 3 + 3)) * (0.75 + 0.25 * Math.sin(t * 2.2 + i)));
          ctx.fillRect(sx, sy, 1.6, 1.6);
        }
      }
      var sv = W.sun, ss = proj(P, P.ex + sv[0] * 4000, P.ey + sv[1] * 4000, P.ez + sv[2] * 4000);
      if (ss[2] > 0 && ss[1] < hy + ch * 0.2 && L.lit < 0.9) {
        var gr = ctx.createRadialGradient(ss[0], ss[1], 0, ss[0], ss[1], ch * 0.55);
        gr.addColorStop(0, css(mixc(L.sunCol, [255, 255, 255], 0.3), 0.55)); gr.addColorStop(0.25, css(L.sunCol, 0.22)); gr.addColorStop(1, css(L.sunCol, 0));
        ctx.fillStyle = gr;
        ctx.fillRect(0, 0, cw, Math.ceil(hy) + 2);
      }
    }
    var y0 = Math.max(0, Math.floor(hy));
    if (y0 < ch) {
      var g2 = ctx.createLinearGradient(0, y0, 0, ch);
      for (var k = 0; k <= 6; k++) {
        var y = y0 + ((ch - y0) * k) / 6 + 0.5, dz = P.fz + (P.uz * (P.cy - y)) / P.F;
        var dist = dz < -1e-4 ? -P.ez / dz : 1e6;
        g2.addColorStop(k / 6, css(k === 0 ? mixc(L.hor, L.fog, 0.5) : mixc(water, L.fog, W.fogAmt(dist))));
      }
      ctx.fillStyle = g2;
      ctx.fillRect(0, y0, cw, ch - y0);
    }
  }
  function drawTerrain(W, ctx, t, p) {
    var cells = W.M.terrain.cells, P = W.P, L = W.L, n = cells.length, i;
    if (!W._ord || W._ord.length !== n) { W._ord = new Array(n); W._dep = new Float64Array(n); }
    var ord = W._ord, dep = W._dep;
    for (i = 0; i < n; i++) { ord[i] = i; dep[i] = depthOf(P, cells[i].cx, cells[i].cy, cells[i].z); }
    ord.sort(function (a, b) { return dep[b] - dep[a] || a - b; });
    var shallow = mixc(W.waterRGB, SHALLOW, 0.42);
    for (i = 0; i < n; i++) {
      var c = cells[ord[i]], d = dep[ord[i]];
      if (d < -Math.max(c.w, c.h) * 1.5) continue;
      if (c.shallow) {
        var k = projPoly(P, c.shallow, TP);
        if (k) { polyPath(ctx, TP, k, 0.6); ctx.fillStyle = css(mixc(shallow, L.fog, W.fogAmt(d))); ctx.fill(); }
      }
      if (c.land) {
        var k2 = projPoly(P, c.land, TP);
        if (!k2) continue;
        var col = groundRGB(W, c, p);
        if (W.groundFn) col = W.groundFn(c, col, t) || col;
        polyPath(ctx, TP, k2, 0.7);
        if (c.w > 1.5 && !c.nf) { var nf = [c.n[0] * 0.4, c.n[1] * 0.4, c.n[2] + 0.6], nl = Math.hypot(nf[0], nf[1], nf[2]); c.nf = [nf[0] / nl, nf[1] / nl, nf[2] / nl]; }
        ctx.fillStyle = css(W.shadeN(col, c.w > 1.5 ? c.nf : c.n, Math.max(d, 0)));
        ctx.fill();
      }
    }
  }
  function drawWater(W, ctx, t) {
    var M = W.M, P = W.P, L = W.L, cells = M.terrain.cells, i;
    var lw = clamp((0.05 * P.F) / P.dist, 0.6, 2.2);
    ctx.beginPath();
    for (i = 0; i < cells.length; i++) {
      var c = cells[i];
      if (!c.shore || c.w > 4) continue;
      var a = proj(P, c.shore[0][0], c.shore[0][1], 0.02), b = proj(P, c.shore[1][0], c.shore[1][1], 0.02);
      if (a[2] < P.near || b[2] < P.near) continue;
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    }
    ctx.strokeStyle = css(mixc([236, 240, 236], L.fog, 0.3), 0.42);
    ctx.lineWidth = lw; ctx.lineCap = "round";
    ctx.stroke();
    var gk = L.lit > 0.9 ? 0.3 : 0.5 + 0.5 * L.dif, gc = mixc(L.sunCol, [255, 255, 255], 0.45);
    ctx.lineWidth = clamp((0.04 * P.F) / P.dist, 0.7, 2.2);
    for (var bkt = 0; bkt < 3; bkt++) {
      ctx.beginPath();
      for (i = 0; i < M.glints.length; i++) {
        var g = M.glints[i], a2 = 0.5 + 0.5 * Math.sin(t * g.sp * 2 + g.ph);
        var lev = a2 > 0.82 ? 2 : a2 > 0.62 ? 1 : a2 > 0.4 ? 0 : -1;
        if (lev !== bkt) continue;
        var s = proj(P, g.x + Math.sin(t * 0.4 + g.ph) * 0.15, g.y, 0.01);
        if (s[2] < P.near) continue;
        var wpx = (g.len * P.F) / s[2];
        ctx.moveTo(s[0] - wpx / 2, s[1]); ctx.lineTo(s[0] + wpx / 2, s[1]);
      }
      ctx.strokeStyle = css(gc, [0.18, 0.32, 0.52][bkt] * gk);
      ctx.stroke();
    }
  }
  function drawRoads(W, ctx, t, p) {
    var M = W.M, P = W.P, L = W.L, cfg = M.cfg, i;
    var lw = clamp((0.075 * P.F) / P.dist, 0.5, 3.2);
    var col = mixc(cfg.dirt, [182, 182, 178], smooth((p - 0.55) / 0.15));
    col = W.shadeN(col, [0, 0, 1], P.dist);
    if (L.lit > 0.4) col = mixc(col, [255, 198, 124], 0.7 * L.lit);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    M.oldRoads.forEach(function (road) {
      for (var k = 1; k < road.length; k++) {
        var a = road[k - 1], b = road[k];
        if (p < b[2] - 0.02) break;
        if (a[3] == null) a[3] = M.heightAt(a[0], a[1]) + 0.012;
        if (b[3] == null) b[3] = M.heightAt(b[0], b[1]) + 0.012;
        var f = clamp(W.since(b[2] - 0.02, t) / 0.5, 0, 1);
        var s0 = proj(P, a[0], a[1], a[3]), s1 = proj(P, lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[3], b[3], f));
        if (s0[2] < P.near || s1[2] < P.near) continue;
        ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]);
      }
    });
    ctx.strokeStyle = css(col, 0.9); ctx.lineWidth = lw * 1.35; ctx.stroke();
    for (var pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (i = 0; i < M.streets.length; i++) {
        var s = M.streets[i];
        if (p < s.born || (s.w > 1) !== (pass === 1)) continue;
        if (s.z == null) s.z = M.heightAt((s.ax + s.bx) / 2, (s.ay + s.by) / 2) + 0.012;
        var f2 = clamp(W.since(s.born, t) / 0.6, 0, 1);
        var q0 = proj(P, s.ax, s.ay, s.z), q1 = proj(P, lerp(s.ax, s.bx, f2), lerp(s.ay, s.by, f2), s.z);
        if (q0[2] < P.near || q1[2] < P.near) continue;
        ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]);
      }
      ctx.strokeStyle = css(col, pass ? 0.9 : 0.7); ctx.lineWidth = pass ? lw * 1.8 : lw;
      ctx.stroke();
    }
    var R = M.rail;
    if (p >= R.p) {
      var q = clamp(W.since(R.p, t) / 1.5, 0, 1), want = q * R.len;
      ctx.beginPath();
      for (i = 1; i < R.pts.length; i++) {
        var a0 = R.pts[i - 1], b0 = R.pts[i], segL = R.cum[i] - R.cum[i - 1];
        if (R.cum[i - 1] >= want) break;
        var ff = clamp((want - R.cum[i - 1]) / segL, 0, 1);
        var r0 = proj(P, a0[0], a0[1], 0.1), r1 = proj(P, lerp(a0[0], b0[0], ff), lerp(a0[1], b0[1], ff), 0.1);
        if (r0[2] < P.near || r1[2] < P.near) continue;
        ctx.moveTo(r0[0], r0[1]); ctx.lineTo(r1[0], r1[1]);
      }
      ctx.strokeStyle = css(W.shadeN([74, 64, 58], [0, 0, 1], P.dist)); ctx.lineWidth = lw * 2; ctx.stroke();
      ctx.strokeStyle = css(W.shadeN([168, 160, 150], [0, 0, 1], P.dist), 0.8); ctx.lineWidth = lw * 0.6; ctx.stroke();
    }
  }
  function drawShadows(W, ctx, items) {
    var L = W.L, sun = W.sun, P = W.P;
    var sz = Math.max(0.2, sun[2]), sx = -sun[0] / sz, sy = -sun[1] / sz, sl = Math.hypot(sx, sy);
    if (sl > 2.4) { sx *= 2.4 / sl; sy *= 2.4 / sl; }
    var alpha = 0.3 * clamp(L.dif / 0.55, 0.3, 1.3) * (1 - L.lit * 0.6);
    ctx.beginPath();
    for (var i = 0; i < items.length; i++) {
      var it = items[i], fp, z0, h;
      if (it.l) { fp = scaleFp(it.l.fp, (KIND[it.kind] || KIND.row).fs); z0 = it.l.z0; h = it.h; }
      else if (it.L) { fp = square(it.L.x, it.L.y, it.L.w * 0.7, it.L.d * 0.7); z0 = it.L.z0; h = it.L.h * it.q * (it.L.kind === "fort" ? 1 : 0.8); }
      else continue;
      if (h < 0.04) continue;
      var pts = [];
      for (var k = 0; k < fp.length; k++) {
        var a = proj(P, fp[k][0], fp[k][1], z0), b = proj(P, fp[k][0] + sx * h, fp[k][1] + sy * h, z0);
        if (a[2] < P.near || b[2] < P.near) { pts = null; break; }
        pts.push([a[0], a[1]], [b[0], b[1]]);
      }
      if (!pts) continue;
      var hl = hull(pts);
      for (k = 0; k < hl.length; k++) { if (k) ctx.lineTo(hl[k][0], hl[k][1]); else ctx.moveTo(hl[k][0], hl[k][1]); }
      ctx.closePath();
    }
    ctx.fillStyle = css([12, 18, 34], alpha);
    ctx.fill("nonzero");
  }
  function drawLife(W, ctx, t, p) {
    if (!W.life) return;
    var M = W.M, P = W.P, L = W.L, i, nl = M.boatLanes.length;
    var nb = p < 0.08 ? 0 : p < 0.3 ? 3 : p < 0.6 ? 6 : 9;
    for (i = 0; i < nb && nl; i++) {
      var lane = M.boatLanes[i % nl], dir = i % 2 ? 1 : -1;
      var u = frac(lane.ph + i * 0.37 + (t * lane.sp * dir) / lane.len);
      var dx = ((lane.b[0] - lane.a[0]) / lane.len) * dir, dy = ((lane.b[1] - lane.a[1]) / lane.len) * dir;
      var x = lerp(lane.a[0], lane.b[0], u), y = lerp(lane.a[1], lane.b[1], u), nx = -dy, ny = dx;
      var hullC = p < 0.6 ? [120, 92, 66] : p < 0.85 ? [60, 60, 66] : [236, 238, 240];
      var pts = [[x + dx * 0.32, y + dy * 0.32, 0.03], [x - dx * 0.25 + nx * 0.1, y - dy * 0.25 + ny * 0.1, 0.03], [x - dx * 0.25 - nx * 0.1, y - dy * 0.25 - ny * 0.1, 0.03]];
      var wa = proj(P, x - dx * 0.25, y - dy * 0.25, 0.01), wb = proj(P, x - dx * 1.4, y - dy * 1.4, 0.01);
      if (wa[2] > P.near && wb[2] > P.near) {
        ctx.beginPath(); ctx.moveTo(wa[0], wa[1]); ctx.lineTo(wb[0], wb[1]);
        ctx.strokeStyle = css([236, 244, 248], 0.35 * (1 - L.lit * 0.5)); ctx.lineWidth = clamp((0.08 * P.F) / wa[2], 0.6, 3); ctx.stroke();
      }
      drawFace(W, ctx, pts, hullC, true);
      if (p < 0.6) drawFace(W, ctx, [[x + dx * 0.05, y + dy * 0.05, 0.05], [x + dx * 0.05, y + dy * 0.05, 0.42], [x - dx * 0.2, y - dy * 0.2, 0.06]], [244, 240, 228], true);
      else if (p < 0.85) drawBox(W, ctx, square(x - dx * 0.02, y - dy * 0.02, 0.1, 0.1), 0.03, 0.16, [180, 70, 50], [60, 50, 50]);
    }
    var R = M.rail;
    if (p >= R.p + 0.03 && R.len > 1) {
      var head = frac(t * 0.025 + 0.15) * R.len, trainC = p < 0.85 ? [70, 62, 58] : [214, 216, 222];
      for (var c = 0; c < 4; c++) {
        var pos = railAt(R, head - c * 0.55), pos2 = railAt(R, head - c * 0.55 - 0.45);
        if (!pos || !pos2) continue;
        drawLine3(W, ctx, [pos[0], pos[1], 0.16], [pos2[0], pos2[1], 0.16], trainC, 0.17, true);
      }
    }
    if (p >= 0.78 && M.carRuns.length) {
      var cnt = Math.round(64 * smooth((p - 0.78) / 0.15)), cols = L.lit > 0.5 ? [[255, 236, 190], [255, 120, 90]] : [[236, 236, 232], [190, 60, 50], [40, 46, 56], [230, 190, 70]];
      for (i = 0; i < cnt; i++) {
        var run = M.carRuns[i % M.carRuns.length];
        if (p < run.born + 0.02) continue;
        var sgn = i % 2 ? 1 : -1, uu = frac(hash(i * 7 + 3) + (t * (0.02 + hash(i + 9) * 0.03) * sgn * 8) / Math.max(4, run.n));
        var rl = Math.hypot(run.bx - run.ax, run.by - run.ay) || 1, ox = (-(run.by - run.ay) / rl) * 0.07 * sgn, oy = ((run.bx - run.ax) / rl) * 0.07 * sgn;
        var s = proj(P, lerp(run.ax, run.bx, uu) + ox, lerp(run.ay, run.by, uu) + oy, 0.08);
        if (s[2] < P.near) continue;
        var sz2 = clamp((0.09 * P.F) / s[2], 1, 4);
        ctx.fillStyle = css(cols[i % cols.length], L.lit > 0.5 ? 0.95 : 0.9);
        ctx.fillRect(s[0] - sz2 / 2, s[1] - sz2 / 2, sz2, sz2);
      }
    }
  }
  function railAt(R, d) {
    if (d < 0 || d > R.len) return null;
    for (var i = 1; i < R.pts.length; i++) if (d <= R.cum[i]) { var f = (d - R.cum[i - 1]) / (R.cum[i] - R.cum[i - 1]); return [lerp(R.pts[i - 1][0], R.pts[i][0], f), lerp(R.pts[i - 1][1], R.pts[i][1], f)]; }
    return null;
  }
  function treeK(c, p) {
    if (c.park) return 1;
    var lim = Math.min(c.pF, c.pU);
    return p < lim ? 1 : 1 - smooth((p - lim) / 0.025);
  }
  function itemTrees(W, ctx, it) {
    var c = it.c, k = it.k, P = W.P;
    var base = W.M.pr.natural === "sand" ? [76, 116, 62] : c.park ? [62, 116, 60] : [50, 88, 50];
    var dark = css(W.shadeN(mulc(base, 0.82), [0, 0, 1], it.d)), light = css(W.shadeN(mixc(base, [150, 180, 90], 0.25), W.sun, it.d));
    var ss = W.sunS;
    for (var i = 0; i < c.trees.length; i++) {
      var tr = c.trees[i], s = proj(P, tr[0], tr[1], tr[2] + 0.2 * k);
      if (s[2] < P.near) continue;
      var R = (tr[3] * k * P.F) / s[2];
      if (R < 0.5) continue;
      ctx.beginPath(); ctx.arc(s[0], s[1], R, 0, 2 * PI); ctx.fillStyle = dark; ctx.fill();
      if (R > 1.6) { ctx.beginPath(); ctx.arc(s[0] + ss[0] * R * 0.3, s[1] + ss[1] * R * 0.3, R * 0.55, 0, 2 * PI); ctx.fillStyle = light; ctx.fill(); }
    }
  }
  function itemLot(W, ctx, it) { drawBuilding(W, ctx, it.l, it.kind, it.h, 1, it.mods); if (it.fx) it.fx(W, ctx, it); }
  function itemLandmark(W, ctx, it, t) { drawLandmark(W, ctx, it.L, it.q, t); }
  function itemBridge(W, ctx, it) { drawBridge(W, ctx, it.B, it.q); }
  function itemExtra(W, ctx, it, t) { it.e.draw(W, ctx, t, W.state); }
  function collect(W, t, p) {
    var M = W.M, P = W.P, items = [], i;
    var Dz = W.disaster, F = W.focus, fk = F && F.kFn ? clamp(num(F.kFn(t), 0), 0, 1) : 0;
    var fcol = F ? toRGB(F.color, ACCENT) : null;
    for (i = 0; i < M.lots.length; i++) {
      var l = M.lots[i];
      var s = l.born <= p ? lotNow(W, l, p) : null, mods = null, kind = s && s.kind, h = s ? s.h : 0, fx = null;
      if (Dz) {
        var dd = Math.hypot(l.x - Dz.cx, l.y - Dz.cy) + (l.r[2] - 0.5) * 1.2;
        if (dd < Dz.r) {
          var kk = clamp(num(Dz.kFn ? Dz.kFn(t) : 0, 0), 0, 1), kl = clamp(kk * (Dz.r + 1.5) - dd, 0, 1);
          var rb = clamp(num(Dz.rebFn ? Dz.rebFn(t) : 0, 0), 0, 1), rl = clamp((rb * (Dz.r + 2) - dd) / 2, 0, 1);
          if (rl > 0 && Dz.look) {
            var lk = Dz.look(l);
            if (lk) { kind = lk.kind; h = lk.h * outCubic(rl); mods = null; }
          } else if (kl > 0 && s) {
            var sink = Dz.kind === "fire" ? 0.82 : Dz.kind === "flood" ? 0.22 : Dz.kind === "quake" ? (l.r[1] > 0.4 ? 0.85 : 0.2) : 0.4;
            h = h * (1 - sink * kl);
            mods = Dz.kind === "fire" ? { char: kl * 0.9 } : Dz.kind === "flood" ? { wet: kl * 0.55 } : { char: kl * 0.35 };
            if (Dz.kind === "fire" && kl > 0.08 && rb < 0.1) fx = flameFx;
          }
        }
      }
      if (F && fk > 0 && kind) {
        if (M.districts[l.district] && M.districts[l.district].key === F.key) mods = { tint: 0.22 * fk, tintCol: fcol };
        else mods = { dim: 0.55 * fk };
      }
      if (!kind || h < 0.01) continue;
      var d = depthOf(P, l.x, l.y, l.z0 + h * 0.3);
      if (d < P.near) continue;
      items.push({ d: d, fn: itemLot, l: l, kind: kind, h: h, mods: mods, fx: fx });
    }
    var cells = M.terrain.cells;
    for (i = 0; i < cells.length; i++) {
      var c = cells[i];
      if (!c.trees) continue;
      var k = treeK(c, p);
      if (Dz && Dz.kind === "fire") { var dt = Math.hypot(c.cx - Dz.cx, c.cy - Dz.cy); if (dt < Dz.r) k *= 1 - clamp(num(Dz.kFn(t), 0) * (Dz.r + 1.5) - dt, 0, 1); }
      if (k < 0.03) continue;
      var dc = depthOf(P, c.cx, c.cy, c.z + 0.2);
      if (dc < P.near) continue;
      items.push({ d: dc, fn: itemTrees, c: c, k: k });
    }
    M.landmarks.forEach(function (L) {
      var q = landmarkQ(W, L, p, t);
      if (q <= 0) return;
      var d2 = depthOf(P, L.x, L.y, L.z0 + 0.3);
      if (d2 < P.near) return;
      items.push({ d: d2, fn: itemLandmark, L: L, q: q });
    });
    M.bridges.forEach(function (B) {
      if (p < B.p) return;
      var q = clamp(W.since(B.p, t) / 1.6, 0, 1);
      var d3 = depthOf(P, (B.a[0] + B.b[0]) / 2, (B.a[1] + B.b[1]) / 2, 0.3);
      if (d3 < P.near) return;
      items.push({ d: d3, fn: itemBridge, B: B, q: q });
    });
    W.extras.forEach(function (e) { if (e && typeof e.draw === "function") items.push({ d: e.depth ? num(e.depth(W, t), 0) : 0, fn: itemExtra, e: e }); });
    return items;
  }
  function flameFx(W, ctx, it) {
    var l = it.l, P = W.P, t = W.state.t, s = proj(P, l.x, l.y, l.z0 + it.h + 0.05);
    if (s[2] < P.near) return;
    var R = (0.22 * P.F) / s[2];
    for (var k = 0; k < 3; k++) {
      var fl = 0.6 + 0.4 * Math.sin(t * 11 + k * 2.1 + l.r[0] * 20);
      ctx.beginPath();
      ctx.moveTo(s[0] - R * (0.5 - k * 0.3), s[1]);
      ctx.lineTo(s[0] + R * (0.2 * k - 0.2), s[1] - R * (1.3 + 0.6 * fl));
      ctx.lineTo(s[0] + R * (0.5 - k * 0.15), s[1]);
      ctx.closePath();
      ctx.fillStyle = css(k === 1 ? [255, 220, 120] : [246, 128, 44], 0.85);
      ctx.fill();
    }
  }
  function drawAtmos(W, ctx) {
    var L = W.L;
    if (L.haze > 0.01) {
      var g = ctx.createLinearGradient(0, 0, 0, W.ch);
      g.addColorStop(0, css(L.fog, 0.3 * L.haze)); g.addColorStop(0.6, css(L.fog, 0.06 * L.haze)); g.addColorStop(1, css(L.fog, 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W.cw, W.ch);
    }
  }
  World.prototype.frame = function (t) {
    var W = this, ctx = W.ctx;
    W.ensureCam();
    var st = W.stateAt(t);
    W.state = st;
    var p = st.p;
    W.L = W.lightFor(p, t);
    W.P = W.camAt(t);
    var L = W.L, az = (W.presetYaw + W.cam.yaw.base + W.sunAz) * DEG, el = clamp(L.sunEl, 3, 85) * DEG;
    W.sun = [Math.sin(az) * Math.cos(el), -Math.cos(az) * Math.cos(el), Math.sin(el)];
    W.tint = [0.74 + (0.26 * L.sunCol[0]) / 255, 0.74 + (0.26 * L.sunCol[1]) / 255, 0.74 + (0.26 * L.sunCol[2]) / 255];
    W.sunS = sunScreen(W);
    W.REC = [];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    if (W.plan) { drawPlan(W, ctx, t, st); drawLabels(W, ctx, t, st); return; }
    drawSky(W, ctx, t);
    drawTerrain(W, ctx, t, p);
    drawWater(W, ctx, t, p);
    drawRoads(W, ctx, t, p);
    var items = collect(W, t, p);
    drawShadows(W, ctx, items);
    if (W.groundFxFn) W.groundFxFn(W, ctx, t, st);
    drawLife(W, ctx, t, p);
    items.sort(function (a, b) { return b.d - a.d; });
    for (var i = 0; i < items.length; i++) items[i].fn(W, ctx, items[i], t);
    if (W.fxFn) W.fxFn(W, ctx, t, st);
    drawAtmos(W, ctx);
    drawLabels(W, ctx, t, st);
  };

  // ========================= plan mode (map-overlay) =========================
  var INK = [88, 62, 40], PAPER = [238, 226, 198], PWATER = [194, 210, 212], PFARM = [228, 222, 182], PURB = [226, 210, 178], PPARK = [198, 214, 168];
  var PLOT = { early: [190, 150, 108], mid: [204, 170, 126], late: [214, 186, 146], tall: [178, 132, 96] };
  function plotTone(kind) { return kind === "hut" || kind === "house" || kind === "stone" ? "early" : kind === "row" || kind === "brick" || kind === "factory" ? "mid" : kind === "glass" || kind === "early" ? "tall" : "late"; }
  function drawPlan(W, ctx, t, st) {
    var M = W.M, P = W.P, p = st.p, cw = W.cw, ch = W.ch, cells = M.terrain.cells, i;
    ctx.fillStyle = css(PWATER); ctx.fillRect(0, 0, cw, ch);
    ctx.beginPath();
    for (var yy = 7; yy < ch; yy += 13) { ctx.moveTo(0, yy); ctx.lineTo(cw, yy); }
    ctx.strokeStyle = css([172, 194, 198], 0.55); ctx.lineWidth = 1; ctx.stroke();
    for (i = 0; i < cells.length; i++) {
      var c = cells[i];
      if (!c.land) continue;
      var k = projPoly(P, c.land.map(function (q) { return [q[0], q[1], 0]; }), TP);
      if (!k) continue;
      var fine = c.w < 1.5 && c.h < 1.5, col = fine ? mulc(PAPER, 0.99 + 0.02 * c.h0) : PAPER;
      if (p >= c.pF) col = mixc(col, PFARM, fine ? 0.7 * smooth((p - c.pF) / 0.03) : 0.3 * smooth((p - c.pF) / 0.12));
      if (c.park && p >= 0.5) col = mixc(col, PPARK, smooth((p - 0.5) / 0.04));
      if (p >= c.pU) col = mixc(col, PURB, smooth((p - c.pU) / 0.03));
      polyPath(ctx, TP, k, 0.7); ctx.fillStyle = css(col); ctx.fill();
    }
    var sc = P.F / P.dist, lw = clamp(0.06 * sc, 0.8, 2.6);
    ctx.beginPath();
    cells.forEach(function (c2) {
      if (!c2.shore || c2.w > 4) return;
      var a = proj(P, c2.shore[0][0], c2.shore[0][1], 0), b = proj(P, c2.shore[1][0], c2.shore[1][1], 0);
      ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
    });
    ctx.strokeStyle = css(INK, 0.85); ctx.lineWidth = lw * 1.2; ctx.lineCap = "round"; ctx.stroke();
    // streets
    for (var pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      M.streets.forEach(function (s) {
        if (p < s.born || (s.w > 1) !== (pass === 1)) return;
        var f = clamp(W.since(s.born, t) / 0.6, 0, 1), a = proj(P, s.ax, s.ay, 0), b = proj(P, lerp(s.ax, s.bx, f), lerp(s.ay, s.by, f), 0);
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
      });
      ctx.strokeStyle = css(INK, pass ? 0.75 : 0.5); ctx.lineWidth = pass ? lw * 1.4 : lw * 0.7; ctx.stroke();
    }
    ctx.beginPath();
    M.oldRoads.forEach(function (road) {
      for (var k2 = 1; k2 < road.length; k2++) {
        if (p < road[k2][2]) break;
        var a = proj(P, road[k2 - 1][0], road[k2 - 1][1], 0), b = proj(P, road[k2][0], road[k2][1], 0);
        ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
      }
    });
    ctx.strokeStyle = css(INK, 0.45); ctx.lineWidth = lw * 0.8; ctx.stroke();
    // lots by tone
    var tones = { early: [], mid: [], late: [], tall: [] }, fresh = [];
    M.lots.forEach(function (l) {
      if (l.born > p) return;
      var s = lotNow(W, l, p);
      if (!s) return;
      var fp = scaleFp(l.fp, Math.max(0.78, (KIND[s.kind] || KIND.row).fs));
      if (s.k < 1 && s.kind === l.stages[0].kind) fresh.push([fp, s.k, plotTone(s.kind)]);
      else tones[plotTone(s.kind)].push(fp);
    });
    function fpPath(fp) { for (var j = 0; j < fp.length; j++) { var q = proj(P, fp[j][0], fp[j][1], 0); if (j) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); } ctx.closePath(); }
    Object.keys(tones).forEach(function (tn) {
      if (!tones[tn].length) return;
      ctx.beginPath(); tones[tn].forEach(fpPath);
      ctx.fillStyle = css(PLOT[tn]); ctx.fill();
      ctx.strokeStyle = css(INK, 0.7); ctx.lineWidth = Math.max(0.6, lw * 0.45); ctx.stroke();
    });
    fresh.forEach(function (f) {
      ctx.beginPath(); fpPath(f[0]);
      ctx.fillStyle = css(PLOT[f[2]], f[1]); ctx.fill();
      ctx.strokeStyle = css(INK, 0.7 * f[1]); ctx.lineWidth = Math.max(0.6, lw * 0.45); ctx.stroke();
    });
    M.landmarks.forEach(function (L) {
      var q = landmarkQ(W, L, p, t);
      if (q <= 0) return;
      ctx.beginPath(); fpPath(square(L.x, L.y, Math.max(0.8, L.w), Math.max(0.8, L.d)));
      ctx.fillStyle = css([164, 110, 76], q); ctx.fill(); ctx.strokeStyle = css(INK, q); ctx.lineWidth = lw * 0.8; ctx.stroke();
    });
    var R = M.rail;
    if (p >= R.p) {
      var want = clamp(W.since(R.p, t) / 1.5, 0, 1) * R.len;
      ctx.beginPath();
      for (var dd = 0; dd < want; dd += 0.5) {
        var a1 = railAt(R, dd), b1 = railAt(R, Math.min(want, dd + 0.5));
        if (!a1 || !b1) continue;
        var s0 = proj(P, a1[0], a1[1], 0), s1 = proj(P, b1[0], b1[1], 0);
        ctx.moveTo(s0[0], s0[1]); ctx.lineTo(s1[0], s1[1]);
        var nx = -(s1[1] - s0[1]), ny = s1[0] - s0[0], nl = Math.hypot(nx, ny) || 1;
        ctx.moveTo(s0[0] + (nx / nl) * lw * 2, s0[1] + (ny / nl) * lw * 2); ctx.lineTo(s0[0] - (nx / nl) * lw * 2, s0[1] - (ny / nl) * lw * 2);
      }
      ctx.strokeStyle = css(INK, 0.8); ctx.lineWidth = lw * 0.8; ctx.stroke();
    }
    M.bridges.forEach(function (B) {
      if (p < B.p) return;
      var len = Math.hypot(B.b[0] - B.a[0], B.b[1] - B.a[1]), nx2 = (-(B.b[1] - B.a[1]) / len) * 0.16, ny2 = ((B.b[0] - B.a[0]) / len) * 0.16;
      ctx.beginPath();
      [-1, 1].forEach(function (s) { var a = proj(P, B.a[0] + nx2 * s, B.a[1] + ny2 * s, 0), b = proj(P, B.b[0] + nx2 * s, B.b[1] + ny2 * s, 0); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); });
      ctx.strokeStyle = css(INK, 0.9); ctx.lineWidth = lw; ctx.stroke();
    });
    // map frame and compass (inside the safe area)
    var sa = W.labelRegion();
    ctx.strokeStyle = css(INK, 0.75); ctx.lineWidth = 3; ctx.strokeRect(sa.x0 + 4, sa.y0 + 4, sa.x1 - sa.x0 - 8, sa.y1 - sa.y0 - 8);
    ctx.lineWidth = 1; ctx.strokeRect(sa.x0 + 12, sa.y0 + 12, sa.x1 - sa.x0 - 24, sa.y1 - sa.y0 - 24);
    var cx = sa.x1 - 70, cy = sa.y1 - 80, rr = 34, nAng = Math.atan2(-(P.ux * 0 + P.uy * -1), (P.rx * 0 + P.ry * -1));
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-nAng - PI / 2);
    ctx.beginPath(); ctx.arc(0, 0, rr, 0, 2 * PI); ctx.strokeStyle = css(INK, 0.7); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -rr * 0.9); ctx.lineTo(rr * 0.22, 0); ctx.lineTo(0, rr * 0.9); ctx.lineTo(-rr * 0.22, 0); ctx.closePath();
    ctx.fillStyle = css(INK, 0.35); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -rr * 0.9); ctx.lineTo(rr * 0.22, 0); ctx.lineTo(-rr * 0.22, 0); ctx.closePath(); ctx.fillStyle = css(INK, 0.85); ctx.fill();
    ctx.restore();
    ctx.fillStyle = css(INK, 0.85); ctx.font = mfont(800, 20); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    var nx3 = Math.cos(-nAng - PI / 2 - PI / 2), ny3 = Math.sin(-nAng - PI / 2 - PI / 2);
    ctx.fillText("N", cx + nx3 * (rr + 16), cy + ny3 * (rr + 16));
  }

  // ========================= canvas labels =========================
  World.prototype.labelRegion = function () {
    var r = this.rect;
    return { x0: Math.max(SAFE.x0, r.x) - r.x + 4, y0: Math.max(SAFE.y0, r.y) - r.y + 4, x1: Math.min(SAFE.x1, r.x + r.w) - r.x - 4, y1: Math.min(SAFE.y1, r.y + r.h) - r.y - 4 };
  };
  function lblMetrics(L) {
    if (L._m) return L._m;
    var size = L.size || (L.big ? (PORTRAIT ? 50 : 44) : PORTRAIT ? 32 : 28), sub = Math.round(size * 0.56);
    var tw = textW(L.text, 800, size, 0), sw = L.sub ? textW(L.sub, 500, sub, 0) : 0;
    var padX = size * 0.55, padY = size * 0.3;
    var w = Math.max(tw, sw) + padX * 2 + 6, h = size * 1.16 + (L.sub ? sub * 1.3 : 0) + padY * 2;
    return (L._m = { size: size, sub: sub, w: w, h: h, padX: padX, padY: padY, lift: L.lift || (L.big ? 110 : 62) });
  }
  function candBox(ax, ay, m, c) {
    var lift = m.lift;
    switch (c) {
      case 1: return { x: ax - m.w / 2, y: ay - lift * 1.9 - m.h, w: m.w, h: m.h };
      case 2: return { x: ax - m.w - 14, y: ay - lift * 0.8 - m.h, w: m.w, h: m.h };
      case 3: return { x: ax + 14, y: ay - lift * 0.8 - m.h, w: m.w, h: m.h };
      case 4: return { x: ax - m.w / 2, y: ay + lift * 0.55, w: m.w, h: m.h };
      default: return { x: ax - m.w / 2, y: ay - lift - m.h, w: m.w, h: m.h };
    }
  }
  function clampBox(b, R) {
    var x = clamp(b.x, R.x0, Math.max(R.x0, R.x1 - b.w)), y = clamp(b.y, R.y0, Math.max(R.y0, R.y1 - b.h));
    return { x: x, y: y, w: b.w, h: b.h };
  }
  function overlapArea(a, b) {
    var w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  }
  function reservedAt(W, t) {
    var out = [];
    RESERVED.forEach(function (r) { if (t >= r.at - 0.2 && t < r.until) out.push({ x: r.x - W.rect.x, y: r.y - W.rect.y, w: r.w, h: r.h }); });
    return out;
  }
  function planLabels(W) {
    var placed = [], R = W.labelRegion();
    function boxAt(L, c, tt) {
      var P = W.camAt(tt), s = proj(P, L.x, L.y, L.z);
      return clampBox(candBox(s[0], s[1], lblMetrics(L), c), R);
    }
    var list = W.labels.slice().sort(function (a, b) { return a.at - b.at; });
    list.forEach(function (L) {
      var t0 = clamp(L.at + 0.45, 0, Math.max(0, D - 0.05)), t2 = Math.min(L.until, D) - 0.1, ts = [t0];
      if (t2 > t0 + 0.5) ts.push((t0 + t2) / 2, t2);
      var best = 0, bestScore = 1e18;
      for (var c = 0; c < 5; c++) {
        var sc = c * 40;
        ts.forEach(function (tt) {
          var b = boxAt(L, c, tt);
          reservedAt(W, tt).forEach(function (o) { sc += overlapArea(b, o) * 2; });
          placed.forEach(function (q) { if (tt >= q.L.at && tt < q.L.until) sc += overlapArea(b, boxAt(q.L, q.c, tt)); });
        });
        if (sc < bestScore) { bestScore = sc; best = c; }
      }
      L._cand = best;
      placed.push({ L: L, c: best });
    });
    W._lplan = true;
  }
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, h / 2, w / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
  }
  function drawLabels(W, ctx, t, st) {
    if (!W._lplan) planLabels(W);
    var P = W.P, R = W.labelRegion(), resv = reservedAt(W, t), placed = resv.slice(), ink = W.plan, i;
    for (i = 0; i < W.labels.length; i++) {
      var L = W.labels[i];
      if (t < L.at || t >= L.until) continue;
      if (L.pFrom != null && st.p < L.pFrom) continue;
      var a = smooth((t - L.at) / 0.35) * (L.until < 1e8 ? 1 - smooth((t - (L.until - 0.35)) / 0.35) : 1);
      if (a < 0.01) continue;
      var z = L.follow ? num(L.follow(W, t), L.z) : L.z;
      var s = proj(P, L.x, L.y, z);
      if (s[2] < P.near) continue;
      var m = lblMetrics(L), b = clampBox(candBox(s[0], s[1], m, L._cand || 0), R);
      for (var ri = 0; ri < resv.length; ri++) {
        var rv = resv[ri];
        if (!overlapArea(b, rv)) continue;
        b = clampBox({ x: b.x, y: s[1] > rv.y + rv.h ? rv.y + rv.h + 10 : rv.y - b.h - 10, w: b.w, h: b.h }, R);
      }
      var dy = (1 - outCubic(a)) * 14;
      b = { x: b.x, y: b.y + dy, w: b.w, h: b.h };
      ctx.globalAlpha = a;
      var lx = clamp(s[0], b.x + 8, b.x + b.w - 8), ly = b.y + b.h / 2 < s[1] ? b.y + b.h : b.y;
      if (Math.abs(ly - s[1]) > 4 || Math.abs(lx - s[0]) > 4) {
        ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.lineTo(lx, ly);
        ctx.strokeStyle = ink ? css(INK, 0.9) : "rgba(255,255,255,0.85)"; ctx.lineWidth = 2.2; ctx.stroke();
      }
      if (L.dot) {
        ctx.beginPath(); ctx.arc(s[0], s[1], 6, 0, 2 * PI); ctx.fillStyle = css(L.color); ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = ink ? css(INK) : "#fff"; ctx.stroke();
      }
      roundRect(ctx, b.x, b.y, b.w, b.h, Math.min(14, b.h * 0.3));
      ctx.fillStyle = ink ? "rgba(250,242,222,0.94)" : "rgba(11,17,33,0.82)"; ctx.fill();
      if (ink) { ctx.strokeStyle = css(INK, 0.85); ctx.lineWidth = 1.6; ctx.stroke(); }
      ctx.fillStyle = css(L.color); ctx.fillRect(b.x, b.y + b.h * 0.18, 5, b.h * 0.64);
      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      ctx.font = mfont(800, m.size); ctx.fillStyle = ink ? css(INK) : "#fff";
      ctx.fillText(L.text, b.x + m.padX + 3, b.y + m.padY + m.size * 0.9);
      if (L.sub) { ctx.font = mfont(500, m.sub); ctx.fillStyle = ink ? css(INK, 0.8) : PAL.muted; ctx.fillText(L.sub, b.x + m.padX + 3, b.y + m.padY + m.size * 1.16 + m.sub * 1.0); }
      ctx.globalAlpha = 1;
      placed.push(b);
      W.REC.push({ kind: "label", label: L.text, x: b.x + W.rect.x, y: b.y + W.rect.y, w: b.w, h: b.h });
    }
    if (!W.showDistricts) return;
    var la = W.labelAlpha ? clamp(num(W.labelAlpha(t), 1), 0, 1) : smooth((t - 0.25) / 0.6);
    if (la < 0.01) return;
    var size = PORTRAIT ? 24 : 21;
    for (i = 0; i < W.M.districts.length; i++) {
      var d = W.M.districts[i];
      if (st.p < d.born || !d.lots.length) continue;
      var al = la * smooth((st.p - d.born) / 0.035);
      if (al < 0.02) continue;
      if (!d.near) d.near = d.lots.filter(function (l) { return Math.hypot(l.x - d.cx, l.y - d.cy) < 1.8; });
      var top = d.z;
      d.near.forEach(function (l) { var s2 = l.born <= st.p ? lotNow(W, l, st.p, 1) : null; if (s2) top = Math.max(top, l.z0 + s2.h); });
      var s3 = proj(P, d.cx, d.cy, top + 0.25);
      if (s3[2] < P.near) continue;
      var txt = d.name.toUpperCase();
      if (!d._w || d._ws !== size) { d._w = textW(txt, 800, size, 0.12); d._ws = size; }
      var bx = clampBox({ x: s3[0] - d._w / 2 - 6, y: s3[1] - 24 - size * 1.1, w: d._w + 12, h: size * 1.3 }, R);
      var ov = 0;
      placed.forEach(function (o) { ov = Math.max(ov, overlapArea(bx, o) / (bx.w * bx.h)); });
      al *= clamp(1 - ov * 2.5, 0, 1);
      if (al < 0.02) continue;
      ctx.globalAlpha = al;
      ctx.beginPath(); ctx.moveTo(s3[0], s3[1]); ctx.lineTo(s3[0], bx.y + bx.h);
      ctx.strokeStyle = ink ? css(INK, 0.8) : "rgba(255,255,255,0.75)"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.font = mfont(800, size); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.letterSpacing = "0.12em";
      var tx = bx.x + bx.w / 2, ty = bx.y + bx.h / 2;
      if (!ink) { ctx.lineWidth = 4; ctx.strokeStyle = "rgba(8,14,30,0.72)"; ctx.lineJoin = "round"; ctx.strokeText(txt, tx + size * 0.06, ty); }
      ctx.fillStyle = ink ? css(INK) : "#fff";
      ctx.fillText(txt, tx + size * 0.06, ty);
      ctx.letterSpacing = "0px";
      ctx.globalAlpha = 1;
      placed.push(bx);
      W.REC.push({ kind: "district", label: d.name, x: bx.x + W.rect.x, y: bx.y + W.rect.y, w: bx.w, h: bx.h });
    }
  }

  // ========================= DOM overlays =========================
  function fadeAB(t, at, until, fi, fo) {
    fi = fi || 0.4; fo = fo || 0.35;
    var a = smooth((t - at) / fi);
    if (until != null && until < 1e8) a *= 1 - smooth((t - (until - fo)) / fo);
    return a;
  }
  function vignette(root) {
    var st = stageOf(root);
    if (st.vig) return st.vig;
    st.vig = div("ct-vig");
    st.ui.insertBefore(st.vig, st.ui.firstChild);
    return st.vig;
  }
  function yearCounter(root, W, o) {
    o = obj(o);
    var st = stageOf(root), el = div("ct-year", st.ui), era = div("ct-era", el), numEl = div("ct-num", el), pop = div("ct-pop", el);
    el.setAttribute("data-ctbox", "year");
    if (o.ink) el.classList.add("ct-ink");
    var now = o.now != null && isFinite(+o.now) ? +o.now : null;
    var big = num(o.size, o.small ? (PORTRAIT ? 104 : 84) : PORTRAIT ? 168 : 128);
    var cands = [];
    if (W.sched) W.sched.forEach(function (k) { cands.push(fmtYear(k[1], { now: now })); });
    else for (var i = 0; i <= 4; i++) cands.push(fmtYear(W.yearFn((D * i) / 4), { now: now }));
    cands.push("8888");
    var maxW = num(o.maxW, PORTRAIT ? 900 : 600), widest = 0;
    cands.forEach(function (c) { widest = Math.max(widest, textW(c, 800, big, -0.02)); });
    if (widest > maxW) { big *= maxW / widest; widest = maxW; }
    var eraSize = clamp(big * 0.17, 17, 30), popSize = clamp(big * 0.2, 20, 34);
    numEl.style.fontSize = px(big); era.style.fontSize = px(eraSize); pop.style.fontSize = px(popSize);
    var align = o.align || o.pos || (PORTRAIT ? "center" : "left");
    var x = num(o.x, align === "right" ? SAFE.x1 : align === "center" ? FW / 2 : SAFE.x0), y = num(o.y, SAFE.y0);
    el.style.top = px(y);
    var h = eraSize * 1.25 + big * 0.95 + (o.population ? popSize * 1.45 : 0), w = Math.max(widest, 360);
    var bx = x;
    if (align === "center") { w = Math.max(widest, 420); el.style.left = px(x - w / 2); el.style.width = px(w); el.style.textAlign = "center"; numEl.style.transformOrigin = "center center"; bx = x - w / 2; }
    else if (align === "right") { el.style.right = px(FW - x); el.style.textAlign = "right"; numEl.style.transformOrigin = "right center"; bx = x - w; }
    else el.style.left = px(x);
    var at = num(o.at, 0.05);
    reserve({ x: bx, y: y, w: w, h: h }, at, 1e9);
    if (o.era === false) showEl(era, false);
    showEl(pop, !!o.population);
    var popLabel = o.popLabel != null ? str(o.popLabel) : "people";
    var pulses = arr(o.pulse).map(function (v) { return num(v, -9); });
    var last = {};
    function set(k, e, v) { if (last[k] !== v) { last[k] = v; e.textContent = v; } }
    var ov = {
      el: el,
      update: function (t) {
        var s = W.stateAt(t);
        set("n", numEl, o.format ? str(o.format(s.year)) : fmtYear(s.year, { now: now }));
        set("e", era, o.label != null ? str(o.label) : ERAS[eraIndex(s.p)].name.toUpperCase());
        if (o.population) set("p", pop, fmtPop(W.M.pop(s.p)) + (popLabel ? " " + popLabel : ""));
        var sc = 1;
        pulses.forEach(function (tp) { if (t >= tp && t < tp + 0.45) sc = Math.max(sc, 1 + 0.07 * Math.sin((PI * (t - tp)) / 0.45)); });
        setS(numEl, "transform", sc > 1.0005 ? "scale(" + sc.toFixed(4) + ")" : "none");
        var a = smooth((t - at) / 0.3);
        setS(el, "opacity", a.toFixed(3));
        showEl(el, a > 0.004);
      },
    };
    OVERLAYS.push(ov);
    return ov;
  }
  function lowerThird(root, items, o) {
    o = obj(o);
    var st = stageOf(root);
    var list = arr(items).map(function (it) { it = obj(it); return { at: num(it.at, 0.4), title: str(it.title), sub: str(it.sub), until: it.until != null ? num(it.until, 1e9) : null }; })
      .filter(function (it) { return it.title || it.sub; }).sort(function (a, b) { return a.at - b.at; });
    var maxW = num(o.maxW, PORTRAIT ? 960 : 860), bottom = num(o.bottom, SAFE.y1);
    var padX = 26, padY = 16, barW = 8, gapB = 20, inner = maxW - padX - barW - gapB;
    var els = list.map(function (it, i) {
      var el = div("ct-lt", st.ui);
      el.setAttribute("data-ctbox", "lower-third");
      if (o.ink) el.classList.add("ct-ink");
      div("ct-lt-bar", el);
      var body = div("ct-lt-body", el);
      var tl = it.title ? layoutText(it.title, { weight: 800, size: num(o.size, PORTRAIT ? 56 : 48), maxW: inner, maxLines: 2, lh: 1.08 }) : null;
      var sl = it.sub ? layoutText(it.sub, { weight: 500, size: PORTRAIT ? 32 : 28, maxW: inner, maxLines: 2, lh: 1.22 }) : null;
      if (tl) fillText(div("ct-lt-title", body), tl);
      if (sl) { var se = fillText(div("ct-lt-sub", body), sl); if (tl) se.style.marginTop = "6px"; }
      var w = Math.ceil(Math.max(tl ? tl.w : 0, sl ? sl.w : 0) + padX + barW + gapB + 4), h = Math.ceil((tl ? tl.h : 0) + (sl ? sl.h + (tl ? 6 : 0) : 0) + padY * 2);
      var left = o.right ? SAFE.x1 - w : num(o.x, SAFE.x0), top = bottom - h;
      el.style.left = px(left); el.style.top = px(top); el.style.width = px(w); el.style.height = px(h);
      var end = it.until != null ? it.until : i + 1 < list.length ? list[i + 1].at : 1e9;
      reserve({ x: left, y: top, w: w, h: h }, it.at, end + 0.3);
      return { el: el, it: it, end: end, box: { x: left, y: top, w: w, h: h } };
    });
    var ov = {
      items: els,
      update: function (t) {
        els.forEach(function (e) {
          var a = smooth((t - e.it.at - 0.1) / 0.4), out = e.end < 1e8 ? 1 - smooth((t - e.end + 0.05) / 0.22) : 1, al = a * out;
          showEl(e.el, al > 0.004);
          setS(e.el, "opacity", (Math.min(1, a * 1.8) * out).toFixed(3));
          var cl = ((1 - outCubic(a)) * 100).toFixed(1) + "%";
          setS(e.el, "clipPath", o.right ? "inset(0px 0px 0px " + cl + ")" : "inset(0px " + cl + " 0px 0px)");
        });
      },
    };
    OVERLAYS.push(ov);
    return ov;
  }
  function head(root, o) {
    o = obj(o);
    var st = stageOf(root), el = div("ct-head", st.ui);
    el.setAttribute("data-ctbox", "head");
    if (o.ink) el.classList.add("ct-ink");
    if (o.panel === false) el.classList.add("ct-nopanel");
    var maxW = num(o.maxW, PORTRAIT ? 900 : 1180), padX = o.panel === false ? 0 : 30, padY = o.panel === false ? 0 : 22, inner = maxW - padX * 2;
    var kl = o.kicker ? layoutText(o.kicker, { weight: 800, size: num(o.kickerSize, PORTRAIT ? 28 : 24), maxW: inner, maxLines: 1, upper: true, ls: 0.16, balance: false }) : null;
    var tl = o.title ? layoutText(o.title, { weight: 800, size: num(o.size, PORTRAIT ? 80 : 72), maxW: inner, maxLines: num(o.maxLines, 2), lh: 1.06 }) : null;
    var sl = o.sub ? layoutText(o.sub, { weight: 500, size: num(o.subSize, PORTRAIT ? 34 : 30), maxW: inner, maxLines: 2, lh: 1.22 }) : null;
    var align = o.align || "center", gap = 12, h = padY * 2, w = 0;
    [kl, tl, sl].forEach(function (l, i) {
      if (!l) return;
      var e = fillText(div(["ct-kicker", "ct-title", "ct-sub"][i], el), l, align);
      if (h > padY * 2) e.style.marginTop = px(gap);
      h += l.h + (h > padY * 2 ? gap : 0);
      w = Math.max(w, l.w);
    });
    w = Math.ceil(w + padX * 2 + 2); h = Math.ceil(h);
    var pos = o.pos || "top", y;
    if (o.y != null) y = num(o.y, SAFE.y0) - (pos === "center" ? h / 2 : pos === "bottom" ? h : 0);
    else y = pos === "center" ? FH * (PORTRAIT ? 0.4 : 0.42) - h / 2 : pos === "bottom" ? SAFE.y1 - h : SAFE.y0;
    var x = align === "left" ? num(o.x, SAFE.x0) : align === "right" ? num(o.x, SAFE.x1) - w : num(o.cx, FW / 2) - w / 2;
    el.style.left = px(x); el.style.top = px(y); el.style.width = px(w);
    var at = num(o.at, 0.3), until = o.until != null ? num(o.until, 1e9) : 1e9;
    reserve({ x: x, y: y, w: w, h: h }, at, until);
    var ov = {
      el: el, box: { x: x, y: y, w: w, h: h },
      update: function (t) {
        var a = fadeAB(t, at, until, 0.5, 0.45);
        showEl(el, a > 0.004);
        setS(el, "opacity", a.toFixed(3));
        setS(el, "transform", "translateY(" + ((1 - outCubic(smooth((t - at) / 0.5))) * 18).toFixed(1) + "px)");
      },
    };
    OVERLAYS.push(ov);
    return ov;
  }
  function caption(root, text, at, tl, o) {
    o = obj(o);
    return head(root, { title: text, at: num(at, 0.4), until: o.until, pos: "bottom", size: PORTRAIT ? 44 : 38, maxLines: 2, maxW: o.maxW, ink: o.ink });
  }
  function tag(root, name, sub, at, o) {
    o = obj(o);
    var st = stageOf(root), el = div("ct-tag", st.ui);
    el.setAttribute("data-ctbox", "tag");
    if (o.ink) el.classList.add("ct-ink");
    var maxW = num(o.maxW, PORTRAIT ? 900 : 620);
    var nl = layoutText(str(name) || "City", { weight: 800, size: PORTRAIT ? 28 : 28, maxW: maxW, maxLines: 1, upper: true, ls: 0.14, balance: false });
    var sl = sub ? layoutText(sub, { weight: 500, size: PORTRAIT ? 22 : 20, maxW: maxW, maxLines: 1, balance: false }) : null;
    var align = o.align || (PORTRAIT ? "center" : "right");
    fillText(div("ct-tag-name", el), nl, align);
    if (sl) { var se = fillText(div("ct-tag-sub", el), sl, align); se.style.marginTop = "4px"; }
    var w = Math.ceil(Math.max(nl.w, sl ? sl.w : 0)), h = Math.ceil(nl.h + (sl ? sl.h + 4 : 0));
    var x = align === "left" ? num(o.x, SAFE.x0) : align === "center" ? num(o.x, FW / 2) - w / 2 : num(o.x, SAFE.x1) - w, y = num(o.y, SAFE.y0);
    el.style.left = px(x); el.style.top = px(y); el.style.width = px(w + 2);
    var a0 = num(at, 0.15);
    reserve({ x: x, y: y, w: w, h: h }, a0, 1e9);
    var ov = { el: el, h: h, update: function (t) { var a = smooth((t - a0) / 0.4); showEl(el, a > 0.004); setS(el, "opacity", a.toFixed(3)); } };
    OVERLAYS.push(ov);
    return ov;
  }
  // Year chip (before-after, skyline-compare): big year plus a small label.
  function chip(root, o) {
    o = obj(o);
    var st = stageOf(root), el = div("ct-chip", st.ui);
    el.setAttribute("data-ctbox", "chip");
    var ys = PORTRAIT ? 64 : 58, maxW = num(o.maxW, PORTRAIT ? 440 : 520);
    var top = o.kicker ? layoutText(o.kicker, { weight: 800, size: PORTRAIT ? 22 : 20, maxW: maxW - 44, maxLines: 1, upper: true, ls: 0.14, balance: false }) : null;
    var yl = layoutText(str(o.big), { weight: 800, size: num(o.size, ys), maxW: maxW - 44, maxLines: 1, balance: false });
    var ll = o.label ? layoutText(o.label, { weight: 600, size: PORTRAIT ? 28 : 24, maxW: maxW - 44, maxLines: 2, lh: 1.2 }) : null;
    var align = o.align || "left";
    if (top) fillText(div("ct-chip-k", el), top, align);
    fillText(div("ct-chip-y", el), yl, align);
    if (ll) fillText(div("ct-chip-l", el), ll, align);
    if (o.accent) el.classList.add("ct-chip-on");
    var w = Math.ceil(Math.max(yl.w, ll ? ll.w : 0, top ? top.w : 0) + 44), h = Math.ceil(yl.h + (ll ? ll.h + 4 : 0) + (top ? top.h + 4 : 0) + 30);
    var x = align === "right" ? num(o.x, SAFE.x1) - w : align === "center" ? num(o.x, FW / 2) - w / 2 : num(o.x, SAFE.x0);
    var y = o.bottom != null ? num(o.bottom, SAFE.y1) - h : num(o.y, SAFE.y0);
    el.style.left = px(x); el.style.top = px(y); el.style.width = px(w); el.style.height = px(h);
    var at = num(o.at, 0.2), until = o.until != null ? num(o.until, 1e9) : 1e9;
    reserve({ x: x, y: y, w: w, h: h }, at, until);
    var ov = {
      el: el, box: { x: x, y: y, w: w, h: h },
      update: function (t) {
        var a = fadeAB(t, at, until, 0.4, 0.3);
        showEl(el, a > 0.004);
        setS(el, "opacity", a.toFixed(3));
        setS(el, "transform", "translateY(" + ((1 - outCubic(a)) * 14).toFixed(1) + "px)");
      },
    };
    OVERLAYS.push(ov);
    return ov;
  }
  // Counting stat (landmark height): value(t) -> number.
  function stat(root, o) {
    o = obj(o);
    var st = stageOf(root), el = div("ct-stat", st.ui);
    el.setAttribute("data-ctbox", "stat");
    var nEl = div("ct-stat-n", el), lEl = div("ct-stat-l", el);
    var size = PORTRAIT ? 92 : 84, unit = str(o.unit), maxV = Math.max(1, num(o.max, 100));
    var wN = textW(V.format(maxV) + unit, 800, size, 0) + 10;
    var ll = layoutText(str(o.label) || "height", { weight: 700, size: PORTRAIT ? 26 : 24, maxW: 420, maxLines: 1, upper: true, ls: 0.14, balance: false });
    nEl.style.fontSize = px(size);
    fillText(lEl, ll, o.align || "right");
    var w = Math.ceil(Math.max(wN, ll.w)), h = Math.ceil(size * 1.0 + ll.h + 6);
    var align = o.align || "right";
    var x = align === "right" ? num(o.x, SAFE.x1) - w : num(o.x, SAFE.x0), y = num(o.y, SAFE.y0 + 120);
    el.style.left = px(x); el.style.top = px(y); el.style.width = px(w); el.style.textAlign = align;
    var at = num(o.at, 0.5);
    reserve({ x: x, y: y, w: w, h: h }, at, 1e9);
    var last = null;
    var ov = {
      el: el,
      update: function (t) {
        var a = smooth((t - at) / 0.4);
        showEl(el, a > 0.004);
        setS(el, "opacity", a.toFixed(3));
        var v = Math.round(clamp(num(o.value(t), 0), 0, maxV)), txt = V.format(v) + unit;
        if (txt !== last) { last = txt; nEl.textContent = txt; }
      },
    };
    OVERLAYS.push(ov);
    return ov;
  }
  function autoEraItems(W) {
    var items = [], s = W.sched, prevE = -1;
    if (!s) { var e = eraIndex(W.stateAt(0.5).p); return [{ at: 0.4, title: ERAS[e].name }]; }
    var t0 = s[0][0], t1 = s[s.length - 1][0];
    for (var k = 0; k <= 120; k++) {
      var t = lerp(t0, t1, k / 120), e2 = eraIndex(W.stateAt(t).p);
      if (e2 !== prevE) { items.push({ at: k === 0 ? 0.4 : t, title: ERAS[e2].name }); prevE = e2; }
    }
    for (var i = items.length - 1; i > 0; i--) if (items[i].at - items[i - 1].at < 1.2) items.splice(i - 1, 1);
    return items;
  }
  function keywords(n, narration) {
    var text = str(narration || V.narration), seen = {}, out = [];
    contentWords(text).forEach(function (w) { var k = normWord(w); if (k.length < 4 || seen[k]) return; seen[k] = 1; out.push(w); });
    out = out.map(function (w, i) { return { w: w, i: i }; }).sort(function (a, b) { return b.w.length - a.w.length || a.i - b.i; }).slice(0, Math.max(1, int(n, 3)));
    out.sort(function (a, b) { return a.i - b.i; });
    return out.map(function (o) { var t = kwFind(o.w, 0); return { text: o.w, at: t != null ? t : 0.5 }; });
  }
  function applyCamera(W, mode) {
    mode = str(mode).toLowerCase();
    var end = Math.max(0.6, D - 0.4), b = W.cam;
    switch (mode) {
      case "dolly": b.dist.to(0.84, 0, end); b.yaw.to(b.yaw.base + 3, 0, end); break;
      case "flyover": b.yaw.base -= 12; b.yaw.to(b.yaw.base + 28, 0, end); b.pitch.base -= 4; b.pitch.to(b.pitch.base + 12, 0, end); b.dist.to(0.9, 0, end); break;
      case "reverse": b.dist.base = 0.78; b.yaw.base += 8; b.dist.to(1.0, 0, end); b.yaw.to(b.yaw.base - 14, 0, end); break;
      case "static": b.dist.to(0.985, 0, end); break;
      default: b.yaw.to(b.yaw.base + 14, 0, end); b.dist.to(0.88, 0, end);
    }
    W.fitted = null;
    return W;
  }

  // ========================= template helpers =========================
  function assign(a) { for (var i = 1; i < arguments.length; i++) { var b = arguments[i] || {}; for (var k in b) if (Object.prototype.hasOwnProperty.call(b, k)) a[k] = b[k]; } return a; }
  function baseOpts(p) { return { city: p.city, preset: p.preset, style: p.style, seed: p.seed, districts: p.districts, population: p.population, keyDates: p.keyDates }; }
  function mkWorld(root, p, extra) { return new World(root, assign(baseOpts(p), extra || {})); }
  World.prototype.fitTo = function (pts, margin, yawOff, pitchAbs) {
    var W = this, f = W.ensureCam(), cx = 0, cy = 0;
    pts.forEach(function (q) { cx += q[0]; cy += q[1]; });
    cx /= pts.length; cy /= pts.length;
    var c = fitCam(pts, { yaw: W.presetYaw + (yawOff != null ? yawOff : W.cam.yaw.base), pitch: pitchAbs != null ? pitchAbs : W.cam.pitch.base, fov: W.cam.fov.base, tx: cx, ty: cy, tz: 0 }, W.vp, margin == null ? 0.06 : margin, true);
    return { tx: c.tx, ty: c.ty, tz: c.tz, dist: c.dist / f.dist };
  };
  function topNear(W, x, y, p, r) {
    var top = W.M.heightAt(x, y);
    W.M.lots.forEach(function (l) {
      if (Math.abs(l.x - x) > r || Math.abs(l.y - y) > r) return;
      var s = l.born <= p ? lotNow(W, l, p, 1) : null;
      if (s) top = Math.max(top, l.z0 + s.h);
    });
    return top;
  }
  function cellDistrict(M, c) {
    if (c._d != null) return c._d;
    var best = 0, bd = 1e9;
    M.districts.forEach(function (d, k) { var q = (c.cx - d.cx) * (c.cx - d.cx) + (c.cy - d.cy) * (c.cy - d.cy); if (q < bd) { bd = q; best = k; } });
    return (c._d = best);
  }
  function cityExtent(M, p) {
    var n = 0, sx = 0, sy = 0, r = 0;
    M.lots.forEach(function (l) { if (l.born <= p) { n++; sx += l.x; sy += l.y; } });
    var cx = n ? sx / n : M.origin[0], cy = n ? sy / n : M.origin[1];
    M.lots.forEach(function (l) { if (l.born <= p) r = Math.max(r, Math.hypot(l.x - cx, l.y - cy)); });
    return { cx: cx, cy: cy, r: Math.max(3, r), n: n };
  }
  function nearestBuiltLot(M, x, y, p) {
    var best = null, bd = 1e9;
    M.lots.forEach(function (l) { if (l.born > p) return; var d = Math.hypot(l.x - x, l.y - y); if (d < bd) { bd = d; best = l; } });
    return best;
  }
  function farmCell(W, p, forest) {
    var M = W.M, ex = cityExtent(M, p), target = ex.r + 2.5, best = null, bs = 1e9;
    M.terrain.cells.forEach(function (c) {
      if (!c.inner || !c.land || c.park) return;
      if (forest ? !(c.trees && treeK(c, p) > 0.9) : !(c.pF <= p && c.pU > p)) return;
      var s = Math.abs(Math.hypot(c.cx - ex.cx, c.cy - ex.cy) - target) + c.h0 * 0.8;
      if (s < bs) { bs = s; best = c; }
    });
    return best;
  }
  function anchorFor(W, c, used, p) {
    var M = W.M, hint = (c.text + " " + c.keyword + " " + c.landmark).toLowerCase(), L, d, B;
    function lm(Lm) { return { x: Lm.x, y: Lm.y, z: Lm.z0 + Lm.h + 0.12, key: "L:" + Lm.name }; }
    function dist(dd) { return { x: dd.cx, y: dd.cy, z: topNear(W, dd.cx, dd.cy, p, 0.9) + 0.12, key: dd.key }; }
    function active(Lm) { return Lm && (Lm.qFn || (p >= Lm.p && p < Lm.pEnd)) && !used["L:" + Lm.name]; }
    function bridge() { var b = M.bridges.filter(function (q) { return p >= q.p; })[0]; return b && !used.B ? { x: (b.a[0] + b.b[0]) / 2, y: (b.a[1] + b.b[1]) / 2, z: 0.5, key: "B" } : null; }
    if (c.landmark) {
      if (/bridge/.test(c.landmark.toLowerCase()) && (B = bridge())) return B;
      L = findLandmark(M, c.landmark);
      if (active(L)) return lm(L);
    }
    if (c.district) { d = findDistrict(M, c.district); if (d && !used[d.key]) return dist(d); }
    if (/farm|field|orchard|pasture|meadow|countryside|crop|plantation/.test(hint)) { var f = farmCell(W, p, false); if (f && !used.farm) return { x: f.cx, y: f.cy, z: f.z + 0.08, key: "farm" }; }
    if (/forest|wood|wild|tree/.test(hint)) { var fo = farmCell(W, p, true); if (fo && !used.forest) return { x: fo.cx, y: fo.cy, z: fo.z + 0.4, key: "forest" }; }
    if (/bridge/.test(hint) && (B = bridge())) return B;
    L = findLandmark(M, c.text);
    if (active(L)) return lm(L);
    d = fuzzy(M.districts, c.text, "name");
    if (d && d.born <= p && !used[d.key]) return dist(d);
    for (var i = 0; i < M.districts.length; i++) { d = M.districts[i]; if (!used[d.key] && d.born <= p + 0.01 && d.lots.length) return dist(d); }
    return { x: M.origin[0], y: M.origin[1], z: topNear(W, M.origin[0], M.origin[1], p, 0.6) + 0.12, key: "origin" };
  }
  function furnish(root, W, p, o) {
    o = o || {};
    vignette(root);
    var tg = o.noTag ? null : tag(root, W.M.cityName, W.M.sub, 0.15);
    return yearCounter(root, W, { now: o.now, population: o.population != null ? o.population : p.showPopulation !== false, pulse: o.pulse, y: PORTRAIT && tg ? SAFE.y0 + tg.h + 16 : SAFE.y0, ink: o.ink, align: o.align, x: o.x });
  }
  function yearSpan(p, a, b, da, db) {
    var yf = int(p[a], da), yt = int(p[b], db);
    if (yt < yf) { var s = yf; yf = yt; yt = s; }
    if (yt === yf) yt = yf + 1;
    return [yf, yt];
  }
  function cleanBeats(list, yf, yt) {
    var beats = arr(list).slice(0, 8).map(function (b) { b = obj(b); return { year: num(b.year, NaN), label: str(b.label), caption: str(b.caption), keyword: str(b.keyword) }; });
    beats.forEach(function (b, i) {
      if (!isFinite(b.year)) b.year = lerp(yf, yt, (i + 1) / (beats.length + 1));
      b.year = clamp(Math.round(b.year), yf, yt);
      if (i && b.year < beats[i - 1].year) b.year = beats[i - 1].year;
    });
    return beats;
  }

  // ========================= templates =========================
  var TPL = {};
  TPL.timelapse = function (root, p) {
    var ys = yearSpan(p, "yearFrom", "yearTo", 1609, 2024), yf = ys[0], yt = ys[1];
    var beats = cleanBeats(p.beats, yf, yt), times = landTimes(beats, { first: 0.7, tail: 1.6, gap: 0.9 });
    var W = mkWorld(root, p, { yearFrom: yf, yearTo: yt, light: p.light });
    var sched = [[0.2, yf]];
    beats.forEach(function (b, i) { sched.push([times[i], b.year]); });
    sched.push([Math.max(times.length ? times[times.length - 1] + 0.7 : 0.8, D - 1.15), yt]);
    W.yearSchedule(sched);
    applyCamera(W, p.camera || "orbit");
    furnish(root, W, p, { now: p.endsNow ? yt : null, pulse: times });
    var items = beats.map(function (b, i) { return { at: times[i] - 0.08, title: b.label, sub: b.caption }; }).filter(function (i) { return i.title || i.sub; });
    lowerThird(root, items.length ? items : autoEraItems(W));
    if (p.title || p.kicker) head(root, { kicker: p.kicker, title: p.title, at: 0.3, until: num(p.titleUntil, 4.5), pos: "center" });
    return W;
  };
  TPL["era-snapshot"] = function (root, p) {
    var year = int(p.year, 1760);
    var W = mkWorld(root, p, { year: year, light: p.light });
    var P0 = W.clock.p(year);
    applyCamera(W, p.camera || "orbit");
    furnish(root, W, p, {});
    var cs = arr(p.callouts).slice(0, 5).map(function (c) { c = obj(c); return { text: str(c.text), keyword: str(c.keyword), district: str(c.district), landmark: str(c.landmark) }; }).filter(function (c) { return c.text; });
    var times = landTimes(cs.map(function (c) { return { label: c.text, keyword: c.keyword }; }), { first: 0.9, tail: 1.3, gap: 0.6 });
    var used = {};
    cs.forEach(function (c, i) { var a = anchorFor(W, c, used, P0); used[a.key] = 1; W.label(a.x, a.y, a.z, c.text, { at: times[i] }); });
    if (cs.length) W.showDistricts = false;
    lowerThird(root, [{ at: 0.35, title: str(p.label) || ERAS[eraIndex(P0)].name, sub: p.caption }]);
    if (p.title || p.kicker) head(root, { kicker: p.kicker, title: p.title, at: 0.3, until: 4, pos: "center" });
    return W;
  };
  TPL["landmark-rise"] = function (root, p) {
    var year = int(p.year, 1931), lm = obj(p.landmark), kind = LMK[str(lm.kind).toLowerCase()] ? str(lm.kind).toLowerCase() : "tower";
    var name = str(lm.name) || "The new tower";
    var M = getModel(baseOpts(p)), clock = makeClock(null, null, p.keyDates, M.style), pY = clock.p(year);
    var hm = num(lm.heightMetres, 0), H = hm > 0 ? clamp(hm / 40, 1.2, 18) : LMK[kind].h;
    var tgt = kind === "stadium" ? [M.districts[6].cx, M.districts[6].cy] : kind === "ferris" ? [M.districts[1].cx, M.districts[1].cy] : M.cores[0];
    var L = addLandmarkImpl(M, kind, name, { x: tgt[0], y: tgt[1], p: 0, h: H, color: lm.color, clearLot: true, bornMax: pY });
    var tk = landTimes([{ label: name, keyword: lm.keyword }], { first: 0.9, tail: 1.4 })[0];
    var dur = Math.min(clamp(num(lm.riseSeconds, 2.6), 0.8, 8), Math.max(0.6, D - 1.0 - tk));
    var W = new World(root, assign(baseOpts(p), { model: M, year: year, light: p.light, frameP: pY }));
    if (L) {
      L.qFn = function (t) { var x = prog(t, tk, dur); return 0.5 * x + 0.5 * smooth(x); };
      var lmYear = int(lm.year, year);
      if (lmYear !== year) W.yearSchedule([[tk, year], [tk + dur, lmYear]]);
      var yawEnd = W.cam.yaw.base + 8;
      var pts = [[L.x, L.y, L.z0 + H]];
      square(L.x, L.y, L.w + 0.6, L.d + 0.6).forEach(function (q) { pts.push([q[0], q[1], L.z0]); });
      for (var a = 0; a < 12; a++) pts.push([L.x + Math.cos((a / 12) * 2 * PI) * 3.2, L.y + Math.sin((a / 12) * 2 * PI) * 3.2, 0]);
      var fin = W.fitTo(pts, 0.1, yawEnd);
      var endT = Math.max(1, D - 0.5);
      W.cam.yaw.to(yawEnd, 0, endT);
      W.cam.tx.to(fin.tx, 0.2, endT - 0.2); W.cam.ty.to(fin.ty, 0.2, endT - 0.2); W.cam.tz.to(fin.tz, 0.2, endT - 0.2);
      W.cam.dist.to(Math.min(1, fin.dist), 0.2, endT - 0.2);
      W.label(L.x, L.y, L.z0 + H, name, { at: tk + dur * 0.5, big: true, sub: str(p.subtitle), lift: 96, follow: function (W2, t) { return L.z0 + H * clamp(L.qFn(t), 0, 1) + 0.1; } });
      if (hm > 0) stat(root, { value: function (t) { return hm * L.qFn(t); }, unit: " m", label: str(p.statLabel) || "height", max: hm, at: tk, y: PORTRAIT ? SAFE.y0 + 330 : SAFE.y0 + 92 });
    }
    W.showDistricts = false;
    furnish(root, W, p, { population: false });
    if (str(p.caption)) lowerThird(root, [{ at: tk + 0.25, title: p.caption }], { size: PORTRAIT ? 46 : 40 });
    if (p.title || p.kicker) head(root, { kicker: p.kicker, title: p.title, at: 0.3, until: Math.max(1.5, tk), pos: "center" });
    return W;
  };
  TPL["before-after"] = function (root, p) {
    var ys = yearSpan(p, "yearA", "yearB", 1850, 2024), yA = ys[0], yB = ys[1];
    var M = getModel(baseOpts(p)), clock = makeClock(null, null, p.keyDates, M.style), pB = clock.p(yB);
    var tk = landTimes([{ label: p.labelB, keyword: p.keyword }], { first: 1.2, tail: 1.8 })[0];
    var dur = Math.min(clamp(num(p.wipeSeconds, 1.4), 0.4, 5), Math.max(0.4, D - 0.9 - tk));
    var common = assign(baseOpts(p), { model: M, light: p.light, frameP: pB, districtLabels: false });
    var WA = new World(root, assign({}, common, { year: yA })), WB = new World(root, assign({}, common, { year: yB }));
    applyCamera(WA, "orbit"); applyCamera(WB, "orbit");
    vignette(root);
    var st = stageOf(root), wipe = div("ct-wipe", st.ui);
    div("ct-wipe-glow", wipe); div("ct-wipe-line", wipe);
    function X(t) { return lerp(FW + 40, FW * 0.5, inOutSine(prog(t, tk, dur))); }
    OVERLAYS.push({
      update: function (t) {
        var x = X(t);
        setS(WB.canvas, "clipPath", "inset(0px 0px 0px " + Math.max(0, Math.min(FW, x)).toFixed(1) + "px)");
        setS(wipe, "transform", "translateX(" + x.toFixed(1) + "px)");
        showEl(wipe, x < FW + 30);
      },
    });
    var hasTitle = !!(p.title || p.kicker);
    chip(root, { big: fmtYear(yA), label: p.labelA, x: SAFE.x0, bottom: SAFE.y1, align: "left", at: 0.2 });
    chip(root, { big: fmtYear(yB, { now: p.endsNow ? yB : null }), label: p.labelB, x: SAFE.x1, bottom: SAFE.y1, align: "right", at: tk + dur * 0.35, accent: true });
    if (hasTitle) head(root, { kicker: p.kicker, title: p.title, at: 0.3, pos: "top" });
    else tag(root, M.cityName, M.sub, 0.15, { align: PORTRAIT ? "center" : "right" });
    return WB;
  };
  TPL["district-growth"] = function (root, p) {
    var ys = yearSpan(p, "yearFrom", "yearTo", 1850, 1910), yf = ys[0], yt = ys[1];
    var W = mkWorld(root, p, { yearFrom: yf, yearTo: yt, light: p.light });
    var M = W.M, d = findDistrict(M, p.district) || M.districts[1] || M.districts[0];
    var lbl = str(p.label) || d.name;
    var tk = landTimes([{ label: lbl, keyword: p.keyword }], { first: 0.8, tail: 2.2 })[0];
    W.yearSchedule([[0.2, yf], [tk, lerp(yf, yt, 0.05)], [Math.max(tk + 1, D - 1.15), yt]]);
    var col = toRGB(p.color, ACCENT);
    var kF = function (t) { return smooth((t - tk + 0.15) / 0.8); };
    W.focus = { key: d.key, kFn: kF, color: col };
    W.labelAlpha = function (t) { return smooth((t - 0.25) / 0.6) * (1 - smooth((t - tk + 0.4) / 0.5)); };
    W.groundFn = function (c, colr, t) {
      var k = kF(t);
      if (k <= 0 || !c.inner) return colr;
      return cellDistrict(M, c) === d.index ? mixc(colr, col, 0.3 * k) : mixc(colr, [40, 46, 60], 0.3 * k);
    };
    var pE = W.clock.p(yt), pts = [];
    d.lots.forEach(function (l) { if (l.born <= pE) { var s = lotNow(W, l, pE, 1); pts.push([l.x, l.y, l.z0 + (s ? s.h : 0)]); } });
    for (var a = 0; a < 12; a++) pts.push([d.cx + Math.cos((a / 12) * 2 * PI) * 4.5, d.cy + Math.sin((a / 12) * 2 * PI) * 4.5, 0]);
    var yawEnd = W.cam.yaw.base + 10, pitchEnd = W.cam.pitch.base + 12, fin = W.fitTo(pts, 0.1, yawEnd, pitchEnd), endT = Math.max(1, D - 0.4);
    W.cam.yaw.to(yawEnd, 0, endT);
    W.cam.pitch.to(pitchEnd, tk - 0.3, endT - tk + 0.3);
    W.cam.tx.to(fin.tx, tk - 0.3, endT - tk + 0.3); W.cam.ty.to(fin.ty, tk - 0.3, endT - tk + 0.3); W.cam.tz.to(fin.tz, tk - 0.3, endT - tk + 0.3);
    W.cam.dist.to(clamp(fin.dist, 0.5, 0.95), tk - 0.3, endT - tk + 0.3);
    W.label(d.cx, d.cy, 1, d.name, { at: tk + 0.3, big: true, color: col, follow: function (W2) { return topNear(W2, d.cx, d.cy, W2.state.p, 0.9) + 0.15; } });
    furnish(root, W, p, {});
    lowerThird(root, [{ at: tk, title: lbl, sub: p.caption }]);
    if (p.title || p.kicker) head(root, { kicker: p.kicker, title: p.title, at: 0.3, until: Math.max(1.5, tk - 0.2), pos: "center" });
    return W;
  };
  function niceStep(x) { var e = Math.pow(10, Math.floor(Math.log10(Math.max(1e-9, x)))), f = x / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e; }
  function svgEl(tag, attrs, parent) { var e = doc.createElementNS("http://www.w3.org/2000/svg", tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  TPL["population-chart"] = function (root, p) {
    var pts = arr(p.points).map(function (q) { q = obj(q); return { year: num(q.year, NaN), value: num(q.value, NaN) }; }).filter(function (q) { return isFinite(q.year) && isFinite(q.value) && q.value >= 0; });
    pts.sort(function (a, b) { return a.year - b.year; });
    pts = pts.slice(0, 14);
    var M = getModel(baseOpts(p)), clock = makeClock(null, null, p.keyDates, M.style);
    if (pts.length < 2) pts = [1, 3, 4, 5, 6, 7].map(function (i) { var y = clock.eraYear(i); return { year: y, value: M.pop(clock.p(y)) }; }).concat([{ year: clock.now, value: M.popNow }]);
    var ys = yearSpan(p, "yearFrom", "yearTo", pts[0].year, pts[pts.length - 1].year), yf = ys[0], yt = ys[1];
    var marks = arr(p.marks).slice(0, 4).map(function (m) { m = obj(m); return { year: num(m.year, NaN), label: str(m.label), keyword: str(m.keyword) }; }).filter(function (m) { return isFinite(m.year); });
    var times = landTimes(marks.map(function (m) { return { label: m.label, keyword: m.keyword }; }), { first: 0.9, tail: 1.6, gap: 0.8 });
    var sched = [[0.3, yf]], lastY = yf, lastT = 0.3;
    marks.forEach(function (m, i) { var y = clamp(m.year, yf, yt); if (y >= lastY && times[i] > lastT + 0.2) { sched.push([times[i], y]); lastY = y; lastT = times[i]; } });
    sched.push([Math.max(lastT + 0.6, D - 1.1), yt]);
    var vp = PORTRAIT ? { x: 0.04, y: 0.2, w: 0.92, h: 0.27 } : { x: 0.02, y: 0.2, w: 0.5, h: 0.66 };
    var W = new World(root, assign(baseOpts(p), { model: M, yearFrom: yf, yearTo: yt, light: p.light, viewport: vp, yearEase: "linear" }));
    W.yearSchedule(sched);
    applyCamera(W, "orbit");
    vignette(root);
    var st = stageOf(root), hasTitle = !!(p.title || p.kicker);
    var px0 = PORTRAIT ? SAFE.x0 : Math.round(FW * 0.535), pw = PORTRAIT ? SAFE.w : SAFE.x1 - px0;
    var hd = hasTitle ? head(root, { kicker: p.kicker, title: p.title, at: 0.3, pos: "top", align: PORTRAIT ? "center" : "left", x: px0, maxW: pw, panel: false }) : null;
    if (!PORTRAIT) tag(root, M.cityName, M.sub, 0.15, { align: "left" });
    var py0 = PORTRAIT ? Math.round(FH * 0.5) : hd ? Math.round(hd.box.y + hd.box.h + 26) : SAFE.y0 + 40, ph = SAFE.y1 - py0;
    var panel = div("ct-chart", st.ui);
    panel.setAttribute("data-ctbox", "chart");
    panel.style.left = px(px0); panel.style.top = px(py0); panel.style.width = px(pw); panel.style.height = px(ph);
    reserve({ x: px0, y: py0, w: pw, h: ph }, 0, 1e9);
    var unit = str(p.unit), raw = p.format === "raw", logS = !!p.logScale;
    function fmtV(v) { return (raw ? V.format(Math.round(v)) : fmtPop(v)) + unit; }
    var read = div("ct-read", panel), rv = div("ct-read-v", read), ry = div("ct-read-y", read);
    var rs = PORTRAIT ? 72 : 76;
    var maxV = 0;
    pts.forEach(function (q) { maxV = Math.max(maxV, q.value); });
    var rw = textW(fmtV(maxV) + "8", 800, rs, 0);
    if (rw > pw - 80) rs *= (pw - 80) / rw;
    rv.style.fontSize = px(rs); ry.style.fontSize = px(PORTRAIT ? 30 : 28);
    var top = 26 + rs * 1.05 + 14;
    var svg = svgEl("svg", { width: pw, height: ph, viewBox: "0 0 " + pw + " " + ph, class: "ct-chart-svg" }, panel);
    var mRows = marks.length > 1 ? 2 : marks.length ? 1 : 0, rowH = PORTRAIT ? 32 : 28;
    var fsz = PORTRAIT ? 27 : 21;
    var L0 = PORTRAIT ? 100 : 86, R0 = pw - 34, T0 = top + 10 + mRows * rowH, B0 = ph - (PORTRAIT ? 60 : 54);
    var minPos = Infinity;
    pts.forEach(function (q) { if (q.value > 0) minPos = Math.min(minPos, q.value); });
    var lmin = logS ? Math.log10(Math.max(minPos, maxV / 1e6, 1)) : 0, lmax = logS ? Math.log10(Math.max(1, maxV)) : 0;
    var vmax = logS ? 0 : niceStep(maxV / 4) * Math.ceil(maxV / niceStep(maxV / 4));
    function vy(v) { var k = logS ? (Math.log10(Math.max(v, Math.pow(10, lmin))) - lmin) / Math.max(1e-6, lmax - lmin) : v / Math.max(1e-9, vmax); return lerp(B0, T0, clamp(k, 0, 1)); }
    function vx(y) { return lerp(L0, R0, clamp((y - yf) / (yt - yf), 0, 1)); }
    var grid = svgEl("g", { class: "ct-grid" }, svg), ticks = [];
    if (logS) { for (var e = Math.ceil(lmin); e <= Math.floor(lmax); e++) ticks.push(Math.pow(10, e)); if (ticks.length > 6) ticks = ticks.filter(function (_, i) { return i % 2 === 0; }); }
    else { var stp = niceStep(maxV / 4); for (var v0 = 0; v0 <= vmax + 1e-6; v0 += stp) ticks.push(v0); }
    ticks.forEach(function (v) {
      var y = vy(v);
      svgEl("line", { x1: L0, x2: R0, y1: y, y2: y, class: "ct-gl" }, grid);
      var tx = svgEl("text", { x: L0 - 12, y: y + fsz * 0.33, "text-anchor": "end", class: "ct-gt", "font-size": fsz }, grid);
      tx.textContent = raw ? V.format(v) : fmtPop(v);
    });
    [yf, Math.round((yf + yt) / 2), yt].forEach(function (y, i) {
      var tx = svgEl("text", { x: vx(y), y: B0 + 14 + fsz, "text-anchor": i === 0 ? "start" : i === 2 ? "end" : "middle", class: "ct-gt", "font-size": fsz }, grid);
      tx.textContent = fmtYear(y);
    });
    svgEl("line", { x1: L0, x2: R0, y1: B0, y2: B0, class: "ct-axis" }, svg);
    var area = svgEl("path", { class: "ct-area", d: "" }, svg), line = svgEl("path", { class: "ct-line", d: "" }, svg);
    var mg = svgEl("g", {}, svg), placedM = [], markEls = marks.map(function (m) {
      var g = svgEl("g", { class: "ct-mark" }, mg), x = vx(m.year);
      var lw = textW(m.label, 700, fsz + 1, 0), anchor = x + lw / 2 > R0 ? "end" : x - lw / 2 < L0 ? "start" : "middle";
      var bx0 = anchor === "end" ? x - 6 - lw : anchor === "start" ? x + 6 : x - lw / 2, row = 0;
      while (row < mRows - 1 && placedM.some(function (q) { return q.row === row && !(bx0 + lw + 14 < q.x0 || bx0 > q.x0 + q.w + 14); })) row++;
      placedM.push({ x0: bx0, w: lw, row: row });
      var base = top + 22 + row * rowH;
      svgEl("line", { x1: x, x2: x, y1: base + 8, y2: B0, class: "ct-ml" }, g);
      var tx = svgEl("text", { x: x + (anchor === "end" ? -6 : anchor === "start" ? 6 : 0), y: base, "text-anchor": anchor, class: "ct-mt", "font-size": fsz + 1 }, g);
      tx.textContent = m.label;
      return { g: g, m: m };
    });
    var dotR = svgEl("circle", { r: 15, class: "ct-dot-r" }, svg), dot = svgEl("circle", { r: 8, class: "ct-dot" }, svg);
    function valAt(y) {
      if (y <= pts[0].year) return pts[0].value;
      for (var i = 1; i < pts.length; i++) if (y <= pts[i].year) {
        var a = pts[i - 1], b = pts[i], k = (y - a.year) / Math.max(1e-6, b.year - a.year);
        if (logS && a.value > 0 && b.value > 0) return Math.exp(lerp(Math.log(a.value), Math.log(b.value), k));
        return lerp(a.value, b.value, k);
      }
      return pts[pts.length - 1].value;
    }
    var lastD = null, lastR = null;
    OVERLAYS.push({
      update: function (t) {
        var Y = W.stateAt(t).year, d = "", y0v = valAt(Math.max(yf, pts[0].year));
        var startY = Math.max(yf, pts[0].year);
        d = "M" + vx(startY).toFixed(1) + " " + vy(y0v).toFixed(1);
        for (var i = 0; i < pts.length; i++) if (pts[i].year > startY && pts[i].year < Y) d += " L" + vx(pts[i].year).toFixed(1) + " " + vy(pts[i].value).toFixed(1);
        var hx = vx(Math.max(startY, Y)), hv = valAt(Y), hy = vy(hv);
        d += " L" + hx.toFixed(1) + " " + hy.toFixed(1);
        if (d !== lastD) {
          lastD = d;
          line.setAttribute("d", d);
          area.setAttribute("d", d + " L" + hx.toFixed(1) + " " + B0 + " L" + vx(startY).toFixed(1) + " " + B0 + " Z");
          dot.setAttribute("cx", hx.toFixed(1)); dot.setAttribute("cy", hy.toFixed(1));
          dotR.setAttribute("cx", hx.toFixed(1)); dotR.setAttribute("cy", hy.toFixed(1));
        }
        var r = fmtV(hv) + "|" + fmtYear(Y);
        if (r !== lastR) { lastR = r; rv.textContent = fmtV(hv); ry.textContent = fmtYear(Y); }
        markEls.forEach(function (me) { var a = smooth((Y - me.m.year + (yt - yf) * 0.005) / ((yt - yf) * 0.03)); me.g.setAttribute("opacity", a.toFixed(3)); });
        var a2 = smooth((t - 0.1) / 0.4);
        setS(panel, "opacity", a2.toFixed(3));
      },
    });
    return W;
  };
  TPL["disaster-rebuild"] = function (root, p) {
    var year = int(p.year, 1871), kind = /^(fire|flood|quake|storm)$/.test(str(p.event)) ? str(p.event) : "fire";
    var ry = Math.max(year + 1, int(p.rebuildYear, year + 20));
    var W = mkWorld(root, p, { yearFrom: year, yearTo: ry, light: p.light });
    var M = W.M, pHit = W.clock.p(year), pR = Math.min(1, W.clock.p(ry) + 0.08);
    var ts = landTimes([{ label: p.label, keyword: p.keywordHit }, { label: p.rebuildLabel, keyword: p.keywordRebuild }], { first: 1.0, tail: 2.2, gap: 1.8 });
    var tHit = ts[0], tReb = ts[1];
    W.yearSchedule([[0.2, year], [tReb, year], [Math.max(tReb + 0.8, D - 1.1), ry]]);
    var area = str(p.area).toLowerCase(), c0 = M.cores[0];
    if (area === "waterfront") c0 = [M.districts[1].cx, M.districts[1].cy];
    else if (/^(north|south|east|west)$/.test(area)) {
      var ex = cityExtent(M, pHit), off = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] }[area];
      var nl = nearestBuiltLot(M, ex.cx + off[0] * ex.r * 0.4, ex.cy + off[1] * ex.r * 0.4, pHit);
      c0 = nl ? [nl.x, nl.y] : [ex.cx, ex.cy];
    }
    var r = clamp(num(p.radius, 4.5), 2, 12);
    var kEv = function (t) { return smooth((t - tHit) / 0.8) * (1 - smooth((t - tReb) / 1.6)); };
    var rebDur = Math.max(0.8, D - 1.0 - tReb);
    var looks = {};
    W.disaster = {
      kind: kind, cx: c0[0], cy: c0[1], r: r,
      kFn: function (t) { return smooth((t - tHit) / 1.6); },
      rebFn: function (t) { return clamp((t - tReb) / rebDur, 0, 1); },
      glowFn: kEv,
      look: function (l) {
        var key = l.i + "," + l.j;
        if (looks[key] !== undefined) return looks[key];
        var s = stageAtP(l, pR), before = stageAtP(l, pHit), bh = before ? before.h : 0.3, out = null;
        if (s) {
          var kd = s.kind, h = s.h;
          if (/^(hut|house|stone|row)$/.test(kd) || h < bh * 1.35) {
            if (l.dens > 0.3 && pR > 0.6) { kd = "early"; h = 1.5 + l.dens * 2.6 + l.r[4]; }
            else { kd = kd === "factory" ? "factory" : "brick"; h = Math.max(h, bh * 1.45, 0.8); }
          }
          out = { kind: kd, h: h };
        }
        return (looks[key] = out);
      },
    };
    W.lightFn = function (L, t) {
      var k = kEv(t);
      if (k <= 0) return L;
      if (kind === "fire") { L.fog = mixc(L.fog, [150, 92, 64], 0.35 * k); L.hor = mixc(L.hor, [230, 120, 60], 0.4 * k); L.amb *= 1 - 0.12 * k; }
      else if (kind === "storm") { var dk = [52, 60, 76]; L.top = mixc(L.top, [30, 36, 50], 0.7 * k); L.hor = mixc(L.hor, dk, 0.6 * k); L.fog = mixc(L.fog, dk, 0.55 * k); L.dif *= 1 - 0.6 * k; L.amb *= 1 - 0.2 * k; L.fogK *= 1 + 0.6 * k; }
      else if (kind === "flood") { L.fog = mixc(L.fog, [120, 130, 140], 0.4 * k); L.dif *= 1 - 0.35 * k; }
      else { L.fog = mixc(L.fog, [190, 170, 140], 0.3 * k); }
      return L;
    };
    if (kind === "flood") W.groundFxFn = function (W2, ctx, t) {
      var k = kEv(t), P = W2.P;
      if (k <= 0.01) return;
      var rr = r * (0.7 + 0.7 * k), ring = [], n = 0, i2;
      for (i2 = 0; i2 < 32; i2++) { var an = (i2 / 32) * 2 * PI, wob = 1 + 0.12 * Math.sin(an * 3 + 1.3) + 0.08 * Math.sin(an * 5); ring.push([c0[0] + Math.cos(an) * rr * wob, c0[1] + Math.sin(an) * rr * wob]); }
      ring.forEach(function (q) { pj(P, q[0], q[1], 0.14, TP, n * 2); n++; });
      polyPath(ctx, TP, n, 0);
      ctx.fillStyle = css(mixc(W2.waterRGB || [60, 100, 140], [132, 118, 88], 0.45), 0.9 * k); ctx.fill();
      ctx.beginPath();
      for (i2 = 0; i2 < 40; i2++) {
        var a2 = hash(i2 * 3 + 7) * 2 * PI, d2 = Math.sqrt(hash(i2 * 3 + 8)) * rr * 0.9, sp = proj(P, c0[0] + Math.cos(a2) * d2 + Math.sin(t * 0.7 + i2) * 0.2, c0[1] + Math.sin(a2) * d2, 0.15);
        if (sp[2] < P.near) continue;
        var wl = (0.35 * P.F) / sp[2];
        ctx.moveTo(sp[0] - wl / 2, sp[1]); ctx.lineTo(sp[0] + wl / 2, sp[1]);
      }
      ctx.strokeStyle = css([230, 236, 240], 0.45 * k); ctx.lineWidth = 1.5; ctx.stroke();
    };
    if (kind === "quake") W.shakeFn = function (t) { var a = prog(t, tHit, 0.05) * (1 - prog(t, tHit, 1.7)); return [Math.sin(t * 41) * 0.22 * a, Math.cos(t * 37) * 0.18 * a, 0]; };
    W.fxFn = function (W2, ctx, t) {
      var k = kEv(t), P = W2.P;
      if (k <= 0.01) return;
      var s = proj(P, c0[0], c0[1], 0.4);
      if (s[2] < P.near) return;
      var R = ((r + 1) * P.F) / s[2];
      if (kind === "fire") {
        var g = ctx.createRadialGradient(s[0], s[1], 0, s[0], s[1], R * 1.3);
        g.addColorStop(0, css([255, 150, 60], 0.42 * k)); g.addColorStop(1, css([255, 110, 40], 0));
        ctx.fillStyle = g; ctx.fillRect(s[0] - R * 1.4, s[1] - R * 1.4, R * 2.8, R * 2.8);
      }
      var cols = kind === "fire" ? [58, 52, 50] : kind === "quake" ? [196, 178, 150] : null;
      if (cols) for (var j = 0; j < 7; j++) {
        var bx = c0[0] + (hash(j * 5 + 1) - 0.5) * r * 1.2, by = c0[1] + (hash(j * 5 + 2) - 0.5) * r * 1.2;
        for (var q2 = 0; q2 < 5; q2++) {
          var ph = frac(t * (kind === "fire" ? 0.16 : 0.3) + q2 / 5 + hash(j * 5 + 3));
          var sp = proj(P, bx + ph * 2.2, by - ph * 0.8, (kind === "fire" ? 0.8 + ph * 5 : 0.2 + ph * 1.2));
          if (sp[2] < P.near) continue;
          var rr = ((kind === "fire" ? 0.5 + ph * 1.7 : 0.4 + ph * 0.9) * P.F) / sp[2];
          ctx.beginPath(); ctx.arc(sp[0], sp[1], rr, 0, 2 * PI);
          ctx.fillStyle = css(cols, (kind === "fire" ? 0.34 : 0.3) * (1 - ph) * k); ctx.fill();
        }
      }
      if (kind === "storm") {
        ctx.beginPath();
        for (var i = 0; i < 180; i++) {
          var x = frac(hash(i * 3 + 1) + t * 0.35) * (W2.cw + 200) - 100, y = frac(hash(i * 3 + 2) + t * 1.7) * (W2.ch + 100) - 50;
          ctx.moveTo(x, y); ctx.lineTo(x - 10, y + 34);
        }
        ctx.strokeStyle = css([210, 220, 236], 0.32 * k); ctx.lineWidth = 1.6; ctx.stroke();
        [tHit + 0.25, tHit + 1.5].forEach(function (tf) { if (t > tf && t < tf + 0.5) { ctx.fillStyle = css([236, 240, 255], 0.3 * Math.exp(-(t - tf) * 10) * k); ctx.fillRect(0, 0, W2.cw, W2.ch); } });
      }
    };
    var yawEnd = W.cam.yaw.base + 10, pts = [];
    for (var a = 0; a < 14; a++) pts.push([c0[0] + Math.cos((a / 14) * 2 * PI) * (r + 3.5), c0[1] + Math.sin((a / 14) * 2 * PI) * (r + 3.5), 0]);
    pts.push([c0[0], c0[1], 3]);
    var fin = W.fitTo(pts, 0.08, yawEnd), endT = Math.max(1, D - 0.4);
    W.cam.yaw.to(yawEnd, 0, endT);
    W.cam.tx.to(fin.tx, tHit - 0.4, 1.8); W.cam.ty.to(fin.ty, tHit - 0.4, 1.8); W.cam.tz.to(fin.tz, tHit - 0.4, 1.8);
    W.cam.dist.to(Math.min(0.95, fin.dist), tHit - 0.4, 1.8);
    W.cam.dist.to(Math.min(1, fin.dist * 1.15), tReb, endT - tReb);
    furnish(root, W, p, { population: false });
    lowerThird(root, [{ at: tHit, title: p.label, sub: p.caption }, { at: tReb, title: p.rebuildLabel, sub: p.rebuildCaption }]);
    if (p.title || p.kicker) head(root, { kicker: p.kicker, title: p.title, at: 0.3, until: Math.max(1.5, tHit - 0.2), pos: "center" });
    return W;
  };
  TPL["map-overlay"] = function (root, p) {
    var ys = yearSpan(p, "yearFrom", "yearTo", 1780, 1900), yf = ys[0], yt = ys[1];
    var beats = cleanBeats(p.beats, yf, yt), times = landTimes(beats, { first: 0.8, tail: 1.6, gap: 0.9 });
    var vp = PORTRAIT ? { x: 0.05, y: 0.3, w: 0.9, h: 0.42 } : { x: 0.08, y: 0.15, w: 0.84, h: 0.74 };
    var W = mkWorld(root, p, { yearFrom: yf, yearTo: yt, plan: true, viewport: vp, frameP: 1 });
    var sched = [[0.2, yf]];
    beats.forEach(function (b, i) { sched.push([times[i], b.year]); });
    sched.push([Math.max(times.length ? times[times.length - 1] + 0.7 : 0.8, D - 1.15), yt]);
    W.yearSchedule(sched);
    var endT = Math.max(1, D - 0.4);
    W.cam.dist.to(0.92, 0, endT); W.cam.yaw.to(W.cam.yaw.base + 3, 0, endT);
    var hasTitle = !!(p.title || p.kicker);
    var hd = hasTitle ? head(root, { kicker: p.kicker, title: p.title, at: 0.3, pos: "top", align: PORTRAIT ? "center" : "left", x: SAFE.x0 + 40, y: SAFE.y0 + 34, ink: true, panel: false, maxW: PORTRAIT ? 860 : 900, size: PORTRAIT ? 66 : 58 }) : null;
    yearCounter(root, W, { now: p.endsNow ? yt : null, population: p.showPopulation !== false, pulse: times, ink: true, align: PORTRAIT ? "center" : "right", x: PORTRAIT ? FW / 2 : SAFE.x1 - 40, y: PORTRAIT ? (hd ? hd.box.y + hd.box.h + 10 : SAFE.y0 + 34) : SAFE.y0 + 34, size: PORTRAIT ? 120 : 104 });
    if (!hasTitle) tag(root, W.M.cityName, W.M.sub, 0.15, { align: "left", ink: true, x: SAFE.x0 + 40, y: SAFE.y0 + 34 });
    var items = beats.map(function (b, i) { return { at: times[i] - 0.08, title: b.label, sub: b.caption }; }).filter(function (i) { return i.title || i.sub; });
    lowerThird(root, items, { ink: true, x: SAFE.x0 + 40, bottom: SAFE.y1 - 36 });
    return W;
  };
  TPL["title-card"] = function (root, p) {
    var ys = yearSpan(p, "yearFrom", "yearTo", 1609, 2024), yf = ys[0], yt = ys[1], endsNow = p.endsNow !== false;
    var M = getModel(baseOpts(p)), clock = makeClock(null, null, p.keyDates, M.style), pT = clock.p(yt);
    var st = stageOf(root), el = div("ct-titlecard", st.ui);
    el.setAttribute("data-ctbox", "title");
    var maxW = PORTRAIT ? 940 : 1500, blocks = [], h = 0;
    function add(cls, text, o, at) {
      if (!str(text)) return;
      var l = layoutText(text, assign({ maxW: maxW }, o)), e = fillText(div(cls, el), l, "center");
      if (blocks.length) { e.style.marginTop = px(o.gap || 14); h += o.gap || 14; }
      h += l.h;
      blocks.push({ e: e, at: at });
    }
    add("ct-tc-k", p.kicker, { weight: 800, size: PORTRAIT ? 34 : 30, maxLines: 1, upper: true, ls: 0.2, balance: false }, 0.3);
    add("ct-tc-name", M.cityName, { weight: 900, size: PORTRAIT ? 150 : 156, maxLines: 2, lh: 0.98, gap: 10 }, 0.55);
    add("ct-tc-range", fmtYear(yf) + "  " + ARROW + "  " + fmtYear(yt, { now: endsNow ? yt : null }), { weight: 700, size: PORTRAIT ? 62 : 56, maxLines: 1, balance: false, gap: 16 }, 1.0);
    add("ct-tc-sub", p.subtitle, { weight: 500, size: PORTRAIT ? 36 : 32, maxLines: 2, lh: 1.2, gap: 18 }, 1.5);
    var cy = FH * (PORTRAIT ? 0.27 : 0.2), y = Math.max(SAFE.y0, cy - h / 2);
    el.style.left = px(SAFE.x0); el.style.width = px(SAFE.w); el.style.top = px(y);
    var core = M.cores[0], vy0 = (y + h + (PORTRAIT ? 60 : 34)) / FH;
    var vp = PORTRAIT ? { x: 0.02, y: Math.max(0.36, vy0), w: 0.96, h: Math.min(0.42, 0.8 - Math.max(0.36, vy0)) } : { x: 0.03, y: vy0, w: 0.94, h: 0.95 - vy0 };
    var W = new World(root, assign(baseOpts(p), { model: M, year: yt, light: p.light || "golden", pitch: PORTRAIT ? 14 : 10, sunAz: 30, districtLabels: false, viewport: vp, frame: { x: core[0], y: core[1], r: PORTRAIT ? 6.5 : 8.5, ry: 0.85, lots: true }, frameP: pT }));
    W.cam.dist.base = 1.12; W.cam.dist.to(1.0, 0, Math.max(1, D - 0.3)); W.cam.yaw.to(W.cam.yaw.base + 7, 0, Math.max(1, D - 0.3));
    vignette(root);
    reserve({ x: SAFE.x0, y: y, w: SAFE.w, h: h }, 0, 1e9);
    OVERLAYS.push({ update: function (t) { blocks.forEach(function (b) { var a = smooth((t - b.at) / 0.6); setS(b.e, "opacity", a.toFixed(3)); setS(b.e, "transform", "translateY(" + ((1 - outCubic(a)) * 22).toFixed(1) + "px)"); }); } });
    return W;
  };
  TPL["timeline-strip"] = function (root, p) {
    var M = getModel(baseOpts(p)), clock = makeClock(null, null, p.keyDates, M.style);
    var eras = arr(p.eras).slice(0, 7).map(function (e) { e = obj(e); return { year: num(e.year, NaN), label: str(e.label), caption: str(e.caption), keyword: str(e.keyword) }; }).filter(function (e) { return isFinite(e.year); });
    if (eras.length < 2) eras = [2, 4, 5, 7].map(function (i) { return { year: clock.eraYear(i), label: ERAS[i].name, caption: "", keyword: "" }; });
    eras.sort(function (a, b) { return a.year - b.year; });
    var times = landTimes(eras, { first: 0.5, tail: 1.4, gap: 0.9 });
    var yf = int(p.yearFrom, eras[0].year);
    var sched = [[0, Math.min(yf, eras[0].year)], [times[0], eras[0].year]];
    for (var i = 1; i < eras.length; i++) { sched.push([times[i] - 0.05, eras[i - 1].year]); sched.push([times[i] + 0.6, eras[i].year]); }
    var n = eras.length, pLast = clock.p(eras[n - 1].year);
    var cols = PORTRAIT ? (n > 4 ? Math.ceil(n / 2) : n) : n, rows = Math.ceil(n / cols), gap = PORTRAIT ? 14 : 16;
    var tw = Math.floor(Math.min(PORTRAIT ? 300 : 250, (SAFE.w - (cols - 1) * gap) / cols)), th = Math.round(tw * 0.62), lh = PORTRAIT ? 64 : 58;
    var stripH = rows * (th + lh) + (rows - 1) * gap, stripY = SAFE.y1 - stripH;
    var vp = PORTRAIT ? { x: 0.04, y: 0.3, w: 0.92, h: Math.max(0.18, (stripY - 0.3 * FH - 150) / FH) } : { x: 0.05, y: 0.11, w: 0.9, h: Math.max(0.3, (stripY - 0.11 * FH - 110) / FH) };
    var W = new World(root, assign(baseOpts(p), { model: M, yearFrom: sched[0][1], yearTo: eras[n - 1].year, light: p.light, viewport: vp, frameP: pLast }));
    W.yearSchedule(sched);
    applyCamera(W, "orbit");
    furnish(root, W, p, {});
    var st = stageOf(root), x0 = SAFE.cx - (cols * tw + (cols - 1) * gap) / 2;
    var thumbs = eras.map(function (e, k) {
      var r0 = Math.floor(k / cols), c0 = k % cols, rowN = Math.min(cols, n - r0 * cols);
      var rx = SAFE.cx - (rowN * tw + (rowN - 1) * gap) / 2 + c0 * (tw + gap), ry = stripY + r0 * (th + lh + gap);
      var el = div("ct-thumb", st.ui);
      el.setAttribute("data-ctbox", "thumb");
      el.style.left = px(rx); el.style.top = px(ry); el.style.width = px(tw); el.style.height = px(th + lh);
      var TW = new World(null, assign(baseOpts(p), { model: M, year: e.year, light: p.light, offscreen: true, size: [tw, th], viewport: { x: 0, y: 0, w: 1, h: 1 }, frameP: pLast, life: false, fill: 0.02 }));
      TW.frame(0.5);
      TW.canvas.className = "ct-thumb-cv";
      TW.canvas.style.left = "0px"; TW.canvas.style.top = "0px";
      el.appendChild(TW.canvas);
      var lab = div("ct-thumb-l", el), ylab = div("ct-thumb-y", lab), tlab = div("ct-thumb-t", lab);
      ylab.textContent = fmtYear(e.year);
      var tl = layoutText(e.label || ERAS[eraIndex(clock.p(e.year))].name, { weight: 700, size: PORTRAIT ? 24 : 21, maxW: tw - 16, maxLines: 1, balance: false });
      fillText(tlab, tl, "left");
      reserve({ x: rx, y: ry, w: tw, h: th + lh }, 0, 1e9);
      return { el: el, at: times[k] };
    });
    x0 = 0;
    OVERLAYS.push({
      update: function (t) {
        var act = -1;
        thumbs.forEach(function (th2, k) { if (t >= th2.at - 0.05) act = k; });
        thumbs.forEach(function (th2, k) {
          var on = k === act, past = k < act;
          setS(th2.el, "opacity", (on ? 1 : past ? 0.85 : 0.5).toFixed(2));
          th2.el.classList.toggle("ct-on", on);
          var a = on ? smooth((t - th2.at + 0.05) / 0.35) : 0;
          setS(th2.el, "transform", "translateY(" + (-a * 10).toFixed(1) + "px)");
        });
      },
    });
    var caps = eras.map(function (e, k) { return { at: times[k], title: e.caption ? e.label : "", sub: e.caption }; }).filter(function (c) { return c.sub; });
    if (caps.length) lowerThird(root, caps, { bottom: stripY - 22, size: PORTRAIT ? 44 : 38 });
    if (p.title || p.kicker) head(root, { kicker: p.kicker, title: p.title, at: 0.3, until: Math.max(1.5, times[0] + 1.5), pos: "center", y: (vp.y + vp.h / 2) * FH });
    return W;
  };
  TPL["skyline-compare"] = function (root, p) {
    var sides = [obj(p.left), obj(p.right)];
    if (!sides[0].city && !sides[0].preset) sides[0] = { city: "New Harbor", preset: "island", style: "american", seed: 7 };
    if (!sides[1].city && !sides[1].preset) sides[1] = { city: "Bayhaven", preset: "bay", style: "asian", seed: 3 };
    var hasTitle = !!(p.title || p.kicker);
    var ts = landTimes([{ label: sides[0].city, keyword: p.keywordLeft }, { label: sides[1].city, keyword: p.keywordRight }], { first: 0.6, tail: 1.4, gap: 0.8 });
    vignette(root);
    var st = stageOf(root);
    var hd = hasTitle ? head(root, { kicker: p.kicker, title: p.title, at: 0.3, pos: "top", size: PORTRAIT ? 64 : 72 }) : null;
    var top0 = hd ? hd.box.y + hd.box.h + 14 : SAFE.y0, split = PORTRAIT ? Math.round((top0 + SAFE.y1) / 2) : FW / 2;
    var models = sides.map(function (s) { return getModel({ city: s.city, preset: s.preset, style: s.style, seed: s.seed, keyDates: s.keyDates }); });
    var chips = sides.map(function (s, k) {
      var year = int(s.year, 2024), o = { kicker: fmtYear(year), big: models[k].cityName, label: str(s.stat), align: "left", at: ts[k], accent: k === 1, size: PORTRAIT ? 54 : 52 };
      if (PORTRAIT) { o.x = SAFE.x0; o.maxW = SAFE.w; if (k === 0) o.y = top0; else o.bottom = SAFE.y1; }
      else { o.x = k === 0 ? SAFE.x0 : split + 60; o.maxW = (k === 0 ? split - SAFE.x0 : SAFE.x1 - split - 60) - 20; o.bottom = SAFE.y1; }
      return chip(root, o);
    });
    sides.forEach(function (s, k) {
      var rect, vp;
      if (PORTRAIT) {
        rect = k === 0 ? { x: 0, y: 0, w: FW, h: split } : { x: 0, y: split, w: FW, h: FH - split };
        var cb = chips[k].box, y0 = k === 0 ? cb.y + cb.h + 12 : split + 14, y1 = k === 0 ? split - 14 : cb.y - 12;
        vp = { x: 0.04, y: (y0 - rect.y) / rect.h, w: 0.92, h: Math.max(60, y1 - y0) / rect.h };
      } else {
        rect = { x: k * split, y: 0, w: FW / 2, h: FH };
        var cb2 = chips[k].box, yb = hd ? hd.box.y + hd.box.h + 20 : SAFE.y0 + 40;
        vp = { x: 0.06, y: yb / FH, w: 0.88, h: (cb2.y - 24 - yb) / FH };
      }
      var W = new World(root, { model: models[k], keyDates: s.keyDates, year: int(s.year, 2024), light: p.light, rect: rect, viewport: vp, pitch: PORTRAIT ? 30 : 26, districtLabels: false });
      W.cam.yaw.to(W.cam.yaw.base + (k ? -10 : 10), 0, Math.max(1, D - 0.4));
      W.cam.dist.base = 1.06;
      W.cam.dist.to(0.98, 0, Math.max(1, D - 0.4));
    });
    var dv = div(PORTRAIT ? "ct-divider ct-divider-h" : "ct-divider", st.ui);
    if (PORTRAIT) dv.style.top = px(split - 2);
  };

  // ========================= public API =========================
  function resetAll(root) {
    root = root || V.root();
    while (root.firstChild) root.removeChild(root.firstChild);
    STAGES.length = 0; WORLDS.length = 0; OVERLAYS.length = 0; RESERVED.length = 0;
    HOOKED = false;
  }
  function render(id, root, props) {
    var fn = TPL[id];
    if (!fn) throw new Error("Unknown skyline-rush template: " + id);
    return fn(root || V.root(), obj(props));
  }
  function fallback(root, narration) {
    resetAll(root);
    var kw = keywords(3, narration || V.narration);
    return TPL.timelapse(root || V.root(), { city: "New Harbor", preset: "island", style: "american", seed: 7, yearFrom: 1650, yearTo: 2024, endsNow: true, beats: kw.map(function (k, i) { return { year: [1760, 1880, 1960][i] || 1960, label: "", keyword: k.text }; }) });
  }
  function visibleEl(el) {
    for (var e = el; e && e.classList && !e.classList.contains("ct-stage"); e = e.parentNode) {
      if (e.style.display === "none") return false;
      var o = parseFloat(e.style.opacity);
      if (isFinite(o) && o < 0.05) return false;
    }
    return true;
  }
  S.render = render;
  S.fallback = fallback;
  S.templates = Object.keys(TPL);
  S.safe = safe;
  S.landTimes = landTimes;
  S.flush = function () {
    var t = V.time();
    WORLDS.forEach(function (W) { W.frame(t); });
    OVERLAYS.forEach(function (o) { o.update(t); });
  };
  S.inspect = function (t) {
    var out = [];
    WORLDS.forEach(function (W) {
      if (!W.state || Math.abs(W.state.t - t) > 1e-6) W.frame(t);
      W.REC.forEach(function (b) { out.push({ kind: b.kind, label: b.label, x: b.x, y: b.y, w: b.w, h: b.h, moving: false }); });
    });
    STAGES.forEach(function (s) {
      [].slice.call(s.ui.querySelectorAll("[data-ctbox]")).forEach(function (el) {
        if (!visibleEl(el)) return;
        var r = el.getBoundingClientRect();
        out.push({ kind: el.getAttribute("data-ctbox"), label: (el.textContent || "").slice(0, 30), x: r.left, y: r.top, w: r.width, h: r.height, moving: false });
      });
    });
    return out;
  };
  S.city = {
    world: function (root, o) { return new World(root || V.root(), o); },
    model: function (o) { return getModel(o); },
    guess: guess,
    eras: ERAS,
    presets: PRESET_IDS,
    styles: STYLE_IDS,
    landmarkKinds: LMK_KINDS,
    makeClock: function (a, b, kd, style) { return makeClock(a, b, kd, style); },
    layout: layout,
    proj: function (P, x, y, z) { return proj(P, num(x, 0), num(y, 0), num(z, 0)); },
    square: square,
    addLandmark: function (M, kind, name, o) { return addLandmarkImpl(M, kind, name, o); },
    district: function (M, name) { return findDistrict(M, name); },
    landmark: function (M, name) { return findLandmark(M, name); },
    yearCounter: function (root, W, o) { return yearCounter(root || V.root(), W, o); },
    lowerThird: function (root, items, o) { return lowerThird(root || V.root(), items, o); },
    head: function (root, o) { return head(root || V.root(), o); },
    caption: function (root, text, at, tl, o) { return caption(root || V.root(), text, at, tl, o); },
    tag: function (root, name, sub, at, o) { return tag(root || V.root(), name, sub, at, o); },
    chip: function (root, o) { return chip(root || V.root(), o); },
    stat: function (root, o) { return stat(root || V.root(), o); },
    vignette: function (root) { return vignette(root || V.root()); },
    fmtPop: fmtPop,
    fmtYear: fmtYear,
    autoEraItems: autoEraItems,
    keywords: keywords,
    lightAt: function (p, mode) { return lightAt(p, mode); },
    mixLight: function (a, b, k) { return mixLight(a, b, clamp(num(k, 0), 0, 1)); },
    applyCamera: applyCamera,
    hash: function (n) { return hash(Math.round(num(n, 0) * 9973)); },
  };
})();

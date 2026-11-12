/* Paper Theatre engine (style id: paper-theatre).
 *
 * Handmade cut-paper stop-motion on a craft table: every visible thing is a paper "piece".
 *
 * Architecture
 * - Build time: S.scene() makes one world div (.smp-world) holding a defs SVG (fibre textures and
 *   patterns, never hidden), a camera div with the layers bg / back / mid / front, an unscaled top
 *   layer for text, a warm lamp + vignette overlay and an exposure-flicker overlay. Every element is
 *   built once. Paper shapes are SVG polygons with cut, torn (white fibrous core) or pinked edges,
 *   filled with a colour, then a seeded fibre-texture pattern on top.
 * - A piece is an outer div (placement transform, read by S.inspect) and an inner div (boil jitter and
 *   a soft drop shadow that grows while the piece is lifted). Calls like place / move / hop / out only
 *   record "acts"; S.flush() resolves each act's start and end pose in time order.
 * - ONE frame function (V.onFrame) quantises t to the stop-motion step (10 steps a second by default),
 *   then sets every piece, puppet rig, ambient set life, camera push and flicker from that stepped
 *   time only. Nothing depends on the previous frame, so seeking works in both directions.
 * - Puppets: one SVG rig per character with split-pin joints (shoulder, elbow, hip, neck, tail, jaw),
 *   five replacement mouths chosen per step from the spoken word, seeded blinks, gesture poses held
 *   in steps. Animals reuse the same joint names.
 * - Timing: templates find their words (V.find, keyword props, the longest content word of a label,
 *   then a narration estimate), plan beats inside [0.2 s, duration - 1 s] and land pieces on them.
 * No network, no timers, no wall clock; randomness only from V.makeRand and fixed-seed hashes.
 */
(function () {
  "use strict";
  var V = window.V;
  if (!V) return;
  var S = (window.SceneStyle = window.SceneStyle || {});
  var NS = "http://www.w3.org/2000/svg";
  var doc = document;
  var W = V.width, H = V.height, D = V.duration, UN = V.unit;
  var PI = Math.PI;
  var F_BOLD = '"Arial Black", "Archivo Black", "Noto Sans", Inter, sans-serif';
  var F_SANS = '"Trebuchet MS", Verdana, "Noto Sans", sans-serif';
  var F_MONO = '"Courier New", "Noto Sans Mono", monospace';
  var TALL = V.isPortrait, SQUARE = V.isSquare;

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
  function sgn(v) { return v < 0 ? -1 : 1; }
  function smooth(p) { p = clamp(p, 0, 1); return p * p * (3 - 2 * p); }
  function outC(p) { p = clamp(p, 0, 1); return 1 - Math.pow(1 - p, 3); }
  function inQ(p) { p = clamp(p, 0, 1); return p * p; }
  function getEase(e, d) {
    if (typeof e === "function") return e;
    if (typeof e === "string" && V.ease[e]) return V.ease[e];
    return V.ease[d || "inOutQuad"];
  }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function svg(tag, attrs, parent) {
    var n = doc.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function div(cls, parent, css) {
    var n = doc.createElement("div");
    if (cls) n.className = cls;
    if (css) n.style.cssText = css;
    if (parent) parent.appendChild(n);
    return n;
  }
  function normWord(s) {
    return String(s == null ? "" : s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
  }

  // ------------------------- colours -------------------------
  var C = {
    kraft: "#C7A06E", cream: "#F4EBD8", white: "#FBF8F1", ink: "#2A211C", red: "#D9472B", tomato: "#E86A4A",
    orange: "#EE8A3C", yellow: "#F2C14E", mustard: "#D9A43A", lime: "#A9C25A", green: "#6FA05A", leaf: "#4E8A4A",
    forest: "#2F5D3F", teal: "#3E8C88", sky: "#8EC3D8", navy: "#2D4A6B", night: "#1F2A44", purple: "#7A5A9A",
    lilac: "#B9A2CF", pink: "#EBA3B0", rose: "#C9566F", brown: "#7A5233", wood: "#B07F4F", grey: "#A09A90",
    slate: "#5E6670", sand: "#E4CB98", cork: "#B88A5A", felt: "#3F6E5A", chalk: "#2F3B36"
  };
  var CORE = "#FAF5E8"; // the white fibrous core that shows on a torn edge
  var NOTE_COLS = ["yellow", "pink", "sky", "lime", "orange", "lilac"];
  var BAR_COLS = ["teal", "mustard", "sky", "green", "purple", "orange"];
  function hex6(c) {
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c || "").trim());
    if (!m) return null;
    var h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return "#" + h.toUpperCase();
  }
  function col(c, d) {
    if (c == null || c === "") return d || C.cream;
    var s = String(c).trim();
    if (C[s]) return C[s];
    return hex6(s) || d || C.cream;
  }
  function rgbOf(hex) { var n = parseInt(hex6(hex).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function toHex(r, g, b) { return "#" + ((1 << 24) | (clamp(Math.round(r), 0, 255) << 16) | (clamp(Math.round(g), 0, 255) << 8) | clamp(Math.round(b), 0, 255)).toString(16).slice(1).toUpperCase(); }
  // k < 1 darker, k > 1 lighter (mixes toward white)
  function shade(c, k) {
    var h = hex6(col(c));
    if (!h) return c;
    var p = rgbOf(h);
    if (k <= 1) return toHex(p[0] * k, p[1] * k, p[2] * k);
    var t = clamp(k - 1, 0, 1);
    return toHex(lerp(p[0], 255, t), lerp(p[1], 255, t), lerp(p[2], 255, t));
  }
  function mixc(a, b, t) { var p = rgbOf(col(a)), q = rgbOf(col(b)); return toHex(lerp(p[0], q[0], t), lerp(p[1], q[1], t), lerp(p[2], q[2], t)); }
  function lum(c) { var p = rgbOf(col(c)); return (0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]) / 255; }
  function inkOn(c) { return lum(c) < 0.5 ? C.cream : C.ink; }

  // ------------------------- stop-motion clock -------------------------
  var STEP = 10;
  function stepTime(t) { return Math.floor(t * STEP + 1e-6) / STEP; }
  function stepIndex(t) { return Math.floor(t * STEP + 1e-6); }
  function qt(t) { return Math.round(num(t, 0) * STEP) / STEP; }                 // act start on the step grid
  function qd(d) { return Math.max(1, Math.round(num(d, 0.5) * STEP)) / STEP; } // whole steps

  // ------------------------- word timing -------------------------
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
    if (after) { t = V.find(word, 0); if (t != null && t >= (after || 0) - 1.5) return t; }
    return V.words.length ? null : narrationEstimate(word, after);
  }
  function contentWords(text) {
    return str(text).replace(/\*/g, "").split(/[^\p{L}\p{N}'-]+/u).filter(function (w) { var n = normWord(w); return n.length > 1 && !STOP[n]; });
  }
  function labelTime(label, keyword, after) {
    if (keyword) { var t = kwFind(keyword, after); if (t != null) return t; }
    var ws = contentWords(label).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < ws.length; i++) { var f = V.find(ws[i], after || 0); if (f != null) return f; }
    // numbers spoken as words: "4" -> "four"
    var nw = contentWords(label).map(numberWord).filter(Boolean);
    for (i = 0; i < nw.length; i++) { f = V.find(nw[i], after || 0); if (f != null) return f; }
    for (i = 0; i < ws.length; i++) { var e = narrationEstimate(ws[i], after); if (e != null && !V.words.length) return e; }
    return null;
  }
  var NUMW = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen twenty".split(" ");
  function numberWord(w) { var n = parseInt(String(w).replace(/[^0-9]/g, ""), 10); return isFinite(n) && n >= 0 && n <= 20 && /^\D*\d+\D*$/.test(String(w)) ? NUMW[n] : null; }
  // Fill missing landing times by spreading them between known neighbours.
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
      else if (right == null) { var hi = Math.max(b, left + 0.5 * cnt); for (k = 0; k < cnt; k++) out[i + k] = left + ((hi - left) * (k + 1)) / cnt; }
      else for (k = 0; k < cnt; k++) out[i + k] = left + ((right - left) * (k + 1)) / (cnt + 1);
      i = j;
    }
    return out;
  }
  // Times for a list of {label, keyword}: in order, never decreasing, inside [lo, hi].
  function beatTimes(list, o) {
    o = o || {};
    var lo = o.lo != null ? o.lo : 0.3, hi = o.hi != null ? o.hi : endBy();
    var prev = o.after || 0, out = [];
    list.forEach(function (it) {
      var t = labelTime(it.label, it.keyword, prev);
      if (t != null && t < prev - 0.05) t = null;
      out.push(t);
      if (t != null) prev = t + 0.05;
    });
    out = spread(out, Math.max(lo, o.first != null ? o.first : lo), Math.min(hi, D * 0.75));
    var gap = o.gap != null ? o.gap : 0.25;
    for (var i = 0; i < out.length; i++) {
      out[i] = clamp(out[i], lo, hi);
      if (i && out[i] < out[i - 1] + gap) out[i] = out[i - 1] + gap;
    }
    // squeeze back inside the window when the gaps pushed past the end
    var n = out.length;
    if (n && out[n - 1] > hi) {
      var a = out[0], span = out[n - 1] - a, k = span > 0 ? (hi - Math.min(a, hi - 0.1 * n)) / span : 1;
      var a2 = Math.min(a, hi - 0.1 * n);
      for (i = 0; i < n; i++) out[i] = a2 + (out[i] - a) * k;
    }
    return out;
  }
  // Everything lands by this time (the last second stays still).
  function endBy() { return Math.max(0.5, D - (D < 4 ? Math.min(0.8, D * 0.2) : 1.05)); }
  function tc(t, lo) { return clamp(t, lo != null ? lo : 0.2, endBy()); }

  // ------------------------- safe area -------------------------
  function safe() {
    var x0, y0, x1, y1;
    if (TALL) { x0 = W * 0.067; x1 = W * 0.933; y0 = H * 0.137; y1 = H * 0.748; }
    else if (SQUARE) { x0 = W * 0.07; x1 = W * 0.93; y0 = H * 0.07; y1 = H * 0.93; }
    else { x0 = W * 0.076; x1 = W * 0.924; y0 = H * 0.08; y1 = H * 0.92; }
    return { x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
  function groundY() { return TALL ? H * 0.722 : SQUARE ? H * 0.86 : H * 0.85; }

  // ------------------------- value noise -------------------------
  function noise1(R, n) {
    var vals = [];
    for (var i = 0; i < n + 2; i++) vals.push(R() * 2 - 1);
    return function (s) {
      s = ((s % n) + n) % n;
      var i0 = Math.floor(s), f = s - i0, a = vals[i0], b = vals[(i0 + 1) % n];
      return lerp(a, b, f * f * (3 - 2 * f));
    };
  }

  // ------------------------- paper geometry (design units) -------------------------
  function ellPts(cx, cy, rx, ry, n, a0, a1) {
    var out = [];
    a0 = a0 == null ? -PI / 2 : a0;
    a1 = a1 == null ? a0 + 2 * PI : a1;
    for (var i = 0; i < n; i++) { var a = a0 + ((a1 - a0) * i) / n; out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
    return out;
  }
  function areaOf(p) { var a = 0; for (var i = 0; i < p.length; i++) { var q = p[(i + 1) % p.length]; a += p[i][0] * q[1] - q[0] * p[i][1]; } return a / 2; }
  function curveN(w, h, edge, k) {
    var per = PI * (w + h) * (k || 0.5);
    return clamp(Math.round(per / (edge === "cut" ? 13 : 4)), 12, 180);
  }
  function roundRectPts(w, h, r, n) {
    r = Math.min(r, w / 2, h / 2);
    var out = [], c = [[w - r, r, -PI / 2], [w - r, h - r, 0], [r, h - r, PI / 2], [r, r, PI]];
    c.forEach(function (q) { for (var i = 0; i <= n; i++) { var a = q[2] + (PI / 2) * (i / n); out.push([q[0] + Math.cos(a) * r, q[1] + Math.sin(a) * r]); } });
    return out;
  }
  // returns { pts: closed polygon, holes: [polygons], sides: true when pts is a 4-corner rect }
  function shapeGeom(shape, w, h, edge, R) {
    var n = curveN(w, h, edge), pts, holes = [], i;
    if (Array.isArray(shape)) return { pts: shape.map(function (q) { return [num(q[0], 0), num(q[1], 0)]; }), holes: [] };
    switch (shape) {
      case "round": pts = roundRectPts(w, h, Math.min(w, h) * 0.16, edge === "cut" ? 3 : 6); break;
      case "pill": pts = roundRectPts(w, h, Math.min(w, h) * 0.5, edge === "cut" ? 5 : 10); break;
      case "circle": var rr = Math.min(w, h) / 2; pts = ellPts(w / 2, h / 2, rr, rr, curveN(rr * 2, rr * 2, edge)); break;
      case "ellipse": pts = ellPts(w / 2, h / 2, w / 2, h / 2, n); break;
      case "ring":
        pts = ellPts(w / 2, h / 2, w / 2, h / 2, n);
        holes.push(ellPts(w / 2, h / 2, w * 0.36, h * 0.3, n).reverse());
        break;
      case "blob":
        var b1 = R() * 6, b2 = R() * 6, b3 = R() * 6;
        pts = [];
        for (i = 0; i < n; i++) {
          var a = (i / n) * 2 * PI, k = 1 + 0.07 * Math.sin(2 * a + b1) + 0.05 * Math.sin(3 * a + b2) + 0.035 * Math.sin(5 * a + b3);
          pts.push([w / 2 + Math.cos(a) * (w / 2) * k * 0.92, h / 2 + Math.sin(a) * (h / 2) * k * 0.92]);
        }
        break;
      case "cloud":
        pts = [];
        var nb = clamp(Math.round(w / h * 2.4), 3, 7), m = n * 2;
        for (i = 0; i < m; i++) {
          var a2 = (i / m) * 2 * PI - PI, up = a2 < 0; // upper half: -PI..0
          var rx = w / 2, ry = up ? h * 0.62 : h * 0.3, cy0 = h * 0.66;
          var r2 = 1;
          if (up) { var ph = ((a2 + PI) / PI) * nb, fr = ph - Math.floor(ph); r2 = 0.8 + 0.2 * Math.sqrt(Math.max(0, 1 - Math.pow(2 * fr - 1, 2))); }
          pts.push([w / 2 + Math.cos(a2) * rx * (up ? r2 : 0.96), cy0 + Math.sin(a2) * ry * (up ? r2 : 1)]);
        }
        break;
      case "star": case "burst":
        var np = shape === "star" ? 5 : 14, ri = shape === "star" ? 0.45 : 0.76;
        pts = [];
        for (i = 0; i < np * 2; i++) { var a3 = -PI / 2 + (i * PI) / np, rr3 = i % 2 ? ri : 1; pts.push([w / 2 + Math.cos(a3) * (w / 2) * rr3, h / 2 + Math.sin(a3) * (h / 2) * rr3 + (shape === "star" ? h * 0.04 : 0)]); }
        break;
      case "tri": pts = [[w / 2, 0], [w, h], [0, h]]; break;
      case "heart":
        pts = [];
        for (i = 0; i < n; i++) {
          var t = (i / n) * 2 * PI, hx = 16 * Math.pow(Math.sin(t), 3), hy = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
          pts.push([w / 2 + (hx / 34) * w, h * 0.42 + (hy / 31) * h]);
        }
        break;
      case "tag":
        pts = [[w * 0.16, 0], [w, 0], [w, h], [w * 0.16, h], [0, h * 0.7], [0, h * 0.3]];
        var hr = Math.min(h * 0.11, w * 0.05);
        holes.push(ellPts(w * 0.09, h / 2, hr, hr, 16).reverse());
        break;
      case "banner": pts = [[0, 0], [w, 0], [w - Math.min(w * 0.07, h * 0.5), h / 2], [w, h], [0, h], [Math.min(w * 0.07, h * 0.5), h / 2]]; break;
      case "arrow": pts = [[0, h * 0.3], [w * 0.62, h * 0.3], [w * 0.62, 0], [w, h * 0.5], [w * 0.62, h], [w * 0.62, h * 0.7], [0, h * 0.7]]; break;
      case "leaf":
        pts = [];
        var nl = Math.max(8, Math.round(n / 2));
        for (i = 0; i <= nl; i++) { var x = (i / nl) * w; pts.push([x, h / 2 - (h / 2) * Math.pow(Math.sin((PI * i) / nl), 0.85)]); }
        for (i = nl - 1; i > 0; i--) { var x2 = (i / nl) * w; pts.push([x2, h / 2 + (h / 2) * Math.pow(Math.sin((PI * i) / nl), 0.85)]); }
        break;
      case "drop":
        pts = [];
        for (i = 0; i < n; i++) { var t2 = (i / n) * 2 * PI, X = Math.sin(t2) * Math.sin(t2 / 2), Y = -Math.cos(t2); pts.push([w / 2 + (X / 0.77) * (w / 2), h / 2 + Y * (h / 2)]); }
        break;
      case "hill":
        pts = ellPts(w / 2, h, w / 2, h, n, PI, 2 * PI);
        pts.push([w, h]);
        break;
      case "arch":
        var ar = w / 2, ah = Math.min(ar, h);
        pts = [[0, h]];
        ellPts(w / 2, ah, ar, ah, Math.round(n / 2), PI, 2 * PI).forEach(function (q) { pts.push(q); });
        pts.push([w, ah]); pts.push([w, h]);
        break;
      case "wave":
        pts = [];
        var nw = Math.max(2, Math.round((w / h) * 1.1)), nwp = Math.max(24, Math.round(n / 1.5));
        for (i = 0; i <= nwp; i++) { var xw = (i / nwp) * w; pts.push([xw, h * 0.28 - h * 0.22 * Math.cos((xw / w) * nw * 2 * PI)]); }
        pts.push([w, h]); pts.push([0, h]);
        break;
      case "ridge":
        pts = [[0, h]];
        var pk = clamp(Math.round(w / (h * 0.9)), 2, 9);
        for (i = 0; i <= pk * 2; i++) { var xr = (i / (pk * 2)) * w, yr = i % 2 ? h * (0.02 + R() * 0.3) : h * (0.42 + R() * 0.28); pts.push([xr, i === 0 || i === pk * 2 ? h * 0.55 : yr]); }
        pts.push([w, h]);
        break;
      default:
        pts = [[0, 0], [w, 0], [w, h], [0, h]];
        return { pts: pts, holes: holes, sides: true };
    }
    return { pts: pts, holes: holes };
  }
  // Subdivide a closed polygon so no segment is longer than `sp`.
  function subdiv(pts, sp) {
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.round(L / sp));
      for (var j = 0; j < k; j++) out.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
    }
    return out;
  }
  function normals(pts) {
    var s = areaOf(pts) >= 0 ? 1 : -1, n = pts.length, out = [];
    for (var i = 0; i < n; i++) {
      var a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n], tx = b[0] - a[0], ty = b[1] - a[1], L = Math.hypot(tx, ty) || 1;
      out.push([(ty / L) * s, (-tx / L) * s]);
    }
    return out;
  }
  // Apply an edge treatment. Returns { main, core } polygons (core only for torn edges).
  function edgeify(pts, edge, R, sideOf) {
    var edges = Array.isArray(edge) ? edge : [edge || "cut"];
    var anyTorn = edges.indexOf("torn") >= 0, anyZig = edges.indexOf("zig") >= 0, anyCut = edges.indexOf("cut") >= 0;
    if (!anyTorn && !anyZig && !anyCut) return { main: pts, core: null };
    var sp = anyTorn ? 2.6 : anyZig ? 3.6 : 16;
    var P = subdiv(pts, sp), N = normals(P), nz = noise1(R, 64), nz2 = noise1(R, 64), nz3 = noise1(R, 32);
    var per = 0, main = [], core = anyTorn ? [] : null, zi = 0;
    for (var i = 0; i < P.length; i++) {
      if (i) per += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
      var e = edges.length > 1 && sideOf ? edges[sideOf(P[i])] || "cut" : edges[0];
      var nx = N[i][0], ny = N[i][1], x = P[i][0], y = P[i][1], o = 0, oc = 0;
      if (e === "torn") {
        var s1 = per / 9;
        o = -(0.4 + Math.abs(nz(s1) * 1.7 + nz3(per / 3.2) * 0.7));
        oc = 0.5 + Math.abs(nz2(s1 * 0.7) * 2.6);
      } else if (e === "zig") {
        o = (zi++ % 2 ? 1.7 : -1.7); oc = o;
      } else if (e === "cut") {
        o = (R() - 0.5) * 0.9; oc = o;
      }
      main.push([x + nx * o, y + ny * o]);
      if (core) core.push([x + nx * oc, y + ny * oc]);
    }
    return { main: main, core: core };
  }
  function dOf(pts) {
    var s = "";
    for (var i = 0; i < pts.length; i++) s += (i ? "L" : "M") + f1(pts[i][0]) + " " + f1(pts[i][1]);
    return s + "Z";
  }
  function rectSide(w, h) {
    return function (q) {
      var dt = q[1], dr = w - q[0], db = h - q[1], dl = q[0], m = Math.min(dt, dr, db, dl);
      return m === dt ? 0 : m === dr ? 1 : m === db ? 2 : 3;
    };
  }
  var seedN = 1;
  function nextSeed() { return 1000 + seedN++ * 7919; }
  // One paper shape as an SVG markup string (design units). o: { x, y | cx, cy, r, edge, tex, pattern,
  // seed, stroke, core, opacity, inner, cls, holes }
  function paperMarkup(shape, w, h, fill, o) {
    o = o || {};
    w = Math.max(1, num(w, 100)); h = Math.max(1, num(h, w));
    var R = V.makeRand(o.seed != null ? o.seed : nextSeed());
    var edge = o.edge || "cut";
    var g = shapeGeom(shape, w, h, Array.isArray(edge) ? "torn" : edge, R);
    var e = edgeify(g.pts, edge, R, g.sides ? rectSide(w, h) : null);
    var holes = (g.holes || []).map(function (hp) { return dOf(edgeify(hp, "cut", R).main); }).join("");
    var fillc = col(fill, C.cream);
    var x = o.cx != null ? o.cx - w / 2 : num(o.x, 0), y = o.cy != null ? o.cy - h / 2 : num(o.y, 0);
    var tr = "";
    if (x || y) tr += "translate(" + f1(x) + " " + f1(y) + ")";
    if (o.r) tr += " rotate(" + f1(o.r) + " " + f1(w / 2) + " " + f1(h / 2) + ")";
    var fr = holes ? ' fill-rule="evenodd"' : "";
    var main = dOf(e.main) + holes;
    var out = "<g" + (tr ? ' transform="' + tr + '"' : "") + (o.cls ? ' class="' + o.cls + '"' : "") + (o.opacity != null ? ' opacity="' + o.opacity + '"' : "") + ">";
    if (e.core) out += '<path d="' + dOf(e.core) + holes + '" fill="' + (o.core || CORE) + '"' + fr + "/>";
    out += '<path class="smp-shape" d="' + main + '" fill="' + fillc + '"' + fr + (o.stroke === false ? "" : ' stroke="' + shade(fillc, 0.7) + '" stroke-width="0.8" stroke-opacity="0.5" stroke-linejoin="round"') + "/>";
    var tex = o.tex == null ? "paper" : o.tex;
    if (tex && tex !== "none") out += '<path d="' + main + '" fill="url(#smp-tex-' + tex + ')"' + fr + "/>";
    if (o.pattern) out += '<path d="' + main + '" fill="url(#smp-pat-' + o.pattern + ')"' + fr + "/>";
    if (o.inner) out += o.inner;
    return out + "</g>";
  }
  // An <svg> element w x h px whose viewBox is in design units (scale = px per unit, default V.unit).
  function svgBox(w, h, o) {
    o = o || {};
    var sc = num(o.scale, UN) || 1;
    var s = svg("svg", { xmlns: NS, width: f1(w), height: f1(h), viewBox: "0 0 " + f2(w / sc) + " " + f2(h / sc), overflow: "visible" });
    s.style.cssText = "position:absolute;left:0;top:0;overflow:visible";
    if (o.html) s.innerHTML = o.html;
    return s;
  }

  // ------------------------- textures (defs, never hidden) -------------------------
  function texDefs() {
    var R = V.makeRand(4242), out = "";
    function wrapAt(T, x, y, draw) {
      var s = "";
      [-T, 0, T].forEach(function (ox) { [-T, 0, T].forEach(function (oy) { var xx = x + ox, yy = y + oy; if (xx > -30 && xx < T + 30 && yy > -30 && yy < T + 30) s += draw(xx, yy); }); });
      return s;
    }
    function fibres(id, T, spec) {
      var s = '<pattern id="smp-tex-' + id + '" patternUnits="userSpaceOnUse" width="' + T + '" height="' + T + '">';
      var i;
      for (i = 0; i < (spec.blot || 0); i++) {
        var bx = R() * T, by = R() * T, brx = 8 + R() * 22, bry = 6 + R() * 16, bl = R() < 0.5;
        s += wrapAt(T, bx, by, function (x, y) { return '<ellipse cx="' + f1(x) + '" cy="' + f1(y) + '" rx="' + f1(brx) + '" ry="' + f1(bry) + '" fill="' + (bl ? "#FFFFFF" : "#3A2614") + '" opacity="' + (bl ? 0.07 : 0.035) + '"/>'; });
      }
      for (i = 0; i < spec.n; i++) {
        var x0 = R() * T, y0 = R() * T, a = R() * PI * 2, L = spec.len[0] + R() * (spec.len[1] - spec.len[0]), bend = (R() - 0.5) * L * 0.6;
        var dx = Math.cos(a) * L, dy = Math.sin(a) * L, light = R() < spec.light, sw = f2(spec.w[0] + R() * (spec.w[1] - spec.w[0]));
        var colr = light ? "#FFFFFF" : spec.dark || "#3A2614", op = light ? spec.lo : spec.do;
        s += wrapAt(T, x0, y0, function (x, y) {
          return '<path d="M' + f1(x) + " " + f1(y) + "q" + f1(dx / 2 - (dy / L) * bend) + " " + f1(dy / 2 + (dx / L) * bend) + " " + f1(dx) + " " + f1(dy) + '" stroke="' + colr + '" stroke-width="' + sw + '" stroke-opacity="' + op + '" fill="none" stroke-linecap="round"/>';
        });
      }
      for (i = 0; i < (spec.speck || 0); i++) {
        var sx = R() * T, sy = R() * T, sr = f2(spec.sr[0] + R() * (spec.sr[1] - spec.sr[0])), sl = R() < (spec.speckLight || 0.25);
        s += wrapAt(T, sx, sy, function (x, y) { return '<circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="' + sr + '" fill="' + (sl ? "#FFFFFF" : spec.dark || "#3A2614") + '" opacity="' + (sl ? spec.lo * 1.2 : spec.so || 0.16) + '"/>'; });
      }
      return s + "</pattern>";
    }
    out += fibres("paper", 210, { n: 120, len: [5, 20], w: [0.5, 1.2], light: 0.62, lo: 0.3, do: 0.1, speck: 34, sr: [0.35, 1.0], blot: 12 });
    out += fibres("card", 170, { n: 70, len: [3, 12], w: [0.4, 0.9], light: 0.5, lo: 0.22, do: 0.08, speck: 70, sr: [0.3, 0.7], blot: 6 });
    out += fibres("kraft", 230, { n: 190, len: [6, 26], w: [0.5, 1.4], light: 0.4, lo: 0.2, do: 0.16, speck: 60, sr: [0.4, 1.2], blot: 16, dark: "#4A2E14" });
    out += fibres("cork", 160, { n: 40, len: [2, 5], w: [0.8, 1.6], light: 0.4, lo: 0.25, do: 0.25, speck: 520, sr: [0.6, 2.4], so: 0.3, speckLight: 0.35, blot: 10, dark: "#4A2A10" });
    out += fibres("felt", 140, { n: 520, len: [2, 6], w: [0.5, 1.0], light: 0.5, lo: 0.14, do: 0.14, speck: 40, sr: [0.4, 0.9], dark: "#0E2018" });
    // decorative patterns
    out += '<pattern id="smp-pat-dots" patternUnits="userSpaceOnUse" width="24" height="24"><circle cx="6" cy="6" r="3.4" fill="#FFFFFF" opacity="0.5"/><circle cx="18" cy="18" r="3.4" fill="#FFFFFF" opacity="0.5"/></pattern>';
    out += '<pattern id="smp-pat-stripe" patternUnits="userSpaceOnUse" width="26" height="26" patternTransform="rotate(35)"><rect x="0" y="0" width="9" height="26" fill="#FFFFFF" opacity="0.34"/></pattern>';
    out += '<pattern id="smp-pat-check" patternUnits="userSpaceOnUse" width="28" height="28"><rect x="0" y="0" width="14" height="28" fill="#FFFFFF" opacity="0.28"/><rect x="0" y="0" width="28" height="14" fill="#FFFFFF" opacity="0.28"/></pattern>';
    out += '<pattern id="smp-pat-lines" patternUnits="userSpaceOnUse" width="40" height="36"><rect x="0" y="34" width="40" height="1.6" fill="#5B7FB8" opacity="0.45"/></pattern>';
    out += '<pattern id="smp-pat-grid" patternUnits="userSpaceOnUse" width="100" height="100">';
    for (var g = 0; g < 5; g++) out += '<rect x="' + g * 20 + '" y="0" width="' + (g ? 0.7 : 1.6) + '" height="100" fill="#4F86B8" opacity="' + (g ? 0.3 : 0.45) + '"/><rect x="0" y="' + g * 20 + '" width="100" height="' + (g ? 0.7 : 1.6) + '" fill="#4F86B8" opacity="' + (g ? 0.3 : 0.45) + '"/>';
    out += "</pattern>";
    out += '<pattern id="smp-pat-mat" patternUnits="userSpaceOnUse" width="200" height="200">';
    for (g = 0; g < 5; g++) out += '<rect x="' + g * 40 + '" y="0" width="' + (g ? 1 : 2.2) + '" height="200" fill="#E8F2DE" opacity="' + (g ? 0.28 : 0.42) + '"/><rect x="0" y="' + g * 40 + '" width="200" height="' + (g ? 1 : 2.2) + '" fill="#E8F2DE" opacity="' + (g ? 0.28 : 0.42) + '"/>';
    out += "</pattern>";
    out += '<pattern id="smp-pat-tiles" patternUnits="userSpaceOnUse" width="60" height="60"><rect x="0" y="0" width="60" height="2.4" fill="#FFFFFF" opacity="0.55"/><rect x="0" y="0" width="2.4" height="60" fill="#FFFFFF" opacity="0.55"/><rect x="2.4" y="2.4" width="57" height="1.4" fill="#3A2614" opacity="0.08"/></pattern>';
    out += '<pattern id="smp-pat-planks" patternUnits="userSpaceOnUse" width="180" height="46"><rect x="0" y="44" width="180" height="2" fill="#3A2614" opacity="0.28"/><rect x="120" y="0" width="2" height="46" fill="#3A2614" opacity="0.22"/><path d="M10 14q40 -5 80 2t70 -3" stroke="#3A2614" stroke-opacity="0.12" fill="none" stroke-width="1.2"/><path d="M0 30q50 4 100 -2t80 3" stroke="#FFFFFF" stroke-opacity="0.12" fill="none" stroke-width="1.2"/></pattern>';
    out += '<pattern id="smp-pat-corrugate" patternUnits="userSpaceOnUse" width="22" height="22"><rect x="0" y="0" width="7" height="22" fill="#FFFFFF" opacity="0.08"/><rect x="11" y="0" width="3" height="22" fill="#3A2614" opacity="0.07"/></pattern>';
    out += '<pattern id="smp-pat-tweed" patternUnits="userSpaceOnUse" width="16" height="16"><rect x="0" y="0" width="16" height="2" fill="#3A2614" opacity="0.18"/><rect x="0" y="0" width="2" height="16" fill="#3A2614" opacity="0.18"/><rect x="8" y="8" width="8" height="1.2" fill="#FFFFFF" opacity="0.18"/></pattern>';
    return out;
  }

  // ------------------------- world state -------------------------
  var st = null;
  var actId = 1;
  function newState() {
    return {
      pieces: [], puppets: [], stepFns: [], tls: [], dirty: true, boil: 1, push: 0.03, seed: 1,
      world: null, cam: null, layers: {}, ground: groundY(), flick: null, set: null, errorsChecked: false, scenery: {}
    };
  }
  function ensure() { if (!st) scene(V.root(), {}); return st; }

  function scene(root, o) {
    o = obj(o);
    root = root || V.root();
    st = newState();
    seedN = 1;
    st.push = o.push != null ? clamp(num(o.push, 0.03), 0, 0.2) : 0.03;
    var world = div("smp-world", root);
    world.style.background = C.kraft;
    st.world = world;
    var defs = svg("svg", { class: "smp-defs", width: 1, height: 1, "aria-hidden": "true" }, world);
    defs.style.cssText = "position:absolute;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:0.01;pointer-events:none";
    var dd = svg("defs", null, defs);
    dd.innerHTML = texDefs();
    var cam = div("smp-cam", world);
    cam.style.transformOrigin = f1(W / 2) + "px " + f1(H * 0.56) + "px";
    st.cam = cam;
    ["bg", "back", "mid", "front"].forEach(function (k) { st.layers[k] = div("smp-layer smp-" + k, cam); });
    st.layers.top = div("smp-layer smp-top", world);
    div("smp-light", world);
    st.flick = div("smp-flicker", world);
    var mine = st;
    V.onFrame(function (t) { if (st === mine) frame(t); });
    var ground = groundY();
    st.ground = ground;
    if (o.set) { var r = setSet(o.set); if (r && r.ground) ground = r.ground; }
    st.ground = ground;
    return { ground: ground, bg: st.layers.bg, back: st.layers.back, mid: st.layers.mid, front: st.layers.front, top: st.layers.top, W: W, H: H, el: world };
  }

  // ------------------------- pieces -------------------------
  function layerOf(p, def) {
    var s = ensure();
    if (p && p.nodeType === 1) return p;
    if (typeof p === "string" && s.layers[p]) return s.layers[p];
    return s.layers[def || "front"];
  }
  function makePiece(content, o) {
    o = o || {};
    var s = ensure();
    var outer = div("smp-pc"), inner = div("smp-pi", outer);
    if (content) inner.appendChild(content);
    var abs = o.x != null && o.y != null;
    var w = Math.max(0, num(o.w, 0)), h = Math.max(0, num(o.h, 0)), ax = num(o.ax, 0.5), ay = num(o.ay, 0.5);
    if (abs) {
      outer.style.cssText = "position:absolute;left:" + f1(num(o.x, 0) - ax * w) + "px;top:" + f1(num(o.y, 0) - ay * h) + "px;width:" + f1(w) + "px;height:" + f1(h) + "px";
    } else {
      outer.style.cssText = "position:relative;display:inline-block;vertical-align:middle" + (w ? ";width:" + f1(w) + "px" : "") + (h ? ";height:" + f1(h) + "px" : "");
      inner.style.position = "relative";
    }
    outer.style.transformOrigin = f1(ax * w) + "px " + f1(ay * h) + "px";
    inner.style.transformOrigin = f1(ax * w) + "px " + f1(ay * h) + "px";
    if (o.z != null) outer.style.zIndex = String(o.z);
    var p = {
      el: outer, inner: inner, x: abs ? num(o.x, 0) : null, y: abs ? num(o.y, 0) : null, w: w, h: h, ax: ax, ay: ay,
      r0: num(o.r, 0), boil: o.boil == null ? 1 : num(o.boil, 1), shadow: o.shadow == null ? 1 : o.shadow === false ? 0 : num(o.shadow, 1),
      acts: [], adds: [], amb: null, seed: 17 + s.pieces.length * 13 + (s.seed || 0), kind: o.kind || null, label: o.label || "",
      showAt: -1, hideAt: 1e9, box: null, shapeEl: null, _tf: null, _itf: null, _flt: null, _vis: null, _op: null, api: null
    };
    var parent = o.parent === false ? null : layerOf(o.parent, o.layer || "front");
    if (parent) parent.appendChild(outer);
    s.pieces.push(p);
    s.dirty = true;
    p.api = pieceApi(p);
    return p.api;
  }
  function pieceApi(p) {
    var api = {
      el: p.el, inner: p.inner, _p: p,
      place: function (at, how, o) { addAct(p, "place", at, null, { how: how || "hand", o: obj(o) }); return api; },
      move: function (at, dur, to, o) { addAct(p, "move", at, dur, { to: obj(to), o: obj(o) }); return api; },
      hop: function (at, dx, dy, o) { o = obj(o); var n = clamp(Math.round(num(o.hops, 2)), 1, 12); addAct(p, "hop", at, num(o.dur, 0.45) * n, { dx: num(dx, 0), dy: num(dy, 0), n: n, height: num(o.height, u(46)) }); return api; },
      hopAbs: function (at, x, y, o) { o = obj(o); var n = clamp(Math.round(num(o.hops, 3)), 1, 12); addAct(p, "hop", at, num(o.dur, 0.4) * n, { ax: x, ay: y, n: n, height: num(o.height, u(46)) }); return api; },
      wiggle: function (at, dur, deg) { var t0 = qt(at); p.adds.push({ kind: "wiggle", t0: t0, dur: Math.min(qd(num(dur, 1)), Math.max(0.1, Math.floor((D - t0) * STEP) / STEP)), deg: num(deg, 6) }); st.dirty = true; return api; },
      flip: function (at, dur, axis, o) { o = obj(o); p.adds.push({ kind: "flip", t0: qt(at), dur: qd(num(dur, 0.5)), axis: axis === "x" ? "x" : "y", swap: o.swap || null }); st.dirty = true; return api; },
      set: function (at, props) { addAct(p, "set", at, 0, { to: obj(props) }); return api; },
      out: function (at, how, o) { addAct(p, "out", at, null, { how: how || "lift", o: obj(o) }); return api; },
      ambient: function (fn) { if (typeof fn === "function") p.amb = fn; return api; },
      poseAt: function (t) { if (st.dirty) compile(); return poseFull(p, stepTime(num(t, 0)), stepIndex(num(t, 0))); },
      kind: function (k, label) { p.kind = k; if (label != null) p.label = label; return api; },
      box: function () { return pieceBox(p); }
    };
    return api;
  }
  var PLACE_DUR = { hand: 0.6, drop: 0.5, pop: 0.3, stamp: 0.3, flip: 0.4, "flip-top": 0.4, "slide-left": 0.5, "slide-right": 0.5, "slide-up": 0.5, "slide-down": 0.5, hop: 1.2 };
  var OUT_DUR = { lift: 0.5, drop: 0.5, "slide-left": 0.5, "slide-right": 0.5, "slide-up": 0.5, "slide-down": 0.5, pop: 0.3, hop: 1.2 };
  function addAct(p, kind, at, dur, data) {
    var s = ensure();
    var a = { id: actId++, kind: kind, t0: qt(Math.max(0, num(at, 0))), data: data };
    if (kind === "place") a.dur = qd(num(data.o.dur, PLACE_DUR[data.how] || 0.5));
    else if (kind === "out") a.dur = qd(num(data.o.dur, OUT_DUR[data.how] || 0.5));
    else if (kind === "set") a.dur = 0;
    else a.dur = qd(num(dur, 0.5));
    p.acts.push(a);
    s.dirty = true;
    return a;
  }
  function rest() { return { x: 0, y: 0, r: 0, s: 1, sx: 1, sy: 1, o: 1, lift: 0 }; }
  function cpose(q) { return { x: q.x, y: q.y, r: q.r, s: q.s, sx: q.sx, sy: q.sy, o: q.o, lift: 0 }; }
  function pieceBox(p) {
    if (p.box) return p.box;
    if (p.x != null) return { x: p.x - p.ax * p.w, y: p.y - p.ay * p.h, w: p.w, h: p.h };
    return { x: 0, y: 0, w: p.w, h: p.h };
  }
  // Resolve each act's from / to pose in time order (run by flush and when dirty).
  function compile() {
    var s = st;
    if (!s) return;
    s.pieces.forEach(function (p) { p.el.style.transform = "none"; p._tf = null; });
    s.pieces.forEach(function (p) {
      var r = p.el.getBoundingClientRect();
      p.box = { x: r.left, y: r.top, w: r.width || p.w, h: r.height || p.h };
    });
    s.pieces.forEach(function (p) {
      p.acts.sort(function (a, b) { return a.t0 - b.t0 || a.id - b.id; });
      var cur = rest(), i;
      for (i = 0; i < p.acts.length; i++) {
        var a = p.acts[i];
        var from = i ? actPose(p, p.acts[i - 1], a.t0) : rest();
        if (i && p.acts[i - 1].t0 + p.acts[i - 1].dur > a.t0 + 1e-9 === false) from = cpose(p.acts[i - 1].to);
        a.from = cpose(from);
        a.to = actTarget(p, a, a.from);
        cur = a.to;
      }
      p.adds.sort(function (a, b) { return a.t0 - b.t0; });
      var places = p.acts.filter(function (a) { return a.kind === "place"; });
      var outs = p.acts.filter(function (a) { return a.kind === "out"; });
      p.showAt = places.length ? places[0].t0 : -1;
      p.hideAt = outs.length ? outs[outs.length - 1].t0 + outs[outs.length - 1].dur : 1e9;
      p.acts.concat(p.adds).forEach(function (a) {
        if (a.t0 + a.dur > D + 0.051 && !s.errorsChecked) V.error("[paper-theatre] a piece (" + (p.kind || "paper") + (p.label ? " " + String(p.label).slice(0, 24) : "") + ") is still moving after the scene ends (" + f2(a.t0 + a.dur) + " s > " + f2(D) + " s)");
      });
    });
    s.errorsChecked = true;
    s.dirty = false;
  }
  function actTarget(p, a, from) {
    var to = cpose(from), d = a.data;
    if (a.kind === "move" || a.kind === "set") {
      ["x", "y", "r", "s", "sx", "sy", "o"].forEach(function (k) { if (d.to[k] != null && isFinite(+d.to[k])) to[k] = +d.to[k]; });
    } else if (a.kind === "hop") {
      if (d.ax != null) { to.x = num(d.ax, 0) - (p.x != null ? p.x : p.box.x + p.ax * p.box.w); to.y = d.ay != null ? num(d.ay, 0) - (p.y != null ? p.y : p.box.y + p.ay * p.box.h) : from.y; }
      else { to.x = from.x + d.dx; to.y = from.y + d.dy; }
    }
    return to;
  }
  // Offset that takes the piece fully off-frame in a direction of motion.
  function offFrame(p, dir, extra) {
    var b = p.box || pieceBox(p), m = u(40) + (extra || 0);
    if (dir === "left") return { x: W - b.x + m, y: 0 };            // moving left: starts beyond the right edge
    if (dir === "right") return { x: -(b.x + b.w + m), y: 0 };
    if (dir === "up") return { x: 0, y: H - b.y + m };
    return { x: 0, y: -(b.y + b.h + m) };                            // down: starts above the frame
  }
  function nearestEdge(p) {
    var b = p.box || pieceBox(p), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    var dl = cx, dr = W - cx, db = H - cy;
    var m = Math.min(dl, dr, db * 1.15);
    return m === dl ? "right" : m === dr ? "left" : "up";
  }
  function entry(p, a, q) {
    var to = a.to, d = a.data, how = d.how, o = d.o, P = cpose(to);
    var R = hash2(p.seed, a.id), dist = o.dist != null ? num(o.dist, 0) : null;
    if (how === "drop") {
      var dy0 = dist != null ? -dist : offFrame(p, "down").y;
      if (q < 0.6) { var k = inQ(q / 0.6); P.y = to.y + dy0 * (1 - k); P.r = to.r + (R - 0.5) * 16 * (1 - k); P.lift = 1.2; }
      else if (q < 0.75) { P.sy = 0.86; P.sx = 1.08; P.lift = -0.25; }
      else if (q < 0.92) { P.y = to.y - u(14); P.sy = 1.04; P.sx = 0.97; P.lift = 0.35; }
      return P;
    }
    if (how === "pop") {
      P.s = q < 0.5 ? lerp(0.12, 1.16, q / 0.5) : q < 0.8 ? lerp(1.16, 0.95, (q - 0.5) / 0.3) : lerp(0.95, 1, (q - 0.8) / 0.2);
      P.lift = 0.7 * (1 - q);
      return P;
    }
    if (how === "stamp") {
      if (q < 0.55) { var k2 = outC(q / 0.55); P.s = lerp(1.26, 1, k2); P.lift = lerp(1.3, 0.15, k2); P.r = to.r + (R < 0.5 ? -7 : 7) * (1 - k2); }
      else if (q < 0.8) { P.s = 0.965; P.lift = -0.35; }
      return P;
    }
    if (how === "flip" || how === "flip-top") {
      var sy = q < 0.75 ? lerp(0.04, 1.07, outC(q / 0.75)) : lerp(1.07, 1, (q - 0.75) / 0.25);
      P.sy = sy;
      var b = p.box || pieceBox(p);
      if (how === "flip") P.y = to.y + (1 - sy) * b.h * (1 - p.ay);
      else P.y = to.y - (1 - sy) * b.h * p.ay;
      P.lift = 0.5 * (1 - q);
      return P;
    }
    if (how === "hop") {
      var dir = o.dir === "left" ? "left" : "right", off = offFrame(p, dir).x;
      var n = clamp(Math.round(num(o.hops, 3)), 1, 8), seg = q * n, kk = Math.min(n - 1, Math.floor(seg)), f = seg - kk;
      var prog = q >= 1 ? 1 : (kk + f) / n;
      P.x = to.x + off * (1 - prog);
      P.y = to.y - num(o.height, u(60)) * Math.sin(PI * f);
      P.lift = 0.9 * Math.sin(PI * f);
      if (f < 0.12 || f > 0.88) { P.sy = 0.93; P.sx = 1.04; }
      return P;
    }
    var mdir = how === "slide-left" ? "left" : how === "slide-right" ? "right" : how === "slide-up" ? "up" : how === "slide-down" ? "down" : null;
    if (mdir) {
      var of = dist != null ? { x: mdir === "left" ? dist : mdir === "right" ? -dist : 0, y: mdir === "up" ? dist : mdir === "down" ? -dist : 0 } : offFrame(p, mdir);
      if (q < 0.8) { var k3 = outC(q / 0.8); P.x = to.x + of.x * (1 - k3); P.y = to.y + of.y * (1 - k3); P.r = to.r + (R - 0.5) * 10 * (1 - k3); P.lift = 1; }
      else { P.lift = q < 0.92 ? -0.3 : 0; }
      return P;
    }
    // "hand": slid in lifted from the nearest side, then pressed down
    var ed = o.from || nearestEdge(p), of2 = dist != null ? { x: ed === "left" ? dist : ed === "right" ? -dist : 0, y: ed === "up" ? dist : -dist } : offFrame(p, ed);
    var cap = Math.max(W, H) * 0.55;
    of2.x = clamp(of2.x, -cap, cap); of2.y = clamp(of2.y, -cap, cap);
    if (q < 0.7) { var k4 = outC(q / 0.7); P.x = to.x + of2.x * (1 - k4); P.y = to.y + of2.y * (1 - k4); P.r = to.r + (R - 0.5) * 18 * (1 - k4); P.lift = 1; }
    else if (q < 0.86) { P.lift = -0.35; P.s = 0.985; }
    return P;
  }
  function exitPose(p, a, q) {
    var from = a.from, how = a.data.how, o = a.data.o, P = cpose(from);
    if (how === "pop") { P.s = q < 0.3 ? lerp(1, 1.12, q / 0.3) : lerp(1.12, 0.05, (q - 0.3) / 0.7); P.lift = 0.6; return P; }
    if (how === "hop") {
      var dir = o.dir === "left" ? "left" : "right", n = clamp(Math.round(num(o.hops, 3)), 1, 8), seg = q * n, kk = Math.min(n - 1, Math.floor(seg)), f = seg - kk;
      var b = p.box || pieceBox(p), off = dir === "left" ? -(b.x + b.w + u(40)) : W - b.x + u(40);
      P.x = from.x + off * ((kk + f) / n);
      P.y = from.y - num(o.height, u(60)) * Math.sin(PI * f);
      P.lift = 0.9 * Math.sin(PI * f);
      return P;
    }
    var dirs = { "slide-left": "right", "slide-right": "left", "slide-up": "down", "slide-down": "up" };
    if (dirs[how]) {
      var of = offFrame(p, dirs[how]), k = inQ(q);
      P.x = from.x + of.x * k; P.y = from.y + of.y * k; P.lift = 1;
      return P;
    }
    if (how === "drop") { var k2 = inQ(q); P.y = from.y + (H - (p.box || pieceBox(p)).y + u(40)) * k2; P.r = from.r + 12 * k2; P.lift = 1; return P; }
    // lift: picked up, then carried out of the top of the frame
    if (q < 0.25) { P.lift = 1.2; P.s = 1.04; return P; }
    var k3 = inQ((q - 0.25) / 0.75);
    P.y = from.y + offFrame(p, "down").y * k3; P.r = from.r - 10 * k3; P.lift = 1.3; P.s = 1.05;
    return P;
  }
  function actPose(p, a, ts) {
    if (a.dur <= 0 || ts >= a.t0 + a.dur - 1e-9) { var z = cpose(a.to); return z; }
    var q = clamp((ts - a.t0) / a.dur, 0, 1);
    if (a.kind === "place") return entry(p, a, q);
    if (a.kind === "out") return exitPose(p, a, q);
    var from = a.from, to = a.to, P = cpose(to), d = a.data;
    if (a.kind === "hop") {
      var n = d.n, seg = q * n, k = Math.min(n - 1, Math.floor(seg)), f = seg - k, pr = (k + f) / n;
      P.x = lerp(from.x, to.x, pr); P.y = lerp(from.y, to.y, pr) - d.height * Math.sin(PI * f);
      P.r = from.r; P.lift = 0.9 * Math.sin(PI * f);
      if (f < 0.12 || f > 0.88) { P.sy = 0.93; P.sx = 1.04; }
      return P;
    }
    var o = d.o || {}, e = getEase(o.ease, "inOutQuad")(q);
    ["x", "y", "r", "s", "sx", "sy", "o"].forEach(function (k2) { P[k2] = lerp(from[k2], to[k2], e); });
    var dist = Math.hypot(to.x - from.x, to.y - from.y);
    if (o.arc) P.y -= num(o.arc, 0) * Math.sin(PI * q);
    if (o.hops) P.y -= num(o.height, u(40)) * Math.abs(Math.sin(PI * q * Math.max(1, Math.round(num(o.hops, 1)))));
    var L = o.lift != null ? num(o.lift, 1) : dist > u(10) ? 1 : 0.25;
    P.lift = L * Math.min(1, Math.sin(PI * q) * 2);
    return P;
  }
  function poseOf(p, ts) {
    var acts = p.acts, last = null;
    for (var i = acts.length - 1; i >= 0; i--) if (acts[i].t0 <= ts + 1e-9) { last = acts[i]; break; }
    if (!last) return rest();
    return actPose(p, last, ts);
  }
  function isMoving(p, ts) {
    for (var i = 0; i < p.acts.length; i++) { var a = p.acts[i]; if (a.dur > 0 && ts >= a.t0 - 1e-9 && ts < a.t0 + a.dur - 1e-9) return true; }
    return false;
  }
  function poseFull(p, ts, si) {
    var q = poseOf(p, ts);
    for (var i = 0; i < p.adds.length; i++) {
      var a = p.adds[i];
      if (ts < a.t0 - 1e-9) continue;
      var k = a.dur > 0 ? clamp((ts - a.t0) / a.dur, 0, 1) : 1;
      if (a.kind === "wiggle" && k < 1) q.r += a.deg * Math.sin(2 * PI * 1.6 * k) * (1 - k);
      if (a.kind === "flip") {
        if (k < 1) { var c = Math.abs(Math.cos(PI * k)); if (a.axis === "y") q.sx *= Math.max(0.02, c); else q.sy *= Math.max(0.02, c); q.lift = Math.max(q.lift, 0.8 * Math.sin(PI * k)); }
      }
    }
    if (p.amb) {
      var m = p.amb(ts, si) || {};
      if (m.x) q.x += m.x; if (m.y) q.y += m.y; if (m.r) q.r += m.r;
      if (m.s != null) q.s *= m.s; if (m.sx != null) q.sx *= m.sx; if (m.sy != null) q.sy *= m.sy;
      if (m.hide) q.hide = true;
      if (m.lift) q.lift += m.lift;
    }
    return q;
  }
  // Show or hide an element: SVG nodes use the display attribute, HTML nodes the inline style.
  function showEl(el, on) {
    if (!el) return;
    if (el.namespaceURI === NS) { el.setAttribute("display", on ? "inline" : "none"); if (el.style) el.style.display = ""; }
    else if (el.style) el.style.display = on ? "" : "none";
  }
  function applySwaps(p, ts) {
    for (var i = 0; i < p.adds.length; i++) {
      var a = p.adds[i];
      if (a.kind !== "flip" || !a.swap) continue;
      var flipped = ts >= a.t0 + a.dur / 2 - 1e-9;
      var A = a.swap[0], B = a.swap[1];
      var key = flipped ? 1 : 0;
      if (a._k === key) continue;
      a._k = key;
      showEl(A, !flipped);
      showEl(B, flipped);
    }
  }
  function applyPiece(p, ts, si) {
    var vis = !p.hidden && ts >= p.showAt - 1e-9 && ts < p.hideAt - 1e-9;
    var q = vis ? poseFull(p, ts, si) : null;
    if (q && q.hide) vis = false;
    if (vis !== p._vis) { p.el.style.visibility = vis ? "" : "hidden"; p._vis = vis; }
    if (!vis) return;
    applySwaps(p, ts);
    var L = clamp(q.lift, -0.4, 1.6), sc = q.s * (1 + 0.045 * Math.max(0, L));
    var tf = "translate(" + f1(q.x) + "px," + f1(q.y) + "px) rotate(" + f2(p.r0 + q.r) + "deg) scale(" + f3(q.sx * sc) + "," + f3(q.sy * sc) + ")";
    if (tf !== p._tf) { p.el.style.transform = tf; p._tf = tf; }
    if (q.o !== p._op) { p.el.style.opacity = q.o >= 1 ? "" : String(f3(clamp(q.o, 0, 1))); p._op = q.o; }
    var k = st.boil * p.boil, itf = "";
    if (k > 0) {
      var big = Math.max(p.box ? Math.max(p.box.w, p.box.h) : 200, 60);
      var amp = 0.85 * UN * k, ramp = 0.38 * k * Math.min(1, (260 * UN) / big);
      var bx = (hash2(p.seed, si) - 0.5) * 2 * amp, by = (hash2(p.seed + 0.37, si) - 0.5) * 2 * amp, br = (hash2(p.seed + 0.71, si) - 0.5) * 2 * ramp;
      itf = "translate(" + f2(bx) + "px," + f2(by) + "px) rotate(" + f2(br) + "deg)";
    }
    if (itf !== p._itf) { p.inner.style.transform = itf; p._itf = itf; }
    if (p.shadow) {
      var base = p.shadow, Ls = Math.max(-0.4, L);
      var off = (2.6 + 11 * Ls) * base * UN, blur = (2.5 + 9 * Math.max(0, Ls)) * base * UN, al = clamp(0.36 - 0.1 * Math.max(0, Ls), 0.18, 0.4);
      var flt = "drop-shadow(" + f1(off * 0.55) + "px " + f1(off) + "px " + f1(Math.max(0.5, blur)) + "px rgba(48,28,10," + f2(al) + "))";
      if (flt !== p._flt) { p.inner.style.filter = flt; p._flt = flt; }
    }
  }

  // ------------------------- frame -------------------------
  function frame(t) {
    var s = st;
    if (!s) return;
    if (s.dirty) compile();
    var ts = stepTime(t), si = stepIndex(t);
    var pz = 1 + s.push * smooth(clamp(ts / Math.max(0.1, D), 0, 1));
    var ct = pz > 1.0001 ? "scale(" + pz.toFixed(4) + ")" : "none";
    if (ct !== s._ct) { s.cam.style.transform = ct; s._ct = ct; }
    for (var i = 0; i < s.pieces.length; i++) applyPiece(s.pieces[i], ts, si);
    for (i = 0; i < s.puppets.length; i++) rigApply(s.puppets[i], ts, si);
    for (i = 0; i < s.stepFns.length; i++) { try { s.stepFns[i](ts, si, t); } catch (e) { V.error("[onStep] " + (e && e.message ? e.message : e)); } }
    var fl = f3(0.012 + hash2(si, 3.7) * 0.045);
    if (fl !== s._fl) { s.flick.style.opacity = String(fl); s._fl = fl; }
  }
  // Stepped V.timeline: same to / from / fromTo / set / call API, but tweens advance in steps.
  function steppedTimeline() {
    var tl = V.timeline();
    function wrapEase(o, at, dur) {
      var base = getEase(o.ease, "outCubic");
      return function (p) { var tt = at + p * dur, tq = stepTime(tt + 1e-6), pq = dur > 0 ? clamp((tq - at) / dur, 0, 1) : 1; return base(pq); };
    }
    function add(kind, target, a, b, opts) {
      var o = typeof opts === "number" ? { at: opts } : Object.assign({}, opts || {});
      var at = qt(o.at != null ? num(o.at, 0) : tl.duration()), dur = qd(o.dur != null ? o.dur : o.duration != null ? o.duration : 0.6);
      var els = typeof target === "string" ? V.$$(target) : target && target.nodeType ? [target] : target && target.length != null ? [].slice.call(target) : [];
      var stg = num(o.stagger, 0);
      els.forEach(function (el, i) {
        var oo = Object.assign({}, o, { at: qt(at + i * stg), dur: dur, stagger: 0 });
        oo.ease = wrapEase(o, oo.at, dur);
        if (kind === "to") tl.to(el, a, oo); else if (kind === "from") tl.from(el, a, oo); else tl.fromTo(el, a, b, oo);
      });
      return api;
    }
    var api = {
      to: function (t, props, o) { return add("to", t, props, null, o); },
      from: function (t, props, o) { return add("from", t, props, null, o); },
      fromTo: function (t, a, b, o) { return add("fromTo", t, a, b, o); },
      set: function (t, props, at) { tl.set(t, props, typeof at === "object" ? Object.assign({}, at, { at: qt(num(at.at, 0)) }) : qt(num(at, 0))); return api; },
      call: function (fn, at) { tl.call(fn, qt(num(at, 0))); return api; },
      duration: function () { return tl.duration(); },
      timeline: tl
    };
    return api;
  }

  // ------------------------- text measuring -------------------------
  var mctx = null;
  function fontStr(size, family, weight) { return (weight || "normal") + " " + f1(size) + "px " + family; }
  function textW(txt, size, family, weight) {
    if (!mctx) mctx = doc.createElement("canvas").getContext("2d");
    mctx.font = fontStr(size, family, weight);
    return mctx.measureText(String(txt)).width;
  }
  function parseRich(text) {
    var out = [], em = false, cur = "", curEm = false, s = str(text);
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === "*") { em = !em; continue; }
      if (/\s/.test(ch)) { if (cur) out.push({ w: cur, em: curEm }); cur = ""; continue; }
      if (!cur) curEm = em;
      cur += ch;
    }
    if (cur) out.push({ w: cur, em: curEm });
    return out;
  }
  function plainText(text) { return str(text).replace(/\*/g, ""); }
  function greedyLines(widths, gap, maxW) {
    var lines = [], cur = [], cw = 0;
    widths.forEach(function (w, i) {
      var nw = cur.length ? cw + gap + w : w;
      if (cur.length && nw > maxW) { lines.push(cur); cur = [i]; cw = w; }
      else { cur.push(i); cw = nw; }
    });
    if (cur.length) lines.push(cur);
    return lines;
  }
  function lineWidth(line, widths, gap) { var w = 0; line.forEach(function (i, k) { w += widths[i] + (k ? gap : 0); }); return w; }
  // Narrowest wrap width that keeps the greedy line count (no orphan words).
  function balancedLines(widths, gap, maxW) {
    var g = greedyLines(widths, gap, maxW);
    if (g.length <= 1) return g;
    var lo = Math.max.apply(null, widths), hi = maxW, best = g;
    for (var it = 0; it < 16 && hi - lo > 1; it++) {
      var mid = (lo + hi) / 2, t = greedyLines(widths, gap, mid);
      if (t.length <= g.length) { best = t; hi = mid; } else lo = mid;
    }
    return best;
  }
  function textMarkup(s, x, y, size, color, family, weight, anchor, extra) {
    return '<text x="' + f1(x) + '" y="' + f1(y) + '" font-family=\'' + family + '\' font-size="' + f1(size) + '"' + (weight ? ' font-weight="' + weight + '"' : "") + ' fill="' + color + '" text-anchor="' + (anchor || "middle") + '"' + (extra || "") + ">" + esc(s) + "</text>";
  }
  // Ink text lines with *emphasis* in red (design units). lines: [[{w, em}]]
  function inkLinesMarkup(lines, x, y, size, o) {
    o = o || {};
    var family = o.family || F_SANS, weight = o.weight || "bold", lh = size * (o.lh || 1.22), out = "";
    var gap = textW(" ", size, family, weight);
    lines.forEach(function (ln, li) {
      var ws = ln.map(function (t) { return textW(t.w, size, family, weight); });
      var lw = 0; ws.forEach(function (w, k) { lw += w + (k ? gap : 0); });
      var xx = o.align === "left" ? x : x - lw / 2, yy = y + li * lh;
      ln.forEach(function (t, k) {
        out += textMarkup(t.w, xx, yy, size, t.em ? o.em || C.red : o.color || C.ink, family, weight, "start");
        if (t.em && o.underline !== false) out += '<path d="M' + f1(xx) + " " + f1(yy + size * 0.16) + "q" + f1(ws[k] / 2) + " " + f1(size * 0.06) + " " + f1(ws[k]) + ' 0" stroke="' + (o.em || C.red) + '" stroke-width="' + f1(size * 0.07) + '" fill="none" stroke-linecap="round" opacity="0.85"/>';
        xx += ws[k] + gap;
      });
    });
    return out;
  }
  // Wrap rich text into lines that fit (maxW x maxH design units); shrinks the size. Returns { lines, size, w, h }.
  function fitInk(text, maxW, maxH, size, o) {
    o = o || {};
    var toks = parseRich(text), family = o.family || F_SANS, weight = o.weight || "bold", lhk = o.lh || 1.22;
    if (!toks.length) return { lines: [], size: size, w: 0, h: 0 };
    var sz = size, res = null;
    for (var it = 0; it < 40; it++) {
      var ws = toks.map(function (t) { return textW(t.w, sz, family, weight); }), gap = textW(" ", sz, family, weight);
      var ls = Math.max.apply(null, ws) > maxW ? null : balancedLines(ws, gap, maxW);
      if (ls && (!o.maxLines || ls.length <= o.maxLines)) {
        var h = sz * (1 + (ls.length - 1) * lhk), w = 0;
        ls.forEach(function (l) { w = Math.max(w, lineWidth(l, ws, gap)); });
        res = { lines: ls.map(function (l) { return l.map(function (i) { return toks[i]; }); }), size: sz, w: w, h: h };
        if (h <= maxH) return res;
      }
      sz *= 0.93;
      if (sz < (o.min || 8)) break;
    }
    if (!res) { var ws2 = toks.map(function (t) { return textW(t.w, sz, family, weight); }); res = { lines: [toks], size: sz, w: ws2.reduce(function (a, b) { return a + b; }, 0), h: sz }; }
    return res;
  }

  // ------------------------- cut-paper type -------------------------
  var RANSOM_PAPERS = ["cream", "white", "yellow", "sky", "pink", "kraft", "ink", "lime", "orange", "lilac"];
  var RANSOM_FONTS = [[F_BOLD, "normal", 0.35], [F_SANS, "bold", 0.35], [F_MONO, "bold", 0.3], [F_BOLD, "normal", 0.35], [F_SANS, "bold", 0.35]];
  var LETTER_COLS = ["red", "navy", "mustard", "teal", "orange", "purple", "green"];
  var MODE_DEF = { strip: "stamp", ransom: "pop", letters: "drop", label: "slide-right", stencil: "pop" };
  // Layout of one block of cut-paper text at a given size. Returns { units, lines, w, h } (px, relative to block).
  function layoutCut(toks, mode, sz, maxW, o, R) {
    var units = [], lineUnits = [];
    if (mode === "label" || mode === "stencil") {
      var fam = mode === "label" ? F_MONO : F_BOLD, wt = mode === "label" ? "bold" : "normal";
      var ws = toks.map(function (t) { return textW(t.w, sz, fam, wt); }), gap = textW(" ", sz, fam, wt);
      var padX = mode === "label" ? sz * 0.7 : sz * 1.3, lim = maxW - padX;
      if (Math.max.apply(null, ws) > lim) return null;
      var ls = balancedLines(ws, gap, lim);
      if (mode === "label") {
        var lh = sz * 1.5, lg = sz * 0.22, bw = 0;
        ls.forEach(function (l) { bw = Math.max(bw, lineWidth(l, ws, gap) + padX); });
        ls.forEach(function (l, li) {
          var lw = lineWidth(l, ws, gap) + padX;
          units.push({ kind: "label", line: li, toks: l.map(function (i) { return toks[i]; }), wi: l[0], wis: l.slice(), w: lw, h: lh, x: (bw - lw) / 2, y: li * (lh + lg), r: (R() - 0.5) * 2.4 });
        });
        return { units: units, lines: ls.length, w: bw, h: ls.length * lh + (ls.length - 1) * lg };
      }
      var th = ls.length * sz * 1.16 + sz * 0.8, tw = 0;
      ls.forEach(function (l) { tw = Math.max(tw, lineWidth(l, ws, gap)); });
      tw += padX;
      units.push({ kind: "stencil", lines: ls.map(function (l) { return l.map(function (i) { return toks[i]; }); }), wi: 0, wis: toks.map(function (t, i) { return i; }), w: tw, h: th, x: 0, y: 0, r: (R() - 0.5) * 3 });
      return { units: units, lines: ls.length, w: tw, h: th };
    }
    // strip / ransom / letters: one or more units per word
    var words = toks.map(function (t, wi) {
      var parts = [], ww = 0;
      if (mode === "strip") {
        var tw2 = textW(t.w, sz, F_BOLD);
        parts.push({ kind: "strip", ch: t.w, w: tw2 + sz * 0.44, h: sz * 1.28, em: t.em, r: (R() - 0.5) * 4.2, dy: (R() - 0.5) * sz * 0.1 });
      } else {
        var chars = Array.from(t.w);
        chars.forEach(function (ch, ci) {
          if (mode === "ransom") {
            var f = RANSOM_FONTS[Math.floor(R() * RANSOM_FONTS.length)], k = 0.9 + R() * 0.22, up = R() < 0.3;
            var g = up ? ch.toUpperCase() : ch, gw = textW(g, sz * k, f[0], f[1]);
            var pap = t.em ? (R() < 0.6 ? "red" : "ink") : RANSOM_PAPERS[Math.floor(R() * RANSOM_PAPERS.length)];
            parts.push({ kind: "ransom", ch: g, w: gw + sz * 0.26, h: sz * 1.3 * k, k: k, font: f, paper: pap, em: t.em, r: (R() - 0.5) * 13, dy: (R() - 0.5) * sz * 0.12, shape: R() < 0.12 ? "round" : "rect" });
          } else {
            var gw2 = textW(ch, sz, F_BOLD);
            parts.push({ kind: "letter", ch: ch, w: gw2 + sz * 0.05, h: sz * 1.08, em: t.em, colr: o.color ? col(o.color, C.red) : t.em ? C.red : col(LETTER_COLS[(wi + ci) % LETTER_COLS.length]), r: (R() - 0.5) * 9, dy: (R() - 0.5) * sz * 0.08 });
          }
        });
      }
      var lg = mode === "ransom" ? sz * 0.03 : 0;
      parts.forEach(function (p, i) { ww += p.w + (i ? lg : 0); });
      return { parts: parts, w: ww, lg: lg };
    });
    var gapW = mode === "strip" ? sz * 0.16 : mode === "ransom" ? sz * 0.34 : sz * 0.32;
    var lhW = mode === "strip" ? sz * 1.42 : mode === "ransom" ? sz * 1.5 : sz * 1.14;
    var widths = words.map(function (w) { return w.w; });
    if (Math.max.apply(null, widths) > maxW) return null;
    var ls2 = balancedLines(widths, gapW, maxW), bw2 = 0;
    ls2.forEach(function (l) { bw2 = Math.max(bw2, lineWidth(l, widths, gapW)); });
    ls2.forEach(function (l, li) {
      var lw = lineWidth(l, widths, gapW), x = o.align === "left" ? 0 : (bw2 - lw) / 2, y0 = li * lhW;
      l.forEach(function (wi) {
        var wd = words[wi];
        wd.parts.forEach(function (p, pi) {
          var hh = p.h, yy = y0 + (lhW - hh) / 2 + (p.dy || 0) - (mode === "strip" ? sz * 0.07 : 0);
          units.push(Object.assign(p, { wi: wi, li: pi, nIn: wd.parts.length, x: x, y: yy, line: li }));
          x += p.w + wd.lg;
        });
        x += gapW - wd.lg;
      });
    });
    return { units: units, lines: ls2.length, w: bw2, h: ls2.length * lhW };
  }
  function unitMarkup(un, sz, mode, o) {
    var w = un.w / UN, h = un.h / UN, s = sz / UN, out = "", seed = nextSeed();
    if (un.kind === "strip") {
      var pap = un.em ? C.red : col(o.paper, C.cream), ink = un.em ? C.cream : col(o.ink, C.ink);
      out += paperMarkup("rect", w, h, pap, { edge: "cut", tex: "paper", seed: seed });
      out += textMarkup(un.ch, w / 2, h / 2 + s * 0.355, s, ink, F_BOLD);
    } else if (un.kind === "ransom") {
      var pp = col(un.paper), ik = un.em && un.paper === "ink" ? C.red : inkOn(pp);
      if (!un.em && un.paper !== "ink" && hash2(seed, 2) < 0.18) ik = C.red;
      out += paperMarkup(un.shape, w, h, pp, { edge: hash2(seed, 5) < 0.3 ? "torn" : "cut", tex: "paper", seed: seed });
      out += textMarkup(un.ch, w / 2, h / 2 + s * un.k * un.font[2], s * un.k, ik, un.font[0], un.font[1]);
    } else if (un.kind === "letter") {
      var by = h / 2 + s * 0.36, fam = F_BOLD;
      out += textMarkup(un.ch, w / 2, by, s, un.colr, fam, null, "middle", ' stroke="' + shade(un.colr, 0.7) + '" stroke-width="' + f2(s * 0.018) + '" stroke-linejoin="round"');
      out += textMarkup(un.ch, w / 2, by, s, "url(#smp-tex-paper)", fam);
    } else if (un.kind === "label") {
      var lp = col(o.paper, C.white), li = col(o.ink, C.ink);
      out += paperMarkup("rect", w, h, lp, { edge: ["cut", "zig", "cut", "zig"], tex: "card", seed: seed });
      var x = 0.35 * s;
      var gap = textW(" ", sz, F_MONO, "bold") / UN;
      un.toks.forEach(function (t) {
        var tw = textW(t.w, sz, F_MONO, "bold") / UN;
        out += textMarkup(t.w, x, h / 2 + s * 0.3, s, t.em ? C.red : li, F_MONO, "bold", "start");
        x += tw + gap;
      });
    } else if (un.kind === "stencil") {
      var sp = col(o.paper, C.kraft), si = col(o.ink, C.ink);
      out += paperMarkup("tag", w, h, sp, { edge: "cut", tex: "kraft", seed: seed });
      out += '<path d="M' + f1(w * 0.09) + " " + f1(h / 2) + "q" + f1(-w * 0.12) + " " + f1(-h * 0.5) + " " + f1(-w * 0.2) + " " + f1(-h * 0.9) + '" stroke="#E8DCC0" stroke-width="' + f2(1.6) + '" fill="none" stroke-linecap="round"/>';
      var lh = s * 1.16, y0 = (h - un.lines.length * lh) / 2 + s * 0.83;
      un.lines.forEach(function (ln, k) {
        var gap2 = textW(" ", sz, F_BOLD) / UN, lw = 0;
        var ws = ln.map(function (t) { var ww = textW(t.w, sz, F_BOLD) / UN; lw += ww; return ww; });
        lw += gap2 * (ln.length - 1);
        var xx = w * 0.16 + (w * 0.84 - lw) / 2 + s * 0.05;
        ln.forEach(function (t, j) { out += textMarkup(t.w, xx, y0 + k * lh, s, t.em ? C.red : si, F_BOLD, null, "start", ' opacity="0.92" letter-spacing="' + f2(s * 0.02) + '"'); xx += ws[j] + gap2; });
      });
    }
    return out;
  }
  // Measure only: { lay, size, toks, mode } for a block of cut-paper text (no pieces made).
  function cutLayout(text, o) {
    o = obj(o);
    var s = ensure(), sa = safe();
    var mode = MODE_DEF[o.mode] ? o.mode : "strip";
    var toks = parseRich(text);
    if (!toks.length) toks = [{ w: " ", em: false }];
    var maxW = num(o.maxWidth, sa.w), maxH = num(o.maxHeight, 0), maxLines = clamp(Math.round(num(o.maxLines, 3)), 1, 12);
    var sz = num(o.size, u(mode === "ransom" ? 110 : mode === "letters" ? 130 : mode === "label" ? 44 : 72)), lay = null;
    for (var it = 0; it < 60; it++) {
      var R2 = V.makeRand(1234 + it + (o.seed || 0));
      lay = layoutCut(toks, mode, sz, maxW, o, R2);
      if (lay && lay.lines <= maxLines && (!maxH || lay.h <= maxH) && lay.w <= maxW + 0.5) break;
      sz *= 0.93;
      if (sz < u(12)) { lay = layoutCut(toks, mode, sz, 1e9, o, R2); break; }
    }
    return { lay: lay, size: sz, toks: toks, mode: mode, w: lay.w, h: lay.h, lines: lay.lines };
  }
  function cutText(text, o) {
    o = obj(o);
    var L0 = cutLayout(text, o), lay = L0.lay, sz = L0.size, toks = L0.toks, mode = L0.mode;
    var el = div("smp-text");
    var abs = o.x != null && o.y != null, ax = num(o.ax, 0.5), ay = num(o.ay, 0.5);
    el.style.cssText = (abs ? "position:absolute;left:" + f1(num(o.x, 0) - ax * lay.w) + "px;top:" + f1(num(o.y, 0) - ay * lay.h) + "px;" : "position:relative;display:inline-block;") + "width:" + f1(lay.w) + "px;height:" + f1(lay.h) + "px";
    var parent = o.parent === false ? null : layerOf(o.parent, "top");
    if (parent) parent.appendChild(el);
    var pieces = [];
    lay.units.forEach(function (un) {
      var box = svgBox(un.w, un.h, { html: unitMarkup(un, sz, mode, o) });
      var pc = makePiece(box, { parent: el, x: un.x + un.w / 2, y: un.y + un.h / 2, w: un.w, h: un.h, r: un.r, kind: "text", label: un.ch || (un.toks ? un.toks.map(function (t) { return t.w; }).join(" ") : plainText(text)), shadow: mode === "letters" ? 1.2 : 0.8 });
      pc._p.shapeEl = box;
      pc._unit = un;
      pieces.push(pc);
    });
    var api = {
      el: el, pieces: pieces, w: lay.w, h: lay.h, size: sz, lines: lay.lines, mode: mode, words: toks, times: [],
      // place(at, { how, stagger, sync, dur, lead }) ; returns this. this.times[i] = landing time of word i.
      place: function (at, po) {
        po = obj(po);
        at = num(at, 0.3);
        var how = po.how || MODE_DEF[mode], stg = num(po.stagger, mode === "ransom" || mode === "letters" ? 0.05 : 0.1), lead = num(po.lead, 0.1);
        var wt = [];
        if (po.sync) {
          var prev = Math.max(0, at - 0.6), raw = toks.map(function (t) {
            var nw = normWord(t.w);
            if (!nw) return null;
            var f = V.find(t.w, prev);
            if (f != null && f - prev > 4.5 && wt.length) f = null; // a far-away repeat is a different phrase
            if (f != null) prev = f + 0.01;
            return f;
          });
          wt = spread(raw, at, Math.max(at + 0.3 * toks.length, at)).map(function (t, i) { return Math.max(at, t); });
          for (var k = 1; k < wt.length; k++) if (wt[k] < wt[k - 1]) wt[k] = wt[k - 1];
        } else {
          toks.forEach(function (t, i) { wt.push(at + i * stg * (mode === "ransom" || mode === "letters" ? Math.max(1, Array.from(t.w).length) : 1)); });
        }
        var lim = endBy() - qd(num(po.dur, PLACE_DUR[how] || 0.4));
        api.times = wt.map(function (t) { return Math.min(t, lim + 0.1); });
        pieces.forEach(function (pc) {
          var un = pc._unit, base = api.times[un.wi] != null ? api.times[un.wi] : at;
          if (un.wis && un.wis.length) base = api.times[un.wis[0]];
          var off = un.li ? un.li * Math.min(0.06, po.sync ? 0.05 : stg) : 0;
          var t0 = Math.min(Math.max(0, base - lead + off), lim);
          pc.place(t0, how, { dur: po.dur, dist: po.dist });
        });
        return api;
      },
      box: function () { return { x: abs ? num(o.x, 0) - ax * lay.w : 0, y: abs ? num(o.y, 0) - ay * lay.h : 0, w: lay.w, h: lay.h }; },
      out: function (at, how) { pieces.forEach(function (pc, i) { pc.out(num(at, 0) + i * 0.02, how || "lift"); }); return api; }
    };
    return api;
  }

  // ------------------------- sheets, tape, pins -------------------------
  function sheet(parent, o) {
    o = obj(o);
    var s = ensure();
    var el = div("smp-sheet" + (o.cls ? " " + o.cls : ""));
    var bg = svg("svg", { class: "smp-sheet-bg", overflow: "visible" }, el);
    bg.style.cssText = "position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible";
    var content = div("smp-sheet-content", el);
    el.content = content;
    el._smp = { color: col(o.color, C.cream), shape: o.shape || "rect", edge: o.edge || "cut", tex: o.tex || "paper", pattern: /^[a-z]+$/.test(str(o.pattern)) ? o.pattern : null, bg: bg, drawn: null };
    if (o.pattern && !el._smp.pattern) content.style.background = String(o.pattern);
    var par = parent && parent.nodeType === 1 ? parent : layerOf(parent, "top");
    par.appendChild(el);
    s.sheets = s.sheets || [];
    s.sheets.push(el);
    return el;
  }
  function drawSheets() {
    if (!st || !st.sheets) return;
    st.sheets.forEach(function (el) {
      var d = el._smp, w = el.offsetWidth, h = el.offsetHeight, key = w + "x" + h;
      if (!w || !h || d.drawn === key) return;
      d.drawn = key;
      d.bg.setAttribute("viewBox", "0 0 " + f2(w / UN) + " " + f2(h / UN));
      d.bg.innerHTML = paperMarkup(d.shape, w / UN, h / UN, d.color, { edge: d.edge, tex: d.tex, pattern: d.pattern });
    });
  }
  var TAPE = { masking: ["#E9DCB0", 0.86, null], pink: ["#EBA3B0", 0.88, "stripe"], blue: ["#8EC3D8", 0.88, "dots"], green: ["#A9C25A", 0.86, "stripe"], clear: ["#FFFFFF", 0.42, null], yellow: ["#F2C14E", 0.86, "dots"] };
  function tape(o) {
    o = obj(o);
    var k = TAPE[o.kind] ? o.kind : "masking", t = TAPE[k];
    var w = num(o.w, u(150)), h = num(o.h, u(42));
    var mk = paperMarkup("rect", w / UN, h / UN, t[0], { edge: ["cut", "zig", "cut", "zig"], tex: "card", pattern: t[2], opacity: t[1], stroke: false });
    var p = makePiece(svgBox(w, h, { html: mk }), { parent: o.parent || "top", x: num(o.x, W / 2), y: num(o.y, H / 2), w: w, h: h, r: num(o.r, 0), shadow: 0.35, boil: 0.6 });
    return p;
  }
  function pinMarkup(cx, cy, r, color) {
    var c = col(color, C.red);
    return '<g><ellipse cx="' + f1(cx + r * 0.25) + '" cy="' + f1(cy + r * 0.3) + '" rx="' + f1(r * 0.95) + '" ry="' + f1(r * 0.9) + '" fill="#2A1A0A" opacity="0.25"/>' +
      '<circle cx="' + f1(cx) + '" cy="' + f1(cy) + '" r="' + f1(r) + '" fill="' + shade(c, 0.72) + '"/>' +
      '<circle cx="' + f1(cx - r * 0.06) + '" cy="' + f1(cy - r * 0.08) + '" r="' + f1(r * 0.8) + '" fill="' + c + '"/>' +
      '<circle cx="' + f1(cx - r * 0.06) + '" cy="' + f1(cy - r * 0.08) + '" r="' + f1(r * 0.42) + '" fill="' + shade(c, 1.12) + '"/>' +
      '<ellipse cx="' + f1(cx - r * 0.3) + '" cy="' + f1(cy - r * 0.36) + '" rx="' + f1(r * 0.22) + '" ry="' + f1(r * 0.14) + '" fill="#FFFFFF" opacity="0.75"/></g>';
  }
  function pin(o) {
    o = obj(o);
    var sz = num(o.size, u(34));
    return makePiece(svgBox(sz, sz, { html: pinMarkup(sz / UN / 2, sz / UN / 2, sz / UN / 2, o.color || "red") }), { parent: o.parent || "top", x: num(o.x, W / 2), y: num(o.y, H / 2), w: sz, h: sz, shadow: 0.7, boil: 0.5 });
  }
  function googlyMarkup(cx, cy, r, px, py) {
    return '<circle cx="' + f1(cx) + '" cy="' + f1(cy) + '" r="' + f1(r) + '" fill="#FFFFFF" stroke="#2A211C" stroke-width="' + f2(r * 0.08) + '"/>' +
      '<circle cx="' + f1(cx + num(px, 0)) + '" cy="' + f1(cy + num(py, r * 0.35)) + '" r="' + f1(r * 0.48) + '" fill="#1A1410"/>' +
      '<ellipse cx="' + f1(cx - r * 0.4) + '" cy="' + f1(cy - r * 0.45) + '" rx="' + f1(r * 0.22) + '" ry="' + f1(r * 0.13) + '" fill="#FFFFFF" opacity="0.9"/>';
  }
  function stitchMarkup(x1, y1, x2, y2, c) {
    return '<path d="M' + f1(x1) + " " + f1(y1) + "L" + f1(x2) + " " + f1(y2) + '" stroke="' + col(c, C.cream) + '" stroke-width="1.6" stroke-dasharray="5 4" stroke-linecap="round" fill="none" opacity="0.85"/>';
  }

  // ------------------------- prop library (100 units high) -------------------------
  function pm(shape, cx, cy, w, h, c, o) { o = Object.assign({}, o || {}); o.cx = cx; o.cy = cy; return paperMarkup(shape, w, h, c, o); }
  function pp(points, c, o) { o = Object.assign({}, o || {}); o.x = 0; o.y = 0; return paperMarkup(points, 100, 100, c, o); }
  function inkP(d, sw, c, op) { return '<path d="' + d + '" stroke="' + col(c, C.ink) + '" stroke-width="' + (sw || 2) + '" fill="none" stroke-linecap="round" stroke-linejoin="round"' + (op != null ? ' opacity="' + op + '"' : "") + "/>"; }
  function dotM(cx, cy, r, c) { return '<circle cx="' + f1(cx) + '" cy="' + f1(cy) + '" r="' + f1(r) + '" fill="' + col(c, C.ink) + '"/>'; }
  function crescent(cx, cy, r) {
    var out = [], i;
    for (i = 0; i <= 24; i++) { var a = -PI / 2 + (i / 24) * PI * 2 * 0.5 + PI; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    for (i = 24; i >= 0; i--) { var a2 = -PI / 2 + (i / 24) * PI + PI; out.push([cx + r * 0.32 + Math.cos(a2) * r * 0.78, cy + Math.sin(a2) * r * 0.9]); }
    return out;
  }
  var PROPS = {
    tree: { w: 90, d: function (c) { return pm("rect", 45, 80, 15, 42, "brown", { tex: "kraft" }) + pm("cloud", 45, 40, 88, 66, c || "leaf") + pm("blob", 33, 30, 28, 18, "lime", { tex: "card" }); } },
    pine: { w: 72, d: function (c) { var g = col(c, C.forest); return pm("rect", 36, 90, 12, 20, "brown") + pm("tri", 36, 68, 70, 40, g) + pm("tri", 36, 45, 56, 36, shade(g, 1.12)) + pm("tri", 36, 22, 40, 32, shade(g, 1.25)); } },
    house: { w: 100, d: function (c) { return pm("rect", 72, 22, 11, 24, "brown") + pm("rect", 50, 68, 76, 60, c || "tomato") + pm("tri", 50, 27, 94, 38, "navy") + pm("rect", 50, 85, 18, 30, "brown") + dotM(55, 86, 1.6, "mustard") + pm("rect", 29, 60, 16, 16, "sky", { tex: "card" }) + pm("rect", 71, 60, 16, 16, "sky", { tex: "card" }); } },
    sun: { w: 100, d: function (c) { return pm("burst", 50, 50, 98, 98, "mustard") + pm("circle", 50, 50, 66, 66, c || "yellow") + pm("blob", 40, 40, 18, 12, "white", { opacity: 0.45, stroke: false }); } },
    cloud: { w: 130, d: function (c) { return pm("cloud", 65, 52, 126, 80, c || "white", { edge: "torn" }); } },
    moon: { w: 80, d: function (c) { return pp(crescent(40, 50, 44), c || "cream") + pm("circle", 26, 40, 8, 8, "sand", { stroke: false }) + pm("circle", 30, 66, 6, 6, "sand", { stroke: false }); } },
    star: { w: 100, d: function (c) { return pm("star", 50, 50, 96, 92, c || "yellow") + pm("star", 50, 52, 40, 38, "mustard", { opacity: 0.55, stroke: false }); } },
    planet: { w: 140, d: function (c) { return pm("circle", 70, 50, 74, 74, c || "purple") + pm("blob", 58, 36, 30, 14, "lilac", { stroke: false }) + pm("ring", 70, 54, 136, 34, "mustard", { r: -14 }); } },
    rocket: { w: 64, d: function (c) { return pm("drop", 32, 92, 16, 20, "orange", { r: 180 }) + pm("tri", 12, 72, 22, 30, "red") + pm("tri", 52, 72, 22, 30, "red") + pm("pill", 32, 54, 30, 66, c || "white") + pm("drop", 32, 20, 30, 34, "red") + pm("circle", 32, 48, 18, 18, "navy") + pm("circle", 32, 48, 12, 12, "sky", { tex: "card" }); } },
    car: { w: 150, d: function (c) { var b = c || "red"; return pm("round", 70, 38, 76, 32, b) + pm("rect", 52, 38, 26, 18, "sky", { tex: "card" }) + pm("rect", 86, 38, 26, 18, "sky", { tex: "card" }) + pm("round", 75, 62, 144, 34, b) + pm("circle", 38, 80, 30, 30, "ink") + pm("circle", 38, 80, 12, 12, "grey") + pm("circle", 112, 80, 30, 30, "ink") + pm("circle", 112, 80, 12, 12, "grey") + pm("circle", 143, 56, 8, 8, "yellow"); } },
    boat: { w: 130, d: function (c) { return pm("rect", 64, 38, 4, 54, "brown") + pp([[68, 12], [68, 58], [106, 58]], "cream") + pp([[60, 20], [60, 58], [32, 58]], "white") + pp([[64, 4], [64, 13], [80, 8]], "red") + pp([[4, 62], [126, 62], [106, 92], [24, 92]], c || "wood") + pm("rect", 65, 70, 100, 5, "cream", { stroke: false }); } },
    plane: { w: 150, d: function (c) { return pp([[64, 50], [96, 50], [74, 18], [62, 18]], "navy") + pm("pill", 75, 56, 136, 26, c || "white") + pp([[8, 56], [26, 56], [18, 26], [6, 26]], "red") + pp([[58, 60], [96, 60], [70, 92], [52, 92]], "sky") + dotM(96, 52, 3, "navy") + dotM(108, 52, 3, "navy") + dotM(120, 52, 3, "navy") + pm("circle", 138, 56, 10, 10, "sky", { stroke: false }); } },
    apple: { w: 90, d: function (c) { return pm("rect", 46, 14, 5, 16, "brown") + pm("leaf", 60, 13, 26, 12, "leaf", { r: -25 }) + pm("blob", 45, 58, 84, 80, c || "red") + pm("leaf", 28, 44, 18, 8, "white", { r: -60, opacity: 0.5, stroke: false }); } },
    book: { w: 120, d: function (c) { var b = col(c, C.navy); return pm("rect", 63, 57, 104, 80, "cream", { tex: "card" }) + pm("rect", 58, 52, 104, 80, b, { tex: "card" }) + pm("rect", 12, 52, 12, 80, shade(b, 0.8)) + pm("rect", 63, 40, 60, 14, "mustard") + pm("rect", 63, 60, 40, 6, "cream", { stroke: false }); } },
    lightbulb: { w: 80, d: function (c) { return pm("circle", 40, 40, 72, 72, c || "yellow") + pm("rect", 40, 78, 30, 14, "grey") + pm("rect", 40, 90, 22, 11, "slate", { edge: "zig" }) + inkP("M32 56 L36 40 L40 52 L44 40 L48 56", 2.2, "mustard") + pm("leaf", 26, 26, 22, 9, "white", { r: -55, opacity: 0.6, stroke: false }); } },
    coin: { w: 90, d: function (c) { return pm("circle", 45, 50, 88, 88, "mustard") + pm("circle", 45, 50, 66, 66, c || "yellow") + textMarkup("$", 45, 66, 44, shade(C.mustard, 0.75), F_BOLD); } },
    money: { w: 150, d: function (c) { var g = col(c, C.lime); return pm("round", 75, 50, 146, 74, g) + '<rect x="12" y="22" width="126" height="56" rx="4" fill="none" stroke="' + shade(g, 0.72) + '" stroke-width="2"/>' + pm("circle", 75, 50, 36, 36, shade(g, 0.85)) + textMarkup("$", 75, 63, 34, C.cream, F_BOLD); } },
    heart: { w: 100, d: function (c) { return pm("heart", 50, 52, 96, 90, c || "red") + pm("leaf", 30, 30, 20, 9, "white", { r: -40, opacity: 0.45, stroke: false }); } },
    flower: { w: 70, d: function (c) {
      var s = pm("rect", 35, 74, 6, 54, "leaf") + pm("leaf", 22, 76, 26, 12, "leaf", { r: 30 }) + pm("leaf", 48, 66, 26, 12, "green", { r: -30 }), i;
      for (i = 0; i < 6; i++) { var a = (i / 6) * 2 * PI; s += pm("circle", 35 + Math.cos(a) * 14, 30 + Math.sin(a) * 14, 20, 20, c || "pink"); }
      return s + pm("circle", 35, 30, 18, 18, "yellow");
    } },
    mountain: { w: 140, d: function (c) { return pp([[0, 100], [52, 14], [84, 58], [104, 32], [140, 100]], c || "slate") + pp([[41, 32], [52, 14], [64, 33], [57, 29], [52, 37], [46, 29]], "white") + pp([[97, 43], [104, 32], [112, 44], [104, 41]], "white"); } },
    fish: { w: 130, d: function (c) { var b = col(c, C.orange); return pp([[6, 22], [36, 50], [6, 78]], shade(b, 0.85)) + pm("ellipse", 72, 50, 96, 56, b) + pm("leaf", 72, 26, 30, 12, "tomato", { r: -18 }) + pm("rect", 58, 50, 6, 44, shade(b, 1.2), { stroke: false, opacity: 0.6 }) + pm("circle", 100, 44, 14, 14, "white") + dotM(102, 44, 3.6) + inkP("M114 58 q4 2 6 -1", 1.8); } },
    cup: { w: 100, d: function (c) { var b = c || "teal"; return pm("ellipse", 46, 92, 86, 14, "cream") + pm("ring", 80, 54, 32, 36, b) + pp([[14, 24], [78, 24], [72, 88], [20, 88]], b) + pm("rect", 46, 44, 58, 8, "cream", { stroke: false }) + inkP("M36 18 q-6 -6 0 -12 M52 18 q-6 -6 0 -12", 2, "white", 0.8); } },
    clock: { w: 100, d: function (c) {
      var s = pm("circle", 50, 52, 96, 96, c || "red") + pm("circle", 50, 52, 78, 78, "cream", { tex: "card" }), i;
      for (i = 0; i < 12; i++) { var a = (i / 12) * 2 * PI; s += dotM(50 + Math.cos(a) * 32, 52 + Math.sin(a) * 32, i % 3 ? 1.4 : 2.6); }
      return s + inkP("M50 52 L50 30", 4) + inkP("M50 52 L66 58", 4) + dotM(50, 52, 3.4, "red");
    } },
    globe: { w: 100, d: function (c) { return pm("rect", 50, 95, 50, 8, "brown") + pm("rect", 50, 87, 8, 14, "brown") + pm("circle", 50, 44, 82, 82, c || "sky") + pm("blob", 36, 32, 32, 24, "leaf") + pm("blob", 62, 56, 32, 22, "leaf") + pm("blob", 64, 22, 16, 10, "leaf"); } },
    gift: { w: 100, d: function (c) { var b = col(c, C.red); return pm("rect", 50, 66, 80, 62, b) + pm("rect", 50, 36, 92, 18, shade(b, 0.88)) + pm("rect", 50, 62, 14, 70, "yellow") + pm("leaf", 37, 20, 28, 14, "yellow", { r: 25 }) + pm("leaf", 63, 20, 28, 14, "yellow", { r: -25 }) + pm("circle", 50, 25, 10, 10, "mustard"); } },
    trophy: { w: 90, d: function (c) { return pm("ring", 18, 32, 30, 36, "mustard") + pm("ring", 72, 32, 30, 36, "mustard") + pp([[18, 8], [72, 8], [66, 46], [54, 58], [36, 58], [24, 46]], c || "yellow") + pm("rect", 45, 68, 10, 18, "mustard") + pm("rect", 45, 88, 46, 16, "brown") + pm("star", 45, 30, 22, 22, "white", { opacity: 0.8 }); } },
    cake: { w: 110, d: function (c) { return pm("ellipse", 55, 94, 106, 10, "cream") + pm("rect", 55, 72, 92, 40, c || "pink") + pm("rect", 55, 74, 92, 6, "cream", { stroke: false }) + pm("wave", 55, 54, 94, 16, "white") + pm("rect", 55, 36, 8, 24, "sky") + pm("drop", 55, 17, 12, 18, "orange") + pm("circle", 32, 50, 9, 9, "red") + pm("circle", 78, 50, 9, 9, "red"); } },
    laptop: { w: 140, d: function (c) { return pm("round", 70, 42, 106, 70, "slate") + pm("rect", 70, 42, 92, 56, c || "sky", { tex: "card" }) + pp([[4, 80], [136, 80], [126, 94], [14, 94]], "grey") + pm("rect", 70, 84, 30, 4, "slate", { stroke: false }); } },
    drop: { w: 70, d: function (c) { return pm("drop", 35, 52, 64, 92, c || "sky") + pm("leaf", 24, 56, 18, 8, "white", { r: -70, opacity: 0.6, stroke: false }); } },
    leaf: { w: 90, d: function (c) { return pm("leaf", 45, 50, 88, 44, c || "leaf", { r: -28 }) + inkP("M10 70 L80 30", 2, "lime", 0.9); } },
    flame: { w: 80, d: function (c) { return pm("drop", 40, 52, 76, 94, "red") + pm("drop", 40, 60, 56, 74, c || "orange") + pm("drop", 40, 70, 30, 44, "yellow"); } },
    bolt: { w: 70, d: function (c) { return pp([[44, 2], [8, 58], [32, 58], [22, 98], [62, 38], [38, 38], [54, 2]], c || "yellow"); } },
    bread: { w: 130, d: function (c) { var b = col(c, C.mustard); return pm("rect", 65, 70, 118, 34, shade(b, 0.86)) + pm("hill", 65, 46, 122, 54, b) + pm("leaf", 40, 44, 22, 8, "sand", { r: -30 }) + pm("leaf", 65, 40, 22, 8, "sand", { r: -30 }) + pm("leaf", 90, 44, 22, 8, "sand", { r: -30 }); } },
    carrot: { w: 70, d: function (c) { return pm("leaf", 28, 14, 30, 12, "leaf", { r: -60 }) + pm("leaf", 42, 13, 30, 12, "green", { r: -115 }) + pp([[14, 26], [56, 26], [36, 98]], c || "orange") + inkP("M24 44 L32 44 M30 60 L38 60 M28 76 L34 76", 1.8, "tomato"); } },
    pizza: { w: 110, d: function (c) { return pp([[8, 16], [102, 16], [55, 98]], c || "yellow") + pm("pill", 55, 15, 100, 14, "wood") + pm("circle", 40, 34, 16, 16, "red") + pm("circle", 68, 38, 14, 14, "red") + pm("circle", 54, 60, 13, 13, "red") + pm("leaf", 46, 48, 10, 5, "leaf", { r: 20 }); } },
    battery: { w: 60, d: function (c) { return pm("rect", 30, 8, 18, 10, "slate") + pm("round", 30, 56, 52, 88, c || "lime") + pm("rect", 30, 30, 52, 16, "ink") + pp([[34, 52], [22, 70], [30, 70], [26, 86], [40, 66], [32, 66], [36, 52]], "yellow"); } },
    magnet: { w: 100, d: function (c) {
      var pts = [], i, R1 = 44, R2 = 22;
      for (i = 0; i <= 16; i++) { var a = PI + (i / 16) * PI; pts.push([50 + Math.cos(a) * R1, 54 + Math.sin(a) * R1]); }
      pts.push([94, 96]); pts.push([72, 96]);
      for (i = 16; i >= 0; i--) { var a2 = PI + (i / 16) * PI; pts.push([50 + Math.cos(a2) * R2, 54 + Math.sin(a2) * R2]); }
      pts.push([28, 96]); pts.push([6, 96]);
      return pp(pts, c || "red") + pm("rect", 17, 88, 22, 16, "grey") + pm("rect", 83, 88, 22, 16, "grey");
    } },
    phone: { w: 64, d: function (c) { return pm("round", 32, 50, 56, 96, "ink") + pm("rect", 32, 46, 46, 72, c || "sky", { tex: "card" }) + dotM(32, 90, 3, "grey"); } },
    tooth: { w: 80, d: function (c) { return pp([[10, 20], [22, 8], [40, 14], [58, 8], [70, 20], [66, 50], [60, 92], [50, 94], [44, 62], [36, 62], [30, 94], [20, 92], [14, 50]], c || "white") + pm("leaf", 24, 26, 16, 7, "sky", { r: -40, opacity: 0.5, stroke: false }); } }
  };
  var PROP_ALIAS = {
    idea: "lightbulb", ideas: "lightbulb", bulb: "lightbulb", think: "lightbulb", light: "lightbulb", water: "drop", rain: "drop", wet: "drop",
    fire: "flame", hot: "flame", heat: "flame", time: "clock", hour: "clock", hours: "clock", minute: "clock", world: "globe", earth: "globe", global: "globe",
    cash: "money", dollars: "money", pay: "money", salary: "money", bill: "money", coins: "coin", penny: "coin", energy: "bolt", power: "bolt",
    electricity: "bolt", lightning: "bolt", love: "heart", health: "heart", like: "heart", plant: "flower", plants: "flower", garden: "flower", grow: "flower", growth: "flower",
    ship: "boat", sail: "boat", airplane: "plane", flight: "plane", fly: "plane", travel: "plane", computer: "laptop", internet: "laptop", code: "laptop",
    mobile: "phone", smartphone: "phone", call: "phone", app: "phone", prize: "trophy", award: "trophy", win: "trophy", winner: "trophy", success: "trophy",
    present: "gift", birthday: "cake", party: "cake", read: "book", reading: "book", study: "book", learn: "book", school: "book", books: "book",
    fruit: "apple", vegetable: "carrot", veg: "carrot", city: "house", town: "house", home: "house", building: "house", forest: "pine", nature: "tree",
    sunlight: "sun", sunny: "sun", day: "sun", night: "moon", space: "rocket", launch: "rocket", weather: "cloud", hill: "mountain", mountains: "mountain",
    tea: "cup", coffee: "cup", drink: "cup", teeth: "tooth", dentist: "tooth", stars: "star", famous: "star", wheat: "bread", leaves: "leaf", autumn: "leaf",
    cars: "car", drive: "car", traffic: "car", sea: "fish", ocean: "fish", food: "pizza", charge: "battery", attract: "magnet", trees: "tree"
  };
  function propKey(name) {
    var n = normWord(name);
    if (PROPS[n]) return n;
    if (PROP_ALIAS[n]) return PROP_ALIAS[n];
    if (n.length > 3 && /s$/.test(n) && PROPS[n.slice(0, -1)]) return n.slice(0, -1);
    if (n.length > 4 && /es$/.test(n) && PROPS[n.slice(0, -2)]) return n.slice(0, -2);
    return null;
  }
  // ------------------------- icons (for stickers) -------------------------
  function glyph(ch, c) { return textMarkup(ch, 50, 72, 66, col(c), F_BOLD); }
  var ICONS = {
    check: function (c) { return pp([[18, 52], [31, 39], [44, 53], [70, 22], [84, 35], [44, 80]], c); },
    cross: function (c) { return pm("rect", 50, 50, 18, 78, c, { r: 45 }) + pm("rect", 50, 50, 18, 78, c, { r: -45 }); },
    plus: function (c) { return pm("rect", 50, 50, 18, 72, c) + pm("rect", 50, 50, 72, 18, c); },
    minus: function (c) { return pm("rect", 50, 50, 72, 18, c); },
    up: function (c) { return pm("arrow", 50, 50, 74, 58, c, { r: -90 }); },
    down: function (c) { return pm("arrow", 50, 50, 74, 58, c, { r: 90 }); },
    right: function (c) { return pm("arrow", 50, 50, 74, 58, c); },
    question: function (c) { return glyph("?", c); },
    exclaim: function (c) { return glyph("!", c); },
    dollar: function (c) { return glyph("$", c); },
    percent: function (c) { return glyph("%", c); },
    hash: function (c) { return glyph("#", c); },
    person: function (c) { return pm("circle", 50, 30, 30, 30, c) + pm("hill", 50, 70, 58, 36, c); },
    people: function (c) { return pm("circle", 32, 36, 22, 22, shade(col(c), 1.2)) + pm("hill", 32, 70, 42, 28, shade(col(c), 1.2)) + pm("circle", 66, 32, 26, 26, c) + pm("hill", 66, 72, 50, 34, c); },
    chart: function (c) { return pm("rect", 28, 64, 16, 32, c) + pm("rect", 50, 54, 16, 52, c) + pm("rect", 72, 42, 16, 76, c); },
    music: function (c) { return pm("ellipse", 38, 74, 26, 18, c, { r: -20 }) + pm("rect", 48, 46, 6, 56, c) + pm("leaf", 60, 24, 28, 11, c, { r: 32 }); },
    key: function (c) { return pm("ring", 30, 50, 34, 34, c) + pm("rect", 62, 50, 44, 9, c) + pm("rect", 78, 58, 6, 12, c) + pm("rect", 68, 58, 6, 9, c); },
    lock: function (c) { return pm("ring", 50, 36, 40, 44, c) + pm("round", 50, 64, 56, 40, c) + dotM(50, 62, 4, "cream"); },
    bell: function (c) { return pm("hill", 50, 50, 56, 56, c) + pm("rect", 50, 70, 70, 10, c) + pm("circle", 50, 80, 12, 12, c); },
    gear: function (c) { return pm("burst", 50, 50, 80, 80, c) + pm("circle", 50, 50, 26, 26, "cream"); },
    eye: function (c) { return pm("leaf", 50, 50, 84, 48, "white") + pm("circle", 50, 50, 30, 30, c) + dotM(50, 50, 7); },
    chat: function (c) { return pm("tri", 32, 72, 22, 26, c, { r: 200 }) + pm("round", 50, 44, 78, 52, c) + dotM(34, 44, 4, "cream") + dotM(50, 44, 4, "cream") + dotM(66, 44, 4, "cream"); },
    mail: function (c) { return pm("rect", 50, 52, 78, 54, c) + inkP("M12 26 L50 56 L88 26", 3, "cream"); },
    pin: function (c) { return pm("drop", 50, 46, 50, 72, c, { r: 180 }) + pm("circle", 50, 38, 18, 18, "cream"); },
    flag: function (c) { return pm("rect", 26, 54, 6, 84, "brown") + pm("banner", 56, 32, 54, 34, c); },
    shield: function (c) { return pp([[50, 10], [84, 22], [80, 58], [50, 90], [20, 58], [16, 22]], c) + pp([[50, 24], [70, 32], [68, 56], [50, 76]], "cream", { opacity: 0.4, stroke: false }); },
    bag: function (c) { return pm("ring", 50, 32, 34, 34, c) + pm("rect", 50, 62, 66, 54, c); },
    cart: function (c) { return pp([[14, 26], [86, 30], [76, 64], [26, 64]], c) + pm("circle", 34, 78, 14, 14, "ink") + pm("circle", 70, 78, 14, 14, "ink"); },
    home: function (c) { return pm("rect", 50, 64, 56, 44, c) + pm("tri", 50, 34, 76, 32, shade(col(c), 0.8)) + pm("rect", 50, 74, 14, 24, "cream"); },
    clock: function (c) { return pm("circle", 50, 50, 76, 76, c) + pm("circle", 50, 50, 58, 58, "cream") + inkP("M50 50 L50 30 M50 50 L64 56", 4); }
  };
  var ICON_ALIAS = {
    yes: "check", correct: "check", done: "check", ok: "check", right: "check", true: "check", tick: "check", no: "cross", wrong: "cross", x: "cross", bad: "cross", false: "cross", stop: "cross",
    add: "plus", more: "plus", less: "minus", growth: "up", increase: "up", rise: "up", grow: "up", decrease: "down", fall: "down", drop: "down", next: "right", go: "right",
    why: "question", how: "question", what: "question", ask: "question", warning: "exclaim", danger: "exclaim", important: "exclaim", alert: "bell", price: "dollar", cost: "dollar",
    you: "person", me: "person", user: "person", man: "person", woman: "person", team: "people", friends: "people", crowd: "people", family: "people", data: "chart", graph: "chart",
    stats: "chart", song: "music", secure: "lock", safe: "lock", security: "lock", privacy: "lock", notification: "bell", settings: "gear", machine: "gear", engine: "gear", work: "gear",
    see: "eye", look: "eye", vision: "eye", watch: "eye", talk: "chat", message: "chat", speech: "chat", say: "chat", email: "mail", letter: "mail", location: "pin", place: "pin",
    map: "pin", goal: "flag", finish: "flag", protect: "shield", defence: "shield", defense: "shield", shopping: "bag", shop: "bag", buy: "cart", tag: "hash"
  };
  var STICKER_RINGS = ["red", "teal", "mustard", "navy", "purple", "green", "orange"];
  function iconKey(name) { var n = normWord(name); if (ICONS[n]) return n; if (ICON_ALIAS[n]) return ICON_ALIAS[n]; if (/s$/.test(n) && ICONS[n.slice(0, -1)]) return n.slice(0, -1); return null; }
  function stickerMarkup(name, ringC) {
    var rc = col(ringC, C.red), k = iconKey(name), s = pm("circle", 50, 50, 100, 100, rc, { tex: "card" }) + pm("circle", 50, 50, 84, 84, "cream", { tex: "card" });
    if (k) return s + '<g transform="translate(14 14) scale(0.72)">' + ICONS[k](shade(rc, 0.9)) + "</g>";
    var word = plainText(name).slice(0, 14) || "?";
    var fit = fitInk(word, 74, 60, 30, { family: F_BOLD, weight: "normal", maxLines: 2, lh: 1.05 });
    return s + inkLinesMarkup(fit.lines, 50, 50 - (fit.h / 2) + fit.size * 0.82, fit.size, { family: F_BOLD, weight: "normal", color: shade(rc, 0.85), underline: false, lh: 1.05 });
  }
  function propMarkup(name, colr) {
    var k = propKey(name);
    if (k) return PROPS[k].d(colr ? col(colr) : null);
    return stickerMarkup(name, colr);
  }
  function propWidth(name) { var k = propKey(name); return k ? PROPS[k].w : 100; }
  var SKY_PROPS = { sun: 1, cloud: 1, moon: 1, star: 1, planet: 1, plane: 1, bolt: 1 };
  function isSkyProp(name) { var k = propKey(name); return !!(k && SKY_PROPS[k]); }
  // A template prop replaces the set's own copy (one sun, one moon...).
  function hideScenery(name) { var k = propKey(name); if (!k || !st || !st.scenery[k]) return; st.scenery[k].forEach(function (p) { p.hidden = true; }); }
  // S.prop(name, { parent, x, y, size, ground, r, color, hang })
  var stickerN = 0;
  function prop(name, o) {
    o = obj(o);
    var s = ensure();
    var size = num(o.size, u(200)), k = propKey(name), pw = k ? PROPS[k].w : 100, sc = size / 100, w = pw * sc;
    var html = k ? PROPS[k].d(o.color ? col(o.color) : null) : stickerMarkup(name, o.color || STICKER_RINGS[stickerN++ % STICKER_RINGS.length]);
    var ay = o.ground ? 1 : 0.5, y = num(o.y, H / 2);
    if (o.hang) {
      var topY = y - ay * size, len = (topY + u(60)) / sc;
      html = '<path d="M' + f1(pw / 2) + " " + f1(-len) + "L" + f1(pw / 2) + ' 6" stroke="#EFE6D2" stroke-width="' + f2(1.4 / Math.max(0.4, sc)) + '" fill="none"/>' + html;
    }
    var box = svgBox(w, size, { scale: sc * (1), html: html });
    box.setAttribute("viewBox", "0 0 " + f2(pw) + " 100");
    var scenery = o.kind === false || o.kind === null;
    var p = makePiece(box, { parent: o.parent || "front", x: num(o.x, W / 2), y: y, w: w, h: size, ax: 0.5, ay: ay, r: num(o.r, 0), kind: scenery ? null : o.kind || "prop", label: str(name), shadow: o.shadow });
    if (scenery && k) { (s.scenery[k] = s.scenery[k] || []).push(p._p); }
    p._p.shapeEl = box;
    p.isSticker = !k;
    return p;
  }

  // ------------------------- puppets -------------------------
  // Rig units: feet at y = 0, an adult is 200 units tall. Joint groups: smp-j-<name>.
  var MOUTH_DARK = "#4A1F1A", TONGUE = "#D9576A";
  function pa(points, c, o) { return pp(points, c, o); }
  function brass(x, y, r) {
    r = r || 3.4;
    return '<g><circle cx="' + f1(x + 0.6) + '" cy="' + f1(y + 0.9) + '" r="' + f1(r) + '" fill="#2A1A0A" opacity="0.3"/><circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="' + f1(r) + '" fill="#B8862E"/><circle cx="' + f1(x - 0.3) + '" cy="' + f1(y - 0.3) + '" r="' + f1(r * 0.68) + '" fill="#E2B85A"/><ellipse cx="' + f1(x - r * 0.3) + '" cy="' + f1(y - r * 0.35) + '" rx="' + f1(r * 0.3) + '" ry="' + f1(r * 0.18) + '" fill="#FFF4CF" opacity="0.9"/></g>';
  }
  function mouthSet(mx, my, k) {
    k = k || 1;
    function g(name, inner) { return '<g class="smp-m-' + name + '" display="' + (name === "closed" ? "inline" : "none") + '">' + inner + "</g>"; }
    var s = "";
    var sm = [];
    for (var i = 0; i <= 8; i++) { var a = PI * 0.15 + (i / 8) * PI * 0.7; sm.push([mx + Math.cos(a) * 10 * k, my - 6 * k + Math.sin(a) * 8 * k]); }
    for (i = 8; i >= 0; i--) { var a2 = PI * 0.15 + (i / 8) * PI * 0.7; sm.push([mx + Math.cos(a2) * 10 * k, my - 6 * k + Math.sin(a2) * 8 * k - 2.8 * k]); }
    s += g("closed", pa(sm, MOUTH_DARK, { stroke: false, tex: "none" }));
    s += g("small", pm("ellipse", mx, my, 12 * k, 8 * k, MOUTH_DARK, { tex: "none" }) + pm("ellipse", mx, my + 2 * k, 7 * k, 3 * k, TONGUE, { tex: "none", stroke: false }));
    var dp = [[mx - 11 * k, my - 6 * k], [mx + 11 * k, my - 6 * k]];
    for (i = 1; i < 10; i++) { var a3 = (i / 10) * PI; dp.push([mx + Math.cos(a3) * 11 * k, my - 6 * k + Math.sin(a3) * 16 * k]); }
    s += g("wide", pa(dp, MOUTH_DARK, { tex: "none" }) + pm("rect", mx, my - 4.2 * k, 17 * k, 3.6 * k, "white", { tex: "none", stroke: false }) + pm("ellipse", mx, my + 6 * k, 11 * k, 5 * k, TONGUE, { tex: "none", stroke: false }));
    s += g("round", pm("ellipse", mx, my, 10 * k, 13 * k, MOUTH_DARK, { tex: "none" }) + pm("ellipse", mx, my + 3.5 * k, 6 * k, 3.5 * k, TONGUE, { tex: "none", stroke: false }));
    s += g("ee", pm("pill", mx, my, 22 * k, 8 * k, MOUTH_DARK, { tex: "none" }) + pm("rect", mx, my - 1.2 * k, 17 * k, 3 * k, "white", { tex: "none", stroke: false }));
    return s;
  }
  function eyesSet(cx, cy, o) {
    o = o || {};
    var dx = o.dx || 12, rx = o.rx || 12.5, ry = o.ry || 14, pr = o.pr || 3.8;
    var open = pm("ellipse", cx - dx, cy, rx * 2, ry * 2, "white", { tex: "card" }) + pm("ellipse", cx + dx, cy, rx * 2, ry * 2, "white", { tex: "card" });
    var pup = '<g class="smp-pupils">' + dotM(cx - dx + 3, cy + 1, pr, o.pupil || C.ink) + dotM(cx + dx + 3, cy + 1, pr, o.pupil || C.ink) + dotM(cx - dx + 2, cy, pr * 0.35, "white") + dotM(cx + dx + 2, cy, pr * 0.35, "white") + "</g>";
    var closed = inkP("M" + f1(cx - dx - rx * 0.8) + " " + f1(cy + 1) + "q" + f1(rx * 0.8) + " 5 " + f1(rx * 1.6) + " 0", 2.4) + inkP("M" + f1(cx + dx - rx * 0.8) + " " + f1(cy + 1) + "q" + f1(rx * 0.8) + " 5 " + f1(rx * 1.6) + " 0", 2.4);
    return '<g class="smp-eyes-open">' + open + pup + '</g><g class="smp-eyes-closed" display="none">' + closed + "</g>";
  }
  function armMarkup(side, P, top, sleeveF, hand) {
    var x = side * P.shX, y = P.shY, e = y + P.upL, hx = x, hy = e + P.foreL + 2;
    var up = pm("pill", x, y + P.upL / 2, P.armW, P.upL + P.armW * 0.8, top, { pattern: P.pattern });
    var fo = pm("pill", x, e + P.foreL / 2, P.armW * 0.92, P.foreL + P.armW * 0.7, sleeveF, { pattern: sleeveF === top ? P.pattern : null }) + pm("circle", hx, hy, 15, 15, hand);
    var nm = side > 0 ? "F" : "B";
    return '<g class="smp-j-arm' + nm + '">' + up + brass(x, y + 2) + '<g class="smp-j-fore' + nm + '">' + fo + brass(x, e) + "</g></g>";
  }
  function legMarkup(side, P, legC, shoeC) {
    var x = side * 11, nm = side > 0 ? "F" : "B";
    return '<g class="smp-j-leg' + nm + '">' + pm("rect", x, P.hipY + P.legL / 2 - 1, P.legW || 18, P.legL + 4, legC, { pattern: P.legPattern }) + pm("ellipse", x + 5, -5, 28, 13, shoeC) + "</g>";
  }
  var BODY = {
    adult: { hipY: -60, legL: 60, shY: -114, top: -122, bot: -50, wt: 58, wb: 62, shX: 28, upL: 30, foreL: 27, armW: 14, neckY: -120, hcY: -160, hw: 92, hh: 80 },
    kid: { hipY: -42, legL: 42, shY: -87, top: -94, bot: -34, wt: 50, wb: 54, shX: 24, upL: 23, foreL: 21, armW: 13, neckY: -92, hcY: -128, hw: 88, hh: 76 }
  };
  function personMarkup(c) {
    var P = Object.assign({}, BODY[c.body || "adult"], c.P || {});
    var hc = P.hcY, s = "";
    var torso = [[-P.wt / 2, P.top], [P.wt / 2, P.top], [P.wb / 2, P.bot], [-P.wb / 2, P.bot]];
    s += '<g class="smp-rig">';
    s += legMarkup(-1, P, c.legs, c.shoes) + legMarkup(1, P, c.legs, c.shoes);
    s += '<g class="smp-j-body">';
    if (c.behind) s += c.behind(P);
    s += armMarkup(-1, P, c.top, c.sleeve || c.top, c.skin);
    s += pa(c.torsoPts ? c.torsoPts(P) : torso, c.top, { pattern: c.topPattern });
    if (c.torsoExtra) s += c.torsoExtra(P);
    s += '<g class="smp-j-head">';
    if (c.behindHead) s += c.behindHead(P);
    s += pm("ellipse", 0, hc, P.hw, P.hh, c.skin, { tex: "card" });
    if (c.cheeks) s += pm("circle", -26, hc + 12, 14, 10, "pink", { tex: "none", stroke: false, opacity: 0.7 }) + pm("circle", 32, hc + 12, 14, 10, "pink", { tex: "none", stroke: false, opacity: 0.7 });
    s += eyesSet(4, hc - 6, c.eyes);
    if (c.face) s += c.face(P);
    s += mouthSet(7, hc + 24, c.mouthK || 1);
    if (c.hair) s += c.hair(P);
    s += "</g>";
    s += brass(0, P.neckY + 6, 3);
    s += armMarkup(1, P, c.top, c.sleeve || c.top, c.skin);
    s += "</g></g>";
    return s;
  }
  var CAST = {
    mo: { body: "kid", skin: "#E2AE80", top: "#EE8A3C", legs: "#2D4A6B", shoes: "#FBF8F1", cheeks: true,
      behind: function (P) { return pm("circle", 0, P.hcY + 6, P.hw + 10, P.hh + 6, "#D7722A"); },
      torsoExtra: function (P) { return pm("round", 0, P.bot - 13, 32, 15, "#D7722A") + inkP("M-7 " + (P.top + 2) + " l-1 16 M7 " + (P.top + 2) + " l1 16", 1.8, "cream"); },
      hair: function (P) { return pm("cloud", 4, P.hcY - 30, 74, 30, "#4A3020") + pm("leaf", 20, P.hcY - 40, 22, 10, "#4A3020", { r: -40 }); } },
    pip: { body: "kid", skin: "#F2C9A5", top: "#F2C14E", sleeve: "#F2C9A5", legs: "#F2C9A5", shoes: "#D9472B", cheeks: true, topPattern: "dots",
      P: { legW: 12, bot: -26 },
      torsoPts: function (P) { return [[-P.wt / 2 + 2, P.top], [P.wt / 2 - 2, P.top], [P.wb / 2 + 16, P.bot], [-P.wb / 2 - 16, P.bot]]; },
      torsoExtra: function (P) { return pa([[-12, P.top], [0, P.top + 10], [12, P.top], [10, P.top - 3], [-10, P.top - 3]], "white"); },
      behindHead: function (P) { return pm("circle", -46, P.hcY + 8, 30, 30, "#5A3A24") + pm("circle", 50, P.hcY + 8, 30, 30, "#5A3A24") + pm("tri", -40, P.hcY - 8, 12, 14, "red", { r: -90 }) + pm("tri", 44, P.hcY - 8, 12, 14, "red", { r: 90 }); },
      hair: function (P) { return pm("cloud", 2, P.hcY - 26, 86, 34, "#5A3A24"); } },
    otto: { body: "adult", skin: "#EBC0A0", top: "#8A6A4A", legs: "#6E6A66", shoes: "#4A3020", topPattern: "tweed",
      P: { hcY: -156, hh: 78 },
      torsoExtra: function (P) { return pa([[-10, P.top], [10, P.top], [0, P.top + 22]], "cream") + dotM(0, P.top + 32, 2.2, "cream") + dotM(0, P.top + 46, 2.2, "cream"); },
      behindHead: function (P) { return pm("circle", -46, P.hcY + 4, 18, 22, "#EBC0A0") + pm("circle", 50, P.hcY + 4, 18, 22, "#EBC0A0"); },
      face: function (P) { return pm("ellipse", 12, P.hcY + 10, 16, 14, "#DFA584") + pm("cloud", 8, P.hcY + 18, 44, 16, "white") + inkP("M-20 " + (P.hcY - 7) + "a12 12 0 1 0 24 0a12 12 0 1 0 -24 0M8 " + (P.hcY - 7) + "a12 12 0 1 0 24 0a12 12 0 1 0 -24 0M4 " + (P.hcY - 8) + "l4 0", 2.2) + pm("rect", -8, P.hcY - 24, 18, 5, "white", { r: -6 }) + pm("rect", 18, P.hcY - 24, 18, 5, "white", { r: 6 }); },
      hair: function (P) { return pm("round", 2, P.hcY - 30, 90, 26, "#7A6A55", { pattern: "tweed" }) + pm("ellipse", 32, P.hcY - 20, 44, 12, "#5E5040"); } },
    ada: { body: "adult", skin: "#A86B45", top: "#FBF8F1", legs: "#5E6670", shoes: "#2A211C",
      P: { bot: -36 },
      torsoExtra: function (P) { return pa([[-12, P.top], [12, P.top], [0, P.top + 26]], "#B9A2CF") + pa([[-12, P.top], [-2, P.top + 30], [-14, P.top + 34], [-22, P.top + 4]], "#E9E2D2") + pa([[12, P.top], [2, P.top + 30], [14, P.top + 34], [22, P.top + 4]], "#E9E2D2") + pm("rect", 18, P.top + 44, 14, 12, "#E9E2D2") + pm("rect", 15, P.top + 37, 3, 10, "red", { stroke: false }) + pm("rect", 20, P.top + 37, 3, 10, "navy", { stroke: false }); },
      face: function (P) { return inkP("M-20 " + (P.hcY - 7) + "a12 12 0 1 0 24 0a12 12 0 1 0 -24 0M8 " + (P.hcY - 7) + "a12 12 0 1 0 24 0a12 12 0 1 0 -24 0M4 " + (P.hcY - 8) + "l4 0", 2.4, "purple"); },
      hair: function (P) { return pm("circle", 2, P.hcY - 52, 32, 30, "#7A5A9A") + pm("cloud", 0, P.hcY - 28, 92, 34, "#7A5A9A"); } },
    leo: { body: "adult", skin: "#E0A878", top: "#FBF8F1", legs: "#8E949C", shoes: "#2A211C", P: { legPattern: "check" },
      torsoExtra: function (P) { var s = pa([[-14, P.top], [14, P.top], [0, P.top + 16]], "red"); for (var i = 0; i < 3; i++) s += dotM(-9, P.top + 26 + i * 14, 2.4, "slate") + dotM(9, P.top + 26 + i * 14, 2.4, "slate"); return s; },
      face: function (P) { return pm("leaf", 8, P.hcY + 15, 32, 9, "#4A3020"); },
      hair: function (P) { return pm("cloud", 0, P.hcY - 68, 82, 56, "white", { tex: "card" }) + pm("rect", 0, P.hcY - 38, 72, 18, "white", { tex: "card" }); } }
  };
  var ANIMALS = { biscuit: 1, mittens: 1, hoot: 1 };
  function dogMarkup(cat) {
    var body = cat ? "#9A958C" : "#C8955A", dark = shade(body, 0.8), s = '<g class="smp-rig">';
    function leg(nm, x, c) { return '<g class="smp-j-' + nm + '">' + pm("rect", x, -20, cat ? 9 : 11, 42, c) + pm("ellipse", x + 3, -3, 16, 9, c) + "</g>"; }
    s += '<g class="smp-j-tail">' + (cat ? pm("leaf", -50, -82, 14, 58, body, { r: -14, pattern: "stripe" }) : pm("leaf", -58, -62, 36, 12, body, { r: -45 })) + "</g>";
    s += leg("legB", -32, dark) + leg("armB", 18, dark);
    s += '<g class="smp-j-body">';
    s += pm("ellipse", -6, -46, cat ? 76 : 88, cat ? 36 : 44, body, { pattern: cat ? "stripe" : null }) + pm("ellipse", -4, -36, 48, 16, "cream", { stroke: false });
    s += "</g>";
    s += leg("legF", -20, body) + leg("armF", 28, body);
    s += brass(-20, -40, 2.8) + brass(28, -40, 2.8);
    s += '<g class="smp-j-head">';
    if (cat) {
      s += pm("tri", 24, -100, 16, 20, body, { r: -12 }) + pm("tri", 48, -101, 16, 20, body, { r: 14 }) + pm("tri", 24, -98, 7, 10, "pink", { r: -12, stroke: false });
      s += pm("circle", 36, -80, 46, 42, body, { pattern: "stripe" }) + pm("ellipse", 46, -70, 22, 13, "cream");
      s += '<g class="smp-eyes-open">' + pm("ellipse", 32, -84, 11, 12, "#C9D45A", { tex: "none" }) + pm("ellipse", 47, -84, 11, 12, "#C9D45A", { tex: "none" }) + '<g class="smp-pupils">' + pm("ellipse", 34, -84, 3, 9, "ink", { tex: "none", stroke: false }) + pm("ellipse", 49, -84, 3, 9, "ink", { tex: "none", stroke: false }) + "</g></g>";
      s += '<g class="smp-eyes-closed" display="none">' + inkP("M27 -84 q5 3 10 0 M42 -84 q5 3 10 0", 2) + "</g>";
      s += pm("tri", 47, -73, 7, 5, "pink", { r: 180, tex: "none" }) + inkP("M56 -70 l16 -3 M56 -67 l16 2 M38 -70 l-14 -3 M38 -67 l-14 2", 1, "cream", 0.9);
      s += '<g class="smp-j-jaw">' + pm("ellipse", 47, -63, 10, 6, MOUTH_DARK, { tex: "none" }) + pm("ellipse", 47, -61, 12, 5, "cream", { tex: "none" }) + "</g>";
    } else {
      s += pm("leaf", 20, -86, 32, 14, "#7A5233", { r: 75 });
      s += pm("circle", 38, -84, 50, 48, body) + pm("ellipse", 58, -75, 32, 20, "cream");
      s += '<g class="smp-j-jaw">' + pm("ellipse", 60, -65, 18, 9, MOUTH_DARK, { tex: "none" }) + pm("ellipse", 58, -63, 26, 9, "cream") + "</g>";
      s += pm("ellipse", 72, -81, 12, 9, "ink", { tex: "none" });
      s += '<g class="smp-eyes-open">' + pm("circle", 46, -93, 13, 13, "white", { tex: "none" }) + '<g class="smp-pupils">' + dotM(48, -93, 3.4) + "</g></g>";
      s += '<g class="smp-eyes-closed" display="none">' + inkP("M40 -92 q6 4 12 0", 2.2) + "</g>";
      s += pm("leaf", 28, -84, 30, 14, "#7A5233", { r: 82 }) + pm("rect", 24, -60, 10, 22, "red", { r: -20 });
    }
    s += "</g></g>";
    return s;
  }
  function owlMarkup() {
    var b = "#7A5233", s = '<g class="smp-rig">';
    s += pm("ellipse", -10, -3, 14, 8, "orange") + pm("ellipse", 12, -3, 14, 8, "orange");
    s += '<g class="smp-j-armB">' + pm("leaf", -34, -40, 18, 52, shade(b, 0.82), { r: 8 }) + "</g>";
    s += '<g class="smp-j-body">' + pm("ellipse", 0, -46, 72, 88, b) + pm("ellipse", 0, -38, 46, 56, "cream");
    for (var i = 0; i < 6; i++) s += inkP("M" + (-12 + (i % 3) * 12) + " " + (-50 + Math.floor(i / 3) * 14) + "l3 3 l3 -3", 1.6, "brown", 0.8);
    s += "</g>";
    s += '<g class="smp-j-head">' + pm("tri", -22, -98, 14, 20, b, { r: -18 }) + pm("tri", 22, -98, 14, 20, b, { r: 18 }) + pm("ellipse", 0, -80, 70, 42, b);
    s += pm("circle", -14, -78, 32, 32, "sand") + pm("circle", 14, -78, 32, 32, "sand");
    s += '<g class="smp-eyes-open"><g class="smp-googly-l">' + googlyMarkup(-14, -78, 12, 0, 4) + '</g><g class="smp-googly-r">' + googlyMarkup(14, -78, 12, 0, 4) + "</g></g>";
    s += '<g class="smp-eyes-closed" display="none">' + inkP("M-24 -78 q10 6 20 0 M4 -78 q10 6 20 0", 2.4) + "</g>";
    s += pm("tri", 0, -62, 12, 12, "orange", { r: 180 }) + '<g class="smp-j-jaw">' + pm("tri", 0, -55, 9, 6, "mustard", { r: 180 }) + "</g>";
    s += "</g>";
    s += '<g class="smp-j-armF">' + pm("leaf", 34, -40, 18, 52, shade(b, 0.9), { r: -8 }) + "</g>";
    s += brass(-28, -64, 2.8) + brass(28, -64, 2.8);
    return s + "</g>";
  }
  var CAST_NAMES = ["mo", "pip", "otto", "ada", "leo", "biscuit", "mittens", "hoot"];
  // Joints (rig units) and the height of each character, for layout.
  var JOINTS = {
    person: { adult: { shX: 28, shY: -114, el: -84, hip: -60, neck: -120 }, kid: { shX: 24, shY: -87, el: -64, hip: -42, neck: -92 } },
    dog: { neck: [30, -62], tail: [-46, -54], legs: { legB: -32, armB: 18, legF: -20, armF: 28 }, legY: -40, jaw: [50, -68] },
    cat: { neck: [30, -62], tail: [-44, -54], legs: { legB: -32, armB: 18, legF: -20, armF: 28 }, legY: -40, jaw: [47, -66] },
    owl: { neck: [0, -60], wings: [-28, 28], wingY: -64, jaw: [0, -58] }
  };
  function castHeight(name) {
    if (name === "biscuit") return 112; if (name === "mittens") return 106; if (name === "hoot") return 108;
    var c = CAST[name] || CAST.mo, P = Object.assign({}, BODY[c.body], c.P || {});
    return -(P.hcY - P.hh / 2) + (name === "leo" ? 46 : name === "ada" ? 22 : name === "otto" ? 6 : name === "pip" ? 2 : 6);
  }
  function castHalfWidth(name) { return ANIMALS[name] ? (name === "hoot" ? 50 : 75) : name === "pip" ? 62 : 58; }
  // Half width including a raised or pointing arm (rig units), for keeping gestures inside the safe area.
  function castReach(name) { return ANIMALS[name] ? (name === "hoot" ? 62 : 80) : 96; }
  var POSES = {
    rest: { sF: 8, eF: 12, sB: 8, eB: 12, head: 0 },
    wave: { sF: 145, eF: 24, sB: 8, eB: 12, head: -3, osc: "wave" },
    point: { sF: 86, eF: -6, sB: 10, eB: 14, head: 3 },
    cheer: { sF: 158, eF: 10, sB: 158, eB: 10, head: 0, osc: "bounce" },
    shrug: { sF: 26, eF: -98, sB: 26, eB: -98, head: 9 },
    think: { sF: 26, eF: 138, sB: 10, eB: 30, head: -6, lookY: -3 },
    present: { sF: 60, eF: -28, sB: 8, eB: 12, head: 3 },
    nod: { sF: 8, eF: 12, sB: 8, eB: 12, head: 0, osc: "nod" },
    shock: { sF: 118, eF: -35, sB: 118, eB: -35, head: 0, osc: "jump", wide: 1 }
  };
  var GESTURES = Object.keys(POSES).filter(function (k) { return k !== "rest"; });
  function visemeSeq(word) {
    var w = normWord(word), out = [], prev = null;
    for (var i = 0; i < w.length; i++) {
      var c = w[i], v = null;
      if (c === "a") v = "wide"; else if (c === "o" || c === "u") v = "round"; else if (c === "e" || c === "i") v = "ee"; else if (c === "y") v = "small";
      else if (c === "m" || c === "b" || c === "p") v = "closed"; else if (/[0-9]/.test(c)) v = "wide"; else v = prev === "small" ? null : "small";
      if (v && v !== prev) { out.push(v); prev = v; }
    }
    if (!out.length) out.push("small");
    if (out[out.length - 1] === "closed" && out.length > 1) out.push("small");
    return out;
  }
  var AMP = { closed: 0, small: 0.45, ee: 0.5, round: 0.75, wide: 1 };
  function puppet(name, o) {
    o = obj(o);
    var s = ensure();
    var nm = CAST_NAMES.indexOf(name) >= 0 ? name : "mo";
    var type = nm === "biscuit" ? "dog" : nm === "mittens" ? "cat" : nm === "hoot" ? "owl" : "person";
    var hpx = num(o.height, (TALL ? H * 0.3 : H * 0.5)), k = hpx / 200;
    var VBX = -125, VBY = -236, VBW = 250, VBH = 252;
    var html = type === "person" ? personMarkup(CAST[nm]) : type === "owl" ? owlMarkup() : dogMarkup(type === "cat");
    var w = VBW * k, h = VBH * k;
    var box = svgBox(w, h, { html: html });
    box.setAttribute("viewBox", VBX + " " + VBY + " " + VBW + " " + VBH);
    var x = num(o.x, W / 2), y = num(o.y, ensure().ground);
    var pc = makePiece(box, { parent: o.parent || "front", x: x, y: y, w: w, h: h, ax: -VBX / VBW, ay: -VBY / VBH, kind: "puppet", label: nm, shadow: 1, boil: 0.8 });
    var q = function (sel) { return box.querySelector(sel); };
    var g = {
      rig: q(".smp-rig"), body: q(".smp-j-body"), head: q(".smp-j-head"), armF: q(".smp-j-armF"), armB: q(".smp-j-armB"), foreF: q(".smp-j-foreF"), foreB: q(".smp-j-foreB"),
      legF: q(".smp-j-legF"), legB: q(".smp-j-legB"), tail: q(".smp-j-tail"), jaw: q(".smp-j-jaw"), open: q(".smp-eyes-open"), closed: q(".smp-eyes-closed"), pupils: q(".smp-pupils"),
      gl: q(".smp-googly-l"), gr: q(".smp-googly-r"), mouths: {}
    };
    ["closed", "small", "wide", "round", "ee"].forEach(function (m) { g.mouths[m] = q(".smp-m-" + m); });
    pc._p.shapeEl = g.rig;
    var seed = 31 + CAST_NAMES.indexOf(nm) * 17 + s.puppets.length * 5;
    var blinks = [], R = V.makeRand(seed), sb = 6 + Math.floor(R() * 14);
    while (sb < D * STEP + 2) { blinks.push(sb); sb += 22 + Math.floor(R() * 26); }
    var P = { name: nm, type: type, k: k, piece: pc, g: g, face0: num(o.face, 1) < 0 ? -1 : 1, turns: [], gestures: [], looks: [], talks: [], blinks: blinks, seed: seed, cache: {}, kid: type === "person" && CAST[nm].body === "kid", hpx: hpx };
    s.puppets.push(P);
    var api = {
      piece: pc, el: pc.el, svg: box, name: nm, height: castHeight(nm) * k, halfWidth: castHalfWidth(nm) * k, reach: castReach(nm) * k,
      talk: function (from, to) { P.talks.push([num(from, 0), num(to, D + 1)]); return api; },
      gesture: function (at, kind, dur) { var kk = POSES[kind] ? kind : "present"; P.gestures.push({ at: qt(num(at, 0)), kind: kk, dur: Math.max(0.3, num(dur, kk === "wave" || kk === "nod" ? 1.2 : 1.4)) }); P.gestures.sort(function (a, b) { return a.at - b.at; }); return api; },
      look: function (at, dir) { P.looks.push({ at: qt(num(at, 0)), dir: clamp(num(dir, 0), -1, 1) }); P.looks.sort(function (a, b) { return a.at - b.at; }); return api; },
      turn: function (at, face) { P.turns.push({ at: qt(num(at, 0)), f: num(face, 1) < 0 ? -1 : 1 }); P.turns.sort(function (a, b) { return a.at - b.at; }); return api; },
      enter: function (at, how) {
        how = how || "left";
        if (how === "left" || how === "right") pc.place(at, "hop", { dir: how === "left" ? "right" : "left", hops: 3, dur: 0.9, height: u(20) + hpx * 0.09 });
        else pc.place(at, how === "drop" ? "drop" : how === "pop" ? "pop" : how === "slide-up" ? "slide-up" : "hand");
        return api;
      },
      exit: function (at, dir) { pc.out(at, "hop", { dir: dir === "right" ? "right" : "left", hops: 3, dur: 0.9, height: u(20) + hpx * 0.09 }); return api; },
      hopTo: function (at, x2, y2, oo) { oo = obj(oo); pc.hopAbs(at, x2, y2 != null ? y2 : null, { hops: oo.hops || 3, height: oo.height || u(16) + hpx * 0.08, dur: oo.dur }); return api; },
      place: function (at, how) { pc.place(at, how || "drop"); return api; },
      _P: P
    };
    return api;
  }
  function setT(el, cache, key, val) { if (!el) return; if (cache[key] !== val) { el.setAttribute("transform", val); cache[key] = val; } }
  function setD(el, cache, key, on) { if (!el) return; if (cache[key] !== on) { el.setAttribute("display", on ? "inline" : "none"); cache[key] = on; } }
  function wordNow(ts) {
    var ws = V.words;
    for (var i = 0; i < ws.length; i++) { if (ts >= ws[i].start - 0.02 && ts < ws[i].end) return { w: ws[i], i: i }; if (ws[i].start > ts) break; }
    return null;
  }
  function rigApply(P, ts, si) {
    var p = P.piece._p;
    if (p._vis === false) return;
    var g = P.g, c = P.cache, A = Object.assign({}, POSES.rest), extra = { bob: 0, headY: 0, lookY: 0, wide: 0 };
    // gesture blend (in 0.3 s, hold, out 0.3 s) - stepped because ts is stepped
    for (var i = P.gestures.length - 1; i >= 0; i--) {
      var ge = P.gestures[i];
      if (ts < ge.at - 1e-9 || ts > ge.at + ge.dur + 0.3) continue;
      var wIn = clamp((ts - ge.at) / 0.3, 0, 1), wOut = clamp((ge.at + ge.dur + 0.3 - ts) / 0.3, 0, 1), wgt = smooth(Math.min(wIn, wOut));
      var G = POSES[ge.kind], tt = ts - ge.at;
      ["sF", "eF", "sB", "eB", "head"].forEach(function (key) { A[key] = lerp(A[key], G[key], wgt); });
      if (G.osc === "wave") A.eF += 26 * Math.sin(tt * 2 * PI * 2.5) * wgt;
      if (G.osc === "nod") { extra.headY += 3 * Math.abs(Math.sin(tt * 2 * PI * 1.6)) * wgt; A.head += 7 * Math.abs(Math.sin(tt * 2 * PI * 1.6)) * wgt; }
      if (G.osc === "bounce") extra.bob -= 7 * Math.abs(Math.sin(tt * 2 * PI * 2)) * wgt;
      if (G.osc === "jump") extra.bob -= (tt < 0.4 ? 10 * Math.sin((tt / 0.4) * PI) : 0) * wgt;
      if (G.lookY) extra.lookY = G.lookY * wgt;
      if (G.wide) extra.wide = wgt;
      break;
    }
    // talking: mouth replacement + head bob on each word
    var talking = false, mouth = "closed", wn = wordNow(ts);
    if (wn) for (i = 0; i < P.talks.length; i++) if (ts >= P.talks[i][0] && ts <= P.talks[i][1]) { talking = true; break; }
    if (talking && wn) {
      var seq = visemeSeq(wn.w.word), kq = Math.floor(clamp((ts - wn.w.start) / Math.max(0.06, wn.w.end - wn.w.start), 0, 0.999) * seq.length);
      mouth = seq[kq];
      A.head += wn.i % 2 ? 2.6 : -2.2;
      extra.bob += wn.i % 3 === 0 ? -1.2 : 0;
    }
    if (extra.wide > 0.5) mouth = "round";
    // legs during hops (lift > 0 while in the air)
    var pose = poseOf(p, ts), air = clamp(pose.lift, 0, 1);
    var face = P.face0;
    for (i = P.turns.length - 1; i >= 0; i--) if (P.turns[i].at <= ts + 1e-9) { face = P.turns[i].f; break; }
    var look = 0;
    for (i = P.looks.length - 1; i >= 0; i--) if (P.looks[i].at <= ts + 1e-9) { look = P.looks[i].dir; break; }
    var blink = P.blinks.indexOf(si) >= 0;
    setT(g.rig, c, "rig", face < 0 ? "scale(-1 1)" : "");
    if (P.type === "person") {
      var J = JOINTS.person[P.kid ? "kid" : "adult"];
      setT(g.armF, c, "aF", "rotate(" + f1(-A.sF) + " " + J.shX + " " + J.shY + ")");
      setT(g.foreF, c, "fF", "rotate(" + f1(A.eF) + " " + J.shX + " " + J.el + ")");
      setT(g.armB, c, "aB", "rotate(" + f1(A.sB) + " " + -J.shX + " " + J.shY + ")");
      setT(g.foreB, c, "fB", "rotate(" + f1(-A.eB) + " " + -J.shX + " " + J.el + ")");
      setT(g.legF, c, "lF", "rotate(" + f1(-10 * air) + " 11 " + J.hip + ")");
      setT(g.legB, c, "lB", "rotate(" + f1(10 * air) + " -11 " + J.hip + ")");
      setT(g.body, c, "body", "translate(0 " + f1(extra.bob) + ")");
      setT(g.head, c, "head", "translate(0 " + f1(extra.headY) + ") rotate(" + f1(A.head) + " 0 " + J.neck + ")");
      Object.keys(g.mouths).forEach(function (m) { setD(g.mouths[m], c, "m" + m, m === mouth); });
    } else if (P.type === "dog" || P.type === "cat") {
      var JJ = JOINTS[P.type], amp = talking ? AMP[mouth] : 0;
      var raise = clamp(A.sF / 145, 0, 1.1) * 55, tail = 10 * Math.sin(si * 2.1) + (talking ? 8 * Math.sin(si * 3.3) : 0);
      setT(g.armF, c, "aF", "rotate(" + f1(-raise - 14 * air) + " " + JJ.legs.armF + " " + JJ.legY + ")");
      setT(g.armB, c, "aB", "rotate(" + f1(-10 * air) + " " + JJ.legs.armB + " " + JJ.legY + ")");
      setT(g.legF, c, "lF", "rotate(" + f1(14 * air) + " " + JJ.legs.legF + " " + JJ.legY + ")");
      setT(g.legB, c, "lB", "rotate(" + f1(12 * air) + " " + JJ.legs.legB + " " + JJ.legY + ")");
      setT(g.tail, c, "tail", "rotate(" + f1(tail) + " " + JJ.tail[0] + " " + JJ.tail[1] + ")");
      setT(g.body, c, "body", "translate(0 " + f1(extra.bob * 0.6) + ")");
      setT(g.head, c, "head", "translate(0 " + f1(extra.bob * 0.6 + extra.headY) + ") rotate(" + f1(A.head * 1.2) + " " + JJ.neck[0] + " " + JJ.neck[1] + ")");
      setT(g.jaw, c, "jaw", "rotate(" + f1(amp * 20) + " " + JJ.jaw[0] + " " + JJ.jaw[1] + ")");
    } else {
      var J2 = JOINTS.owl, amp2 = talking ? AMP[mouth] : 0;
      setT(g.armF, c, "aF", "rotate(" + f1(-clamp(A.sF, 0, 150) * 0.9) + " " + J2.wings[1] + " " + J2.wingY + ")");
      setT(g.armB, c, "aB", "rotate(" + f1(clamp(A.sB, 0, 150) * 0.9) + " " + J2.wings[0] + " " + J2.wingY + ")");
      setT(g.body, c, "body", "translate(0 " + f1(extra.bob * 0.6) + ")");
      setT(g.head, c, "head", "translate(0 " + f1(extra.bob * 0.6 + extra.headY) + ") rotate(" + f1(A.head) + " " + J2.neck[0] + " " + J2.neck[1] + ")");
      setT(g.jaw, c, "jaw", "translate(0 " + f1(amp2 * 5) + ")");
      // googly pupils settle low and rattle when the owl moves or talks
      var shake = air > 0.1 || talking ? 1 : 0.25;
      setT(g.gl, c, "gl", "translate(" + f1((hash2(P.seed, si) - 0.5) * 5 * shake + look * 3) + " " + f1((hash2(P.seed + 3, si) - 0.7) * 4 * shake + extra.lookY * 2) + ")");
      setT(g.gr, c, "gr", "translate(" + f1((hash2(P.seed + 5, si) - 0.5) * 5 * shake + look * 3) + " " + f1((hash2(P.seed + 7, si) - 0.7) * 4 * shake + extra.lookY * 2) + ")");
    }
    if (g.pupils) setT(g.pupils, c, "pup", "translate(" + f1(look * 4 * (face < 0 ? -1 : 1)) + " " + f1(extra.lookY) + ")");
    setD(g.open, c, "eo", !blink);
    setD(g.closed, c, "ec", blink);
  }

  // ------------------------- S.paper -------------------------
  function paper(shape, o) {
    o = obj(o);
    var w = Math.max(1, num(o.w, u(200))), h = Math.max(1, num(o.h, w));
    var mk = paperMarkup(shape, w / UN, h / UN, o.color, { edge: o.edge, tex: o.tex, pattern: o.pattern, inner: o.inner, seed: o.seed, stroke: o.stroke, opacity: o.opacity, core: o.core });
    var box = svgBox(w, h, { html: mk });
    var p = makePiece(box, { parent: o.parent || "front", x: num(o.x, W / 2), y: num(o.y, H / 2), w: w, h: h, ax: o.ax, ay: o.ay, r: o.r, boil: o.boil, shadow: o.shadow, kind: o.kind, label: o.label, z: o.z });
    p._p.shapeEl = box.querySelector(".smp-shape") || box;
    return p;
  }

  // ------------------------- sets -------------------------
  function full(color, o) {
    o = obj(o);
    return paper("rect", { parent: o.parent || "bg", x: W / 2, y: H / 2, w: W * 1.06, h: H * 1.06, color: color, edge: "clean", tex: o.tex || "paper", pattern: o.pattern, shadow: false, boil: 0.25, stroke: false });
  }
  function strip(color, top, o) {
    o = obj(o);
    var h = H - top + u(40);
    return paper("rect", { parent: o.parent || "back", x: W / 2, y: top + h / 2, w: W * 1.08, h: h, color: color, edge: o.edge || ["torn", "clean", "clean", "clean"], tex: o.tex || "paper", pattern: o.pattern, shadow: o.shadow == null ? 0.7 : o.shadow, boil: 0.35, inner: o.inner });
  }
  function drift(speed, phase) { return function (ts) { return { x: ts * speed + (phase || 0) }; }; }
  function bob(amp, rate, phase) { return function (ts) { return { y: Math.sin(ts * rate + (phase || 0)) * amp }; }; }
  function sway(deg, rate, phase) { return function (ts) { return { r: Math.sin(ts * rate + (phase || 0)) * deg }; }; }
  function skyline(top, h, color, R) {
    var pts = [[0, h / UN]], x = 0, Wd = (W * 1.1) / UN;
    while (x < Wd) { var bw = 40 + R() * 90, bh = (0.25 + R() * 0.75) * (h / UN); pts.push([x, h / UN - bh]); pts.push([x + bw, h / UN - bh]); x += bw + 4 + R() * 10; }
    pts.push([Wd, h / UN]);
    var inner = "";
    for (var i = 0; i < 26; i++) { var wx = R() * Wd, wy = h / UN * (0.3 + R() * 0.6); inner += '<rect x="' + f1(wx) + '" y="' + f1(wy) + '" width="7" height="9" fill="#F7E7B0" opacity="' + (R() < 0.6 ? 0.55 : 0.2) + '"/>'; }
    return paper(pts, { parent: "back", x: W / 2, y: top + h / 2, w: W * 1.1, h: h, color: color, edge: "cut", inner: inner, shadow: 0.6, boil: 0.3 });
  }
  function clockTick(x, y, size, layer) {
    prop("clock", { kind: null, parent: layer || "back", x: x, y: y, size: size, shadow: 0.8 });
    var hw = Math.max(2, size * 0.035), hh = size * 0.36;
    var hand = paper("rect", { parent: layer || "back", x: x, y: y + size * 0.02, w: hw, h: hh, ax: 0.5, ay: 1, color: "red", edge: "clean", tex: "none", shadow: 0.4, boil: 0 });
    hand.ambient(function (ts) { return { r: Math.floor(ts) * 30 }; });
  }
  var SETS = {
    town: function (G, R) {
      full(C.sky);
      prop("sun", { kind: null, parent: "back", x: W * (TALL ? 0.8 : 0.86), y: H * (TALL ? 0.2 : 0.17), size: u(TALL ? 150 : 170), shadow: 0.7 }).ambient(function (ts) { return { r: ts * 6 }; });
      for (var i = 0; i < 3; i++) prop("cloud", { kind: null, parent: "back", x: W * (0.14 + i * 0.3), y: H * (TALL ? 0.14 + (i % 2) * 0.06 : 0.12 + (i % 2) * 0.08), size: u(80 + (i % 2) * 30), shadow: 0.6 }).ambient(drift(u(8 + i * 3), 0));
      skyline(G - H * (TALL ? 0.2 : 0.3) - u(30), H * (TALL ? 0.2 : 0.3), C.lilac, R);
      var n = TALL ? 3 : 5, cols = ["tomato", "mustard", "teal", "pink", "orange"];
      for (i = 0; i < n; i++) {
        var hx = W * (0.08 + (0.84 * (i + 0.5)) / n), hs = TALL ? H * 0.1 : H * 0.22;
        prop(i % 2 && !TALL ? "tree" : "house", { parent: "back", x: hx, y: G - u(34), size: hs * (i % 2 ? 0.95 : 1), ground: true, color: i % 2 && !TALL ? null : cols[i % cols.length], shadow: 0.7 });
      }
      strip(C.grey, G - u(TALL ? 60 : 44), { pattern: "tiles", inner: "" });
      var dash = "", rw = (W * 1.08) / UN;
      for (var dx = 20; dx < rw; dx += 140) dash += '<rect x="' + dx + '" y="' + f1(u(TALL ? 120 : 70) / UN) + '" width="70" height="10" fill="#F4EBD8" opacity="0.8"/>';
      strip(C.slate, G + u(TALL ? 140 : 70), { parent: "back", edge: ["cut", "clean", "clean", "clean"], shadow: 0.5, inner: dash });
      return { ground: G };
    },
    countryside: function (G, R) {
      full(C.sky);
      prop("sun", { kind: null, parent: "back", x: W * (TALL ? 0.78 : 0.82), y: H * (TALL ? 0.2 : 0.18), size: u(TALL ? 150 : 170), shadow: 0.7 }).ambient(function (ts) { return { r: ts * 6 }; });
      for (var i = 0; i < 3; i++) prop("cloud", { kind: null, parent: "back", x: W * (0.12 + i * 0.28), y: H * (TALL ? 0.15 + (i % 2) * 0.05 : 0.13 + (i % 2) * 0.07), size: u(80 + (i % 2) * 34), shadow: 0.6 }).ambient(drift(u(7 + i * 3), 0));
      paper("ridge", { parent: "back", x: W / 2, y: G - H * 0.2, w: W * 1.1, h: H * 0.2, color: C.lilac, edge: "torn", shadow: 0.5, boil: 0.3 });
      paper("hill", { parent: "back", x: W * 0.25, y: G - H * 0.08, w: W * 0.9, h: H * (TALL ? 0.16 : 0.24), color: C.leaf, edge: "torn", shadow: 0.6, boil: 0.3 });
      paper("hill", { parent: "back", x: W * 0.8, y: G - H * 0.06, w: W * 0.8, h: H * (TALL ? 0.13 : 0.2), color: C.green, edge: "torn", shadow: 0.6, boil: 0.3 });
      var ts2 = TALL ? H * 0.09 : H * 0.2;
      prop("pine", { kind: null, parent: "back", x: W * 0.07, y: G - u(30), size: ts2 * 1.1, ground: true, shadow: 0.7 });
      prop("tree", { kind: null, parent: "back", x: W * (TALL ? 0.9 : 0.62), y: G - u(30), size: ts2, ground: true, shadow: 0.7 });
      if (!TALL) prop("house", { kind: null, parent: "back", x: W * 0.86, y: G - u(32), size: H * 0.17, ground: true, color: "red", shadow: 0.7 });
      // fence
      var fy = G - u(TALL ? 44 : 38), fx0 = W * (TALL ? 0.2 : 0.3), nf = TALL ? 5 : 7;
      for (i = 0; i < nf; i++) paper("rect", { parent: "back", x: fx0 + i * u(44), y: fy - u(30), w: u(14), h: u(64), color: C.wood, edge: "cut", tex: "kraft", shadow: 0.6, boil: 0.4 });
      paper("rect", { parent: "back", x: fx0 + (nf - 1) * u(22), y: fy - u(40), w: (nf - 1) * u(44) + u(30), h: u(10), color: C.wood, edge: "cut", tex: "kraft", shadow: 0.6, boil: 0.4 });
      strip(C.lime, G - u(TALL ? 56 : 42), { pattern: null });
      for (i = 0; i < (TALL ? 4 : 6); i++) prop("flower", { kind: null, parent: "back", x: W * (0.06 + i * (TALL ? 0.29 : 0.18)), y: G + u(TALL ? 120 : 60), size: u(TALL ? 70 : 54), ground: true, color: i % 2 ? "pink" : "yellow", shadow: 0.6 }).ambient(sway(4, 2.2, i));
      return { ground: G };
    },
    kitchen: function (G, R) {
      full(C.cream, { pattern: "tiles" });
      var wx = TALL ? W * 0.5 : W * 0.3, wy = TALL ? H * 0.24 : H * 0.3, ww = TALL ? W * 0.5 : W * 0.24, wh = TALL ? H * 0.16 : H * 0.34;
      paper("rect", { parent: "back", x: wx, y: wy, w: ww + u(26), h: wh + u(26), color: C.white, shadow: 0.8 });
      paper("rect", { parent: "back", x: wx, y: wy, w: ww, h: wh, color: C.sky, edge: "cut", tex: "card", shadow: false, inner: "" });
      prop("cloud", { kind: null, parent: "back", x: wx - ww * 0.15, y: wy - wh * 0.15, size: Math.min(ww, wh) * 0.32, shadow: 0.4 }).ambient(drift(u(6)));
      paper("rect", { parent: "back", x: wx, y: wy, w: u(10), h: wh, color: C.white, edge: "cut", shadow: 0.4 });
      paper("rect", { parent: "back", x: wx - ww * 0.42, y: wy, w: ww * 0.28, h: wh + u(40), color: C.red, pattern: "check", edge: ["cut", "cut", "zig", "cut"], shadow: 0.8 }).ambient(sway(1.2, 1.3));
      paper("rect", { parent: "back", x: wx + ww * 0.42, y: wy, w: ww * 0.28, h: wh + u(40), color: C.red, pattern: "check", edge: ["cut", "cut", "zig", "cut"], shadow: 0.8 }).ambient(sway(1.2, 1.5, 1));
      var sx = TALL ? W * 0.5 : W * 0.72, sy = TALL ? H * 0.47 : H * 0.36, sw = TALL ? W * 0.7 : W * 0.3;
      paper("rect", { parent: "back", x: sx, y: sy, w: sw, h: u(18), color: C.wood, tex: "kraft", pattern: "planks", shadow: 0.9 });
      prop("cup", { kind: null, parent: "back", x: sx - sw * 0.3, y: sy - u(9), size: u(70), ground: true, color: "teal" });
      prop("cup", { kind: null, parent: "back", x: sx - sw * 0.1, y: sy - u(9), size: u(60), ground: true, color: "mustard" });
      prop("book", { kind: null, parent: "back", x: sx + sw * 0.25, y: sy - u(9), size: u(64), ground: true, color: "rose" });
      clockTick(TALL ? W * 0.84 : W * 0.72, TALL ? H * 0.36 : H * 0.16, u(TALL ? 100 : 110), "back");
      strip(C.wood, G - u(TALL ? 50 : 40), { edge: ["cut", "clean", "clean", "clean"], tex: "kraft", pattern: "planks" });
      strip(shade(C.wood, 0.78), G + u(TALL ? 20 : 14), { edge: ["cut", "clean", "clean", "clean"], tex: "kraft", shadow: 0.9 });
      return { ground: G };
    },
    classroom: function (G, R) {
      full(mixc(C.lime, C.cream, 0.55), { pattern: "stripe" });
      var bx = TALL ? W * 0.5 : W * 0.5, by = TALL ? H * 0.3 : H * 0.3, bw = TALL ? W * 0.86 : W * 0.56, bh = TALL ? H * 0.22 : H * 0.36;
      paper("rect", { parent: "back", x: bx, y: by, w: bw + u(34), h: bh + u(34), color: C.wood, tex: "kraft", shadow: 1 });
      var inner = textMarkup("A b C", bw / UN * 0.25, bh / UN * 0.36, 52, "#E8E4D8", F_SANS, "bold", "middle", ' opacity="0.75"') + textMarkup("2 + 2 = 4", bw / UN * 0.68, bh / UN * 0.62, 46, "#E8E4D8", F_SANS, "bold", "middle", ' opacity="0.7"') + inkP("M" + f1(bw / UN * 0.1) + " " + f1(bh / UN * 0.8) + " q60 -30 120 0 t120 0", 3, "#E8E4D8", 0.5);
      paper("rect", { parent: "back", x: bx, y: by, w: bw, h: bh, color: C.chalk, tex: "felt", edge: "cut", shadow: false, inner: inner });
      paper("rect", { parent: "back", x: bx, y: by + bh / 2 + u(20), w: bw * 0.9, h: u(12), color: C.wood, tex: "kraft", shadow: 0.6 });
      clockTick(TALL ? W * 0.82 : W * 0.88, TALL ? H * 0.5 : H * 0.2, u(TALL ? 96 : 100), "back");
      // bunting
      var nb = TALL ? 6 : 10, colsB = ["red", "yellow", "sky", "lime", "pink"];
      for (var i = 0; i < nb; i++) paper("tri", { parent: "back", x: W * (0.05 + (0.9 * (i + 0.5)) / nb), y: H * (TALL ? 0.155 : 0.075), w: u(48), h: u(46), r: 180, color: colsB[i % 5], shadow: 0.6, boil: 0.6 }).ambient(sway(3, 1.9, i));
      strip(C.wood, G - u(TALL ? 50 : 40), { edge: ["cut", "clean", "clean", "clean"], tex: "kraft", pattern: "planks" });
      return { ground: G };
    },
    ocean: function (G, R) {
      full(C.sky);
      prop("sun", { kind: null, parent: "back", x: W * (TALL ? 0.78 : 0.82), y: H * (TALL ? 0.2 : 0.17), size: u(TALL ? 150 : 170), shadow: 0.7 }).ambient(function (ts) { return { r: ts * 6 }; });
      for (var i = 0; i < 2; i++) prop("cloud", { kind: null, parent: "back", x: W * (0.15 + i * 0.35), y: H * (TALL ? 0.15 : 0.14 + i * 0.06), size: u(90 + i * 20), shadow: 0.6 }).ambient(drift(u(9 + i * 4)));
      var seaTop = G - H * (TALL ? 0.2 : 0.3);
      paper("wave", { parent: "back", x: W / 2, y: seaTop + H * 0.1, w: W * 1.12, h: H * 0.22, color: C.navy, edge: "cut", shadow: 0.6, boil: 0.3 }).ambient(bob(u(5), 3.1, 0));
      prop("boat", { kind: null, parent: "back", x: W * 0.3, y: seaTop + H * 0.07, size: u(TALL ? 120 : 140), ground: true, shadow: 0.7 }).ambient(function (ts) { return { x: ts * u(12), y: Math.sin(ts * 3.1 + 0.6) * u(6), r: Math.sin(ts * 2.4) * 4 }; });
      paper("wave", { parent: "back", x: W / 2, y: seaTop + H * 0.16, w: W * 1.12, h: H * 0.2, color: C.teal, edge: "cut", shadow: 0.6, boil: 0.3 }).ambient(bob(u(6), 3.1, 1.6));
      var fx = W * (TALL ? 0.66 : 0.6), fy = seaTop + H * 0.17;
      prop("fish", { kind: null, parent: "back", x: fx, y: fy, size: u(TALL ? 60 : 70), color: "orange", shadow: 0.8 }).ambient(function (ts) {
        var per = 3.6, ph = (ts + 1.2) % per, k = ph / 1.1;
        if (k > 1) return { hide: true };
        return { x: k * u(170), y: -Math.sin(PI * k) * u(150), r: lerp(-45, 45, k), lift: 0.8 };
      });
      paper("wave", { parent: "back", x: W / 2, y: seaTop + H * 0.22, w: W * 1.12, h: H * 0.18, color: C.sky, edge: "cut", shadow: 0.6, boil: 0.3 }).ambient(bob(u(5), 3.1, 3.1));
      strip(C.sand, G - u(TALL ? 56 : 42), { pattern: null });
      for (i = 0; i < (TALL ? 3 : 5); i++) paper("burst", { parent: "back", x: W * (0.1 + i * (TALL ? 0.4 : 0.2)), y: G + u(TALL ? 160 : 70), w: u(30), h: u(26), color: i % 2 ? C.pink : C.cream, shadow: 0.6 });
      return { ground: G };
    },
    underwater: function (G, R) {
      full("#2E6F86");
      var i;
      for (i = 0; i < 4; i++) paper("tri", { parent: "bg", x: W * (0.15 + i * 0.25), y: H * 0.32, w: W * 0.12, h: H * 0.75, r: 180 + (i - 1.5) * 6, color: "#BFE6E6", opacity: 0.16, edge: "clean", tex: "none", shadow: false, boil: 0.2, stroke: false }).ambient(sway(1.5, 0.9, i));
      prop("fish", { kind: null, parent: "back", x: W * 0.2, y: H * (TALL ? 0.28 : 0.3), size: u(70), color: "yellow" }).ambient(function (ts) { var x = ((ts * u(70) + W * 0.3) % (W + u(400))) - u(200) - W * 0.2; return { x: x, y: Math.sin(ts * 2.6) * u(10) }; });
      var f2b = prop("fish", { kind: null, parent: "back", x: W * 0.7, y: H * (TALL ? 0.42 : 0.5), size: u(56), color: "pink" });
      f2b.el.style.transform = "";
      f2b.ambient(function (ts) { var x = W * 0.7 - (((ts * u(55) + W * 0.2) % (W + u(400))) - u(200)); return { x: x - W * 0.7, y: Math.sin(ts * 2.2 + 1) * u(8), sx: -1 }; });
      for (i = 0; i < (TALL ? 6 : 9); i++) {
        var bx = W * (0.05 + i * (TALL ? 0.17 : 0.11)), bs = u(10 + (i % 3) * 7), sp = u(80 + (i % 4) * 25), ph = i * 0.7;
        paper("circle", { parent: "back", x: bx, y: G, w: bs, h: bs, color: "#DDF3F2", opacity: 0.7, tex: "card", shadow: 0.3, boil: 0.5 }).ambient((function (sp2, ph2) { return function (ts) { var yy = -(((ts + ph2) * sp2) % (G * 0.9)); return { y: yy, x: Math.sin((ts + ph2) * 3) * u(8) }; }; })(sp, ph));
      }
      for (i = 0; i < (TALL ? 4 : 7); i++) {
        var wx = W * (0.04 + i * (TALL ? 0.3 : 0.15)), wh = H * (TALL ? 0.14 : 0.26) * (0.75 + (i % 3) * 0.2);
        paper("leaf", { parent: "back", x: wx, y: G - u(20), w: u(36), h: wh, ax: 0.5, ay: 1, color: i % 2 ? C.leaf : C.green, edge: "cut", shadow: 0.7 }).ambient(sway(7, 1.7, i * 1.3));
      }
      for (i = 0; i < (TALL ? 2 : 4); i++) paper(i % 2 ? "burst" : "blob", { parent: "back", x: W * (0.18 + i * (TALL ? 0.6 : 0.24)), y: G - u(34), w: u(110), h: u(80), color: i % 2 ? C.orange : C.rose, shadow: 0.7 });
      strip(C.sand, G - u(TALL ? 56 : 42));
      return { ground: G };
    },
    space: function (G, R) {
      full(C.night);
      for (var i = 0; i < (TALL ? 22 : 30); i++) {
        var sx = R() * W, sy = R() * (G - u(60)), ss = u(10 + R() * 18);
        paper("star", { parent: "bg", x: sx, y: sy, w: ss, h: ss, color: R() < 0.7 ? C.cream : C.yellow, shadow: 0.2, boil: 0.4, tex: "card" }).ambient((function (k) { return function (ts, si) { return { s: 0.7 + 0.6 * hash2(k, Math.floor(si / 3)) }; }; })(i));
      }
      prop("planet", { kind: null, parent: "back", x: W * (TALL ? 0.76 : 0.82), y: H * (TALL ? 0.22 : 0.22), size: u(TALL ? 150 : 180), shadow: 0.7 }).ambient(sway(3, 0.8));
      prop("moon", { kind: null, parent: "back", x: W * (TALL ? 0.2 : 0.14), y: H * (TALL ? 0.19 : 0.2), size: u(TALL ? 110 : 130), shadow: 0.7 });
      var rk = prop("rocket", { kind: null, parent: "back", x: W * (TALL ? 0.5 : 0.52), y: H * (TALL ? 0.33 : 0.36), size: u(TALL ? 150 : 170), hang: true, shadow: 0.9 });
      rk.el.style.transformOrigin = f1(rk._p.w / 2) + "px " + f1(-H * 0.3) + "px";
      rk.ambient(sway(6, 1.6));
      var gp = [[0, 60]], gw = (W * 1.1) / UN;
      for (i = 0; i <= 24; i++) gp.push([(i / 24) * gw, 30 + Math.sin(i * 1.7) * 14 + (i % 3) * 6]);
      gp.push([gw, 60]); gp.push([gw, (H - G + u(120)) / UN]); gp.push([0, (H - G + u(120)) / UN]);
      var craters = "";
      for (i = 0; i < 9; i++) craters += '<ellipse cx="' + f1(R() * gw) + '" cy="' + f1(80 + R() * 140) + '" rx="' + f1(30 + R() * 40) + '" ry="' + f1(8 + R() * 10) + '" fill="#3A3F48" opacity="0.35"/>';
      var gh = H - G + u(120) + u(60);
      paper(gp, { parent: "back", x: W / 2, y: G - u(60) + gh / 2 - u(20), w: W * 1.1, h: gh, color: C.grey, edge: "cut", inner: craters, shadow: 0.8, boil: 0.3 });
      return { ground: G };
    }
  };
  var BACKDROPS = {
    kraft: function () { full(C.kraft, { tex: "kraft" }); },
    cardboard: function () { full("#B8875A", { tex: "kraft", pattern: "corrugate" }); },
    cork: function () {
      full(C.cork, { tex: "cork" });
      var t = u(TALL ? 30 : 34);
      [[W / 2, t / 2, W * 1.1, t], [W / 2, H - t / 2, W * 1.1, t], [t / 2, H / 2, t, H * 1.1], [W - t / 2, H / 2, t, H * 1.1]].forEach(function (q) {
        paper("rect", { parent: "bg", x: q[0], y: q[1], w: q[2], h: q[3], color: C.wood, tex: "kraft", pattern: "planks", shadow: 0.8, boil: 0.2 });
      });
    },
    felt: function () { full(C.felt, { tex: "felt" }); },
    mat: function () { full("#3E7D5E", { tex: "card", pattern: "mat" }); },
    night: function () {
      full(C.night, { tex: "paper" });
      var R = V.makeRand(88);
      for (var i = 0; i < 18; i++) { var ss = u(8 + R() * 12); paper("star", { parent: "bg", x: R() * W, y: R() * H, w: ss, h: ss, color: C.cream, shadow: 0.2, boil: 0.4, tex: "card" }); }
    }
  };
  var SET_NAMES = Object.keys(SETS).concat(Object.keys(BACKDROPS));
  function setSet(name) {
    var s = ensure();
    var n = str(name).toLowerCase(), G = s.ground || groundY();
    var R = V.makeRand(91 + n.length * 13);
    if (SETS[n]) { var r = SETS[n](G, R); s.set = n; s.world.style.background = C.sky; return { name: n, ground: (r && r.ground) || G }; }
    if (BACKDROPS[n]) { BACKDROPS[n](); s.set = n; return { name: n, ground: G }; }
    var m = /^paper:(#[0-9a-f]{3,6})$/i.exec(n);
    if (m) { full(col(m[1], C.kraft)); s.set = "paper"; return { name: "paper", ground: G }; }
    BACKDROPS.kraft();
    s.set = "kraft";
    return { name: "kraft", ground: G };
  }

  // ------------------------- template helpers -------------------------
  function castName(n, def) { n = str(n).toLowerCase(); return CAST_NAMES.indexOf(n) >= 0 ? n : def; }
  function pickSet(n, def, backdrops) { n = str(n).toLowerCase(); if (SETS[n]) return n; if (backdrops && BACKDROPS[n]) return n; return def; }
  function titleStrip(text, o) {
    o = o || {};
    var sa = safe(), y = o.y != null ? o.y : sa.y0;
    var t = cutText(text, { mode: o.mode || "strip", parent: "top", size: o.size || u(TALL ? 68 : 64), maxWidth: o.maxWidth || sa.w * 0.94, maxLines: o.maxLines || (TALL ? 2 : 1), x: o.x != null ? o.x : W / 2, y: y, ay: 0, paper: o.paper });
    t.place(o.at != null ? o.at : 0.2, { sync: true, how: o.how });
    t.bottom = y + t.h;
    return t;
  }
  function bubbleMarkup(w, h, tip, color) {
    var c = col(color, C.white), tx = tip[0], ty = tip[1], hw = Math.max(14, Math.min(w, h) * 0.12), base;
    if (ty > h * 0.9) { var bx = clamp(tx, w * 0.16 + hw, w * 0.84 - hw); base = [[bx - hw, h * 0.86], [bx + hw, h * 0.86]]; }
    else if (tx < 0) { var by = clamp(ty, h * 0.3, h * 0.78); base = [[w * 0.1, by - hw], [w * 0.1, by + hw]]; }
    else if (tx > w) { var by2 = clamp(ty, h * 0.3, h * 0.78); base = [[w * 0.9, by2 - hw], [w * 0.9, by2 + hw]]; }
    else { var bx2 = clamp(tx, w * 0.16 + hw, w * 0.84 - hw); base = [[bx2 - hw, h * 0.14], [bx2 + hw, h * 0.14]]; }
    return paperMarkup([base[0], [tx, ty], base[1]], 100, 100, c, { edge: "cut", tex: "paper" }) + paperMarkup("round", w, h, c, { edge: "cut", tex: "paper" });
  }
  // A paper piece built from raw markup (design units, w x h px box).
  function markupPiece(html, o) {
    var box = svgBox(o.w, o.h, { html: html });
    var p = makePiece(box, o);
    p._p.shapeEl = box;
    return p;
  }
  function fmtVal(v) {
    if (!isFinite(v)) return "0";
    if (Math.abs(v) >= 1000) return V.format(v, Math.abs(v) % 1 ? 1 : 0, true);
    return Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
  }
  function stencilTag(text, o) {
    var t = cutText(text, Object.assign({ mode: "stencil", parent: "top", size: u(40) }, o || {}));
    return t;
  }
  function TPLS() {}
  var TPL = {};

  // ------------------------- puppet-talks -------------------------
  TPL["puppet-talks"] = function (root, p) {
    var sc = scene(root, { set: pickSet(p.set, "town"), push: 0.02 });
    var sa = safe(), G = sc.ground, feet = G + u(TALL ? 12 : 14);
    var spN = castName(p.speaker, "pip"), liN = castName(p.listener, "none");
    var hasL = liN !== "none" && liN !== spN;
    var top = sa.y0;
    if (str(p.title)) top = titleStrip(p.title).bottom + u(22);
    var ph = TALL ? H * 0.3 : SQUARE ? H * 0.42 : H * 0.48;
    var sx = hasL ? (TALL ? W * 0.27 : SQUARE ? W * 0.25 : W * 0.23) : (TALL ? W * 0.3 : W * 0.26);
    var lx = TALL ? W * 0.75 : SQUARE ? W * 0.77 : W * 0.78;
    sx = Math.max(sx, sa.x0 + castHalfWidth(spN) * (ph / 200) * 1.05);
    var sp = puppet(spN, { x: sx, y: feet, height: ph, face: 1 });
    var li = hasL ? puppet(liN, { x: lx, y: feet, height: ph, face: -1 }) : null;
    var k = ph / 200, spTop = feet - sp.height, liTop = li ? feet - li.height : H;
    var mouthY = ANIMALS[spN] ? feet - sp.height * 0.72 : feet - sp.height * 0.32 - (spN === "leo" ? 0 : 0);
    if (!ANIMALS[spN]) { var c = CAST[spN], P = Object.assign({}, BODY[c.body], c.P || {}); mouthY = feet + (P.hcY + 24) * k; }
    var mouthX = sx + (ANIMALS[spN] ? (spN === "hoot" ? 0 : 50) : 10) * k;
    var ST = TALL || SQUARE; // stacked layout: bubble above the heads
    // tags (measured first so the bubble knows how much room is left)
    var tags = arr(p.tags).map(str).filter(Boolean).slice(0, 3);
    var tagObjs = [], tagRowW = 0, tagH = 0, tsz = u(ST ? 40 : 38);
    var tagX0 = ST ? sx + u(100) : sx + 70 * k, tagX1 = ST ? sa.x1 : hasL ? lx - 70 * k : sa.x1;
    for (var it = 0; it < 8 && tags.length; it++) {
      var ms = tags.map(function (t) { return cutLayout(t, { mode: "stencil", size: tsz, maxLines: 1, maxWidth: ((tagX1 - tagX0) - u(24) * (tags.length - 1)) / tags.length }); });
      tagRowW = ms.reduce(function (a, m) { return a + m.w; }, 0) + u(24) * (ms.length - 1);
      tagH = Math.max.apply(null, ms.map(function (m) { return m.h; }));
      if (tagRowW <= tagX1 - tagX0) break;
      tsz *= 0.9;
    }
    if (tags.length) tagObjs = tags.map(function (t) { return stencilTag(t, { size: tsz, maxLines: 1, maxWidth: ((tagX1 - tagX0) - u(24) * (tags.length - 1)) / tags.length, x: 0, y: 0, ax: 0, ay: 0 }); });
    // bubble region
    var bx0, bx1, by0, by1;
    if (ST) { bx0 = sa.x0; bx1 = sa.x1; by0 = top; by1 = Math.min(spTop, liTop) - u(30) - (tags.length ? tagH + u(36) : 0); }
    else { bx0 = sx + 66 * k; bx1 = hasL ? lx - 66 * k - u(20) : sa.x1; by0 = top; by1 = Math.min(mouthY + u(30), sa.y1 - (tags.length ? tagH + u(40) : 0)); }
    var bubbleTxt = str(p.bubble) || plainText(V.narration).split(/\s+/).slice(0, 10).join(" ") || "...";
    var maxBW = bx1 - bx0, maxBH = by1 - by0;
    var tsize = u(ST ? 68 : 58), padX = 0.5, padY = 0.42;
    var probe = cutLayout(bubbleTxt, { mode: "strip", size: tsize, maxWidth: maxBW - tsize * 2 * padX, maxHeight: maxBH - tsize * 2 * padY, maxLines: ST ? 5 : 4 });
    var bw = Math.min(maxBW, Math.max(u(240), probe.w + probe.size * 2 * padX)), bh = Math.min(maxBH, probe.h + probe.size * 2 * padY);
    var bX = ST ? clamp(sx - bw * 0.3, bx0, bx1 - bw) : bx0, bY = ST ? by1 - bh : clamp(by1 - bh, by0, by1 - bh);
    if (!ST && hasL) bX = bx0 + Math.max(0, (maxBW - bw) * 0.15);
    var tip = [(mouthX + (ST ? 0 : u(10)) - bX) / UN, ((ST ? spTop - u(14) : mouthY) - bY) / UN];
    if (!ST) tip = [(mouthX + u(34) - bX) / UN, (mouthY - u(8) - bY) / UN];
    var bubble = markupPiece(bubbleMarkup(bw / UN, bh / UN, tip, "white"), { parent: "top", x: bX + bw / 2, y: bY + bh / 2, w: bw, h: bh, kind: "bubble", label: "bubble", shadow: 1 });
    var txt = cutText(bubbleTxt, { mode: "strip", parent: "top", size: probe.size, maxWidth: probe.w + 1, maxLines: ST ? 5 : 4, x: bX + bw / 2, y: bY + bh / 2 + u(2) });
    var first = null;
    parseRich(bubbleTxt).some(function (t) { var f = V.find(t.w, 0); if (f != null) { first = f; return true; } return false; });
    var tb = tc(first != null ? first - 0.35 : 0.3, 0.15);
    bubble.place(tb, "pop");
    txt.place(tb + 0.2, { sync: true, how: "stamp" });
    // tags row
    if (tagObjs.length) {
      var rowY = ST ? by1 + u(18) + tagH / 2 : bY + bh + u(30) + tagH / 2;
      if (!ST) rowY = Math.min(rowY, feet - u(60) - tagH / 2);
      var x = ST ? Math.max(tagX0, (tagX0 + tagX1) / 2 - tagRowW / 2) : (tagX0 + tagX1) / 2 - tagRowW / 2;
      var tt = beatTimes(tags.map(function (t) { return { label: t }; }), { lo: tb + 0.6, gap: 0.35 });
      tagObjs.forEach(function (t, i) {
        t.el.style.left = f1(x) + "px"; t.el.style.top = f1(rowY - t.h / 2) + "px";
        st.dirty = true;
        t.place(tt[i] - 0.12, { how: "stamp" });
        x += t.w + u(24);
        if (li && i === 0) li.gesture(tt[i] + 0.1, "nod", 1.0);
      });
      sp.gesture(tt[0], "point", 1.2);
    }
    // performance
    sp.piece.hop(0.05, 0, 0, { hops: 1, height: u(22) });
    sp.talk(0, D + 1);
    sp.gesture(Math.max(0.3, tb + 0.2), "present", 1.3);
    var em = parseRich(bubbleTxt).filter(function (t) { return t.em; })[0];
    var emT = em ? V.find(em.w, tb) : null;
    if (emT != null && (!tagObjs.length || emT > 0)) sp.gesture(emT - 0.1, ANIMALS[spN] ? "cheer" : "wave", 1.1);
    if (li) {
      li.enter(0.1, "right");
      li.look(1.4, -1);
      li.gesture(Math.min(endBy() - 1.6, Math.max(2.2, D * 0.7)), "nod", 1.2);
    }
  };

  // ------------------------- diorama-scene -------------------------
  TPL["diorama-scene"] = function (root, p) {
    var sc = scene(root, { set: pickSet(p.set, "countryside"), push: 0.02 });
    var sa = safe(), G = sc.ground, feet = G + u(14);
    var items = arr(p.items).map(function (x) { return typeof x === "string" ? { prop: x, label: "" } : obj(x); }).filter(function (x) { return str(x.prop) || str(x.label); }).slice(0, 5);
    if (!items.length) items = [{ prop: "star", label: "" }];
    var n = items.length, top = sa.y0;
    if (str(p.title)) top = titleStrip(p.title).bottom + u(24);
    var chN = castName(p.character, "none"), ch = null, zx0 = sa.x0, zx1 = sa.x1;
    var ph = TALL ? H * 0.25 : SQUARE ? H * 0.4 : H * 0.44;
    if (chN !== "none") {
      var cx = sa.x0 + castHalfWidth(chN) * (ph / 200) * 1.05;
      ch = puppet(chN, { x: cx, y: feet, height: ph, face: 1 });
      zx0 = cx + ch.halfWidth + u(TALL ? 10 : 30);
    }
    var times = beatTimes(items.map(function (it) { return { label: str(it.label) || str(it.prop), keyword: it.keyword }; }), { lo: 0.6, gap: 0.45 });
    items.forEach(function (it) { hideScenery(it.prop); });
    // rows: ground row and (tall) a hanging row
    var ground = [], hang = [];
    if (TALL) {
      var cap = ch ? 2 : 3;
      var order = items.map(function (it, i) { return i; }).sort(function (a, b) { return (isSkyProp(items[b].prop) ? 1 : 0) - (isSkyProp(items[a].prop) ? 1 : 0); });
      var nh = Math.max(0, n - cap);
      order.forEach(function (i) { if (hang.length < nh && (isSkyProp(items[i].prop) || hang.length < nh)) hang.push(i); });
      items.forEach(function (it, i) { if (hang.indexOf(i) < 0) ground.push(i); });
      hang.sort(function (a, b) { return a - b; });
    } else {
      items.forEach(function (it, i) { ground.push(i); });
    }
    var tagSize = u(TALL ? 34 : 34);
    function labelFor(it, x, y, maxW, below, t) {
      var lab = str(it.label);
      if (!lab) return;
      var tg = stencilTag(lab, { size: tagSize, maxLines: 1, maxWidth: maxW, x: x, y: y, ay: below ? 0 : 1 });
      tg.place(t + 0.08, { how: "stamp" });
    }
    var lastG = -9;
    function pointAt(t) { if (ch && t - lastG > 1.25) { ch.gesture(t - 0.05, "point", 1.0); lastG = t; } }
    // ground row
    var gn = ground.length, slot = (zx1 - zx0) / Math.max(1, gn);
    var tagH = tagSize * 1.95;
    var maxSz = TALL ? H * 0.14 : (gn <= 2 ? H * 0.36 : gn === 3 ? H * 0.32 : H * 0.27);
    var skyY = top + (G - top) * (TALL ? 0.3 : 0.32);
    ground.forEach(function (i, k) {
      var it = items[i], x = zx0 + slot * (k + 0.5), sky = !TALL && isSkyProp(it.prop);
      var sz = Math.min(slot * 0.72 / (propWidth(it.prop) / 100), maxSz, slot * 0.8);
      if (sky) {
        sz = Math.min(sz, (G - top) * 0.32);
        var y = Math.max(skyY, top + sz / 2 + u(40));
        var pr = prop(it.prop, { parent: "front", x: x, y: y, size: sz, hang: true, label: it.label });
        pr.place(times[i] - 0.4, "slide-down");
        pr.wiggle(times[i] + 0.1, 1.2, 4);
        labelFor(it, x, y + sz / 2 + u(16), slot * 0.95, true, times[i]);
      } else {
        var by = feet - u(4);
        var pr2 = prop(it.prop, { parent: "front", x: x, y: by, size: sz, ground: true, label: it.label });
        pr2.place(times[i] - 0.32, "drop");
        labelFor(it, x, by - sz - u(14), slot * 0.95, false, times[i]);
      }
      pointAt(times[i]);
    });
    // hanging row (tall)
    if (hang.length) {
      var hslot = sa.w / hang.length, groundTop = feet - maxSz - tagH - u(30);
      var hy0 = top + u(40), hy1 = groundTop - u(20);
      var hs = Math.min(hslot * 0.6, (hy1 - hy0 - tagH) * 0.62, H * 0.12);
      var hy = hy0 + (hy1 - hy0 - tagH) * 0.45 + hs * 0.1;
      hang.forEach(function (i, k) {
        var it = items[i], x = sa.x0 + hslot * (k + 0.5);
        var s2 = Math.min(hs, hslot * 0.6 / (propWidth(it.prop) / 100));
        var pr = prop(it.prop, { parent: "front", x: x, y: hy, size: s2, hang: true, label: it.label });
        pr.place(times[i] - 0.4, "slide-down");
        pr.wiggle(times[i] + 0.1, 1.2, 4);
        labelFor(it, x, hy + s2 / 2 + u(14), hslot * 0.95, true, times[i]);
        pointAt(times[i]);
      });
    }
    if (ch) { ch.enter(0.05, "left"); ch.talk(0, D + 1); }
  };

  // ------------------------- paper-list -------------------------
  TPL["paper-list"] = function (root, p) {
    var board = ["cork", "felt", "kraft"].indexOf(str(p.board)) >= 0 ? str(p.board) : "cork";
    scene(root, { set: board, push: 0.012 });
    var sa = safe();
    var items = arr(p.items).map(function (x) { return typeof x === "string" ? { text: x } : obj(x); }).filter(function (x) { return str(x.text); }).slice(0, 6);
    if (!items.length) items = [{ text: plainText(p.title) || "One idea" }];
    var n = items.length, top = sa.y0;
    if (str(p.title)) top = titleStrip(p.title, { size: u(TALL ? 74 : 70), maxLines: TALL ? 2 : 1 }).bottom + u(TALL ? 40 : 30);
    var cols = TALL ? (n <= 3 ? 1 : 2) : SQUARE ? (n <= 2 ? n : n <= 4 ? 2 : 3) : (n <= 3 ? n : n === 4 ? 2 : 3), rows = Math.ceil(n / cols);
    var aw = sa.w, ah = sa.y1 - top, cw = aw / cols, chh = ah / rows;
    var nw = cw * (cols === 1 ? 0.84 : 0.88), nh = Math.min(chh * 0.86, cols === 1 ? chh * 0.86 : nw * 0.95);
    if (!TALL && rows === 1) nh = Math.min(chh * 0.86, nw * 1.0);
    nw = Math.min(nw, nh * (cols === 1 ? 3.2 : 1.35));
    var times = beatTimes(items.map(function (it) { return { label: it.text, keyword: it.keyword }; }), { lo: str(p.title) ? 0.9 : 0.4, gap: 0.5 });
    items.forEach(function (it, i) {
      var r = Math.floor(i / cols), c = i % cols, inRow = Math.min(cols, n - r * cols);
      var x = sa.x0 + (aw - inRow * cw) / 2 + cw * (c + 0.5), y = top + chh * (r + 0.5);
      var pad = Math.min(nw, nh) * 0.1, topPad = u(44);
      var fit = fitInk(it.text, (nw - 2 * pad) / UN, (nh - topPad - pad * 1.2) / UN, u(TALL ? 64 : 66) / UN, { family: F_SANS, weight: "bold", min: 14, lh: 1.18, maxLines: parseRich(it.text).length <= 8 ? 3 : 4 });
      var y0 = (topPad + (nh - topPad - pad - fit.h * UN) / 2) / UN + fit.size * 0.8;
      var colr = NOTE_COLS[i % NOTE_COLS.length];
      var html = paperMarkup("rect", nw / UN, nh / UN, colr, { edge: ["torn", "cut", "cut", "cut"], tex: "paper" }) + inkLinesMarkup(fit.lines, nw / UN / 2, y0, fit.size, { family: F_SANS, lh: 1.18 });
      var rot = (hash2(i, 5) - 0.5) * 6;
      var note = markupPiece(html, { parent: "front", x: x, y: y, w: nw, h: nh, r: rot, kind: "note", label: plainText(it.text) });
      note.place(times[i] - 0.42, "hand");
      var pn = pin({ x: x + Math.sin((rot * PI) / 180) * nh * 0.4, y: y - nh / 2 + u(20), size: u(36), color: ["red", "teal", "navy", "mustard"][i % 4] });
      pn.place(times[i] + 0.02, "pop");
      var bs = u(TALL ? 62 : 58), bx = x - nw / 2 + bs * 0.35, by = y - nh / 2 + bs * 0.3;
      var badge = markupPiece(pm("circle", bs / UN / 2, bs / UN / 2, bs / UN, bs / UN, "red", { tex: "card" }) + textMarkup(String(i + 1), bs / UN / 2, bs / UN / 2 + bs / UN * 0.2, bs / UN * 0.56, C.cream, F_BOLD), { parent: "top", x: bx, y: by, w: bs, h: bs, r: -8, kind: "badge", label: String(i + 1), shadow: 0.8 });
      badge.place(times[i] + 0.12, "stamp");
    });
  };

  // ------------------------- cut-out-chart -------------------------
  TPL["cut-out-chart"] = function (root, p) {
    scene(root, { set: "kraft", push: 0.012 });
    var sa = safe();
    var bars = arr(p.bars).map(obj).filter(function (b) { return str(b.label) || isFinite(+b.value); }).slice(0, 6);
    if (!bars.length) bars = [{ label: "A", value: 1 }, { label: "B", value: 2 }];
    var n = bars.length, vals = bars.map(function (b) { return Math.max(0, num(b.value, 0)); }), mx = Math.max.apply(null, vals) || 1;
    var hl = isFinite(+p.highlight) && p.highlight !== null && p.highlight !== "" ? Math.round(+p.highlight) : -1;
    // taped graph paper
    var gx0 = sa.x0 - u(24), gx1 = sa.x1 + u(24), gy0 = sa.y0 - u(14), gy1 = sa.y1 + u(16);
    paper("rect", { parent: "back", x: (gx0 + gx1) / 2, y: (gy0 + gy1) / 2, w: gx1 - gx0, h: gy1 - gy0, r: -0.6, color: C.white, pattern: "grid", tex: "card", shadow: 1 });
    tape({ x: gx0 + u(40), y: gy0 + u(14), r: -38, kind: "pink", parent: "back" });
    tape({ x: gx1 - u(40), y: gy0 + u(14), r: 36, kind: "blue", parent: "back" });
    var top = sa.y0 + u(20);
    if (str(p.title)) top = titleStrip(p.title, { y: sa.y0 + u(16), maxWidth: sa.w * 0.9, size: u(TALL ? 62 : 58) }).bottom + u(30);
    var lsz = u(TALL ? 36 : 34), labH = lsz * 1.5, valSz = u(TALL ? 42 : 40), valH = valSz * 1.5;
    var cx0 = sa.x0 + u(30), cx1 = sa.x1 - u(30), base = sa.y1 - labH - u(56);
    var rulerH = u(26);
    var rulerTicks = "";
    var rw = (cx1 - cx0 + u(40)) / UN;
    for (var i = 0; i < rw / 10; i++) rulerTicks += '<rect x="' + f1(i * 10) + '" y="0" width="1" height="' + (i % 5 ? 7 : 13) + '" fill="#3A2614" opacity="0.6"/>';
    paper("rect", { parent: "mid", x: (cx0 + cx1) / 2, y: base + rulerH / 2, w: cx1 - cx0 + u(40), h: rulerH, color: C.wood, tex: "kraft", inner: rulerTicks, shadow: 0.9 });
    var slot = (cx1 - cx0) / n, bw = Math.min(slot * 0.58, u(TALL ? 150 : 170));
    var maxH = base - top - valH - u(26), unitH = maxH / 7;
    var times = beatTimes(bars.map(function (b) { return { label: b.label, keyword: b.keyword }; }), { lo: str(p.title) ? 0.8 : 0.4, gap: 0.55 });
    var pre = str(p.prefix), suf = str(p.suffix);
    bars.forEach(function (b, bi) {
      var x = cx0 + slot * (bi + 0.5), hgt = Math.max(u(8), (vals[bi] / mx) * maxH), nseg = Math.max(1, Math.ceil(hgt / unitH - 0.05));
      var colr = bi === hl ? "red" : BAR_COLS[bi % BAR_COLS.length], t0 = times[bi] - 0.3, y = base;
      var segDur = 0.3, stepT = Math.min(0.1, 0.7 / nseg);
      for (var s = 0; s < nseg; s++) {
        var sh = s === nseg - 1 ? hgt - unitH * (nseg - 1) : unitH;
        var seg = paper("rect", { parent: "front", x: x + (hash2(bi, s) - 0.5) * u(5), y: y - sh / 2, w: bw * (0.97 + hash2(s, bi) * 0.06), h: sh + u(2), r: (hash2(bi + 3, s) - 0.5) * 2.4, color: colr, edge: "cut", tex: "paper", shadow: 0.7, kind: "bar", label: str(b.label) + " " + s });
        seg.place(Math.min(t0 + s * stepT, endBy() - segDur), "drop", { dur: segDur, dist: u(260) });
        y -= sh;
      }
      var vt = cutText(pre + fmtVal(vals[bi]) + suf, { mode: "label", parent: "top", size: valSz, maxLines: 1, maxWidth: slot * 0.96, x: x, y: y - u(14), ay: 1, paper: bi === hl ? "yellow" : "white" });
      vt.place(Math.min(t0 + nseg * stepT + 0.25, endBy() - 0.3), { how: "stamp" });
      var lt = cutText(str(b.label) || "?", { mode: "label", parent: "top", size: lsz, maxLines: 1, maxWidth: slot * 0.96, x: x, y: base + rulerH + u(14), ay: 0 });
      lt.place(Math.max(0.3, times[bi] - 0.35), { how: "stamp" });
    });
  };

  // ------------------------- pop-up-book -------------------------
  var BOOK_THEME = {
    town: [["house", "tree", "sun"], C.sky, C.grey], countryside: [["tree", "flower", "sun"], C.sky, C.lime], kitchen: [["cup", "bread", "cake"], C.cream, C.wood],
    classroom: [["book", "lightbulb", "globe"], mixc(C.lime, C.cream, 0.5), C.wood], ocean: [["boat", "fish", "sun"], C.sky, C.teal],
    underwater: [["fish", "leaf", "fish"], "#2E6F86", C.sand], space: [["rocket", "planet", "star"], C.night, C.grey]
  };
  TPL["pop-up-book"] = function (root, p) {
    scene(root, { set: "cardboard", push: 0.02 });
    var sa = safe(), setN = pickSet(p.set, "countryside"), th = BOOK_THEME[setN];
    var items = arr(p.items).map(str).filter(Boolean).slice(0, 3);
    if (!items.length) items = th[0].slice();
    var bw, bh, cx = W / 2, cy;
    if (TALL) { bw = sa.w + u(20); bh = Math.min(sa.h * 1.0, bw * 1.3); cy = sa.y0 + bh / 2 - u(4); }
    else { bh = sa.h * 0.94; bw = Math.min(sa.w + u(30), bh * 1.62); cy = sa.cy + u(6); }
    var pad = u(16);
    paper("rect", { parent: "back", x: cx, y: cy, w: bw + pad * 2, h: bh + pad * 2, color: C.rose, tex: "card", shadow: 1.2 });
    // pages: P = pop-up page, T = title page
    var Pp, Tp;
    if (TALL) { Pp = { x: cx, y: cy - bh / 4, w: bw, h: bh / 2 }; Tp = { x: cx, y: cy + bh / 4, w: bw, h: bh / 2 }; }
    else { Pp = { x: cx + bw / 4, y: cy, w: bw / 2, h: bh }; Tp = { x: cx - bw / 4, y: cy, w: bw / 2, h: bh }; }
    paper("rect", { parent: "back", x: Pp.x, y: Pp.y, w: Pp.w - u(6), h: Pp.h - u(6), color: C.cream, tex: "card", shadow: 0.5 });
    var tOpen = 0.2;
    // title page unfolds from the spine after the cover swings over
    var tpage = paper("rect", { parent: "mid", x: TALL ? Tp.x : Tp.x + Tp.w / 2, y: TALL ? Tp.y - Tp.h / 2 : Tp.y, w: Tp.w - u(6), h: Tp.h - u(6), ax: TALL ? 0.5 : 1, ay: TALL ? 0 : 0.5, color: C.cream, tex: "card", shadow: 0.6, pattern: "lines" });
    tpage.set(0, TALL ? { sy: 0.02 } : { sx: 0.02 }).move(tOpen + 0.3, 0.3, TALL ? { sy: 1 } : { sx: 1 }, { lift: 0.6, ease: "outQuad" });
    // spine shadow
    paper("rect", { parent: "mid", x: TALL ? cx : cx, y: TALL ? cy : cy, w: TALL ? bw : u(14), h: TALL ? u(14) : bh, color: shade(C.cream, 0.82), edge: "clean", tex: "none", shadow: false, boil: 0.2, stroke: false });
    // cover over the pop-up page, hinged at the spine
    var stitch = "";
    var cwU = (Pp.w + u(10)) / UN, chU = (Pp.h + u(10)) / UN;
    stitch += '<rect x="14" y="14" width="' + f1(cwU - 28) + '" height="' + f1(chU - 28) + '" fill="none" stroke="#F4EBD8" stroke-width="2" stroke-dasharray="7 6" opacity="0.8"/>';
    stitch += pm("star", cwU / 2, chU / 2, Math.min(cwU, chU) * 0.36, Math.min(cwU, chU) * 0.34, "yellow");
    var cover = paper("rect", { parent: "front", x: TALL ? Pp.x : cx, y: TALL ? cy : Pp.y, w: Pp.w + u(10), h: Pp.h + u(10), ax: TALL ? 0.5 : 0, ay: TALL ? 1 : 0.5, color: C.navy, tex: "card", shadow: 1, inner: stitch });
    cover.move(tOpen, 0.3, TALL ? { sy: 0.02 } : { sx: 0.02 }, { lift: 1, ease: "inQuad" }).set(tOpen + 0.3, { o: 0 });
    // pop-ups on the pop-up page (fold up from the page)
    var px0 = Pp.x - Pp.w / 2, py1 = Pp.y + Pp.h / 2, pw = Pp.w, phh = Pp.h;
    var archW = pw * 0.84, archH = phh * 0.8;
    paper("arch", { parent: "mid", x: Pp.x, y: py1 - phh * 0.07, w: archW, h: archH, ax: 0.5, ay: 1, color: th[1], tex: "card", shadow: 0.9 }).place(tOpen + 0.45, "flip", { dur: 0.4 });
    var gH = phh * 0.24;
    paper(setN === "ocean" ? "wave" : "hill", { parent: "front", x: Pp.x, y: py1 - phh * 0.05, w: pw * 0.92, h: gH, ax: 0.5, ay: 1, color: th[2], tex: "paper", shadow: 0.9 }).place(tOpen + 0.7, "flip", { dur: 0.4 });
    var lineY = py1 - phh * 0.05 - gH * 0.42;
    if (!items.some(isSkyProp)) {
      var deco = th[0].filter(isSkyProp)[0] || (setN === "space" ? "star" : setN === "underwater" ? null : "cloud");
      if (deco) { var dz = Math.min(archW * 0.26, archH * 0.26); prop(deco, { parent: "mid", x: Pp.x + archW * 0.24, y: py1 - phh * 0.07 - archH * 0.7, size: dz, kind: null }).place(tOpen + 0.85, "pop"); }
    }
    var skyIt = items.filter(isSkyProp), grIt = items.filter(function (x) { return !isSkyProp(x); });
    var baseT = tOpen + 1.0;
    var pt = beatTimes(items.map(function (x) { return { label: x }; }), { lo: baseT, gap: 0.3 });
    items.forEach(function (name, i) {
      var t = pt[i];
      if (isSkyProp(name)) {
        var k2 = skyIt.indexOf(name), sz = Math.min(archW * 0.24, archH * 0.26);
        prop(name, { parent: "front", x: Pp.x + archW * (k2 % 2 ? -0.24 : 0.24), y: py1 - phh * 0.07 - archH * 0.68, size: sz, label: name }).place(t, "pop");
      } else {
        var k3 = grIt.indexOf(name), ng = grIt.length, gx = Pp.x + pw * 0.62 * ((k3 + 0.5) / ng - 0.5);
        var s3 = Math.min(phh * (TALL ? 0.4 : 0.36), (pw * 0.7) / ng / (propWidth(name) / 100));
        prop(name, { parent: "front", x: gx, y: lineY + u(6), size: s3, ground: true, label: name }).place(t, "flip", { dur: 0.4 });
      }
    });
    // title + caption on the title page
    var tw = Tp.w * 0.82, cap = str(p.caption);
    var ttl = cutText(str(p.title) || "Once upon a time", { mode: "ransom", parent: "top", size: u(TALL ? 104 : 100), maxWidth: tw, maxLines: TALL ? 2 : 3, maxHeight: Tp.h * (cap ? 0.55 : 0.72), x: 0, y: 0 });
    var capT = cap ? cutText(cap, { mode: "label", parent: "top", size: u(TALL ? 38 : 36), maxWidth: tw, maxLines: 2, x: 0, y: 0 }) : null;
    var blockH = ttl.h + (capT ? u(34) + capT.h : 0), by0 = Tp.y - blockH / 2;
    ttl.el.style.left = f1(Tp.x - ttl.w / 2) + "px"; ttl.el.style.top = f1(by0) + "px";
    ttl.place(tOpen + 0.55, { sync: true, how: "stamp", lead: 0.05 });
    if (capT) {
      capT.el.style.left = f1(Tp.x - capT.w / 2) + "px"; capT.el.style.top = f1(by0 + ttl.h + u(34)) + "px";
      capT.place(tOpen + 1.2, { sync: true, how: "slide-right" });
    }
  };

  // ------------------------- collage-title -------------------------
  TPL["collage-title"] = function (root, p) {
    var bd = ["kraft", "cork", "night"].indexOf(str(p.backdrop)) >= 0 ? str(p.backdrop) : "kraft";
    var sc = scene(root, { set: bd, push: 0.025 });
    var sa = safe(), chN = castName(p.character, "none"), feet = sc.ground + u(14);
    var rx0 = sa.x0, rx1 = sa.x1, ry0 = sa.y0, ry1 = sa.y1, ch = null;
    if (chN !== "none") {
      var ph = TALL ? H * 0.24 : SQUARE ? H * 0.34 : H * 0.42, k = ph / 200;
      var hw = castHalfWidth(chN) * k, cx = TALL ? W * 0.72 : sa.x1 - castReach(chN) * k;
      ch = puppet(chN, { x: cx, y: feet, height: ph, face: -1 });
      if (TALL) ry1 = feet - ch.height - u(40); else rx1 = cx - hw - u(20);
    }
    var kick = str(p.kicker), sub = str(p.subtitle), title = str(p.title) || "Untitled";
    var kT = kick ? cutText(kick, { mode: "label", parent: "top", size: u(TALL ? 42 : 40), maxLines: 1, maxWidth: (rx1 - rx0) * 0.8, x: 0, y: 0 }) : null;
    var sT = sub ? cutText(sub, { mode: "stencil", parent: "top", size: u(TALL ? 46 : 44), maxLines: TALL ? 2 : 1, maxWidth: (rx1 - rx0) * 0.86, x: 0, y: 0 }) : null;
    var gap = u(TALL ? 34 : 26), avH = (ry1 - ry0) - (kT ? kT.h + gap : 0) - (sT ? sT.h + gap : 0) - u(40);
    var tT = cutText(title, { mode: "ransom", parent: "top", size: u(TALL ? 132 : 130), maxWidth: (rx1 - rx0) * 0.9, maxLines: TALL ? 4 : 2, maxHeight: avH, x: 0, y: 0 });
    var blockH = (kT ? kT.h + gap : 0) + tT.h + (sT ? sT.h + gap : 0), bcx = (rx0 + rx1) / 2, by = (ry0 + ry1) / 2 - blockH / 2;
    // scraps behind the block
    var bw = Math.max(tT.w, sT ? sT.w : 0, kT ? kT.w : 0) + u(90), bh = blockH + u(80);
    var scr = [
      ["blob", bcx - bw * 0.18, by + bh * 0.2 - u(40), bw * 0.62, bh * 0.62, "mustard", -6],
      ["rect", bcx + bw * 0.22, by + bh * 0.72, bw * 0.6, bh * 0.55, "sky", 5],
      ["rect", bcx, by + blockH / 2, bw, bh, "cream", -2]
    ];
    scr.forEach(function (s2, i) {
      paper(s2[0], { parent: "mid", x: s2[1], y: s2[2], w: s2[3], h: s2[4], r: s2[6], color: s2[5], edge: "torn", tex: "paper", pattern: i === 0 ? "dots" : null, shadow: 1 }).place(0.05 + i * 0.12, "hand", { dur: 0.5 });
    });
    paper("rect", { parent: "mid", x: bcx - bw * 0.42, y: by + bh * 0.86, w: u(170), h: u(110), r: 9, color: C.white, pattern: "lines", edge: "torn", shadow: 0.8 }).place(0.4, "hand", { dur: 0.5 });
    var y = by;
    if (kT) { kT.el.style.left = f1(bcx - kT.w / 2) + "px"; kT.el.style.top = f1(y) + "px"; kT.place(0.35, { sync: true, how: "slide-right" }); y += kT.h + gap; }
    tT.el.style.left = f1(bcx - tT.w / 2) + "px"; tT.el.style.top = f1(y) + "px";
    tT.place(kT ? 0.6 : 0.4, { sync: true, how: "stamp", lead: 0.05 });
    y += tT.h + gap;
    if (sT) { sT.el.style.left = f1(bcx - sT.w / 2) + "px"; sT.el.style.top = f1(y) + "px"; sT.place(Math.max(1.0, (tT.times[tT.times.length - 1] || 1) + 0.3), { sync: true, how: "stamp" }); }
    if (ch) { ch.enter(0.6, "slide-up"); ch.gesture(1.3, "wave", 1.4); ch.talk(0, D + 1); ch.look(1.2, -1); }
  };

  // ------------------------- before-after-flip -------------------------
  TPL["before-after-flip"] = function (root, p) {
    var sc = scene(root, { set: pickSet(p.set, "kraft", true), push: 0.02 });
    var sa = safe(), feet = sc.ground + u(14), chN = castName(p.character, "none"), ch = null;
    var A = obj(p.before), B = obj(p.after);
    var top = sa.y0;
    if (str(p.title)) top = titleStrip(p.title).bottom + u(26);
    var zx0 = sa.x0, zx1 = sa.x1, zy0 = top, zy1 = sa.y1, ph = TALL ? H * 0.24 : SQUARE ? H * 0.38 : H * 0.44;
    if (chN !== "none") {
      var k = ph / 200, hw = castHalfWidth(chN) * k;
      var cx = TALL ? Math.max(W * 0.26, sa.x0 + castReach(chN) * k) : sa.x0 + castReach(chN) * k;
      ch = puppet(chN, { x: cx, y: feet, height: ph, face: 1 });
      if (TALL) zy1 = feet - ch.height - u(36); else zx0 = cx + hw + u(30);
    }
    var cw = Math.min(zx1 - zx0, TALL ? sa.w : u(1150)), chh = Math.min(zy1 - zy0, TALL ? cw * 1.0 : cw * 0.64);
    var ccx = (zx0 + zx1) / 2, ccy = zy0 + (zy1 - zy0) / 2;
    var wU = cw / UN, hU = chh / UN, wideCard = cw > chh * 1.2;
    function face(F, isAfter) {
      var paperC = isAfter ? C.white : "#D9D1C1", tagC = isAfter ? C.red : C.slate, s = paperMarkup("rect", wU, hU, paperC, { edge: isAfter ? "cut" : ["cut", "cut", "torn", "cut"], tex: "paper", pattern: isAfter ? null : "lines" });
      var lab = str(F.label) || (isAfter ? "After" : "Before"), lsz = 40, lw = textW(lab, lsz, F_BOLD) / UN + 70, lh = 64;
      s += paperMarkup("tag", lw, lh, tagC, { x: 24, y: 24, edge: "cut", tex: "card", r: -3 }) + textMarkup(lab, 24 + lw * 0.16 + (lw * 0.84) / 2, 24 + lh / 2 + lsz * 0.36, lsz, C.cream, F_BOLD);
      var pad = 36, propBox, txtBox;
      if (wideCard) { var ps = Math.min(hU * 0.62, wU * 0.36); propBox = [pad + wU * 0.03, (hU - ps) / 2 + 30, ps]; txtBox = [wU * 0.46, 110, wU * 0.5 - pad, hU - 140]; }
      else { var ps2 = Math.min(wU * 0.5, hU * 0.4); propBox = [(wU - ps2) / 2, 110, ps2]; txtBox = [pad, 130 + ps2, wU - 2 * pad, hU - 160 - ps2]; }
      var pn = str(F.prop) || (isAfter ? "check" : "cross"), pw = propWidth(pn), sc2 = propBox[2] / 100;
      s += '<g transform="translate(' + f1(propBox[0] + (propBox[2] - pw * sc2) / 2) + " " + f1(propBox[1]) + ") scale(" + f3(sc2) + ')">' + propMarkup(pn) + "</g>";
      var fit = fitInk(str(F.text) || lab, txtBox[2], txtBox[3], TALL ? 64 : 60, { family: F_SANS, weight: "bold", min: 16, lh: 1.16 });
      var ty = txtBox[1] + (txtBox[3] - fit.h) / 2 + fit.size * 0.82;
      s += inkLinesMarkup(fit.lines, txtBox[0] + txtBox[2] / 2, ty, fit.size, { family: F_SANS, lh: 1.16 });
      if (isAfter) s += pm("burst", wU - 70, 70, 84, 84, "yellow") + pm("star", wU - 70, 70, 40, 38, "red");
      return s;
    }
    var html = '<g class="smp-face-a">' + face(A, false) + '</g><g class="smp-face-b" display="none">' + face(B, true) + "</g>";
    var card = markupPiece(html, { parent: "front", x: ccx, y: zy0 + (zy1 - zy0 - chh) / 2, w: cw, h: chh, ax: 0.5, ay: 0, kind: "card", label: "before-after", shadow: 1.1 });
    var box = card.el.querySelector("svg"), fa = box.querySelector(".smp-face-a"), fb = box.querySelector(".smp-face-b");
    card.place(0.15, "hand");
    tape({ x: ccx, y: zy0 + (zy1 - zy0 - chh) / 2 + u(4), w: u(190), h: u(46), r: -2, kind: "masking" }).place(0.6, "stamp");
    var tk = kwFind(p.keyword, 0.5);
    if (tk == null) tk = labelTime(str(B.text), null, 0.8);
    if (tk == null) tk = D * 0.5;
    tk = clamp(tk, 1.2, endBy() - 0.6);
    card.flip(tk - 0.25, 0.5, "x", { swap: [fa, fb] });
    if (ch) {
      ch.talk(0, D + 1);
      ch.enter(0.05, TALL ? "left" : "left");
      ch.gesture(Math.min(tk - 1.4, Math.max(1.3, tk * 0.45)), "shrug", 1.1);
      ch.gesture(tk + 0.3, "cheer", 1.3);
    }
  };

  // ------------------------- map-journey -------------------------
  var VEHICLES = { car: 1, boat: 1, plane: 1, rocket: 1 };
  TPL["map-journey"] = function (root, p) {
    scene(root, { set: "cork", push: 0.012 });
    var sa = safe();
    var stops = arr(p.stops).map(function (x) { return typeof x === "string" ? { name: x } : obj(x); }).filter(function (x) { return str(x.name); }).slice(0, 6);
    if (stops.length < 2) stops = stops.concat([{ name: "Start" }, { name: "End" }]).slice(0, 2);
    var n = stops.length, top = sa.y0;
    if (str(p.title)) top = titleStrip(p.title).bottom + u(20);
    var mx0 = sa.x0 - u(TALL ? 6 : 20), mx1 = sa.x1 + u(TALL ? 6 : 20), my0 = top, my1 = sa.y1 + u(10);
    var mw = mx1 - mx0, mh = my1 - my0, R = V.makeRand(71);
    var inner = "", wU = mw / UN, hU = mh / UN, i;
    inner += pm("blob", wU * 0.3, hU * 0.4, wU * 0.42, hU * 0.5, "#B7CF8A", { tex: "card" }) + pm("blob", wU * 0.74, hU * 0.62, wU * 0.4, hU * 0.46, "#B7CF8A", { tex: "card" }) + pm("blob", wU * 0.6, hU * 0.2, wU * 0.22, hU * 0.2, "#D9C690", { tex: "card" });
    inner += pm("blob", wU * 0.12, hU * 0.82, wU * 0.2, hU * 0.18, "#9FC9D9", { tex: "card" }) + pm("blob", wU * 0.9, hU * 0.18, wU * 0.14, hU * 0.18, "#9FC9D9", { tex: "card" });
    for (i = 1; i < 3; i++) inner += '<rect x="' + f1((wU * i) / 3 - 2) + '" y="0" width="4" height="' + f1(hU) + '" fill="#3A2614" opacity="0.08"/><rect x="' + f1((wU * i) / 3 + 2) + '" y="0" width="3" height="' + f1(hU) + '" fill="#FFFFFF" opacity="0.18"/>';
    inner += '<rect x="0" y="' + f1(hU / 2 - 2) + '" width="' + f1(wU) + '" height="4" fill="#3A2614" opacity="0.08"/><rect x="0" y="' + f1(hU / 2 + 2) + '" width="' + f1(wU) + '" height="3" fill="#FFFFFF" opacity="0.18"/>';
    inner += pm("star", wU - 70, hU - 70, 70, 70, "red", { opacity: 0.85 }) + pm("circle", wU - 70, hU - 70, 14, 14, "cream");
    paper("rect", { parent: "back", x: (mx0 + mx1) / 2, y: (my0 + my1) / 2, w: mw, h: mh, r: TALL ? 0.4 : -0.5, color: "#EFE3C4", tex: "paper", edge: "cut", inner: inner, shadow: 1.1 });
    [[mx0 + u(26), my0 + u(26)], [mx1 - u(26), my0 + u(26)], [mx0 + u(26), my1 - u(26)], [mx1 - u(26), my1 - u(26)]].forEach(function (q, j) { pin({ x: q[0], y: q[1], parent: "back", color: ["red", "teal", "mustard", "navy"][j] }); });
    // stop positions
    var tr = str(p.traveller) || "mo", isV = !!VEHICLES[tr], who = isV ? tr : castName(tr, "mo");
    var lsz = u(TALL ? 36 : 34), labH = lsz * 1.5, trH = TALL ? H * 0.13 : H * 0.22;
    var pts = [];
    for (i = 0; i < n; i++) {
      var f = n === 1 ? 0.5 : i / (n - 1);
      if (TALL) pts.push([mx0 + mw * (i % 2 ? 0.7 : 0.3), my0 + u(60) + trH + (mh - u(60) - trH - labH - u(80)) * f]);
      else pts.push([mx0 + mw * (0.1 + 0.8 * f), my0 + (i % 2 ? mh * 0.8 - labH : mh * 0.5)]);
    }
    var times = beatTimes(stops.map(function (s) { return { label: s.name, keyword: s.keyword }; }), { lo: 0.5, gap: 0.8 });
    // traveller
    var trav, vs = TALL ? u(96) : u(120);
    if (isV) trav = prop(who, { parent: "front", x: pts[0][0], y: pts[0][1] - u(4), size: vs, ground: true, label: who, kind: "traveller" });
    else trav = puppet(who, { x: pts[0][0], y: pts[0][1] - u(4), height: trH, face: pts[1][0] >= pts[0][0] ? 1 : -1 });
    var tp = isV ? trav : trav.piece;
    tp.place(0.15, "drop");
    if (!isV) trav.talk(0, D + 1);
    function arrive(k, t) {
      var pn = pin({ parent: "mid", x: pts[k][0], y: pts[k][1] - u(2), size: u(34), color: "red" });
      pn.place(Math.max(0.2, t), "pop");
      var lt = cutText(stops[k].name, { mode: "label", parent: "top", size: lsz, maxLines: 1, maxWidth: Math.min(u(460), mw / Math.max(2, n) * 1.5), x: pts[k][0], y: pts[k][1] + u(28), ay: 0 });
      lt.place(Math.max(0.25, t + 0.05), { how: "stamp" });
    }
    arrive(0, times[0]);
    // The trail is a bend: it leaves a stop sideways (or upward) and reaches the next one from above or
    // from the side, so it never runs through a name label (labels sit under their pins).
    function bend(a2, b2) {
      var c = b2[1] > a2[1] ? [b2[0], a2[1]] : [a2[0], b2[1]], out = [];
      for (var k = 0; k <= 32; k++) { var t = k / 32, m = 1 - t; out.push([m * m * a2[0] + 2 * m * t * c[0] + t * t * b2[0], m * m * a2[1] + 2 * m * t * c[1] + t * t * b2[1]]); }
      return out;
    }
    function along(pl, f) {
      var L = 0, cum = [0];
      for (var k = 1; k < pl.length; k++) { L += Math.hypot(pl[k][0] - pl[k - 1][0], pl[k][1] - pl[k - 1][1]); cum.push(L); }
      var want = f * L;
      for (k = 1; k < pl.length; k++) if (cum[k] >= want) { var q = (want - cum[k - 1]) / Math.max(1e-6, cum[k] - cum[k - 1]); return { x: lerp(pl[k - 1][0], pl[k][0], q), y: lerp(pl[k - 1][1], pl[k][1], q), ang: Math.atan2(pl[k][1] - pl[k - 1][1], pl[k][0] - pl[k - 1][0]), L: L }; }
      return { x: pl[pl.length - 1][0], y: pl[pl.length - 1][1], ang: 0, L: L };
    }
    var prev = Math.max(times[0], 0.9);
    for (i = 1; i < n; i++) {
      var a = pts[i - 1], b = pts[i], path = bend(a, b), dist = along(path, 1).L;
      var hops = clamp(Math.round(dist / u(150)), 2, 6);
      var arr2 = Math.max(times[i], prev + 0.7), travel = clamp(hops * 0.34, 0.5, Math.max(0.5, arr2 - prev - 0.15));
      var dep = Math.min(arr2 - travel, endBy() - travel);
      arr2 = dep + travel;
      var step = travel / hops;
      if (isV) tp.set(dep, { sx: b[0] < a[0] ? -1 : 1, x: a[0] - pts[0][0], y: a[1] - pts[0][1] });
      else trav.turn(dep, b[0] >= a[0] ? 1 : b[0] < a[0] - 1 ? -1 : (i % 2 ? 1 : -1));
      for (var hk = 1; hk <= hops; hk++) {
        var P = along(path, hk / hops);
        if (isV) tp.move(dep + (hk - 1) * step, step, { x: P.x - pts[0][0], y: P.y - u(4) - pts[0][1], sx: b[0] < a[0] ? -1 : 1 }, { lift: 1, arc: u(16), ease: "inOutQuad" });
        else trav.hopTo(dep + (hk - 1) * step, P.x, P.y - u(4), { hops: 1, dur: step, height: u(TALL ? 30 : 36) });
      }
      var nd = Math.max(2, Math.floor(dist / u(40)));
      for (var d = 1; d < nd; d++) {
        var fr = d / nd, D2 = along(path, fr);
        paper("rect", { parent: "mid", x: D2.x, y: D2.y - u(4), w: u(18), h: u(7), r: (D2.ang * 180) / PI, color: C.red, tex: "card", shadow: 0.5, boil: 0.6 }).place(dep + fr * travel + 0.1, "pop", { dur: 0.2 });
      }
      arrive(i, arr2);
      prev = arr2;
    }
  };

  // ------------------------- stack-of-facts -------------------------
  TPL["stack-of-facts"] = function (root, p) {
    scene(root, { set: "mat", push: 0.012 });
    var sa = safe();
    var facts = arr(p.facts).map(function (x) { return typeof x === "string" ? { text: x } : obj(x); }).filter(function (x) { return str(x.text) || str(x.big); }).slice(0, 5);
    if (!facts.length) facts = [{ text: plainText(V.narration).slice(0, 60) || "..." }];
    var n = facts.length, top = sa.y0;
    if (str(p.title)) { var tl = cutText(p.title, { mode: "label", parent: "top", size: u(TALL ? 50 : 46), maxLines: 1, maxWidth: sa.w * 0.8, x: W / 2, y: sa.y0, ay: 0 }); tl.place(0.2, { sync: true, how: "slide-right" }); top = sa.y0 + tl.h + u(40); }
    var off = u(16), avH = sa.y1 - top - off * (n - 1);
    var cw = TALL ? sa.w * 0.9 : Math.min(sa.w * 0.66, u(1150)), chh = TALL ? Math.min(avH * 0.7, cw * 0.82) : Math.min(avH * 0.9, cw * 0.52);
    var pcx = W / 2, pcy = top + (sa.y1 - top) / 2 + (off * (n - 1)) / 2;
    var times = beatTimes(facts.map(function (f) { return { label: f.text, keyword: f.keyword }; }), { lo: str(p.title) ? 0.7 : 0.4, gap: 0.7 });
    var wU = cw / UN, hU = chh / UN;
    // the pile starts with a blank card already on the mat
    markupPiece(paperMarkup("rect", wU, hU, C.white, { edge: "cut", tex: "card", pattern: "lines" }), { parent: "front", x: pcx - off * (n - 1) * (TALL ? 0.4 : 0.9) - u(10), y: pcy - off * n + u(6), w: cw, h: chh, r: -3.5, shadow: 1 }).place(0.1, "hand", { dur: 0.5 });
    facts.forEach(function (f, i) {
      var big = str(f.big).slice(0, 6), redY = hU * 0.2;
      var s = paperMarkup("rect", wU, hU, C.white, { edge: "cut", tex: "card", pattern: "lines" });
      s += '<rect x="0" y="' + f1(redY) + '" width="' + f1(wU) + '" height="2.4" fill="#D9472B" opacity="0.7"/>';
      var pad = 34, tx0 = pad;
      if (big) {
        var bwU = Math.min(wU * 0.36, hU * 0.9), bs = Math.min((hU - redY - pad) * 0.8, bwU / Math.max(1, Array.from(big).length * 0.68));
        var chars = Array.from(big), cwid = chars.map(function (c) { return textW(c, bs, F_BOLD); }), tot = cwid.reduce(function (a, b) { return a + b; }, 0);
        var x = pad + (bwU - tot) / 2, by = redY + (hU - redY) / 2 + bs * 0.36;
        chars.forEach(function (c, j) {
          var cc = col(LETTER_COLS[(i + j) % LETTER_COLS.length]);
          s += '<g transform="rotate(' + f1((hash2(i, j) - 0.5) * 10) + " " + f1(x + cwid[j] / 2) + " " + f1(by - bs * 0.35) + ')">' + textMarkup(c, x + cwid[j] / 2 + 3, by + 4, bs, "#2A1A0A", F_BOLD, null, "middle", ' opacity="0.25"') + textMarkup(c, x + cwid[j] / 2, by, bs, cc, F_BOLD) + textMarkup(c, x + cwid[j] / 2, by, bs, "url(#smp-tex-paper)", F_BOLD) + "</g>";
          x += cwid[j];
        });
        tx0 = pad + bwU + 24;
      }
      var fit = fitInk(f.text, wU - tx0 - pad, hU - redY - pad * 1.6, big ? (TALL ? 58 : 58) : (TALL ? 74 : 72), { family: F_MONO, weight: "bold", min: 14, lh: 1.22 });
      var ty = redY + (hU - redY - fit.h) / 2 + fit.size * 0.8;
      s += inkLinesMarkup(fit.lines, big ? tx0 : wU / 2, ty, fit.size, { family: F_MONO, align: big ? "left" : "center", lh: 1.22 });
      var k = n - 1 - i, x2 = pcx - k * off * (TALL ? 0.4 : 0.9) + (hash2(i, 9) - 0.5) * u(TALL ? 8 : 14), y2 = pcy - k * off;
      var card = markupPiece(s, { parent: "front", x: x2, y: y2, w: cw, h: chh, r: (hash2(i, 4) - 0.5) * 5, kind: "card", label: plainText(f.text).slice(0, 30), shadow: 1 });
      card.place(times[i] - 0.4, i % 2 ? "slide-left" : "slide-right");
    });
  };

  // ------------------------- paper-quote -------------------------
  TPL["paper-quote"] = function (root, p) {
    var bd = ["cork", "kraft"].indexOf(str(p.backdrop)) >= 0 ? str(p.backdrop) : "cork";
    scene(root, { set: bd, push: 0.015 });
    var sa = safe();
    var pw = TALL ? sa.w * 1.0 : Math.min(sa.w * 0.8, u(1380)), ph = TALL ? Math.min(sa.h * 0.86, pw * 1.3) : sa.h * 0.94;
    var pcx = W / 2, pcy = TALL ? sa.y0 + ph / 2 : sa.cy;
    var wU = pw / UN, hU = ph / UN, holes = "";
    for (var i = 0; i < 3; i++) holes += '<circle cx="' + f1(wU * 0.045) + '" cy="' + f1(hU * (0.25 + i * 0.25)) + '" r="9" fill="#3A2614" opacity="0.55"/>';
    var pageInner = '<rect x="' + f1(wU * 0.1) + '" y="0" width="2.2" height="' + f1(hU) + '" fill="#D9472B" opacity="0.6"/>' + holes;
    paper("rect", { parent: "back", x: pcx, y: pcy, w: pw, h: ph, r: TALL ? 0.6 : -0.8, color: C.white, edge: ["torn", "cut", "cut", "cut"], tex: "paper", pattern: "lines", inner: pageInner, shadow: 1.1 });
    tape({ x: pcx - pw / 2 + u(40), y: pcy - ph / 2 + u(10), r: -35, kind: "masking", parent: "back" });
    tape({ x: pcx + pw / 2 - u(40), y: pcy - ph / 2 + u(10), r: 33, kind: "pink", parent: "back" });
    var ax0 = pcx - pw / 2 + pw * 0.17, ax1 = pcx + pw / 2 - pw * 0.1, ay0 = pcy - ph / 2 + ph * 0.17, ay1 = pcy + ph / 2 - ph * (TALL ? 0.2 : 0.24);
    var q = str(p.quote) || plainText(V.narration) || "...";
    var txt = cutText(q, { mode: "strip", parent: "top", paper: "sand", size: u(TALL ? 92 : 96), maxWidth: ax1 - ax0, maxHeight: ay1 - ay0, maxLines: 8, x: (ax0 + ax1) / 2, y: (ay0 + ay1) / 2 });
    txt.place(0.3, { sync: true, how: "stamp" });
    var tb = txt.box(), first = txt.times[0] != null ? txt.times[0] : 0.4, last = txt.times[txt.times.length - 1] || first + 1;
    var u0 = txt.pieces[0]._unit, uN = txt.pieces[txt.pieces.length - 1]._unit;
    var qs = clamp(txt.size * 1.5, u(80), u(150));
    function qmark(ch, x, y, t) {
      var m = markupPiece(textMarkup(ch, qs / UN / 2, qs / UN * 1.02, qs / UN * 1.4, C.red, F_BOLD) + textMarkup(ch, qs / UN / 2, qs / UN * 1.02, qs / UN * 1.4, "url(#smp-tex-paper)", F_BOLD), { parent: "top", x: x, y: y, w: qs, h: qs * 0.6, ay: 0.5, kind: "mark", label: "quote mark", shadow: 1 });
      m.place(t, "pop");
    }
    var leftLim = pcx - pw / 2 + pw * 0.11 + qs * 0.45, rightLim = pcx + pw / 2 - qs * 0.5;
    qmark("\u201C", Math.max(leftLim, tb.x + u0.x - qs * 0.5), tb.y + u0.y - qs * 0.12, Math.max(0.2, first - 0.3));
    var kw = normWord(p.keyword);
    if (kw) {
      var done = false;
      txt.pieces.forEach(function (pc) {
        var un = pc._unit;
        if (done || normWord(un.ch) !== kw) return;
        done = true;
        var mk = paper("rect", { parent: "top", x: tb.x + un.x + un.w / 2, y: tb.y + un.y + un.h / 2 + u(3), w: un.w + u(40), h: un.h * 1.22, r: un.r - 2, color: C.yellow, edge: ["cut", "torn", "cut", "torn"], tex: "card", opacity: 0.95, shadow: 0.4 });
        txt.el.parentNode.insertBefore(mk.el, txt.el);
        var t0 = txt.times[un.wi] != null ? txt.times[un.wi] : last;
        mk.place(Math.max(0.2, t0 - 0.25), "slide-right", { dist: u(140), dur: 0.3 });
      });
    }
    var au = str(p.author), role = str(p.role), tA = Math.min(last + 0.4, endBy() - 0.5);
    if (au) {
      var auT = cutText(au, { mode: "stencil", parent: "top", size: u(TALL ? 52 : 50), maxLines: 1, maxWidth: pw * 0.62, x: pcx + pw / 2 - pw * 0.06, y: pcy + ph / 2 - ph * 0.05 - (role ? u(66) : 0), ax: 1, ay: 1 });
      var ta = labelTime(au, null, Math.max(0, last - 0.5));
      if (ta != null && ta > last) tA = Math.min(ta, endBy() - 0.5);
      auT.place(tA, { how: "pop" });
      auT.pieces.forEach(function (pc) { pc.wiggle(tA + 0.3, 1.2, 5); });
      if (role) cutText(role, { mode: "label", parent: "top", size: u(34), maxLines: 1, maxWidth: pw * 0.6, x: pcx + pw / 2 - pw * 0.06, y: pcy + ph / 2 - ph * 0.05, ax: 1, ay: 1 }).place(tA + 0.25, { how: "slide-left" });
    }
    qmark("\u201D", Math.min(rightLim, tb.x + uN.x + uN.w + qs * 0.5), tb.y + uN.y + qs * 0.12, Math.min(last + 0.15, endBy() - 0.4));
  };

  // ------------------------- clothesline-timeline -------------------------
  TPL["clothesline-timeline"] = function (root, p) {
    var sc = scene(root, { set: pickSet(p.set, "countryside", true), push: 0.015 });
    var sa = safe();
    var evs = arr(p.events).map(function (x) { return typeof x === "string" ? { when: "", text: x } : obj(x); }).filter(function (x) { return str(x.when) || str(x.text); }).slice(0, 6);
    if (!evs.length) evs = [{ when: "1", text: "First" }, { when: "2", text: "Next" }];
    var n = evs.length, top = sa.y0;
    if (str(p.title)) top = titleStrip(p.title).bottom + u(20);
    var lines = TALL && n >= 4 ? 2 : 1, per = Math.ceil(n / lines);
    var bandH = (sa.y1 - top) / lines, gap = u(TALL ? 26 : 30);
    var cw = Math.min((sa.w - u(36) - gap * (per - 1)) / per, u(TALL ? 420 : 380)), chh = Math.min(bandH - u(70), cw * 1.18);
    if (!TALL) chh = Math.min(chh, (sa.y1 - top) * 0.72);
    var times = beatTimes(evs.map(function (e) { return { label: str(e.when) + " " + str(e.text), keyword: e.keyword || e.when }; }), { lo: str(p.title) ? 0.8 : 0.4, gap: 0.6 });
    for (var L = 0; L < lines; L++) {
      var ly = top + bandH * L + u(34), sag = u(TALL ? 26 : 34);
      var lw = (W + u(80)) / UN, lineD = "M0 0 Q" + f1(lw / 2) + " " + f1((sag * 2) / UN) + " " + f1(lw) + " 0";
      markupPiece('<path d="' + lineD + '" stroke="#5A3A24" stroke-width="5" fill="none" opacity="0.35" transform="translate(2 3)"/><path d="' + lineD + '" stroke="#F1E6CF" stroke-width="4" fill="none"/><path d="' + lineD + '" stroke="#C9B48A" stroke-width="1.4" stroke-dasharray="3 5" fill="none"/>', { parent: "mid", x: W / 2, y: ly + sag / 2, w: W + u(80), h: sag, shadow: false, boil: 0.3 });
      var idx = []; for (var j = L * per; j < Math.min(n, (L + 1) * per); j++) idx.push(j);
      var rowW = idx.length * cw + (idx.length - 1) * gap, x0 = W / 2 - rowW / 2;
      idx.forEach(function (ei, k) {
        var e = evs[ei], x = x0 + k * (cw + gap) + cw / 2, fx = (x + u(40)) / (W + u(80)), yAtt = ly + sag * 4 * fx * (1 - fx);
        var wU = cw / UN, hU = chh / UN, when = str(e.when).slice(0, 10), s = paperMarkup("rect", wU, hU, C.cream, { edge: "cut", tex: "card" });
        var ws = Math.min(hU * 0.3, (wU - 30) / Math.max(1, Array.from(when).length * 0.7)), cx2 = wU / 2;
        if (when) {
          var chars = Array.from(when), cwid = chars.map(function (c) { return textW(c, ws, F_BOLD); }), tot = cwid.reduce(function (a, b) { return a + b; }, 0), xx = cx2 - tot / 2;
          chars.forEach(function (c, q) { var cc = col(LETTER_COLS[(ei + q) % LETTER_COLS.length]); s += textMarkup(c, xx + cwid[q] / 2, 44 + ws * 0.8, ws, cc, F_BOLD) + textMarkup(c, xx + cwid[q] / 2, 44 + ws * 0.8, ws, "url(#smp-tex-paper)", F_BOLD); xx += cwid[q]; });
        }
        var ty0 = when ? 44 + ws + 24 : 40, fit = fitInk(e.text, wU - 40, hU - ty0 - 26, TALL ? 40 : 38, { family: F_MONO, weight: "bold", min: 12, lh: 1.18 });
        s += inkLinesMarkup(fit.lines, cx2, ty0 + (hU - ty0 - 20 - fit.h) / 2 + fit.size * 0.8, fit.size, { family: F_MONO, lh: 1.18 });
        var card = markupPiece(s, { parent: "front", x: x, y: yAtt + u(8), w: cw, h: chh, ax: 0.5, ay: 0, r: (hash2(ei, 2) - 0.5) * 4, kind: "card", label: when || plainText(e.text).slice(0, 20), shadow: 1 });
        card.place(times[ei] - 0.4, "slide-down");
        card.wiggle(times[ei] + 0.05, 1.3, 4);
        var peg = '<g>' + paperMarkup("rect", 14, 46, C.wood, { x: 0, y: 0, tex: "kraft" }) + paperMarkup("rect", 14, 46, shade(C.wood, 0.85), { x: 12, y: 0, tex: "kraft" }) + '<rect x="2" y="20" width="22" height="5" fill="#9AA0A8"/></g>';
        markupPiece(peg, { parent: "top", x: x, y: yAtt + u(14), w: u(26), h: u(46), kind: null, shadow: 0.7 }).place(times[ei] + 0.02, "pop");
      });
    }
  };

  // ------------------------- public API -------------------------
  function render(id, root, props) {
    var fn = TPL[id];
    if (!fn) throw new Error("Unknown paper-theatre template: " + id);
    fn(root || V.root(), obj(props));
  }
  function flush() {
    if (!st) return;
    drawSheets();
    compile();
    frame(V.time());
  }
  function fallback(root, narration) {
    root = root || V.root();
    while (root.firstChild) root.removeChild(root.firstChild);
    st = null;
    var sc = scene(root, { set: "kraft" });
    var sa = safe();
    var words = contentWords(narration || V.narration).slice(0, 5).join(" ") || "Paper story";
    var pz = puppet("mo", { x: TALL ? W * 0.5 : W * 0.24, y: sc.ground + u(14), height: TALL ? H * 0.3 : H * 0.5 });
    pz.talk(0, D + 1);
    var t = cutText(words, { mode: "strip", parent: "top", size: u(80), maxWidth: TALL ? sa.w : sa.w * 0.6, maxLines: 3, x: TALL ? W / 2 : W * 0.64, y: TALL ? sa.y0 + sa.h * 0.28 : H * 0.42 });
    t.place(0.2, { sync: true });
    flush();
  }
  function wrapPiece(el, o) {
    o = obj(o);
    if (!el || !el.nodeType) return makePiece(null, o);
    if (o.parent || !el.parentNode) return makePiece(el, o);
    var holder = el.parentNode, next = el.nextSibling;
    var pc = makePiece(el, Object.assign({}, o, { parent: false }));
    holder.insertBefore(pc.el, next);
    return pc;
  }
  function stage(root) {
    var sc = scene(root, { set: "kraft" });
    var sa = safe();
    var col2 = div("smp-stage", sc.top, "position:absolute;left:" + f1(sa.x0) + "px;top:" + f1(sa.y0) + "px;width:" + f1(sa.w) + "px;height:" + f1(sa.h) + "px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:" + f1(u(24)) + "px");
    return col2;
  }

  S.scene = scene;
  S.set = function (name) { return setSet(name); };
  S.setNames = SET_NAMES;
  S.cast = CAST_NAMES.slice();
  S.propNames = Object.keys(PROPS);
  S.iconNames = Object.keys(ICONS);
  S.gestures = GESTURES.slice();
  S.stage = stage;
  S.paper = paper;
  S.prop = prop;
  S.sheet = sheet;
  S.tape = tape;
  S.pin = pin;
  S.piece = wrapPiece;
  S.paperMarkup = function (shape, w, h, fill, o) { return paperMarkup(shape, w, h, fill, o); };
  S.pinMarkup = pinMarkup;
  S.googlyMarkup = googlyMarkup;
  S.stitchMarkup = stitchMarkup;
  S.propMarkup = propMarkup;
  S.svgBox = svgBox;
  S.colors = C;
  S.cutText = cutText;
  S.puppet = puppet;
  S.step = function (fps) { if (fps != null) STEP = clamp(Math.round(num(fps, 10)), 6, 15); return STEP; };
  S.stepTime = stepTime;
  S.stepIndex = stepIndex;
  S.onStep = function (fn) { var s = ensure(); if (typeof fn === "function") s.stepFns.push(fn); };
  S.tl = steppedTimeline;
  S.boil = function (k) { var s = ensure(); if (k != null) s.boil = clamp(num(k, 1), 0, 3); return s.boil; };
  S.wordAt = function (t) { var w = wordNow(num(t, 0)); return w ? w.i : -1; };
  S.beats = beatTimes;
  S.safe = safe;
  S.u = u;
  S.templates = Object.keys(TPL);
  S.render = render;
  S.fallback = fallback;
  S.flush = flush;
  // Screen boxes of the key pieces visible at time t (tests: safe area and overlaps).
  S.inspect = function (t) {
    if (!st) return [];
    if (st.dirty) compile();
    var ts = stepTime(num(t, 0)), out = [];
    st.pieces.forEach(function (p) {
      if (!p.kind || p._vis === false) return;
      var anc = p.el.parentElement, hidden = false;
      while (anc && anc !== st.world) { if (anc.style && anc.style.visibility === "hidden") { hidden = true; break; } anc = anc.parentElement; }
      if (hidden) return;
      var r = (p.shapeEl || p.el).getBoundingClientRect();
      if (!r.width && !r.height) return;
      var mv = isMoving(p, ts) || p.adds.some(function (a) { return ts >= a.t0 && ts < a.t0 + a.dur; });
      out.push({ kind: p.kind, label: p.label, x: r.left, y: r.top, w: r.width, h: r.height, moving: mv });
    });
    return out;
  };
})();

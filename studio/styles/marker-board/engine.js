/* Marker Board engine (style id: marker-board).
 *
 * A hand holding a marker draws every stroke on a whiteboard while the narrator speaks.
 * Everything is a pure function of time: drawing calls only schedule strokes, and one
 * V.onFrame handler sets each stroke's dash, the camera and the hand for time t.
 * No network, no external assets, no wall clock. Randomness comes from V.makeRand.
 *
 * Contract: window.SceneStyle (S) with S.render(templateId, root, props), S.flush(),
 * S.fallback(root, narration) and the custom-mode API documented in docs.md.
 */
(function () {
  "use strict";
  var V = window.V;
  if (!V) return;
  var S = (window.SceneStyle = window.SceneStyle || {});
  var NS = "http://www.w3.org/2000/svg";
  var doc = document;
  var W = V.width, H = V.height, D = V.duration;
  var PI = Math.PI;

  // ------------------------- small utils -------------------------
  function u(px) { return V.s(px); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, p) { return a + (b - a) * p; }
  function f1(n) { return Math.round(n * 10) / 10; }
  function f2(n) { return Math.round(n * 100) / 100; }
  function str(v) { return typeof v === "string" ? v.trim() : v == null ? "" : String(v); }
  function smooth(p) { return p * p * (3 - 2 * p); }
  function inOut(p) { return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
  function shade(hex, k) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex));
    if (!m) return hex;
    var n = parseInt(m[1], 16), r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k);
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  function svg(tag, attrs, parent) {
    var n = doc.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function normWord(s) {
    return String(s == null ? "" : s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
  }

  // ------------------------- colours -------------------------
  var INK = {
    black: "#1E2026", blue: "#2457B8", red: "#D63B32", green: "#2E9A4B", orange: "#F08A24",
    yellow: "#F5C531", purple: "#7B4FB0", brown: "#8A5A35", grey: "#8E949C", gray: "#8E949C",
    pink: "#E874A6", teal: "#1F9E9A", sky: "#62B4E6",
  };
  var CYCLE = ["blue", "red", "green", "orange", "purple", "teal"];
  function colorOf(c, def) {
    if (!c) return def || INK.black;
    if (INK[c]) return INK[c];
    if (/^(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i.test(String(c))) return c;
    return def || INK.black;
  }
  var SKIN = {
    light: ["#F4D5BC", "#E2B394", "#B98468"],
    medium: ["#E3B68E", "#C99066", "#9A6846"],
    tan: ["#CB915F", "#AE7445", "#7E5131"],
    brown: ["#9E6741", "#82502F", "#5A3520"],
    dark: ["#6E452A", "#55331D", "#38200F"],
  };

  // ------------------------- path building helpers (local 0..100 box) -------------------------
  function circ(cx, cy, r) {
    return "M" + f2(cx) + " " + f2(cy - r) + " A" + r + " " + r + " 0 0 0 " + f2(cx) + " " + f2(cy + r) + " A" + r + " " + r + " 0 0 0 " + f2(cx) + " " + f2(cy - r);
  }
  function ell(cx, cy, rx, ry) {
    return "M" + f2(cx) + " " + f2(cy - ry) + " A" + rx + " " + ry + " 0 0 0 " + f2(cx) + " " + f2(cy + ry) + " A" + rx + " " + ry + " 0 0 0 " + f2(cx) + " " + f2(cy - ry);
  }
  function rell(cx, cy, rx, ry, rot) { // rotated ellipse as a polyline
    var r = (rot * PI) / 180, c = Math.cos(r), s = Math.sin(r), out = "";
    for (var i = 0; i <= 48; i++) {
      var a = (i / 48) * 2 * PI, x = Math.cos(a) * rx, y = Math.sin(a) * ry;
      out += (i ? " L" : "M") + f2(cx + x * c - y * s) + " " + f2(cy + x * s + y * c);
    }
    return out;
  }
  function rr(x, y, w, h, r) {
    r = Math.min(r || 0, w / 2, h / 2);
    if (!r) return "M" + x + " " + y + " L" + (x + w) + " " + y + " L" + (x + w) + " " + (y + h) + " L" + x + " " + (y + h) + " Z";
    return "M" + (x + r) + " " + y + " L" + (x + w - r) + " " + y + " Q" + (x + w) + " " + y + " " + (x + w) + " " + (y + r) +
      " L" + (x + w) + " " + (y + h - r) + " Q" + (x + w) + " " + (y + h) + " " + (x + w - r) + " " + (y + h) +
      " L" + (x + r) + " " + (y + h) + " Q" + x + " " + (y + h) + " " + x + " " + (y + h - r) + " L" + x + " " + (y + r) + " Q" + x + " " + y + " " + (x + r) + " " + y + " Z";
  }
  function pt(cx, cy, r, deg) { var a = (deg * PI) / 180; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; }
  function poly(pts, close) {
    var s = "";
    for (var i = 0; i < pts.length; i++) s += (i ? " L" : "M") + f2(pts[i][0]) + " " + f2(pts[i][1]);
    return s + (close ? " Z" : "");
  }
  function arcP(cx, cy, r, a0, a1) {
    var n = Math.max(6, Math.ceil(Math.abs(a1 - a0) / 8)), p = [];
    for (var i = 0; i <= n; i++) p.push(pt(cx, cy, r, a0 + ((a1 - a0) * i) / n));
    return poly(p);
  }
  function star(cx, cy, R, r, n, rot) {
    var p = [];
    for (var i = 0; i < n * 2; i++) p.push(pt(cx, cy, i % 2 ? r : R, rot + (i * 180) / n));
    return poly(p, true);
  }
  function gear(cx, cy, r, teeth, depth) {
    var p = [], step = 360 / teeth;
    for (var k = 0; k < teeth; k++) {
      var a = k * step;
      p.push(pt(cx, cy, r - depth, a - step * 0.5), pt(cx, cy, r - depth, a - step * 0.27), pt(cx, cy, r, a - step * 0.17), pt(cx, cy, r, a + step * 0.17), pt(cx, cy, r - depth, a + step * 0.27));
    }
    return poly(p, true);
  }

  // ------------------------- handwriting font (single stroke, cap height 100) -------------------------
  // y: 0 = cap top, 46 = x-height, 100 = baseline, ~135 = descender. [advance, path]
  var GL = {
    A: [70, "M5 100 L35 0 L65 100 M16 64 L54 64"],
    B: [62, "M8 0 L8 100 M8 2 C58 -2 58 48 9 48 C66 46 66 102 8 99"],
    C: [62, "M57 17 C48 -4 7 -6 6 50 C5 104 48 106 58 82"],
    D: [66, "M8 0 L8 100 M8 1 C80 -4 80 104 8 99"],
    E: [54, "M50 1 L8 0 L8 100 L51 99 M8 49 L42 49"],
    F: [52, "M50 1 L8 0 L8 100 M8 49 L42 49"],
    G: [68, "M59 15 C47 -5 6 -4 6 50 C6 104 56 106 62 64 L62 55 M38 55 L64 54"],
    H: [64, "M8 0 L8 100 M56 0 L56 100 M8 50 L56 50"],
    I: [26, "M3 0 L23 0 M13 0 L13 100 M3 100 L23 100"],
    J: [52, "M46 0 L46 70 C46 104 8 106 5 74"],
    K: [60, "M8 0 L8 100 M55 0 L9 60 M24 44 L57 100"],
    L: [52, "M8 0 L8 100 L50 100"],
    M: [82, "M7 100 L11 0 L41 66 L71 0 L75 100"],
    N: [66, "M8 100 L8 0 L58 100 L58 0"],
    O: [72, "M37 0 A31 50 0 0 0 37 100 A31 50 0 0 0 37 0"],
    P: [60, "M8 100 L8 0 M8 1 C62 -2 62 54 8 52"],
    Q: [74, "M37 0 A31 50 0 0 0 37 100 A31 50 0 0 0 37 0 M46 74 L70 104"],
    R: [62, "M8 100 L8 0 M8 1 C60 -2 60 52 8 52 M26 52 L58 100"],
    S: [58, "M52 14 C42 -6 6 -2 8 24 C10 48 52 44 52 74 C52 104 10 106 4 84"],
    T: [60, "M2 0 L58 0 M30 0 L30 100"],
    U: [64, "M8 0 L8 66 C8 106 56 106 56 66 L56 0"],
    V: [64, "M4 0 L32 100 L60 0"],
    W: [90, "M4 0 L23 100 L45 28 L67 100 L86 0"],
    X: [60, "M6 0 L54 100 M54 0 L6 100"],
    Y: [60, "M4 0 L30 50 L56 0 M30 50 L30 100"],
    Z: [58, "M6 0 L52 0 L6 100 L54 100"],
    a: [52, "M42 56 C34 42 6 44 6 73 C6 102 36 104 42 84 M43 46 L43 100"],
    b: [52, "M8 0 L8 100 M8 70 C14 40 46 42 46 73 C46 104 14 104 8 82"],
    c: [46, "M42 54 C32 40 6 44 6 73 C6 104 34 104 42 90"],
    d: [52, "M44 0 L44 100 M44 66 C38 42 6 44 6 73 C6 102 38 104 44 80"],
    e: [50, "M8 74 L44 74 C46 48 22 40 12 52 C2 64 4 98 24 100 C34 101 40 96 44 90"],
    f: [36, "M36 6 C28 -4 12 0 12 20 L12 100 M2 48 L30 48"],
    g: [52, "M44 66 C38 42 6 44 6 72 C6 100 38 102 44 78 M44 46 L44 112 C44 140 10 140 6 122"],
    h: [52, "M8 0 L8 100 M8 70 C12 42 44 40 44 66 L44 100"],
    i: [20, "M10 48 L10 100 M10 26 L10 28.5"],
    j: [24, "M14 48 L14 116 C14 136 2 138 -2 130 M14 26 L14 28.5"],
    k: [46, "M8 0 L8 100 M42 46 L8 78 M20 68 L44 100"],
    l: [20, "M10 0 L10 100"],
    m: [74, "M8 46 L8 100 M8 64 C10 44 38 40 38 62 L38 100 M38 64 C40 44 68 40 68 62 L68 100"],
    n: [52, "M8 46 L8 100 M8 66 C12 42 44 40 44 64 L44 100"],
    o: [52, "M26 46 A20 27 0 0 0 26 100 A20 27 0 0 0 26 46"],
    p: [52, "M8 46 L8 135 M8 66 C14 40 46 44 46 73 C46 102 14 104 8 82"],
    q: [52, "M44 66 C38 42 6 44 6 73 C6 102 38 104 44 80 M44 46 L44 135"],
    r: [38, "M8 46 L8 100 M8 70 C12 48 24 42 36 48"],
    s: [44, "M38 52 C30 42 8 42 8 58 C8 72 38 70 38 86 C38 104 10 104 4 92"],
    t: [36, "M16 12 L16 88 C16 102 26 102 34 96 M4 48 L32 48"],
    u: [52, "M8 46 L8 78 C8 104 44 104 44 76 M44 46 L44 100"],
    v: [48, "M4 46 L24 100 L44 46"],
    w: [68, "M4 46 L18 100 L34 58 L50 100 L64 46"],
    x: [46, "M6 46 L40 100 M40 46 L6 100"],
    y: [48, "M4 46 L24 98 M44 46 L22 108 C16 128 8 134 2 130"],
    z: [46, "M6 46 L40 46 L6 100 L42 100"],
    "\u0131": [20, "M10 48 L10 100"],
    "\u0237": [24, "M14 48 L14 116 C14 136 2 138 -2 130"],
    0: [58, "M29 0 A23 50 0 0 0 29 100 A23 50 0 0 0 29 0"],
    1: [42, "M8 18 L25 0 L25 100 M9 100 L39 100"],
    2: [56, "M6 20 C10 -4 50 -6 50 24 C50 48 20 66 6 100 L52 100"],
    3: [54, "M6 12 C18 -6 50 -2 48 24 C46 44 30 48 20 48 C40 48 52 58 50 76 C48 104 12 106 4 86"],
    4: [58, "M40 100 L40 0 L4 68 L54 68"],
    5: [54, "M48 0 L12 0 L8 44 C24 34 50 38 50 68 C50 104 10 106 4 86"],
    6: [56, "M46 8 C34 -4 8 0 6 50 C4 104 50 106 50 70 C50 40 12 40 7 64"],
    7: [54, "M4 0 L50 0 L20 100"],
    8: [54, "M27 48 C6 44 8 0 27 0 C46 0 48 44 27 48 C2 52 4 100 27 100 C50 100 52 52 27 48"],
    9: [56, "M48 30 C48 60 6 60 6 30 C6 0 48 0 48 30 C48 70 40 100 10 98"],
    ".": [18, "M9 97 L9 98.5"],
    ",": [18, "M10 94 L5 114"],
    "!": [20, "M10 0 L10 70 M10 96 L10 97.5"],
    "?": [48, "M6 18 C10 -4 44 -6 44 22 C44 44 22 44 22 70 M22 96 L22 97.5"],
    "'": [14, "M7 0 L6 24"],
    '"': [26, "M7 0 L6 24 M19 0 L18 24"],
    "-": [38, "M6 60 L32 60"],
    ":": [18, "M9 50 L9 51.5 M9 96 L9 97.5"],
    ";": [18, "M9 50 L9 51.5 M10 94 L5 114"],
    "(": [28, "M22 -6 C0 24 0 96 22 124"],
    ")": [28, "M6 -6 C28 24 28 96 6 124"],
    "/": [40, "M36 -4 L4 108"],
    "%": [72, "M16 2 A10 15 0 0 0 16 32 A10 15 0 0 0 16 2 M60 0 L12 100 M56 68 A10 15 0 0 0 56 98 A10 15 0 0 0 56 68"],
    $: [56, "M50 16 C42 -2 8 0 8 24 C8 46 50 44 50 72 C50 100 10 104 4 84 M29 -10 L29 110"],
    "&": [66, "M58 100 L18 42 C6 24 14 0 30 0 C44 0 48 22 32 36 L16 50 C2 64 6 100 32 100 C46 100 54 88 60 70"],
    "+": [52, "M26 36 L26 84 M5 60 L47 60"],
    "=": [50, "M6 48 L44 48 M6 72 L44 72"],
    "#": [62, "M22 10 L16 96 M44 10 L38 96 M6 36 L58 36 M4 70 L56 70"],
    "@": [84, "M58 40 C54 26 28 26 26 52 C24 74 50 76 56 54 L58 40 L56 66 C58 78 76 76 78 54 C80 20 54 4 40 6 C12 10 4 40 8 62 C14 92 46 102 70 90"],
    "<": [44, "M38 34 L6 60 L38 86"],
    ">": [44, "M6 34 L38 60 L6 86"],
    "\u00b0": [26, "M13 0 A9 9 0 0 0 13 18 A9 9 0 0 0 13 0"],
    "\u20ac": [62, "M56 14 C46 -4 12 -4 10 50 C8 104 46 106 58 84 M0 40 L40 40 M0 60 L36 60"],
    "\u00a3": [54, "M46 12 C38 -4 14 -2 16 24 L16 70 C16 88 10 96 4 100 L50 100 M4 52 L36 52"],
    _: [50, "M2 104 L48 104"],
  };
  var MARKS = {
    "\u0301": "M-3 -10 L7 -24", "\u0300": "M3 -10 L-7 -24", "\u0302": "M-9 -10 L0 -22 L9 -10",
    "\u0308": "M-8 -16 L-8 -14.5 M8 -16 L8 -14.5", "\u0303": "M-11 -14 C-6 -22 -2 -10 3 -16 C6 -20 9 -20 11 -18",
    "\u030a": "M0 -22 A5 5 0 0 0 0 -12 A5 5 0 0 0 0 -22", "\u030c": "M-9 -22 L0 -10 L9 -22",
    "\u0304": "M-10 -14 L10 -14", "\u0327": "BELOW",
  };
  var CEDILLA = "M0 100 L-2 108 C6 108 6 118 -4 118";
  var CHARMAP = { "\u2018": "'", "\u2019": "'", "\u201a": ",", "\u201c": '"', "\u201d": '"', "\u201e": '"', "\u2013": "-", "\u2014": "-", "\u2212": "-", "\u00d7": "x", "\u00df": "ss", "\u00e6": "ae", "\u00c6": "AE", "\u0153": "oe", "\u0152": "OE", "\u00f8": "o", "\u00d8": "O", "\u2026": "...", "\u00a0": " ", "\u00ab": '"', "\u00bb": '"' };
  var TALL = /[A-Z0-9bdfhklt'"!?%$&#@()\/\u00b0\u20ac\u00a3]/;
  var TRACK = 5, SPACE = 32;

  // ------------------------- path sampling -------------------------
  var mPath = null;
  function measurer() {
    if (mPath && mPath.isConnected) return mPath;
    var s = svg("svg", { width: "10", height: "10", style: "position:absolute;left:-9999px;top:0;visibility:hidden" });
    (doc.body || doc.documentElement).appendChild(s);
    mPath = svg("path", {}, s);
    return mPath;
  }
  function splitD(d) {
    var parts = String(d).trim().split(/(?=[Mm])/).filter(function (x) { return x.trim(); });
    var out = [], p = measurer(), prev = null;
    parts.forEach(function (sp) {
      sp = sp.trim();
      if (sp[0] === "m" && prev) {
        var m = /^m\s*(-?[\d.]+)[\s,]*(-?[\d.]+)/.exec(sp);
        if (m) {
          p.setAttribute("d", prev);
          var L = p.getTotalLength(), q = p.getPointAtLength(L);
          sp = "M" + (q.x + +m[1]) + " " + (q.y + +m[2]) + sp.slice(m[0].length);
        }
      }
      out.push(sp);
      prev = sp;
    });
    return out;
  }
  // Returns flat points [x0,y0,x1,y1,...] along one subpath, spaced about `step` apart.
  function sample(d, step) {
    var p = measurer();
    p.setAttribute("d", d);
    var len = 0;
    try { len = p.getTotalLength(); } catch (e) { len = 0; }
    if (!(len > 0)) {
      var m = /M\s*(-?[\d.]+)[\s,]*(-?[\d.]+)/.exec(d);
      var x = m ? +m[1] : 0, y = m ? +m[2] : 0;
      return [x, y, x + 0.01, y + 0.01];
    }
    var n = clamp(Math.ceil(len / step), 2, 700), out = [];
    for (var i = 0; i <= n; i++) {
      var q = p.getPointAtLength((len * i) / n);
      out.push(q.x, q.y);
    }
    return out;
  }
  function bboxOfD(d) {
    var p = measurer();
    p.setAttribute("d", d);
    try { var b = p.getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height }; } catch (e) { return { x: 0, y: 0, w: 100, h: 100 }; }
  }
  function cumOf(pts) {
    var n = pts.length / 2, cum = new Float64Array(n), L = 0;
    for (var i = 1; i < n; i++) {
      var dx = pts[2 * i] - pts[2 * i - 2], dy = pts[2 * i + 1] - pts[2 * i - 1];
      L += Math.sqrt(dx * dx + dy * dy);
      cum[i] = L;
    }
    return cum;
  }
  function pointAt(pts, cum, s) {
    var n = cum.length;
    if (s <= 0) return [pts[0], pts[1]];
    if (s >= cum[n - 1]) return [pts[2 * n - 2], pts[2 * n - 1]];
    var lo = 0, hi = n - 1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (cum[mid] < s) lo = mid; else hi = mid; }
    var k = (s - cum[lo]) / (cum[hi] - cum[lo] || 1);
    return [lerp(pts[2 * lo], pts[2 * hi], k), lerp(pts[2 * lo + 1], pts[2 * hi + 1], k)];
  }
  function dOf(pts) {
    var s = "M" + f1(pts[0]) + " " + f1(pts[1]);
    for (var i = 2; i < pts.length; i += 2) s += " L" + f1(pts[i]) + " " + f1(pts[i + 1]);
    return s;
  }
  // matrix [a,b,c,d,e,f]: x' = a x + c y + e, y' = b x + d y + f
  function mat(tx, ty, sc, rotDeg, flip, ox, oy) {
    var r = ((rotDeg || 0) * PI) / 180, co = Math.cos(r) * sc, si = Math.sin(r) * sc, fx = flip ? -1 : 1;
    ox = ox || 0; oy = oy || 0;
    var a = co * fx, b = si * fx, c = -si, d = co;
    return [a, b, c, d, tx - a * ox - c * oy, ty - b * ox - d * oy];
  }
  function applyM(m, pts) {
    var out = new Array(pts.length);
    for (var i = 0; i < pts.length; i += 2) {
      out[i] = m[0] * pts[i] + m[2] * pts[i + 1] + m[4];
      out[i + 1] = m[1] * pts[i] + m[3] * pts[i + 1] + m[5];
    }
    return out;
  }
  function wobble(pts, amp, rnd) {
    if (!amp || pts.length < 6) return pts;
    var cum = cumOf(pts), out = pts.slice(), n = pts.length / 2;
    var ph1 = rnd() * 6.283, ph2 = rnd() * 6.283, k1 = 6.283 / u(150), k2 = 6.283 / u(47);
    for (var i = 0; i < n; i++) {
      var i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
      var tx = pts[2 * i1] - pts[2 * i0], ty = pts[2 * i1 + 1] - pts[2 * i0 + 1], tl = Math.sqrt(tx * tx + ty * ty) || 1;
      var s = cum[i], off = amp * (0.65 * Math.sin(s * k1 + ph1) + 0.35 * Math.sin(s * k2 + ph2));
      out[2 * i] += (-ty / tl) * off;
      out[2 * i + 1] += (tx / tl) * off;
    }
    return out;
  }
  function boundsOf(list) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    list.forEach(function (pts) {
      for (var i = 0; i < pts.length; i += 2) {
        if (pts[i] < x0) x0 = pts[i];
        if (pts[i] > x1) x1 = pts[i];
        if (pts[i + 1] < y0) y0 = pts[i + 1];
        if (pts[i + 1] > y1) y1 = pts[i + 1];
      }
    });
    if (!isFinite(x0)) return { x: 0, y: 0, w: 0, h: 0 };
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  // ------------------------- doodle library (100 x 100 box) -------------------------
  var DL = {};
  function dd(name, s, f, o) { DL[name] = { s: s, f: f || [], w: (o && o.w) || 1 }; }
  var BULB = "M37 70 L37 62 C22 53 18 31 30 18 C40 8 60 8 70 18 C82 31 78 53 63 62 L63 70";
  dd("lightbulb", [BULB, "M35 72 L65 72", "M37 79 L63 79", "M41 86 L59 86", "M46 92 L54 92", "M44 62 L44 48 L50 42 L56 48 L56 62",
    { d: "M13 30 L5 28", c: "orange" }, { d: "M87 30 L95 28", c: "orange" }, { d: "M21 9 L15 3", c: "orange" }, { d: "M79 9 L85 3", c: "orange" }],
    [[BULB + " Z", "yellow", 1]]);
  var BRAIN = "M50 18 C44 10 30 10 26 20 C14 20 8 34 14 44 C6 52 10 68 22 70 C24 82 40 86 50 78 C60 86 76 82 78 70 C90 68 94 52 86 44 C92 34 86 20 74 20 C70 10 56 10 50 18";
  dd("brain", [BRAIN, "M50 18 C46 30 54 40 50 50 C46 60 54 68 50 78", "M24 34 C30 30 38 34 36 42", "M64 32 C70 28 78 34 74 42", "M22 56 C28 52 36 58 32 64", "M66 56 C72 52 80 58 76 64"], [[BRAIN + " Z", "pink", 1]]);
  dd("coins", [ell(50, 30, 26, 9), "M24 30 L24 66 C24 78 76 78 76 66 L76 30", "M24 42 C24 54 76 54 76 42", "M24 54 C24 66 76 66 76 54", "M44 30 L56 30"],
    [["M24 30 L24 66 C24 78 76 78 76 66 L76 30 C76 18 24 18 24 30 Z", "yellow", 1]]);
  dd("money", ["M18 20 L94 20 L94 62", rr(8, 28, 78, 48, 3), circ(47, 52, 13), "M51 46 C49 42 43 42 43 47 C43 52 52 51 52 56 C52 61 45 62 43 58", "M47 40 L47 64", "M14 36 L20 36", "M74 68 L80 68"],
    [[rr(8, 28, 78, 48, 3), "green", 1]]);
  var BAG = "M39 32 C20 44 12 64 18 78 C24 92 76 92 82 78 C88 64 80 44 61 32";
  dd("money-bag", [BAG, "M37 32 L63 32", "M40 30 C33 18 40 10 46 16 C48 9 53 9 55 16 C61 10 68 18 60 30", "M56 56 C54 51 45 51 45 57 C45 63 56 61 56 68 C56 74 47 75 45 70", "M50 48 L50 78"],
    [[BAG + " Z", "#DDB060", 1]]);
  dd("piggybank", [ell(48, 55, 32, 22), ell(82, 55, 5, 7), "M58 36 L64 25 L70 38", "M30 74 L30 86 M44 76 L44 88 M56 76 L56 88 M68 72 L68 84", "M16 52 C8 48 10 40 15 44", { d: "M67 46 L67 47.5", w: 1.6 }, "M42 36 L54 36", "M80.5 53 L80.5 54 M83.5 53 L83.5 54"],
    [[ell(48, 55, 32, 22), "pink", 1]]);
  dd("house", ["M14 50 L50 16 L86 50", rr(22, 46, 56, 44, 0), rr(44, 64, 14, 26, 0), rr(28, 56, 11, 11, 0), rr(62, 56, 11, 11, 0), "M66 34 L66 22 L74 22 L74 41"],
    [["M14 50 L50 16 L86 50 Z", "red"], [rr(22, 46, 56, 44, 0), "yellow", 1]]);
  dd("globe", [circ(50, 50, 36), ell(50, 50, 14, 36), "M14 50 L86 50", "M19 32 C40 38 60 38 81 32", "M19 68 C40 62 60 62 81 68"],
    [[circ(50, 50, 36), "sky", 1], ["M28 22 C38 18 46 26 42 34 C38 44 26 42 24 34 C22 28 24 24 28 22 Z", "green"], ["M56 54 C66 50 76 58 70 70 C64 80 52 72 56 54 Z", "green"], ["M66 24 C72 22 78 28 74 34 C70 38 64 32 66 24 Z", "green"]]);
  dd("clock", [circ(50, 50, 38), "M50 50 L50 25", "M50 50 L67 59", "M50 15 L50 21 M85 50 L79 50 M50 85 L50 79 M15 50 L21 50"], [[circ(50, 50, 38), "sky", 1]]);
  var ROCKET = "M50 6 C66 20 68 46 62 70 L38 70 C32 46 34 20 50 6";
  dd("rocket", [ROCKET, circ(50, 36, 7), "M38 54 L24 74 L38 70", "M62 54 L76 74 L62 70", { d: "M43 74 C42 84 50 94 50 94 C50 94 58 84 57 74", c: "orange" }],
    [["M38 54 L24 74 L38 70 Z", "red", 1], ["M62 54 L76 74 L62 70 Z", "red", 1], [circ(50, 36, 7), "sky"], ["M43 74 C42 84 50 94 50 94 C50 94 58 84 57 74 Z", "orange"]]);
  var HEART = "M50 86 C20 64 8 46 14 30 C20 14 42 12 50 30 C58 12 80 14 86 30 C92 46 80 64 50 86";
  dd("heart", [HEART], [[HEART + " Z", "red", 1]]);
  dd("gears", [gear(40, 42, 27, 8, 7), circ(40, 42, 8), gear(73, 73, 17, 6, 6), circ(73, 73, 5)], [[gear(40, 42, 27, 8, 7), "orange", 1], [gear(73, 73, 17, 6, 6), "grey"]]);
  dd("chart-up", ["M12 8 L12 88 L94 88", rr(22, 64, 12, 24, 0), rr(44, 52, 12, 36, 0), rr(66, 36, 12, 52, 0), { d: "M18 52 L40 34 L54 42 L82 13", c: "red", w: 1.3 }, { d: "M70 13 L83 12 L82 25", c: "red", w: 1.3 }],
    [[rr(22, 64, 12, 24, 0), "green", 1], [rr(44, 52, 12, 36, 0), "green", 1], [rr(66, 36, 12, 52, 0), "green", 1]]);
  dd("chart-down", ["M12 8 L12 88 L94 88", rr(22, 36, 12, 52, 0), rr(44, 52, 12, 36, 0), rr(66, 64, 12, 24, 0), { d: "M18 16 L40 34 L54 28 L82 58", c: "red", w: 1.3 }, { d: "M83 45 L83 59 L70 60", c: "red", w: 1.3 }],
    [[rr(22, 36, 12, 52, 0), "orange", 1], [rr(44, 52, 12, 36, 0), "orange", 1], [rr(66, 64, 12, 24, 0), "orange", 1]]);
  (function () {
    var a = pt(48, 52, 36, -90), b = pt(48, 52, 36, 15), c = pt(48, 52, 36, 135);
    dd("chart-pie", [circ(48, 52, 36), poly([a, [48, 52], b]), poly([[48, 52], c])],
      [["M48 52 L" + f2(a[0]) + " " + f2(a[1]) + " A36 36 0 0 1 " + f2(b[0]) + " " + f2(b[1]) + " Z", "blue", 1], ["M48 52 L" + f2(b[0]) + " " + f2(b[1]) + " A36 36 0 0 1 " + f2(c[0]) + " " + f2(c[1]) + " Z", "orange"], ["M48 52 L" + f2(c[0]) + " " + f2(c[1]) + " A36 36 0 0 1 " + f2(a[0]) + " " + f2(a[1]) + " Z", "yellow"]]);
  })();
  dd("magnifier", [circ(40, 40, 26), { d: "M59 59 L86 86", w: 2.6 }, "M27 33 C29 26 35 22 42 22"], [[circ(40, 40, 26), "sky", 1]]);
  dd("phone", [rr(30, 8, 40, 84, 7), rr(35, 17, 30, 60, 2), "M46 85 L54 85"], [[rr(35, 17, 30, 60, 2), "sky", 1]]);
  dd("laptop", [rr(20, 20, 60, 42, 3), rr(25, 25, 50, 32, 1), "M20 62 L8 76 L92 76 L80 62", "M42 70 L58 70"], [[rr(25, 25, 50, 32, 1), "sky", 1]]);
  var BOOK = "M50 26 C38 18 20 18 10 22 L10 78 C20 74 38 74 50 82 C62 74 80 74 90 78 L90 22 C80 18 62 18 50 26";
  dd("book", [BOOK, "M50 26 L50 82", "M18 34 C26 32 34 32 42 35", "M18 46 C26 44 34 44 42 47", "M18 58 C26 56 34 56 42 59", "M58 35 C66 32 74 32 82 34", "M58 47 C66 44 74 44 82 46", "M58 59 C66 56 74 56 82 58"], [[BOOK + " Z", "sky", 1]]);
  var CUP = "M28 14 L72 14 L70 40 C68 58 32 58 30 40 Z";
  dd("trophy", [CUP, "M28 20 C14 20 14 40 31 43", "M72 20 C86 20 86 40 69 43", "M46 57 L46 70 M54 57 L54 70", rr(34, 70, 32, 10, 2), rr(28, 80, 44, 9, 2), "M45 28 L50 24 L50 42"],
    [[CUP, "yellow", 1], [rr(28, 80, 44, 9, 2), "brown"]]);
  dd("target", [circ(50, 52, 38), circ(50, 52, 25), circ(50, 52, 12), { d: "M50 52 L86 16", w: 1.2 }, "M79 11 L86 16 L91 24"],
    [[circ(50, 52, 38) + " " + circ(50, 52, 25), "red", 1, "evenodd"], [circ(50, 52, 12), "red", 1]]);
  var MTN = "M4 86 L36 28 L50 52 L62 36 L96 86 Z";
  dd("mountain", [MTN, "M27 45 L32 50 L37 44 L42 50 L45 46"], [[MTN, "grey", 1]]);
  var CANOPY = "M50 64 C30 70 16 58 22 44 C12 34 22 16 36 20 C40 8 60 8 64 20 C78 16 88 34 78 44 C84 58 70 70 50 64";
  dd("tree", [CANOPY, "M45 64 L44 92 M55 64 L56 92", "M36 92 L64 92", "M50 78 L58 70"], [[CANOPY + " Z", "green", 1], ["M45 64 L44 92 L56 92 L55 64 Z", "brown"]]);
  (function () {
    var s = [circ(50, 50, 19)];
    for (var k = 0; k < 8; k++) { var a = pt(50, 50, 27, k * 45), b = pt(50, 50, 41, k * 45); s.push({ d: poly([a, b]), c: "orange" }); }
    dd("sun", s, [[circ(50, 50, 19), "yellow", 1]]);
  })();
  var CLOUD = "M26 72 C12 72 8 56 20 51 C17 37 33 30 42 38 C46 24 66 24 70 38 C84 33 94 47 86 57 C94 65 86 76 76 72 Z";
  dd("cloud", [CLOUD], [[CLOUD, "sky", 1]]);
  var CLOUD2 = "M26 56 C12 56 8 40 20 35 C17 21 33 14 42 22 C46 8 66 8 70 22 C84 17 94 31 86 41 C94 49 86 60 76 56 Z";
  dd("cloud-rain", [CLOUD2, { d: "M32 66 L27 80", c: "blue" }, { d: "M50 66 L45 84", c: "blue" }, { d: "M68 66 L63 80", c: "blue" }], [[CLOUD2, "grey", 1]]);
  var CAR = "M8 66 L8 53 C8 49 12 47 18 47 L28 47 L37 32 L66 32 L77 47 L86 49 C90 50 92 53 92 57 L92 66 Z";
  dd("car", [CAR, "M40 36 L33 47 L50 47 L50 36 Z", "M54 36 L54 47 L72 47 L64 36 Z", circ(27, 68, 9), circ(73, 68, 9), "M10 56 L16 56"],
    [[CAR + " M40 36 L33 47 L50 47 L50 36 Z M54 36 L54 47 L72 47 L64 36 Z", "red", 1, "evenodd"], ["M40 36 L33 47 L50 47 L50 36 Z", "sky"], ["M54 36 L54 47 L72 47 L64 36 Z", "sky"]]);
  var FAC = "M8 90 L8 52 L26 40 L26 52 L44 40 L44 52 L62 40 L62 90 Z";
  dd("factory", [FAC, "M66 90 L66 22 L80 22 L80 90", "M4 90 L96 90", rr(16, 62, 9, 9, 0), rr(33, 62, 9, 9, 0), rr(48, 62, 9, 9, 0), { d: "M73 15 C69 9 75 3 80 6 C84 0 94 4 90 11", c: "grey" }],
    [[FAC, "grey", 1], ["M66 90 L66 22 L80 22 L80 90 Z", "red"]]);
  var THINK = "M30 60 C14 60 12 42 24 38 C20 24 38 18 46 26 C52 14 72 16 74 30 C88 28 94 46 82 52 C88 64 74 72 64 64 C58 72 40 72 30 60 Z";
  dd("thought-bubble", [THINK, circ(24, 76, 5), circ(14, 88, 3)], [[THINK, "sky", 1]]);
  var SPEECH = "M18 18 L82 18 C88 18 92 22 92 28 L92 58 C92 64 88 68 82 68 L40 68 L24 84 L28 68 L18 68 C12 68 8 64 8 58 L8 28 C8 22 12 18 18 18 Z";
  dd("speech-bubble", [SPEECH, "M22 34 L76 34", "M22 46 L70 46", "M22 56 L54 56"], [[SPEECH, "sky", 1]]);
  var STAR = star(50, 53, 44, 18, 5, -90);
  dd("star", [STAR], [[STAR, "yellow", 1]]);
  dd("check", [{ d: "M14 52 L38 76 L86 22", c: "green", w: 2 }], []);
  dd("cross", [{ d: "M18 18 L82 82", c: "red", w: 2 }, { d: "M82 18 L18 82", c: "red", w: 2 }], []);
  var TRI = "M50 10 L92 86 L8 86 Z";
  dd("warning", [TRI, { d: "M50 36 L50 62", w: 1.7 }, { d: "M50 74 L50 75.5", w: 1.9 }], [[TRI, "yellow", 1]]);
  dd("question-mark", [{ d: "M30 30 C30 8 70 8 70 30 C70 46 50 46 50 62 L50 66", w: 2.2 }, { d: "M50 82 L50 83.5", w: 2.6 }], []);
  dd("exclamation", [{ d: "M50 10 L50 64", w: 2.4 }, { d: "M50 82 L50 83.5", w: 2.8 }], []);
  dd("battery", [rr(10, 30, 72, 40, 5), rr(82, 42, 8, 16, 2), "M30 36 L30 64", "M48 36 L48 64"], [["M15 35 L60 35 L60 65 L15 65 Z", "green", 1]]);
  var SHIELD = "M50 8 C62 16 76 18 86 18 C86 52 74 76 50 92 C26 76 14 52 14 18 C24 18 38 16 50 8 Z";
  dd("shield", [SHIELD, { d: "M34 50 L46 62 L68 38", w: 1.4 }], [[SHIELD, "blue", 1]]);
  dd("key", [circ(28, 40, 16), circ(28, 40, 5), "M41 49 L86 76", "M72 68 L66 78", "M80 72 L74 82"], [[circ(28, 40, 16) + " " + circ(28, 40, 5), "yellow", 1, "evenodd"]]);
  dd("lock", ["M32 46 L32 32 C32 12 68 12 68 32 L68 46", rr(22, 46, 56, 42, 5), circ(50, 62, 5), "M50 66 L50 76"], [[rr(22, 46, 56, 42, 5), "yellow", 1]]);
  dd("gift", [rr(16, 44, 68, 46, 0), rr(12, 32, 76, 13, 0), "M50 32 L50 90", "M50 32 C40 14 26 22 34 30 C38 32 46 32 50 32 C54 32 62 32 66 30 C74 22 60 14 50 32"],
    [[rr(16, 44, 68, 46, 0), "red", 1], [rr(12, 32, 76, 13, 0), "red", 1]]);
  dd("calendar", [rr(14, 18, 72, 70, 4), "M14 36 L86 36", "M32 10 L32 26", "M68 10 L68 26", "M26 50 L34 50 M46 50 L54 50 M66 50 L74 50 M26 64 L34 64 M46 64 L54 64 M66 64 L74 64 M26 78 L34 78 M46 78 L54 78", { d: circ(70, 77, 8), c: "red" }],
    [["M14 36 L14 22 Q14 18 18 18 L82 18 Q86 18 86 22 L86 36 Z", "red", 1]]);
  var PIN = "M50 92 C40 74 22 58 22 38 C22 20 36 8 50 8 C64 8 78 20 78 38 C78 58 60 74 50 92 Z";
  dd("map-pin", [PIN, circ(50, 38, 10)], [[PIN + " " + circ(50, 38, 10), "red", 1, "evenodd"]]);
  dd("handshake", [
    "M3 36 L21 31 L28 60 L10 65 Z", "M97 36 L79 31 L72 60 L90 65 Z",
    "M24 36 C34 30 44 32 52 38 L62 46 C67 50 64 57 58 54 L50 48",
    "M77 36 C68 32 60 34 54 37",
    "M27 58 C34 66 42 70 50 71 C55 76 62 75 63 70 C68 72 73 68 72 63 C76 62 79 57 76 53 L76 42",
    "M50 71 C52 66 52 62 50 58", "M63 70 C64 66 63 62 61 59", "M72 63 C72 60 70 57 68 55"],
    [["M3 36 L21 31 L28 60 L10 65 Z", "blue", 1], ["M97 36 L79 31 L72 60 L90 65 Z", "blue", 1]]);
  var POT = "M30 64 L70 64 L64 92 L36 92 Z", LEAF1 = "M50 44 C36 44 28 34 30 24 C42 24 50 32 50 44", LEAF2 = "M50 36 C62 34 70 24 70 14 C58 14 50 22 50 36";
  dd("plant", [POT, "M26 58 L74 58 L74 65 L26 65 Z", "M50 58 L50 26", LEAF1, LEAF2], [[LEAF1 + " Z", "green", 1], [LEAF2 + " Z", "green", 1], [POT, "orange"]]);
  dd("hourglass", ["M24 10 L76 10", "M24 90 L76 90", "M30 10 C30 36 46 42 46 50 C46 58 30 64 30 90", "M70 10 C70 36 54 42 54 50 C54 58 70 64 70 90", "M50 52 L50 70"],
    [["M36 28 L64 28 C60 38 52 44 50 48 C48 44 40 38 36 28 Z", "yellow", 1], ["M32 88 C36 74 46 70 50 70 C54 70 64 74 68 88 Z", "yellow", 1]]);
  var FLAG = "M22 12 C36 6 48 18 62 12 C70 9 76 10 82 12 L82 48 C76 46 70 45 62 48 C48 54 36 42 22 48";
  dd("flag", [{ d: "M22 94 L22 6", w: 1.3 }, FLAG, "M14 94 L32 94"], [[FLAG + " Z", "red", 1]]);
  dd("megaphone", [rr(10, 40, 10, 20, 2), "M20 40 L68 18 L68 82 L20 60", ell(68, 50, 6, 32), "M34 62 L38 80 L46 80 L44 66", "M80 34 L92 28", "M82 50 L96 50", "M80 66 L92 72"],
    [["M20 40 L68 18 L68 82 L20 60 Z", "red", 1]]);
  dd("envelope", [rr(10, 24, 80, 52, 3), "M11 27 L50 56 L89 27", "M12 74 L40 50", "M88 74 L60 50"], [[rr(10, 24, 80, 52, 3), "yellow", 1]]);
  dd("atom", [rell(50, 50, 40, 14, 0), rell(50, 50, 40, 14, 60), rell(50, 50, 40, 14, -60), circ(50, 50, 6)], [[circ(50, 50, 6), "red", 1], [circ(90, 50, 3.5), "blue"], [circ(30, 15.4, 3.5), "blue"], [circ(30, 84.6, 3.5), "blue"]]);
  var DOC = "M24 8 L64 8 L80 24 L80 92 L24 92 Z";
  dd("document", [DOC, "M64 8 L64 24 L80 24", "M34 40 L70 40", "M34 52 L70 52", "M34 64 L70 64", "M34 76 L56 76"], [[DOC, "sky", 1]]);
  var PUZ = "M20 30 L40 30 C38 20 44 14 50 14 C56 14 62 20 60 30 L80 30 L80 50 C90 48 96 54 96 60 C96 66 90 72 80 70 L80 90 L20 90 L20 70 C30 72 34 66 34 60 C34 54 30 48 20 50 Z";
  dd("puzzle", [PUZ], [[PUZ, "blue", 1]]);
  dd("scale", ["M50 18 L50 86", "M30 88 L70 88", "M14 28 L86 28", circ(50, 16, 3), "M18 28 L8 56 M18 28 L28 56", "M82 28 L72 56 M82 28 L92 56", "M5 56 C10 67 26 67 31 56 Z", "M69 56 C74 67 90 67 95 56 Z"],
    [["M5 56 C10 67 26 67 31 56 Z", "yellow", 1], ["M69 56 C74 67 90 67 95 56 Z", "yellow", 1]]);
  var PBODY = "M20 72 L66 26 L80 40 L34 86 Z";
  dd("pencil", [PBODY, "M20 72 L12 94 L34 86", "M14.5 87 L12 94 L19 91.5", "M66 26 L73 19 C76 16 80 16 83 19 L87 23 C90 26 90 30 87 33 L80 40", "M62 30 L76 44"],
    [[PBODY, "yellow", 1], ["M66 26 L73 19 C76 16 80 16 83 19 L87 23 C90 26 90 30 87 33 L80 40 Z", "pink"]]);
  var MUG = "M20 36 L72 36 L68 80 C67 86 62 90 56 90 L36 90 C30 90 25 86 24 80 Z";
  dd("coffee", [MUG, "M71 46 C86 44 88 66 69 68", { d: "M36 28 C30 20 42 16 36 6", c: "grey" }, { d: "M52 28 C46 20 58 16 52 6", c: "grey" }, "M12 93 L80 93"], [[MUG, "brown", 1]]);
  var FUSE = "M94 52 C94 46 86 44 76 44 L20 44 C12 44 6 47 6 52 C6 57 12 60 20 60 L76 60 C86 60 94 58 94 52 Z";
  dd("airplane", [FUSE, "M52 50 L36 82 L46 82 L68 52", "M54 46 L42 24 L50 24 L66 46", "M18 46 L10 28 L17 28 L30 45", "M78 49 L84 49"], [[FUSE, "sky", 1]]);
  dd("team", [circ(30, 38, 10), circ(70, 38, 10), "M13 82 C13 58 47 58 47 82", "M53 82 C53 58 87 58 87 82", circ(50, 32, 12), "M31 86 C31 54 69 54 69 86"],
    [["M13 82 C13 58 47 58 47 82 Z", "green"], ["M53 82 C53 58 87 58 87 82 Z", "orange"], ["M31 86 C31 54 69 54 69 86 Z", "blue", 1]]);
  dd("cart", ["M6 18 L18 18 L28 64 L80 64 L88 30 L22 30", circ(34, 76, 6), circ(74, 76, 6), "M44 31 L46 63", "M64 31 L62 63", "M25 47 L84 47"], [["M22 30 L88 30 L80 64 L28 64 Z", "blue", 1]]);
  var EYE = "M6 50 C26 22 74 22 94 50 C74 78 26 78 6 50 Z";
  dd("eye", [EYE, circ(50, 50, 16), circ(50, 50, 6), "M50 22 L50 13", "M30 27 L25 19", "M70 27 L75 19"], [[circ(50, 50, 16), "blue", 1], [circ(50, 50, 6), "black"]]);
  var DROP = "M50 8 C62 30 78 46 78 64 C78 80 64 92 50 92 C36 92 22 80 22 64 C22 46 38 30 50 8 Z";
  dd("water-drop", [DROP, "M35 62 C35 72 41 78 47 80"], [[DROP, "blue", 1]]);
  var FIRE = "M50 92 C26 92 16 74 20 56 C24 42 36 36 34 20 C46 26 52 36 50 48 C56 42 58 34 56 26 C72 38 84 56 80 70 C78 84 66 92 50 92 Z";
  var FIRE2 = "M50 90 C40 90 34 82 36 72 C38 64 46 60 46 52 C54 58 62 66 62 76 C62 84 56 90 50 90 Z";
  dd("fire", [FIRE, FIRE2], [[FIRE, "orange", 1], [FIRE2, "yellow"]]);
  var BOLT = "M58 6 L24 54 L46 54 L38 94 L76 40 L54 40 L64 6 Z";
  dd("lightning", [BOLT], [[BOLT, "yellow", 1]]);
  dd("graduation-cap", ["M50 18 L94 36 L50 54 L6 36 Z", "M24 44 L24 66 C24 76 76 76 76 66 L76 44", "M50 36 L84 44 L84 70", "M80 70 L88 70 L86 80 L82 80 Z"],
    [["M50 18 L94 36 L50 54 L6 36 Z", "blue", 1], ["M24 44 L24 66 C24 76 76 76 76 66 L76 44 L50 54 Z", "blue", 1]]);
  (function () {
    var a = [], b = [], rungs = [];
    for (var i = 0; i <= 40; i++) {
      var y = 6 + i * 2.2, ph = (i / 40) * PI * 3;
      a.push([50 + Math.sin(ph) * 20, y]);
      b.push([50 - Math.sin(ph) * 20, y]);
      if (i % 4 === 2) rungs.push(poly([[50 + Math.sin(ph) * 20, y], [50 - Math.sin(ph) * 20, y]]));
    }
    dd("dna", [{ d: poly(a), c: "blue" }, { d: poly(b), c: "red" }].concat(rungs), []);
  })();
  var THUMB = "M30 46 L44 46 C50 38 54 30 54 18 C54 10 66 10 66 22 C66 30 62 38 62 44 L80 44 C88 44 90 52 86 56 C90 60 88 66 84 68 C88 72 84 78 80 78 C84 82 80 88 74 88 L44 88 L30 88";
  dd("thumbs-up", [THUMB, rr(14, 44, 16, 46, 2), "M66 56 L84 56", "M68 67 L84 67", "M68 78 L80 78"], [[THUMB + " Z", "#F2C9A0", 1], [rr(14, 44, 16, 46, 2), "blue"]]);
  dd("robot", [rr(26, 22, 48, 38, 6), circ(40, 40, 5), circ(60, 40, 5), "M40 52 L60 52", "M50 22 L50 11", circ(50, 8, 3), "M44 60 L44 63 M56 60 L56 63", rr(30, 63, 40, 28, 4), "M30 70 L16 80", "M70 70 L84 60", "M42 74 L58 74"],
    [[rr(26, 22, 48, 38, 6), "sky", 1], [rr(30, 63, 40, 28, 4), "sky", 1]]);
  var CROWN = "M14 74 L10 30 L32 50 L50 20 L68 50 L90 30 L86 74 Z";
  dd("crown", [CROWN, "M14 74 L86 74 L86 84 L14 84 Z", circ(50, 63, 4), circ(30, 64, 3), circ(70, 64, 3)], [[CROWN, "yellow", 1], ["M14 74 L86 74 L86 84 L14 84 Z", "yellow", 1]]);
  var SKY = "M4 90 L4 50 L20 50 L20 30 L36 30 L36 60 L46 60 L46 16 L62 16 L62 46 L74 46 L74 34 L90 34 L90 90";
  dd("city", [SKY, "M2 90 L98 90", "M10 58 L14 58 M10 68 L14 68 M26 38 L30 38 M26 48 L30 48 M26 58 L30 58 M51 24 L57 24 M51 34 L57 34 M51 44 L57 44 M51 54 L57 54 M79 42 L85 42 M79 52 L85 52 M79 62 L85 62"],
    [[SKY + " Z", "grey", 1]]);
  dd("truck", [rr(6, 30, 56, 42, 0), "M62 44 L80 44 L92 58 L92 72 L62 72", "M66 48 L78 48 L86 58 L66 58 Z", circ(22, 76, 8), circ(76, 76, 8)],
    [[rr(6, 30, 56, 42, 0), "orange", 1], ["M62 44 L80 44 L92 58 L92 72 L62 72 Z", "red"]]);
  var UMB = "M8 52 C8 26 30 10 50 10 C70 10 92 26 92 52 C86 46 78 46 72 52 C66 46 56 46 50 52 C44 46 34 46 28 52 C22 46 14 46 8 52 Z";
  dd("umbrella", [UMB, "M50 52 L50 84 C50 92 38 92 38 84", "M50 10 L50 52", "M30 16 C26 30 28 42 28 52", "M70 16 C74 30 72 42 72 52"], [[UMB, "blue", 1]]);
  dd("wifi", [{ d: arcP(50, 80, 46, -135, -45), w: 1.5 }, { d: arcP(50, 80, 31, -135, -45), w: 1.5 }, { d: arcP(50, 80, 16, -135, -45), w: 1.5 }, circ(50, 80, 3.5)], [[circ(50, 80, 3.5), "black", 1]]);
  dd("arrow-right", [{ d: "M8 50 L86 50", w: 1.6 }, { d: "M64 28 L88 50 L64 72", w: 1.6 }], []);
  dd("arrow-up", [{ d: "M50 92 L50 14", w: 1.6 }, { d: "M28 36 L50 12 L72 36", w: 1.6 }], []);
  dd("arrow-down", [{ d: "M50 8 L50 86", w: 1.6 }, { d: "M28 64 L50 88 L72 64", w: 1.6 }], []);
  dd("light-switch", [rr(28, 10, 44, 80, 6), rr(41, 28, 18, 44, 3), "M41 46 L59 46", circ(50, 18, 1.5), circ(50, 82, 1.5)], [["M41 28 L59 28 L59 46 L41 46 Z", "yellow", 1]]);
  var SL1 = "M50 56 C36 58 26 48 26 36 C40 34 50 44 50 56", SL2 = "M50 52 C62 52 74 42 74 30 C60 30 50 40 50 52";
  dd("seedling", ["M18 84 C30 72 70 72 82 84", "M8 86 L92 86", "M50 78 L50 50", SL1, SL2], [[SL1 + " Z", "green", 1], [SL2 + " Z", "green", 1], ["M18 84 C30 72 70 72 82 84 Z", "brown"]]);

  // Sketch portraits.
  var HEAD = "M50 12 C70 12 82 28 82 50 C82 74 68 90 50 90 C32 90 18 74 18 50 C18 28 30 12 50 12";
  var EARS = ["M19 46 C11 44 11 58 20 59", "M81 46 C89 44 89 58 80 59"];
  function face(name, parts, fills) { dd(name, [HEAD].concat(EARS, parts), fills); }
  var EYES = [{ d: "M39 46 L39 48.5", w: 2.2 }, { d: "M61 46 L61 48.5", w: 2.2 }];
  face("face-happy", EYES.concat(["M33 37 C36 34 41 34 44 36", "M56 36 C59 34 64 34 67 37", "M35 63 C42 75 58 75 65 63"]), [[circ(31, 60, 5), "pink", 1], [circ(69, 60, 5), "pink", 1]]);
  face("face-sad", EYES.concat(["M33 38 L44 35", "M67 38 L56 35", "M37 72 C44 63 56 63 63 72", { d: "M67 54 C65 60 68 63 70 60 C71 58 69 56 67 54", c: "blue" }]), [["M67 54 C65 60 68 63 70 60 C71 58 69 56 67 54 Z", "sky", 1]]);
  face("face-surprised", [circ(39, 46, 4), circ(61, 46, 4), arcP(39, 38, 8, -160, -20), arcP(61, 38, 8, -160, -20), ell(50, 68, 6, 8)], [[ell(50, 68, 6, 8), "red", 1]]);
  face("face-worried", EYES.concat(["M33 39 L44 34", "M67 39 L56 34", "M36 69 C40 64 44 64 48 69 C52 74 56 74 60 69 C62 66 64 66 66 69", { d: "M78 30 C75 36 78 40 81 37 C83 34 80 32 78 30", c: "blue" }]), [["M78 30 C75 36 78 40 81 37 C83 34 80 32 78 30 Z", "sky", 1]]);
  face("face-angry", EYES.concat([{ d: "M32 35 L45 41", w: 1.5 }, { d: "M68 35 L55 41", w: 1.5 }, "M38 70 C44 65 56 65 62 70"]), [[HEAD + " Z", "red", 1]]);
  var HAIR_W = "M20 72 C10 40 20 10 50 10 C80 10 90 40 80 72";
  face("face-woman", [HAIR_W, "M24 38 C38 34 50 26 58 16 C64 26 72 32 80 36"].concat(EYES, ["M36 44 L34 41", "M64 44 L66 41", "M38 64 C44 71 56 71 62 64"]), [[HAIR_W + " C78 52 82 30 70 22 C62 30 46 36 24 38 C20 50 22 62 20 72 Z", "brown", 1]]);
  face("face-woman-bun", [circ(50, 8, 9), "M19 46 C19 22 32 14 50 14 C68 14 81 22 81 46 C70 33 55 28 40 31 C31 33 24 39 19 46"].concat(EYES, ["M38 64 C44 71 56 71 62 64"]),
    [[circ(50, 8, 9), "brown", 1], ["M19 46 C19 22 32 14 50 14 C68 14 81 22 81 46 C70 33 55 28 40 31 C31 33 24 39 19 46 Z", "brown", 1]]);
  var HAIR_M = "M18 44 C16 22 32 10 50 10 C68 10 84 22 82 44 C76 34 66 28 50 30 C36 30 26 34 18 44 Z";
  face("face-man", [HAIR_M].concat(EYES, ["M33 39 L44 38", "M56 38 L67 39", "M38 64 C44 70 56 70 62 64"]), [[HAIR_M, "brown", 1]]);
  face("face-professor", ["M19 47 C12 41 14 32 21 30", "M81 47 C88 41 86 32 79 30", circ(38, 47, 8), circ(62, 47, 8), "M46 46 L54 46", "M36 64 C42 59 48 60 50 62 C52 60 58 59 64 64", "M42 72 C46 74 54 74 58 72", "M32 37 L43 36", "M57 36 L68 37"],
    [["M19 47 C12 41 14 32 21 30 L24 40 Z", "grey", 1], ["M81 47 C88 41 86 32 79 30 L76 40 Z", "grey", 1], ["M36 64 C42 59 48 60 50 62 C52 60 58 59 64 64 C58 68 42 68 36 64 Z", "grey", 1]]);

  // Stick figures: joints in a 100-tall box.
  var POSE = {
    stand: { h: [50, 14], n: [50, 25], p: [50, 60], e1: [41, 44], a1: [37, 60], e2: [59, 44], a2: [63, 60], k1: [45, 79], f1: [41, 98], k2: [55, 79], f2: [59, 98], m: "smile" },
    wave: { h: [50, 14], n: [50, 25], p: [50, 60], e1: [41, 44], a1: [37, 60], e2: [65, 29], a2: [70, 10], k1: [45, 79], f1: [41, 98], k2: [55, 79], f2: [59, 98], m: "smile", x: ["M76 6 C80 10 80 14 77 18", "M81 2 C87 8 87 16 82 21"] },
    walk: { h: [51, 14], n: [51, 25], p: [50, 60], e1: [43, 43], a1: [38, 56], e2: [58, 43], a2: [64, 55], k1: [44, 78], f1: [34, 97], k2: [57, 79], f2: [64, 98], m: "smile" },
    run: { h: [56, 15], n: [54, 26], p: [47, 58], e1: [63, 37], a1: [71, 27], e2: [42, 40], a2: [33, 48], k1: [61, 71], f1: [58, 90], k2: [38, 74], f2: [25, 85], m: "smile", x: ["M14 30 L4 30", "M16 42 L6 42", "M18 54 L8 54"] },
    cheer: { h: [50, 16], n: [50, 27], p: [50, 61], e1: [38, 22], a1: [31, 6], e2: [62, 22], a2: [69, 6], k1: [43, 79], f1: [37, 98], k2: [57, 79], f2: [63, 98], m: "smile" },
    think: { h: [50, 14], n: [50, 25], p: [50, 60], e1: [42, 44], a1: [57, 47], e2: [64, 42], a2: [56, 27], k1: [45, 79], f1: [41, 98], k2: [55, 79], f2: [59, 98], m: "flat", x: [circ(70, 8, 1.6), circ(77, 2, 2.4)] },
    point: { h: [50, 14], n: [50, 25], p: [50, 60], e1: [41, 44], a1: [37, 60], e2: [66, 32], a2: [85, 29], k1: [45, 79], f1: [41, 98], k2: [55, 79], f2: [59, 98], m: "smile" },
    sit: { h: [44, 30], n: [44, 41], p: [44, 70], e1: [53, 55], a1: [63, 66], e2: [55, 56], a2: [66, 65], k1: [66, 69], f1: [66, 97], k2: [68, 71], f2: [71, 97], m: "smile", x: ["M28 73 L60 73", "M32 73 L32 98", "M57 73 L57 98", "M28 73 L28 46"] },
    sad: { h: [50, 18], n: [50, 29], p: [50, 62], e1: [45, 46], a1: [43, 62], e2: [55, 46], a2: [57, 62], k1: [46, 80], f1: [43, 98], k2: [54, 80], f2: [57, 98], m: "frown" },
    shrug: { h: [50, 14], n: [50, 25], p: [50, 60], e1: [36, 42], a1: [27, 30], e2: [64, 42], a2: [73, 30], k1: [45, 79], f1: [41, 98], k2: [55, 79], f2: [59, 98], m: "flat" },
    jump: { h: [50, 10], n: [50, 21], p: [50, 54], e1: [38, 16], a1: [32, 2], e2: [62, 16], a2: [68, 2], k1: [40, 68], f1: [34, 80], k2: [60, 68], f2: [66, 80], m: "open", x: ["M30 96 L42 96", "M58 96 L70 96"] },
    worried: { h: [50, 15], n: [50, 26], p: [50, 61], e1: [34, 25], a1: [43, 8], e2: [66, 25], a2: [57, 8], k1: [45, 80], f1: [41, 98], k2: [55, 80], f2: [59, 98], m: "frown", x: [{ d: "M66 14 C63 20 66 24 69 21 C71 18 68 16 66 14", c: "blue" }] },
  };
  function figureStrokes(pose) {
    var P = POSE[pose] || POSE.stand, h = P.h, n = P.n, p = P.p;
    var sh = [lerp(n[0], p[0], 0.15), lerp(n[1], p[1], 0.15)];
    var face = [];
    var fx = h[0], fy = h[1];
    face.push({ d: "M" + (fx - 3.5) + " " + (fy - 1.5) + " L" + (fx - 3.5) + " " + (fy - 0.3), w: 0.9 }, { d: "M" + (fx + 3.5) + " " + (fy - 1.5) + " L" + (fx + 3.5) + " " + (fy - 0.3), w: 0.9 });
    if (P.m === "smile") face.push({ d: "M" + (fx - 4) + " " + (fy + 3) + " C" + (fx - 2) + " " + (fy + 6) + " " + (fx + 2) + " " + (fy + 6) + " " + (fx + 4) + " " + (fy + 3), w: 0.7 });
    else if (P.m === "frown") face.push({ d: "M" + (fx - 4) + " " + (fy + 5.5) + " C" + (fx - 2) + " " + (fy + 2.5) + " " + (fx + 2) + " " + (fy + 2.5) + " " + (fx + 4) + " " + (fy + 5.5), w: 0.7 });
    else if (P.m === "open") face.push({ d: ell(fx, fy + 4.5, 2.4, 2), w: 0.7 });
    else face.push({ d: "M" + (fx - 3.5) + " " + (fy + 4.5) + " L" + (fx + 3.5) + " " + (fy + 4.5), w: 0.7 });
    var s = [circ(h[0], h[1], 10), poly([n, p]), poly([sh, P.e1, P.a1]), poly([sh, P.e2, P.a2]), poly([p, P.k1, P.f1]), poly([p, P.k2, P.f2])].concat(face, P.x || []);
    return s;
  }
  Object.keys(POSE).forEach(function (k) { DL["stick-" + k] = { s: figureStrokes(k), f: [], w: 1.25, fig: 1 }; });

  var SYN = {
    idea: "lightbulb", ideas: "lightbulb", bulb: "lightbulb", insight: "lightbulb", creativity: "lightbulb", think: "brain", thinking: "brain", mind: "brain", smart: "brain", memory: "brain",
    coin: "coins", cash: "money", dollar: "money", dollars: "money", pay: "money", price: "money", cost: "money", salary: "money", income: "money", profit: "money-bag", wealth: "money-bag", rich: "money-bag", savings: "piggybank", save: "piggybank", saving: "piggybank", bank: "piggybank",
    home: "house", building: "house", world: "globe", earth: "globe", planet: "globe", global: "globe", international: "globe", time: "clock", hour: "clock", hours: "clock", minute: "clock", late: "clock",
    launch: "rocket", startup: "rocket", fast: "rocket", space: "rocket", love: "heart", health: "heart", care: "heart", healthy: "heart", process: "gears", system: "gears", machine: "gears", engine: "gears", settings: "gears", work: "gears",
    growth: "chart-up", grow: "chart-up", increase: "chart-up", rise: "chart-up", up: "arrow-up", data: "chart-up", sales: "chart-up", decline: "chart-down", drop: "chart-down", fall: "chart-down", loss: "chart-down", share: "chart-pie", percent: "chart-pie",
    search: "magnifier", find: "magnifier", research: "magnifier", look: "magnifier", mobile: "phone", call: "phone", app: "phone", computer: "laptop", online: "laptop", internet: "wifi", software: "laptop", learn: "book", learning: "book", read: "book", study: "book", knowledge: "book", school: "graduation-cap", education: "graduation-cap", university: "graduation-cap", graduate: "graduation-cap",
    win: "trophy", winner: "trophy", success: "trophy", award: "trophy", prize: "trophy", goal: "target", goals: "target", aim: "target", focus: "target", challenge: "mountain", climb: "mountain", nature: "tree", environment: "tree", forest: "tree", weather: "cloud", rain: "cloud-rain", storm: "cloud-rain", travel: "airplane", flight: "airplane", trip: "airplane", drive: "car", traffic: "car", commute: "car", industry: "factory", production: "factory", manufacturing: "factory",
    question: "question-mark", why: "question-mark", how: "question-mark", danger: "warning", risk: "warning", caution: "warning", problem: "warning", mistake: "cross", wrong: "cross", no: "cross", right: "check", yes: "check", done: "check", correct: "check", energy: "lightning", power: "battery", electricity: "lightning",
    security: "shield", safe: "shield", safety: "shield", protect: "shield", protection: "shield", password: "lock", privacy: "lock", secret: "key", access: "key", unlock: "key", present: "gift", bonus: "gift", gift: "gift", date: "calendar", schedule: "calendar", deadline: "hourglass", week: "calendar", month: "calendar", year: "calendar", location: "map-pin", place: "map-pin", map: "map-pin", where: "map-pin",
    deal: "handshake", partner: "handshake", partnership: "handshake", agreement: "handshake", trust: "handshake", plant: "plant", garden: "plant", wait: "hourglass", patience: "hourglass", finish: "flag", milestone: "flag", start: "flag", marketing: "megaphone", announce: "megaphone", advertising: "megaphone", email: "envelope", mail: "envelope", letter: "envelope", message: "speech-bubble", talk: "speech-bubble", chat: "speech-bubble", say: "speech-bubble",
    science: "atom", physics: "atom", chemistry: "atom", contract: "document", paper: "document", report: "document", file: "document", form: "document", solution: "puzzle", solve: "puzzle", fair: "scale", law: "scale", justice: "scale", balance: "scale", write: "pencil", writing: "pencil", design: "pencil", plan: "pencil", morning: "coffee", break: "coffee", team: "team", people: "team", group: "team", teamwork: "team", community: "team", shop: "cart", shopping: "cart", buy: "cart", store: "cart",
    see: "eye", vision: "eye", watch: "eye", water: "water-drop", hot: "fire", burn: "fire", passion: "fire", genetics: "dna", biology: "dna", like: "thumbs-up", good: "thumbs-up", great: "thumbs-up", ai: "robot", robot: "robot", automation: "robot", king: "crown", best: "crown", leader: "crown", city: "city", town: "city", delivery: "truck", shipping: "truck", logistics: "truck", protected: "umbrella", insurance: "umbrella", wifi: "wifi", network: "wifi",
    next: "arrow-right", forward: "arrow-right", switch: "light-switch", begin: "seedling", seed: "seedling", small: "seedling",
    person: "stick-stand", man: "face-man", woman: "face-woman", expert: "face-professor", teacher: "face-professor", professor: "face-professor", happy: "face-happy", sad: "face-sad", surprised: "face-surprised", worried: "face-worried", angry: "face-angry", stress: "face-worried", stressed: "face-worried", run: "stick-run", running: "stick-run", exercise: "stick-run",
  };
  function hasDoodle(n) { return !!DL[n]; }
  function pickDoodle(text) {
    var t = str(text).toLowerCase();
    if (DL[t]) return t;
    if (SYN[t]) return SYN[t];
    var ws = t.split(/[^a-z0-9-]+/).filter(Boolean);
    for (var i = 0; i < ws.length; i++) if (DL[ws[i]]) return ws[i];
    for (i = 0; i < ws.length; i++) if (SYN[ws[i]]) return SYN[ws[i]];
    for (i = 0; i < ws.length; i++) { var w = ws[i].replace(/(ies|es|s)$/, ""); if (DL[w]) return w; if (SYN[w]) return SYN[w]; }
    return "lightbulb";
  }
  function doodleName(n) { n = str(n); return DL[n] ? n : pickDoodle(n); }

  // Local stroke cache: doodle name -> [{pts, c, w}] and fills.
  var localCache = {};
  function localDoodle(name) {
    if (localCache[name]) return localCache[name];
    var def = DL[name], strokes = [], total = 0;
    def.s.forEach(function (s) {
      var d = typeof s === "string" ? s : s.d, c = typeof s === "string" ? null : s.c, w = typeof s === "string" ? 1 : s.w || 1;
      splitD(d).forEach(function (sd) {
        var pts = sample(sd, 1.2), cum = cumOf(pts);
        total += cum[cum.length - 1];
        strokes.push({ pts: pts, c: c, w: w, len: cum[cum.length - 1] });
      });
    });
    var fills = def.f.map(function (f) { return { d: f[0], c: f[1], main: !!f[2], rule: f[3] || "nonzero", bb: bboxOfD(f[0]) }; });
    if (fills.length && !fills.some(function (f) { return f.main; })) fills[0].main = true;
    return (localCache[name] = { strokes: strokes, fills: fills, total: total, w: def.w, fig: def.fig });
  }

  // ------------------------- state -------------------------
  var st = null;
  var GAP = 0.15;

  function board(root, o) {
    o = o || {};
    root = root || V.root();
    var tone = SKIN[o.hand] ? o.hand : "light";
    var paper = o.paper === "cream" || o.paper === "grid" ? o.paper : "white";
    var wrap = doc.createElement("div");
    wrap.className = "wb wb-" + paper;
    root.appendChild(wrap);
    var s = svg("svg", { class: "wb-svg", width: W, height: H, viewBox: "0 0 " + W + " " + H }, wrap);
    var defs = svg("defs", {}, s);
    var cam = svg("g", { class: "wb-cam" }, s);
    var paperG = svg("g", { class: "wb-paper" }, cam);
    var inkRoot = svg("g", { class: "wb-ink" }, cam);
    var handG = svg("g", { class: "wb-hand" }, s);
    st = {
      root: wrap, svg: s, defs: defs, cam: cam, paper: paperG, inkRoot: inkRoot, handG: handG,
      segs: [], cams: [], cursor: 0.2, handFree: 0, any: false, uid: 0, dirty: true,
      rnd: V.makeRand(((V.seed || 1) * 2654435761) >>> 0 || 7),
      tone: tone, sleeve: o.sleeve || "#34405A", handScale: (+o.handScale || 1) * u(1.3), drift: +o.drift || 0,
      warned: false, items: [], erases: [],
    };
    newLayer();
    drawPaper(paper);
    buildHand();
    var me = st;
    V.onFrame(function (t) { if (st === me) frame(t); });
    return { svg: s, root: wrap, defs: defs };
  }
  function ensure() { if (!st) board(V.root(), {}); return st; }
  function newLayer() {
    var L = svg("g", { class: "wb-layer" }, st.inkRoot);
    st.fillG = svg("g", { class: "wb-fills" }, L);
    st.lineG = svg("g", { class: "wb-lines" }, L);
    st.layer = L;
  }
  function uid(p) { return "wb" + (p || "") + ++st.uid; }

  function drawPaper(kind) {
    var g = st.paper, r = V.makeRand(991 + (V.seed || 1));
    var big = Math.max(W, H) * 12;
    if (kind === "grid") {
      var id = uid("grid"), sp = u(48);
      var pat = svg("pattern", { id: id, width: sp, height: sp, patternUnits: "userSpaceOnUse" }, st.defs);
      svg("path", { d: "M" + sp + " 0 L0 0 L0 " + sp, fill: "none", stroke: "#9DB7DA", "stroke-opacity": "0.35", "stroke-width": u(1.4) }, pat);
      svg("rect", { x: -big, y: -big, width: big * 2, height: big * 2, fill: "url(#" + id + ")" }, g);
    }
    // faint marker ghosts and smudges so pans read as a real board moving
    var gid = uid("smudge");
    var rg = svg("radialGradient", { id: gid }, st.defs);
    svg("stop", { offset: "0", "stop-color": "#7f8590", "stop-opacity": "0.07" }, rg);
    svg("stop", { offset: "1", "stop-color": "#7f8590", "stop-opacity": "0" }, rg);
    var span = Math.max(W, H) * 6;
    for (var i = 0; i < 60; i++) {
      var x = (r() - 0.25) * span, y = (r() - 0.25) * span;
      svg("ellipse", { cx: f1(x), cy: f1(y), rx: f1(u(120 + r() * 260)), ry: f1(u(40 + r() * 90)), fill: "url(#" + gid + ")", transform: "rotate(" + f1(r() * 60 - 30) + " " + f1(x) + " " + f1(y) + ")" }, g);
    }
  }

  // ------------------------- segments and scheduling -------------------------
  // A segment is one pen movement: [t0, t1], points the hand follows, and an update(state, e).
  function dashUpdate(g, ns, e) {
    var s = g.el.style;
    if (ns === 0) s.visibility = "hidden";
    else if (ns === 2) { s.visibility = "visible"; s.strokeDasharray = "none"; }
    else { s.visibility = "visible"; s.strokeDasharray = Math.max(0.01, e * g.len).toFixed(2) + " " + (g.len + 50).toFixed(1); }
  }
  function mkStroke(pts, color, width, parent, extra) {
    var el = svg("path", { d: dOf(pts), fill: "none", stroke: color, "stroke-width": f2(width), "stroke-linecap": "round", "stroke-linejoin": "round" }, parent);
    if (extra) for (var k in extra) el.setAttribute(k, extra[k]);
    el.style.visibility = "hidden";
    var cum = cumOf(pts);
    return { el: el, pts: pts, cum: cum, len: cum[cum.length - 1] || 0.01, w: 0, update: dashUpdate, tool: "marker" };
  }
  // Give segs absolute times. Each seg.w is its share in seconds before scaling to `dur`.
  function schedule(segs, opts, defDur) {
    var s = ensure();
    opts = opts || {};
    var start = opts.at != null && isFinite(+opts.at) ? +opts.at : s.any ? s.cursor + GAP : s.cursor;
    start = Math.max(0, start, s.any ? s.handFree + 0.04 : 0);
    var dur = opts.dur != null && isFinite(+opts.dur) ? Math.max(0.05, +opts.dur) : defDur;
    if (opts.speed) dur /= Math.max(0.1, +opts.speed);
    var n = segs.length, lift = n > 1 ? Math.min(0.06, (dur * 0.22) / (n - 1)) : 0;
    var sumW = 0;
    segs.forEach(function (g) { sumW += g.w; });
    var draw = Math.max(0.01, dur - lift * (n - 1)), t = start;
    segs.forEach(function (g, i) {
      var d = sumW > 0 ? (draw * g.w) / sumW : draw / n;
      g.t0 = t;
      g.t1 = t + Math.max(0.008, d);
      g.state = -1;
      t = g.t1 + (i < n - 1 ? lift : 0);
      s.segs.push(g);
    });
    var end = n ? segs[n - 1].t1 : start;
    s.handFree = Math.max(s.handFree, end);
    s.cursor = end;
    s.any = true;
    s.dirty = true;
    return { t0: start, t1: end };
  }
  function itemOf(b, times, g) {
    return { x: b.x, y: b.y, w: b.w, h: b.h, cx: b.x + b.w / 2, cy: b.y + b.h / 2, t0: times.t0, t1: times.t1, end: times.t1, g: g };
  }

  // ------------------------- marker colour fill (scribble) -------------------------
  function hatchPts(bb, sp, angDeg, rnd) {
    var a = (angDeg * PI) / 180, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
    var pad = sp * 0.4, x0 = bb.x - pad, y0 = bb.y - pad, x1 = bb.x + bb.w + pad, y1 = bb.y + bb.h + pad;
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    var vmin = Infinity, vmax = -Infinity;
    corners.forEach(function (c) { var v = (c[0] - cx) * nx + (c[1] - cy) * ny; vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); });
    var out = [], k = 0;
    for (var v = vmin + sp * 0.5; v <= vmax; v += sp, k++) {
      var px = cx + nx * v, py = cy + ny * v, lo = -1e9, hi = 1e9;
      // clip the line p + u*s to the box
      [[ux, x0 - px, x1 - px], [uy, y0 - py, y1 - py]].forEach(function (q) {
        if (Math.abs(q[0]) < 1e-9) { if (q[1] > 0 || q[2] < 0) { lo = 1; hi = 0; } return; }
        var s0 = q[1] / q[0], s1 = q[2] / q[0];
        if (s0 > s1) { var tmp = s0; s0 = s1; s1 = tmp; }
        lo = Math.max(lo, s0); hi = Math.min(hi, s1);
      });
      if (hi <= lo) continue;
      var j0 = (rnd() - 0.5) * sp * 0.8, j1 = (rnd() - 0.5) * sp * 0.8;
      var A = [px + ux * (lo + j0), py + uy * (lo + j0)], B = [px + ux * (hi + j1), py + uy * (hi + j1)];
      if (k % 2) out.push(B[0], B[1], A[0], A[1]);
      else out.push(A[0], A[1], B[0], B[1]);
    }
    if (out.length < 4) out = [bb.x, bb.y, bb.x + bb.w, bb.y + bb.h];
    return out;
  }
  // Fill closed local path d (local -> board matrix m) with marker scribbles. Returns a seg.
  function fillSeg(d, m, scale, color, spacingBoard, rule, parent, opacity) {
    var s = ensure();
    var id = uid("clip");
    var cp = svg("clipPath", { id: id, clipPathUnits: "userSpaceOnUse" }, s.defs);
    svg("path", { d: d, "clip-rule": rule || "nonzero", transform: "matrix(" + m.map(f2).join(" ") + ")" }, cp);
    var bb = bboxOfD(d);
    var spL = spacingBoard / scale;
    var local = hatchPts(bb, spL, -32 + (s.rnd() - 0.5) * 14, s.rnd);
    var pts = applyM(m, local);
    var g = mkStroke(pts, color, spacingBoard * 1.85, parent, { "clip-path": "url(#" + id + ")", "stroke-opacity": opacity == null ? "0.72" : String(opacity), class: "wb-fill" });
    g.isFill = true;
    return g;
  }

  // ------------------------- doodles and figures -------------------------
  function lineWidthFor(size, mult) { return clamp(size * 0.024, u(3.6), u(8.5)) * (mult || 1); }
  function doodleDefaultDur(name, size) {
    var L = localDoodle(name), n = L.strokes.length;
    var outline = clamp(0.45 + L.total / 560 + n * 0.035, 0.6, 3.2);
    var fill = L.fills.length ? clamp(0.3 + 0.14 * L.fills.length, 0.35, 1.2) : 0;
    return { outline: outline, fill: fill, total: outline + fill };
  }
  function buildDoodle(name, o, parentLines, parentFills) {
    var s = ensure();
    var L = localDoodle(name);
    var size = +o.size > 0 ? +o.size : u(260);
    var x = o.x != null ? +o.x : W / 2, y = o.y != null ? +o.y : H / 2;
    var sc = size / 100;
    var m = mat(x, y, sc, o.rot || 0, !!o.flip, 50, 50);
    var baseW = lineWidthFor(size, (L.w || 1) * (+o.weight || 1));
    var inkC = colorOf(o.ink, INK.black);
    var amp = o.wobble != null ? +o.wobble : size * 0.0055;
    var lineSegs = [], fillSegs = [], all = [];
    L.strokes.forEach(function (k) {
      var pts = wobble(applyM(m, k.pts), amp, s.rnd);
      all.push(pts);
      var g = mkStroke(pts, k.c ? colorOf(k.c) : inkC, baseW * k.w, parentLines);
      g.w = k.len;
      lineSegs.push(g);
    });
    if (o.fill !== false) {
      var sp = clamp(size * 0.036, u(5), u(15));
      L.fills.forEach(function (f) {
        var c = f.main && o.color ? colorOf(o.color) : colorOf(f.c);
        var g = fillSeg(f.d, m, sc, c, sp, f.rule, parentFills);
        g.w = Math.max(1, f.bb.w * f.bb.h);
        fillSegs.push(g);
      });
    }
    return { lineSegs: lineSegs, fillSegs: fillSegs, bounds: boundsOf(all), size: size };
  }
  function doodle(name, o) {
    o = o || {};
    var s = ensure();
    name = doodleName(name);
    var grp = svg("g", { class: "wb-doodle", "data-name": name }, s.lineG);
    var fgrp = svg("g", { class: "wb-doodle-fill" }, s.fillG);
    var b = buildDoodle(name, o, grp, fgrp);
    var dd0 = doodleDefaultDur(name, b.size);
    var outline = dd0.outline, fill = o.fill === false ? 0 : o.fillDur != null ? +o.fillDur : dd0.fill;
    var total = outline + fill;
    if (o.dur != null && isFinite(+o.dur)) { var k = Math.max(0.05, +o.dur) / total; outline *= k; fill = o.fillDur != null ? +o.fillDur : fill * k; }
    if (o.speed) { outline /= +o.speed; fill /= +o.speed; }
    var sumL = 0, sumF = 0;
    b.lineSegs.forEach(function (g) { sumL += g.w; });
    b.fillSegs.forEach(function (g) { sumF += g.w; });
    b.lineSegs.forEach(function (g) { g.w = (outline * g.w) / (sumL || 1); });
    b.fillSegs.forEach(function (g) { g.w = (fill * g.w) / (sumF || 1); });
    var segs = b.lineSegs.concat(b.fillSegs);
    var times = schedule(segs, { at: o.at }, outline + fill);
    var it = itemOf(b.bounds, times, grp);
    s.items.push({ kind: "doodle", label: name, it: it });
    return it;
  }
  function figure(pose, o) {
    o = o || {};
    pose = POSE[pose] ? pose : String(pose || "").replace(/^stick-/, "");
    if (!POSE[pose]) pose = "stand";
    return doodle("stick-" + pose, o);
  }

  // ------------------------- handwriting -------------------------
  var glyphCache = {};
  function prepText(text) {
    text = String(text == null ? "" : text);
    var out = "";
    for (var i = 0; i < text.length; i++) out += CHARMAP[text[i]] != null ? CHARMAP[text[i]] : text[i];
    return out.normalize("NFD");
  }
  // Parse into paragraphs -> words -> clusters {b: base, m: [marks], em}
  function parseText(text) {
    text = prepText(text);
    var paras = [], em = false, ok = true;
    text.split(/\n/).forEach(function (line) {
      var words = [], cur = null;
      for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        if (ch === "*") { em = !em; continue; }
        if (ch === " " || ch === "\t") { if (cur && cur.length) words.push(cur); cur = null; continue; }
        if (/[\u0300-\u036f]/.test(ch)) {
          if (cur && cur.length) { cur[cur.length - 1].m.push(ch); if (!MARKS[ch]) ok = false; }
          continue;
        }
        if (!cur) cur = [];
        if (!GL[ch]) ok = false;
        cur.push({ b: ch, m: [], em: em });
      }
      if (cur && cur.length) words.push(cur);
      paras.push(words);
    });
    return { paras: paras, ok: ok };
  }
  function glyphLocal(cl) {
    var key = cl.b + cl.m.join("");
    if (glyphCache[key]) return glyphCache[key];
    var base = cl.b;
    var above = cl.m.some(function (m) { return MARKS[m] && MARKS[m] !== "BELOW"; });
    if (above && base === "i") base = "\u0131";
    if (above && base === "j") base = "\u0237";
    var g = GL[base] || GL["?"];
    var strokes = [];
    splitD(g[1]).forEach(function (sd) { var pts = sample(sd, 2.4); strokes.push(pts); });
    var cx = g[0] / 2, top = TALL.test(cl.b) ? 0 : 46;
    cl.m.forEach(function (mk) {
      var md = MARKS[mk];
      if (!md) return;
      if (md === "BELOW") md = CEDILLA;
      splitD(md).forEach(function (sd) {
        var pts = sample(sd, 2.4);
        var dy = MARKS[mk] === "BELOW" ? 0 : top;
        for (var i = 0; i < pts.length; i += 2) { pts[i] += cx; pts[i + 1] += dy; }
        strokes.push(pts);
      });
    });
    return (glyphCache[key] = { adv: g[0], strokes: strokes });
  }
  function wordWidth(word, sc) { var w = 0; word.forEach(function (cl) { w += (glyphLocal(cl).adv + TRACK) * sc; }); return w - TRACK * sc; }
  var FALLBACK_FONT = "'Segoe Print', 'Bradley Hand', 'Comic Sans MS', 'Noto Sans', 'Chalkboard SE', cursive";
  var cvs = null;
  function fbWidth(txt, size) {
    if (!cvs) cvs = doc.createElement("canvas").getContext("2d");
    cvs.font = (size / 0.7).toFixed(1) + "px " + FALLBACK_FONT;
    return cvs.measureText(txt).width;
  }
  function layoutText(text, o) {
    var size = +o.size > 0 ? +o.size : u(64);
    var maxW = +o.maxWidth > 0 ? +o.maxWidth : W * 0.8;
    var maxLines = +o.maxLines > 0 ? Math.floor(+o.maxLines) : 3;
    var lh = +o.lineHeight > 0 ? +o.lineHeight : 1.6;
    var P = parseText(text);
    function wrap(s, limit) {
      var sc = s / 100, sp = SPACE * sc, out = [];
      P.paras.forEach(function (words) {
        var line = { words: [], w: 0 };
        words.forEach(function (wd) {
          var ww = P.ok ? wordWidth(wd, sc) : fbWidth(wd.map(function (c) { return c.b + c.m.join(""); }).join("").normalize("NFC"), s);
          if (line.words.length && line.w + sp + ww > limit) { out.push(line); line = { words: [], w: 0 }; }
          line.w += (line.words.length ? sp : 0) + ww;
          line.words.push({ cls: wd, w: ww });
        });
        out.push(line);
      });
      return out;
    }
    function widestOf(ls) { var m = 0; ls.forEach(function (l) { m = Math.max(m, l.w); }); return m; }
    var lines, s = size;
    for (var iter = 0; iter < 18; iter++) {
      lines = wrap(s, maxW);
      if ((lines.length <= maxLines && widestOf(lines) <= maxW + 0.5) || s <= size * 0.35) break;
      s *= 0.93;
    }
    // Balance: the narrowest width that keeps the same number of lines (no orphan words).
    if (lines.length > 1 && o.balance !== false) {
      var lo = widestOf(lines) * 0.4, hi = widestOf(lines), n0 = lines.length;
      for (var b = 0; b < 12; b++) { var mid = (lo + hi) / 2; if (wrap(s, mid).length <= n0) hi = mid; else lo = mid; }
      lines = wrap(s, hi + 0.5);
    }
    var bw = 0;
    lines.forEach(function (l) { bw = Math.max(bw, l.w); });
    var bh = s + (lines.length - 1) * s * lh;
    return { lines: lines, size: s, lh: lh, w: bw, h: bh + s * 0.22, ok: P.ok };
  }
  function blockOrigin(lay, o) {
    var x = o.x != null ? +o.x : W / 2, y = o.y != null ? +o.y : H / 2;
    var anchor = o.anchor || "center", top, left;
    var bh = lay.h - lay.size * 0.22;
    if (anchor === "left") { left = x; top = y - bh / 2; }
    else if (anchor === "top-left") { left = x; top = y; }
    else if (anchor === "top") { left = x - lay.w / 2; top = y; }
    else if (anchor === "right") { left = x - lay.w; top = y - bh / 2; }
    else { left = x - lay.w / 2; top = y - bh / 2; }
    var align = o.align || (anchor === "left" || anchor === "top-left" ? "left" : anchor === "right" ? "right" : "center");
    return { left: left, top: top, align: align };
  }
  function measureBlock(text, o) { var l = layoutText(text, o || {}); return { w: l.w, h: l.h, size: l.size, lines: l.lines.length }; }
  function textDefaultDur(text) {
    var n = prepText(text).replace(/[\s*]/g, "").length;
    return clamp(0.22 + n * 0.062, 0.35, 9);
  }
  function write(text, o) {
    o = o || {};
    var s = ensure();
    text = String(text == null ? "" : text);
    var lay = layoutText(text, o);
    var org = blockOrigin(lay, o);
    var size = lay.size, sc = size / 100;
    var col = colorOf(o.color, INK.black), emc = colorOf(o.em, INK.red);
    var width = size * (+o.weight > 0 ? +o.weight : 0.085);
    var grp = svg("g", { class: "wb-text" }, s.lineG);
    var segs = [], all = [];
    var amp = size * 0.012;
    if (lay.ok) {
      lay.lines.forEach(function (line, li) {
        var lx = org.align === "center" ? org.left + (lay.w - line.w) / 2 : org.align === "right" ? org.left + lay.w - line.w : org.left;
        var ly = org.top + li * size * lay.lh;
        var x = lx;
        line.words.forEach(function (wd, wi) {
          if (wi) x += SPACE * sc;
          wd.cls.forEach(function (cl) {
            var G = glyphLocal(cl);
            var jr = (s.rnd() - 0.5) * 3.2, jy = (s.rnd() - 0.5) * 2.6, js = 1 + (s.rnd() - 0.5) * 0.05;
            var m = mat(x + (G.adv * sc) / 2, ly + 50 * sc + jy * sc, sc * js, jr, false, G.adv / 2, 50);
            G.strokes.forEach(function (lp) {
              var pts = wobble(applyM(m, lp), amp, s.rnd);
              all.push(pts);
              var g = mkStroke(pts, cl.em ? emc : col, width, grp);
              g.w = g.len + size * 0.35;
              segs.push(g);
            });
            x += (G.adv + TRACK) * sc;
          });
        });
      });
    } else {
      // Script the stroke font does not cover: a marker-style system font revealed under the hand.
      lay.lines.forEach(function (line, li) {
        var lx = org.align === "center" ? org.left + (lay.w - line.w) / 2 : org.align === "right" ? org.left + lay.w - line.w : org.left;
        var ly = org.top + li * size * lay.lh;
        var id = uid("rev");
        var cp = svg("clipPath", { id: id, clipPathUnits: "userSpaceOnUse" }, s.defs);
        var rect = svg("rect", { x: f1(lx - size * 0.3), y: f1(ly - size * 0.6), width: 0, height: f1(size * 2.2) }, cp);
        var tg = svg("text", { x: f1(lx), y: f1(ly + size), "clip-path": "url(#" + id + ")", class: "wb-fbtext", fill: col, style: "font-size:" + (size / 0.7).toFixed(1) + "px" }, grp);
        line.words.forEach(function (wd, wi) {
          var tsp = svg("tspan", { fill: wd.cls[0] && wd.cls[0].em ? emc : col }, tg);
          tsp.textContent = (wi ? " " : "") + wd.cls.map(function (c) { return c.b + c.m.join(""); }).join("").normalize("NFC");
        });
        var zz = [], steps = Math.max(4, Math.round(line.w / (size * 0.5)));
        for (var k = 0; k <= steps; k++) zz.push(lx + (line.w * k) / steps, ly + size * (k % 2 ? 0.95 : 0.15));
        all.push([lx, ly, lx + line.w, ly + size]);
        var lw = line.w + size * 0.6;
        var g = { el: tg, pts: zz, cum: cumOf(zz), w: line.w, tool: "marker", update: function (gg, ns, e) {
          if (ns === 0) { gg.el.style.visibility = "hidden"; return; }
          gg.el.style.visibility = "visible";
          rect.setAttribute("width", f1(ns === 2 ? lw : lw * e));
        } };
        g.len = g.cum[g.cum.length - 1];
        g.el.style.visibility = "hidden";
        segs.push(g);
      });
    }
    var times = schedule(segs, o, textDefaultDur(text));
    var b = boundsOf(all);
    var bh = lay.h;
    var box = { x: org.left, y: org.top, w: lay.w, h: bh };
    if (b.w > 0) { box.x = Math.min(box.x, b.x); box.w = Math.max(org.left + lay.w, b.x + b.w) - box.x; }
    var it = itemOf(box, times, grp);
    s.items.push({ kind: "text", label: text, it: it });
    it.size = size;
    it.lines = lay.lines.length;
    return it;
  }

  // ------------------------- free strokes, emphasis, connections -------------------------
  function rectOf(t) {
    if (!t) return { x: W / 2, y: H / 2, w: 0, h: 0 };
    if (t.w != null) return { x: +t.x, y: +t.y, w: +t.w, h: +t.h };
    return { x: +t.x, y: +t.y, w: 0, h: 0 };
  }
  function strokesJob(list, o, defDur, color, width, kind) {
    var s = ensure();
    var grp = svg("g", { class: "wb-" + (kind || "path") }, s.lineG);
    var segs = [], all = [];
    list.forEach(function (pts) {
      var w = o.wobble != null ? +o.wobble : u(1.6);
      var p = wobble(pts, w, s.rnd);
      all.push(p);
      var g = mkStroke(p, color, width, grp);
      g.w = g.len;
      segs.push(g);
    });
    var times = schedule(segs, o, defDur);
    return itemOf(boundsOf(all), times, grp);
  }
  function path(d, o) {
    o = o || {};
    var list = splitD(d).map(function (sd) { return sample(sd, 3); });
    var L = 0;
    list.forEach(function (p) { var c = cumOf(p); L += c[c.length - 1]; });
    return strokesJob(list, o, clamp(0.25 + L / u(1100), 0.3, 4), colorOf(o.color, INK.black), +o.width > 0 ? +o.width : u(5), "path");
  }
  function line(x1, y1, x2, y2, o) { return path("M" + x1 + " " + y1 + " L" + x2 + " " + y2, o); }
  function fill(d, color, o) {
    o = o || {};
    var s = ensure();
    var bb = bboxOfD(d);
    var sp = +o.spacing > 0 ? +o.spacing : clamp(Math.max(bb.w, bb.h) * 0.036, u(5), u(15));
    var parent = o.behind === false ? s.lineG : s.fillG;
    var g = fillSeg(d, [1, 0, 0, 1, 0, 0], 1, colorOf(color, INK.yellow), sp, o.rule, parent, o.opacity);
    g.w = 1;
    var times = schedule([g], o, clamp(0.35 + (bb.w * bb.h) / (u(400) * u(400)), 0.35, 1.6));
    return itemOf(bb, times, g.el);
  }
  function edgePoint(r, toward, pad) {
    var cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    var dx = toward[0] - cx, dy = toward[1] - cy;
    if (!r.w && !r.h) return [cx, cy];
    var hw = r.w / 2 + pad, hh = r.h / 2 + pad;
    var k = Math.min(Math.abs(dx) > 1e-6 ? hw / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? hh / Math.abs(dy) : Infinity);
    if (!isFinite(k) || k > 1) k = Math.min(1, k);
    return [cx + dx * k, cy + dy * k];
  }
  function arrow(from, to, o) {
    o = o || {};
    var a = rectOf(from), b = rectOf(to);
    var pad = o.pad != null ? +o.pad : u(16);
    var ca = [a.x + a.w / 2, a.y + a.h / 2], cb = [b.x + b.w / 2, b.y + b.h / 2];
    var p0 = edgePoint(a, cb, pad), p1 = edgePoint(b, ca, pad);
    var bend = o.bend != null ? +o.bend : 0.2;
    var dx = p1[0] - p0[0], dy = p1[1] - p0[1], dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var mx = (p0[0] + p1[0]) / 2 - (dy / dist) * dist * bend * 0.5, my = (p0[1] + p1[1]) / 2 + (dx / dist) * dist * bend * 0.5;
    var shaft = sample("M" + p0[0] + " " + p0[1] + " Q" + mx + " " + my + " " + p1[0] + " " + p1[1], 4);
    var n = shaft.length;
    var tx = shaft[n - 2] - shaft[n - 6], ty = shaft[n - 1] - shaft[n - 5], tl = Math.sqrt(tx * tx + ty * ty) || 1;
    tx /= tl; ty /= tl;
    var hl = clamp(dist * 0.18, u(18), u(38));
    var list = [shaft];
    if (o.head !== false) {
      var ex = p1[0], ey = p1[1], c = Math.cos(0.5), s0 = Math.sin(0.5);
      var l1 = [ex - hl * (tx * c - ty * s0), ey - hl * (ty * c + tx * s0)], l2 = [ex - hl * (tx * c + ty * s0), ey - hl * (ty * c - tx * s0)];
      list.push(sample("M" + l1[0] + " " + l1[1] + " L" + ex + " " + ey + " L" + l2[0] + " " + l2[1], 3));
    }
    return strokesJob(list, o, clamp(0.3 + dist / u(1800), 0.35, 1.1), colorOf(o.color, INK.blue), +o.width > 0 ? +o.width : u(5), "arrow");
  }
  function circle(target, o) {
    o = o || {};
    var r = rectOf(target), pad = o.pad != null ? +o.pad : u(18);
    var cx = r.x + r.w / 2, cy = r.y + r.h / 2, rx = (r.w / 2) * 1.36 + pad, ry = (r.h / 2) * 1.36 + pad * 0.7;
    var pts = [], a0 = -2.7, turns = 1.12, N = 90;
    for (var i = 0; i <= N; i++) {
      var a = a0 + (i / N) * turns * 2 * PI, k = 1 + 0.05 * (i / N) - 0.02;
      pts.push(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k);
    }
    return strokesJob([pts], o, 0.6, colorOf(o.color, INK.red), +o.width > 0 ? +o.width : u(5.5), "circle");
  }
  function underline(target, o) {
    o = o || {};
    var r = rectOf(target), pad = o.pad != null ? +o.pad : u(6);
    var y = r.y + r.h + pad, x0 = r.x - r.w * 0.02, x1 = r.x + r.w * 1.02;
    var list = [sample("M" + x0 + " " + y + " Q" + (x0 + x1) / 2 + " " + (y + u(5)) + " " + x1 + " " + (y - u(3)), 4)];
    if (o.double) list.push(sample("M" + (x1 - r.w * 0.06) + " " + (y + u(14)) + " Q" + (x0 + x1) / 2 + " " + (y + u(20)) + " " + (x0 + r.w * 0.08) + " " + (y + u(15)), 4));
    return strokesJob(list, o, o.double ? 0.55 : 0.35, colorOf(o.color, INK.red), +o.width > 0 ? +o.width : u(6), "underline");
  }
  function box(target, o) {
    o = o || {};
    var r = rectOf(target), pad = o.pad != null ? +o.pad : u(18);
    var x0 = r.x - pad, y0 = r.y - pad, x1 = r.x + r.w + pad, y1 = r.y + r.h + pad, ov = u(8);
    var d = "M" + (x0 - ov) + " " + y0 + " L" + (x1 + ov * 0.5) + " " + (y0 + u(2)) + " M" + x1 + " " + (y0 - ov) + " L" + (x1 - u(2)) + " " + (y1 + ov * 0.6) + " M" + (x1 + ov) + " " + y1 + " L" + (x0 - ov * 0.4) + " " + (y1 - u(2)) + " M" + x0 + " " + (y1 + ov) + " L" + (x0 + u(2)) + " " + (y0 - ov * 0.5);
    var list = splitD(d).map(function (sd) { return sample(sd, 4); });
    return strokesJob(list, o, 0.8, colorOf(o.color, INK.blue), +o.width > 0 ? +o.width : u(5), "box");
  }

  // ------------------------- camera -------------------------
  function camAt(t) {
    var s = st, c = { x: W / 2, y: H / 2, z: 1 };
    if (s) {
      for (var i = 0; i < s.cams.length; i++) {
        var k = s.cams[i];
        if (t >= k.at + k.dur) { c = { x: k.x, y: k.y, z: k.z }; continue; }
        if (t > k.at) { var p = inOut((t - k.at) / k.dur); c = { x: lerp(c.x, k.x, p), y: lerp(c.y, k.y, p), z: lerp(c.z, k.z, p) }; }
        break;
      }
      if (s.drift) c.z *= 1 + s.drift * clamp(t / D, 0, 1);
    }
    return c;
  }
  function panTo(x, y, o) {
    o = o || {};
    var s = ensure();
    var at = o.at != null ? +o.at : s.cursor;
    var k = { at: Math.max(0, at), dur: o.dur != null ? Math.max(0.05, +o.dur) : 1.1, x: +x, y: +y, z: o.zoom != null ? +o.zoom : 1 };
    s.cams.push(k);
    s.cams.sort(function (a, b) { return a.at - b.at; });
    s.dirty = true;
    return { t0: k.at, t1: k.at + k.dur, end: k.at + k.dur };
  }
  function view(r, o) {
    o = o || {};
    r = rectOf(r);
    var pad = o.pad != null ? +o.pad : 0.12;
    var sa = safe();
    var z = Math.min(sa.w / (r.w * (1 + pad * 2) || 1), sa.h / (r.h * (1 + pad * 2) || 1));
    z = clamp(z, 0.05, 4);
    var cx = r.x + r.w / 2 - (sa.cx - W / 2) / z, cy = r.y + r.h / 2 - (sa.cy - H / 2) / z;
    return panTo(cx, cy, { at: o.at, dur: o.dur != null ? o.dur : 1.2, zoom: z });
  }
  function visibleRect(t) {
    var c = camAt(t);
    return { x: c.x - W / 2 / c.z, y: c.y - H / 2 / c.z, w: W / c.z, h: H / c.z };
  }
  function proj(p, c) { return [(p[0] - c.x) * c.z + W / 2, (p[1] - c.y) * c.z + H / 2]; }

  // ------------------------- erase and drag-in -------------------------
  function erase(o) {
    o = o || {};
    var s = ensure();
    var at = o.at != null ? +o.at : s.cursor + GAP;
    var area = o.area ? rectOf(o.area) : visibleRect(Math.max(at, s.handFree));
    var id = uid("mask"), big = 1e5;
    var mk = svg("mask", { id: id, maskUnits: "userSpaceOnUse", maskContentUnits: "userSpaceOnUse", x: -big, y: -big, width: 2 * big, height: 2 * big }, s.defs);
    svg("rect", { x: -big, y: -big, width: 2 * big, height: 2 * big, fill: "#fff" }, mk);
    var wrap = svg("g", { class: "wb-erased", mask: "url(#" + id + ")" });
    while (s.inkRoot.firstChild) wrap.appendChild(s.inkRoot.firstChild);
    s.inkRoot.appendChild(wrap);
    newLayer();
    var band = Math.max(u(120), area.h / 6), rows = Math.ceil(area.h / (band * 0.8));
    // the sweep stays inside the area (the hand stays in frame); the wide stroke still reaches the edges
    var pts = [], m = band * 0.35;
    for (var i = 0; i <= rows; i++) {
      var y = area.y + band * 0.2 + ((area.h - band * 0.4) * i) / rows;
      if (i % 2) pts.push(area.x + area.w - m, y, area.x + m, y + band * 0.3);
      else pts.push(area.x + m, y, area.x + area.w - m, y + band * 0.3);
    }
    var g = mkStroke(pts, "#0e0e0e", band * 1.6, mk);
    g.tool = "eraser";
    g.w = 1;
    var times = schedule([g], { at: at, dur: o.dur != null ? o.dur : 1.3 }, 1.3);
    s.erases.push(times.t1);
    return itemOf(area, times, wrap);
  }
  function dragIn(name, o) {
    o = o || {};
    var s = ensure();
    name = doodleName(name);
    var grp = svg("g", { class: "wb-drag" }, s.lineG);
    var fg = svg("g", {}, grp), lg = svg("g", {}, grp);
    var b = buildDoodle(name, { x: o.x, y: o.y, size: o.size || u(260), color: o.color, rot: o.rot, flip: o.flip }, lg, fg);
    var segs = b.lineSegs.concat(b.fillSegs);
    segs.forEach(function (g) { g.el.style.visibility = "visible"; g.el.style.strokeDasharray = "none"; });
    var at = o.at != null ? +o.at : s.cursor + GAP;
    var vr = visibleRect(at), from = o.from || "right";
    var bx = b.bounds;
    var dx = 0, dy = 0;
    if (from === "left") dx = vr.x - (bx.x + bx.w) - u(60);
    else if (from === "bottom") dy = vr.y + vr.h - bx.y + u(60);
    else dx = vr.x + vr.w - bx.x + u(60);
    var grip = from === "left" ? [bx.x + bx.w * 0.8, bx.y + bx.h * 0.7] : from === "bottom" ? [bx.x + bx.w * 0.6, bx.y + bx.h * 0.9] : [bx.x + bx.w * 0.75, bx.y + bx.h * 0.75];
    grp.setAttribute("display", "none");
    var g = {
      el: grp, pts: [grip[0] + dx, grip[1] + dy, grip[0], grip[1]], len: 1, w: 1, tool: "marker",
      update: function (gg, ns, e) {
        if (ns === 0) { grp.setAttribute("display", "none"); return; }
        grp.removeAttribute("display");
        var k = ns === 2 ? 1 : inOut(e);
        grp.setAttribute("transform", "translate(" + f1(dx * (1 - k)) + " " + f1(dy * (1 - k)) + ")");
      },
      handPt: function (t, gg) { var k = inOut(clamp((t - gg.t0) / (gg.t1 - gg.t0), 0, 1)); return [grip[0] + dx * (1 - k), grip[1] + dy * (1 - k)]; },
    };
    g.cum = cumOf(g.pts);
    var times = schedule([g], { at: at, dur: o.dur != null ? o.dur : 0.9 }, 0.9);
    return itemOf(b.bounds, times, grp);
  }

  // ------------------------- the hand -------------------------
  // Drawn in screen pixels with the pen tip at (0,0); the arm reaches off to the lower right.
  var AX = [Math.cos(-0.92), Math.sin(-0.92)], NX = [-AX[1], AX[0]];
  function HP(t, off) { return [AX[0] * t + NX[0] * off, AX[1] * t + NX[1] * off]; }
  function HPs(list) { return list.map(function (q) { return HP(q[0], q[1]); }); }
  function smoothClosed(ptsList) {
    // Catmull-Rom through points -> cubic path, closed.
    var n = ptsList.length, d = "M" + f1(ptsList[0][0]) + " " + f1(ptsList[0][1]);
    for (var i = 0; i < n; i++) {
      var p0 = ptsList[(i - 1 + n) % n], p1 = ptsList[i], p2 = ptsList[(i + 1) % n], p3 = ptsList[(i + 2) % n];
      d += " C" + f1(p1[0] + (p2[0] - p0[0]) / 6) + " " + f1(p1[1] + (p2[1] - p0[1]) / 6) + " " + f1(p2[0] - (p3[0] - p1[0]) / 6) + " " + f1(p2[1] - (p3[1] - p1[1]) / 6) + " " + f1(p2[0]) + " " + f1(p2[1]);
    }
    return d + " Z";
  }
  function capsule(a, b, ra, rb) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / L, ny = dx / L;
    return "M" + f1(a[0] + nx * ra) + " " + f1(a[1] + ny * ra) + " L" + f1(b[0] + nx * rb) + " " + f1(b[1] + ny * rb) +
      " A" + rb + " " + rb + " 0 0 1 " + f1(b[0] - nx * rb) + " " + f1(b[1] - ny * rb) + " L" + f1(a[0] - nx * ra) + " " + f1(a[1] - ny * ra) +
      " A" + ra + " " + ra + " 0 0 1 " + f1(a[0] + nx * ra) + " " + f1(a[1] + ny * ra) + " Z";
  }
  function buildHand() {
    var s = st, defs = s.defs, sk = SKIN[s.tone];
    var root = s.handG;
    root.style.visibility = "hidden";
    var gid = uid("skin"), sid = uid("slv"), mid = uid("mk"), bid = uid("blur");
    var lg = svg("linearGradient", { id: gid, x1: "0", y1: "0", x2: "1", y2: "1" }, defs);
    svg("stop", { offset: "0", "stop-color": sk[0] }, lg);
    svg("stop", { offset: "0.65", "stop-color": sk[0] }, lg);
    svg("stop", { offset: "1", "stop-color": sk[1] }, lg);
    var sg = svg("linearGradient", { id: sid, x1: "0", y1: "0", x2: "1", y2: "0" }, defs);
    svg("stop", { offset: "0", "stop-color": s.sleeve }, sg);
    svg("stop", { offset: "1", "stop-color": shade(s.sleeve, 0.62) }, sg);
    var mg = svg("linearGradient", { id: mid, x1: "0", y1: "0", x2: "0", y2: "1" }, defs);
    svg("stop", { offset: "0", "stop-color": "#5b5f68" }, mg);
    svg("stop", { offset: "0.35", "stop-color": "#2c2e34" }, mg);
    svg("stop", { offset: "1", "stop-color": "#16171b" }, mg);
    var flt = svg("filter", { id: bid, x: "-30%", y: "-30%", width: "160%", height: "160%" }, defs);
    svg("feGaussianBlur", { stdDeviation: f1(u(9)) }, flt);

    var g = svg("g", {}, root);
    var shadow = svg("g", { filter: "url(#" + bid + ")", opacity: "0.2" }, g);
    var art = svg("g", {}, g);
    s.hand = { g: g, shadow: shadow, art: art };

    // geometry in (t along marker, off toward the arm)
    var back = HPs([[150, -12], [196, 8], [222, 70], [232, 150], [238, 236], [120, 262], [92, 196], [66, 132], [44, 78], [30, 40], [70, 18]]);
    var arm = HPs([[236, 220], [250, 1500], [86, 1500], [116, 236]]);
    var sleeve = HPs([[258, 330], [278, 1600], [60, 1600], [92, 330]]);
    var cuff = HPs([[258, 330], [92, 330], [94, 370], [262, 372]]);
    var indexA = HP(26, 15), indexB = HP(152, 32);
    var thumbA = HP(150, 4), thumbB = HP(76, -20);
    var curl1 = HP(52, 62), curl2 = HP(76, 118), curl3 = HP(98, 178);

    function parts(parent, sil) {
      var skin = sil ? "#000" : "url(#" + gid + ")", line = sil ? "none" : sk[2], lw = sil ? 0 : 2.4;
      svg("path", { d: poly(sleeve, true), fill: sil ? "#000" : "url(#" + sid + ")" }, parent);
      svg("path", { d: poly(arm, true), fill: skin, stroke: line, "stroke-width": lw }, parent);
      if (!sil) {
        svg("path", { d: poly(sleeve, true), fill: "url(#" + sid + ")" }, parent);
        svg("path", { d: poly(cuff, true), fill: shade(s.sleeve, 0.72) }, parent);
        svg("path", { d: poly([HP(120, 900), HP(140, 1500)]), stroke: shade(s.sleeve, 0.68), "stroke-width": 5, fill: "none" }, parent);
      }
      // marker (between thumb and index)
      var mk = svg("g", { class: "wb-marker", transform: "rotate(" + f2((-0.92 * 180) / PI) + ")" }, parent);
      if (sil) svg("path", { d: "M-1 0 L18 -7 L250 -16 L270 -15 L270 15 L250 16 L18 7 Z", fill: "#000" }, mk);
      else {
        svg("path", { d: "M-1 0 C2 -3 10 -6 18 -6 L18 6 C10 6 2 3 -1 0 Z", fill: "#1b1c20" }, mk);
        svg("rect", { x: 17, y: -10, width: 22, height: 20, rx: 3, fill: "#4a4e57" }, mk);
        svg("rect", { x: 37, y: -16, width: 215, height: 32, rx: 7, fill: "url(#" + mid + ")" }, mk);
        svg("rect", { x: 120, y: -16, width: 70, height: 32, fill: "#ECEBE6" }, mk);
        svg("rect", { x: 126, y: -6, width: 58, height: 6, rx: 3, fill: INK.red }, mk);
        svg("rect", { x: 250, y: -15, width: 22, height: 30, rx: 7, fill: "#111215" }, mk);
        svg("path", { d: "M42 -9 L246 -9", stroke: "rgba(255,255,255,0.22)", "stroke-width": 4, "stroke-linecap": "round" }, mk);
      }
      var er = svg("g", { class: "wb-eraser", transform: "rotate(-18)" }, parent);
      if (sil) svg("rect", { x: -95, y: -45, width: 190, height: 80, rx: 12, fill: "#000" }, er);
      else {
        svg("rect", { x: -95, y: -45, width: 190, height: 58, rx: 12, fill: "#2F5FA8" }, er);
        svg("rect", { x: -92, y: 8, width: 184, height: 26, rx: 6, fill: "#D9D6CF" }, er);
        svg("path", { d: "M-80 -30 L80 -30", stroke: "rgba(255,255,255,0.25)", "stroke-width": 5, "stroke-linecap": "round" }, er);
      }
      svg("path", { d: smoothClosed(back), fill: skin, stroke: line, "stroke-width": lw }, parent);
      if (!sil) {
        svg("path", { d: "M" + f1(curl1[0]) + " " + f1(curl1[1]) + " Q" + f1(HP(80, 70)[0]) + " " + f1(HP(80, 70)[1]) + " " + f1(HP(96, 92)[0]) + " " + f1(HP(96, 92)[1]), fill: "none", stroke: sk[2], "stroke-width": 2.4, "stroke-linecap": "round" }, parent);
        svg("path", { d: "M" + f1(curl2[0]) + " " + f1(curl2[1]) + " Q" + f1(HP(104, 128)[0]) + " " + f1(HP(104, 128)[1]) + " " + f1(HP(122, 150)[0]) + " " + f1(HP(122, 150)[1]), fill: "none", stroke: sk[2], "stroke-width": 2.4, "stroke-linecap": "round" }, parent);
        svg("path", { d: "M" + f1(curl3[0]) + " " + f1(curl3[1]) + " Q" + f1(HP(126, 186)[0]) + " " + f1(HP(126, 186)[1]) + " " + f1(HP(146, 204)[0]) + " " + f1(HP(146, 204)[1]), fill: "none", stroke: sk[2], "stroke-width": 2.4, "stroke-linecap": "round" }, parent);
        svg("path", { d: "M" + poly(HPs([[176, 60], [196, 110], [204, 170]])).slice(1), fill: "none", stroke: sk[1], "stroke-width": 6, "stroke-linecap": "round", opacity: "0.55" }, parent);
      }
      // thumb over the marker, index finger along it
      svg("path", { d: capsule(thumbA, thumbB, 23, 17), fill: skin, stroke: line, "stroke-width": lw }, parent);
      svg("path", { d: capsule(indexA, indexB, 16, 22), fill: skin, stroke: line, "stroke-width": lw }, parent);
      if (!sil) {
        var n1 = HP(84, -22), n2 = HP(30, 12);
        svg("ellipse", { cx: f1(n1[0]), cy: f1(n1[1]), rx: 11, ry: 7.5, transform: "rotate(" + f1((-0.92 * 180) / PI) + " " + f1(n1[0]) + " " + f1(n1[1]) + ")", fill: "#F7E3D6", stroke: sk[2], "stroke-width": 1.6 }, parent);
        svg("ellipse", { cx: f1(n2[0] + 3), cy: f1(n2[1] - 2), rx: 10, ry: 7, transform: "rotate(" + f1((-0.92 * 180) / PI) + " " + f1(n2[0] + 3) + " " + f1(n2[1] - 2) + ")", fill: "#F7E3D6", stroke: sk[2], "stroke-width": 1.6 }, parent);
        var k1 = HP(104, 26), k2 = HP(108, 40);
        svg("path", { d: "M" + f1(k1[0]) + " " + f1(k1[1]) + " L" + f1(k2[0]) + " " + f1(k2[1]), stroke: sk[2], "stroke-width": 2, "stroke-linecap": "round", opacity: "0.7" }, parent);
        var k3 = HP(124, 22), k4 = HP(128, 38);
        svg("path", { d: "M" + f1(k3[0]) + " " + f1(k3[1]) + " L" + f1(k4[0]) + " " + f1(k4[1]), stroke: sk[2], "stroke-width": 2, "stroke-linecap": "round", opacity: "0.7" }, parent);
      }
      return { mk: mk, er: er };
    }
    var sh = parts(shadow, true), real = parts(art, false);
    s.hand.tools = [sh, real];
  }
  function setTool(tool) {
    var s = st;
    if (s.hand.tool === tool) return;
    s.hand.tool = tool;
    s.hand.tools.forEach(function (t) {
      t.mk.style.display = tool === "eraser" ? "none" : "";
      t.er.style.display = tool === "eraser" ? "" : "none";
    });
  }

  // ------------------------- per-frame update -------------------------
  function finalize() {
    var s = st;
    s.segs.sort(function (a, b) { return a.t0 - b.t0; });
    s.hsegs = s.segs.filter(function (g) { return g.tool; });
    s.dirty = false;
    var last = s.hsegs.length ? s.hsegs[s.hsegs.length - 1].t1 : 0;
    if (last > D + 0.05 && !s.warned) {
      s.warned = true;
      V.error("[whiteboard] drawing runs past the end of the scene (" + last.toFixed(2) + " s > " + D.toFixed(2) + " s); give it less to draw or earlier times");
    }
  }
  function segPt(g, t) {
    if (g.handPt) return g.handPt(t, g);
    var p = clamp((t - g.t0) / (g.t1 - g.t0 || 1), 0, 1);
    var e = 0.65 * p + 0.35 * smooth(p);
    return pointAt(g.pts, g.cum, e * g.len);
  }
  function handAt(t, c) {
    var hs = st.hsegs, n = hs.length;
    var OFF = [W + u(330), H + u(460)];
    if (!n) return null;
    var lo = 0, hi = n - 1, idx = -1;
    while (lo <= hi) { var mid = (lo + hi) >> 1; if (hs[mid].t0 <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1; }
    if (idx >= 0 && t < hs[idx].t1) return { p: proj(segPt(hs[idx], t), c), lift: 0, tool: hs[idx].tool };
    var prev = idx >= 0 ? hs[idx] : null, next = idx + 1 < n ? hs[idx + 1] : null;
    var k, pB, pA;
    if (!prev) {
      pB = proj(segPt(next, next.t0), c);
      var tIn = Math.max(0, next.t0 - 0.6);
      if (next.t0 < 0.35) return { p: pB, lift: 0.3, tool: next.tool };
      if (t < tIn) return null;
      k = inOut((t - tIn) / (next.t0 - tIn));
      return { p: [lerp(OFF[0], pB[0], k), lerp(OFF[1], pB[1], k)], lift: 1 - k, tool: next.tool };
    }
    pA = proj(segPt(prev, prev.t1), c);
    if (!next) {
      var tOut = prev.t1 + 0.15;
      if (t < tOut) return { p: pA, lift: (t - prev.t1) / 0.15, tool: prev.tool };
      k = (t - tOut) / 0.65;
      if (k >= 1) return null;
      k = k * k;
      return { p: [lerp(pA[0], OFF[0], k), lerp(pA[1], OFF[1], k)], lift: 1, tool: prev.tool };
    }
    pB = proj(segPt(next, next.t0), c);
    var gap = next.t0 - prev.t1;
    if (gap <= 1.25) {
      k = clamp((t - prev.t1) / (gap || 1), 0, 1);
      var e = inOut(k);
      return { p: [lerp(pA[0], pB[0], e), lerp(pA[1], pB[1], e)], lift: Math.sin(PI * k) * clamp(gap / 0.25, 0, 1), tool: k < 0.5 ? prev.tool : next.tool };
    }
    var tr = 0.5;
    if (t < prev.t1 + tr) { k = inOut((t - prev.t1) / tr); return { p: [lerp(pA[0], OFF[0], k), lerp(pA[1], OFF[1], k)], lift: 1, tool: prev.tool }; }
    if (t > next.t0 - tr) { k = inOut((t - (next.t0 - tr)) / tr); return { p: [lerp(OFF[0], pB[0], k), lerp(OFF[1], pB[1], k)], lift: 1 - k, tool: next.tool }; }
    return null;
  }
  function frame(t) {
    var s = st;
    if (s.dirty) finalize();
    var c = camAt(t);
    s.cam.setAttribute("transform", "translate(" + f2(W / 2) + " " + f2(H / 2) + ") scale(" + c.z.toFixed(5) + ") translate(" + f2(-c.x) + " " + f2(-c.y) + ")");
    var segs = s.segs;
    for (var i = 0; i < segs.length; i++) {
      var g = segs[i], ns = t < g.t0 ? 0 : t >= g.t1 ? 2 : 1;
      if (ns === 1 || ns !== g.state) {
        g.state = ns;
        var p = ns === 1 ? clamp((t - g.t0) / (g.t1 - g.t0 || 1), 0, 1) : 0;
        g.update(g, ns, 0.65 * p + 0.35 * smooth(p));
      }
    }
    var h = handAt(t, c), hand = s.hand;
    if (!h || h.p[0] > W + u(320) || h.p[1] > H + u(450)) { s.handG.style.visibility = "hidden"; return; }
    s.handG.style.visibility = "visible";
    setTool(h.tool);
    var lift = clamp(h.lift || 0, 0, 1);
    var rot = (h.p[0] / W - 0.5) * 9 + (h.p[1] / H - 0.5) * 5 + (h.tool === "eraser" ? 6 : 0);
    var sc = s.handScale * (1 + 0.035 * lift);
    hand.g.setAttribute("transform", "translate(" + f1(h.p[0]) + " " + f1(h.p[1]) + ") rotate(" + f2(rot) + ") scale(" + sc.toFixed(4) + ")");
    hand.shadow.setAttribute("transform", "translate(" + f1(12 + lift * 14) + " " + f1(16 + lift * 16) + ")");
  }

  // ------------------------- layout and timing helpers for templates -------------------------
  function safe() {
    var x0, y0, x1, y1;
    if (V.isPortrait) { x0 = W * 0.056; x1 = W * 0.944; y0 = H * 0.13; y1 = H * 0.755; }
    else { x0 = W * 0.07; x1 = W * 0.93; y0 = H * 0.075; y1 = H * 0.925; }
    return { x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
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
    if (after) { t = V.find(word, 0); if (t != null) return t; }
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
  // Fill missing landing times by spreading them between known neighbours.
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
  function syncTimes(keys, o) {
    o = o || {};
    var prev = 0, out = [];
    (keys || []).forEach(function (k) { var t = kwFind(k, prev); out.push(t); if (t != null) prev = t + 0.01; });
    out = spread(out);
    for (var i = 1; i < out.length; i++) if (out[i] < out[i - 1]) out[i] = out[i - 1];
    return out.map(function (t) { return Math.max(0, t - (o.lead || 0)); });
  }
  // Plan a sequence of drawings: each {land, dur, lead, min, stretch}. Sets .start/.dur.
  function plan(items, o) {
    o = o || {};
    var gap = o.gap != null ? o.gap : 0.12, startMin = o.start != null ? o.start : 0.2;
    var hold = D < 5 ? Math.min(0.9, D * 0.16) : 1.0;
    var endLimit = Math.max(startMin + 0.6, D - hold);
    var n = items.length;
    if (!n) return items;
    items.forEach(function (it) { it.dur = Math.max(0.08, it.dur || 0.5); it.lead = it.lead == null ? 0.5 : it.lead; it.min = Math.min(it.dur, it.min || 0.25); });
    function fitBudget() {
      var budget = endLimit - startMin - gap * (n - 1), tot = 0;
      items.forEach(function (it) { tot += it.dur; });
      if (tot > budget && tot > 0) {
        var f = budget / tot, tot2 = 0;
        items.forEach(function (it) { it.dur = Math.max(it.dur * f, it.min); tot2 += it.dur; });
        if (tot2 > budget) items.forEach(function (it) { it.dur *= budget / tot2; });
      }
    }
    fitBudget();
    var last = -1;
    items.forEach(function (it) {
      if (it.land != null && isFinite(it.land)) { it.land = clamp(it.land, 0, endLimit); if (it.land < last) it.land = last; last = it.land; }
      else it.land = null;
    });
    var prevEnd = 0;
    items.forEach(function (it, i) {
      var want = it.land != null ? it.land - it.lead * it.dur : -1;
      var s0 = i ? Math.max(want, prevEnd + gap) : Math.max(want, startMin);
      if (i === 0 && s0 > startMin + 0.15) {
        var stretch = it.stretch || 1.6;
        var need = it.land != null ? (it.land - startMin) / Math.max(0.25, it.lead) : it.dur;
        it.dur = Math.max(it.dur, Math.min(it.dur * stretch, need));
        s0 = startMin;
      }
      it.start = s0;
      prevEnd = s0 + it.dur;
    });
    if (prevEnd > endLimit) {
      var lim = endLimit;
      for (var i = n - 1; i >= 0; i--) {
        var it = items[i];
        if (it.start + it.dur > lim) it.start = lim - it.dur;
        lim = it.start - gap;
      }
      if (items[0].start < startMin) {
        var a = items[0].start, span = items[n - 1].start + items[n - 1].dur - a, k = (endLimit - startMin) / span;
        items.forEach(function (it) { it.start = startMin + (it.start - a) * k; it.dur *= k; });
      }
    }
    items.forEach(function (it) { it.end = it.start + it.dur; });
    return items;
  }
  function clampBox(cx, cy, w, h, sa) {
    var x = clamp(cx, sa.x0 + w / 2, sa.x1 - w / 2), y = clamp(cy, sa.y0 + h / 2, sa.y1 - h / 2);
    if (w > sa.w) x = sa.cx;
    if (h > sa.h) y = sa.cy;
    return [x, y];
  }
  function dur(name, size) { return doodleDefaultDur(name, size).total; }
  function T(p) { return p && typeof p === "object" ? p : {}; }

  // ------------------------- templates -------------------------
  var TPL = {};

  TPL["draw-concept"] = function (root, p) {
    S.board(root, { hand: p.hand });
    var sa = safe(), P = V.isPortrait;
    var name = doodleName(p.doodle), label = str(p.label), caption = str(p.caption);
    var accents = (Array.isArray(p.accents) ? p.accents : []).slice(0, 2).map(doodleName);
    var dS = P ? Math.min(sa.w * 0.7, sa.h * 0.56) : Math.min(sa.h * 0.52, sa.w * 0.36);
    var lo = { size: u(P ? 92 : 84), maxWidth: P ? sa.w : sa.w * 0.78, maxLines: 2 };
    var co = { size: u(P ? 56 : 48), maxWidth: P ? sa.w * 0.96 : sa.w * 0.7, maxLines: 2 };
    var lm = label ? measureBlock(label, lo) : { h: 0 }, cm = caption ? measureBlock(caption, co) : { h: 0 };
    var g1 = u(P ? 60 : 44), g2 = u(P ? 34 : 24), ulPad = u(26);
    var total = dS + (label ? g1 + lm.h + ulPad : 0) + (caption ? g2 + cm.h : 0);
    var top = sa.y0 + Math.max(0, (sa.h - total) / 2);
    var dY = top + dS / 2, lY = top + dS + g1, cY = lY + lm.h + ulPad + g2;
    var tD = labelTime(label, p.keyword, 0);
    var tL = p.labelKeyword ? kwFind(p.labelKeyword, tD || 0) : null;
    var items = [{ land: tD != null ? tD : Math.min(1.2, D * 0.25), dur: dur(name, dS), lead: 0.62, min: 0.8, stretch: 1.8 }];
    if (label) items.push({ land: tL, dur: textDefaultDur(label), lead: 0.3, min: 0.5 });
    if (caption) items.push({ land: null, dur: textDefaultDur(caption), lead: 0.3, min: 0.4 });
    var emph = p.emphasis === "none" || !label ? null : p.emphasis === "circle" ? "circle" : "underline";
    if (emph) items.push({ land: null, dur: emph === "circle" ? 0.6 : 0.4, min: 0.25 });
    accents.forEach(function (a) { items.push({ land: null, dur: dur(a, u(150)) * 0.8, min: 0.4 }); });
    plan(items);
    var k = 0;
    S.doodle(name, { x: W / 2, y: dY, size: dS, color: p.color, at: items[k].start, dur: items[k++].dur });
    var lab = null;
    if (label) { lab = S.write(label, Object.assign({ x: W / 2, y: lY, anchor: "top", at: items[k].start, dur: items[k++].dur }, lo)); }
    if (caption) S.write(caption, Object.assign({ x: W / 2, y: cY, anchor: "top", color: "blue", at: items[k].start, dur: items[k++].dur }, co));
    if (emph) {
      if (emph === "circle") S.circle(lab, { at: items[k].start, dur: items[k++].dur });
      else S.underline(lab, { at: items[k].start, dur: items[k++].dur, pad: u(10) });
    }
    var aS = u(P ? 160 : 175);
    var spots = P ? [[sa.x0 + aS * 0.55, top + aS * 0.4], [sa.x1 - aS * 0.55, top + dS * 0.62]] : [[W / 2 - dS / 2 - aS * 0.95, dY - dS * 0.18], [W / 2 + dS / 2 + aS * 0.95, dY + dS * 0.1]];
    accents.forEach(function (a, i) {
      var c = clampBox(spots[i][0], spots[i][1], aS, aS, sa);
      S.doodle(a, { x: c[0], y: c[1], size: aS, at: items[k].start, dur: items[k++].dur, rot: i ? 8 : -8 });
    });
  };

  TPL["mind-map"] = function (root, p) {
    S.board(root, { hand: p.hand });
    var sa = safe(), P = V.isPortrait;
    var center = str(p.center) || "Idea";
    var br = (Array.isArray(p.branches) ? p.branches : []).slice(0, 6).filter(function (b) { return b && (b.label || b.doodle); });
    var n = br.length;
    var cx = sa.cx, cy = P ? sa.cy : H / 2;
    var co = { size: u(P ? 76 : 68), maxWidth: P ? u(440) : u(420), maxLines: 2 };
    var cm = measureBlock(center, co);
    var ANG = P ? { 1: [-90], 2: [-90, 90], 3: [-90, 30, 150], 4: [-120, -60, 60, 120], 5: [-90, -18, 54, 126, 198], 6: [-90, -30, 30, 90, 150, 210] }
      : { 1: [0], 2: [180, 0], 3: [-150, -30, 90], 4: [-135, -45, 45, 135], 5: [-162, -90, -18, 54, 126], 6: [-150, -90, -30, 30, 90, 150] };
    var angs = ANG[n] || [];
    var dz = P ? (n > 4 ? u(190) : u(235)) : n > 4 ? u(165) : u(200);
    var lo = { size: u(P ? 56 : 50), maxWidth: P ? u(340) : u(330), maxLines: 2 };
    var rx = P ? sa.w * (n > 4 ? 0.4 : 0.36) : sa.w * 0.36, ry = P ? sa.h * 0.42 : sa.h * 0.34;
    var units = br.map(function (b, i) {
      var lm = measureBlock(str(b.label), lo), uw = Math.max(dz, lm.w), uh = dz + u(16) + lm.h;
      var q = pt(cx, cy, 1, angs[i]);
      var ux = cx + (q[0] - cx) * rx, uy = cy + (q[1] - cy) * ry;
      var c = clampBox(ux, uy, uw, uh, sa);
      return { b: b, x: c[0], y: c[1], w: uw, h: uh, top: c[1] - uh / 2, lm: lm, color: CYCLE[i % CYCLE.length] };
    });
    var tC = labelTime(center, p.keyword, 0);
    var items = [{ land: tC, dur: textDefaultDur(center), lead: 0.3, min: 0.5, stretch: 1.4 }, { land: null, dur: 0.55, min: 0.3 }];
    var prev = tC || 0;
    var lands = units.map(function (un) { var t = labelTime(un.b.label, un.b.keyword, prev + 0.05); if (t != null) prev = t; return t; });
    lands = spread(lands, (tC || 0) + 0.8, D * 0.82);
    units.forEach(function (un, i) {
      items.push({ land: lands[i] - 0.15, dur: 0.4, min: 0.2, lead: 0.5 });
      items.push({ land: lands[i], dur: dur(doodleName(un.b.doodle), dz), lead: 0.55, min: 0.5 });
      items.push({ land: null, dur: textDefaultDur(un.b.label), min: 0.3, lead: 0.3 });
    });
    plan(items);
    var k = 0;
    var cItem = S.write(center, Object.assign({ x: cx, y: cy, at: items[k].start, dur: items[k++].dur }, co));
    var ring = S.circle(cItem, { at: items[k].start, dur: items[k++].dur, color: "black", pad: u(16) });
    units.forEach(function (un) {
      var dTop = un.top + dz / 2;
      var target = { x: un.x - un.w / 2, y: un.top, w: un.w, h: un.h };
      S.arrow(ring, target, { at: items[k].start, dur: items[k++].dur, head: false, bend: 0.12, color: un.color, pad: u(14) });
      S.doodle(doodleName(un.b.doodle), { x: un.x, y: dTop, size: dz, at: items[k].start, dur: items[k++].dur });
      S.write(str(un.b.label), Object.assign({ x: un.x, y: un.top + dz + u(16), anchor: "top", color: un.color, at: items[k].start, dur: items[k++].dur }, lo));
    });
  };

  TPL["process-flow"] = function (root, p) {
    S.board(root, { hand: p.hand });
    var sa = safe(), P = V.isPortrait;
    var steps = (Array.isArray(p.steps) ? p.steps : []).slice(0, 5).filter(Boolean), n = steps.length || 1;
    var title = str(p.title);
    var to = { size: u(P ? 76 : 66), maxWidth: sa.w * 0.9, maxLines: 2 };
    var tm = title ? measureBlock(title, to) : { h: 0 };
    var gT = title ? u(P ? 70 : 60) : 0;
    var lab = function (s, i) { return (p.numbered ? i + 1 + ". " : "") + str(s.label); };
    var cells = [], dz, lo, y0;
    if (!P) {
      var cw = sa.w / n;
      dz = Math.min(cw * 0.66, sa.h * 0.4);
      lo = { size: u(58), maxWidth: cw * 0.92, maxLines: 2 };
      var maxLab = 0;
      steps.forEach(function (s, i) { maxLab = Math.max(maxLab, measureBlock(lab(s, i), lo).h); });
      var blockH = tm.h + gT + dz + u(26) + maxLab;
      y0 = sa.y0 + Math.max(0, (sa.h - blockH) / 2);
      var ry = y0 + tm.h + gT;
      steps.forEach(function (s, i) { cells.push({ x: sa.x0 + cw * (i + 0.5), y: ry + dz / 2, lx: sa.x0 + cw * (i + 0.5), ly: ry + dz + u(26), anchor: "top" }); });
    } else {
      var avail = sa.h - tm.h - gT;
      var rh = Math.min(avail / n, u(300));
      dz = Math.min(rh * 0.8, u(260));
      lo = { size: u(74), maxWidth: sa.w - dz - u(70), maxLines: 2 };
      var maxW = 0;
      steps.forEach(function (s, i) { maxW = Math.max(maxW, measureBlock(lab(s, i), lo).w); });
      var colW = dz + u(60) + maxW, left = sa.x0 + Math.max(0, (sa.w - colW) / 2);
      y0 = sa.y0 + Math.max(0, (sa.h - tm.h - gT - rh * n) / 2);
      var top2 = y0 + tm.h + gT;
      steps.forEach(function (s, i) { var yc = top2 + rh * (i + 0.5); cells.push({ x: left + dz / 2, y: yc, lx: left + dz + u(60), ly: yc, anchor: "left" }); });
    }
    var items = [];
    if (title) items.push({ land: labelTime(title, null, 0), dur: textDefaultDur(title), lead: 0.3, min: 0.4 });
    var prev = 0, lands = steps.map(function (s) { var t = labelTime(s.label, s.keyword, prev); if (t != null) prev = t + 0.01; return t; });
    lands = spread(lands, title ? 1.4 : 0.6, D * 0.8);
    steps.forEach(function (s, i) {
      if (i) items.push({ land: lands[i] - 0.2, dur: 0.45, min: 0.25, lead: 0.6 });
      items.push({ land: lands[i], dur: dur(doodleName(s.doodle), dz), lead: 0.6, min: 0.5 });
      items.push({ land: null, dur: textDefaultDur(lab(s, i)), lead: 0.3, min: 0.3 });
    });
    plan(items);
    var k = 0;
    if (title) S.write(title, Object.assign({ x: W / 2, y: y0, anchor: "top", at: items[k].start, dur: items[k++].dur }, to));
    var prevD = null;
    steps.forEach(function (s, i) {
      var c = cells[i];
      if (i) S.arrow(prevD, { x: c.x - dz / 2, y: c.y - dz / 2, w: dz, h: dz }, { at: items[k].start, dur: items[k++].dur, bend: P ? 0 : 0.15, pad: u(P ? 8 : 18) });
      var d = S.doodle(doodleName(s.doodle), { x: c.x, y: c.y, size: dz, at: items[k].start, dur: items[k++].dur });
      S.write(lab(s, i), Object.assign({ x: c.lx, y: c.ly, anchor: c.anchor, at: items[k].start, dur: items[k++].dur }, lo));
      prevD = d;
    });
  };

  TPL["list-with-doodles"] = function (root, p) {
    S.board(root, { hand: p.hand });
    var sa = safe(), P = V.isPortrait;
    var title = str(p.title) || "";
    var rows = (Array.isArray(p.items) ? p.items : []).slice(0, 5).filter(Boolean), n = rows.length || 1;
    var to = { size: u(P ? 80 : 74), maxWidth: sa.w * 0.9, maxLines: 2 };
    var tm = title ? measureBlock(title, to) : { h: 0 };
    var gT = title ? u(P ? 90 : 70) : 0;
    var rh = Math.min((sa.h - tm.h - gT) / n, u(P ? 270 : 230));
    var dz = Math.min(rh * 0.82, u(P ? 220 : 200));
    var checkW = p.check ? u(P ? 92 : 86) : 0;
    var textX0 = dz + u(44);
    var lo = { size: u(P ? 64 : 66), maxWidth: sa.w - textX0 - checkW - u(30), maxLines: 2 };
    var widest = 0;
    rows.forEach(function (r) { widest = Math.max(widest, measureBlock(str(r.text), lo).w); });
    var blockW = textX0 + widest + (p.check ? u(30) + checkW : 0);
    var left = sa.x0 + Math.max(0, (sa.w - blockW) / 2);
    var y0 = sa.y0 + Math.max(0, (sa.h - tm.h - gT - rh * n) / 2);
    var listTop = y0 + tm.h + gT;
    var items = [];
    if (title) { items.push({ land: labelTime(title, null, 0), dur: textDefaultDur(title), lead: 0.3, min: 0.4 }); items.push({ land: null, dur: 0.35, min: 0.2 }); }
    var prev = 0, lands = rows.map(function (r) { var t = labelTime(r.text, r.keyword, prev); if (t != null) prev = t + 0.01; return t; });
    lands = spread(lands, title ? 1.4 : 0.6, D * 0.8);
    rows.forEach(function (r, i) {
      items.push({ land: lands[i], dur: dur(doodleName(r.doodle), dz) * 0.85, lead: 0.7, min: 0.45 });
      items.push({ land: null, dur: textDefaultDur(r.text), lead: 0.3, min: 0.4 });
      if (p.check) items.push({ land: null, dur: 0.35, min: 0.2 });
    });
    plan(items);
    var k = 0;
    if (title) {
      var ti = S.write(title, Object.assign({ x: W / 2, y: y0, anchor: "top", at: items[k].start, dur: items[k++].dur }, to));
      S.underline(ti, { at: items[k].start, dur: items[k++].dur, color: "red", pad: u(4) });
    }
    rows.forEach(function (r, i) {
      var yc = listTop + rh * (i + 0.5);
      S.doodle(doodleName(r.doodle), { x: left + dz / 2, y: yc, size: dz, at: items[k].start, dur: items[k++].dur });
      var tx = S.write(str(r.text), Object.assign({ x: left + textX0, y: yc, anchor: "left", color: r.color || "black", at: items[k].start, dur: items[k++].dur }, lo));
      if (p.check) {
        var cxp = P ? left + blockW - checkW / 2 : tx.x + tx.w + u(30) + checkW / 2;
        S.doodle("check", { x: Math.min(cxp, sa.x1 - checkW / 2), y: yc, size: checkW, at: items[k].start, dur: items[k++].dur });
      }
    });
  };

  TPL["before-after"] = function (root, p) {
    S.board(root, { hand: p.hand });
    var sa = safe(), P = V.isPortrait;
    var bf = T(p.before), af = T(p.after);
    var t1 = str(p.beforeTitle) || "Before", t2 = str(p.afterTitle) || "After";
    var mark = p.mark !== false;
    var to = { size: u(P ? 76 : 70), maxWidth: P ? sa.w * 0.7 : sa.w * 0.36, maxLines: 1 };
    var ms = u(P ? 84 : 80);
    var sides = [], dz, lo, no;
    if (!P) {
      var sw = sa.w / 2;
      dz = Math.min(sw * 0.62, sa.h * 0.46);
      lo = { size: u(62), maxWidth: sw * 0.86, maxLines: 2 };
      no = { size: u(46), maxWidth: sw * 0.86, maxLines: 2 };
      [bf, af].forEach(function (sd, i) {
        var x = sa.x0 + sw * (i + 0.5), ttl = i ? t2 : t1;
        var lm = measureBlock(str(sd.label), lo), nm = sd.note ? measureBlock(str(sd.note), no) : { h: 0 }, tH = measureBlock(ttl, to).h;
        var stackH = tH + u(40) + dz + u(30) + lm.h + (sd.note ? u(12) + nm.h : 0);
        var y0 = sa.y0 + Math.max(0, (sa.h - stackH) / 2);
        var ly = y0 + tH + u(40) + dz + u(30);
        sides.push({ s: sd, title: ttl, tx: x, ty: y0, dx: x, dy: y0 + tH + u(40) + dz / 2, lx: x, ly: ly, la: "top", nx: x, ny: ly + lm.h + u(12), na: "top" });
      });
    } else {
      var hh = sa.h / 2;
      lo = { size: u(66), maxWidth: sa.w * 0.5, maxLines: 3 };
      no = { size: u(48), maxWidth: sa.w * 0.5, maxLines: 2 };
      [bf, af].forEach(function (sd, i) {
        var ttl = i ? t2 : t1, tH = measureBlock(ttl, to).h;
        var dzi = Math.min(hh - tH - u(110), sa.w * 0.44);
        dz = dz == null ? dzi : Math.min(dz, dzi);
      });
      [bf, af].forEach(function (sd, i) {
        var ttl = i ? t2 : t1, tH = measureBlock(ttl, to).h;
        var lm = measureBlock(str(sd.label), lo), nm = sd.note ? measureBlock(str(sd.note), no) : { h: 0 };
        var colH = lm.h + (sd.note ? u(16) + nm.h : 0);
        var rowH = Math.max(dz, colH), blockH = tH + u(36) + rowH;
        var h0 = sa.y0 + hh * i + (i ? u(24) : 0), y0 = h0 + Math.max(0, (hh - u(24) - blockH) / 2);
        var rowC = y0 + tH + u(36) + rowH / 2;
        var colW = Math.max(lm.w, nm.w || 0), rowW = dz + u(50) + colW, left = sa.x0 + Math.max(0, (sa.w - rowW) / 2);
        sides.push({ s: sd, title: ttl, tx: W / 2, ty: y0, dx: left + dz / 2, dy: rowC, lx: left + dz + u(50), ly: rowC - colH / 2, la: "top-left", nx: left + dz + u(50), ny: rowC - colH / 2 + lm.h + u(16), na: "top-left" });
      });
    }
    var tb = labelTime(bf.label, bf.keyword, 0), ta = labelTime(af.label, af.keyword, (tb || 0) + 0.1);
    var tt1 = labelTime(t1, null, 0), tt2 = labelTime(t2, null, (tb || 0) + 0.1);
    var L = spread([tt1, tb, tt2, ta], 0.5, D * 0.8);
    var items = [{ land: null, dur: 0.5, min: 0.3 }];
    sides.forEach(function (sd, i) {
      items.push({ land: L[i * 2], dur: textDefaultDur(sd.title), lead: 0.3, min: 0.35 });
      items.push({ land: L[i * 2 + 1], dur: dur(doodleName(sd.s.doodle), dz), lead: 0.6, min: 0.6 });
      items.push({ land: null, dur: textDefaultDur(sd.s.label), lead: 0.3, min: 0.4 });
      if (sd.s.note) items.push({ land: null, dur: textDefaultDur(sd.s.note), lead: 0.3, min: 0.3 });
      if (mark) items.push({ land: null, dur: 0.45, min: 0.25 });
    });
    plan(items);
    var k = 0;
    if (!P) S.line(W / 2, sa.y0 + u(10), W / 2 + u(4), sa.y1 - u(10), { at: items[k].start, dur: items[k++].dur, color: "grey", width: u(5) });
    else S.line(sa.x0 + u(20), sa.y0 + sa.h / 2 + u(14), sa.x1 - u(20), sa.y0 + sa.h / 2 + u(10), { at: items[k].start, dur: items[k++].dur, color: "grey", width: u(5) });
    sides.forEach(function (sd, i) {
      var tw = S.write(sd.title, Object.assign({ x: sd.tx, y: sd.ty, anchor: "top", color: i ? "green" : "red", at: items[k].start, dur: items[k++].dur }, to));
      S.doodle(doodleName(sd.s.doodle), { x: sd.dx, y: sd.dy, size: dz, color: sd.s.color, at: items[k].start, dur: items[k++].dur });
      S.write(str(sd.s.label), Object.assign({ x: sd.lx, y: sd.ly, anchor: sd.la, at: items[k].start, dur: items[k++].dur }, lo));
      if (sd.s.note) S.write(str(sd.s.note), Object.assign({ x: sd.nx, y: sd.ny, anchor: sd.na, color: "blue", at: items[k].start, dur: items[k++].dur }, no));
      if (mark) S.doodle(i ? "check" : "cross", { x: Math.min(tw.x + tw.w + ms * 0.85, sa.x1 - ms / 2), y: tw.y + tw.h * 0.42, size: ms, at: items[k].start, dur: items[k++].dur });
    });
  };

  function bubblePath(bx, by, bw, bh, tip) {
    var r = Math.min(bh / 2, u(46)), x0 = bx, y0 = by, x1 = bx + bw, y1 = by + bh;
    var tcx = clamp(tip[0], x0 + r + u(20), x1 - r - u(60)), tw = u(26);
    return "M" + (x0 + r) + " " + y0 + " L" + (x1 - r) + " " + y0 + " Q" + x1 + " " + y0 + " " + x1 + " " + (y0 + r) + " L" + x1 + " " + (y1 - r) + " Q" + x1 + " " + y1 + " " + (x1 - r) + " " + y1 +
      " L" + (tcx + tw) + " " + y1 + " L" + tip[0] + " " + tip[1] + " L" + tcx + " " + y1 + " L" + (x0 + r) + " " + y1 + " Q" + x0 + " " + y1 + " " + x0 + " " + (y1 - r) + " L" + x0 + " " + (y0 + r) + " Q" + x0 + " " + y0 + " " + (x0 + r) + " " + y0;
  }

  TPL["stick-figure-folk-story"] = function (root, p) {
    S.board(root, { hand: p.hand });
    var sa = safe(), P = V.isPortrait;
    var beats = (Array.isArray(p.beats) ? p.beats : []).slice(0, 4).filter(Boolean), n = beats.length || 1;
    var title = str(p.title);
    var to = { size: u(P ? 72 : 62), maxWidth: sa.w * 0.9, maxLines: 1 };
    var tm = title ? measureBlock(title, to) : { h: 0 };
    var top = sa.y0 + (title ? tm.h + u(40) : 0);
    var cols = P ? Math.min(2, n) : n, rowsN = Math.ceil(n / cols);
    var cw = sa.w / cols, rh = (sa.y1 - top) / rowsN;
    var bo = { size: u(P ? 46 : 44), maxWidth: Math.min(cw * 0.8, u(P ? 400 : 460)), maxLines: 2 };
    var bubH = 0;
    beats.forEach(function (b) { if (b.say) bubH = Math.max(bubH, measureBlock(str(b.say), bo).h + u(56)); });
    var fh = Math.min(rh - bubH - u(90), cw * (P ? 0.85 : 0.8), u(P ? 560 : 540));
    fh = Math.max(fh, u(200));
    var cells = beats.map(function (b, i) {
      var row = Math.floor(i / cols), inRow = Math.min(cols, n - row * cols), col = i - row * cols;
      var rowLeft = sa.x0 + (sa.w - inRow * cw) / 2;
      var cx = rowLeft + cw * (col + 0.5);
      var ground = top + rh * (row + 1) - u(24);
      var hasProp = !!b.prop;
      var fx = cx - (hasProp ? cw * 0.14 : 0) * (b.flip ? -1 : 1);
      return { b: b, cx: cx, fx: fx, ground: ground, cw: cw };
    });
    var items = [];
    if (title) items.push({ land: labelTime(title, null, 0), dur: textDefaultDur(title), lead: 0.3, min: 0.35 });
    var prev = 0, lands = beats.map(function (b) { var t = labelTime(b.say || "", b.keyword, prev); if (t != null) prev = t + 0.01; return t; });
    lands = spread(lands, title ? 1.2 : 0.6, D * 0.78);
    cells.forEach(function (c, i) {
      items.push({ land: null, dur: 0.3, min: 0.15 });
      items.push({ land: lands[i], dur: dur("stick-" + (POSE[c.b.pose] ? c.b.pose : "stand"), fh), lead: 0.6, min: 0.5 });
      if (c.b.prop) items.push({ land: null, dur: dur(doodleName(c.b.prop), fh * 0.4) * 0.8, min: 0.35 });
      if (c.b.say) { items.push({ land: null, dur: 0.5, min: 0.3 }); items.push({ land: null, dur: textDefaultDur(c.b.say), lead: 0.3, min: 0.4 }); }
    });
    plan(items);
    var k = 0;
    if (title) S.write(title, Object.assign({ x: W / 2, y: sa.y0, anchor: "top", at: items[k].start, dur: items[k++].dur }, to));
    cells.forEach(function (c) {
      var gx0 = c.cx - c.cw * 0.44, gx1 = c.cx + c.cw * 0.44;
      S.line(gx0, c.ground + u(4), gx1, c.ground, { at: items[k].start, dur: items[k++].dur, color: "grey", width: u(4) });
      var fy = c.ground - fh / 2 - u(2);
      var fig = S.figure(c.b.pose, { x: c.fx, y: fy, size: fh, flip: !!c.b.flip, at: items[k].start, dur: items[k++].dur });
      if (c.b.prop) {
        var ps = Math.max(u(130), fh * 0.42);
        var px = c.fx + (fh * 0.36 + ps * 0.45) * (c.b.flip ? -1 : 1);
        S.doodle(doodleName(c.b.prop), { x: px, y: c.ground - ps / 2 - u(6), size: ps, at: items[k].start, dur: items[k++].dur });
      }
      if (c.b.say) {
        var bm = measureBlock(str(c.b.say), bo);
        var bw = bm.w + u(70), bh = bm.h + u(40);
        var headY = fig.y + fh * 0.02;
        var by = headY - u(50) - bh;
        var bx = clamp(c.cx - bw / 2, sa.x0, sa.x1 - bw);
        if (by < top - u(10)) by = top - u(10);
        var tip = [c.fx + (c.b.flip ? -1 : 1) * fh * 0.06, headY - u(12)];
        S.path(bubblePath(bx, by, bw, bh, tip), { at: items[k].start, dur: items[k++].dur, color: "black", width: u(4.5) });
        S.write(str(c.b.say), Object.assign({ x: bx + bw / 2, y: by + bh / 2, color: "blue", at: items[k].start, dur: items[k++].dur }, bo));
      }
    });
  };

  function quoteMarks(x, y, size, o) {
    var s = size / 100;
    var d = "M" + (x + 30 * s) + " " + (y + 4 * s) + " C" + (x + 6 * s) + " " + (y + 14 * s) + " " + (x + 2 * s) + " " + (y + 40 * s) + " " + (x + 10 * s) + " " + (y + 56 * s) +
      " M" + (x + 70 * s) + " " + (y + 4 * s) + " C" + (x + 46 * s) + " " + (y + 14 * s) + " " + (x + 42 * s) + " " + (y + 40 * s) + " " + (x + 50 * s) + " " + (y + 56 * s);
    return S.path(d, Object.assign({ color: "red", width: size * 0.12 }, o));
  }

  TPL["handwritten-quote"] = function (root, p) {
    S.board(root, { hand: p.hand });
    var sa = safe(), P = V.isPortrait;
    var quote = str(p.quote) || "", author = str(p.author), dn = p.doodle ? doodleName(p.doodle) : null;
    var dz = dn ? u(P ? 300 : 300) : 0, gapD = u(70);
    var qo = { size: u(P ? 86 : 82), maxWidth: P ? sa.w * 0.94 : sa.w * (dn ? 0.62 : 0.8), maxLines: P ? 7 : 5, lineHeight: 1.5 };
    var qm = measureBlock(quote, qo);
    var ao = { size: u(P ? 56 : 52), maxWidth: sa.w * 0.6, maxLines: 1 };
    var am = author ? measureBlock(author, ao) : { h: 0, w: 0 };
    var qmS = u(P ? 120 : 110);
    var authH = author ? u(40) + am.h + u(16) : 0;
    var qx, qy, dX, dY, mx, my;
    if (P) {
      var stackH = (dn ? dz + u(40) : 0) + qmS * 0.75 + qm.h + authH;
      var y0 = sa.y0 + Math.max(0, (sa.h - stackH) / 2);
      dX = W / 2; dY = y0 + dz / 2;
      qx = W / 2; qy = y0 + (dn ? dz + u(40) : 0) + qmS * 0.75;
      mx = qx - qm.w / 2 - qmS * 0.05; my = qy - qmS * 0.78;
    } else {
      var totalW = qm.w + (dn ? gapD + dz : 0), left = sa.x0 + Math.max(0, (sa.w - totalW) / 2);
      qx = left + qm.w / 2; qy = sa.y0 + Math.max(0, (sa.h - qm.h - authH) / 2);
      dX = left + qm.w + gapD + dz / 2; dY = qy + (qm.h + authH) / 2;
      mx = left - qmS * 0.8; my = qy - qmS * 0.4;
    }
    var qRight = qx + qm.w / 2;
    var first = contentWords(quote)[0];
    var tQ = first ? kwFind(first, 0) : null;
    var tA = author ? labelTime(author, null, 0) : null;
    var items = [{ land: null, dur: 0.45, min: 0.3 }];
    if (dn && P) items.push({ land: null, dur: dur(dn, dz) * 0.8, min: 0.5 });
    items.push({ land: tQ, dur: textDefaultDur(quote), lead: 0.12, min: 1.2 });
    if (author) { items.push({ land: null, dur: 0.25, min: 0.15 }); items.push({ land: tA != null && tA > (tQ || 0) ? tA : null, dur: textDefaultDur(author), lead: 0.3, min: 0.4 }); items.push({ land: null, dur: 0.35, min: 0.2 }); }
    if (dn && !P) items.push({ land: null, dur: dur(dn, dz) * 0.8, min: 0.5 });
    plan(items);
    var k = 0;
    quoteMarks(mx, my, qmS, { at: items[k].start, dur: items[k++].dur });
    if (dn && P) S.doodle(dn, { x: dX, y: dY, size: dz, at: items[k].start, dur: items[k++].dur });
    var qi = S.write(quote, Object.assign({ x: qx, y: qy, anchor: "top", at: items[k].start, dur: items[k++].dur }, qo));
    if (author) {
      var ay = qi.y + qi.h + u(40) + am.h / 2;
      var ax1 = Math.min(sa.x1, qRight), ax0 = ax1 - am.w;
      S.line(ax0 - u(70), ay, ax0 - u(22), ay, { at: items[k].start, dur: items[k++].dur, color: "blue", width: u(5) });
      var ai = S.write(author, Object.assign({ x: ax0, y: ay, anchor: "left", color: "blue", at: items[k].start, dur: items[k++].dur }, ao));
      S.underline(ai, { at: items[k].start, dur: items[k++].dur, color: "red", pad: u(2) });
    }
    if (dn && !P) S.doodle(dn, { x: dX, y: dY, size: dz, at: items[k].start, dur: items[k++].dur });
  };

  TPL["big-number"] = function (root, p) {
    S.board(root, { hand: p.hand });
    var sa = safe(), P = V.isPortrait;
    var value = str(p.value) || "?", label = str(p.label), dn = p.doodle ? doodleName(p.doodle) : null;
    var dz = dn ? (P ? Math.min(sa.w * 0.46, u(440)) : Math.min(sa.h * 0.5, sa.w * 0.3)) : 0;
    var vo = { size: u(P ? 260 : 290), maxWidth: P ? sa.w * 0.94 : sa.w * (dn ? 0.55 : 0.85), maxLines: 1, weight: 0.1 };
    var lo = { size: u(P ? 72 : 66), maxWidth: P ? sa.w * 0.94 : sa.w * (dn ? 0.5 : 0.8), maxLines: 2 };
    var vm = measureBlock(value, vo), lm = label ? measureBlock(label, lo) : { h: 0, w: 0 };
    var ulH = u(50);
    var colH = vm.h + ulH + (label ? u(30) + lm.h : 0);
    var vx, vy, dX, dY;
    if (P) {
      var stackH = (dn ? dz + u(50) : 0) + colH;
      var y0 = sa.y0 + Math.max(0, (sa.h - stackH) / 2);
      dX = W / 2; dY = y0 + dz / 2; vx = W / 2; vy = y0 + (dn ? dz + u(50) : 0);
    } else {
      // doodle on the left (drawn first), the number lands on its word on the right
      var colW = Math.max(vm.w, lm.w), gapX = u(90), totalW = colW + (dn ? gapX + dz : 0);
      var x0 = sa.x0 + Math.max(0, (sa.w - totalW) / 2);
      dX = x0 + dz / 2; dY = sa.cy;
      vx = x0 + (dn ? dz + gapX : 0) + colW / 2; vy = sa.y0 + (sa.h - colH) / 2;
    }
    var tV = kwFind(p.keyword, 0);
    if (tV == null) tV = labelTime(value, null, 0);
    var tL = labelTime(label, p.labelKeyword, (tV || 0) + 0.05);
    var items = [];
    if (dn) items.push({ land: null, dur: dur(dn, dz) * 0.85, min: 0.5, stretch: 1.3 });
    items.push({ land: tV != null ? tV : Math.min(1, D * 0.2), dur: textDefaultDur(value) * 1.4 + 0.2, lead: 0.5, min: 0.5, stretch: 1.6 });
    items.push({ land: null, dur: 0.55, min: 0.3 });
    if (label) items.push({ land: tL, dur: textDefaultDur(label), lead: 0.3, min: 0.4 });
    plan(items);
    var k = 0;
    if (dn) S.doodle(dn, { x: dX, y: dY, size: dz, at: items[k].start, dur: items[k++].dur });
    var vi = S.write(value, Object.assign({ x: vx, y: vy, anchor: "top", color: p.color || "red", at: items[k].start, dur: items[k++].dur }, vo));
    S.underline(vi, { double: true, color: "blue", at: items[k].start, dur: items[k++].dur, pad: u(-6), width: u(7) });
    if (label) S.write(label, Object.assign({ x: vx, y: vi.y + vi.h + ulH + u(10), anchor: "top", at: items[k].start, dur: items[k++].dur }, lo));
  };

  TPL["pan-board"] = function (root, p) {
    S.board(root, { hand: p.hand });
    var P = V.isPortrait;
    var stops = (Array.isArray(p.stops) ? p.stops : []).slice(0, 6).filter(Boolean), n = stops.length || 1;
    var title = str(p.title);
    var sa = safe();
    var dz = P ? u(400) : Math.min(H * 0.42, u(450));
    var lo = { size: u(P ? 86 : 82), maxWidth: P ? u(560) : u(820), maxLines: 2 };
    var to = { size: u(P ? 78 : 68), maxWidth: P ? u(900) : u(1000), maxLines: 1 };
    // stop centres on a big board: a zigzag to the right (wide) or downward (tall)
    var pos = stops.map(function (s, i) {
      var z = n > 1 ? (i % 2 ? 1 : -1) : 0;
      if (P) return [sa.cx + z * u(300), sa.cy + i * u(620)];
      return [W / 2 + i * W * 0.56, H / 2 + z * H * 0.2];
    });
    var units = stops.map(function (s, i) {
      var lh = measureBlock(str(s.label), lo).h, uh = dz + u(30) + lh, c = pos[i];
      var top = c[1] - uh / 2;
      return { x: c[0], dy: top + dz / 2, ly: top + dz + u(30), box: { x: c[0] - Math.max(dz, measureBlock(str(s.label), lo).w) / 2, y: top, w: Math.max(dz, measureBlock(str(s.label), lo).w), h: uh } };
    });
    var prev = 0, lands = stops.map(function (s) { var t = labelTime(s.label, s.keyword, prev); if (t != null) prev = t + 0.01; return t; });
    lands = spread(lands, title ? 1.4 : 0.6, D * 0.72);
    var items = [];
    if (title) items.push({ land: labelTime(title, null, 0), dur: textDefaultDur(title), lead: 0.3, min: 0.4 });
    stops.forEach(function (s, i) {
      if (i) items.push({ land: lands[i] - 0.5, dur: 0.95, lead: 0.5, min: 0.6 });
      items.push({ land: lands[i], dur: dur(doodleName(s.doodle), dz), lead: 0.6, min: 0.5 });
      items.push({ land: null, dur: textDefaultDur(s.label), lead: 0.3, min: 0.35 });
    });
    if (n > 1) items.push({ land: null, dur: 1.2, min: 0.8 });
    plan(items);
    var k = 0;
    var off0 = [W / 2 - sa.cx, H / 2 - sa.cy];
    S.panTo(pos[0][0] + off0[0], pos[0][1] + off0[1], { at: 0, dur: 0.01 });
    var all = [];
    if (title) {
      var tH = measureBlock(title, to).h;
      all.push(S.write(title, Object.assign({ x: pos[0][0], y: units[0].box.y - u(36) - tH, anchor: "top", at: items[k].start, dur: items[k++].dur }, to)));
    }
    stops.forEach(function (s, i) {
      var un = units[i], c = pos[i];
      if (i) {
        var it = items[k++];
        S.panTo(c[0] + off0[0], c[1] + off0[1], { at: it.start - 0.1, dur: it.dur + 0.25 });
        // tall: doodle to doodle on the diagonal (the label sits below, out of the way); wide: unit to unit
        var sg = pos[i][0] >= pos[i - 1][0] ? 1 : -1;
        var from = P ? { x: pos[i - 1][0] + sg * dz * 0.55, y: units[i - 1].dy } : units[i - 1].box;
        var to = P ? { x: pos[i][0] - sg * dz * 0.12, y: units[i].dy - dz * 0.6 } : un.box;
        S.arrow(from, to, { at: it.start, dur: it.dur, bend: P ? -0.3 * sg : 0.25, width: u(7), pad: P ? 0 : u(24) });
      }
      all.push(S.doodle(doodleName(s.doodle), { x: c[0], y: un.dy, size: dz, at: items[k].start, dur: items[k++].dur }));
      all.push(S.write(str(s.label), Object.assign({ x: c[0], y: un.ly, anchor: "top", at: items[k].start, dur: items[k++].dur }, lo)));
    });
    if (n > 1) {
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      all.forEach(function (r) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); });
      var fin = items[k++];
      S.view({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, { at: fin.start, dur: fin.dur, pad: 0.05 });
    }
  };

  TPL["simple-chart"] = function (root, p) {
    S.board(root, { hand: p.hand });
    var sa = safe(), P = V.isPortrait;
    var data = (Array.isArray(p.data) ? p.data : []).slice(0, 6).filter(function (d) { return d && isFinite(+d.value); }), n = data.length || 1;
    var title = str(p.title), line = p.kind === "line";
    var pre = str(p.prefix), suf = str(p.suffix);
    var to = { size: u(P ? 70 : 60), maxWidth: sa.w * 0.9, maxLines: 2 };
    var tm = title ? measureBlock(title, to) : { h: 0 };
    var vo = { size: u(P ? 48 : 44), maxWidth: (sa.w / n) * 1.1, maxLines: 1 };
    var lo = { size: u(P ? 46 : 42), maxWidth: (sa.w / n) * 0.95, maxLines: 1 };
    var cx0 = sa.x0 + u(P ? 30 : 60), cx1 = sa.x1 - u(20);
    var cy0 = sa.y0 + (title ? tm.h + u(50) : 0) + vo.size * 1.6, cy1 = sa.y1 - lo.size * 1.9;
    var max = 0;
    data.forEach(function (d) { max = Math.max(max, +d.value); });
    max = max || 1;
    var slot = (cx1 - cx0) / n, bw = slot * 0.52, chH = cy1 - cy0;
    var fmt = function (v) { v = +v; var dec = Math.abs(v) < 10 && v % 1 ? 1 : 0; return pre + V.format(v, dec) + suf; };
    var items = [];
    if (title) items.push({ land: labelTime(title, null, 0), dur: textDefaultDur(title), lead: 0.3, min: 0.35 });
    items.push({ land: null, dur: 0.7, min: 0.4 });
    var lands = spread(data.map(function (d) { var t = V.find(String(d.label), 0); return t; }), title ? 1.6 : 0.9, D * 0.75);
    data.forEach(function (d, i) {
      items.push({ land: lands[i], dur: line ? 0.45 : 0.45, lead: 0.5, min: 0.25 });
      items.push({ land: null, dur: line ? 0.25 : 0.45, min: 0.2 });
      items.push({ land: null, dur: textDefaultDur(fmt(d.value)), min: 0.25 });
      items.push({ land: null, dur: textDefaultDur(String(d.label)), min: 0.25 });
    });
    var hi = p.highlight != null && data[+p.highlight] ? +p.highlight : -1;
    if (hi >= 0) items.push({ land: null, dur: 0.6, min: 0.3 });
    plan(items);
    var k = 0;
    if (title) S.write(title, Object.assign({ x: W / 2, y: sa.y0, anchor: "top", at: items[k].start, dur: items[k++].dur }, to));
    S.path("M" + cx0 + " " + (cy0 - u(30)) + " L" + cx0 + " " + cy1 + " L" + cx1 + " " + cy1, { at: items[k].start, dur: items[k++].dur, width: u(5.5) });
    var prevPt = null, valItems = [];
    data.forEach(function (d, i) {
      var xc = cx0 + slot * (i + 0.5), h = Math.max(u(6), (+d.value / max) * chH * 0.9), yt = cy1 - h;
      var col = i === hi ? "red" : "blue";
      if (!line) {
        var x0 = xc - bw / 2, x1 = xc + bw / 2;
        S.path("M" + x0 + " " + cy1 + " L" + x0 + " " + yt + " L" + x1 + " " + yt + " L" + x1 + " " + cy1, { at: items[k].start, dur: items[k++].dur, width: u(5) });
        S.fill("M" + x0 + " " + cy1 + " L" + x0 + " " + yt + " L" + x1 + " " + yt + " L" + x1 + " " + cy1 + " Z", i === hi ? "orange" : "sky", { at: items[k].start, dur: items[k++].dur });
      } else {
        if (prevPt) S.line(prevPt[0], prevPt[1], xc, yt, { at: items[k].start, dur: items[k++].dur, color: "blue", width: u(7) });
        else S.path(circ(xc, yt, u(3)), { at: items[k].start, dur: items[k++].dur, color: "blue", width: u(7) });
        S.path(circ(xc, yt, u(11)), { at: items[k].start, dur: items[k++].dur, color: col, width: u(7) });
        prevPt = [xc, yt];
      }
      var vi = S.write(fmt(d.value), Object.assign({ x: xc, y: yt - u(22) - vo.size, anchor: "top", color: col, at: items[k].start, dur: items[k++].dur }, vo));
      S.write(String(d.label), Object.assign({ x: xc, y: cy1 + u(24), anchor: "top", at: items[k].start, dur: items[k++].dur }, lo));
      valItems.push(vi);
    });
    if (hi >= 0) S.circle(valItems[hi], { at: items[k].start, dur: items[k++].dur, pad: u(16) });
  };

  TPL["title-board"] = function (root, p) {
    S.board(root, { hand: p.hand });
    var sa = safe(), P = V.isPortrait;
    var title = str(p.title) || "", sub = str(p.subtitle);
    var ds = (Array.isArray(p.doodles) ? p.doodles : []).slice(0, 3).map(doodleName);
    var to = { size: u(P ? 124 : 118), maxWidth: P ? sa.w * 0.96 : sa.w * 0.66, maxLines: P ? 3 : 2, weight: 0.095 };
    var so = { size: u(P ? 60 : 56), maxWidth: P ? sa.w * 0.94 : sa.w * 0.6, maxLines: 2 };
    var tm = measureBlock(title, to), sm = sub ? measureBlock(sub, so) : { h: 0 };
    var ulH = u(60);
    var colH = tm.h + ulH + (sub ? u(20) + sm.h : 0);
    var dzTop = P ? u(300) : 0, dzSmall = u(P ? 220 : 215);
    var y0;
    if (P) y0 = sa.y0 + (ds.length ? dzTop + u(60) : 0) + Math.max(0, (sa.h - colH - (ds.length ? dzTop + u(60) : 0) - (ds.length > 1 ? dzSmall + u(40) : 0)) / 2);
    else y0 = sa.y0 + (sa.h - colH) / 2 - (ds.length > 2 ? u(50) : 0);
    var spots = P ? [[W / 2, sa.y0 + dzTop / 2, dzTop], [sa.x0 + dzSmall * 0.75, sa.y1 - dzSmall / 2, dzSmall], [sa.x1 - dzSmall * 0.75, sa.y1 - dzSmall / 2, dzSmall]]
      : [[sa.x0 + dzSmall * 0.6, sa.y0 + dzSmall * 0.75, dzSmall], [sa.x1 - dzSmall * 0.6, sa.y0 + dzSmall * 0.95, dzSmall], [W / 2, sa.y1 - dzSmall / 2, dzSmall]];
    if (!P && ds.length < 3) spots = [[sa.x0 + dzSmall * 0.6, sa.y0 + dzSmall * 0.75, dzSmall], [sa.x1 - dzSmall * 0.6, sa.y1 - dzSmall * 0.75, dzSmall]];
    if (P && ds.length === 2) spots = [[W / 2, sa.y0 + dzTop / 2, dzTop], [W / 2, sa.y1 - dzSmall / 2, dzSmall]];
    var tT = labelTime(title, p.keyword, 0);
    var items = [{ land: tT, dur: textDefaultDur(title) * 1.1, lead: 0.3, min: 0.6, stretch: 1.4 }, { land: null, dur: 0.55, min: 0.3 }];
    if (sub) items.push({ land: labelTime(sub, null, (tT || 0) + 0.1), dur: textDefaultDur(sub), lead: 0.3, min: 0.4 });
    ds.forEach(function (d, i) { items.push({ land: null, dur: dur(d, spots[i][2]) * 0.8, min: 0.4 }); });
    plan(items);
    var k = 0;
    var ti = S.write(title, Object.assign({ x: W / 2, y: y0, anchor: "top", at: items[k].start, dur: items[k++].dur }, to));
    S.underline(ti, { double: true, color: p.color || "red", at: items[k].start, dur: items[k++].dur, pad: u(0), width: u(7) });
    if (sub) S.write(sub, Object.assign({ x: W / 2, y: ti.y + ti.h + ulH + u(10), anchor: "top", color: "blue", at: items[k].start, dur: items[k++].dur }, so));
    ds.forEach(function (d, i) { S.doodle(d, { x: spots[i][0], y: spots[i][1], size: spots[i][2], at: items[k].start, dur: items[k++].dur, rot: i % 2 ? 7 : -7 }); });
  };

  TPL["timeline"] = function (root, p) {
    S.board(root, { hand: p.hand });
    var sa = safe(), P = V.isPortrait;
    var ev = (Array.isArray(p.events) ? p.events : []).slice(0, 5).filter(Boolean), n = ev.length || 1;
    var title = str(p.title);
    var to = { size: u(P ? 72 : 60), maxWidth: sa.w * 0.9, maxLines: 1 };
    var tm = title ? measureBlock(title, to) : { h: 0 };
    var prev = 0, lands = ev.map(function (e) {
      var t = kwFind(str(e.date), prev);
      if (t == null) t = labelTime(e.label, e.keyword, prev);
      if (t != null) prev = t + 0.01;
      return t;
    });
    lands = spread(lands, title ? 1.6 : 1.0, D * 0.8);
    var items = [];
    if (title) items.push({ land: labelTime(title, null, 0), dur: textDefaultDur(title), lead: 0.3, min: 0.35 });
    items.push({ land: null, dur: 0.8, min: 0.4 });
    var dz = P ? u(210) : u(190);
    ev.forEach(function (e, i) {
      items.push({ land: lands[i] - 0.15, dur: 0.2, min: 0.12 });
      items.push({ land: lands[i], dur: textDefaultDur(str(e.date)), lead: 0.2, min: 0.25 });
      items.push({ land: null, dur: textDefaultDur(str(e.label)), min: 0.3 });
      if (e.doodle) items.push({ land: null, dur: dur(doodleName(e.doodle), dz) * 0.8, min: 0.4 });
    });
    plan(items);
    var k = 0;
    if (title) S.write(title, Object.assign({ x: W / 2, y: sa.y0, anchor: "top", at: items[k].start, dur: items[k++].dur }, to));
    var dO = { size: u(P ? 64 : 56), maxWidth: u(320), maxLines: 1 };
    if (!P) {
      var ly = (sa.y0 + (title ? tm.h + u(30) : 0) + sa.y1) / 2 + u(10);
      var x0 = sa.x0, x1 = sa.x1, slot = (x1 - x0 - u(40)) / n;
      S.arrow({ x: x0, y: ly }, { x: x1, y: ly - u(4) }, { at: items[k].start, dur: items[k++].dur, bend: 0, color: "black", width: u(6), pad: 0 });
      var lab = { size: u(46), maxWidth: Math.min(slot * 1.7, u(420)), maxLines: 2 };
      ev.forEach(function (e, i) {
        var xc = x0 + slot * (i + 0.5), up = i % 2 === 0, sgn = up ? -1 : 1;
        S.line(xc, ly - u(18), xc, ly + u(18), { at: items[k].start, dur: items[k++].dur, width: u(6) });
        S.write(str(e.date), Object.assign({ x: xc, y: ly + sgn * u(64), color: "red", at: items[k].start, dur: items[k++].dur }, dO));
        var lm = measureBlock(str(e.label), lab);
        var lyc = ly + sgn * (u(64) + dO.size * 0.6 + u(28) + lm.h / 2);
        S.write(str(e.label), Object.assign({ x: xc, y: lyc, at: items[k].start, dur: items[k++].dur }, lab));
        if (e.doodle) {
          var dyc = lyc + sgn * (lm.h / 2 + u(26) + dz / 2);
          var c = clampBox(xc, dyc, dz, dz, sa);
          S.doodle(doodleName(e.doodle), { x: c[0], y: c[1], size: dz, at: items[k].start, dur: items[k++].dur });
        }
      });
    } else {
      var lx = sa.x0 + u(80), yA = sa.y0 + (title ? tm.h + u(50) : 0), yB = sa.y1;
      var rh = (yB - yA - u(40)) / n;
      S.arrow({ x: lx, y: yA }, { x: lx + u(3), y: yB }, { at: items[k].start, dur: items[k++].dur, bend: 0, color: "black", width: u(6), pad: 0 });
      var tx = lx + u(60);
      var labP = { size: u(54), maxWidth: sa.x1 - tx - dz - u(30), maxLines: 2 };
      ev.forEach(function (e, i) {
        var yc = yA + rh * (i + 0.5);
        S.line(lx - u(20), yc, lx + u(20), yc, { at: items[k].start, dur: items[k++].dur, width: u(6) });
        var di = S.write(str(e.date), Object.assign({ x: tx, y: yc - u(14), anchor: "left", color: "red", at: items[k].start, dur: items[k++].dur }, dO));
        S.write(str(e.label), Object.assign({ x: tx, y: di.y + di.h + u(8), anchor: "top-left", at: items[k].start, dur: items[k++].dur }, labP));
        if (e.doodle) S.doodle(doodleName(e.doodle), { x: sa.x1 - Math.min(dz, rh * 0.75) / 2, y: yc + u(10), size: Math.min(dz, rh * 0.75), at: items[k].start, dur: items[k++].dur });
      });
    }
  };

  // ------------------------- public API -------------------------
  function render(id, root, props) {
    var fn = TPL[id];
    if (!fn) throw new Error("Unknown whiteboard template: " + id);
    fn(root || V.root(), T(props));
  }
  function fallback(root, narration) {
    root = root || V.root();
    while (root.firstChild) root.removeChild(root.firstChild);
    st = null;
    S.board(root, {});
    var words = contentWords(narration || V.narration).slice(0, 4).join(" ");
    var sa = safe();
    S.doodle(pickDoodle(narration || ""), { x: W / 2, y: sa.y0 + sa.h * 0.35, size: Math.min(sa.w, sa.h) * 0.42, at: 0.2, dur: Math.min(2, D * 0.4) });
    if (words) S.write(words, { x: W / 2, y: sa.y0 + sa.h * 0.78, size: u(70), maxWidth: sa.w * 0.9, maxLines: 2, dur: Math.min(2, D * 0.3) });
  }

  S.board = board;
  S.doodle = doodle;
  S.figure = figure;
  S.write = write;
  S.measureText = function (text, size) { var l = layoutText(String(text).replace(/\n/g, " "), { size: size, maxWidth: 1e9, maxLines: 1 }); return l.w; };
  S.measureBlock = measureBlock;
  S.path = path;
  S.line = line;
  S.fill = fill;
  S.arrow = arrow;
  S.circle = circle;
  S.underline = underline;
  S.box = box;
  S.panTo = panTo;
  S.view = view;
  S.camera = camAt;
  S.erase = erase;
  S.dragIn = dragIn;
  S.wait = function (sec) { var s = ensure(); s.cursor += Math.max(0, +sec || 0); return s.cursor; };
  S.cursor = function () { return st ? st.cursor : 0.2; };
  S.setCursor = function (t) { var s = ensure(); s.cursor = Math.max(0, +t || 0); return s.cursor; };
  S.syncTimes = syncTimes;
  S.plan = plan;
  S.safe = safe;
  S.u = u;
  S.ink = INK;
  S.colorOf = function (c) { return colorOf(c); };
  S.color = function (i) { return CYCLE[((i % CYCLE.length) + CYCLE.length) % CYCLE.length]; };
  S.doodles = Object.keys(DL);
  S.hasDoodle = hasDoodle;
  S.pickDoodle = pickDoodle;
  S.poses = Object.keys(POSE);
  S.templates = Object.keys(TPL);
  S.render = render;
  // Screen boxes of the drawings visible at time t (for tests: overlaps and safe-area checks).
  S.inspect = function (t) {
    if (!st) return [];
    if (st.dirty) finalize();
    var c = camAt(t), moving = st.cams.some(function (k) { return k.dur > 0.05 && t > k.at && t < k.at + k.dur; });
    return st.items.filter(function (r) {
      if (r.it.t0 > t) return false;
      return !st.erases.some(function (e) { return r.it.t1 <= e && e <= t; });
    }).map(function (r) {
      var p0 = proj([r.it.x, r.it.y], c);
      return { kind: r.kind, label: r.label, x: p0[0], y: p0[1], w: r.it.w * c.z, h: r.it.h * c.z, moving: moving };
    });
  };
  S.flush = function () { if (st) { finalize(); frame(V.time()); } };
  S.fallback = fallback;
})();

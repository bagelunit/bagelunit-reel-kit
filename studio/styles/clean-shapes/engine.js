/* Clean Shapes engine (style id: clean-shapes).
 *
 * Architecture
 * - Build time: S.scene() makes one SVG (viewBox in design units, short side = 1080 du) with the
 *   layers bg (static), far, mid, world, front, fx (each moved by the camera with its own parallax
 *   factor) and one HTML text layer (ui, no camera). Worlds, illustrations, creatures, morphs and
 *   particles create all their DOM once.
 * - Every moving thing is an Actor: base placement plus composable motion (enter, exit, float, spin,
 *   pulse, keyframes, hooks). Illustrations and creatures add their own internal animation
 *   functions.
 * - One V.onFrame(frame) sets EVERYTHING from t: camera, layer transforms, world animation, actors,
 *   internal animation, particles. Nothing depends on the previous frame, so seeking works both ways.
 * - Timing: templates find their key words with kwFind/labelTime (V.find first, then a narration
 *   estimate), fill gaps with spread(), and keep the last second still (endT()).
 * - Layout: text is measured with canvas (same font stack as the page) and balanced; each template
 *   has a wide and a tall layout computed from the measured sizes, then centred in the safe area.
 * No network, no timers, no wall clock; randomness only from V.makeRand.
 */
(function () {
  "use strict";
  var V = window.V;
  if (!V) return;
  var S = (window.SceneStyle = window.SceneStyle || {});
  var NS = "http://www.w3.org/2000/svg";
  var doc = document;
  var UNIT = V.unit || 1;
  var W = V.width / UNIT, H = V.height / UNIT, D = V.duration;
  var PI = Math.PI, TAU = PI * 2;
  var FONT = 'Inter, "Noto Sans", system-ui, -apple-system, "Segoe UI", sans-serif';

  // ------------------------- small utils -------------------------
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, p) { return a + (b - a) * p; }
  function str(v) { return typeof v === "string" ? v.trim() : v == null ? "" : String(v); }
  function num(v, d) { var n = typeof v === "number" ? v : parseFloat(v); return isFinite(n) ? n : d; }
  function f2(n) { return Math.round(n * 100) / 100; }
  function smooth(p) { p = clamp(p, 0, 1); return p * p * (3 - 2 * p); }
  function prog(t, a, b) { return b > a ? clamp((t - a) / (b - a), 0, 1) : t >= b ? 1 : 0; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function normWord(s) {
    return String(s == null ? "" : s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
  }
  function hash(s) { s = String(s); var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mod(a, b) { return ((a % b) + b) % b; }
  var c1 = 1.70158, c3 = c1 + 1;
  var EASE = {
    linear: function (x) { return x; },
    outCubic: function (x) { return 1 - Math.pow(1 - x, 3); },
    inCubic: function (x) { return x * x * x; },
    inOut: function (x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; },
    outBack: function (x) { return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
    inBack: function (x) { return c3 * x * x * x - c1 * x * x; },
    outExpo: function (x) { return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x); },
    // soft elastic: overshoots about 8 % and settles
    pop: function (x) { return x >= 1 ? 1 : x <= 0 ? 0 : 1 - Math.cos(x * PI * 2.2) * Math.exp(-5.5 * x); },
    bounce: function (x) {
      var n1 = 7.5625, d1 = 2.75;
      if (x < 1 / d1) return n1 * x * x;
      if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
      if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
      return n1 * (x -= 2.625 / d1) * x + 0.984375;
    },
  };
  EASE.out = EASE.outCubic;
  EASE.inOutCubic = EASE.inOut;
  function ease(name) { return typeof name === "function" ? name : EASE[name] || EASE.inOut; }

  // ------------------------- palette and colour maths -------------------------
  var PAL = {
    ink: "#1E1452", night: "#140E3A", deep: "#2A1B6E", violet: "#7B5CFF", lilac: "#C9C2EE",
    pink: "#FF7AC6", rose: "#FF5C8A", coral: "#FF6B6B", orange: "#FF9F43", sun: "#FFD43B",
    cream: "#FFF3D6", mint: "#3DDC97", green: "#2ECC71", leaf: "#6BCB77", teal: "#1FB5AD",
    aqua: "#5CE1E6", sky: "#4DABF7", blue: "#3B7DD8", navy: "#1C2E6E", white: "#FFFFFF",
    brown: "#A0673B", sand: "#F4D9A6", grey: "#A9A6C8", gray: "#A9A6C8", red: "#F0524F", gold: "#F5B82E",
    yellow: "#FFD43B", purple: "#7B5CFF",
  };
  var CYCLE = ["coral", "sky", "mint", "sun", "violet", "pink", "orange", "teal"];
  function col(c, def) {
    if (c == null || c === "") return def == null ? PAL.violet : col(def);
    var s = String(c).trim();
    if (PAL[s.toLowerCase()]) return PAL[s.toLowerCase()];
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s)) return s;
    if (/^rgba?\(/i.test(s)) return s;
    return def == null ? PAL.violet : col(def);
  }
  function rgbOf(c) {
    c = col(c);
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c);
    if (m) {
      var h = m[1];
      if (h.length === 3) h = h.replace(/./g, function (x) { return x + x; });
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }
    m = /^rgba?\(([^)]+)\)/i.exec(c);
    if (m) { var p = m[1].split(/[\s,\/]+/).map(parseFloat); return [p[0] || 0, p[1] || 0, p[2] || 0]; }
    return [123, 92, 255];
  }
  function hexOf(r) {
    return "#" + r.map(function (v) { v = Math.round(clamp(v, 0, 255)); return (v < 16 ? "0" : "") + v.toString(16); }).join("");
  }
  function mix(a, b, p) { var x = rgbOf(a), y = rgbOf(b); return hexOf([lerp(x[0], y[0], p), lerp(x[1], y[1], p), lerp(x[2], y[2], p)]); }
  // Shadows are coloured: shade mixes toward deep indigo, never grey or black.
  function shade(c, p) { return mix(c, "#24125A", p == null ? 0.25 : p); }
  function tint(c, p) { return mix(c, "#FFFFFF", p == null ? 0.3 : p); }
  function lum(c) { var r = rgbOf(c); return (0.299 * r[0] + 0.587 * r[1] + 0.114 * r[2]) / 255; }
  function rgba(c, a) { var r = rgbOf(c); return "rgba(" + r[0] + "," + r[1] + "," + r[2] + "," + a + ")"; }

  // ------------------------- svg helpers -------------------------
  function el(tag, attrs, parent) {
    var n = doc.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function hel(tag, cls, parent) {
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (parent) parent.appendChild(n);
    return n;
  }
  function P2(x, y) { return f2(x) + " " + f2(y); }
  // Closed (or open) Catmull-Rom spline through points, as cubic Bezier path data.
  function smoothPath(pts, open) {
    var n = pts.length;
    if (n < 2) return "";
    if (n === 2) return "M" + P2(pts[0][0], pts[0][1]) + "L" + P2(pts[1][0], pts[1][1]);
    var d = "M" + P2(pts[0][0], pts[0][1]);
    var last = open ? n - 1 : n;
    for (var i = 0; i < last; i++) {
      var p0 = pts[open ? Math.max(0, i - 1) : (i - 1 + n) % n], p1 = pts[i], p2 = pts[open ? i + 1 : (i + 1) % n], p3 = pts[open ? Math.min(n - 1, i + 2) : (i + 2) % n];
      d += "C" + P2(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6) + " " + P2(p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6) + " " + P2(p2[0], p2[1]);
    }
    return d + (open ? "" : "Z");
  }
  function polyD(pts, close) { return pts.map(function (p, i) { return (i ? "L" : "M") + P2(p[0], p[1]); }).join("") + (close === false ? "" : "Z"); }
  function starD(r1, r2, n, rot) {
    n = n || 5; var pts = [];
    for (var i = 0; i < n * 2; i++) { var a = -PI / 2 + (rot || 0) + (i * PI) / n, r = i % 2 ? r2 : r1; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    return polyD(pts);
  }
  function sparkleD(r) {
    var k = r * 0.16;
    return "M0 " + -r + "Q" + k + " " + -k + " " + r + " 0Q" + k + " " + k + " 0 " + r + "Q" + -k + " " + k + " " + -r + " 0Q" + -k + " " + -k + " 0 " + -r + "Z";
  }
  function heartD(s) {
    s = s || 1;
    var pts = [];
    for (var i = 0; i < 48; i++) {
      var t = (i / 48) * TAU;
      pts.push([16 * Math.pow(Math.sin(t), 3) * s * 5.6, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * s * 5.6 - 8 * s]);
    }
    return smoothPath(pts);
  }
  function cloudD(w) {
    w = w || 200;
    var k = w / 200;
    return "M" + P2(-88 * k, 30 * k) + "C" + P2(-112 * k, 30 * k) + " " + P2(-112 * k, -8 * k) + " " + P2(-84 * k, -10 * k) +
      "C" + P2(-86 * k, -46 * k) + " " + P2(-40 * k, -58 * k) + " " + P2(-22 * k, -32 * k) +
      "C" + P2(-10 * k, -72 * k) + " " + P2(52 * k, -70 * k) + " " + P2(52 * k, -26 * k) +
      "C" + P2(92 * k, -36 * k) + " " + P2(112 * k, 26 * k) + " " + P2(80 * k, 30 * k) + "Z";
  }

  // ------------------------- scene state -------------------------
  var st = null;
  function uid(p) { return "fv" + (p || "") + ++st.uid; }
  function need() { if (!st) S.scene(V.root(), { world: "studio" }); return st; }
  // Linear lit gradient fill (cached per colour).
  function fvGrad(c, dir) {
    need();
    c = col(c);
    var key = "g" + c + (dir || "");
    if (st.grads[key]) return st.grads[key];
    var id = uid("g");
    var g = el("linearGradient", dir === "h" ? { id: id, x1: 0, y1: 0, x2: 1, y2: 0 } : { id: id, x1: 0.15, y1: 0, x2: 0.85, y2: 1 }, st.defs);
    el("stop", { offset: "0", "stop-color": tint(c, 0.22) }, g);
    el("stop", { offset: "0.55", "stop-color": c }, g);
    el("stop", { offset: "1", "stop-color": shade(c, 0.18) }, g);
    return (st.grads[key] = "url(#" + id + ")");
  }
  // Radial glow fill: colour at the centre fading to nothing.
  function fvGlow(c, a) {
    need();
    c = col(c); a = a == null ? 0.5 : a;
    var key = "r" + c + a;
    if (st.grads[key]) return st.grads[key];
    var id = uid("r");
    var g = el("radialGradient", { id: id, cx: 0.5, cy: 0.5, r: 0.5 }, st.defs);
    el("stop", { offset: "0", "stop-color": c, "stop-opacity": a }, g);
    el("stop", { offset: "0.45", "stop-color": c, "stop-opacity": a * 0.45 }, g);
    el("stop", { offset: "1", "stop-color": c, "stop-opacity": 0 }, g);
    return (st.grads[key] = "url(#" + id + ")");
  }
  function vGrad(stops) {
    need();
    var key = "v" + stops.join(",");
    if (st.grads[key]) return st.grads[key];
    var id = uid("v");
    var g = el("linearGradient", { id: id, x1: 0, y1: 0, x2: 0, y2: 1 }, st.defs);
    stops.forEach(function (c, i) { el("stop", { offset: String(i / (stops.length - 1)), "stop-color": col(c) }, g); });
    return (st.grads[key] = "url(#" + id + ")");
  }
  function rGrad(stops, cx, cy) {
    need();
    var key = "q" + stops.join(",") + cx + cy;
    if (st.grads[key]) return st.grads[key];
    var id = uid("q");
    var g = el("radialGradient", { id: id, cx: cx == null ? 0.5 : cx, cy: cy == null ? 0.5 : cy, r: 0.75 }, st.defs);
    stops.forEach(function (c, i) { el("stop", { offset: String(i / (stops.length - 1)), "stop-color": col(c) }, g); });
    return (st.grads[key] = "url(#" + id + ")");
  }
  // Terminator overlay for spheres (transparent upper left, coloured dusk lower right).
  function sphereShade() {
    need();
    if (st.grads.sph) return st.grads.sph;
    var id = uid("s");
    var g = el("radialGradient", { id: id, cx: 0.32, cy: 0.28, r: 0.85 }, st.defs);
    el("stop", { offset: "0.45", "stop-color": "#24125A", "stop-opacity": 0 }, g);
    el("stop", { offset: "1", "stop-color": "#24125A", "stop-opacity": 0.42 }, g);
    return (st.grads.sph = "url(#" + id + ")");
  }
  function clipCircle(r, cx, cy) {
    var id = uid("c");
    var cp = el("clipPath", { id: id }, st.defs);
    el("circle", { cx: cx || 0, cy: cy || 0, r: r }, cp);
    return "url(#" + id + ")";
  }
  // Flat shaded sphere: coloured crescent shade, main disc, soft highlight.
  function ball(parent, r, c, o) {
    o = o || {};
    c = col(c);
    var g = el("g", o.x != null ? { transform: "translate(" + f2(o.x) + " " + f2(o.y || 0) + ")" } : null, parent);
    el("circle", { r: r, fill: shade(c, 0.24) }, g);
    el("circle", { cx: -r * 0.06, cy: -r * 0.07, r: r * 0.93, fill: c }, g);
    if (o.hi !== false) el("ellipse", { cx: -r * 0.36, cy: -r * 0.42, rx: r * 0.28, ry: r * 0.16, transform: "rotate(-35 " + f2(-r * 0.36) + " " + f2(-r * 0.42) + ")", fill: "#FFFFFF", opacity: 0.32 }, g);
    return g;
  }
  function cuteFace(g, x, y, s, o) {
    s = s || 1; o = o || {};
    var f = el("g", { transform: "translate(" + f2(x) + " " + f2(y) + ") scale(" + s + ")" }, g);
    [-1, 1].forEach(function (k) {
      el("ellipse", { cx: 13 * k, cy: 0, rx: 5.5, ry: 6.5, fill: PAL.ink }, f);
      el("circle", { cx: 13 * k - 1.8, cy: -2.4, r: 1.9, fill: "#fff" }, f);
      el("ellipse", { cx: 22 * k, cy: 9, rx: 5, ry: 3, fill: "#FF7AA8", opacity: 0.6 }, f);
    });
    el("path", { d: "M-6 7 Q0 13 6 7", fill: "none", stroke: PAL.ink, "stroke-width": 3, "stroke-linecap": "round" }, f);
    return f;
  }

  // ------------------------- text measuring and layout -------------------------
  var cvs = null;
  function textW(txt, size, weight) {
    if (!cvs) cvs = doc.createElement("canvas").getContext("2d");
    cvs.font = (weight || 800) + " " + size.toFixed(2) + "px " + FONT;
    return cvs.measureText(txt).width;
  }
  // "*word*" marks emphasis. Returns tokens [{t, em}].
  function parseEm(text) {
    var toks = [], em = false;
    str(text).replace(/\s+/g, " ").split(" ").forEach(function (w) {
      if (!w) return;
      var s = w, e0 = em;
      if (s.charAt(0) === "*") { e0 = true; s = s.slice(1); em = true; }
      var close = s.length && s.charAt(s.length - 1) === "*";
      if (close) s = s.slice(0, -1);
      // punctuation after the closing star, like *word*, or *word*.
      var m = /^(.*?)\*([^\p{L}\p{N}]*)$/u.exec(s);
      if (m) { s = m[1] + m[2]; close = true; }
      s = s.replace(/\*/g, "");
      if (s) toks.push({ t: s, em: e0 });
      if (close) em = false;
    });
    return toks;
  }
  // Wrap tokens into lines, shrink to fit maxLines, then balance (no orphan words).
  function layoutText(text, o) {
    o = o || {};
    var size = num(o.size, 96), maxW = num(o.maxWidth, W * 0.8), maxLines = Math.max(1, Math.floor(num(o.maxLines, 3)));
    var weight = o.weight || 800, minSize = num(o.minSize, size * 0.4);
    var toks = parseEm(text);
    function wrap(s, limit) {
      var sp = textW(" ", s, weight) + s * (o.wordGap == null ? 0.07 : o.wordGap), lines = [], line = { toks: [], w: 0 };
      toks.forEach(function (tk) {
        var ww = textW(tk.t, s, weight);
        if (line.toks.length && line.w + sp + ww > limit) { lines.push(line); line = { toks: [], w: 0 }; }
        line.w += (line.toks.length ? sp : 0) + ww;
        line.toks.push(tk);
      });
      if (line.toks.length) lines.push(line);
      return lines;
    }
    function widest(ls) { var m = 0; ls.forEach(function (l) { m = Math.max(m, l.w); }); return m; }
    var s = size, lines = wrap(s, maxW);
    for (var i = 0; i < 30 && (lines.length > maxLines || widest(lines) > maxW + 0.5) && s > minSize; i++) { s *= 0.94; lines = wrap(s, maxW); }
    if (lines.length > 1 && o.balance !== false) {
      var lo = widest(lines) * 0.35, hi = widest(lines), n0 = lines.length;
      for (var b = 0; b < 14; b++) { var mid = (lo + hi) / 2; if (wrap(s, mid).length <= n0) hi = mid; else lo = mid; }
      lines = wrap(s, hi + 0.5);
    }
    var lh = num(o.lineHeight, 1.08);
    return { lines: lines, size: s, lh: lh, w: widest(lines), h: s * lh * lines.length, n: lines.length, weight: weight };
  }
  function measureBlock(text, o) { var l = layoutText(text, o); return { w: l.w, h: l.h, size: l.size, lines: l.n }; }

  // ------------------------- timing helpers -------------------------
  var STOP = {};
  "a an the and or but of to in on at by for with from into onto over under is are was were be been being it its this that these those your you we our us my me i his her their they them he she as than then so not no yes do does did have has had will would can could should very just more most less each every all any some about here there what when who how why which also too up out if one".split(" ").forEach(function (w) { STOP[w] = 1; });
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
  // When is a label spoken? Keyword first, then the first content word that is found, in label order
  // (the longest-first order of the pilot lands late on two-word labels like "Moon landing").
  function labelTime(label, keyword, after) {
    if (keyword) { var t = kwFind(keyword, after); if (t != null) return t; }
    var ws = contentWords(label);
    if (!ws.length) ws = str(label).split(/\s+/).filter(Boolean);
    var best = null;
    for (var i = 0; i < ws.length; i++) { var f = V.find(ws[i], after || 0); if (f != null && (best == null || f < best)) best = f; }
    if (best != null) return best;
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
  // Times of a sequence of labels (in order), gaps spread, monotonic, clamped before the final hold.
  function seqTimes(labels, keywords, a, b) {
    var prev = 0, lands = labels.map(function (l, i) {
      var t = labelTime(l, keywords ? keywords[i] : null, prev);
      if (t != null) prev = t + 0.05;
      return t;
    });
    lands = spread(lands, a, b);
    for (var i = 1; i < lands.length; i++) if (lands[i] < lands[i - 1] + 0.25) lands[i] = lands[i - 1] + 0.25;
    var lim = endT(0.6);
    // squeeze into [first, lim] if needed
    if (lands.length && lands[lands.length - 1] > lim) {
      var a0 = Math.min(lands[0], lim), span = lands[lands.length - 1] - a0;
      lands = lands.map(function (t) { return span > 0 ? a0 + ((t - a0) / span) * (lim - a0) : a0; });
    }
    return lands;
  }
  function syncTimes(keys, o) {
    o = o || {};
    var prev = 0, out = [];
    (keys || []).forEach(function (k) { var t = kwFind(k, prev); out.push(t); if (t != null) prev = t + 0.01; });
    out = spread(out);
    for (var i = 1; i < out.length; i++) if (out[i] < out[i - 1]) out[i] = out[i - 1];
    return out.map(function (t) { return Math.max(0, t - (o.lead || 0)); });
  }
  // Latest start for an animation of length dur that must be finished about 1 s before the end.
  function endT(dur) { var hold = D < 5 ? Math.min(0.9, D * 0.18) : 1.0; return Math.max(0.2, D - hold - (dur || 0)); }
  function when(phrase, frac, after) {
    var t = kwFind(phrase, after);
    if (t == null) t = (frac == null ? 0.3 : frac) * D;
    return Math.max(0, t - 0.15);
  }

  // ------------------------- actors -------------------------
  var ENTER_DUR = { pop: 0.6, grow: 0.7, rise: 0.6, drop: 0.95, "slide-left": 0.8, "slide-right": 0.8, spin: 0.8, fade: 0.5 };
  function Actor(node, html, o) {
    o = o || {};
    this.node = node; this.html = !!html;
    this.b = { x: 0, y: 0, s: 1, r: 0, o: 1 };
    this.keys = { x: [], y: [], s: [], r: [], o: [] };
    this.ent = null; this.exs = null; this.fl = null; this.sp = 0; this.pu = null; this.hooks = [];
    this.r0 = o.r || 100; this.layer = o.layer == null ? null : o.layer;
    this.kind = o.kind || "actor"; this.label = o.label || "";
    this.inspectable = o.inspect !== false;
    var R = V.makeRand(hash("a" + (st ? st.actors.length : 0) + (o.label || "")) + 7);
    this.ph = [R() * TAU, R() * TAU, R() * TAU];
    this.cur = { x: 0, y: 0, s: 1, r: 0, o: 1, sx: 1, sy: 1, vis: true };
    this.visible = true;
    if (st) st.actors.push(this);
  }
  var AP = Actor.prototype;
  AP.at = function (x, y) { this.b.x = num(x, this.b.x); this.b.y = num(y, this.b.y); return this; };
  AP.size = function (s) { this.b.s = num(s, 1); return this; };
  AP.rot = function (d) { this.b.r = num(d, 0); return this; };
  AP.alpha = function (o) { this.b.o = num(o, 1); return this; };
  AP.enter = function (t, kind, dur) {
    kind = ENTER_DUR[kind] ? kind : "pop";
    this.ent = { t: Math.max(0, num(t, 0.2)), k: kind, d: Math.max(0.05, num(dur, ENTER_DUR[kind])) };
    return this;
  };
  AP.pop = function (t, dur) { return this.enter(t, "pop", dur); };
  AP.exit = function (t, kind, dur) {
    this.exs = { t: Math.max(0, num(t, D)), k: kind === "fade" ? "fade" : "shrink", d: Math.max(0.05, num(dur, kind === "fade" ? 0.5 : 0.45)) };
    return this;
  };
  AP.float = function (amp, period, rotAmp) { this.fl = { a: num(amp, 10), p: Math.max(0.3, num(period, 3.4)), ra: num(rotAmp, 2) }; return this; };
  AP.spin = function (dps) { this.sp = num(dps, 20); return this; };
  AP.pulse = function (amt, period) { this.pu = { a: num(amt, 0.04), p: Math.max(0.2, num(period, 1.6)) }; return this; };
  AP.to = function (t, props, dur, ez) {
    props = props || {};
    var self = this, at = Math.max(0, num(t, 0)), d = Math.max(0, num(dur, 0.8)), e = ease(ez || "inOut");
    ["x", "y", "s", "r", "o"].forEach(function (k) { if (props[k] != null && isFinite(+props[k])) self.keys[k].push({ at: at, d: d, e: e, v: +props[k] }); });
    ["x", "y", "s", "r", "o"].forEach(function (k) { self.keys[k].sort(function (a, b) { return a.at - b.at; }); });
    return this;
  };
  AP.hook = function (fn) { if (typeof fn === "function") this.hooks.push(fn); return this; };
  AP.radius = function () { return this.r0 * Math.abs(this.cur.s || this.b.s); };
  AP.moving = function (t) {
    if (this.ent && t >= this.ent.t && t <= this.ent.t + this.ent.d) return true;
    if (this.exs && t >= this.exs.t && t <= this.exs.t + this.exs.d) return true;
    for (var k in this.keys) for (var i = 0; i < this.keys[k].length; i++) { var q = this.keys[k][i]; if (t >= q.at && t <= q.at + q.d) return true; }
    return false;
  };
  function evalKeys(list, base, t) {
    var v = base;
    for (var i = 0; i < list.length; i++) {
      var q = list[i];
      if (t < q.at) break;
      if (q.d <= 0 || t >= q.at + q.d) { v = q.v; continue; }
      v = lerp(v, q.v, q.e((t - q.at) / q.d));
      break;
    }
    return v;
  }
  AP.compute = function (t) {
    var b = this.b, c = this.cur, K = this.keys;
    var x = K.x.length ? evalKeys(K.x, b.x, t) : b.x, y = K.y.length ? evalKeys(K.y, b.y, t) : b.y;
    var s = K.s.length ? evalKeys(K.s, b.s, t) : b.s, r = K.r.length ? evalKeys(K.r, b.r, t) : b.r, o = K.o.length ? evalKeys(K.o, b.o, t) : b.o;
    var sx = 1, sy = 1, vis = true, ph = this.ph;
    if (this.fl) {
      var f = this.fl;
      y += f.a * Math.sin((TAU * t) / f.p + ph[0]);
      x += f.a * 0.45 * Math.sin((TAU * t) / (f.p * 1.41) + ph[1]);
      r += f.ra * Math.sin((TAU * t) / (f.p * 1.19) + ph[2]);
    }
    if (this.sp) r += this.sp * t;
    if (this.pu) s *= 1 + this.pu.a * Math.sin((TAU * t) / this.pu.p + ph[0]);
    var e = this.ent;
    if (e) {
      if (t < e.t) vis = false;
      else {
        var p = (t - e.t) / e.d;
        if (p < 1) {
          if (e.k === "pop") { s *= EASE.pop(p); o *= Math.min(1, p * 6); }
          else if (e.k === "grow") { s *= EASE.outCubic(p); sy *= 0.85 + 0.15 * EASE.outBack(p); }
          else if (e.k === "rise") { y += (1 - EASE.outBack(p)) * 90; o *= Math.min(1, p * 4); s *= 0.7 + 0.3 * EASE.outCubic(p); }
          else if (e.k === "drop") {
            var bq = EASE.bounce(p); y -= (1 - bq) * (H * 0.75);
            if (p > 0.3) { var sq = Math.max(0, Math.sin(((p - 0.3) / 0.7) * PI * 3)) * (1 - p) * 0.25; sy *= 1 - sq; sx *= 1 + sq * 0.8; }
          }
          else if (e.k === "slide-left") { x -= (1 - EASE.outBack(p)) * W * 0.6; }
          else if (e.k === "slide-right") { x += (1 - EASE.outBack(p)) * W * 0.6; }
          else if (e.k === "spin") { r -= (1 - EASE.outCubic(p)) * 300; s *= EASE.outBack(p); }
          else if (e.k === "fade") { o *= p; }
        }
      }
    }
    var ex = this.exs;
    if (ex && t >= ex.t) {
      var q2 = (t - ex.t) / ex.d;
      if (q2 >= 1) vis = false;
      else if (ex.k === "fade") o *= 1 - q2;
      else s *= Math.max(0, 1 - EASE.inBack(q2));
    }
    c.x = x; c.y = y; c.s = s; c.r = r; c.o = o; c.sx = sx; c.sy = sy; c.vis = vis;
    for (var i = 0; i < this.hooks.length; i++) this.hooks[i].call(this, t, c);
    return c;
  };
  AP.apply = function () {
    var c = this.cur, n = this.node;
    var show = c.vis && c.o > 0.003 && Math.abs(c.s * c.sx) > 0.002 && Math.abs(c.s * c.sy) > 0.002;
    if (show !== this.visible) { n.style.display = show ? "" : "none"; this.visible = show; }
    if (!show) return;
    if (this.html) {
      n.style.transform = "translate(" + f2(c.x * UNIT) + "px," + f2(c.y * UNIT) + "px) translate(-50%,-50%)" + (c.r ? " rotate(" + f2(c.r) + "deg)" : "") + " scale(" + (c.s * c.sx).toFixed(4) + "," + (c.s * c.sy).toFixed(4) + ")";
      n.style.opacity = c.o >= 0.999 ? "" : c.o.toFixed(3);
    } else {
      n.setAttribute("transform", "translate(" + f2(c.x) + " " + f2(c.y) + ")" + (c.r ? " rotate(" + f2(c.r) + ")" : "") + " scale(" + (c.s * c.sx).toFixed(4) + " " + (c.s * c.sy).toFixed(4) + ")");
      if (c.o >= 0.999) n.removeAttribute("opacity"); else n.setAttribute("opacity", c.o.toFixed(3));
    }
  };
  function actor(node, html) {
    need();
    var a = new Actor(node, html === true, { inspect: false });
    if (node && node.getBBox && !html) { try { var bb = node.getBBox(); a.r0 = Math.max(bb.width, bb.height) / 2 || 100; } catch (e) {} }
    return a;
  }

  // ------------------------- camera -------------------------
  function Camera() { this.keys = []; this.push = 0.035; this.breathe = 0.014; }
  Camera.prototype.to = function (t, p, dur, ez) {
    p = p || {};
    this.keys.push({ at: Math.max(0, num(t, 0)), d: Math.max(0, num(dur, 1.2)), e: ease(ez || "inOut"), x: p.x, y: p.y, z: p.z });
    this.keys.sort(function (a, b) { return a.at - b.at; });
    return this;
  };
  Camera.prototype.raw = function (t) {
    var x = W / 2, y = H / 2, lz = 0;
    for (var i = 0; i < this.keys.length; i++) {
      var k = this.keys[i];
      if (t < k.at) break;
      var p = k.d <= 0 || t >= k.at + k.d ? 1 : k.e((t - k.at) / k.d);
      if (k.x != null) x = lerp(x, +k.x, p);
      if (k.y != null) y = lerp(y, +k.y, p);
      if (k.z != null && +k.z > 0) lz = lerp(lz, Math.log(+k.z), p);
    }
    return { x: x, y: y, z: Math.exp(lz) };
  };
  Camera.prototype.at = function (t) {
    var c = this.raw(t);
    c.z *= (1 + this.push * clamp(t / D, 0, 1)) * (1 + this.breathe * Math.sin((TAU * t) / 9.5));
    c.x += this.breathe * 180 * Math.sin((TAU * t) / 12.5);
    return c;
  };
  Camera.prototype.moving = function (t) { return this.keys.some(function (k) { return k.d > 0.05 && t > k.at && t < k.at + k.d; }); };
  function layerTf(c, f) {
    var z = Math.pow(c.z, f), x = W / 2 + (c.x - W / 2) * f, y = H / 2 + (c.y - H / 2) * f;
    return { z: z, x: x, y: y };
  }
  function project(px, py, f, t) {
    var c = layerTf(st.cam.at(t), f);
    return [(px - c.x) * c.z + W / 2, (py - c.y) * c.z + H / 2, c.z];
  }

  // ------------------------- safe area -------------------------
  function safeArea(w, h) {
    w = w || W; h = h || H;
    var x0, x1, y0, y1;
    if (h / w > 1.15) { x0 = w * 0.058; x1 = w * 0.942; y0 = h * 0.1325; y1 = h * 0.7535; }
    else { x0 = w * 0.072; x1 = w * 0.928; y0 = h * 0.072; y1 = h * 0.928; }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, r: x1, b: y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }

  // ------------------------- particles -------------------------
  var PK = {
    dust: { dir: 20, speed: 14, size: 3, colors: ["#FFFFFF", "#C9C2EE"], count: 30 },
    stars: { dir: 0, speed: 4, size: 7, colors: ["#FFFFFF", "#FFF3D6", "#C9C2EE"], count: 26 },
    bubbles: { dir: -90, speed: 60, size: 12, colors: ["#FFFFFF"], count: 20 },
    sparks: { dir: -90, speed: 40, size: 11, colors: ["#FFD43B", "#FF7AC6", "#5CE1E6", "#FFFFFF"], count: 22 },
    snow: { dir: 90, speed: 50, size: 6, colors: ["#FFFFFF"], count: 40 },
    cells: { dir: 0, speed: 45, size: 26, colors: ["#E2475F", "#C8304C"], count: 16 },
    confetti: { dir: 90, speed: 140, size: 12, colors: ["#FF6B6B", "#FFD43B", "#3DDC97", "#4DABF7", "#FF7AC6", "#7B5CFF"], count: 40 },
  };
  function makeParticles(parent, o, w, h) {
    o = o || {};
    var kind = PK[o.kind] ? o.kind : "dust", K = PK[kind];
    var count = clamp(Math.round(num(o.count, K.count)), 0, 300);
    var colors = (arr(o.colors).length ? arr(o.colors) : K.colors).map(function (c) { return col(c, "#FFFFFF"); });
    var speed = num(o.speed, K.speed), size = num(o.size, K.size), dir = (num(o.dir, K.dir) * PI) / 180;
    var area = obj(o.area);
    var ax = num(area.x, -0.08 * w), ay = num(area.y, -0.08 * h), aw = Math.max(10, num(area.w, w * 1.16)), ah = Math.max(10, num(area.h, h * 1.16));
    var R = V.makeRand(num(o.seed, 0) + hash(kind + count + ax + ay) + 11);
    var g = el("g", { class: "fv-particles", opacity: o.opacity != null ? num(o.opacity, 1) : null }, parent);
    var ps = [];
    for (var i = 0; i < count; i++) {
      var sz = size * (0.55 + R() * 0.9), c = colors[i % colors.length], n;
      if (kind === "dust" || kind === "snow") n = el("circle", { r: f2(sz * 0.5), fill: c, opacity: f2(0.35 + R() * 0.55) }, g);
      else if (kind === "stars" || kind === "sparks") n = el("path", { d: sparkleD(sz), fill: c }, g);
      else if (kind === "bubbles") {
        n = el("g", null, g);
        el("circle", { r: f2(sz), fill: "rgba(255,255,255,0.10)", stroke: rgba(c, 0.55), "stroke-width": 2.2 }, n);
        el("circle", { cx: f2(-sz * 0.35), cy: f2(-sz * 0.35), r: f2(sz * 0.22), fill: rgba(c, 0.7) }, n);
      } else if (kind === "cells") {
        n = el("g", null, g);
        el("ellipse", { rx: f2(sz), ry: f2(sz * 0.8), fill: c }, n);
        el("ellipse", { rx: f2(sz * 0.55), ry: f2(sz * 0.42), fill: shade(c, 0.22), opacity: 0.6 }, n);
      } else n = el("rect", { x: f2(-sz * 0.5), y: f2(-sz * 0.3), width: f2(sz), height: f2(sz * 0.6), rx: 1.5, fill: c }, g);
      ps.push({ n: n, x0: ax + R() * aw, y0: ay + R() * ah, v: speed * (0.55 + R() * 0.9), ph: R() * TAU, ph2: R() * TAU, tw: 1.6 + R() * 2.6, rs: (R() - 0.5) * 300 });
    }
    var vx = Math.cos(dir), vy = Math.sin(dir);
    return function (t) {
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i], x = p.x0 + vx * p.v * t, y = p.y0 + vy * p.v * t, sc = 1, rot = 0;
        if (kind === "bubbles") x += 9 * Math.sin(t * 2.1 + p.ph);
        else if (kind === "snow" || kind === "confetti") x += 18 * Math.sin(t * 1.3 + p.ph);
        else if (kind === "dust") y += 8 * Math.sin(t * 0.7 + p.ph);
        x = ax + mod(x - ax, aw); y = ay + mod(y - ay, ah);
        if (kind === "stars" || kind === "sparks") { sc = 0.35 + 0.65 * Math.abs(Math.sin((t * TAU) / p.tw + p.ph)); rot = t * 20; }
        if (kind === "confetti") rot = p.rs * t * 0.5;
        if (kind === "cells") rot = p.rs * 0.08 * Math.sin(t * 0.5 + p.ph2) + 30 * Math.sin(p.ph);
        var tf = "translate(" + f2(x) + " " + f2(y) + ")" + (rot ? " rotate(" + f2(rot) + ")" : "") + (sc !== 1 ? " scale(" + sc.toFixed(3) + ")" : "");
        if (kind === "confetti") tf += " scale(" + Math.cos(t * 4 + p.ph).toFixed(3) + " 1)";
        p.n.setAttribute("transform", tf);
      }
    };
  }

  // ------------------------- worlds -------------------------
  var WORLDS = ["space", "sky", "dusk", "night", "micro", "body", "ocean", "studio", "none"];
  var WORLD_ALIAS = { meadow: "sky", day: "sky", nature: "sky", cosmos: "space", galaxy: "space", underwater: "ocean", sea: "ocean", city: "night", cells: "micro", cell: "micro", blood: "body", data: "studio", sunset: "dusk" };
  function worldName(w) { w = str(w).toLowerCase(); if (WORLDS.indexOf(w) >= 0) return w; return WORLD_ALIAS[w] || "studio"; }
  var WORLD_BG = { space: "#1B1250", sky: "#8FD3FA", dusk: "#5E2A86", night: "#140F3E", micro: "#0E5E73", body: "#7A1636", ocean: "#1E86CF", studio: "#1E1452", none: "#140E3A" };
  // Draws a world into layer groups L = { bg, far, mid, world } sized w x h. Returns animation fns and ground info.
  function buildWorld(name, L, w, h, R) {
    var P = h / w > 1.15, fns = [], out = { tone: "dark", horizon: h, groundY: null, fns: fns };
    var m = Math.min(w, h);
    function bgRect(fill) { return el("rect", { x: f2(-w * 0.4), y: f2(-h * 0.4), width: f2(w * 1.8), height: f2(h * 1.8), fill: fill }, L.bg); }
    function twinkleStars(parent, n, x0, x1, y0, y1, colors, big) {
      var list = [];
      for (var i = 0; i < n; i++) {
        var r = 0.8 + Math.pow(R(), 3) * 2.8, s;
        if (big && i < big) s = el("path", { d: sparkleD(5 + R() * 7), fill: colors[i % colors.length], transform: "translate(" + f2(lerp(x0, x1, R())) + " " + f2(lerp(y0, y1, R())) + ")" }, parent);
        else s = el("circle", { cx: f2(lerp(x0, x1, R())), cy: f2(lerp(y0, y1, R())), r: f2(r), fill: colors[i % colors.length] }, parent);
        list.push({ n: s, p: 1.6 + R() * 3.4, ph: R() * TAU, b: 0.3 + R() * 0.4 });
      }
      fns.push(function (t) {
        for (var i = 0; i < list.length; i++) { var q = list[i]; q.n.setAttribute("opacity", (q.b + (1 - q.b) * (0.5 + 0.5 * Math.sin((TAU * t) / q.p + q.ph))).toFixed(2)); }
      });
    }
    function hillPath(fy, x0, x1, bottom) {
      var pts = [], n = 28;
      for (var i = 0; i <= n; i++) { var x = lerp(x0, x1, i / n); pts.push([x, fy(x)]); }
      var d = smoothPath(pts, true);
      return d + "L" + P2(x1, bottom) + "L" + P2(x0, bottom) + "Z";
    }
    function sunRays(parent, cx, cy, r, color, n) {
      var g = el("g", { transform: "translate(" + f2(cx) + " " + f2(cy) + ")" }, parent);
      var rays = el("g", null, g);
      for (var i = 0; i < n; i++) {
        var a = (i * 360) / n, len = i % 2 ? r * 0.32 : r * 0.5;
        el("rect", { x: f2(-r * 0.07), y: f2(-r - len - r * 0.12), width: f2(r * 0.14), height: f2(len), rx: f2(r * 0.07), fill: color, transform: "rotate(" + f2(a) + ")" }, rays);
      }
      fns.push(function (t) { rays.setAttribute("transform", "rotate(" + f2(t * 9) + ")"); });
      return g;
    }
    function tree(parent, x, y, s, c) {
      var g = el("g", { transform: "translate(" + f2(x) + " " + f2(y) + ") scale(" + f2(s) + ")" }, parent);
      el("rect", { x: -5, y: -34, width: 10, height: 36, rx: 4, fill: "#8A5A3B" }, g);
      var cn = el("g", null, g);
      el("circle", { cx: 0, cy: -52, r: 28, fill: shade(c, 0.12) }, cn);
      el("circle", { cx: -3, cy: -55, r: 24, fill: c }, cn);
      el("circle", { cx: -10, cy: -63, r: 8, fill: "#fff", opacity: 0.2 }, cn);
      var ph = R() * TAU;
      fns.push(function (t) { cn.setAttribute("transform", "rotate(" + f2(2.5 * Math.sin(t * 1.3 + ph)) + " 0 -30)"); });
    }
    if (name === "space") {
      bgRect(vGrad(["#120C36", "#22165E", "#33206F"]));
      [[0.2, 0.32, 0.6, "#7B5CFF", 0.34], [0.82, 0.72, 0.55, "#FF7AC6", 0.2], [0.66, 0.16, 0.4, "#1FB5AD", 0.16], [0.35, 0.85, 0.45, "#4DABF7", 0.14]].forEach(function (q) {
        el("ellipse", { cx: f2(q[0] * w), cy: f2(q[1] * h), rx: f2(q[2] * Math.max(w, h) * 0.6), ry: f2(q[2] * Math.max(w, h) * 0.36), fill: fvGlow(q[3], q[4]) }, L.bg);
      });
      twinkleStars(L.far, Math.round(130 * (w * h) / (1920 * 1080)), -0.15 * w, 1.15 * w, -0.15 * h, 1.15 * h, ["#FFFFFF", "#FFFFFF", "#FFF3D6", "#C9C2EE", "#5CE1E6"], 9);
      var p1 = ball(L.far, m * 0.026, "coral", P ? { x: w * 0.1, y: h * 0.88 } : { x: w * 0.03, y: h * 0.95 }); p1.setAttribute("opacity", 0.6);
      var p2 = ball(L.far, m * 0.018, "teal", P ? { x: w * 0.92, y: h * 0.07 } : { x: w * 0.97, y: h * 0.04 }); p2.setAttribute("opacity", 0.55);
      fns.push(makeParticles(L.mid, { kind: "dust", count: 26, colors: ["#C9C2EE", "#FFFFFF"], opacity: 0.6 }, w, h));
    } else if (name === "sky") {
      out.tone = "light";
      bgRect(vGrad(["#4AAEF3", "#86CDF9", "#CDEEFF"]));
      var hz = P ? h * 0.732 : h * 0.8;
      out.horizon = hz;
      var sx = P ? w * 0.8 : w * 0.84, sy = P ? h * 0.085 : h * 0.16;
      el("circle", { cx: f2(sx), cy: f2(sy), r: f2(m * 0.2), fill: fvGlow("#FFE27A", 0.65) }, L.far);
      sunRays(L.far, sx, sy, m * 0.06, "#FFE27A", 14);
      el("circle", { cx: f2(sx), cy: f2(sy), r: f2(m * 0.06), fill: "#FFD43B" }, L.far);
      el("circle", { cx: f2(sx - m * 0.008), cy: f2(sy - m * 0.008), r: f2(m * 0.045), fill: "#FFE680" }, L.far);
      var clouds = [];
      for (var i = 0; i < 5; i++) {
        var cw = m * (0.16 + R() * 0.14), cy = P ? h * (0.04 + R() * 0.2) : h * (0.06 + R() * 0.3);
        var cg = el("g", null, L.far);
        el("path", { d: cloudD(cw), fill: "#D7ECFF", transform: "translate(0 " + f2(cw * 0.05) + ")" }, cg);
        el("path", { d: cloudD(cw), fill: "#FFFFFF" }, cg);
        clouds.push({ g: cg, x0: R() * w * 1.4 - w * 0.2, y: cy, v: 6 + R() * 12 });
      }
      fns.push(function (t) { clouds.forEach(function (c) { c.g.setAttribute("transform", "translate(" + f2(-0.25 * w + mod(c.x0 + c.v * t + 0.25 * w, w * 1.5)) + " " + f2(c.y) + ")"); }); });
      var fy2 = function (x) { return hz - h * 0.11 + 26 * Math.sin((x / w) * TAU * 0.7 + 1.9) + 14 * Math.sin((x / w) * TAU * 1.7); };
      var fy1 = function (x) { return hz - h * 0.05 + 20 * Math.sin((x / w) * TAU * 0.9 + 0.3) + 10 * Math.sin((x / w) * TAU * 2.3 + 1); };
      el("path", { d: hillPath(fy2, -0.25 * w, 1.25 * w, h * 1.4), fill: "#A6E39E" }, L.mid);
      for (i = 0; i < 9; i++) { var tx = lerp(-0.05 * w, 1.05 * w, (i + R() * 0.6) / 9); tree(L.mid, tx, fy2(tx) + 6, 0.7 + R() * 0.6, R() < 0.5 ? "#4CC46A" : "#3FB37A"); }
      el("path", { d: hillPath(fy1, -0.25 * w, 1.25 * w, h * 1.4), fill: "#82D27F" }, L.mid);
      var gy = function (x) { return hz + 16 * Math.sin((x / w) * TAU * 0.8 + 0.7) + 9 * Math.sin((x / w) * TAU * 1.9 + 2.1); };
      out.groundY = gy;
      el("path", { d: hillPath(gy, -0.25 * w, 1.25 * w, h * 1.4), fill: "#5BBE6C" }, L.world);
      var rim = [];
      for (i = 0; i <= 28; i++) { var rx2 = lerp(-0.25 * w, 1.25 * w, i / 28); rim.push([rx2, gy(rx2) + 5]); }
      el("path", { d: smoothPath(rim, true), fill: "none", stroke: "#79D57E", "stroke-width": 10, "stroke-linecap": "round" }, L.world);
      for (i = 0; i < 26; i++) { var fx = R() * w; el("circle", { cx: f2(fx), cy: f2(gy(fx) + 24 + R() * (h - hz) * 0.7), r: f2(3 + R() * 3), fill: ["#FFFFFF", "#FFD43B", "#FF7AC6"][i % 3], opacity: 0.85 }, L.world); }
    } else if (name === "dusk") {
      bgRect(vGrad(["#24145C", "#4E2683", "#9A3F86", "#F07A6E", "#FFC27E"]));
      var hz2 = P ? h * 0.732 : h * 0.8;
      out.horizon = hz2;
      twinkleStars(L.far, 40, -0.1 * w, 1.1 * w, -0.1 * h, h * 0.42, ["#FFFFFF", "#FFF3D6"], 3);
      var sr = m * 0.12, scx = P ? w * 0.66 : w * 0.66, scy = hz2 - m * 0.07;
      el("circle", { cx: f2(scx), cy: f2(scy), r: f2(sr * 2.8), fill: fvGlow("#FFB26B", 0.55) }, L.far);
      el("circle", { cx: f2(scx), cy: f2(scy), r: f2(sr), fill: vGrad(["#FFE7A0", "#FFB36B", "#FF8A6B"]) }, L.far);
      var mfar = function (x) { return hz2 - h * 0.16 + 60 * Math.abs(Math.sin((x / w) * PI * 2.2 + 0.4)) * -1 + 40 * Math.sin((x / w) * TAU * 1.3); };
      var mpts = [], mpts2 = [];
      var nm1 = Math.max(8, Math.round((w / m) * 9)), nm2 = Math.max(6, Math.round((w / m) * 6));
      for (i = 0; i <= nm1; i++) { var mx = lerp(-0.25 * w, 1.25 * w, i / nm1); mpts.push([mx, hz2 - m * 0.06 - (i % 2 ? m * 0.13 + R() * m * 0.07 : R() * m * 0.04)]); }
      for (i = 0; i <= nm2; i++) { var mx2 = lerp(-0.25 * w, 1.25 * w, i / nm2); mpts2.push([mx2, hz2 - (i % 2 ? m * 0.08 + R() * m * 0.05 : R() * m * 0.025)]); }
      el("path", { d: polyD(mpts.concat([[1.25 * w, h * 1.4], [-0.25 * w, h * 1.4]])), fill: "#7A3C8C", "stroke-linejoin": "round" }, L.mid);
      el("path", { d: polyD(mpts2.concat([[1.25 * w, h * 1.4], [-0.25 * w, h * 1.4]])), fill: "#5A2C7E" }, L.mid);
      void mfar;
      var gy2 = function (x) { return hz2 + 12 * Math.sin((x / w) * TAU * 0.8 + 0.4) + 7 * Math.sin((x / w) * TAU * 2.1); };
      out.groundY = gy2;
      el("path", { d: hillPath(gy2, -0.25 * w, 1.25 * w, h * 1.4), fill: "#3B1F66" }, L.world);
      var rim2 = [];
      for (i = 0; i <= 28; i++) { var rx3 = lerp(-0.25 * w, 1.25 * w, i / 28); rim2.push([rx3, gy2(rx3) + 4]); }
      el("path", { d: smoothPath(rim2, true), fill: "none", stroke: "#5B3290", "stroke-width": 8 }, L.world);
    } else if (name === "night") {
      bgRect(vGrad(["#0A0726", "#1A1652", "#30276E"]));
      var mx3 = P ? w * 0.76 : w * 0.8, my3 = P ? h * 0.1 : h * 0.2;
      el("circle", { cx: f2(mx3), cy: f2(my3), r: f2(m * 0.17), fill: fvGlow("#BFD4FF", 0.5) }, L.far);
      el("circle", { cx: f2(mx3), cy: f2(my3), r: f2(m * 0.055), fill: "#F2EEFF" }, L.far);
      [[-0.2, -0.1, 0.012], [0.25, 0.2, 0.009], [0.1, 0.35, 0.007]].forEach(function (q) { el("circle", { cx: f2(mx3 + q[0] * m * 0.1), cy: f2(my3 + q[1] * m * 0.1), r: f2(q[2] * m), fill: "#D8D0F5" }, L.far); });
      twinkleStars(L.far, 80, -0.1 * w, 1.1 * w, -0.1 * h, h * 0.7, ["#FFFFFF", "#FFF3D6", "#C9C2EE"], 6);
      var base1 = P ? h * 0.86 : h * 0.9, wins = [];
      function skyline(parent, base, hmin, hmax, fill, wc, wa) {
        var x = -0.15 * w;
        while (x < 1.15 * w) {
          var bw = m * (0.05 + R() * 0.07), bh = h * (hmin + R() * (hmax - hmin));
          el("rect", { x: f2(x), y: f2(base - bh), width: f2(bw + 1), height: f2(bh + h), fill: fill }, parent);
          if (R() < 0.35) el("rect", { x: f2(x + bw * 0.45), y: f2(base - bh - m * 0.03), width: f2(m * 0.006), height: f2(m * 0.03), fill: fill }, parent);
          for (var wy = base - bh + m * 0.02; wy < base - m * 0.02; wy += m * 0.028)
            for (var wx = x + m * 0.012; wx < x + bw - m * 0.016; wx += m * 0.022)
              if (R() < 0.42) wins.push({ n: el("rect", { x: f2(wx), y: f2(wy), width: f2(m * 0.01), height: f2(m * 0.013), rx: 1, fill: wc }, parent), ph: R() * TAU, p: 4 + R() * 9, a: wa });
          x += bw + m * (0.004 + R() * 0.01);
        }
      }
      skyline(L.mid, base1, 0.1, 0.3, "#2A2468", "#FFD43B", 0.75);
      skyline(L.world, h * 1.02, 0.05, 0.14, "#191446", "#FFB547", 0.9);
      fns.push(function (t) { for (var i = 0; i < wins.length; i++) { var q = wins[i]; q.n.setAttribute("opacity", (Math.sin((TAU * t) / q.p + q.ph) > -0.55 ? q.a : 0.12).toFixed(2)); } });
      out.horizon = base1;
    } else if (name === "micro") {
      bgRect(rGrad(["#1C9AA5", "#0E5E73", "#08344C"], 0.5, 0.45));
      var blobs = [];
      for (i = 0; i < 8; i++) {
        var bg = el("g", null, L.far), br = m * (0.06 + R() * 0.16);
        el("circle", { r: f2(br), fill: fvGlow(["#5CE1E6", "#3DDC97", "#9BF0FF"][i % 3], 0.24) }, bg);
        el("circle", { r: f2(br * 0.62), fill: "none", stroke: "rgba(255,255,255,0.08)", "stroke-width": 3 }, bg);
        blobs.push({ g: bg, x: R() * w, y: R() * h, ph: R() * TAU, a: 20 + R() * 30 });
      }
      fns.push(function (t) { blobs.forEach(function (b) { b.g.setAttribute("transform", "translate(" + f2(b.x + b.a * Math.sin(t * 0.21 + b.ph)) + " " + f2(b.y + b.a * 0.7 * Math.cos(t * 0.17 + b.ph)) + ")"); }); });
      fns.push(makeParticles(L.far, { kind: "dust", count: 34, colors: ["#BFF5EC", "#FFFFFF"], opacity: 0.45, speed: 8 }, w, h));
      fns.push(makeParticles(L.mid, { kind: "bubbles", count: 18, speed: 38 }, w, h));
    } else if (name === "body") {
      bgRect(rGrad(["#B8344F", "#7A1636", "#3E0A26"], 0.5, 0.45));
      var cells = [];
      for (i = 0; i < 10; i++) {
        var cg2 = el("g", { opacity: 0.38 }, L.far), crx = m * (0.06 + R() * 0.06);
        el("ellipse", { rx: f2(crx), ry: f2(crx * 0.82), fill: "#D8435C" }, cg2);
        el("ellipse", { rx: f2(crx * 0.55), ry: f2(crx * 0.42), fill: "#A82444" }, cg2);
        cells.push({ g: cg2, x: R() * w * 1.4, y: R() * h, v: 12 + R() * 20, ph: R() * TAU });
      }
      fns.push(function (t) { cells.forEach(function (c) { c.g.setAttribute("transform", "translate(" + f2(-0.2 * w + mod(c.x + c.v * t, w * 1.4)) + " " + f2(c.y + 18 * Math.sin(t * 0.6 + c.ph)) + ") rotate(" + f2(25 * Math.sin(t * 0.3 + c.ph)) + ")"); }); });
      fns.push(makeParticles(L.mid, { kind: "cells", count: 14, speed: 40, opacity: 0.85 }, w, h));
    } else if (name === "ocean") {
      bgRect(vGrad(["#4CC6F0", "#1E86CF", "#0D4C8C", "#0A3068"]));
      var rays = [];
      for (i = 0; i < 6; i++) {
        var rx4 = lerp(-0.05 * w, 1.05 * w, (i + 0.5) / 6);
        var rg = el("path", { d: polyD([[rx4 - 30, -h * 0.1], [rx4 + 30, -h * 0.1], [rx4 + 160, h * 1.05], [rx4 - 80, h * 1.05]]), fill: "#FFFFFF", opacity: f2(0.05 + R() * 0.06) }, L.far);
        rays.push({ n: rg, x: rx4, ph: R() * TAU });
      }
      fns.push(function (t) { rays.forEach(function (r) { r.n.setAttribute("transform", "rotate(" + f2(4 * Math.sin(t * 0.4 + r.ph)) + " " + f2(r.x) + " " + f2(-h * 0.1) + ")"); }); });
      fns.push(makeParticles(L.mid, { kind: "bubbles", count: 18, speed: 50 }, w, h));
      var floor = P ? h * 0.86 : h * 0.9;
      out.horizon = floor;
      var fyo = function (x) { return floor + 16 * Math.sin((x / w) * TAU * 0.9 + 0.5) + 8 * Math.sin((x / w) * TAU * 2.3); };
      var weeds = [];
      for (i = 0; i < 7; i++) {
        var wx2 = lerp(0.02 * w, 0.98 * w, (i + R() * 0.7) / 7), wh = m * (0.12 + R() * 0.12);
        weeds.push({ n: el("path", { fill: "none", stroke: i % 2 ? "#2ECC71" : "#1FB5AD", "stroke-width": f2(m * 0.012), "stroke-linecap": "round" }, L.world), x: wx2, y: fyo(wx2) + 8, h: wh, ph: R() * TAU });
      }
      el("path", { d: hillPath(fyo, -0.25 * w, 1.25 * w, h * 1.4), fill: "#F2D49B" }, L.world);
      for (i = 0; i < 10; i++) { var px = R() * w; el("ellipse", { cx: f2(px), cy: f2(fyo(px) + 14 + R() * 30), rx: f2(6 + R() * 10), ry: f2(4 + R() * 5), fill: "#E3BC7A" }, L.world); }
      fns.push(function (t) {
        weeds.forEach(function (q) {
          var pts = [];
          for (var k = 0; k <= 5; k++) pts.push([q.x + Math.sin(t * 1.4 + q.ph + k * 0.7) * k * 4.5, q.y - (q.h * k) / 5]);
          q.n.setAttribute("d", smoothPath(pts, true));
        });
      });
    } else if (name === "studio") {
      bgRect(rGrad(["#34228A", "#21175E", "#140E3A"], 0.5, 0.42));
      var rg2 = el("g", { transform: "translate(" + f2(w / 2) + " " + f2(h * 0.48) + ")" }, L.far), rings = [];
      [0.3, 0.44, 0.6, 0.78].forEach(function (k, i) {
        rings.push(el("circle", { r: f2(k * Math.max(w, h) * 0.6), fill: "none", stroke: "#C9C2EE", "stroke-width": 3, opacity: f2(0.16 - i * 0.025), "stroke-dasharray": i % 2 ? "3 22" : "60 30 8 30", "stroke-linecap": "round" }, rg2));
      });
      fns.push(function (t) { rings.forEach(function (r, i) { r.setAttribute("transform", "rotate(" + f2((i % 2 ? -1 : 1) * t * (4 + i * 2)) + ")"); }); });
      twinkleStars(L.far, 14, 0, w, 0, h, ["#FFFFFF", "#C9C2EE", "#FFD43B"], 8);
      el("ellipse", { cx: f2(w / 2), cy: f2(h * 0.9), rx: f2(w * 0.7), ry: f2(h * 0.16), fill: fvGlow("#7B5CFF", 0.34) }, L.mid);
    }
    return out;
  }

  // ------------------------- scene -------------------------
  function scene(root, o) {
    o = o || {};
    root = root || V.root();
    while (root.firstChild) root.removeChild(root.firstChild);
    var wname = worldName(o.world);
    st = { actors: [], fns: [], post: [], grads: {}, uid: 0, cam: new Camera(), world: wname, errors: [] };
    var wrap = hel("div", "fv fv-w-" + wname, root);
    wrap.style.background = WORLD_BG[wname];
    var svgN = el("svg", { class: "fv-svg", width: V.width, height: V.height, viewBox: "0 0 " + f2(W) + " " + f2(H), preserveAspectRatio: "none" }, wrap);
    st.defs = el("defs", null, svgN);
    var Lr = {};
    ["bg", "far", "mid", "world", "front", "fx"].forEach(function (k) { Lr[k] = el("g", { class: "fv-" + k }, svgN); });
    st.layers = [[Lr.far, 0.25], [Lr.mid, 0.6], [Lr.world, 1], [Lr.front, 1.15], [Lr.fx, 1]];
    var ui = hel("div", "fv-ui", wrap);
    var wb = buildWorld(wname, Lr, W, H, V.makeRand(num(o.seed, V.seed || 1) * 31 + hash(wname)));
    wb.fns.forEach(function (f) { st.fns.push(f); });
    st.worldBase = Lr.world.childNodes.length;
    if (wb.tone === "light") wrap.classList.add("fv-light");
    var sa = safeArea();
    var ctx = {
      W: W, H: H, cx: W / 2, cy: H / 2, safe: sa, portrait: V.isPortrait, square: V.isSquare, landscape: V.isLandscape,
      tone: wb.tone, horizon: wb.horizon, groundY: wb.groundY, world: Lr.world, bg: Lr.bg, far: Lr.far, mid: Lr.mid,
      front: Lr.front, fx: Lr.fx, ui: ui, defs: st.defs, svg: svgN, cam: st.cam, worldName: wname, root: wrap,
    };
    ctx.layers = Lr;
    st.ctx = ctx;
    st.layerOf = new Map([[Lr.far, 0.25], [Lr.mid, 0.6], [Lr.world, 1], [Lr.front, 1.15], [Lr.fx, 1], [Lr.bg, 0]]);
    var mine = st;
    V.onFrame(function (t) { if (st === mine) frame(t); });
    return ctx;
  }
  function frame(t) {
    var c = st.cam.at(t);
    for (var i = 0; i < st.layers.length; i++) {
      var L = st.layers[i], tf = layerTf(c, L[1]);
      L[0].setAttribute("transform", "translate(" + f2(W / 2) + " " + f2(H / 2) + ") scale(" + tf.z.toFixed(5) + ") translate(" + f2(-tf.x) + " " + f2(-tf.y) + ")");
    }
    for (i = 0; i < st.fns.length; i++) st.fns[i](t);
    for (i = 0; i < st.actors.length; i++) {
      var a = st.actors[i];
      a.compute(t);
      a.apply();
      if (a.anim && a.visible) a.anim(t, a);
    }
    for (i = 0; i < st.post.length; i++) st.post[i](t);
  }
  function onT(fn) { need(); if (typeof fn === "function") st.fns.push(fn); }

  // ------------------------- illustrations (drawn centred on 0,0, radius about 100) -------------------------
  var ILL = {};
  function defIllus(name, fn) { ILL[String(name).toLowerCase()] = fn; }
  function tr(x, y, extra) { return "translate(" + f2(x) + " " + f2(y) + ")" + (extra ? " " + extra : ""); }
  function band(parent, y, hgt, fill, period, amp, x0, x1) {
    var d = "M" + P2(x0, y), x;
    for (x = x0; x <= x1; x += period / 8) d += "L" + P2(x, y + amp * Math.sin((x / period) * TAU));
    d += "L" + P2(x1, y + hgt);
    for (x = x1; x >= x0; x -= period / 8) d += "L" + P2(x, y + hgt + amp * Math.sin((x / period) * TAU + 1.3));
    return el("path", { d: d + "Z", fill: fill }, parent);
  }
  function blobD(cx, cy, r, R, k, jit) {
    var pts = [];
    for (var i = 0; i < k; i++) { var a = (i / k) * TAU, rr = r * (1 + (R() - 0.5) * (jit || 0.4)); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
    return smoothPath(pts);
  }
  function gearD(r, teeth, depth, hole) {
    var pts = [];
    for (var i = 0; i < teeth; i++) {
      var a = (i / teeth) * TAU, s = TAU / teeth;
      [[0, r - depth], [0.18, r - depth], [0.3, r], [0.7, r], [0.82, r - depth]].forEach(function (q) { pts.push([Math.cos(a + q[0] * s) * q[1], Math.sin(a + q[0] * s) * q[1]]); });
    }
    var d = polyD(pts);
    if (hole) d += "M" + P2(hole, 0) + "A" + hole + " " + hole + " 0 1 0 " + -hole + " 0A" + hole + " " + hole + " 0 1 0 " + hole + " 0Z";
    return d;
  }
  function puffs(parent, x, y, n, color, rise, size) {
    var ps = [];
    for (var i = 0; i < n; i++) ps.push(el("circle", { r: 1, fill: color }, parent));
    return function (t) {
      ps.forEach(function (p, i) {
        var q = mod(t * 0.42 + i / n, 1);
        p.setAttribute("cx", f2(x + q * 22 + 5 * Math.sin(t * 2 + i)));
        p.setAttribute("cy", f2(y - q * rise));
        p.setAttribute("r", f2(size * (0.5 + q * 1.1)));
        p.setAttribute("opacity", f2(Math.min(1, q * 5) * (1 - q) * 0.85));
      });
    };
  }
  function ringedPlanet(g, c, c2, rr) {
    var ringA = el("path", { d: "M-112 0A112 27 0 0 1 112 0", fill: "none", stroke: shade(c2, 0.12), "stroke-width": 13, "stroke-linecap": "round", transform: "rotate(-16)" }, g);
    void ringA;
    ball(g, rr, c);
    var cl = el("g", { "clip-path": clipCircle(rr * 0.93, -rr * 0.06, -rr * 0.07) }, g);
    var bands = el("g", null, cl);
    band(bands, -rr * 0.5, rr * 0.16, tint(c, 0.28), rr, 4, -rr * 3, rr * 3);
    band(bands, -rr * 0.02, rr * 0.12, shade(c, 0.12), rr, 5, -rr * 3, rr * 3);
    band(bands, rr * 0.4, rr * 0.18, tint(c, 0.16), rr, 4, -rr * 3, rr * 3);
    el("circle", { r: rr, fill: sphereShade() }, g);
    el("path", { d: "M-112 0A112 27 0 0 0 112 0", fill: "none", stroke: c2, "stroke-width": 13, "stroke-linecap": "round", transform: "rotate(-16)" }, g);
    el("path", { d: "M-96 4A96 21 0 0 0 96 4", fill: "none", stroke: tint(c2, 0.35), "stroke-width": 4, transform: "rotate(-16)", opacity: 0.8 }, g);
    return function (t) { bands.setAttribute("transform", tr(-mod(t * 9, rr), 0)); };
  }
  defIllus("planet", function (g, o) {
    var c = col(o.color, "violet"), c2 = col(o.color2, "pink");
    if (o.ring) return { r: 114, anim: ringedPlanet(g, c, c2, 66) };
    var rr = 92;
    ball(g, rr, c);
    var cl = el("g", { "clip-path": clipCircle(rr * 0.93, -rr * 0.06, -rr * 0.07) }, g), bands = el("g", null, cl);
    band(bands, -rr * 0.55, rr * 0.18, tint(c, 0.25), rr, 5, -rr * 3, rr * 3);
    band(bands, -rr * 0.05, rr * 0.14, c2, rr, 6, -rr * 3, rr * 3).setAttribute("opacity", 0.55);
    band(bands, rr * 0.42, rr * 0.2, shade(c, 0.1), rr, 5, -rr * 3, rr * 3);
    el("circle", { r: rr, fill: sphereShade() }, g);
    return { r: 92, anim: function (t) { bands.setAttribute("transform", tr(-mod(t * 9, rr), 0)); } };
  });
  defIllus("saturn", function (g, o) { return { r: 114, anim: ringedPlanet(g, col(o.color, "#F2B96B"), col(o.color2, "#F7DDA8"), 66) }; });
  defIllus("gasgiant", function (g, o) {
    var c = col(o.color, "#F4A259"), rr = 95;
    ball(g, rr, c, { hi: false });
    var cl = el("g", { "clip-path": clipCircle(rr, 0, 0) }, g), st2 = el("g", null, cl);
    ["#F7C58C", "#D9773B", "#F2B27A", "#C9603A", "#F7D2A0", "#E08A4A", "#F2B27A"].forEach(function (cc, i) { band(st2, -rr + i * 28, 30, i === 0 ? cc : mix(cc, c, 0.25), 90, 5, -rr * 3, rr * 3); });
    var spot = el("ellipse", { cx: 0, cy: 34, rx: 22, ry: 12, fill: "#C8452F", stroke: "#F7C58C", "stroke-width": 4 }, cl);
    el("circle", { r: rr, fill: sphereShade() }, g);
    el("ellipse", { cx: -34, cy: -42, rx: 26, ry: 14, fill: "#fff", opacity: 0.22, transform: "rotate(-35 -34 -42)" }, g);
    return { r: 95, anim: function (t) { st2.setAttribute("transform", tr(-mod(t * 10, 90), 0)); spot.setAttribute("cx", f2(-140 + mod(t * 16, 280))); } };
  });
  defIllus("mars", function (g, o) {
    var c = col(o.color, "#E5603C"), rr = 90;
    ball(g, rr, c);
    var cl = el("g", { "clip-path": clipCircle(rr * 0.93, -rr * 0.06, -rr * 0.07) }, g), cr = el("g", null, cl);
    [0, 180].forEach(function (ox) {
      [[-40, -10, 16], [20, 26, 12], [-10, 50, 9], [44, -30, 10], [-60, 40, 7], [70, 40, 13]].forEach(function (q) {
        el("circle", { cx: q[0] + ox, cy: q[1], r: q[2], fill: shade(c, 0.22) }, cr);
        el("circle", { cx: q[0] + ox - q[2] * 0.15, cy: q[1] - q[2] * 0.15, r: q[2] * 0.7, fill: tint(c, 0.12) }, cr);
      });
    });
    el("ellipse", { cx: -6, cy: -82, rx: 38, ry: 14, fill: "#FFF3EA", opacity: 0.9 }, cl);
    el("circle", { r: rr, fill: sphereShade() }, g);
    return { r: 90, anim: function (t) { cr.setAttribute("transform", tr(-mod(t * 9, 180), 0)); } };
  });
  defIllus("earth", function (g, o, R) {
    var c = col(o.color, "#3B8DE8"), rr = 94;
    el("circle", { r: 104, fill: "none", stroke: "#9EE6FF", "stroke-width": 7, opacity: 0.35 }, g);
    ball(g, rr, c, { hi: false });
    var cl = el("g", { "clip-path": clipCircle(rr, 0, 0) }, g), land = el("g", null, cl), cloud = el("g", null, cl);
    var lands = [[-60, -40, 34], [10, 10, 42], [-30, 64, 22], [60, -58, 20], [70, 50, 26]];
    [-188, 0, 188].forEach(function (ox) {
      lands.forEach(function (q, i) { el("path", { d: blobD(q[0] + ox, q[1], q[2], R, 9, 0.5), fill: i % 2 ? "#4CC46A" : "#62D27A" }, land); });
      [[-40, -70, 36], [30, 40, 44], [60, -10, 26]].forEach(function (q) { el("rect", { x: q[0] + ox, y: q[1], width: q[2], height: 9, rx: 4.5, fill: "#FFFFFF", opacity: 0.75 }, cloud); });
    });
    el("circle", { r: rr, fill: sphereShade() }, g);
    el("ellipse", { cx: -36, cy: -44, rx: 24, ry: 13, fill: "#fff", opacity: 0.25, transform: "rotate(-35 -36 -44)" }, g);
    return { r: 100, anim: function (t) { land.setAttribute("transform", tr(mod(t * 10, 188) - 94, 0)); cloud.setAttribute("transform", tr(mod(t * 17, 188) - 94, 0)); } };
  });
  defIllus("moon", function (g, o) {
    var c = col(o.color, "#CFC8F0");
    ball(g, 90, c);
    [[-30, -20, 18], [28, 12, 14], [-6, 44, 10], [40, -42, 9], [-52, 30, 8]].forEach(function (q) {
      el("circle", { cx: q[0], cy: q[1], r: q[2], fill: shade(c, 0.18) }, g);
      el("circle", { cx: q[0] + q[2] * 0.18, cy: q[1] + q[2] * 0.18, r: q[2] * 0.72, fill: tint(c, 0.08) }, g);
    });
    el("circle", { r: 90, fill: sphereShade() }, g);
    return { r: 92 };
  });
  defIllus("sun", function (g, o) {
    var c = col(o.color, "sun");
    el("circle", { r: 150, fill: fvGlow(c, 0.5) }, g);
    var rays = el("g", null, g);
    for (var i = 0; i < 16; i++) el("rect", { x: -7, y: i % 2 ? -98 : -104, width: 14, height: i % 2 ? 18 : 26, rx: 7, fill: i % 2 ? "#FFE27A" : "#FFB547", transform: "rotate(" + i * 22.5 + ")" }, rays);
    el("circle", { r: 72, fill: "#FFB547" }, g);
    el("circle", { cx: -4, cy: -4, r: 66, fill: c }, g);
    el("circle", { cx: -14, cy: -16, r: 40, fill: "#FFE680", opacity: 0.7 }, g);
    if (o.face) cuteFace(g, 0, 8, 2.1);
    return { r: 100, glow: true, anim: function (t) { rays.setAttribute("transform", "rotate(" + f2(t * 12) + ")"); } };
  });
  defIllus("star", function (g, o) {
    var c = col(o.color, "sun");
    el("circle", { r: 120, fill: fvGlow(c, 0.35) }, g);
    var inner = el("g", null, g);
    el("path", { d: starD(90, 42, 5), fill: shade(c, 0.2), stroke: shade(c, 0.2), "stroke-width": 12, "stroke-linejoin": "round", transform: tr(4, 7) }, inner);
    el("path", { d: starD(90, 42, 5), fill: c, stroke: c, "stroke-width": 12, "stroke-linejoin": "round" }, inner);
    el("path", { d: starD(40, 18, 5), fill: "#FFFFFF", opacity: 0.35, transform: tr(-8, -10) }, inner);
    if (o.face) cuteFace(inner, 0, 10, 1.6);
    var sp = [[-82, -64, 12], [86, 40, 9], [60, -86, 7]].map(function (q) { return el("path", { d: sparkleD(q[2]), fill: "#FFFFFF", transform: tr(q[0], q[1]) }, g); });
    return { r: 100, glow: true, anim: function (t) {
      inner.setAttribute("transform", "rotate(" + f2(5 * Math.sin(t * 1.1)) + ") scale(" + f2(1 + 0.04 * Math.sin(t * 3)) + ")");
      sp.forEach(function (s, i) { s.setAttribute("opacity", f2(0.3 + 0.7 * Math.abs(Math.sin(t * 2 + i * 1.7)))); });
    } };
  });
  defIllus("galaxy", function (g, o) {
    var c = col(o.color, "pink"), c2 = col(o.color2, "violet");
    el("circle", { r: 120, fill: fvGlow("#C9A8FF", 0.45) }, g);
    var tilt = el("g", { transform: "rotate(-18) scale(1 0.62)" }, g), rot = el("g", null, tilt);
    for (var k = 0; k < 3; k++) for (var i = 0; i < 26; i++) {
      var a = (k * TAU) / 3 + i * 0.25, rr = 12 + i * 3.4;
      el("circle", { cx: f2(Math.cos(a) * rr), cy: f2(Math.sin(a) * rr), r: f2(Math.max(2, 10 - i * 0.3)), fill: i < 8 ? mix("#FFF3D6", c, i / 8) : mix(c, c2, (i - 8) / 18), opacity: f2(1 - i * 0.022) }, rot);
    }
    el("circle", { r: 34, fill: fvGlow("#FFF3D6", 0.95) }, tilt);
    el("circle", { r: 13, fill: "#FFF3D6" }, tilt);
    return { r: 100, glow: true, anim: function (t) { rot.setAttribute("transform", "rotate(" + f2(t * 14) + ")"); } };
  });
  defIllus("blackhole", function (g) {
    el("circle", { r: 128, fill: fvGlow("#FF9F43", 0.32) }, g);
    var dashes = [];
    function disc(sweep) {
      dashes.push(el("path", { d: "M-100 0A100 26 0 0 " + sweep + " 100 0", fill: "none", stroke: "#FF9F43", "stroke-width": 16, "stroke-dasharray": "34 12", "stroke-linecap": "round", transform: "rotate(-12)" }, g));
      dashes.push(el("path", { d: "M-78 0A78 19 0 0 " + sweep + " 78 0", fill: "none", stroke: "#FFD43B", "stroke-width": 8, "stroke-dasharray": "20 10", "stroke-linecap": "round", transform: "rotate(-12)" }, g));
    }
    disc(1);
    el("circle", { r: 52, fill: "none", stroke: "#FFB347", "stroke-width": 6 }, g);
    el("circle", { r: 47, fill: "#0B0620" }, g);
    el("circle", { r: 47, fill: "none", stroke: "#FFF3D6", "stroke-width": 2, opacity: 0.7 }, g);
    disc(0);
    return { r: 104, glow: true, anim: function (t) { dashes.forEach(function (d, i) { d.setAttribute("stroke-dashoffset", f2((i % 2 ? 1 : -1) * t * 46)); }); } };
  });
  defIllus("rocket", function (g, o) {
    var c = col(o.color, "coral"), rk = el("g", null, g);
    var fl = el("g", { transform: tr(0, 64) }, rk);
    el("path", { d: "M-21 0Q-24 32 0 66Q24 32 21 0Z", fill: "#FF9F43" }, fl);
    el("path", { d: "M-11 0Q-12 20 0 42Q12 20 11 0Z", fill: "#FFD43B" }, fl);
    el("path", { d: "M-34 16L-66 56L-64 78L-34 56Z", fill: c }, rk);
    el("path", { d: "M34 16L66 56L64 78L34 56Z", fill: shade(c, 0.12) }, rk);
    el("path", { d: "M0 -96C26 -74 36 -36 36 14L36 60L-36 60L-36 14C-36 -36 -26 -74 0 -96Z", fill: "#F5F2FF" }, rk);
    el("path", { d: "M0 -96C26 -74 36 -36 36 14L36 60L12 60L12 14C12 -40 8 -76 0 -96Z", fill: "#DCD5F7" }, rk);
    el("path", { d: "M0 -96C17 -82 26 -64 31 -46L-31 -46C-26 -64 -17 -82 0 -96Z", fill: c }, rk);
    el("rect", { x: -36, y: 26, width: 72, height: 9, fill: c, opacity: 0.9 }, rk);
    el("circle", { cy: -10, r: 18, fill: "#4DABF7", stroke: "#7B5CFF", "stroke-width": 7 }, rk);
    el("ellipse", { cx: -6, cy: -16, rx: 6, ry: 4, fill: "#fff", opacity: 0.7 }, rk);
    el("rect", { x: -24, y: 58, width: 48, height: 12, rx: 4, fill: "#7B6FB0" }, rk);
    return { r: 100, anim: function (t) {
      rk.setAttribute("transform", tr(1.3 * Math.sin(t * 31), 0));
      fl.setAttribute("transform", tr(0, 64) + " scale(1 " + f2(0.85 + 0.16 * Math.sin(t * 23) + 0.1 * Math.sin(t * 37)) + ")");
    } };
  });
  defIllus("satellite", function (g, o) {
    var c = col(o.color, "gold"), rot = el("g", null, g);
    el("line", { x1: -74, y1: 0, x2: 74, y2: 0, stroke: "#C9C2EE", "stroke-width": 7 }, rot);
    [-1, 1].forEach(function (k) {
      var x0 = k < 0 ? -102 : 40;
      el("rect", { x: x0, y: -24, width: 62, height: 48, rx: 5, fill: "#3B7DD8", stroke: "#BFD9FF", "stroke-width": 3 }, rot);
      [x0 + 21, x0 + 41].forEach(function (x) { el("line", { x1: x, y1: -24, x2: x, y2: 24, stroke: "#BFD9FF", "stroke-width": 2, opacity: 0.6 }, rot); });
      el("line", { x1: x0, y1: 0, x2: x0 + 62, y2: 0, stroke: "#BFD9FF", "stroke-width": 2, opacity: 0.6 }, rot);
    });
    el("rect", { x: -25, y: -32, width: 50, height: 64, rx: 9, fill: c }, rot);
    el("rect", { x: 5, y: -32, width: 20, height: 64, rx: 6, fill: shade(c, 0.14) }, rot);
    el("path", { d: "M-22 -36Q0 -56 22 -36Z", fill: "#E9E5FF" }, rot);
    el("line", { x1: 0, y1: -46, x2: 0, y2: -66, stroke: "#E9E5FF", "stroke-width": 4 }, rot);
    var bl = el("circle", { cy: -68, r: 6, fill: "#FF6B6B" }, rot);
    return { r: 104, anim: function (t) { rot.setAttribute("transform", "rotate(" + f2(10 * Math.sin(t * 0.6)) + ")"); bl.setAttribute("opacity", Math.sin(t * 5) > 0 ? 1 : 0.3); } };
  });
  defIllus("cell", function (g, o, R) {
    var c = col(o.color, "#7EE0C3");
    var mem = el("path", { fill: tint(c, 0.12), stroke: shade(c, 0.12), "stroke-width": 7 }, g);
    var cyto = el("path", { fill: c, opacity: 0.55 }, g);
    var org = el("g", null, g), orgs = [];
    [[-46, 30, 0], [44, 40, 1], [-30, -48, 2], [52, -30, 0], [-58, -8, 1]].forEach(function (q, i) {
      var og = el("g", { transform: tr(q[0], q[1]) }, org);
      if (q[2] === 0) { el("rect", { x: -16, y: -8, width: 32, height: 16, rx: 8, fill: "#FF9F43" }, og); el("path", { d: "M-10 0Q-5 -6 0 0T10 0", fill: "none", stroke: "#FFD43B", "stroke-width": 2.5 }, og); }
      else if (q[2] === 1) el("circle", { r: 7, fill: tint(c, 0.5) }, og);
      else el("ellipse", { rx: 12, ry: 7, fill: "#FF7AC6", opacity: 0.8 }, og);
      orgs.push({ g: og, x: q[0], y: q[1], ph: R() * TAU });
    });
    ball(g, 30, col(o.color2, "violet"), { x: 8, y: -6 });
    el("circle", { cx: 15, cy: -11, r: 9, fill: shade(col(o.color2, "violet"), 0.3) }, g);
    if (o.face) cuteFace(g, 0, 46, 1.4);
    return { r: 100, anim: function (t) {
      var a = [], b = [];
      for (var i = 0; i < 16; i++) {
        var th = (i / 16) * TAU, r1 = 91 + 4 * Math.sin(3 * th + t * 1.4) + 3 * Math.sin(5 * th - t * 1.1);
        a.push([Math.cos(th) * r1, Math.sin(th) * r1]); b.push([Math.cos(th) * r1 * 0.84, Math.sin(th) * r1 * 0.84]);
      }
      mem.setAttribute("d", smoothPath(a)); cyto.setAttribute("d", smoothPath(b));
      orgs.forEach(function (q) { q.g.setAttribute("transform", tr(q.x + 4 * Math.sin(t * 0.9 + q.ph), q.y + 4 * Math.cos(t * 0.7 + q.ph)) + " rotate(" + f2(20 * Math.sin(t * 0.5 + q.ph)) + ")"); });
    } };
  });
  defIllus("bacteria", function (g, o) {
    var c = col(o.color, "#8BD450"), inner = el("g", { transform: "rotate(-18)" }, g), flag = [];
    for (var i = 0; i < 4; i++) flag.push(el("path", { fill: "none", stroke: shade(c, 0.18), "stroke-width": 4, "stroke-linecap": "round" }, inner));
    var body = el("g", null, inner);
    el("rect", { x: -68, y: -32, width: 136, height: 64, rx: 32, fill: shade(c, 0.22) }, body);
    el("rect", { x: -70, y: -35, width: 134, height: 62, rx: 31, fill: c }, body);
    el("rect", { x: -46, y: -26, width: 82, height: 9, rx: 4.5, fill: "#fff", opacity: 0.3 }, body);
    [[-34, 10], [-6, 14], [24, 6], [40, -8], [-48, -4]].forEach(function (q) { el("ellipse", { cx: q[0], cy: q[1], rx: 6, ry: 4, fill: shade(c, 0.15) }, body); });
    if (o.face) cuteFace(body, -22, -4, 1.3);
    return { r: 100, anim: function (t) {
      flag.forEach(function (f, i) {
        var y0 = -18 + i * 12, pts = [];
        for (var k = 0; k <= 6; k++) { var x = 62 + k * 6; pts.push([x, y0 + (i - 1.5) * k * 2.2 + 6 * Math.sin(k * 0.9 - t * 9 + i)]); }
        f.setAttribute("d", smoothPath(pts, true));
      });
      var q = 0.03 * Math.sin(t * 3);
      body.setAttribute("transform", "scale(" + f2(1 + q) + " " + f2(1 - q) + ")");
    } };
  });
  defIllus("virus", function (g, o) {
    var c = col(o.color, "#FF6B9A"), c2 = col(o.color2, "sun"), sp = el("g", null, g), knobs = [];
    for (var i = 0; i < 12; i++) {
      var a = (i / 12) * TAU, cx = Math.cos(a), sy = Math.sin(a);
      el("line", { x1: f2(cx * 52), y1: f2(sy * 52), x2: f2(cx * 78), y2: f2(sy * 78), stroke: shade(c, 0.18), "stroke-width": 7, "stroke-linecap": "round" }, sp);
      knobs.push(el("circle", { cx: f2(cx * 84), cy: f2(sy * 84), r: 11, fill: c2 }, sp));
    }
    ball(g, 60, c);
    [[-20, 20, 7], [22, -6, 6], [8, 32, 5], [-28, -18, 5]].forEach(function (q) { el("circle", { cx: q[0], cy: q[1], r: q[2], fill: shade(c, 0.15) }, g); });
    if (o.face) cuteFace(g, 0, 4, 1.6);
    return { r: 96, anim: function (t) { sp.setAttribute("transform", "rotate(" + f2(t * 10) + ")"); knobs.forEach(function (k, i) { k.setAttribute("r", f2(10 + 2 * Math.sin(t * 4 + i))); }); } };
  });
  defIllus("dna", function (g, o) {
    var ca = col(o.color, "coral"), cb = col(o.color2, "sky"), tl = el("g", { transform: "rotate(-22)" }, g);
    var sB = el("path", { fill: "none", stroke: shade(cb, 0.1), "stroke-width": 9, "stroke-linecap": "round" }, tl);
    var n = 12, rungs = [], ba = [], bb = [];
    for (var i = 0; i < n; i++) rungs.push(el("line", { stroke: CYCLE.map(function (k) { return PAL[k]; })[i % 4], "stroke-width": 7, "stroke-linecap": "round", opacity: 0.9 }, tl));
    var sA = el("path", { fill: "none", stroke: ca, "stroke-width": 9, "stroke-linecap": "round" }, tl);
    for (i = 0; i < n; i++) { bb.push(el("circle", { fill: cb }, tl)); ba.push(el("circle", { fill: ca }, tl)); }
    return { r: 100, anim: function (t) {
      var pa = [], pb = [];
      for (var i = 0; i < n; i++) {
        var y = -96 + (i * 192) / (n - 1), ph = y * 0.05 + t * 2.4, xa = 40 * Math.sin(ph), z = Math.cos(ph);
        pa.push([xa, y]); pb.push([-xa, y]);
        rungs[i].setAttribute("x1", f2(xa)); rungs[i].setAttribute("x2", f2(-xa)); rungs[i].setAttribute("y1", f2(y)); rungs[i].setAttribute("y2", f2(y));
        ba[i].setAttribute("cx", f2(xa)); ba[i].setAttribute("cy", f2(y)); ba[i].setAttribute("r", f2(7 + 3 * z));
        bb[i].setAttribute("cx", f2(-xa)); bb[i].setAttribute("cy", f2(y)); bb[i].setAttribute("r", f2(7 - 3 * z));
      }
      sA.setAttribute("d", smoothPath(pa, true)); sB.setAttribute("d", smoothPath(pb, true));
    } };
  });
  defIllus("molecule", function (g, o) {
    var n = clamp(Math.round(num(o.atoms, 4)), 2, 6), rot = el("g", null, g), pos = [];
    if (n === 2) pos = [[-44, 0], [44, 0]];
    else { pos.push([0, 0]); for (var i = 0; i < n - 1; i++) { var a = -PI / 2 + (i * TAU) / (n - 1) + (n === 3 ? PI / 2 : 0); pos.push([Math.cos(a) * 68, Math.sin(a) * 68]); } }
    for (i = 1; i < pos.length; i++) {
      var from = n === 2 ? pos[0] : [0, 0];
      el("line", { x1: from[0], y1: from[1], x2: f2(pos[i][0]), y2: f2(pos[i][1]), stroke: "#F2EEFF", "stroke-width": 12, "stroke-linecap": "round" }, rot);
    }
    var atoms = pos.map(function (p, i) {
      var ag = el("g", null, rot);
      ball(ag, n === 2 ? 40 : i === 0 ? 36 : 25, i === 0 && o.color ? col(o.color) : PAL[CYCLE[i % CYCLE.length]]);
      return { g: ag, p: p, i: i };
    });
    return { r: 100, anim: function (t) {
      rot.setAttribute("transform", "rotate(" + f2(12 * Math.sin(t * 0.7)) + ")");
      atoms.forEach(function (q) { q.g.setAttribute("transform", tr(q.p[0], q.p[1] + 3 * Math.sin(t * 2 + q.i))); });
    } };
  });
  defIllus("atom", function (g, o) {
    var c = col(o.color, "aqua");
    el("circle", { r: 64, fill: fvGlow(c, 0.45) }, g);
    var orb = [0, 60, 120];
    orb.forEach(function (a) { el("ellipse", { rx: 94, ry: 30, fill: "none", stroke: "#C9C2EE", "stroke-width": 4, opacity: 0.85, transform: "rotate(" + a + ")" }, g); });
    [[-9, -6, "coral"], [9, -4, "sky"], [0, 9, "coral"], [-10, 10, "sky"], [11, 11, "coral"], [2, -14, "sky"]].forEach(function (q) { ball(g, 13, q[2], { x: q[0], y: q[1] }); });
    var el2 = orb.map(function () { return ball(g, 9, c); });
    return { r: 100, anim: function (t) {
      el2.forEach(function (e, i) {
        var th = t * (2.2 + i * 0.4) + i * 2.1, a = (orb[i] * PI) / 180, x = 94 * Math.cos(th), y = 30 * Math.sin(th);
        e.setAttribute("transform", tr(x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)));
      });
    } };
  });
  defIllus("neuron", function (g, o) {
    var c = col(o.color, "pink"), sx = -30, sy = -8;
    var den = [[-150, 70], [-200, 64], [-250, 60], [-105, 56], [150, 50], [200, 48]];
    den.forEach(function (q, i) {
      var a = (q[0] * PI) / 180, L = q[1], ex = sx + Math.cos(a) * L, ey = sy + Math.sin(a) * L;
      el("path", { d: "M" + P2(sx, sy) + "Q" + P2(sx + Math.cos(a + 0.3) * L * 0.6, sy + Math.sin(a + 0.3) * L * 0.6) + " " + P2(ex, ey), fill: "none", stroke: c, "stroke-width": 9, "stroke-linecap": "round" }, g);
      el("path", { d: "M" + P2(sx + Math.cos(a) * L * 0.7, sy + Math.sin(a) * L * 0.7) + "l" + P2(Math.cos(a - 0.7) * 20, Math.sin(a - 0.7) * 20), fill: "none", stroke: c, "stroke-width": 5, "stroke-linecap": "round" }, g);
      void i;
    });
    var ax = [];
    for (var i = 0; i <= 30; i++) { var q = i / 30; ax.push([lerp(sx + 20, 78, q) + 30 * Math.sin(q * PI) * 0.5, lerp(sy + 10, 66, q) - 34 * Math.sin(q * PI)]); }
    el("path", { d: smoothPath(ax, true), fill: "none", stroke: c, "stroke-width": 9, "stroke-linecap": "round" }, g);
    el("path", { d: smoothPath(ax.slice(6, 28), true), fill: "none", stroke: tint(c, 0.5), "stroke-width": 15, "stroke-dasharray": "16 12", "stroke-linecap": "round" }, g);
    var end = ax[30], knobs = [];
    [-0.9, 0, 0.9].forEach(function (a) {
      var ex = end[0] + Math.cos(a + 0.6) * 22, ey = end[1] + Math.sin(a + 0.6) * 22;
      el("line", { x1: f2(end[0]), y1: f2(end[1]), x2: f2(ex), y2: f2(ey), stroke: c, "stroke-width": 5, "stroke-linecap": "round" }, g);
      knobs.push(el("circle", { cx: f2(ex), cy: f2(ey), r: 6, fill: "#FFD43B" }, g));
    });
    ball(g, 30, c, { x: sx, y: sy });
    el("circle", { cx: sx + 4, cy: sy - 2, r: 10, fill: shade(c, 0.3) }, g);
    var pulses = [0, 1].map(function () { var pg = el("g", null, g); el("circle", { r: 20, fill: fvGlow("#FFE27A", 0.8) }, pg); el("circle", { r: 7, fill: "#FFF3D6" }, pg); return pg; });
    return { r: 100, anim: function (t) {
      var near = 0;
      pulses.forEach(function (p, k) {
        var q = mod(t * 0.55 + k * 0.5, 1), f = q * 30, i0 = Math.floor(f), fr = f - i0, a = ax[i0], b = ax[Math.min(30, i0 + 1)];
        p.setAttribute("transform", tr(lerp(a[0], b[0], fr), lerp(a[1], b[1], fr)));
        p.setAttribute("opacity", f2(Math.min(1, q * 8, (1 - q) * 8)));
        if (q > 0.85) near = Math.max(near, 1 - (1 - q) / 0.15);
      });
      knobs.forEach(function (k) { k.setAttribute("r", f2(6 + 4 * near)); });
    } };
  });
  defIllus("body", function (g, o) {
    var c = col(o.color, "#C9C2EE"), hl = str(o.highlight).toLowerCase() || "heart";
    el("circle", { cy: -72, r: 22, fill: c }, g);
    el("rect", { x: -8, y: -54, width: 16, height: 14, fill: c }, g);
    [-1, 1].forEach(function (k) {
      el("path", { d: "M" + 30 * k + " -36Q" + 46 * k + " -14 " + 46 * k + " 22", fill: "none", stroke: shade(c, 0.08), "stroke-width": 16, "stroke-linecap": "round" }, g);
      el("path", { d: "M" + 14 * k + " 30L" + 18 * k + " 94", fill: "none", stroke: shade(c, 0.08), "stroke-width": 19, "stroke-linecap": "round" }, g);
    });
    el("path", { d: "M-34 -42Q0 -52 34 -42Q38 -6 30 34Q0 44 -30 34Q-38 -6 -34 -42Z", fill: c }, g);
    var org = {}, glow = el("circle", { r: 1, fill: fvGlow("#FFFFFF", 0.7) }, g);
    org.brain = { at: [0, -74], g: el("path", { d: smoothPath([[-15, -6], [-8, -15], [6, -15], [15, -5], [12, 8], [-12, 8]]), fill: "#FF8FB8" }, g) };
    org.lungs = { at: [0, -22], g: el("g", null, g) };
    el("ellipse", { cx: -13, cy: -22, rx: 10, ry: 17, fill: "#FF9FB0" }, org.lungs.g);
    el("ellipse", { cx: 13, cy: -22, rx: 10, ry: 17, fill: "#FF9FB0" }, org.lungs.g);
    org.heart = { at: [7, -22], g: el("path", { d: heartD(0.17), fill: "#FF3D6B", transform: tr(7, -21) }, g) };
    org.stomach = { at: [8, 4], g: el("path", { d: "M-2 -8Q16 -10 16 4Q14 16 0 14Q-8 12 -4 4Q2 0 -2 -8Z", fill: "#FF9F43", transform: tr(6, 2) }, g) };
    org.gut = { at: [0, 22], g: el("path", { d: "M-16 14Q-18 4 -8 4Q4 4 4 12Q4 20 -6 20Q-14 20 -12 12M2 16Q16 18 16 8", fill: "none", stroke: "#FFB36B", "stroke-width": 5, "stroke-linecap": "round", transform: tr(0, 6) }, g) };
    if (!org[hl]) hl = "heart";
    Object.keys(org).forEach(function (k) { org[k].g.setAttribute("opacity", k === hl ? 1 : 0.35); });
    var H0 = org[hl], wrapG = el("g", null, g);
    wrapG.appendChild(H0.g);
    glow.setAttribute("cx", H0.at[0]); glow.setAttribute("cy", H0.at[1]);
    return { r: 100, anim: function (t) {
      var b = 1 + 0.12 * Math.max(0, Math.sin(t * 6.3));
      wrapG.setAttribute("transform", tr(H0.at[0], H0.at[1]) + " scale(" + f2(b) + ") " + tr(-H0.at[0], -H0.at[1]));
      glow.setAttribute("r", f2(26 + 8 * Math.sin(t * 3)));
    } };
  });
  defIllus("brain", function (g, o) {
    var c = col(o.color, "#FF8FB8"), pts = [];
    for (var i = 0; i < 40; i++) { var a = (i / 40) * TAU, r = 86 + 5 * Math.sin(9 * a) - 10 * Math.exp(-Math.pow(mod(a + PI / 2 + PI, TAU) - PI, 2) / 0.06); pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.8 - 4]); }
    var inner = el("g", null, g), d = smoothPath(pts);
    el("path", { d: "M-6 52Q0 88 18 94", fill: "none", stroke: shade(c, 0.12), "stroke-width": 16, "stroke-linecap": "round" }, inner);
    el("path", { d: d, fill: shade(c, 0.22), transform: tr(4, 6) }, inner);
    el("path", { d: d, fill: c }, inner);
    ["M-60 -30Q-40 -44 -24 -26Q-10 -14 -30 0", "M-70 10Q-50 4 -44 24Q-38 40 -16 34", "M-36 -60Q-20 -48 -12 -62", "M20 -58Q38 -44 30 -26Q22 -10 44 -6", "M60 -32Q72 -10 56 6", "M18 20Q34 8 46 24Q56 40 36 46", "M0 -66Q-6 -20 0 8Q6 34 0 60"].forEach(function (p) {
      el("path", { d: p, fill: "none", stroke: shade(c, 0.28), "stroke-width": 6, "stroke-linecap": "round" }, inner);
    });
    el("ellipse", { cx: -40, cy: -46, rx: 20, ry: 9, fill: "#fff", opacity: 0.3, transform: "rotate(-25 -40 -46)" }, inner);
    var sp = [[-50, -64], [62, -48], [70, 30], [-72, 30]].map(function (q) { return el("path", { d: sparkleD(11), fill: "#FFD43B", transform: tr(q[0], q[1]) }, g); });
    return { r: 96, anim: function (t) {
      inner.setAttribute("transform", "scale(" + f2(1 + 0.02 * Math.sin(t * 2.4)) + ")");
      sp.forEach(function (s, i) { var k = Math.max(0, Math.sin(t * 2.6 + i * 1.9)); s.setAttribute("opacity", f2(k)); });
    } };
  });
  defIllus("heart", function (g, o) {
    var c = col(o.color, "#FF5C7A"), inner = el("g", null, g);
    el("circle", { r: 116, fill: fvGlow(c, 0.3) }, g);
    g.insertBefore(g.lastChild, inner);
    el("path", { d: heartD(1), fill: shade(c, 0.22), transform: tr(4, 2) }, inner);
    el("path", { d: heartD(1), fill: c, transform: tr(0, -4) }, inner);
    el("ellipse", { cx: -44, cy: -40, rx: 20, ry: 11, fill: "#fff", opacity: 0.38, transform: "rotate(-38 -44 -40)" }, inner);
    if (o.face) cuteFace(inner, 0, 2, 1.8);
    return { r: 95, glow: true, anim: function (t) {
      var k = mod(t, 1), b = 0.08 * Math.exp(-Math.pow(k - 0.1, 2) / 0.002) + 0.05 * Math.exp(-Math.pow(k - 0.3, 2) / 0.003);
      inner.setAttribute("transform", "scale(" + f2(1 + b) + ")");
    } };
  });
  defIllus("pill", function (g, o) {
    var c = col(o.color, "coral"), inner = el("g", null, g);
    el("path", { d: "M0 -31L-58 -31A31 31 0 0 0 -58 31L0 31Z", fill: c }, inner);
    el("path", { d: "M0 -31L58 -31A31 31 0 0 1 58 31L0 31Z", fill: "#F5F2FF" }, inner);
    el("path", { d: "M-58 14L58 14A31 31 0 0 1 58 31L-58 31A31 31 0 0 1 -58 14Z", fill: "#24125A", opacity: 0.14 }, inner);
    el("rect", { x: -64, y: -22, width: 112, height: 9, rx: 4.5, fill: "#fff", opacity: 0.45 }, inner);
    return { r: 96, anim: function (t) { inner.setAttribute("transform", "rotate(" + f2(-35 + 5 * Math.sin(t * 1.2)) + ")"); } };
  });
  defIllus("tree", function (g, o) {
    var c = col(o.color, "#4CC46A");
    el("path", { d: "M-13 95L-9 18Q0 8 9 18L13 95Z", fill: "#9A6440" }, g);
    el("path", { d: "M-4 50Q-24 40 -30 24", fill: "none", stroke: "#9A6440", "stroke-width": 7, "stroke-linecap": "round" }, g);
    var cn = el("g", null, g);
    ball(cn, 44, shade(c, 0.06), { x: -38, y: -14 });
    ball(cn, 42, shade(c, 0.14), { x: 38, y: -10 });
    ball(cn, 56, c, { x: 0, y: -46 });
    if (o.fruit) [[-40, -10], [30, -30], [-10, -60], [44, 6], [-20, -26], [16, -6]].forEach(function (q) { el("circle", { cx: q[0], cy: q[1], r: 8, fill: "#FF5C5C" }, cn); el("circle", { cx: q[0] - 2.5, cy: q[1] - 2.5, r: 2.5, fill: "#fff", opacity: 0.6 }, cn); });
    return { r: 100, bottom: 95, anim: function (t) { cn.setAttribute("transform", "rotate(" + f2(2.5 * Math.sin(t * 1.1)) + " 0 40)"); } };
  });
  defIllus("sprout", function (g, o) {
    el("ellipse", { cy: 84, rx: 72, ry: 18, fill: "#8A5A3B" }, g);
    el("ellipse", { cy: 80, rx: 60, ry: 11, fill: "#A0673B" }, g);
    el("path", { d: "M0 80Q-6 30 4 -10", fill: "none", stroke: "#3FB35A", "stroke-width": 10, "stroke-linecap": "round" }, g);
    var lv = el("g", { transform: tr(4, -10) }, g);
    var l1 = el("path", { d: "M0 0Q-50 -8 -62 -50Q-14 -52 0 0Z", fill: col(o.color, "#6BCB77") }, lv);
    var l2 = el("path", { d: "M0 0Q46 -22 58 -72Q8 -62 0 0Z", fill: "#3DDC97" }, lv);
    el("path", { d: "M-4 -4Q-30 -18 -48 -40", fill: "none", stroke: "#fff", "stroke-width": 3, opacity: 0.4 }, lv);
    el("path", { d: "M4 -6Q26 -26 44 -56", fill: "none", stroke: "#fff", "stroke-width": 3, opacity: 0.4 }, lv);
    return { r: 100, anim: function (t) { l1.setAttribute("transform", "rotate(" + f2(6 * Math.sin(t * 1.6)) + ")"); l2.setAttribute("transform", "rotate(" + f2(-6 * Math.sin(t * 1.6 + 0.7)) + ")"); } };
  });
  defIllus("flower", function (g, o) {
    var c = col(o.color, "pink");
    el("path", { d: "M0 96Q-8 40 0 -20", fill: "none", stroke: "#3FB35A", "stroke-width": 9, "stroke-linecap": "round" }, g);
    el("path", { d: "M-2 56Q-40 50 -50 20Q-12 22 -2 56Z", fill: "#6BCB77" }, g);
    el("path", { d: "M0 70Q36 60 48 32Q10 34 0 70Z", fill: "#3DDC97" }, g);
    var hd = el("g", null, g);
    for (var i = 0; i < 7; i++) el("ellipse", { cx: 0, cy: -33, rx: 20, ry: 31, fill: i % 2 ? c : tint(c, 0.22), transform: "rotate(" + f2((i * 360) / 7) + ")" }, hd);
    ball(hd, 23, "sun");
    return { r: 100, anim: function (t) { hd.setAttribute("transform", tr(3 * Math.sin(t * 1.2), -30) + " rotate(" + f2(t * 14) + ")"); } };
  });
  defIllus("fish", function (g, o) {
    var c = col(o.color, "orange"), body = el("g", null, g);
    var tail = el("path", { d: "M0 0L42 -38Q30 0 42 38Z", fill: shade(c, 0.12) }, body);
    el("path", { d: "M-24 -42Q4 -70 22 -40Z", fill: shade(c, 0.12) }, body);
    el("ellipse", { cx: -12, cy: 0, rx: 68, ry: 46, fill: c }, body);
    el("path", { d: "M-70 6Q-12 52 54 10Q20 46 -40 40Z", fill: tint(c, 0.35) }, body);
    el("path", { d: "M-4 -42Q10 0 -4 42", fill: "none", stroke: tint(c, 0.4), "stroke-width": 8, opacity: 0.8 }, body);
    el("path", { d: "M18 -36Q30 0 18 36", fill: "none", stroke: tint(c, 0.4), "stroke-width": 6, opacity: 0.8 }, body);
    el("circle", { cx: -46, cy: -10, r: 12, fill: "#fff" }, body);
    el("circle", { cx: -48, cy: -10, r: 6.5, fill: PAL.ink }, body);
    el("circle", { cx: -50, cy: -13, r: 2.2, fill: "#fff" }, body);
    el("path", { d: "M-74 10Q-68 14 -62 10", fill: "none", stroke: shade(c, 0.4), "stroke-width": 3, "stroke-linecap": "round" }, body);
    return { r: 100, anim: function (t) { tail.setAttribute("transform", tr(52, 0) + " rotate(" + f2(18 * Math.sin(t * 6)) + ")"); body.setAttribute("transform", "rotate(" + f2(3 * Math.sin(t * 3)) + ")"); } };
  });
  defIllus("people", function (g, o) {
    var list = [[-50, 8, 0.82, "sky", "#E8B48A"], [50, 8, 0.82, "mint", "#C68B5E"], [0, 18, 1, col(o.color, "coral"), "#FFD9B8"]], ps = [];
    list.forEach(function (q, i) {
      var pg = el("g", null, g);
      el("path", { d: "M-34 66L-34 22Q-34 -8 0 -8Q34 -8 34 22L34 66Q0 74 -34 66Z", fill: col(q[3]) }, pg);
      el("path", { d: "M10 -6Q34 -4 34 22L34 66Q22 70 12 70Z", fill: shade(col(q[3]), 0.12) }, pg);
      el("circle", { cy: -32, r: 23, fill: q[4] }, pg);
      el("path", { d: "M-23 -36Q-22 -58 0 -58Q22 -58 23 -36Q12 -46 -23 -36Z", fill: ["#3A2466", "#5A3520", "#24125A"][i] }, pg);
      ps.push({ g: pg, q: q, i: i });
    });
    return { r: 100, anim: function (t) { ps.forEach(function (p) { p.g.setAttribute("transform", tr(p.q[0], p.q[1] + 3 * Math.sin(t * 2.2 + p.i * 1.4)) + " scale(" + p.q[2] + ")"); }); } };
  });
  defIllus("city", function (g, o, R) {
    var wins = [];
    [[-98, 36, 112, "#5B47C9"], [-64, 42, 152, "#7B5CFF"], [-24, 34, 118, "#4DABF7"], [8, 46, 178, "#6A55E0"], [52, 46, 128, "#1FB5AD"]].forEach(function (b) {
      el("rect", { x: b[0], y: 92 - b[2], width: b[1], height: b[2], rx: 4, fill: b[3] }, g);
      el("rect", { x: b[0] + b[1] * 0.66, y: 92 - b[2], width: b[1] * 0.34, height: b[2], rx: 2, fill: shade(b[3], 0.16) }, g);
      for (var y = 92 - b[2] + 12; y < 80; y += 18) for (var x = b[0] + 7; x < b[0] + b[1] - 9; x += 13) wins.push({ n: el("rect", { x: x, y: y, width: 7, height: 9, rx: 1.5, fill: "#FFE680" }, g), ph: R() * TAU, p: 2 + R() * 5 });
    });
    el("line", { x1: 31, y1: -86, x2: 31, y2: -106, stroke: "#6A55E0", "stroke-width": 4 }, g);
    var bl = el("circle", { cx: 31, cy: -108, r: 4.5, fill: "#FF6B6B" }, g);
    el("rect", { x: -104, y: 88, width: 208, height: 8, rx: 4, fill: "#2A1B6E", opacity: 0.6 }, g);
    return { r: 100, bottom: 94, anim: function (t) { wins.forEach(function (w) { w.n.setAttribute("opacity", Math.sin((TAU * t) / w.p + w.ph) > -0.5 ? 1 : 0.25); }); bl.setAttribute("opacity", Math.sin(t * 4) > 0 ? 1 : 0.3); } };
  });
  defIllus("house", function (g, o) {
    var c = col(o.color, "coral");
    var smoke = el("g", null, g), sm = puffs(smoke, 42, -84, 4, "#FFFFFF", 70, 9);
    el("rect", { x: 30, y: -78, width: 22, height: 44, rx: 3, fill: "#C9603A" }, g);
    el("rect", { x: -64, y: -14, width: 128, height: 106, rx: 6, fill: "#FFF3D6" }, g);
    el("rect", { x: 28, y: -14, width: 36, height: 106, rx: 4, fill: "#F2D9AE" }, g);
    el("path", { d: "M-80 -8L0 -80L80 -8Z", fill: c, stroke: c, "stroke-width": 12, "stroke-linejoin": "round" }, g);
    el("path", { d: "M0 -80L80 -8L40 -8Z", fill: shade(c, 0.14), stroke: shade(c, 0.14), "stroke-width": 12, "stroke-linejoin": "round" }, g);
    el("path", { d: "M-16 92L-16 52A16 16 0 0 1 16 52L16 92Z", fill: "#7B5CFF" }, g);
    el("circle", { cx: 9, cy: 72, r: 3, fill: "#FFD43B" }, g);
    var wl = [];
    [-50, 22].forEach(function (x) {
      wl.push(el("rect", { x: x, y: 4, width: 30, height: 28, rx: 4, fill: "#4DABF7", stroke: "#FFFFFF", "stroke-width": 4 }, g));
      el("line", { x1: x + 15, y1: 4, x2: x + 15, y2: 32, stroke: "#fff", "stroke-width": 3 }, g);
    });
    return { r: 100, bottom: 92, anim: function (t) { sm(t); } };
  });
  defIllus("factory", function (g, o) {
    var c = col(o.color, "#7B6FB0"), smoke = el("g", null, g);
    var s1 = puffs(smoke, 42, -92, 4, "#E2DDF5", 80, 10), s2 = puffs(smoke, 70, -76, 3, "#E2DDF5", 70, 8);
    el("rect", { x: 32, y: -90, width: 20, height: 84, fill: "#8D82C4" }, g);
    el("rect", { x: 32, y: -70, width: 20, height: 8, fill: "#FF6B6B" }, g);
    el("rect", { x: 62, y: -74, width: 16, height: 70, fill: "#8D82C4" }, g);
    el("rect", { x: 62, y: -58, width: 16, height: 7, fill: "#FF6B6B" }, g);
    el("path", { d: "M-94 -8L-94 -44L-50 -8L-50 -44L-6 -8L-6 -44L38 -8Z", fill: shade(c, 0.2), stroke: shade(c, 0.2), "stroke-width": 6, "stroke-linejoin": "round" }, g);
    el("rect", { x: -94, y: -10, width: 188, height: 100, rx: 6, fill: c }, g);
    for (var i = 0; i < 5; i++) el("rect", { x: -80 + i * 32, y: 14, width: 20, height: 24, rx: 3, fill: "#FFD43B" }, g);
    el("rect", { x: -16, y: 52, width: 32, height: 38, rx: 3, fill: shade(c, 0.3) }, g);
    return { r: 100, bottom: 90, anim: function (t) { s1(t); s2(t); } };
  });
  defIllus("mountain", function (g, o) {
    var c = col(o.color, "violet");
    el("path", { d: "M-100 92L-30 -36L40 92Z", fill: shade(c, 0.22), stroke: shade(c, 0.22), "stroke-width": 8, "stroke-linejoin": "round" }, g);
    el("path", { d: "M-30 -36L-14 -6L-24 -10L-34 2L-44 -10Z", fill: "#F2EEFF" }, g);
    el("path", { d: "M-62 92L30 -82L104 92Z", fill: c, stroke: c, "stroke-width": 8, "stroke-linejoin": "round" }, g);
    el("path", { d: "M30 -82L104 92L52 92Z", fill: shade(c, 0.12), stroke: shade(c, 0.12), "stroke-width": 8, "stroke-linejoin": "round" }, g);
    el("path", { d: "M30 -82L52 -40L40 -46L30 -32L18 -48L8 -40Z", fill: "#FFFFFF", stroke: "#FFFFFF", "stroke-width": 6, "stroke-linejoin": "round" }, g);
    var cl = el("path", { d: cloudD(70), fill: "#FFFFFF", opacity: 0.92 }, g);
    return { r: 104, bottom: 94, anim: function (t) { cl.setAttribute("transform", tr(-30 + 36 * Math.sin(t * 0.4), -20)); } };
  });
  defIllus("cloud", function (g, o) {
    var c = col(o.color, "#FFFFFF"), drops = [];
    if (o.rain) for (var i = 0; i < 8; i++) drops.push(el("path", { d: "M0 -9C3 -4 6 0 6 3A6 6 0 0 1 -6 3C-6 0 -3 -4 0 -9Z", fill: "#4DABF7" }, g));
    var inner = el("g", null, g);
    el("path", { d: cloudD(184), fill: lum(c) > 0.9 ? "#C8DDF5" : shade(c, 0.16), transform: tr(0, o.rain ? -16 : 8) }, inner);
    el("path", { d: cloudD(184), fill: c, transform: tr(0, o.rain ? -24 : 0) }, inner);
    el("ellipse", { cx: -30, cy: o.rain ? -64 : -40, rx: 18, ry: 9, fill: "#fff", opacity: 0.6 }, inner);
    if (o.face) cuteFace(inner, 0, o.rain ? -14 : 8, 1.5);
    return { r: 100, anim: function (t) {
      inner.setAttribute("transform", "scale(" + f2(1 + 0.02 * Math.sin(t * 1.5)) + ")");
      drops.forEach(function (d, i) { var q = mod(t * 1.6 + i * 0.37, 1); d.setAttribute("transform", tr(-64 + i * 18, 20 + q * 70)); d.setAttribute("opacity", f2((1 - q) * Math.min(1, q * 6))); });
    } };
  });
  defIllus("wave", function (g, o) {
    var c = col(o.color, "sky"), cl = el("g", { "clip-path": clipCircle(94, 0, 0) }, g);
    el("rect", { x: -100, y: -100, width: 200, height: 200, fill: "#BFE6FF" }, cl);
    el("circle", { cx: 46, cy: -46, r: 18, fill: "#FFD43B" }, cl);
    var b1 = el("g", null, cl), b2 = el("g", null, cl), b3 = el("g", null, cl);
    band(b1, -28, 200, shade(c, 0.2), 100, 12, -300, 300);
    band(b2, 8, 200, c, 90, 14, -300, 300);
    band(b3, 44, 200, tint(c, 0.3), 80, 10, -300, 300);
    var foam = el("g", null, cl);
    for (var i = -6; i <= 6; i++) el("circle", { cx: i * 30, cy: 4 + 14 * Math.sin((i * 30 / 90) * TAU), r: 6, fill: "#fff", opacity: 0.85 }, foam);
    el("circle", { r: 94, fill: "none", stroke: "#FFFFFF", "stroke-width": 6, opacity: 0.5 }, g);
    return { r: 96, anim: function (t) {
      b1.setAttribute("transform", tr(-mod(t * 14, 100), 0)); b2.setAttribute("transform", tr(mod(t * 22, 90) - 90, 0));
      foam.setAttribute("transform", tr(mod(t * 22, 90) - 90, 0)); b3.setAttribute("transform", tr(-mod(t * 30, 80), 0));
    } };
  });
  defIllus("drop", function (g, o) {
    var c = col(o.color, "sky"), inner = el("g", null, g), d = "M0 -96C24 -60 62 -22 62 28A62 62 0 0 1 -62 28C-62 -22 -24 -60 0 -96Z";
    el("path", { d: d, fill: shade(c, 0.22), transform: tr(5, 6) }, inner);
    el("path", { d: d, fill: c }, inner);
    el("path", { d: "M-36 8Q-40 48 -10 66", fill: "none", stroke: "#fff", "stroke-width": 10, "stroke-linecap": "round", opacity: 0.5 }, inner);
    el("circle", { cx: -14, cy: -30, r: 7, fill: "#fff", opacity: 0.5 }, inner);
    if (o.face) cuteFace(inner, 0, 34, 1.7);
    return { r: 96, anim: function (t) { var q = 0.03 * Math.sin(t * 3.1); inner.setAttribute("transform", "translate(0 90) scale(" + f2(1 + q) + " " + f2(1 - q) + ") translate(0 -90)"); } };
  });
  defIllus("flame", function (g, o) {
    el("circle", { cy: 10, r: 112, fill: fvGlow("#FF9F43", 0.4) }, g);
    var L = [[70, 94, 0, "#FF5E3A"], [50, 72, 18, "#FF9F43"], [28, 46, 38, "#FFD43B"]].map(function (q) { return { p: el("path", { fill: q[3] }, g), w: q[0], h: q[1], dy: q[2] }; });
    return { r: 100, glow: true, anim: function (t) {
      L.forEach(function (l, i) {
        var w = l.w, h = l.h, y = l.dy, ph = i * 1.3;
        var tipx = 9 * Math.sin(t * 7 + ph) + 5 * Math.sin(t * 13 + ph), tipy = -h + y + 6 * Math.sin(t * 11 + ph);
        var pts = [[tipx, tipy], [w * 0.5 + 4 * Math.sin(t * 9 + ph), -h * 0.3 + y], [w * 0.92, h * 0.3 + y], [w * 0.6, h * 0.82 + y], [0, h * 0.97 + y], [-w * 0.6, h * 0.82 + y], [-w * 0.92, h * 0.3 + y], [-w * 0.5 + 4 * Math.sin(t * 8 + ph), -h * 0.3 + y]];
        l.p.setAttribute("d", smoothPath(pts));
      });
    } };
  });
  defIllus("bolt", function (g, o) {
    var c = col(o.color, "sun"), gl = el("circle", { r: 118, fill: fvGlow(c, 0.45) }, g), inner = el("g", null, g), d = "M18 -94L-52 10L-6 10L-22 94L52 -14L6 -14Z";
    el("path", { d: d, fill: shade(c, 0.24), stroke: shade(c, 0.24), "stroke-width": 9, "stroke-linejoin": "round", transform: tr(5, 7) }, inner);
    el("path", { d: d, fill: c, stroke: c, "stroke-width": 9, "stroke-linejoin": "round" }, inner);
    el("path", { d: "M10 -76L-36 4", stroke: "#fff", "stroke-width": 6, "stroke-linecap": "round", opacity: 0.5 }, inner);
    return { r: 100, glow: true, anim: function (t) { gl.setAttribute("opacity", f2(0.55 + 0.45 * Math.abs(Math.sin(t * 7) * Math.sin(t * 2.3)))); inner.setAttribute("transform", "scale(" + f2(1 + 0.025 * Math.sin(t * 17)) + ")"); } };
  });
  defIllus("bulb", function (g, o) {
    var c = col(o.color, "#FFE680"), gl = el("circle", { cy: -20, r: 122, fill: fvGlow("#FFE27A", 0.55) }, g), rays = el("g", { transform: tr(0, -22) }, g);
    for (var i = 0; i < 9; i++) { var a = -PI + (i * PI) / 8 - 0; el("line", { x1: f2(Math.cos(a) * 76), y1: f2(Math.sin(a) * 76), x2: f2(Math.cos(a) * 94), y2: f2(Math.sin(a) * 94), stroke: "#FFD43B", "stroke-width": 8, "stroke-linecap": "round" }, rays); }
    el("path", { d: "M-28 26L28 26L22 46L-22 46Z", fill: c }, g);
    el("circle", { cy: -22, r: 60, fill: c }, g);
    el("circle", { cx: -8, cy: -30, r: 42, fill: "#FFF5C2" }, g);
    el("path", { d: "M-12 26L-12 0Q-6 -14 0 0Q6 -14 12 0L12 26", fill: "none", stroke: "#FF9F43", "stroke-width": 4.5, "stroke-linecap": "round" }, g);
    el("path", { d: "M-40 -40Q-36 -64 -12 -70", fill: "none", stroke: "#fff", "stroke-width": 7, "stroke-linecap": "round", opacity: 0.8 }, g);
    for (i = 0; i < 3; i++) el("rect", { x: -24, y: 46 + i * 12, width: 48, height: 12, rx: 5, fill: i % 2 ? "#8F8BB8" : "#A9A6C8" }, g);
    el("path", { d: "M-12 82Q0 94 12 82Z", fill: "#6E6A9E" }, g);
    return { r: 100, bottom: 88, glow: true, anim: function (t) { var k = 0.7 + 0.3 * Math.sin(t * 3); gl.setAttribute("opacity", f2(k)); rays.setAttribute("opacity", f2(0.4 + 0.6 * Math.abs(Math.sin(t * 2.2)))); } };
  });
  defIllus("gear", function (g, o) {
    var c = col(o.color, "sky"), c2 = col(o.color2, "orange");
    var big = el("g", { transform: tr(-16, -12) }, g), sm = el("g", { transform: tr(56, 52) }, g);
    var bg = el("g", null, big), sg = el("g", null, sm);
    el("path", { d: gearD(70, 11, 15, 22), fill: shade(c, 0.24), "fill-rule": "evenodd", transform: tr(4, 6) }, bg);
    el("path", { d: gearD(70, 11, 15, 22), fill: c, "fill-rule": "evenodd" }, bg);
    el("circle", { r: 40, fill: "none", stroke: tint(c, 0.3), "stroke-width": 6 }, bg);
    el("path", { d: gearD(38, 8, 11, 11), fill: shade(c2, 0.24), "fill-rule": "evenodd", transform: tr(3, 4) }, sg);
    el("path", { d: gearD(38, 8, 11, 11), fill: c2, "fill-rule": "evenodd" }, sg);
    return { r: 100, anim: function (t) { bg.setAttribute("transform", "rotate(" + f2(t * 28) + ")"); sg.setAttribute("transform", "rotate(" + f2(-t * 28 * (11 / 8) + 12) + ")"); } };
  });
  defIllus("clock", function (g, o) {
    var c = col(o.color, "coral"), sp = num(o.speed, 1);
    el("circle", { r: 92, fill: shade(c, 0.2) }, g);
    el("circle", { cx: -3, cy: -4, r: 88, fill: c }, g);
    el("circle", { r: 72, fill: "#FFF8EC" }, g);
    for (var i = 0; i < 12; i++) el("line", { x1: 0, y1: i % 3 ? -60 : -54, x2: 0, y2: -66, stroke: PAL.ink, "stroke-width": i % 3 ? 4 : 7, "stroke-linecap": "round", transform: "rotate(" + i * 30 + ")" }, g);
    var hh = el("line", { x1: 0, y1: 6, x2: 0, y2: -36, stroke: PAL.ink, "stroke-width": 10, "stroke-linecap": "round" }, g);
    var mm = el("line", { x1: 0, y1: 8, x2: 0, y2: -56, stroke: "#7B5CFF", "stroke-width": 7, "stroke-linecap": "round" }, g);
    el("circle", { r: 8, fill: "#FFD43B" }, g);
    return { r: 96, anim: function (t) { mm.setAttribute("transform", "rotate(" + f2(t * 60 * sp) + ")"); hh.setAttribute("transform", "rotate(" + f2(120 + t * 5 * sp) + ")"); } };
  });
  defIllus("blast", function (g, o, R) {
    var lays = [[98, 64, "#FF5E3A"], [76, 48, "#FF9F43"], [50, 30, "#FFD43B"]].map(function (q) {
      var pts = [];
      for (var i = 0; i < 24; i++) { var a = -PI / 2 + (i * PI) / 12, r = i % 2 ? q[1] * (0.85 + R() * 0.3) : q[0] * (0.85 + R() * 0.15); pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
      return el("path", { d: polyD(pts), fill: q[2], stroke: q[2], "stroke-width": 6, "stroke-linejoin": "round" }, g);
    });
    el("circle", { r: 18, fill: "#FFF8E0" }, g);
    return { r: 100, glow: true, anim: function (t) { lays.forEach(function (l, i) { l.setAttribute("transform", "rotate(" + f2((i % 2 ? -1 : 1) * 6 * Math.sin(t * 2 + i)) + ") scale(" + f2(1 + 0.05 * Math.sin(t * 6 + i * 1.5)) + ")"); }); } };
  });
  defIllus("coin", function (g, o) {
    var c = col(o.color, "gold"), sym = str(o.symbol) || "$", inner = el("g", null, g);
    var edge = el("ellipse", { rx: 86, ry: 90, fill: shade(c, 0.32) }, inner);
    el("circle", { r: 88, fill: c }, inner);
    el("circle", { r: 68, fill: shade(c, 0.08), stroke: tint(c, 0.35), "stroke-width": 6 }, inner);
    var tx = el("text", { x: 0, y: 32, "text-anchor": "middle", "font-size": sym.length > 1 ? 56 : 92, "font-weight": 900, "font-family": FONT, fill: shade(c, 0.3) }, inner);
    tx.textContent = sym.slice(0, 3);
    el("path", { d: "M-54 -40Q-30 -66 0 -70", fill: "none", stroke: "#fff", "stroke-width": 9, "stroke-linecap": "round", opacity: 0.45 }, inner);
    return { r: 92, anim: function (t) { var k = Math.cos(t * 1.4); inner.setAttribute("transform", "scale(" + f2(0.62 + 0.38 * Math.abs(k)) + " 1)"); edge.setAttribute("cx", f2(k >= 0 ? 7 : -7)); } };
  });
  defIllus("cash", function (g, o) {
    var c = col(o.color, "mint"), bills = [];
    [[6, 26, 8], [-4, 10, -5], [0, -10, 2]].forEach(function (q) {
      var b = el("g", null, g);
      el("rect", { x: -86, y: -46, width: 172, height: 92, rx: 10, fill: c, stroke: shade(c, 0.2), "stroke-width": 5 }, b);
      el("rect", { x: -72, y: -34, width: 144, height: 68, rx: 6, fill: "none", stroke: tint(c, 0.35), "stroke-width": 3 }, b);
      el("circle", { r: 25, fill: shade(c, 0.18) }, b);
      var tx = el("text", { x: 0, y: 13, "text-anchor": "middle", "font-size": 38, "font-weight": 900, "font-family": FONT, fill: "#fff" }, b);
      tx.textContent = str(o.symbol) || "$";
      bills.push({ g: b, q: q });
    });
    return { r: 100, anim: function (t) { bills.forEach(function (b, i) { b.g.setAttribute("transform", tr(b.q[0], b.q[1]) + " rotate(" + f2(b.q[2] + (i === 2 ? 3 * Math.sin(t * 2) : i === 1 ? 1.5 * Math.sin(t * 1.6) : 0)) + ")"); }); } };
  });
  defIllus("book", function (g, o) {
    var c = col(o.color, "coral");
    el("path", { d: "M-98 -48L0 -38L98 -48L98 64L0 74L-98 64Z", fill: c, stroke: c, "stroke-width": 8, "stroke-linejoin": "round" }, g);
    el("path", { d: "M-88 -56Q-44 -66 0 -48L0 64Q-44 48 -88 56Z", fill: "#FFF8EC" }, g);
    el("path", { d: "M88 -56Q44 -66 0 -48L0 64Q44 48 88 56Z", fill: "#FFEFD6" }, g);
    for (var i = 0; i < 4; i++) {
      el("path", { d: "M-74 " + (-34 + i * 20) + "Q-40 " + (-42 + i * 20) + " -14 " + (-28 + i * 20), fill: "none", stroke: "#C9C2EE", "stroke-width": 4, "stroke-linecap": "round" }, g);
      el("path", { d: "M14 " + (-28 + i * 20) + "Q40 " + (-42 + i * 20) + " 74 " + (-34 + i * 20), fill: "none", stroke: "#C9C2EE", "stroke-width": 4, "stroke-linecap": "round" }, g);
    }
    var pg = el("path", { fill: "#FFFDF5", stroke: "#E4DCFA", "stroke-width": 2 }, g);
    el("line", { x1: 0, y1: -48, x2: 0, y2: 64, stroke: shade(c, 0.1), "stroke-width": 3 }, g);
    return { r: 100, anim: function (t) {
      var q = mod(t, 3.2) / 0.9, x = q < 1 ? 86 * Math.cos(PI * smooth(q)) : 86;
      if (q >= 1) { pg.setAttribute("d", ""); return; }
      pg.setAttribute("d", "M0 -48Q" + f2(x / 2) + " -64 " + f2(x) + " -58L" + f2(x) + " 56Q" + f2(x / 2) + " 46 0 64Z");
    } };
  });
  defIllus("laptop", function (g, o) {
    el("rect", { x: -82, y: -80, width: 164, height: 112, rx: 10, fill: "#2A1B6E" }, g);
    el("rect", { x: -72, y: -70, width: 144, height: 92, rx: 5, fill: "#1C2E6E" }, g);
    [-62, -54, -46].forEach(function (x, i) { el("circle", { cx: x, cy: -62, r: 3, fill: ["#FF6B6B", "#FFD43B", "#3DDC97"][i] }, g); });
    var bars = ["coral", "mint", "sun", "pink", "sky"].map(function (c, i) { return el("rect", { x: -54 + i * 24, width: 14, rx: 3, fill: PAL[c] }, g); });
    var cur = el("rect", { x: 48, y: -54, width: 3, height: 14, fill: "#fff" }, g);
    el("path", { d: "M-98 32L98 32L86 54L-86 54Z", fill: "#C9C2EE", stroke: "#C9C2EE", "stroke-width": 6, "stroke-linejoin": "round" }, g);
    el("rect", { x: -20, y: 38, width: 40, height: 7, rx: 3, fill: "#A9A6C8" }, g);
    return { r: 100, anim: function (t) { bars.forEach(function (b, i) { var h = 14 + 36 * (0.55 + 0.45 * Math.sin(t * 1.6 + i * 1.1)); b.setAttribute("y", f2(14 - h)); b.setAttribute("height", f2(h)); }); cur.setAttribute("opacity", mod(t, 1) < 0.5 ? 1 : 0); } };
  });
  defIllus("chip", function (g, o) {
    var c = col(o.color, "violet");
    for (var s = 0; s < 4; s++) for (var i = 0; i < 5; i++) el("rect", { x: -40 + i * 18, y: -90, width: 9, height: 22, rx: 3, fill: "#C9C2EE", transform: "rotate(" + s * 90 + ")" }, g);
    el("rect", { x: -68, y: -68, width: 136, height: 136, rx: 14, fill: "#2A1B6E" }, g);
    var tr2 = [];
    [[-40, -40, -60, -60], [40, -40, 60, -60], [40, 40, 60, 60], [-40, 40, -60, 60], [0, -40, 0, -62], [0, 40, 0, 62], [-40, 0, -62, 0], [40, 0, 62, 0]].forEach(function (q) { tr2.push(el("line", { x1: q[0], y1: q[1], x2: q[2], y2: q[3], stroke: "#5CE1E6", "stroke-width": 4, "stroke-dasharray": "5 6", opacity: 0.8 }, g)); });
    el("rect", { x: -40, y: -40, width: 80, height: 80, rx: 8, fill: c }, g);
    var core = el("rect", { x: -18, y: -18, width: 36, height: 36, rx: 5, fill: "#5CE1E6" }, g);
    el("circle", { cx: -54, cy: -54, r: 5, fill: "#FFD43B" }, g);
    return { r: 100, anim: function (t) { tr2.forEach(function (l) { l.setAttribute("stroke-dashoffset", f2(-t * 24)); }); core.setAttribute("opacity", f2(0.65 + 0.35 * Math.sin(t * 3))); } };
  });
  defIllus("magnet", function (g, o) {
    var c = col(o.color, "red"), fl = [];
    [[-46, -70, 46, 0, -100], [-30, -70, 30, 0, -88], [-14, -70, 14, 0, -78]].forEach(function (q) { fl.push(el("path", { d: "M" + q[0] + " " + q[1] + "Q" + q[3] + " " + q[4] + " " + q[2] + " " + q[1], fill: "none", stroke: "#C9C2EE", "stroke-width": 4, "stroke-dasharray": "8 9", "stroke-linecap": "round" }, g)); });
    var u = "M-50 -44L-50 14A50 50 0 0 0 50 14L50 -44";
    el("path", { d: u, fill: "none", stroke: shade(c, 0.24), "stroke-width": 38, transform: tr(4, 6) }, g);
    el("path", { d: u, fill: "none", stroke: c, "stroke-width": 38 }, g);
    el("path", { d: "M-60 -36L-60 14A60 60 0 0 0 -20 70", fill: "none", stroke: "#fff", "stroke-width": 7, "stroke-linecap": "round", opacity: 0.3 }, g);
    el("rect", { x: -69, y: -72, width: 38, height: 30, rx: 4, fill: "#E9E5FF" }, g);
    el("rect", { x: 31, y: -72, width: 38, height: 30, rx: 4, fill: "#E9E5FF" }, g);
    el("rect", { x: 31, y: -50, width: 38, height: 8, fill: "#C9C2EE" }, g);
    el("rect", { x: -69, y: -50, width: 38, height: 8, fill: "#C9C2EE" }, g);
    return { r: 100, anim: function (t) { fl.forEach(function (f, i) { f.setAttribute("stroke-dashoffset", f2(-t * 30)); f.setAttribute("opacity", f2(0.4 + 0.6 * Math.abs(Math.sin(t * 1.8 + i)))); }); } };
  });
  defIllus("trophy", function (g, o) {
    var c = col(o.color, "gold");
    [-1, 1].forEach(function (k) { el("path", { d: "M" + -46 * k + " -58C" + -92 * k + " -58 " + -86 * k + " 6 " + -40 * k + " 8", fill: "none", stroke: shade(c, 0.12), "stroke-width": 13, "stroke-linecap": "round" }, g); });
    el("rect", { x: -11, y: 24, width: 22, height: 30, fill: shade(c, 0.18) }, g);
    el("path", { d: "M-58 -78L58 -78Q58 22 0 32Q-58 22 -58 -78Z", fill: c }, g);
    el("path", { d: "M18 -78L58 -78Q58 22 0 32Q30 10 18 -78Z", fill: shade(c, 0.12) }, g);
    el("ellipse", { cy: -78, rx: 58, ry: 10, fill: tint(c, 0.35) }, g);
    el("path", { d: starD(22, 10, 5), fill: tint(c, 0.45), transform: tr(-4, -30) }, g);
    el("path", { d: "M-38 -62Q-40 -20 -22 6", fill: "none", stroke: "#fff", "stroke-width": 8, "stroke-linecap": "round", opacity: 0.4 }, g);
    el("rect", { x: -42, y: 52, width: 84, height: 18, rx: 5, fill: "#7B5CFF" }, g);
    el("rect", { x: -54, y: 68, width: 108, height: 24, rx: 6, fill: "#5B47C9" }, g);
    var sp = [[62, -84, 12], [-70, -40, 9]].map(function (q) { return el("path", { d: sparkleD(q[2]), fill: "#FFF3D6", transform: tr(q[0], q[1]) }, g); });
    return { r: 100, bottom: 92, anim: function (t) { sp.forEach(function (s, i) { s.setAttribute("opacity", f2(Math.max(0, Math.sin(t * 2.4 + i * 2)))); }); } };
  });
  var ILL_ALIAS = { jupiter: "gasgiant", "gas-giant": "gasgiant", world: "earth", globe: "earth", planet2: "planet", ringplanet: "saturn", lightbulb: "bulb", idea: "bulb", money: "cash", dollar: "coin", explosion: "blast", fire: "flame", lightning: "bolt", water: "drop", person: "people", crowd: "people", building: "city", microbe: "bacteria", germ: "bacteria", computer: "laptop", cpu: "chip", award: "trophy", time: "clock", plant: "sprout", ocean: "wave", sea: "wave" };
  function illusFn(name) { name = str(name).toLowerCase(); return ILL[name] || ILL[ILL_ALIAS[name]] || null; }
  function unknownIllus(g, o, R, name) {
    var c = col(o.color, CYCLE[hash(name) % CYCLE.length]);
    el("circle", { r: 120, fill: fvGlow(c, 0.3) }, g);
    ball(g, 84, c);
    var sh = SHAPES_RAW[name] ? shapePath(name, 46) : sparkleD(42);
    el("path", { d: sh, fill: "#FFFFFF", opacity: 0.92 }, g);
    return { r: 96, glow: true };
  }
  var WORLD_FOR = { space: "planet saturn gasgiant mars earth moon sun star galaxy blackhole rocket satellite", micro: "cell bacteria virus dna molecule atom neuron", body: "body brain heart pill", ocean: "fish wave drop", sky: "tree sprout flower house mountain cloud people city", night: "laptop chip bulb", dusk: "factory flame blast", studio: "coin cash gear clock book magnet trophy bolt" };
  function worldFor(name) {
    name = str(name).toLowerCase();
    var n2 = ILL[name] ? name : ILL_ALIAS[name] || name;
    for (var k in WORLD_FOR) if ((" " + WORLD_FOR[k] + " ").indexOf(" " + n2 + " ") >= 0) return k;
    return "studio";
  }
  var GLOW_FOR = { space: "#9B7BFF", micro: "#9BF0FF", body: "#FF8FA8", ocean: "#9EE6FF", studio: "#8F74FF", night: "#8C9CFF", none: "#9B7BFF", sky: "#FFFFFF", dusk: "#FFC48C" };
  var GROUND_SH = { sky: "#2F7D4A", dusk: "#1A0C3A" };
  function illus(name, o) {
    need();
    o = o || {};
    name = str(name).toLowerCase() || "planet";
    var fn = illusFn(name);
    var parent = o.parent || st.ctx.world;
    var g = el("g", { class: "fv-illus" }, parent);
    var shG = el("g", null, g), inner = el("g", null, g);
    var R = V.makeRand(num(o.seed, 0) + hash(name) + 3);
    var res = (fn ? fn(inner, o, R, name) : unknownIllus(inner, o, R, name)) || {};
    var r = res.r || 100, bottom = res.bottom || r;
    var sk = o.shadow;
    if (!sk) {
      if (GROUND_SH[st.world] && st.ctx.groundY && parent === st.ctx.world) {
        var sz0 = num(o.size, 200), byy = num(o.y, H / 2) + (bottom * sz0) / 200;
        sk = Math.abs(byy - st.ctx.groundY(num(o.x, W / 2))) < sz0 * 0.3 ? "ground" : res.glow ? "none" : "glow";
      } else sk = res.glow ? "none" : "glow";
    }
    if (sk === "glow") el("circle", { r: f2(r * 1.4), fill: fvGlow(GLOW_FOR[st.world] || "#9B7BFF", 0.34) }, shG);
    else if (sk === "ground") el("ellipse", { cx: 0, cy: f2(bottom + 2), rx: f2(r * 0.78), ry: f2(r * 0.13), fill: GROUND_SH[st.world] || "#24125A", opacity: 0.28 }, shG);
    else if (sk === "long") el("ellipse", { cx: f2(r * 0.5), cy: f2(r * 0.55), rx: f2(r * 1.15), ry: f2(r * 0.5), fill: "#24125A", opacity: 0.16, transform: "rotate(35 " + f2(r * 0.5) + " " + f2(r * 0.55) + ")" }, shG);
    var a = new Actor(g, false, { r: r, layer: st.layerOf.has(parent) ? st.layerOf.get(parent) : null, kind: "illus", label: name });
    a.name = name; a.bottom = bottom; a.inner = inner;
    if (res.anim) a.anim = function (t) { res.anim(t); };
    a.at(num(o.x, W / 2), num(o.y, H / 2)).size(num(o.size, 200) / 200);
    return a;
  }

  // ------------------------- recurring cast -------------------------
  var CAST = {
    pip: { body: "#FFD43B", belly: "#FFF3C4", wing: "#F5B82E", beak: "#FF9F43", feet: "#FF9F43", tuft: "#F5A623", kind: "chick" },
    nova: { body: "#1FB5AD", belly: "#C4F5EC", wing: "#168F89", beak: "#FF9F43", feet: "#FF9F43", crest: "#FF7AC6", kind: "bird" },
    momo: { body: "#7B5CFF", belly: "#D9D2FA", wing: "#5B47C9", beak: "#FFB547", feet: "#FFB547", disc: "#EDE8FF", kind: "owl" },
    zib: { body: "#3DDC97", belly: "#B9F6DC", wing: "#2BB57A", glow: "#FFD43B", kind: "blob" },
  };
  var EXPR = {
    neutral: { eye: 1, happy: 0, browY: 0, browL: 0, browR: 0, open: 0, tilt: 0, cheek: 0.5 },
    happy: { eye: 1, happy: 1, browY: -6, browL: -6, browR: 6, open: 0.15, tilt: 0, cheek: 0.85 },
    wow: { eye: 1.22, happy: 0, browY: -16, browL: -4, browR: 4, open: 0.75, tilt: 0, cheek: 0.6 },
    think: { eye: 1, happy: 0, browY: -4, browL: 6, browR: -16, open: 0, tilt: -7, cheek: 0.5, look: [0.65, -0.8] },
    sad: { eye: 0.82, happy: 0, browY: 2, browL: 18, browR: -18, open: 0, tilt: 4, cheek: 0.35, look: [0, 0.55] },
    excited: { eye: 1, happy: 1, browY: -10, browL: -8, browR: 8, open: 0.45, tilt: 0, cheek: 0.95, bounce: 1 },
  };
  function wordAt(t) {
    var ws = V.words, lo = 0, hi = ws.length - 1, best = -1;
    while (lo <= hi) { var m2 = (lo + hi) >> 1; if (ws[m2].start <= t) { best = m2; lo = m2 + 1; } else hi = m2 - 1; }
    return best;
  }
  function talkAmount(t) {
    var i = wordAt(t);
    if (i < 0) return 0;
    var w = V.words[i];
    if (t > w.end) return 0;
    var q = (t - w.start) / Math.max(0.05, w.end - w.start);
    return Math.pow(Math.sin(PI * clamp(q, 0, 1)), 0.6) * (0.55 + 0.45 * Math.abs(Math.sin(t * 17 + i)));
  }
  function creature(name, o) {
    need();
    o = o || {};
    name = str(name).toLowerCase();
    if (!CAST[name]) name = "pip";
    var sp = Object.assign({}, CAST[name]);
    if (o.color) { sp.body = col(o.color); sp.wing = shade(sp.body, 0.15); sp.belly = tint(sp.body, 0.6); }
    var parent = o.parent || st.ctx.world;
    var g = el("g", { class: "fv-creature fv-c-" + name }, parent);
    var shadow = el("ellipse", { cx: 0, cy: 104, rx: 70, ry: 12, fill: GROUND_SH[st.world] || "#0E0830", opacity: GROUND_SH[st.world] ? 0.28 : 0.2 }, g);
    var bob = el("g", null, g);
    var parts = {};
    if (sp.kind === "bird") {
      parts.tail = el("g", { transform: tr(70, 34) }, bob);
      [[50, sp.wing], [80, sp.crest], [108, sp.wing]].forEach(function (q) { el("ellipse", { cx: 0, cy: 30, rx: 14, ry: 38, fill: q[1], transform: "rotate(" + -q[0] + ")" }, parts.tail); });
    }
    var wings = [-1, 1].map(function (k) {
      var pg = el("g", null, bob);
      if (sp.kind === "blob") el("ellipse", { cx: 0, cy: 22, rx: 17, ry: 26, fill: sp.wing }, pg);
      else { el("ellipse", { cx: 0, cy: 38, rx: 25, ry: 46, fill: sp.wing, transform: "rotate(" + 10 * -k + " 0 38)" }, pg); el("ellipse", { cx: 0, cy: 50, rx: 14, ry: 26, fill: shade(sp.wing, 0.12), opacity: 0.5, transform: "rotate(" + 10 * -k + " 0 38)" }, pg); }
      return { g: pg, k: k, x: (sp.kind === "blob" ? 92 : 84) * k, y: sp.kind === "blob" ? 6 : -16 };
    });
    if (sp.feet) [-1, 1].forEach(function (k) { el("ellipse", { cx: 30 * k, cy: 96, rx: 20, ry: 10, fill: sp.feet }, bob); });
    var bodyBack, bodyMain;
    if (sp.kind === "blob") { bodyBack = el("path", { fill: shade(sp.body, 0.2) }, bob); bodyMain = el("path", { fill: sp.body }, bob); }
    else { el("circle", { r: 100, fill: shade(sp.body, 0.2) }, bob); el("circle", { cx: -6, cy: -7, r: 93, fill: sp.body }, bob); }
    el("ellipse", { cx: 0, cy: 40, rx: 60, ry: 48, fill: sp.belly }, bob);
    if (sp.kind === "owl") {
      [[-22, 30], [0, 44], [22, 30], [-12, 58], [12, 58]].forEach(function (q) { el("path", { d: "M" + (q[0] - 8) + " " + q[1] + "Q" + q[0] + " " + (q[1] + 8) + " " + (q[0] + 8) + " " + q[1], fill: "none", stroke: shade(sp.belly, 0.2), "stroke-width": 3.5, "stroke-linecap": "round" }, bob); });
      [-1, 1].forEach(function (k) { el("path", { d: "M" + -72 * k + " -60L" + -60 * k + " -122L" + -26 * k + " -82Z", fill: sp.wing, stroke: sp.wing, "stroke-width": 8, "stroke-linejoin": "round" }, bob); });
    }
    el("ellipse", { cx: -40, cy: -58, rx: 24, ry: 13, fill: "#fff", opacity: 0.28, transform: "rotate(-30 -40 -58)" }, bob);
    var top = el("g", null, bob);
    if (sp.kind === "chick") {
      el("path", { d: "M-4 -92C-16 -124 10 -140 18 -122C22 -110 8 -106 6 -116", fill: "none", stroke: sp.tuft, "stroke-width": 9, "stroke-linecap": "round" }, top);
      el("path", { d: "M6 -94C14 -118 30 -122 36 -108", fill: "none", stroke: sp.tuft, "stroke-width": 8, "stroke-linecap": "round" }, top);
    } else if (sp.kind === "bird") {
      [[-16, -100, -28], [0, -110, 0], [16, -100, 28]].forEach(function (q) { el("ellipse", { cx: q[0], cy: q[1], rx: 10, ry: 24, fill: sp.crest, transform: "rotate(" + q[2] + " " + q[0] + " " + (q[1] + 14) + ")" }, top); });
    } else if (sp.kind === "blob") {
      el("path", { d: "M0 -94Q10 -124 -2 -146", fill: "none", stroke: shade(sp.body, 0.2), "stroke-width": 6, "stroke-linecap": "round" }, top);
      el("circle", { cx: -2, cy: -150, r: 26, fill: fvGlow(sp.glow, 0.7) }, top);
      parts.bulb = el("circle", { cx: -2, cy: -150, r: 11, fill: sp.glow }, top);
    }
    var face = el("g", null, bob), eyeY = sp.kind === "owl" ? -22 : -16, eyeX = sp.kind === "owl" ? 38 : 34;
    var eyes = [-1, 1].map(function (k) {
      if (sp.kind === "owl") el("circle", { cx: eyeX * k, cy: eyeY, r: 37, fill: sp.disc }, face);
      var eg = el("g", null, face), open = el("g", null, eg);
      el("ellipse", { rx: sp.kind === "owl" ? 25 : 21, ry: sp.kind === "owl" ? 27 : 24, fill: "#FFFFFF" }, open);
      var pupil = el("g", null, open);
      el("circle", { r: sp.kind === "owl" ? 14 : 12.5, fill: PAL.ink }, pupil);
      el("circle", { cx: -4.5, cy: -6, r: 4.6, fill: "#fff" }, pupil);
      var happyE = el("path", { d: "M-15 6Q0 -14 15 6", fill: "none", stroke: PAL.ink, "stroke-width": 7.5, "stroke-linecap": "round" }, eg);
      var brow = el("line", { x1: -12, y1: 0, x2: 12, y2: 0, stroke: sp.kind === "owl" ? shade(sp.body, 0.45) : shade(sp.body, 0.55), "stroke-width": sp.kind === "owl" ? 8 : 6.5, "stroke-linecap": "round" }, face);
      return { g: eg, open: open, pupil: pupil, happy: happyE, brow: brow, k: k };
    });
    var cheeks = [-1, 1].map(function (k) { return el("ellipse", { cx: 58 * k, cy: 16, rx: 13, ry: 8, fill: "#FF7AA8" }, face); });
    var mouth = {};
    if (sp.kind === "blob") {
      mouth.cav = el("ellipse", { cx: 0, cy: 22, rx: 13, ry: 2, fill: "#1E5A40" }, face);
      mouth.smile = el("path", { d: "M-12 18Q0 30 12 18", fill: "none", stroke: "#1E5A40", "stroke-width": 5, "stroke-linecap": "round" }, face);
    } else {
      var bk = el("g", { transform: tr(0, 12) }, face);
      mouth.cav = el("ellipse", { cx: 0, cy: 8, rx: 12, ry: 1, fill: "#8A1E3A" }, bk);
      mouth.low = el("path", { d: "M-12 4Q0 2 12 4Q6 14 0 20Q-6 14 -12 4Z", fill: shade(sp.beak, 0.14) }, bk);
      el("path", { d: "M-18 -2Q0 -12 18 -2Q8 10 0 18Q-8 10 -18 -2Z", fill: sp.beak }, bk);
    }
    var a = new Actor(g, false, { r: 112, layer: st.layerOf.has(parent) ? st.layerOf.get(parent) : null, kind: "creature", label: name });
    a.at(num(o.x, W / 2), num(o.y, H / 2)).size(num(o.size, 200) / 200);
    var R = V.makeRand(hash(name) + 5), blinkP = 3.1 + R() * 1.2, blinkPh = R() * 3;
    var feels = [], looks = [], waves = [], hops = [], talk = o.talk === undefined ? true : o.talk;
    var mood0 = EXPR[o.mood] ? o.mood : "neutral";
    var look0 = Array.isArray(o.look) ? [clamp(num(o.look[0], 0), -1, 1), clamp(num(o.look[1], 0), -1, 1)] : [0, 0];
    a.feel = function (expr, t) { if (EXPR[expr]) { feels.push({ e: expr, t: Math.max(0, num(t, 0)) }); feels.sort(function (x, y) { return x.t - y.t; }); } return a; };
    a.look = function (dx, dy, t) { looks.push({ v: [clamp(num(dx, 0), -1, 1), clamp(num(dy, 0), -1, 1)], t: Math.max(0, num(t, 0)) }); looks.sort(function (x, y) { return x.t - y.t; }); return a; };
    a.wave = function (t, dur) { waves.push({ t: Math.max(0, num(t, 0)), d: Math.max(0.4, num(dur, 1.6)) }); return a; };
    a.hop = function (t, n) { hops.push({ t: Math.max(0, num(t, 0)), n: clamp(Math.round(num(n, 1)), 1, 8) }); return a; };
    a.talk = function (v) { talk = v; return a; };
    function exprState(t) {
      var cur = mood0, prev = mood0, tc = -9;
      for (var i = 0; i < feels.length; i++) { if (feels[i].t <= t) { prev = cur; cur = feels[i].e; tc = feels[i].t; } }
      var q = smooth((t - tc) / 0.18), A = EXPR[prev], B = EXPR[cur], out = {};
      ["eye", "happy", "browY", "browL", "browR", "open", "tilt", "cheek"].forEach(function (k) { out[k] = lerp(A[k], B[k], q); });
      out.happy = q > 0.5 ? B.happy : A.happy;
      out.bounce = B.bounce || 0; out.look = B.look; out.e = cur; out.tc = tc;
      return out;
    }
    function lookAt(t) {
      var v = look0, pv = look0, tc = -9;
      for (var i = 0; i < looks.length; i++) if (looks[i].t <= t) { pv = v; v = looks[i].v; tc = looks[i].t; }
      var q = smooth((t - tc) / 0.25);
      return { v: [lerp(pv[0], v[0], q), lerp(pv[1], v[1], q)], tc: tc };
    }
    a.anim = function (t) {
      var E = exprState(t), L = lookAt(t);
      var look = E.look && E.tc >= L.tc ? E.look : L.v;
      // talking
      var tk = 0;
      if (talk === true) tk = talkAmount(t);
      else if (Array.isArray(talk) && t >= num(talk[0], 0) && t <= num(talk[1], D)) tk = talkAmount(t);
      var open = clamp(E.open + tk * 0.75 * (1 - E.open * 0.5), 0, 1);
      // body motion: hop, bounce, reaction squash, breathing
      var y = 0, sq = 0, i;
      for (i = 0; i < hops.length; i++) {
        var hp = (t - hops[i].t) / 0.42;
        if (hp >= 0 && hp < hops[i].n) { var f = hp - Math.floor(hp); y -= 40 * Math.sin(PI * f); if (f < 0.15 || f > 0.9) sq += 0.06; }
      }
      if (E.bounce) { y -= 16 * Math.abs(Math.sin(t * 7)); }
      var rq = (t - E.tc) / 0.38;
      if (rq >= 0 && rq < 1) { y -= 12 * Math.sin(PI * rq); sq -= 0.07 * Math.sin(PI * rq * 2) * (1 - rq); }
      var br = 0.012 * Math.sin(t * 2.2);
      var sx = 1 + br + sq, sy = 1 - br - sq;
      bob.setAttribute("transform", tr(0, y) + " rotate(" + f2(E.tilt) + ") translate(0 100) scale(" + f2(sx) + " " + f2(sy) + ") translate(0 -100)");
      shadow.setAttribute("rx", f2(70 * (1 + y / 160)));
      shadow.setAttribute("opacity", f2((GROUND_SH[st.world] ? 0.28 : 0.2) * (1 + y / 120)));
      // wings
      var flap = E.bounce ? 30 * Math.sin(t * 24) : 0;
      wings.forEach(function (w) {
        var ang = (3 + 3 * Math.sin(t * 2.6 + w.k)) * -w.k + flap * w.k;
        if (w.k > 0) for (var j = 0; j < waves.length; j++) {
          var wq = (t - waves[j].t) / waves[j].d;
          if (wq >= 0 && wq <= 1) { var env = smooth(Math.min(wq / 0.18, (1 - wq) / 0.18)); ang = lerp(ang, -140 + 24 * Math.sin((t - waves[j].t) * 13), env); }
        }
        w.g.setAttribute("transform", tr(w.x, w.y) + " rotate(" + f2(ang * (w.k > 0 ? 1 : -1) * (w.k > 0 ? 1 : -1)) + ")");
      });
      // eyes: blink, size, look
      var bk2 = mod(t + blinkPh, blinkP), blink = bk2 < 0.14 ? 1 - 0.9 * Math.sin((PI * bk2) / 0.14) : 1;
      eyes.forEach(function (e) {
        e.g.setAttribute("transform", tr(eyeX * e.k, eyeY) + " scale(" + f2(E.eye) + " " + f2(E.eye * blink) + ")");
        e.open.style.display = E.happy ? "none" : "";
        e.happy.style.display = E.happy ? "" : "none";
        e.pupil.setAttribute("transform", tr(look[0] * 7, look[1] * 8));
        var bAng = e.k < 0 ? E.browL : E.browR;
        e.brow.setAttribute("transform", tr(eyeX * e.k, eyeY - (sp.kind === "owl" ? 40 : 34) + E.browY) + " rotate(" + f2(bAng) + ")");
      });
      cheeks.forEach(function (c) { c.setAttribute("opacity", f2(E.cheek)); });
      if (sp.kind === "blob") {
        mouth.cav.setAttribute("ry", f2(2 + open * 13)); mouth.cav.setAttribute("cy", f2(22 + open * 4));
        mouth.cav.style.display = open > 0.08 ? "" : "none"; mouth.smile.style.display = open > 0.08 ? "none" : "";
        var bp = [], bq = [];
        for (var k2 = 0; k2 < 16; k2++) { var th = (k2 / 16) * TAU, rr = 100 + 4 * Math.sin(3 * th + t * 2) + 2.5 * Math.sin(5 * th - t * 1.6); var yy = Math.sin(th) * rr; if (yy > 80) yy = 80 + (yy - 80) * 0.4; bp.push([Math.cos(th) * rr, yy]); bq.push([Math.cos(th) * rr * 0.93 - 6, yy * 0.93 - 7]); }
        bodyBack.setAttribute("d", smoothPath(bp)); bodyMain.setAttribute("d", smoothPath(bq));
        parts.bulb.setAttribute("r", f2(10 + 2.5 * Math.sin(t * 4)));
        top.setAttribute("transform", "rotate(" + f2(6 * Math.sin(t * 1.7)) + " 0 -94)");
      } else {
        mouth.cav.setAttribute("ry", f2(1 + open * 12));
        mouth.low.setAttribute("transform", tr(0, open * 12));
        top.setAttribute("transform", "rotate(" + f2(4 * Math.sin(t * 1.9)) + " 0 -94)");
        if (parts.tail) parts.tail.setAttribute("transform", tr(70, 34) + " rotate(" + f2(5 * Math.sin(t * 2.3)) + ")");
      }
    };
    return a;
  }
  // Cheap static mini creature for crowds (radius about 40). g.__paint(color) recolours it.
  function mini(parent, color, variant) {
    need();
    var c = col(color, "sun"), v = Math.abs(Math.round(num(variant, 0))) % 4;
    var g = el("g", { class: "fv-mini" }, parent || st.ctx.world);
    var deco = el("g", null, g);
    if (v === 0) el("path", { d: "M-2 -34C-8 -50 6 -56 9 -46", fill: "none", stroke: shade(c, 0.2), "stroke-width": 5, "stroke-linecap": "round" }, deco);
    else if (v === 1) [-8, 0, 8].forEach(function (x) { el("ellipse", { cx: x, cy: -40, rx: 4.5, ry: 10, fill: "#FF7AC6", transform: "rotate(" + x * 3 + " " + x + " -34)" }, deco); });
    else if (v === 2) [-1, 1].forEach(function (k) { el("path", { d: "M" + -26 * k + " -24L" + -22 * k + " -48L" + -10 * k + " -34Z", fill: shade(c, 0.2) }, deco); });
    else { el("line", { x1: 0, y1: -36, x2: 3, y2: -52, stroke: shade(c, 0.2), "stroke-width": 3 }, deco); el("circle", { cx: 3, cy: -54, r: 5, fill: "#FFD43B" }, deco); }
    var b1 = el("circle", { r: 38, fill: shade(c, 0.2) }, g);
    var b2 = el("circle", { cx: -3, cy: -3, r: 35, fill: c }, g);
    var be = el("ellipse", { cx: 0, cy: 16, rx: 22, ry: 17, fill: tint(c, 0.6) }, g);
    [-1, 1].forEach(function (k) { el("circle", { cx: 12 * k, cy: -6, r: 5.5, fill: PAL.ink }, g); el("circle", { cx: 12 * k - 1.6, cy: -8, r: 1.8, fill: "#fff" }, g); });
    el("path", { d: "M-6 3L6 3L0 11Z", fill: "#FF9F43", stroke: "#FF9F43", "stroke-width": 2, "stroke-linejoin": "round" }, g);
    g.__paint = function (cc) { cc = col(cc); b1.setAttribute("fill", shade(cc, 0.2)); b2.setAttribute("fill", cc); be.setAttribute("fill", tint(cc, 0.6)); };
    return g;
  }

  // ------------------------- shapes for morphing (matched 120-point outlines) -------------------------
  var NPT = 120;
  function polar(f, n) { var pts = []; n = n || 240; for (var i = 0; i < n; i++) { var a = -PI / 2 + (i / n) * TAU, r = f(a); pts.push([Math.cos(a) * r, Math.sin(a) * r]); } return pts; }
  function insideShape(s, x, y) {
    if (s.c) { var dx = x - s.x, dy = y - s.y; return dx * dx + dy * dy <= s.r * s.r; }
    var ca = Math.cos(-s.rot || 0), sa = Math.sin(-s.rot || 0), px = (x - s.x) * ca - (y - s.y) * sa, py = (x - s.x) * sa + (y - s.y) * ca;
    return (px * px) / (s.rx * s.rx) + (py * py) / (s.ry * s.ry) <= 1;
  }
  function unionPolar(shapes, cx, cy) {
    return polar(function (a) {
      var best = 0.05;
      for (var d = 0.01; d < 2.2; d += 0.006) { var x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d; for (var i = 0; i < shapes.length; i++) if (insideShape(shapes[i], x, y)) { best = d; break; } }
      return best;
    }).map(function (p) { return [p[0] + cx, p[1] + cy]; });
  }
  function bez(p0, p1, p2, n) { var out = []; for (var i = 0; i < n; i++) { var t = i / n; out.push([(1 - t) * (1 - t) * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) * (1 - t) * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]]); } return out; }
  function arcPts(cx, cy, r, a0, a1, n) { var out = []; for (var i = 0; i < n; i++) { var a = a0 + ((a1 - a0) * i) / n; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return out; }
  var SHAPES_RAW = {
    circle: function () { return polar(function () { return 1; }); },
    blob: function () { return polar(function (a) { return 1 + 0.12 * Math.sin(3 * a) + 0.07 * Math.sin(5 * a + 1); }); },
    star: function () { var p = []; for (var i = 0; i < 10; i++) { var a = -PI / 2 + (i * PI) / 5, r = i % 2 ? 0.44 : 1; p.push([Math.cos(a) * r, Math.sin(a) * r]); } return p; },
    sparkle: function () { return bez([0, -1], [0.16, -0.16], [1, 0], 30).concat(bez([1, 0], [0.16, 0.16], [0, 1], 30), bez([0, 1], [-0.16, 0.16], [-1, 0], 30), bez([-1, 0], [-0.16, -0.16], [0, -1], 30)); },
    heart: function () { var p = []; for (var i = 0; i < 200; i++) { var t = (i / 200) * TAU; p.push([16 * Math.pow(Math.sin(t), 3), -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t))]); } return p; },
    drop: function () { var p = []; for (var i = 0; i < 200; i++) { var t = (i / 200) * TAU; p.push([0.78 * Math.sin(t) * Math.sin(t / 2), -Math.cos(t)]); } return p; },
    leaf: function () { var p = []; for (var i = 0; i < 200; i++) { var t = (i / 200) * TAU, x = 0.58 * Math.sin(t) * Math.pow(Math.abs(Math.sin(t)), 0.35), y = -Math.cos(t), a = 0.6; p.push([x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]); } return p; },
    cloud: function () { return unionPolar([{ c: 1, x: -0.55, y: 0.12, r: 0.36 }, { c: 1, x: -0.12, y: -0.12, r: 0.48 }, { c: 1, x: 0.38, y: -0.02, r: 0.42 }, { c: 1, x: 0.68, y: 0.2, r: 0.26 }, { rx: 0.9, ry: 0.22, x: 0.05, y: 0.25, rot: 0 }], 0.02, 0.08); },
    hexagon: function () { var p = []; for (var i = 0; i < 6; i++) { var a = -PI / 2 + (i * TAU) / 6; p.push([Math.cos(a), Math.sin(a)]); } return p; },
    triangle: function () { var p = []; for (var i = 0; i < 3; i++) { var a = -PI / 2 + (i * TAU) / 3; p.push([Math.cos(a), Math.sin(a)]); } return p; },
    square: function () { return polar(function (a) { return 0.9 * Math.pow(Math.pow(Math.abs(Math.cos(a)), 5) + Math.pow(Math.abs(Math.sin(a)), 5), -0.2); }); },
    bolt: function () { return [[0.18, -1], [-0.56, 0.12], [-0.06, 0.12], [-0.22, 1], [0.56, -0.16], [0.06, -0.16]]; },
    moon: function () {
      var c1 = [0, 0, 1], c2 = [0.48, -0.22, 0.86], out = [], inn = [];
      for (var i = 0; i < 360; i++) { var a = -PI / 2 + (i / 360) * TAU, x = Math.cos(a), y = Math.sin(a); if (Math.hypot(x - c2[0], y - c2[1]) > c2[2]) out.push([x, y]); }
      for (i = 0; i < 360; i++) { var b = (i / 360) * TAU, x2 = c2[0] + Math.cos(b) * c2[2], y2 = c2[1] + Math.sin(b) * c2[2]; if (Math.hypot(x2, y2) < c1[2]) inn.push([x2, y2, b]); }
      // order the outer arc so it is contiguous, then the inner arc backwards
      var k = 0; for (i = 1; i < out.length; i++) if (Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]) > 0.1) { k = i; break; }
      out = out.slice(k).concat(out.slice(0, k));
      inn.sort(function (p, q) { return mod(p[2] - PI / 2, TAU) - mod(q[2] - PI / 2, TAU); });
      var last = out[out.length - 1], i0 = inn[0], i1 = inn[inn.length - 1];
      if (Math.hypot(i0[0] - last[0], i0[1] - last[1]) > Math.hypot(i1[0] - last[0], i1[1] - last[1])) inn.reverse();
      return out.concat(inn.map(function (p) { return [p[0], p[1]]; }));
    },
    flower: function () { return polar(function (a) { return 0.52 + 0.48 * Math.pow(Math.abs(Math.cos(2.5 * (a + PI / 2))), 0.7); }); },
    gear: function () { return polar(function (a) { return 0.8 + 0.2 * Math.tanh(4 * Math.sin(10 * a)); }); },
    house: function () { return [[0, -1], [0.98, -0.12], [0.74, -0.12], [0.74, 0.96], [-0.74, 0.96], [-0.74, -0.12], [-0.98, -0.12]]; },
    arrow: function () { return [[-0.95, -0.28], [0.15, -0.28], [0.15, -0.68], [0.98, 0], [0.15, 0.68], [0.15, 0.28], [-0.95, 0.28]]; },
    person: function () {
      var hc = [0, -0.6], hr = 0.34, a0 = Math.asin(0.16 / hr);
      var head = arcPts(hc[0], hc[1], hr, PI / 2 + a0, PI / 2 + TAU - a0, 60);
      return head.concat(bez([0.16, -0.3], [0.62, -0.26], [0.7, 0.1], 20), [[0.7, 0.98], [-0.7, 0.98]], bez([-0.7, 0.1], [-0.62, -0.26], [-0.16, -0.3], 20));
    },
    planet: function () { return unionPolar([{ c: 1, x: 0, y: 0, r: 0.66 }, { rx: 1, ry: 0.17, x: 0, y: 0, rot: -0.32 }], 0, 0); },
    rocket: function () { return bez([0, -1], [0.3, -0.75], [0.3, -0.35], 24).concat([[0.3, 0.4], [0.62, 0.78], [0.6, 0.96], [0.3, 0.78], [0.16, 0.96], [-0.16, 0.96], [-0.3, 0.78], [-0.6, 0.96], [-0.62, 0.78], [-0.3, 0.4]], bez([-0.3, -0.35], [-0.3, -0.75], [0, -1], 24)); },
    brain: function () { return polar(function (a) { var d = mod(a + PI / 2 + PI, TAU) - PI; return (0.9 + 0.06 * Math.sin(9 * a)) * (1 - 0.14 * Math.exp(-(d * d) / 0.05)); }).map(function (p) { return [p[0], p[1] * 0.8]; }); },
    virus: function () { var s = [{ c: 1, x: 0, y: 0, r: 0.64 }]; for (var i = 0; i < 10; i++) { var a = (i / 10) * TAU; s.push({ c: 1, x: Math.cos(a) * 0.86, y: Math.sin(a) * 0.86, r: 0.14 }); s.push({ rx: 0.2, ry: 0.05, x: Math.cos(a) * 0.72, y: Math.sin(a) * 0.72, rot: a }); } return unionPolar(s, 0, 0); },
    cell: function () { return polar(function (a) { return 1 + 0.06 * Math.sin(4 * a + 0.5) + 0.04 * Math.sin(7 * a); }); },
    shield: function () { return bez([-0.8, -0.72], [0, -1.05], [0.8, -0.72], 30).concat([[0.8, -0.72]], bez([0.8, -0.1], [0.72, 0.6], [0, 1], 30), bez([0, 1], [-0.72, 0.6], [-0.8, -0.1], 30)); },
    crown: function () { return [[-0.92, -0.56], [-0.46, -0.02], [0, -0.82], [0.46, -0.02], [0.92, -0.56], [0.76, 0.62], [-0.76, 0.62]]; },
    fish: function () {
      var cx = -0.12, rx = 0.74, ry = 0.5, a0 = 0.5, pts = [];
      for (var i = 0; i <= 120; i++) { var a = a0 + ((TAU - 2 * a0) * i) / 120; pts.push([cx + Math.cos(a) * rx, Math.sin(a) * ry]); }
      return pts.concat([[0.98, -0.52], [0.82, 0], [0.98, 0.52]]);
    },
  };
  // tree: canopy then trunk; bulb: glass then base
  SHAPES_RAW.tree = function () {
    var cy = -0.28, r = 0.72, gap = Math.asin(0.2 / r), can = [];
    for (var i = 0; i <= 120; i++) { var a = PI / 2 + gap + ((TAU - 2 * gap) * i) / 120, rr = r * (1 + 0.08 * Math.sin(7 * a)); can.push([Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
    return can.concat([[0.2, 1], [-0.2, 1]]);
  };
  SHAPES_RAW.bulb = function () {
    var cy = -0.3, r = 0.66, pts = [], start = PI / 2 + Math.asin(0.3 / r), end = PI / 2 - Math.asin(0.3 / r) + TAU;
    for (var i = 0; i <= 100; i++) { var a = start + ((end - start) * i) / 100; pts.push([Math.cos(a) * r, cy + Math.sin(a) * r]); }
    return pts.concat([[0.28, 0.6], [0.26, 0.98], [-0.26, 0.98], [-0.28, 0.6]]);
  };
  var SHAPE_NAMES = Object.keys(SHAPES_RAW);
  var shapeCache = {};
  function resample(pts, n) {
    var L = [0], i;
    for (i = 1; i <= pts.length; i++) { var a = pts[i - 1], b = pts[i % pts.length]; L.push(L[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    var total = L[pts.length], out = [], j = 0;
    for (i = 0; i < n; i++) {
      var s = (i / n) * total;
      while (j < pts.length - 1 && L[j + 1] < s) j++;
      var p = pts[j], q = pts[(j + 1) % pts.length], f = (s - L[j]) / Math.max(1e-9, L[j + 1] - L[j]);
      out.push([lerp(p[0], q[0], f), lerp(p[1], q[1], f)]);
    }
    return out;
  }
  function shapePts(name) {
    name = SHAPES_RAW[name] ? name : "circle";
    if (shapeCache[name]) return shapeCache[name];
    var raw = SHAPES_RAW[name]();
    var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    raw.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); });
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, k = 1 / Math.max((x1 - x0) / 2, (y1 - y0) / 2);
    var pts = resample(raw.map(function (p) { return [(p[0] - cx) * k, (p[1] - cy) * k]; }), NPT);
    var area = 0;
    for (var i = 0; i < pts.length; i++) { var a = pts[i], b = pts[(i + 1) % pts.length]; area += a[0] * b[1] - b[0] * a[1]; }
    if (area < 0) pts.reverse();
    var best = 0, bd = 1e9;
    pts.forEach(function (p, i) { var d = Math.abs(mod(Math.atan2(p[1], p[0]) + PI / 2 + PI, TAU) - PI); if (d < bd) { bd = d; best = i; } });
    pts = pts.slice(best).concat(pts.slice(0, best));
    return (shapeCache[name] = pts);
  }
  function shapePath(name, scale) { var s = num(scale, 100); return smoothPath(shapePts(name).map(function (p) { return [p[0] * s, p[1] * s]; })); }

  function morph(steps, o) {
    need();
    o = o || {};
    var list = arr(steps).filter(Boolean).map(function (s, i) { return { pts: shapePts(str(s.shape).toLowerCase()), c: col(s.color, CYCLE[i % CYCLE.length]), at: Math.max(0, num(s.at, 0.3 + i * 1.5)) }; });
    if (!list.length) list = [{ pts: shapePts("circle"), c: PAL.violet, at: 0.3 }];
    list.sort(function (a, b) { return a.at - b.at; });
    var dur = Math.max(0.2, num(o.dur, 0.75));
    var parent = o.parent || st.ctx.world;
    var g = el("g", { class: "fv-morph" }, parent), inner = el("g", null, g);
    var pS = el("path", null, inner), pM = el("path", null, inner), pH = el("path", { opacity: 0.55 }, inner);
    var faceG = o.face ? el("g", null, inner) : null;
    if (faceG) cuteFace(faceG, 0, 0, 2.3);
    var a = new Actor(g, false, { r: 100, layer: st.layerOf.has(parent) ? st.layerOf.get(parent) : null, kind: "morph", label: "morph" });
    a.at(num(o.x, W / 2), num(o.y, H / 2)).size(num(o.size, 300) / 200);
    a.steps = list;
    a.anim = function (t) {
      var i = 0;
      for (var k = 0; k < list.length; k++) if (list[k].at <= t) i = k;
      var A = list[Math.max(0, i - 1)], B = list[i], q = i === 0 ? 1 : clamp((t - B.at) / dur, 0, 1);
      if (i > 0 && t >= B.at + dur) { A = B; q = 1; }
      var e = EASE.inOut(q), sw = Math.sin(PI * e) * 0.5 * (i % 2 ? -1 : 1), cs = Math.cos(sw), sn = Math.sin(sw);
      var bul = 1 + 0.07 * Math.sin(PI * e);
      var pts = [];
      for (k = 0; k < NPT; k++) {
        var x = lerp(A.pts[k][0], B.pts[k][0], e), y = lerp(A.pts[k][1], B.pts[k][1], e), th = (k / NPT) * TAU;
        var wob = 1 + 0.014 * Math.sin(th * 3 + t * 2.2) + 0.008 * Math.sin(th * 5 - t * 3);
        pts.push([(x * cs - y * sn) * 100 * bul * wob, (x * sn + y * cs) * 100 * bul * wob]);
      }
      var d = smoothPath(pts), c = mix(A.c, B.c, e);
      pS.setAttribute("d", d); pS.setAttribute("fill", shade(c, 0.26)); pS.setAttribute("transform", tr(5, 8));
      pM.setAttribute("d", d); pM.setAttribute("fill", c);
      pH.setAttribute("d", d); pH.setAttribute("fill", tint(c, 0.3)); pH.setAttribute("transform", tr(-9, -11) + " scale(0.74)");
      var q2 = (t - B.at - dur) / 0.55, sq = i > 0 && q2 >= 0 && q2 < 1 ? 0.11 * Math.sin(q2 * PI * 2) * (1 - q2) : 0;
      inner.setAttribute("transform", "scale(" + f2(1 + sq) + " " + f2(1 - sq) + ")");
    };
    return a;
  }

  // ------------------------- zoom through scales -------------------------
  function zoomThrough(ctx, levels, o) {
    need();
    o = o || {};
    ctx = ctx || st.ctx;
    var K = Math.max(2, num(o.K, 7)), dur = Math.max(0.4, num(o.dur, 1.6)), m = Math.min(W, H);
    var lv = arr(levels).filter(Boolean).slice(0, 6);
    if (!lv.length) lv = [{ illus: "galaxy" }];
    var n = lv.length;
    var times = arr(o.times).slice(0, n - 1).map(function (x) { return num(x, null); });
    var def = spread(times.concat([]).slice(0, n - 1).map(function (x) { return x == null ? null : x; }), 0.8, endT(dur));
    times = def;
    var root = el("g", { class: "fv-zoom" }, ctx.bg);
    var out = { levels: [], times: times, K: K };
    lv.forEach(function (L, i) {
      var g = el("g", null, root), inner = el("g", null, g), ring = el("path", { fill: "none", stroke: "#FFFFFF", opacity: 0.75 }, g);
      var clipId = uid("p"), cp = el("clipPath", { id: clipId }, st.defs), cpath = el("path", { d: "M0 0" }, cp);
      if (i > 0) inner.setAttribute("clip-path", "url(#" + clipId + ")");
      var wn = worldName(L.world || worldFor(L.illus));
      var wg = el("g", { transform: tr(-W / 2, -H / 2) }, inner);
      var wb = buildWorld(wn, { bg: wg, far: wg, mid: wg, world: wg }, W, H, V.makeRand(17 + i * 101));
      wb.fns.forEach(function (f) { st.fns.push(f); });
      var size = clamp(num(L.size, 0.52), 0.15, 0.9) * m;
      var hero = illus(L.illus || "planet", { parent: inner, x: 0, y: 0, size: size, color: L.color, shadow: "glow" });
      hero.inspectable = false;
      hero.float(6, 4.2, 1.5);
      var fc = arr(L.focus);
      var focus = [num(fc[0], 0) * (size / 200), num(fc[1], 0) * (size / 200)];
      out.levels.push({ g: g, inner: inner, hero: hero, ring: ring, cpath: cpath, focus: focus, size: size, world: wn });
    });
    function levelAt(t) {
      var L = 0;
      for (var i = 0; i < times.length; i++) L += EASE.inOut(clamp((t - times[i]) / dur, 0, 1));
      return clamp(L, 0, n - 1);
    }
    out.level = levelAt;
    out.z = function (t) { return Math.pow(K, levelAt(t)); };
    var diag = Math.hypot(W, H) * 0.56;
    st.fns.push(function (t) {
      var L = levelAt(t), i0 = Math.min(n - 1, Math.floor(L + 1e-6)), q = L - i0;
      if (i0 === n - 1) q = 0;
      out.levels.forEach(function (lev, i) {
        if (i < i0 || i > i0 + 1 || (i === i0 + 1 && q <= 0.002) || (i === i0 && q > 0.985)) { lev.g.style.display = "none"; return; }
        lev.g.style.display = "";
        var A = out.levels[i0], s = Math.pow(K, q), px = W / 2 - A.focus[0] * s * q, py = H / 2 - A.focus[1] * s * q;
        if (i === i0) {
          lev.g.setAttribute("transform", tr(px, py) + " scale(" + s.toFixed(5) + ")"); lev.ring.style.display = "none";
          if (i > 0) lev.cpath.setAttribute("d", "M" + f2(-W * 4) + " " + f2(-H * 4) + "H" + f2(W * 4) + "V" + f2(H * 4) + "H" + f2(-W * 4) + "Z");
          return;
        }
        var s1 = s / K, fx = px + A.focus[0] * s, fy = py + A.focus[1] * s;
        lev.g.setAttribute("transform", tr(fx, fy) + " scale(" + s1.toFixed(5) + ")");
        var rs = Math.max((A.size / 2) * s * 0.48 * smooth(q / 0.22), diag * smooth((q - 0.42) / 0.5));
        var rl = rs / s1, pts = [];
        for (var k = 0; k < 28; k++) { var th = (k / 28) * TAU, rr = rl * (1 + 0.05 * Math.sin(5 * th + t * 4) + 0.03 * Math.sin(3 * th - t * 3)); pts.push([Math.cos(th) * rr, Math.sin(th) * rr]); }
        var d = smoothPath(pts);
        lev.cpath.setAttribute("d", d);
        lev.ring.setAttribute("d", d);
        lev.ring.setAttribute("stroke-width", f2(7 / s1));
        lev.ring.style.display = q < 0.9 ? "" : "none";
        lev.ring.setAttribute("opacity", f2(0.75 * (1 - smooth((q - 0.6) / 0.3))));
      });
    });
    return out;
  }

  // ------------------------- particles, bursts, connectors -------------------------
  function particles(ctx, o) {
    need();
    ctx = ctx || st.ctx;
    o = o || {};
    var fn = makeParticles(o.parent || ctx.fx, o, W, H);
    st.fns.push(fn);
    return fn;
  }
  function burst(ctx, x, y, t, o) {
    need();
    ctx = ctx || st.ctx;
    o = o || {};
    var radius = num(o.radius, 140), count = clamp(Math.round(num(o.count, 10)), 0, 40), size = num(o.size, 16);
    var colors = (arr(o.colors).length ? arr(o.colors) : ["#FFD43B", "#FF7AC6", "#5CE1E6", "#FFFFFF", "#3DDC97"]).map(function (c) { return col(c, "#FFFFFF"); });
    var t0 = Math.max(0, num(t, 0.5)), life = 0.85;
    var g = el("g", { transform: tr(num(x, W / 2), num(y, H / 2)) }, o.parent || ctx.front);
    var ring = el("circle", { r: 1, fill: "none", stroke: colors[0], "stroke-width": 10 }, g);
    var ring2 = el("circle", { r: 1, fill: "none", stroke: "#FFFFFF", "stroke-width": 4 }, g);
    var R = V.makeRand(hash("b" + x + y + t0));
    var sps = [];
    for (var i = 0; i < count; i++) sps.push({ n: el("path", { d: i % 3 === 2 ? "M0 0" : sparkleD(size * (0.6 + R() * 0.7)), fill: colors[i % colors.length] }, g), dot: i % 3 === 2 ? el("circle", { r: f2(size * 0.32), fill: colors[(i + 1) % colors.length] }, g) : null, a: (i / count) * TAU + R() * 0.4, d: radius * (0.75 + R() * 0.5) });
    g.style.display = "none";
    st.fns.push(function (tt) {
      var p = (tt - t0) / life;
      if (p < 0 || p > 1) { g.style.display = "none"; return; }
      g.style.display = "";
      var e = EASE.outCubic(p);
      ring.setAttribute("r", f2(radius * 0.85 * e)); ring.setAttribute("stroke-width", f2(12 * (1 - p))); ring.setAttribute("opacity", f2(1 - p));
      ring2.setAttribute("r", f2(radius * 0.6 * EASE.outCubic(Math.min(1, p * 1.3)))); ring2.setAttribute("opacity", f2(Math.max(0, 1 - p * 1.6)));
      sps.forEach(function (s) {
        var d = s.d * e, sx = Math.cos(s.a) * d, sy = Math.sin(s.a) * d, sc = Math.max(0, 1 - p) * (p < 0.15 ? p / 0.15 : 1);
        var tf = tr(sx, sy) + " rotate(" + f2(p * 160) + ") scale(" + f2(sc) + ")";
        (s.dot || s.n).setAttribute("transform", tf);
      });
    });
    return { g: g, at: t0 };
  }
  function connector(ctx, x1, y1, x2, y2, o) {
    need();
    ctx = ctx || st.ctx;
    o = o || {};
    x1 = num(x1, 0); y1 = num(y1, 0); x2 = num(x2, 100); y2 = num(y2, 0);
    var at = Math.max(0, num(o.at, 0.5)), dur = Math.max(0.1, num(o.dur, 0.7)), bend = num(o.bend, 0.2);
    var c = col(o.color, "#FFFFFF"), w = Math.max(2, num(o.width, 8));
    var dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    var cx = (x1 + x2) / 2 - (dy / len) * bend * len, cy = (y1 + y2) / 2 + (dx / len) * bend * len;
    function point(q) { q = clamp(num(q, 0), 0, 1); var u = 1 - q; return [u * u * x1 + 2 * u * q * cx + q * q * x2, u * u * y1 + 2 * u * q * cy + q * q * y2]; }
    var parent = o.parent || ctx.world;
    var g = el("g", { class: "fv-connector" }, null);
    if (!o.parent && st.worldBase != null && parent.childNodes[st.worldBase]) parent.insertBefore(g, parent.childNodes[st.worldBase]); else parent.appendChild(g);
    var d = "M" + P2(x1, y1) + "Q" + P2(cx, cy) + " " + P2(x2, y2);
    var path = el("path", { d: d, fill: "none", stroke: "none" }, g);
    var gap = o.dash != null ? Math.max(w * 1.2, num(o.dash, w * 2.6)) : w * 2.6;
    var nd = Math.max(2, Math.floor(len / gap)), dots = [];
    for (var i = 0; i <= nd; i++) { var q = i / nd, p = point(q); dots.push({ q: q, n: el("circle", { cx: f2(p[0]), cy: f2(p[1]), r: f2(w / 2), fill: c }, g) }); }
    var pe = point(1), pb = point(0.96), ang = (Math.atan2(pe[1] - pb[1], pe[0] - pb[0]) * 180) / PI;
    var head = el("path", { d: "M" + f2(w * 1.6) + " 0L" + f2(-w * 1.2) + " " + f2(-w * 1.5) + "L" + f2(-w * 1.2) + " " + f2(w * 1.5) + "Z", fill: c, stroke: c, "stroke-width": f2(w * 0.4), "stroke-linejoin": "round" }, g);
    var hx = pe[0], hy = pe[1], gone = null;
    st.fns.push(function (t) {
      var p = clamp((t - at) / dur, 0, 1), fade = gone == null ? 1 : 1 - clamp((t - gone) / 0.4, 0, 1);
      g.style.display = p <= 0 || fade <= 0 ? "none" : "";
      if (p <= 0 || fade <= 0) return;
      if (fade < 1) g.setAttribute("opacity", f2(fade)); else g.removeAttribute("opacity");
      for (var i = 0; i < dots.length; i++) { var k = clamp((p - dots[i].q) * 14, 0, 1); dots[i].n.setAttribute("r", f2((w / 2) * EASE.outBack(k))); dots[i].n.style.display = k > 0 ? "" : "none"; }
      var hk = clamp((p - 0.92) / 0.08, 0, 1);
      head.style.display = hk > 0 && o.head !== false ? "" : "none";
      head.setAttribute("transform", tr(hx, hy) + " rotate(" + f2(ang) + ") scale(" + f2(EASE.outBack(hk)) + ")");
    });
    var res = { path: path, d: d, g: g, mid: point(0.5), point: point, len: len };
    res.exit = function (t) { gone = Math.max(0, num(t, D)); return res; };
    return res;
  }

  // ------------------------- friendly type (HTML layer) -------------------------
  function uiParent(ctx) { return (ctx && ctx.ui) || need().ctx.ui; }
  function textActor(node, label, kind) {
    var a = new Actor(node, true, { kind: kind || "text", label: label, layer: "ui" });
    return a;
  }
  function fmtNum(n, dec) {
    var s = Math.abs(n).toFixed(dec), parts = s.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (n < 0 && +s !== 0 ? "-" : "") + parts.join(".");
  }
  function say(ctx, text, o) {
    o = o || {};
    var sa = (ctx && ctx.safe) || safeArea();
    var lay = layoutText(text, { size: num(o.size, 96), maxWidth: num(o.maxWidth, sa.w), maxLines: num(o.maxLines, 3), weight: o.weight || 800, lineHeight: o.lineHeight });
    var div = hel("div", "fv-say" + (o.shadow === false ? " fv-noshadow" : o.outline ? " fv-outline" : ""), uiParent(ctx));
    div.style.fontSize = f2(lay.size * UNIT) + "px";
    div.style.lineHeight = String(lay.lh);
    div.style.fontWeight = String(lay.weight);
    if (o.align) div.style.textAlign = o.align;
    if (o.color) div.style.color = col(o.color, "#FFFFFF");
    div.style.width = f2((lay.w + lay.size * 0.12) * UNIT) + "px";
    var spans = [];
    lay.lines.forEach(function (ln) {
      var ld = hel("div", "fv-line", div);
      ln.toks.forEach(function (tk, i) {
        if (i) ld.appendChild(doc.createTextNode(" "));
        var sp = hel("span", "fv-word" + (tk.em ? " fv-em" : ""), ld);
        if (tk.em && o.em) sp.style.color = col(o.em, "sun");
        sp.textContent = tk.t;
        spans.push({ n: sp, t: tk.t });
      });
    });
    var at = Math.max(0, num(o.at, 0.3)), stg = Math.max(0, num(o.stagger, 0.07)), prev = at - 0.6;
    spans.forEach(function (s, i) {
      var ti = at + i * stg;
      if (o.sync) { var f = V.find(s.t, Math.max(0, prev)); if (f != null && f >= at - 0.6) { ti = Math.max(at, f - 0.08); prev = f + 0.01; } }
      if (i && ti < spans[i - 1].ti) ti = spans[i - 1].ti;
      s.ti = ti;
    });
    var a = textActor(div, str(text).replace(/\*/g, ""), "text");
    a.at(num(o.x, W / 2), num(o.y, H / 2));
    a.w = lay.w; a.h = lay.h; a.size = lay.size; a.lines = lay.n; a.firstT = spans.length ? spans[0].ti : at;
    a.lastT = spans.length ? spans[spans.length - 1].ti + 0.5 : at;
    a.hook(function (t) {
      for (var i = 0; i < spans.length; i++) {
        var s = spans[i], p = (t - s.ti) / 0.5, st2;
        if (p < 0) st2 = "h"; else if (p >= 1) st2 = "d"; else st2 = "a";
        if (st2 === "h") { if (s.st !== "h") { s.n.style.opacity = "0"; s.st = "h"; } continue; }
        if (st2 === "d") { if (s.st !== "d") { s.n.style.opacity = ""; s.n.style.transform = ""; s.st = "d"; } continue; }
        s.st = "a";
        s.n.style.opacity = String(Math.min(1, p * 5).toFixed(3));
        var sc = p >= 1 ? 1 : 1 - Math.cos(p * PI * 2) * Math.exp(-6 * p);
        s.n.style.transform = "translateY(" + f2((1 - EASE.outCubic(Math.min(1, p * 1.4))) * 0.32) + "em) scale(" + sc.toFixed(4) + ")";
      }
    });
    return a;
  }
  function tag(ctx, text, o) {
    o = o || {};
    var sa = (ctx && ctx.safe) || safeArea(), tone = (ctx && ctx.tone) || (st && st.ctx && st.ctx.tone) || "dark";
    var size = num(o.size, 40), c = col(o.color, "sun");
    var padX = size * 0.6, padY = size * 0.3, dot = size * 0.42, gap = size * 0.34;
    var maxW = num(o.maxWidth, sa.w);
    var lay = layoutText(text, { size: size, maxWidth: Math.max(size * 2, maxW - padX * 2 - dot - gap), maxLines: num(o.maxLines, 2), weight: 700, lineHeight: 1.12 });
    var div = hel("div", "fv-tag" + (o.tone === "solid" ? " fv-solid" : o.tone === "light" || (tone === "light" && o.tone !== "dark") ? " fv-tag-light" : ""), uiParent(ctx));
    var fs = lay.size;
    div.style.fontSize = f2(fs * UNIT) + "px";
    div.style.padding = f2(padY * UNIT) + "px " + f2(padX * UNIT) + "px";
    div.style.borderRadius = f2((lay.n > 1 ? fs * 0.7 : fs) * UNIT) + "px";
    if (o.tone === "solid") { div.style.background = c; div.style.color = lum(c) > 0.62 ? PAL.ink : "#FFFFFF"; }
    var dt = hel("span", "fv-dot", div);
    dt.style.width = dt.style.height = f2(dot * UNIT) + "px";
    dt.style.marginRight = f2(gap * UNIT) + "px";
    dt.style.background = o.tone === "solid" ? "rgba(255,255,255,0.85)" : c;
    var tx = hel("span", "fv-tagtext", div);
    tx.style.width = f2((lay.w + 2) * UNIT) + "px";
    lay.lines.forEach(function (ln, i) {
      if (i) tx.appendChild(hel("br"));
      ln.toks.forEach(function (tk, j) { if (j) tx.appendChild(doc.createTextNode(" ")); var sp = hel("span", tk.em ? "fv-em" : "", tx); sp.textContent = tk.t; });
    });
    var a = textActor(div, str(text).replace(/\*/g, ""), "tag");
    a.at(num(o.x, W / 2), num(o.y, H / 2));
    a.w = lay.w + padX * 2 + dot + gap; a.h = lay.h + padY * 2; a.size = fs;
    a.enter(num(o.at, 0.3), o.enter || "pop", 0.55);
    a.firstT = num(o.at, 0.3);
    if (o.float !== false) a.float(3.5, 3.6, 0.6);
    return a;
  }
  function bigNumber(ctx, o) {
    o = o || {};
    var sa = (ctx && ctx.safe) || safeArea();
    var value = num(o.value, 0), from = num(o.from, 0), prefix = str(o.prefix), suffix = o.suffix == null ? "" : String(o.suffix);
    var dec = o.decimals != null ? clamp(Math.round(num(o.decimals, 0)), 0, 3) : Math.abs(value % 1) > 1e-9 ? Math.min(2, (String(value).split(".")[1] || "").length) : 0;
    var size = num(o.size, 260), maxW = num(o.maxWidth, sa.w);
    var wordy = suffix.trim().length > 2;
    var numStr = prefix + fmtNum(value, dec);
    function widthAt(s) { return textW(numStr, s, 900) + (suffix ? textW(suffix, wordy ? s * 0.42 : s * 0.7, 900) : 0); }
    for (var i = 0; i < 30 && widthAt(size) > maxW; i++) size *= 0.95;
    var div = hel("div", "fv-big", uiParent(ctx));
    div.style.fontSize = f2(size * UNIT) + "px";
    if (o.color) div.style.color = col(o.color, "sun");
    var ns = hel("span", "fv-bignum", div), ss = suffix ? hel("span", "fv-bigsuf" + (wordy ? " fv-wordy" : ""), div) : null;
    var nw = textW(numStr, size, 900);
    ns.style.width = f2(nw * 1.02 * UNIT) + "px";
    if (ss) { ss.textContent = suffix; ss.style.fontSize = wordy ? "0.42em" : "0.7em"; }
    var at = Math.max(0, num(o.at, 0.3)), dur = Math.max(0.1, num(o.dur, 1.6));
    var a = textActor(div, numStr + suffix, "number");
    a.at(num(o.x, W / 2), num(o.y, H / 2));
    a.w = widthAt(size); a.h = size * 1.05; a.size = size; a.firstT = at;
    a.enter(at, "pop", 0.6);
    var last = null;
    a.hook(function (t) {
      var p = clamp((t - at) / dur, 0, 1), v = lerp(from, value, EASE.outCubic(p));
      var s = prefix + fmtNum(p >= 1 ? value : v, dec);
      if (s !== last) { ns.textContent = s; last = s; }
    });
    return a;
  }

  // ------------------------- layout helpers for templates -------------------------
  function headline(ctx, title, o) {
    o = o || {};
    title = str(title);
    if (!title) return { h: 0, bottom: ctx.safe.y, a: null };
    var sa = ctx.safe, P = ctx.portrait;
    var size = num(o.size, P ? 86 : 80);
    var lay = layoutText(title, { size: size, maxWidth: num(o.maxWidth, sa.w * (P ? 1 : 0.86)), maxLines: num(o.maxLines, 2) });
    var y = num(o.top, sa.y) + lay.h / 2 + 4;
    var a = say(ctx, title, { x: num(o.x, W / 2), y: y, size: size, maxWidth: num(o.maxWidth, sa.w * (P ? 1 : 0.86)), maxLines: num(o.maxLines, 2), at: num(o.at, 0.25), stagger: 0.07 });
    a.float(2.5, 4.2, 0.3);
    return { h: lay.h + 8, bottom: y + lay.h / 2 + 4, a: a };
  }
  function itemTimes(labels, keywords, a, b) { return seqTimes(labels.map(str), keywords, a, b); }
  function T(p) { return p && typeof p === "object" ? p : {}; }
  function illusName(n, def) { n = str(n).toLowerCase(); return n || def || "planet"; }

  function tagDims(text, size, maxW, maxLines) {
    var padX = size * 0.6, padY = size * 0.3, dot = size * 0.42, gap = size * 0.34;
    var lay = layoutText(text, { size: size, maxWidth: Math.max(size * 2, maxW - padX * 2 - dot - gap), maxLines: maxLines || 2, weight: 700, lineHeight: 1.12 });
    return { w: lay.w + padX * 2 + dot + gap, h: lay.h + padY * 2 };
  }
  function standY(ctx, x, a, size) {
    // y for an actor of the given size standing on the ground (bottom on the hill surface)
    return ctx.groundY(x) - (a && a.bottom != null ? a.bottom : 100) * (size / 200) + 6;
  }
  function firstOf() { for (var i = 0; i < arguments.length; i++) if (arguments[i] != null && isFinite(arguments[i])) return arguments[i]; return null; }

  // ------------------------- templates -------------------------
  var TPL = {};

  TPL["title-landscape"] = function (root, p) {
    var setting = str(p.setting).toLowerCase() || "meadow";
    var ctx = scene(root, { world: setting }), sa = ctx.safe, P = !ctx.landscape, gy = ctx.groundY;
    var defHero = { space: "saturn", ocean: "fish", micro: "cell", night: "city", dusk: "mountain" }[ctx.worldName] || "house";
    var title = str(p.title) || "Welcome", sub = str(p.subtitle), kick = str(p.kicker);
    var heroN = illusName(p.hero, defHero), crN = CAST[p.creature] ? p.creature : "pip";
    var colW = P ? sa.w : sa.w * 0.54, tSize = P ? 116 : 110;
    var tl = layoutText(title, { size: tSize, maxWidth: colW, maxLines: 3 });
    var sl = sub ? layoutText(sub, { size: P ? 52 : 48, maxWidth: colW, maxLines: 2, weight: 700 }) : { h: 0 };
    var kd = kick ? tagDims(kick, 38, colW, 1) : { h: 0, w: 0 };
    var g1 = kick ? 28 : 0, g2 = sub ? 24 : 0, blockH = kd.h + g1 + tl.h + g2 + sl.h;
    var cx = P ? W / 2 : sa.x + colW / 2;
    var areaB = P ? sa.b : gy ? gy(cx) - 40 : sa.b;
    var top = P ? sa.y + 16 : sa.y + Math.max(0, (areaB - sa.y - blockH) / 2);
    var hs = P ? 540 : 440, cs = P ? 290 : 250;
    var crX, hx;
    if (P) { hs = Math.max(400, Math.min(hs, (gy ? gy(W * 0.64) : sa.b) - (top + blockH) - 70)); crX = sa.x + cs / 2 + 30; hx = Math.min(sa.r - hs / 2 - 10, W * 0.66); } else { crX = sa.x + colW + 140; hx = Math.min(sa.r - hs / 2 - 10, crX + cs / 2 + 40 + hs / 2); }
    var hero = illus(heroN, { x: hx, y: 0, size: hs, shadow: gy ? "ground" : undefined });
    var hy = gy ? standY(ctx, hx, hero, hs) : P ? sa.b - hs / 2 - 30 : sa.cy + 10;
    if (P) top = sa.y + 16 + Math.max(0, (hy - hs * 0.5 - 40 - (sa.y + 16) - blockH) * 0.4);
    hero.at(hx, hy).enter(0.5, gy ? "grow" : "pop", 0.8).float(gy ? 3 : 9, 4.4, gy ? 0.6 : 2);
    var cr = creature(crN, { x: crX, y: 0, size: cs, look: P ? [0.1, -0.7] : [-0.6, -0.4] });
    var cy = gy ? gy(crX) - 104 * (cs / 200) : P ? sa.b - cs * 0.6 : sa.cy + 180;
    cr.at(crX, cy).enter(0.25, gy ? "drop" : "pop", gy ? 0.95 : 0.6).float(gy ? 2 : 8, 3.6, 1.5);
    cr.feel("happy", 1.15).wave(1.25, 1.6).feel("neutral", 3.0).look(P ? 0.5 : 0.6, -0.1, 3.0);
    var y = top;
    if (kick) { tag(ctx, kick, { x: cx, y: y + kd.h / 2, size: 38, color: "coral", tone: "solid", at: 0.2, maxWidth: colW }); y += kd.h + g1; }
    say(ctx, title, { x: cx, y: y + tl.h / 2, size: tSize, maxWidth: colW, maxLines: 3, at: 0.32, stagger: 0.09 }).float(3, 4.8, 0.4);
    y += tl.h + g2;
    if (sub) {
      var ts = labelTime(sub, null, 0.8);
      var tsub = clamp(firstOf(ts, 1.3) - 0.15, 0.9, endT(0.8));
      say(ctx, sub, { x: cx, y: y + sl.h / 2, size: P ? 52 : 48, maxWidth: colW, maxLines: 2, weight: 700, color: "#FFF3D6", at: tsub, stagger: 0.05 });
      if (tsub > 3.2) cr.feel("excited", tsub + 0.1).feel("happy", tsub + 1.2);
    }
    S.particles(ctx, { kind: ctx.worldName === "sky" ? "dust" : ctx.worldName === "ocean" || ctx.worldName === "micro" ? "bubbles" : "stars", count: 14, opacity: 0.6 });
  };

  TPL["cosmic-zoom"] = function (root, p) {
    var ctx = scene(root, { world: "none" }), sa = ctx.safe, P = ctx.portrait, m = Math.min(W, H);
    ctx.cam.push = 0; ctx.cam.breathe = 0;
    var lv = arr(p.levels).filter(function (l) { return l && (l.illus || l.label); }).slice(0, 6);
    if (lv.length < 2) lv = lv.concat([{ illus: "galaxy", label: "Galaxy" }, { illus: "earth", label: "Earth" }]).slice(0, 2);
    var n = lv.length, labels = lv.map(function (l) { return str(l.label); });
    var lands = seqTimes(labels, null, 0.4, D * 0.8), minGap = 9;
    for (var i = 1; i < n; i++) minGap = Math.min(minGap, lands[i] - lands[i - 1]);
    var room = Math.max(0.3, endT(0) - 0.45), dur = clamp(Math.min(minGap * 0.85, room / Math.max(1, n - 1) / 0.95), 0.3, 1.7), times = [];
    for (i = 1; i < n; i++) times.push(Math.max(i === 1 ? 0.45 : times[i - 2] + dur * 0.95, lands[i] - dur * 0.7));
    var over = times.length ? times[times.length - 1] + dur - endT(0) : 0;
    if (over > 0) times = times.map(function (t, k) { return Math.max(0.45 + k * dur * 0.95, t - over); });
    var hsz = 0.5;
    var z = zoomThrough(ctx, lv.map(function (l) { return { illus: illusName(l.illus, "planet"), world: l.world, size: hsz }; }), { times: times, dur: dur, K: 7 });
    z.levels[0].hero.pop(0.15, 0.7);
    var title = str(p.title);
    if (title) { var hd = headline(ctx, title, { at: 0.2 }); if (hd.a && times.length) hd.a.exit(times[0] + 0.15, "shrink", 0.4); }
    var heroR = (hsz * m) / 2, ly = H / 2 + heroR + (P ? 80 : 56), lyN = ly + (P ? 66 : 58);
    var colorsL = ["sun", "aqua", "pink", "mint", "orange", "sky"];
    lv.forEach(function (l, i) {
      var at = i === 0 ? Math.max(0.35, Math.min(lands[0] - 0.15, 1.2)) : Math.min(times[i - 1] + dur * 0.55, D - 0.6);
      var tg = tag(ctx, labels[i] || l.illus, { x: W / 2, y: ly, size: P ? 54 : 48, color: colorsL[i % colorsL.length], at: at, maxWidth: sa.w * 0.9, maxLines: 1 });
      var nt = str(l.note) ? say(ctx, l.note, { x: W / 2, y: lyN, size: P ? 38 : 34, weight: 700, color: "#C9C2EE", at: at + 0.15, maxWidth: sa.w * 0.9, maxLines: 1 }) : null;
      if (i < n - 1) { tg.exit(times[i] + dur * 0.25, "shrink", 0.35); if (nt) nt.exit(times[i] + dur * 0.25, "fade", 0.3); }
    });
  };

  TPL["micro-world"] = function (root, p) {
    var wn = ["micro", "body", "ocean"].indexOf(str(p.world)) >= 0 ? str(p.world) : "micro";
    var ctx = scene(root, { world: wn }), sa = ctx.safe, P = ctx.portrait;
    var subs = arr(p.subjects).filter(function (s) { return s && (s.illus || s.label); }).slice(0, 4);
    if (!subs.length) subs = [{ illus: "cell", label: "Cell" }];
    var n = subs.length, hd = headline(ctx, p.title), top = hd.bottom + (hd.a ? 26 : 0), bottom = sa.b;
    var tmw = P ? (n <= 2 ? sa.w * 0.9 : sa.w * 0.46) : (sa.w / n) * 0.9;
    var tsz = P ? 48 : 42, tdims = subs.map(function (s) { return tagDims(str(s.label) || s.illus, tsz, tmw, 2); });
    var tagH = Math.max.apply(null, tdims.map(function (d) { return d.h; })), lab = 22;
    var pos = [], size;
    if (!P) {
      size = Math.min([0, 480, 410, 340, 300][n], bottom - top - tagH - lab - 20, (sa.w / n) * 0.82);
      var yc = top + (bottom - top - tagH - lab - size) / 2 + size / 2;
      for (var i = 0; i < n; i++) pos.push([sa.x + (sa.w * (i + 0.5)) / n, yc + (n > 2 ? (i % 2 ? 24 : -24) : 0)]);
    } else {
      var rows = n <= 2 ? n : 2, rowH = (bottom - top) / rows;
      size = Math.min(n === 1 ? 600 : n === 2 ? 440 : 380, rowH - tagH - lab - 30, n >= 3 ? sa.w * 0.44 : sa.w * 0.8);
      var rowY = function (r) { return top + rowH * (r + 0.5) - (tagH + lab) / 2; };
      if (n <= 2) for (i = 0; i < n; i++) pos.push([W / 2, rowY(i)]);
      else if (n === 3) pos = [[sa.x + sa.w * 0.26, rowY(0)], [sa.x + sa.w * 0.74, rowY(0)], [W / 2, rowY(1)]];
      else pos = [[sa.x + sa.w * 0.26, rowY(0)], [sa.x + sa.w * 0.74, rowY(0)], [sa.x + sa.w * 0.26, rowY(1)], [sa.x + sa.w * 0.74, rowY(1)]];
    }
    // swarm behind (decoration)
    var R = V.makeRand(77);
    for (i = 0; i < 6; i++) { var sw = illus(illusName(subs[i % n].illus, "cell"), { parent: ctx.far, x: R() * W, y: sa.y + R() * sa.h, size: 70 + R() * 40, shadow: "none" }); sw.alpha(0.3).float(14, 5 + R() * 3, 8); sw.inspectable = false; }
    S.particles(ctx, { kind: wn === "body" ? "cells" : "bubbles", count: 12, opacity: 0.7 });
    var labels = subs.map(function (s) { return str(s.label); });
    var lands = seqTimes(labels, null, 0.4, D * 0.6);
    var actors = [], tags = [];
    subs.forEach(function (s, i) {
      var nm = illusName(s.illus, "cell");
      var a = illus(nm, { x: pos[i][0], y: pos[i][1], size: size, face: !!p.faces });
      var at = i === 0 ? Math.max(0.15, Math.min(lands[0] - 0.35, 0.3)) : Math.max(actors[i - 1].ent.t + 0.3, lands[i] - 0.35);
      a.enter(at, "pop", 0.7).float(10, 3.6 + i * 0.4, 4);
      actors.push(a);
      var ty = pos[i][1] + size / 2 + lab + tdims[i].h / 2;
      tags.push(tag(ctx, labels[i] || nm, { x: pos[i][0], y: ty, size: tsz, color: CYCLE[i % CYCLE.length], at: at + 0.2, maxWidth: tmw }));
    });
    var ev = T(p.event), fi = Math.round(num(ev.from, -1)), ti = Math.round(num(ev.to, -1)), verb = str(ev.verb);
    if (fi >= 0 && fi < n && ((ti >= 0 && ti < n && ti !== fi) || /divid|split|clone|multipl/i.test(verb))) {
      var A = actors[fi], kind = /divid|split|clone|multipl/i.test(verb) ? "split" : /swallow|eat|engulf|absorb|consum|devour|attack|kill|destroy|gobble|chomp/i.test(verb) ? "eat" : "dock";
      var tv = Math.min(endT(1.3), Math.max(A.ent.t + 1.0, firstOf(labelTime(verb, null, lands[n - 1]), D * 0.6)));
      var start = Math.max(0.2, tv - 0.55), arrive = Math.min(start + 0.85, D - 0.75);
      if (kind === "split") {
        var dx = P ? 0 : Math.min(size * 0.55, sa.w / n / 2 - size * 0.3), dy = P ? 0 : 0, ox = P ? Math.min(size * 0.5, sa.w * 0.2) : dx;
        var cl2 = illus(A.name, { x: A.b.x, y: A.b.y, size: size * 0.8, face: !!p.faces });
        A.to(tv, { x: A.b.x - ox, s: A.b.s * 0.8 }, 0.7, "outBack");
        cl2.enter(tv, "pop", 0.5).to(tv, { x: A.b.x + ox }, 0.7, "outBack").float(10, 3.9, 4);
        burst(ctx, A.b.x, A.b.y + dy, tv + 0.05, { radius: size * 0.55 });
        tags[fi].exit(tv - 0.1, "shrink", 0.3);
        tag(ctx, verb, { x: A.b.x, y: A.b.y + size / 2 + lab + tdims[fi].h / 2, size: tsz, color: "sun", tone: "solid", at: tv + 0.3 });
      } else {
        var B = actors[ti], ux = A.b.x - B.b.x, uy = A.b.y - B.b.y, ul = Math.hypot(ux, uy) || 1;
        ux /= ul; uy /= ul;
        var mx = lerp(B.b.x, A.b.x, kind === "eat" ? 0.4 : 0.25), my = lerp(B.b.y, A.b.y, kind === "eat" ? 0.4 : 0.25);
        var tx = kind === "eat" ? mx : mx + ux * size * 0.78, ty2 = kind === "eat" ? my : my + uy * size * 0.78;
        A.to(start, { x: tx, y: ty2 }, 0.85, "inOut");
        B.to(start + 0.15, { x: mx, y: my }, 0.7, "inOut");
        if (kind === "eat") { B.exit(arrive - 0.1, "shrink", 0.45); A.to(arrive, { s: A.b.s * 1.12 }, 0.3, "outBack").to(arrive + 0.35, { s: A.b.s }, 0.5, "inOut"); }
        else { B.pulse(0.035, 0.7); }
        burst(ctx, kind === "eat" ? mx : mx + ux * size * 0.42, kind === "eat" ? my : my + uy * size * 0.42, arrive - 0.05, { radius: size * 0.6 });
        tags[fi].exit(start, "shrink", 0.3);
        tags[ti].exit(arrive - 0.05, "shrink", 0.3);
        var vt = tagDims(verb, tsz, sa.w * 0.6, 1);
        tag(ctx, verb, { x: clamp(mx, sa.x + vt.w / 2, sa.r - vt.w / 2), y: Math.min(sa.b - vt.h / 2, my + size / 2 + lab + vt.h / 2), size: tsz, color: "sun", tone: "solid", at: arrive + 0.15, maxWidth: sa.w * 0.6, maxLines: 1 });
      }
    }
  };

  TPL["creature-explains"] = function (root, p) {
    var illN = illusName(p.illus, "bulb");
    var ctx = scene(root, { world: p.world || worldFor(illN) }), sa = ctx.safe, P = ctx.portrait, gy = ctx.groundY;
    var crN = CAST[p.creature] ? p.creature : "pip", title = str(p.title);
    var pts = arr(p.points).map(str).filter(Boolean).slice(0, 4);
    var hd = headline(ctx, title), top = hd.bottom + (hd.a ? 24 : 0), bottom = sa.b;
    var tsz = P ? 48 : 46, crS, ilS, crX, crY, ilX, ilY, colX0, colX1, colY0, colY1, align = "left";
    if (!P) {
      var kk = clamp((sa.w / 1652) * 1.25, 0.6, 1);
      crS = 300 * kk; ilS = Math.min((pts.length ? 460 : 540) * kk, bottom - top - 30);
      if (pts.length) { crX = sa.x + crS * 0.62; ilX = crX + crS * 0.6 + 30 + ilS / 2; colX0 = ilX + ilS / 2 + 40; colX1 = sa.r; }
      else { crX = sa.x + sa.w * 0.24; ilX = Math.max(sa.x + sa.w * 0.66, crX + crS * 0.6 + 40 + ilS / 2); }
      ilY = (top + bottom) / 2;
      if (gy) ilY = Math.min(ilY, gy(ilX) - ilS / 2 - 40);
      crY = gy ? gy(crX) - 104 * (crS / 200) : ilY + 70;
      colY0 = top; colY1 = bottom;
    } else {
      crS = 260; ilS = Math.min(pts.length ? 460 : 560, sa.w * 0.6); tsz = 52;
      ilX = pts.length ? W * 0.63 : W * 0.6; ilY = top + ilS / 2 + 20;
      if (gy) {
        ilX = W / 2; ilS = Math.min(sa.w * 0.6, 540); ilY = top + ilS / 2 + 24;
        crX = sa.x + crS * 0.6; crY = gy(crX) - 104 * (crS / 200);
        colX0 = crX + crS / 2 + 40; colX1 = sa.r; colY0 = ilY + ilS / 2 + 40; colY1 = sa.b;
        if (!pts.length) { ilY = (top + crY - crS / 2) / 2; }
      } else {
        crX = sa.x + crS * 0.6; crY = ilY + ilS * 0.22;
        colX0 = sa.x; colX1 = sa.r; colY0 = ilY + ilS / 2 + 44; colY1 = sa.b; align = "center";
        if (!pts.length) { ilY = sa.cy - 40; crY = ilY + ilS * 0.3; }
      }
    }
    var hero = illus(illN, { x: ilX, y: ilY, size: ilS });
    hero.enter(0.25, "grow", 0.8).float(10, 4.2, 2.5);
    var cr = creature(crN, { x: crX, y: crY, size: crS, mood: p.mood, look: [Math.sign(ilX - crX) * 0.8, clamp((ilY - crY) / 400, -0.8, 0.8)] });
    cr.enter(0.2, gy ? "drop" : "pop", gy ? 0.95 : 0.6).float(gy ? 2 : 9, 3.6, 1.5);
    if (/\?\s*$/.test(title)) cr.feel("think", 0.6);
    var times = seqTimes(pts, null, 1.2, D * 0.82), reacts = ["happy", "wow", "excited", "happy"];
    if (pts.length) {
      var dims = pts.map(function (s) { return tagDims(s, tsz, colX1 - colX0, 2); }), gap = P ? 22 : 26;
      var tot = dims.reduce(function (s, d) { return s + d.h; }, 0) + gap * (pts.length - 1);
      var y = colY0 + Math.max(0, (colY1 - colY0 - tot) / 2);
      pts.forEach(function (s, i) {
        var x = align === "left" ? colX0 + dims[i].w / 2 : (colX0 + colX1) / 2;
        var at = Math.max(1.0 + i * 0.3, times[i] - 0.15);
        tag(ctx, s, { x: x, y: y + dims[i].h / 2, size: tsz, color: CYCLE[i % CYCLE.length], at: at, maxWidth: colX1 - colX0 });
        cr.feel(i === pts.length - 1 ? "happy" : reacts[i % 4], at + 0.05);
        if (i < pts.length - 1) cr.feel(p.mood && EXPR[p.mood] ? p.mood : "neutral", Math.min(at + 1.1, Math.max(at + 0.4, times[i + 1] - 0.3)));
        cr.look(Math.sign(x - crX) * 0.7, clamp((y - crY) / 500, -0.6, 0.6), at);
        y += dims[i].h + gap;
      });
      cr.hop(Math.max(times[pts.length - 1] + 0.1, 0.5), 2);
      cr.look(Math.sign(ilX - crX) * 0.6, -0.2, Math.min(endT(0.2), times[pts.length - 1] + 1.4));
    } else { cr.feel("happy", Math.min(1.6, D * 0.3)).wave(Math.min(1.8, D * 0.35), 1.4); }
    burst(ctx, ilX, ilY, 0.95, { radius: ilS * 0.6, count: 8 });
  };

  TPL["morph-sequence"] = function (root, p) {
    var ctx = scene(root, { world: p.world || "studio" }), sa = ctx.safe, P = ctx.portrait;
    var steps = arr(p.steps).filter(function (s) { return s && (s.shape || s.label); }).slice(0, 6);
    if (steps.length < 2) steps = steps.concat([{ shape: "circle", label: "" }, { shape: "star", label: "" }]).slice(0, 2);
    var n = steps.length, hd = headline(ctx, p.title), top = hd.bottom + (hd.a ? 20 : 0);
    var lsz = P ? 88 : 80, labH = lsz * 1.08, dotsH = 18;
    var Sz = P ? Math.min(sa.w * 0.84, 720, sa.b - top - labH - dotsH - 120) : Math.min(560, sa.b - top - labH - dotsH - 110);
    var block = Sz + 54 + labH + 30 + dotsH, bt = top + Math.max(0, (sa.b - top - block) / 2);
    var sy = bt + Sz / 2, ly = bt + Sz + 54 + labH / 2, dy = ly + labH / 2 + 30 + dotsH / 2;
    var labels = steps.map(function (s) { return str(s.label); });
    var times = seqTimes(labels, null, 0.6, D * 0.84), gapMin = 9;
    for (var i = 1; i < n; i++) gapMin = Math.min(gapMin, times[i] - times[i - 1]);
    var dur = clamp(gapMin * 0.7, 0.45, 0.85);
    var mats = steps.map(function (s, i) { return { shape: str(s.shape).toLowerCase() || "circle", color: s.color || CYCLE[i % CYCLE.length], at: i === 0 ? 0 : Math.max(0.5, times[i] - dur * 0.55) }; });
    // orbiting dots behind and in front of the shape
    var orbB = el("g", null, ctx.world);
    var mo = morph(mats, { x: W / 2, y: sy, size: Sz, dur: dur, face: !!p.face });
    mo.pop(0.2, 0.7).float(8, 4.2, 2);
    var orbF = el("g", null, ctx.world), dots = [];
    for (i = 0; i < 7; i++) dots.push({ n: el("circle", { r: 9 + (i % 3) * 3, fill: PAL[CYCLE[(i + 2) % CYCLE.length]] }, orbB), a: (i / 7) * TAU });
    st.fns.push(function (t) {
      var vis = t > 0.6;
      dots.forEach(function (d) {
        var a = d.a + t * 0.8, x = W / 2 + Math.cos(a) * Sz * 0.64, y = sy + Math.sin(a) * Sz * 0.2 + Sz * 0.05;
        var front = Math.sin(a) > 0;
        if ((d.n.parentNode === orbF) !== front) (front ? orbF : orbB).appendChild(d.n);
        d.n.setAttribute("cx", f2(x)); d.n.setAttribute("cy", f2(y));
        d.n.setAttribute("opacity", vis ? f2(front ? 0.95 : 0.45) : 0);
      });
    });
    var pd = [], pw = 34;
    for (i = 0; i < n; i++) pd.push(el("circle", { cx: f2(W / 2 + (i - (n - 1) / 2) * pw), cy: f2(dy), r: 8, fill: "#C9C2EE" }, ctx.front));
    st.fns.push(function (t) {
      var cur = 0;
      for (var k = 0; k < n; k++) if (t >= (k === 0 ? 0.3 : mats[k].at)) cur = k;
      pd.forEach(function (c, k) { c.setAttribute("fill", k === cur ? "#FFD43B" : "#C9C2EE"); c.setAttribute("opacity", k <= cur ? 1 : 0.35); c.setAttribute("r", k === cur ? 10 : 7); });
    });
    labels.forEach(function (lb, i) {
      if (!lb) return;
      var at = i === 0 ? Math.max(0.35, Math.min(times[0] - 0.15, 1.0)) : Math.max(mats[i].at + dur * 0.4, mats[i].at + 0.3);
      var s = say(ctx, lb, { x: W / 2, y: ly, size: lsz, maxWidth: sa.w * 0.9, maxLines: 1, at: at, stagger: 0.06 });
      if (i < n - 1) s.exit(mats[i + 1].at - 0.02, "shrink", 0.28);
      if (i > 0) burst(ctx, W / 2, sy, mats[i].at + dur * 0.9, { radius: Sz * 0.62, count: 10 });
    });
  };

  TPL["scale-compare"] = function (root, p) {
    var items = arr(p.items).filter(function (it) { return it && num(it.value, 0) > 0; }).slice(0, 5);
    if (items.length < 2) items = [{ illus: "moon", label: "Moon", value: 3474 }, { illus: "earth", label: "Earth", value: 12742 }];
    items = items.map(function (it) { return { illus: illusName(it.illus, "planet"), label: str(it.label), value: num(it.value, 1), note: str(it.note) }; });
    var orig = items.map(function (it) { return it.label; });
    items.sort(function (a, b) { return a.value - b.value; });
    var vmax = items[items.length - 1].value;
    items.forEach(function (it) { it.value = Math.max(it.value, vmax / 20000); });
    var ctx = scene(root, { world: p.world || worldFor(items[0].illus) }), sa = ctx.safe, P = ctx.portrait, n = items.length;
    ctx.cam.push = 0.015;
    void orig;
    var hd = headline(ctx, p.title), y0 = hd.bottom + (hd.a ? 30 : 10), y1 = sa.b - (P ? 150 : 130), x0 = sa.x + 30, x1 = sa.r - 30;
    var RC = [(x0 + x1) / 2, (y0 + y1) / 2], stage = el("g", null, ctx.world);
    var x = 0, prevD = 0;
    items.forEach(function (it, i) {
      it.d = (100 * it.value) / items[0].value;
      x += i ? prevD / 2 + prevD * 0.24 + it.d * 0.02 + it.d / 2 : 0;
      it.x = x; it.y = -it.d / 2; prevD = it.d;
    });
    var fits = items.map(function (it, k) {
      var minX = items[0].x - items[0].d / 2, maxX = it.x + it.d / 2, hgt = it.d;
      var z = Math.min((x1 - x0) / (maxX - minX), (y1 - y0) / hgt) * 0.9;
      if (k === 0) z = Math.min(z, Math.min(P ? 520 : 460, (y1 - y0) * 0.8) / it.d);
      return { lz: Math.log(z), cx: (minX + maxX) / 2, cy: -hgt / 2 };
    });
    var lands = seqTimes(items.map(function (it) { return it.label; }), null, 0.5, D * 0.8);
    var zs = 1.25, zt = lands.map(function (t, k) { return k === 0 ? 0 : Math.max(lands[k - 1] + 0.3, t - 0.55); });
    function stageAt(t) {
      var lz = fits[0].lz, cx = fits[0].cx, cy = fits[0].cy;
      for (var k = 1; k < n; k++) {
        if (t < zt[k]) break;
        var q = EASE.inOut(clamp((t - zt[k]) / zs, 0, 1));
        lz = lerp(lz, fits[k].lz, q); cx = lerp(cx, fits[k].cx, q); cy = lerp(cy, fits[k].cy, q);
      }
      return { z: Math.exp(lz), cx: cx, cy: cy };
    }
    var acts = items.map(function (it, k) {
      var a = illus(it.illus, { parent: stage, x: it.x, y: it.y, size: it.d, shadow: ctx.groundY ? "ground" : undefined });
      a.inspectable = false;
      a.enter(k === 0 ? 0.2 : Math.max(zt[k] + 0.1, lands[k] - 0.3), "pop", 0.7).float(it.d * 0.012, 4 + k * 0.5, 1.2);
      return a;
    });
    var tsz = P ? 46 : 42, labs = items.map(function (it, k) {
      var d1 = tagDims(it.label || it.illus, tsz, sa.w * 0.5, 1);
      var tg = tag(ctx, it.label || it.illus, { x: W / 2, y: H / 2, size: tsz, color: CYCLE[k % CYCLE.length], at: acts[k].ent.t + 0.25, maxWidth: sa.w * 0.5, maxLines: 1, float: false });
      var nt = it.note ? say(ctx, it.note, { x: W / 2, y: H / 2, size: P ? 34 : 30, weight: 700, color: "#C9C2EE", at: acts[k].ent.t + 0.4, maxLines: 1, maxWidth: sa.w * 0.5 }) : null;
      return { tg: tg, nt: nt, w: d1.w, h: d1.h, x: 0, y: 0, v: 0 };
    });
    st.fns.unshift(function (t) {
      var s = stageAt(t);
      stage.setAttribute("transform", tr(RC[0], RC[1]) + " scale(" + s.z.toFixed(6) + ") " + tr(-s.cx, -s.cy));
      var cam = layerTf(st.cam.at(t), 1), shown = [];
      for (var k = n - 1; k >= 0; k--) {
        var it = items[k], L = labs[k];
        var sx = RC[0] + (it.x - s.cx) * s.z, sy = RC[1] + (0 - s.cy) * s.z;
        sx = (sx - cam.x) * cam.z + W / 2; sy = (sy - cam.y) * cam.z + H / 2;
        var dpx = it.d * s.z * cam.z, vis = smooth((dpx - 46) / 50);
        var want = sy + 22 + L.h / 2, lim = sa.b - L.h / 2 - (L.nt ? 40 : 0);
        L.x = clamp(sx, sa.x + L.w / 2, sa.r - L.w / 2); L.y = Math.min(want, lim);
        if (want > lim + 2) vis *= Math.max(0, 1 - (want - lim) / 40);
        if (L.x - L.w / 2 > W || L.x + L.w / 2 < 0) vis = 0;
        for (var j = 0; j < shown.length; j++) { var o2 = shown[j]; if (Math.abs(o2.x - L.x) < (o2.w + L.w) / 2 + 16 && Math.abs(o2.y - L.y) < (o2.h + L.h) / 2 + 30) vis = 0; }
        L.v = vis;
        if (vis > 0.05) shown.push(L);
      }
    });
    labs.forEach(function (L) {
      L.tg.hook(function (t, c) { c.x = L.x; c.y = L.y; c.o *= L.v; if (L.v < 0.02) c.vis = false; });
      if (L.nt) L.nt.hook(function (t, c) { c.x = L.x; c.y = L.y + L.h / 2 + 24; c.o *= L.v; if (L.v < 0.02) c.vis = false; });
    });
  };

  TPL["population-grid"] = function (root, p) {
    var ctx = scene(root, { world: p.world || "studio" }), sa = ctx.safe, P = ctx.portrait;
    var total = Math.max(1, num(p.total, 100)), hv = clamp(num(p.highlight, 0), 0, total);
    var shown = total <= 100 ? Math.max(1, Math.round(total)) : 100, hi = clamp(Math.round((hv / total) * shown), 0, shown);
    var label = str(p.label), display = str(p.display);
    var hd = headline(ctx, p.title), top = hd.bottom + (hd.a ? 34 : 0);
    var nsz = P ? 210 : 230, lsz = P ? 54 : 56;
    var pct = (hv / total) * 100, dec = pct < 10 && Math.abs(pct - Math.round(pct)) > 0.05 ? 1 : 0;
    var gx0, gx1, gy0, gy1, tx, nyc, lmaxW;
    var labLay = layoutText(label, { size: lsz, maxWidth: P ? sa.w * 0.94 : sa.w * 0.4, maxLines: 3 });
    if (!P) { gx0 = sa.x; gx1 = sa.x + sa.w * 0.56; gy0 = top; gy1 = sa.b; tx = sa.x + sa.w * 0.79; lmaxW = sa.w * 0.4; }
    else { gx0 = sa.x; gx1 = sa.r; gy0 = top; gy1 = sa.b - nsz * 1.05 - 26 - labLay.h - 40; tx = W / 2; lmaxW = sa.w * 0.94; }
    var gw = gx1 - gx0, gh = gy1 - gy0;
    var cols = shown === 100 ? 10 : Math.max(1, Math.ceil(Math.sqrt((shown * gw) / gh))), rows = Math.ceil(shown / cols);
    var cell = Math.min(gw / cols, gh / rows, 130), gridW = cols * cell, gridH = rows * cell;
    var ox = gx0 + (gw - gridW) / 2 + cell / 2, oy = gy0 + (gh - gridH) / 2 + cell / 2;
    var crowd = col(p.color, "#9B8CF2"), hc = col(p.highlightColor, "sun");
    var th = firstOf(kwFind("percent", 0.5), display ? labelTime(display, null, 0.5) : null, labelTime(label, null, 0.5), D * 0.4);
    th = clamp(th - 0.15, 1.2, endT(1.4));
    for (var i = 0; i < shown; i++) {
      var r = Math.floor(i / cols), c = i % cols, mg = mini(ctx.world, crowd, (r * 7 + c * 3) % 4);
      var a = new Actor(mg, false, { r: 42, layer: 1, kind: "mini", label: "mini", inspect: false });
      a.at(ox + c * cell, oy + r * cell).size((cell * 0.84) / 84).enter(0.22 + (r + c) * 0.035, "pop", 0.5).float(cell * 0.03, 2.6 + ((i * 37) % 10) / 10, 3);
      if (i < hi) (function (g2, tt) {
        var painted = false;
        a.hook(function (t, cs) {
          var on = t >= tt;
          if (on !== painted) { g2.__paint(on ? hc : crowd); painted = on; }
          var hq = (t - tt) / 0.42;
          if (hq >= 0 && hq < 2) cs.y -= cell * 0.22 * Math.abs(Math.sin(PI * hq));
        });
      })(mg, th + i * 0.012);
    }
    var nb, numH = nsz * 1.05;
    var ny = P ? gy1 + 40 + numH / 2 : (gy0 + gy1) / 2 - (labLay.h + 26) / 2;
    if (display) nb = say(ctx, display, { x: tx, y: ny, size: nsz * 0.7, maxWidth: P ? sa.w : sa.w * 0.42, maxLines: 1, at: th, color: hc, stagger: 0.05 });
    else nb = bigNumber(ctx, { value: pct, decimals: dec, suffix: "%", at: th, dur: 1.3, size: nsz, x: tx, y: ny, color: hc, maxWidth: P ? sa.w : sa.w * 0.42 });
    nb.float(4, 4, 0.5);
    if (label) say(ctx, label, { x: tx, y: ny + numH / 2 + 26 + labLay.h / 2, size: lsz, maxWidth: lmaxW, maxLines: 3, at: th + 0.35, stagger: 0.05 });
    burst(ctx, tx, ny, th + 0.1, { radius: nsz * 0.9, count: 10 });
  };

  TPL["timeline-orbit"] = function (root, p) {
    var ctx = scene(root, { world: p.world || "space" }), sa = ctx.safe, P = ctx.portrait, m = Math.min(W, H);
    var evs = arr(p.events).filter(function (e) { return e && (e.label || e.year); }).slice(0, 6);
    if (evs.length < 2) evs = evs.concat([{ year: "Then", label: "Start" }, { year: "Now", label: "Today" }]).slice(0, 2);
    var n = evs.length, hd = headline(ctx, p.title);
    var rx0 = sa.x, rx1 = sa.r, ry0 = hd.bottom + (hd.a ? 16 : 0), ry1 = sa.b, cx = (rx0 + rx1) / 2, cy = (ry0 + ry1) / 2;
    var ysz = P ? 46 : 42, tsz = P ? 36 : 34, er = P ? 52 : 56, tmax = P ? 330 : 360;
    var units = evs.map(function (e) {
      var yl = layoutText(str(e.year), { size: ysz, maxWidth: tmax, maxLines: 1 }), td = tagDims(str(e.label), tsz, tmax, 2);
      return { yl: yl, td: td, w: Math.max(yl.w, td.w), h: (str(e.year) ? yl.h + 8 : 0) + td.h };
    });
    var a0 = -135, angs = evs.map(function (e, i) { return ((a0 + (i * 360) / n) * PI) / 180; });
    var rx = (rx1 - rx0) / 2 - er - 40, ry = (ry1 - ry0) / 2 - er - 40, boxes = [];
    function place() {
      boxes = units.map(function (u, i) {
        var ca = Math.cos(angs[i]), sn = Math.sin(angs[i]), px = cx + rx * ca, py = cy + ry * sn;
        return { px: px, py: py, x: px + ca * (er + u.w / 2 + 10), y: py + sn * (er + u.h / 2 + 10), w: u.w, h: u.h };
      });
    }
    for (var it = 0; it < 14; it++) {
      place();
      var shX = 0, shY = 0;
      boxes.forEach(function (b, i) {
        var ox = Math.max(0, b.x + b.w / 2 - rx1, rx0 - (b.x - b.w / 2)), oy = Math.max(0, b.y + b.h / 2 - ry1, ry0 - (b.y - b.h / 2));
        if (ox > 0) shX = Math.max(shX, ox / Math.max(0.35, Math.abs(Math.cos(angs[i]))));
        if (oy > 0) shY = Math.max(shY, oy / Math.max(0.35, Math.abs(Math.sin(angs[i]))));
      });
      if (!shX && !shY) break;
      rx = Math.max(er * 2.4, rx - shX * 1.02); ry = Math.max(er * 2.4, ry - shY * 1.02);
    }
    place();
    boxes.forEach(function (b) { b.x = clamp(b.x, rx0 + b.w / 2, rx1 - b.w / 2); b.y = clamp(b.y, ry0 + b.h / 2, ry1 - b.h / 2); });
    var heroS = clamp(2 * (Math.min(rx, ry) - er - 30), 150, 0.38 * m);
    // orbit and lit path
    el("ellipse", { cx: f2(cx), cy: f2(cy), rx: f2(rx), ry: f2(ry), fill: "none", stroke: "#C9C2EE", "stroke-width": 4, "stroke-dasharray": "2 14", "stroke-linecap": "round", opacity: 0.55 }, ctx.world);
    var lit = el("path", { fill: "none", stroke: "#FFD43B", "stroke-width": 6, "stroke-linecap": "round", opacity: 0.85 }, ctx.world);
    var hero = illus(illusName(p.center, "sun"), { x: cx, y: cy, size: heroS });
    hero.enter(0.2, "pop", 0.7).float(6, 4.6, 1.5);
    var lands = seqTimes(evs.map(function (e) { return str(e.label); }), evs.map(function (e) { return null; }), 0.9, D * 0.82);
    evs.forEach(function (e, i) { var ty = kwFind(str(e.year), i ? lands[i - 1] : 0); if (ty != null && ty < lands[i] && ty > (i ? lands[i - 1] : 0)) lands[i] = ty; });
    for (var k = 1; k < n; k++) if (lands[k] < lands[k - 1] + 0.4) lands[k] = lands[k - 1] + 0.4;
    lands = lands.map(function (t) { return Math.min(t, endT(0.5)); });
    lands[0] = Math.max(lands[0], 0.9);
    var comet = el("g", null, ctx.world), tail = [];
    for (k = 0; k < 9; k++) tail.push(el("circle", { r: f2(12 - k * 1.1), fill: k < 2 ? "#FFF3D6" : "#FFD43B", opacity: f2(0.85 - k * 0.09) }, comet));
    el("circle", { r: 30, fill: fvGlow("#FFE27A", 0.75) }, comet);
    var head = el("circle", { r: 13, fill: "#FFFFFF" }, comet);
    evs.forEach(function (e, i) {
      var b = boxes[i], u = units[i];
      var ic = illus(illusName(e.illus, "planet"), { x: b.px, y: b.py, size: er * 2, color: e.illus ? undefined : CYCLE[i % CYCLE.length] });
      ic.enter(lands[i] - 0.12, "pop", 0.6).float(4, 3.4 + i * 0.3, 3);
      burst(ctx, b.px, b.py, lands[i] - 0.02, { radius: er * 1.6, count: 8 });
      var yTop = b.y - b.h / 2;
      if (str(e.year)) say(ctx, str(e.year), { x: b.x, y: yTop + u.yl.h / 2, size: ysz, color: "sun", maxWidth: tmax, maxLines: 1, at: lands[i] }).float(2, 4, 0.3);
      tag(ctx, str(e.label), { x: b.x, y: b.y + b.h / 2 - u.td.h / 2, size: tsz, color: CYCLE[i % CYCLE.length], at: lands[i] + 0.12, maxWidth: tmax });
    });
    var step = 360 / n;
    function angAt(t) {
      var A = a0 - 70, tA = 0.3;
      if (t < lands[0]) return lerp(A, a0, EASE.outCubic(prog(t, tA, lands[0])));
      for (var i = 0; i < n - 1; i++) if (t < lands[i + 1]) return a0 + step * i + step * EASE.inOut(prog(t, lands[i], lands[i + 1]));
      return a0 + step * (n - 1) + Math.min(step * 0.6, (t - lands[n - 1]) * 8);
    }
    st.fns.push(function (t) {
      var ad = angAt(t), show = t >= 0.3;
      comet.style.display = show ? "" : "none";
      var pt = function (deg) { var r2 = (deg * PI) / 180; return [cx + rx * Math.cos(r2), cy + ry * Math.sin(r2)]; };
      var hp = pt(ad);
      head.setAttribute("cx", f2(hp[0])); head.setAttribute("cy", f2(hp[1]));
      comet.lastChild.previousSibling.setAttribute("cx", f2(hp[0])); comet.lastChild.previousSibling.setAttribute("cy", f2(hp[1]));
      tail.forEach(function (c, k2) { var q = pt(ad - (k2 + 1) * 2.6); c.setAttribute("cx", f2(q[0])); c.setAttribute("cy", f2(q[1])); });
      if (t >= lands[0] - 0.05) {
        var pts = [];
        for (var d2 = a0; d2 < ad; d2 += 3) pts.push(pt(d2));
        pts.push(hp);
        lit.setAttribute("d", pts.length > 1 ? polyD(pts, false) : "");
      } else lit.setAttribute("d", "");
    });
  };

  TPL["cause-effect"] = function (root, p) {
    var ctx = scene(root, { world: p.world || "studio" }), sa = ctx.safe, P = ctx.portrait;
    var steps = arr(p.steps).filter(function (s) { return s && (s.illus || s.label); }).slice(0, 5);
    if (steps.length < 2) steps = steps.concat([{ illus: "sun", label: "Cause" }, { illus: "flame", label: "Effect" }]).slice(0, 2);
    var n = steps.length, hd = headline(ctx, p.title), top = hd.bottom + (hd.a ? 24 : 0), bottom = sa.b;
    var tsz = P ? 44 : 40, pos = [], lpos = [], size, dims;
    if (!P) {
      var cw = sa.w / n;
      dims = steps.map(function (s) { return tagDims(str(s.label), tsz, cw * 0.94, 2); });
      var th = Math.max.apply(null, dims.map(function (d) { return d.h; })), zig = n >= 3 ? 34 : 0;
      size = Math.min(cw * 0.66, 340, bottom - top - th - 30 - zig * 2);
      var rowY = top + (bottom - top - (size + 26 + th + zig * 2)) / 2 + zig + size / 2;
      for (var i = 0; i < n; i++) { var yy = rowY + (n >= 3 ? (i % 2 ? zig : -zig) : 0); pos.push([sa.x + cw * (i + 0.5), yy]); lpos.push([sa.x + cw * (i + 0.5), yy + size / 2 + 26 + dims[i].h / 2]); }
    } else {
      var rowH = (bottom - top) / n;
      size = Math.min(rowH * 0.8, 300, sa.w * 0.42);
      var lx0 = sa.x + size + 110;
      dims = steps.map(function (s) { return tagDims(str(s.label), tsz, sa.r - lx0, 2); });
      for (i = 0; i < n; i++) { var yc = top + rowH * (i + 0.5), xc = sa.x + size / 2 + 20 + (i % 2 ? 46 : 0); pos.push([xc, yc]); lpos.push([lx0 + 10 + dims[i].w / 2, yc]); }
    }
    var labels = steps.map(function (s) { return str(s.label); });
    var lands = seqTimes(labels, null, 0.5, D * 0.84);
    var acts = [], lastAt = D - 0.85, step = clamp((lastAt - 0.3) / Math.max(1, n - 1), 0.25, 0.7), edur = clamp(step + 0.15, 0.45, 0.75);
    steps.forEach(function (s, i) {
      var a = illus(illusName(s.illus, "gear"), { x: pos[i][0], y: pos[i][1], size: size });
      var at = i === 0 ? Math.max(0.15, Math.min(lands[0] - 0.35, 0.3)) : Math.max(acts[i - 1].ent.t + step, lands[i] - 0.25);
      at = Math.min(at, lastAt - (n - 1 - i) * step * 0.6);
      if (i > 0) at = Math.max(at, acts[i - 1].ent.t + 0.2);
      a.enter(at, i === 0 ? "pop" : "spin", Math.min(i === 0 ? 0.65 : edur, D - at - 0.05)).float(7, 3.6 + i * 0.3, 2.5);
      acts.push(a);
      tag(ctx, labels[i] || s.illus, { x: lpos[i][0], y: lpos[i][1], size: tsz, color: CYCLE[i % CYCLE.length], at: Math.min(at + 0.22, D - 0.6), maxWidth: P ? sa.r - (sa.x + size + 110) : (sa.w / n) * 0.94 });
      if (i > 0) burst(ctx, pos[i][0], pos[i][1], at + 0.2, { radius: size * 0.62, count: 9 });
    });
    for (var k = 1; k < n; k++) {
      var A = pos[k - 1], B = pos[k], dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy) || 1, rr = size * 0.52;
      var x1 = A[0] + (dx / L) * rr, y1 = A[1] + (dy / L) * rr, x2 = B[0] - (dx / L) * (rr + 10), y2 = B[1] - (dy / L) * (rr + 10);
      var cAt = Math.max(acts[k - 1].ent.t + 0.35, acts[k].ent.t - 0.75), cDur = Math.max(0.25, Math.min(0.45, acts[k].ent.t - 0.3 - cAt));
      var cn = connector(ctx, x1, y1, x2, y2, { at: cAt, dur: cDur, bend: P ? 0.25 : k % 2 ? -0.22 : 0.22, color: "#FFFFFF", width: 9 });
      (function (cn2, t0, t1) {
        var ballG = el("g", null, ctx.front);
        el("circle", { r: 26, fill: fvGlow("#FFE27A", 0.8) }, ballG);
        el("circle", { r: 10, fill: "#FFF3D6" }, ballG);
        st.fns.push(function (t) {
          var q = (t - t0) / (t1 - t0);
          if (q < 0 || q > 1) { ballG.style.display = "none"; return; }
          ballG.style.display = "";
          var pp = cn2.point(EASE.inOut(q));
          ballG.setAttribute("transform", tr(pp[0], pp[1]) + " scale(" + f2(0.7 + 0.5 * Math.sin(PI * q)) + ")");
        });
      })(cn, cAt + cDur * 0.4, acts[k].ent.t + 0.05);
    }
  };

  TPL["big-number-world"] = function (root, p) {
    var illN = illusName(p.illus, "earth");
    var ctx = scene(root, { world: p.world || worldFor(illN) }), sa = ctx.safe, P = !ctx.landscape;
    var label = str(p.label), heroS, hx, hy, tx, nmax, nsz = P ? 220 : 240, lsz = P ? 60 : 58;
    var lab;
    if (!P) {
      heroS = Math.min(sa.h * 0.78, 560); hx = sa.x + sa.w * 0.27; hy = sa.cy;
      tx = sa.x + sa.w * 0.75; nmax = sa.w * 0.46;
      lab = layoutText(label, { size: lsz, maxWidth: nmax, maxLines: 3 });
    } else {
      nmax = sa.w;
      lab = layoutText(label, { size: lsz, maxWidth: sa.w * 0.96, maxLines: 3 });
      heroS = Math.min(sa.w * 0.62, sa.h - nsz * 1.05 - lab.h - 100);
      var tot = heroS + 40 + nsz * 1.05 + 30 + lab.h, t0 = sa.y + Math.max(0, (sa.h - tot) / 2);
      hx = W / 2; hy = t0 + heroS / 2; tx = W / 2;
    }
    var hero = illus(illN, { x: hx, y: hy, size: heroS });
    hero.enter(0.2, "pop", 0.75).float(8, 4.5, 1.5);
    S.particles(ctx, { kind: "sparks", count: 14, area: { x: hx - heroS * 0.8, y: hy - heroS * 0.8, w: heroS * 1.6, h: heroS * 1.6 }, speed: 30, opacity: 0.9 });
    var orb = arr(p.orbiters).map(function (o) { return illusName(o, "moon"); }).slice(0, 3);
    var orx = heroS * 0.64, ory = heroS * 0.19, tilt = (-14 * PI) / 180, oS = Math.min(110, heroS * 0.2);
    orb.forEach(function (nm, k) {
      var a = illus(nm, { x: hx, y: hy, size: oS, shadow: "none" });
      a.enter(0.6 + k * 0.25, "pop", 0.5);
      var front = true;
      a.hook(function (t, c) {
        var th = t * 0.55 + (k * TAU) / orb.length + 0.6, ox = Math.cos(th) * orx, oy = Math.sin(th) * ory;
        c.x = hx + ox * Math.cos(tilt) - oy * Math.sin(tilt); c.y = hy + ox * Math.sin(tilt) + oy * Math.cos(tilt);
        var f = Math.sin(th) > 0;
        c.s *= 0.8 + 0.2 * (f ? 1 : 0) + 0.12 * Math.sin(th);
        if (f !== front) { front = f; var par = hero.node.parentNode; if (f) par.insertBefore(a.node, hero.node.nextSibling); else par.insertBefore(a.node, hero.node); }
      });
    });
    var numH = nsz * 1.05, ny, ly;
    if (!P) { var blk = numH + 30 + lab.h; ny = sa.cy - blk / 2 + numH / 2; ly = ny + numH / 2 + 30 + lab.h / 2; }
    else { ny = hy + heroS / 2 + 40 + numH / 2; ly = ny + numH / 2 + 30 + lab.h / 2; }
    var nb = bigNumber(ctx, { value: p.value, prefix: p.prefix, suffix: p.suffix, decimals: p.decimals, at: 0.4, dur: 1.8, size: nsz, x: tx, y: ny, color: p.color || "sun", maxWidth: nmax });
    nb.float(4, 4.4, 0.5);
    if (label) {
      var tl = clamp(firstOf(labelTime(label, null, 0.6), 1.6) - 0.15, 1.0, endT(0.8));
      say(ctx, label, { x: tx, y: ly, size: lab.size, maxWidth: P ? sa.w * 0.96 : nmax, maxLines: 3, at: tl, stagger: 0.06 });
    }
    burst(ctx, tx, ny, 0.45, { radius: nsz * 0.8, count: 10 });
  };

  TPL["split-worlds"] = function (root, p) {
    var L = T(p.left), Rr = T(p.right), vs = str(p.vs || "VS").slice(0, 4) || "VS";
    var ctx = scene(root, { world: "none" }), sa = ctx.safe, P = ctx.portrait;
    var sides = [L, Rr].map(function (s, i) { return { title: str(s.title) || (i ? "After" : "Before"), illus: illusName(s.illus, i ? "factory" : "tree"), world: worldName(s.world || worldFor(s.illus || (i ? "factory" : "tree"))), points: arr(s.points).map(str).filter(Boolean).slice(0, 2) }; });
    var splitY = P ? sa.cy : 0;
    function divAt(u, t) { return 16 * Math.sin(u / 140 + t * 1.6) + 8 * Math.sin(u / 60 - t * 2.3); }
    var clips = sides.map(function (s, i) {
      var id = uid("sp"), cp = el("clipPath", { id: id }, st.defs), pth = el("path", null, cp);
      var g = el("g", { "clip-path": "url(#" + id + ")" }, ctx.bg);
      // each world is drawn at its own panel size, so its sun, hills and skyline sit inside the panel
      var pw = P ? W : W / 2 + 60, ph = P ? (i ? H - splitY + 60 : splitY + 60) : H;
      var g2 = el("g", { transform: tr(!P && i ? W / 2 - 60 : 0, P && i ? splitY - 60 : 0) }, g);
      var wb = buildWorld(s.world, { bg: g2, far: g2, mid: g2, world: g2 }, pw, ph, V.makeRand(41 + i * 13));
      wb.fns.forEach(function (f) { st.fns.push(f); });
      s.tone = wb.tone;
      return pth;
    });
    var line = el("path", { fill: "none", stroke: "#FFFFFF", "stroke-width": 10, "stroke-linecap": "round" }, ctx.bg);
    var glowL = el("path", { fill: "none", stroke: "#FFFFFF", "stroke-width": 26, opacity: 0.18, "stroke-linecap": "round" }, ctx.bg);
    st.fns.push(function (t) {
      var a = [], u;
      if (!P) { for (u = -60; u <= H + 60; u += 30) a.push([W / 2 + divAt(u, t), u]); }
      else { for (u = -60; u <= W + 60; u += 30) a.push([u, splitY + divAt(u, t)]); }
      var d = smoothPath(a, true);
      line.setAttribute("d", d); glowL.setAttribute("d", d);
      if (!P) { clips[0].setAttribute("d", d + "L-200 " + (H + 60) + "L-200 -60Z"); clips[1].setAttribute("d", d + "L" + (W + 200) + " " + (H + 60) + "L" + (W + 200) + " -60Z"); }
      else { clips[0].setAttribute("d", d + "L" + (W + 60) + " -200L-60 -200Z"); clips[1].setAttribute("d", d + "L" + (W + 60) + " " + (H + 200) + "L-60 " + (H + 200) + "Z"); }
    });
    var tsz = P ? 66 : 72, psz = P ? 40 : 40;
    var lands = [labelTime(sides[0].title, null, 0), null];
    lands[1] = labelTime(sides[1].title, null, (lands[0] || 0) + 0.3);
    lands = spread(lands, 0.4, D * 0.5);
    if (lands[1] < lands[0] + 1) lands[1] = Math.min(endT(1.5), lands[0] + 1.2);
    sides.forEach(function (s, i) {
      var t0 = Math.max(i ? 0.9 : 0.25, lands[i] - 0.25);
      var tl, td, heroS, hx, hy, colX, colW, ty, pdim = [], pts = s.points;
      if (!P) {
        var x0 = i ? W / 2 + 60 : sa.x, x1 = i ? sa.r : W / 2 - 60; colX = (x0 + x1) / 2; colW = x1 - x0;
        tl = layoutText(s.title, { size: tsz, maxWidth: colW * 0.92, maxLines: 2 });
        pts.forEach(function (q) { pdim.push(tagDims(q, psz, colW * 0.92, 2)); });
        var ph = pdim.reduce(function (a, d) { return a + d.h + 18; }, 0);
        ty = sa.y + tl.h / 2 + 6;
        var avT = sa.y + tl.h + 30, avB = sa.b - ph - 10;
        heroS = Math.min(colW * 0.6, avB - avT, 460); hx = colX; hy = (avT + avB) / 2;
        say(ctx, s.title, { x: colX, y: ty, size: tsz, maxWidth: colW * 0.92, maxLines: 2, at: t0 + 0.1, outline: s.tone === "light" }).float(2, 4, 0.3);
        var py = avB + 14;
        pts.forEach(function (q, k) { tag(ctx, q, { x: colX, y: py + pdim[k].h / 2, size: psz, color: CYCLE[(i * 2 + k + 1) % CYCLE.length], at: Math.max(t0 + 0.5 + k * 0.4, firstOf(labelTime(q, null, t0), 0) - 0.15), maxWidth: colW * 0.92, tone: s.tone }); py += pdim[k].h + 18; });
      } else {
        var r0 = i ? splitY + 56 : sa.y, r1 = i ? sa.b : splitY - 56, rh = r1 - r0;
        heroS = Math.min(rh * 0.82, sa.w * 0.44); hy = (r0 + r1) / 2;
        hx = i ? sa.r - heroS / 2 - 24 : sa.x + heroS / 2 + 24;
        var cx0 = i ? sa.x : sa.x + heroS + 40, cx1 = i ? sa.r - heroS - 40 : sa.r; colX = (cx0 + cx1) / 2; colW = cx1 - cx0;
        tl = layoutText(s.title, { size: tsz, maxWidth: colW, maxLines: 2 });
        pts.forEach(function (q) { pdim.push(tagDims(q, psz, colW, 2)); });
        var tot = tl.h + pdim.reduce(function (a, d) { return a + d.h + 18; }, 0) + (pts.length ? 10 : 0), yy = hy - tot / 2;
        say(ctx, s.title, { x: colX, y: yy + tl.h / 2, size: tsz, maxWidth: colW, maxLines: 2, at: t0 + 0.1, outline: s.tone === "light" }).float(2, 4, 0.3);
        yy += tl.h + 28;
        pts.forEach(function (q, k) { tag(ctx, q, { x: colX, y: yy + pdim[k].h / 2, size: psz, color: CYCLE[(i * 2 + k + 1) % CYCLE.length], at: Math.max(t0 + 0.5 + k * 0.4, firstOf(labelTime(q, null, t0), 0) - 0.15), maxWidth: colW, tone: s.tone }); yy += pdim[k].h + 18; });
      }
      var a = illus(s.illus, { x: hx, y: hy, size: heroS, shadow: "none" });
      a.enter(t0, "pop", 0.7).float(9, 4 + i * 0.5, 2);
    });
    var bd = hel("div", "fv-badge", ctx.ui);
    bd.textContent = vs;
    var bs = P ? 132 : 140;
    bd.style.width = bd.style.height = f2(bs * UNIT) + "px";
    bd.style.fontSize = f2(bs * (vs.length > 2 ? 0.28 : 0.36) * UNIT) + "px";
    var badge = textActor(bd, vs, "badge");
    badge.at(W / 2, P ? splitY : H / 2).enter(0.35, "spin", 0.8).pulse(0.04, 1.4);
  };

  TPL["pillar-chart"] = function (root, p) {
    var ctx = scene(root, { world: p.world || "studio" }), sa = ctx.safe, P = ctx.portrait;
    var bars = arr(p.bars).filter(function (b) { return b && (b.label || b.value != null); }).slice(0, 6);
    if (bars.length < 2) bars = bars.concat([{ label: "A", value: 3 }, { label: "B", value: 5 }]).slice(0, 2);
    var n = bars.length, vals = bars.map(function (b) { return Math.max(0, num(b.value, 0)); }), vmax = Math.max.apply(null, vals.concat([1e-9]));
    var hd = headline(ctx, p.title), top = hd.bottom + (hd.a ? 20 : 0);
    var cell = (sa.w - 20) / n, lsz = P ? 42 : 42;
    var labs = bars.map(function (b) { return layoutText(str(b.label), { size: lsz, maxWidth: cell * 0.92, maxLines: 2 }); });
    var labH = Math.max.apply(null, labs.map(function (l) { return l.h; }));
    var riderS = P ? Math.min(cell * 0.62, 120) : Math.min(cell * 0.42, 124), valSz = P ? 48 : 52, valH = valSz * 1.05;
    var baseline = sa.b - labH - 30, maxH = baseline - (top + valH + 14 + riderS * 1.18);
    var barW = P ? Math.min(cell * 0.56, 124) : Math.min(cell * 0.4, 150);
    var stg = el("g", null, ctx.world);
    el("ellipse", { cx: f2(W / 2), cy: f2(baseline + 10), rx: f2(sa.w * 0.55), ry: 40, fill: fvGlow("#7B5CFF", 0.45) }, stg);
    el("rect", { x: f2(sa.x + 6), y: f2(baseline - 2), width: f2(sa.w - 12), height: 16, rx: 8, fill: "#C9C2EE", opacity: 0.32 }, stg);
    var times = seqTimes(bars.map(function (b) { return str(b.label); }), null, 0.6, D * 0.8);
    bars.forEach(function (b, i) {
      var c = col(b.color, CYCLE[i % CYCLE.length]), x = sa.x + 10 + cell * (i + 0.5), hgt = Math.max(barW * 0.3, (maxH * vals[i]) / vmax);
      var t0 = i === 0 ? Math.max(0.3, Math.min(times[0] - 0.3, 1.0)) : Math.max(0.3 + i * 0.25, times[i] - 0.3), gd = 0.95;
      var g = el("g", null, ctx.world);
      var glow = el("rect", { x: f2(x - barW * 0.8), width: f2(barW * 1.6), rx: f2(barW * 0.8), fill: fvGlow(c, 0.5) }, g);
      var body = el("rect", { x: f2(x - barW / 2), width: f2(barW), rx: f2(barW * 0.22), fill: fvGrad(c, "h") }, g);
      var shd = el("rect", { x: f2(x + barW * 0.18), width: f2(barW * 0.32), rx: f2(barW * 0.16), fill: shade(c, 0.2), opacity: 0.55 }, g);
      var hl = el("rect", { x: f2(x - barW * 0.36), width: f2(barW * 0.14), rx: f2(barW * 0.07), fill: "#FFFFFF", opacity: 0.35 }, g);
      function hAt(t) { var q = (t - t0) / gd; return q <= 0 ? 0 : hgt * (q >= 1 ? 1 : EASE.pop(q)); }
      st.fns.push(function (t) {
        var h = hAt(t);
        g.style.display = h > 0.5 ? "" : "none";
        var yT = baseline - h;
        body.setAttribute("y", f2(yT)); body.setAttribute("height", f2(h + 4));
        shd.setAttribute("y", f2(yT + barW * 0.1)); shd.setAttribute("height", f2(Math.max(0, h - barW * 0.1)));
        hl.setAttribute("y", f2(yT + barW * 0.14)); hl.setAttribute("height", f2(Math.max(0, h * 0.7 - barW * 0.14)));
        glow.setAttribute("y", f2(yT - barW * 0.5)); glow.setAttribute("height", f2(h + barW));
      });
      var rider;
      if (b.illus) { rider = illus(illusName(b.illus, "star"), { x: x, y: baseline, size: riderS, shadow: "none" }); }
      else { var mg = mini(ctx.world, tint(c, 0.15), i); rider = new Actor(mg, false, { r: 42, layer: 1, kind: "mini", label: "rider" }); rider.size(riderS / 84); rider.bottom = 40; }
      var rb = rider.bottom != null ? rider.bottom : 100, rk = riderS / (b.illus ? 200 : 84);
      rider.enter(t0 + 0.45, "pop", 0.5).float(3, 2.8 + i * 0.2, 4);
      rider.hook(function (t, cs) { cs.x = x + (cs.x - rider.b.x); cs.y = baseline - hAt(t) - rb * rk + (cs.y - rider.b.y); });
      var nb = bigNumber(ctx, { value: vals[i], prefix: p.prefix, suffix: p.unit, decimals: p.decimals, at: t0 + 0.15, dur: gd, size: valSz, x: x, y: baseline, maxWidth: cell * 0.98 });
      nb.hook(function (t, cs) { cs.y = baseline - hAt(t) - riderS * 1.18 - 10 - valH / 2; });
      say(ctx, str(b.label), { x: x, y: baseline + 30 + labH / 2, size: labs[i].size, maxWidth: cell * 0.92, maxLines: 2, at: t0 + 0.1, stagger: 0.05 });
      burst(ctx, x, baseline - hgt, t0 + gd * 0.55, { radius: barW * 1.1, count: 7 });
    });
  };

  // ------------------------- public API -------------------------
  function render(id, root, props) {
    var fn = TPL[id];
    if (!fn) throw new Error("Unknown clean-shapes template: " + id);
    fn(root || V.root(), T(props));
  }
  function fallback(root, narration) {
    root = root || V.root();
    st = null;
    var text = str(narration || V.narration), words = contentWords(text);
    var pick = null;
    for (var i = 0; i < words.length && !pick; i++) { var w = normWord(words[i]); if (illusFn(w)) pick = w; else if (w.length > 4 && illusFn(w.replace(/s$/, ""))) pick = w.replace(/s$/, ""); }
    pick = pick || "planet";
    var ctx = scene(root, { world: worldFor(pick) === "studio" ? "space" : worldFor(pick) }), sa = ctx.safe, P = ctx.portrait;
    var hs = P ? sa.w * 0.62 : sa.h * 0.62;
    var cap = words.slice(0, 5).join(" ");
    var hd = cap ? headline(ctx, cap, { at: 0.3 }) : { bottom: sa.y };
    illus(pick, { x: P ? W * 0.6 : W * 0.6, y: (hd.bottom + sa.b) / 2, size: Math.min(hs, sa.b - hd.bottom - 40) }).pop(0.2).float(10, 4, 2);
    creature("pip", { x: P ? sa.x + 140 : sa.x + 220, y: P ? sa.b - 150 : sa.b - 170, size: P ? 240 : 280, look: [0.8, -0.3] }).pop(0.3).float(8, 3.6, 1.5).feel("happy", Math.min(1.5, D * 0.3));
  }

  S.scene = scene;
  S.illus = illus;
  S.creature = creature;
  S.mini = mini;
  S.morph = morph;
  S.zoomThrough = zoomThrough;
  S.particles = particles;
  S.burst = burst;
  S.connector = connector;
  S.say = say;
  S.tag = tag;
  S.bigNumber = bigNumber;
  S.actor = actor;
  S.when = when;
  S.syncTimes = syncTimes;
  S.onT = onT;
  S.palette = PAL;
  S.cast = Object.keys(CAST);
  S.worlds = WORLDS.slice();
  S.illusNames = function () { return Object.keys(ILL); };
  S.worldFor = worldFor;
  S.defineIllus = function (name, fn) {
    if (typeof fn !== "function") return;
    defIllus(name, function (g, o, R) { var r = fn(g, o, R) || {}; return { r: r.r || 100, bottom: r.bottom, anim: r.anim, glow: r.glow }; });
  };
  S.svgEl = el;
  S.ball = ball;
  S.fvGrad = fvGrad;
  S.fvGlow = fvGlow;
  S.shade = shade;
  S.tint = tint;
  S.mix = mix;
  S.smoothPath = smoothPath;
  S.sparkleD = sparkleD;
  S.heartD = heartD;
  S.starD = starD;
  S.cloudD = cloudD;
  S.cuteFace = cuteFace;
  S.shapes = SHAPE_NAMES.slice();
  S.shapePath = shapePath;
  S.measureBlock = function (text, o) { o = o || {}; return measureBlock(text, { size: num(o.size, 96), maxWidth: num(o.maxWidth, safeArea().w), maxLines: num(o.maxLines, 3), weight: o.weight }); };
  S.measureText = function (text, size, weight) { return textW(str(text).replace(/\*/g, ""), num(size, 96), weight || 800); };
  S.safe = function () { return safeArea(); };
  S.colorOf = function (c, d) { return col(c, d); };
  S.templates = Object.keys(TPL);
  S.render = render;
  S.fallback = fallback;
  S.flush = function () {
    if (!st) return;
    // Entrances that are still running when the scene ends get cut off: report them.
    st.actors.forEach(function (a) {
      if (a.ent && a.ent.t + a.ent.d > D + 0.05) V.error("clean-shapes: " + a.kind + " \"" + String(a.label).slice(0, 30) + "\" enters at " + a.ent.t.toFixed(2) + " s and is still entering after the scene ends (" + D.toFixed(2) + " s)");
    });
    frame(V.time());
  };
  // Screen boxes (pixels) of the key content visible at time t, for the tester's safe-area check.
  S.inspect = function (t) {
    if (!st) return [];
    t = num(t, V.time());
    var camMoving = st.cam.moving(t), out = [];
    st.actors.forEach(function (a) {
      if (!a.inspectable || !a.visible || !a.cur.vis) return;
      var mv = camMoving || a.moving(t);
      if (a.layer === "ui") {
        if (a.firstT != null && t < a.firstT) return;
        var r = a.node.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return;
        out.push({ kind: a.kind, label: a.label, x: r.left, y: r.top, w: r.width, h: r.height, moving: mv });
        return;
      }
      if (a.layer == null) return;
      var c = a.cur, pr = project(c.x, c.y, a.layer, t), s = Math.abs(c.s) * pr[2];
      var bx = a.kind === "creature" ? [-108, -126, 108, 108] : [-a.r0, -a.r0, a.r0, a.bottom != null ? a.bottom : a.r0];
      out.push({ kind: a.kind, label: a.label, x: (pr[0] + bx[0] * s) * UNIT, y: (pr[1] + bx[1] * s) * UNIT, w: (bx[2] - bx[0]) * s * UNIT, h: (bx[3] - bx[1]) * s * UNIT, moving: mv });
    });
    return out;
  };
})();

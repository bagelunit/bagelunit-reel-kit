/* Inked Body engine (style id: inked-body).
 *
 * Black-and-white manga ink illustration about the science of strength, with one red accent for the
 * body part being talked about.
 *
 * Architecture
 * - Build time: S.scene(root) makes one div (.ia) holding ONE svg. Back to front: defs (hatch
 *   patterns, clip paths; never hidden), a screen-space "under" group (focus and speed lines behind
 *   the drawing), the world group (camera matrix; layers back, figs, wfx), a screen-space "over"
 *   group (lines over the drawing), the lettering group (thumbnail titles, counters, notes, marks)
 *   and an fx group (impact bursts, ink splashes). Colours are CSS variables on .ia (--bg page,
 *   --pg page ink, --ink figure line, --fill body, --rim, --red, --orange), so an inverted impact
 *   frame or a black page only swaps variables; red stays red.
 * - World units: the frame is 1000 units tall and Ww = 1000 * W / H wide (x right, y down). The
 *   camera is { x, y, zoom } plus punch-ins and shakes; K = H / 1000 px per unit at zoom 1.
 * - Figures: ONE 2D rig shared by the cast (rook, brick), seen from the side. A pose is a small
 *   vector (hip position, torso angle and hunch, neck angle, wrist and ankle targets, foot angles,
 *   hand shapes). Arms and legs are solved with 2-bone IK, so contact poses keep hands and feet
 *   planted while an exercise loops. Each body segment (torso, neck, upper arm, forearm, thigh,
 *   shin) is a muscular contour built from a width profile along the bone (front and back half
 *   widths), drawn as paper fill + ink outline, a hatched shadow band, a heavier brush line on the
 *   shadow side, thin anatomy lines, and its own red highlight layer (regions, striations, tendon
 *   cords, x-ray bones). Heads are drawn in a head frame (spiky hair or buzz cut, sharp eye,
 *   expression brows and mouth, talk visemes from V.words).
 * - One V.onFrame function sets everything from t only: camera, colours, every figure (pose blend,
 *   loops, shake, sweat, highlight pulse), props, texts, effects. Nothing carries between frames,
 *   so seeking works both ways.
 * - Timing: templates find their words (keyword props, V.find, the longest content word, then a
 *   narration estimate), then clamp every beat into [0.2, duration - 1].
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
  var PORT = V.isPortrait, SQ = V.isSquare, LAND = !PORT && !SQ;
  var K = H / 1000, WW = 1000 * W / H;
  var IMPACT = 'Impact, "Arial Black", "Helvetica Neue", Arial, "Noto Sans", sans-serif';
  var HAND = '"Segoe Print", "Bradley Hand", "Comic Sans MS", "Chalkboard SE", "Comic Neue", cursive';
  var RED = "#E8232A", RED_D = "#8E0B12", ORANGE = "#F2762E";
  var MULT = String.fromCharCode(0xd7);

  // ------------------------- small utils -------------------------
  function u(px) { return V.s(px); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, p) { return a + (b - a) * p; }
  function num(v, d) { var n = typeof v === "number" ? v : parseFloat(v); return isFinite(n) ? n : d; }
  function f1(n) { return Math.round(n * 10) / 10; }
  function f2(n) { return Math.round(n * 100) / 100; }
  function str(v) { return typeof v === "string" ? v.trim() : v == null ? "" : String(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function rad(d) { return (d * PI) / 180; }
  function deg(r) { return (r * 180) / PI; }
  function smooth(p) { p = clamp(p, 0, 1); return p * p * (3 - 2 * p); }
  function outQ(p) { p = clamp(p, 0, 1); return 1 - (1 - p) * (1 - p); }
  function outC(p) { p = clamp(p, 0, 1); return 1 - Math.pow(1 - p, 3); }
  function inOut(p) { p = clamp(p, 0, 1); return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2; }
  function outBack(p) { p = clamp(p, 0, 1); var c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); }
  function hash(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function frac(x) { return x - Math.floor(x); }
  function pick(list, v, d) { v = str(v).toLowerCase(); return list.indexOf(v) >= 0 ? v : d; }
  function svg(tag, attrs, parent) {
    var n = doc.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function div(cls, parent) {
    var n = doc.createElement("div");
    if (cls) n.className = cls;
    if (parent) parent.appendChild(n);
    return n;
  }
  // Visibility windows: list of {at, on}; visible before the first entry unless it is a show.
  function visAt(list, t) { var v = !(list.length && list[0].on); list.forEach(function (q) { if (q.at <= t) v = q.on; }); return v; }
  function addVis(list, at, on) { list.push({ at: num(at, 0), on: on }); list.sort(function (a, b) { return a.at - b.at; }); }
  function setD(el, d) { if (el.__d !== d) { el.__d = d; el.setAttribute("d", d); } }
  function setA(el, k, v) { var key = "__a_" + k; v = String(v); if (el[key] !== v) { el[key] = v; el.setAttribute(k, v); } }
  function show(el, on) { var v = on ? "" : "none"; if (el.__disp !== v) { el.__disp = v; el.style.display = v; } }
  function setOp(el, o) { o = f2(clamp(o, 0, 1)); if (el.__op !== o) { el.__op = o; el.style.opacity = String(o); } }
  var COMB = new RegExp("[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]", "g");
  function normWord(s) {
    return String(s == null ? "" : s).toLowerCase().normalize("NFKD").replace(COMB, "").replace(/[^\p{L}\p{N}]+/gu, "");
  }
  // Display text: sets like "3 x 8" may arrive with the multiplication sign; keep it (the fonts have it).
  function cleanText(s) { return str(s).replace(/\s+/g, " "); }

  // ------------------------- geometry -------------------------
  function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function mul(a, k) { return [a[0] * k, a[1] * k]; }
  function len(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1]); }
  function norm(a) { var l = len(a) || 1; return [a[0] / l, a[1] / l]; }
  function perp(a) { return [-a[1], a[0]]; } // clockwise on screen (y down)
  function dist(a, b) { return len(sub(a, b)); }
  function mixP(a, b, p) { return [lerp(a[0], b[0], p), lerp(a[1], b[1], p)]; }
  function dirDeg(dg) { var r = rad(dg); return [Math.cos(r), Math.sin(r)]; } // 0 = +x, 90 = down
  function upDeg(dg) { var r = rad(dg); return [Math.sin(r), -Math.cos(r)]; } // 0 = up, 90 = +x
  function P2(p) { return f1(p[0]) + " " + f1(p[1]); }
  function polyD(pts, close) {
    var s = "";
    for (var i = 0; i < pts.length; i++) s += (i ? " L" : "M") + P2(pts[i]);
    return pts.length ? s + (close ? " Z" : "") : "";
  }
  // Catmull-Rom spline through points as cubic beziers.
  function crD(pts, closed, tension) {
    var n = pts.length;
    if (n < 2) return "";
    if (n === 2) return "M" + P2(pts[0]) + " L" + P2(pts[1]) + (closed ? " Z" : "");
    var k = (tension == null ? 1 : tension) / 6, s = "M" + P2(pts[0]);
    var m = closed ? n : n - 1;
    for (var i = 0; i < m; i++) {
      var p0 = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[closed ? (i + 2) % n : Math.min(n - 1, i + 2)];
      var c1 = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
      var c2 = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
      s += " C" + P2(c1) + " " + P2(c2) + " " + P2(p2);
    }
    return s + (closed ? " Z" : "");
  }
  // Closed shape from two open sides (each smoothed), joined by straight ends.
  function sidesD(a, b) {
    var sa = crD(a, false), sb = crD(b, false);
    return sa + " L" + P2(b[0]) + sb.replace(/^M[^C]*/, " ") + " Z";
  }
  function circD(c, r) { return "M" + P2([c[0] - r, c[1]]) + " a" + f1(r) + " " + f1(r) + " 0 1 0 " + f1(2 * r) + " 0 a" + f1(r) + " " + f1(r) + " 0 1 0 " + f1(-2 * r) + " 0 Z"; }
  function ellD(c, rx, ry, rot) {
    var out = [], cr = Math.cos(rad(rot || 0)), sr = Math.sin(rad(rot || 0));
    for (var i = 0; i < 28; i++) { var a = (i / 28) * TAU, x = Math.cos(a) * rx, y = Math.sin(a) * ry; out.push([c[0] + x * cr - y * sr, c[1] + x * sr + y * cr]); }
    return crD(out, true);
  }
  // Noisy blob (ink splash) around c.
  function blobPts(c, r, n, seed, amp) {
    var pts = [];
    for (var i = 0; i < n; i++) {
      var a = (i / n) * TAU, k = 1 + (hash(seed * 13.7 + i * 3.1) - 0.5) * 2 * amp;
      if (hash(seed + i * 7.7) > 0.8) k *= 1.25;
      pts.push([c[0] + Math.cos(a) * r * k, c[1] + Math.sin(a) * r * k]);
    }
    return pts;
  }
  function starPts(c, R, r, n, rot, seed) {
    var p = [];
    for (var i = 0; i < n * 2; i++) {
      var rr = i % 2 ? r : R * (0.75 + 0.5 * hash((seed || 1) * 5.3 + i));
      var a = rad(rot + (i * 180) / n);
      p.push([c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr]);
    }
    return p;
  }
  // Quadratic curve sampled.
  function quadPts(a, c, b, n) {
    var out = [];
    for (var i = 0; i <= n; i++) {
      var t = i / n, m = 1 - t;
      out.push([m * m * a[0] + 2 * m * t * c[0] + t * t * b[0], m * m * a[1] + 2 * m * t * c[1] + t * t * b[1]]);
    }
    return out;
  }

  // ------------------------- text measuring and wrapping -------------------------
  var mctx = null;
  function measure(text, px, font, weight) {
    if (!mctx) mctx = doc.createElement("canvas").getContext("2d");
    mctx.font = (weight || "400") + " " + f1(px) + "px " + font;
    return mctx.measureText(String(text)).width;
  }
  // "*word*" marks the red words. Returns tokens [{w, red}].
  function parseEm(text) {
    var out = [], red = false;
    cleanText(text).split(" ").forEach(function (word) {
      var segs = [];
      word.split(/(\*)/).forEach(function (part) {
        if (part === "*") { red = !red; return; }
        if (part) segs.push({ t: part, red: red });
      });
      if (segs.length) out.push({ w: segs.map(function (q) { return q.t; }).join(""), red: segs.some(function (q) { return q.red; }), segs: segs });
    });
    return out;
  }
  function plainOf(text) { return cleanText(text).replace(/\*/g, ""); }
  function lineW(toks, px, font, weight, ls) {
    var s = toks.map(function (t) { return t.w; }).join(" ");
    return measure(s, px, font, weight) + (ls || 0) * px * s.length;
  }
  function greedy(toks, px, font, weight, maxW, ls) {
    var lines = [], cur = [];
    toks.forEach(function (t) {
      var next = cur.concat([t]);
      if (cur.length && lineW(next, px, font, weight, ls) > maxW) { lines.push(cur); cur = [t]; }
      else cur = next;
    });
    if (cur.length) lines.push(cur);
    return lines;
  }
  // Wrap into at most maxLines balanced lines; shrinks the size when needed. Returns
  // { lines: [[tok]], px, w, h, lh }.
  function wrapText(text, o) {
    o = o || {};
    var toks = Array.isArray(text) ? text : parseEm(text);
    var font = o.font || HAND, weight = o.weight || "700", px = o.px || 40, maxW = o.maxW || 600, maxLines = o.maxLines || 3, minPx = o.minPx || px * 0.5, ls = o.ls || 0;
    var lh = o.lh || 1.12, lines;
    if (!toks.length) return { lines: [], px: px, w: 0, h: 0, lh: lh * px };
    for (var guard = 0; guard < 30; guard++) {
      lines = greedy(toks, px, font, weight, maxW, ls);
      var tooWide = lines.some(function (l) { return lineW(l, px, font, weight, ls) > maxW * 1.001; });
      if ((lines.length <= maxLines && !tooWide) || px <= minPx) break;
      px *= 0.93;
    }
    // balance: narrowest width keeping the same line count
    if (lines.length > 1) {
      var n = lines.length, lo = 0, hi = maxW;
      lines.forEach(function (l) { lo = Math.max(lo, measure(l.map(function (t) { return t.w; }).sort(function (a, b) { return b.length - a.length; })[0], px, font, weight)); });
      for (var it = 0; it < 14; it++) {
        var mid = (lo + hi) / 2, tr = greedy(toks, px, font, weight, mid, ls);
        if (tr.length <= n) hi = mid; else lo = mid;
      }
      var bal = greedy(toks, px, font, weight, hi, ls);
      if (bal.length === n) lines = bal;
    }
    var w = 0;
    lines.forEach(function (l) { w = Math.max(w, lineW(l, px, font, weight, ls)); });
    return { lines: lines, px: px, w: w, h: lines.length * px * lh, lh: px * lh };
  }

  // ------------------------- timing -------------------------
  var STOP = {};
  "a an the and or but of to in on at by for with from into onto over under is are was were be been being it its this that these those your you we our us my me i his her their they them he she as than then so not no yes do does did have has had will would can could should very just more most less each every all any some about here there what when who how why which also too up out if one".split(" ").forEach(function (w) { STOP[w] = 1; });
  var T0 = 0.2;
  function TE() { return Math.max(T0 + 0.3, D - 1.0); }
  function ct(t, lo) { return clamp(num(t, T0), lo == null ? T0 : lo, TE()); }
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
    var parts = word.split(/\s+/);
    if (parts.length > 1) { t = V.find(parts[0], after || 0); if (t != null) return t; }
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
  // Fill missing landing times between known neighbours, keep order.
  function spread(lands, a, b) {
    var n = lands.length, out = lands.slice(), i = 0;
    a = a == null ? Math.min(0.8, D * 0.1) : a;
    b = b == null ? TE() : b;
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
    for (i = 0; i < n; i++) { out[i] = ct(out[i]); if (i && out[i] < out[i - 1] + 0.05) out[i] = Math.min(TE(), out[i - 1] + 0.05); }
    return out;
  }
  // Times for a list of words in narration order (null-safe).
  function syncTimes(keys) {
    var prev = 0, out = [];
    (keys || []).forEach(function (k) { var t = kwFind(k, prev); out.push(t); if (t != null) prev = t + 0.01; });
    return spread(out);
  }
  // Time of a word, or of the label's words, or a fraction of the scene.
  function wordTime(word, label, fallbackFrac, after) {
    var t = labelTime(label || "", word, after);
    return ct(t != null ? t : D * (fallbackFrac == null ? 0.45 : fallbackFrac));
  }

  // ------------------------- safe area (screen px and world units) -------------------------
  function safe() {
    var x0, y0, x1, y1;
    if (PORT) { x0 = W * 0.056; x1 = W * 0.944; y0 = H * 0.13; y1 = H * 0.755; }
    else if (SQ) { x0 = W * 0.07; x1 = W * 0.93; y0 = H * 0.08; y1 = H * 0.92; }
    else { x0 = W * 0.07; x1 = W * 0.93; y0 = H * 0.075; y1 = H * 0.925; }
    return { x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
  function safeW() {
    var s = safe();
    return { x0: s.x0 / K, y0: s.y0 / K, x1: s.x1 / K, y1: s.y1 / K, w: s.w / K, h: s.h / K, cx: s.cx / K, cy: s.cy / K };
  }
  function wu(px) { return px / K; } // screen px -> world units at zoom 1
  function box(x0, y0, x1, y1) { return { x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }; }

  // ------------------------- stage -------------------------
  var ST = null;
  var PAL = {
    white: { bg: "#FFFFFF", pg: "#0B0B0B", ink: "#0B0B0B", fill: "#FFFFFF", rim: "#FFFFFF", soft: "#D9D9D9" },
    black: { bg: "#0B0B0B", pg: "#F3F1EC", ink: "#0B0B0B", fill: "#FFFFFF", rim: "#FFFFFF", soft: "#3A3A3A" },
  };
  function scene(o, rootArg) {
    o = obj(o);
    var root = rootArg || V.root();
    if (ST && ST.root === root) {
      if (o.bg) ST.setBg(o.bg);
      return ST;
    }
    ST = new Stage(root, o);
    return ST;
  }
  function Stage(root, o) {
    var s = this;
    s.root = root;
    s.Ww = WW; s.portrait = PORT; s.square = SQ; s.landscape = LAND;
    s.bgName = pick(["white", "black"], o.bg, "white");
    s.ups = []; s.boxes = []; s.figs = []; s.uid = 0; s.inverts = []; s.pats = {};
    s.div = div("ia", root);
    s.svg = svg("svg", { "class": "ia-svg", viewBox: "0 0 " + W + " " + H, width: W, height: H, preserveAspectRatio: "none" }, s.div);
    s.defs = svg("defs", null, s.svg);
    s.under = svg("g", { "class": "ia-under" }, s.svg);
    s.wrap = svg("g", null, s.svg);
    s.camG = svg("g", { "class": "ia-cam" }, s.wrap);
    s.back = svg("g", null, s.camG);
    s.mid = svg("g", null, s.camG);
    s.figsG = svg("g", null, s.camG);
    s.wfx = svg("g", null, s.camG);
    s.over = svg("g", { "class": "ia-over" }, s.svg);
    s.top = svg("g", { "class": "ia-top" }, s.svg);
    s.topSvg = s.top;
    s.fx = svg("g", { "class": "ia-fx" }, s.svg);
    s.ui = div("ia-ui", s.div);
    s.cam = new Camera(s);
    s.applyColors(false);
    V.onFrame(function (t) { if (ST === s) s.tick(t); });
  }
  Stage.prototype.id = function (p) { return "ia" + (p || "") + ++this.uid; };
  Stage.prototype.setBg = function (b) { this.bgName = pick(["white", "black"], b, this.bgName); this.applyColors(false, true); };
  Stage.prototype.applyColors = function (inv, force) {
    var key = this.bgName + (inv ? "i" : "");
    if (this.__ck === key && !force) return;
    this.__ck = key;
    var p = PAL[this.bgName], st = this.div.style;
    var bg = inv ? p.pg : p.bg, pg = inv ? p.bg : p.pg, ink = inv ? p.fill : p.ink, fill = inv ? p.ink : p.fill;
    st.setProperty("--bg", bg); st.setProperty("--pg", pg); st.setProperty("--ink", ink); st.setProperty("--fill", fill);
    st.setProperty("--rim", inv ? p.pg : p.rim); st.setProperty("--soft", p.soft); st.setProperty("--red", RED); st.setProperty("--redd", RED_D); st.setProperty("--orange", ORANGE);
    this.div.style.background = bg;
    this.ink = ink; this.paper = bg;
  };
  Stage.prototype.on = function (fn) { this.ups.push(fn); return fn; };
  Stage.prototype.onFrame = function (fn) { return this.on(function (t) { fn(t); }); };
  Stage.prototype.addBox = function (fn) { this.boxes.push(fn); };
  Stage.prototype.tick = function (t) {
    var c = this.cam.at(t);
    this.camNow = c;
    var z = K * c.z;
    setA(this.camG, "transform", "matrix(" + f2(z) + " 0 0 " + f2(z) + " " + f1(W / 2 - c.x * z + c.dx) + " " + f1(H / 2 - c.y * z + c.dy) + ")");
    var inv = this.inverts.some(function (iv) { return t >= iv[0] && t < iv[1]; });
    this.applyColors(inv);
    for (var i = 0; i < this.ups.length; i++) {
      try { this.ups[i](t, c); } catch (e) { V.error("[inked-body frame] " + (e && e.message ? e.message : e)); this.ups.splice(i, 1); i--; }
    }
  };
  // world -> screen px with camera c
  Stage.prototype.proj = function (p, c) {
    c = c || this.cam.at(V.time());
    var z = K * c.z;
    return [(p[0] - c.x) * z + W / 2 + c.dx, (p[1] - c.y) * z + H / 2 + c.dy];
  };
  // hatch / cross patterns in user space, spacing in the referencing element's units
  Stage.prototype.pattern = function (kind, spacing) {
    spacing = Math.max(1.2, Math.round(spacing * 2) / 2);
    var key = kind + spacing;
    if (this.pats[key]) return this.pats[key];
    var id = this.id("p");
    var cls = kind.charAt(1) === "p" ? "p-s" : kind.charAt(1) === "r" ? "rd-s" : kind.charAt(1) === "w" ? "f-s" : "k-s";
    var sw = f2(spacing * (kind.charAt(0) === "x" ? 0.17 : 0.2));
    var p = svg("pattern", { id: id, patternUnits: "userSpaceOnUse", width: spacing, height: spacing, patternTransform: "rotate(" + (kind.charAt(0) === "v" ? 90 : -38) + ")" }, this.defs);
    svg("line", { x1: 0, y1: spacing / 2, x2: spacing, y2: spacing / 2, "class": cls, "stroke-width": sw }, p);
    if (kind.charAt(0) === "x") svg("line", { x1: spacing / 2, y1: 0, x2: spacing / 2, y2: spacing, "class": cls, "stroke-width": sw }, p);
    if (kind.charAt(0) === "d") { p.innerHTML = ""; svg("circle", { cx: spacing / 2, cy: spacing / 2, r: f2(spacing * 0.16), "class": cls.replace("-s", "-f") }, p); }
    this.pats[key] = "url(#" + id + ")";
    return this.pats[key];
  };
  Stage.prototype.invert = function (from, to) { this.inverts.push([from, to]); };

  // ------------------------- camera -------------------------
  function Camera(s) { this.st = s; this.keys = []; this.punches = []; this.shakes = []; this.rumbles = []; this.base = { x: WW / 2, y: 500, zoom: 1 }; }
  Camera.prototype.set = function (o) { o = obj(o); this.keys.push({ at: 0, dur: 0, x: num(o.x, null), y: num(o.y, null), zoom: num(o.zoom, null), ease: "inOut", set: true }); return this; };
  Camera.prototype.to = function (o, at, dur, ease) { o = obj(o); this.keys.push({ at: num(at, 0), dur: Math.max(0, num(dur, 0.8)), x: num(o.x, null), y: num(o.y, null), zoom: num(o.zoom, null), ease: ease || "inOut" }); return this; };
  Camera.prototype.push = function (zoom, at, dur) { this.keys.push({ at: num(at, 0), dur: Math.max(0.05, num(dur, 2)), zoom: num(zoom, 1.1), ease: "inOut", rel: true }); return this; };
  Camera.prototype.punch = function (at, zoom, x, y, dur) {
    this.punches.push({ at: num(at, 0), zoom: Math.max(1, num(zoom, 1.25)), x: num(x, null), y: num(y, null), dur: Math.max(0.05, num(dur, 0.14)), hold: 0.55, back: 0.6 });
    return this;
  };
  Camera.prototype.shake = function (at, amp, dur) { this.shakes.push({ at: num(at, 0), amp: num(amp, 10), dur: Math.max(0.05, num(dur, 0.35)) }); return this; };
  Camera.prototype.rumble = function (from, to, amp) { this.rumbles.push({ from: num(from, 0), to: num(to, D), amp: num(amp, 3) }); return this; };
  Camera.prototype.at = function (t) {
    var c = { x: this.base.x, y: this.base.y, z: this.base.zoom, dx: 0, dy: 0, moving: false };
    var ks = this.keys.slice().sort(function (a, b) { return a.at - b.at; });
    for (var i = 0; i < ks.length; i++) {
      var k = ks[i];
      if (t < k.at) break;
      var p = k.dur > 0 ? clamp((t - k.at) / k.dur, 0, 1) : 1;
      if (p < 1 && k.dur > 0) c.moving = true;
      var e = k.ease === "linear" ? p : k.ease === "out" ? outC(p) : inOut(p);
      if (k.rel) { c.z = lerp(c.z, c.z * k.zoom, e); continue; }
      if (k.x != null) c.x = lerp(c.x, k.x, e);
      if (k.y != null) c.y = lerp(c.y, k.y, e);
      if (k.zoom != null) c.z = lerp(c.z, k.zoom, e);
    }
    for (i = 0; i < this.punches.length; i++) {
      var pu = this.punches[i], dt = t - pu.at;
      if (dt < 0 || dt > pu.dur + pu.hold + pu.back) continue;
      var env = dt < pu.dur ? outQ(dt / pu.dur) : dt < pu.dur + pu.hold ? 1 : 1 - inOut((dt - pu.dur - pu.hold) / pu.back);
      c.moving = true;
      var zf = 1 + (pu.zoom - 1) * env;
      if (pu.x != null) { c.x = lerp(c.x, pu.x, env * 0.55); c.y = lerp(c.y, pu.y, env * 0.55); }
      c.z *= zf;
    }
    var amp = 0;
    for (i = 0; i < this.shakes.length; i++) {
      var sh = this.shakes[i], d2 = t - sh.at;
      if (d2 >= 0 && d2 < sh.dur) amp = Math.max(amp, sh.amp * (1 - d2 / sh.dur));
    }
    for (i = 0; i < this.rumbles.length; i++) { var r = this.rumbles[i]; if (t >= r.from && t < r.to) amp = Math.max(amp, r.amp); }
    if (amp > 0) {
      var fr = Math.floor(t * 30);
      c.dx = (hash(fr * 1.7 + 3) - 0.5) * 2 * u(amp);
      c.dy = (hash(fr * 2.3 + 11) - 0.5) * 2 * u(amp);
      if (amp > 4) c.moving = true;
    }
    return c;
  };

  // ======================================================================================
  // FIGURE RIG
  // ======================================================================================
  // Cast: segment lengths in units (a standing figure is about 640 units tall at scale 1).
  var CAST = {
    rook: { id: "rook", label: "Rook", build: "lean", hair: "spiky", shorts: "orange", L: { tor: 200, neck: 26, head: 42, ua: 122, fa: 112, hand: 36, th: 152, sh: 146, foot: 52 } },
    brick: { id: "brick", label: "Brick", build: "big", hair: "buzz", shorts: "dark", L: { tor: 212, neck: 20, head: 45, ua: 121, fa: 110, hand: 40, th: 146, sh: 140, foot: 58 } },
  };
  // Width profiles along each bone: [s, front half width, back half width] (lean build).
  var PROF = {
    tor: [[-0.1, 46, 48], [0.04, 54, 60], [0.16, 51, 63], [0.3, 46, 47], [0.45, 48, 44], [0.6, 56, 50], [0.74, 62, 58], [0.88, 54, 58], [0.98, 40, 50], [1.06, 24, 30], [1.12, 16, 20]],
    ua: [[-0.22, 8, 9], [-0.12, 26, 27], [0.03, 31, 32], [0.2, 26, 31], [0.4, 26, 28], [0.58, 27, 23], [0.8, 20, 19], [0.96, 16, 16], [1.07, 11, 11]],
    fa: [[-0.07, 13, 14], [0.06, 20, 18], [0.25, 21, 17], [0.5, 17, 14], [0.78, 12, 11], [0.96, 10, 10], [1.05, 7, 7]],
    th: [[-0.08, 30, 32], [0.1, 36, 37], [0.35, 35, 33], [0.6, 32, 28], [0.82, 27, 23], [0.97, 21, 20], [1.06, 15, 15]],
    sh: [[-0.06, 17, 18], [0.08, 18, 25], [0.28, 17, 29], [0.5, 15, 22], [0.72, 12, 14], [0.9, 10, 11], [1.03, 8, 9]],
    neck: [[-0.1, 21, 25], [0.5, 18, 20], [1.0, 16, 18]],
  };
  var SOFT_TOR = [[-0.1, 50, 50], [0.04, 62, 58], [0.16, 74, 58], [0.3, 84, 46], [0.45, 74, 44], [0.6, 54, 46], [0.74, 52, 50], [0.88, 46, 50], [0.98, 36, 44], [1.06, 22, 28], [1.12, 15, 19]];
  var BUILD = {
    lean: { tor: [1, 1], ua: [1, 1], fa: [1, 1], th: [1, 1], sh: [1, 1], neck: [1, 1] },
    big: { tor: [1.3, 1.36], ua: [1.45, 1.45], fa: [1.38, 1.38], th: [1.3, 1.3], sh: [1.28, 1.25], neck: [1.6, 1.6] },
    soft: { tor: [1, 1], ua: [0.9, 0.92], fa: [0.94, 0.94], th: [1.06, 1.04], sh: [1, 0.95], neck: [1.05, 1.05] },
  };
  function makeChar(name, build, shorts) {
    var base = CAST[name] || CAST.rook, b = BUILD[build] ? build : base.build;
    var C = { id: base.id, label: base.label, build: b, hair: base.hair, shorts: shorts || base.shorts, L: base.L, prof: {} };
    var legR = (base.L.th + base.L.sh) / 298, armR = (base.L.ua + base.L.fa) / 234;
    C.pk = legR; C.ak = armR;
    Object.keys(PROF).forEach(function (k) {
      var src = k === "tor" && b === "soft" ? SOFT_TOR : PROF[k], m = BUILD[b][k];
      C.prof[k] = src.map(function (r) {
        var f = r[1] * m[0], bb = r[2] * m[1];
        if (b === "soft" && (k === "ua" || k === "fa")) { f = lerp(f, 20 * m[0], 0.4); bb = lerp(bb, 20 * m[1], 0.4); }
        return [r[0], f, bb];
      });
    });
    C.wk = b === "big" ? 1.36 : b === "soft" ? 1.05 : 1;
    return C;
  }

  // ------------------------- poses (rook units, facing right, ground y = 0) -------------------------
  // hip: [x, y]; tor/neck: degrees from vertical (+ leans forward); hun: rounds the back (+) or arches (-);
  // aN/aF: wrist targets (absolute) or aNr/aFr (relative to the shoulder); eN/eF elbow side (+1 back);
  // lN/lF: ankle targets or lNr/lFr (relative to the hip); kN/kF knee side (-1 forward);
  // fN/fF: foot angle (0 forward, 90 down); hN/hF: hand shape; haN/haF: absolute hand angle;
  // fkN/fkF: forearm foreshortening; cx/cy: carried object offset from the wrists' midpoint.
  var POSES = {
    stand: { hip: [0, -310], tor: 2, nk: 4, aNr: [14, 227], aFr: [-6, 227], lN: [12, -18], lF: [-14, -18], fF: -3, hN: "relax", hF: "relax" },
    "idle-b": { hip: [0, -308], tor: 3, nk: 2, aNr: [16, 226], aFr: [-4, 226], lN: [12, -18], lF: [-14, -18], fF: -3, hN: "relax", hF: "relax" },
    hips: { hip: [0, -310], tor: 0, nk: -3, aNr: [2, 188], aFr: [-16, 188], haN: 70, haF: 70, lN: [24, -18], lF: [-28, -18], hN: "fist", hF: "fist" },
    crossed: { hip: [0, -310], tor: 1, nk: 0, aNr: [58, 112], aFr: [50, 108], fkN: 0.62, fkF: 0.62, haN: 175, haF: 175, lN: [18, -18], lF: [-20, -18], hN: "fist", hF: "fist" },
    flex: { hip: [0, -304], tor: -2, nk: -4, aNr: [96, -98], aFr: [-90, -100], eF: -1, lN: [30, -18], lF: [-36, -18], hN: "fist", hF: "fist" },
    "flex-b": { hip: [0, -298], tor: 2, nk: 0, aNr: [100, -108], aFr: [-94, -108], eF: -1, lN: [32, -18], lF: [-38, -18], hN: "fist", hF: "fist" },
    point: { hip: [0, -310], tor: 4, nk: 4, aNr: [224, 30], aFr: [-4, 227], haN: 8, lN: [16, -18], lF: [-16, -18], hN: "point", hF: "relax" },
    cheer: { hip: [0, -312], tor: 0, nk: -12, aNr: [70, -218], aFr: [-40, -220], eF: -1, lN: [20, -18], lF: [-22, -18], hN: "fist", hF: "fist" },
    slouch: { hip: [0, -304], tor: 9, hun: 24, nk: 36, aNr: [30, 224], aFr: [10, 224], lN: [8, -18], lF: [-10, -18], hN: "relax", hF: "relax" },
    kneel: { hip: [0, -196], tor: 4, nk: 4, aNr: [40, 200], aFr: [30, 200], lN: [-128, -14], fN: 172, lF: [92, -18], hN: "relax", hF: "relax" },
    fall: { hip: [20, -270], tor: 38, hun: 10, nk: 50, aNr: [120, 110], aFr: [-60, -150], eF: -1, lN: [130, -18], lF: [-120, -110], fF: 60, hN: "open", hF: "open" },
    strain: { hip: [0, -284], tor: 6, hun: 4, nk: 0, aNr: [44, 96], aFr: [30, 96], lN: [58, -18], lF: [-56, -18], hN: "fist", hF: "fist" },
    "pushup-up": { hip: [0, -165], tor: 66, nk: 76, aN: [183, -16], aF: [176, -16], lN: [-272, -44], lF: [-280, -46], fN: 65, fF: 65, haN: 0, haF: 0, hN: "flat", hF: "flat" },
    "pushup-down": { hip: [25, -74], tor: 85, nk: 86, aN: [183, -16], aF: [176, -16], lN: [-272, -44], lF: [-280, -46], fN: 65, fF: 65, haN: 0, haF: 0, hN: "flat", hF: "flat" },
    "pushup-up-bad": { hip: [14, -92], tor: 77, hun: -30, nk: 66, aN: [183, -16], aF: [176, -16], lN: [-272, -44], lF: [-280, -46], fN: 65, fF: 65, haN: 0, haF: 0, hN: "flat", hF: "flat" },
    "pushup-down-bad": { hip: [30, -48], tor: 82, hun: -14, nk: 70, aN: [183, -16], aF: [176, -16], lN: [-272, -44], lF: [-280, -46], fN: 65, fF: 65, haN: 0, haF: 0, hN: "flat", hF: "flat" },
    plank: { hip: [4, -103], tor: 79, nk: 82, aN: [310, -14], aF: [300, -14], lN: [-288, -44], lF: [-296, -46], fN: 65, fF: 65, haN: 0, haF: 0, hN: "fist", hF: "fist" },
    "plank-b": { hip: [4, -99], tor: 80, nk: 84, aN: [310, -14], aF: [300, -14], lN: [-288, -44], lF: [-296, -46], fN: 65, fF: 65, haN: 0, haF: 0, hN: "fist", hF: "fist" },
    "plank-bad": { hip: [10, -60], tor: 84, hun: -22, nk: 78, aN: [310, -14], aF: [300, -14], lN: [-288, -44], lF: [-296, -46], fN: 65, fF: 65, haN: 0, haF: 0, hN: "fist", hF: "fist" },
    planche: { hip: [-138, -252], tor: 93, nk: 104, aN: [0, -14], aF: [-8, -14], lNr: [-296, -6], lFr: [-296, -2], fN: 178, fF: 178, haN: 0, haF: 0, hN: "flat", hF: "flat" },
    "planche-b": { hip: [-138, -249], tor: 92, nk: 102, aN: [0, -14], aF: [-8, -14], lNr: [-296, 2], lFr: [-296, 6], fN: 176, fF: 176, haN: 0, haF: 0, hN: "flat", hF: "flat" },
    "planche-bad": { hip: [-112, -214], tor: 104, hun: 18, nk: 120, aN: [0, -14], aF: [-8, -14], lNr: [-272, 110], lFr: [-268, 116], fN: 150, fF: 150, haN: 0, haF: 0, hN: "flat", hF: "flat" },
    handstand: { hip: [0, -448], tor: 180, nk: 180, aN: [0, -14], aF: [-6, -14], lNr: [0, -297], lFr: [-8, -297], fN: -90, fF: -90, haN: 0, haF: 0, hN: "flat", hF: "flat" },
    "handstand-b": { hip: [4, -447], tor: 179, nk: 178, aN: [0, -14], aF: [-6, -14], lNr: [12, -296], lFr: [4, -296], fN: -88, fF: -88, haN: 0, haF: 0, hN: "flat", hF: "flat" },
    "handstand-bad": { hip: [-24, -420], tor: 186, hun: -38, nk: 172, aN: [0, -14], aF: [-6, -14], lNr: [120, -262], lFr: [112, -262], fN: -40, fF: -40, haN: 0, haF: 0, hN: "flat", hF: "flat" },
    hang: { hip: [-6, -360], tor: -2, nk: 4, aN: [0, -790], aF: [-8, -790], lNr: [10, 290], lFr: [-4, 290], fN: 70, fF: 70, haN: -90, haF: -90, hN: "grip", hF: "grip" },
    "hang-b": { hip: [-3, -358], tor: 0, nk: 6, aN: [0, -790], aF: [-8, -790], lNr: [26, 286], lFr: [12, 287], fN: 66, fF: 66, haN: -90, haF: -90, hN: "grip", hF: "grip" },
    "hang-bad": { hip: [-8, -410], tor: -4, nk: -8, aN: [0, -790], aF: [-8, -790], lNr: [70, 240], lFr: [-50, 250], fN: 50, fF: 80, haN: -90, haF: -90, hN: "grip", hF: "grip" },
    "pullup-down": { hip: [-8, -362], tor: -3, nk: 4, aN: [0, -790], aF: [-8, -790], lNr: [-60, 250], lFr: [-74, 250], fN: 60, fF: 60, haN: -90, haF: -90, hN: "grip", hF: "grip" },
    "pullup-up": { hip: [-44, -560], tor: -6, nk: -8, aN: [0, -790], aF: [-8, -790], lNr: [-70, 240], lFr: [-84, 240], fN: 60, fF: 60, haN: -90, haF: -90, hN: "grip", hF: "grip" },
    "pullup-half": { hip: [-24, -452], tor: -10, nk: 0, aN: [0, -790], aF: [-8, -790], lNr: [80, 236], lFr: [40, 250], fN: 40, fF: 60, haN: -90, haF: -90, hN: "grip", hF: "grip" },
    "squat-up": { hip: [0, -310], tor: 4, nk: 2, aNr: [200, 40], aFr: [196, 44], lN: [14, -18], lF: [-12, -18], hN: "fist", hF: "fist" },
    "squat-down": { hip: [-80, -172], tor: 42, nk: 22, aNr: [200, 30], aFr: [196, 34], lN: [14, -18], lF: [-12, -18], hN: "fist", hF: "fist" },
    "squat-down-bad": { hip: [-40, -228], tor: 60, hun: 30, nk: 52, aNr: [60, 200], aFr: [50, 200], lN: [14, -18], lF: [-12, -18], hN: "relax", hF: "relax" },
    "lunge-a": { hip: [0, -300], tor: 2, nk: 2, aNr: [10, 226], aFr: [0, 226], lN: [96, -18], lF: [-110, -18], fF: 20, hN: "relax", hF: "relax" },
    "lunge-b": { hip: [-12, -176], tor: 4, nk: 2, aNr: [12, 226], aFr: [2, 226], lN: [100, -18], lF: [-150, -34], fF: 40, hN: "relax", hF: "relax" },
    "lunge-bad": { hip: [18, -196], tor: 32, hun: 12, nk: 30, aNr: [40, 220], aFr: [30, 220], lN: [70, -18], lF: [-120, -30], fF: 40, hN: "relax", hF: "relax" },
    "run-a": { hip: [0, -300], tor: 14, nk: 14, aNr: [-50, 120], aFr: [90, 40], lN: [82, -130], fN: 30, lF: [-150, -40], fF: 60, hN: "fist", hF: "fist" },
    "run-b": { hip: [0, -306], tor: 14, nk: 14, aNr: [90, 40], aFr: [-50, 120], lN: [-150, -40], fN: 60, lF: [82, -130], fF: 30, hN: "fist", hF: "fist" },
    "run-bad": { hip: [0, -312], tor: -6, nk: -6, aNr: [30, 200], aFr: [-10, 210], lN: [130, -24], fN: -32, lF: [-60, -20], fF: 10, hN: "relax", hF: "relax" },
    "tug-a": { hip: [-40, -262], tor: -26, nk: -10, aN: [100, -400], aF: [90, -396], lN: [80, -18], lF: [-90, -18], fN: -10, haN: 0, haF: 0, hN: "grip", hF: "grip" },
    "tug-lose": { hip: [40, -282], tor: 32, hun: 6, nk: 30, aNr: [150, 96], aFr: [140, 104], lN: [150, -18], lF: [-50, -70], fF: 50, haN: 0, haF: 0, hN: "grip", hF: "grip" },
    "tug-b": { hip: [-58, -250], tor: -34, nk: -14, aN: [84, -392], aF: [74, -388], lN: [80, -18], lF: [-100, -18], fN: -14, haN: 0, haF: 0, hN: "grip", hF: "grip" },
    "lift-a": { hip: [-60, -205], tor: 30, nk: 18, aNr: [52, 112], aFr: [40, 108], lN: [44, -18], lF: [8, -18], hN: "flat", hF: "flat", haN: -60, haF: -60, cx: 34, cy: -58 },
    "lift-b": { hip: [0, -308], tor: -4, nk: -8, aNr: [24, -226], aFr: [8, -226], eF: 1, lN: [26, -18], lF: [-28, -18], hN: "flat", hF: "flat", haN: -90, haF: -90, cx: 4, cy: -66 },
    "lift-bad": { hip: [-40, -300], tor: 72, hun: 40, nk: 64, aNr: [40, 218], aFr: [30, 218], lN: [40, -18], lF: [10, -18], hN: "flat", hF: "flat", haN: 80, haF: 80, cx: 30, cy: 30 },
    "curl-a": { hip: [0, -310], tor: 2, nk: 4, aNr: [22, 228], aFr: [-6, 227], lN: [14, -18], lF: [-14, -18], hN: "grip", hF: "relax", haN: 90 },
    "curl-b": { hip: [0, -310], tor: 2, nk: 4, aNr: [70, 40], aFr: [-6, 227], lN: [14, -18], lF: [-14, -18], hN: "grip", hF: "relax" },
    "curl-bad": { hip: [0, -308], tor: -18, nk: -14, aNr: [86, 22], aFr: [-10, 226], lN: [20, -18], lF: [-20, -18], hN: "grip", hF: "relax" },
    "dip-up": { hip: [-6, -500], tor: 3, nk: 4, aN: [10, -470], aF: [2, -470], lNr: [-60, 240], lFr: [-74, 240], fN: 60, fF: 60, haN: 0, haF: 0, hN: "grip", hF: "grip" },
    "dip-down": { hip: [-50, -400], tor: 24, nk: 30, aN: [10, -470], aF: [2, -470], lNr: [-60, 240], lFr: [-74, 240], fN: 60, fF: 60, haN: 0, haF: 0, hN: "grip", hF: "grip" },
    "dip-bad": { hip: [-30, -452], tor: 40, hun: 20, nk: 46, aN: [10, -470], aF: [2, -470], lNr: [-40, 244], lFr: [-54, 244], fN: 60, fF: 60, haN: 0, haF: 0, hN: "grip", hF: "grip" },
  };
  POSES.idle = POSES.stand;
  POSES["pullup-down-bad"] = POSES["hang-bad"];
  POSES["run-a-bad"] = POSES["run-bad"];
  var POSE_ALIAS = { "squat-up": "squat-up", "lunge-a": "lunge-a", "lunge-b": "lunge-b", "run-a": "run-a", "run-b": "run-b", "tug-a": "tug-a", "tug-b": "tug-b", "lift-a": "lift-a", "lift-b": "lift-b", "curl-a": "curl-a", "curl-b": "curl-b", "dip-up": "dip-up", "dip-down": "dip-down", pushup: "pushup-up", pullup: "pullup-up", "pullup-up": "pullup-up", squat: "squat-down", lift: "lift-b", dip: "dip-down", curl: "curl-b", run: "run-a", sprint: "run-a", lunge: "lunge-b", tug: "tug-b" };
  function poseName(n) { n = str(n).toLowerCase(); if (POSES[n]) return n; if (POSE_ALIAS[n]) return POSE_ALIAS[n]; return "stand"; }

  // Exercise loops: keys (ping-pong between key 0 and key 1), seconds per rep, rest pose, props.
  var EX = {
    pushup: { keys: ["pushup-up", "pushup-down"], period: 1.8, rest: "pushup-up", muscle: "chest", reps: true, hold: 0.15 },
    pullup: { keys: ["pullup-down", "pullup-up"], period: 2.2, rest: "hang", muscle: "lats", reps: true, prop: "bar", hold: 0.2 },
    squat: { keys: ["squat-up", "squat-down"], period: 2.0, rest: "stand", muscle: "quads", reps: true, hold: 0.1 },
    plank: { keys: ["plank", "plank-b"], period: 2.6, rest: "plank", muscle: "abs", reps: false, tremble: 0.6 },
    planche: { keys: ["planche", "planche-b"], period: 1.6, rest: "planche", muscle: "shoulders", reps: false, tremble: 1.0 },
    sprint: { keys: ["run-a", "run-b"], period: 0.62, rest: "stand", muscle: "hamstrings", reps: false, speed: true, bob: 8 },
    tug: { keys: ["tug-a", "tug-b"], period: 1.3, rest: "tug-a", muscle: "grip", reps: false, prop: "rope", tremble: 0.8 },
    lift: { keys: ["lift-a", "lift-b"], period: 2.6, rest: "lift-a", muscle: "back", reps: true, prop: "boulder", hold: 0.25 },
    curl: { keys: ["curl-a", "curl-b"], period: 1.7, rest: "curl-a", muscle: "biceps", reps: true, prop: "dumbbell", hold: 0.1 },
    dip: { keys: ["dip-up", "dip-down"], period: 1.9, rest: "dip-up", muscle: "triceps", reps: true, prop: "dipbars", hold: 0.1 },
    hang: { keys: ["hang", "hang-b"], period: 2.8, rest: "hang", muscle: "grip", reps: false, prop: "bar", tremble: 0.3 },
    handstand: { keys: ["handstand", "handstand-b"], period: 2.2, rest: "handstand", muscle: "shoulders", reps: false, tremble: 0.6 },
    flex: { keys: ["flex", "flex-b"], period: 1.4, rest: "flex", muscle: "biceps", reps: false },
    lunge: { keys: ["lunge-a", "lunge-b"], period: 2.0, rest: "lunge-a", muscle: "glutes", reps: true, hold: 0.1 },
    idle: { keys: ["stand", "idle-b"], period: 3.2, rest: "stand", muscle: "none", reps: false },
  };
  var BAD = {
    pushup: ["pushup-up-bad", "pushup-down-bad"], squat: ["squat-up", "squat-down-bad"], pullup: ["pullup-down", "pullup-half"],
    plank: ["plank-bad", "plank-bad"], planche: ["planche-bad", "planche-bad"], sprint: ["run-bad", "run-b"], tug: ["tug-a", "tug-a"],
    lift: ["lift-bad", "lift-a"], curl: ["curl-a", "curl-bad"], dip: ["dip-up", "dip-bad"], hang: ["hang-bad", "hang-bad"],
    handstand: ["handstand-bad", "handstand-bad"], flex: ["slouch", "slouch"], lunge: ["lunge-a", "lunge-bad"], idle: ["slouch", "slouch"],
  };
  Object.keys(BAD).forEach(function (k) { var e = EX[k]; EX[k + "-bad"] = { keys: BAD[k], period: e.period * 1.05, rest: BAD[k][0], muscle: e.muscle, reps: e.reps, prop: e.prop, tremble: e.tremble, bad: true, base: k }; });
  var EX_ALIAS = { "push-up": "pushup", "push-ups": "pushup", pushups: "pushup", "pull-up": "pullup", "pull-ups": "pullup", pullups: "pullup", "chin-up": "pullup", squats: "squat", run: "sprint", running: "sprint", boulder: "lift", deadhang: "hang", "dead-hang": "hang", dips: "dip", curls: "curl", lunges: "lunge", stand: "idle", none: "idle" };
  function exName(n) { n = str(n).toLowerCase(); if (EX[n]) return n; if (EX_ALIAS[n]) return EX_ALIAS[n]; var b = n.replace(/-bad$/, ""); if (n !== b && EX[(EX_ALIAS[b] || b) + "-bad"]) return (EX_ALIAS[b] || b) + "-bad"; return null; }

  // Normalised pose: absolute numeric targets for one character.
  var NP_CACHE = {};
  function npose(name, C) {
    var key = C.id + C.build + name;
    if (NP_CACHE[key]) return NP_CACHE[key];
    var P = POSES[name] || POSES.stand, k = C.pk, ak = C.ak;
    var hip = [P.hip[0] * k, P.hip[1] * k], tor = P.tor || 0, hun = (P.hun || 0) * C.wk;
    var td = upDeg(tor), tn = perp(td);
    var sh = add(hip, mul(td, C.L.tor));
    var shN = add(sh, mul(td, -4)), shF = add(add(sh, mul(tn, -7)), mul(td, 2));
    var hipN = add(hip, mul(tn, 4)), hipF = add(add(hip, mul(tn, -6)), mul(td, 2));
    function tgt(abs, rel, origin, kk) { return abs ? [abs[0] * k, abs[1] * k] : rel ? add(origin, [rel[0] * kk, rel[1] * kk]) : add(origin, [0, 200]); }
    var aN = tgt(P.aN, P.aNr || [14, 227], shN, ak), aF = tgt(P.aF, P.aFr || [-6, 227], shF, ak);
    var lN = tgt(P.lN, P.lNr || [12, 292], hipN, k), lF = tgt(P.lF, P.lFr || [-12, 292], hipF, k);
    var o = {
      hx: hip[0], hy: hip[1], tor: tor, hun: hun, nk: P.nk != null ? P.nk : tor,
      aNx: aN[0], aNy: aN[1], aFx: aF[0], aFy: aF[1], eN: P.eN != null ? P.eN : 1, eF: P.eF != null ? P.eF : 1,
      lNx: lN[0], lNy: lN[1], lFx: lF[0], lFy: lF[1], kN: P.kN != null ? P.kN : -1, kF: P.kF != null ? P.kF : -1,
      fN: P.fN || 0, fF: P.fF || 0, fkN: P.fkN || 1, fkF: P.fkF || 1,
      haN: P.haN != null ? P.haN : 0, haF: P.haF != null ? P.haF : 0, hwN: P.haN != null ? 1 : 0, hwF: P.haF != null ? 1 : 0,
      cx: P.cx != null ? P.cx * k : 0, cy: P.cy != null ? P.cy * k : 0, hN: P.hN || "relax", hF: P.hF || "relax",
    };
    NP_CACHE[key] = o;
    return o;
  }
  function mixPose(a, b, p) {
    if (p <= 0) return a;
    if (p >= 1) return b;
    var o = {};
    for (var k in a) {
      var va = a[k], vb = b[k];
      if (typeof va === "number" && typeof vb === "number") o[k] = va + (vb - va) * p;
      else o[k] = p < 0.5 ? va : vb;
    }
    if (a.hwN !== b.hwN && a.hwN + b.hwN === 1) { o.haN = a.hwN ? a.haN : b.haN; }
    if (a.hwF !== b.hwF && a.hwF + b.hwF === 1) { o.haF = a.hwF ? a.haF : b.haF; }
    return o;
  }
  function ik(A, T, l1, l2, s) {
    var d = sub(T, A), dd = len(d), mx = l1 + l2 - 0.5, mn = Math.abs(l1 - l2) + 1;
    var dc = clamp(dd, mn, mx), dir = dd > 1e-6 ? mul(d, 1 / dd) : [0, 1];
    var base = Math.atan2(dir[1], dir[0]);
    var ca = clamp((l1 * l1 + dc * dc - l2 * l2) / (2 * l1 * dc), -1, 1), al = Math.acos(ca);
    var a = base + (s >= 0 ? 1 : -1) * al;
    return [[A[0] + Math.cos(a) * l1, A[1] + Math.sin(a) * l1], [A[0] + dir[0] * dc, A[1] + dir[1] * dc]];
  }
  function lerpAng(a, b, p) { var d = ((b - a + 540) % 360) - 180; return a + d * p; }
  // Joints of a normalised pose (local units).
  function solve(P, C) {
    var L = C.L, hip = [P.hx, P.hy];
    var td = upDeg(P.tor), tn = perp(td), hun = P.hun;
    function axis(s) { return add(add(hip, mul(td, L.tor * s)), mul(tn, -hun * Math.sin(PI * clamp(s, 0, 1)))); }
    var sh = axis(1), nb = axis(1.04), nd = upDeg(P.nk);
    var hc = add(nb, mul(nd, L.neck + L.head * 0.8));
    var shN = add(sh, mul(td, -4)), shF = add(add(sh, mul(tn, -7)), mul(td, 2));
    var hipN = add(hip, mul(tn, 4)), hipF = add(add(hip, mul(tn, -6)), mul(td, 2));
    var aN = ik(shN, [P.aNx, P.aNy], L.ua, L.fa * P.fkN, P.eN), aF = ik(shF, [P.aFx, P.aFy], L.ua, L.fa * P.fkF, P.eF);
    var lN = ik(hipN, [P.lNx, P.lNy], L.th, L.sh, P.kN), lF = ik(hipF, [P.lFx, P.lFy], L.th, L.sh, P.kF);
    var faAN = deg(Math.atan2(aN[1][1] - aN[0][1], aN[1][0] - aN[0][0])), faAF = deg(Math.atan2(aF[1][1] - aF[0][1], aF[1][0] - aF[0][0]));
    var haN = lerpAng(faAN, P.haN, P.hwN), haF = lerpAng(faAF, P.haF, P.hwF);
    var J = {
      hip: hip, sh: sh, nb: nb, hc: hc, td: td, tn: tn, axis: axis, nk: P.nk, tor: P.tor,
      shN: shN, shF: shF, elbowN: aN[0], elbowF: aF[0], wristN: aN[1], wristF: aF[1],
      hipN: hipN, hipF: hipF, kneeN: lN[0], kneeF: lF[0], ankleN: lN[1], ankleF: lF[1],
      haN: haN, haF: haF, hN: P.hN, hF: P.hF, fN: P.fN, fF: P.fF,
      toeN: add(lN[1], mul(dirDeg(P.fN), L.foot)), toeF: add(lF[1], mul(dirDeg(P.fF), L.foot)),
      handN: add(aN[1], mul(dirDeg(haN), L.hand * 0.5)), handF: add(aF[1], mul(dirDeg(haF), L.hand * 0.5)),
      carry: add(mixP(aN[1], aF[1], 0.5), [P.cx, P.cy]),
    };
    J.chest = add(axis(0.74), mul(tn, 30));
    J.neck = nb; J.head = hc;
    return J;
  }
  function poseBounds(J, C) {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, wk = C.wk;
    function inc(p, r) { x0 = Math.min(x0, p[0] - r); y0 = Math.min(y0, p[1] - r); x1 = Math.max(x1, p[0] + r); y1 = Math.max(y1, p[1] + r); }
    inc(J.hip, 52 * wk); inc(J.sh, 54 * wk); inc(J.J74 || J.chest, 26 * wk); inc(J.hc, C.L.head * 1.45);
    ["N", "F"].forEach(function (s) { inc(J["elbow" + s], 26 * wk); inc(J["wrist" + s], 18 * wk); inc(J["hand" + s], 22); inc(J["knee" + s], 28 * wk); inc(J["ankle" + s], 16); inc(J["toe" + s], 10); });
    return [x0, y0, x1, y1];
  }

  // ------------------------- body segments -------------------------
  function profAt(prof, s) {
    if (s <= prof[0][0]) return [prof[0][1], prof[0][2]];
    for (var i = 1; i < prof.length; i++) {
      if (s <= prof[i][0]) { var a = prof[i - 1], b = prof[i], p = (s - a[0]) / (b[0] - a[0] || 1); return [lerp(a[1], b[1], p), lerp(a[2], b[2], p)]; }
    }
    var l = prof[prof.length - 1];
    return [l[1], l[2]];
  }
  // A bone from A to B with a width profile. fs: which normal side is the front.
  function Seg(A, B, prof, fs, axisFn) {
    this.A = A; this.B = B; this.prof = prof; this.fs = fs;
    var d = sub(B, A); this.L = len(d) || 1; this.d = mul(d, 1 / this.L); this.n = perp(this.d); this.axisFn = axisFn;
  }
  Seg.prototype.base = function (s) { return this.axisFn ? this.axisFn(s) : [this.A[0] + this.d[0] * this.L * s, this.A[1] + this.d[1] * this.L * s]; };
  Seg.prototype.off = function (s, b) { var w = profAt(this.prof, s); return b >= 0 ? b * w[0] : b * w[1]; };
  Seg.prototype.pt = function (s, b) { var p = this.base(s), o = this.off(s, b) * this.fs; return [p[0] + this.n[0] * o, p[1] + this.n[1] * o]; };
  Seg.prototype.contour = function () {
    var fr = [], bk = [], self = this;
    this.prof.forEach(function (r) { fr.push(self.pt(r[0], 1)); bk.push(self.pt(r[0], -1)); });
    return crD(fr.concat(bk.reverse()), true);
  };
  Seg.prototype.line = function (list) { var self = this; return crD(list.map(function (q) { return self.pt(q[0], q[1]); }), false); };
  Seg.prototype.band = function (s0, s1, b0, b1, n) {
    n = n || 8;
    var out = [], back = [];
    for (var i = 0; i <= n; i++) { var s = lerp(s0, s1, i / n); out.push(this.pt(s, b1)); back.push(this.pt(s, b0)); }
    return out.concat(back.reverse());
  };
  Seg.prototype.side = function (s0, s1, b, n) { n = n || 8; var out = []; for (var i = 0; i <= n; i++) out.push(this.pt(lerp(s0, s1, i / n), b)); return out; };

  // Anatomy detail lines per segment (s along the bone, b across: + front, - back).
  var DETAIL = {
    ua: [[[0.02, 0.85], [0.28, 0.32], [0.42, -0.04]], [[0.04, -0.85], [0.28, -0.4], [0.42, -0.04]], [[0.62, 0.85], [0.78, 0.45], [0.9, 0.2]], [[0.34, -0.56], [0.64, -0.44]]],
    fa: [[[0.05, 0.6], [0.35, 0.2], [0.7, -0.1]], [[0.12, -0.5], [0.46, -0.38]]],
    th: [[[0.55, 0.92], [0.75, 0.55], [0.9, 0.2]], [[0.1, -0.5], [0.5, 0.02], [0.85, 0.42]], [[0.36, -0.7], [0.74, -0.55]]],
    sh: [[[0.1, -0.4], [0.3, -0.56], [0.55, -0.5]], [[0.16, 0.55], [0.84, 0.42]]],
    tor: [[[0.64, 1.0], [0.67, 0.6], [0.77, 0.26], [0.92, 0.2]], [[0.29, 1], [0.31, 0.55]], [[0.39, 1], [0.41, 0.55]], [[0.49, 1], [0.51, 0.55]], [[0.24, 0.55], [0.58, 0.56]],
      [[0.06, 0.7], [0.25, 0.45], [0.48, 0.22]], [[0.52, 0.12], [0.55, 0.0], [0.58, 0.12], [0.61, 0.0], [0.64, 0.12]], [[0.45, -0.86], [0.7, -0.64], [0.92, -0.55]], [[0.96, 0.9], [1.0, 0.3]]],
  };
  var DETAIL_SOFT = { tor: [[[0.96, 0.9], [1.0, 0.3]], [[0.2, 0.92], [0.26, 0.6]]], ua: [], fa: [], th: [[[0.1, -0.5], [0.5, 0.02]]], sh: [] };

  // Red highlight regions. Region: [seg, s0, s1, b0, b1]; cord: {c: [[seg, s, b], ...], w}; bone: {bone: seg}.
  var SEGS = ["tor", "uaN", "uaF", "faN", "faF", "thN", "thF", "shN", "shF"];
  function both(seg, s0, s1, b0, b1) { return [[seg + "N", s0, s1, b0, b1], [seg + "F", s0, s1, b0, b1]]; }
  var PARTS = {
    biceps: function () { return both("ua", 0.15, 0.88, 0.05, 0.9); },
    triceps: function () { return both("ua", 0.1, 0.85, -0.9, -0.05); },
    shoulders: function () { return both("ua", -0.16, 0.36, -0.92, 0.92); },
    forearms: function () { return both("fa", 0.02, 0.8, -0.9, 0.9); },
    grip: function () { return both("fa", 0.42, 1.0, -0.9, 0.9).concat([{ hand: "N" }, { hand: "F" }]); },
    chest: function () { return [["tor", 0.58, 0.95, 0.12, 0.92]]; },
    abs: function () { return [["tor", 0.18, 0.6, 0.1, 0.92]]; },
    lats: function () { return [["tor", 0.44, 0.9, -0.92, -0.15]]; },
    back: function () { return [["tor", 0.24, 1.0, -0.92, -0.1]]; },
    glutes: function () { return [["tor", -0.06, 0.25, -0.92, -0.2]]; },
    quads: function () { return both("th", 0.1, 0.92, 0.05, 0.9); },
    hamstrings: function () { return both("th", 0.12, 0.9, -0.9, -0.05); },
    calves: function () { return both("sh", 0.04, 0.6, -0.92, -0.1); },
    achilles: function () { return [{ c: [["shN", 0.55, -0.62], ["shN", 0.8, -0.78], ["shN", 1.0, -0.95], ["heelN"]], w: 8 }, { c: [["shF", 0.55, -0.62], ["shF", 0.8, -0.78], ["shF", 1.0, -0.95], ["heelF"]], w: 8 }]; },
    patellar: function () { return [{ c: [["thN", 0.86, 0.7], ["thN", 1.0, 0.98], ["shN", 0.06, 0.95], ["shN", 0.2, 0.72]], w: 9 }, { c: [["thF", 0.86, 0.7], ["thF", 1.0, 0.98], ["shF", 0.06, 0.95], ["shF", 0.2, 0.72]], w: 9 }]; },
    "elbow-tendon": function () { return [{ c: [["uaN", 0.8, 0.55], ["uaN", 1.0, 0.5], ["faN", 0.14, 0.45]], w: 7 }, { c: [["uaN", 0.84, -0.6], ["faN", 0.0, -0.95]], w: 7 }, { c: [["uaF", 0.8, 0.55], ["uaF", 1.0, 0.5], ["faF", 0.14, 0.45]], w: 7 }]; },
    wrist: function () { return [{ c: [["faN", 0.66, 0.42], ["faN", 1.0, 0.35]], w: 5 }, { c: [["faN", 0.66, -0.3], ["faN", 1.0, -0.3]], w: 5 }, { c: [["faF", 0.66, 0.42], ["faF", 1.0, 0.35]], w: 5 }]; },
    bones: function () { return [{ bone: "uaN" }, { bone: "uaF" }, { bone: "faN" }, { bone: "faF" }, { bone: "thN" }, { bone: "thF" }, { bone: "shN" }, { bone: "shF" }, { bone: "tor" }]; },
  };
  var GROUPS = {
    tendons: ["achilles", "patellar", "elbow-tendon", "wrist"],
    arms: ["biceps", "triceps", "shoulders", "forearms"],
    legs: ["quads", "hamstrings", "calves", "glutes"],
    core: ["abs", "corebk"],
    full: ["biceps", "triceps", "shoulders", "forearms", "chest", "abs", "lats", "back", "glutes", "quads", "hamstrings", "calves"],
  };
  PARTS.corebk = function () { return [["tor", 0.16, 0.55, -0.92, -0.25]]; };
  var PART_NAMES = ["biceps", "triceps", "forearms", "grip", "shoulders", "chest", "abs", "lats", "back", "glutes", "quads", "hamstrings", "calves", "achilles", "patellar", "elbow-tendon", "tendons", "bones", "arms", "legs", "core", "full", "none"];
  var PART_ALIAS = { bicep: "biceps", tricep: "triceps", forearm: "forearms", shoulder: "shoulders", delts: "shoulders", pecs: "chest", pec: "chest", ab: "abs", lat: "lats", glute: "glutes", quad: "quads", hamstring: "hamstrings", calf: "calves", tendon: "tendons", bone: "bones", arm: "arms", leg: "legs", hands: "grip", hand: "grip", "elbow": "elbow-tendon", knee: "patellar", heel: "achilles", body: "full", all: "full" };
  function partName(p) { p = str(p).toLowerCase(); if (PART_NAMES.indexOf(p) >= 0) return p; if (PART_ALIAS[p]) return PART_ALIAS[p]; return p ? "full" : "none"; }
  function regionsOf(part) {
    part = partName(part);
    if (part === "none") return [];
    var names = GROUPS[part] || [part], out = [];
    names.forEach(function (n) { if (PARTS[n]) out = out.concat(PARTS[n]()); });
    return out;
  }

  // ------------------------- heads (head frame: centre 0,0, facing +x, y down) -------------------------
  var HEADS = {
    spiky: {
      skull: "M-18 30 C-34 22 -44 4 -42 -14 C-40 -36 -22 -50 0 -50 C20 -50 32 -38 34 -24 L36 -14 L35 -8 L44 5 L37 8 L38 13 L35 16 L37 20 L33 27 L29 34 C20 37 8 37 -4 31 L-8 30 Z",
      hair: "M30 -30 L44 -48 L24 -44 L30 -72 L8 -50 L2 -84 L-12 -52 L-30 -78 L-30 -46 L-58 -58 L-42 -30 L-66 -24 L-44 -12 L-60 4 L-42 2 L-36 12 L-30 -6 C-30 -26 -18 -40 0 -42 C16 -42 26 -36 30 -30 Z",
      hairLines: "M-6 -48 L-22 -66 M6 -46 L10 -66 M-24 -36 L-46 -44 M-30 -20 L-50 -18 M18 -42 L30 -56",
      ear: "M-8 -10 C-20 -14 -22 6 -10 9 M-11 -4 C-15 -2 -14 3 -11 4",
      cheek: "M21 12 L27 23",
      jawShade: "M2 31 L10 26 M8 33 L16 28 M14 34 L22 29",
    },
    buzz: {
      skull: "M-20 32 C-38 24 -46 4 -44 -16 C-42 -38 -24 -48 0 -48 C22 -48 34 -38 36 -24 L40 -16 L37 -9 L45 4 L38 8 L39 13 L36 16 L38 20 L35 28 L33 36 C22 40 6 40 -6 33 L-10 32 Z",
      hair: "M33 -24 C30 -40 16 -49 0 -49 C-22 -49 -40 -38 -44 -16 L-41 -4 C-37 -22 -28 -34 -4 -37 C14 -39 26 -33 31 -21 Z",
      hairLines: "",
      ear: "M-10 -10 C-23 -14 -25 8 -12 11 M-13 -4 C-17 -2 -16 3 -13 4",
      cheek: "M22 12 L29 25 M16 18 L22 28",
      jawShade: "",
      stubble: [[6, 26], [12, 30], [18, 33], [24, 31], [30, 27], [2, 22], [10, 22], [16, 25], [22, 24], [27, 21], [-2, 27], [20, 36], [28, 34]],
    },
  };
  // Expressions: [eye kind, brow path, mouth key]
  var EXPR = {
    neutral: ["open", "M12 -22 Q22 -25 33 -21", "flat"],
    focus: ["narrow", "M12 -23 L33 -19", "flat2"],
    strain: ["squeeze", "M12 -27 L33 -18", "grit"],
    shout: ["angry", "M12 -26 L33 -17", "open"],
    smirk: ["narrow", "M12 -23 Q22 -26 33 -22", "smirk"],
    proud: ["happy", "M12 -25 Q22 -29 33 -25", "smile"],
    shock: ["wide", "M12 -29 Q22 -33 33 -27", "o"],
    scowl: ["angry", "M12 -24 L33 -15", "frown"],
    tired: ["half", "M12 -21 Q22 -22 33 -20", "slack"],
    calm: ["calm", "M12 -23 Q22 -26 33 -23", "smile2"],
  };
  var EXPR_NAMES = Object.keys(EXPR);
  var EYES = {
    open: ["M14 -14 Q22 -18 31 -13", "M19 -6 L28 -7", [25, -10, 4.6]],
    narrow: ["M14 -12 Q22 -15 31 -11", "M19 -7 L29 -8", [25, -9.5, 3.4]],
    squeeze: ["M14 -15 L30 -10 L16 -5", "", null],
    wide: ["M14 -15 Q22 -20 31 -14", "M16 -4 Q23 -2 30 -6", [24, -10, 2.1]],
    happy: ["M15 -9 Q22 -17 30 -10", "", null],
    half: ["M14 -11 L31 -11", "M19 -6 L28 -7", [25, -8.5, 3.2]],
    angry: ["M14 -17 L31 -11", "M19 -6 L29 -7", [25, -10, 3.8]],
    calm: ["M15 -12 Q22 -16 30 -12", "M19 -7 L28 -7", [24.5, -9.5, 3.6]],
    closed: ["M14 -10 Q22 -8 31 -10", "", null],
  };
  var MOUTHS = {
    flat: ["M31 16 L37 16", 0], flat2: ["M31 17 L37 15.5", 0],
    grit: ["M28 12.5 L39 12.5 L39 20.5 L28 20.5 Z M31.5 12.5 L31.5 20.5 M35 12.5 L35 20.5 M28 16.5 L39 16.5", 2],
    open: ["M27 11 L41 10 L38 25 L29 24 Z", 1], smirk: ["M30 18 Q34 18 38 13", 0], smile: ["M29 15 Q34 20 38 14", 0],
    o: ["M35 11 C39 11 39 23 35 23 C31 23 31 11 35 11 Z", 1], frown: ["M30 19 Q34 14 38 18", 0], slack: ["M31 15 L37 15 L36 20 L32 20 Z", 1],
    smile2: ["M31 16 Q34 18.5 37 15", 0],
  };

  // Hand shapes in the hand frame (x along the hand, y clockwise). Scaled by L.hand / 36.
  var HANDS = {
    relax: { d: "M0 -9 L16 -11 L28 -8 L35 -2 L33 6 L22 10 L8 10 L0 8 Z", l: "M8 -9 L16 -15 L21 -10 M22 -6 L30 -2" },
    fist: { d: "M0 -12 L14 -14 L26 -12 L31 -4 L31 8 L22 13 L6 12 L0 9 Z", l: "M23 -11 L24 11 M24 -4 L31 -4 M24 3 L31 3 M6 -12 L14 -18 L20 -13" },
    grip: { d: "M0 -12 L14 -14 L26 -12 L31 -4 L31 8 L22 13 L6 12 L0 9 Z", l: "M23 -11 L24 11 M24 -4 L31 -4 M24 3 L31 3" },
    flat: { d: "M0 -7 L12 -9 L36 -6 L46 -2 L46 3 L30 5 L0 6 Z", l: "M14 -8 L22 -12 L28 -8 M32 -2 L44 -1" },
    point: { d: "M0 -12 L14 -14 L26 -12 L30 -8 L52 -7 L53 -2 L31 0 L31 8 L22 13 L6 12 L0 9 Z", l: "M23 -2 L24 11 M24 4 L31 4" },
    open: { d: "M0 -9 L18 -12 L40 -16 L42 -11 L26 -6 L44 -4 L44 1 L26 2 L40 8 L38 12 L20 9 L6 12 L0 8 Z", l: "M10 -9 L16 -18 L20 -12" },
  };
  var FOOT = "M-10 -8 L-15 8 L-10 18 L20 19 L48 17 L56 12 L52 5 L30 0 L12 -8 Z";
  var FOOT_L = "M44 7 L48 16 M38 6 L41 17";

  // ------------------------- the Figure -------------------------
  var ORDER = ["shF", "footF", "thF", "faF", "handF", "uaF", "neck", "tor", "shN", "footN", "thN", "head", "faN", "handN", "uaN"];
  function Figure(st, name, o) {
    o = obj(o);
    this.st = st; this.name = CAST[name] ? name : "rook";
    this.C = makeChar(this.name, pick(["lean", "big", "soft"], o.build, null), pick(["orange", "dark", "white"], o.shorts, null));
    this.x = num(o.x, WW / 2); this.y = num(o.y, 820); this.scale = clamp(num(o.scale, 1), 0.05, 4);
    this.facing0 = o.facing === "left" ? -1 : 1;
    this.lod = o.lod || (this.scale * K < 0.42 ? 1 : 2);
    this.seed = st.figs.length * 7 + 3;
    this.acts = [{ at: -1, kind: "pose", name: poseName(o.pose || "stand"), dur: 0 }];
    this.exprs = [{ at: -1, name: pick(EXPR_NAMES, o.expression, "neutral") }];
    this.hls = []; this.pulses = []; this.sweats = []; this.shakes = []; this.moves = []; this.faces = []; this.vis = []; this.talks = []; this.attached = [];
    if (o.exercise) this.exercise(o.exercise, num(o.at, 0));
    if (o.highlight) this.highlight(o.highlight, num(o.highlightAt, 0));
    this.build();
    st.figs.push(this);
    var self = this;
    st.on(function (t) { self.update(t); });
    st.addBox(function (t, c) { return self.inspectBox(t, c); });
  }
  Figure.prototype.build = function () {
    var st = this.st, self = this;
    this.g = svg("g", { "class": "ia-fig" }, st.figsG);
    this.parts = {};
    var hsp = 6.5 / (K * this.scale);
    this.hatch = st.pattern("hk", hsp);
    this.hatchL = st.pattern("hk", hsp * 1.5);
    this.cross = st.pattern("xk", hsp * 0.9);
    this.redHatch = st.pattern("hr", hsp * 0.8);
    var lw = 3.4 / (K * this.scale) * Math.max(0.75, Math.min(1.25, K * this.scale));
    this.lw = lw;
    ORDER.forEach(function (id) {
      var g = svg("g", null, self.g), P = { g: g };
      if (id === "head") { self.buildHead(P); self.parts.head = P; return; }
      var hand = id.indexOf("hand") === 0, foot = id.indexOf("foot") === 0;
      P.rim = svg("path", { "class": "rim-s", fill: "none", "stroke-width": f2(lw * 2.6), "stroke-linejoin": "round" }, g);
      if (id === "neck") P.rim.style.display = "none";
      P.body = svg("path", { "class": "f-f k-s", "stroke-width": f2(lw), "stroke-linejoin": "round" }, g);
      if (!hand && !foot) {
        P.hatch = svg("path", { fill: self.hatch, stroke: "none" }, g);
        if (id.slice(-1) === "F") P.far = svg("path", { fill: self.hatchL, stroke: "none" }, g);
        if (id === "tor" || id === "thN" || id === "thF") {
          P.shorts = svg("path", { stroke: "none" }, g);
          P.shortsL = svg("path", { fill: "none", "class": "k-s", "stroke-width": f2(lw * 0.9), "stroke-linejoin": "round", "stroke-linecap": "round" }, g);
          var sc = self.C.shorts;
          if (sc === "orange") P.shorts.setAttribute("class", "o-f");
          else if (sc === "dark") { P.shorts.setAttribute("fill", self.cross); P.shortsB = svg("path", { "class": "f-f", stroke: "none" }, g); g.insertBefore(P.shortsB, P.shorts); }
          else P.shorts.setAttribute("class", "f-f");
        }
        P.det = svg("path", { fill: "none", "class": "k-s", "stroke-width": f2(lw * 0.5), "stroke-linecap": "round" }, g);
        P.heavy = svg("path", { fill: "none", "class": "k-s", "stroke-width": f2(lw * 1.9), "stroke-linecap": "round" }, g);
      } else {
        P.det = svg("path", { fill: "none", "class": "k-s", "stroke-width": f2(lw * 0.55), "stroke-linecap": "round" }, g);
      }
      P.hl = svg("path", { "class": "r-f r-s", "stroke-linejoin": "round", "stroke-width": 0 }, g);
      P.hlS = svg("path", { fill: "none", "class": "rd-s", "stroke-width": f2(lw * 0.45), "stroke-linecap": "round" }, g);
      P.hlC = svg("path", { fill: "none", "class": "r-s", "stroke-width": 8, "stroke-linecap": "round", "stroke-linejoin": "round" }, g);
      P.hlCi = svg("path", { fill: "none", "class": "f-s", "stroke-width": 1.4, "stroke-linecap": "round", opacity: 0.8 }, g);
      P.hlB = svg("path", { "class": "r-f rd-s", "stroke-width": f2(lw * 0.6) }, g);
      self.parts[id] = P;
    });
    // sweat drops live in the figure frame, over everything
    this.sweatG = svg("g", null, this.g);
    this.drops = [];
    for (var i = 0; i < 4; i++) this.drops.push(svg("path", { "class": "f-f k-s", "stroke-width": f2(lw * 0.7), d: "M0 -9 C4 -2 6 2 6 5 C6 9 -6 9 -6 5 C-6 2 -4 -2 0 -9 Z" }, this.sweatG));
    this.effortG = svg("path", { fill: "none", "class": "k-s", "stroke-width": f2(lw * 0.8), "stroke-linecap": "round" }, this.g);
  };
  Figure.prototype.buildHead = function (P) {
    var C = this.C, H = HEADS[C.hair] || HEADS.spiky, lw = this.lw, g = P.g, hs = C.L.head / 42;
    P.hg = svg("g", null, g);
    var inner = svg("g", { transform: "scale(" + f2(hs) + ")" }, P.hg);
    var lwh = f2(lw / hs);
    P.hrim = svg("path", { d: H.skull, "class": "rim-s", fill: "none", "stroke-width": f2(lwh * 2.6) }, inner);
    if (C.hair === "spiky") svg("path", { d: H.hair, "class": "rim-s", fill: "none", "stroke-width": f2(lwh * 2.6) }, inner);
    P.skull = svg("path", { d: H.skull, "class": "f-f k-s", "stroke-width": lwh, "stroke-linejoin": "round" }, inner);
    svg("path", { d: H.jawShade || "", fill: "none", "class": "k-s", "stroke-width": f2(lwh * 0.45) }, inner);
    svg("path", { d: H.ear, fill: "none", "class": "k-s", "stroke-width": f2(lwh * 0.7), "stroke-linecap": "round" }, inner);
    if (C.hair === "spiky") {
      svg("path", { d: H.hair, "class": "f-f k-s", "stroke-width": lwh, "stroke-linejoin": "miter", "stroke-miterlimit": 8 }, inner);
      svg("path", { d: H.hairLines, fill: "none", "class": "k-s", "stroke-width": f2(lwh * 0.5), "stroke-linecap": "round" }, inner);
    } else {
      svg("path", { d: H.hair, fill: this.cross, "class": "k-s", "stroke-width": f2(lwh * 0.8) }, inner);
      var sd = "";
      (H.stubble || []).forEach(function (q) { sd += circD(q, 0.9); });
      svg("path", { d: sd, "class": "k-f" }, inner);
      svg("path", { d: "M8 -19 L39 -16", fill: "none", "class": "k-s", "stroke-width": f2(lwh * 1.9), "stroke-linecap": "round" }, inner);
    }
    svg("path", { d: H.cheek, fill: "none", "class": "k-s", "stroke-width": f2(lwh * 0.45), "stroke-linecap": "round" }, inner);
    P.eyeU = svg("path", { fill: "none", "class": "k-s", "stroke-width": f2(lwh * 1.25), "stroke-linecap": "round", "stroke-linejoin": "round" }, inner);
    P.eyeL = svg("path", { fill: "none", "class": "k-s", "stroke-width": f2(lwh * 0.55), "stroke-linecap": "round" }, inner);
    P.iris = svg("path", { "class": "k-f" }, inner);
    P.glint = svg("path", { "class": "f-f" }, inner);
    P.brow = svg("path", { fill: "none", "class": "k-s", "stroke-width": f2(lwh * (C.hair === "buzz" ? 1.6 : 1.2)), "stroke-linecap": "round" }, inner);
    P.mouth = svg("path", { "class": "k-s", "stroke-width": f2(lwh * 0.8), "stroke-linejoin": "round", "stroke-linecap": "round" }, inner);
    P.crease = svg("path", { fill: "none", "class": "k-s", "stroke-width": f2(lwh * 0.5), "stroke-linecap": "round" }, inner);
    P.hs = hs;
  };

  // ---- API ----
  Figure.prototype.pose = function (name, at, dur) { this.acts.push({ at: num(at, 0), kind: "pose", name: poseName(name), blend: Math.max(0.01, num(dur, 0.35)) }); this.sortActs(); return this; };
  Figure.prototype.exercise = function (name, at, o) {
    o = obj(o);
    var n = exName(name);
    if (!n) return this.pose(name, at);
    var ex = EX[n], a = num(at, 0);
    this.acts.push({ at: a, kind: "ex", name: n, period: clamp(num(o.period, ex.period), 0.3, 6), blend: num(o.blend, 0.35) });
    if (o.until != null) this.acts.push({ at: num(o.until, D), kind: "pose", name: poseName(o.endPose || ex.rest), blend: 0.4 });
    this.sortActs();
    return this;
  };
  Figure.prototype.sortActs = function () { this.acts.sort(function (a, b) { return a.at - b.at; }); };
  Figure.prototype.highlight = function (part, at, o) {
    o = obj(o);
    var t = num(at, 0);
    this.hls.push({ at: t, part: partName(part), until: o.until != null ? num(o.until, D) : null });
    this.hls.sort(function (a, b) { return a.at - b.at; });
    if (o.pulse !== false && partName(part) !== "none") this.pulses.push({ at: t, k: num(o.pulse, 1) || 1 });
    return this;
  };
  Figure.prototype.pulse = function (at, strength) { this.pulses.push({ at: num(at, 0), k: num(strength, 1) }); return this; };
  Figure.prototype.expression = function (name, at) { this.exprs.push({ at: num(at, 0), name: pick(EXPR_NAMES, name, "neutral") }); this.exprs.sort(function (a, b) { return a.at - b.at; }); return this; };
  Figure.prototype.say = function (from, to) { this.talks.push([num(from, 0), num(to, D)]); return this; };
  Figure.prototype.narrate = function (from, to) { return this.say(from == null ? 0 : from, to == null ? D : to); };
  Figure.prototype.sweat = function (from, to) { this.sweats.push([num(from, 0), num(to, D)]); return this; };
  Figure.prototype.shake = function (at, dur, amp) { this.shakes.push({ at: num(at, 0), dur: Math.max(0.05, num(dur, 0.5)), amp: num(amp, 6) }); return this; };
  Figure.prototype.moveTo = function (x, y, at, dur) { this.moves.push({ at: num(at, 0), dur: Math.max(0, num(dur, 0.6)), x: num(x, null), y: num(y, null) }); this.moves.sort(function (a, b) { return a.at - b.at; }); return this; };
  Figure.prototype.face = function (dir, at) { this.faces.push({ at: num(at, 0), f: dir === "left" ? -1 : 1 }); this.faces.sort(function (a, b) { return a.at - b.at; }); return this; };
  Figure.prototype.show = function (at) { this.vis.push({ at: num(at, 0), on: true }); this.vis.sort(function (a, b) { return a.at - b.at; }); return this; };
  Figure.prototype.hide = function (at) { this.vis.push({ at: num(at, 0), on: false }); this.vis.sort(function (a, b) { return a.at - b.at; }); return this; };
  Figure.prototype.beats = function (list) {
    var self = this, prev = 0;
    arr(list).forEach(function (b) {
      b = obj(b);
      var t = b.at != null ? num(b.at, 0) : kwFind(b.word, prev);
      if (t == null) return;
      t = ct(t, 0); prev = t;
      if (b.expression) self.expression(b.expression, t);
      if (b.exercise) self.exercise(b.exercise, t);
      else if (b.pose) self.pose(b.pose, t);
      if (b.highlight) self.highlight(b.highlight, t);
      if (b.pulse) self.pulse(t, b.pulse === true ? 1 : b.pulse);
      if (b.shake) self.shake(t, 0.5, b.shake === true ? 6 : b.shake);
    });
    return this;
  };
  Figure.prototype.info = function () { return { name: this.name, build: this.C.build, x: this.x, y: this.y, scale: this.scale }; };

  // ---- evaluation ----
  Figure.prototype.rawAct = function (a, t) {
    if (a.kind === "pose") return npose(a.name, this.C);
    var ex = EX[a.name], ph = frac(Math.max(0, t - a.at) / a.period);
    var k0 = npose(ex.keys[0], this.C), k1 = npose(ex.keys[1] || ex.keys[0], this.C);
    var h = ex.hold || 0, p;
    if (h > 0) { var q = ph < 0.5 ? clamp(ph / (0.5 - h / 2), 0, 1) : clamp((1 - ph) / (0.5 - h / 2), 0, 1); p = smooth(q); }
    else p = 0.5 - 0.5 * Math.cos(TAU * ph);
    var P = mixPose(k0, k1, p);
    if (ex.bob) { P = Object.assign({}, P); P.hy -= Math.abs(Math.sin(PI * ph * 2)) * ex.bob; }
    return P;
  };
  Figure.prototype.poseAt = function (t) {
    var acts = this.acts, i = 0;
    for (var j = 0; j < acts.length; j++) if (acts[j].at <= t) i = j;
    var a = acts[i], cur = this.rawAct(a, t);
    if (i > 0 && a.blend && a.at > 0.001 && t < a.at + a.blend) cur = mixPose(this.rawAct(acts[i - 1], t), cur, smooth((t - a.at) / a.blend));
    return cur;
  };
  Figure.prototype.activeEx = function (t) {
    var a = null;
    this.acts.forEach(function (x) { if (x.at <= t) a = x; });
    return a && a.kind === "ex" ? a : null;
  };
  Figure.prototype.posAt = function (t) {
    var x = this.x, y = this.y;
    this.moves.forEach(function (m) {
      if (t < m.at) return;
      var p = m.dur > 0 ? inOut((t - m.at) / m.dur) : 1;
      if (m.x != null) x = lerp(x, m.x, p);
      if (m.y != null) y = lerp(y, m.y, p);
    });
    return [x, y];
  };
  Figure.prototype.facingAt = function (t) { var f = this.facing0; this.faces.forEach(function (q) { if (q.at <= t) f = q.f; }); return f; };
  Figure.prototype.visibleAt = function (t) { var v = true; this.vis.forEach(function (q) { if (q.at <= t) v = q.on; }); if (this.vis.length && this.vis[0].on && t < this.vis[0].at) v = false; return v; };
  Figure.prototype.jitter = function (t) {
    var amp = 0, self = this;
    this.shakes.forEach(function (s) { var d = t - s.at; if (d >= 0 && d < s.dur) amp = Math.max(amp, s.amp * (1 - 0.6 * d / s.dur)); });
    var ex = this.activeEx(t);
    if (ex && EX[ex.name].tremble) amp = Math.max(amp, EX[ex.name].tremble);
    if (!amp) return [0, 0];
    var fr = Math.floor(t * 30) + self.seed * 17;
    return [(hash(fr * 1.31) - 0.5) * 2 * amp, (hash(fr * 2.17 + 5) - 0.5) * 2 * amp];
  };
  Figure.prototype.jointsAt = function (t) {
    if (this._jt === t && this._J) return this._J;
    var J = solve(this.poseAt(t), this.C);
    this._jt = t; this._J = J;
    return J;
  };
  Figure.prototype.toWorld = function (p, t) {
    var pos = this.posAt(t), f = this.facingAt(t), s = this.scale, j = this.jitter(t);
    return [pos[0] + (p[0] + j[0]) * f * s, pos[1] + (p[1] + j[1]) * s];
  };
  var JOINT_ALIAS = { shoulder: "shN", shoulderN: "shN", shoulderF: "shF", elbow: "elbowN", wrist: "wristN", hand: "handN", knee: "kneeN", ankle: "ankleN", toe: "toeN", foot: "toeN", feet: "toeN", hips: "hip", torso: "chest", face: "head" };
  Figure.prototype.world = function (joint, t) {
    t = t == null ? V.time() : num(t, 0);
    var J = this.jointsAt(t), k = JOINT_ALIAS[joint] || joint;
    var p = J[k] || J.hip;
    if (!Array.isArray(p)) p = J.hip;
    var w = this.toWorld(p, t);
    return { x: w[0], y: w[1] };
  };
  // Local bounds of the figure across its actions (for layout): [x0, y0, x1, y1] in world units.
  Figure.prototype.worldBox = function (t) {
    var J = this.jointsAt(t), b = poseBounds(J, this.C), a = this.toWorld([b[0], b[1]], t), c = this.toWorld([b[2], b[3]], t);
    return [Math.min(a[0], c[0]), Math.min(a[1], c[1]), Math.max(a[0], c[0]), Math.max(a[1], c[1])];
  };
  Figure.prototype.inspectBox = function (t, c) {
    if (!this.visibleAt(t)) return null;
    var b = this.worldBox(t), p0 = this.st.proj([b[0], b[1]], c), p1 = this.st.proj([b[2], b[3]], c);
    return { kind: "figure", label: this.name, x: p0[0], y: p0[1], w: p1[0] - p0[0], h: p1[1] - p0[1], moving: c.moving };
  };

  // segment frames for joints J
  Figure.prototype.segments = function (J) {
    var C = this.C, pr = C.prof, sg = {};
    sg.tor = new Seg(J.hip, J.sh, pr.tor, 1, J.axis);
    sg.neck = new Seg(J.nb, J.hc, pr.neck, 1);
    sg.uaN = new Seg(J.shN, J.elbowN, pr.ua, -1); sg.uaF = new Seg(J.shF, J.elbowF, pr.ua, -1);
    sg.faN = new Seg(J.elbowN, J.wristN, pr.fa, -1); sg.faF = new Seg(J.elbowF, J.wristF, pr.fa, -1);
    sg.thN = new Seg(J.hipN, J.kneeN, pr.th, -1); sg.thF = new Seg(J.hipF, J.kneeF, pr.th, -1);
    sg.shN = new Seg(J.kneeN, J.ankleN, pr.sh, -1); sg.shF = new Seg(J.kneeF, J.ankleF, pr.sh, -1);
    return sg;
  };
  function tf(p, ang, sc) { // hand / foot frame: origin p, angle ang (deg), uniform scale
    return "matrix(" + [Math.cos(rad(ang)) * sc, Math.sin(rad(ang)) * sc, -Math.sin(rad(ang)) * sc, Math.cos(rad(ang)) * sc, p[0], p[1]].map(f2).join(" ") + ")";
  }
  Figure.prototype.hlState = function (t) {
    var h = null;
    this.hls.forEach(function (x) { if (x.at <= t && (x.until == null || t < x.until)) h = x; });
    if (!h || h.part === "none") return null;
    var a = smooth((t - h.at) / 0.22), pe = 0;
    this.pulses.forEach(function (p) { var d = t - p.at; if (d >= 0 && d < 1.4) pe = Math.max(pe, p.k * Math.exp(-d / 0.32) * (d < 0.06 ? d / 0.06 : 1)); });
    if (h.until != null) a *= 1 - smooth((t - (h.until - 0.2)) / 0.2);
    return { part: h.part, a: a, pe: pe, throb: 0.5 + 0.5 * Math.sin(TAU * (t - h.at) / 1.1), k: h.part === "full" ? 0.55 : h.part === "arms" || h.part === "legs" ? 0.75 : 1 };
  };
  Figure.prototype.mouthOpen = function (t) {
    var on = this.talks.some(function (w) { return t >= w[0] && t <= w[1]; });
    if (!on) return 0;
    var ws = V.words;
    for (var i = 0; i < ws.length; i++) {
      var w = ws[i];
      if (t >= w.start && t <= w.end) {
        var n = Math.max(1, Math.round(normWord(w.word).length / 3)), d = (w.end - w.start) / n;
        return Math.abs(Math.sin(PI * ((t - w.start) % d) / d));
      }
    }
    return 0;
  };
  Figure.prototype.exprAt = function (t) { var e = "neutral"; this.exprs.forEach(function (x) { if (x.at <= t) e = x.name; }); return e; };

  Figure.prototype.update = function (t) {
    var vis = this.visibleAt(t);
    show(this.g, vis);
    if (!vis) return;
    var J = this.jointsAt(t), C = this.C, pos = this.posAt(t), f = this.facingAt(t), s = this.scale, j = this.jitter(t);
    setA(this.g, "transform", "translate(" + f1(pos[0] + j[0] * f * s) + " " + f1(pos[1] + j[1] * s) + ") scale(" + f2(f * s) + " " + f2(s) + ")");
    var sg = this.segments(J), self = this, hl = this.hlState(t), regs = hl ? regionsOf(hl.part) : [];
    // arms overhead (or a handstand): draw the head over the near arm so the face stays visible
    var hf = (sg.uaN.d[0] * J.td[0] + sg.uaN.d[1] * J.td[1]) > 0.5;
    if (hf !== this._hf) { this._hf = hf; this.g.insertBefore(this.parts.head.g, hf ? this.sweatG : this.parts.faN.g); }
    var bySeg = {};
    regs.forEach(function (r) {
      var key = Array.isArray(r) ? r[0] : r.c ? r.c[0][0] : r.bone ? r.bone : r.hand ? "hand" + r.hand : "tor";
      (bySeg[key] = bySeg[key] || []).push(r);
    });
    var soft = C.build === "soft", det = soft ? DETAIL_SOFT : DETAIL, lod = this.lod;
    ORDER.forEach(function (id) {
      var P = self.parts[id];
      if (id === "head") return self.drawHead(P, J, t);
      if (id.indexOf("hand") === 0) return self.drawHand(P, J, id.slice(-1), bySeg[id], hl);
      if (id.indexOf("foot") === 0) return self.drawFoot(P, J, id.slice(-1));
      var seg = sg[id], base = id.replace(/[NF]$/, "");
      var cd = seg.contour();
      setD(P.rim, cd); setD(P.body, cd);
      // shadow band on the back side, plus under the chest on the torso
      var hb = lod > 1 ? crD(seg.band(seg.prof[1][0], seg.prof[seg.prof.length - 2][0], -0.98, -0.42), true) : "";
      if (id === "tor" && lod > 1 && !soft) hb += crD(seg.band(0.55, 0.64, 0.15, 0.96, 4), true);
      setD(P.hatch, hb);
      if (P.far) setD(P.far, lod > 1 ? cd : "");
      if (P.shorts) {
        var sd, sl;
        if (id === "tor") {
          sd = sidesD(seg.side(-0.1, 0.2, 1.03, 5), seg.side(0.2, -0.1, -1.03, 5));
          sl = crD([seg.pt(0.2, 1.03), seg.pt(0.205, 0), seg.pt(0.2, -1.03)], false) + " " + crD(seg.side(-0.02, 0.2, 1.03, 4), false) + " " + crD(seg.side(-0.02, 0.2, -1.03, 4), false) + " M" + P2(seg.pt(0.06, 0.5)) + " L" + P2(seg.pt(0.14, 0.2));
        } else {
          sd = sidesD(seg.side(-0.14, 0.42, 1.08, 6), seg.side(0.42, -0.14, -1.08, 6));
          sl = crD(seg.side(0.0, 0.42, 1.08, 4), false) + " " + crD([seg.pt(0.42, 1.08), seg.pt(0.43, 0), seg.pt(0.42, -1.08)], false) + " " + crD(seg.side(0.42, 0.0, -1.08, 4), false) + " M" + P2(seg.pt(0.2, 0.6)) + " L" + P2(seg.pt(0.34, 0.25));
        }
        setD(P.shorts, sd); if (P.shortsB) setD(P.shortsB, sd); setD(P.shortsL, sl);
      }
      var dl = "";
      if (lod > 1 && det[base]) det[base].forEach(function (ln) { dl += seg.line(ln) + " "; });
      setD(P.det, dl);
      setD(P.heavy, lod > 1 ? crD(seg.side(seg.prof[1][0], seg.prof[seg.prof.length - 2][0], -1, 8), false) : "");
      self.drawHl(P, sg, bySeg[id], hl, id, J);
    });
    this.drawSweat(J, t);
  };
  Figure.prototype.drawHl = function (P, sg, list, hl, id, J) {
    var fillD = "", strD = "", cordD = "", boneD = "", self = this;
    (list || []).forEach(function (r) {
      if (Array.isArray(r)) {
        var seg = sg[r[0]];
        if (!seg) return;
        fillD += crD(seg.band(r[1], r[2], r[3], r[4], 8), true) + " ";
        var nS = 4;
        for (var i = 0; i < nS; i++) { var b = lerp(r[3], r[4], (i + 0.5) / nS); strD += crD(seg.side(r[1] + 0.06, r[2] - 0.06, b, 5), false) + " "; }
      } else if (r.c) {
        var pts = r.c.map(function (q) {
          if (q[0] === "heelN" || q[0] === "heelF") { var sd = q[0].slice(-1), an = J["ankle" + sd], fa = J["f" + sd]; return add(an, add(mul(dirDeg(fa), -12), mul(perp(dirDeg(fa)), 10))); }
          return sg[q[0]] ? sg[q[0]].pt(q[1], q[2]) : J.hip;
        });
        cordD += crD(pts, false) + " ";
      } else if (r.bone) {
        var bs = sg[r.bone];
        if (!bs) return;
        if (r.bone === "tor") {
          for (var v = 0; v < 7; v++) { var c0 = bs.pt(0.08 + v * 0.13, -0.55); boneD += circD(c0, 7) + " "; }
          for (var rb = 0; rb < 3; rb++) boneD += crD([bs.pt(0.58 + rb * 0.1, -0.5), bs.pt(0.55 + rb * 0.1, 0.2), bs.pt(0.5 + rb * 0.1, 0.75)], false).replace(/^M/, "M") + " ";
        } else {
          var a = bs.pt(0.02, 0), b2 = bs.pt(0.98, 0), dd = bs.d, nn = bs.n, w = Math.min(9, bs.L * 0.07) * self.C.wk;
          var knob = w * 1.7;
          var pts2 = [add(a, mul(nn, knob)), add(add(a, mul(dd, knob)), mul(nn, w)), add(add(b2, mul(dd, -knob)), mul(nn, w)), add(b2, mul(nn, knob)), add(b2, mul(dd, knob * 0.6)), add(b2, mul(nn, -knob)), add(add(b2, mul(dd, -knob)), mul(nn, -w)), add(add(a, mul(dd, knob)), mul(nn, -w)), add(a, mul(nn, -knob)), add(a, mul(dd, -knob * 0.6))];
          boneD += crD(pts2, true, 0.8) + " ";
        }
      }
    });
    var on = hl && (fillD || cordD || boneD);
    show(P.hl, !!(on && fillD)); show(P.hlS, !!(on && fillD)); show(P.hlC, !!(on && cordD)); show(P.hlCi, !!(on && cordD)); show(P.hlB, !!(on && boneD));
    if (!on) return;
    var a = hl.a, pe = hl.pe;
    setD(P.hl, fillD); setD(P.hlS, strD); setD(P.hlC, cordD); setD(P.hlCi, cordD); setD(P.hlB, boneD);
    var op = a * Math.min(1, (0.8 + 0.12 * hl.throb) * hl.k + 0.2 * pe);
    setOp(P.hl, op); setOp(P.hlS, a * 0.9); setOp(P.hlC, op); setOp(P.hlB, op);
    setA(P.hl, "stroke-width", f1(pe * 14));
    setA(P.hl, "stroke-opacity", f2(0.45 * pe));
    setA(P.hlC, "stroke-width", f1(9 * this.C.wk * (1 + 0.5 * pe)));
  };
  Figure.prototype.drawHand = function (P, J, side, list, hl) {
    var sh = HANDS[J["h" + side]] || HANDS.relax, sc = this.C.L.hand / 36 * (this.C.build === "big" ? 1.15 : 1);
    var tr = tf(J["wrist" + side], J["ha" + side], sc);
    setA(P.g, "transform", tr);
    setD(P.rim, sh.d); setD(P.body, sh.d); setD(P.det, this.lod > 1 ? sh.l : "");
    var on = hl && list && list.length;
    show(P.hl, !!on); show(P.hlS, false); show(P.hlC, false); show(P.hlCi, false); show(P.hlB, false);
    if (on) { setD(P.hl, sh.d); setOp(P.hl, hl.a * (0.85 + 0.15 * hl.pe)); setA(P.hl, "stroke-width", f1(hl.pe * 10)); setA(P.hl, "stroke-opacity", f2(0.45 * hl.pe)); }
  };
  Figure.prototype.drawFoot = function (P, J, side) {
    var sc = this.C.L.foot / 52;
    setA(P.g, "transform", tf(J["ankle" + side], J["f" + side], sc));
    setD(P.rim, FOOT); setD(P.body, FOOT); setD(P.det, this.lod > 1 ? FOOT_L : "");
    show(P.hl, false); show(P.hlS, false); show(P.hlC, false); show(P.hlCi, false); show(P.hlB, false);
  };
  Figure.prototype.drawHead = function (P, J, t) {
    var ang = J.nk * 0.9 + J.tor * 0.1;
    setA(P.hg, "transform", "translate(" + f1(J.hc[0]) + " " + f1(J.hc[1]) + ") rotate(" + f1(ang) + ")");
    var ex = EXPR[this.exprAt(t)] || EXPR.neutral, eye = ex[0];
    var blinkable = eye === "open" || eye === "narrow" || eye === "calm" || eye === "angry";
    if (blinkable && frac((t + this.seed * 0.37) / 3.3) < 0.04) eye = "closed";
    var E = EYES[eye] || EYES.open;
    setD(P.eyeU, E[0]); setD(P.eyeL, E[1]);
    setD(P.iris, E[2] ? circD([E[2][0], E[2][1]], E[2][2]) : "");
    setD(P.glint, E[2] && E[2][2] > 3 ? circD([E[2][0] + 1.4, E[2][1] - 1.5], 1.1) : "");
    setD(P.brow, ex[1]);
    var m = this.mouthOpen(t), mk = MOUTHS[ex[2]] || MOUTHS.flat, md = mk[0], filled = mk[1];
    if (m > 0.12 && filled !== 2) { var oy = 12 + 2 + m * 8; md = "M30 13 L38.5 13 L37.5 " + f1(oy) + " L31 " + f1(oy) + " Z"; filled = 1; }
    setD(P.mouth, md);
    setA(P.mouth, "class", filled === 1 ? "k-s k-f" : filled === 2 ? "k-s f-f" : "k-s");
    if (!filled) P.mouth.setAttribute("fill", "none"); else P.mouth.removeAttribute("fill");
    setD(P.crease, ex[0] === "squeeze" || ex[0] === "angry" ? "M27 -28 L30 -23 M31 -29 L33 -25" : "");
  };
  Figure.prototype.drawSweat = function (J, t) {
    var on = this.sweats.some(function (w) { return t >= w[0] && t <= w[1]; }), self = this;
    show(this.sweatG, on);
    if (!on) { setD(this.effortG, ""); return; }
    var hc = J.hc, ang = rad(J.nk * 0.9), cs = Math.cos(ang), sn = Math.sin(ang), hs = this.C.L.head / 42;
    var spots = [[-4, -40], [38, -30], [-40, -20], [20, -46]];
    this.drops.forEach(function (d, i) {
      var ph = frac(t / 0.95 + i * 0.27 + self.seed * 0.11), sp = spots[i];
      var lx = sp[0] * hs, ly = sp[1] * hs;
      var x = hc[0] + lx * cs - ly * sn + (sp[0] > 0 ? 1 : -1) * ph * 14, y = hc[1] + lx * sn + ly * cs + ph * ph * 40;
      setA(d, "transform", "translate(" + f1(x) + " " + f1(y) + ") scale(" + f2(hs * (0.9 + 0.3 * (1 - ph))) + ")");
      setOp(d, ph < 0.15 ? ph / 0.15 : 1 - smooth((ph - 0.6) / 0.4));
    });
    // little effort marks beside the head
    var e = "", r = 66 * hs;
    for (var k = 0; k < 3; k++) {
      var a2 = rad(-60 - k * 22 + J.nk * 0.9), r0 = r, r1 = r + 14 * hs * (0.7 + 0.3 * Math.sin(t * 20 + k));
      e += "M" + P2([hc[0] + Math.cos(a2) * r0, hc[1] + Math.sin(a2) * r0]) + " L" + P2([hc[0] + Math.cos(a2) * r1, hc[1] + Math.sin(a2) * r1]) + " ";
    }
    setD(this.effortG, e);
  };

  // Where a body part is (world point) at time t.
  function musclePoint(fig, part, t) {
    t = t == null ? V.time() : num(t, 0);
    if (!fig || !fig.jointsAt) return { x: WW / 2, y: 500 };
    var J = fig.jointsAt(t), sg = fig.segments(J), p = partName(part);
    var pickPart = { arms: "biceps", legs: "quads", core: "abs", full: "chest", tendons: "elbow-tendon", none: "chest" }[p] || p;
    var regs = regionsOf(pickPart), r = regs[0], q;
    if (!r) q = J.chest;
    else if (Array.isArray(r)) q = sg[r[0]].pt((r[1] + r[2]) / 2, (r[3] + r[4]) / 2);
    else if (r.c) { var c = r.c[1] || r.c[0]; q = sg[c[0]] ? sg[c[0]].pt(c[1], c[2]) : J.ankleN; }
    else if (r.bone) q = sg[r.bone].pt(0.5, 0);
    else if (r.hand) q = J.handN;
    else q = J.chest;
    var w = fig.toWorld(q, t);
    return { x: w[0], y: w[1] };
  }
  // Union of a pose or exercise loop's local bounds (scale 1, facing right).
  var LB_CACHE = {};
  function loopBounds(charName, build, what) {
    var key = charName + "|" + build + "|" + what;
    if (LB_CACHE[key]) return LB_CACHE[key];
    var C = makeChar(charName, build), n = exName(what), names = n ? EX[n].keys : [poseName(what)];
    var b = [1e9, 1e9, -1e9, -1e9];
    var samples = [];
    if (n && names.length > 1) for (var i = 0; i <= 6; i++) samples.push(mixPose(npose(names[0], C), npose(names[1], C), i / 6));
    else samples.push(npose(names[0], C));
    samples.forEach(function (P) { var q = poseBounds(solve(P, C), C); b = [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[2]), Math.max(b[3], q[3])]; });
    if (n === "sprint" || n === "sprint-bad") b[1] -= 10;
    LB_CACHE[key] = b;
    return b;
  }
  // Place a figure so its loop bounds fill box (world units). Returns { x, y, scale, w, h }.
  function fitFigure(charName, what, bx, o) {
    o = o || {};
    var lb = loopBounds(charName, o.build || null, what), bw = lb[2] - lb[0], bh = lb[3] - lb[1];
    var s = Math.min(bx.w / bw, bx.h / bh, o.maxScale || 1.25);
    var f = o.facing === "left" ? -1 : 1;
    var cx = (lb[0] + lb[2]) / 2, cy = (lb[1] + lb[3]) / 2;
    var ay = o.alignBottom ? bx.y1 - lb[3] * s : bx.cy - cy * s;
    return { x: bx.cx - cx * s * f, y: ay, scale: s, w: bw * s, h: bh * s, top: ay + lb[1] * s, bottom: ay + lb[3] * s, left: bx.cx - bw * s / 2, right: bx.cx + bw * s / 2 };
  }

  // ======================================================================================
  // PROPS AND GROUND
  // ======================================================================================
  function stg() { return ST || scene({}); }
  function ptOf(v, t) {
    if (typeof v === "function") { var r = v(t); return [num(r.x, 0), num(r.y, 0)]; }
    if (v && v.fig) { var w = v.fig.world(v.joint || "handN", t); return [w.x, w.y]; }
    if (Array.isArray(v)) return [num(v[0], 0), num(v[1], 0)];
    v = obj(v);
    return [num(v.x, 0), num(v.y, 0)];
  }
  function prop(kind, o) {
    var st = stg();
    o = obj(o);
    kind = str(kind).toLowerCase();
    var g = svg("g", { "class": "ia-prop" }, o.front ? st.wfx : st.mid), lw = 3.4 / K;
    var res = { g: g, kind: kind };
    if (kind === "bar") {
      var x = num(o.x, WW / 2), y = num(o.y, 300), w = num(o.w, 400), th = num(o.th, 12);
      if (o.posts !== false) {
        var ph = num(o.postH, 170);
        svg("path", { d: "M" + P2([x - w / 2 + 14, y]) + " L" + P2([x - w / 2 + 14, y - ph]) + " M" + P2([x + w / 2 - 14, y]) + " L" + P2([x + w / 2 - 14, y - ph]) + " M" + P2([x - w / 2 - 6, y - ph]) + " L" + P2([x - w / 2 + 34, y - ph]) + " M" + P2([x + w / 2 - 34, y - ph]) + " L" + P2([x + w / 2 + 6, y - ph]), "class": "p-s", "stroke-width": f2(lw * 2.4), fill: "none", "stroke-linecap": "round" }, g);
        svg("path", { d: "M" + P2([x - w / 2 - 30, y - ph - 6]) + " L" + P2([x + w / 2 + 30, y - ph - 6]), "class": "p-s", "stroke-width": f2(lw * 0.8), fill: "none", "stroke-dasharray": "4 7" }, g);
      }
      svg("rect", { x: f1(x - w / 2), y: f1(y - th / 2), width: f1(w), height: f1(th), rx: f1(th / 2), "class": "b-f p-s", "stroke-width": f2(lw) }, g);
      svg("path", { d: "M" + P2([x - w / 2 + 8, y + th * 0.22]) + " L" + P2([x + w / 2 - 8, y + th * 0.22]), "class": "p-s", "stroke-width": f2(lw * 0.7), fill: "none" }, g);
      res.y = y;
    } else if (kind === "dipbars") {
      var x2 = num(o.x, WW / 2), y2 = num(o.y, 400), gr = num(o.ground, 820), w2 = num(o.w, 260);
      svg("path", { d: "M" + P2([x2 - w2 / 2 + 20, y2]) + " L" + P2([x2 - w2 / 2 + 30, gr]) + " M" + P2([x2 + w2 / 2 - 20, y2]) + " L" + P2([x2 + w2 / 2 - 30, gr]) + " M" + P2([x2 - w2 / 2 - 6, gr]) + " L" + P2([x2 - w2 / 2 + 66, gr]) + " M" + P2([x2 + w2 / 2 - 66, gr]) + " L" + P2([x2 + w2 / 2 + 6, gr]), "class": "p-s", "stroke-width": f2(lw * 2.2), fill: "none", "stroke-linecap": "round" }, g);
      svg("rect", { x: f1(x2 - w2 / 2), y: f1(y2 - 7), width: f1(w2), height: 14, rx: 7, "class": "b-f p-s", "stroke-width": f2(lw) }, g);
    } else if (kind === "rope") {
      var outer = svg("path", { "class": "k-s", fill: "none", "stroke-width": 15, "stroke-linecap": "round" }, g);
      var inner = svg("path", { "class": "f-s", fill: "none", "stroke-width": 9, "stroke-linecap": "round" }, g);
      var braid = svg("path", { "class": "k-s", fill: "none", "stroke-width": 9, "stroke-dasharray": "2.2 7", "stroke-linecap": "butt" }, g);
      var sag = num(o.sag, 18);
      st.on(function (t) {
        var a = ptOf(o.a, t), b = ptOf(o.b || { x: num(o.x2, a[0] + 300), y: a[1] }, t);
        if (o.extendA) a = add(a, mul(norm(sub(a, b)), o.extendA));
        if (o.extendB) b = add(b, mul(norm(sub(b, a)), o.extendB));
        var m = mixP(a, b, 0.5), c = [m[0], m[1] + sag], d = crD(quadPts(a, c, b, 10), false);
        setD(outer, d); setD(inner, d); setD(braid, d);
      });
    } else if (kind === "boulder") {
      var fig = o.fig, r = num(o.r, 74);
      if (fig && fig.g && fig.g.parentNode) fig.g.parentNode.insertBefore(g, fig.g);
      var bg = svg("g", null, g);
      var pts = blobPts([0, 0], r, 14, num(o.seed, 5), 0.08);
      svg("path", { d: crD(pts, true, 0.9), "class": "f-f k-s", "stroke-width": f2(lw * 1.1) }, bg);
      svg("path", { d: crD(blobPts([r * 0.18, r * 0.2], r * 0.62, 10, 9, 0.12), true), fill: st.pattern("xk", 5 / K) }, bg);
      svg("path", { d: "M" + P2([-r * 0.5, -r * 0.3]) + " L" + P2([-r * 0.1, -r * 0.05]) + " L" + P2([-r * 0.2, r * 0.3]) + " M" + P2([r * 0.3, -r * 0.6]) + " L" + P2([r * 0.45, -r * 0.2]), "class": "k-s", fill: "none", "stroke-width": f2(lw * 0.7) }, bg);
      st.on(function (t) {
        if (!fig) return;
        show(g, fig.visibleAt(t));
        var c = fig.world("carry", t);
        setA(bg, "transform", "translate(" + f1(c.x) + " " + f1(c.y) + ") scale(" + f2(fig.scale) + ")");
      });
    } else if (kind === "dumbbell" || kind === "kettlebell") {
      var fg = o.fig, side = o.side === "F" ? "F" : "N";
      if (fg && fg.g && fg.g.parentNode) fg.g.parentNode.insertBefore(g, kind === "kettlebell" ? fg.g.nextSibling : fg.g);
      var dg = svg("g", null, g);
      if (kind === "dumbbell") {
        svg("path", { d: circD([0, 0], 27), "class": "f-f k-s", "stroke-width": f2(lw * 1.1) }, dg);
        svg("path", { d: circD([0, 0], 19), fill: "none", "class": "k-s", "stroke-width": f2(lw * 0.6) }, dg);
        svg("path", { d: circD([0, 0], 27), fill: st.pattern("hk", 5 / K) }, dg);
        svg("path", { d: circD([0, 0], 6), "class": "k-f" }, dg);
      } else {
        svg("path", { d: "M-14 -6 C-16 -26 16 -26 14 -6 M-10 -6 C-10 -18 10 -18 10 -6", "class": "k-s", fill: "none", "stroke-width": f2(lw * 1.2) }, dg);
        svg("path", { d: circD([0, 26], 30), "class": "f-f k-s", "stroke-width": f2(lw * 1.1) }, dg);
        svg("path", { d: circD([8, 32], 22), fill: st.pattern("xk", 5 / K) }, dg);
      }
      st.on(function (t) {
        if (!fg) return;
        show(g, fg.visibleAt(t));
        var c = fg.world("hand" + side, t);
        setA(dg, "transform", "translate(" + f1(c.x) + " " + f1(c.y) + ") scale(" + f2(fg.scale) + ")");
      });
    } else {
      g.parentNode.removeChild(g);
      return null;
    }
    return res;
  }
  function floor(x, y, w, o) {
    var st = stg();
    o = obj(o);
    x = num(x, WW / 2); y = num(y, 820); w = num(w, 600);
    var g = svg("g", { "class": "ia-floor" }, st.back), lw = 3.4 / K, rnd = V.makeRand(Math.round(x + y * 3));
    if (o.shadow !== false) {
      var sw = num(o.shadowW, w * 0.42), sx = num(o.shadowX, x);
      svg("path", { d: ellD([sx, y + 6], sw / 2, 9), fill: st.pattern("hp", 5 / K), stroke: "none" }, g);
    }
    var x0 = x - w / 2, x1 = x + w / 2, th = o.thin ? 1.2 : 2.4;
    svg("path", { d: "M" + P2([x0, y]) + " Q" + P2([x0 + w * 0.1, y - th]) + " " + P2([x0 + w * 0.3, y - th]) + " L" + P2([x1 - w * 0.25, y - th * 0.8]) + " Q" + P2([x1 - w * 0.05, y - th * 0.6]) + " " + P2([x1, y]) + " Q" + P2([x1 - w * 0.2, y + th]) + " " + P2([x, y + th]) + " Q" + P2([x0 + w * 0.15, y + th]) + " " + P2([x0, y]) + " Z", "class": "p-f" }, g);
    var ticks = "";
    var n = Math.round(w / 34);
    for (var i = 0; i < n; i++) {
      var tx = x0 + w * 0.04 + (w * 0.92 * (i + rnd() * 0.6)) / n, tl = 8 + rnd() * 12, edge = Math.min(tx - x0, x1 - tx) / (w * 0.5);
      if (rnd() > 0.25 + 0.6 * (1 - edge)) ticks += "M" + P2([tx, y + 5]) + " L" + P2([tx - tl * 0.7, y + 5 + tl * 0.7]) + " ";
    }
    svg("path", { d: ticks, "class": "p-s", fill: "none", "stroke-width": f2(lw * 0.5), "stroke-linecap": "round" }, g);
    return { g: g, y: y };
  }

  // ======================================================================================
  // LETTERING
  // ======================================================================================
  // Text block (SVG). Space: o.world (true: world units in st.wfx) or screen px in st.top.
  // o: x, y, anchor (start|middle|end), vAnchor (top|middle|bottom), px, maxW, maxLines, font, weight,
  //    kind ("thumb" white with black stroke | "hand" page ink | "plain"), at, until, reveal (wipe|slam|pop|none), dur
  function textBlock(text, o) {
    var st = stg();
    o = o || {};
    var font = o.font || HAND, weight = o.weight || "700", kind = o.kind || "hand";
    var lay = wrapText(text, { font: font, weight: weight, px: o.px || 40, maxW: o.maxW || 600, maxLines: o.maxLines || 3, minPx: o.minPx, lh: o.lh || (kind === "thumb" ? 1.0 : 1.12), ls: o.ls || 0 });
    var parent = o.parent || (o.world ? st.wfx : st.top);
    var g = svg("g", { "class": "ia-text" }, parent);
    var anchor = o.anchor || "middle", va = o.vAnchor || "top";
    var x = num(o.x, 0), y = num(o.y, 0), px = lay.px, lh = lay.lh;
    var top = va === "top" ? y : va === "bottom" ? y - lay.h : y - lay.h / 2;
    var x0 = anchor === "start" ? x : anchor === "end" ? x - lay.w : x - lay.w / 2;
    var bx = box(x0, top, x0 + lay.w, top + lay.h);
    var lines = [];
    var layers = kind === "thumb" ? ["shadow", "main"] : ["main"];
    layers.forEach(function (ly) {
      lay.lines.forEach(function (ln, i) {
        var tx = svg("text", { x: f1(x), y: f1(top + lh * i + px * 0.86), "text-anchor": anchor, "font-family": font, "font-weight": weight, "font-size": f1(px) }, g);
        if (o.ls) tx.setAttribute("letter-spacing", f2(o.ls * px));
        if (kind === "thumb") {
          if (ly === "shadow") { tx.setAttribute("class", "th-sh"); tx.setAttribute("transform", "translate(" + f1(px * 0.05) + " " + f1(px * 0.07) + ")"); tx.setAttribute("stroke-width", f1(px * 0.2)); }
          else { tx.setAttribute("class", "th-main"); tx.setAttribute("stroke-width", f1(px * 0.17)); }
        } else tx.setAttribute("class", o.color === "red" ? "r-f" : o.color === "white" ? "w-f" : o.color === "soft" ? "s-f" : kind === "ink" ? "k-f" : "p-f");
        ln.forEach(function (tk, k) {
          (tk.segs || [{ t: tk.w, red: tk.red }]).forEach(function (sg, j) {
            var ts = svg("tspan", null, tx);
            ts.textContent = (k && !j ? " " : "") + sg.t;
            if (sg.red && ly === "main") ts.setAttribute("class", "r-f");
          });
        });
        lines.push({ el: tx, i: i, shadow: ly === "shadow" });
      });
    });
    var res = { g: g, box: bx, px: px, lines: lay.lines.length, lineW: lay.lines.map(function (l) { return lineW(l, px, font, weight, o.ls || 0); }), at: num(o.at, 0), until: o.until != null ? num(o.until, D) : null, world: !!o.world };
    var at = res.at, until = res.until, reveal = o.reveal || (kind === "thumb" ? "slam" : "wipe"), dur = num(o.dur, reveal === "wipe" ? clamp(0.18 * plainOf(text).split(" ").length, 0.3, 0.9) : 0.22);
    res.end = at + dur;
    var clip = null, rects = [];
    if (reveal === "wipe") {
      var cid = st.id("c");
      clip = svg("clipPath", { id: cid }, st.defs);
      lay.lines.forEach(function (ln, i) { rects.push(svg("rect", { x: f1(bx.x0 - px), y: f1(top + lh * i - px * 0.3), width: 0, height: f1(lh + px * 0.6) }, clip)); });
      g.setAttribute("clip-path", "url(#" + cid + ")");
    }
    st.on(function (t) {
      var on = t >= at && (until == null || t < until + 0.25);
      show(g, on);
      if (!on) return;
      var op = until != null && t > until ? 1 - (t - until) / 0.25 : 1;
      if (reveal === "wipe") {
        var p = clamp((t - at) / dur, 0, 1), nL = rects.length;
        rects.forEach(function (r, i) { var q = clamp(p * nL - i, 0, 1); setA(r, "width", f1((bx.w + px * 2) * q)); });
      } else if (reveal === "slam" || reveal === "pop") {
        var q2 = clamp((t - at) / dur, 0, 1), k = reveal === "slam" ? 1 + 0.7 * (1 - outBack(q2)) : 0.6 + 0.4 * outBack(q2);
        op *= clamp(q2 * 3, 0, 1);
        var cy = (bx.y0 + bx.y1) / 2;
        lines.forEach(function (L) {
          var yy = cy + (top + lh * L.i + px * 0.86 - cy) * k;
          setA(L.el, "font-size", f1(px * k)); setA(L.el, "y", f1(yy));
          if (!L.shadow) setA(L.el, "stroke-width", f1(px * k * 0.17)); else setA(L.el, "stroke-width", f1(px * k * 0.2));
        });
      }
      setOp(g, op);
    });
    st.addBox(function (t, c) {
      if (t < at || (until != null && t > until)) return null;
      var moving = t < at + dur;
      if (res.world) {
        var p0 = st.proj([bx.x0, bx.y0], c), p1 = st.proj([bx.x1, bx.y1], c);
        return { kind: o.boxKind || "label", label: plainOf(text), x: p0[0], y: p0[1], w: p1[0] - p0[0], h: p1[1] - p0[1], moving: c.moving || moving };
      }
      return { kind: o.boxKind || "text", label: plainOf(text), x: bx.x0, y: bx.y0, w: bx.w, h: bx.h, moving: moving };
    });
    return res;
  }
  // Red brush arrow from a to b (world), drawn on at `at`.
  function brushArrow(a, b, o) {
    var st = stg();
    o = o || {};
    var g = svg("g", null, o.parent || st.wfx), w = num(o.w, wu(u(5.5)));
    var line = svg("path", { fill: "none", "class": o.color === "ink" ? "p-s" : "r-s", "stroke-width": f2(w), "stroke-linecap": "round", pathLength: 1, "stroke-dasharray": "1 1" }, g);
    var head = svg("path", { fill: "none", "class": o.color === "ink" ? "p-s" : "r-s", "stroke-width": f2(w), "stroke-linecap": "round", "stroke-linejoin": "round" }, g);
    var at = num(o.at, 0), dur = num(o.dur, 0.35), until = o.until != null ? num(o.until, D) : null, bend = num(o.bend, 0.22);
    st.on(function (t) {
      var on = t >= at && (until == null || t < until + 0.25);
      show(g, on);
      if (!on) return;
      var A = ptOf(a, t), B = ptOf(b, t), d = sub(B, A), L = len(d) || 1, n = perp(mul(d, 1 / L));
      if (n[1] > 0) n = mul(n, -1);
      var C = add(mixP(A, B, 0.5), mul(n, bend * L * (o.flip ? -1 : 1)));
      var pts = quadPts(A, C, B, 14);
      setD(line, crD(pts, false));
      var p = clamp((t - at) / dur, 0, 1);
      setA(line, "stroke-dashoffset", f2(1 - outQ(p)));
      var tan = norm(sub(B, pts[12])), hl = Math.min(26, L * 0.35) * (w / 5.5), side = perp(tan);
      var h1 = add(B, add(mul(tan, -hl), mul(side, hl * 0.62))), h2 = add(B, add(mul(tan, -hl), mul(side, -hl * 0.62)));
      setD(head, p >= 0.98 ? "M" + P2(h1) + " L" + P2(B) + " L" + P2(h2) : "");
      setOp(g, until != null && t > until ? 1 - (t - until) / 0.25 : 1);
    });
    return { g: g };
  }
  // Ray from box centre toward p, cut at the box edge (plus pad).
  function boxEdge(bx, p, pad) {
    var c = [bx.cx, bx.cy], d = sub(p, c);
    if (Math.abs(d[0]) < 1e-6 && Math.abs(d[1]) < 1e-6) return c;
    var sx = d[0] !== 0 ? (bx.w / 2 + pad) / Math.abs(d[0]) : 1e9, sy = d[1] !== 0 ? (bx.h / 2 + pad) / Math.abs(d[1]) : 1e9, s = Math.min(sx, sy);
    return add(c, mul(d, s));
  }
  // Handwritten label in world space with a curved red arrow to (x, y) or to o.track(t).
  function annotate(text, o) {
    var st = stg();
    o = obj(o);
    var size = num(o.size, wu(u(PORT ? 50 : 44))), width = num(o.width, wu(u(PORT ? 520 : 460)));
    var align = o.align === "start" ? "start" : o.align === "end" ? "end" : "middle";
    var at = ct(num(o.at, T0), 0), until = o.until != null ? num(o.until, D) : null;
    var tb = textBlock(text, { world: true, x: num(o.lx, num(o.x, WW / 2) + 200), y: num(o.ly, num(o.y, 500) - 150), anchor: align, vAnchor: "middle", px: size, maxW: width, maxLines: num(o.maxLines, 2), at: at, until: until, color: o.color, kind: o.ink ? "ink" : "hand", boxKind: "label" });
    var res = { text: tb, box: tb.box, at: at, end: tb.end };
    if (o.arrow !== false && (o.track || o.x != null)) {
      var target = o.track || [num(o.x, 0), num(o.y, 0)], gap = num(o.gap, 12);
      var from = function (t) { var T = ptOf(target, t); var e = boxEdge(tb.box, T, 8); return { x: e[0], y: e[1] }; };
      var to = function (t) { var T = ptOf(target, t), F = boxEdge(tb.box, T, 8), d = sub(T, F), L = len(d) || 1; var g2 = Math.min(gap, L * 0.3); return { x: T[0] - (d[0] / L) * g2, y: T[1] - (d[1] / L) * g2 }; };
      res.arrow = brushArrow(from, to, { at: tb.end + 0.02, dur: num(o.arrowDur, 0.3), until: until, bend: o.bend != null ? num(o.bend, 0.2) : 0.2, flip: o.flip, w: num(o.arrowW, wu(u(PORT ? 6 : 5))) });
      res.end = tb.end + 0.32;
    }
    return res;
  }
  function handText(text, x, y, o) {
    o = obj(o);
    return textBlock(text, { world: true, x: num(x, WW / 2), y: num(y, 500), anchor: o.align || "middle", vAnchor: o.vAnchor || "middle", px: num(o.size, wu(u(44))), maxW: num(o.width, wu(u(520))), maxLines: num(o.maxLines, 3), at: ct(num(o.at, T0), 0), until: o.until, color: o.color, reveal: o.reveal });
  }
  function forceArrow(x1, y1, x2, y2, o) {
    var st = stg();
    o = obj(o);
    var g = svg("g", null, st.wfx), body = svg("path", { "class": o.color === "ink" ? "p-f" : "r-f", stroke: "none" }, g), edge = svg("path", { fill: "none", "class": "p-s", "stroke-width": f2(wu(u(3))), "stroke-linejoin": "round" }, g);
    var at = ct(num(o.at, T0), 0), until = o.until != null ? num(o.until, D) : null, A = [num(x1, 0), num(y1, 0)], B = [num(x2, 100), num(y2, 0)];
    var lpx2 = wu(u(PORT ? 44 : 40)), ltxt = o.label ? String(o.label).toUpperCase() : "";
    var d = norm(sub(B, A)), n = perp(d), L = dist(A, B), sw = num(o.width, ltxt ? lpx2 * 1.3 : Math.min(28, L * 0.16)), hw = sw * (ltxt ? 1.9 : 2.3), hl = Math.min(L * 0.4, sw * (ltxt ? 1.5 : 2.4));
    var lab = null;
    if (ltxt) {
      var need = measure(ltxt, lpx2 * K, IMPACT, "400") / K + hl + lpx2;
      if (L < need) { var mid0 = mixP(A, B, 0.5); A = sub(mid0, mul(d, need / 2)); B = add(mid0, mul(d, need / 2)); L = need; }
      var mid = add(A, mul(d, (L - hl) / 2));
      lab = textBlock(ltxt, { world: true, x: mid[0], y: mid[1], anchor: "middle", vAnchor: "middle", px: lpx2, maxW: L, maxLines: 1, font: IMPACT, weight: "400", color: "white", at: at + 0.22, until: until, reveal: "pop", lh: 1.0 });
    }
    st.on(function (t) {
      var on = t >= at && (until == null || t < until + 0.25);
      show(g, on);
      if (!on) return;
      var p = outC((t - at) / 0.3), wob = 1 + 0.05 * Math.sin(t * 18);
      var Ln = L * p, tip = add(A, mul(d, Ln)), hb = add(A, mul(d, Math.max(0, Ln - hl)));
      var pts = [add(A, mul(n, sw / 2)), add(hb, mul(n, sw / 2 * wob)), add(hb, mul(n, hw / 2)), tip, add(hb, mul(n, -hw / 2)), add(hb, mul(n, -sw / 2 * wob)), add(A, mul(n, -sw / 2))];
      var dd = polyD(pts, true);
      setD(body, dd); setD(edge, dd);
      setOp(g, until != null && t > until ? 1 - (t - until) / 0.25 : 1);
    });
    return { g: g, label: lab };
  }

  // Screen-space thumbnail lettering. Returns { box (px), title, kicker, sub }.
  var THUMB_PX = { xxl: [196, 168], xl: [128, 112], lg: [104, 96], md: [80, 76], sm: [60, 58] };
  function thumbText(text, at, o) {
    var st = stg();
    o = obj(o);
    var sa = safe(), size = THUMB_PX[o.size] ? o.size : "lg", px = u(THUMB_PX[size][PORT ? 1 : 0]);
    var pos = str(o.pos) || "top";
    var maxW = num(o.maxWidth, PORT ? sa.w : pos === "left" || pos === "right" || pos.indexOf("-") > 0 ? sa.w * 0.46 : sa.w * 0.8);
    at = ct(num(at, T0), 0);
    var lay = wrapText(text, { font: IMPACT, weight: "400", px: px, maxW: maxW, maxLines: num(o.maxLines, PORT ? 3 : 2), lh: 1.0, minPx: px * 0.55 });
    var kH = o.kicker ? u(PORT ? 40 : 36) * 1.36 + u(26) : 0, subLay = o.sub ? wrapText(o.sub, { font: HAND, px: u(PORT ? 48 : 42), maxW: maxW, maxLines: 2 }) : null, sH = subLay ? subLay.h + u(12) : 0;
    var totalH = kH + lay.h + sH;
    var anchor = "middle", x = sa.cx, y;
    if (pos === "top") y = sa.y0 + u(8);
    else if (pos === "bottom") y = sa.y1 - totalH - u(8);
    else if (pos === "center") y = sa.cy - totalH / 2;
    else if (pos === "left" || pos === "right") { y = sa.cy - totalH / 2; anchor = pos === "left" ? "start" : "end"; x = pos === "left" ? sa.x0 : sa.x1; }
    else if (pos === "top-left" || pos === "top-right") { y = sa.y0 + u(8); anchor = pos === "top-left" ? "start" : "end"; x = pos === "top-left" ? sa.x0 : sa.x1; }
    else y = sa.y0;
    if (o.x != null) x = num(o.x, x);
    if (o.y != null) y = num(o.y, y);
    if (o.anchor) anchor = o.anchor;
    var res = { kicker: null, sub: null };
    if (o.kicker) res.kicker = tagBox(String(o.kicker).toUpperCase(), at, { x: anchor === "start" ? x : anchor === "end" ? x : x, y: y, anchor: anchor, px: u(PORT ? 40 : 36), until: o.until, red: true, rot: -3 });
    res.title = textBlock(text, { x: x, y: y + kH, anchor: anchor, vAnchor: "top", px: lay.px, maxW: maxW, maxLines: num(o.maxLines, PORT ? 3 : 2), font: IMPACT, weight: "400", kind: "thumb", at: at + (o.kicker ? 0.08 : 0), until: o.until, lh: 1.0, ls: 0.01 });
    if (subLay) res.sub = textBlock(o.sub, { x: x, y: y + kH + res.title.box.h + u(12), anchor: anchor, vAnchor: "top", px: subLay.px, maxW: maxW, maxLines: 2, at: at + 0.35, until: o.until });
    var x0 = res.title.box.x0, x1 = res.title.box.x1;
    if (res.kicker) { x0 = Math.min(x0, res.kicker.box.x0); x1 = Math.max(x1, res.kicker.box.x1); }
    if (res.sub) { x0 = Math.min(x0, res.sub.box.x0); x1 = Math.max(x1, res.sub.box.x1); }
    res.box = box(x0, y, x1, y + kH + res.title.box.h + sH);
    return res;
  }
  // Boxed tag (Impact): red box + white text, or paper box + ink border.
  function tagBox(text, at, o) {
    var st = stg();
    o = obj(o);
    var px = num(o.px, u(PORT ? 44 : 40)), padX = px * 0.38, padY = px * 0.16;
    var w = measure(text, px, IMPACT, "400") + padX * 2, h = px * 1.04 + padY * 2;
    var anchor = o.anchor || "middle", x = num(o.x, W / 2), y = num(o.y, H / 2);
    var x0 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2, y0 = o.vAnchor === "middle" ? y - h / 2 : o.vAnchor === "bottom" ? y - h : y;
    var g = svg("g", null, o.parent || st.top);
    var rot = num(o.rot, -2);
    g.setAttribute("transform", "rotate(" + rot + " " + f1(x0 + w / 2) + " " + f1(y0 + h / 2) + ")");
    svg("rect", { x: f1(x0 + px * 0.08), y: f1(y0 + px * 0.1), width: f1(w), height: f1(h), "class": "k-f" }, g);
    svg("rect", { x: f1(x0), y: f1(y0), width: f1(w), height: f1(h), "class": o.red ? "r-f" : "w-f", stroke: "#0B0B0B", "stroke-width": f1(u(3)) }, g);
    var tx = svg("text", { x: f1(x0 + w / 2), y: f1(y0 + padY + px * 0.88), "text-anchor": "middle", "font-family": IMPACT, "font-size": f1(px), "class": o.red ? "w-f" : "ink0-f" }, g);
    tx.textContent = text;
    at = num(at, T0);
    var until = o.until != null ? num(o.until, D) : null;
    stg().on(function (t) {
      var on = t >= at && (until == null || t < until + 0.2);
      show(g, on);
      if (!on) return;
      var p = clamp((t - at) / 0.16, 0, 1);
      setOp(g, (until != null && t > until ? 1 - (t - until) / 0.2 : 1) * clamp(p * 2, 0, 1));
      var k = 1 + 0.5 * (1 - outBack(p));
      setA(g, "transform", "translate(" + f1(x0 + w / 2) + " " + f1(y0 + h / 2) + ") rotate(" + rot + ") scale(" + f2(k) + ") translate(" + f1(-(x0 + w / 2)) + " " + f1(-(y0 + h / 2)) + ")");
    });
    var bx = box(x0 - px * 0.06, y0 - px * 0.06, x0 + w + px * 0.14, y0 + h + px * 0.14);
    st.addBox(function (t) { if (t < at || (until != null && t > until)) return null; return { kind: "tag", label: text, x: bx.x0, y: bx.y0, w: bx.w, h: bx.h, moving: t < at + 0.16 }; });
    return { g: g, box: bx };
  }
  function handNote(text, at, o) {
    o = obj(o);
    var sa = safe();
    return textBlock(text, { x: num(o.x, sa.cx), y: num(o.y, sa.y1 - u(60)), anchor: o.anchor || "middle", vAnchor: o.vAnchor || "middle", px: num(o.size, u(PORT ? 50 : 44)), maxW: num(o.width, PORT ? sa.w : sa.w * 0.6), maxLines: num(o.maxLines, 2), at: ct(num(at, T0), 0), until: o.until, color: o.color });
  }
  function tag(text, at, o) { o = obj(o); return tagBox(String(text), ct(num(at, T0), 0), { x: o.x, y: o.y, anchor: o.anchor || "middle", vAnchor: o.vAnchor || "top", red: o.color === "red", px: o.px, rot: o.rot, until: o.until }); }
  // Counter sticker: label + big number from fn(t).
  function counterBox(at, o, valueFn, labelText) {
    var st = stg();
    o = obj(o);
    var px = num(o.px, u(PORT ? 84 : 76)), lpx = px * 0.36;
    var maxStr = String(o.maxText || "88");
    var w = Math.max(measure(maxStr, px, IMPACT, "400"), measure(labelText, lpx, IMPACT, "400")) + px * 0.6, h = px * 1.05 + lpx * 1.2 + px * 0.2;
    var anchor = o.anchor || "middle", x = num(o.x, W / 2), y = num(o.y, H / 2);
    var x0 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2, y0 = o.vAnchor === "bottom" ? y - h : o.vAnchor === "middle" ? y - h / 2 : y;
    var g = svg("g", null, st.top);
    svg("rect", { x: f1(x0 + u(6)), y: f1(y0 + u(7)), width: f1(w), height: f1(h), "class": "k-f" }, g);
    svg("rect", { x: f1(x0), y: f1(y0), width: f1(w), height: f1(h), "class": "w-f", stroke: "#0B0B0B", "stroke-width": f1(u(4)) }, g);
    svg("rect", { x: f1(x0), y: f1(y0), width: f1(w), height: f1(lpx * 1.25), "class": "k-f" }, g);
    var lt = svg("text", { x: f1(x0 + w / 2), y: f1(y0 + lpx * 1.0), "text-anchor": "middle", "font-family": IMPACT, "font-size": f1(lpx), "class": "w-f", "letter-spacing": f1(lpx * 0.08) }, g);
    lt.textContent = labelText;
    var nt = svg("text", { x: f1(x0 + w / 2), y: f1(y0 + lpx * 1.25 + px * 0.98), "text-anchor": "middle", "font-family": IMPACT, "font-size": f1(px), "class": "ink0-f" }, g);
    at = num(at, T0);
    var until = o.until != null ? num(o.until, D) : null, last = null;
    st.on(function (t) {
      var on = t >= at && (until == null || t < until);
      show(g, on);
      if (!on) return;
      var v = valueFn(t), s = String(v.text);
      if (nt.__s !== s) { nt.__s = s; nt.textContent = s; }
      var bump = v.bump != null ? v.bump : 0;
      setA(nt, "font-size", f1(px * (1 + 0.22 * bump)));
      setA(nt, "class", bump > 0.3 ? "r-f" : "ink0-f");
      setOp(g, clamp((t - at) / 0.15, 0, 1));
    });
    var bx = box(x0, y0, x0 + w + u(6), y0 + h + u(7));
    st.addBox(function (t) { if (t < at || (until != null && t > until)) return null; return { kind: "counter", label: labelText, x: bx.x0, y: bx.y0, w: bx.w, h: bx.h, moving: false }; });
    return { g: g, box: bx };
  }
  function repCounter(at, o) {
    o = obj(o);
    var period = Math.max(0.3, num(o.period, 1.8)), start = num(o.start, num(at, 0)), max = o.max != null ? num(o.max, 99) : 99;
    return counterBox(ct(num(at, T0), 0), o, function (t) {
      var n = Math.max(0, Math.floor((t - start) / period + 1e-6)), ph = (t - start) / period - n;
      return { text: String(Math.min(max, n)), bump: n > 0 && n <= max ? Math.max(0, 1 - ph * 5) : 0 };
    }, String(o.label || "REPS").toUpperCase());
  }
  function setsBadge(text, at, o) { o = obj(o); return tagBox(cleanText(text).toUpperCase(), ct(num(at, T0), 0), { x: o.x, y: o.y, anchor: o.anchor || "middle", vAnchor: o.vAnchor || "top", red: true, px: num(o.px, u(PORT ? 58 : 52)), rot: num(o.rot, -4), until: o.until }); }
  function weekCounter(from, to, o) {
    o = obj(o);
    var a = num(o.start, 0), b = num(o.end, 12), t0 = num(from, T0), t1 = Math.max(t0 + 0.2, num(to, D * 0.6));
    var digits = String(Math.max(Math.abs(Math.round(a)), Math.abs(Math.round(b)))).replace(/\d/g, "8");
    return counterBox(ct(t0, 0), Object.assign({ maxText: digits }, o), function (t) {
      var p = clamp((t - t0) / (t1 - t0), 0, 1), v = Math.round(lerp(a, b, inOut(p))), step = (t1 - t0) / Math.max(1, Math.abs(b - a));
      var since = p < 1 ? ((t - t0) % step) / step : (t - t1) / 0.3;
      return { text: String(v), bump: p >= 1 ? Math.max(0, 1 - since) : Math.max(0, 0.5 - since) };
    }, String(o.label || "WEEK").toUpperCase());
  }
  function bigStat(value, at, o) {
    var st = stg();
    o = obj(o);
    value = num(value, 0);
    var dec = clamp(Math.round(num(o.decimals, Math.abs(value) < 10 && value % 1 ? 1 : 0)), 0, 2), pre = str(o.prefix), suf = str(o.suffix);
    var px = num(o.px, u(PORT ? 300 : 280)), x = num(o.x, W / 2), y = num(o.y, H / 2), anchor = o.anchor || "middle";
    at = ct(num(at, T0), 0);
    var dur = num(o.dur, 0.9), t0 = Math.max(0.05, at - dur * 0.7);
    if (o.from != null && num(o.from, at) < t0) { t0 = Math.max(0.05, num(o.from, 0)); dur = Math.max(0.3, at - t0 + 0.1); }
    var easeN = dur > 1.5 ? inOut : outC;
    var full = pre + V.format(value, dec) + suf, maxW = num(o.maxW, 1e9);
    var w0 = measure(full, px, IMPACT, "400");
    if (w0 > maxW) { px *= maxW / w0; w0 = maxW; }
    var g = svg("g", null, st.top);
    var sh = svg("text", { x: f1(x + px * 0.04), y: f1(y + px * 0.06), "text-anchor": anchor, "font-family": IMPACT, "font-size": f1(px), "class": "th-sh", "stroke-width": f1(px * 0.1) }, g);
    var mn = svg("text", { x: f1(x), y: f1(y), "text-anchor": anchor, "font-family": IMPACT, "font-size": f1(px), "class": "th-main", "stroke-width": f1(px * 0.085) }, g);
    var rd = svg("tspan", { "class": "r-f" }, mn);
    st.on(function (t) {
      var on = t >= t0;
      show(g, on);
      if (!on) return;
      var p = easeN((t - t0) / dur), v = value * p, s = pre + V.format(v, dec) + suf;
      if (rd.__s !== s) { rd.__s = s; rd.textContent = s; sh.textContent = s; }
      var k = t < at + 0.25 && t > at - 0.05 ? 1 + 0.08 * Math.sin(clamp((t - at + 0.05) / 0.3, 0, 1) * PI) : 1;
      setA(mn, "font-size", f1(px * k)); setA(sh, "font-size", f1(px * k));
    });
    var x0 = anchor === "start" ? x : anchor === "end" ? x - w0 : x - w0 / 2;
    var bx = box(x0, y - px * 0.8, x0 + w0, y + px * 0.08);
    st.addBox(function (t) { if (t < t0) return null; return { kind: "stat", label: full, x: bx.x0, y: bx.y0, w: bx.w, h: bx.h, moving: t < t0 + dur }; });
    var res = { g: g, box: bx, at: at };
    if (o.label) res.label = textBlock(o.label, { x: anchor === "middle" ? x : x0 + (anchor === "end" ? w0 : 0), y: bx.y1 + u(18), anchor: anchor, vAnchor: "top", px: num(o.labelPx, u(PORT ? 56 : 50)), maxW: num(o.labelW, Math.max(w0, u(500))), maxLines: 2, at: at + 0.1 });
    return res;
  }
  function progressBar(from, to, o) {
    var st = stg();
    o = obj(o);
    var sa = safe(), wdt = num(o.width, sa.w * 0.5), x = num(o.x, sa.cx - wdt / 2), y = num(o.y, sa.cy), h = u(36), val = clamp(num(o.value, 1), 0, 1);
    var t0 = ct(num(from, T0), 0), t1 = Math.max(t0 + 0.2, num(to, D * 0.7));
    var g = svg("g", null, st.top);
    var fill = svg("rect", { x: f1(x), y: f1(y), height: f1(h), width: 0, "class": "r-f" }, g);
    svg("rect", { x: f1(x), y: f1(y), width: f1(wdt), height: f1(h), fill: st.pattern("hp", u(9)), stroke: "none", opacity: 0.35 }, g);
    svg("rect", { x: f1(x), y: f1(y), width: f1(wdt), height: f1(h), fill: "none", "class": "p-s", "stroke-width": f1(u(4)) }, g);
    var lab = o.label ? textBlock(o.label, { x: x, y: y - u(10), anchor: "start", vAnchor: "bottom", px: u(40), maxW: wdt, maxLines: 1, at: t0 }) : null;
    var pu = o.until != null ? num(o.until, D) : 1e9;
    st.on(function (t) { show(g, t >= t0 && t < pu); if (lab) show(lab.g, t >= t0 && t < pu); setA(fill, "width", f1(wdt * val * inOut((t - t0) / (t1 - t0)))); });
    st.addBox(function (t) { if (t < t0 || t >= pu) return null; return { kind: "bar", label: str(o.label), x: x, y: y, w: wdt, h: h, moving: false }; });
    return { g: g, label: lab };
  }
  // Red brush tick or cross, drawn on. x, y screen px unless o.world.
  function mark(kind, at, o) {
    var st = stg();
    o = obj(o);
    var size = num(o.size, u(PORT ? 120 : 110)), x = num(o.x, W / 2), y = num(o.y, H / 2), world = !!o.world;
    var g = svg("g", null, world ? st.wfx : st.top), sw = size * 0.16;
    if (kind === "strike") size = num(o.size, size);
    var d1, d2 = null;
    if (kind === "strike") { var hw2 = num(o.w, size) / 2; d1 = "M" + P2([x - hw2, y + size * 0.05]) + " Q" + P2([x - hw2 * 0.3, y - size * 0.12]) + " " + P2([x, y]) + " T" + P2([x + hw2, y - size * 0.06]); sw = size * 0.09; }
    else if (kind === "cross") { d1 = "M" + P2([x - size * 0.45, y - size * 0.42]) + " Q" + P2([x, y - size * 0.02]) + " " + P2([x + size * 0.45, y + size * 0.45]); d2 = "M" + P2([x + size * 0.44, y - size * 0.45]) + " Q" + P2([x + size * 0.04, y + size * 0.02]) + " " + P2([x - size * 0.42, y + size * 0.44]); }
    else d1 = "M" + P2([x - size * 0.45, y + size * 0.02]) + " L" + P2([x - size * 0.12, y + size * 0.38]) + " Q" + P2([x + size * 0.12, y - size * 0.2]) + " " + P2([x + size * 0.5, y - size * 0.48]);
    var p1 = svg("path", { d: d1, fill: "none", "class": "r-s", "stroke-width": f1(sw), "stroke-linecap": "round", "stroke-linejoin": "round", pathLength: 1, "stroke-dasharray": "1 1" }, g);
    var p2 = d2 ? svg("path", { d: d2, fill: "none", "class": "r-s", "stroke-width": f1(sw), "stroke-linecap": "round", pathLength: 1, "stroke-dasharray": "1 1" }, g) : null;
    at = ct(num(at, T0), 0);
    var until = o.until != null ? num(o.until, D) : null;
    st.on(function (t) {
      var on = t >= at && (until == null || t < until);
      show(g, on);
      if (!on) return;
      var a = d2 ? 0.14 : 0.22;
      setA(p1, "stroke-dashoffset", f2(1 - outQ((t - at) / a)));
      if (p2) setA(p2, "stroke-dashoffset", f2(1 - outQ((t - at - a - 0.04) / a)));
    });
    st.addBox(function (t, c) {
      if (t < at || (until != null && t > until)) return null;
      if (world) { var p0 = st.proj([x - size / 2, y - size / 2], c), q = st.proj([x + size / 2, y + size / 2], c); return { kind: "mark", label: kind, x: p0[0], y: p0[1], w: q[0] - p0[0], h: q[1] - p0[1], moving: c.moving }; }
      return { kind: "mark", label: kind, x: x - size / 2, y: y - size / 2, w: size, h: size, moving: t < at + 0.3 };
    });
    return { g: g };
  }
  function caption(o) {
    var st = stg();
    o = obj(o);
    var from = num(o.from, 0), to = num(o.to, D), sa = safe(), px = num(o.size, u(PORT ? 46 : 40));
    var y = num(o.y, sa.y1 - px * 0.4);
    var tx = svg("text", { x: f1(W / 2), y: f1(y), "text-anchor": "middle", "font-family": HAND, "font-weight": "700", "font-size": f1(px), "class": "p-f" }, st.top);
    var ws = V.words;
    st.on(function (t) {
      var on = t >= from && t < to;
      show(tx, on);
      if (!on) return;
      var i = -1;
      for (var k = 0; k < ws.length; k++) if (ws[k].start <= t) i = k;
      var a = Math.max(0, i - 4), s = ws.slice(a, i + 1).map(function (w) { return w.word; }).join(" ");
      if (tx.__s !== s) { tx.__s = s; tx.textContent = s; }
    });
    return { el: tx };
  }

  // ======================================================================================
  // MANGA GRAMMAR (screen space; x, y in world units)
  // ======================================================================================
  function screenOf(x, y) { return [num(x, WW / 2) * K, num(y, 500) * K]; }
  function focusLines(from, to, o) {
    var st = stg();
    o = obj(o);
    from = num(from, 0); to = num(to, D);
    var layer = o.layer === "over" ? st.over : st.under, c = screenOf(o.x, o.y), inner = num(o.inner, 300) * K;
    var g = svg("g", null, layer);
    if (o.bg) svg("rect", { x: 0, y: 0, width: W, height: H, "class": "b-f" }, g);
    var R = Math.sqrt(W * W + H * H), variants = [];
    for (var v = 0; v < 2; v++) {
      var rnd = V.makeRand(41 + v * 17), d = "", n = 120;
      for (var i = 0; i < n; i++) {
        var a = (i + rnd() * 0.8) / n * TAU, wid = (0.004 + rnd() * 0.012) * (0.6 + 0.4 * Math.abs(Math.cos(a))), ri = 1 + rnd() * 0.55;
        var p0 = [Math.cos(a - wid) * R, Math.sin(a - wid) * R], p1 = [Math.cos(a + wid) * R, Math.sin(a + wid) * R], tip = [Math.cos(a) * ri, Math.sin(a) * ri];
        d += "M" + P2(p0) + " L" + P2(p1) + " L" + f2(tip[0]) + " " + f2(tip[1]) + " Z ";
      }
      variants.push(svg("path", { d: d, "class": o.color === "red" ? "r-f" : "p-f", opacity: num(o.opacity, 0.9) }, g));
    }
    // tips are at radius ~1; scale tips only by moving them: emulate with a group scale on a unit ring
    variants.forEach(function (p) { p.setAttribute("d", p.getAttribute("d").replace(/L(-?[\d.]+) (-?[\d.]+) Z/g, function (m, a, b) { return "L" + f1(a * inner) + " " + f1(b * inner) + " Z"; })); });
    st.on(function (t) {
      var on = t >= from && t < to;
      show(g, on);
      if (!on) return;
      var p = outC((t - from) / 0.45), k = lerp(2.4, 1, p) * (1 + 0.03 * Math.sin(t * 9));
      var vi = Math.floor(t * 15) % 2;
      variants.forEach(function (el, i) { show(el, i === vi); });
      setA(g, "transform", "translate(" + f1(c[0]) + " " + f1(c[1]) + ")");
      variants[vi].setAttribute("transform", "scale(" + f2(k) + ")");
      setOp(g, t > to - 0.2 && to < D - 0.01 ? (to - t) / 0.2 : 1);
    });
    return { g: g };
  }
  function speedLines(from, to, o) {
    var st = stg();
    o = obj(o);
    from = num(from, 0); to = num(to, D);
    var layer = o.layer === "over" ? st.over : st.under, dir = str(o.dir) || "h";
    var g = svg("g", null, layer);
    if (o.bg) svg("rect", { x: 0, y: 0, width: W, height: H, "class": "b-f" }, g);
    var rnd = V.makeRand(77), lines = [], n = 46;
    var ang = dir === "v" ? 90 : dir === "diag" ? -25 : 0, sgn = dir === "left" ? -1 : 1;
    var inner = svg("g", { transform: "translate(" + f1(W / 2) + " " + f1(H / 2) + ") rotate(" + ang + ")" }, g), R = Math.sqrt(W * W + H * H);
    for (var i = 0; i < n; i++) {
      var y = (rnd() - 0.5) * R, l = R * (0.15 + rnd() * 0.35), th = u(2 + rnd() * 6), sp = 0.5 + rnd();
      if (o.clear && Math.abs(y) < num(o.clear, 0) * K) continue;
      var el = svg("path", { d: "M0 " + f1(-th / 2) + " L" + f1(l) + " 0 L0 " + f1(th / 2) + " Z", "class": "p-f", opacity: f2(0.35 + rnd() * 0.5) }, inner);
      lines.push({ el: el, y: y, l: l, sp: sp, ph: rnd() });
    }
    st.on(function (t) {
      var on = t >= from && t < to;
      show(g, on);
      if (!on) return;
      lines.forEach(function (L) {
        var x = (frac(L.ph + (t - from) * L.sp * 1.6) - 0.5) * (R + L.l) * 1.2;
        setA(L.el, "transform", "translate(" + f1(-sgn * x - L.l / 2) + " " + f1(L.y) + ")" + (sgn < 0 ? "" : " scale(-1 1)"));
      });
      setOp(g, Math.min(clamp((t - from) / 0.15, 0, 1), t > to - 0.2 && to < D - 0.01 ? (to - t) / 0.2 : 1));
    });
    return { g: g };
  }
  function impact(at, o) {
    var st = stg();
    o = obj(o);
    at = num(at, T0);
    var c = screenOf(o.x, o.y), g = svg("g", null, st.fx);
    if (o.invert !== false) st.invert(at, at + num(o.invertDur, 0.12));
    var R = Math.max(W, H) * num(o.size, 0.24);
    var burst = svg("path", { d: polyD(starPts([0, 0], R, R * 0.42, 16, 0, 3), true), "class": "r-f", stroke: "#0B0B0B", "stroke-width": f1(u(5)), "stroke-linejoin": "miter" }, g);
    var core = svg("path", { d: polyD(starPts([0, 0], R * 0.5, R * 0.22, 12, 8, 9), true), "class": "w-f", stroke: "#0B0B0B", "stroke-width": f1(u(4)) }, g);
    var rays = "", rnd = V.makeRand(19);
    for (var i = 0; i < 26; i++) { var a = rnd() * TAU, r0 = R * (0.55 + rnd() * 0.3), r1 = R * (1.1 + rnd() * 0.7); rays += "M" + P2([Math.cos(a) * r0, Math.sin(a) * r0]) + " L" + P2([Math.cos(a) * r1, Math.sin(a) * r1]) + " "; }
    var ray = svg("path", { d: rays, fill: "none", stroke: "#0B0B0B", "stroke-width": f1(u(5)), "stroke-linecap": "round" }, g);
    var big = o.big !== false;
    st.on(function (t) {
      var dt = t - at, life = num(o.life, 0.4), on = dt >= 0 && dt < life && big;
      show(g, on);
      if (!on) return;
      var k = 0.35 + 0.9 * outC(dt / 0.25);
      setA(g, "transform", "translate(" + f1(c[0]) + " " + f1(c[1]) + ") scale(" + f2(k) + ")");
      setOp(g, dt < life / 2 ? 1 : 1 - (dt - life / 2) / (life / 2));
      show(core, dt < life * 0.7); show(ray, true); show(burst, true);
    });
    if (o.shake !== false) st.cam.shake(at, num(o.shake, 16), 0.45);
    if (o.flash) flash(at, 0.12);
    return { g: g };
  }
  function flash(at, dur) {
    var st = stg();
    at = num(at, T0); dur = num(dur, 0.15);
    var r = svg("rect", { x: 0, y: 0, width: W, height: H, "class": "w-f" }, st.fx);
    st.on(function (t) { var dt = t - at, on = dt >= 0 && dt < dur; show(r, on); if (on) setOp(r, 1 - dt / dur); });
    return { el: r };
  }
  // Ink splash: a blob grows over the frame and recedes, leaving splatter. Returns the covered time.
  function splash(at, o) {
    var st = stg();
    o = obj(o);
    at = num(at, T0);
    var dur = num(o.dur, 0.62), c = screenOf(o.x, o.y), red = o.color === "red";
    var g = svg("g", null, st.fx);
    var pts = blobPts([0, 0], 1, 22, num(o.seed, 7), 0.16);
    var blob = svg("path", { d: crD(pts, true, 0.9), "class": red ? "r-f" : "p-f" }, g);
    var drops = "", rnd = V.makeRand(num(o.seed, 7) + 3);
    for (var i = 0; i < 14; i++) { var a = rnd() * TAU, r = 1.05 + rnd() * 0.5; drops += circD([Math.cos(a) * r, Math.sin(a) * r], 0.02 + rnd() * 0.05) + " "; }
    var dp = svg("path", { d: drops, "class": red ? "r-f" : "p-f" }, g);
    var R = Math.sqrt(W * W + H * H) * 0.75, tc = at + dur * 0.42;
    st.on(function (t) {
      var dt = t - at, on = dt >= 0 && dt < dur;
      show(g, on);
      if (!on) return;
      var k;
      if (t < tc) k = R * outC(dt / (dur * 0.42));
      else k = R * (1 - inOut((t - tc) / (dur * 0.58)));
      setA(g, "transform", "translate(" + f1(c[0]) + " " + f1(c[1]) + ") scale(" + f2(Math.max(0.01, k)) + ") rotate(" + f1(dt * 40) + ")");
      setOp(dp, t < tc ? 1 : 1 - (t - tc) / (dur * 0.58));
    });
    return { g: g, covered: tc, end: at + dur };
  }
  function splatter(parent, x, y, r, seed, color) {
    var st = stg();
    parent = parent || st.back;
    x = num(x, WW / 2); y = num(y, 500); r = num(r, 120); seed = num(seed, 3);
    var cls = color === "ink" || color === "black" ? "p-f" : "r-f";
    var g = svg("g", { "class": "ia-splat" }, parent), rnd = V.makeRand(seed * 11 + 1);
    svg("path", { d: crD(blobPts([x, y], r, 18, seed, 0.22), true, 0.9), "class": cls }, g);
    var d = "";
    for (var i = 0; i < 16; i++) {
      var a = rnd() * TAU, rr = r * (1.1 + rnd() * 0.9), q = [x + Math.cos(a) * rr, y + Math.sin(a) * rr];
      d += circD(q, r * (0.02 + rnd() * 0.07)) + " ";
      if (rnd() > 0.6) d += polyD([[x + Math.cos(a - 0.03) * r * 0.9, y + Math.sin(a - 0.03) * r * 0.9], q, [x + Math.cos(a + 0.03) * r * 0.9, y + Math.sin(a + 0.03) * r * 0.9]], true) + " ";
    }
    svg("path", { d: d, "class": cls }, g);
    return g;
  }

  // ======================================================================================
  // ANATOMY CUT-AWAY (a simplified, stylised x-ray limb; local units, origin at the centre)
  // ======================================================================================
  function fusiform(a, b, th, n, skew) {
    n = n || 14; skew = skew == null ? 0.5 : skew;
    var d = norm(sub(b, a)), nn = perp(d), top = [], bot = [];
    for (var i = 0; i <= n; i++) {
      var p = i / n, q = p < skew ? 0.5 * p / skew : 0.5 + 0.5 * (p - skew) / (1 - skew);
      var w = (th / 2) * Math.pow(Math.sin(PI * q), 0.75), c = mixP(a, b, p);
      top.push(add(c, mul(nn, w))); bot.push(add(c, mul(nn, -w)));
    }
    return { pts: top.concat(bot.reverse()), fib: function (k) { var out = []; for (var j = 1; j <= k; j++) { var f = -0.75 + 1.5 * j / (k + 1), l = []; for (var i = 1; i < n; i++) { var p = i / n, q = p < skew ? 0.5 * p / skew : 0.5 + 0.5 * (p - skew) / (1 - skew); l.push(add(mixP(a, b, p), mul(nn, f * (th / 2) * Math.pow(Math.sin(PI * q), 0.75)))); } out.push(l); } return out; } };
  }
  function bonePts(a, b, w, ka, kb) {
    var d = norm(sub(b, a)), nn = perp(d);
    ka = ka || w * 1.8; kb = kb || w * 1.8;
    return [add(a, mul(nn, ka)), add(add(a, mul(d, ka)), mul(nn, w)), add(add(b, mul(d, -kb)), mul(nn, w)), add(b, mul(nn, kb)), add(b, mul(d, kb * 0.7)), add(b, mul(nn, -kb)), add(add(b, mul(d, -kb)), mul(nn, -w)), add(add(a, mul(d, ka)), mul(nn, -w)), add(a, mul(nn, -ka)), add(a, mul(d, -ka * 0.7))];
  }
  function cordBand(pts, w) {
    var top = [], bot = [];
    for (var i = 0; i < pts.length; i++) {
      var a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], nn = perp(norm(sub(b, a)));
      top.push(add(pts[i], mul(nn, w / 2))); bot.push(add(pts[i], mul(nn, -w / 2)));
    }
    return top.concat(bot.reverse());
  }
  var LIMBS = {
    arm: {
      top: [[-470, -18], [-452, -92], [-402, -124], [-320, -114], [-230, -104], [-140, -114], [-50, -88], [16, -62], [84, -76], [180, -64], [290, -46], [338, -40], [376, -54], [440, -50], [474, -28]],
      bot: [[-470, 18], [-442, 96], [-382, 114], [-282, 118], [-162, 102], [-44, 78], [10, 66], [84, 70], [180, 56], [290, 40], [338, 36], [396, 46], [458, 40], [480, 8]],
      bones: [{ a: [-418, -2], b: [6, 4], w: 12, ka: 34, kb: 26 }, { a: [24, -16], b: [338, -12], w: 8, ka: 13, kb: 15 }, { a: [8, 16], b: [336, 14], w: 7, ka: 18, kb: 12 }],
      boneExtra: function () { return [crD(blobPts([368, 0], 22, 8, 4, 0.12), true), crD([[388, -28], [440, -34]], false), crD([[392, -6], [452, -10]], false), crD([[392, 16], [448, 16]], false)]; },
      muscles: [{ a: [-370, -62], b: [-60, -54], th: 74, k: "biceps" }, { a: [-410, 62], b: [-40, 44], th: 76, k: "triceps" }, { a: [-470, -40], b: [-310, -84], th: 70, k: "deltoid", skew: 0.4 }, { a: [40, -36], b: [240, -30], th: 52, k: "forearm" }, { a: [44, 32], b: [250, 28], th: 50, k: "forearm2" }],
      tendons: [{ p: [[-70, -50], [-10, -34], [46, -18]], w: 15, k: "biceps" }, { p: [[-44, 44], [-6, 46], [14, 44]], w: 14 }, { p: [[236, -30], [300, -24], [352, -20], [430, -30]], w: 8 }, { p: [[240, 0], [300, 0], [352, 0], [446, -6]], w: 8 }, { p: [[246, 28], [300, 22], [352, 18], [440, 18]], w: 8 }],
      anchors: { muscle: [-215, -58], tendon: [-6, -36], bone: [-200, 2], skin: [-230, -104] },
      box: [-480, -130, 484, 124],
    },
    leg: {
      top: [[-480, -24], [-460, -108], [-362, -128], [-200, -118], [-84, -92], [-22, -82], [40, -66], [200, -52], [330, -38], [354, -92], [370, -166], [392, -178], [408, -156], [410, -62], [416, 18]],
      bot: [[-480, 24], [-452, 108], [-352, 118], [-200, 110], [-84, 80], [0, 72], [84, 98], [182, 82], [280, 44], [340, 40], [398, 52]],
      bones: [{ a: [-444, -16], b: [-22, -2], w: 14, ka: 32, kb: 32 }, { a: [12, -18], b: [340, -16], w: 11, ka: 26, kb: 15 }, { a: [24, 22], b: [334, 18], w: 5, ka: 10, kb: 9 }],
      boneExtra: function () { return [crD(blobPts([-30, -62], 17, 8, 2, 0.08), true), crD(blobPts([386, 24], 22, 8, 6, 0.1), true), crD([[362, -40], [378, -150]], false), crD([[378, -40], [394, -152]], false), crD([[392, -40], [402, -146]], false)]; },
      muscles: [{ a: [-410, -72], b: [-70, -62], th: 82, k: "quads" }, { a: [-420, 70], b: [-80, 52], th: 72, k: "hamstrings" }, { a: [10, 52], b: [250, 42], th: 74, k: "calf", skew: 0.35 }, { a: [44, -40], b: [250, -30], th: 30, k: "tibialis" }],
      tendons: [{ p: [[-80, -62], [-30, -70], [10, -54], [42, -32]], w: 16, k: "patellar" }, { p: [[236, 44], [300, 40], [350, 36], [392, 34]], w: 16, k: "achilles" }, { p: [[-86, 54], [-40, 40], [14, 30]], w: 10 }],
      anchors: { muscle: [-240, -66], tendon: [300, 40], bone: [-230, -8], skin: [-200, -118] },
      box: [-484, -184, 420, 122],
    },
    forearm: {
      top: [[-470, -18], [-446, -84], [-362, -100], [-200, -84], [-40, -54], [20, -46], [70, -60], [200, -62], [310, -60], [430, -44], [466, -14]],
      bot: [[-470, 18], [-444, 74], [-362, 88], [-200, 72], [-40, 48], [20, 44], [70, 58], [190, 64], [310, 52], [430, 38], [468, 10]],
      bones: [{ a: [-440, -24], b: [16, -20], w: 10, ka: 16, kb: 20 }, { a: [-452, 18], b: [14, 16], w: 9, ka: 22, kb: 14 }],
      boneExtra: function () { var o = []; [-36, -12, 12, 34].forEach(function (y) { o.push(crD([[74, y * 0.7], [200, y]], false)); o.push(crD([[214, y], [300, y * 1.02]], false)); o.push(crD([[312, y], [420, y * 0.8]], false)); }); o.push(crD(blobPts([46, 0], 26, 8, 3, 0.1), true)); return o; },
      muscles: [{ a: [-430, 40], b: [-110, 30], th: 66, k: "flexors" }, { a: [-430, -48], b: [-110, -40], th: 64, k: "extensors" }],
      tendons: [{ p: [[-120, 30], [-40, 26], [20, 22], [120, 26], [220, 30], [420, 26]], w: 8, k: "flex" }, { p: [[-120, 14], [-40, 10], [20, 8], [120, 8], [220, 10], [430, 8]], w: 8 }, { p: [[-116, -42], [-40, -34], [20, -28], [120, -24], [220, -26], [424, -24]], w: 8 }, { p: [[-116, -24], [-40, -14], [20, -10], [120, -6], [220, -8], [430, -6]], w: 7 }],
      anchors: { muscle: [-270, 36], tendon: [-30, 18], bone: [-220, -22], skin: [-200, -84] },
      box: [-474, -104, 472, 92],
    },
  };
  function anatomyLimb(o) {
    var st = stg();
    o = obj(o);
    var kind = LIMBS[o.limb] ? o.limb : "arm", L = LIMBS[kind];
    var x = num(o.x, WW / 2), y = num(o.y, 500), sc = num(o.scale, 0.8), rot = num(o.rot, 0);
    var tr = "translate(" + f1(x) + " " + f1(y) + ") rotate(" + f1(rot) + ") scale(" + f2(sc) + ")";
    var g = svg("g", { transform: tr, "class": "ia-limb" }, o.parent || st.mid);
    var lw = 3.6 / (K * sc);
    var skin = L.top.concat(L.bot.slice().reverse()), skinD = crD(skin, true, 0.9);
    var hs = st.pattern("hk", 6 / (K * sc)), dots = st.pattern("dk", 7 / (K * sc)), xs = st.pattern("xk", 7 / (K * sc));
    var layers = {}, reds = {}, clips = {};
    function layer(name) {
      var cid = st.id("lc"), cp = svg("clipPath", { id: cid }, st.defs), r = svg("rect", { x: -520, y: -260, width: 0, height: 520 }, cp);
      var lg = svg("g", { "clip-path": "url(#" + cid + ")" }, g);
      clips[name] = r; layers[name] = lg;
      return lg;
    }
    // skin (fill + rim of shading)
    var sk = layer("skin");
    svg("path", { d: skinD, "class": "f-f" }, sk);
    svg("path", { d: crD(L.top.slice(1, -1).map(function (p) { return [p[0], p[1] + 10]; }), false), fill: "none", "class": "k-s", "stroke-width": f2(lw * 0.4), "stroke-dasharray": f1(lw * 2) + " " + f1(lw * 2.4) }, sk);
    var shadeTop = L.bot.slice(1, -1), shadeIn = shadeTop.map(function (p) { return [p[0], p[1] - 18]; });
    svg("path", { d: crD(shadeTop.concat(shadeIn.reverse()), true), fill: hs }, sk);
    // muscles
    var mu = layer("muscle"), muRed = svg("g", null, g), muD = "", muF = "";
    L.muscles.forEach(function (m) {
      var f = fusiform(m.a, m.b, m.th, 16, m.skew), d = crD(f.pts, true, 0.9);
      svg("path", { d: d, "class": "f-f k-s", "stroke-width": f2(lw * 0.9) }, mu);
      svg("path", { d: crD(f.pts.slice(Math.floor(f.pts.length / 2)), false), fill: "none", "class": "k-s", "stroke-width": f2(lw * 1.5) }, mu);
      var fib = "";
      f.fib(5).forEach(function (ln) { fib += crD(ln, false) + " "; });
      svg("path", { d: fib, fill: "none", "class": "k-s", "stroke-width": f2(lw * 0.35) }, mu);
      var half = f.pts.slice(Math.floor(f.pts.length / 2));
      svg("path", { d: crD(half.concat([mixP(m.a, m.b, 0.5)]), true), fill: hs }, mu);
      muD += d + " "; muF += fib + " ";
    });
    reds.muscle = [svg("path", { d: muD, "class": "r-f r-s", "stroke-width": 0 }, muRed), svg("path", { d: muF, fill: "none", "class": "rd-s", "stroke-width": f2(lw * 0.5) }, muRed)];
    // bones
    var bo = layer("bone"), boRed = svg("g", null, g), boD = "";
    L.bones.forEach(function (b) { boD += crD(bonePts(b.a, b.b, b.w, b.ka, b.kb), true, 0.8) + " "; });
    svg("path", { d: boD, "class": "f-f k-s", "stroke-width": f2(lw * 0.9) }, bo);
    svg("path", { d: boD, fill: dots }, bo);
    var bx = L.boneExtra();
    svg("path", { d: bx.join(" "), "class": "f-f k-s", "stroke-width": f2(lw * 0.8), "stroke-linecap": "round" }, bo);
    reds.bone = [svg("path", { d: boD + " " + bx.filter(function (d) { return / Z$/.test(d); }).join(" "), "class": "r-f r-s", "stroke-width": 0 }, boRed), svg("path", { d: bx.filter(function (d) { return !/ Z$/.test(d); }).join(" "), fill: "none", "class": "r-s", "stroke-width": f2(lw * 1.6) }, boRed)];
    // tendons
    var te = layer("tendon"), teRed = svg("g", null, g), teD = "", teF = "";
    L.tendons.forEach(function (tn) {
      var band = crD(cordBand(tn.p, tn.w), true, 0.8);
      svg("path", { d: band, "class": "f-f k-s", "stroke-width": f2(lw * 0.8) }, te);
      var fib = "";
      [-0.25, 0.25].forEach(function (f) { fib += crD(tn.p.map(function (p, i) { var a = tn.p[Math.max(0, i - 1)], b = tn.p[Math.min(tn.p.length - 1, i + 1)]; return add(p, mul(perp(norm(sub(b, a))), f * tn.w)); }), false) + " "; });
      svg("path", { d: fib, fill: "none", "class": "k-s", "stroke-width": f2(lw * 0.3) }, te);
      teD += band + " "; teF += fib + " ";
    });
    reds.tendon = [svg("path", { d: teD, "class": "r-f r-s", "stroke-width": 0 }, teRed), svg("path", { d: teF, fill: "none", "class": "rd-s", "stroke-width": f2(lw * 0.5) }, teRed)];
    // skin outline on top (brush), drawn with the skin layer reveal
    var outline = svg("path", { d: skinD, fill: "none", "class": "k-s", "stroke-width": f2(lw * 1.4), "stroke-linejoin": "round" }, sk.parentNode);
    var outlineHeavy = svg("path", { d: crD(L.bot, false, 0.9), fill: "none", "class": "k-s", "stroke-width": f2(lw * 2.6), "stroke-linecap": "round" }, sk.parentNode);
    var skRed = svg("g", null, g);
    reds.skin = [svg("path", { d: skinD, fill: "none", "class": "r-s", "stroke-width": f2(lw * 3) }, skRed)];
    var redG = { muscle: muRed, bone: boRed, tendon: teRed, skin: skRed };
    // reveal + focus schedules
    var reveals = { skin: num(o.revealSkin, 0.15), muscle: num(o.revealMuscle, 0.5), bone: num(o.revealBone, 0.85), tendon: num(o.revealTendon, 1.2) }, rdur = 0.45;
    if (o.instant) reveals = { skin: -1, muscle: -1, bone: -1, tendon: -1 };
    var focuses = [], vis = [];
    if (o.focus && o.focus !== "none") focuses.push({ layer: o.focus, at: num(o.focusAt, 0), until: null });
    if (o.until != null) addVis(vis, o.until, false);
    var res = {
      g: g, kind: kind,
      hide: function (at) { addVis(vis, at, false); return res; },
      show: function (at) { addVis(vis, at, true); return res; },
      anchor: function (layerName) { var a = L.anchors[layerName] || L.anchors.muscle; return toW(a); },
      point: function (lx, ly) { return toW([lx, ly]); },
      reveal: function (layerName, at) { if (reveals[layerName] != null) reveals[layerName] = num(at, 0); return res; },
      focus: function (layerName, at, until) {
        var ln = layerName === "all" ? ["muscle", "tendon", "bone"] : [layerName];
        ln.forEach(function (n) { if (redG[n]) focuses.push({ layer: n, at: num(at, 0), until: until != null ? num(until, D) : null }); });
        return res;
      },
      bounds: function () { var b = L.box, c = [toW([b[0], b[1]]), toW([b[2], b[1]]), toW([b[0], b[3]]), toW([b[2], b[3]])]; return box(Math.min(c[0].x, c[1].x, c[2].x, c[3].x), Math.min(c[0].y, c[1].y, c[2].y, c[3].y), Math.max(c[0].x, c[1].x, c[2].x, c[3].x), Math.max(c[0].y, c[1].y, c[2].y, c[3].y)); },
    };
    function toW(p) { var r = rad(rot), c = Math.cos(r), s = Math.sin(r); return { x: x + (p[0] * c - p[1] * s) * sc, y: y + (p[0] * s + p[1] * c) * sc }; }
    st.on(function (t) {
      var vv = visAt(vis, t);
      show(g, vv);
      if (!vv) return;
      Object.keys(clips).forEach(function (n) {
        var p = reveals[n] < 0 ? 1 : outQ((t - reveals[n]) / rdur);
        setA(clips[n], "width", f1(1040 * p));
        show(layers[n], p > 0);
      });
      show(outline, t >= reveals.skin); show(outlineHeavy, t >= reveals.skin);
      Object.keys(redG).forEach(function (n) {
        var a = 0, pe = 0;
        focuses.forEach(function (f) {
          if (f.layer !== n || t < f.at) return;
          var v = smooth((t - f.at) / 0.25);
          if (f.until != null) v *= 1 - smooth((t - f.until) / 0.25);
          a = Math.max(a, v);
          var d = t - f.at; pe = Math.max(pe, Math.exp(-d / 0.35) * (f.until == null || t < f.until ? 1 : 0));
        });
        show(redG[n], a > 0.01);
        if (a > 0.01) {
          setOp(redG[n], a * (0.86 + 0.1 * Math.sin(t * 6)));
          if (reds[n][0]) { setA(reds[n][0], "stroke-width", f1(pe * 16 / sc)); setA(reds[n][0], "stroke-opacity", f2(0.4 * pe)); }
        }
      });
    });
    st.addBox(function (t, c) {
      if (t < reveals.skin || !visAt(vis, t)) return null;
      var b = res.bounds(), p0 = st.proj([b.x0, b.y0], c), p1 = st.proj([b.x1, b.y1], c);
      return { kind: "anatomy", label: kind, x: p0[0], y: p0[1], w: p1[0] - p0[0], h: p1[1] - p0[1], moving: c.moving };
    });
    return res;
  }
  // Size the cut-away to fit a world box; returns { scale, rot }.
  function fitLimb(kind, bx, rot) {
    var L = LIMBS[kind] || LIMBS.arm, b = L.box, w = b[2] - b[0], h = b[3] - b[1];
    var vert = Math.abs(rot % 180) === 90;
    var sw = vert ? h : w, sh = vert ? w : h;
    var cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    var s = Math.min(bx.w / sw, bx.h / sh);
    var r = rad(rot), ox = (cx * Math.cos(r) - cy * Math.sin(r)) * s, oy = (cx * Math.sin(r) + cy * Math.cos(r)) * s;
    return { scale: s, x: bx.cx - ox, y: bx.cy - oy };
  }

  // ======================================================================================
  // INK CHART
  // ======================================================================================
  function inkChart(o, times) {
    var st = stg();
    o = obj(o);
    var x = num(o.x, WW * 0.2), y = num(o.y, 200), w = num(o.w, WW * 0.6), h = num(o.h, 500), type = o.type === "bars" ? "bars" : "line";
    var series = arr(o.series).filter(function (s) { return s && arr(s.values).length; }).slice(0, 3);
    if (!series.length) series = [{ values: [1, 2, 3] }];
    var n = 0;
    series.forEach(function (s) { n = Math.max(n, Math.min(12, arr(s.values).length)); });
    n = Math.max(2, n);
    var vmax = num(o.max, 0);
    series.forEach(function (s) { arr(s.values).forEach(function (v) { vmax = Math.max(vmax, num(v, 0)); }); });
    vmax = vmax > 0 ? vmax * (o.max ? 1 : 1.12) : 1;
    var g = svg("g", { "class": "ia-chart" }, st.mid), lw = wu(u(4)), fpx = wu(u(PORT ? 36 : 32));
    var x0 = x, y1 = y + h, x1 = x + w;
    times = arr(times).slice(0, n);
    var tStart = num(o.at, T0);
    if (times.length < n) { var a0 = times.length ? times[times.length - 1] : tStart + 0.5; for (var i = times.length; i < n; i++) times.push(a0 + (TE() - 0.4 - a0) * (i - (times.length - 1)) / Math.max(1, n - times.length)); }
    times = times.map(function (t) { return ct(t); });
    // axes
    var axD = "M" + P2([x0, y - fpx * 0.6]) + " Q" + P2([x0 - 2, y + h * 0.5]) + " " + P2([x0, y1]) + " Q" + P2([x0 + w * 0.5, y1 + 3]) + " " + P2([x1 + fpx * 0.4, y1]);
    var ax = svg("path", { d: axD, fill: "none", "class": "p-s", "stroke-width": f2(lw), "stroke-linecap": "round", pathLength: 1, "stroke-dasharray": "1 1" }, g);
    svg("path", { d: "M" + P2([x0 - 12, y - fpx * 0.6 + 16]) + " L" + P2([x0, y - fpx * 0.6]) + " L" + P2([x0 + 12, y - fpx * 0.6 + 16]) + " M" + P2([x1 + fpx * 0.4 - 16, y1 - 12]) + " L" + P2([x1 + fpx * 0.4, y1]) + " L" + P2([x1 + fpx * 0.4 - 16, y1 + 12]), fill: "none", "class": "p-s", "stroke-width": f2(lw), "stroke-linecap": "round", "stroke-linejoin": "round" }, g);
    var grid = "";
    for (var gi = 1; gi <= 3; gi++) { var gy = y1 - (h * gi) / 3.4; grid += "M" + P2([x0 + 6, gy]) + " L" + P2([x1, gy]) + " "; }
    svg("path", { d: grid, fill: "none", "class": "p-s", "stroke-width": f2(lw * 0.3), "stroke-dasharray": f1(lw) + " " + f1(lw * 3), opacity: 0.6 }, g);
    var slot = w / n;
    function px(i) { return type === "bars" ? x0 + slot * (i + 0.5) : x0 + w * 0.04 + (w * 0.92 * i) / (n - 1); }
    function py(v) { return y1 - (clamp(num(v, 0), 0, vmax) / vmax) * h; }
    var labels = [];
    arr(o.xLabels).slice(0, n).forEach(function (lb, i) {
      labels.push(textBlock(str(lb), { world: true, x: px(i), y: y1 + fpx * 0.35, anchor: "middle", vAnchor: "top", px: fpx, maxW: Math.max(slot * 1.1, fpx * 3), maxLines: 1, at: tStart + 0.2, reveal: "wipe" }));
    });
    if (o.yLabel) {
      var yl = textBlock(str(o.yLabel), { world: true, x: x0 + fpx * 0.5, y: y - fpx * 0.9, anchor: "start", vAnchor: "bottom", px: fpx * 1.05, maxW: w * 0.6, maxLines: 1, at: tStart + 0.1 });
      labels.push(yl);
    }
    var drawn = [];
    series.forEach(function (s, si) {
      var vals = arr(s.values).slice(0, n), red = si === 0;
      if (type === "bars") {
        var bw = (slot * 0.7) / series.length;
        vals.forEach(function (v, i) {
          var bx = px(i) - slot * 0.35 + bw * si + bw * 0.08, top = py(v), bww = bw * 0.84;
          var gb = svg("g", null, g);
          var r1 = svg("rect", { x: f1(bx), width: f1(bww), "class": red ? "r-f" : "b-f" }, gb);
          var r2 = svg("rect", { x: f1(bx), width: f1(bww), fill: st.pattern(red ? "hr" : "hp", wu(u(8))), stroke: "none" }, gb);
          var r3 = svg("rect", { x: f1(bx), width: f1(bww), fill: "none", "class": "p-s", "stroke-width": f2(lw * 0.8) }, gb);
          drawn.push({ el: [r1, r2, r3], t: times[i], top: top, bottom: y1 });
        });
      } else {
        var pts = vals.map(function (v, i) { return [px(i), py(v)]; });
        var path = svg("path", { fill: "none", "class": red ? "r-s" : "p-s", "stroke-width": f2(red ? lw * 1.7 : lw * 1.1), "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-dasharray": red ? null : f1(lw * 3) + " " + f1(lw * 2.4) }, g);
        var dots = pts.map(function (p) { return svg("path", { d: circD(p, red ? lw * 2.1 : lw * 1.6), "class": red ? "r-f p-s" : "b-f p-s", "stroke-width": f2(lw * 0.7) }, g); });
        drawn.push({ line: path, pts: pts, dots: dots, red: red });
      }
      if (s.label && type === "bars") {
        var lastB = vals.length - 1, bwB = (slot * 0.7) / series.length;
        labels.push(textBlock(str(s.label), { world: true, x: px(lastB) - slot * 0.35 + bwB * (si + 0.5), y: py(vals[lastB]) - fpx * 0.3, anchor: "middle", vAnchor: "bottom", px: fpx * 0.95, maxW: Math.max(bwB * 2, fpx * 4), maxLines: 1, color: red ? "red" : null, at: times[Math.min(times.length - 1, lastB)] + 0.15 }));
      } else if (s.label) {
        var last = vals.length - 1, lp = [px(last), py(vals[last])];
        labels.push(textBlock(str(s.label), { world: true, x: Math.min(lp[0] + fpx * 0.3, x1 + fpx * 0.2), y: lp[1] - fpx * (si === 0 ? 0.9 : -0.9), anchor: "end", vAnchor: "middle", px: fpx * 1.05, maxW: w * 0.4, maxLines: 1, color: red ? "red" : null, at: times[Math.min(times.length - 1, last)] + 0.15 }));
      }
    });
    var cvis = [];
    if (o.until != null) addVis(cvis, o.until, false);
    st.on(function (t) {
      show(g, t >= tStart && visAt(cvis, t));
      setA(ax, "stroke-dashoffset", f2(1 - outQ((t - tStart) / 0.5)));
      drawn.forEach(function (d) {
        if (d.el) {
          var p = outC((t - (d.t - 0.25)) / 0.35), hh = (d.bottom - d.top) * p;
          d.el.forEach(function (r) { setA(r, "y", f1(d.bottom - hh)); setA(r, "height", f1(Math.max(0, hh))); });
          return;
        }
        var pts = d.pts, out = [pts[0]];
        for (var i = 1; i < pts.length; i++) {
          var a = times[i] - 0.3, q = clamp((t - a) / 0.3, 0, 1);
          if (q <= 0) break;
          out.push(mixP(pts[i - 1], pts[i], q));
          if (q < 1) break;
        }
        setD(d.line, t >= times[0] - 0.2 ? polyD(out) : "");
        d.dots.forEach(function (dt, i) { show(dt, t >= times[i] - (i ? 0.02 : 0.2)); });
      });
    });
    st.addBox(function (t, c) {
      if (t < tStart || !visAt(cvis, t)) return null;
      var p0 = st.proj([x0 - fpx * 0.4, y - fpx * 1.9], c), p1 = st.proj([x1 + fpx * 0.6, y1 + fpx * 1.5], c);
      return { kind: "chart", label: "chart", x: p0[0], y: p0[1], w: p1[0] - p0[0], h: p1[1] - p0[1], moving: c.moving };
    });
    return { g: g, times: times, hide: function (at) { addVis(cvis, at, false); }, show: function (at) { addVis(cvis, at, true); }, point: function (si, i) { var s = series[clamp(si, 0, series.length - 1)], v = arr(s.values)[clamp(i, 0, n - 1)]; return { x: px(clamp(i, 0, n - 1)), y: py(v) }; }, box: box(x0, y, x1, y1), n: n };
  }

  // ======================================================================================
  // TEMPLATES
  // ======================================================================================
  var TPL = {};
  var BACK_PARTS = ["triceps", "lats", "back", "glutes", "hamstrings", "calves", "achilles"];
  var HARD_POSE = { pushup: "pushup-down", pullup: "pullup-up", planche: "planche", handstand: "handstand", hang: "hang", lift: "lift-b", tug: "tug-b", squat: "squat-down", dip: "dip-down", plank: "plank", sprint: "run-a", curl: "curl-b", lunge: "lunge-b", flex: "flex" };
  var ERR_NOTE = { pushup: "hips sag", squat: "back rounds", pullup: "half rep", plank: "hips sag", planche: "bent arms", sprint: "heel strike", tug: "no brace", lift: "round back", curl: "swinging", dip: "too shallow", hang: "shrugged", handstand: "banana back", lunge: "knee too far", flex: "no tension", idle: "slouching" };
  var ERR_JOINT = { pushup: "hip", squat: "back", pullup: "head", plank: "hip", planche: "elbowN", sprint: "toeN", tug: "hip", lift: "back", curl: "chest", dip: "shN", hang: "shN", handstand: "hip", lunge: "kneeN", flex: "chest", idle: "back" };
  function charOf(c, d) { c = str(c).toLowerCase(); return CAST[c] ? c : d || "rook"; }
  function begin(root, p) {
    var st = scene({ bg: p.bg }, root);
    return st;
  }
  function addFig(st, name, fit, o) {
    o = o || {};
    return new Figure(st, name, { x: fit.x, y: fit.y, scale: fit.scale, facing: o.facing, build: o.build, expression: o.expression, pose: o.pose, shorts: o.shorts, lod: o.lod });
  }
  // Props an exercise needs, placed for figure f at ground y.
  function exProps(st, f, exn, groundY, o) {
    o = o || {};
    var base = EX[exn] ? (EX[exn].base || exn) : exn, s = f.scale, out = [];
    if (base === "pullup" || base === "hang") {
      var w0 = f.world("wristN", 0), w1 = f.world("wristF", 0);
      out.push(prop("bar", { x: (w0.x + w1.x) / 2, y: Math.min(w0.y, w1.y) - 6 * s, w: 250 * s, th: Math.max(4, 12 * s), posts: o.posts, postH: 170 * s }));
    } else if (base === "dip") {
      var d0 = f.world("wristN", 0);
      out.push(prop("dipbars", { x: d0.x - 20 * s * f.facing0, y: d0.y + 8 * s, ground: groundY, w: 280 * s }));
    } else if (base === "tug" && !o.noRope) {
      var dir = f.facing0;
      out.push(prop("rope", { a: { fig: f, joint: "wristF" }, b: function (t) { var h = f.world("wristN", t); return { x: h.x + dir * WW, y: h.y + 20 }; }, sag: 6, extendA: 30 * s }));
    } else if (base === "lift") out.push(prop("boulder", { fig: f, r: 74 }));
    else if (base === "curl") out.push(prop("dumbbell", { fig: f }));
    return out;
  }
  function titleTop(p, o) {
    o = o || {};
    var sa = safe();
    if (p.title) { var tt = thumbText(p.title, o.at != null ? o.at : T0, { pos: o.pos || "top", size: o.size || "lg", kicker: p.kicker, maxWidth: o.maxWidth, x: o.x, anchor: o.anchor, maxLines: o.maxLines }); return { y: tt.box.y1 + u(o.gap != null ? o.gap : 18), t: tt }; }
    if (p.kicker) { var kk = tagBox(String(p.kicker).toUpperCase(), o.at != null ? o.at : T0, { x: o.x != null ? o.x : sa.cx, y: sa.y0, anchor: o.anchor || "middle", red: true, px: u(PORT ? 40 : 36), rot: -3 }); return { y: kk.box.y1 + u(16), t: kk }; }
    return { y: sa.y0, t: null };
  }
  function toWY(px) { return px / K; }
  function shiftFit(fit, dx) { fit.x += dx; fit.left += dx; fit.right += dx; return fit; }

  // ---------------- exercise-demo ----------------
  TPL["exercise-demo"] = function (root, p) {
    var st = begin(root, p), sa = safe(), sw = safeW();
    var who = charOf(p.character, "rook"), exn = exName(p.exercise) || "pushup", ex = EX[exn];
    var mus = p.muscle ? partName(p.muscle) : ex.muscle;
    var facing = p.facing === "left" ? "left" : "right", fsg = facing === "left" ? -1 : 1;
    var kt = wordTime(p.keyword, p.label, 0.45);
    var tt = titleTop(p);
    var top = toWY(tt.y) + 6, bottom = sw.y1;
    var lb = loopBounds(who, null, exn), aspect = (lb[3] - lb[1]) / (lb[2] - lb[0]);
    var side = (BACK_PARTS.indexOf(mus) >= 0 ? -1 : 1) * fsg;
    var showReps = p.reps != null ? !!p.reps : ex.reps, sets = str(p.sets), counters = showReps || !!sets;
    var hasLabel = !!str(p.label), lpx = wu(u(PORT ? 52 : 46));
    var figBox, band = null, colW;
    var cH = PORT && counters ? wu(u(170)) : 0;
    if (!PORT) {
      colW = sw.w * (hasLabel || counters ? 0.25 : 0.1);
      figBox = box(sw.x0 + colW, top, sw.x1 - colW, bottom - 10);
    } else if (aspect > 1.05) {
      colW = hasLabel ? sw.w * 0.38 : 0;
      figBox = side > 0 ? box(sw.x0, top, sw.x1 - colW, bottom - cH - 10) : box(sw.x0 + colW, top, sw.x1, bottom - cH - 10);
    } else {
      var bh = hasLabel ? wu(u(170)) : 0;
      band = box(sw.x0, top, sw.x1, top + bh);
      figBox = box(sw.x0, top + bh, sw.x1, bottom - cH - 10);
    }
    var fit = fitFigure(who, exn, figBox, { facing: facing, maxScale: PORT ? 1.0 : 1.05 });
    var fig = addFig(st, who, fit, { facing: facing, expression: str(p.expression) || "focus" });
    fig.exercise(exn, 0, { period: p.period != null ? clamp(num(p.period, ex.period), 1, 4) : ex.period });
    floor(fit.x + (lb[0] + lb[2]) / 2 * fit.scale * fsg, fit.y, Math.max(fit.w * 1.35, 300), { shadowW: fit.w * 0.7 });
    exProps(st, fig, exn, fit.y);
    if (mus !== "none") fig.highlight(mus, kt);
    fig.expression("strain", kt).shake(kt, 0.4, 3).sweat(Math.min(D * 0.35, kt + 0.6), D);
    if (ex.speed) speedLines(0, D, { dir: facing === "left" ? "right" : "left", clear: 0 });
    // label beside the figure, or in the band above it
    var lab = null;
    if (hasLabel) {
      var mp = musclePoint(fig, mus === "none" ? "chest" : mus, kt), lx, ly, lw, al = "middle";
      if (band) { lw = band.w * 0.9; lx = clamp(mp.x, band.x0 + lw / 2, band.x1 - lw / 2); ly = band.cy; }
      else {
        var x0 = side > 0 ? fit.right + 24 : sw.x0, x1 = side > 0 ? sw.x1 : fit.left - 24;
        if (x1 - x0 < wu(u(260))) { if (side > 0) x0 = x1 - wu(u(260)); else x1 = x0 + wu(u(260)); }
        lw = Math.min(x1 - x0, wu(u(PORT ? 400 : 460))); lx = side > 0 ? x0 : x1; al = side > 0 ? "start" : "end";
        ly = clamp(mp.y - 60, top + lpx * 1.4, bottom - (PORT ? cH : 0) - lpx * 2.6);
      }
      lab = annotate(p.label, { track: function (t) { return musclePoint(fig, mus === "none" ? "chest" : mus, t); }, lx: lx, ly: ly, width: lw, size: lpx, at: kt + 0.05, align: al, maxLines: 3 });
      st.cam.punch(kt, 1.12, mp.x, mp.y, 0.14);
      if (p.note) {
        var nb = lab.box;
        handText(p.note, al === "start" ? nb.x0 : al === "end" ? nb.x1 : nb.cx, nb.y1 + lpx * 0.9, { at: Math.max(lab.end + 0.4, Math.min(kt + 1.6, TE())), size: lpx * 0.8, width: lw, color: "red", align: al });
      }
    } else if (mus !== "none") {
      var mp2 = musclePoint(fig, mus, kt);
      st.cam.punch(kt, 1.12, mp2.x, mp2.y, 0.14);
      if (p.note) handNote(p.note, kt + 0.8, { y: sa.y1 - u(40) });
    }
    // counters
    if (counters) {
      var cx, cy, cpx = u(PORT ? 70 : 72);
      if (!PORT) {
        var ocx = side > 0 ? sa.x0 + u(20) : sa.x1 - u(20), anc = side > 0 ? "start" : "end";
        if (showReps) repCounter(0.4, { period: fig.acts[1] ? fig.acts[1].period : ex.period, start: 0, x: ocx, y: sa.y1 - u(10), anchor: anc, vAnchor: "bottom", px: cpx });
        if (sets) setsBadge(sets, 0.7, { x: ocx, y: sa.y1 - (showReps ? u(200) : u(10)), anchor: anc, vAnchor: "bottom" });
      } else {
        cy = sa.y1 - u(6);
        if (showReps && sets) { repCounter(0.4, { period: ex.period, start: 0, x: sa.x0 + u(30), y: cy, anchor: "start", vAnchor: "bottom", px: cpx }); setsBadge(sets, 0.7, { x: sa.x1 - u(30), y: cy - u(40), anchor: "end", vAnchor: "bottom" }); }
        else if (showReps) repCounter(0.4, { period: ex.period, start: 0, x: sa.cx, y: cy, vAnchor: "bottom", px: cpx });
        else setsBadge(sets, 0.7, { x: sa.cx, y: cy - u(30), vAnchor: "bottom" });
      }
    }
  };

  // ---------------- anatomy-zoom ----------------
  TPL["anatomy-zoom"] = function (root, p) {
    var st = begin(root, p), sa = safe(), sw = safeW();
    var limb = pick(["arm", "leg", "forearm"], p.limb, "arm");
    var labels = arr(p.labels).filter(function (l) { return l && str(l.text); }).slice(0, 4);
    var tt = titleTop(p);
    var notePx = u(PORT ? 46 : 42), noteH = p.note ? wrapText(p.note, { px: notePx, maxW: sa.w * 0.9, maxLines: 2 }).h + u(30) : 0;
    var top = toWY(tt.y) + 10, bottom = sw.y1 - wu(noteH);
    var lpx = wu(u(PORT ? 44 : 42));
    var rot = PORT ? 90 : 0, lim, fl;
    var lbandH = labels.length ? lpx * 3.2 : 0;
    if (!PORT) {
      var bx = box(sw.x0 + 20, top + lbandH, sw.x1 - 20, bottom - lbandH);
      fl = fitLimb(limb, bx, 0);
    } else {
      var colW = labels.length ? sw.w * 0.36 : 0;
      var bx2 = box(sw.cx - (sw.w - colW * 2) / 2, top, sw.cx + (sw.w - colW * 2) / 2, bottom - 10);
      fl = fitLimb(limb, bx2, 90);
    }
    var times = syncTimes(labels.map(function (l) { return str(l.word) || contentWords(l.text)[0] || ""; }));
    labels.forEach(function (l, i) { if (!str(l.word)) { var tl = labelTime(l.text, null, i ? times[i - 1] : 0); if (tl != null) times[i] = ct(tl); } });
    var first = times.length ? times[0] : D * 0.5;
    var rs = Math.min(0.2, first * 0.2), span = Math.max(0.5, Math.min(1.1, first - 0.3 - rs));
    lim = anatomyLimb({ limb: limb, x: fl.x, y: fl.y, scale: fl.scale, rot: rot, revealSkin: rs, revealMuscle: rs + span * 0.33, revealBone: rs + span * 0.66, revealTendon: rs + span });
    var lb = lim.bounds();
    // labels: above / below (wide) or left / right (tall) of their anchor
    var placed = [];
    var fk = p.focus && p.focus !== "none" ? pick(["muscle", "tendon", "bone", "all"], p.focus, "tendon") : null, kt = null;
    if (fk) {
      var lastT = times.length ? times[times.length - 1] : 0;
      kt = wordTime(p.keyword, null, 0.8, lastT + 0.3);
      if (kt <= lastT) kt = ct(Math.max(lastT + 0.8, D * 0.75));
    }
    labels.forEach(function (l, i) {
      var layer = pick(["muscle", "tendon", "bone", "skin"], l.layer, "muscle"), a = lim.anchor(layer), t = times[i];
      var next = i + 1 < times.length ? times[i + 1] : kt;
      lim.focus(layer, t, next);
      var lx, ly, al = "middle", wdt;
      if (!PORT) {
        var aboveSide = (LIMBS[limb].anchors[layer] || [0, -1])[1] < 0;
        wdt = Math.min(wu(u(430)), sw.w / Math.max(2, labels.length) + 80);
        lx = clamp(a.x, sw.x0 + wdt / 2, sw.x1 - wdt / 2);
        ly = aboveSide ? Math.max(top + lpx * 1.2, lb.y0 - lpx * 1.3) : Math.min(sw.y1 - wu(noteH) - lpx * 1.0, lb.y1 + lpx * 1.3);
      } else {
        var right = (LIMBS[limb].anchors[layer] || [0, -1])[1] < 0;
        wdt = right ? sw.x1 - lb.x1 - 16 : lb.x0 - sw.x0 - 16;
        wdt = Math.max(wdt, wu(u(240)));
        lx = right ? sw.x1 - wdt / 2 : sw.x0 + wdt / 2;
        ly = clamp(a.y, top + lpx * 1.6, bottom - lpx * 1.6);
      }
      // avoid stacking on an earlier label
      placed.forEach(function (q) { if (Math.abs(q.lx - lx) < (q.w + wdt) / 2 + 10 && Math.abs(q.ly - ly) < lpx * 2.4) { if (!PORT) lx = q.lx + (lx >= q.lx ? 1 : -1) * ((q.w + wdt) / 2 + 20); else ly = q.ly + (ly >= q.ly ? 1 : -1) * lpx * 2.6; } });
      if (!PORT) lx = clamp(lx, sw.x0 + wdt / 2, sw.x1 - wdt / 2); else ly = clamp(ly, top + lpx * 1.2, bottom - lpx * 1.2);
      placed.push({ lx: lx, ly: ly, w: wdt });
      annotate(l.text, { x: a.x, y: a.y, lx: lx, ly: ly, width: wdt, size: lpx, at: t, maxLines: 2 });
    });
    if (fk) {
      lim.focus(fk, kt);
      var fa = lim.anchor(fk === "all" ? "muscle" : fk);
      st.cam.punch(kt, 1.18, fa.x, fa.y, 0.14);
      st.cam.shake(kt, 6, 0.3);
    }
    if (p.note) handNote(p.note, Math.min(TE(), Math.max((times.length ? times[times.length - 1] : 1) + 0.8, D * 0.7)), { y: sa.y1 - noteH / 2, size: notePx, width: sa.w * 0.9 });
  };

  // ---------------- lean-vs-big ----------------
  function fitPair(whoA, exA, whoB, exB, bA, bB, o) {
    o = o || {};
    var fA = fitFigure(whoA, exA, bA, { facing: o.facingA, maxScale: o.maxScale || 1 }), fB = fitFigure(whoB, exB, bB, { facing: o.facingB, maxScale: o.maxScale || 1, build: o.buildB });
    var s = Math.min(fA.scale, fB.scale);
    fA = fitFigure(whoA, exA, bA, { facing: o.facingA, maxScale: s }); fB = fitFigure(whoB, exB, bB, { facing: o.facingB, maxScale: s, build: o.buildB });
    var gy = Math.max(fA.y, fB.y);
    if (!o.keepY) { fA.y = gy; fB.y = gy; }
    return [fA, fB];
  }
  TPL["lean-vs-big"] = function (root, p) {
    var st = begin(root, p), sa = safe(), sw = safeW();
    var test = pick(["tug", "lift", "hang", "pushup", "sprint", "planche", "stare"], p.test, "tug"), winner = pick(["lean", "big", "none"], p.winner, "lean");
    var kt = wordTime(p.keyword, null, 0.62);
    var tt = titleTop(p, { size: "md" });
    var lpx = wu(u(PORT ? 46 : 42)), band = (p.leanLabel || p.bigLabel) ? lpx * 2.6 : 0;
    var top = toWY(tt.y) + band + 10, bottom = sw.y1 - 10;
    var exm = { tug: "tug", lift: "lift", hang: "hang", pushup: "pushup", sprint: "sprint", planche: "planche", stare: "idle" }[test];
    var stacked = test === "sprint" || (PORT && (test === "pushup" || test === "planche"));
    var fl, fr, faceL = "right", faceR = stacked ? "right" : "left";
    if (stacked) {
      var mid = (top - band + bottom) / 2;
      var bA = box(sw.x0, top - band + lpx * 1.4 + 10, sw.x1 - (PORT ? 0 : sw.w * 0.25), mid - 14), bB = box(sw.x0, mid + band + 14, sw.x1 - (PORT ? 0 : sw.w * 0.25), bottom);
      var pr = fitPair("rook", exm, "brick", exm, bA, bB, { facingA: "right", facingB: "right", keepY: true });
      fl = pr[0]; fr = pr[1];
      var dv = svg("path", { d: "M" + P2([sw.x0 - 20, mid]) + " L" + P2([sw.x1 + 20, mid - 4]), "class": "p-s", "stroke-width": f2(wu(u(5))), fill: "none" }, st.back);
      dv.setAttribute("stroke-linecap", "round");
    } else {
      var gap = test === "tug" ? sw.w * 0.1 : sw.w * 0.06;
      var bL = box(sw.x0, top, sw.cx - gap / 2, bottom), bR = box(sw.cx + gap / 2, top, sw.x1, bottom);
      var pr2 = fitPair("rook", exm, "brick", exm, bL, bR, { facingA: "right", facingB: "left" });
      fl = pr2[0]; fr = pr2[1];
      if (test === "tug" || test === "stare") { var dx = (fr.left - fl.right) * (test === "tug" ? 0.12 : 0.25); shiftFit(fl, dx); shiftFit(fr, -dx); }
    }
    var lean = addFig(st, "rook", fl, { facing: faceL, expression: "focus" }), big = addFig(st, "brick", fr, { facing: faceR, expression: "scowl" });
    [[lean, fl], [big, fr]].forEach(function (q) { floor(q[1].x - (q[0] === big && !stacked ? 0 : 0), q[1].y, Math.max(q[1].w * 1.3, 260), { shadowW: q[1].w * 0.6 }); });
    var period = { tug: 1.3, lift: 2.6, hang: 2.8, pushup: 1.8, sprint: 0.62, planche: 1.6, stare: 3.2 }[test];
    if (test === "stare") { lean.pose("crossed", 0, 0.01); big.pose("hips", 0, 0.01); }
    else if (test === "planche") { lean.exercise("planche", 0); big.exercise("planche-bad", 0); }
    else { lean.exercise(exm, 0); big.exercise(exm, 0, { period: period * (test === "sprint" ? 1.08 : 1.15) }); }
    exProps(st, lean, exm, fl.y, { noRope: true }); exProps(st, big, exm, fr.y, { noRope: true });
    if (test === "tug") prop("rope", { a: { fig: lean, joint: "wristF" }, b: { fig: big, joint: "wristF" }, sag: 10, extendA: 34 * fl.scale, extendB: 34 * fr.scale });
    if (test === "sprint") speedLines(0, D, { dir: "left", layer: "under" });
    if (test === "stare") focusLines(0.2, D, { x: (fl.x + fr.x) / 2, y: (fl.top + fl.bottom) / 2, inner: Math.abs(fr.x - fl.x) * 0.55 });
    var leanMus = p.leanMuscle ? partName(p.leanMuscle) : "tendons";
    var tL = p.leanLabel ? wordTime(null, p.leanLabel, 0.25) : ct(D * 0.2), tB = p.bigLabel ? wordTime(null, p.bigLabel, 0.4, tL + 0.2) : ct(D * 0.35);
    if (tB < tL + 0.6) tB = ct(tL + 0.6);
    if (leanMus !== "none") lean.highlight(leanMus, Math.min(tL, kt - 0.2));
    big.sweat(D * 0.3, D);
    function labelOver(f, fit, text, at, part, sideSign) {
      if (!str(text)) return;
      var hp = f.world("head", 0), w = Math.min(wu(u(PORT ? 300 : 420)), Math.abs(fr.x - fl.x) * (stacked ? 2 : 0.95));
      var lx = stacked ? clamp(fit.right + w / 2 + 10, sw.x0 + w / 2, sw.x1 - w / 2) : clamp(fit.x, sw.x0 + w / 2, sw.x1 - w / 2);
      var ly = stacked ? clamp(fit.top + lpx, fit.top, fit.bottom) : Math.max(toWY(tt.y) + lpx * 1.2, fit.top - lpx * 1.1);
      if (stacked && lx + w / 2 > sw.x1) { lx = sw.x1 - w / 2; }
      annotate(text, { track: function (t) { return musclePoint(f, part, t); }, lx: lx, ly: ly, width: w, size: lpx, at: at, maxLines: 2, bend: 0.25 * sideSign });
    }
    labelOver(lean, fl, p.leanLabel, tL, leanMus === "none" ? "chest" : leanMus, 1);
    labelOver(big, fr, p.bigLabel, tB, "chest", -1);
    // the outcome
    var win = winner === "big" ? big : winner === "lean" ? lean : null, lose = winner === "big" ? lean : winner === "lean" ? big : null;
    var mx = (fl.x + fr.x) / 2, my = (Math.min(fl.top, fr.top) + Math.max(fl.bottom, fr.bottom)) / 2;
    if (lose) {
      var dir = lose === big ? -1 : 1; // direction toward the winner on screen
      if (test === "tug") {
        var gapW = Math.max(0, fr.left - fl.right);
        lose.pose("tug-lose", kt, 0.22).moveTo(lose.x + (stacked ? 0 : dir * Math.min(70 * lose.scale, gapW * 0.35)), lose.y, kt, 0.45);
        win.pose("tug-b", kt, 0.25);
        var hw = win.world("wristN", kt + 0.6), hlo = lose.world("wristN", kt + 0.6), wd = win.x < lose.x ? -1 : 1;
        var hx = (hw.x + hlo.x) / 2, half = Math.max(70, Math.abs(hw.x - hlo.x) * 0.4), ay = Math.max(hw.y, hlo.y) + 50 * fl.scale;
        forceArrow(hx - wd * half, ay, hx + wd * half, ay, { at: kt + 0.05, label: p.forceLabel });
      } else if (test === "lift") { lose.pose("kneel", kt, 0.3); win.pose("lift-b", kt, 0.3); }
      else if (test === "hang") { lose.pose("kneel", kt, 0.25); }
      else if (test === "pushup") { lose.pose("pushup-down-bad", kt, 0.3); }
      else if (test === "sprint") { win.moveTo(win.x + 110 * win.scale, null, kt - 0.2, 0.6); lose.pose("fall", kt, 0.25); }
      else if (test === "planche") { lose.pose("pushup-down-bad", kt, 0.3); }
      else if (test === "stare") { lose.pose("slouch", kt, 0.3); win.pose("hips", kt, 0.3); }
      lose.expression("shock", kt).sweat(kt, D).shake(kt, 0.5, 6);
      win.expression("smirk", kt);
      if (win === lean && leanMus !== "none") win.pulse(kt, 1.2);
      if (win === big) big.highlight("full", kt);
    }
    impact(kt, { x: mx, y: my, shake: 14, size: 0.15, life: 0.28 });
    if (!lose) st.cam.punch(kt, 1.1, mx, my);
  };

  // ---------------- transformation ----------------
  TPL["transformation"] = function (root, p) {
    var st = begin(root, p), sa = safe(), sw = safeW();
    var who = charOf(p.character, "rook"), weeks = clamp(Math.round(num(p.weeks, 12)), 1, 104);
    var kt = wordTime(p.keyword, null, 0.62);
    if (kt < 1.2) kt = ct(Math.max(1.2, D * 0.5));
    var tt = titleTop(p);
    var tagPx = u(PORT ? 42 : 40), tagH = tagPx * 1.4 + u(30);
    var top = toWY(tt.y) + 10, bottom = sw.y1 - wu(tagH);
    var cnt = PORT ? wu(u(170)) : 0;
    var aPose = pick(["flex", "hips", "stand", "point", "cheer"], p.afterPose, "flex");
    var bL, bR;
    if (!PORT) { bL = box(sw.x0 + sw.w * 0.04, top, sw.x0 + sw.w * 0.36, bottom); bR = box(sw.x1 - sw.w * 0.36, top, sw.x1 - sw.w * 0.04, bottom); }
    else { bL = box(sw.x0, top + cnt, sw.cx - 8, bottom); bR = box(sw.cx + 8, top + cnt, sw.x1, bottom); }
    var fb = fitFigure(who, "slouch", bL, { build: "soft", maxScale: 0.95, facing: "right" });
    var fa = fitFigure(who, aPose === "flex" ? "flex" : aPose, bR, { maxScale: 0.95, facing: "left" });
    var s = Math.min(fb.scale, fa.scale);
    fb = fitFigure(who, "slouch", bL, { build: "soft", maxScale: s, facing: "right" }); fa = fitFigure(who, aPose === "flex" ? "flex" : aPose, bR, { maxScale: s, facing: "left" });
    var gy = Math.max(fb.y, fa.y); fb.y = gy; fa.y = gy;
    var before = addFig(st, who, fb, { build: "soft", pose: "slouch", expression: "tired", facing: "right" });
    before.exercise("idle-bad", 0);
    var after = addFig(st, who, fa, { facing: "left", expression: "proud", pose: aPose === "flex" ? "flex" : aPose });
    if (aPose === "flex") after.exercise("flex", 0);
    floor(fb.x, gy, fb.w * 1.5, { shadowW: fb.w * 0.8 });
    var afl = floor(fa.x, gy, fa.w * 1.5, { shadowW: fa.w * 0.8 });
    var sp = splash(kt - 0.26, { x: fa.x, y: (fa.top + fa.bottom) / 2, dur: 0.62 });
    st.on(function (t) { show(afl.g, t >= sp.covered); });
    after.hide(0).show(sp.covered);
    var am = p.afterMuscle ? partName(p.afterMuscle) : "full";
    if (am !== "none") after.highlight(am, sp.covered + 0.05, { pulse: 1.3 });
    st.cam.shake(sp.covered, 12, 0.4);
    // counter between them
    var cx = PORT ? sa.cx : (fb.right + fa.left) / 2 * K, cy = PORT ? (top + cnt * 0.1) * K : ((fb.top + fb.bottom) / 2) * K;
    weekCounter(0.5, kt, { start: 0, end: weeks, label: p.weeksLabel || "WEEK", x: cx, y: cy, vAnchor: PORT ? "top" : "middle", px: u(PORT ? 74 : 92) });
    if (!PORT) svg("path", { d: "M" + P2([cx / K - 90, cy / K + 110]) + " L" + P2([cx / K + 70, cy / K + 108]) + " M" + P2([cx / K + 50, cy / K + 92]) + " L" + P2([cx / K + 74, cy / K + 108]) + " L" + P2([cx / K + 50, cy / K + 124]), "class": "r-s", fill: "none", "stroke-width": f2(wu(u(6))), "stroke-linecap": "round", "stroke-linejoin": "round" }, st.back);
    var by = gy * K + u(26);
    tagBox(str(p.beforeLabel || "BEFORE").toUpperCase(), 0.35, { x: fb.x * K, y: by, px: tagPx, rot: -3 });
    tagBox(str(p.afterLabel || "AFTER").toUpperCase(), sp.covered + 0.1, { x: fa.x * K, y: by, px: tagPx, red: true, rot: 3 });
    if (p.note) {
      var tn = wordTime(null, p.note, 0.2);
      var bp = musclePoint(before, "abs", 0);
      var nw = PORT ? sw.w * 0.5 : Math.min(wu(u(360)), (fa.left - fb.right) * 0.9);
      var nx = PORT ? clamp(fb.right + 10 + nw / 2, sw.x0 + nw / 2, sw.x1 - nw / 2) : (fb.right + fa.left) / 2;
      var ny = PORT ? fb.top + 30 : fb.bottom - 80;
      if (!PORT) ny = clamp((fb.bottom + gy) / 2 - 60, top + 60, bottom - 40);
      annotate(p.note, { x: bp.x, y: bp.y, lx: nx, ly: ny, width: nw, size: wu(u(PORT ? 40 : 40)), at: Math.min(tn, kt - 0.8), until: kt - 0.3, maxLines: 2 });
    }
  };

  // ---------------- science-stat ----------------
  TPL["science-stat"] = function (root, p) {
    var st = begin(root, p), sa = safe(), sw = safeW();
    var kt = wordTime(p.keyword, null, 0.45);
    var tt = titleTop(p);
    var diagram = pick(["tendon", "muscle", "bone", "figure", "none"], p.diagram, "tendon");
    var label = str(p.label), sub = str(p.sub);
    var numPx = u(PORT ? 230 : 250);
    var colX0, colW, dBox;
    var topPx = tt.y + u(10);
    if (!PORT && diagram !== "none") {
      colW = sa.w * 0.44; colX0 = sa.x0;
      dBox = box(sw.x0 + sw.w * 0.48, toWY(topPx), sw.x1, sw.y1);
    } else { colW = sa.w; colX0 = sa.x0; }
    // text column
    var subPx = u(PORT ? 44 : 40), labPx = u(PORT ? 56 : 52);
    var labLay = label ? wrapText(label, { px: labPx, maxW: colW, maxLines: 2 }) : { h: 0 }, subLay = sub ? wrapText(sub, { px: subPx, maxW: colW, maxLines: 2 }) : { h: 0 };
    var colH = numPx * 0.95 + (label ? labLay.h + u(16) : 0) + (sub ? subLay.h + u(20) : 0);
    var colTop;
    if (!PORT && diagram !== "none") colTop = Math.max(topPx, (topPx + sa.y1) / 2 - colH / 2);
    else colTop = topPx;
    var ncx = colX0 + colW / 2;
    var bs = bigStat(num(p.value, 0), kt, { prefix: p.prefix, suffix: p.suffix, decimals: p.decimals, x: ncx, y: colTop + numPx * 0.82, px: numPx, maxW: colW, from: Math.min(0.45, kt - 0.4) });
    var y = bs.box.y1 + u(16);
    var tlab = labelTime(label, null, 0);
    if (label) { var lt = textBlock(label, { x: ncx, y: y, anchor: "middle", vAnchor: "top", px: labPx, maxW: colW, maxLines: 2, at: ct(Math.min(kt + 0.15, Math.max(0.7, tlab != null ? tlab : kt))) }); y = lt.box.y1 + u(20); }
    if (sub) { var stx = textBlock(sub, { x: ncx, y: y, anchor: "middle", vAnchor: "top", px: subLay.px || subPx, maxW: colW, maxLines: 2, at: Math.max(kt + 0.8, wordTime(null, sub, 0.75, kt)), color: null }); y = stx.box.y1 + u(16); }
    if (PORT && diagram !== "none") dBox = box(sw.x0, toWY(y) + 20, sw.x1, sw.y1);
    if (diagram === "none" || !dBox || dBox.h < 80) return;
    if (diagram === "figure") {
      var exn = exName(p.exercise) || "pushup", mus = p.muscle ? partName(p.muscle) : EX[exn].muscle;
      var fit = fitFigure("rook", exn, box(dBox.x0, dBox.y0 + 10, dBox.x1, dBox.y1 - 10), { maxScale: 1 });
      var f = addFig(st, "rook", fit, { expression: "focus" });
      f.exercise(exn, 0);
      floor(fit.x, fit.y, fit.w * 1.3, { shadowW: fit.w * 0.6 });
      exProps(st, f, exn, fit.y);
      if (mus !== "none") f.highlight(mus, kt - 0.1);
      f.sweat(kt, D);
      if (p.diagramLabel) {
        var mp = musclePoint(f, mus, kt);
        annotate(p.diagramLabel, { track: function (t) { return musclePoint(f, mus, t); }, lx: clamp(mp.x, dBox.x0 + 150, dBox.x1 - 150), ly: Math.max(dBox.y0 + 30, fit.top - 30), width: Math.min(dBox.w, wu(u(420))), size: wu(u(PORT ? 44 : 42)), at: kt + 0.45 });
      }
      return;
    }
    var limb = diagram === "tendon" ? "leg" : diagram === "muscle" ? "arm" : "leg";
    var lpx = wu(u(PORT ? 44 : 42)), vert = dBox.h > dBox.w * 1.15, lband = p.diagramLabel && !vert ? lpx * 2.4 : 0;
    var fbx = vert ? box(dBox.x0 + dBox.w * 0.36, dBox.y0 + 10, dBox.x1 - 10, dBox.y1 - 10) : box(dBox.x0 + 10, dBox.y0 + lband, dBox.x1 - 10, dBox.y1 - 10);
    var fl = fitLimb(limb, fbx, vert ? 90 : 0);
    var lim = anatomyLimb({ limb: limb, x: fl.x, y: fl.y, scale: fl.scale, rot: vert ? 90 : 0, revealSkin: 0.25, revealMuscle: 0.55, revealBone: 0.85, revealTendon: 1.1 });
    lim.focus(diagram, kt - 0.05);
    var an = lim.anchor(diagram);
    if (p.diagramLabel) {
      var lb = lim.bounds(), lw;
      if (vert) { lw = Math.max(lb.x0 - dBox.x0 - 20, wu(u(220))); annotate(p.diagramLabel, { x: an.x, y: an.y, lx: dBox.x0 + lw / 2, ly: clamp(an.y - lpx * 2.2, dBox.y0 + lpx, dBox.y1 - lpx), width: lw, size: lpx, at: kt + 0.45 }); }
      else { lw = Math.min(dBox.w * 0.8, wu(u(440))); annotate(p.diagramLabel, { x: an.x, y: an.y, lx: clamp(an.x, dBox.x0 + lw / 2, dBox.x1 - lw / 2), ly: lb.y0 - lpx * 1.1, width: lw, size: lpx, at: kt + 0.45 }); }
    }
    st.cam.punch(kt, 1.08, an.x, an.y);
  };

  // ---------------- routine-list ----------------
  TPL["routine-list"] = function (root, p) {
    var st = begin(root, p), sa = safe(), sw = safeW();
    var who = charOf(p.character, "rook");
    var items = arr(p.items).filter(function (it) { return it && (it.exercise || it.name); }).slice(0, 5);
    if (!items.length) items = [{ exercise: "pushup", name: "Push-ups", sets: 3, reps: 10 }];
    var hero = !PORT && !SQ;
    var listW = hero ? sw.w * 0.58 : sw.w;
    var tt = titleTop(p, { pos: hero ? "top-left" : "top", maxWidth: hero ? listW * K : null, size: "md" });
    var notePx = u(PORT ? 44 : 40), noteH = p.note ? notePx * 2.4 : 0;
    var top = toWY(tt.y) + 6, bottom = sw.y1 - wu(noteH);
    var n = items.length, rowH = Math.min((bottom - top) / n, PORT ? 150 : 190);
    var listTop = top + ((bottom - top) - rowH * n) / 2;
    var times = syncTimes(items.map(function (it) { return str(it.word) || contentWords(it.name)[0] || str(it.exercise); }));
    var npx = wu(u(PORT ? 50 : 48)), spx = wu(u(PORT ? 54 : 52));
    var wideRow = items.some(function (it) { return ["pushup", "plank", "planche", "sprint"].indexOf(exName(it.exercise) || "pushup") >= 0; });
    var colFW = rowH * (wideRow ? 1.7 : 1.0);
    items.forEach(function (it, i) {
      var exn = exName(it.exercise) || "pushup", ex = EX[exn], t = times[i], y0 = listTop + rowH * i, cy = y0 + rowH / 2;
      var tickX = sw.x0 + rowH * 0.22;
      var fbx = box(tickX + rowH * 0.3, y0 + rowH * 0.1, tickX + rowH * 0.3 + colFW, y0 + rowH * 0.92);
      var fit = fitFigure(who, exn, fbx, { maxScale: 0.6 });
      var f = addFig(st, who, fit, { expression: "focus", lod: 1 });
      f.exercise(exn, 0, { period: ex.period });
      f.hide(0).show(t - 0.15);
      if (ex.muscle !== "none") f.highlight(ex.muscle, t);
      var props = exProps(st, f, exn, fit.y, { posts: false, noRope: true });
      props.forEach(function (pp) { if (pp && pp.g) { var gg = pp.g; st.on(function (tt2) { show(gg, tt2 >= t - 0.15); }); } });
      mark("check", t, { x: tickX, y: cy, size: rowH * 0.42, world: true });
      var tx = fbx.x1 + rowH * 0.18;
      var setsTxt = (it.sets != null ? clamp(Math.round(num(it.sets, 3)), 1, 10) + " " + MULT + " " : "") + (it.reps != null ? clamp(Math.round(num(it.reps, 10)), 1, 120) + str(it.unit) : "");
      var sw2 = setsTxt ? measure(setsTxt, spx * K, IMPACT, "400") / K : 0;
      var listRight = sw.x0 + listW;
      var nmW = Math.max(80, listRight - tx - sw2 - 30);
      textBlock(str(it.name) || exn, { world: true, x: tx, y: cy, anchor: "start", vAnchor: "middle", px: npx, maxW: nmW, maxLines: 2, at: Math.min(0.3 + i * 0.12, t - 0.3), until: t, color: "soft", reveal: "pop" });
      textBlock(str(it.name) || exn, { world: true, x: tx, y: cy, anchor: "start", vAnchor: "middle", px: npx, maxW: nmW, maxLines: 2, at: t + 0.05 });
      if (setsTxt) textBlock(setsTxt, { world: true, x: listRight, y: cy, anchor: "end", vAnchor: "middle", px: spx, maxW: sw2 + 10, maxLines: 1, font: IMPACT, weight: "400", color: "red", at: t + 0.2, reveal: "pop" });
      if (i < n - 1) { var dvd = svg("path", { d: "M" + P2([sw.x0 + 10, y0 + rowH]) + " Q" + P2([sw.x0 + listW * 0.5, y0 + rowH + 3]) + " " + P2([listRight, y0 + rowH - 1]), "class": "p-s", "stroke-width": f2(wu(u(2))), fill: "none", opacity: 0.5 }, st.back); st.on(function (tt3) { show(dvd, tt3 >= Math.min(0.3 + i * 0.12, t)); }); }
    });
    if (hero) {
      var hb = box(sw.x0 + listW + sw.w * 0.05, top, sw.x1, sw.y1 - 10);
      var heroFits = items.map(function (it) { var exn = exName(it.exercise) || "pushup"; return fitFigure(who, exn, hb, { maxScale: 0.95, alignBottom: true }); });
      items.forEach(function (it, i) {
        var exn = exName(it.exercise) || "pushup", fit = heroFits[i], base = EX[exn].base || exn;
        var from = i === 0 ? 0 : times[i] - 0.1, to = i + 1 < n ? times[i + 1] - 0.1 : 1e9;
        if (base !== "pullup" && base !== "hang" && base !== "dip") { var hfl = floor(fit.x, fit.y, Math.max(fit.w * 1.3, hb.w * 0.6), { shadowW: fit.w * 0.6 }); st.on(function (t) { show(hfl.g, t >= from && t < to); }); }
        var f = addFig(st, who, fit, { expression: "focus" });
        f.exercise(exn, 0).hide(0).show(from);
        if (to < 1e9) f.hide(to);
        var mu = EX[exn].muscle;
        if (mu !== "none") f.highlight(mu, Math.max(from, times[i] - 0.05));
        exProps(st, f, exn, fit.y, { noRope: true }).forEach(function (pp) { if (pp && pp.g) { var gg = pp.g; st.on(function (t) { show(gg, t >= from && t < to); }); } });
        if (i > 0) st.cam.shake(from, 4, 0.2);
      });
    }
    if (p.note) handNote(p.note, Math.max(times[n - 1] + 0.9, D * 0.7), { y: sa.y1 - u(PORT ? 30 : 26), size: notePx, width: sa.w * 0.9 });
  };

  // ---------------- myth-vs-fact ----------------
  TPL["myth-vs-fact"] = function (root, p) {
    var st = begin(root, p), sa = safe(), sw = safeW();
    var myth = str(p.myth) || "Myth", fact = str(p.fact) || "Fact";
    var exn = exName(p.exercise) || "pullup", mus = p.muscle ? partName(p.muscle) : EX[exn].muscle, who = charOf(p.character, "rook");
    var tm = wordTime(p.mythWord, myth, 0.3), tf2 = wordTime(p.factWord, fact, 0.62, tm + 0.4);
    if (tf2 < tm + 0.8) tf2 = ct(tm + 0.8);
    var titleH = p.title ? u(PORT ? 80 : 70) : 0;
    var panels;
    var bot = sw.y1 - wu(titleH);
    if (!PORT) panels = [box(sw.x0, sw.y0, sw.cx - 24, bot), box(sw.cx + 24, sw.y0, sw.x1, bot)];
    else panels = [box(sw.x0, sw.y0, sw.x1, (sw.y0 + bot) / 2 - 14), box(sw.x0, (sw.y0 + bot) / 2 + 14, sw.x1, bot)];
    var dv = PORT ? "M" + P2([sw.x0 - 30, (sw.y0 + bot) / 2]) + " L" + P2([sw.x1 + 30, (sw.y0 + bot) / 2 - 5]) : "M" + P2([sw.cx, sw.y0 - 20]) + " L" + P2([sw.cx + 6, bot + 20]);
    svg("path", { d: dv, "class": "p-s", "stroke-width": f2(wu(u(6))), fill: "none", "stroke-linecap": "round" }, st.back);
    var tpx = u(PORT ? 40 : 40), txtPx = wu(u(PORT ? 50 : 54));
    function panelText(pb, text, kind, at) {
      var tg = tagBox(kind, at, { x: pb.x0 * K, y: pb.y0 * K, anchor: "start", px: tpx, red: kind === "FACT", rot: kind === "FACT" ? 2 : -3 });
      var y0 = tg.box.y1 / K + 12;
      var tb = textBlock(text, { world: true, x: pb.x0, y: y0, anchor: "start", vAnchor: "top", px: txtPx, maxW: pb.w, maxLines: PORT ? 2 : 3, at: at + 0.15 });
      tb.tag = tg;
      return tb;
    }
    // myth side: the big rival flexing
    var mt = panelText(panels[0], myth, "MYTH", 0.25);
    var mb = box(panels[0].x0, mt.box.y1 + 16, panels[0].x1, panels[0].y1);
    var mfit = fitFigure("brick", "flex", mb, { maxScale: 0.95 });
    var brick = addFig(st, "brick", mfit, { expression: "smirk", facing: "right" });
    brick.exercise("flex", 0);
    floor(mfit.x, mfit.y, mfit.w * 1.4, { shadowW: mfit.w * 0.7 });
    brick.expression("shock", tm + 0.1);
    for (var li = 0; li < mt.lines; li++) {
      var lw2 = mt.lineW && mt.lineW[li] ? mt.lineW[li] : mt.box.w;
      mark("strike", tm + li * 0.08, { x: mt.box.x0 + lw2 / 2, y: mt.box.y0 + mt.px * 1.12 * (li + 0.58), size: txtPx * 1.2, w: lw2 * 1.04, world: true });
    }
    mark("cross", tm + 0.12, { x: Math.min(mt.box.x1 + txtPx * 1.1, panels[0].x1 - txtPx * 0.9), y: mt.box.y0 + txtPx * 0.6, size: txtPx * 1.7, world: true });
    // fact side, revealed by a splash
    var pb = panels[1];
    textBlock("?", { world: true, x: pb.cx, y: pb.cy, anchor: "middle", vAnchor: "middle", px: Math.min(pb.h * 0.6, 300), maxW: pb.w, maxLines: 1, font: IMPACT, weight: "400", at: 0.3, until: tf2 - 0.3, color: "soft", reveal: "pop" });
    var sp = splash(tf2 - 0.28, { x: pb.cx, y: pb.cy, dur: 0.58 });
    var ft = panelText(pb, fact, "FACT", sp.covered);
    var fbx = box(pb.x0, ft.box.y1 + 16, pb.x1, pb.y1);
    var ffit = fitFigure(who, exn, fbx, { maxScale: 0.95 });
    var hero = addFig(st, who, ffit, { expression: "focus", facing: "right" });
    hero.exercise(exn, 0).hide(0).show(sp.covered);
    var fbase = EX[exn].base || exn;
    if (fbase !== "pullup" && fbase !== "hang" && fbase !== "dip") { var fl = floor(ffit.x, ffit.y, ffit.w * 1.3, { shadowW: ffit.w * 0.6 }); fl.g.style.display = "none"; st.on(function (t) { show(fl.g, t >= sp.covered); }); }
    exProps(st, hero, exn, ffit.y, { noRope: true, posts: false }).forEach(function (pp) { if (pp && pp.g) { var gg = pp.g; st.on(function (t) { show(gg, t >= sp.covered); }); } });
    if (mus !== "none") hero.highlight(mus, sp.covered + 0.1, { pulse: 1.2 });
    var tgb = ft.tag.box;
    mark("check", tf2 + 0.35, { x: tgb.x1 + tgb.h * 0.9, y: (tgb.y0 + tgb.y1) / 2 + tgb.h * 0.12, size: tgb.h * 1.3 });
    if (p.title) thumbText(p.title, 0.4, { pos: "bottom", size: "sm" });
  };

  // ---------------- form-check ----------------
  TPL["form-check"] = function (root, p) {
    var st = begin(root, p), sa = safe(), sw = safeW();
    var exn = exName(p.exercise) || "pushup";
    if (EX[exn].bad) exn = EX[exn].base;
    var who = charOf(p.character, "rook");
    var kt = wordTime(p.keyword, p.errorNote, 0.4);
    var tt = titleTop(p, { size: "md" });
    var tagPx = u(PORT ? 40 : 40), tagH = tagPx * 1.5 + u(26);
    var top = toWY(tt.y) + 10, bottom = sw.y1 - wu(tagH);
    var lb = loopBounds(who, null, exn), wideFig = (lb[2] - lb[0]) > (lb[3] - lb[1]) * 1.15;
    var stacked = PORT && wideFig, bA, bB, mid;
    var lpx = wu(u(PORT ? 44 : 42)), band = lpx * 2.4;
    if (stacked) { mid = (top + sw.y1) / 2; bA = box(sw.x0, top + band, sw.x1, mid - wu(tagH) - 6); bB = box(sw.x0, mid + 18, sw.x1, bottom); }
    else { bA = box(sw.x0, top + band, sw.cx - 20, bottom); bB = box(sw.cx + 20, top + band, sw.x1, bottom); }
    var pr = fitPair(who, exn + "-bad", who, exn, bA, bB, { facingA: "right", facingB: "right", keepY: stacked });
    var fa = pr[0], fb = pr[1];
    var bad = addFig(st, who, fa, { expression: "tired" }), good = addFig(st, who, fb, { expression: "focus" });
    bad.exercise(exn + "-bad", 0); good.exercise(exn, 0);
    floor(fa.x, fa.y, fa.w * 1.3, { shadowW: fa.w * 0.6 }); floor(fb.x, fb.y, fb.w * 1.3, { shadowW: fb.w * 0.6 });
    exProps(st, bad, exn + "-bad", fa.y, { noRope: true }); exProps(st, good, exn, fb.y, { noRope: true });
    var tgA = tagBox(str(p.badLabel || "WRONG").toUpperCase(), 0.4, { x: fa.x * K + (lb[0] + lb[2]) / 2 * fa.scale * K, y: fa.y * K + u(18), px: tagPx, rot: -3 });
    var tgB = tagBox(str(p.goodLabel || "CORRECT").toUpperCase(), 0.55, { x: fb.x * K + (lb[0] + lb[2]) / 2 * fb.scale * K, y: fb.y * K + u(18), px: tagPx, rot: 2 });
    // the mistake
    var ej = ERR_JOINT[exn] || "hip";
    var errPt = function (t) { if (ej === "back") return musclePoint(bad, "back", t); return bad.world(ej, t); };
    var note = str(p.errorNote) || ERR_NOTE[exn] || "wrong";
    var ep = errPt(kt), nw = Math.min(bA.w * 0.9, wu(u(PORT ? 420 : 400)));
    var nly = Math.max(top + lpx * 1.1, fa.top - lpx * 0.9);
    annotate(note, { track: errPt, lx: clamp(ep.x, bA.x0 + nw / 2, bA.x1 - nw / 2), ly: nly, width: nw, size: lpx, at: kt, color: "red", maxLines: 2 });
    var ms = tgA.box.h * 1.35;
    mark("cross", kt + 0.1, { x: tgA.box.x1 + ms * 0.75, y: (tgA.box.y0 + tgA.box.y1) / 2, size: ms });
    bad.expression("shock", kt).sweat(kt, D);
    st.cam.punch(kt, 1.1, ep.x, ep.y);
    var tg = labelTime(p.goodLabel || "", null, kt + 0.3);
    var tk = ct(tg != null && tg > kt + 0.6 ? tg : Math.max(kt + 1.3, D * 0.72));
    mark("check", tk, { x: tgB.box.x1 + ms * 0.75, y: (tgB.box.y0 + tgB.box.y1) / 2, size: ms });
    var gm = EX[exn].muscle;
    if (gm !== "none") good.highlight(gm, tk);
    good.expression("smirk", tk);
  };

  // ---------------- effort-moment ----------------
  TPL["effort-moment"] = function (root, p) {
    var st = begin(root, p.bg ? p : Object.assign({}, p, { bg: "black" }));
    var sa = safe(), sw = safeW();
    var who = charOf(p.character, "rook"), exn = exName(p.exercise);
    var poseN = exn ? HARD_POSE[EX[exn].base || exn] || "strain" : { strain: "strain", flex: "flex", cheer: "cheer", pullup: "pullup-up", planche: "planche", lift: "lift-b" }[str(p.pose)] || "strain";
    var mus = p.muscle ? partName(p.muscle) : exn ? EX[exn].muscle : "full";
    var kt = wordTime(p.word, p.text, 0.65);
    if (kt < 1.0) kt = ct(Math.max(1.0, D * 0.55));
    var textPx = u(PORT ? 168 : 196);
    var tLay = wrapText(str(p.text) || "GO", { font: IMPACT, weight: "400", px: textPx, maxW: sa.w * 0.9, maxLines: 2, lh: 1 });
    var subH = p.sub ? u(PORT ? 60 : 56) : 0;
    var textH = tLay.h + subH + u(30);
    var annH = p.annotation && PORT ? wu(u(130)) : 0;
    var fbx = box(sw.x0 + (PORT ? 0 : sw.w * 0.12), sw.y0 + wu(textH), sw.x1 - (PORT ? 0 : sw.w * 0.12), sw.y1 - annH - 10);
    var fit = fitFigure(who, poseN, fbx, { maxScale: 1.25 });
    var f = addFig(st, who, fit, { expression: "strain", pose: poseN });
    var hs = exn ? { pullup: "bar", hang: "bar" }[EX[exn].base || exn] : poseN === "pullup-up" ? "bar" : null;
    if (hs || poseN === "lift-b" || poseN === "dip-down") exProps(st, f, poseN === "lift-b" ? "lift" : poseN === "dip-down" ? "dip" : "hang", fit.y, { noRope: true });
    if (poseN === "tug-b") exProps(st, f, "tug", fit.y);
    floor(fit.x, fit.y, fit.w * 1.4, { shadowW: fit.w * 0.7 });
    var cx = (fit.left + fit.right) / 2, cy = (fit.top + fit.bottom) / 2;
    focusLines(0.05, D, { x: cx, y: cy, inner: Math.max(fit.w, fit.h) * 0.62 });
    f.sweat(0.2, D).shake(0, kt, 1.5).shake(kt - 0.8, 0.8, 3.5).shake(kt, 0.6, 7);
    if (mus !== "none") f.highlight(mus, Math.min(0.6, kt - 0.3), { pulse: 0.5 }).pulse(kt, 1.6);
    f.expression("shout", kt);
    impact(kt, { x: cx, y: cy, shake: 18 });
    var tc0 = f.world("chest", kt);
    splatter(st.back, tc0.x, tc0.y, Math.min(Math.max(fit.w, fit.h) * 0.2, 150), 5, "red").style.display = "none";
    var spl = st.back.lastChild;
    st.on(function (t) { show(spl, t >= kt); });
    var mp = musclePoint(f, mus === "none" ? "chest" : mus, kt);
    st.cam.punch(kt + 0.02, 1.2, mp.x, mp.y, 0.12);
    thumbText(str(p.text) || "GO", kt + 0.05, { pos: "top", size: "xxl", sub: p.sub, maxLines: 2 });
    if (p.annotation) {
      var aw = PORT ? sw.w * 0.8 : Math.min(wu(u(420)), sw.w * 0.3);
      var ax = PORT ? sw.cx : (mp.x > cx ? Math.min(sw.x1 - aw / 2, fit.right + aw / 2 - 40) : Math.max(sw.x0 + aw / 2, fit.left - aw / 2 + 40));
      var ay = PORT ? sw.y1 - annH / 2 : clamp(mp.y + 120, fbx.y0 + 40, sw.y1 - 40);
      annotate(p.annotation, { track: function (t) { return musclePoint(f, mus === "none" ? "chest" : mus, t); }, lx: ax, ly: ay, width: aw, size: wu(u(PORT ? 48 : 44)), at: Math.min(TE(), kt + 0.7) });
    }
  };

  // ---------------- title-card ----------------
  TPL["title-card"] = function (root, p) {
    var st = begin(root, p), sa = safe(), sw = safeW();
    var who = charOf(p.character, "rook"), pose = pick(["hips", "flex", "point", "crossed", "cheer", "stand"], p.pose, "hips");
    var sp = splash(0.02, { x: sw.cx, y: sw.cy, dur: 0.56, seed: 11 });
    var tc = sp.covered;
    var title = str(p.title) || "Part 1";
    var fbx, tt;
    if (!PORT) {
      tt = thumbText(title, tc + 0.04, { pos: "left", size: "xl", kicker: p.kicker, sub: p.sub, maxWidth: sa.w * 0.56, maxLines: 3 });
      fbx = box(tt.box.x1 / K + 60, sw.y0, sw.x1, sw.y1);
      if (fbx.w < sw.w * 0.3) fbx = box(sw.x1 - sw.w * 0.34, sw.y0, sw.x1, sw.y1);
    } else {
      tt = thumbText(title, tc + 0.04, { pos: "top", size: "xl", kicker: p.kicker, sub: p.sub, maxLines: 3 });
      fbx = box(sw.x0 + sw.w * 0.1, tt.box.y1 / K + 20, sw.x1 - sw.w * 0.1, sw.y1);
    }
    var what = pose === "flex" ? "flex" : pose;
    var fit = fitFigure(who, what, fbx, { maxScale: PORT ? 1.0 : 1.3, facing: "left" });
    if (!PORT) shiftFit(fit, (fbx.x1 - fit.right) * 0.4);
    splatter(st.back, (fit.left + fit.right) / 2, (fit.top + fit.bottom) / 2 - fit.h * 0.06, Math.min(fit.w, fit.h) * 0.62, 8, "red");
    var f = addFig(st, who, fit, { facing: "left", pose: what === "flex" ? "flex" : pose, expression: "smirk" });
    if (pose === "flex") f.exercise("flex", 0);
    floor(fit.x, fit.y, fit.w * 1.4, { shadowW: fit.w * 0.7 });
    f.narrate(tc + 0.2, D);
    var mus = p.muscle ? partName(p.muscle) : "none";
    var pw = p.pulseWord ? wordTime(p.pulseWord, null, 0.6) : null;
    if (mus !== "none") f.highlight(mus, pw != null ? Math.min(pw, tc + 0.6) : tc + 0.6);
    if (pw != null) { f.pulse(pw, 1.4).shake(pw, 0.4, 5); st.cam.shake(pw, 6, 0.3); if (mus === "none") f.expression("proud", pw); }
  };

  // ---------------- progress-graph ----------------
  TPL["progress-graph"] = function (root, p) {
    var st = begin(root, p), sa = safe(), sw = safeW();
    var who = charOf(p.character, "rook");
    var series = arr(p.series).filter(function (s) { return s && arr(s.values).length; }).slice(0, 3);
    if (!series.length) series = [{ label: "", values: [1, 2, 3, 4] }];
    var n = 0;
    series.forEach(function (s) { n = Math.max(n, Math.min(12, arr(s.values).length)); });
    var tt = titleTop(p, { pos: !PORT ? "top-left" : "top", maxWidth: !PORT ? sa.w * 0.7 : null, size: "md" });
    var notePx = u(PORT ? 42 : 40), noteH = p.note ? notePx * 2.3 : 0;
    var top = toWY(tt.y) + 20, bottom = sw.y1 - wu(noteH);
    var fpx = wu(u(PORT ? 36 : 32));
    var cb, fbx;
    if (!PORT) { cb = box(sw.x0 + fpx * 1.0, top + fpx * 2.2, sw.x0 + sw.w * 0.68, bottom - fpx * 1.8); fbx = box(sw.x0 + sw.w * 0.73, top, sw.x1, bottom); }
    else { var ch = (bottom - top) * 0.62; cb = box(sw.x0 + fpx * 0.6, top + fpx * 2.2, sw.x1 - fpx * 1.2, top + ch); fbx = box(sw.x0 + sw.w * 0.2, top + ch + fpx * 2.2, sw.x1 - sw.w * 0.2, bottom); }
    var ann = obj(p.annotation), ai = clamp(Math.round(num(ann.index, n - 2)), 0, n - 1);
    var ta = ann.text ? labelTime(ann.text, ann.word, 0.5) : null;
    var t0 = 0.8, t1 = TE() - 0.8, times = [];
    for (var i = 0; i < n; i++) times.push(lerp(t0, t1, n > 1 ? i / (n - 1) : 0));
    if (ta != null && ta > t0 + 0.4) { var want = ta - 0.15; var k = (want - t0) / Math.max(0.01, times[ai] - t0); for (i = 0; i <= ai; i++) times[i] = t0 + (times[i] - t0) * k; for (i = ai + 1; i < n; i++) times[i] = Math.min(TE() - 0.3, times[ai] + (i - ai) * Math.max(0.25, (TE() - 0.3 - times[ai]) / (n - ai))); }
    var ch2 = inkChart({ x: cb.x0, y: cb.y0, w: cb.w, h: cb.h, type: p.type, series: series, xLabels: p.xLabels, yLabel: p.yLabel, max: p.max, at: 0.2 }, times);
    if (ann.text) {
      var pt2 = ch2.point(0, ai), at2 = ct(ta != null ? ta : times[ai] + 0.3);
      var aw = Math.min(cb.w * 0.55, wu(u(PORT ? 360 : 420)));
      // try spots around the point; keep the one that crosses the fewest plotted line samples
      var apx = wu(u(PORT ? 42 : 40)), alay = wrapText(ann.text, { px: apx, maxW: aw, maxLines: 2 }), ah = alay.h, aww = alay.w;
      var samples = [];
      series.forEach(function (sr, si) { for (var q = 0; q + 1 < Math.min(n, arr(sr.values).length); q++) { var a1 = ch2.point(si, q), b1 = ch2.point(si, q + 1); for (var r2 = 0; r2 <= 8; r2++) samples.push([lerp(a1.x, b1.x, r2 / 8), lerp(a1.y, b1.y, r2 / 8)]); } });
      var best = null;
      [-0.9, -0.45, 0, 0.45].forEach(function (fx) {
        [1, -1].forEach(function (sy) {
          [2.6, 4.2].forEach(function (dy) {
            var cx2 = clamp(pt2.x + fx * aww, cb.x0 + aww / 2 + 6, cb.x1 - aww / 2), cy2 = pt2.y + sy * fpx * dy;
            if (cy2 - ah / 2 < cb.y0 - fpx * 0.5 || cy2 + ah / 2 > cb.y1 - 4) return;
            var hits = 0;
            samples.forEach(function (q) { if (Math.abs(q[0] - cx2) < aww / 2 + 12 && Math.abs(q[1] - cy2) < ah / 2 + 12) hits++; });
            var sc = hits * 10 + Math.abs(fx) + dy * 0.3;
            if (!best || sc < best.sc) best = { sc: sc, x: cx2, y: cy2 };
          });
        });
      });
      var alx = best ? best.x : clamp(pt2.x - aw * 0.3, cb.x0 + aw / 2, cb.x1 - aw / 2), aly = best ? best.y : clamp(pt2.y + (pt2.y < cb.cy ? 1 : -1) * fpx * 3.4, cb.y0 + fpx, cb.y1 - fpx * 1.2);
      annotate(ann.text, { x: pt2.x, y: pt2.y, lx: alx, ly: aly, width: aw, size: wu(u(PORT ? 42 : 40)), at: at2, maxLines: 2 });
      st.cam.punch(at2, 1.06, pt2.x, pt2.y);
    }
    var fit = fitFigure(who, "cheer", fbx, { maxScale: PORT ? 0.6 : 0.9, facing: "left" });
    var f = addFig(st, who, fit, { facing: "left", pose: "hips", expression: "calm" });
    floor(fit.x, fit.y, fit.w * 1.6, { shadowW: fit.w * 0.7 });
    var tc = ct(Math.max(times[n - 1] + 0.3, D - 1.6));
    f.pose("cheer", tc, 0.3).expression("proud", tc);
    var mus = p.muscle ? partName(p.muscle) : "none";
    if (mus !== "none") f.highlight(mus, tc);
    if (p.note) handNote(p.note, Math.min(TE(), times[n - 1] + 0.2), { y: sa.y1 - noteH / 2, size: notePx, width: sa.w * 0.9 });
  };

  // ======================================================================================
  // PUBLIC API
  // ======================================================================================
  function render(id, root, props) {
    var fn = TPL[id];
    if (!fn) throw new Error("Unknown inked-body template: " + id);
    fn(root || V.root(), obj(props));
  }
  function fallback(root, narration) {
    root = root || V.root();
    while (root.firstChild) root.removeChild(root.firstChild);
    ST = null;
    var st = scene({ bg: "white" }, root), sw = safeW();
    var words = contentWords(narration || V.narration).slice(0, 3).join(" ");
    var tt = words ? thumbText(words, 0.2, { pos: "top", size: "md" }) : null;
    var top = tt ? toWY(tt.box.y1) + 20 : sw.y0;
    var fit = fitFigure("rook", "flex", box(sw.x0, top, sw.x1, sw.y1), { maxScale: 0.9 });
    var f = addFig(st, "rook", fit, { expression: "smirk" });
    f.exercise("flex", 0).highlight("arms", 0.6).narrate(0.3, D);
    floor(fit.x, fit.y, fit.w * 1.4, {});
  }
  // stage helpers documented in docs.md
  Stage.prototype.frame = function (side, kind) {
    var sw = safeW(), fr = typeof side === "number" ? clamp(side, 0, 1) : side === "left" ? (PORT ? 0.3 : 0.27) : side === "right" ? (PORT ? 0.7 : 0.73) : 0.5;
    var hk = { hero: 0.92, default: 0.72, pair: 0.64, small: 0.36, low: 0.42 }[kind] || 0.72;
    var sc = (sw.h * hk) / 660;
    if (kind === "low") sc = Math.min(sc * 2, (sw.w * (PORT ? 0.9 : 0.45)) / 560);
    return { x: sw.x0 + sw.w * fr, y: sw.y1 - 14, scale: f2(sc) };
  };
  Stage.prototype.floor = function (x, y, w, o) { return floor(x, y, w, o); };
  Stage.prototype.prop = function (kind, o) { return prop(kind, o); };
  Stage.prototype.annotate = function (text, o) { return annotate(text, o); };
  Stage.prototype.handText = function (text, x, y, o) { return handText(text, x, y, o); };
  Stage.prototype.forceArrow = function (x1, y1, x2, y2, o) { return forceArrow(x1, y1, x2, y2, o); };
  Stage.prototype.focusLines = function (a, b, o) { return focusLines(a, b, o); };
  Stage.prototype.speedLines = function (a, b, o) { return speedLines(a, b, o); };
  Stage.prototype.impact = function (at, o) { return impact(at, o); };
  Stage.prototype.splash = function (at, o) { return splash(at, o); };
  Stage.prototype.shake = function (at, amp, dur) { this.cam.shake(at, amp, dur); return this; };
  Stage.prototype.flash = function (at, dur) { return flash(at, dur); };
  Stage.prototype.splatter = function (parent, x, y, r, seed, color) { return splatter(parent, x, y, r, seed, color); };
  Stage.prototype.anatomyLimb = function (o) { return anatomyLimb(o); };
  Stage.prototype.inkChart = function (o, times) { return inkChart(o, times); };
  Stage.prototype.fit = function (character, what, bx, o) { return fitFigure(character, what, bx, o); };

  S.scene = function (o) { return scene(o, V.root()); };
  S.stage = S.scene;
  S.currentStage = function () { return ST; };
  S.figure = function (name, o) { return new Figure(stg(), name, o); };
  S.prop = prop;
  S.floor = floor;
  S.musclePoint = musclePoint;
  S.castInfo = function () { return Object.keys(CAST).map(function (k) { return { id: k, name: CAST[k].label, build: CAST[k].build, hair: CAST[k].hair, shorts: CAST[k].shorts }; }); };
  S.thumbText = thumbText;
  S.handNote = handNote;
  S.tag = tag;
  S.repCounter = repCounter;
  S.setsBadge = setsBadge;
  S.progressBar = progressBar;
  S.bigStat = bigStat;
  S.weekCounter = weekCounter;
  S.mark = mark;
  S.caption = caption;
  S.anatomyLimb = anatomyLimb;
  S.inkChart = inkChart;
  S.fitFigure = fitFigure;
  S.fitLimb = fitLimb;
  S.safe = safe;
  S.safeWorld = safeW;
  S.syncTimes = syncTimes;
  S.wordTime = function (word, label, frac) { return wordTime(word, label, frac); };
  S.measureBlock = function (text, o) { o = obj(o); var l = wrapText(text, { font: o.font === "impact" ? IMPACT : HAND, px: num(o.px, 40), maxW: num(o.maxW, 600), maxLines: num(o.maxLines, 3) }); return { w: l.w, h: l.h, px: l.px, lines: l.lines.length }; };
  S.u = u;
  S.wu = wu;
  S.K = K;
  S.poses = Object.keys(POSES);
  S.exercises = Object.keys(EX);
  S.parts = PART_NAMES.slice();
  S.expressions = EXPR_NAMES.slice();
  S.templates = Object.keys(TPL);
  S.render = render;
  S.fallback = fallback;
  S.inspect = function (t) {
    if (!ST) return [];
    var c = ST.cam.at(t), out = [];
    ST.boxes.forEach(function (fn) { try { var b = fn(t, c); if (b) out.push(b); } catch (e) {} });
    return out;
  };
  S.flush = function () { if (ST) ST.tick(V.time()); };
})();

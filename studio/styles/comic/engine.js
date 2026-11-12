/* Comic engine (style id: comic). A living motion comic.
 *
 * Architecture
 * - Build time: S.comic() makes the frame (.cb-root), a camera layer (.cb-cam) and a hidden defs SVG.
 *   Each S.page() adds one page (a div holding one W x H SVG). A page has a paper layer, one group
 *   per panel (clipped to the panel polygon, with bg and fg groups in panel px, then the ink border)
 *   and an "over" group in page px for lettering (captions, balloons, SFX, logos). Later pages sit
 *   UNDER earlier ones, so S.pageTurn() can peel the top page away. A screen-space SVG above the
 *   camera holds pinned captions and the white flash; a print overlay gives the aged finish.
 * - Every drawing call creates its DOM once and pushes a function of t into st.anims. ONE
 *   V.onFrame(frame) sets everything from t: camera (keys evaluated from precomputed start
 *   states), shake, flash, page turn clip and flap, panel reveals, characters (pose blend, IK arms,
 *   blink, breathing, talking mouth), lettering pops and word-by-word balloon text. Nothing depends
 *   on the previous frame, so seeking works in both directions.
 * - Timing: templates find their key words with kwFind/labelTime (V.find first, then a narration
 *   estimate), fill gaps with spread(), keep the last second still (endT) and land each panel on
 *   its word. Balloon words appear on their spoken times (wordTimes).
 * - Layout: the page's panel area is the platform safe area (wide 7 % margins; tall x 60..1020,
 *   y 250..1450), so the whole-page view is always safe. Camera focus fits a panel inside the safe
 *   area and never shows past the page edge. Text is measured with canvas and balanced.
 * - Characters: one rig for the whole cast (two-bone arms and legs with IK hand and foot targets,
 *   torso, head with a front face). Shapes are deliberately simple and consistent.
 * No network, no timers, no wall clock; randomness only from V.makeRand.
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
  var FONT = 'Inter, "Noto Sans", system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  var OV = 140; // paper overscan around the page (camera shake never shows an edge)

  // ------------------------- small utils -------------------------
  function u(px) { return V.s(px); }
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
    outQuad: function (x) { return 1 - (1 - x) * (1 - x); },
    outCubic: function (x) { return 1 - Math.pow(1 - x, 3); },
    inCubic: function (x) { return x * x * x; },
    inOut: function (x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; },
    inOutSine: function (x) { return -(Math.cos(PI * x) - 1) / 2; },
    outBack: function (x) { return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); },
    outExpo: function (x) { return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x); },
    inExpo: function (x) { return x <= 0 ? 0 : Math.pow(2, 10 * x - 10); },
    pop: function (x) { return x >= 1 ? 1 : x <= 0 ? 0 : 1 - Math.cos(x * PI * 2.2) * Math.exp(-5.5 * x); },
  };
  EASE.out = EASE.outCubic; EASE.inOutCubic = EASE.inOut; EASE.outQuart = function (x) { return 1 - Math.pow(1 - x, 4); };
  function ease(name) { return typeof name === "function" ? name : EASE[name] || (V.ease && V.ease[name]) || EASE.inOut; }
  function svg(tag, attrs, parent) {
    var n = doc.createElementNS(NS, tag);
    if (attrs) for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function hel(tag, cls, parent) { var n = doc.createElement(tag); if (cls) n.className = cls; if (parent) parent.appendChild(n); return n; }
  function P2(x, y) { return f2(x) + " " + f2(y); }
  function polyD(pts, close) { var s = ""; for (var i = 0; i < pts.length; i++) s += (i ? "L" : "M") + P2(pts[i][0], pts[i][1]); return s + (close === false ? "" : "Z"); }
  function ptsAttr(pts) { return pts.map(function (p) { return f2(p[0]) + "," + f2(p[1]); }).join(" "); }
  function circD(cx, cy, r) { return "M" + P2(cx - r, cy) + "a" + f2(r) + " " + f2(r) + " 0 1 0 " + f2(2 * r) + " 0a" + f2(r) + " " + f2(r) + " 0 1 0 " + f2(-2 * r) + " 0Z"; }
  function ellD(cx, cy, rx, ry) { return "M" + P2(cx - rx, cy) + "a" + f2(rx) + " " + f2(ry) + " 0 1 0 " + f2(2 * rx) + " 0a" + f2(rx) + " " + f2(ry) + " 0 1 0 " + f2(-2 * rx) + " 0Z"; }
  function rrD(x, y, w, h, r) {
    r = Math.max(0, Math.min(r || 0, w / 2, h / 2));
    return "M" + P2(x + r, y) + "H" + f2(x + w - r) + "Q" + P2(x + w, y) + " " + P2(x + w, y + r) + "V" + f2(y + h - r) + "Q" + P2(x + w, y + h) + " " + P2(x + w - r, y + h) +
      "H" + f2(x + r) + "Q" + P2(x, y + h) + " " + P2(x, y + h - r) + "V" + f2(y + r) + "Q" + P2(x, y) + " " + P2(x + r, y) + "Z";
  }
  function starPts(cx, cy, R, r, n, rot) { var p = []; for (var i = 0; i < n * 2; i++) { var a = (rot || -90) * PI / 180 + (i * PI) / n, rr = i % 2 ? r : R; p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); } return p; }
  function smoothClosed(pts) {
    var n = pts.length, d = "";
    for (var i = 0; i < n; i++) {
      var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      if (!i) d += "M" + P2(p1[0], p1[1]);
      d += "C" + P2(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6) + " " + P2(p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6) + " " + P2(p2[0], p2[1]);
    }
    return d + "Z";
  }
  function rectsHit(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
  function overlapArea(a, b) {
    var w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? w * h : 0;
  }

  // ------------------------- palette -------------------------
  var C = {
    paper: "#FBF5E6", ink: "#15110E", red: "#E23B2E", blue: "#2C6FD6", yellow: "#FFD23F", white: "#FFFFFF",
    cyan: "#3FC7E8", purple: "#7B3FB8", green: "#3FA34D", pink: "#F06EAA", orange: "#F5862E", grey: "#9AA6B2",
    sky: "#8FD3F5", dusk: "#F59A4E", night: "#1F2B5C", navy: "#141B3D", cream: "#FFF6D8", brown: "#8A5A35",
  };
  var PAL = {
    red: ["#FFB8A8", "#E23B2E", "#8E1C14"], blue: ["#B4D3FF", "#2C6FD6", "#163E86"], yellow: ["#FFF1A8", "#FFD23F", "#C98F00"],
    purple: ["#DCC2F7", "#7B3FB8", "#41186E"], green: ["#C6EDA8", "#3FA34D", "#1E5E2A"], pink: ["#FFCFE6", "#F06EAA", "#9C2A63"],
  };
  function palOf(name, def) { name = str(name).toLowerCase(); return PAL[name] || PAL[def || "red"]; }
  // SFX and logo colours: fill, side (extrusion), shine
  var SFXP = {
    fire: ["#FFD23F", "#E23B2E"], pow: ["#FFFFFF", "#E23B2E"], zap: ["#FFE45C", "#2C6FD6"], ice: ["#DDF5FF", "#2C6FD6"],
    slime: ["#A6EA5A", "#2E7D32"], pink: ["#FFB3DA", "#B0286E"], red: ["#E23B2E", "#7A1410"], gold: ["#FFC93C", "#A8660A"],
    blue: ["#DDF0FF", "#2C6FD6"], yellow: ["#FFD23F", "#15110E"], purple: ["#F0DAFF", "#6A2DB0"], green: ["#C8F48A", "#2E7D32"],
  };
  var LOGOP = { red: "fire", blue: "blue", yellow: "yellow", purple: "purple", green: "green", pink: "pink" };
  function sfxPal(name, def) { name = str(name).toLowerCase(); if (LOGOP[name] && !SFXP[name]) name = LOGOP[name]; return SFXP[name] || SFXP[def || "fire"]; }
  // Titles use the classic cover colours: red = yellow letters with a red side, and so on.
  function logoPal(name) { name = str(name).toLowerCase() || "red"; return SFXP[LOGOP[name]] || sfxPal(name, "fire"); }
  function rgbOf(c) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(c));
    if (!m) return [128, 128, 128];
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function hexOf(r) { return "#" + r.map(function (v) { var s = Math.round(clamp(v, 0, 255)).toString(16); return s.length < 2 ? "0" + s : s; }).join(""); }
  function mix(a, b, p) { var x = rgbOf(a), y = rgbOf(b); return hexOf([lerp(x[0], y[0], p), lerp(x[1], y[1], p), lerp(x[2], y[2], p)]); }
  function dark(c, p) { return mix(c, "#15110E", p == null ? 0.3 : p); }
  function light(c, p) { return mix(c, "#FFFFFF", p == null ? 0.35 : p); }
  function lum(c) { var r = rgbOf(c); return (0.299 * r[0] + 0.587 * r[1] + 0.114 * r[2]) / 255; }

  // ------------------------- text measuring and layout -------------------------
  var cvs = null;
  function fontOf(size, weight, italic) { return (italic ? "italic " : "") + (weight || 800) + " " + size.toFixed(2) + "px " + FONT; }
  function textW(txt, size, weight, italic) {
    if (!cvs) cvs = doc.createElement("canvas").getContext("2d");
    cvs.font = fontOf(size, weight, italic);
    return cvs.measureText(txt).width;
  }
  // "*word*" marks emphasis. Returns tokens [{t, em}].
  function parseEm(text, upper) {
    var toks = [], em = false;
    str(text).replace(/\s+/g, " ").split(" ").forEach(function (w) {
      if (!w) return;
      var s = w, e0 = em;
      if (s.charAt(0) === "*") { e0 = true; s = s.slice(1); em = true; }
      var close = s.length && s.charAt(s.length - 1) === "*";
      if (close) s = s.slice(0, -1);
      var m = /^(.*?)\*([^\p{L}\p{N}]*)$/u.exec(s);
      if (m) { s = m[1] + m[2]; close = true; }
      s = s.replace(/\*/g, "");
      if (upper) s = s.toUpperCase();
      if (s) toks.push({ t: s, em: e0 });
      if (close) em = false;
    });
    return toks;
  }
  // Wrap into lines, shrink to fit maxLines and maxHeight, then balance (no orphan words).
  function layoutText(text, o) {
    o = o || {};
    var size = num(o.size, 32), maxW = Math.max(40, num(o.maxWidth, W * 0.5)), maxLines = Math.max(1, Math.floor(num(o.maxLines, 4)));
    var weight = o.weight || 800, minSize = num(o.minSize, size * 0.5), lh = num(o.lineHeight, 1.16), maxH = num(o.maxHeight, 0);
    var toks = parseEm(text, o.upper !== false);
    function ww(tk, s) { return textW(tk.t, s, tk.em ? 900 : weight, tk.em || o.italic); }
    function wrap(s, limit) {
      var sp = textW(" ", s, weight) * 1.05, lines = [], line = { toks: [], w: 0 };
      toks.forEach(function (tk) {
        var w = ww(tk, s);
        if (line.toks.length && line.w + sp + w > limit) { lines.push(line); line = { toks: [], w: 0 }; }
        tk.x = line.toks.length ? line.w + sp : 0;
        tk.w = w;
        line.w += (line.toks.length ? sp : 0) + w;
        line.toks.push(Object.assign({}, tk));
      });
      if (line.toks.length) lines.push(line);
      return lines;
    }
    function widest(ls) { var m = 0; ls.forEach(function (l) { m = Math.max(m, l.w); }); return m; }
    function tooBig(ls, s) { return ls.length > maxLines || widest(ls) > maxW + 0.5 || (maxH && ls.length * s * lh > maxH); }
    var s = size, lines = wrap(s, maxW);
    for (var i = 0; i < 40 && tooBig(lines, s) && s > minSize; i++) { s *= 0.95; lines = wrap(s, maxW); }
    if (lines.length > 1 && o.balance !== false) {
      var lo = widest(lines) * 0.3, hi = widest(lines), n0 = lines.length;
      for (var b = 0; b < 16; b++) { var mid = (lo + hi) / 2; if (wrap(s, mid).length <= n0) hi = mid; else lo = mid; }
      lines = wrap(s, hi + 0.5);
    }
    return { lines: lines, size: s, lh: lh, w: widest(lines), h: s * lh * lines.length, n: lines.length, weight: weight, italic: !!o.italic };
  }
  function measureBlock(text, o) { var l = layoutText(text, o); return { w: l.w, h: l.h, size: l.size, lines: l.n }; }
  // Writes a laid-out block as SVG text centred on (cx, cy). Returns word tspans in reading order.
  function writeBlock(parent, lay, cx, cy, o) {
    o = o || {};
    var g = svg("g", { class: "cb-text" }, parent), spans = [];
    var top = cy - lay.h / 2, align = o.align || "middle";
    lay.lines.forEach(function (ln, li) {
      var x0 = align === "start" ? cx - lay.w / 2 : cx - ln.w / 2;
      var y = top + lay.size * lay.lh * (li + 0.5) + lay.size * 0.36;
      var tx = svg("text", { y: f2(y), "font-size": f2(lay.size), "font-family": FONT, "font-weight": lay.weight, fill: o.color || C.ink, "font-style": lay.italic ? "italic" : null }, g);
      ln.toks.forEach(function (tk) {
        var sp = svg("tspan", { x: f2(x0 + tk.x) }, tx);
        sp.textContent = tk.t;
        if (tk.em) { sp.setAttribute("fill", o.emColor || C.red); sp.setAttribute("font-weight", 900); sp.setAttribute("font-style", "italic"); }
        spans.push(sp);
      });
    });
    return { g: g, spans: spans };
  }

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
  // When is a label spoken? Keyword first, then the earliest content word that is found.
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
  // Latest start for an animation of length dur that must be finished about 1 s before the end.
  function endT(dur) { var hold = D < 5 ? Math.min(0.9, D * 0.18) : 1.0; return Math.max(0.2, D - hold - (dur || 0)); }
  // Landing times of a sequence (labels + optional keywords), monotonic, spaced, squeezed before the hold.
  function seqTimes(labels, keywords, o) {
    o = o || {};
    var gap = o.gap == null ? 0.6 : o.gap, prev = 0;
    var lands = labels.map(function (l, i) {
      var t = labelTime(l, keywords ? keywords[i] : null, prev);
      if (t != null) prev = t + 0.05;
      return t;
    });
    lands = spread(lands, o.a, o.b);
    if (lands.length && lands[0] < (o.first == null ? 0 : o.first)) lands[0] = o.first || 0;
    for (var i = 1; i < lands.length; i++) if (lands[i] < lands[i - 1] + gap) lands[i] = lands[i - 1] + gap;
    var lim = o.limit == null ? endT(0.8) : o.limit;
    if (lands.length && lands[lands.length - 1] > lim) {
      var a0 = Math.min(lands[0], lim * 0.5), span = lands[lands.length - 1] - a0;
      lands = lands.map(function (t) { return span > 0 ? a0 + ((t - a0) / span) * (lim - a0) : a0; });
    }
    return lands;
  }
  function wordAt(t) {
    var ws = V.words, lo = 0, hi = ws.length - 1, best = -1;
    while (lo <= hi) { var m2 = (lo + hi) >> 1; if (ws[m2].start <= t) { best = m2; lo = m2 + 1; } else hi = m2 - 1; }
    return best;
  }
  function syllables(w) { var m = normWord(w).match(/[aeiouy]+/g); return Math.max(1, m ? m.length : 1); }
  // Spoken times of each token of a text, starting the search at `at`. Missing words are interpolated.
  function wordTimes(toks, at, o) {
    o = o || {};
    var n = toks.length, out = new Array(n), ws = V.words, cursor = 0, limit = at + Math.max(6, n * 0.9);
    while (cursor < ws.length && ws[cursor].start < at - 0.6) cursor++;
    for (var i = 0; i < n; i++) {
      var key = normWord(toks[i]);
      if (!key) continue;
      for (var j = cursor; j < ws.length && j < cursor + 6; j++) {
        if (ws[j].start > limit) break;
        var wn = normWord(ws[j].word);
        if (wn === key || (key.length >= 3 && wn.length >= 3 && (wn.indexOf(key) === 0 || key.indexOf(wn) === 0))) { out[i] = { s: ws[j].start, e: ws[j].end }; cursor = j + 1; break; }
      }
    }
    var pace = o.pace || 0.3, last = at - pace;
    for (i = 0; i < n; i++) {
      if (out[i]) { last = out[i].s; continue; }
      var k = i + 1;
      while (k < n && !out[k]) k++;
      var nextS = k < n ? out[k].s : null, s0 = Math.max(at, last + pace);
      if (nextS != null) s0 = Math.min(s0, lerp(last, nextS, (i - (k - (k - i)) + 1) / (k - i + 1)));
      out[i] = { s: Math.max(at, s0), e: Math.max(at, s0) + pace * 0.85, est: true };
      last = out[i].s;
    }
    return out;
  }
  function phraseEnd(text, at) {
    var toks = parseEm(text, false).map(function (t) { return t.t; });
    if (!toks.length) return num(at, 0) + 0.5;
    var wt = wordTimes(toks, num(at, 0));
    return wt[wt.length - 1].e;
  }

  // ------------------------- state -------------------------
  var st = null;
  function uid(p) { return "cb" + (p || "") + ++st.uid; }
  function need() { if (!st) comic(V.root(), {}); return st; }
  function safeRect() {
    if (V.isPortrait) return { x: 60, y: 250, w: 960, h: 1200 };
    if (V.isSquare || W / H < 1.15) { var mx = W * 0.06, my = H * 0.07; return { x: mx, y: my, w: W - 2 * mx, h: H - 2 * my }; }
    return { x: W * 0.07, y: H * 0.07, w: W * 0.86, h: H * 0.86 };
  }
  function comic(root, o) {
    o = obj(o);
    if (st && st.root === (root || V.root())) { if (o.print) setPrint(o.print); return st; }
    root = root || V.root();
    var R = hel("div", "cb-root", root);
    R.style.width = W + "px"; R.style.height = H + "px";
    var defsSvg = svg("svg", { class: "cb-defs", width: 0, height: 0 }, R);
    var defs = svg("defs", null, defsSvg);
    var cam = hel("div", "cb-cam", R);
    var flapSvg = svg("svg", { class: "cb-flap", width: W, height: H, viewBox: "0 0 " + W + " " + H, overflow: "visible" }, cam);
    var screenSvg = svg("svg", { class: "cb-screen", width: W, height: H, viewBox: "0 0 " + W + " " + H }, R);
    var screenG = svg("g", null, screenSvg);
    var flash = svg("rect", { x: -10, y: -10, width: W + 20, height: H + 20, fill: "#FFFFFF", opacity: 0 }, screenSvg);
    var printDiv = hel("div", "cb-print", R);
    st = {
      root: root, R: R, defs: defs, cam: cam, flapSvg: flapSvg, screen: screenG, flash: flash, printDiv: printDiv,
      pages: [], cur: null, anims: [], items: [], camKeys: [], shakes: [], flashes: [], turns: [], driftAmt: 0.012,
      uid: 0, dirty: true, print: "clean", seed: num(o.seed, V.seed || 1), occ: [], pats: {},
    };
    V.onFrame(frame);
    setPrint(o.print || "clean");
    return st;
  }
  function setPrint(p) {
    p = str(p).toLowerCase();
    if (p !== "aged" && p !== "misprint") p = "clean";
    st.print = p;
    st.R.setAttribute("data-print", p);
    st.R.style.background = p === "aged" ? "#F1E2BC" : C.paper;
    if (p === "misprint") {
      if (!st.misFilter) {
        var f = svg("filter", { id: "cbMisprint", x: "-5%", y: "-5%", width: "110%", height: "110%", "color-interpolation-filters": "sRGB" }, st.defs);
        svg("feColorMatrix", { in: "SourceGraphic", type: "matrix", values: "0 0 0 0 0.05  0 0 0 0 0.62  0 0 0 0 0.86  -0.33 -0.33 -0.34 0 1", result: "dk" }, f);
        var ct = svg("feComponentTransfer", { in: "dk", result: "dk2" }, f);
        svg("feFuncA", { type: "linear", slope: 3.2, intercept: -2.05 }, ct);
        svg("feOffset", { in: "dk2", dx: f2(u(6)), dy: f2(u(4)), result: "ghost" }, f);
        var cm = svg("feComponentTransfer", { in: "ghost", result: "ghost2" }, f);
        svg("feFuncA", { type: "linear", slope: 0.55 }, cm);
        var mg = svg("feMerge", null, f);
        svg("feMergeNode", { in: "SourceGraphic" }, mg);
        svg("feMergeNode", { in: "ghost2" }, mg);
        st.misFilter = f;
      }
      st.cam.style.filter = "url(#cbMisprint)";
    } else st.cam.style.filter = "";
    st.printDiv.innerHTML = "";
    if (p === "aged") {
      var ps = svg("svg", { width: W, height: H, viewBox: "0 0 " + W + " " + H }, st.printDiv);
      svg("rect", { x: 0, y: 0, width: W, height: H, fill: "#C7A15A", opacity: 0.1 }, ps);
      var R2 = V.makeRand(77), d = "";
      for (var i = 0; i < 260; i++) d += circD(R2() * W, R2() * H, u(0.8 + R2() * 2.2));
      svg("path", { d: d, fill: "#7A5A2A", opacity: 0.16 }, ps);
      var e = u(34);
      svg("path", { d: "M0 0H" + W + "V" + H + "H0Z M" + e + " " + e + "V" + (H - e) + "H" + (W - e) + "V" + e + "Z", fill: "#B88F45", opacity: 0.13, "fill-rule": "evenodd" }, ps);
    }
  }
  function pat(kind, color, size, o) {
    var s = need(); o = obj(o);
    kind = str(kind) || "dots"; size = num(size, 12); color = color || C.ink;
    var key = [kind, color, size, o.bg || "", o.r || "", o.angle || 0].join("|");
    if (s.pats[key]) return "url(#" + s.pats[key] + ")";
    var id = uid("pt");
    var p = svg("pattern", { id: id, patternUnits: "userSpaceOnUse", width: f2(size), height: f2(size), patternTransform: "rotate(" + num(o.angle, kind === "dots" ? 45 : 0) + ")" }, s.defs);
    if (o.bg) svg("rect", { x: 0, y: 0, width: size, height: size, fill: o.bg }, p);
    var r = num(o.r, size * 0.28);
    if (kind === "dots") { svg("circle", { cx: size / 2, cy: size / 2, r: f2(r), fill: color }, p); }
    else if (kind === "hatch" || kind === "lines") svg("rect", { x: 0, y: 0, width: size, height: f2(Math.max(1, r * (kind === "lines" ? 0.7 : 0.5))), fill: color }, p);
    else if (kind === "cross") { svg("rect", { x: 0, y: 0, width: size, height: f2(Math.max(1, r * 0.45)), fill: color }, p); svg("rect", { x: 0, y: 0, width: f2(Math.max(1, r * 0.45)), height: size, fill: color }, p); }
    else svg("circle", { cx: size / 2, cy: size / 2, r: f2(r), fill: color }, p);
    s.pats[key] = id;
    return "url(#" + id + ")";
  }
  // Graduated Ben-Day dots in a box: dot radius grows along `angle` (or from the centre when radial).
  function halftone(parent, o) {
    o = obj(o);
    var x = num(o.x, 0), y = num(o.y, 0), w = num(o.w, 200), h = num(o.h, 200), step = Math.max(4, num(o.step, u(16)));
    var maxR = num(o.maxR, step * 0.48), ang = (num(o.angle, 90) * PI) / 180, ca = Math.cos(ang), sa = Math.sin(ang);
    var d = "", row = 0, count = 0, cx = x + w / 2, cy = y + h / 2, R0 = Math.sqrt(w * w + h * h) / 2;
    var minK = num(o.min, 0.06), inv = !!o.invert;
    for (var yy = y; yy <= y + h + step; yy += step * 0.866, row++) {
      for (var xx = x + (row % 2 ? step / 2 : 0); xx <= x + w + step; xx += step) {
        var k;
        if (o.radial) k = clamp(Math.sqrt((xx - cx) * (xx - cx) + (yy - cy) * (yy - cy)) / R0, 0, 1);
        else k = clamp(((xx - cx) * ca + (yy - cy) * sa) / (Math.abs(w * ca) / 2 + Math.abs(h * sa) / 2 + 1e-6) * 0.5 + 0.5, 0, 1);
        if (inv) k = 1 - k;
        var r = maxR * k;
        if (r < maxR * minK) continue;
        d += circD(xx, yy, r);
        if (++count > 6000) break;
      }
      if (count > 6000) break;
    }
    return svg("path", { d: d, fill: o.color || C.ink, opacity: o.opacity == null ? 1 : o.opacity, class: "cb-halftone" }, parent);
  }
  function bumpy(cx, cy, rx, ry, n, rand) {
    n = Math.max(5, Math.floor(num(n, 9)));
    rand = typeof rand === "function" ? rand : V.makeRand(hash(cx + ":" + cy));
    var d = "", pts = [];
    for (var i = 0; i < n; i++) { var a = (i / n) * TAU + rand() * 0.2; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
    for (i = 0; i < n; i++) {
      var p = pts[i], q = pts[(i + 1) % n], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
      var ox = mx - cx, oy = my - cy, L = Math.sqrt(ox * ox + oy * oy) || 1, bulge = (0.3 + rand() * 0.15) * Math.sqrt((q[0] - p[0]) * (q[0] - p[0]) + (q[1] - p[1]) * (q[1] - p[1]));
      if (!i) d += "M" + P2(p[0], p[1]);
      d += "Q" + P2(mx + (ox / L) * bulge, my + (oy / L) * bulge) + " " + P2(q[0], q[1]);
    }
    return d + "Z";
  }

  // ------------------------- pages and panels -------------------------
  // Layout trees: { dir: "cols" | "rows", w: [weights], kids: [tree | null(leaf)] }
  function leafs(n) { var a = []; for (var i = 0; i < n; i++) a.push(null); return a; }
  function line(dir, n, w) { return { dir: dir, w: w || leafs(n).map(function () { return 1; }), kids: leafs(n) }; }
  function layoutTree(n, kind, wide) {
    var C1 = wide ? "cols" : "rows", R1 = wide ? "rows" : "cols";
    if (n <= 1) return null;
    if (kind === "strip") return line(C1, n);
    if (n === 2) return line(C1, 2);
    if (n === 3) {
      if (kind === "feature") return { dir: C1, w: wide ? [1.3, 1] : [1.25, 1], kids: [null, line(R1, 2)] };
      return { dir: "rows", w: [1, 1], kids: [line("cols", 2), null] };
    }
    if (n === 4) {
      if (kind === "feature") return { dir: C1, w: wide ? [1.35, 1] : [1.3, 1], kids: [null, line(R1, 3)] };
      return { dir: "rows", w: [1, 1], kids: [line("cols", 2), line("cols", 2)] };
    }
    if (n === 5) {
      if (wide) return { dir: "rows", w: [1, 1], kids: [line("cols", 2), line("cols", 3)] };
      return { dir: "rows", w: [1, 1, 1], kids: [null, line("cols", 2), line("cols", 2)] };
    }
    if (wide) return { dir: "rows", w: [1, 1], kids: [line("cols", 3), line("cols", 3)] };
    return { dir: "rows", w: [1, 1, 1], kids: [line("cols", 2), line("cols", 2), line("cols", 2)] };
  }
  // Split a quad [tl, tr, br, bl] along a tree with slanted gutters.
  function splitQuad(q, tree, o, out, depth) {
    if (!tree) { out.push(q); return; }
    var n = tree.kids.length, w = tree.w.slice(0, n);
    while (w.length < n) w.push(1);
    var tot = w.reduce(function (a, b) { return a + Math.max(0.05, b); }, 0), acc = 0, g = o.gutter / 2;
    var cuts = [];
    for (var i = 1; i < n; i++) {
      acc += Math.max(0.05, w[i - 1]);
      var f = acc / tot, sgn = ((i + depth + o.seedSign) % 2 ? 1 : -1), s = o.slant * u(15) * sgn;
      if (tree.dir === "cols") {
        var top = [lerp(q[0][0], q[1][0], f) + s, lerp(q[0][1], q[1][1], f)], bot = [lerp(q[3][0], q[2][0], f) - s, lerp(q[3][1], q[2][1], f)];
        cuts.push([top, bot]);
      } else {
        var lft = [lerp(q[0][0], q[3][0], f), lerp(q[0][1], q[3][1], f) - s], rgt = [lerp(q[1][0], q[2][0], f), lerp(q[1][1], q[2][1], f) + s];
        cuts.push([lft, rgt]);
      }
    }
    for (i = 0; i < n; i++) {
      var sub;
      if (tree.dir === "cols") {
        var L = i ? [[cuts[i - 1][0][0] + g, cuts[i - 1][0][1]], [cuts[i - 1][1][0] + g, cuts[i - 1][1][1]]] : [q[0], q[3]];
        var Rr = i < n - 1 ? [[cuts[i][0][0] - g, cuts[i][0][1]], [cuts[i][1][0] - g, cuts[i][1][1]]] : [q[1], q[2]];
        sub = [L[0], Rr[0], Rr[1], L[1]];
      } else {
        var T = i ? [[cuts[i - 1][0][0], cuts[i - 1][0][1] + g], [cuts[i - 1][1][0], cuts[i - 1][1][1] + g]] : [q[0], q[1]];
        var B = i < n - 1 ? [[cuts[i][0][0], cuts[i][0][1] - g], [cuts[i][1][0], cuts[i][1][1] - g]] : [q[3], q[2]];
        sub = [T[0], T[1], B[1], B[0]];
      }
      splitQuad(sub, tree.kids[i], o, out, depth + 1);
    }
  }
  var LAYOUTS = { splash: 1, single: 1, duo: 2, trio: 3, feature: 3, quad: 4, five: 5, six: 6, strip: 3 };
  function bboxOf(pts) {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    pts.forEach(function (p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function innerOf(q) {
    if (q.length !== 4) { var b = bboxOf(q), m = Math.min(b.w, b.h) * 0.08; return { x: b.x + m, y: b.y + m, w: b.w - 2 * m, h: b.h - 2 * m }; }
    var x0 = Math.max(q[0][0], q[3][0]), x1 = Math.min(q[1][0], q[2][0]), y0 = Math.max(q[0][1], q[1][1]), y1 = Math.min(q[2][1], q[3][1]);
    return { x: x0, y: y0, w: Math.max(10, x1 - x0), h: Math.max(10, y1 - y0) };
  }
  function page(layout, o) {
    var s = need();
    o = obj(o);
    var n, kind = str(o.kind);
    if (typeof layout === "number") n = clamp(Math.round(layout), 1, 6);
    else { var ln = str(layout).toLowerCase(); n = LAYOUTS[ln] || clamp(Math.round(num(layout, 1)), 1, 6); if (!kind && (ln === "feature" || ln === "strip")) kind = ln; }
    if (o.n) n = clamp(Math.round(o.n), 1, 6);
    var sr = safeRect(), m = o.margin;
    var area = o.area && o.area.w ? { x: num(o.area.x, sr.x), y: num(o.area.y, sr.y), w: num(o.area.w, sr.w), h: num(o.area.h, sr.h) } : m != null ? { x: num(m, 0), y: num(m, 0), w: W - 2 * num(m, 0), h: H - 2 * num(m, 0) } : sr;
    var wide = area.w / area.h > 1.05;
    var k = s.pages.length;
    var pdiv = hel("div", "cb-page", s.cam);
    pdiv.style.zIndex = String(100 - k);
    var ps = svg("svg", { class: "cb-psvg", width: W, height: H, viewBox: "0 0 " + W + " " + H, overflow: "visible" }, pdiv);
    var paperC = s.print === "aged" ? "#F3E4BF" : C.paper;
    svg("rect", { x: -OV, y: -OV, width: W + 2 * OV, height: H + 2 * OV, fill: paperC }, ps);
    var paperDots = svg("rect", { x: -OV, y: -OV, width: W + 2 * OV, height: H + 2 * OV, fill: pat("dots", "#E9DDBF", u(14), { r: u(2.2) }), opacity: 0.7 }, ps);
    paperDots.setAttribute("class", "cb-paperdots");
    var gPanels = svg("g", { class: "cb-panels" }, ps), gOver = svg("g", { class: "cb-over" }, ps);
    var polys;
    if (Array.isArray(o.polys) && o.polys.length) polys = o.polys.map(function (p) { return arr(p).map(function (q) { return [num(q[0], 0), num(q[1], 0)]; }); }).filter(function (p) { return p.length >= 3; });
    else {
      var tree = layoutTree(n, kind || "grid", wide);
      if (tree && Array.isArray(o.weights) && o.weights.length === tree.kids.length) tree.w = o.weights.map(function (v) { return Math.max(0.1, num(v, 1)); });
      var q = [[area.x, area.y], [area.x + area.w, area.y], [area.x + area.w, area.y + area.h], [area.x, area.y + area.h]];
      polys = [];
      splitQuad(q, tree, { gutter: num(o.gutter, u(22)), slant: clamp(num(o.slant, 1), 0, 2), seedSign: num(o.seed, 0) % 2 }, polys, 0);
    }
    var pg = { el: pdiv, svg: ps, gPanels: gPanels, over: gOver, panels: [], index: k, area: area };
    s.pages.push(pg);
    s.cur = pg;
    var bl = {};
    arr(o.borderless).forEach(function (i) { bl[i] = 1; });
    polys.forEach(function (p, i) { pg.panels.push(makePanel(pg, p, i, { borderless: bl[i] })); });
    if (o.inset) {
      var ins = obj(o.inset), host = pg.panels[clamp(Math.round(num(ins.panel, 0)), 0, pg.panels.length - 1)];
      var inn = host.inner, sz = clamp(num(ins.size, 0.4), 0.15, 0.7), mg = u(16);
      var sx0 = Math.max(inn.x, sr.x), sy0 = Math.max(inn.y, sr.y), sx1 = Math.min(inn.x + inn.w, sr.x + sr.w), sy1 = Math.min(inn.y + inn.h, sr.y + sr.h);
      inn = { x: sx0, y: sy0, w: Math.max(40, sx1 - sx0), h: Math.max(40, sy1 - sy0) };
      var iw = Math.min(inn.w, inn.h) * sz * (ins.aspect ? num(ins.aspect, 1) : 1.15), ih = Math.min(inn.w, inn.h) * sz;
      var cn = str(ins.corner) || "tr", ix = cn.indexOf("l") >= 0 ? inn.x + mg : cn.indexOf("r") >= 0 ? inn.x + inn.w - iw - mg : inn.x + (inn.w - iw) / 2, iy = cn.indexOf("b") >= 0 ? inn.y + inn.h - ih - mg : inn.y + mg;
      var ip = makePanel(pg, [[ix, iy], [ix + iw, iy], [ix + iw, iy + ih], [ix, iy + ih]], pg.panels.length, { inset: true, host: host });
      pg.panels.push(ip);
      occupy(host, { x: ix - u(10), y: iy - u(10), w: iw + u(20), h: ih + u(20) }, 0, D + 1, "panel");
    }
    return pg;
  }
  function makePanel(pg, poly, i, o) {
    var s = st, bb = bboxOf(poly), inner = innerOf(poly);
    var g = svg("g", { class: "cb-panel" + (o.inset ? " cb-inset" : "") }, pg.gPanels);
    var mover = svg("g", null, g);
    var cid = uid("clip"), cp = svg("clipPath", { id: cid, clipPathUnits: "userSpaceOnUse" }, s.defs);
    svg("polygon", { points: ptsAttr(poly) }, cp);
    if (o.inset) svg("polygon", { points: ptsAttr(poly), fill: "none", stroke: C.paper, "stroke-width": f2(u(22)), "stroke-linejoin": "miter" }, mover);
    var wipeG = svg("g", null, mover);
    var clipG = svg("g", { "clip-path": "url(#" + cid + ")" }, wipeG);
    svg("polygon", { points: ptsAttr(poly), fill: "#FFFDF6" }, clipG);
    var world = svg("g", { transform: "translate(" + P2(bb.x, bb.y) + ")" }, clipG);
    var bgG = svg("g", { class: "cb-bg" }, world), fgG = svg("g", { class: "cb-fg" }, world), fxG = svg("g", { class: "cb-pfx" }, world);
    var per = 0;
    for (var k = 0; k < poly.length; k++) { var a = poly[k], b = poly[(k + 1) % poly.length]; per += Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1])); }
    var border = o.borderless ? null : svg("polygon", { points: ptsAttr(poly), fill: "none", stroke: C.ink, "stroke-width": f2(u(o.inset ? 7 : 6)), "stroke-linejoin": "miter" }, mover);
    var flash = svg("polygon", { points: ptsAttr(poly), fill: "#FFFFFF", opacity: 0 }, mover);
    var P = {
      i: i, page: pg, poly: poly, bbox: bb, inner: inner, w: bb.w, h: bb.h, el: g, mover: mover, wipeG: wipeG, world: world,
      bg: bgG, fg: fgG, fx: fxG, border: border, per: per, flash: flash, reveal: null, inset: !!o.inset, host: o.host || null,
    };
    return P;
  }
  function panelOf(p) {
    var s = need();
    if (p && p.bbox && p.world) return p;
    var pg = s.cur;
    if (!pg) pg = page(1);
    var i = clamp(Math.round(num(p, 0)), 0, pg.panels.length - 1);
    return pg.panels[i];
  }
  function revealPanel(p, at, style) {
    p = panelOf(p);
    at = Math.max(0, num(at, 0));
    style = str(style) || "wipe";
    p.reveal = { at: at, style: style };
    var wipeClip = null;
    if (style === "wipe") {
      var cid = uid("wipe"), cp = svg("clipPath", { id: cid, clipPathUnits: "userSpaceOnUse" }, st.defs);
      wipeClip = svg("rect", { x: p.bbox.x - u(30), y: p.bbox.y - u(30), width: 0, height: p.bbox.h + u(60) }, cp);
      p.wipeG.setAttribute("clip-path", "url(#" + cid + ")");
    }
    var cx = p.bbox.x + p.bbox.w / 2, cy = p.bbox.y + p.bbox.h / 2;
    // before its reveal a panel is a light pencil outline (the page is being drawn)
    var pencil = at > 0.05 && !p.inset ? svg("polygon", { points: ptsAttr(p.poly), fill: "none", stroke: "#7FB2DE", "stroke-width": f2(u(4)), "stroke-dasharray": f2(u(18)) + " " + f2(u(8)), opacity: 1 }) : null;
    if (pencil) p.page.gPanels.insertBefore(pencil, p.el);
    st.anims.push(function (t) {
      var on = t >= at - 1e-6;
      p.el.style.display = on ? "" : "none";
      if (pencil) pencil.style.display = t < at + 0.3 ? "" : "none";
      if (!on) return;
      var q = t - at;
      if (p.border) {
        var bp = EASE.outCubic(prog(q, 0, style === "none" ? 0.01 : 0.38));
        p.border.setAttribute("stroke-dasharray", f2(p.per) + " " + f2(p.per));
        p.border.setAttribute("stroke-dashoffset", f2(p.per * (1 - bp)));
      }
      if (wipeClip) wipeClip.setAttribute("width", f2((p.bbox.w + u(60)) * EASE.outCubic(prog(q, 0, 0.42))));
      var tf = "";
      if (style === "pop") { var sc = lerp(0.82, 1, EASE.outBack(prog(q, 0, 0.32))); tf = "translate(" + P2(cx, cy) + ") scale(" + f2(sc * 1000) / 1000 + ") translate(" + P2(-cx, -cy) + ")"; }
      else if (style === "drop") { var dy = -u(70) * (1 - EASE.outBack(prog(q, 0, 0.36))); tf = "translate(0 " + f2(dy) + ")"; }
      p.mover.setAttribute("transform", tf);
      p.mover.setAttribute("opacity", style === "drop" || style === "pop" ? f2(prog(q, 0, 0.12)) : 1);
      p.flash.setAttribute("opacity", style === "flash" ? f2(0.95 * Math.pow(1 - prog(q, 0, 0.45), 2)) : 0);
    });
    return p;
  }
  function panelOn(p, t) {
    if (!p.reveal) return true;
    return t >= p.reveal.at;
  }

  // ------------------------- camera -------------------------
  function camKey(target, at, dur, ez) {
    var s = need();
    s.camKeys.push({ target: target, at: Math.max(0, num(at, 0)), dur: Math.max(0.01, num(dur, 0.7)), ease: ease(ez || "inOut"), id: s.camKeys.length });
    s.dirty = true;
  }
  function clampCam(c) {
    var z = Math.max(1, c.z), hw = W / (2 * z), hh = H / (2 * z);
    return { x: clamp(c.x, hw, W - hw), y: clamp(c.y, hh, H - hh), z: z };
  }
  function focusTarget(r, o) {
    o = o || {};
    var sr = safeRect(), pad = u(10);
    var fit = Math.min((sr.w - 2 * pad) / Math.max(10, r.w), (sr.h - 2 * pad) / Math.max(10, r.h));
    var z = Math.max(1, fit * num(o.zoom, 1));
    var an = arr(o.anchor), fx = clamp(num(an[0], 0.5), 0, 1), fy = clamp(num(an[1], 0.5), 0, 1);
    var px = r.x + r.w * fx, py = r.y + r.h * fy, qx = sr.x + sr.w / 2, qy = sr.y + sr.h / 2;
    return clampCam({ x: px - (qx - W / 2) / z, y: py - (qy - H / 2) / z, z: z });
  }
  function finalizeCam() {
    var s = st;
    s.camKeys.sort(function (a, b) { return a.at - b.at || a.id - b.id; });
    var init = { x: W / 2, y: H / 2, z: 1 };
    s.camKeys.forEach(function (k, i) {
      k.start = i ? evalKey(s.camKeys[i - 1], k.at) : init;
    });
    s.dirty = false;
  }
  function evalKey(k, t) {
    var p = k.ease(prog(t, k.at, k.at + k.dur)), a = k.start, b = k.target;
    var z = Math.exp(lerp(Math.log(a.z), Math.log(b.z), p));
    return { x: lerp(a.x, b.x, p), y: lerp(a.y, b.y, p), z: z };
  }
  function camAt(t) {
    var s = st;
    if (s.dirty) finalizeCam();
    var c = { x: W / 2, y: H / 2, z: 1 }, ks = s.camKeys;
    for (var i = ks.length - 1; i >= 0; i--) if (ks[i].at <= t + 1e-9) { c = evalKey(ks[i], t); break; }
    var dz = 1 + s.driftAmt * smooth(t / Math.max(1, D - 1));
    c = clampCam({ x: c.x, y: c.y, z: c.z * dz });
    var sx = 0, sy = 0, sr = 0;
    s.shakes.forEach(function (k) {
      if (t < k.at || t > k.at + k.dur) return;
      var q = (t - k.at) / k.dur, env = Math.pow(1 - q, 2) * k.amp, tt = (t - k.at) * 60;
      sx += env * (Math.sin(tt * 1.13 + 1) * 0.6 + Math.sin(tt * 2.71) * 0.4);
      sy += env * (Math.sin(tt * 1.37 + 2) * 0.6 + Math.sin(tt * 2.29 + 0.5) * 0.4);
      sr += env * 0.04 * Math.sin(tt * 1.9);
    });
    c.sx = sx; c.sy = sy; c.sr = sr;
    return c;
  }
  function camMoving(t) {
    var s = st;
    return s.camKeys.some(function (k) { return k.dur > 0.05 && t > k.at && t < k.at + k.dur; }) ||
      s.shakes.some(function (k) { return t > k.at && t < k.at + k.dur; });
  }
  function proj(x, y, c) { return [(x - c.x) * c.z + W / 2 + c.sx, (y - c.y) * c.z + H / 2 + c.sy]; }
  function rectOf(target) {
    if (!target) return { x: 0, y: 0, w: W, h: H };
    if (target.bbox) return target.bbox;
    if (target.x != null && target.w != null) return { x: num(target.x, 0), y: num(target.y, 0), w: num(target.w, W), h: num(target.h, H) };
    if (typeof target === "number") return panelOf(target).bbox;
    return { x: 0, y: 0, w: W, h: H };
  }
  var camera = {
    focus: function (p, at, dur, o) {
      o = obj(o);
      var r = rectOf(p && p.bbox ? p : typeof p === "number" ? panelOf(p) : p);
      camKey(focusTarget(r, o), at, dur == null ? 0.7 : dur, o.ease);
    },
    page: function (at, dur) { camKey({ x: W / 2, y: H / 2, z: 1 }, at, dur == null ? 0.9 : dur, "inOut"); },
    to: function (cx, cy, zoom, at, dur, ez) { camKey(clampCam({ x: num(cx, W / 2), y: num(cy, H / 2), z: Math.max(1, num(zoom, 1)) }), at, dur == null ? 0.8 : dur, ez); },
    shake: function (at, amp, dur) { need().shakes.push({ at: Math.max(0, num(at, 0)), amp: num(amp, u(14)), dur: num(dur, 0.45) }); },
    flash: function (at, strength) { need().flashes.push({ at: Math.max(0, num(at, 0)), k: clamp(num(strength, 0.85), 0, 1) }); },
    drift: function (amount) { need().driftAmt = clamp(num(amount, 0.012), 0, 0.2); },
    at: function (t) { return camAt(num(t, V.time())); },
  };

  // ------------------------- page turn -------------------------
  function clipHalf(poly, F, d, keepNeg) {
    var out = [];
    for (var i = 0; i < poly.length; i++) {
      var a = poly[i], b = poly[(i + 1) % poly.length];
      var da = (a[0] - F[0]) * d[0] + (a[1] - F[1]) * d[1], db = (b[0] - F[0]) * d[0] + (b[1] - F[1]) * d[1];
      if (keepNeg) { da = -da; db = -db; }
      if (da >= 0) out.push(a);
      if ((da >= 0) !== (db >= 0)) { var k = da / (da - db); out.push([lerp(a[0], b[0], k), lerp(a[1], b[1], k)]); }
    }
    return out;
  }
  function pageTurn(at, dur) {
    var s = need();
    at = Math.max(0, num(at, 0)); dur = Math.max(0.3, num(dur, 1.1));
    var idx = s.turns.length, pg = s.pages[idx];
    if (!pg || s.pages.length < 2 + idx) { V.error("S.pageTurn needs a second page under the one that turns (call S.page twice)"); if (!pg) return; }
    var dir = V.isPortrait ? [0.55, 1] : [1, 0.42], L0 = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1]);
    dir = [dir[0] / L0, dir[1] / L0];
    var rect = [[-OV, -OV], [W + OV, -OV], [W + OV, H + OV], [-OV, H + OV]];
    var Cn = [W + OV, H + OV], span = 0;
    rect.forEach(function (p) { span = Math.max(span, (Cn[0] - p[0]) * dir[0] + (Cn[1] - p[1]) * dir[1]); });
    var back = svg("polygon", { fill: s.print === "aged" ? "#E2CFA2" : "#EFE5CC", stroke: C.ink, "stroke-width": f2(u(4)), "stroke-linejoin": "round" }, s.flapSvg);
    var backDots = svg("polygon", { fill: pat("dots", "#CDBB92", u(12), { r: u(2.6) }) }, s.flapSvg);
    var shade = svg("polygon", { fill: "#15110E", opacity: 0.16 }, s.flapSvg);
    s.flapSvg.insertBefore(shade, back);
    s.turns.push({ page: pg, at: at, dur: dur });
    s.anims.push(function (t) {
      var p = EASE.inOutSine(prog(t, at, at + dur));
      if (t < at) { pg.el.style.clipPath = ""; pg.el.style.display = ""; back.style.display = backDots.style.display = shade.style.display = "none"; return; }
      if (p >= 1) { pg.el.style.display = "none"; back.style.display = backDots.style.display = shade.style.display = "none"; return; }
      pg.el.style.display = "";
      var dist = span * 1.02 * p, F = [Cn[0] - dir[0] * dist, Cn[1] - dir[1] * dist];
      var keep = clipHalf(rect, F, dir, true);
      var gone = clipHalf(rect, F, dir, false);
      pg.el.style.clipPath = keep.length >= 3 ? "polygon(" + keep.map(function (q) { return f2(q[0]) + "px " + f2(q[1]) + "px"; }).join(",") + ")" : "polygon(0 0,0 0,0 0)";
      var flap = gone.map(function (q) { var k = 2 * ((q[0] - F[0]) * dir[0] + (q[1] - F[1]) * dir[1]); return [q[0] - k * dir[0], q[1] - k * dir[1]]; });
      var on = flap.length >= 3;
      back.style.display = backDots.style.display = shade.style.display = on ? "" : "none";
      if (!on) return;
      back.setAttribute("points", ptsAttr(flap));
      backDots.setAttribute("points", ptsAttr(flap));
      // shadow strip on the revealed page, beyond the fold
      var sw = u(36) * (1 - p * 0.5), F2 = [F[0] + dir[0] * sw, F[1] + dir[1] * sw];
      var strip = clipHalf(clipHalf(rect, F, dir, false), F2, dir, true);
      shade.setAttribute("points", strip.length >= 3 ? ptsAttr(strip) : "0,0 0,0 0,0");
    });
  }

  // ------------------------- per-frame update -------------------------
  function frame(t) {
    var s = st;
    if (!s) return;
    var c = camAt(t);
    s.cam.style.transform = "translate(" + f2(W / 2 - c.x * c.z + c.sx) + "px," + f2(H / 2 - c.y * c.z + c.sy) + "px) scale(" + c.z.toFixed(5) + ")";
    var fl = 0;
    s.flashes.forEach(function (k) { if (t >= k.at && t < k.at + 0.45) fl = Math.max(fl, k.k * Math.pow(1 - (t - k.at) / 0.45, 2)); });
    s.flash.setAttribute("opacity", f2(fl));
    for (var i = 0; i < s.anims.length; i++) s.anims[i](t);
  }

  // ------------------------- backdrops (panel px) -------------------------
  var MOODS = {
    day: { sky: "#8FD3F5", sky2: "#BFE8FA", dots: "#62BBE8", far: "#B9D6E6", bld: ["#F4E3C1", "#E9B8A0", "#C7D9E8", "#F2CF7E", "#BFD8B8"], win: "#D9F1FF", ground: "#C9C1B2", road: "#8C8F99", wall: "#F5DDB0", floor: "#C4884E" },
    dusk: { sky: "#F59A4E", sky2: "#F9C66E", dots: "#E2683A", far: "#C9708A", bld: ["#8E5A86", "#B0607A", "#6E5A9A", "#C27C64", "#7A4E78"], win: "#FFD978", ground: "#7E6A78", road: "#5C5068", wall: "#E8B48A", floor: "#9C6A44" },
    night: { sky: "#1F2B5C", sky2: "#2C3B78", dots: "#34448A", far: "#2A3566", bld: ["#33407A", "#2B3567", "#3D3A6E", "#283A5E", "#3A4A80"], win: "#FFD23F", ground: "#2E3350", road: "#22263D", wall: "#5E4A72", floor: "#4A3550" },
  };
  function moodOf(m) { m = str(m).toLowerCase(); return MOODS[m] ? m : "day"; }
  var BGS = ["city", "street", "lab", "space", "interior", "sky", "action", "explosion", "halftone", "focus", "speed", "plain"];
  var BG_ALIAS = { sunburst: "action", rays: "action", boom: "explosion", dots: "halftone", radial: "focus", lines: "speed", white: "plain", none: "plain", room: "interior", office: "interior", home: "interior", night: "city", town: "city", road: "street", stars: "space", clouds: "sky", science: "lab" };
  function bgName(n) { n = str(n).toLowerCase(); if (BGS.indexOf(n) >= 0) return n; return BG_ALIAS[n] || "plain"; }
  var INKW = function (k) { return f2(u(3) * (k || 1)); };
  function skyFill(g, w, h, M, mood, R) {
    svg("rect", { x: -2, y: -2, width: w + 4, height: h + 4, fill: M.sky }, g);
    if (mood === "dusk") svg("rect", { x: -2, y: h * 0.38, width: w + 4, height: h * 0.7, fill: M.sky2 }, g);
    halftone(g, { x: 0, y: 0, w: w, h: h * 0.6, color: mood === "dusk" ? "#F6B566" : M.dots, angle: -90, step: u(18), maxR: u(6.5), opacity: mood === "night" ? 0.7 : 0.55 });
    if (mood === "night") {
      var d = "";
      for (var i = 0; i < Math.round(w * h / 9000); i++) { var x = R() * w, y = R() * h * 0.55, r = u(1.2 + R() * 2.2); d += circD(x, y, r); }
      svg("path", { d: d, fill: "#FFF6D8" }, g);
    }
  }
  function sunMoon(g, w, h, mood, cx, cy, r) {
    if (mood === "night") {
      svg("circle", { cx: cx, cy: cy, r: r, fill: "#FFF3C4", stroke: C.ink, "stroke-width": INKW() }, g);
      svg("circle", { cx: cx + r * 0.3, cy: cy - r * 0.2, r: r * 0.18, fill: "#EAD9A0" }, g);
      svg("circle", { cx: cx - r * 0.35, cy: cy + r * 0.3, r: r * 0.12, fill: "#EAD9A0" }, g);
    } else {
      svg("circle", { cx: cx, cy: cy, r: r, fill: mood === "dusk" ? "#FFE08A" : "#FFD23F", stroke: C.ink, "stroke-width": INKW() }, g);
    }
  }
  function buildings(g, w, h, base, M, R, o) {
    o = o || {};
    var x = -u(10), out = [];
    while (x < w + u(10)) {
      var bw = (o.minW || w * 0.07) + R() * (o.varW || w * 0.09), bh = h * (o.minH || 0.25) + R() * h * (o.varH || 0.35);
      out.push({ x: x, w: bw, h: bh });
      x += bw + (o.gap ? R() * o.gap : 0);
    }
    out.forEach(function (b, i) {
      var col = o.flat || M.bld[i % M.bld.length], top = base - b.h;
      svg("rect", { x: f2(b.x), y: f2(top), width: f2(b.w), height: f2(b.h + h), fill: col, stroke: o.flat ? "none" : C.ink, "stroke-width": INKW(0.9) }, g);
      if (o.flat) return;
      if (R() < 0.3) svg("rect", { x: f2(b.x + b.w * 0.6), y: f2(top - b.h * 0.12), width: f2(Math.max(u(3), b.w * 0.06)), height: f2(b.h * 0.12), fill: C.ink }, g);
      var cols = Math.max(1, Math.floor(b.w / u(26))), rows = Math.max(1, Math.floor(b.h / u(34))), ww = b.w / (cols * 1.9 + 0.5), wh = Math.min(u(20), b.h / (rows * 2));
      var d = "", dl = "";
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
        var wx = b.x + ww * 0.6 + c * ww * 1.9, wy = top + u(14) + r * (b.h - u(14)) / rows;
        if (wy + wh > base - u(6)) continue;
        var lit = M === MOODS.night ? R() < 0.55 : R() < 0.85;
        if (lit) d += "M" + P2(wx, wy) + "h" + f2(ww) + "v" + f2(wh) + "h" + f2(-ww) + "Z"; else dl += "M" + P2(wx, wy) + "h" + f2(ww) + "v" + f2(wh) + "h" + f2(-ww) + "Z";
      }
      if (d) svg("path", { d: d, fill: M.win, stroke: C.ink, "stroke-width": INKW(0.5) }, g);
      if (dl) svg("path", { d: dl, fill: dark(col, 0.35) }, g);
    });
  }
  var BGDRAW = {
    plain: function (g, w, h, o) {
      svg("rect", { x: -2, y: -2, width: w + 4, height: h + 4, fill: o.pal ? o.pal[0] : C.cream }, g);
      halftone(g, { x: 0, y: 0, w: w, h: h, color: o.pal ? light(o.pal[1], 0.4) : "#F1DFA8", radial: true, step: u(20), maxR: u(6), opacity: 0.8 });
    },
    sky: function (g, w, h, o, R) {
      var M = MOODS[o.mood];
      skyFill(g, w, h, M, o.mood, R);
      sunMoon(g, w, h, o.mood, w * 0.8, h * 0.22, Math.min(w, h) * 0.1);
      var cl = o.mood === "night" ? "#5A6AA8" : o.mood === "dusk" ? "#FFE2C2" : "#FFFFFF";
      [[0.18, 0.3, 0.16], [0.55, 0.55, 0.2], [0.88, 0.75, 0.14], [0.3, 0.82, 0.12]].forEach(function (q) {
        var rx = w * q[2], ry = rx * 0.42;
        svg("path", { d: bumpy(w * q[0], h * q[1], rx, ry, 9, R), fill: cl, stroke: C.ink, "stroke-width": INKW() }, g);
      });
      if (o.mood !== "night") {
        var d = "";
        [[0.38, 0.2], [0.44, 0.24], [0.4, 0.3]].forEach(function (q) { var x = w * q[0], y = h * q[1], s = Math.min(w, h) * 0.025; d += "M" + P2(x - s, y - s * 0.5) + "Q" + P2(x - s * 0.4, y - s * 0.9) + " " + P2(x, y) + "Q" + P2(x + s * 0.4, y - s * 0.9) + " " + P2(x + s, y - s * 0.5); });
        svg("path", { d: d, fill: "none", stroke: C.ink, "stroke-width": INKW(0.9), "stroke-linecap": "round" }, g);
      }
    },
    city: function (g, w, h, o, R) {
      var M = MOODS[o.mood], base = h * num(o.horizon, 0.97);
      skyFill(g, w, h, M, o.mood, R);
      sunMoon(g, w, h, o.mood, w * 0.82, h * 0.2, Math.min(w, h) * 0.08);
      buildings(g, w, h, base - h * 0.08, M, R, { flat: M.far, minH: 0.35, varH: 0.3, minW: w * 0.05, varW: w * 0.06 });
      buildings(g, w, h, base, M, R, { minH: 0.18, varH: 0.32, gap: w * 0.01 });
      svg("rect", { x: -2, y: base, width: w + 4, height: h - base + 4, fill: C.ink }, g);
    },
    street: function (g, w, h, o, R) {
      var M = MOODS[o.mood], hz = h * num(o.horizon, 0.6);
      skyFill(g, w, h, M, o.mood, R);
      buildings(g, w, h, hz, M, R, { minH: 0.22, varH: 0.28, minW: w * 0.09, varW: w * 0.08 });
      svg("rect", { x: -2, y: hz, width: w + 4, height: h * 0.07, fill: M.ground, stroke: C.ink, "stroke-width": INKW() }, g);
      var ry = hz + h * 0.07;
      svg("rect", { x: -2, y: ry, width: w + 4, height: h - ry + 4, fill: M.road, stroke: C.ink, "stroke-width": INKW() }, g);
      var vx = w * 0.5, d = "";
      for (var i = -4; i <= 4; i++) d += "M" + P2(vx + i * w * 0.02, ry) + "L" + P2(vx + i * w * 0.45, h + 4);
      svg("path", { d: d, stroke: dark(M.road, 0.3), "stroke-width": INKW(0.6), fill: "none" }, g);
      var dd = "", y = ry + (h - ry) * 0.5;
      for (var x = 0; x < w; x += w * 0.12) dd += "M" + P2(x, y) + "h" + f2(w * 0.06);
      svg("path", { d: dd, stroke: o.mood === "night" ? "#E8C24A" : "#FFF3C4", "stroke-width": f2(u(7)), fill: "none" }, g);
      var lx = w * 0.1, lt = hz - h * 0.3;
      svg("path", { d: "M" + P2(lx, ry) + "V" + f2(lt) + "q" + P2(0, -h * 0.04) + " " + P2(w * 0.05, -h * 0.04), fill: "none", stroke: C.ink, "stroke-width": f2(u(6)) }, g);
      svg("ellipse", { cx: f2(lx + w * 0.055), cy: f2(lt - h * 0.025), rx: f2(w * 0.018), ry: f2(h * 0.018), fill: o.mood === "night" ? "#FFE58A" : "#FFF6D8", stroke: C.ink, "stroke-width": INKW() }, g);
      if (o.mood === "night") svg("path", { d: "M" + P2(lx + w * 0.055, lt - h * 0.02) + "L" + P2(lx - w * 0.04, ry + h * 0.02) + "L" + P2(lx + w * 0.16, ry + h * 0.02) + "Z", fill: "#FFE58A", opacity: 0.22 }, g);
    },
    lab: function (g, w, h, o, R) {
      var night = o.mood === "night", hz = h * num(o.horizon, 0.72);
      var wall = night ? "#2F4F5E" : "#CFE9E3", floor = night ? "#22343F" : "#9DB4BE";
      svg("rect", { x: -2, y: -2, width: w + 4, height: hz + 2, fill: wall }, g);
      var d = "", ts = Math.max(u(40), Math.min(w, h) * 0.1);
      for (var x = 0; x < w; x += ts) d += "M" + P2(x, 0) + "V" + f2(hz);
      for (var y = 0; y < hz; y += ts) d += "M" + P2(0, y) + "H" + f2(w);
      svg("path", { d: d, stroke: dark(wall, 0.12), "stroke-width": INKW(0.5), fill: "none" }, g);
      halftone(g, { x: 0, y: 0, w: w, h: hz, color: dark(wall, 0.14), angle: 180, step: u(16), maxR: u(5), opacity: 0.8 });
      svg("rect", { x: -2, y: hz, width: w + 4, height: h - hz + 4, fill: floor, stroke: C.ink, "stroke-width": INKW() }, g);
      var fd = "";
      for (var i = -6; i <= 6; i++) fd += "M" + P2(w * 0.5 + i * w * 0.06, hz) + "L" + P2(w * 0.5 + i * w * 0.3, h + 4);
      svg("path", { d: fd, stroke: dark(floor, 0.2), "stroke-width": INKW(0.5), fill: "none" }, g);
      // shelf with flasks (left)
      var sy = hz * 0.42, sx0 = w * 0.04, sx1 = w * 0.42;
      svg("rect", { x: f2(sx0), y: f2(sy), width: f2(sx1 - sx0), height: f2(u(10)), fill: "#A8764A", stroke: C.ink, "stroke-width": INKW() }, g);
      var cols = ["#3FC7E8", "#8BE04E", "#F06EAA", "#FFD23F"], fx = sx0 + w * 0.03, fs = Math.min(w, h) * 0.06;
      for (var k = 0; k < 4 && fx < sx1 - fs * 0.5; k++) {
        var c = cols[k % 4], bx = fx, by = sy;
        if (k % 2) {
          svg("path", { d: "M" + P2(bx - fs * 0.18, by - fs * 1.25) + "h" + f2(fs * 0.36) + "v" + f2(fs * 0.45) + "l" + P2(fs * 0.38, fs * 0.8) + "h" + f2(-fs * 1.12) + "l" + P2(fs * 0.38, -fs * 0.8) + "Z", fill: "#EAF6FA", stroke: C.ink, "stroke-width": INKW() }, g);
          svg("path", { d: "M" + P2(bx - fs * 0.42, by - fs * 0.35) + "h" + f2(fs * 0.84) + "l" + P2(fs * 0.14, fs * 0.35) + "h" + f2(-fs * 1.12) + "Z", fill: c }, g);
        } else {
          svg("rect", { x: f2(bx - fs * 0.2), y: f2(by - fs * 1.3), width: f2(fs * 0.4), height: f2(fs * 1.3), rx: f2(fs * 0.18), fill: "#EAF6FA", stroke: C.ink, "stroke-width": INKW() }, g);
          svg("rect", { x: f2(bx - fs * 0.2 + u(2)), y: f2(by - fs * 0.7), width: f2(fs * 0.4 - u(4)), height: f2(fs * 0.68), rx: f2(fs * 0.14), fill: c }, g);
        }
        fx += fs * 1.6;
      }
      // machine with a screen (right)
      var mx = w * 0.62, mw = w * 0.34, my = hz * 0.22, mh = hz * 0.78;
      svg("rect", { x: f2(mx), y: f2(my), width: f2(mw), height: f2(mh + u(4)), fill: night ? "#5C6E80" : "#B8C4D0", stroke: C.ink, "stroke-width": INKW() }, g);
      svg("rect", { x: f2(mx + mw * 0.1), y: f2(my + mh * 0.1), width: f2(mw * 0.8), height: f2(mh * 0.42), fill: "#1D2633", stroke: C.ink, "stroke-width": INKW() }, g);
      var wv = "";
      for (var j = 0; j <= 20; j++) { var px = mx + mw * 0.14 + (mw * 0.72 * j) / 20, py = my + mh * 0.31 + Math.sin(j * 0.9) * mh * 0.08; wv += (j ? "L" : "M") + P2(px, py); }
      svg("path", { d: wv, fill: "none", stroke: "#5FE3FF", "stroke-width": f2(u(4)) }, g);
      for (var b = 0; b < 3; b++) svg("circle", { cx: f2(mx + mw * (0.25 + b * 0.25)), cy: f2(my + mh * 0.72), r: f2(Math.min(mw, mh) * 0.07), fill: ["#E23B2E", "#FFD23F", "#3FA34D"][b], stroke: C.ink, "stroke-width": INKW() }, g);
    },
    space: function (g, w, h, o, R) {
      svg("rect", { x: -2, y: -2, width: w + 4, height: h + 4, fill: C.navy }, g);
      halftone(g, { x: 0, y: 0, w: w, h: h, color: "#26306A", radial: true, step: u(20), maxR: u(8), opacity: 0.9 });
      var d = "", ds = "";
      for (var i = 0; i < Math.round(w * h / 6000); i++) d += circD(R() * w, R() * h, u(1 + R() * 2.2));
      for (i = 0; i < 6; i++) { var x = R() * w, y = R() * h, s = u(8 + R() * 8); ds += "M" + P2(x - s, y) + "Q" + P2(x, y) + " " + P2(x, y - s) + "Q" + P2(x, y) + " " + P2(x + s, y) + "Q" + P2(x, y) + " " + P2(x, y + s) + "Q" + P2(x, y) + " " + P2(x - s, y) + "Z"; }
      svg("path", { d: d, fill: "#FFF6D8" }, g);
      svg("path", { d: ds, fill: "#FFF6D8" }, g);
      var pr = Math.min(w, h) * 0.28, pcx = w * 0.8, pcy = h * 0.78;
      var pal = o.pal || PAL.purple;
      var ringA = { cx: f2(pcx), cy: f2(pcy), rx: f2(pr * 1.75), ry: f2(pr * 0.36), fill: "none", transform: "rotate(-14 " + P2(pcx, pcy) + ")" };
      svg("ellipse", Object.assign({ stroke: C.ink, "stroke-width": f2(u(16)) }, ringA), g);
      svg("ellipse", Object.assign({ stroke: "#FFD23F", "stroke-width": f2(u(8)) }, ringA), g);
      svg("circle", { cx: f2(pcx), cy: f2(pcy), r: f2(pr), fill: pal[1], stroke: C.ink, "stroke-width": INKW(1.3) }, g);
      var cid = uid("pl"), cp = svg("clipPath", { id: cid }, st.defs); svg("circle", { cx: f2(pcx), cy: f2(pcy), r: f2(pr) }, cp);
      var hg = svg("g", { "clip-path": "url(#" + cid + ")" }, g);
      svg("path", { d: "M" + P2(pcx - pr, pcy - pr * 0.2) + "Q" + P2(pcx, pcy - pr * 0.05) + " " + P2(pcx + pr, pcy - pr * 0.35) + "V" + f2(pcy - pr * 0.15) + "Q" + P2(pcx, pcy + pr * 0.15) + " " + P2(pcx - pr, pcy) + "Z", fill: pal[0], opacity: 0.8 }, hg);
      halftone(hg, { x: pcx - pr, y: pcy - pr, w: pr * 2, h: pr * 2, color: pal[2], angle: 135, step: u(14), maxR: u(6) });
      var rcid = uid("rg"), rcp = svg("clipPath", { id: rcid }, st.defs);
      svg("rect", { x: f2(pcx - pr * 2.2), y: f2(pcy), width: f2(pr * 4.4), height: f2(pr * 2), transform: "rotate(-14 " + P2(pcx, pcy) + ")" }, rcp);
      var fr = svg("g", { "clip-path": "url(#" + rcid + ")" }, g);
      svg("ellipse", Object.assign({ stroke: C.ink, "stroke-width": f2(u(16)) }, ringA), fr);
      svg("ellipse", Object.assign({ stroke: "#FFD23F", "stroke-width": f2(u(8)) }, ringA), fr);
      svg("circle", { cx: f2(w * 0.16), cy: f2(h * 0.22), r: f2(pr * 0.28), fill: "#D8DCE6", stroke: C.ink, "stroke-width": INKW() }, g);
      svg("circle", { cx: f2(w * 0.16 + pr * 0.08), cy: f2(h * 0.22 - pr * 0.06), r: f2(pr * 0.07), fill: "#AEB4C4" }, g);
    },
    interior: function (g, w, h, o, R) {
      var M = MOODS[o.mood], hz = h * num(o.horizon, 0.74), night = o.mood === "night";
      svg("rect", { x: -2, y: -2, width: w + 4, height: hz + 2, fill: M.wall }, g);
      svg("rect", { x: -2, y: -2, width: w + 4, height: hz + 2, fill: pat("lines", dark(M.wall, 0.08), u(26), { r: u(6) }) }, g);
      var wx = w * 0.58, wy = hz * 0.14, ww = w * 0.3, wh = hz * 0.5;
      svg("rect", { x: f2(wx), y: f2(wy), width: f2(ww), height: f2(wh), fill: night ? "#1F2B5C" : "#9FDCF7", stroke: C.ink, "stroke-width": INKW(1.4) }, g);
      if (night) svg("circle", { cx: f2(wx + ww * 0.7), cy: f2(wy + wh * 0.3), r: f2(Math.min(ww, wh) * 0.12), fill: "#FFF3C4", stroke: C.ink, "stroke-width": INKW() }, g);
      else svg("path", { d: bumpy(wx + ww * 0.35, wy + wh * 0.35, ww * 0.18, wh * 0.08, 7, R), fill: "#FFFFFF", stroke: C.ink, "stroke-width": INKW(0.7) }, g);
      svg("path", { d: "M" + P2(wx + ww / 2, wy) + "V" + f2(wy + wh) + "M" + P2(wx, wy + wh / 2) + "H" + f2(wx + ww), stroke: C.ink, "stroke-width": f2(u(6)) }, g);
      svg("rect", { x: f2(wx - u(10)), y: f2(wy + wh), width: f2(ww + u(20)), height: f2(u(12)), fill: "#A8764A", stroke: C.ink, "stroke-width": INKW() }, g);
      var fx = w * 0.12, fy = hz * 0.2, fw = w * 0.2, fh = hz * 0.3;
      svg("rect", { x: f2(fx), y: f2(fy), width: f2(fw), height: f2(fh), fill: "#FFF6D8", stroke: C.ink, "stroke-width": f2(u(7)) }, g);
      svg("path", { d: "M" + P2(fx + fw * 0.1, fy + fh * 0.85) + "L" + P2(fx + fw * 0.4, fy + fh * 0.35) + "L" + P2(fx + fw * 0.6, fy + fh * 0.65) + "L" + P2(fx + fw * 0.75, fy + fh * 0.45) + "L" + P2(fx + fw * 0.9, fy + fh * 0.85) + "Z", fill: "#3FA34D", stroke: C.ink, "stroke-width": INKW(0.7) }, g);
      svg("rect", { x: -2, y: hz, width: w + 4, height: h - hz + 4, fill: M.floor, stroke: C.ink, "stroke-width": INKW() }, g);
      var d = "";
      for (var y = hz + (h - hz) * 0.25; y < h; y += (h - hz) * 0.3) d += "M0 " + f2(y) + "H" + f2(w);
      svg("path", { d: d, stroke: dark(M.floor, 0.25), "stroke-width": INKW(0.6), fill: "none" }, g);
      halftone(g, { x: 0, y: 0, w: w * 0.35, h: hz, color: dark(M.wall, 0.18), angle: 180, step: u(16), maxR: u(5), opacity: 0.8 });
      if (night) svg("rect", { x: -2, y: -2, width: w + 4, height: h + 4, fill: "#141B3D", opacity: 0.18 }, g);
    },
    action: function (g, w, h, o, R) {
      var pal = o.pal || PAL.red, cx = w * num(o.cx, 0.5), cy = h * num(o.cy, 0.5), rr = Math.sqrt(w * w + h * h);
      svg("rect", { x: -2, y: -2, width: w + 4, height: h + 4, fill: pal[0] }, g);
      var rays = svg("g", null, g), d = "", n = 18;
      for (var i = 0; i < n; i++) { var a0 = (i / n) * TAU, a1 = a0 + (TAU / n) * 0.5; d += "M" + P2(0, 0) + "L" + P2(Math.cos(a0) * rr, Math.sin(a0) * rr) + "L" + P2(Math.cos(a1) * rr, Math.sin(a1) * rr) + "Z"; }
      svg("path", { d: d, fill: pal[1] }, rays);
      halftone(g, { x: 0, y: 0, w: w, h: h, color: pal[2], radial: true, step: u(22), maxR: u(8), opacity: 0.35 });
      st.anims.push(function (t) { rays.setAttribute("transform", "translate(" + P2(cx, cy) + ") rotate(" + f2((t * 4) % 360) + ")"); });
    },
    explosion: function (g, w, h, o, R) {
      var pal = o.pal || PAL.red, cx = w * num(o.cx, 0.5), cy = h * num(o.cy, 0.5), r = Math.max(w, h) * 0.62;
      svg("rect", { x: -2, y: -2, width: w + 4, height: h + 4, fill: pal[2] }, g);
      var core = svg("g", null, g);
      [[1, "#E23B2E", 16], [0.74, "#F5862E", 14], [0.5, "#FFD23F", 12], [0.26, "#FFF6D8", 10]].forEach(function (q, k) {
        var pts = starPts(0, 0, r * q[0], r * q[0] * 0.74, q[2], -90 + k * 7);
        pts = pts.map(function (p, j) { var jj = 0.9 + 0.2 * R(); return [p[0] * jj, p[1] * jj * 0.82]; });
        svg("path", { d: polyD(pts), fill: q[1], stroke: C.ink, "stroke-width": INKW(1.1), "stroke-linejoin": "round" }, core);
      });
      for (var i = 0; i < 7; i++) {
        var a = R() * TAU, dd = r * (0.75 + R() * 0.35), pr = Math.min(w, h) * (0.06 + R() * 0.05);
        svg("path", { d: bumpy(cx + Math.cos(a) * dd, cy + Math.sin(a) * dd * 0.8, pr, pr * 0.8, 7, R), fill: "#8C8F99", stroke: C.ink, "stroke-width": INKW() }, g);
      }
      st.anims.push(function (t) { var k = 1 + 0.025 * Math.sin(t * 9); core.setAttribute("transform", "translate(" + P2(cx, cy) + ") scale(" + f2(k * 1000) / 1000 + ")"); });
    },
    halftone: function (g, w, h, o) {
      var pal = o.pal || PAL.pink;
      svg("rect", { x: -2, y: -2, width: w + 4, height: h + 4, fill: pal[0] }, g);
      halftone(g, { x: 0, y: 0, w: w, h: h, color: pal[1], radial: true, step: u(26), maxR: u(12), min: 0.12 });
    },
    focus: function (g, w, h, o) {
      svg("rect", { x: -2, y: -2, width: w + 4, height: h + 4, fill: o.pal ? o.pal[0] : "#FFFDF6" }, g);
      g.appendChild(focusLinesG(w, h, { cx: num(o.cx, 0.5), cy: num(o.cy, 0.5), clear: 0.3, color: C.ink, seed: o.seed }));
    },
    speed: function (g, w, h, o) {
      var pal = o.pal || PAL.blue;
      svg("rect", { x: -2, y: -2, width: w + 4, height: h + 4, fill: pal[0] }, g);
      g.appendChild(speedLinesG(w, h, { color: pal[1], opacity: 0.9, seed: o.seed }));
    },
  };
  function focusLinesG(w, h, o) {
    var g = svg("g", { class: "cb-focus" }), R = V.makeRand(num(o.seed, 3) + 11), cx = w * o.cx, cy = h * o.cy;
    var rr = Math.sqrt(w * w + h * h), clear = Math.min(w, h) * num(o.clear, 0.3), d = "", n = 64;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * TAU + R() * 0.05, wdt = 0.012 + R() * 0.022, r0 = clear * (1 + R() * 0.7);
      d += "M" + P2(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.85) + "L" + P2(cx + Math.cos(a - wdt) * rr, cy + Math.sin(a - wdt) * rr) + "L" + P2(cx + Math.cos(a + wdt) * rr, cy + Math.sin(a + wdt) * rr) + "Z";
    }
    svg("path", { d: d, fill: o.color || C.ink, opacity: o.opacity == null ? 1 : o.opacity }, g);
    return g;
  }
  function speedLinesG(w, h, o) {
    var g = svg("g", { class: "cb-speed" }), R = V.makeRand(num(o.seed, 5) + 17), inner = svg("g", null, g), d = "";
    for (var i = 0; i < 30; i++) {
      var y = R() * h, len = w * (0.2 + R() * 0.5), x = R() * w * 2 - w * 0.5, th = u(2 + R() * 6);
      d += "M" + P2(x, y) + "h" + f2(len) + "l" + P2(-len * 0.08, th) + "h" + f2(-len * 0.92) + "Z";
      d += "M" + P2(x + w * 2, y) + "h" + f2(len) + "l" + P2(-len * 0.08, th) + "h" + f2(-len * 0.92) + "Z";
    }
    svg("path", { d: d, fill: o.color || C.ink, opacity: o.opacity == null ? 0.8 : o.opacity }, inner);
    var sp = w * 0.9;
    st.anims.push(function (t) { inner.setAttribute("transform", "translate(" + f2(-mod(t * sp, w * 2)) + " 0)"); });
    return g;
  }
  function scene(panel, name, o) {
    var p = panelOf(panel);
    o = obj(o);
    name = bgName(name);
    var opts = { mood: moodOf(o.mood), pal: o.palette ? palOf(o.palette) : null, cx: o.cx, cy: o.cy, horizon: o.horizon, seed: hash(name + p.i) };
    var g = svg("g", { class: "cb-scene cb-scene-" + name }, p.bg);
    var R = V.makeRand(hash(name + ":" + p.i + ":" + st.pages.length) || 1);
    BGDRAW[name](g, p.w, p.h, opts, R);
    p.sceneName = name;
    p.mood = opts.mood;
    return g;
  }
  function focusLines(panel, o) {
    var p = panelOf(panel);
    o = obj(o);
    var at = num(o.at, 0), g = focusLinesG(p.w, p.h, { cx: num(o.cx, 0.5), cy: num(o.cy, 0.5), clear: num(o.clear, 0.34), color: o.color || C.ink, opacity: o.opacity, seed: p.i });
    p.bg.appendChild(g);
    var cx = p.w * num(o.cx, 0.5), cy = p.h * num(o.cy, 0.5);
    st.anims.push(function (t) {
      var on = t >= at;
      g.style.display = on ? "" : "none";
      if (!on) return;
      var k = lerp(1.6, 1, EASE.outCubic(prog(t, at, at + 0.3))), j = 1 + 0.012 * Math.sin(t * 23);
      g.setAttribute("transform", "translate(" + P2(cx, cy) + ") scale(" + f2(k * j * 1000) / 1000 + ") translate(" + P2(-cx, -cy) + ")");
    });
    return g;
  }
  function speedLines(panel, o) {
    var p = panelOf(panel);
    o = obj(o);
    var at = num(o.at, 0), g = speedLinesG(p.w, p.h, { color: o.color || C.ink, opacity: num(o.opacity, 0.55), seed: p.i });
    p.bg.appendChild(g);
    st.anims.push(function (t) { g.style.display = t >= at ? "" : "none"; });
    return g;
  }
  // Falling rain or snow over a panel (in front of the characters).
  function weather(panel, kind, o) {
    var p = panelOf(panel);
    o = obj(o);
    kind = str(kind).toLowerCase();
    if (kind !== "rain" && kind !== "snow") return null;
    var g = svg("g", { class: "cb-weather" }, p.fx), inner = svg("g", null, g), R = V.makeRand(91 + p.i), d = "", w = p.w, h = p.h;
    var n = Math.round((w * h) / (kind === "rain" ? 5200 : 9000)), tilt = kind === "rain" ? 0.22 : 0;
    for (var k = 0; k < 2; k++) for (var i = 0; i < n; i++) {
      var x = R() * (w * 1.3) - w * 0.15, y = R() * h - k * h;
      if (kind === "rain") { var L = u(26 + R() * 30); d += "M" + P2(x, y) + "l" + P2(-L * tilt, L); }
      else d += circD(x, y, u(2.5 + R() * 4));
    }
    svg("path", kind === "rain" ? { d: d, stroke: "#CFE6FF", "stroke-width": f2(u(3)), "stroke-linecap": "round", opacity: 0.75 } : { d: d, fill: "#FFFFFF", stroke: C.ink, "stroke-width": INKW(0.4) }, inner);
    var speed = kind === "rain" ? h * 1.4 : h * 0.16, at = num(o.at, 0);
    st.anims.push(function (t) {
      g.style.display = t >= at ? "" : "none";
      var y = mod(t * speed, h);
      inner.setAttribute("transform", "translate(" + f2(kind === "rain" ? -y * tilt : Math.sin(t * 0.9) * u(14)) + " " + f2(y) + ")");
    });
    return g;
  }

  // ------------------------- recurring cast -------------------------
  // Local units: feet at (0, 0), y down (head is negative), facing right. One rig for everyone.
  var BASE_RIG = { sh: [46, -412], hip: [22, -232], neckY: -430, head: [0, -500], hr: 60, up: 94, fo: 90, th: 118, sn: 114, aw: 30, lw: 36, top: -572, w: 150 };
  var CAST = {
    sam: { who: "Sam, everyday narrator in a blue hoodie", role: "the viewer's stand-in, asks questions, default narrator",
      rig: {}, skin: "#C98A5E", hair: "#2B1B12", top: "#2C6FD6", topD: "#1E4F9E", pants: "#33415E", shoe: "#FFFFFF", shoeD: "#E23B2E", sleeve: "long" },
    nova: { who: "Dr. Nova, scientist (lab coat, goggles, afro puff)", role: "explains science and tech, the expert",
      rig: { top: -600 }, skin: "#7A4A2E", hair: "#1B120C", top: "#FFFFFF", topD: "#D5DEE8", under: "#7B3FB8", pants: "#2E2A40", shoe: "#15110E", shoeD: "#3A3550", sleeve: "long" },
    pip: { who: "Pip, kid sidekick (backwards red cap)", role: "curiosity, excitement, wow reactions",
      rig: { sh: [38, -300], hip: [18, -166], neckY: -314, head: [0, -384], hr: 64, up: 66, fo: 62, th: 84, sn: 80, aw: 26, lw: 30, top: -460, w: 130 },
      skin: "#F2C9A0", hair: "#E0702A", top: "#FFD23F", topD: "#E0A800", pants: "#2C6FD6", shoe: "#E23B2E", shoeD: "#FFFFFF", sleeve: "short", shortsLegs: true },
    vex: { who: "Baron Vex, caped villain with a monocle", role: "problems, threats, myths, the antagonist",
      rig: { sh: [44, -440], hip: [20, -250], neckY: -458, head: [0, -528], hr: 58, up: 100, fo: 96, th: 126, sn: 122, top: -598, w: 160 },
      skin: "#E9D6C0", hair: "#15110E", top: "#5B2A86", topD: "#3E1A60", pants: "#3E1A60", shoe: "#15110E", shoeD: "#3A2A4A", sleeve: "long", glove: "#FFFFFF", cape: "#221A2C", lining: "#E23B2E" },
    bolt: { who: "Bolt, friendly robot", role: "AI, machines, computers, data",
      rig: { sh: [54, -398], hip: [26, -228], neckY: -418, head: [0, -496], hr: 64, up: 92, fo: 86, th: 114, sn: 110, aw: 26, lw: 32, top: -600, w: 160 },
      skin: "#B8C4D0", hair: "#8C9AA8", top: "#B8C4D0", topD: "#8C9AA8", pants: "#9AA8B6", shoe: "#5C6E80", shoeD: "#3E4C5A", sleeve: "long", robot: true, glove: "#9AA8B6" },
    ace: { who: "Captain Ace, caped hero", role: "the solution, triumph, covers, motivation",
      rig: { sh: [52, -420], hip: [21, -236], neckY: -436, head: [0, -506], hr: 60, top: -580, w: 165 },
      skin: "#F0C39A", hair: "#16110D", top: "#2C6FD6", topD: "#1E4F9E", pants: "#2C6FD6", shoe: "#E23B2E", shoeD: "#9C1F16", sleeve: "long", cape: "#E23B2E", lining: "#9C1F16", boots: true },
  };
  var CAST_IDS = Object.keys(CAST);
  // Pose: hands and feet as [dx, dy] from the shoulder or hip in units of the limb reach (dx > 0 = outward
  // for that side; the R side is the forward side), elbow bend sign, torso lean (deg), head tilt (deg).
  var POSE = {
    stand: { R: [0.16, 0.92], L: [0.16, 0.92], FR: [0.12, 0.99], FL: [0.12, 0.99] },
    point: { R: [0.99, 0.02], L: [0.16, 0.92], FR: [0.14, 0.99], FL: [0.12, 0.99], lean: 3, hand: "point" },
    explain: { R: [0.5, -0.12, -1], L: [0.16, 0.92], FR: [0.12, 0.99], FL: [0.12, 0.99], tilt: -3, hand: "open" },
    present: { R: [0.82, 0.32, -1], L: [0.16, 0.92], FR: [0.14, 0.99], FL: [0.12, 0.99], tilt: -4, hand: "open" },
    wave: { R: [0.5, -0.72, -1], L: [0.16, 0.92], FR: [0.12, 0.99], FL: [0.12, 0.99], tilt: -4, wave: 1, hand: "open" },
    think: { R: [-0.22, -0.26, 1], L: [0.16, 0.92], FR: [0.12, 0.99], FL: [0.12, 0.99], tilt: 6, hand: "fist" },
    cheer: { R: [0.42, -0.86, -1], L: [0.42, -0.86, -1], FR: [0.24, 0.97], FL: [0.24, 0.97], tilt: -2, hand: "fist", hop: 1 },
    shock: { R: [0.62, -0.36, -1], L: [0.62, -0.36, -1], FR: [0.2, 0.98], FL: [0.2, 0.98], lean: -5, hand: "open" },
    fist: { R: [0.2, -0.95, -1], L: [0.16, 0.92], FR: [0.2, 0.98], FL: [0.14, 0.99], hand: "fist" },
    hips: { R: [0.04, 0.74, 1], L: [0.04, 0.74, 1], FR: [0.3, 0.95], FL: [0.3, 0.95], hand: "fist" },
    shrug: { R: [0.72, 0.1, -1], L: [0.72, 0.1, -1], FR: [0.14, 0.99], FL: [0.14, 0.99], tilt: 8, hand: "open" },
    crossed: { R: [-0.5, 0.42, 1], L: [-0.5, 0.36, 1], FR: [0.16, 0.99], FL: [0.16, 0.99], front: 1, hand: "fist" },
    run: { R: [0.52, 0.28, -1], L: [0.5, 0.5, 1], FR: [0.5, 0.72], FL: [0.5, 0.86], lean: 12, hand: "fist", knee: 1 },
    fight: { R: [0.66, 0.06, -1], L: [-0.38, 0.12, 1], FR: [0.4, 0.92], FL: [0.36, 0.93], lean: 5, hand: "fist" },
  };
  var POSE_IDS = Object.keys(POSE);
  var EXPR = {
    neutral: { eye: "dot", brow: [0, 0, 0], m: { w: 0.36, c: 0.06, o: 0 } },
    happy: { eye: "dot", brow: [-8, -8, -0.04], m: { w: 0.5, c: 0.22, o: 0.22 }, blush: 1 },
    grin: { eye: "happy", brow: [-10, -10, -0.06], m: { w: 0.66, c: 0.24, o: 0.55, teeth: 1 }, blush: 1 },
    shock: { eye: "wide", brow: [-14, -14, -0.16], m: { w: 0.26, o: 0.9, round: 1 }, sweat: 1 },
    angry: { eye: "dot", lid: 1, brow: [26, 26, 0.04], m: { w: 0.5, c: -0.12, o: 0.38, teeth: 1 }, vein: 1 },
    sad: { eye: "dot", brow: [-20, -20, -0.02], m: { w: 0.34, c: -0.18, o: 0 }, tear: 1 },
    smirk: { eye: "dot", lid: 1, brow: [6, -14, -0.02], m: { w: 0.42, c: 0.14, o: 0, asym: 0.7 } },
    think: { eye: "dot", look: [0.05, -0.07], brow: [4, -16, -0.03], m: { w: 0.22, c: -0.04, o: 0, dx: 0.12 } },
    determined: { eye: "dot", lid: 1, brow: [16, 16, 0.03], m: { w: 0.44, c: -0.03, o: 0 } },
    scared: { eye: "wide", small: 1, brow: [-22, -22, -0.1], m: { w: 0.42, c: -0.1, o: 0.42, wavy: 1 }, sweat: 1 },
  };
  var EXPR_IDS = Object.keys(EXPR);
  function castName(n) { n = str(n).toLowerCase(); return CAST[n] ? n : null; }
  function poseName(n) { n = str(n).toLowerCase(); return POSE[n] ? n : "stand"; }
  function exprName(n) { n = str(n).toLowerCase(); return EXPR[n] ? n : "neutral"; }
  function rigOf(name) { return Object.assign({}, BASE_RIG, CAST[name].rig); }
  // Two-bone IK: from S toward target T, lengths a, b; bend = +1 / -1 picks the elbow side.
  function ik(S2, T, a, b, bend) {
    var dx = T[0] - S2[0], dy = T[1] - S2[1], d = Math.sqrt(dx * dx + dy * dy), mx = (a + b) * 0.995;
    if (d > mx) { dx *= mx / d; dy *= mx / d; d = mx; }
    if (d < Math.abs(a - b) + 1) d = Math.abs(a - b) + 1;
    var base = Math.atan2(dy, dx), k = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), off = Math.acos(k) * (bend || 1);
    var E = [S2[0] + Math.cos(base + off) * a, S2[1] + Math.sin(base + off) * a];
    return [E, [S2[0] + dx, S2[1] + dy]];
  }
  function talkAmt(ranges, t) {
    for (var i = 0; i < ranges.length; i++) {
      var r = ranges[i];
      if (t < r[0] || t > r[1]) continue;
      var wi = wordAt(t);
      if (wi >= 0) {
        var w = V.words[wi];
        if (t <= w.end + 0.03 && w.start >= r[0] - 0.4) {
          var q = clamp((t - w.start) / Math.max(0.06, w.end - w.start), 0, 1), sy = syllables(w.word);
          return Math.pow(Math.abs(Math.sin(PI * q * sy)), 0.7) * (0.75 + 0.25 * Math.sin(t * 13 + wi));
        }
        if (V.words.length) return 0.05;
      }
      return 0.35 + 0.35 * Math.sin(t * 19) * Math.sin(t * 7.3);
    }
    return 0;
  }
  function limbPaths(g, color, width, ink) {
    return {
      o: svg("path", { fill: "none", stroke: C.ink, "stroke-width": f2(width + ink * 2), "stroke-linecap": "round", "stroke-linejoin": "round" }, g),
      f: svg("path", { fill: "none", stroke: color, "stroke-width": f2(width), "stroke-linecap": "round", "stroke-linejoin": "round" }, g),
    };
  }
  function seg3(a, b, c2) { return "M" + P2(a[0], a[1]) + "L" + P2(b[0], b[1]) + "L" + P2(c2[0], c2[1]); }

  // Static body parts per character (torso group, local coords).
  function drawTorso(name, g, M, cs) {
    var I = 5, sh = M.sh, hp = M.hip, sx = sh[0] + 12, top = sh[1] - 6, hx = hp[0] + 22, by = hp[1] + 14;
    var tor = function (fill, extra) { return svg("path", Object.assign({ d: "M" + P2(-sx, top + 14) + "Q" + P2(-sx, top) + " " + P2(-sx + 16, top) + "H" + f2(sx - 16) + "Q" + P2(sx, top) + " " + P2(sx, top + 14) + "L" + P2(hx, by) + "H" + f2(-hx) + "Z", fill: fill, stroke: C.ink, "stroke-width": I, "stroke-linejoin": "round" }, extra || {}), g); };
    if (name === "sam") {
      tor(cs.top);
      svg("path", { d: "M" + P2(sx - 18, top + 10) + "L" + P2(hx - 6, by - 4) + "H" + f2(hx - 26) + "L" + P2(sx - 36, top + 14) + "Z", fill: cs.topD }, g);
      svg("path", { d: "M" + P2(-hx + 10, by - 50) + "H" + f2(hx - 10) + "L" + P2(hx - 18, by - 8) + "H" + f2(-hx + 18) + "Z", fill: "none", stroke: C.ink, "stroke-width": 3.5 }, g);
      svg("path", { d: "M" + P2(-26, top - 4) + "Q" + P2(0, top + 30) + " " + P2(26, top - 4), fill: cs.topD, stroke: C.ink, "stroke-width": I }, g);
      svg("path", { d: "M-10 " + f2(top + 14) + "v44M10 " + f2(top + 14) + "v40", stroke: C.ink, "stroke-width": 7, "stroke-linecap": "round" }, g);
      svg("path", { d: "M-10 " + f2(top + 14) + "v44M10 " + f2(top + 14) + "v40", stroke: "#FFFFFF", "stroke-width": 3, "stroke-linecap": "round" }, g);
    } else if (name === "nova") {
      tor(cs.under);
      var cb = hp[1] + 120;
      svg("path", { d: "M" + P2(-sx, top + 14) + "Q" + P2(-sx, top) + " " + P2(-sx + 16, top) + "H-14L-6 " + f2(by + 10) + "L-18 " + f2(cb) + "H" + f2(-hx - 26) + "Z", fill: cs.top, stroke: C.ink, "stroke-width": I, "stroke-linejoin": "round" }, g);
      svg("path", { d: "M" + P2(sx, top + 14) + "Q" + P2(sx, top) + " " + P2(sx - 16, top) + "H14L8 " + f2(by + 10) + "L20 " + f2(cb) + "H" + f2(hx + 26) + "Z", fill: cs.top, stroke: C.ink, "stroke-width": I, "stroke-linejoin": "round" }, g);
      svg("path", { d: "M" + P2(sx - 20, top + 16) + "L" + P2(hx + 18, cb - 4) + "H" + f2(hx) + "L" + P2(sx - 38, top + 20) + "Z", fill: cs.topD }, g);
      svg("path", { d: "M-14 " + f2(top) + "L-30 " + f2(top + 60) + "L-12 " + f2(top + 50) + "M14 " + f2(top) + "L30 " + f2(top + 60) + "L12 " + f2(top + 50), fill: "none", stroke: C.ink, "stroke-width": 4, "stroke-linejoin": "round" }, g);
      svg("rect", { x: f2(sx - 44), y: f2(top + 70), width: 26, height: 30, fill: cs.top, stroke: C.ink, "stroke-width": 3.5 }, g);
      svg("path", { d: "M" + P2(sx - 38, top + 58) + "v16M" + P2(sx - 26, top + 54) + "v20", stroke: "#E23B2E", "stroke-width": 5, "stroke-linecap": "round" }, g);
    } else if (name === "pip") {
      tor(cs.top);
      svg("path", { d: "M" + P2(sx - 14, top + 10) + "L" + P2(hx - 6, by - 4) + "H" + f2(hx - 20) + "L" + P2(sx - 30, top + 14) + "Z", fill: cs.topD }, g);
      svg("path", { d: polyD(starPts(0, (top + by) / 2 - 4, 22, 9, 5)), fill: C.red, stroke: C.ink, "stroke-width": 3.5, "stroke-linejoin": "round" }, g);
      svg("path", { d: "M" + P2(-hx - 2, by - 14) + "H" + f2(hx + 2) + "L" + P2(hx + 6, by + 30) + "H" + f2(-hx - 6) + "Z", fill: cs.pants, stroke: C.ink, "stroke-width": I, "stroke-linejoin": "round" }, g);
      svg("path", { d: "M" + P2(-18, top + 2) + "Q0 " + f2(top + 18) + " 18 " + f2(top + 2), fill: "none", stroke: C.ink, "stroke-width": 4 }, g);
    } else if (name === "vex") {
      var tb = hp[1] + 70;
      svg("path", { d: "M" + P2(-sx, top + 14) + "Q" + P2(-sx, top) + " " + P2(-sx + 16, top) + "H" + f2(sx - 16) + "Q" + P2(sx, top) + " " + P2(sx, top + 14) + "L" + P2(hx + 12, tb) + "L" + P2(4, tb - 24) + "L" + P2(-hx - 12, tb) + "Z", fill: cs.top, stroke: C.ink, "stroke-width": I, "stroke-linejoin": "round" }, g);
      svg("path", { d: "M" + P2(sx - 18, top + 12) + "L" + P2(hx + 8, tb - 6) + "L" + P2(hx - 8, tb - 14) + "L" + P2(sx - 34, top + 16) + "Z", fill: cs.topD }, g);
      svg("path", { d: "M-16 " + f2(top) + "L0 " + f2(top + 70) + "L16 " + f2(top) + "Z", fill: "#FFFFFF", stroke: C.ink, "stroke-width": 4, "stroke-linejoin": "round" }, g);
      svg("path", { d: "M-7 " + f2(top + 10) + "L0 " + f2(top + 22) + "L7 " + f2(top + 10) + "L0 " + f2(top + 60) + "Z", fill: C.red, stroke: C.ink, "stroke-width": 3 }, g);
      [top + 82, top + 112].forEach(function (y) { svg("circle", { cx: 0, cy: f2(y), r: 5, fill: "#FFD23F", stroke: C.ink, "stroke-width": 2.5 }, g); });
    } else if (name === "bolt") {
      svg("rect", { x: f2(-sx), y: f2(top), width: f2(sx * 2), height: f2(by - top), rx: 18, fill: cs.top, stroke: C.ink, "stroke-width": I }, g);
      svg("rect", { x: f2(sx - 30), y: f2(top + 8), width: 20, height: f2(by - top - 16), rx: 8, fill: cs.topD }, g);
      svg("rect", { x: -42, y: f2(top + 34), width: 84, height: 66, rx: 10, fill: "#1D2633", stroke: C.ink, "stroke-width": 4 }, g);
      svg("circle", { cx: -20, cy: f2(top + 67), r: 11, fill: "#FFD23F", stroke: C.ink, "stroke-width": 3, class: "cb-bolt-light" }, g);
      svg("rect", { x: 2, y: f2(top + 54), width: 30, height: 9, rx: 3, fill: "#5FE3FF" }, g);
      svg("rect", { x: 2, y: f2(top + 70), width: 22, height: 9, rx: 3, fill: "#E23B2E" }, g);
      svg("path", { d: "M" + P2(-sx + 14, by - 26) + "H" + f2(sx - 14), stroke: C.ink, "stroke-width": 4 }, g);
    } else if (name === "ace") {
      svg("path", { d: "M" + P2(-sx - 6, top + 14) + "Q" + P2(-sx - 6, top) + " " + P2(-sx + 12, top) + "H" + f2(sx - 12) + "Q" + P2(sx + 6, top) + " " + P2(sx + 6, top + 14) + "L" + P2(hx - 2, by) + "H" + f2(-hx + 2) + "Z", fill: cs.top, stroke: C.ink, "stroke-width": I, "stroke-linejoin": "round" }, g);
      svg("path", { d: "M" + P2(sx - 14, top + 12) + "L" + P2(hx - 6, by - 4) + "H" + f2(hx - 22) + "L" + P2(sx - 32, top + 16) + "Z", fill: cs.topD }, g);
      var ey = top + 66;
      svg("path", { d: "M0 " + f2(ey - 38) + "L36 " + f2(ey) + "L0 " + f2(ey + 38) + "L-36 " + f2(ey) + "Z", fill: "#FFD23F", stroke: C.ink, "stroke-width": 4, "stroke-linejoin": "round" }, g);
      svg("path", { d: "M6 " + f2(ey - 26) + "L-12 " + f2(ey + 4) + "H2L-6 " + f2(ey + 28) + "L14 " + f2(ey - 4) + "H0Z", fill: C.red, stroke: C.ink, "stroke-width": 2.5, "stroke-linejoin": "round" }, g);
      svg("rect", { x: f2(-hx - 2), y: f2(by - 22), width: f2(hx * 2 + 4), height: 16, fill: "#FFD23F", stroke: C.ink, "stroke-width": 4 }, g);
      svg("path", { d: "M" + P2(-hx - 2, by - 6) + "H" + f2(hx + 2) + "L" + P2(hx + 6, by + 26) + "Q0 " + f2(by + 12) + " " + P2(-hx - 6, by + 26) + "Z", fill: C.red, stroke: C.ink, "stroke-width": I, "stroke-linejoin": "round" }, g);
    }
  }
  function drawCape(name, g, M, cs) {
    if (!cs.cape) return null;
    var sh = M.sh, top = sh[1] - 4, bot = name === "vex" ? -30 : -70, sx = sh[0] + 14;
    var cape = svg("path", { fill: cs.cape, stroke: C.ink, "stroke-width": 5, "stroke-linejoin": "round" }, g);
    var lin = svg("path", { fill: cs.lining, stroke: C.ink, "stroke-width": 4, "stroke-linejoin": "round" }, g);
    return function (t, sway) {
      var s1 = Math.sin(t * 3.1) * 10 + sway, s2 = Math.sin(t * 3.1 + 1.3) * 12 + sway;
      cape.setAttribute("d", "M" + P2(-sx, top) + "Q" + P2(-sx - 60, (top + bot) / 2) + " " + P2(-sx - 90 + s1, bot) + "Q" + P2(-30, bot + 18 + s2 * 0.3) + " " + P2(20, bot + 6) + "Q" + P2(sx + 40, (top + bot) / 2 + 40) + " " + P2(sx, top) + "Z");
      lin.setAttribute("d", "M" + P2(-sx - 80 + s1 * 0.9, bot - 20) + "Q" + P2(-sx - 70 + s1 * 0.5, bot + 4) + " " + P2(-sx - 90 + s1, bot) + "Q" + P2(-60, bot + 14 + s2 * 0.3) + " " + P2(-10, bot + 12) + "Q" + P2(-50, bot - 4) + " " + P2(-sx - 80 + s1 * 0.9, bot - 20) + "Z");
    };
  }
  // Head: static parts plus a face updater. Head group is centred on the head centre.
  function drawHead(name, g, M, cs) {
    var r = M.hr, I = 5, face = {};
    var hairB = svg("g", null, g), headG = svg("g", null, g);
    if (name === "bolt") {
      svg("path", { d: "M0 " + f2(-r * 0.95) + "V" + f2(-r * 1.5), stroke: C.ink, "stroke-width": 6 }, headG);
      svg("circle", { cx: 0, cy: f2(-r * 1.55), r: 11, fill: C.red, stroke: C.ink, "stroke-width": 4, class: "cb-antenna" }, headG);
      svg("rect", { x: f2(-r * 1.18), y: f2(-r * 0.25), width: 16, height: f2(r * 0.5), rx: 5, fill: "#8C9AA8", stroke: C.ink, "stroke-width": 4 }, headG);
      svg("rect", { x: f2(r * 1.18 - 16), y: f2(-r * 0.25), width: 16, height: f2(r * 0.5), rx: 5, fill: "#8C9AA8", stroke: C.ink, "stroke-width": 4 }, headG);
      svg("rect", { x: f2(-r * 1.05), y: f2(-r * 0.95), width: f2(r * 2.1), height: f2(r * 1.85), rx: 22, fill: cs.skin, stroke: C.ink, "stroke-width": I }, headG);
      svg("rect", { x: f2(r * 0.62), y: f2(-r * 0.85), width: 18, height: f2(r * 1.65), rx: 8, fill: cs.hair }, headG);
      svg("rect", { x: f2(-r * 0.86), y: f2(-r * 0.72), width: f2(r * 1.72), height: f2(r * 1.36), rx: 16, fill: "#1D2633", stroke: C.ink, "stroke-width": 4 }, headG);
      face.screen = true;
    } else {
      var hx = name === "ace" ? r * 0.9 : r * 0.92;
      svg("path", { d: ellD(-hx + 2, 4, r * 0.18, r * 0.26), fill: cs.skin, stroke: C.ink, "stroke-width": I }, headG);
      svg("path", { d: ellD(hx - 2, 4, r * 0.18, r * 0.26), fill: cs.skin, stroke: C.ink, "stroke-width": I }, headG);
      if (name === "nova") svg("circle", { cx: f2(-r * 0.15), cy: f2(-r * 1.2), r: f2(r * 0.72), fill: cs.hair, stroke: C.ink, "stroke-width": I }, hairB);
      if (name === "ace") svg("path", { d: "M" + P2(-hx, -r * 0.3) + "Q" + P2(-hx, -r) + " 0 " + f2(-r) + "Q" + P2(hx, -r) + " " + P2(hx, -r * 0.3) + "L" + P2(hx * 0.95, r * 0.55) + "Q" + P2(hx * 0.6, r * 1.02) + " 0 " + f2(r * 1.02) + "Q" + P2(-hx * 0.6, r * 1.02) + " " + P2(-hx * 0.95, r * 0.55) + "Z", fill: cs.skin, stroke: C.ink, "stroke-width": I, "stroke-linejoin": "round" }, headG);
      else svg("path", { d: ellD(0, 0, hx, r), fill: cs.skin, stroke: C.ink, "stroke-width": I }, headG);
      svg("path", { d: "M" + P2(hx * 0.55, -r * 0.7) + "Q" + P2(hx * 1.05, -r * 0.1) + " " + P2(hx * 0.6, r * 0.75) + "Q" + P2(hx * 0.92, 0) + " " + P2(hx * 0.55, -r * 0.7) + "Z", fill: dark(cs.skin, 0.14) }, headG);
      // hair (front)
      if (name === "sam") svg("path", { d: "M" + P2(-hx - 2, -r * 0.05) + "Q" + P2(-hx - 6, -r * 1.05) + " " + P2(-r * 0.1, -r * 1.08) + "L" + P2(r * 0.2, -r * 1.32) + "L" + P2(r * 0.34, -r * 1.02) + "Q" + P2(hx + 6, -r * 0.95) + " " + P2(hx + 2, -r * 0.1) + "Q" + P2(hx * 0.8, -r * 0.55) + " " + P2(r * 0.3, -r * 0.62) + "Q" + P2(-r * 0.2, -r * 0.5) + " " + P2(-r * 0.5, -r * 0.7) + "Q" + P2(-hx * 0.85, -r * 0.45) + " " + P2(-hx - 2, -r * 0.05) + "Z", fill: cs.hair, stroke: C.ink, "stroke-width": I, "stroke-linejoin": "round" }, headG);
      if (name === "nova") {
        svg("path", { d: "M" + P2(-hx - 4, -r * 0.05) + "Q" + P2(-hx - 8, -r * 1.1) + " 0 " + f2(-r * 1.1) + "Q" + P2(hx + 8, -r * 1.1) + " " + P2(hx + 4, -r * 0.05) + "Q" + P2(hx * 0.7, -r * 0.62) + " 0 " + f2(-r * 0.66) + "Q" + P2(-hx * 0.7, -r * 0.62) + " " + P2(-hx - 4, -r * 0.05) + "Z", fill: cs.hair, stroke: C.ink, "stroke-width": I }, headG);
        svg("path", { d: "M" + P2(-hx - 2, -r * 0.62) + "Q0 " + f2(-r * 0.78) + " " + P2(hx + 2, -r * 0.62), fill: "none", stroke: "#3A3550", "stroke-width": 12, "stroke-linecap": "round" }, headG);
        [-1, 1].forEach(function (k) {
          svg("circle", { cx: f2(k * r * 0.36), cy: f2(-r * 0.7), r: f2(r * 0.24), fill: "#FFD23F", stroke: C.ink, "stroke-width": I }, headG);
          svg("circle", { cx: f2(k * r * 0.36 - 5), cy: f2(-r * 0.76), r: 5, fill: "#FFFFFF" }, headG);
        });
      }
      if (name === "pip") {
        svg("path", { d: "M" + P2(-hx - 2, -r * 0.2) + "L" + P2(-hx - 14, -r * 0.05) + "L" + P2(-hx - 2, r * 0.12) + "Z M" + P2(hx + 2, -r * 0.2) + "L" + P2(hx + 14, -r * 0.02) + "L" + P2(hx, r * 0.12) + "Z", fill: cs.hair, stroke: C.ink, "stroke-width": 4, "stroke-linejoin": "round" }, headG);
        svg("path", { d: "M" + P2(-hx - 4, -r * 0.25) + "Q" + P2(-hx - 4, -r * 1.12) + " 0 " + f2(-r * 1.12) + "Q" + P2(hx + 4, -r * 1.12) + " " + P2(hx + 4, -r * 0.25) + "Z", fill: C.red, stroke: C.ink, "stroke-width": I, "stroke-linejoin": "round" }, headG);
        svg("path", { d: "M" + P2(-hx + 6, -r * 0.3) + "Q" + P2(-hx - r * 0.5, -r * 0.42) + " " + P2(-hx - r * 0.72, -r * 0.18) + "Q" + P2(-hx - r * 0.3, -r * 0.05) + " " + P2(-hx + 4, -r * 0.18) + "Z", fill: "#B02A20", stroke: C.ink, "stroke-width": I, "stroke-linejoin": "round" }, headG);
        svg("circle", { cx: 0, cy: f2(-r * 1.12), r: 7, fill: C.red, stroke: C.ink, "stroke-width": 3.5 }, headG);
        svg("path", { d: "M" + P2(r * 0.15, -r * 0.3) + "Q" + P2(r * 0.4, -r * 0.5) + " " + P2(r * 0.65, -r * 0.3), fill: "none", stroke: C.ink, "stroke-width": 3 }, headG);
        var fr = "";
        [[-0.42, 0.22], [-0.32, 0.3], [-0.5, 0.32], [0.48, 0.22], [0.58, 0.3], [0.4, 0.32]].forEach(function (q) { fr += circD(q[0] * r + r * 0.1, q[1] * r, 2.6); });
        svg("path", { d: fr, fill: "#B5652E" }, headG);
      }
      if (name === "vex") {
        svg("path", { d: "M" + P2(-hx - 2, -r * 0.1) + "Q" + P2(-hx - 4, -r * 1.05) + " " + P2(0, -r * 1.06) + "Q" + P2(hx + 4, -r * 1.05) + " " + P2(hx + 2, -r * 0.1) + "Q" + P2(hx * 0.85, -r * 0.6) + " " + P2(r * 0.2, -r * 0.66) + "L" + P2(r * 0.05, -r * 0.36) + "L" + P2(-r * 0.12, -r * 0.66) + "Q" + P2(-hx * 0.85, -r * 0.6) + " " + P2(-hx - 2, -r * 0.1) + "Z", fill: cs.hair, stroke: C.ink, "stroke-width": I, "stroke-linejoin": "round" }, headG);
        svg("path", { d: "M" + P2(r * 0.08, r * 0.36) + "Q" + P2(-r * 0.25, r * 0.3) + " " + P2(-r * 0.36, r * 0.42) + "Q" + P2(-r * 0.46, r * 0.5) + " " + P2(-r * 0.4, r * 0.28) + " M" + P2(r * 0.16, r * 0.36) + "Q" + P2(r * 0.48, r * 0.3) + " " + P2(r * 0.6, r * 0.42) + "Q" + P2(r * 0.7, r * 0.5) + " " + P2(r * 0.64, r * 0.28), fill: "none", stroke: C.ink, "stroke-width": 5, "stroke-linecap": "round" }, headG);
      }
      if (name === "ace") {
        svg("path", { d: "M" + P2(-hx - 2, -r * 0.15) + "Q" + P2(-hx - 4, -r * 1.12) + " " + P2(0, -r * 1.12) + "Q" + P2(hx + 6, -r * 1.12) + " " + P2(hx + 2, -r * 0.2) + "Q" + P2(hx * 0.8, -r * 0.72) + " " + P2(0, -r * 0.7) + "Q" + P2(-hx * 0.8, -r * 0.68) + " " + P2(-hx - 2, -r * 0.15) + "Z", fill: cs.hair, stroke: C.ink, "stroke-width": I, "stroke-linejoin": "round" }, headG);
        svg("path", { d: "M" + P2(r * 0.15, -r * 0.72) + "Q" + P2(r * 0.42, -r * 0.5) + " " + P2(r * 0.18, -r * 0.36) + "Q" + P2(r * 0.3, -r * 0.5) + " " + P2(r * 0.15, -r * 0.72) + "Z", fill: cs.hair, stroke: C.ink, "stroke-width": 3.5 }, headG);
        svg("path", { d: "M" + P2(r * 0.12, r * 0.86) + "v" + f2(r * 0.12), stroke: C.ink, "stroke-width": 3, "stroke-linecap": "round" }, headG);
      }
    }
    // face (eyes, brows, mouth, extras) shifted toward the facing side
    var fg = svg("g", { transform: "translate(" + f2(r * 0.1) + " 0)" }, g);
    face.g = fg;
    face.r = r;
    var ec = face.screen ? "#5FE3FF" : C.ink;
    face.eyes = [-1, 1].map(function (k) {
      var eg = svg("g", null, fg);
      return {
        g: eg, k: k,
        dot: svg("path", { d: ellD(0, 0, r * 0.11, r * 0.15), fill: ec }, eg),
        glint: svg("circle", { cx: f2(-r * 0.03), cy: f2(-r * 0.06), r: f2(r * 0.04), fill: face.screen ? "#D8FAFF" : "#FFFFFF" }, eg),
        white: svg("path", { d: ellD(0, 0, r * 0.19, r * 0.21), fill: face.screen ? "#1D2633" : "#FFFFFF", stroke: ec, "stroke-width": 4 }, eg),
        pupil: svg("circle", { cx: 0, cy: 0, r: f2(r * 0.08), fill: ec }, eg),
        arc: svg("path", { d: "M" + P2(-r * 0.15, r * 0.04) + "Q0 " + f2(-r * 0.2) + " " + P2(r * 0.15, r * 0.04), fill: "none", stroke: ec, "stroke-width": face.screen ? 7 : 5.5, "stroke-linecap": "round" }, eg),
        lid: svg("path", { d: "M" + P2(-r * 0.17, -r * 0.07) + "H" + f2(r * 0.17), stroke: face.screen ? "#1D2633" : cs.skin, "stroke-width": f2(r * 0.16) }, eg),
        lidLine: svg("path", { d: "M" + P2(-r * 0.16, -r * 0.0) + "H" + f2(r * 0.16), stroke: ec, "stroke-width": 4, "stroke-linecap": "round" }, eg),
      };
    });
    face.brows = [-1, 1].map(function () { return svg("path", { fill: "none", stroke: face.screen ? "#5FE3FF" : C.ink, "stroke-width": face.screen ? 6 : 7, "stroke-linecap": "round" }, fg); });
    if (name === "vex") face.mono = svg("g", null, fg);
    if (!face.screen) {
      svg("path", { d: "M" + P2(r * 0.02, r * 0.08) + "Q" + P2(r * 0.14, r * 0.24) + " " + P2(-r * 0.02, r * 0.27), fill: "none", stroke: C.ink, "stroke-width": 3.5, "stroke-linecap": "round" }, fg);
      face.blush = svg("path", { d: ellD(-r * 0.5, r * 0.3, r * 0.14, r * 0.08) + ellD(r * 0.5, r * 0.3, r * 0.14, r * 0.08), fill: "#F07A8A", opacity: 0.55 }, fg);
    } else {
      face.blush = svg("path", { d: ellD(-r * 0.55, r * 0.28, r * 0.12, r * 0.06) + ellD(r * 0.55, r * 0.28, r * 0.12, r * 0.06), fill: "#F06EAA", opacity: 0.7 }, fg);
    }
    var mcid = uid("mc"), mcp = svg("clipPath", { id: mcid }, st.defs);
    face.mclip = svg("path", null, mcp);
    var mg = svg("g", { transform: "translate(0 " + f2(r * 0.5) + ")" }, fg);
    face.mFill = svg("path", { fill: face.screen ? "#0E1620" : "#6B1A14" }, mg);
    var inner = svg("g", { "clip-path": "url(#" + mcid + ")" }, mg);
    face.teeth = svg("rect", { x: f2(-r), width: f2(r * 2), fill: "#FFFFFF" }, inner);
    face.tongue = svg("ellipse", { cx: 0, rx: f2(r * 0.2), ry: f2(r * 0.12), fill: "#E86A6A" }, inner);
    face.mLine = svg("path", { fill: "none", stroke: face.screen ? "#5FE3FF" : C.ink, "stroke-width": face.screen ? 5 : 4.5, "stroke-linecap": "round", "stroke-linejoin": "round" }, mg);
    if (face.screen) face.eq = [0, 1, 2, 3, 4].map(function (i) { return svg("rect", { x: f2(-r * 0.4 + i * r * 0.17), width: f2(r * 0.11), rx: 3, fill: "#5FE3FF" }, mg); });
    face.sweat = svg("path", { d: "M" + P2(r * 0.86, -r * 0.72) + "q" + P2(-r * 0.12, r * 0.2) + " 0 " + f2(r * 0.26) + "q" + P2(r * 0.12, -r * 0.06) + " 0 " + f2(-r * 0.26) + "Z M" + P2(r * 1.02, -r * 0.4) + "q" + P2(-r * 0.08, r * 0.14) + " 0 " + f2(r * 0.18) + "q" + P2(r * 0.08, -r * 0.04) + " 0 " + f2(-r * 0.18) + "Z", fill: "#8FD3F5", stroke: C.ink, "stroke-width": 3 }, g);
    face.vein = svg("path", { d: "M" + P2(r * 0.5, -r * 0.9) + "l" + P2(r * 0.08, r * 0.12) + "l" + P2(r * 0.12, -r * 0.08) + "M" + P2(r * 0.76, -r * 0.86) + "l" + P2(-r * 0.08, r * 0.12) + "l" + P2(r * 0.1, r * 0.1) + "M" + P2(r * 0.52, -r * 0.6) + "l" + P2(r * 0.1, -r * 0.1) + "l" + P2(r * 0.1, r * 0.08), fill: "none", stroke: C.red, "stroke-width": 5.5, "stroke-linecap": "round" }, g);
    face.tear = svg("path", { d: "M" + P2(-r * 0.24, r * 0.12) + "q" + P2(-r * 0.08, r * 0.16) + " 0 " + f2(r * 0.2) + "q" + P2(r * 0.08, -r * 0.04) + " 0 " + f2(-r * 0.2) + "Z", fill: "#8FD3F5", stroke: C.ink, "stroke-width": 2.5 }, fg);
    if (name === "vex") {
      svg("circle", { cx: f2(r * 0.36), cy: f2(-r * 0.04), r: f2(r * 0.26), fill: "#CFEFFF", opacity: 0.35, class: "cb-mono" }, face.mono);
      svg("circle", { cx: f2(r * 0.36), cy: f2(-r * 0.04), r: f2(r * 0.26), fill: "none", stroke: "#E0B13A", "stroke-width": 6, class: "cb-mono" }, face.mono);
      svg("circle", { cx: f2(r * 0.36), cy: f2(-r * 0.04), r: f2(r * 0.26), fill: "none", stroke: C.ink, "stroke-width": 2.5 }, face.mono);
      svg("path", { d: "M" + P2(r * 0.55, r * 0.14) + "Q" + P2(r * 0.7, r * 0.6) + " " + P2(r * 0.42, r * 0.95), fill: "none", stroke: "#E0B13A", "stroke-width": 3, class: "cb-mono" }, face.mono);
    }
    return face;
  }
  function updateFace(face, ex, talk, blink, t) {
    var r = face.r, E = EXPR[ex] || EXPR.neutral, m = E.m, scr = face.screen;
    face.eyes.forEach(function (e) {
      var x = e.k * r * 0.34, y = -r * 0.04, look = E.look || [0, 0];
      e.g.setAttribute("transform", "translate(" + P2(x, y) + ")");
      var type = E.eye, isDot = type === "dot";
      var sy = isDot ? (blink ? 0.12 : 1) : 1;
      e.dot.style.display = e.glint.style.display = isDot ? "" : "none";
      e.dot.setAttribute("transform", "translate(" + P2(look[0] * r, look[1] * r) + ") scale(1 " + f2(sy) + ")");
      e.glint.setAttribute("transform", "translate(" + P2(look[0] * r, look[1] * r) + ")");
      if (blink) e.glint.style.display = "none";
      e.white.style.display = e.pupil.style.display = type === "wide" ? "" : "none";
      e.pupil.setAttribute("r", f2(r * (E.small ? 0.055 : 0.085)));
      e.arc.style.display = type === "happy" ? "" : "none";
      var lid = !!E.lid && isDot && !blink && !scr;
      e.lid.style.display = e.lidLine.style.display = lid ? "" : "none";
      if (lid) {
        var tilt = (ex === "angry" ? 14 : 8) * e.k * (ex === "smirk" && e.k < 0 ? 0 : 1);
        e.lid.setAttribute("transform", "rotate(" + f2(tilt) + ")");
        e.lidLine.setAttribute("transform", "rotate(" + f2(tilt) + ")");
      }
    });
    face.brows.forEach(function (b, i) {
      var k = i ? 1 : -1, ang = (E.brow[i] || 0) * k, raise = (E.brow[2] || 0) * r, cx = k * r * 0.34, cy = -r * (scr ? 0.42 : 0.34) + raise;
      if (ex === "smirk" || ex === "think") cy += i ? -r * 0.06 : r * 0.02;
      var L = r * 0.17, a = (ang * PI) / 180;
      b.setAttribute("d", "M" + P2(cx - Math.cos(a) * L, cy - Math.sin(a) * L) + "Q" + P2(cx, cy - r * 0.05) + " " + P2(cx + Math.cos(a) * L, cy + Math.sin(a) * L));
    });
    face.blush.style.display = E.blush ? "" : "none";
    face.sweat.style.display = E.sweat ? "" : "none";
    face.vein.style.display = E.vein && !scr ? "" : "none";
    face.tear.style.display = E.tear && !scr ? "" : "none";
    if (face.mono) face.mono.setAttribute("transform", ex === "shock" || ex === "scared" ? "translate(0 " + f2(r * 0.25) + ") rotate(8)" : "");
    // mouth
    var w = m.w * r, c = (m.c || 0) * r, open = clamp((m.o || 0) + talk * (m.round ? 0.25 : 0.7), 0, 1.15), dx = (m.dx || 0) * r, as = (m.asym || 0) * r * 0.2;
    if (scr && face.eq) {
      var talking = talk > 0.02;
      face.eq.forEach(function (bar, i) {
        bar.style.display = talking ? "" : "none";
        var hh = r * (0.06 + 0.34 * talk * (0.5 + 0.5 * Math.abs(Math.sin(t * 17 + i * 1.7))));
        bar.setAttribute("y", f2(-hh / 2)); bar.setAttribute("height", f2(hh));
      });
      if (talking) { face.mFill.setAttribute("d", ""); face.mLine.setAttribute("d", ""); face.mclip.setAttribute("d", ""); face.teeth.style.display = face.tongue.style.display = "none"; return; }
    }
    var Lx = -w / 2 + dx, Rx = w / 2 + dx, cy0 = -c * 0.5;
    var d, dFill = "";
    if (m.round) {
      var rx = w / 2 * (0.75 + 0.25 * open), ry = r * 0.2 * (0.55 + 0.45 * open);
      d = ellD(dx, r * 0.04, rx, ry);
      dFill = d;
    } else if (open < 0.06) {
      if (m.wavy) d = "M" + P2(Lx, cy0 + 3) + "Q" + P2(Lx + w * 0.25, cy0 - 6) + " " + P2(dx, cy0 + 2) + "Q" + P2(Rx - w * 0.25, cy0 + 10) + " " + P2(Rx, cy0 - 2);
      else d = "M" + P2(Lx, cy0 - as) + "Q" + P2(dx + as * 2, c * 0.6) + " " + P2(Rx, cy0 + as * 0.2 - as * 2);
    } else {
      var up = cy0 + c * 0.3, lo = cy0 + c * 1.0 + open * r * 0.52;
      d = "M" + P2(Lx, cy0 - as) + "Q" + P2(dx, up) + " " + P2(Rx, cy0 - as * 2) + "Q" + P2(dx, lo) + " " + P2(Lx, cy0 - as) + "Z";
      dFill = d;
    }
    face.mLine.setAttribute("d", d);
    face.mFill.setAttribute("d", dFill);
    face.mclip.setAttribute("d", dFill);
    var showT = !!dFill && !m.round && (m.teeth || open > 0.5) && !scr;
    face.teeth.style.display = showT ? "" : "none";
    if (showT) { face.teeth.setAttribute("y", f2(cy0 - r * 0.3)); face.teeth.setAttribute("height", f2(r * 0.3 + c * 0.3 + r * 0.08)); }
    face.tongue.style.display = dFill && open > 0.35 && !scr ? "" : "none";
    face.tongue.setAttribute("cy", f2(cy0 + c + open * r * 0.45));
  }

  function character(name, o) {
    var s = need();
    o = obj(o);
    var id = castName(name);
    if (!id) { if (str(name).toLowerCase() !== "none" && str(name)) V.error("Unknown cast member: " + name + " (use " + CAST_IDS.join(", ") + ")"); id = "sam"; }
    var cs = CAST[id], M = rigOf(id);
    var p = panelOf(o.panel != null ? o.panel : 0);
    var ib = o.box && o.box.w ? { x: num(o.box.x, p.inner.x), y: num(o.box.y, p.inner.y), w: num(o.box.w, p.inner.w), h: num(o.box.h, p.inner.h) } : p.inner;
    var inn = { x: ib.x - p.bbox.x, y: ib.y - p.bbox.y, w: ib.w, h: ib.h };
    var shot = str(o.shot).toLowerCase() || "full", sil = !!o.silhouette || shot === "silhouette";
    if (shot === "silhouette") shot = "full";
    if (["full", "mid", "close", "xclose"].indexOf(shot) < 0) shot = "full";
    var x = clamp(num(o.x, 0.5), -0.2, 1.2), sc, oy, maxW, top = -M.top;
    if (o.box && o.box.w) x = (inn.x + inn.w * clamp(num(o.x, 0.5), 0, 1)) / p.w;
    var bodyW = M.w * 2;
    var boxBottom = o.box && o.box.w ? inn.y + inn.h : null;
    if (shot === "full") { maxW = num(o.maxW, 0.55); sc = Math.min((inn.h * 0.86) / top, (inn.w * maxW) / bodyW); oy = o.y != null ? p.h * num(o.y, 0.97) : boxBottom != null ? boxBottom - u(14) : inn.y + inn.h - u(8); }
    else if (shot === "mid") { var span = -M.top + (M.hip[1] + 20); maxW = num(o.maxW, 0.66); sc = Math.min((inn.h * 0.86) / span, (inn.w * maxW) / (bodyW * 0.95)); oy = (o.y != null ? p.h * num(o.y, 1.02) : boxBottom != null ? Math.max(boxBottom, p.h + u(4)) : inn.y + inn.h + u(4)) - (M.hip[1] + 20) * sc; if (boxBottom != null && boxBottom < p.h - u(40)) oy = boxBottom - (M.hip[1] + 20) * sc; }
    else if (shot === "close") { var sp2 = -M.top + (M.sh[1] + 70); maxW = num(o.maxW, 0.8); sc = Math.min((inn.h * 0.92) / sp2, (inn.w * maxW) / (M.hr * 4.2)); oy = (o.y != null ? p.h * num(o.y, 1.02) : inn.y + inn.h + u(4)) - (M.sh[1] + 70) * sc; if (boxBottom != null) oy = Math.max(oy, inn.y + (-M.top) * sc + u(4)); }
    else { maxW = num(o.maxW, 1.1); sc = Math.min((inn.h * 1.0) / (M.hr * 2.3), (inn.w * maxW) / (M.hr * 2.6)); oy = inn.y + inn.h * num(o.y, 0.55) - M.head[1] * sc; }
    sc *= num(o.scale, 1);
    var facing = str(o.facing).toLowerCase(), flip = facing === "left" ? -1 : facing === "right" ? 1 : x > 0.55 ? -1 : 1;
    var ox = x * p.w;
    var g = svg("g", { class: "cb-char cb-char-" + id + (sil ? " cb-sil" : ""), transform: "translate(" + P2(ox, oy) + ") scale(" + f2(sc * flip * 10000) / 10000 + " " + f2(sc * 10000) / 10000 + ")" }, o.parent || p.fg);
    var ent = svg("g", null, g);
    var shadow = shot === "full" ? svg("ellipse", { cx: 0, cy: 0, rx: f2(M.w * 0.75), ry: 12, fill: C.ink, opacity: 0.22 }, ent) : null;
    var body = svg("g", null, ent);
    var capeUp = drawCape(id, body, M, cs);
    var legsG = svg("g", null, body);
    var legs = [1, -1].map(function (k) { return { k: k, p: limbPaths(legsG, cs.pants, M.lw, 5), boot: cs.boots ? limbPaths(legsG, cs.shoe, M.lw + 2, 5) : null, skin: cs.shortsLegs ? limbPaths(legsG, cs.skin, M.lw - 6, 5) : null, shoe: svg("path", { fill: cs.shoe, stroke: C.ink, "stroke-width": 5, "stroke-linejoin": "round" }, legsG), sole: svg("path", { fill: cs.shoeD }, legsG) }; });
    var torsoG = svg("g", null, body);
    var neck = svg("rect", { x: -15, y: f2(M.neckY - 30), width: 30, height: f2(M.sh[1] - M.neckY + 40), fill: cs.robot ? "#8C9AA8" : cs.skin, stroke: C.ink, "stroke-width": 5 }, torsoG);
    drawTorso(id, torsoG, M, cs);
    if (id === "vex") {
      svg("path", { d: "M" + P2(-M.sh[0] - 12, M.sh[1] - 2) + "L" + P2(-M.hr * 1.3, M.head[1] - M.hr * 0.4) + "L" + P2(-M.hr * 0.4, M.sh[1] - 20) + "Z M" + P2(M.sh[0] + 12, M.sh[1] - 2) + "L" + P2(M.hr * 1.3, M.head[1] - M.hr * 0.4) + "L" + P2(M.hr * 0.4, M.sh[1] - 20) + "Z", fill: cs.lining, stroke: C.ink, "stroke-width": 5, "stroke-linejoin": "round" }, torsoG);
    }
    var headG = svg("g", null, torsoG);
    var face = drawHead(id, headG, M, cs);
    var armsG = svg("g", null, torsoG);
    var hc = cs.glove || cs.skin;
    var arms = [1, -1].map(function (k) {
      var a = { k: k, p: limbPaths(armsG, cs.sleeve === "short" ? cs.skin : cs.top, M.aw, 5) };
      if (cs.sleeve === "short") a.sl = limbPaths(armsG, cs.top, M.aw + 6, 5);
      a.hand = svg("circle", { r: f2(M.aw * 0.62), fill: hc, stroke: C.ink, "stroke-width": 5 }, armsG);
      a.finger = svg("path", { fill: "none", stroke: C.ink, "stroke-width": 15, "stroke-linecap": "round" }, armsG);
      a.fingerF = svg("path", { fill: "none", stroke: hc, "stroke-width": 7, "stroke-linecap": "round" }, armsG);
      a.thumb = svg("path", { fill: "none", stroke: C.ink, "stroke-width": 4, "stroke-linecap": "round" }, armsG);
      return a;
    });
    if (sil) {
      [-1, 1].forEach(function (k) { svg("path", { d: "M" + P2(k * M.hr * 0.36 + M.hr * 0.1 - 9, M.head[1] - 4) + "l18 -4", stroke: "#FFFFFF", "stroke-width": 6, "stroke-linecap": "round", class: "cb-glow" }, torsoG); });
    }
    var ch = {
      name: id, panel: p, el: g, sc: sc, flip: flip, ox: ox, oy: oy, shot: shot, rig: M, info: cs,
      poses: [{ at: 0, name: poseName(o.pose) }], exprs: [{ at: 0, name: exprName(o.expression || o.expr) }], talks: [], entry: null,
      phase: (hash(id + p.i) % 1000) / 1000,
    };
    function toPage(lx, ly) { return [p.bbox.x + ox + lx * sc * flip, p.bbox.y + oy + ly * sc]; }
    ch.toPage = toPage;
    ch.anchor = function (n) {
      n = str(n).toLowerCase();
      var r = M.hr, hx = M.head[0], hy = M.head[1];
      if (n === "mouth") return toPage(hx + r * 0.1, hy + r * 0.5);
      if (n === "eyes") return toPage(hx + r * 0.1, hy - r * 0.04);
      if (n === "head") return toPage(hx, M.top);
      if (n === "chest") return toPage(0, M.sh[1] + 50);
      if (n === "feet") return toPage(0, 0);
      return toPage(hx, hy);
    };
    // Page-px rectangles: head (for balloon avoidance) and the visible body (clipped to the panel)
    ch.headRect = function () {
      var r = M.hr, a = toPage(-r * 1.25, M.top - 6), b = toPage(r * 1.25, M.head[1] + r * 1.1);
      var x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
      return clipRect({ x: x0, y: a[1], w: x1 - x0, h: b[1] - a[1] }, p.bbox);
    };
    ch.bounds = function () {
      var hw = M.w * (shot === "full" ? 1 : 1.1), a = toPage(-hw, M.top - 8), b = toPage(hw, 0);
      var x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
      return clipRect({ x: x0, y: a[1], w: x1 - x0, h: b[1] - a[1] }, p.bbox);
    };
    ch.pose = function (nm, at) { ch.poses.push({ at: Math.max(0, num(at, 0)), name: poseName(nm) }); ch.poses.sort(function (a, b) { return a.at - b.at; }); return ch; };
    ch.expr = function (nm, at) { ch.exprs.push({ at: Math.max(0, num(at, 0)), name: exprName(nm) }); ch.exprs.sort(function (a, b) { return a.at - b.at; }); return ch; };
    ch.expression = ch.expr;
    ch.talk = function (from, to) { from = num(from, 0); to = num(to, from + 1); if (to > from) ch.talks.push([from, to]); return ch; };
    ch.enter = function (at, style) { ch.entry = { at: Math.max(0, num(at, 0)), style: str(style) || "pop" }; return ch; };
    if (o.at != null || o.enter) ch.enter(num(o.at, 0), o.enter || "pop");
    function poseVals(nm) { return POSE[nm] || POSE.stand; }
    function blendPose(t) {
      var ks = ch.poses, cur = ks[0], prev = ks[0];
      for (var i = 0; i < ks.length; i++) if (ks[i].at <= t) { prev = i ? ks[i - 1] : ks[i]; cur = ks[i]; }
      var A = poseVals(prev.name), B = poseVals(cur.name), q = cur === prev ? 1 : smooth(prog(t, cur.at, cur.at + 0.3));
      function L2(a, b) { a = a || [0, 0, 1]; b = b || [0, 0, 1]; return [lerp(a[0], b[0], q), lerp(a[1], b[1], q), q < 0.5 ? (a[2] || 1) : (b[2] || 1)]; }
      return { R: L2(A.R, B.R), L: L2(A.L, B.L), FR: L2(A.FR, B.FR), FL: L2(A.FL, B.FL), lean: lerp(A.lean || 0, B.lean || 0, q), tilt: lerp(A.tilt || 0, B.tilt || 0, q), wave: lerp(A.wave || 0, B.wave || 0, q), hop: lerp(A.hop || 0, B.hop || 0, q), hand: q < 0.5 ? A.hand : B.hand, run: cur.name === "run" ? q : prev.name === "run" ? 1 - q : 0 };
    }
    function exprAt(t) { var e = ch.exprs[0].name; ch.exprs.forEach(function (k) { if (k.at <= t) e = k.name; }); return e; }
    var reach = M.up + M.fo, lreach = M.th + M.sn;
    s.anims.push(function (t) {
      if (!panelOn(p, t)) return;
      var en = ch.entry;
      if (en) {
        var on = t >= en.at;
        g.style.display = on ? "" : "none";
        if (!on) return;
        var q = prog(t, en.at, en.at + (en.style === "fade" ? 0.4 : 0.34)), tf = "", op = 1;
        if (en.style === "pop") { var k = lerp(0.4, 1, EASE.outBack(q)); tf = "scale(" + f2(k * 1000) / 1000 + ")"; op = prog(t, en.at, en.at + 0.1); }
        else if (en.style === "slide") { tf = "translate(" + f2(-(1 - EASE.outCubic(q)) * (p.w * 0.5) / sc) + " 0)"; op = prog(t, en.at, en.at + 0.12); }
        else if (en.style === "drop") { tf = "translate(0 " + f2(-(1 - EASE.outBack(q)) * (p.h * 0.6) / sc) + ")"; op = prog(t, en.at, en.at + 0.1); }
        else op = EASE.outCubic(q);
        ent.setAttribute("transform", tf);
        ent.setAttribute("opacity", f2(op));
      }
      var P = blendPose(t);
      var breath = Math.sin((t + ch.phase * 3) * TAU / 3.2) * 2.2;
      var hop = P.hop * Math.abs(Math.sin(t * 5.2)) * -14;
      body.setAttribute("transform", "translate(0 " + f2(hop) + ")");
      var hipC = [0, M.hip[1]];
      torsoG.setAttribute("transform", "rotate(" + f2(P.lean + P.run * Math.sin(t * 9) * 1.5) + " " + P2(hipC[0], hipC[1]) + ") translate(0 " + f2(breath * 0.6) + ")");
      headG.setAttribute("transform", "translate(" + P2(M.head[0], M.head[1] + breath * 0.3) + ") rotate(" + f2(P.tilt) + ")");
      if (capeUp) capeUp(t + ch.phase * 5, P.run * -30);
      // arms
      arms.forEach(function (a) {
        var spec = a.k > 0 ? P.R : P.L, Sx = M.sh[0] * a.k, Sy = M.sh[1] + 6;
        var dx = spec[0], dy = spec[1];
        if (a.k > 0 && P.wave > 0.01) dx += P.wave * 0.16 * Math.sin(t * 10);
        if (P.run > 0.01) { var sw = Math.sin(t * 9 + (a.k > 0 ? 0 : PI)) * 0.25 * P.run; dx += sw; dy -= Math.abs(sw) * 0.3; }
        var T = [Sx + dx * reach * a.k, Sy + dy * reach], bend = (spec[2] || 1) * a.k;
        var sol = ik([Sx, Sy], T, M.up, M.fo, -bend), E = sol[0], Wr = sol[1];
        var dPath = seg3([Sx, Sy], E, Wr);
        a.p.o.setAttribute("d", dPath); a.p.f.setAttribute("d", dPath);
        if (a.sl) { var mE = [lerp(Sx, E[0], 0.7), lerp(Sy, E[1], 0.7)], d2 = "M" + P2(Sx, Sy) + "L" + P2(mE[0], mE[1]); a.sl.o.setAttribute("d", d2); a.sl.f.setAttribute("d", d2); }
        a.hand.setAttribute("cx", f2(Wr[0])); a.hand.setAttribute("cy", f2(Wr[1]));
        var fx = Wr[0] - E[0], fy = Wr[1] - E[1], fl = Math.sqrt(fx * fx + fy * fy) || 1;
        var point = P.hand === "point" && a.k > 0;
        a.finger.style.display = a.fingerF.style.display = point ? "" : "none";
        if (point) { var fd = "M" + P2(Wr[0], Wr[1]) + "l" + P2((fx / fl) * M.aw * 0.95, (fy / fl) * M.aw * 0.95); a.finger.setAttribute("d", fd); a.fingerF.setAttribute("d", fd); }
        var open = P.hand === "open";
        a.thumb.style.display = open ? "" : "none";
        if (open) a.thumb.setAttribute("d", "M" + P2(Wr[0] - (fy / fl) * M.aw * 0.3 * a.k, Wr[1] + (fx / fl) * M.aw * 0.3 * a.k) + "l" + P2((fx / fl) * M.aw * 0.35 - (fy / fl) * M.aw * 0.2 * a.k, (fy / fl) * M.aw * 0.35 + (fx / fl) * M.aw * 0.2 * a.k));
      });
      // legs
      legs.forEach(function (l) {
        var spec = l.k > 0 ? P.FR : P.FL, Hx = M.hip[0] * l.k, Hy = M.hip[1];
        var dx = spec[0], dy = spec[1];
        if (P.run > 0.01) { var sw = Math.sin(t * 9 + (l.k > 0 ? PI : 0)) * 0.12 * P.run; dx += sw; }
        var T = [Hx + dx * lreach * (l.k > 0 ? 1 : -1), Hy + dy * lreach];
        var sol = ik([Hx, Hy], T, M.th, M.sn, -1), K = sol[0], A = sol[1];
        var dd = seg3([Hx, Hy], K, A);
        l.p.o.setAttribute("d", dd); l.p.f.setAttribute("d", dd);
        if (l.boot) { var bk = [lerp(K[0], A[0], 0.35), lerp(K[1], A[1], 0.35)], db = "M" + P2(bk[0], bk[1]) + "L" + P2(A[0], A[1]); l.boot.o.setAttribute("d", db); l.boot.f.setAttribute("d", db); }
        if (l.skin) { var sk = [lerp(Hx, K[0], 0.75), lerp(Hy, K[1], 0.75)], ds = "M" + P2(sk[0], sk[1]) + "L" + P2(K[0], K[1]) + "L" + P2(A[0], A[1] - 6); l.skin.o.setAttribute("d", ds); l.skin.f.setAttribute("d", ds); }
        var fw = M.lw * 0.95, fh = M.lw * 0.5, sx2 = A[0] + fw * 0.45, sy2 = A[1] + fh * 0.35;
        l.shoe.setAttribute("d", "M" + P2(sx2 - fw, sy2 + fh * 0.6) + "Q" + P2(sx2 - fw, sy2 - fh * 1.1) + " " + P2(sx2, sy2 - fh) + "Q" + P2(sx2 + fw * 1.05, sy2 - fh * 0.6) + " " + P2(sx2 + fw, sy2 + fh * 0.6) + "Z");
        l.sole.setAttribute("d", "M" + P2(sx2 - fw + 3, sy2 + fh * 0.25) + "H" + f2(sx2 + fw - 3) + "V" + f2(sy2 + fh * 0.6 - 3) + "H" + f2(sx2 - fw + 3) + "Z");
      });
      if (shadow) shadow.setAttribute("rx", f2(M.w * 0.75 * (1 + hop / 60)));
      var cyc = 3.6 + ch.phase * 1.4, bt = mod(t + ch.phase * 7, cyc), blink = bt > cyc - 0.13;
      updateFace(face, exprAt(t), talkAmt(ch.talks, t), blink, t);
    });
    occupy(p, ch.headRect(), 0, D + 1, "face");
    occupy(p, ch.bounds(), 0, D + 1, "body");
    s.items.push({ kind: "face", label: id, panel: p, t0: function () { return ch.entry ? ch.entry.at : 0; }, rect: function () { return ch.headRect(); } });
    return ch;
  }
  function clipRect(r, b) {
    var x0 = Math.max(r.x, b.x), y0 = Math.max(r.y, b.y), x1 = Math.min(r.x + r.w, b.x + b.w), y1 = Math.min(r.y + r.h, b.y + b.h);
    return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
  }

  // ------------------------- occupancy (layout of lettering inside a panel) -------------------------
  function occupy(panel, rect, t0, t1, kind) { need().occ.push({ panel: panel, r: rect, t0: num(t0, 0), t1: num(t1, D + 1), kind: kind || "" }); }
  function occAt(panel, t0, t1) {
    return st.occ.filter(function (o) { return (!panel || !o.panel || o.panel === panel || o.panel.host === panel || panel.host === o.panel) && o.t0 < t1 && t0 < o.t1; });
  }
  // Pick the candidate rect (page px) with the least overlap; stays inside `bounds`.
  function bestSpot(cands, w, h, bounds, occ, prefer) {
    var best = null, bestS = 1e18;
    cands.forEach(function (c, i) {
      var x = clamp(c[0] - w / 2, bounds.x, bounds.x + bounds.w - w), y = clamp(c[1] - h / 2, bounds.y, bounds.y + bounds.h - h);
      if (w > bounds.w) x = bounds.x + (bounds.w - w) / 2;
      if (h > bounds.h) y = bounds.y + (bounds.h - h) / 2;
      var r = { x: x, y: y, w: w, h: h }, sc = 0, m = u(8), rm = { x: x - m, y: y - m, w: w + 2 * m, h: h + 2 * m };
      occ.forEach(function (o) { sc += overlapArea(o.kind === "body" ? r : rm, o.r) * (o.kind === "face" ? 6 : o.kind === "body" ? 0.5 : 3); });
      sc += (Math.abs(x + w / 2 - c[0]) + Math.abs(y + h / 2 - c[1])) * w * 0.02;
      sc += i * w * h * 0.004 * (prefer == null ? 1 : prefer);
      if (sc < bestS) { bestS = sc; best = r; best.score = sc; }
    });
    return best;
  }
  function panelBounds(p, m) { m = m == null ? u(12) : m; var b = p.inner, sr = safeRect(); var x0 = Math.max(b.x + m, sr.x + u(4)), y0 = Math.max(b.y + m, sr.y + u(4)), x1 = Math.min(b.x + b.w - m, sr.x + sr.w - u(4)), y1 = Math.min(b.y + b.h - m, sr.y + sr.h - u(4)); return { x: x0, y: y0, w: Math.max(20, x1 - x0), h: Math.max(20, y1 - y0) }; }
  function popAnim(g, cx, cy, at, end, o) {
    o = o || {};
    st.anims.push(function (t) {
      var on = t >= at && (end == null || t < end + 0.16);
      g.style.display = on ? "" : "none";
      if (!on) return;
      var k = lerp(o.from == null ? 0.55 : o.from, 1, (o.ease || EASE.outBack)(prog(t, at, at + (o.dur || 0.24))));
      if (end != null && t > end) k *= 1 - prog(t, end, end + 0.15);
      g.setAttribute("transform", "translate(" + P2(cx, cy) + ") rotate(" + f2(o.rot || 0) + ") scale(" + f2(k * 1000) / 1000 + ") translate(" + P2(-cx, -cy) + ")");
    });
  }
  function emitItem(kind, label, panel, rect, t0, t1, screen) {
    need().items.push({ kind: kind, label: label, panel: panel, rect: typeof rect === "function" ? rect : function () { return rect; }, t0: t0, t1: t1, screen: !!screen });
  }

  // ------------------------- balloons -------------------------
  function superEll(cx, cy, rx, ry, n, N) {
    var pts = [];
    N = N || 72;
    for (var i = 0; i < N; i++) {
      var a = (i / N) * TAU, c = Math.cos(a), s = Math.sin(a);
      pts.push([cx + rx * Math.sign(c) * Math.pow(Math.abs(c), 2 / n), cy + ry * Math.sign(s) * Math.pow(Math.abs(s), 2 / n)]);
    }
    return pts;
  }
  function balloonShape(kind, cx, cy, rx, ry, R) {
    if (kind === "thought") return bumpy(cx, cy, rx * 1.04, ry * 1.08, Math.max(9, Math.round((rx + ry) / u(26))), R);
    if (kind === "shout" || kind === "radio") {
      var n = Math.max(14, Math.round((rx + ry) / u(kind === "radio" ? 14 : 22))), pts = [];
      for (var i = 0; i < n * 2; i++) {
        var a = (i / (n * 2)) * TAU, out = i % 2 === 0, k = out ? (kind === "radio" ? 1.1 : 1.2 + R() * 0.12) : (kind === "radio" ? 0.98 : 1.0);
        var c = Math.cos(a), s = Math.sin(a);
        pts.push([cx + rx * k * Math.sign(c) * Math.pow(Math.abs(c), 2 / 2.4), cy + ry * k * Math.sign(s) * Math.pow(Math.abs(s), 2 / 2.4)]);
      }
      return polyD(pts);
    }
    return smoothClosed(superEll(cx, cy, rx, ry, 2.5, 40));
  }
  function balloon(text, o) {
    var s = need();
    o = obj(o);
    text = str(text);
    var sp = o.speaker && o.speaker.anchor ? o.speaker : null;
    var p = o.panel != null ? panelOf(o.panel) : sp ? sp.panel : panelOf(0);
    var kind = str(o.kind).toLowerCase();
    if (["speech", "thought", "shout", "whisper", "radio"].indexOf(kind) < 0) kind = "speech";
    var at = Math.max(0, num(o.at, 0.3)), end = o.end != null ? num(o.end, D) : null;
    // an inset is small: its balloons may use the host panel's space
    var bnd = o.bounds && o.bounds.w ? o.bounds : panelBounds(p.inset && p.host ? p.host : p);
    var size = num(o.size, clamp(Math.min(p.inner.h, p.inner.w * 0.75) * 0.068, u(26), u(44)));
    var k = kind === "shout" ? 1.42 : kind === "thought" ? 1.38 : 1.3, lay, rx, ry, bw, bh;
    function sizeFor(f) {
      lay = layoutText(text, { size: size, maxWidth: num(o.maxWidth, Math.min(bnd.w * 0.62, size * 13)) * f, maxLines: 6, maxHeight: bnd.h * 0.55, weight: 800, minSize: u(20), lineHeight: 1.12 });
      var padX = lay.size * 0.55, padY = lay.size * 0.45;
      rx = (lay.w / 2 + padX) * k * 0.92; ry = (lay.h / 2 + padY) * k;
      bw = rx * 2 + u(10); bh = ry * 2 + u(10);
    }
    sizeFor(1);
    var cx, cy, R = V.makeRand(hash(text) + 7);
    if (o.x != null && o.y != null) {
      var px = num(o.x, 0.5), py = num(o.y, 0.2);
      cx = px <= 1.5 && py <= 1.5 ? p.bbox.x + px * p.bbox.w : px; cy = px <= 1.5 && py <= 1.5 ? p.bbox.y + py * p.bbox.h : py;
      cx = clamp(cx, bnd.x + bw / 2, bnd.x + bnd.w - bw / 2); cy = clamp(cy, bnd.y + bh / 2, bnd.y + bnd.h - bh / 2);
      if (bw > bnd.w) cx = bnd.x + bnd.w / 2;
      if (bh > bnd.h) cy = bnd.y + bnd.h / 2;
    } else {
      var cands = [];
      if (sp) {
        var hr = sp.headRect(), hcx = hr.x + hr.w / 2, toC = p.bbox.x + p.bbox.w / 2 > hcx ? 1 : -1;
        var above = hr.y - bh / 2 - u(8), side = hcx + toC * (hr.w / 2 + bw / 2 + u(10));
        cands.push([hcx + toC * bw * 0.3, above], [hcx + toC * bw * 0.55, above], [side, hr.y + bh * 0.3], [side, hr.y + hr.h * 0.5], [hcx - toC * bw * 0.3, above], [hcx - toC * (hr.w / 2 + bw / 2 + u(10)), hr.y + bh * 0.3]);
      } else cands.push([p.inner.x + p.inner.w / 2, bnd.y + bh / 2], [p.inner.x + p.inner.w * 0.3, bnd.y + bh / 2], [p.inner.x + p.inner.w * 0.7, bnd.y + bh / 2]);
      var occ = occAt(p, at, end == null ? D + 1 : end), r0 = null, pick = 1;
      [1, 0.78, 0.6].forEach(function (f) {
        if (r0 && r0.score < bw * bh * 0.02) return;
        sizeFor(f);
        var cc = cands.map(function (c) { return [c[0], c[1]]; });
        if (sp) { var hr2 = sp.headRect(), hc2 = hr2.x + hr2.w / 2, tc2 = p.bbox.x + p.bbox.w / 2 > hc2 ? 1 : -1; cc = [[hc2 + tc2 * bw * 0.3, hr2.y - bh / 2 - u(8)], [hc2 + tc2 * bw * 0.55, hr2.y - bh / 2 - u(8)], [hc2 + tc2 * (hr2.w / 2 + bw / 2 + u(10)), hr2.y + bh * 0.3], [hc2 + tc2 * (hr2.w / 2 + bw / 2 + u(10)), hr2.y + hr2.h * 0.5], [hc2 - tc2 * bw * 0.3, hr2.y - bh / 2 - u(8)], [hc2 - tc2 * (hr2.w / 2 + bw / 2 + u(10)), hr2.y + bh * 0.3]]; }
        var r1 = bestSpot(cc, bw, bh, bnd, occ, 1);
        if (!r0 || r1.score < r0.score * 0.8) { r0 = r1; pick = f; }
      });
      sizeFor(pick);
      cx = r0.x + bw / 2; cy = r0.y + bh / 2;
    }
    var g = svg("g", { class: "cb-balloon cb-balloon-" + kind }, p.page.over);
    var strokeL = svg("g", null, g), fillL = svg("g", null, g);
    var bodyD = balloonShape(kind, cx, cy, rx, ry, R), tailD = "", bubbles = [];
    var tipX = null, tipY = null;
    var tail = o.tail;
    if (tail !== "none" && (sp || (tail && tail.x != null))) {
      var tp = tail && tail.x != null ? [num(tail.x, cx), num(tail.y, cy + ry * 2)] : sp.anchor("mouth");
      var dxm = tp[0] - cx, dym = tp[1] - cy, dist = Math.sqrt(dxm * dxm + dym * dym) || 1, ux = dxm / dist, uy = dym / dist;
      var edge = 1 / Math.sqrt((ux * ux) / (rx * rx) + (uy * uy) / (ry * ry));
      var stopAt = dist;
      if (sp && !(tail && tail.x != null)) {
        var hc = sp.anchor("center"), hrr = sp.rig.hr * sp.sc * 1.12;
        var fx = cx - hc[0], fy = cy - hc[1], bq = fx * ux + fy * uy, cq = fx * fx + fy * fy - hrr * hrr, disc = bq * bq - cq;
        if (disc > 0) { var t1 = -bq - Math.sqrt(disc); if (t1 > edge) stopAt = Math.min(stopAt, t1 - u(6)); }
        stopAt = Math.min(stopAt, dist - sp.rig.hr * sp.sc * 0.35);
      }
      var len = clamp(stopAt, edge + u(18), edge + Math.max(u(40), Math.min(u(200), dist * 0.85)));
      tipX = cx + ux * len; tipY = cy + uy * len;
      if (kind === "thought") {
        for (var bi = 0; bi < 3; bi++) { var q = lerp(edge + u(14), len, (bi + 0.5) / 3), br = lerp(size * 0.42, size * 0.18, bi / 2); bubbles.push([cx + ux * q, cy + uy * q, br]); }
      } else {
        var bwid = Math.min(rx, ry) * 0.36, nx = -uy, ny = ux, base = edge * 0.82;
        var b1 = [cx + ux * base + nx * bwid, cy + uy * base + ny * bwid], b2 = [cx + ux * base - nx * bwid * 0.35, cy + uy * base - ny * bwid * 0.35];
        if (kind === "radio") {
          var m1 = [lerp(b1[0], tipX, 0.4) - nx * bwid * 0.9, lerp(b1[1], tipY, 0.4) - ny * bwid * 0.9], m2 = [lerp(b2[0], tipX, 0.6) + nx * bwid * 0.6, lerp(b2[1], tipY, 0.6) + ny * bwid * 0.6];
          tailD = polyD([b1, m1, [m1[0] + ux * u(14), m1[1] + uy * u(14)], [tipX, tipY], m2, [m2[0] - ux * u(14), m2[1] - uy * u(14)], b2]);
        } else {
          var cxm = lerp(b1[0], tipX, 0.55) + nx * bwid * 0.25, cym = lerp(b1[1], tipY, 0.55) + ny * bwid * 0.25;
          tailD = "M" + P2(b1[0], b1[1]) + "Q" + P2(cxm, cym) + " " + P2(tipX, tipY) + "Q" + P2(lerp(b2[0], tipX, 0.5), lerp(b2[1], tipY, 0.5)) + " " + P2(b2[0], b2[1]) + "Z";
        }
      }
    }
    var inkW = u(kind === "shout" ? 5.5 : 4.5), fillC = kind === "radio" ? "#FFFDE8" : "#FFFFFF";
    var dash = kind === "whisper" ? f2(u(14)) + " " + f2(u(9)) : null;
    if (kind === "whisper") {
      svg("path", { d: bodyD, fill: fillC, stroke: C.ink, "stroke-width": f2(inkW * 0.9), "stroke-dasharray": dash }, strokeL);
      if (tailD) { svg("path", { d: tailD, fill: fillC, stroke: C.ink, "stroke-width": f2(inkW * 0.9), "stroke-dasharray": dash, "stroke-linejoin": "round" }, strokeL); svg("path", { d: bodyD, fill: fillC }, fillL); svg("path", { d: bodyD, fill: "none", stroke: C.ink, "stroke-width": f2(inkW * 0.9), "stroke-dasharray": dash, "clip-path": null }, fillL); }
    } else {
      svg("path", { d: bodyD, fill: C.ink, stroke: C.ink, "stroke-width": f2(inkW * 2), "stroke-linejoin": "round" }, strokeL);
      if (tailD) svg("path", { d: tailD, fill: C.ink, stroke: C.ink, "stroke-width": f2(inkW * 2), "stroke-linejoin": "round" }, strokeL);
      svg("path", { d: bodyD, fill: fillC }, fillL);
      if (tailD) svg("path", { d: tailD, fill: fillC }, fillL);
    }
    bubbles.forEach(function (b) { svg("circle", { cx: f2(b[0]), cy: f2(b[1]), r: f2(b[2]), fill: "#FFFFFF", stroke: C.ink, "stroke-width": f2(inkW) }, g); });
    var tb = writeBlock(g, lay, cx, cy + (kind === "thought" ? 0 : 0), { color: C.ink });
    // words appear as spoken
    var sync = o.sync !== false, toks = lay.lines.reduce(function (a, l) { return a.concat(l.toks.map(function (t) { return t.t; })); }, []);
    var wt = sync ? wordTimes(toks, at) : toks.map(function () { return { s: at }; });
    tb.spans.forEach(function (spn, i) {
      var ts = Math.max(at + 0.04, wt[i] ? wt[i].s : at);
      if (end != null) ts = Math.min(ts, end - 0.2);
      st.anims.push(function (t) { spn.setAttribute("opacity", t >= ts ? 1 : 0); });
    });
    popAnim(g, tipX != null ? lerp(cx, tipX, 0.35) : cx, tipY != null ? lerp(cy, tipY, 0.35) : cy, at, end, { from: 0.5 });
    var rect = { x: cx - rx * 1.08, y: cy - ry * 1.08, w: rx * 2.16, h: ry * 2.16 };
    occupy(p, rect, at, end == null ? D + 1 : end, "balloon");
    var ek = kind === "shout" ? 1.12 : kind === "radio" ? 1.06 : kind === "thought" ? 1.04 : 1;
    emitItem("balloon", text, p, { x: cx - rx * ek, y: cy - ry * ek, w: rx * 2 * ek, h: ry * 2 * ek }, at, end);
    var lastWord = wt.length ? wt[wt.length - 1].e : at + 0.5;
    if (o.talk !== false && sp && sync) sp.talk(Math.max(0, at - 0.05), Math.max(at + 0.3, lastWord));
    return { el: g, x: cx, y: cy, rx: rx, ry: ry, w: bw, h: bh, at: at, end: end == null ? D : end, last: lastWord, panel: p };
  }

  // ------------------------- captions -------------------------
  var TONES = { yellow: ["#FFD23F", C.ink], white: ["#FFFFFF", C.ink], dark: ["#15110E", "#FFFFFF"], red: ["#E23B2E", "#FFFFFF"] };
  function caption(text, o) {
    var s = need();
    o = obj(o);
    text = str(text);
    var screenMode = !!o.screen, p = screenMode ? null : panelOf(o.panel != null ? o.panel : 0);
    var at = Math.max(0, num(o.at, 0.2)), end = o.end != null ? num(o.end, D) : null;
    var sr = safeRect();
    var bnd = screenMode ? { x: sr.x + u(6), y: sr.y + u(6), w: sr.w - u(12), h: sr.h - u(12) } : panelBounds(p, u(10));
    var pos = str(o.pos).toLowerCase() || "tl", wide = pos === "top" || pos === "bottom";
    var size = num(o.size, clamp((screenMode ? sr.h : Math.min(p.inner.h, p.inner.w * 0.8)) * 0.058, u(24), u(40)));
    var lay = layoutText(text, { size: size, maxWidth: num(o.maxWidth, bnd.w * (wide ? 0.88 : 0.62)) - size * 1.1, maxLines: 4, maxHeight: bnd.h * 0.42, weight: 800, minSize: u(19), lineHeight: 1.14 });
    var padX = lay.size * 0.55, padY = lay.size * 0.42, bw = lay.w + padX * 2, bh = lay.h + padY * 2;
    var label = str(o.label), labH = 0, labLay = null;
    if (label) { labLay = layoutText(label, { size: num(o.labelSize, lay.size * 0.66), maxWidth: Math.max(bw * 1.2, bnd.w * 0.8), maxLines: 1, weight: 900, italic: true }); labH = labLay.h + lay.size * 0.36; }
    var x, y;
    if (o.x != null || o.y != null) {
      x = bnd.x + clamp(num(o.x, 0), 0, 1) * (screenMode ? sr.w : p.bbox.w) + (screenMode ? sr.x - bnd.x : p.bbox.x - bnd.x);
      y = bnd.y + clamp(num(o.y, 0), 0, 1) * (screenMode ? sr.h : p.bbox.h) + (screenMode ? sr.y - bnd.y : p.bbox.y - bnd.y);
    } else {
      x = pos.indexOf("r") >= 0 ? bnd.x + bnd.w - bw : pos === "top" || pos === "bottom" ? bnd.x + (bnd.w - bw) / 2 : bnd.x;
      y = pos.indexOf("b") >= 0 ? bnd.y + bnd.h - bh : bnd.y + labH * 0.6;
    }
    x = clamp(x, bnd.x, bnd.x + bnd.w - bw); y = clamp(y, bnd.y + labH * 0.6, bnd.y + bnd.h - bh);
    var tone = TONES[str(o.tone).toLowerCase()] || TONES.yellow, tilt = num(o.tilt, 0);
    var parent = screenMode ? s.screen : p.page.over;
    var g = svg("g", { class: "cb-caption" }, parent);
    var sh = u(6);
    svg("rect", { x: f2(x + sh), y: f2(y + sh), width: f2(bw), height: f2(bh), fill: C.ink }, g);
    svg("rect", { x: f2(x), y: f2(y), width: f2(bw), height: f2(bh), fill: tone[0], stroke: C.ink, "stroke-width": f2(u(4)) }, g);
    if (label) {
      var lw = labLay.w + lay.size * 0.7, lh = labLay.h + lay.size * 0.26, lx = x - u(6), ly = y - lh * 0.6;
      var lg = svg("g", { transform: "rotate(-2 " + P2(lx, ly) + ")" }, g);
      svg("rect", { x: f2(lx + u(4)), y: f2(ly + u(4)), width: f2(lw), height: f2(lh), fill: C.ink }, lg);
      svg("rect", { x: f2(lx), y: f2(ly), width: f2(lw), height: f2(lh), fill: C.red, stroke: C.ink, "stroke-width": f2(u(3.5)) }, lg);
      writeBlock(lg, labLay, lx + lw / 2, ly + lh / 2, { color: "#FFFFFF" });
    }
    var tb = writeBlock(g, lay, x + bw / 2, y + bh / 2, { color: tone[1], emColor: tone[0] === C.red ? "#FFD23F" : C.red });
    if (o.sync) {
      var toks = lay.lines.reduce(function (a, l) { return a.concat(l.toks.map(function (t) { return t.t; })); }, []), wt = wordTimes(toks, at);
      tb.spans.forEach(function (spn, i) { var ts = Math.max(at, wt[i].s); st.anims.push(function (t) { spn.setAttribute("opacity", t >= ts ? 1 : 0); }); });
    }
    popAnim(g, x + bw / 2, y + bh / 2, at, end, { from: 0.86, dur: 0.18, ease: EASE.outCubic, rot: tilt });
    var rect = { x: x - u(8), y: y - labH, w: bw + sh + u(8), h: bh + labH + sh };
    if (!screenMode) occupy(p, rect, at, end == null ? D + 1 : end, "caption");
    emitItem("caption", text, p, { x: label ? Math.min(x, x - u(6)) : x, y: label ? y - labH * 0.6 - u(2) : y, w: bw + sh, h: bh + sh + (label ? labH * 0.6 : 0) }, at, end, screenMode);
    return { el: g, x: x, y: y, w: bw, h: bh, at: at, panel: p, rect: rect };
  }

  // ------------------------- 3D lettering -------------------------
  function letter3D(parent, ch, size, pal, o) {
    o = o || {};
    var g = svg("g", { class: "cb-l3d" }, parent);
    var depth = num(o.depth, size * 0.1), steps = clamp(Math.round(depth / Math.max(1, size * 0.014)), 3, 10), ang = num(o.angle, 45) * PI / 180;
    var dx = Math.cos(ang) * depth, dy = Math.sin(ang) * depth, ow = num(o.outline, size * 0.075);
    var base = { "font-family": FONT, "font-size": f2(size), "font-weight": 900, "font-style": o.italic === false ? null : "italic", "text-anchor": "middle", "stroke-linejoin": "round" };
    function tx(x, y, attrs) { var n = svg("text", Object.assign({ x: f2(x), y: f2(y) }, base, attrs), g); n.textContent = ch; return n; }
    for (var i = steps; i >= 0; i--) tx((dx * i) / steps, (dy * i) / steps, { fill: C.ink, stroke: C.ink, "stroke-width": f2(ow * 2.1) });
    for (i = steps; i >= 1; i--) tx((dx * i) / steps, (dy * i) / steps, { fill: pal[1] });
    tx(0, 0, { fill: pal[0], stroke: C.ink, "stroke-width": f2(ow * 0.55) });
    return g;
  }
  function letterSizes(text, size) {
    var chars = Array.from(text), track = size * 0.035;
    var ws = chars.map(function (c) { return c === " " ? size * 0.28 : textW(c, size, 900, true) + track; });
    var tot = ws.reduce(function (a, b) { return a + b; }, 0) + size * 0.12;
    return { chars: chars, ws: ws, w: tot };
  }
  // Static 3D lettering block, centred at (x, y) (baseline at about y + 0.35 size).
  function lettering(parent, text, o) {
    o = obj(o);
    var size = num(o.size, u(90)), pal = Array.isArray(o.palette) ? o.palette : sfxPal(o.palette, "fire");
    text = str(text).toUpperCase();
    var ls = letterSizes(text, size);
    if (o.maxW && ls.w > num(o.maxW, 1e9)) { size *= num(o.maxW, 1e9) / ls.w; ls = letterSizes(text, size); }
    var x = num(o.x, 0), y = num(o.y, 0);
    var g = svg("g", { class: "cb-lettering", transform: o.rotate ? "rotate(" + f2(num(o.rotate, 0)) + " " + P2(x, y) + ")" : null }, parent && parent.appendChild ? parent : need().cur.over);
    var cx = x - ls.w / 2 + size * 0.06, letters = [];
    ls.chars.forEach(function (c, i) {
      var lx = cx + ls.ws[i] / 2;
      cx += ls.ws[i];
      if (c === " ") return;
      var lg = svg("g", { transform: "translate(" + P2(lx, y + size * 0.36) + ")" }, g);
      letter3D(lg, c, size, pal, { depth: o.depth, italic: o.italic });
      letters.push({ g: lg, x: lx, y: y + size * 0.36, w: ls.ws[i], c: c });
    });
    return { el: g, w: ls.w, h: size * 1.15, size: size, letters: letters, x: x, y: y };
  }
  // Animated SFX: letters pop in staggered, then jitter.
  function sfx(text, o) {
    var s = need();
    o = obj(o);
    text = str(text).toUpperCase() || "POW!";
    var p = o.panel != null ? panelOf(o.panel) : null;
    var at = Math.max(0, num(o.at, 0.5)), hold = o.hold != null ? num(o.hold, 99) : null;
    var bnd = o.bounds && o.bounds.w ? o.bounds : p ? panelBounds(p, u(6)) : (function () { var sr = safeRect(); return { x: sr.x, y: sr.y, w: sr.w, h: sr.h }; })();
    var auto = p && o.x == null && o.y == null;
    var x = o.x != null ? num(o.x, 0.5) : 0.5, y = o.y != null ? num(o.y, 0.5) : 0.5;
    if (p) { x = p.bbox.x + x * p.bbox.w; y = p.bbox.y + y * p.bbox.h; }
    else if (o.x == null) { x = W / 2; y = H / 2; }
    var size = num(o.size, p ? clamp(Math.min(p.inner.w, p.inner.h) * 0.2, u(48), u(150)) : u(110));
    var rot = num(o.rotate, -8), pal = sfxPal(o.palette, "fire");
    var ls = letterSizes(text, size), maxW = bnd.w * 0.94 / (Math.abs(Math.cos(rot * PI / 180)) + 0.15);
    if (ls.w > maxW) { size *= maxW / ls.w; ls = letterSizes(text, size); }
    var hh = size * 1.25, ww = ls.w + size * 0.2;
    if (auto) {
      var cs = [[0.3, 0.72], [0.7, 0.72], [0.5, 0.5], [0.3, 0.4], [0.7, 0.4], [0.5, 0.82], [0.5, 0.25]].map(function (q) { return [p.bbox.x + q[0] * p.bbox.w, p.bbox.y + q[1] * p.bbox.h]; });
      var br = bestSpot(cs, ww, hh, bnd, occAt(p, at, hold == null ? D + 1 : at + hold), 0.3);
      x = br.x + ww / 2; y = br.y + hh / 2;
    }
    var c2 = clampCenter(x, y, ww, hh, bnd);
    x = c2[0]; y = c2[1];
    var g = svg("g", { class: "cb-sfx" }, p ? p.page.over : s.cur ? s.cur.over : page(1).over);
    if (o.burst) {
      var bc = typeof o.burst === "string" && o.burst.charAt(0) === "#" ? o.burst : "#FFD23F";
      burst({ parent: g, x: x, y: y, r: Math.max(ww, hh * 1.6) * 0.62, aspect: clamp(hh * 1.8 / ww, 0.45, 1), fill: bc, fill2: "#FFFFFF", at: at - 0.02, spikes: 14, abs: true });
    }
    var lg = svg("g", { transform: "rotate(" + f2(rot) + " " + P2(x, y) + ")" }, g);
    var cx = x - ls.w / 2 + size * 0.06, n = ls.chars.filter(function (c) { return c !== " "; }).length, idx = 0;
    var ramp = !!o.ramp, jit = num(o.shake, 1);
    ls.chars.forEach(function (c, i) {
      var lx = cx + ls.ws[i] / 2;
      cx += ls.ws[i];
      if (c === " ") return;
      var k = idx++, sz = ramp ? size * lerp(0.7, 1.12, n > 1 ? k / (n - 1) : 1) : size;
      var wrap = svg("g", null, lg), inner = svg("g", null, wrap);
      letter3D(inner, c, sz, pal, {});
      var la = at + k * 0.045, ly = y + size * 0.36, R = V.makeRand(hash(text) + k);
      var ph = R() * 10;
      st.anims.push(function (t) {
        var on = t >= la && (hold == null || t < at + hold + 0.2);
        wrap.style.display = on ? "" : "none";
        if (!on) return;
        var q = prog(t, la, la + 0.22), sc = lerp(2.3, 1, EASE.outBack(q)), r = (1 - q) * (k % 2 ? 14 : -14);
        var j = q >= 1 ? jit * u(1.6) : 0, jx = j * Math.sin(t * 37 + ph), jy = j * Math.cos(t * 41 + ph);
        if (hold != null && t > at + hold) sc *= 1 - prog(t, at + hold, at + hold + 0.18);
        wrap.setAttribute("transform", "translate(" + P2(lx + jx, ly + jy) + ") rotate(" + f2(r) + ") scale(" + f2(sc * 1000) / 1000 + ")");
        inner.setAttribute("opacity", f2(prog(t, la, la + 0.06)));
      });
    });
    var land = at + Math.max(0, n - 1) * 0.045 + 0.2;
    if (o.cameraShake) camera.shake(land - 0.12, typeof o.cameraShake === "number" ? o.cameraShake : u(12), 0.4);
    var rect = { x: x - ww / 2, y: y - hh / 2, w: ww, h: hh };
    if (p) occupy(p, rect, at, hold == null ? D + 1 : at + hold, "sfx");
    emitItem("sfx", text, p, rect, at, hold == null ? null : at + hold);
    return { el: g, x: x, y: y, w: ww, h: hh, at: at, land: land };
  }
  function clampCenter(x, y, w, h, b) {
    var cx = w >= b.w ? b.x + b.w / 2 : clamp(x, b.x + w / 2, b.x + b.w - w / 2);
    var cy = h >= b.h ? b.y + b.h / 2 : clamp(y, b.y + h / 2, b.y + b.h - h / 2);
    return [cx, cy];
  }
  // Big title in extruded 3D letters (1-2 lines), letters slam in.
  function logo(text, o) {
    var s = need();
    o = obj(o);
    text = str(text).toUpperCase() || "TITLE";
    var sr = safeRect();
    var x = num(o.x, W / 2), y = num(o.y, H * 0.4), maxW = num(o.maxW, sr.w * 0.9), maxH = num(o.maxH, sr.h * 0.4);
    var at = Math.max(0, num(o.at, 0.3)), pal = Array.isArray(o.palette) ? o.palette : logoPal(o.palette), arc = num(o.arc, 0);
    var words = text.split(/\s+/).filter(Boolean), best = null;
    function trySplit(lines) {
      var s1 = maxH / (lines.length * 1.12 + 0.1);
      lines.forEach(function (l) { var w = letterSizes(l, 100).w / 100; s1 = Math.min(s1, maxW / w); });
      return { lines: lines, size: s1 };
    }
    best = trySplit([words.join(" ")]);
    if (words.length > 1) {
      for (var i = 1; i < words.length; i++) {
        var c = trySplit([words.slice(0, i).join(" "), words.slice(i).join(" ")]);
        if (c.size > best.size * 1.08) best = c;
      }
    }
    var size = Math.min(best.size, num(o.size, 1e9)), lines = best.lines, lh = size * 1.1, total = lh * lines.length;
    var g = svg("g", { class: "cb-logo" }, o.parent || (s.cur ? s.cur.over : page(1).over));
    var k = 0, n = text.replace(/\s/g, "").length, stag = clamp(0.5 / Math.max(1, n), 0.03, 0.07), wmax = 0;
    lines.forEach(function (ln, li) {
      var ls = letterSizes(ln, size), cx = x - ls.w / 2 + size * 0.06, ly0 = y - total / 2 + lh * (li + 0.5) + size * 0.36;
      wmax = Math.max(wmax, ls.w);
      ls.chars.forEach(function (c, ci) {
        var lx = cx + ls.ws[ci] / 2;
        cx += ls.ws[ci];
        if (c === " ") return;
        var f = (lx - x) / (ls.w / 2 || 1), ay = arc * size * 0.35 * (f * f - 1) * -1, ar = arc * f * 10;
        var wrap = svg("g", null, g);
        letter3D(wrap, c, size, pal, { depth: size * 0.12 });
        var la = at + k * stag, kk = k++;
        st.anims.push(function (t) {
          var on = t >= la;
          wrap.style.display = on ? "" : "none";
          if (!on) return;
          var q = prog(t, la, la + 0.2), sc = o.slam === false ? lerp(0.6, 1, EASE.outBack(q)) : lerp(3.2, 1, EASE.outCubic(q));
          wrap.setAttribute("transform", "translate(" + P2(lx, ly0 - ay) + ") rotate(" + f2(ar + (1 - q) * (kk % 2 ? 10 : -10)) + ") scale(" + f2(sc * 1000) / 1000 + ")");
          wrap.setAttribute("opacity", f2(prog(t, la, la + 0.07)));
        });
      });
    });
    var land = at + Math.max(0, k - 1) * stag + 0.2;
    if (o.shake !== false && o.slam !== false) camera.shake(land - 0.08, u(16), 0.45);
    var rect = { x: x - wmax / 2, y: y - total / 2 - Math.max(0, arc) * size * 0.1, w: wmax + size * 0.1, h: total + size * 0.12 };
    emitItem("logo", text, o.panel ? panelOf(o.panel) : null, rect, at, null);
    return { el: g, at: at, land: land, w: rect.w, h: rect.h, size: size, rect: rect };
  }
  // Jagged impact burst. With a panel, x/y are fractions and r a fraction of the panel's short side.
  function burst(o) {
    var s = need();
    o = obj(o);
    var p = o.panel != null ? panelOf(o.panel) : null, x = num(o.x, 0.5), y = num(o.y, 0.5), r = num(o.r, p ? 0.3 : u(160));
    if (p && !o.abs) { x = p.bbox.x + x * p.bbox.w; y = p.bbox.y + y * p.bbox.h; if (r <= 2) r *= Math.min(p.bbox.w, p.bbox.h); }
    var n = Math.max(6, Math.round(num(o.spikes, 13))), asp = num(o.aspect, 1), R = V.makeRand(hash(x + ":" + y) + 3), at = Math.max(0, num(o.at, 0));
    var parent = o.parent || (p ? p.page.over : s.cur ? s.cur.over : page(1).over);
    var g = svg("g", { class: "cb-burst" }, parent);
    function jag(rr, k) { var pts = []; for (var i = 0; i < n * 2; i++) { var a = (i / (n * 2)) * TAU + 0.2, q = i % 2 ? 0.66 + R() * 0.08 : 1 + R() * 0.16; pts.push([x + Math.cos(a) * rr * q, y + Math.sin(a) * rr * q * asp]); } return polyD(pts); }
    svg("path", { d: jag(r * 1.04), fill: C.ink, transform: "translate(" + P2(u(8), u(8)) + ")" }, g);
    svg("path", { d: jag(r), fill: o.fill || "#FFD23F", stroke: C.ink, "stroke-width": f2(u(5)), "stroke-linejoin": "round" }, g);
    if (o.fill2 !== false) svg("path", { d: jag(r * 0.72), fill: o.fill2 || "#FFFFFF", stroke: "none", "stroke-linejoin": "round" }, g);
    popAnim(g, x, y, at, o.end != null ? num(o.end, D) : null, { from: 0.2, dur: 0.26 });
    return { el: g, x: x, y: y, r: r };
  }

  // ------------------------- inked icons (drawn in a 100 x 100 box centred on 0,0) -------------------------
  var ICONS = {};
  function ic(name, fn) { ICONS[name] = fn; }
  function P(g, d, fill, extra) { return svg("path", Object.assign({ d: d, fill: fill || "none", stroke: C.ink, "stroke-width": 4.5, "stroke-linejoin": "round", "stroke-linecap": "round" }, extra || {}), g); }
  ic("star", function (g) { P(g, polyD(starPts(0, 2, 46, 20, 5)), C.yellow); P(g, "M-8 -18L-4 -28", null, { stroke: "#FFFFFF", "stroke-width": 5 }); });
  ic("heart", function (g) { P(g, "M0 40C-30 18 -46 4 -46 -14C-46 -32 -30 -42 -16 -40C-8 -39 -3 -34 0 -28C3 -34 8 -39 16 -40C30 -42 46 -32 46 -14C46 4 30 18 0 40Z", C.red); P(g, "M-30 -20Q-28 -30 -18 -32", null, { stroke: "#FFFFFF", "stroke-width": 6 }); });
  ic("bolt", function (g) { P(g, "M10 -46L-30 6H-4L-14 46L30 -10H4Z", C.yellow); });
  ic("globe", function (g) { P(g, circD(0, 0, 44), "#5FB8F0"); P(g, "M-20 -34Q-6 -20 -18 -8Q-30 4 -14 14Q-4 22 -10 38M14 -40Q8 -26 22 -20Q38 -14 30 4Q24 16 36 24", "#3FA34D", { "stroke-width": 4 }); P(g, ellD(0, 0, 18, 44) + "M-44 0H44", null, { "stroke-width": 3, opacity: 0.6 }); });
  ic("brain", function (g) { P(g, "M0 -38C-10 -46 -30 -42 -32 -28C-46 -26 -48 -6 -40 2C-48 14 -38 32 -24 30C-20 42 -4 42 0 34C4 42 20 42 24 30C38 32 48 14 40 2C48 -6 46 -26 32 -28C30 -42 10 -46 0 -38Z", "#F7A6C4"); P(g, "M0 -38V34M-20 -16Q-10 -10 -20 0M20 -16Q10 -10 20 0M-24 14Q-14 12 -12 22M24 14Q14 12 12 22", null, { "stroke-width": 3.5 }); });
  ic("clock", function (g) { P(g, circD(0, 0, 44), "#FFFFFF"); P(g, circD(0, 0, 36), null, { "stroke-width": 2.5 }); P(g, "M0 0V-26M0 0L18 10", null, { "stroke-width": 6 }); P(g, circD(0, 0, 4), C.ink); });
  ic("leaf", function (g) { P(g, "M-36 36C-40 -10 -10 -40 40 -40C40 10 10 40 -36 36Z", C.green); P(g, "M-36 36L24 -24M-10 10L-12 -10M4 -4L14 4", null, { "stroke-width": 3.5 }); });
  ic("shield", function (g) { P(g, "M0 -44L38 -30C38 8 24 30 0 44C-24 30 -38 8 -38 -30Z", C.blue); P(g, "M0 -32L26 -22C26 4 16 20 0 32Z", "#5B95E8", { stroke: "none" }); P(g, "M-14 0L-4 12L16 -12", null, { stroke: "#FFFFFF", "stroke-width": 7 }); });
  ic("target", function (g) { P(g, circD(0, 0, 44), C.red); P(g, circD(0, 0, 30), "#FFFFFF"); P(g, circD(0, 0, 16), C.red); P(g, "M0 0L34 -34M24 -38L36 -36L38 -24", null, { "stroke-width": 5 }); });
  ic("rocket", function (g) { P(g, "M-14 30L-30 40L-26 16M14 30L30 40L26 16", C.red); P(g, "M0 -46C22 -30 22 6 14 30H-14C-22 6 -22 -30 0 -46Z", "#FFFFFF"); P(g, circD(0, -10, 9), "#5FB8F0"); P(g, "M-8 30Q0 52 8 30", C.orange); });
  ic("bulb", function (g) { P(g, "M-14 22C-14 8 -32 0 -32 -16C-32 -34 -18 -44 0 -44C18 -44 32 -34 32 -16C32 0 14 8 14 22Z", C.yellow); P(g, "M-14 22H14V32H-14ZM-10 32H10V40H-10Z", "#B8C4D0"); P(g, "M-16 -22Q-14 -32 -4 -34", null, { stroke: "#FFFFFF", "stroke-width": 5 }); P(g, "M-46 -16H-40M40 -16H46M-34 -44L-30 -40M34 -44L30 -40", null, { "stroke-width": 4 }); });
  ic("coin", function (g) { P(g, ellD(0, 6, 40, 36), "#C98F00"); P(g, ellD(0, 0, 40, 36), C.yellow); P(g, "M10 -16Q0 -24 -8 -18Q-16 -10 -2 -4Q14 2 6 12Q-2 20 -12 12M0 -26V-20M0 16V22", null, { "stroke-width": 5 }); });
  ic("book", function (g) { P(g, "M0 -30C-14 -40 -34 -40 -44 -34V36C-34 30 -14 30 0 40C14 30 34 30 44 36V-34C34 -40 14 -40 0 -30Z", "#FFFFFF"); P(g, "M0 -30V40", null); P(g, "M-34 -20H-12M-34 -8H-12M12 -20H34M12 -8H34", null, { "stroke-width": 3 }); P(g, "M-44 -34V36C-34 30 -14 30 0 40", null, { stroke: C.red, "stroke-width": 3 }); });
  ic("gear", function (g) { var p = [], n = 9; for (var i = 0; i < n * 4; i++) { var a = (i / (n * 4)) * TAU, r = i % 4 < 2 ? 44 : 34; p.push([Math.cos(a) * r, Math.sin(a) * r]); } P(g, polyD(p), "#B8C4D0"); P(g, circD(0, 0, 14), "#FFFFFF"); });
  ic("check", function (g) { P(g, circD(0, 0, 44), C.green); P(g, "M-22 2L-6 18L24 -16", null, { stroke: "#FFFFFF", "stroke-width": 10 }); });
  ic("cross", function (g) { P(g, circD(0, 0, 44), C.red); P(g, "M-18 -18L18 18M18 -18L-18 18", null, { stroke: "#FFFFFF", "stroke-width": 10 }); });
  ic("fire", function (g) { P(g, "M0 44C-30 44 -38 18 -30 0C-24 -14 -10 -18 -10 -44C8 -32 14 -16 12 -4C18 -10 20 -18 18 -24C34 -8 38 12 30 26C24 38 14 44 0 44Z", C.orange); P(g, "M0 44C-14 44 -18 30 -12 20C-8 12 0 10 0 -2C10 8 16 18 12 30C10 38 6 44 0 44Z", C.yellow); });
  ic("drop", function (g) { P(g, "M0 -46C16 -22 34 -2 34 16C34 34 18 46 0 46C-18 46 -34 34 -34 16C-34 -2 -16 -22 0 -46Z", "#5FB8F0"); P(g, "M-16 14Q-16 28 -4 32", null, { stroke: "#FFFFFF", "stroke-width": 6 }); });
  ic("eye", function (g) { P(g, "M-46 0Q0 -44 46 0Q0 44 -46 0Z", "#FFFFFF"); P(g, circD(0, 0, 18), C.blue); P(g, circD(0, 0, 8), C.ink); P(g, circD(-6, -6, 4), "#FFFFFF", { stroke: "none" }); });
  ic("lock", function (g) { P(g, "M-22 -6V-20C-22 -36 22 -36 22 -20V-6", null, { "stroke-width": 9 }); P(g, rrD(-32, -8, 64, 52, 8), C.yellow); P(g, circD(0, 12, 7) + "M0 18V30", C.ink); });
  ic("chat", function (g) { P(g, "M-42 -30H42V18H-4L-24 36V18H-42Z", "#FFFFFF"); P(g, "M-26 -14H26M-26 2H12", null, { "stroke-width": 4 }); });
  ic("home", function (g) { P(g, "M-46 0L0 -40L46 0", null, { "stroke-width": 7 }); P(g, "M-34 -8V40H34V-8L0 -36Z", C.yellow); P(g, "M-10 40V14H10V40", C.red); P(g, "M12 -10H26V4H12Z", "#5FB8F0", { "stroke-width": 3 }); });
  ic("user", function (g) { P(g, circD(0, -18, 20), "#F0C39A"); P(g, "M-36 42C-36 14 -20 6 0 6C20 6 36 14 36 42Z", C.blue); });
  ic("users", function (g) { P(g, circD(-18, -14, 15), "#C98A5E"); P(g, "M-44 40C-44 16 -32 8 -18 8C-4 8 8 16 8 40Z", C.red); P(g, circD(18, -18, 17), "#F0C39A"); P(g, "M-10 42C-10 16 4 6 18 6C32 6 44 16 44 42Z", C.blue); });
  ic("trophy", function (g) { P(g, "M-24 -40H24V-10C24 10 12 18 0 18C-12 18 -24 10 -24 -10Z", C.yellow); P(g, "M-24 -30H-40C-40 -10 -30 -4 -22 -4M24 -30H40C40 -10 30 -4 22 -4", null, { "stroke-width": 5 }); P(g, "M-6 18H6V30H-6ZM-22 30H22V42H-22Z", "#C98F00"); });
  ic("music", function (g) { P(g, "M-10 30V-34L34 -44V20", null, { "stroke-width": 7 }); P(g, ellD(-22, 30, 14, 10), C.ink); P(g, ellD(22, 20, 14, 10), C.ink); });
  ic("camera", function (g) { P(g, rrD(-44, -24, 88, 60, 8), "#B8C4D0"); P(g, "M-16 -24L-8 -36H8L16 -24", "#8C9AA8"); P(g, circD(0, 6, 20), C.ink); P(g, circD(0, 6, 12), "#5FB8F0"); P(g, "M26 -14H34", null, { stroke: C.red, "stroke-width": 6 }); });
  ic("phone", function (g) { P(g, rrD(-24, -44, 48, 88, 10), C.ink); P(g, rrD(-18, -34, 36, 62, 4), "#5FB8F0", { "stroke-width": 2 }); P(g, circD(0, 36, 3), "#FFFFFF", { stroke: "none" }); });
  ic("cloud", function (g) { P(g, "M-30 30C-46 30 -50 8 -36 2C-38 -18 -14 -26 -4 -12C2 -30 34 -28 32 -6C48 -6 50 30 30 30Z", "#FFFFFF"); });
  ic("sun", function (g) { var d = ""; for (var i = 0; i < 12; i++) { var a = (i / 12) * TAU; d += "M" + P2(Math.cos(a) * 32, Math.sin(a) * 32) + "L" + P2(Math.cos(a) * 46, Math.sin(a) * 46); } P(g, d, null, { "stroke-width": 6 }); P(g, circD(0, 0, 24), C.yellow); });
  ic("moon", function (g) { P(g, "M10 -44C-20 -40 -38 -12 -30 16C-22 40 6 48 30 36C6 32 -10 12 -8 -12C-6 -28 0 -38 10 -44Z", "#FFF3C4"); });
  ic("pin", function (g) { P(g, "M0 46C-8 30 -32 8 -32 -14C-32 -32 -18 -44 0 -44C18 -44 32 -32 32 -14C32 8 8 30 0 46Z", C.red); P(g, circD(0, -14, 11), "#FFFFFF"); });
  ic("battery", function (g) { P(g, rrD(-40, -22, 76, 44, 6), "#FFFFFF"); P(g, "M36 -10H44V10H36", C.ink); P(g, rrD(-34, -16, 44, 32, 3), C.green, { "stroke-width": 0 }); P(g, "M-2 -12L-14 2H-4L-8 14L6 -2H-4Z", C.yellow, { "stroke-width": 3 }); });
  ic("flask", function (g) { P(g, "M-12 -44H12M-8 -44V-12L-34 34C-38 42 -34 46 -26 46H26C34 46 38 42 34 34L8 -12V-44", "#EAF6FA"); P(g, "M-24 20H24L32 36C34 42 30 44 26 44H-26C-30 44 -34 42 -32 36Z", C.green, { "stroke-width": 0 }); P(g, circD(-6, 30, 4) + circD(8, 24, 3), "#FFFFFF", { stroke: "none" }); });
  ic("chart", function (g) { P(g, "M-44 44H44M-44 44V-44", null, { "stroke-width": 5 }); P(g, "M-34 44V8H-18V44Z", C.blue); P(g, "M-10 44V-10H6V44Z", C.yellow); P(g, "M14 44V-30H30V44Z", C.red); P(g, "M-38 -6L-10 -22L10 -38L36 -44", null, { stroke: C.green, "stroke-width": 5 }); });
  ic("cart", function (g) { P(g, "M-46 -34H-32L-20 20H32L40 -16H-28", "#FFFFFF"); P(g, circD(-16, 34, 7) + circD(26, 34, 7), C.ink); });
  ic("mail", function (g) { P(g, rrD(-44, -30, 88, 60, 6), "#FFFFFF"); P(g, "M-44 -28L0 6L44 -28", null); });
  ic("key", function (g) { P(g, circD(-20, 0, 20), C.yellow); P(g, circD(-20, 0, 7), "#FFFFFF"); P(g, "M0 0H44V14M30 0V12", null, { "stroke-width": 8 }); });
  ic("bell", function (g) { P(g, "M-32 26C-26 18 -26 6 -26 -6C-26 -24 -14 -34 0 -34C14 -34 26 -24 26 -6C26 6 26 18 32 26Z", C.yellow); P(g, "M-8 32Q0 44 8 32", C.ink); P(g, circD(0, -38, 5), C.yellow); });
  ic("plane", function (g) { P(g, "M44 -2C44 -8 36 -10 30 -10H10L-14 -40H-24L-8 -10H-26L-34 -22H-42L-36 0L-42 22H-34L-26 10H-8L-24 40H-14L10 10H30C36 10 44 4 44 -2Z", "#FFFFFF"); P(g, "M18 -4H32", null, { stroke: C.blue, "stroke-width": 5 }); });
  ic("car", function (g) { P(g, "M-46 18V0L-36 -2L-24 -24H20L34 -2L46 2V18Z", C.red); P(g, "M-20 -18H-4V-4H-28ZM4 -18H18L26 -4H4Z", "#5FB8F0", { "stroke-width": 3 }); P(g, circD(-24, 20, 11) + circD(26, 20, 11), C.ink); P(g, circD(-24, 20, 4) + circD(26, 20, 4), "#B8C4D0", { stroke: "none" }); });
  ic("tree", function (g) { P(g, "M-8 44V10H8V44Z", C.brown); P(g, "M0 -46C22 -46 34 -30 30 -14C44 -6 38 22 18 18C10 28 -10 28 -18 18C-38 22 -44 -6 -30 -14C-34 -30 -22 -46 0 -46Z", C.green); });
  ic("mountain", function (g) { P(g, "M-46 40L-12 -26L4 0L18 -40L46 40Z", "#9AA6B2"); P(g, "M18 -40L28 -12L20 -16L12 -10Z", "#FFFFFF", { "stroke-width": 3 }); });
  ic("magnet", function (g) { P(g, "M-34 -36V4C-34 26 -18 40 0 40C18 40 34 26 34 4V-36H14V4C14 14 8 20 0 20C-8 20 -14 14 -14 4V-36Z", C.red); P(g, "M-34 -36H-14V-20H-34ZM14 -36H34V-20H14Z", "#B8C4D0"); });
  ic("robot", function (g) { P(g, rrD(-34, -30, 68, 58, 12), "#B8C4D0"); P(g, rrD(-24, -20, 48, 30, 6), "#1D2633"); P(g, circD(-10, -6, 5) + circD(10, -6, 5), "#5FE3FF", { stroke: "none" }); P(g, "M0 -30V-42", null); P(g, circD(0, -44, 5), C.red); P(g, "M-16 18H16", null, { stroke: C.ink, "stroke-width": 4 }); });
  ic("money", function (g) { P(g, rrD(-46, -26, 92, 52, 4), "#8BE04E"); P(g, circD(0, 0, 14), "#C6EDA8"); P(g, "M6 -6Q0 -12 -5 -8Q-9 -3 0 0Q8 3 4 8Q-1 12 -6 7", null, { "stroke-width": 3.5 }); });
  ic("dna", function (g) { var d = "", e = ""; for (var i = 0; i <= 16; i++) { var y = -44 + i * 5.5, x = Math.sin(i * 0.55) * 22; d += (i ? "L" : "M") + P2(x, y); e += (i ? "L" : "M") + P2(-x, y); } P(g, d, null, { stroke: C.blue, "stroke-width": 7 }); P(g, e, null, { stroke: C.red, "stroke-width": 7 }); });
  ic("warning", function (g) { P(g, "M0 -44L46 40H-46Z", C.yellow); P(g, "M0 -16V14", null, { "stroke-width": 9 }); P(g, circD(0, 28, 4), C.ink); });
  ic("question", function (g) { P(g, circD(0, 0, 44), C.purple); P(g, "M-14 -12Q-14 -28 0 -28Q14 -28 14 -14Q14 -4 0 2V10", null, { stroke: "#FFFFFF", "stroke-width": 9 }); P(g, circD(0, 24, 5), "#FFFFFF", { stroke: "none" }); });
  ic("idea", ICONS.bulb);
  var ICON_ALIAS = { lightbulb: "bulb", light: "bulb", energy: "bolt", power: "bolt", lightning: "bolt", electricity: "bolt", love: "heart", health: "heart", muscle: "heart", muscles: "heart", world: "globe", earth: "globe", planet: "globe", mind: "brain", memory: "brain", think: "brain", time: "clock", nature: "leaf", plant: "leaf", eco: "leaf", safety: "shield", security: "shield", protect: "shield", focus: "target", goal: "target", aim: "target", launch: "rocket", growth: "chart", data: "chart", stats: "chart", graph: "chart", cash: "money", dollar: "money", price: "coin", gold: "coin", learn: "book", read: "book", study: "book", settings: "gear", cog: "gear", machine: "gear", yes: "check", done: "check", ok: "check", no: "cross", stop: "cross", hot: "fire", flame: "fire", water: "drop", rain: "drop", see: "eye", vision: "eye", privacy: "lock", secure: "lock", talk: "chat", message: "chat", speech: "chat", house: "home", person: "user", people: "users", team: "users", win: "trophy", award: "trophy", prize: "trophy", sound: "music", song: "music", photo: "camera", mobile: "phone", weather: "cloud", day: "sun", night: "moon", sleep: "moon", location: "pin", place: "pin", map: "pin", charge: "battery", science: "flask", lab: "flask", chemistry: "flask", shop: "cart", buy: "cart", email: "mail", letter: "mail", unlock: "key", alert: "bell", notification: "bell", travel: "plane", flight: "plane", drive: "car", forest: "tree", climb: "mountain", attract: "magnet", ai: "robot", bot: "robot", computer: "robot", gene: "dna", danger: "warning", risk: "warning", help: "question", why: "question" };
  function iconName(n, label) {
    n = str(n).toLowerCase();
    if (ICONS[n]) return n;
    if (ICON_ALIAS[n]) return ICON_ALIAS[n];
    var ws = contentWords(label || "").concat(str(n).split(/[^a-z]+/));
    for (var i = 0; i < ws.length; i++) { var w = normWord(ws[i]); if (ICONS[w]) return w; if (ICON_ALIAS[w]) return ICON_ALIAS[w]; if (w.length > 4 && ICON_ALIAS[w.replace(/s$/, "")]) return ICON_ALIAS[w.replace(/s$/, "")]; }
    return "star";
  }
  function icon(name, parent, cx, cy, size) {
    var g = svg("g", { class: "cb-icon", transform: "translate(" + P2(cx, cy) + ") scale(" + f2(size / 100 * 1000) / 1000 + ")" }, parent);
    var sh = svg("g", { transform: "translate(5 5)", opacity: 1 }, g);
    ICONS[iconName(name)](sh);
    sh.querySelectorAll("*").forEach(function (n) { if (n.getAttribute("fill") && n.getAttribute("fill") !== "none") n.setAttribute("fill", C.ink); n.setAttribute("stroke", C.ink); });
    ICONS[iconName(name)](svg("g", null, g));
    return g;
  }

  // ------------------------- template helpers -------------------------
  function T(p) { return p && typeof p === "object" ? p : {}; }
  function castOrNone(n) { n = str(n).toLowerCase(); return n === "none" || !n ? null : castName(n) || null; }
  function shrinkRect(r, cx, cy, z) { return { x: cx + (r.x - cx) / z, y: cy + (r.y - cy) / z, w: r.w / z, h: r.h / z }; }
  function insetRect(r, m) { return { x: r.x + m, y: r.y + m, w: Math.max(10, r.w - 2 * m), h: Math.max(10, r.h - 2 * m) }; }
  function interRect(a, b) { return clipRect(a, b); }
  function pullBack(lastAt) {
    var start = Math.max(lastAt, endT(0.9) - 0.5);
    if (start + 0.9 <= D - 0.95 && D - lastAt > 2.2) { camera.page(start, 0.9); return start; }
    return null;
  }
  function firstWord(text) { var t = parseEm(text, false); return t.length ? t[0].t : ""; }
  function lineTime(text, after) {
    var ws = parseEm(text, false).map(function (t) { return t.t; });
    for (var i = 0; i < Math.min(3, ws.length); i++) { if (normWord(ws[i]).length < 1) continue; var f = V.find(ws[i], after || 0); if (f != null && f < (after || 0) + 8) return Math.max(after || 0, f - i * 0.3); }
    return null;
  }
  // Fill one story panel: backdrop, effect, character, caption, line and SFX. Returns the character.
  function storyPanel(P, e, rv, idx, o) {
    o = o || {};
    var bg = e.background ? bgName(e.background) : o.bg || (castOrNone(e.character) ? ["city", "lab", "street", "interior", "sky"][idx % 5] : "action");
    scene(P, bg, { mood: e.mood || o.mood, palette: e.palette || ["red", "blue", "yellow", "purple", "green", "pink"][idx % 6] });
    var eff = str(e.effect).toLowerCase();
    if (eff === "focus") focusLines(P, { at: rv + 0.1, clear: 0.4, opacity: 0.55 });
    if (eff === "speed") speedLines(P, { at: rv, opacity: 0.45 });
    var who = castOrNone(e.character), side = idx % 2 ? 0.3 : 0.7, ch = null;
    var capPos = o.capPos || (side > 0.5 ? "tl" : "tr");
    var cap = null;
    if (o.tab) cap = caption(o.tab, { panel: P, pos: side > 0.5 ? "tl" : "tr", at: rv + 0.08, tone: "dark", label: o.tabLabel, size: o.tabSize, labelSize: o.labelSize });
    if (str(e.caption || e.text)) cap = caption(e.caption || e.text, { panel: P, pos: o.tab ? (side > 0.5 ? "bl" : "br") : capPos, at: rv + 0.14, maxWidth: P.inner.w * (o.tab ? 0.7 : 0.62) });
    if (who) {
      var shot = str(e.shot).toLowerCase() || o.shot || "mid", inn = P.inner, top = inn.y;
      // keep the head clear of the caption and leave room for the balloon above it when the panel is narrow
      var span = { x: inn.x + inn.w * (side - 0.27), w: inn.w * 0.54 };
      [cap, o.tab ? null : null].forEach(function (c) { if (c && c.rect.x < span.x + span.w && span.x < c.rect.x + c.rect.w && c.rect.y < inn.y + inn.h * 0.5) top = Math.max(top, c.rect.y + c.rect.h + u(8)); });
      if (str(e.line)) {
        var bsz = clamp(Math.min(inn.h, inn.w * 0.75) * 0.068, u(26), u(44)), bl0 = layoutText(e.line, { size: bsz, maxWidth: Math.min(inn.w * 0.6, bsz * 13), maxLines: 6, weight: 800, lineHeight: 1.12 });
        var bwE = (bl0.w + bsz * 1.1) * 1.2, bhE = (bl0.h + bsz * 0.9) * 1.3 + u(12);
        if (bwE > inn.w * 0.52) top = Math.max(top, inn.y + bhE * 0.92);
      }
      top = Math.min(top, inn.y + inn.h * 0.42);
      ch = character(who, { panel: P, box: { x: inn.x, y: top, w: inn.w, h: inn.y + inn.h - top }, shot: shot === "silhouette" ? "full" : shot, silhouette: shot === "silhouette", x: side, pose: e.pose || (idx % 3 === 0 ? "point" : idx % 3 === 1 ? "explain" : "stand"), expression: e.expression || "neutral", maxW: 0.5 });
    }
    var bl = null;
    if (str(e.line) && ch) {
      var lt = lineTime(e.line, Math.max(0, rv - 0.4));
      bl = balloon(e.line, { speaker: ch, kind: e.kind, at: lt != null ? Math.max(rv + 0.35, lt) : rv + 0.6 });
    }
    if (str(e.sfx)) {
      var st0 = bl ? Math.max(rv + 0.7, bl.last + 0.1) : rv + 0.6;
      sfx(e.sfx, { panel: P, at: Math.min(st0, endT(0.4)), palette: e.sfxColor || "fire", cameraShake: u(8), burst: false });
    }
    return ch;
  }
  var TPL = {};

  // ---- splash-title: a comic cover ----
  TPL["splash-title"] = function (root, pr) {
    comic(root, { print: pr.print });
    var pg = page(1, { margin: u(22) }), P = pg.panels[0], sr = safeRect(), port = V.isPortrait, m = u(12);
    revealPanel(P, 0, "none");
    scene(P, pr.background || "action", { mood: pr.mood, palette: pr.palette || "red" });
    var title = str(pr.title) || contentWords(V.narration).slice(0, 3).join(" ") || "The Story";
    var kt = kwFind(pr.keyword || contentWords(title)[0], 0);
    if (kt == null) kt = Math.min(1.2, D * 0.25);
    kt = clamp(kt, 0.5, endT(1.4));
    var who = castOrNone(pr.character == null ? "ace" : pr.character), ch = null;
    var issueH = str(pr.issue) ? u(70) : 0;
    var logoBox, charBox;
    if (port) {
      logoBox = { x: sr.x + m, y: sr.y + issueH + m, w: sr.w - 2 * m, h: sr.h * 0.27 };
      charBox = { x: sr.x + sr.w * 0.1, y: logoBox.y + logoBox.h + u(20), w: sr.w * 0.8, h: 0 };
      charBox.h = sr.y + sr.h - u(112) - charBox.y;
    } else {
      logoBox = who ? { x: sr.x + m, y: sr.y + issueH + sr.h * 0.04, w: sr.w * 0.58 - 2 * m, h: sr.h * 0.48 } : { x: sr.x + sr.w * 0.08, y: sr.y + sr.h * 0.16, w: sr.w * 0.84, h: sr.h * 0.5 };
      charBox = { x: sr.x + sr.w * 0.6, y: sr.y + sr.h * 0.02, w: sr.w * 0.4 - m, h: sr.h * 0.98 - m };
    }
    if (who) {
      ch = character(who, { panel: P, box: charBox, shot: "full", pose: pr.pose || "hips", expression: "neutral", facing: port ? "right" : "left", at: 0.15, enter: "pop", maxW: 0.9 });
    }
    if (str(pr.issue)) caption(pr.issue, { panel: P, x: (sr.x + m - P.bbox.x) / P.bbox.w, y: (sr.y + m - P.bbox.y) / P.bbox.h, tone: "white", at: 0.3, size: u(30) });
    var lg = logo(title, { x: logoBox.x + logoBox.w / 2, y: logoBox.y + logoBox.h / 2, maxW: logoBox.w * 0.94, maxH: logoBox.h, at: kt - 0.05, palette: pr.palette || "red", arc: port ? 0.25 : 0.18 });
    if (ch) ch.expr(pr.expression || "grin", lg.land);
    var under = lg.rect.y + lg.rect.h + u(26);
    if (str(pr.subtitle)) {
      var subT = labelTime(pr.subtitle, null, kt + 0.2);
      subT = clamp(subT == null ? lg.land + 0.4 : Math.max(subT, lg.land + 0.15), 0.3, endT(0.3));
      var cy = port ? sr.y + sr.h - u(104) : under;
      var cw = port ? sr.w * 0.9 : logoBox.w * 0.9, cx = port ? sr.x + sr.w * 0.05 : logoBox.x + logoBox.w * 0.05;
      caption(pr.subtitle, { panel: P, x: (cx - P.bbox.x) / P.bbox.w, y: (cy - P.bbox.y) / P.bbox.h, at: subT, maxWidth: cw, size: u(34) });
    }
    if (str(pr.sfx)) {
      // beside the title, never on it or on the hero's face
      var sz = u(port ? 80 : 86), occ = occAt(P, 0, D + 1).concat([{ r: lg.rect, kind: "logo" }]);
      var cands = port ? [[sr.x + sr.w * 0.8, logoBox.y + logoBox.h + u(70)], [sr.x + sr.w * 0.2, logoBox.y + logoBox.h + u(70)], [sr.x + sr.w * 0.78, sr.y + u(50)]] : [[logoBox.x + logoBox.w * 0.8, under + u(130)], [logoBox.x + logoBox.w * 0.75, sr.y + sr.h * 0.86], [logoBox.x + logoBox.w * 0.9, lg.rect.y - u(40)]];
      var sp = bestSpot(cands, sz * 3.2, sz * 1.6, insetRect(sr, m), occ, 1);
      sfx(pr.sfx, { x: sp.x + sp.w / 2, y: sp.y + sp.h / 2, at: Math.min(lg.land + 0.35, endT(0.4)), palette: pr.palette === "blue" ? "zap" : "pow", size: sz, rotate: -10, burst: true, bounds: insetRect(sr, m) });
    }
  };

  // ---- panel-sequence: the workhorse ----
  TPL["panel-sequence"] = function (root, pr) {
    comic(root, { print: pr.print });
    var items = arr(pr.panels).map(obj).filter(function (e) { return str(e.caption) || str(e.line) || e.character; }).slice(0, 6);
    if (!items.length) items = [{ caption: contentWords(V.narration).slice(0, 8).join(" ") || "..." }, { caption: "" }];
    if (items.length === 1) items.push({ caption: "", background: "action" });
    var n = items.length, lay = str(pr.layout).toLowerCase();
    if (["grid", "feature", "strip"].indexOf(lay) < 0) lay = n === 3 ? "feature" : "grid";
    var pg = page(n, { kind: lay, seed: n });
    var lands = seqTimes(items.map(function (e) { return e.caption || e.line || ""; }), items.map(function (e) { return e.keyword; }), { gap: 1.3, first: 0.1 });
    var follow = str(pr.camera).toLowerCase() !== "page", last = 0;
    items.forEach(function (e, i) {
      var P = pg.panels[i], rv = i ? Math.max(lands[i] - 0.35, last + 1.0) : 0.1;
      rv = Math.min(rv, endT(1.2));
      last = rv;
      revealPanel(P, rv, i ? "wipe" : "pop");
      if (follow) camera.focus(P, i ? rv - 0.4 : 0, i ? 0.6 : 0.01);
      storyPanel(P, e, rv, i, { mood: pr.mood });
    });
    if (follow) pullBack(last + 2.0);
  };

  // ---- dialogue-panels ----
  TPL["dialogue-panels"] = function (root, pr) {
    comic(root, { print: pr.print });
    var L = castOrNone(pr.left) || "sam", R = castOrNone(pr.right) || (L === "nova" ? "pip" : "nova");
    if (R === L) R = L === "nova" ? "pip" : "nova";
    var lines = arr(pr.lines).map(obj).filter(function (l) { return str(l.text); }).slice(0, 6);
    if (!lines.length) lines = [{ speaker: "left", text: V.narration || "Hello!" }];
    lines.forEach(function (l) { l.speaker = str(l.speaker).toLowerCase() === "right" ? "right" : "left"; });
    var np = clamp(lines.length, 2, 4), groups = [], k = 0;
    for (var i = 0; i < np; i++) { var cnt = Math.floor(lines.length / np) + (i < lines.length % np ? 1 : 0); groups.push(lines.slice(k, k + cnt)); k += cnt; }
    if (!groups[groups.length - 1].length) groups[groups.length - 1] = [];
    var pg = page(np, { kind: np === 3 ? "feature" : "grid", seed: 1 });
    var setting = pr.setting || "lab", prev = 0, last = 0;
    var times = lines.map(function (l) { var t = lineTime(l.text, prev); if (t != null) prev = t + 0.3; return t; });
    times = spread(times, 0.35, endT(1.5));
    for (i = 1; i < times.length; i++) if (times[i] < times[i - 1] + 0.8) times[i] = times[i - 1] + 0.8;
    var li = 0;
    groups.forEach(function (gr, gi) {
      var P = pg.panels[gi], t0 = gr.length ? times[li] : last + 1.2, rv = gi ? Math.min(endT(1.0), Math.max(t0 - 0.35, last + 0.9)) : 0.1;
      last = rv;
      revealPanel(P, rv, gi ? "wipe" : "pop");
      camera.focus(P, gi ? rv - 0.4 : 0, gi ? 0.6 : 0.01);
      var speakers = {};
      gr.forEach(function (l) { speakers[l.speaker] = 1; });
      var two = gi === 0 || Object.keys(speakers).length > 1 || !gr.length;
      scene(P, setting, { mood: pr.mood });
      var chs = {};
      if (two) {
        chs.left = character(L, { panel: P, shot: "mid", x: 0.27, facing: "right", pose: "stand", maxW: 0.42 });
        chs.right = character(R, { panel: P, shot: "mid", x: 0.73, facing: "left", pose: "stand", maxW: 0.42 });
      } else {
        var who = gr[0].speaker;
        chs[who] = character(who === "left" ? L : R, { panel: P, shot: "close", x: who === "left" ? 0.24 : 0.76, facing: who === "left" ? "right" : "left", maxW: 0.44 });
        if ((gr[0].kind || "") === "shout") focusLines(P, { at: rv + 0.1, clear: 0.42, opacity: 0.4 });
      }
      gr.forEach(function (l) {
        var at = Math.max(rv + 0.3, times[li]), sp = chs[l.speaker], other = chs[l.speaker === "left" ? "right" : "left"];
        if (sp) {
          sp.expr(l.expression || "neutral", Math.max(0, at - 0.1));
          if (l.kind === "shout") sp.pose("shock", at - 0.1);
          else if (l.speaker === "right" ? R === "nova" || R === "bolt" : L === "nova" || L === "bolt") sp.pose("explain", at - 0.1);
        }
        if (other) other.expr(l.reaction || "neutral", Math.max(0, at));
        balloon(l.text, { speaker: sp || null, panel: P, kind: l.kind, at: at });
        li++;
      });
    });
    pullBack(last + 2.2);
  };

  // ---- big-reveal ----
  TPL["big-reveal"] = function (root, pr) {
    comic(root, { print: pr.print });
    var port = V.isPortrait, who = castOrNone(pr.character == null ? "nova" : pr.character), sr = safeRect(), g2 = u(11);
    // set-up (A) and reaction (C) share one side, the reveal (B) takes the other
    var a = sr, polys;
    if (port) {
      var yA = a.y + a.h * 0.4, xs = a.x + a.w * (who ? 0.6 : 1);
      polys = [[[a.x, a.y], [xs - g2, a.y], [xs - g2 - u(14), yA - g2], [a.x, yA - g2 + u(10)]], [[a.x, yA + g2 + u(10)], [a.x + a.w, yA + g2 - u(10)], [a.x + a.w, a.y + a.h], [a.x, a.y + a.h]]];
      if (who) polys.push([[xs + g2, a.y], [a.x + a.w, a.y], [a.x + a.w, yA - g2 - u(10)], [xs + g2 - u(14), yA - g2]]);
    } else {
      var xA = a.x + a.w * 0.44, yC = a.y + a.h * (who ? 0.6 : 1);
      polys = [[[a.x, a.y], [xA - g2 + u(14), a.y], [xA - g2, yC - g2], [a.x, yC - g2]], [[xA + g2 + u(14), a.y], [a.x + a.w, a.y], [a.x + a.w, a.y + a.h], [xA + g2 - u(14), a.y + a.h]]];
      if (who) polys.push([[a.x, yC + g2], [xA - g2, yC + g2], [xA - g2 - u(6), a.y + a.h], [a.x, a.y + a.h]]);
    }
    var pg = page(polys.length, { polys: polys });
    var A = pg.panels[0], B = pg.panels[1], Cn = pg.panels[2];
    var reveal = str(pr.reveal) || "Surprise!";
    var kt = kwFind(pr.keyword || contentWords(reveal)[0], 0);
    if (kt == null) kt = D * 0.5;
    kt = clamp(kt, 1.2, endT(1.6));
    revealPanel(A, 0.1, "pop");
    camera.focus(A, 0, 0.01);
    scene(A, pr.background || "lab", { mood: pr.mood });
    var ch = null;
    if (str(pr.setup)) caption(pr.setup, { panel: A, pos: "tl", at: 0.3, maxWidth: A.inner.w * 0.66 });
    if (who) {
      var cap0 = st.occ.filter(function (o) { return o.panel === A && o.kind === "caption"; })[0], top = A.inner.y;
      if (cap0 && cap0.r.x + cap0.r.w > A.inner.x + A.inner.w * 0.45) top = cap0.r.y + cap0.r.h + u(6);
      ch = character(who, { panel: A, box: { x: A.inner.x, y: top, w: A.inner.w, h: A.inner.y + A.inner.h - top }, shot: "mid", x: 0.7, pose: "think", expression: "think", facing: "left", maxW: 0.5 });
      ch.expr("shock", kt);
    }
    // crash zoom: punch past the reveal panel, then settle on it
    revealPanel(B, kt - 0.06, "flash");
    var bc = [B.bbox.x + B.bbox.w / 2, B.bbox.y + B.bbox.h / 2];
    camera.to(bc[0], bc[1], 1.45, kt - 0.22, 0.2, "inExpo");
    camera.focus(B, kt + 0.02, 0.45, { ease: "outCubic" });
    camera.flash(kt, 0.9);
    camera.shake(kt + 0.02, u(16), 0.5);
    var rbg = pr.revealBackground || "focus", pal = pr.palette || "red";
    scene(B, rbg, { palette: rbg === "focus" ? null : pal, mood: pr.mood });
    var bx = panelBounds(B, u(16)), cx = bx.x + bx.w / 2, cy = bx.y + bx.h * (port ? 0.42 : 0.44);
    var lw = bx.w * 0.92, lh = bx.h * (port ? 0.5 : 0.56);
    burst({ x: cx, y: cy, r: Math.min(lw * 0.54, lh * 0.95), aspect: clamp(lh / lw * 1.4, 0.55, 0.95), fill: palOf(pal)[1], fill2: "#FFD23F", at: kt, spikes: 16, abs: true, parent: B.page.over });
    var lg = logo(reveal, { x: cx, y: cy, maxW: lw * 0.82, maxH: lh * 0.7, at: kt + 0.02, palette: pal === "red" ? "blue" : "red", panel: B, shake: false });
    occupy(B, { x: cx - lw * 0.5, y: cy - lh * 0.55, w: lw, h: lh * 1.1 }, kt, D + 1, "logo");
    if (Cn && who) {
      var ct = Math.min(lg.land + 0.35, endT(0.5));
      revealPanel(Cn, ct, "pop");
      scene(Cn, "halftone", { palette: "yellow" });
      character(who, { panel: Cn, shot: "close", x: 0.5, expression: "shock", maxW: 0.9 });
      focusLines(Cn, { at: ct, clear: 0.5, opacity: 0.35 });
    }
    if (str(pr.sfx)) sfx(pr.sfx, { panel: B, at: Math.min(lg.land + 0.3, endT(0.4)), palette: "pow", burst: false, cameraShake: u(10), size: Math.min(bx.w, bx.h) * 0.17 });
  };

  // ---- versus ----
  TPL["versus"] = function (root, pr) {
    comic(root, { print: pr.print });
    var port = V.isPortrait || W / H < 1.15, sr = safeRect(), g2 = u(12);
    var a = sr, polys;
    if (port) { var yl = a.y + a.h * 0.56, yr = a.y + a.h * 0.44; polys = [[[a.x, a.y], [a.x + a.w, a.y], [a.x + a.w, yr - g2], [a.x, yl - g2]], [[a.x, yl + g2], [a.x + a.w, yr + g2], [a.x + a.w, a.y + a.h], [a.x, a.y + a.h]]]; }
    else { var xt = a.x + a.w * 0.56, xb = a.x + a.w * 0.44; polys = [[[a.x, a.y], [xt - g2, a.y], [xb - g2, a.y + a.h], [a.x, a.y + a.h]], [[xt + g2, a.y], [a.x + a.w, a.y], [a.x + a.w, a.y + a.h], [xb + g2, a.y + a.h]]]; }
    var pg = page(2, { polys: polys });
    var sides = [obj(pr.left), obj(pr.right)], defs = [{ palette: "red", character: "ace" }, { palette: "blue", character: "vex" }];
    var keys = [];
    sides.forEach(function (sd) { keys.push(str(sd.name)); arr(sd.points).slice(0, 3).forEach(function (pt) { keys.push(str(pt)); }); });
    var lands = seqTimes(keys, null, { gap: 0.5, first: 0.15 }), li = 0, lastT = 0;
    var cx = sr.x + sr.w / 2, vr = Math.min(sr.w, sr.h) * (port ? 0.17 : 0.19);
    var cy = port ? sr.y + sr.h / 2 : sr.y + sr.h - vr * 1.0;
    sides.forEach(function (sd, i) {
      var P = pg.panels[i], d = defs[i], pal = sd.palette || d.palette, who = castOrNone(sd.character == null ? d.character : sd.character);
      var rv = i ? Math.max(0.6, lands[li] - 0.3) : 0.1;
      revealPanel(P, rv, i ? "wipe" : "pop");
      scene(P, "action", { palette: pal, cx: port ? 0.5 : i ? 0.65 : 0.35, cy: port ? (i ? 0.62 : 0.38) : 0.5 });
      var inn = P.inner, L = i === 0, nameBox, charBox;
      if (port) {
        nameBox = { x: inn.x + inn.w * (L ? 0.03 : 0.4), y: L ? inn.y + inn.h * 0.04 : inn.y + inn.h * 0.24, w: inn.w * 0.57, h: inn.h * 0.2 };
        charBox = { x: inn.x + inn.w * (L ? 0.6 : 0), y: L ? inn.y : inn.y + inn.h * 0.12, w: inn.w * 0.4, h: L ? inn.h * 0.86 : inn.h * 0.88 };
      } else {
        nameBox = { x: inn.x + (L ? inn.w * 0.03 : inn.w * 0.4), y: inn.y + inn.h * 0.04, w: inn.w * 0.57, h: inn.h * 0.18 };
        charBox = { x: inn.x + inn.w * (L ? 0.5 : 0.04), y: inn.y + inn.h * 0.08, w: inn.w * 0.46, h: inn.h * 0.92 };
      }
      if (who) character(who, { panel: P, box: charBox, shot: "mid", x: L ? 0.42 : 0.58, facing: L ? "right" : "left", pose: sd.pose || "fight", expression: sd.expression || "determined", maxW: 0.95, at: rv + 0.1, enter: "slide" });
      var nm = str(sd.name) || (L ? "Them" : "Us");
      var lgN = logo(nm, { x: nameBox.x + nameBox.w / 2, y: nameBox.y + nameBox.h / 2, maxW: nameBox.w, maxH: nameBox.h, at: Math.max(rv + 0.15, lands[li]), palette: pal, shake: false });
      occupy(P, lgN.rect, 0, D + 1, "logo");
      li++;
      var py = lgN.rect.y + lgN.rect.h + u(16), px = L || port ? nameBox.x : inn.x + inn.w * 0.42;
      if (!L && port) px = inn.x + inn.w * 0.46;
      arr(sd.points).slice(0, 3).forEach(function (pt) {
        var t = Math.max(rv + 0.4, lands[li++]);
        var cap = caption(pt, { panel: P, x: (px - P.bbox.x) / P.bbox.w, y: (py - P.bbox.y) / P.bbox.h, tone: "white", at: t, maxWidth: inn.w * (port ? 0.5 : 0.46), size: u(port ? 32 : 32) });
        py = cap.y + cap.h + u(14);
        lastT = Math.max(lastT, t);
      });
      lastT = Math.max(lastT, rv);
    });
    var kt = kwFind(pr.keyword || "vs", lastT);
    kt = clamp(kt == null ? lastT + 0.8 : Math.max(kt, lastT + 0.3), 1.0, endT(0.8));
    burst({ x: cx, y: cy, r: vr, spikes: 12, fill: "#FFD23F", fill2: "#FFFFFF", at: kt, abs: true });
    var vs = logo(str(pr.vs) || "VS", { x: cx, y: cy, maxW: vr * 1.2, maxH: vr * 0.85, at: kt + 0.02, palette: "red", shake: true });
    camera.flash(kt, 0.6);
    if (str(pr.sfx)) {
      var sz = vr * 0.5, sw = letterSizes(str(pr.sfx).toUpperCase(), sz).w + sz * 0.3;
      var ss = port ? [[cx - vr * 1.15 - sw / 2, cy + vr * 0.55], [cx + vr * 1.15 + sw / 2, cy - vr * 0.55], [cx, cy + vr * 1.6]] : [[cx, sr.y + sz * 0.9], [cx, cy - vr * 1.4]];
      var occ = st.occ.filter(function (o) { return o.kind !== "body"; }).concat([{ r: { x: cx - vr, y: cy - vr, w: vr * 2, h: vr * 2 }, kind: "logo" }]);
      var sp = bestSpot(ss, sw, sz * 1.5, insetRect(sr, u(10)), occ, 0.5);
      sfx(pr.sfx, { x: sp.x + sp.w / 2, y: sp.y + sp.h / 2, at: Math.min(vs.land + 0.25, endT(0.4)), palette: "pow", size: sz, rotate: -6, bounds: insetRect(sr, u(10)) });
    }
  };

  // ---- caption-narration ----
  TPL["caption-narration"] = function (root, pr) {
    comic(root, { print: pr.print });
    var pg = page(1, { margin: u(22) }), P = pg.panels[0], sr = safeRect(), port = V.isPortrait;
    revealPanel(P, 0, "none");
    scene(P, pr.background || "city", { mood: pr.mood || "night" });
    if (pr.weather) weather(P, pr.weather);
    var caps = arr(pr.captions).map(function (c) { return typeof c === "string" ? { text: c } : obj(c); }).filter(function (c) { return str(c.text); }).slice(0, 5);
    if (!caps.length) caps = [{ text: V.narration || "..." }];
    var who = castOrNone(pr.character);
    // The camera pushes in by Z around the safe-area centre: keep everything inside the shrunk area.
    var Z = 1.1, zc = [sr.x + sr.w / 2, sr.y + sr.h / 2], keep = insetRect(shrinkRect(sr, zc[0], zc[1], Z), u(6));
    var lands = seqTimes(caps.map(function (c) { return c.text; }), caps.map(function (c) { return c.keyword; }), { gap: 0.9, first: 0.2 });
    var colW = port ? keep.w * 0.86 : keep.w * (who ? 0.52 : 0.66), y = keep.y + (pr.label ? u(30) : 0), bottom = keep.y;
    caps.forEach(function (c, i) {
      var right = port ? i % 2 === 1 : false, xL = port ? keep.x + (right ? keep.w - colW : 0) : keep.x + (who ? 0 : (i % 2) * (keep.w - colW));
      var cap = caption(c.text, { screen: true, x: 0, y: 0, at: lands[i], tone: c.tone || (i % 2 ? "white" : "yellow"), label: i === 0 ? pr.label : "", maxWidth: colW, size: u(port ? 38 : 40) });
      var tx = (right ? xL + colW - cap.w : xL) - cap.x, ty = y + (cap.y - cap.rect.y) - cap.y;
      cap.el.parentNode.removeChild(cap.el);
      var wrapG = svg("g", { transform: "translate(" + P2(tx, ty) + ")" }, st.screen);
      wrapG.appendChild(cap.el);
      var rr = { x: cap.rect.x + tx, y: cap.rect.y + ty, w: cap.rect.w, h: cap.rect.h };
      st.items[st.items.length - 1].rect = (function (r) { return function () { return r; }; })(rr);
      y = rr.y + rr.h + u(22);
      bottom = rr.y + rr.h;
    });
    if (who) {
      var shot = str(pr.shot).toLowerCase() || "silhouette";
      var box = port ? { x: keep.x + keep.w * 0.12, y: Math.max(bottom + u(20), keep.y + keep.h * 0.35), w: keep.w * 0.76, h: 0 } : { x: keep.x + keep.w * 0.56, y: keep.y + keep.h * 0.06, w: keep.w * 0.44, h: keep.h * 0.94 };
      if (port) box.h = keep.y + keep.h - box.y;
      character(who, { panel: P, box: box, shot: shot === "mid" ? "mid" : "full", silhouette: shot === "silhouette", pose: pr.pose || (shot === "silhouette" ? "crossed" : "stand"), expression: pr.expression || "smirk", facing: port ? "right" : "left", maxW: 0.9 });
    }
    camera.to(zc[0] - (zc[0] - W / 2) / Z, zc[1] - (zc[1] - H / 2) / Z, Z, 0.05, Math.max(1, endT(0) - 0.1), "inOutSine");
    camera.drift(0);
  };

  // ---- stat-burst ----
  TPL["stat-burst"] = function (root, pr) {
    comic(root, { print: pr.print });
    var port = V.isPortrait || W / H < 1.15, sr = safeRect(), who = castOrNone(pr.character == null ? "pip" : pr.character);
    var pg = page(1, { margin: u(22), inset: who ? { panel: 0, corner: port ? "b" : "br", size: V.isPortrait ? 0.42 : port ? 0.27 : 0.36, aspect: port ? 1.5 : 1.15 } : null }), P = pg.panels[0], I = pg.panels[1];
    revealPanel(P, 0, "none");
    var pal = pr.palette || "red";
    var cx = port ? sr.x + sr.w / 2 : sr.x + sr.w * (who ? 0.4 : 0.5), cy = port ? sr.y + sr.h * (who ? 0.28 : 0.4) : sr.y + sr.h * 0.4;
    scene(P, pr.background || "action", { palette: pal, mood: pr.mood, cx: (cx - P.bbox.x) / P.bbox.w, cy: (cy - P.bbox.y) / P.bbox.h });
    var val = num(pr.value, 0), dec = clamp(Math.round(num(pr.decimals, Math.abs(val) < 10 && val % 1 ? 1 : 0)), 0, 3);
    var fmt = function (v) { return str(pr.prefix) + V.format(v, dec) + (pr.suffix != null ? String(pr.suffix) : ""); };
    var finalT = fmt(val);
    var kt = kwFind(pr.keyword, 0);
    if (kt == null) kt = labelTime(pr.label, null, 0);
    if (kt == null) kt = D * 0.3;
    kt = clamp(kt, 0.3, endT(1.6));
    var cdur = clamp(D * 0.18, 0.9, 1.6), land = Math.min(kt + cdur, endT(0.2));
    var bw = port ? sr.w * 0.96 : sr.w * (who ? 0.7 : 0.8), bh = port ? sr.h * 0.36 : sr.h * 0.58;
    burst({ x: cx, y: cy, r: bw * 0.52, aspect: clamp(bh / bw, 0.5, 1), spikes: 18, fill: "#FFD23F", fill2: "#FFFFFF", at: Math.max(0.1, kt - 0.15), abs: true });
    // counting 3D number (whole-string layers so the digits can change)
    var size = Math.min(bh * 0.42, (bw * 0.7) / Math.max(1, letterSizes(finalT, 100).w / 100));
    var ng = svg("g", { class: "cb-number" }, pg.over), pal2 = logoPal(pal === "yellow" ? "blue" : "red");
    var depth = size * 0.1, steps = 8, layers = [], base = { "font-family": FONT, "font-size": f2(size), "font-weight": 900, "font-style": "italic", "text-anchor": "middle", "stroke-linejoin": "round", style: "font-variant-numeric: tabular-nums" };
    for (var i = steps; i >= 0; i--) layers.push(svg("text", Object.assign({ x: f2(cx + depth * 0.7 * i / steps), y: f2(cy + size * 0.36 + depth * 0.7 * i / steps), fill: C.ink, stroke: C.ink, "stroke-width": f2(size * 0.16) }, base), ng));
    for (i = steps; i >= 1; i--) layers.push(svg("text", Object.assign({ x: f2(cx + depth * 0.7 * i / steps), y: f2(cy + size * 0.36 + depth * 0.7 * i / steps), fill: pal2[1] }, base), ng));
    layers.push(svg("text", Object.assign({ x: f2(cx), y: f2(cy + size * 0.36), fill: pal2[0], stroke: C.ink, "stroke-width": f2(size * 0.04) }, base), ng));
    st.anims.push(function (t) {
      var on = t >= kt;
      ng.style.display = on ? "" : "none";
      if (!on) return;
      var q = EASE.outCubic(prog(t, kt, land)), s2 = fmt(val * q), k = t < land ? 1 : lerp(1.18, 1, EASE.outBack(prog(t, land, land + 0.3)));
      if (t < kt + 0.2) k = lerp(0.4, 1, EASE.outBack(prog(t, kt, kt + 0.2)));
      layers.forEach(function (n) { if (n.textContent !== s2) n.textContent = s2; });
      ng.setAttribute("transform", "translate(" + P2(cx, cy) + ") scale(" + f2(k * 1000) / 1000 + ") translate(" + P2(-cx, -cy) + ")");
    });
    var nw = letterSizes(finalT, size).w;
    emitItem("number", finalT, null, { x: cx - nw / 2, y: cy - size * 0.55, w: nw + depth, h: size * 1.1 }, kt, null);
    camera.shake(land - 0.05, u(12), 0.4);
    var labelBottom = cy + bh * 0.5;
    if (str(pr.label)) {
      var lt = labelTime(pr.label, null, 0);
      lt = clamp(lt == null ? kt + 0.3 : Math.min(lt, kt + 0.2), 0.25, endT(0.3));
      var ly = cy + bh * (port ? 0.56 : 0.58), lwid = port ? sr.w * 0.9 : bw * 0.9;
      var cap = caption(pr.label, { panel: P, x: 0, y: (ly - P.bbox.y) / P.bbox.h, at: lt, maxWidth: lwid, size: u(port ? 40 : 40) });
      // centre the label under the burst
      var dx = cx - (cap.x + cap.w / 2);
      cap.el.setAttribute("transform", "translate(" + f2(dx) + " 0)");
      var wrapG = svg("g", { transform: "translate(" + f2(dx) + " 0)" }, cap.el.parentNode);
      wrapG.appendChild(cap.el);
      cap.el.removeAttribute("transform");
      var it = st.items[st.items.length - 1], r0 = it.rect();
      it.rect = (function (r) { return function () { return r; }; })({ x: r0.x + dx, y: r0.y, w: r0.w, h: r0.h });
      labelBottom = cap.y + cap.h;
    }
    if (I && who) {
      revealPanel(I, Math.min(land + 0.1, endT(0.4)), "pop");
      scene(I, "halftone", { palette: pal === "yellow" ? "blue" : "yellow" });
      var ch = character(who, { panel: I, shot: "close", x: 0.5, expression: "neutral", maxW: 0.9 });
      ch.expr(pr.expression || "shock", Math.min(land + 0.1, endT(0.4)));
    }
    if (str(pr.sfx)) {
      var sz = u(port ? 80 : 90), sx = port ? sr.x + sr.w * 0.72 : cx + bw * 0.36, sy = port ? cy - bh * 0.62 : cy - bh * 0.5;
      sfx(pr.sfx, { x: sx, y: Math.max(sr.y + sz * 0.8, sy), at: Math.min(land + 0.15, endT(0.4)), palette: "pow", size: sz, rotate: 10, bounds: insetRect(sr, u(10)) });
    }
  };

  // ---- origin-story ----
  TPL["origin-story"] = function (root, pr) {
    comic(root, { print: pr.print });
    var evs = arr(pr.events).map(obj).filter(function (e) { return str(e.text) || str(e.date); }).slice(0, 6);
    if (evs.length < 2) evs = evs.concat([{ date: "Then", text: "" }, { date: "Now", text: "" }]).slice(0, 2);
    var n = evs.length, pg = page(n, { kind: n <= 3 ? "strip" : "grid", seed: 3 });
    var lands = seqTimes(evs.map(function (e) { return str(e.date) + " " + str(e.text); }), evs.map(function (e) { return e.keyword || e.date; }), { gap: 1.3, first: 0.1 }), last = 0;
    evs.forEach(function (e, i) {
      var P = pg.panels[i], rv = i ? Math.min(endT(1.2), Math.max(lands[i] - 0.35, last + 1.0)) : 0.1;
      last = rv;
      revealPanel(P, rv, i ? "wipe" : "pop");
      camera.focus(P, i ? rv - 0.4 : 0, i ? 0.6 : 0.01);
      storyPanel(P, { caption: e.text, background: e.background || ["lab", "interior", "city", "street", "sky", "space"][i % 6], mood: e.mood, character: e.character, pose: e.pose, expression: e.expression, shot: "mid" }, rv, i, { tab: str(e.date) || String(i + 1), tabLabel: i === 0 ? str(pr.title) : "", tabSize: u(34), labelSize: u(30) });
    });
    pullBack(last + 2.0);
  };

  // ---- close-up-reaction ----
  TPL["close-up-reaction"] = function (root, pr) {
    comic(root, { print: pr.print });
    var port = V.isPortrait || W / H < 1.15, sr = safeRect();
    var pg = page(1, { margin: u(22) }), P = pg.panels[0];
    revealPanel(P, 0, "none");
    var bgn = str(pr.background).toLowerCase();
    if (["halftone", "focus", "speed", "action", "plain"].indexOf(bgn) < 0) bgn = "halftone";
    scene(P, bgn, { palette: pr.palette || "pink" });
    var who = castOrNone(pr.character) || "sam";
    var kt = kwFind(pr.keyword, 0);
    if (kt == null) kt = D * 0.4;
    kt = clamp(kt, 0.6, endT(0.9));
    var Z = 1.12;
    var faceBox = port ? { x: sr.x, y: sr.y + sr.h * 0.38, w: sr.w, h: sr.h * 0.62 } : { x: sr.x + sr.w * 0.5, y: sr.y, w: sr.w * 0.5, h: sr.h };
    var zc = [faceBox.x + faceBox.w / 2, faceBox.y + faceBox.h * 0.45];
    var keep = insetRect(shrinkRect(sr, zc[0], zc[1], Z), u(6));
    faceBox = interRect(faceBox, keep);
    var ch = character(who, { panel: P, box: faceBox, shot: "xclose", x: 0.5, y: 0.5, expression: pr.from || "neutral", pose: "stand", maxW: 0.95 });
    ch.expr(pr.expression || "shock", kt);
    var fc = ch.anchor("center");
    focusLines(P, { at: kt, cx: (fc[0] - P.bbox.x) / P.bbox.w, cy: (fc[1] - P.bbox.y) / P.bbox.h, clear: port ? 0.5 : 0.55, opacity: 0.85 });
    var hr = ch.headRect();
    var bnd = port ? { x: keep.x, y: keep.y, w: keep.w, h: Math.max(u(160), hr.y - keep.y - u(30)) } : { x: keep.x, y: keep.y, w: Math.max(u(200), hr.x - keep.x - u(40)), h: keep.h * 0.66 };
    if (str(pr.line)) {
      var lt = lineTime(pr.line, 0);
      balloon(pr.line, { speaker: ch, panel: P, kind: pr.kind || "speech", at: lt == null ? 0.3 : Math.max(0.25, lt), bounds: bnd, size: u(44), maxWidth: bnd.w * 0.9 });
    }
    if (str(pr.sfx)) {
      var sz = u(port ? 80 : 92), sw2 = letterSizes(str(pr.sfx).toUpperCase(), sz).w + sz * 0.4, sh2 = sz * 1.7;
      var cands = port ? [[keep.x + sw2 / 2, keep.y + keep.h - sh2 / 2], [keep.x + keep.w - sw2 / 2, keep.y + keep.h - sh2 / 2], [keep.x + sw2 / 2, hr.y + hr.h * 0.5]] : [[keep.x + sw2 / 2 + u(20), keep.y + keep.h - sh2 / 2], [hr.x - sw2 / 2 - u(10), keep.y + keep.h - sh2 / 2]];
      var spot = bestSpot(cands, sw2, sh2, keep, occAt(P, kt, D + 1), 0.4);
      sfx(pr.sfx, { x: spot.x + spot.w / 2, y: spot.y + spot.h / 2, at: kt + 0.08, palette: "pow", size: sz, rotate: -10, bounds: keep, burst: true });
    }
    camera.to(zc[0] - (zc[0] - W / 2) / Z, zc[1] - (zc[1] - H / 2) / Z, Z, kt - 0.04, 0.2, "outExpo");
    camera.shake(kt + 0.05, u(10), 0.35);
    camera.drift(0.004);
  };

  // ---- page-turn-chapter ----
  TPL["page-turn-chapter"] = function (root, pr) {
    comic(root, { print: pr.print });
    var port = V.isPortrait, sr = safeRect();
    var old = page(3, { kind: "grid", seed: 5 });
    var pb = pr.previousBackground || "city";
    old.panels.forEach(function (P, i) { scene(P, i === 1 ? "street" : pb, { mood: i === 2 ? "night" : pr.mood || "dusk", palette: "purple" }); });
    if (old.panels[1]) character("sam", { panel: old.panels[1], shot: "full", silhouette: true, x: 0.5, pose: "run" });
    caption(str(pr.endCaption) || "To be continued...", { panel: old.panels[old.panels.length - 1], pos: "br", at: 0, tone: "yellow" });
    var pg = page(1, { margin: u(22) }), P = pg.panels[0];
    scene(P, pr.background || "lab", { mood: pr.mood || "day" });
    var turnAt = clamp(D * 0.08, 0.5, 0.8), turnDur = clamp(D * 0.14, 0.8, 1.1);
    pageTurn(turnAt, turnDur);
    var tEnd = turnAt + turnDur;
    var chapter = str(pr.chapter) || "Chapter 1", title = str(pr.title) || "A New Start";
    var ct = kwFind(firstWord(chapter), 0); ct = clamp(ct == null ? tEnd - 0.3 : Math.max(ct, tEnd - 0.4), 0.3, endT(1));
    var tt = labelTime(title, null, ct + 0.2); tt = clamp(tt == null ? ct + 0.8 : Math.max(tt, ct + 0.4), 0.5, endT(0.9));
    var who = castOrNone(pr.character == null ? "sam" : pr.character);
    var top = sr.y + sr.h * (port ? 0.04 : 0.06);
    // banner ribbon
    var bsize = u(port ? 40 : 42), blay = layoutText(chapter, { size: bsize, maxWidth: sr.w * 0.7, maxLines: 1, weight: 900, italic: true });
    var bw = blay.w + bsize * 2.2, bh = blay.h + bsize * 0.7, bx = port ? sr.x + (sr.w - bw) / 2 : sr.x + (who ? sr.w * 0.31 : sr.w * 0.5) - bw / 2, by = top;
    var bg = svg("g", { class: "cb-banner" }, pg.over);
    var nb = bh * 0.5;
    svg("path", { d: polyD([[bx - nb, by + bh * 0.25], [bx + nb * 0.6, by + bh * 0.25], [bx + nb * 0.6, by + bh * 1.25], [bx - nb, by + bh * 1.25], [bx - nb * 0.45, by + bh * 0.75]]), fill: "#9C1F16", stroke: C.ink, "stroke-width": f2(u(4)), "stroke-linejoin": "round" }, bg);
    svg("path", { d: polyD([[bx + bw + nb, by + bh * 0.25], [bx + bw - nb * 0.6, by + bh * 0.25], [bx + bw - nb * 0.6, by + bh * 1.25], [bx + bw + nb, by + bh * 1.25], [bx + bw + nb * 0.45, by + bh * 0.75]]), fill: "#9C1F16", stroke: C.ink, "stroke-width": f2(u(4)), "stroke-linejoin": "round" }, bg);
    svg("rect", { x: f2(bx + u(6)), y: f2(by + u(6)), width: f2(bw), height: f2(bh), fill: C.ink }, bg);
    svg("rect", { x: f2(bx), y: f2(by), width: f2(bw), height: f2(bh), fill: C.red, stroke: C.ink, "stroke-width": f2(u(4.5)) }, bg);
    writeBlock(bg, blay, bx + bw / 2, by + bh / 2, { color: "#FFFFFF" });
    popAnim(bg, bx + bw / 2, by + bh / 2, ct, null, { from: 0.3 });
    emitItem("banner", chapter, P, { x: bx - nb, y: by, w: bw + nb * 2, h: bh * 1.3 }, ct, null);
    var lbox = port ? { x: sr.x, y: by + bh * 1.5, w: sr.w, h: sr.h * 0.27 } : { x: sr.x, y: by + bh * 1.6, w: who ? sr.w * 0.62 : sr.w, h: sr.h * 0.42 };
    var lg = logo(title, { x: lbox.x + lbox.w / 2, y: lbox.y + lbox.h / 2, maxW: lbox.w * 0.96, maxH: lbox.h, at: tt, palette: pr.palette || "red", arc: 0.12 });
    var subY = lg.rect.y + lg.rect.h + u(20);
    if (str(pr.subtitle)) {
      var stt = labelTime(pr.subtitle, null, tt + 0.2); stt = clamp(stt == null ? lg.land + 0.4 : Math.max(stt, lg.land + 0.1), 0.4, endT(0.3));
      caption(pr.subtitle, { panel: P, x: ((port ? sr.x + sr.w * 0.08 : lbox.x + lbox.w * 0.06) - P.bbox.x) / P.bbox.w, y: (subY - P.bbox.y) / P.bbox.h, at: stt, maxWidth: port ? sr.w * 0.84 : lbox.w * 0.88, size: u(34), tone: "white" });
    }
    if (who) {
      var cbx = port ? { x: sr.x + sr.w * 0.2, y: sr.y + sr.h * 0.6, w: sr.w * 0.6, h: sr.h * 0.4 } : { x: sr.x + sr.w * 0.64, y: sr.y + sr.h * 0.08, w: sr.w * 0.36, h: sr.h * 0.92 };
      character(who, { panel: P, box: cbx, shot: port ? "mid" : "full", pose: pr.pose || "wave", expression: "happy", facing: "left", maxW: 0.9 });
    }
  };

  // ---- fact-panels ----
  TPL["fact-panels"] = function (root, pr) {
    comic(root, { print: pr.print });
    var facts = arr(pr.facts).map(function (f) { return typeof f === "string" ? { label: f } : obj(f); }).filter(function (f) { return str(f.label); }).slice(0, 6);
    if (!facts.length) facts = [{ label: "Fact one" }, { label: "Fact two" }];
    if (facts.length === 1) facts.push({ label: "And more", icon: "star" });
    var n = facts.length, sr = safeRect(), port = V.isPortrait, title = str(pr.title), area = sr;
    var tLay = null, tH = 0;
    if (title) { tLay = layoutText(title, { size: u(port ? 46 : 44), maxWidth: sr.w * 0.8, maxLines: 2, weight: 900, italic: true }); tH = tLay.h + u(46); area = { x: sr.x, y: sr.y + tH, w: sr.w, h: sr.h - tH }; }
    var pg = page(n, { area: area, kind: "grid", seed: 4 });
    var lands = seqTimes(facts.map(function (f) { return f.label; }), facts.map(function (f) { return f.keyword; }), { gap: 0.55, first: 0.4 });
    if (title) {
      var tg = svg("g", { class: "cb-title" }, pg.over), tw = tLay.w + u(50), th = tLay.h + u(22), tx = sr.x + (sr.w - tw) / 2, ty = sr.y + u(4);
      svg("rect", { x: f2(tx + u(6)), y: f2(ty + u(6)), width: f2(tw), height: f2(th), fill: C.ink }, tg);
      svg("rect", { x: f2(tx), y: f2(ty), width: f2(tw), height: f2(th), fill: C.red, stroke: C.ink, "stroke-width": f2(u(4.5)) }, tg);
      writeBlock(tg, tLay, tx + tw / 2, ty + th / 2, { color: "#FFFFFF" });
      popAnim(tg, tx + tw / 2, ty + th / 2, 0.15, null, { from: 0.5 });
      emitItem("title", title, null, { x: tx, y: ty, w: tw + u(6), h: th + u(6) }, 0.15, null);
    }
    var pals = ["red", "blue", "yellow", "green", "purple", "pink"];
    facts.forEach(function (f, i) {
      var P = pg.panels[i], at = Math.max(title ? 0.35 : 0.2, lands[i] - 0.2);
      revealPanel(P, at, "pop");
      var pal = palOf(pals[i % pals.length]);
      scene(P, "halftone", { palette: pals[i % pals.length] });
      var inn = P.inner, capH = Math.min(inn.h * 0.34, u(130));
      var iz = Math.min(inn.w * 0.5, (inn.h - capH) * 0.62);
      var icx = inn.x + inn.w / 2 - P.bbox.x, icy = inn.y - P.bbox.y + (inn.h - capH) * 0.52;
      var bg = svg("g", null, P.fg);
      var bpts = starPts(icx, icy, iz * 0.95, iz * 0.72, 14, -90);
      svg("path", { d: polyD(bpts.map(function (q) { return [q[0] + u(7), q[1] + u(7)]; })), fill: C.ink }, bg);
      svg("path", { d: polyD(bpts), fill: "#FFFFFF", stroke: C.ink, "stroke-width": f2(u(4.5)), "stroke-linejoin": "round" }, bg);
      var ig = svg("g", null, P.fg);
      icon(iconName(f.icon, f.label), ig, icx, icy, iz * 0.95);
      popAnim(ig, icx, icy, at + 0.08, null, { from: 0.2, dur: 0.3 });
      var nb = svg("g", null, P.fg), nr2 = Math.min(u(30), inn.w * 0.08), nx = inn.x - P.bbox.x + nr2 + u(8), ny = inn.y - P.bbox.y + nr2 + u(8);
      svg("circle", { cx: f2(nx + u(4)), cy: f2(ny + u(4)), r: f2(nr2), fill: C.ink }, nb);
      svg("circle", { cx: f2(nx), cy: f2(ny), r: f2(nr2), fill: C.ink, stroke: "#FFFFFF", "stroke-width": f2(u(3)) }, nb);
      var nt = svg("text", { x: f2(nx), y: f2(ny + nr2 * 0.42), "text-anchor": "middle", "font-family": FONT, "font-weight": 900, "font-size": f2(nr2 * 1.2), fill: "#FFFFFF" }, nb);
      nt.textContent = String(i + 1);
      caption(f.label, { panel: P, pos: "bottom", at: at + 0.12, tone: "white", maxWidth: inn.w * 0.92, size: clamp(inn.h * 0.08, u(24), u(36)) });
    });
    camera.drift(0.01);
  };

  // ------------------------- public API -------------------------
  function render(id, root, props) {
    var fn = TPL[id];
    if (!fn) throw new Error("Unknown comic template: " + id);
    fn(root || V.root(), T(props));
  }
  function fallback(root, narration) {
    root = root || V.root();
    while (root.firstChild) root.removeChild(root.firstChild);
    st = null;
    comic(root, {});
    var pg = page(1, { margin: u(22) }), P = pg.panels[0];
    scene(P, "action", { palette: "red" });
    var words = contentWords(narration || V.narration).slice(0, 10).join(" ") || "To be continued...";
    var sr = safeRect();
    caption(words, { panel: P, x: (sr.x + sr.w * 0.06 - P.bbox.x) / P.bbox.w, y: (sr.y + sr.h * 0.42 - P.bbox.y) / P.bbox.h, at: 0.2, maxWidth: sr.w * 0.88, size: u(48) });
  }
  // Screen boxes of the lettering and faces visible at time t (tests: safe area and overlaps).
  // Items in a panel the camera is not looking at (less than 70 % of it inside the safe area) are skipped.
  function inspect(t) {
    if (!st) return [];
    t = num(t, V.time());
    var c = camAt(t), mv = camMoving(t), sr = safeRect(), out = [];
    st.items.forEach(function (it) {
      var t0 = typeof it.t0 === "function" ? it.t0() : it.t0;
      if (t0 != null && t < t0) return;
      if (it.t1 != null && t > it.t1) return;
      var p = it.panel;
      if (p && !panelOn(p, t)) return;
      if (p && st.turns.some(function (k) { return k.page === p.page && t > k.at; })) return;
      var r = it.rect();
      if (!r || r.w < 1 || r.h < 1) return;
      if (it.screen) { out.push({ kind: it.kind, label: it.label, x: r.x, y: r.y, w: r.w, h: r.h, moving: false }); return; }
      if (p) {
        var a = proj(p.bbox.x, p.bbox.y, c), b = proj(p.bbox.x + p.bbox.w, p.bbox.y + p.bbox.h, c);
        var pr = { x: a[0], y: a[1], w: b[0] - a[0], h: b[1] - a[1] }, inS = overlapArea(pr, sr) / Math.max(1, pr.w * pr.h);
        if (inS < 0.7 && !mv) return;
      }
      var q0 = proj(r.x, r.y, c), q1 = proj(r.x + r.w, r.y + r.h, c);
      out.push({ kind: it.kind, label: it.label, x: q0[0], y: q0[1], w: q1[0] - q0[0], h: q1[1] - q0[1], moving: mv });
    });
    return out;
  }

  S.comic = comic;
  S.page = page;
  S.panel = function (i) { return panelOf(i); };
  S.panels = function () { var s = need(); return s.cur ? s.cur.panels.slice() : []; };
  S.revealPanel = revealPanel;
  S.scene = scene;
  S.focusLines = focusLines;
  S.speedLines = speedLines;
  S.weather = weather;
  S.pageTurn = pageTurn;
  S.character = character;
  S.cast = CAST_IDS.slice();
  S.castInfo = function () { var o = {}; CAST_IDS.forEach(function (k) { o[k] = { who: CAST[k].who, role: CAST[k].role }; }); return o; };
  S.poses = POSE_IDS.slice();
  S.expressions = EXPR_IDS.slice();
  S.balloon = balloon;
  S.caption = caption;
  S.sfx = sfx;
  S.logo = logo;
  S.lettering = lettering;
  S.burst = burst;
  S.icon = function (name, parent, x, y, size) { return icon(iconName(name), parent || need().cur.over, num(x, W / 2), num(y, H / 2), num(size, u(120))); };
  S.icons = Object.keys(ICONS);
  S.phraseEnd = phraseEnd;
  S.camera = camera;
  S.pattern = pat;
  S.halftone = halftone;
  S.svg = svg;
  S.colors = Object.assign({}, C, { palettes: PAL });
  S.bumpy = bumpy;
  S.safe = safeRect;
  S.measureBlock = measureBlock;
  S.u = u;
  S.find = kwFind;
  S.when = function (word, after, fallbackT) { var t = kwFind(word, after); return t == null ? num(fallbackT, 0.3) : t; };
  S.templates = Object.keys(TPL);
  S.render = render;
  S.inspect = inspect;
  S.flush = function () { if (st) { if (st.dirty) finalizeCam(); frame(V.time()); } };
  S.fallback = fallback;
})();

/* Doodle World engine (style id: doodle-world). Scrappy doodle people inside painted worlds.
 *
 * Architecture
 * - Build time: S.scene(location) makes a scene: a clipped viewport (the whole frame, or a part of it
 *   for split screens) holding parallax layers sky, far, mid, near, ground, action and front. Each layer
 *   is one div with an optional CANVAS (the painted backdrop, painted once at build time with gradients,
 *   layered silhouettes, brush dabs and grain, all from a seeded random) and one SVG in world units for
 *   things that move (fire, sun, characters, props, marks). The frame is 1000 world units tall;
 *   sc.Ww = 1000 x width / height units wide; feet stand on sc.G.
 * - Screen-space layers above all scenes: a static film grain canvas, a vignette, then one SVG for
 *   headlines, callouts, bubbles, counters, indicators, diagrams and captions.
 * - Every drawing call builds its DOM once and pushes an update function of t. ONE V.onFrame(frame)
 *   runs, in order: cameras (pure function of t from eased keys, shakes and a small handheld drift),
 *   world things (actors: pose blend with two-bone IK arms and legs, walk cycle from travelled distance,
 *   blink, look, lip flaps from word times; animals; fire; weather), then overlays (which read the actor
 *   anchors just computed). Nothing depends on the previous frame, so seeking works both ways.
 * - Timing: templates find their key words with kwFind/labelTime (V.find first, then a narration
 *   estimate), fill gaps with spread(), keep the last second still (endT) and squeeze long sequences.
 * - Layout: overlays that need free space (callouts, bubbles) are placed in S.flush(), which runs the
 *   frame at the moment each one appears and scores candidate spots against the boxes on screen then.
 *   Every template has a tall layout (rows become columns, side by side becomes stacked).
 * - Characters: ONE rig for the whole cast (round head, big white eyes, bean torso, thick two-bone
 *   limbs), varied only by proportions, hair and colours; outfits are per era. Kept deliberately simple.
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
  var HFONT = '"Luckiest Guy", "Bangers", Impact, "Arial Black", "Segoe UI Black", "Franklin Gothic Heavy", sans-serif';
  var HAND = '"Patrick Hand", "Segoe Print", "Comic Sans MS", "Chalkboard SE", "Comic Neue", "Noto Sans", cursive';
  var C = {
    ink: "#2B1A12", paper: "#F3D9A6", cream: "#FFF3D6", yellow: "#FFD400", red: "#E8392B", muted: "#8C6B4F",
    white: "#FFFFFF", orange: "#FF8A1E", blue: "#4FB0E6", green: "#6CCB3C", cool: "#4FB0C6", shadow: "rgba(43,26,18,0.28)",
  };
  var HCOL = { yellow: C.yellow, white: C.white, red: C.red, orange: C.orange, blue: C.blue, green: C.green };

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
  function pick(list, v, d) { v = str(v).toLowerCase(); return list.indexOf(v) >= 0 ? v : d; }
  var c1 = 1.70158, c3 = c1 + 1;
  var EASE = {
    linear: function (x) { return x; },
    outQuad: function (x) { return 1 - (1 - x) * (1 - x); },
    outCubic: function (x) { return 1 - Math.pow(1 - x, 3); },
    inCubic: function (x) { return x * x * x; },
    inQuad: function (x) { return x * x; },
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
  function circD(cx, cy, r) { return "M" + P2(cx - r, cy) + "a" + f2(r) + " " + f2(r) + " 0 1 0 " + f2(2 * r) + " 0a" + f2(r) + " " + f2(r) + " 0 1 0 " + f2(-2 * r) + " 0Z"; }
  function ellD(cx, cy, rx, ry) { return "M" + P2(cx - rx, cy) + "a" + f2(rx) + " " + f2(ry) + " 0 1 0 " + f2(2 * rx) + " 0a" + f2(rx) + " " + f2(ry) + " 0 1 0 " + f2(-2 * rx) + " 0Z"; }
  function rrD(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    return "M" + P2(x + r, y) + "H" + f2(x + w - r) + "Q" + P2(x + w, y) + " " + P2(x + w, y + r) + "V" + f2(y + h - r) + "Q" + P2(x + w, y + h) + " " + P2(x + w - r, y + h) + "H" + f2(x + r) + "Q" + P2(x, y + h) + " " + P2(x, y + h - r) + "V" + f2(y + r) + "Q" + P2(x, y) + " " + P2(x + r, y) + "Z";
  }
  // Closed smooth path through points (Catmull-Rom as cubic Beziers).
  function smoothClosed(pts) {
    var n = pts.length, d = "M" + P2(pts[0][0], pts[0][1]);
    for (var i = 0; i < n; i++) {
      var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      d += "C" + P2(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6) + " " + P2(p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6) + " " + P2(p2[0], p2[1]);
    }
    return d + "Z";
  }
  function smoothOpen(pts) {
    var n = pts.length; if (n < 2) return "";
    var d = "M" + P2(pts[0][0], pts[0][1]);
    for (var i = 0; i < n - 1; i++) {
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      d += "C" + P2(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6) + " " + P2(p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6) + " " + P2(p2[0], p2[1]);
    }
    return d;
  }
  // Wobbly (hand-drawn) closed blob around an ellipse.
  function wobEll(cx, cy, rx, ry, R, amt, n) {
    n = n || 12; amt = amt == null ? 0.05 : amt;
    var pts = [];
    for (var i = 0; i < n; i++) { var a = (i / n) * TAU, k = 1 + (R() - 0.5) * 2 * amt; pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]); }
    return smoothClosed(pts);
  }
  // Wobbly polygon: corners kept, edges slightly bent.
  function wobPoly(pts, R, amt) {
    amt = amt == null ? 3 : amt;
    var d = "M" + P2(pts[0][0] + (R() - 0.5) * amt, pts[0][1] + (R() - 0.5) * amt), n = pts.length;
    for (var i = 1; i <= n; i++) {
      var a = pts[i - 1], b = pts[i % n], mx = (a[0] + b[0]) / 2 + (R() - 0.5) * amt * 1.6, my = (a[1] + b[1]) / 2 + (R() - 0.5) * amt * 1.6;
      d += "Q" + P2(mx, my) + " " + P2(b[0] + (R() - 0.5) * amt * (i === n ? 0 : 1), b[1] + (R() - 0.5) * amt * (i === n ? 0 : 1));
    }
    return d + "Z";
  }
  function rgbOf(c) {
    c = str(c);
    if (/^#[0-9a-f]{3}$/i.test(c)) c = "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
    var m = /^#([0-9a-f]{6})/i.exec(c);
    if (m) return [parseInt(m[1].slice(0, 2), 16), parseInt(m[1].slice(2, 4), 16), parseInt(m[1].slice(4, 6), 16)];
    m = /rgba?\(([^)]+)\)/.exec(c);
    if (m) { var p = m[1].split(",").map(parseFloat); return [p[0] || 0, p[1] || 0, p[2] || 0]; }
    return [128, 128, 128];
  }
  function hexOf(r) { return "#" + r.map(function (v) { var s = Math.round(clamp(v, 0, 255)).toString(16); return s.length < 2 ? "0" + s : s; }).join(""); }
  function mix(a, b, p) { var x = rgbOf(a), y = rgbOf(b); return hexOf([lerp(x[0], y[0], p), lerp(x[1], y[1], p), lerp(x[2], y[2], p)]); }
  function dark(c, p) { return mix(c, "#2B1A12", p == null ? 0.3 : p); }
  function light(c, p) { return mix(c, "#FFFFFF", p == null ? 0.3 : p); }
  function rgba(c, a) { var r = rgbOf(c); return "rgba(" + r[0] + "," + r[1] + "," + r[2] + "," + f2(a) + ")"; }
  function colorOf(name, def) {
    var n = str(name).toLowerCase();
    if (HCOL[n]) return HCOL[n];
    if (/^#[0-9a-f]{3,8}$/i.test(n)) return n;
    return HCOL[def] || def || C.yellow;
  }

  // ------------------------- text measuring and layout -------------------------
  var cvs = null;
  function fontOf(size, family, weight) { return (weight || 400) + " " + size.toFixed(2) + "px " + (family || HFONT); }
  function textW(txt, size, family, weight) {
    if (!cvs) cvs = doc.createElement("canvas").getContext("2d");
    cvs.font = fontOf(size, family, weight);
    return cvs.measureText(txt).width;
  }
  // "*word*" marks emphasis. Returns tokens [{t, em}].
  function parseEm(text, upper) {
    var toks = [], em = false;
    str(text).replace(/[\u2014\u2013]/g, ",").replace(/\s+/g, " ").split(" ").forEach(function (w) {
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
  // Wrap into lines, shrink to fit maxLines / maxHeight, then balance (no orphan words).
  function layoutText(text, o) {
    o = o || {};
    var fam = o.family || HFONT, size = num(o.size, 40), maxW = Math.max(30, num(o.maxWidth, W * 0.5)), maxLines = Math.max(1, Math.floor(num(o.maxLines, 3)));
    var minSize = num(o.minSize, size * 0.45), lh = num(o.lineHeight, 1.08), maxH = num(o.maxHeight, 0), track = num(o.track, 0);
    var toks = parseEm(text, !!o.upper);
    function ww(tk, s) { return textW(tk.t, s, fam, o.weight) + track * s * tk.t.length; }
    function wrap(s, limit) {
      var sp = textW(" ", s, fam, o.weight) * 1.0 + track * s, lines = [], line = { toks: [], w: 0 };
      toks.forEach(function (tk) {
        var w = ww(tk, s);
        if (line.toks.length && line.w + sp + w > limit) { lines.push(line); line = { toks: [], w: 0 }; }
        var c = Object.assign({}, tk);
        c.x = line.toks.length ? line.w + sp : 0; c.w = w;
        line.w += (line.toks.length ? sp : 0) + w;
        line.toks.push(c);
      });
      if (line.toks.length) lines.push(line);
      return lines;
    }
    function widest(ls) { var m = 0; ls.forEach(function (l) { m = Math.max(m, l.w); }); return m; }
    function tooBig(ls, s) { return ls.length > maxLines || widest(ls) > maxW + 0.5 || (maxH && ls.length * s * lh > maxH); }
    var s = size, lines = wrap(s, maxW);
    for (var i = 0; i < 50 && tooBig(lines, s) && s > minSize; i++) { s *= 0.95; lines = wrap(s, maxW); }
    if (lines.length > 1 && o.balance !== false) {
      var lo = widest(lines) * 0.3, hi = widest(lines), n0 = lines.length;
      for (var b = 0; b < 16; b++) { var mid = (lo + hi) / 2; if (wrap(s, mid).length <= n0) hi = mid; else lo = mid; }
      lines = wrap(s, hi + 0.5);
    }
    return { lines: lines, size: s, lh: lh, w: widest(lines), h: s * lh * lines.length, n: lines.length, family: fam, weight: o.weight || 400 };
  }
  function measureBlock(text, o) { var l = layoutText(text, o); return { w: l.w, h: l.h, size: l.size, lines: l.n }; }
  // Writes a laid-out block as SVG text centred on (cx, cy). Returns { g, spans }.
  function writeBlock(parent, lay, cx, cy, o) {
    o = o || {};
    var g = svg("g", { class: "dw-text" }, parent), spans = [];
    var top = cy - lay.h / 2, align = o.align || "middle";
    var asc = o.asc == null ? 0.36 : o.asc;
    lay.lines.forEach(function (ln, li) {
      var x0 = align === "start" ? cx - lay.w / 2 : align === "left" ? cx : cx - ln.w / 2;
      var y = top + lay.size * lay.lh * (li + 0.5) + lay.size * asc;
      var attrs = { y: f2(y), "font-size": f2(lay.size), "font-family": lay.family, "font-weight": lay.weight, fill: o.color || C.ink };
      if (o.stroke) { attrs.stroke = o.stroke; attrs["stroke-width"] = f2(o.strokeW || lay.size * 0.14); attrs["stroke-linejoin"] = "round"; attrs["paint-order"] = "stroke fill"; }
      if (o.track) attrs["letter-spacing"] = f2(o.track * lay.size);
      var tx = svg("text", attrs, g);
      ln.toks.forEach(function (tk) {
        var sp = svg("tspan", { x: f2(x0 + tk.x) }, tx);
        sp.textContent = tk.t;
        if (tk.em) sp.setAttribute("fill", o.emColor || C.red);
        spans.push(sp);
      });
    });
    return { g: g, spans: spans };
  }

  // ------------------------- timing helpers -------------------------
  var STOP = {};
  "a an the and or but of to in on at by for with from into onto over under is are was were be been being it its this that these those your you we our us my me i his her their they them he she as than then so not no yes do does did have has had will would can could should very just more most less each every all any some about here there what when who how why which also too up out if one well oh".split(" ").forEach(function (w) { STOP[w] = 1; });
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
  function autoKey(text) {
    var ws = contentWords(text), best = "";
    ws.forEach(function (w) { if (normWord(w).length > normWord(best).length) best = w; });
    return best || str(text).split(/\s+/)[0] || "";
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
    var gap = o.gap == null ? 0.6 : o.gap, prev = o.after || 0;
    var lands = labels.map(function (l, i) {
      var t = labelTime(l, keywords ? keywords[i] : null, prev);
      if (t != null) prev = t + 0.05;
      return t;
    });
    lands = spread(lands, o.a, o.b);
    var first = o.first == null ? 0 : o.first;
    if (lands.length && lands[0] < first) lands[0] = first;
    for (var i = 1; i < lands.length; i++) if (lands[i] < lands[i - 1] + gap) lands[i] = lands[i - 1] + gap;
    var lim = o.limit == null ? endT(0.8) : o.limit;
    if (lands.length && lands[lands.length - 1] > lim) {
      var a0 = Math.min(lands[0], lim * 0.5), span = lands[lands.length - 1] - a0;
      lands = lands.map(function (t) { return span > 0 ? a0 + ((t - a0) / span) * (lim - a0) : a0; });
    }
    return lands;
  }
  function when(word, after, fb) { var t = kwFind(word, after); return t == null ? num(fb, 0.3) : t; }
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
      var s0 = Math.max(at, last + pace);
      out[i] = { s: s0, e: s0 + pace * 0.85, est: true };
      last = out[i].s;
    }
    for (i = 1; i < n; i++) if (out[i].s < out[i - 1].s) out[i] = { s: out[i - 1].s + 0.05, e: Math.max(out[i - 1].s + 0.2, out[i].e), est: true };
    return out;
  }
  // [{start, end, found}] for exact narration lines.
  function lines(list) {
    var prev = 0;
    return arr(list).map(function (txt) {
      var toks = str(txt).split(/\s+/).filter(function (w) { return normWord(w); });
      if (!toks.length) return { start: prev, end: prev + 0.5, found: false };
      var i = V.wordIndex ? V.wordIndex(toks.slice(0, Math.min(3, toks.length)).join(" "), prev) : -1;
      var start = i >= 0 ? V.words[i].start : null, found = start != null;
      if (start == null) start = labelTime(txt, null, prev);
      if (start == null) start = prev + 0.2;
      var wt = wordTimes(toks, Math.max(0, start - 0.05));
      var end = wt[wt.length - 1].e;
      prev = Math.max(prev, start + 0.1);
      return { start: start, end: Math.max(start + 0.4, end), found: found };
    });
  }
  function syncAt(word, after, fallback, lead) { var t = kwFind(word, after); if (t == null) t = num(fallback, 0.3); return Math.max(0, t - num(lead, 0)); }
  function syncTimes(keys, o) {
    o = o || {};
    var lands = seqTimes(arr(keys).map(str), arr(keys).map(str), { first: num(o.start, 0.2), limit: o.end == null ? endT(0.8) : o.end });
    return lands.map(function (t) { return Math.max(0, t - num(o.lead, 0)); });
  }

  // ------------------------- state -------------------------
  var st = null;
  function uid(p) { return "dw" + (p || "") + ++need().uid; }
  function need() { if (!st) init(V.root()); return st; }
  function safeRect() {
    if (V.isPortrait) return { x: 60, y: 250, w: 960, h: 1200 };
    if (V.isSquare || W / H < 1.15) { var mx = W * 0.06, my = H * 0.07; return { x: mx, y: my, w: W - 2 * mx, h: H - 2 * my }; }
    return { x: W * 0.07, y: H * 0.07, w: W * 0.86, h: H * 0.86 };
  }
  function init(root) {
    root = root || V.root();
    if (st && st.root === root) return st;
    var R = hel("div", "dw-root", root);
    R.style.width = W + "px"; R.style.height = H + "px";
    var defsSvg = svg("svg", { class: "dw-defs", width: 0, height: 0 }, R);
    var defs = svg("defs", null, defsSvg);
    var scenesDiv = hel("div", "dw-scenes", R);
    var grain = hel("canvas", "dw-grain", R);
    var vig = hel("div", "dw-vignette", R);
    var osvg = svg("svg", { class: "dw-osvg", width: W, height: H, viewBox: "0 0 " + W + " " + H }, R);
    var over = hel("div", "dw-over", R);
    var front = svg("svg", { class: "dw-osvg dw-front", width: W, height: H, viewBox: "0 0 " + W + " " + H }, R);
    st = {
      root: root, R: R, defs: defs, scenesDiv: scenesDiv, grain: grain, vig: vig, osvg: osvg, over: over, front: front,
      ogBack: svg("g", null, osvg), og: svg("g", null, osvg), ogTop: svg("g", null, osvg),
      scenes: [], cur: null, worldFns: [], overFns: [], items: [], pending: [], uid: 0, seed: V.seed || 1,
      occ: [], lastT: -1, narrators: [], built: false, flushed: false,
    };
    paintGrain(grain);
    V.onFrame(frame);
    return st;
  }
  function paintGrain(cv) {
    var gw = Math.ceil(W / 2), gh = Math.ceil(H / 2);
    cv.width = gw; cv.height = gh;
    cv.style.width = W + "px"; cv.style.height = H + "px";
    var ctx = cv.getContext("2d"), img = ctx.createImageData(gw, gh), d = img.data, R = V.makeRand(77 + (st ? st.seed : 1));
    for (var i = 0; i < gw * gh; i++) {
      var v = R(), on = v < 0.5;
      var c = on ? 255 : 40;
      d[i * 4] = c; d[i * 4 + 1] = on ? 240 : 26; d[i * 4 + 2] = on ? 220 : 18;
      d[i * 4 + 3] = Math.floor(R() * (on ? 16 : 11));
    }
    ctx.putImageData(img, 0, 0);
  }

  // ------------------------- scenes, layers, camera -------------------------
  var LOCS = ["cave", "savanna", "tundra", "forest", "desert", "nile", "roman-forum", "greek-agora", "medieval-village", "modern-city", "future-city", "dying-sun", "cosmos", "stage"];
  var LOC_ALIAS = { ice: "tundra", snow: "tundra", arctic: "tundra", jungle: "forest", woods: "forest", egypt: "desert", pyramid: "desert", river: "nile", rome: "roman-forum", forum: "roman-forum", greece: "greek-agora", agora: "greek-agora", village: "medieval-village", medieval: "medieval-village", castle: "medieval-village", city: "modern-city", modern: "modern-city", street: "modern-city", future: "future-city", space: "cosmos", sun: "dying-sun", plain: "stage", studio: "stage", grassland: "savanna", plains: "savanna" };
  function locName(n) { n = str(n).toLowerCase(); if (LOCS.indexOf(n) >= 0) return n; return LOC_ALIAS[n] || "savanna"; }
  var ERAS = ["caveman", "egyptian", "roman", "greek", "medieval", "viking", "modern", "future"];
  var LOC_ERA = { cave: "caveman", savanna: "caveman", tundra: "caveman", forest: "caveman", desert: "egyptian", nile: "egyptian", "roman-forum": "roman", "greek-agora": "greek", "medieval-village": "medieval", "modern-city": "modern", "future-city": "future", "dying-sun": "future", cosmos: "future", stage: "modern" };
  function eraName(n, d) { n = str(n).toLowerCase(); if (n === "stone" || n === "stone-age" || n === "cave") n = "caveman"; if (n === "egypt") n = "egyptian"; if (n === "rome") n = "roman"; if (n === "greece") n = "greek"; return ERAS.indexOf(n) >= 0 ? n : d || "caveman"; }
  var DEPTH = { sky: 0.12, far: 0.35, mid: 0.62, near: 0.85, ground: 1, action: 1, front: 1.22 };
  var LAYER_IDS = ["sky", "far", "mid", "near", "ground", "action", "front"];

  // opts: { era, span, color, charScale, ground, noFire, time, viewport: {x, y, w, h} (0-1 of the frame) }
  function scene(location, o) {
    var s0 = need();
    o = obj(o);
    var loc = locName(location);
    var vpo = obj(o.viewport);
    var vp = { x: num(vpo.x, 0) * W, y: num(vpo.y, 0) * H, w: num(vpo.w, 1) * W, h: num(vpo.h, 1) * H };
    vp.w = Math.max(10, Math.min(W - vp.x, vp.w)); vp.h = Math.max(10, Math.min(H - vp.y, vp.h));
    var k = vp.h / 1000, Ww = (1000 * vp.w) / vp.h, span = clamp(num(o.span, 1), 1, 10);
    var sr = safeRect();
    // feet line: inside the safe area of this viewport
    var safeBottom = Math.min(vp.y + vp.h, sr.y + sr.h) - vp.y;
    var gDef = clamp((safeBottom / vp.h) * 1000 - (V.isPortrait && !o.viewport ? 6 : 18), 380, 905);
    var sc = {
      id: s0.scenes.length, loc: loc, o: o, vp: vp, k: k, Ww: Ww, span: span, worldW: Ww * span,
      G: num(o.ground, gDef), portrait: Ww < 800, square: Ww >= 800 && Ww < 1300, era: eraName(o.era, LOC_ERA[loc]),
      time: pick(["day", "night", "dusk", "dawn"], o.time, loc === "cave" || loc === "cosmos" || loc === "dying-sun" ? "night" : "day"),
      camKeys: [], shakes: [], follows: [], fns: [], actors: [], critters: [], tints: [], seed: (s0.seed * 31 + s0.scenes.length * 977) >>> 0,
      charScale: num(o.charScale, 0), hidden: [],
    };
    sc.charScale = sc.charScale || (sc.portrait ? 1.0 : sc.square ? 1.0 : 1.2);
    sc.isDark = sc.time === "night" || loc === "cave" || loc === "cosmos";
    sc.isHot = loc === "desert" || loc === "nile" || loc === "dying-sun" || loc === "savanna";
    sc.isCold = loc === "tundra";
    var div = hel("div", "dw-scene", s0.scenesDiv);
    div.style.left = f2(vp.x) + "px"; div.style.top = f2(vp.y) + "px"; div.style.width = f2(vp.w) + "px"; div.style.height = f2(vp.h) + "px";
    sc.div = div;
    sc.layers = {};
    LAYER_IDS.forEach(function (id) {
      var d = DEPTH[id], margin = Ww * 0.32 + 120;
      var X0 = -margin, X1 = Ww + (sc.worldW - Ww) * d + margin, Y0 = -260, Y1 = 1260;
      var ld = hel("div", "dw-layer", div);
      var s = svg("svg", { class: "dw-lsvg", width: f2(vp.w), height: f2(vp.h), viewBox: "0 0 " + f2(vp.w) + " " + f2(vp.h), overflow: "visible" }, ld);
      sc.layers[id] = { id: id, d: d, div: ld, svg: s, g: svg("g", null, s), X0: X0, X1: X1, Y0: Y0, Y1: Y1, canvas: null };
    });
    var act = sc.layers.action;
    sc.glowG = svg("g", null, act.g);  // firelight under everyone
    sc.rearG = svg("g", null, act.g);  // back-row cast (behind the set pieces)
    sc.backG = svg("g", null, act.g);  // setpieces and light under the cast
    sc.shadowG = svg("g", null, act.g);
    sc.castG = svg("g", null, act.g);
    sc.fxG = svg("g", null, act.g);    // marks, bursts
    sc.tintDiv = hel("div", "dw-tint", div);
    sc.tintDiv.style.opacity = 0;
    sc.wxSvg = svg("svg", { class: "dw-wx", width: f2(vp.w), height: f2(vp.h), viewBox: "0 0 " + f2(vp.w) + " " + f2(vp.h) }, div);
    sc.toScreen = function (x, y, depth) { return toScreen(sc, x, y, depth); };
    sc.slots = function (n, spread2) { return slots(sc, n, spread2); };
    sc.onFrame = function (fn) { if (typeof fn === "function") sc.fns.push(fn); };
    sc.overlay = s0.over;
    sc.osvg = s0.og;
    sc.tintTo = function (op, at, dur) { sc.tints.push({ at: num(at, 0), dur: num(dur, 0.8), op: clamp(num(op, 0.4), 0, 1), color: null }); return sc; };
    sc.lightWash = function (x, y, r, color, strength) { return lightWash(sc, x, y, r, color, strength); };
    sc.cam = makeCamera(sc);
    s0.scenes.push(sc);
    s0.cur = sc;
    paintWorld(sc);
    return sc;
  }
  function cur() { var s0 = need(); if (!s0.cur) scene("savanna"); return s0.cur; }
  function slots(sc, n, spr) {
    n = Math.max(1, Math.floor(num(n, 1)));
    spr = num(spr, sc.portrait ? 0.86 : 0.62);
    var c = sc.Ww / 2, w = sc.Ww * spr, out = [];
    for (var i = 0; i < n; i++) out.push(n === 1 ? c : c - w / 2 + (w * (i + 0.5)) / n);
    return out;
  }

  // Camera state {x, y, z} in world units for the action layer (z = zoom).
  function makeCamera(sc) {
    var base = { x: sc.Ww / 2, y: 500, z: 1 };
    var api = {
      _base: base,
      set: function (tg) { var r = resolveCam(sc, tg, 0, base); base.x = r.x; base.y = r.y; base.z = r.z; sc.camDirty = true; return api; },
      to: function (tg, at, dur, ez) { sc.camKeys.push({ tg: tg, at: num(at, 0), dur: Math.max(0.01, num(dur, 1)), ez: ease(ez || "inOut") }); sc.camDirty = true; return api; },
      cut: function (tg, at) { sc.camKeys.push({ tg: tg, at: num(at, 0), dur: 0.001, ez: EASE.linear, cut: true }); sc.camDirty = true; return api; },
      push: function (zoom, at, dur) { return api.to({ zoom: num(zoom, 1.15) }, at, dur == null ? 1.6 : dur, "inOutSine"); },
      pan: function (dx, at, dur) { sc.camKeys.push({ tg: { dxRel: num(dx, 200) }, at: num(at, 0), dur: Math.max(0.01, num(dur, 3)), ez: EASE.inOutSine }); sc.camDirty = true; return api; },
      focus: function (actor, at, dur, zoom, oo) { oo = obj(oo); return api.to({ actor: actor, zoom: num(zoom, 1.4), dx: oo.dx, dy: oo.dy, focusY: oo.focusY }, at, dur == null ? 0.9 : dur, "inOut"); },
      follow: function (actor, from, to, oo) { oo = obj(oo); sc.follows.push({ actor: actor, from: num(from, 0), to: num(to, D), zoom: oo.zoom, lead: num(oo.lead, 0), y: oo.y }); sc.camDirty = true; return api; },
      shake: function (at, amp, dur) { sc.shakes.push({ at: num(at, 0), amp: num(amp, 14), dur: num(dur, 0.45) }); return api; },
      at: function (t) { return camAt(sc, t); },
      drift: function (amt) { sc.drift = num(amt, 1); return api; },
    };
    return api;
  }
  function resolveCam(sc, tg, at, prev) {
    tg = tg || {};
    var z = num(tg.zoom, num(tg.z, prev.z));
    var x = prev.x, y = prev.y;
    if (tg.actor && tg.actor.xAt) {
      var a = tg.actor, fy = num(tg.focusY, 0.55);
      x = a.xAt(at) + num(tg.dx, 0);
      y = a.y0 - a.height * fy + num(tg.dy, 0);
    } else {
      if (tg.x != null) x = num(tg.x, x);
      if (tg.y != null) y = num(tg.y, y);
      if (tg.dxRel != null) x = prev.x + tg.dxRel;
      if (tg.dx != null && tg.x == null) x = prev.x + num(tg.dx, 0);
      if (tg.dy != null && tg.y == null) y = prev.y + num(tg.dy, 0);
    }
    return { x: x, y: y, z: clamp(z, 1, 5) };
  }
  function finalizeCam(sc) {
    sc.camKeys.sort(function (a, b) { return a.at - b.at; });
    sc.camKeys.forEach(function (k) { k.to = null; k.from = null; });
    var prevState = { x: sc.cam._base.x, y: sc.cam._base.y, z: sc.cam._base.z };
    sc.camKeys.forEach(function (k) {
      var startState = rawCamAt(sc, k.at, true);
      k.from = startState;
      k.to = resolveCam(sc, k.tg, k.at + k.dur, startState);
      prevState = k.to;
    });
    sc.camDirty = false;
  }
  function clampCam(sc, c) {
    var z = Math.max(1, c.z), hw = sc.Ww / 2 / z, hh = 500 / z;
    return { x: clamp(c.x, hw, sc.worldW - hw), y: clamp(c.y, hh, 1000 - hh), z: z };
  }
  // Camera from keys only (no follow, shake, drift). `partial` = called during finalize.
  function rawCamAt(sc, t, partial) {
    var c = { x: sc.cam._base.x, y: sc.cam._base.y, z: sc.cam._base.z };
    for (var i = 0; i < sc.camKeys.length; i++) {
      var k = sc.camKeys[i];
      if (!k.to) { if (partial) break; continue; }
      if (t < k.at) break;
      var p = k.ez(prog(t, k.at, k.at + k.dur));
      c = { x: lerp(k.from.x, k.to.x, p), y: lerp(k.from.y, k.to.y, p), z: lerp(k.from.z, k.to.z, p) };
    }
    return c;
  }
  function camAt(sc, t) {
    if (sc.camDirty) finalizeCam(sc);
    var c = rawCamAt(sc, t);
    for (var i = 0; i < sc.follows.length; i++) {
      var f = sc.follows[i];
      if (t < f.from - 0.6 || t > f.to + 0.6) continue;
      var w8 = smooth(prog(t, f.from - 0.6, f.from)) * (1 - smooth(prog(t, f.to, f.to + 0.6)));
      var fx = f.actor.xAt(clamp(t, f.from, f.to)) + f.lead * (f.actor.facingAt ? f.actor.facingAt(t) : 1);
      c.x = lerp(c.x, fx, w8);
      if (f.zoom != null) c.z = lerp(c.z, num(f.zoom, c.z), w8);
      if (f.y != null) c.y = lerp(c.y, num(f.y, c.y), w8);
    }
    c = clampCam(sc, c);
    var sx = 0, sy = 0;
    for (i = 0; i < sc.shakes.length; i++) {
      var s = sc.shakes[i];
      if (t < s.at || t > s.at + s.dur) continue;
      var q = (t - s.at) / s.dur, a = s.amp * (1 - q) * (1 - q);
      sx += Math.sin(t * 91 + i * 3) * a; sy += Math.cos(t * 77 + i) * a * 0.8;
    }
    var dr = sc.drift == null ? 1 : sc.drift;
    sx += (Math.sin(t * 0.61 + sc.id) * 2.2 + Math.sin(t * 1.37) * 1.1) * dr;
    sy += (Math.cos(t * 0.53 + sc.id * 2) * 1.6 + Math.sin(t * 1.11 + 1) * 0.8) * dr;
    c.sx = sx; c.sy = sy;
    return c;
  }
  function camMoving(sc, t) {
    var a = camAt(sc, t - 0.06), b = camAt(sc, t + 0.06);
    return Math.abs(a.x - b.x) * sc.k > 3 || Math.abs(a.z - b.z) > 0.004 || Math.abs(a.y - b.y) * sc.k > 3;
  }
  function layerCam(sc, c, d) {
    var hx = sc.Ww / 2, hy = 500;
    return { cx: hx + (c.x - hx) * d, cy: hy + (c.y - hy) * d, z: 1 + (c.z - 1) * Math.min(d, 1.4) };
  }
  function toScreen(sc, x, y, depth, t) {
    var c = t == null ? (sc._c || camAt(sc, V.time())) : camAt(sc, t);
    var L = layerCam(sc, c, depth == null ? 1 : depth);
    return { x: sc.vp.x + sc.vp.w / 2 + (x - L.cx) * L.z * sc.k + c.sx * sc.k, y: sc.vp.y + sc.vp.h / 2 + (y - L.cy) * L.z * sc.k + c.sy * sc.k, z: L.z * sc.k };
  }
  function applyCamera(sc, t) {
    var c = camAt(sc, t);
    sc._c = c;
    LAYER_IDS.forEach(function (id) {
      var Ly = sc.layers[id], L = layerCam(sc, c, Ly.d);
      if (Ly.canvas) {
        var tx = sc.vp.w / 2 - (L.cx - Ly.X0) * sc.k * L.z + c.sx * sc.k, ty = sc.vp.h / 2 - (L.cy - Ly.Y0) * sc.k * L.z + c.sy * sc.k;
        Ly.canvas.style.transform = "translate(" + f2(tx) + "px," + f2(ty) + "px) scale(" + (+L.z.toFixed(5)) + ")";
      }
      Ly.g.setAttribute("transform", "translate(" + f2(sc.vp.w / 2 - L.cx * sc.k * L.z + c.sx * sc.k) + " " + f2(sc.vp.h / 2 - L.cy * sc.k * L.z + c.sy * sc.k) + ") scale(" + (+(sc.k * L.z).toFixed(5)) + ")");
    });
    // tint
    var op = 0, col = sc.tintColor || "#1A2A5A";
    sc.tints.forEach(function (tn) {
      if (t < tn.at) return;
      var p = smooth(prog(t, tn.at, tn.at + tn.dur));
      op = lerp(op, tn.op, p);
      if (tn.color && p > 0) col = tn.color;
    });
    sc.tintDiv.style.opacity = f2(op);
    sc.tintDiv.style.background = col;
  }

  // ------------------------- the frame -------------------------
  function frame(t) {
    if (!st) return;
    st.lastT = t;
    var i;
    for (i = 0; i < st.scenes.length; i++) applyCamera(st.scenes[i], t);
    for (i = 0; i < st.worldFns.length; i++) st.worldFns[i](t);
    for (i = 0; i < st.scenes.length; i++) { var sc = st.scenes[i]; for (var j = 0; j < sc.fns.length; j++) sc.fns[j](t); }
    for (i = 0; i < st.overFns.length; i++) st.overFns[i](t);
  }
  function onWorld(fn) { need().worldFns.push(fn); }
  function onOver(fn) { need().overFns.push(fn); }
  // Inspect items: { kind, label, t0, t1, rect(t) -> screen box or null, moving(t) }
  function item(kind, label, t0, t1, rect, moving) { need().items.push({ kind: kind, label: label, t0: t0, t1: t1, rect: rect, moving: moving }); }
  function boxesAt(t, skip) {
    var out = [];
    need().items.forEach(function (it) {
      if (it === skip) return;
      if (it.t0 != null && t < it.t0) return;
      if (it.t1 != null && t > it.t1) return;
      var r = it.rect(t);
      if (r && r.w > 0 && r.h > 0) out.push({ kind: it.kind, label: it.label, x: r.x, y: r.y, w: r.w, h: r.h, moving: it.moving ? !!it.moving(t) : false });
    });
    return out;
  }
  function overlapArea(a, b) {
    var x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)), y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    return x * y;
  }
  // Pop envelope: 0 before at, overshoot in, 1, then out after until.
  function popEnv(t, at, until, inDur, outDur) {
    inDur = inDur || 0.32; outDur = outDur || 0.25;
    if (t < at) return 0;
    var a = EASE.outBack(prog(t, at, at + inDur));
    if (until != null && t > until) a *= 1 - EASE.inCubic(prog(t, until, until + outDur));
    return Math.max(0, a);
  }

  // ------------------------- painted worlds (canvas, painted once) -------------------------
  function layerCanvas(sc, id, res) {
    var L = sc.layers[id];
    if (L.ctx) return L.ctx;
    var wu = L.X1 - L.X0, hu = L.Y1 - L.Y0, s = sc.k * (res || 1);
    var px = wu * s * hu * s;
    if (px > 11e6) s *= Math.sqrt(11e6 / px);
    var cv = doc.createElement("canvas");
    cv.width = Math.ceil(wu * s); cv.height = Math.ceil(hu * s);
    cv.className = "dw-canvas";
    cv.style.width = f2(wu * sc.k) + "px"; cv.style.height = f2(hu * sc.k) + "px";
    L.div.insertBefore(cv, L.svg);
    var ctx = cv.getContext("2d");
    ctx.setTransform(s, 0, 0, s, -L.X0 * s, -L.Y0 * s);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    L.canvas = cv; L.ctx = ctx; L.s = s;
    return ctx;
  }
  function vgrad(ctx, y0, y1, stops) {
    var g = ctx.createLinearGradient(0, y0, 0, y1);
    stops.forEach(function (s, i) { g.addColorStop(Array.isArray(s) ? s[0] : i / Math.max(1, stops.length - 1), Array.isArray(s) ? s[1] : s); });
    return g;
  }
  function fillAll(ctx, L, style) { ctx.fillStyle = style; ctx.fillRect(L.X0 - 10, L.Y0 - 10, L.X1 - L.X0 + 20, L.Y1 - L.Y0 + 20); }
  // Rolling silhouette down to the bottom of the layer. o: amp, f (base frequency), rough, peaks
  function ridge(L, base, amp, R, o) {
    o = o || {};
    var p = new Path2D(), step = o.step || 10, f = o.f || 0.006, ph = [R() * TAU, R() * TAU, R() * TAU, R() * TAU];
    var pts = [];
    for (var x = L.X0 - 20; x <= L.X1 + 20 + step; x += step) {
      var n = 0.55 * Math.sin(x * f + ph[0]) + 0.3 * Math.sin(x * f * 2.3 + ph[1]) + 0.15 * Math.sin(x * f * 5.1 + ph[2]);
      if (o.peaks) n = 1 - Math.abs(Math.sin(x * f * 0.9 + ph[0])) * 1.6 + 0.25 * Math.sin(x * f * 3.7 + ph[1]);
      var y = base - amp * (0.5 + 0.5 * n) + (R() - 0.5) * (o.rough || 2);
      pts.push([x, y]);
    }
    p.moveTo(L.X0 - 20, L.Y1 + 20);
    pts.forEach(function (q) { p.lineTo(q[0], q[1]); });
    p.lineTo(L.X1 + 20, L.Y1 + 20);
    p.closePath();
    p.pts = pts;
    return p;
  }
  function yOn(path, x) { var pts = path.pts, best = pts[0]; for (var i = 0; i < pts.length; i++) if (Math.abs(pts[i][0] - x) < Math.abs(best[0] - x)) best = pts[i]; return best[1]; }
  // Brush dabs clipped to a path: short curved strokes in nearby colours (the painted texture).
  function dabs(ctx, path, R, o) {
    ctx.save();
    if (path) ctx.clip(path);
    var n = Math.floor(o.n || 300), cols = o.colors || ["#000"], y0 = o.y0, y1 = o.y1, x0 = o.x0, x1 = o.x1;
    for (var i = 0; i < n; i++) {
      var x = lerp(x0, x1, R()), y = lerp(y0, y1, Math.pow(R(), o.bias || 1));
      var len = (o.len || 18) * (0.5 + R()), ang = (o.ang || 0) + (R() - 0.5) * (o.spread == null ? 0.8 : o.spread);
      ctx.strokeStyle = rgba(cols[Math.floor(R() * cols.length)], (o.alpha || 0.22) * (0.5 + R() * 0.8));
      ctx.lineWidth = (o.w || 5) * (0.6 + R() * 0.8);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(ang) * len * 0.5 + (R() - 0.5) * len * 0.3, y + Math.sin(ang) * len * 0.5 + (R() - 0.5) * len * 0.3, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      ctx.stroke();
    }
    ctx.restore();
  }
  function paintShape(ctx, path, fill, edge, ew) {
    ctx.fillStyle = fill; ctx.fill(path);
    if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = ew || 3; ctx.stroke(path); }
  }
  function softCircle(ctx, x, y, r, col, a) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  function clouds(ctx, L, R, n, col, y0, y1, a) {
    for (var i = 0; i < n; i++) {
      var cx = lerp(L.X0, L.X1, R()), cy = lerp(y0, y1, R()), w = 90 + R() * 160;
      for (var j = 0; j < 7; j++) {
        var px = cx + (R() - 0.5) * w, py = cy + (R() - 0.5) * w * 0.18, r = w * (0.18 + R() * 0.16);
        ctx.fillStyle = rgba(col, (a || 0.5) * (0.5 + R() * 0.5));
        ctx.beginPath(); ctx.ellipse(px, py, r * 1.4, r * 0.7, 0, 0, TAU); ctx.fill();
      }
    }
  }
  function haze(ctx, L, yTop, yBot, col, a) {
    var g = ctx.createLinearGradient(0, yTop, 0, yBot);
    g.addColorStop(0, rgba(col, 0)); g.addColorStop(1, rgba(col, a));
    ctx.fillStyle = g; ctx.fillRect(L.X0 - 10, yTop, L.X1 - L.X0 + 20, yBot - yTop);
  }
  // Painted silhouettes (canvas). All stand on (x, y) and grow upward.
  function cTree(ctx, R, x, y, h, kind, col) {
    var trunk = dark(col, 0.45);
    ctx.fillStyle = trunk;
    if (kind === "pine") {
      ctx.fillRect(x - h * 0.03, y - h * 0.18, h * 0.06, h * 0.2);
      for (var i = 0; i < 4; i++) {
        var ty = y - h * 0.12 - i * h * 0.21, tw = h * (0.32 - i * 0.06);
        ctx.fillStyle = i % 2 ? col : dark(col, 0.12);
        ctx.beginPath(); ctx.moveTo(x - tw, ty); ctx.lineTo(x, ty - h * 0.34); ctx.lineTo(x + tw, ty); ctx.closePath(); ctx.fill();
      }
      return;
    }
    if (kind === "palm") {
      ctx.strokeStyle = trunk; ctx.lineWidth = h * 0.05;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + h * 0.12, y - h * 0.5, x + h * 0.05, y - h * 0.9); ctx.stroke();
      ctx.fillStyle = col;
      for (var j = 0; j < 6; j++) {
        var a = -PI / 2 + (j - 2.5) * 0.55, lx = x + h * 0.05, ly = y - h * 0.9;
        ctx.beginPath(); ctx.moveTo(lx, ly);
        ctx.quadraticCurveTo(lx + Math.cos(a) * h * 0.3, ly + Math.sin(a) * h * 0.3 - h * 0.08, lx + Math.cos(a) * h * 0.45, ly + Math.sin(a) * h * 0.2 + h * 0.12);
        ctx.quadraticCurveTo(lx + Math.cos(a) * h * 0.25, ly + Math.sin(a) * h * 0.2, lx, ly); ctx.fill();
      }
      return;
    }
    if (kind === "acacia") {
      ctx.strokeStyle = trunk; ctx.lineWidth = h * 0.045;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - h * 0.02, y - h * 0.55); ctx.lineTo(x - h * 0.22, y - h * 0.8); ctx.moveTo(x - h * 0.02, y - h * 0.55); ctx.lineTo(x + h * 0.2, y - h * 0.82); ctx.stroke();
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.ellipse(x, y - h * 0.88, h * 0.5, h * 0.1, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = light(col, 0.12);
      ctx.beginPath(); ctx.ellipse(x - h * 0.08, y - h * 0.93, h * 0.36, h * 0.06, 0, 0, TAU); ctx.fill();
      return;
    }
    // round broadleaf
    ctx.fillRect(x - h * 0.035, y - h * 0.5, h * 0.07, h * 0.5);
    for (var k2 = 0; k2 < 6; k2++) {
      ctx.fillStyle = k2 % 2 ? col : light(col, 0.1);
      ctx.beginPath(); ctx.arc(x + (R() - 0.5) * h * 0.4, y - h * 0.62 - R() * h * 0.25, h * (0.16 + R() * 0.1), 0, TAU); ctx.fill();
    }
  }
  function cPyramid(ctx, x, y, w, col) {
    var h = w * 0.62;
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x, y - h); ctx.lineTo(x + w / 2, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = dark(col, 0.25); ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + w / 2, y); ctx.lineTo(x + w * 0.12, y); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba(dark(col, 0.4), 0.35); ctx.lineWidth = 1.5;
    for (var i = 1; i < 7; i++) { var yy = y - (h * i) / 7, hw = (w / 2) * (1 - i / 7); ctx.beginPath(); ctx.moveTo(x - hw, yy); ctx.lineTo(x + hw, yy); ctx.stroke(); }
  }
  function cTemple(ctx, x, y, w, h, col, n) {
    n = n || 6;
    var sh = dark(col, 0.25);
    ctx.fillStyle = sh; ctx.fillRect(x - w / 2, y - h * 0.08, w, h * 0.08);
    for (var i = 0; i < n; i++) {
      var cx = x - w / 2 + w * 0.06 + ((w * 0.88) * i) / (n - 1);
      ctx.fillStyle = col; ctx.fillRect(cx - w * 0.025, y - h * 0.82, w * 0.05, h * 0.74);
      ctx.fillStyle = rgba(sh, 0.6); ctx.fillRect(cx + w * 0.008, y - h * 0.82, w * 0.017, h * 0.74);
    }
    ctx.fillStyle = col; ctx.fillRect(x - w / 2 - 6, y - h * 0.9, w + 12, h * 0.09);
    ctx.beginPath(); ctx.moveTo(x - w / 2 - 8, y - h * 0.9); ctx.lineTo(x, y - h * 1.12); ctx.lineTo(x + w / 2 + 8, y - h * 0.9); ctx.closePath(); ctx.fill();
    ctx.fillStyle = sh; ctx.beginPath(); ctx.moveTo(x - w * 0.36, y - h * 0.92); ctx.lineTo(x, y - h * 1.06); ctx.lineTo(x + w * 0.36, y - h * 0.92); ctx.closePath(); ctx.fill();
  }
  function cHouse(ctx, R, x, y, w, h, wall, roof, o) {
    o = o || {};
    ctx.fillStyle = wall; ctx.fillRect(x - w / 2, y - h, w, h);
    if (o.timber) {
      ctx.strokeStyle = dark(wall, 0.55); ctx.lineWidth = 4;
      ctx.strokeRect(x - w / 2, y - h, w, h);
      ctx.beginPath(); ctx.moveTo(x - w / 2, y - h * 0.5); ctx.lineTo(x + w / 2, y - h * 0.5); ctx.moveTo(x - w / 2, y - h); ctx.lineTo(x, y - h * 0.5); ctx.moveTo(x + w / 2, y - h); ctx.lineTo(x, y - h * 0.5); ctx.stroke();
    }
    ctx.fillStyle = roof;
    ctx.beginPath(); ctx.moveTo(x - w / 2 - 10, y - h); ctx.lineTo(x, y - h - w * (o.flat ? 0.08 : 0.5)); ctx.lineTo(x + w / 2 + 10, y - h); ctx.closePath(); ctx.fill();
    var win = o.win || dark(wall, 0.5);
    var rows = Math.max(1, Math.floor(h / 70)), cols = Math.max(1, Math.floor(w / 46));
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
      if (R() < (o.sparse || 0.25)) continue;
      ctx.fillStyle = R() < (o.lit || 0) ? (o.litCol || "#FFD877") : win;
      ctx.fillRect(x - w / 2 + (w * (c + 0.3)) / cols, y - h + (h * (r + 0.25)) / rows, w / cols * 0.4, h / rows * 0.4);
    }
  }
  function cTower(ctx, R, x, y, w, h, col, o) {
    o = o || {};
    ctx.fillStyle = col;
    if (o.slim) { ctx.beginPath(); ctx.moveTo(x - w / 2, y); ctx.lineTo(x - w * 0.32, y - h); ctx.quadraticCurveTo(x, y - h - w * 0.5, x + w * 0.32, y - h); ctx.lineTo(x + w / 2, y); ctx.closePath(); ctx.fill(); }
    else ctx.fillRect(x - w / 2, y - h, w, h);
    ctx.fillStyle = rgba(dark(col, 0.4), 0.5); ctx.fillRect(x + w * 0.18, y - h, w * 0.32, h);
    if (o.castle) {
      ctx.fillStyle = col;
      for (var i = 0; i < 4; i++) ctx.fillRect(x - w / 2 + (w * i) / 3.5, y - h - 18, w / 7, 18);
      ctx.fillStyle = o.roof || "#8E3B2E"; ctx.beginPath(); ctx.moveTo(x - w * 0.6, y - h - 18); ctx.lineTo(x, y - h - w * 1.1); ctx.lineTo(x + w * 0.6, y - h - 18); ctx.closePath(); ctx.fill();
    }
    var rows = Math.floor(h / 26), cols = Math.max(1, Math.floor(w / 18));
    for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) {
      if (R() < (o.sparse == null ? 0.45 : o.sparse)) continue;
      ctx.fillStyle = R() < (o.lit || 0) ? (o.litCol || "#FFE08A") : rgba(dark(col, 0.5), 0.7);
      ctx.fillRect(x - w / 2 + (w * (c + 0.25)) / cols, y - h + 12 + r * 26, (w / cols) * 0.5, 12);
    }
  }
  function stars(ctx, L, R, n, y1) {
    for (var i = 0; i < n; i++) {
      var x = lerp(L.X0, L.X1, R()), y = lerp(L.Y0, y1, R()), r = 0.6 + R() * 1.8;
      ctx.fillStyle = rgba("#FFF6D8", 0.4 + R() * 0.6); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
  }

  // Sky palettes by time of day: [top, horizon]
  var SKY = {
    day: ["#7FB8E0", "#FBE3B0"], dusk: ["#3E3A78", "#F58B4C"], dawn: ["#8E7CC3", "#FFC58A"], night: ["#0E1634", "#33406E"],
  };
  // Per location: sky override, ground colours, horizon fraction, and a painter.
  var WORLD = {
    savanna: { sky: { day: ["#F2A65A", "#FCE7A8"] }, ground: ["#D9A441", "#B97B2C"], sun: "big", grass: true },
    tundra: { sky: { day: ["#9CC3E4", "#EAF4FA"] }, ground: ["#EEF5FA", "#BFD3E3"], sun: "pale" },
    forest: { sky: { day: ["#9DC88A", "#F4E6B0"] }, ground: ["#6F8F3C", "#4C6A2A"], sun: "soft" },
    desert: { sky: { day: ["#F7B05B", "#FFE9A6"] }, ground: ["#E9BE6E", "#C9934A"], sun: "big" },
    nile: { sky: { day: ["#F6B26B", "#FFF0BE"] }, ground: ["#D8B26A", "#A98448"], sun: "big" },
    "roman-forum": { sky: { day: ["#8FC0E3", "#FBEBC6"] }, ground: ["#CDB28A", "#9E8460"], sun: "soft" },
    "greek-agora": { sky: { day: ["#73B2E0", "#F2F0DA"] }, ground: ["#E2D3B0", "#B6A27E"], sun: "soft" },
    "medieval-village": { sky: { day: ["#93BEDC", "#F3E2BA"] }, ground: ["#8EA04E", "#6C7A38"], sun: "soft" },
    "modern-city": { sky: { day: ["#87B6DA", "#F6E2C0"] }, ground: ["#9A9690", "#6C6A66"], sun: "soft" },
    "future-city": { sky: { day: ["#5D4C9E", "#F49AC1"], night: ["#120B33", "#4A2C7A"] }, ground: ["#3C4A6A", "#232C44"], sun: "soft" },
    "dying-sun": { sky: { night: ["#14060A", "#8A1E10"], day: ["#2A0A0A", "#C2411C"] }, ground: ["#4A1A12", "#24100C"], sun: "dying" },
    cosmos: { sky: { night: ["#05071A", "#1D1846"], day: ["#05071A", "#1D1846"] }, ground: ["#8A8A9A", "#55556A"], sun: "none" },
    cave: { ground: ["#6E4A2E", "#3E2817"], sun: "none" },
    stage: { ground: ["#C9A577", "#9E7C52"], sun: "none" },
  };
  function paintWorld(sc) {
    var loc = sc.loc, cfg = WORLD[loc] || WORLD.savanna, R = V.makeRand(sc.seed + hash(loc));
    var t = sc.time, G = sc.G;
    var hz = G - (sc.portrait ? 150 : 170); // horizon line
    sc.horizon = hz;
    var skyC = (cfg.sky && cfg.sky[t]) || (t === "day" ? null : SKY[t]) || (cfg.sky && cfg.sky.day) || SKY.day;
    if (loc === "dying-sun" || loc === "cosmos") skyC = (cfg.sky && (cfg.sky[t] || cfg.sky.night)) || SKY.night;
    if (t === "night" && loc !== "dying-sun" && loc !== "cosmos" && loc !== "future-city") skyC = SKY.night;
    if (t === "night" && loc === "future-city") skyC = cfg.sky.night;
    sc.skyC = skyC;
    var gr = cfg.ground;
    if (t === "night" && loc !== "cave") gr = [mix(gr[0], "#1A2A5A", 0.45), mix(gr[1], "#0E1634", 0.5)];
    if (t === "dusk" || t === "dawn") gr = [mix(gr[0], "#F58B4C", 0.15), mix(gr[1], "#3E2817", 0.15)];
    sc.groundC = gr;
    if (loc === "cave") { paintCave(sc, R); return; }
    if (loc === "stage") { paintStage(sc, R); return; }
    // sky
    var skyL = sc.layers.sky, sk = layerCanvas(sc, "sky", 0.5);
    fillAll(sk, skyL, vgrad(sk, -200, hz + 40, [skyC[0], skyC[1]]));
    if (sc.isDark || loc === "cosmos" || loc === "dying-sun") stars(sk, skyL, R, loc === "cosmos" ? 520 : 260, hz);
    if (loc === "cosmos") { softCircle(sk, sc.Ww * 0.3, 260, 300, "#7A3FB8", 0.35); softCircle(sk, sc.Ww * 0.75, 180, 260, "#2F7FB8", 0.3); }
    if (!sc.isDark && loc !== "dying-sun") clouds(sk, skyL, R, 9, "#FFFFFF", 80, hz - 200, t === "day" ? 0.42 : 0.25);
    if (t === "dusk" || t === "dawn") clouds(sk, skyL, R, 6, "#FF9E6E", 120, hz - 160, 0.3);
    makeSun(sc, cfg.sun, hz);
    // far layer
    var farL = sc.layers.far, fa = layerCanvas(sc, "far", 0.75), p, i, x;
    var farCol = mix(skyC[1], loc === "tundra" ? "#8FA8C4" : loc === "future-city" ? "#3A2C6A" : "#8A6A7A", 0.45);
    if (t === "night") farCol = mix(farCol, "#141C3E", 0.6);
    if (loc === "dying-sun") farCol = "#3A1210";
    if (loc === "cosmos") farCol = "#2A2650";
    if (loc === "tundra" || loc === "medieval-village" || loc === "forest" || loc === "greek-agora") {
      p = ridge(farL, hz - 10, loc === "tundra" ? 260 : 170, R, { peaks: loc === "tundra" || loc === "forest", f: 0.004 });
      paintShape(fa, p, farCol);
      if (loc === "tundra") { fa.save(); fa.clip(p); fa.fillStyle = rgba("#FFFFFF", 0.85); fa.fillRect(farL.X0, -300, farL.X1 - farL.X0, hz - 150 + 300); fa.restore(); }
      dabs(fa, p, R, { n: 400, colors: [light(farCol, 0.2), dark(farCol, 0.15)], x0: farL.X0, x1: farL.X1, y0: hz - 300, y1: hz + 20, alpha: 0.25, w: 6, len: 26 });
    } else if (loc === "desert" || loc === "nile") {
      p = ridge(farL, hz, 60, R, { f: 0.003 });
      paintShape(fa, p, mix(farCol, "#E9A85A", 0.5));
      for (i = 0; i < 4; i++) { x = lerp(farL.X0 + 200, farL.X1 - 200, (i + R() * 0.5) / 4); cPyramid(fa, x, yOn(p, x) + 8, 140 + R() * 120, mix("#D99A52", skyC[1], 0.35)); }
    } else if (loc === "savanna") {
      p = ridge(farL, hz, 70, R, { f: 0.0035 });
      paintShape(fa, p, mix(farCol, "#B5694A", 0.4));
      dabs(fa, p, R, { n: 300, colors: ["#F2A65A", "#8A4A3A"], x0: farL.X0, x1: farL.X1, y0: hz - 80, y1: hz + 20, alpha: 0.18 });
    } else if (loc === "roman-forum") {
      p = ridge(farL, hz, 110, R, { f: 0.003 });
      paintShape(fa, p, mix(farCol, "#7A8A5A", 0.45));
      for (i = 0; i < 3; i++) { x = lerp(farL.X0 + 300, farL.X1 - 300, (i + 0.5) / 3); cTemple(fa, x, yOn(p, x) + 10, 200, 150, mix("#E8DCC4", skyC[1], 0.35), 6); }
    } else if (loc === "modern-city" || loc === "future-city") {
      for (x = farL.X0; x < farL.X1; x += 40 + R() * 60) {
        var bw = 40 + R() * 70, bh = loc === "future-city" ? 220 + R() * 320 : 120 + R() * 220;
        cTower(fa, R, x, hz + 10, bw, bh, farCol, { slim: loc === "future-city" && R() < 0.5, lit: t === "night" || loc === "future-city" ? 0.5 : 0.05, litCol: loc === "future-city" ? "#7FF3FF" : "#FFE08A" });
      }
    } else if (loc === "dying-sun" || loc === "cosmos") {
      p = ridge(farL, hz, 90, R, { peaks: true, f: 0.005 });
      paintShape(fa, p, farCol);
    }
    haze(fa, farL, hz - 160, hz + 20, skyC[1], 0.45);
    // mid layer
    var midL = sc.layers.mid, mi = layerCanvas(sc, "mid", 0.9);
    var midBase = hz + 40;
    if (loc === "savanna") {
      for (i = 0; i < 6 * sc.span; i++) { x = lerp(midL.X0 + 80, midL.X1 - 80, (i + R()) / (6 * sc.span)); cTree(mi, R, x, midBase + R() * 20, 170 + R() * 90, "acacia", t === "night" ? "#1C2238" : "#5A4A2A"); }
    } else if (loc === "tundra") {
      p = ridge(midL, midBase, 60, R, { f: 0.008 }); paintShape(mi, p, mix("#DDE9F2", skyC[1], 0.2));
      for (i = 0; i < 7 * sc.span; i++) { x = lerp(midL.X0, midL.X1, R()); cTree(mi, R, x, yOn(p, x) + 6, 120 + R() * 80, "pine", "#3E5A62"); }
    } else if (loc === "forest") {
      for (i = 0; i < 14 * sc.span; i++) { x = lerp(midL.X0, midL.X1, R()); cTree(mi, R, x, midBase + R() * 30, 260 + R() * 160, R() < 0.5 ? "pine" : "round", R() < 0.5 ? "#2F5A2E" : "#3F6E34"); }
    } else if (loc === "desert") {
      p = ridge(midL, midBase, 50, R, { f: 0.006 }); paintShape(mi, p, mix(gr[0], "#F4CF85", 0.4));
      dabs(mi, p, R, { n: 300, colors: ["#F4D08A", "#C98E45"], x0: midL.X0, x1: midL.X1, y0: midBase - 60, y1: midBase + 60, alpha: 0.2, ang: 0, spread: 0.3, len: 40, w: 3 });
      for (i = 0; i < 2 * sc.span; i++) { x = lerp(midL.X0 + 200, midL.X1 - 200, (i + R()) / (2 * sc.span)); cPyramid(mi, x, yOn(p, x) + 6, 300 + R() * 120, "#D69A55"); }
    } else if (loc === "nile") {
      var rv = new Path2D(); rv.rect(midL.X0 - 10, midBase - 20, midL.X1 - midL.X0 + 20, 70);
      mi.fillStyle = vgrad(mi, midBase - 20, midBase + 50, ["#3F8FB0", "#2A6A8E"]); mi.fill(rv);
      dabs(mi, rv, R, { n: 500, colors: ["#BFE6F2", "#FFFFFF"], x0: midL.X0, x1: midL.X1, y0: midBase - 18, y1: midBase + 48, alpha: 0.35, ang: 0, spread: 0.1, len: 30, w: 2.5 });
      for (i = 0; i < 6 * sc.span; i++) { x = lerp(midL.X0, midL.X1, R()); cTree(mi, R, x, midBase - 18, 150 + R() * 80, "palm", "#3E6A2E"); }
    } else if (loc === "roman-forum") {
      for (i = 0; i < 3 * sc.span; i++) { x = lerp(midL.X0 + 150, midL.X1 - 150, (i + 0.5) / (3 * sc.span)); if (i % 2) cTemple(mi, x, midBase + 20, 360, 260, "#E9DFC9", 6); else { cHouse(mi, R, x, midBase + 20, 220, 170, "#D9B98E", "#A8502E", { flat: true, sparse: 0.6 }); } }
    } else if (loc === "greek-agora") {
      p = ridge(midL, midBase - 40, 50, R, { f: 0.004 }); paintShape(mi, p, "#B9A77A");
      for (i = 0; i < 2 * sc.span; i++) { x = lerp(midL.X0 + 200, midL.X1 - 200, (i + 0.5) / (2 * sc.span)); cTemple(mi, x, midBase + 20, 420, 250, "#F2EBDA", 8); }
    } else if (loc === "medieval-village") {
      for (i = 0; i < 6 * sc.span; i++) { x = lerp(midL.X0 + 100, midL.X1 - 100, (i + R() * 0.4) / (6 * sc.span)); cHouse(mi, R, x, midBase + 30, 130 + R() * 60, 110 + R() * 60, "#EADBB8", R() < 0.5 ? "#8E4A2E" : "#6E5A3A", { timber: true, sparse: 0.6, lit: t === "night" ? 0.8 : 0 }); }
      cTower(mi, R, midL.X0 + (midL.X1 - midL.X0) * 0.62, midBase + 30, 110, 330, "#A89C88", { castle: true, sparse: 0.85 });
    } else if (loc === "modern-city") {
      for (x = midL.X0; x < midL.X1; x += 150 + R() * 90) cTower(mi, R, x, midBase + 30, 130 + R() * 60, 240 + R() * 260, R() < 0.5 ? "#C98A6A" : "#8FA6B8", { lit: t === "night" ? 0.6 : 0.03, sparse: 0.25 });
    } else if (loc === "future-city") {
      for (x = midL.X0; x < midL.X1; x += 160 + R() * 120) cTower(mi, R, x, midBase + 30, 80 + R() * 60, 380 + R() * 300, "#5E6FA8", { slim: true, lit: 0.6, litCol: "#7FF3FF", sparse: 0.3 });
      mi.strokeStyle = rgba("#7FF3FF", 0.7); mi.lineWidth = 5;
      for (i = 0; i < 3 * sc.span; i++) { x = lerp(midL.X0, midL.X1, R()); mi.beginPath(); mi.ellipse(x, hz - 250 - R() * 150, 90, 18, 0, 0, TAU); mi.stroke(); }
    } else if (loc === "dying-sun") {
      p = ridge(midL, midBase, 70, R, { peaks: true, f: 0.008 }); paintShape(mi, p, "#2A0C08");
    } else if (loc === "cosmos") {
      p = ridge(midL, midBase, 40, R, { f: 0.01 }); paintShape(mi, p, "#4A4A62");
    }
    // ground layer
    paintGround(sc, R, gr, hz);
  }
  function paintGround(sc, R, gr, hz) {
    var L = sc.layers.ground, g = layerCanvas(sc, "ground", 1), loc = sc.loc, G = sc.G;
    var top = hz + 50;
    var p = new Path2D();
    p.moveTo(L.X0 - 20, L.Y1 + 20);
    for (var x = L.X0 - 20; x <= L.X1 + 40; x += 30) p.lineTo(x, top + Math.sin(x * 0.004 + 1) * 10 + Math.sin(x * 0.013) * 5);
    p.lineTo(L.X1 + 40, L.Y1 + 20); p.closePath();
    g.fillStyle = vgrad(g, top, L.Y1, [[0, light(gr[0], 0.08)], [0.35, gr[0]], [1, gr[1]]]);
    g.fill(p);
    var area = (L.X1 - L.X0) * (L.Y1 - top), n = Math.floor(area / 900);
    var dc = [light(gr[0], 0.25), dark(gr[0], 0.2), gr[1]];
    if (loc === "savanna" || loc === "medieval-village" || loc === "forest") {
      dabs(g, p, R, { n: n * 1.4, colors: dc.concat(loc === "savanna" ? ["#F2C35A"] : ["#9DB85A"]), x0: L.X0, x1: L.X1, y0: top, y1: L.Y1, alpha: 0.3, ang: -PI / 2, spread: 0.6, len: 22, w: 3.2 });
    } else if (loc === "tundra") {
      dabs(g, p, R, { n: n, colors: ["#FFFFFF", "#CFE0EE", "#AFC6DA"], x0: L.X0, x1: L.X1, y0: top, y1: L.Y1, alpha: 0.35, ang: 0, spread: 0.4, len: 40, w: 5 });
    } else if (loc === "desert" || loc === "nile" || loc === "dying-sun") {
      dabs(g, p, R, { n: n, colors: dc, x0: L.X0, x1: L.X1, y0: top, y1: L.Y1, alpha: 0.28, ang: 0, spread: 0.25, len: 50, w: 3 });
      if (loc === "dying-sun") dabs(g, p, R, { n: n * 0.4, colors: ["#FF6A2A", "#1A0806"], x0: L.X0, x1: L.X1, y0: top, y1: L.Y1, alpha: 0.4, ang: 0.3, spread: 2.5, len: 30, w: 2 });
    } else if (loc === "roman-forum" || loc === "greek-agora") {
      g.save(); g.clip(p); g.strokeStyle = rgba(dark(gr[0], 0.35), 0.35); g.lineWidth = 2.5;
      for (var yy = top + 20, row = 0; yy < L.Y1; yy += 34 + row * 6, row++) { g.beginPath(); g.moveTo(L.X0, yy); g.lineTo(L.X1, yy); g.stroke(); for (var xx = L.X0 + (row % 2) * 40; xx < L.X1; xx += 90 + row * 8) { g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx, yy + 34 + row * 6); g.stroke(); } }
      g.restore();
      dabs(g, p, R, { n: n * 0.6, colors: dc, x0: L.X0, x1: L.X1, y0: top, y1: L.Y1, alpha: 0.2, len: 30, w: 6 });
    } else if (loc === "modern-city") {
      var curb = G + 30;
      g.fillStyle = "#B8B2A8"; g.fillRect(L.X0, top, L.X1 - L.X0, curb - top);
      g.fillStyle = "#5A5856"; g.fillRect(L.X0, curb, L.X1 - L.X0, L.Y1 - curb);
      g.fillStyle = "#EDE6D8"; for (x = L.X0; x < L.X1; x += 120) g.fillRect(x, curb + 90, 60, 8);
      g.strokeStyle = rgba("#6C6A66", 0.5); g.lineWidth = 2; for (x = L.X0; x < L.X1; x += 70) { g.beginPath(); g.moveTo(x, top); g.lineTo(x - 20, curb); g.stroke(); }
      dabs(g, p, R, { n: n * 0.5, colors: dc, x0: L.X0, x1: L.X1, y0: top, y1: L.Y1, alpha: 0.15, len: 30, w: 6 });
    } else if (loc === "future-city") {
      g.strokeStyle = rgba("#7FF3FF", 0.55); g.lineWidth = 3;
      for (var j = 0; j < 6; j++) { var y2 = top + 30 + j * j * 22; g.beginPath(); g.moveTo(L.X0, y2); g.lineTo(L.X1, y2); g.stroke(); }
      dabs(g, p, R, { n: n * 0.4, colors: ["#5E6FA8", "#9FB0E8"], x0: L.X0, x1: L.X1, y0: top, y1: L.Y1, alpha: 0.18, len: 40, w: 5, ang: 0, spread: 0.2 });
    } else if (loc === "cosmos") {
      dabs(g, p, R, { n: n * 0.8, colors: ["#A8A8B8", "#6A6A80", "#3E3E52"], x0: L.X0, x1: L.X1, y0: top, y1: L.Y1, alpha: 0.3, len: 14, w: 6 });
      for (var c = 0; c < 18 * sc.span; c++) { var cx = lerp(L.X0, L.X1, R()), cy = lerp(top + 30, L.Y1, R()), r = 10 + R() * 30; g.strokeStyle = rgba("#3E3E52", 0.5); g.lineWidth = 3; g.beginPath(); g.ellipse(cx, cy, r, r * 0.35, 0, 0, TAU); g.stroke(); }
    }
    // contact shadow band where the cast stands, and a darker foreground lip
    haze(g, L, G - 20, L.Y1, gr[1], 0.35);
    // near layer: a few foreground tufts / rocks for depth (front of the cast is the `front` layer)
    var nf = layerCanvas(sc, "front", 0.9), FL = sc.layers.front;
    var fy = G + (sc.portrait ? 170 : 105);
    for (var q = 0; q < 5 * sc.span; q++) {
      var fx = lerp(FL.X0, FL.X1, R());
      if (Math.abs(fx - sc.Ww / 2) < sc.Ww * 0.32 && R() < 0.8) continue;
      if (loc === "savanna" || loc === "forest" || loc === "medieval-village" || loc === "nile") {
        nf.strokeStyle = loc === "savanna" ? "#8A5A1E" : "#3E5A22"; nf.lineWidth = 6;
        nf.lineWidth = 4;
        for (var b = 0; b < 7; b++) { nf.beginPath(); nf.moveTo(fx + b * 6, fy + 40); nf.quadraticCurveTo(fx + b * 6 + (R() - 0.5) * 16, fy + 10, fx + b * 6 + (R() - 0.5) * 30, fy - 10 - R() * 34); nf.stroke(); }
      } else if (loc !== "modern-city" && loc !== "future-city") {
        nf.fillStyle = dark(gr[1], 0.35); nf.beginPath(); nf.ellipse(fx, fy + 40, 60 + R() * 40, 34, 0, PI, TAU); nf.fill();
        nf.fillStyle = dark(gr[1], 0.15); nf.beginPath(); nf.ellipse(fx - 10, fy + 34, 40, 18, 0, PI, TAU); nf.fill();
      }
    }
  }
  function paintCave(sc, R) {
    var G = sc.G, hz = sc.horizon;
    var sky = sc.layers.sky, s = layerCanvas(sc, "sky", 0.5);
    fillAll(s, sky, vgrad(s, -200, 1200, ["#1E120C", "#3A2416", "#24160E"]));
    // back wall with an opening to the night
    var far = sc.layers.far, f = layerCanvas(sc, "far", 0.75);
    var ox = sc.Ww * 0.8, oy = hz - 120;
    f.fillStyle = vgrad(f, oy - 200, oy + 160, ["#0E1634", "#33406E"]);
    f.beginPath(); f.ellipse(ox, oy, 150, 200, 0, 0, TAU); f.fill();
    stars(f, { X0: ox - 140, X1: ox + 140, Y0: oy - 190 }, R, 40, oy + 100);
    var wall = new Path2D(); wall.rect(far.X0, far.Y0, far.X1 - far.X0, far.Y1 - far.Y0);
    wall.ellipse(ox, oy, 150, 200, 0, 0, TAU);
    f.fillStyle = vgrad(f, -100, hz + 120, ["#3A2416", "#6E4A2E", "#4A3020"]);
    f.fill(wall, "evenodd");
    dabs(f, wall, R, { n: 1200, colors: ["#8A6040", "#2A180E", "#A07050"], x0: far.X0, x1: far.X1, y0: -150, y1: hz + 150, alpha: 0.22, w: 9, len: 30, spread: 3 });
    // cave paintings (ochre animals and hands)
    f.strokeStyle = rgba("#C0552A", 0.75); f.fillStyle = rgba("#C0552A", 0.7); f.lineWidth = 5;
    for (var i = 0; i < 3; i++) {
      var px = sc.Ww * (0.16 + i * 0.22), py = hz - (sc.portrait ? 300 : 345) + (i % 2) * 40;
      f.beginPath(); f.ellipse(px, py, 46, 22, 0, 0, TAU); f.stroke();
      f.beginPath(); f.moveTo(px + 40, py - 6); f.lineTo(px + 62, py - 18); f.moveTo(px - 30, py + 18); f.lineTo(px - 34, py + 40); f.moveTo(px - 10, py + 20); f.lineTo(px - 12, py + 42); f.moveTo(px + 14, py + 20); f.lineTo(px + 16, py + 42); f.moveTo(px + 30, py + 16); f.lineTo(px + 34, py + 40); f.stroke();
      f.beginPath(); f.arc(px + 90, py - 50, 12, 0, TAU); f.fill();
      for (var fg = 0; fg < 5; fg++) { f.beginPath(); f.moveTo(px + 90, py - 50); f.lineTo(px + 90 + Math.cos(-PI + fg * 0.6 - 0.2) * 28, py - 50 + Math.sin(-PI + fg * 0.6 - 0.2) * 28); f.stroke(); }
    }
    // stalactites
    var mid = sc.layers.mid, m = layerCanvas(sc, "mid", 0.9);
    for (var x = mid.X0; x < mid.X1; x += 60 + R() * 80) {
      var len = 60 + R() * 160;
      m.fillStyle = R() < 0.5 ? "#2E1C10" : "#3E2817";
      m.beginPath(); m.moveTo(x - 30, -60); m.lineTo(x, -60 + len); m.lineTo(x + 34, -60); m.closePath(); m.fill();
    }
    m.fillStyle = "#24160E"; m.fillRect(mid.X0, -300, mid.X1 - mid.X0, 250);
    // rock pillars at the sides
    m.fillStyle = "#2A1A10";
    m.beginPath(); m.moveTo(mid.X0, -100); m.lineTo(-20, -100); m.quadraticCurveTo(70, hz, 20, G + 200); m.lineTo(mid.X0, G + 200); m.closePath(); m.fill();
    paintGround(sc, R, sc.groundC, hz);
    // the glow of the fire (animated in frame) sits in the far layer svg
    sc.caveGlow = svg("ellipse", { cx: f2(sc.Ww / 2), cy: f2(G - 120), rx: f2(sc.Ww * 0.6), ry: 420, fill: "url(#" + glowGrad("#FF9A3A") + ")", opacity: 0.55 }, sc.layers.far.g);
  }
  function paintStage(sc, R) {
    var col = str(sc.o.color) || "#F3D9A6";
    var sky = sc.layers.sky, s = layerCanvas(sc, "sky", 0.5);
    fillAll(s, sky, vgrad(s, -200, 1200, [light(col, 0.12), col, dark(col, 0.18)]));
    dabs(s, null, R, { n: 800, colors: [light(col, 0.3), dark(col, 0.15)], x0: sky.X0, x1: sky.X1, y0: -200, y1: 1200, alpha: 0.16, w: 14, len: 50, spread: 3 });
    var g = layerCanvas(sc, "ground", 1), L = sc.layers.ground;
    g.fillStyle = vgrad(g, sc.G - 60, L.Y1, [dark(col, 0.12), dark(col, 0.3)]);
    g.fillRect(L.X0, sc.G - 60, L.X1 - L.X0, L.Y1 - sc.G + 60);
    softCircle(g, sc.Ww / 2, sc.G, sc.Ww * 0.45, "#FFFFFF", 0.25);
    sc.horizon = sc.G - 60;
  }
  var gradCache = {};
  function glowGrad(col, inner) {
    var key = col + (inner || "");
    if (gradCache[key] && gradCache[key].st === st) return gradCache[key].id;
    var id = "dwg" + hash(key) + "_" + (++need().uid);
    var g = svg("radialGradient", { id: id }, st.defs);
    svg("stop", { offset: "0", "stop-color": inner || col, "stop-opacity": 1 }, g);
    svg("stop", { offset: "0.35", "stop-color": col, "stop-opacity": 0.5 }, g);
    svg("stop", { offset: "1", "stop-color": col, "stop-opacity": 0 }, g);
    gradCache[key] = { id: id, st: st };
    return id;
  }
  // Sun / moon live in the sky SVG so templates can move or swell them.
  function makeSun(sc, kind, hz) {
    if (kind === "none" && sc.loc !== "cosmos") return;
    var g = svg("g", null, sc.layers.sky.g), night = sc.time === "night" && sc.loc !== "dying-sun";
    var x = sc.Ww * (sc.portrait ? 0.72 : 0.78), y = hz - (sc.portrait ? 330 : 300), r = kind === "big" ? 70 : kind === "dying" ? 150 : kind === "pale" ? 50 : 56;
    if (sc.loc === "cosmos") { kind = "planet"; r = 90; }
    var col = night ? "#F4EFD8" : kind === "dying" ? "#FF5A2A" : kind === "pale" ? "#FFF6D8" : sc.time === "dusk" || sc.time === "dawn" ? "#FF9E4A" : "#FFE27A";
    var glow = svg("circle", { cx: 0, cy: 0, r: f2(r * 3.2), fill: "url(#" + glowGrad(col) + ")", opacity: night ? 0.35 : 0.8 }, g);
    var disc = svg("circle", { cx: 0, cy: 0, r: f2(r), fill: col }, g);
    if (!night && kind !== "planet") svg("circle", { cx: f2(-r * 0.12), cy: f2(-r * 0.12), r: f2(r * 0.62), fill: "#FFFBE6", opacity: kind === "dying" ? 0.25 : 0.7 }, g);
    if (kind === "planet") {
      disc.setAttribute("fill", "#C9744A");
      svg("path", { d: "M" + -r * 1.8 + " 8Q0 " + r * 0.7 + " " + r * 1.8 + " -8", fill: "none", stroke: "#F2C28A", "stroke-width": 8, opacity: 0.8 }, g);
      svg("circle", { cx: f2(-r * 0.3), cy: f2(-r * 0.2), r: f2(r * 0.25), fill: "#A85A36" }, g);
    }
    if (night && kind !== "planet") svg("circle", { cx: f2(r * 0.35), cy: f2(-r * 0.2), r: f2(r * 0.85), fill: sc.skyC[0], opacity: 0.9 }, g);
    if (kind === "dying") { svg("circle", { cx: 0, cy: 0, r: f2(r * 0.8), fill: "#FF8A3A", opacity: 0.6 }, g); }
    sc.sun = { g: g, disc: disc, glow: glow, x: x, y: y, r: r, keys: [] };
    g.setAttribute("transform", "translate(" + f2(x) + " " + f2(y) + ")");
    sc.onFrame(function (t) {
      var s = 1, dy = 0, col2 = null;
      sc.sun.keys.forEach(function (k) { var p = smooth(prog(t, k.at, k.at + k.dur)); if (k.scale != null) s = lerp(s, k.scale, p); if (k.dy != null) dy = lerp(dy, k.dy, p); if (k.color && p > 0.5) col2 = k.color; });
      g.setAttribute("transform", "translate(" + f2(x) + " " + f2(y + dy) + ") scale(" + f2(s) + ")");
      if (col2) disc.setAttribute("fill", col2);
      glow.setAttribute("opacity", f2((night ? 0.35 : 0.8) * (0.92 + 0.08 * Math.sin(t * 2.1))));
    });
  }
  // A flickering warm wash of light over the cast (world, under the actors).
  function lightWash(sc, x, y, r, color, strength) {
    sc = sc || cur();
    var e = svg("ellipse", { cx: f2(num(x, sc.Ww / 2)), cy: f2(num(y, sc.G - 120)), rx: f2(num(r, 420)), ry: f2(num(r, 420) * 0.75), fill: "url(#" + glowGrad(color || "#FFB04A") + ")", opacity: 0.4 }, sc.glowG);
    var s0 = clamp(num(strength, 0.45), 0, 1);
    sc.onFrame(function (t) { e.setAttribute("opacity", f2(s0 * (0.82 + 0.1 * Math.sin(t * 9.1) + 0.08 * Math.sin(t * 23.3 + 1)))); });
    return e;
  }

  // ------------------------- the cast (one rig) -------------------------
  // Local units: feet at y = 0, y grows down (head near -330), facing right. ~330 units tall.
  var BASE_RIG = { hipY: -98, hipW: 15, th: 52, sn: 50, shY: -176, shW: 33, up: 46, fo: 44, neckY: -190, hr: 68, torsoW: 46, torsoTopW: 38, aw: 17, lw: 20, eyeR: 21, eyeDX: 24, lean: 0, scale: 1 };
  var CAST = {
    og: { who: "Og, the everyman narrator (three messy brown tufts)", rig: {}, skin: "#E8B486", hair: "#6B3E1F", shirt: "#E8743B" },
    ug: { who: "Ug, big burly friend (bushy black beard, unibrow)", rig: { torsoW: 60, torsoTopW: 56, shW: 46, aw: 22, lw: 24, hr: 70, scale: 1.1, hipW: 19 }, skin: "#C68A5A", hair: "#1F1712", shirt: "#B5483A" },
    nia: { who: "Nia, quick and sceptical (high ponytail)", rig: { torsoW: 41, torsoTopW: 35, shW: 30, aw: 15, lw: 18, hr: 66 }, skin: "#9A603E", hair: "#1F1410", shirt: "#2FA39A" },
    pip: { who: "Pip, small curious kid (one curl)", rig: { hr: 80, scale: 0.72, torsoW: 44, torsoTopW: 38 }, skin: "#F2C79A", hair: "#D9622B", shirt: "#F2C230" },
    elder: { who: "Elder, old sage (long white beard, bald with wisps)", rig: { lean: 5, hr: 67 }, skin: "#D9A07A", hair: "#F2EEE6", shirt: "#7B5EA7" },
    zed: { who: "Zed, tall skinny and nervous (flat spikes)", rig: { th: 64, sn: 62, hipY: -122, shY: -210, neckY: -224, torsoW: 37, torsoTopW: 32, shW: 29, hr: 62, aw: 14, lw: 17, hipW: 13 }, skin: "#F0C9A6", hair: "#2F2A4A", shirt: "#5FA84A" },
  };
  var CAST_IDS = Object.keys(CAST);
  function castName(n) { n = str(n).toLowerCase(); return CAST[n] ? n : "og"; }
  function rigOf(name) { var r = Object.assign({}, BASE_RIG, CAST[name].rig); r.headY = r.neckY - r.hr + 8; r.top = r.headY - r.hr; return r; }
  var OUTFITS = {
    caveman: { body: "#A0662F", trim: "#6E4320", legs: "skin", feet: "#7A4A22", sleeve: "none", hem: "fur" },
    egyptian: { body: "skin", kilt: "#F4F1E6", trim: "#E0B13A", legs: "skin", feet: "#B07A3A", sleeve: "none", collar: "#2F6FB0", hat: "nemes" },
    roman: { body: "#EFE6D2", trim: "#C0392B", legs: "skin", feet: "#7A4A22", sleeve: "short", hem: "tunic", sash: "#C0392B", hat: "laurel" },
    greek: { body: "#F4F0E6", trim: "#2F5DA8", legs: "skin", feet: "#8A5A2A", sleeve: "none", hem: "chiton" },
    medieval: { body: "#7A5B3A", trim: "#4A3520", legs: "#3F5A3A", feet: "#4A2E18", sleeve: "long", hem: "tunic", belt: "#3A2414", hat: "hood" },
    viking: { body: "#8E3B2E", trim: "#B8B0A0", legs: "#6A6460", feet: "#4A2E18", sleeve: "long", hem: "tunic", belt: "#3A2414", hat: "helmet", collarFur: true },
    modern: { body: "shirt", trim: null, legs: "#3D5A80", feet: "#F4F1EA", sole: "#2B1A12", sleeve: "short" },
    future: { body: "#C9D3DE", trim: "#3FD0E0", legs: "#B8C4D2", feet: "#3A4458", sleeve: "long", hat: "visor" },
  };
  // Poses: R / L = front / back hand target from its shoulder in arm-reach units [dx forward, dy down],
  // optional 3rd item = elbow bend side. FR / FL = feet [x, lift] in local units. drop lowers the hips.
  var STAND = { R: [0.16, 0.95], L: [0.06, 0.96], FR: [13, 0], FL: [-11, 0], lean: 0, tilt: 0, drop: 0 };
  function P(o) { return Object.assign({}, STAND, o); }
  var POSES = {
    idle: P({}), talk: P({ R: [0.55, 0.42], loop: "talk" }), explain: P({ R: [0.78, 0.02], hand: "open", tilt: -3, loop: "talk" }),
    wave: P({ R: [0.3, -0.86], hand: "open", loop: "wave", tilt: -4 }), point: P({ R: [1, -0.02], hand: "point", lean: 3 }),
    "point-up": P({ R: [0.28, -0.96], hand: "point", tilt: -8 }), "point-down": P({ R: [0.8, 0.58], hand: "point", tilt: 8 }),
    "point-viewer": P({ R: [0.92, 0.18], hand: "point" }), "arms-up": P({ R: [0.26, -0.97], L: [0.12, -0.97], hand: "open", tilt: -6 }),
    cheer: P({ R: [0.38, -0.9], L: [0.26, -0.92], loop: "hop", tilt: -6 }), shrug: P({ R: [0.52, 0.06, 1], L: [0.48, 0.04, 1], hand: "open", tilt: 9 }),
    think: P({ R: [-0.3, -0.3], tilt: 7, look: [0.5, -0.6] }), facepalm: P({ R: [-0.28, -0.86], tilt: 10, lean: 6 }),
    "cross-arms": P({ R: [-0.55, 0.32], L: [0.62, 0.3], front: true }), "hands-hips": P({ R: [0.16, 0.72, -1], L: [0.14, 0.72, -1], FR: [22, 0], FL: [-20, 0] }),
    sit: P({ drop: 46, R: [0.45, 0.72], L: [0.36, 0.76], FR: [54, 0], FL: [44, 0], seat: true }),
    sleep: P({ drop: 46, R: [0.42, 0.78], L: [0.34, 0.8], FR: [54, 0], FL: [44, 0], seat: true, tilt: 20, lean: 4, eyes: "closed", loop: "breathe" }),
    hold: P({ R: [0.58, 0.44] }), "hold-up": P({ R: [0.42, -0.9], tilt: -6 }), carry: P({ R: [0.62, 0.24], L: [0.66, 0.28], lean: -3 }),
    eat: P({ R: [0.5, 0.5], loop: "eat" }), work: P({ R: [0.6, -0.5], L: [0.55, -0.45], loop: "hammer", FR: [20, 0], FL: [-18, 0] }),
    dig: P({ R: [0.7, 0.62], L: [0.55, 0.55], lean: 14, loop: "dig", FR: [22, 0], FL: [-22, 0] }),
    fan: P({ R: [0.32, -0.42], hand: "open", loop: "fan" }), shiver: P({ R: [-0.55, 0.3], L: [0.62, 0.28], lean: 6, drop: 4, loop: "shiver", front: true }),
    panic: P({ R: [0.4, -0.9], L: [0.3, -0.9], hand: "open", loop: "panic" }), cower: P({ drop: 30, lean: 22, tilt: 14, R: [0.18, -0.62], L: [0.1, -0.62], FR: [26, 0], FL: [-22, 0], loop: "shiver" }),
    run: P({ lean: 12, R: [0.4, 0.3], L: [0.2, 0.5], loop: "run" }), walk: P({ loop: "walk" }), nod: P({ loop: "nod" }), headshake: P({ loop: "shake" }),
    bow: P({ lean: 34, tilt: 10, R: [0.2, 0.9], L: [0.1, 0.92] }), "lean-in": P({ lean: 12, R: [0.5, 0.42], tilt: 4 }),
    dance: P({ R: [0.3, -0.85], L: [0.4, 0.5], loop: "dance", hand: "open" }), present: P({ R: [0.86, 0.32], hand: "open", tilt: -3 }),
    "fist-pump": P({ R: [0.28, -0.95], loop: "pump", tilt: -6 }), jump: P({ R: [0.3, -0.9], L: [0.2, -0.9], loop: "hop", hand: "open" }),
    kneel: P({ drop: 44, FR: [44, 0], FL: [-40, 0], R: [0.55, 0.55], L: [0.4, 0.7] }), sad: P({ lean: 8, tilt: 12, R: [0.04, 1], L: [0, 1] }),
    "look-around": P({ loop: "look" }), stir: P({ R: [0.72, 0.56], loop: "stir", lean: 5 }),
    type: P({ R: [0.72, 0.55], L: [0.68, 0.6], loop: "type", tilt: 6 }), phone: P({ R: [0.4, -0.18], tilt: 9, look: [0.6, 0.5] }),
    read: P({ R: [0.62, 0.12], L: [0.6, 0.18], tilt: 9, look: [0.5, 0.5] }), write: P({ R: [0.62, 0.46], loop: "write", tilt: 8 }),
    pray: P({ R: [0.25, 0.22], L: [0.78, 0.22], tilt: -6, front: true }), trade: P({ R: [0.88, 0.28], hand: "open" }),
    guard: P({ R: [0.42, 0.36], FR: [24, 0], FL: [-24, 0] }), fight: P({ R: [0.76, 0.02], L: [0.5, 0.18], FR: [28, 0], FL: [-26, 0], lean: 6, loop: "bounce" }),
    drink: P({ R: [0.06, -0.48], tilt: -12 }), hunt: P({ R: [0.66, 0.18], L: [0.55, 0.32], lean: 7, FR: [26, 0], FL: [-22, 0] }),
    fish: P({ R: [0.82, 0.02], L: [0.7, 0.1] }), freeze: P({ R: [-0.55, 0.3], L: [0.62, 0.28], lean: 6, drop: 4, loop: "shiver", front: true }),
  };
  var POSE_ALIAS = { stand: "idle", neutral: "idle", hug: "cross-arms", celebrate: "cheer", rest: "sit", nap: "sleep", wait: "hands-hips", gather: "point-down", feast: "eat", cook: "stir", farm: "dig", build: "work", chop: "work", water: "hold", torch: "hold-up", hammer: "work", scared: "cower", shock: "arms-up", shocked: "arms-up", crouch: "cower", crossed: "cross-arms", hips: "hands-hips", lookaround: "look-around" };
  var POSE_IDS = Object.keys(POSES);
  function poseName(n) { n = str(n).toLowerCase(); if (POSES[n]) return n; return POSE_ALIAS[n] && POSES[POSE_ALIAS[n]] ? POSE_ALIAS[n] : "idle"; }
  // Activities (template props): pose + automatic prop.
  var ACTIVITY = {
    work: ["work", "hammer"], dig: ["dig", "stick"], eat: ["eat", "meat"], stir: ["stir", "stick"], fan: ["fan", "fan"], shiver: ["shiver"], sit: ["sit"], sleep: ["sleep"],
    think: ["think"], talk: ["talk"], explain: ["explain"], point: ["point"], "point-up": ["point-up"], carry: ["carry", "basket"], "look-around": ["look-around"], dance: ["dance"],
    panic: ["panic"], cower: ["cower"], cheer: ["cheer"], hold: ["hold"], "hold-up": ["hold-up"], hunt: ["hunt", "spear"], fish: ["fish", "stick"], cook: ["stir", "stick"],
    farm: ["dig", "stick"], build: ["work", "hammer"], chop: ["work", "axe"], write: ["write", "scroll"], read: ["read", "book"], phone: ["phone", "phone"], type: ["type", "laptop"],
    drink: ["drink", "cup"], trade: ["trade", "coins"], guard: ["guard", "spear"], fight: ["fight"], pray: ["pray"], rest: ["sit"], nap: ["sleep"], torch: ["hold-up", "torch"],
    gather: ["point-down", "basket"], feast: ["eat", "meat"], water: ["hold", "jug"], freeze: ["freeze"], wait: ["hands-hips"], celebrate: ["cheer"], "cross-arms": ["cross-arms"],
    "hands-hips": ["hands-hips"], shrug: ["shrug"], wave: ["wave"], kneel: ["kneel"], facepalm: ["facepalm"],
  };
  function activityOf(a, era) {
    a = str(a).toLowerCase();
    var r = ACTIVITY[a];
    if (!r) return { pose: poseName(a), prop: null };
    var prop = r[1] || null;
    if ((a === "guard" || a === "fight") && (era === "roman" || era === "medieval" || era === "viking")) prop = "sword";
    if (a === "hunt" && era === "modern") prop = "phone";
    return { pose: r[0], prop: prop };
  }
  var EXPRS = {
    neutral: { m: { w: 0.34, c: 0.08, o: 0 } },
    deadpan: { lid: 0.48, m: { w: 0.32, c: 0, o: 0 }, brow: [-2, 0] },
    happy: { m: { w: 0.48, c: 0.22, o: 0.35 }, brow: [5, -4], blush: 1 },
    excited: { wide: 1, m: { w: 0.55, c: 0.26, o: 0.7 }, brow: [10, -6], blush: 1 },
    sad: { lid: 0.2, lidA: -14, m: { w: 0.32, c: -0.18, o: 0 }, brow: [4, -16], look: [0, 0.4] },
    shocked: { wide: 1, pupil: 0.65, m: { w: 0.24, c: 0, o: 0.95, round: 1 }, brow: [14, -4] },
    scared: { wide: 1, pupil: 0.6, m: { w: 0.4, c: -0.08, o: 0.4, wavy: 1 }, brow: [10, -14], sweat: 1 },
    confused: { m: { w: 0.3, c: 0.02, o: 0, wavy: 1, dx: 0.1 }, brow: [2, 0], browR: [12, -6], look: [0.4, -0.4] },
    angry: { lid: 0.32, lidA: 18, m: { w: 0.44, c: -0.14, o: 0.3, teeth: 1 }, brow: [-6, 20], vein: 1 },
    tired: { lid: 0.58, m: { w: 0.3, c: -0.06, o: 0.1 }, brow: [-2, -8], bags: 1 },
    hot: { lid: 0.2, m: { w: 0.4, c: -0.04, o: 0.6, tongue: 1 }, brow: [4, -10], flush: 1, sweat: 1 },
    cold: { m: { w: 0.44, c: 0, o: 0.32, teeth: 1, chatter: 1 }, brow: [8, -12], chill: 1 },
    smug: { lid: 0.42, m: { w: 0.4, c: 0.14, o: 0, dx: 0.12, side: 1 }, brow: [-2, 6], browR: [8, -4] },
    thinking: { m: { w: 0.22, c: -0.02, o: 0, dx: 0.16 }, brow: [2, 0], browR: [12, -6], look: [0.6, -0.65] },
    hungry: { wide: 1, m: { w: 0.42, c: 0.1, o: 0.5, tongue: 1 }, brow: [8, -6], drool: 1 },
    sleepy: { eyes: "closed", m: { w: 0.22, c: 0.02, o: 0.12 }, brow: [-4, 0] },
    proud: { eyes: "happy", m: { w: 0.5, c: 0.24, o: 0.3 }, brow: [8, -4], blush: 1, chin: -6 },
  };
  var EXPR_ALIAS = { shock: "shocked", surprised: "shocked", fear: "scared", afraid: "scared", mad: "angry", joy: "happy", smile: "happy", bored: "deadpan", meh: "deadpan", idea: "excited", sweaty: "hot", freezing: "cold", think: "thinking", relieved: "happy", worried: "scared" };
  var EXPR_IDS = Object.keys(EXPRS);
  function exprName(n) { n = str(n).toLowerCase(); if (EXPRS[n]) return n; return EXPR_ALIAS[n] || "neutral"; }

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
      if (V.words.length) {
        var wi = wordAt(t);
        if (wi >= 0) {
          var w = V.words[wi];
          if (t <= w.end + 0.03) {
            var q = clamp((t - w.start) / Math.max(0.06, w.end - w.start), 0, 1), sy = syllables(w.word);
            return Math.pow(Math.abs(Math.sin(PI * q * sy)), 0.7) * (0.75 + 0.25 * Math.sin(t * 13 + wi));
          }
        }
        return 0.04;
      }
      return Math.max(0, 0.4 + 0.45 * Math.sin(t * 17) * Math.sin(t * 6.3));
    }
    return 0;
  }
  function limb(g, col, w, outW) {
    return {
      o: svg("path", { fill: "none", stroke: C.ink, "stroke-width": f2(w + outW * 2), "stroke-linecap": "round", "stroke-linejoin": "round" }, g),
      f: svg("path", { fill: "none", stroke: col, "stroke-width": f2(w), "stroke-linecap": "round", "stroke-linejoin": "round" }, g),
    };
  }
  function seg3(a, b, c2) { return "M" + P2(a[0], a[1]) + "Q" + P2(b[0] * 1.0, b[1]) + " " + P2(c2[0], c2[1]); }
  function seg3L(a, b, c2) { return "M" + P2(a[0], a[1]) + "L" + P2(b[0], b[1]) + "L" + P2(c2[0], c2[1]); }

  // Shared movement (actors and animals): x keys, facing keys, show/hide windows.
  function mover(self, sc, x0, facing) {
    self.sc = sc; self.x0 = x0; self._moves = []; self._faces = []; self._vis = [];
    self._facing0 = facing;
    self.xAt = function (t) {
      var x = self.x0;
      for (var i = 0; i < self._moves.length; i++) {
        var m = self._moves[i];
        if (t < m.at) break;
        if (m.from == null) m.from = x;
        x = lerp(m.from, m.to, m.ez(prog(t, m.at, m.at + m.dur)));
      }
      return x;
    };
    self.distAt = function (t) {
      var x = self.x0, d = 0;
      for (var i = 0; i < self._moves.length; i++) {
        var m = self._moves[i];
        if (t < m.at) break;
        if (m.from == null) m.from = x;
        var nx = lerp(m.from, m.to, m.ez(prog(t, m.at, m.at + m.dur)));
        d += Math.abs(nx - m.from); x = nx;
      }
      return d;
    };
    self.gaitAt = function (t) { var g = null; for (var i = 0; i < self._moves.length; i++) { var m = self._moves[i]; if (t >= m.at - 0.05 && t <= m.at + m.dur + 0.05) g = m.gait; } return g; };
    self.facingAt = function (t) {
      var f = self._facing0;
      var a = self.xAt(t - 0.04), b = self.xAt(t + 0.04);
      var lastMoveDir = null;
      for (var i = 0; i < self._moves.length; i++) { var m = self._moves[i]; if (t >= m.at && m.to !== m.from && m.from != null) lastMoveDir = m.to > m.from ? 1 : -1; }
      var lastFace = null, lastFaceAt = -1;
      self._faces.forEach(function (k) { if (t >= k.at && k.at >= lastFaceAt) { lastFace = k.dir; lastFaceAt = k.at; } });
      var lastMoveAt = -1;
      self._moves.forEach(function (m) { if (t >= m.at && m.to !== m.from) lastMoveAt = Math.max(lastMoveAt, m.at); });
      if (Math.abs(b - a) > 0.05) return b > a ? 1 : -1;
      if (lastFace != null && lastFaceAt >= lastMoveAt) return lastFace;
      if (lastMoveDir != null && self.keepMoveFacing !== false) return lastMoveDir;
      return lastFace != null ? lastFace : f;
    };
    self.visibleAt = function (t) {
      var v = true;
      self._vis.forEach(function (k) { if (t >= k.at) v = k.on; });
      return v;
    };
    self.moveTo = function (x, at, dur, o) {
      o = obj(o);
      var m = { to: num(x, self.x0), at: Math.max(0, num(at, 0)), dur: Math.max(0.05, num(dur, 1.2)), gait: o.gait === "run" ? "run" : "walk", ez: ease(o.ease || "inOutSine"), from: null };
      self._moves.push(m);
      self._moves.sort(function (p, q) { return p.at - q.at; });
      self._moves.forEach(function (k) { k.from = null; });
      return self;
    };
    self.walkTo = function (x, at, dur) { return self.moveTo(x, at, dur, { gait: "walk", ease: "linear" }); };
    self.runTo = function (x, at, dur) { return self.moveTo(x, at, dur == null ? 0.8 : dur, { gait: "run", ease: "linear" }); };
    self.enter = function (side, at, dur, x) {
      var off = side === "right" ? sc.worldW + 160 : -160;
      var target = x == null ? self.x0 : num(x, self.x0);
      self.x0 = off;
      self._moves.forEach(function (k) { k.from = null; });
      return self.moveTo(target, at, dur == null ? 1.4 : dur, { gait: "walk", ease: "outQuad" });
    };
    self.exit = function (side, at, dur) { return self.moveTo(side === "right" ? sc.worldW + 200 : -200, at, dur == null ? 1.2 : dur, { gait: "walk", ease: "inQuad" }); };
    self.face = function (dir, at) { self._faces.push({ dir: dir === "left" || dir === -1 ? -1 : 1, at: num(at, 0) }); return self; };
    self.show = function (at) { self._vis.push({ at: num(at, 0), on: true }); self._vis.sort(function (p, q) { return p.at - q.at; }); return self; };
    self.hide = function (at) { self._vis.push({ at: num(at, 0), on: false }); self._vis.sort(function (p, q) { return p.at - q.at; }); return self; };
  }

  // Hair, beards and hats are static drawings in head space (head centre at 0,0, radius r).
  function drawHairBack(name, g, r, cs, era) {
    if (name === "nia" && era !== "egyptian" && era !== "future" && era !== "medieval") {
      svg("path", { d: "M" + P2(-r * 0.55, -r * 0.8) + "C" + P2(-r * 1.3, -r * 1.5) + " " + P2(-r * 1.75, -r * 0.4) + " " + P2(-r * 1.45, r * 0.25) + "C" + P2(-r * 1.3, -r * 0.2) + " " + P2(-r * 1.1, -r * 0.6) + " " + P2(-r * 0.6, -r * 0.55) + "Z", fill: cs.hair, stroke: C.ink, "stroke-width": 5, "stroke-linejoin": "round" }, g);
      svg("circle", { cx: f2(-r * 0.62), cy: f2(-r * 0.78), r: 8, fill: "#E8392B", stroke: C.ink, "stroke-width": 3.5 }, g);
    }
  }
  function drawHairFront(name, g, r, cs, R, era) {
    var I = 5, H2 = cs.hair, hidden = era === "egyptian" || era === "medieval" || era === "viking";
    if (name === "og" && !hidden) {
      [[-0.42, -0.3, 0.32], [0.02, 0.05, 0.36], [0.44, 0.38, 0.3]].forEach(function (q) {
        var bx = q[0] * r, lean = q[1] * r, h = q[2] * r, by = -Math.sqrt(Math.max(0, r * r - bx * bx)) * 0.96;
        svg("path", { d: "M" + P2(bx - h * 0.42, by + 8) + "C" + P2(bx - h * 0.5, by - h * 0.7) + " " + P2(bx + lean * 0.6, by - h * 1.25) + " " + P2(bx + lean, by - h * 1.15) + "C" + P2(bx + lean * 0.4, by - h * 0.85) + " " + P2(bx + h * 0.5, by - h * 0.55) + " " + P2(bx + h * 0.42, by + 8) + "Z", fill: H2, stroke: C.ink, "stroke-width": I, "stroke-linejoin": "round" }, g);
      });
      svg("path", { d: "M" + P2(-r * 0.95, -r * 0.12) + "C" + P2(-r * 1.02, -r * 1.12) + " " + P2(r * 1.0, -r * 1.16) + " " + P2(r * 0.96, -r * 0.2) + "Q" + P2(r * 0.78, -r * 0.5) + " " + P2(r * 0.55, -r * 0.36) + "Q" + P2(r * 0.36, -r * 0.6) + " " + P2(r * 0.12, -r * 0.44) + "Q" + P2(-r * 0.12, -r * 0.62) + " " + P2(-r * 0.36, -r * 0.46) + "Q" + P2(-r * 0.62, -r * 0.62) + " " + P2(-r * 0.78, -r * 0.4) + "Q" + P2(-r * 0.92, -r * 0.3) + " " + P2(-r * 0.95, -r * 0.12) + "Z", fill: H2, stroke: C.ink, "stroke-width": I, "stroke-linejoin": "round" }, g);
    } else if (name === "ug" && !hidden) {
      svg("path", { d: "M" + P2(-r * 0.8, -r * 0.6) + "C" + P2(-r * 0.86, -r * 1.18) + " " + P2(r * 0.7, -r * 1.26) + " " + P2(r * 0.84, -r * 0.62) + "C" + P2(r * 0.5, -r * 0.88) + " " + P2(-r * 0.4, -r * 0.92) + " " + P2(-r * 0.8, -r * 0.6) + "Z", fill: H2, stroke: C.ink, "stroke-width": I, "stroke-linejoin": "round" }, g);
    } else if (name === "nia" && !hidden && era !== "future") {
      svg("path", { d: "M" + P2(-r * 0.9, -r * 0.2) + "C" + P2(-r * 0.95, -r * 1.2) + " " + P2(r * 0.9, -r * 1.25) + " " + P2(r * 0.92, -r * 0.3) + "C" + P2(r * 0.4, -r * 0.75) + " " + P2(-r * 0.1, -r * 0.55) + " " + P2(-r * 0.9, -r * 0.2) + "Z", fill: H2, stroke: C.ink, "stroke-width": I, "stroke-linejoin": "round" }, g);
    } else if (name === "pip" && !hidden) {
      svg("path", { d: "M" + P2(-4, -r * 0.96) + "C" + P2(-10, -r * 1.5) + " " + P2(34, -r * 1.5) + " " + P2(26, -r * 1.18) + "C" + P2(20, -r * 1.02) + " " + P2(6, -r * 1.12) + " " + P2(10, -r * 1.26), fill: "none", stroke: C.ink, "stroke-width": 13, "stroke-linecap": "round" }, g);
      svg("path", { d: "M" + P2(-4, -r * 0.96) + "C" + P2(-10, -r * 1.5) + " " + P2(34, -r * 1.5) + " " + P2(26, -r * 1.18) + "C" + P2(20, -r * 1.02) + " " + P2(6, -r * 1.12) + " " + P2(10, -r * 1.26), fill: "none", stroke: H2, "stroke-width": 6, "stroke-linecap": "round" }, g);
    } else if (name === "elder") {
      if (!hidden) [-1, 1].forEach(function (sd) {
        var cx = sd * r * 0.92, cy = -r * 0.2;
        svg("path", { d: "M" + P2(cx - sd * 4, cy - r * 0.32) + "q" + f2(sd * r * 0.3) + " " + f2(r * 0.02) + " " + f2(sd * r * 0.2) + " " + f2(r * 0.26) + "q" + f2(sd * r * 0.12) + " " + f2(r * 0.14) + " " + f2(-sd * r * 0.06) + " " + f2(r * 0.3) + "q" + f2(-sd * r * 0.1) + " " + f2(r * 0.04) + " " + f2(-sd * r * 0.16) + " " + f2(-r * 0.04) + "Z", fill: "#F4F0E8", stroke: C.ink, "stroke-width": 4.5, "stroke-linejoin": "round" }, g);
      });
      if (!hidden) svg("path", { d: "M" + P2(-r * 0.12, -r * 0.97) + "q" + f2(r * 0.06) + " " + f2(-r * 0.2) + " " + f2(r * 0.22) + " " + f2(-r * 0.16) + "M" + P2(r * 0.12, -r * 0.98) + "q" + f2(r * 0.12) + " " + f2(-r * 0.12) + " " + f2(r * 0.24) + " " + f2(-r * 0.02), fill: "none", stroke: "#CFC8BA", "stroke-width": 4, "stroke-linecap": "round" }, g);
    } else if (name === "zed" && !hidden) {
      var zp = [[-r * 0.93, -r * 0.34]], k;
      for (k = 0; k <= 12; k++) { var a = PI + 0.3 + (k / 12) * (PI - 0.6), rr = r * (k % 2 ? 0.98 : 1.3); zp.push([Math.cos(a) * rr + (k % 2 ? 0 : r * 0.06), Math.sin(a) * rr]); }
      zp.push([r * 0.93, -r * 0.36]);
      zp.push([r * 0.6, -r * 0.52]); zp.push([r * 0.25, -r * 0.48]); zp.push([-r * 0.1, -r * 0.56]); zp.push([-r * 0.5, -r * 0.5]); zp.push([-r * 0.8, -r * 0.42]);
      svg("path", { d: polyD(zp), fill: H2, stroke: C.ink, "stroke-width": I, "stroke-linejoin": "round" }, g);
    }
  }
  function drawBeard(name, g, r, cs) {
    if (name === "ug") {
      svg("path", { d: "M" + P2(-r * 0.92, -r * 0.05) + "C" + P2(-r * 1.0, r * 0.95) + " " + P2(-r * 0.3, r * 1.3) + " " + P2(r * 0.15, r * 1.25) + "C" + P2(r * 0.7, r * 1.25) + " " + P2(r * 1.05, r * 0.8) + " " + P2(r * 0.95, -r * 0.05) + "C" + P2(r * 0.7, r * 0.45) + " " + P2(-r * 0.6, r * 0.45) + " " + P2(-r * 0.92, -r * 0.05) + "Z", fill: cs.hair, stroke: C.ink, "stroke-width": 5, "stroke-linejoin": "round" }, g);
    } else if (name === "elder") {
      svg("path", { d: "M" + P2(-r * 0.8, r * 0.1) + "C" + P2(-r * 0.9, r * 1.4) + " " + P2(-r * 0.2, r * 2.4) + " " + P2(r * 0.25, r * 2.7) + "C" + P2(r * 0.3, r * 2.2) + " " + P2(r * 0.95, r * 1.4) + " " + P2(r * 0.88, r * 0.1) + "C" + P2(r * 0.5, r * 0.55) + " " + P2(-r * 0.4, r * 0.55) + " " + P2(-r * 0.8, r * 0.1) + "Z", fill: "#F4F0E8", stroke: C.ink, "stroke-width": 5, "stroke-linejoin": "round" }, g);
      svg("path", { d: "M" + P2(-r * 0.2, r * 0.9) + "q10 40 4 80M" + P2(r * 0.3, r * 0.9) + "q-6 40 0 70", fill: "none", stroke: "#CFC8BA", "stroke-width": 3.5, "stroke-linecap": "round" }, g);
    }
  }
  function drawHat(era, g, r, name) {
    var I = 5;
    if (era === "egyptian") {
      svg("path", { d: "M" + P2(-r * 0.98, -r * 0.05) + "C" + P2(-r * 1.05, -r * 1.15) + " " + P2(r * 1.05, -r * 1.15) + " " + P2(r * 0.98, -r * 0.05) + "L" + P2(r * 1.15, r * 0.95) + "L" + P2(r * 0.7, r * 0.95) + "L" + P2(r * 0.72, -r * 0.2) + "C" + P2(r * 0.4, -r * 0.45) + " " + P2(-r * 0.4, -r * 0.45) + " " + P2(-r * 0.72, -r * 0.2) + "L" + P2(-r * 0.7, r * 0.95) + "L" + P2(-r * 1.15, r * 0.95) + "Z", fill: "#2F6FB0", stroke: C.ink, "stroke-width": I, "stroke-linejoin": "round" }, g);
      for (var i = 0; i < 4; i++) svg("path", { d: "M" + P2(-r * 0.95 + i * 2, -r * 0.62 + i * r * 0.38) + "L" + P2(-r * 0.75, -r * 0.5 + i * r * 0.38) + "M" + P2(r * 0.95 - i * 2, -r * 0.62 + i * r * 0.38) + "L" + P2(r * 0.75, -r * 0.5 + i * r * 0.38), stroke: "#E0B13A", "stroke-width": 7, "stroke-linecap": "round" }, g);
      svg("path", { d: "M" + P2(-r * 0.6, -r * 0.62) + "Q0 " + f2(-r * 0.95) + " " + P2(r * 0.6, -r * 0.62), fill: "none", stroke: "#E0B13A", "stroke-width": 7 }, g);
    } else if (era === "roman") {
      for (var j = 0; j < 7; j++) {
        var a = PI + 0.25 + j * 0.45, x = Math.cos(a) * r * 0.98, y = Math.sin(a) * r * 0.98;
        svg("ellipse", { cx: f2(x), cy: f2(y), rx: 12, ry: 6, transform: "rotate(" + f2((a * 180) / PI + 70) + " " + f2(x) + " " + f2(y) + ")", fill: "#5E9A3A", stroke: C.ink, "stroke-width": 3 }, g);
      }
    } else if (era === "medieval") {
      svg("path", { d: "M" + P2(-r * 1.1, r * 0.5) + "C" + P2(-r * 1.3, -r * 1.2) + " " + P2(r * 1.2, -r * 1.35) + " " + P2(r * 1.1, r * 0.4) + "C" + P2(r * 0.9, -r * 0.5) + " " + P2(-r * 0.8, -r * 0.6) + " " + P2(-r * 1.1, r * 0.5) + "Z", fill: "#6A4E30", stroke: C.ink, "stroke-width": I, "stroke-linejoin": "round" }, g);
    } else if (era === "viking") {
      svg("path", { d: "M" + P2(-r * 0.98, -r * 0.2) + "C" + P2(-r * 1.0, -r * 1.25) + " " + P2(r * 1.0, -r * 1.25) + " " + P2(r * 0.98, -r * 0.2) + "Z", fill: "#9AA2AA", stroke: C.ink, "stroke-width": I, "stroke-linejoin": "round" }, g);
      svg("path", { d: "M" + P2(-r * 1.02, -r * 0.2) + "H" + f2(r * 1.02), stroke: C.ink, "stroke-width": 12, "stroke-linecap": "round" }, g);
      svg("path", { d: "M" + P2(-r * 1.0, -r * 0.2) + "H" + f2(r * 1.0), stroke: "#C9A24A", "stroke-width": 6, "stroke-linecap": "round" }, g);
      svg("path", { d: "M0 " + f2(-r * 0.95) + "V" + f2(-r * 0.25), stroke: "#C9A24A", "stroke-width": 6 }, g);
    } else if (era === "future") {
      svg("path", { d: "M" + P2(-r * 0.98, -r * 0.42) + "Q0 " + f2(-r * 0.62) + " " + P2(r * 0.98, -r * 0.42), fill: "none", stroke: C.ink, "stroke-width": 15, "stroke-linecap": "round" }, g);
      svg("path", { d: "M" + P2(-r * 0.95, -r * 0.42) + "Q0 " + f2(-r * 0.62) + " " + P2(r * 0.95, -r * 0.42), fill: "none", stroke: "#3FD0E0", "stroke-width": 8, "stroke-linecap": "round" }, g);
    }
  }
  // Torso drawing (local coords, origin at feet, torso spans hipY..shY).
  function drawTorso(g, M, cs, of, R) {
    var I = 6, top = M.shY - 10, bot = M.hipY + 14, tw = M.torsoTopW, bw = M.torsoW;
    var body = of.body === "skin" ? cs.skin : of.body === "shirt" ? cs.shirt : of.body;
    var d = "M" + P2(-tw, top + 18) + "C" + P2(-tw, top - 2) + " " + P2(tw, top - 2) + " " + P2(tw, top + 18) + "C" + P2(bw + 6, (top + bot) / 2) + " " + P2(bw + 2, bot) + " " + P2(bw - 6, bot) + "L" + P2(-bw + 6, bot) + "C" + P2(-bw - 2, bot) + " " + P2(-bw - 6, (top + bot) / 2) + " " + P2(-tw, top + 18) + "Z";
    svg("path", { d: d, fill: body, stroke: C.ink, "stroke-width": I, "stroke-linejoin": "round" }, g);
    svg("path", { d: "M" + P2(tw * 0.35, top + 10) + "C" + P2(bw * 0.9, (top + bot) / 2) + " " + P2(bw * 0.8, bot - 10) + " " + P2(bw * 0.5, bot - 4) + "L" + P2(bw - 8, bot - 4) + "C" + P2(bw, bot - 20) + " " + P2(bw, top + 40) + " " + P2(tw * 0.75, top + 8) + "Z", fill: rgba("#2B1A12", 0.14) }, g);
    if (of.hem === "fur") {
      var pts = [], n = 9;
      for (var i = 0; i <= n; i++) { var x = -bw - 4 + ((bw * 2 + 8) * i) / n; pts.push([x, bot - 8]); if (i < n) pts.push([x + (bw * 2 + 8) / n / 2, bot + 22 + (i % 2) * 8]); }
      pts.push([bw + 4, bot - 20]); pts.push([-bw - 4, bot - 20]);
      svg("path", { d: polyD(pts), fill: of.body, stroke: C.ink, "stroke-width": 5, "stroke-linejoin": "round" }, g);
      svg("path", { d: "M" + P2(-tw + 6, top + 6) + "L" + P2(bw - 8, bot - 30), stroke: of.trim, "stroke-width": 9, "stroke-linecap": "round" }, g);
      for (var s = 0; s < 5; s++) svg("ellipse", { cx: f2(-bw * 0.6 + R() * bw * 1.2), cy: f2(lerp(top + 30, bot - 10, R())), rx: 6, ry: 4, fill: of.trim, opacity: 0.8 }, g);
    } else if (of.kilt) {
      svg("path", { d: "M" + P2(-bw - 2, bot - 26) + "L" + P2(bw + 2, bot - 26) + "L" + P2(bw + 12, bot + 34) + "L" + P2(-bw - 8, bot + 34) + "Z", fill: of.kilt, stroke: C.ink, "stroke-width": 5, "stroke-linejoin": "round" }, g);
      svg("path", { d: "M" + P2(-bw - 2, bot - 22) + "H" + f2(bw + 2), stroke: of.trim, "stroke-width": 9 }, g);
      for (var k2 = 0; k2 < 4; k2++) svg("path", { d: "M" + P2(-bw + 10 + k2 * bw * 0.55, bot - 14) + "L" + P2(-bw + 4 + k2 * bw * 0.6, bot + 30), stroke: rgba(C.ink, 0.3), "stroke-width": 2.5 }, g);
      svg("path", { d: "M" + P2(-tw - 4, top + 14) + "Q0 " + f2(top + 50) + " " + P2(tw + 4, top + 14) + "Q0 " + f2(top + 30) + " " + P2(-tw - 4, top + 14) + "Z", fill: of.collar, stroke: C.ink, "stroke-width": 4 }, g);
      svg("path", { d: "M" + P2(-tw + 2, top + 22) + "Q0 " + f2(top + 44) + " " + P2(tw - 2, top + 22), fill: "none", stroke: of.trim, "stroke-width": 5 }, g);
    } else if (of.hem === "tunic" || of.hem === "chiton") {
      svg("path", { d: "M" + P2(-bw - 2, bot - 20) + "L" + P2(bw + 2, bot - 20) + "L" + P2(bw + 10, bot + 30) + "Q0 " + f2(bot + 38) + " " + P2(-bw - 8, bot + 30) + "Z", fill: body, stroke: C.ink, "stroke-width": 5, "stroke-linejoin": "round" }, g);
      if (of.hem === "chiton") {
        svg("path", { d: "M" + P2(-bw - 6, bot + 22) + "Q0 " + f2(bot + 32) + " " + P2(bw + 8, bot + 22), fill: "none", stroke: of.trim, "stroke-width": 7 }, g);
        svg("path", { d: "M" + P2(-tw + 4, top + 4) + "L" + P2(bw - 6, bot - 24), stroke: rgba(C.ink, 0.25), "stroke-width": 3 }, g);
      }
      if (of.sash) svg("path", { d: "M" + P2(-tw + 2, top + 8) + "L" + P2(bw, bot - 18), stroke: of.sash, "stroke-width": 13, "stroke-linecap": "round" }, g);
      if (of.belt) svg("path", { d: "M" + P2(-bw - 3, bot - 22) + "H" + f2(bw + 3), stroke: of.belt, "stroke-width": 9 }, g);
      if (of.collarFur) svg("path", { d: wobEll(0, top + 8, tw + 10, 16, R, 0.12, 10), fill: of.trim, stroke: C.ink, "stroke-width": 4 }, g);
    } else if (of.body === "shirt") {
      svg("path", { d: "M" + P2(-14, top + 2) + "Q0 " + f2(top + 18) + " " + P2(14, top + 2), fill: "none", stroke: C.ink, "stroke-width": 4 }, g);
      svg("path", { d: "M" + P2(-bw + 2, bot - 4) + "H" + f2(bw - 2), stroke: dark(cs.shirt, 0.25), "stroke-width": 5 }, g);
    } else if (of.trim && of.hat === "visor") {
      svg("path", { d: "M0 " + f2(top + 6) + "V" + f2(bot - 6) + "M" + P2(-bw + 8, (top + bot) / 2 + 10) + "H" + f2(bw - 8), stroke: of.trim, "stroke-width": 5, "stroke-linecap": "round" }, g);
      svg("circle", { cx: 0, cy: f2((top + bot) / 2 + 10), r: 9, fill: of.trim, stroke: C.ink, "stroke-width": 3 }, g);
    }
  }

  // S.character(name, opts) -> Actor
  function character(name, o) {
    o = obj(o);
    var sc = o.scene || cur();
    name = castName(name);
    var cs = CAST[name], M = rigOf(name);
    var era = eraName(o.outfit || o.era, sc.era), of = OUTFITS[era];
    var scale = num(o.scale, 1) * M.scale * sc.charScale;
    var R = V.makeRand(hash(name + era) + 7);
    var self = { name: name, era: era, kind: "actor", scale: scale, height: -M.top * scale, rig: M };
    mover(self, sc, num(o.x, sc.Ww / 2), o.facing === "left" ? -1 : 1);
    self.y0 = num(o.y, sc.G);
    var root = svg("g", { class: "dw-actor" }, o.layer === "front" ? sc.layers.front.g : o.layer === "rear" ? sc.rearG : sc.castG);
    var shadow = svg("ellipse", { cx: 0, cy: 2, rx: f2(M.torsoW + 26), ry: 12, fill: C.shadow }, root);
    var seat = svg("g", { display: "none" }, root);
    svg("path", { d: wobEll(-6, M.hipY + 46 + 28, 54, 30, R, 0.08, 10), fill: "#8C7A66", stroke: C.ink, "stroke-width": 6 }, seat);
    svg("path", { d: "M" + P2(-40, M.hipY + 60) + "q20 -10 50 -6", fill: "none", stroke: rgba("#FFFFFF", 0.35), "stroke-width": 5, "stroke-linecap": "round" }, seat);
    var torsoBack = svg("g", null, root);
    var legsG = svg("g", null, root);
    var torsoFront = svg("g", null, root);
    var skin = cs.skin, armCol = of.sleeve === "long" ? (of.body === "shirt" ? cs.shirt : of.body) : skin;
    var legCol = of.legs === "skin" ? skin : of.legs, OL = 5.5;
    var armL = limb(torsoBack, dark(armCol, 0.12), M.aw, OL);
    var handL = svg("circle", { r: f2(M.aw * 0.68), fill: dark(skin, 0.12), stroke: C.ink, "stroke-width": 5 }, torsoBack);
    var legL = limb(legsG, dark(legCol, 0.12), M.lw, OL);
    var footL = svg("path", { fill: dark(of.feet, 0.1), stroke: C.ink, "stroke-width": 5, "stroke-linejoin": "round" }, legsG);
    var legR = limb(legsG, legCol, M.lw, OL);
    var footR = svg("path", { fill: of.feet, stroke: C.ink, "stroke-width": 5, "stroke-linejoin": "round" }, legsG);
    var shortsR = null, shortsL = null;
    if (of.legs !== "skin" && of.legs) { /* trousers: legs drawn in trouser colour already */ }
    drawTorso(torsoFront, M, cs, of, R);
    // head
    var neck = svg("path", { d: "M" + P2(-10, M.shY - 8) + "V" + f2(M.neckY - 6) + "M" + P2(10, M.shY - 8) + "V" + f2(M.neckY - 6), stroke: C.ink, "stroke-width": 4 }, torsoFront);
    neck.setAttribute("display", "none");
    var headG = svg("g", null, torsoFront);
    var r = M.hr;
    drawHairBack(name, headG, r, cs, era);
    if (era === "medieval") svg("path", { d: "M" + P2(-r * 1.1, r * 0.2) + "C" + P2(-r * 1.4, -r * 1.3) + " " + P2(r * 1.3, -r * 1.4) + " " + P2(r * 1.12, r * 0.25) + "L" + P2(r * 0.9, r * 1.1) + "L" + P2(-r * 0.9, r * 1.1) + "Z", fill: "#5A4128", stroke: C.ink, "stroke-width": 5, "stroke-linejoin": "round" }, headG);
    if (era === "egyptian") svg("path", { d: "M" + P2(-r * 1.1, 0) + "L" + P2(-r * 1.2, r * 1.0) + "L" + P2(r * 1.2, r * 1.0) + "L" + P2(r * 1.1, 0) + "Z", fill: "#2F6FB0", stroke: C.ink, "stroke-width": 5, "stroke-linejoin": "round" }, headG);
    var faceSkin = svg("path", { d: ellD(0, 0, r, r * 0.97), fill: skin, stroke: C.ink, "stroke-width": 6.5 }, headG);
    if (name === "elder") svg("path", { d: "M" + P2(-r * 0.5, -r * 0.62) + "q" + f2(r * 0.2) + " -10 " + f2(r * 0.4) + " 0", fill: "none", stroke: rgba(C.ink, 0.35), "stroke-width": 3 }, headG);
    var faceG = svg("g", null, headG);
    var FS = 9; // face shifted toward the facing side
    var cheek = svg("g", null, faceG);
    var blush = [svg("ellipse", { cx: f2(FS - r * 0.55), cy: f2(r * 0.32), rx: 11, ry: 7, fill: "#F0806A", opacity: 0.55 }, cheek), svg("ellipse", { cx: f2(FS + r * 0.55), cy: f2(r * 0.32), rx: 11, ry: 7, fill: "#F0806A", opacity: 0.55 }, cheek)];
    var chill = [svg("ellipse", { cx: f2(FS - r * 0.55), cy: f2(r * 0.32), rx: 12, ry: 7, fill: "#7FB6E8", opacity: 0.6 }, cheek), svg("ellipse", { cx: f2(FS + r * 0.55), cy: f2(r * 0.32), rx: 12, ry: 7, fill: "#7FB6E8", opacity: 0.6 }, cheek)];
    var flush = svg("ellipse", { cx: f2(FS), cy: f2(r * 0.2), rx: f2(r * 0.75), ry: f2(r * 0.4), fill: "#F05A3A", opacity: 0.25 }, cheek);
    var bags = svg("path", { d: "M" + P2(FS - M.eyeDX - 14, M.eyeR + 4) + "q14 8 28 0M" + P2(FS + M.eyeDX - 14, M.eyeR + 4) + "q14 8 28 0", fill: "none", stroke: rgba("#6A4A7A", 0.55), "stroke-width": 3 }, cheek);
    drawBeard(name, faceG, r, cs);
    var eyes = [-1, 1].map(function (s2) {
      var ex = FS + s2 * M.eyeDX, ey = -6, er = M.eyeR;
      var eg = svg("g", null, faceG);
      var white = svg("circle", { cx: f2(ex), cy: ey, r: er, fill: "#FFFFFF", stroke: C.ink, "stroke-width": 5 }, eg);
      var pupil = svg("circle", { cx: f2(ex), cy: ey, r: 7.5, fill: C.ink }, eg);
      var glint = svg("circle", { cx: f2(ex + 2.5), cy: ey - 3, r: 2.2, fill: "#FFFFFF" }, eg);
      var lid = svg("path", { fill: skin, stroke: C.ink, "stroke-width": 4.5, "stroke-linejoin": "round" }, eg);
      var arc = svg("path", { fill: "none", stroke: C.ink, "stroke-width": 5.5, "stroke-linecap": "round", display: "none" }, faceG);
      return { x: ex, y: ey, r: er, s: s2, g: eg, white: white, pupil: pupil, glint: glint, lid: lid, arc: arc };
    });
    var brows = [-1, 1].map(function (s2) { return svg("path", { fill: "none", stroke: name === "elder" ? "#E8E2D6" : C.ink, "stroke-width": name === "ug" ? 9 : 6, "stroke-linecap": "round" }, faceG); });
    var unibrow = name === "ug" ? svg("path", { fill: "none", stroke: C.ink, "stroke-width": 9, "stroke-linecap": "round" }, faceG) : null;
    var mouth = svg("path", { fill: "#7A2418", stroke: C.ink, "stroke-width": 5, "stroke-linejoin": "round", "stroke-linecap": "round" }, faceG);
    var tongue = svg("path", { fill: "#F07A86", stroke: C.ink, "stroke-width": 3 }, faceG);
    var teeth = svg("path", { fill: "#FFFFFF", stroke: C.ink, "stroke-width": 2.5 }, faceG);
    var vein = svg("path", { d: "M" + P2(r * 0.42, -r * 0.62) + "l10 10m-10 0l10 -10M" + P2(r * 0.42 + 5, -r * 0.62 - 6) + "v22M" + P2(r * 0.42 - 6, -r * 0.62 + 5) + "h22", fill: "none", stroke: C.red, "stroke-width": 4, "stroke-linecap": "round", display: "none" }, headG);
    var sweatD = svg("path", { d: "M" + P2(-r * 0.78, -r * 0.35) + "q-9 16 0 22q9 -6 0 -22Z", fill: "#7FC8F0", stroke: C.ink, "stroke-width": 3.5, display: "none" }, headG);
    var drool = svg("path", { d: "M0 0q-5 14 0 20q5 -6 0 -20Z", fill: "#BFE6F7", stroke: C.ink, "stroke-width": 3, display: "none" }, faceG);
    var hairFront = svg("g", null, headG);
    drawHairFront(name, hairFront, r, cs, R, era);
    drawHat(era, headG, r, name);
    // front arm last (over torso), then the held prop
    var armR = limb(torsoFront, armCol, M.aw, OL);
    var sleeveR = of.sleeve === "short" ? limb(torsoFront, of.body === "shirt" ? cs.shirt : of.body, M.aw + 4, OL) : null;
    var sleeveL = of.sleeve === "short" ? limb(torsoBack, dark(of.body === "shirt" ? cs.shirt : of.body, 0.12), M.aw + 4, OL) : null;
    if (sleeveL) torsoBack.insertBefore(sleeveL.o, handL), torsoBack.insertBefore(sleeveL.f, handL);
    var handR = svg("circle", { r: f2(M.aw * 0.72), fill: skin, stroke: C.ink, "stroke-width": 5 }, torsoFront);
    var finger = svg("path", { fill: "none", stroke: C.ink, "stroke-width": 11, "stroke-linecap": "round", display: "none" }, torsoFront);
    var fingerF = svg("path", { fill: "none", stroke: skin, "stroke-width": 5, "stroke-linecap": "round", display: "none" }, torsoFront);
    var propG = svg("g", null, torsoFront);
    torsoFront.insertBefore(propG, armR.o);

    self._poses = [{ at: -10, name: poseName(o.pose || "idle"), dur: 0.01 }];
    self._exprs = [{ at: -10, name: exprName(o.expression || "neutral") }];
    self._talk = [];
    self._looks = [];
    self._props = [];
    self.gestures = o.gestures !== false;
    self.anchor = { head: { x: 0, y: 0 }, top: { x: 0, y: 0 }, mouth: { x: 0, y: 0 }, handR: { x: 0, y: 0 }, feet: { x: 0, y: 0 }, side: { x: 0, y: 0 } };
    var blinkPh = (hash(name) % 1000) / 1000 * 3.1;

    self.pose = function (n, at, dur) { self._poses.push({ at: num(at, 0), name: poseName(n), dur: Math.max(0.05, num(dur, 0.4)) }); self._poses.sort(function (a, b) { return a.at - b.at; }); return self; };
    self.expression = function (n, at, dur) { self._exprs.push({ at: num(at, 0), name: exprName(n) }); self._exprs.sort(function (a, b) { return a.at - b.at; }); return self; };
    self.say = function (from, to) { self._talk.push([num(from, 0), num(to, num(from, 0) + 1.5)]); return self; };
    self.lookAt = function (target, at) { self._looks.push({ at: num(at, 0), tg: target }); self._looks.sort(function (a, b) { return a.at - b.at; }); return self; };
    self.hold = function (prop, at, until, oo) {
      oo = obj(oo);
      var pn = propName(prop);
      if (!pn) return self;
      var g = svg("g", { display: "none" }, propG);
      drawProp(pn, g, num(oo.size, 1), R);
      self._props.push({ name: pn, g: g, at: num(at, 0), until: until == null ? 1e9 : num(until, 1e9), rot: num(oo.rot, 0) });
      return self;
    };
    self.mark = function (kind, at, dur) { mark(self, kind, at, dur); return self; };
    self.sweatOn = function (at, until) { sweatDrip(self, at, until); return self; };
    self.beats = function (list) {
      var prev = 0;
      arr(list).forEach(function (b) {
        b = obj(b);
        var t = b.at != null ? num(b.at, prev) : kwFind(b.word, prev);
        if (t == null) return;
        prev = t;
        if (b.pose) self.pose(b.pose, t - 0.1);
        if (b.expression) self.expression(b.expression, t);
        if (b.mark) self.mark(b.mark, t + 0.05);
        if (b.look) self.lookAt(b.look, t);
        if (b.face) self.face(b.face, t);
      });
      return self;
    };
    self.headPos = function (t) { return self.anchor.head; };

    function poseAt(t) {
      var ps = self._poses, i = 0;
      for (var k = 0; k < ps.length; k++) if (ps[k].at <= t) i = k;
      var cur2 = ps[i], prev = i > 0 ? ps[i - 1] : cur2;
      var p = smooth(prog(t, cur2.at, cur2.at + cur2.dur));
      return { a: POSES[prev.name], b: POSES[cur2.name], p: p, name: cur2.name, prevName: prev.name, since: t - cur2.at };
    }
    function loopOff(pz, t, L) {
      var o2 = { R: [0, 0], L: [0, 0], lean: 0, tilt: 0, hop: 0, jit: 0, drop: 0, headX: 0, look: null, FR: null, FL: null };
      var lp = pz.loop;
      if (!lp) return o2;
      var ph = t + blinkPh;
      if (lp === "talk" && self.gestures) { var ta = talkAmt(self._talk, t); o2.R = [Math.sin(ph * 3.1) * 0.08, Math.sin(ph * 4.7) * 0.08 - ta * 0.06]; o2.tilt = Math.sin(ph * 1.7) * 2.5; }
      else if (lp === "wave") o2.R = [Math.sin(ph * 9) * 0.25, Math.abs(Math.sin(ph * 9)) * 0.06];
      else if (lp === "hop") { o2.hop = -Math.abs(Math.sin(ph * 5.2)) * 24; o2.R = [0, Math.sin(ph * 10.4) * 0.08]; o2.L = [0, -Math.sin(ph * 10.4) * 0.08]; }
      else if (lp === "eat") { var q = (Math.sin(ph * 4.2) + 1) / 2; o2.R = [-q * 0.5, -q * 0.8]; o2.tilt = q * -4; }
      else if (lp === "hammer") { var hm = Math.pow((Math.sin(ph * 6.2) + 1) / 2, 2); o2.R = [hm * 0.25, hm * 1.0]; o2.L = [hm * 0.25, hm * 0.95]; o2.lean = hm * 8; }
      else if (lp === "dig") { var dg = (Math.sin(ph * 4.4) + 1) / 2; o2.R = [dg * 0.22, dg * 0.2]; o2.L = [dg * 0.22, dg * 0.2]; o2.lean = dg * 10; }
      else if (lp === "fan") { o2.R = [Math.sin(ph * 14) * 0.18, Math.cos(ph * 14) * 0.05]; o2.tilt = -4; }
      else if (lp === "shiver") { o2.jit = Math.sin(ph * 61) * 2.2 + Math.sin(ph * 43) * 1.2; o2.tilt = Math.sin(ph * 47) * 1.5; }
      else if (lp === "panic") { o2.R = [Math.sin(ph * 13) * 0.25, Math.cos(ph * 11) * 0.12]; o2.L = [Math.cos(ph * 12) * 0.25, Math.sin(ph * 10) * 0.12]; o2.hop = -Math.abs(Math.sin(ph * 7)) * 10; o2.FR = [13 + Math.sin(ph * 14) * 8, Math.max(0, Math.sin(ph * 14)) * 14]; o2.FL = [-11 - Math.sin(ph * 14) * 8, Math.max(0, -Math.sin(ph * 14)) * 14]; }
      else if (lp === "nod") o2.tilt = Math.sin(ph * 7) * 7;
      else if (lp === "shake") o2.headX = Math.sin(ph * 12) * 7;
      else if (lp === "look") { var lk = Math.sin(ph * 1.6); o2.headX = lk * 5; o2.look = [lk, -0.1]; }
      else if (lp === "stir") { o2.R = [Math.cos(ph * 5) * 0.14, Math.sin(ph * 5) * 0.06]; }
      else if (lp === "type") { o2.R = [0, Math.abs(Math.sin(ph * 17)) * -0.05]; o2.L = [0, Math.abs(Math.sin(ph * 19 + 1)) * -0.05]; }
      else if (lp === "write") o2.R = [Math.sin(ph * 9) * 0.06, Math.sin(ph * 15) * 0.02];
      else if (lp === "dance") { var dn = Math.sin(ph * 6); o2.R = [0, dn * 0.5]; o2.L = [0, -dn * 0.5]; o2.lean = dn * 6; o2.hop = -Math.abs(Math.sin(ph * 6)) * 12; o2.tilt = dn * 6; }
      else if (lp === "pump") { o2.R = [0, (Math.sin(ph * 8) + 1) * 0.18]; o2.hop = -Math.max(0, Math.sin(ph * 8)) * 8; }
      else if (lp === "bounce") o2.hop = -Math.abs(Math.sin(ph * 6)) * 6;
      else if (lp === "breathe") o2.tilt = Math.sin(ph * 1.4) * 2;
      return o2;
    }
    function blendPose(t) {
      var pz = poseAt(t), A = pz.a, B = pz.b, p = pz.p;
      function mixv(a, b) { return [lerp(a[0], b[0], p), lerp(a[1], b[1], p), p < 0.5 ? a[2] : b[2]]; }
      var la = loopOff(A, t), lb = loopOff(B, t);
      function add(v, a, b) { return [v[0] + lerp(a[0], b[0], p), v[1] + lerp(a[1], b[1], p), v[2]]; }
      var out = {
        R: add(mixv(A.R, B.R), la.R, lb.R), L: add(mixv(A.L, B.L), la.L, lb.L),
        FR: mixv(lb.FR || B.FR, lb.FR || B.FR), FL: mixv(lb.FL || B.FL, lb.FL || B.FL),
        lean: lerp(A.lean + la.lean, B.lean + lb.lean, p) + M.lean, tilt: lerp(A.tilt + la.tilt, B.tilt + lb.tilt, p),
        drop: lerp(A.drop + la.drop, B.drop + lb.drop, p), hop: lerp(la.hop, lb.hop, p), jit: lerp(la.jit, lb.jit, p), headX: lerp(la.headX, lb.headX, p),
        hand: p < 0.5 ? A.hand : B.hand, seat: (p < 0.5 ? A.seat : B.seat), eyes: p < 0.5 ? A.eyes : B.eyes, look: lb.look || B.look || null, name: pz.name, front: p < 0.5 ? A.front : B.front,
      };
      out.FR = [lerp((la.FR || A.FR)[0], (lb.FR || B.FR)[0], p), lerp((la.FR || A.FR)[1], (lb.FR || B.FR)[1], p)];
      out.FL = [lerp((la.FL || A.FL)[0], (lb.FL || B.FL)[0], p), lerp((la.FL || A.FL)[1], (lb.FL || B.FL)[1], p)];
      return out;
    }
    function exprAt(t) { var e = self._exprs[0].name; self._exprs.forEach(function (k) { if (t >= k.at) e = k.name; }); return EXPRS[e]; }
    function lookAt(t, fac) {
      var lk = null;
      self._looks.forEach(function (k) { if (t >= k.at) lk = k.tg; });
      if (lk == null) return null;
      if (lk === "camera" || lk === "viewer") return [0, 0];
      if (lk === "up") return [0.15 * fac, -0.9];
      if (lk === "down") return [0.2 * fac, 0.8];
      if (lk === "left") return [-1, 0];
      if (lk === "right") return [1, 0];
      var tx = null, ty = null;
      if (typeof lk === "number") { tx = lk; ty = self.y0 - self.height * 0.8; }
      else if (lk && lk.xAt) { tx = lk.xAt(t); ty = lk.y0 - (lk.height || 200) * 0.8; }
      else if (lk && lk.anchor && lk.anchor.head) { tx = lk.anchor.head.x; ty = lk.anchor.head.y; }
      else if (lk && lk.x != null) { tx = num(lk.x, 0); ty = num(lk.y, self.y0 - self.height); }
      if (tx == null) return null;
      var hx = self.xAt(t), hy = self.y0 - self.height * 0.8, dx = tx - hx, dy = ty - hy, d = Math.sqrt(dx * dx + dy * dy) || 1;
      return [dx / d, (dy / d) * 0.7];
    }
    function lidPath(e, lid, ang) {
      var rr = e.r + 1, cx = e.x, cy = e.y, ta = Math.tan(((ang || 0) * PI) / 180) * -e.s;
      if (lid <= 0.01) return "";
      var lineY = function (x) { return cy - rr + 2 * rr * lid + ta * (x - cx); };
      var pts = [];
      for (var i = 0; i <= 32; i++) { var a = PI + (i / 32) * PI; var px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr; if (py <= lineY(px)) pts.push([px, py]); }
      if (lid >= 0.98) return circD(cx, cy, rr);
      // add the lower half points that are above the line too
      for (i = 1; i < 32; i++) { var a2 = (i / 32) * PI; var qx = cx + Math.cos(a2) * rr, qy = cy + Math.sin(a2) * rr; if (qy <= lineY(qx)) pts.push([qx, qy]); }
      if (pts.length < 2) return "";
      pts.sort(function (p1, p2) { return Math.atan2(p1[1] - cy, p1[0] - cx) - Math.atan2(p2[1] - cy, p2[0] - cx); });
      var xl = cx - rr, xr = cx + rr;
      var d = "M" + P2(xl, Math.min(lineY(xl), cy)) ;
      d = "M" + P2(pts[0][0], pts[0][1]);
      for (i = 1; i < pts.length; i++) d += "L" + P2(pts[i][0], pts[i][1]);
      return d + "Z";
    }
    function update(t) {
      var vis = self.visibleAt(t);
      root.setAttribute("display", vis ? "inline" : "none");
      var x = self.xAt(t), fac = self.facingAt(t), sp = Math.abs(self.xAt(t + 0.05) - self.xAt(t - 0.05)) / 0.1;
      var s0w = self.scale || 1;
      var gait = self.gaitAt(t), walking = sp > 4 ? clamp(sp / 40, 0, 1) : 0;
      var pz = blendPose(t), ex = exprAt(t);
      if (walking > 0) {
        var ph = (self.distAt(t) / ((gait === "run" ? 70 : 48) * s0w)) * PI, stride = gait === "run" ? 34 : 24, lift = gait === "run" ? 26 : 16;
        var wFR = [Math.sin(ph) * stride, Math.max(0, Math.cos(ph)) * lift], wFL = [-Math.sin(ph) * stride, Math.max(0, -Math.cos(ph)) * lift];
        pz.FR = [lerp(pz.FR[0], wFR[0], walking), lerp(pz.FR[1], wFR[1], walking)];
        pz.FL = [lerp(pz.FL[0], wFL[0], walking), lerp(pz.FL[1], wFL[1], walking)];
        pz.drop = lerp(pz.drop, 0, walking);
        pz.hop += -Math.abs(Math.cos(ph)) * (gait === "run" ? 10 : 5) * walking;
        if (["idle", "talk", "walk", "run", "explain", "look-around", "nod"].indexOf(pz.name) >= 0) {
          var sw = Math.sin(ph) * (gait === "run" ? 0.5 : 0.32);
          pz.R = [lerp(pz.R[0], 0.12 - sw, walking), lerp(pz.R[1], 0.92 - Math.abs(sw) * 0.2, walking)];
          pz.L = [lerp(pz.L[0], 0.06 + sw, walking), lerp(pz.L[1], 0.92 - Math.abs(sw) * 0.2, walking)];
          pz.lean += (gait === "run" ? 10 : 3) * walking;
        }
      }
      var s = self.scale, y = self.y0 + pz.hop * s;
      root.setAttribute("transform", "translate(" + f2(x + pz.jit * s) + " " + f2(y) + ") scale(" + f2(fac * s) + " " + f2(s) + ")");
      shadow.setAttribute("transform", "translate(0 " + f2(-pz.hop) + ") scale(" + f2(1 + pz.hop / 200) + " 1)");
      seat.setAttribute("display", pz.seat && walking < 0.2 ? "inline" : "none");
      var hipY = M.hipY + pz.drop;
      // legs (root space)
      var hR = [M.hipW * 0.6, hipY], hL = [-M.hipW * 0.6, hipY];
      var fR = [pz.FR[0], -pz.FR[1]], fL = [pz.FL[0], -pz.FL[1]];
      var kr = ik(hR, fR, M.th, M.sn, -1), kl = ik(hL, fL, M.th, M.sn, -1);
      var dR = seg3L(hR, kr[0], kr[1]), dL = seg3L(hL, kl[0], kl[1]);
      legR.o.setAttribute("d", dR); legR.f.setAttribute("d", dR); legL.o.setAttribute("d", dL); legL.f.setAttribute("d", dL);
      footR.setAttribute("d", ellD(kr[1][0] + 10, kr[1][1] - 6, 22, 11));
      footL.setAttribute("d", ellD(kl[1][0] + 10, kl[1][1] - 6, 21, 10));
      // torso (rotates around the hip)
      var tf = "translate(0 " + f2(pz.drop) + ") rotate(" + f2(pz.lean) + " 0 " + f2(M.hipY) + ")";
      torsoBack.setAttribute("transform", tf); torsoFront.setAttribute("transform", tf);
      var reach = M.up + M.fo;
      var sR = [M.shW, M.shY], sL = [-M.shW * 0.55, M.shY + 2];
      var tR = [sR[0] + pz.R[0] * reach, sR[1] + pz.R[1] * reach], tL = [sL[0] + pz.L[0] * reach, sL[1] + pz.L[1] * reach];
      var aR = ik(sR, tR, M.up, M.fo, pz.R[2] || 1), aL = ik(sL, tL, M.up, M.fo, pz.L[2] || 1);
      var dAR = seg3L(sR, aR[0], aR[1]), dAL = seg3L(sL, aL[0], aL[1]);
      armR.o.setAttribute("d", dAR); armR.f.setAttribute("d", dAR); armL.o.setAttribute("d", dAL); armL.f.setAttribute("d", dAL);
      if (sleeveR) { var mR = [lerp(sR[0], aR[0][0], 0.5), lerp(sR[1], aR[0][1], 0.5)], dsR = "M" + P2(sR[0], sR[1]) + "L" + P2(mR[0], mR[1]); sleeveR.o.setAttribute("d", dsR); sleeveR.f.setAttribute("d", dsR); }
      if (sleeveL) { var mL = [lerp(sL[0], aL[0][0], 0.5), lerp(sL[1], aL[0][1], 0.5)], dsL = "M" + P2(sL[0], sL[1]) + "L" + P2(mL[0], mL[1]); sleeveL.o.setAttribute("d", dsL); sleeveL.f.setAttribute("d", dsL); }
      handR.setAttribute("cx", f2(aR[1][0])); handR.setAttribute("cy", f2(aR[1][1]));
      handL.setAttribute("cx", f2(aL[1][0])); handL.setAttribute("cy", f2(aL[1][1]));
      var foreA = Math.atan2(aR[1][1] - aR[0][1], aR[1][0] - aR[0][0]);
      if (pz.hand === "point") {
        var fd = "M" + P2(aR[1][0], aR[1][1]) + "L" + P2(aR[1][0] + Math.cos(foreA) * 22, aR[1][1] + Math.sin(foreA) * 22);
        finger.setAttribute("d", fd); fingerF.setAttribute("d", fd); finger.setAttribute("display", "inline"); fingerF.setAttribute("display", "inline");
      } else { finger.setAttribute("display", "none"); fingerF.setAttribute("display", "none"); }
      // held prop
      var held = null;
      self._props.forEach(function (pr) { var on = t >= pr.at && t < pr.until; pr.g.setAttribute("display", on ? "inline" : "none"); if (on) held = pr; });
      if (held) {
        var rot = held.rot + PROP_ROT(held.name, pz.name, foreA);
        propG.setAttribute("transform", "translate(" + P2(aR[1][0], aR[1][1]) + ") rotate(" + f2(rot) + ")");
        held.g.setAttribute("display", "inline");
      }
      // head
      var neckP = [0, M.neckY], tilt = pz.tilt + (ex.chin || 0);
      headG.setAttribute("transform", "translate(" + P2(pz.headX, M.headY) + ") rotate(" + f2(tilt) + " 0 " + f2(r * 0.9) + ")");
      // face
      var lk = lookAt(t, fac) || pz.look || ex.look || null;
      var lx = 0, ly = 0;
      if (lk) { lx = clamp(lk[0] * fac, -1, 1); ly = clamp(lk[1], -1, 1); }
      var bl = mod(t + blinkPh, 3.4), blink = bl < 0.12 ? Math.sin((bl / 0.12) * PI) : 0;
      var eyesMode = pz.eyes || ex.eyes || "open";
      var lid = Math.max(ex.lid || 0, blink);
      var wide = ex.wide ? 1.12 : 1, pupR = 7.5 * (ex.pupil || 1) * (ex.wide ? 0.9 : 1);
      eyes.forEach(function (e) {
        var open = eyesMode === "open";
        e.g.setAttribute("display", open ? "inline" : "none");
        e.arc.setAttribute("display", open ? "none" : "inline");
        if (!open) {
          var aw2 = e.r * 0.85;
          e.arc.setAttribute("d", eyesMode === "happy" ? "M" + P2(e.x - aw2, e.y + 4) + "Q" + P2(e.x, e.y - 18) + " " + P2(e.x + aw2, e.y + 4) : "M" + P2(e.x - aw2, e.y - 2) + "Q" + P2(e.x, e.y + 12) + " " + P2(e.x + aw2, e.y - 2));
          return;
        }
        e.white.setAttribute("r", f2(e.r * wide));
        var px = e.x + lx * e.r * 0.42, py = e.y + ly * e.r * 0.42;
        e.pupil.setAttribute("cx", f2(px)); e.pupil.setAttribute("cy", f2(py)); e.pupil.setAttribute("r", f2(pupR));
        e.glint.setAttribute("cx", f2(px + 2.6)); e.glint.setAttribute("cy", f2(py - 3));
        e.lid.setAttribute("d", lidPath(e, lid, ex.lidA || 0));
      });
      var br = ex.brow || [0, 0], brR = ex.browR || br, by = -6 - M.eyeR - 10;
      brows.forEach(function (b, i) {
        var q = i === 0 ? br : brR, s2 = i === 0 ? -1 : 1, cx = FS + s2 * M.eyeDX;
        var lift = q[0] + (ex.wide ? 6 : 0), ang = (q[1] * PI) / 180 * -s2;
        var hw = 13, x1 = cx - hw, x2 = cx + hw, y1 = by - lift + Math.tan(ang) * -hw, y2 = by - lift + Math.tan(ang) * hw;
        if (s2 < 0) { y1 = by - lift - Math.tan(ang) * hw; y2 = by - lift + Math.tan(ang) * hw; }
        b.setAttribute("d", "M" + P2(x1, y1) + "Q" + P2(cx, Math.min(y1, y2) - 4) + " " + P2(x2, y2));
        if (unibrow) b.setAttribute("display", "none");
      });
      if (unibrow) unibrow.setAttribute("d", "M" + P2(FS - M.eyeDX - 14, by - br[0] + br[1] * 0.4) + "Q" + P2(FS, by - br[0] - 6 + br[1] * 0.6) + " " + P2(FS + M.eyeDX + 14, by - brR[0] + brR[1] * 0.4));
      // mouth
      var m = ex.m, talk = talkAmt(self._talk, t);
      var mw = m.w * r, mx = FS + (m.dx || 0) * r + 2, my = r * 0.42, open = clamp(m.o + talk * 0.55, 0, 1.1), cv = m.c * r;
      if (m.chatter) open = 0.2 + Math.abs(Math.sin(t * 30)) * 0.2;
      var oh = open * r * 0.42;
      var md;
      if (m.round) { md = ellD(mx, my + oh * 0.3, mw * 0.5 + talk * 3, oh * 0.62 + 4); }
      else if (oh < 2.5) {
        if (m.wavy) md = "M" + P2(mx - mw / 2, my) + "q" + f2(mw / 6) + " -8 " + f2(mw / 3) + " 0t" + f2(mw / 3) + " 0t" + f2(mw / 3) + " 0";
        else if (m.side) md = "M" + P2(mx - mw / 2, my + 2) + "Q" + P2(mx + mw * 0.1, my + 4) + " " + P2(mx + mw / 2, my - cv);
        else md = "M" + P2(mx - mw / 2, my - cv * 0.3) + "Q" + P2(mx, my + cv * 1.2) + " " + P2(mx + mw / 2, my - cv * 0.3);
      } else {
        md = "M" + P2(mx - mw / 2, my - cv * 0.3) + "Q" + P2(mx, my + cv * 0.7) + " " + P2(mx + mw / 2, my - cv * 0.3) + "Q" + P2(mx + mw * 0.1, my + oh + cv * 0.6) + " " + P2(mx - mw / 2, my - cv * 0.3) + "Z";
      }
      mouth.setAttribute("d", md);
      mouth.setAttribute("fill", oh < 2.5 && !m.round ? "none" : "#7A2418");
      var showTongue = (m.tongue || talk > 0.4) && oh > 8 && !m.round;
      tongue.setAttribute("display", showTongue ? "inline" : "none");
      if (showTongue) tongue.setAttribute("d", ellD(mx + mw * 0.08, my + oh * 0.72, mw * 0.22, oh * 0.28));
      var showTeeth = m.teeth && oh > 4;
      teeth.setAttribute("display", showTeeth ? "inline" : "none");
      if (showTeeth) teeth.setAttribute("d", "M" + P2(mx - mw * 0.38, my - cv * 0.1) + "L" + P2(mx + mw * 0.38, my - cv * 0.1) + "L" + P2(mx + mw * 0.32, my + Math.min(9, oh * 0.4)) + "L" + P2(mx - mw * 0.32, my + Math.min(9, oh * 0.4)) + "Z");
      blush.forEach(function (b2) { b2.setAttribute("display", ex.blush ? "inline" : "none"); });
      chill.forEach(function (b2) { b2.setAttribute("display", ex.chill ? "inline" : "none"); });
      flush.setAttribute("display", ex.flush ? "inline" : "none");
      bags.setAttribute("display", ex.bags ? "inline" : "none");
      vein.setAttribute("display", ex.vein ? "inline" : "none");
      sweatD.setAttribute("display", ex.sweat ? "inline" : "none");
      drool.setAttribute("display", ex.drool ? "inline" : "none");
      if (ex.drool) drool.setAttribute("transform", "translate(" + P2(mx + mw * 0.32, my + oh * 0.4) + ") scale(1 " + f2(0.8 + 0.3 * Math.sin(t * 3)) + ")");
      // anchors (world)
      var cosL = Math.cos((pz.lean * PI) / 180), sinL = Math.sin((pz.lean * PI) / 180);
      function T2W(px, py) { // torso-space -> world
        py += pz.drop;
        var ry = py - (M.hipY + pz.drop), rx = px;
        var qx = rx * cosL - ry * sinL, qy = rx * sinL + ry * cosL + (M.hipY + pz.drop);
        return { x: x + pz.jit * s + fac * s * qx, y: y + s * qy };
      }
      var hc = T2W(pz.headX, M.headY);
      var A2 = self.anchor;
      A2.head = hc; A2.top = { x: hc.x, y: hc.y - r * s * 1.05 }; A2.mouth = T2W(pz.headX + FS, M.headY + r * 0.42);
      A2.handR = T2W(aR[1][0], aR[1][1]); A2.feet = { x: x, y: self.y0 }; A2.side = { x: x + fac * s * 70, y: self.y0 - self.height * 0.45 };
      A2.body = T2W(0, (M.hipY + M.shY) / 2);
      A2.facing = fac; A2.r = r * s; A2.visible = vis; A2.walking = walking > 0;
    }
    onWorld(update);
    sc.actors.push(self);
    // inspect: the face must stay inside the safe area
    item("face", name, null, null, function (t) {
      if (!self.anchor.visible) return null;
      var c = sc.toScreen(self.anchor.head.x, self.anchor.head.y), rr = self.anchor.r * c.z;
      return { x: c.x - rr, y: c.y - rr, w: rr * 2, h: rr * 2 };
    }, function (t) { return self.anchor.walking || camMoving(sc, t) || self.allowEdge; });
    self.screenBox = function () {
      var a = self.anchor, top = sc.toScreen(a.top.x, a.top.y), ft = sc.toScreen(a.feet.x, a.feet.y), w = (M.torsoW + 70) * self.scale * top.z;
      return { x: Math.min(top.x, ft.x) - w / 2, y: top.y, w: w, h: ft.y - top.y };
    };
    if (o.pose) self.pose(o.pose, -5, 0.01);
    return self;
  }
  // Prop rotation in the hand, by prop and pose (deg); the hand is the prop origin.
  function PROP_ROT(name, pose, foreA) {
    var up = { spear: 1, torch: 1, flag: 1, sword: 1, stick: 1, lantern: 0, umbrella: 1, axe: 1, hammer: 1 };
    var fa = (foreA * 180) / PI;
    if (pose === "hunt") return 62;
    if (pose === "fish") return 52;
    if (pose === "work" || pose === "dig" || pose === "stir") return fa + 90;
    if (up[name]) return 0;
    return 0;
  }
  var PROP_NAMES = ["spear", "torch", "basket", "pot", "fan", "bread", "scroll", "phone", "tablet", "sword", "shield", "hammer", "bone", "fish", "bowl", "jug", "umbrella", "book", "coins", "map", "stick", "rock", "meat", "cup", "lantern", "laptop", "flag", "axe", "seed"];
  var PROP_ALIAS = { club: "stick", rod: "stick", shovel: "stick", food: "meat", drumstick: "meat", water: "jug", vase: "jug", amphora: "jug", money: "coins", gold: "coins", letter: "scroll", paper: "scroll", computer: "laptop", mobile: "phone", lamp: "lantern", tool: "hammer", stone: "rock", plate: "bowl", pan: "pot" };
  function propName(n) { n = str(n).toLowerCase(); if (PROP_NAMES.indexOf(n) >= 0) return n; return PROP_ALIAS[n] || null; }
  // Props in hand space: grip at (0, 0), drawn "up" along -y, ~60-160 units.
  function drawProp(n, g, size, R) {
    var I = 5, s = size || 1;
    var gg = svg("g", { transform: "scale(" + f2(s) + ")" }, g);
    function P_(d, fill, w) { return svg("path", { d: d, fill: fill || "none", stroke: C.ink, "stroke-width": w || I, "stroke-linejoin": "round", "stroke-linecap": "round" }, gg); }
    switch (n) {
      case "spear": P_("M0 70V-110", null, 12); P_("M0 70V-110", null, 0).setAttribute("stroke", "#8A5A2A"); svg("path", { d: "M0 70V-110", stroke: "#9A6A3A", "stroke-width": 6, "stroke-linecap": "round" }, gg); P_("M-11 -104L0 -150L11 -104Q0 -96 -11 -104Z", "#B8B4AC"); P_("M-8 -100l16 6M-8 -92l16 6", null, 3); break;
      case "torch": svg("path", { d: "M0 40V-60", stroke: C.ink, "stroke-width": 14, "stroke-linecap": "round" }, gg); svg("path", { d: "M0 40V-60", stroke: "#8A5A2A", "stroke-width": 8, "stroke-linecap": "round" }, gg); P_("M-14 -60Q-22 -96 0 -128Q22 -96 14 -60Z", "#FF8A1E"); P_("M-7 -62Q-10 -86 0 -104Q10 -86 7 -62Z", "#FFD84A", 3); break;
      case "basket": P_(rrD(-34, -38, 68, 44, 10), "#C8913F"); P_("M-30 -26H30M-30 -12H30M-14 -38V6M14 -38V6", null, 3); P_("M-30 -38Q0 -84 30 -38", null, 6); break;
      case "pot": case "jug": P_("M-22 -60Q-40 -30 -28 0Q0 14 28 0Q40 -30 22 -60Z", n === "jug" ? "#C9744A" : "#9A5A3A"); P_("M-14 -60H14V-70H-14Z", n === "jug" ? "#A85A36" : "#7A4A2A"); if (n === "jug") P_("M24 -50Q44 -44 30 -20", null, 6); P_("M-30 -30Q0 -20 30 -30", null, 3); break;
      case "fan": svg("path", { d: "M0 30V-20", stroke: "#8A5A2A", "stroke-width": 8 }, gg); P_("M0 -20L-50 -70Q0 -110 50 -70Z", "#E8C25A"); P_("M0 -20L-26 -90M0 -20L0 -96M0 -20L26 -90", null, 3); break;
      case "bread": P_(ellD(0, -18, 40, 20), "#D99A4A"); P_("M-20 -28l8 12M-2 -32l8 12M16 -28l8 12", null, 3); break;
      case "scroll": case "map": P_(rrD(-40, -40, 80, 56, 6), n === "map" ? "#F2E2B0" : "#F4E8C8"); P_("M-44 -44V22M44 -44V22", null, 10); if (n === "map") P_("M-28 -20q14 -14 22 4t24 -6M10 -2l8 8m0 -8l-8 8", "none", 3).setAttribute("stroke", C.red); else P_("M-26 -24H26M-26 -10H18M-26 4H22", null, 3); break;
      case "phone": P_(rrD(-16, -56, 32, 56, 6), "#2B2B36"); svg("rect", { x: -11, y: -50, width: 22, height: 42, rx: 2, fill: "#7FD0F0" }, gg); break;
      case "tablet": P_(rrD(-30, -70, 60, 80, 8), "#2B2B36"); svg("rect", { x: -24, y: -63, width: 48, height: 64, rx: 3, fill: "#9FE0F5" }, gg); break;
      case "sword": P_("M0 22V-6", null, 12); P_("M-22 -6H22", null, 10); P_("M-7 -6V-120L0 -134L7 -120V-6Z", "#D8DCE2"); break;
      case "shield": P_(wobEll(0, -10, 46, 56, R, 0.03, 12), "#B5483A"); P_(wobEll(0, -10, 16, 16, R, 0.05, 8), "#E0B13A"); break;
      case "hammer": svg("path", { d: "M0 30V-70", stroke: C.ink, "stroke-width": 13, "stroke-linecap": "round" }, gg); svg("path", { d: "M0 30V-70", stroke: "#9A6A3A", "stroke-width": 7, "stroke-linecap": "round" }, gg); P_(rrD(-30, -96, 60, 32, 6), "#8C8C96"); break;
      case "axe": svg("path", { d: "M0 30V-80", stroke: C.ink, "stroke-width": 13, "stroke-linecap": "round" }, gg); svg("path", { d: "M0 30V-80", stroke: "#9A6A3A", "stroke-width": 7, "stroke-linecap": "round" }, gg); P_("M0 -84Q30 -96 40 -70Q30 -46 0 -56Z", "#A8ACB4"); break;
      case "bone": P_("M-30 -10L30 -10", null, 16); svg("path", { d: "M-30 -10L30 -10", stroke: "#F4EEDC", "stroke-width": 8, "stroke-linecap": "round" }, gg); [[-34, -18], [-34, -2], [34, -18], [34, -2]].forEach(function (q) { P_(circD(q[0], q[1], 9), "#F4EEDC", 4); }); break;
      case "fish": P_("M-36 -20Q0 -46 30 -20Q0 6 -36 -20Z", "#6FA8C8"); P_("M30 -20L50 -36L48 -4Z", "#5A8FB0"); svg("circle", { cx: -20, cy: -24, r: 4, fill: C.ink }, gg); break;
      case "bowl": P_("M-36 -26Q0 30 36 -26Z", "#B87A4A"); P_("M-30 -28Q0 -40 30 -28", "#E89A4A", 3); break;
      case "umbrella": P_("M0 40V-60", null, 6); P_("M-60 -60Q0 -130 60 -60Q40 -70 30 -60Q15 -70 0 -60Q-15 -70 -30 -60Q-40 -70 -60 -60Z", "#E8392B"); break;
      case "book": P_("M-36 -50L0 -40L36 -50V0L0 10L-36 0Z", "#B5483A"); P_("M0 -40V10", null, 4); P_("M-28 -38L-6 -32M-28 -26L-6 -20M6 -32L28 -38M6 -20L28 -26", null, 2.5); break;
      case "coins": for (var c = 0; c < 4; c++) P_(ellD(-8 + (c % 2) * 14, -6 - c * 9, 16, 6), "#F2C230", 4); break;
      case "stick": svg("path", { d: "M0 40Q4 -30 -4 -110", stroke: C.ink, "stroke-width": 13, "stroke-linecap": "round", fill: "none" }, gg); svg("path", { d: "M0 40Q4 -30 -4 -110", stroke: "#9A6A3A", "stroke-width": 7, "stroke-linecap": "round", fill: "none" }, gg); break;
      case "rock": P_(wobEll(0, -20, 26, 20, R, 0.12, 9), "#9A948A"); break;
      case "meat": P_("M18 -6L34 10", null, 14); svg("path", { d: "M18 -6L34 10", stroke: "#F4EEDC", "stroke-width": 7, "stroke-linecap": "round" }, gg); P_(wobEll(-4, -24, 30, 24, R, 0.06, 10), "#B5483A"); P_("M-18 -32q10 -8 22 -2", null, 3).setAttribute("stroke", "#E8907A"); break;
      case "cup": P_("M-18 -40H18L14 0H-14Z", "#E8E2D4"); P_("M18 -30Q32 -26 16 -10", null, 5); break;
      case "lantern": P_("M0 -80V-64", null, 5); P_(rrD(-20, -64, 40, 56, 6), "#FFD877"); P_("M-20 -50H20M-20 -22H20", null, 4); break;
      case "laptop": P_("M-44 -12H44L50 0H-50Z", "#8C8C96"); P_("M-38 -12L-34 -66H34L38 -12Z", "#3A3A46"); svg("path", { d: "M-30 -18L-27 -60H27L30 -18Z", fill: "#9FE0F5" }, gg); break;
      case "flag": svg("path", { d: "M0 40V-130", stroke: C.ink, "stroke-width": 9, "stroke-linecap": "round" }, gg); P_("M0 -130Q30 -140 60 -124Q40 -110 60 -94Q30 -104 0 -94Z", "#E8392B"); break;
      case "seed": P_(ellD(0, -12, 26, 18), "#C8913F"); for (var k2 = 0; k2 < 5; k2++) svg("circle", { cx: -12 + k2 * 6, cy: -26 + (k2 % 2) * 4, r: 4, fill: "#6E8F3A", stroke: C.ink, "stroke-width": 2 }, gg); break;
    }
    return gg;
  }
  function propIcon(name, px) {
    var n = propName(name) || "rock", tmp = svg("g"), R = V.makeRand(hash(n));
    drawProp(n, tmp, 1, R);
    px = num(px, 64);
    var inner = new XMLSerializer().serializeToString(tmp);
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + px + '" height="' + px + '" viewBox="-80 -160 160 220">' + inner + "</svg>";
  }

  // ------------------------- animals -------------------------
  var ANIMALS = {
    mammoth: { body: [118, 84, -170], leg: [92, 32], head: [60, 108, -205], col: "#8B5A3C", col2: "#6E4428", scale: 1 },
    sabretooth: { body: [84, 38, -98], leg: [62, 20], head: [40, 92, -128], col: "#D89A4A", col2: "#A8702E", scale: 1 },
    camel: { body: [92, 48, -168], leg: [118, 23], head: [30, 118, -262], col: "#C9A06A", col2: "#A8804A", scale: 1 },
    cat: { body: [36, 20, -42], leg: [24, 10], head: [22, 40, -62], col: "#E89A4A", col2: "#C06A2A", scale: 1 },
    dog: { body: [48, 26, -58], leg: [36, 13], head: [26, 52, -84], col: "#B87A4A", col2: "#8A5430", scale: 1 },
    wolf: { body: [64, 30, -74], leg: [48, 15], head: [30, 66, -100], col: "#8A8A96", col2: "#5E5E6E", scale: 1 },
    sheep: { body: [54, 38, -66], leg: [30, 11], head: [22, 52, -78], col: "#F4F0E6", col2: "#3A3030", scale: 1 },
  };
  var ANIMAL_IDS = Object.keys(ANIMALS);
  function animalName(n) { n = str(n).toLowerCase(); if (ANIMALS[n]) return n; if (n === "tiger" || n === "sabertooth" || n === "smilodon") return "sabretooth"; if (n === "elephant") return "mammoth"; if (n === "lamb") return "sheep"; if (n === "puppy") return "dog"; if (n === "kitten") return "cat"; return null; }
  function animal(kind, o) {
    o = obj(o);
    var sc = o.scene || cur();
    var k = animalName(kind) || "dog", A = ANIMALS[k];
    var scale = num(o.scale, 1) * sc.charScale * (sc.portrait && k === "mammoth" ? 0.85 : 1);
    var R = V.makeRand(hash(k) + 3);
    var self = { name: k, kind: "animal", scale: scale };
    mover(self, sc, num(o.x, sc.Ww * 0.8), o.facing === "left" ? -1 : 1);
    self.y0 = num(o.y, sc.G);
    var bx = A.body[0], by = A.body[1], bY = A.body[2], lL = A.leg[0], lW = A.leg[1], hr = A.head[0], hX = A.head[1], hY = A.head[2];
    self.height = (-Math.min(bY - by, hY - hr) + 10) * scale;
    var root = svg("g", { class: "dw-animal" }, o.layer === "front" ? sc.layers.front.g : o.layer === "rear" ? sc.rearG : sc.castG);
    svg("ellipse", { cx: 0, cy: 2, rx: f2(bx * 1.05), ry: 12, fill: C.shadow }, root);
    var legsB = svg("g", null, root), bodyG = svg("g", null, root), legsF = svg("g", null, root);
    var legX = [bx * 0.62, -bx * 0.58], legs = [];
    legX.forEach(function (lx, i) {
      legs.push({ x: lx - 10, g: legsB, back: true, ph: i * PI }); legs.push({ x: lx + 8, g: legsF, back: false, ph: i * PI + PI });
    });
    legs.forEach(function (lg) {
      var col = k === "sheep" ? A.col2 : lg.back ? A.col2 : A.col;
      lg.o = svg("path", { fill: "none", stroke: C.ink, "stroke-width": f2(lW + 11), "stroke-linecap": "round" }, lg.g);
      lg.f = svg("path", { fill: "none", stroke: col, "stroke-width": f2(lW), "stroke-linecap": "round" }, lg.g);
    });
    var tail = svg("path", { fill: "none", stroke: C.ink, "stroke-width": k === "cat" ? 12 : 10, "stroke-linecap": "round" }, bodyG);
    var tailF = svg("path", { fill: "none", stroke: A.col, "stroke-width": k === "cat" ? 6 : 5, "stroke-linecap": "round" }, bodyG);
    if (k === "sheep") { svg("path", { d: wobEll(0, bY, bx, by, R, 0.14, 16), fill: A.col, stroke: C.ink, "stroke-width": 6 }, bodyG); for (var w2 = 0; w2 < 8; w2++) svg("circle", { cx: f2((R() - 0.5) * bx * 1.4), cy: f2(bY + (R() - 0.5) * by), r: f2(8 + R() * 8), fill: "none", stroke: rgba(C.ink, 0.25), "stroke-width": 3 }, bodyG); }
    else svg("path", { d: wobEll(0, bY, bx, by, R, 0.04, 14), fill: A.col, stroke: C.ink, "stroke-width": 6.5 }, bodyG);
    if (k === "mammoth") { for (var f3 = 0; f3 < 14; f3++) { var fx = (R() - 0.5) * bx * 1.6, fy = bY + by * 0.3 + R() * by * 0.6; svg("path", { d: "M" + P2(fx, fy) + "q-4 18 2 26", fill: "none", stroke: A.col2, "stroke-width": 4, "stroke-linecap": "round" }, bodyG); } svg("path", { d: wobEll(bx * 0.15, bY - by * 0.8, bx * 0.45, by * 0.35, R, 0.1, 10), fill: A.col2, opacity: 0.6 }, bodyG); }
    if (k === "sabretooth" || k === "cat") for (var s2 = 0; s2 < 4; s2++) svg("path", { d: "M" + P2(-bx * 0.5 + s2 * bx * 0.3, bY - by * 0.9) + "q6 " + f2(by * 0.5) + " 0 " + f2(by * 0.8), fill: "none", stroke: A.col2, "stroke-width": 6, "stroke-linecap": "round" }, bodyG);
    if (k === "camel") svg("path", { d: wobEll(-bx * 0.05, bY - by * 0.95, bx * 0.42, by * 0.62, R, 0.05, 10), fill: A.col, stroke: C.ink, "stroke-width": 6 }, bodyG);
    var neckG = null;
    if (k === "camel") neckG = svg("path", { d: "M" + P2(bx * 0.7, bY - 6) + "C" + P2(bx * 1.15, bY - 30) + " " + P2(hX - 30, hY + 60) + " " + P2(hX - 8, hY + 10), fill: "none", stroke: C.ink, "stroke-width": 36, "stroke-linecap": "round" }, bodyG), svg("path", { d: "M" + P2(bx * 0.7, bY - 6) + "C" + P2(bx * 1.15, bY - 30) + " " + P2(hX - 30, hY + 60) + " " + P2(hX - 8, hY + 10), fill: "none", stroke: A.col, "stroke-width": 24, "stroke-linecap": "round" }, bodyG);
    var headG = svg("g", null, bodyG);
    // ears behind the head
    if (k === "mammoth") svg("path", { d: wobEll(-hr * 0.4, 6, hr * 0.75, hr * 0.95, R, 0.08, 10), fill: A.col2, stroke: C.ink, "stroke-width": 6 }, headG);
    if (k === "wolf" || k === "cat" || k === "sabretooth") [[-0.45, -0.95], [0.25, -1.0]].forEach(function (q) { svg("path", { d: "M" + P2(q[0] * hr - 10, q[1] * hr + 14) + "L" + P2(q[0] * hr + 2, q[1] * hr - (k === "wolf" ? 24 : 16)) + "L" + P2(q[0] * hr + 14, q[1] * hr + 12) + "Z", fill: A.col, stroke: C.ink, "stroke-width": 5, "stroke-linejoin": "round" }, headG); });
    if (k === "dog") svg("path", { d: "M" + P2(-hr * 0.6, -hr * 0.6) + "q-22 10 -14 46q16 -4 22 -30Z", fill: A.col2, stroke: C.ink, "stroke-width": 5, "stroke-linejoin": "round" }, headG);
    if (k === "sheep") svg("ellipse", { cx: f2(-hr * 0.8), cy: f2(-hr * 0.2), rx: 14, ry: 7, fill: A.col2, stroke: C.ink, "stroke-width": 4 }, headG);
    svg("path", { d: wobEll(0, 0, hr * (k === "camel" ? 1.15 : 1), hr * (k === "camel" ? 0.8 : 0.95), R, 0.04, 12), fill: k === "sheep" ? A.col2 : A.col, stroke: C.ink, "stroke-width": 6 }, headG);
    if (k === "sheep") svg("path", { d: wobEll(-2, -hr * 0.8, hr * 0.8, hr * 0.42, R, 0.15, 10), fill: A.col, stroke: C.ink, "stroke-width": 4 }, headG);
    if (k === "wolf" || k === "dog" || k === "sabretooth" || k === "cat" || k === "camel") svg("path", { d: wobEll(hr * 0.7, hr * 0.3, hr * 0.55, hr * 0.38, R, 0.05, 10), fill: k === "camel" ? A.col : light(A.col, 0.25), stroke: C.ink, "stroke-width": 5 }, headG), svg("ellipse", { cx: f2(hr * 1.15), cy: f2(hr * 0.12), rx: 6, ry: 5, fill: C.ink }, headG);
    if (k === "sabretooth") [0.55, 0.85].forEach(function (q) { svg("path", { d: "M" + P2(hr * q, hr * 0.55) + "l4 26l5 -26Z", fill: "#FFFFFF", stroke: C.ink, "stroke-width": 3.5, "stroke-linejoin": "round" }, headG); });
    var trunk = null;
    if (k === "mammoth") {
      svg("path", { d: "M" + P2(hr * 0.35, hr * 0.5) + "C" + P2(hr * 1.4, hr * 0.9) + " " + P2(hr * 0.9, hr * 1.9) + " " + P2(hr * 1.6, hr * 1.7), fill: "none", stroke: "#F4EEDC", "stroke-width": 13, "stroke-linecap": "round" }, headG);
      svg("path", { d: "M" + P2(hr * 0.35, hr * 0.5) + "C" + P2(hr * 1.4, hr * 0.9) + " " + P2(hr * 0.9, hr * 1.9) + " " + P2(hr * 1.6, hr * 1.7), fill: "none", stroke: C.ink, "stroke-width": 3, "stroke-linecap": "round", opacity: 0.6 }, headG);
      trunk = { o: svg("path", { fill: "none", stroke: C.ink, "stroke-width": 34, "stroke-linecap": "round" }, headG), f: svg("path", { fill: "none", stroke: A.col, "stroke-width": 22, "stroke-linecap": "round" }, headG) };
    }
    var eyes = [[-0.05, -0.2], [0.38, -0.22]].map(function (q) {
      var er = Math.max(7, hr * 0.26);
      var w3 = svg("circle", { cx: f2(q[0] * hr), cy: f2(q[1] * hr), r: f2(er), fill: "#FFFFFF", stroke: C.ink, "stroke-width": 4.5 }, headG);
      var p = svg("circle", { cx: f2(q[0] * hr + er * 0.3), cy: f2(q[1] * hr), r: f2(er * 0.42), fill: C.ink }, headG);
      var lid = svg("circle", { cx: f2(q[0] * hr), cy: f2(q[1] * hr), r: f2(er + 1), fill: k === "sheep" ? A.col2 : A.col, stroke: C.ink, "stroke-width": 4, display: "none" }, headG);
      return { w: w3, p: p, lid: lid, x: q[0] * hr, y: q[1] * hr, r: er };
    });
    self.anchor = { head: { x: 0, y: 0 }, top: { x: 0, y: 0 }, feet: { x: 0, y: 0 }, side: { x: 0, y: 0 }, mouth: { x: 0, y: 0 }, handR: { x: 0, y: 0 } };
    self.mark = function (kind2, at, dur) { mark(self, kind2, at, dur); return self; };
    var ph0 = (hash(k) % 100) / 30;
    function update(t) {
      var vis = self.visibleAt(t);
      root.setAttribute("display", vis ? "inline" : "none");
      var x = self.xAt(t), fac = self.facingAt(t), sp = Math.abs(self.xAt(t + 0.05) - self.xAt(t - 0.05)) / 0.1;
      var walking = sp > 4 ? clamp(sp / 40, 0, 1) : 0, ph = (self.distAt(t) / (lL * 0.55)) * PI;
      var bob = Math.sin(t * 2.2 + ph0) * 2 - Math.abs(Math.sin(ph)) * 4 * walking;
      root.setAttribute("transform", "translate(" + f2(x) + " " + f2(self.y0) + ") scale(" + f2(fac * scale) + " " + f2(scale) + ")");
      bodyG.setAttribute("transform", "translate(0 " + f2(bob) + ")");
      legs.forEach(function (lg) {
        var sw = Math.sin(ph + lg.ph) * 0.42 * walking, top = [lg.x, bY + by * 0.4 + bob];
        var foot = [lg.x + Math.sin(sw) * lL, 0 - Math.max(0, Math.cos(ph + lg.ph)) * 12 * walking];
        var d = "M" + P2(top[0], top[1]) + "L" + P2(foot[0], foot[1] - lW * 0.3);
        lg.o.setAttribute("d", d); lg.f.setAttribute("d", d);
      });
      var tw = Math.sin(t * (k === "dog" ? 9 : 3) + ph0) * (k === "dog" ? 14 : 8);
      var td = k === "cat" ? "M" + P2(-bx * 0.9, bY) + "C" + P2(-bx * 1.5, bY - 10) + " " + P2(-bx * 1.3 + tw, bY - by * 2.2) + " " + P2(-bx * 1.1 + tw, bY - by * 2.6) : "M" + P2(-bx * 0.92, bY - by * 0.2) + "Q" + P2(-bx * 1.3, bY - by * 0.1 + tw) + " " + P2(-bx * 1.35 + tw * 0.5, bY + by * (k === "mammoth" ? 0.6 : 0.5));
      tail.setAttribute("d", td); tailF.setAttribute("d", td);
      var nod = Math.sin(t * 1.7 + ph0) * 3 + Math.sin(ph * 2) * 3 * walking;
      headG.setAttribute("transform", "translate(" + P2(hX, hY + nod - bY + bY) + ") rotate(" + f2(nod * 0.6) + ")");
      if (trunk) { var sw2 = Math.sin(t * 1.6 + ph0) * 12; var trd = "M" + P2(hr * 0.6, hr * 0.2) + "C" + P2(hr * 1.1, hr * 0.8) + " " + P2(hr * 0.8 + sw2 * 0.4, hr * 1.6) + " " + P2(hr * 1.0 + sw2, hr * 2.3); trunk.o.setAttribute("d", trd); trunk.f.setAttribute("d", trd); }
      var bl = mod(t + ph0, 3.7) < 0.12;
      eyes.forEach(function (e) { e.lid.setAttribute("display", bl ? "inline" : "none"); e.p.setAttribute("cx", f2(e.x + e.r * 0.3 + Math.sin(t * 0.7 + ph0) * e.r * 0.15)); });
      var hx = x + fac * scale * hX, hy = self.y0 + scale * (hY + nod + bob);
      self.anchor.head = { x: hx, y: hy }; self.anchor.top = { x: hx, y: hy - hr * scale * 1.1 };
      self.anchor.feet = { x: x, y: self.y0 }; self.anchor.side = { x: x, y: self.y0 + scale * bY };
      self.anchor.mouth = { x: hx + fac * scale * hr * 0.8, y: hy + scale * hr * 0.3 }; self.anchor.handR = self.anchor.mouth;
      self.anchor.body = { x: x, y: self.y0 + scale * bY };
      self.anchor.visible = vis; self.anchor.walking = walking > 0; self.anchor.r = hr * scale;
    }
    onWorld(update);
    sc.critters.push(self);
    self.screenBox = function () {
      var a = self.anchor, c0 = sc.toScreen(a.feet.x - bx * scale * 1.3, a.top.y), c1 = sc.toScreen(a.feet.x + (hX + hr) * scale, a.feet.y);
      return { x: Math.min(c0.x, c1.x), y: c0.y, w: Math.abs(c1.x - c0.x), h: c1.y - c0.y };
    };
    return self;
  }

  // ------------------------- set pieces (SVG, base at 0,0) -------------------------
  var SET_NAMES = ["fire", "rock", "boulder", "log", "tent", "hut", "palm", "tree", "acacia", "pine", "cactus", "column", "well", "barrel", "bench", "table", "crate", "signpost", "pyramid", "cart", "tower", "stall", "bush", "snowman", "igloo", "bed", "firepit", "stones", "drum", "hay", "pot", "grave", "mushroom"];
  var SET_ALIAS = { campfire: "fire", stone: "rock", house: "hut", cabin: "hut", sign: "signpost", castle: "tower", market: "stall", shop: "stall", jar: "pot", vase: "pot", tomb: "grave", seat: "bench", chair: "bench", box: "crate", wagon: "cart", menhir: "stones", stonehenge: "stones" };
  function setName(n) { n = str(n).toLowerCase(); if (SET_NAMES.indexOf(n) >= 0) return n; return SET_ALIAS[n] || null; }
  // Size (w, h) in world units at scale 1, used for placement and callout targets.
  var SET_SIZE = { fire: [110, 150], rock: [90, 60], boulder: [190, 140], log: [170, 46], tent: [250, 210], hut: [290, 270], palm: [200, 400], tree: [230, 380], acacia: [330, 330], pine: [180, 380], cactus: [140, 230], column: [70, 380], well: [160, 180], barrel: [80, 100], bench: [200, 70], table: [220, 92], crate: [100, 90], signpost: [190, 230], pyramid: [520, 330], cart: [230, 140], tower: [190, 500], stall: [260, 250], bush: [150, 80], snowman: [120, 220], igloo: [280, 150], bed: [240, 80], firepit: [150, 46], stones: [240, 210], drum: [80, 92], hay: [170, 100], pot: [80, 90], grave: [90, 124], mushroom: [80, 90] };
  function drawSet(n, g, R, o) {
    o = o || {};
    var I = 6;
    function Pt(d, fill, w, extra) { var e = svg("path", Object.assign({ d: d, fill: fill || "none", stroke: C.ink, "stroke-width": w || I, "stroke-linejoin": "round", "stroke-linecap": "round" }, extra || {}), g); return e; }
    function hi(d) { return svg("path", { d: d, fill: "none", stroke: rgba("#FFFFFF", 0.35), "stroke-width": 5, "stroke-linecap": "round" }, g); }
    function shade(d) { return svg("path", { d: d, fill: rgba(C.ink, 0.16) }, g); }
    switch (n) {
      case "rock": Pt(wobPoly([[-44, 0], [-38, -40], [-6, -60], [30, -48], [46, 0]], R, 6), "#9A948A"); shade("M10 -50L44 0H14Z"); hi("M-30 -36q10 -14 30 -18"); break;
      case "boulder": Pt(wobEll(0, -68, 95, 70, R, 0.07, 12), "#8C867C"); shade("M30 -128Q100 -80 80 -10L40 -4Q70 -60 30 -128Z"); hi("M-60 -90q20 -34 60 -40"); Pt("M-20 -40q14 6 30 -4", null, 4); break;
      case "log": Pt(rrD(-85, -46, 170, 46, 22), "#8A5A2A"); Pt(ellD(-74, -23, 16, 21), "#D9A86A", 5); Pt(ellD(-74, -23, 7, 9), null, 3); Pt("M-40 -36H40M-30 -14H50", null, 3); break;
      case "tent": Pt("M-125 0L0 -210L125 0Z", "#B8865A"); Pt("M0 -210L-30 0H30Z", "#5A3A20"); Pt("M-20 -230L0 -210L22 -232", null, 7); Pt("M-60 -100L-40 0M60 -100L40 0", null, 3); break;
      case "hut": Pt("M-120 0V-150H120V0Z", "#C99A62"); Pt("M-150 -140L0 -270L150 -140Z", "#8E6A3A"); for (var hy = -236; hy < -150; hy += 26) { var hw2 = (150 * (hy + 270)) / 130 - 12; Pt("M" + P2(-hw2, hy) + "H" + f2(hw2), null, 3); } Pt(rrD(-30, -100, 60, 100, 6), "#4A2E18"); Pt(rrD(55, -110, 40, 36, 4), "#FFE08A", 5); break;
      case "palm": Pt("M0 0C10 -120 30 -250 14 -370", null, 30); svg("path", { d: "M0 0C10 -120 30 -250 14 -370", fill: "none", stroke: "#9A6A3A", "stroke-width": 18, "stroke-linecap": "round" }, g); for (var pr = 0; pr < 8; pr++) Pt("M0 -" + (30 + pr * 44) + "h20", null, 3).setAttribute("transform", "translate(" + f2(6 + pr * 1.6) + " 0)");
        for (var lf = 0; lf < 6; lf++) { var a = -PI / 2 + (lf - 2.5) * 0.62; Pt("M14 -370Q" + P2(14 + Math.cos(a) * 110, -370 + Math.sin(a) * 110 - 30) + " " + P2(14 + Math.cos(a) * 170, -370 + Math.sin(a) * 80 + 50) + "Q" + P2(14 + Math.cos(a) * 90, -370 + Math.sin(a) * 60) + " 14 -370Z", lf % 2 ? "#4E8A34" : "#3E7A2A"); } break;
      case "tree": Pt("M-18 0Q-10 -120 -16 -170H16Q10 -120 18 0Z", "#7A4A22"); [[-60, -230, 80], [50, -240, 85], [0, -300, 95], [-20, -200, 70], [40, -190, 60]].forEach(function (q, i) { Pt(wobEll(q[0], q[1], q[2], q[2] * 0.85, R, 0.08, 10), i % 2 ? "#4E8A34" : "#5E9A3A"); }); hi("M-60 -320q30 -30 70 -24"); break;
      case "acacia": Pt("M-10 0L-6 -180L-80 -270M-6 -180L70 -280", null, 26); svg("path", { d: "M-10 0L-6 -180L-80 -270M-6 -180L70 -280", fill: "none", stroke: "#7A5230", "stroke-width": 15, "stroke-linecap": "round", "stroke-linejoin": "round" }, g); Pt(wobEll(0, -300, 165, 40, R, 0.06, 14), "#5E7A2E"); hi("M-110 -312q60 -24 150 -18"); break;
      case "pine": Pt("M-14 0V-60H14V0Z", "#6A4422"); [[0, -60, 90], [0, -150, 76], [0, -235, 60]].forEach(function (q, i) { Pt("M" + P2(-q[2], q[1]) + "L0 " + f2(q[1] - 150 + i * 10) + "L" + P2(q[2], q[1]) + "Z", i % 2 ? "#3E6A3A" : "#2E5A32"); }); if (o.snow) Pt("M-40 -300L0 -370L40 -300Q20 -290 0 -310Q-20 -290 -40 -300Z", "#FFFFFF", 4); break;
      case "cactus": Pt(rrD(-24, -230, 48, 230, 24), "#5E9A4A"); Pt("M-24 -110H-56V-170", null, 34); svg("path", { d: "M-24 -110H-56V-170", fill: "none", stroke: "#5E9A4A", "stroke-width": 22, "stroke-linecap": "round", "stroke-linejoin": "round" }, g); Pt("M24 -140H54V-190", null, 30); svg("path", { d: "M24 -140H54V-190", fill: "none", stroke: "#5E9A4A", "stroke-width": 18, "stroke-linecap": "round", "stroke-linejoin": "round" }, g); Pt("M-6 -210V-20M8 -200V-30", null, 2.5); break;
      case "column": Pt(rrD(-44, -26, 88, 26, 4), "#D8CFBC"); Pt("M-30 -26V-352H30V-26Z", "#EDE6D6"); Pt("M-14 -40V-340M0 -40V-340M14 -40V-340", null, 2.5); Pt(rrD(-46, -380, 92, 30, 6), "#D8CFBC"); Pt("M-46 -372q-14 10 0 18M46 -372q14 10 0 18", null, 4); break;
      case "well": Pt(rrD(-70, -80, 140, 80, 8), "#9A948A"); for (var wb = 0; wb < 3; wb++) Pt("M-70 " + (-60 + wb * 22) + "H70", null, 3); Pt("M-60 -80V-170M60 -80V-170", null, 10); Pt("M-80 -170L0 -200L80 -170Z", "#8E4A2E"); Pt("M0 -170V-110", null, 3); Pt(rrD(-12, -112, 24, 24, 4), "#8A5A2A", 4); break;
      case "barrel": Pt("M-34 0Q-48 -50 -34 -100H34Q48 -50 34 0Z", "#9A6A3A"); Pt("M-40 -22H40M-40 -78H40", null, 6); Pt("M-10 -96V-4", null, 2.5); break;
      case "bench": Pt(rrD(-100, -70, 200, 18, 6), "#9A6A3A"); Pt("M-80 -52V0M80 -52V0", null, 12); svg("path", { d: "M-80 -52V0M80 -52V0", stroke: "#7A4A22", "stroke-width": 6 }, g); break;
      case "table": Pt(rrD(-110, -92, 220, 20, 6), "#A8744A"); Pt("M-90 -72V0M90 -72V0", null, 14); svg("path", { d: "M-90 -72V0M90 -72V0", stroke: "#7A4A22", "stroke-width": 7 }, g); break;
      case "crate": Pt(rrD(-50, -90, 100, 90, 4), "#C8944A"); Pt("M-50 -90L50 0M50 -90L-50 0", null, 4); Pt(rrD(-50, -90, 100, 90, 4), null, 6); break;
      case "signpost": Pt("M0 0V-200", null, 16); svg("path", { d: "M0 0V-200", stroke: "#8A5A2A", "stroke-width": 9 }, g); break;
      case "pyramid": Pt("M-260 0L0 -330L260 0Z", "#E0A858"); Pt("M0 -330L260 0H60Z", "#C08840"); for (var py = 1; py < 9; py++) { var yy = -(330 * py) / 9, hw = 260 * (1 - py / 9); svg("path", { d: "M" + P2(-hw, yy) + "H" + f2(hw), stroke: rgba(C.ink, 0.25), "stroke-width": 3 }, g); } Pt(rrD(-20, -50, 40, 50, 4), "#5A3A20", 4); break;
      case "cart": Pt(rrD(-110, -130, 220, 70, 6), "#A8744A"); Pt("M-110 -110H110M-60 -130V-60M0 -130V-60M60 -130V-60", null, 3); [-70, 70].forEach(function (wx) { Pt(circD(wx, -36, 36), "#8A5A2A"); Pt("M" + P2(wx - 36, -36) + "H" + f2(wx + 36) + "M" + P2(wx, -72) + "V0", null, 4); }); Pt("M110 -96L170 -60", null, 8); break;
      case "tower": Pt("M-80 0V-420H80V0Z", "#B8AE9A"); for (var tb = 0; tb < 5; tb++) Pt(rrD(-80 + tb * 34, -450, 22, 30, 2), "#B8AE9A", 5); Pt(rrD(-16, -300, 32, 50, 14), "#3A2A1A", 5); Pt(rrD(-28, -90, 56, 90, 26), "#4A3020", 5); shade("M30 -420H80V0H30Z"); break;
      case "stall": Pt("M-120 0V-140H120V0Z", "#C8944A"); Pt("M-130 -150H130V-170H-130Z", "#8A5A2A"); Pt("M-110 -170V-240M110 -170V-240", null, 8); var cols2 = ["#E8392B", "#FFF3D6"]; for (var sw = 0; sw < 6; sw++) Pt("M" + P2(-130 + sw * 43.3, -240) + "h43.3l-4 34q-17 10 -35 0Z", cols2[sw % 2], 4); for (var fr = 0; fr < 5; fr++) Pt(circD(-80 + fr * 40, -160, 14), ["#F2C230", "#E8743B", "#6CCB3C"][fr % 3], 4); break;
      case "bush": Pt(wobEll(-40, -40, 50, 40, R, 0.1, 10), "#4E8A34"); Pt(wobEll(30, -44, 56, 44, R, 0.1, 10), "#5E9A3A"); Pt(wobEll(-4, -60, 44, 36, R, 0.1, 10), "#6EAA44"); break;
      case "snowman": Pt(circD(0, -55, 55), "#FFFFFF"); Pt(circD(0, -145, 42), "#FFFFFF"); Pt(circD(0, -205, 30), "#FFFFFF"); svg("circle", { cx: -10, cy: -210, r: 4, fill: C.ink }, g); svg("circle", { cx: 10, cy: -210, r: 4, fill: C.ink }, g); Pt("M0 -200l24 6l-24 4Z", "#FF8A1E", 3); Pt("M-40 -150L-90 -180M40 -150L90 -185", null, 6); break;
      case "igloo": Pt("M-140 0A140 140 0 0 1 140 0Z", "#F4F8FC"); for (var ir = 1; ir < 4; ir++) Pt("M" + P2(-140 + ir * 12, -ir * 36) + "Q0 " + f2(-ir * 46) + " " + P2(140 - ir * 12, -ir * 36), null, 3); Pt("M-40 0V-50A40 40 0 0 1 40 -50V0Z", "#3A4A6A", 5); break;
      case "bed": Pt(rrD(-120, -60, 240, 44, 10), "#E8E2D4"); Pt(rrD(-120, -40, 240, 26, 6), "#4F7FC0"); Pt("M-120 -16V0M120 -16V0", null, 10); Pt(rrD(-112, -78, 60, 26, 12), "#FFFFFF", 5); break;
      case "firepit": for (var fs = 0; fs < 7; fs++) Pt(wobEll(-60 + fs * 20, -16, 14, 13, R, 0.1, 8), "#8C867C", 4); break;
      case "stones": [[-90, 190, 50], [0, 210, 56], [90, 180, 48]].forEach(function (q) { Pt(wobPoly([[q[0] - q[2] / 2, 0], [q[0] - q[2] / 2 + 4, -q[1]], [q[0] + q[2] / 2 - 4, -q[1] - 8], [q[0] + q[2] / 2, 0]], R, 5), "#8C867C"); }); Pt(rrD(-110, -224, 220, 24, 4), "#7C766C"); break;
      case "drum": Pt("M-36 -78V-10Q0 6 36 -10V-78Z", "#B5483A"); Pt(ellD(0, -78, 36, 12), "#F4E8C8"); Pt("M-36 -70L36 -20M36 -70L-36 -20", null, 3); break;
      case "hay": Pt(wobEll(0, -48, 82, 50, R, 0.06, 12), "#E8C25A"); for (var hh = 0; hh < 10; hh++) Pt("M" + P2(-60 + hh * 13, -80 + (hh % 3) * 10) + "q4 20 -2 40", null, 3); break;
      case "pot": Pt("M-26 -90Q-48 -50 -32 0H32Q48 -50 26 -90Z", "#C9744A"); Pt("M-18 -90H18V-100H-18Z", "#A85A36", 5); Pt("M-40 -50Q0 -38 40 -50", null, 3); if (o.wet) for (var dr = 0; dr < 4; dr++) svg("path", { d: "M" + P2(-30 + dr * 18, -30 + (dr % 2) * 12) + "q-4 8 0 12q4 -4 0 -12Z", fill: "#7FC8F0", stroke: C.ink, "stroke-width": 2 }, g); break;
      case "grave": Pt("M-40 0V-90Q-40 -124 0 -124Q40 -124 40 -90V0Z", "#A8A296"); Pt("M-16 -80H16M0 -96V-56", null, 5); break;
      case "mushroom": Pt("M-12 0V-50H12V0Z", "#F4EEDC"); Pt("M-42 -46Q-44 -96 0 -96Q44 -96 42 -46Z", "#E8392B"); [[-18, -70], [8, -82], [22, -60]].forEach(function (q) { svg("circle", { cx: q[0], cy: q[1], r: 7, fill: "#FFFFFF" }, g); }); break;
    }
  }
  // A signpost board with a label (and optional era icon) at the top of the post.
  function signBoard(g, text, icon, R, w) {
    var lay = layoutText(text, { size: 34, maxWidth: (w || 200) - 30, maxLines: 2, family: HAND, weight: 700, minSize: 18 });
    var bw = Math.max(icon ? 120 : 110, lay.w + 36), bh = lay.h + 26 + (icon ? 70 : 0), top = -200 - bh + 20;
    svg("path", { d: wobPoly([[-bw / 2, top], [bw / 2, top], [bw / 2 + 16, top + bh / 2], [bw / 2, top + bh], [-bw / 2, top + bh]], R, 3), fill: "#D9A86A", stroke: C.ink, "stroke-width": 6, "stroke-linejoin": "round" }, g);
    if (icon) { var ig = svg("g", { transform: "translate(0 " + f2(top + 44) + ") scale(0.55)" }, g); drawEraIcon(icon, ig, R); }
    writeBlock(g, lay, 0, top + (icon ? 70 : 0) + 13 + lay.h / 2, { color: C.ink });
    return { top: top, w: bw, h: bh };
  }
  function setpiece(name, o) {
    o = obj(o);
    var sc = o.scene || cur(), n = setName(name);
    if (!n) return null;
    if (n === "fire") return fire(sc, num(o.x, sc.Ww / 2), num(o.y, sc.G), num(o.scale, 1), o);
    var layer = o.layer === "front" ? sc.layers.front.g : o.layer === "mid" ? sc.layers.mid.g : o.layer === "near" ? sc.layers.near.g : sc.backG;
    var scale = num(o.scale, 1) * (sc.charScale || 1) * (n === "pyramid" && sc.portrait ? 0.7 : 1);
    var x = num(o.x, sc.Ww / 2), y = num(o.y, sc.G);
    var g = svg("g", { transform: "translate(" + P2(x, y) + ") scale(" + f2((o.flip ? -1 : 1) * scale) + " " + f2(scale) + ")" }, layer);
    var R = V.makeRand(hash(n + x) + 11);
    svg("ellipse", { cx: 0, cy: 2, rx: f2(SET_SIZE[n][0] * 0.5), ry: 10, fill: C.shadow }, g);
    drawSet(n, g, R, { snow: sc.loc === "tundra", wet: o.wet });
    var sz = SET_SIZE[n], res = { g: g, x: x, y: y, scale: scale, name: n, w: sz[0] * scale, h: sz[1] * scale, scene: sc };
    if (n === "signpost") { var bd = signBoard(g, o.text || o.label || "", o.icon, R); res.h = (-bd.top + 10) * scale; }
    var at = o.at == null ? null : num(o.at, 0), until = o.until == null ? null : num(o.until, D + 1);
    if (at != null || until != null) {
      sc.onFrame(function (t) {
        var on = (at == null || t >= at) && (until == null || t < until);
        g.setAttribute("display", on ? "inline" : "none");
        if (on && at != null) { var p = popEnv(t, at, null, 0.35); g.setAttribute("transform", "translate(" + P2(x, y) + ") scale(" + f2((o.flip ? -1 : 1) * scale * clamp(p, 0, 1.2)) + " " + f2(scale * clamp(p, 0, 1.2)) + ")"); }
      });
    }
    res.anchor = { top: { x: x, y: y - res.h }, side: { x: x + res.w * 0.45, y: y - res.h * 0.5 }, head: { x: x, y: y - res.h * 0.6 }, feet: { x: x, y: y }, handR: { x: x, y: y - res.h * 0.5 } };
    return res;
  }
  // Campfire: logs, three flickering flames, glow and rising embers.
  function fire(sc, x, y, scale, o) {
    sc = sc || cur(); o = obj(o);
    var layer = o.layer === "front" ? sc.layers.front.g : sc.backG;
    scale = (scale || 1) * (sc.charScale || 1);
    var glow = svg("ellipse", { cx: f2(x), cy: f2(y - 70 * scale), rx: f2(260 * scale), ry: f2(200 * scale), fill: "url(#" + glowGrad("#FF9A3A", "#FFD27A") + ")", opacity: 0.6 }, o.layer === "front" ? layer : sc.glowG);
    var g = svg("g", { transform: "translate(" + P2(x, y) + ") scale(" + f2(scale) + ")" }, layer);
    var R = V.makeRand(hash("fire" + x));
    svg("ellipse", { cx: 0, cy: 0, rx: 70, ry: 12, fill: C.shadow }, g);
    for (var i = 0; i < 6; i++) svg("path", { d: wobEll(-50 + i * 20, -10, 13, 11, R, 0.1, 8), fill: "#8C867C", stroke: C.ink, "stroke-width": 4 }, g);
    svg("path", { d: rrD(-56, -34, 112, 22, 11), fill: "#7A4A22", stroke: C.ink, "stroke-width": 5, transform: "rotate(-14)" }, g);
    svg("path", { d: rrD(-56, -34, 112, 22, 11), fill: "#8A5A2A", stroke: C.ink, "stroke-width": 5, transform: "rotate(14)" }, g);
    var fl = [["#E8392B", 1], ["#FF8A1E", 0.78], ["#FFD84A", 0.5]].map(function (c) { return { e: svg("path", { fill: c[0], stroke: c[1] === 1 ? C.ink : "none", "stroke-width": 5, "stroke-linejoin": "round" }, g), s: c[1] }; });
    var embers = [];
    for (var j = 0; j < 9; j++) embers.push({ e: svg("circle", { r: f2(2.5 + R() * 3), fill: "#FFB03A" }, g), x: (R() - 0.5) * 60, sp: 50 + R() * 60, ph: R() * 3, amp: 8 + R() * 16 });
    var on0 = o.at == null ? -1 : num(o.at, 0), off = o.until == null ? 1e9 : num(o.until, 1e9);
    sc.onFrame(function (t) {
      var on = t >= on0 && t < off;
      g.setAttribute("display", on ? "inline" : "none"); glow.setAttribute("display", on ? "inline" : "none");
      if (!on) return;
      var grow = on0 > 0 ? EASE.outBack(prog(t, on0, on0 + 0.5)) : 1;
      fl.forEach(function (f, k) {
        var h = (130 * f.s + Math.sin(t * 11 + k) * 12 + Math.sin(t * 17.3 + k * 2) * 7) * grow, w = 54 * f.s * grow;
        var sw = Math.sin(t * 7.3 + k * 1.7) * 10 * f.s;
        f.e.setAttribute("d", "M" + P2(-w, -26) + "C" + P2(-w * 1.1, -26 - h * 0.5) + " " + P2(-w * 0.2 + sw, -26 - h * 0.7) + " " + P2(sw * 1.4, -26 - h) + "C" + P2(w * 0.3 + sw, -26 - h * 0.6) + " " + P2(w * 1.15, -26 - h * 0.45) + " " + P2(w, -26) + "Q0 " + f2(-14) + " " + P2(-w, -26) + "Z");
      });
      embers.forEach(function (em) { var q = mod(t * 0.6 + em.ph, 1.6) / 1.6; em.e.setAttribute("cx", f2(em.x + Math.sin(t * 3 + em.ph) * em.amp)); em.e.setAttribute("cy", f2(-60 - q * em.sp * 3)); em.e.setAttribute("opacity", f2((1 - q) * 0.9)); });
      glow.setAttribute("opacity", f2(0.5 + 0.1 * Math.sin(t * 9.1) + 0.06 * Math.sin(t * 23.3)));
      if (sc.caveGlow) sc.caveGlow.setAttribute("opacity", f2(0.45 + 0.08 * Math.sin(t * 8.7) + 0.05 * Math.sin(t * 21)));
    });
    return { g: g, x: x, y: y, scale: scale, name: "fire", w: 110 * scale, h: 150 * scale, scene: sc, anchor: { top: { x: x, y: y - 150 * scale }, side: { x: x + 50 * scale, y: y - 60 * scale }, head: { x: x, y: y - 90 * scale }, feet: { x: x, y: y }, handR: { x: x, y: y - 80 * scale } } };
  }
  // Free prop in the world (floating, spinning or resting).
  function freeProp(name, o) {
    o = obj(o);
    var sc = o.scene || cur(), n = propName(name);
    if (!n) return null;
    var g0 = svg("g", null, o.front ? sc.layers.front.g : sc.fxG), g = svg("g", null, g0);
    drawProp(n, g, 1, V.makeRand(hash(n) + 5));
    var x = num(o.x, sc.Ww / 2), y = num(o.y, sc.G - 40), size = num(o.size, 1) * sc.charScale, at = num(o.at, 0), until = o.until == null ? 1e9 : num(o.until, 1e9);
    sc.onFrame(function (t) {
      var p = popEnv(t, at, until);
      g0.setAttribute("display", p > 0.001 ? "inline" : "none");
      var fy = o.float ? Math.sin(t * 2.2) * 10 : 0, rot = num(o.rot, 0) + (o.spin ? t * 120 : 0);
      g0.setAttribute("transform", "translate(" + P2(x, y + fy) + ") scale(" + f2(size * p) + ") rotate(" + f2(rot) + ")");
    });
    return { g: g0, x: x, y: y, anchor: { top: { x: x, y: y - 80 * size }, head: { x: x, y: y - 40 * size }, side: { x: x + 30, y: y - 40 * size }, feet: { x: x, y: y }, handR: { x: x, y: y - 40 * size } } };
  }

  // ------------------------- weather, tint, bursts -------------------------
  var WX = ["snow", "rain", "embers", "dust", "ash", "leaves", "stars"];
  function weather(kind, o) {
    o = obj(o);
    var sc = o.scene || cur();
    kind = pick(WX, kind, "snow");
    var n = Math.floor(num(o.count, kind === "rain" ? 90 : kind === "stars" ? 70 : 60)), at = num(o.at, 0), until = o.until == null ? 1e9 : num(o.until, 1e9), speed = num(o.speed, 1);
    var R = V.makeRand(hash(kind) + sc.id * 13), g = svg("g", null, sc.wxSvg), vw = sc.vp.w, vh = sc.vp.h, ps = [];
    var col = o.color || { snow: "#FFFFFF", rain: "#9FCFF0", embers: "#FFB03A", dust: "#E8C890", ash: "#9A928A", leaves: "#8AB04A", stars: "#FFF6D8" }[kind];
    for (var i = 0; i < n; i++) {
      var p = { x: R() * vw, y: R() * vh, s: 0.6 + R() * 0.8, ph: R() * TAU };
      if (kind === "rain") p.e = svg("path", { d: "M0 0l-6 26", stroke: col, "stroke-width": f2(2.5 * p.s), "stroke-linecap": "round", opacity: 0.7 }, g);
      else if (kind === "leaves") p.e = svg("path", { d: "M0 -8Q8 0 0 8Q-8 0 0 -8Z", fill: R() < 0.5 ? col : "#E89A3A", stroke: C.ink, "stroke-width": 1.5 }, g);
      else if (kind === "ash") p.e = svg("path", { d: wobEll(0, 0, 4 * p.s, 3 * p.s, R, 0.3, 6), fill: col, opacity: 0.8 }, g);
      else p.e = svg("circle", { r: f2((kind === "snow" ? 4.5 : kind === "stars" ? 2.2 : 3) * p.s * u(1)), fill: col, opacity: 0.85 }, g);
      if (kind === "stars") p.y = R() * vh * 0.55;
      ps.push(p);
    }
    sc.onFrame(function (t) {
      var a = smooth(prog(t, at, at + 0.8)) * (1 - smooth(prog(t, until, until + 0.8)));
      g.setAttribute("display", a > 0.001 ? "inline" : "none");
      if (a <= 0.001) return;
      g.setAttribute("opacity", f2(a));
      ps.forEach(function (p) {
        var x = p.x, y = p.y, rot = 0;
        if (kind === "snow") { y = mod(p.y + t * 70 * speed * p.s, vh + 20) - 10; x = mod(p.x + Math.sin(t * 1.3 + p.ph) * 20 + t * 12 * speed, vw); }
        else if (kind === "rain") { y = mod(p.y + t * 900 * speed * p.s, vh + 40) - 30; x = mod(p.x - t * 200 * speed, vw + 20); }
        else if (kind === "embers") { y = mod(p.y - t * 80 * speed * p.s, vh + 20) - 10; x = p.x + Math.sin(t * 2 + p.ph) * 26; p.e.setAttribute("opacity", f2(0.5 + 0.5 * Math.sin(t * 7 + p.ph))); }
        else if (kind === "dust") { x = mod(p.x + t * 120 * speed * p.s, vw + 20) - 10; y = p.y + Math.sin(t * 1.7 + p.ph) * 14; }
        else if (kind === "ash") { y = mod(p.y + t * 40 * speed * p.s, vh + 20) - 10; x = mod(p.x + Math.sin(t * 0.9 + p.ph) * 30 + t * 10, vw); rot = t * 60 + p.ph * 50; }
        else if (kind === "leaves") { y = mod(p.y + t * 60 * speed * p.s, vh + 20) - 10; x = mod(p.x + Math.sin(t * 1.4 + p.ph) * 40 + t * 30 * speed, vw); rot = Math.sin(t * 2 + p.ph) * 70; }
        else if (kind === "stars") { p.e.setAttribute("opacity", f2(0.4 + 0.5 * (0.5 + 0.5 * Math.sin(t * 3 + p.ph)))); }
        p.e.setAttribute("transform", "translate(" + P2(x, y) + ")" + (rot ? " rotate(" + f2(rot) + ")" : ""));
      });
    });
    return g;
  }
  function tint(color, opacity, at, dur) {
    var sc = cur();
    sc.tints.push({ at: num(at, 0), dur: num(dur, 0.8), op: clamp(num(opacity, 0.35), 0, 1), color: color || "#1A2A5A" });
    return sc;
  }
  function burstLines(g, at, r, count, color, rot0) {
    var lines2 = [];
    for (var i = 0; i < count; i++) {
      var a = (i / count) * TAU + (rot0 || 0);
      lines2.push({ e: svg("path", { fill: "none", stroke: color, "stroke-width": 7, "stroke-linecap": "round" }, g), a: a, l: r * (0.7 + 0.3 * ((i * 7) % 3) / 2) });
    }
    return function (t) {
      var q = prog(t, at, at + 0.45);
      g.setAttribute("display", q > 0 && q < 1 ? "inline" : "none");
      if (q <= 0 || q >= 1) return;
      lines2.forEach(function (L) {
        var r0 = L.l * (0.4 + EASE.outCubic(q) * 0.8), r1 = r0 + L.l * 0.45 * (1 - q);
        L.e.setAttribute("d", "M" + P2(Math.cos(L.a) * r0, Math.sin(L.a) * r0) + "L" + P2(Math.cos(L.a) * r1, Math.sin(L.a) * r1));
      });
    };
  }
  function burst(x, y, at, o) {
    o = obj(o);
    var sc = o.scene || cur(), g = svg("g", { transform: "translate(" + P2(num(x, sc.Ww / 2), num(y, 500)) + ")" }, sc.fxG);
    var col = o.color || C.ink;
    sc.onFrame(burstLines(g, num(at, 0), num(o.r, 110), Math.floor(num(o.count, 10)), col));
    return g;
  }
  function sburst(sx, sy, at, o) {
    o = obj(o);
    var g = svg("g", { transform: "translate(" + P2(num(sx, 0.5) * W, num(sy, 0.5) * H) + ")" }, need().ogBack);
    onOver(burstLines(g, num(at, 0), num(o.r, u(150)), Math.floor(num(o.count, 12)), o.color || C.ink));
    return g;
  }

  // ------------------------- reaction marks (world, over the head) -------------------------
  var MARKS = ["sweat", "?!", "!", "!!", "?", "...", "zzz", "heart", "anger", "music", "idea", "shock", "drool"];
  function markName(k) { k = str(k).toLowerCase(); if (MARKS.indexOf(k) >= 0) return k; var al = { question: "?", exclaim: "!", dots: "...", sleep: "zzz", love: "heart", mad: "anger", note: "music", bulb: "idea", surprise: "!!", wow: "!!", sweaty: "sweat" }; return al[k] || null; }
  function drawMark(k, g) {
    var I = 5;
    function T(txt, col, size, x, y) { var e = svg("text", { x: x || 0, y: y || 0, "text-anchor": "middle", "font-family": HFONT, "font-size": size || 70, fill: col, stroke: C.ink, "stroke-width": 9, "stroke-linejoin": "round", "paint-order": "stroke fill" }, g); e.textContent = txt; return e; }
    switch (k) {
      case "?": T("?", C.yellow, 86, 0, 0); break;
      case "!": T("!", C.red, 90, 0, 0); break;
      case "!!": T("!!", C.red, 86, 0, 0); break;
      case "?!": T("?!", C.yellow, 84, 0, 0); break;
      case "...": [-26, 0, 26].forEach(function (x, i) { svg("circle", { cx: x, cy: -14, r: 9, fill: C.ink, class: "dw-dot dw-dot" + i }, g); }); break;
      case "zzz": T("z", "#7FB6E8", 44, -18, 0); T("z", "#7FB6E8", 56, 8, -36); T("Z", "#7FB6E8", 68, 34, -80); break;
      case "heart": svg("path", { d: "M0 -8C-30 -40 -56 -10 -30 16L0 40L30 16C56 -10 30 -40 0 -8Z", transform: "translate(0 -30)", fill: C.red, stroke: C.ink, "stroke-width": I, "stroke-linejoin": "round" }, g); break;
      case "anger": svg("path", { d: "M-8 -60Q-10 -38 -30 -36M8 -60Q10 -38 30 -36M-8 -8Q-10 -30 -30 -32M8 -8Q10 -30 30 -32", fill: "none", stroke: C.red, "stroke-width": 9, "stroke-linecap": "round" }, g); break;
      case "music": svg("path", { d: "M-10 -10V-70L30 -80V-20", fill: "none", stroke: C.ink, "stroke-width": 7, "stroke-linejoin": "round" }, g); svg("ellipse", { cx: -20, cy: -10, rx: 13, ry: 10, fill: C.ink }, g); svg("ellipse", { cx: 20, cy: -20, rx: 13, ry: 10, fill: C.ink }, g); break;
      case "idea": svg("path", { d: "M-24 -60A30 30 0 1 1 24 -60Q14 -46 14 -30H-14Q-14 -46 -24 -60Z", fill: C.yellow, stroke: C.ink, "stroke-width": I, "stroke-linejoin": "round" }, g); svg("path", { d: rrD(-14, -30, 28, 18, 5), fill: "#A8ACB4", stroke: C.ink, "stroke-width": 4 }, g); [[-56, -84], [0, -118], [56, -84], [-64, -40], [64, -40]].forEach(function (q) { svg("path", { d: "M" + P2(q[0] * 0.72, q[1] * 0.72 - 18) + "L" + P2(q[0], q[1] - 12), stroke: C.ink, "stroke-width": 5, "stroke-linecap": "round" }, g); }); break;
      case "shock": for (var i = 0; i < 7; i++) { var a = -PI + 0.25 + (i / 6) * (PI - 0.5); svg("path", { d: "M" + P2(Math.cos(a) * 40, Math.sin(a) * 40 + 30) + "L" + P2(Math.cos(a) * 75, Math.sin(a) * 75 + 30), stroke: C.ink, "stroke-width": 6, "stroke-linecap": "round" }, g); } break;
      case "sweat": svg("path", { d: "M0 -60Q-20 -24 -14 -10Q0 6 14 -10Q20 -24 0 -60Z", fill: "#7FC8F0", stroke: C.ink, "stroke-width": I, "stroke-linejoin": "round" }, g); svg("path", { d: "M-4 -30q-4 8 0 14", fill: "none", stroke: "#FFFFFF", "stroke-width": 4, "stroke-linecap": "round" }, g); break;
      case "drool": svg("path", { d: "M0 -40Q-12 -14 -8 -4Q0 6 8 -4Q12 -14 0 -40Z", fill: "#BFE6F7", stroke: C.ink, "stroke-width": 4 }, g); break;
    }
  }
  function mark(target, kind, at, dur) {
    var k = markName(kind);
    if (!k || !target) return null;
    var sc = target.sc || cur();
    at = num(at, 0); dur = num(dur, 1.6);
    if (at > D - 0.2) at = Math.max(0, D - 0.6);
    var g0 = svg("g", { display: "none" }, sc.fxG), g = svg("g", null, g0);
    drawMark(k, g);
    var dots = g.querySelectorAll ? g.querySelectorAll(".dw-dot") : [];
    var until = at + dur;
    var end = until >= D - 1.0 ? 1e9 : until; // marks that land near the end stay up
    onWorld(function (t) {
      var p = popEnv(t, at, end, 0.3, 0.22);
      g0.setAttribute("display", p > 0.001 ? "inline" : "none");
      if (p <= 0.001) return;
      var a = target.anchor || {}, base = k === "drool" ? a.mouth : k === "sweat" ? { x: a.head.x - (a.facing || 1) * (a.r || 60) * 0.95, y: a.head.y - (a.r || 60) * 0.2 } : k === "shock" ? a.top : a.top;
      if (!base) return;
      var s = (target.scale || 1) * (target.kind === "animal" ? 1.1 : 1) * (k === "shock" ? 1.2 : 0.95);
      var dx = k === "sweat" || k === "drool" || k === "shock" ? 0 : (a.facing || 1) * 30 * s, dy = k === "shock" || k === "sweat" || k === "drool" ? 0 : -30 * s;
      if (k !== "sweat" && k !== "drool" && k !== "shock" && a.head) {
        var scr = sc.toScreen(base.x + dx, base.y + dy - 95 * s), sr0 = safeRect();
        if (scr.y < sr0.y + 6) { var rr0 = a.r || 60; base = { x: a.head.x + (a.facing || 1) * rr0 * 1.55, y: a.head.y - rr0 * 0.1 }; dx = 0; dy = 0; }
      }
      var wob = Math.sin(t * 4.2) * 4, fall = k === "sweat" ? (mod(t - at, 1.2)) * 40 : k === "drool" ? Math.sin(t * 3) * 4 + 10 : 0;
      g0.setAttribute("transform", "translate(" + P2(base.x + dx, base.y + dy + wob * 0.5 + fall) + ") scale(" + f2(s * p) + ") rotate(" + f2(wob * 0.8) + ")");
      for (var i = 0; i < dots.length; i++) dots[i].setAttribute("opacity", t - at > i * 0.18 ? 1 : 0);
    });
    return g0;
  }
  function sweatDrip(actor, at, until) {
    var sc = actor.sc, g = svg("g", null, sc.fxG);
    var drops = [0, 0.55].map(function () { var e = svg("path", { d: "M0 -26Q-11 -8 -8 0Q0 8 8 0Q11 -8 0 -26Z", fill: "#7FC8F0", stroke: C.ink, "stroke-width": 4 }, g); return e; });
    at = num(at, 0); until = until == null ? 1e9 : num(until, 1e9);
    onWorld(function (t) {
      var on = t >= at && t < until && actor.anchor.visible;
      g.setAttribute("display", on ? "inline" : "none");
      if (!on) return;
      var a = actor.anchor, r = a.r || 60, f = a.facing || 1;
      drops.forEach(function (e, i) {
        var q = mod(t - at + i * 0.55, 1.1) / 1.1;
        e.setAttribute("transform", "translate(" + P2(a.head.x + (i ? f * r * 0.85 : -f * r * 0.9), a.head.y - r * 0.3 + q * r * 0.9) + ") scale(" + f2((actor.scale || 1) * (1 - q * 0.3)) + ")");
        e.setAttribute("opacity", f2(1 - q * q));
      });
    });
    return g;
  }

  // ------------------------- screen overlays -------------------------
  var HSIZE = { sm: 58, md: 86, lg: 116, xl: 150 };
  // Chunky caps headline with a black outline; *word* turns red.
  function headline(text, at, o) {
    o = obj(o);
    var s0 = need(), sr = safeRect();
    text = str(text);
    if (!text) return null;
    at = Math.max(0, Math.min(num(at, 0.3), Math.max(0.2, D - 1.2)));
    var until = o.until == null ? null : num(o.until, null);
    var col = colorOf(o.color, "yellow");
    var size = u(HSIZE[o.size] || HSIZE[V.isPortrait ? "lg" : "md"] || 86);
    var maxW = o.maxWidth ? num(o.maxWidth, 0.8) * (o.maxWidth > 1 ? 1 : W) : sr.w * (V.isPortrait ? 0.96 : 0.74);
    var lay = layoutText(text, { size: size, maxWidth: maxW, maxLines: num(o.maxLines, V.isPortrait ? 3 : 2), upper: true, family: HFONT, lineHeight: 1.02, minSize: size * 0.4 });
    var kick = str(o.kicker), kh = 0, klay = null;
    if (kick) { klay = layoutText(kick, { size: Math.max(u(26), lay.size * 0.3), maxWidth: maxW * 0.8, maxLines: 1, upper: true, family: HFONT }); kh = klay.h + u(26); }
    var bw = lay.w + lay.size * 0.3, bh = lay.h + lay.size * 0.2;
    var pos = pick(["top", "center", "bottom"], o.pos, "top");
    var cx = o.x != null ? num(o.x, 0.5) * W : W / 2, cy;
    if (o.y != null) cy = num(o.y, 0.2) * H;
    else if (pos === "top") cy = sr.y + kh + bh / 2 + u(V.isPortrait ? 14 : 4);
    else if (pos === "center") cy = sr.y + sr.h * 0.45;
    else cy = sr.y + sr.h - bh / 2 - u(10);
    cx = clamp(cx, sr.x + bw / 2, sr.x + sr.w - bw / 2);
    cy = clamp(cy, sr.y + kh + bh / 2, sr.y + sr.h - bh / 2);
    var g0 = svg("g", { class: "dw-headline", display: "none" }, o.layer === "back" ? s0.ogBack : s0.ogTop);
    var g = svg("g", null, g0);
    writeBlock(g, lay, 0, lay.size * 0.07, { color: C.ink, stroke: C.ink, strokeW: lay.size * 0.2, emColor: C.ink });
    writeBlock(g, lay, 0, 0, { color: col, stroke: C.ink, strokeW: lay.size * 0.15, emColor: col === C.red ? C.yellow : C.red });
    if (klay) {
      var kw = klay.w + u(30), ky = -bh / 2 - klay.h / 2 - u(12);
      var kg = svg("g", { transform: "rotate(-3 0 " + f2(ky) + ")" }, g);
      svg("path", { d: rrD(-kw / 2, ky - klay.h / 2 - u(8), kw, klay.h + u(16), u(10)), fill: C.ink }, kg);
      writeBlock(kg, klay, 0, ky, { color: C.paper });
    }
    var rot = num(o.rot, -2), slam = !!o.slam;
    onOver(function (t) {
      var p;
      if (slam) {
        if (t < at) p = 0; else { var q = prog(t, at, at + 0.22); p = q < 1 ? lerp(2.6, 1, EASE.inCubic(q)) : 1 + Math.sin((t - at - 0.22) * 30) * 0.04 * Math.exp(-(t - at - 0.22) * 8); }
        if (until != null && t > until) p *= 1 - EASE.inCubic(prog(t, until, until + 0.25));
      } else p = popEnv(t, at, until, 0.34, 0.25);
      g0.setAttribute("display", p > 0.001 ? "inline" : "none");
      if (p <= 0.001) return;
      var wob = Math.sin(t * 2.1) * 0.6;
      g0.setAttribute("transform", "translate(" + P2(cx, cy) + ") rotate(" + f2(rot + wob + (1 - Math.min(1, p)) * -6) + ") scale(" + f2(p) + ")");
      g0.setAttribute("opacity", slam && t < at + 0.1 ? f2(prog(t, at, at + 0.1)) : 1);
    });
    var box = { x: cx - bw / 2, y: cy - bh / 2 - kh, w: bw, h: bh + kh };
    item("headline", text, at + 0.3, until == null ? null : until, function () { return box; });
    return { g: g0, box: box, at: at, until: until, size: lay.size };
  }
  function screenOf(target, anchorKey, t) {
    if (!target) return null;
    if (target.sx != null) return { x: num(target.sx, 0.5) * W, y: num(target.sy, 0.5) * H };
    var sc = target.sc || target.scene || cur();
    var a = target.anchor;
    if (a) {
      var key = anchorKey || "head", pt = a[key] || a.head;
      if (target.kind === "actor" && key === "feet") pt = { x: a.feet.x, y: a.feet.y - 20 };
      if (!pt) return null;
      return sc.toScreen(pt.x, pt.y);
    }
    if (target.x != null) return sc.toScreen(num(target.x, 0), num(target.y, 500));
    return null;
  }
  // Hand-drawn labelled arrow. Placement happens in flush (scored against what is on screen then).
  function callout(text, target, at, o) {
    o = obj(o);
    var s0 = need();
    text = str(text);
    if (!text) return null;
    at = clamp(num(at, 0.5), 0.1, Math.max(0.2, D - 1.3));
    var until = o.until == null ? null : num(o.until, null);
    var size = u(V.isPortrait ? 42 : 40);
    var lay = layoutText(text, { size: size, maxWidth: u(V.isPortrait ? 330 : 360), maxLines: 2, family: HAND, weight: 700, minSize: size * 0.6, lineHeight: 1.05 });
    var pw = lay.w + u(34), ph = lay.h + u(22);
    var col = o.color || C.white;
    var g0 = svg("g", { class: "dw-callout", display: "none" }, s0.og);
    var arrowO = svg("path", { fill: "none", stroke: C.ink, "stroke-width": f2(u(13)), "stroke-linecap": "round" }, g0);
    var arrowF = svg("path", { fill: "none", stroke: col, "stroke-width": f2(u(6)), "stroke-linecap": "round" }, g0);
    var head = svg("path", { fill: col, stroke: C.ink, "stroke-width": f2(u(4.5)), "stroke-linejoin": "round" }, g0);
    var tag = svg("g", null, g0);
    var R = V.makeRand(hash(text) + 3);
    svg("path", { d: wobPoly([[-pw / 2, -ph / 2], [pw / 2, -ph / 2], [pw / 2, ph / 2], [-pw / 2, ph / 2]], R, u(4)), fill: C.cream, stroke: C.ink, "stroke-width": f2(u(5)), "stroke-linejoin": "round" }, tag);
    writeBlock(tag, lay, 0, 0, { color: C.ink, asc: 0.33 });
    var self = { text: text, at: at, until: until, pos: null, w: pw, h: ph, side: o.side, target: target, anchor: o.anchor, tagRot: (R() - 0.5) * 5 };
    if (o.x != null || o.y != null) self.pos = { x: num(o.x, 0.5) * W, y: num(o.y, 0.3) * H, fixed: true };
    var pc = function () { placeCallout(self); }; pc.t = at; s0.pending.push(pc);
    var lenCache = null;
    onOver(function (t) {
      var p = popEnv(t, at, until, 0.3, 0.22);
      g0.setAttribute("display", p > 0.001 && self.pos ? "inline" : "none");
      if (p <= 0.001 || !self.pos) return;
      var tp = screenOf(target, o.anchor, t) || { x: self.pos.x, y: self.pos.y + u(200) };
      var cx = self.pos.x, cy = self.pos.y;
      tag.setAttribute("transform", "translate(" + P2(cx, cy) + ") rotate(" + f2(self.tagRot) + ") scale(" + f2(p) + ")");
      // arrow from the tag edge to just short of the target
      var dx = tp.x - cx, dy = tp.y - cy, d = Math.sqrt(dx * dx + dy * dy) || 1;
      var ex = Math.abs(dx) / (pw / 2 + 1e-6) > Math.abs(dy) / (ph / 2 + 1e-6) ? pw / 2 / Math.abs(dx) : ph / 2 / Math.abs(dy);
      var sx = cx + dx * Math.min(1, ex) + (dx / d) * u(8), sy = cy + dy * Math.min(1, ex) + (dy / d) * u(8);
      var stopAt = u(26);
      if (target && target.kind === "actor" && (!o.anchor || o.anchor === "head") && target.anchor && target.anchor.r) stopAt += target.anchor.r * (target.sc ? target.sc.toScreen(0, 0).z : 1) * 0.9;
      stopAt = Math.min(stopAt, d * 0.6);
      var tx = tp.x - (dx / d) * stopAt, ty = tp.y - (dy / d) * stopAt;
      var q = EASE.outCubic(prog(t, at + 0.12, at + 0.5));
      var mx = (sx + tx) / 2 - (ty - sy) * 0.18, my = (sy + ty) / 2 + (tx - sx) * 0.18;
      var bx = lerp(lerp(sx, mx, q), lerp(mx, tx, q), q), by = lerp(lerp(sy, my, q), lerp(my, ty, q), q);
      var c1x = lerp(sx, mx, q), c1y = lerp(sy, my, q);
      var dd = "M" + P2(sx, sy) + "Q" + P2(c1x, c1y) + " " + P2(bx, by);
      var vis = Math.sqrt((tx - sx) * (tx - sx) + (ty - sy) * (ty - sy)) > u(24);
      arrowO.setAttribute("d", vis ? dd : ""); arrowF.setAttribute("d", vis ? dd : "");
      var ang = Math.atan2(by - c1y, bx - c1x), hs = u(22);
      head.setAttribute("display", vis && q > 0.2 ? "inline" : "none");
      head.setAttribute("d", "M" + P2(bx + Math.cos(ang) * hs * 0.6, by + Math.sin(ang) * hs * 0.6) + "L" + P2(bx + Math.cos(ang + 2.5) * hs, by + Math.sin(ang + 2.5) * hs) + "L" + P2(bx + Math.cos(ang - 2.5) * hs, by + Math.sin(ang - 2.5) * hs) + "Z");
    });
    self.item = { kind: "callout", label: text, t0: at + 0.3, t1: until, rect: function () { return self.pos ? { x: self.pos.x - pw / 2, y: self.pos.y - ph / 2, w: pw, h: ph } : null; } };
    s0.items.push(self.item);
    return self;
  }
  function placeCallout(self) {
    if (self.pos && self.pos.fixed) return;
    var t = self.at + 0.35, sr = safeRect();
    frame(t);
    var tp = screenOf(self.target, self.anchor, t) || { x: W / 2, y: H / 2 };
    var boxes = boxesAt(t, self.item).filter(function (b) { return b.kind !== "face" || true; });
    // the target's own face must not be covered either; also avoid all faces and bodies at that time
    var bodies = [];
    st.scenes.forEach(function (sc) { sc.actors.concat(sc.critters).forEach(function (a) { if (a.anchor && a.anchor.visible && a.screenBox) bodies.push(a.screenBox()); }); });
    var best = null, dist = u(V.isPortrait ? 230 : 250);
    var cands = [];
    for (var i = 0; i < 16; i++) {
      var a = (i / 16) * TAU;
      for (var k = 0; k < 3; k++) {
        var rr = dist * (0.55 + k * 0.4) + Math.abs(Math.cos(a)) * self.w / 2 + Math.abs(Math.sin(a)) * self.h / 2;
        cands.push({ x: tp.x + Math.cos(a) * rr, y: tp.y + Math.sin(a) * rr, a: a, k: k });
      }
    }
    cands.forEach(function (c) {
      var r = { x: c.x - self.w / 2, y: c.y - self.h / 2, w: self.w, h: self.h };
      var sc = 0;
      var inX = Math.max(0, sr.x - r.x) + Math.max(0, r.x + r.w - (sr.x + sr.w)), inY = Math.max(0, sr.y - r.y) + Math.max(0, r.y + r.h - (sr.y + sr.h));
      sc += (inX + inY) * 60;
      boxes.forEach(function (b) { var ov = overlapArea(r, { x: b.x - u(12), y: b.y - u(12), w: b.w + u(24), h: b.h + u(24) }); sc += ov * (b.kind === "face" ? 4 : b.kind === "headline" ? 5 : 3); });
      bodies.forEach(function (b) { sc += overlapArea(r, b) * 1.2; });
      sc += c.k * self.w * self.h * 0.08;
      if (self.side === "left" && c.x > tp.x) sc += self.w * self.h * 0.5;
      if (self.side === "right" && c.x < tp.x) sc += self.w * self.h * 0.5;
      if (self.side === "top" && c.y > tp.y) sc += self.w * self.h * 0.5;
      if (c.y > tp.y + u(40)) sc += self.w * self.h * 0.12;
      if (!best || sc < best.s) best = { s: sc, x: c.x, y: c.y };
    });
    self.pos = { x: clamp(best.x, sr.x + self.w / 2, sr.x + sr.w - self.w / 2), y: clamp(best.y, sr.y + self.h / 2, sr.y + sr.h - self.h / 2) };
  }

  // Thermometer and friends (screen space).
  function indicator(kind, at, o) {
    o = obj(o);
    var s0 = need(), sr = safeRect();
    kind = pick(["hot", "cold", "sun", "snowflake", "steam", "clock"], kind, "hot");
    at = clamp(num(at, 0.4), 0, Math.max(0.2, D - 1.2));
    var until = o.until == null ? null : num(o.until, null);
    var sz = num(o.size, 1) * u(V.isPortrait ? 1.0 : 0.95);
    var cx = (o.x != null ? num(o.x, 0.87) : V.isPortrait ? 0.86 : 0.87) * W, cy = (o.y != null ? num(o.y, 0.45) : V.isPortrait ? 0.4 : 0.42) * H;
    var g0 = svg("g", { class: "dw-indicator", display: "none" }, s0.og), g = svg("g", null, g0);
    var level = clamp(num(o.level, kind === "cold" ? 0.14 : 0.92), 0, 1), levels = [{ at: at + 0.15, v: level, dur: 0.9 }];
    var parts = {}, hgt = 260, R = V.makeRand(hash(kind) + 9);
    if (kind === "hot" || kind === "cold") {
      var colr = kind === "hot" ? C.red : "#4F9FE0";
      svg("path", { d: rrD(-26, -hgt / 2, 52, hgt - 30, 26), fill: C.white, stroke: C.ink, "stroke-width": 7 }, g);
      svg("circle", { cx: 0, cy: hgt / 2 - 20, r: 44, fill: colr, stroke: C.ink, "stroke-width": 7 }, g);
      parts.fill = svg("rect", { x: -13, width: 26, rx: 12, fill: colr }, g);
      svg("rect", { x: -13, y: hgt / 2 - 60, width: 26, height: 40, fill: colr }, g);
      for (var tk = 0; tk < 5; tk++) svg("path", { d: "M14 " + f2(-hgt / 2 + 30 + tk * 40) + "h12", stroke: C.ink, "stroke-width": 4 }, g);
      svg("circle", { cx: -12, cy: hgt / 2 - 34, r: 10, fill: rgba("#FFFFFF", 0.5) }, g);
      if (kind === "hot") parts.waves = [0, 1, 2].map(function (i) { return svg("path", { fill: "none", stroke: rgba(C.red, 0.8), "stroke-width": 5, "stroke-linecap": "round" }, g); });
      else parts.flakes = [0, 1].map(function (i) { var fg = svg("g", null, g); snowflakeG(fg, 22); return fg; });
    } else if (kind === "sun") {
      parts.rays = svg("g", null, g);
      for (var r2 = 0; r2 < 12; r2++) { var a = (r2 / 12) * TAU; svg("path", { d: "M" + P2(Math.cos(a) * 80, Math.sin(a) * 80) + "L" + P2(Math.cos(a) * 118, Math.sin(a) * 118), stroke: C.ink, "stroke-width": 15, "stroke-linecap": "round" }, parts.rays); svg("path", { d: "M" + P2(Math.cos(a) * 80, Math.sin(a) * 80) + "L" + P2(Math.cos(a) * 118, Math.sin(a) * 118), stroke: C.orange, "stroke-width": 8, "stroke-linecap": "round" }, parts.rays); }
      svg("circle", { r: 70, fill: C.yellow, stroke: C.ink, "stroke-width": 7 }, g);
      svg("path", { d: "M-26 -10q8 -10 16 0M10 -10q8 -10 16 0M-24 20q24 18 48 0", fill: "none", stroke: C.ink, "stroke-width": 6, "stroke-linecap": "round" }, g);
      hgt = 240;
    } else if (kind === "snowflake") { parts.rot = svg("g", null, g); snowflakeG(parts.rot, 100); hgt = 220; }
    else if (kind === "steam") { parts.steam = [0, 1, 2].map(function (i) { return svg("path", { fill: "none", stroke: C.white, "stroke-width": 12, "stroke-linecap": "round", opacity: 0.9 }, g); }); parts.steamO = parts.steam.map(function (e) { var o2 = e.cloneNode(); o2.setAttribute("stroke", C.ink); o2.setAttribute("stroke-width", 19); g.insertBefore(o2, e); return o2; }); hgt = 240; }
    else if (kind === "clock") {
      svg("circle", { r: 96, fill: C.cream, stroke: C.ink, "stroke-width": 8 }, g);
      for (var c2 = 0; c2 < 12; c2++) { var a2 = (c2 / 12) * TAU; svg("path", { d: "M" + P2(Math.cos(a2) * 76, Math.sin(a2) * 76) + "L" + P2(Math.cos(a2) * 86, Math.sin(a2) * 86), stroke: C.ink, "stroke-width": 5 }, g); }
      parts.hh = svg("path", { d: "M0 6V-50", stroke: C.ink, "stroke-width": 10, "stroke-linecap": "round" }, g);
      parts.mh = svg("path", { d: "M0 8V-74", stroke: C.red, "stroke-width": 6, "stroke-linecap": "round" }, g);
      svg("circle", { r: 9, fill: C.ink }, g);
      hgt = 220;
    }
    var lab = str(o.label), labG = null, labLay = null;
    if (lab) {
      labLay = layoutText(lab, { size: 46, maxWidth: 260, maxLines: 1, family: HFONT, upper: true });
      labG = svg("g", { transform: "translate(0 " + f2(hgt / 2 + 54) + ")" }, g);
      writeBlock(labG, labLay, 0, 0, { color: kind === "cold" || kind === "snowflake" ? "#BFE6FF" : C.yellow, stroke: C.ink, strokeW: 12 });
    }
    var speed = num(o.speed, 1);
    var self = {
      g: g0, kind: kind,
      setLevel: function (v, at2, dur) { levels.push({ at: num(at2, 0), v: clamp(num(v, 0.5), 0, 1), dur: num(dur, 0.8) }); levels.sort(function (a3, b3) { return a3.at - b3.at; }); return self; },
    };
    onOver(function (t) {
      var p = popEnv(t, at, until, 0.32, 0.25);
      g0.setAttribute("display", p > 0.001 ? "inline" : "none");
      if (p <= 0.001) return;
      g0.setAttribute("transform", "translate(" + P2(cx, cy) + ") scale(" + f2(sz * p) + ") rotate(" + f2(Math.sin(t * 1.9) * 1.5) + ")");
      if (parts.fill) {
        var lv = 0;
        levels.forEach(function (k) { if (t >= k.at) lv = lerp(lv, k.v, EASE.outCubic(prog(t, k.at, k.at + k.dur))); });
        lv += Math.sin(t * 5) * 0.01;
        var top = -hgt / 2 + 14 + (hgt - 80) * (1 - lv), bot = hgt / 2 - 40;
        parts.fill.setAttribute("y", f2(top)); parts.fill.setAttribute("height", f2(Math.max(0, bot - top)));
      }
      if (parts.waves) parts.waves.forEach(function (e, i) { var ph2 = t * 3 * speed + i * 2.1, x0 = 50 + i * 26, y0 = -40 - mod(t * 40 * speed + i * 30, 60); e.setAttribute("d", "M" + P2(x0, y0 + 40) + "q8 -10 0 -20t0 -20"); e.setAttribute("opacity", f2(0.4 + 0.4 * Math.sin(ph2))); });
      if (parts.flakes) parts.flakes.forEach(function (e, i) { e.setAttribute("transform", "translate(" + P2(56 + i * 10, -hgt / 2 + 40 + i * 70 + Math.sin(t * 2 + i) * 6) + ") rotate(" + f2(t * 40 * speed) + ")"); });
      if (parts.rays) parts.rays.setAttribute("transform", "rotate(" + f2(t * 25 * speed) + ") scale(" + f2(1 + 0.05 * Math.sin(t * 4)) + ")");
      if (parts.rot) parts.rot.setAttribute("transform", "rotate(" + f2(t * 30 * speed) + ")");
      if (parts.steam) parts.steam.forEach(function (e, i) { var y0 = 80 - mod(t * 60 * speed + i * 50, 150), d = "M" + P2(-40 + i * 40, y0) + "q16 -20 0 -40t0 -40"; e.setAttribute("d", d); parts.steamO[i].setAttribute("d", d); var op = f2(Math.sin(prog(y0, 80, -70) * PI)); e.setAttribute("opacity", op); parts.steamO[i].setAttribute("opacity", op); });
      if (parts.hh) { parts.hh.setAttribute("transform", "rotate(" + f2(t * 30 * speed) + ")"); parts.mh.setAttribute("transform", "rotate(" + f2(t * 360 * speed) + ")"); }
    });
    var hw = (kind === "hot" || kind === "cold" ? 70 : 125) * sz, bt = (hgt / 2 + (lab ? 90 : 0)) * sz;
    item("indicator", kind + " " + lab, at + 0.3, until, function () { return { x: cx - Math.max(hw, labLay ? (labLay.w / 2 + 14) * sz : 0), y: cy - (hgt / 2 + 10) * sz, w: Math.max(hw, labLay ? (labLay.w / 2 + 14) * sz : 0) * 2, h: (hgt / 2 + 10) * sz + bt }; });
    return self;
  }
  function snowflakeG(g, r) {
    for (var i = 0; i < 6; i++) {
      var a = (i / 6) * TAU, x = Math.cos(a) * r, y = Math.sin(a) * r;
      [C.ink, "#BFE6FF"].forEach(function (c, j) {
        svg("path", { d: "M0 0L" + P2(x, y) + "M" + P2(x * 0.6, y * 0.6) + "L" + P2(x * 0.6 + Math.cos(a + 0.8) * r * 0.3, y * 0.6 + Math.sin(a + 0.8) * r * 0.3) + "M" + P2(x * 0.6, y * 0.6) + "L" + P2(x * 0.6 + Math.cos(a - 0.8) * r * 0.3, y * 0.6 + Math.sin(a - 0.8) * r * 0.3), stroke: c, "stroke-width": j ? Math.max(3, r * 0.09) : Math.max(7, r * 0.18), "stroke-linecap": "round", fill: "none" }, g);
      });
    }
  }

  // Big YEAR counter.
  function fmtYear(v, format, anyBC) {
    var n = Math.round(v), s = V.format(Math.abs(n), 0, true);
    if (format === "bc") return n < 0 ? s + " BC" : anyBC ? s + " AD" : s;
    if (format === "ago") return s + " YEARS AGO";
    return (n < 0 ? "-" : "") + s;
  }
  function yearCounter(o) {
    o = obj(o);
    var s0 = need(), sr = safeRect();
    var format = pick(["plain", "bc", "ago"], o.format, "plain");
    var from = num(o.from, 0), to = num(o.to, from), at = num(o.at, 0.3), dur = num(o.dur, 1.2), until = o.until == null ? null : num(o.until, null);
    var stops = arr(o.stops).map(function (s) { s = obj(s); return { at: num(s.at, null), value: num(s.value, null) }; }).filter(function (s) { return s.at != null && s.value != null; }).sort(function (a, b) { return a.at - b.at; });
    if (!stops.length && to !== from) stops = [{ at: at + dur, value: to, dur: dur }];
    var anyBC = from < 0 || stops.some(function (s) { return s.value < 0; });
    var label = o.label == null ? (format === "ago" ? "" : "YEAR") : str(o.label);
    var cx = (o.x != null ? num(o.x, 0.5) : 0.5) * W, cy = (o.y != null ? num(o.y, 0.2) : V.isPortrait ? 0.2 : 0.19) * H;
    var vals = [from].concat(stops.map(function (s) { return s.value; }));
    var longest = "";
    vals.forEach(function (v) { var s = fmtYear(v, format, anyBC); if (s.length > longest.length) longest = s; });
    var maxW = o.maxWidth ? num(o.maxWidth, 0.6) * W : sr.w * (V.isPortrait ? 0.92 : 0.5);
    var size = u(V.isPortrait ? 112 : 104);
    var lw = textW(longest, size, HFONT);
    if (lw > maxW) size *= maxW / lw;
    var g0 = svg("g", { class: "dw-counter", display: "none" }, s0.og), g = svg("g", null, g0);
    var lab = null, labH = 0;
    if (label) { var ll = layoutText(label, { size: size * 0.36, maxWidth: maxW, maxLines: 1, upper: true, family: HFONT }); labH = ll.h + size * 0.08; lab = writeBlock(g, ll, 0, -size * 0.5 - ll.h / 2, { color: C.yellow, stroke: C.ink, strokeW: ll.size * 0.24, track: 0.08 }); }
    var numSh = svg("text", { x: 0, y: f2(size * 0.36 + size * 0.07), "text-anchor": "middle", "font-family": HFONT, "font-size": f2(size), fill: C.ink, stroke: C.ink, "stroke-width": f2(size * 0.2), "stroke-linejoin": "round", "paint-order": "stroke fill" }, g);
    var numT = svg("text", { x: 0, y: f2(size * 0.36), "text-anchor": "middle", "font-family": HFONT, "font-size": f2(size), fill: C.white, stroke: C.ink, "stroke-width": f2(size * 0.15), "stroke-linejoin": "round", "paint-order": "stroke fill" }, g);
    function valueAt(t) {
      var v = from;
      for (var i = 0; i < stops.length; i++) {
        var s = stops[i], a0 = s.at - (s.dur ? s.dur : 0.1), b0 = s.at + (s.dur ? 0 : 0.6);
        if (t < a0) break;
        var p = EASE.outCubic(prog(t, a0, b0)), a = v, b = s.value;
        if (a !== 0 && b !== 0 && a * b > 0 && Math.abs(b / a) > 30) v = (a < 0 ? -1 : 1) * Math.exp(lerp(Math.log(Math.abs(a)), Math.log(Math.abs(b)), p));
        else v = lerp(a, b, p);
        if (p >= 1) v = b;
      }
      return v;
    }
    var lastS = null;
    onOver(function (t) {
      var p = popEnv(t, at, until, 0.32, 0.25);
      g0.setAttribute("display", p > 0.001 ? "inline" : "none");
      if (p <= 0.001) return;
      var v = valueAt(t), s = fmtYear(v, format, anyBC);
      if (s !== lastS) { numT.textContent = s; numSh.textContent = s; lastS = s; }
      var kick = 0;
      stops.forEach(function (st2) { if (t >= st2.at && t < st2.at + 0.9) kick = Math.max(kick, Math.sin(prog(t, st2.at + (st2.dur ? 0 : 0.6), st2.at + (st2.dur ? 0 : 0.6) + 0.3) * PI) * 0.08); });
      g0.setAttribute("transform", "translate(" + P2(cx, cy) + ") scale(" + f2(p * (1 + kick)) + ")");
    });
    var bw = textW(longest, size, HFONT) + size * 0.3;
    item("counter", "year", at + 0.3, until, function () { return { x: cx - bw / 2, y: cy - size * 0.5 - labH - size * 0.1, w: bw, h: size * 1.05 + labH }; });
    return { g: g0, valueAt: valueAt, size: size, box: { x: cx - bw / 2, y: cy - size * 0.5 - labH, w: bw, h: size + labH } };
  }

  // Doodle speech / thought / shout bubble following the head; words appear as spoken.
  function bubble(actor, text, from, to, o) {
    o = obj(o);
    var s0 = need();
    text = str(text);
    if (!actor || !text) return null;
    var kind = pick(["speech", "thought", "shout"], o.kind, "speech");
    from = clamp(num(from, 0.3), 0, Math.max(0.1, D - 0.8));
    var toks = parseEm(text, false), wt = wordTimes(toks.map(function (k) { return k.t; }), from);
    var spokenEnd = wt.length ? wt[wt.length - 1].e : from + 1;
    to = to == null ? spokenEnd + num(o.hold, 0.6) : num(to, spokenEnd + 0.6);
    if (to >= D - 1.0) to = D + 1;
    if (kind === "speech" || kind === "shout") actor.say && actor.say(from, Math.min(spokenEnd, D));
    var size = u(V.isPortrait ? 44 : 40) * (kind === "shout" ? 1.12 : 1);
    var maxW = o.maxWidth ? num(o.maxWidth, 0.4) * W : u(V.isPortrait ? 460 : 420);
    var lay = layoutText(text, { size: size, maxWidth: maxW, maxLines: 4, family: kind === "shout" ? HFONT : HAND, weight: kind === "shout" ? 400 : 700, upper: kind === "shout", minSize: size * 0.6, lineHeight: 1.1 });
    var pw = lay.w + u(52), ph = lay.h + u(40);
    var g0 = svg("g", { class: "dw-bubble", display: "none" }, s0.og);
    var tail = svg("path", { fill: C.white, stroke: C.ink, "stroke-width": f2(u(5)), "stroke-linejoin": "round" }, g0);
    var body = svg("g", null, g0);
    var R = V.makeRand(hash(text) + 17);
    if (kind === "thought") {
      var pts = [];
      for (var i = 0; i < 14; i++) { var a = (i / 14) * TAU; pts.push([Math.cos(a) * (pw / 2 + u(10)), Math.sin(a) * (ph / 2 + u(10))]); }
      pts.forEach(function (q, j) { svg("circle", { cx: f2(q[0]), cy: f2(q[1]), r: f2(u(26) + R() * u(8)), fill: C.white, stroke: C.ink, "stroke-width": f2(u(5)) }, body); });
      svg("path", { d: ellD(0, 0, pw / 2 + u(6), ph / 2 + u(6)), fill: C.white }, body);
    } else if (kind === "shout") {
      var sp = [];
      for (var s = 0; s < 22; s++) { var a2 = (s / 22) * TAU, rr = s % 2 ? 1.0 : 1.22; sp.push([Math.cos(a2) * (pw / 2 + u(14)) * rr, Math.sin(a2) * (ph / 2 + u(14)) * rr]); }
      svg("path", { d: polyD(sp), fill: C.yellow, stroke: C.ink, "stroke-width": f2(u(5.5)), "stroke-linejoin": "round" }, body);
    } else svg("path", { d: rrD(-pw / 2 - u(8), -ph / 2 - u(4), pw + u(16), ph + u(8), Math.min((ph + u(8)) / 2, u(46))), fill: C.white, stroke: C.ink, "stroke-width": f2(u(5.5)) }, body);
    var wb = writeBlock(body, lay, 0, 0, { color: C.ink, asc: 0.33 });
    var self = { actor: actor, text: text, from: from, to: to, w: pw * 1.1 + u(10), h: ph * 1.15 + u(10), off: null, side: o.side, kind: kind, pos: null };
    var pb = function () { placeBubble(self); }; pb.t = from; s0.pending.push(pb);
    var dots = kind === "thought" ? [0, 1, 2].map(function (i) { return svg("circle", { r: f2(u(9 - i * 2.5)), fill: C.white, stroke: C.ink, "stroke-width": f2(u(4)) }, g0); }) : [];
    onOver(function (t) {
      var p = popEnv(t, from - 0.05, to, 0.28, 0.2);
      g0.setAttribute("display", p > 0.001 && self.off ? "inline" : "none");
      if (p <= 0.001 || !self.off) return;
      var hp = screenOf(actor, "head", t) || { x: W / 2, y: H / 2 };
      var cx = hp.x + self.off.x, cy = hp.y + self.off.y;
      self.pos = { x: cx, y: cy };
      body.setAttribute("transform", "translate(" + P2(cx, cy) + ") scale(" + f2(p) + ")");
      wb.spans.forEach(function (spn, i) { spn.setAttribute("opacity", t >= wt[i].s - 0.04 || kind === "thought" ? 1 : 0.0); });
      var hr2 = (actor.anchor && actor.anchor.r ? actor.anchor.r : 60) * (actor.sc ? actor.sc.toScreen(0, 0).z : 1);
      var hx0 = cx - hp.x, hy0 = cy - hp.y, hd0 = Math.sqrt(hx0 * hx0 + hy0 * hy0) || 1;
      var mp = { x: hp.x + (hx0 / hd0) * hr2 * 1.12, y: hp.y + (hy0 / hd0) * hr2 * 1.12 };
      var dx = mp.x - cx, dy = mp.y - cy, d = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / d, ny = dx / d;
      var bw2 = u(20) * p;
      var ex = cx + dx * 0.5 * p, ey = cy + dy * 0.5 * p;
      var tipX = cx + dx * p, tipY = cy + dy * p;
      if (kind === "thought") {
        tail.setAttribute("d", "");
        dots.forEach(function (c, i) { var q = 0.55 + i * 0.14; c.setAttribute("cx", f2(cx + dx * q * p)); c.setAttribute("cy", f2(cy + dy * q * p)); });
      } else tail.setAttribute("d", "M" + P2(cx + nx * bw2, cy + ny * bw2) + "Q" + P2(ex + nx * bw2 * 0.4, ey + ny * bw2 * 0.4) + " " + P2(tipX, tipY) + "Q" + P2(ex - nx * bw2 * 0.2, ey - ny * bw2 * 0.2) + " " + P2(cx - nx * bw2, cy - ny * bw2) + "Z");
    });
    self.item = { kind: "bubble", label: text, t0: from + 0.3, t1: to, rect: function () { return self.pos ? { x: self.pos.x - pw / 2 - u(6), y: self.pos.y - ph / 2 - u(6), w: pw + u(12), h: ph + u(12) } : null; } };
    s0.items.push(self.item);
    return self;
  }
  function placeBubble(self) {
    var t = self.from + 0.3, sr = safeRect();
    frame(t);
    var hp = screenOf(self.actor, "head", t) || { x: W / 2, y: H / 2 }, a = self.actor.anchor || {};
    var rr = (a.r || 60) * (self.actor.sc ? self.actor.sc.toScreen(0, 0).z : 1);
    var boxes = boxesAt(t, self.item), bodies = [];
    st.scenes.forEach(function (sc) { sc.actors.concat(sc.critters).forEach(function (ac) { if (ac.anchor && ac.anchor.visible && ac.screenBox) bodies.push(ac.screenBox()); }); });
    var best = null;
    for (var i = 0; i < 18; i++) {
      var ang = -PI + (i / 17) * PI; // upper half circle
      for (var k = 0; k < 3; k++) {
        var dist = rr + self.h * 0.5 + u(30) + k * u(60);
        var cx = hp.x + Math.cos(ang) * (dist + self.w * 0.3), cy = hp.y + Math.sin(ang) * dist;
        var r = { x: cx - self.w / 2, y: cy - self.h / 2, w: self.w, h: self.h };
        var s = 0;
        var inX = Math.max(0, sr.x - r.x) + Math.max(0, r.x + r.w - (sr.x + sr.w)), inY = Math.max(0, sr.y - r.y) + Math.max(0, r.y + r.h - (sr.y + sr.h));
        s += (inX + inY) * 80;
        boxes.forEach(function (b) { s += overlapArea(r, { x: b.x - u(10), y: b.y - u(10), w: b.w + u(20), h: b.h + u(20) }) * (b.kind === "face" ? 6 : 4); });
        bodies.forEach(function (b) { s += overlapArea(r, b) * 0.6; });
        s += Math.abs(Math.cos(ang)) * self.w * self.h * 0.05 + k * self.w * self.h * 0.05;
        if (self.side === "left" && cx > hp.x) s += self.w * self.h * 0.3;
        if (self.side === "right" && cx < hp.x) s += self.w * self.h * 0.3;
        if (!best || s < best.s) best = { s: s, x: cx, y: cy };
      }
    }
    var x = clamp(best.x, sr.x + self.w / 2, sr.x + sr.w - self.w / 2), y = clamp(best.y, sr.y + self.h / 2, sr.y + sr.h - self.h / 2);
    self.off = { x: x - hp.x, y: y - hp.y };
    self.pos = { x: x, y: y };
  }
  function thought(actor, text, from, to, o) { return bubble(actor, text, from, to, Object.assign({}, obj(o), { kind: "thought" })); }
  // Dialogue: bubbles on exact lines, lip sync, listeners look and react.
  function dialogue(actors, list) {
    actors = arr(actors).filter(Boolean);
    list = arr(list).map(obj).filter(function (l) { return str(l.text); });
    if (!actors.length || !list.length) return [];
    var win = lines(list.map(function (l) { return l.text; }));
    for (var i = 1; i < win.length; i++) if (win[i].start < win[i - 1].start + 0.4) win[i].start = win[i - 1].start + 0.4;
    list.forEach(function (l, i) {
      var sp = actors[clamp(Math.floor(num(l.speaker, 0)), 0, actors.length - 1)], w2 = win[i];
      var next = i + 1 < win.length ? win[i + 1].start - 0.08 : null;
      var to = next == null ? null : Math.max(w2.end + 0.25, next);
      if (next != null) to = Math.min(to, next);
      bubble(sp, l.text, w2.start, to, { kind: l.kind });
      if (l.expression) sp.expression(l.expression, w2.start);
      if (l.pose) sp.pose(l.pose, w2.start - 0.1);
      else if (sp.pose) sp.pose(i % 2 ? "explain" : "talk", w2.start - 0.1);
      if (l.mark) sp.mark(l.mark, w2.start + 0.2, 1.4);
      actors.forEach(function (a) {
        if (a === sp) return;
        a.lookAt && a.lookAt(sp, w2.start + 0.1);
        if (l.reaction) a.expression(l.reaction, w2.start + 0.3);
      });
      sp.lookAt && sp.lookAt(actors.length > 1 ? actors[(actors.indexOf(sp) + 1) % actors.length] : "camera", w2.start);
    });
    return win;
  }
  function narrate(actor, from, to) {
    if (!actor || !actor.say) return;
    from = num(from, 0); to = num(to, D);
    var ws = V.words.filter(function (w2) { return w2.start >= from - 0.01 && w2.start < to; });
    if (!ws.length) { actor.say(from + 0.2, Math.min(to, D - 0.8)); return; }
    var a = ws[0].start, b = ws[0].end;
    for (var i = 1; i < ws.length; i++) {
      if (ws[i].start - b > 0.35) { actor.say(a, b); a = ws[i].start; }
      b = ws[i].end;
    }
    actor.say(a, b);
  }

  // ------------------------- era icons -------------------------
  var ICONS = ["cave", "pyramid", "column", "castle", "house", "city", "rocket", "sun", "star", "skull", "mammoth", "wheel", "fire"];
  function drawEraIcon(n, g, R) {
    var I = 6;
    function Pt(d, fill, w) { return svg("path", { d: d, fill: fill || "none", stroke: C.ink, "stroke-width": w || I, "stroke-linejoin": "round", "stroke-linecap": "round" }, g); }
    n = pick(ICONS, n, "star");
    switch (n) {
      case "cave": Pt("M-60 40Q-60 -50 0 -54Q60 -50 60 40Z", "#8C867C"); Pt("M-26 40Q-26 -10 0 -12Q26 -10 26 40Z", "#2B1A12"); break;
      case "pyramid": Pt("M-62 40L0 -56L62 40Z", "#E0A858"); Pt("M0 -56L62 40H18Z", "#C08840"); break;
      case "column": Pt("M-40 40H40V28H-40Z", "#EDE6D6"); Pt("M-24 28V-36H24V28Z", "#F4F0E6"); Pt("M-8 20V-30M8 20V-30", null, 3); Pt("M-40 -36H40V-52H-40Z", "#EDE6D6"); break;
      case "castle": Pt("M-50 40V-30H-30V-46H-14V-30H14V-46H30V-30H50V40Z", "#B8AE9A"); Pt("M-14 40V10Q0 -6 14 10V40Z", "#4A3020"); break;
      case "house": Pt("M-44 40V-10H44V40Z", "#E8C89A"); Pt("M-56 -6L0 -50L56 -6Z", "#B5483A"); Pt("M-12 40V12H12V40Z", "#6A4422", 4); break;
      case "city": Pt("M-56 40V-20H-26V40Z", "#8FA6B8"); Pt("M-26 40V-56H8V40Z", "#C98A6A"); Pt("M8 40V-30H54V40Z", "#8FA6B8"); for (var i = 0; i < 4; i++) svg("rect", { x: -18, y: -44 + i * 20, width: 8, height: 9, fill: "#FFE08A" }, g); break;
      case "rocket": Pt("M0 -60Q30 -30 22 30H-22Q-30 -30 0 -60Z", "#EDEDF2"); Pt(circD(0, -16, 10), "#7FD0F0", 4); Pt("M-22 10L-40 36H-22M22 10L40 36H22", "#E8392B", 5); Pt("M-12 30L0 56L12 30Z", "#FF8A1E", 4); break;
      case "sun": for (var r = 0; r < 10; r++) { var a = (r / 10) * TAU; Pt("M" + P2(Math.cos(a) * 36, Math.sin(a) * 36) + "L" + P2(Math.cos(a) * 54, Math.sin(a) * 54), null, 7); } Pt(circD(0, 0, 30), "#FF6A2A"); break;
      case "star": Pt(polyD([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (i) { var a = -PI / 2 + (i * PI) / 5, rr = i % 2 ? 24 : 56; return [Math.cos(a) * rr, Math.sin(a) * rr]; })), C.yellow); break;
      case "skull": Pt("M-40 0Q-44 -52 0 -54Q44 -52 40 0Q36 14 24 18V36H-24V18Q-36 14 -40 0Z", "#F4EEDC"); Pt(circD(-16, -12, 11), C.ink, 3); Pt(circD(16, -12, 11), C.ink, 3); Pt("M-8 30V20M8 30V20", null, 4); break;
      case "mammoth": Pt(wobEll(-6, -6, 50, 34, R || V.makeRand(3), 0.04, 10), "#8B5A3C"); Pt(circD(36, -16, 22), "#8B5A3C"); Pt("M48 -4Q62 20 50 40", null, 10); Pt("M-40 20V40M-14 22V40M10 22V40", null, 9); Pt("M40 4Q60 6 64 -10", null, 5).setAttribute("stroke", "#F4EEDC"); break;
      case "wheel": Pt(circD(0, 0, 50), "#A8744A"); Pt(circD(0, 0, 12), "#7A4A22"); for (var s = 0; s < 6; s++) { var a2 = (s / 6) * TAU; Pt("M" + P2(Math.cos(a2) * 12, Math.sin(a2) * 12) + "L" + P2(Math.cos(a2) * 48, Math.sin(a2) * 48), null, 6); } break;
      case "fire": Pt("M-30 40Q-50 0 -10 -30Q-14 -6 0 -2Q-6 -40 20 -60Q14 -20 40 0Q48 30 30 40Z", "#FF8A1E"); Pt("M-12 40Q-20 16 4 0Q10 20 18 22Q24 36 14 40Z", "#FFD84A", 4); break;
    }
  }
  function eraIcon(name, px) {
    var tmp = svg("g");
    drawEraIcon(name, tmp, V.makeRand(hash(name)));
    px = num(px, 64);
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + px + '" height="' + px + '" viewBox="-70 -70 140 140">' + new XMLSerializer().serializeToString(tmp) + "</svg>";
  }

  // ------------------------- paper-card diagram -------------------------
  var DIAGRAMS = ["house-cooling", "pyramid", "hut", "well", "boat", "firepit", "body", "tree", "generic"];
  // Each returns [{ d, fill?, w? }] in a 0..1000 x 0..700 box (x right, y down).
  function diagramParts(kind) {
    var B = "#C9925A", Wl = "#7FC8F0", P = [];
    function add(d, fill, w, col) { P.push({ d: d, fill: fill, w: w, col: col }); }
    switch (kind) {
      case "house-cooling":
        add("M40 650H960", null, 8);
        add("M150 650V300H850V650", "#E8D2A8", 10);
        add("M150 300H850", null, 12);
        add("M480 300V60H640V300", "#DCC096", 10);
        add("M480 60L560 20L640 60", null, 8);
        add("M150 650V300H210V650ZM790 650V300H850V650Z", "#C9A06A", 6);
        add("M230 600H770V640H230Z", "#B8865A", 5);
        add("M560 520Q520 520 520 560Q520 600 560 600Q600 600 600 560Q600 520 560 520Z", "#C9744A", 6);
        break;
      case "pyramid":
        add("M40 660H960", null, 8);
        add("M80 660L500 80L920 660Z", "#F0C27A", 10);
        add("M420 400H580V470H420Z", "#E8DCC4", 7);
        add("M330 560H450V610H330Z", "#E8DCC4", 7);
        add("M260 660L430 470M430 470L470 400", null, 6);
        add("M180 520L330 590", null, 6);
        add("M500 400L500 220", null, 4);
        break;
      case "hut":
        add("M40 660H960", null, 8);
        add("M220 660V380H780V660", "#E2C08A", 10);
        add("M160 400L500 90L840 400Z", "#B8904A", 10);
        add("M470 120H530", null, 10);
        add("M440 660Q500 560 560 660Z", "#FF8A1E", 6);
        add("M500 560Q470 420 510 300Q540 200 500 110", null, 5, "#9A928A");
        break;
      case "well":
        add("M40 300H960", null, 8);
        add("M40 300H380V680H40ZM620 300H960V680H620Z", "#C9A06A", 4);
        add("M380 300V680M620 300V680", null, 10);
        add("M380 600H620V680H380Z", Wl, 6);
        add("M330 300V100M670 300V100M300 100H700", null, 10);
        add("M500 100V520", null, 4);
        add("M460 520H540L530 580H470Z", "#9A6A3A", 6);
        break;
      case "boat":
        add("M40 520Q160 490 280 520T520 520T760 520T1000 520", null, 6, "#4F9FE0");
        add("M140 440H860Q800 600 500 600Q200 600 140 440Z", "#A8744A", 10);
        add("M500 440V60", null, 10);
        add("M510 80Q760 200 510 400Z", "#F4F0E6", 8);
        add("M260 470L180 620M380 480L330 640", null, 6);
        break;
      case "firepit":
        add("M40 420H360Q500 640 640 420H960", null, 8);
        add("M360 420Q500 640 640 420Z", "#8A6A4A", 6);
        add("M330 420Q350 390 380 410M600 410Q640 380 670 420", "#9A948A", 6);
        add("M420 520L580 470M420 470L580 520", null, 14, "#7A4A22");
        add("M440 470Q420 360 480 300Q480 360 510 350Q500 260 560 210Q560 320 600 350Q600 430 560 470Z", "#FF8A1E", 6);
        break;
      case "body":
        add("M500 70Q560 70 560 140Q560 210 500 210Q440 210 440 140Q440 70 500 70Z", "#F0C9A6", 8);
        add("M420 240H580L600 470H400Z", "#E8743B", 8);
        add("M420 260L320 430M580 260L680 430", null, 14);
        add("M440 470L420 660M560 470L580 660", null, 16);
        break;
      case "tree":
        add("M40 420H960", null, 8);
        add("M470 420V200H530V420Z", "#8A5A2A", 8);
        add("M500 60Q690 60 700 190Q700 300 500 300Q300 300 300 190Q310 60 500 60Z", "#6E9A3A", 8);
        add("M500 420Q440 520 340 560M500 420Q520 540 480 650M500 420Q580 520 680 570", null, 7, "#8A5A2A");
        add("M800 120Q800 80 840 80Q880 80 880 120Q880 160 840 160Q800 160 800 120Z", C.yellow, 6);
        break;
      default:
        add("M80 200H340V500H80ZM380 200H620V500H380ZM660 200H920V500H660Z", "#F4E8C8", 8);
        add("M340 350H380M620 350H660", null, 8);
    }
    return P;
  }
  function diagram(kind, o) {
    o = obj(o);
    var s0 = need(), sr = safeRect();
    kind = pick(DIAGRAMS, kind, "generic");
    var at = clamp(num(o.at, 0.3), 0, Math.max(0.2, D - 2));
    var x = o.x != null ? num(o.x, 0) * W : sr.x, y = o.y != null ? num(o.y, 0) * H : sr.y + u(10);
    var w = o.w != null ? num(o.w, 0.5) * W : sr.w * (V.isPortrait ? 1 : 0.6), h = o.h != null ? num(o.h, 0.6) * H : V.isPortrait ? sr.h * 0.52 : sr.h - u(20);
    var title = str(o.title);
    var g0 = svg("g", { class: "dw-diagram", display: "none" }, s0.og);
    var card = svg("g", null, g0);
    var R = V.makeRand(hash(kind) + 21);
    svg("path", { d: rrD(u(10), u(12), w, h, u(18)), fill: rgba(C.ink, 0.35) }, card);
    svg("path", { d: wobPoly([[0, 0], [w, 0], [w, h], [0, h]], R, u(5)), fill: "#FFF6E0", stroke: C.ink, "stroke-width": f2(u(7)), "stroke-linejoin": "round" }, card);
    for (var ln = 1; ln < 9; ln++) svg("path", { d: "M" + P2(u(20), (h * ln) / 9) + "H" + f2(w - u(20)), stroke: rgba("#7FB6E8", 0.25), "stroke-width": 2 }, card);
    svg("path", { d: rrD(w / 2 - u(70), -u(18), u(140), u(36), u(4)), fill: rgba("#E8E0C0", 0.85), stroke: rgba(C.ink, 0.3), "stroke-width": 2, transform: "rotate(-3 " + f2(w / 2) + " 0)" }, card);
    var th = 0;
    if (title) {
      var tl = layoutText(title, { size: u(V.isPortrait ? 58 : 56), maxWidth: w - u(60), maxLines: 1, family: HFONT, upper: true, minSize: u(28) });
      th = tl.h + u(24);
      writeBlock(card, tl, w / 2, u(18) + tl.h / 2, { color: C.ink });
    }
    // drawing area keeps a 1000:700 aspect, centred in the card under the title
    var pad = u(30), aw = w - pad * 2, ah = h - th - pad * 2, sc2 = Math.min(aw / 1000, ah / 700);
    var dx = pad + (aw - 1000 * sc2) / 2, dy = th + pad + (ah - 700 * sc2) / 2;
    var dg = svg("g", { transform: "translate(" + P2(dx, dy) + ") scale(" + f2(sc2) + ")" }, card);
    var parts = diagramParts(kind).map(function (p, i) {
      var f = p.fill ? svg("path", { d: p.d, fill: p.fill, opacity: 0, "fill-rule": "evenodd" }, dg) : null;
      var s = svg("path", { d: p.d, fill: "none", stroke: p.col || C.ink, "stroke-width": p.w || 8, "stroke-linecap": "round", "stroke-linejoin": "round" }, dg);
      var len = 2000;
      try { len = s.getTotalLength() || 2000; } catch (e) {}
      s.setAttribute("stroke-dasharray", f2(len) + " " + f2(len));
      return { f: f, s: s, len: len, at: at + 0.25 + i * 0.16 };
    });
    var drawEnd = at + 0.25 + parts.length * 0.16 + 0.5;
    function toPx(fx, fy) { return [x + dx + clamp(num(fx, 0.5), 0, 1) * 1000 * sc2, y + dy + clamp(num(fy, 0.5), 0, 1) * 700 * sc2]; }
    // labels and arrows land on their words
    var labs = arr(o.labels).slice(0, 6).map(obj).filter(function (l) { return str(l.text); });
    var arws = arr(o.arrows).slice(0, 6).map(obj).filter(function (a) { return Array.isArray(a.from) && Array.isArray(a.to); });
    var lt = seqTimes(labs.map(function (l) { return l.text; }), labs.map(function (l) { return l.word; }), { first: drawEnd - 0.3, gap: 0.35, after: at });
    var atimes = seqTimes(arws.map(function (a) { return a.label || ""; }), arws.map(function (a) { return a.word; }), { first: drawEnd - 0.2, gap: 0.35, after: at });
    var overG = svg("g", null, g0);
    var labelBoxes = [];
    labs.forEach(function (l, i) {
      var p = toPx(l.x, l.y), lay = layoutText(l.text, { size: u(V.isPortrait ? 38 : 36), maxWidth: w * 0.42, maxLines: 2, family: HAND, weight: 700, minSize: u(22) });
      var bw = lay.w + u(26), bh = lay.h + u(16);
      var cx = clamp(p[0], x + bw / 2 + u(12), x + w - bw / 2 - u(12)), cy = clamp(p[1], y + th + bh / 2, y + h - bh / 2 - u(10));
      var lg = svg("g", { display: "none" }, overG);
      svg("path", { d: rrD(-bw / 2, -bh / 2, bw, bh, u(10)), fill: C.yellow, stroke: C.ink, "stroke-width": f2(u(4.5)) }, lg);
      writeBlock(lg, lay, 0, 0, { color: C.ink, asc: 0.33 });
      labelBoxes.push({ g: lg, at: lt[i], cx: cx, cy: cy, w: bw, h: bh, text: l.text });
    });
    var placedLabels = labelBoxes.map(function (lb) { return { x: lb.cx - lb.w / 2 - u(6), y: lb.cy - lb.h / 2 - u(6), w: lb.w + u(12), h: lb.h + u(12) }; });
    var arrowObjs = arws.map(function (a, i) {
      var p0 = toPx(a.from[0], a.from[1]), p1 = toPx(a.to[0], a.to[1]), col = a.color || C.red, bend = clamp(num(a.curve, 0.15), -0.5, 0.5);
      var mx = (p0[0] + p1[0]) / 2 - (p1[1] - p0[1]) * bend, my = (p0[1] + p1[1]) / 2 + (p1[0] - p0[0]) * bend;
      var d = "M" + P2(p0[0], p0[1]) + "Q" + P2(mx, my) + " " + P2(p1[0], p1[1]);
      var ag = svg("g", { display: "none" }, overG);
      var o1 = svg("path", { d: d, fill: "none", stroke: C.ink, "stroke-width": f2(u(16)), "stroke-linecap": "round" }, ag);
      var o2 = svg("path", { d: d, fill: "none", stroke: col, "stroke-width": f2(u(9)), "stroke-linecap": "round" }, ag);
      var ang = Math.atan2(p1[1] - my, p1[0] - mx), hs = u(30);
      var hd = svg("path", { d: "M" + P2(p1[0] + Math.cos(ang) * hs * 0.5, p1[1] + Math.sin(ang) * hs * 0.5) + "L" + P2(p1[0] + Math.cos(ang + 2.5) * hs, p1[1] + Math.sin(ang + 2.5) * hs) + "L" + P2(p1[0] + Math.cos(ang - 2.5) * hs, p1[1] + Math.sin(ang - 2.5) * hs) + "Z", fill: col, stroke: C.ink, "stroke-width": f2(u(4)), "stroke-linejoin": "round" }, ag);
      var len = 400; try { len = o2.getTotalLength() || 400; } catch (e) {}
      [o1, o2].forEach(function (e) { e.setAttribute("stroke-dasharray", f2(len) + " " + f2(len)); });
      var dots = o.flow === false ? [] : [0, 1, 2].map(function () { return svg("circle", { r: f2(u(7)), fill: C.white, stroke: C.ink, "stroke-width": f2(u(3)) }, ag); });
      var lab = null;
      if (str(a.label)) {
        var lay = layoutText(a.label, { size: u(32), maxWidth: w * 0.36, maxLines: 2, family: HAND, weight: 700, minSize: u(20) });
        var lw2 = lay.w + u(24), lh2 = lay.h + u(16), nx0 = -(p1[1] - p0[1]), ny0 = p1[0] - p0[0], nl = Math.sqrt(nx0 * nx0 + ny0 * ny0) || 1, best = null;
        nx0 /= nl; ny0 /= nl;
        [0.5, 0.35, 0.65, 0.2, 0.8].forEach(function (f, fi) {
          var bx = lerp(lerp(p0[0], mx, f), lerp(mx, p1[0], f), f), by = lerp(lerp(p0[1], my, f), lerp(my, p1[1], f), f);
          [1, -1].forEach(function (sd) {
            [u(30), u(62), u(96)].forEach(function (dd, di) {
              var cx = bx + nx0 * sd * (dd + lw2 * 0.5 * Math.abs(nx0)), cy = by + ny0 * sd * (dd + lh2 * 0.5 * Math.abs(ny0));
              cx = clamp(cx, x + lw2 / 2 + u(14), x + w - lw2 / 2 - u(14)); cy = clamp(cy, y + th + lh2 / 2, y + h - lh2 / 2 - u(8));
              var r = { x: cx - lw2 / 2, y: cy - lh2 / 2, w: lw2, h: lh2 }, sc3 = (fi + di) * lw2 * lh2 * 0.02;
              placedLabels.forEach(function (q) { sc3 += overlapArea(r, q) * 3; });
              if (!best || sc3 < best.s) best = { s: sc3, x: cx, y: cy };
            });
          });
        });
        var lx = best.x, ly = best.y;
        placedLabels.push({ x: lx - lw2 / 2, y: ly - lh2 / 2, w: lw2, h: lh2 });
        lab = svg("g", { transform: "translate(" + P2(lx, ly) + ")" }, ag);
        svg("path", { d: rrD(-lay.w / 2 - u(10), -lay.h / 2 - u(6), lay.w + u(20), lay.h + u(12), u(8)), fill: C.white, stroke: col, "stroke-width": f2(u(4)) }, lab);
        writeBlock(lab, lay, 0, 0, { color: C.ink, asc: 0.33 });
      }
      return { g: ag, o1: o1, o2: o2, hd: hd, len: len, at: atimes[i], dots: dots, lab: lab, p0: p0, p1: p1, mx: mx, my: my };
    });
    var self = { g: g0, at: at, x: x, y: y, w: w, h: h, toPx: toPx, drawEnd: drawEnd };
    onOver(function (t) {
      var p = popEnv(t, at, null, 0.35);
      g0.setAttribute("display", p > 0.001 ? "inline" : "none");
      if (p <= 0.001) return;
      card.setAttribute("transform", "translate(" + P2(x + w / 2, y + h / 2) + ") rotate(" + f2(-1 + (1 - Math.min(1, p)) * -5) + ") scale(" + f2(p) + ") translate(" + P2(-w / 2, -h / 2) + ")");
      parts.forEach(function (pt) {
        var q = EASE.inOut(prog(t, pt.at, pt.at + 0.55));
        pt.s.setAttribute("stroke-dashoffset", f2(pt.len * (1 - q)));
        if (pt.f) pt.f.setAttribute("opacity", f2(prog(t, pt.at + 0.35, pt.at + 0.7)));
      });
      labelBoxes.forEach(function (lb) {
        var q = popEnv(t, lb.at, null, 0.3);
        lb.g.setAttribute("display", q > 0.001 ? "inline" : "none");
        lb.g.setAttribute("transform", "translate(" + P2(lb.cx, lb.cy) + ") scale(" + f2(q) + ") rotate(-2)");
      });
      arrowObjs.forEach(function (ar) {
        var on = t >= ar.at;
        ar.g.setAttribute("display", on ? "inline" : "none");
        if (!on) return;
        var q = EASE.outCubic(prog(t, ar.at, ar.at + 0.5));
        ar.o1.setAttribute("stroke-dashoffset", f2(ar.len * (1 - q))); ar.o2.setAttribute("stroke-dashoffset", f2(ar.len * (1 - q)));
        ar.hd.setAttribute("display", q > 0.95 ? "inline" : "none");
        if (ar.lab) ar.lab.setAttribute("opacity", f2(prog(t, ar.at + 0.3, ar.at + 0.5)));
        ar.dots.forEach(function (dt, k) {
          var f = mod((t - ar.at) * 0.6 + k / 3, 1), show = q >= 1;
          dt.setAttribute("display", show ? "inline" : "none");
          if (!show) return;
          var bx = lerp(lerp(ar.p0[0], ar.mx, f), lerp(ar.mx, ar.p1[0], f), f), by = lerp(lerp(ar.p0[1], ar.my, f), lerp(ar.my, ar.p1[1], f), f);
          dt.setAttribute("cx", f2(bx)); dt.setAttribute("cy", f2(by));
        });
      });
    });
    item("diagram", title || kind, at + 0.4, null, function () { return { x: x, y: y, w: w, h: h }; });
    return self;
  }

  // ------------------------- kinetic captions -------------------------
  function captions(o) {
    o = obj(o);
    var s0 = need(), sr = safeRect();
    var ws = V.words.slice();
    if (str(o.text) && !ws.length) { var toks = str(o.text).split(/\s+/); ws = toks.map(function (t2, i) { var s = 0.3 + (i * (D - 1.6)) / Math.max(1, toks.length); return { word: t2, start: s, end: s + 0.3 }; }); }
    if (!ws.length) return null;
    var chunk = Math.max(2, Math.floor(num(o.chunk, V.isPortrait ? 3 : 4)));
    var groups = [];
    for (var i = 0; i < ws.length; i += chunk) groups.push(ws.slice(i, i + chunk));
    var size = u(V.isPortrait ? 66 : 58), y = o.top ? sr.y + size : sr.y + sr.h - size * 0.9;
    var g0 = svg("g", { class: "dw-captions" }, s0.ogTop);
    var made = groups.map(function (gr) {
      var txt = gr.map(function (w2) { return w2.word; }).join(" ");
      var lay = layoutText(txt, { size: size, maxWidth: sr.w * 0.92, maxLines: 1, family: HFONT, upper: true, minSize: size * 0.5 });
      var gg = svg("g", { display: "none" }, g0);
      var wb = writeBlock(gg, lay, W / 2, y, { color: C.white, stroke: C.ink, strokeW: lay.size * 0.16 });
      return { g: gg, wb: wb, a: gr[0].start, b: gr[gr.length - 1].end, ws: gr, lay: lay };
    });
    onOver(function (t) {
      made.forEach(function (m, i) {
        var next = i + 1 < made.length ? made[i + 1].a - 0.05 : D + 1;
        var on = t >= m.a - 0.05 && t < Math.min(next, m.b + 0.8);
        m.g.setAttribute("display", on ? "inline" : "none");
        if (!on) return;
        m.wb.spans.forEach(function (sp, k) { var w2 = m.ws[k]; sp.setAttribute("fill", w2 && t >= w2.start && t < w2.end + 0.05 ? C.yellow : C.white); });
      });
    });
    item("captions", "captions", 0, null, function (t) { var m = null; made.forEach(function (mm, i) { var nx = i + 1 < made.length ? made[i + 1].a - 0.05 : D + 1; if (t >= mm.a - 0.05 && t < Math.min(nx, mm.b + 0.8)) m = mm; }); return m ? { x: W / 2 - m.lay.w / 2, y: y - m.lay.h / 2, w: m.lay.w, h: m.lay.h } : null; });
    return g0;
  }

  // ------------------------- public scene wrapper -------------------------
  function sceneAPI(location, o) {
    o = obj(o);
    var sc = scene(location, o);
    if (sc.loc === "cave" && !o.noFire) {
      var fx = o.fireX == null ? sc.Ww * 0.5 : num(o.fireX, 0.5) <= 1 ? num(o.fireX, 0.5) * sc.Ww : num(o.fireX, sc.Ww / 2);
      sc.caveFire = fire(sc, fx, sc.G + 8, 1);
    }
    if (sc.time === "night" && sc.loc !== "cave" && sc.loc !== "cosmos") sc.tints.push({ at: -1, dur: 0.01, op: 0.16, color: "#1A2A5A" });
    if (sc.time === "dusk" || sc.time === "dawn") sc.tints.push({ at: -1, dur: 0.01, op: 0.1, color: "#FF8A4A" });
    if (sc.loc === "cave") sc.tints.push({ at: -1, dur: 0.01, op: 0.12, color: "#2B1206" });
    return sc;
  }
  function camera() { return cur().cam; }

  // ------------------------- template helpers -------------------------
  function tplScene(p, extra) {
    p = obj(p);
    return sceneAPI(p.location || "savanna", Object.assign({ era: p.era, time: p.time }, extra || {}));
  }
  function keyTime(keyword, text, after, fb) {
    var t = keyword ? kwFind(keyword, after) : null;
    if (t == null && text) t = labelTime(text, null, after);
    if (t == null) t = fb;
    return clamp(t, 0.2, Math.max(0.25, endT(0.4)));
  }
  function actAs(a, activity, at, era, propOverride) {
    var ac = activityOf(activity, era);
    a.pose(ac.pose, at, 0.35);
    var pr = propName(propOverride) || ac.prop;
    if (pr) a.hold(pr, at);
    return ac;
  }
  var REACT = {
    shocked: { pose: "arms-up", mark: "!!", expr: "shocked" }, scared: { pose: "cower", mark: "sweat", expr: "scared" }, happy: { pose: "cheer", mark: "heart", expr: "happy" },
    deadpan: { pose: "cross-arms", mark: "...", expr: "deadpan" }, confused: { pose: "shrug", mark: "?", expr: "confused" }, angry: { pose: "fist-pump", mark: "anger", expr: "angry" },
    hot: { pose: "fan", mark: "sweat", expr: "hot" }, cold: { pose: "shiver", mark: "...", expr: "cold" }, idea: { pose: "point-up", mark: "idea", expr: "excited" },
    hungry: { pose: "eat", mark: "drool", expr: "hungry" }, sad: { pose: "sad", mark: "...", expr: "sad" }, smug: { pose: "hands-hips", mark: "...", expr: "smug" },
  };
  function reactOf(r) { r = str(r).toLowerCase(); return REACT[r] || REACT[exprName(r)] || REACT.shocked; }
  function slowPush(sc, z0, z1, x1) {
    var cam = sc.cam.set({ zoom: z0 || 1.02 });
    var tg = { zoom: z1 || 1.08 };
    if (x1 != null) tg.x = x1;
    cam.to(tg, 0.2, Math.max(1, D - 0.6), "inOutSine");
    return cam;
  }
  function sideSets(sc, avoid, list, o) {
    o = o || {};
    var cands = sc.portrait ? [0.9, 0.08, 0.97, 0.02] : [0.88, 0.1, 0.96, 0.03, 0.78];
    var used = [];
    return arr(list).slice(0, 3).map(function (n) {
      var nm = setName(n);
      if (!nm) return null;
      var fx = null;
      for (var i = 0; i < cands.length; i++) {
        var x = cands[i] * sc.Ww;
        if (used.indexOf(i) >= 0) continue;
        if (avoid.some(function (a) { return Math.abs(a - x) < (sc.portrait ? 90 : 170); })) continue;
        fx = x; used.push(i); break;
      }
      if (fx == null) fx = sc.Ww * (used.length % 2 ? 0.05 : 0.95);
      var big = ["tree", "palm", "pine", "acacia", "column", "tower", "hut", "tent", "pyramid", "stall", "stones", "igloo", "well"].indexOf(nm) >= 0;
      return setpiece(nm, { x: fx, scale: (big ? (sc.portrait ? 0.72 : 0.92) : 1) * num(o.scale, 1), scene: sc });
    }).filter(Boolean);
  }

  var TPL = {};
  // daily-life: 1-3 people doing an everyday activity.
  TPL["daily-life"] = function (p) {
    var sc = tplScene(p, { fireX: null }), chars = arr(p.characters).map(obj).filter(function (c) { return c.name || c.activity; }).slice(0, 3);
    if (!chars.length) chars = [{ name: "og", activity: "idle", expression: "deadpan" }];
    var n = chars.length, port = sc.portrait;
    var xs = n === 1 ? [p.side === "right" ? 0.62 : port ? 0.42 : 0.4] : n === 2 ? (port ? [0.26, 0.72] : [0.34, 0.62]) : port ? [0.16, 0.5, 0.84] : [0.26, 0.46, 0.66];
    var scl = n === 3 && port ? 0.74 : n === 2 && port ? 0.86 : 1;
    if (sc.caveFire && n !== 2) sc.caveFire.g.parentNode && moveFire(sc, n === 1 ? (p.side === "right" ? 0.3 : 0.66) * sc.Ww : sc.Ww * 0.9);
    if (sc.caveFire && n === 2) moveFire(sc, sc.Ww * 0.48);
    var cast = chars.map(function (c, i) {
      var x = xs[i] * sc.Ww, faceL = n === 1 ? x > sc.Ww / 2 : x > sc.Ww * 0.5;
      var a = character(c.name || CAST_IDS[i], { x: x, facing: faceL ? "left" : "right", outfit: c.outfit || p.era, expression: c.expression || "neutral", scale: scl, scene: sc });
      actAs(a, c.activity || "idle", -5, a.era, c.prop);
      return a;
    });
    if (sc.time === "night" && sc.loc !== "cave" && sc.loc !== "cosmos" && sc.loc !== "modern-city" && sc.loc !== "future-city") fire(sc, n === 2 ? sc.Ww * 0.48 : n === 1 ? (p.side === "right" ? 0.32 : 0.68) * sc.Ww : sc.Ww * 0.9, sc.G + 10, 0.9);
    var avoid = cast.map(function (a) { return a.x0; });
    var an = animalName(p.animal), animalX = null;
    if (an) {
      animalX = (port ? 0.86 : 0.86) * sc.Ww;
      if (n === 1 && p.side === "right") animalX = 0.14 * sc.Ww;
      var big = an === "mammoth" || an === "camel";
      animal(an, { x: animalX, facing: animalX > sc.Ww / 2 ? "left" : "right", scene: sc, scale: (port ? 0.7 : 0.9) * (big ? 0.8 : 1), y: port ? sc.G - 34 : sc.G, layer: port ? "rear" : null });
      avoid.push(animalX);
    }
    sideSets(sc, avoid, p.setpieces);
    var hl = str(p.headline), tk = hl ? keyTime(p.keyword || autoKey(hl), hl, 0, D * 0.3) : null;
    if (hl) { headline(hl, tk - 0.05, { pos: "top", color: p.headlineColor || "yellow", kicker: p.kicker, size: "lg" }); sc.cam.shake(tk, 7, 0.35); }
    narrate(cast[0], 0, D);
    cast[0].beats(arr(p.beats).slice(0, 3));
    var r = obj(p.reaction);
    if (r.word || r.mark || r.expression) {
      var who = cast[clamp(Math.floor(num(r.character, 0)), 0, cast.length - 1)];
      var rt = r.word ? keyTime(r.word, null, 0, D * 0.6) : Math.min(endT(0.5), D * 0.62);
      if (r.expression) who.expression(r.expression, rt);
      if (r.pose) who.pose(r.pose, rt - 0.05);
      if (r.mark) who.mark(r.mark, rt + 0.08, 1.8);
    }
    if (n > 1) cast.slice(1).forEach(function (a, i) { a.lookAt(cast[0], 1.5 + i * 0.4); });
    slowPush(sc, 1.02, port ? 1.06 : 1.09, sc.Ww / 2 + (n === 1 ? (xs[0] - 0.5) * sc.Ww * 0.25 : 0));
  };
  function moveFire(sc, x) {
    if (!sc.caveFire) return;
    var f = sc.caveFire, dx = x - f.x;
    f.g.setAttribute("transform", "translate(" + P2(x, f.y) + ") scale(" + f2(f.scale) + ")");
    var gl = f.g.previousSibling;
    if (gl && gl.tagName === "ellipse") gl.setAttribute("cx", f2(x));
    if (sc.caveGlow) sc.caveGlow.setAttribute("cx", f2(x));
    f.x = x;
  }

  // what-if-time: a year counter races while the world changes.
  TPL["what-if-time"] = function (p) {
    var sc = tplScene(p), port = sc.portrait;
    var ms = arr(p.milestones).map(obj).filter(function (m) { return m.headline || m.word || m.year != null; }).slice(0, 5);
    var from = num(p.from, 2025), to = num(p.to, from + 1000000);
    var x = (port ? 0.5 : 0.7) * sc.Ww;
    var a = character(p.character || "og", { x: x, facing: port ? "right" : "left", outfit: p.era, expression: p.expression || "neutral", scene: sc });
    a.pose("look-around", -5);
    var times = seqTimes(ms.map(function (m) { return m.headline || ""; }), ms.map(function (m) { return m.word; }), { first: 0.9, gap: 0.9 });
    var cx = port ? 0.5 : 0.36;
    var stops = ms.map(function (m, i) { var v = m.year != null ? num(m.year, from) : lerp(from, to, (i + 1) / ms.length); return { at: times[i], value: v }; });
    yearCounter({ from: from, format: p.format, label: p.label, at: 0.2, stops: stops, x: cx, y: port ? 0.19 : 0.2 });
    a.lookAt("up", 0.8);
    ms.forEach(function (m, i) {
      var t = times[i], next = i + 1 < ms.length ? times[i + 1] : null;
      if (str(m.headline)) headline(m.headline, t + 0.05, { x: cx, y: port ? 0.33 : 0.47, until: next == null ? null : next - 0.12, maxWidth: port ? 0.9 : 0.5, size: port ? "lg" : "md", color: m.change === "heat" ? "red" : m.change === "snow" ? "white" : "yellow" });
      var ch = str(m.change).toLowerCase(), until = next == null ? null : next;
      if (ch === "snow") { weather("snow", { at: t, until: until, scene: sc, count: 90 }); sc.tints.push({ at: t, dur: 0.8, op: 0.32, color: "#9FB6D0" }); if (m.label) indicator("cold", t + 0.2, { label: m.label, until: until == null ? null : until - 0.1, x: port ? 0.15 : 0.87 }); }
      else if (ch === "heat") { sc.tints.push({ at: t, dur: 0.8, op: 0.3, color: "#FF5A1A" }); if (sc.sun) sc.sun.keys.push({ at: t, dur: 1.0, scale: 1.9, color: "#FF7A2A" }); if (m.label) indicator("hot", t + 0.2, { label: m.label, until: until == null ? null : until - 0.1, x: port ? 0.15 : 0.87 }); }
      else if (ch === "ash") { weather("ash", { at: t, until: until, scene: sc, count: 80 }); sc.tints.push({ at: t, dur: 0.8, op: 0.42, color: "#3A2A2A" }); }
      else if (ch === "flood") flood(sc, t, until);
      else if (ch === "stars") { sc.tints.push({ at: t, dur: 1.0, op: 0.5, color: "#0A0E24" }); weather("stars", { at: t, until: until, scene: sc, count: 90 }); if (sc.sun) sc.sun.keys.push({ at: t, dur: 1.2, scale: 0.35, dy: 120, color: "#B8301A" }); }
      else if (ch === "night") { sc.tints.push({ at: t, dur: 0.8, op: 0.48, color: "#1A2A5A" }); weather("stars", { at: t, until: until, scene: sc, count: 50 }); }
      else if (ch === "rain") { weather("rain", { at: t, until: until, scene: sc }); sc.tints.push({ at: t, dur: 0.8, op: 0.3, color: "#4A5A7A" }); }
      else if (ch === "none" || !ch) sc.tints.push({ at: t, dur: 0.6, op: 0, color: "#1A2A5A" });
      var ex = m.expression || (ch === "snow" ? "cold" : ch === "heat" ? "hot" : ch === "flood" ? "scared" : ch === "ash" || ch === "stars" ? "shocked" : "shocked");
      a.expression(ex, t + 0.1);
      a.pose(ch === "snow" ? "shiver" : ch === "heat" ? "fan" : ch === "flood" ? "panic" : i === ms.length - 1 ? "idle" : "arms-up", t, 0.3);
      if (m.mark) a.mark(m.mark, t + 0.25, Math.min(1.6, (next || D) - t - 0.2));
      sc.cam.shake(t, 6, 0.3);
    });
    narrate(a, 0, D);
    slowPush(sc, 1.0, 1.06);
  };
  function flood(sc, at, until) {
    var g = svg("g", null, sc.fxG), wave = svg("path", { fill: rgba("#3F8FB0", 0.82), stroke: C.ink, "stroke-width": 6 }, g), foam = svg("path", { fill: "none", stroke: rgba("#FFFFFF", 0.7), "stroke-width": 6, "stroke-linecap": "round" }, g);
    var L = sc.layers.action;
    sc.onFrame(function (t) {
      var q = smooth(prog(t, at, at + 2.2)) * (until == null ? 1 : 1 - smooth(prog(t, until, until + 1)));
      g.setAttribute("display", q > 0.001 ? "inline" : "none");
      if (q <= 0.001) return;
      var top = lerp(L.Y1, sc.G - 150, q), d = "M" + P2(L.X0, L.Y1), fd = "";
      for (var x = L.X0; x <= L.X1; x += 40) { var y = top + Math.sin(x * 0.02 + t * 3) * 10; d += "L" + P2(x, y); fd += (fd ? "L" : "M") + P2(x, y + 8); }
      wave.setAttribute("d", d + "L" + P2(L.X1, L.Y1) + "Z"); foam.setAttribute("d", fd);
    });
  }

  // survival-hack: an ancient trick with labelled arrows and a thermometer.
  TPL["survival-hack"] = function (p) {
    var sc = tplScene(p), port = sc.portrait;
    var ax = (port ? 0.62 : 0.55) * sc.Ww;
    var a = character(p.character || "og", { x: ax, facing: "left", outfit: p.outfit || p.era, expression: p.expression || (sc.isHot ? "hot" : sc.isCold ? "cold" : "neutral"), scene: sc });
    var pr = propName(p.prop);
    actAs(a, p.activity || (pr ? "hold" : "explain"), -5, a.era, pr);
    var sp = setName(p.setpiece);
    var spObj = sp ? setpiece(sp, { x: (port ? 0.22 : 0.33) * sc.Ww, scene: sc, scale: ["tree", "palm", "pine", "acacia", "column", "tower", "hut", "tent", "pyramid", "stall", "stones", "igloo", "well"].indexOf(sp) >= 0 ? (port ? 0.7 : 0.85) : port ? 1.1 : 1.25, wet: true }) : null;
    var title = str(p.title), cl = arr(p.callouts).map(obj).filter(function (c) { return str(c.text); }).slice(0, 5);
    var tt = title ? keyTime(p.keyword || autoKey(title), title, 0, 0.3) : null;
    if (title) { if (p.keyword && tt > D * 0.5) tt = 0.3; headline(title, tt, { pos: "top", color: p.headlineColor || "yellow", kicker: p.kicker, size: port ? "lg" : "md" }); }
    var ind = pick(["hot", "cold", "sun", "snowflake", "steam", "none"], p.indicator, sc.isCold ? "cold" : sc.isHot ? "hot" : "none"), indObj = null;
    if (ind !== "none") indObj = indicator(ind, 0.5, { label: p.temperature, x: port ? 0.14 : 0.87, y: port ? 0.47 : 0.45 });
    if (a.era && sc.isHot && (p.expression || "hot") === "hot") a.sweatOn(0.6, D * 0.75);
    var times = seqTimes(cl.map(function (c) { return c.text; }), cl.map(function (c) { return c.word; }), { first: 0.9, gap: 0.6 });
    cl.forEach(function (c, i) {
      var tg = str(c.target).toLowerCase(), target = a, anchor = "head";
      if (tg === "prop") { anchor = pr ? "handR" : "handR"; }
      else if (tg === "body") anchor = "body";
      else if (tg === "feet") anchor = "feet";
      else if (tg === "ground") { target = { x: ax - 120, y: sc.G + 30, sc: sc }; anchor = null; }
      else if (tg === "setpiece") { target = spObj ? { anchor: spObj.anchor, sc: sc } : a; anchor = spObj ? "head" : "body"; }
      else if (tg === "left") { target = { x: sc.Ww * 0.12, y: sc.G - 200, sc: sc }; anchor = null; }
      else if (tg === "right") { target = { x: sc.Ww * 0.88, y: sc.G - 200, sc: sc }; anchor = null; }
      else if (tg === "sky") { target = { x: sc.Ww * 0.5, y: 180, sc: sc }; anchor = null; }
      callout(c.text, target, times[i], { anchor: anchor, color: c.color });
      if (i === 0) a.pose("point", times[i] - 0.1, 0.3);
    });
    if (cl.length) a.pose(p.activity ? activityOf(p.activity, a.era).pose : pr ? "hold" : "explain", times[times.length - 1] + 0.6, 0.4);
    var res = pick(["better", "worse", "none"], p.result, "better"), rt = Math.min(endT(0.4), (cl.length ? times[times.length - 1] : D * 0.5) + 1.0);
    if (res === "better") { a.expression("happy", rt); a.mark("heart", rt + 0.1, 1.5); if (indObj && indObj.setLevel) indObj.setLevel(ind === "cold" ? 0.55 : 0.35, rt, 0.9); }
    else if (res === "worse") { a.expression("hot", rt); a.mark("sweat", rt + 0.1, 1.5); a.sweatOn(rt, D); if (indObj && indObj.setLevel) indObj.setLevel(ind === "cold" ? 0.04 : 1, rt, 0.9); }
    narrate(a, 0, D);
    slowPush(sc, 1.02, 1.06);
  };

  // versus-then-now: split screen, two painted worlds.
  TPL["versus-then-now"] = function (p) {
    var s0 = need(), port = V.isPortrait;
    var L = obj(p.left), Rt = obj(p.right);
    var defs = [{ s: L, def: { location: "savanna", label: "THEN", character: "og", activity: "hunt" }, vp: port ? { x: 0, y: 0, w: 1, h: 0.5 } : { x: 0, y: 0, w: 0.5, h: 1 } },
      { s: Rt, def: { location: "modern-city", label: "NOW", character: "og", activity: "phone" }, vp: port ? { x: 0, y: 0.5, w: 1, h: 0.5 } : { x: 0.5, y: 0, w: 0.5, h: 1 } }];
    var tL = keyTime(L.word, L.label, 0, 0.3); if (tL > D * 0.4) tL = 0.3; tL = Math.min(tL, 0.4);
    var tR = keyTime(Rt.word, Rt.label, tL + 0.5, D * 0.45); if (tR < tL + 0.8) tR = Math.min(endT(1), tL + 0.8);
    var sides = defs.map(function (d, i) {
      var s = Object.assign({}, d.def, d.s);
      var sc = sceneAPI(s.location, { era: s.era, viewport: d.vp, charScale: port ? 1.05 : 1.12 });
      var cxF = port ? 0.3 : 0.5;
      var a = character(s.character || "og", { x: sc.Ww * cxF, facing: port ? "right" : i ? "left" : "right", outfit: s.outfit || s.era, expression: s.expression || "neutral", scene: sc });
      actAs(a, s.activity || "idle", -5, a.era, s.prop);
      var an = animalName(s.animal);
      if (an) animal(an, { x: sc.Ww * (port ? 0.62 : i ? 0.16 : 0.84), facing: port ? "left" : i ? "right" : "left", scene: sc, scale: an === "mammoth" ? 0.55 : 0.72 });
      var t = i ? tR : tL;
      if (s.mark) a.mark(s.mark, t + 0.5, 1.8);
      narrate(a, t, i ? D : tR - 0.1);
      sc.cam.set({ zoom: 1.03 }).to({ zoom: 1.08 }, 0.2, D - 0.5, "inOutSine");
      if (i) { // wipe in on its word
        var dv = sc.div;
        sc.onFrame(function (tt) { var q = EASE.outCubic(prog(tt, t - 0.12, t + 0.28)); dv.style.clipPath = port ? "inset(0 0 " + f2((1 - q) * 100) + "% 0)" : "inset(0 0 0 " + f2((1 - q) * 100) + "%)"; dv.style.display = q > 0 ? "block" : "none"; });
      }
      // label + caption
      var lx = port ? 0.68 : i ? 0.75 : 0.25, ly = port ? (i ? 0.6 : 0.2) : 0.15;
      headline(str(s.label) || (i ? "NOW" : "THEN"), t, { x: lx, y: ly, size: port ? "lg" : "lg", color: i ? "white" : "yellow", maxWidth: port ? 0.56 : 0.42, rot: i ? 2 : -3 });
      if (str(s.caption)) headline(s.caption, t + 0.45, { x: lx, y: port ? (i ? 0.71 : 0.31) : 0.27, size: "sm", color: "white", maxWidth: port ? 0.56 : 0.42, maxLines: 2, rot: 0 });
      return { sc: sc, a: a };
    });
    s0.cur = sides[0].sc;
    // jagged divider + VS badge
    var g = svg("g", { display: "none" }, s0.ogTop), pts = [], n = 16, i;
    for (i = 0; i <= n; i++) pts.push(port ? [(W * i) / n, H / 2 + (i % 2 ? -u(14) : u(14))] : [W / 2 + (i % 2 ? -u(14) : u(14)), (H * i) / n]);
    var dd = polyD(pts, false);
    svg("path", { d: dd, fill: "none", stroke: C.ink, "stroke-width": f2(u(18)), "stroke-linejoin": "round" }, g);
    svg("path", { d: dd, fill: "none", stroke: C.yellow, "stroke-width": f2(u(8)), "stroke-linejoin": "round" }, g);
    var badge = svg("g", null, g);
    var vsR = u(78);
    svg("path", { d: polyD([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map(function (k) { var aa = (k / 16) * TAU, rr = k % 2 ? vsR * 0.84 : vsR * 1.12; return [Math.cos(aa) * rr, Math.sin(aa) * rr]; })), fill: C.red, stroke: C.ink, "stroke-width": f2(u(7)), "stroke-linejoin": "round" }, badge);
    var vl = layoutText(str(p.vs) || "VS", { size: u(70), maxWidth: vsR * 1.5, maxLines: 1, upper: true, family: HFONT });
    writeBlock(badge, vl, 0, 0, { color: C.yellow, stroke: C.ink, strokeW: u(10) });
    var hl = str(p.headline), tk = null;
    if (hl) { tk = keyTime(p.keyword || autoKey(hl), hl, tR + 0.6, endT(0.6)); if (tk < tR + 0.8) tk = Math.min(endT(0.4), tR + 0.8); }
    onOver(function (t) {
      var q = popEnv(t, tR, null, 0.3) * (tk == null ? 1 : 1 - EASE.inCubic(prog(t, tk - 0.1, tk + 0.1)));
      g.setAttribute("display", q > 0.001 ? "inline" : "none");
      if (q <= 0.001) return;
      badge.setAttribute("transform", "translate(" + P2(W / 2, H / 2) + ") scale(" + f2(q) + ") rotate(" + f2(-8 + Math.sin(t * 2) * 3) + ")");
    });
    item("badge", "vs", tR + 0.3, tk == null ? null : tk - 0.1, function () { return { x: W / 2 - vsR, y: H / 2 - vsR, w: vsR * 2, h: vsR * 2 }; });
    if (hl) {
      headline(hl, tk, { pos: "center", y: 0.5, color: "yellow", size: port ? "xl" : "lg", slam: true, maxWidth: port ? 0.92 : 0.6 });
      sides.forEach(function (sd) { sd.sc.cam.shake(tk, 8, 0.3); });
      sides[1].a.expression(sides[1].a._exprs[sides[1].a._exprs.length - 1].name, tk);
    }
  };

  // group-gathering: the tribe around a fire / table / well.
  TPL["group-gathering"] = function (p) {
    var night = p.time === "night" || (!p.time && (p.location === "cave" || p.centre === "fire" || !p.centre));
    var sc = tplScene(Object.assign({}, p, { time: p.time || (night && p.location !== "cave" ? "night" : p.time) }), { noFire: true });
    var port = sc.portrait || sc.square;
    var names = arr(p.characters).map(function (c) { return castName(typeof c === "string" ? c : obj(c).name); }).slice(0, 5);
    if (names.length < 2) names = names.concat(["og", "nia"]).slice(0, Math.max(2, names.length));
    var n = names.length, cx = sc.Ww * 0.5, centre = pick(["fire", "table", "well", "pot", "drum", "none"], p.centre, "fire");
    if (centre === "fire") fire(sc, cx, sc.G + 12, port ? 0.85 : 1);
    else if (centre !== "none") setpiece(centre, { x: cx, scene: sc, scale: port ? 0.8 : 1 });
    var pos = [];
    if (port) {
      var front = n === 2 ? [0.24, 0.76] : [0.21, 0.79];
      var back = n === 3 ? [0.5] : n === 4 ? [0.38, 0.62] : n === 5 ? [0.33, 0.5, 0.67] : [];
      // speakers 0 and 1 in front, the rest behind
      for (var i = 0; i < n; i++) {
        if (i < 2) pos.push({ x: front[i] * sc.Ww, rear: false });
        else pos.push({ x: back[i - 2] * sc.Ww, rear: true });
      }
    } else {
      var gap = n >= 4 ? 215 : 250, step = n >= 4 ? 205 : 240;
      var left = 0, right = 0;
      for (var j = 0; j < n; j++) {
        if (j % 2 === 0) { pos.push({ x: cx - gap - left * step, rear: false }); left++; }
        else { pos.push({ x: cx + gap + right * step, rear: false }); right++; }
      }
    }
    var scl = port ? 0.8 : n >= 4 ? 0.82 : 0.9;
    var cast = names.map(function (nm, i) {
      var q = pos[i];
      var a = character(nm, { x: q.x, y: q.rear ? sc.G - 70 : sc.G, scale: q.rear ? scl * 0.82 : scl, facing: q.x < cx ? "right" : "left", outfit: p.era, expression: "neutral", scene: sc, layer: q.rear ? "rear" : null });
      a.pose(i % 3 === 1 ? "sit" : "idle", -5);
      return a;
    });
    if (centre === "fire" || sc.isDark) sc.lightWash(cx, sc.G - 140, port ? 420 : 640, "#FFB04A", 0.5);
    var ls = arr(p.lines).map(obj).filter(function (l) { return str(l.text); }).slice(0, 8);
    if (ls.length) dialogue(cast, ls.map(function (l) { return Object.assign({}, l, { speaker: clamp(Math.floor(num(l.speaker, 0)), 0, n - 1) }); }));
    else narrate(cast[0], 0, D);
    var hl = str(p.headline);
    if (hl) headline(hl, keyTime(p.keyword || autoKey(hl), hl, 0, 0.4), { pos: "top", size: port ? "md" : "md" });
    if (port) slowPush(sc, 1.02, 1.07);
    else sc.cam.set({ zoom: 1.16, y: sc.G - 300 }).to({ zoom: 1.24, y: sc.G - 290 }, 0.2, Math.max(1, D - 0.6), "inOutSine");
  };

  // journey-trek: walkers cross a wide painted land; signposts pop at milestones.
  TPL["journey-trek"] = function (p) {
    var names = arr(p.characters).map(function (c) { return castName(typeof c === "string" ? c : obj(c).name); }).slice(0, 3);
    if (!names.length) names = ["og"];
    var run = p.pace === "run", t0 = 0.25, t1 = Math.max(t0 + 2, D - 1.1);
    var speed = run ? 300 : 150;
    var probe = Object.assign({}, p);
    var Ww0 = (1000 * W) / H, startX = Ww0 * (V.isPortrait ? 0.55 : 0.42), dist = speed * (t1 - t0);
    var span = Math.max(1.6, (startX + dist + Ww0 * 0.75) / Ww0);
    var sc = tplScene(probe, { span: span }), port = sc.portrait;
    var cast = names.map(function (nm, i) {
      var off = i * (port ? 118 : 178);
      var a = character(nm, { x: startX - off, facing: "right", outfit: p.era, expression: i ? "tired" : "neutral", scene: sc, scale: port ? 0.78 : 0.92 });
      a.keepMoveFacing = true;
      a.moveTo(startX - off + dist, t0 + i * 0.05, t1 - t0, { gait: run ? "run" : "walk", ease: "linear" });
      return a;
    });
    var lead = cast[0];
    var pr = propName(p.prop);
    if (pr) { lead.hold(pr, -5); lead.pose("hold", -5); }
    var an = animalName(p.animal);
    if (an) { var off2 = names.length * (port ? 118 : 178) + (an === "mammoth" ? 150 : 40); var cr = animal(an, { x: startX - off2, facing: "right", scene: sc, scale: an === "mammoth" ? (port ? 0.62 : 0.75) : 0.9 }); cr.moveTo(startX - off2 + dist, t0 + 0.1, t1 - t0, { ease: "linear" }); }
    // dotted route behind them
    var route = svg("path", { d: "M" + P2(startX - 200, sc.G + 28) + "L" + P2(startX + dist + 200, sc.G + 28), fill: "none", stroke: rgba(C.ink, 0.55), "stroke-width": 8, "stroke-linecap": "round", "stroke-dasharray": "2 30" }, sc.backG);
    var routeW = svg("path", { d: "M" + P2(startX - 200, sc.G + 28) + "L" + P2(startX + dist + 200, sc.G + 28), fill: "none", stroke: rgba("#FFF3D6", 0.8), "stroke-width": 4, "stroke-linecap": "round", "stroke-dasharray": "2 30" }, sc.backG);
    var clipId = uid("rt"), cp = svg("clipPath", { id: clipId }, st.defs), cr2 = svg("rect", { x: f2(startX - 400), y: f2(sc.G - 40), height: 120, width: 10 }, cp);
    route.setAttribute("clip-path", "url(#" + clipId + ")"); routeW.setAttribute("clip-path", "url(#" + clipId + ")");
    sc.onFrame(function (t) { cr2.setAttribute("width", f2(Math.max(10, lead.xAt(t) - (startX - 400)))); });
    var ms = arr(p.milestones).map(obj).filter(function (m) { return str(m.label); }).slice(0, 5);
    var times = seqTimes(ms.map(function (m) { return m.label; }), ms.map(function (m) { return m.word; }), { first: 1.2, gap: 0.9 });
    ms.forEach(function (m, i) {
      var t = times[i], sx = lead.xAt(t) + (port ? 175 : 560);
      setpiece("signpost", { x: sx, text: m.label, at: t - 0.15, scene: sc, scale: port ? 0.95 : 1 });
      if (m.mark) lead.mark(m.mark, t + 0.15, 1.4);
    });
    var hl = str(p.headline);
    if (hl) headline(hl, 0.3, { pos: "top", kicker: p.kicker, until: p.until === "end" ? null : Math.min(D - 1.2, Math.max(2.6, (times[0] || 3) - 0.3)), size: port ? "lg" : "md" });
    if (p.reaction) { var rt = p.reactionWord ? keyTime(p.reactionWord, null, 0, D * 0.4) : D * 0.4; lead.expression(p.reaction, rt); if (p.reactionMark) lead.mark(p.reactionMark, rt + 0.1, 1.4); }
    if (sc.loc === "tundra") weather("snow", { scene: sc, count: 80 });
    if (sc.loc === "desert") weather("dust", { scene: sc, count: 40 });
    narrate(lead, 0, D);
    sc.cam.set({ zoom: port ? 1.0 : 1.04, x: startX - (port ? 90 : 120) });
    sc.cam.follow(lead, t0, D + 1, { lead: port ? -90 : -120 });
  };

  // headline-thumb: the thumbnail moment.
  TPL["headline-thumb"] = function (p) {
    var sc = tplScene(p), port = sc.portrait, right = p.side === "right";
    var x = port ? sc.Ww * 0.5 : sc.Ww * (right ? 0.72 : 0.28);
    var a = character(p.character || "og", { x: x, facing: port ? "right" : right ? "left" : "right", outfit: p.outfit || p.era, expression: p.setup || "neutral", scene: sc, scale: port ? 1.0 : 1.05 });
    a.pose(poseName(p.setupPose || "idle"), -5);
    var hl = str(p.headline) || "WAIT WHAT";
    var tk = keyTime(p.keyword || autoKey(hl), hl, 0, D * 0.45);
    if (tk < 0.6) tk = 0.6;
    var rc = reactOf(p.reaction || "shocked");
    a.expression(rc.expr, tk); a.pose(rc.pose, tk - 0.05, 0.22); a.mark(rc.mark, tk + 0.12, 2.4);
    if (rc.expr === "hot") a.sweatOn(tk, D);
    var an = animalName(p.animal);
    if (an) animal(an, { x: port ? sc.Ww * 0.86 : sc.Ww * (right ? 0.26 : 0.74), facing: (port || !right) ? "left" : "right", scene: sc, scale: port ? 0.6 : 0.8, y: port ? sc.G - 40 : sc.G });
    var sp = setName(p.setpiece);
    if (sp) setpiece(sp, { x: port ? sc.Ww * 0.1 : sc.Ww * (right ? 0.08 : 0.94), scene: sc, scale: 0.8 });
    var hx = port ? 0.5 : right ? 0.36 : 0.64;
    headline(hl, tk, { x: hx, y: port ? 0.27 : 0.4, size: "xl", color: p.color || "yellow", kicker: p.kicker, slam: true, maxWidth: port ? 0.94 : 0.56, maxLines: 3 });
    sburst(hx, port ? 0.27 : 0.4, tk, { r: u(port ? 330 : 360), count: 16, color: rgba(C.ink, 0.85) });
    narrate(a, 0, D);
    sc.cam.set({ zoom: 1.02 }).to({ zoom: 1.05 }, 0.2, tk - 0.2, "inOutSine").to({ zoom: 1.16, x: x + (port ? 0 : right ? -40 : 40) }, tk, 0.18, "outCubic").to({ zoom: 1.12 }, tk + 0.3, 1.2, "inOutSine");
    sc.cam.shake(tk, 18, 0.5);
  };

  // mini-diagram: a doodled cross-section on a paper card.
  TPL["mini-diagram"] = function (p) {
    var sc = tplScene(p), port = sc.portrait, sr = safeRect();
    var a = character(p.character || "elder", { x: port ? sc.Ww * 0.5 : sc.Ww * 0.83, facing: port ? "right" : "left", outfit: p.outfit || p.era, expression: p.expression || "neutral", scene: sc, scale: port ? 0.8 : 0.95 });
    a.pose("explain", -5);
    var dw = port ? { x: sr.x / W, y: (sr.y + 10) / H, w: sr.w / W, h: 0.33 } : { x: sr.x / W, y: (sr.y + 4) / H, w: 0.6, h: sr.h / H - 0.02 };
    var dg = diagram(p.kind, { title: p.title, labels: p.labels, arrows: p.arrows, at: 0.25, flow: p.flow, x: dw.x, y: dw.y, w: dw.w, h: dw.h });
    a.pose(port ? "point-up" : "point", dg.drawEnd - 0.4, 0.4);
    a.pose("explain", Math.min(endT(0.4), dg.drawEnd + 2.4), 0.4);
    if (p.mark) a.mark(p.mark, Math.min(endT(0.3), D - 1.8), 1.6);
    narrate(a, 0, D);
    sc.cam.set({ zoom: 1.02 }).to({ zoom: 1.05 }, 0.2, D - 0.5, "inOutSine");
  };

  // list-of-ways: numbered cards, the character acts out each.
  TPL["list-of-ways"] = function (p) {
    var sc = tplScene(p), port = sc.portrait, sr = safeRect(), s0 = need();
    var items = arr(p.items).map(obj).filter(function (it) { return str(it.text); }).slice(0, 6);
    if (!items.length) items = [{ text: "one" }, { text: "two" }];
    var a = character(p.character || "og", { x: port ? sc.Ww * 0.76 : sc.Ww * 0.8, facing: "left", outfit: p.outfit || p.era, expression: p.expression || "neutral", scene: sc, scale: port ? 0.8 : 1 });
    a.pose("idle", -5);
    var title = str(p.title), th = 0;
    if (title) { var h = headline(title, 0.25, { pos: "top", size: port ? "md" : "md", kicker: p.kicker, maxWidth: port ? 0.92 : 0.7, color: "yellow" }); if (h) th = h.box.y + h.box.h - sr.y + u(16); }
    var times = seqTimes(items.map(function (it) { return it.text; }), items.map(function (it) { return it.word; }), { first: 0.9, gap: 0.6 });
    var n = items.length;
    var area = port ? { x: sr.x, y: sr.y + th, w: sr.w * 0.66, h: sr.h - th - u(80) } : { x: sr.x, y: sr.y + th, w: sr.w * 0.6, h: sr.h - th - u(60) };
    var rowH = Math.min(area.h / n, u(port ? 110 : 150)), size = Math.min(u(port ? 50 : 52), rowH * 0.5);
    var blockH = rowH * n, y0 = area.y + (area.h - blockH) / 2;
    var g = svg("g", null, s0.og);
    var rows = items.map(function (it, i) {
      var lay = layoutText(it.text, { size: size, maxWidth: area.w - rowH * 1.2 - u(40), maxLines: 1, family: HFONT, upper: true, minSize: size * 0.55 });
      var rw = lay.w + rowH * 0.9 + u(48), rh = rowH * 0.84, cy = y0 + rowH * (i + 0.5), cx = area.x + rw / 2;
      var rg = svg("g", { display: "none" }, g), inner = svg("g", null, rg);
      var R = V.makeRand(i + 31);
      var cardF = svg("path", { d: wobPoly([[-rw / 2, -rh / 2], [rw / 2, -rh / 2], [rw / 2, rh / 2], [-rw / 2, rh / 2]], R, u(4)), fill: C.cream, stroke: C.ink, "stroke-width": f2(u(5)), "stroke-linejoin": "round" }, inner);
      var br = rh * 0.42;
      svg("circle", { cx: f2(-rw / 2 + rh * 0.52), cy: 0, r: f2(br), fill: C.red, stroke: C.ink, "stroke-width": f2(u(5)) }, inner);
      var nl = layoutText(String(i + 1), { size: br * 1.3, maxWidth: br * 1.6, maxLines: 1, family: HFONT });
      writeBlock(inner, nl, -rw / 2 + rh * 0.52, br * 0.04, { color: C.white, stroke: C.ink, strokeW: u(6) });
      writeBlock(inner, lay, -rw / 2 + rh + u(18) + lay.w / 2, 0, { color: C.ink, emColor: C.red, asc: 0.36 });
      return { g: rg, inner: inner, card: cardF, at: times[i], cx: cx, cy: cy, w: rw, h: rh, rot: i % 2 ? 1.2 : -1.2 };
    });
    onOver(function (t) {
      rows.forEach(function (r, i) {
        var q = popEnv(t, r.at, null, 0.32);
        r.g.setAttribute("display", q > 0.001 ? "inline" : "none");
        if (q <= 0.001) return;
        var curI = -1; rows.forEach(function (rr, k) { if (t >= rr.at) curI = k; });
        var active = curI === i;
        var sl = (1 - Math.min(1, q)) * -u(60);
        r.g.setAttribute("transform", "translate(" + P2(r.cx + sl, r.cy) + ") rotate(" + f2(r.rot) + ") scale(" + f2(q * (active ? 1.04 : 0.97)) + ")");
        r.card.setAttribute("fill", active ? C.yellow : C.cream);
      });
    });
    rows.forEach(function (r) { item("row", "row", r.at + 0.3, null, function () { return { x: r.cx - r.w / 2, y: r.cy - r.h / 2, w: r.w, h: r.h }; }); });
    // progress dots
    var dots = items.map(function (it, i) { return svg("circle", { r: f2(u(11)), stroke: C.ink, "stroke-width": f2(u(4)) }, g); });
    var dy = y0 + blockH + u(26), dx0 = area.x + u(20);
    onOver(function (t) { dots.forEach(function (d, i) { d.setAttribute("cx", f2(dx0 + i * u(34))); d.setAttribute("cy", f2(dy)); d.setAttribute("fill", t >= times[i] ? C.yellow : rgba(C.cream, 0.6)); d.setAttribute("display", t >= 0.3 ? "inline" : "none"); }); });
    items.forEach(function (it, i) {
      var t = times[i];
      actAs(a, it.activity || ["point-up", "hold-up", "think", "carry", "explain", "cheer"][i % 6], t - 0.1, a.era, it.prop);
      if (!it.prop) a._props.forEach(function (pp) { if (pp.at < t - 0.1 && pp.until > t - 0.1) pp.until = t - 0.1; });
      else a._props.forEach(function (pp) { if (pp.at < t - 0.15 && pp.until > t - 0.1) pp.until = t - 0.1; });
      a.expression(it.expression || p.expression || "neutral", t);
      if (it.mark) a.mark(it.mark, t + 0.2, Math.min(1.5, (times[i + 1] || D) - t - 0.2));
    });
    narrate(a, 0, D);
    sc.cam.set({ zoom: 1.02 }).to({ zoom: 1.05 }, 0.2, D - 0.5, "inOutSine");
  };

  // reaction-close-up: one big face, a snap, a punch.
  TPL["reaction-close-up"] = function (p) {
    var sc = tplScene(p), port = sc.portrait;
    var a = character(p.character || "og", { x: sc.Ww * 0.5, facing: "right", outfit: p.outfit || p.era, expression: p.setup || "neutral", scene: sc });
    a.pose("idle", -5);
    a.allowEdge = true;
    var hr = a.rig.hr * a.scale, hy = a.y0 + a.rig.headY * a.scale;
    var z = port ? clamp(300 / (2 * hr), 1.6, 3) : clamp(400 / (2 * hr), 1.8, 3.2);
    var cy = hy + (port ? 70 : 95) / z;
    sc.cam.set({ x: sc.Ww * 0.5 + (port ? 0 : 0), y: cy, zoom: z * 0.94 });
    var tk = keyTime(p.word, null, 0, D * 0.5);
    if (tk < 0.8) tk = 0.8;
    if (p.setupMark) a.mark(p.setupMark, 0.3, Math.max(0.6, tk - 0.5));
    var rc = reactOf(p.reaction || "shocked");
    a.expression(rc.expr, tk);
    a.mark(rc.mark, tk + 0.08, 3);
    if (rc.expr === "hot" || rc.expr === "scared") a.sweatOn(tk, D);
    sc.cam.to({ zoom: z }, 0.2, tk - 0.3, "inOutSine").to({ zoom: z * 1.14 }, tk, 0.14, "outCubic").to({ zoom: z * 1.08 }, tk + 0.25, 1.4, "inOutSine");
    sc.cam.shake(tk, 10, 0.45);
    var hl = str(p.headline);
    if (hl) headline(hl, tk + 0.12, { pos: "bottom", color: p.color || "yellow", kicker: p.kicker, size: port ? "lg" : "lg", slam: true, maxWidth: port ? 0.94 : 0.7 });
    narrate(a, 0, D);
  };

  // timeline-eras: a road through time with signposts and a year counter.
  TPL["timeline-eras"] = function (p) {
    var eras = arr(p.eras).map(obj).filter(function (e) { return str(e.label) || e.icon; }).slice(0, 7);
    if (eras.length < 2) eras = [{ label: "Stone Age", icon: "cave", year: -50000 }, { label: "Today", icon: "city", year: 2025 }];
    var n = eras.length, port = V.isPortrait, spacing = port ? 600 : 1000;
    var Ww0 = (1000 * W) / H, x0 = Ww0 * 0.42, span = (x0 + spacing * (n - 1) + Ww0 * 0.62) / Ww0;
    var sc = tplScene(p, { span: span });
    var a = character(p.character || "og", { x: x0, facing: "right", outfit: p.era, expression: "neutral", scene: sc, scale: port ? 0.9 : 1 });
    a.keepMoveFacing = true;
    var title = str(p.title);
    var times = seqTimes(eras.map(function (e) { return e.label || ""; }), eras.map(function (e) { return e.word; }), { first: 0.5, gap: 0.9 });
    var R = V.makeRand(77);
    var ICON_SET = { pyramid: "pyramid", column: "column", castle: "tower", house: "hut", fire: "fire", cave: "boulder", wheel: "cart" };
    eras.forEach(function (e, i) {
      var sx = x0 + i * spacing, t = times[i];
      setpiece("signpost", { x: sx + (port ? 205 : 270), text: e.label || "", icon: pick(ICONS, e.icon, "star"), scene: sc, at: Math.max(0.15, t - (i ? 0.9 : 0.1)) });
      var spn = ICON_SET[pick(ICONS, e.icon, "")];
      if (spn) setpiece(spn, { x: sx + (port ? 330 : 470), scene: sc, scale: spn === "pyramid" ? 0.5 : spn === "tower" ? 0.62 : spn === "column" ? 0.75 : 0.7 });
      if (e.icon === "mammoth") animal("mammoth", { x: sx + (port ? 280 : 440), facing: "left", scene: sc, scale: 0.6 });
      if (i > 0) {
        var prevT = times[i - 1], travel = Math.min(spacing / 260, Math.max(0.6, t - prevT - 0.3)), st0 = Math.max(prevT + 0.25, t - travel);
        var dur = Math.max(0.5, t - st0);
        a.moveTo(sx, st0, dur, { gait: spacing / dur > 420 ? "run" : "walk", ease: "inOutSine" });
      }
      a.expression(e.expression || (i === n - 1 ? "deadpan" : "happy"), t);
      if (e.mark) a.mark(e.mark, t + 0.15, Math.min(1.5, (times[i + 1] || D) - t - 0.2));
      a.pose(i === n - 1 ? "shrug" : "point", t, 0.3);
      if (i + 1 < n) a.pose("idle", Math.max(t + 0.5, times[i + 1] - Math.min(spacing / 260, times[i + 1] - t - 0.3) - 0.2), 0.3);
    });
    if (title) headline(title, 0.25, { pos: "top", size: "sm", until: Math.max(1.6, times[0] - 0.05 + 1.4), color: "white" });
    var anyYear = eras.some(function (e) { return e.year != null; });
    if (anyYear) yearCounter({ from: num(eras[0].year, 0), format: p.format || "bc", label: p.label, at: Math.max(0.2, times[0] - 0.2), stops: eras.slice(1).map(function (e, i) { return { at: times[i + 1], value: num(e.year, 0) }; }), y: port ? 0.27 : title ? 0.27 : 0.17 });
    narrate(a, 0, D);
    sc.cam.set({ zoom: port ? 1.0 : 1.03, x: x0 + (port ? 60 : 200) });
    sc.cam.follow(a, 0, D, { lead: port ? 70 : 220 });
  };

  // ------------------------- render, fallback, inspect -------------------------
  function render(id, root, props) {
    var fn = TPL[id];
    if (!fn) throw new Error("Unknown template: " + id);
    init(root || V.root());
    fn(obj(props));
  }
  function fallback(root, narration) {
    root = root || V.root();
    while (root.firstChild) root.removeChild(root.firstChild);
    st = null;
    init(root);
    var sc = sceneAPI("savanna", {});
    var a = character("og", { x: sc.Ww * (sc.portrait ? 0.5 : 0.62), facing: "left", expression: "deadpan", scene: sc });
    a.pose("shrug", 0.2);
    a.mark("...", 0.6, 3);
    var words = contentWords(narration || V.narration).slice(0, 4).join(" ") || "MEANWHILE";
    headline(words, 0.25, { pos: "top", size: "md" });
    narrate(a, 0, D);
    flushAll();
  }
  function flushAll() {
    if (!st) return;
    st.scenes.forEach(function (sc) { finalizeCam(sc); });
    var pend = st.pending.slice().sort(function (a, b) { return (a.t || 0) - (b.t || 0); });
    st.pending.length = 0;
    pend.forEach(function (fn) { try { fn(); } catch (e) { V.error("[doodle-world] layout: " + (e && e.message ? e.message : e)); } });
    frame(V.time());
  }
  function inspect(t) {
    if (!st) return [];
    t = num(t, V.time());
    frame(t);
    return boxesAt(t);
  }

  // ------------------------- exports -------------------------
  S.scene = sceneAPI;
  S.character = character;
  S.animal = animal;
  S.setpiece = setpiece;
  S.fire = function (x, y, scale) { var sc = cur(); return fire(sc, num(x, sc.Ww / 2), num(y, sc.G), num(scale, 1)); };
  S.prop = freeProp;
  S.weather = weather;
  S.tint = tint;
  S.burst = burst;
  S.sburst = sburst;
  S.narrate = narrate;
  S.headline = headline;
  S.callout = callout;
  S.indicator = indicator;
  S.yearCounter = yearCounter;
  S.bubble = bubble;
  S.thought = thought;
  S.dialogue = dialogue;
  S.diagram = diagram;
  S.captions = captions;
  S.eraIcon = eraIcon;
  S.propIcon = propIcon;
  S.camera = camera;
  S.lines = lines;
  S.syncAt = syncAt;
  S.syncTimes = syncTimes;
  S.autoKey = autoKey;
  S.find = kwFind;
  S.when = when;
  S.mark = function (target, kind, at, dur) { return mark(target, kind, at, dur); };
  S.safe = safeRect;
  S.measureBlock = function (text, o) { return measureBlock(text, Object.assign({ family: HFONT }, obj(o))); };
  S.u = u;
  S.cast = CAST_IDS.slice();
  S.castInfo = function () { var o = {}; CAST_IDS.forEach(function (k) { o[k] = CAST[k].who; }); return o; };
  S.poses = POSE_IDS.slice();
  S.expressions = EXPR_IDS.slice();
  S.outfits = ERAS.slice();
  S.locations = LOCS.slice();
  S.animals = ANIMAL_IDS.slice();
  S.propNames = PROP_NAMES.slice();
  S.setpieces = SET_NAMES.slice();
  S.marks = MARKS.slice();
  S.icons = ICONS.slice();
  S.activities = Object.keys(ACTIVITY);
  S.colors = Object.assign({}, C);
  S.templates = Object.keys(TPL);
  S.render = render;
  S.inspect = inspect;
  S.flush = flushAll;
  S.fallback = fallback;
})();

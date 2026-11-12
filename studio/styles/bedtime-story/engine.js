/* Bedtime Story engine (style id: bedtime-story).
 *
 * Every scene is a painted picture-book page.
 *
 * Architecture
 * - Build time: S.book(root) makes one page (.sb) with layers back, mid, cast, front, text, fx, grain, top.
 *   The paper is a canvas painted once (cream base, soft mottling, fibres, tea-stained deckled edge). The
 *   grain is a second canvas above everything except the page turn, so paint, ink and type all sit "in" the
 *   paper. Locations (S.painting) are painted procedurally into canvases at build time: layered translucent
 *   washes with wobbly edges (seeded sine noise along the outline), blurred under-layers, darker pooled
 *   edges, lifted "backruns", pencil contour lines and a multiplied paper grain. A painting has a sky
 *   canvas, a far canvas that drifts slowly (parallax), a near canvas that stays put (the cast stands on
 *   it), ambient sprites (clouds, birds, smoke, leaves, fireflies, stars, fire, boats) and a paper-coloured
 *   edge overlay that feathers the painting into the page. Characters and objects are pen-and-wash SVG:
 *   each shape is a wobbly wash (fill, lighter bloom, darker pooled edge) plus a slightly misregistered
 *   pencil line (pathLength 1, so it can draw itself on).
 * - One frame function per book (registered with V.onFrame) calls every updater with t. Updaters only read
 *   t and precomputed data, so the frame for time t never depends on the previous frame (seeking works
 *   both ways). Reveals are CSS masks (radial blooms, brush sweeps), opacity and dash offsets.
 * - Characters: one simple rig per cast member (legs, upper body, head, two-segment arms, optional tail,
 *   ears or wings) in local units, feet at y 0, an adult is 300 units tall. Poses are joint-angle vectors
 *   blended with soft easing; talk() makes syllable visemes from V.words; blinks are seeded.
 * - Timing: templates find their words (V.find, keyword props, emphasised word, the longest content word,
 *   then a narration estimate), spread the missing ones and clamp every beat into [0.2, duration - 1].
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
  var SERIF = '"Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif';
  var SERIF2 = 'Georgia, "Times New Roman", serif';
  var PORT = H > W * 1.15, SQ = !PORT && W < H * 1.15, STACK = PORT || SQ;

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
  function smooth(p) { p = clamp(p, 0, 1); return p * p * (3 - 2 * p); }
  function soft(p) { return -(Math.cos(PI * clamp(p, 0, 1)) - 1) / 2; }
  function outC(p) { p = clamp(p, 0, 1); return 1 - Math.pow(1 - p, 3); }
  function prog(t, a, d) { return d > 0 ? clamp((t - a) / d, 0, 1) : t >= a ? 1 : 0; }
  function hash(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function hstr(s) { s = String(s); var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 100000; }
  function rng(seed) { return V.makeRand(Math.floor(seed * 9973 + 17) >>> 0 || 1); }
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
  function setA(el, k, v) { v = String(v); if (el["_a" + k] !== v) { el["_a" + k] = v; el.setAttribute(k, v); } }
  function setV(el, k, v) { v = String(v); if (el["_v" + k] !== v) { el["_v" + k] = v; el.style.setProperty(k, v); } }
  function show(el, on) { setS(el, "display", on ? "" : "none"); }
  var COMB = new RegExp("[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]", "g");
  function normWord(s) {
    return String(s == null ? "" : s).toLowerCase().normalize("NFKD").replace(COMB, "").replace(/[^\p{L}\p{N}]+/gu, "");
  }

  // ------------------------- colour -------------------------
  var C = {
    paper: "#F4EAD5", cream: "#FBF4E4", ink: "#3B2F2A", terracotta: "#D9734E", rust: "#B4532F", rose: "#D98C8C",
    blush: "#EDB9A8", ochre: "#C99A45", honey: "#E2B25C", butter: "#F1D894", gold: "#D6A93A", sage: "#9BAE86",
    moss: "#7C8F6A", leaf: "#8FAE6B", spring: "#B7CC8A", forest: "#4F6B4A", pine: "#3F5A48", sky: "#8DB3C9",
    skyLt: "#C4DAE3", blue: "#6F94B5", sea: "#7FA8B8", teal: "#5E8C8A", navy: "#34466B", night: "#26304E",
    indigo: "#3E4A78", plum: "#7D5A78", lilac: "#B3A2C4", violet: "#8C7BAA", brown: "#7A5238", bark: "#6B4A35",
    wood: "#A0714B", sand: "#E5D2A8", stone: "#B5AEA2", slate: "#7E8790", snow: "#F8F5EE",
    skin: "#F1CBA8", skinDk: "#E3AE8A", cheek: "#E89A8A", hairBrown: "#7A4B2E", hairGinger: "#B9773E", silver: "#D9D6D0",
    fox: "#D27A3E", foxLt: "#F3DDC0", bear: "#8A5A3B", bearLt: "#C9996D", bunny: "#CFC4B8", bunnyLt: "#F1E9E0", owl: "#A77A4F", owlLt: "#EBD9B8",
  };
  function hexRGB(h) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(h));
    if (!m) return [128, 128, 128];
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbHex(c) { return "#" + ((1 << 24) | (clamp(Math.round(c[0]), 0, 255) << 16) | (clamp(Math.round(c[1]), 0, 255) << 8) | clamp(Math.round(c[2]), 0, 255)).toString(16).slice(1); }
  function mixC(a, b, p) { var x = hexRGB(a), y = hexRGB(b); return rgbHex([lerp(x[0], y[0], p), lerp(x[1], y[1], p), lerp(x[2], y[2], p)]); }
  function shade(h, k) { var c = hexRGB(h); return rgbHex([c[0] * k, c[1] * k, c[2] * k]); }
  function tint(h, k) { return mixC(h, "#FFFFFF", k); }
  function rgba(h, a) { var c = hexRGB(h); return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + f2(a) + ")"; }
  function colorOf(v, d) { v = str(v); if (C[v]) return C[v]; if (/^#[0-9a-f]{6}$/i.test(v)) return v; return d; }

  // ------------------------- text -------------------------
  var mctx = null;
  function fontStr(size, italic, weight) { return (italic ? "italic " : "") + (weight || 400) + " " + f1(size) + "px " + SERIF; }
  function measure(text, size, italic, weight) {
    if (!mctx) mctx = doc.createElement("canvas").getContext("2d");
    mctx.font = fontStr(size, italic, weight);
    return mctx.measureText(text).width;
  }
  // "*word*" marks emphasis. Returns [{w, em}]
  function parseRich(text) {
    var out = [], em = false;
    str(text).replace(/\s+/g, " ").split(" ").forEach(function (tok) {
      if (!tok) return;
      var s = tok, e0 = em, open = false, close = false;
      if (s.charAt(0) === "*") { open = true; s = s.slice(1); }
      var lead = /^[^\p{L}\p{N}*]*\*/u.exec(s);
      if (!open && lead) { open = true; s = s.replace("*", ""); }
      if (/\*[^\p{L}\p{N}]*$/u.test(s)) { close = true; s = s.replace(/\*(?=[^\p{L}\p{N}]*$)/u, ""); }
      s = s.replace(/\*/g, "");
      if (open) e0 = true;
      if (s) out.push({ w: s, em: e0 || em });
      if (open && !close) em = true;
      if (close) em = false;
    });
    return out;
  }
  function plain(text) { return str(text).replace(/\*/g, ""); }
  // Greedy wrap with a width per line (lw(i)); words measured once at this size.
  function wrapVar(words, size, lw, italic, weight) {
    var lines = [], cur = [], cw = 0, sp = measure(" ", size, italic, weight);
    words.forEach(function (wd) {
      var ww = wd.mw != null ? wd.mw : measure(wd.w, size, italic || wd.em, weight);
      if (cur.length && cw + sp + ww > lw(lines.length)) { lines.push({ words: cur, w: cw }); cur = []; cw = 0; }
      cw += (cur.length ? sp : 0) + ww;
      cur.push(wd);
    });
    if (cur.length) lines.push({ words: cur, w: cw });
    return lines;
  }
  // Fit rich text into maxW x maxH (or maxLines): shrink until it fits, then balance the lines.
  // o: size, minSize, maxW, maxH, maxLines, lh, italic, weight, indent: { lines, w } (drop cap room)
  function layoutText(text, o) {
    o = o || {};
    var words = Array.isArray(text) ? text : parseRich(text), size = o.size || 48, minSize = o.minSize || Math.max(14, size * 0.45);
    var maxW = o.maxW || 600, lh = o.lh || 1.38, italic = !!o.italic, weight = o.weight || 400;
    var ind = o.indent || null, lines, sz = size;
    function lwFor(s, T) {
      var capW = ind ? ind.w * (s / size) : 0, capN = ind ? ind.lines : 0;
      return function (i) { return Math.min(T, maxW) - (i < capN ? capW : 0); };
    }
    function widest(s) { var m = 0; words.forEach(function (wd) { m = Math.max(m, measure(wd.w, s, italic || wd.em, weight)); }); return m; }
    for (var guard = 0; guard < 40; guard++) {
      lines = wrapVar(words, sz, lwFor(sz, maxW), italic, weight);
      var hh = lines.length * sz * lh, okH = o.maxH ? hh <= o.maxH : true, okL = o.maxLines ? lines.length <= o.maxLines : true;
      if ((okH && okL && widest(sz) <= lwFor(sz, maxW)(0) + 0.5) || sz <= minSize) break;
      sz = Math.max(minSize, sz * 0.95);
    }
    if (lines.length > 1 && o.balance !== false) {
      var lo = maxW * (o.balanceMin || 0.45), hi = maxW, n = lines.length;
      for (var i = 0; i < 14; i++) {
        var mid = (lo + hi) / 2, l2 = wrapVar(words, sz, lwFor(sz, mid), italic, weight), ok = l2.length <= n;
        l2.forEach(function (l, li) { if (l.w > lwFor(sz, mid)(li) + 0.5 && l.words.length === 1) ok = false; });
        if (ok) hi = mid; else lo = mid;
      }
      lines = wrapVar(words, sz, lwFor(sz, hi + 0.5), italic, weight);
    }
    var w = 0;
    lines.forEach(function (l, li) { w = Math.max(w, l.w + (ind && li < ind.lines ? ind.w * (sz / size) : 0)); });
    return { size: sz, lines: lines, w: w, h: lines.length * sz * lh, lh: lh, italic: italic, weight: weight, scale: sz / size };
  }

  // ------------------------- word timing -------------------------
  var STOP = {};
  "a an the and or but of to in on at by for with from into onto over under is are was were be been being it its this that these those your you we our us my me i his her their they them he she as than then so not no yes do does did have has had will would can could should very just more most less each every all any some about here there what when who how why which also too up out if im whats thats youre dont wont cant said one".split(" ").forEach(function (w) { STOP[w] = 1; });
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
    return plain(text).split(/[^\p{L}\p{N}'%$-]+/u).filter(function (w) { var n = normWord(w); return n.length > 1 && !STOP[n]; });
  }
  function labelTime(label, keyword, after) {
    if (keyword) { var t = kwFind(keyword, after); if (t != null) return t; }
    var em = /\*([^*]+)\*/.exec(str(label));
    if (em) { var te = kwFind(em[1].split(/\s+/)[0], after); if (te != null) return te; }
    var ws = contentWords(label).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < ws.length; i++) { var f = V.find(ws[i], after || 0); if (f != null) return f; }
    for (i = 0; i < ws.length; i++) { var e = narrationEstimate(ws[i], after); if (e != null) return e; }
    return null;
  }
  // Fill missing times by spreading them between known neighbours.
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
  // Times for a list of items: [{ label, keyword }] in order. Monotonic, clamped, at least `gap` apart.
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
    // compress from the end if the last ones run past the limit
    var lim = (o.limit || endLimit()) - (o.tail || 0);
    for (i = out.length - 1; i >= 0; i--) {
      var maxI = lim - (out.length - 1 - i) * gap * 0.6;
      if (out[i] > maxI) out[i] = maxI;
    }
    return out.map(function (t) { return tc(t - (o.lead || 0)); });
  }
  // Align the words of a text to V.words from `from`. Returns one start time per word (null-free).
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
          if (ws[i].start > to + 0.6) break;
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
  // Timing windows for narration lines (in order): [{ start, end, found, times }]
  function lineWindows(lines) {
    var ws = V.words || [], nw = ws.map(function (w) { return normWord(w.word); });
    var cur = 0, out = [];
    lines.forEach(function (line) {
      var toks = plain(line).split(/\s+/).map(normWord).filter(Boolean), hit = -1;
      if (toks.length && ws.length) {
        for (var pass = 0; pass < 2 && hit < 0; pass++) {
          for (var i = cur; i < ws.length; i++) {
            var need = Math.min(toks.length, pass ? 1 : 2), ok = true;
            for (var j = 0; j < need; j++) if (nw[i + j] !== toks[j]) { ok = false; break; }
            if (ok) { hit = i; break; }
          }
        }
      }
      if (hit < 0) { out.push({ start: null, end: null, found: false, n: Math.max(1, toks.length) }); return; }
      var last = Math.min(ws.length - 1, hit + toks.length - 1), lt = toks[toks.length - 1];
      for (var d = 0; d <= 3; d++) {
        if (nw[last + d] === lt) { last = last + d; break; }
        if (last - d > hit && nw[last - d] === lt) { last = last - d; break; }
      }
      out.push({ start: ws[hit].start, end: ws[last].end, found: true, n: toks.length });
      cur = last + 1;
    });
    var total = 0;
    out.forEach(function (o) { total += o.n; });
    var t0 = 0.3, t1 = endLimit(), acc = 0;
    out.forEach(function (o, i) {
      var a = t0 + ((t1 - t0) * acc) / Math.max(1, total), b = t0 + ((t1 - t0) * (acc + o.n)) / Math.max(1, total);
      acc += o.n;
      if (o.found) return;
      var prevEnd = i > 0 && out[i - 1].end != null ? out[i - 1].end + 0.15 : a, next = null;
      for (var j = i + 1; j < out.length; j++) if (out[j].found) { next = out[j].start; break; }
      o.start = Math.max(a, prevEnd);
      o.end = next != null ? Math.min(Math.max(b, o.start + 0.6), next - 0.15) : Math.max(b, o.start + 0.6);
      if (o.end < o.start + 0.4) o.end = o.start + 0.4;
    });
    return out.map(function (o) { return { start: o.start, end: o.end, found: o.found }; });
  }
  function speechSpan() {
    var ws = V.words || [];
    if (!ws.length) return { start: 0.3, end: endLimit() };
    return { start: ws[0].start, end: Math.min(D, ws[ws.length - 1].end) };
  }

  // ------------------------- wobbly geometry -------------------------
  // Shapes: ["e", cx, cy, rx, ry] ellipse, ["r", x, y, w, h, r] rounded rect, ["p", [[x,y],...]] closed polygon,
  // ["l", [[x,y],...]] open line. All become dense point lists, then get a seeded wobble along the normal.
  function densify(pts, closed, step) {
    var out = [], n = pts.length, m = closed ? n : n - 1;
    for (var i = 0; i < m; i++) {
      var a = pts[i], b = pts[(i + 1) % n], len = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(len / step));
      for (var j = 0; j < k; j++) out.push([a[0] + ((b[0] - a[0]) * j) / k, a[1] + ((b[1] - a[1]) * j) / k]);
    }
    if (!closed) out.push(pts[n - 1].slice());
    return out;
  }
  function shapePts(sh, step) {
    var t = sh[0], pts, closed = true, i, n;
    step = step || 4;
    if (t === "e") {
      var rx = sh[3], ry = sh[4] == null ? sh[3] : sh[4];
      n = clamp(Math.round((PI * (rx + ry)) / step), 14, 90);
      pts = [];
      for (i = 0; i < n; i++) { var a = (i / n) * TAU - PI / 2; pts.push([sh[1] + Math.cos(a) * rx, sh[2] + Math.sin(a) * ry]); }
      return { pts: pts, closed: true };
    }
    if (t === "r") {
      var x = sh[1], y = sh[2], w = sh[3], h = sh[4], r = Math.min(sh[5] || 0, w / 2, h / 2);
      pts = [];
      var corners = [[x + w - r, y + r, -PI / 2], [x + w - r, y + h - r, 0], [x + r, y + h - r, PI / 2], [x + r, y + r, PI]];
      corners.forEach(function (c) {
        var k = Math.max(2, Math.round((r * PI) / 2 / step));
        for (var j = 0; j <= k; j++) { var a2 = c[2] + (j / k) * (PI / 2); pts.push([c[0] + Math.cos(a2) * r, c[1] + Math.sin(a2) * r]); }
      });
      return { pts: densify(pts, true, step), closed: true };
    }
    if (t === "l") closed = false;
    return { pts: densify(sh[1], closed, step), closed: closed };
  }
  function cumLen(pts, closed) {
    var L = [0], s = 0, n = pts.length;
    for (var i = 1; i < n + (closed ? 1 : 0); i++) { var a = pts[i - 1], b = pts[i % n]; s += Math.hypot(b[0] - a[0], b[1] - a[1]); L.push(s); }
    return { L: L, total: s || 1 };
  }
  function wobble(pts, closed, amp, seed) {
    if (!amp) return pts.map(function (p) { return p.slice(); });
    var r = rng(seed), n = pts.length, cl = cumLen(pts, closed);
    var f1_ = closed ? 2 + Math.floor(r() * 3) : 1 + r() * 2, f2_ = closed ? 5 + Math.floor(r() * 4) : 3 + r() * 3, p1 = r() * TAU, p2 = r() * TAU;
    var out = [];
    for (var i = 0; i < n; i++) {
      var a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
      if (!closed) { a = pts[Math.max(0, i - 1)]; b = pts[Math.min(n - 1, i + 1)]; }
      var tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1, nx = -ty / tl, ny = tx / tl;
      var s = cl.L[i] / cl.total;
      var d = amp * (0.6 * Math.sin(TAU * f1_ * s + p1) + 0.3 * Math.sin(TAU * f2_ * s + p2) + 0.25 * (r() - 0.5));
      if (!closed) d *= Math.min(1, Math.min(s, 1 - s) * 8 + 0.2);
      out.push([pts[i][0] + nx * d, pts[i][1] + ny * d]);
    }
    return out;
  }
  // Catmull-Rom through points -> SVG path data (also usable as Path2D).
  function pathD(pts, closed) {
    var n = pts.length;
    if (n < 2) return "";
    var d = "M" + f2(pts[0][0]) + " " + f2(pts[0][1]);
    var m = closed ? n : n - 1;
    for (var i = 0; i < m; i++) {
      var p0 = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[closed ? (i + 2) % n : Math.min(n - 1, i + 2)];
      var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6, c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += "C" + f2(c1x) + " " + f2(c1y) + " " + f2(c2x) + " " + f2(c2y) + " " + f2(p2[0]) + " " + f2(p2[1]);
    }
    return d + (closed ? "Z" : "");
  }
  function centroid(pts) { var x = 0, y = 0; pts.forEach(function (p) { x += p[0]; y += p[1]; }); return [x / pts.length, y / pts.length]; }
  function bbox(pts) {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    pts.forEach(function (p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function scalePts(pts, k, c, dx, dy) { return pts.map(function (p) { return [c[0] + (p[0] - c[0]) * k + (dx || 0), c[1] + (p[1] - c[1]) * k + (dy || 0)]; }); }
  function trimPts(pts, closed, a, b) { // part of a closed loop from fraction a to b (for sketchy gaps)
    var n = pts.length, i0 = Math.floor(n * a), i1 = Math.ceil(n * b), out = [];
    for (var i = i0; i <= i1; i++) out.push(pts[i % n]);
    return out;
  }

  // ------------------------- pen-and-wash SVG markup -------------------------
  var PEN = "#4A3A30";
  var seedCounter = 1;
  // A watercolor wash: base fill, a lighter bloom toward the top-left, a darker pooled edge.
  // o: a (alpha), wob (wobble in units), seed, bloom (false to skip), edge (0 to skip), cls
  function wsh(sh, c, o) {
    o = o || {};
    var seed = o.seed != null ? o.seed : seedCounter++;
    var g = shapePts(sh, o.step || 3), wob = o.wob == null ? 1.1 : o.wob;
    var p0 = wobble(g.pts, g.closed, wob, seed), d0 = pathD(p0, true);
    var a = o.a == null ? 0.9 : o.a, cls = o.cls || "sbw", out = "";
    out += '<path class="' + cls + '" d="' + d0 + '" fill="' + c + '" fill-opacity="' + f2(a) + '"/>';
    if (o.bloom !== false) {
      var bb = bbox(p0), cc = centroid(p0);
      var p1 = scalePts(wobble(g.pts, g.closed, wob * 1.3, seed + 7), 0.7, cc, -bb.w * 0.07, -bb.h * 0.09);
      out += '<path class="' + cls + '" d="' + pathD(p1, true) + '" fill="' + tint(c, 0.38) + '" fill-opacity="' + f2(a * 0.5) + '"/>';
    }
    if (o.edge !== 0) {
      out += '<path class="' + cls + '" d="' + d0 + '" fill="none" stroke="' + shade(c, 0.72) + '" stroke-width="' + f2(o.ew || 1.5) + '" stroke-opacity="' + f2(o.edge || 0.4) + '" stroke-linejoin="round"/>';
    }
    return out;
  }
  // A pencil line over a shape, slightly misregistered, with a small gap on closed shapes.
  // o: w (width), c (colour), op (opacity), seed, gap (0..0.1), dx, dy, wob
  function pen(sh, o) {
    o = o || {};
    var seed = o.seed != null ? o.seed : seedCounter++;
    var g = shapePts(sh, o.step || 3), r = rng(seed + 3);
    var p = wobble(g.pts, g.closed, o.wob == null ? 0.7 : o.wob, seed + 11);
    var dx = o.dx == null ? 0.7 : o.dx, dy = o.dy == null ? 0.5 : o.dy;
    p = p.map(function (q) { return [q[0] + dx, q[1] + dy]; });
    var d;
    if (g.closed) {
      var gap = o.gap == null ? 0.04 : o.gap, st = r();
      var n = p.length, rot = Math.floor(st * n), rp = p.slice(rot).concat(p.slice(0, rot));
      d = gap > 0 ? pathD(trimPts(rp, true, 0, 1 - gap), false) : pathD(rp, true);
    } else d = pathD(p, false);
    return '<path class="sbp" pathLength="1" d="' + d + '" fill="none" stroke="' + (o.c || PEN) + '" stroke-width="' + f2(o.w || 2) + '" stroke-opacity="' + f2(o.op == null ? 0.85 : o.op) + '" stroke-linecap="round" stroke-linejoin="round"/>';
  }
  // Both at once (the usual pen-and-wash part).
  function pw(sh, c, o) { o = o || {}; return wsh(sh, c, o) + (o.pen === false ? "" : pen(sh, { w: o.pw, op: o.pop, seed: o.seed != null ? o.seed + 1 : undefined, gap: o.gap })); }
  function solid(sh, c, o) { // a flat dot (eyes, buttons): no bloom, no wobble edge
    o = o || {};
    var g = shapePts(sh, 2);
    return '<path class="' + (o.cls || "sbw") + '" d="' + pathD(wobble(g.pts, g.closed, o.wob == null ? 0.3 : o.wob, o.seed || seedCounter++), true) + '" fill="' + c + '"' + (o.a != null ? ' fill-opacity="' + o.a + '"' : "") + "/>";
  }

  // ------------------------- canvas painting helpers -------------------------
  function mkCanvas(w, h, cls) {
    var c = doc.createElement("canvas");
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    if (cls) c.className = cls;
    return c;
  }
  function P2(pts, closed) { return new Path2D(pathD(pts, closed)); }
  // A canvas wash. sh: shape spec in canvas px. o: alpha, layers, wob, blur, seed, edge, lift, c2 (gradient
  // toward colour c2 from top (y0) to bottom (y1)), gran (granulation dots).
  function cwash(ctx, sh, color, o) {
    o = o || {};
    var seed = o.seed != null ? o.seed : seedCounter++, r = rng(seed);
    var g = shapePts(sh, o.step || 6), wob = o.wob == null ? 4 : o.wob, layers = o.layers || 3, a = o.alpha == null ? 0.8 : o.alpha;
    var blur = o.blur == null ? 1.5 : o.blur, fill = color, bb = bbox(g.pts), last = null;
    if (o.c2) {
      var gr = ctx.createLinearGradient(0, o.y0 != null ? o.y0 : bb.y, 0, o.y1 != null ? o.y1 : bb.y + bb.h);
      gr.addColorStop(0, color); gr.addColorStop(1, o.c2);
      fill = gr;
    }
    ctx.save();
    for (var i = 0; i < layers; i++) {
      var p = wobble(g.pts, g.closed, wob * (1 + i * 0.35), seed + i * 13);
      ctx.filter = blur > 0 ? "blur(" + f1(blur * (i === 0 ? 2.2 : 0.7)) + "px)" : "none";
      ctx.globalAlpha = a * (i === 0 ? 0.6 : 0.42);
      ctx.fillStyle = fill;
      last = P2(p, true);
      ctx.fill(last);
    }
    if (o.edge !== 0) {
      ctx.filter = "blur(0.7px)";
      ctx.globalAlpha = o.edge || 0.35;
      ctx.strokeStyle = shade(color, 0.68);
      ctx.lineWidth = o.ew || 1.8;
      ctx.stroke(last);
    }
    if (o.lift) { // lighter backruns inside the shape
      ctx.save();
      ctx.clip(last);
      ctx.filter = "blur(" + f1(Math.max(2, bb.w * 0.02)) + "px)";
      for (var k = 0; k < o.lift; k++) {
        ctx.globalAlpha = 0.12 + r() * 0.12;
        ctx.fillStyle = tint(color, 0.5);
        var cx = bb.x + r() * bb.w, cy = bb.y + r() * bb.h, rr = Math.max(4, Math.min(bb.w, bb.h) * (0.1 + r() * 0.25));
        ctx.fill(P2(wobble(shapePts(["e", cx, cy, rr, rr * (0.6 + r() * 0.5)], 5).pts, true, rr * 0.15, seed + 40 + k), true));
      }
      ctx.restore();
    }
    if (o.gran) {
      ctx.save();
      ctx.clip(last);
      ctx.filter = "none";
      ctx.fillStyle = shade(color, 0.6);
      var cnt = Math.round((bb.w * bb.h) / 900 * o.gran);
      for (var q = 0; q < cnt; q++) { ctx.globalAlpha = 0.05 + r() * 0.12; ctx.fillRect(bb.x + r() * bb.w, bb.y + r() * bb.h, 1 + r() * 1.8, 1 + r() * 1.8); }
      ctx.restore();
    }
    ctx.restore();
    return last;
  }
  // A soft brush stroke along an open line (paths, waves, grass).
  function cbrush(ctx, pts, width, color, alpha, o) {
    o = o || {};
    var seed = o.seed != null ? o.seed : seedCounter++;
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    var passes = o.passes || 2;
    for (var i = 0; i < passes; i++) {
      var p = wobble(densify(pts, false, 6), false, o.wob == null ? width * 0.15 : o.wob, seed + i * 5);
      ctx.filter = "blur(" + f1(o.blur == null ? Math.max(0.6, width * 0.08) : o.blur) + "px)";
      ctx.globalAlpha = alpha * (i === 0 ? 0.65 : 0.45);
      ctx.strokeStyle = color;
      ctx.lineWidth = width * (i === 0 ? 1 : 0.72);
      ctx.stroke(P2(p, false));
    }
    ctx.restore();
  }
  // A pencil line on canvas (two light passes).
  function cpencil(ctx, sh, o) {
    o = o || {};
    var seed = o.seed != null ? o.seed : seedCounter++, g = shapePts(sh, 5);
    ctx.save();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.filter = "none";
    ctx.strokeStyle = o.c || PEN;
    for (var i = 0; i < 2; i++) {
      var p = wobble(g.pts, g.closed, o.wob == null ? 1.2 : o.wob, seed + i * 3);
      if (g.closed) p = trimPts(p, true, 0.02 * i, 0.97 + 0.02 * i);
      ctx.globalAlpha = (o.op == null ? 0.5 : o.op) * (i ? 0.55 : 1);
      ctx.lineWidth = (o.w || 1.4) * (i ? 0.7 : 1);
      ctx.stroke(P2(p.map(function (q) { return [q[0] + i * 0.8, q[1] + i * 0.6]; }), false));
    }
    ctx.restore();
  }
  // Seeded noise tile for the paper grain.
  var grainTile = null;
  function getGrain() {
    if (grainTile) return grainTile;
    var n = 320, c = mkCanvas(n, n), ctx = c.getContext("2d"), img = ctx.createImageData(n, n), r = rng(4242);
    for (var i = 0; i < n * n; i++) {
      var v = r(), dark = v < 0.5, k = dark ? 70 : 255, a = dark ? (0.5 - v) * 2 : (v - 0.5) * 2;
      a = Math.pow(a, 2.2) * (dark ? 46 : 40);
      img.data[i * 4] = dark ? k + 20 : k; img.data[i * 4 + 1] = dark ? k : k - 6; img.data[i * 4 + 2] = dark ? k - 20 : k - 22; img.data[i * 4 + 3] = a;
    }
    ctx.putImageData(img, 0, 0);
    grainTile = c;
    return c;
  }
  function grainFill(ctx, w, h, alpha, scale) {
    var pat = ctx.createPattern(getGrain(), "repeat");
    ctx.save();
    ctx.globalAlpha = alpha;
    if (scale && scale !== 1) ctx.scale(scale, scale);
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, w / (scale || 1) + 2, h / (scale || 1) + 2);
    ctx.restore();
  }
  // The paper: cream base, soft mottling, fibres, tea-stained deckled edges.
  var paperCanvas = null;
  function paintPaper(w, h, seed) {
    var c = mkCanvas(w, h, "sb-paper"), ctx = c.getContext("2d"), r = rng(seed || 77), s = Math.min(w, h) / 1080;
    ctx.fillStyle = C.paper; ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.filter = "blur(" + f1(60 * s) + "px)";
    for (var i = 0; i < 26; i++) {
      ctx.globalAlpha = 0.16 + r() * 0.16;
      ctx.fillStyle = r() < 0.55 ? "#FBF3E3" : "#E9D9BA";
      ctx.beginPath();
      ctx.ellipse(r() * w, r() * h, (80 + r() * 260) * s, (60 + r() * 200) * s, r() * PI, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = "#B59B74"; ctx.lineCap = "round";
    for (i = 0; i < 260; i++) {
      ctx.globalAlpha = 0.05 + r() * 0.07;
      ctx.lineWidth = (0.6 + r() * 0.8) * s;
      var x = r() * w, y = r() * h, a = r() * TAU, L = (6 + r() * 22) * s;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(a + 0.6) * L * 0.5, y + Math.sin(a + 0.6) * L * 0.5, x + Math.cos(a) * L, y + Math.sin(a) * L);
      ctx.stroke();
    }
    ctx.restore();
    // tea-stained edge: a wobbly band around the page, darker at the corners
    ctx.save();
    var m = 26 * s, edge = wobble(shapePts(["r", m, m, w - 2 * m, h - 2 * m, 30 * s], 12).pts, true, 10 * s, (seed || 77) + 5);
    ctx.filter = "blur(" + f1(34 * s) + "px)";
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = "#C7A97A"; ctx.lineWidth = 90 * s;
    ctx.stroke(P2(edge, true));
    ctx.filter = "blur(" + f1(3 * s) + "px)";
    ctx.globalAlpha = 0.18; ctx.lineWidth = 6 * s; ctx.strokeStyle = "#A88458";
    ctx.stroke(P2(wobble(shapePts(["r", -2 * s, -2 * s, w + 4 * s, h + 4 * s, 0], 10).pts, true, 5 * s, (seed || 77) + 9), true));
    var vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.62);
    vg.addColorStop(0, "rgba(170,130,80,0)"); vg.addColorStop(1, "rgba(150,110,60,0.22)");
    ctx.filter = "none"; ctx.globalAlpha = 1; ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
    ctx.restore();
    grainFill(ctx, w, h, 0.5, 1);
    return c;
  }

  // ------------------------- the book (page, layers, frame loop) -------------------------
  var B = null;
  function SAFE() {
    if (PORT) return { x0: (60 / 1080) * W, y0: (250 / 1920) * H, x1: (1020 / 1080) * W, y1: (1450 / 1920) * H };
    return { x0: W * 0.07, y0: H * 0.07, x1: W * 0.93, y1: H * 0.93 };
  }
  function book(root, o) {
    o = obj(o);
    root = root || V.root();
    var el = div("sb", root);
    place(el, 0, 0, W, H);
    paperCanvas = paintPaper(W, H, 77);
    el.appendChild(paperCanvas);
    var L = {};
    ["back", "mid", "cast", "front", "text", "fx"].forEach(function (k) { L[k] = div("sb-layer sb-" + k, el); });
    var gr = mkCanvas(W, H, "sb-grain"), gctx = gr.getContext("2d");
    grainFill(gctx, W, H, 0.55, 1);
    grainFill(gctx, W, H, 0.35, 1.9);
    el.appendChild(gr);
    L.top = div("sb-layer sb-top", el);
    var st = { el: el, L: L, ups: [], boxes: [], chars: [], tl: V.timeline(), id: (B ? B.id + 1 : 1) };
    B = st;
    V.onFrame(function (t) { for (var i = 0; i < st.ups.length; i++) st.ups[i](t); });
    st.api = { el: el, back: L.back, mid: L.mid, cast: L.cast, front: L.front, text: L.text, fx: L.fx, top: L.top, tl: st.tl, safe: SAFE(), onFrame: function (fn) { onFrame(fn); return st.api; } };
    if (o.turn !== false) pageTurn(0, o.turnDur);
    return st.api;
  }
  function ensure() { if (!B) book(V.root(), { turn: false }); return B; }
  function onFrame(fn) { if (typeof fn === "function") ensure().ups.push(fn); }
  function addBox(kind, label, from, to, get) { ensure().boxes.push({ kind: kind, label: label, from: from, to: to == null ? 1e9 : to, get: get }); }
  function fixedBox(x, y, w, h) { return function () { return { x: x, y: y, w: w, h: h }; }; }

  // A page lifts from the right and turns over to the left (spine at the left edge).
  function pageTurn(at, dur) {
    var st = ensure();
    at = num(at, 0); dur = num(dur, 0.5);
    var wrap = div("sb-turn", st.L.top), shadow = div("sb-turn-shadow", wrap), leaf = div("sb-leaf", wrap);
    place(wrap, 0, 0, W, H);
    wrap.style.perspective = f1(W * 2.2) + "px";
    var face = mkCanvas(W, H, "sb-leaf-paper");
    face.getContext("2d").drawImage(paperCanvas, 0, 0);
    leaf.appendChild(face);
    var shine = div("sb-leaf-shade", leaf);
    var th0 = 68, th1 = 93;
    onFrame(function (t) {
      var p = prog(t, at, dur);
      if (p >= 1) { show(wrap, false); return; }
      show(wrap, true);
      var e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      var th = th0 + (th1 - th0) * (0.25 * p + 0.75 * e), r = (th * PI) / 180, P = W * 2.2;
      setS(leaf, "transform", "rotateY(" + f2(-th) + "deg)");
      setS(shine, "opacity", f2(clamp(0.25 + (th - th0) / 50, 0, 1)));
      var xe = (W * Math.cos(r) * P) / (P - W * Math.sin(r));
      setS(shadow, "transform", "translateX(" + f1(xe) + "px)");
      setS(shadow, "opacity", f2(clamp(1 - p * 0.9, 0, 1)));
    });
  }

  // ------------------------- painted locations -------------------------
  var LOCS = ["forest", "village", "meadow", "seaside", "night-sky", "cottage", "mountains"];
  var LOC_SYN = { woods: "forest", wood: "forest", town: "village", home: "cottage", house: "cottage", kitchen: "cottage", room: "cottage", field: "meadow", garden: "meadow", park: "meadow", hill: "meadow", beach: "seaside", sea: "seaside", ocean: "seaside", coast: "seaside", night: "night-sky", sky: "night-sky", stars: "night-sky", mountain: "mountains", hills: "mountains", peak: "mountains" };
  function locKey(n, def) { n = str(n).toLowerCase().replace(/[\s_]+/g, "-"); if (LOCS.indexOf(n) >= 0) return n; return LOC_SYN[n] || LOC_SYN[n.replace(/-/g, "")] || def || "meadow"; }
  function timeKey(n) { n = str(n).toLowerCase(); return n === "night" || n === "dusk" ? n : n === "evening" || n === "sunset" ? "dusk" : n === "midnight" ? "night" : "day"; }
  var SKY = {
    day: ["#8FB4CB", "#C6DCE4", "#F3E8CE"],
    dusk: ["#7C719E", "#D79B88", "#F2C891"],
    night: ["#1E2746", "#2E3A65", "#4A5785"],
  };
  function todCol(time) {
    return function (c) {
      if (time === "dusk") return shade(mixC(c, "#B5705F", 0.17), 0.94);
      if (time === "night") return shade(mixC(c, "#2A345C", 0.58), 0.8);
      return c;
    };
  }
  function contour(base, list) { // list of [amp, freq, phase]
    return function (fx) { var y = base; for (var i = 0; i < list.length; i++) y += list[i][0] * Math.sin(fx * list[i][1] + list[i][2]); return y; };
  }
  function bandPts(P, fn, x0, x1) {
    var pts = [], n = 40;
    x0 = x0 == null ? -0.06 : x0; x1 = x1 == null ? 1.06 : x1;
    for (var i = 0; i <= n; i++) { var fx = x0 + ((x1 - x0) * i) / n; pts.push([fx * P.w, fn(fx) * P.h]); }
    pts.push([x1 * P.w, P.h * 1.08]); pts.push([x0 * P.w, P.h * 1.08]);
    return pts;
  }
  function band(P, ctx, fn, c, o) {
    o = o || {};
    var pts = bandPts(P, fn, o.x0, o.x1);
    var top = Math.min.apply(null, pts.map(function (p) { return p[1]; }));
    cwash(ctx, ["p", pts], c, { wob: 3 * P.s, blur: o.blur == null ? 1.6 : o.blur, alpha: o.alpha == null ? 0.92 : o.alpha, c2: o.c2, y0: top, y1: P.h, edge: o.edge == null ? 0.3 : o.edge, lift: o.lift == null ? 3 : o.lift, gran: o.gran == null ? 0.25 : o.gran, layers: 3 });
    if (o.pencil !== false) {
      var line = [];
      for (var i = 0; i <= 30; i++) { var fx = (o.x0 == null ? -0.02 : o.x0) + (((o.x1 == null ? 1.02 : o.x1) - (o.x0 == null ? -0.02 : o.x0)) * i) / 30; line.push([fx * P.w, fn(fx) * P.h + 1]); }
      cpencil(ctx, ["l", line], { op: o.pop == null ? 0.32 : o.pop, w: 1.3 * P.s + 0.4 });
    }
  }
  function roundTree(P, ctx, x, yb, hh, o) {
    o = o || {};
    var r = rng(o.seed || x * 3 + yb), col = P.col, tw = hh * 0.09;
    var trunk = ["p", [[x - tw * 0.6, yb], [x - tw * 0.4, yb - hh * 0.55], [x + tw * 0.4, yb - hh * 0.55], [x + tw * 0.6, yb]]];
    cwash(ctx, trunk, col(o.bark || C.bark), { wob: 1.5, blur: 0.8, alpha: 0.95, lift: 0 });
    cpencil(ctx, trunk, { op: 0.4, w: 1.2 * P.s + 0.3 });
    var greens = o.greens || [C.leaf, C.moss, C.forest];
    var cy = yb - hh * 0.66, rr = hh * 0.34;
    var blobs = [[0, 0, 1], [-0.5, 0.25, 0.7], [0.5, 0.22, 0.72], [0.05, -0.38, 0.72], [-0.32, -0.18, 0.6], [0.36, -0.2, 0.6]];
    blobs.forEach(function (b, i) {
      var c = greens[i % greens.length];
      cwash(ctx, ["e", x + b[0] * rr, cy + b[1] * rr, rr * b[2] * (0.92 + r() * 0.16), rr * b[2] * 0.86], col(c), { wob: rr * 0.06, blur: 1.4, alpha: 0.82, lift: 2, gran: 0.3 });
    });
    cpencil(ctx, ["e", x, cy - rr * 0.05, rr * 1.12, rr * 0.98], { op: 0.28, w: 1.2 * P.s + 0.3, wob: rr * 0.08 });
  }
  function pineTree(P, ctx, x, yb, hh, c, o) {
    o = o || {};
    var col = P.col, w0 = hh * 0.36;
    cwash(ctx, ["r", x - hh * 0.025, yb - hh * 0.2, hh * 0.05, hh * 0.2, 2], col(C.bark), { wob: 0.6, blur: 0.5, alpha: 0.9, edge: 0, lift: 0 });
    for (var k = 0; k < 3; k++) {
      var tb = yb - hh * (0.12 + k * 0.26), tt = tb - hh * 0.46, ww = w0 * (1 - k * 0.24);
      var tri = ["p", [[x - ww, tb], [x, tt], [x + ww, tb]]];
      cwash(ctx, tri, col(c || C.pine), { wob: hh * 0.015, blur: 1, alpha: o.alpha || 0.9, lift: 1, edge: 0.3 });
      if (o.pencil !== false) cpencil(ctx, tri, { op: 0.25, w: 1 * P.s + 0.3 });
    }
  }
  function house(P, ctx, x, yb, ww, hh, wall, roof, o) {
    o = o || {};
    var col = P.col, night = P.time === "night", dusk = P.time === "dusk";
    var body = ["p", [[x - ww / 2, yb], [x - ww / 2, yb - hh], [x + ww / 2, yb - hh], [x + ww / 2, yb]]];
    cwash(ctx, body, col(wall), { wob: 1.2, blur: 0.8, alpha: 0.95, lift: 1 });
    var rh = hh * (o.roofH || 0.62), ov = ww * 0.1;
    var rf = ["p", [[x - ww / 2 - ov, yb - hh + 2], [x, yb - hh - rh], [x + ww / 2 + ov, yb - hh + 2]]];
    var ch = [x + ww * 0.22, yb - hh - rh * 0.55];
    if (o.chimney !== false) cwash(ctx, ["r", ch[0] - ww * 0.06, ch[1] - rh * 0.35, ww * 0.12, rh * 0.5, 1], col(C.rust), { wob: 0.6, blur: 0.5, alpha: 0.95, lift: 0 });
    cwash(ctx, rf, col(roof), { wob: 1.2, blur: 0.8, alpha: 0.95, lift: 1, gran: 0.4 });
    var glow = night || dusk;
    var win = function (wx, wy, s2) {
      var sh = ["r", wx - s2 / 2, wy - s2 / 2, s2, s2 * 1.1, s2 * 0.12];
      if (glow) {
        ctx.save(); ctx.filter = "blur(" + f1(s2 * 0.5) + "px)"; ctx.globalAlpha = night ? 0.6 : 0.35; ctx.fillStyle = C.honey;
        ctx.beginPath(); ctx.ellipse(wx, wy, s2 * 1.2, s2 * 1.2, 0, 0, TAU); ctx.fill(); ctx.restore();
      }
      cwash(ctx, sh, glow ? (night ? "#F2C46A" : "#F1D08A") : col(C.skyLt), { wob: 0.5, blur: 0.4, alpha: 0.95, edge: 0.4, lift: 0 });
      cpencil(ctx, sh, { op: 0.45, w: 1 * P.s + 0.3, wob: 0.4 });
      cpencil(ctx, ["l", [[wx, wy - s2 / 2], [wx, wy + s2 * 0.6]]], { op: 0.35, w: 0.9 * P.s + 0.3, wob: 0.2 });
    };
    var s2 = Math.min(ww * 0.22, hh * 0.3);
    win(x - ww * 0.22, yb - hh * 0.62, s2);
    if (o.door !== false) {
      var dr = ["r", x + ww * 0.08, yb - hh * 0.5, ww * 0.24, hh * 0.5, ww * 0.1];
      cwash(ctx, dr, col(o.doorC || C.moss), { wob: 0.6, blur: 0.4, alpha: 0.95, lift: 0 });
      cpencil(ctx, dr, { op: 0.4, w: 1 * P.s + 0.3, wob: 0.4 });
    } else win(x + ww * 0.22, yb - hh * 0.62, s2);
    cpencil(ctx, body, { op: 0.42, w: 1.2 * P.s + 0.3 });
    cpencil(ctx, rf, { op: 0.42, w: 1.2 * P.s + 0.3 });
    return { chimney: [ch[0], ch[1] - rh * 0.35] };
  }
  function flowersDots(P, ctx, fn, y0f, y1f, n, cols, seed) {
    var r = rng(seed);
    for (var i = 0; i < n; i++) {
      var fx = r(), fy = lerp(fn(fx) + 0.015, y1f, r());
      if (fy > y1f) continue;
      var x = fx * P.w, y = fy * P.h, sz = (3 + r() * 4) * P.s * (0.6 + (fy - y0f) * 2);
      ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = P.col(C.forest); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (r() - 0.5) * 3, y + sz * 2.2); ctx.stroke(); ctx.restore();
      cwash(ctx, ["e", x, y, sz, sz * 0.85], P.col(cols[i % cols.length]), { wob: sz * 0.15, blur: 0.6, alpha: 0.85, layers: 2, edge: 0.3, lift: 0 });
    }
  }
  function grassTufts(P, ctx, fn, n, c, seed, y1f) {
    var r = rng(seed);
    for (var i = 0; i < n; i++) {
      var fx = r(), fy = lerp(fn(fx) + 0.01, y1f || 1, Math.pow(r(), 0.8)), x = fx * P.w, y = fy * P.h, hgt = (8 + r() * 14) * P.s * (0.6 + fy);
      for (var k = -1; k <= 1; k++) cbrush(ctx, [[x + k * 3, y], [x + k * 5 + (r() - 0.5) * 6, y - hgt]], 1.6 * P.s + 0.6, P.col(c), 0.5, { passes: 1, wob: 1 });
    }
  }
  function skyPaint(P, ctx) {
    var sk = SKY[P.time], g = ctx.createLinearGradient(0, 0, 0, P.h * P.hz * 1.05);
    g.addColorStop(0, sk[0]); g.addColorStop(0.55, sk[1]); g.addColorStop(1, sk[2]);
    ctx.fillStyle = C.paper; ctx.fillRect(0, 0, P.w, P.h);
    cwash(ctx, ["r", -P.w * 0.05, -P.h * 0.05, P.w * 1.1, P.h * 1.1, 0], sk[1], { c2: sk[2], y0: 0, y1: P.h * P.hz, alpha: 0.95, edge: 0, lift: 0, wob: 0, blur: 0, layers: 1 });
    ctx.save(); ctx.globalAlpha = 0.9; ctx.fillStyle = g; ctx.fillRect(0, 0, P.w, P.h); ctx.restore();
    var r = rng(P.seed + 2);
    for (var i = 0; i < 6; i++) { // loose horizontal washes
      var y = r() * P.h * P.hz * 0.9, c = r() < 0.5 ? tint(sk[1], 0.3) : shade(sk[0], 0.95);
      cwash(ctx, ["e", r() * P.w, y, P.w * (0.25 + r() * 0.3), P.h * (0.02 + r() * 0.03)], c, { alpha: 0.25, blur: 6, edge: 0, lift: 0, wob: 6, layers: 2 });
    }
    if (P.time === "night") {
      ctx.save();
      for (i = 0; i < 90; i++) { ctx.globalAlpha = 0.3 + r() * 0.6; ctx.fillStyle = r() < 0.7 ? "#F7EFD8" : "#F2D9A0"; var sx = r() * P.w, sy = r() * P.h * P.hz, rr = (0.6 + r() * 1.6) * P.s + 0.3; ctx.beginPath(); ctx.arc(sx, sy, rr, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
  }
  function sunMoon(P, ctx, fx, fy, size) {
    if (P.noSun) return;
    if (P.sunAt) { fx = num(P.sunAt[0], fx); fy = num(P.sunAt[1], fy); }
    var x = fx * P.w, y = fy * P.h, rr = size * P.s;
    if (P.time === "night") {
      ctx.save(); ctx.filter = "blur(" + f1(rr * 0.6) + "px)"; ctx.globalAlpha = 0.25; ctx.fillStyle = "#F4E7C2"; ctx.beginPath(); ctx.arc(x, y, rr * 1.9, 0, TAU); ctx.fill(); ctx.restore();
      cwash(ctx, ["e", x, y, rr, rr], "#F6EBCB", { alpha: 0.96, blur: 0.8, edge: 0.25, lift: 2, layers: 3, wob: rr * 0.03 });
      cwash(ctx, ["e", x + rr * 0.3, y - rr * 0.15, rr * 0.22, rr * 0.18], "#E3D3A9", { alpha: 0.5, blur: 1, edge: 0, lift: 0, layers: 1 });
      cwash(ctx, ["e", x - rr * 0.25, y + rr * 0.3, rr * 0.15, rr * 0.13], "#E3D3A9", { alpha: 0.45, blur: 1, edge: 0, lift: 0, layers: 1 });
      cpencil(ctx, ["e", x, y, rr, rr], { op: 0.3, w: 1.2 * P.s + 0.3 });
    } else {
      var c = P.time === "dusk" ? "#EE9A5E" : "#F4D27E";
      ctx.save(); ctx.filter = "blur(" + f1(rr * 0.7) + "px)"; ctx.globalAlpha = P.time === "dusk" ? 0.45 : 0.35; ctx.fillStyle = P.time === "dusk" ? "#F4B27A" : "#FBE7A8"; ctx.beginPath(); ctx.arc(x, y, rr * 2, 0, TAU); ctx.fill(); ctx.restore();
      cwash(ctx, ["e", x, y, rr, rr], c, { alpha: 0.9, blur: 1.2, edge: 0.25, lift: 2, layers: 3, wob: rr * 0.04 });
    }
  }
  // Each painter draws into P.sky (static), P.far (drifts) and P.near (static) and returns ambient specs.
  var PAINT = {};
  PAINT.meadow = function (P) {
    var hz = P.hz, gt = P.gt, col = P.col;
    sunMoon(P, P.sky, 0.2, hz * 0.32, 52);
    var farH = contour(hz - 0.02, [[0.03, 3.1, 1], [0.015, 7, 2]]);
    band(P, P.far, farH, col("#A9BFA8"), { alpha: 0.7, c2: col("#C9D3B4"), pencil: false, lift: 2 });
    var midH = contour(hz + 0.07, [[0.04, 2.3, 4], [0.012, 9, 1]]);
    band(P, P.far, midH, col(C.spring), { c2: col(C.sage), lift: 4 });
    roundTree(P, P.far, P.w * 0.8, midH(0.8) * P.h + 6 * P.s, 300 * P.s, { greens: [C.leaf, C.moss, C.forest] });
    roundTree(P, P.far, P.w * 0.08, midH(0.08) * P.h + 6 * P.s, 200 * P.s, { greens: [C.moss, C.leaf] });
    var nearH = contour(gt, [[0.02, 2.2, 0.5], [0.008, 8, 3]]);
    band(P, P.near, nearH, col(C.leaf), { c2: col(C.moss), lift: 5, gran: 0.4 });
    flowersDots(P, P.near, nearH, gt, 1, 70, [C.cream, C.rose, C.butter, C.lilac], P.seed + 5);
    grassTufts(P, P.near, nearH, 40, C.forest, P.seed + 6, 1);
    return { ground: function (fx) { return nearH(fx) + (1 - gt) * 0.42; }, amb: ["clouds", "birds", P.time === "day" ? "butterflies" : "fireflies", P.time === "night" ? "stars" : null] };
  };
  PAINT.forest = function (P) {
    var hz = P.hz, gt = P.gt, col = P.col, r = rng(P.seed + 9);
    // the light between the trees
    var g = P.sky.createLinearGradient(0, 0, 0, P.h);
    var lightTop = P.time === "night" ? "#2C3A55" : P.time === "dusk" ? "#E2B48E" : "#E9ECC7", lightBot = P.time === "night" ? "#3D5160" : P.time === "dusk" ? "#C9A58A" : "#CBDDB0";
    g.addColorStop(0, lightTop); g.addColorStop(1, lightBot);
    P.sky.save(); P.sky.globalAlpha = 0.85; P.sky.fillStyle = g; P.sky.fillRect(0, 0, P.w, P.h); P.sky.restore();
    if (P.time === "night") skyStars(P, P.sky, 40);
    // misty far trunks and canopy
    for (var i = 0; i < 14; i++) {
      var x = (i / 13) * P.w * 1.1 - P.w * 0.05 + (r() - 0.5) * 40 * P.s, tw = (10 + r() * 14) * P.s;
      cwash(P.far, ["r", x - tw / 2, P.h * 0.05, tw, P.h * (gt - 0.02), 3], col("#9DAE9A"), { alpha: 0.5, blur: 2.5, edge: 0, lift: 0, wob: 2 });
    }
    var canopy = contour(0.16, [[0.05, 5.3, 1], [0.03, 11, 2]]);
    cwash(P.far, ["p", [[-0.1 * P.w, -0.1 * P.h]].concat(bandPts(P, canopy).slice(0, 41)).concat([[1.1 * P.w, -0.1 * P.h]])], col("#8FA88A"), { alpha: 0.6, blur: 3, edge: 0, lift: 4, wob: 6 });
    var farG = contour(hz + 0.1, [[0.015, 4, 1]]);
    band(P, P.far, farG, col("#A6B88E"), { alpha: 0.7, pencil: false, lift: 2 });
    for (i = 0; i < 7; i++) pineTree(P, P.far, (0.05 + i * 0.15 + r() * 0.04) * P.w, farG(0.1 + i * 0.15) * P.h + 4, (150 + r() * 80) * P.s, "#6F8C74", { alpha: 0.6, pencil: false });
    // near: big framing trunks, overhanging leaves, ground and a path
    var nearH = contour(gt, [[0.012, 3, 2], [0.006, 9, 1]]);
    band(P, P.near, nearH, col(C.moss), { c2: col(C.forest), lift: 5, gran: 0.4 });
    var pl0 = [], pr0 = [], gy = nearH(0.5) + 0.01;
    for (i = 0; i <= 16; i++) {
      var q = i / 16, fy = lerp(1.06, gy, q), cxp = 0.5 + 0.05 * Math.sin(q * 5.5 + 0.4) * (1 - q * 0.5), hw = lerp(0.11, 0.008, Math.pow(q, 0.8)) * (P.h / P.w) * 1.3;
      pl0.push([(cxp - hw) * P.w, fy * P.h]); pr0.unshift([(cxp + hw) * P.w, fy * P.h]);
    }
    cwash(P.near, ["p", pl0.concat(pr0)], col(C.sand), { alpha: 0.7, blur: 1.5, lift: 2, gran: 0.6, wob: 2 });
    [[0.15, 0.9], [0.87, 0.85], [0.27, 0.55]].forEach(function (tr, k) {
      var x2 = tr[0] * P.w, tw2 = 70 * P.s * tr[1];
      var trunk = ["p", [[x2 - tw2 * 0.65, P.h * 1.02], [x2 - tw2 * 0.45, -P.h * 0.05], [x2 + tw2 * 0.45, -P.h * 0.05], [x2 + tw2 * 0.65, P.h * 1.02]]];
      if (k === 2) trunk = ["p", [[x2 - tw2 * 0.6, nearH(tr[0]) * P.h + 20 * P.s], [x2 - tw2 * 0.4, -P.h * 0.05], [x2 + tw2 * 0.4, -P.h * 0.05], [x2 + tw2 * 0.6, nearH(tr[0]) * P.h + 20 * P.s]]];
      cwash(P.near, trunk, col(k === 2 ? "#8C6A50" : C.bark), { alpha: 0.95, blur: 1, lift: 3, gran: 0.8, wob: 3 });
      cpencil(P.near, trunk, { op: 0.4, w: 1.4 * P.s + 0.3 });
      for (var q = 0; q < 4; q++) cpencil(P.near, ["l", [[x2 - tw2 * 0.2 + q * tw2 * 0.12, P.h * (0.3 + q * 0.12)], [x2 - tw2 * 0.15 + q * tw2 * 0.12, P.h * (0.38 + q * 0.12)]]], { op: 0.3, w: 1 });
    });
    for (i = 0; i < 9; i++) { // overhanging leaves along the top
      var lx = r() * P.w, ly = -P.h * 0.02 + r() * P.h * 0.08, lr = (90 + r() * 90) * P.s;
      cwash(P.near, ["e", lx, ly, lr, lr * 0.6], col([C.leaf, C.moss, C.forest][i % 3]), { alpha: 0.78, blur: 1.6, lift: 3, gran: 0.3, wob: lr * 0.08 });
    }
    // ferns and mushrooms at the corners
    [[0.06, 0.98], [0.93, 0.97], [0.27, 0.99]].forEach(function (f, k) {
      var fx0 = f[0] * P.w, fy0 = f[1] * P.h;
      for (var q = 0; q < 6; q++) { var a = -PI / 2 + (q - 2.5) * 0.35, L = (60 + r() * 40) * P.s; cbrush(P.near, [[fx0, fy0], [fx0 + Math.cos(a) * L * 0.6, fy0 + Math.sin(a) * L * 0.6 - 8], [fx0 + Math.cos(a) * L, fy0 + Math.sin(a) * L]], 7 * P.s, col(C.forest), 0.75, { passes: 2 }); }
    });
    var mx = 0.86 * P.w, my = nearH(0.86) * P.h + 60 * P.s;
    cwash(P.near, ["r", mx - 7 * P.s, my - 22 * P.s, 14 * P.s, 24 * P.s, 4], col(C.cream), { alpha: 0.95, blur: 0.4, lift: 0 });
    cwash(P.near, ["e", mx, my - 24 * P.s, 26 * P.s, 15 * P.s], col(C.terracotta), { alpha: 0.95, blur: 0.6, lift: 1 });
    cpencil(P.near, ["e", mx, my - 24 * P.s, 26 * P.s, 15 * P.s], { op: 0.4 });
    return { ground: function (fx) { return nearH(fx) + (1 - gt) * 0.42; }, amb: ["leaves", P.time === "day" ? "birds" : "fireflies", P.time === "night" ? "fireflies" : null] };
  };
  function skyStars(P, ctx, n) {
    var r = rng(P.seed + 31);
    ctx.save();
    for (var i = 0; i < n; i++) { ctx.globalAlpha = 0.4 + r() * 0.5; ctx.fillStyle = "#F7EFD8"; ctx.beginPath(); ctx.arc(r() * P.w, r() * P.h * P.hz, (0.7 + r() * 1.4) * P.s + 0.3, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  PAINT.village = function (P) {
    var hz = P.hz, gt = P.gt, col = P.col, r = rng(P.seed + 4), smokes = [];
    sunMoon(P, P.sky, 0.82, hz * 0.3, 44);
    var farH = contour(hz - 0.05, [[0.03, 2.6, 2], [0.015, 6, 1]]);
    band(P, P.far, farH, col("#B4C3A6"), { alpha: 0.7, pencil: false, lift: 2 });
    var midH = contour(hz + 0.1, [[0.012, 3, 1]]);
    band(P, P.far, midH, col(C.spring), { c2: col(C.sage), lift: 3 });
    // a church tower and a row of cottages on the hill
    var tx = 0.62 * P.w, tb = midH(0.62) * P.h + 4, tw = 46 * P.s, th = 190 * P.s;
    var tower = ["p", [[tx - tw / 2, tb], [tx - tw / 2, tb - th], [tx + tw / 2, tb - th], [tx + tw / 2, tb]]];
    cwash(P.far, tower, col(C.stone), { alpha: 0.95, lift: 1, gran: 0.5, wob: 1 });
    var spire = ["p", [[tx - tw * 0.62, tb - th + 2], [tx, tb - th - 90 * P.s], [tx + tw * 0.62, tb - th + 2]]];
    cwash(P.far, spire, col(C.slate), { alpha: 0.95, lift: 0, wob: 1 });
    cpencil(P.far, tower, { op: 0.4 }); cpencil(P.far, spire, { op: 0.4 });
    cwash(P.far, ["e", tx, tb - th * 0.7, tw * 0.22, tw * 0.22], P.time === "night" ? "#F2C46A" : col(C.cream), { alpha: 0.9, lift: 0, blur: 0.3 });
    var walls = [C.cream, "#EFD9B4", C.blush, "#E8DCC8", C.butter], roofs = [C.terracotta, C.rust, C.slate, C.terracotta, C.ochre];
    var xs = [0.1, 0.27, 0.45, 0.8, 0.95];
    xs.forEach(function (fx, k) {
      var hw = (120 + r() * 40) * P.s, hh = (90 + r() * 40) * P.s;
      var hs = house(P, P.far, fx * P.w, midH(fx) * P.h + 8 * P.s, hw, hh, walls[k], roofs[k], { door: k % 2 === 0 });
      if (k === 1 || k === 3) smokes.push(hs.chimney);
    });
    var nearH = contour(gt, [[0.01, 3, 1], [0.005, 9, 2]]);
    band(P, P.near, nearH, col("#D9C9A6"), { c2: col(C.stone), lift: 3, gran: 0.9 });
    for (var i = 0; i < 26; i++) { // cobbles
      var cx = r() * P.w, cy = lerp(nearH(cx / P.w) * P.h + 20 * P.s, P.h, r()), cr = (10 + r() * 12) * P.s;
      cpencil(P.near, ["e", cx, cy, cr, cr * 0.55], { op: 0.18, w: 1 });
    }
    // flower boxes at the edges
    [[0.03, C.rose], [0.97, C.lilac]].forEach(function (f) {
      for (var q = 0; q < 7; q++) cwash(P.near, ["e", f[0] * P.w + (r() - 0.5) * 120 * P.s, P.h * (0.9 + r() * 0.08), 16 * P.s, 14 * P.s], col(q % 2 ? f[1] : C.leaf), { alpha: 0.85, blur: 0.6, layers: 2, lift: 0 });
    });
    return { ground: function (fx) { return nearH(fx) + (1 - gt) * 0.42; }, amb: ["clouds", "smoke", P.time === "day" ? "birds" : "fireflies", P.time === "night" ? "stars" : null], smoke: smokes };
  };
  PAINT.seaside = function (P) {
    var hz = P.hz, gt = P.gt, col = P.col, r = rng(P.seed + 7);
    sunMoon(P, P.sky, 0.7, hz * 0.35, 50);
    var seaTop = hz + 0.01;
    cwash(P.far, ["r", -P.w * 0.1, seaTop * P.h, P.w * 1.2, P.h * (1.05 - seaTop), 0], col(C.sea), { c2: col(C.teal), y0: seaTop * P.h, y1: gt * P.h, alpha: 0.9, wob: 2, lift: 4, edge: 0.2 });
    for (var i = 0; i < 18; i++) {
      var y = lerp(seaTop + 0.02, gt - 0.01, r()) * P.h, x = r() * P.w * 1.1, L = (40 + r() * 120) * P.s;
      cbrush(P.far, [[x, y], [x + L, y + (r() - 0.5) * 3]], 3 * P.s, tint(col(C.sea), 0.45), 0.55, { passes: 1, wob: 1 });
    }
    // headland and lighthouse
    var hd = contour(seaTop - 0.06, [[0.02, 6, 1]]);
    cwash(P.far, ["p", bandPts(P, function (fx) { return fx < 0.72 ? seaTop + 0.02 : hd(fx); }, 0.72, 1.1).slice(0, 41).concat([[1.1 * P.w, seaTop * P.h + 6], [0.72 * P.w, seaTop * P.h + 6]])], col(C.moss), { alpha: 0.85, lift: 1, wob: 2 });
    var lx = 0.86 * P.w, ly = hd(0.86) * P.h + 4, lw = 26 * P.s, lh = 120 * P.s;
    var lt = ["p", [[lx - lw * 0.6, ly], [lx - lw * 0.4, ly - lh], [lx + lw * 0.4, ly - lh], [lx + lw * 0.6, ly]]];
    cwash(P.far, lt, col(C.cream), { alpha: 0.95, lift: 0, wob: 0.6 });
    cwash(P.far, ["r", lx - lw * 0.55, ly - lh * 0.55, lw * 1.1, lh * 0.18, 1], col(C.terracotta), { alpha: 0.9, lift: 0, wob: 0.6 });
    cwash(P.far, ["r", lx - lw * 0.5, ly - lh * 1.25, lw, lh * 0.25, 2], P.time === "day" ? col(C.butter) : "#F2C46A", { alpha: 0.95, lift: 0, wob: 0.4 });
    cwash(P.far, ["p", [[lx - lw * 0.65, ly - lh * 1.24], [lx, ly - lh * 1.5], [lx + lw * 0.65, ly - lh * 1.24]]], col(C.rust), { alpha: 0.95, lift: 0, wob: 0.4 });
    cpencil(P.far, lt, { op: 0.4 });
    // sand, dune grass, shells
    var nearH = contour(gt, [[0.014, 2.4, 2], [0.006, 7, 1]]);
    band(P, P.near, nearH, col(C.sand), { c2: col("#D9BE8E"), lift: 4, gran: 1.2 });
    cbrush(P.near, bandPts(P, function (fx) { return nearH(fx) + 0.006; }).slice(0, 41), 5 * P.s, col("#C9AE80"), 0.45, { passes: 1 });
    grassTufts(P, P.near, function (fx) { return fx < 0.15 ? nearH(fx) : 2; }, 14, C.moss, P.seed + 3, gt + 0.12);
    for (i = 0; i < 5; i++) { var sx = (0.25 + r() * 0.6) * P.w, sy = lerp(gt + 0.12, 0.98, r()) * P.h; cwash(P.near, ["e", sx, sy, 9 * P.s, 7 * P.s], col(i % 2 ? C.blush : C.cream), { alpha: 0.9, blur: 0.4, layers: 2, lift: 0 }); cpencil(P.near, ["e", sx, sy, 9 * P.s, 7 * P.s], { op: 0.35, w: 1 }); }
    return { ground: function (fx) { return nearH(fx) + (1 - gt) * 0.42; }, amb: ["clouds", "boat", "waves", P.time === "day" ? "birds" : null, P.time === "night" ? "stars" : null], seaTop: seaTop };
  };
  PAINT["night-sky"] = function (P) {
    var hz = P.hz, gt = P.gt, col = P.col, r = rng(P.seed + 8);
    sunMoon(P, P.sky, 0.78, hz * 0.28, 58);
    var farH = contour(hz + 0.02, [[0.04, 2.1, 1], [0.015, 6.5, 3]]);
    band(P, P.far, farH, col("#566A8A"), { alpha: 0.85, pencil: false, lift: 2 });
    for (var i = 0; i < 5; i++) { var wx = (0.1 + r() * 0.8) * P.w, wy = farH(wx / P.w) * P.h + (10 + r() * 30) * P.s; cwash(P.far, ["r", wx, wy, 7 * P.s, 8 * P.s, 1], "#F2C46A", { alpha: 0.9, blur: 0.5, layers: 1, edge: 0, lift: 0 }); }
    var midH = contour(hz + 0.12, [[0.03, 2.6, 4]]);
    band(P, P.far, midH, col("#45597A"), { alpha: 0.9, lift: 3 });
    for (i = 0; i < 5; i++) pineTree(P, P.far, (0.04 + i * 0.07) * P.w, midH(0.04 + i * 0.07) * P.h + 4, (110 + r() * 50) * P.s, "#2F4258", { pencil: false });
    var nearH = contour(gt, [[0.018, 2.2, 1], [0.006, 8, 2]]);
    band(P, P.near, nearH, col("#3E5A50"), { c2: col("#2D4440"), lift: 4 });
    grassTufts(P, P.near, nearH, 30, "#22342F", P.seed + 2, 1);
    return { ground: function (fx) { return nearH(fx) + (1 - gt) * 0.42; }, amb: ["stars", "fireflies"] };
  };
  PAINT.mountains = function (P) {
    var hz = P.hz, gt = P.gt, col = P.col, r = rng(P.seed + 5);
    sunMoon(P, P.sky, 0.15, hz * 0.25, 40);
    function peaks(base, list, c, snow, ctx, alpha) {
      list.forEach(function (pk) {
        var x = pk[0] * P.w, top = pk[1] * P.h, half = pk[2] * P.w, b = base * P.h;
        var tri = ["p", [[x - half, b + 20], [x - half * 0.15, top + (b - top) * 0.05], [x, top], [x + half * 0.2, top + (b - top) * 0.08], [x + half, b + 20]]];
        cwash(ctx, tri, col(c), { alpha: alpha, lift: 2, gran: 0.6, wob: 2 });
        if (snow) {
          var sy = top + (b - top) * 0.3, cap = ["p", [[x - half * 0.3, sy], [x - half * 0.15, top + (b - top) * 0.05], [x, top], [x + half * 0.2, top + (b - top) * 0.08], [x + half * 0.32, sy], [x + half * 0.1, sy - (b - top) * 0.06], [x - half * 0.08, sy + (b - top) * 0.02]]];
          cwash(ctx, cap, P.time === "night" ? "#B9C2D8" : C.snow, { alpha: 0.95, lift: 0, wob: 1, blur: 0.6 });
        }
        cpencil(ctx, ["l", tri[1].slice(0, 5)], { op: 0.3 });
      });
    }
    peaks(hz + 0.05, [[0.2, hz - 0.33, 0.24], [0.48, hz - 0.42, 0.28], [0.8, hz - 0.3, 0.26]], "#A7A4BE", true, P.far, 0.75);
    peaks(hz + 0.1, [[0.05, hz - 0.15, 0.2], [0.65, hz - 0.2, 0.22], [1.0, hz - 0.12, 0.2]], "#8E9AA8", true, P.far, 0.85);
    var forestH = contour(hz + 0.1, [[0.01, 5, 1]]);
    band(P, P.far, forestH, col("#7E9A7C"), { alpha: 0.85, pencil: false });
    for (var i = 0; i < 16; i++) pineTree(P, P.far, (i / 15) * P.w * 1.05 - P.w * 0.02, forestH((i / 15)) * P.h + 6, (80 + r() * 60) * P.s, C.pine, { pencil: false, alpha: 0.85 });
    var nearH = contour(gt, [[0.02, 2.4, 3], [0.006, 8, 1]]);
    band(P, P.near, nearH, col(C.sage), { c2: col(C.moss), lift: 4, gran: 0.4 });
    flowersDots(P, P.near, nearH, gt, 1, 40, [C.cream, C.lilac, C.butter], P.seed + 3);
    [[0.08, 34], [0.9, 46]].forEach(function (k) { var x = k[0] * P.w, y = nearH(k[0]) * P.h + 60 * P.s; cwash(P.near, ["e", x, y, k[1] * P.s * 1.6, k[1] * P.s], col(C.stone), { alpha: 0.95, lift: 1, gran: 1 }); cpencil(P.near, ["e", x, y, k[1] * P.s * 1.6, k[1] * P.s], { op: 0.4 }); });
    return { ground: function (fx) { return nearH(fx) + (1 - gt) * 0.42; }, amb: ["clouds", P.time === "day" ? "birds" : null, P.time === "night" ? "stars" : null] };
  };
  PAINT.cottage = function (P) {
    var gt = P.gt, r = rng(P.seed + 6), night = P.time === "night", w = P.w, h = P.h, s = P.s;
    var wallC = night ? "#E9CF9E" : "#F0DDB2";
    P.sky.fillStyle = C.paper; P.sky.fillRect(0, 0, w, h);
    cwash(P.sky, ["r", -w * 0.05, -h * 0.05, w * 1.1, h * 1.1, 0], wallC, { c2: night ? "#D7B582" : "#E6CD9C", y0: 0, y1: h * gt, alpha: 0.95, edge: 0, lift: 6, wob: 0, layers: 2 });
    for (var i = 0; i < 9; i++) { // wallpaper stripes with little sprigs
      var x = (i + 0.5) * (w / 9);
      cpencil(P.sky, ["l", [[x, 0], [x + 2, h * gt]]], { op: 0.12, w: 1 });
      for (var q = 0; q < 5; q++) cwash(P.sky, ["e", x + (w / 18), (q + 0.5) * (h * gt / 5), 5 * s, 4 * s], q % 2 ? C.rose : C.sage, { alpha: 0.45, blur: 0.5, layers: 1, edge: 0, lift: 0 });
    }
    if (night) { P.sky.save(); P.sky.filter = "blur(" + f1(120 * s) + "px)"; P.sky.globalAlpha = 0.35; P.sky.fillStyle = C.honey; P.sky.beginPath(); P.sky.ellipse(w * 0.75, h * 0.6, 300 * s, 260 * s, 0, 0, TAU); P.sky.fill(); P.sky.restore(); }
    // window with the time of day outside
    var wx = w * 0.2, wy = h * 0.14, ww = Math.min(w * 0.2, 230 * s), wh = ww * 1.15;
    var sk = SKY[P.time];
    cwash(P.sky, ["r", wx - ww / 2, wy, ww, wh, 6], sk[1], { c2: sk[2], y0: wy, y1: wy + wh, alpha: 0.95, lift: 1, edge: 0.3 });
    if (night) { cwash(P.sky, ["e", wx + ww * 0.2, wy + wh * 0.25, ww * 0.1, ww * 0.1], "#F6EBCB", { alpha: 0.95, lift: 0 }); for (q = 0; q < 6; q++) { P.sky.fillStyle = "#F7EFD8"; P.sky.globalAlpha = 0.8; P.sky.beginPath(); P.sky.arc(wx - ww * 0.4 + r() * ww * 0.8, wy + r() * wh * 0.6, 1.5 * s + 0.5, 0, TAU); P.sky.fill(); } P.sky.globalAlpha = 1; }
    cwash(P.sky, ["p", [[wx - ww / 2, wy + wh], [wx - ww / 2, wy + wh * 0.7], [wx, wy + wh * 0.62], [wx + ww / 2, wy + wh * 0.74], [wx + ww / 2, wy + wh]]], night ? "#3E5A50" : C.leaf, { alpha: 0.85, lift: 0 });
    [["r", wx - ww / 2, wy, ww, wh, 6], ["l", [[wx, wy], [wx, wy + wh]]], ["l", [[wx - ww / 2, wy + wh / 2], [wx + ww / 2, wy + wh / 2]]]].forEach(function (sh) { cbrush(P.sky, shapePts(sh, 8).pts.concat(sh[0] === "r" ? [shapePts(sh, 8).pts[0]] : []), 9 * s, C.wood, 0.85, { passes: 2 }); });
    cwash(P.sky, ["p", [[wx - ww * 0.75, wy - 14 * s], [wx - ww * 0.42, wy - 14 * s], [wx - ww * 0.5, wy + wh + 30 * s], [wx - ww * 0.78, wy + wh + 30 * s]]], C.rose, { alpha: 0.85, lift: 2 });
    cwash(P.sky, ["p", [[wx + ww * 0.42, wy - 14 * s], [wx + ww * 0.75, wy - 14 * s], [wx + ww * 0.78, wy + wh + 30 * s], [wx + ww * 0.5, wy + wh + 30 * s]]], C.rose, { alpha: 0.85, lift: 2 });
    // fireplace on the right
    var fx = w * 0.83, fw = Math.min(w * 0.26, 300 * s), fb = h * gt + 4, fh = fw * 0.95;
    var hearth = ["r", fx - fw / 2, fb - fh, fw, fh, 8];
    cwash(P.sky, hearth, C.stone, { alpha: 0.95, lift: 2, gran: 1.2 });
    cpencil(P.sky, hearth, { op: 0.4 });
    for (q = 0; q < 10; q++) cpencil(P.sky, ["r", fx - fw / 2 + (q % 4) * fw / 4 + (Math.floor(q / 4) % 2) * fw / 8, fb - fh + Math.floor(q / 4) * 34 * s, fw / 4, 34 * s, 3], { op: 0.16, w: 1 });
    var open = ["p", [[fx - fw * 0.32, fb], [fx - fw * 0.32, fb - fh * 0.5], [fx, fb - fh * 0.66], [fx + fw * 0.32, fb - fh * 0.5], [fx + fw * 0.32, fb]]];
    cwash(P.sky, open, "#3A2A26", { alpha: 0.95, lift: 0 });
    cwash(P.sky, ["r", fx - fw * 0.62, fb - fh - 20 * s, fw * 1.24, 24 * s, 4], C.wood, { alpha: 0.95, lift: 0 });
    cwash(P.sky, ["r", fx - fw * 0.5, fb - fh - 70 * s, 26 * s, 50 * s, 6], C.honey, { alpha: 0.9, lift: 0 });
    cwash(P.sky, ["r", fx + fw * 0.3, fb - fh - 60 * s, 34 * s, 40 * s, 8], C.sage, { alpha: 0.9, lift: 0 });
    // floor and rug
    var floorH = function () { return gt; };
    cwash(P.near, ["r", -w * 0.05, gt * h, w * 1.1, h * (1.06 - gt), 0], "#B98A5C", { c2: "#9C7048", y0: gt * h, y1: h, alpha: 0.95, lift: 3, gran: 0.6, wob: 2 });
    for (i = 0; i < 7; i++) cpencil(P.near, ["l", [[-10, gt * h + (i + 1) * (h * (1 - gt) / 7)], [w + 10, gt * h + (i + 1) * (h * (1 - gt) / 7)]]], { op: 0.2, w: 1 });
    cpencil(P.near, ["l", [[-10, gt * h + 2], [w + 10, gt * h + 2]]], { op: 0.45 });
    var rugY = gt + (1 - gt) * 0.5;
    var rx = w * 0.34, ry = Math.min(h * (1 - gt) * 0.36, rx * 0.3);
    cwash(P.near, ["e", w * 0.5, rugY * h, rx, ry], C.rose, { alpha: 0.7, lift: 3, gran: 0.4 });
    cwash(P.near, ["e", w * 0.5, rugY * h, rx * 0.76, ry * 0.66], C.butter, { alpha: 0.5, lift: 1 });
    cpencil(P.near, ["e", w * 0.5, rugY * h, rx, ry], { op: 0.35 });
    cpencil(P.near, ["e", w * 0.5, rugY * h, rx * 0.76, ry * 0.66], { op: 0.2 });
    return { ground: function () { return gt + (1 - gt) * 0.5; }, amb: ["fire", "dust"], fire: [fx, fb - 6 * s, fw * 0.5], interior: true };
  };

  // ------------------------- painting assembly -------------------------
  var HZ = { forest: [0.5, 0.78], village: [0.5, 0.78], meadow: [0.52, 0.78], seaside: [0.5, 0.76], "night-sky": [0.6, 0.8], cottage: [0.5, 0.74], mountains: [0.56, 0.8] };
  function bloomMask(el, w, h, seed) {
    var r = rng(seed), spots = [[0.5, 0.55], [0.25, 0.4], [0.75, 0.42], [0.38, 0.82], [0.66, 0.2]].map(function (p, i) {
      var x = (p[0] + (r() - 0.5) * 0.12) * w, y = (p[1] + (r() - 0.5) * 0.12) * h;
      var R = Math.max(Math.hypot(x, y), Math.hypot(w - x, y), Math.hypot(x, h - y), Math.hypot(w - x, h - y)) * 1.12;
      return { x: x, y: y, R: R, d: i === 0 ? 0 : 0.08 + r() * 0.22 };
    });
    return function (p) {
      if (p >= 1) { setS(el, "maskImage", "none"); setS(el, "webkitMaskImage", "none"); setS(el, "opacity", "1"); return; }
      var e = 0.2 + 0.8 * outC(p), parts = spots.map(function (s2) {
        var rr = s2.R * clamp((e - s2.d) / (1 - s2.d), 0, 1);
        return "radial-gradient(circle at " + f1(s2.x) + "px " + f1(s2.y) + "px, #000 0px, #000 " + f1(rr * 0.62) + "px, rgba(0,0,0,0) " + f1(rr + 0.5) + "px)";
      }).join(", ");
      setS(el, "maskImage", parts); setS(el, "webkitMaskImage", parts);
      setS(el, "opacity", f2(clamp(0.45 + p * 3, 0, 1)));
    };
  }
  function edgeOverlay(x, y, w, h, edge, seed) {
    edge = str(edge || "soft").toLowerCase();
    if (edge === "none") return null;
    var c = mkCanvas(w, h, "sb-edge"), ctx = c.getContext("2d"), r = rng(seed), mn = Math.min(w, h);
    ctx.fillStyle = C.paper; ctx.fillRect(0, 0, w, h);
    try { ctx.drawImage(paperCanvas, x, y, w, h, 0, 0, w, h); } catch (e) {}
    var sides = edge === "soft" || edge === "oval" ? "tblr" : edge, m = mn * 0.075, F = mn * 0.03;
    var x0 = sides.indexOf("l") >= 0 ? m : -m * 3, x1 = sides.indexOf("r") >= 0 ? w - m : w + m * 3;
    var y0 = sides.indexOf("t") >= 0 ? m : -m * 3, y1 = sides.indexOf("b") >= 0 ? h - m : h + m * 3;
    var sh = edge === "oval" ? ["e", w / 2, h / 2, w / 2 - m, h / 2 - m] : ["r", x0, y0, x1 - x0, y1 - y0, m * 1.2];
    var g = shapePts(sh, 8), pts = wobble(g.pts, true, m * 0.28, seed + 1);
    ctx.globalCompositeOperation = "destination-out";
    ctx.filter = "blur(" + f1(F) + "px)";
    ctx.fill(P2(pts, true));
    ctx.filter = "blur(" + f1(F * 0.5) + "px)";
    ctx.fill(P2(scalePts(pts, 0.93, centroid(pts)), true));
    ctx.filter = "blur(" + f1(F * 0.35) + "px)";
    for (var i = 0; i < pts.length; i += 2) { // brushy fringe
      var p = pts[i], c0 = centroid(pts), dx = p[0] - c0[0], dy = p[1] - c0[1], dl = Math.hypot(dx, dy) || 1;
      var push = m * (r() * 0.25), rr = m * (0.18 + r() * 0.3);
      var bx = p[0] + (dx / dl) * push, by = p[1] + (dy / dl) * push;
      if (bx < -m || bx > w + m || by < -m || by > h + m) continue;
      ctx.globalAlpha = 0.75 + r() * 0.25;
      ctx.beginPath(); ctx.ellipse(bx, by, rr, rr * (0.6 + r() * 0.4), r() * PI, 0, TAU); ctx.fill();
    }
    return c;
  }
  function painting(o) {
    o = obj(o);
    var st = ensure(), loc = locKey(o.location), time = timeKey(o.time);
    if (loc === "night-sky" && time === "day") time = "dusk";
    if (loc === "night-sky" && time === "dusk" && o.time !== "dusk") time = "night";
    var x = num(o.x, 0), y = num(o.y, 0), w = Math.max(40, num(o.w, W)), h = Math.max(40, num(o.h, H)), seed = num(o.seed, hstr(loc) % 997 + 3);
    var hz0 = HZ[loc] || [0.5, 0.78];
    var P = { w: w, h: h, s: Math.min(w / 1.3, h) / 1000, time: time, loc: loc, seed: seed, col: todCol(time), hz: num(o.horizon, hz0[0]), gt: num(o.groundTop, hz0[1]) };
    var el = div("sb-painting", o.parent || st.L.back);
    place(el, x, y, w, h);
    var inner = div("sb-pt-inner", el);
    place(inner, 0, 0, w, h);
    var ov = 0.05, farW = w * (1 + ov * 2);
    var cSky = mkCanvas(w, h, "sb-pt-layer"), cFar = mkCanvas(farW, h, "sb-pt-layer"), cNear = mkCanvas(w, h, "sb-pt-layer");
    P.sky = cSky.getContext("2d"); P.far = cFar.getContext("2d"); P.near = cNear.getContext("2d");
    P.far.translate(w * ov, 0);
    if (loc !== "forest" && loc !== "cottage") skyPaint(P, P.sky);
    else { P.sky.fillStyle = C.paper; P.sky.fillRect(0, 0, w, h); }
    if (Array.isArray(o.sun)) P.sunAt = o.sun; if (o.sun === false) P.noSun = true;
    var res = (PAINT[loc] || PAINT.meadow)(P);
    [[P.sky, w, 0.3], [P.far, farW, 0.45], [P.near, w, 0.45]].forEach(function (q, i) { // the paint soaks into the paper
      q[0].save(); if (i === 1) q[0].setTransform(1, 0, 0, 1, 0, 0);
      q[0].globalCompositeOperation = "source-atop"; grainFill(q[0], q[1], h, q[2], 1.3); q[0].restore();
    });
    inner.appendChild(cSky);
    var farWrap = div("sb-pt-far", inner);
    place(farWrap, -w * ov, 0, farW, h);
    farWrap.appendChild(cFar);
    var ambBack = div("sb-amb", farWrap);
    place(ambBack, w * ov, 0, w, h);
    inner.appendChild(cNear);
    var ambFront = div("sb-amb", inner);
    place(ambFront, 0, 0, w, h);
    var edgeC = edgeOverlay(x, y, w, h, o.edge, seed + 50);
    if (edgeC) el.appendChild(edgeC);
    var pan = num(o.pan, 1), panPx = w * ov * 0.85 * pan;
    var bAt = num(o.bloom, 0.05), bDur = num(o.bloomDur, 1.3), bm = bloomMask(inner, w, h, seed + 9);
    var ambient = o.ambient !== false, sprites = [];
    if (ambient) arr(res.amb).forEach(function (k) { if (k && AMB[k]) sprites.push(AMB[k](P, res, k === "clouds" || k === "birds" || k === "smoke" || k === "boat" || k === "waves" ? ambBack : ambFront)); });
    onFrame(function (t) {
      bm(prog(t, bAt, bDur));
      var e = soft(t / Math.max(1, D));
      setS(farWrap, "transform", "translateX(" + f1(panPx * (0.5 - e)) + "px)");
      setS(cSky, "transform", "translateX(" + f1(panPx * 0.3 * (0.5 - e)) + "px)");
      for (var i = 0; i < sprites.length; i++) sprites[i](t);
    });
    var ground = function (fx) { return y + res.ground(clamp(num(fx, 0.5), 0, 1)) * h; };
    return {
      el: el, x: x, y: y, w: w, h: h, location: loc, time: time, groundY: ground(0.5), ground: ground,
      bloom: function (at, dur) { bAt = num(at, bAt); bDur = num(dur, bDur); return this; },
    };
  }

  // ------------------------- ambient life -------------------------
  function ambSvg(parent, P) { var s = svg("svg", { width: f1(P.w), height: f1(P.h), viewBox: "0 0 " + f1(P.w) + " " + f1(P.h), class: "sb-amb-svg" }); parent.appendChild(s); return s; }
  function cloudSprite(w, h, seed, time) {
    var c = mkCanvas(w, h), ctx = c.getContext("2d"), r = rng(seed);
    var top = time === "dusk" ? "#F6D9C4" : time === "night" ? "#56638C" : "#FFFDF6", under = time === "dusk" ? "#C98F95" : time === "night" ? "#3D4972" : "#C9CCDA";
    for (var i = 0; i < 6; i++) {
      var cx = w * (0.2 + r() * 0.6), cy = h * (0.45 + r() * 0.2), rx = w * (0.14 + r() * 0.12);
      cwash(ctx, ["e", cx, cy + rx * 0.2, rx, rx * 0.62], under, { alpha: 0.35, blur: 3, edge: 0, lift: 0, layers: 2, wob: rx * 0.08 });
      cwash(ctx, ["e", cx, cy - rx * 0.08, rx * 0.92, rx * 0.56], top, { alpha: 0.6, blur: 2.5, edge: 0.15, lift: 0, layers: 2, wob: rx * 0.08 });
    }
    return c;
  }
  var AMB = {};
  AMB.clouds = function (P, res, parent) {
    var r = rng(P.seed + 61), list = [];
    var n = P.w > P.h ? 3 : 2;
    for (var i = 0; i < n; i++) {
      var cw = (260 + r() * 160) * P.s * (P.w > P.h ? 1.2 : 1), ch = cw * 0.45;
      var c = cloudSprite(cw, ch, P.seed + 70 + i, P.time);
      c.className = "sb-sprite";
      parent.appendChild(c);
      list.push({ el: c, x: (0.1 + (i / n) * 0.75 + r() * 0.08) * P.w - cw / 2, y: P.h * P.hz * (0.12 + r() * 0.4) - ch / 2, v: (5 + r() * 7) * P.s * (r() < 0.5 ? 1 : -1) });
    }
    return function (t) { list.forEach(function (q) { setS(q.el, "transform", "translate(" + f1(q.x + q.v * t) + "px," + f1(q.y) + "px)"); }); };
  };
  AMB.birds = function (P, res, parent) {
    var s = ambSvg(parent, P), r = rng(P.seed + 62), list = [];
    var x0 = P.w * (0.15 + r() * 0.3), y0 = P.h * P.hz * 0.25;
    for (var i = 0; i < 3; i++) {
      var p = svg("path", { fill: "none", stroke: P.time === "night" ? "#C8CCE0" : PEN, "stroke-width": f2(1.8 * P.s + 0.6), "stroke-linecap": "round", "stroke-opacity": "0.75" }, s);
      list.push({ el: p, dx: i * 34 * P.s - (i === 2 ? 50 * P.s : 0), dy: (i === 1 ? -18 : i === 2 ? 14 : 0) * P.s, ph: r() * TAU, sz: (9 + r() * 4) * P.s });
    }
    var v = 22 * P.s;
    return function (t) {
      list.forEach(function (b) {
        var x = x0 + b.dx + v * t, y = y0 + b.dy + Math.sin(t * 0.8 + b.ph) * 6 * P.s, k = b.sz * (0.2 + 0.6 * (0.5 + 0.5 * Math.sin(t * 7 + b.ph)));
        setA(b.el, "d", "M" + f1(x - b.sz) + " " + f1(y) + "Q" + f1(x - b.sz * 0.5) + " " + f1(y - k) + " " + f1(x) + " " + f1(y + b.sz * 0.15) + "Q" + f1(x + b.sz * 0.5) + " " + f1(y - k) + " " + f1(x + b.sz) + " " + f1(y));
      });
    };
  };
  AMB.butterflies = function (P, res, parent) {
    var s = ambSvg(parent, P), r = rng(P.seed + 63), list = [], cols = [C.honey, C.rose];
    for (var i = 0; i < 2; i++) {
      var g = svg("g", {}, s), sz = 11 * P.s + 3, c = cols[i];
      var wl = svg("g", {}, g), wr = svg("g", {}, g);
      wl.innerHTML = wsh(["e", -sz * 0.55, -sz * 0.2, sz * 0.55, sz * 0.45], c, { a: 0.9, wob: sz * 0.05, edge: 0.5, ew: 0.8 }) + wsh(["e", -sz * 0.4, sz * 0.35, sz * 0.35, sz * 0.3], c, { a: 0.85, wob: sz * 0.05, bloom: false, ew: 0.8 });
      wr.innerHTML = wsh(["e", sz * 0.55, -sz * 0.2, sz * 0.55, sz * 0.45], c, { a: 0.9, wob: sz * 0.05, edge: 0.5, ew: 0.8 }) + wsh(["e", sz * 0.4, sz * 0.35, sz * 0.35, sz * 0.3], c, { a: 0.85, wob: sz * 0.05, bloom: false, ew: 0.8 });
      svg("path", { d: "M0 " + f1(-sz * 0.5) + "L0 " + f1(sz * 0.6), stroke: PEN, "stroke-width": "1.5", "stroke-linecap": "round" }, g);
      list.push({ g: g, wl: wl, wr: wr, cx: P.w * (0.25 + i * 0.45 + r() * 0.1), cy: P.h * (P.gt - 0.12 + r() * 0.06), ax: P.w * 0.09, ay: P.h * 0.05, ph: r() * TAU });
    }
    return function (t) {
      list.forEach(function (b) {
        var x = b.cx + Math.sin(t * 0.5 + b.ph) * b.ax, y = b.cy + Math.sin(t * 0.9 + b.ph * 2) * b.ay, f = 0.25 + 0.75 * Math.abs(Math.sin(t * 9 + b.ph));
        setA(b.g, "transform", "translate(" + f1(x) + "," + f1(y) + ")");
        setA(b.wl, "transform", "scale(" + f2(f) + ",1)"); setA(b.wr, "transform", "scale(" + f2(f) + ",1)");
      });
    };
  };
  function fireflies(o) {
    o = obj(o);
    var st = ensure(), parent = o.parent || st.L.fx, n = clamp(Math.round(num(o.n, 12)), 1, 60), r = rng(num(o.seed, 64));
    var x = num(o.x, 0), y = num(o.y, 0), w = num(o.w, W), h = num(o.h, H), list = [], col = o.color || "#F6D27A", dim = num(o.dim, 1);
    for (var i = 0; i < n; i++) {
      var d = div("sb-firefly", parent), sz = u(10 + r() * 10);
      d.style.width = d.style.height = f1(sz) + "px";
      d.style.background = "radial-gradient(circle, " + rgba(col, 0.95 * dim) + " 0%, " + rgba(col, 0.4 * dim) + " 35%, " + rgba(col, 0) + " 70%)";
      list.push({ el: d, sz: sz, x: x + r() * w, y: y + r() * h, ax: u(20 + r() * 40), ay: u(14 + r() * 30), f: 0.3 + r() * 0.4, ph: r() * TAU, fl: 1.2 + r() * 1.6 });
    }
    var from = num(o.from, 0);
    onFrame(function (t) {
      list.forEach(function (q) {
        var px = q.x + Math.sin(t * q.f + q.ph) * q.ax, py = q.y + Math.sin(t * q.f * 1.3 + q.ph * 1.7) * q.ay;
        var a = clamp(0.25 + 0.75 * Math.max(0, Math.sin(t * q.fl + q.ph)), 0, 1) * clamp((t - from) / 0.8, 0, 1);
        setS(q.el, "transform", "translate(" + f1(px - q.sz / 2) + "px," + f1(py - q.sz / 2) + "px)");
        setS(q.el, "opacity", f2(a));
      });
    });
    return { n: n };
  }
  AMB.fireflies = function (P, res, parent) { fireflies({ parent: parent, x: P.w * 0.05, y: P.h * (P.hz - 0.05), w: P.w * 0.9, h: P.h * (1 - P.hz) * 0.85, n: P.w > P.h ? 14 : 10, seed: P.seed + 65, from: 0.6 }); return function () {}; };
  AMB.dust = function (P, res, parent) { fireflies({ parent: parent, x: P.w * 0.1, y: P.h * 0.15, w: P.w * 0.8, h: P.h * 0.55, n: 8, seed: P.seed + 66, color: "#FFF4D6", dim: 0.55 }); return function () {}; };
  function starD(cx, cy, R, r0, n) {
    var d = "";
    for (var i = 0; i < n * 2; i++) { var a = -PI / 2 + (i * PI) / n, rr = i % 2 ? r0 : R; d += (i ? "L" : "M") + f2(cx + Math.cos(a) * rr) + " " + f2(cy + Math.sin(a) * rr); }
    return d + "Z";
  }
  function twinkles(o) {
    o = obj(o);
    var st = ensure(), parent = o.parent || st.L.fx, n = clamp(Math.round(num(o.n, 14)), 1, 80), r = rng(num(o.seed, 67));
    var x = num(o.x, 0), y = num(o.y, 0), w = num(o.w, W), h = num(o.h, H * 0.5), col = o.color || "#F7EBC6";
    var s = svg("svg", { width: f1(W), height: f1(H), class: "sb-amb-svg" }, null);
    parent.appendChild(s);
    if (o.parent && o.local) { s.setAttribute("width", f1(w)); s.setAttribute("height", f1(h)); x = 0; y = 0; }
    var list = [];
    for (var i = 0; i < n; i++) {
      var R = u(5 + r() * 9), cx = x + r() * w, cy = y + r() * h;
      var p = svg("path", { d: starD(cx, cy, R, R * 0.3, 4), fill: col }, s);
      list.push({ el: p, f: 0.8 + r() * 1.6, ph: r() * TAU });
    }
    onFrame(function (t) { list.forEach(function (q) { setA(q.el, "opacity", f2(0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * q.f + q.ph)))); }); });
    return { n: n };
  }
  AMB.stars = function (P, res, parent) { twinkles({ parent: parent, local: true, x: 0, y: 0, w: P.w, h: P.h * P.hz * 0.8, n: P.w > P.h ? 16 : 12, seed: P.seed + 68 }); return function () {}; };
  function leaves(o) {
    o = obj(o);
    var st = ensure(), parent = o.parent || st.L.fx, n = clamp(Math.round(num(o.n, 8)), 1, 40), r = rng(num(o.seed, 69)), kind = str(o.kind) || "leaf";
    var x = num(o.x, 0), y = num(o.y, 0), w = num(o.w, W), h = num(o.h, H);
    var s = svg("svg", { width: f1(w), height: f1(h), class: "sb-amb-svg" }, null);
    s.style.left = f1(x) + "px"; s.style.top = f1(y) + "px";
    parent.appendChild(s);
    var cols = kind === "petal" ? [C.blush, C.rose, C.cream] : kind === "snow" ? [C.snow, "#FFFFFF"] : kind === "seed" ? [C.cream, C.sand] : [C.ochre, C.terracotta, C.leaf, C.honey];
    var list = [];
    for (var i = 0; i < n; i++) {
      var g = svg("g", {}, s), sz = u(kind === "snow" ? 6 + r() * 5 : 12 + r() * 9), c = cols[i % cols.length];
      if (kind === "snow") g.innerHTML = wsh(["e", 0, 0, sz * 0.5, sz * 0.5], c, { a: 0.9, wob: 0.3, edge: 0.25, ew: 0.6 });
      else if (kind === "seed") g.innerHTML = '<path d="M0 0L0 ' + f1(sz) + '" stroke="' + PEN + '" stroke-width="1" />' + wsh(["e", 0, 0, sz * 0.5, sz * 0.5], c, { a: 0.7, wob: sz * 0.1, edge: 0.3, ew: 0.6 });
      else g.innerHTML = wsh(["p", [[-sz, 0], [-sz * 0.3, -sz * 0.45], [sz * 0.6, -sz * 0.25], [sz, 0], [sz * 0.4, sz * 0.35], [-sz * 0.4, sz * 0.3]]], c, { a: 0.9, wob: sz * 0.05, ew: 0.8 }) + '<path d="M' + f1(-sz) + ' 0L' + f1(sz * 0.9) + ' 0" stroke="' + PEN + '" stroke-width="1" stroke-opacity=".6"/>';
      list.push({ g: g, x: r() * w, ph: r(), v: (0.07 + r() * 0.06) * (kind === "snow" ? 0.8 : 1), sw: u(20 + r() * 30), rot: r() * 360, rs: (r() - 0.5) * 120 });
    }
    var from = num(o.from, 0);
    onFrame(function (t) {
      list.forEach(function (q) {
        var p = (q.ph + q.v * t) % 1, py = -u(30) + p * (h + u(60)), px = q.x + Math.sin(t * 1.1 + q.ph * 9) * q.sw;
        setA(q.g, "transform", "translate(" + f1(px) + "," + f1(py) + ") rotate(" + f1(q.rot + q.rs * t + Math.sin(t * 2 + q.ph * 7) * 25) + ")");
        setA(q.g, "opacity", f2(clamp(Math.min(p * 8, (1 - p) * 8), 0, 1) * clamp((t - from) / 0.6, 0, 1)));
      });
    });
    return { n: n };
  }
  AMB.leaves = function (P, res, parent) { leaves({ parent: parent, x: 0, y: 0, w: P.w, h: P.h, n: P.w > P.h ? 8 : 6, seed: P.seed + 71, kind: "leaf" }); return function () {}; };
  AMB.smoke = function (P, res, parent) {
    var list = [], r = rng(P.seed + 72);
    arr(res.smoke).forEach(function (ch, k) {
      for (var i = 0; i < 4; i++) {
        var sz = (26 + r() * 14) * P.s, c = mkCanvas(sz * 2, sz * 2, "sb-sprite"), ctx = c.getContext("2d");
        cwash(ctx, ["e", sz, sz, sz * 0.7, sz * 0.6], P.time === "night" ? "#8C93AA" : "#D5D0CA", { alpha: 0.55, blur: 3, edge: 0, lift: 0, layers: 2, wob: sz * 0.1 });
        parent.appendChild(c);
        list.push({ el: c, sz: sz, x: ch[0], y: ch[1], ph: i / 4 + k * 0.13 });
      }
    });
    return function (t) {
      list.forEach(function (q) {
        var p = (q.ph + t * 0.12) % 1, sc = 0.4 + p * 1.3;
        setS(q.el, "transform", "translate(" + f1(q.x - q.sz + Math.sin(p * 5 + q.ph * 4) * 14 * P.s + p * 40 * P.s) + "px," + f1(q.y - q.sz - p * 170 * P.s) + "px) scale(" + f2(sc) + ")");
        setS(q.el, "opacity", f2(Math.min(p * 5, 1) * (1 - p)));
      });
    };
  };
  AMB.boat = function (P, res, parent) {
    var s = ambSvg(parent, P), g = svg("g", {}, s), k = 1.1 * P.s;
    g.innerHTML = pw(["p", [[-60, 0], [60, 0], [42, 22], [-44, 22]]], C.rust, { a: 0.95, wob: 0.8 }) + pen(["l", [[0, 0], [0, -92]]], { w: 2 }) +
      pw(["p", [[4, -88], [52, -12], [4, -12]]], C.cream, { a: 0.95, wob: 0.8 }) + pw(["p", [[-4, -70], [-40, -12], [-4, -12]]], C.butter, { a: 0.9, wob: 0.8 });
    var bx = P.w * 0.32, by = (res.seaTop + (P.gt - res.seaTop) * 0.45) * P.h;
    return function (t) { setA(g, "transform", "translate(" + f1(bx + t * 4 * P.s) + "," + f1(by + Math.sin(t * 1.4) * 3 * P.s) + ") rotate(" + f2(Math.sin(t * 1.1) * 3) + ") scale(" + f2(k) + ")"); };
  };
  AMB.waves = function (P, res, parent) {
    var s = ambSvg(parent, P), r = rng(P.seed + 73), list = [];
    for (var i = 0; i < 7; i++) {
      var p = svg("path", { fill: "none", stroke: "#F5F1E6", "stroke-width": f2(2.4 * P.s + 0.6), "stroke-linecap": "round" }, s);
      list.push({ el: p, x: r() * P.w, y: lerp(res.seaTop + 0.03, P.gt - 0.02, r()) * P.h, L: (30 + r() * 50) * P.s, ph: r() });
    }
    return function (t) {
      list.forEach(function (q) {
        var p = (q.ph + t * 0.18) % 1, x = q.x + p * 60 * P.s;
        setA(q.el, "d", "M" + f1(x) + " " + f1(q.y) + "q" + f1(q.L / 2) + " " + f1(-4 * P.s) + " " + f1(q.L) + " 0");
        setA(q.el, "stroke-opacity", f2(0.7 * Math.sin(p * PI)));
      });
    };
  };
  AMB.fire = function (P, res, parent) {
    if (!res.fire) return function () {};
    var s = ambSvg(parent, P), list = [], fx = res.fire[0], fy = res.fire[1], fw = res.fire[2];
    cwashSvgGlow(s, fx, fy - fw * 0.25, fw * 0.75);
    [[C.terracotta, 1, 0], [C.honey, 0.7, 1.3], [C.butter, 0.42, 2.1]].forEach(function (f, i) {
      var g = svg("g", {}, s), hh = fw * 0.55 * f[1], ww = fw * 0.32 * f[1];
      g.innerHTML = wsh(["p", [[-ww, 0], [-ww * 0.6, -hh * 0.45], [-ww * 0.2, -hh * 0.6], [0, -hh], [ww * 0.3, -hh * 0.55], [ww * 0.7, -hh * 0.5], [ww, 0]]], f[0], { a: 0.9, wob: ww * 0.05, ew: 1 });
      list.push({ g: g, ph: f[2] });
    });
    var logs = svg("g", {}, s);
    logs.innerHTML = pw(["r", -fw * 0.42, -fw * 0.08, fw * 0.84, fw * 0.1, 6], C.bark, { a: 0.95 }) + pw(["r", -fw * 0.3, -fw * 0.14, fw * 0.6, fw * 0.09, 6], C.wood, { a: 0.95 });
    logs.setAttribute("transform", "translate(" + f1(fx) + "," + f1(fy) + ")");
    return function (t) {
      list.forEach(function (q, i) {
        var sy = 0.85 + 0.15 * Math.sin(t * 9 + q.ph) + 0.06 * Math.sin(t * 23 + q.ph * 2), sx = 1 + 0.05 * Math.sin(t * 7 + q.ph);
        setA(q.g, "transform", "translate(" + f1(fx + Math.sin(t * 5 + q.ph) * 2) + "," + f1(fy - fw * 0.06) + ") scale(" + f2(sx) + "," + f2(sy) + ")");
      });
    };
  };
  function cwashSvgGlow(s, x, y, r) {
    var id = "sbglow" + (seedCounter++);
    var defs = svg("defs", {}, s), rg = svg("radialGradient", { id: id }, defs);
    svg("stop", { offset: "0", "stop-color": "#F6C76E", "stop-opacity": "0.45" }, rg);
    svg("stop", { offset: "1", "stop-color": "#F6C76E", "stop-opacity": "0" }, rg);
    svg("circle", { cx: f1(x), cy: f1(y), r: f1(r), fill: "url(#" + id + ")" }, s);
  }

  // ------------------------- loose washes -------------------------
  function wash(o) {
    o = obj(o);
    var st = ensure(), x = num(o.x, 0), y = num(o.y, 0), w = Math.max(4, num(o.w, 200)), h = Math.max(4, num(o.h, 200));
    var pad = Math.max(w, h) * 0.12, c = mkCanvas(w + pad * 2, h + pad * 2, "sb-wash"), ctx = c.getContext("2d");
    var col = colorOf(o.color, C.sage), shape = str(o.shape) || "blob", seed = num(o.seed, seedCounter++), a = num(o.alpha, o.solid ? 0.92 : 0.55);
    var sh, cx = pad + w / 2, cy = pad + h / 2;
    if (shape === "rect") sh = ["r", pad, pad, w, h, Math.min(w, h) * 0.06];
    else if (shape === "oval") sh = ["e", cx, cy, w / 2, h / 2];
    else if (shape === "cloud") {
      var pts = [], n = 60;
      for (var i = 0; i < n; i++) { var an = (i / n) * TAU, bump = 1 + 0.1 * Math.abs(Math.sin(an * 4.5)); pts.push([cx + Math.cos(an) * (w / 2) * 0.92 * bump, cy + Math.sin(an) * (h / 2) * 0.88 * bump]); }
      sh = ["p", pts];
    } else {
      var r = rng(seed), pb = [], m = 40;
      for (var j = 0; j < m; j++) { var a2 = (j / m) * TAU, k = 0.86 + 0.14 * Math.sin(a2 * 3 + r() * 2) + (r() - 0.5) * 0.04; pb.push([cx + Math.cos(a2) * (w / 2) * k, cy + Math.sin(a2) * (h / 2) * k]); }
      sh = ["p", pb];
    }
    cwash(ctx, sh, col, { alpha: a, wob: Math.min(w, h) * 0.025, blur: Math.max(1, Math.min(w, h) * 0.012), lift: 3, gran: 0.5, edge: o.solid ? 0.3 : 0.4, seed: seed });
    if (o.pencil) cpencil(ctx, sh, { op: 0.45, w: u(1.6), seed: seed + 3 });
    c.getContext("2d").globalCompositeOperation = "source-atop";
    grainFill(ctx, c.width, c.height, 0.45, 1.2);
    place(c, x - pad, y - pad);
    (o.parent || st.L.mid).appendChild(c);
    var bAt = null, bDur = 0.9, mask = function (p) {
      if (p >= 1) { setS(c, "maskImage", "none"); setS(c, "webkitMaskImage", "none"); setS(c, "opacity", "1"); return; }
      var R = Math.hypot(w, h) * 0.62 * outC(p), g = "radial-gradient(circle at 50% 50%, #000 0px, #000 " + f1(R * 0.6) + "px, rgba(0,0,0,0) " + f1(R + 0.5) + "px)";
      setS(c, "maskImage", g); setS(c, "webkitMaskImage", g); setS(c, "opacity", f2(clamp(p * 3, 0, 1)));
    };
    var outAt = null;
    onFrame(function (t) {
      if (bAt != null) mask(prog(t, bAt, bDur));
      if (outAt != null && t >= outAt) setS(c, "opacity", f2(1 - prog(t, outAt, 0.5)));
    });
    return { el: c, x: x, y: y, w: w, h: h, bloom: function (at, dur) { bAt = num(at, 0); bDur = num(dur, 0.9); return this; }, out: function (at) { outAt = num(at, D); return this; } };
  }

  // ------------------------- painted objects (pen-and-wash, 100-unit box centred on 0,0) -------------------------
  function E_(cx, cy, rx, ry) { return ["e", cx, cy, rx, ry == null ? rx : ry]; }
  function R_(x, y, w, h, r) { return ["r", x, y, w, h, r || 0]; }
  function P_(pts) { return ["p", pts]; }
  function L_(pts) { return ["l", pts]; }
  function arcPts(cx, cy, r, a0, a1, n) { var o = []; n = n || 16; for (var i = 0; i <= n; i++) { var a = a0 + ((a1 - a0) * i) / n; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return o; }
  function starPts(cx, cy, R, r0, n) { var o = []; for (var i = 0; i < n * 2; i++) { var a = -PI / 2 + (i * PI) / n, rr = i % 2 ? r0 : R; o.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); } return o; }
  function heartPts(cx, cy, s) {
    var o = [];
    for (var i = 0; i < 48; i++) { var t = (i / 48) * TAU, x = 16 * Math.pow(Math.sin(t), 3), y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)); o.push([cx + x * s, cy + y * s]); }
    return o;
  }
  function pl(pts, o) { return pen(L_(pts), o); }
  var OBJ = {
    apple: function () { return pw(P_(arcPts(0, 6, 34, -PI * 0.42, PI * 1.42, 22).concat([[-6, -28], [0, -24], [6, -28]])), C.rust, { a: 0.9 }) + pl([[0, -24], [3, -40]], { w: 2.4 }) + pw(P_([[3, -34], [16, -44], [26, -38], [12, -32]]), C.leaf); },
    pear: function () { return pw(P_([[0, -36], [10, -30], [14, -12], [28, 8], [30, 26], [18, 40], [0, 44], [-18, 40], [-30, 26], [-28, 8], [-14, -12], [-10, -30]]), "#BFC46A", { a: 0.9 }) + pl([[0, -36], [-2, -46]], { w: 2.4 }) + pw(P_([[-1, -42], [12, -50], [20, -44], [8, -38]]), C.leaf); },
    acorn: function () { return pw(E_(0, 12, 22, 28), C.ochre) + pw(P_([[-28, -6], [-24, -20], [-10, -28], [10, -28], [24, -20], [28, -6], [0, -2]]), C.bark) + pl([[0, -28], [4, -40]], { w: 2.6 }) + pl([[-18, -16], [-6, -8]], { w: 1.2, op: 0.5 }) + pl([[-4, -22], [10, -10]], { w: 1.2, op: 0.5 }) + pl([[10, -22], [20, -12]], { w: 1.2, op: 0.5 }); },
    mushroom: function () { return pw(P_([[-12, 0], [-14, 36], [14, 36], [12, 0]]), C.cream) + pw(P_(arcPts(0, 4, 40, PI, TAU, 18).concat([[30, 6], [-30, 6]])), C.terracotta) + solid(E_(-16, -16, 6, 5), C.cream, { a: 0.95 }) + solid(E_(10, -24, 5, 4), C.cream, { a: 0.95 }) + solid(E_(22, -6, 4, 3), C.cream, { a: 0.95 }); },
    leaf: function () { return pw(P_([[-40, 30], [-30, -6], [-6, -30], [30, -40], [24, -6], [4, 22], [-24, 34]]), C.leaf) + pl([[-40, 30], [-8, 2], [22, -30]], { w: 1.6 }) + pl([[-16, 10], [-18, -6]], { w: 1.1, op: 0.6 }) + pl([[0, -4], [-2, -20]], { w: 1.1, op: 0.6 }) + pl([[-6, 6], [10, 8]], { w: 1.1, op: 0.6 }); },
    flower: function () {
      var s = pl([[0, 4], [2, 46]], { w: 2.4, c: C.forest }) + pw(P_([[2, 30], [20, 18], [28, 26], [10, 34]]), C.leaf);
      for (var i = 0; i < 5; i++) { var a = -PI / 2 + (i * TAU) / 5; s += pw(E_(Math.cos(a) * 17, -10 + Math.sin(a) * 17, 13, 13), i % 2 ? C.rose : C.blush, { a: 0.88 }); }
      return s + pw(E_(0, -10, 9, 9), C.honey);
    },
    tulip: function () { return pl([[0, 0], [0, 46]], { w: 2.4, c: C.forest }) + pw(P_([[0, 44], [-22, 6], [-6, 30]]), C.leaf) + pw(P_([[0, 44], [22, 10], [6, 32]]), C.leaf) + pw(P_([[-20, -34], [-10, -24], [0, -38], [10, -24], [20, -34], [18, -4], [0, 6], [-18, -4]]), C.terracotta); },
    tree: function () { return pw(P_([[-7, 44], [-5, 2], [5, 2], [7, 44]]), C.bark) + pw(E_(-16, -8, 22, 20), C.moss) + pw(E_(16, -10, 22, 20), C.leaf) + pw(E_(0, -26, 26, 22), C.leaf) + pw(E_(-4, -10, 18, 14), C.spring, { pen: false, a: 0.6 }); },
    pine: function () { return pw(R_(-5, 30, 10, 16, 2), C.bark) + pw(P_([[-34, 34], [0, -2], [34, 34]]), C.pine) + pw(P_([[-28, 12], [0, -24], [28, 12]]), C.forest) + pw(P_([[-20, -10], [0, -46], [20, -10]]), C.moss); },
    forest: function () { return OBJ._small("pine", -24, 4, 0.62) + OBJ._small("tree", 22, 6, 0.6) + OBJ._small("pine", 0, 14, 0.7); },
    house: function () { return pw(R_(-30, -6, 60, 46, 2), C.cream) + pw(R_(14, -40, 9, 20, 1), C.rust) + pw(P_([[-38, -4], [0, -38], [38, -4]]), C.terracotta) + pw(R_(-4, 12, 16, 28, 6), C.moss) + pw(R_(-24, 4, 14, 14, 2), C.skyLt) + pl([[-17, 4], [-17, 18]], { w: 1.2 }); },
    castle: function () {
      var crenel = [[-26, -8], [-26, -16], [-18, -16], [-18, -10], [-8, -10], [-8, -16], [0, -16], [0, -10], [8, -10], [8, -16], [18, -16], [18, -10], [26, -10], [26, -8]];
      return pw(P_([[-26, 40]].concat(crenel).concat([[26, 40]])), C.stone) + pw(R_(-42, -22, 18, 62, 2), C.stone) + pw(R_(24, -22, 18, 62, 2), C.stone) +
        pw(P_([[-46, -20], [-33, -48], [-20, -20]]), C.terracotta) + pw(P_([[20, -20], [33, -48], [46, -20]]), C.terracotta) + pw(P_([[-10, 40], [-10, 18], [0, 10], [10, 18], [10, 40]]), C.bark) +
        pl([[33, -48], [33, -58]], { w: 1.6 }) + pw(P_([[33, -58], [44, -54], [33, -50]]), C.rose, { a: 0.95 }) + solid(R_(-36, -6, 6, 9, 2), C.ink, { a: 0.7 }) + solid(R_(30, -6, 6, 9, 2), C.ink, { a: 0.7 });
    },
    tower: function () { return pw(P_([[-18, 44], [-15, -18], [15, -18], [18, 44]]), C.stone) + pw(P_([[-22, -16], [0, -48], [22, -16]]), C.slate) + pw(R_(-5, -6, 10, 14, 5), C.honey) + pw(R_(-7, 24, 14, 20, 7), C.bark) + pl([[-16, 6], [16, 6]], { w: 1, op: 0.4 }) + pl([[-17, 18], [17, 18]], { w: 1, op: 0.4 }); },
    lighthouse: function () { return pw(P_([[-16, 44], [-11, -14], [11, -14], [16, 44]]), C.cream) + pw(P_([[-14, 20], [-13, 8], [13, 8], [14, 20]]), C.terracotta, { pen: false }) + pw(P_([[-12, -2], [-11.5, -10], [11.5, -10], [12, -2]]), C.terracotta, { pen: false }) + pw(R_(-12, -30, 24, 16, 2), C.butter) + pw(P_([[-16, -30], [0, -46], [16, -30]]), C.rust) + pl([[-26, -22], [-38, -26]], { w: 1.4 }) + pl([[26, -22], [38, -26]], { w: 1.4 }); },
    windmill: function () {
      var s = pw(P_([[-18, 44], [-12, -14], [12, -14], [18, 44]]), C.cream) + pw(P_([[-15, -12], [0, -28], [15, -12]]), C.rust) + pw(R_(-5, 26, 10, 18, 5), C.bark);
      for (var i = 0; i < 4; i++) { var a = PI / 4 + (i * PI) / 2, c = Math.cos(a), sn = Math.sin(a), bx = 0, by = -18; s += pw(P_([[bx + c * 4 - sn * 5, by + sn * 4 + c * 5], [bx + c * 40 - sn * 7, by + sn * 40 + c * 7], [bx + c * 40 + sn * 7, by + sn * 40 - c * 7], [bx + c * 4 + sn * 5, by + sn * 4 - c * 5]]), C.sand, { a: 0.85 }); }
      return s + solid(E_(0, -18, 4, 4), C.ink, { a: 0.8 });
    },
    bridge: function () { return pw(R_(-48, 26, 96, 14, 4), C.sea, { a: 0.7 }) + pw(P_([[-48, 30], [-48, -4], [48, -4], [48, 30], [26, 30], [20, 10], [0, 2], [-20, 10], [-26, 30]]), C.stone) + pw(R_(-48, -12, 96, 9, 2), C.wood) + pl([[-40, -12], [-40, -24]], { w: 1.6 }) + pl([[40, -12], [40, -24]], { w: 1.6 }) + pl([[-40, -22], [0, -18], [40, -22]], { w: 1.6 }); },
    well: function () { return pw(P_([[-28, 10], [-28, 40], [28, 40], [28, 10]]), C.stone) + pw(E_(0, 10, 28, 7), C.slate) + pl([[-22, 10], [-22, -26]], { w: 2.4, c: C.bark }) + pl([[22, 10], [22, -26]], { w: 2.4, c: C.bark }) + pw(P_([[-34, -22], [0, -44], [34, -22]]), C.terracotta) + pl([[0, -24], [0, -6]], { w: 1.2 }) + pw(R_(-6, -8, 12, 10, 2), C.wood); },
    mountain: function () { return pw(P_([[-48, 38], [-8, -36], [20, 4], [30, -10], [48, 38]]), C.slate) + pw(P_([[-18, -18], [-8, -36], [3, -18], [-4, -14], [-10, -20]]), C.snow, { a: 0.95 }) + pw(P_([[-48, 38], [-30, 22], [-12, 30], [8, 20], [30, 30], [48, 38]]), C.sage, { a: 0.85 }); },
    boat: function () { return pw(P_([[-42, 12], [42, 12], [30, 32], [-32, 32]]), C.rust) + pl([[0, 12], [0, -44]], { w: 2.2 }) + pw(P_([[3, -42], [34, 6], [3, 6]]), C.cream) + pw(P_([[-3, -32], [-28, 6], [-3, 6]]), C.butter) + pw(R_(-48, 30, 96, 8, 4), C.sea, { a: 0.6 }); },
    star: function () { return pw(P_(starPts(0, 2, 44, 19, 5)), C.honey, { a: 0.92 }); },
    moon: function () { return pw(P_(arcPts(0, 0, 40, -PI * 0.38, PI * 1.38, 26).concat(arcPts(16, -4, 30, PI * 0.85, -PI * 0.75, 18).slice(1, -1))), "#F2DFA6", { a: 0.95 }) + solid(E_(-18, 8, 4, 3), "#DCC688", { a: 0.7 }); },
    sun: function () {
      var s = "";
      for (var i = 0; i < 10; i++) { var a = (i * TAU) / 10; s += pl([[Math.cos(a) * 30, Math.sin(a) * 30], [Math.cos(a) * 44, Math.sin(a) * 44]], { w: 2.4, c: C.ochre }); }
      return s + pw(E_(0, 0, 25, 25), C.honey);
    },
    cloud: function () { return pw(P_([[-40, 18], [-44, 4], [-32, -6], [-24, -22], [-6, -26], [8, -18], [22, -24], [36, -12], [44, 4], [38, 18]]), C.snow, { a: 0.95 }) + pw(R_(-38, 8, 74, 10, 5), "#C9CCDA", { pen: false, a: 0.35 }); },
    rainbow: function () {
      var s = "", cols = [C.terracotta, C.honey, C.butter, C.leaf, C.blue];
      cols.forEach(function (c, i) { var r0 = 42 - i * 6; s += wsh(P_(arcPts(0, 26, r0, PI, TAU, 22).concat(arcPts(0, 26, r0 - 6, TAU, PI, 22))), c, { a: 0.85, bloom: false }); });
      return s + pen(L_(arcPts(0, 26, 42, PI, TAU, 22)), { w: 1.6 }) + pw(E_(-36, 28, 14, 9), C.snow) + pw(E_(36, 28, 14, 9), C.snow);
    },
    heart: function () { return pw(P_(heartPts(0, -2, 2.6)), C.rose, { a: 0.92 }); },
    book: function () { return pw(P_([[-44, -24], [-4, -30], [0, -26], [4, -30], [44, -24], [44, 30], [4, 26], [0, 30], [-4, 26], [-44, 30]]), C.rust) + pw(P_([[-40, -24], [-2, -28], [-2, 24], [-40, 26]]), C.cream) + pw(P_([[40, -24], [2, -28], [2, 24], [40, 26]]), C.cream) + pl([[-34, -14], [-8, -16]], { w: 1, op: 0.5 }) + pl([[-34, -4], [-8, -6]], { w: 1, op: 0.5 }) + pl([[-34, 6], [-8, 4]], { w: 1, op: 0.5 }) + pl([[8, -16], [34, -14]], { w: 1, op: 0.5 }) + pl([[8, -6], [34, -4]], { w: 1, op: 0.5 }); },
    key: function () { return pw(E_(-24, 0, 16, 16), C.gold) + solid(E_(-24, 0, 6, 6), C.paper, { a: 1 }) + pw(R_(-9, -5, 50, 10, 3), C.gold) + pw(R_(24, 4, 6, 12, 1), C.gold) + pw(R_(34, 4, 6, 9, 1), C.gold); },
    lantern: function () { return pl(arcPts(0, -28, 12, PI, TAU, 10), { w: 2.4 }) + pw(R_(-16, -28, 32, 8, 3), C.ink, { a: 0.75 }) + pw(R_(-14, -20, 28, 46, 6), C.butter) + pw(E_(0, 4, 8, 12), C.honey, { pen: false }) + pw(R_(-18, 26, 36, 8, 3), C.ink, { a: 0.75 }) + pl([[-10, -20], [-10, 26]], { w: 1.2 }) + pl([[10, -20], [10, 26]], { w: 1.2 }); },
    candle: function () { return pw(E_(0, 36, 30, 8), C.ochre) + pw(R_(-10, -10, 20, 46, 3), C.cream) + pw(P_([[0, -40], [7, -24], [0, -14], [-7, -24]]), C.honey) + pl([[0, -14], [0, -10]], { w: 1.6 }); },
    teacup: function () { return pw(E_(0, 30, 40, 9), C.cream) + pw(P_([[-30, -8], [30, -8], [24, 22], [-24, 22]]), C.skyLt) + pw(E_(0, -8, 30, 6), C.bark, { a: 0.85 }) + pen(L_(arcPts(30, 4, 10, -PI / 2, PI / 2, 10)), { w: 2.4 }) + pl([[-8, -18], [-4, -28], [-8, -38]], { w: 1.3, op: 0.6 }) + pl([[6, -18], [10, -28], [6, -38]], { w: 1.3, op: 0.6 }); },
    cake: function () { return pw(R_(-36, 6, 72, 30, 4), C.blush) + pw(R_(-24, -18, 48, 24, 4), C.cream) + pw(P_([[-36, 8], [-26, 14], [-14, 8], [-2, 14], [10, 8], [22, 14], [36, 8], [36, 4], [-36, 4]]), C.snow, { a: 0.95 }) + pw(E_(0, -24, 6, 6), C.rust) + pw(E_(0, 40, 44, 6), C.stone, { a: 0.6 }); },
    bread: function () { return pw(P_([[-42, 24], [-44, 4], [-34, -14], [-14, -22], [14, -22], [34, -14], [44, 4], [42, 24]]), C.honey) + pl([[-24, -12], [-16, 4]], { w: 1.6 }) + pl([[-4, -16], [4, 2]], { w: 1.6 }) + pl([[16, -14], [24, 2]], { w: 1.6 }); },
    honey: function () { return pw(R_(-26, -18, 52, 58, 10), C.honey) + pw(R_(-22, 2, 44, 34, 8), C.gold, { pen: false, a: 0.6 }) + pw(R_(-30, -30, 60, 14, 4), C.rose) + pw(P_([[-32, -26], [-24, -16], [-14, -24], [-4, -16], [6, -24], [16, -16], [26, -24], [32, -20]]), C.rose, { a: 0.8 }) + pw(R_(-14, -2, 28, 18, 3), C.cream); },
    basket: function () { return pen(L_(arcPts(0, -6, 30, PI, TAU, 14)), { w: 3, c: C.wood }) + pw(P_([[-40, -6], [40, -6], [30, 38], [-30, 38]]), C.wood) + pl([[-36, 8], [36, 8]], { w: 1.2, op: 0.6 }) + pl([[-33, 22], [33, 22]], { w: 1.2, op: 0.6 }) + pl([[-12, -6], [-10, 38]], { w: 1.2, op: 0.6 }) + pl([[12, -6], [10, 38]], { w: 1.2, op: 0.6 }); },
    umbrella: function () { return pl([[0, -24], [0, 34], [-8, 42], [-14, 36]], { w: 2.6 }) + pw(P_(arcPts(0, -4, 42, PI, TAU, 18).concat([[42, -4], [28, -10], [14, -4], [0, -10], [-14, -4], [-28, -10]])), C.terracotta); },
    feather: function () { return pw(P_([[-30, 40], [-24, 10], [-8, -18], [14, -38], [30, -44], [24, -20], [8, 8], [-14, 30]]), C.sky) + pl([[-36, 46], [-6, 6], [26, -38]], { w: 1.8 }) + pl([[-12, 14], [-22, 6]], { w: 1, op: 0.5 }) + pl([[4, -8], [-4, -16]], { w: 1, op: 0.5 }); },
    shell: function () {
      var s = pw(P_([[0, 36], [-34, 8], [-36, -12], [-20, -30], [0, -36], [20, -30], [36, -12], [34, 8]]), C.blush) + pw(R_(-10, 30, 20, 10, 4), C.blush);
      for (var i = -2; i <= 2; i++) s += pl([[0, 34], [i * 14, -30 + Math.abs(i) * 6]], { w: 1.2, op: 0.6 });
      return s;
    },
    fish: function () { return pw(P_([[-36, 0], [-14, -20], [16, -16], [30, 0], [16, 16], [-14, 20]]), C.sky) + pw(P_([[28, 0], [46, -16], [42, 0], [46, 16]]), C.blue) + solid(E_(-20, -4, 3.5, 3.5), C.ink) + pl([[-4, -12], [0, 0], [-4, 12]], { w: 1.2, op: 0.6 }); },
    bird: function () { return pw(E_(0, 6, 30, 24), C.brown) + pw(E_(10, 12, 18, 14), C.terracotta) + pw(E_(-14, -14, 15, 14), C.brown) + pw(P_([[-28, -16], [-40, -12], [-28, -10]]), C.ochre) + solid(E_(-17, -17, 2.8, 2.8), C.ink) + pw(P_([[-6, 4], [22, -6], [30, 4], [6, 14]]), shade(C.brown, 0.85)) + pl([[-4, 30], [-6, 40]], { w: 1.6 }) + pl([[6, 30], [6, 40]], { w: 1.6 }); },
    butterfly: function () { return pw(E_(-20, -12, 20, 18), C.honey) + pw(E_(20, -12, 20, 18), C.honey) + pw(E_(-16, 16, 14, 13), C.rose) + pw(E_(16, 16, 14, 13), C.rose) + pw(R_(-3, -22, 6, 46, 3), C.ink, { a: 0.8 }) + pl([[0, -22], [-8, -36]], { w: 1.3 }) + pl([[0, -22], [8, -36]], { w: 1.3 }); },
    crown: function () { return pw(P_([[-36, 24], [-40, -18], [-20, 2], [0, -28], [20, 2], [40, -18], [36, 24]]), C.gold) + pw(R_(-36, 20, 72, 12, 3), C.ochre) + solid(E_(0, 6, 5, 6), C.rose, { a: 0.95 }) + solid(E_(-20, 26, 4, 3), C.blue, { a: 0.9 }) + solid(E_(20, 26, 4, 3), C.leaf, { a: 0.9 }); },
    gift: function () { return pw(R_(-34, -6, 68, 46, 3), C.sage) + pw(R_(-38, -18, 76, 14, 3), C.moss) + pw(R_(-6, -18, 12, 58, 1), C.rust, { pen: false }) + pw(P_([[0, -18], [-22, -36], [-26, -22]]), C.rust) + pw(P_([[0, -18], [22, -36], [26, -22]]), C.rust); },
    clock: function () { return pw(E_(0, 0, 38, 38), C.wood) + pw(E_(0, 0, 30, 30), C.cream) + pl([[0, 0], [0, -20]], { w: 2.6 }) + pl([[0, 0], [14, 6]], { w: 2.6 }) + solid(E_(0, 0, 3, 3), C.ink) + pl([[0, -27], [0, -24]], { w: 1.4 }) + pl([[27, 0], [24, 0]], { w: 1.4 }) + pl([[0, 27], [0, 24]], { w: 1.4 }) + pl([[-27, 0], [-24, 0]], { w: 1.4 }); },
    letter: function () { return pw(R_(-42, -26, 84, 54, 3), C.cream) + pl([[-42, -24], [0, 6], [42, -24]], { w: 1.8 }) + pw(E_(0, 4, 9, 9), C.rust); },
    map: function () { return pw(P_([[-42, -30], [-14, -36], [14, -28], [42, -34], [42, 30], [14, 36], [-14, 28], [-42, 34]]), C.sand) + pl([[-14, -36], [-14, 28]], { w: 1, op: 0.4 }) + pl([[14, -28], [14, 36]], { w: 1, op: 0.4 }) + pen(L_([[-30, 18], [-16, 4], [-2, 10], [10, -6], [22, -12]]), { w: 1.8, c: C.rust }) + pl([[22, -20], [32, -8]], { w: 2.4, c: C.rust }) + pl([[32, -20], [22, -8]], { w: 2.4, c: C.rust }); },
    compass: function () { return pw(E_(0, 0, 40, 40), C.ochre) + pw(E_(0, 0, 32, 32), C.cream) + pw(P_([[0, -28], [7, 0], [0, 4], [-7, 0]]), C.rust) + pw(P_([[0, 28], [7, 0], [0, -4], [-7, 0]]), C.slate) + solid(E_(0, 0, 3, 3), C.ink); },
    egg: function () { return pw(P_([[0, -40], [18, -30], [30, -4], [30, 16], [18, 36], [0, 42], [-18, 36], [-30, 16], [-30, -4], [-18, -30]]), C.cream) + pw(E_(-10, -14, 6, 8), C.snow, { pen: false, a: 0.7 }); },
    carrot: function () { return pw(P_([[-14, -20], [14, -20], [4, 40], [0, 46], [-4, 40]]), C.terracotta) + pl([[-8, -6], [0, -4]], { w: 1.2, op: 0.6 }) + pl([[2, 12], [8, 14]], { w: 1.2, op: 0.6 }) + pw(P_([[-2, -20], [-16, -44], [-6, -40], [0, -24]]), C.leaf) + pw(P_([[0, -20], [4, -48], [10, -42], [4, -22]]), C.leaf) + pw(P_([[2, -20], [20, -40], [22, -32], [6, -20]]), C.moss); },
    berries: function () { return pw(P_([[-6, -30], [-34, -36], [-22, -20]]), C.leaf) + pw(P_([[6, -30], [32, -40], [22, -22]]), C.moss) + pw(E_(-14, 0, 13, 13), C.plum) + pw(E_(12, -4, 13, 13), C.violet) + pw(E_(0, 20, 13, 13), C.plum) + pw(E_(-20, 24, 11, 11), C.violet) + pw(E_(20, 22, 11, 11), C.plum); },
    seed: function () { return pw(E_(0, 16, 16, 22), C.ochre) + pl([[0, -4], [0, -26]], { w: 2, c: C.forest }) + pw(P_([[0, -24], [-20, -38], [-24, -28], [-6, -22]]), C.leaf) + pw(P_([[0, -22], [18, -40], [24, -30], [6, -20]]), C.spring); },
    snowflake: function () {
      var s = pw(E_(0, 0, 14, 14), C.skyLt, { a: 0.6 });
      for (var i = 0; i < 6; i++) { var a = (i * PI) / 3, c = Math.cos(a), sn = Math.sin(a); s += pl([[0, 0], [c * 42, sn * 42]], { w: 2.4, c: C.blue }) + pl([[c * 24, sn * 24], [c * 24 + Math.cos(a + 0.8) * 12, sn * 24 + Math.sin(a + 0.8) * 12]], { w: 1.8, c: C.blue }) + pl([[c * 24, sn * 24], [c * 24 + Math.cos(a - 0.8) * 12, sn * 24 + Math.sin(a - 0.8) * 12]], { w: 1.8, c: C.blue }); }
      return s;
    },
    tent: function () { return pw(P_([[-44, 36], [0, -36], [44, 36]]), C.terracotta) + pw(P_([[0, -36], [-12, 36], [12, 36]]), "#5A3A30", { a: 0.85 }) + pl([[0, -36], [0, -48]], { w: 1.6 }) + pw(P_([[0, -48], [14, -44], [0, -40]]), C.butter); },
    cave: function () { return pw(P_([[-46, 36], [-40, 0], [-20, -28], [10, -34], [34, -18], [46, 12], [46, 36]]), C.stone) + pw(P_([[-16, 36], [-14, 8], [0, -6], [14, 6], [18, 36]]), "#3A2E2A", { a: 0.9 }) + pw(P_([[-46, 36], [-30, 28], [-16, 36]]), C.moss, { a: 0.85 }); },
    lake: function () { return pw(E_(0, 10, 46, 22), C.sea) + pl([[-26, 8], [-10, 8]], { w: 1.4, c: C.snow }) + pl([[6, 16], [24, 16]], { w: 1.4, c: C.snow }) + pl([[-36, 4], [-38, -20]], { w: 1.8, c: C.forest }) + pl([[-30, 6], [-28, -14]], { w: 1.8, c: C.forest }) + pw(E_(-38, -22, 3, 7), C.bark); },
    village: function () { return OBJ._small("house", -24, 8, 0.55) + OBJ._small("house", 22, 12, 0.6) + OBJ._small("tower", 0, -8, 0.55); },
  };
  OBJ._small = function (name, dx, dy, k) { return '<g transform="translate(' + dx + "," + dy + ") scale(" + k + ')">' + OBJ[name]() + "</g>"; };
  var OBJ_NAMES = Object.keys(OBJ).filter(function (k) { return k.charAt(0) !== "_"; });
  var OBJ_SYN = { home: "house", cottage: "house", jar: "honey", scarf: "heart", love: "heart", kindness: "heart", lamp: "lantern", light: "lantern", present: "gift", treasure: "gift", cup: "teacup", tea: "teacup", mug: "teacup", loaf: "bread", pie: "cake", cookie: "cake", rose: "flower", daisy: "flower", blossom: "flower", oak: "tree", woods: "forest", wood: "forest", ship: "boat", hill: "mountain", peak: "mountain", time: "clock", hour: "clock", wish: "star", dream: "cloud", note: "letter", mail: "letter", owl: "bird", robin: "bird", water: "lake", pond: "lake", river: "lake", sea: "lake", orange: "apple", fruit: "apple", nut: "acorn", gem: "crown", king: "crown", queen: "crown", sprout: "seed", plant: "seed", snow: "snowflake", winter: "snowflake", spring: "flower", summer: "sun", autumn: "leaf", fall: "leaf", night: "moon", day: "sun", rain: "umbrella", camp: "tent", idea: "star", town: "village", door: "house" };
  function objKey(n) {
    n = normWord(n);
    if (!n) return null;
    if (OBJ[n] && n.charAt(0) !== "_") return n;
    if (OBJ_SYN[n]) return OBJ_SYN[n];
    var s1 = n.replace(/ies$/, "y").replace(/es$/, "").replace(/s$/, "");
    if (OBJ[s1]) return s1;
    if (OBJ[n.replace(/s$/, "")]) return n.replace(/s$/, "");
    if (OBJ_SYN[s1]) return OBJ_SYN[s1];
    return null;
  }
  var objCache = {};
  function objMarkup(name) {
    var k = objKey(name);
    var key = k || "?" + normWord(name).charAt(0);
    if (objCache[key]) return objCache[key];
    var keep = seedCounter;
    seedCounter = 1000 + hstr(key) * 7;
    var m;
    if (k) m = OBJ[k]();
    else {
      var letter = (str(name).charAt(0) || "*").toUpperCase().replace(/[<>&"]/g, "*");
      m = wsh(E_(0, 2, 40, 36), C.sage, { a: 0.6 }) + pen(E_(0, 2, 34, 31), { w: 1.6, op: 0.6 }) + '<text class="sbp-t" x="0" y="17" text-anchor="middle" font-family=\'' + SERIF + '\' font-style="italic" font-size="50" fill="' + PEN + '">' + letter + "</text>";
    }
    seedCounter = keep;
    objCache[key] = m;
    return m;
  }
  // A painted object element (SVG) centred at x, y. Pencil draws first, then the colour soaks in.
  var uidN = 0;
  function object(name, o) {
    o = obj(o);
    var st = ensure(), x = num(o.x, W / 2), y = num(o.y, H / 2), size = Math.max(8, num(o.size, u(140)));
    var id = "sbo" + ++uidN, m = objMarkup(name);
    var s = svg("svg", { class: "sb-obj", width: f1(size), height: f1(size), viewBox: "-50 -50 100 100", overflow: "visible" });
    s.innerHTML = '<defs><radialGradient id="' + id + 'g"><stop offset="0.55" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient><mask id="' + id + 'm" maskUnits="userSpaceOnUse" x="-80" y="-80" width="160" height="160"><circle cx="0" cy="0" r="200" fill="url(#' + id + 'g)"/></mask></defs>' +
      '<g class="sb-o-rot"><g class="sb-o-w" mask="url(#' + id + 'm)">' + m + '</g><g class="sb-o-p">' + m + "</g></g>";
    (o.parent || st.L.front).appendChild(s);
    var rot = s.querySelector(".sb-o-rot"), circ = s.querySelector("circle"), pens = s.querySelector(".sb-o-p");
    if (o.rotate) rot.setAttribute("transform", "rotate(" + num(o.rotate, 0) + ")");
    var api = { el: s, name: objKey(name) || str(name), x: x, y: y, size: size };
    var mode = null, at = 0, dur = 1, outAt = null, outDur = 0.5, bobA = 0, bobS = 1, bobFrom = 0;
    api.paintOn = function (t0, d) { mode = "paint"; at = num(t0, 0.3); dur = Math.max(0.2, num(d, 1.0)); return api; };
    api.fadeIn = function (t0, d) { mode = "fade"; at = num(t0, 0.3); dur = Math.max(0.1, num(d, 0.6)); return api; };
    api.bob = function (amp, speed) { bobA = num(amp, u(6)); bobS = num(speed, 1.2); return api; };
    api.out = function (t0, d) { outAt = num(t0, D); outDur = num(d, 0.5); return api; };
    api.box = function () { return { x: x - size * 0.46, y: y - size * 0.46, w: size * 0.92, h: size * 0.92 }; };
    api.paintOn(o.at == null ? 0.3 : o.at, o.dur);
    if (o.show === true) mode = null;
    onFrame(function (t) {
      var vis = true, op = 1, dy = 0, sc = 1;
      if (mode === "paint") {
        if (t < at) vis = false;
        else {
          var pp = prog(t, at, dur * 0.6), pwsh = prog(t, at + dur * 0.3, dur * 0.7);
          setV(pens, "--pen", f2(1 - outC(pp)));
          setA(circ, "r", f1(pwsh >= 1 ? 200 : 4 + outC(pwsh) * 92));
          sc = 0.94 + 0.06 * outC(prog(t, at, dur));
        }
      } else if (mode === "fade") {
        if (t < at) vis = false;
        else { var pf = prog(t, at, dur); op = outC(pf); dy = (1 - outC(pf)) * size * 0.08; setV(pens, "--pen", "0"); setA(circ, "r", "200"); }
      } else { setV(pens, "--pen", "0"); setA(circ, "r", "200"); }
      if (outAt != null && t >= outAt) op *= 1 - prog(t, outAt, outDur);
      if (bobA) dy += bobA * Math.sin((t - bobFrom) * bobS * TAU * 0.5);
      show(s, vis && op > 0.001);
      if (!vis) return;
      setS(s, "opacity", f2(op));
      setS(s, "transform", "translate(" + f1(x - size / 2) + "px," + f1(y - size / 2 + dy) + "px) scale(" + f2(sc) + ")");
    });
    return api;
  }
  // Generic paint-on for any SVG element built from S.washMarkup / S.penMarkup.
  function paintOnEl(target, at, dur) {
    var el = target && target.el ? target.el : target;
    if (!el || !el.querySelectorAll) return target;
    if (target && target.paintOn && target !== el) return target.paintOn(at, dur);
    at = num(at, 0.3); dur = Math.max(0.2, num(dur, 1));
    el.classList.add("sb-paintable");
    onFrame(function (t) {
      show(el, t >= at);
      setV(el, "--pen", f2(1 - outC(prog(t, at, dur * 0.6))));
      setV(el, "--wash", f2(outC(prog(t, at + dur * 0.3, dur * 0.7))));
    });
    return target;
  }

  // ------------------------- the cast (pen-and-wash rigs, feet at y 0, an adult is 300 units) -------------------------
  var RED = "#BF4A3A", MUSTARD = "#D7A23E";
  function tubePts(cl, ws) { // a closed outline around a centre line with half widths
    var L = [], Rr = [];
    cl.forEach(function (p, i) {
      var a = cl[Math.max(0, i - 1)], b = cl[Math.min(cl.length - 1, i + 1)], tx = b[0] - a[0], ty = b[1] - a[1], tl = Math.hypot(tx, ty) || 1;
      L.push([p[0] - (ty / tl) * ws[i], p[1] + (tx / tl) * ws[i]]); Rr.unshift([p[0] + (ty / tl) * ws[i], p[1] - (tx / tl) * ws[i]]);
    });
    return L.concat(Rr);
  }
  function capsule(w, len, c, o) { o = o || {}; return pw(R_(-w / 2, -w * 0.2, w, len + w * 0.4, w / 2), c, { a: o.a || 0.95, wob: 0.5, pw: o.pw || 1.8 }); }
  function legMk(L, kind) {
    var s = capsule(L.w, L.len, L.col);
    if (kind === "boot") s += pw(R_(-L.w * 0.62, L.len - L.shoeH, L.w * 1.24, L.shoeH, 4), L.shoe, { wob: 0.5 }) + pw(E_(L.w * 0.25, L.len - 2, L.w * 0.9, 5), shade(L.shoe, 0.85), { wob: 0.4 });
    else if (kind === "foot") s += pw(E_(L.w * 0.35, L.len - 3, L.foot || L.w * 1.0, L.footH || 6), L.shoe, { wob: 0.5 });
    else if (kind === "sock") s += pw(R_(-L.w * 0.5, L.len - 16, L.w, 9, 3), C.cream, { wob: 0.4, pen: false }) + pw(E_(L.w * 0.3, L.len - 3, L.w * 0.95, 5.5), L.shoe, { wob: 0.4 });
    else if (kind === "owl") s += pen(L_([[0, L.len], [-5, L.len + 4]]), { w: 1.6 }) + pen(L_([[0, L.len], [2, L.len + 5]]), { w: 1.6 }) + pen(L_([[0, L.len], [7, L.len + 3]]), { w: 1.6 });
    return s;
  }
  function armMk(A, part) { // part 0 = upper arm, 1 = forearm + hand
    if (part === 0) return A.wing ? pw(E_(0, A.a1 * 0.5, A.w * 0.55, A.a1 * 0.62), A.col, { wob: 0.6 }) : capsule(A.w, A.a1, A.col);
    if (A.wing) return pw(E_(0, A.a2 * 0.5, A.w * 0.42, A.a2 * 0.7), shade(A.col, 0.9), { wob: 0.5 }) + pen(L_([[-2, 4], [0, A.a2 * 0.9]]), { w: 1, op: 0.5 });
    var s = capsule(A.w * 0.92, A.a2, A.col);
    if (A.cuff) s += pw(R_(-A.w * 0.5, A.a2 - 4, A.w, 6, 3), A.cuff, { wob: 0.3, pen: false });
    return s + pw(E_(0, A.a2 + A.hr * 0.55, A.hr, A.hr * 1.05), A.hand, { wob: 0.4 });
  }
  var CHARS = {
    wren: {
      h: 215, w: 72, hipY: -56, kid: true,
      legs: { len: 52, w: 13, col: "#8C6A5A", shoe: C.rust, shoeH: 17, gap: 6, kind: "boot" },
      upper: function () {
        return pw(E_(-14, -124, 15, 11), shade(MUSTARD, 0.9)) +
          pw(P_([[-18, -128], [18, -128], [24, -100], [35, -55], [18, -51], [0, -54], [-18, -51], [-35, -55], [-24, -100]]), MUSTARD) +
          solid(E_(12, -108, 2.4, 2.4), C.ink, { a: 0.8 }) + solid(E_(14, -90, 2.4, 2.4), C.ink, { a: 0.8 }) + solid(E_(16, -72, 2.4, 2.4), C.ink, { a: 0.8 }) +
          pen(L_([[-22, -80], [-10, -80]]), { w: 1.2, op: 0.6 }) + pen(L_([[4, -126], [8, -56]]), { w: 1.1, op: 0.45 }) +
          pw(R_(-16, -138, 36, 12, 6), RED) + pw(P_([[6, -130], [15, -130], [21, -100], [11, -98]]), RED) +
          pen(L_([[12, -99], [12, -94]]), { w: 1, op: 0.6 }) + pen(L_([[16, -99], [17, -94]]), { w: 1, op: 0.6 });
      },
      neck: [3, -134],
      head: function () {
        return pw(E_(6, -167, 33, 33), C.skin) + pw(E_(-8, -162, 6, 7.5), C.skinDk, { pen: false }) +
          pw(P_([[-29, -146], [-34, -170], [-26, -192], [-6, -203], [14, -201], [31, -189], [38, -174], [31, -176], [20, -183], [8, -181], [-2, -174], [-10, -162], [-14, -142], [-24, -134]]), C.hairBrown) +
          wsh(E_(9, -155, 5.5, 4), C.cheek, { a: 0.45, bloom: false, edge: 0 }) + wsh(E_(31, -156, 3.5, 3), C.cheek, { a: 0.4, bloom: false, edge: 0 }) +
          pen(L_([[37, -164], [40, -159], [36, -157]]), { w: 1.5 });
      },
      eyes: [[14, -169, 3.1, 4.2], [28, -170, 2.6, 3.8]], mouth: [21, -150, 11], hc: [6, -167, 33],
      arm: { sh: [[7, -122], [-7, -122]], a1: 30, a2: 27, w: 12, col: MUSTARD, hand: C.skin, hr: 6.5 },
    },
    oli: {
      h: 210, w: 70, hipY: -58, kid: true,
      legs: { len: 50, w: 12, col: C.skin, shoe: C.brown, gap: 7, kind: "sock" },
      lower: function () { return pw(R_(-21, -68, 42, 24, 6), C.navy); },
      upper: function () {
        return pw(R_(-22, -128, 44, 68, 14), C.blue) +
          wsh(R_(-21, -114, 42, 7, 3), C.skyLt, { a: 0.75, bloom: false, edge: 0 }) + wsh(R_(-21, -98, 42, 7, 3), C.skyLt, { a: 0.75, bloom: false, edge: 0 }) + wsh(R_(-21, -82, 42, 7, 3), C.skyLt, { a: 0.75, bloom: false, edge: 0 }) +
          pw(E_(3, -127, 13, 5), C.cream);
      },
      neck: [3, -128],
      head: function () {
        return pw(E_(6, -161, 32, 32), C.skin) + pw(E_(-8, -158, 6, 7.5), C.skinDk, { pen: false }) +
          pw(P_([[-27, -156], [-30, -176], [-21, -193], [-5, -200], [0, -211], [7, -199], [21, -197], [33, -185], [37, -171], [27, -176], [16, -180], [5, -174], [-6, -168], [-13, -154], [-22, -146]]), C.hairGinger) +
          wsh(E_(10, -150, 5.5, 4), C.cheek, { a: 0.45, bloom: false, edge: 0 }) + wsh(E_(31, -151, 3.5, 3), C.cheek, { a: 0.4, bloom: false, edge: 0 }) +
          solid(E_(6, -152, 1, 1), C.brown, { a: 0.6 }) + solid(E_(12, -149, 1, 1), C.brown, { a: 0.6 }) + solid(E_(9, -146, 1, 1), C.brown, { a: 0.6 }) +
          pen(L_([[36, -158], [39, -153], [35, -151]]), { w: 1.5 });
      },
      eyes: [[15, -164, 3.1, 4.2], [28, -165, 2.6, 3.8]], mouth: [22, -145, 11], hc: [6, -161, 32],
      arm: { sh: [[7, -118], [-7, -118]], a1: 30, a2: 26, w: 12, col: C.blue, hand: C.skin, hr: 6.3 },
    },
    nana: {
      h: 262, w: 80, hipY: -72, lean: 3,
      legs: { len: 70, w: 10, col: "#D9C2B0", shoe: C.plum, gap: 10, kind: "foot", foot: 10, footH: 5.5 },
      lower: function () {
        return pw(P_([[-24, -84], [24, -84], [32, -50], [39, -9], [20, -5], [0, -8], [-20, -5], [-39, -9], [-32, -50]]), "#8E6E8C") +
          pen(L_([[-8, -70], [-14, -12]]), { w: 1.1, op: 0.45 }) + pen(L_([[12, -70], [18, -12]]), { w: 1.1, op: 0.45 });
      },
      upper: function () {
        return pw(R_(-20, -156, 40, 78, 12), "#EFE3CF") +
          pw(P_([[-27, -155], [27, -155], [34, -138], [28, -120], [15, -104], [1, -96], [-13, -103], [-27, -119], [-34, -138]]), C.sage) +
          pen(L_([[-14, -101], [-15, -94]]), { w: 1, op: 0.6 }) + pen(L_([[0, -92], [0, -85]]), { w: 1, op: 0.6 }) + pen(L_([[14, -98], [15, -91]]), { w: 1, op: 0.6 }) +
          pw(E_(4, -146, 3.5, 3.5), C.rust);
      },
      neck: [5, -154],
      head: function () {
        return pw(E_(-13, -217, 12.5, 12), C.silver) + pw(E_(8, -188, 30, 31), C.skin) + pw(E_(-6, -185, 5.5, 7), C.skinDk, { pen: false }) +
          pw(P_([[-21, -178], [-24, -198], [-12, -214], [8, -219], [26, -211], [36, -196], [33, -191], [22, -201], [8, -203], [-4, -197], [-12, -183], [-15, -168]]), C.silver) +
          wsh(E_(12, -174, 5, 3.6), C.cheek, { a: 0.4, bloom: false, edge: 0 }) + wsh(E_(32, -175, 3.2, 2.8), C.cheek, { a: 0.35, bloom: false, edge: 0 }) +
          pen(L_([[36, -183], [39, -178], [35, -176]]), { w: 1.5 }) + pen(L_([[3, -168], [8, -165]]), { w: 0.9, op: 0.4 });
      },
      over: function () { return pen(E_(17, -188, 7.5, 7), { w: 1.6, gap: 0 }) + pen(E_(31, -189, 5.8, 6.2), { w: 1.6, gap: 0 }) + pen(L_([[24, -189], [25.5, -189]]), { w: 1.4 }) + pen(L_([[9.5, -189], [-2, -192]]), { w: 1.3 }); },
      eyes: [[17, -188, 2.6, 3.3], [31, -189, 2.2, 3]], mouth: [24, -171, 10], hc: [8, -188, 31],
      arm: { sh: [[8, -144], [-8, -144]], a1: 34, a2: 30, w: 12, col: "#EFE3CF", hand: C.skin, hr: 6.2 },
    },
    rusty: {
      h: 232, w: 80, hipY: -60,
      legs: { len: 55, w: 13, col: C.fox, shoe: "#4A3328", gap: 7, kind: "foot", foot: 11, footH: 6 },
      tail: { pv: [-12, -64], mk: function () { var t = tubePts([[2, 0], [-10, 8], [-24, 12], [-38, 9], [-50, -2], [-56, -18], [-55, -34]], [6, 10, 13, 15, 14, 11, 6]), tip = tubePts([[-53, -16], [-56, -26], [-55, -36]], [9, 8, 4]); return pw(P_(t), C.fox) + pw(P_(tip), C.foxLt, { wob: 0.5 }); } },
      upper: function () {
        return pw(E_(0, -94, 26, 40), C.fox) + pw(E_(9, -94, 13, 30), C.foxLt, { pen: false }) +
          pw(P_([[-20, -123], [-4, -127], [7, -100], [15, -126], [23, -119], [26, -96], [24, -76], [16, -68], [8, -73], [-6, -68], [-22, -72], [-26, -96]]), C.moss) +
          solid(E_(16, -104, 2.2, 2.2), C.honey) + solid(E_(17, -88, 2.2, 2.2), C.honey);
      },
      neck: [4, -128],
      head: function () {
        return pw(P_([[-18, -174], [-12, -210], [3, -181]]), C.fox) + solid(P_([[-13, -180], [-11, -200], [-3, -183]]), "#5A3A2E", { a: 0.7 }) +
          pw(E_(0, -158, 27, 26), C.fox) + pw(P_([[8, -172], [46, -153], [48, -146], [14, -137]]), C.fox) +
          pw(P_([[0, -150], [42, -147], [30, -134], [8, -132], [-6, -141]]), C.foxLt) + solid(E_(47, -150, 4.2, 3.6), C.ink) +
          pw(P_([[4, -180], [16, -207], [20, -174]]), C.fox) + solid(P_([[8, -180], [15, -200], [17, -178]]), "#5A3A2E", { a: 0.7 });
      },
      eyes: [[15, -164, 2.8, 3.8], [27, -166, 2.3, 3.4]], mouth: [32, -139, 9], hc: [6, -160, 30],
      arm: { sh: [[8, -118], [-8, -118]], a1: 28, a2: 26, w: 11, col: C.fox, hand: "#4A3328", hr: 6 },
    },
    bramble: {
      h: 318, w: 130, hipY: -74,
      legs: { len: 70, w: 27, col: C.bear, shoe: shade(C.bear, 0.8), gap: 26, kind: "foot", foot: 19, footH: 9 },
      upper: function () {
        return pw(E_(0, -150, 60, 82), C.bear) + pw(E_(14, -138, 34, 52), C.bearLt, { pen: false }) +
          pw(R_(-40, -234, 86, 19, 9), RED) + pw(P_([[16, -224], [32, -224], [40, -182], [22, -180]]), RED) +
          pen(L_([[25, -181], [24, -175]]), { w: 1, op: 0.6 }) + pen(L_([[31, -181], [32, -175]]), { w: 1, op: 0.6 }) + pen(L_([[37, -182], [39, -176]]), { w: 1, op: 0.6 });
      },
      neck: [6, -228],
      head: function () {
        return pw(E_(-22, -306, 15, 15), C.bear) + pw(E_(-22, -306, 8, 8), C.bearLt, { pen: false }) + pw(E_(24, -310, 14, 14), C.bear) + pw(E_(24, -310, 7.5, 7.5), C.bearLt, { pen: false }) +
          pw(E_(8, -268, 46, 44), C.bear) + pw(E_(36, -256, 22, 16), C.bearLt) + solid(E_(52, -262, 7, 5.5), C.ink) +
          wsh(E_(18, -252, 6, 4), C.cheek, { a: 0.35, bloom: false, edge: 0 });
      },
      eyes: [[20, -277, 3.4, 4.3], [37, -279, 2.9, 3.9]], mouth: [40, -244, 12], hc: [8, -268, 46],
      arm: { sh: [[24, -204], [-22, -204]], a1: 46, a2: 42, w: 24, col: C.bear, hand: shade(C.bear, 0.82), hr: 13 },
    },
    pippin: {
      h: 152, w: 56, hipY: -34,
      legs: { len: 30, w: 11, col: C.bunny, shoe: C.bunnyLt, gap: 6, kind: "foot", foot: 13, footH: 6 },
      upper: function () {
        return pw(E_(0, -56, 22, 28), C.bunny) +
          pw(P_([[-20, -58], [20, -58], [22, -34], [17, -29], [-17, -29], [-22, -34]]), C.rose) + pw(R_(-10, -78, 21, 22, 3), C.rose) +
          pen(L_([[-9, -77], [-14, -86]]), { w: 1.4 }) + pen(L_([[9, -77], [12, -86]]), { w: 1.4 }) + solid(E_(-6, -72, 1.8, 1.8), C.cream) + solid(E_(6, -72, 1.8, 1.8), C.cream);
      },
      neck: [2, -84],
      earF: { pv: [-5, -122], mk: function () { return pw(E_(0, -24, 8, 26), C.bunny) + wsh(E_(0, -22, 3.6, 18), C.blush, { a: 0.8, bloom: false }); } },
      earN: { pv: [8, -124], mk: function () { return pw(E_(0, -24, 8.5, 27), C.bunny) + wsh(E_(0, -22, 3.8, 19), C.blush, { a: 0.85, bloom: false }); } },
      head: function () {
        return pw(E_(4, -104, 24, 24), C.bunny) + pw(E_(18, -95, 10, 8), C.bunnyLt, { pen: false }) + solid(E_(26, -100, 2.8, 2.3), C.rose) +
          pen(L_([[24, -96], [36, -99]]), { w: 0.9, op: 0.5 }) + pen(L_([[24, -94], [36, -92]]), { w: 0.9, op: 0.5 }) +
          wsh(E_(10, -94, 4, 3), C.cheek, { a: 0.4, bloom: false, edge: 0 });
      },
      eyes: [[14, -108, 2.8, 3.5], [24, -109, 2.3, 3.1]], mouth: [21, -90, 7], hc: [4, -104, 24],
      arm: { sh: [[5, -70], [-5, -70]], a1: 18, a2: 16, w: 9, col: C.bunny, hand: C.bunnyLt, hr: 5 },
    },
    sage: {
      h: 162, w: 92, hipY: -12, owl: true,
      legs: { len: 12, w: 6, col: C.ochre, shoe: C.ochre, gap: 16, kind: "owl" },
      upper: function () {
        return pw(E_(0, -64, 44, 52), C.owl) + pw(E_(9, -56, 26, 36), C.owlLt, { pen: false }) +
          pen(L_([[2, -74], [6, -70], [10, -74]]), { w: 1.1, op: 0.6 }) + pen(L_([[10, -60], [14, -56], [18, -60]]), { w: 1.1, op: 0.6 }) + pen(L_([[0, -50], [4, -46], [8, -50]]), { w: 1.1, op: 0.6 }) + pen(L_([[12, -40], [16, -36], [20, -40]]), { w: 1.1, op: 0.6 });
      },
      neck: [2, -106],
      head: function () {
        return pw(P_([[-26, -144], [-34, -164], [-14, -150]]), C.owl) + pw(P_([[22, -150], [34, -167], [36, -144]]), C.owl) +
          pw(E_(4, -126, 40, 32), C.owl) + pw(E_(-4, -127, 14.5, 14), C.owlLt) + pw(E_(24, -127, 13.5, 13), C.owlLt) +
          pw(P_([[8, -121], [17, -121], [12.5, -112]]), C.ochre, { wob: 0.3 });
      },
      eyes: [[-4, -128, 5.6, 6], [24, -128, 5.2, 5.6]], beak: [12.5, -114], hc: [4, -126, 38],
      arm: { sh: [[22, -94], [-24, -94]], a1: 34, a2: 24, w: 20, col: shade(C.owl, 0.92), wing: true },
    },
  };
  var CAST = Object.keys(CHARS);
  var CAST_SYN = { girl: "wren", hero: "wren", boy: "oli", friend: "oli", grandma: "nana", granny: "nana", grandmother: "nana", fox: "rusty", bear: "bramble", rabbit: "pippin", bunny: "pippin", owl: "sage", narrator: "nana" };
  function castKey(n, def) { n = str(n).toLowerCase(); return CHARS[n] ? n : CAST_SYN[n] || def || null; }
  // pose vector: n1 n2 (near arm), f1 f2 (far arm), ht (head tilt up), lean, sh (shoulders up), lx ly (eyes)
  var PZ = { n1: 10, n2: 14, f1: 8, f2: 12, ht: 0, lean: 0, sh: 0, lx: 0.3, ly: 0 };
  var POSES = {
    idle: {}, wave: { n1: 148, n2: -14, ht: 3 }, point: { n1: 86, n2: 4, ht: 2, lean: 3 }, present: { n1: 56, n2: 36, lean: 2 },
    open: { n1: 72, n2: 20, f1: -56, f2: 24, ht: 4 }, cheer: { n1: 164, n2: 14, f1: 158, f2: 16, ht: 8 }, think: { n1: 24, n2: 138, ht: 7, ly: -0.8, lx: 0.6 },
    shrug: { n1: 18, n2: 96, f1: -14, f2: 98, sh: 4, ht: -2 }, hold: { n1: 44, n2: 56, f1: 40, f2: 58, lean: 2 }, heart: { n1: 20, n2: 128, f1: 18, f2: 124, ht: -4 },
    nod: {}, wonder: { n1: 30, n2: 34, f1: -22, f2: 30, ht: 13, ly: -1, lean: -3 },
  };
  var GESTURES = Object.keys(POSES);
  var GEST_SYN = { waving: "wave", hello: "wave", bye: "wave", pointing: "point", show: "present", offer: "present", welcome: "open", arms: "open", celebrate: "cheer", yay: "cheer", thinking: "think", ponder: "think", dunno: "shrug", carry: "hold", love: "heart", yes: "nod", agree: "nod", look: "wonder", gaze: "wonder", amazed: "wonder" };
  function gestKey(n) { n = str(n).toLowerCase(); return POSES[n] ? n : GEST_SYN[n] || null; }
  function poseVec(n) { var p = POSES[gestKey(n) || "idle"], o = {}; for (var k in PZ) o[k] = p[k] != null ? p[k] : PZ[k]; return o; }
  function mixPose(a, b, p) { var o = {}; for (var k in PZ) o[k] = a[k] + (b[k] - a[k]) * p; return o; }
  var VIS = { A: { w: 1.0, o: 0.9, r: 0.2 }, E: { w: 1.15, o: 0.5, r: 0 }, I: { w: 1.05, o: 0.4, r: 0 }, O: { w: 0.7, o: 0.85, r: 1 }, U: { w: 0.55, o: 0.55, r: 1 } };
  function sylls(word, t0, t1, seed) {
    var w = normWord(word).replace(/[0-9]+/g, "ten"), groups = w.match(/[aeiouy]+/g) || ["a"];
    var n = clamp(groups.length, 1, Math.max(1, Math.floor((t1 - t0) / 0.09))), out = [];
    for (var i = 0; i < n; i++) {
      var g = groups[Math.min(groups.length - 1, i)], ch = g.charAt(0);
      var v = ch === "a" ? "A" : ch === "e" ? "E" : ch === "i" || ch === "y" ? "I" : ch === "o" ? "O" : "U";
      if (g === "ee" || g === "ea") v = "E";
      if (g === "oo" || g === "ou") v = "U";
      out.push({ t0: t0 + ((t1 - t0) * i) / n, t1: t0 + ((t1 - t0) * (i + 1)) / n, v: v, k: 0.7 + 0.3 * hash(seed + i * 3.1) });
    }
    return out;
  }
  function character(name, o) {
    o = obj(o);
    var st = ensure(), key = castKey(name, "wren"), d = CHARS[key];
    var height = Math.max(20, num(o.height, H * 0.5)), k = height / 300, face0 = num(o.face, 1) < 0 ? -1 : 1;
    var x0 = num(o.x, W / 2), y0 = num(o.y, H * 0.85), seed = hstr(key) + st.chars.length * 17;
    var keep = seedCounter;
    seedCounter = 5000 + hstr(key) * 3;
    var s = svg("svg", { class: "sb-char", width: f1(W), height: f1(H), viewBox: "0 0 " + W + " " + H, overflow: "visible" });
    (o.parent || st.L.cast).appendChild(s);
    var root = svg("g", {}, s);
    var shadowEl = svg("g", {}, root);
    shadowEl.innerHTML = wsh(E_(0, -2, d.w * 0.55, 7), "#6B5A48", { a: 0.22, bloom: false, edge: 0 });
    var bob = svg("g", {}, root);
    var tail = null;
    if (d.tail) { tail = svg("g", {}, bob); tail.innerHTML = d.tail.mk(); }
    var L = d.legs, legs = [];
    [-1, 1].forEach(function (side) {
      var g = svg("g", {}, bob);
      g.innerHTML = side < 0 ? '<g opacity="1">' + legMk({ len: L.len, w: L.w, col: shade(L.col, 0.9), shoe: shade(L.shoe, 0.9), shoeH: L.shoeH, foot: L.foot, footH: L.footH }, L.kind) + "</g>" : legMk(L, L.kind);
      legs.push({ g: g, x: (side * L.gap) / 2 });
    });
    if (d.lower) svg("g", {}, bob).innerHTML = d.lower();
    var upper = svg("g", {}, bob);
    var A = d.arm, arms = [];
    function mkArm(i) {
      var g = svg("g", {}, upper), up = svg("g", {}, g), fore = svg("g", {}, g);
      var a = i === 1 ? { a1: A.a1, a2: A.a2, w: A.w, col: shade(A.col, 0.88), hand: shade(A.hand || A.col, 0.9), hr: A.hr, wing: A.wing, cuff: A.cuff } : A;
      up.innerHTML = armMk(a, 0);
      fore.innerHTML = armMk(a, 1);
      g.removeChild(fore); up.appendChild(fore);
      arms[i] = { g: up, fore: fore, sh: A.sh[i] };
    }
    mkArm(1);
    var bodyG = svg("g", {}, upper);
    bodyG.innerHTML = d.upper();
    var head = svg("g", {}, upper), headIn = svg("g", { transform: "translate(" + -d.neck[0] + "," + -d.neck[1] + ")" }, head);
    var earF = null, earN = null;
    if (d.earF) { earF = svg("g", {}, headIn); earF.innerHTML = '<g transform="translate(' + d.earF.pv[0] + "," + d.earF.pv[1] + ')">' + d.earF.mk() + "</g>"; }
    svg("g", {}, headIn).innerHTML = d.head();
    var eyes = d.eyes.map(function (e) {
      var g = svg("g", {}, headIn), bl = svg("g", {}, g);
      bl.innerHTML = solid(E_(0, 0, e[2], e[3]), C.ink, { a: 0.92, wob: 0.15 }) + '<circle cx="' + f2(e[2] * 0.3) + '" cy="' + f2(-e[3] * 0.35) + '" r="' + f2(Math.max(0.8, e[2] * 0.3)) + '" fill="#FFF8EC" opacity="0.9"/>';
      return { g: g, bl: bl, x: e[0], y: e[1] };
    });
    var mouth = null, beak = null;
    if (d.beak) { beak = svg("g", {}, headIn); beak.innerHTML = pw(P_([[-4.5, 0], [4.5, 0], [0, 6]]), shade(C.ochre, 0.9), { wob: 0.2 }); }
    else mouth = svg("path", { fill: "none", stroke: PEN, "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round" }, headIn);
    if (d.earN) { earN = svg("g", {}, headIn); earN.innerHTML = '<g transform="translate(' + d.earN.pv[0] + "," + d.earN.pv[1] + ')">' + d.earN.mk() + "</g>"; }
    if (d.over) svg("g", {}, headIn).innerHTML = d.over();
    mkArm(0);
    seedCounter = keep;
    // ---- tracks ----
    var enterAt = null, enterHow = "fade", enterDur = 0.6, exitAt = null, exitHow = "fade", exitDur = 0.6;
    var walks = [], faces = [], poses = [], gests = [], looks = [], talks = [], follow = null;
    var api = { el: s, name: key, x0: x0, y: y0, height: height, k: k, __char: true };
    function walkSeg(t0, xa, xb, dur) { faceList = null; walks.push({ t0: t0, t1: t0 + dur, xa: xa, xb: xb }); walks.sort(function (a, b) { return a.t0 - b.t0; }); }
    function xAt(t) {
      var x = walks.length && walks[0].xa != null ? walks[0].xa : x0;
      if (walks.length && enterHow.indexOf("walk") !== 0) x = x0;
      for (var i = 0; i < walks.length; i++) { var w = walks[i]; if (t < w.t0) break; x = lerp(w.xa, w.xb, soft(prog(t, w.t0, w.t1 - w.t0))); }
      return x;
    }
    function walkPhase(t) {
      for (var i = 0; i < walks.length; i++) { var w = walks[i]; if (t >= w.t0 && t <= w.t1) { var dist = Math.abs(w.xb - w.xa) * soft(prog(t, w.t0, w.t1 - w.t0)); return { on: true, ph: dist / (k * 38), dir: w.xb > w.xa ? 1 : -1, edge: Math.min(prog(t, w.t0, 0.2), 1 - prog(t, w.t1 - 0.2, 0.2)) }; } }
      return { on: false };
    }
    var faceList = null;
    function faceAt(t) {
      if (follow) { var fp = follow(t); if (fp && fp.dir) return fp.dir; }
      if (!faceList) {
        faceList = faces.slice();
        walks.forEach(function (w) { if (w.xb !== w.xa) { faceList.push({ at: w.t0 - 0.05, dir: w.xb > w.xa ? 1 : -1, walk: true }); faceList.push({ at: w.t1, dir: null, walk: true }); } });
        faceList.sort(function (a, b) { return a.at - b.at; });
      }
      var base = face0, cur = face0, from = face0, at0 = -10;
      for (var i = 0; i < faceList.length; i++) {
        var e = faceList[i];
        if (t < e.at) break;
        if (!e.walk) base = e.dir;
        from = lerp(from, cur, soft(prog(e.at, at0, 0.28)));
        cur = e.dir == null ? base : e.dir; at0 = e.at;
      }
      return lerp(from, cur, soft(prog(t, at0, 0.28)));
    }
    function poseAt(t) {
      var base = poseVec("idle"), prev = base;
      for (var i = 0; i < poses.length; i++) { var q = poses[i]; if (t < q.at) break; prev = mixPose(prev, poseVec(q.kind), 1); base = mixPose(base, poseVec(q.kind), soft(prog(t, q.at, 0.5))); }
      var out = base, wave = 0, nod = 0;
      gests.forEach(function (g) {
        if (t < g.at || t > g.at + g.dur + 0.5) return;
        var w = soft(prog(t, g.at, 0.35)) * (1 - soft(prog(t, g.at + g.dur, 0.45)));
        if (g.kind === "nod") { nod += w * Math.pow(Math.sin(((t - g.at) / 0.55) * PI), 2) * 7; return; }
        out = mixPose(out, poseVec(g.kind), w);
        if (g.kind === "wave") wave += w * Math.sin((t - g.at) * 11) * 24;
      });
      out.n2 += wave;
      out.ht -= nod;
      return out;
    }
    function lookAt(t) {
      var lx = null, ly = null;
      looks.forEach(function (q) { if (t >= q.at) { var p = soft(prog(t, q.at, 0.3)); lx = lerp(lx == null ? 0.3 : lx, q.dx, p); ly = lerp(ly == null ? 0 : ly, q.dy, p); } });
      return [lx, ly];
    }
    function mouthAt(t) {
      for (var i = 0; i < talks.length; i++) {
        var w = talks[i];
        if (t < w.from - 0.05 || t > w.to + 0.25) continue;
        var amp = 0, v = "A";
        for (var j = 0; j < w.syl.length; j++) { var q = w.syl[j]; if (t >= q.t0 && t < q.t1) { amp = Math.pow(Math.sin((PI * (t - q.t0)) / (q.t1 - q.t0)), 0.8) * q.k; v = q.v; break; } }
        return { amp: amp * smooth((t - w.from + 0.05) / 0.2), v: v, on: true };
      }
      return { amp: 0, v: "A", on: false };
    }
    function blinkAt(t) {
      var tb = 0.6 + hash(seed) * 1.6, n = 0;
      while (tb < t + 0.2 && n < 400) { if (t >= tb && t < tb + 0.16) return Math.sin((PI * (t - tb)) / 0.16); tb += 2.3 + hash(seed + ++n * 1.37) * 2.7; }
      return 0;
    }
    function visAt(t) {
      var op = 1, dy = 0, pen = 0, washO = 1;
      if (enterAt != null) {
        if (t < enterAt && enterHow.indexOf("walk") !== 0) return null;
        var p = prog(t, enterAt, enterDur);
        if (enterHow === "fade") { op = outC(p); dy = (1 - outC(p)) * 14; }
        else if (enterHow === "paint") { pen = 1 - outC(prog(t, enterAt, enterDur * 0.6)); washO = outC(prog(t, enterAt + enterDur * 0.3, enterDur * 0.7)); }
      }
      if (exitAt != null && t >= exitAt) {
        if (exitHow === "fade") op *= 1 - prog(t, exitAt, exitDur);
        else if (t > exitAt + exitDur) return null;
      }
      return op <= 0.001 ? null : { op: op, dy: dy, pen: pen, wash: washO };
    }
    function update(t) {
      var v = visAt(t);
      show(s, !!v);
      if (!v) return;
      setS(s, "opacity", f2(v.op));
      setV(s, "--pen", f2(v.pen)); setV(s, "--wash", f2(v.wash));
      var x = xAt(t), yy = y0, fc = faceAt(t), wp = walkPhase(t), ps = poseAt(t), m = mouthAt(t), lk = lookAt(t);
      if (follow) { var fo = follow(t) || {}; x = num(fo.x, x); yy = num(fo.y, y0); wp = fo.moving ? { on: true, ph: num(fo.dist, 0) / (k * 38), edge: 1 } : { on: false }; }
      var breath = Math.sin(t * 1.9 + seed) * 0.008, sway = Math.sin(t * 1.3 + seed) * 2;
      var legA = 0, bobY = 0;
      if (wp.on) { var e = clamp(wp.edge * 3, 0, 1); legA = Math.sin(wp.ph * PI) * 24 * e; bobY = -Math.abs(Math.sin(wp.ph * PI)) * 3 * e; }
      var fs = Math.abs(fc) < 0.06 ? (fc < 0 ? -0.06 : 0.06) : fc;
      setA(root, "transform", "translate(" + f1(x) + "," + f1(yy + v.dy) + ") scale(" + f2(fs * k) + "," + f2(k) + ")");
      setA(bob, "transform", "translate(0," + f2(bobY - ps.sh * 0.3) + ")");
      setA(shadowEl, "transform", "translate(0," + f2(-bobY + ps.sh * 0.3) + ")");
      legs[0].g.setAttribute("transform", "translate(" + legs[0].x + "," + d.hipY + ") rotate(" + f1(legA) + ")");
      legs[1].g.setAttribute("transform", "translate(" + legs[1].x + "," + d.hipY + ") rotate(" + f1(-legA) + ")");
      if (tail) setA(tail, "transform", "translate(" + d.tail.pv[0] + "," + d.tail.pv[1] + ") rotate(" + f1(Math.sin(t * 1.6 + seed) * 6 + (wp.on ? Math.sin(wp.ph * PI) * 6 : 0)) + ")");
      var lean = (d.lean || 0) + ps.lean + (wp.on ? 3 : 0);
      setA(upper, "transform", "translate(0," + d.hipY + ") rotate(" + f2(lean) + ") scale(1," + f2(1 + breath) + ") translate(0," + f1(-d.hipY - ps.sh) + ")");
      var talkBob = m.on ? Math.sin(t * 7.3 + seed) * 1.6 * (0.4 + m.amp) : 0;
      setA(head, "transform", "translate(" + d.neck[0] + "," + f1(d.neck[1] + ps.sh * 0.6) + ") rotate(" + f2(-ps.ht + talkBob + sway * 0.4) + ")");
      [0, 1].forEach(function (i) {
        var a = arms[i], u1 = i === 0 ? ps.n1 : ps.f1, u2 = i === 0 ? ps.n2 : ps.f2;
        var sw2 = wp.on ? Math.sin(wp.ph * PI) * 18 * (i ? 1 : -1) : sway * (i ? -0.6 : 0.6);
        setA(a.g, "transform", "translate(" + a.sh[0] + "," + a.sh[1] + ") rotate(" + f1(-(u1 + sw2)) + ")");
        setA(a.fore, "transform", "translate(0," + A.a1 + ") rotate(" + f1(-u2) + ")");
      });
      var bl = blinkAt(t), lx = lk[0] == null ? ps.lx : lk[0], ly = lk[1] == null ? ps.ly : lk[1];
      eyes.forEach(function (e) {
        setA(e.g, "transform", "translate(" + f2(e.x + lx * 2) + "," + f2(e.y + ly * 1.8) + ")");
        setA(e.bl, "transform", "scale(1," + f2(Math.max(0.1, 1 - bl * 0.92)) + ")");
      });
      if (earF) setA(earF, "transform", "rotate(" + f1(Math.sin(t * 2.1 + seed) * 4 - 6) + " " + d.earF.pv[0] + " " + d.earF.pv[1] + ")");
      if (earN) setA(earN, "transform", "rotate(" + f1(Math.sin(t * 2.4 + seed + 1) * 5 + 4 + (m.on ? m.amp * 3 : 0)) + " " + d.earN.pv[0] + " " + d.earN.pv[1] + ")");
      if (beak) setA(beak, "transform", "translate(" + d.beak[0] + "," + d.beak[1] + ") rotate(" + f1(m.amp * 26) + " -4 0)");
      if (mouth) {
        var mw = d.mouth[2], mx = d.mouth[0], my = d.mouth[1], vis = VIS[m.v] || VIS.A, op = m.amp * vis.o;
        if (op < 0.1) { setA(mouth, "d", "M" + f1(mx - mw / 2) + " " + f1(my) + "Q" + f1(mx) + " " + f1(my + mw * 0.32) + " " + f1(mx + mw / 2) + " " + f1(my)); setA(mouth, "fill", "none"); }
        else {
          var hw = (mw / 2) * (vis.w - vis.r * 0.25) * (0.8 + op * 0.2), oh = mw * 0.75 * op;
          setA(mouth, "d", "M" + f1(mx - hw) + " " + f1(my) + "Q" + f1(mx) + " " + f1(my - oh * 0.2) + " " + f1(mx + hw) + " " + f1(my) + "Q" + f1(mx) + " " + f1(my + oh * 1.2) + " " + f1(mx - hw) + " " + f1(my) + "Z");
          setA(mouth, "fill", "#7A3A30");
        }
      }
    }
    onFrame(update);
    // ---- methods ----
    api.enter = function (at, how, dur) {
      enterAt = num(at, 0.3); enterHow = str(how) || "fade"; enterDur = num(dur, enterHow === "paint" ? 1.2 : enterHow.indexOf("walk") === 0 ? 1.4 : 0.6);
      if (enterHow === "walk-left" || enterHow === "walk-right") {
        var off = enterHow === "walk-left" ? -d.w * k - 20 : W + d.w * k + 20;
        walkSeg(enterAt, off, x0, enterDur);
      }
      return api;
    };
    api.exit = function (at, how, dur) {
      exitAt = num(at, D - 1); exitHow = str(how) || "fade"; exitDur = num(dur, exitHow === "fade" ? 0.6 : 1.4);
      if (exitHow === "walk-left" || exitHow === "walk-right") walkSeg(exitAt, xAt(exitAt), exitHow === "walk-left" ? -d.w * k - 20 : W + d.w * k + 20, exitDur);
      return api;
    };
    api.talk = function (from, to) {
      from = num(from, 0); to = num(to, D);
      var ws = (V.words || []).filter(function (w) { return w.start >= from - 0.01 && w.start < to; }), syl = [];
      ws.forEach(function (w, i) { syl = syl.concat(sylls(w.word, w.start, Math.min(w.end, w.start + 0.6), seed + i * 7)); });
      if (!ws.length) for (var tt = from; tt < to; tt += 0.32) syl = syl.concat(sylls("ba", tt, tt + 0.22, seed + tt));
      talks.push({ from: from, to: to, syl: syl });
      return api;
    };
    api.gesture = function (at, kind, dur) { var g = gestKey(kind); if (g && g !== "idle") gests.push({ at: num(at, 0.5), kind: g, dur: num(dur, g === "nod" ? 0.6 : 1.2) }); return api; };
    api.pose = function (at, kind) { var g = gestKey(kind); if (g) { poses.push({ at: num(at, 0), kind: g }); poses.sort(function (a, b) { return a.at - b.at; }); } return api; };
    api.look = function (at, dx, dy) { looks.push({ at: num(at, 0), dx: clamp(num(dx, 0), -1, 1), dy: clamp(num(dy, 0), -1, 1) }); looks.sort(function (a, b) { return a.at - b.at; }); return api; };
    api.walkTo = function (at, x, dur) { at = num(at, 0.5); var xa = xAt(at), xb = num(x, xa); walkSeg(at, xa, xb, num(dur, Math.max(0.5, Math.abs(xb - xa) / (k * 120)))); return api; };
    api.follow = function (fn) { if (typeof fn === "function") follow = fn; return api; };
    api.turn = function (at, dir) { faceList = null; faces.push({ at: num(at, 0), dir: num(dir, 1) < 0 ? -1 : 1 }); return api; };
    api.headTop = function (t) { return y0 - d.h * k; };
    api.headCenter = function (t) { var fc = faceAt(t == null ? V.time() : t) < 0 ? -1 : 1; return { x: xAt(t == null ? V.time() : t) + fc * d.hc[0] * k, y: y0 + d.hc[1] * k }; };
    api.headBox = function (t) { var c = api.headCenter(t), r = d.hc[2] * k; return { x: c.x - r * 1.1, y: c.y - r * 1.2, w: r * 2.2, h: r * 2.3 }; };
    api.mouthPoint = function (t) { var fc = faceAt(t == null ? V.time() : t) < 0 ? -1 : 1, m = d.mouth || d.beak; return { x: xAt(t == null ? V.time() : t) + fc * m[0] * k, y: y0 + m[1] * k }; };
    api.xAt = xAt;
    api.width = d.w * k;
    function posAt(t) { if (follow) { var fo = follow(t) || {}; return [num(fo.x, x0), num(fo.y, y0)]; } return [xAt(t), y0]; }
    api.box = function (t) { var q = posAt(t); return { x: q[0] - (d.w / 2) * k, y: q[1] - d.h * k, w: d.w * k, h: d.h * k }; };
    api.visible = function (t) { return !!visAt(t); };
    api.moving = function (t) { if (follow) { var fo = follow(t) || {}; return !!fo.moving; } var wp = walkPhase(t); return wp.on; };
    st.chars.push(api);
    addBox("character", key, 0, null, function (t) { if (!visAt(t)) return null; var b = api.box(t); b.moving = api.moving(t); return b; });
    return api;
  }

  // ------------------------- words on the page -------------------------
  function swipeCanvas(w, h, color, seed) {
    var c = mkCanvas(w, h, "sb-swipe"), ctx = c.getContext("2d");
    cbrush(ctx, [[h * 0.4, h * 0.62], [w * 0.5, h * 0.52], [w - h * 0.4, h * 0.58]], h * 0.62, color, 0.75, { seed: seed, passes: 2, blur: 1.2 });
    return c;
  }
  function inkColor(base, a) { return rgba(base, a); }
  // Book-set serif text that fits its box; words ink in as they are spoken.
  function pageText(text, o) {
    o = obj(o);
    var st = ensure(), x = num(o.x, W * 0.1), y = num(o.y, H * 0.1), w = Math.max(40, num(o.w, W * 0.8)), h = Math.max(20, num(o.h, H * 0.3));
    var italic = !!o.italic, lh = num(o.lh, 1.42), align = str(o.align) || "left", color = colorOf(o.color, C.ink), emColor = colorOf(o.emColor, C.rust);
    var tokens = parseRich(text);
    if (!tokens.length) tokens = [{ w: "", em: false }];
    var size = num(o.size, clamp(w / 12, u(26), u(62)));
    var drop = o.dropCap, cap = null, capLines = drop === "illuminated" ? 3 : 2, ind = null;
    if (drop && tokens[0].w && /\p{L}/u.test(tokens[0].w.charAt(0))) {
      cap = tokens[0].w.charAt(0);
      tokens[0] = { w: tokens[0].w.slice(1), em: tokens[0].em, capRest: true };
      if (!tokens[0].w) tokens.shift();
      var capSize = size * lh * (capLines - 0.15) * 0.95, capW = measure(cap, capSize, false) + size * (drop === "illuminated" ? 0.75 : 0.28);
      if (drop === "illuminated") capW = Math.max(capW, capSize * 0.95 + size * 0.45);
      ind = { lines: capLines, w: capW };
    }
    if (o.maxSize) size = Math.min(size, num(o.maxSize, size));
    var lay = layoutText(tokens, { size: size, maxW: w, maxH: h, lh: lh, italic: italic, indent: ind, minSize: num(o.minSize, size * 0.45), balanceMin: ind ? 0.78 : 0.45 });
    if (cap && lay.lines.length < capLines) { // too short for a drop cap: fall back to plain text
      tokens = parseRich(text); cap = null; ind = null;
      lay = layoutText(tokens, { size: size, maxW: w, maxH: h, lh: lh, italic: italic, minSize: size * 0.45 });
    }
    var el = div("sb-ptext" + (italic ? " sb-it" : ""), o.parent || st.L.text);
    place(el, x, y, w, h);
    el.style.fontSize = f1(lay.size) + "px";
    el.style.lineHeight = f2(lay.lh);
    var lineH = lay.size * lay.lh, blockH = lay.lines.length * lineH, valign = str(o.valign) || "center";
    var top = valign === "top" ? 0 : valign === "bottom" ? h - blockH : (h - blockH) / 2;
    var swipes = div("sb-swipes", el), words = [], sc = lay.scale, capWpx = ind ? ind.w * sc : 0;
    lay.lines.forEach(function (ln, li) {
      var line = div("sb-line", el), off = ind && li < ind.lines ? capWpx : 0, avail = w - off;
      line.style.top = f1(top + li * lineH) + "px";
      line.style.left = f1(off) + "px";
      line.style.width = f1(avail) + "px";
      var al = align;
      if (align === "justify") al = li < lay.lines.length - 1 && ln.w > avail * 0.82 ? "justify" : "left";
      line.style.textAlign = al;
      if (al === "justify") line.style.textAlignLast = "justify";
      ln.words.forEach(function (wd, wi) {
        if (wi) line.appendChild(doc.createTextNode(" "));
        var sp = doc.createElement("span");
        sp.className = "sb-w" + (wd.em ? " sb-em" : "");
        sp.textContent = wd.w;
        line.appendChild(sp);
        words.push({ el: sp, w: wd.w, em: wd.em, line: li, capRest: !!wd.capRest });
      });
    });
    var capEl = null, capArt = null;
    if (cap) {
      var cs = lay.size * lh * (capLines - 0.15) * 0.95;
      capEl = div("sb-cap", el, cap);
      capEl.style.fontSize = f1(cs) + "px";
      capEl.style.lineHeight = "1";
      if (drop === "illuminated") {
        var bs = cs * 0.98, bx = 0, by = top + lay.size * 0.12;
        var cv = mkCanvas(bs + 16, bs + 16, "sb-capbox"), cctx = cv.getContext("2d");
        cwash(cctx, ["r", 8, 8, bs, bs, bs * 0.06], C.honey, { alpha: 0.85, wob: 1.5, blur: 1, lift: 3, gran: 0.8, edge: 0.45 });
        cwash(cctx, ["r", 8 + bs * 0.1, 8 + bs * 0.1, bs * 0.8, bs * 0.8, bs * 0.04], C.butter, { alpha: 0.6, wob: 1.5, blur: 1, lift: 2, edge: 0.2 });
        cpencil(cctx, ["r", 8, 8, bs, bs, bs * 0.06], { op: 0.55, w: 1.6 });
        cctx.globalCompositeOperation = "source-atop"; grainFill(cctx, cv.width, cv.height, 0.5, 1);
        place(cv, bx - 8, by - 8);
        el.insertBefore(cv, el.firstChild);
        capArt = svg("svg", { class: "sb-capvine", width: f1(bs), height: f1(bs), viewBox: "0 0 100 100" });
        capArt.innerHTML = pen(L_([[8, 92], [10, 60], [6, 30], [14, 10], [36, 6]]), { w: 1.8, c: C.forest }) + wsh(E_(8, 48, 6, 3.5), C.sage, { a: 0.9 }) + wsh(E_(16, 20, 6, 3.5), C.sage, { a: 0.9 }) + wsh(E_(90, 88, 5, 5), C.rose, { a: 0.9 }) + pen(L_([[64, 94], [90, 92], [94, 70]]), { w: 1.6, c: C.forest }) + wsh(E_(86, 74, 5, 3), C.sage, { a: 0.85 });
        place(capArt, bx, by);
        el.insertBefore(capArt, cv.nextSibling);
        capEl.style.left = f1(bx + (bs - measure(cap, cs, false)) / 2) + "px";
        capEl.style.top = f1(by + bs * 0.06) + "px";
        capEl.classList.add("sb-cap-ill");
      } else {
        capEl.style.left = "0px";
        capEl.style.top = f1(top + lay.size * 0.05) + "px";
      }
    }
    // emphasis swipes (measured after layout)
    var elR = el.getBoundingClientRect();
    words.forEach(function (wd, i) {
      if (!wd.em) return;
      var r = wd.el.getBoundingClientRect();
      if (!r.width) return;
      var cv2 = swipeCanvas(r.width + lay.size * 0.5, lay.size * 0.7, C.butter, 900 + i);
      place(cv2, r.left - elR.left - lay.size * 0.25, r.top - elR.top + lay.size * 0.62);
      swipes.appendChild(cv2);
      wd.swipe = cv2;
    });
    var showAt = 0, showDur = 0.6, times = null, dim = 0.2, inkDur = 0.3;
    var api = { el: el, words: words, lay: lay, x: x, y: y, w: w, h: h, top: y + top, bottom: y + top + blockH };
    api.show = function (at, dur) { showAt = num(at, 0.3); showDur = num(dur, 0.6); return api; };
    api.speak = function (from, to, so) {
      so = obj(so);
      if (so.dim != null) dim = clamp(num(so.dim, 0.2), 0, 1);
      var toks = words.map(function (wd, i) { return wd.capRest && cap ? cap + wd.w : wd.w; });
      times = alignWords(toks, num(from, showAt), num(to, endLimit()));
      return api;
    };
    api.box = function () {
      var bw = Math.max(lay.w, capWpx), bx = x;
      if (align === "center") bx = x + (w - lay.w) / 2;
      return { x: bx, y: y + top, w: bw, h: blockH };
    };
    api.moveBy = function (dy) { dy = num(dy, 0); y += dy; el.style.top = f1(y) + "px"; api.y = y; api.top += dy; api.bottom += dy; return api; };
    api.moveX = function (dx) { dx = num(dx, 0); x += dx; el.style.left = f1(x) + "px"; api.x = x; return api; };
    api.show(o.at == null ? 0.3 : o.at);
    onFrame(function (t) {
      var p = prog(t, showAt, showDur);
      show(el, p > 0);
      if (p <= 0) return;
      setS(el, "opacity", f2(outC(p)));
      words.forEach(function (wd, i) {
        var k = times ? prog(t, times[i] - 0.06, inkDur) : 1, a = dim + (1 - dim) * outC(k);
        setS(wd.el, "color", inkColor(wd.em ? emColor : color, a));
        if (wd.swipe) { var q = times ? prog(t, times[i] - 0.02, 0.4) : 1; setS(wd.swipe, "clipPath", "inset(0 " + f1((1 - outC(q)) * 100) + "% 0 0)"); }
      });
      if (capEl) { var kc = times ? prog(t, times[0] - 0.1, 0.4) : 1; setS(capEl, "opacity", f2(0.25 + 0.75 * outC(kc))); }
    });
    addBox("text", plain(text).slice(0, 30), 0, null, function (t) { if (t < showAt) return null; var b = api.box(); return b; });
    return api;
  }
  // Small-caps line (headings, chapter lines, captions). Shrinks to fit w on one line.
  function label(text, o) {
    o = obj(o);
    var st = ensure(), x = num(o.x, W * 0.1), y = num(o.y, H * 0.1), w = Math.max(20, num(o.w, W * 0.5)), size = num(o.size, u(34));
    var el = div("sb-label", o.parent || st.L.text), spn = doc.createElement("span");
    spn.textContent = plain(text); el.appendChild(spn);
    var align = str(o.align) || "left";
    el.style.textAlign = align;
    el.style.color = colorOf(o.color, C.rust);
    if (o.italic) el.classList.add("sb-label-it");
    var fs = size;
    el.style.fontSize = f1(fs) + "px";
    place(el, x, y, w);
    for (var i = 0; i < 24 && spn.getBoundingClientRect().width > w + 1 && fs > 10; i++) { fs *= 0.93; el.style.fontSize = f1(fs) + "px"; }
    var hh = fs * 1.25, showAt = num(o.at, 0.3), dur = 0.6;
    var tw = Math.min(w, spn.getBoundingClientRect().width), lx = align === "center" ? x + (w - tw) / 2 : align === "right" ? x + w - tw : x;
    var api = { el: el, size: fs, h: hh, box: function () { return { x: lx, y: y, w: tw, h: hh }; } };
    api.show = function (at, d) { showAt = num(at, showAt); dur = num(d, dur); return api; };
    onFrame(function (t) { var p = prog(t, showAt, dur); show(el, p > 0); if (p > 0) { setS(el, "opacity", f2(outC(p))); setS(el, "transform", "translateY(" + f1((1 - outC(p)) * 8) + "px)"); } });
    addBox("label", plain(text), 0, null, function (t) { return t < showAt ? null : api.box(); });
    return api;
  }
  // Painted letters: watercolour texture clipped to serif type, brushed on from the left.
  function textureURL(w, h, cols, seed) {
    var c = mkCanvas(w, h), ctx = c.getContext("2d"), r = rng(seed);
    ctx.fillStyle = cols[0]; ctx.fillRect(0, 0, w, h);
    for (var i = 0; i < 14; i++) {
      var cx = r() * w, cy = r() * h, rr = Math.max(w, h) * (0.12 + r() * 0.2);
      cwash(ctx, ["e", cx, cy, rr, rr * (0.5 + r() * 0.5)], cols[i % cols.length], { alpha: 0.55, blur: 4, lift: 2, edge: 0.4, wob: rr * 0.1, layers: 2 });
    }
    grainFill(ctx, w, h, 0.6, 1);
    return c.toDataURL("image/png");
  }
  function paintedText(text, o) {
    o = obj(o);
    var st = ensure(), x = num(o.x, W * 0.1), y = num(o.y, H * 0.3), w = Math.max(40, num(o.w, W * 0.8)), h = Math.max(20, num(o.h, H * 0.25));
    var cols = arr(o.colors).length ? arr(o.colors).map(function (c) { return colorOf(c, C.rust); }) : [C.rust, C.terracotta, C.ochre, C.rose];
    var italic = o.italic !== false, all = !!o.all, tokens = parseRich(text);
    if (all) tokens = tokens.map(function (t) { return { w: t.w, em: true }; });
    var lay = layoutText(tokens, { size: num(o.size, u(120)), maxW: w, maxH: h, maxLines: num(o.maxLines, 3), lh: num(o.lh, 1.08), italic: false, minSize: u(28) });
    var el = div("sb-ptitle", o.parent || st.L.text);
    place(el, x, y, w, h);
    el.style.fontSize = f1(lay.size) + "px";
    el.style.lineHeight = f2(lay.lh);
    var url = textureURL(Math.ceil(Math.min(900, w)), Math.ceil(Math.min(400, lay.size * 1.6)), cols, num(o.seed, 300));
    var blockH = lay.lines.length * lay.size * lay.lh, top = (str(o.valign) === "top" ? 0 : str(o.valign) === "bottom" ? h - blockH : (h - blockH) / 2), align = str(o.align) || "center";
    var minL = 1e9, maxR = -1e9;
    lay.lines.forEach(function (ln, li) {
      var line = div("sb-line", el);
      line.style.top = f1(top + li * lay.size * lay.lh) + "px"; line.style.left = "0px"; line.style.width = f1(w) + "px"; line.style.textAlign = align;
      var lw = ln.w, lx = align === "center" ? (w - lw) / 2 : align === "right" ? w - lw : 0;
      minL = Math.min(minL, lx); maxR = Math.max(maxR, lx + lw);
      ln.words.forEach(function (wd, wi) {
        if (wi) line.appendChild(doc.createTextNode(" "));
        var sp = doc.createElement("span");
        sp.textContent = wd.w;
        if (wd.em) { sp.className = "sb-paint" + (italic ? " sb-paint-it" : ""); sp.style.backgroundImage = "url(" + url + ")"; }
        else sp.className = "sb-tw";
        line.appendChild(sp);
      });
    });
    var at = num(o.at, 0.4), dur = num(o.dur, 0.9);
    var api = { el: el, lay: lay, box: function () { return { x: x + minL, y: y + top, w: maxR - minL, h: blockH }; }, top: y + top, bottom: y + top + blockH };
    api.paintOn = function (a, d) { at = num(a, at); dur = num(d, dur); return api; };
    onFrame(function (t) {
      var p = prog(t, at, dur);
      show(el, p > 0);
      if (p <= 0) return;
      if (p >= 1) { setS(el, "maskImage", "none"); setS(el, "webkitMaskImage", "none"); return; }
      var e = outC(p) * 118 - 9, m = "linear-gradient(90deg, #000 " + f1(e - 8) + "%, rgba(0,0,0,0) " + f1(e + 8) + "%)";
      setS(el, "maskImage", m); setS(el, "webkitMaskImage", m);
    });
    addBox("title", plain(text).slice(0, 30), 0, null, function (t) { return t < at ? null : api.box(); });
    return api;
  }
  // Painted speech or thought cloud with ink-in words.
  function bubble(text, o) {
    o = obj(o);
    var st = ensure(), sf = SAFE(), kind = str(o.kind) === "thought" ? "thought" : "speech";
    var size = num(o.size, u(40)), maxW = Math.max(u(160), Math.min(num(o.maxW, W * 0.42), sf.x1 - sf.x0));
    var padX = size * (kind === "thought" ? 1.1 : 0.8), padY = size * (kind === "thought" ? 0.85 : 0.6);
    var lay = layoutText(parseRich(text), { size: size, maxW: maxW - padX * 2, maxLines: num(o.maxLines, 4), lh: 1.3, minSize: size * 0.6 });
    var bw = lay.w + padX * 2, bh = lay.h + padY * 2;
    var cx = num(o.cx, W / 2), bottom = num(o.bottom, H * 0.5);
    var bx = clamp(cx - bw / 2, sf.x0, sf.x1 - bw), by = Math.max(sf.y0, bottom - bh);
    var tail = obj(o.tail), tx = num(tail.x, bx + bw / 2), ty = num(tail.y, by + bh + u(60));
    var from = num(o.from, 0.3), to = num(o.to, D + 1);
    var s = svg("svg", { class: "sb-bubble", width: f1(W), height: f1(H), viewBox: "0 0 " + W + " " + H, overflow: "visible" });
    (o.parent || st.L.text).appendChild(s);
    var g = svg("g", {}, s), cxB = bx + bw / 2, cyB = by + bh / 2, mk = "";
    var keep = seedCounter; seedCounter = 7000 + hstr(text) % 900;
    if (kind === "speech") {
      var rr = Math.min(bh * 0.45, u(46)), base = clamp(tx, bx + rr + u(24), bx + bw - rr - u(24)), bw2 = Math.min(u(26), bw * 0.12);
      var dx = tx - base, dy = ty - (by + bh), dl = Math.hypot(dx, dy) || 1, len = Math.min(dl * 0.7, u(64));
      var tip = [base + (dx / dl) * len, by + bh + Math.max(u(18), (dy / dl) * len)];
      var body = shapePts(R_(bx, by, bw, bh, rr), 6).pts, pts = [], inserted = false;
      // insert the tail into the bottom edge (points run clockwise; the bottom edge goes right to left)
      for (var i = 0; i < body.length; i++) {
        var p = body[i];
        if (!inserted && p[1] > by + bh - 1 && p[0] < base + bw2 && p[0] > base - bw2) continue;
        if (!inserted && p[1] > by + bh - 1 && p[0] <= base - bw2) { pts.push([base + bw2, by + bh]); pts.push(tip); pts.push([base - bw2, by + bh]); inserted = true; }
        pts.push(p);
      }
      if (!inserted) pts = body;
      mk = wsh(P_(pts), C.cream, { a: 0.96, wob: u(1.4), edge: 0.35, ew: 2 }) + pen(P_(pts), { w: u(2.4), gap: 0.02 });
    } else {
      var cp = [], n = 64;
      for (var j = 0; j < n; j++) { var an = (j / n) * TAU, bump = 1 + 0.08 * Math.abs(Math.sin(an * 5)); cp.push([cxB + Math.cos(an) * (bw / 2) * 1.02 * bump, cyB + Math.sin(an) * (bh / 2) * 1.08 * bump]); }
      mk = wsh(P_(cp), C.cream, { a: 0.95, wob: u(1.2), edge: 0.35, ew: 2 }) + pen(P_(cp), { w: u(2.2), gap: 0.03 });
      var ddx = tx - cxB, ddy = ty - (by + bh), dd = Math.hypot(ddx, ddy) || 1;
      [0.3, 0.55, 0.78].forEach(function (f, q) {
        var px = cxB + ddx * f, py = by + bh * 1.02 + ddy * f, r0 = u(16 - q * 4.5);
        mk += wsh(E_(px, py, r0, r0 * 0.85), C.cream, { a: 0.95, wob: u(0.6), edge: 0.35 }) + pen(E_(px, py, r0, r0 * 0.85), { w: u(2), gap: 0.05 });
      });
    }
    seedCounter = keep;
    g.innerHTML = mk;
    var tEl = div("sb-btext", o.parent || st.L.text);
    place(tEl, bx + padX, by + padY, lay.w + 2, lay.h);
    tEl.style.fontSize = f1(lay.size) + "px"; tEl.style.lineHeight = "1.3";
    var words = [];
    lay.lines.forEach(function (ln, li) {
      var line = div("sb-line", tEl);
      line.style.top = f1(li * lay.size * 1.3) + "px"; line.style.width = f1(lay.w + 2) + "px"; line.style.textAlign = "center";
      ln.words.forEach(function (wd, wi) { if (wi) line.appendChild(doc.createTextNode(" ")); var sp = doc.createElement("span"); sp.className = "sb-w" + (wd.em ? " sb-em" : ""); sp.textContent = wd.w; line.appendChild(sp); words.push({ el: sp, w: wd.w, em: wd.em }); });
    });
    var times = alignWords(words.map(function (w) { return w.w; }), from + 0.05, Math.min(to, endLimit()));
    var ox = ((base != null ? base : cxB) - bx) / bw * 100;
    s.style.transformOrigin = f1(base != null ? base : cxB) + "px " + f1(by + bh) + "px";
    tEl.style.transformOrigin = f1((base != null ? base : cxB) - bx - padX) + "px " + f1(bh - padY) + "px";
    onFrame(function (t) {
      var p = prog(t, from, 0.4), q = to < D + 0.5 ? prog(t, to, 0.3) : 0, vis = p > 0 && q < 1;
      show(s, vis); show(tEl, vis);
      if (!vis) return;
      var op = outC(p) * (1 - q), sc = 0.9 + 0.1 * outC(p);
      setS(s, "opacity", f2(op)); setS(tEl, "opacity", f2(op));
      setS(s, "transform", "scale(" + f2(sc) + ")"); setS(tEl, "transform", "scale(" + f2(sc) + ")");
      words.forEach(function (wd, i) { var k = prog(t, times[i] - 0.06, 0.28); setS(wd.el, "color", rgba(wd.em ? C.rust : C.ink, 0.22 + 0.78 * outC(k))); });
    });
    var api = { el: s, text: tEl, x: bx, y: by, w: bw, h: bh, from: from, to: to, box: function () { return { x: bx, y: by, w: bw, h: bh }; } };
    addBox("bubble", plain(text).slice(0, 30), from, to, function (t) { var b = api.box(); b.moving = t < from + 0.4; return b; });
    return api;
  }
  // Fleuron divider or a corner vine flourish (pencil and wash).
  function ornament(kind, o) {
    o = obj(o);
    var st = ensure(), x = num(o.x, W / 2), y = num(o.y, H / 2), w = Math.max(20, num(o.w, u(220))), corner = str(kind) === "corner";
    var vw = corner ? 100 : 200, vh = corner ? 100 : 50, hgt = corner ? w : w * 0.25;
    var s = svg("svg", { class: "sb-orn sb-paintable", width: f1(w), height: f1(hgt), viewBox: "0 0 " + vw + " " + vh, overflow: "visible" });
    var keep = seedCounter; seedCounter = corner ? 8100 : 8200;
    var m = "";
    if (corner) {
      m += pen(L_([[6, 96], [5, 70], [8, 44], [6, 22], [12, 10], [26, 6], [48, 8], [72, 5], [96, 7]]), { w: 1.8, c: C.forest });
      m += pen(L_([[6, 70], [16, 64], [18, 56], [12, 54]]), { w: 1.4, c: C.forest }) + pen(L_([[60, 7], [64, 17], [72, 19], [74, 13]]), { w: 1.4, c: C.forest });
      [[6, 84, -0.6], [7, 52, 0.5], [9, 30, -0.4], [36, 7, 0.4], [58, 7, -0.5], [84, 6, 0.5]].forEach(function (lf, i) {
        var a = lf[2], c = Math.cos(a), sn = Math.sin(a), L = 8;
        m += wsh(P_([[lf[0], lf[1]], [lf[0] + c * L - sn * 3.5, lf[1] + sn * L + c * 3.5], [lf[0] + c * L * 1.8, lf[1] + sn * L * 1.8], [lf[0] + c * L + sn * 3.5, lf[1] + sn * L - c * 3.5]]), i % 2 ? C.sage : C.moss, { a: 0.9, wob: 0.4, ew: 0.8 });
      });
      m += wsh(E_(14, 14, 7, 7), C.rose, { a: 0.9 }) + wsh(E_(14, 14, 3, 3), C.honey, { a: 0.95, bloom: false }) + pen(E_(14, 14, 7, 7), { w: 1.2 });
      m += wsh(E_(22, 22, 2.6, 2.6), C.rust, { a: 0.9, bloom: false }) + wsh(E_(27, 19, 2.4, 2.4), C.rust, { a: 0.9, bloom: false });
    } else {
      m += pen(L_([[88, 25], [70, 18], [52, 24], [38, 32], [24, 28], [18, 20], [24, 14], [30, 19]]), { w: 1.8, c: PEN });
      m += pen(L_([[112, 25], [130, 18], [148, 24], [162, 32], [176, 28], [182, 20], [176, 14], [170, 19]]), { w: 1.8, c: PEN });
      m += wsh(P_([[100, 13], [110, 25], [100, 37], [90, 25]]), C.terracotta, { a: 0.9, wob: 0.5 }) + pen(P_([[100, 13], [110, 25], [100, 37], [90, 25]]), { w: 1.4 });
      [[62, 20, C.sage], [138, 20, C.sage], [46, 28, C.moss], [154, 28, C.moss]].forEach(function (lf) { m += wsh(E_(lf[0], lf[1], 6, 3), lf[2], { a: 0.9, wob: 0.3, ew: 0.8 }); });
      m += wsh(E_(100, 25, 3, 3), C.honey, { a: 0.95, bloom: false });
    }
    seedCounter = keep;
    var flip = o.flip === true ? "x" : str(o.flip);
    var fx = flip.indexOf("x") >= 0 ? -1 : 1, fy = flip.indexOf("y") >= 0 ? -1 : 1;
    s.innerHTML = '<g transform="translate(' + (fx < 0 ? vw : 0) + "," + (fy < 0 ? vh : 0) + ") scale(" + fx + "," + fy + ')">' + m + "</g>";
    (o.parent || st.L.front).appendChild(s);
    place(s, corner ? x : x - w / 2, corner ? y : y - hgt / 2);
    var api = { el: s, box: function () { return { x: corner ? x : x - w / 2, y: corner ? y : y - hgt / 2, w: w, h: hgt }; } };
    api.paintOn = function (at, dur) { paintOnEl(s, at, dur); return api; };
    return api;
  }
  // Compatibility: a padded flex column in the text layer.
  function stage(root) {
    var b = book(root);
    var col = div("v-stage sb-stage", b.text);
    var sf = SAFE();
    place(col, sf.x0, sf.y0, sf.x1 - sf.x0, sf.y1 - sf.y0);
    b.column = col;
    return b;
  }

  // ------------------------- template helpers -------------------------
  var TPL = {};
  function castOf(v, def) { var k = castKey(v); return k || def; }
  function castList(v, max, def) {
    var out = [];
    arr(v).forEach(function (n) { var k = castKey(n); if (k && out.indexOf(k) < 0 && out.length < max) out.push(k); });
    if (!out.length && def) out = def.slice(0, max);
    return out;
  }
  function tallest(list) { var m = 1; list.forEach(function (k) { m = Math.max(m, CHARS[k].h); }); return m; }
  // the adult height (px of 300 units) so every listed character fits between top and its feet
  function fitHeight(list, want, feetY, topY) { var hm = tallest(list); return Math.max(u(60), Math.min(want, ((feetY - topY) * 300) / hm)); }
  function talkAll(c) { var sp = speechSpan(); c.talk(sp.start, sp.end); return sp; }
  function firstTime(text, after) { var t = labelTime(text, "", after || 0); return t == null ? null : t; }
  function wordTime(word, def, after) { var t = word ? kwFind(word, after || 0) : null; return t == null ? def : t; }
  function groundForFeet(feetFrac, k) { k = k || 0.42; feetFrac -= 0.022; var gt = clamp((feetFrac - k) / (1 - k), 0.3, 0.86); return { groundTop: gt, horizon: Math.max(0.18, gt - 0.24) }; }
  function fmtNum(v, dec) { return V.format(v, dec, true); }

  // ------------------------- templates -------------------------
  TPL["story-page"] = function (root, p) {
    book(root);
    var sf = SAFE(), loc = locKey(p.location, "forest"), time = timeKey(p.time);
    var hero = castOf(p.character, "wren"), comp = castKey(p.companion);
    if (comp === hero || str(p.companion) === "none") comp = null;
    var text = str(p.text) || V.narration || "Once upon a time.", heading = str(p.heading);
    var sp = speechSpan(), headH = heading ? u(34) * 1.3 + u(58) : 0, pr, txt, hd = null, orn = null;
    if (!STACK) {
      var tx = W * 0.655, tw = sf.x1 - tx;
      txt = pageText(text, { x: tx, y: sf.y0 + headH, w: tw, h: sf.y1 - sf.y0 - headH, size: u(60), dropCap: true, valign: "top", align: "left" });
      var bh = txt.bottom - txt.top, dy = (sf.y1 - sf.y0 - headH - bh) / 2;
      txt.moveBy(dy);
      if (heading) { hd = label(heading, { x: tx, y: txt.top - headH, w: tw, size: u(34), align: "left" }); orn = ornament("fleuron", { x: tx + u(110), y: txt.top - u(34), w: u(200) }); }
      pr = { x: W * 0.02, y: H * 0.035, w: W * 0.615, h: H * 0.93 };
    } else {
      var tw2 = sf.x1 - sf.x0 - u(20), maxTH = (sf.y1 - sf.y0) * (SQ ? 0.4 : 0.42);
      txt = pageText(text, { x: sf.x0 + u(10), y: sf.y1 - maxTH, w: tw2, h: maxTH, size: u(SQ ? 46 : 60), dropCap: true, valign: "top" });
      var bh2 = txt.bottom - txt.top;
      txt.moveBy(sf.y1 - u(6) - txt.bottom);
      if (heading) { hd = label(heading, { x: sf.x0 + u(10), y: txt.top - headH, w: tw2, size: u(32), align: "center" }); orn = ornament("fleuron", { x: W / 2, y: txt.top - u(34), w: u(200) }); }
      var ptop = SQ ? H * 0.03 : H * 0.07, pbot = txt.top - headH - u(14);
      pr = { x: 0, y: ptop, w: W, h: Math.max(H * 0.25, pbot - ptop) };
    }
    var pt = painting({ location: loc, time: time, x: pr.x, y: pr.y, w: pr.w, h: pr.h, edge: "soft", bloom: 0.05 });
    var list = comp ? [hero, comp] : [hero];
    var fxH = comp ? 0.34 : STACK ? 0.5 : 0.46, fxC = 0.7;
    var feet = pt.ground(fxH), topY = Math.max(sf.y0 + u(8), pr.y + pr.h * 0.08);
    var adult = fitHeight(list, pr.h * 0.62, feet, topY);
    var a = character(hero, { x: pr.x + pr.w * fxH, y: feet, height: adult, face: 1 }).enter(0.3, "fade");
    talkAll(a);
    var gk = gestKey(p.gesture);
    if (gk && gk !== "idle") a.gesture(tc(wordTime(p.gestureWord, sp.start + (sp.end - sp.start) * 0.35) - 0.2), gk, 1.3);
    if (comp) {
      var c = character(comp, { x: pr.x + pr.w * fxC, y: pt.ground(fxC), height: adult, face: -1 }).enter(0.55, "fade");
      c.look(0.6, -0.6, 0).gesture(tc(sp.start + (sp.end - sp.start) * 0.5), "nod").gesture(tc(sp.end - 0.4), "nod");
    }
    var t0 = tc(Math.min(0.5, sp.start));
    if (hd) hd.show(0.35);
    if (orn) orn.paintOn(0.45, 0.9);
    txt.show(t0).speak(sp.start, sp.end);
  };

  TPL["title-page"] = function (root, p) {
    book(root);
    var sf = SAFE(), loc = locKey(p.location, "forest"), time = timeKey(p.time);
    var title = str(p.title) || contentWords(V.narration).slice(0, 4).join(" ") || "A Story", sub = str(p.subtitle), chap = str(p.chapter);
    var cast = castList(p.characters, 2, []);
    var sp = speechSpan();
    var tChap = chap ? tc(Math.min(wordTime(contentWords(chap)[0], 0.35), 0.6)) : 0.35;
    var tTitle = tc(Math.max(0.5, (firstTime(title, chap ? tChap : 0) || 0.6) - 0.15));
    var tSub = sub ? firstTime(sub, tTitle + 0.2) : null;
    var colX0, colW, vg;
    if (!STACK) {
      colX0 = sf.x0; colW = W * 0.45 - sf.x0;
      vg = { x: W * 0.48, y: H * 0.06, w: W * 0.49, h: H * 0.88 };
    } else {
      colX0 = sf.x0 + u(10); colW = sf.x1 - sf.x0 - u(20);
    }
    // measure the column: chapter, title, fleuron, subtitle
    var chH = chap ? u(36) * 1.35 : 0, tl = layoutText(parseRich(title), { size: u(STACK ? 100 : 128), maxW: colW, maxLines: 3, lh: 1.08, minSize: u(40) });
    var tH = tl.lines.length * tl.size * 1.08, ornH = u(64);
    var sl = sub ? layoutText(parseRich(sub), { size: u(STACK ? 46 : 46), maxW: colW, maxLines: 3, lh: 1.35, italic: true }) : null, sH = sl ? sl.h : 0;
    var colH = chH + tH + ornH + sH;
    var y0;
    if (!STACK) y0 = sf.y0 + (sf.y1 - sf.y0 - colH) / 2;
    else y0 = sf.y0 + u(10);
    var ch = chap ? label(chap, { x: colX0, y: y0, w: colW, size: u(36), align: "center", at: tChap }) : null;
    var tt = paintedText(title, { x: colX0, y: y0 + chH, w: colW, h: tH + 4, size: tl.size, lh: 1.08, maxLines: 3, at: tTitle, dur: 1.0 });
    var orn = ornament("fleuron", { x: colX0 + colW / 2, y: y0 + chH + tH + ornH * 0.5, w: u(230) }).paintOn(tTitle + 0.7, 0.9);
    var subT = null;
    if (STACK) {
      var subTop = sf.y1 - sH - u(8);
      if (sub) subT = pageText(sub, { x: colX0, y: subTop, w: colW, h: sH + 4, size: sl.size, italic: true, align: "center", valign: "top" });
      var vTop = y0 + chH + tH + ornH + u(4), vBot = (sub ? subTop : sf.y1) - u(14);
      vg = { x: W * 0.03, y: vTop, w: W * 0.94, h: Math.max(H * 0.2, vBot - vTop) };
    } else if (sub) subT = pageText(sub, { x: colX0, y: y0 + chH + tH + ornH, w: colW, h: sH + 4, size: sl.size, italic: true, align: "center", valign: "top" });
    if (subT) subT.show(tc((tSub || tTitle + 1) - 0.3)).speak(tSub || tTitle + 1, sp.end);
    var pt = painting({ location: loc, time: time, x: vg.x, y: vg.y, w: vg.w, h: vg.h, edge: "oval", bloom: 0.05 });
    if (cast.length) {
      var fxs = cast.length === 2 ? [0.38, 0.62] : [0.5], feet = pt.ground(0.5);
      var adult = fitHeight(cast, vg.h * 0.55, feet, vg.y + vg.h * 0.18);
      cast.forEach(function (k, i) {
        var c = character(k, { x: vg.x + vg.w * fxs[i], y: pt.ground(fxs[i]), height: adult, face: cast.length === 2 && i === 1 ? -1 : 1 }).enter(0.5 + i * 0.25, "fade");
        c.gesture(tc(tTitle + 0.3 + i * 0.3), "wave", 1.4);
        if (i === 1) c.look(0.6, -0.4, 0);
      });
    }
    // corner flourishes on the page
    var cs = u(STACK ? 120 : 130);
    ornament("corner", { x: sf.x0 - u(40), y: sf.y0 - u(40) + (STACK ? u(-120) : 0), w: cs }).paintOn(0.4, 1.0);
    ornament("corner", { x: sf.x1 + u(40) - cs, y: sf.y1 + u(40) - cs + (STACK ? u(160) : 0), w: cs, flip: "xy" }).paintOn(0.6, 1.0);
  };

  TPL["character-dialogue"] = function (root, p) {
    book(root);
    var sf = SAFE(), loc = locKey(p.location, "cottage"), time = timeKey(p.time);
    var L0 = castOf(p.left, "wren"), R0 = castOf(p.right, L0 === "nana" ? "wren" : "nana");
    var lines = arr(p.lines).filter(function (l) { return l && str(l.text); }).slice(0, 4);
    if (!lines.length) lines = [{ speaker: "left", text: V.narration || "Hello there." }];
    var feetF = PORT ? 1400 / 1920 : 0.9;
    var gopt = groundForFeet(feetF, loc === "cottage" ? 0.5 : 0.42);
    var pt = painting({ location: loc, time: time, x: 0, y: 0, w: W, h: H, edge: "soft", bloom: 0.05, horizon: gopt.horizon, groundTop: gopt.groundTop });
    var fl = PORT ? 0.27 : 0.27, fr = 1 - fl, feet = pt.ground(0.5);
    var room = PORT ? u(330) : SQ ? H * 0.3 : H * 0.3;
    var adult = fitHeight([L0, R0], PORT ? u(720) : H * 0.62, feet, sf.y0 + room);
    var cl = character(L0, { x: W * fl, y: pt.ground(fl), height: adult, face: 1 }).enter(0.3, "fade");
    var cr = character(R0, { x: W * fr, y: pt.ground(fr), height: adult, face: -1 }).enter(0.45, "fade");
    var wins = lineWindows(lines.map(function (l) { return l.text; }));
    lines.forEach(function (ln, i) {
      var who = str(ln.speaker) === "right" ? cr : cl, other = who === cl ? cr : cl, w = wins[i];
      var st0 = Math.max(0.3, w.start), en = Math.min(D, w.end);
      who.talk(st0, en);
      var q = /\?/.test(ln.text);
      who.gesture(tc(st0 + 0.1), q ? "open" : i === 0 ? "present" : "open", Math.max(0.8, Math.min(2, en - st0 - 0.5)));
      other.look(st0, who === cl ? -0.7 : -0.7, 0).gesture(tc((st0 + en) / 2), "nod");
      var next = wins[i + 1], from = Math.max(0.35, st0 - 0.3), to = next ? Math.max(from + 0.6, next.start - 0.25) : D + 1;
      var hb = who.headBox(st0), mp = who.mouthPoint(st0);
      var cx = PORT ? W / 2 + (who === cl ? -1 : 1) * W * 0.08 : who === cl ? W * 0.36 : W * 0.64;
      var maxW = PORT ? sf.x1 - sf.x0 - u(40) : SQ ? W * 0.62 : W * 0.44;
      bubble(ln.text, { cx: cx, bottom: hb.y - u(28), maxW: maxW, tail: { x: hb.x + hb.w / 2 + (who === cl ? 1 : -1) * hb.w * 0.2, y: hb.y + u(6) }, from: from, to: to, size: u(PORT ? 42 : 40) });
    });
  };

  // a painted island map (canvas) in the region
  function paintMap(x, y, w, h, seed) {
    var st = ensure(), c = mkCanvas(w, h, "sb-map"), ctx = c.getContext("2d"), r = rng(seed), s = Math.min(w, h) / 1000;
    cwash(ctx, ["r", w * 0.02, h * 0.02, w * 0.96, h * 0.96, 30 * s], C.skyLt, { alpha: 0.75, blur: 3, lift: 6, gran: 0.3, wob: 8 * s, edge: 0.25 });
    for (var i = 0; i < 26; i++) { var wx = r() * w, wy = r() * h; cpencil(ctx, ["l", [[wx, wy], [wx + 10 * s, wy - 4 * s], [wx + 20 * s, wy], [wx + 30 * s, wy - 4 * s]]], { op: 0.25, w: 1.2, c: C.blue }); }
    var isl = [], n = 48;
    for (i = 0; i < n; i++) { var a = (i / n) * TAU, k = 0.84 + 0.1 * Math.sin(a * 3 + r() * 0.6) + 0.06 * Math.sin(a * 7 + 1) ; isl.push([w / 2 + Math.cos(a) * w * 0.43 * k, h / 2 + Math.sin(a) * h * 0.4 * k]); }
    cwash(ctx, ["p", isl], C.sand, { alpha: 0.95, blur: 2, lift: 3, gran: 0.8, wob: 6 * s, edge: 0.45 });
    cwash(ctx, ["p", scalePts(isl, 0.9, [w / 2, h / 2])], C.spring, { alpha: 0.85, blur: 2, lift: 6, gran: 0.4, wob: 8 * s });
    cwash(ctx, ["p", scalePts(isl, 0.62, [w * 0.52, h * 0.48])], C.leaf, { alpha: 0.45, blur: 4, lift: 4, wob: 10 * s, edge: 0 });
    for (i = 0; i < 9; i++) { // little hills and trees on the island
      var a2 = r() * TAU, rr2 = 0.15 + r() * 0.55, dx2 = w / 2 + Math.cos(a2) * w * 0.33 * rr2, dy2 = h / 2 + Math.sin(a2) * h * 0.3 * rr2, hs = (16 + r() * 14) * s;
      if (i % 2) { cwash(ctx, ["p", [[dx2 - hs, dy2], [dx2, dy2 - hs * 1.6], [dx2 + hs, dy2]]], C.forest, { alpha: 0.35, blur: 0.8, edge: 0.3, lift: 0, wob: 1 }); }
      else cpencil(ctx, ["l", [[dx2 - hs * 1.6, dy2], [dx2 - hs * 0.5, dy2 - hs * 0.8], [dx2 + hs * 0.6, dy2 - hs * 0.6], [dx2 + hs * 1.6, dy2]]], { op: 0.3, w: 1.3, c: C.forest });
    }
    cpencil(ctx, ["p", isl], { op: 0.5, w: 1.6 });
    cpencil(ctx, ["p", scalePts(isl, 1.04, [w / 2, h / 2])], { op: 0.25, w: 1.1, c: C.blue });
    ctx.globalCompositeOperation = "source-atop"; grainFill(ctx, w, h, 0.45, 1.2); ctx.globalCompositeOperation = "source-over";
    place(c, x, y);
    st.L.back.appendChild(c);
    var bm = bloomMask(c, w, h, seed + 3);
    onFrame(function (t) { bm(prog(t, 0.05, 1.2)); });
    return c;
  }
  function compassRose(x, y, size) {
    var st = ensure(), s = svg("svg", { class: "sb-orn sb-paintable", width: f1(size), height: f1(size), viewBox: "-50 -50 100 100", overflow: "visible" });
    var keep = seedCounter; seedCounter = 8400;
    var m = pen(E_(0, 0, 30, 30), { w: 1.4 }) + pen(E_(0, 0, 24, 24), { w: 1, op: 0.5 });
    m += wsh(P_([[0, -44], [7, -7], [0, 0], [-7, -7]]), C.rust, { a: 0.9 }) + wsh(P_([[0, 44], [7, 7], [0, 0], [-7, 7]]), C.slate, { a: 0.85 });
    m += wsh(P_([[44, 0], [7, 7], [0, 0], [7, -7]]), C.ochre, { a: 0.85 }) + wsh(P_([[-44, 0], [-7, 7], [0, 0], [-7, -7]]), C.ochre, { a: 0.85 });
    m += pen(P_([[0, -44], [7, -7], [44, 0], [7, 7], [0, 44], [-7, 7], [-44, 0], [-7, -7]]), { w: 1.4, gap: 0 });
    m += '<text x="0" y="-50" text-anchor="middle" font-family=\'' + SERIF + '\' font-size="16" fill="' + PEN + '">N</text>';
    seedCounter = keep;
    s.innerHTML = m;
    st.L.front.appendChild(s);
    place(s, x - size / 2, y - size / 2);
    return { el: s, paintOn: function (at, dur) { paintOnEl(s, at, dur); return this; } };
  }
  function cartouche(text, cx, cy, maxW, at) {
    var st = ensure(), size = u(STACK ? 44 : 48);
    var lay = layoutText(parseRich(text), { size: size, maxW: maxW - u(120), maxLines: 1, minSize: u(26) });
    var bw = lay.w + u(130), bh = lay.size * 1.9;
    var s = svg("svg", { class: "sb-orn", width: f1(bw + u(60)), height: f1(bh + u(20)), viewBox: "0 0 " + f1(bw + u(60)) + " " + f1(bh + u(20)), overflow: "visible" });
    var ox = u(30), oy = u(10), keep = seedCounter; seedCounter = 8500;
    var m = wsh(P_([[ox - u(26), oy + bh * 0.3], [ox + u(14), oy + bh * 0.3], [ox + u(14), oy + bh * 1.05], [ox - u(26), oy + bh * 1.05], [ox - u(8), oy + bh * 0.68]]), C.terracotta, { a: 0.9, wob: u(1) }) +
      wsh(P_([[ox + bw + u(26), oy + bh * 0.3], [ox + bw - u(14), oy + bh * 0.3], [ox + bw - u(14), oy + bh * 1.05], [ox + bw + u(26), oy + bh * 1.05], [ox + bw + u(8), oy + bh * 0.68]]), C.terracotta, { a: 0.9, wob: u(1) }) +
      wsh(R_(ox, oy, bw, bh * 0.92, u(8)), C.cream, { a: 0.96, wob: u(1.2) }) + pen(R_(ox, oy, bw, bh * 0.92, u(8)), { w: u(2) }) + pen(R_(ox + u(8), oy + u(8), bw - u(16), bh * 0.92 - u(16), u(6)), { w: u(1.2), op: 0.5, gap: 0 });
    seedCounter = keep;
    s.innerHTML = m;
    st.L.front.appendChild(s);
    var sx = cx - bw / 2 - ox, sy = cy - bh / 2 - oy;
    place(s, sx, sy);
    var tEl = paintedText(text, { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh * 0.92, size: lay.size, all: true, italic: false, colors: [C.rust, C.terracotta, C.plum], at: at + 0.2, dur: 0.8 });
    onFrame(function (t) { var q = prog(t, at, 0.5); show(s, q > 0); setS(s, "opacity", f2(outC(q))); });
    return { box: function () { return { x: cx - bw / 2 - u(26), y: cy - bh / 2, w: bw + u(52), h: bh }; } };
  }
  // positions for a route of n stops in a region (serpentine)
  function routePoints(n, R, tall) {
    var pts = [];
    for (var i = 0; i < n; i++) {
      var f = n === 1 ? 0.5 : i / (n - 1);
      if (!tall) pts.push([R.x + R.w * f, R.y + R.h * (i % 2 ? 0.78 : 0.3) + (n === 2 ? R.h * 0.2 * (i ? -1 : 1) : 0)]);
      else pts.push([R.x + R.w * (i % 2 ? 0.72 : 0.28), R.y + R.h * f]);
    }
    return pts;
  }
  function smoothPathSamples(pts) { // dense samples of a Catmull-Rom curve with cumulative lengths
    var d = pathD(pts, false), pth = svg("path", { d: d });
    var tmp = svg("svg", { width: "1", height: "1" }); tmp.appendChild(pth); doc.body.appendChild(tmp);
    var L = pth.getTotalLength(), N = 240, smp = [];
    for (var i = 0; i <= N; i++) { var q = pth.getPointAtLength((L * i) / N); smp.push([q.x, q.y]); }
    var fr = pts.map(function (p) { var best = 0, bd = 1e18; smp.forEach(function (q, i) { var dd = (q[0] - p[0]) * (q[0] - p[0]) + (q[1] - p[1]) * (q[1] - p[1]); if (dd < bd) { bd = dd; best = i; } }); return best / N; });
    doc.body.removeChild(tmp);
    return { d: d, L: L, smp: smp, fr: fr, at: function (f) { f = clamp(f, 0, 1) * N; var i = Math.floor(f), j = Math.min(N, i + 1), k = f - i; return [lerp(smp[i][0], smp[j][0], k), lerp(smp[i][1], smp[j][1], k)]; } };
  }
  // a dotted trail that grows along samples; progress(t) in 0..1
  function dottedTrail(path, progress, color, width) {
    var st = ensure(), id = "sbtr" + ++uidN;
    var s = svg("svg", { class: "sb-trail", width: f1(W), height: f1(H), viewBox: "0 0 " + W + " " + H, overflow: "visible" });
    s.innerHTML = '<defs><mask id="' + id + '" maskUnits="userSpaceOnUse" x="0" y="0" width="' + W + '" height="' + H + '"><path d="' + path.d + '" fill="none" stroke="#fff" stroke-width="' + f1(width * 5) + '" stroke-linecap="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1"/></mask></defs>' +
      '<path d="' + path.d + '" fill="none" stroke="' + color + '" stroke-width="' + f1(width) + '" stroke-linecap="round" stroke-dasharray="' + f1(width * 0.2) + " " + f1(width * 2.6) + '" stroke-opacity="0.85" mask="url(#' + id + ')"/>';
    st.L.mid.appendChild(s);
    var mp = s.querySelector("mask path");
    onFrame(function (t) { setA(mp, "stroke-dashoffset", f2(1 - clamp(progress(t), 0, 1))); });
    return s;
  }
  function stopProgress(path, times, lead) { // piecewise: arrive at stop i at times[i]
    return function (t) {
      var fr = path.fr;
      if (t <= times[0]) return fr[0];
      for (var i = 0; i < times.length - 1; i++) {
        var a = times[i] + 0.25, b = Math.max(a + 0.3, times[i + 1] - (lead || 0.1));
        if (t < a) return fr[i];
        if (t < b) return lerp(fr[i], fr[i + 1], soft((t - a) / (b - a)));
      }
      return fr[fr.length - 1];
    };
  }
  function walker(name, path, times, height) {
    var prg = stopProgress(path, times, 0.15), c = character(name, { x: path.smp[0][0], y: path.smp[0][1], height: height, face: 1 });
    c.follow(function (t) {
      var f = prg(t), p = path.at(f), p2 = path.at(prg(t + 0.05)), moving = Math.hypot(p2[0] - p[0], p2[1] - p[1]) > 0.3;
      return { x: p[0], y: p[1], moving: moving, dir: p2[0] >= p[0] ? 1 : -1, dist: f * path.L };
    });
    return c;
  }

  TPL["map-of-the-land"] = function (root, p) {
    book(root);
    var sf = SAFE(), places = arr(p.places).filter(function (q) { return q && (str(q.name) || str(q.landmark)); }).slice(0, 6);
    if (!places.length) places = [{ name: "Home", landmark: "house", keyword: "" }, { name: "Far away", landmark: "castle", keyword: "" }];
    var who = castKey(p.character), title = str(p.title);
    var M = !STACK ? { x: W * 0.04, y: H * 0.04, w: W * 0.92, h: H * 0.92 } : { x: W * 0.02, y: sf.y0 - u(70), w: W * 0.96, h: sf.y1 - sf.y0 + u(140) };
    paintMap(M.x, M.y, M.w, M.h, 41);
    var tCart = 0.3;
    var cartB = title ? cartouche(title, W / 2, sf.y0 + u(STACK ? 50 : 46), (sf.x1 - sf.x0) * 0.7, tCart) : null;
    var n = places.length, lsz = u(STACK ? (n > 4 ? 120 : 150) : n > 4 ? 120 : 140);
    var R = !STACK ? { x: M.x + M.w * 0.2, y: M.y + M.h * 0.3, w: M.w * 0.6, h: M.h * 0.5 } : { x: M.x + M.w * 0.2, y: M.y + M.h * 0.27, w: M.w * 0.6, h: M.h * 0.56 };
    var pos = routePoints(n, R, STACK);
    var times = itemTimes(places.map(function (q) { return { label: q.name, keyword: q.keyword }; }), { after: 0.2, gap: 0.5, tail: 0.6 });
    var anchors = pos.map(function (q) { return [q[0], q[1] + lsz * 0.42]; });
    var path = smoothPathSamples(anchors);
    var sp = speechSpan();
    dottedTrail(path, stopProgress(path, times, 0.1), C.rust, u(5));
    places.forEach(function (q, i) {
      var ob = object(q.landmark || q.name, { x: pos[i][0], y: pos[i][1], size: lsz }).paintOn(tc(times[i] - 0.25), 1.0);
      addBox("object", q.landmark, 0, null, function (t) { return t < times[i] - 0.25 ? null : ob.box(); });
      var lw = Math.min(u(340), R.w / Math.max(2, STACK ? 1.6 : n) * 1.3);
      label(q.name, { x: clamp(pos[i][0] - lw / 2, sf.x0, sf.x1 - lw), y: pos[i][1] - lsz * 0.44 - u(44), w: lw, size: u(STACK ? 36 : 34), align: "center", color: C.ink, at: tc(times[i] - 0.1) });
    });
    compassRose(STACK ? sf.x0 + u(80) : sf.x1 - u(90), STACK ? sf.y1 - u(60) : sf.y1 - u(90), u(STACK ? 120 : 140)).paintOn(0.5, 1.2);
    if (who) {
      var c = walker(who, path, times, u(STACK ? 230 : 210)).enter(0.35, "fade");
      if (sp.end - sp.start > 1) c.gesture(tc(times[times.length - 1] + 0.3), "cheer", 1.2);
    }
  };

  TPL["list-of-things"] = function (root, p) {
    book(root);
    var sf = SAFE(), items = arr(p.items).filter(function (q) { return q && (str(q.label) || str(q.object)); }).slice(0, 6);
    if (!items.length) items = [{ label: contentWords(V.narration)[0] || "Something", object: "star", note: "", keyword: "" }];
    var who = castKey(p.character), title = str(p.title), n = items.length, sp = speechSpan();
    var times = itemTimes(items.map(function (q) { return { label: q.label, keyword: q.keyword }; }), { after: title ? 0.6 : 0.3, gap: 0.45, tail: 0.6 });
    var top = sf.y0, gx0 = sf.x0, gx1 = sf.x1, gy1 = sf.y1;
    if (title) {
      var tl = layoutText(parseRich(title), { size: u(STACK ? 68 : 72), maxW: (sf.x1 - sf.x0) * 0.9, maxLines: 2, lh: 1.1 });
      var th = tl.lines.length * tl.size * 1.1;
      paintedText(title, { x: sf.x0, y: sf.y0 + u(6), w: sf.x1 - sf.x0, h: th, size: tl.size, lh: 1.1, maxLines: 2, at: 0.3, dur: 0.9 });
      ornament("fleuron", { x: W / 2, y: sf.y0 + th + u(34), w: u(200) }).paintOn(0.8, 0.9);
      top = sf.y0 + th + u(70);
    }
    var cBox = null, rowsMode = !!(who && STACK);
    if (rowsMode) {
      var colX = sf.x0 + (sf.x1 - sf.x0) * 0.36, colW = sf.x1 - colX, rowH = Math.min((sf.y1 - top) / n, u(300)), y0r = top + (sf.y1 - top - rowH * n) / 2;
      var anyN = items.some(function (q) { return str(q.note); }), oS = Math.min(rowH * 0.72, u(180)), wc = [C.butter, C.blush, C.skyLt, C.spring, C.lilac, C.sand];
      items.forEach(function (q, i) {
        var t = times[i], cy = y0r + rowH * i + rowH / 2, ox = colX + oS * 0.6;
        wash({ x: ox - oS * 0.7, y: cy - oS * 0.58, w: oS * 1.4, h: oS * 1.16, color: wc[i % wc.length], alpha: 0.6 }).bloom(tc(t - 0.35), 0.8);
        var ob = object(q.object || q.label, { x: ox, y: cy, size: oS }).paintOn(tc(t - 0.2), 1.0);
        addBox("object", q.object, 0, null, function (tt) { return tt < t - 0.2 ? null : ob.box(); });
        var lx = colX + oS * 1.3, lw2 = sf.x1 - lx, hasN = str(q.note), lh2 = u(hasN ? 104 : 120);
        var lt = pageText(q.label || q.object, { x: lx, y: cy - (hasN ? u(66) : lh2 / 2), w: lw2, h: lh2, size: u(44), align: "left", valign: hasN ? "bottom" : "center", minSize: u(24) });
        lt.show(tc(t - 0.1), 0.5);
        if (hasN) {
          var nt = pageText(q.note, { x: lx, y: cy + u(42), w: lw2, h: u(56), size: u(32), italic: true, align: "left", valign: "top", color: C.brown, minSize: u(20) });
          nt.show(tc(t + 0.25), 0.5);
          var nw0 = labelTime(q.note, "", t);
          if (nw0 != null) nt.speak(nw0 - 0.2, nw0 + 1.5);
        }
      });
      var feetR = sf.y1 - u(6), xR = sf.x0 + (sf.x1 - sf.x0) * 0.16, hR = fitHeight([who], u(640), feetR, top + u(40));
      wash({ x: xR - u(130), y: feetR - u(34), w: u(260), h: u(56), color: C.spring, alpha: 0.6 }).bloom(0.3, 0.8);
      var cR = character(who, { x: xR, y: feetR, height: hR, face: 1 }).enter(0.35, "fade");
      talkAll(cR);
      times.forEach(function (t, i) { if (i < 4) cR.gesture(tc(t - 0.25), i % 2 ? "open" : "present", 0.9); });
      return;
    }
    if (who) {
      if (!STACK) { cBox = { x: sf.x0, w: (sf.x1 - sf.x0) * 0.22 }; gx0 = sf.x0 + (sf.x1 - sf.x0) * 0.25; }
      else { cBox = { h: (sf.y1 - top) * 0.36 }; gy1 = sf.y1 - cBox.h; }
    }
    var cols = n === 1 ? 1 : STACK ? 2 : n === 4 ? 2 : Math.min(3, n), rows = Math.ceil(n / cols);
    var cw = (gx1 - gx0) / cols, chh = (gy1 - top) / rows;
    var anyNote = items.some(function (q) { return str(q.note); });
    var objS = Math.min(cw * 0.55, (chh - u(anyNote ? 150 : 100)) * 0.75, u(n <= 3 ? 270 : 220)), washC = [C.butter, C.blush, C.skyLt, C.spring, C.lilac, C.sand];
    items.forEach(function (q, i) {
      var r = Math.floor(i / cols), cIn = i % cols, inRow = Math.min(cols, n - r * cols);
      var cx = gx0 + (gx1 - gx0) / 2 + (cIn - (inRow - 1) / 2) * cw, cy = top + r * chh;
      var contentH = objS * 1.24 + u(56) + (anyNote ? u(46) : 0), oy = cy + Math.max(0, (chh - contentH) / 2) + objS * 0.62;
      var t = times[i];
      wash({ x: cx - objS * 0.75, y: oy - objS * 0.62, w: objS * 1.5, h: objS * 1.24, color: washC[i % washC.length], alpha: 0.6 }).bloom(tc(t - 0.35), 0.8);
      var ob = object(q.object || q.label, { x: cx, y: oy, size: objS }).paintOn(tc(t - 0.2), 1.0);
      var lw = cw * 0.92, ly = oy + objS * 0.62;
      var lt = pageText(q.label || q.object, { x: cx - lw / 2, y: ly, w: lw, h: u(STACK ? 96 : 100), size: u(STACK ? 40 : 40), align: "center", valign: "top", minSize: u(24) });
      lt.show(tc(t - 0.1), 0.5);
      if (str(q.note)) {
        var nt = pageText(q.note, { x: cx - lw / 2, y: lt.bottom + u(2), w: lw, h: u(70), size: u(30), italic: true, align: "center", valign: "top", color: C.brown, minSize: u(20) });
        nt.show(tc(t + 0.25), 0.5);
        var nw = labelTime(q.note, "", t);
        if (nw != null) nt.speak(nw - 0.2, nw + 1.5);
      }
      addBox("object", q.object, 0, null, function (tt) { return tt < t - 0.2 ? null : ob.box(); });
    });
    if (who) {
      var feet, x, hgt;
      if (!STACK) { feet = sf.y1 - u(10); x = cBox.x + cBox.w * 0.5; hgt = fitHeight([who], H * 0.62, feet, top + u(20)); }
      else { feet = sf.y1 - u(6); x = W * 0.5; hgt = fitHeight([who], u(560), feet, gy1 + u(10)); }
      wash({ x: x - u(150), y: feet - u(36), w: u(300), h: u(60), color: C.spring, alpha: 0.6 }).bloom(0.3, 0.8);
      var c = character(who, { x: x, y: feet, height: hgt, face: 1 }).enter(0.35, "fade");
      talkAll(c);
      times.forEach(function (t, i) { if (i < 4) c.gesture(tc(t - 0.25), i % 2 ? "open" : "present", 0.9); });
    }
  };

  TPL["two-pages"] = function (root, p) {
    book(root);
    var sf = SAFE(), Lp = obj(p.left), Rp = obj(p.right), vs = str(p.versus).slice(0, 4) || "or";
    var sp = speechSpan();
    var tR = labelTime(Rp.heading || "", str(p.keyword), 0.6);
    if (tR == null) tR = sp.start + (sp.end - sp.start) * 0.5;
    tR = tc(tR);
    var st = ensure(), g;
    // the open book: cover, two pages, gutter shadow (one canvas)
    var bx = !STACK ? W * 0.045 : W * 0.03, by = !STACK ? H * 0.05 : sf.y0 - u(40), bw = W - bx * 2, bh = !STACK ? H * 0.9 : sf.y1 - sf.y0 + u(80);
    var c = mkCanvas(bw, bh, "sb-spread"), ctx = c.getContext("2d"), s = Math.min(bw, bh) / 1000;
    cwash(ctx, ["r", 4, 4, bw - 8, bh - 8, 24 * s], C.rust, { alpha: 0.92, lift: 5, gran: 0.6, wob: 3 * s });
    var pg = [], gut;
    if (!STACK) { pg = [["r", bw * 0.03, bh * 0.04, bw * 0.47, bh * 0.92, 10 * s], ["r", bw * 0.5, bh * 0.04, bw * 0.47, bh * 0.92, 10 * s]]; gut = ["r", bw * 0.47, bh * 0.04, bw * 0.06, bh * 0.92, 0]; }
    else { pg = [["r", bw * 0.04, bh * 0.025, bw * 0.92, bh * 0.475, 10 * s], ["r", bw * 0.04, bh * 0.5, bw * 0.92, bh * 0.475, 10 * s]]; gut = ["r", bw * 0.04, bh * 0.47, bw * 0.92, bh * 0.06, 0]; }
    pg.forEach(function (q) { cwash(ctx, q, C.cream, { alpha: 0.97, lift: 3, wob: 1.5 * s, edge: 0.25 }); cpencil(ctx, q, { op: 0.35 }); });
    cwash(ctx, gut, "#B79B78", { alpha: 0.35, blur: 10 * s, edge: 0, lift: 0, wob: 0 });
    ctx.globalCompositeOperation = "source-atop"; grainFill(ctx, bw, bh, 0.4, 1.2);
    place(c, bx, by);
    st.L.back.appendChild(c);
    var bmk = bloomMask(c, bw, bh, 23);
    onFrame(function (t) { bmk(prog(t, 0.05, 0.9)); });
    function pageBox(i) { var q = pg[i]; return { x: bx + q[1], y: by + q[2], w: q[3], h: q[4] }; }
    function fillPage(P, B, t0, isRight) {
      var pad = !STACK ? B.w * 0.1 : B.w * 0.06, ix = B.x + pad, iw = B.w - pad * 2;
      var head = str(P.heading) || (isRight ? "After" : "Before"), pts = arr(P.points).map(str).filter(Boolean).slice(0, 4);
      var hy = B.y + B.h * (STACK ? 0.07 : 0.08);
      var hl = label(head, { x: ix, y: hy, w: iw, size: u(STACK ? 44 : 46), align: "center", at: t0 });
      var objS = !STACK ? Math.min(B.h * 0.3, u(240)) : Math.min(B.h * 0.3, u(190));
      var ox = B.x + B.w / 2, oy = hy + hl.h + u(STACK ? 10 : 20) + objS / 2, tx = ix, tw = iw, ty = oy + objS / 2 + u(STACK ? 16 : 30), th = B.y + B.h * 0.95 - ty;
      wash({ x: ox - objS * 0.7, y: oy - objS * 0.58, w: objS * 1.4, h: objS * 1.16, color: isRight ? C.spring : C.skyLt, alpha: 0.6 }).bloom(t0 + 0.05, 0.8);
      var ob = object(P.object || head, { x: ox, y: oy, size: objS }).paintOn(t0 + 0.15, 1.0);
      addBox("object", P.object, 0, null, function (t) { return t < t0 + 0.15 ? null : ob.box(); });
      var n = Math.max(1, pts.length), rowH = Math.min(th / n, u(STACK ? 96 : 120)), after = t0;
      var bsz = u(STACK ? 42 : 44);
      pts.forEach(function (line, i) {
        var y = ty + i * rowH + (th - rowH * n) / 2;
        var lwid = Math.min(tw - bsz * 0.9, measure(line.replace(/\*/g, ""), bsz, false) + bsz), lx0 = STACK || pts.length ? tx + (tw - lwid - bsz * 0.9) / 2 : tx;
        var pt = pageText(line, { x: lx0 + bsz * 0.9, y: y, w: lwid, h: rowH * 0.95, size: bsz, valign: "center", align: "left", minSize: u(22) });
        var t1 = labelTime(line, "", after);
        if (t1 == null || t1 < after) t1 = after + 0.3 + i * 0.6;
        t1 = tc(t1);
        after = t1;
        pt.show(tc(t1 - 0.35), 0.4).speak(t1 - 0.05, t1 + 0.3 * contentWords(line).length + 1.2);
        object("leaf", { x: lx0 + bsz * 0.35, y: y + rowH * 0.475, size: bsz * 0.8 }).paintOn(tc(t1 - 0.35), 0.6);
      });
    }
    fillPage(Lp, pageBox(0), 0.35, false);
    fillPage(Rp, pageBox(1), tR, true);
    // the seal between the pages
    var sx = !STACK ? bx + bw / 2 : bx + bw * (PORT ? 0.86 : 0.88), sy = !STACK ? by + bh * 0.52 : by + bh * 0.5, sr = u(STACK ? 70 : 76);
    var tSeal = tc(Math.max(0.6, tR - 0.45));
    wash({ x: sx - sr, y: sy - sr, w: sr * 2, h: sr * 2, color: C.terracotta, shape: "blob", alpha: 0.95, solid: true, pencil: true }).bloom(tSeal, 0.5);
    label(vs, { x: sx - sr * 0.78, y: sy - u(20), w: sr * 1.56, size: u(32), align: "center", color: C.cream, at: tSeal + 0.25 });
    addBox("seal", vs, 0, null, function (t) { return t < tSeal ? null : { x: sx - sr, y: sy - sr, w: sr * 2, h: sr * 2 }; });
  };

  TPL["number-painting"] = function (root, p) {
    book(root);
    var sf = SAFE(), val = num(p.value, 0), pre = str(p.prefix), suf = str(p.suffix), cap = str(p.label), who = castKey(p.character);
    var dec = Math.abs(val % 1) > 1e-9 ? Math.min(2, (String(val).split(".")[1] || "").length) : 0;
    var finalTxt = pre + fmtNum(val, dec) + suf, sp = speechSpan();
    var tNum = wordTime(p.keyword, null);
    if (tNum == null) tNum = labelTime(cap, "", 0);
    if (tNum == null) tNum = sp.start + (sp.end - sp.start) * 0.3;
    tNum = tc(Math.max(0.5, tNum - 0.2));
    var countDur = clamp(endLimit() - tNum - 0.6, 0.5, 1.4);
    var tallyN = val >= 1 && val <= 12 && dec === 0 ? Math.round(val) : 0;
    var area = { x: sf.x0, y: sf.y0, w: sf.x1 - sf.x0, h: sf.y1 - sf.y0 }, cx;
    if (who && !STACK) { area.x = sf.x0 + (sf.x1 - sf.x0) * 0.28; area.w = sf.x1 - area.x; }
    if (who && STACK) area.h = (sf.y1 - sf.y0) * 0.6;
    cx = area.x + area.w / 2;
    var numSize = Math.min(u(STACK ? 300 : 320), (area.w * 0.95) / Math.max(1, finalTxt.length * 0.62));
    var capLay = cap ? layoutText(parseRich(cap), { size: u(46), maxW: area.w * 0.9, maxLines: 2, lh: 1.3, italic: true }) : null;
    var tallyS = tallyN ? Math.min(u(STACK ? 112 : 96), (area.w * 0.9) / Math.min(6, tallyN) * 0.8) : 0, tallyRows = tallyN > 6 ? 2 : tallyN ? 1 : 0;
    var blockH = numSize * 1.05 + (capLay ? capLay.h + u(24) : 0) + (tallyRows ? tallyRows * tallyS * 1.15 + u(30) : 0);
    var y0 = area.y + Math.max(0, (area.h - blockH) / 2);
    wash({ x: cx - numSize * Math.max(1.2, finalTxt.length * 0.42), y: y0 - numSize * 0.05, w: numSize * Math.max(2.4, finalTxt.length * 0.84), h: numSize * 1.15, color: C.butter, alpha: 0.65 }).bloom(tNum - 0.35, 0.9);
    var nEl = div("sb-number", ensure().L.text), url = textureURL(600, 360, [C.rust, C.terracotta, C.ochre, C.rose], 77);
    place(nEl, area.x, y0, area.w, numSize * 1.05);
    nEl.style.fontSize = f1(numSize) + "px";
    var span = doc.createElement("span");
    span.className = "sb-paint"; span.style.backgroundImage = "url(" + url + ")";
    nEl.appendChild(span);
    onFrame(function (t) {
      var q = prog(t, tNum, countDur), vis = t >= tNum;
      show(nEl, vis);
      if (!vis) return;
      var v = val * outC(q), txt = pre + (q >= 1 ? fmtNum(val, dec) : fmtNum(dec ? v : Math.round(v), dec)) + suf;
      if (span.textContent !== txt) span.textContent = txt;
      setS(nEl, "opacity", f2(outC(prog(t, tNum, 0.3))));
      setS(nEl, "transform", "scale(" + f2(0.9 + 0.1 * outC(prog(t, tNum, 0.6))) + ")");
    });
    var nw = measure(finalTxt, numSize, false);
    addBox("number", finalTxt, 0, null, function (t) { return t < tNum ? null : { x: cx - nw / 2, y: y0 + numSize * 0.1, w: nw, h: numSize * 0.9 }; });
    var yy = y0 + numSize * 1.05;
    if (capLay) {
      var ct = pageText(cap, { x: area.x + area.w * 0.05, y: yy + u(10), w: area.w * 0.9, h: capLay.h + 4, size: capLay.size, italic: true, align: "center", valign: "top" });
      var tc0 = labelTime(cap, "", 0);
      ct.show(tc(tNum + 0.3), 0.5).speak(Math.min(tNum + 0.4, tc0 == null ? tNum + 0.4 : tc0), sp.end);
      yy += capLay.h + u(24);
    }
    if (tallyN) {
      var per = tallyRows === 2 ? Math.ceil(tallyN / 2) : tallyN;
      for (var i = 0; i < tallyN; i++) {
        var rI = Math.floor(i / per), inRow = rI === 0 ? per : tallyN - per, cI = i - rI * per;
        var ox = cx + (cI - (inRow - 1) / 2) * tallyS * 1.12, oy = yy + u(20) + rI * tallyS * 1.15 + tallyS / 2;
        object(p.object || "star", { x: ox, y: oy, size: tallyS, rotate: (hash(i + 3) - 0.5) * 16 }).paintOn(tc(tNum + (countDur * i) / tallyN), 0.6);
      }
      addBox("tally", "tally", 0, null, function (t) { return t < tNum ? null : { x: cx - (per * tallyS * 1.12) / 2, y: yy + u(20), w: per * tallyS * 1.12, h: tallyRows * tallyS * 1.15 }; });
    } else if (p.object) {
      object(p.object, { x: cx + nw / 2 + u(90), y: y0 + numSize * 0.25, size: u(120) }).paintOn(tc(tNum + 0.4), 0.9);
    }
    if (who) {
      var feet, x, hgt;
      if (!STACK) { feet = sf.y1 - u(10); x = sf.x0 + (sf.x1 - sf.x0) * 0.13; hgt = fitHeight([who], H * 0.62, feet, sf.y0 + u(120)); }
      else { feet = sf.y1 - u(6); x = W * 0.5; hgt = fitHeight([who], u(600), feet, area.y + area.h + u(10)); }
      wash({ x: x - u(150), y: feet - u(36), w: u(300), h: u(60), color: C.spring, alpha: 0.6 }).bloom(0.3, 0.8);
      var c = character(who, { x: x, y: feet, height: hgt, face: 1 }).enter(0.35, "fade");
      talkAll(c);
      c.gesture(tc(tNum - 0.1), "point", Math.max(0.8, countDur));
      c.gesture(tc(tNum + countDur + 0.2), "cheer", 1.0);
    }
  };

  TPL["winding-path"] = function (root, p) {
    book(root);
    var sf = SAFE(), stops = arr(p.stops).filter(function (q) { return q && (str(q.label) || str(q.date)); }).slice(0, 6);
    if (!stops.length) stops = [{ date: "", label: "The start", keyword: "" }, { date: "", label: "The end", keyword: "" }];
    var who = castKey(p.character), title = str(p.title), n = stops.length;
    var hz = !STACK ? 0.24 : 0.17;
    painting({ location: "meadow", time: "day", x: 0, y: 0, w: W, h: H, edge: "soft", horizon: hz, groundTop: hz + 0.08, bloom: 0.05, pan: 0.5 });
    var titleBottom = sf.y0;
    if (title) {
      var tl = layoutText(parseRich(title), { size: u(64), maxW: (sf.x1 - sf.x0) * 0.85, maxLines: 2, lh: 1.1 });
      var th = tl.lines.length * tl.size * 1.1;
      wash({ x: W / 2 - Math.min(tl.w * 0.62 + u(60), (sf.x1 - sf.x0) / 2), y: sf.y0 - u(6), w: Math.min(tl.w * 1.24 + u(120), sf.x1 - sf.x0), h: th + u(20), color: C.cream, alpha: 0.85, solid: true }).bloom(0.15, 0.7);
      paintedText(title, { x: sf.x0, y: sf.y0 + u(4), w: sf.x1 - sf.x0, h: th, size: tl.size, lh: 1.1, maxLines: 2, at: 0.3, dur: 0.9 });
      titleBottom = sf.y0 + th + u(20);
    }
    // the path: a sandy band through a serpentine
    var pts = [], N = 7;
    for (var i = 0; i <= N; i++) {
      var f = i / N;
      if (!STACK) pts.push([lerp(sf.x0 - u(60), sf.x1 + u(60), f), H * (0.66 + 0.12 * Math.sin(f * TAU * 1.05 + 0.6))]);
      else pts.push([W * (0.5 + 0.27 * Math.sin(f * TAU * 1.2 + 0.4)), lerp(titleBottom + u(150), sf.y1 - u(40), f)]);
    }
    var path = smoothPathSamples(pts);
    var pc = mkCanvas(W, H, "sb-pathc"), pctx = pc.getContext("2d");
    cbrush(pctx, path.smp, u(70), C.sand, 0.9, { passes: 2, blur: 2, seed: 11 });
    cbrush(pctx, path.smp, u(46), "#EFE2C2", 0.7, { passes: 1, blur: 3, seed: 12 });
    var edgeL = [], edgeR = [];
    path.smp.forEach(function (q, k) { if (k % 4) return; var a = path.smp[Math.max(0, k - 1)], b = path.smp[Math.min(path.smp.length - 1, k + 1)], tx = b[0] - a[0], ty = b[1] - a[1], tl2 = Math.hypot(tx, ty) || 1; edgeL.push([q[0] - (ty / tl2) * u(36), q[1] + (tx / tl2) * u(36)]); edgeR.push([q[0] + (ty / tl2) * u(36), q[1] - (tx / tl2) * u(36)]); });
    cpencil(pctx, ["l", edgeL], { op: 0.35, w: u(1.4) }); cpencil(pctx, ["l", edgeR], { op: 0.35, w: u(1.4) });
    pctx.globalCompositeOperation = "source-atop"; grainFill(pctx, W, H, 0.5, 1.2);
    ensure().L.back.appendChild(pc); place(pc, 0, 0);
    var bmP = bloomMask(pc, W, H, 5);
    onFrame(function (t) { bmP(prog(t, 0.2, 1.1)); });
    var times = itemTimes(stops.map(function (q) { return { label: q.label, keyword: q.keyword }; }), { after: 0.3, gap: 0.5, tail: 0.6 });
    var fs = [];
    for (i = 0; i < n; i++) fs.push(n === 1 ? 0.5 : lerp(0.1, 0.9, i / (n - 1)));
    var spots = fs.map(function (f) { return path.at(f); });
    var sub = { d: path.d, L: path.L, smp: path.smp, fr: fs, at: path.at };
    dottedTrail(sub, stopProgress(sub, times, 0.1), C.rust, u(5));
    var flagC = [C.rust, C.ochre, C.teal, C.plum, C.terracotta, C.moss], walkH = u(STACK ? 300 : 280), whoH = who ? walkH * CHARS[who].h / 300 : u(110);
    var spacing = !STACK ? (sf.x1 - sf.x0) * 0.8 / Math.max(1, n - 1) : 0;
    stops.forEach(function (q, i) {
      var sp0 = spots[i], t = times[i], fh = u(110);
      var k0 = Math.round(fs[i] * (path.smp.length - 1)), pa = path.smp[Math.max(0, k0 - 2)], pb = path.smp[Math.min(path.smp.length - 1, k0 + 2)];
      var nx = -(pb[1] - pa[1]), ny = pb[0] - pa[0], nl = Math.hypot(nx, ny) || 1;
      nx /= nl; ny /= nl;
      if (!STACK ? ny > 0 : nx * (sp0[0] - W / 2) < 0) { nx = -nx; ny = -ny; }
      var sp2 = [sp0[0] + nx * u(58), sp0[1] + ny * u(30)];
      var s = svg("svg", { class: "sb-orn", width: f1(u(90)), height: f1(fh + u(10)), viewBox: "0 0 90 120", overflow: "visible" });
      var keep = seedCounter; seedCounter = 8600 + i * 10;
      s.innerHTML = pen(L_([[20, 118], [20, 6]]), { w: 3, c: C.bark }) + wsh(P_([[22, 8], [80, 22], [22, 40]]), flagC[i % flagC.length], { a: 0.92, wob: 1 }) + pen(P_([[22, 8], [80, 22], [22, 40]]), { w: 1.6 }) + wsh(E_(20, 116, 12, 4), "#6B5A48", { a: 0.25, bloom: false, edge: 0 });
      seedCounter = keep;
      ensure().L.mid.appendChild(s);
      place(s, sp2[0] - u(20), sp2[1] - fh);
      paintOnEl(s, tc(t - 0.25), 0.8);
      // label: above the walker's head (wide) or beside the stop, away from the curve (tall)
      var right = sp0[0] < W / 2, lw = !STACK ? Math.min(u(340), n > 1 ? spacing * 0.96 : u(340)) : (sf.x1 - sf.x0) * 0.42;
      var lx = !STACK ? sp0[0] - lw / 2 : right ? sp0[0] + u(90) : sp0[0] - u(90) - lw;
      lx = clamp(lx, sf.x0, sf.x1 - lw);
      var dateH = str(q.date) ? u(36) : 0, labLay = layoutText(parseRich(q.label), { size: u(38), maxW: lw, maxLines: 2, lh: 1.2 }), labH = labLay.h;
      var ly = !STACK ? sp0[1] - Math.max(fh, whoH) - u(26) - dateH - labH : sp0[1] - whoH * 0.6 - dateH / 2 - labH / 2;
      ly = clamp(ly, titleBottom + u(10), sf.y1 - dateH - labH);
      wash({ x: lx - u(16), y: ly - u(8), w: lw + u(32), h: dateH + labH + u(18), color: C.cream, alpha: 0.8, solid: true }).bloom(tc(t - 0.2), 0.5);
      if (dateH) label(q.date, { x: lx, y: ly, w: lw, size: u(30), align: "center", at: tc(t - 0.15) });
      var lt = pageText(q.label, { x: lx, y: ly + dateH, w: lw, h: labH + 4, size: labLay.size, align: "center", valign: "top", lh: 1.2 });
      lt.show(tc(t - 0.1), 0.4).speak(t - 0.05, t + 1.6);
      addBox("flag", q.label, 0, null, function (tt) { return tt < t - 0.25 ? null : { x: sp2[0] - u(20), y: sp2[1] - fh, w: u(80), h: fh }; });
    });
    if (who) walker(who, sub, times, walkH).enter(0.35, "fade");
  };

  TPL["quote-page"] = function (root, p) {
    book(root);
    var sf = SAFE(), quote = str(p.quote) || V.narration || "", author = str(p.author), orn = str(p.ornament) || "vines", sp = speechSpan();
    var fr = { x: sf.x0 - u(30), y: sf.y0 - u(30), w: sf.x1 - sf.x0 + u(60), h: sf.y1 - sf.y0 + u(60) };
    if (PORT) { fr.y = sf.y0 - u(20); fr.h = sf.y1 - sf.y0 + u(40); }
    // the frame: a wash border and double pencil rules
    var c = mkCanvas(fr.w, fr.h, "sb-frame"), ctx = c.getContext("2d"), m = u(22);
    cbrush(ctx, shapePts(R_(m, m, fr.w - 2 * m, fr.h - 2 * m, u(14)), 10).pts.concat([[m + u(14), m]]), u(30), C.sage, 0.38, { passes: 2, blur: 2, seed: 31 });
    cpencil(ctx, R_(m - u(14), m - u(14), fr.w - 2 * m + u(28), fr.h - 2 * m + u(28), u(18)), { op: 0.55, w: u(1.8), seed: 32 });
    cpencil(ctx, R_(m + u(16), m + u(16), fr.w - 2 * m - u(32), fr.h - 2 * m - u(32), u(10)), { op: 0.4, w: u(1.3), seed: 33 });
    ctx.globalCompositeOperation = "source-atop"; grainFill(ctx, fr.w, fr.h, 0.5, 1.2);
    place(c, fr.x, fr.y); ensure().L.back.appendChild(c);
    var bmF = bloomMask(c, fr.w, fr.h, 8);
    onFrame(function (t) { bmF(prog(t, 0.1, 0.9)); });
    var cs = u(PORT ? 190 : 200);
    ornament("corner", { x: fr.x + u(6), y: fr.y + u(6), w: cs }).paintOn(0.3, 1);
    ornament("corner", { x: fr.x + fr.w - cs - u(6), y: fr.y + u(6), w: cs, flip: "x" }).paintOn(0.45, 1);
    ornament("corner", { x: fr.x + u(6), y: fr.y + fr.h - cs - u(6), w: cs, flip: "y" }).paintOn(0.6, 1);
    ornament("corner", { x: fr.x + fr.w - cs - u(6), y: fr.y + fr.h - cs - u(6), w: cs, flip: "xy" }).paintOn(0.75, 1);
    var ix = fr.x + cs * 0.75, iw = fr.w - cs * 1.5, iy = fr.y + cs * 0.6, ih = fr.h - cs * 1.2;
    var iw2 = Math.min(iw, u(STACK ? 900 : 1060)); ix += (iw - iw2) / 2; iw = iw2;
    var authH = author ? u(44) + u(70) : u(70);
    var qt = pageText(quote, { x: ix, y: iy, w: iw, h: ih - authH, size: u(PORT ? 76 : 84), italic: true, dropCap: "illuminated", valign: "top", align: "left", lh: 1.36 });
    var dy = (ih - authH - (qt.bottom - qt.top)) / 2;
    qt.moveBy(dy);
    qt.moveX((iw - qt.box().w) / 2);
    var tQ = firstTime(quote, 0);
    if (tQ == null) tQ = sp.start;
    qt.show(tc(Math.min(0.5, tQ - 0.3))).speak(tQ, sp.end);
    var qEnd = speechSpan().end;
    var fl = ornament("fleuron", { x: ix + iw / 2, y: qt.bottom + u(40), w: u(220) }).paintOn(tc(qEnd - 0.6), 0.9);
    if (author) {
      var ta = firstTime(author, 0);
      ta = tc(ta == null || ta > qEnd ? qEnd - 0.3 : Math.max(ta, 0.5));
      label(author, { x: ix, y: qt.bottom + u(76), w: iw, size: u(38), align: "center", at: ta });
    }
    if (orn === "stars") twinkles({ x: fr.x + u(30), y: fr.y + u(20), w: fr.w - u(60), h: u(110), n: 9, seed: 3 }) && twinkles({ x: fr.x + u(30), y: fr.y + fr.h - u(120), w: fr.w - u(60), h: u(100), n: 8, seed: 4 });
    if (orn === "leaves") leaves({ x: 0, y: 0, w: W, h: H, n: PORT ? 7 : 9, kind: "leaf", seed: 5, from: 0.4, parent: ensure().L.mid });
  };

  TPL["dream-sequence"] = function (root, p) {
    book(root);
    var sf = SAFE(), who = castOf(p.character, "wren"), text = str(p.text) || V.narration || "", sp = speechSpan();
    var dreams = arr(p.dreams).filter(function (q) { return q && str(q.object); }).slice(0, 3);
    if (!dreams.length) dreams = [{ object: "star", keyword: "" }];
    var feetF = PORT ? 1440 / 1920 : 0.92, gopt = groundForFeet(feetF);
    var pt = painting({ location: "night-sky", time: "night", x: 0, y: 0, w: W, h: H, edge: "soft", horizon: PORT ? 0.5 : 0.62, groundTop: gopt.groundTop, bloom: 0.05, sun: STACK ? [0.13, 0.075] : [0.1, 0.16] });
    fireflies({ x: W * 0.05, y: H * 0.45, w: W * 0.9, h: H * 0.4, n: PORT ? 10 : 14, seed: 9, from: 0.5 });
    var txt, cloud, cx0, feet = pt.ground(0.5), chX, adult;
    if (!STACK) {
      chX = W * 0.2;
      adult = fitHeight([who], H * 0.5, pt.ground(0.2), H * 0.4);
      cloud = { x: W * 0.33, y: sf.y0 + u(10), w: sf.x1 - W * 0.33, h: H * 0.5 };
      txt = pageText(text, { x: W * 0.36, y: H * 0.64, w: sf.x1 - W * 0.36, h: sf.y1 - H * 0.64, size: u(48), italic: true, color: C.cream, emColor: C.honey, align: "left", valign: "center" });
    } else {
      chX = W * 0.5;
      txt = pageText(text, { x: sf.x0 + u(10), y: sf.y0, w: sf.x1 - sf.x0 - u(20), h: (sf.y1 - sf.y0) * 0.24, size: u(SQ ? 40 : 48), italic: true, color: C.cream, emColor: C.honey, align: "center", valign: "top" });
      var cTop = txt.bottom + u(30);
      adult = fitHeight([who], u(PORT ? 470 : 380), pt.ground(0.5), (sf.y1 - sf.y0) * 0.62 + sf.y0);
      var headY = pt.ground(0.5) - adult * CHARS[who].h / 300;
      cloud = { x: sf.x0 + u(20), y: cTop, w: sf.x1 - sf.x0 - u(40), h: Math.max(u(260), headY - u(70) - cTop) };
    }
    var c = character(who, { x: chX, y: pt.ground(chX / W), height: adult, face: 1 }).enter(0.3, "fade");
    c.pose(0.8, "wonder").look(0.8, 0.5, -1);
    var tFirst = labelTime(dreams[0].object, dreams[0].keyword, 0);
    var tCloud = tc(Math.max(0.6, Math.min((tFirst || 1.2) - 0.9, sp.start + 0.6)));
    // the thought cloud: a big painted cloud with little puffs down to the head
    var s = svg("svg", { class: "sb-bubble", width: f1(W), height: f1(H), viewBox: "0 0 " + W + " " + H, overflow: "visible" });
    ensure().L.mid.appendChild(s);
    var keep = seedCounter; seedCounter = 8700;
    var ccx = cloud.x + cloud.w / 2, ccy = cloud.y + cloud.h / 2, cp = [], n = 72;
    for (var i = 0; i < n; i++) { var an = (i / n) * TAU, bump = 1 + 0.09 * Math.abs(Math.sin(an * 6)); cp.push([ccx + Math.cos(an) * cloud.w * 0.48 * bump, ccy + Math.sin(an) * cloud.h * 0.44 * bump]); }
    var hb = c.headBox(1), hx = hb.x + hb.w * 0.6, hy = hb.y;
    var g1 = svg("g", {}, s), puffs = [];
    g1.innerHTML = wsh(P_(cp), "#E9E2F0", { a: 0.9, wob: u(2), edge: 0.35, ew: 2 }) + pen(P_(cp), { w: u(2.2), c: "#D9D2E6", op: 0.9 });
    [0.25, 0.5, 0.75].forEach(function (f, q) {
      var px = lerp(hx, ccx - cloud.w * (STACK ? 0.05 : 0.2), f), py = lerp(hy - u(16), ccy + cloud.h * 0.4, f), r0 = u(10 + q * 7);
      var gp = svg("g", {}, s);
      gp.innerHTML = wsh(E_(px, py, r0, r0 * 0.85), "#E9E2F0", { a: 0.9, wob: u(0.6), edge: 0.35 });
      puffs.push({ g: gp, at: tCloud - 0.45 + q * 0.15 });
    });
    seedCounter = keep;
    s.style.transformOrigin = f1(ccx) + "px " + f1(ccy + cloud.h * 0.4) + "px";
    onFrame(function (t) {
      var q = prog(t, tCloud, 0.8);
      show(g1, q > 0);
      setA(g1, "opacity", f2(outC(q)));
      setA(g1, "transform", "translate(0," + f1((1 - outC(q)) * u(60)) + ")");
      puffs.forEach(function (pf) { var k = prog(t, pf.at, 0.4); setA(pf.g, "opacity", f2(outC(k))); });
    });
    addBox("cloud", "dream", tCloud, null, function () { return { x: cloud.x, y: cloud.y, w: cloud.w, h: cloud.h }; });
    var times = itemTimes(dreams.map(function (q) { return { label: q.object, keyword: q.keyword }; }), { after: tCloud + 0.4, gap: 0.6, tail: 0.6 });
    var nd = dreams.length, osz = Math.min(cloud.h * 0.55, (cloud.w * 0.8) / nd * 0.8, u(260));
    dreams.forEach(function (q, i) {
      var ox = ccx + (i - (nd - 1) / 2) * (cloud.w * 0.8 / nd), oy = ccy + (i % 2 ? osz * 0.06 : -osz * 0.06);
      var ob = object(q.object, { x: ox, y: oy, size: osz }).paintOn(tc(Math.max(tCloud + 0.4, times[i] - 0.25)), 1.1).bob(u(5), 0.6 + i * 0.15);
      addBox("object", q.object, 0, null, function (t) { return t < times[i] - 0.25 ? null : ob.box(); });
    });
    // a shooting star
    var ss = svg("svg", { class: "sb-amb-svg", width: f1(W), height: f1(H) }, ensure().L.fx), line = svg("path", { fill: "none", stroke: "#F7EBC6", "stroke-width": f1(u(3)), "stroke-linecap": "round" }, ss);
    var tS = tc(Math.min(D * 0.35, 3.2)), sx0 = W * 0.1, sy0 = H * 0.08, sx1 = W * 0.55, sy1 = H * 0.22;
    onFrame(function (t) {
      var q = prog(t, tS, 0.9);
      show(ss, q > 0 && q < 1);
      if (q <= 0 || q >= 1) return;
      var hx2 = lerp(sx0, sx1, outC(q)), hy2 = lerp(sy0, sy1, outC(q)), tl = 0.25;
      var tx2 = lerp(sx0, sx1, Math.max(0, outC(q) - tl)), ty2 = lerp(sy0, sy1, Math.max(0, outC(q) - tl));
      setA(line, "d", "M" + f1(tx2) + " " + f1(ty2) + "L" + f1(hx2) + " " + f1(hy2));
      setA(line, "stroke-opacity", f2(Math.sin(q * PI)));
    });
    txt.show(tc(Math.min(0.5, sp.start))).speak(sp.start, sp.end);
  };

  TPL["the-end"] = function (root, p) {
    book(root);
    var sf = SAFE(), moral = str(p.moral) || V.narration || "", closing = str(p.closing) || "The End", loc = locKey(p.location, "meadow"), time = timeKey(p.time || "dusk");
    var cast = castList(p.characters, 3, ["wren"]), sp = speechSpan();
    var tClose = kwFind(contentWords(closing)[0] || closing.split(" ")[0], 0.3);
    var moralEnd = sp.end;
    var lw = lineWindows([moral]);
    if (lw[0] && lw[0].found) moralEnd = lw[0].end;
    if (tClose == null || tClose < moralEnd - 0.2) tClose = moralEnd + 0.2;
    tClose = Math.min(tClose - 0.2, endLimit() - 1.0);
    tClose = tc(Math.max(0.8, tClose));
    var vg, mt, colX, colW, endBox;
    if (!STACK) {
      vg = { x: W * 0.03, y: H * 0.05, w: W * 0.54, h: H * 0.9 };
      colX = W * 0.6; colW = sf.x1 - colX;
      var endH = u(150), ornH = u(70);
      mt = pageText(moral, { x: colX, y: sf.y0, w: colW, h: sf.y1 - sf.y0 - endH - ornH, size: u(52), italic: true, align: "center", valign: "top" });
      var blockH = (mt.bottom - mt.top) + ornH + endH;
      mt.moveBy((sf.y1 - sf.y0 - blockH) / 2);
      ornament("fleuron", { x: colX + colW / 2, y: mt.bottom + ornH / 2, w: u(220) }).paintOn(tc(moralEnd - 0.4), 0.9);
      endBox = { x: colX, y: mt.bottom + ornH, w: colW, h: endH };
    } else {
      colX = sf.x0 + u(10); colW = sf.x1 - sf.x0 - u(20);
      mt = pageText(moral, { x: colX, y: sf.y0, w: colW, h: (sf.y1 - sf.y0) * 0.28, size: u(SQ ? 42 : 48), italic: true, align: "center", valign: "top" });
      ornament("fleuron", { x: W / 2, y: mt.bottom + u(36), w: u(200) }).paintOn(tc(moralEnd - 0.4), 0.9);
      var eh = u(SQ ? 110 : 150);
      endBox = { x: colX, y: sf.y1 - eh, w: colW, h: eh };
      vg = { x: W * 0.03, y: mt.bottom + u(72), w: W * 0.94, h: Math.max(H * 0.2, endBox.y - u(10) - mt.bottom - u(72)) };
    }
    mt.show(tc(Math.min(0.5, sp.start))).speak(sp.start, moralEnd);
    paintedText(closing, { x: endBox.x, y: endBox.y, w: endBox.w, h: endBox.h, size: u(STACK ? 120 : 120), all: true, maxLines: 1, at: tClose, dur: 1.0 });
    var pt = painting({ location: loc, time: time, x: vg.x, y: vg.y, w: vg.w, h: vg.h, edge: "oval", bloom: 0.05 });
    var nC = cast.length, fxs = nC === 1 ? [0.5] : nC === 2 ? [0.38, 0.62] : [0.3, 0.5, 0.7];
    var adult = fitHeight(cast, vg.h * 0.5, pt.ground(0.5), vg.y + vg.h * 0.2);
    cast.forEach(function (k, i) {
      var ch = character(k, { x: vg.x + vg.w * fxs[i], y: pt.ground(fxs[i]), height: adult, face: i === nC - 1 && nC > 1 ? -1 : 1 }).enter(0.4 + i * 0.2, "fade");
      ch.gesture(tc(tClose - 0.3 + i * 0.15), "wave", 1.6);
      if (i === 0) ch.gesture(tc(sp.start + 0.4), "heart", 1.2);
    });
    fireflies({ x: W * 0.05, y: H * 0.1, w: W * 0.9, h: H * 0.8, n: PORT ? 10 : 14, seed: 12, from: 0.6 });
  };

  // ------------------------- render, fallback, inspect -------------------------
  function render(id, root, props) {
    if (!TPL[id]) throw new Error("Unknown template: " + id);
    TPL[id](root || V.root(), obj(props));
  }
  function fallback(root, narration) {
    try {
      root = root || V.root();
      while (root.firstChild) root.removeChild(root.firstChild);
      B = null;
      book(root, { turn: false });
      var sf = SAFE(), text = str(narration || V.narration).split(/\s+/).slice(0, 36).join(" ") || "Once upon a time.";
      var pr = !STACK ? { x: W * 0.02, y: H * 0.04, w: W * 0.6, h: H * 0.92 } : { x: 0, y: H * 0.06, w: W, h: H * 0.48 };
      var pt = painting({ location: "meadow", time: "day", x: pr.x, y: pr.y, w: pr.w, h: pr.h });
      var c = character("wren", { x: pr.x + pr.w * 0.5, y: pt.ground(0.5), height: pr.h * 0.6, face: 1 }).enter(0.2);
      talkAll(c);
      var tb = !STACK ? { x: W * 0.66, y: sf.y0, w: sf.x1 - W * 0.66, h: sf.y1 - sf.y0 } : { x: sf.x0, y: H * 0.56, w: sf.x1 - sf.x0, h: sf.y1 - H * 0.56 };
      pageText(text, { x: tb.x, y: tb.y, w: tb.w, h: tb.h, size: u(46) }).show(0.3).speak(0.3, endLimit());
    } catch (e) { V.error("[storybook fallback] " + (e && e.message ? e.message : e)); }
  }
  function inspect(t) {
    if (!B) return [];
    var out = [];
    B.boxes.forEach(function (bx) {
      if (t < bx.from || t >= bx.to) return;
      var b = null;
      try { b = bx.get(t); } catch (e) { b = null; }
      if (!b) return;
      out.push({ kind: bx.kind, label: bx.label, x: b.x, y: b.y, w: b.w, h: b.h, moving: !!b.moving });
    });
    return out;
  }

  // ------------------------- public API -------------------------
  S.book = book;
  S.stage = stage;
  S.painting = painting;
  S.pageTurn = pageTurn;
  S.wash = wash;
  S.colors = C;
  S.locationNames = LOCS.slice();
  S.cast = CAST.slice();
  S.gestures = GESTURES.filter(function (g) { return g !== "idle"; });
  S.objectNames = OBJ_NAMES.slice();
  S.character = character;
  S.pageText = pageText;
  S.bubble = bubble;
  S.label = label;
  S.ornament = ornament;
  S.paintedText = paintedText;
  S.lineWindows = function (lines) { return lineWindows(arr(lines).map(str)); };
  S.object = object;
  S.fireflies = fireflies;
  S.leaves = leaves;
  S.twinkles = twinkles;
  S.paintOn = paintOnEl;
  S.washMarkup = function (points, color, o) { return wsh(Array.isArray(points) && Array.isArray(points[0]) ? P_(points) : points, colorOf(color, color || C.sage), o); };
  S.penMarkup = function (points, o) { return pen(Array.isArray(points) && Array.isArray(points[0]) ? L_(points) : points, o); };
  S.onFrame = onFrame;
  S.tl = function () { return ensure().tl; };
  S.safe = SAFE;
  S.find = kwFind;
  S.speechSpan = speechSpan;
  S.templates = Object.keys(TPL);
  S.render = render;
  S.fallback = fallback;
  S.inspect = inspect;
  S.flush = function () { if (B) for (var i = 0; i < B.ups.length; i++) B.ups[i](V.time()); };
})();

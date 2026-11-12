/* Origin Story engine (style id: origin-story).
 *
 * Hand-inked business-history illustration: a big-headed caricature of a generic business archetype in the
 * foreground, an aerial "empire" of buildings behind, a paper headline plate with the company name and a
 * year band, and paper cards (blueprints, charts, maps, contracts) that land on their spoken words.
 *
 * Architecture
 * - Build time: S.scene(opts) makes one root div (.fs) holding, back to front:
 *   (1) one world SVG with layers sky (parallax 0.04), far, mid, near (0.3 / 0.58 / 0.82), tone (sky mood
 *       wash), props (1), actors (1), fx (1), front (1.1); (2) a world-space HTML layer; (3) the HUD (screen
 *       HTML: plate, headlines, stats, paper cards); (4) a screen SVG for arrows, bursts, rain and lightning;
 *       (5) a static paper-grain overlay. Every element is built once; calls only record keyframes.
 * - The empire is a seeded layout of rows of buildings (far rows small near the horizon, near rows large),
 *   drawn as ink-outlined watercolour boxes with hatching. Buildings are ranked; `growth` decides how many
 *   exist at the start and S.grow(from, to) pops the rest in rank order.
 * - One frame function (V.onFrame) sets everything from t only: camera (chained moves, rise, shake, a small
 *   handheld drift), layer matrices, the actor rigs (pose blend, lip sync visemes from V.words, blinks,
 *   gestures), marks, world props, and the HUD components (entry slides and wipes, count-ups, draw-ons).
 *   Nothing depends on the previous frame, so seeking works in both directions.
 * - Figures: one skeleton for every archetype, drawn in a three-quarter view facing +x (mirrored for
 *   facing left). Head, torso and arms are nested SVG groups rotated per frame. The look is data: an
 *   archetype is a preset of parameters (head shape, nose, hair, glasses, facial hair, hat, outfit and
 *   colours) and any field can be overridden, so any invented founder can be made.
 * - Timing: templates find their words (V.find, keyword props, the most distinctive word of a label, then a
 *   narration estimate) and clamp every beat into [0.2, duration - 1]. HUD text is never scaled (CSS scale
 *   on text is not seek-stable): it slides, wipes and counts.
 * No network, no timers, no wall clock; randomness only from V.makeRand or hashes of fixed seeds.
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
  var SANS = '"Inter", "Noto Sans", "Arial Narrow", "Segoe UI", Arial, sans-serif';
  var SERIF = 'Georgia, "Noto Serif", "Times New Roman", serif';
  var INK = "#2B2420", ACC = "#C8503C", MUTED = "#7C7268", BG = "#D8E4EA", PAPER = "#F4ECDD", PAPER2 = "#EADFCB";
  var BLUEP = "#355F8A", GOLD = "#C9A04A", GREEN = "#5F8A55";

  // ------------------------- small utils -------------------------
  function u(px) { return V.s(px); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, p) { return a + (b - a) * p; }
  function num(v, d) { var n = typeof v === "number" ? v : parseFloat(v); return isFinite(n) ? n : d; }
  function f1(n) { return Math.round(n * 10) / 10; }
  function f2(n) { return Math.round(n * 100) / 100; }
  function str(v) { return typeof v === "string" ? v.trim() : v == null ? "" : typeof v === "number" ? String(v) : ""; }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function rad(d) { return (d * PI) / 180; }
  function smooth(p) { p = clamp(p, 0, 1); return p * p * (3 - 2 * p); }
  function hash(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function strHash(s) { s = String(s); var h = 7; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 100003; return h; }
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
  var COMB = new RegExp("[" + String.fromCharCode(0x300) + "-" + String.fromCharCode(0x36f) + "]", "g");
  function normWord(s) {
    return String(s == null ? "" : s).toLowerCase().normalize("NFKD").replace(COMB, "").replace(/[^\p{L}\p{N}]+/gu, "");
  }
  // Text that came from props: replace typographic dashes and quotes with plain ones.
  var DASHES = new RegExp("[" + String.fromCharCode(0x2012) + "-" + String.fromCharCode(0x2015) + "]", "g");
  var SQUOTES = new RegExp("[" + String.fromCharCode(0x2018) + String.fromCharCode(0x2019) + "]", "g");
  var DQUOTES = new RegExp("[" + String.fromCharCode(0x201c) + String.fromCharCode(0x201d) + "]", "g");
  function clean(s) { return str(s).replace(DASHES, "-").replace(SQUOTES, "'").replace(DQUOTES, '"').replace(/\s+/g, " "); }
  function EZ(e) { if (typeof e === "function") return e; return (e && (CE[e] || V.ease[e])) || V.ease.inOutCubic; }
  function mix(a, b, p) {
    if (typeof b === "number") return typeof a === "number" ? a + (b - a) * p : b;
    if (b && typeof b === "object") {
      var o = {}, k;
      if (a && typeof a === "object") for (k in a) o[k] = a[k];
      for (k in b) o[k] = mix(a && typeof a === "object" ? a[k] : undefined, b[k], p);
      return o;
    }
    return p > 0 ? b : a;
  }
  function shade(hex, k) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex));
    if (!m) return hex;
    var n = parseInt(m[1], 16), r = ((n >> 16) & 255) * k, g = ((n >> 8) & 255) * k, b = (n & 255) * k;
    r = Math.round(clamp(r, 0, 255)); g = Math.round(clamp(g, 0, 255)); b = Math.round(clamp(b, 0, 255));
    return "#" + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }
  function tint(hex, k) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex));
    if (!m) return hex;
    var n = parseInt(m[1], 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) { return Math.round(v + (255 - v) * k); });
    return "#" + ((1 << 24) | (c[0] << 16) | (c[1] << 8) | c[2]).toString(16).slice(1);
  }
  function isHex(c) { return /^#[0-9a-f]{6}$/i.test(str(c)) || /^#[0-9a-f]{3}$/i.test(str(c)); }
  function hex6(c) { c = str(c); if (/^#[0-9a-f]{3}$/i.test(c)) return "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]; return c; }
  function colorOr(c, d) { return isHex(c) ? hex6(c) : d; }

  // ------------------------- easing -------------------------
  var CE = {
    pose: function (p) {
      if (p <= 0) return 0;
      if (p >= 1) return 1;
      if (p < 0.14) return -0.06 * Math.sin((p / 0.14) * PI);
      var q = (p - 0.14) / 0.86 - 1, c = 1.2;
      return 1 + (c + 1) * q * q * q + c * q * q;
    },
    snap: function (p) {
      if (p <= 0) return 0;
      if (p >= 1) return 1;
      var q = p - 1, c = 2.4;
      return 1 + (c + 1) * q * q * q + c * q * q;
    },
    soft: function (p) { return -(Math.cos(PI * clamp(p, 0, 1)) - 1) / 2; },
  };

  // ------------------------- keyframe tracks -------------------------
  function Tr(base) { this.base = base; this.k = []; this.sorted = true; }
  Tr.prototype.to = function (v, at, dur, ease) {
    this.k.push({ at: num(at, 0), d: Math.max(0, num(dur, 0)), v: v, e: EZ(ease), i: this.k.length });
    this.sorted = false;
    return this;
  };
  Tr.prototype.set = function (v, at) { return this.to(v, at, 0); };
  Tr.prototype.sort = function () { if (!this.sorted) { this.k.sort(function (a, b) { return a.at - b.at || a.i - b.i; }); this.sorted = true; } };
  Tr.prototype.val = function (t) {
    this.sort();
    var v = this.base, k = this.k;
    for (var i = 0; i < k.length; i++) {
      var q = k[i];
      if (t < q.at) break;
      var p = q.d > 0 ? Math.min(1, (t - q.at) / q.d) : 1;
      v = mix(v, q.v, q.e(p));
    }
    return v;
  };
  Tr.prototype.key = function (t) {
    this.sort();
    var v = this.base, at = -1;
    for (var i = 0; i < this.k.length; i++) { if (t < this.k[i].at) break; v = this.k[i].v; at = this.k[i].at; }
    return { v: v, at: at };
  };
  Tr.prototype.moving = function (t) {
    for (var i = 0; i < this.k.length; i++) { var q = this.k[i]; if (q.d > 0.05 && t > q.at && t < q.at + q.d) return true; }
    return false;
  };
  function setA(el, k, v) { v = String(v); if (el["_a" + k] !== v) { el["_a" + k] = v; el.setAttribute(k, v); } }
  function setS(el, k, v) { v = String(v); if (el["_s" + k] !== v) { el["_s" + k] = v; el.style[k] = v; } }
  function showEl(el, on) { setS(el, "display", on ? "" : "none"); }
  function popK(t, at, dur, kind) {
    if (t < at) return 0;
    return (kind === "soft" ? CE.soft : CE.snap)(clamp((t - at) / (dur || 0.32), 0, 1));
  }

  // ------------------------- text -------------------------
  var mctx = null;
  function measure(text, size, weight, family) {
    if (!mctx) mctx = doc.createElement("canvas").getContext("2d");
    mctx.font = (weight || 800) + " " + size + "px " + (family || SANS);
    return mctx.measureText(text).width;
  }
  // "*word*" marks emphasis. Returns [{w, em}]
  function parseRich(text, upper) {
    var out = [], em = false;
    clean(text).split(" ").forEach(function (tok) {
      if (!tok) return;
      var s = tok, e0 = em, open = false, close = false;
      if (s.charAt(0) === "*") { open = true; s = s.slice(1); }
      var lead = /^[^\p{L}\p{N}*]*\*/u.exec(s);
      if (!open && lead) { open = true; s = s.replace("*", ""); }
      if (/\*[^\p{L}\p{N}]*$/u.test(s)) { close = true; s = s.replace(/\*(?=[^\p{L}\p{N}]*$)/u, ""); }
      s = s.replace(/\*/g, "");
      if (open) e0 = true;
      if (upper) s = s.toUpperCase();
      if (s) out.push({ w: s, em: e0 || em });
      if (open && !close) em = true;
      if (close) em = false;
    });
    return out;
  }
  function plain(text) { return clean(text).replace(/\*/g, ""); }
  function wrapGreedy(words, size, maxW, weight, fam) {
    var lines = [], cur = [], cw = 0, sp = measure(" ", size, weight, fam);
    words.forEach(function (wd) {
      var ww = measure(wd.w, size, weight, fam);
      if (cur.length && cw + sp + ww > maxW) { lines.push({ words: cur, w: cw }); cur = []; cw = 0; }
      cw += (cur.length ? sp : 0) + ww;
      cur.push(wd);
    });
    if (cur.length) lines.push({ words: cur, w: cw });
    return lines;
  }
  // Fit rich text: shrink until it fits maxLines and no word is wider than maxW; then balance lines.
  function layoutRich(text, o) {
    o = o || {};
    var fam = o.family || SANS;
    var words = Array.isArray(text) ? text : parseRich(text, o.upper), size = o.size || 48, minSize = o.minSize || size * 0.45;
    var maxW = o.maxWidth || 600, maxLines = o.maxLines || 3, weight = o.weight || 800, lh = o.lh || 1.08;
    var lines;
    if (!words.length) return { size: size, lines: [], w: 0, h: 0, lh: lh, weight: weight, family: fam };
    for (var guard = 0; guard < 40; guard++) {
      lines = wrapGreedy(words, size, maxW, weight, fam);
      var widest = 0;
      words.forEach(function (wd) { widest = Math.max(widest, measure(wd.w, size, weight, fam)); });
      if ((lines.length <= maxLines && widest <= maxW) || size <= minSize) break;
      size = Math.max(minSize, size * 0.93);
    }
    if (lines.length > 1) {
      var lo = maxW * 0.35, hi = maxW, n = lines.length;
      for (var i = 0; i < 14; i++) {
        var mid = (lo + hi) / 2, l2 = wrapGreedy(words, size, mid, weight, fam), ok = l2.length <= n;
        l2.forEach(function (l) { if (l.words.length === 1 && measure(l.words[0].w, size, weight, fam) > mid) ok = false; });
        if (ok) hi = mid; else lo = mid;
      }
      lines = wrapGreedy(words, size, hi + 0.5, weight, fam);
    }
    var w = 0;
    lines.forEach(function (l) { w = Math.max(w, l.w); });
    return { size: size, lines: lines, w: w, h: lines.length * size * lh, lh: lh, weight: weight, family: fam };
  }
  function fillRich(el, lay, cls) {
    var spans = [];
    lay.lines.forEach(function (l, li) {
      var line = div("fs-line", el);
      l.words.forEach(function (wd, wi) {
        if (wi) line.appendChild(doc.createTextNode(" "));
        var s = doc.createElement("span");
        s.className = (cls || "fs-w") + (wd.em ? " fs-em" : "");
        s.textContent = wd.w;
        line.appendChild(s);
        spans.push({ el: s, w: wd.w, em: wd.em, line: li });
      });
    });
    el.style.fontSize = f1(lay.size) + "px";
    el.style.lineHeight = String(lay.lh);
    el.style.fontWeight = String(lay.weight);
    el.style.fontFamily = lay.family;
    return spans;
  }
  function fitOne(text, size, maxW, weight, fam, minSize) {
    var s = size;
    for (var i = 0; i < 40 && measure(text, s, weight, fam) > maxW && s > (minSize || 8); i++) s *= 0.94;
    return s;
  }

  // ------------------------- word timing -------------------------
  var STOP = {};
  "a an the and or but of to in on at by for with from into onto over under is are was were be been being it its this that these those your you we our us my me i his her their they them he she as than then so not no yes do does did have has had will would can could should very just more most less each every all any some about here there what when who how why which also too up out if im its whats thats youre dont wont cant one".split(" ").forEach(function (w) { STOP[w] = 1; });
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
    // multi-word phrase: try its longest token
    var toks = word.split(/\s+/).filter(function (x) { return normWord(x).length > 2 && !STOP[normWord(x)]; });
    if (toks.length > 1) {
      toks.sort(function (a, b) { return normWord(b).length - normWord(a).length; });
      t = V.find(toks[0], after || 0);
      if (t != null) return t;
    }
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
  function tc0(t) { return clamp(num(t, 0), 0, D); }
  // times for a list of words in order; missing ones are spread; at least `gap` apart; compressed to fit.
  function syncTimes(keys, o) {
    o = o || {};
    var prev = o.after || 0, out = [];
    (keys || []).forEach(function (k) { var t = k == null || k === "" ? null : kwFind(k, prev); out.push(t); if (t != null) prev = t + 0.01; });
    out = spread(out, o.a, o.b);
    var gap = o.gap == null ? 0.3 : o.gap;
    for (var i = 1; i < out.length; i++) if (out[i] < out[i - 1] + gap) out[i] = out[i - 1] + gap;
    var lim = o.limit == null ? endLimit() : o.limit;
    if (out.length && out[out.length - 1] > lim) {
      // compress the tail so the last one lands before the limit
      var first = Math.min(out[0], lim), n = out.length;
      for (i = 0; i < n; i++) out[i] = Math.min(out[i], lim - (n - 1 - i) * Math.min(gap, (lim - first) / Math.max(1, n - 1)));
    }
    return out.map(function (t) { return tc(t - (o.lead || 0)); });
  }
  // find a word but skip hits that are inside one of the given names (the token before it matches the name)
  function findOutsideNames(word, after, names) {
    var key = normWord(String(word).split(/\s+/)[0] || ""), ws = V.words || [], a = after || 0;
    if (!key) return null;
    var nameToks = arr(names).map(function (n) { return plain(n).split(/\s+/).map(normWord).filter(Boolean); });
    for (var guard = 0; guard < 20; guard++) {
      var i = V.wordIndex(word, a);
      if (i < 0) return null;
      var prev = i > 0 ? normWord(ws[i - 1].word) : "", inside = false;
      nameToks.forEach(function (nt) { var j = nt.indexOf(key); if (j > 0 && nt[j - 1] === prev) inside = true; });
      if (!inside) return ws[i].start;
      a = ws[i].start + 0.01;
    }
    return null;
  }
  function wordAt(word, fallbackText, def, after) {
    var t = word ? kwFind(word, after || 0) : null;
    if (t == null && fallbackText) t = labelTime(fallbackText, null, after || 0);
    return t == null ? def : t;
  }

  // ------------------------- svg markup helpers -------------------------
  function R(x, y, w, h, fill, rx, ex) { return '<rect x="' + f1(x) + '" y="' + f1(y) + '" width="' + f1(Math.max(0, w)) + '" height="' + f1(Math.max(0, h)) + '"' + (rx ? ' rx="' + rx + '"' : "") + ' fill="' + fill + '"' + (ex || "") + "/>"; }
  function C(x, y, r, fill, ex) { return '<circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="' + f1(r) + '" fill="' + fill + '"' + (ex || "") + "/>"; }
  function E(x, y, rx, ry, fill, ex) { return '<ellipse cx="' + f1(x) + '" cy="' + f1(y) + '" rx="' + f1(rx) + '" ry="' + f1(ry) + '" fill="' + fill + '"' + (ex || "") + "/>"; }
  function P(d, fill, ex) { return '<path d="' + d + '" fill="' + fill + '"' + (ex || "") + "/>"; }
  function L(x1, y1, x2, y2, stroke, w, ex) { return '<path d="M' + f1(x1) + " " + f1(y1) + "L" + f1(x2) + " " + f1(y2) + '" stroke="' + stroke + '" stroke-width="' + w + '" stroke-linecap="round" fill="none"' + (ex || "") + "/>"; }
  function SK(c, w) { return ' stroke="' + (c || INK) + '" stroke-width="' + (w == null ? 2.4 : w) + '" stroke-linejoin="round" stroke-linecap="round"'; }
  function poly(pts) { var s = ""; for (var i = 0; i < pts.length; i++) s += (i ? "L" : "M") + f1(pts[i][0]) + " " + f1(pts[i][1]); return s + "Z"; }
  function rrD(x, y, w, h, r) {
    r = Math.min(r || 0, w / 2, h / 2);
    return "M" + f1(x + r) + " " + f1(y) + "H" + f1(x + w - r) + "Q" + f1(x + w) + " " + f1(y) + " " + f1(x + w) + " " + f1(y + r) + "V" + f1(y + h - r) + "Q" + f1(x + w) + " " + f1(y + h) + " " + f1(x + w - r) + " " + f1(y + h) + "H" + f1(x + r) + "Q" + f1(x) + " " + f1(y + h) + " " + f1(x) + " " + f1(y + h - r) + "V" + f1(y + r) + "Q" + f1(x) + " " + f1(y) + " " + f1(x + r) + " " + f1(y) + "Z";
  }
  function starD(cx, cy, R0, r0, n, rot) {
    var s = "";
    for (var i = 0; i < n * 2; i++) { var a = rad((rot || -90) + (i * 180) / n), rr = i % 2 ? r0 : R0; s += (i ? "L" : "M") + f1(cx + Math.cos(a) * rr) + " " + f1(cy + Math.sin(a) * rr); }
    return s + "Z";
  }
  // hand-inked polygon: jitter the corners a little (seeded), so lines are not machine straight
  function jit(pts, rnd, amt) { return pts.map(function (p) { return [p[0] + (rnd() - 0.5) * amt, p[1] + (rnd() - 0.5) * amt]; }); }
  // a wobbly line from a to b with n bends
  function wobLine(x1, y1, x2, y2, rnd, amt, n) {
    n = n || 3;
    var d = "M" + f1(x1) + " " + f1(y1);
    for (var i = 1; i <= n; i++) {
      var k = i / n, mx = lerp(x1, x2, k - 0.5 / n) + (rnd() - 0.5) * amt, my = lerp(y1, y2, k - 0.5 / n) + (rnd() - 0.5) * amt;
      d += "Q" + f1(mx) + " " + f1(my) + " " + f1(lerp(x1, x2, k)) + " " + f1(lerp(y1, y2, k));
    }
    return d;
  }

  // ------------------------- scene, layers, camera -------------------------
  var st = null, sceneCount = 0, PFX = "fs0";
  function U(id) { return "url(#" + PFX + id + ")"; }
  var EMPIRES = ["tech", "factory", "auto", "retail", "shipping", "finance", "energy", "food", "garage", "city"];
  var EMP_SYN = { software: "tech", internet: "tech", startup: "tech", campus: "tech", manufacturing: "factory", industry: "factory", industrial: "factory", car: "auto", cars: "auto", motors: "auto", automotive: "auto", store: "retail", stores: "retail", shop: "retail", shops: "retail", port: "shipping", ships: "shipping", logistics: "shipping", bank: "finance", banks: "finance", wallstreet: "finance", oil: "energy", power: "energy", restaurant: "food", farm: "food", home: "garage", workshop: "garage", suburb: "garage", town: "city", downtown: "city" };
  function empKey(n, def) { n = str(n).toLowerCase().replace(/[\s_-]+/g, ""); if (n === "none") return "none"; if (EMPIRES.indexOf(n) >= 0) return n; return EMP_SYN[n] || def || "city"; }
  var SKIES = {
    day: { top: "#B5CCD9", hor: "#E8EEEC", sun: "#F7E9BC", cloud: "#F8F6EF", tone: null },
    dawn: { top: "#ADADC9", hor: "#F2D2B2", sun: "#F6C79A", cloud: "#F5E2D6", tone: "rgba(236,160,130,0.10)" },
    sunset: { top: "#76658A", mid: "#D58A6C", hor: "#F2C188", sun: "#EE9656", cloud: "#EFB096", tone: "rgba(222,112,62,0.16)" },
    storm: { top: "#46505A", hor: "#858E95", cloud: "#59626B", tone: "rgba(36,46,58,0.36)" },
    night: { top: "#172138", hor: "#384563", cloud: "#3A4662", tone: "rgba(16,24,50,0.52)", moon: 1, stars: 1 },
  };
  function skyKey(n) { n = str(n).toLowerCase(); if (SKIES[n]) return n; if (/rain|crisis|dark|thunder/.test(n)) return "storm"; if (/eve|dusk|golden/.test(n)) return "sunset"; if (/morn|sunrise/.test(n)) return "dawn"; if (/moon|midnight/.test(n)) return "night"; return "day"; }
  function growthNum(g, def) {
    if (typeof g === "number") return clamp(g, 0, 1);
    g = str(g).toLowerCase();
    if (g === "small" || g === "early") return 0.22;
    if (g === "growing" || g === "medium") return 0.55;
    if (g === "full" || g === "big" || g === "all") return 1;
    var n = parseFloat(g);
    return isFinite(n) ? clamp(n > 1 ? n / 100 : n, 0, 1) : def;
  }

  function makeScene(o) {
    if (typeof o === "string") o = { empire: o };
    o = obj(o);
    var root = V.root();
    if (st && st.el && st.el.parentNode) st.el.parentNode.removeChild(st.el);
    sceneCount++;
    PFX = "fs" + sceneCount + "_";
    var Pt = V.isPortrait, SQ = V.isSquare, Ww = (1000 * W) / H;
    var s = {
      id: sceneCount, Ww: Ww, k: H / 1000, portrait: Pt, square: SQ,
      horizon: num(o.horizon, Pt ? 405 : SQ ? 330 : 300), G: num(o.ground, 1040),
      charScale: num(o.charScale, 1), sky: skyKey(o.sky), emp: empKey(o.empire, "city"),
      actors: [], anims: [], comps: [], segs: [], segSorted: true, shakes: [], userFrames: [], late: [], boxes: [], flashes: [],
      camBase: { x: Ww / 2, y: 500, z: 1 }, fin: false, uid: 0,
    };
    s.charH = (Pt ? 510 : SQ ? 640 : 720) * s.charScale;
    st = s;
    s.el = div("fs fs-sky-" + s.sky, root);
    var sv = { class: "fs-layer", width: W, height: H, viewBox: "0 0 " + W + " " + H };
    s.svg = svg("svg", sv, s.el);
    s.defs = svg("defs", null, s.svg);
    makeDefs(s);
    s.L = {};
    var order = [["sky", 0.04], ["hills", 0.18], ["ground", 0.5], ["far", 0.3], ["mid", 0.58], ["near", 0.82], ["tone", 1], ["props", 1], ["actors", 1], ["fx", 1], ["front", 1.1]];
    s.layers = [];
    order.forEach(function (q) { s.L[q[0]] = svg("g", { class: "fs-L-" + q[0] }, s.svg); s.layers.push([s.L[q[0]], q[1]]); });
    s.html = div("fs-whtml", s.el);
    s.layers.push([s.html, 1, true]);
    s.weather = svg("svg", sv, s.el);
    s.hud = div("fs-hud", s.el);
    s.ov = svg("svg", { class: "fs-layer fs-ov", width: W, height: H, viewBox: "0 0 " + W + " " + H }, s.el);
    s.ovDefs = svg("defs", null, s.ov);
    s.grain = div("fs-grain", s.el);
    drawSky(s);
    drawGround(s);
    s.empire = s.empireRec = buildEmpire(s, s.emp, { growth: growthNum(o.growth, 1), heroSide: o.heroSide });
    drawTone(s);
    s.camera = new Camera(s);
    V.onFrame(function (t) { if (st === s) frame(t); });
    return sceneApi(s);
  }
  function ensure() { if (!st) makeScene({ empire: "city" }); return st; }
  function uid(p) { var s = ensure(); return PFX + (p || "u") + ++s.uid; }

  function makeDefs(s) {
    var d = s.defs, night = s.sky === "night";
    function pat(id, w, h, inner, extra) {
      var p = svg("pattern", Object.assign({ id: PFX + id, width: w, height: h, patternUnits: "userSpaceOnUse" }, extra || {}), d);
      p.innerHTML = inner;
      return p;
    }
    pat("hatch", 6, 6, '<path d="M-1.5 1.5L1.5 -1.5M0 6L6 0M4.5 7.5L7.5 4.5" stroke="' + INK + '" stroke-width="0.9" stroke-opacity="0.42"/>');
    pat("hatchL", 5, 5, '<path d="M-1 1L1 -1M0 5L5 0M4 6L6 4" stroke="' + INK + '" stroke-width="0.6" stroke-opacity="0.26"/>');
    pat("hatchX", 7, 7, '<path d="M0 7L7 0M0 0L7 7" stroke="' + INK + '" stroke-width="0.7" stroke-opacity="0.35"/>');
    pat("win", 10, 12, R(2, 2, 5.6, 7, night ? "#F2D27A" : "#8FA7B4") + (night ? "" : R(2, 2, 2.2, 7, "#B9CBD3")), {});
    pat("winB", 8, 10, R(1.5, 1.5, 5, 6.5, night ? "#F5DC8E" : "#7E9BAB"));
    pat("plaid", 16, 16, R(0, 0, 16, 16, "#B7473A") + R(0, 6, 16, 4, "#8E2F28", 0, ' opacity="0.8"') + R(6, 0, 4, 16, "#8E2F28", 0, ' opacity="0.7"') + R(0, 12, 16, 1.2, "#E9C9A6", 0, ' opacity="0.7"') + R(12, 0, 1.2, 16, "#E9C9A6", 0, ' opacity="0.7"'));
    pat("pin", 7, 7, R(0, 0, 7, 7, "#3B3C43") + R(3, 0, 0.8, 7, "#8C8E98", 0, ' opacity="0.7"'));
    pat("rain", 60, 90, '<path d="M50 0L40 26M20 40L10 66M38 64L30 86" stroke="#D9E3EA" stroke-width="1.6" stroke-opacity="0.55" stroke-linecap="round"/>', { patternTransform: "translate(0 0)" });
  }

  function sceneApi(s) {
    var sc = {
      empireName: s.emp, sky: s.sky, Ww: s.Ww, G: s.G, horizon: s.horizon, portrait: s.portrait, square: s.square, charScale: s.charScale,
      cam: s.camera, hud: s.hud, html: s.html, el: s.el, propLayer: s.L.props, actorLayer: s.L.actors, fxLayer: s.L.fx, frontLayer: s.L.front,
      empire: s.empire.api,
      slots: function (n, spread) { return slots(s, n, spread); },
      heroX: function (side) { return heroX(s, side); },
      toScreen: function (x, y, t) { var c = camAt(s, t == null ? V.time() : t), m = layerM(s, c, 1); return [x * m[0] + m[1], y * m[0] + m[2]]; },
      onFrame: function (fn) { if (typeof fn === "function") s.userFrames.push(fn); },
      pop: function (g, x, y, scale, at) { return popGroup(s, g, x, y, scale, at); },
    };
    s.api = sc;
    return sc;
  }
  function heroX(s, side) {
    var left = side !== "right";
    if (s.portrait) return s.Ww * (left ? 0.3 : 0.7);
    if (s.square) return s.Ww * (left ? 0.21 : 0.79);
    return s.Ww * (left ? 0.2 : 0.8);
  }
  function slots(s, n, spread) {
    n = Math.max(1, Math.floor(num(n, 1)));
    var c = s.Ww / 2, usable = s.Ww * (s.portrait ? 0.78 : 0.7) * num(spread, 1), out = [];
    var step = n > 1 ? usable / (n - 1) : 0;
    for (var i = 0; i < n; i++) out.push(n > 1 ? c - usable / 2 + i * step : c);
    return out;
  }
  function popGroup(s, g, x, y, scale, at) {
    var a0 = tc0(num(at, 0)), sc = num(scale, 1);
    s.anims.push(function (t) {
      var k = popK(t, a0, 0.42);
      showEl(g, k > 0.001);
      if (k > 0.001) setA(g, "transform", "translate(" + f2(x) + " " + f2(y) + ") scale(" + f2(sc * lerp(0.7, 1, Math.min(1, k)) * 1000) / 1000 + " " + f2(sc * k * 1000) / 1000 + ")");
    });
    return g;
  }

  function Camera(s) { this.s = s; }
  var CP = Camera.prototype;
  CP.set = function (o) { o = obj(o); var b = this.s.camBase; if (o.x != null) b.x = num(o.x, b.x); if (o.y != null) b.y = num(o.y, b.y); if (o.zoom != null) b.z = num(o.zoom, 1); return this; };
  CP._seg = function (g) { g.i = this.s.segs.length; this.s.segs.push(g); this.s.segSorted = false; return this; };
  CP.to = function (tg, at, dur, ease) {
    var d = dur == null ? 1 : Math.max(0, num(dur, 1)), a = tc0(at);
    return this._seg({ at: a, dur: d, ease: EZ(ease || "inOutCubic"), tgt: camTarget(this.s, tg, a + d) });
  };
  CP.cut = function (tg, at) { return this.to(tg, at, 0); };
  CP.push = function (zoom, at, dur) {
    var z = num(zoom, 1.12);
    return this._seg({ at: tc0(at), dur: dur == null ? 1.6 : Math.max(0, num(dur, 1.6)), ease: EZ("inOutSine"), tgt: function (prev) { return { x: prev.x, y: prev.y, z: z }; } });
  };
  CP.rise = function (at, dur, o) {
    o = obj(o);
    var s = this.s, a = tc0(num(at, 0)), d = dur == null ? D * 0.85 : Math.max(0.2, num(dur, D * 0.85));
    var fy = num(o.fromY, 572), ty = num(o.toY, 492), fz = num(o.fromZoom, 1.1), tz = num(o.toZoom, 1.0);
    var x1 = o.x != null ? num(o.x, s.camBase.x) : null, x0 = o.fromX != null ? num(o.fromX, x1) : x1;
    var start = { y: fy, zoom: fz };
    if (x0 != null) start.x = x0;
    if (a <= 0.05) this.set(start);
    else this.cut(start, a);
    var end = { y: ty, zoom: tz };
    if (x1 != null) end.x = x1;
    return this.to(end, a, d, "inOutSine");
  };
  CP.focus = function (fig, at, dur, zoom, o) {
    o = obj(o);
    return this.to({ actor: fig, zoom: zoom == null ? 1.35 : zoom, dx: o.dx, dy: o.dy, focusY: o.focusY }, at, dur == null ? 0.9 : dur);
  };
  CP.shake = function (at, amp, dur) { this.s.shakes.push({ at: tc0(at), amp: num(amp, 12), dur: Math.max(0.05, num(dur, 0.45)) }); return this; };
  function camTarget(s, tg, tEnd) {
    tg = tg && tg.__fig ? { actor: tg } : obj(tg);
    if (tg.actor && tg.actor.__fig) {
      var a = tg.actor;
      return function (prev) {
        var z = num(tg.zoom, prev.z), hp = a.headRest(tEnd), x = hp[0] + num(tg.dx, 0);
        var y = hp[1] + (500 - num(tg.focusY, 0.42) * 1000) / z + num(tg.dy, 0);
        return { x: x, y: y, z: z };
      };
    }
    return function (prev) { return { x: tg.x != null ? num(tg.x, prev.x) : prev.x, y: tg.y != null ? num(tg.y, prev.y) : prev.y, z: tg.zoom != null ? num(tg.zoom, prev.z) : tg.z != null ? num(tg.z, prev.z) : prev.z }; };
  }
  function camAt(s, t) {
    if (s._ct === t && s._cv) return s._cv;
    if (!s.segSorted) { s.segs.sort(function (a, b) { return a.at - b.at || a.i - b.i; }); s.segSorted = true; }
    var v = { x: s.camBase.x, y: s.camBase.y, z: s.camBase.z }, moving = false;
    for (var i = 0; i < s.segs.length; i++) {
      var g = s.segs[i];
      if (t < g.at) break;
      var p = g.dur > 0 ? clamp((t - g.at) / g.dur, 0, 1) : 1, tg = g.tgt(v), e = g.ease(p);
      v = { x: lerp(v.x, tg.x, e), y: lerp(v.y, tg.y, e), z: lerp(v.z, tg.z, e) };
      if (g.dur > 0.05 && p < 1 && (Math.abs(tg.z - v.z) > 0.002 || Math.abs(tg.x - v.x) > 2 || Math.abs(tg.y - v.y) > 2)) moving = true;
    }
    v.z = clamp(v.z, 1, 3.5);
    var hw = s.Ww / 2 / v.z, hh = 500 / v.z;
    v.x = clamp(v.x, hw - 40, s.Ww + 40 - hw);
    v.y = clamp(v.y, hh - 60, 1060 - hh);
    v.x += 1.6 * Math.sin(t * 0.53 + 0.4) + 0.7 * Math.sin(t * 1.27);
    v.y += 1.1 * Math.sin(t * 0.77 + 1.3);
    var sx = 0, sy = 0;
    s.shakes.forEach(function (q, j) {
      if (t < q.at || t > q.at + q.dur) return;
      var k = Math.pow(1 - (t - q.at) / q.dur, 1.6) * u(q.amp);
      sx += k * Math.sin((t - q.at) * 71 + j * 1.7);
      sy += k * 0.8 * Math.cos((t - q.at) * 59 + j * 2.3);
      moving = true;
    });
    v.sx = sx; v.sy = sy; v.moving = moving;
    s._ct = t; s._cv = v;
    return v;
  }
  function layerM(s, c, f) {
    var zf = 1 + (c.z - 1) * f, sc = s.k * zf;
    var cx = s.Ww / 2 + (c.x - s.Ww / 2) * f, cy = 500 + (c.y - 500) * f;
    return [sc, W / 2 - cx * sc + c.sx, H / 2 - cy * sc + c.sy];
  }
  function toScr(s, c, x, y) { var m = layerM(s, c, 1); return [x * m[0] + m[1], y * m[0] + m[2], m[0]]; }

  function finalize(s) {
    s.fin = true;
    var late = s.late;
    s.late = [];
    late.forEach(function (fn) { try { fn(); } catch (e) { V.error("[origin-story] " + (e && e.message ? e.message : e)); } });
  }
  function frame(t) {
    var s = st;
    if (!s) return;
    if (!s.fin) finalize(s);
    var c = camAt(s, t);
    s.camNow = c;
    s.layers.forEach(function (ly) {
      var m = layerM(s, c, ly[1]), tr = "matrix(" + m[0].toFixed(5) + ",0,0," + m[0].toFixed(5) + "," + f2(m[1]) + "," + f2(m[2]) + ")";
      if (ly[2]) setS(ly[0], "transform", tr); else setA(ly[0], "transform", tr.replace(/,/g, " "));
    });
    setS(s.hud, "transform", "translate(" + f2(c.sx * 0.5) + "px," + f2(c.sy * 0.5) + "px)");
    for (var i = 0; i < s.anims.length; i++) s.anims[i](t, c);
    for (var j = 0; j < s.userFrames.length; j++) {
      try { s.userFrames[j](t); } catch (e) { V.error("[origin-story onFrame] " + (e && e.message ? e.message : e)); }
    }
  }

  // ------------------------- sky, hills, ground, tone -------------------------
  function drawSky(s) {
    var sk = SKIES[s.sky], Ww = s.Ww, hz = s.horizon, rnd = V.makeRand(41 + s.id), m = "";
    var gid = PFX + "skyg", g = svg("linearGradient", { id: gid, x1: 0, y1: 0, x2: 0, y2: 1 }, s.defs);
    svg("stop", { offset: "0", "stop-color": sk.top }, g);
    if (sk.mid) svg("stop", { offset: "0.62", "stop-color": sk.mid }, g);
    svg("stop", { offset: "1", "stop-color": sk.hor }, g);
    m += R(-Ww * 0.8, -500, Ww * 2.6, hz + 560, "url(#" + gid + ")");
    if (sk.stars) for (var i = 0; i < 70; i++) m += C(-Ww * 0.2 + rnd() * Ww * 1.4, -40 + rnd() * (hz - 40), 0.6 + rnd() * 1.3, "#F4EBD0", ' opacity="' + f2(0.4 + rnd() * 0.6) + '"');
    if (sk.moon) m += C(Ww * 0.76, hz * 0.32, 34, "#F1E6C6", SK(INK, 1.6)) + C(Ww * 0.76 + 14, hz * 0.32 - 8, 30, sk.top);
    else if (sk.sun) {
      var sy = s.sky === "sunset" ? hz - 46 : s.sky === "dawn" ? hz - 70 : hz * 0.36, sr = s.sky === "sunset" ? 74 : 44;
      m += C(Ww * 0.64, sy, sr * 1.5, sk.sun, ' opacity="0.28"') + C(Ww * 0.64, sy, sr, sk.sun, SK(shade(sk.sun, 0.75), 1.4));
    }
    s.L.sky.innerHTML = m;
    // clouds drift slowly (pure function of t)
    var clouds = [], nC = s.sky === "storm" ? 7 : s.sky === "night" ? 3 : 5;
    for (var k = 0; k < nC; k++) {
      var cg = svg("g", null, s.L.sky), cw = 90 + rnd() * 120, cm = "", cy0 = 30 + rnd() * (hz - 110);
      if (s.sky === "storm") { cw *= 1.8; cy0 = -20 + rnd() * (hz * 0.45); }
      var outl = "", body = "";
      for (var b = 0; b < 5; b++) {
        var bx = (b - 2) * cw * 0.2 + (rnd() - 0.5) * 10, br = cw * (0.16 + rnd() * 0.1) * (b === 2 ? 1.35 : 1);
        outl += E(bx, -br * 0.4, br, br * 0.78, sk.cloud, SK(shade(sk.cloud, 0.62), 3));
        body += E(bx, -br * 0.4, br, br * 0.78, sk.cloud);
      }
      outl += R(-cw * 0.62, -cw * 0.06, cw * 1.24, cw * 0.1, sk.cloud, cw * 0.05, SK(shade(sk.cloud, 0.62), 3));
      body += R(-cw * 0.62, -cw * 0.06, cw * 1.24, cw * 0.1, sk.cloud, cw * 0.05);
      cm = outl + body + P("M" + f1(-cw * 0.4) + " " + f1(-cw * 0.12) + "Q" + f1(-cw * 0.1) + " " + f1(-cw * 0.2) + " " + f1(cw * 0.2) + " " + f1(-cw * 0.13), "none", SK(shade(sk.cloud, 0.8), 1.4));
      cg.innerHTML = '<g opacity="' + (s.sky === "storm" ? 0.96 : 0.92) + '">' + cm + "</g>";
      clouds.push({ g: cg, x0: -Ww * 0.15 + rnd() * Ww * 1.3, y: cy0, sp: 3 + rnd() * 5 });
    }
    s.anims.push(function (t) { clouds.forEach(function (q) { setA(q.g, "transform", "translate(" + f1(q.x0 + q.sp * t) + " " + f1(q.y) + ")"); }); });
    // distant hills on the horizon
    var hm = "", hd = "M" + f1(-Ww * 0.6) + " " + f1(hz + 30), x = -Ww * 0.6;
    while (x < Ww * 1.6) { var nx = x + 60 + rnd() * 90; hd += "Q" + f1((x + nx) / 2) + " " + f1(hz - 14 - rnd() * 26) + " " + f1(nx) + " " + f1(hz + 2); x = nx; }
    hd += "L" + f1(Ww * 1.6) + " " + f1(hz + 420) + "L" + f1(-Ww * 0.6) + " " + f1(hz + 420) + "Z";
    var hc = s.sky === "night" ? "#2E3A55" : s.sky === "sunset" ? "#A6837F" : s.sky === "storm" ? "#6A737A" : "#A9B8B6";
    hm += P(hd, hc, SK(shade(hc, 0.75), 1.2));
    s.L.hills.innerHTML = hm;
    // weather (screen space, behind the HUD)
    if (s.sky === "storm") {
      var rainR = svg("rect", { x: 0, y: 0, width: W, height: H, fill: U("rain") }, s.weather), pt = s.defs.querySelector("#" + PFX + "rain");
      s.rainPat = pt;
      var flash = svg("rect", { x: 0, y: 0, width: W, height: H, fill: "#F4F2EA", opacity: 0 }, s.weather);
      var bolt = svg("path", { fill: "none", stroke: "#FFF6D8", "stroke-width": 5, "stroke-linejoin": "round", opacity: 0 }, s.L.sky);
      var times = [], tt = 0.9 + rnd() * 0.8;
      while (tt < D - 0.5) { times.push(tt); tt += 2.2 + rnd() * 2.4; }
      s.flashes = times;
      var bx0 = Ww * (0.55 + rnd() * 0.3), bd = "M" + f1(bx0) + " -40";
      for (var q = 1; q <= 6; q++) bd += "L" + f1(bx0 + (rnd() - 0.5) * 60 + q * 6) + " " + f1(-40 + q * (hz + 40) / 6);
      bolt.setAttribute("d", bd);
      s.anims.push(function (t) {
        setA(pt, "patternTransform", "translate(" + f1((-t * 260) % 60) + " " + f1((t * 900) % 90) + ")");
        var fl = 0;
        times.forEach(function (q0) { if (t >= q0 && t < q0 + 0.32) fl = Math.max(fl, Math.pow(1 - (t - q0) / 0.32, 2) * (t - q0 < 0.06 || t - q0 > 0.11 ? 1 : 0.35)); });
        setA(flash, "opacity", f2(fl * 0.42));
        setA(bolt, "opacity", f2(fl > 0.25 ? 1 : 0));
      });
      void rainR;
    }
  }
  var LAND = {
    fields: ["#A7B888", "#BCC58E", "#C8B888", "#9BAE83", "#B3A67D", "#D0C499", "#AFBF93"],
    city: ["#CEC6B5", "#C2BAA8", "#B8B2A5", "#D5CDBC", "#A9B78F", "#C9C0AE"],
    dry: ["#CDB88C", "#BFA97E", "#D8C79C", "#C4B48C", "#B6A47C"],
    lawn: ["#9FB585", "#AFC290", "#93AA7E", "#B7C496", "#A5B689"],
  };
  var EMP_LAND = { tech: "city", factory: "fields", auto: "fields", retail: "lawn", shipping: "city", finance: "city", energy: "dry", food: "fields", garage: "lawn", city: "city", none: "fields" };
  function drawGround(s) {
    var Ww = s.Ww, hz = s.horizon, rnd = V.makeRand(73 + EMPIRES.indexOf(s.emp) * 7), pal = LAND[EMP_LAND[s.emp] || "fields"], m = "";
    var vx = Ww / 2, vy = hz - 70, bot = 1180, nb = 9, nc = 13, xs = [];
    for (var i = 0; i <= nc; i++) xs.push(vx + (i - nc / 2) * Ww * 0.36 + (rnd() - 0.5) * 40);
    function at(xb, y) { var k = (y - vy) / (bot - vy); return vx + (xb - vx) * k; }
    var ys = [];
    for (var j = 0; j <= nb; j++) ys.push(hz + (bot - hz) * Math.pow(j / nb, 1.7));
    m += R(-Ww * 0.8, hz - 2, Ww * 2.6, bot - hz + 200, pal[0]);
    var water = s.emp === "shipping" ? hz + (bot - hz) * 0.46 : null;
    for (j = 0; j < nb; j++) for (i = 0; i < nc; i++) {
      var y0 = ys[j], y1 = ys[j + 1];
      if (water != null && y0 >= water - 1) continue;
      var c = pal[Math.floor(rnd() * pal.length)];
      var q = [[at(xs[i], y0), y0], [at(xs[i + 1], y0), y0], [at(xs[i + 1], y1), y1], [at(xs[i], y1), y1]];
      m += P(poly(q), c, SK(shade(c, 0.82), 0.9));
      if (rnd() < 0.35 && pal !== LAND.city) {
        // furrows
        for (var f = 1; f < 4; f++) { var yy = lerp(y0, y1, f / 4); m += L(at(xs[i], yy) + 3, yy, at(xs[i + 1], yy) - 3, yy, shade(c, 0.85), 0.8); }
      }
    }
    if (water != null) {
      m += R(-Ww * 0.8, water, Ww * 2.6, bot - water + 200, "#8DAFBF") + R(-Ww * 0.8, water - 6, Ww * 2.6, 8, "#B9B1A0", 0, SK(INK, 1.2));
      for (var w = 0; w < 26; w++) { var wy = water + 14 + rnd() * (bot - water - 30), wx = rnd() * Ww * 1.4 - Ww * 0.2; m += L(wx, wy, wx + 20 + rnd() * 30, wy, "#C9DCE2", 1.4); }
    }
    // roads: two radial roads and one cross road, grey with dashed centre lines
    var roads = [xs[Math.floor(nc * 0.32)], xs[Math.floor(nc * 0.7)]];
    roads.forEach(function (xb) {
      var yEnd = water != null ? water - 6 : bot;
      m += P("M" + f1(at(xb - 26, hz)) + " " + f1(hz) + "L" + f1(at(xb + 26, hz)) + " " + f1(hz) + "L" + f1(at(xb + 26, yEnd)) + " " + f1(yEnd) + "L" + f1(at(xb - 26, yEnd)) + " " + f1(yEnd) + "Z", "#9C988F", SK(shade("#9C988F", 0.75), 1));
      m += '<path d="M' + f1(at(xb, hz)) + " " + f1(hz) + "L" + f1(at(xb, yEnd)) + " " + f1(yEnd) + '" stroke="#EDE6D3" stroke-width="2" stroke-dasharray="10 12" fill="none"/>';
    });
    var cy = ys[3];
    m += R(-Ww * 0.8, cy - 5, Ww * 2.6, 10, "#9C988F", 0, SK(shade("#9C988F", 0.75), 1));
    s.L.ground.innerHTML = m;
  }
  function drawTone(s) {
    var sk = SKIES[s.sky];
    if (sk.tone) svg("rect", { x: -4000, y: -4000, width: 9000, height: 9000, fill: sk.tone }, s.L.tone);
  }

  // ------------------------- buildings (local units: base centre at 0,0; up is -y) -------------------------
  var O = SK(INK, 2.2), O1 = SK(INK, 1.4);
  function wash(pts, col) { return P(poly(pts.map(function (p) { return [p[0] + 2.2, p[1] + 1.6]; })), shade(col, 0.82), ' opacity="0.35"'); }
  // three-quarter aerial box: front face, right side face (hatched), roof
  function box3(rnd, x0, w, h, d, col, o) {
    o = o || {};
    var dx = d * 0.5, dy = d * 0.42, j = o.j == null ? 1.1 : o.j;
    var front = jit([[x0, 0], [x0 + w, 0], [x0 + w, -h], [x0, -h]], rnd, j);
    var side = [front[1], [x0 + w + dx, -dy], [x0 + w + dx, -h - dy], front[2]];
    var top = [front[3], front[2], side[2], [x0 + dx + (rnd() - 0.5) * j, -h - dy]];
    var m = wash(front, col) + P(poly(front), col, O);
    if (o.win) m += R(x0 + w * 0.1, -h + Math.min(10, h * 0.1), w * 0.8, Math.max(0, h * (o.winH || 0.8) - 6), U(o.win === "b" ? "winB" : "win"));
    if (o.door) m += R(x0 + w * 0.42, -Math.min(16, h * 0.3), w * 0.16, Math.min(16, h * 0.3), shade(col, 0.55), 0, O1);
    m += P(poly(side), shade(col, 0.76), O) + P(poly(side), U("hatch"));
    if (!o.noTop) m += P(poly(top), o.roof || tint(col, 0.28), O);
    return m;
  }
  function cyl(x, w, h, col, o) {
    o = o || {};
    var rx = w / 2, ry = w * 0.18;
    var m = P("M" + f1(x - rx) + " " + f1(-h) + "V0A" + f1(rx) + " " + f1(ry) + " 0 0 0 " + f1(x + rx) + " 0V" + f1(-h) + "Z", col, O);
    m += P("M" + f1(x + rx * 0.3) + " " + f1(-h + ry) + "V" + f1(ry * 0.8) + "A" + f1(rx) + " " + f1(ry) + " 0 0 0 " + f1(x + rx) + " 0V" + f1(-h) + "Z", U("hatch"));
    m += o.dome ? P("M" + f1(x - rx) + " " + f1(-h) + "Q" + f1(x) + " " + f1(-h - w * 0.62) + " " + f1(x + rx) + " " + f1(-h) + "Z", tint(col, 0.2), O) : E(x, -h, rx, ry, tint(col, 0.3), O);
    return m;
  }
  function animTag(kind, attrs, inner) {
    var s_ = '<g class="fs-anim" data-k="' + kind + '"';
    for (var k in attrs) s_ += " data-" + k + '="' + attrs[k] + '"';
    return s_ + ">" + inner + "</g>";
  }
  function smoke(x, y, col, n, big) {
    var m = "";
    for (var i = 0; i < (n || 3); i++) m += animTag("smoke", { ph: f2(i / (n || 3)), x: x, y: y, big: big || 1 }, C(0, 0, 6 * (big || 1), col || "#E9E4DA", SK(shade(col || "#E9E4DA", 0.7), 1)));
    return m;
  }
  var BCOL = ["#CFC5B2", "#B7C3C6", "#D4C6AC", "#A8B6BC", "#C9B8A0", "#BFC6BA"];
  var BUILD = {
    office: function (rnd) {
      var w = 52 + rnd() * 26, h = 100 + rnd() * 70, col = BCOL[Math.floor(rnd() * BCOL.length)];
      return { w: w + 20, h: h + 22, m: box3(rnd, -w / 2, w, h, 30, col, { win: 1 }) + '<g transform="translate(' + f1(w * 0.02) + " " + f1(-h - 6) + ')">' + box3(rnd, -w * 0.2, w * 0.3, 8, 10, shade(col, 0.9), {}) + "</g>" };
    },
    skyscraper: function (rnd) {
      var w = 40 + rnd() * 18, h = 210 + rnd() * 110, col = ["#9DB4C0", "#B6BFC2", "#A3AFB8", "#C7C0B0"][Math.floor(rnd() * 4)], h2 = h * 0.28;
      var m = box3(rnd, -w / 2, w, h - h2, 26, col, { win: "b", winH: 0.92 }) + '<g transform="translate(0 ' + f1(-(h - h2)) + ')">' + box3(rnd, -w * 0.34, w * 0.68, h2, 18, tint(col, 0.1), { win: "b", winH: 0.9 }) + "</g>";
      m += L(w * 0.02, -h - 6, w * 0.02, -h - 40, INK, 2) + animTag("blink", { ph: f2(rnd()) }, C(w * 0.02, -h - 41, 2.6, ACC));
      return { w: w + 16, h: h + 44, m: m };
    },
    tower: function (rnd) {
      var w = 68, h = 300, col = "#93AFBE";
      var m = box3(rnd, -w / 2, w, h * 0.72, 34, col, { win: "b", winH: 0.94 }) + '<g transform="translate(0 ' + f1(-h * 0.72) + ')">' + box3(rnd, -w * 0.38, w * 0.76, h * 0.2, 24, tint(col, 0.12), { win: "b" }) + P("M" + f1(-w * 0.38) + " " + f1(-h * 0.2) + "L" + f1(w * 0.06) + " " + f1(-h * 0.2 - 40) + "L" + f1(w * 0.5) + " " + f1(-h * 0.2 - 10) + "L" + f1(w * 0.38) + " " + f1(-h * 0.2) + "Z", "#C9D6DC", O) + "</g>";
      m += L(w * 0.06, -h - 12, w * 0.06, -h - 64, INK, 2.4) + animTag("wave", { cx: f1(w * 0.06), cy: f1(-h - 62) }, P("M" + f1(w * 0.06) + " " + f1(-h - 62) + "Q" + f1(w * 0.3) + " " + f1(-h - 70) + " " + f1(w * 0.5) + " " + f1(-h - 60) + "L" + f1(w * 0.5) + " " + f1(-h - 46) + "Q" + f1(w * 0.3) + " " + f1(-h - 54) + " " + f1(w * 0.06) + " " + f1(-h - 48) + "Z", ACC, O1));
      return { w: w + 22, h: h + 66, m: m };
    },
    factory: function (rnd) {
      var w = 120 + rnd() * 40, h = 44 + rnd() * 12, col = ["#B86A52", "#A9614A", "#B7A58A", "#9FAEB3"][Math.floor(rnd() * 4)], m = "";
      var cx = -w * 0.32, cw = 12;
      m += cyl(cx, cw, h + 70, "#B9AFA2") + R(cx - cw / 2, -h - 70, cw, 8, ACC, 0, O1);
      m += smoke(cx, -h - 76, "#E6E1D7", 3, 1);
      m += box3(rnd, -w / 2, w, h, 52, col, { win: "b", winH: 0.55, noTop: true });
      var n = Math.max(3, Math.round(w / 30)), sw = w / n, dx = 26, dy = 22;
      for (var i = n - 1; i >= 0; i--) {
        var x0 = -w / 2 + i * sw;
        m += P(poly([[x0 + dx, -h - dy], [x0 + dx + sw, -h - dy], [x0 + dx + sw, -h - dy - 22], [x0 + dx, -h - dy]]), "#9FB6C0", O1);
        m += P(poly([[x0, -h], [x0 + sw, -h], [x0 + sw + dx, -h - dy - 22], [x0 + dx, -h - dy]]), tint(col, 0.22), O);
      }
      var cx2 = w * 0.2;
      m += cyl(cx2, 10, h + 92, "#C8BFB2") + R(cx2 - 5, -h - 92, 10, 7, ACC, 0, O1) + smoke(cx2, -h - 98, "#ECE8DF", 3, 1.15);
      return { w: w + 34, h: h + 120, m: m };
    },
    warehouse: function (rnd) {
      var w = 100 + rnd() * 40, h = 34 + rnd() * 10, col = ["#B9A88C", "#9FAFB5", "#C5B9A2"][Math.floor(rnd() * 3)], m = box3(rnd, -w / 2, w, h, 60, col, { roof: "#D9D2C2" });
      for (var i = 0; i < 3; i++) { var dx_ = -w / 2 + w * (0.15 + i * 0.27); m += R(dx_, -h * 0.62, w * 0.16, h * 0.62, shade(col, 0.7), 0, O1) + L(dx_ + 2, -h * 0.42, dx_ + w * 0.16 - 2, -h * 0.42, shade(col, 0.55), 1) + L(dx_ + 2, -h * 0.22, dx_ + w * 0.16 - 2, -h * 0.22, shade(col, 0.55), 1); }
      return { w: w + 30, h: h + 26, m: m };
    },
    campus: function (rnd) {
      var rx = 96, ry = 30, h = 26, m = "";
      m += P("M" + -rx + " " + -h + "V0A" + rx + " " + ry + " 0 0 0 " + rx + " 0V" + -h + "Z", "#A9C3CC", O) + P("M" + -rx + " " + -h + "V0A" + rx + " " + ry + " 0 0 0 " + rx + " 0V" + -h + "Z", U("winB"), "");
      m += E(0, -h, rx, ry, "#B8C79A", O) + E(0, -h, rx * 0.58, ry * 0.52, "#CFDDB0", O1);
      for (var i = 0; i < 5; i++) { var a = (i / 5) * 2 * PI, tx = Math.cos(a) * rx * 0.32, ty = -h + Math.sin(a) * ry * 0.26; m += C(tx, ty - 4, 6, "#7F9C68", O1); }
      return { w: rx * 2 + 10, h: h + ry + 10, m: m };
    },
    datacenter: function (rnd) {
      var w = 100 + rnd() * 20, h = 26, col = "#BFC4C2", m = box3(rnd, -w / 2, w, h, 50, col, { roof: "#D7DAD6" });
      for (var i = 0; i < 3; i++) { var fx = -w / 2 + 22 + i * 30 + 13, fy = -h - 10; m += E(fx, fy, 9, 4, "#9AA3A5", O1) + animTag("spinE", { cx: fx, cy: fy, sp: f2(0.8 + rnd()) }, L(fx - 8, fy, fx + 8, fy, INK, 1.4)); }
      for (var j = 0; j < 6; j++) m += R(-w / 2 + 6 + j * (w / 6.2), -h * 0.7, w / 9, h * 0.5, "#7F8E96", 0, ' opacity="0.8"');
      return { w: w + 30, h: h + 30, m: m };
    },
    store: function (rnd) {
      var w = 60 + rnd() * 20, h = 36, col = ["#E2D3B5", "#D4C4A3", "#CBD3CB"][Math.floor(rnd() * 3)], aw = rnd() < 0.5 ? ACC : "#3E6E8E";
      var m = box3(rnd, -w / 2, w, h, 34, col, {});
      m += R(-w * 0.42, -h * 0.5, w * 0.84, h * 0.4, "#A3BBC6", 0, O1);
      var n = 6, ax = -w / 2 - 2, sw = (w + 4) / n;
      for (var i = 0; i < n; i++) m += P(poly([[ax + i * sw, -h * 0.62], [ax + (i + 1) * sw, -h * 0.62], [ax + (i + 1) * sw + 2, -h * 0.48], [ax + i * sw + 2, -h * 0.48]]), i % 2 ? "#F2EADA" : aw, O1);
      m += R(-w * 0.32, -h - 2, w * 0.64, 10, aw, 2, O1);
      return { w: w + 20, h: h + 18, m: m };
    },
    mall: function (rnd) {
      var w = 150 + rnd() * 30, h = 42, col = "#D6CCB8", m = "";
      m += P(poly([[-w / 2 - 10, 16], [w / 2 + 30, 16], [w / 2 + 22, 4], [-w / 2 - 2, 4]]), "#9E9A92", O1);
      for (var k = 0; k < 9; k++) m += L(-w / 2 + k * (w / 8), 6, -w / 2 + k * (w / 8) - 3, 15, "#EDE6D3", 1.2);
      m += box3(rnd, -w / 2, w, h, 56, col, { roof: "#E3DCCD" });
      m += P(poly([[-22, 0], [22, 0], [22, -h * 0.7], [0, -h - 14], [-22, -h * 0.7]]), "#A9C3CC", O) + P(poly([[-22, 0], [22, 0], [22, -h * 0.7], [0, -h - 14], [-22, -h * 0.7]]), U("winB"));
      m += R(-w * 0.44, -h * 0.55, w * 0.26, h * 0.3, "#A9C3CC", 0, O1) + R(w * 0.18, -h * 0.55, w * 0.26, h * 0.3, "#A9C3CC", 0, O1);
      return { w: w + 40, h: h + 34, m: m };
    },
    house: function (rnd) {
      var w = 34 + rnd() * 10, h = 22, col = ["#E8DCC4", "#D8C9AC", "#CFD7D0", "#E3CFC0"][Math.floor(rnd() * 4)], rc = ["#A9614A", "#7E6A5E", "#8E5040"][Math.floor(rnd() * 3)];
      var m = box3(rnd, -w / 2, w, h, 26, col, { noTop: true });
      m += P(poly([[-w / 2 - 3, -h], [w / 2 + 3, -h], [w / 2 + 13, -h - 18], [-w / 2 + 10, -h - 18]]), rc, O) + P(poly([[w / 2 + 3, -h], [w / 2 + 16, -h - 11], [w / 2 + 13, -h - 18]]), shade(rc, 0.8), O1);
      m += R(-w * 0.14, -12, 7, 12, "#7A5A44", 0, O1) + R(-w * 0.42, -15, 7, 6, "#A3BBC6", 0, O1) + R(w * 0.2, -15, 7, 6, "#A3BBC6", 0, O1);
      return { w: w + 22, h: h + 22, m: m };
    },
    garage: function (rnd) {
      var m = BUILD.house(rnd).m, gw = 30, col = "#D9CDB5";
      m += '<g transform="translate(36 0)">' + box3(rnd, -gw / 2, gw, 20, 24, col, { roof: "#8E7A6A" }) + R(-gw * 0.38, -15, gw * 0.76, 15, "#B9B0A0", 0, O1) + L(-gw * 0.38, -10, gw * 0.38, -10, INK, 0.8) + L(-gw * 0.38, -5, gw * 0.38, -5, INK, 0.8) + "</g>";
      return { w: 100, h: 46, m: m };
    },
    workshop: function (rnd) {
      var w = 70, h = 40, col = "#C9B595", m = box3(rnd, -w / 2, w, h, 36, col, { noTop: true });
      m += P(poly([[-w / 2 - 4, -h], [w / 2 + 4, -h], [w / 2 + 22, -h - 24], [-w / 2 + 14, -h - 24]]), "#8E5A46", O);
      m += R(-w * 0.34, -h * 0.72, w * 0.68, h * 0.72, "#B4AB9A", 0, O1);
      for (var i = 1; i < 5; i++) m += L(-w * 0.34, -h * 0.72 + i * h * 0.14, w * 0.34, -h * 0.72 + i * h * 0.14, INK, 0.8);
      m += C(w * 0.42, -h - 8, 3, "#F2D27A", O1);
      return { w: w + 30, h: h + 30, m: m };
    },
    crane: function (rnd) {
      var h = 110 + rnd() * 30, col = rnd() < 0.5 ? "#C8503C" : "#D29B3C", m = "";
      m += L(-26, 0, -14, -h, col, 6) + L(26, 0, 14, -h, col, 6) + L(-26, 0, -14, -h, INK, 1.2) + L(26, 0, 14, -h, INK, 1.2) + L(-20, -h * 0.5, 20, -h * 0.5, col, 4);
      m += R(-40, -h - 8, 140, 10, col, 0, O) + R(-20, -h - 22, 26, 16, tint(col, 0.3), 0, O1);
      m += animTag("slide", { amp: 30, sp: f2(0.25 + rnd() * 0.2), ph: f2(rnd() * 6) }, R(46, -h + 2, 14, 9, "#5C6A72", 0, O1) + L(53, -h + 11, 53, -h + 46, INK, 1.1) + R(46, -h + 46, 14, 8, "#3E6E8E", 0, O1));
      return { w: 150, h: h + 24, m: m, dx: 30 };
    },
    containers: function (rnd) {
      var cols = ["#C8503C", "#3E6E8E", "#D29B3C", "#5F8A55", "#8C6A9E", "#B7473A"], m = "";
      for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) {
        if (r === 2 && rnd() < 0.4) continue;
        m += '<g transform="translate(' + f1(-48 + c * 32 + r * 4) + " " + f1(-r * 13) + ')">' + box3(rnd, 0, 30, 13, 14, cols[Math.floor(rnd() * cols.length)], { j: 0.4 }) + "</g>";
      }
      return { w: 110, h: 50, m: m };
    },
    ship: function (rnd) {
      var w = 190, m = "", hull = "#3D4650", cols = ["#C8503C", "#3E6E8E", "#D29B3C", "#5F8A55"];
      var inner = "";
      for (var c = 0; c < 6; c++) for (var r = 0; r < 2; r++) inner += R(-w * 0.32 + c * 20, -26 - r * 11, 19, 10, cols[(c + r * 2) % 4], 0, O1);
      inner += R(-w * 0.46, -44, 26, 30, "#E8E2D4", 0, O1) + R(-w * 0.44, -40, 20, 6, "#7E9BAB");
      inner += P("M" + f1(-w / 2) + " -16H" + f1(w / 2 + 12) + "L" + f1(w / 2 - 6) + " 6H" + f1(-w / 2 + 8) + "Z", hull, O) + R(-w / 2 + 6, -8, w - 4, 4, ACC);
      m += E(0, 6, w * 0.6, 8, "#7FA2B4") + animTag("bob", { amp: 2.2, sp: 0.9 }, inner);
      return { w: w + 30, h: 56, m: m };
    },
    bank: function (rnd) {
      var w = 96, h = 56, col = "#E4DAC6", m = "";
      m += R(-w / 2 - 8, -8, w + 16, 8, shade(col, 0.88), 0, O) + R(-w / 2 - 4, -14, w + 8, 6, shade(col, 0.94), 0, O1);
      m += R(-w / 2, -h, w, h - 14, tint(col, 0.2), 0, O);
      for (var i = 0; i < 6; i++) { var cx = -w / 2 + 8 + i * ((w - 16) / 5); m += R(cx - 4, -h + 4, 8, h - 18, "#F2EBDD", 0, O1) + L(cx, -h + 6, cx, -16, shade(col, 0.8), 0.8); }
      m += P(poly([[-w / 2 - 8, -h], [w / 2 + 8, -h], [0, -h - 28]]), col, O) + P(poly([[-w / 2 + 6, -h - 4], [w / 2 - 6, -h - 4], [0, -h - 21]]), shade(col, 0.9), O1);
      return { w: w + 20, h: h + 30, m: m };
    },
    tank: function (rnd) {
      var m = "";
      [[-26, 46, 30], [26, 40, 26]].forEach(function (q) { m += cyl(q[0], q[1], q[2], "#E6E2D8") + P("M" + f1(q[0] - q[1] / 2) + " " + f1(-q[2] * 0.2) + "L" + f1(q[0] + q[1] / 2) + " " + f1(-q[2] * 0.85), "none", SK(MUTED, 1)); });
      return { w: 110, h: 44, m: m };
    },
    derrick: function (rnd) {
      var h = 96, m = "";
      m += P("M-18 0L-3 " + -h + "H3L18 0", "none", SK(INK, 2.4));
      for (var i = 1; i < 6; i++) { var y = -h * (i / 6), x = 18 - 15 * (i / 6); m += L(-x, y, x, y, INK, 1.2) + (i < 5 ? L(-x, y, x - 2.5, y - h / 6, INK, 0.9) : ""); }
      m += R(-5, -h - 8, 10, 8, ACC, 0, O1);
      m += '<g transform="translate(46 0)">' + R(-20, -6, 40, 6, "#6E6A64", 0, O1) + L(-4, -6, -4, -30, INK, 3) + animTag("nod", { cx: -4, cy: -30, amp: 14, sp: 1.1 }, P("M-30 -32L22 -30L24 -24L-28 -26Z", "#D29B3C", O1) + P("M22 -34Q34 -30 26 -18L20 -22Z", "#5C6A72", O1)) + "</g>";
      return { w: 120, h: h + 10, m: m };
    },
    turbine: function (rnd) {
      var h = 150 + rnd() * 30, m = "";
      m += P("M-3 0L-1.5 " + -h + "H1.5L3 0Z", "#EEEBE3", O1) + E(2, -h, 7, 4.5, "#EEEBE3", O1);
      var bl = "";
      for (var i = 0; i < 3; i++) bl += '<path d="M0 0Q4 -24 1 -62Q-3 -24 0 0Z" fill="#F4F1EA" stroke="' + INK + '" stroke-width="1.2" transform="rotate(' + i * 120 + ')"/>';
      m += '<g transform="translate(-4 ' + f1(-h) + ')">' + animTag("spin", { cx: 0, cy: 0, sp: f2(0.25 + rnd() * 0.15) }, bl) + C(0, 0, 3.4, "#D5D0C4", O1) + "</g>";
      return { w: 130, h: h + 66, m: m };
    },
    cooling: function (rnd) {
      var h = 90, m = P("M-34 0Q-20 " + f1(-h * 0.5) + " -24 " + -h + "H24Q20 " + f1(-h * 0.5) + " 34 0Z", "#D9D3C6", O) + P("M8 0Q18 " + f1(-h * 0.5) + " 14 " + -h + "H24Q20 " + f1(-h * 0.5) + " 34 0Z", U("hatch")) + E(0, -h, 24, 5, "#BDB6A8", O1);
      m += smoke(0, -h - 6, "#F2EFE9", 4, 2.1);
      return { w: 84, h: h + 70, m: m };
    },
    refinery: function (rnd) {
      var m = "";
      [[-30, 14, 70], [-10, 10, 92], [10, 16, 60], [30, 8, 104]].forEach(function (q) { m += cyl(q[0], q[1], q[2], "#CFCAC0"); for (var y = -q[2] + 14; y < -6; y += 18) m += L(q[0] - q[1] / 2 - 2, y, q[0] + q[1] / 2 + 2, y, INK, 1); });
      m += L(-30, -40, 30, -40, "#8E8A82", 3) + L(-10, -24, 30, -24, "#8E8A82", 3);
      m += animTag("flame", { cx: 30, cy: -108 }, P("M30 -106Q24 -116 30 -128Q36 -116 30 -106Z", "#E8964A", O1));
      return { w: 90, h: 132, m: m };
    },
    silo: function (rnd) {
      var m = "";
      [[-22, 22, 78], [0, 22, 90], [22, 22, 72]].forEach(function (q) { m += cyl(q[0], q[1], q[2], "#D8D2C4", { dome: true }); for (var y = -q[2] + 16; y < 0; y += 16) m += L(q[0] - 11, y, q[0] + 11, y, shade("#D8D2C4", 0.75), 0.8); });
      return { w: 80, h: 106, m: m };
    },
    barn: function (rnd) {
      var w = 64, h = 34, col = "#A9473A", m = box3(rnd, -w / 2, w, h, 40, col, { noTop: true });
      m += P(poly([[-w / 2 - 2, -h], [-w / 2 + 6, -h - 16], [0, -h - 26], [w / 2 - 6, -h - 16], [w / 2 + 2, -h]]), "#6E4A3E", O) + P(poly([[w / 2 + 2, -h], [w / 2 - 6, -h - 16], [w / 2 + 14, -h - 32], [w / 2 + 20, -h - 18]]), shade("#6E4A3E", 0.85), O1);
      m += R(-12, -24, 24, 24, "#F1E8D8", 0, O1) + L(-12, -24, 12, 0, col, 2.4) + L(12, -24, -12, 0, col, 2.4);
      return { w: w + 26, h: h + 30, m: m };
    },
    restaurant: function (rnd) {
      var w = 70, h = 32, col = "#EADBC0", m = box3(rnd, -w / 2, w, h, 34, col, { roof: "#C8503C" });
      m += R(-w * 0.42, -h * 0.7, w * 0.84, h * 0.4, "#A3BBC6", 0, O1) + R(-w / 2, -h * 0.82, w, 5, ACC);
      m += L(w * 0.36, -h - 6, w * 0.36, -h - 40, INK, 2) + '<g transform="translate(' + f1(w * 0.36) + " " + f1(-h - 52) + ') scale(0.24)">' + sketchMarkup("burger", "#D29B3C", true) + "</g>";
      return { w: w + 24, h: h + 66, m: m };
    },
    watertower: function (rnd) {
      var m = L(-14, 0, -10, -54, INK, 2) + L(14, 0, 10, -54, INK, 2) + L(-12, -26, 12, -26, INK, 1.2) + L(-12, -26, 11, -50, INK, 0.8);
      m += '<g transform="translate(0 -54)">' + cyl(0, 34, 22, "#C9C3B4", { dome: true }) + "</g>";
      return { w: 44, h: 96, m: m };
    },
    trees: function (rnd) {
      var m = "", n = 3 + Math.floor(rnd() * 3);
      for (var i = 0; i < n; i++) { var x = (i - (n - 1) / 2) * 14 + (rnd() - 0.5) * 6, r = 9 + rnd() * 5, c = ["#7F9C68", "#8EA874", "#6F8C5E"][Math.floor(rnd() * 3)]; m += L(x, 0, x, -r, "#6E5A48", 2) + C(x, -r - 6, r, c, O1) + P("M" + f1(x - r * 0.2) + " " + f1(-r - 6) + "a" + f1(r * 0.8) + " " + f1(r * 0.8) + " 0 0 0 " + f1(r * 0.9) + " " + f1(r * 0.4), "none", SK(shade(c, 0.7), 0.9)); }
      return { w: n * 14 + 16, h: 34, m: m };
    },
    track: function (rnd) {
      var m = E(0, 0, 120, 30, "#8E8A84", O) + E(0, 0, 96, 19, "#A7B888", O1) + '<ellipse cx="0" cy="0" rx="108" ry="24.5" fill="none" stroke="#EDE6D3" stroke-width="1.4" stroke-dasharray="7 8"/>';
      m += animTag("orbit", { rx: 108, ry: 24.5, sp: 0.18 }, R(-6, -3, 12, 6, ACC, 2, O1));
      return { w: 250, h: 34, m: m, flat: true };
    },
    carlot: function (rnd) {
      var m = P(poly([[-70, 12], [70, 12], [60, -14], [-60, -14]]), "#A09C94", O1), cols = ["#C8503C", "#3E6E8E", "#E6E1D6", "#5F8A55", "#2B2420", "#D29B3C"];
      for (var r = 0; r < 3; r++) for (var c = 0; c < 9; c++) { var x = -58 + c * 13.5 + r * 3, y = -10 + r * 8; m += R(x, y, 9, 5, cols[Math.floor(rnd() * cols.length)], 1.2, SK(INK, 0.7)); }
      return { w: 150, h: 26, m: m, flat: true };
    },
    lot: function (rnd) {
      var m = P(poly([[-60, 10], [60, 10], [50, -12], [-50, -12]]), "#A09C94", O1);
      for (var c = 0; c < 10; c++) m += L(-50 + c * 11, -10, -54 + c * 11.5, 8, "#EDE6D3", 1);
      return { w: 130, h: 24, m: m, flat: true };
    },
    lab: function (rnd) {
      var w = 80, h = 40, col = "#DCD6CA", m = box3(rnd, -w / 2, w, h, 40, col, { win: 1, winH: 0.6 });
      m += P("M" + f1(w * 0.02) + " " + f1(-h - 8) + "A26 26 0 0 1 " + f1(w * 0.02 + 52) + " " + f1(-h - 8) + "Z", "#C9CED0", O) + L(w * 0.02 + 26, -h - 34, w * 0.02 + 40, -h - 50, INK, 3);
      return { w: w + 30, h: h + 54, m: m };
    },
  };
  // the burger, chip etc. sketches used by buildings and cards (defined later); a stub until then
  var sketchMarkup = function () { return ""; };

  var PRESETS = {
    tech: { hero: "campus", near: ["office", "datacenter", "trees", "skyscraper"], mid: ["office", "skyscraper", "datacenter", "trees", "campus"], far: ["office", "skyscraper", "house", "trees"] },
    factory: { hero: "factory", near: ["factory", "warehouse", "watertower", "trees"], mid: ["factory", "warehouse", "tank", "trees", "watertower"], far: ["factory", "warehouse", "house", "trees"] },
    auto: { hero: "factory", near: ["warehouse", "factory", "factory", "trees", "watertower"], mid: ["factory", "track", "warehouse", "carlot", "watertower"], far: ["factory", "warehouse", "house", "trees"] },
    retail: { hero: "mall", near: ["store", "warehouse", "store", "trees"], mid: ["store", "mall", "house", "trees", "warehouse"], far: ["store", "house", "trees", "office"] },
    shipping: { hero: "crane", near: ["containers", "crane", "warehouse"], mid: ["containers", "crane", "warehouse", "tank"], far: ["warehouse", "office", "tank"], water: ["ship"] },
    finance: { hero: "tower", near: ["bank", "office", "trees"], mid: ["skyscraper", "office", "bank", "skyscraper"], far: ["skyscraper", "office", "office"] },
    energy: { hero: "cooling", near: ["tank", "derrick", "refinery"], mid: ["turbine", "tank", "refinery", "derrick", "cooling"], far: ["turbine", "tank", "derrick"] },
    food: { hero: "silo", near: ["restaurant", "barn", "trees", "silo"], mid: ["barn", "silo", "factory", "trees", "restaurant"], far: ["barn", "house", "trees", "silo"] },
    garage: { hero: "workshop", near: ["house", "trees", "garage"], mid: ["house", "garage", "trees", "house"], far: ["house", "trees", "house"] },
    city: { hero: "tower", near: ["store", "office", "bank", "trees"], mid: ["skyscraper", "office", "store", "house"], far: ["skyscraper", "office", "house"] },
  };

  function buildEmpire(s, preset, o) {
    o = obj(o);
    var key = empKey(preset, "city");
    var api = { name: key, hero: null, list: [], grow: function (a, b) { return growEmpire(s, a, b); } };
    var E_ = { key: key, list: [], hero: null, api: api };
    if (key === "none") return E_;
    var P_ = PRESETS[key], rnd = V.makeRand(1301 + EMPIRES.indexOf(key) * 97), Ww = s.Ww, hz = s.horizon, Pt = s.portrait;
    var heroSide = o.heroSide === "left" ? "left" : o.heroSide === "center" || o.heroSide === "centre" ? "center" : "right";
    var hx = heroSide === "left" ? Ww * (Pt ? 0.3 : 0.34) : heroSide === "center" ? Ww * 0.5 : Ww * (Pt ? 0.7 : 0.66);
    var rows = [
      { name: "far", y: hz + 18, sc: Pt ? 0.34 : 0.42, pool: P_.far, gap: 2, dy: 8 },
      { name: "far", y: hz + 52, sc: Pt ? 0.44 : 0.56, pool: P_.far, gap: 4, dy: 10 },
      { name: "mid", y: hz + (Pt ? 160 : 150), sc: Pt ? 0.66 : 0.86, pool: P_.mid, gap: 8, dy: 14 },
      { name: "near", y: hz + (Pt ? 340 : 360), sc: Pt ? 0.98 : 1.32, pool: P_.near, gap: 14, dy: 16 },
    ];
    if (key === "shipping") rows[3] = { name: "near", y: hz + (1180 - hz) * 0.46 - 8, sc: 0.95, pool: P_.near, gap: 18, dy: 4 };
    var heroRow = rows[2], heroScale = Pt ? 0.86 : 1.12;
    var heroRec = placeBuilding(s, E_, P_.hero, hx, heroRow.y + 26, heroScale, "mid", rnd, true);
    E_.hero = heroRec;
    var heroZone = [hx - (heroRec.w * heroScale) / 2 - 8, hx + (heroRec.w * heroScale) / 2 + 8];
    rows.forEach(function (rw, ri) {
      var x = -Ww * 0.12 + rnd() * 30, xEnd = Ww * 1.12, items = [];
      while (x < xEnd) {
        var type = rw.pool[Math.floor(rnd() * rw.pool.length)];
        var probe = BUILD[type](V.makeRand(1)), w = probe.w * rw.sc;
        var cx = x + w / 2;
        if (ri >= 2 && cx + w / 2 > heroZone[0] && cx - w / 2 < heroZone[1] && ri === 2) { x = heroZone[1] + rw.gap; continue; }
        items.push({ type: type, x: cx, y: rw.y + (rnd() - 0.5) * rw.dy });
        x += w + rw.gap * (0.6 + rnd());
      }
      items.sort(function (a, b) { return a.y - b.y; });
      items.forEach(function (it) { placeBuilding(s, E_, it.type, it.x, it.y, rw.sc * (0.92 + rnd() * 0.14), rw.name, rnd, false); });
    });
    if (key === "shipping" && P_.water) {
      var wy = hz + (1180 - hz) * 0.46 + 70;
      [Ww * 0.25, Ww * 0.8].forEach(function (x) { placeBuilding(s, E_, "ship", x, wy, Pt ? 0.9 : 1.1, "near", rnd, false); });
    }
    // rank: hero first, then nearer and bigger ones earlier, with a seeded shuffle
    var others = E_.list.filter(function (b) { return !b.hero; });
    others.forEach(function (b) { b.score = (b.layer === "near" ? 2 : b.layer === "mid" ? 1.2 : 0.4) + rnd() * 1.4; });
    others.sort(function (a, b) { return b.score - a.score; });
    E_.ranked = [heroRec].concat(others);
    var g = clamp(num(o.growth, 1), 0, 1), nPresent = Math.max(1, Math.round(g * E_.ranked.length));
    E_.ranked.forEach(function (b, i) { b.rank = i; b.at = i < nPresent ? -1 : null; });
    E_.hidden = E_.ranked.filter(function (b) { return b.at == null; });
    api.hero = heroRec.api;
    api.list = E_.ranked.map(function (b) { return b.api; });
    s.anims.push(function (t) { E_.list.forEach(function (b) { updBuilding(b, t); }); });
    return E_;
  }
  function placeBuilding(s, E_, type, x, y, sc, layer, rnd, hero) {
    var fn = BUILD[type] || BUILD.office, b = fn(rnd);
    var g = svg("g", { class: "fs-bld fs-b-" + type }, s.L[layer] || s.L.mid);
    var inner = svg("g", null, g);
    inner.innerHTML = b.lift ? '<g transform="translate(0 ' + -b.lift + ')">' + b.m + "</g>" : b.m;
    var rec = { g: g, inner: inner, type: type, x: x, y: y, sc: sc, layer: layer, w: b.w, h: b.h + (b.lift || 0), flat: !!b.flat, hero: !!hero, at: -1, anims: [] };
    var dust = svg("g", { class: "fs-dust" }, g);
    dust.innerHTML = [0, 1, 2, 3, 4].map(function (i) { return '<circle r="5" fill="#E6DECB" stroke="' + INK + '" stroke-width="1" />'; }).join("");
    rec.dust = dust;
    if (sc > 0.45 || hero) [].slice.call(inner.querySelectorAll(".fs-anim")).forEach(function (el) { rec.anims.push({ el: el, k: el.getAttribute("data-k"), d: el.dataset }); });
    rec.api = { type: type, x: x, y: y, scale: sc, layer: layer, group: g, rank: 0, bounds: function () { return { x: x - (rec.w * sc) / 2, y: y - rec.h * sc, w: rec.w * sc, h: rec.h * sc }; } };
    E_.list.push(rec);
    return rec;
  }
  function updBuilding(b, t) {
    var k = 1;
    if (b.at == null) k = 0;
    else if (b.at >= 0) k = t < b.at ? 0 : CE.snap(clamp((t - b.at) / 0.5, 0, 1));
    showEl(b.g, k > 0.001);
    if (k <= 0.001) return;
    var sx = b.sc * (b.flat ? Math.min(1, k * 1.4) : lerp(0.8, 1, Math.min(1, k))), sy = b.sc * (b.flat ? Math.min(1, k * 1.4) : k);
    setA(b.g, "transform", "translate(" + f1(b.x) + " " + f1(b.y) + ")");
    setA(b.inner, "transform", "scale(" + (Math.round(sx * 1000) / 1000) + " " + (Math.round(sy * 1000) / 1000) + ")");
    var dt = b.at >= 0 ? t - b.at : 99;
    showEl(b.dust, dt >= 0 && dt < 0.7);
    if (dt >= 0 && dt < 0.7) {
      var p = dt / 0.7, cs = b.dust.childNodes;
      for (var i = 0; i < cs.length; i++) {
        var a = (i / cs.length) * PI + PI * 0.05, r = (b.w * 0.3 + 30 * p) * b.sc;
        setA(cs[i], "cx", f1(Math.cos(a) * r * (i % 2 ? 1 : -1))); setA(cs[i], "cy", f1(-8 * b.sc - p * 10 * b.sc)); setA(cs[i], "r", f1((5 + 7 * p) * b.sc + 1));
        setA(cs[i], "opacity", f2(1 - p));
      }
    }
    for (var j = 0; j < b.anims.length; j++) animPart(b.anims[j], t);
  }
  function animPart(a, t) {
    var d = a.d, el = a.el;
    if (a.k === "spin") setA(el, "transform", "rotate(" + f1((t * num(d.sp, 0.3) * 360) % 360) + " " + d.cx + " " + d.cy + ")");
    else if (a.k === "spinE") { var an = t * num(d.sp, 1) * 2 * PI; setA(el, "transform", "translate(" + d.cx + " " + d.cy + ") scale(" + f2(Math.cos(an)) + " 1) translate(" + -d.cx + " " + -d.cy + ")"); }
    else if (a.k === "smoke") {
      var p = (t * 0.32 + num(d.ph, 0)) % 1, big = num(d.big, 1);
      setA(el, "transform", "translate(" + f1(num(d.x, 0) + p * 22 * big) + " " + f1(num(d.y, 0) - p * 46 * big) + ") scale(" + f2(0.6 + p * 1.6) + ")");
      setA(el, "opacity", f2(Math.min(1, p * 5) * (1 - p)));
    } else if (a.k === "nod") setA(el, "transform", "rotate(" + f1(Math.sin(t * num(d.sp, 1) * 2) * num(d.amp, 10)) + " " + d.cx + " " + d.cy + ")");
    else if (a.k === "slide") setA(el, "transform", "translate(" + f1(Math.sin(t * num(d.sp, 0.3) * 2 * PI + num(d.ph, 0)) * num(d.amp, 20)) + " 0)");
    else if (a.k === "bob") setA(el, "transform", "translate(0 " + f2(Math.sin(t * num(d.sp, 1) * 2) * num(d.amp, 2)) + ") rotate(" + f2(Math.sin(t * num(d.sp, 1) * 1.3) * 0.8) + ")");
    else if (a.k === "blink") setA(el, "opacity", (Math.floor(t * 1.6 + num(d.ph, 0) * 2) % 2) ? "1" : "0.25");
    else if (a.k === "wave") setA(el, "transform", "translate(" + d.cx + " " + d.cy + ") scale(1 " + f2(1 + 0.12 * Math.sin(t * 5)) + ") translate(" + -d.cx + " " + -d.cy + ")");
    else if (a.k === "flame") setA(el, "transform", "translate(" + d.cx + " " + d.cy + ") scale(" + f2(1 + 0.12 * Math.sin(t * 11)) + " " + f2(1 + 0.22 * Math.sin(t * 7.3)) + ") translate(" + -d.cx + " " + -d.cy + ")");
    else if (a.k === "orbit") { var ang = t * num(d.sp, 0.2) * 2 * PI; setA(el, "transform", "translate(" + f1(Math.cos(ang) * num(d.rx, 100)) + " " + f1(Math.sin(ang) * num(d.ry, 20)) + ")"); }
  }
  // Pop the hidden buildings in rank order between from and to (seconds).
  function growEmpire(s, from, to) {
    s = s || st;
    if (!s || !s.empireRec) return;
    var hid = s.empireRec.hidden || [];
    var a = tc(num(from, 0.6)), b = Math.min(endLimit() - 0.3, num(to, D - 1.2));
    if (b < a) b = a;
    hid.forEach(function (bd, i) { bd.at = hid.length > 1 ? a + ((b - a) * i) / (hid.length - 1) : a; });
  }

  // ------------------------- caricature rig -------------------------
  // Local units: feet at y 0, facing +x (three-quarter view). Head radius HR 46 on a 70-unit torso: big head.
  var HR = 46, L1 = 46, L2 = 44, TH = 36, SH = 34, HIPY = -72, SHY = -142;
  var SFRONT = [12, -134], SBACK = [-18, -136], NECK = [3, -150], HEAD0 = [6, -200], HSC = 1.2, FIGH = 272;
  var ARCH = {
    founder: { skin: "#E9C4A6", hair: "#4A3A30", hairStyle: "sidepart", head: "square", nose: "bulb", glasses: "rect", outfit: "suit", suit: "#2F3E5C", shirt: "#F2EEE6", tie: "#C8503C", pants: "#2A3650", shoes: "#2B2420", brows: "normal", build: 1.02 },
    engineer: { skin: "#D9A988", hair: "#5A4030", hairStyle: "short", hat: "hardhat", hatColor: "#E2B03C", head: "broad", nose: "bulb", moustache: true, outfit: "overalls", suit: "#4E6E9A", shirt: "#C9D6E0", pants: "#4E6E9A", shoes: "#6B4A32", brows: "thick", build: 1.14, sleeves: "rolled" },
    inventor: { skin: "#EFCFB4", hair: "#F1EEE8", hairStyle: "wild", head: "round", nose: "hook", glasses: "round", outfit: "labcoat", suit: "#F4F1EA", shirt: "#B9C7CF", tie: "#3E6E8E", bowtie: true, pants: "#6C6A70", shoes: "#4A3A30", brows: "white", build: 0.96 },
    retailer: { skin: "#C99272", hair: "#3A2A22", hairStyle: "short", hat: "cap", hatColor: "#C8503C", head: "round", nose: "button", outfit: "apron", suit: "#6E8F60", shirt: "plaid", pants: "#4A4A52", shoes: "#3B3029", brows: "thick", build: 1.06, beard: "stubble" },
    techie: { skin: "#E7C2A2", hair: "#6B4A35", hairStyle: "messy", head: "egg", nose: "button", outfit: "hoodie", suit: "#8E9399", shirt: "#2F3A48", pants: "#3E4A5E", shoes: "#E8E4DA", brows: "normal", build: 0.92 },
    investor: { skin: "#E4BB9E", hair: "#CFCCC6", hairStyle: "slick", head: "long", nose: "long", outfit: "suit", suit: "#3B3C43", pinstripe: true, shirt: "#F2EEE6", tie: "#7A2E35", pants: "#36363C", shoes: "#1E1A18", brows: "bushy", browColor: "#6A665F", build: 1.05, pocket: true },
    executive: { skin: "#B98466", hair: "#3A2620", hairStyle: "bob", head: "oval", nose: "straight", outfit: "blazer", suit: "#2F7F7A", shirt: "#F2EEE6", pants: "#2E3440", shoes: "#2B2420", brows: "thin", earrings: "#D4AE4C", lips: "#B5524A", build: 0.95 },
  };
  var ARCH_IDS = Object.keys(ARCH);
  var ARCH_SYN = { ceo: "founder", boss: "founder", narrator: "founder", businessman: "founder", worker: "engineer", builder: "engineer", mechanic: "engineer", scientist: "inventor", professor: "inventor", shopkeeper: "retailer", grocer: "retailer", merchant: "retailer", coder: "techie", programmer: "techie", developer: "techie", hacker: "techie", banker: "investor", rival: "investor", tycoon: "investor", manager: "executive", director: "executive", partner: "executive", woman: "executive" };
  function archKey(n) { n = str(n).toLowerCase(); return ARCH[n] ? n : ARCH_SYN[n] || null; }
  var HEADS = {
    square: { jaw: 0.92, chin: 1.04, chinX: 0.24, top: 0.98, cheek: 1 },
    long: { jaw: 0.76, chin: 1.3, chinX: 0.3, top: 1.04, cheek: 0.9 },
    round: { jaw: 0.88, chin: 0.98, chinX: 0.16, top: 1.0, cheek: 1.18 },
    egg: { jaw: 0.72, chin: 1.02, chinX: 0.2, top: 1.1, cheek: 1 },
    broad: { jaw: 1.02, chin: 1.0, chinX: 0.2, top: 0.92, cheek: 1.1 },
    oval: { jaw: 0.8, chin: 1.1, chinX: 0.24, top: 1.02, cheek: 1 },
  };

  // Poses: fa/fe front arm (shoulder angle from straight down, + forward; elbow bend), ba/be back arm,
  // ft/bt hand targets solved by IK (fb/bb bend sign), lean, nod, tilt, sh (shoulders up), hop.
  // fh/bh hand shape (open, fist, point, thumb, hold), fw world-aligned front hand, prop: hand prop,
  // prop2: two-hand prop, osc: oscillation, look: default gaze.
  var PZ = { fa: 6, fe: 8, ba: -4, be: 8, lean: 0, nod: 0, tilt: 0, sh: 0, hop: 0 };
  var POSES = {
    idle: { fa: 6, fe: 10, ba: -5, be: 10 },
    talk: { fa: 24, fe: 64, fh: "open", ba: -3, be: 12 },
    explain: { fa: 36, fe: 56, ba: 44, be: 50, fh: "open", bh: "open" },
    "arms-crossed": { ft: [-2, -112], fb: -1, bt: [28, -110], bb: -1, fh: "fist", bh: "fist", tilt: -2 },
    point: { fa: 86, fe: 4, fh: "point", look: "forward" },
    "point-up": { fa: 92, fe: 64, fh: "point", look: "up", nod: -4 },
    "point-viewer": { fa: 50, fe: 46, fh: "point", look: "camera" },
    "point-down": { fa: 40, fe: -8, fh: "point", look: "down", nod: 7 },
    blueprint: { ft: [80, -112], bt: [8, -108], fh: "hold", bh: "hold", prop2: "blueprint", nod: 7, look: "down" },
    tablet: { ft: [62, -120], bt: [22, -114], fh: "hold", bh: "hold", prop2: "tablet", nod: 8, look: "down" },
    contract: { ft: [66, -114], bt: [18, -112], fh: "hold", bh: "hold", prop2: "contract", nod: 6, look: "down" },
    phone: { ft: [66, -126], fh: "hold", fw: 1, prop: "phone", nod: 10, look: "down" },
    "thumbs-up": { ft: [72, -124], fh: "thumb", fw: 1 },
    "hands-hips": { ft: [26, -82], fb: -1, bt: [-28, -82], fh: "fist", bh: "fist" },
    worried: { ft: [64, -156], bt: [0, -176], fh: "open", bh: "open", sh: 6, look: "camera" },
    handshake: { fa: 62, fe: 26, fh: "open" },
    present: { fa: 62, fe: -16, fh: "open", look: "forward" },
    "open-arms": { fa: 100, fe: 8, ba: -104, be: -8, fh: "open", bh: "open", lean: -3 },
    wave: { fa: 92, fe: 60, fh: "open", osc: "wave", look: "camera" },
    facepalm: { ft: [58, -188], fh: "open", nod: 14, tilt: -4 },
    shrug: { fa: 30, fe: 96, fh: "open", ba: -32, be: -92, bh: "open", sh: 9, tilt: 9, look: "camera" },
    "fist-pump": { fa: 28, fe: 112, fh: "fist", osc: "pump" },
    think: { ft: [40, -150], fh: "fist", tilt: 7, look: "up" },
    celebrate: { fa: 94, fe: 58, ba: -120, be: -34, fh: "open", bh: "open", osc: "bounce" },
    sad: { fa: 2, fe: 4, ba: -2, be: 4, nod: 14, lean: 5, sh: -3, look: "down" },
    briefcase: { fa: 5, fe: 2, fh: "hold", fw: 1, prop: "briefcase" },
    coffee: { ft: [52, -120], fh: "hold", fw: 1, prop: "coffee" },
    wrench: { ft: [74, -112], fh: "hold", prop: "wrench", osc: "tinker", look: "forward" },
    money: { ft: [70, -128], fh: "hold", fw: 1, prop: "money", look: "camera" },
    megaphone: { ft: [62, -160], fh: "hold", fw: 1, prop: "megaphone", look: "forward" },
    nod: { osc: "nod" },
    headshake: { osc: "shake" },
    bow: { lean: 20, nod: 16, fa: 4, fe: 6, ba: -4, be: 6 },
  };
  var POSE_SYN = { stand: "idle", standing: "idle", rest: "idle", talking: "talk", speak: "talk", explaining: "explain", crossed: "arms-crossed", "arms-folded": "arms-crossed", pointing: "point", "point-right": "point", "point-left": "point", "point-camera": "point-viewer", "point-at-viewer": "point-viewer", plans: "blueprint", blueprints: "blueprint", ipad: "tablet", paper: "contract", sign: "contract", texting: "phone", call: "phone", "thumbs": "thumbs-up", ok: "thumbs-up", "hands-on-hips": "hands-hips", scared: "worried", nervous: "worried", shake: "handshake", deal: "handshake", show: "present", presenting: "present", welcome: "open-arms", waving: "wave", "face-palm": "facepalm", dunno: "shrug", "fist": "fist-pump", yes: "fist-pump", thinking: "think", ponder: "think", cheer: "celebrate", victory: "celebrate", cry: "sad", case: "briefcase", mug: "coffee", tea: "coffee", tool: "wrench", fix: "wrench", cash: "money", announce: "megaphone", "nod-yes": "nod", no: "headshake", "shake-head": "headshake" };
  function poseKey(n) { n = str(n).toLowerCase(); return POSES[n] ? n : POSE_SYN[n] || "idle"; }
  function ik(S0, T, bend) {
    var dx = T[0] - S0[0], dy = T[1] - S0[1], d = Math.min(L1 + L2 - 0.5, Math.max(8, Math.sqrt(dx * dx + dy * dy)));
    var phi = (Math.atan2(dx, dy) * 180) / PI;
    var al = (Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1)) * 180) / PI;
    var be = (Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1)) * 180) / PI;
    var sg = bend == null ? 1 : bend;
    return [phi - al * sg, (180 - be) * sg];
  }
  var POSEV = {};
  Object.keys(POSES).forEach(function (k) {
    var p = POSES[k], o = {};
    for (var z in PZ) o[z] = p[z] != null ? p[z] : PZ[z];
    if (p.ft) { var a = ik(SFRONT, p.ft, p.fb); o.fa = a[0]; o.fe = a[1]; }
    if (p.bt) { var b = ik(SBACK, p.bt, p.bb); o.ba = b[0]; o.be = b[1]; }
    POSEV[k] = o;
  });
  function poseVec(n) { var v = POSEV[poseKey(n)], o = {}; for (var k in v) o[k] = v[k]; return o; }
  var GESTURE_POSE = { idle: 1, talk: 1, explain: 1, present: 1, "open-arms": 1, "hands-hips": 0.4, "arms-crossed": 0.25, "point": 0.3 };

  // Expressions: by brow raise, ba brow angle (+ worried, - angry), bs far brow raise, lt/lb lids, arc closed happy
  // eyes, pu pupil scale, sm smile (-1..1), mw mouth width, mo open, mr roundness, te teeth, ma asymmetry, bl blush.
  var EXZ = { by: 0, ba: 0, bs: 0, lt: 0.1, lb: 0, arc: 0, pu: 1, sm: 0.2, mw: 0.9, mo: 0, mr: 0, te: 0, ma: 0, bl: 0.2 };
  var EXPR = {
    neutral: {},
    confident: { by: 0.08, lt: 0.2, sm: 0.55, mw: 0.98, ma: 0.32, bl: 0.25 },
    happy: { by: 0.25, lb: 0.22, sm: 0.9, mw: 1.08, mo: 0.32, te: 0.6, bl: 0.45 },
    excited: { by: 0.7, sm: 1, mw: 1.2, mo: 0.8, te: 0.6, pu: 1.1, bl: 0.55 },
    worried: { ba: 0.85, by: 0.25, sm: -0.45, mw: 0.7, mo: 0.14, ma: 0.3, bl: 0 },
    shocked: { by: 1.15, pu: 0.62, sm: -0.1, mw: 0.56, mo: 1, mr: 1, bl: 0 },
    angry: { ba: -1, by: -0.35, lt: 0.32, sm: -0.65, mw: 0.98, mo: 0.34, te: 0.95, bl: 0.35 },
    determined: { ba: -0.6, by: -0.12, lt: 0.24, sm: 0.1, mw: 0.95, ma: 0.15 },
    smug: { lt: 0.44, bs: 0.5, sm: 0.72, mw: 0.9, ma: 0.65, bl: 0.25 },
    sad: { ba: 0.95, by: -0.05, lt: 0.32, sm: -0.75, mw: 0.74, pu: 1.05, bl: 0 },
    thinking: { bs: 0.65, by: 0.2, sm: 0.02, mw: 0.5, mr: 0.45, ma: 0.4, bl: 0.1 },
    laughing: { arc: 1, by: 0.45, sm: 1, mw: 1.25, mo: 1, te: 0.7, bl: 0.6 },
    skeptical: { bs: 1, lt: 0.36, sm: -0.14, mw: 0.66, ma: 0.6, bl: 0 },
    tired: { lt: 0.6, by: -0.12, ba: 0.3, sm: -0.12, mw: 0.62, mo: 0.08, bl: 0 },
  };
  var EXPR_SYN = { surprised: "shocked", shock: "shocked", scared: "worried", nervous: "worried", afraid: "worried", mad: "angry", furious: "angry", proud: "confident", calm: "neutral", joy: "happy", glad: "happy", smile: "happy", thrilled: "excited", focused: "determined", curious: "thinking", think: "thinking", laugh: "laughing", doubtful: "skeptical", confused: "skeptical", sleepy: "tired", upset: "sad" };
  function exKey(n) { n = str(n).toLowerCase(); return EXPR[n] ? n : EXPR_SYN[n] || "neutral"; }
  function exprVec(n) { var p = EXPR[exKey(n)], o = {}; for (var k in EXZ) o[k] = p[k] != null ? p[k] : EXZ[k]; return o; }
  var VIS = { A: { w: 1.0, o: 1.0, r: 0.3 }, E: { w: 1.18, o: 0.5, r: 0.1 }, I: { w: 1.06, o: 0.42, r: 0.1 }, O: { w: 0.64, o: 0.9, r: 1 }, U: { w: 0.52, o: 0.55, r: 1 } };
  function sylls(word, t0, t1, seed) {
    var w = normWord(word).replace(/[0-9]+/g, "ten");
    var groups = w.match(/[aeiouy]+/g) || ["a"];
    var n = clamp(groups.length, 1, Math.max(1, Math.floor((t1 - t0) / 0.085)));
    var out = [];
    for (var i = 0; i < n; i++) {
      var g = groups[Math.min(groups.length - 1, i)], ch = g.charAt(0);
      var v = ch === "a" ? "A" : ch === "e" ? "E" : ch === "i" || ch === "y" ? "I" : ch === "o" ? "O" : "U";
      if (g === "ee" || g === "ea") v = "E";
      if (g === "oo" || g === "ou") v = "U";
      if (g === "ai" || g === "ay" || g === "au") v = "A";
      out.push({ t0: t0 + ((t1 - t0) * i) / n, t1: t0 + ((t1 - t0) * (i + 1)) / n, v: v, k: 0.72 + 0.28 * hash(seed + i * 3.1) });
    }
    return out;
  }
  function mouthD(w, c, o, rr, ma) {
    var aa = ma * w * 0.28, y0 = -c - aa, y3 = -c + aa, k = 0.45 + 0.35 * rr;
    var mU = c * 0.5 - o * 0.28, mL = c * 0.5 + o;
    var cu = (8 * mU - y0 - y3) / 6, cl = (8 * mL - y0 - y3) / 6;
    return "M" + f2(-w) + " " + f2(y0) + "C" + f2(-w * k) + " " + f2(cu) + " " + f2(w * k) + " " + f2(cu) + " " + f2(w) + " " + f2(y3) + "C" + f2(w * k) + " " + f2(cl) + " " + f2(-w * k) + " " + f2(cl) + " " + f2(-w) + " " + f2(y0) + "Z";
  }
  function capsule(len, w) { return rrD(-w / 2, -w / 2, w, len + w, w / 2); }

  // ---- static markup in head-local units (head centre 0,0) ----
  function headPath(sh) {
    var r = HR, top = sh.top, ch = sh.chin, cx = sh.chinX, jw = sh.jaw, chk = sh.cheek;
    return "M" + f1(-r) + " 0C" + f1(-r) + " " + f1(-r * 1.16 * top) + " " + f1(r * 0.92) + " " + f1(-r * 1.18 * top) + " " + f1(r * 0.98) + " " + f1(-r * 0.16) +
      "C" + f1(r * 1.04) + " " + f1(r * 0.18 * chk) + " " + f1(r * (0.9 + 0.08 * chk)) + " " + f1(r * 0.52) + " " + f1(r * (cx + 0.34)) + " " + f1(r * ch * 0.93) +
      "Q" + f1(r * cx) + " " + f1(r * ch * 1.06) + " " + f1(r * (cx - 0.24)) + " " + f1(r * ch * 0.97) +
      "C" + f1(-r * 0.48) + " " + f1(r * ch * 0.88) + " " + f1(-r * jw) + " " + f1(r * 0.74) + " " + f1(-r * 0.98) + " " + f1(r * 0.32) + "Q" + f1(-r * 1.02) + " " + f1(r * 0.12) + " " + f1(-r) + " 0Z";
  }
  function noseMarkup(kind, skin) {
    var r = HR, o = SK(INK, 2), f = shade(skin, 0.93), d;
    if (kind === "long") d = "M" + f1(r * 0.66) + " " + f1(-r * 0.2) + "Q" + f1(r * 0.98) + " " + f1(r * 0.1) + " " + f1(r * 1.22) + " " + f1(r * 0.3) + "Q" + f1(r * 1.1) + " " + f1(r * 0.44) + " " + f1(r * 0.7) + " " + f1(r * 0.36);
    else if (kind === "button") d = "M" + f1(r * 0.78) + " " + f1(r * 0.06) + "Q" + f1(r * 1.1) + " " + f1(r * 0.08) + " " + f1(r * 1.06) + " " + f1(r * 0.28) + "Q" + f1(r * 1.0) + " " + f1(r * 0.38) + " " + f1(r * 0.76) + " " + f1(r * 0.32);
    else if (kind === "hook") d = "M" + f1(r * 0.7) + " " + f1(-r * 0.22) + "Q" + f1(r * 1.3) + " " + f1(-r * 0.12) + " " + f1(r * 1.14) + " " + f1(r * 0.36) + "Q" + f1(r * 1.0) + " " + f1(r * 0.46) + " " + f1(r * 0.72) + " " + f1(r * 0.34);
    else if (kind === "straight") d = "M" + f1(r * 0.72) + " " + f1(-r * 0.16) + "L" + f1(r * 1.1) + " " + f1(r * 0.27) + "Q" + f1(r * 1.02) + " " + f1(r * 0.38) + " " + f1(r * 0.74) + " " + f1(r * 0.33);
    else d = "M" + f1(r * 0.7) + " " + f1(-r * 0.14) + "Q" + f1(r * 0.86) + " " + f1(-r * 0.02) + " " + f1(r * 1.02) + " " + f1(r * 0.08) + "C" + f1(r * 1.3) + " " + f1(r * 0.14) + " " + f1(r * 1.24) + " " + f1(r * 0.46) + " " + f1(r * 0.96) + " " + f1(r * 0.42) + "Q" + f1(r * 0.82) + " " + f1(r * 0.42) + " " + f1(r * 0.72) + " " + f1(r * 0.34);
    return P(d, f, o) + P("M" + f1(r * 0.84) + " " + f1(r * 0.34) + "q" + f1(r * 0.08) + " " + f1(-r * 0.06) + " " + f1(r * 0.16) + " 0", "none", SK(shade(skin, 0.6), 1.4));
  }
  function hairMarkup(cd, part) {
    var r = HR, h = cd.hair, o = SK(INK, 2), dk = shade(h, 0.78), st_ = cd.hairStyle, hatted = !!cd.hat;
    function p(pts) { return pts.replace(/(-?\d+(\.\d+)?)r/g, function (m, v) { return f1(+v * r); }); }
    if (part === "back") {
      if (st_ === "bob") return P(p("M-1.08r -0.2r C-1.2r -1.3r 1.0r -1.42r 1.02r -0.3r L0.6r -0.05r Q0.3r 0.55r 0.1r 0.98r Q-0.6r 1.1r -1.12r 0.9r Q-1.24r 0.4r -1.08r -0.2r Z"), h, o);
      if (st_ === "long") return P(p("M-1.08r -0.2r C-1.2r -1.3r 1.0r -1.42r 1.02r -0.3r L0.5r 0.2r Q0.2r 1.3r 0.1r 1.7r Q-0.7r 1.8r -1.18r 1.5r Q-1.3r 0.6r -1.08r -0.2r Z"), h, o);
      if (st_ === "bun") return C(-r * 0.7, -r * 0.86, r * 0.34, h, o);
      if (st_ === "ponytail") return P(p("M-0.9r -0.5r Q-1.6r -0.2r -1.3r 0.9r Q-1.1r 0.3r -0.8r 0r Z"), h, o);
      return "";
    }
    var m = "";
    if (st_ === "wild") {
      // bald dome with big white tufts at the back and sides
      var tufts = [[-0.98, -0.1, 0.34], [-0.9, -0.55, 0.32], [-0.62, -0.92, 0.3], [-1.05, 0.34, 0.26], [-0.28, -1.08, 0.22], [0.2, -1.12, 0.17], [0.62, -0.9, 0.18]];
      var tO = "", tF = "";
      tufts.forEach(function (q, ti) { for (var j = 0; j < 4; j++) { var a2 = (j / 4) * 2 * PI + ti, rr2 = q[2] * r * (j ? 0.62 : 1), cx2 = q[0] * r + (j ? Math.cos(a2) * q[2] * r * 0.62 : 0), cy2 = q[1] * r + (j ? Math.sin(a2) * q[2] * r * 0.62 : 0); tO += C(cx2, cy2, rr2, h, SK(INK, 4)); tF += C(cx2, cy2, rr2, h); } });
      m += tO + tF;
      tufts.forEach(function (q) { m += P("M" + f1(q[0] * r - q[2] * r * 0.4) + " " + f1(q[1] * r) + "q" + f1(q[2] * r * 0.4) + " " + f1(-q[2] * r * 0.5) + " " + f1(q[2] * r * 0.7) + " " + f1(-q[2] * r * 0.1), "none", SK(shade(h, 0.8), 1.4)); });
      m += P(p("M-0.3r -0.72r Q0.2r -0.92r 0.62r -0.6r"), "none", SK(tint(cd.skin, 0.5), 3) + ' opacity="0.8"');
      return m;
    }
    if (st_ === "bald") return P(p("M-0.2r -0.8r Q0.25r -0.98r 0.6r -0.68r"), "none", SK(tint(cd.skin, 0.5), 4) + ' opacity="0.8"') + P(p("M-1.0r 0.1r Q-1.06r -0.3r -0.86r -0.5r L-0.62r -0.2r Q-0.7r 0.1r -0.64r 0.3r Z"), h, o);
    if (hatted && cd.hat === "hardhat") return P(p("M-1.0r -0.1r Q-1.04r -0.4r -0.86r -0.48r L-0.5r -0.3r Q-0.55r 0r -0.42r 0.24r L-0.86r 0.4r Z"), h, o);
    if (hatted && cd.hat === "cap") return P(p("M-1.04r 0.12r Q-1.08r -0.36r -0.86r -0.5r L-0.5r -0.3r Q-0.56r 0.02r -0.4r 0.26r L-0.84r 0.42r Z"), h, o);
    if (st_ === "sidepart") {
      m += P(p("M-1.04r 0.2r C-1.18r -1.06r 0.6r -1.46r 1.0r -0.42r Q0.86r -0.56r 0.6r -0.6r Q0.2r -0.66r -0.06r -0.5r Q-0.22r -0.2r -0.2r 0.12r L-0.42r 0.18r Q-0.54r -0.1r -0.66r 0.12r L-0.84r 0.48r Z"), h, o);
      m += P(p("M-0.06r -0.5r Q0.1r -0.92r 0.44r -1.04r"), "none", SK(dk, 1.6)) + P(p("M0.2r -0.66r Q0.62r -0.7r 0.92r -0.5r"), "none", SK(tint(h, 0.3), 2));
      return m;
    }
    if (st_ === "slick") {
      m += P(p("M-1.04r 0.2r C-1.2r -1.0r 0.3r -1.4r 0.84r -0.66r Q0.5r -0.74r 0.1r -0.7r Q-0.18r -0.42r -0.22r 0.1r L-0.44r 0.18r Q-0.56r -0.1r -0.68r 0.12r L-0.86r 0.46r Z"), h, o);
      [[-0.1, -0.74, 0.5, -1.0], [-0.4, -0.6, 0.2, -1.06], [-0.7, -0.4, -0.2, -0.98]].forEach(function (q) { m += P(p("M" + q[0] + "r " + q[1] + "r Q" + ((q[0] + q[2]) / 2 - 0.25) + "r " + ((q[1] + q[3]) / 2 - 0.2) + "r " + q[2] + "r " + q[3] + "r"), "none", SK(dk, 1.3)); });
      return m;
    }
    if (st_ === "messy") {
      m += P(p("M-1.04r 0.2r L-1.14r -0.42r L-0.92r -0.6r L-0.98r -0.96r L-0.6r -0.94r L-0.5r -1.3r L-0.18r -1.06r L0.1r -1.36r L0.3r -1.04r L0.7r -1.18r L0.66r -0.82r L1.04r -0.7r L0.88r -0.46r Q0.5r -0.5r 0.2r -0.42r L0.06r -0.62r L-0.08r -0.36r Q-0.2r -0.12r -0.2r 0.12r L-0.44r 0.18r Q-0.56r -0.1r -0.68r 0.12r L-0.86r 0.46r Z"), h, o);
      m += P(p("M-0.4r -0.9r L-0.2r -0.6r M0.3r -0.9r L0.4r -0.62r"), "none", SK(dk, 1.3));
      return m;
    }
    if (st_ === "bob") {
      m += P(p("M-1.06r 0.6r C-1.24r -1.12r 0.7r -1.5r 1.04r -0.36r Q0.9r -0.44r 0.7r -0.42r Q0.62r -0.62r 0.42r -0.6r Q0.14r -0.52r -0.04r -0.3r Q-0.3r 0r -0.3r 0.5r Q-0.6r 0.7r -1.06r 0.6r Z"), h, o);
      m += P(p("M0.0r -0.9r Q0.4r -0.84r 0.66r -0.5r"), "none", SK(tint(h, 0.25), 2));
      return m;
    }
    if (st_ === "curly") {
      [[-0.9, 0.1], [-0.96, -0.3], [-0.8, -0.66], [-0.46, -0.94], [-0.04, -1.04], [0.4, -0.94], [0.76, -0.64], [-0.62, 0.3]].forEach(function (q) { m += C(q[0] * r, q[1] * r, r * 0.28, h, o); });
      return m;
    }
    if (st_ === "buzz") return P(p("M-1.02r 0.12r C-1.12r -1.1r 0.66r -1.32r 0.96r -0.48r Q0.4r -0.66r -0.1r -0.5r Q-0.24r -0.2r -0.2r 0.1r L-0.44r 0.16r Q-0.56r -0.1r -0.66r 0.1r Z"), h, o + ' opacity="0.85"');
    // short (default), also under a hat
    m += P(p("M-1.04r 0.2r C-1.16r -1.08r 0.66r -1.38r 0.98r -0.46r Q0.6r -0.6r 0.18r -0.58r Q-0.14r -0.4r -0.2r 0.12r L-0.44r 0.18r Q-0.56r -0.1r -0.68r 0.12r L-0.86r 0.46r Z"), h, o);
    if (st_ === "bun") m += C(-r * 0.7, -r * 0.86, r * 0.34, h, o);
    return m;
  }
  function starBlob(x, y, rr, col, o) {
    var d = "", n = 7;
    for (var i = 0; i <= n; i++) {
      var a = (i / n) * 2 * PI, a2 = ((i + 0.5) / n) * 2 * PI;
      var px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr, qx = x + Math.cos(a2) * rr * 1.45, qy = y + Math.sin(a2) * rr * 1.45;
      d += (i ? "Q" + f1(qx) + " " + f1(qy) + " " : "M") + f1(px) + " " + f1(py);
      void qx;
    }
    return P(d + "Z", col, o);
  }
  function hatMarkup(cd) {
    var r = HR, o = SK(INK, 2.2), c = cd.hatColor || "#E2B03C";
    function p(pts) { return pts.replace(/(-?\d+(\.\d+)?)r/g, function (m, v) { return f1(+v * r); }); }
    if (cd.hat === "hardhat") return P(p("M-1.0r -0.4r C-1.0r -1.4r 1.0r -1.5r 1.02r -0.46r Z"), c, o) + P(p("M-1.16r -0.36r Q0r -0.56r 1.36r -0.42r L1.32r -0.28r Q0r -0.4r -1.14r -0.22r Z"), shade(c, 0.85), o) + P(p("M-0.1r -1.24r Q0.04r -0.8r 0.04r -0.5r"), "none", SK(shade(c, 0.7), 5)) + P(p("M-0.6r -0.96r Q-0.4r -1.12r -0.1r -1.18r"), "none", SK(tint(c, 0.5), 2.5));
    if (cd.hat === "cap") return P(p("M-1.02r -0.32r C-1.02r -1.36r 0.92r -1.44r 0.98r -0.46r Z"), c, o) + P(p("M0.6r -0.5r Q1.3r -0.6r 1.62r -0.36r Q1.3r -0.26r 0.7r -0.3r Z"), shade(c, 0.82), o) + C(-0.04 * r, -1.1 * r, 3, shade(c, 0.7), "") + R(-0.3 * r, -0.86 * r, 0.42 * r, 0.24 * r, "#F2EADA", 3, SK(INK, 1.2));
    if (cd.hat === "fedora") return P(p("M-1.3r -0.42r Q0r -0.62r 1.4r -0.4r L1.36r -0.3r Q0r -0.5r -1.28r -0.32r Z"), shade(c, 0.85), o) + P(p("M-0.86r -0.46r C-0.9r -1.36r 0.86r -1.4r 0.84r -0.5r Z"), c, o) + R(-0.86 * r, -0.66 * r, 1.7 * r, 0.16 * r, INK, 0);
    return "";
  }
  function torsoMarkup(cd) {
    var b = cd.build || 1, sw = 30 * b, hw = 25 * b, o = SK(INK, 2.2), su = cd.suit, sh = cd.shirt === "plaid" ? U("plaid") : cd.shirt, m = "";
    var base = "M" + f1(-hw - 2) + " -66L" + f1(-sw - 2) + " -128Q" + f1(-sw - 2) + " -145 " + f1(-sw + 12) + " -146L" + f1(sw - 10) + " -146Q" + f1(sw + 2) + " -145 " + f1(sw + 2) + " -128L" + f1(hw + 2) + " -66Q0 -60 " + f1(-hw - 2) + " -66Z";
    var shadeD = "M" + f1(-hw - 2) + " -66L" + f1(-sw - 2) + " -128Q" + f1(-sw - 2) + " -145 " + f1(-sw + 12) + " -146L" + f1(-sw * 0.3) + " -146L" + f1(-hw * 0.4) + " -64Z";
    var body = cd.pinstripe ? U("pin") : su;
    if (cd.outfit === "hoodie") {
      m += E(-8, -146, 24, 10, shade(su, 0.85), o);
      m += P(base, su, o) + P(shadeD, U("hatch"));
      m += L(9, -142, 7, -70, shade(su, 0.6), 1.6) + L(2, -140, 0, -116, "#F1EEE8", 1.6) + L(15, -140, 16, -114, "#F1EEE8", 1.6) + C(0, -114, 1.8, "#F1EEE8") + C(16, -112, 1.8, "#F1EEE8");
      m += P("M-12 -96L26 -96L30 -74L-14 -74Z", shade(su, 0.9), SK(INK, 1.4));
      m += P("M-4 -146Q8 -136 20 -146", "none", SK(INK, 1.4)) + P("M-2 -146Q8 -140 18 -146Z", cd.shirt, "");
      return m;
    }
    if (cd.outfit === "overalls") {
      m += P(base, sh, o) + P(shadeD, U("hatch"));
      m += P("M-12 -124L26 -124L28 -66L-16 -66Z", su, o) + P("M-12 -124L-2 -124L-6 -66L-16 -66Z", U("hatch")) + R(-2, -116, 16, 12, shade(su, 0.85), 2, SK(INK, 1.2));
      m += L(-10, -124, -18, -146, su, 6) + L(24, -124, 18, -146, su, 6) + C(-10, -122, 2.2, "#E2C870", SK(INK, 1)) + C(24, -122, 2.2, "#E2C870", SK(INK, 1));
      m += P("M-4 -146L8 -134L20 -146Z", tint(cd.shirt, 0.25), SK(INK, 1.4));
      return m;
    }
    if (cd.outfit === "labcoat") {
      var coat = "M" + f1(-hw - 6) + " -30L" + f1(-sw - 2) + " -128Q" + f1(-sw - 2) + " -145 " + f1(-sw + 12) + " -146L" + f1(sw - 10) + " -146Q" + f1(sw + 2) + " -145 " + f1(sw + 2) + " -128L" + f1(hw + 8) + " -30Q4 -24 " + f1(-hw - 6) + " -30Z";
      m += P(coat, su, o) + P("M" + f1(-hw - 6) + " -30L" + f1(-sw - 2) + " -128L" + f1(-sw * 0.25) + " -146L" + f1(-hw * 0.3) + " -28Z", U("hatchL"));
      m += P("M0 -146L18 -146L10 -104Z", sh, SK(INK, 1.4));
      if (cd.bowtie) m += P("M4 -143L9 -139L4 -135Z M16 -143L11 -139L16 -135Z", cd.tie, SK(INK, 1.2)) + C(10, -139, 2, shade(cd.tie, 0.8));
      m += P("M0 -146L10 -104L8 -40", "none", SK(INK, 1.6)) + P("M18 -146L10 -104", "none", SK(INK, 1.6)) + P("M-2 -146L-8 -112L2 -116Z", shade(su, 0.92), SK(INK, 1.3)) + P("M20 -146L28 -114L16 -116Z", shade(su, 0.92), SK(INK, 1.3));
      m += R(14, -96, 12, 12, shade(su, 0.95), 1, SK(INK, 1.2)) + L(17, -96, 17, -104, ACC, 1.8) + L(21, -96, 22, -103, BLUEP, 1.8);
      return m;
    }
    if (cd.outfit === "apron") {
      m += P(base, sh, o) + P(shadeD, U("hatch"));
      m += P("M-6 -124L26 -124L30 -40L-10 -40Z", su, o) + P("M-6 -124L4 -124L0 -40L-10 -40Z", U("hatchL")) + R(2, -96, 20, 12, shade(su, 0.86), 2, SK(INK, 1.2));
      m += P("M-4 -124Q8 -150 22 -124", "none", SK(su, 3)) + L(-8, -96, -22, -100, su, 3);
      m += P("M-2 -146L8 -136L18 -146Z", tint(cd.skin, 0.1), SK(INK, 1.2));
      return m;
    }
    // suit / blazer
    var long_ = "M" + f1(-hw - 3) + " -58L" + f1(-sw - 2) + " -128Q" + f1(-sw - 2) + " -145 " + f1(-sw + 12) + " -146L" + f1(sw - 10) + " -146Q" + f1(sw + 2) + " -145 " + f1(sw + 2) + " -128L" + f1(hw + 4) + " -58Q2 -52 " + f1(-hw - 3) + " -58Z";
    m += P(long_, body, o) + P(shadeD.replace(" -66L", " -58L"), U("hatch"));
    m += P("M1 -146L19 -146L10 -102Z", cd.outfit === "blazer" ? cd.shirt : sh, SK(INK, 1.4));
    if (cd.outfit === "suit") m += P("M8 -144L12 -144L13 -139L11 -137L14 -110L10 -104L6 -110L9 -137L7 -139Z", cd.tie, SK(INK, 1.2));
    else m += P("M3 -142Q10 -126 17 -142", "none", SK(GOLD, 1.6)) + C(10, -128, 2.4, GOLD, SK(INK, 0.8));
    m += P("M1 -146L-7 -116L4 -118L10 -102Z", shade(su, 0.82), SK(INK, 1.4)) + P("M19 -146L28 -118L17 -118L10 -102Z", shade(su, 0.86), SK(INK, 1.4));
    m += C(10, -92, 2, shade(su, 0.6), SK(INK, 0.8)) + C(10, -80, 2, shade(su, 0.6), SK(INK, 0.8)) + L(10, -102, 9, -58, INK, 1.2);
    if (cd.pocket) m += P("M18 -120L28 -120L27 -116L19 -116Z", "#F2EEE6", SK(INK, 1)) + P("M20 -120L22 -124L24 -120L26 -123L27 -120", "#F2EEE6", SK(INK, 0.9));
    return m;
  }

  function makeFigure(arch, o) {
    var s = ensure();
    o = obj(o);
    var key = archKey(arch) || "founder", cd = {}, k;
    for (k in ARCH[key]) cd[k] = ARCH[key][k];
    // any look field can be overridden: skin, hair, hairStyle, head, nose, glasses, moustache, beard, hat, hatColor,
    // outfit, suit, shirt, tie, pants, shoes, brows, browColor, earrings, lips, build, sleeves, pinstripe, bowtie
    ["skin", "hair", "hairStyle", "head", "nose", "glasses", "moustache", "beard", "hat", "hatColor", "outfit", "suit", "shirt", "tie", "pants", "shoes", "brows", "browColor", "earrings", "lips", "build", "sleeves", "pinstripe", "bowtie", "pocket"].forEach(function (f) { if (o[f] != null) cd[f] = o[f]; });
    if (o.look && typeof o.look === "object") for (k in o.look) cd[k] = o.look[k];
    if (o.color && isHex(o.color)) cd.suit = hex6(o.color);
    var a = { __fig: true, name: key, cd: cd, s: s, idx: s.actors.length };
    a.scale = num(o.scale, 1);
    a.us = (s.charH / FIGH) * a.scale;
    a.x0 = num(o.x, heroX(s, "left"));
    a.y0 = num(o.y, s.portrait ? 734 + 144 * a.us : s.G);
    a.pos = new Tr({ x: a.x0, y: a.y0 });
    var p0 = poseKey(o.pose || "idle");
    var f0 = o.facing === "left" ? -1 : 1;
    a.faceTr = new Tr(f0);
    a.poseTr = new Tr(poseVec(p0));
    a.poseName = new Tr(p0);
    a.exTr = new Tr(exprVec(o.expression || "neutral"));
    a.looks = [];
    a.vis = new Tr(1);
    a.talks = []; a.walks = []; a.holds = []; a.marks = [];
    a.gestures = o.gestures !== false;
    a.seed = 17 + a.idx * 31 + key.length * 7;
    buildFigure(a);
    s.actors.push(a);
    s.anims.push(function (t) { updFigure(a, t); });
    figMethods(a);
    return a;
  }

  function mkLimb(parent, o) {
    var Lm = { o: o };
    Lm.root = svg("g", null, parent);
    Lm.up = svg("path", { d: capsule(o.l1, o.w), fill: o.c1, stroke: INK, "stroke-width": 2.2 }, Lm.root);
    if (o.hatch) svg("path", { d: capsule(o.l1, o.w), fill: U("hatch") }, Lm.root);
    Lm.j = svg("g", { transform: "translate(0 " + o.l1 + ")" }, Lm.root);
    Lm.lo = svg("path", { d: capsule(o.l2, o.w * 0.92), fill: o.c2, stroke: INK, "stroke-width": 2.2 }, Lm.j);
    if (o.cuff) svg("path", { d: "M" + f1(-o.w * 0.48) + " " + f1(o.l2 - 3) + "H" + f1(o.w * 0.48), stroke: o.cuff, "stroke-width": 4, fill: "none" }, Lm.j);
    if (o.rolled) svg("path", { d: rrD(-o.w * 0.56, -o.w * 0.4, o.w * 1.12, 8, 3), fill: o.c1, stroke: INK, "stroke-width": 1.6 }, Lm.j);
    Lm.end = svg("g", { transform: "translate(0 " + o.l2 + ")" }, Lm.j);
    return Lm;
  }
  function handMarkup(skin, kind) {
    var o = SK(INK, 2), d = shade(skin, 0.85);
    if (kind === "fist" || kind === "hold") return C(0, 6, 8.6, skin, o) + P("M-5 4Q0 7 5 4", "none", SK(d, 1.2));
    if (kind === "point") return C(0, 5, 8, skin, o) + P(rrD(-3.2, 6, 6.4, 18, 3.2), skin, o);
    if (kind === "thumb") return C(0, 4, 8.6, skin, o) + P(rrD(-3.4, -16, 6.8, 16, 3.4), skin, o) + P("M-5 6H5M-5 10H4", "none", SK(d, 1.2));
    return P("M-8 2Q-10 16 -2 19Q8 21 9 10L13 4Q14 0 10 1L8 4Q8 -2 0 -2Q-8 -2 -8 2Z", skin, o) + P("M-4 12Q1 14 5 11", "none", SK(d, 1.2));
  }
  var HAND_PROPS = {
    phone: R(-7, -12, 14, 24, "#2B2420", 3, SK(INK, 1.6)) + R(-5, -9, 10, 17, "#8FB3C4", 1.5),
    briefcase: P("M-6 4V0Q-6 -3 -3 -3H3Q6 -3 6 0V4", "none", SK(INK, 2.2)) + R(-22, 4, 44, 30, "#8A5A3B", 4, SK(INK, 2.2)) + R(-22, 15, 44, 4, "#6E4530") + R(-4, 13, 8, 8, GOLD, 1, SK(INK, 1)),
    coffee: P("M-8 -14H10L8 12Q8 15 4 15H-3Q-7 15 -7 12Z", "#F4F1EA", SK(INK, 2)) + R(-8, -6, 18, 8, "#A9614A") + P("M10 -8Q17 -8 16 -1Q15 4 9 4", "none", SK(INK, 2)) + P("M-2 -18Q-5 -24 -1 -30M4 -18Q1 -24 5 -30", "none", SK("#B0A89A", 1.6)),
    wrench: P("M-2 6L22 -30", "none", SK(INK, 7)) + P("M-2 6L22 -30", "none", SK("#A9AFB3", 4)) + P("M18 -36Q22 -42 28 -38L24 -32L28 -28Q22 -24 18 -28Z", "#A9AFB3", SK(INK, 1.8)),
    money: '<g transform="rotate(-20)">' + R(-4, -24, 30, 16, "#9DBB86", 2, SK(INK, 1.4)) + "</g>" + '<g transform="rotate(-5)">' + R(-2, -26, 30, 16, "#A9C592", 2, SK(INK, 1.4)) + "</g>" + '<g transform="rotate(10)">' + R(0, -26, 30, 16, "#B5CF9E", 2, SK(INK, 1.4)) + C(15, -18, 4.5, "none", SK("#5F8A55", 1.4)) + "</g>",
    megaphone: P("M2 -8L30 -22V14L2 2Z", "#C8503C", SK(INK, 2)) + R(-6, -9, 10, 12, "#F2EADA", 2, SK(INK, 1.8)) + P("M36 -14Q42 -4 36 6M42 -20Q50 -4 42 12", "none", SK(INK, 1.6)),
    pen: P("M-3 8L16 -16L20 -12L1 12Z", "#3E6E8E", SK(INK, 1.6)) + P("M1 12L-4 14L-3 8Z", INK),
    mic: R(-4, -2, 8, 22, "#3B3C43", 3, SK(INK, 1.6)) + C(0, -8, 8, "#9EA3A6", SK(INK, 1.8)) + P("M-5 -10H5M-5 -6H5", "none", SK(INK, 0.8)),
  };
  var PROP_SYN = { cellphone: "phone", mobile: "phone", smartphone: "phone", case: "briefcase", bag: "briefcase", cup: "coffee", mug: "coffee", tea: "coffee", tool: "wrench", spanner: "wrench", cash: "money", bills: "money", dollars: "money", bullhorn: "megaphone", loudspeaker: "megaphone", pencil: "pen", microphone: "mic", plans: "blueprint", sheet: "blueprint", ipad: "tablet", deal: "contract", paper: "contract", document: "contract" };
  var TWO_HAND = { blueprint: 1, tablet: 1, contract: 1 };
  function propKey(n) { n = str(n).toLowerCase(); if (HAND_PROPS[n] || TWO_HAND[n]) return n; return PROP_SYN[n] || null; }
  function prop2Markup(kind) {
    var o = SK(INK, 2.2), m = "";
    if (kind === "tablet") {
      m += R(-21, -30, 42, 58, "#2B2420", 5, o) + R(-17, -25, 34, 46, "#E9EEF0", 2);
      m += P("M-13 14L-5 6L1 10L13 -6", "none", SK(ACC, 2.4)) + R(-13, -20, 16, 3, MUTED) + R(-13, -14, 24, 3, "#B8C1C6");
      return '<g transform="translate(42 -118) rotate(-6)">' + m + "</g>";
    }
    if (kind === "contract") {
      m += R(-24, -32, 48, 64, "#F4F1EA", 1, o);
      for (var i = 0; i < 6; i++) m += L(-16, -22 + i * 7, 16 - (i % 3) * 5, -22 + i * 7, "#9A9188", 1.4);
      m += P("M-14 22Q-8 14 -4 22T6 20", "none", SK(BLUEP, 1.6)) + C(14, 22, 5, ACC, SK(INK, 1));
      return '<g transform="translate(42 -114) rotate(-8)">' + m + "</g>";
    }
    m += P("M-40 -24L38 -30L40 24L-38 28Z", BLUEP, o) + P("M-40 -24Q-46 2 -38 28", "none", SK(INK, 2)) + E(-42, 2, 5, 27, tint(BLUEP, 0.2), SK(INK, 1.6));
    m += '<g transform="translate(0 0) scale(0.32)" opacity="0.9">' + sketchMarkup("gear", "#E9F0F5", false) + "</g>" + L(-30, -14, 28, -18, "#CFE0EA", 0.9) + L(-30, 16, 30, 13, "#CFE0EA", 0.9) + L(18, -22, 20, 20, "#CFE0EA", 0.9);
    return '<g transform="translate(42 -112) rotate(-8)">' + m + "</g>";
  }

  function buildFigure(a) {
    var s = a.s, cd = a.cd, o2 = SK(INK, 2.2), id = uid("f");
    var g = svg("g", { class: "fs-fig fs-fig-" + a.name }, s.L.actors);
    var el = { g: g };
    el.shadow = svg("ellipse", { cx: 4, cy: 0, rx: 46, ry: 7, fill: "rgba(43,36,32,0.22)" }, g);
    el.flip = svg("g", null, g);
    el.body = svg("g", null, el.flip);
    var sleeve = cd.outfit === "apron" ? U("plaid") : cd.outfit === "overalls" ? cd.shirt : cd.suit;
    if (cd.outfit === "suit" && cd.pinstripe) sleeve = U("pin");
    var rolled = cd.sleeves === "rolled";
    var cuff = cd.outfit === "suit" || cd.outfit === "blazer" ? "#F2EEE6" : null;
    var legC = cd.outfit === "overalls" ? cd.suit : cd.pants;
    el.legB = mkLimb(el.body, { l1: TH, l2: SH, w: 17, c1: shade(legC, 0.82), c2: shade(legC, 0.82), hatch: true });
    el.legF = mkLimb(el.body, { l1: TH, l2: SH, w: 17, c1: legC, c2: legC });
    [el.legB, el.legF].forEach(function (Lm, i) {
      Lm.shoe = svg("g", null, Lm.end);
      Lm.shoe.innerHTML = P("M-8 -2Q-9 -9 0 -9Q12 -9 18 -2Q20 3 14 4H-6Q-9 4 -8 -2Z", i ? cd.shoes : shade(cd.shoes, 0.85), o2) + (cd.shoes === "#E8E4DA" ? L(-6, 1, 16, 1, ACC, 2) : "");
    });
    el.torso = svg("g", null, el.body);
    // back arm (behind the torso)
    el.armB = mkLimb(el.torso, { l1: L1, l2: L2, w: 15, c1: typeof sleeve === "string" && sleeve.indexOf("url") === 0 ? sleeve : shade(sleeve, 0.84), c2: rolled ? shade(cd.skin, 0.88) : typeof sleeve === "string" && sleeve.indexOf("url") === 0 ? sleeve : shade(sleeve, 0.84), hatch: true, cuff: cuff, rolled: rolled });
    el.handB = handSet(el.armB.end, shade(cd.skin, 0.9));
    el.torsoArt = svg("g", null, el.torso);
    el.torsoArt.innerHTML = P("M-6 -150L12 -150L14 -136L-8 -136Z", shade(cd.skin, 0.9), SK(INK, 1.6)) + torsoMarkup(cd);
    el.prop2 = svg("g", null, el.torso);
    el.prop2s = {};
    ["blueprint", "tablet", "contract"].forEach(function (k2) { var pg = svg("g", null, el.prop2); pg.innerHTML = prop2Markup(k2); el.prop2s[k2] = pg; });
    // head
    el.head = svg("g", null, el.torso);
    el.headIn = svg("g", { transform: "scale(" + HSC + ")" }, el.head);
    var hs = HEADS[cd.head] || HEADS.square, hp = headPath(hs);
    var hb = svg("g", null, el.headIn);
    hb.innerHTML = hairMarkup(cd, "back");
    var ear = svg("g", null, el.headIn);
    ear.innerHTML = E(-HR * 0.42, HR * 0.08, 9, 13, cd.skin, o2) + P("M" + f1(-HR * 0.42 - 2) + " " + f1(HR * 0.08 - 6) + "q5 4 0 10", "none", SK(shade(cd.skin, 0.7), 1.4)) + (cd.earrings ? C(-HR * 0.42, HR * 0.08 + 14, 3.4, cd.earrings, SK(INK, 1.2)) : "");
    var cid = id + "hc", cp = svg("clipPath", { id: cid }, s.defs);
    svg("path", { d: hp }, cp);
    var hd = svg("g", null, el.headIn);
    hd.innerHTML = P(hp, cd.skin, "") + '<g clip-path="url(#' + cid + ')">' + P("M" + f1(-HR * 1.1) + " " + f1(-HR * 1.2) + "L" + f1(-HR * 0.5) + " " + f1(-HR * 1.2) + "Q" + f1(-HR * 0.66) + " 0 " + f1(-HR * 0.2) + " " + f1(HR * 1.4) + "L" + f1(-HR * 1.1) + " " + f1(HR * 1.4) + "Z", U("hatch")) + E(HR * 0.7, HR * 0.44, HR * 0.3, HR * 0.16, "#E58F7A", ' opacity="0.28"') + "</g>" + P(hp, "none", SK(INK, 2.4));
    if (cd.beard === "stubble") { var stb = ""; var rr0 = V.makeRand(a.seed); for (var q = 0; q < 26; q++) stb += C(HR * (0.0 + rr0() * 0.62), HR * (0.5 + rr0() * 0.44), 0.9, shade(cd.hair, 1.2), ' opacity="0.55"'); hd.innerHTML += '<g clip-path="url(#' + cid + ')">' + stb + "</g>"; }
    else if (cd.beard) hd.innerHTML += '<g clip-path="url(#' + cid + ')">' + P("M" + f1(-HR * 0.6) + " " + f1(HR * 0.2) + "Q" + f1(-HR * 0.3) + " " + f1(HR * 0.9) + " " + f1(HR * 0.3) + " " + f1(HR * 0.86) + "Q" + f1(HR * 0.86) + " " + f1(HR * 0.7) + " " + f1(HR * 0.96) + " " + f1(HR * 0.42) + "L" + f1(HR * 0.96) + " " + f1(HR * 1.6) + "L" + f1(-HR * 0.6) + " " + f1(HR * 1.6) + "Z", typeof cd.beard === "string" && isHex(cd.beard) ? cd.beard : cd.hair, SK(INK, 1.6)) + "</g>";
    el.face = svg("g", null, el.headIn);
    // eyes (near at +x, far at -x, a little narrower)
    el.eyes = [[HR * 0.5, -HR * 0.08, 1], [HR * 0.08, -HR * 0.1, 0.82]].map(function (q, k2) {
      var eg = svg("g", { transform: "translate(" + f1(q[0]) + " " + f1(q[1]) + ")" }, el.face), erx = 7.6 * q[2], ery = 9.6, ecid = id + "e" + k2;
      var ecp = svg("clipPath", { id: ecid }, s.defs);
      svg("ellipse", { rx: erx, ry: ery }, ecp);
      var e = { g: eg, x: q[0], y: q[1], rx: erx, ry: ery };
      e.b = svg("g", null, eg);
      svg("ellipse", { rx: erx, ry: ery, fill: "#FBF8F1", stroke: INK, "stroke-width": 1.8 }, e.b);
      e.pg = svg("g", null, e.b);
      svg("circle", { r: 3.8, fill: INK }, e.pg);
      svg("circle", { cx: -1.1, cy: -1.3, r: 1.1, fill: "#FFFFFF" }, e.pg);
      e.lidT = svg("rect", { x: -erx - 2, width: erx * 2 + 4, height: ery * 3, fill: cd.skin, stroke: INK, "stroke-width": 1.6, "clip-path": "url(#" + ecid + ")" }, e.b);
      e.lidB = svg("rect", { x: -erx - 2, width: erx * 2 + 4, height: ery * 3, fill: cd.skin, "clip-path": "url(#" + ecid + ")" }, e.b);
      e.arc = svg("path", { d: "M" + f1(-erx) + " 2Q0 " + f1(-ery) + " " + f1(erx) + " 2", fill: "none", stroke: INK, "stroke-width": 2.4, "stroke-linecap": "round" }, eg);
      return e;
    });
    el.nose = svg("g", null, el.face);
    el.nose.innerHTML = noseMarkup(cd.nose, cd.skin);
    // mouth
    el.mouthG = svg("g", { transform: "translate(" + f1(HR * 0.5) + " " + f1(HR * 0.58) + ")" }, el.face);
    var mcid = id + "m", mcp = svg("clipPath", { id: mcid }, s.defs);
    el.mclip = svg("path", null, mcp);
    el.mouth = svg("path", { fill: "#6A2A2E", stroke: INK, "stroke-width": 2, "stroke-linejoin": "round" }, el.mouthG);
    el.teeth = svg("rect", { x: -30, width: 60, fill: "#FBF8F1", "clip-path": "url(#" + mcid + ")" }, el.mouthG);
    el.tongue = svg("ellipse", { fill: "#D9726E", "clip-path": "url(#" + mcid + ")" }, el.mouthG);
    el.lips = cd.lips ? svg("path", { fill: "none", stroke: cd.lips, "stroke-width": 2.2, opacity: 0.85 }, el.mouthG) : null;
    if (cd.moustache) { var mc = typeof cd.moustache === "string" && isHex(cd.moustache) ? cd.moustache : cd.hair; el.stache = svg("path", { d: "M" + f1(HR * 0.14) + " " + f1(HR * 0.44) + "Q" + f1(HR * 0.5) + " " + f1(HR * 0.22) + " " + f1(HR * 0.9) + " " + f1(HR * 0.4) + "Q" + f1(HR * 0.86) + " " + f1(HR * 0.56) + " " + f1(HR * 0.5) + " " + f1(HR * 0.48) + "Q" + f1(HR * 0.24) + " " + f1(HR * 0.6) + " " + f1(HR * 0.14) + " " + f1(HR * 0.44) + "Z", fill: mc, stroke: INK, "stroke-width": 1.8 }, el.face); }
    // glasses
    if (cd.glasses) {
      var gl = svg("g", null, el.face), gm = "";
      if (cd.glasses === "round") gm += C(HR * 0.5, -HR * 0.08, 13, "rgba(255,255,255,0.18)", SK(INK, 2.4)) + C(HR * 0.08, -HR * 0.1, 11, "rgba(255,255,255,0.18)", SK(INK, 2.4));
      else gm += P(rrD(HR * 0.5 - 13, -HR * 0.08 - 9, 26, 18, 4), "rgba(255,255,255,0.18)", SK(INK, 2.6)) + P(rrD(HR * 0.08 - 10.5, -HR * 0.1 - 9, 21, 18, 4), "rgba(255,255,255,0.18)", SK(INK, 2.6));
      gm += P("M" + f1(HR * 0.08 + (cd.glasses === "round" ? 11 : 10.5)) + " " + f1(-HR * 0.12) + "Q" + f1(HR * 0.29) + " " + f1(-HR * 0.2) + " " + f1(HR * 0.5 - (cd.glasses === "round" ? 13 : 13)) + " " + f1(-HR * 0.1), "none", SK(INK, 2.2)) + L(HR * 0.08 - 11, -HR * 0.1, -HR * 0.36, -HR * 0.02, INK, 2.2);
      gl.innerHTML = gm;
    }
    var bcol = cd.browColor || (cd.brows === "white" ? "#E9E5DC" : shade(cd.hair === "#F1EEE8" || cd.hair === "#CFCCC6" ? "#8E8A84" : cd.hair, 0.9));
    var bw = cd.brows === "bushy" ? 5.6 : cd.brows === "thick" ? 4.6 : cd.brows === "thin" ? 2.6 : cd.brows === "white" ? 5 : 3.6;
    el.brows = [[HR * 0.5, 1], [HR * 0.08, 0.82]].map(function (q) { return svg("path", { d: "M" + f1(-9 * q[1]) + " 1.4Q0 -2.6 " + f1(9 * q[1]) + " 0.6", fill: "none", stroke: bcol, "stroke-width": bw, "stroke-linecap": "round", "data-x": q[0] }, el.face); });
    if (cd.brows === "white" || cd.brows === "bushy") el.brows.forEach(function (b) { b.setAttribute("stroke-width", bw + 1.6); });
    el.hairF = svg("g", null, el.headIn);
    el.hairF.innerHTML = hairMarkup(cd, "front") + (cd.hat ? hatMarkup(cd) : "");
    // front arm, after the head so hands can reach the face
    el.armF = mkLimb(el.torso, { l1: L1, l2: L2, w: 15, c1: sleeve, c2: rolled ? cd.skin : sleeve, cuff: cuff, rolled: rolled });
    el.hprop = svg("g", null, el.armF.end);
    el.hprops = {};
    Object.keys(HAND_PROPS).forEach(function (k3) { var pg = svg("g", { transform: "translate(0 6)" }, el.hprop); pg.innerHTML = HAND_PROPS[k3]; el.hprops[k3] = pg; });
    el.handF = handSet(el.armF.end, cd.skin);
    a.el = el;
  }
  function handSet(parent, skin) {
    var hs = { g: svg("g", null, parent), k: {} };
    ["open", "fist", "point", "thumb"].forEach(function (k) { var g = svg("g", null, hs.g); g.innerHTML = handMarkup(skin, k); hs.k[k] = g; });
    hs.k.hold = hs.k.fist;
    return hs;
  }

  function lookVec(a, spec, t, hx, hy, flip) {
    if (spec == null || spec === "auto" || spec === "forward") return [0.6, 0.05];
    if (spec === "camera") return [-0.1, 0.05];
    if (spec === "up") return [0.4, -0.85];
    if (spec === "down") return [0.45, 0.8];
    if (spec === "left" || spec === "right") return [(spec === "left" ? -1 : 1) * flip, 0];
    var tx, ty;
    if (spec.__fig) { var hp = spec.headRest(t); tx = hp[0]; ty = hp[1]; }
    else if (typeof spec === "number") { tx = spec; ty = hy; }
    else { tx = num(spec.x, hx); ty = num(spec.y, hy); }
    var dx = tx - hx, dy = ty - hy, dist = Math.sqrt(dx * dx + dy * dy) || 1;
    return [clamp((dx / dist) * flip, -1, 1), clamp(dy / dist, -1, 1)];
  }
  function mouthAt(a, t) {
    for (var i = 0; i < a.talks.length; i++) {
      var w = a.talks[i];
      if (t < w.from - 0.05 || t > w.to + 0.25) continue;
      var env = smooth((t - w.from + 0.05) / 0.25) * smooth((w.to + 0.25 - t) / 0.3), amp = 0, v = "A";
      for (var j = 0; j < w.syl.length; j++) {
        var q = w.syl[j];
        if (t >= q.t0 && t < q.t1) { amp = Math.pow(Math.sin((PI * (t - q.t0)) / (q.t1 - q.t0)), 0.8) * q.k; v = q.v; break; }
      }
      return { amp: amp, v: v, env: env };
    }
    return { amp: 0, v: "A", env: 0 };
  }
  function blinkAt(a, t) {
    var tb = 0.6 + hash(a.seed) * 1.6, k = 0;
    while (tb < t + 0.2 && k < 400) {
      if (t >= tb && t < tb + 0.16) return Math.sin((PI * (t - tb)) / 0.16);
      tb += 2.4 + hash(a.seed + ++k * 1.37) * 2.8;
    }
    return 0;
  }
  // rig at time t: joint angles and world anchors (cached per frame)
  function rigAt(a, t) {
    if (a._rt === t && a._r) return a._r;
    var pv = Object.assign({}, a.poseTr.val(t)), pk = a.poseName.key(t), pname = pk.v, since = t - pk.at, PD = POSES[pname] || {};
    var flip = clamp(a.faceTr.val(t), -1, 1), pos = a.pos.val(t), wk = since < 0 ? 1 : smooth(since / 0.3);
    var legF = 3, legB = -3, kneeF = 0, kneeB = 0, bob = 0;
    a.walks.forEach(function (w) {
      if (t < w.t0 || t > w.t1 + 0.06) return;
      var dist = Math.abs(pos.x - w.x0) / a.us, fade = clamp(Math.min((t - w.t0) / 0.14, (w.t1 + 0.06 - t) / 0.14), 0, 1);
      var ph = (dist / 40) * 2 * PI, sn = Math.sin(ph) * fade, cs = Math.cos(ph) * fade;
      legF += 26 * sn; legB -= 26 * sn; kneeF += Math.max(0, 36 * -cs); kneeB += Math.max(0, 36 * cs);
      pv.fa -= 16 * sn * fade; pv.ba += 16 * sn * fade;
      bob += 2.2 * Math.abs(Math.cos(ph)) * fade;
    });
    var tt = t * 2 * PI, osc = PD.osc;
    if (osc === "wave") pv.fe += 22 * Math.sin(tt * 1.7) * wk;
    else if (osc === "bounce") { pv.hop += 7 * Math.abs(Math.sin(tt * 1.2)) * wk; pv.fa += 7 * Math.sin(tt * 2.4) * wk; pv.ba -= 7 * Math.sin(tt * 2.4 + 1) * wk; }
    else if (osc === "pump") { var pu_ = Math.sin(tt * 1.8); pv.fa += 10 * pu_ * wk; pv.fe -= 12 * pu_ * wk; pv.hop += 2.5 * Math.abs(pu_) * wk; }
    else if (osc === "tinker") { pv.fe += 10 * Math.sin(tt * 2.6) * wk; }
    else if (osc === "nod") pv.nod += 9 * Math.sin(tt * 1.6) * wk * clamp(1 - (since - 1.8) / 0.4, 0, 1);
    else if (osc === "shake") pv.tilt += 6 * Math.sin(tt * 2.2) * wk * clamp(1 - (since - 1.8) / 0.4, 0, 1);
    var m = mouthAt(a, t);
    // idle life: breathing, small sway
    pv.sh += 0.8 * Math.sin(t * 2.0 + a.seed);
    pv.tilt += 1.4 * Math.sin(t * 0.7 + a.seed);
    pv.lean += 0.8 * Math.sin(t * 0.55 + a.seed * 0.3);
    if (m.env > 0) {
      pv.nod += 3 * m.amp;
      pv.tilt += 2.2 * Math.sin(t * 1.9 + a.seed) * m.env;
      var gk = a.gestures ? GESTURE_POSE[pname] || 0 : 0;
      if (gk) {
        pv.fa += 8 * Math.sin(t * 2.5 + a.seed) * m.env * gk;
        pv.fe += 14 * Math.sin(t * 3.6 + a.seed * 2) * m.env * gk;
        pv.ba += 5 * Math.sin(t * 2.1 + a.seed) * m.env * gk;
        pv.be += 7 * Math.sin(t * 3.1 + a.seed) * m.env * gk;
      }
    }
    var r = { t: t, pv: pv, pname: pname, PD: PD, flip: flip, x: pos.x, y: pos.y, legF: legF, legB: legB, kneeF: kneeF, kneeB: kneeB, bob: bob, mouth: m };
    // world anchors: head centre (with lean and nod), hands
    var us = a.us, lr = rad(pv.lean);
    function rotHip(p) { var dx = p[0], dy = p[1] - HIPY; return [dx * Math.cos(lr) - dy * Math.sin(lr), HIPY + dx * Math.sin(lr) + dy * Math.cos(lr)]; }
    var hl = rotHip([HEAD0[0] + pv.nod * 0.3, HEAD0[1] - pv.sh * 0.4 + Math.abs(pv.nod) * 0.1]);
    r.headL = hl;
    r.w = function (p) { return [pos.x + us * flip * p[0], pos.y + us * (p[1] - pv.hop - bob)]; };
    r.hw = r.w(hl);
    function handL(S0, fa, fe) {
      var a1 = rad(fa), a2 = rad(fa + fe), sx = S0[0], sy = S0[1] - pv.sh;
      return rotHip([sx + Math.sin(a1) * L1 + Math.sin(a2) * (L2 + 6), sy + Math.cos(a1) * L1 + Math.cos(a2) * (L2 + 6)]);
    }
    r.handF = r.w(handL(SFRONT, pv.fa, pv.fe));
    r.handB = r.w(handL(SBACK, pv.ba, pv.be));
    a._rt = t; a._r = r;
    return r;
  }
  function setLimb(Lm, S0, a1, a2) { setA(Lm.root, "transform", "translate(" + f1(S0[0]) + " " + f1(S0[1]) + ") rotate(" + f1(-a1) + ")"); setA(Lm.j, "transform", "translate(0 " + Lm.o.l1 + ") rotate(" + f1(-a2) + ")"); }
  function showHand(hs, kind) { for (var k in hs.k) if (k !== "hold") showEl(hs.k[k], false); showEl((hs.k[kind] || hs.k.open), true); }
  function updFigure(a, t) {
    var el = a.el, on = a.vis.val(t) > 0.5;
    showEl(el.g, on);
    if (!on) return;
    var r = rigAt(a, t), pv = r.pv, PD = r.PD;
    setA(el.g, "transform", "translate(" + f1(r.x) + " " + f1(r.y) + ") scale(" + a.us.toFixed(4) + ")");
    setA(el.flip, "transform", "scale(" + f2(Math.abs(r.flip) < 0.05 ? 0.05 * (r.flip < 0 ? -1 : 1) : r.flip) + " 1)");
    setA(el.body, "transform", "translate(0 " + f1(-pv.hop - r.bob) + ")");
    setA(el.shadow, "rx", f1(46 * clamp(1 - pv.hop * 0.02, 0.6, 1)));
    // legs (feet stay on the ground: legs are fixed length, the hip rides the bob)
    setLimb(el.legB, [-9, HIPY + 2], r.legB, -r.kneeB);
    setLimb(el.legF, [8, HIPY + 2], r.legF, -r.kneeF);
    setA(el.legB.end, "transform", "translate(0 " + SH + ") rotate(" + f1(r.legB - r.kneeB) + ")");
    setA(el.legF.end, "transform", "translate(0 " + SH + ") rotate(" + f1(r.legF - r.kneeF) + ")");
    setA(el.torso, "transform", "rotate(" + f2(pv.lean) + " 0 " + HIPY + ")");
    var shY = -pv.sh;
    setLimb(el.armB, [SBACK[0], SBACK[1] + shY], pv.ba, pv.be);
    setLimb(el.armF, [SFRONT[0], SFRONT[1] + shY], pv.fa, pv.fe);
    // hands and props
    var hold = null, hold2 = null;
    for (var i = 0; i < a.holds.length; i++) { var q = a.holds[i]; if (t >= q.at && t < q.until) { if (TWO_HAND[q.name]) hold2 = q.name; else hold = q.name; } }
    var hprop = hold || PD.prop || null, p2 = hold2 || PD.prop2 || null;
    var fh = hprop ? "hold" : PD.fh || "open", bh = p2 ? "hold" : PD.bh || "open";
    if (fh === "open" && !PD.fh) fh = pv.fe > 40 ? "open" : "fist";
    showHand(el.handF, fh); showHand(el.handB, bh);
    var worldF = PD.fw || hprop;
    setA(el.armF.end, "transform", "translate(0 " + L2 + ")" + (worldF ? " rotate(" + f1(pv.fa + pv.fe - pv.lean) + ")" : ""));
    setA(el.armB.end, "transform", "translate(0 " + L2 + ")");
    for (var k in el.hprops) showEl(el.hprops[k], k === hprop);
    for (var k2 in el.prop2s) showEl(el.prop2s[k2], k2 === p2);
    // head
    var hx = HEAD0[0] + pv.nod * 0.3, hy = HEAD0[1] + shY * 0.4 + Math.abs(pv.nod) * 0.1;
    setA(el.head, "transform", "translate(" + f1(hx) + " " + f1(hy) + ") rotate(" + f1(pv.tilt + pv.nod * 0.55) + ")");
    var ex = a.exTr.val(t), m = r.mouth;
    // gaze
    var lk, li = -1;
    for (var j = 0; j < a.looks.length; j++) if (a.looks[j].at <= t) li = j;
    var poseLook = PD.look || "auto";
    if (li < 0) lk = lookVec(a, poseLook, t, r.hw[0], r.hw[1], r.flip < 0 ? -1 : 1);
    else {
      var cur = a.looks[li], spec = cur.spec === "auto" ? poseLook : cur.spec, lkc = lookVec(a, spec, t, r.hw[0], r.hw[1], r.flip < 0 ? -1 : 1);
      var prev = li > 0 ? a.looks[li - 1].spec : poseLook, lkp = lookVec(a, prev === "auto" ? poseLook : prev, t, r.hw[0], r.hw[1], r.flip < 0 ? -1 : 1), bl = smooth((t - cur.at) / 0.22);
      lk = [lerp(lkp[0], lkc[0], bl), lerp(lkp[1], lkc[1], bl)];
    }
    setA(el.face, "transform", "translate(" + f1(lk[0] * 1.6) + " " + f1(pv.nod * 0.12 + lk[1] * 1.4) + ")");
    var blink = blinkAt(a, t);
    el.eyes.forEach(function (e, k4) {
      var arc = ex.arc > 0.5;
      showEl(e.b, !arc); showEl(e.arc, arc);
      var lt = ex.lt + (1 - ex.lt) * blink, lb = ex.lb, sg = k4 ? -1 : 1;
      setA(e.lidT, "y", f2(-e.ry * 3 - e.ry + 2 * e.ry * lt));
      setA(e.lidT, "transform", "rotate(" + f2(-sg * ex.ba * 12) + ")");
      setA(e.lidB, "y", f2(e.ry - 2 * e.ry * lb));
      setA(e.pg, "transform", "translate(" + f2(lk[0] * 2.6) + " " + f2(lk[1] * 2.6) + ") scale(" + f2(ex.pu) + ")");
    });
    el.brows.forEach(function (b, k5) {
      var sg = k5 ? -1 : 1, x = num(b.getAttribute("data-x"), 0);
      var raise = ex.by + (sg < 0 ? ex.bs * 0.9 : -ex.bs * 0.2), y = -HR * 0.38 - raise * HR * 0.13;
      setA(b, "transform", "translate(" + f1(x) + " " + f1(y) + ") rotate(" + f1(-sg * ex.ba * 16) + ")");
    });
    var w = HR * 0.3 * ex.mw, c = ex.sm * HR * 0.12, o = ex.mo * HR * 0.36, mr = ex.mr;
    if (m.amp > 0.001) {
      var vv = VIS[m.v] || VIS.A;
      w *= lerp(1, vv.w, m.amp);
      o = Math.max(o * (1 - m.amp * 0.3), m.amp * vv.o * HR * 0.34);
      mr = lerp(mr, vv.r, m.amp);
      c *= 1 - 0.35 * m.amp;
    }
    var md = mouthD(w, c, o, mr, ex.ma);
    setA(el.mouth, "d", md);
    setA(el.mclip, "d", md);
    if (el.lips) setA(el.lips, "d", md);
    var top_ = Math.min(-c - w * 0.3, c * 0.5 - o * 0.28) - 1;
    setA(el.teeth, "y", f2(top_)); setA(el.teeth, "height", f2(Math.max(0, c * 0.5 - o * 0.28 - top_ + o * 0.42 * ex.te)));
    setA(el.tongue, "cx", 0); setA(el.tongue, "cy", f2(c * 0.5 + o * 0.95)); setA(el.tongue, "rx", f2(w * 0.55)); setA(el.tongue, "ry", f2(o * 0.42));
  }

  function figMethods(a) {
    var s = a.s;
    function T0(at) { return tc0(at == null ? 0 : at); }
    a.moveX = function (t) { return a.pos.val(t == null ? V.time() : t).x; };
    a.headRest = function (t) { var p = a.pos.val(t == null ? 0 : t), f = a.faceTr.val(t == null ? 0 : t) < 0 ? -1 : 1; return [p.x + a.us * f * HEAD0[0], p.y + a.us * HEAD0[1]]; };
    a.anchorAt = function (t) { var r = rigAt(a, t); return { head: r.hw, handF: r.handF, handB: r.handB, feet: [r.x, r.y], r: HR * HSC * a.us, side: r.flip < 0 ? -1 : 1 }; };
    a.box = function (t, full) { return figBox(a, t == null ? V.time() : t, full); };
    a.pose = function (name, at, dur, ease) {
      var k = poseKey(name), t0 = T0(at), d = dur == null ? 0.5 : Math.max(0, num(dur, 0.5));
      a.poseTr.to(poseVec(k), t0, d, ease || "pose");
      a.poseName.set(k, t0);
      return a;
    };
    a.expression = function (name, at, dur) { a.exTr.to(exprVec(name), T0(at), dur == null ? 0.3 : num(dur, 0.3), "inOutSine"); return a; };
    a.face = function (dir, at) {
      var t0 = T0(at), cur = a.faceTr.val(t0 + 1e-4), v = dir === "left" ? -1 : dir === "right" ? 1 : dir === "flip" ? -cur : cur;
      if (v !== cur) a.faceTr.to(v, t0, 0.24, "inOutSine");
      return a;
    };
    a.lookAt = function (target, at) { a.looks.push({ at: T0(at), spec: target == null ? "auto" : target }); a.looks.sort(function (p, q) { return p.at - q.at; }); return a; };
    a.say = function (from, to, text) {
      var f0 = T0(from), t1 = to == null ? D : tc0(to);
      if (t1 <= f0) t1 = Math.min(D, f0 + 0.6);
      var ws = (V.words || []).filter(function (w) { return w.start >= f0 - 0.05 && w.start < t1; }), syl = [];
      if (ws.length) {
        ws.forEach(function (w, i) {
          var nx = ws[i + 1] ? ws[i + 1].start : w.end, e = Math.min(w.end, nx, w.start + 0.75);
          if (e - w.start < 0.1) e = w.start + 0.1;
          syl = syl.concat(sylls(w.word, w.start, e, a.seed + i * 7));
        });
      } else {
        var toks = str(text || V.narration).split(/\s+/).filter(Boolean);
        var n = toks.length || Math.max(2, Math.round((t1 - f0) / 0.34)), wd = (t1 - f0) / n;
        for (var i = 0; i < n; i++) {
          var s0 = f0 + i * wd, pause = (i + 1) % 7 === 0 ? 0.45 : 0.85;
          syl = syl.concat(sylls(toks[i] || "ba", s0, s0 + wd * pause, a.seed + i * 5));
        }
      }
      a.talks.push({ from: f0, to: t1, syl: syl });
      return a;
    };
    a.moveTo = function (x, at, dur) {
      var t0 = T0(at), x0 = a.pos.val(t0).x, tx = num(x, x0), dist = Math.abs(tx - x0);
      var d = dur == null ? Math.max(0.4, dist / (a.us * 60)) : Math.max(0.15, num(dur, 1.2));
      if (t0 + d > D) d = Math.max(0.15, D - t0);
      if (dist < 1) return a;
      var dir = tx >= x0 ? 1 : -1;
      if ((a.faceTr.val(t0) < 0 ? -1 : 1) !== dir) a.faceTr.to(dir, t0, 0.2, "inOutSine");
      a.pos.to({ x: tx }, t0, d, function (p) { return p < 0.12 ? (p * p) / 0.24 : p > 0.88 ? 1 - ((1 - p) * (1 - p)) / 0.24 : 0.06 + (p - 0.12) * (0.88 / 0.76); });
      a.walks.push({ t0: t0, t1: t0 + d, x0: x0 });
      return a;
    };
    a.walkTo = a.moveTo;
    a.enter = function (side, at, dur, x) {
      var t0 = T0(at), tx = x == null ? a.x0 : num(x, a.x0), sd = side === "right" ? 1 : -1, sx = tx + sd * (s.Ww * 0.6 + 140);
      a.pos.set({ x: sx }, 0);
      a.vis.set(0, 0); a.vis.set(1, t0);
      var keep = a.faceTr.val(t0);
      a.moveTo(tx, t0, dur == null ? 1.3 : dur);
      a.faceTr.to(keep, t0 + (dur == null ? 1.3 : num(dur, 1.3)), 0.2, "inOutSine");
      return a;
    };
    a.exit = function (side, at, dur) {
      var t0 = T0(at), x0 = a.pos.val(t0).x, sd = side === "left" ? -1 : 1, d = dur == null ? 1.2 : num(dur, 1.2);
      a.moveTo(x0 + sd * (s.Ww * 0.7 + 160), t0, d);
      a.vis.set(0, Math.min(D, t0 + d));
      return a;
    };
    a.hold = function (prop, at, until) {
      var k = propKey(prop);
      if (!k) return a;
      var t0 = T0(at), t1 = until == null ? D + 1 : num(until, D + 1);
      a.holds.push({ name: k, at: t0, until: t1 });
      if (TWO_HAND[k]) {
        var back = a.poseName.key(t0 - 1e-4).v;
        a.pose(k, t0, 0.45);
        if (t1 < D) a.pose(TWO_HAND[back] ? "idle" : back, t1, 0.45);
      }
      return a;
    };
    a.emote = function (mark, at, dur) { addMark(a, mark, T0(at), dur == null ? 1.6 : num(dur, 1.6)); return a; };
    // beats: [{ word | at, pose, expression, mark, look }]; o.after = a pose to settle into after each beat
    // (or a time to start searching from); o.from = search start time.
    a.beats = function (list, o) {
      o = obj(o);
      var from = typeof o.after === "number" ? o.after : num(o.from, 0), settle = typeof o.after === "string" ? o.after : o.settle;
      var prev = from, items = [];
      arr(list).slice(0, 6).forEach(function (b) {
        b = obj(b);
        var t = b.at != null ? num(b.at, 0) : kwFind(b.word, prev);
        if (t == null) return;
        t = tc(t);
        prev = t + 0.01;
        items.push({ t: t, b: b });
      });
      items.forEach(function (it, i) {
        var t = it.t, b = it.b, next = items[i + 1] ? items[i + 1].t : 1e9;
        if (b.pose) a.pose(b.pose, t - 0.15);
        if (b.expression) a.expression(b.expression, t - 0.1);
        if (b.mark) a.emote(b.mark, t, 1.5);
        if (b.look) a.lookAt(b.look, t - 0.1);
        if (settle && b.pose && next - t > 2.4 && t + 1.9 < endLimit()) a.pose(settle, t + 1.9, 0.55);
      });
      return a;
    };
    a.show = function (at) { a.vis.set(1, T0(at)); return a; };
    a.hide = function (at) { a.vis.set(0, T0(at)); return a; };
    a.x = a.x0;
    a.y = a.y0;
    return a;
  }
  // world box of the head (and the upper body when full)
  function figBox(a, t, full) {
    var r = rigAt(a, t), R0 = HR * HSC * a.us, hx = r.hw[0], hy = r.hw[1];
    var x0 = hx - R0 * 1.08, x1 = hx + R0 * 1.2, y0 = hy - R0 * 1.24, y1 = hy + R0 * 1.0;
    if (full) { x0 = Math.min(x0, r.x - 34 * a.us); x1 = Math.max(x1, r.x + 34 * a.us); y1 = r.y; [r.handF, r.handB].forEach(function (p) { x0 = Math.min(x0, p[0] - 10 * a.us); x1 = Math.max(x1, p[0] + 10 * a.us); y0 = Math.min(y0, p[1] - 10 * a.us); }); }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  // ------------------------- marks (emotes) -------------------------
  var MARKS = ["sweat", "exclaim", "question", "idea", "dollar", "anger", "sparkle", "zzz", "check", "cross"];
  var MARK_SYN = { drop: "sweat", nervous: "sweat", "!": "exclaim", alert: "exclaim", wow: "exclaim", "?": "question", confused: "question", bulb: "idea", lightbulb: "idea", money: "dollar", cash: "dollar", "$": "dollar", mad: "anger", angry: "anger", star: "sparkle", stars: "sparkle", shine: "sparkle", sleep: "zzz", tired: "zzz", yes: "check", ok: "check", tick: "check", no: "cross", x: "cross", wrong: "cross" };
  function markKey(n) { n = str(n).toLowerCase(); return MARKS.indexOf(n) >= 0 ? n : MARK_SYN[n] || null; }
  function markMarkup(k) {
    var o = SK(INK, 2.4);
    if (k === "sweat") return P("M0 -14Q8 -2 6 4Q4 10 0 10Q-6 10 -6 4Q-6 -2 0 -14Z", "#9CC6DE", o) + P("M-2 2Q-2 6 1 7", "none", SK("#FFFFFF", 1.6));
    if (k === "exclaim") return P("M-5 -30L5 -30L3 2L-3 2Z", ACC, o) + C(0, 11, 5, ACC, o);
    if (k === "question") return P("M-10 -18Q-10 -32 2 -32Q14 -32 14 -20Q14 -12 4 -8Q2 -6 2 0", "none", SK(INK, 9)) + P("M-10 -18Q-10 -32 2 -32Q14 -32 14 -20Q14 -12 4 -8Q2 -6 2 0", "none", SK("#E2B03C", 5)) + C(2, 10, 5, "#E2B03C", o);
    if (k === "idea") return P("M0 -30Q-16 -30 -16 -14Q-16 -6 -8 0V6H8V0Q16 -6 16 -14Q16 -30 0 -30Z", "#F4D873", o) + R(-8, 6, 16, 8, "#B9B0A0", 2, o) + P("M-26 -26L-20 -22M26 -26L20 -22M0 -40V-34M-30 -10H-23M30 -10H23", "none", SK(INK, 2.4));
    if (k === "dollar") return '<text x="0" y="12" text-anchor="middle" font-family=\'' + SERIF + "' font-weight=\"900\" font-size=\"40\" fill=\"#5F8A55\" stroke=\"" + INK + '" stroke-width="1.8" paint-order="stroke">$</text>';
    if (k === "anger") return P("M-12 -4Q-4 -4 -4 -12M4 -12Q4 -4 12 -4M12 4Q4 4 4 12M-4 12Q-4 4 -12 4", "none", SK(ACC, 4.4));
    if (k === "sparkle") return P(starD(0, 0, 16, 4, 4, 0), "#F4D873", o) + P(starD(22, -16, 8, 2, 4, 0), "#F4D873", SK(INK, 1.6));
    if (k === "zzz") return '<text x="0" y="0" font-family=\'' + SANS + "' font-weight=\"900\" font-size=\"26\" fill=\"#E9EEF0\" stroke=\"" + INK + '" stroke-width="1.6" paint-order="stroke">Z</text><text x="16" y="-18" font-family=\'' + SANS + "' font-weight=\"900\" font-size=\"18\" fill=\"#E9EEF0\" stroke=\"" + INK + '" stroke-width="1.4" paint-order="stroke">Z</text>';
    if (k === "check") return C(0, 0, 16, "#6E9A60", o) + P("M-8 0L-2 7L9 -7", "none", SK("#FFFFFF", 4.4));
    if (k === "cross") return C(0, 0, 16, ACC, o) + P("M-7 -7L7 7M7 -7L-7 7", "none", SK("#FFFFFF", 4.4));
    return "";
  }
  function addMark(a, mark, at, dur) {
    var k = markKey(mark);
    if (!k) return;
    var s = a.s, g = svg("g", { class: "fs-mark" }, s.L.fx), inner = svg("g", null, g);
    inner.innerHTML = markMarkup(k);
    var mk = { a: a, k: k, at: at, dur: Math.min(dur, Math.max(0.4, D - at)), g: g, inner: inner };
    a.marks.push(mk);
    s.anims.push(function (t) {
      var on = t >= mk.at && t < mk.at + mk.dur;
      showEl(g, on);
      if (!on) return;
      var r = rigAt(a, t), R0 = HR * HSC * a.us, side = r.flip < 0 ? -1 : 1, lt = t - mk.at, sc = a.us * 1.15;
      var px, py;
      if (k === "sweat") { px = r.hw[0] - side * R0 * 0.62; py = r.hw[1] - R0 * 0.6 + lt * 22 * a.us; }
      else if (k === "anger") { px = r.hw[0] - side * R0 * 0.7; py = r.hw[1] - R0 * 0.9; }
      else if (k === "zzz") { px = r.hw[0] + side * R0 * 0.9 + lt * 10; py = r.hw[1] - R0 * 1.3 - lt * 16; }
      else if (s.portrait) { px = r.hw[0] - side * R0 * 1.05; py = r.hw[1] - R0 * 1.12 + Math.sin(lt * 5) * 4 * a.us; }
      else { px = r.hw[0] + side * R0 * 0.95; py = r.hw[1] - R0 * 1.42 + Math.sin(lt * 5) * 4 * a.us; }
      var pk = popK(t, mk.at, 0.3), fade = clamp((mk.at + mk.dur - t) / 0.25, 0, 1);
      setA(g, "transform", "translate(" + f1(px) + " " + f1(py) + ")");
      setA(inner, "transform", "scale(" + f2(sc * pk) + ")" + (k === "anger" ? " rotate(" + f1(Math.sin(lt * 18) * 6) + ")" : ""));
      setA(g, "opacity", f2(fade));
    });
  }

  // ------------------------- safe area, positions -------------------------
  function safe() {
    var x0, y0, x1, y1;
    if (V.isPortrait) { x0 = W * (60 / 1080); x1 = W * (1020 / 1080); y0 = H * (250 / 1920); y1 = H * (1450 / 1920); }
    else { x0 = W * 0.07; x1 = W * 0.93; y0 = H * 0.07; y1 = H * 0.93; }
    return { x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
  var NAMED = {
    right: [0.7, 0.45], left: [0.3, 0.45], top: [0.5, 0.2], bottom: [0.5, 0.8], centre: [0.5, 0.5], center: [0.5, 0.5], middle: [0.5, 0.5],
    "top-right": [0.72, 0.22], "top-left": [0.28, 0.22], "bottom-right": [0.72, 0.78], "bottom-left": [0.28, 0.78],
  };
  function posOf(pos, def) {
    if (pos && typeof pos === "object") return { x: clamp(num(pos.x, 0.5), 0, 1), y: clamp(num(pos.y, 0.5), 0, 1) };
    var k = str(pos).toLowerCase(), q = NAMED[k] || NAMED[str(def).toLowerCase()] || NAMED.centre;
    if (V.isPortrait && (k === "right" || k === "left")) q = [0.5, 0.42];
    return { x: q[0], y: q[1] };
  }
  // top-left of a w x h box centred on fractions (fx, fy), kept inside the safe area
  function placeBox(fx, fy, w, h) {
    var sf = safe();
    return { x: clamp(fx * W - w / 2, sf.x0, Math.max(sf.x0, sf.x1 - w)), y: clamp(fy * H - h / 2, sf.y0, Math.max(sf.y0, sf.y1 - h)) };
  }

  // ------------------------- HUD components -------------------------
  // Every HUD piece is a comp: an outer box (position, static rotation), a mover (entry slide / wipe / fade)
  // and its content. updComp sets everything from t.
  function comp(kind, label, w, h, x, y, at, o) {
    var s = ensure();
    o = obj(o);
    var c = { kind: kind, label: label, w: w, h: h, x: x, y: y, at: tc0(at), until: o.until == null ? null : num(o.until, null), enter: o.enter || "pop", dur: num(o.dur, 0.45), rot: num(o.rot, 0), noInspect: !!o.noInspect };
    c.el = div("fs-comp fs-c-" + kind, o.parent || s.hud);
    c.el.style.left = f1(x) + "px"; c.el.style.top = f1(y) + "px"; c.el.style.width = f1(w) + "px"; c.el.style.height = f1(h) + "px";
    if (c.rot) c.el.style.transform = "rotate(" + c.rot + "deg)";
    c.mv = div("fs-mv", c.el);
    s.comps.push(c);
    s.anims.push(function (t) { updComp(c, t); });
    return c;
  }
  function compOn(c, t) { return t >= c.at && (c.until == null || t < c.until + 0.3); }
  function updComp(c, t) {
    var vis = compOn(c, t);
    showEl(c.el, vis);
    if (!vis) return;
    var p = clamp((t - c.at) / c.dur, 0, 1), tx = 0, ty = 0, clip = "none", op = 1, oc = V.ease.outCubic(p), mg = u(30);
    if (c.enter === "pop") { ty = (1 - CE.snap(p)) * u(46); var e = V.ease.outCubic(clamp(p * 1.7, 0, 1)); if (e < 1) clip = "inset(" + -mg + "px " + f1((1 - e) * (c.w + mg) - mg) + "px " + -mg + "px " + -mg + "px)"; }
    else if (c.enter === "slide-r") tx = (1 - oc) * (W - c.x + u(60));
    else if (c.enter === "slide-l") tx = -(1 - oc) * (c.x + c.w + u(60));
    else if (c.enter === "rise") ty = (1 - CE.snap(p)) * (H - c.y + u(60));
    else if (c.enter === "drop") ty = -(1 - V.ease.outBack(p)) * (c.y + c.h + u(80));
    else if (c.enter === "unroll") { if (oc < 1) clip = "inset(" + -mg + "px " + -mg + "px " + f1((1 - oc) * (c.h + mg) - mg) + "px " + -mg + "px)"; ty = -(1 - oc) * u(16); }
    else if (c.enter === "wipe") { if (oc < 1) clip = "inset(" + -mg + "px " + f1((1 - oc) * (c.w + mg) - mg) + "px " + -mg + "px " + -mg + "px)"; }
    else if (c.enter === "fade") op = oc;
    if (c.until != null && t > c.until) op *= clamp(1 - (t - c.until) / 0.3, 0, 1);
    setS(c.mv, "transform", tx || ty ? "translate(" + f1(tx) + "px," + f1(ty) + "px)" : "none");
    setS(c.mv, "clipPath", clip);
    setS(c.mv, "opacity", f2(op));
    if (c.upd) c.upd(t);
  }
  function compMoving(c, t) { return t < c.at + c.dur + 0.02; }
  function kickerEl(parent, text, size) {
    var k = div("fs-kicker", parent, text);
    k.style.fontSize = f1(size) + "px";
    return k;
  }
  function kickW(text, size) { return text ? measure(text, size, 800) + text.length * size * 0.14 : 0; }

  // Plate: the company name in bold caps with a year band. Top-right (top-centre in portrait).
  function plate(company, years, o) {
    var s = ensure();
    o = obj(o);
    var Pt = s.portrait, sf = safe(), name = plain(company).toUpperCase() || "THE COMPANY";
    var maxW = Pt ? sf.w * 0.94 : W * (s.square ? 0.44 : 0.34), pad = u(Pt ? 17 : 20);
    var lay = layoutRich(name, { size: u(Pt ? 62 : 62), minSize: u(30), maxWidth: maxW - pad * 2, maxLines: Pt ? 1 : 2, weight: 900, lh: 0.98 });
    var kick = plain(o.kicker).toUpperCase(), ks = u(Pt ? 19 : 19), kw = kickW(kick, ks);
    var yrs = plain(years), ys = u(Pt ? 25 : 26), yw = yrs ? measure(yrs, ys, 700, SERIF) + u(40) : 0;
    var innerW = Math.max(lay.w, kw, yw), w = innerW + pad * 2;
    var h = pad * 0.9 + (kick ? ks * 1.5 : 0) + lay.h + (yrs ? ys * 1.55 + u(12) : 0) + pad * 0.8;
    var left = o.pos === "left", x = Pt ? (W - w) / 2 : left ? sf.x0 : sf.x1 - w, y = sf.y0;
    var c = comp("plate", name, w, h, x, y, o.at == null ? 0.15 : o.at, { until: o.until, enter: Pt ? "drop" : left ? "slide-l" : "slide-r", dur: 0.6 });
    c.mv.className += " fs-paper fs-plate";
    c.mv.style.padding = f1(pad * 0.9) + "px " + f1(pad) + "px " + f1(pad * 0.8) + "px";
    if (kick) kickerEl(c.mv, kick, ks).style.marginBottom = f1(ks * 0.35) + "px";
    var nm = div("fs-name", c.mv);
    fillRich(nm, lay);
    if (yrs) {
      var band = div("fs-years", c.mv, yrs);
      band.style.fontSize = f1(ys) + "px";
      band.style.marginTop = f1(u(10)) + "px";
      if (isHex(o.color)) band.style.background = hex6(o.color);
    }
    return c;
  }

  var HL_SIZE = { sm: 46, md: 62, lg: 80, xl: 102 };
  function headline(text, at, o) {
    var s = ensure();
    o = obj(o);
    var Pt = s.portrait, sf = safe(), pad = u(22);
    var size = u((HL_SIZE[o.size] || HL_SIZE.lg) * (Pt ? 1.04 : 1));
    var maxW = o.maxWidth ? (num(o.maxWidth, 0.42) <= 1 ? num(o.maxWidth, 0.42) * W : num(o.maxWidth, 800)) : Pt ? sf.w * 0.96 : W * (s.square ? 0.58 : 0.42);
    var lay = layoutRich(text || "", { size: size, minSize: u(30), maxWidth: maxW - pad * 2, maxLines: o.maxLines || (Pt ? 4 : 3), weight: 900, lh: 1.0, upper: true });
    var kick = plain(o.kicker).toUpperCase(), ks = u(20), kh = kick ? ks * 1.7 : 0;
    var w = Math.max(lay.w, kickW(kick, ks)) + pad * 2, h = lay.h + pad * 1.5 + kh;
    var q = posOf(o.pos, "right"), b = placeBox(q.x, q.y, w, h);
    var c = comp("headline", plain(text), w, h, b.x, b.y, at, { until: o.until, enter: o.enter || "pop", rot: o.rot == null ? -1.4 : o.rot, dur: 0.5 });
    c.mv.className += " fs-paper fs-hl";
    c.mv.style.padding = f1(pad * 0.75) + "px " + f1(pad) + "px";
    if (isHex(o.color)) c.mv.style.setProperty("--em", hex6(o.color));
    if (kick) kickerEl(c.mv, kick, ks).style.marginBottom = f1(ks * 0.4) + "px";
    var tx = div("fs-hltext", c.mv);
    fillRich(tx, lay);
    c.lay = lay;
    return c;
  }

  function parseValue(v) {
    if (typeof v === "number") return { prefix: "", n: v, suffix: "", decimals: Math.abs(v) < 100 && v % 1 ? 1 : 0 };
    var s_ = clean(v), m = /^([^\d\-.]*?)\s*(-?[\d,]*\.?\d+)\s*(.*)$/.exec(s_);
    if (!m) return { prefix: "", n: null, suffix: s_, decimals: 0 };
    var nstr = m[2].replace(/,/g, ""), dec = nstr.indexOf(".") >= 0 ? nstr.split(".")[1].length : 0;
    return { prefix: m[1], n: parseFloat(nstr), suffix: m[3], decimals: Math.min(2, dec), sep: m[2].indexOf(",") >= 0 || Math.abs(parseFloat(nstr)) >= 10000 };
  }
  function statText(pv, n) { return pv.prefix + (pv.n == null ? "" : V.format(n, pv.decimals, pv.sep !== false && Math.abs(pv.n) >= 1000)) + pv.suffix; }
  function stat(value, label, at, o) {
    var s = ensure();
    o = obj(o);
    var Pt = s.portrait, sf = safe(), pad = u(20);
    var pv = parseValue(value);
    if (o.prefix != null) pv.prefix = str(o.prefix);
    if (o.suffix != null) pv.suffix = str(o.suffix);
    if (o.decimals != null) pv.decimals = clamp(Math.round(num(o.decimals, 0)), 0, 3);
    var finalT = statText(pv, pv.n == null ? 0 : pv.n), ns = u(o.size === "sm" ? 70 : Pt ? 108 : 98);
    var maxW = Pt ? sf.w * 0.9 : W * (s.square ? 0.5 : 0.34);
    ns = fitOne(finalT, ns, maxW - pad * 2, 900, SANS, u(40));
    var nw = measure(finalT, ns, 900) * 1.04 + u(6);
    var lab = plain(label), lay = layoutRich(lab, { size: u(Pt ? 34 : 30), maxWidth: Math.max(nw, maxW * 0.8) - pad * 2, maxLines: 2, weight: 400, lh: 1.12, family: SERIF });
    var kick = plain(o.kicker).toUpperCase(), ks = u(19), kh = kick ? ks * 1.6 : 0;
    var w = Math.max(nw, lay.w, kickW(kick, ks)) + pad * 2, h = pad * 1.2 + kh + ns * 1.02 + (lab ? lay.h + u(4) : 0) + pad * 0.6;
    var q = posOf(o.pos, "bottom-right"), b = placeBox(q.x, q.y, w, h);
    var c = comp("stat", finalT, w, h, b.x, b.y, at, { until: o.until, enter: o.enter || "pop", rot: o.rot == null ? 1.2 : o.rot, dur: 0.45 });
    c.mv.className += " fs-paper fs-stat";
    c.mv.style.padding = f1(pad * 0.8) + "px " + f1(pad) + "px";
    if (kick) kickerEl(c.mv, kick, ks).style.marginBottom = f1(ks * 0.3) + "px";
    var numEl = div("fs-num", c.mv, finalT);
    numEl.style.fontSize = f1(ns) + "px";
    if (isHex(o.color)) numEl.style.color = hex6(o.color);
    if (lab) { var le = div("fs-statlab", c.mv); fillRich(le, lay); }
    var a0 = c.at;
    c.upd = function (t) {
      if (pv.n == null) return;
      var k = V.ease.outCubic(clamp((t - a0 - 0.08) / 1.1, 0, 1)), val = pv.n * k;
      var txt = statText(pv, k >= 1 ? pv.n : val);
      if (numEl.textContent !== txt) numEl.textContent = txt;
    };
    if (o.arrowTo) arrowFrom(c, o.arrowTo, a0 + 0.45);
    return c;
  }
  // dashed ink arrow from a comp to a figure (its head) or a world point { x, y }
  function arrowFrom(c, target, at) {
    var s = ensure(), path = svg("path", { fill: "none", stroke: INK, "stroke-width": u(4), "stroke-dasharray": u(12) + " " + u(10), "stroke-linecap": "round" }, s.ov);
    var head = svg("path", { fill: INK }, s.ov);
    s.anims.push(function (t) {
      var on = compOn(c, t) && t >= at;
      showEl(path, on); showEl(head, on);
      if (!on) return;
      var cam = camAt(s, t), tp;
      if (target && target.__fig) { var r = rigAt(target, t); tp = toScr(s, cam, r.hw[0] - (r.flip < 0 ? -1 : 1) * HR * HSC * target.us * 0.3, r.hw[1] - HR * HSC * target.us * 1.3); }
      else tp = toScr(s, cam, num(target.x, s.Ww / 2), num(target.y, 600));
      var cx = c.x + c.w / 2, cy = c.y + c.h / 2, dx = tp[0] - cx, dy = tp[1] - cy;
      var sx = Math.abs(dx) * c.h > Math.abs(dy) * c.w ? c.x + (dx > 0 ? c.w : 0) : cx, sy = Math.abs(dx) * c.h > Math.abs(dy) * c.w ? cy : c.y + (dy > 0 ? c.h : 0);
      var ex = lerp(sx, tp[0], 0.86), ey = lerp(sy, tp[1], 0.86), p = V.ease.outCubic(clamp((t - at) / 0.5, 0, 1));
      ex = lerp(sx, ex, p); ey = lerp(sy, ey, p);
      var mx = (sx + ex) / 2 + (ey - sy) * 0.18, my = (sy + ey) / 2 - (ex - sx) * 0.18;
      setA(path, "d", "M" + f1(sx) + " " + f1(sy) + "Q" + f1(mx) + " " + f1(my) + " " + f1(ex) + " " + f1(ey));
      var ang = Math.atan2(ey - my, ex - mx), al = u(22);
      setA(head, "d", "M" + f1(ex + Math.cos(ang) * al * 0.3) + " " + f1(ey + Math.sin(ang) * al * 0.3) + "L" + f1(ex - Math.cos(ang - 0.45) * al) + " " + f1(ey - Math.sin(ang - 0.45) * al) + "L" + f1(ex - Math.cos(ang + 0.45) * al) + " " + f1(ey - Math.sin(ang + 0.45) * al) + "Z");
    });
  }

  // Chapter card: dimmed world, a huge year, an ink rule, the title in caps, an italic subtitle.
  function chapter(year, title, o) {
    var s = ensure();
    o = obj(o);
    var Pt = s.portrait, sf = safe(), at = tc0(o.at == null ? 0.2 : o.at), tAt = o.titleAt == null ? at + 0.7 : tc(o.titleAt);
    var wash = comp("wash", "", W + u(80), H + u(80), -u(40), -u(40), Math.max(0, at - 0.1), { enter: "fade", dur: 0.7, noInspect: true, until: o.until });
    wash.mv.className += " fs-wash";
    var yr = plain(year) || "", ysz = fitOne(yr, u(Pt ? 250 : 240), sf.w * 0.9, 700, SERIF, u(80));
    var yh = ysz * 0.95, yw = measure(yr, ysz, 700, SERIF);
    var tl = layoutRich(title || "", { size: u(Pt ? 74 : 70), minSize: u(34), maxWidth: sf.w * (Pt ? 0.94 : 0.8), maxLines: Pt ? 3 : 2, weight: 900, lh: 1.0, upper: true });
    var sub = plain(o.sub), sl = sub ? layoutRich(sub, { size: u(Pt ? 36 : 34), maxWidth: sf.w * (Pt ? 0.9 : 0.66), maxLines: 3, weight: 400, lh: 1.18, family: SERIF }) : null;
    var kick = plain(o.kicker).toUpperCase(), ks = u(Pt ? 26 : 24);
    var gap = u(22), rule = u(8), total = (kick ? ks * 1.6 : 0) + yh + gap + rule + gap + tl.h + (sl ? gap + sl.h : 0);
    var q = posOf(o.pos, "centre"), y = clamp(q.y * H - total / 2, sf.y0, sf.y1 - total), cxp = q.x * W, cs = [];
    if (kick) { var kc = comp("kicker", kick, kickW(kick, ks) + u(10), ks * 1.4, cxp - (kickW(kick, ks) + u(10)) / 2, y, at, { enter: "wipe", dur: 0.4, until: o.until }); kickerEl(kc.mv, kick, ks).style.textAlign = "center"; y += ks * 1.6; cs.push(kc); }
    var yc = comp("year", yr, yw + u(20), yh, cxp - (yw + u(20)) / 2, y, at + 0.05, { enter: "pop", dur: 0.55, until: o.until });
    var ye = div("fs-year", yc.mv, yr);
    ye.style.fontSize = f1(ysz) + "px"; ye.style.lineHeight = f1(yh) + "px";
    y += yh + gap;
    var rw = Math.min(sf.w * 0.7, Math.max(yw, tl.w) * 0.9);
    var rc = comp("rule", "", rw, rule, cxp - rw / 2, y, at + 0.35, { enter: "wipe", dur: 0.5, noInspect: true, until: o.until });
    rc.mv.className += " fs-rule";
    y += rule + gap;
    var tc_ = comp("title", plain(title), tl.w + u(16), tl.h, cxp - (tl.w + u(16)) / 2, y, tAt, { enter: "pop", dur: 0.5, until: o.until });
    var te = div("fs-ctitle", tc_.mv);
    fillRich(te, tl);
    y += tl.h + gap;
    if (sl) { var sc_ = comp("sub", sub, sl.w + u(12), sl.h, cxp - (sl.w + u(12)) / 2, y, Math.min(endLimit(), tAt + 0.55), { enter: "fade", dur: 0.6, until: o.until }); var se = div("fs-csub", sc_.mv); fillRich(se, sl); cs.push(sc_); }
    return { year: yc, title: tc_, rule: rc, wash: wash, parts: cs };
  }
  function label(text, at, o) {
    var s = ensure();
    o = obj(o);
    var tx = plain(text).toUpperCase(), sz = u(o.size === "lg" ? 34 : 26), pad = u(12);
    var lay = layoutRich(tx, { size: sz, maxWidth: safe().w * 0.6, maxLines: 2, weight: 800, lh: 1.05 });
    var w = lay.w + pad * 2, h = lay.h + pad * 1.2, q = posOf(o.pos, "bottom"), b = placeBox(q.x, q.y, w, h);
    var c = comp("label", tx, w, h, b.x, b.y, at, { until: o.until, enter: "wipe", dur: 0.35, rot: num(o.rot, 0) });
    c.mv.className += " fs-label" + (o.accent ? " fs-label-acc" : "");
    c.mv.style.padding = f1(pad * 0.55) + "px " + f1(pad) + "px";
    fillRich(div("fs-ltext", c.mv), lay);
    return c;
  }
  // A badge that hangs on a figure's chest and follows it. o.y: height on the figure (0 feet, 1 head top).
  function nameTag(fig, text, at, o) {
    var s = ensure();
    o = obj(o);
    var tx = plain(text).toUpperCase() || "COMPANY", sz = u(s.portrait ? 25 : 28), pad = u(s.portrait ? 10 : 12);
    var lay = layoutRich(tx, { size: sz, maxWidth: u(s.portrait ? 230 : 340), maxLines: 2, weight: 900, lh: 1.0 });
    var w = lay.w + pad * 2, h = lay.h + pad * 1.3 + u(8);
    var c = comp("nametag", tx, w, h, 0, 0, at, { until: o.until, enter: "pop", dur: 0.4, rot: num(o.rot, fig && fig.__fig && fig.faceTr.val(0) < 0 ? 3 : -3) });
    c.mv.className += " fs-paper fs-tag" + (o.accent ? " fs-tag-acc" : "");
    c.mv.style.padding = f1(pad * 0.5 + u(8)) + "px " + f1(pad) + "px " + f1(pad * 0.6) + "px";
    fillRich(div("fs-ttext", c.mv), lay);
    var fy = clamp(num(o.y, 0.36), 0, 1.2), above = o.above != null ? !!o.above : s.portrait, sf = safe();
    c.upd = function (t) {
      if (!fig || !fig.__fig) return;
      var r = rigAt(fig, t), cam = camAt(s, t), sp, x, y;
      if (above) { sp = toScr(s, cam, r.hw[0], r.hw[1] - HR * HSC * fig.us * 1.22); x = sp[0] - w / 2; y = sp[1] - h - u(6); }
      else { var p = r.w([4, -FIGH * fy]); sp = toScr(s, cam, p[0], p[1]); x = sp[0] - w / 2; y = sp[1] - h / 2; }
      var inFrame = x >= sf.x0 - 4 && x + w <= sf.x1 + 4 && y >= sf.y0 - 4 && y + h <= sf.y1 + 4;
      c.x = x; c.y = y; c.off = !inFrame;
      setS(c.el, "left", f1(x) + "px"); setS(c.el, "top", f1(y) + "px");
      setS(c.el, "visibility", inFrame ? "visible" : "hidden");
    };
    c.upd(c.at);
    return c;
  }
  function versus(at, o) {
    var s = ensure();
    o = obj(o);
    var d = u(s.portrait ? 200 : 190), q = posOf(o.pos, "centre"), b = { x: q.x * W - d / 2, y: q.y * H - d / 2 };
    var c = comp("versus", "VS", d, d, b.x, b.y, at, { enter: "drop", dur: 0.42, until: o.until, rot: -8 });
    c.mv.className += " fs-vs";
    var t_ = div("fs-vst", c.mv, "VS");
    t_.style.fontSize = f1(d * 0.42) + "px"; t_.style.lineHeight = f1(d) + "px";
    s.camera.shake(c.at + 0.4, 16, 0.5);
    burst(b.x + d / 2, b.y + d / 2, c.at + 0.38, { r: d * 0.85, color: ACC });
    return c;
  }
  function burst(x, y, at, o) {
    var s = ensure();
    o = obj(o);
    var g = svg("g", null, s.ov), n = o.count || 12, rr = o.r || u(100), lines = [];
    for (var i = 0; i < n; i++) lines.push(svg("path", { stroke: o.color || INK, "stroke-width": u(o.width || 7), "stroke-linecap": "round", fill: "none" }, g));
    s.anims.push(function (t) {
      var p = (t - at) / 0.45, on = p >= 0 && p < 1;
      showEl(g, on);
      if (!on) return;
      lines.forEach(function (ln, i) {
        var a = (i / n) * 2 * PI + 0.2, r0 = rr * (0.62 + 0.5 * p), r1 = rr * (0.8 + 0.55 * V.ease.outCubic(p));
        setA(ln, "d", "M" + f1(x + Math.cos(a) * r0) + " " + f1(y + Math.sin(a) * r0) + "L" + f1(x + Math.cos(a) * r1) + " " + f1(y + Math.sin(a) * r1));
        setA(ln, "opacity", f2(1 - p));
      });
    });
    return g;
  }
  // Kinetic captions: a paper strip with the narration; the word being said is inked, the rest pale.
  function captions(o) {
    var s = ensure();
    o = obj(o);
    var ws = (V.words || []).slice(), text = clean(o.text || V.narration);
    if (!ws.length && text) { var tk = text.split(/\s+/), dt = (D - 0.6) / Math.max(1, tk.length); ws = tk.map(function (w, i) { return { word: w, start: 0.3 + i * dt, end: 0.3 + (i + 0.8) * dt }; }); }
    if (!ws.length) return null;
    var sf = safe(), Pt = s.portrait, maxW = o.maxWidth ? num(o.maxWidth, sf.w) : sf.w * (Pt ? 0.96 : 0.62), sz = u(Pt ? 44 : 38), groups = [], cur = [];
    ws.forEach(function (w, i) {
      cur.push(w);
      var txt = cur.map(function (q) { return q.word; }).join(" "), end = /[.!?,;:]$/.test(w.word);
      if (measure(txt, sz, 800) > maxW * 1.6 || cur.length >= (Pt ? 6 : 8) || (end && cur.length >= 3) || i === ws.length - 1) { groups.push(cur); cur = []; }
    });
    var y = o.top != null ? num(o.top, 0.84) * H : Pt ? H * (968 / 1920) : H * 0.83, x = o.x != null ? num(o.x, 0.5) * W : W / 2;
    var out = [];
    groups.forEach(function (gw, gi) {
      var lay = layoutRich(gw.map(function (q) { return q.word; }).join(" "), { size: sz, maxWidth: maxW, maxLines: 2, weight: 800, lh: 1.12 });
      var pad = u(14), w = lay.w + pad * 2, h = lay.h + pad;
      var t0 = gw[0].start - 0.05, t1 = groups[gi + 1] ? groups[gi + 1][0].start - 0.05 : D;
      var c = comp("caption", gw.map(function (q) { return q.word; }).join(" "), w, h, clamp(x - w / 2, sf.x0, sf.x1 - w), clamp(y - h / 2, sf.y0, sf.y1 - h), t0, { enter: "fade", dur: 0.12, until: t1 - 0.3 });
      c.mv.className += " fs-caps";
      c.mv.style.padding = f1(pad * 0.5) + "px " + f1(pad) + "px";
      var spans = fillRich(div("fs-captext", c.mv), lay, "fs-cw");
      c.upd = function (t) { spans.forEach(function (sp, k) { var wd = gw[Math.min(k, gw.length - 1)]; var on = t >= wd.start - 0.02; var cls = "fs-cw" + (on ? (t < wd.end + 0.05 ? " fs-now" : " fs-said") : ""); if (sp.el.className !== cls) sp.el.className = cls; }); };
      out.push(c);
    });
    return out;
  }
  // shared-helper compatibility: S.stage + S.title / S.text in a padded column in the HUD
  var stageCol = null;
  function stage(root, o) {
    o = obj(o);
    var sc = makeScene({ empire: o.empire || "city", sky: o.sky || "day", growth: o.growth == null ? 1 : o.growth });
    stageCol = div("v-stage fs-stage", st.hud);
    var sf = safe();
    stageCol.style.left = f1(sf.x0) + "px"; stageCol.style.top = f1(sf.y0) + "px"; stageCol.style.width = f1(sf.w) + "px"; stageCol.style.height = f1(sf.h) + "px";
    sc.column = stageCol;
    return sc;
  }
  function simpleText(cls, text, o, size) {
    o = obj(o);
    if (!stageCol) stage(null, {});
    var el = div("fs-paper " + cls, stageCol);
    var lay = layoutRich(text || "", { size: u(size), maxWidth: safe().w * 0.8, maxLines: 3, weight: cls === "fs-st" ? 900 : 500, family: cls === "fs-st" ? SANS : SERIF, upper: cls === "fs-st", lh: 1.08 });
    fillRich(el, lay);
    var at = tc0(o.at == null ? 0.3 : o.at);
    ensure().anims.push(function (t) { showEl(el, t >= at); });
    return el;
  }

  // ------------------------- product sketches (line art in a 200 x 140 box centred on 0,0) -------------------------
  function gearD(cx, cy, r0, r1, n) {
    var d = "";
    for (var i = 0; i < n * 4; i++) { var a = (i / (n * 4)) * 2 * PI, rr = i % 4 < 2 ? r1 : r0; d += (i ? "L" : "M") + f1(cx + Math.cos(a) * rr) + " " + f1(cy + Math.sin(a) * rr); }
    return d + "Z";
  }
  function c_(x, y, r) { return '<circle cx="' + x + '" cy="' + y + '" r="' + r + '"/>'; }
  function p_(d) { return '<path d="' + d + '"/>'; }
  function r_(x, y, w, h, rx) { return '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + (rx || 0) + '"/>'; }
  var SKETCH = {
    car: p_("M-92 18Q-94 -4 -70 -8L-44 -10Q-30 -36 -4 -38L30 -38Q52 -36 66 -12L86 -8Q98 -4 96 18Z") + p_("M-34 -12Q-24 -30 -6 -32L-6 -12Z") + p_("M2 -32L26 -32Q42 -30 54 -12L2 -12Z") + c_(-52, 20, 17) + c_(56, 20, 17) + c_(-52, 20, 6) + c_(56, 20, 6) + p_("M-6 -10V16M86 -2L94 2M-96 14H-82M84 14H98"),
    truck: p_("M-96 24V-40H22V24Z") + p_("M22 24V-22Q24 -34 38 -34H62L84 -10V24Z") + p_("M42 -28H60L74 -12H42Z") + c_(-62, 26, 14) + c_(-30, 26, 14) + c_(58, 26, 14) + p_("M-86 -30H12M-86 -18H12"),
    phone: r_(-32, -66, 64, 132, 12) + r_(-26, -54, 52, 100, 4) + c_(0, 56, 5) + p_("M-10 -60H10") + r_(-18, -44, 14, 14, 3) + r_(4, -44, 14, 14, 3) + r_(-18, -22, 14, 14, 3) + r_(4, -22, 14, 14, 3),
    computer: r_(-70, -62, 140, 92, 6) + r_(-60, -54, 120, 74, 2) + p_("M-14 30L-22 48H22L14 30") + p_("M-80 56H80L74 66H-74Z") + p_("M-48 -36H-4M-48 -22H20M-48 -8H6"),
    software: r_(-86, -60, 172, 120, 8) + p_("M-86 -40H86") + c_(-74, -50, 3.5) + c_(-62, -50, 3.5) + c_(-50, -50, 3.5) + p_("M-66 -20H-10M-56 -4H18M-56 12H4M-66 28H-22") + p_("M42 -14L26 6L42 26M58 -14L74 6L58 26"),
    rocket: p_("M0 -68Q30 -40 26 30H-26Q-30 -40 0 -68Z") + c_(0, -20, 12) + p_("M-26 8L-46 40L-26 34M26 8L46 40L26 34") + p_("M-14 32Q0 70 14 32") + p_("M-26 4H26"),
    plane: p_("M-96 4Q-90 -8 -60 -8H70Q96 -6 98 4Q96 12 70 12H-60Q-90 12 -96 4Z") + p_("M-10 -6L30 -56H44L24 -6M-10 12L20 52H34L22 12") + p_("M-80 -6L-90 -40H-78L-60 -8") + p_("M60 -2H66M48 -2H54M36 -2H42M-40 -2H-34M-28 -2H-22"),
    shoe: p_("M-90 28Q-94 0 -80 -10Q-60 -14 -40 -30Q-24 -40 -10 -30L20 -4Q60 4 86 12Q98 18 94 28Z") + p_("M-92 28H96Q98 36 92 40H-88Q-94 36 -92 28") + p_("M-36 -22L-20 -10M-28 -28L-12 -16M-20 -34L-4 -22") + '<path d="M-84 -2Q-70 12 -36 16Q10 18 60 14" stroke-dasharray="4 5"/>',
    bottle: p_("M-12 -68H12V-50Q30 -36 30 -10V56Q30 66 20 66H-20Q-30 66 -30 56V-10Q-30 -36 -12 -50Z") + r_(-30, -4, 60, 34) + p_("M-14 -68H14V-58H-14Z") + p_("M-18 6H18M-12 18H12"),
    chip: r_(-44, -44, 88, 88, 6) + r_(-26, -26, 52, 52, 3) + p_("M-30 -44V-60M-15 -44V-60M0 -44V-60M15 -44V-60M30 -44V-60M-30 44V60M-15 44V60M0 44V60M15 44V60M30 44V60M-44 -30H-60M-44 -15H-60M-44 0H-60M-44 15H-60M-44 30H-60M44 -30H60M44 -15H60M44 0H60M44 15H60M44 30H60") + p_("M-14 -10H14M-14 2H8"),
    box: p_("M-60 -18H20V52H-60Z") + p_("M-60 -18L-30 -48H50L20 -18") + p_("M20 -18L50 -48V22L20 52") + p_("M-24 -18L6 -48M-30 -18V6"),
    lightbulb: p_("M0 -66Q-40 -66 -40 -26Q-40 0 -18 16V30H18V16Q40 0 40 -26Q40 -66 0 -66Z") + p_("M-16 38H16M-12 46H12") + p_("M-10 14L-6 -14L0 -6L6 -14L10 14") + p_("M-62 -48L-50 -40M62 -48L50 -40M-70 -20H-54M70 -20H54"),
    engine: r_(-60, -26, 120, 58, 6) + r_(-54, -50, 22, 24, 3) + r_(-26, -50, 22, 24, 3) + r_(2, -50, 22, 24, 3) + r_(30, -50, 22, 24, 3) + c_(-78, 8, 16) + c_(-78, 8, 5) + p_("M-62 8H-94M60 -6H86V20M-40 32V48H40V32") + c_(-36, 2, 4) + c_(0, 2, 4) + c_(36, 2, 4),
    burger: p_("M-70 -10Q-70 -56 0 -56Q70 -56 70 -10Z") + p_("M-74 -6Q-60 4 -46 -6Q-32 4 -18 -6Q-4 4 10 -6Q24 4 38 -6Q52 4 66 -6Q72 -2 74 -6") + r_(-70, 0, 140, 18, 8) + p_("M-68 26H68Q68 46 50 46H-50Q-68 46 -68 26Z") + p_("M-30 -36L-26 -34M0 -44L4 -42M30 -36L34 -34M-12 -26L-8 -24M16 -26L20 -24"),
    bike: c_(-56, 20, 32) + c_(56, 20, 32) + p_("M-56 20L-14 -22L36 -22L56 20M-14 -22L0 20L36 -22M0 20L-56 20") + p_("M-24 -34H-4M-14 -34V-22M30 -38L38 -22M24 -38H40") + c_(0, 20, 6),
    watch: c_(0, 0, 40) + c_(0, 0, 32) + p_("M0 0V-22M0 0L16 8") + p_("M-20 -36L-16 -68H16L20 -36M-20 36L-16 68H16L20 36") + r_(40, -6, 8, 12, 2) + p_("M0 -28V-24M28 0H24M0 28V24M-28 0H-24"),
    ship: p_("M-96 0H96L80 30H-80Z") + r_(-70, -20, 22, 20) + r_(-46, -20, 22, 20) + r_(-22, -20, 22, 20) + r_(2, -20, 22, 20) + r_(-58, -40, 22, 20) + r_(-34, -40, 22, 20) + r_(-10, -40, 22, 20) + r_(36, -44, 36, 44) + p_("M44 -34H64M54 -44V-60H62V-44") + p_("M-100 40Q-80 34 -60 40T-20 40T20 40T60 40T100 40"),
    tv: r_(-76, -52, 152, 96, 10) + r_(-66, -44, 132, 80, 4) + p_("M-40 44L-50 62M40 44L50 62M-10 -52L-34 -76M10 -52L34 -76"),
    camera: r_(-70, -34, 140, 78, 10) + c_(0, 4, 28) + c_(0, 4, 17) + p_("M-30 -34L-20 -50H20L30 -34") + r_(42, -26, 16, 10, 2) + p_("M-58 -22H-40"),
    battery: r_(-70, -34, 132, 68, 8) + r_(62, -14, 12, 28, 3) + p_("M-6 -24L-20 4H-2L-10 26L14 -6H-4Z") + p_("M-56 -10V10M-66 0H-46"),
    robot: r_(-34, -66, 68, 50, 8) + c_(-14, -42, 7) + c_(14, -42, 7) + p_("M0 -66V-80") + c_(0, -84, 4) + r_(-44, -10, 88, 64, 8) + p_("M-44 0L-70 30M44 0L70 30M-14 -26H14") + r_(-24, 4, 48, 24, 4) + p_("M-20 54V66M20 54V66"),
    gear: p_(gearD(0, 0, 44, 58, 10)) + c_(0, 0, 18) + p_("M-80 -60H80M-80 60H80") + p_(gearD(84, -40, 16, 22, 7)),
  };
  var SKETCH_SYN = { auto: "car", vehicle: "car", automobile: "car", coupe: "car", sedan: "car", van: "truck", lorry: "truck", smartphone: "phone", mobile: "phone", laptop: "computer", pc: "computer", desktop: "computer", app: "software", website: "software", web: "software", code: "software", saas: "software", spaceship: "rocket", jet: "plane", airplane: "plane", aircraft: "plane", sneaker: "shoe", sneakers: "shoe", shoes: "shoe", drink: "bottle", soda: "bottle", juice: "bottle", processor: "chip", microchip: "chip", cpu: "chip", semiconductor: "chip", package: "box", parcel: "box", delivery: "box", bulb: "lightbulb", light: "lightbulb", idea: "lightbulb", motor: "engine", food: "burger", sandwich: "burger", bicycle: "bike", clock: "watch", boat: "ship", television: "tv", screen: "tv", photo: "camera", ev: "battery", power: "battery", ai: "robot", bot: "robot", machine: "gear", gears: "gear" };
  function sketchKey(n) { n = str(n).toLowerCase(); return SKETCH[n] ? n : SKETCH_SYN[n] || null; }
  var SKETCH_FILL = { burger: ["#E2B66A", "#7FA068", "#8A5A3B", "#E2B66A"] };
  sketchMarkup = function (kind, color, filled) {
    var k = sketchKey(kind) || "box", body = SKETCH[k];
    if (filled) {
      var cols = SKETCH_FILL[k] || [], i = 0, base = color || GOLD;
      body = body.replace(/<(path|rect|circle)/g, function (m0, tag) { var f = cols[i] || (i === 0 ? base : tag === "circle" ? "#3B3C43" : tint(base, 0.55)); i++; return "<" + tag + ' fill="' + f + '"'; });
      return '<g stroke="' + INK + '" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">' + body + "</g>";
    }
    return '<g fill="none" stroke="' + (color || INK) + '" stroke-width="3.2" stroke-linejoin="round" stroke-linecap="round">' + body + "</g>";
  };
  // Draw a sketch into an SVG group; returns the group (its children can be drawn on with S.drawOn).
  function drawSketch(group, kind, o) {
    o = obj(o);
    var g = svg("g", { transform: o.transform || null, class: "fs-sketch" }, group);
    g.innerHTML = sketchMarkup(kind, o.color || INK, !!o.filled);
    return g.firstChild || g;
  }
  // Draw the strokes of every shape in a group between at and at + dur (one after the other).
  function drawOn(tl, group, at, dur) {
    var s = ensure();
    if (group && !group.nodeType && tl && tl.nodeType) { var tmp = tl; tl = group; group = tmp; }
    if (!group || !group.querySelectorAll) return group;
    var els = [].slice.call(group.querySelectorAll("path, circle, rect, ellipse, line, polyline, polygon")), lens = [], total = 0;
    els.forEach(function (e) { var l = 0; try { l = e.getTotalLength ? e.getTotalLength() : 0; } catch (er) { l = 0; } l = l || 100; lens.push(l); total += l; });
    var a0 = tc0(num(at, 0.3)), d = Math.max(0.1, num(dur, 1.2));
    if (a0 + d > endLimit()) d = Math.max(0.2, endLimit() - a0);
    els.forEach(function (e, i) { e.style.strokeDasharray = f1(lens[i] + 1) + " " + f1(lens[i] + 1); });
    s.anims.push(function (t) {
      var done = clamp((t - a0) / d, 0, 1) * total, acc = 0;
      for (var i = 0; i < els.length; i++) {
        var k = clamp((done - acc) / lens[i], 0, 1);
        acc += lens[i];
        setS(els[i], "strokeDashoffset", f1((lens[i] + 1) * (1 - k)));
      }
    });
    void tl;
    return group;
  }

  // ------------------------- paper cards -------------------------
  function cardBox(o, defW, ratio, defPos) {
    var sf = safe(), Pt = V.isPortrait;
    var w = o.w != null ? (num(o.w, 0.5) <= 1 ? num(o.w, 0.5) * W : num(o.w, 800)) : defW;
    w = Math.min(w, sf.w);
    var h = w * ratio, maxH = Pt ? H * (550 / 1920) : sf.h * 0.9;
    if (h > maxH) { h = maxH; w = h / ratio; }
    var q = posOf(o.pos, defPos), b = placeBox(q.x, q.y, w, h);
    return { x: b.x, y: b.y, w: w, h: h };
  }
  function defCardW() { var s = ensure(); return s.portrait ? safe().w * 0.98 : W * (s.square ? 0.5 : 0.46); }
  function defCardPos() { var s = ensure(); return s.portrait ? { x: 0.5, y: 0.3766 } : s.square ? { x: 0.62, y: 0.52 } : { x: 0.66, y: 0.53 }; }
  function makeCard(kind, label, o, ratio, cls) {
    o = obj(o);
    var bx = cardBox(o, defCardW(), ratio, defCardPos());
    var c = comp(kind, label, bx.w, bx.h, bx.x, bx.y, o.at == null ? 0.3 : o.at, { until: o.until, enter: o.enter || "rise", dur: 0.6, rot: o.rot == null ? -1.2 : o.rot });
    c.mv.className += " fs-card " + (cls || "fs-paper");
    c.svg = svg("svg", { class: "fs-csvg", width: f1(bx.w), height: f1(bx.h), viewBox: "0 0 " + f1(bx.w) + " " + f1(bx.h) }, c.mv);
    c.defs = svg("defs", null, c.svg);
    c.g = svg("g", null, c.svg);
    c.txt = div("fs-ctext", c.mv);
    return c;
  }
  function cardText(c, text, x, y, size, o) {
    o = obj(o);
    var el = div("fs-ct " + (o.cls || ""), c.txt);
    var lay = o.lay || layoutRich(text, { size: size, maxWidth: o.maxWidth || c.w, maxLines: o.maxLines || 2, weight: o.weight || 800, upper: o.upper, family: o.family, lh: o.lh || 1.04 });
    fillRich(el, lay);
    var lx = o.align === "center" ? x - lay.w / 2 : o.align === "right" ? x - lay.w : x;
    el.style.left = f1(lx) + "px"; el.style.top = f1(y) + "px"; el.style.width = f1(lay.w + 2) + "px";
    if (o.align) el.style.textAlign = o.align;
    if (o.color) el.style.color = o.color;
    return { el: el, lay: lay, x: lx, y: y, w: lay.w, h: lay.h };
  }
  function paper(o) {
    o = obj(o);
    var ratio = clamp(num(o.ratio, 0.66), 0.3, 1.6);
    var c = makeCard("paper", plain(o.title) || "paper", o, ratio, o.blue ? "fs-blueprint" : "fs-paper");
    var vw = 600, vh = 600 * ratio;
    c.svg.setAttribute("viewBox", "0 0 " + vw + " " + f1(vh));
    if (o.title) cardText(c, plain(o.title).toUpperCase(), c.w * 0.05, c.h * 0.04, u(30), { maxWidth: c.w * 0.9, maxLines: 1, color: o.blue ? "#F2F5F7" : INK });
    return { el: c.mv, svg: c.svg, inner: c.g, vw: vw, vh: vh, comp: c };
  }

  // Blueprint product sheet: the sketch draws itself, spec callouts land on their words.
  function productCard(o) {
    var s = ensure();
    o = obj(o);
    var Pt = s.portrait, kind = sketchKey(o.kind) || "box";
    var c = makeCard("product", plain(o.name) || kind, o, Pt ? 0.575 : 0.64, o.blue === false ? "fs-paper" : "fs-blueprint");
    var w = c.w, h = c.h, blue = o.blue !== false, lineC = blue ? "#EEF3F6" : INK, at = c.at;
    // grid
    var gm = "";
    for (var gx = w * 0.05; gx < w; gx += w * 0.05) gm += L(gx, 0, gx, h, blue ? "#FFFFFF" : MUTED, 0.6);
    for (var gy = w * 0.05; gy < h; gy += w * 0.05) gm += L(0, gy, w, gy, blue ? "#FFFFFF" : MUTED, 0.6);
    var grid = svg("g", { opacity: blue ? 0.16 : 0.12 }, c.g);
    grid.innerHTML = gm;
    var pad = w * 0.05, sk;
    var specs = arr(o.specs).map(function (q) { return typeof q === "string" ? { text: q } : obj(q); }).filter(function (q) { return str(q.text); }).slice(0, 4);
    var nameY = h * 0.8;
    sk = { x: pad, y: h * 0.13, w: (specs.length ? w * 0.56 : w * 0.9) - pad, h: h * 0.62 };
    var scl = Math.min(sk.w / 210, sk.h / 150), scx = sk.x + sk.w / 2, scy = sk.y + sk.h / 2;
    var sg = drawSketch(c.g, kind, { color: lineC, transform: "translate(" + f1(scx) + " " + f1(scy) + ") scale(" + f2(scl) + ")" });
    sg.setAttribute("stroke-width", f2(Math.max(2.4, 3.2 / Math.max(0.6, scl) * 1.2)));
    var drawAt = at + 0.35, drawD = Math.min(1.6, Math.max(0.6, endLimit() - drawAt - 0.4));
    drawOn(null, sg, drawAt, drawD);
    // header: kind + year
    var yr = plain(o.year), head = (yr ? yr + "  " : "") + (plain(o.kicker) || "PATENT DRAWING").toUpperCase();
    cardText(c, head, pad, h * 0.035, u(Pt ? 24 : 21), { maxWidth: w - pad * 2, maxLines: 1, weight: 800, color: blue ? "#DCE7EE" : MUTED, cls: "fs-mono" });
    // name band
    var nm = cardText(c, plain(o.name) ? o.name : kind, pad, nameY, u(Pt ? 58 : 50), { maxWidth: w - pad * 2, maxLines: 1, weight: 900, upper: true, color: blue ? "#FFFFFF" : INK, cls: "fs-pname" });
    var nl = svg("path", { d: "M" + f1(pad) + " " + f1(nameY - h * 0.02) + "H" + f1(w - pad), stroke: lineC, "stroke-width": 2, fill: "none", opacity: 0.7 }, c.g);
    void nl;
    // specs
    var times = syncTimes(specs.map(function (q) { return q.word || bestSpecWord(q.text); }), { after: drawAt + 0.2, gap: 0.45 });
    c.specs = [];
    specs.forEach(function (q, i) {
      var t = Math.max(times[i], drawAt + 0.4 + i * 0.25);
      var sz = u(Pt ? 27 : 29), tx, ty, ax, ay, ex;
      tx = w * 0.62; ty = sk.y + sk.h * (0.04 + (0.86 * i) / Math.max(1, specs.length - 0.2)); ax = scx + (34 + (18 * i) / Math.max(1, specs.length - 1)) * scl; ay = scy + (-34 + (56 * i) / Math.max(1, specs.length - 1)) * scl; ex = tx - u(12);
      var ce = cardText(c, plain(q.text), tx, ty, sz, { maxWidth: w - tx - pad, maxLines: 2, weight: 800, upper: true, color: blue ? "#FFFFFF" : INK, cls: "fs-spec" });
      var ly = ty + ce.lay.size * 0.55;
      var ln = svg("path", { d: "M" + f1(ax) + " " + f1(ay) + "L" + f1(ex - u(16)) + " " + f1(ly) + "L" + f1(ex) + " " + f1(ly), stroke: blue ? "#F4D873" : ACC, "stroke-width": u(3), fill: "none", "stroke-linecap": "round" }, c.g);
      var dot = svg("circle", { cx: f1(ax), cy: f1(ay), r: u(6), fill: blue ? "#F4D873" : ACC, stroke: INK, "stroke-width": 1.5 }, c.g);
      drawOn(null, wrapG(c.g, ln), t - 0.1, 0.3);
      var a0 = t;
      s.anims.push(function (tt) { showEl(dot, tt >= a0 - 0.1); var p = clamp((tt - a0) / 0.3, 0, 1); setS(ce.el, "clipPath", p < 1 ? "inset(-10px " + f1((1 - p) * (ce.w + 20) - 10) + "px -10px -10px)" : "none"); showEl(ce.el, tt >= a0); });
      c.specs.push({ t: t, el: ce });
    });
    return c;
  }
  function wrapG(parent, el) { var g = svg("g", null, parent); g.appendChild(el); return g; }
  function bestSpecWord(text) { var ws = contentWords(text); for (var i = 0; i < ws.length; i++) if (V.find(ws[i]) != null) return ws[i]; return ws.sort(function (a, b) { return b.length - a.length; })[0] || ""; }

  function compact(v, prefix, suffix) {
    var a = Math.abs(v), s_;
    if (a >= 1e12) s_ = trimN(v / 1e12) + "T"; else if (a >= 1e9) s_ = trimN(v / 1e9) + "B"; else if (a >= 1e6) s_ = trimN(v / 1e6) + "M"; else if (a >= 1e4) s_ = trimN(v / 1e3) + "K"; else s_ = trimN(v);
    return (prefix || "") + s_ + (suffix || "");
  }
  function trimN(n) { var a = Math.abs(n); return a >= 100 ? String(Math.round(n)) : a >= 10 ? String(Math.round(n * 10) / 10) : String(Math.round(n * 100) / 100); }
  // Growth (or falling) line on a paper chart.
  function chart(o) {
    var s = ensure();
    o = obj(o);
    var Pt = s.portrait;
    var pts = arr(o.points).map(obj).filter(function (p) { return isFinite(num(p.value, NaN)); }).slice(0, 10);
    if (pts.length < 2) pts = [{ label: "", value: 1 }, { label: "", value: 3 }, { label: "", value: 6 }];
    var falling = o.falling != null ? !!o.falling : num(pts[pts.length - 1].value, 0) < num(pts[0].value, 0);
    var col = isHex(o.color) ? hex6(o.color) : falling ? ACC : GREEN;
    var c = makeCard("chart", plain(o.title) || "chart", o, Pt ? 0.575 : 0.62, "fs-paper fs-chartcard");
    var w = c.w, h = c.h, pad = w * 0.06, at = c.at;
    var title = (plain(o.title) || (falling ? "SHARE PRICE" : "REVENUE")).toUpperCase();
    cardText(c, title, pad, h * 0.045, u(Pt ? 34 : 30), { maxWidth: w * 0.6, maxLines: 1, weight: 900 });
    var px0 = pad + w * 0.04, px1 = w - pad - w * 0.06, py0 = h * 0.24, py1 = h * 0.8;
    var vmax = -1e18, vmin = 1e18;
    pts.forEach(function (p) { vmax = Math.max(vmax, num(p.value, 0)); vmin = Math.min(vmin, num(p.value, 0)); });
    var base = vmin >= 0 ? 0 : vmin * 1.1, top = vmax * 1.08 || 1;
    var XY = pts.map(function (p, i) { return [px0 + ((px1 - px0) * i) / (pts.length - 1), py1 - ((num(p.value, 0) - base) / (top - base || 1)) * (py1 - py0)]; });
    // axes + grid
    var ax = svg("g", null, c.g), am = "";
    for (var gi = 0; gi <= 4; gi++) { var gy = py0 + ((py1 - py0) * gi) / 4; am += '<path d="M' + f1(px0) + " " + f1(gy) + "H" + f1(px1) + '" stroke="' + MUTED + '" stroke-width="1" stroke-dasharray="3 6" opacity="0.6"/>'; }
    am += P("M" + f1(px0) + " " + f1(py0 - h * 0.04) + "V" + f1(py1) + "H" + f1(px1 + w * 0.03), "none", SK(INK, u(3.4)));
    ax.innerHTML = am;
    // area (hatched) revealed with the line
    var cid = uid("cc"), cp = svg("clipPath", { id: cid }, c.defs), crect = svg("rect", { x: 0, y: 0, width: 0, height: h }, cp);
    var areaD = "M" + f1(XY[0][0]) + " " + f1(py1) + XY.map(function (p) { return "L" + f1(p[0]) + " " + f1(p[1]); }).join("") + "L" + f1(XY[XY.length - 1][0]) + " " + f1(py1) + "Z";
    var hid = uid("ch"), hp = svg("pattern", { id: hid, width: 9, height: 9, patternUnits: "userSpaceOnUse" }, c.defs);
    hp.innerHTML = '<path d="M0 9L9 0M-2 2L2 -2M7 11L11 7" stroke="' + col + '" stroke-width="1.4" stroke-opacity="0.55"/>';
    svg("path", { d: areaD, fill: "url(#" + hid + ")", "clip-path": "url(#" + cid + ")" }, c.g);
    svg("path", { d: areaD, fill: col, opacity: 0.1, "clip-path": "url(#" + cid + ")" }, c.g);
    var lineD = XY.map(function (p, i) { return (i ? "L" : "M") + f1(p[0]) + " " + f1(p[1]); }).join("");
    var line = svg("path", { d: lineD, fill: "none", stroke: col, "stroke-width": u(7), "stroke-linejoin": "round", "stroke-linecap": "round" }, c.g);
    var segL = [0];
    for (var i = 1; i < XY.length; i++) segL.push(segL[i - 1] + Math.hypot(XY[i][0] - XY[i - 1][0], XY[i][1] - XY[i - 1][1]));
    var total = segL[segL.length - 1];
    line.style.strokeDasharray = f1(total + 2) + " " + f1(total + 2);
    var t0 = at + 0.45;
    var times = syncTimes(pts.map(function (p, i) { return p.word || (i === 0 ? null : null); }), { after: t0, gap: 0.35, a: t0, b: Math.min(endLimit() - 0.6, t0 + Math.max(1.2, (D - t0) * 0.7)) });
    times[0] = Math.min(times[0], t0);
    for (i = 1; i < times.length; i++) if (times[i] < times[i - 1] + 0.3) times[i] = times[i - 1] + 0.3;
    // x labels
    var lsz = u(Pt ? 26 : 22), every = pts.length > 6 && Pt ? 2 : 1;
    pts.forEach(function (p, k) { if (str(p.label) && (k % every === 0 || k === pts.length - 1)) cardText(c, plain(p.label), XY[k][0], py1 + h * 0.025, lsz, { align: "center", maxWidth: (px1 - px0) / Math.max(1, pts.length - 1) * every * 0.98, maxLines: 1, weight: 700, color: MUTED }); });
    // dots, value labels, notes
    var marks = [];
    pts.forEach(function (p, k) {
      var d = svg("circle", { cx: f1(XY[k][0]), cy: f1(XY[k][1]), r: u(9), fill: PAPER, stroke: col, "stroke-width": u(4.5) }, c.g);
      var last = k === pts.length - 1, showV = o.milestones || str(p.note) || last || k === 0;
      var vt = null, nt = null;
      var vsz = u(Pt ? 26 : 26), vy0 = XY[k][1] - u(14) - vsz * 1.1;
      if (showV && !last) {
        var vtxt = compact(num(p.value, 0), o.prefix, o.suffix);
        var vy = vy0 < py0 - u(26) ? XY[k][1] + u(12) : vy0;
        vt = cardText(c, vtxt, XY[k][0] + (k === 0 ? u(10) : 0), vy, vsz, { align: k === 0 ? "left" : "center", maxLines: 1, weight: 900, color: INK });
      }
      if (str(p.note)) {
        var nsz = u(Pt ? 23 : 22), ny, nal, nx = XY[k][0];
        if (last) { nal = "right"; nx = XY[k][0] - u(16); ny = falling ? XY[k][1] + u(14) : XY[k][1] + u(4); }
        else { nal = k === 0 ? "left" : "center"; ny = (showV ? Math.min(vy0, vt ? vt.y : vy0) : XY[k][1] - u(14)) - nsz * 1.25; }
        ny = clamp(ny, h * 0.14, py1 - nsz * 1.3);
        nt = cardText(c, plain(p.note), nx, ny, nsz, { align: nal, maxLines: 1, weight: 700, family: SERIF, color: col, cls: "fs-note" });
      }
      marks.push({ d: d, vt: vt, nt: nt, t: times[k] });
    });
    // final value, big
    var lp = pts[pts.length - 1], fin = compact(num(lp.value, 0), o.prefix, o.suffix), fsz = u(Pt ? 74 : 64);
    var fx = Math.min(XY[XY.length - 1][0] + u(10), w - pad), fy = falling ? py0 - h * 0.06 : Math.max(h * 0.1, XY[XY.length - 1][1] - fsz * 1.35);
    var big = cardText(c, fin, fx, fy, fsz, { align: "right", maxLines: 1, weight: 900, color: col, cls: "fs-bigv" });
    var arrowEl = svg("path", { d: falling ? "M0 -16L0 14M-11 3L0 15L11 3" : "M0 16L0 -14M-11 -3L0 -15L11 -3", stroke: col, "stroke-width": u(5), fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round", transform: "translate(" + f1(fx - big.w - u(30)) + " " + f1(fy + fsz * 0.5) + ") scale(" + f2(u(1.6)) + ")" }, c.g);
    var tEnd = times[times.length - 1];
    s.anims.push(function (t) {
      // line progress
      var prog = 0;
      if (t >= times[0]) {
        prog = 0;
        for (var k = 1; k < times.length; k++) {
          if (t >= times[k]) prog = segL[k];
          else { var a = Math.max(times[k - 1], times[k] - 0.9), p = clamp((t - a) / (times[k] - a), 0, 1); prog = segL[k - 1] + (segL[k] - segL[k - 1]) * V.ease.inOutSine(p); break; }
        }
      }
      setS(line, "strokeDashoffset", f1(total + 2 - prog));
      var hx = XY[0][0];
      for (var j = 1; j < XY.length; j++) { if (prog >= segL[j]) hx = XY[j][0]; else { hx = lerp(XY[j - 1][0], XY[j][0], (prog - segL[j - 1]) / (segL[j] - segL[j - 1] || 1)); break; } }
      setA(crect, "width", f1(t >= times[0] ? hx : 0));
      marks.forEach(function (mk) {
        var on = t >= mk.t - 0.02, pk = popK(t, mk.t - 0.02, 0.3);
        showEl(mk.d, on);
        if (on) setA(mk.d, "r", f1(u(9) * Math.max(0.2, pk)));
        if (mk.vt) showEl(mk.vt.el, t >= mk.t + 0.05);
        if (mk.nt) showEl(mk.nt.el, t >= mk.t + 0.15);
      });
      showEl(big.el, t >= tEnd + 0.1);
      showEl(arrowEl, t >= tEnd + 0.1);
    });
    c.times = times;
    c.endAt = tEnd;
    return c;
  }

  // ------------------------- map -------------------------
  var LAND_POLY = [
    [[-168, 66], [-162, 70], [-140, 70], [-128, 70], [-115, 68], [-95, 72], [-82, 73], [-70, 62], [-64, 60], [-56, 52], [-66, 45], [-70, 42], [-76, 38], [-76, 35], [-81, 31], [-80, 26], [-82, 27], [-84, 30], [-90, 29], [-97, 27], [-97, 22], [-92, 18], [-87, 21], [-88, 16], [-83, 12], [-80, 8], [-78, 8], [-83, 9], [-86, 12], [-92, 14], [-96, 16], [-105, 20], [-110, 24], [-112, 29], [-115, 30], [-117, 32], [-121, 35], [-124, 40], [-124, 46], [-125, 50], [-131, 54], [-136, 58], [-146, 60], [-152, 59], [-158, 57], [-163, 55], [-158, 59], [-162, 60], [-166, 62], [-165, 65]],
    [[-52, 60], [-44, 60], [-38, 65], [-22, 70], [-20, 76], [-30, 82], [-60, 82], [-70, 78], [-58, 75], [-54, 70], [-52, 64]],
    [[-80, 8], [-75, 11], [-72, 12], [-62, 11], [-52, 5], [-50, 0], [-44, -2], [-35, -6], [-35, -9], [-39, -14], [-40, -20], [-44, -23], [-48, -26], [-53, -33], [-57, -36], [-62, -39], [-65, -42], [-66, -47], [-69, -51], [-68, -55], [-72, -53], [-75, -46], [-73, -38], [-71, -30], [-70, -18], [-75, -15], [-77, -10], [-81, -5], [-80, -1], [-78, 2]],
    [[-10, 36], [-9, 43], [-2, 43], [-1, 46], [-5, 48], [-2, 49], [2, 51], [5, 53], [8, 54], [9, 57], [11, 56], [12, 54], [18, 55], [21, 57], [22, 60], [24, 65], [20, 69], [16, 69], [12, 66], [6, 62], [5, 59], [10, 59], [11, 63], [18, 70], [25, 71], [30, 70], [40, 67], [44, 68], [50, 69], [58, 68], [60, 60], [60, 50], [50, 47], [48, 42], [40, 41], [36, 36], [28, 37], [26, 40], [23, 36], [20, 40], [15, 40], [16, 38], [12, 38], [12, 44], [8, 44], [3, 43], [0, 39], [-2, 37], [-6, 36]],
    [[-6, 50], [1, 51], [2, 53], [-1, 55], [-2, 58], [-5, 59], [-6, 57], [-5, 55], [-3, 54], [-5, 52]],
    [[-10, 52], [-6, 52], [-6, 55], [-9, 55]],
    [[-17, 21], [-16, 28], [-10, 30], [-6, 36], [3, 37], [10, 37], [11, 33], [20, 31], [30, 31], [33, 31], [35, 28], [39, 21], [43, 12], [51, 12], [51, 10], [44, 2], [41, -2], [40, -10], [40, -15], [35, -20], [35, -24], [32, -29], [27, -34], [20, -35], [18, -32], [15, -27], [12, -18], [13, -12], [9, -1], [9, 4], [4, 6], [-4, 5], [-8, 4], [-13, 8], [-17, 14]],
    [[44, -16], [50, -15], [49, -25], [45, -25]],
    [[30, 70], [40, 67], [60, 69], [70, 73], [80, 73], [100, 77], [112, 74], [130, 71], [140, 72], [160, 70], [170, 67], [180, 66], [180, 62], [172, 60], [163, 58], [160, 52], [156, 51], [155, 57], [143, 59], [137, 54], [141, 48], [135, 43], [130, 42], [128, 39], [126, 35], [122, 40], [121, 37], [119, 35], [121, 31], [122, 29], [119, 25], [114, 22], [109, 21], [106, 17], [109, 12], [105, 9], [103, 10], [100, 13], [100, 7], [104, 1], [101, 3], [98, 8], [98, 15], [94, 17], [92, 22], [88, 22], [86, 20], [80, 15], [80, 10], [77, 8], [73, 16], [73, 21], [70, 22], [67, 25], [62, 25], [57, 26], [56, 24], [59, 22], [55, 17], [52, 16], [45, 13], [43, 15], [39, 22], [35, 28], [34, 31], [36, 36], [30, 37], [27, 40], [28, 41], [36, 41], [41, 41], [49, 41], [50, 46], [54, 47], [60, 50], [60, 60], [58, 68], [50, 69], [44, 68]],
    [[130, 31], [132, 34], [135, 34], [139, 35], [141, 38], [142, 41], [141, 45], [145, 44], [143, 42], [140, 40], [140, 36], [136, 33], [131, 33]],
    [[95, 5], [100, 0], [106, -6], [115, -8], [120, -9], [125, -8], [118, -5], [110, -7], [105, -6], [103, -2]],
    [[109, 1], [113, 4], [118, 6], [119, 1], [116, -3], [110, -2]],
    [[131, -1], [141, -3], [150, -10], [143, -9], [138, -8], [132, -4]],
    [[114, -22], [114, -26], [115, -34], [118, -35], [123, -34], [129, -32], [134, -32], [138, -35], [140, -38], [146, -39], [150, -37], [153, -32], [153, -27], [150, -22], [146, -19], [145, -15], [142, -11], [141, -14], [139, -17], [136, -15], [136, -12], [131, -11], [128, -15], [125, -14], [122, -18], [118, -20]],
    [[172, -34], [175, -37], [178, -38], [176, -41], [172, -44], [168, -46], [167, -45], [171, -41]],
    [[120, 18], [122, 18], [124, 12], [126, 7], [122, 7], [121, 12]],
    [[-24, 64], [-14, 64], [-14, 66], [-22, 66]],
    [[-85, 22], [-80, 23], [-74, 20], [-78, 20]],
  ];
  var REGIONS = { world: [-168, 190, -56, 80], americas: [-170, -28, -58, 74], "north america": [-170, -50, 8, 74], usa: [-127, -64, 23, 51], "south america": [-92, -30, -57, 14], europe: [-13, 42, 34, 71], asia: [25, 150, -12, 72], "east asia": [95, 150, 15, 50], africa: [-22, 56, -37, 38], australia: [110, 180, -48, -8], "middle east": [24, 64, 10, 42] };
  var REGION_SYN = { us: "usa", "united states": "usa", america: "usa", global: "world", earth: "world", eu: "europe", "latin america": "south america", "far east": "east asia", oceania: "australia", mideast: "middle east" };
  function regionKey(n) { n = str(n).toLowerCase(); return REGIONS[n] ? n : REGION_SYN[n] || null; }
  var PLACES = {
    detroit: [42.3, -83], "new york": [40.7, -74], chicago: [41.9, -87.6], "los angeles": [34.05, -118.2], "san francisco": [37.8, -122.4], seattle: [47.6, -122.3], houston: [29.8, -95.4], dallas: [32.8, -96.8], miami: [25.8, -80.2], boston: [42.4, -71.1], atlanta: [33.7, -84.4], denver: [39.7, -105], austin: [30.3, -97.7], phoenix: [33.4, -112], "las vegas": [36.2, -115.1], toronto: [43.7, -79.4], vancouver: [49.3, -123.1], montreal: [45.5, -73.6], "mexico city": [19.4, -99.1], mexico: [23.6, -102.5], canada: [56, -106], usa: [39.8, -98.6], "united states": [39.8, -98.6], america: [39.8, -98.6], brazil: [-10, -52], "sao paulo": [-23.5, -46.6], rio: [-22.9, -43.2], "rio de janeiro": [-22.9, -43.2], "buenos aires": [-34.6, -58.4], argentina: [-36, -64], chile: [-33, -71], santiago: [-33.4, -70.6], peru: [-9, -75], lima: [-12, -77], colombia: [4.6, -74], bogota: [4.7, -74.1],
    london: [51.5, -0.1], uk: [53, -2], britain: [53, -2], england: [52.5, -1.5], "united kingdom": [53, -2], paris: [48.9, 2.35], france: [46.6, 2.4], berlin: [52.5, 13.4], germany: [51.2, 10.4], munich: [48.1, 11.6], madrid: [40.4, -3.7], spain: [40, -4], barcelona: [41.4, 2.2], rome: [41.9, 12.5], milan: [45.5, 9.2], italy: [42.8, 12.8], amsterdam: [52.4, 4.9], netherlands: [52.2, 5.3], sweden: [62, 15], stockholm: [59.3, 18.1], norway: [61, 9], oslo: [59.9, 10.7], denmark: [56, 10], copenhagen: [55.7, 12.6], finland: [62, 26], poland: [52, 19], warsaw: [52.2, 21], moscow: [55.8, 37.6], russia: [60, 90], turkey: [39, 35], istanbul: [41, 29], ireland: [53.4, -8], dublin: [53.35, -6.26], switzerland: [46.8, 8.2], zurich: [47.4, 8.5], geneva: [46.2, 6.1], belgium: [50.5, 4.5], brussels: [50.85, 4.35], portugal: [39.4, -8.2], lisbon: [38.7, -9.1], greece: [39, 22], athens: [38, 23.7], austria: [47.5, 14.5], vienna: [48.2, 16.4],
    dubai: [25.2, 55.3], uae: [24, 54], "saudi arabia": [24, 45], riyadh: [24.7, 46.7], israel: [31.5, 34.8], "tel aviv": [32.1, 34.8], egypt: [26.8, 30.8], cairo: [30, 31.2], qatar: [25.3, 51.2], iran: [32, 53], pakistan: [30, 70], nigeria: [9, 8], lagos: [6.5, 3.4], kenya: [0, 38], nairobi: [-1.3, 36.8], "south africa": [-29, 24], johannesburg: [-26.2, 28], "cape town": [-33.9, 18.4], morocco: [32, -6], ghana: [7.9, -1], ethiopia: [9, 39],
    india: [21, 78], mumbai: [19.1, 72.9], delhi: [28.6, 77.2], bangalore: [13, 77.6], china: [35, 104], beijing: [39.9, 116.4], shanghai: [31.2, 121.5], "hong kong": [22.3, 114.2], shenzhen: [22.5, 114.1], japan: [36.2, 138.2], tokyo: [35.7, 139.7], osaka: [34.7, 135.5], korea: [36.5, 127.8], "south korea": [36.5, 127.8], seoul: [37.6, 127], taiwan: [23.7, 121], taipei: [25, 121.5], singapore: [1.35, 103.8], indonesia: [-2.5, 118], jakarta: [-6.2, 106.8], thailand: [15, 101], bangkok: [13.75, 100.5], vietnam: [16, 107], philippines: [12.9, 122], manila: [14.6, 121], malaysia: [4, 102], australia: [-25, 134], sydney: [-33.9, 151.2], melbourne: [-37.8, 145], "new zealand": [-41, 174], auckland: [-36.8, 174.8],
    europe: [50, 10], asia: [35, 100], africa: [5, 20], "south america": [-15, -60], "north america": [45, -100], "middle east": [27, 45],
  };
  function placeLL(p) {
    p = obj(p);
    if (isFinite(num(p.lat, NaN)) && isFinite(num(p.lon, NaN))) return [num(p.lat, 0), num(p.lon, 0)];
    var k = str(p.place).toLowerCase().replace(/[.]/g, "").trim();
    if (PLACES[k]) return PLACES[k];
    var parts = k.split(/[,(]/);
    for (var i = 0; i < parts.length; i++) { var q = parts[i].trim(); if (PLACES[q]) return PLACES[q]; }
    return null;
  }
  function smoothPoly(pts) {
    var n = pts.length, d = "";
    for (var i = 0; i < n; i++) {
      var a = pts[i], b = pts[(i + 1) % n], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (i === 0) { var z = pts[n - 1], m0 = [(z[0] + a[0]) / 2, (z[1] + a[1]) / 2]; d += "M" + f1(m0[0]) + " " + f1(m0[1]); }
      d += "Q" + f1(a[0]) + " " + f1(a[1]) + " " + f1(m[0]) + " " + f1(m[1]);
    }
    return d + "Z";
  }
  function map_(o) {
    var s = ensure();
    o = obj(o);
    var Pt = s.portrait;
    var rawPins = arr(o.pins).map(function (p) { return typeof p === "string" ? { place: p } : obj(p); }).filter(function (p) { return str(p.place) || isFinite(num(p.lat, NaN)); }).slice(0, 12);
    var lls = rawPins.map(placeLL);
    var rk = regionKey(o.region);
    if (!rk) {
      // choose the smallest region that holds every known pin
      var known = lls.filter(Boolean), best = "world";
      ["usa", "europe", "east asia", "middle east", "australia", "south america", "north america", "africa", "asia", "americas"].some(function (r) {
        var b = REGIONS[r], ok = known.length > 0 && known.every(function (q) { return q[1] >= b[0] + 2 && q[1] <= b[1] - 2 && q[0] >= b[2] + 2 && q[0] <= b[3] - 2; });
        if (ok) best = r;
        return ok;
      });
      rk = best;
    }
    var B = REGIONS[rk], lonW = B[1] - B[0], latH = (B[3] - B[2]) * 1.18;
    var ratio = clamp(latH / lonW, 0.42, 1.1) + 0.1;
    var c = makeCard("map", plain(o.title) || "map", o, Pt ? clamp(ratio, 0.5, 0.575) : Math.max(0.5, Math.min(ratio, 0.72)), "fs-paper fs-mapcard");
    var w = c.w, h = c.h, pad = w * 0.04, at = c.at;
    var mx0 = pad, mx1 = w - pad, my0 = h * 0.15, my1 = h - pad;
    var sc_ = Math.min((mx1 - mx0) / lonW, (my1 - my0) / latH), offX = (mx0 + mx1) / 2 - ((B[0] + B[1]) / 2) * sc_, cLat = (B[2] + B[3]) / 2, offY = (my0 + my1) / 2;
    function prj(lat, lon) { if (rk === "world" && lon < B[0]) lon += 360; return [offX + lon * sc_, offY - (lat - cLat) * 1.18 * sc_]; }
    var cid = uid("mc"), cp = svg("clipPath", { id: cid }, c.defs);
    svg("rect", { x: f1(mx0), y: f1(my0), width: f1(mx1 - mx0), height: f1(my1 - my0), rx: 6 }, cp);
    var mg = svg("g", { "clip-path": "url(#" + cid + ")" }, c.g), mm = R(mx0, my0, mx1 - mx0, my1 - my0, "#C9DCE0");
    for (var lo = -180; lo <= 360; lo += 30) { var a1 = prj(80, lo), a2 = prj(-80, lo); mm += '<path d="M' + f1(a1[0]) + " " + f1(a1[1]) + "L" + f1(a2[0]) + " " + f1(a2[1]) + '" stroke="#9DB6BE" stroke-width="1" stroke-dasharray="3 6"/>'; }
    for (var la = -60; la <= 80; la += 20) { var b1 = prj(la, B[0] - 10), b2 = prj(la, B[1] + 10); mm += '<path d="M' + f1(b1[0]) + " " + f1(b1[1]) + "L" + f1(b2[0]) + " " + f1(b2[1]) + '" stroke="#9DB6BE" stroke-width="1" stroke-dasharray="3 6"/>'; }
    var shiftCopies = rk === "world" ? [0, 360] : [0];
    LAND_POLY.forEach(function (poly_) {
      shiftCopies.forEach(function (sh) {
        var pp = poly_.map(function (q) { var lon = q[0] + sh; return [offX + lon * sc_, offY - (q[1] - cLat) * 1.18 * sc_]; });
        var d = smoothPoly(pp);
        mm += P(d, "#E6D9B9", SK(INK, Math.max(1.2, u(2.2)))) + '<path d="' + d + '" fill="none" stroke="' + shade("#E6D9B9", 0.82) + '" stroke-width="' + f1(u(6)) + '" opacity="0.35" transform="translate(2 2)"/>';
      });
    });
    mg.innerHTML = mm;
    svg("rect", { x: f1(mx0), y: f1(my0), width: f1(mx1 - mx0), height: f1(my1 - my0), rx: 6, fill: "none", stroke: INK, "stroke-width": u(3) }, c.g);
    var title = (plain(o.title) || "EXPANSION").toUpperCase();
    cardText(c, title, pad, h * 0.035, u(Pt ? 32 : 28), { maxWidth: w * 0.55, maxLines: 1, weight: 900 });
    // counter (top right)
    var unit = plain(o.counterLabel) || "locations", csz = Math.min(u(Pt ? 56 : 48), h * 0.085);
    var cnt = div("fs-counter", c.txt), cnum = div("fs-cnum", cnt, "0"), clab = div("fs-clab", cnt, unit.toUpperCase());
    cnum.style.fontSize = f1(csz) + "px"; clab.style.fontSize = f1(Math.min(u(Pt ? 22 : 19), h * 0.036)) + "px";
    cnt.style.right = f1(pad) + "px"; cnt.style.top = f1(h * 0.01) + "px";
    // pins
    var keys = rawPins.map(function (p) { return p.word || str(p.place).split(/[\s,]+/)[0]; });
    var times = syncTimes(keys, { after: at + 0.4, gap: 0.35, a: at + 0.7, b: Math.min(endLimit() - 0.5, at + 0.7 + Math.max(1.2, (D - at) * 0.6)) });
    var pins = [], boxes = [], fallbackI = 0;
    rawPins.forEach(function (p, i) {
      var ll = lls[i];
      if (!ll) { fallbackI++; ll = [B[2] + (B[3] - B[2]) * (0.3 + 0.4 * hash(i + 3)), B[0] + (B[1] - B[0]) * (0.2 + 0.6 * hash(i + 9))]; }
      var xy = prj(ll[0], ll[1]);
      xy[0] = clamp(xy[0], mx0 + u(10), mx1 - u(10)); xy[1] = clamp(xy[1], my0 + u(26), my1 - u(6));
      var t = Math.max(times[i], at + 0.6);
      var pg = svg("g", null, c.g), ps = u(Pt ? 1.25 : 1.1);
      pg.innerHTML = '<g transform="scale(' + f2(ps) + ')"><path d="M0 0C-4 -8 -14 -14 -14 -24A14 14 0 1 1 14 -24C14 -14 4 -8 0 0Z" fill="' + ACC + '" stroke="' + INK + '" stroke-width="2.4"/><circle cx="0" cy="-24" r="5" fill="' + PAPER + '"/></g>';
      var lab = plain(p.label || p.place).toUpperCase(), lsz = Math.min(u(Pt ? 24 : 21), w * 0.026), lw = measure(lab, lsz, 800) + u(12), lh = lsz * 1.3;
      var cands = [[xy[0] + u(16), xy[1] - u(30) - lh / 2], [xy[0] - u(16) - lw, xy[1] - u(30) - lh / 2], [xy[0] - lw / 2, xy[1] - u(48) - lh], [xy[0] - lw / 2, xy[1] + u(8)], [xy[0] + u(16), xy[1] + u(4)], [xy[0] - u(16) - lw, xy[1] + u(4)]];
      var pick = null;
      for (var k = 0; k < cands.length && !pick; k++) {
        var q = cands[k], bx = { x: q[0], y: q[1], w: lw, h: lh };
        if (bx.x < mx0 + 2 || bx.x + bx.w > mx1 - 2 || bx.y < my0 + 2 || bx.y + bx.h > my1 - 2) continue;
        if (boxes.some(function (o2) { return bx.x < o2.x + o2.w && bx.x + bx.w > o2.x && bx.y < o2.y + o2.h && bx.y + bx.h > o2.y; })) continue;
        pick = bx;
      }
      var le = null;
      if (pick) {
        boxes.push(pick);
        le = div("fs-pinlab", c.txt, lab);
        le.style.left = f1(pick.x) + "px"; le.style.top = f1(pick.y) + "px"; le.style.fontSize = f1(lsz) + "px"; le.style.lineHeight = f1(lh) + "px";
      }
      boxes.push({ x: xy[0] - u(16), y: xy[1] - u(42), w: u(32), h: u(42) });
      pins.push({ g: pg, x: xy[0], y: xy[1], t: t, lab: le });
    });
    // routes
    var routes = [];
    if (o.lines !== false) for (var r = 1; r < pins.length; r++) {
      var A = pins[r - 1], Bp = pins[r], mxp = (A.x + Bp.x) / 2, myp = (A.y + Bp.y) / 2 - Math.hypot(Bp.x - A.x, Bp.y - A.y) * 0.22;
      var rp = svg("path", { d: "M" + f1(A.x) + " " + f1(A.y - u(6)) + "Q" + f1(mxp) + " " + f1(myp) + " " + f1(Bp.x) + " " + f1(Bp.y - u(6)), fill: "none", stroke: INK, "stroke-width": u(3), "stroke-dasharray": u(8) + " " + u(8), "stroke-linecap": "round" }, c.g);
      routes.push({ el: rp, len: rp.getTotalLength ? rp.getTotalLength() || 300 : 300, t0: Math.max(A.t, Bp.t - 0.6), t1: Bp.t });
      c.g.insertBefore(rp, pins[0].g);
    }
    s.anims.push(function (t) {
      var n = 0;
      pins.forEach(function (pn) {
        var on = t >= pn.t, k = popK(t, pn.t, 0.4);
        showEl(pn.g, on);
        if (on) { n++; setA(pn.g, "transform", "translate(" + f1(pn.x) + " " + f1(pn.y - (1 - Math.min(1, k)) * u(40)) + ") scale(1 " + f2(Math.max(0.3, k)) + ")"); }
        if (pn.lab) showEl(pn.lab, t >= pn.t + 0.12);
      });
      routes.forEach(function (rt) {
        var p = clamp((t - rt.t0) / Math.max(0.1, rt.t1 - rt.t0), 0, 1);
        showEl(rt.el, p > 0);
        // dashed line reveal: a mask by dash would fight the dash pattern, so clip by length with a second dasharray
        setS(rt.el, "strokeDasharray", p >= 1 ? u(8) + " " + u(8) : dashReveal(rt.len, p, u(8)));
      });
      var txt = String(n);
      if (cnum.textContent !== txt) cnum.textContent = txt;
    });
    c.pins = pins;
    c.endAt = pins.length ? pins[pins.length - 1].t : at;
    return c;
  }
  function dashReveal(len, p, dl) {
    var shown = len * p, out = [], acc = 0;
    while (acc + dl * 2 <= shown && out.length < 400) { out.push(f1(dl), f1(dl)); acc += dl * 2; }
    var rest = shown - acc;
    out.push(f1(Math.max(0, Math.min(dl, rest))), f1(len + dl * 2));
    return out.join(" ");
  }

  // Contract: signatures draw on, then a red seal stamps with a shake.
  function contract(o) {
    var s = ensure();
    o = obj(o);
    var Pt = s.portrait;
    var c = makeCard("contract", plain(o.title) || "contract", o, Pt ? 0.575 : 0.72, "fs-paper fs-contract");
    var w = c.w, h = c.h, pad = w * 0.07, at = c.at;
    var title = (plain(o.title) || "AGREEMENT").toUpperCase();
    cardText(c, title, w / 2, h * 0.06, u(Pt ? 46 : 40), { align: "center", maxWidth: w - pad * 2, maxLines: 1, weight: 900, family: SERIF });
    var lm = "";
    for (var i = 0; i < 4; i++) { var ly = h * (0.24 + i * 0.055); lm += L(pad, ly, w - pad - (i % 2) * w * 0.12, ly, "#B9B0A3", u(3)); }
    var lg = svg("g", null, c.g);
    lg.innerHTML = lm;
    var amt = plain(o.amount);
    if (amt) cardText(c, amt, w / 2, h * 0.43, u(Pt ? 92 : 80), { align: "center", maxWidth: w - pad * 2, maxLines: 1, weight: 900, color: ACC, cls: "fs-amount" });
    var parties = arr(o.parties).map(plain).filter(Boolean).slice(0, 2);
    while (parties.length < 2) parties.push(parties.length ? "Partner" : "Company");
    var sAt = o.signAt != null ? tc(o.signAt) : tc(at + 0.9), seal = o.sealAt != null ? tc(o.sealAt) : tc(sAt + 1.6);
    var sy = h * 0.8, sw_ = (w - pad * 3) / 2, rnd = V.makeRand(77);
    parties.forEach(function (pn, k) {
      var x0 = pad + k * (sw_ + pad);
      svg("path", { d: "M" + f1(x0) + " " + f1(sy) + "H" + f1(x0 + sw_), stroke: INK, "stroke-width": u(2.6), fill: "none" }, c.g);
      cardText(c, pn.toUpperCase(), x0, sy + u(10), u(Pt ? 24 : 21), { maxWidth: sw_, maxLines: 1, weight: 800, color: MUTED });
      var d = "M" + f1(x0 + sw_ * 0.08) + " " + f1(sy - h * 0.04), xx = x0 + sw_ * 0.08;
      for (var j = 0; j < 7; j++) { var nx = xx + sw_ * (0.08 + rnd() * 0.06), hy = sy - h * (0.02 + rnd() * 0.12); d += "Q" + f1((xx + nx) / 2 - sw_ * 0.06) + " " + f1(hy) + " " + f1(nx) + " " + f1(sy - h * (0.015 + rnd() * 0.05)); xx = nx; }
      d += "M" + f1(x0 + sw_ * 0.06) + " " + f1(sy - h * 0.02) + "Q" + f1(x0 + sw_ * 0.5) + " " + f1(sy - h * 0.06) + " " + f1(xx + sw_ * 0.04) + " " + f1(sy - h * 0.03);
      var sg = svg("g", null, c.g);
      svg("path", { d: d, stroke: k ? "#2F4E7A" : INK, "stroke-width": u(3.2), fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" }, sg);
      drawOn(null, sg, sAt + k * 0.7, 0.7);
    });
    var sealG = svg("g", null, c.g), sr = Math.min(w, h) * 0.13, sx = w - pad - sr * 0.7, syy = h * 0.6;
    sealG.innerHTML = P(starD(0, 0, sr, sr * 0.86, 24, 0), ACC, SK(INK, u(2.4))) + C(0, 0, sr * 0.7, "none", SK("#F2D6CF", u(2.4))) + P(starD(0, 0, sr * 0.42, sr * 0.18, 5), "#F2D6CF", "");
    s.camera.shake(seal + 0.12, 12, 0.4);
    s.anims.push(function (t) {
      var on = t >= seal;
      showEl(sealG, on);
      if (!on) return;
      var p = clamp((t - seal) / 0.22, 0, 1), k = p < 1 ? lerp(1.9, 1, V.ease.inQuad(p)) : 1;
      setA(sealG, "transform", "translate(" + f1(sx) + " " + f1(syy) + ") rotate(-14) scale(" + f2(k) + ")");
      setA(sealG, "opacity", f2(p < 1 ? 0.5 + p * 0.5 : 0.94));
    });
    c.signAt = sAt; c.sealAt = seal;
    return c;
  }

  // ------------------------- world props -------------------------
  function assemblyLine(o) {
    var s = ensure();
    o = obj(o);
    var Pt = s.portrait, y = num(o.y, Pt ? 800 : s.square ? 858 : 884), speed = clamp(num(o.speed, 110), 20, 400), kind = sketchKey(o.product) || "box";
    var col = colorOr(o.color, ["#C8503C", "#3E6E8E", "#D29B3C", "#5F8A55"][strHash(kind) % 4]);
    var g = svg("g", { class: "fs-assembly" }, o.back ? s.L.props : s.L.front), x0 = -s.Ww * 0.35, x1 = s.Ww * 1.35, Wd = x1 - x0;
    var armXs = Pt ? [s.Ww * 0.78] : s.square ? [s.Ww * 0.62, s.Ww * 0.9] : [s.Ww * 0.56, s.Ww * 0.86];
    if (o.arms === false) armXs = [];
    var back = svg("g", null, g), pm = "";
    armXs.forEach(function (ax) { pm += R(ax - 20, y - 70, 40, 72, "#8E8A82", 3, O) + R(ax - 30, y - 82, 60, 16, "#5C6066", 4, O); });
    back.innerHTML = pm;
    var bm = R(x0, y + 22, Wd, 64, "#7C858C", 0, O) + R(x0, y + 22, Wd, 64, U("hatch")) + R(x0, y + 84, Wd, 10, "#5C6066", 0, O1);
    for (var lx = x0 + 60; lx < x1; lx += 180) bm += R(lx, y + 94, 16, 180, "#5C6066", 0, O1);
    bm += R(x0, y, Wd, 24, "#43474C", 0, O);
    var base = svg("g", null, g);
    base.innerHTML = bm;
    var ridge = svg("path", { d: "M" + f1(x0) + " " + f1(y + 12) + "H" + f1(x1), stroke: "#6E747A", "stroke-width": 20, "stroke-dasharray": "4 36", fill: "none" }, g);
    var rollers = [];
    for (var rx = x0 + 40; rx < x1; rx += 90) { var rg = svg("g", null, g); rg.innerHTML = C(0, 0, 13, "#A9AFB3", O1) + L(-11, 0, 11, 0, INK, 1.6) + L(0, -11, 0, 11, INK, 1.6); rollers.push({ g: rg, x: rx }); }
    var spacing = Pt ? 240 : 290, n = Math.ceil(Wd / spacing) + 1, units = [], usc = Pt ? 0.62 : 0.72;
    for (var i = 0; i < n; i++) {
      var ug = svg("g", null, g);
      ug.innerHTML = '<g transform="scale(' + usc + ')">' + E(0, 72, 92, 9, "rgba(43,36,32,0.25)") + sketchMarkup(kind, col, true) + "</g>";
      units.push(ug);
    }
    var arms = armXs.map(function (ax) {
      var ag = svg("g", null, g), a = { x: ax, g: ag };
      a.up = svg("g", null, ag); a.up.innerHTML = P(capsule(110, 22), "#E2B03C", O) + C(0, 0, 16, "#5C6066", O);
      a.lo = svg("g", null, a.up); a.lo.innerHTML = P(capsule(90, 16), "#D29B3C", O) + C(0, 0, 11, "#5C6066", O) + '<g transform="translate(0 92)">' + P("M-14 0H14L18 18H10L8 6H-8L-10 18H-18Z", "#5C6066", O1) + "</g>";
      a.spark = svg("g", null, ag); a.spark.innerHTML = P(starD(0, 0, 22, 6, 4, 0), "#F4D873", SK(INK, 1.6));
      return a;
    });
    s.anims.push(function (t) {
      setA(ridge, "stroke-dashoffset", f1(-((t * speed) % 40)));
      rollers.forEach(function (r) { setA(r.g, "transform", "translate(" + f1(r.x) + " " + f1(y + 54) + ") rotate(" + f1(((t * speed) / 13) * (180 / PI) % 360) + ")"); });
      units.forEach(function (ug, k) {
        var ux = x0 + ((((k * spacing + t * speed) % (n * spacing)) + n * spacing) % (n * spacing));
        setA(ug, "transform", "translate(" + f1(ux) + " " + f1(y - 72 * usc - 2) + ")");
      });
      arms.forEach(function (a) {
        // the tool dips when a unit passes under it (2-bone IK, elbow up)
        var tx0 = a.x + 70, ph = ((((tx0 - x0 - t * speed) % spacing) + spacing) % spacing) / spacing, dip = Math.pow(Math.max(0, Math.cos(ph * 2 * PI)), 4);
        var Sx = a.x, Sy = y - 80, Tx = tx0, Ty = y - 72 * usc - 30 - 70 * (1 - dip);
        var dx = Tx - Sx, dy = Ty - Sy, dd = Math.min(196, Math.max(30, Math.hypot(dx, dy))), ang = Math.atan2(dy, dx);
        var al = Math.acos(clamp((110 * 110 + dd * dd - 90 * 90) / (2 * 110 * dd), -1, 1));
        var Ex = Sx + Math.cos(ang - al) * 110, Ey = Sy + Math.sin(ang - al) * 110, th1 = Math.atan2(Ey - Sy, Ex - Sx), th2 = Math.atan2(Ty - Ey, Tx - Ex);
        setA(a.up, "transform", "translate(" + f1(Sx) + " " + f1(Sy) + ") rotate(" + f1((th1 * 180) / PI - 90) + ")");
        setA(a.lo, "transform", "translate(0 110) rotate(" + f1(((th2 - th1) * 180) / PI) + ")");
        var tipx = Ex + Math.cos(th2) * 108, tipy = Ey + Math.sin(th2) * 108;
        var sp = dip > 0.8;
        showEl(a.spark, sp);
        if (sp) setA(a.spark, "transform", "translate(" + f1(tipx) + " " + f1(tipy) + ") rotate(" + f1(t * 400 % 90) + ") scale(" + f2(0.6 + (dip - 0.82) * 3) + ")");
      });
    });
    return { group: g, y: y, speed: speed, product: kind };
  }
  function workbench(o) {
    var s = ensure();
    o = obj(o);
    var k = num(o.scale, s.charH / 720), x = num(o.x, heroX(s, "left") + 236 * k), top = num(o.ground, s.G) - 176 * k, w = 470 * k, g = svg("g", { class: "fs-workbench" }, s.L.front);
    var m = "";
    m += P(poly([[x - w / 2, top], [x + w / 2, top], [x + w / 2 + 30 * k, top - 26 * k], [x - w / 2 + 30 * k, top - 26 * k]]), "#B98A5E", O) + R(x - w / 2, top, w, 22 * k, "#9C6E46", 0, O) + R(x - w / 2, top, w, 22 * k, U("hatch"));
    m += R(x - w / 2 + 16 * k, top + 22 * k, 20 * k, 200 * k, "#8A5A3B", 0, O) + R(x + w / 2 - 36 * k, top + 22 * k, 20 * k, 200 * k, "#8A5A3B", 0, O) + R(x - w / 2 + 30 * k, top + 120 * k, w - 60 * k, 14 * k, "#8A5A3B", 0, O1);
    // vise, toolbox, mug
    m += R(x - w * 0.42, top - 40 * k, 50 * k, 40 * k, "#5C6066", 3, O) + R(x - w * 0.46, top - 56 * k, 70 * k, 16 * k, "#7C858C", 2, O1);
    m += R(x + w * 0.24, top - 46 * k, 80 * k, 46 * k, ACC, 4, O) + R(x + w * 0.24, top - 30 * k, 80 * k, 6 * k, shade(ACC, 0.7)) + P("M" + f1(x + w * 0.24 + 24 * k) + " " + f1(top - 46 * k) + "V" + f1(top - 60 * k) + "H" + f1(x + w * 0.24 + 56 * k) + "V" + f1(top - 46 * k), "none", O);
    var base = svg("g", null, g);
    base.innerHTML = m;
    var gears = [[x - w * 0.08, top - 62 * k, 40 * k, 1], [x + w * 0.09, top - 46 * k, 26 * k, -1.55]].map(function (q) {
      var gg = svg("g", null, g);
      gg.innerHTML = P(gearD(0, 0, q[2] * 0.78, q[2], q[2] > 30 * k ? 10 : 7), "#C9A04A", O) + C(0, 0, q[2] * 0.3, "#8E7A4A", O1) + L(-q[2] * 0.55, 0, q[2] * 0.55, 0, INK, 1.6);
      return { g: gg, x: q[0], y: q[1], sp: q[3] };
    });
    var post = svg("g", null, g);
    post.innerHTML = R(x - w * 0.08 - 5 * k, top - 62 * k, 10 * k, 62 * k, "#5C6066", 0, O1) + R(x + w * 0.09 - 4 * k, top - 46 * k, 8 * k, 46 * k, "#5C6066", 0, O1);
    g.insertBefore(post, gears[0].g);
    var lamp = svg("g", null, g), lx = num(o.lampX, x + w * 0.3), ly = top - 330 * k;
    if (o.lamp === false) lamp.style.display = "none";
    lamp.innerHTML = L(0, -800, 0, 0, INK, 2) + P("M" + f1(-36 * k) + " " + f1(40 * k) + "L" + f1(-12 * k) + " 0H" + f1(12 * k) + "L" + f1(36 * k) + " " + f1(40 * k) + "Z", "#5F8A55", O) + P("M" + f1(-36 * k) + " " + f1(40 * k) + "L" + f1(-110 * k) + " " + f1(300 * k) + "H" + f1(110 * k) + "L" + f1(36 * k) + " " + f1(40 * k) + "Z", "rgba(244,216,115,0.22)") + E(0, 40 * k, 36 * k, 7 * k, "#F4D873", O1);
    s.anims.push(function (t) {
      gears.forEach(function (q) { setA(q.g, "transform", "translate(" + f1(q.x) + " " + f1(q.y) + ") rotate(" + f1((t * 70 * q.sp) % 360) + ")"); });
      setA(lamp, "transform", "translate(" + f1(lx) + " " + f1(ly) + ") rotate(" + f2(5 * Math.sin(t * 1.4)) + " 0 -800)");
    });
    return { group: g, x: x, top: top, w: w };
  }

  // ------------------------- templates -------------------------
  var TPL = {};
  function archOf(v, def) { return archKey(v) || def; }
  function slotsFor(s, side) {
    var Lf = side !== "right";
    if (s.portrait) return { card: { x: 0.5, y: 0.3766 }, mid: { x: 0.5, y: 0.37 }, side: { x: Lf ? 0.755 : 0.245, y: 0.61 }, side2: { x: Lf ? 0.755 : 0.245, y: 0.7 }, hlTop: { x: 0.5, y: 0.3 }, sideW: 0.39 };
    if (s.square) return { card: { x: Lf ? 0.72 : 0.28, y: 0.6 }, right: { x: Lf ? 0.68 : 0.32, y: 0.46 }, hlTop: { x: Lf ? 0.3 : 0.7, y: 0.17 }, br: { x: Lf ? 0.72 : 0.28, y: 0.8 }, mid: { x: Lf ? 0.7 : 0.3, y: 0.62 }, hlTopW: 0.4 };
    return { card: { x: Lf ? 0.665 : 0.335, y: 0.57 }, right: { x: Lf ? 0.68 : 0.32, y: 0.43 }, hlTop: { x: Lf ? 0.27 : 0.73, y: 0.16 }, br: { x: Lf ? 0.72 : 0.28, y: 0.78 }, mid: { x: Lf ? 0.7 : 0.3, y: 0.6 }, hlTopW: 0.4 };
  }
  // scene + figure + plate + narration + camera rise, shared by most templates
  function baseScene(p, o) {
    o = obj(o);
    var side = p.side === "right" ? "right" : "left";
    var sc = makeScene({ empire: o.empire || p.empire || "city", sky: o.sky || p.sky || "day", growth: o.growth != null ? o.growth : growthNum(p.growth, 1), heroSide: side === "left" ? "right" : "left" });
    var s = st, slots_ = slotsFor(s, side);
    var fig = null;
    if (o.figure !== false) {
      fig = makeFigure(archOf(p.archetype, o.archetype || "founder"), { x: heroX(s, side), facing: side === "left" ? "right" : "left", expression: p.expression || o.expression || "confident", pose: p.pose || o.pose || "arms-crossed", scale: o.scale });
      S.narrate(fig);
    }
    if (o.plate !== false && (p.company || o.company)) plate(p.company || o.company, o.years != null ? o.years : p.years, { kicker: p.kicker || o.kicker, pos: side === "right" && !s.portrait ? "left" : null, at: 0.12 });
    var rx = fig ? lerp(s.Ww / 2, fig.x0, s.portrait ? 0.1 : 0.22) : s.Ww / 2;
    if (o.rise !== false) {
      if (s.portrait) sc.cam.rise(0, D * 0.9, { fromY: 514, toY: 496, fromZoom: 1.03, toZoom: 1, fromX: rx, x: s.Ww / 2 });
      else sc.cam.rise(0, D * 0.88, { fromY: 566, toY: 494, fromZoom: 1.1, toZoom: 1, fromX: rx, x: s.Ww / 2 });
    }
    return { sc: sc, s: s, fig: fig, side: side, slots: slots_, Pt: s.portrait, SQ: s.square, L: side === "left" };
  }
  function growDuring(g, a, b) { if (g < 0.999) growEmpire(st, a, b); }
  function headlineTime(p, key, text, def) { return tc(Math.max(0.45, wordAt(p[key], text, def))); }

  TPL["founder-intro"] = function (root, p) {
    var growth = growthNum(p.growth, 1), emp = empKey(p.empire, "city");
    var B = baseScene(p, { empire: emp, growth: growth }), s = B.s, fig = B.fig, Pt = B.Pt;
    var text = str(p.headline) || plain(p.company) || "The story";
    var tK = headlineTime(p, "keyword", text, D * 0.3);
    var hl = headline(text, tK - 0.05, { pos: Pt ? B.slots.mid : B.slots.right, size: Pt ? "xl" : "lg" });
    void hl;
    var st_ = obj(p.stat), tS = null;
    if (str(st_.value)) {
      tS = tc(Math.max(tK + 0.6, wordAt(st_.word, st_.label, Math.min(endLimit() - 1, tK + 2), tK - 0.3)));
      stat(st_.value, st_.label, tS - 0.1, { pos: Pt ? B.slots.side2 : B.slots.br, kicker: st_.kicker });
    }
    var tp = tc(tK - 0.3);
    fig.pose(Pt ? "point-up" : "point", tp, 0.45).expression("excited", tp, 0.25);
    if (tK + 1.9 < endLimit()) fig.pose(p.pose || "arms-crossed", tK + 1.9, 0.55).expression(p.expression || "confident", tK + 1.9);
    if (tS != null) { fig.pose("present", tS - 0.2, 0.4); if (tS + 1.6 < endLimit()) fig.pose(p.pose || "arms-crossed", tS + 1.6, 0.55); }
    fig.beats(p.beats, { from: 0, after: p.pose || "arms-crossed" });
    s.camera.shake(tK, 5, 0.3);
    growDuring(growth, tK, D - 1.2);
  };

  TPL["origin-workshop"] = function (root, p) {
    var yr = plain(p.year);
    var B = baseScene(p, { empire: "garage", sky: p.sky || "dawn", scale: V.isPortrait ? 0.88 : V.isSquare ? 0.82 : 1, archetype: "inventor", pose: "wrench", expression: "determined", years: yr ? "FOUNDED " + yr : "", kicker: p.kicker || "HUMBLE BEGINNINGS" }), s = B.s, fig = B.fig, Pt = B.Pt;
    var wk_ = fig.us / (720 / FIGH);
    workbench({ x: fig.x0 + (B.L ? 1 : -1) * 236 * wk_, scale: wk_, ground: fig.y0, lamp: !Pt });
    var kind = sketchKey(p.product) || "lightbulb";
    var tP = tc(Math.max(0.8, wordAt(p.productWord, p.productName || kind, D * 0.45)));
    var specs = arr(p.specs).map(str).filter(Boolean).slice(0, 3);
    var text = str(p.headline), tK = text ? headlineTime(p, "keyword", text, D * 0.2) : null;
    if (text) headline(text, tK - 0.05, { pos: Pt ? B.slots.side : B.slots.hlTop, size: "md", maxWidth: Pt ? B.slots.sideW : B.slots.hlTopW, rot: -2 });
    var pc = productCard({ kind: kind, name: p.productName || kind, year: yr, kicker: "FIRST PROTOTYPE", specs: specs, at: tP - 0.35, pos: B.slots.card });
    fig.pose("wrench", 0, 0);
    fig.pose(B.L ? "present" : "present", tP - 0.25, 0.45).expression("excited", tP - 0.2).emote("idea", tP, 1.6);
    var lastSpec = pc.specs.length ? pc.specs[pc.specs.length - 1].t : tP;
    if (lastSpec + 1.4 < endLimit()) fig.pose("wrench", Math.max(tP + 1.8, lastSpec + 0.6), 0.5).expression("determined", Math.max(tP + 1.8, lastSpec + 0.6));
    fig.beats(p.beats, { from: 0, after: "wrench" });
  };

  TPL["product-launch"] = function (root, p) {
    var pr = obj(p.product), kind = sketchKey(pr.kind) || "box", emp = empKey(p.empire, kind === "car" || kind === "truck" ? "auto" : kind === "software" || kind === "phone" || kind === "computer" || kind === "chip" ? "tech" : "factory");
    var B = baseScene(p, { empire: emp, scale: V.isPortrait ? 0.88 : V.isSquare ? 0.82 : 1, archetype: "engineer", years: plain(pr.year) || p.years, kicker: p.kicker || "NEW PRODUCT", pose: "idle", expression: "happy" }), s = B.s, fig = B.fig, Pt = B.Pt;
    var name = str(pr.name) || kind;
    var tP = tc(Math.max(0.5, wordAt(p.keyword, name, D * 0.2)));
    var specs = arr(p.specs).map(str).filter(Boolean).slice(0, 4);
    var pc = productCard({ kind: kind, name: name, year: plain(pr.year), kicker: "NEW PRODUCT", specs: specs, at: tP - 0.4, pos: B.slots.card });
    var text = str(p.headline);
    if (text) {
      var tH = tc(Math.max(tP + 0.8, wordAt(p.headlineWord, text, D * 0.75, tP)));
      headline(text, tH - 0.05, { pos: Pt ? B.slots.side : B.slots.hlTop, size: "md", maxWidth: Pt ? B.slots.sideW : B.slots.hlTopW, rot: -2 });
      if (tH + 0.2 < endLimit()) fig.pose("thumbs-up", tH - 0.2, 0.4).expression("excited", tH - 0.2).emote("sparkle", tH, 1.5);
    }
    fig.pose("present", tP - 0.3, 0.45).lookAt("forward", tP - 0.3);
    pc.specs.forEach(function (q, i) { if (i === 0) fig.pose("point", q.t - 0.25, 0.4); });
    var last = pc.specs.length ? pc.specs[pc.specs.length - 1].t : tP;
    if (!text && last + 0.6 < endLimit()) fig.pose("thumbs-up", last + 0.5, 0.4).expression("excited", last + 0.5);
    else if (text && last + 1.2 < tc(wordAt(p.headlineWord, text, D * 0.75, tP)) - 0.6) fig.pose("arms-crossed", last + 0.8, 0.5);
    fig.beats(p.beats, { from: tP });
  };

  TPL["expansion-map"] = function (root, p) {
    var B = baseScene(p, { empire: empKey(p.empire, "retail"), scale: V.isPortrait ? 0.88 : V.isSquare ? 0.82 : 1, archetype: "executive", growth: 0.35, pose: "idle", expression: "confident" }), s = B.s, fig = B.fig, Pt = B.Pt;
    var pins = arr(p.pins);
    var firstT = pins.length ? kwFind(obj(pins[0]).word || str(obj(pins[0]).place).split(/[\s,]+/)[0], 0) : null;
    var tM = tc(Math.max(0.35, (firstT == null ? D * 0.2 : firstT) - 0.9));
    var mc = map_({ region: p.region, pins: pins, title: p.title, counterLabel: p.counterLabel, at: tM, pos: B.slots.card });
    fig.pose("point", tM + 0.1, 0.45).lookAt("forward", tM);
    var text = str(p.headline), endP = mc.endAt;
    if (text) {
      var tH = tc(Math.max(endP + 0.4, wordAt(p.keyword, text, endP + 0.8, endP - 0.5)));
      headline(text, tH - 0.05, { pos: Pt ? B.slots.side : B.slots.hlTop, size: "md", maxWidth: Pt ? B.slots.sideW : B.slots.hlTopW });
    }
    if (endP + 0.5 < endLimit()) fig.pose("fist-pump", endP + 0.2, 0.4).expression("excited", endP + 0.2);
    if (endP + 2.3 < endLimit()) fig.pose("hands-hips", endP + 2.1, 0.5).expression("confident", endP + 2.1);
    growEmpire(s, mc.pins.length ? mc.pins[0].t : tM + 0.5, Math.max(endP, tM + 1.5));
    fig.beats(p.beats, { from: tM });
  };

  TPL["revenue-chart"] = function (root, p) {
    var pts = arr(p.points);
    var B = baseScene(p, { empire: empKey(p.empire, "finance"), scale: V.isPortrait ? 0.88 : V.isSquare ? 0.82 : 1, archetype: "investor", growth: 0.4, pose: "tablet", expression: "thinking" }), s = B.s, fig = B.fig, Pt = B.Pt;
    var firstW = pts.length ? kwFind(obj(pts[0]).word, 0) : null;
    var tC = tc(Math.max(0.35, wordAt(p.keyword, p.title, firstW == null ? D * 0.12 : firstW - 0.8) - 0.1));
    var ch = chart({ points: pts, title: p.title, prefix: p.prefix, suffix: p.suffix, milestones: p.milestones, at: tC, pos: B.slots.card });
    var falling = num(obj(pts[pts.length - 1]).value, 1) < num(obj(pts[0]).value, 0);
    var mid = ch.times[Math.floor(ch.times.length / 2)] || tC + 1;
    fig.pose("point", Math.max(tC + 0.8, mid - 0.3), 0.45).expression(falling ? "worried" : "happy", mid - 0.3);
    var tE = ch.endAt;
    if (tE + 0.3 < endLimit()) { fig.pose(falling ? "worried" : "fist-pump", tE, 0.4).expression(falling ? "shocked" : "excited", tE); fig.emote(falling ? "sweat" : "dollar", tE + 0.1, 1.6); }
    var text = str(p.headline);
    if (text) {
      var tH = tc(Math.max(tE + 0.2, wordAt(p.headlineWord, text, tE + 0.6, tE - 0.5)));
      headline(text, tH - 0.05, { pos: Pt ? B.slots.side : B.slots.hlTop, size: "md", maxWidth: Pt ? B.slots.sideW : B.slots.hlTopW, color: falling ? ACC : null });
      if (tH + 1.4 < endLimit() && !falling) fig.pose("arms-crossed", tH + 1.2, 0.5).expression("smug", tH + 1.2);
    }
    if (!falling) growEmpire(s, tC + 0.6, tE + 0.4);
    fig.beats(p.beats, { from: tC });
  };

  TPL.rivals = function (root, p) {
    var Lp = obj(p.left), Rp = obj(p.right), Pt = V.isPortrait, SQ = V.isSquare;
    var sc = makeScene({ empire: empKey(p.empire, "city"), sky: p.sky || "day", growth: 1, heroSide: "center" }), s = st;
    var ka = archOf(Lp.archetype, "founder"), kb = archOf(Rp.archetype, ka === "investor" ? "founder" : "investor");
    var scl = Pt ? 0.8 : SQ ? 0.86 : 1;
    var xa = Pt ? s.Ww * 0.27 : SQ ? s.Ww * 0.25 : s.Ww * 0.2, xb = Pt ? s.Ww * 0.73 : SQ ? s.Ww * 0.75 : s.Ww * 0.8;
    var A = makeFigure(ka, { x: xa, facing: "right", expression: Lp.expression || "determined", pose: "arms-crossed", scale: scl });
    var Bf = makeFigure(kb, { x: xb, facing: "left", expression: Rp.expression || "smug", pose: "hands-hips", scale: scl });
    var tA = tc(Math.max(0.35, wordAt(Lp.word, Lp.company, D * 0.12))), tB = tc(Math.max(tA + 0.9, wordAt(Rp.word, Rp.company, D * 0.4)));
    var tV = tc(Math.max(tB + 0.9, wordAt(p.keyword || "versus", "war", D * 0.75)));
    // who talks: A until B is named, then B, then both on the clash
    A.say(0.05, tB - 0.1); Bf.say(tB - 0.1, tV - 0.1); A.say(tV - 0.1, D);
    nameTag(A, Lp.company || "Company", tA, { accent: true });
    nameTag(Bf, Rp.company || "Rival", tB, {});
    A.pose("point", tA - 0.2, 0.4).lookAt("camera", tA - 0.2);
    if (tA + 1.2 < tB) A.pose("arms-crossed", tA + 1.1, 0.5).lookAt(Bf, tA + 1.1);
    Bf.pose("point", tB - 0.2, 0.4).lookAt("camera", tB - 0.2);
    if (tB + 1.2 < tV) Bf.pose("hands-hips", tB + 1.1, 0.5).lookAt(A, tB + 1.1);
    versus(tV - 0.05, { pos: { x: 0.5, y: Pt ? 0.52 : 0.47 } });
    A.pose("fist-pump", tV, 0.35).expression("angry", tV).emote("anger", tV + 0.1, 1.8).lookAt(Bf, tV);
    Bf.pose("point", tV + 0.1, 0.35).expression("angry", tV + 0.1).emote("anger", tV + 0.2, 1.8).lookAt(A, tV);
    var cam = sc.cam;
    cam.set({ x: s.Ww / 2, y: 500, zoom: 1 });
    cam.to({ actor: A, zoom: Pt ? 1.7 : 1.45, focusY: Pt ? 0.6 : 0.42, dx: Pt ? -34 : 80 }, Math.max(0, tA - 0.5), 0.6, "inOutCubic");
    cam.to({ actor: Bf, zoom: Pt ? 1.7 : 1.45, focusY: Pt ? 0.6 : 0.42, dx: Pt ? 34 : -80 }, tB - 0.35, 0.45, "inOutCubic");
    cam.to({ x: s.Ww / 2, y: 500, zoom: 1 }, tV - 0.32, 0.3, "outCubic");
    var text = str(p.headline);
    if (text) {
      var tH = tc(Math.max(tV + 0.5, wordAt(p.headlineWord, text, tV + 0.8)));
      headline(text, tH - 0.05, { pos: { x: 0.5, y: Pt ? 0.3 : 0.17 }, size: Pt ? "lg" : "md", maxWidth: Pt ? 0.9 : 0.5, rot: -1.5 });
    } else if (str(p.title)) label(p.title, tV + 0.6, { pos: "top" });
    void root;
  };

  TPL["crisis-moment"] = function (root, p) {
    var pts = arr(p.points).filter(function (q) { return isFinite(num(obj(q).value, NaN)); }), st0 = obj(p.stat);
    var B = baseScene(p, { scale: arr(p.points).length >= 2 ? (V.isPortrait ? 0.88 : V.isSquare ? 0.82 : 1) : 1, empire: empKey(p.empire, "city"), sky: "storm", archetype: "founder", pose: "idle", expression: "worried", kicker: p.kicker || "CRISIS" }), s = B.s, fig = B.fig, Pt = B.Pt;
    var text = str(p.headline) || "Crisis";
    var tK = headlineTime(p, "keyword", text, D * 0.15);
    var hasChart = pts.length >= 2;
    var hlPos = hasChart ? (Pt ? B.slots.side : B.slots.hlTop) : Pt ? B.slots.mid : B.slots.right;
    var hc = headline(text, tK - 0.05, { pos: hlPos, size: hasChart ? "md" : "lg", maxWidth: hasChart ? (Pt ? B.slots.sideW : B.slots.hlTopW) : null, color: ACC, rot: -2.5 });
    hc.mv.className += " fs-hl-red";
    s.camera.shake(tK, 18, 0.6);
    fig.pose("worried", tK - 0.15, 0.3).expression("shocked", tK - 0.15, 0.15).emote("exclaim", tK, 1.3);
    var tE = tK + 2;
    if (hasChart) {
      var ch = chart({ points: pts, title: p.title || "SHARE PRICE", prefix: p.prefix, suffix: p.suffix, falling: true, color: ACC, at: tc(tK + 0.5), pos: B.slots.card });
      tE = ch.endAt;
    } else if (str(st0.value)) {
      var tS = tc(Math.max(tK + 0.8, wordAt(st0.word, st0.label, tK + 1.5, tK)));
      stat(st0.value, st0.label, tS - 0.1, { pos: Pt ? B.slots.side2 : B.slots.br, color: ACC });
      tE = tS;
    }
    if (tK + 2.2 < endLimit()) fig.pose("facepalm", Math.max(tK + 2, tE - 0.6), 0.45).expression("sad", Math.max(tK + 2, tE - 0.6)).emote("sweat", Math.max(tK + 2.1, tE - 0.5), 2);
    if (tE + 1.2 < endLimit()) fig.pose("worried", tE + 0.8, 0.5).expression("worried", tE + 0.8);
    fig.beats(p.beats, { from: tK + 0.3 });
  };

  TPL["factory-floor"] = function (root, p) {
    var kind = sketchKey(p.product) || "box";
    var B = baseScene(p, { empire: empKey(p.empire, kind === "car" || kind === "truck" ? "auto" : "factory"), archetype: "engineer", pose: "hands-hips", expression: "confident", kicker: p.kicker || "PRODUCTION", scale: V.isPortrait ? 0.9 : 1 }), s = B.s, fig = B.fig, Pt = B.Pt;
    assemblyLine({ product: kind, speed: p.speed, back: Pt, y: Pt ? 676 : null });
    var text = str(p.headline) || "Mass production";
    var tK = headlineTime(p, "keyword", text, D * 0.3);
    headline(text, tK - 0.05, { pos: Pt ? { x: 0.5, y: 0.3 } : { x: B.L ? 0.66 : 0.34, y: 0.4 }, size: Pt ? "lg" : "md" });
    fig.pose(Pt ? "point" : "point-down", tc(tK - 0.3), 0.4).lookAt(Pt ? "forward" : "down", tc(tK - 0.3));
    var rt = obj(p.rate);
    if (str(rt.value)) {
      var tR = tc(Math.max(tK + 0.7, wordAt(rt.word, rt.label, tK + 1.6, tK)));
      stat(rt.value, rt.label, tR - 0.1, { pos: Pt ? { x: 0.5, y: 0.46 } : { x: B.L ? 0.74 : 0.26, y: 0.63 }, kicker: rt.kicker || "OUTPUT" });
      fig.pose("thumbs-up", tR - 0.15, 0.4).expression("happy", tR - 0.15).lookAt("camera", tR);
      if (tR + 1.8 < endLimit()) fig.pose("hands-hips", tR + 1.6, 0.5).expression("confident", tR + 1.6);
    } else if (tK + 1.8 < endLimit()) fig.pose("hands-hips", tK + 1.6, 0.5);
    fig.beats(p.beats, { from: tK });
  };

  TPL["era-chapter"] = function (root, p) {
    var g = clamp(num(p.growthAmount, 0.6), 0, 1);
    var sc = makeScene({ empire: empKey(p.empire, "city"), sky: p.sky || "dawn", growth: g, heroSide: "center" }), s = st;
    var tT = tc(Math.max(0.8, wordAt(p.keyword, p.title, D * 0.35)));
    chapter(p.year || "", p.title || "", { sub: p.sub, kicker: p.kicker || (p.company ? plain(p.company) : ""), at: 0.15, titleAt: tT - 0.05 });
    sc.cam.rise(0, D * 0.95, { fromY: 590, toY: 470, fromZoom: 1.16, toZoom: 1.0 });
    growDuring(g, 0.6, D - 1.2);
  };

  TPL["deal-handshake"] = function (root, p) {
    var ks = arr(p.archetypes).map(function (k) { return archKey(k); });
    var Pt = V.isPortrait, SQ = V.isSquare;
    var sc = makeScene({ empire: empKey(p.empire, "finance"), sky: p.sky || "day", growth: 1, heroSide: Pt ? "center" : "right" }), s = st;
    var ka = ks[0] || "founder", kb = ks[1] || (ka === "investor" ? "executive" : "investor");
    var scl = Pt ? 0.8 : SQ ? 0.76 : 0.92;
    var meet = Pt ? s.Ww * 0.5 : SQ ? s.Ww * 0.44 : s.Ww * 0.31, gap = 90 * (s.charH / FIGH) * scl;
    var A = makeFigure(ka, { x: meet - gap - (Pt ? 90 : 150), facing: "right", expression: "confident", pose: "briefcase", scale: scl });
    var Bf = makeFigure(kb, { x: meet + gap + (Pt ? 90 : 150), facing: "left", expression: "smug", pose: "idle", scale: scl });
    S.narrate(A);
    plate(p.company || "Company", p.years, { kicker: p.kicker || "THE DEAL", at: 0.12 });
    var tD = tc(Math.max(1.0, wordAt(p.keyword || "deal", "deal", D * 0.25)));
    A.moveTo(meet - gap, Math.max(0.2, tD - 1.3), 1.0);
    Bf.moveTo(meet + gap, Math.max(0.2, tD - 1.3), 1.0);
    A.pose("handshake", tD - 0.3, 0.35).expression("happy", tD - 0.3).lookAt(Bf, tD - 0.3);
    Bf.pose("handshake", tD - 0.3, 0.35).expression("happy", tD - 0.3).lookAt(A, tD - 0.3);
    s.camera.shake(tD, 8, 0.35);
    s.camera.push(Pt ? 1.04 : 1.06, tD, 0.5);
    nameTag(A, p.company || "Company", tD + 0.2, { accent: true });
    nameTag(Bf, p.partner || "Partner", tD + 0.35, {});
    var tSg = tc(Math.max(tD + 1.0, wordAt(p.signWord || "signed", "signed", tD + 2)));
    var text = str(p.headline), hw_ = p.headlineWord || bestSpecWord(text), tHf = findOutsideNames(hw_, tSg + 0.3, [p.company, p.partner]);
    var tH = text ? tc(Math.max(tSg + 1.2, tHf != null ? tHf : wordAt(hw_, text, D * 0.8, tSg + 0.3))) : null;
    var cAt = tc(Math.max(tD + 0.4, tSg - 1.1));
    var cpos = Pt ? { x: 0.5, y: 0.3766 } : SQ ? { x: 0.32, y: 0.23 } : { x: 0.7, y: 0.56 };
    var ct = contract({ title: p.title || "AGREEMENT", amount: p.amount, parties: [p.company || "Company", p.partner || "Partner"], at: cAt, signAt: tSg - 0.1, sealAt: Math.min(endLimit() - 0.2, tSg + 1.45), pos: cpos, w: Pt ? null : SQ ? 0.46 : 0.4, until: (Pt || SQ) && tH != null && tH > tSg + 2.2 ? tH - 0.35 : null });
    if (tSg + 0.2 < endLimit()) { A.pose("idle", tD + 1.2, 0.5).lookAt("camera", tD + 1.2); Bf.pose("idle", tD + 1.25, 0.5).lookAt(A, tD + 1.25); }
    if (ct.sealAt + 0.3 < endLimit()) { A.pose("thumbs-up", ct.sealAt + 0.15, 0.35).expression("excited", ct.sealAt + 0.15).emote("dollar", ct.sealAt + 0.2, 1.6); Bf.pose("hands-hips", ct.sealAt + 0.25, 0.4).expression("confident", ct.sealAt + 0.25); }
    if (text) headline(text, tH - 0.05, { pos: Pt ? { x: 0.5, y: 0.37 } : { x: SQ ? 0.32 : 0.27, y: 0.17 }, size: Pt ? "xl" : "md", maxWidth: Pt ? null : 0.4, rot: -2 });
    sc.cam.set({ x: s.Ww / 2, y: 506, zoom: 1.03 });
    void kb;
  };

  TPL["legacy-skyline"] = function (root, p) {
    var B = baseScene(p, { empire: empKey(p.empire, "city"), sky: p.sky || "sunset", archetype: "founder", pose: "hands-hips", expression: "happy", growth: 1, kicker: p.kicker || "THE LEGACY", rise: false }), s = B.s, fig = B.fig, Pt = B.Pt, SQ = B.SQ;
    if (Pt) s.camera.rise(0, D * 0.92, { fromY: 540, toY: 494, fromZoom: 1.12, toZoom: 1.0 });
    else s.camera.rise(0, D * 0.92, { fromY: 600, toY: 490, fromZoom: 1.24, toZoom: 1.0, fromX: lerp(s.Ww / 2, fig.x0, 0.35), x: s.Ww / 2 });
    var stats = arr(p.stats).map(obj).filter(function (q) { return str(q.value); }).slice(0, 3);
    var times = syncTimes(stats.map(function (q) { return q.word || bestSpecWord(q.label); }), { after: 0.3, gap: 0.6 });
    var n = stats.length;
    stats.forEach(function (q, i) {
      var pos;
      if (Pt) pos = { x: n === 1 ? 0.5 : i % 2 ? 0.62 : 0.4, y: n === 1 ? 0.37 : 0.285 + (0.18 * i) / Math.max(1, n - 1) };
      else pos = { x: B.L ? (SQ ? 0.7 : 0.73) + (i % 2 ? 0.03 : 0) : (SQ ? 0.3 : 0.27) - (i % 2 ? 0.03 : 0), y: n === 1 ? 0.5 : 0.43 + (0.38 * i) / Math.max(1, n - 1) };
      stat(q.value, q.label, times[i] - 0.1, { pos: pos, size: n > 2 || Pt ? "sm" : null, rot: i % 2 ? 1.4 : -1.2 });
    });
    if (n) fig.pose("present", times[0] - 0.25, 0.45);
    var text = str(p.headline);
    if (text) {
      var tK = tc(Math.max((n ? times[n - 1] : 0) + 0.6, wordAt(p.keyword, text, D * 0.8, n ? times[n - 1] : 0)));
      headline(text, tK - 0.05, { pos: Pt ? B.slots.side : B.slots.hlTop, size: "md", maxWidth: Pt ? B.slots.sideW : B.slots.hlTopW, rot: -2 });
      fig.pose("open-arms", tK - 0.2, 0.5).expression("happy", tK - 0.2).emote("sparkle", tK + 0.1, 1.5);
    } else if (n && times[n - 1] + 1.4 < endLimit()) fig.pose("open-arms", times[n - 1] + 1.0, 0.5);
    if (n && times[0] + 1.6 < (n > 1 ? times[1] : endLimit())) fig.pose("hands-hips", times[0] + 1.3, 0.5);
    fig.beats(p.beats, { from: 0 });
  };

  function render(id, root, props) {
    if (!TPL[id]) throw new Error("Unknown template: " + id);
    TPL[id](root, obj(props));
  }
  function fallback(root, narration) {
    try {
      var sc = makeScene({ empire: "city", sky: "day", growth: 1 }), s = st, Pt = s.portrait;
      var a = makeFigure("founder", { x: heroX(s, "left"), facing: "right", expression: "confident", pose: "talk" });
      S.narrate(a);
      var words = contentWords(narration || V.narration).slice(0, 5).join(" ") || "The story";
      headline(words, 0.35, { pos: Pt ? { x: 0.5, y: 0.37 } : { x: 0.68, y: 0.43 }, size: "lg" });
      sc.cam.rise(0, Math.max(1, D * 0.85));
      if (S.flush) S.flush();
    } catch (e) { V.error("[origin-story fallback] " + (e && e.message ? e.message : e)); }
  }

  // ------------------------- inspect (screen boxes for tests) -------------------------
  function inspect(t) {
    var s = st;
    if (!s) return [];
    if (!s.fin) finalize(s);
    var c = camAt(s, t), out = [];
    s.comps.forEach(function (k) {
      if (k.noInspect || !compOn(k, t) || (k.until != null && t > k.until)) return;
      if (k.upd && k.kind === "nametag") { k.upd(t); if (k.off) return; }
      out.push({ kind: k.kind, label: k.label, x: k.x, y: k.y, w: k.w, h: k.h, moving: compMoving(k, t) || k.kind === "nametag" && c.moving });
    });
    s.actors.forEach(function (a) {
      if (a.vis.val(t) < 0.5) return;
      var b = figBox(a, t, false), p0 = toScr(s, c, b.x, b.y), p1 = toScr(s, c, b.x + b.w, b.y + b.h);
      out.push({ kind: "character", label: a.name, x: p0[0], y: p0[1], w: p1[0] - p0[0], h: p1[1] - p0[1], moving: c.moving || a.pos.moving(t) });
    });
    return out;
  }

  // ------------------------- public API -------------------------
  S.scene = makeScene;
  S.currentScene = function () { return st ? st.api : null; };
  S.grow = function (from, to) { growEmpire(ensure(), from, to); };
  S.stage = stage;
  S.title = function (text, o) { return simpleText("fs-st", text, o, 72); };
  S.text = function (text, o) { return simpleText("fs-sx", text, o, 38); };
  S.figure = makeFigure;
  S.character = makeFigure;
  S.narrate = function (fig, from, to) { if (fig && fig.__fig) fig.say(from == null ? 0.05 : from, to == null ? D : to); return fig; };
  S.archetypes = ARCH_IDS.slice();
  S.looks = ARCH;
  S.poses = Object.keys(POSES);
  S.expressions = Object.keys(EXPR);
  S.marks = MARKS.slice();
  S.handProps = Object.keys(HAND_PROPS).concat(Object.keys(TWO_HAND));
  S.plate = plate;
  S.headline = headline;
  S.stat = stat;
  S.chapter = chapter;
  S.label = label;
  S.nameTag = nameTag;
  S.versus = versus;
  S.burst = burst;
  S.captions = captions;
  S.productCard = productCard;
  S.chart = chart;
  S.map = map_;
  S.contract = contract;
  S.paper = paper;
  S.drawSketch = drawSketch;
  S.drawOn = drawOn;
  S.sketches = Object.keys(SKETCH);
  S.regions = Object.keys(REGIONS);
  S.places = Object.keys(PLACES);
  S.assemblyLine = assemblyLine;
  S.workbench = workbench;
  S.empires = EMPIRES.slice();
  S.skies = Object.keys(SKIES);
  S.buildings = {};
  Object.keys(BUILD).forEach(function (name) {
    S.buildings[name] = function (group, o, rand) {
      var s = ensure(), b = BUILD[name](typeof rand === "function" ? rand : V.makeRand(strHash(name) + 5)), g = svg("g", null, group);
      g.innerHTML = b.m;
      if (!o || o.animate !== false) {
        var parts = [].slice.call(g.querySelectorAll(".fs-anim")).map(function (el) { return { el: el, k: el.getAttribute("data-k"), d: el.dataset }; });
        if (parts.length) s.anims.push(function (t) { parts.forEach(function (q) { animPart(q, t); }); });
      }
      return { w: b.w, h: b.h, group: g };
    };
  });
  S.buildEmpire = function (sc, preset, o) {
    var s = ensure();
    if (s.empireRec) { s.empireRec.list.forEach(function (b) { if (b.g.parentNode) b.g.parentNode.removeChild(b.g); }); s.empireRec.list.length = 0; s.empireRec.hidden = []; }
    s.emp = empKey(preset, "city");
    s.L.ground.innerHTML = "";
    drawGround(s);
    s.empire = s.empireRec = buildEmpire(s, s.emp, { growth: growthNum(obj(o).growth, 1), heroSide: obj(o).heroSide });
    if (s.api) s.api.empire = s.empire.api;
    return s.empire.api;
  };
  S.camera = function () { return ensure().camera; };
  S.safe = safe;
  S.u = u;
  S.find = kwFind;
  S.templates = Object.keys(TPL);
  S.render = render;
  S.fallback = fallback;
  S.inspect = inspect;
  S.flush = function () { if (st) { finalize(st); frame(V.time()); } };
})();

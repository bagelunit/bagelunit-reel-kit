/* Toon World engine (style id: toon-world).
 *
 * A recurring cast of rigged 2D characters acts out the narration in illustrated parallax worlds.
 *
 * Architecture
 * - Build time: S.scene(location) makes one root div (.ct) holding, back to front:
 *   (1) svgB: world layers back, mid, main, pback (scenery at parallax factors < 1, floor at 1),
 *   (2) html: a world-space HTML layer (boards with text) that moves with the camera,
 *   (3) svgF: world layers chars, props, front (foreground parallax > 1), fx (marks, bursts),
 *   (4) bub: a screen SVG for bubble bodies and tails, (5) overlay: screen HTML for bubble text,
 *   stickers and captions. Every element is built once; calls only record keyframes on tracks (Tr).
 * - One frame function (registered with V.onFrame) sets everything from t only: the camera (chained
 *   moves, follow, shake, a small drift), the layer matrices, then each actor rig (pose blend, walk
 *   cycle, oscillations, face, visemes from V.words), marks, props, bubbles and stickers.
 *   Nothing depends on the previous frame, so seeking works in both directions.
 * - Characters: one skeleton per body type (adult, kid, robot) in local units (feet at y 0, height
 *   about 100). Pose = a vector of joint angles, blended with an anticipation/overshoot ease. Faces:
 *   eyes with lids and blinks, brows, a parametric mouth (smile, width, open, roundness) driven by an
 *   expression vector plus visemes. Facing is a number (-1 left, 0 front, 1 right) so turns slide.
 * - Timing: templates find their words (V.find, keyword props, the longest content word, then a
 *   narration estimate) and clamp every beat into [0.2, duration - 1].
 * No network, no timers, no wall clock; randomness only from V.makeRand / hashes of fixed seeds.
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
  var FONT = '"Baloo 2", "Fredoka", "Nunito", "Trebuchet MS", "Segoe UI", Inter, "Noto Sans", system-ui, sans-serif';
  var INK = "#2A2140", ACC = "#FF7A59", MUTED = "#6E6482", BG = "#FFE3C2";

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
  function smooth(p) { p = clamp(p, 0, 1); return p * p * (3 - 2 * p); }
  function hash(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
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
  function tint(hex, k) { // mix toward white by k
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex));
    if (!m) return hex;
    var n = parseInt(m[1], 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) { return Math.round(v + (255 - v) * k); });
    return "#" + ((1 << 24) | (c[0] << 16) | (c[1] << 8) | c[2]).toString(16).slice(1);
  }
  function lum(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex));
    if (!m) return 1;
    var n = parseInt(m[1], 16);
    return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  }
  function isHex(c) { return /^#[0-9a-f]{6}$/i.test(str(c)) || /^#[0-9a-f]{3}$/i.test(str(c)); }
  function hex6(c) { c = str(c); if (/^#[0-9a-f]{3}$/i.test(c)) return "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]; return c; }

  // ------------------------- easing -------------------------
  var CE = {
    // anticipation (small dip backwards) then an overshoot settle
    pose: function (p) {
      if (p <= 0) return 0;
      if (p >= 1) return 1;
      if (p < 0.16) return -0.07 * Math.sin((p / 0.16) * PI);
      var q = (p - 0.16) / 0.84 - 1, c = 1.25;
      return 1 + (c + 1) * q * q * q + c * q * q;
    },
    snap: function (p) {
      if (p <= 0) return 0;
      if (p >= 1) return 1;
      var q = p - 1, c = 2.6;
      return 1 + (c + 1) * q * q * q + c * q * q;
    },
    soft: function (p) { return -(Math.cos(PI * clamp(p, 0, 1)) - 1) / 2; },
  };

  // ------------------------- keyframe tracks -------------------------
  // Base value, then segments {at, d, v, e}; the value at t chains every segment that has started.
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
  // last key whose start is <= t (for names: no blending)
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
  Tr.prototype.last = function () { var m = 0; this.k.forEach(function (q) { m = Math.max(m, q.at + q.d); }); return m; };
  function setA(el, k, v) { v = String(v); if (el["_a" + k] !== v) { el["_a" + k] = v; el.setAttribute(k, v); } }
  function setS(el, k, v) { v = String(v); if (el["_s" + k] !== v) { el["_s" + k] = v; el.style[k] = v; } }
  function showEl(el, on) { setS(el, "display", on ? "" : "none"); }
  function popK(t, at, dur, kind) { // 0..1+ scale for pop-in with overshoot
    if (t < at) return 0;
    return (kind === "soft" ? CE.soft : CE.snap)(clamp((t - at) / (dur || 0.32), 0, 1));
  }

  // ------------------------- text -------------------------
  var mctx = null;
  function measure(text, size, weight) {
    if (!mctx) mctx = doc.createElement("canvas").getContext("2d");
    mctx.font = (weight || 800) + " " + size + "px " + FONT;
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
  function wrapGreedy(words, size, maxW, weight) {
    var lines = [], cur = [], cw = 0, sp = measure(" ", size, weight);
    words.forEach(function (wd) {
      var ww = measure(wd.w, size, weight);
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
    var words = Array.isArray(text) ? text : parseRich(text), size = o.size || 48, minSize = o.minSize || size * 0.5;
    var maxW = o.maxWidth || 600, maxLines = o.maxLines || 3, weight = o.weight || 800, lh = o.lh || 1.12;
    var lines;
    for (var guard = 0; guard < 30; guard++) {
      lines = wrapGreedy(words, size, maxW, weight);
      var widest = 0;
      words.forEach(function (wd) { widest = Math.max(widest, measure(wd.w, size, weight)); });
      if ((lines.length <= maxLines && widest <= maxW) || size <= minSize) break;
      size = Math.max(minSize, size * 0.92);
    }
    if (lines.length > 1) { // balance: narrowest width with the same line count
      var lo = maxW * 0.4, hi = maxW, n = lines.length;
      for (var i = 0; i < 14; i++) {
        var mid = (lo + hi) / 2, l2 = wrapGreedy(words, size, mid, weight), ok = l2.length <= n;
        l2.forEach(function (l) { if (l.words.length === 1 && measure(l.words[0].w, size, weight) > mid) ok = false; });
        if (ok) hi = mid; else lo = mid;
      }
      lines = wrapGreedy(words, size, hi + 0.5, weight);
    }
    var w = 0;
    lines.forEach(function (l) { w = Math.max(w, l.w); });
    return { size: size, lines: lines, w: w, h: lines.length * size * lh, lh: lh, weight: weight };
  }
  // Writes laid out lines into el; returns the word spans in order.
  function fillRich(el, lay, cls) {
    var spans = [];
    lay.lines.forEach(function (l, li) {
      var line = div("ct-line", el);
      l.words.forEach(function (wd, wi) {
        if (wi) line.appendChild(doc.createTextNode(" "));
        var s = doc.createElement("span");
        s.className = (cls || "ct-w") + (wd.em ? " ct-em" : "");
        s.textContent = wd.w;
        line.appendChild(s);
        spans.push({ el: s, w: wd.w, em: wd.em, line: li });
      });
    });
    el.style.fontSize = f1(lay.size) + "px";
    el.style.lineHeight = String(lay.lh);
    return spans;
  }

  // ------------------------- word timing -------------------------
  var STOP = {};
  "a an the and or but of to in on at by for with from into onto over under is are was were be been being it its this that these those your you we our us my me i his her their they them he she as than then so not no yes do does did have has had will would can could should very just more most less each every all any some about here there what when who how why which also too up out if im its whats thats youre dont wont cant".split(" ").forEach(function (w) { STOP[w] = 1; });
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
  function bestWord(text) {
    var ws = contentWords(text).sort(function (a, b) { return normWord(b).length - normWord(a).length; });
    return ws[0] || "";
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
  function syncTimes(keys, o) {
    o = o || {};
    var prev = o.after || 0, out = [];
    (keys || []).forEach(function (k) { var t = k == null ? null : kwFind(k, prev); out.push(t); if (t != null) prev = t + 0.01; });
    out = spread(out, o.a, o.b);
    for (var i = 1; i < out.length; i++) if (out[i] < out[i - 1] + 0.25) out[i] = out[i - 1] + 0.25;
    return out.map(function (t) { return tc(t - (o.lead || 0)); });
  }
  function endLimit() { return Math.max(0.4, D - (D < 4 ? 0.6 : 1.0)); }
  function tc(t) { return clamp(num(t, 0.2), 0.2, endLimit()); } // clamp a beat time
  // Find each line in the narration words (in order). Returns [{ start, end, found, times: [word starts] }].
  function findLines(lines, after) {
    var ws = V.words || [], nw = ws.map(function (w) { return normWord(w.word); });
    var cur = 0, out = [];
    after = after || 0;
    while (cur < ws.length && ws[cur].start < after - 1e-6) cur++;
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
      var last = Math.min(ws.length - 1, hit + toks.length - 1);
      // stretch or shrink the end to where the last token really is (within 3 words)
      var lt = toks[toks.length - 1];
      for (var d = 0; d <= 3; d++) {
        if (nw[last + d] === lt) { last = last + d; break; }
        if (last - d > hit && nw[last - d] === lt) { last = last - d; break; }
      }
      var times = [];
      for (var k = 0; k < toks.length; k++) { var wi = Math.min(last, hit + k); times.push(ws[wi].start); }
      out.push({ start: ws[hit].start, end: ws[last].end, found: true, times: times, n: toks.length });
      cur = last + 1;
    });
    // estimate the missing ones from word counts
    var total = 0;
    out.forEach(function (o) { total += o.n; });
    var t0 = 0.25, t1 = endLimit(), acc = 0;
    out.forEach(function (o, i) {
      var a = t0 + ((t1 - t0) * acc) / Math.max(1, total), b = t0 + ((t1 - t0) * (acc + o.n)) / Math.max(1, total);
      acc += o.n;
      if (o.found) return;
      var prevEnd = i > 0 && out[i - 1].end != null ? out[i - 1].end + 0.15 : a;
      var next = null;
      for (var j = i + 1; j < out.length; j++) if (out[j].found) { next = out[j].start; break; }
      o.start = Math.max(a, prevEnd);
      o.end = next != null ? Math.min(Math.max(b, o.start + 0.6), next - 0.15) : Math.max(b, o.start + 0.6);
      if (o.end < o.start + 0.4) o.end = o.start + 0.4;
      o.times = [];
      for (var k2 = 0; k2 < o.n; k2++) o.times.push(o.start + ((o.end - o.start) * k2) / o.n);
    });
    return out;
  }

  // ------------------------- svg markup helpers -------------------------
  function at_(o) { var s = ""; for (var k in o) if (o[k] != null) s += " " + k + '="' + o[k] + '"'; return s; }
  function R(x, y, w, h, fill, rx, ex) { return '<rect x="' + f1(x) + '" y="' + f1(y) + '" width="' + f1(Math.max(0, w)) + '" height="' + f1(Math.max(0, h)) + '"' + (rx ? ' rx="' + rx + '"' : "") + ' fill="' + fill + '"' + (ex || "") + "/>"; }
  function C(x, y, r, fill, ex) { return '<circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="' + f1(r) + '" fill="' + fill + '"' + (ex || "") + "/>"; }
  function E(x, y, rx, ry, fill, ex) { return '<ellipse cx="' + f1(x) + '" cy="' + f1(y) + '" rx="' + f1(rx) + '" ry="' + f1(ry) + '" fill="' + fill + '"' + (ex || "") + "/>"; }
  function P(d, fill, ex) { return '<path d="' + d + '" fill="' + fill + '"' + (ex || "") + "/>"; }
  function L(x1, y1, x2, y2, stroke, w, ex) { return '<path d="M' + f1(x1) + " " + f1(y1) + "L" + f1(x2) + " " + f1(y2) + '" stroke="' + stroke + '" stroke-width="' + w + '" stroke-linecap="round" fill="none"' + (ex || "") + "/>"; }
  function SK(c, w) { return ' stroke="' + (c || INK) + '" stroke-width="' + (w == null ? 5 : w) + '" stroke-linejoin="round" stroke-linecap="round"'; }
  function rrD(x, y, w, h, r) {
    r = Math.min(r || 0, w / 2, h / 2);
    return "M" + f1(x + r) + " " + f1(y) + "H" + f1(x + w - r) + "Q" + f1(x + w) + " " + f1(y) + " " + f1(x + w) + " " + f1(y + r) + "V" + f1(y + h - r) + "Q" + f1(x + w) + " " + f1(y + h) + " " + f1(x + w - r) + " " + f1(y + h) + "H" + f1(x + r) + "Q" + f1(x) + " " + f1(y + h) + " " + f1(x) + " " + f1(y + h - r) + "V" + f1(y + r) + "Q" + f1(x) + " " + f1(y) + " " + f1(x + r) + " " + f1(y) + "Z";
  }
  function starD(cx, cy, R0, r0, n, rot) {
    var s = "";
    for (var i = 0; i < n * 2; i++) { var a = rad((rot || -90) + (i * 180) / n), rr = i % 2 ? r0 : R0; s += (i ? "L" : "M") + f1(cx + Math.cos(a) * rr) + " " + f1(cy + Math.sin(a) * rr); }
    return s + "Z";
  }
  var HEART_D = "M50 86 C20 64 6 46 10 30 C14 14 36 10 50 28 C64 10 86 14 90 30 C94 46 80 64 50 86Z";

  // ------------------------- props (100 x 100 box, outlined flat icons) -------------------------
  var O5 = SK(INK, 5);
  var PROPS = {
    laptop: R(14, 18, 72, 50, "#3C4A6B", 6, O5) + R(21, 25, 58, 36, "#8FD3FF", 3) + P("M4 70H96L88 84H12Z", "#C9D2E0", O5) + R(40, 72, 20, 4, "#9AA6BC", 2),
    phone: R(30, 6, 40, 88, "#2A2140", 9, O5) + R(35, 16, 30, 62, "#8FD3FF", 3) + C(50, 85, 3.5, "#6E6482"),
    coffee: P("M20 34H70V74Q70 88 56 88H34Q20 88 20 74Z", "#FFFFFF", O5) + P("M70 44Q88 44 88 58Q88 72 70 70", "none", O5) + E(45, 36, 23, 5, "#8A5A3B") + P("M36 24Q32 16 38 8M52 24Q48 16 54 8", "none", SK("#B9AFC9", 4)),
    book: R(16, 12, 68, 78, "#E8574A", 6, O5) + R(24, 12, 6, 78, "#C23F35") + R(38, 28, 36, 8, "#FFE3C2", 3) + R(38, 42, 26, 6, "#FFE3C2", 3),
    money: R(6, 24, 88, 52, "#8BD17C", 8, O5) + C(50, 50, 15, "#C6EDB9", SK("#4E9A45", 3)) + '<text x="50" y="58" text-anchor="middle" font-size="24" font-weight="800" fill="#2F7A2C" font-family="Arial, sans-serif">$</text>' + C(18, 50, 4, "#4E9A45") + C(82, 50, 4, "#4E9A45"),
    coin: C(50, 50, 40, "#FFC93C", O5) + C(50, 50, 29, "#FFD966", SK("#E0A21C", 4)) + '<text x="50" y="63" text-anchor="middle" font-size="38" font-weight="800" fill="#C98A10" font-family="Arial, sans-serif">$</text>',
    lightbulb: P("M50 8C29 8 18 24 18 40C18 54 28 60 32 70H68C72 60 82 54 82 40C82 24 71 8 50 8Z", "#FFE066", O5) + R(33, 70, 34, 16, "#B9C2D3", 4, O5) + P("M42 92H58", "none", SK(INK, 6)) + P("M40 46Q50 58 60 46", "none", SK("#E0A21C", 4)),
    globe: C(50, 50, 40, "#6EC6FF", O5) + P("M28 24Q40 22 42 34Q38 44 26 44Q18 40 16 34Q20 26 28 24Z M56 30Q70 26 80 38Q82 50 72 54Q62 50 58 58Q50 62 48 52Q52 40 56 30Z M40 66Q52 64 58 74Q54 84 44 86Q36 78 40 66Z", "#7ED37A"),
    rocket: P("M50 4C66 18 72 38 68 62H32C28 38 34 18 50 4Z", "#FFFFFF", O5) + C(50, 34, 9, "#8FD3FF", O5) + P("M32 50L16 70L32 66Z M68 50L84 70L68 66Z", "#FF7A59", O5) + P("M38 64L50 96L62 64Z", "#FFC93C", O5),
    clock: C(50, 50, 40, "#FFFFFF", O5) + C(50, 50, 33, "#FFF6E8") + P("M50 50V26M50 50L66 60", "none", SK(INK, 6)) + C(50, 50, 4, INK) + R(44, 4, 12, 8, "#FF7A59", 2, O5),
    trophy: P("M28 12H72V36Q72 60 50 62Q28 60 28 36Z", "#FFC93C", O5) + P("M28 20H14Q12 40 30 44M72 20H86Q88 40 70 44", "none", O5) + R(44, 62, 12, 14, "#E0A21C", 0, O5) + R(28, 76, 44, 14, "#8A5A3B", 4, O5) + P("M42 26L50 20V48", "none", SK("#FFE9A8", 4)),
    magnifier: P("M62 62L88 88", "none", SK("#8A5A3B", 13)) + P("M62 62L88 88", "none", SK(INK, 3)) + C(42, 42, 30, "#BDE8FF", SK(INK, 7)) + P("M28 34Q32 24 42 22", "none", SK("#FFFFFF", 5)),
    briefcase: R(10, 30, 80, 56, "#A0673C", 8, O5) + P("M36 30V20Q36 14 42 14H58Q64 14 64 20V30", "none", O5) + R(10, 48, 80, 6, "#7E4F2C") + R(44, 46, 12, 12, "#FFC93C", 2, SK(INK, 3)),
    megaphone: P("M18 38L64 16V84L18 62Z", "#FF7A59", O5) + R(8, 36, 14, 28, "#FFFFFF", 4, O5) + P("M30 64L36 86H46L42 66", "#C9D2E0", O5) + P("M74 34Q86 50 74 66M82 24Q100 50 82 76", "none", SK(INK, 4)),
    gift: R(12, 38, 76, 50, "#FF5D7A", 4, O5) + R(8, 28, 84, 16, "#FF7A8F", 4, O5) + R(44, 28, 12, 60, "#FFC93C", 0, SK(INK, 3)) + P("M50 28C36 8 22 18 36 28M50 28C64 8 78 18 64 28", "#FFC93C", O5),
    heart: P(HEART_D, "#FF5D7A", O5) + P("M28 32Q30 24 38 24", "none", SK("#FFFFFF", 4)),
    star: P(starD(50, 52, 44, 20, 5), "#FFC93C", O5),
    pizza: P("M50 92L12 22Q50 6 88 22Z", "#FFD966", O5) + P("M12 22Q50 6 88 22L84 30Q50 16 16 30Z", "#D9893F", SK(INK, 3)) + C(44, 40, 7, "#E8574A") + C(60, 52, 6, "#E8574A") + C(48, 66, 5, "#E8574A"),
    plant: P("M26 60H74L66 92H34Z", "#E07B4F", O5) + P("M50 60C50 40 40 26 26 22C26 40 36 54 50 60Z", "#6CC46A", O5) + P("M50 60C50 36 62 20 78 18C78 38 66 54 50 60Z", "#4FAE5B", O5) + P("M50 60V30", "none", SK(INK, 4)),
    calendar: R(10, 16, 80, 74, "#FFFFFF", 8, O5) + P("M10 24Q10 16 18 16H82Q90 16 90 24V36H10Z", "#FF7A59", SK(INK, 0)) + R(10, 16, 80, 74, "none", 8, O5) + R(26, 8, 8, 18, INK, 3) + R(66, 8, 8, 18, INK, 3) + R(22, 46, 12, 10, "#C9D2E0", 2) + R(44, 46, 12, 10, "#C9D2E0", 2) + R(66, 46, 12, 10, "#FF7A59", 2) + R(22, 66, 12, 10, "#C9D2E0", 2) + R(44, 66, 12, 10, "#C9D2E0", 2),
    "piggy-bank": E(50, 56, 38, 28, "#FF9EB5", O5) + P("M30 36L34 20L46 30", "#FF9EB5", O5) + E(86, 56, 8, 10, "#FF85A1", O5) + C(84, 53, 1.8, INK) + C(84, 59, 1.8, INK) + C(68, 46, 3.5, INK) + R(30, 76, 10, 14, "#FF85A1", 3, O5) + R(58, 76, 10, 14, "#FF85A1", 3, O5) + R(42, 30, 18, 5, INK, 2) + C(51, 18, 9, "#FFC93C", SK(INK, 4)),
    key: C(28, 50, 20, "#FFC93C", O5) + C(28, 50, 8, "#FFF6E8", SK(INK, 4)) + P("M46 50H92M78 50V64M90 50V60", "none", SK(INK, 13)) + P("M46 50H92M78 50V64M90 50V60", "none", SK("#FFC93C", 6)),
    chart: P("M12 10V88H92", "none", SK(INK, 6)) + R(22, 56, 16, 30, "#8FD3FF", 3, O5) + R(44, 40, 16, 46, "#FFC93C", 3, O5) + R(66, 20, 16, 66, "#FF7A59", 3, O5),
    target: C(50, 50, 40, "#FF5D5D", O5) + C(50, 50, 28, "#FFFFFF") + C(50, 50, 16, "#FF5D5D") + C(50, 50, 6, "#FFFFFF") + P("M50 50L84 16", "none", SK(INK, 5)) + P("M76 12L88 12L88 24", "none", SK(INK, 5)),
    warning: P("M50 8L94 88H6Z", "#FFC93C", SK(INK, 6)) + P("M50 34V60", "none", SK(INK, 9)) + C(50, 74, 5, INK),
    house: P("M10 48L50 12L90 48", "#FF7A59", O5) + R(20, 44, 60, 46, "#FFF1DC", 2, O5) + P("M8 50L50 12L92 50", "none", SK(INK, 7)) + R(42, 62, 16, 28, "#8A5A3B", 2, SK(INK, 4)) + R(26, 54, 12, 12, "#8FD3FF", 2, SK(INK, 3)) + R(62, 54, 12, 12, "#8FD3FF", 2, SK(INK, 3)),
    car: P("M8 66V52Q8 46 16 44L30 26Q34 22 40 22H64Q70 22 74 28L84 44Q92 46 92 54V66Z", "#FF5D5D", O5) + P("M34 30H48V44H24Z M54 30H66L76 44H54Z", "#BDE8FF", SK(INK, 3)) + C(28, 68, 10, INK) + C(28, 68, 4, "#C9D2E0") + C(72, 68, 10, INK) + C(72, 68, 4, "#C9D2E0"),
    brain: P("M50 18C40 6 18 12 18 30C6 36 8 56 18 60C16 76 36 86 50 76C64 86 84 76 82 60C92 56 94 36 82 30C82 12 60 6 50 18Z", "#FFB3C7", O5) + P("M50 18V76M32 32Q40 38 34 46M68 32Q60 38 66 46M28 58Q38 56 40 64M72 58Q62 56 60 64", "none", SK("#D9708C", 4)),
    flag: P("M22 8V94", "none", SK(INK, 6)) + P("M24 12Q42 4 58 14Q72 22 88 14V52Q72 60 58 52Q42 42 24 50Z", "#FF7A59", O5),
    battery: R(8, 28, 76, 44, "#FFFFFF", 8, O5) + R(84, 40, 8, 20, INK, 2) + R(16, 36, 18, 28, "#6CC46A", 3) + R(38, 36, 18, 28, "#6CC46A", 3) + R(60, 36, 16, 28, "#C9E9C3", 3),
    water: P("M50 6C66 30 80 46 80 62C80 80 66 92 50 92C34 92 20 80 20 62C20 46 34 30 50 6Z", "#5BB8F5", O5) + P("M36 60Q34 72 44 78", "none", SK("#FFFFFF", 5)),
    fire: P("M50 6C58 26 80 34 80 60C80 80 66 94 50 94C34 94 20 80 20 60C20 44 30 36 36 22C40 34 44 38 48 40C48 26 46 18 50 6Z", "#FF7A3C", O5) + P("M50 50C56 60 66 64 64 76C62 86 56 90 50 90C42 90 36 84 36 76C36 66 44 62 50 50Z", "#FFD24A"),
    question: C(50, 50, 40, "#9B7BEA", O5) + '<text x="50" y="68" text-anchor="middle" font-size="52" font-weight="900" fill="#FFFFFF" font-family="Arial, sans-serif">?</text>',
    check: C(50, 50, 40, "#4CC38A", O5) + P("M30 52L44 66L72 36", "none", SK("#FFFFFF", 10)),
    cross: C(50, 50, 40, "#FF5D5D", O5) + P("M34 34L66 66M66 34L34 66", "none", SK("#FFFFFF", 10)),
    lock: P("M30 46V32Q30 12 50 12Q70 12 70 32V46", "none", SK(INK, 9)) + P("M30 46V32Q30 12 50 12Q70 12 70 32V46", "none", SK("#C9D2E0", 4)) + R(18, 44, 64, 46, "#FFC93C", 8, O5) + C(50, 62, 6, INK) + R(47, 62, 6, 14, INK, 2),
    robot: R(18, 28, 64, 54, "#CFDAE6", 12, O5) + R(26, 38, 48, 30, "#2A2140", 8) + E(40, 52, 6, 7, "#5CE1E6") + E(60, 52, 6, 7, "#5CE1E6") + P("M50 28V14", "none", SK(INK, 5)) + C(50, 12, 6, "#FF7A59", SK(INK, 4)) + R(8, 46, 10, 18, "#A9B8C9", 3, SK(INK, 4)) + R(82, 46, 10, 18, "#A9B8C9", 3, SK(INK, 4)),
    map: P("M8 22L34 12L66 24L92 14V78L66 88L34 76L8 86Z", "#FFF1DC", O5) + P("M34 12V76M66 24V88", "none", SK(INK, 3)) + P("M18 60Q30 40 46 52Q60 62 78 40", "none", SK("#FF7A59", 4) + ' stroke-dasharray="6 7"') + P("M78 22C70 22 66 28 66 34C66 42 78 52 78 52C78 52 90 42 90 34C90 28 86 22 78 22Z", "#FF5D5D", SK(INK, 4)) + C(78, 34, 4, "#FFFFFF"),
    shield: P("M50 6L88 20V46C88 70 70 86 50 94C30 86 12 70 12 46V20Z", "#5B8DEF", O5) + P("M50 16L78 26V46C78 64 66 76 50 82Z", "#7FA8F5") + P("M34 50L46 62L68 38", "none", SK("#FFFFFF", 9)),
  };
  var PROP_SYN = { computer: "laptop", pc: "laptop", mobile: "phone", cellphone: "phone", cup: "coffee", tea: "coffee", mug: "coffee", books: "book", cash: "money", dollar: "money", bill: "money", coins: "coin", idea: "lightbulb", bulb: "lightbulb", light: "lightbulb", earth: "globe", world: "globe", launch: "rocket", time: "clock", watch: "clock", award: "trophy", win: "trophy", search: "magnifier", zoom: "magnifier", work: "briefcase", job: "briefcase", bag: "briefcase", announce: "megaphone", loud: "megaphone", present: "gift", love: "heart", favorite: "heart", food: "pizza", tree: "plant", leaf: "plant", date: "calendar", schedule: "calendar", piggy: "piggy-bank", savings: "piggy-bank", save: "piggy-bank", bank: "piggy-bank", unlock: "key", graph: "chart", stats: "chart", data: "chart", goal: "target", aim: "target", alert: "warning", danger: "warning", home: "house", vehicle: "car", mind: "brain", think: "brain", finish: "flag", energy: "battery", power: "battery", drop: "water", hot: "fire", flame: "fire", help: "question", yes: "check", done: "check", ok: "check", no: "cross", wrong: "cross", secure: "lock", security: "lock", ai: "robot", bot: "robot", route: "map", travel: "map", safe: "shield", protect: "shield" };
  function propKey(n) { n = str(n).toLowerCase(); if (PROPS[n]) return n; if (PROP_SYN[n]) return PROP_SYN[n]; return null; }
  function propIcon(name, px) {
    var k = propKey(name) || "star";
    return '<svg class="ct-icon" viewBox="-4 -4 108 108" width="' + f1(px || 64) + '" height="' + f1(px || 64) + '" xmlns="' + NS + '">' + PROPS[k] + "</svg>";
  }

  // ------------------------- scene, layers, camera -------------------------
  var st = null, sceneCount = 0;
  var LOCS = ["living-room", "office", "classroom", "city-street", "park", "lab", "space", "market", "stage"];
  var LOC_SYN = { home: "living-room", house: "living-room", room: "living-room", livingroom: "living-room", kitchen: "living-room", work: "office", workplace: "office", school: "classroom", class: "classroom", city: "city-street", street: "city-street", town: "city-street", garden: "park", outdoors: "park", outside: "park", nature: "park", laboratory: "lab", science: "lab", shop: "market", store: "market", bazaar: "market", studio: "stage", plain: "stage", studio2: "stage" };
  function locKey(n, def) { n = str(n).toLowerCase().replace(/[\s_]+/g, "-"); if (LOCS.indexOf(n) >= 0) return n; return LOC_SYN[n.replace(/-/g, "")] || LOC_SYN[n] || def || "stage"; }
  var EXTERIOR = { "city-street": 1, park: 1, space: 1, market: 1 };
  function tc0(t) { return clamp(num(t, 0), 0, D); }

  function makeScene(location, o) {
    if (location && typeof location === "object") o = location;
    else o = Object.assign({ location: location }, obj(o));
    var loc = locKey(o.location, "stage");
    var root = V.root();
    if (st && st.el && st.el.parentNode) st.el.parentNode.removeChild(st.el);
    var Ww = (1000 * W) / H, span = clamp(num(o.span, 1), 1, 12);
    var Pt = V.isPortrait, SQ = V.isSquare;
    var G = num(o.ground, Pt ? 752 : SQ ? 850 : 880);
    var cs = num(o.charScale, Pt ? 0.86 : SQ ? 0.9 : 1);
    var fac = EXTERIOR[loc] ? { back: 0.22, mid: 0.6, front: 1.3 } : loc === "stage" ? { back: 0.5, mid: 0.8, front: 1.2 } : { back: 0.72, mid: 0.88, front: 1.18 };
    sceneCount++;
    var s = {
      id: sceneCount, loc: loc, color: isHex(o.color) ? hex6(o.color) : null, k: H / 1000, Ww: Ww, span: span, Wt: Ww * span, G: G,
      portrait: Pt, square: SQ, charScale: cs, charH: 440 * cs, fac: fac, actors: [], anims: [], bubbles: [], stickers: [], emotes: [],
      noBoard: !!o.noBoard, segs: [], segSorted: true, shakes: [], camBase: { x: Ww / 2, y: 500, z: 1 }, uid: 0, fin: false, userFrames: [], boards: [], props: [], boxes: [], late: [],
    };
    st = s;
    s.el = div("ct ct-" + loc, root);
    var sv = { class: "ct-layer", width: W, height: H, viewBox: "0 0 " + W + " " + H };
    s.svgB = svg("svg", sv, s.el);
    s.defs = svg("defs", null, s.svgB);
    s.L = {};
    s.L.back = svg("g", null, s.svgB);
    s.L.mid = svg("g", null, s.svgB);
    s.L.main = svg("g", null, s.svgB);
    s.L.pback = svg("g", null, s.svgB);
    s.html = div("ct-whtml", s.el);
    s.svgF = svg("svg", sv, s.el);
    s.defsF = svg("defs", null, s.svgF);
    s.L.chars = svg("g", null, s.svgF);
    s.L.props = svg("g", null, s.svgF);
    s.L.front = svg("g", null, s.svgF);
    s.L.fx = svg("g", null, s.svgF);
    s.bub = svg("svg", sv, s.el);
    s.bubG = svg("g", null, s.bub);
    s.overlay = div("ct-over", s.el);
    s.layers = [[s.L.back, fac.back], [s.L.mid, fac.mid], [s.L.main, 1], [s.L.pback, 1], [s.html, 1, true], [s.L.chars, 1], [s.L.props, 1], [s.L.front, fac.front], [s.L.fx, 1]];
    drawLocation(s);
    s.camera = new Camera(s);
    V.onFrame(function (t) { if (st === s) frame(t); });
    return sceneApi(s);
  }
  function ensure() { if (!st) makeScene("stage"); return st; }
  function uid(p) { var s = ensure(); return "ct" + s.id + (p || "") + ++s.uid; }

  function sceneApi(s) {
    var sc = {
      location: s.loc, Ww: s.Ww, Wt: s.Wt, G: s.G, span: s.span, portrait: s.portrait, square: s.square, charScale: s.charScale,
      cam: s.camera, html: s.html, overlay: s.overlay, el: s.el,
      slots: function (n, spread) { return slots(s, n, spread); },
      toScreen: function (x, y, t) { var c = t == null ? s.camNow || camAt(s, V.time()) : camAt(s, t), m = layerM(s, c, 1); return [x * m[0] + m[1], y * m[0] + m[2]]; },
      onFrame: function (fn) { if (typeof fn === "function") s.userFrames.push(fn); },
    };
    s.api = sc;
    return sc;
  }
  function slots(s, n, spread) {
    n = Math.max(1, Math.floor(num(n, 1)));
    var c = s.camBase.x, usable = s.Ww * (s.portrait ? 0.92 : 0.8) * num(spread, 1), out = [];
    var step = n > 1 ? usable / n : 0;
    for (var i = 0; i < n; i++) out.push(c + (i - (n - 1) / 2) * step);
    return out;
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
    var z = num(zoom, 1.15);
    return this._seg({ at: tc0(at), dur: dur == null ? 1.6 : Math.max(0, num(dur, 1.6)), ease: EZ("inOutSine"), tgt: function (prev) { return { x: prev.x, y: prev.y, z: z }; } });
  };
  CP.focus = function (actor, at, dur, zoom, o) {
    o = obj(o);
    return this.to({ actor: actor, zoom: zoom == null ? 1.35 : zoom, dx: o.dx, dy: o.dy, focusY: o.focusY }, at, dur == null ? 0.9 : dur);
  };
  CP.follow = function (actor, from, to, o) {
    o = obj(o);
    if (!actor || !actor.__actor) return this;
    return this._seg({ at: tc0(from), until: tc0(to == null ? D : to), follow: actor, zoom: o.zoom, lead: num(o.lead, 0), dy: num(o.dy, 0) });
  };
  CP.shake = function (at, amp, dur) { this.s.shakes.push({ at: tc0(at), amp: num(amp, 14), dur: Math.max(0.05, num(dur, 0.45)) }); return this; };
  // Target resolver: a plain {x, y, zoom} (missing fields keep the previous value) or an actor framing.
  function camTarget(s, tg, tEnd) {
    tg = tg && tg.__actor ? { actor: tg } : obj(tg);
    if (tg.actor && tg.actor.__actor) {
      var a = tg.actor;
      return function (prev) {
        var z = num(tg.zoom, prev.z), x = a.xAt(tEnd) + num(tg.dx, 0), top = a.topAt(tEnd);
        var y = top + (500 - num(tg.focusY, 0.16) * 1000) / z + num(tg.dy, 0);
        if (z <= 1.001) y = 500;
        return { x: x, y: y, z: z };
      };
    }
    return function (prev) { return { x: tg.x != null ? num(tg.x, prev.x) : prev.x, y: tg.y != null ? num(tg.y, prev.y) : prev.y, z: tg.zoom != null ? num(tg.zoom, prev.z) : tg.z != null ? num(tg.z, prev.z) : prev.z }; };
  }
  function followPt(s, g, tt, prev) {
    var a = g.follow, sum = 0, n = 6;
    for (var i = 0; i < n; i++) sum += a.xAt(Math.max(0, tt - (0.6 * i) / (n - 1)));
    var x = sum / n + g.lead * a.sideAt(tt), z = g.zoom != null ? num(g.zoom, prev.z) : prev.z, y = prev.y;
    if (z > 1.001) y = a.topAt(tt) + (500 - 160) / z + g.dy;
    return { x: x, y: y, z: z };
  }
  function camAt(s, t) {
    if (!s.segSorted) { s.segs.sort(function (a, b) { return a.at - b.at || a.i - b.i; }); s.segSorted = true; }
    var v = { x: s.camBase.x, y: s.camBase.y, z: s.camBase.z }, moving = false;
    for (var i = 0; i < s.segs.length; i++) {
      var g = s.segs[i];
      if (t < g.at) break;
      if (g.follow) {
        var tt = Math.min(t, g.until), tg = followPt(s, g, tt, v), b = smooth((t - g.at) / 0.7);
        v = { x: lerp(v.x, tg.x, b), y: lerp(v.y, tg.y, b), z: lerp(v.z, tg.z, b) };
        if (t < g.until) moving = true;
      } else {
        var p = g.dur > 0 ? clamp((t - g.at) / g.dur, 0, 1) : 1, tg2 = g.tgt(v), e = g.ease(p);
        v = { x: lerp(v.x, tg2.x, e), y: lerp(v.y, tg2.y, e), z: lerp(v.z, tg2.z, e) };
        if (g.dur > 0.05 && p < 1) moving = true;
      }
    }
    v.z = clamp(v.z, 1, 4);
    var hw = s.Ww / 2 / v.z, hh = 500 / v.z;
    v.x = clamp(v.x, hw, s.Wt - hw);
    v.y = clamp(v.y, hh, 1000 - hh);
    v.x += 1.4 * Math.sin(t * 0.61 + 0.3) + 0.7 * Math.sin(t * 1.31);
    v.y += 1.0 * Math.sin(t * 0.83 + 1.1);
    var sx = 0, sy = 0;
    s.shakes.forEach(function (q, j) {
      if (t < q.at || t > q.at + q.dur) return;
      var k = Math.pow(1 - (t - q.at) / q.dur, 1.6) * u(q.amp);
      sx += k * Math.sin((t - q.at) * 71 + j * 1.7);
      sy += k * 0.8 * Math.cos((t - q.at) * 59 + j * 2.3);
      moving = true;
    });
    v.sx = sx; v.sy = sy; v.moving = moving;
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
    s.late.forEach(function (fn) { try { fn(); } catch (e) { V.error("[cartoon] " + (e && e.message ? e.message : e)); } });
    s.late = [];
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
    var sh = "translate(" + f2(c.sx * 0.6) + "px," + f2(c.sy * 0.6) + "px)";
    setS(s.overlay, "transform", sh);
    setA(s.bubG, "transform", "translate(" + f2(c.sx * 0.6) + " " + f2(c.sy * 0.6) + ")");
    for (var i = 0; i < s.anims.length; i++) s.anims[i](t, c);
    for (var j = 0; j < s.userFrames.length; j++) {
      try { s.userFrames[j](t); } catch (e) { V.error("[cartoon onFrame] " + (e && e.message ? e.message : e)); }
    }
  }

  // ------------------------- locations -------------------------
  function drawLocation(s) {
    var G = s.G, Gw = G - 44, rnd = V.makeRand(97 + LOCS.indexOf(s.loc) * 13);
    function xr(f) { return [-280, s.Ww + (s.Wt - s.Ww) * f + 280]; }
    var out = { back: "", mid: "", main: "", pback: "", front: "" };
    function grad(id, c0, c1) {
      var g = svg("linearGradient", { id: id, x1: 0, y1: 0, x2: 0, y2: 1 }, s.defs);
      svg("stop", { offset: "0", "stop-color": c0 }, g);
      svg("stop", { offset: "1", "stop-color": c1 }, g);
      return "url(#" + id + ")";
    }
    function each(f, step, start, fn) { var r = xr(f); for (var x = start; x < r[1] + step; x += step) fn(x, Math.round(x / step)); }
    var m0 = s.portrait ? 40 : 140;
    var b = xr(1), bw = b[1] - b[0];
    var loc = s.loc;
    if (loc === "living-room") {
      var r = xr(s.fac.back);
      out.back += R(r[0], -300, r[1] - r[0], Gw + 310, "#F7D6B2");
      for (var x = r[0]; x < r[1]; x += 64) out.back += R(x, -300, 22, Gw + 300, "#F3CDA5");
      out.back += R(r[0], Gw - 24, r[1] - r[0], 30, "#E6B588");
      each(s.fac.back, 660, m0, function (mx, i) {
        var wy = Gw - 520, ww = 230, wh = 270;
        out.back += R(mx - 26, wy - 22, ww + 52, 12, "#A06B42", 6);
        out.back += R(mx, wy, ww, wh, "#FFFFFF", 12) + R(mx + 14, wy + 14, ww - 28, wh - 28, "#BFE7F7", 6);
        out.back += P("M" + (mx + 14) + " " + (wy + 200) + "Q" + (mx + 80) + " " + (wy + 150) + " " + (mx + 150) + " " + (wy + 190) + "T" + (mx + 216) + " " + (wy + 178) + "V" + (wy + wh - 14) + "H" + (mx + 14) + "Z", "#A5D98A");
        out.back += E(mx + 70, wy + 72, 34, 13, "#FFFFFF") + E(mx + 96, wy + 64, 22, 12, "#FFFFFF");
        out.back += R(mx + ww / 2 - 4, wy + 14, 8, wh - 28, "#FFFFFF") + R(mx + 14, wy + 128, ww - 28, 8, "#FFFFFF");
        var cc = i % 2 ? "#2BB3A3" : "#FF8A6B", cd = shade(cc, 0.86);
        out.back += P("M" + (mx - 24) + " " + (wy - 14) + "H" + (mx + 40) + "Q" + (mx + 34) + " " + (wy + 150) + " " + (mx + 18) + " " + (wy + wh + 30) + "H" + (mx - 30) + "Z", cc) + L(mx + 4, wy, mx - 4, wy + wh + 20, cd, 6);
        out.back += P("M" + (mx + ww + 24) + " " + (wy - 14) + "H" + (mx + ww - 40) + "Q" + (mx + ww - 34) + " " + (wy + 150) + " " + (mx + ww - 18) + " " + (wy + wh + 30) + "H" + (mx + ww + 30) + "Z", cc) + L(mx + ww - 4, wy, mx + ww + 4, wy + wh + 20, cd, 6);
        var fx = mx + 340;
        out.back += R(fx, Gw - 480, 130, 100, "#8A5A3B", 6) + R(fx + 10, Gw - 470, 110, 80, "#FFF1DC", 3) + C(fx + 92, Gw - 448, 12, "#FFC93C") + P("M" + (fx + 14) + " " + (Gw - 394) + "L" + (fx + 52) + " " + (Gw - 446) + "L" + (fx + 82) + " " + (Gw - 410) + "L" + (fx + 96) + " " + (Gw - 424) + "L" + (fx + 116) + " " + (Gw - 394) + "Z", "#6CC46A");
        out.back += R(fx + 166, Gw - 450, 84, 112, "#2BB3A3", 6) + R(fx + 176, Gw - 440, 64, 92, "#FFE3C2", 3) + P(HEART_D.replace(/(\d+(\.\d+)?) (\d+(\.\d+)?)/g, function (m0_, a, _a, b2) { return f1(fx + 186 + a * 0.44) + " " + f1(Gw - 428 + b2 * 0.44); }), "#FF7A59");
      });
      each(s.fac.mid, 1320, m0 + 280, function (sx) {
        var y0 = Gw;
        out.mid += R(sx - 30, y0 - 160, 64, 124, "#2E8A7F", 30) + R(sx + 346, y0 - 160, 64, 124, "#2E8A7F", 30);
        out.mid += R(sx, y0 - 216, 380, 140, "#3BA99C", 36) + R(sx - 8, y0 - 112, 396, 74, "#34978B", 24);
        out.mid += R(sx + 34, y0 - 196, 130, 84, "#FFC93C", 26) + R(sx + 214, y0 - 196, 130, 84, "#FF7A59", 26);
        out.mid += R(sx + 10, y0 - 40, 16, 34, "#8A5A3B", 4) + R(sx + 354, y0 - 40, 16, 34, "#8A5A3B", 4);
        var lx = sx + 560;
        out.mid += R(lx - 4, y0 - 330, 8, 320, "#6E6482", 4) + E(lx, y0 - 6, 40, 10, "#6E6482") + P("M" + (lx - 60) + " " + (y0 - 330) + "L" + (lx - 38) + " " + (y0 - 420) + "H" + (lx + 38) + "L" + (lx + 60) + " " + (y0 - 330) + "Z", "#FFE38A");
        var bx = sx + 800;
        out.mid += R(bx, y0 - 420, 200, 420, "#B07A4A", 8) + R(bx + 14, y0 - 404, 172, 390, "#8A5A3B", 4);
        [y0 - 300, y0 - 170, y0 - 30].forEach(function (yy, k) {
          out.mid += R(bx + 14, yy, 172, 12, "#B07A4A");
          for (var q = 0; q < 6; q++) { var hh = 70 + ((q * 37 + k * 11) % 40); out.mid += R(bx + 22 + q * 27, yy - hh, 22, hh, ["#FF7A59", "#2BB3A3", "#FFC93C", "#7B6FD0", "#6CC46A", "#FF9EB5"][(q + k) % 6], 3); }
        });
      });
      out.main += R(b[0], Gw, bw, 1500 - Gw, "#C98F5E");
      [30, 78, 140, 220, 320].forEach(function (dy) { out.main += R(b[0], Gw + dy, bw, 5, "#BA7F50"); });
      each(1, 900, m0 + 380, function (rx, i) { out.main += E(rx, G + 18, 300, 44, i % 2 ? "#2BB3A3" : "#E86F5A") + E(rx, G + 18, 250, 32, i % 2 ? "#5CC9BC" : "#F59A7E"); });
    } else if (loc === "office") {
      var r2 = xr(s.fac.back);
      out.back += R(r2[0], -300, r2[1] - r2[0], Gw + 310, "#DCE7F2") + R(r2[0], Gw - 20, r2[1] - r2[0], 26, "#C4D3E3");
      each(s.fac.back, 560, m0 - 20, function (wx, i) {
        var wy = Gw - 580, ww = 420, wh = 340;
        out.back += R(wx, wy, ww, wh, "#FFFFFF", 10) + R(wx + 14, wy + 14, ww - 28, wh - 28, "#C4E3F7", 4);
        for (var q = 0; q < 7; q++) { var hb = 70 + ((q * 53 + i * 29) % 150), bwq = 44 + ((q * 17) % 22); out.back += R(wx + 18 + q * 56, wy + wh - 14 - hb, bwq, hb, q % 2 ? "#A9C6E0" : "#93B6D6"); }
        out.back += R(wx + ww / 2 - 5, wy + 14, 10, wh - 28, "#FFFFFF") + R(wx + 14, wy + wh * 0.42, ww - 28, 8, "#FFFFFF");
      });
      each(s.fac.mid, 780, m0 + 420, function (dx, i) {
        var y0 = Gw;
        out.mid += R(dx, y0 - 140, 320, 20, "#9C7A5E", 6) + R(dx + 14, y0 - 122, 14, 122, "#7E614A") + R(dx + 292, y0 - 122, 14, 122, "#7E614A") + R(dx + 200, y0 - 120, 100, 80, "#8A6A52", 6);
        out.mid += R(dx + 70, y0 - 270, 170, 112, "#2A2140", 10) + R(dx + 80, y0 - 260, 150, 92, i % 2 ? "#8FD3FF" : "#9FE8D9", 4) + R(dx + 145, y0 - 160, 20, 22, "#2A2140") + R(dx + 115, y0 - 144, 80, 8, "#2A2140", 4);
        out.mid += R(dx + 96, y0 - 240, 70, 8, "#FFFFFF", 4) + R(dx + 96, y0 - 222, 100, 8, "#FFFFFF", 4) + R(dx + 96, y0 - 204, 54, 8, "#FFFFFF", 4);
        out.mid += P("M" + (dx + 520) + " " + (y0 - 4) + "L" + (dx + 534) + " " + (y0 - 80) + "H" + (dx + 590) + "L" + (dx + 604) + " " + (y0 - 4) + "Z", "#E07B4F") + E(dx + 562, y0 - 120, 50, 56, "#5DAE5B") + E(dx + 532, y0 - 150, 30, 44, "#6CC46A") + E(dx + 594, y0 - 156, 30, 46, "#4E9E4F");
      });
      out.main += R(b[0], Gw, bw, 1500 - Gw, "#A9B6C6");
      [26, 70, 130, 210, 320].forEach(function (dy) { out.main += R(b[0], Gw + dy, bw, 4, "#9BA9BA"); });
    } else if (loc === "classroom") {
      var r3 = xr(s.fac.back);
      out.back += R(r3[0], -300, r3[1] - r3[0], Gw + 310, "#D6E9CB") + R(r3[0], Gw - 180, r3[1] - r3[0], 186, "#C2DCB2") + R(r3[0], Gw - 186, r3[1] - r3[0], 10, "#A8C796");
      each(s.fac.back, 980, m0 - 10, function (cx, i) {
        var cy = Gw - 600, cw = 540, ch = 320;
        if (s.noBoard) { out.back += R(cx + 40, cy + 30, 420, 250, "#D9A066", 10) + R(cx + 60, cy + 50, 120, 90, "#FFFFFF", 4) + R(cx + 200, cy + 60, 100, 120, "#FF9EB5", 4) + R(cx + 320, cy + 50, 110, 80, "#8FD3FF", 4) + R(cx + 90, cy + 160, 150, 90, "#FFE066", 4) + C(cx + 120, cy + 56, 6, "#FF5D5D") + C(cx + 250, cy + 66, 6, "#2BB3A3"); }
        else out.back += R(cx, cy, cw, ch, "#B07A4A", 12) + R(cx + 16, cy + 16, cw - 32, ch - 32, "#2F5D50", 4) + R(cx + 10, cy + ch - 8, cw - 20, 16, "#9A6A40", 4);
        if (!s.noBoard) out.back += P("M" + (cx + 50) + " " + (cy + 80) + "q30 -30 60 0t60 0t60 0", "none", SK("#E8F1E8", 6) + ' opacity="0.55"') + P("M" + (cx + 50) + " " + (cy + 150) + "h180M" + (cx + 50) + " " + (cy + 200) + "h120", "none", SK("#E8F1E8", 6) + ' opacity="0.45"');
        if (!s.noBoard) out.back += C(cx + 400, cy + 130, 50, "none", SK("#E8F1E8", 6) + ' opacity="0.5"') + P("M" + (cx + 360) + " " + (cy + 210) + "l80 -150", "none", SK("#FFD166", 6) + ' opacity="0.6"');
        var kx = cx + 680;
        out.back += C(kx, cy + 40, 46, "#FFFFFF", SK("#2A2140", 8)) + L(kx, cy + 40, kx, cy + 12, "#2A2140", 6) + L(kx, cy + 40, kx + 20, cy + 50, "#2A2140", 6);
        out.back += R(kx - 70, cy + 140, 140, 180, "#FFC93C", 6) + R(kx - 54, cy + 160, 108, 70, "#FFFFFF", 4) + R(kx - 54, cy + 246, 80, 12, "#FF7A59", 4) + R(kx - 54, cy + 270, 60, 12, "#FF7A59", 4);
      });
      each(s.fac.mid, 470, m0 + 160, function (dx) {
        var y0 = Gw + 6;
        out.mid += R(dx, y0 - 110, 170, 18, "#E0A85E", 5) + R(dx + 12, y0 - 94, 12, 94, "#8A6A52") + R(dx + 146, y0 - 94, 12, 94, "#8A6A52") + R(dx + 190, y0 - 150, 70, 70, "#2BB3A3", 10) + R(dx + 196, y0 - 80, 10, 80, "#6E6482") + R(dx + 244, y0 - 80, 10, 80, "#6E6482");
      });
      out.main += R(b[0], Gw, bw, 1500 - Gw, "#DDA86E");
      [30, 80, 146, 230, 340].forEach(function (dy) { out.main += R(b[0], Gw + dy, bw, 5, "#CC9660"); });
    } else if (loc === "city-street") {
      var r4 = xr(s.fac.back), sky = grad(uid("sky"), "#8FD0EE", "#DDF3FB");
      out.back += R(r4[0], -300, r4[1] - r4[0], G + 320, sky) + C(r4[0] + 520, 170, 56, "#FFE38A");
      for (var x4 = r4[0]; x4 < r4[1]; ) { var w4 = 60 + rnd() * 90, h4 = 140 + rnd() * 260; out.back += R(x4, G - 120 - h4, w4, h4 + 140, "#BCD3E8"); x4 += w4 + 6; }
      for (x4 = r4[0] + 30; x4 < r4[1]; ) { var w5 = 70 + rnd() * 80, h5 = 90 + rnd() * 180; out.back += R(x4, G - 100 - h5, w5, h5 + 120, "#A6C3DD"); x4 += w5 + 40 * rnd(); }
      var rm = xr(s.fac.mid), cols = ["#F4A261", "#E76F51", "#2A9D8F", "#E9C46A", "#8AB17D", "#B07BD8", "#FF8FA3"];
      for (var x5 = rm[0], q5 = 0; x5 < rm[1]; q5++) {
        var bw5 = 180 + rnd() * 110, bh5 = 260 + rnd() * 240, col = cols[q5 % cols.length], y5 = G - 40 - bh5;
        out.mid += R(x5, y5, bw5, bh5 + 60, col) + R(x5 - 6, y5 - 14, bw5 + 12, 20, shade(col, 0.82), 4);
        for (var wy5 = y5 + 30; wy5 < G - 150; wy5 += 66) for (var wx5 = x5 + 22; wx5 < x5 + bw5 - 40; wx5 += 52) out.mid += R(wx5, wy5, 30, 40, (q5 + wy5) % 3 ? "#FFF4D6" : "#9DD6F5", 4);
        out.mid += R(x5 + bw5 / 2 - 26, G - 130, 52, 92, shade(col, 0.7), 6);
        if (q5 % 2) for (var a5 = 0; a5 < 6; a5++) out.mid += R(x5 + 10 + a5 * ((bw5 - 20) / 6), G - 170, (bw5 - 20) / 6, 30, a5 % 2 ? "#FFFFFF" : "#FF7A59");
        x5 += bw5 + 4;
      }
      out.main += R(b[0], G - 40, bw, 90, "#E3D7C6") + R(b[0], G + 46, bw, 14, "#B9AC9A") + R(b[0], G + 60, bw, 1500, "#5D6070");
      for (var x6 = b[0]; x6 < b[1]; x6 += 110) out.main += R(x6, G - 40, 4, 86, "#D3C6B3");
      for (x6 = b[0]; x6 < b[1]; x6 += 170) out.main += R(x6, G + 150, 86, 12, "#F2E6C8", 5);
      each(1, 760, m0 + 60, function (lx, i) {
        out.pback += R(lx - 6, G - 380, 12, 350, "#4A4560", 6) + P("M" + lx + " " + (G - 380) + "q0 -30 40 -30h20", "none", SK("#4A4560", 10)) + E(lx + 62, G - 400, 22, 14, "#FFE38A", SK("#4A4560", 6)) + E(lx, G - 30, 22, 8, "#4A4560");
        var tx = lx + 380;
        out.pback += R(tx - 10, G - 200, 20, 170, "#8A5A3B", 6) + C(tx, G - 250, 74, "#5DAE5B") + C(tx - 52, G - 214, 50, "#6CC46A") + C(tx + 50, G - 218, 52, "#4E9E4F") + E(tx, G - 30, 40, 10, "#B9AC9A");
      });
    } else if (loc === "park") {
      var r7 = xr(s.fac.back), sky7 = grad(uid("sky"), "#8FD0EE", "#E4F7FC");
      out.back += R(r7[0], -300, r7[1] - r7[0], G + 320, sky7) + C(r7[0] + 640, 160, 60, "#FFE38A");
      for (var c7 = r7[0] + 200; c7 < r7[1]; c7 += 520) { var cy7 = 110 + rnd() * 140; out.back += E(c7, cy7, 70, 26, "#FFFFFF") + E(c7 + 40, cy7 - 18, 46, 28, "#FFFFFF") + E(c7 - 34, cy7 - 8, 36, 20, "#FFFFFF"); }
      var hp = "M" + r7[0] + " " + (G - 150);
      for (var hx7 = r7[0]; hx7 < r7[1] + 400; hx7 += 400) hp += "Q" + (hx7 + 200) + " " + (G - 250 - rnd() * 90) + " " + (hx7 + 400) + " " + (G - 150);
      out.back += P(hp + "V1400H" + r7[0] + "Z", "#BDE29E");
      var hp2 = "M" + r7[0] + " " + (G - 90);
      for (hx7 = r7[0]; hx7 < r7[1] + 300; hx7 += 300) hp2 += "Q" + (hx7 + 150) + " " + (G - 170 - rnd() * 60) + " " + (hx7 + 300) + " " + (G - 90);
      out.back += P(hp2 + "V1400H" + r7[0] + "Z", "#A6D684");
      var rm7 = xr(s.fac.mid);
      for (var t7 = rm7[0]; t7 < rm7[1]; t7 += 230 + rnd() * 160) {
        var th7 = 110 + rnd() * 60, cr = 70 + rnd() * 30, g7 = rnd() > 0.5 ? "#5DAE5B" : "#4E9E4F";
        out.mid += R(t7 - 10, G - 60 - th7, 20, th7 + 20, "#8A5A3B", 6) + C(t7, G - 70 - th7 - cr * 0.5, cr, g7) + C(t7 - cr * 0.7, G - 60 - th7, cr * 0.7, shade(g7, 1.08)) + C(t7 + cr * 0.7, G - 64 - th7, cr * 0.72, shade(g7, 0.92));
      }
      out.main += R(b[0], G - 50, bw, 1500, "#9CD36B") + R(b[0], G - 12, bw, 52, "#EBDDB0") + R(b[0], G - 14, bw, 5, "#D9C890") + R(b[0], G + 38, bw, 5, "#D9C890");
      for (var g8 = b[0]; g8 < b[1]; g8 += 70) out.main += P("M" + f1(g8) + " " + (G + 110) + "l6 -16l6 16l6 -12l4 12", "none", SK("#7DBB52", 4));
      each(1, 1100, m0 + 620, function (bx8) {
        out.pback += R(bx8, G - 120, 200, 18, "#B07A4A", 6) + R(bx8, G - 92, 200, 18, "#B07A4A", 6) + R(bx8 + 16, G - 74, 12, 52, "#6E6482") + R(bx8 + 172, G - 74, 12, 52, "#6E6482") + R(bx8 - 6, G - 56, 212, 16, "#C98A55", 6);
      });
      each(s.fac.front, 900, m0 + 300, function (fx8, i) {
        out.front += C(fx8, G + 170, 50, "#5DAE5B") + C(fx8 + 52, G + 182, 40, "#6CC46A") + C(fx8 - 20, G + 140, 10, i % 2 ? "#FF7A59" : "#FFC93C") + C(fx8 + 40, G + 140, 9, "#FF9EB5");
      });
    } else if (loc === "lab") {
      var r9 = xr(s.fac.back);
      out.back += R(r9[0], -300, r9[1] - r9[0], Gw + 310, "#E1F2EF") + R(r9[0], Gw - 200, r9[1] - r9[0], 206, "#C7E6E0");
      each(s.fac.back, 700, m0 - 20, function (lx9, i) {
        var y9 = Gw - 560;
        if (!s.noBoard) out.back += R(lx9, y9, 380, 230, "#2A2140", 14) + R(lx9 + 14, y9 + 14, 352, 202, "#1F3350", 6);
        if (!s.noBoard) out.back += P("M" + (lx9 + 36) + " " + (y9 + 180) + "L" + (lx9 + 110) + " " + (y9 + 130) + "L" + (lx9 + 180) + " " + (y9 + 150) + "L" + (lx9 + 250) + " " + (y9 + 80) + "L" + (lx9 + 330) + " " + (y9 + 60), "none", SK("#5CE1E6", 7));
        if (!s.noBoard) out.back += C(lx9 + 300, y9 + 170, 30, "none", SK("#FF7A59", 10) + ' stroke-dasharray="120 80"');
        var sx9 = lx9 + 460;
        [y9 + 60, y9 + 200].forEach(function (yy, k) {
          out.back += R(sx9, yy, 200, 12, "#9AB7B2", 4);
          for (var q = 0; q < 4; q++) {
            var fx9 = sx9 + 24 + q * 46, colq = ["#FF7A59", "#5CE1E6", "#B98AF0", "#FFC93C"][(q + k + i) % 4];
            out.back += R(fx9 - 6, yy - 64, 12, 28, "#FFFFFF", 3) + C(fx9, yy - 22, 18, "#FFFFFF") + P("M" + (fx9 - 16) + " " + (yy - 18) + "A18 18 0 0 0 " + (fx9 + 16) + " " + (yy - 18) + "Z", colq);
          }
        });
      });
      each(s.fac.mid, 860, m0 + 300, function (bx9) {
        var y0 = Gw;
        out.mid += R(bx9, y0 - 150, 360, 26, "#FFFFFF", 6) + R(bx9 + 12, y0 - 126, 336, 126, "#9FD3CB", 4) + R(bx9 + 30, y0 - 110, 140, 90, "#B6E0D9", 6) + R(bx9 + 190, y0 - 110, 140, 90, "#B6E0D9", 6);
        out.mid += R(bx9 + 70, y0 - 230, 22, 80, "#6E6482", 6) + R(bx9 + 50, y0 - 160, 70, 12, "#6E6482", 4) + R(bx9 + 76, y0 - 260, 40, 20, "#2A2140", 6);
        out.mid += R(bx9 + 220, y0 - 210, 36, 60, "#FFFFFF", 6, ' opacity="0.9"') + R(bx9 + 222, y0 - 180, 32, 28, "#5CE1E6", 4) + R(bx9 + 280, y0 - 196, 30, 46, "#FFFFFF", 6) + R(bx9 + 282, y0 - 176, 26, 24, "#FF7A59", 4);
      });
      out.main += R(b[0], Gw, bw, 1500 - Gw, "#C3D3D8");
      for (var x9 = b[0]; x9 < b[1]; x9 += 140) out.main += R(x9, Gw, 4, 1500, "#B3C4CA");
      [40, 110, 210, 340].forEach(function (dy) { out.main += R(b[0], Gw + dy, bw, 4, "#B3C4CA"); });
    } else if (loc === "space") {
      var r10 = xr(s.fac.back), sp = grad(uid("sp"), "#17133A", "#3B2D6E");
      out.back += R(r10[0], -300, r10[1] - r10[0], 1700, sp);
      for (var i10 = 0; i10 < 90 * Math.max(1, (r10[1] - r10[0]) / 2200); i10++) { var sx10 = r10[0] + rnd() * (r10[1] - r10[0]), sy10 = -100 + rnd() * (G + 80); out.back += C(sx10, sy10, 1.5 + rnd() * 3, "#FFFFFF", ' opacity="' + f2(0.4 + rnd() * 0.6) + '"'); }
      each(s.fac.back, 1400, m0 + 260, function (px10, i) {
        if (i % 2) out.back += C(px10, 230, 80, "#FF9F68") + E(px10, 230, 140, 26, "none", SK("#FFD3A8", 10)) + P("M" + (px10 - 80) + " 230A80 80 0 0 0 " + (px10 + 80) + " 230", "#FF9F68") + C(px10 - 24, 200, 14, "#F28A50");
        else out.back += C(px10, 200, 64, "#6EC6FF") + P("M" + (px10 - 40) + " 170q20 -10 30 10t30 0q10 30 -20 40q-30 -10 -40 -50Z", "#7ED37A") + C(px10 + 520, 420, 26, "#E7E2F6");
      });
      var rm10 = xr(s.fac.mid), hp10 = "M" + rm10[0] + " " + (G - 70);
      for (var x10 = rm10[0]; x10 < rm10[1] + 300; x10 += 300) hp10 += "Q" + (x10 + 150) + " " + (G - 150 - rnd() * 70) + " " + (x10 + 300) + " " + (G - 70);
      out.mid += P(hp10 + "V1400H" + rm10[0] + "Z", "#6F6396");
      out.main += R(b[0], G - 34, bw, 1500, "#B9B1D0");
      for (var c10 = b[0]; c10 < b[1]; c10 += 150 + rnd() * 160) { var cr10 = 20 + rnd() * 34, cy10 = G + 40 + rnd() * 120; out.main += E(c10, cy10, cr10 * 1.6, cr10 * 0.5, "#A49BC2") + E(c10, cy10 - 3, cr10 * 1.3, cr10 * 0.34, "#9188B3"); }
    } else if (loc === "market") {
      var r11 = xr(s.fac.back), sky11 = grad(uid("sky"), "#FFC98F", "#FFEBCB");
      out.back += R(r11[0], -300, r11[1] - r11[0], G + 320, sky11);
      for (var x11 = r11[0]; x11 < r11[1]; ) { var w11 = 150 + rnd() * 120, h11 = 220 + rnd() * 200, c11 = rnd() > 0.5 ? "#F2C79A" : "#EAB98A"; out.back += R(x11, G - 100 - h11, w11, h11 + 120, c11) + R(x11 + w11 * 0.3, G - 60 - h11, 30, 40, "#FFF4D6", 4) + R(x11 + w11 * 0.62, G - 60 - h11, 30, 40, "#FFF4D6", 4); x11 += w11 + 10; }
      var rmid = xr(s.fac.mid);
      for (var l11 = rmid[0]; l11 < rmid[1]; l11 += 400) {
        out.mid += P("M" + l11 + " " + (G - 520) + "Q" + (l11 + 200) + " " + (G - 450) + " " + (l11 + 400) + " " + (G - 520), "none", SK("#6E6482", 3));
        for (var q11 = 1; q11 < 8; q11++) { var tq = q11 / 8, by = (1 - tq) * (1 - tq) * (G - 520) + 2 * tq * (1 - tq) * (G - 450) + tq * tq * (G - 520); out.mid += C(l11 + 400 * tq, by + 10, 9, q11 % 2 ? "#FFE38A" : "#FF9F68"); }
      }
      each(s.fac.mid, 560, m0 + 40, function (sx11, i) {
        var y0 = G - 40, col = ["#FF7A59", "#2BB3A3", "#7B6FD0", "#FFC93C"][i % 4];
        out.mid += R(sx11 + 10, y0 - 300, 14, 300, "#8A5A3B") + R(sx11 + 336, y0 - 300, 14, 300, "#8A5A3B");
        for (var a11 = 0; a11 < 8; a11++) out.mid += R(sx11 + a11 * 45, y0 - 340, 45, 70, a11 % 2 ? "#FFFFFF" : col);
        for (a11 = 0; a11 < 8; a11++) out.mid += C(sx11 + 22.5 + a11 * 45, y0 - 270, 22.5, a11 % 2 ? "#FFFFFF" : col);
        out.mid += R(sx11 - 6, y0 - 130, 372, 130, "#B07A4A", 8) + R(sx11 + 6, y0 - 118, 348, 14, "#9A6A40", 4);
        for (var f11 = 0; f11 < 11; f11++) out.mid += C(sx11 + 26 + f11 * 32, y0 - 142, 18, ["#FF5D5D", "#FFB347", "#8BD17C", "#FFE066"][(f11 + i) % 4]);
        out.mid += R(sx11 + 120, y0 - 230, 120, 50, "#FFF1DC", 8);
      });
      out.main += R(b[0], G - 40, bw, 1500, "#E3C9A1");
      for (var y11 = G - 20; y11 < 1100; y11 += 44) for (var cx11 = b[0] + ((y11 / 44) % 2) * 40; cx11 < b[1]; cx11 += 80) out.main += E(cx11, y11, 34, 14, "#D8BB8F");
    } else {
      var c12 = s.color || "#FFD9A8", r12 = xr(s.fac.back);
      out.back += R(r12[0], -300, r12[1] - r12[0], 1700, c12);
      for (var i12 = 0; i12 < 10 * s.span + 6; i12++) out.back += C(r12[0] + rnd() * (r12[1] - r12[0]), rnd() * (G - 100), 90 + rnd() * 170, tint(c12, 0.28), ' opacity="0.55"');
      each(s.fac.back, s.Ww, s.Ww / 2, function (cx12) { out.back += E(cx12, G - 300, s.Ww * 0.42, 420, tint(c12, 0.4), ' opacity="0.55"'); });
      out.main += R(b[0], G - 26, bw, 1500, shade(c12, 0.9)) + R(b[0], G - 26, bw, 8, shade(c12, 0.82));
      each(1, s.Ww, s.Ww / 2, function (cx12) { out.main += E(cx12, G + 30, s.Ww * 0.36, 46, shade(c12, 0.95)); });
    }
    s.L.back.innerHTML = out.back;
    s.L.mid.innerHTML = out.mid;
    s.L.main.innerHTML = out.main;
    s.L.pback.innerHTML = out.pback;
    s.L.front.innerHTML = out.front;
    s.el.style.background = loc === "space" ? "#17133A" : loc === "stage" ? s.color || "#FFD9A8" : BG;
  }

  // ------------------------- the cast -------------------------
  var CAST = {
    maya: { skin: "#A86B45", hair: "#2B1A16", shirt: "#F2B632", pants: "#3E4C74", shoe: "#2A2140", sleeve: "short", hairStyle: "bun", top: "tee", hairTop: 1.6 },
    leo: { skin: "#F6CFAE", hair: "#E0702E", shirt: "#3E7FD9", pants: "#4A4F63", shoe: "#E8574A", sleeve: "long", hairStyle: "quiff", top: "hoodie", glasses: true, hairTop: 1.56 },
    priya: { skin: "#C98D62", hair: "#1D1722", shirt: "#FF7A59", pants: "#2E2A44", shoe: "#2A2140", sleeve: "long", hairStyle: "long", top: "blouse", hairTop: 1.25 },
    sam: { skin: "#6B4429", hair: "#17110E", shirt: "#43A86B", pants: "#C7A570", shoe: "#5A3B2A", sleeve: "short", hairStyle: "flattop", top: "polo", beard: true, broad: 1.12, hairTop: 1.34 },
    bolt: { robot: true, skin: "#CFDAE6", hair: "#5CE1E6", shirt: "#CFDAE6", pants: "#A9B8C9", shoe: "#8C9BB0", screen: "#2A2140", glow: "#5CE1E6", top: "robot", sleeve: "none", hairTop: 1.85 },
    kai: { skin: "#EDB98E", hair: "#5B3A22", shirt: "#2BB3A3", pants: "#3E4C74", shoe: "#FF7A59", sleeve: "short", hairStyle: "spiky", top: "stripe", kid: true, shorts: true, hairTop: 1.44 },
  };
  var CAST_IDS = ["maya", "leo", "priya", "sam", "bolt", "kai"];
  var CAST_SYN = { host: "maya", narrator: "maya", robot: "bolt", ai: "bolt", computer: "bolt", bot: "bolt", kid: "kai", child: "kai", boy: "kai", expert: "priya", skeptic: "sam", nerd: "leo" };
  function castKey(n) { n = str(n).toLowerCase(); return CAST[n] ? n : CAST_SYN[n] || null; }
  function dims(cd) {
    if (cd.robot) return { HR: 16, gap: 0.5, T: 26, sw: 12.5, hw: 11, UA: 12.5, FA: 11.5, AT: 4.6, hand: 4.3, TH: 12.5, SH: 12.5, LT: 5.4, eye: [4.3, 5.4], pupil: 0, mouthY: 0.42 };
    if (cd.kid) return { HR: 19, gap: 0.2, T: 23, sw: 10.5, hw: 9.5, UA: 12, FA: 11, AT: 6.2, hand: 4.3, TH: 13.5, SH: 13, LT: 7.4, eye: [3.9, 4.9], pupil: 2.5, mouthY: 0.5 };
    var b = cd.broad || 1;
    return { HR: 15.5, gap: 1.2, T: 30, sw: 11.5 * b, hw: 10.5 * b, UA: 14.5, FA: 13.5, AT: 6.4 * (b > 1 ? 1.06 : 1), hand: 4.2, TH: 17.5, SH: 17.5, LT: 7.8, eye: [3.3, 4.2], pupil: 2.1, mouthY: 0.47 };
  }

  // Poses: lean (torso forward), nod (head down), tilt (head roll), ra/re near arm (shoulder from down, positive =
  // forward or outward; elbow bend), la/le far arm, rl/rk ll/lk legs (hip from down; knee bend back), hop (up),
  // sh (shoulders up), hs (hand scale). front: reads best facing the camera; side: needs a side view.
  var PZ = { lean: 0, nod: 0, tilt: 0, ra: 7, re: 12, la: 7, le: 12, rl: 4, rk: 0, ll: 4, lk: 0, hop: 0, sh: 0, hs: 1, fl: 1 };
  var POSES = {
    idle: {},
    talk: { ra: 24, re: 64, la: 6, le: 14 },
    explain: { ra: 22, re: 52, la: 22, le: 52, front: 1 },
    wave: { ra: 128, re: 34, front: 1, osc: "wave" },
    point: { ra: 86, re: 4, side: 1, hand: "point" },
    "point-up": { ra: 132, re: 6, side: 1, hand: "point", tilt: -5, nod: -6 },
    "point-down": { ra: 42, re: -8, side: 1, hand: "point", nod: 10 },
    "point-viewer": { ra: 24, re: 96, front: 1, hand: "point", hs: 1.45, fl: 0.42, lean: 3 },
    think: { ra: 58, re: 118, la: 20, le: 84, tilt: 7, nod: -4, look: "up", side: 1 },
    shrug: { ra: 28, re: 74, la: 28, le: 74, front: 1, sh: 3.5, tilt: 7 },
    celebrate: { ra: 154, re: 8, la: 154, le: 8, front: 1, osc: "bounce" },
    jump: { ra: 160, re: 12, la: 160, le: 12, front: 1, osc: "jump" },
    facepalm: { ra: 96, re: 104, nod: 14, lean: 4 },
    present: { ra: 64, re: -16, side: 1 },
    "open-arms": { ra: 70, re: 8, la: 70, le: 8, front: 1, lean: -2 },
    "arms-crossed": { ra: 18, re: -120, la: 18, le: -120, front: 1, tilt: -3 },
    "hands-hips": { ra: 48, re: -98, la: 48, le: -98, front: 1 },
    hold: { ra: 26, re: 72 },
    "hold-up": { ra: 150, re: 14, front: 1 },
    phone: { ra: 28, re: 100, nod: 12, look: "down" },
    type: { ra: 44, re: 52, la: 44, le: 52, lean: 8, nod: 8, osc: "type", look: "down" },
    sad: { ra: 2, re: 4, la: 2, le: 4, nod: 16, lean: 6, sh: -2, look: "down" },
    scared: { ra: 62, re: 108, la: 62, le: 108, front: 1, lean: -6, sh: 3, rl: 9, ll: 9, rk: 8, lk: 8, osc: "tremble" },
    surprised: { ra: 74, re: 100, la: 74, le: 100, front: 1, lean: -6, sh: 2.5 },
    "fist-pump": { ra: 34, re: 138, osc: "pump" },
    sit: { rl: 88, rk: 90, ll: 86, lk: 88, ra: 18, re: 46, la: 14, le: 40, seat: 1 },
    nod: { osc: "nod" },
    headshake: { osc: "shake" },
    bow: { lean: 34, nod: 12, ra: 6, re: 4, la: 6, le: 4 },
    "lean-in": { lean: 12, ra: 30, re: 50, la: 10, le: 20 },
    dance: { ra: 120, re: 40, la: 60, le: 60, front: 1, osc: "dance" },
    walk: { ra: 6, re: 14, la: 6, le: 14 },
    run: { lean: 12, ra: 18, re: 84, la: 18, le: 84 },
  };
  var POSE_SYN = { stand: "idle", standing: "idle", rest: "idle", talking: "talk", speak: "talk", explaining: "explain", waving: "wave", pointing: "point", "point-right": "point", "point-left": "point", "point-at-viewer": "point-viewer", "point-camera": "point-viewer", thinking: "think", ponder: "think", cheer: "celebrate", cheering: "celebrate", victory: "celebrate", hop: "jump", jumping: "jump", "face-palm": "facepalm", presenting: "present", show: "present", welcome: "open-arms", crossed: "arms-crossed", "hands-on-hips": "hands-hips", holding: "hold", "hold-high": "hold-up", raise: "hold-up", texting: "phone", typing: "type", cry: "sad", crying: "sad", afraid: "scared", fear: "scared", shock: "surprised", shocked: "surprised", "fist-bump": "fist-pump", yes: "fist-pump", sitting: "sit", "nod-yes": "nod", "shake-head": "headshake", no: "headshake", lean: "lean-in", dancing: "dance", walking: "walk", running: "run" };
  function poseKey(n) { n = str(n).toLowerCase(); return POSES[n] ? n : POSE_SYN[n] || "idle"; }
  function poseVec(n) { var p = POSES[poseKey(n)], o = {}; for (var k in PZ) o[k] = p[k] != null ? p[k] : PZ[k]; return o; }
  var GESTURE_POSE = { idle: 1, talk: 1, explain: 1, present: 1, "lean-in": 1, "open-arms": 1, walk: 0 };

  // Expressions: by brow raise, ba brow angle (+ inner up, - inner down), bs far brow raise, lt/lb upper/lower lid,
  // arc happy closed eyes, pu pupil scale, sm smile (-1..1), mw mouth width, mo open, mr roundness, te teeth,
  // ma mouth asymmetry, bl blush.
  var EXZ = { by: 0, ba: 0, bs: 0, lt: 0.06, lb: 0, arc: 0, pu: 1, sm: 0.32, mw: 0.85, mo: 0, mr: 0, te: 0, ma: 0, bl: 0.12 };
  var EXPR = {
    neutral: {},
    happy: { by: 0.25, lb: 0.2, sm: 0.9, mw: 1.05, mo: 0.3, te: 0.55, bl: 0.4 },
    excited: { by: 0.65, sm: 1, mw: 1.18, mo: 0.78, te: 0.6, pu: 1.12, bl: 0.55 },
    sad: { ba: 0.9, by: -0.05, lt: 0.3, sm: -0.75, mw: 0.72, pu: 1.05, bl: 0 },
    surprised: { by: 1, pu: 0.74, sm: 0, mw: 0.52, mo: 0.95, mr: 1, bl: 0 },
    angry: { ba: -1, by: -0.35, lt: 0.32, sm: -0.6, mw: 0.95, mo: 0.32, te: 0.95, bl: 0 },
    worried: { ba: 0.8, by: 0.25, sm: -0.45, mw: 0.66, mo: 0.12, ma: 0.3, bl: 0 },
    skeptical: { bs: 1, lt: 0.34, sm: -0.12, mw: 0.66, ma: 0.55, bl: 0 },
    thinking: { bs: 0.6, by: 0.2, sm: 0.05, mw: 0.48, mr: 0.45, ma: 0.4, bl: 0 },
    smug: { lt: 0.42, bs: 0.45, sm: 0.7, mw: 0.85, ma: 0.6, bl: 0.2 },
    laughing: { arc: 1, by: 0.4, sm: 1, mw: 1.25, mo: 1, te: 0.7, bl: 0.6 },
    determined: { ba: -0.55, by: -0.1, lt: 0.2, sm: 0.12, mw: 0.95 },
    love: { arc: 1, by: 0.35, sm: 0.85, mw: 0.9, mo: 0.22, bl: 1 },
    sleepy: { lt: 0.72, by: -0.1, sm: 0, mw: 0.5, mo: 0.16, mr: 0.6, bl: 0 },
    disgusted: { ba: -0.45, bs: 0.6, lb: 0.3, sm: -0.7, mw: 0.9, mo: 0.2, te: 0.65, ma: -0.5, bl: 0 },
  };
  var EXPR_SYN = { confused: "skeptical", scared: "worried", afraid: "worried", nervous: "worried", shocked: "surprised", shock: "surprised", mad: "angry", proud: "smug", joy: "happy", glad: "happy", smile: "happy", calm: "neutral", curious: "thinking", think: "thinking", laugh: "laughing", tired: "sleepy", focused: "determined", upset: "sad" };
  function exKey(n) { n = str(n).toLowerCase(); return EXPR[n] ? n : EXPR_SYN[n] || "neutral"; }
  function exprVec(n) { var p = EXPR[exKey(n)], o = {}; for (var k in EXZ) o[k] = p[k] != null ? p[k] : EXZ[k]; return o; }
  var VIS = { A: { w: 1.0, o: 1.0, r: 0.3 }, E: { w: 1.2, o: 0.5, r: 0.1 }, I: { w: 1.08, o: 0.42, r: 0.1 }, O: { w: 0.62, o: 0.88, r: 1 }, U: { w: 0.5, o: 0.55, r: 1 } };
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

  // ------------------------- hair, heads, torsos (static markup in local units) -------------------------
  function hairMarkup(cd, R0, part) {
    var h = cd.hair, o = SK(INK, 1.3), r = R0;
    function p(pts) { return pts.replace(/(-?\d+(\.\d+)?)r/g, function (m, v) { return f2(+v * r); }); }
    if (cd.robot) return part === "front" ? L(0, -r * 0.95, 0, -r * 1.55, INK, 1.6) + C(0, -r * 1.62, r * 0.2, cd.accent || ACC, o) : "";
    var st_ = cd.hairStyle;
    if (part === "back") {
      if (st_ === "bun") return C(-r * 0.12, -r * 1.1, r * 0.5, h, o) + E(-r * 0.04, -r * 0.3, r * 1.12, r * 0.94, h, o);
      if (st_ === "long") return P(p("M-1.1r -0.3r C-1.28r -1.36r 1.28r -1.36r 1.1r -0.3r L1.22r 2.25r Q0 2.6r -1.22r 2.25r Z"), h, o);
      if (st_ === "quiff" || st_ === "spiky") return E(0, -r * 0.34, r * 1.05, r * 0.8, h, o);
      if (st_ === "curly") return E(0, -r * 0.4, r * 1.14, r * 0.9, h, o);
      return "";
    }
    if (st_ === "bun") {
      var d = p("M-1.0r 0.05r C-1.12r -1.12r 1.06r -1.22r 1.02r -0.18r C0.8r -0.5r 0.4r -0.64r 0r -0.6r C-0.42r -0.58r -0.8r -0.38r -1.0r 0.05r Z"), curls = "";
      [[-0.92, -0.08], [-0.72, -0.4], [-0.4, -0.58], [0, -0.62], [0.4, -0.6], [0.74, -0.44], [0.98, -0.2]].forEach(function (q) { curls += C(q[0] * r, q[1] * r, r * 0.17, h); });
      return P(d, h, o) + curls;
    }
    if (st_ === "quiff") return P(p("M-1.02r -0.08r C-1.0r -1.05r 0.95r -1.15r 1.02r -0.25r C0.7r -0.6r 0.2r -0.7r -0.3r -0.62r C-0.65r -0.55r -0.9r -0.4r -1.02r -0.08r Z"), h, o) + P(p("M-0.55r -0.82r C-0.45r -1.52r 0.75r -1.62r 1.0r -1.02r C0.72r -1.18r 0.32r -1.12r 0.1r -0.86r Z"), h, o) + P(p("M-0.2r -1.0r Q0.3r -1.4r 0.8r -1.15r"), "none", SK(shade(h, 0.8), 1.1));
    if (st_ === "curly") {
      var cap = p("M-1.04r 0.02r C-1.16r -1.2r 1.12r -1.3r 1.06r -0.1r C0.82r -0.48r 0.42r -0.62r 0r -0.6r C-0.44r -0.6r -0.84r -0.42r -1.04r 0.02r Z"), cu = "", cs = SK(shade(h, 0.78), 0.9);
      [[-0.98, -0.1, 0.22], [-0.86, -0.5, 0.25], [-0.6, -0.86, 0.27], [-0.22, -1.08, 0.28], [0.2, -1.1, 0.28], [0.58, -0.92, 0.27], [0.86, -0.58, 0.25], [1.0, -0.18, 0.21], [-0.36, -0.7, 0.22], [0.12, -0.78, 0.22], [0.52, -0.62, 0.2]].forEach(function (q) { cu += C(q[0] * r, q[1] * r, q[2] * r, h, cs); });
      return P(cap, h, o) + cu;
    }
    if (st_ === "long") return P(p("M-1.04r 0.5r C-1.2r -1.12r 0.92r -1.28r 1.05r -0.12r C0.8r -0.56r 0.12r -0.76r -0.42r -0.46r C-0.72r -0.24r -0.86r 0.1r -1.04r 0.5r Z"), h, o);
    if (st_ === "flattop") return P(p("M-0.98r -0.12r L-0.96r -1.14r Q-0.92r -1.34r -0.7r -1.34r L0.7r -1.34r Q0.92r -1.34r 0.96r -1.14r L0.98r -0.24r C0.82r -0.56r 0.6r -0.64r 0.3r -0.64r L-0.3r -0.64r C-0.62r -0.64r -0.82r -0.5r -0.98r -0.12r Z"), h, o);
    if (st_ === "spiky") return P(p("M-1.02r -0.04r L-1.12r -0.74r L-0.76r -0.86r L-0.72r -1.3r L-0.3r -1.06r L0r -1.44r L0.3r -1.06r L0.72r -1.3r L0.8r -0.84r L1.14r -0.72r L1.02r -0.14r C0.7r -0.5r 0.3r -0.6r 0r -0.58r C-0.4r -0.6r -0.8r -0.45r -1.02r -0.04r Z"), h, o);
    return "";
  }
  function torsoMarkup(cd, dm) {
    var T = dm.T, sw = dm.sw, hw = dm.hw, sh = cd.shirt, o = SK(INK, 1.3), dk = shade(sh, 0.82), m = "";
    var base = "M" + -hw + " 3L" + f2(-sw * 0.98) + " " + (-T + 5) + "Q" + -sw + " " + -T + " " + (-sw + 5) + " " + -T + "L" + (sw - 5) + " " + -T + "Q" + sw + " " + -T + " " + f2(sw * 0.98) + " " + (-T + 5) + "L" + hw + " 3Q0 5.5 " + -hw + " 3Z";
    if (cd.robot) {
      m += R(-3, -T - 3, 6, 6, cd.pants, 1, o);
      m += R(-sw, -T, sw * 2, T + 3, cd.skin, 6, o) + R(-sw * 0.58, -T * 0.78, sw * 1.16, T * 0.46, cd.screen, 3) + P(HEART_D.replace(/(\d+(\.\d+)?) (\d+(\.\d+)?)/g, function (q, a, a2, b) { return f2(-3.6 + a * 0.072) + " " + f2(-T * 0.68 + b * 0.072); }), cd.glow) + R(-sw * 0.45, -T * 0.22, sw * 0.9, 3, cd.pants, 1.5);
      return m;
    }
    m += R(-2.8, -T - 3.5, 5.6, 7, cd.skin, 1);
    if (cd.top === "hoodie") m += E(0, -T + 0.5, sw * 0.86, 5, dk, o);
    m += P(base, sh, o);
    if (cd.top === "tee" || cd.top === "stripe") m += P("M-4.6 " + (-T + 0.3) + "Q0 " + (-T + 6) + " 4.6 " + (-T + 0.3) + "Z", cd.skin, SK(INK, 1));
    if (cd.top === "stripe") { m += R(-sw * 0.96, -T * 0.62, sw * 1.92, 3.4, "#FFFFFF") + R(-sw * 0.92, -T * 0.36, sw * 1.84, 3.4, "#FFFFFF"); m += P(base, "none", o); }
    if (cd.top === "hoodie") m += L(-2.6, -T + 3, -3.2, -T + 12, "#FFFFFF", 1.3) + L(2.6, -T + 3, 3.2, -T + 12, "#FFFFFF", 1.3) + R(-8, -12, 16, 8, dk, 3, SK(INK, 1));
    if (cd.top === "blouse") m += P("M-4.8 " + (-T + 0.2) + "L0 " + (-T + 8) + "L4.8 " + (-T + 0.2) + "Z", cd.skin, SK(INK, 1)) + R(-hw, -2.5, hw * 2, 3, dk);
    if (cd.top === "polo") m += P("M-5.5 " + -T + "L0 " + (-T + 5) + "L-2.5 " + (-T + 8.5) + "L-7.5 " + (-T + 2.5) + "Z", tint(sh, 0.35), SK(INK, 1)) + P("M5.5 " + -T + "L0 " + (-T + 5) + "L2.5 " + (-T + 8.5) + "L7.5 " + (-T + 2.5) + "Z", tint(sh, 0.35), SK(INK, 1)) + L(0, -T + 5, 0, -T + 12, dk, 1) + C(0, -T + 8.5, 0.8, "#FFFFFF") + C(0, -T + 11.5, 0.8, "#FFFFFF");
    return m;
  }

  // ------------------------- actor -------------------------
  function mkLimb(parent, o) {
    var g = svg("g", { fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" }, parent), Lm = { g: g, o: o };
    Lm.out = svg("path", { stroke: INK, "stroke-width": f2(o.w + 2.6) }, g);
    Lm.skin = svg("path", { stroke: o.skin, "stroke-width": f2(o.w) }, g);
    Lm.cloth = o.cloth ? svg("path", { stroke: o.cloth, "stroke-width": f2(o.w + (o.leg ? 0 : 0.6)) }, g) : null;
    if (o.leg) Lm.shoe = svg("path", { fill: o.shoe, stroke: INK, "stroke-width": 1.3 }, g);
    else {
      Lm.f1 = svg("path", { stroke: INK, "stroke-width": 5 }, g);
      Lm.f2 = svg("path", { stroke: o.skin, "stroke-width": 2.5 }, g);
      Lm.hand = svg("circle", { r: o.hand, fill: o.skin, stroke: INK, "stroke-width": 1.3 }, g);
    }
    return Lm;
  }
  function P2(p) { return f2(p[0]) + " " + f2(p[1]); }
  function along(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; }
  function updLimb(Lm, p, opt) {
    var o = Lm.o, d = "M" + P2(p[0]) + "L" + P2(p[1]) + "L" + P2(p[2]);
    setA(Lm.out, "d", d);
    if (o.leg) {
      if (!Lm.cloth) setA(Lm.skin, "d", d);
      else if (o.shorts) { setA(Lm.skin, "d", "M" + P2(p[1]) + "L" + P2(p[2])); setA(Lm.cloth, "d", "M" + P2(p[0]) + "L" + P2(along(p[0], p[1], 1.02))); }
      else { setA(Lm.skin, "d", ""); setA(Lm.cloth, "d", d); }
      var fx = p[2][0] + (opt.fdir || 0), fy = p[2][1], rx = opt.frx || 6.4, ry = 3.8;
      setA(Lm.shoe, "d", "M" + f2(fx - rx) + " " + f2(fy + ry * 0.7) + "Q" + f2(fx - rx) + " " + f2(fy - ry) + " " + f2(fx) + " " + f2(fy - ry) + "Q" + f2(fx + rx) + " " + f2(fy - ry) + " " + f2(fx + rx) + " " + f2(fy + ry * 0.7) + "Z");
      return;
    }
    setA(Lm.skin, "d", d);
    if (Lm.cloth) setA(Lm.cloth, "d", o.sleeve === "long" ? "M" + P2(p[0]) + "L" + P2(p[1]) + "L" + P2(along(p[1], p[2], 0.8)) : "M" + P2(p[0]) + "L" + P2(along(p[0], p[1], 0.62)));
    var vx = p[2][0] - p[1][0], vy = p[2][1] - p[1][1], vl = Math.sqrt(vx * vx + vy * vy) || 1, hx = p[2][0] + (vx / vl) * 1.2, hy = p[2][1] + (vy / vl) * 1.2;
    setA(Lm.hand, "cx", f2(hx)); setA(Lm.hand, "cy", f2(hy)); setA(Lm.hand, "r", f2(o.hand * (opt.hs || 1)));
    if (opt.point) {
      var fk = 6.2 * (opt.hs || 1) * (opt.fl < 0.8 ? 0.55 : 1);
      var fd = "M" + f2(hx) + " " + f2(hy) + "L" + f2(hx + (vx / vl) * fk) + " " + f2(hy + (vy / vl) * fk);
      setA(Lm.f1, "d", fd); setA(Lm.f2, "d", fd);
    } else { setA(Lm.f1, "d", ""); setA(Lm.f2, "d", ""); }
    Lm.handPt = [hx, hy];
  }

  function makeActor(name, o) {
    var s = ensure();
    o = obj(o);
    var key = castKey(name) || "maya", cd = CAST[key], dm = dims(cd);
    var a = { __actor: true, name: key, cd: cd, dm: dm, s: s, idx: s.actors.length };
    a.scale = num(o.scale, 1);
    a.us = (s.charH / 100) * a.scale * (cd.kid ? 0.8 : cd.robot ? 0.9 : 1);
    a.x0 = num(o.x, s.Ww / 2);
    a.y0 = num(o.y, s.G);
    a.pos = new Tr({ x: a.x0, y: a.y0 });
    var p0 = poseKey(o.pose || "idle");
    var f0 = o.facing === "left" ? -1 : o.facing === "right" ? 1 : o.facing === "front" ? 0 : POSES[p0].side ? 1 : 0;
    if (f0 === 0 && POSES[p0].side) f0 = o.facing === "front" ? 1 : f0;
    a.faceTr = new Tr({ f: f0, s: f0 < 0 ? -1 : 1 });
    a.poseTr = new Tr(poseVec(p0));
    a.poseName = new Tr(p0);
    a.exTr = new Tr(exprVec(o.expression || "neutral"));
    a.looks = [];
    a.vis = new Tr(1);
    a.fade = new Tr(1);
    a.talks = []; a.walks = []; a.holds = []; a.nods = []; a.hops = [];
    a.gestures = o.gestures !== false;
    a.seed = 17 + a.idx * 31 + key.length * 7;
    buildActor(a);
    s.actors.push(a);
    s.anims.push(function (t) { updActor(a, t); });
    actorMethods(a);
    return a;
  }

  function buildActor(a) {
    var s = a.s, cd = a.cd, dm = a.dm, R0 = dm.HR, robot = !!cd.robot, o13 = SK(INK, 1.3);
    var g = svg("g", { class: "ct-actor ct-" + a.name }, s.L.chars), id = uid("a");
    var el = { g: g };
    el.shadow = svg("ellipse", { cx: 0, cy: 0, rx: 17, ry: 3.4, fill: "rgba(42,33,64,0.18)" }, g);
    el.body = svg("g", null, g);
    el.backHair = svg("g", null, el.body);
    el.backHairIn = svg("g", null, el.backHair);
    el.backHairIn.innerHTML = hairMarkup(cd, R0, "back");
    el.stool = svg("g", null, el.body);
    el.stool.innerHTML = R(-12, -3, 24, 4.5, "#B07A4A", 2, o13) + R(-9, 1.5, 3, 40, "#8A5A3B", 1, SK(INK, 1)) + R(6, 1.5, 3, 40, "#8A5A3B", 1, SK(INK, 1));
    var armO = { skin: cd.skin, cloth: robot ? null : cd.shirt, sleeve: cd.sleeve, w: dm.AT, hand: dm.hand };
    var armOfar = { skin: shade(cd.skin, 0.88), cloth: robot ? null : shade(cd.shirt, 0.88), sleeve: cd.sleeve, w: dm.AT, hand: dm.hand };
    var legO = { leg: true, skin: cd.skin, cloth: cd.pants, shorts: cd.shorts, shoe: cd.shoe, w: dm.LT };
    var legOfar = { leg: true, skin: shade(cd.skin, 0.88), cloth: shade(cd.pants, 0.88), shorts: cd.shorts, shoe: shade(cd.shoe, 0.88), w: dm.LT };
    if (robot) { legO.cloth = null; legOfar.cloth = null; legO.skin = cd.pants; legOfar.skin = shade(cd.pants, 0.9); }
    el.armFar = mkLimb(el.body, armOfar);
    el.legFar = mkLimb(el.body, legOfar);
    el.legNear = mkLimb(el.body, legO);
    el.torso = svg("g", null, el.body);
    el.torsoIn = svg("g", null, el.torso);
    el.torsoIn.innerHTML = torsoMarkup(cd, dm);
    el.head = svg("g", null, el.body);
    el.earBL = svg("circle", { r: f2(R0 * 0.22), fill: cd.skin, stroke: INK, "stroke-width": 1.3 }, el.head);
    el.earBR = svg("circle", { r: f2(R0 * 0.22), fill: cd.skin, stroke: INK, "stroke-width": 1.3 }, el.head);
    if (robot) {
      svg("rect", { x: f2(-R0 * 1.15), y: f2(-R0 * 0.95), width: f2(R0 * 2.3), height: f2(R0 * 1.9), rx: f2(R0 * 0.5), fill: cd.skin, stroke: INK, "stroke-width": 1.3 }, el.head);
      svg("rect", { x: f2(-R0 * 0.94), y: f2(-R0 * 0.72), width: f2(R0 * 1.88), height: f2(R0 * 1.44), rx: f2(R0 * 0.38), fill: cd.screen }, el.head);
    } else svg("circle", { r: R0, fill: cd.skin, stroke: INK, "stroke-width": 1.3 }, el.head);
    el.earS = svg("g", null, el.head);
    el.earS.innerHTML = robot ? R(-R0 * 0.25, -R0 * 0.3, R0 * 0.5, R0 * 0.6, cd.pants, 2, o13) : C(0, 0, R0 * 0.2, cd.skin, o13) + P("M" + f2(-R0 * 0.06) + " " + f2(-R0 * 0.1) + "Q" + f2(R0 * 0.1) + " 0 " + f2(-R0 * 0.06) + " " + f2(R0 * 0.1), "none", SK(shade(cd.skin, 0.75), 1));
    el.beard = svg("g", null, el.head);
    if (cd.beard) el.beard.innerHTML = P("M" + f2(-R0 * 0.94) + " " + f2(-R0 * 0.05) + "Q" + f2(-R0 * 0.98) + " " + f2(R0 * 0.8) + " 0 " + f2(R0 * 1.08) + "Q" + f2(R0 * 0.98) + " " + f2(R0 * 0.8) + " " + f2(R0 * 0.94) + " " + f2(-R0 * 0.05) + "L" + f2(R0 * 0.72) + " " + f2(R0 * 0.16) + "Q" + f2(R0 * 0.56) + " " + f2(R0 * 0.7) + " 0 " + f2(R0 * 0.74) + "Q" + f2(-R0 * 0.56) + " " + f2(R0 * 0.7) + " " + f2(-R0 * 0.72) + " " + f2(R0 * 0.16) + "Z", cd.hair, o13);
    el.face = svg("g", null, el.head);
    el.blush = [svg("ellipse", { rx: f2(R0 * 0.17), ry: f2(R0 * 0.1), fill: robot ? "#FF8FB0" : "#FF7F7F" }, el.face), svg("ellipse", { rx: f2(R0 * 0.17), ry: f2(R0 * 0.1), fill: robot ? "#FF8FB0" : "#FF7F7F" }, el.face)];
    el.nose = robot ? null : svg("path", { d: "M-1.5 0Q0 1.7 1.5 0", fill: "none", stroke: shade(cd.skin, 0.72), "stroke-width": 1.2, "stroke-linecap": "round" }, el.face);
    var erx = dm.eye[0], ery = dm.eye[1], lidC = robot ? cd.screen : cd.skin;
    el.eyes = [0, 1].map(function (k) {
      var eg = svg("g", null, el.face), eb = svg("g", null, eg), cid = id + "e" + k;
      var cp = svg("clipPath", { id: cid }, s.defsF);
      svg("ellipse", { rx: erx, ry: ery }, cp);
      var e = { g: eg, b: eb };
      e.sclera = svg("ellipse", { rx: erx, ry: ery, fill: robot ? cd.glow : "#FFFFFF", stroke: robot ? "none" : INK, "stroke-width": 1.1 }, eb);
      e.pg = svg("g", null, eb);
      if (!robot) { svg("circle", { r: dm.pupil, fill: INK }, e.pg); svg("circle", { cx: -0.7, cy: -0.9, r: 0.75, fill: "#FFFFFF" }, e.pg); }
      else svg("ellipse", { cx: -1.2, cy: -1.6, rx: 1.1, ry: 1.4, fill: "#FFFFFF", opacity: 0.8 }, e.pg);
      e.lidT = svg("rect", { x: -erx - 2, width: erx * 2 + 4, height: ery * 3, fill: lidC, stroke: robot ? "none" : INK, "stroke-width": 1, "clip-path": "url(#" + cid + ")" }, eb);
      e.lidB = svg("rect", { x: -erx - 2, width: erx * 2 + 4, height: ery * 3, fill: lidC, "clip-path": "url(#" + cid + ")" }, eb);
      e.arc = svg("path", { d: "M" + -erx + " 1Q0 " + f2(-ery * 0.95) + " " + erx + " 1", fill: "none", stroke: robot ? cd.glow : INK, "stroke-width": robot ? 2.2 : 1.6, "stroke-linecap": "round" }, eg);
      if (cd.glasses === "square") e.glass = svg("rect", { x: -erx - 2.6, y: -ery - 2.2, width: erx * 2 + 5.2, height: ery * 2 + 4.4, rx: 1.6, fill: "rgba(255,255,255,0.18)", stroke: INK, "stroke-width": 1.7 }, eg);
      else if (cd.glasses) e.glass = svg("circle", { r: erx + 2.4, fill: "rgba(255,255,255,0.18)", stroke: INK, "stroke-width": 1.5 }, eg);
      return e;
    });
    if (cd.glasses) el.bridge = svg("path", { fill: "none", stroke: INK, "stroke-width": 1.4 }, el.face);
    el.brows = [0, 1].map(function () { return svg("path", { d: robot ? "M-2.6 0L2.6 0" : "M-3.2 0.4Q0 -1.2 3.2 0.4", fill: "none", stroke: robot ? cd.glow : cd.hair, "stroke-width": robot ? 1.8 : 1.9, "stroke-linecap": "round" }, el.face); });
    el.mouthG = svg("g", null, el.face);
    var mid_ = id + "m", mcp = svg("clipPath", { id: mid_ }, s.defsF);
    el.mclip = svg("path", null, mcp);
    el.mouth = svg("path", { fill: robot ? "rgba(92,225,230,0.35)" : "#5A2333", stroke: robot ? cd.glow : INK, "stroke-width": robot ? 1.5 : 1.25, "stroke-linejoin": "round", "stroke-linecap": "round" }, el.mouthG);
    el.teeth = robot ? null : svg("rect", { x: -R0, width: R0 * 2, fill: "#FFFFFF", "clip-path": "url(#" + mid_ + ")" }, el.mouthG);
    el.tongue = robot ? null : svg("ellipse", { fill: "#FF8A8A", "clip-path": "url(#" + mid_ + ")" }, el.mouthG);
    if (cd.beard) el.stache = svg("path", { d: "M" + f2(-R0 * 0.34) + " " + f2(R0 * 0.4) + "Q0 " + f2(R0 * 0.22) + " " + f2(R0 * 0.34) + " " + f2(R0 * 0.4) + "Q0 " + f2(R0 * 0.34) + " " + f2(-R0 * 0.34) + " " + f2(R0 * 0.4) + "Z", fill: cd.hair, stroke: INK, "stroke-width": 1 }, el.face);
    el.hair = svg("g", null, el.head);
    el.hair.innerHTML = hairMarkup(cd, R0, "front");
    el.armL = mkLimb(el.body, armO);
    el.armR = mkLimb(el.body, armO);
    el.holder = svg("g", null, el.body);
    a.el = el;
  }

  // Look target -> local direction (dx forward, dy down) in -1..1.
  function lookDir(a, spec, t, hx, hy, flip, front, talking) {
    if (spec == null || spec === "auto") return talking || front ? [0, 0.04] : [0.55, 0.05];
    if (spec === "camera") return [0, 0];
    if (spec === "up") return [front ? 0 : 0.35, -0.85];
    if (spec === "down") return [front ? 0 : 0.4, 0.8];
    if (spec === "left" || spec === "right") return [(spec === "left" ? -1 : 1) * flip, 0];
    var tx, ty;
    if (spec.__actor) { var r = rigAt(spec, t); tx = r.hw[0]; ty = r.hw[1]; }
    else if (typeof spec === "number") { tx = spec; ty = hy; }
    else { tx = num(spec.x, hx); ty = num(spec.y, hy); }
    var dx = tx - hx, dy = ty - hy, dist = Math.sqrt(dx * dx + dy * dy) || 1, k = Math.min(1, dist / 160);
    return [(dx / dist) * k * flip, clamp((dy / dist) * k, -1, 1)];
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
    var tb = 0.5 + hash(a.seed) * 1.6, k = 0;
    while (tb < t + 0.2 && k < 400) {
      if (t >= tb && t < tb + 0.15) return Math.sin((PI * (t - tb)) / 0.15);
      tb += 2.2 + hash(a.seed + ++k * 1.37) * 2.6;
    }
    return 0;
  }
  function dv(ang, sg) { var r_ = rad(ang); return [Math.sin(r_) * sg, Math.cos(r_)]; }
  function addv(p, v, k) { return [p[0] + v[0] * k, p[1] + v[1] * k]; }

  // Full rig at time t (local units, feet at 0), cached for the frame.
  function rigAt(a, t) {
    if (a._rt === t && a._r) return a._r;
    var dm = a.dm, pv = Object.assign({}, a.poseTr.val(t)), pk = a.poseName.key(t), pname = pk.v, since = t - pk.at;
    var fz = a.faceTr.val(t), f = clamp(fz.f, -1, 1), af = Math.abs(f), flip = fz.s < 0 ? -1 : 1, front = af < 0.5;
    var pos = a.pos.val(t), jx = 0, shk = 0;
    var wk = since < 0 ? 1 : smooth(since / 0.3), ph;
    a.walks.forEach(function (w) {
      if (t < w.t0 || t > w.t1 + 0.06) return;
      var dist = Math.abs(pos.x - w.x0) / a.us, fade = clamp(Math.min((t - w.t0) / 0.14, (w.t1 + 0.06 - t) / 0.14), 0, 1);
      var run = w.gait === "run", A = run ? 40 : 25;
      ph = (dist / (run ? 46 : 34)) * 2 * PI;
      var sn = Math.sin(ph) * fade, cs = Math.cos(ph) * fade;
      if (w.gait === "hop") { pv.hop += 9 * Math.abs(Math.sin(ph / 2)) * fade; pv.rl += 8 * fade; pv.ll += 8 * fade; pv.rk += 16 * fade; pv.lk += 16 * fade; return; }
      pv.rl += A * sn; pv.ll -= A * sn;
      pv.rk += Math.max(0, (run ? 70 : 34) * -cs); pv.lk += Math.max(0, (run ? 70 : 34) * cs);
      pv.ra -= (run ? 34 : 22) * sn; pv.la += (run ? 34 : 22) * sn;
      pv.hop += (run ? 3.2 : 1.4) * Math.abs(Math.cos(ph));
    });
    var tt = t * 2 * PI;
    if (POSES[pname] && POSES[pname].osc) {
      var oc = POSES[pname].osc;
      if (oc === "wave") pv.re += 24 * Math.sin(tt * 1.8) * wk;
      else if (oc === "bounce") { pv.hop += 5 * Math.abs(Math.sin(tt * 1.25)) * wk; pv.ra += 6 * Math.sin(tt * 2.5) * wk; pv.la += 6 * Math.sin(tt * 2.5 + 1) * wk; }
      else if (oc === "jump") { var jp = Math.abs(Math.sin(tt * 0.62)); pv.hop += 13 * jp * wk; pv.rk += 26 * (1 - jp) * wk; pv.lk += 26 * (1 - jp) * wk; pv.rl += 13 * (1 - jp) * wk; pv.ll += 13 * (1 - jp) * wk; }
      else if (oc === "type") { pv.re += 8 * Math.sin(tt * 5.5) * wk; pv.le += 8 * Math.sin(tt * 5.5 + 1.7) * wk; }
      else if (oc === "tremble") jx = 0.55 * Math.sin(t * 61) * wk;
      else if (oc === "pump") { pv.ra += 12 * Math.sin(tt * 2.1) * wk; pv.re += 10 * Math.sin(tt * 2.1) * wk; }
      else if (oc === "nod") pv.nod += 9 * Math.sin(tt * 1.6) * wk * clamp(1 - (since - 1.6) / 0.4, 0, 1);
      else if (oc === "shake") { shk = 0.6 * Math.sin(tt * 2.2) * wk * clamp(1 - (since - 1.6) / 0.4, 0, 1); pv.tilt += 3 * shk; }
      else if (oc === "dance") { var dsn = Math.sin(tt * 1.1); pv.ra += 34 * dsn * wk; pv.la -= 34 * dsn * wk; pv.re += 18 * dsn * wk; pv.le -= 18 * dsn * wk; pv.hop += 4 * Math.abs(Math.sin(tt * 2.2)) * wk; pv.lean += 5 * dsn * wk; pv.tilt += 5 * dsn * wk; }
    }
    a.nods.forEach(function (n0) { if (t >= n0 && t < n0 + 0.55) pv.nod += 7 * Math.sin(((t - n0) / 0.55) * 2 * PI); });
    a.hops.forEach(function (h) { if (t >= h.at && t < h.at + h.dur) { var hp = (t - h.at) / h.dur; pv.hop += h.h * 4 * hp * (1 - hp); } });
    pv.sh += 0.5 * Math.sin(t * 2.1 + a.seed);
    pv.tilt += 1.1 * Math.sin(t * 0.8 + a.seed);
    var m = mouthAt(a, t);
    if (m.env > 0) {
      pv.nod += 2.4 * m.amp;
      pv.tilt += 2 * Math.sin(t * 1.7 + a.seed) * m.env;
      if (a.gestures && GESTURE_POSE[pname]) {
        pv.ra += 7 * Math.sin(t * 2.6 + a.seed) * m.env;
        pv.re += 12 * Math.sin(t * 3.7 + a.seed * 2) * m.env;
        pv.la += 4 * Math.sin(t * 2.1 + a.seed) * m.env;
        pv.le += 6 * Math.sin(t * 3.1 + a.seed) * m.env;
      }
    }
    var sq = 0;
    if (since > 0 && since < 0.32) sq = 0.04 * Math.sin((since / 0.32) * PI);
    // skeleton (local, facing +x)
    var lean = front ? pv.lean * 0.25 : pv.lean;
    var up = dv(180 - lean, 1), nrm = [-up[1], up[0]];
    var hip = [0, 0], neck = addv(hip, up, dm.T), shJ = addv(addv(hip, up, dm.T - 3.6 + pv.sh * 0.6), [0, 0], 0);
    var head = addv(neck, dv(180 - lean - (front ? 0 : pv.nod * 0.35), 1), dm.gap + dm.HR * 0.92);
    if (front) head[1] += pv.nod * 0.06;
    function arm(an, el, side, fl) {
      var sg = front ? side : 1, s0 = front ? addv(shJ, nrm, side * (dm.sw - 2.6)) : addv(shJ, nrm, side * 1.4);
      var lo = front ? 0 : lean, e0 = addv(s0, dv(an + lo, sg), dm.UA), h0 = addv(e0, dv(an + el + lo, sg), dm.FA * (fl == null ? 1 : fl));
      return [s0, e0, h0];
    }
    function leg(l, k, side) {
      var sg = front ? side : 1, h0 = front ? [hip[0] + side * dm.hw * 0.42, hip[1]] : [hip[0] + side * 1.2, hip[1]];
      var kn = addv(h0, dv(l, sg), dm.TH), ft = addv(kn, dv(l - k, sg), dm.SH);
      return [h0, kn, ft];
    }
    var AR = arm(pv.ra, pv.re, 1, front ? pv.fl : lerp(1, pv.fl, 0.4)), AL = arm(pv.la, pv.le, -1), LR = leg(pv.rl, pv.rk, 1), LL = leg(pv.ll, pv.lk, -1);
    var low = Math.max(LR[2][1], LL[2][1]) + 3.8;
    var dy = -low;
    function T_(p) { return [p[0], p[1] + dy]; }
    hip = T_(hip); neck = T_(neck); shJ = T_(shJ); head = T_(head);
    AR = AR.map(T_); AL = AL.map(T_); LR = LR.map(T_); LL = LL.map(T_);
    var hRot = (front ? 0 : pv.nod * 0.75 + lean * 0.3) + pv.tilt;
    var r = {
      t: t, pv: pv, pname: pname, f: f, af: af, flip: flip, front: front, x: pos.x, y: pos.y, jx: jx, hop: pv.hop, sqx: 1 + sq * 0.6, sqy: 1 - sq,
      hip: hip, neck: neck, sh: shJ, head: head, hRot: hRot, lean: lean, AR: AR, AL: AL, LR: LR, LL: LL, mouth: m, shk: shk,
      hand: POSES[pname] ? POSES[pname].hand : null,
    };
    // world positions of key points
    var us = a.us;
    r.w = function (p) { return [pos.x + us * (jx + flip * r.sqx * p[0]), pos.y + us * (-r.hop + r.sqy * p[1])]; };
    r.hw = r.w(head);
    var R0 = dm.HR;
    r.topW = r.w([head[0], head[1] - R0 * (a.cd.hairTop || 1.1)]);
    a._rt = t; a._r = r;
    return r;
  }

  function mouthD(w, c, o, rnd_, ma) {
    var aa = ma * w * 0.28, y0 = -c - aa, y3 = -c + aa, k = 0.45 + 0.35 * rnd_;
    var mU = c * 0.5 - o * 0.28, mL = c * 0.5 + o;
    var cu = (8 * mU - y0 - y3) / 6, cl = (8 * mL - y0 - y3) / 6;
    return "M" + f2(-w) + " " + f2(y0) + "C" + f2(-w * k) + " " + f2(cu) + " " + f2(w * k) + " " + f2(cu) + " " + f2(w) + " " + f2(y3) + "C" + f2(w * k) + " " + f2(cl) + " " + f2(-w * k) + " " + f2(cl) + " " + f2(-w) + " " + f2(y0) + "Z";
  }

  function updActor(a, t) {
    var el = a.el, on = a.vis.val(t) > 0.5;
    showEl(el.g, on);
    if (!on) return;
    setA(el.g, "opacity", f2(a.fade.val(t)));
    if (a.dimF) {
      var dk = a.dimF.val(t), bgc = [1, 0.89, 0.76], g_ = 1 - dk * 0.85, sat = 1 - Math.min(1, dk * 1.6) * 0.7;
      var mv = [0, 1, 2].map(function (c_) { return [0, 1, 2].map(function (k_) { return f2(g_ * ((k_ === c_ ? sat : 0) + (1 - sat) * [0.3, 0.59, 0.11][k_])); }).join(" ") + " 0 " + f2(dk * 0.85 * bgc[c_]); }).join(" ") + " 0 0 0 1 0";
      setA(a.dimM, "values", mv);
    }
    var r = rigAt(a, t), dm = a.dm, cd = a.cd, R0 = dm.HR, robot = !!cd.robot;
    setA(el.g, "transform", "translate(" + f2(r.x) + " " + f2(r.y) + ") scale(" + a.us.toFixed(4) + ")");
    setA(el.shadow, "rx", f2(17 * clamp(1 - r.hop * 0.02, 0.5, 1)));
    setA(el.body, "transform", "translate(" + f2(r.jx) + " " + f2(-r.hop) + ") scale(" + f2(r.flip * r.sqx * 1000) / 1000 + " " + f2(r.sqy * 1000) / 1000 + ")");
    var front = r.front, af = r.af;
    // limbs
    var hs = r.pv.hs || 1, point = r.hand === "point";
    updLimb(el.armR, r.AR, { point: point, hs: hs, fl: r.pv.fl });
    showEl(el.armFar.g, !front); showEl(el.armL.g, front);
    updLimb(front ? el.armL : el.armFar, r.AL, { hs: front ? hs : 1 });
    var fdR = front ? 1.4 : 2.6, fdL = front ? -1.4 : 2.6;
    updLimb(el.legNear, r.LR, { fdir: fdR, frx: front ? 5.4 : 6.6 });
    updLimb(el.legFar, r.LL, { fdir: fdL, frx: front ? 5.4 : 6.6 });
    // stool for sitting
    var seated = r.pname === "sit";
    showEl(el.stool, seated);
    if (seated) setA(el.stool, "transform", "translate(" + f2(r.hip[0] - 2) + " " + f2(r.hip[1] + dm.LT * 0.5 + 1) + ") scale(1 " + f2(Math.max(0.1, (-r.hip[1] - dm.LT * 0.5 - 1) / 41.5)) + ")");
    // torso
    setA(el.torso, "transform", "translate(" + f2(r.hip[0]) + " " + f2(r.hip[1]) + ") rotate(" + f2(r.lean) + ") scale(" + f2(lerp(1, 0.84, af)) + " 1)");
    // head
    var htr = "translate(" + f2(r.head[0]) + " " + f2(r.head[1]) + ") rotate(" + f2(r.hRot) + ")";
    setA(el.head, "transform", htr);
    setA(el.backHair, "transform", htr);
    setA(el.backHairIn, "transform", "translate(" + f2(-af * R0 * 0.16) + " 0)");
    setA(el.hair, "transform", "translate(" + f2(-af * R0 * 0.1) + " 0)");
    var ex = a.exTr.val(t), m = r.mouth;
    // look
    var lk = [0.55, 0.05], li = -1;
    for (var i = 0; i < a.looks.length; i++) if (a.looks[i].at <= t) li = i;
    var talking = m.env > 0.3;
    if (li < 0) lk = lookDir(a, POSES[r.pname] && POSES[r.pname].look ? POSES[r.pname].look : "auto", t, r.hw[0], r.hw[1], r.flip, front, talking);
    else {
      var cur = a.looks[li], lkc = lookDir(a, cur.spec === "auto" && POSES[r.pname] && POSES[r.pname].look ? POSES[r.pname].look : cur.spec, t, r.hw[0], r.hw[1], r.flip, front, talking);
      var prev = li > 0 ? a.looks[li - 1].spec : "auto", lkp = lookDir(a, prev, t, r.hw[0], r.hw[1], r.flip, front, talking), bl = smooth((t - cur.at) / 0.22);
      lk = [lerp(lkp[0], lkc[0], bl), lerp(lkp[1], lkc[1], bl)];
    }
    var fo = af * R0 * 0.27 + r.shk * R0 * 0.3 + (front ? lk[0] * R0 * 0.07 : 0), foy = (front ? r.pv.nod * 0.04 : 0) + lk[1] * R0 * 0.04;
    setA(el.face, "transform", "translate(" + f2(fo) + " " + f2(foy) + ")");
    setA(el.beard, "transform", "translate(" + f2(fo * 0.35) + " 0)");
    // ears
    showEl(el.earBL, af < 0.5); showEl(el.earBR, af < 0.5); showEl(el.earS, af >= 0.5);
    setA(el.earBL, "cx", f2(-R0 * (robot ? 1.12 : 0.97))); setA(el.earBR, "cx", f2(R0 * (robot ? 1.12 : 0.97)));
    setA(el.earBL, "cy", f2(R0 * 0.06)); setA(el.earBR, "cy", f2(R0 * 0.06));
    setA(el.earS, "transform", "translate(" + f2(-R0 * lerp(0.95, 0.56, af)) + " " + f2(R0 * 0.06) + ")");
    // eyes
    var blink = blinkAt(a, t), sp = R0 * 0.37;
    el.eyes.forEach(function (e, k) {
      var sgn = k ? -1 : 1, x = sgn * sp * (sgn > 0 ? 1 - 0.12 * af : 1 - 0.32 * af), sx = sgn > 0 ? 1 : 1 - 0.2 * af;
      setA(e.g, "transform", "translate(" + f2(x) + " " + f2(-R0 * 0.04) + ")");
      var arc = ex.arc > 0.5;
      showEl(e.b, !arc); showEl(e.arc, arc);
      setA(e.b, "transform", "scale(" + f2(sx) + " 1)");
      var ery = dm.eye[1], lt = ex.lt + (1 - ex.lt) * blink, lb = ex.lb;
      var tilt = -sgn * ex.ba * 12;
      setA(e.lidT, "y", f2(-ery * 3 - ery + 2 * ery * lt));
      setA(e.lidT, "transform", "rotate(" + f2(tilt) + ")");
      setA(e.lidB, "y", f2(ery - 2 * ery * lb));
      var pu = ex.pu;
      setA(e.pg, "transform", "translate(" + f2(lk[0] * 1.3) + " " + f2(lk[1] * 1.15) + ") scale(" + f2(pu) + ")");
    });
    if (el.bridge) { var x0 = sp * (1 - 0.12 * af) - dm.eye[0] - 2.4, x1 = -sp * (1 - 0.32 * af) + dm.eye[0] + 2.4; setA(el.bridge, "d", "M" + f2(x1) + " " + f2(-R0 * 0.1) + "Q" + f2((x0 + x1) / 2) + " " + f2(-R0 * 0.2) + " " + f2(x0) + " " + f2(-R0 * 0.1)); }
    el.brows.forEach(function (b, k) {
      var sgn = k ? -1 : 1, x = sgn * sp * (sgn > 0 ? 1 - 0.12 * af : 1 - 0.32 * af);
      var raise = ex.by + (sgn < 0 ? ex.bs * 0.9 : -ex.bs * 0.2), y = -R0 * 0.44 - raise * R0 * 0.12 - (dm.eye[1] - 4.2) * 0.8;
      setA(b, "transform", "translate(" + f2(x) + " " + f2(y) + ") rotate(" + f2(-sgn * ex.ba * 16) + ") scale(" + f2(sgn > 0 ? 1 : 1 - 0.2 * af) + " 1)");
    });
    el.blush.forEach(function (b, k) { var sgn = k ? -1 : 1; setA(b, "cx", f2(sgn * R0 * (sgn > 0 ? 0.5 : 0.52 - 0.12 * af))); setA(b, "cy", f2(R0 * 0.3)); setA(b, "opacity", f2(ex.bl * 0.55)); });
    if (el.nose) setA(el.nose, "transform", "translate(" + f2(af * R0 * 0.12) + " " + f2(R0 * 0.17) + ")");
    // mouth
    var w = R0 * 0.3 * ex.mw, c = ex.sm * R0 * 0.13, o = ex.mo * R0 * 0.4, mr = ex.mr;
    if (m.amp > 0.001) {
      var vv = VIS[m.v] || VIS.A;
      w *= lerp(1, vv.w, m.amp);
      o = Math.max(o * (1 - m.amp * 0.3), m.amp * vv.o * R0 * 0.42);
      mr = lerp(mr, vv.r, m.amp);
      c *= 1 - 0.35 * m.amp;
    }
    var md = mouthD(w, c, o, mr, ex.ma);
    setA(el.mouthG, "transform", "translate(" + f2(af * R0 * 0.05) + " " + f2(R0 * dm.mouthY) + ")");
    setA(el.mouth, "d", md);
    setA(el.mclip, "d", md);
    if (el.teeth) {
      var top_ = Math.min(-c - w * 0.3, c * 0.5 - o * 0.28) - 1;
      setA(el.teeth, "y", f2(top_)); setA(el.teeth, "height", f2(Math.max(0, (c * 0.5 - o * 0.28 - top_) + o * 0.42 * ex.te)));
      setA(el.tongue, "cx", 0); setA(el.tongue, "cy", f2(c * 0.5 + o * 0.95)); setA(el.tongue, "rx", f2(w * 0.55)); setA(el.tongue, "ry", f2(o * 0.42));
    }
    // held props
    var holder = "", hd = null;
    for (var h = 0; h < a.holds.length; h++) { var q = a.holds[h]; if (t >= q.at && t < q.until) hd = q; }
    if (hd) {
      var hp = (hd.hand === "L" ? (front ? el.armL : el.armFar) : el.armR).handPt || [0, 0], sz = 22 * hd.size;
      var popS = popK(t, hd.at, 0.3);
      if (el.holder._k !== hd.name) { el.holder.innerHTML = '<g transform="translate(-50 -50)">' + PROPS[hd.name] + "</g>"; el.holder._k = hd.name; }
      holder = "translate(" + f2(hp[0] + 1.5) + " " + f2(hp[1] - sz * 0.32) + ") scale(" + f2(((r.flip < 0 ? -1 : 1) * sz * popS) / 100) + " " + f2((sz * popS) / 100) + ")";
    }
    showEl(el.holder, !!hd);
    if (hd) setA(el.holder, "transform", holder);
    a.anchor = anchorsOf(a, r);
  }
  function anchorsOf(a, r) {
    var R0 = a.dm.HR, rr = rad(r.hRot), cs = Math.cos(rr), sn = Math.sin(rr);
    function hl(x, y) { return r.w([r.head[0] + x * cs - y * sn, r.head[1] + x * sn + y * cs]); }
    var mx = r.af * R0 * 0.27;
    return { head: r.hw, top: r.topW, mouth: hl(mx, R0 * a.dm.mouthY), handR: r.w(r.AR[2]), handL: r.w(r.AL[2]), feet: [r.x, r.y], r: R0 * a.us, side: r.flip };
  }
  // World box of the head and torso (for inspect, bubbles avoiding heads).
  function actorBox(a, t, full) {
    var r = rigAt(a, t), R0 = a.dm.HR, pts = [r.topW, r.w([r.head[0] - R0 * 1.15, r.head[1]]), r.w([r.head[0] + R0 * 1.15, r.head[1] + R0])];
    if (full) pts.push(r.w(r.hip), r.w(r.AR[2]), r.w(r.AL[2]), r.w(r.LR[2]), r.w(r.LL[2]), r.w(r.AR[1]), r.w(r.AL[1]));
    else pts.push(r.w([r.hip[0] - a.dm.hw, r.hip[1]]), r.w([r.hip[0] + a.dm.hw, r.hip[1]]));
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    pts.forEach(function (p) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  function headBox(a, t) {
    var r = rigAt(a, t), R0 = a.dm.HR * a.us;
    return { x: r.hw[0] - R0 * 1.2, y: r.topW[1], w: R0 * 2.4, h: r.hw[1] + R0 - r.topW[1] };
  }

  function actorMethods(a) {
    var s = a.s;
    function T0(at) { return tc0(at == null ? 0 : at); }
    a.xAt = function (t) { return a.pos.val(t).x; };
    a.topAt = function (t) { return rigAt(a, t).topW[1]; };
    a.sideAt = function (t) { return rigAt(a, t).flip; };
    a.anchorAt = function (t) { return anchorsOf(a, rigAt(a, t)); };
    a.box = function (t, full) { return actorBox(a, t == null ? V.time() : t, full); };
    a.pose = function (name, at, dur, ease) {
      var k = poseKey(name), t0 = T0(at), d = dur == null ? 0.45 : Math.max(0, num(dur, 0.45)), pd = POSES[k];
      a.poseTr.to(poseVec(k), t0, d, ease || "pose");
      a.poseName.set(k, t0);
      if (!a.lockFace) {
        var cur = a.faceTr.val(t0 + 1e-4);
        if (pd.front && Math.abs(cur.f) > 0.5) { a.lastSide = cur.s; a.faceTr.to({ f: 0, s: cur.s }, t0, 0.22, "inOutSine"); }
        if (pd.side && Math.abs(cur.f) < 0.5) { var sd = a.pointSide || cur.s || 1; a.faceTr.to({ f: sd, s: sd }, t0, 0.22, "inOutSine"); }
      }
      return a;
    };
    a.expression = function (name, at, dur) { a.exTr.to(exprVec(name), T0(at), dur == null ? 0.25 : num(dur, 0.25), "inOutSine"); return a; };
    a.face = function (dir, at) {
      var t0 = T0(at), cur = a.faceTr.val(t0 + 1e-4), v = dir === "front" ? 0 : dir === "left" ? -1 : dir === "right" ? 1 : cur.f;
      a.faceTr.to({ f: v, s: v === 0 ? cur.s : v }, t0, 0.22, "inOutSine");
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
        var toks = str(text || "").split(/\s+/).filter(Boolean);
        var n = toks.length || Math.max(2, Math.round((t1 - f0) / 0.34)), wd = (t1 - f0) / n;
        for (var i = 0; i < n; i++) {
          var s0 = f0 + i * wd, pause = (i + 1) % 7 === 0 ? 0.45 : 0.85;
          syl = syl.concat(sylls(toks[i] || ["ba", "da", "lo", "me", "ta", "ku", "sio"][(i * 3 + a.seed) % 7], s0, s0 + wd * pause, a.seed + i * 5));
        }
      }
      a.talks.push({ from: f0, to: t1, syl: syl });
      return a;
    };
    a.moveTo = function (x, at, dur, o) {
      o = obj(o);
      var t0 = T0(at), x0 = a.pos.val(t0).x, tx = num(x, x0), dist = Math.abs(tx - x0), gait = o.gait || "walk";
      var d = dur == null ? Math.max(0.4, dist / (a.us * (gait === "run" ? 95 : 48))) : Math.max(0.15, num(dur, 1.2));
      if (t0 + d > D) d = Math.max(0.15, D - t0);
      var dir = tx >= x0 ? 1 : -1;
      a.faceTr.to({ f: dir, s: dir }, t0, 0.18, "inOutSine");
      a.pos.to({ x: tx }, t0, d, o.ease || (gait === "run" ? "inOutSine" : function (p) { return p < 0.12 ? (p * p) / 0.24 : p > 0.88 ? 1 - ((1 - p) * (1 - p)) / 0.24 : 0.06 + (p - 0.12) * (0.88 / 0.76); }));
      a.walks.push({ t0: t0, t1: t0 + d, x0: x0, gait: gait });
      var base = a.poseName.key(t0 + 1e-4).v;
      a.poseTr.to(poseVec(gait === "run" ? "run" : "walk"), t0, 0.2, "inOutSine");
      a.poseName.set(gait === "run" ? "run" : "walk", t0);
      var back = base === "walk" || base === "run" ? "idle" : base;
      a.poseTr.to(poseVec(back), t0 + d, 0.3, "inOutSine");
      a.poseName.set(back, t0 + d);
      return a;
    };
    a.walkTo = function (x, at, dur) { return a.moveTo(x, at, dur, { gait: "walk" }); };
    a.runTo = function (x, at, dur) { return a.moveTo(x, at, dur, { gait: "run" }); };
    a.hopTo = function (x, at, dur) { return a.moveTo(x, at, dur, { gait: "hop" }); };
    a.enter = function (side, at, dur, x) {
      var t0 = T0(at), tx = x == null ? a.x0 : num(x, a.x0), sd = side === "right" ? 1 : -1, sx = tx + sd * (s.Ww * 0.62 + 120);
      a.pos.set({ x: sx }, 0);
      a.pos.set({ x: sx }, Math.max(0, t0 - 0.001));
      a.vis.set(0, 0); a.vis.set(1, t0);
      return a.moveTo(tx, t0, dur == null ? 1.4 : dur);
    };
    a.exit = function (side, at, dur) {
      var t0 = T0(at), x0 = a.pos.val(t0).x, sd = side === "left" ? -1 : 1, d = dur == null ? 1.3 : num(dur, 1.3);
      a.moveTo(x0 + sd * (s.Ww * 0.7 + 150), t0, d);
      a.vis.set(0, Math.min(D, t0 + d));
      return a;
    };
    a.hop = function (at, height, dur) { a.hops.push({ at: T0(at), h: num(height, 10), dur: num(dur, 0.42) }); return a; };
    a.nod = function (at) { a.nods.push(T0(at)); return a; };
    a.hold = function (prop, at, until, o) {
      o = obj(o);
      var k = propKey(prop) || "star";
      a.holds.push({ name: k, at: T0(at), until: until == null ? D + 1 : num(until, D + 1), hand: o.hand === "L" ? "L" : "R", size: num(o.size, 0.78) });
      return a;
    };
    a.emote = function (mark, at, dur) { addMark(a, mark, T0(at), dur == null ? 1.6 : num(dur, 1.6)); return a; };
    a.beats = function (list, o) {
      o = obj(o);
      var after = num(o.after, 0);
      arr(list).forEach(function (b) {
        b = obj(b);
        var t = b.at != null ? num(b.at, 0) : kwFind(b.word, after);
        if (t == null) return;
        t = tc(t);
        after = t + 0.01;
        if (b.face) a.face(b.face, t - 0.1);
        if (b.pose) a.pose(b.pose, t - 0.12);
        if (b.expression) a.expression(b.expression, t - 0.08);
        if (b.mark) a.emote(b.mark, t, 1.5);
        if (b.look) a.lookAt(b.look, t - 0.1);
      });
      return a;
    };
    a.dimTo = function (k, at, dur) {
      if (!a.dimF) {
        var fid = uid("dim"), fl = svg("filter", { id: fid, "color-interpolation-filters": "sRGB" }, a.s.defsF);
        a.dimM = svg("feColorMatrix", { type: "matrix", values: "1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0" }, fl);
        a.dimF = new Tr(0);
        a.el.g.setAttribute("filter", "url(#" + fid + ")");
      }
      a.dimF.to(clamp(num(k, 0.6), 0, 1), T0(at), dur == null ? 0.4 : num(dur, 0.4), "inOutSine");
      return a;
    };
    a.fadeTo = function (op, at, dur) { a.fade.to(clamp(num(op, 1), 0, 1), T0(at), dur == null ? 0.4 : num(dur, 0.4), "inOutSine"); return a; };
    a.show = function (at) { a.vis.set(1, T0(at)); return a; };
    a.hide = function (at) { a.vis.set(0, T0(at)); return a; };
    a.x = a.x0;
    a.anchor = null;
    return a;
  }

  // ------------------------- safe area (screen px) -------------------------
  function safe() {
    var x0, y0, x1, y1;
    if (V.isPortrait) { x0 = W * (60 / 1080); x1 = W * (1020 / 1080); y0 = H * (250 / 1920); y1 = H * (1450 / 1920); }
    else { x0 = W * 0.07; x1 = W * 0.93; y0 = H * 0.07; y1 = H * 0.93; }
    return { x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }

  // ------------------------- emotion marks -------------------------
  var MARKS = ["sweat", "sparkle", "question", "exclaim", "anger", "heart", "idea", "dizzy", "music", "tears", "zzz", "shock"];
  var MARK_SYN = { drop: "sweat", nervous: "sweat", sparkles: "sparkle", star: "sparkle", stars: "sparkle", "?": "question", confused: "question", "!": "exclaim", alert: "exclaim", surprise: "exclaim", angry: "anger", vein: "anger", love: "heart", lightbulb: "idea", bulb: "idea", spiral: "dizzy", note: "music", notes: "music", cry: "tears", sad: "tears", sleep: "zzz", sleepy: "zzz", shocked: "shock", lines: "shock" };
  function markKey(n) { n = str(n).toLowerCase(); return MARKS.indexOf(n) >= 0 ? n : MARK_SYN[n] || null; }
  function txt(x, y, s_, size, fill, ex) { return '<text x="' + x + '" y="' + y + '" text-anchor="middle" font-size="' + size + '" font-weight="900" font-family=\'' + FONT + "' fill=\"" + fill + '" stroke="' + INK + '" stroke-width="1.6" paint-order="stroke" stroke-linejoin="round"' + (ex || "") + ">" + s_ + "</text>"; }
  var SPARK = function (x, y, r, c) { return P(starD(x, y, r, r * 0.3, 4, -90), c || "#FFE066", SK(INK, 1)); };
  var MARK_SVG = {
    question: txt(0, 0, "?", 26, "#9B7BEA"),
    exclaim: txt(0, 0, "!", 28, "#FF5D5D"),
    idea: '<g transform="translate(-12 -30) scale(0.24)">' + PROPS.lightbulb + "</g>" + L(-17, -24, -22, -28, "#FFC93C", 2.2) + L(17, -24, 22, -28, "#FFC93C", 2.2) + L(0, -34, 0, -40, "#FFC93C", 2.2) + L(-19, -12, -25, -12, "#FFC93C", 2.2) + L(19, -12, 25, -12, "#FFC93C", 2.2),
    heart: '<g class="m-rise"><g transform="translate(-8 -16) scale(0.16)">' + P(HEART_D, "#FF5D7A", SK(INK, 7)) + "</g></g>" + '<g class="m-rise2"><g transform="translate(6 -10) scale(0.11)">' + P(HEART_D, "#FF8FA3", SK(INK, 8)) + "</g></g>",
    music: '<g class="m-rise">' + P("M-4 0a3.5 2.6 -20 1 1 0.1 0zM-0.6 -1V-16L8 -18V-12L-0.6 -10", "#7B6FD0", SK(INK, 1.2)) + '</g><g class="m-rise2">' + P("M9 -6a3 2.2 -20 1 1 0.1 0zM12 -7V-19", "#2BB3A3", SK(INK, 1.2)) + "</g>",
    zzz: '<g class="m-z0">' + txt(0, 0, "Z", 13, "#8FD3FF") + '</g><g class="m-z1">' + txt(0, 0, "Z", 10, "#8FD3FF") + '</g><g class="m-z2">' + txt(0, 0, "Z", 8, "#8FD3FF") + "</g>",
    sweat: P("M0 -9C3 -4 5 -1 5 2.5C5 5.5 2.8 7.5 0 7.5C-2.8 7.5 -5 5.5 -5 2.5C-5 -1 -3 -4 0 -9Z", "#8FD3FF", SK(INK, 1.2)) + P("M-2 2Q-2 4.5 0 5.5", "none", SK("#FFFFFF", 1.2)),
    anger: P("M-9 -3Q-3 -3 -3 -9M3 -9Q3 -3 9 -3M9 3Q3 3 3 9M-3 9Q-3 3 -9 3", "none", SK("#FF5D5D", 3)),
    sparkle: '<g class="m-tw0">' + SPARK(0, 0, 7) + '</g><g class="m-tw1">' + SPARK(12, 9, 4.5, "#FFFFFF") + '</g><g class="m-tw2">' + SPARK(-10, 10, 4, "#FFC93C") + "</g>",
    dizzy: '<g class="m-spin">' + SPARK(12, 0, 4.5) + SPARK(-6, 10, 4, "#FFFFFF") + SPARK(-6, -10, 4, "#FF9EB5") + "</g>",
    shock: P("M-14 -2L-22 -8M-8 -12L-12 -22M0 -15V-26M8 -12L12 -22M14 -2L22 -8", "none", SK(INK, 2.6)),
    tears: '<g class="m-tear0">' + P("M0 0C1.6 2.4 2.6 4 2.6 5.6C2.6 7.2 1.4 8.4 0 8.4C-1.4 8.4 -2.6 7.2 -2.6 5.6C-2.6 4 -1.6 2.4 0 0Z", "#8FD3FF", SK(INK, 0.9)) + '</g><g class="m-tear1">' + P("M0 0C1.6 2.4 2.6 4 2.6 5.6C2.6 7.2 1.4 8.4 0 8.4C-1.4 8.4 -2.6 7.2 -2.6 5.6C-2.6 4 -1.6 2.4 0 0Z", "#8FD3FF", SK(INK, 0.9)) + "</g>",
  };
  function addMark(a, mark, at, dur) {
    var s = a.s, k = markKey(mark);
    if (!k) return null;
    var g = svg("g", { class: "ct-mark" }, s.L.fx);
    g.innerHTML = MARK_SVG[k];
    var parts = {};
    ["m-rise", "m-rise2", "m-z0", "m-z1", "m-z2", "m-tw0", "m-tw1", "m-tw2", "m-spin", "m-tear0", "m-tear1"].forEach(function (c) { parts[c] = g.querySelector("." + c); });
    var mk = { a: a, k: k, at: at, dur: dur, g: g, dx: 0, dy: 0 };
    s.emotes.push(mk);
    // keep clear of stickers: decided once, from the frame in the middle of the mark
    s.late.push(function () {
      var tm = Math.min(D, at + Math.min(dur, 1.2) * 0.5), c = camAt(s, tm), r = rigAt(a, tm), R0 = a.dm.HR * a.us;
      var hits = function (wx, wy) {
        var p0 = toScr(s, c, wx - R0 * 1.1, wy - R0 * 2.2), p1 = toScr(s, c, wx + R0 * 1.1, wy + R0 * 0.2);
        return s.stickers.some(function (k2) { return tm >= k2.at && (k2.until == null || tm < k2.until) && p0[0] < k2.x + k2.w && p1[0] > k2.x && p0[1] < k2.y + k2.h && p1[1] > k2.y; });
      };
      if (k !== "idea" && k !== "heart" && k !== "music" && k !== "zzz" && k !== "dizzy") return;
      if (!hits(r.hw[0], r.topW[1])) return;
      var sd = r.flip, opts = [[sd * R0 * 1.9, R0 * 1.3], [-sd * R0 * 1.9, R0 * 1.3], [sd * R0 * 2.3, R0 * 2.1]];
      for (var i = 0; i < opts.length; i++) if (!hits(r.hw[0] + opts[i][0], r.topW[1] + opts[i][1])) { mk.dx = opts[i][0]; mk.dy = opts[i][1]; return; }
      mk.dx = opts[0][0]; mk.dy = opts[0][1];
    });
    s.anims.push(function (t) {
      var on = t >= at && t < at + dur + 0.25 && a.vis.val(t) > 0.5;
      showEl(g, on);
      if (!on) return;
      var r = rigAt(a, t), R0 = a.dm.HR, sc = a.us * (R0 / 16) * 1.05, side = r.flip, hx = r.hw[0], hy = r.hw[1], top = r.topW[1];
      var x = hx, y = top - 4 * sc;
      if (k === "question" || k === "exclaim") { x = hx + side * R0 * a.us * 1.25; y = hy - R0 * a.us * 0.35; }
      else if (k === "sweat") { x = hx + side * R0 * a.us * 0.92; y = hy - R0 * a.us * 0.45; }
      else if (k === "anger") { x = hx + side * R0 * a.us * 0.7; y = hy - R0 * a.us * 0.85; }
      else if (k === "tears") { x = hx; y = hy; }
      else if (k === "music" || k === "zzz") { x = hx + side * R0 * a.us * 1.1; y = top + 4 * sc; }
      else if (k === "sparkle") { x = hx + side * R0 * a.us * 1.05; y = hy - R0 * a.us * 0.9; }
      x += mk.dx; y += mk.dy;
      var pin = popK(t, at, 0.28), out = t > at + dur ? 1 - smooth((t - at - dur) / 0.25) : 1, bob = Math.sin((t - at) * 5.2) * 1.2;
      setA(g, "transform", "translate(" + f2(x) + " " + f2(y + bob * sc * 0.6) + ") scale(" + f2(sc * pin * out) + ")");
      setA(g, "opacity", f2(out));
      var lt = t - at;
      function rise(el_, ph, spd) { if (!el_) return; var q = ((lt * spd + ph) % 1 + 1) % 1; setA(el_, "transform", "translate(" + f2(q * 6) + " " + f2(-q * 14) + ")"); setA(el_, "opacity", f2(Math.sin(q * PI))); }
      rise(parts["m-rise"], 0.15, 0.7); rise(parts["m-rise2"], 0.6, 0.7);
      ["m-z0", "m-z1", "m-z2"].forEach(function (c, i) { var el_ = parts[c]; if (!el_) return; var q = ((lt * 0.55 + i / 3) % 1 + 1) % 1; setA(el_, "transform", "translate(" + f2(q * 14 - 2) + " " + f2(-q * 22) + ") scale(" + f2(0.6 + q * 0.6) + ")"); setA(el_, "opacity", f2(Math.sin(q * PI))); });
      ["m-tw0", "m-tw1", "m-tw2"].forEach(function (c, i) { var el_ = parts[c]; if (!el_) return; var q = 0.6 + 0.4 * Math.sin(lt * 7 + i * 2.1); setA(el_, "opacity", f2(q)); });
      if (parts["m-spin"]) setA(parts["m-spin"], "transform", "rotate(" + f2(lt * 240) + ")");
      if (k === "tears") {
        var ex = R0 * 0.37 / (R0 / 16), fo = r.af * 16 * 0.27;
        ["m-tear0", "m-tear1"].forEach(function (c, i) { var el_ = parts[c], q = ((lt * 1.6 + i * 0.5) % 1 + 1) % 1; setA(el_, "transform", "translate(" + f2((i ? -ex : ex) * side + fo * side) + " " + f2(2 + q * 16) + ")"); setA(el_, "opacity", f2(1 - q * q)); });
      }
    });
    return mk;
  }

  // ------------------------- bubble shapes -------------------------
  function speechD(x, y, w, h, r, edge, bpos, bw, tip) {
    r = Math.min(r, h / 2, w / 2);
    var x1 = x + w, y1 = y + h, d = "M" + f1(x + r) + " " + f1(y);
    function tailH(bx, yy, dir) { // on a horizontal edge, traversed in direction dir (+1 right, -1 left)
      var a0 = bx - (dir * bw) / 2, a1 = bx + (dir * bw) / 2;
      return "L" + f1(a0) + " " + f1(yy) + "Q" + f1(lerp(a0, tip[0], 0.55)) + " " + f1(lerp(yy, tip[1], 0.35)) + " " + f1(tip[0]) + " " + f1(tip[1]) + "Q" + f1(lerp(a1, tip[0], 0.35)) + " " + f1(lerp(yy, tip[1], 0.5)) + " " + f1(a1) + " " + f1(yy);
    }
    function tailV(by, xx, dir) {
      var a0 = by - (dir * bw) / 2, a1 = by + (dir * bw) / 2;
      return "L" + f1(xx) + " " + f1(a0) + "Q" + f1(lerp(xx, tip[0], 0.35)) + " " + f1(lerp(a0, tip[1], 0.55)) + " " + f1(tip[0]) + " " + f1(tip[1]) + "Q" + f1(lerp(xx, tip[0], 0.5)) + " " + f1(lerp(a1, tip[1], 0.35)) + " " + f1(xx) + " " + f1(a1);
    }
    if (edge === "top") d += tailH(bpos, y, 1);
    d += "L" + f1(x1 - r) + " " + f1(y) + "Q" + f1(x1) + " " + f1(y) + " " + f1(x1) + " " + f1(y + r);
    if (edge === "right") d += tailV(bpos, x1, 1);
    d += "L" + f1(x1) + " " + f1(y1 - r) + "Q" + f1(x1) + " " + f1(y1) + " " + f1(x1 - r) + " " + f1(y1);
    if (edge === "bottom") d += tailH(bpos, y1, -1);
    d += "L" + f1(x + r) + " " + f1(y1) + "Q" + f1(x) + " " + f1(y1) + " " + f1(x) + " " + f1(y1 - r);
    if (edge === "left") d += tailV(bpos, x, -1);
    d += "L" + f1(x) + " " + f1(y + r) + "Q" + f1(x) + " " + f1(y) + " " + f1(x + r) + " " + f1(y) + "Z";
    return d;
  }
  // points evenly spaced on a stadium (pill) outline, clockwise from the top-left, with outward normals
  function stadiumPts(x, y, w, h, n) {
    var r = h / 2, straight = Math.max(0, w - h), per = 2 * straight + 2 * PI * r, out = [];
    for (var i = 0; i < n; i++) {
      var sd = (per * i) / n, px, py, nx, ny;
      if (sd < straight) { px = x + r + sd; py = y; nx = 0; ny = -1; }
      else if (sd < straight + PI * r) { var an = -PI / 2 + (sd - straight) / r; px = x + r + straight + Math.cos(an) * r; py = y + r + Math.sin(an) * r; nx = Math.cos(an); ny = Math.sin(an); }
      else if (sd < 2 * straight + PI * r) { px = x + r + straight - (sd - straight - PI * r); py = y + h; nx = 0; ny = 1; }
      else { var an2 = PI / 2 + (sd - 2 * straight - PI * r) / r; px = x + r + Math.cos(an2) * r; py = y + r + Math.sin(an2) * r; nx = Math.cos(an2); ny = Math.sin(an2); }
      out.push([px, py, nx, ny]);
    }
    return out;
  }
  function thoughtD(x, y, w, h, tip, base) {
    var m = u(10), pts = stadiumPts(x - m, y - m, w + 2 * m, h + 2 * m, Math.max(9, Math.round((2 * w + 2 * h) / u(78)))), d = "";
    pts.forEach(function (p, i) {
      var q = pts[(i + 1) % pts.length], dx = q[0] - p[0], dy = q[1] - p[1], len = Math.sqrt(dx * dx + dy * dy);
      d += (i ? "" : "M" + f1(p[0]) + " " + f1(p[1])) + "A" + f1(len * 0.56) + " " + f1(len * 0.56) + " 0 0 1 " + f1(q[0]) + " " + f1(q[1]);
    });
    d += "Z";
    for (var k = 0; k < 3; k++) {
      var kk = (k + 1) / 4, cx = lerp(base[0], tip[0], kk), cy = lerp(base[1], tip[1], kk), rr = u(17 - k * 4.5);
      d += "M" + f1(cx - rr) + " " + f1(cy) + "a" + f1(rr) + " " + f1(rr) + " 0 1 0 " + f1(rr * 2) + " 0a" + f1(rr) + " " + f1(rr) + " 0 1 0 " + f1(-rr * 2) + " 0Z";
    }
    return d;
  }
  function shoutD(x, y, w, h, tip) {
    var m = u(14), pts = stadiumPts(x - m, y - m, w + 2 * m, h + 2 * m, 2 * Math.max(7, Math.round((2 * w + 2 * h) / u(110)))), best = 0, bd = 1e9, d = "";
    pts.forEach(function (p, i) { if (i % 2) return; var dd = (p[0] - tip[0]) * (p[0] - tip[0]) + (p[1] - tip[1]) * (p[1] - tip[1]); if (dd < bd) { bd = dd; best = i; } });
    pts.forEach(function (p, i) {
      var out = i % 2 ? -u(4) : u(22) * (0.75 + 0.5 * hash(i * 3.7)), px = p[0] + p[2] * out, py = p[1] + p[3] * out;
      if (i === best) { px = tip[0]; py = tip[1]; }
      d += (i ? "L" : "M") + f1(px) + " " + f1(py);
    });
    return d + "Z";
  }

  // ------------------------- speech, thought and shout bubbles -------------------------
  function bubble(actor, text, from, to, o) {
    var s = ensure();
    o = obj(o);
    if (!actor || !actor.__actor) { V.error("[cartoon] S.bubble needs an actor"); return null; }
    var kind = o.kind === "thought" || o.kind === "shout" ? o.kind : "speech";
    var f0 = tc0(from == null ? 0.2 : from), t1 = to == null ? D - 0.15 : tc0(to);
    if (t1 < f0 + 0.4) t1 = Math.min(D, f0 + 0.4);
    var Pt = s.portrait, size = u(num(o.size, Pt ? 50 : 42)), maxW = u(num(o.maxWidth, Pt ? 800 : 640));
    var pad = u(kind === "thought" ? 30 : 26), icon = propKey(o.icon), iconW = icon ? size * 1.5 : 0, ig = icon ? u(14) : 0;
    var lay = layoutRich(text, { size: size, maxWidth: maxW - pad * 2 - iconW - ig, maxLines: num(o.maxLines, 3), minSize: size * 0.62, weight: 800, lh: 1.12 });
    var bw = lay.w + pad * 2 + iconW + ig, bh = Math.max(lay.h, iconW) + pad * 1.25;
    var el = div("ct-bubble ct-b-" + kind, s.overlay);
    el.style.width = f1(bw) + "px"; el.style.height = f1(bh) + "px";
    if (icon) { var ic = div("ct-bicon", el); ic.innerHTML = propIcon(icon, iconW); ic.style.left = f1(pad) + "px"; ic.style.top = f1((bh - iconW) / 2) + "px"; }
    var tx = div("ct-btext", el);
    tx.style.left = f1(pad + iconW + ig) + "px"; tx.style.top = f1((bh - lay.h) / 2) + "px"; tx.style.width = f1(lay.w + 2) + "px";
    var spans = fillRich(tx, lay, "ct-w");
    var path = svg("path", { class: "ct-bshape ct-bs-" + kind, fill: kind === "shout" ? "#FFE066" : "#FFFFFF", stroke: INK, "stroke-width": f2(u(5)), "stroke-linejoin": "round" }, s.bubG);
    // karaoke timing
    var ln = findLines([text], Math.max(0, f0 - 0.6))[0], times = [];
    var useFound = ln.found && ln.start <= t1 && ln.end >= f0 - 0.6;
    if (useFound) times = ln.times;
    else for (var i = 0; i < spans.length; i++) times.push(lerp(f0 + 0.15, Math.max(f0 + 0.3, t1 - 0.5), i / Math.max(1, spans.length)));
    spans.forEach(function (sp, i) { sp.t = times[Math.min(times.length - 1, i)]; });
    if (kind !== "thought" && o.talk !== false) actor.say(useFound ? ln.start : f0 + 0.1, useFound ? ln.end : t1 - 0.3, plain(text));
    var b = { a: actor, s: s, text: plain(text), kind: kind, from: f0, to: t1, el: el, path: path, w: bw, h: bh, spans: spans, side: o.side, hold: o.hold, karaoke: o.karaoke !== false };
    s.bubbles.push(b);
    s.late.push(function () { placeBubble(b); });
    s.anims.push(function (t) { updBubble(b, t); });
    return b;
  }
  function placeBubble(b) {
    var s = b.s, tm = Math.min(b.to, b.from + 0.35), c = camAt(s, tm), r = rigAt(b.a, tm), sa = safe();
    var top = toScr(s, c, r.topW[0], r.topW[1]), hd = toScr(s, c, r.hw[0], r.hw[1]);
    var gap = u(40);
    b.mode = top[1] - gap - b.h >= sa.y0 - u(4) ? "above" : "side";
    // horizontal preference: away from the nearest other actor, else toward the frame centre
    var other = null, od = 1e9;
    s.actors.forEach(function (o2) { if (o2 === b.a || o2.vis.val(tm) < 0.5) return; var d = Math.abs(o2.xAt(tm) - r.x); if (d < od) { od = d; other = o2; } });
    var dir = other ? (other.xAt(tm) > r.x ? -1 : 1) : hd[0] < W / 2 ? 1 : -1;
    if (b.side === "left") dir = -1; else if (b.side === "right") dir = 1;
    b.dir = dir;
    if (b.mode === "side") {
      var room = dir > 0 ? sa.x1 - hd[0] : hd[0] - sa.x0;
      if (room < b.w + u(120)) b.dir = -dir;
    }
  }
  function bubbleRect(b, t) {
    var s = b.s, c = s.camNow || camAt(s, t), r = rigAt(b.a, t), sa = safe();
    var top = toScr(s, c, r.topW[0], r.topW[1]), hd = toScr(s, c, r.hw[0], r.hw[1]), hr = b.a.dm.HR * b.a.us * c.z * s.k;
    var mo = anchorsOf(b.a, r).mouth, ms = toScr(s, c, mo[0], mo[1]);
    var x, y, edge;
    if (b.mode === "above") {
      x = hd[0] - b.w / 2 + b.dir * b.w * 0.18;
      y = top[1] - u(40) - b.h;
      edge = "bottom";
    } else {
      x = b.dir > 0 ? hd[0] + hr * 1.5 : hd[0] - hr * 1.5 - b.w;
      y = hd[1] - b.h * 0.75;
      edge = b.dir > 0 ? "left" : "right";
    }
    x = clamp(x, sa.x0, Math.max(sa.x0, sa.x1 - b.w));
    y = clamp(y, sa.y0, Math.max(sa.y0, sa.y1 - b.h));
    // keep clear of other heads
    s.actors.forEach(function (o2) {
      if (o2 === b.a || o2.vis.val(t) < 0.5) return;
      var hb = headBox(o2, t), p0 = toScr(s, c, hb.x, hb.y), p1 = toScr(s, c, hb.x + hb.w, hb.y + hb.h);
      if (x < p1[0] && x + b.w > p0[0] && y < p1[1] && y + b.h > p0[1]) {
        var nx = b.dir > 0 ? p1[0] + u(12) : p0[0] - u(12) - b.w;
        if (nx >= sa.x0 && nx + b.w <= sa.x1) x = nx; else y = Math.max(sa.y0, p0[1] - u(12) - b.h);
      }
    });
    var tip = [lerp(ms[0], hd[0], 0.15), ms[1]], bpos;
    var tipStop = hr * 1.25;
    if (edge === "bottom") {
      tip = [clamp(hd[0] + b.dir * hr * 0.35, x + u(30), x + b.w - u(30)), Math.max(y + b.h + u(26), top[1] - u(8))];
      if (tip[1] > hd[1] - hr * 0.6) tip[1] = Math.max(y + b.h + u(18), hd[1] - hr * 0.6);
      bpos = clamp(lerp(x + b.w / 2, tip[0], 0.6), x + u(40), x + b.w - u(40));
    } else {
      var tx = edge === "left" ? hd[0] + hr * 1.05 : hd[0] - hr * 1.05;
      tip = [tx, clamp(ms[1], y + u(20), y + b.h + u(70))];
      var dxs = edge === "left" ? x - tip[0] : tip[0] - (x + b.w);
      if (dxs < u(18)) tip[0] = edge === "left" ? x - u(18) : x + b.w + u(18);
      bpos = clamp(lerp(y + b.h / 2, tip[1], 0.5), y + u(30), y + b.h - u(30));
    }
    return { x: x, y: y, edge: edge, tip: tip, bpos: bpos, stop: tipStop };
  }
  function updBubble(b, t) {
    var on = t >= b.from && t < b.to + 0.12 && b.a.vis.val(t) > 0.5;
    showEl(b.el, on); showEl(b.path, on);
    if (!on) return;
    var g = bubbleRect(b, t), k = popK(t, b.from, 0.3) * (t > b.to ? 1 - smooth((t - b.to) / 0.12) : 1);
    var bw = u(b.kind === "shout" ? 34 : 30), d;
    if (b.kind === "thought") d = thoughtD(g.x, g.y, b.w, b.h, g.tip, g.edge === "bottom" ? [g.bpos, g.y + b.h] : [g.edge === "left" ? g.x : g.x + b.w, g.bpos]);
    else if (b.kind === "shout") d = shoutD(g.x, g.y, b.w, b.h, g.tip);
    else d = speechD(g.x, g.y, b.w, b.h, u(36), g.edge, g.bpos, bw, g.tip);
    var ox = g.edge === "bottom" ? g.bpos : g.edge === "left" ? g.x : g.x + b.w, oy = g.edge === "bottom" ? g.y + b.h : g.bpos;
    setA(b.path, "d", d);
    setA(b.path, "transform", "translate(" + f1(ox) + " " + f1(oy) + ") scale(" + f2(k) + ") translate(" + f1(-ox) + " " + f1(-oy) + ")");
    setS(b.el, "transform", "translate(" + f1(g.x) + "px," + f1(g.y) + "px) scale(" + f2(k) + ")");
    setS(b.el, "transformOrigin", f1(ox - g.x) + "px " + f1(oy - g.y) + "px");
    b.spans.forEach(function (sp) { var said = !b.karaoke || t >= sp.t - 0.04; if (sp._s !== said) { sp._s = said; sp.el.className = "ct-w" + (sp.em ? " ct-em" : "") + (said ? " ct-on" : ""); } });
    b.rect = { x: g.x, y: g.y, w: b.w, h: b.h };
  }

  // ------------------------- stickers -------------------------
  var STK = { sm: [40, 560], md: [58, 760], lg: [78, 900], xl: [108, 1080] };
  function sticker(text, at, o) {
    var s = ensure();
    o = obj(o);
    var sz = STK[o.size] ? o.size : "lg", fs = u(STK[sz][0]) * num(o.scale, 1), sa = safe();
    var maxW = Math.min(sa.w, u(num(o.maxWidth, STK[sz][1])));
    var icon = propKey(o.icon), iconS = icon ? fs * (sz === "xl" ? 1.1 : 1.4) : 0, pad = fs * 0.42, ig = icon ? fs * 0.3 : 0;
    var lay = layoutRich(text, { size: fs, maxWidth: maxW - pad * 2 - iconS - ig, maxLines: num(o.maxLines, sz === "xl" ? 2 : 3), minSize: fs * 0.55, weight: 900, lh: 1.06 });
    var subLay = null, subFs = fs * 0.46, pts = arr(o.points).map(str).filter(Boolean).slice(0, 4);
    if (o.sub) subLay = layoutRich(o.sub, { size: Math.max(u(28), subFs), maxWidth: maxW - pad * 2, maxLines: 2, weight: 800, lh: 1.12 });
    var ptLays = pts.map(function (p_) { return layoutRich(p_, { size: Math.max(u(28), fs * 0.48), maxWidth: maxW - pad * 2 - u(30), maxLines: 1, weight: 800, lh: 1.15 }); });
    var innerW = Math.max(lay.w + iconS + ig, subLay ? subLay.w : 0, ptLays.reduce(function (m_, l_) { return Math.max(m_, l_.w + u(34)); }, 0));
    var cw = innerW + pad * 2, mainH = Math.max(lay.h, iconS), ch = mainH + pad * 1.3 + (subLay ? subLay.h + u(10) : 0) + ptLays.reduce(function (m_, l_) { return m_ + l_.h + u(8); }, 0) + (ptLays.length ? u(10) : 0);
    var kfs = Math.max(u(26), fs * 0.36), kh = o.kicker ? kfs * 1.7 : 0;
    var x = num(o.x, 0.5) * W - cw / 2, y = num(o.y, 0.2) * H - (ch + kh * 0.7) / 2;
    x = clamp(x, sa.x0 + u(8), Math.max(sa.x0, sa.x1 - cw - u(8)));
    y = clamp(y, sa.y0 + kh * 0.7 + u(4), Math.max(sa.y0, sa.y1 - ch - u(10)));
    var bg = isHex(o.color) ? hex6(o.color) : "#FFFFFF", dark = lum(bg) < 0.55;
    var wrap = div("ct-sticker", s.overlay);
    wrap.style.left = f1(x) + "px"; wrap.style.top = f1(y) + "px"; wrap.style.width = f1(cw) + "px"; wrap.style.height = f1(ch) + "px";
    var card = div("ct-card", wrap);
    card.style.background = bg; card.style.color = dark ? "#FFFFFF" : INK;
    card.style.setProperty("--em", dark ? "#FFE066" : bg.toUpperCase() === ACC ? INK : ACC);
    if (icon) { var ic = div("ct-sicon", card); ic.innerHTML = propIcon(icon, iconS); ic.style.left = f1(pad) + "px"; ic.style.top = f1(pad * 0.65 + (mainH - iconS) / 2) + "px"; }
    var tx = div("ct-stext", card);
    tx.style.left = f1(pad + iconS + ig) + "px"; tx.style.top = f1(pad * 0.65 + (mainH - lay.h) / 2) + "px"; tx.style.width = f1(lay.w + 4) + "px";
    fillRich(tx, lay, "ct-sw");
    var yy = pad * 0.65 + mainH + u(10);
    if (subLay) { var sb = div("ct-ssub", card); sb.style.left = f1(pad) + "px"; sb.style.top = f1(yy) + "px"; sb.style.width = f1(subLay.w + 4) + "px"; fillRich(sb, subLay, "ct-sw"); yy += subLay.h + u(10); }
    var ptEls = [];
    ptLays.forEach(function (pl) {
      var pe = div("ct-spoint", card);
      pe.style.left = f1(pad) + "px"; pe.style.top = f1(yy) + "px"; pe.style.width = f1(pl.w + u(36)) + "px";
      var dot = div("ct-sdot", pe); dot.style.width = dot.style.height = f1(pl.size * 0.5) + "px"; dot.style.top = f1(pl.size * 0.3) + "px";
      var pt_ = div("ct-sptext", pe); pt_.style.left = f1(u(32)) + "px"; fillRich(pt_, pl, "ct-sw");
      ptEls.push(pe);
      yy += pl.h + u(8);
    });
    var kick = null;
    if (o.kicker) {
      kick = div("ct-kicker", wrap, plain(o.kicker));
      kick.style.fontSize = f1(kfs) + "px"; kick.style.height = f1(kfs * 1.45) + "px"; kick.style.lineHeight = f1(kfs * 1.45) + "px";
      kick.style.top = f1(-kfs * 1.05) + "px"; kick.style.left = f1(pad * 0.6) + "px";
      kick.style.background = bg.toUpperCase() === ACC ? INK : ACC;
    }
    var t0 = tc0(at == null ? 0.3 : at), until = o.until == null ? null : num(o.until, null), rot = num(o.rot, -2.5);
    var stk = { el: wrap, card: card, x: x, y: y - kh * 0.7, w: cw, h: ch + kh * 0.7, at: t0, until: until, label: plain(text), rot: rot, dims: [], bumps: [], pts: ptEls, ptTimes: [] };
    stk.dim = function (at2, op) { stk.dims.push([tc0(at2), num(op, 0.5)]); return stk; };
    stk.bump = function (at2) { stk.bumps.push(tc0(at2)); return stk; };
    stk.pointsAt = function (times) { stk.ptTimes = arr(times); return stk; };
    s.stickers.push(stk);
    s.anims.push(function (t) {
      var on = t >= t0 && (until == null || t < until + 0.22);
      showEl(wrap, on);
      if (!on) return;
      var p = popK(t, t0, 0.42), out = until != null && t > until ? 1 - smooth((t - until) / 0.22) : 1, bp = 0;
      stk.bumps.forEach(function (b_) { if (t >= b_ && t < b_ + 0.4) bp = Math.max(bp, Math.sin(((t - b_) / 0.4) * PI) * 0.08); });
      var op = 1;
      stk.dims.forEach(function (dd) { if (t >= dd[0]) op = lerp(1, dd[1], smooth((t - dd[0]) / 0.35)); });
      setS(wrap, "transform", "scale(" + f2((0.25 + 0.75 * p) * out * (1 + bp)) + ") rotate(" + f2(rot - 9 * (1 - Math.min(1, p))) + "deg)");
      setS(wrap, "opacity", f2(Math.min(1, p * 3) * out * op));
      ptEls.forEach(function (pe, i) { var tp = stk.ptTimes[i]; var q = tp == null ? 1 : popK(t, tp, 0.3); setS(pe, "transform", "scale(" + f2(q) + ")"); setS(pe, "opacity", f2(Math.min(1, q * 2))); });
    });
    return stk;
  }

  // ------------------------- bursts, motion lines, captions, confetti -------------------------
  function burst(x, y, at, o) {
    var s = ensure();
    o = obj(o);
    var n = Math.round(num(o.count, 12)), r = num(o.r, 120), col = o.color || "#FFC93C", wd = num(o.width, 7), t0 = tc0(at);
    var g = svg("g", { fill: "none", stroke: col, "stroke-width": wd, "stroke-linecap": "round" }, s.L.fx), lines = [];
    for (var i = 0; i < n; i++) lines.push({ el: svg("path", null, g), a: (i / n) * 2 * PI + hash(i + t0) * 0.3, k: 0.8 + 0.4 * hash(i * 7.1 + t0) });
    s.anims.push(function (t) {
      var on = t >= t0 && t < t0 + 0.6;
      showEl(g, on);
      if (!on) return;
      var p = (t - t0) / 0.6, e = 1 - Math.pow(1 - p, 3);
      lines.forEach(function (l) {
        var r0 = r * (0.45 + 0.55 * e) * l.k, r1 = r * (0.62 + 0.62 * e) * l.k;
        setA(l.el, "d", "M" + f1(x + Math.cos(l.a) * r0) + " " + f1(y + Math.sin(l.a) * r0) + "L" + f1(x + Math.cos(l.a) * r1) + " " + f1(y + Math.sin(l.a) * r1));
      });
      setA(g, "opacity", f2(1 - p * p));
      setA(g, "stroke-width", f2(wd * (1 - p * 0.6)));
    });
  }
  function motionLines(a, from, to) {
    var s = ensure();
    if (!a || !a.__actor) return;
    var f0 = tc0(from), t1 = to == null ? D : tc0(to), g = svg("g", { fill: "none", stroke: "#FFFFFF", "stroke-linecap": "round", opacity: 0.85 }, s.L.chars), ls = [];
    s.L.chars.insertBefore(g, a.el.g);
    for (var i = 0; i < 3; i++) ls.push(svg("path", { "stroke-width": 7 - i }, g));
    s.anims.push(function (t) {
      var on = t >= f0 && t <= t1 && a.vis.val(t) > 0.5;
      var v = (a.xAt(t) - a.xAt(Math.max(0, t - 0.08))) / 0.08, sp = Math.min(1, Math.abs(v) / 500);
      showEl(g, on && sp > 0.05);
      if (!on || sp <= 0.05) return;
      var x = a.xAt(t), y = a.pos.val(t).y, dir = v > 0 ? -1 : 1, us = a.us;
      ls.forEach(function (l, i) {
        var yy = y - us * (34 + i * 16), x0 = x + dir * us * (18 + i * 4), len = us * (24 + 26 * sp) * (1 - i * 0.15);
        setA(l, "d", "M" + f1(x0) + " " + f1(yy) + "L" + f1(x0 + dir * len) + " " + f1(yy));
      });
      setA(g, "opacity", f2(0.85 * sp));
    });
  }
  function captions(o) {
    var s = ensure();
    o = obj(o);
    var ws = (V.words || []).slice(), chunk = clamp(Math.round(num(o.chunk, 5)), 2, 10), sa = safe();
    if (!ws.length) {
      var toks = str(o.text || V.narration).split(/\s+/).filter(Boolean), n = toks.length;
      ws = toks.map(function (w, i) { var a0 = 0.3 + ((endLimit() - 0.3) * i) / Math.max(1, n); return { word: w, start: a0, end: a0 + 0.3 }; });
    }
    if (!ws.length) return null;
    var top = num(o.top, s.portrait ? 0.71 : 0.84) * H, fs = u(s.portrait ? 50 : 44);
    var box = div("ct-captions", s.overlay);
    box.style.top = f1(Math.min(top, sa.y1 - fs * 2.6)) + "px"; box.style.left = f1(sa.x0) + "px"; box.style.width = f1(sa.w) + "px";
    var groups = [];
    for (var i = 0; i < ws.length; i += chunk) groups.push(ws.slice(i, i + chunk));
    var els = groups.map(function (gw, gi) {
      var line = div("ct-cap", box);
      line.style.fontSize = f1(fs) + "px";
      var spans = gw.map(function (w, k) { if (k) line.appendChild(doc.createTextNode(" ")); var sp = doc.createElement("span"); sp.textContent = w.word; line.appendChild(sp); return { el: sp, t: w.start, e: w.end }; });
      return { el: line, t0: gw[0].start - 0.1, t1: groups[gi + 1] ? groups[gi + 1][0].start - 0.1 : Math.min(D, gw[gw.length - 1].end + 0.8), spans: spans };
    });
    s.capBox = { el: box, groups: els, fs: fs };
    s.anims.push(function (t) {
      els.forEach(function (g) {
        var on = t >= g.t0 && t < g.t1;
        showEl(g.el, on);
        if (!on) return;
        g.spans.forEach(function (sp) { var c = t >= sp.t && t < sp.e + 0.05 ? "ct-now" : t >= sp.t ? "ct-said" : ""; if (sp._c !== c) { sp._c = c; sp.el.className = c; } });
      });
    });
    return s.capBox;
  }
  function confetti(at, o) {
    var s = ensure();
    o = obj(o);
    var t0 = tc0(at), n = Math.round(num(o.count, 34)), rnd = V.makeRand(77 + Math.round(t0 * 100)), pieces = [];
    var g = svg("g", null, s.bub), cols = ["#FF7A59", "#FFC93C", "#2BB3A3", "#7B6FD0", "#FF9EB5", "#5BB8F5"];
    for (var i = 0; i < n; i++) {
      var pw = u(10 + rnd() * 10), el_ = svg("rect", { x: -pw / 2, y: -pw * 0.3, width: pw, height: pw * 0.6, rx: u(2), fill: cols[i % cols.length] }, g);
      pieces.push({ el: el_, x: W * (0.1 + rnd() * 0.8), vy: H * (0.18 + rnd() * 0.22), vx: (rnd() - 0.5) * W * 0.12, y0: -u(40) - rnd() * H * 0.3, rot: rnd() * 360, vr: (rnd() - 0.5) * 600, wob: rnd() * 6 });
    }
    s.anims.push(function (t) {
      var on = t >= t0;
      showEl(g, on);
      if (!on) return;
      var lt = t - t0;
      pieces.forEach(function (p) {
        var y = p.y0 + p.vy * lt, x = p.x + p.vx * lt + Math.sin(lt * 3 + p.wob) * u(18);
        setA(p.el, "transform", "translate(" + f1(x) + " " + f1(y) + ") rotate(" + f1(p.rot + p.vr * lt) + ")");
      });
    });
  }

  // ------------------------- props -------------------------
  function prop(name, o) {
    var s = ensure();
    o = obj(o);
    var k = propKey(name) || "star", size = num(o.size, 1.2) * 80, x = num(o.x, s.Ww / 2), y = num(o.y, s.G - 200);
    var t0 = o.at == null ? 0 : tc0(o.at), until = o.until == null ? null : num(o.until, null);
    var g = svg("g", { class: "ct-prop" }, o.front ? s.L.front : s.L.props), inner = svg("g", null, g);
    inner.innerHTML = '<g transform="translate(-50 -50)">' + PROPS[k] + "</g>";
    var pr = { g: g, name: k, x: x, y: y, w: size, h: size, at: t0, until: until, label: k };
    pr.moveTo = function (nx, ny, at2, dur) { pr.moves = pr.moves || new Tr({ x: x, y: y }); pr.moves.to({ x: num(nx, x), y: num(ny, y) }, tc0(at2), num(dur, 0.6), "inOutCubic"); return pr; };
    s.props.push(pr);
    s.anims.push(function (t) {
      var on = t >= t0 && (until == null || t < until + 0.2);
      showEl(g, on);
      if (!on) return;
      var p = t0 > 0.01 ? popK(t, t0, 0.36) : 1, out = until != null && t > until ? 1 - smooth((t - until) / 0.2) : 1;
      var q = pr.moves ? pr.moves.val(t) : { x: x, y: y }, bob = o.float ? Math.sin((t - t0) * 2.4) * size * 0.06 : 0, spin = o.spin ? (t - t0) * (o.spin === true ? 40 : num(o.spin, 40)) : 0;
      pr.cx = q.x; pr.cy = q.y + bob;
      setA(g, "transform", "translate(" + f1(q.x) + " " + f1(q.y + bob) + ") scale(" + f2((size / 100) * p * out) + ")");
      setA(inner, "transform", spin ? "rotate(" + f1(spin) + ")" : "");
    });
    return pr;
  }

  // ------------------------- boards -------------------------
  var BOARD_INK = { whiteboard: [INK, ACC, "#6E6482"], screen: ["#FFFFFF", "#5CE1E6", "#B9C7E8"], chalk: ["#F4F1E6", "#FFD166", "#CFE3D6"] };
  var BAR_COLS = { whiteboard: [ACC, "#2BB3A3", "#FFC93C", "#7B6FD0", "#5BB8F5", "#6CC46A"], screen: ["#5CE1E6", "#FF7A59", "#FFC93C", "#B98AF0", "#6CC46A", "#FF9EB5"], chalk: ["#FFD166", "#F4F1E6", "#FF9F80", "#9EE6C4", "#9FC9FF", "#FFB3C7"] };
  function board(o) {
    var s = ensure();
    o = obj(o);
    var def = s.loc === "classroom" ? "chalk" : s.loc === "office" || s.loc === "lab" || s.loc === "space" ? "screen" : "whiteboard";
    var kind = BOARD_INK[o.kind] ? o.kind : def, Pt = s.portrait;
    var w = num(o.w, Pt ? s.Ww - 70 : Math.min(860, s.Ww * 0.5)), h = num(o.h, Pt ? 300 : 470);
    var x = num(o.x, Pt ? s.Ww / 2 : s.Ww * 0.62), y = num(o.y, Pt ? 150 + h / 2 : s.G - 150 - h / 2);
    var t0 = o.at == null ? 0.25 : tc0(o.at), ink = BOARD_INK[kind];
    var wrap = div("ct-board ct-bk-" + kind, s.html);
    wrap.style.left = f1(x - w / 2) + "px"; wrap.style.top = f1(y - h / 2) + "px"; wrap.style.width = f1(w) + "px"; wrap.style.height = f1(h) + "px";
    var legs = s.G - (y + h / 2);
    if (legs > 10 && o.legs !== false) {
      if (kind === "screen") { var pole = div("ct-bpole", wrap); pole.style.height = f1(legs) + "px"; }
      else { var l1 = div("ct-bleg", wrap), l2 = div("ct-bleg", wrap); l1.style.height = l2.style.height = f1(legs + 10) + "px"; l1.style.left = "14%"; l2.style.right = "14%"; }
    }
    var face = div("ct-bface", wrap), fr = kind === "screen" ? 16 : 14;
    var titleH = 0, B = { el: wrap, face: face, x: x, y: y, w: w, h: h, kind: kind, at: t0, label: plain(o.title) || "board", ink: ink, targets: [] };
    if (o.title) {
      var tl = layoutRich(o.title, { size: Math.min(60, h * 0.125), maxWidth: w - 2 * fr - 40, maxLines: 1, weight: 900, minSize: 22 });
      var te = div("ct-btitle", face);
      te.style.top = f1(fr * 0.5) + "px"; te.style.left = "0px"; te.style.width = f1(w - 2 * fr) + "px"; te.style.color = ink[0]; te.style.setProperty("--em", ink[1]);
      fillRich(te, tl, "ct-bw");
      titleH = tl.h + fr * 0.6 + 10;
      var ul = div("ct-bul", face); ul.style.top = f1(titleH - 4) + "px"; ul.style.left = f1((w - 2 * fr) / 2 - Math.min(tl.w, w * 0.5) / 2) + "px"; ul.style.width = f1(Math.min(tl.w, w * 0.5)) + "px"; ul.style.background = ink[1];
    }
    B.area = { x: 22, y: titleH + 18, w: w - 2 * fr - 44, h: h - 2 * fr - titleH - 30 };
    B.toWorld = function (lx, ly) { return { x: x - w / 2 + fr + lx, y: y - h / 2 + fr + ly }; };
    B.items = [];
    function popIn(el_, at2, kindp) { B.items.push({ el: el_, at: tc0(at2), kind: kindp || "pop" }); }
    B.list = function (items, times) {
      items = arr(items).map(str).filter(Boolean).slice(0, 6);
      var n = items.length || 1, A = B.area, rowH = Math.min(A.h / n, 116), fs = Math.min(50, rowH * 0.46, A.w * 0.075), tms = arr(times), y0b = A.y + (A.h - rowH * n) / 2;
      items.forEach(function (it, i) {
        var row = div("ct-brow", face);
        row.style.left = f1(A.x) + "px"; row.style.top = f1(y0b + rowH * i) + "px"; row.style.width = f1(A.w) + "px"; row.style.height = f1(rowH) + "px";
        var badge = div("ct-bbadge", row, String(i + 1));
        var bs = fs * 1.25;
        badge.style.width = badge.style.height = f1(bs) + "px"; badge.style.fontSize = f1(fs * 0.78) + "px"; badge.style.lineHeight = f1(bs) + "px"; badge.style.top = f1((rowH - bs) / 2) + "px";
        badge.style.background = BAR_COLS[kind][i % 6]; badge.style.color = kind === "screen" || kind === "whiteboard" ? (i % 6 === 1 && kind === "screen" ? "#FFFFFF" : INK) : INK;
        var lay = layoutRich(it, { size: fs, maxWidth: A.w - bs - 24, maxLines: 2, minSize: fs * 0.6, weight: 800 });
        var te = div("ct-btxt", row);
        te.style.left = f1(bs + 22) + "px"; te.style.top = f1((rowH - lay.h) / 2) + "px"; te.style.width = f1(lay.w + 4) + "px"; te.style.color = ink[0]; te.style.setProperty("--em", ink[1]);
        fillRich(te, lay, "ct-bw");
        popIn(row, tms[i] != null ? tms[i] : t0 + 0.4 + i * 0.6, "slide");
        B.targets[i] = B.toWorld(A.x + bs * 0.5, y0b + rowH * (i + 0.5));
      });
      return B;
    };
    B.bars = function (data, times) {
      data = arr(data).map(obj).slice(0, 6);
      var n = data.length || 1, A = B.area, max = 0, tms = arr(times);
      data.forEach(function (d) { max = Math.max(max, Math.abs(num(d.value, 0))); });
      max = max || 1;
      var slot = A.w / n, bw_ = Math.min(slot * 0.58, 120), labFs = Math.min(30, slot * 0.2, A.h * 0.09), valFs = Math.min(38, slot * 0.26, A.h * 0.11);
      var base = A.y + A.h - labFs * 1.6, top = A.y + valFs * 1.5, hmax = base - top;
      var axis = div("ct-baxis", face); axis.style.left = f1(A.x - 6) + "px"; axis.style.top = f1(base) + "px"; axis.style.width = f1(A.w + 12) + "px"; axis.style.background = ink[2];
      data.forEach(function (d, i) {
        var v = Math.abs(num(d.value, 0)), bh = Math.max(6, (hmax * v) / max), cx = A.x + slot * (i + 0.5);
        var bar = div("ct-bbar", face);
        bar.style.left = f1(cx - bw_ / 2) + "px"; bar.style.top = f1(base - bh) + "px"; bar.style.width = f1(bw_) + "px"; bar.style.height = f1(bh) + "px";
        bar.style.background = isHex(d.color) ? hex6(d.color) : BAR_COLS[kind][i % 6];
        var val = div("ct-bval", face, str(d.display) || V.format(v, v % 1 ? 1 : 0));
        val.style.left = f1(cx - slot / 2) + "px"; val.style.width = f1(slot) + "px"; val.style.top = f1(base - bh - valFs * 1.3) + "px"; val.style.fontSize = f1(valFs) + "px"; val.style.color = ink[0];
        var lab = layoutRich(str(d.label) || "", { size: labFs, maxWidth: slot - 6, maxLines: 1, minSize: labFs * 0.6, weight: 800 });
        var lb = div("ct-blab", face); lb.style.left = f1(cx - slot / 2) + "px"; lb.style.width = f1(slot) + "px"; lb.style.top = f1(base + labFs * 0.3) + "px"; lb.style.color = ink[0];
        fillRich(lb, lab, "ct-bw");
        var tt = tms[i] != null ? tms[i] : t0 + 0.4 + i * 0.5;
        popIn(bar, tt, "grow"); popIn(val, tt + 0.35, "pop"); popIn(lb, tt - 0.05, "pop");
        B.targets[i] = B.toWorld(cx, base - bh * 0.6);
      });
      return B;
    };
    B.line = function (points, at2, caption) {
      var ps = arr(points).map(function (v) { return num(v, 0); }).slice(0, 12);
      if (ps.length < 2) ps = [1, 2, 3];
      var A = B.area, capH = caption ? Math.min(50, A.h * 0.17) * 1.5 : 0, mn = Math.min.apply(null, ps), mx = Math.max.apply(null, ps), rg = mx - mn || 1;
      var ph = A.h - capH - 20, sv = svg("svg", { class: "ct-bline", width: f1(A.w), height: f1(ph), viewBox: "0 0 " + f1(A.w) + " " + f1(ph) }, null);
      face.appendChild(sv);
      sv.style.left = f1(A.x) + "px"; sv.style.top = f1(A.y) + "px";
      var pts = ps.map(function (v, i) { return [12 + ((A.w - 24) * i) / (ps.length - 1), ph - 14 - ((ph - 28) * (v - mn)) / rg]; });
      var d = "", len = 0;
      pts.forEach(function (p, i) { d += (i ? "L" : "M") + f1(p[0]) + " " + f1(p[1]); if (i) len += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]); });
      svg("path", { d: "M0 " + f1(ph - 2) + "H" + f1(A.w), stroke: ink[2], "stroke-width": 4, fill: "none" }, sv);
      var pl = svg("path", { d: d, stroke: ink[1], "stroke-width": 9, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round", "stroke-dasharray": f1(len) + " " + f1(len + 10), "stroke-dashoffset": f1(len) }, sv);
      var dot = svg("circle", { cx: f1(pts[pts.length - 1][0]), cy: f1(pts[pts.length - 1][1]), r: 14, fill: ink[1], stroke: kind === "whiteboard" ? INK : "#FFFFFF", "stroke-width": 4 }, sv);
      var ta = at2 == null ? t0 + 0.4 : tc0(at2), dl = Math.min(1.4, Math.max(0.6, D * 0.18));
      B.items.push({ fn: function (t) { var p = clamp((t - ta) / dl, 0, 1), e = CE.soft(p); setA(pl, "stroke-dashoffset", f1(len * (1 - e))); setA(dot, "r", f1(14 * popK(t, ta + dl * 0.92, 0.3))); } });
      if (caption) { var cl = layoutRich(caption, { size: Math.min(50, A.h * 0.17), maxWidth: A.w, maxLines: 1, weight: 800, minSize: 20 }), ce = div("ct-bcap", face); ce.style.left = f1(A.x) + "px"; ce.style.width = f1(A.w) + "px"; ce.style.top = f1(A.y + A.h - capH + 6) + "px"; ce.style.color = ink[0]; ce.style.setProperty("--em", ink[1]); fillRich(ce, cl, "ct-bw"); popIn(ce, ta + dl * 0.6, "pop"); }
      B.targets[0] = B.toWorld(A.x + pts[pts.length - 1][0], A.y + pts[pts.length - 1][1]);
      return B;
    };
    B.big = function (text, at2, sub) {
      var A = B.area, subH = sub ? Math.min(50, A.h * 0.17) * 1.3 : 0, ta = at2 == null ? t0 + 0.4 : tc0(at2);
      var lay = layoutRich(text, { size: Math.min(A.h * 0.62 - subH * 0.5, 200), maxWidth: A.w, maxLines: 2, minSize: 30, weight: 900, lh: 1.0 });
      var be = div("ct-bbig", face); be.style.left = f1(A.x) + "px"; be.style.width = f1(A.w) + "px"; be.style.top = f1(A.y + (A.h - subH - lay.h) / 2) + "px"; be.style.color = ink[1]; be.style.setProperty("--em", ink[0]);
      var spans = fillRich(be, lay, "ct-bw");
      // count-up for a plain number like "72%" or "$1,500"
      var m = /^([^\d-]*)(-?[\d,]+(\.\d+)?)(.*)$/.exec(plain(text)), sp0 = spans.length === 1 ? spans[0] : null;
      if (m && sp0) {
        var target = parseFloat(m[2].replace(/,/g, "")), dec = m[3] ? m[3].length - 1 : 0;
        B.items.push({ fn: function (t) { var p = clamp((t - ta) / 0.8, 0, 1), v = target * CE.soft(p); var s_ = m[1] + V.format(v, dec, m[2].indexOf(",") >= 0) + m[4]; if (sp0.el.textContent !== s_) sp0.el.textContent = s_; } });
      }
      popIn(be, ta, "pop");
      if (sub) { var sl = layoutRich(sub, { size: Math.min(50, A.h * 0.17), maxWidth: A.w, maxLines: 1, weight: 800, minSize: 20 }), se = div("ct-bcap", face); se.style.left = f1(A.x) + "px"; se.style.width = f1(A.w) + "px"; se.style.top = f1(A.y + A.h - subH) + "px"; se.style.color = ink[0]; se.style.setProperty("--em", ink[1]); fillRich(se, sl, "ct-bw"); popIn(se, ta + 0.35, "pop"); }
      B.targets[0] = B.toWorld(A.x + A.w / 2, A.y + (A.h - subH) / 2);
      return B;
    };
    B.icon = function (name, caption, at2) {
      var A = B.area, capH = caption ? Math.min(50, A.h * 0.17) * 1.4 : 0, ta = at2 == null ? t0 + 0.4 : tc0(at2), isz = Math.min(A.h - capH - 10, A.w * 0.6);
      var ie = div("ct-bicon2", face); ie.innerHTML = propIcon(name, isz); ie.style.left = f1(A.x + (A.w - isz) / 2) + "px"; ie.style.top = f1(A.y + (A.h - capH - isz) / 2) + "px";
      popIn(ie, ta, "pop");
      if (caption) { var cl = layoutRich(caption, { size: Math.min(50, A.h * 0.17), maxWidth: A.w, maxLines: 1, weight: 800, minSize: 20 }), ce = div("ct-bcap", face); ce.style.left = f1(A.x) + "px"; ce.style.width = f1(A.w) + "px"; ce.style.top = f1(A.y + A.h - capH + 4) + "px"; ce.style.color = ink[0]; ce.style.setProperty("--em", ink[1]); fillRich(ce, cl, "ct-bw"); popIn(ce, ta + 0.3, "pop"); }
      B.targets[0] = B.toWorld(A.x + A.w / 2, A.y + (A.h - capH) / 2);
      return B;
    };
    B.target = function (i) { var tg = B.targets[i | 0] || B.targets[0]; return tg ? { x: tg.x, y: tg.y } : { x: x, y: y }; };
    s.boards.push(B);
    s.anims.push(function (t) {
      var on = t >= t0;
      showEl(wrap, on);
      if (!on) return;
      var p = popK(t, t0, 0.4);
      setS(wrap, "transform", "translateY(" + f1((1 - Math.min(1, p)) * 30) + "px) scale(" + f2(0.86 + 0.14 * p) + ")");
      setS(wrap, "opacity", f2(Math.min(1, p * 2.5)));
      B.items.forEach(function (it) {
        if (it.fn) { it.fn(t); return; }
        var q = popK(t, it.at, it.kind === "grow" ? 0.6 : 0.34), vis_ = t >= it.at;
        setS(it.el, "visibility", vis_ ? "visible" : "hidden");
        if (!vis_) return;
        if (it.kind === "grow") { setS(it.el, "transformOrigin", "50% 100%"); setS(it.el, "transform", "scaleY(" + f2(Math.max(0.02, CE.pose(clamp((t - it.at) / 0.6, 0, 1)))) + ")"); }
        else if (it.kind === "slide") setS(it.el, "transform", "translateX(" + f1((1 - Math.min(1, q)) * -40) + "px) scale(" + f2(0.6 + 0.4 * q) + ")");
        else setS(it.el, "transform", "scale(" + f2(q) + ")");
        setS(it.el, "opacity", f2(Math.min(1, q * 2)));
      });
    });
    return B;
  }

  // ------------------------- dialogue helpers -------------------------
  function narrate(a, from, to) { if (a && a.__actor) a.say(from == null ? 0.05 : from, to == null ? D : to); return a; }
  function dialogue(actors, lines) {
    actors = arr(actors).filter(function (x) { return x && x.__actor; });
    if (actors.length < 1) return [];
    var A = actors[0], B = actors[1] || actors[0];
    lines = arr(lines).map(obj).filter(function (l) { return str(l.text); }).slice(0, 8);
    var win = findLines(lines.map(function (l) { return l.text; })), out = [];
    lines.forEach(function (l, i) {
      var spk = l.speaker === 1 || l.speaker === "1" || (typeof l.speaker === "string" && castKey(l.speaker) === B.name && B !== A) ? 1 : l.speaker == null ? i % 2 : 0;
      var sp = spk ? B : A, ls = spk ? A : B, w = win[i];
      var start = Math.max(0.15, w.start), end = Math.max(start + 0.5, w.end);
      var next = win[i + 1] ? win[i + 1].start : null;
      var until = next != null ? Math.max(start + 0.4, Math.min(Math.max(end + 0.1, next - 0.32), next - 0.32)) : D;
      bubble(sp, l.text, start - 0.18, until, { kind: l.kind });
      if (l.expression) sp.expression(l.expression, start - 0.12);
      if (l.pose) sp.pose(l.pose, start + 0.02);
      else if (sp.poseName.key(start).v === "idle") sp.pose("talk", start - 0.05, 0.35);
      if (l.mark) sp.emote(l.mark, start + 0.25, 1.5);
      if (ls !== sp) {
        sp.lookAt(ls, start - 0.1); ls.lookAt(sp, start - 0.05);
        if (end - start > 1.2) ls.nod(start + (end - start) * 0.45);
        if (ls.poseName.key(start).v === "talk") ls.pose("idle", start, 0.4);
      }
      if (l.pose && next != null && ["talk", "explain", "idle"].indexOf(poseKey(l.pose)) < 0) sp.pose("idle", until + 0.35, 0.45);
      out.push({ start: start, end: end, until: until, speaker: sp, listener: ls, found: w.found });
    });
    return out;
  }

  // ------------------------- templates -------------------------
  var TPL = {};
  var REACT = {
    surprised: { pose: "surprised", ex: "surprised", mark: "exclaim", settle: "idle" },
    excited: { pose: "celebrate", ex: "excited", mark: "sparkle", settle: "fist-pump" },
    happy: { pose: "fist-pump", ex: "happy", mark: "heart", settle: "talk" },
    worried: { pose: "scared", ex: "worried", mark: "sweat", settle: "idle" },
    angry: { pose: "hands-hips", ex: "angry", mark: "anger", settle: "hands-hips" },
    sad: { pose: "sad", ex: "sad", mark: "tears", settle: "sad" },
    confused: { pose: "shrug", ex: "skeptical", mark: "question", settle: "think" },
    facepalm: { pose: "facepalm", ex: "worried", mark: "sweat", settle: "idle" },
  };
  function castOf(v, def) { return castKey(v) || def; }
  function narrationTitle() { return contentWords(V.narration).slice(0, 5).join(" ") || "Here we go"; }
  function wordAt(word, fallbackText, def, after) {
    var t = word ? kwFind(word, after || 0) : null;
    if (t == null && fallbackText) t = labelTime(fallbackText, null, after || 0);
    return t == null ? def : t;
  }
  // world x of a screen fraction at time t (main layer)
  function worldX(s, fx, t) { var c = camAt(s, t), m = layerM(s, c, 1); return (fx * W - m[1]) / m[0]; }
  function worldY(s, fy, t) { var c = camAt(s, t), m = layerM(s, c, 1); return (fy * H - m[2]) / m[0]; }

  TPL["narrator-talks"] = function (root, p) {
    var sc = makeScene(locKey(p.location, "living-room")), s = st, Pt = s.portrait, SQ = s.square;
    var who = castOf(p.character, "maya"), side = p.side === "right" ? "right" : "left";
    var cx = Pt ? s.Ww * 0.5 : SQ ? (side === "left" ? s.Ww * 0.3 : s.Ww * 0.7) : side === "left" ? s.Ww * 0.29 : s.Ww * 0.71;
    var a = makeActor(who, { x: cx, facing: "front", expression: p.expression || "happy", pose: "talk" });
    narrate(a);
    var title = str(p.title) || narrationTitle();
    var tK = tc(Math.max(0.6, wordAt(p.keyword, title, D * 0.3)));
    var sx = Pt ? 0.5 : side === "left" ? 0.67 : 0.33, sy = Pt ? 0.25 : SQ ? 0.3 : 0.4;
    sticker(title, tK - 0.06, { kicker: p.kicker, icon: p.prop, size: "lg", x: sx, y: sy, rot: side === "left" ? -2.5 : 2.5, maxWidth: Pt ? 920 : SQ ? 900 : 760 });
    a.pointSide = Pt ? 1 : side === "left" ? 1 : -1;
    var tp = tc(tK - 0.3), tb = tc(Math.min(tK + 1.5, endLimit() - 0.3));
    a.pose(Pt || SQ ? "point-up" : "point", tp, 0.4);
    a.lookAt({ x: worldX(s, sx, tK), y: worldY(s, sy, tK) }, tp);
    if (tb > tp + 0.8) { a.face("front", tb); a.pose("talk", tb, 0.45); a.lookAt("camera", tb); }
    a.beats(p.beats, { after: Math.min(tK + 0.2, endLimit()) });
    sc.cam.to({ x: Pt ? s.Ww / 2 : lerp(s.Ww / 2, cx, 0.4), zoom: Pt ? 1.05 : 1.07 }, 0.2, Math.max(1, D * 0.8), "inOutSine");
    sc.cam.shake(tK, 4, 0.3);
  };

  TPL.dialogue = function (root, p) {
    var sc = makeScene(locKey(p.location, "office")), s = st, Pt = s.portrait;
    var ids = arr(p.characters).map(function (c) { return castKey(c); }).filter(Boolean);
    if (!ids[0]) ids[0] = "leo";
    if (!ids[1] || ids[1] === ids[0]) ids[1] = ids[0] === "priya" ? "sam" : "priya";
    var xs = sc.slots(2, Pt ? 1 : 0.92);
    var A = makeActor(ids[0], { x: xs[0], facing: "right" }), B = makeActor(ids[1], { x: xs[1], facing: "left" });
    A.lockFace = B.lockFace = false;
    var lines = arr(p.lines).map(obj).filter(function (l) { return str(l.text); });
    if (!lines.length) lines = [{ speaker: 0, text: V.narration || "Hi there!" }];
    var win = dialogue([A, B], lines.map(function (l, i) { return Object.assign({}, l, { speaker: l.speaker == null ? i % 2 : num(l.speaker, 0) ? 1 : 0 }); }));
    var mid = s.Ww / 2;
    win.forEach(function (w, i) {
      var spx = w.speaker.x0, zx = lerp(mid, spx, Pt ? 0.25 : 0.32), z = Pt ? 1.07 : 1.1;
      if (i === 0) sc.cam.to({ x: zx, zoom: z }, 0.1, Math.max(0.4, w.start - 0.1), "inOutSine");
      else sc.cam.to({ x: zx, zoom: z }, w.start - 0.3, 0.55, "inOutCubic");
    });
    var last = win[win.length - 1];
    if (last && last.end + 0.3 < endLimit()) sc.cam.to({ x: mid, zoom: 1 }, last.end + 0.1, 0.8, "inOutSine");
    if (p.endPose && last) {
      var te = tc(last.end + 0.15), ep = poseKey(p.endPose);
      [A, B].forEach(function (x, i) { x.face("front", te + i * 0.06); x.pose(ep, te + 0.05 + i * 0.06); if (ep === "celebrate" || ep === "jump" || ep === "dance") x.expression("happy", te); });
    }
  };

  TPL["walk-and-talk"] = function (root, p) {
    var Pt = V.isPortrait, span = Pt ? 3.2 : 2.6;
    var sc = makeScene(locKey(p.location, "city-street"), { span: span }), s = st;
    var who = castOf(p.character, "sam"), comp = castKey(p.companion);
    if (comp === who) comp = null;
    var gap = Pt ? 165 : 210, x0 = s.Ww * (Pt ? 0.62 : 0.55), x1 = s.Wt - s.Ww * (Pt ? 0.38 : 0.45);
    var A = makeActor(who, { x: x0, facing: "right", expression: p.expression || "happy" });
    var B = comp ? makeActor(comp, { x: x0 - gap, facing: "right", expression: "happy" }) : null;
    var tEnd = Math.max(1.4, endLimit() - 0.5);
    A.moveTo(x1, 0.2, tEnd - 0.2);
    if (B) B.moveTo(x1 - gap, 0.28, tEnd - 0.2);
    var lines = arr(p.lines).map(str).filter(Boolean).slice(0, 5);
    if (lines.length) {
      var win = findLines(lines);
      lines.forEach(function (l, i) {
        var sp = B && i % 2 ? B : A, ls = sp === A ? B : A, w = win[i];
        var next = win[i + 1] ? win[i + 1].start : null, until = next != null ? Math.max(w.start + 0.4, next - 0.32) : D;
        bubble(sp, l, w.start - 0.18, until, { side: sp === A ? "right" : "left" });
        if (ls) { sp.lookAt(ls, w.start - 0.1); ls.lookAt(sp, w.start - 0.05); }
      });
    } else narrate(A);
    var tf = tc(tEnd + 0.15);
    A.face("front", tf); A.pose(B ? "idle" : "open-arms", tf + 0.05); A.lookAt("camera", tf);
    if (B) { B.face("front", tf + 0.08); B.pose("wave", tf + 0.12); B.lookAt("camera", tf); }
    var mx = B ? -gap / 2 : 0;
    sc.cam.set({ x: x0 + mx + (Pt ? 0 : 60), zoom: 1 });
    sc.cam.follow(A, 0.2, tEnd + 0.4, { lead: (Pt ? 10 : 70) + mx });
    if (p.caption) sticker(p.caption, 0.3, { size: "sm", x: Pt ? 0.5 : 0.22, y: Pt ? 0.17 : 0.13, icon: "map", rot: -3 });
  };

  TPL.reaction = function (root, p) {
    var sc = makeScene(locKey(p.location, "living-room")), s = st, Pt = s.portrait, SQ = s.square;
    var rv = obj(p.reveal), rtext = str(rv.text) || "Wow", rk = REACT[str(p.reaction).toLowerCase()] ? str(p.reaction).toLowerCase() : "surprised", R = REACT[rk];
    var cx = Pt ? s.Ww * 0.5 : s.Ww * (SQ ? 0.3 : 0.31);
    var a = makeActor(castOf(p.character, "leo"), { x: cx, facing: "front", expression: "neutral", pose: p.setupPose ? poseKey(p.setupPose) : "think" });
    if (!p.setupPose || poseKey(p.setupPose) === "think") a.expression("thinking", 0);
    narrate(a);
    var tR = tc(Math.max(0.9, wordAt(p.word, rtext, D * 0.5)));
    sc.cam.to({ actor: a, zoom: Pt ? 1.12 : 1.16, dx: Pt ? 0 : 80 }, 0.2, Math.max(0.5, tR - 0.4), "inOutSine");
    sc.cam.to({ x: s.Ww / 2, y: 500, zoom: 1 }, tR - 0.02, 0.28, "outCubic");
    sc.cam.shake(tR, 16, 0.5);
    a.pose(R.pose, tR - 0.04, 0.3, "snap");
    a.expression(R.ex, tR - 0.06, 0.12);
    a.emote(R.mark, tR + 0.05, 1.8);
    if (R.pose === "celebrate" || R.pose === "surprised") a.hop(tR, 10, 0.4);
    var sx = Pt ? 0.5 : 0.66, sy = Pt ? 0.25 : SQ ? 0.3 : 0.4;
    sticker(rtext, tR, { size: "xl", kicker: rv.kicker, icon: rv.prop, x: sx, y: sy, rot: -4, color: "#FFE066", maxWidth: Pt ? 960 : 820 });
    s.late.push(function () { var r = rigAt(a, tR); burst(r.hw[0], r.hw[1], tR, { r: a.dm.HR * a.us * 2.4, count: 14, color: "#FFC93C", width: 8 }); });
    var ts = tc(tR + 1.8);
    if (ts > tR + 1.2) a.pose(R.settle, ts, 0.5);
  };

  TPL["explain-with-board"] = function (root, p) {
    var sc = makeScene(locKey(p.location, "classroom"), { noBoard: true }), s = st, Pt = s.portrait, SQ = s.square;
    var mode = ["list", "bars", "line", "big", "icon"].indexOf(p.mode) >= 0 ? p.mode : arr(p.items).length ? "list" : arr(p.bars).length ? "bars" : p.big ? "big" : "list";
    var bo = Pt ? { w: s.Ww - 86, h: 284, x: s.Ww / 2, y: 138 + 142 } : SQ ? { w: s.Ww * 0.6, h: 420, x: s.Ww * 0.64, y: s.G - 150 - 210 } : { w: Math.min(900, s.Ww * 0.54), h: 480, x: s.Ww * 0.63, y: s.G - 140 - 240 };
    var B = board({ x: bo.x, y: bo.y, w: bo.w, h: bo.h, kind: p.board, title: p.title, at: 0.25 });
    var a = makeActor(castOf(p.character, "priya"), { x: Pt ? s.Ww * 0.3 : SQ ? s.Ww * 0.17 : s.Ww * 0.2, facing: "front", expression: p.expression || "happy", pose: "talk", scale: Pt ? 0.8 : 1 });
    a.pointSide = 1;
    narrate(a);
    var times = [];
    if (mode === "list") {
      var items = arr(p.items).map(str).filter(Boolean).slice(0, 5);
      if (!items.length) items = [narrationTitle()];
      var prev = 0.5;
      times = items.map(function (it) { var t = labelTime(it, null, prev); if (t != null) prev = t + 0.2; return t; });
      times = spread(times, 0.8, endLimit() - 0.6).map(function (t, i, a_) { return tc(Math.max(t, i ? a_[i - 1] + 0.5 : 0.6)); });
      B.list(items, times.map(function (t) { return t - 0.12; }));
    } else if (mode === "bars") {
      var bars = arr(p.bars).map(obj).slice(0, 6);
      if (!bars.length) bars = [{ label: "A", value: 3 }, { label: "B", value: 5 }];
      var pv = 0.5;
      times = bars.map(function (b) { var t = labelTime(str(b.label) + " " + str(b.display), null, pv); if (t != null) pv = t + 0.2; return t; });
      times = spread(times, 0.8, endLimit() - 0.8).map(function (t, i, a_) { return tc(Math.max(t, i ? a_[i - 1] + 0.35 : 0.6)); });
      B.bars(bars, times.map(function (t) { return t - 0.1; }));
    } else {
      var kt = tc(Math.max(0.7, wordAt(p.keyword, p.big || p.caption || p.title, D * 0.35)));
      times = [kt];
      if (mode === "line") B.line(p.points, kt - 0.1, p.caption);
      else if (mode === "big") B.big(str(p.big) || "100%", kt - 0.1, p.caption);
      else B.icon(p.icon || "star", p.caption, kt - 0.1);
    }
    var pointPose = Pt ? "point-up" : "point";
    times.forEach(function (t, i) {
      var tg = B.target(i), nx = times[i + 1];
      a.pose(pointPose, t - 0.2, 0.35);
      a.lookAt(tg, t - 0.2);
      if (nx == null || nx - t > 1.6) { var tb = Math.min(t + 1.1, endLimit()); if (nx == null || tb < nx - 0.4) { a.face("front", tb); a.pose("talk", tb, 0.4); a.lookAt("camera", tb); } }
    });
    a.beats(p.beats, { after: 0 });
    if (!Pt) sc.cam.to({ x: s.Ww / 2 + 20, zoom: 1.03 }, 0.3, Math.max(1, D - 1.2), "inOutSine");
  };

  TPL["idea-moment"] = function (root, p) {
    var sc = makeScene(locKey(p.location, "office")), s = st, Pt = s.portrait, SQ = s.square;
    var cx = Pt ? s.Ww * 0.5 : s.Ww * (SQ ? 0.3 : 0.33);
    var a = makeActor(castOf(p.character, "maya"), { x: cx, facing: "front", expression: "thinking", pose: "think" });
    var idea = str(p.idea) || narrationTitle();
    var tI = tc(Math.max(1.2, wordAt(p.word, idea, D * 0.5)));
    narrate(a);
    if (p.problem) S.thought(a, p.problem, 0.3, Math.max(0.9, tI - 0.15), { maxLines: 2 });
    else a.emote("question", 0.4, Math.max(0.8, tI - 0.6));
    sc.cam.to({ actor: a, zoom: Pt ? 1.12 : 1.18, dx: Pt ? 0 : 60 }, 0.3, Math.max(0.5, tI - 0.5), "inOutSine");
    sc.cam.to({ x: s.Ww / 2, y: 500, zoom: 1 }, tI, 0.3, "outBack");
    sc.cam.shake(tI + 0.05, 8, 0.35);
    a.emote("idea", tI, Math.min(2.4, Math.max(0.8, endLimit() - tI)));
    a.expression("excited", tI - 0.05, 0.12);
    a.pose("fist-pump", tI + 0.05, 0.3, "snap");
    a.hop(tI + 0.05, 9, 0.4);
    var sx = Pt ? 0.5 : 0.66, sy = Pt ? 0.25 : SQ ? 0.3 : 0.4;
    sticker(idea, tI + 0.12, { size: "lg", kicker: p.kicker, icon: p.prop || "lightbulb", x: sx, y: sy, rot: -3, maxWidth: Pt ? 920 : 760 });
    var tb = tc(tI + 1.7);
    if (tb > tI + 1.2) { a.pose("talk", tb, 0.5); a.expression("happy", tb); }
  };

  TPL["compare-two"] = function (root, p) {
    var sc = makeScene(locKey(p.location, "stage"), { color: p.color }), s = st, Pt = s.portrait, SQ = s.square;
    var Lp = obj(p.left), Rp = obj(p.right);
    var idL = castOf(Lp.character, "sam"), idR = castOf(Rp.character, idL === "priya" ? "maya" : "priya");
    if (idR === idL) idR = idL === "priya" ? "maya" : "priya";
    var xs = sc.slots(2, Pt ? 1 : SQ ? 1 : 0.95);
    var A = makeActor(idL, { x: xs[0], facing: "front", expression: Lp.expression || "happy" }), B = makeActor(idR, { x: xs[1], facing: "front", expression: Rp.expression || "happy" });
    var tL = tc(Math.max(0.4, wordAt(Lp.word, Lp.label, D * 0.12)));
    var tR = tc(Math.max(tL + 0.8, wordAt(Rp.word, Rp.label, D * 0.45, tL + 0.3)));
    var tV = p.verdict ? tc(Math.max(tR + 0.8, wordAt(p.word, null, D * 0.78, tR + 0.4))) : null;
    var sy = Pt ? 0.235 : SQ ? 0.24 : 0.25, sw_ = Pt ? 470 : SQ ? 460 : 700, ssz = Pt || SQ ? "md" : "lg";
    function side(act, pp, sx, t0, t1, rot) {
      var pts = arr(pp.points).map(str).filter(Boolean).slice(0, 3), ptT = [], prev = t0 + 0.2;
      pts.forEach(function (q) { var tq = labelTime(q, null, prev); ptT.push(tq); if (tq != null) prev = tq + 0.1; });
      ptT = spread(ptT, t0 + 0.4, Math.max(t0 + 0.6, t1 - 0.3)).map(function (q) { return clamp(q, t0 + 0.2, endLimit()); });
      var stk = sticker(str(pp.label) || "Option", t0, { size: ssz, icon: pp.prop, x: sx, y: sy, rot: rot, maxWidth: sw_, points: pts }).pointsAt(ptT);
      act.say(t0, t1);
      act.pose("explain", t0 - 0.15, 0.4);
      act.lookAt("camera", t0);
      var other = act === A ? B : A;
      other.lookAt(act, t0 + 0.1);
      return stk;
    }
    var endL = tR - 0.15, endR = tV != null ? tV - 0.15 : endLimit();
    var sL = side(A, Lp, Pt ? 0.27 : 0.27, tL, endL, -3), sR = side(B, Rp, Pt ? 0.73 : 0.73, tR, endR, 3);
    A.pose("idle", endL + 0.1, 0.4); A.lookAt(B, endL + 0.1);
    sticker("VS", Math.max(0.3, tL + 0.3), { size: "md", x: 0.5, y: Pt ? sy + 0.1 : sy + 0.05, color: ACC, rot: 6 });
    var zl = lerp(s.Ww / 2, xs[0], 0.2), zr = lerp(s.Ww / 2, xs[1], 0.2);
    sc.cam.to({ x: zl, zoom: 1.04 }, tL - 0.2, 0.6, "inOutSine");
    sc.cam.to({ x: zr, zoom: 1.04 }, tR - 0.2, 0.6, "inOutSine");
    if (tV != null) {
      sc.cam.to({ x: s.Ww / 2, zoom: 1 }, tV - 0.2, 0.5, "inOutSine");
      var v = p.verdict === "left" ? [A, sL, B, sR] : p.verdict === "right" ? [B, sR, A, sL] : null;
      if (v) {
        v[0].face("front", tV); v[0].pose("celebrate", tV, 0.35, "snap"); v[0].expression("excited", tV); v[0].emote("sparkle", tV + 0.1, 1.8); v[0].lookAt("camera", tV); v[0].say(tV, endLimit());
        v[1].bump(tV);
        sticker("", tV + 0.05, { size: "sm", icon: "trophy", x: v[0] === A ? 0.27 + (Pt ? 0.16 : 0.13) : 0.73 + (Pt ? 0.16 : 0.13), y: Math.max(0.12, sy - (Pt ? 0.07 : 0.11)), rot: 10, color: "#FFE066" });
        v[2].face("front", tV + 0.1); v[2].pose("shrug", tV + 0.1, 0.4); v[2].expression("skeptical", tV + 0.1); v[3].dim(tV + 0.1, 0.55);
      } else {
        [A, B].forEach(function (x, i) { x.face("front", tV + i * 0.08); x.pose("celebrate", tV + i * 0.08, 0.35); x.expression("happy", tV); });
        A.say(tV, endLimit());
      }
    }
  };

  TPL["establishing-shot"] = function (root, p) {
    var Pt = V.isPortrait, span = Pt ? 2.6 : 2.2;
    var sc = makeScene(locKey(p.location, "park"), { span: span }), s = st;
    var ids = arr(p.characters).map(function (c) { return castKey(c); }).filter(Boolean).slice(0, 3);
    var tArr = Math.max(1.2, endLimit() - 1.1);
    sc.cam.set({ x: s.Ww / 2, zoom: 1.08 });
    sc.cam.to({ x: s.Wt - s.Ww / 2, zoom: 1 }, 0.05, Math.max(1, tArr + 0.2), "inOutSine");
    var cap = str(p.caption) || "Meanwhile";
    var tC = tc(Math.min(0.5, D * 0.12));
    sticker(cap, tC, { size: "lg", kicker: p.subcaption, icon: p.prop || "map", x: 0.5, y: Pt ? 0.24 : 0.2, rot: -2, maxWidth: Pt ? 940 : 980 });
    var xs = slots(s, ids.length || 1, Pt ? 1 : 0.8).map(function (x) { return x + (s.Wt - s.Ww); });
    ids.forEach(function (id, i) {
      var a = makeActor(id, { x: xs[i], facing: "front", expression: "happy" });
      var from = i % 2 ? "right" : "left", d = Math.min(2.4, Math.max(1.0, tArr * 0.55));
      a.enter(from, Math.max(0.2, tArr - d - i * 0.15), d);
      var tw = tc(tArr + 0.1 + i * 0.1);
      a.face("front", tw); a.pose("wave", tw + 0.05, 0.4); a.lookAt("camera", tw);
    });
  };

  TPL["crowd-stat"] = function (root, p) {
    var sc = makeScene(locKey(p.location, "stage")), s = st, Pt = s.portrait, SQ = s.square, sa = safe();
    var total = clamp(Math.round(num(p.total, 8)), 2, Pt ? 12 : 16), hl = clamp(Math.round(num(p.highlight, 1)), 0, total);
    var cast = arr(p.cast).map(function (c) { return castKey(c); }).filter(Boolean);
    if (!cast.length) cast = ["maya", "leo", "priya", "sam", "kai", "bolt"];
    var stat = str(p.stat) || hl + " in " + total, tW = tc(Math.max(1.0, wordAt(p.word, stat + " " + str(p.label), D * 0.45)));
    var stk = sticker(stat, 0.15, { size: "xl", kicker: p.kicker, sub: p.label, x: 0.5, y: Pt ? 0.24 : SQ ? 0.2 : 0.2, rot: -2, maxWidth: Pt ? 960 : 1100 });
    stk.bump(tW);
    var cols = Pt ? (total <= 4 ? total : total <= 9 ? 3 : 4) : total <= 8 ? total : Math.ceil(total / 2);
    if (Pt && total > 4 && total <= 6) cols = 3;
    if (Pt && (total === 7 || total === 8)) cols = 4;
    var rows = Math.ceil(total / cols);
    var c0 = camAt(s, 0), m = layerM(s, c0, 1), topLimit = (stk.y + stk.h + u(24) - m[2]) / m[0];
    var usable = s.Ww * (Pt ? 0.8 : 0.84), slot = usable / cols, scale = clamp(slot / (s.charH * 0.44), 0.3, rows > 1 ? 0.6 : 0.82);
    var hgt = s.charH * scale * 1.12;
    var g0 = rows > 1 ? Math.max(topLimit + hgt, s.G - (rows - 1) * hgt * 0.62) : s.G, gap = rows > 1 ? (s.G - g0) / (rows - 1) : 0;
    if (rows > 1 && gap > hgt * 0.75) { gap = hgt * 0.75; g0 = s.G - gap * (rows - 1); }
    var col = isHex(p.highlightColor) ? hex6(p.highlightColor) : "#FFC93C", figs = [], k = 0;
    for (var r = 0; r < rows; r++) {
      var n = Math.min(cols, total - r * cols), gy = rows > 1 ? g0 + gap * r : s.G, sc_ = scale * (1 - (rows - 1 - r) * 0.05), off = rows > 1 ? (r % 2 ? 0.14 : -0.14) * slot : 0;
      for (var i = 0; i < n; i++) {
        var x = s.Ww / 2 + (i - (n - 1) / 2) * slot + off;
        figs.push({ x: x, y: gy, scale: sc_, row: r, id: cast[k % cast.length] });
        k++;
      }
    }
    // highlight the first hl figures in reading order of the front row first
    var order = figs.map(function (f, i) { return i; }).sort(function (a_, b_) { return figs[b_].row - figs[a_].row || figs[a_].x - figs[b_].x; });
    var hlSet = {};
    order.slice(0, hl).forEach(function (i) { hlSet[i] = 1; });
    figs.forEach(function (f, i) {
      var hi = !!hlSet[i];
      if (hi) {
        var ring = svg("ellipse", { cx: f1(f.x), cy: f1(f.y + 4), rx: f1(s.charH * f.scale * 0.2), ry: f1(s.charH * f.scale * 0.045), fill: col, stroke: INK, "stroke-width": 3 }, s.L.pback);
        s.anims.push(function (t) { var q = popK(t, tW, 0.3); setA(ring, "opacity", f2(Math.min(1, q))); setA(ring, "transform", "translate(" + f1(f.x) + " " + f1(f.y) + ") scale(" + f2(q) + ") translate(" + f1(-f.x) + " " + f1(-f.y) + ")"); });
      }
      var a = makeActor(f.id, { x: f.x, y: f.y, scale: f.scale, facing: "front", expression: "neutral", gestures: false });
      var ti = 0.02 + i * Math.min(0.07, (tW - 0.6) / Math.max(1, figs.length));
      a.vis.set(0, 0); a.vis.set(1, ti); a.hop(ti, 16, 0.42);
      a.lookAt("camera", 0);
      if (hi) { a.pose("celebrate", tW + (i % 4) * 0.05, 0.35, "snap"); a.expression("excited", tW); }
      else { a.dimTo(0.62, tW + 0.05, 0.4); a.expression(i % 2 ? "neutral" : "thinking", tW); }
    });
    sc.cam.shake(tW, 6, 0.3);
  };

  TPL.journey = function (root, p) {
    var ms = arr(p.milestones).map(obj).filter(function (m_) { return str(m_.label); }).slice(0, 5);
    if (!ms.length) ms = [{ label: "Start" }, { label: "Finish" }];
    var n = ms.length, Pt = V.isPortrait;
    var span = Math.max(2, 1 + n * (Pt ? 1.0 : 0.8));
    var sc = makeScene(locKey(p.location, "park"), { span: span }), s = st;
    var x0 = s.Ww * 0.25, xA = s.Ww * (Pt ? 0.8 : 0.7), xB = s.Wt - s.Ww * 0.4;
    var a = makeActor(castOf(p.character, "kai"), { x: x0, facing: "right", expression: "happy" });
    var xs = ms.map(function (m_, i) { return n === 1 ? xB : xA + ((xB - xA) * i) / (n - 1); });
    var prev = 0.4, times = ms.map(function (m_) { var t = m_.word ? kwFind(m_.word, prev) : labelTime(m_.label, null, prev); if (t != null) prev = t + 0.3; return t; });
    times = spread(times, 1.2, endLimit() - 1.0);
    for (var i = 0; i < n; i++) times[i] = tc(Math.max(times[i], i ? times[i - 1] + 0.9 : 1.0));
    var standOff = s.portrait ? 70 : 95;
    xs.forEach(function (sx, i) {
      // signpost (world html)
      var sw = s.portrait ? 230 : 250, sh_ = 92, py = a.topAt(0) - 30 - sh_ / 2;
      var post = div("ct-sign", s.html);
      post.style.left = f1(sx - 7) + "px"; post.style.top = f1(py) + "px"; post.style.height = f1(s.G - py + 6) + "px";
      var brd = div("ct-signb", s.html), icon = propKey(ms[i].prop);
      var lay = layoutRich(ms[i].label, { size: 40, maxWidth: sw - (icon ? 70 : 24), maxLines: 2, minSize: 22, weight: 900, lh: 1.02 });
      brd.style.left = f1(sx - sw / 2) + "px"; brd.style.top = f1(py - sh_ / 2) + "px"; brd.style.width = f1(sw) + "px"; brd.style.height = f1(sh_) + "px";
      if (icon) { var ic = div("ct-signi", brd); ic.innerHTML = propIcon(icon, 58); }
      var te = div("ct-signt", brd); te.style.left = f1(icon ? 74 : 12) + "px"; te.style.top = f1((sh_ - lay.h) / 2) + "px"; te.style.width = f1(lay.w + 4) + "px";
      fillRich(te, lay, "ct-bw");
      var num_ = div("ct-signn", brd, String(i + 1));
      var t0 = times[i] - 0.25;
      s.anims.push(function (t) { var q = popK(t, t0, 0.4); setS(brd, "transform", "scale(" + f2(0.35 + 0.65 * q) + ") rotate(" + f1((1 - Math.min(1, q)) * -14) + "deg)"); setS(brd, "opacity", f2(t >= t0 ? 1 : 0.0)); });
      s.boxes.push({ kind: "sign", label: ms[i].label, wx: sx - sw / 2, wy: py - sh_ / 2, w: sw, h: sh_, at: t0 });
    });
    var cur = 0.25;
    xs.forEach(function (sx, i) {
      var tx = sx - standOff, arrive = times[i] - 0.1, d = arrive - cur, dist = Math.abs(tx - a.xAt(cur));
      if (d > 0.3) {
        var speed = dist / d, gait = speed > a.us * 70 ? "run" : "walk";
        a.moveTo(tx, cur, d, { gait: gait });
        if (gait === "run") motionLines(a, cur, arrive);
      }
      var last = i === n - 1;
      a.face("right", arrive + 0.02);
      if (last) { a.face("front", arrive + 0.15); a.pose("celebrate", arrive + 0.18, 0.35, "snap"); a.expression("excited", arrive + 0.1); a.emote("sparkle", arrive + 0.2, 1.8); }
      else { a.pose("point-up", arrive + 0.02, 0.3); a.lookAt({ x: sx, y: a.topAt(0) - 70 }, arrive); a.lookAt("auto", arrive + 0.6); }
      cur = arrive + (last ? 0 : 0.55);
    });
    sc.cam.set({ x: s.Ww / 2, zoom: 1 });
    sc.cam.follow(a, 0.2, D, { lead: s.portrait ? 40 : 160 });
    if (p.title) sticker(p.title, 0.3, { size: "sm", x: Pt ? 0.5 : 0.25, y: Pt ? 0.17 : 0.13, icon: "flag", rot: -3 });
  };

  TPL["title-card"] = function (root, p) {
    var sc = makeScene(locKey(p.location, "stage"), { color: p.color || "#FFD9A8" }), s = st, Pt = s.portrait, SQ = s.square;
    var ids = arr(p.characters).map(function (c) { return castKey(c); }).filter(Boolean).slice(0, 3);
    if (!ids.length) ids = ["maya"];
    var title = str(p.title) || narrationTitle(), tT = tc(Math.min(Math.max(0.5, labelTime(title, null, 0) || 0.6), D * 0.35));
    sticker(title, tT, { size: "xl", kicker: p.kicker, sub: p.subtitle, icon: p.prop, x: 0.5, y: Pt ? 0.22 : SQ ? 0.24 : 0.27, rot: -2.5, maxWidth: Pt ? 960 : 1240 });
    confetti(tT + 0.05, { count: 36 });
    var xs = slots(s, ids.length, Pt ? 0.95 : 0.62);
    ids.forEach(function (id, i) {
      var a = makeActor(id, { x: xs[i], facing: "front", expression: "happy", pose: "jump", scale: Pt ? (ids.length > 2 ? 0.74 : 0.84) : 1 });
      var ti = 0.15 + i * 0.16;
      a.pos.set({ x: xs[i], y: s.G + 620 }, 0);
      a.pos.to({ y: s.G }, ti, 0.55, "outBack");
      a.pose("wave", tT + 0.2 + i * 0.12, 0.4);
      a.lookAt("camera", 0);
      if (i === 1) a.emote("sparkle", tT + 0.4, 1.6);
      var tb = tc(tT + 2.0 + i * 0.1);
      if (tb > tT + 1.4) a.pose(i % 2 ? "open-arms" : "celebrate", tb, 0.45);
    });
    sc.cam.set({ zoom: 1.04 });
    sc.cam.to({ zoom: 1 }, 0.1, Math.max(1, D - 1), "inOutSine");
  };

  function render(id, root, props) {
    if (!TPL[id]) throw new Error("Unknown template: " + id);
    TPL[id](root, obj(props));
  }
  function fallback(root, narration) {
    try {
      var sc = makeScene("stage"), s = st, Pt = s.portrait;
      var a = makeActor("maya", { x: Pt ? s.Ww / 2 : s.Ww * 0.3, facing: "front", expression: "happy", pose: "talk" });
      narrate(a, 0.05, D);
      var words = contentWords(narration || V.narration).slice(0, 6).join(" ") || "Let's talk";
      sticker(words, 0.35, { size: "lg", x: Pt ? 0.5 : 0.66, y: Pt ? 0.25 : 0.4, maxWidth: Pt ? 920 : 760 });
      sc.cam.to({ zoom: 1.05 }, 0.2, Math.max(1, D - 1), "inOutSine");
      if (S.flush) S.flush();
    } catch (e) { V.error("[cartoon fallback] " + (e && e.message ? e.message : e)); }
  }

  // ------------------------- inspect (screen boxes for tests) -------------------------
  function inspect(t) {
    var s = st;
    if (!s) return [];
    if (!s.fin) finalize(s);
    var c = camAt(s, t), out = [], camMoving = c.moving;
    function wbox(kind, label, x, y, w, h, mv) {
      var p0 = toScr(s, c, x, y), p1 = toScr(s, c, x + w, y + h);
      out.push({ kind: kind, label: label, x: p0[0], y: p0[1], w: p1[0] - p0[0], h: p1[1] - p0[1], moving: !!(mv || camMoving) });
    }
    s.stickers.forEach(function (k) { if (t >= k.at && (k.until == null || t < k.until)) out.push({ kind: "sticker", label: k.label || "badge", x: k.x, y: k.y, w: k.w, h: k.h, moving: t < k.at + 0.45 }); });
    s.bubbles.forEach(function (b) {
      if (t < b.from || t >= b.to || b.a.vis.val(t) < 0.5) return;
      if (!b.mode) placeBubble(b);
      var g = bubbleRect(b, t);
      out.push({ kind: "bubble", label: b.text, x: g.x, y: g.y, w: b.w, h: b.h, moving: camMoving || b.a.pos.moving(t) || t < b.from + 0.3 });
    });
    s.boards.forEach(function (B) { if (t >= B.at) wbox("board", B.label, B.x - B.w / 2, B.y - B.h / 2, B.w, B.h); });
    s.boxes.forEach(function (bx) { if (t >= bx.at) wbox(bx.kind, bx.label, bx.wx, bx.wy, bx.w, bx.h); });
    s.actors.forEach(function (a) {
      if (a.vis.val(t) < 0.5 || (a.fade && a.fade.val(t) < 0.5)) return;
      var b = actorBox(a, t, false), mv = a.pos.moving(t) || a.walks.some(function (w) { return t >= w.t0 && t <= w.t1; });
      wbox("character", a.name, b.x, b.y, b.w, b.h, mv);
    });
    if (s.capBox) s.capBox.groups.forEach(function (g) { if (t >= g.t0 && t < g.t1) { var r = g.el.getBoundingClientRect(); out.push({ kind: "caption", label: g.el.textContent, x: r.left, y: r.top, w: r.width, h: r.height, moving: false }); } });
    return out;
  }

  // ------------------------- public API -------------------------
  S.scene = makeScene;
  S.currentScene = function () { return st ? st.api : null; };
  S.character = makeActor;
  S.narrate = narrate;
  S.bubble = bubble;
  S.thought = function (a, text, from, to, o) { return bubble(a, text, from, to, Object.assign({}, obj(o), { kind: "thought" })); };
  S.shout = function (a, text, from, to, o) { return bubble(a, text, from, to, Object.assign({}, obj(o), { kind: "shout" })); };
  S.dialogue = dialogue;
  S.lines = function (lines, after) { return findLines(arr(lines).map(str), after); };
  S.mark = function (a, kind, at, dur) { if (a && a.__actor) a.emote(kind, at, dur); return a; };
  S.burst = burst;
  S.motionLines = motionLines;
  S.sticker = sticker;
  S.captions = captions;
  S.confetti = confetti;
  S.prop = prop;
  S.propIcon = propIcon;
  S.propNames = Object.keys(PROPS);
  S.board = board;
  S.camera = function () { return ensure().camera; };
  S.cartoonEase = CE;
  S.cast = CAST_IDS.slice();
  // Register a character from scene code (e.g. a brand's own narrator). cd uses the same fields as the built-in cast:
  // skin, hair, shirt, pants, shoe (colours); hairStyle bun|quiff|long|flattop|spiky|curly; top tee|hoodie|blouse|polo|stripe;
  // sleeve short|long; beard; glasses (true/"round" or "square"); broad; kid; shorts; hairTop. Missing fields come from maya.
  // Returns the id; S.character(id, ...) then works with every pose, expression and the lip-sync. Built-in ids cannot be replaced.
  S.defineCharacter = function (id, cd) {
    id = str(id).toLowerCase();
    if (!/^[a-z][a-z0-9-]{0,23}$/.test(id)) throw new Error("defineCharacter: id must be lowercase letters, digits or -, starting with a letter: " + id);
    if (["maya", "leo", "priya", "sam", "bolt", "kai"].indexOf(id) >= 0) throw new Error("defineCharacter: " + id + " is a built-in character");
    if (!cd || typeof cd !== "object") throw new Error("defineCharacter: give a character description object");
    var base = cd.robot ? CAST.bolt : CAST.maya, out = {};
    Object.keys(base).forEach(function (k) { out[k] = base[k]; });
    Object.keys(cd).forEach(function (k) { out[k] = cd[k]; });
    CAST[id] = out;
    if (CAST_IDS.indexOf(id) < 0) CAST_IDS.push(id);
    S.cast = CAST_IDS.slice();
    return id;
  };
  S.poses = Object.keys(POSES);
  S.expressions = Object.keys(EXPR);
  S.marks = MARKS.slice();
  S.locations = LOCS.slice();
  S.safe = safe;
  S.u = u;
  S.find = kwFind;
  S.templates = Object.keys(TPL);
  S.render = render;
  S.fallback = fallback;
  S.inspect = inspect;
  S.flush = function () { if (st) { finalize(st); frame(V.time()); } };
})();

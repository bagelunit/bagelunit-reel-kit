/* Mini Chronicle engine (style id: mini-chronicle).
 *
 * Soft 2D cartoon history: round-headed chibi archetypes (a role plus a nation) on painted locations,
 * a parchment map with regions, fronts, arrows and targets, letters that get no reply, split screens
 * and chunky thumbnail lettering. Everything is our own drawing; banners are INVENTED (a field colour,
 * a simple pattern and a geometric emblem keyed by nation name), never real flags or national emblems,
 * and no character is a likeness of a real person.
 *
 * Architecture
 * - Build time: a Film (one per scene) owns a stage div. S.shot(location, from, to) adds a Shot: a div
 *   with one main View (full frame) and optional child Views (S.half, shot.inset). A View is an SVG
 *   plus a world-space HTML layer, positioned at a screen rect; its world is 1000 units tall and
 *   1000 * w / h wide, seen through its own Camera. View layers back to front: sky (parallax 0.4),
 *   back (0.75), main (1), chars (1), front (1.1), fx (1). All DOM is built once; calls only record
 *   keyframes on tracks (Tr) or push small draw functions.
 * - Film-level layers above every shot: a screen-space SVG (booms, focus lines) and an HTML overlay
 *   (thumb text, date tags, captions, bubbles, stamps), plus flash and vignette layers.
 * - One frame function (V.onFrame) sets everything from t only: which shots are visible (and their
 *   enter transition), each visible view's camera and layer matrices, each actor rig (pose blend with
 *   overshoot, walk and march cycles, hops, lip sync from V.words, blinks, expression marks), then
 *   the film overlays. Nothing reads the previous frame, so seeking works in both directions.
 * - Characters: one chibi skeleton for every role (head radius about 100 world units at scale 1, feet
 *   278 below the head centre), two-segment stubby arms, stub legs. A role adds a hat and a torso; a
 *   nation adds uniform colours, a collar patch, a cap badge and its banner.
 * - Timing: templates find their words with V.find (keyword props, the longest content word, then a
 *   narration estimate), then clamp every beat into [0.2, duration - 1].
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
  var FONT = '"Arial Black", "Segoe UI", Arial, Helvetica, "Noto Sans", system-ui, sans-serif';
  var INK = "#2B2A33", ACC = "#D7263D", MUTED = "#6B6878", BG = "#F3EAD6", GOLD = "#F5B82E", CREAM = "#FFF7E6", SKIN = "#FFD9BC";

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
  function err(where, e) { V.error("[chibi " + where + "] " + (e && e.message ? e.message : String(e))); }
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
  function hexRgb(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex));
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbHex(c) { return "#" + ((1 << 24) | (Math.round(clamp(c[0], 0, 255)) << 16) | (Math.round(clamp(c[1], 0, 255)) << 8) | Math.round(clamp(c[2], 0, 255))).toString(16).slice(1); }
  function shade(hex, k) { var c = hexRgb(hex); return c ? rgbHex([c[0] * k, c[1] * k, c[2] * k]) : hex; }
  function tint(hex, k) { var c = hexRgb(hex); return c ? rgbHex(c.map(function (v) { return v + (255 - v) * k; })) : hex; }
  function mixHex(a, b, k) { var c = hexRgb(a), d = hexRgb(b); return c && d ? rgbHex([lerp(c[0], d[0], k), lerp(c[1], d[1], k), lerp(c[2], d[2], k)]) : a; }
  function lum(hex) { var c = hexRgb(hex); return c ? (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255 : 1; }
  function isColor(c) { c = str(c); return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c) || /^(rgb|hsl)a?\(/i.test(c) || /^[a-z]{3,20}$/i.test(c); }
  function hex6(c) { c = str(c); if (/^#[0-9a-f]{3}$/i.test(c)) return "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]; return c; }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }

  // ------------------------- easing -------------------------
  var CE = {
    // anticipation (small dip backwards) then an overshoot settle
    pose: function (p) {
      if (p <= 0) return 0;
      if (p >= 1) return 1;
      if (p < 0.14) return -0.06 * Math.sin((p / 0.14) * PI);
      var q = (p - 0.14) / 0.86 - 1, c = 1.35;
      return 1 + (c + 1) * q * q * q + c * q * q;
    },
    snap: function (p) {
      if (p <= 0) return 0;
      if (p >= 1) return 1;
      var q = p - 1, c = 2.4;
      return 1 + (c + 1) * q * q * q + c * q * q;
    },
    soft: function (p) { return -(Math.cos(PI * clamp(p, 0, 1)) - 1) / 2; },
    out: function (p) { p = clamp(p, 0, 1); return 1 - Math.pow(1 - p, 3); },
    bounce: function (p) {
      p = clamp(p, 0, 1);
      var n1 = 7.5625, d1 = 2.75;
      if (p < 1 / d1) return n1 * p * p;
      if (p < 2 / d1) return n1 * (p -= 1.5 / d1) * p + 0.75;
      if (p < 2.5 / d1) return n1 * (p -= 2.25 / d1) * p + 0.9375;
      return n1 * (p -= 2.625 / d1) * p + 0.984375;
    },
    lin: function (p) { return clamp(p, 0, 1); },
  };
  function EZ(e) { if (typeof e === "function") return e; return (e && (CE[e] || V.ease[e])) || V.ease.inOutCubic || CE.soft; }

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
  // last key whose start is <= t (names: no blending)
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
  function popK(t, at, dur, kind) { // 0..1+ scale for a pop-in with overshoot
    if (t < at) return 0;
    return (kind === "soft" ? CE.soft : CE.snap)(clamp((t - at) / (dur || 0.32), 0, 1));
  }
  function win(t, a, b) { return t >= a && t < b; }

  // ------------------------- text -------------------------
  var mctx = null;
  function measure(text, size, weight) {
    if (!mctx) mctx = doc.createElement("canvas").getContext("2d");
    mctx.font = (weight || 900) + " " + size + "px " + FONT;
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
  // Replace dash characters (em, en, minus) with a plain comma pause so they never become a word.
  function clean(text) {
    var dashes = new RegExp("\\s*[" + String.fromCharCode(0x2014, 0x2013, 0x2212) + "]\\s*", "g");
    return str(text).replace(dashes, ", ").replace(new RegExp(String.fromCharCode(0x2026), "g"), "...");
  }
  function wrapGreedy(words, size, maxW, weight, upper) {
    var lines = [], cur = [], cw = 0, sp = measure(" ", size, weight);
    words.forEach(function (wd) {
      var ww = measure(upper ? wd.w.toUpperCase() : wd.w, size, weight);
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
    var words = Array.isArray(text) ? text : parseRich(clean(text)), size = o.size || 48, minSize = o.minSize || size * 0.45;
    var maxW = o.maxWidth || 600, maxLines = o.maxLines || 3, weight = o.weight || 900, lh = o.lh || 1.08, up = !!o.upper;
    var lines;
    function widest() { var m = 0; words.forEach(function (wd) { m = Math.max(m, measure(up ? wd.w.toUpperCase() : wd.w, size, weight)); }); return m; }
    for (var guard = 0; guard < 40; guard++) {
      lines = wrapGreedy(words, size, maxW, weight, up);
      if ((lines.length <= maxLines && widest() <= maxW) || size <= minSize) break;
      size = Math.max(minSize, size * 0.93);
    }
    if (o.maxHeight) while (lines.length * size * lh > o.maxHeight && size > minSize) { size = Math.max(minSize, size * 0.93); lines = wrapGreedy(words, size, maxW, weight, up); }
    if (lines.length > 1) { // balance: narrowest width with the same line count
      var lo = maxW * 0.35, hi = maxW, n = lines.length;
      for (var i = 0; i < 14; i++) {
        var mid = (lo + hi) / 2, l2 = wrapGreedy(words, size, mid, weight, up), ok = l2.length <= n;
        l2.forEach(function (l) { if (l.words.length === 1 && measure(up ? l.words[0].w.toUpperCase() : l.words[0].w, size, weight) > mid) ok = false; });
        if (ok) hi = mid; else lo = mid;
      }
      lines = wrapGreedy(words, size, hi + 0.5, weight, up);
    }
    var w = 0;
    lines.forEach(function (l) { w = Math.max(w, l.w); });
    return { size: size, lines: lines, w: w, h: lines.length * size * lh, lh: lh, weight: weight, upper: up };
  }
  // Writes laid out lines into el; returns the word spans in order.
  function fillRich(el, lay, cls) {
    var spans = [];
    lay.lines.forEach(function (l, li) {
      var line = div("ch-line", el);
      l.words.forEach(function (wd, wi) {
        if (wi) line.appendChild(doc.createTextNode(" "));
        var s = doc.createElement("span");
        s.className = (cls || "ch-w") + (wd.em ? " ch-em" : "");
        s.textContent = lay.upper ? wd.w.toUpperCase() : wd.w;
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
  "a an the and or but of to in on at by for with from into onto over under is are was were be been being it its this that these those your you we our us my me i his her their they them he she as than then so not no yes do does did have has had will would can could should very just more most less each every all any some about here there what when who how why which also too up out if im its whats thats youre dont wont cant one".split(" ").forEach(function (w) { STOP[w] = 1; });
  function narrationEstimate(word, after) {
    var key = normWord(String(word).split(/\s+/)[0] || "");
    if (!key || !V.narration) return null;
    var toks = clean(V.narration).split(/\s+/).filter(function (x) { return normWord(x); }), total = toks.length;
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
    return plain(clean(text)).split(/[^\p{L}\p{N}'%$-]+/u).filter(function (w) { var n = normWord(w); return n.length > 1 && !STOP[n]; });
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
  function endLimit() { return Math.max(0.4, D - (D < 4 ? 0.6 : 1.0)); }
  function tc(t) { return clamp(num(t, 0.2), 0.2, endLimit()); } // clamp a beat time
  function tc0(t) { return clamp(num(t, 0), 0, D); }
  // Times for an ordered list of keys (null keys are spread); min gap keeps beats apart.
  function syncTimes(keys, o) {
    o = o || {};
    var prev = o.after || 0, out = [];
    (keys || []).forEach(function (k) { var t = k == null || k === "" ? null : kwFind(k, prev); out.push(t); if (t != null) prev = t + 0.01; });
    out = spread(out, o.a, o.b);
    var gap = o.gap == null ? 0.3 : o.gap;
    for (var i = 1; i < out.length; i++) if (out[i] < out[i - 1] + gap) out[i] = out[i - 1] + gap;
    // compress into the end limit if the list runs long
    var lim = o.limit == null ? endLimit() - 0.2 : o.limit;
    if (out.length && out[out.length - 1] > lim) {
      var first = Math.min(out[0], lim), last = out[out.length - 1];
      out = out.map(function (t) { return last > first ? first + ((t - first) * (lim - first)) / (last - first) : first; });
    }
    return out.map(function (t) { return tc(t - (o.lead || 0)); });
  }
  // Find each line in the narration words (in order). Returns [{ start, end, found, times }].
  function findLines(lines, after) {
    var ws = V.words || [], nw = ws.map(function (w) { return normWord(w.word); });
    var cur = 0, out = [];
    after = after || 0;
    while (cur < ws.length && ws[cur].start < after - 1e-6) cur++;
    lines.forEach(function (line) {
      var toks = plain(clean(line)).split(/\s+/).map(normWord).filter(Boolean), hit = -1;
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
      var times = [];
      for (var k = 0; k < toks.length; k++) times.push(ws[Math.min(last, hit + k)].start);
      out.push({ start: ws[hit].start, end: ws[last].end, found: true, times: times, n: toks.length });
      cur = last + 1;
    });
    var total = 0;
    out.forEach(function (o) { total += o.n; });
    var t0 = 0.25, t1 = endLimit(), acc = 0;
    out.forEach(function (o, i) {
      var a = t0 + ((t1 - t0) * acc) / Math.max(1, total), b = t0 + ((t1 - t0) * (acc + o.n)) / Math.max(1, total);
      acc += o.n;
      if (o.found) return;
      var prevEnd = i > 0 && out[i - 1].end != null ? out[i - 1].end + 0.15 : a, next = null;
      for (var j = i + 1; j < out.length; j++) if (out[j].found) { next = out[j].start; break; }
      o.start = Math.max(a, prevEnd);
      o.end = next != null ? Math.min(Math.max(b, o.start + 0.6), next - 0.15) : Math.max(b, o.start + 0.6);
      if (o.end < o.start + 0.4) o.end = o.start + 0.4;
      o.times = [];
      for (var k2 = 0; k2 < o.n; k2++) o.times.push(o.start + ((o.end - o.start) * k2) / o.n);
    });
    return out;
  }
  function wordAt(word, fallbackText, def, after) {
    var t = word ? kwFind(word, after || 0) : null;
    if (t == null && fallbackText) t = labelTime(fallbackText, null, after || 0);
    return t == null ? def : t;
  }
  function narrationTitle() { return contentWords(V.narration).slice(0, 4).join(" ") || "Meanwhile"; }

  // ------------------------- svg markup helpers -------------------------
  function R(x, y, w, h, fill, rx, ex) { return '<rect x="' + f1(x) + '" y="' + f1(y) + '" width="' + f1(Math.max(0, w)) + '" height="' + f1(Math.max(0, h)) + '"' + (rx ? ' rx="' + rx + '"' : "") + ' fill="' + fill + '"' + (ex || "") + "/>"; }
  function C(x, y, r, fill, ex) { return '<circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="' + f1(r) + '" fill="' + fill + '"' + (ex || "") + "/>"; }
  function E(x, y, rx, ry, fill, ex) { return '<ellipse cx="' + f1(x) + '" cy="' + f1(y) + '" rx="' + f1(rx) + '" ry="' + f1(ry) + '" fill="' + fill + '"' + (ex || "") + "/>"; }
  function P(d, fill, ex) { return '<path d="' + d + '" fill="' + fill + '"' + (ex || "") + "/>"; }
  function L(x1, y1, x2, y2, stroke, w, ex) { return '<path d="M' + f1(x1) + " " + f1(y1) + "L" + f1(x2) + " " + f1(y2) + '" stroke="' + stroke + '" stroke-width="' + w + '" stroke-linecap="round" fill="none"' + (ex || "") + "/>"; }
  function SK(c, w) { return ' stroke="' + (c || INK) + '" stroke-width="' + (w == null ? 5 : w) + '" stroke-linejoin="round" stroke-linecap="round"'; }
  function TX(x, y, s_, size, fill, ex) { return '<text x="' + f1(x) + '" y="' + f1(y) + '" text-anchor="middle" font-size="' + size + '" font-weight="900" font-family=\'' + FONT + "' fill=\"" + fill + '"' + (ex || "") + ">" + esc(s_) + "</text>"; }
  function rrD(x, y, w, h, r) {
    r = Math.min(r || 0, w / 2, h / 2);
    return "M" + f1(x + r) + " " + f1(y) + "H" + f1(x + w - r) + "Q" + f1(x + w) + " " + f1(y) + " " + f1(x + w) + " " + f1(y + r) + "V" + f1(y + h - r) + "Q" + f1(x + w) + " " + f1(y + h) + " " + f1(x + w - r) + " " + f1(y + h) + "H" + f1(x + r) + "Q" + f1(x) + " " + f1(y + h) + " " + f1(x) + " " + f1(y + h - r) + "V" + f1(y + r) + "Q" + f1(x) + " " + f1(y) + " " + f1(x + r) + " " + f1(y) + "Z";
  }
  function starD(cx, cy, R0, r0, n, rot) {
    var s = "";
    for (var i = 0; i < n * 2; i++) { var a = rad((rot == null ? -90 : rot) + (i * 180) / n), rr = i % 2 ? r0 : R0; s += (i ? "L" : "M") + f1(cx + Math.cos(a) * rr) + " " + f1(cy + Math.sin(a) * rr); }
    return s + "Z";
  }
  // Smooth closed curve through points (Catmull-Rom to cubic Bezier).
  function smoothD(pts, closed, k) {
    k = k == null ? 0.5 : k;
    var n = pts.length;
    if (n < 2) return "";
    var d = "M" + f1(pts[0][0]) + " " + f1(pts[0][1]);
    var last = closed ? n : n - 1;
    for (var i = 0; i < last; i++) {
      var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      if (!closed) { if (i === 0) p0 = p1; if (i + 2 >= n) p3 = p2; }
      var c1 = [p1[0] + ((p2[0] - p0[0]) * k) / 3, p1[1] + ((p2[1] - p0[1]) * k) / 3], c2 = [p2[0] - ((p3[0] - p1[0]) * k) / 3, p2[1] - ((p3[1] - p1[1]) * k) / 3];
      d += "C" + f1(c1[0]) + " " + f1(c1[1]) + " " + f1(c2[0]) + " " + f1(c2[1]) + " " + f1(p2[0]) + " " + f1(p2[1]);
    }
    return d + (closed ? "Z" : "");
  }
  // Jagged divider path points between a and b (zigzag of n teeth with amplitude amp).
  function jagPts(ax, ay, bx, by, n, amp, seed) {
    var pts = [], dx = bx - ax, dy = by - ay, len = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / len, ny = dx / len;
    for (var i = 0; i <= n; i++) {
      var p = i / n, o = i === 0 || i === n ? 0 : (i % 2 ? 1 : -1) * amp * (0.7 + 0.6 * hash(seed + i));
      pts.push([ax + dx * p + nx * o, ay + dy * p + ny * o]);
    }
    return pts;
  }

  // ------------------------- film, shots, views -------------------------
  var film = null;
  var ENTER = { "slide-left": 0.42, "slide-right": 0.42, zoom: 0.38, drop: 0.6, rise: 0.45 };
  function Film() {
    var F = this, root = V.root();
    F.el = div("chf", root);
    F.stage = div("chf-stage", F.el);
    F.fx = svg("svg", { class: "chf-fx", width: W, height: H, viewBox: "0 0 " + W + " " + H }, F.el);
    F.fxDefs = svg("defs", null, F.fx);
    F.fxG = svg("g", null, F.fx);
    F.over = div("chf-over", F.el);
    F.flashEl = div("chf-flash", F.el);
    F.vigEl = div("chf-vig", F.el);
    F.shots = []; F.anims = []; F.boxes = []; F.shakes = []; F.flashes = []; F.vigs = []; F.filters = []; F.late = [];
    F.fin = false; F.uid = 0;
    F.api = {
      el: F.el, over: F.over,
      filter: function (from, to, css) { F.filters.push({ from: tc0(from), to: to == null ? 1e9 : num(to, 1e9), css: str(css) || "saturate(0.8)" }); return F.api; },
      shots: function () { return F.shots.slice(); },
    };
    V.onFrame(function (t) { if (film === F) filmFrame(F, t); });
  }
  function film_() { if (!film) film = new Film(); return film; }
  function fuid(p) { var F = film_(); return "ch" + (p || "") + ++F.uid; }
  function finalizeFilm(F) {
    if (F.fin) return;
    F.fin = true;
    // run late builders (they may read rigs at given times)
    for (var guard = 0; guard < 4 && F.late.length; guard++) {
      var l = F.late; F.late = [];
      l.forEach(function (fn) { try { fn(); } catch (e) { err("late", e); } });
    }
    F.shots.forEach(function (sh) {
      sh.views.forEach(function (v) { var l = v.late; v.late = []; l.forEach(function (fn) { try { fn(); } catch (e) { err("late", e); } }); });
    });
    // a shot stays visible under the next one while that one slides or zooms in
    F.shots.forEach(function (A) {
      A.until = A.to;
      F.shots.forEach(function (B) {
        if (B === A || B.from <= A.from || B.from > A.to + 0.01 || !ENTER[B.enter]) return;
        A.until = Math.max(A.until, B.from + ENTER[B.enter]);
      });
    });
  }
  function shakeAt(list, t) {
    var sx = 0, sy = 0, mv = false;
    list.forEach(function (q, j) {
      if (t < q.at || t > q.at + q.dur) return;
      var k = Math.pow(1 - (t - q.at) / q.dur, 1.6) * u(q.amp);
      sx += k * Math.sin((t - q.at) * 71 + j * 1.7);
      sy += k * 0.8 * Math.cos((t - q.at) * 59 + j * 2.3);
      mv = true;
    });
    return { x: sx, y: sy, moving: mv };
  }
  function filmFrame(F, t) {
    if (!F.fin) finalizeFilm(F);
    var sk = shakeAt(F.shakes, t);
    setS(F.stage, "transform", "translate(" + f2(sk.x) + "px," + f2(sk.y) + "px)");
    var flt = "";
    F.filters.forEach(function (q) { if (t >= q.from && t < q.to) flt += (flt ? " " : "") + q.css; });
    setS(F.stage, "filter", flt || "none");
    F.shots.forEach(function (sh) {
      var vis = t >= sh.from && t < sh.until;
      showEl(sh.el, vis);
      if (!vis) return;
      var tr = "none", op = 1, ed = ENTER[sh.enter];
      if (ed && t < sh.from + ed) {
        var p = (t - sh.from) / ed, e = CE.out(p);
        if (sh.enter === "slide-left") tr = "translateX(" + f1((1 - e) * W) + "px)";
        else if (sh.enter === "slide-right") tr = "translateX(" + f1(-(1 - e) * W) + "px)";
        else if (sh.enter === "rise") tr = "translateY(" + f1((1 - e) * H) + "px)";
        else if (sh.enter === "drop") tr = "translateY(" + f1(-(1 - CE.bounce(p)) * H) + "px)";
        else if (sh.enter === "zoom") { tr = "scale(" + (1.3 - 0.3 * e).toFixed(4) + ")"; op = clamp(p * 2.2, 0, 1); }
      }
      setS(sh.el, "transform", tr);
      setS(sh.el, "opacity", f2(op));
      sh.views.forEach(function (v) { viewFrame(v, t); });
    });
    // flash and vignette
    var fl = 0;
    F.flashes.forEach(function (q) { if (t >= q.at && t < q.at + q.dur) { fl = Math.max(fl, 1 - (t - q.at) / q.dur); F.flashEl.style.background = q.color; } });
    setS(F.flashEl, "opacity", f2(fl * 0.85));
    var vg = 0;
    F.vigs.forEach(function (q) { if (t >= q.from && t < q.to) vg = Math.max(vg, q.amount * smooth((t - q.from) / 0.8) * (q.to > 1e8 ? 1 : smooth((q.to - t) / 0.5))); });
    setS(F.vigEl, "opacity", f2(vg));
    for (var i = 0; i < F.anims.length; i++) { try { F.anims[i](t); } catch (e) { err("film", e); } }
  }

  function makeShot(location, from, to, opts) {
    var F = film_();
    if (location && typeof location === "object") { opts = location; location = opts.location; }
    opts = obj(opts);
    var sh = {
      film: F, from: tc0(from == null ? 0 : from), to: to == null ? 1e9 : Math.max(tc0(from == null ? 0 : from) + 0.01, num(to, 1e9)),
      enter: ENTER[opts.enter] ? opts.enter : "cut", views: [], idx: F.shots.length,
    };
    sh.until = sh.to;
    sh.el = div("chs", F.stage);
    F.shots.push(sh);
    var v = new View(sh, { x: 0, y: 0, w: W, h: H }, opts);
    sh.main = v;
    v.from = sh.from; v.to = sh.to;
    drawLoc(v, location, opts);
    return v;
  }
  function locKey(n, def) {
    n = str(n).toLowerCase().replace(/[\s_]+/g, "-");
    if (LOCATIONS[n]) return n;
    var syn = { warroom: "war-room", hq: "war-room", headquarters: "war-room", desk: "office", embassy: "office", front: "trench", trenches: "trench", airbase: "airfield", airport: "airfield", town: "city", street: "parade", mountains: "alps", mountain: "alps", border: "alps", ocean: "sea", navy: "sea", ship: "sea", europe: "map", paper: "plain", studio: "plain", poppies: "field", meadow: "field" };
    return syn[n.replace(/-/g, "")] || def || "plain";
  }
  function drawLoc(v, location, opts) {
    var k = locKey(location, "plain");
    v.location = k;
    try { LOCATIONS[k](v, obj(opts)); } catch (e) { err("location " + k, e); }
  }

  function View(shot, rect, o) {
    o = obj(o);
    var v = this;
    v.shot = shot; v.film = shot.film; v.rect = rect; v.k = rect.h / 1000; v.Ww = (1000 * rect.w) / rect.h;
    var asp = rect.w / rect.h;
    v.portrait = asp < 0.87; v.square = !v.portrait && asp <= 1.15; v.landscape = asp > 1.15;
    v.groundY = num(o.groundY, v.portrait ? 790 : v.square ? 850 : 870);
    v.from = shot.from; v.to = shot.to;
    v.actors = []; v.anims = []; v.userFrames = []; v.boxes = []; v.late = []; v.shakes = [];
    v.el = div("chv", shot.el);
    v.el.style.left = f1(rect.x) + "px"; v.el.style.top = f1(rect.y) + "px";
    v.el.style.width = f1(rect.w) + "px"; v.el.style.height = f1(rect.h) + "px";
    if (o.clip) v.el.style.clipPath = o.clip;
    var sv = { class: "chv-svg", width: f1(rect.w), height: f1(rect.h), viewBox: "0 0 " + f1(rect.w) + " " + f1(rect.h) };
    v.svgB = svg("svg", sv, v.el);
    v.defs = svg("defs", null, v.svgB);
    v.L = {};
    v.L.sky = svg("g", null, v.svgB);
    v.L.back = svg("g", null, v.svgB);
    v.L.main = svg("g", null, v.svgB);
    v.html = div("chv-html", v.el);
    v.svgF = svg("svg", sv, v.el);
    v.defsF = svg("defs", null, v.svgF);
    v.L.chars = svg("g", null, v.svgF);
    v.L.front = svg("g", null, v.svgF);
    v.L.fx = svg("g", null, v.svgF);
    v.dim = svg("rect", { x: -20, y: -20, width: f1(rect.w + 40), height: f1(rect.h + 40), fill: INK, opacity: 0 }, v.svgF);
    v.dimTr = new Tr(0);
    v.layers = [[v.L.sky, 0.4], [v.L.back, 0.75], [v.L.main, 1], [v.html, 1, true], [v.L.chars, 1], [v.L.front, 1.1], [v.L.fx, 1]];
    v.cam = new Camera(v);
    shot.views.push(v);
    v.id = fuid("v");
  }
  var VP = View.prototype;
  VP.onFrame = function (fn) { if (typeof fn === "function") this.userFrames.push(fn); return this; };
  VP.frame = function (kind, side) {
    var v = this, k = str(kind) || "medium";
    var sc = { wide: 0.62, medium: v.portrait ? 0.92 : v.square ? 0.9 : 1.05, close: v.portrait ? 1.25 : 1.6, small: 0.45 }[k] || 0.9;
    var fx = typeof side === "number" ? clamp(side, 0, 1) : side === "right" ? (v.portrait ? 0.68 : 0.73) : side === "center" ? 0.5 : side === "left" ? (v.portrait ? 0.32 : 0.27) : 0.5;
    var y = k === "close" ? (v.portrait ? 600 : 600) : v.groundY - 278 * sc;
    return { x: v.Ww * fx, y: y, scale: sc };
  };
  VP.toScreen = function (x, y, t) { var c = camAt(this, t == null ? V.time() : t); return toScr(this, c, x, y); };
  VP.dimTo = function (k, at, dur) { this.dimTr.to(clamp(num(k, 0.4), 0, 0.9), tc0(at), dur == null ? 0.3 : num(dur, 0.3), "inOutSine"); return this; };
  VP.late_ = function (fn) { this.late.push(fn); return this; };
  // inset view: a screen rect (fractions or px) with its own world and camera, no clip
  VP.inset = function (rect, o) {
    rect = obj(rect);
    var fr = rect.w <= 1 && rect.h <= 1;
    var r = fr ? { x: num(rect.x, 0) * W, y: num(rect.y, 0) * H, w: num(rect.w, 0.3) * W, h: num(rect.h, 0.3) * H } : { x: num(rect.x, 0), y: num(rect.y, 0), w: num(rect.w, 300), h: num(rect.h, 300) };
    var iv = new View(this.shot, r, Object.assign({}, obj(o), { groundY: num(obj(o).groundY, 960) }));
    iv.inset_ = true;
    iv.cam.drift = 0;
    return iv;
  };

  // ------------------------- camera -------------------------
  function Camera(v) { this.v = v; this.base = { x: v.Ww / 2, y: 500, z: 1 }; this.segs = []; this.sorted = true; this.drift = 1; this.shakes = []; }
  var CP = Camera.prototype;
  CP.set = function (o) { o = obj(o); var b = this.base; if (o.x != null) b.x = num(o.x, b.x); if (o.y != null) b.y = num(o.y, b.y); if (o.zoom != null) b.z = num(o.zoom, 1); return this; };
  CP._seg = function (g) { g.i = this.segs.length; this.segs.push(g); this.sorted = false; return this; };
  CP.to = function (tg, at, dur, ease) {
    var d = dur == null ? 0.8 : Math.max(0, num(dur, 0.8)), a = tc0(at), v = this.v;
    return this._seg({ at: a, dur: d, ease: EZ(ease || "inOutCubic"), tgt: camTarget(v, tg, a + d) });
  };
  CP.cut = function (tg, at) { return this.to(tg, at, 0); };
  CP.push = function (zoom, at, dur) {
    var z = num(zoom, 1.1);
    return this._seg({ at: tc0(at), dur: dur == null ? 2 : Math.max(0, num(dur, 2)), ease: EZ("inOutSine"), tgt: function (prev) { return { x: prev.x, y: prev.y, z: z }; } });
  };
  CP.focus = function (actor, at, dur, zoom) { return this.to({ actor: actor, zoom: zoom == null ? 1.4 : zoom }, at, dur == null ? 0.8 : dur); };
  CP.shake = function (at, amp, dur) { this.shakes.push({ at: tc0(at), amp: num(amp, 12), dur: Math.max(0.05, num(dur, 0.4)) }); return this; };
  function camTarget(v, tg, tEnd) {
    tg = tg && tg.__actor ? { actor: tg } : obj(tg);
    if (tg.actor && tg.actor.__actor) {
      var a = tg.actor;
      return function (prev) {
        var z = num(tg.zoom, prev.z), r = rigAt(a, tEnd), hy = r.head[1];
        return { x: r.head[0] + num(tg.dx, 0), y: hy + (a.sc * 150) + num(tg.dy, 0) - (z > 1.6 ? a.sc * 60 : 0), z: z };
      };
    }
    return function (prev) { return { x: tg.x != null ? num(tg.x, prev.x) : prev.x, y: tg.y != null ? num(tg.y, prev.y) : prev.y, z: tg.zoom != null ? num(tg.zoom, prev.z) : tg.z != null ? num(tg.z, prev.z) : prev.z }; };
  }
  function camAt(v, t) {
    var cm = v.cam;
    if (v._ct === t && v._c) return v._c;
    if (!cm.sorted) { cm.segs.sort(function (a, b) { return a.at - b.at || a.i - b.i; }); cm.sorted = true; }
    var c = { x: cm.base.x, y: cm.base.y, z: cm.base.z }, moving = false;
    for (var i = 0; i < cm.segs.length; i++) {
      var g = cm.segs[i];
      if (t < g.at) break;
      var p = g.dur > 0 ? clamp((t - g.at) / g.dur, 0, 1) : 1, tg = g.tgt(c), e = g.ease(p);
      c = { x: lerp(c.x, tg.x, e), y: lerp(c.y, tg.y, e), z: lerp(c.z, tg.z, e) };
      if (g.dur > 0.05 && p < 1) moving = true;
    }
    c.z = clamp(c.z, 0.5, 4);
    var dr = cm.drift;
    c.x += dr * (2.2 * Math.sin(t * 0.55 + 0.3) + 1.0 * Math.sin(t * 1.21));
    c.y += dr * 1.5 * Math.sin(t * 0.77 + 1.1);
    var sk = shakeAt(cm.shakes, t);
    c.sx = sk.x; c.sy = sk.y; c.moving = moving || sk.moving;
    v._ct = t; v._c = c;
    return c;
  }
  function layerM(v, c, f) {
    var zf = 1 + (c.z - 1) * f, sc = v.k * zf;
    var cx = v.Ww / 2 + (c.x - v.Ww / 2) * f, cy = 500 + (c.y - 500) * f;
    return [sc, v.rect.w / 2 - cx * sc + c.sx, v.rect.h / 2 - cy * sc + c.sy];
  }
  function toScr(v, c, x, y) { var m = layerM(v, c, 1); return [v.rect.x + x * m[0] + m[1], v.rect.y + y * m[0] + m[2], m[0]]; }
  function viewFrame(v, t) {
    var c = camAt(v, t);
    v.layers.forEach(function (ly) {
      var m = layerM(v, c, ly[1]), tr = "matrix(" + m[0].toFixed(5) + ",0,0," + m[0].toFixed(5) + "," + f2(m[1]) + "," + f2(m[2]) + ")";
      if (ly[2]) setS(ly[0], "transform", tr); else setA(ly[0], "transform", tr.replace(/,/g, " "));
    });
    setA(v.dim, "opacity", f2(v.dimTr.val(t)));
    for (var i = 0; i < v.anims.length; i++) { try { v.anims[i](t, c); } catch (e) { err("anim", e); } }
    for (var j = 0; j < v.userFrames.length; j++) { try { v.userFrames[j](t); } catch (e2) { err("onFrame", e2); } }
  }
  function viewVisible(v, t) { return t >= v.shot.from && t < v.shot.until; }
  // world point of a screen fraction for a view at time t
  function worldOf(v, fx, fy, t) { var c = camAt(v, t), m = layerM(v, c, 1); return [(fx * W - v.rect.x - m[1]) / m[0], (fy * H - v.rect.y - m[2]) / m[0]]; }

  // ------------------------- safe area (screen px) -------------------------
  function safe() {
    var x0, y0, x1, y1;
    if (V.isPortrait) { x0 = W * (60 / 1080); x1 = W * (1020 / 1080); y0 = H * (250 / 1920); y1 = H * (1450 / 1920); }
    else { x0 = W * 0.07; x1 = W * 0.93; y0 = H * 0.07; y1 = H * 0.93; }
    return { x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }

  // ------------------------- nations and invented banners -------------------------
  // Every banner here is invented: a field colour, one simple pattern and one geometric emblem. None copies a
  // real national flag or emblem; the nation key only picks period-plausible uniform colours and a banner.
  // uni: tunic, uni2: trousers, cap: cap cloth, helmet: soldier helmet shape.
  var NATIONS = {
    germany: { name: "Germany", uni: "#7C8572", uni2: "#5F6656", cap: "#717A68", helmet: "flared", b: { field: "#4D5866", pat: "band", c2: "#C9A646", em: "ring", ec: "#F3EAD6" } },
    britain: { name: "Britain", uni: "#A6935F", uni2: "#81714A", cap: "#968555", helmet: "brimmed", b: { field: "#2F4373", pat: "diag", c2: "#E8DEC4", em: "diamond", ec: "#B8483A" } },
    usa: { name: "USA", uni: "#86814F", uni2: "#6A6640", cap: "#7A7548", helmet: "dome", b: { field: "#2E6E8E", pat: "border", c2: "#EDE4CC", em: "tri", ec: "#EDE4CC" } },
    ussr: { name: "USSR", uni: "#948957", uni2: "#6E6744", cap: "#857B4E", helmet: "dome", b: { field: "#8A3036", pat: "hoist", c2: "#D9B44A", em: "chev", ec: "#F1E6CC" } },
    france: { name: "France", uni: "#8398B4", uni2: "#5F7190", cap: "#7489A6", helmet: "crest", b: { field: "#48658F", pat: "canton", c2: "#EDE4CC", em: "dot", ec: "#B8483A" } },
    italy: { name: "Italy", uni: "#878A6C", uni2: "#696C53", cap: "#7B7E62", helmet: "crest", b: { field: "#5E7D5A", pat: "band", c2: "#EDE4CC", em: "diamond", ec: "#40573D" } },
    japan: { name: "Japan", uni: "#9C8D57", uni2: "#7A6E43", cap: "#8D7F4E", helmet: "dome", b: { field: "#E3D5B3", pat: "hoist", c2: "#4A5568", em: "wave", ec: "#4A5568" } },
    switzerland: { name: "Switzerland", uni: "#687A8C", uni2: "#4E5D6C", cap: "#5E6F80", helmet: "dome", b: { field: "#A23B3B", pat: "plain", c2: "#F3EAD6", em: "peak", ec: "#F3EAD6" } },
    sweden: { name: "Sweden", uni: "#76808A", uni2: "#59626B", cap: "#6B747E", helmet: "dome", b: { field: "#3C6E9E", pat: "border", c2: "#D8B24A", em: "dot", ec: "#D8B24A" } },
    poland: { name: "Poland", uni: "#8C8D65", uni2: "#6B6C4C", cap: "#7F805B", helmet: "dome", b: { field: "#B5495B", pat: "diag", c2: "#EDE4CC", em: "tower", ec: "#EDE4CC" } },
    austria: { name: "Austria", uni: "#808C8E", uni2: "#626C6E", cap: "#748082", helmet: "flared", b: { field: "#7B3A3A", pat: "hoist", c2: "#EDE4CC", em: "tri", ec: "#EDE4CC" } },
    finland: { name: "Finland", uni: "#7D827B", uni2: "#60645E", cap: "#727770", helmet: "flared", b: { field: "#7FA6CF", pat: "band", c2: "#F2EEE4", em: "wave", ec: "#2F4170" } },
    netherlands: { name: "Netherlands", uni: "#7F8872", uni2: "#626A57", cap: "#737C67", helmet: "dome", b: { field: "#D9822B", pat: "border", c2: "#2F4170", em: "dot", ec: "#F3EAD6" } },
    belgium: { name: "Belgium", uni: "#9C8F64", uni2: "#7A704D", cap: "#8E825A", helmet: "crest", b: { field: "#C9A646", pat: "hoist", c2: "#2B2A33", em: "diamond", ec: "#9E3B32" } },
    spain: { name: "Spain", uni: "#A28C5E", uni2: "#7E6D49", cap: "#937F55", helmet: "dome", b: { field: "#B5533C", pat: "band", c2: "#E2B54C", em: "tower", ec: "#8A3A2A" } },
    norway: { name: "Norway", uni: "#707C6E", uni2: "#555F54", cap: "#667063", helmet: "brimmed", b: { field: "#2B3F66", pat: "canton", c2: "#B8483A", em: "chev", ec: "#EDE4CC" } },
    neutral: { name: "Neutral", uni: "#8E8878", uni2: "#6E695C", cap: "#827C6C", helmet: "dome", b: { field: "#B9B19D", pat: "plain", c2: "#EDE4CC", em: "ring", ec: "#FFFFFF" } },
  };
  var NATION_SYN = { german: "germany", deutschland: "germany", reich: "germany", british: "britain", uk: "britain", england: "britain", english: "britain", greatbritain: "britain", unitedkingdom: "britain", american: "usa", us: "usa", america: "usa", unitedstates: "usa", soviet: "ussr", soviets: "ussr", russia: "ussr", russian: "ussr", sovietunion: "ussr", french: "france", italian: "italy", japanese: "japan", swiss: "switzerland", swedish: "sweden", polish: "poland", austrian: "austria", finnish: "finland", dutch: "netherlands", holland: "netherlands", belgian: "belgium", spanish: "spain", norwegian: "norway", none: "neutral", generic: "neutral" };
  function nationKey(n, def) {
    var k = str(n).toLowerCase().replace(/[\s_.-]+/g, "");
    if (NATIONS[k]) return k;
    if (NATION_SYN[k]) return NATION_SYN[k];
    return def === undefined ? "neutral" : def;
  }
  function natOf(n) { return NATIONS[nationKey(n)]; }
  function natName(n) { return natOf(n).name; }
  function natColor(n) { var b = natOf(n).b; return lum(b.field) > 0.75 ? b.c2 : b.field; }

  function emblemMarkup(kind, cx, cy, s, c, bg) {
    var o = "";
    if (kind === "ring") o = C(cx, cy, s * 0.36, "none", SK(c, s * 0.15));
    else if (kind === "diamond") o = P("M" + f1(cx) + " " + f1(cy - s * 0.48) + "L" + f1(cx + s * 0.36) + " " + f1(cy) + "L" + f1(cx) + " " + f1(cy + s * 0.48) + "L" + f1(cx - s * 0.36) + " " + f1(cy) + "Z", c);
    else if (kind === "tri") o = P("M" + f1(cx - s * 0.34) + " " + f1(cy - s * 0.4) + "L" + f1(cx + s * 0.44) + " " + f1(cy) + "L" + f1(cx - s * 0.34) + " " + f1(cy + s * 0.4) + "Z", c);
    else if (kind === "chev") o = P("M" + f1(cx - s * 0.34) + " " + f1(cy - s * 0.42) + "L" + f1(cx + s * 0.34) + " " + f1(cy) + "L" + f1(cx - s * 0.34) + " " + f1(cy + s * 0.42), "none", SK(c, s * 0.18));
    else if (kind === "dot") o = C(cx, cy, s * 0.3, c);
    else if (kind === "wave") o = P("M" + f1(cx - s * 0.44) + " " + f1(cy - s * 0.12) + "q" + f1(s * 0.22) + " " + f1(-s * 0.2) + " " + f1(s * 0.44) + " 0t" + f1(s * 0.44) + " 0M" + f1(cx - s * 0.44) + " " + f1(cy + s * 0.2) + "q" + f1(s * 0.22) + " " + f1(-s * 0.2) + " " + f1(s * 0.44) + " 0t" + f1(s * 0.44) + " 0", "none", SK(c, s * 0.12));
    else if (kind === "peak") o = P("M" + f1(cx - s * 0.5) + " " + f1(cy + s * 0.36) + "L" + f1(cx - s * 0.06) + " " + f1(cy - s * 0.4) + "L" + f1(cx + s * 0.18) + " " + f1(cy) + "L" + f1(cx + s * 0.3) + " " + f1(cy - s * 0.16) + "L" + f1(cx + s * 0.54) + " " + f1(cy + s * 0.36) + "Z", c);
    else if (kind === "tower") o = P("M" + f1(cx - s * 0.3) + " " + f1(cy + s * 0.42) + "V" + f1(cy - s * 0.3) + "h" + f1(s * 0.15) + "v" + f1(s * 0.12) + "h" + f1(s * 0.07) + "v" + f1(-s * 0.12) + "h" + f1(s * 0.16) + "v" + f1(s * 0.12) + "h" + f1(s * 0.07) + "v" + f1(-s * 0.12) + "h" + f1(s * 0.15) + "V" + f1(cy + s * 0.42) + "Z", c) + R(cx - s * 0.07, cy + s * 0.1, s * 0.14, s * 0.32, bg || INK, s * 0.07);
    else if (kind === "square") o = R(cx - s * 0.3, cy - s * 0.3, s * 0.6, s * 0.6, c, s * 0.08);
    return o;
  }
  // Flat banner in a w x h box at 0,0 (cloth only).
  function bannerMarkup(nation, w, h) {
    var b = natOf(nation).b, m = R(0, 0, w, h, b.field), ex = w / 2, ey = h / 2, es = h * 0.5;
    if (b.pat === "band") m += R(0, h * 0.34, w, h * 0.32, b.c2);
    else if (b.pat === "diag") m += P("M0 " + f1(h * 0.78) + "L" + f1(w * 0.78) + " 0H" + f1(w) + "V" + f1(h * 0.22) + "L" + f1(w * 0.22) + " " + f1(h) + "H0Z", b.c2);
    else if (b.pat === "border") m += R(h * 0.1, h * 0.1, w - h * 0.2, h * 0.8, "none", 0, SK(b.c2, h * 0.08));
    else if (b.pat === "canton") { m += R(0, 0, w * 0.42, h * 0.52, b.c2); ex = w * 0.21; ey = h * 0.26; es = h * 0.34; }
    else if (b.pat === "hoist") { m += R(0, 0, w * 0.3, h, b.c2); ex = w * 0.62; }
    else if (b.pat === "split") m += R(0, h / 2, w, h / 2, b.c2);
    var ec = b.ec;
    if (b.pat === "band" && b.em !== "ring" && lum(ec) > 0.7 && lum(b.c2) > 0.7) ec = b.field;
    m += emblemMarkup(b.em, ex, ey, es, ec, b.field);
    return m;
  }
  S.NATIONS = NATIONS;
  S.nationName = natName;
  S.bannerSVG = function (nation, w, h) {
    w = num(w, 150); h = num(h, 100);
    return '<svg xmlns="' + NS + '" viewBox="-3 -3 ' + (w + 6) + " " + (h + 6) + '" width="' + w + '" height="' + h + '">' + bannerMarkup(nation, w, h) + R(0, 0, w, h, "none", 0, SK(INK, 3)) + "</svg>";
  };

  // A waving banner in a view (world units). x, y = top of the pole (cloth hangs from it to the side).
  VP.flag = function (nation, o) {
    var v = this;
    o = obj(o);
    var nk = nationKey(nation), w = num(o.w, 150), h = num(o.h, w * 0.66), x = num(o.x, v.Ww * 0.5), y = num(o.y, 300);
    var dir = o.dir === -1 || o.dir === "left" ? -1 : 1, layer = v.L[o.layer] || v.L.main, wave = o.wave === false ? 0 : num(o.wave, 1);
    var pole = o.pole !== false, poleH = num(o.poleH, Math.max(60, v.groundY - y)), sw = Math.max(3, h * 0.05);
    var g = svg("g", { class: "ch-flag" }, layer), id = fuid("fl");
    if (pole) {
      svg("path", { d: "M" + f1(x) + " " + f1(y - h * 0.08) + "V" + f1(y + poleH), stroke: INK, "stroke-width": f1(sw * 2.2 + 3), "stroke-linecap": "round" }, g);
      svg("path", { d: "M" + f1(x) + " " + f1(y - h * 0.08) + "V" + f1(y + poleH), stroke: "#8A6A48", "stroke-width": f1(sw * 2.2), "stroke-linecap": "round" }, g);
      svg("circle", { cx: f1(x), cy: f1(y - h * 0.12), r: f1(sw * 1.7), fill: GOLD, stroke: INK, "stroke-width": f1(sw * 0.7) }, g);
    }
    var cl = svg("clipPath", { id: id }, v.defs), cp = svg("path", null, cl);
    var cg = svg("g", { "clip-path": "url(#" + id + ")" }, g);
    var inner = svg("g", null, cg);
    inner.innerHTML = bannerMarkup(nk, w, h);
    var shadeP = svg("path", { fill: INK, opacity: 0.16 }, cg);
    var outline = svg("path", { fill: "none", stroke: INK, "stroke-width": f1(Math.max(2.5, h * 0.035)), "stroke-linejoin": "round" }, g);
    var vis = new Tr(1), pop = null, seed = hash(x * 0.37 + y);
    var x0 = pole ? x + dir * sw : x;
    function edge(tt, yy, amp) {
      var pts = [];
      for (var i = 0; i <= 8; i++) { var p = i / 8; pts.push([x0 + dir * w * p, yy + amp * p * Math.sin(tt * 4.2 + seed * 6 - p * 5.5)]); }
      return pts;
    }
    function pathOf(tt) {
      var amp = h * 0.09 * wave, top = edge(tt, y, amp), bot = edge(tt, y + h, amp).reverse();
      var d = "M" + top.map(function (p) { return f1(p[0]) + " " + f1(p[1]); }).join("L") + "L" + bot.map(function (p) { return f1(p[0]) + " " + f1(p[1]); }).join("L") + "Z";
      return d;
    }
    var api = {
      el: g, nation: nk, x: x, y: y, w: w, h: h,
      show: function (at) { vis.set(1, tc0(at)); return api; },
      hide: function (at) { vis.set(0, tc0(at)); return api; },
      pop: function (at) { vis.set(0, 0); vis.set(1, tc0(at)); pop = tc0(at); return api; },
      box: function () { return { x: Math.min(x0, x0 + dir * w), y: y, w: w, h: h }; },
    };
    v.anims.push(function (t) {
      var on = vis.val(t) > 0.5;
      showEl(g, on);
      if (!on) return;
      var d = pathOf(t);
      setA(cp, "d", d); setA(outline, "d", d);
      // shading bands follow the wave
      var sd = "";
      for (var i = 0; i < 3; i++) {
        var p0 = (i + 0.15 + ((t * 0.7 + seed) % 1) * 0.3) / 3, p1 = p0 + 0.12;
        sd += "M" + f1(x0 + dir * w * p0) + " " + f1(y - 20) + "H" + f1(x0 + dir * w * p1) + "V" + f1(y + h + 20) + "H" + f1(x0 + dir * w * p0) + "Z";
      }
      setA(shadeP, "d", wave ? sd : "");
      var k = 1 + 0.06 * wave * Math.sin(t * 4.2 + seed * 6 - 2.6);
      setA(inner, "transform", "translate(" + f1(x0) + " " + f1(y + h * (1 - k) * 0.5) + ") scale(" + dir + " " + k.toFixed(3) + ")");
      if (pop != null) {
        var pk = popK(t, pop, 0.4);
        setA(g, "transform", "translate(" + f1(x) + " " + f1(y + poleH) + ") scale(" + f2(pk) + ") translate(" + f1(-x) + " " + f1(-(y + poleH)) + ")");
      }
    });
    return api;
  };

  // ------------------------- the cast: roles -------------------------
  // Local units at scale 1: head centre (0,0), head 200 x 188, shoulders (+-50, 106), hem 214, feet 278.
  var ROLES = ["officer", "general", "soldier", "sailor", "pilot", "diplomat", "civilian", "nurse", "historian"];
  var ROLE_SYN = { staff: "officer", captain: "officer", major: "officer", colonel: "officer", commander: "general", marshal: "general", admiral: "general", private: "soldier", infantry: "soldier", trooper: "soldier", troops: "soldier", army: "soldier", navy: "sailor", seaman: "sailor", airman: "pilot", aviator: "pilot", flyer: "pilot", ambassador: "diplomat", envoy: "diplomat", minister: "diplomat", clerk: "diplomat", politician: "diplomat", citizen: "civilian", worker: "civilian", person: "civilian", man: "civilian", woman: "civilian", medic: "nurse", doctor: "nurse", host: "historian", narrator: "historian", professor: "historian", teacher: "historian" };
  function roleKey(n, def) { n = str(n).toLowerCase(); if (ROLES.indexOf(n) >= 0) return n; return ROLE_SYN[n] || def || "officer"; }
  function specOf(spec) {
    if (typeof spec === "string") {
      var ws = spec.toLowerCase().split(/[\s,/_-]+/), role = null, nat = null;
      ws.forEach(function (w) { if (!role && (ROLES.indexOf(w) >= 0 || ROLE_SYN[w])) role = roleKey(w); else if (!nat && nationKey(w, null)) nat = nationKey(w, null); });
      return { role: role || "officer", nation: nat || "neutral" };
    }
    spec = obj(spec);
    var r = roleKey(spec.role, "officer");
    return { role: r, nation: r === "historian" && !spec.nation ? "neutral" : nationKey(spec.nation) };
  }
  // Costume colours for a role + nation.
  function costume(role, nation) {
    var n = NATIONS[nation] || NATIONS.neutral, b = n.b, c = { role: role, nation: nation, skin: SKIN, hair: "#4A3B32", boot: "#3A2E2A", badge: GOLD };
    c.patch = lum(b.field) > 0.75 ? b.c2 : b.field;
    c.accent = natColor(nation);
    if (role === "officer" || role === "general" || role === "soldier") { c.top = n.uni; c.sleeve = n.uni; c.legs = n.uni2; c.cap = n.cap; }
    if (role === "general") { c.top = shade(n.uni, 0.92); c.sleeve = c.top; c.hair = "#B5B2AA"; }
    if (role === "soldier") c.helmet = shade(n.uni, 0.86);
    if (role === "sailor") { c.top = "#2F3E6B"; c.sleeve = "#2F3E6B"; c.legs = "#2A3760"; c.cap = "#FFFFFF"; }
    if (role === "pilot") { c.top = "#7A4E2D"; c.sleeve = "#7A4E2D"; c.legs = n.uni2; c.cap = "#6A4226"; }
    if (role === "diplomat") { c.top = "#3E4150"; c.sleeve = "#3E4150"; c.legs = "#34363F"; c.hair = "#3A3330"; c.boot = "#22212A"; }
    if (role === "civilian") { c.top = "#8A5E3C"; c.sleeve = "#8A5E3C"; c.legs = "#6B5E4E"; c.cap = "#7A7468"; }
    if (role === "nurse") { c.top = "#8FB3CC"; c.sleeve = "#8FB3CC"; c.legs = "#F2EDE3"; c.hair = "#6B4A33"; c.cap = "#FFFFFF"; c.boot = "#5A4A42"; }
    if (role === "historian") { c.top = "#8B6B4A"; c.sleeve = "#8B6B4A"; c.legs = "#5E4A38"; c.hair = "#D8D4CC"; }
    c.ink = INK;
    return c;
  }
  var TORSO_D = "M-30 82Q-52 84-54 106L-58 198Q-58 214-43 214L43 214Q58 214 58 198L54 106Q52 84 30 82Z";
  function torsoMarkup(c) {
    var o = SK(INK, 5), o3 = SK(INK, 3), m = P(TORSO_D, c.top, o), role = c.role, nb = NATIONS[c.nation].b;
    if (role === "officer" || role === "general" || role === "soldier") {
      m += P("M-26 84L0 112L26 84", "none", SK(shade(c.top, 0.75), 4));
      m += R(-22, 88, 12, 9, c.patch, 2, SK(INK, 2)) + R(10, 88, 12, 9, c.patch, 2, SK(INK, 2));
      m += R(-56, 168, 112, 16, "#5A3E2B", 3, o3) + R(-9, 166, 18, 20, GOLD, 3, SK(INK, 2.5));
      [122, 146].forEach(function (y) { m += C(0, y, 3.6, role === "soldier" ? shade(c.top, 0.6) : GOLD, SK(INK, 1.5)); });
      m += C(0, 198, 3.6, role === "soldier" ? shade(c.top, 0.6) : GOLD, SK(INK, 1.5));
      if (role !== "soldier") m += P("M-44 118h26v18h-26z M18 118h26v18h-26z", "none", SK(shade(c.top, 0.72), 3));
      if (role === "officer") m += P("M-50 94l22-6v9l-22 6z M50 94l-22-6v9l22 6z", shade(c.top, 0.7), SK(INK, 2));
      if (role === "general") {
        m += P("M-54 92l28-8v11l-28 8z M54 92l-28-8v11l28 8z", GOLD, SK(INK, 2));
        m += R(-46, 114, 10, 7, "#B8483A", 1, SK(INK, 1.5)) + R(-35, 114, 10, 7, "#2F4373", 1, SK(INK, 1.5)) + R(-24, 114, 10, 7, "#D8B24A", 1, SK(INK, 1.5));
        m += C(-40, 133, 6, GOLD, SK(INK, 2)) + C(-24, 135, 6, "#C9CDD3", SK(INK, 2)) + P("M-40 127v-6M-24 129v-6", "none", SK("#B8483A", 3));
        m += P("M18 104Q36 118 48 104", "none", SK(GOLD, 4));
      }
      if (role === "soldier") {
        m += P("M-40 90L22 168M40 90L-22 168", "none", SK("#4A3424", 9)) + P("M-40 90L22 168M40 90L-22 168", "none", SK("#6E4E36", 5));
        m += R(-50, 176, 22, 20, "#6E4E36", 4, o3) + R(28, 176, 22, 20, "#6E4E36", 4, o3);
      }
    } else if (role === "sailor") {
      m += P("M-46 88L-10 140L0 128L10 140L46 88Q30 82 0 84Q-30 82-46 88Z", "#FFFFFF", o3);
      m += P("M-40 92L-8 136M40 92L8 136", "none", SK("#2F3E6B", 3));
      m += P("M-10 128L0 146L10 128Z", c.accent, SK(INK, 2.5)) + P("M-4 144L-12 172M4 144L12 172", "none", SK(c.accent, 6));
      m += R(-56, 176, 112, 10, shade(c.top, 0.8), 2);
    } else if (role === "pilot") {
      m += P("M0 96V212", "none", SK(shade(c.top, 0.6), 3)) + R(-56, 172, 112, 14, "#4A3020", 3, o3);
      m += P("M-58 92Q-60 74-40 76Q-30 64-14 74Q0 64 14 74Q30 64 40 76Q60 74 58 92Q40 104 0 100Q-40 104-58 92Z", "#F0E3C4", o3);
      m += R(-46, 118, 26, 20, shade(c.top, 0.82), 4, SK(INK, 2.5)) + R(26, 122, 18, 12, c.patch, 2, SK(INK, 2));
    } else if (role === "diplomat") {
      m += P("M-24 84L0 150L24 84Z", "#FFFFFF", o3);
      m += P("M-7 92L0 100L7 92L4 140L0 150L-4 140Z", c.accent, SK(INK, 2.5));
      m += P("M-26 84L-4 152M26 84L4 152", "none", SK(shade(c.top, 0.6), 4));
      m += P("M28 120h16v6h-16z", "#FFFFFF", SK(INK, 2)) + C(-34, 118, 4, GOLD, SK(INK, 1.5));
      [168, 192].forEach(function (y) { m += C(0, y, 3.4, "#1E1F26"); });
    } else if (role === "civilian") {
      m += P("M-22 84L0 128L22 84Z", "#EFE3C8", o3);
      m += P("M-34 84Q0 102 34 84Q36 96 20 104Q0 112-20 104Q-36 96-34 84Z", c.accent, SK(INK, 3)) + P("M14 100L22 136L30 132L22 98Z", c.accent, SK(INK, 2.5));
      m += P("M-26 84L-6 150M26 84L6 150", "none", SK(shade(c.top, 0.65), 4));
      m += R(-46, 150, 24, 20, shade(c.top, 0.82), 4, SK(INK, 2.5)) + R(22, 150, 24, 20, shade(c.top, 0.82), 4, SK(INK, 2.5));
    } else if (role === "nurse") {
      m += P("M-28 100H28V132H-28Z", "#FFFFFF", o3) + P("M-40 136H40L48 212H-48Z", "#FFFFFF", o3);
      m += P("M-28 100L-46 86M28 100L46 86", "none", SK("#FFFFFF", 6)) + R(-48, 130, 96, 8, "#E8E1D4", 2, SK(INK, 2));
      m += P(heartD(0, 116, 9), ACC, SK(INK, 1.5));
    } else if (role === "historian") {
      for (var i = 0; i < 18; i++) { var hx = -44 + (i % 6) * 17 + (Math.floor(i / 6) % 2) * 8, hy = 120 + Math.floor(i / 6) * 28; m += L(hx, hy, hx + 6, hy + 4, shade(c.top, 0.78), 2.5); }
      m += P("M-22 84L0 128L22 84Z", "#F4EEDF", o3);
      m += P("M-26 84L-6 150M26 84L6 150", "none", SK(shade(c.top, 0.62), 4));
      m += P("M0 96L-20 86V108ZM0 96L20 86V108Z", ACC, SK(INK, 2.5)) + C(0, 96, 5, shade(ACC, 0.8), SK(INK, 2));
      m += R(22, 112, 22, 6, "#2F4373", 2) + C(-34, 176, 3.4, "#3E2E22") + C(-34, 196, 3.4, "#3E2E22");
    }
    if (role === "nurse" || role === "civilian" || role === "diplomat" || role === "historian" || role === "pilot") void nb;
    return m;
  }
  function heartD(cx, cy, s) {
    return "M" + f1(cx) + " " + f1(cy + s) + "C" + f1(cx - s * 1.6) + " " + f1(cy) + " " + f1(cx - s) + " " + f1(cy - s * 1.1) + " " + f1(cx) + " " + f1(cy - s * 0.4) + "C" + f1(cx + s) + " " + f1(cy - s * 1.1) + " " + f1(cx + s * 1.6) + " " + f1(cy) + " " + f1(cx) + " " + f1(cy + s) + "Z";
  }
  var HAIR_D = "M-101 -8C-108 -118 108 -118 101 -8C88 -58 30 -72-20 -60C-60 -52-90 -36-101 -8Z";
  // Hair (back = behind the head, front = on the face edge). hatless: drawn when the hat is in the hand.
  function hairMarkup(c, part, hatless) {
    var role = c.role, h = c.hair, o = SK(INK, 4);
    var capRole = role === "officer" || role === "general" || role === "soldier" || role === "sailor" || role === "pilot" || role === "civilian";
    if (part === "back") {
      if (role === "nurse") return P("M-104 -10C-118 -120 118 -120 104 -10L108 48Q96 74 80 60L-80 60Q-96 74-108 48Z", h, o);
      return "";
    }
    if (role === "diplomat") return P(HAIR_D, h, o);
    if (role === "historian") return P("M-102 -6C-112 -60-92 -70-74 -60C-76 -40-88 -24-96 10Z M102 -6C112 -60 92 -70 74 -60C76 -40 88 -24 96 10Z", h, o) + P("M-40 -88Q0 -100 40 -88", "none", SK(shade(h, 0.85), 3));
    if (role === "nurse") return P("M-100 -4C-104 -104 104 -104 100 -4C84 -56 40 -58 0 -46C-40 -58-84 -56-100 -4Z", h, o);
    if (hatless || !capRole) return P(HAIR_D, h, o);
    // sideburns under a cap
    return P("M-100 -40Q-104 -6-94 8Q-90 -14-84 -36Z M100 -40Q104 -6 94 8Q90 -14 84 -36Z", h, SK(INK, 3));
  }
  // Hat markup in head units. fxs = sideways shift for the facing side (front parts).
  function hatMarkup(c) {
    var role = c.role, o = SK(INK, 5), o3 = SK(INK, 3), nb = NATIONS[c.nation].b, m = { back: "", crown: "", front: "" };
    if (role === "officer" || role === "general") {
      var band = role === "general" ? "#A3262E" : shade(c.cap, 0.7);
      m.crown = P("M-96 -50C-122 -118-40 -132 0 -128C40 -132 122 -118 96 -50Z", c.cap, o) + R(-94, -66, 188, 20, band, 4, o3);
      m.front = P("M-74 -48Q0 -14 74 -48Q0 -30-74 -48Z", "#26242C", SK(INK, 4)) + C(0, -88, 13, GOLD, SK(INK, 3)) + emblemMarkup(nb.em === "ring" ? "dot" : nb.em, 0, -88, 16, INK);
      if (role === "general") m.front += P("M-60 -42Q0 -18 60 -42", "none", SK(GOLD, 4)) + P("M-80 -56Q0 -40 80 -56", "none", SK(GOLD, 3));
    } else if (role === "soldier") {
      var hc = c.helmet, ht = NATIONS[c.nation].helmet;
      if (ht === "flared") m.crown = P("M-98 -34C-110 -142 110 -142 98 -34L112 -6Q100 -20 84 -22Q0 -40-84 -22Q-100 -20-112 -6Z", hc, o);
      else if (ht === "brimmed") m.crown = E(0, -58, 126, 18, shade(hc, 0.9), o) + P("M-80 -60C-86 -136 86 -136 80 -60Q0 -70-80 -60Z", hc, o);
      else if (ht === "crest") m.crown = P("M-100 -30C-110 -136 110 -136 100 -30Q0 -46-100 -30Z", hc, o) + P("M-16 -118Q0 -150 16 -118Z", shade(hc, 0.85), o3) + P("M-110 -30Q0 -52 110 -30", "none", SK(INK, 9)) + P("M-110 -30Q0 -52 110 -30", "none", SK(shade(hc, 0.9), 4));
      else m.crown = P("M-102 -22C-114 -144 114 -144 102 -22Q0 -42-102 -22Z", hc, o) + P("M-102 -24Q0 -44 102 -24", "none", SK(shade(hc, 0.75), 3));
      m.front = '<g transform="translate(0 -84)">' + R(-15, -10, 30, 20, nb.field, 3, SK(INK, 2.5)) + emblemMarkup(nb.em, 0, 0, 14, nb.ec, nb.field) + "</g>";
    } else if (role === "sailor") {
      m.back = P("M60 -50Q96 -10 88 40L76 36Q82 -8 50 -44Z M74 -50Q118 -20 116 26L104 26Q104 -14 66 -46Z", "#26242C", SK(INK, 2.5));
      m.crown = P("M-88 -52C-94 -98 94 -98 88 -52Z", "#FFFFFF", o) + E(0, -94, 104, 22, "#FFFFFF", o) + R(-90, -68, 180, 18, "#26242C", 3, o3) + R(-26, -64, 52, 10, c.accent, 2);
    } else if (role === "pilot") {
      m.crown = P("M-106 16C-116 -132 116 -132 106 16L84 26C84 -36-84 -36-84 26Z", c.cap, o) + P("M0 -94V-44", "none", SK(shade(c.cap, 0.7), 3)) + E(-100, 20, 14, 24, shade(c.cap, 0.88), o3) + E(100, 20, 14, 24, shade(c.cap, 0.88), o3);
      m.front = R(-96, -70, 192, 14, "#3E3030", 6, o3) + C(-34, -64, 21, "#9CC7E0", SK(INK, 5)) + C(34, -64, 21, "#9CC7E0", SK(INK, 5)) + C(-34, -64, 13, "#BFE0F0") + C(34, -64, 13, "#BFE0F0") + P("M-42 -72l8-6M26 -72l8-6", "none", SK("#FFFFFF", 4));
    } else if (role === "civilian") {
      m.crown = P("M-98 -42C-104 -120 104 -120 98 -42Q0 -58-98 -42Z", c.cap, o) + P("M-70 -96Q0 -118 70 -96", "none", SK(shade(c.cap, 0.75), 3)) + C(0, -112, 6, shade(c.cap, 0.8), SK(INK, 2));
      m.front = P("M-64 -48Q0 -22 64 -48Q0 -36-64 -48Z", shade(c.cap, 0.8), SK(INK, 4));
    } else if (role === "nurse") {
      m.crown = P("M-62 -74L-50 -112H50L62 -74Q0 -86-62 -74Z", "#FFFFFF", o) + R(-50, -88, 100, 7, "#E36A6A", 2) + P(heartD(0, -101, 7), ACC, SK(INK, 1.5));
    }
    return m;
  }
  function hasHat(role) { return role !== "diplomat" && role !== "historian"; }
  function hasGlasses(role) { return role === "diplomat" || role === "historian"; }
  S.castInfo = function () {
    return ROLES.map(function (r) { return { role: r, hat: hasHat(r), glasses: hasGlasses(r) }; });
  };

  // ------------------------- poses (gestures) -------------------------
  // Hand targets in body units (facing +x): A = the arm on the facing side, B = the other. ab/bb: elbow bend
  // (1 out to the side, 0 down). lean/tilt/nod in degrees / units; hand: fist | point | open; osc: motion.
  var PZ = { ax: 66, ay: 196, bx: -66, by: 196, ab: 0, bb: 0, lean: 0, tilt: 0, nod: 0, sh: 0 };
  var POSES = {
    rest: {},
    point: { ax: 156, ay: 112, lean: 4, hand: "point" },
    "point-up": { ax: 124, ay: -4, ab: 1, tilt: -4, nod: -4, hand: "point" },
    "point-left": { ax: 156, ay: 112, lean: 4, hand: "point", faceTo: -1 },
    "point-down": { ax: 134, ay: 228, nod: 7, hand: "point" },
    salute: { ax: 98, ay: 8, ab: 1, tilt: -4, hand: "open" },
    shrug: { ax: 118, ay: 126, bx: -118, by: 126, sh: -7, tilt: 7, hand: "open", handB: "open" },
    "arms-up": { ax: 124, ay: 10, bx: -124, by: 10, ab: 1, bb: 1, hand: "open", handB: "open" },
    cheer: { ax: 124, ay: 6, bx: -124, by: 6, ab: 1, bb: 1, osc: "cheer" },
    fist: { ax: 100, ay: 134, lean: 3 },
    "fist-up": { ax: 120, ay: 0, ab: 1, osc: "pump" },
    facepalm: { ax: 30, ay: 34, nod: 8, tilt: 6, hand: "open" },
    think: { ax: 40, ay: 84, bx: -14, by: 150, tilt: 7, nod: -3 },
    hold: { ax: 88, ay: 146 },
    "hold-up": { ax: 116, ay: 0, ab: 1 },
    "hold-both": { ax: 46, ay: 150, bx: -46, by: 150, both: 1 },
    wave: { ax: 120, ay: 4, ab: 1, osc: "wave", hand: "open" },
    present: { ax: 158, ay: 150, lean: -2, hand: "open" },
    cross: { ax: -42, ay: 154, bx: 46, by: 146 },
    hips: { ax: 42, ay: 178, bx: -42, by: 178, ab: 1, bb: 1, tilt: -3 },
    stop: { ax: 158, ay: 96, lean: -3, hand: "open" },
    "hands-head": { ax: 98, ay: 24, bx: -98, by: 24, ab: 1, bb: 1, hand: "open", handB: "open", osc: "tremble" },
    binoculars: { ax: 32, ay: 26, bx: -32, by: 26, both: 1, nod: -3 },
    march: { ax: 70, ay: 188, bx: -70, by: 188, osc: "march" },
    hat: { ax: 40, ay: 150, nod: 4 },
  };
  var POSE_SYN = { idle: "rest", stand: "rest", none: "rest", pointing: "point", "point-right": "point", "point-forward": "point", up: "point-up", down: "point-down", saluting: "salute", shrugging: "shrug", surrender: "arms-up", raise: "arms-up", celebrate: "cheer", cheering: "cheer", victory: "cheer", punch: "fist", "fist-pump": "fist-up", "face-palm": "facepalm", thinking: "think", ponder: "think", holding: "hold", "hold-high": "hold-up", waving: "wave", hello: "wave", show: "present", presenting: "present", "arms-crossed": "cross", crossed: "cross", "hands-hips": "hips", "hands-on-hips": "hips", halt: "stop", panic: "hands-head", "hands-on-head": "hands-head", look: "binoculars", spy: "binoculars", marching: "march", walk: "march" };
  function poseKey(n) { n = str(n).toLowerCase(); return POSES[n] ? n : POSE_SYN[n] || "rest"; }
  function poseVec(n) { var p = POSES[poseKey(n)], o = {}; for (var k in PZ) o[k] = p[k] != null ? p[k] : PZ[k]; return o; }
  S.gestures = Object.keys(POSES).filter(function (k) { return k !== "hat"; });

  // ------------------------- expressions -------------------------
  // eye: dot | happy | closed | calm | big | spiral; lid: top lid line (-17 open .. 16 shut), la: lid angle (+ = inner side low)
  // ba: brow angle (+ inner up), by: brow raise, bs: far brow extra raise; sm smile, mw width, mo open, mt mouth type
  // (curve | o | wave | grin), ma asymmetry; bl blush; marks.
  var EXZ = { eye: "dot", lid: -17, la: 0, ba: 0, by: 0, bs: 0, sm: 0.2, mw: 0.8, mo: 0, mt: "curve", ma: 0, bl: 0.35, marks: [], nod: 0, shine: 0 };
  var EXPR = {
    neutral: {},
    smile: { sm: 0.75, mw: 0.95, by: 2 },
    happy: { eye: "happy", sm: 0.95, mw: 1.05, mo: 0.4, mt: "grin", bl: 0.7, by: 4 },
    excited: { eye: "dot", shine: 1, sm: 1, mw: 1.15, mo: 0.65, mt: "grin", bl: 0.75, by: 8, marks: ["sparkles"] },
    proud: { eye: "happy", sm: 0.7, mw: 0.95, nod: -6, by: 4, bl: 0.4 },
    smug: { lid: -3, la: -6, bs: 8, sm: 0.55, mw: 0.8, ma: 0.6, bl: 0.4 },
    worried: { ba: 18, by: 4, sm: -0.4, mw: 0.6, mo: 0.12, marks: ["sweat"] },
    nervous: { ba: 20, by: 6, mt: "wave", mw: 0.75, marks: ["sweat2"], bl: 0.2 },
    angry: { lid: -8, la: 20, ba: -26, by: -6, sm: -0.65, mw: 0.85, mo: 0.28, mt: "grin", bl: 0, marks: ["anger"] },
    furious: { lid: -5, la: 26, ba: -32, by: -8, sm: -0.8, mw: 1.05, mo: 0.55, mt: "grin", bl: 0, marks: ["anger", "steam"] },
    shocked: { eye: "big", by: 14, mt: "o", mo: 0.95, mw: 0.7, bl: 0, marks: ["bang"] },
    surprised: { eye: "big", by: 12, mt: "o", mo: 0.55, mw: 0.55, bl: 0.2 },
    sad: { ba: 24, by: 2, sm: -0.75, mw: 0.62, shine: 1, bl: 0.2, marks: ["tears"] },
    gloomy: { lid: -4, ba: 16, by: -2, sm: -0.45, mw: 0.5, bl: 0, marks: ["gloom"], nod: 6 },
    confused: { bs: 12, ba: 6, mt: "wave", mw: 0.6, marks: ["qmarks"], bl: 0.2 },
    thinking: { bs: 10, by: 2, mt: "o", mo: 0.18, mw: 0.4, ma: 0.5, bl: 0.2 },
    determined: { lid: -9, la: 10, ba: -14, by: -4, sm: 0.15, mw: 0.85, bl: 0.2 },
    serious: { lid: -8, ba: -6, by: -4, sm: 0, mw: 0.6, bl: 0.1 },
    scared: { eye: "big", ba: 26, by: 10, mt: "wave", mo: 0.3, mw: 0.8, bl: 0, marks: ["sweat2"] },
    dizzy: { eye: "spiral", mt: "wave", mw: 0.7, bl: 0.3, marks: ["stars"] },
    tired: { lid: 1, ba: 8, by: -4, sm: -0.2, mw: 0.5, bl: 0.1 },
    sleepy: { eye: "closed", by: -2, mt: "o", mo: 0.2, mw: 0.35, bl: 0.3, marks: ["zzz"], nod: 5 },
    calm: { eye: "calm", sm: 0.5, mw: 0.75, bl: 0.4 },
    embarrassed: { ba: 16, by: 4, mt: "wave", sm: 0.3, mw: 0.7, bl: 1.2, marks: ["blush", "sweat"] },
  };
  var EXPR_SYN = { happy2: "happy", glad: "happy", joy: "happy", joyful: "happy", cheerful: "smile", grin: "happy", thrilled: "excited", amazed: "surprised", shock: "shocked", mad: "angry", rage: "furious", annoyed: "angry", afraid: "scared", fear: "scared", frightened: "scared", anxious: "nervous", sweating: "nervous", unsure: "confused", puzzled: "confused", curious: "thinking", pensive: "thinking", focused: "determined", stern: "serious", upset: "sad", crying: "sad", depressed: "gloomy", gloom: "gloomy", bored: "tired", exhausted: "tired", asleep: "sleepy", relaxed: "calm", peaceful: "calm", shy: "embarrassed", ashamed: "embarrassed", confident: "proud", smirk: "smug" };
  function exKey(n) { n = str(n).toLowerCase(); return EXPR[n] ? n : EXPR_SYN[n] || "neutral"; }
  function exprOf(n) { var p = EXPR[exKey(n)], o = {}; for (var k in EXZ) o[k] = p[k] != null ? p[k] : EXZ[k]; o.name = exKey(n); return o; }
  S.expressions = Object.keys(EXPR);

  // ------------------------- props -------------------------
  var PROPS = ["letter", "telegram", "map", "binoculars", "phone", "flag", "pointer", "mug", "sign"];
  var PROP_SYN = { envelope: "letter", mail: "letter", note: "letter", cable: "telegram", paper: "telegram", chart: "map", plan: "map", glasses: "binoculars", telephone: "phone", banner: "flag", stick: "pointer", cane: "pointer", cup: "mug", coffee: "mug", tea: "mug", board: "sign", placard: "sign", card: "sign" };
  function propKey(n) { n = str(n).toLowerCase(); if (PROPS.indexOf(n) >= 0) return n; return PROP_SYN[n] || null; }
  function signLines(text) {
    var t = plain(clean(text)) || "!", lay = layoutRich(parseRich(t.toUpperCase()), { size: 30, minSize: 12, maxWidth: 140, maxLines: 2, weight: 900 });
    return lay;
  }
  // Prop markup in prop units, the gripping point at 0,0. big: held with both hands.
  function propMarkup(name, arg, big) {
    var o = SK(INK, 4), o3 = SK(INK, 3), s = big ? 1.35 : 1;
    function sc(m) { return s === 1 ? m : '<g transform="scale(' + s + ')">' + m + "</g>"; }
    if (name === "letter") return sc(R(-34, -30, 68, 46, "#FFF4DC", 4, o) + P("M-34 -30L0 -2L34 -30", "none", o3) + C(0, -4, 7, ACC, SK(INK, 2)));
    if (name === "telegram") return sc(R(-38, -34, 76, 48, "#F6E7B4", 3, o) + R(-30, -28, 60, 8, "#C9A646", 2) + L(-28, -10, 26, -10, MUTED, 3) + L(-28, 0, 18, 0, MUTED, 3) + L(-28, 8, 24, 8, MUTED, 3));
    if (name === "map") return sc(P("M-48 -44L-16 -36L16 -44L48 -36V16L16 8L-16 16L-48 8Z", "#F3E2B8", o) + P("M-16 -36V16M16 -44V8", "none", SK(shade("#F3E2B8", 0.75), 3)) + P("M-36 0Q-20 -24 0 -12Q18 -2 34 -26", "none", SK(ACC, 3.5) + ' stroke-dasharray="6 6"') + P("M18 -30Q30 -34 36 -24Q32 -14 22 -18Z", "#9FB78A", SK(INK, 2)));
    if (name === "binoculars") return R(-38, -18, 32, 30, "#2E2C35", 8, o) + R(6, -18, 32, 30, "#2E2C35", 8, o) + R(-8, -10, 16, 12, "#4A4752", 3, o3) + C(-22, 12, 12, "#7FA7C4", SK(INK, 3)) + C(22, 12, 12, "#7FA7C4", SK(INK, 3));
    if (name === "phone") return sc(P("M-30 -38Q-40 -38-40 -26V-14Q-40 -6-30 -8L-20 -12Q-14 -14-16 -22L-18 -26Q-14 -30 0 -30Q14 -30 18 -26L16 -22Q14 -14 20 -12L30 -8Q40 -6 40 -14V-26Q40 -38 30 -38Q0 -46-30 -38Z", "#2E2C35", o));
    if (name === "flag") {
      var fl = '<g transform="translate(4 -112)">' + bannerMarkup(arg || "neutral", 66, 44) + R(0, 0, 66, 44, "none", 0, SK(INK, 3)) + "</g>";
      return P("M0 24V-118", "none", SK(INK, 9)) + P("M0 24V-118", "none", SK("#8A6A48", 5)) + fl + C(0, -120, 5, GOLD, SK(INK, 2));
    }
    if (name === "pointer") return P("M0 8L96 -78", "none", SK(INK, 10)) + P("M0 8L96 -78", "none", SK("#9A7550", 6)) + C(97, -79, 6, ACC, SK(INK, 2.5));
    if (name === "mug") return sc(R(-20, -40, 40, 44, "#F4EEDF", 6, o) + P("M20 -30Q36 -30 36 -18Q36 -6 20 -6", "none", SK(INK, 5)) + R(-20, -28, 40, 8, ACC, 0) + P("M-8 -50Q-14 -60-8 -70M8 -50Q2 -60 8 -70", "none", SK("#C9C2B0", 4)));
    if (name === "sign") {
      var lay = signLines(arg || "!"), txt = "";
      lay.lines.forEach(function (l, i) { var y = -86 + (i - (lay.lines.length - 1) / 2) * lay.size * 1.05 + lay.size * 0.36; txt += TX(0, y, l.words.map(function (w) { return w.w; }).join(" "), f1(lay.size), INK); });
      return sc(P("M0 30V-40", "none", SK(INK, 9)) + P("M0 30V-40", "none", SK("#8A6A48", 5)) + R(-80, -128, 160, 84, "#FFF4DC", 8, o) + txt);
    }
    return "";
  }
  S.props = PROPS.slice();

  // ------------------------- actor -------------------------
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
      out.push({ t0: t0 + ((t1 - t0) * i) / n, t1: t0 + ((t1 - t0) * (i + 1)) / n, v: v, k: 0.72 + 0.28 * hash(seed + i * 3.1) });
    }
    return out;
  }
  var VIS = { A: { w: 1.0, o: 1.0 }, E: { w: 1.18, o: 0.55 }, I: { w: 1.08, o: 0.45 }, O: { w: 0.68, o: 0.9 }, U: { w: 0.55, o: 0.6 } };

  VP.character = function (spec, o) {
    var v = this, sp = specOf(spec);
    o = obj(o);
    var a = { __actor: true, view: v, role: sp.role, nation: sp.nation, c: costume(sp.role, sp.nation), idx: v.actors.length };
    a.name = sp.nation + " " + sp.role;
    a.sc = Math.max(0.05, num(o.scale, 1));
    var x0 = num(o.x, v.Ww / 2), y0 = num(o.y, v.groundY - 278 * a.sc);
    a.pos = new Tr({ x: x0, y: y0 });
    a.x0 = x0; a.y0 = y0;
    var fdir = o.facing === "left" ? -1 : o.facing === "right" ? 1 : o.facing === "front" || o.facing == null ? 0 : clamp(num(o.facing, 0), -1, 1);
    if (o.mirror) fdir = -fdir;
    a.faceTr = new Tr({ f: fdir, s: fdir < 0 ? -1 : 1 });
    var g0 = poseKey(o.gesture || "rest");
    a.poseTr = new Tr(poseVec(g0));
    a.poseName = new Tr(g0);
    if (POSES[g0].faceTo && o.facing == null) a.faceTr.base = { f: POSES[g0].faceTo, s: POSES[g0].faceTo };
    a.exTr = new Tr(exKey(o.expression || "smile"));
    a.propTr = new Tr(o.prop && propKey(o.prop) ? { k: propKey(o.prop), arg: o.propArg || (propKey(o.prop) === "flag" ? sp.nation : o.propArg) } : g0 === "binoculars" ? { k: "binoculars" } : null);
    a.hatTr = new Tr(0);
    a.vis = new Tr(1);
    a.looks = [];
    a.talks = []; a.walks = []; a.hops = []; a.shakes = [];
    a.seed = 17 + v.actors.length * 31 + sp.role.length * 7 + hash(x0) * 50;
    buildActor(a, o.parent);
    v.actors.push(a);
    v.anims.push(function (t) { updActor(a, t); });
    actorMethods(a);
    return a;
  };

  function mkArm(parent, c) {
    var g = svg("g", { fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" }, parent), A = { g: g };
    A.out = svg("path", { stroke: INK, "stroke-width": 31 }, g);
    A.sl = svg("path", { stroke: c.sleeve, "stroke-width": 22 }, g);
    A.cuff = svg("path", { stroke: shade(c.sleeve, 0.8), "stroke-width": 22 }, g);
    A.fin = svg("path", { stroke: INK, "stroke-width": 15 }, g);
    A.fin2 = svg("path", { stroke: c.skin, "stroke-width": 8 }, g);
    A.hand = svg("ellipse", { rx: 15, ry: 15, fill: c.skin, stroke: INK, "stroke-width": 4.5 }, g);
    return A;
  }
  function mkLeg(parent, c) {
    var g = svg("g", null, parent), Lg = { g: g };
    Lg.out = svg("path", { stroke: INK, "stroke-width": 40, "stroke-linecap": "round", fill: "none" }, g);
    Lg.leg = svg("path", { stroke: c.legs, "stroke-width": 31, "stroke-linecap": "round", fill: "none" }, g);
    Lg.boot = svg("ellipse", { rx: 25, ry: 13, fill: c.boot, stroke: INK, "stroke-width": 4.5 }, g);
    return Lg;
  }
  function buildActor(a, parentG) {
    var v = a.view, c = a.c, o5 = SK(INK, 5), id = fuid("a");
    var g = svg("g", { class: "ch-actor" }, parentG || v.L.chars), el = { g: g };
    el.shadow = svg("ellipse", { cx: 0, cy: 279, rx: 74, ry: 12, fill: "rgba(43,42,51,0.2)" }, g);
    el.body = svg("g", null, g);
    el.legB = mkLeg(el.body, c);
    el.legA = mkLeg(el.body, c);
    el.upper = svg("g", null, el.body);
    el.torso = svg("g", null, el.upper);
    el.torso.innerHTML = torsoMarkup(c);
    el.head = svg("g", null, el.upper);
    el.headIn = svg("g", null, el.head);
    var hm = hasHat(c.role) ? hatMarkup(c) : { back: "", crown: "", front: "" };
    el.hatBack = svg("g", null, el.headIn);
    el.hatBack.innerHTML = hm.back;
    el.hairBack = svg("g", null, el.headIn);
    el.hairBack.innerHTML = hairMarkup(c, "back");
    el.ears = svg("g", null, el.headIn);
    el.ears.innerHTML = C(-98, 16, 16, c.skin, SK(INK, 4.5)) + C(98, 16, 16, c.skin, SK(INK, 4.5));
    el.skull = svg("ellipse", { cx: 0, cy: 0, rx: 102, ry: 95, fill: c.skin, stroke: INK, "stroke-width": 5.5 }, el.headIn);
    el.gloom = svg("path", { d: "M-92 -34C-80 -96 80 -96 92 -34Q0 -14-92 -34Z", fill: "#6E6496", opacity: 0 }, el.headIn);
    el.face = svg("g", null, el.headIn);
    el.blush = [svg("ellipse", { cx: -58, cy: 42, rx: 16, ry: 9, fill: "#FF8C8C" }, el.face), svg("ellipse", { cx: 58, cy: 42, rx: 16, ry: 9, fill: "#FF8C8C" }, el.face)];
    el.hatch = svg("path", { d: "M-70 36l-6 12M-58 36l-6 12M-46 36l-6 12M46 36l6 12M58 36l6 12M70 36l6 12", fill: "none", stroke: "#E0606A", "stroke-width": 3, "stroke-linecap": "round" }, el.face);
    el.eyes = [-1, 1].map(function (sd) {
      var eg = svg("g", null, el.face), e = { g: eg, sd: sd };
      e.dot = svg("g", null, eg);
      svg("ellipse", { cx: 0, cy: 0, rx: 12.5, ry: 16.5, fill: INK }, e.dot);
      e.hl = svg("circle", { cx: -4, cy: -6, r: 4.6, fill: "#FFFFFF" }, e.dot);
      e.hl2 = svg("circle", { cx: 4, cy: 6, r: 2.4, fill: "#FFFFFF" }, e.dot);
      e.big = svg("g", null, eg);
      svg("ellipse", { cx: 0, cy: 0, rx: 18, ry: 20, fill: "#FFFFFF", stroke: INK, "stroke-width": 4 }, e.big);
      e.pupil = svg("circle", { cx: 0, cy: 0, r: 5.5, fill: INK }, e.big);
      e.arc = svg("path", { d: "M-14 6Q0 -14 14 6", fill: "none", stroke: INK, "stroke-width": 5.5, "stroke-linecap": "round" }, eg);
      e.calm = svg("path", { d: "M-14 -2Q0 12 14 -2", fill: "none", stroke: INK, "stroke-width": 5.5, "stroke-linecap": "round" }, eg);
      e.line = svg("path", { d: "M-14 4H14", fill: "none", stroke: INK, "stroke-width": 5.5, "stroke-linecap": "round" }, eg);
      e.spiral = svg("path", { d: "M0 0m-2 0a2 2 0 1 1 4 0a5 5 0 1 1-9 0a9 9 0 1 1 17 0a12 12 0 1 1-23 2", fill: "none", stroke: INK, "stroke-width": 3.5, "stroke-linecap": "round" }, eg);
      e.lid = svg("rect", { x: -24, y: -60, width: 48, height: 40, fill: c.skin }, eg);
      e.lidLine = svg("path", { fill: "none", stroke: INK, "stroke-width": 4.5, "stroke-linecap": "round" }, eg);
      return e;
    });
    el.tears = svg("g", { opacity: 0 }, el.face);
    el.tears.innerHTML = R(-42, 26, 12, 56, "#8FC8EC", 6) + R(30, 26, 12, 56, "#8FC8EC", 6);
    el.brows = [-1, 1].map(function () { return svg("path", { fill: "none", stroke: c.role === "historian" ? "#9A948A" : c.role === "general" ? "#8E8A82" : "#3A2E28", "stroke-width": c.role === "historian" ? 7 : 6, "stroke-linecap": "round" }, el.face); });
    var mid = id + "m", mcp = svg("clipPath", { id: mid }, v.defsF);
    el.mclip = svg("path", null, mcp);
    el.mouth = svg("path", { fill: "#7A2A35", stroke: INK, "stroke-width": 4.5, "stroke-linejoin": "round", "stroke-linecap": "round" }, el.face);
    el.tongue = svg("ellipse", { rx: 12, ry: 7, fill: "#F07A7A", "clip-path": "url(#" + mid + ")" }, el.face);
    el.nose = svg("path", { d: "M-3 30Q0 34 3 30", fill: "none", stroke: shade(c.skin, 0.72), "stroke-width": 3, "stroke-linecap": "round" }, el.face);
    if (hasGlasses(c.role)) {
      el.glasses = svg("g", null, el.face);
      el.glasses.innerHTML = C(-34, 10, 22, "rgba(255,255,255,0.25)", SK(INK, 4)) + C(34, 10, 22, "rgba(255,255,255,0.25)", SK(INK, 4)) + P("M-12 8Q0 2 12 8", "none", SK(INK, 4));
    }
    el.hair = svg("g", null, el.headIn);
    el.hair.innerHTML = hairMarkup(c, "front", false);
    el.hairBare = svg("g", { style: "display:none" }, el.headIn);
    el.hairBare.innerHTML = hairMarkup(c, "front", true);
    el.hat = svg("g", null, el.headIn);
    el.hatCrown = svg("g", null, el.hat);
    el.hatCrown.innerHTML = hm.crown;
    el.hatFront = svg("g", null, el.hat);
    el.hatFront.innerHTML = hm.front;
    el.prop = svg("g", null, el.upper);
    el.propIn = svg("g", null, el.prop);
    el.hatHand = svg("g", { style: "display:none" }, el.upper);
    el.hatHand.innerHTML = '<g transform="rotate(-14) scale(0.54) translate(0 70)">' + hm.back + hm.crown + hm.front + "</g>";
    el.armB = mkArm(el.upper, c);
    el.armA = mkArm(el.upper, c);
    el.marks = svg("g", null, g);
    el.mk = buildMarks(el.marks);
    a.el = el;
    a.propKeyNow = "__";
  }

  // marks (not mirrored), in head units around the head centre
  function buildMarks(g) {
    var m = {};
    function grp(html) { var e = svg("g", { style: "display:none" }, g); e.innerHTML = html; return e; }
    var drop = "M0 -22C10 -6 14 2 14 8A14 14 0 0 1-14 8C-14 2-10 -6 0 -22Z";
    m.sweat = grp('<g transform="translate(96 -70)">' + P(drop, "#8FD0F2", SK(INK, 3.5)) + P("M-5 4Q-6 12 0 14", "none", SK("#FFFFFF", 3)) + "</g>");
    m.sweat2 = grp('<g transform="translate(98 -66)">' + P(drop, "#8FD0F2", SK(INK, 3.5)) + "</g>" + '<g transform="translate(-96 -54) scale(0.8)">' + P(drop, "#8FD0F2", SK(INK, 3.5)) + "</g>");
    m.anger = grp('<g transform="translate(78 -92)">' + P("M-18 -6Q-6 -6-6 -18M6 -18Q6 -6 18 -6M18 6Q6 6 6 18M-6 18Q-6 6-18 6", "none", SK(ACC, 7)) + "</g>");
    m.steam = grp(P("M-20 0C-34 0-34 -20-20 -22C-18 -36 4 -38 8 -26C22 -30 30 -10 18 -2Z", "#F4F1EA", SK(INK, 3.5)));
    m.steam2 = grp(P("M-20 0C-34 0-34 -20-20 -22C-18 -36 4 -38 8 -26C22 -30 30 -10 18 -2Z", "#F4F1EA", SK(INK, 3.5)));
    m.bang = grp(P("M70 -110L84 -150M100 -96L130 -124M110 -66L148 -74", "none", SK(INK, 6)) + '<g transform="translate(-96 -122)">' + P("M-7 -34H7L4 6H-4Z", ACC, SK(INK, 3)) + C(0, 18, 7, ACC, SK(INK, 3)) + "</g>");
    m.q1 = grp(TX(0, 0, "?", 62, "#5B6FD0", SK(INK, 4) + ' paint-order="stroke"'));
    m.q2 = grp(TX(0, 0, "?", 46, "#5B6FD0", SK(INK, 4) + ' paint-order="stroke"'));
    m.sp = [0, 1, 2].map(function () { return grp(P(starD(0, 0, 16, 5, 4, -90), GOLD, SK(INK, 2.5))); });
    m.st = [0, 1, 2].map(function () { return grp(P(starD(0, 0, 13, 6, 5, -90), GOLD, SK(INK, 2.5))); });
    m.z = [0, 1, 2].map(function (i) { return grp(TX(0, 0, "Z", 34 - i * 6, "#5B6FD0", SK(INK, 3) + ' paint-order="stroke"')); });
    m.gl = grp(P("M-60 -60V-20M-30 -74V-28M0 -78V-30M30 -74V-28M60 -60V-20", "none", SK("#4E4680", 5) + ' stroke-dasharray="9 7"'));
    return m;
  }

  // ------------------------- rig at time t -------------------------
  function faceAt(a, t) { var fz = a.faceTr.val(t); return { f: clamp(fz.f, -1, 1), s: fz.s < 0 ? -1 : 1 }; }
  function talkAt(a, t) {
    for (var i = 0; i < a.talks.length; i++) {
      var w = a.talks[i];
      if (t < w.from - 0.05 || t > w.to + 0.25) continue;
      var env = smooth((t - w.from + 0.05) / 0.2) * smooth((w.to + 0.25 - t) / 0.3), amp = 0, vv = "A";
      for (var j = 0; j < w.syl.length; j++) {
        var q = w.syl[j];
        if (t >= q.t0 && t < q.t1) { amp = Math.pow(Math.sin((PI * (t - q.t0)) / (q.t1 - q.t0)), 0.8) * q.k; vv = q.v; break; }
      }
      return { amp: amp, v: vv, env: env };
    }
    return { amp: 0, v: "A", env: 0 };
  }
  function blinkAt(a, t) {
    var tb = 0.6 + hash(a.seed) * 1.8, k = 0;
    while (tb < t + 0.2 && k < 400) {
      if (t >= tb && t < tb + 0.16) return Math.sin((PI * (t - tb)) / 0.16);
      tb += 2.3 + hash(a.seed + ++k * 1.37) * 2.4;
    }
    return 0;
  }
  function rot(p, ang, cx, cy) { var r_ = rad(ang), cs = Math.cos(r_), sn = Math.sin(r_), dx = p[0] - cx, dy = p[1] - cy; return [cx + dx * cs - dy * sn, cy + dx * sn + dy * cs]; }
  var UA = 48, FA = 44;
  function ik(sx, sy, tx, ty, out, side) {
    var dx = tx - sx, dy = ty - sy, d = Math.sqrt(dx * dx + dy * dy) || 1, L1 = UA, L2 = FA, k = 1;
    if (d > (L1 + L2) * 0.985) { k = Math.min(1.5, d / ((L1 + L2) * 0.985)); L1 *= k; L2 *= k; }
    if (d > L1 + L2) { tx = sx + (dx / d) * (L1 + L2) * 0.999; ty = sy + (dy / d) * (L1 + L2) * 0.999; dx = tx - sx; dy = ty - sy; d = Math.sqrt(dx * dx + dy * dy); }
    var ca = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1), al = Math.acos(ca), ph = Math.atan2(dy, dx);
    var e1 = [sx + L1 * Math.cos(ph + al), sy + L1 * Math.sin(ph + al)], e2 = [sx + L1 * Math.cos(ph - al), sy + L1 * Math.sin(ph - al)];
    // out: elbow away from the body (x * side larger); else: elbow lower (y larger)
    var sc1 = out ? e1[0] * side + e1[1] * 0.25 : e1[1] + e1[0] * side * 0.35, sc2 = out ? e2[0] * side + e2[1] * 0.25 : e2[1] + e2[0] * side * 0.35;
    return { e: sc1 >= sc2 ? e1 : e2, h: [tx, ty] };
  }
  function rigAt(a, t) {
    if (a._rt === t && a._r) return a._r;
    var pv = Object.assign({}, a.poseTr.val(t)), pk = a.poseName.key(t), pname = pk.v, since = t - pk.at, PD = POSES[pname] || {};
    var fc = faceAt(a, t), pos = a.pos.val(t), jx = 0, hop = 0, legA = 0, legB = 0, liftA = 0, liftB = 0, bob = 0;
    if (a.posFn) pos = a.posFn(t, pos);
    var wk = since < 0 ? 1 : smooth(since / 0.25), tt = t * 2 * PI;
    var walking = false;
    a.walks.forEach(function (w) {
      if (t < w.t0 || t > w.t1 + 0.05) return;
      walking = true;
      var dist = Math.abs(pos.x - w.x0) + Math.abs(pos.y - w.y0), fade = clamp(Math.min((t - w.t0) / 0.12, (w.t1 + 0.05 - t) / 0.12), 0, 1);
      var ph = (dist / (70 * a.sc)) * 2 * PI, sn = Math.sin(ph) * fade;
      legA += 24 * sn; legB -= 24 * sn;
      pv.ax += 14 * sn; pv.bx -= 14 * sn;
      bob += 6 * Math.abs(Math.cos(ph)) * fade;
    });
    if (PD.osc === "march" || (pname === "march")) {
      var mp = Math.sin(tt * 1.0);
      liftA += 22 * Math.max(0, mp) * wk; liftB += 22 * Math.max(0, -mp) * wk;
      pv.ax += 24 * mp * wk; pv.ay -= 10 * Math.max(0, mp) * wk; pv.bx -= 24 * mp * wk; pv.by -= 10 * Math.max(0, -mp) * wk;
      bob += 4 * Math.abs(mp) * wk;
    } else if (PD.osc === "cheer") {
      var cpv = Math.sin(tt * 1.4);
      pv.ay += 12 * cpv * wk; pv.by -= 12 * cpv * wk; pv.ax += 6 * cpv * wk; pv.bx += 6 * cpv * wk;
    } else if (PD.osc === "wave") {
      pv.ax += 16 * Math.sin(tt * 1.7) * wk;
    } else if (PD.osc === "pump") {
      pv.ay += 14 * Math.max(0, Math.sin(tt * 1.6)) * wk;
    } else if (PD.osc === "tremble") {
      jx += 2.5 * Math.sin(t * 57) * wk;
    }
    a.hops.forEach(function (h) { if (t >= h.at && t < h.at + h.dur) { var hp = (t - h.at) / h.dur; hop += h.h * 4 * hp * (1 - hp); } });
    a.shakes.forEach(function (q) { if (t >= q.at && t < q.at + q.dur) jx += q.amp * Math.sin((t - q.at) * 60) * (1 - (t - q.at) / q.dur); });
    var m = talkAt(a, t), ex = exprOf(a.exTr.key(t).v);
    if (ex.name === "scared" || ex.name === "nervous") jx += 1.2 * Math.sin(t * 47);
    // breathing and talk bob
    var breath = Math.sin(t * 2.2 + a.seed);
    pv.tilt += 1.2 * Math.sin(t * 0.9 + a.seed) + 2.2 * Math.sin(t * 1.9 + a.seed) * m.env;
    pv.nod += 1.6 * m.amp + ex.nod;
    if (m.env > 0 && !PD.osc && !walking) { pv.ax += 4 * Math.sin(t * 2.8 + a.seed) * m.env; pv.ay += 5 * Math.sin(t * 3.6 + a.seed * 2) * m.env; }
    // squash on landing / gesture change
    var sq = 0;
    if (since > 0 && since < 0.3) sq = 0.035 * Math.sin((since / 0.3) * PI);
    a.hops.forEach(function (h) { var e = t - (h.at + h.dur); if (e > 0 && e < 0.22) sq += 0.07 * Math.sin((e / 0.22) * PI); });
    var sqy = 1 - sq + 0.008 * breath, sqx = 1 + sq * 0.7;
    // arms (body units, facing +x)
    var sA = [50, 106 + pv.sh], sB = [-50, 106 + pv.sh];
    var armA = ik(sA[0], sA[1], pv.ax, pv.ay, pv.ab > 0.5, 1), armB = ik(sB[0], sB[1], pv.bx, pv.by, pv.bb > 0.5, -1);
    var headP = [0, pv.nod * 0.6 + bob * -0.2];
    var popE = 0, ek = a.exTr.key(t);
    if (ek.at >= 0 && t - ek.at < 0.2) popE = 0.06 * Math.sin(((t - ek.at) / 0.2) * PI);
    var r = {
      t: t, pv: pv, pname: pname, PD: PD, f: fc.f, af: Math.abs(fc.f), s: fc.s, x: pos.x, y: pos.y, jx: jx, hop: hop + bob, sqx: sqx, sqy: sqy,
      lean: pv.lean, tilt: pv.tilt, headP: headP, sA: sA, sB: sB, armA: armA, armB: armB, legA: legA, legB: legB, liftA: liftA, liftB: liftB,
      talk: m, ex: ex, exAt: ek.at, pop: popE, walking: walking,
    };
    // world head centre (approx): head point rotated by lean about the hip, then flipped and scaled
    var hp_ = rot(headP, pv.lean, 0, 200);
    r.hx = pos.x + a.sc * (jx + fc.s * sqx * hp_[0]);
    r.hy = pos.y + a.sc * (-r.hop + 278 + sqy * (hp_[1] - 278));
    r.head = [r.hx, r.hy];
    r.w = function (p) { var q = rot(p, pv.lean, 0, 200); return [pos.x + a.sc * (jx + fc.s * sqx * q[0]), pos.y + a.sc * (-r.hop + 278 + sqy * (q[1] - 278))]; };
    a._rt = t; a._r = r;
    return r;
  }
  function P2(p) { return f1(p[0]) + " " + f1(p[1]); }
  function updArm(A, s0, arm, hand, color) {
    var e = arm.e, h = arm.h, d = "M" + P2(s0) + "L" + P2(e) + "L" + P2(h);
    setA(A.out, "d", d); setA(A.sl, "d", d);
    var vx = h[0] - e[0], vy = h[1] - e[1], vl = Math.sqrt(vx * vx + vy * vy) || 1;
    setA(A.cuff, "d", "M" + P2([h[0] - (vx / vl) * 12, h[1] - (vy / vl) * 12]) + "L" + P2([h[0] - (vx / vl) * 6, h[1] - (vy / vl) * 6]));
    var hx = h[0] + (vx / vl) * 4, hy = h[1] + (vy / vl) * 4;
    setA(A.hand, "cx", f1(hx)); setA(A.hand, "cy", f1(hy));
    var open = hand === "open";
    setA(A.hand, "rx", open ? 17 : 15); setA(A.hand, "ry", open ? 14 : 15);
    if (hand === "point") {
      var fd = "M" + f1(hx) + " " + f1(hy) + "L" + f1(hx + (vx / vl) * 20) + " " + f1(hy + (vy / vl) * 20);
      setA(A.fin, "d", fd); setA(A.fin2, "d", fd);
    } else { setA(A.fin, "d", ""); setA(A.fin2, "d", ""); }
    return [hx, hy];
  }
  function mouthD(w, sm, o, ma, type) {
    if (type === "wave") return { d: "M" + f1(-w) + " 50q" + f1(w / 3) + " -9 " + f1((w * 2) / 3) + " 0t" + f1((w * 2) / 3) + " 0t" + f1((w * 2) / 3) + " 0", open: false };
    if (o < 0.07) {
      var cy = 50 + sm * 14, ay = ma * 8;
      return { d: "M" + f1(-w) + " " + f1(50 - ay) + "Q0 " + f1(cy + sm * 4) + " " + f1(w) + " " + f1(50 + ay), open: false };
    }
    if (type === "o") { var rw = Math.max(7, w * 0.55), rh = 6 + o * 18; return { d: "M0 " + f1(46 - rh * 0.4) + "a" + f1(rw) + " " + f1(rh) + " 0 1 0 0.1 0Z", open: true, bottom: 46 + rh * 1.6 }; }
    var top = 48 - Math.max(0, sm) * 2 - o * 4, bot = 50 + Math.max(0, sm) * 10 + o * 30, ay2 = ma * 7;
    return { d: "M" + f1(-w) + " " + f1(top - ay2) + "Q0 " + f1(top + sm * 10 - o * 4) + " " + f1(w) + " " + f1(top + ay2) + "Q" + f1(w * 0.7) + " " + f1(bot) + " 0 " + f1(bot) + "Q" + f1(-w * 0.7) + " " + f1(bot) + " " + f1(-w) + " " + f1(top - ay2) + "Z", open: true, bottom: bot };
  }
  function lookVec(a, t, r) {
    var spec = "auto", lt = -1;
    for (var i = 0; i < a.looks.length; i++) { if (a.looks[i].at <= t) { spec = a.looks[i].spec; lt = a.looks[i].at; } }
    if (spec === "auto" || spec == null) return [r.talk.env > 0 ? 0 : 0.25 * r.af, 0];
    if (spec === "up") return [0.2, -1];
    if (spec === "down") return [0.2, 0.9];
    if (spec === "left" || spec === "right") return [(spec === "left" ? -1 : 1) * r.s, 0];
    if (spec === "camera" || spec === "front") return [0, 0];
    var tx, ty;
    if (spec.__actor) { var q = rigAt(spec, t); tx = q.hx; ty = q.hy; }
    else { tx = num(spec.x, r.hx); ty = num(spec.y, r.hy); }
    var dx = (tx - r.hx) * r.s, dy = ty - r.hy, dd = Math.sqrt(dx * dx + dy * dy) || 1;
    return [dx / dd, clamp(dy / dd, -1, 1)];
  }
  function updActor(a, t) {
    var el = a.el, on = a.vis.val(t) > 0.5 && viewVisible(a.view, t);
    showEl(el.g, on);
    if (!on) return;
    var r = rigAt(a, t), ex = r.ex, s = r.s, af = r.af;
    setA(el.g, "transform", "translate(" + f1(r.x) + " " + f1(r.y) + ") scale(" + a.sc.toFixed(4) + ")");
    setA(el.shadow, "rx", f1(74 * clamp(1 - r.hop * 0.006, 0.5, 1)));
    setA(el.body, "transform", "translate(" + f2(r.jx) + " " + f2(-r.hop + 278) + ") scale(" + (s * r.sqx).toFixed(3) + " " + r.sqy.toFixed(3) + ") translate(0 -278)");
    setA(el.upper, "transform", "rotate(" + f2(r.lean) + " 0 200)");
    // legs
    [[el.legA, 24, r.legA, r.liftA], [el.legB, -24, r.legB, r.liftB]].forEach(function (q) {
      var Lg = q[0], hx = q[1], ang = rad(q[2]), len = 60 - q[3] * 0.5, fx = hx + Math.sin(ang) * len, fy = 202 + Math.cos(ang) * len - q[3];
      var d = "M" + hx + " 202L" + f1(fx) + " " + f1(fy);
      setA(Lg.out, "d", d); setA(Lg.leg, "d", d);
      setA(Lg.boot, "cx", f1(fx + 6 * af)); setA(Lg.boot, "cy", f1(fy + 6));
    });
    // head
    var pop = 1 + r.pop;
    setA(el.head, "transform", "translate(" + f1(r.headP[0]) + " " + f1(r.headP[1]) + ") rotate(" + f2(r.tilt) + " 0 80) scale(" + pop.toFixed(3) + ")");
    var fx = af * 22, lk = lookVec(a, t, r);
    setA(el.face, "transform", "translate(" + f1(fx + lk[0] * 4) + " " + f1(lk[1] * 4) + ")");
    setA(el.ears, "transform", "translate(" + f1(-af * 6) + " 0)");
    setA(el.hatFront, "transform", "translate(" + f1(af * 12) + " 0)");
    setA(el.hatCrown, "transform", "translate(" + f1(af * 3) + " 0)");
    var hatOff = a.hatTr.val(t) > 0.5;
    showEl(el.hat, !hatOff); showEl(el.hatBack, !hatOff);
    showEl(el.hair, !hatOff); showEl(el.hairBare, hatOff);
    showEl(el.hatHand, hatOff);
    // eyes
    var bl = blinkAt(a, t), mode = ex.eye;
    el.eyes.forEach(function (e, i) {
      var sd = e.sd, x = sd * 34, y = 12;
      setA(e.g, "transform", "translate(" + f1(x) + " " + y + ")");
      showEl(e.dot, mode === "dot"); showEl(e.big, mode === "big"); showEl(e.arc, mode === "happy"); showEl(e.calm, mode === "calm");
      showEl(e.line, mode === "closed"); showEl(e.spiral, mode === "spiral");
      var shine = ex.shine > 0;
      setA(e.hl, "r", shine ? 6 : 4.6); showEl(e.hl2, shine);
      setA(e.pupil, "cx", f1(lk[0] * 6)); setA(e.pupil, "cy", f1(lk[1] * 6));
      var lidOn = mode === "dot" || mode === "big";
      var lidY = lidOn ? Math.max(ex.lid, lerp(ex.lid, 17, bl)) : -40, la = ex.la * -sd;
      showEl(e.lid, lidOn && lidY > -16.5); showEl(e.lidLine, lidOn && lidY > -16.5);
      if (lidOn && lidY > -16.5) {
        setA(e.lid, "transform", "rotate(" + f1(la) + " 0 " + f1(lidY) + ")");
        setA(e.lid, "y", f1(lidY - 40));
        setA(e.lidLine, "d", "M-15 " + f1(lidY) + "H15");
        setA(e.lidLine, "transform", "rotate(" + f1(la) + " 0 " + f1(lidY) + ")");
      }
    });
    // brows
    el.brows.forEach(function (b, i) {
      var sd = i ? 1 : -1, by = -16 - ex.by - (i === 1 ? ex.bs : 0), ang = ex.ba * sd;
      var x0 = sd * 20, x1 = sd * 46, y0 = by - Math.sin(rad(ex.ba)) * 6, y1 = by + Math.sin(rad(ex.ba)) * 6;
      setA(b, "d", "M" + f1(x0) + " " + f1(y0) + "Q" + f1((x0 + x1) / 2) + " " + f1(Math.min(y0, y1) - 5) + " " + f1(x1) + " " + f1(y1));
      void ang;
    });
    // mouth with lip sync
    var tk = r.talk, vz = VIS[tk.v] || VIS.A, talkO = tk.env > 0 ? tk.amp * vz.o * 0.75 : 0;
    var w = 22 * ex.mw * (tk.env > 0 ? lerp(1, vz.w, tk.amp) : 1), o = Math.max(ex.mo, talkO + ex.mo * 0.5), type = ex.mt;
    if (talkO > 0.05 && type === "wave") type = "curve";
    if (type === "curve" && o >= 0.07) type = "grin";
    var md = mouthD(w, ex.sm, o, ex.ma, type);
    setA(el.mouth, "d", md.d);
    setA(el.mouth, "fill", md.open ? "#7A2A35" : "none");
    setA(el.mouth, "stroke-width", md.open ? 4.5 : 5.5);
    setA(el.mclip, "d", md.open ? md.d : "M0 0Z");
    showEl(el.tongue, md.open && o > 0.3);
    if (md.open) { setA(el.tongue, "cx", 0); setA(el.tongue, "cy", f1((md.bottom || 70) - 6)); }
    // blush, tears, gloom
    var blv = clamp(ex.bl, 0, 1.2);
    el.blush.forEach(function (b) { setA(b, "opacity", f2(blv * 0.6)); });
    var mk = ex.marks || [];
    showEl(el.hatch, mk.indexOf("blush") >= 0);
    setA(el.tears, "opacity", mk.indexOf("tears") >= 0 ? 0.9 : 0);
    if (mk.indexOf("tears") >= 0) setA(el.tears, "transform", "translate(0 " + f1(((t * 30) % 10) * 0.6) + ")");
    setA(el.gloom, "opacity", mk.indexOf("gloom") >= 0 ? 0.38 : 0);
    updMarks(a, t, r, mk);
    // arms and props
    var PD = r.PD, hA = updArm(el.armA, r.sA, r.armA, PD.hand || "fist"), hB = updArm(el.armB, r.sB, r.armB, PD.handB || "fist");
    var pr = a.propTr.val(t), pk = pr && pr.k ? pr.k : null;
    var keyNow = pk ? pk + "|" + (pr.arg || "") + "|" + (PD.both ? 1 : 0) : "";
    if (keyNow !== a.propKeyNow) { a.propKeyNow = keyNow; el.propIn.innerHTML = pk ? propMarkup(pk, pr.arg, !!PD.both && pk !== "binoculars") : ""; }
    showEl(el.prop, !!pk);
    if (pk) {
      var px = hA[0], py = hA[1];
      if (PD.both) { px = (hA[0] + hB[0]) / 2; py = (hA[1] + hB[1]) / 2; }
      if (r.pname === "binoculars") { px = fx; py = 18; }
      setA(el.prop, "transform", "translate(" + f1(px) + " " + f1(py) + ")");
    }
    if (hatOff) setA(el.hatHand, "transform", "translate(" + f1(hA[0] - 6) + " " + f1(hA[1] - 18) + ")");
    a.handA = r.w(hA); a.handB = r.w(hB);
  }
  function updMarks(a, t, r, mk) {
    var M = a.el.mk, el = a.el;
    // head centre in g units (scaled, not mirrored)
    var hx = (r.hx - r.x) / a.sc, hy = (r.hy - r.y) / a.sc, since = r.exAt >= 0 ? t - r.exAt : 9;
    var pk = since < 0.25 ? CE.snap(since / 0.25) : 1;
    setA(el.marks, "transform", "translate(" + f1(hx) + " " + f1(hy) + ")");
    function has(k) { return mk.indexOf(k) >= 0; }
    function place(e, on, x, y, sc_, rot_) {
      showEl(e, on);
      if (on) setA(e, "transform", "translate(" + f1(x * r.s) + " " + f1(y) + ") scale(" + f2((sc_ == null ? 1 : sc_) * pk) + ")" + (rot_ ? " rotate(" + f1(rot_) + ")" : ""));
    }
    var sw = Math.sin(t * 3.1);
    place(M.sweat, has("sweat"), 0, 4 + ((since * 14) % 12), 1);
    place(M.sweat2, has("sweat2"), 0, 3 + ((since * 18) % 10), 1);
    place(M.anger, has("anger"), 0, 0, 1 + 0.12 * Math.abs(Math.sin(t * 6)));
    var st1 = (since * 0.9) % 1, st2 = (since * 0.9 + 0.5) % 1;
    place(M.steam, has("steam"), 96 + st1 * 30, -60 - st1 * 70, 0.6 + st1 * 0.6);
    place(M.steam2, has("steam"), -96 - st2 * 30, -60 - st2 * 70, 0.6 + st2 * 0.6);
    place(M.bang, has("bang"), 0, 0, 1);
    place(M.q1, has("qmarks"), 92, -112 + 6 * sw, 1, 12 * Math.sin(t * 2.2));
    place(M.q2, has("qmarks"), 50, -150 - 6 * sw, 1, -10 * Math.sin(t * 2.6));
    M.sp.forEach(function (e, i) { var ph = t * 2.4 + i * 2.1, k = 0.6 + 0.5 * Math.abs(Math.sin(ph)); place(e, has("sparkles"), [104, -110, 70][i], [-70, -50, -130][i], k); });
    M.st.forEach(function (e, i) { var ph = t * 3 + (i * 2 * PI) / 3; showEl(e, has("stars")); if (has("stars")) setA(e, "transform", "translate(" + f1(Math.cos(ph) * 90) + " " + f1(-112 + Math.sin(ph) * 18) + ") scale(" + f2(pk) + ")"); });
    M.z.forEach(function (e, i) { var p = ((since * 0.5 + i / 3) % 1); showEl(e, has("zzz")); if (has("zzz")) setA(e, "transform", "translate(" + f1(r.s * (80 + p * 60)) + " " + f1(-90 - p * 90) + ") scale(" + f2((0.6 + p * 0.6) * pk) + ")"); });
    showEl(M.gl, has("gloom"));
  }
  function actorBox(a, t) {
    var r = rigAt(a, t), s = a.sc;
    var top = r.hy - 128 * s, bot = r.hy + 120 * s, hw = 106 * s;
    return { x: r.hx - hw, y: top, w: hw * 2, h: bot - top };
  }

  // ------------------------- actor methods -------------------------
  function actorMethods(a) {
    var v = a.view;
    function T0(at) { return tc0(at == null ? 0 : at); }
    a.box = function (t) { return actorBox(a, t == null ? V.time() : t); };
    a.headAt = function (t) { var r = rigAt(a, t == null ? V.time() : t); return { x: r.hx, y: r.hy, r: 100 * a.sc }; };
    a.mouthAt = function (t) { var r = rigAt(a, t == null ? V.time() : t); return { x: r.hx + r.s * a.sc * (22 * r.af), y: r.hy + 50 * a.sc }; };
    a.feetAt = function (t) { var p = a.pos.val(t == null ? V.time() : t); return { x: p.x, y: p.y + 278 * a.sc }; };
    a.xAt = function (t) { return a.pos.val(t).x; };
    a.expression = function (name, at) { a.exTr.set(exKey(name), T0(at)); return a; };
    a.gesture = function (name, at, dur) {
      var k = poseKey(name), t0 = T0(at), d = dur == null ? 0.22 : Math.max(0, num(dur, 0.22)), pd = POSES[k];
      a.poseTr.to(poseVec(k), t0, d, "pose");
      a.poseName.set(k, t0);
      if (pd.faceTo) a.face(pd.faceTo < 0 ? "left" : "right", t0);
      if (k === "binoculars") a.propTr.set({ k: "binoculars" }, t0);
      return a;
    };
    a.pose = a.gesture;
    a.prop = function (name, at, arg) {
      var k = name == null ? null : propKey(name);
      a.propTr.set(k ? { k: k, arg: k === "flag" ? nationKey(arg || a.nation) : arg } : null, T0(at));
      return a;
    };
    a.hatInHand = function (at, on) {
      var t0 = T0(at), yes = on !== false;
      a.hatTr.set(yes ? 1 : 0, t0);
      if (yes) { a.gesture("hat", t0, 0.35); a.propTr.set(null, t0); }
      return a;
    };
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
          syl = syl.concat(sylls(toks[i] || ["ba", "da", "lo", "me", "ta", "ku", "sio"][(i * 3 + Math.floor(a.seed)) % 7], s0, s0 + wd * pause, a.seed + i * 5));
        }
      }
      a.talks.push({ from: f0, to: t1, syl: syl });
      return a;
    };
    a.face = function (dir, at) {
      var t0 = T0(at), cur = a.faceTr.val(t0 + 1e-4), fv = dir === "front" ? 0 : dir === "left" ? -1 : dir === "right" ? 1 : typeof dir === "number" ? clamp(dir, -1, 1) : cur.f;
      a.faceTr.to({ f: fv, s: fv === 0 ? cur.s : fv < 0 ? -1 : 1 }, t0, 0.2, "inOutSine");
      return a;
    };
    a.look = function (x, y, at) { a.looks.push({ at: T0(at), spec: { x: num(x, 0), y: num(y, 0) } }); a.looks.sort(function (p, q) { return p.at - q.at; }); return a; };
    a.lookAt = function (target, at) { a.looks.push({ at: T0(at), spec: target == null ? "auto" : target }); a.looks.sort(function (p, q) { return p.at - q.at; }); return a; };
    a.moveTo = function (x, y, at, dur, ease, walk) {
      var t0 = T0(at), p0 = a.pos.val(t0), tx = num(x, p0.x), ty = num(y, p0.y), d = dur == null ? 0.5 : Math.max(0.05, num(dur, 0.5));
      if (t0 + d > D) d = Math.max(0.05, D - t0);
      a.pos.to({ x: tx, y: ty }, t0, d, ease || (walk ? "lin" : "inOutCubic"));
      if (walk) {
        a.walks.push({ t0: t0, t1: t0 + d, x0: p0.x, y0: p0.y });
        if (Math.abs(tx - p0.x) > 4) a.face(tx > p0.x ? "right" : "left", t0);
      }
      return a;
    };
    a.walkTo = function (x, y, at, dur) {
      var t0 = T0(at), p0 = a.pos.val(t0), tx = num(x, p0.x), ty = num(y, p0.y), dist = Math.abs(tx - p0.x) + Math.abs(ty - p0.y);
      return a.moveTo(tx, ty, t0, dur == null ? Math.max(0.4, dist / (190 * a.sc)) : dur, "lin", true);
    };
    a.slideIn = function (side, at, dur) {
      var t0 = T0(at), d = dur == null ? 0.5 : num(dur, 0.5), p0 = a.pos.val(t0), sd = side === "right" ? 1 : side === "bottom" ? 0 : -1;
      var sx = sd === 0 ? p0.x : sd > 0 ? v.Ww + 150 * a.sc + 40 : -150 * a.sc - 40, sy = sd === 0 ? 1000 + 140 * a.sc : p0.y;
      a.pos.set({ x: sx, y: sy }, 0);
      a.pos.to({ x: p0.x, y: p0.y }, t0, d, "out");
      a.hops.push({ at: t0 + d - 0.05, h: 12, dur: 0.26 });
      return a;
    };
    a.hop = function (at, height, dur) { a.hops.push({ at: T0(at), h: num(height, 40), dur: num(dur, 0.4) }); return a; };
    a.shake = function (at, dur, amp) { a.shakes.push({ at: T0(at), dur: num(dur, 0.4), amp: num(amp, 6) }); return a; };
    a.show = function (at) { a.vis.set(1, T0(at)); return a; };
    a.hide = function (at) { a.vis.set(0, T0(at)); return a; };
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
        if (b.gesture) a.gesture(b.gesture, t - 0.12);
        if (b.expression) a.expression(b.expression, t - 0.04);
        if (b.prop !== undefined) a.prop(b.prop, t - 0.1);
        if (b.hop) a.hop(t - 0.05, typeof b.hop === "number" ? b.hop : 30, 0.38);
        if (b.look) a.lookAt(b.look, t - 0.1);
      });
      return a;
    };
    return a;
  }
  // Speak every narration word in the range.
  function narrate(a, from, to) { if (a && a.__actor) a.say(from == null ? 0.05 : from, to == null ? D : to); return a; }
  // Idle life: small hops and gesture swaps at word boundaries (deterministic).
  function liven(a, from, to, gestures) {
    if (!a || !a.__actor) return a;
    var f0 = tc0(from == null ? 0.3 : from), t1 = to == null ? endLimit() : tc0(to), gs = arr(gestures).map(poseKey);
    if (!gs.length) gs = ["rest", "present", "rest", "point"];
    var ws = (V.words || []).filter(function (w) { return w.start >= f0 && w.start < t1 - 0.4; }), last = f0, gi = 0;
    ws.forEach(function (w, i) {
      if (w.start - last < 1.6) return;
      var h = hash(a.seed + i * 1.7);
      if (h < 0.45) a.hop(w.start, 14 + h * 20, 0.34);
      else { a.gesture(gs[gi % gs.length], w.start - 0.1); gi++; }
      last = w.start;
    });
    return a;
  }

  // ------------------------- locations -------------------------
  // Each draws into a view's layers in world units (x -400 .. Ww + 400, y 0 .. 1000). Static parts are one
  // markup string per layer; moving parts (clouds, waves, lamps, beams) are elements set from t.
  var LOCATIONS = {};
  function lgrad(v, c0, c1, vert) {
    var id = fuid("g"), g = svg("linearGradient", { id: id, x1: 0, y1: 0, x2: vert === false ? 1 : 0, y2: vert === false ? 0 : 1 }, v.defs);
    svg("stop", { offset: "0", "stop-color": c0 }, g);
    svg("stop", { offset: "1", "stop-color": c1 }, g);
    return "url(#" + id + ")";
  }
  function rgrad(v, c0, c1, op1) {
    var id = fuid("r"), g = svg("radialGradient", { id: id, cx: "50%", cy: "50%", r: "50%" }, v.defs);
    svg("stop", { offset: "0", "stop-color": c0 }, g);
    svg("stop", { offset: "1", "stop-color": c1, "stop-opacity": op1 == null ? 0 : op1 }, g);
    return "url(#" + id + ")";
  }
  function X0() { return -420; }
  function X1(v) { return v.Ww + 420; }
  function addHTML(layer, m) { var g = svg("g", null, layer); g.innerHTML = m; return g; }
  function cloudD(x, y, s) {
    return "M" + f1(x - 60 * s) + " " + f1(y + 18 * s) + "C" + f1(x - 90 * s) + " " + f1(y + 18 * s) + " " + f1(x - 86 * s) + " " + f1(y - 22 * s) + " " + f1(x - 54 * s) + " " + f1(y - 18 * s) +
      "C" + f1(x - 48 * s) + " " + f1(y - 52 * s) + " " + f1(x + 8 * s) + " " + f1(y - 56 * s) + " " + f1(x + 16 * s) + " " + f1(y - 24 * s) +
      "C" + f1(x + 40 * s) + " " + f1(y - 44 * s) + " " + f1(x + 84 * s) + " " + f1(y - 26 * s) + " " + f1(x + 70 * s) + " " + f1(y + 18 * s) + "Z";
  }
  function clouds(v, n, y0, y1, color, seed, layer) {
    var rnd = V.makeRand(seed || 5), els = [];
    for (var i = 0; i < n; i++) {
      var x = lerp(-100, v.Ww + 100, (i + rnd() * 0.6) / n), y = lerp(y0, y1, rnd()), s = 0.7 + rnd() * 0.8, sp = 6 + rnd() * 8;
      var e = svg("path", { d: cloudD(0, 0, s), fill: color || "#FFFFFF", opacity: 0.9 }, layer || v.L.sky);
      els.push({ e: e, x: x, y: y, sp: sp });
    }
    v.anims.push(function (t) { els.forEach(function (c) { var x = ((c.x + t * c.sp + 300) % (v.Ww + 600)) - 300; setA(c.e, "transform", "translate(" + f1(x) + " " + f1(c.y) + ")"); }); });
  }
  function floorBoards(v, y, color) {
    var m = R(X0(), y, X1(v) - X0(), 1100 - y, color), rnd = V.makeRand(31);
    for (var yy = y + 34, k = 0; yy < 1100; yy += 34 + k * 6, k++) m += L(X0(), yy, X1(v), yy, shade(color, 0.85), 3);
    for (var i = 0; i < 40; i++) { var bx = X0() + rnd() * (X1(v) - X0()), by = y + 10 + rnd() * 160; m += L(bx, by, bx, by + 30, shade(color, 0.82), 3); }
    return m;
  }
  function deskMarkup(x, y, w, top) { // desk with its top edge at y
    var o = SK(INK, 5), m = "";
    m += R(x - w / 2, y, w, 26, top || "#8A5A3B", 6, o);
    m += R(x - w / 2 + 14, y + 26, w * 0.32, 120, shade(top || "#8A5A3B", 0.85), 4, o) + R(x + w / 2 - 14 - w * 0.32, y + 26, w * 0.32, 120, shade(top || "#8A5A3B", 0.85), 4, o);
    m += R(x - w / 2 + 24, y + 44, w * 0.32 - 20, 30, shade(top || "#8A5A3B", 0.72), 3, SK(INK, 3)) + C(x - w / 2 + 14 + w * 0.16, y + 59, 4, GOLD);
    m += R(x + w / 2 - 4 - w * 0.32, y + 44, w * 0.32 - 20, 30, shade(top || "#8A5A3B", 0.72), 3, SK(INK, 3)) + C(x + w / 2 - 14 - w * 0.16, y + 59, 4, GOLD);
    return m;
  }

  LOCATIONS["war-room"] = function (v, o) {
    var G = v.groundY, Ww = v.Ww, P_ = v.portrait;
    var m = R(X0(), -50, X1(v) - X0(), G + 60, "#A3A88F") + R(X0(), G - 150, X1(v) - X0(), 150, "#7E8470") + L(X0(), G - 150, X1(v), G - 150, INK, 5);
    for (var x = -400; x < Ww + 400; x += 120) m += L(x, G - 140, x, G - 8, shade("#7E8470", 0.85), 4);
    m += floorBoards(v, G - 6, "#8A6A4C") + L(X0(), G - 6, X1(v), G - 6, INK, 5);
    addHTML(v.L.back, m);
    var mw = P_ ? 430 : 600, mh = P_ ? 290 : 330, mx = Ww / 2, my = P_ ? 330 : 300;
    addHTML(v.L.back, R(mx - mw / 2 - 18, my - mh / 2 - 18, mw + 36, mh + 36, "#6E4E36", 8, SK(INK, 6)));
    v.wallMap = v.map({ x: mx - mw / 2, y: my - mh / 2, w: mw, h: mh, muted: true, layer: "back", border: false });
    var fy0 = my - mh * 0.05;
    if (o.nation) v.flag(o.nation, { x: mx - mw / 2 - 70, y: fy0, w: P_ ? 80 : 110, dir: -1, layer: "back", poleH: G - fy0 - 14 });
    if (o.nation2) v.flag(o.nation2, { x: mx + mw / 2 + 70, y: fy0, w: P_ ? 80 : 110, layer: "back", poleH: G - fy0 - 14 });
    // hanging lamp
    var lamp = svg("g", null, v.L.main), lx = P_ ? Ww * 0.78 : Ww * 0.85;
    lamp.innerHTML = L(0, -80, 0, 120, INK, 5) + P("M-60 170Q-60 112 0 112Q60 112 60 170Z", "#3F6B4E", SK(INK, 5)) + E(0, 172, 44, 10, "#FFE9A8", SK(INK, 3)) + P("M-120 180L-60 172H60L120 180L180 640H-180Z", "rgba(255,236,170,0.16)");
    v.anims.push(function (t) { setA(lamp, "transform", "translate(" + f1(lx) + " 0) rotate(" + f2(2.5 * Math.sin(t * 1.3)) + " 0 -80)"); });
    // map table at the side (wide only)
    if (!P_) addHTML(v.L.main, deskMarkup(Ww * 0.9, G - 150, 260, "#7A5236") + P("M" + f1(Ww * 0.9 - 100) + " " + f1(G - 156) + "L" + f1(Ww * 0.9 - 70) + " " + f1(G - 170) + "H" + f1(Ww * 0.9 + 96) + "L" + f1(Ww * 0.9 + 110) + " " + f1(G - 156) + "Z", "#F3E2B8", SK(INK, 3)));
  };
  LOCATIONS.office = function (v, o) {
    var G = v.groundY, Ww = v.Ww, P_ = v.portrait, m = R(X0(), -50, X1(v) - X0(), G + 60, "#E9DCC0");
    for (var x = -400; x < Ww + 400; x += 64) m += R(x, -50, 24, G - 120, "#E0CFAE");
    m += R(X0(), G - 170, X1(v) - X0(), 170, "#9C6B45") + L(X0(), G - 170, X1(v), G - 170, INK, 5);
    for (x = -400; x < Ww + 400; x += 150) m += R(x + 18, G - 150, 114, 120, "none", 6, SK(shade("#9C6B45", 0.8), 4));
    // window
    var wx = P_ ? Ww * 0.5 : Ww * 0.5, ww = P_ ? 220 : 280, wy = P_ ? 150 : 120, wh = P_ ? 300 : 330;
    m += R(wx - ww / 2, wy, ww, wh, "#BFDDEB", 6, SK(INK, 6)) + R(wx - ww / 2, wy + wh * 0.62, ww, wh * 0.38, "#CFE3C0") + L(wx, wy, wx, wy + wh, INK, 6) + L(wx - ww / 2, wy + wh / 2, wx + ww / 2, wy + wh / 2, INK, 6);
    m += P("M" + f1(wx - ww / 2 - 30) + " " + f1(wy - 20) + "Q" + f1(wx - ww / 2 + 10) + " " + f1(wy + wh / 2) + " " + f1(wx - ww / 2 - 40) + " " + f1(wy + wh + 20) + "H" + f1(wx - ww / 2 - 70) + "V" + f1(wy - 20) + "Z", "#A3262E", SK(INK, 4));
    m += P("M" + f1(wx + ww / 2 + 30) + " " + f1(wy - 20) + "Q" + f1(wx + ww / 2 - 10) + " " + f1(wy + wh / 2) + " " + f1(wx + ww / 2 + 40) + " " + f1(wy + wh + 20) + "H" + f1(wx + ww / 2 + 70) + "V" + f1(wy - 20) + "Z", "#A3262E", SK(INK, 4));
    m += R(wx - ww / 2 - 90, wy - 32, ww + 180, 16, "#6E4E36", 4, SK(INK, 3));
    // bookshelf
    if (!P_) {
      var bx = Ww * 0.12;
      m += R(bx - 110, 230, 220, G - 400, "#7A5236", 6, SK(INK, 5));
      var rnd = V.makeRand(77), cols = ["#A3262E", "#2F4373", "#5E7D5A", "#C9A646", "#6B4A33"];
      for (var sh = 0; sh < 3; sh++) {
        var yb = 260 + sh * ((G - 440) / 3);
        m += R(bx - 96, yb + (G - 440) / 3 - 16, 192, 10, "#5A3E2B");
        for (var bk = 0, xx = bx - 92; xx < bx + 80; bk++) { var bw = 16 + rnd() * 14, bh = 70 + rnd() * 40; m += R(xx, yb + (G - 440) / 3 - 16 - bh, bw, bh, cols[Math.floor(rnd() * 5)], 2, SK(INK, 2.5)); xx += bw + 3; }
      }
    }
    m += R(X0(), G - 6, X1(v) - X0(), 1100 - G, "#8E3B36") + L(X0(), G - 6, X1(v), G - 6, INK, 5);
    for (var k = 0; k < 6; k++) m += L(X0(), G + 30 + k * 40, X1(v), G + 30 + k * 40, shade("#8E3B36", 0.88), 4);
    addHTML(v.L.back, m);
    var fy = P_ ? 520 : 470;
    if (o.nation) v.flag(o.nation, { x: P_ ? Ww * 0.14 : Ww * 0.3, y: fy, w: P_ ? 70 : 100, dir: -1, layer: "back", poleH: G - fy - 4 });
    if (o.nation2) v.flag(o.nation2, { x: P_ ? Ww * 0.86 : Ww * 0.7, y: fy, w: P_ ? 70 : 100, layer: "back", poleH: G - fy - 4 });
  };
  LOCATIONS.trench = function (v, o) {
    var G = v.groundY, Ww = v.Ww, night = !!o.night, top = v.portrait ? 360 : 330;
    var sky = night ? lgrad(v, "#1E2440", "#3A3F5E") : lgrad(v, "#C9D8DD", "#EFE6CF");
    var m = R(X0(), -50, X1(v) - X0(), top + 80, sky);
    if (night) { var rnd = V.makeRand(12); for (var i = 0; i < 40; i++) m += C(X0() + rnd() * (X1(v) - X0()), rnd() * top, 1.5 + rnd() * 2, "#F3EAD6", ' opacity="0.8"'); }
    addHTML(v.L.sky, m);
    var w = R(X0(), top, X1(v) - X0(), G - top + 10, night ? "#4E3F35" : "#8B6E52");
    var r2 = V.makeRand(44);
    for (i = 0; i < 26; i++) { var px = X0() + r2() * (X1(v) - X0()), py = top + 60 + r2() * (G - top - 120); w += E(px, py, 30 + r2() * 40, 10 + r2() * 8, shade(night ? "#4E3F35" : "#8B6E52", 0.86)); }
    // planks on the wall
    for (var x = -400; x < Ww + 400; x += 180) w += R(x, top + 40, 16, G - top - 40, shade(night ? "#5A4A3E" : "#7A5E44", 1), 3, SK(INK, 3));
    w += R(X0(), top + 120, X1(v) - X0(), 14, shade(night ? "#5A4A3E" : "#7A5E44", 0.9), 2, SK(INK, 3));
    // sandbags along the top
    for (x = -420, i = 0; x < Ww + 420; x += 92, i++) w += P(rrD(x, top - 44 - (i % 2) * 6, 100, 54, 24), night ? "#8A7B5E" : "#CDB98E", SK(INK, 4));
    for (x = -380, i = 0; x < Ww + 420; x += 92, i++) w += P(rrD(x, top - 86, 96, 50, 22), night ? "#7E7056" : "#C2AD80", SK(INK, 4));
    // wire posts (simple zigzag, non-graphic)
    for (x = -300; x < Ww + 300; x += 260) w += L(x, top - 86, x, top - 150, INK, 5) + P("M" + f1(x) + " " + f1(top - 140) + "l26 18l26 -18l26 18l26 -18l26 18l26 -18l26 18l26 -18l26 18", "none", SK(MUTED, 2.5));
    w += floorBoards(v, G - 4, night ? "#5A4A3E" : "#7A5E44") + L(X0(), G - 4, X1(v), G - 4, INK, 5);
    addHTML(v.L.back, w);
    if (night) {
      var fl = svg("g", null, v.L.sky);
      fl.innerHTML = C(0, 0, 90, "rgba(255,240,180,0.25)") + C(0, 0, 14, "#FFF4C8", SK(INK, 2));
      v.anims.push(function (t) { var p = (t * 0.08) % 1; setA(fl, "transform", "translate(" + f1(Ww * (0.2 + p * 0.6)) + " " + f1(100 + 80 * Math.sin(p * PI)) + ")"); });
    } else clouds(v, 4, 60, 220, "#FFFFFF", 9);
  };
  LOCATIONS.airfield = function (v, o) {
    var G = v.groundY, Ww = v.Ww;
    addHTML(v.L.sky, R(X0(), -50, X1(v) - X0(), G, lgrad(v, "#9CC9E6", "#E8EEDD")));
    clouds(v, 5, 60, 300, "#FFFFFF", 21);
    var m = P("M-420 " + f1(G - 120) + "Q" + f1(Ww * 0.2) + " " + f1(G - 260) + " " + f1(Ww * 0.5) + " " + f1(G - 150) + "T" + f1(Ww + 420) + " " + f1(G - 170) + "V" + f1(G) + "H-420Z", "#A8BF8A", SK(INK, 4));
    addHTML(v.L.back, m);
    var hx = v.portrait ? Ww * 0.78 : Ww * 0.8;
    var g = R(X0(), G - 70, X1(v) - X0(), 1100 - G + 70, "#9CB878") + L(X0(), G - 70, X1(v), G - 70, INK, 4);
    g += P("M" + f1(hx - 190) + " " + f1(G - 70) + "V" + f1(G - 250) + "Q" + f1(hx) + " " + f1(G - 420) + " " + f1(hx + 190) + " " + f1(G - 250) + "V" + f1(G - 70) + "Z", "#8E9AA3", SK(INK, 5));
    g += P("M" + f1(hx - 110) + " " + f1(G - 70) + "V" + f1(G - 220) + "H" + f1(hx + 110) + "V" + f1(G - 70) + "Z", "#4E5660", SK(INK, 4));
    for (var k = -2; k <= 2; k++) g += L(hx + k * 44, G - 220, hx + k * 44, G - 70, shade("#4E5660", 1.2), 3);
    g += R(X0(), G + 30, X1(v) - X0(), 90, "#C9C2B0", 0, SK(INK, 4));
    for (var x = -400; x < Ww + 400; x += 160) g += R(x, G + 70, 80, 10, "#FFFFFF", 3);
    addHTML(v.L.main, g);
    // windsock
    var wsx = v.portrait ? Ww * 0.12 : Ww * 0.08, sock = svg("g", null, v.L.main);
    addHTML(v.L.main, L(wsx, G - 70, wsx, G - 330, INK, 6));
    sock.innerHTML = P("M0 0L110 12V44L0 56Z", "#E36A3A", SK(INK, 4)) + R(30, 3, 22, 50, "#FFFFFF") + R(74, 8, 18, 40, "#FFFFFF") + P("M0 0L110 12V44L0 56Z", "none", SK(INK, 4));
    v.anims.push(function (t) { setA(sock, "transform", "translate(" + f1(wsx) + " " + f1(G - 330) + ") rotate(" + f2(8 + 6 * Math.sin(t * 2.3)) + ") skewY(" + f2(3 * Math.sin(t * 4)) + ")"); });
    if (o.planes) v.planes(0, 1e9, { count: num(o.planes, 2), y: 200, kind: "fighter", layer: "sky" });
  };
  LOCATIONS.city = function (v, o) {
    var G = v.groundY, Ww = v.Ww, night = !!o.night;
    addHTML(v.L.sky, R(X0(), -50, X1(v) - X0(), G, night ? lgrad(v, "#141A33", "#39406A") : lgrad(v, "#A9CBE0", "#F2E7CF")));
    if (night) {
      var beams = [0, 1, 2].map(function (i) { var b = svg("path", { d: "M-14 0L-90 -900H90L14 0Z", fill: "rgba(255,246,200,0.16)" }, v.L.sky); return b; });
      v.anims.push(function (t) { beams.forEach(function (b, i) { setA(b, "transform", "translate(" + f1(Ww * (0.2 + i * 0.3)) + " " + f1(G - 200) + ") rotate(" + f2(28 * Math.sin(t * 0.5 + i * 2)) + ")"); }); });
    } else clouds(v, 4, 70, 260, "#FFFFFF", 17);
    var rnd = V.makeRand(63), b = "", f = "", x;
    for (x = -420; x < Ww + 420;) {
      var bw = 90 + rnd() * 90, bh = 220 + rnd() * 260, col = night ? mixHex("#2B2F4A", "#454B70", rnd()) : mixHex("#B9A88E", "#D6C4A4", rnd());
      b += R(x, G - 60 - bh, bw, bh + 60, col, 0, SK(INK, 4));
      if (rnd() < 0.3) b += P("M" + f1(x) + " " + f1(G - 60 - bh) + "L" + f1(x + bw / 2) + " " + f1(G - 110 - bh) + "L" + f1(x + bw) + " " + f1(G - 60 - bh) + "Z", shade(col, 0.85), SK(INK, 4));
      for (var wy = G - 40 - bh; wy < G - 90; wy += 46) for (var wx = x + 14; wx < x + bw - 24; wx += 30) b += R(wx, wy, 14, 22, night ? (rnd() < 0.45 ? "#FFD86B" : "#22263C") : "#8FA9BC", 2);
      x += bw + 6;
    }
    addHTML(v.L.back, b);
    f += R(X0(), G - 60, X1(v) - X0(), 1100 - G + 60, night ? "#2E3048" : "#9A9384") + L(X0(), G - 60, X1(v), G - 60, INK, 5);
    for (x = -400; x < Ww + 400; x += 140) f += R(x, G + 40, 70, 10, night ? "#4A4D66" : "#C9C2B0", 3);
    addHTML(v.L.main, f);
    if (o.planes) v.planes(0, 1e9, { count: num(o.planes, 3), y: night ? 160 : 180, kind: "bomber", layer: "sky", color: night ? "#0E1122" : null });
  };
  LOCATIONS.alps = function (v, o) {
    var G = v.groundY, Ww = v.Ww;
    addHTML(v.L.sky, R(X0(), -50, X1(v) - X0(), G, lgrad(v, "#8FB9DB", "#E6EEF2")));
    clouds(v, 3, 60, 200, "#FFFFFF", 33);
    var m = "", peaks = [[-0.25, 210], [0.12, 120], [0.42, 230], [0.7, 90], [1.0, 200], [1.3, 150]];
    peaks.forEach(function (p, i) {
      var px = Ww * p[0], py = p[1], bw = 520;
      m += P("M" + f1(px - bw) + " " + f1(G - 80) + "L" + f1(px) + " " + f1(py) + "L" + f1(px + bw) + " " + f1(G - 80) + "Z", i % 2 ? "#7D8FA3" : "#8E9FB2", SK(INK, 4));
      m += P("M" + f1(px - 120) + " " + f1(py + 120 * ((G - 80 - py) / bw) * 2.2) + "L" + f1(px) + " " + f1(py) + "L" + f1(px + 120) + " " + f1(py + 120 * ((G - 80 - py) / bw) * 2.2) + "L" + f1(px + 60) + " " + f1(py + 150) + "L" + f1(px) + " " + f1(py + 110) + "L" + f1(px - 50) + " " + f1(py + 160) + "Z", "#FFFFFF", SK(INK, 3));
    });
    addHTML(v.L.back, m);
    var g = R(X0(), G - 90, X1(v) - X0(), 1100 - G + 90, "#F4F6F8") + P("M-420 " + f1(G - 90) + "Q" + f1(Ww * 0.3) + " " + f1(G - 130) + " " + f1(Ww * 0.6) + " " + f1(G - 92) + "T" + f1(Ww + 420) + " " + f1(G - 100) + "V" + f1(G - 70) + "H-420Z", "#FFFFFF", SK(INK, 4));
    var rnd = V.makeRand(8);
    for (var i = 0; i < 9; i++) {
      var tx = -300 + (i / 8) * (Ww + 600) + rnd() * 60, th = 140 + rnd() * 90, ty = G - 80;
      if (Math.abs(tx - Ww * 0.5) < Ww * 0.25) continue;
      g += R(tx - 8, ty - 30, 16, 34, "#6B4A33", 2, SK(INK, 3)) + P("M" + f1(tx - 60) + " " + f1(ty - 24) + "L" + f1(tx) + " " + f1(ty - th) + "L" + f1(tx + 60) + " " + f1(ty - 24) + "Z", "#3F6B4E", SK(INK, 4)) + P("M" + f1(tx - 30) + " " + f1(ty - th * 0.62) + "L" + f1(tx) + " " + f1(ty - th) + "L" + f1(tx + 30) + " " + f1(ty - th * 0.62) + "Q" + f1(tx) + " " + f1(ty - th * 0.7) + " " + f1(tx - 30) + " " + f1(ty - th * 0.62) + "Z", "#FFFFFF");
    }
    // border post: barrier and sign
    var bx = v.portrait ? Ww * 0.8 : Ww * 0.78;
    g += R(bx - 120, G - 210, 16, 140, "#6B4A33", 3, SK(INK, 4)) + R(bx - 150, G - 260, 220, 120, "#B5895E", 6, SK(INK, 5)) + P("M" + f1(bx - 162) + " " + f1(G - 256) + "L" + f1(bx - 40) + " " + f1(G - 330) + "L" + f1(bx + 82) + " " + f1(G - 256) + "Z", "#7A5236", SK(INK, 5)) + R(bx - 110, G - 230, 50, 44, "#BFDDEB", 3, SK(INK, 3));
    var bar = "";
    for (var k = 0; k < 8; k++) bar += R(bx - 300 + k * 36, G - 150, 36, 18, k % 2 ? "#FFFFFF" : "#C8463D");
    g += bar + R(bx - 300, G - 150, 288, 18, "none", 4, SK(INK, 4)) + R(bx - 316, G - 166, 22, 96, "#4A4558", 3, SK(INK, 4));
    addHTML(v.L.main, g);
    if (o.sign) {
      var sx = v.portrait ? Ww * 0.22 : Ww * 0.16, lay = signLines(o.sign), t_ = "";
      lay.lines.forEach(function (l, i) { t_ += TX(sx, G - 280 + (i - (lay.lines.length - 1) / 2) * lay.size * 1.05 + lay.size * 0.36, l.words.map(function (w) { return w.w; }).join(" "), f1(lay.size), INK); });
      addHTML(v.L.main, R(sx - 6, G - 240, 12, 170, "#6B4A33", 3, SK(INK, 3)) + R(sx - 86, G - 326, 172, 92, "#FFF4DC", 8, SK(INK, 5)) + t_);
    }
    if (o.snow !== false) v.snow(0, 1e9, { count: 40 });
  };
  LOCATIONS.sea = function (v, o) {
    var G = v.groundY, Ww = v.Ww, hz = G - 330;
    addHTML(v.L.sky, R(X0(), -50, X1(v) - X0(), hz + 60, o.night ? lgrad(v, "#1A2140", "#3D4A70") : lgrad(v, "#9CC6E2", "#EAF0E6")));
    if (!o.night) clouds(v, 4, 60, hz - 160, "#FFFFFF", 41);
    var m = R(X0(), hz, X1(v) - X0(), G - hz + 60, o.night ? "#24365C" : "#3F7FA8") + L(X0(), hz, X1(v), hz, INK, 4);
    // distant ships (generic silhouettes)
    [[0.2, 1], [0.72, 0.7]].forEach(function (q) {
      var sx = Ww * q[0], s = q[1];
      m += P("M" + f1(sx - 110 * s) + " " + f1(hz - 4) + "L" + f1(sx - 90 * s) + " " + f1(hz + 14 * s) + "H" + f1(sx + 100 * s) + "L" + f1(sx + 124 * s) + " " + f1(hz - 4) + "Z", "#4A5560", SK(INK, 3)) + R(sx - 40 * s, hz - 34 * s, 60 * s, 30 * s, "#5E6A76", 2, SK(INK, 3)) + R(sx - 6 * s, hz - 64 * s, 14 * s, 30 * s, "#4A5560", 2, SK(INK, 3));
    });
    addHTML(v.L.back, m);
    var waves = [0, 1, 2].map(function (i) { return svg("path", { fill: i % 2 ? (o.night ? "#2C4068" : "#5592B9") : (o.night ? "#33497A" : "#4B88B0"), stroke: INK, "stroke-width": 3 }, v.L.back); });
    v.anims.push(function (t) {
      waves.forEach(function (wv, i) {
        var y = hz + 70 + i * 80, d = "M-440 " + f1(y);
        for (var x = -440; x <= Ww + 440; x += 60) d += "Q" + f1(x + 30) + " " + f1(y - 16 + 6 * Math.sin(t * 1.6 + x * 0.02 + i)) + " " + f1(x + 60) + " " + f1(y);
        d += "V" + f1(G + 80) + "H-440Z";
        setA(wv, "d", d);
        setA(wv, "transform", "translate(" + f1(((t * (16 + i * 8)) % 60) * (i % 2 ? -1 : 1)) + " " + f2(4 * Math.sin(t * 1.2 + i)) + ")");
      });
    });
    // deck and rail
    var dk = R(X0(), G - 20, X1(v) - X0(), 1100 - G + 20, "#A8835E") + L(X0(), G - 20, X1(v), G - 20, INK, 5);
    for (var k = 0; k < 5; k++) dk += L(X0(), G + 20 + k * 36, X1(v), G + 20 + k * 36, shade("#A8835E", 0.85), 3);
    dk += R(X0(), G - 170, X1(v) - X0(), 14, "#FFFFFF", 4, SK(INK, 4)) + R(X0(), G - 100, X1(v) - X0(), 8, "#FFFFFF", 3, SK(INK, 3));
    for (var x = -400; x < Ww + 400; x += 110) dk += R(x, G - 170, 12, 150, "#FFFFFF", 3, SK(INK, 3));
    addHTML(v.L.main, dk);
    v.birds(0, 1e9, { count: 3, y: 160 });
  };
  LOCATIONS.map = function (v, o) {
    addHTML(v.L.back, R(X0(), -50, X1(v) - X0(), 1100, "#E9DCBD"));
    var mg = v.portrait ? 30 : 50, sh = obj(o.mapShift);
    v.map0 = v.map({ x: mg, y: mg, w: v.Ww - mg * 2, h: 1000 - mg * 2, view: o.view, names: o.names, shiftX: num(sh.x, 0), shiftY: num(sh.y, 0) });
  };
  LOCATIONS.plain = function (v, o) {
    var Ww = v.Ww, m = "";
    if (o.nation) {
      var b = natOf(o.nation).b, c1 = b.field, c2 = b.c2;
      m += R(X0(), -50, X1(v) - X0(), 1100, tint(c1, 0.15));
      for (var x = -1400, i = 0; x < Ww + 1400; x += 160, i++) m += P("M" + f1(x) + " -60L" + f1(x + 80) + " -60L" + f1(x + 80 + 1200) + " 1100L" + f1(x + 1200) + " 1100Z", i % 2 ? tint(c2, 0.25) : tint(c1, 0.3));
    } else m += R(X0(), -50, X1(v) - X0(), 1100, isColor(o.color) ? hex6(o.color) : BG);
    var rnd = V.makeRand(3);
    for (var k = 0; k < 120; k++) m += C(X0() + rnd() * (X1(v) - X0()), rnd() * 1000, 1.5 + rnd() * 2, "rgba(43,42,51,0.06)");
    addHTML(v.L.sky, m);
  };
  LOCATIONS.parade = function (v, o) {
    var G = v.groundY, Ww = v.Ww, nk = nationKey(o.nation || "neutral"), b = natOf(nk).b;
    addHTML(v.L.sky, R(X0(), -50, X1(v) - X0(), G, lgrad(v, "#A9CFE6", "#F3E9D2")));
    clouds(v, 3, 50, 180, "#FFFFFF", 51);
    var rnd = V.makeRand(91), m = "", x, cols = ["#D9B48A", "#C98F6B", "#E2C79E", "#B9A88E", "#D7A77B"];
    for (x = -420; x < Ww + 420;) {
      var bw = 150 + rnd() * 70, bh = 360 + rnd() * 180, col = cols[Math.floor(rnd() * cols.length)];
      m += R(x, G - 40 - bh, bw, bh + 40, col, 0, SK(INK, 4)) + R(x - 6, G - 40 - bh, bw + 12, 18, shade(col, 0.8), 2, SK(INK, 3));
      for (var wy = G - bh; wy < G - 160; wy += 92) for (var wx = x + 22; wx < x + bw - 40; wx += 52) m += R(wx, wy, 30, 48, "#7FA0B8", 3, SK(INK, 3)) + R(wx - 4, wy + 46, 38, 8, shade(col, 0.75), 2);
      m += R(x + bw / 2 - 26, G - 130, 52, 90, "#6B4A33", 4, SK(INK, 3));
      x += bw + 4;
    }
    addHTML(v.L.back, m);
    // bunting (nation colours), gently swaying
    var bunt = svg("g", null, v.L.back), bm = "";
    [0.16, 0.3].forEach(function (yy, row) {
      var y0 = 1000 * yy, path = "M-420 " + f1(y0);
      for (x = -420; x < Ww + 420; x += 300) path += "Q" + f1(x + 150) + " " + f1(y0 + 80) + " " + f1(x + 300) + " " + f1(y0);
      bm += P(path, "none", SK(INK, 3));
      for (x = -420; x < Ww + 420; x += 50) {
        var ph = ((x + 420) % 300) / 300, yy2 = y0 + 80 * 4 * ph * (1 - ph) * 0.5;
        bm += P("M" + f1(x) + " " + f1(yy2) + "h40l-20 44Z", (Math.floor((x + 420) / 50) + row) % 2 ? b.field : b.c2, SK(INK, 2.5));
      }
    });
    bunt.innerHTML = bm;
    v.anims.push(function (t) { setA(bunt, "transform", "translate(0 " + f2(3 * Math.sin(t * 1.7)) + ")"); });
    var g = R(X0(), G - 40, X1(v) - X0(), 1100 - G + 40, "#B7AC98") + L(X0(), G - 40, X1(v), G - 40, INK, 5);
    for (var yy3 = G; yy3 < 1100; yy3 += 34) for (x = -420 + ((yy3 / 34) % 2) * 30; x < Ww + 420; x += 60) g += P(rrD(x, yy3, 54, 28, 10), "#A89C86");
    addHTML(v.L.main, g);
  };
  LOCATIONS.field = function (v, o) {
    var G = v.groundY, Ww = v.Ww;
    addHTML(v.L.sky, R(X0(), -50, X1(v) - X0(), G, lgrad(v, "#E9B8A0", "#F6DDB8")) + C(Ww * 0.7, G - 260, 90, "#FFE7B0", ' opacity="0.95"') + C(Ww * 0.7, G - 260, 140, "rgba(255,231,176,0.35)"));
    clouds(v, 3, 80, 280, "#F7D4C4", 61);
    var m = P("M-420 " + f1(G - 160) + "Q" + f1(Ww * 0.25) + " " + f1(G - 250) + " " + f1(Ww * 0.55) + " " + f1(G - 170) + "T" + f1(Ww + 420) + " " + f1(G - 190) + "V" + f1(G) + "H-420Z", "#B8A57A", SK(INK, 4));
    m += P("M-420 " + f1(G - 90) + "Q" + f1(Ww * 0.35) + " " + f1(G - 150) + " " + f1(Ww * 0.7) + " " + f1(G - 96) + "T" + f1(Ww + 420) + " " + f1(G - 110) + "V" + f1(G + 20) + "H-420Z", "#9FA36E", SK(INK, 4));
    addHTML(v.L.back, m);
    var rnd = V.makeRand(19), g = R(X0(), G - 50, X1(v) - X0(), 1100 - G + 50, "#8E9A5E") + L(X0(), G - 50, X1(v), G - 50, INK, 4);
    for (var i = 0; i < 70; i++) {
      var px = X0() + rnd() * (X1(v) - X0()), py = G - 60 + rnd() * 220, s = 0.6 + (py - G + 60) / 260;
      g += L(px, py, px + 2, py + 26 * s, "#5E6E3A", 3) + C(px, py, 10 * s, "#D7263D", SK(INK, 2)) + C(px, py, 3.5 * s, INK);
    }
    addHTML(v.L.main, g);
    if (o.birds !== false) v.birds(0, 1e9, { count: 4, y: 200 });
  };
  S.LOCATIONS = LOCATIONS;
  S.locations = Object.keys(LOCATIONS);

  // ------------------------- the parchment map -------------------------
  // Rough hand-made outlines in lon/lat (deliberately simplified, cartoon accuracy), projected to a map space
  // 1000 units wide: X = (lon + 12) * 0.64 * K, Y = (70 - lat) * K. Borders are generic and timeless.
  var MK = 1000 / (54 * 0.64);
  function proj(lon, lat) { return [(lon + 12) * 0.64 * MK, (70 - lat) * MK]; }
  var LAND = {
    britain: [[-5.7, 50.0, -3.5, 50.3, 1.4, 51.2, 1.7, 52.6, 0.2, 53.5, -0.2, 54.5, -1.6, 55.6, -2.1, 57.0, -1.8, 57.6, -3.0, 58.6, -5.0, 58.6, -6.2, 57.5, -5.6, 56.3, -5.0, 55.2, -3.0, 54.9, -3.4, 54.4, -3.0, 53.4, -4.6, 53.3, -4.2, 52.3, -5.2, 51.8, -3.0, 51.4]],
    ireland: [[-6.0, 52.2, -6.2, 53.9, -5.6, 54.6, -7.3, 55.3, -8.4, 54.6, -10.0, 54.2, -9.9, 53.0, -10.3, 51.8, -8.5, 51.6]],
    france: [[2.5, 51.1, 4.2, 50.0, 5.8, 49.5, 8.2, 49.0, 7.5, 47.6, 6.0, 46.3, 7.0, 45.9, 6.8, 44.1, 7.5, 43.8, 6.0, 43.0, 4.0, 43.4, 3.1, 42.4, -1.8, 43.3, -1.2, 46.0, -2.3, 47.1, -4.6, 48.0, -4.6, 48.6, -1.6, 48.7, -1.3, 49.7, 1.5, 50.1], [8.6, 43.0, 9.5, 42.9, 9.4, 41.4, 8.7, 41.6]],
    spain: [[-1.8, 43.3, 3.1, 42.4, 3.2, 41.9, 0.8, 41.0, -0.3, 39.4, 0.2, 38.7, -0.7, 37.6, -2.1, 36.7, -4.4, 36.7, -5.6, 36.0, -6.4, 36.9, -7.4, 37.2, -7.0, 38.0, -7.3, 39.4, -6.9, 41.9, -8.2, 42.0, -9.3, 43.0, -8.0, 43.7]],
    portugal: [[-7.4, 37.2, -8.9, 37.0, -8.8, 38.7, -9.5, 39.4, -8.7, 41.2, -8.8, 41.9, -8.2, 42.0, -6.9, 41.9, -7.3, 39.4, -7.0, 38.0]],
    belgium: [[2.5, 51.1, 3.4, 51.4, 4.4, 51.4, 5.8, 51.2, 6.1, 50.6, 5.8, 49.5, 4.2, 50.0]],
    netherlands: [[3.4, 51.4, 4.0, 52.0, 4.8, 53.0, 5.6, 53.4, 7.2, 53.3, 7.0, 52.2, 6.0, 51.8, 5.8, 51.2, 4.4, 51.4]],
    germany: [[7.2, 53.3, 8.6, 53.9, 9.4, 54.8, 10.9, 54.3, 13.0, 54.4, 14.2, 53.9, 14.6, 52.6, 14.9, 51.0, 12.1, 50.3, 13.8, 48.8, 13.0, 47.5, 10.2, 47.3, 7.6, 47.6, 8.2, 49.0, 6.4, 49.5, 6.1, 50.6, 5.8, 51.2, 6.0, 51.8, 7.0, 52.2]],
    denmark: [[8.6, 53.9, 8.1, 55.5, 8.6, 57.1, 10.5, 57.6, 10.3, 56.4, 10.9, 56.0, 10.0, 55.0, 9.4, 54.8], [11.0, 55.3, 12.6, 55.6, 12.4, 56.1, 11.2, 55.9]],
    switzerland: [[6.0, 46.3, 7.5, 47.6, 8.6, 47.7, 9.6, 47.5, 10.5, 46.9, 10.1, 46.2, 9.0, 45.8, 8.4, 46.3, 7.0, 45.9]],
    austria: [[9.6, 47.5, 10.2, 47.3, 13.0, 47.5, 13.8, 48.8, 15.0, 49.0, 16.9, 48.6, 17.1, 47.7, 16.1, 46.8, 14.5, 46.4, 12.4, 46.7, 10.5, 46.9]],
    italy: [[7.0, 45.9, 8.4, 46.3, 9.0, 45.8, 10.1, 46.2, 10.5, 46.9, 12.4, 46.7, 13.7, 46.5, 13.7, 45.6, 12.3, 45.3, 12.4, 44.2, 13.6, 43.5, 14.7, 42.1, 16.1, 41.4, 18.5, 40.2, 18.3, 39.8, 16.9, 40.4, 16.5, 39.6, 17.1, 39.0, 16.2, 38.0, 15.7, 38.2, 15.8, 40.0, 14.1, 40.8, 12.5, 41.4, 11.1, 42.4, 10.2, 43.9, 8.9, 44.4, 7.6, 43.8, 6.8, 44.1], [12.4, 37.9, 15.6, 38.3, 15.1, 36.7], [8.4, 41.0, 9.8, 40.9, 9.6, 39.1, 8.4, 39.0]],
    czech: [[12.1, 50.3, 14.9, 51.0, 16.9, 50.4, 18.8, 49.5, 22.6, 49.1, 22.0, 48.4, 18.8, 47.8, 17.1, 47.7, 16.9, 48.6, 15.0, 49.0, 13.8, 48.8]],
    hungary: [[16.1, 46.8, 17.1, 47.7, 18.8, 47.8, 22.0, 48.4, 22.9, 47.9, 21.1, 46.2, 18.8, 45.9, 16.6, 46.5]],
    poland: [[14.2, 53.9, 16.5, 54.5, 18.6, 54.8, 22.8, 54.4, 23.5, 53.9, 24.0, 52.6, 23.6, 51.6, 24.1, 50.8, 22.6, 49.1, 18.8, 49.5, 16.9, 50.4, 14.9, 51.0, 14.6, 52.6]],
    balkans: [[13.7, 45.6, 13.7, 46.5, 14.5, 46.4, 16.1, 46.8, 16.6, 46.5, 18.8, 45.9, 21.1, 46.2, 22.7, 44.6, 22.4, 44.0, 22.9, 43.8, 28.6, 43.7, 28.0, 42.0, 26.1, 41.3, 23.0, 41.3, 20.6, 41.1, 19.4, 41.8, 18.5, 42.4, 16.0, 43.5, 15.2, 44.3, 14.4, 45.1]],
    romania: [[21.1, 46.2, 22.9, 47.9, 24.9, 47.7, 26.6, 48.3, 28.2, 46.8, 28.6, 45.3, 29.7, 45.2, 28.6, 43.7, 22.9, 43.8, 22.7, 44.6]],
    greece: [[20.6, 41.1, 23.0, 41.3, 26.1, 41.3, 26.0, 40.8, 23.7, 40.2, 22.6, 40.0, 23.0, 39.0, 24.0, 38.2, 23.0, 37.7, 22.8, 36.5, 21.7, 36.8, 21.1, 38.3, 20.2, 39.6], [23.6, 35.6, 26.2, 35.2, 24.0, 35.0]],
    turkey: [[26.1, 41.3, 28.0, 42.0, 29.0, 41.2, 31.2, 41.1, 34.9, 42.0, 38.3, 40.9, 41.5, 41.5, 43.0, 41.5, 43.0, 37.0, 36.2, 36.6, 35.0, 36.7, 32.5, 36.1, 30.5, 36.5, 28.0, 36.7, 27.1, 37.9, 26.2, 39.5, 26.6, 40.6]],
    norway: [[7.0, 58.0, 5.5, 58.7, 5.0, 60.0, 5.2, 61.5, 6.0, 62.5, 8.5, 63.5, 10.5, 64.5, 12.5, 66.0, 14.0, 67.5, 16.0, 68.5, 18.0, 69.8, 21.0, 70.2, 25.0, 70.8, 28.5, 70.8, 30.0, 70.0, 28.0, 69.0, 24.0, 68.6, 20.5, 69.0, 18.0, 68.3, 16.0, 67.5, 14.5, 65.5, 13.5, 64.5, 12.2, 63.5, 12.3, 61.5, 12.6, 60.0, 11.4, 59.0, 10.5, 59.3, 9.0, 58.8]],
    sweden: [[11.4, 59.0, 12.6, 60.0, 12.3, 61.5, 12.2, 63.5, 13.5, 64.5, 14.5, 65.5, 16.0, 67.5, 18.0, 68.3, 20.5, 69.0, 23.5, 67.9, 23.9, 66.0, 22.0, 65.6, 21.3, 64.4, 19.0, 63.3, 17.4, 62.3, 17.2, 61.0, 18.9, 60.0, 16.5, 57.0, 16.3, 56.3, 14.4, 55.4, 12.9, 55.5, 12.5, 56.4, 11.8, 57.6]],
    finland: [[21.3, 64.4, 22.0, 65.6, 23.9, 66.0, 23.5, 67.9, 20.5, 69.0, 21.0, 69.2, 24.0, 68.6, 28.0, 69.0, 29.0, 68.0, 30.0, 67.5, 29.5, 66.0, 30.0, 64.0, 31.5, 62.9, 28.0, 60.6, 26.0, 60.3, 23.0, 59.9, 21.4, 60.6, 21.6, 61.7, 21.1, 62.7]],
    baltics: [[21.0, 56.0, 21.0, 57.5, 22.5, 57.7, 23.5, 59.2, 28.0, 59.4, 27.6, 57.5, 28.2, 56.1, 26.6, 55.7, 26.0, 54.0, 23.5, 53.9, 22.8, 54.4]],
    ussr: [[23.5, 53.9, 24.0, 52.6, 23.6, 51.6, 24.1, 50.8, 22.6, 49.1, 22.0, 48.4, 22.9, 47.9, 24.9, 47.7, 26.6, 48.3, 28.2, 46.8, 29.7, 45.2, 30.5, 46.5, 31.8, 46.6, 33.5, 44.6, 35.4, 45.1, 37.5, 46.9, 39.0, 47.0, 38.2, 46.0, 37.5, 44.7, 40.0, 43.4, 43.0, 42.5, 43.0, 70.5, 36.0, 69.2, 33.0, 69.3, 30.8, 69.8, 29.0, 69.0, 29.0, 68.0, 30.0, 67.5, 29.5, 66.0, 30.0, 64.0, 31.5, 62.9, 28.0, 60.6, 29.5, 59.9, 28.0, 59.4, 27.6, 57.5, 28.2, 56.1, 26.6, 55.7, 26.0, 54.0]],
    "north-africa": [[-13.0, 27.5, -13.0, 28.5, -9.8, 31.2, -9.6, 33.0, -6.8, 34.0, -5.9, 35.8, -2.2, 35.1, 1.0, 36.5, 5.0, 36.9, 9.8, 37.3, 11.1, 36.9, 10.2, 35.5, 11.1, 33.3, 15.2, 32.3, 19.0, 30.3, 20.1, 32.0, 22.0, 32.9, 25.2, 31.6, 25.0, 27.5]],
    egypt: [[25.2, 31.6, 29.0, 30.9, 31.5, 31.5, 34.2, 31.3, 34.9, 29.5, 35.0, 27.5, 25.0, 27.5]],
    levant: [[34.2, 31.3, 35.5, 33.9, 36.0, 36.6, 43.0, 37.0, 43.0, 27.5, 35.0, 27.5, 34.9, 29.5]],
  };
  var MAP_PTS = {
    britain: [-1.9, 53.2], london: [-0.1, 51.5], ireland: [-8.0, 53.2], france: [2.4, 46.9], paris: [2.35, 48.86], spain: [-4.2, 39.8], madrid: [-3.7, 40.4],
    portugal: [-8.1, 39.7], germany: [10.3, 51.2], berlin: [13.4, 52.5], switzerland: [8.2, 46.85], bern: [7.45, 46.95], alps: [10.2, 46.5], italy: [12.0, 43.4],
    rome: [12.5, 41.9], sicily: [14.1, 37.5], scandinavia: [15.0, 63.0], sweden: [15.4, 61.2], stockholm: [18.07, 59.33], norway: [9.0, 61.0], denmark: [9.3, 56.0],
    poland: [19.4, 52.0], warsaw: [21.0, 52.23], ussr: [33.0, 58.0], russia: [33.0, 58.0], moscow: [37.6, 55.75], balkans: [20.5, 43.5], greece: [22.0, 39.4],
    austria: [14.3, 47.6], vienna: [16.37, 48.2], netherlands: [5.6, 52.3], belgium: [4.6, 50.6], finland: [26.0, 63.0], baltic: [19.0, 57.0], "north-sea": [3.0, 56.0],
    mediterranean: [6.0, 38.5], atlantic: [-9.5, 46.5], channel: [-1.5, 50.1], turkey: [33.0, 39.0], africa: [4.0, 33.5], "north-africa": [4.0, 33.5], egypt: [29.5, 29.8],
    czechoslovakia: [16.0, 49.6], hungary: [19.3, 47.1], romania: [25.0, 45.9], yugoslavia: [19.0, 44.2], baltics: [24.5, 56.5], denmark2: [9.3, 56.0],
  };
  var REGION_OF = { russia: "ussr", scandinavia: ["sweden", "norway"], africa: "north-africa", sicily: "italy", alps: "switzerland", czechoslovakia: "czech", yugoslavia: "balkans", london: "britain", paris: "france", berlin: "germany", rome: "italy", madrid: "spain", bern: "switzerland", vienna: "austria", warsaw: "poland", moscow: "ussr", stockholm: "sweden" };
  var PT_SYN = { uk: "britain", england: "britain", "great-britain": "britain", soviet: "ussr", "soviet-union": "ussr", holland: "netherlands", "english-channel": "channel", northsea: "north-sea", med: "mediterranean", czech: "czechoslovakia", "czech-republic": "czechoslovakia", yugo: "yugoslavia", libya: "north-africa", algeria: "north-africa", tunisia: "north-africa", morocco: "north-africa" };
  function ptKey(n) {
    var k = str(n).toLowerCase().replace(/[\s_]+/g, "-");
    if (MAP_PTS[k]) return k;
    if (PT_SYN[k]) return PT_SYN[k];
    var nk = nationKey(k, null);
    if (nk && MAP_PTS[nk]) return nk;
    return null;
  }
  function mapPt(n) {
    if (n && typeof n === "object") { if (n.lon != null) return proj(num(n.lon, 10), num(n.lat, 50)); return [num(n.x, 500), num(n.y, 500)]; }
    var k = ptKey(n);
    var ll = MAP_PTS[k || "germany"];
    return proj(ll[0], ll[1]);
  }
  S.mapPoints = Object.keys(MAP_PTS).filter(function (k) { return k !== "denmark2"; });
  var LAND_D = {}, LAND_C = {};
  Object.keys(LAND).forEach(function (k) {
    var d = "", xs = [], ys = [];
    LAND[k].forEach(function (poly) {
      var pts = [];
      for (var i = 0; i < poly.length; i += 2) { var p = proj(poly[i], poly[i + 1]); pts.push(p); xs.push(p[0]); ys.push(p[1]); }
      d += smoothD(pts, true, 0.35);
    });
    LAND_D[k] = d;
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    LAND_C[k] = { x0: x0, x1: x1, y0: y0, y1: y1 };
  });
  function regionNames(name) {
    var k = ptKey(name);
    if (!k) return [];
    if (LAND[k]) return [k];
    var r = REGION_OF[k];
    if (!r) return [];
    return Array.isArray(r) ? r : [r];
  }

  // MapView in a view: box {x, y, w, h} in world units; the map window is fitted to the box ("cover").
  VP.map = function (o) {
    var v = this;
    o = obj(o);
    var bx = num(o.x, 40), by = num(o.y, 40), bw = num(o.w, v.Ww - 80), bh = num(o.h, 920), layer = v.L[o.layer] || v.L.main, muted = !!o.muted;
    // window in map space: from named points (plus margin) or a default over central Europe
    var names = arr(o.names).map(ptKey).filter(Boolean), win;
    if (o.view && typeof o.view === "object") win = { x0: num(o.view.x0, 150), y0: num(o.view.y0, 250), x1: num(o.view.x1, 800), y1: num(o.view.y1, 900) };
    else if (names.length) {
      var xs = [], ys = [];
      names.forEach(function (n) {
        var p = mapPt(n); xs.push(p[0]); ys.push(p[1]);
        regionNames(n).forEach(function (rk) { var c = LAND_C[rk]; if (rk === "ussr" || rk === "north-africa" || rk === "norway" || rk === "sweden" || rk === "finland" || rk === "turkey") return; xs.push(c.x0, c.x1); ys.push(c.y0, c.y1); });
      });
      win = { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs), y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys) };
      var mgx = Math.max(90, (win.x1 - win.x0) * 0.22), mgy = Math.max(90, (win.y1 - win.y0) * 0.22);
      win.x0 -= mgx; win.x1 += mgx; win.y0 -= mgy; win.y1 += mgy;
    } else win = proj(-11, 62).concat(proj(30, 35.5)), win = { x0: win[0], y0: win[1], x1: win[2], y1: win[3] };
    // grow to at least 420 map units wide, then match the box aspect
    var cxw = (win.x0 + win.x1) / 2 + num(o.shiftX, 0) * 300, cyw = (win.y0 + win.y1) / 2 + num(o.shiftY, 0) * 300, ww = Math.max(420, win.x1 - win.x0), wh = Math.max(380, win.y1 - win.y0);
    var asp = bw / bh;
    if (ww / wh < asp) ww = wh * asp; else wh = ww / asp;
    win = { x0: cxw - ww / 2, x1: cxw + ww / 2, y0: cyw - wh / 2, y1: cyw + wh / 2 };
    var sc = bw / ww, iu = 1 / sc; // world unit expressed in map units
    var outer = svg("g", { class: "ch-map" }, layer), cid = fuid("mc");
    var cp = svg("clipPath", { id: cid }, v.defs);
    svg("rect", { x: f1(bx), y: f1(by), width: f1(bw), height: f1(bh), rx: 18 }, cp);
    var clipG = svg("g", { "clip-path": "url(#" + cid + ")" }, outer);
    var zoomG = svg("g", null, clipG);
    var g = svg("g", { transform: "translate(" + f1(bx) + " " + f1(by) + ") scale(" + sc.toFixed(5) + ") translate(" + f1(-win.x0) + " " + f1(-win.y0) + ")" }, zoomG);
    var sea = muted ? "#A9BDB5" : "#B9D0CB", land = muted ? "#E5D3A8" : "#F2E3BF";
    var m = R(win.x0 - 50, win.y0 - 50, ww + 100, wh + 100, sea);
    // sea ripples
    var rnd = V.makeRand(7);
    for (var i = 0; i < 40; i++) { var rx = win.x0 + rnd() * ww, ry = win.y0 + rnd() * wh; m += P("M" + f1(rx) + " " + f1(ry) + "q" + f1(10 * iu) + " " + f1(-6 * iu) + " " + f1(20 * iu) + " 0t" + f1(20 * iu) + " 0", "none", SK(shade(sea, 0.88), 3 * iu)); }
    if (o.grid !== false) for (var lon = -10; lon <= 40; lon += 10) { var a0 = proj(lon, 72), a1 = proj(lon, 26); m += L(a0[0], a0[1], a1[0], a1[1], shade(sea, 0.9), 2 * iu, ' stroke-dasharray="' + f1(10 * iu) + " " + f1(10 * iu) + '"'); }
    Object.keys(LAND_D).forEach(function (k) { m += P(LAND_D[k], land, SK(shade(land, 0.55), 3.2 * iu)); });
    g.innerHTML = m;
    var over = svg("g", null, g), labels = svg("g", null, g), top = svg("g", null, g);
    if (o.border !== false) svg("rect", { x: f1(bx), y: f1(by), width: f1(bw), height: f1(bh), rx: 18, fill: "none", stroke: INK, "stroke-width": 7 }, outer);
    var ms = Math.sqrt(1.08 / v.k), mu = iu * ms; // mark size: smaller marks where a world unit is bigger on screen
    var MV = { view: v, box: { x: bx, y: by, w: bw, h: bh }, win: win, sc: sc, iu: iu, mu: mu, g: g, layer: over, top: top, boxes: [], items: [], placed: [], zsegs: [] };
    // zoom inside the map frame: the box stays put, the content scales around a focus point
    MV.zoomTo = function (name, at, dur, zoom, pan) {
      var wpt = typeof name === "string" || (name && name.lon != null) ? MV.world(name) : obj(name);
      MV.zsegs.push({ at: tc0(at), dur: Math.max(0.01, num(dur, 1.2)), fx: num(wpt.x, bx + bw / 2), fy: num(wpt.y, by + bh / 2), z: clamp(num(zoom, 1.3), 1, 4), pan: clamp(num(pan, 0.5), 0, 1) });
      MV.zsegs.sort(function (a, b) { return a.at - b.at; });
      return MV;
    };
    MV.zoomAt = function (t) {
      var s = { fx: bx + bw / 2, fy: by + bh / 2, z: 1, pan: 0 };
      MV.zsegs.forEach(function (q) { if (t < q.at) return; var e = CE.soft((t - q.at) / q.dur); s = { fx: lerp(s.fx, q.fx, e), fy: lerp(s.fy, q.fy, e), z: lerp(s.z, q.z, e), pan: lerp(s.pan, q.pan, e) }; });
      var cx = bx + bw / 2, cy = by + bh / 2;
      s.tx = cx + (s.fx - cx) * (1 - s.pan); s.ty = cy + (s.fy - cy) * (1 - s.pan);
      s.moving = MV.zsegs.some(function (q) { return t > q.at && t < q.at + q.dur; });
      return s;
    };
    MV.toWorld = function (wx, wy, t) { var s = MV.zoomAt(t); return [s.tx + (wx - s.fx) * s.z, s.ty + (wy - s.fy) * s.z]; };
    v.anims.push(function (t) { if (!MV.zsegs.length) return; var s = MV.zoomAt(t); setA(zoomG, "transform", "translate(" + f1(s.tx) + " " + f1(s.ty) + ") scale(" + s.z.toFixed(4) + ") translate(" + f1(-s.fx) + " " + f1(-s.fy) + ")"); });
    function overlaps(r) { for (var i = 0; i < MV.placed.length; i++) { var q = MV.placed[i]; var ox = Math.min(r.x + r.w, q.x + q.w) - Math.max(r.x, q.x), oy = Math.min(r.y + r.h, q.y + q.h) - Math.max(r.y, q.y); if (ox > 0 && oy > 0) return true; } return false; }
    MV.overlaps = overlaps;
    MV.pt = function (n) { return mapPt(n); };
    MV.world = function (n) { var p = mapPt(n); return { x: bx + (p[0] - win.x0) * sc, y: by + (p[1] - win.y0) * sc }; };
    MV.contains = function (n) { var w_ = MV.world(n); return w_.x > bx && w_.x < bx + bw && w_.y > by && w_.y < by + bh; };
    function anim(fn) { v.anims.push(fn); }
    MV.region = function (name, nation, at, o2) {
      o2 = obj(o2);
      var t0 = tc0(at), rks = regionNames(name), col = isColor(nation) && !nationKey(nation, null) ? hex6(nation) : natColor(nation || name), cp_ = mapPt(name);
      var rid = fuid("rg"), rc = svg("clipPath", { id: rid }, v.defs), circ = svg("circle", { cx: f1(cp_[0]), cy: f1(cp_[1]), r: 0 }, rc);
      var rg = svg("g", { "clip-path": "url(#" + rid + ")" }, over), maxR = 60;
      var dd = "";
      rks.forEach(function (rk) { dd += LAND_D[rk]; var c = LAND_C[rk]; maxR = Math.max(maxR, Math.hypot(Math.max(Math.abs(c.x0 - cp_[0]), Math.abs(c.x1 - cp_[0])), Math.max(Math.abs(c.y0 - cp_[1]), Math.abs(c.y1 - cp_[1])))); });
      if (!dd) dd = "M" + f1(cp_[0] - 50 * iu) + " " + f1(cp_[1]) + "a" + f1(50 * iu) + " " + f1(40 * iu) + " 0 1 0 " + f1(100 * iu) + " 0a" + f1(50 * iu) + " " + f1(40 * iu) + " 0 1 0 " + f1(-100 * iu) + " 0Z";
      svg("path", { d: dd, fill: tint(col, 0.3), opacity: 0.92, stroke: shade(col, 0.6), "stroke-width": f2(4 * iu) }, rg);
      // diagonal hatch for a hand-coloured feel
      var hid = fuid("hp"), pat = svg("pattern", { id: hid, width: f1(16 * iu), height: f1(16 * iu), patternUnits: "userSpaceOnUse", patternTransform: "rotate(35)" }, v.defs);
      svg("rect", { width: f1(5 * iu), height: f1(16 * iu), fill: "rgba(255,255,255,0.16)" }, pat);
      svg("path", { d: dd, fill: "url(#" + hid + ")" }, rg);
      var dur = num(o2.dur, 0.6);
      anim(function (t) { setA(circ, "r", f1(maxR * 1.05 * CE.out((t - t0) / dur) * (t >= t0 ? 1 : 0))); });
      if (o2.flag !== false && nationKey(nation, null)) MV.flag(name, nation, t0 + dur * 0.6);
      return MV;
    };
    MV.flag = function (name, nation, at) {
      var t0 = tc0(at == null ? 0 : at), p = mapPt(name), fw = 58 * mu, fh = 40 * mu, ph = 70 * mu, nk = nationKey(nation);
      var fg = svg("g", null, top), cloth = svg("g", null, fg);
      fg.insertAdjacentHTML("afterbegin", L(0, 0, 0, -ph - fh * 0.1, INK, f1(7 * mu)) + L(0, 0, 0, -ph - fh * 0.1, "#8A6A48", f1(3.5 * mu)) + E(0, 0, 14 * mu, 5 * mu, "rgba(43,42,51,0.3)"));
      cloth.innerHTML = bannerMarkup(nk, 58, 40) + R(0, 0, 58, 40, "none", 0, SK(INK, 3));
      var seed = hash(p[0]);
      anim(function (t) {
        var k = popK(t, t0, 0.35);
        showEl(fg, t >= t0);
        setA(fg, "transform", "translate(" + f1(p[0] + 2 * mu) + " " + f1(p[1] + 4 * mu) + ") scale(" + f2(k) + ")");
        setA(cloth, "transform", "translate(" + f1(1.5 * mu) + " " + f1(-ph) + ") scale(" + (mu).toFixed(4) + ") skewY(" + f2(5 * Math.sin(t * 4 + seed * 6)) + ")");
      });
      MV.boxes.push({ at: t0, kind: "map-flag", label: nk, mx: p[0], my: p[1] - ph, mw: fw, mh: ph });
      MV.placed.push({ x: p[0] - 4 * mu, y: p[1] - ph - 4 * mu, w: fw + 8 * mu, h: ph + 8 * mu });
      return MV;
    };
    MV.label = function (text, at, o2) {
      o2 = obj(o2);
      var t0 = tc0(at), pn = o2.at || text, p = mapPt(pn), size = clamp(num(o2.size, 30), 16, 60), dy = num(o2.dy, 0);
      var txt = plain(clean(text)).toUpperCase(), w_ = measure(txt, size, 900), lg = svg("g", null, labels), pos = { x: p[0], y: p[1] + (dy + size * 0.35) * mu };
      lg.innerHTML = '<text x="0" y="0" text-anchor="middle" font-size="' + size + '" font-weight="900" font-family=\'' + FONT + '\' fill="' + (o2.color || INK) + '" stroke="#FFF7E6" stroke-width="' + f1(size * 0.28) + '" paint-order="stroke" stroke-linejoin="round">' + esc(txt) + "</text>";
      var bx_ = { at: t0, kind: "map-label", label: txt, mx: 0, my: 0, mw: w_ * mu, mh: size * 1.1 * mu };
      v.late.push(function () {
        var hw = (w_ / 2) * mu, hh = size * 0.55 * mu, cands = [[0, dy], [w_ / 2 + 34, dy - 30], [-w_ / 2 - 34, dy - 30]], pick = cands[0];
        for (var kk = 1; kk < 9; kk++) cands.push([0, dy + kk * size * 0.75], [0, -78 - size * 0.9 - (kk - 1) * size * 0.75]);
        for (var i = 0; i < cands.length; i++) {
          var cx = p[0] + cands[i][0] * mu, cy = p[1] + (cands[i][1] + size * 0.35) * mu, r = { x: cx - hw, y: cy - hh * 1.6, w: hw * 2, h: hh * 2 };
          if (!overlaps(r)) { pick = cands[i]; break; }
        }
        pos.x = p[0] + pick[0] * mu; pos.y = p[1] + (pick[1] + size * 0.35) * mu;
        bx_.mx = pos.x - hw; bx_.my = pos.y - hh * 1.6; bx_.mw = hw * 2; bx_.mh = hh * 2;
        MV.placed.push({ x: bx_.mx, y: bx_.my, w: bx_.mw, h: bx_.mh });
      });
      anim(function (t) { var k = popK(t, t0, 0.3); showEl(lg, t >= t0); setA(lg, "transform", "translate(" + f1(pos.x) + " " + f1(pos.y) + ") scale(" + f2(k * mu) + ")"); });
      MV.boxes.push(bx_);
      return MV;
    };
    MV.arrow = function (from, to, at, o2) {
      o2 = obj(o2);
      var t0 = tc0(at), a_ = mapPt(from), b_ = mapPt(to), col = o2.color || (o2.nation ? natColor(o2.nation) : ACC), wd = num(o2.width, 16) * mu;
      var dx = b_[0] - a_[0], dy = b_[1] - a_[1], len = Math.sqrt(dx * dx + dy * dy) || 1, cv = num(o2.curve, 0.22);
      // shorten so the head stops at the target's edge
      var end = [b_[0] - (dx / len) * 22 * mu, b_[1] - (dy / len) * 22 * mu], st = [a_[0] + (dx / len) * 16 * mu, a_[1] + (dy / len) * 16 * mu];
      var cx = (st[0] + end[0]) / 2 - (dy / len) * len * cv, cy = (st[1] + end[1]) / 2 + (dx / len) * len * cv;
      var stop = clamp(num(o2.stop, 1), 0.1, 1), back = o2.stop != null ? num(o2.back, 0.1) : 0, dur = num(o2.dur, 0.7);
      var ag = svg("g", null, over);
      var pOut = svg("path", { d: "M" + f1(st[0]) + " " + f1(st[1]) + "Q" + f1(cx) + " " + f1(cy) + " " + f1(end[0]) + " " + f1(end[1]), fill: "none", stroke: INK, "stroke-width": f1(wd + 6 * mu), "stroke-linecap": "round" }, ag);
      var pIn = svg("path", { d: pOut.getAttribute("d"), fill: "none", stroke: col, "stroke-width": f1(wd), "stroke-linecap": "round" }, ag);
      var head = svg("path", { d: "M0 " + f1(-wd * 1.3) + "L" + f1(wd * 1.9) + " 0L0 " + f1(wd * 1.3) + "Z", fill: col, stroke: INK, "stroke-width": f1(3 * mu), "stroke-linejoin": "round" }, ag);
      var bez = function (p) { var q = 1 - p; return [q * q * st[0] + 2 * q * p * cx + p * p * end[0], q * q * st[1] + 2 * q * p * cy + p * p * end[1]]; };
      var L_ = 0, prev = bez(0);
      for (var i = 1; i <= 24; i++) { var nx = bez(i / 24); L_ += Math.hypot(nx[0] - prev[0], nx[1] - prev[1]); prev = nx; }
      [pOut, pIn].forEach(function (pp) { pp.setAttribute("stroke-dasharray", f1(L_ + 2) + " " + f1(L_ + 2)); });
      anim(function (t) {
        var on = t >= t0;
        showEl(ag, on);
        if (!on) return;
        var p = CE.out((t - t0) / dur) * stop;
        if (back && t > t0 + dur) p = stop - back * smooth((t - t0 - dur) / 0.5);
        p = clamp(p, 0.001, 1);
        var off = f1((L_ + 2) * (1 - p));
        setA(pOut, "stroke-dashoffset", off); setA(pIn, "stroke-dashoffset", off);
        var hp = bez(p), hq = bez(Math.max(0, p - 0.02)), an = (Math.atan2(hp[1] - hq[1], hp[0] - hq[0]) * 180) / PI;
        setA(head, "transform", "translate(" + f1(hp[0]) + " " + f1(hp[1]) + ") rotate(" + f1(an) + ")");
      });
      MV.items.push({ kind: "arrow", at: t0, end: end });
      return MV;
    };
    MV.front = function (pts, at, o2) {
      o2 = obj(o2);
      var t0 = tc0(at), ps = arr(pts).map(mapPt);
      if (ps.length < 2) return MV;
      var col = o2.color || ACC, jag = [];
      for (var i = 0; i < ps.length - 1; i++) {
        var seg = jagPts(ps[i][0], ps[i][1], ps[i + 1][0], ps[i + 1][1], Math.max(4, Math.round(Math.hypot(ps[i + 1][0] - ps[i][0], ps[i + 1][1] - ps[i][1]) / (22 * mu))), 9 * mu, i * 7);
        if (i) seg.shift();
        jag = jag.concat(seg);
      }
      var d = "M" + jag.map(function (p) { return f1(p[0]) + " " + f1(p[1]); }).join("L"), L_ = 0;
      for (i = 1; i < jag.length; i++) L_ += Math.hypot(jag[i][0] - jag[i - 1][0], jag[i][1] - jag[i - 1][1]);
      var fg = svg("g", null, over);
      var p1 = svg("path", { d: d, fill: "none", stroke: INK, "stroke-width": f1(13 * mu), "stroke-linejoin": "round", "stroke-linecap": "round", "stroke-dasharray": f1(L_ + 2) + " " + f1(L_ + 2) }, fg);
      var p2 = svg("path", { d: d, fill: "none", stroke: col, "stroke-width": f1(7 * mu), "stroke-linejoin": "round", "stroke-linecap": "round", "stroke-dasharray": f1(L_ + 2) + " " + f1(L_ + 2) }, fg);
      anim(function (t) { var p = t < t0 ? 0 : CE.out((t - t0) / 0.9); showEl(fg, t >= t0); var off = f1((L_ + 2) * (1 - p)); setA(p1, "stroke-dashoffset", off); setA(p2, "stroke-dashoffset", off); });
      return MV;
    };
    MV.target = function (name, at, o2) {
      o2 = obj(o2);
      var t0 = tc0(at), p = mapPt(name), col = o2.color || ACC, r0 = num(o2.r, 54) * mu;
      var tg = svg("g", null, top);
      tg.innerHTML = C(0, 0, r0, "rgba(215,38,61,0.12)", SK(col, 9 * mu)) + C(0, 0, r0 * 0.55, "none", SK(col, 7 * mu)) + C(0, 0, r0 * 0.14, col) +
        L(-r0 * 1.35, 0, -r0 * 0.7, 0, col, f1(7 * mu)) + L(r0 * 0.7, 0, r0 * 1.35, 0, col, f1(7 * mu)) + L(0, -r0 * 1.35, 0, -r0 * 0.7, col, f1(7 * mu)) + L(0, r0 * 0.7, 0, r0 * 1.35, col, f1(7 * mu));
      MV.placed.push({ x: p[0] - r0 * 1.35, y: p[1] - r0 * 1.35, w: r0 * 2.7, h: r0 * 2.7 });
      anim(function (t) {
        showEl(tg, t >= t0);
        if (t < t0) return;
        var p_ = clamp((t - t0) / 0.45, 0, 1), sc_ = lerp(2.4, 1, CE.out(p_)) * (1 + 0.05 * Math.sin((t - t0) * 7) * (p_ >= 1 ? 1 : 0)), rr = lerp(120, 0, CE.out(p_));
        setA(tg, "transform", "translate(" + f1(p[0]) + " " + f1(p[1]) + ") rotate(" + f1(rr) + ") scale(" + f2(sc_) + ")");
        setA(tg, "opacity", f2(clamp(p_ * 3, 0, 1)));
      });
      if (o2.label) MV.label(o2.label, t0 + 0.35, { at: name, size: num(o2.size, 30), dy: -r0 / mu - 40, color: col });
      if (o2.boom) MV.burst(name, t0 + 0.55, { text: o2.boomText });
      return MV;
    };
    MV.burst = function (name, at, o2) {
      o2 = obj(o2);
      var t0 = tc0(at), p = mapPt(name), r0 = num(o2.r, 70) * mu, bg_ = svg("g", null, top), word = str(o2.text) || "BOOM";
      bg_.innerHTML = P(starD(0, 0, r0, r0 * 0.6, 12, -90), "#FFB23E", SK(INK, 5 * mu)) + P(starD(0, 0, r0 * 0.7, r0 * 0.42, 10, -72), "#FFE066") +
        '<text x="0" y="' + f1(r0 * 0.14) + '" text-anchor="middle" font-size="' + f1(r0 * 0.42) + '" font-weight="900" font-family=\'' + FONT + '\' fill="' + ACC + '" stroke="' + INK + '" stroke-width="' + f1(3 * mu) + '" paint-order="stroke">' + esc(word) + "</text>";
      anim(function (t) {
        var on = t >= t0 && t < t0 + 1.6;
        showEl(bg_, on);
        if (!on) return;
        var k = CE.snap(clamp((t - t0) / 0.3, 0, 1)) * (1 - smooth((t - t0 - 1.2) / 0.4));
        setA(bg_, "transform", "translate(" + f1(p[0]) + " " + f1(p[1]) + ") rotate(" + f1(-8 + 6 * Math.sin((t - t0) * 9)) + ") scale(" + f2(k) + ")");
      });
      return MV;
    };
    MV.qmarks = function (name, from, to) {
      var t0 = tc0(from), t1 = to == null ? 1e9 : num(to, 1e9), p = mapPt(name), qs = [];
      for (var i = 0; i < 3; i++) {
        var q = svg("g", null, top);
        q.innerHTML = '<text x="0" y="0" text-anchor="middle" font-size="' + (64 - i * 12) + '" font-weight="900" font-family=\'' + FONT + '\' fill="#5B6FD0" stroke="' + INK + '" stroke-width="5" paint-order="stroke">?</text>';
        qs.push(q);
      }
      anim(function (t) {
        qs.forEach(function (q, i) {
          var on = t >= t0 + i * 0.18 && t < t1;
          showEl(q, on);
          if (!on) return;
          var k = popK(t, t0 + i * 0.18, 0.3), ox = [-46, 44, 4][i], oy = [-54, -76, -118][i];
          setA(q, "transform", "translate(" + f1(p[0] + ox * mu) + " " + f1(p[1] + (oy + 6 * Math.sin(t * 3 + i)) * mu) + ") rotate(" + f1(10 * Math.sin(t * 2 + i * 2)) + ") scale(" + f2(k * mu) + ")");
        });
      });
      return MV;
    };
    v.maps = v.maps || [];
    v.maps.push(MV);
    return MV;
  };

  // ------------------------- shot-level grammar (world units) -------------------------
  VP.letter = function (from, to, at, o) {
    var v = this;
    o = obj(o);
    var a_ = obj(from), b_ = obj(to), t0 = tc0(at), dur = num(o.dur, 0.7), until = o.until == null ? 1e9 : num(o.until, 1e9), arc = num(o.arc, 160);
    var kind = o.kind === "telegram" ? "telegram" : "letter", s = num(o.scale, 1), rotEnd = num(o.rot, 0);
    var g = svg("g", null, v.L[o.layer] || v.L.fx);
    g.innerHTML = propMarkup(kind, null, false);
    var ax = num(a_.x, 0), ay = num(a_.y, 0), bx = num(b_.x, 100), by = num(b_.y, 0);
    v.anims.push(function (t) {
      var on = t >= t0 && t < until;
      showEl(g, on);
      if (!on) return;
      var p = clamp((t - t0) / dur, 0, 1), e = CE.soft(p), x = lerp(ax, bx, e), y = lerp(ay, by, e) - arc * 4 * e * (1 - e);
      var r_ = p < 1 ? -25 + 360 * e * (o.spin === false ? 0 : 1) : rotEnd, k = p < 1 ? s * (1 + 0.25 * Math.sin(PI * p)) : s * (1 + 0.12 * Math.max(0, 1 - (t - t0 - dur) / 0.2));
      setA(g, "transform", "translate(" + f1(x) + " " + f1(y) + ") rotate(" + f1(r_) + ") scale(" + f2(k) + ")");
    });
    return { el: g, lands: t0 + dur };
  };
  function arrowParts(parent, col, wd, ink) {
    var g = svg("g", null, parent);
    var pO = svg("path", { fill: "none", stroke: ink || INK, "stroke-width": f1(wd + 7), "stroke-linecap": "round" }, g);
    var pI = svg("path", { fill: "none", stroke: col, "stroke-width": f1(wd), "stroke-linecap": "round" }, g);
    var hd = svg("path", { d: "M0 " + f1(-wd * 1.3) + "L" + f1(wd * 1.9) + " 0L0 " + f1(wd * 1.3) + "Z", fill: col, stroke: ink || INK, "stroke-width": 4, "stroke-linejoin": "round" }, g);
    return { g: g, o: pO, i: pI, h: hd };
  }
  VP.arrow = function (a_, b_, at, o) {
    var v = this;
    o = obj(o);
    a_ = obj(a_); b_ = obj(b_);
    var t0 = tc0(at), col = o.color || ACC, wd = num(o.width, 16), cv = num(o.curve, 0.2), dur = num(o.dur, 0.6);
    var st = [num(a_.x, 0), num(a_.y, 0)], en = [num(b_.x, 100), num(b_.y, 0)], dx = en[0] - st[0], dy = en[1] - st[1], len = Math.hypot(dx, dy) || 1;
    var cx = (st[0] + en[0]) / 2 - (dy / len) * len * cv, cy = (st[1] + en[1]) / 2 + (dx / len) * len * cv;
    var A = arrowParts(v.L[o.layer] || v.L.fx, col, wd), d = "M" + f1(st[0]) + " " + f1(st[1]) + "Q" + f1(cx) + " " + f1(cy) + " " + f1(en[0]) + " " + f1(en[1]);
    setA(A.o, "d", d); setA(A.i, "d", d);
    function bez(p) { var q = 1 - p; return [q * q * st[0] + 2 * q * p * cx + p * p * en[0], q * q * st[1] + 2 * q * p * cy + p * p * en[1]]; }
    var L_ = 0, pr = bez(0);
    for (var i = 1; i <= 24; i++) { var nx = bez(i / 24); L_ += Math.hypot(nx[0] - pr[0], nx[1] - pr[1]); pr = nx; }
    [A.o, A.i].forEach(function (pp) { pp.setAttribute("stroke-dasharray", f1(L_ + 2) + " " + f1(L_ + 2)); });
    var until = o.until == null ? 1e9 : num(o.until, 1e9);
    v.anims.push(function (t) {
      var on = t >= t0 && t < until;
      showEl(A.g, on);
      if (!on) return;
      var p = clamp(CE.out((t - t0) / dur), 0.001, 1), off = f1((L_ + 2) * (1 - p));
      setA(A.o, "stroke-dashoffset", off); setA(A.i, "stroke-dashoffset", off);
      var hp = bez(p), hq = bez(Math.max(0, p - 0.03));
      setA(A.h, "transform", "translate(" + f1(hp[0]) + " " + f1(hp[1]) + ") rotate(" + f1((Math.atan2(hp[1] - hq[1], hp[0] - hq[0]) * 180) / PI) + ")");
    });
    return A;
  };
  VP.target = function (x, y, at, o) {
    var v = this;
    o = obj(o);
    var t0 = tc0(at), r0 = num(o.r, 90), col = o.color || ACC, until = o.until == null ? 1e9 : num(o.until, 1e9);
    var g = svg("g", null, v.L[o.layer] || v.L.fx);
    g.innerHTML = (o.ring ? C(0, 0, r0, "none", SK(col, 12)) + C(0, 0, r0, "none", SK("#FFF7E6", 4)) : C(0, 0, r0, "rgba(215,38,61,0.1)", SK(col, 11)) + C(0, 0, r0 * 0.56, "none", SK(col, 8)) + C(0, 0, r0 * 0.12, col)) +
      (o.ring ? L(-r0 * 1.32, 0, -r0 * 0.86, 0, col, 10) + L(r0 * 0.86, 0, r0 * 1.32, 0, col, 10) + L(0, -r0 * 1.32, 0, -r0 * 0.86, col, 10) + L(0, r0 * 0.86, 0, r0 * 1.32, col, 10) : "") +
      (o.ring ? "" : L(-r0 * 1.3, 0, -r0 * 0.72, 0, col, 9) + L(r0 * 0.72, 0, r0 * 1.3, 0, col, 9) + L(0, -r0 * 1.3, 0, -r0 * 0.72, col, 9) + L(0, r0 * 0.72, 0, r0 * 1.3, col, 9));
    v.anims.push(function (t) {
      var on = t >= t0 && t < until;
      showEl(g, on);
      if (!on) return;
      var p = clamp((t - t0) / 0.45, 0, 1), sc_ = lerp(2.2, 1, CE.out(p)) * (1 + (p >= 1 ? 0.04 * Math.sin((t - t0) * 7) : 0));
      var tx = typeof x === "function" ? x(t) : x, ty = typeof y === "function" ? y(t) : y;
      setA(g, "transform", "translate(" + f1(tx) + " " + f1(ty) + ") rotate(" + f1(lerp(120, 0, CE.out(p))) + ") scale(" + f2(sc_) + ")");
      setA(g, "opacity", f2(clamp(p * 3, 0, 1)));
    });
    return g;
  };
  VP.qmarks = function (x, y, from, to) {
    var v = this, t0 = tc0(from), t1 = to == null ? 1e9 : num(to, 1e9), qs = [];
    for (var i = 0; i < 3; i++) { var q = svg("g", null, v.L.fx); q.innerHTML = TX(0, 0, "?", 70 - i * 14, "#5B6FD0", SK(INK, 5) + ' paint-order="stroke"'); qs.push(q); }
    v.anims.push(function (t) {
      qs.forEach(function (q, i) {
        var on = t >= t0 + i * 0.18 && t < t1;
        showEl(q, on);
        if (on) setA(q, "transform", "translate(" + f1(x + [-50, 48, 2][i]) + " " + f1(y + [-10, -40, -90][i] + 6 * Math.sin(t * 3 + i)) + ") rotate(" + f1(10 * Math.sin(t * 2 + i * 2)) + ") scale(" + f2(popK(t, t0 + i * 0.18, 0.3)) + ")");
      });
    });
    return v;
  };
  function planeMarkup(kind, col) {
    var c = col || "#6E7C70", d = shade(c, 0.8), o = SK(INK, 4);
    if (kind === "bomber") return P("M-110 0Q-100 -16-60 -16H70Q100 -14 112 0Q100 12 70 14H-60Q-100 16-110 0Z", c, o) + P("M-20 -12L-60 -66H-34L20 -12Z M-20 12L-60 66H-34L20 12Z", d, o) + P("M-104 -4L-128 -30H-114L-92 -6Z", d, o) + R(60, -10, 26, 12, "#BFE0F0", 4, SK(INK, 2.5)) + C(-30, -40, 9, d, SK(INK, 3)) + C(-30, 40, 9, d, SK(INK, 3));
    return P("M-60 0Q-56 -12-30 -12H40Q60 -10 66 0Q60 10 40 12H-30Q-56 12-60 0Z", c, o) + P("M0 -10L-14 -52H6L22 -10Z M0 10L-14 52H6L22 10Z", d, o) + P("M-54 -4L-72 -26H-60L-44 -6Z", d, o) + C(24, -4, 9, "#BFE0F0", SK(INK, 2.5)) + R(66, -24, 6, 48, INK, 3);
  }
  VP.planes = function (from, to, o) {
    var v = this;
    o = obj(o);
    var t0 = tc0(from), t1 = to == null ? 1e9 : num(to, 1e9), n = clamp(Math.round(num(o.count, 2)), 1, 12), y0 = num(o.y, 200), kind = o.kind === "bomber" ? "bomber" : "fighter";
    var dir = o.dir === "left" || o.dir === -1 ? -1 : 1, sp = num(o.speed, kind === "bomber" ? 150 : 260), sc = num(o.scale, kind === "bomber" ? 0.8 : 0.7), layer = v.L[o.layer] || v.L.sky;
    var span = v.Ww + 700, ps = [];
    for (var i = 0; i < n; i++) {
      var g = svg("g", null, layer);
      g.innerHTML = planeMarkup(kind, o.color);
      ps.push({ g: g, off: (i / n) * span * (o.formation ? 0.15 : 1) + hash(i + 3) * 80, dy: (i % 3) * 46 * (o.formation ? 1 : 1.4) - 30 + hash(i) * 40, s: sc * (0.8 + 0.3 * hash(i + 9)) });
    }
    v.anims.push(function (t) {
      ps.forEach(function (p) {
        var on = t >= t0 && t < t1;
        showEl(p.g, on);
        if (!on) return;
        var x = ((((t - t0) * sp + p.off) % span) + span) % span - 350;
        if (dir < 0) x = v.Ww - x;
        setA(p.g, "transform", "translate(" + f1(x) + " " + f1(y0 + p.dy + 6 * Math.sin(t * 1.5 + p.off)) + ") scale(" + f2(p.s * dir) + " " + f2(p.s) + ")");
      });
    });
    return ps;
  };
  VP.smoke = function (x, y, from, to, o) {
    var v = this;
    o = obj(o);
    var t0 = tc0(from), t1 = to == null ? 1e9 : num(to, 1e9), n = clamp(Math.round(num(o.count, 5)), 1, 12), ps = [];
    for (var i = 0; i < n; i++) ps.push(svg("circle", { r: 30, fill: o.color || "#B9B3A6", stroke: INK, "stroke-width": 3 }, v.L[o.layer] || v.L.back));
    v.anims.push(function (t) {
      ps.forEach(function (c, i) {
        var on = t >= t0 && t < t1;
        showEl(c, on);
        if (!on) return;
        var p = (((t - t0) * 0.35 + i / n) % 1);
        setA(c, "cx", f1(x + 40 * Math.sin(p * 5 + i) + p * 60)); setA(c, "cy", f1(y - p * 360)); setA(c, "r", f1(20 + p * 60)); setA(c, "opacity", f2(0.85 * (1 - p)));
      });
    });
    return v;
  };
  VP.snow = function (from, to, o) {
    var v = this;
    o = obj(o);
    var t0 = tc0(from), t1 = to == null ? 1e9 : num(to, 1e9), n = clamp(Math.round(num(o.count, 40)), 4, 120), rnd = V.makeRand(num(o.seed, 5)), fl = [];
    for (var i = 0; i < n; i++) fl.push({ e: svg("circle", { r: f1(3 + rnd() * 5), fill: "#FFFFFF", stroke: "rgba(43,42,51,0.25)", "stroke-width": 1 }, v.L[o.layer] || v.L.front), x: rnd() * (v.Ww + 200) - 100, sp: 40 + rnd() * 50, ph: rnd() * 1000 });
    v.anims.push(function (t) {
      fl.forEach(function (f) {
        var on = t >= t0 && t < t1;
        showEl(f.e, on);
        if (!on) return;
        var y = ((f.ph + t * f.sp) % 1100) - 60;
        setA(f.e, "cx", f1(f.x + 20 * Math.sin(t * 0.9 + f.ph))); setA(f.e, "cy", f1(y));
      });
    });
    return v;
  };
  VP.birds = function (from, to, o) {
    var v = this;
    o = obj(o);
    var t0 = tc0(from), t1 = to == null ? 1e9 : num(to, 1e9), n = clamp(Math.round(num(o.count, 4)), 1, 12), y0 = num(o.y, 200), bs = [];
    for (var i = 0; i < n; i++) bs.push({ e: svg("path", { fill: "none", stroke: o.color || INK, "stroke-width": 4, "stroke-linecap": "round", "stroke-linejoin": "round" }, v.L[o.layer] || v.L.sky), off: hash(i + 1) * (v.Ww + 400), dy: (i % 3) * 30 + hash(i * 3) * 40, s: 0.7 + hash(i + 7) * 0.5 });
    v.anims.push(function (t) {
      bs.forEach(function (b, i) {
        var on = t >= t0 && t < t1;
        showEl(b.e, on);
        if (!on) return;
        var x = ((b.off + (t - t0) * 50) % (v.Ww + 400)) - 200, y = y0 + b.dy + 10 * Math.sin(t * 0.8 + i), fl = 10 * Math.sin(t * 7 + i * 2) * b.s, w = 16 * b.s;
        setA(b.e, "d", "M" + f1(x - w) + " " + f1(y - fl) + "Q" + f1(x - w / 2) + " " + f1(y - 6) + " " + f1(x) + " " + f1(y) + "Q" + f1(x + w / 2) + " " + f1(y - 6) + " " + f1(x + w) + " " + f1(y - fl));
      });
    });
    return v;
  };
  VP.sparkles = function (from, to, o) {
    var v = this;
    o = obj(o);
    var t0 = tc0(from), t1 = to == null ? 1e9 : num(to, 1e9), n = clamp(Math.round(num(o.count, 8)), 1, 30), ar = obj(o.area);
    var ax = num(ar.x, 0), ay = num(ar.y, 0), aw = num(ar.w, v.Ww), ah = num(ar.h, 600), rnd = V.makeRand(num(o.seed, 11)), sp = [];
    for (var i = 0; i < n; i++) { var g = svg("path", { d: starD(0, 0, 18, 5, 4, -90), fill: o.color || GOLD, stroke: INK, "stroke-width": 2.5 }, v.L[o.layer] || v.L.fx); sp.push({ g: g, x: ax + rnd() * aw, y: ay + rnd() * ah, ph: rnd() * 6 }); }
    v.anims.push(function (t) {
      sp.forEach(function (s) {
        var on = t >= t0 && t < t1, k = Math.max(0, Math.sin(t * 3 + s.ph));
        showEl(s.g, on && k > 0.05);
        if (on) setA(s.g, "transform", "translate(" + f1(s.x) + " " + f1(s.y) + ") scale(" + f2(k) + ") rotate(" + f1(t * 40) + ")");
      });
    });
    return v;
  };
  VP.focusLines = function (from, to, o) {
    var v = this;
    o = obj(o);
    var t0 = tc0(from), t1 = to == null ? 1e9 : num(to, 1e9), cx = num(o.x, v.Ww / 2), cy = num(o.y, 450), g = svg("g", null, v.L[o.layer] || v.L.back);
    var rnd = V.makeRand(num(o.seed, 23)), m = o.bg ? C(cx, cy, 2400, o.bg) : "";
    for (var i = 0; i < 64; i++) {
      var a = (i / 64) * 2 * PI + rnd() * 0.05, r0 = 230 + rnd() * 140, r1 = 1600, w = 0.012 + rnd() * 0.02;
      m += P("M" + f1(cx + Math.cos(a) * r0) + " " + f1(cy + Math.sin(a) * r0) + "L" + f1(cx + Math.cos(a - w) * r1) + " " + f1(cy + Math.sin(a - w) * r1) + "L" + f1(cx + Math.cos(a + w) * r1) + " " + f1(cy + Math.sin(a + w) * r1) + "Z", o.color || "rgba(43,42,51,0.22)");
    }
    g.innerHTML = m;
    v.anims.push(function (t) { var on = t >= t0 && t < t1; showEl(g, on); if (on) setA(g, "transform", "rotate(" + f2(Math.floor(t * 12) % 2 ? 0.8 : -0.8) + " " + f1(cx) + " " + f1(cy) + ")"); });
    return g;
  };
  VP.crowd = function (n, o) {
    var v = this;
    o = obj(o);
    n = clamp(Math.round(num(n, 12)), 1, 40);
    var rows = clamp(Math.round(num(o.rows, n > 10 ? 3 : n > 5 ? 2 : 1)), 1, 5), x0 = num(o.x, v.Ww / 2), w = num(o.w, v.Ww * 0.9), y = num(o.y, v.groundY);
    var roles = arr(o.roles).map(function (r) { return roleKey(r, "civilian"); }), nat = nationKey(o.nation), sc0 = num(o.scale, v.portrait ? 0.32 : 0.36);
    if (!roles.length) roles = ["civilian", "civilian", "soldier", "nurse"];
    var out = [], perRow = Math.ceil(n / rows), k = 0, rnd = V.makeRand(num(o.seed, 29) + n);
    var hold = [];
    for (var r = rows - 1; r >= 0; r--) {
      var cnt = Math.min(perRow, n - k);
      if (cnt <= 0) break;
      var sc = sc0 * (1 - r * 0.12), fy = y - r * 70 * (sc0 / 0.36), span = w * (1 - r * 0.06);
      for (var i = 0; i < cnt; i++, k++) {
        var x = x0 - span / 2 + (span * (i + 0.5)) / cnt + (r % 2 ? span / cnt / 2 : 0) * 0.5 + (rnd() - 0.5) * 16;
        var role = roles[(k * 7 + r) % roles.length];
        var a = v.character({ role: role, nation: nat }, { x: x, y: fy - 278 * sc, scale: sc * (0.94 + rnd() * 0.12), facing: o.march ? o.march : rnd() < 0.5 ? -0.4 : 0.4, expression: o.cheer ? "happy" : "neutral" });
        a.crowdRow = r;
        hold.push(a);
      }
    }
    // front rows drawn last: actors were created back row first
    out = hold;
    out.forEach(function (a, i) {
      if (o.cheer) {
        var ph = hash(i * 1.3);
        a.gesture(i % 3 === 0 ? "cheer" : i % 3 === 1 ? "hold-up" : "wave", 0.1 + ph * 0.4);
        if (i % 3 === 1) a.prop("flag", 0, nat);
        for (var tt = 0.3 + ph * 0.6; tt < D - 0.6; tt += 0.75 + ph * 0.4) a.hop(tt, 26 + ph * 18, 0.36);
      }
      if (o.march) { a.gesture("march", 0); }
    });
    if (o.march) {
      var dir = o.march === "left" ? -1 : 1, sp = num(o.speed, 70), span2 = v.Ww + 600;
      out.forEach(function (a) {
        var bx = a.x0, by = a.y0;
        a.posFn = function (t) { return { x: ((((bx + dir * t * sp) + 300) % span2) + span2) % span2 - 300, y: by }; };
        a.walks.push({ t0: 0, t1: 1e9, x0: bx, y0: by, fn: true });
      });
    }
    return out;
  };

  // ------------------------- split screen -------------------------
  // vertical divider (left | right) by default in wide and square; horizontal (top / bottom) in tall.
  // opts.dir: "vertical" | "horizontal" forces one; opts.at: divider position (fraction).
  function splitVertical(o) { o = obj(o); return o.dir ? o.dir !== "horizontal" : !V.isPortrait; }
  function jagScreen(o) {
    o = obj(o);
    if (!splitVertical(o)) { var y = H * num(o.at, 0.44); return jagPts(W + 20, y, -20, y, 12, u(26), 4); }
    var x = W * num(o.at, 0.5);
    return jagPts(x, -20, x, H + 20, V.isPortrait ? 16 : 12, u(V.isPortrait ? 20 : 26), 4);
  }
  S.jaggedD = function (o) { var pts = jagScreen(o); return "M" + pts.map(function (p) { return f1(p[0]) + " " + f1(p[1]); }).join("L"); };
  S.half = function (shot, side, o) {
    o = obj(o);
    var sh = shot && shot.shot ? shot.shot : null;
    if (!sh) { shot = makeShot("plain", 0, 1e9); sh = shot.shot; }
    var first = side !== "right" && side !== "bottom", pts = jagScreen(o), rect, poly, vert = splitVertical(o), ov = u(40);
    if (!vert) {
      var yd = H * num(o.at, 0.44);
      rect = first ? { x: 0, y: 0, w: W, h: yd + ov } : { x: 0, y: yd - ov, w: W, h: H - yd + ov };
      var ptsL = pts.map(function (p) { return [p[0] - rect.x, p[1] - rect.y]; });
      poly = first ? [[0, 0], [W, 0]].concat(ptsL) : ptsL.concat([[0, rect.h], [W, rect.h]]);
    } else {
      var xd = W * num(o.at, 0.5);
      rect = first ? { x: 0, y: 0, w: xd + ov, h: H } : { x: xd - ov, y: 0, w: W - xd + ov, h: H };
      var ptsR = pts.map(function (p) { return [p[0] - rect.x, p[1] - rect.y]; });
      poly = first ? [[0, 0]].concat(ptsR).concat([[0, H]]) : ptsR.concat([[rect.w, H], [rect.w, 0]]);
    }
    var clip = "polygon(" + poly.map(function (p) { return f1(p[0]) + "px " + f1(p[1]) + "px"; }).join(",") + ")";
    var gy = num(o.groundY, !vert ? (first ? 880 : 560) : V.isPortrait ? 760 : 870);
    var hv = new View(sh, rect, { clip: clip, groundY: gy });
    hv.half = first ? "first" : "second";
    if (!sh.divider) {
      var dv = svg("svg", { class: "chs-div", width: W, height: H, viewBox: "0 0 " + W + " " + H }, null), d = S.jaggedD(o);
      svg("path", { d: d, fill: "none", stroke: INK, "stroke-width": f1(u(22)), "stroke-linejoin": "round" }, dv);
      svg("path", { d: d, fill: "none", stroke: CREAM, "stroke-width": f1(u(9)), "stroke-linejoin": "round" }, dv);
      sh.divider = dv;
    }
    sh.el.appendChild(sh.divider);
    return hv;
  };

  // ------------------------- film-level effects (screen space) -------------------------
  S.flash = function (at, color, dur) { film_().flashes.push({ at: tc0(at), color: color || "#FFFFFF", dur: num(dur, 0.25) }); };
  S.shakeFrame = function (at, amp, dur) { film_().shakes.push({ at: tc0(at), amp: num(amp, 14), dur: Math.max(0.05, num(dur, 0.4)) }); };
  S.vignette = function (from, to, amount) { film_().vigs.push({ from: tc0(from), to: to == null ? 1e9 : num(to, 1e9), amount: clamp(num(amount, 0.6), 0, 1) }); };
  S.boom = function (at, o) {
    var F = film_();
    o = obj(o);
    var t0 = tc0(at), x = num(o.x, 0.5) * W, y = num(o.y, 0.5) * H, r0 = num(o.r, u(170)), word = str(o.text) || "BOOM";
    var g = svg("g", null, F.fxG), fs = r0 * 0.4, tw = measure(word, fs, 900);
    if (tw > r0 * 1.2) fs *= (r0 * 1.2) / tw;
    g.innerHTML = P(starD(0, 0, r0, r0 * 0.62, 13, -90), "#FFB23E", SK(INK, u(7))) + P(starD(0, 0, r0 * 0.72, r0 * 0.44, 11, -70), "#FFE066") +
      '<text x="0" y="' + f1(fs * 0.36) + '" text-anchor="middle" font-size="' + f1(fs) + '" font-weight="900" font-family=\'' + FONT + '\' fill="' + ACC + '" stroke="' + INK + '" stroke-width="' + f1(u(5)) + '" paint-order="stroke" stroke-linejoin="round">' + esc(word.toUpperCase()) + "</text>";
    var until = o.until == null ? t0 + 1.5 : num(o.until, t0 + 1.5);
    F.anims.push(function (t) {
      var on = t >= t0 && t < until;
      showEl(g, on);
      if (!on) return;
      var k = CE.snap(clamp((t - t0) / 0.28, 0, 1)) * (until - t < 0.3 ? smooth((until - t) / 0.3) : 1);
      setA(g, "transform", "translate(" + f1(x) + " " + f1(y) + ") rotate(" + f1(-8 + 4 * Math.sin((t - t0) * 10)) + ") scale(" + f2(k) + ")");
    });
    F.boxes.push(function (t) { return t >= t0 && t < until ? [{ kind: "boom", label: word, x: x - r0, y: y - r0, w: r0 * 2, h: r0 * 2, moving: t < t0 + 0.35 }] : []; });
    return g;
  };
  S.stamp = function (text, at, o) {
    var F = film_();
    o = obj(o);
    var t0 = tc0(at), word = plain(clean(text)).toUpperCase() || "NO REPLY", col = o.color || ACC, rotD = num(o.rotate, -12), until = o.until == null ? 1e9 : num(o.until, 1e9);
    var maxW = num(o.width, V.isPortrait ? 0.8 : V.isSquare ? 0.7 : 0.42) * W, lay = layoutRich(parseRich(word), { size: u(num(o.size, 110)), minSize: u(40), maxWidth: maxW - u(60), maxLines: 2, weight: 900, lh: 1.0 });
    var el = div("ch-stamp", F.over), inner = div("ch-stamp-in", el);
    fillRich(inner, lay, "ch-sw");
    var bw = lay.w + u(70), bh = lay.h + u(48), x = num(o.x, 0.5) * W, y = num(o.y, 0.5) * H;
    el.style.width = f1(bw) + "px"; el.style.height = f1(bh) + "px"; el.style.left = f1(x - bw / 2) + "px"; el.style.top = f1(y - bh / 2) + "px";
    el.style.color = col; el.style.borderColor = col; el.style.borderWidth = f1(u(10)) + "px"; el.style.borderRadius = f1(u(22)) + "px";
    inner.style.outlineColor = col;
    if (o.shake !== false) S.shakeFrame(t0 + 0.12, 10, 0.3);
    F.anims.push(function (t) {
      var on = t >= t0 && t < until;
      showEl(el, on);
      if (!on) return;
      var p = clamp((t - t0) / 0.22, 0, 1), k = lerp(2.6, 1, CE.out(p));
      setS(el, "transform", "rotate(" + f1(rotD) + "deg) scale(" + k.toFixed(3) + ")");
      setS(el, "opacity", f2(clamp(p * 2.5, 0, 0.92)));
    });
    F.boxes.push(function (t) { return t >= t0 && t < until ? [{ kind: "stamp", label: word, x: x - bw / 2, y: y - bh / 2, w: bw, h: bh, moving: t < t0 + 0.3 }] : []; });
    return el;
  };

  // ------------------------- lettering (screen-space HTML overlays) -------------------------
  function clampBox(cx, cy, w, h, pad) {
    var sa = safe(), p = pad == null ? u(6) : pad;
    var x = clamp(cx - w / 2, sa.x0 + p, Math.max(sa.x0 + p, sa.x1 - p - w)), y = clamp(cy - h / 2, sa.y0 + p, Math.max(sa.y0 + p, sa.y1 - p - h));
    return { x: x, y: y, w: w, h: h };
  }
  // Boxes that later lettering steps around (date tags): a box that overlaps one moves below it, or above if
  // there is no room below.
  function reserve(b) { var F = film_(); (F.reserved = F.reserved || []).push(b); }
  function avoid(bx) {
    var F = film_(), sa = safe(), g = u(10);
    (F.reserved || []).forEach(function (r) {
      var ox = Math.min(bx.x + bx.w, r.x + r.w) - Math.max(bx.x, r.x), oy = Math.min(bx.y + bx.h, r.y + r.h) - Math.max(bx.y, r.y);
      if (ox <= 0 || oy <= 0) return;
      if (r.y + r.h + g + bx.h <= sa.y1) bx.y = r.y + r.h + g; else bx.y = Math.max(sa.y0, r.y - g - bx.h);
    });
    return bx;
  }
  var THUMB_SIZE = { xl: 150, lg: 112, md: 84, sm: 60 };
  S.thumb = function (text, at, o) {
    var F = film_();
    o = obj(o);
    var t0 = tc0(at == null ? 0.3 : at), until = o.until == null ? 1e9 : num(o.until, 1e9), Pt = V.isPortrait, sa = safe();
    var size = u(THUMB_SIZE[o.size] || num(o.size, 0) || THUMB_SIZE.lg), maxW = num(o.width, Pt ? 0.86 : 0.46) * W;
    maxW = Math.min(maxW, sa.w - u(20));
    var lay = layoutRich(text || narrationTitle(), { size: size, minSize: size * 0.4, maxWidth: maxW, maxLines: num(o.maxLines, 3), weight: 900, lh: 1.02, upper: o.upper !== false });
    var el = div("ch-thumb", F.over), sh = div("ch-thumb-t ch-thumb-sh", el), fr = div("ch-thumb-t ch-thumb-fr", el);
    fillRich(sh, lay, "ch-tw"); fillRich(fr, lay, "ch-tw");
    if (o.color) fr.style.color = o.color;
    var st = u(Math.max(8, lay.size * 0.1));
    [sh, fr].forEach(function (e) { e.style.setProperty("--st", f1(st * 2) + "px"); });
    sh.style.top = f1(st * 0.9) + "px";
    var kick = null, kh = 0;
    if (str(o.kicker)) { kick = div("ch-kicker", el, plain(clean(o.kicker)).toUpperCase()); kick.style.fontSize = f1(Math.max(u(24), lay.size * 0.3)) + "px"; kh = Math.max(u(24), lay.size * 0.3) * 1.5 + u(10); }
    var bw = lay.w + st * 2, bh = lay.h + st * 2 + kh;
    var bx = clampBox(num(o.x, 0.5) * W, num(o.y, Pt ? 0.22 : 0.3) * H, bw, bh);
    el.style.left = f1(bx.x) + "px"; el.style.top = f1(bx.y) + "px"; el.style.width = f1(bw) + "px"; el.style.height = f1(bh) + "px";
    F.late.push(function () { avoid(bx); el.style.top = f1(bx.y) + "px"; });
    [sh, fr].forEach(function (e) { e.style.top = f1(kh + st + (e === sh ? st * 0.9 : 0)) + "px"; e.style.left = f1(st) + "px"; e.style.width = f1(lay.w + 2) + "px"; });
    if (kick) { kick.style.left = "50%"; kick.style.top = "0px"; }
    var rot0 = num(o.rotate, -2.5);
    if (o.shake !== false) S.shakeFrame(t0 + 0.12, num(o.shakeAmp, 7), 0.25);
    F.anims.push(function (t) {
      var on = t >= t0 && t < until;
      showEl(el, on);
      if (!on) return;
      var p = clamp((t - t0) / 0.26, 0, 1), k = p < 1 ? lerp(1.7, 1, CE.snap(p)) : 1 + 0.012 * Math.sin((t - t0) * 2.4);
      setS(el, "transform", "rotate(" + f2(rot0 + (1 - CE.out(p)) * 6) + "deg) scale(" + k.toFixed(4) + ")");
      setS(el, "opacity", f2(clamp(p * 4, 0, 1)));
    });
    F.boxes.push(function (t) { return t >= t0 && t < until ? [{ kind: "thumb", label: plain(text), x: bx.x, y: bx.y, w: bw, h: bh, moving: t < t0 + 0.3 }] : []; });
    return { el: el, box: bx, at: t0 };
  };
  var TAG_SIZE = { lg: 76, md: 52, sm: 38 };
  S.dateTag = function (text, at, o) {
    var F = film_();
    o = obj(o);
    var t0 = tc0(at == null ? 0.2 : at), until = o.until == null ? 1e9 : num(o.until, 1e9), txt = plain(clean(text)).toUpperCase() || "1939";
    var fs = u(TAG_SIZE[o.size] || num(o.size, 0) || TAG_SIZE.md), maxW = safe().w * 0.9;
    var tw = measure(txt, fs, 900);
    if (tw > maxW - fs) { fs *= (maxW - fs) / tw; tw = measure(txt, fs, 900); }
    var bw = tw + fs * 1.3, bh = fs * 1.5;
    var el = div("ch-date", F.over, txt);
    el.style.fontSize = f1(fs) + "px"; el.style.lineHeight = f1(bh) + "px"; el.style.width = f1(bw) + "px"; el.style.height = f1(bh) + "px";
    el.style.paddingLeft = f1(fs * 0.25) + "px";
    if (o.color) el.style.background = o.color;
    var bx = clampBox(num(o.x, 0.15) * W, num(o.y, 0.1) * H, bw, bh);
    el.style.left = f1(bx.x) + "px"; el.style.top = f1(bx.y) + "px";
    if (o.reserve !== false) reserve({ x: bx.x - u(6), y: bx.y - u(6), w: bw + u(12), h: bh + u(12) });
    var rot0 = num(o.rotate, -3);
    F.anims.push(function (t) {
      var on = t >= t0 && t < until;
      showEl(el, on);
      if (!on) return;
      var k = popK(t, t0, 0.34);
      setS(el, "transform", "rotate(" + f1(rot0) + "deg) scale(" + f2(k) + ")");
    });
    F.boxes.push(function (t) { return t >= t0 && t < until ? [{ kind: "date", label: txt, x: bx.x, y: bx.y, w: bw, h: bh, moving: t < t0 + 0.35 }] : []; });
    return { el: el, box: bx };
  };
  S.tag = function (text, at, o) {
    var F = film_();
    o = obj(o);
    var t0 = tc0(at == null ? 0.3 : at), until = o.until == null ? 1e9 : num(o.until, 1e9), txt = plain(clean(text)).toUpperCase();
    if (!txt) return null;
    var fs = u(num(o.size, 32)), tw = measure(txt, fs, 900), bw = tw + fs * 1.2, bh = fs * 1.6;
    var el = div("ch-tag" + (o.dark ? " ch-tag-dark" : ""), F.over, txt);
    el.style.fontSize = f1(fs) + "px"; el.style.lineHeight = f1(bh) + "px"; el.style.width = f1(bw) + "px"; el.style.height = f1(bh) + "px";
    if (o.color) el.style.background = o.color;
    if (o.color && lum(hex6(o.color)) < 0.55) el.style.color = CREAM;
    var bx = clampBox(num(o.x, 0.5) * W, num(o.y, 0.5) * H, bw, bh);
    el.style.left = f1(bx.x) + "px"; el.style.top = f1(bx.y) + "px";
    F.anims.push(function (t) { var on = t >= t0 && t < until; showEl(el, on); if (on) setS(el, "transform", "rotate(" + f1(num(o.rotate, 0)) + "deg) scale(" + f2(popK(t, t0, 0.3)) + ")"); });
    F.boxes.push(function (t) { return t >= t0 && t < until ? [{ kind: "tag", label: txt, x: bx.x, y: bx.y, w: bw, h: bh, moving: t < t0 + 0.3 }] : []; });
    return { el: el, box: bx };
  };
  S.nameplate = function (actor, text, at, o) {
    var F = film_();
    o = obj(o);
    if (!actor || !actor.__actor) return null;
    var t0 = tc0(at == null ? 0.3 : at), until = o.until == null ? 1e9 : num(o.until, 1e9), txt = plain(clean(text)).toUpperCase() || natName(actor.nation).toUpperCase();
    var v = actor.view, fs = u(num(o.size, V.isPortrait ? 30 : 30)), tw = measure(txt, fs, 900), bw = tw + fs * 1.2, bh = fs * 1.6;
    var el = div("ch-tag ch-name", F.over, txt);
    el.style.fontSize = f1(fs) + "px"; el.style.lineHeight = f1(bh) + "px"; el.style.width = f1(bw) + "px"; el.style.height = f1(bh) + "px";
    el.style.background = o.color || natColor(actor.nation);
    if (lum(hex6(o.color || natColor(actor.nation))) < 0.6) el.style.color = CREAM;
    function boxAt(t) {
      var r = rigAt(actor, t), sc = actor.sc, p = toScr(v, camAt(v, t), r.hx, r.y + 262 * sc);
      return clampBox(p[0], p[1] + bh / 2, bw, bh);
    }
    F.anims.push(function (t) {
      var on = t >= t0 && t < until && viewVisible(v, t) && actor.vis.val(t) > 0.5;
      showEl(el, on);
      if (!on) return;
      var b = boxAt(t);
      setS(el, "left", f1(b.x) + "px"); setS(el, "top", f1(b.y) + "px");
      setS(el, "transform", "rotate(-2deg) scale(" + f2(popK(t, t0, 0.3)) + ")");
    });
    F.boxes.push(function (t) { if (!(t >= t0 && t < until && viewVisible(v, t))) return []; var b = boxAt(t); return [{ kind: "nameplate", label: txt, x: b.x, y: b.y, w: bw, h: bh, moving: t < t0 + 0.3 || camAt(v, t).moving }]; });
    return el;
  };
  function captionY() { return V.isPortrait ? 0.665 : 0.865; }
  S.caption = function (text, at, o) {
    var F = film_();
    o = obj(o);
    var t0 = tc0(at == null ? 0.5 : at), until = o.until == null ? 1e9 : num(o.until, 1e9), sa = safe();
    var lay = layoutRich(text, { size: u(num(o.size, V.isPortrait ? 50 : 46)), minSize: u(26), maxWidth: num(o.width, 0) ? num(o.width, 0.7) * W - u(56) : sa.w * (V.isPortrait ? 0.9 : 0.7), maxLines: 2, weight: 900, lh: 1.12 });
    var el = div("ch-cap", F.over);
    fillRich(el, lay, "ch-cw");
    var bw = lay.w + u(56), bh = lay.h + u(30);
    el.style.width = f1(bw) + "px"; el.style.height = f1(bh) + "px";
    if (o.color) el.style.background = o.color;
    var bx = clampBox(num(o.x, 0.5) * W, num(o.y, captionY()) * H, bw, bh);
    el.style.left = f1(bx.x) + "px"; el.style.top = f1(bx.y) + "px";
    F.late.push(function () { avoid(bx); el.style.top = f1(bx.y) + "px"; });
    F.anims.push(function (t) {
      var on = t >= t0 && t < until;
      showEl(el, on);
      if (!on) return;
      var p = clamp((t - t0) / 0.3, 0, 1);
      setS(el, "transform", "translateY(" + f1((1 - CE.out(p)) * u(30)) + "px)");
      setS(el, "opacity", f2(p));
    });
    F.boxes.push(function (t) { return t >= t0 && t < until ? [{ kind: "caption", label: plain(text), x: bx.x, y: bx.y, w: bw, h: bh, moving: t < t0 + 0.3 }] : []; });
    return { el: el, box: bx };
  };
  S.captions = function (o) {
    var F = film_();
    o = obj(o);
    var f0 = tc0(o.from == null ? 0 : o.from), t1 = o.to == null ? D : tc0(o.to), sa = safe();
    var ws = (V.words || []).filter(function (w) { return w.start >= f0 - 0.01 && w.start < t1 && normWord(w.word); });
    if (!ws.length) return null;
    var groups = [], cur = [];
    ws.forEach(function (w, i) {
      cur.push(w);
      var endP = /[.,!?;:]$/.test(w.word), gap = ws[i + 1] ? ws[i + 1].start - w.end : 9;
      if (cur.length >= 5 || endP || gap > 0.6) { groups.push(cur); cur = []; }
    });
    if (cur.length) groups.push(cur);
    var box = div("ch-caps", F.over), size = u(V.isPortrait ? 52 : 50);
    var y = o.top ? (V.isPortrait ? 0.2 : 0.12) : (V.isPortrait ? 0.7 : 0.88);
    var gs = groups.map(function (g, gi) {
      var el = div("ch-capg", box), spans = [];
      g.forEach(function (w, i) { if (i) el.appendChild(doc.createTextNode(" ")); var s = doc.createElement("span"); s.textContent = clean(w.word).replace(/\*/g, ""); el.appendChild(s); spans.push({ el: s, at: w.start }); });
      var lay = layoutRich(g.map(function (w) { return w.word; }).join(" "), { size: size, minSize: size * 0.5, maxWidth: sa.w * 0.92, maxLines: 2, weight: 900 });
      el.style.fontSize = f1(lay.size) + "px";
      var next = groups[gi + 1] ? groups[gi + 1][0].start : t1;
      return { el: el, spans: spans, t0: g[0].start - 0.05, t1: Math.min(next - 0.02, g[g.length - 1].end + 0.6), w: lay.w + u(30), h: lay.h + u(16) };
    });
    box.style.top = f1(y * H) + "px";
    F.anims.push(function (t) {
      gs.forEach(function (g) {
        var on = t >= g.t0 && t < g.t1;
        showEl(g.el, on);
        if (on) g.spans.forEach(function (s, i) { var now = t >= s.at && (i === g.spans.length - 1 || t < g.spans[i + 1].at); s.el.className = now ? "ch-now" : t >= s.at ? "ch-said" : ""; });
      });
    });
    F.boxes.push(function (t) { var out = []; gs.forEach(function (g) { if (t >= g.t0 && t < g.t1) out.push({ kind: "captions", label: g.el.textContent, x: W / 2 - g.w / 2, y: y * H - g.h / 2, w: g.w, h: g.h, moving: false }); }); return out; });
    return box;
  };
  S.stat = function (value, at, o) {
    var F = film_();
    o = obj(o);
    var t0 = tc0(at == null ? 0.4 : at), val = num(value, 0), dec = Math.max(0, Math.round(num(o.decimals, 0))), pre = str(o.prefix), suf = str(o.suffix);
    var fs = u(num(o.size, 130)), label = plain(clean(o.label)).toUpperCase();
    var full = pre + V.format(val, dec) + suf, tw = measure(full, fs, 900), lw = label ? measure(label, fs * 0.3, 900) : 0, bw = Math.max(tw, lw) + u(40), bh = fs * 1.15 + (label ? fs * 0.45 : 0);
    var el = div("ch-stat", F.over), nv = div("ch-statn", el), lb = label ? div("ch-statl", el, label) : null;
    nv.style.fontSize = f1(fs) + "px"; nv.style.color = o.color || CREAM;
    if (lb) lb.style.fontSize = f1(fs * 0.3) + "px";
    var bx = clampBox(num(o.x, 0.5) * W, num(o.y, 0.4) * H, bw, bh);
    el.style.left = f1(bx.x) + "px"; el.style.top = f1(bx.y) + "px"; el.style.width = f1(bw) + "px"; el.style.height = f1(bh) + "px";
    var until = o.until == null ? 1e9 : num(o.until, 1e9), cd = num(o.dur, 1.0);
    F.anims.push(function (t) {
      var on = t >= t0 && t < until;
      showEl(el, on);
      if (!on) return;
      var p = CE.out((t - t0) / cd), cur = val * p;
      nv.textContent = pre + V.format(dec ? cur : Math.round(cur), dec) + suf;
      setS(el, "transform", "scale(" + f2(popK(t, t0, 0.3)) + ")");
    });
    F.boxes.push(function (t) { return t >= t0 && t < until ? [{ kind: "stat", label: full, x: bx.x, y: bx.y, w: bw, h: bh, moving: t < t0 + 0.3 }] : []; });
    return el;
  };
  // Speech bubble; tail: "left" | "right" | "down" | "down-left" | "down-right" | "none" | an actor (points at its mouth).
  S.bubble = function (text, from, to, o) {
    var F = film_();
    o = obj(o);
    var t0 = tc0(from), t1 = to == null ? 1e9 : num(to, 1e9), sa = safe(), Pt = V.isPortrait;
    var maxW = num(o.width, Pt ? 0.62 : 0.3) * W, fs = u(num(o.size, Pt ? 50 : 46));
    var lay = layoutRich(text || "...", { size: fs, minSize: fs * 0.55, maxWidth: maxW - u(50), maxLines: num(o.maxLines, 3), weight: 900, lh: 1.1 });
    var bw = lay.w + u(56), bh = lay.h + u(40);
    var el = div("ch-bub", F.over), sv = svg("svg", { class: "ch-bubsvg", width: W, height: H, viewBox: "0 0 " + W + " " + H }, null);
    F.over.insertBefore(sv, el);
    var shp = svg("path", { fill: "#FFFFFF", stroke: INK, "stroke-width": f1(u(6)), "stroke-linejoin": "round" }, sv);
    var txt = div("ch-bubt", el);
    fillRich(txt, lay, "ch-bw");
    txt.style.left = f1(u(28)) + "px"; txt.style.top = f1(u(20)) + "px"; txt.style.width = f1(lay.w + 2) + "px";
    el.style.width = f1(bw) + "px"; el.style.height = f1(bh) + "px";
    var tail = o.tail == null ? "down" : o.tail;
    function geo(t) {
      var cx = num(o.x, 0.5) * W, cy = num(o.y, 0.3) * H;
      if (typeof o.x === "function") cx = o.x(t) * W;
      var bx = clampBox(cx, cy, bw, bh), tip = null;
      if (tail && tail.__actor) {
        var a = tail, v = a.view, c = camAt(v, t), hd = a.headAt(t), hp = toScr(v, c, hd.x, hd.y), R_ = hd.r * hp[2];
        var headTop = hp[1] - R_ * 1.32;
        if (bx.y + bh < headTop + R_ * 0.2) tip = [hp[0] + clamp(bx.x + bw / 2 - hp[0], -R_ * 0.5, R_ * 0.5), headTop - R_ * 0.08];
        else tip = [hp[0] + (bx.x + bw / 2 > hp[0] ? 1 : -1) * R_ * 1.12, hp[1] + R_ * 0.15];
      } else if (tail && typeof tail === "object") tip = [num(tail.x, 0.5) * W, num(tail.y, 0.5) * H];
      else if (tail === "left") tip = [bx.x - u(46), bx.y + bh * 0.75];
      else if (tail === "right") tip = [bx.x + bw + u(46), bx.y + bh * 0.75];
      else if (tail === "down-left") tip = [bx.x + bw * 0.2, bx.y + bh + u(54)];
      else if (tail === "down-right") tip = [bx.x + bw * 0.8, bx.y + bh + u(54)];
      else if (tail === "down") tip = [bx.x + bw * 0.5, bx.y + bh + u(54)];
      return { bx: bx, tip: tip };
    }
    function shapeD(g) {
      var b = g.bx, r = Math.min(u(34), bh / 2), d = rrD(b.x, b.y, bw, bh, r);
      if (!g.tip) return d;
      var tx = g.tip[0], ty = g.tip[1], cx = b.x + bw / 2, cy = b.y + bh / 2, ang = Math.atan2(ty - cy, tx - cx);
      // tail base on the box edge nearest the tip, clamped away from the corners
      var bxp = clamp(tx, b.x + r + u(10), b.x + bw - r - u(10)), byp = clamp(ty, b.y + r + u(6), b.y + bh - r - u(6)), base, w2 = u(22);
      if (ty > b.y + bh) base = [[bxp - w2, b.y + bh - 2], [bxp + w2, b.y + bh - 2]];
      else if (ty < b.y) base = [[bxp - w2, b.y + 2], [bxp + w2, b.y + 2]];
      else if (tx < b.x) base = [[b.x + 2, byp - w2], [b.x + 2, byp + w2]];
      else base = [[b.x + bw - 2, byp - w2], [b.x + bw - 2, byp + w2]];
      var dist = Math.hypot(tx - (base[0][0] + base[1][0]) / 2, ty - (base[0][1] + base[1][1]) / 2), maxL = u(80);
      if (dist > maxL) { var k = maxL / dist, mx = (base[0][0] + base[1][0]) / 2, my = (base[0][1] + base[1][1]) / 2; tx = mx + (tx - mx) * k; ty = my + (ty - my) * k; }
      void ang;
      return d + "M" + f1(base[0][0]) + " " + f1(base[0][1]) + "L" + f1(tx) + " " + f1(ty) + "L" + f1(base[1][0]) + " " + f1(base[1][1]) + "Z";
    }
    var fill = svg("path", { fill: "#FFFFFF" }, sv);
    F.anims.push(function (t) {
      var on = t >= t0 && t < t1;
      showEl(el, on); showEl(sv, on);
      if (!on) return;
      var g = geo(t), k = popK(t, t0, 0.28), d = shapeD(g);
      setA(shp, "d", d);
      setA(fill, "d", rrD(g.bx.x + u(3), g.bx.y + u(3), bw - u(6), bh - u(6), Math.min(u(30), bh / 2)));
      setS(el, "left", f1(g.bx.x) + "px"); setS(el, "top", f1(g.bx.y) + "px");
      var ox = g.bx.x + bw / 2, oy = g.bx.y + bh / 2;
      setA(sv, "style", "transform-origin:" + f1(ox) + "px " + f1(oy) + "px;transform:scale(" + f2(k) + ")");
      setS(el, "transform", "scale(" + f2(k) + ")");
    });
    F.boxes.push(function (t) { if (!(t >= t0 && t < t1)) return []; var g = geo(t); return [{ kind: "bubble", label: plain(text), x: g.bx.x, y: g.bx.y, w: bw, h: bh, moving: t < t0 + 0.3 }]; });
    return { el: el, box: function (t) { return geo(t == null ? V.time() : t).bx; } };
  };
  S.banner = function (text, at, o) {
    var F = film_();
    o = obj(o);
    var t0 = tc0(at == null ? 0.3 : at), until = o.until == null ? 1e9 : num(o.until, 1e9), sa = safe();
    var lay = layoutRich(text, { size: u(V.isPortrait ? 64 : 70), minSize: u(30), maxWidth: sa.w * 0.82, maxLines: 1, weight: 900, upper: true });
    var el = div("ch-banner", F.over), tx = div("ch-bant", el);
    fillRich(tx, lay, "ch-bnw");
    var bh = lay.h + u(36), bw = Math.min(sa.w, lay.w + u(140));
    el.style.width = f1(bw) + "px"; el.style.height = f1(bh) + "px";
    if (o.color) el.style.background = o.color;
    var bx = clampBox(W / 2, num(o.y, V.isPortrait ? 0.2 : 0.16) * H, bw, bh);
    el.style.left = f1(bx.x) + "px"; el.style.top = f1(bx.y) + "px";
    F.anims.push(function (t) {
      var on = t >= t0 && t < until;
      showEl(el, on);
      if (!on) return;
      var p = clamp((t - t0) / 0.35, 0, 1);
      setS(el, "clip-path", "inset(0 " + f1((1 - CE.out(p)) * 50) + "% 0 " + f1((1 - CE.out(p)) * 50) + "%)");
      setS(el, "transform", "rotate(-1.5deg)");
    });
    F.boxes.push(function (t) { return t >= t0 && t < until ? [{ kind: "banner", label: plain(text), x: bx.x, y: bx.y, w: bw, h: bh, moving: t < t0 + 0.35 }] : []; });
    return el;
  };
  S.vsBadge = function (at, o) {
    var F = film_();
    o = obj(o);
    var t0 = tc0(at == null ? 0.3 : at), r0 = u(num(o.r, 78)), x = num(o.x, 0.5) * W, y = num(o.y, 0.5) * H, until = o.until == null ? 1e9 : num(o.until, 1e9);
    var g = svg("g", null, F.fxG);
    g.innerHTML = P(starD(0, 0, r0, r0 * 0.78, 14, -90), ACC, SK(INK, u(6))) + C(0, 0, r0 * 0.7, GOLD, SK(INK, u(5))) +
      '<text x="0" y="' + f1(r0 * 0.24) + '" text-anchor="middle" font-size="' + f1(r0 * 0.72) + '" font-weight="900" font-family=\'' + FONT + '\' fill="' + CREAM + '" stroke="' + INK + '" stroke-width="' + f1(u(6)) + '" paint-order="stroke" stroke-linejoin="round">VS</text>';
    F.anims.push(function (t) {
      var on = t >= t0 && t < until;
      showEl(g, on);
      if (on) setA(g, "transform", "translate(" + f1(x) + " " + f1(y) + ") rotate(" + f1(-6 + 3 * Math.sin(t * 2)) + ") scale(" + f2(popK(t, t0, 0.32) * (1 + 0.03 * Math.sin(t * 5))) + ")");
    });
    F.boxes.push(function (t) { return t >= t0 && t < until ? [{ kind: "vs", label: "VS", x: x - r0, y: y - r0, w: r0 * 2, h: r0 * 2, moving: t < t0 + 0.35 }] : []; });
    return g;
  };

  // ------------------------- templates -------------------------
  var TPL = {};
  var SIGNATURE = { officer: "point", general: "point-up", soldier: "salute", sailor: "salute", pilot: "fist-up", diplomat: "present", civilian: "shrug", nurse: "wave", historian: "present" };
  function spec2(p, defRole, defNation) {
    p = obj(p);
    var r = roleKey(p.role, defRole || "officer");
    return { role: r, nation: r === "historian" && !p.nation ? "neutral" : nationKey(p.nation || defNation || "neutral") };
  }
  function dateTop(text, o) {
    if (!str(text)) return null;
    o = obj(o);
    var Pt = V.isPortrait;
    return S.dateTag(text, o.at == null ? 0.2 : o.at, { x: o.x != null ? o.x : Pt ? 0.24 : 0.13, y: o.y != null ? o.y : Pt ? 0.155 : 0.12, size: o.size || "md", until: o.until });
  }

  TPL["character-talks"] = function (root, p) {
    var sp = spec2(p), loc = locKey(p.location, "war-room"), Pt = V.isPortrait, SQ = V.isSquare;
    var text = str(p.text), side = p.side === "right" ? "right" : "left", hasText = !!text;
    var tK = tc(Math.max(0.6, wordAt(p.keyword, text, D * 0.35)));
    var tCut = 1e9;
    if (p.closeUp !== false && D > 5) { tCut = Math.max(tK + 1.4, D * 0.56); if (tCut > endLimit() - 1.4) tCut = 1e9; }
    var s1 = S.shot(loc, 0, tCut, { nation: sp.nation });
    var f = s1.frame("medium", Pt ? "center" : hasText ? side : "center");
    if (Pt) { f.scale = 0.92; f.y = s1.groundY - 278 * f.scale; }
    if (SQ && hasText) { f.scale = 0.78; f.x = s1.Ww * (side === "left" ? 0.27 : 0.73); f.y = s1.groundY - 278 * f.scale; }
    var faceDir = Pt || !hasText ? 0.35 : side === "left" ? 0.6 : -0.6;
    var a = s1.character(sp, { x: f.x, y: f.y, scale: f.scale, facing: faceDir, expression: p.expression || "smile", prop: p.prop });
    narrate(a, 0.05, Math.min(D, tCut));
    var g = p.gesture || SIGNATURE[sp.role] || "point";
    liven(a, 0.3, tK - 0.5, ["rest", "present", "rest"]);
    a.gesture(g, tK - 0.14);
    if (p.keyExpression) a.expression(p.keyExpression, tK - 0.04);
    a.hop(tK - 0.06, 26, 0.36);
    a.beats(p.beats, { after: 0 });
    if (p.prop && (g === "rest" || g === "point")) a.gesture("hold", 0);
    var tx = Pt ? 0.5 : side === "left" ? 0.67 : 0.33, ty = Pt ? 0.215 : SQ ? 0.24 : 0.36;
    if (hasText) S.thumb(text, tK, { x: tx, y: ty, size: Pt ? "lg" : "lg", kicker: p.kicker, width: Pt ? 0.86 : SQ ? 0.5 : 0.46 });
    else if (p.kicker) S.tag(p.kicker, tK, { x: tx, y: ty, dark: true });
    dateTop(p.date);
    if (str(p.label)) S.nameplate(a, p.label, 0.5, { until: tCut });
    s1.cam.push(Pt ? 1.04 : 1.06, 0.2, Math.max(1, Math.min(tCut, D) - 0.4));
    s1.cam.shake(tK, 6, 0.3);
    if (tCut < 1e9) {
      var s2 = S.shot(loc, tCut, 1e9, { nation: sp.nation });
      var fc = s2.frame("close", Pt ? "center" : hasText ? side : "center");
      if (SQ) { fc.scale = 1.2; fc.x = s2.Ww * (hasText ? (side === "left" ? 0.26 : 0.74) : 0.5); fc.y = 620; }
      if (Pt) fc.y = 590;
      var a2 = s2.character(sp, { x: fc.x, y: fc.y, scale: fc.scale, facing: faceDir * 0.6, expression: p.closeExpression || p.keyExpression || p.expression || "smile", gesture: g === "salute" || g === "wave" ? "rest" : g, prop: p.prop });
      narrate(a2, tCut, D);
      a2.hop(tCut + 0.05, 14, 0.3);
      if (p.closeExpression) a2.expression(p.closeExpression, tCut);
      s2.cam.push(1.05, tCut, Math.max(1, D - tCut - 0.5));
      a2.beats(arr(p.beats).filter(function (b) { var bt = kwFind(obj(b).word, 0); return bt != null && bt > tCut; }), { after: tCut });
    }
    if (p.captions) S.captions({ from: 0, to: D });
  };

  // ---- two-sides: split screen, alternating lines with bubbles, the listener dims and reacts ----
  TPL["two-sides"] = function (root, p) {
    var Pt = V.isPortrait, Ls = obj(p.left), Rs = obj(p.right);
    var spL = spec2(Ls, "officer", "britain"), spR = spec2(Rs, "general", "germany");
    if (spL.role === spR.role && spL.nation === spR.nation) spR.nation = spL.nation === "germany" ? "britain" : "germany";
    var lines = arr(p.lines).map(obj).filter(function (l) { return str(l.text); }).slice(0, 6);
    if (!lines.length) lines = [{ side: "left", text: plain(clean(V.narration)).split(/[.!?]/)[0] || "..." }];
    var shot = S.shot("plain", 0, 1e9, { color: BG });
    var hL = S.half(shot, "left"), hR = S.half(shot, "right");
    drawLoc(hL, Ls.location || p.location || "office", {});
    drawLoc(hR, Rs.location || p.location || "war-room", { night: !!Rs.night });
    var sc = Pt ? 0.95 : 1.0, scB = Pt ? 0.86 : 1.0;
    var xL = Pt ? hL.Ww * 0.3 : hL.Ww * 0.42, xR = Pt ? hR.Ww * 0.7 : hR.Ww * 0.58;
    var A = hL.character(spL, { x: xL, y: hL.groundY - 278 * sc, scale: sc, facing: 0.5, expression: Ls.expression || "smile", gesture: Ls.gesture || "rest" });
    var B = hR.character(spR, { x: xR, y: hR.groundY - 278 * scB, scale: scB, facing: -0.5, expression: Rs.expression || "smile", gesture: Rs.gesture || "rest" });
    hL.flag(spL.nation, { x: Pt ? hL.Ww * 0.08 : hL.Ww * 0.12, y: Pt ? 440 : 300, w: Pt ? 150 : 170, poleH: hL.groundY - (Pt ? 440 : 300), layer: "main" });
    hR.flag(spR.nation, { x: Pt ? hR.Ww * 0.92 : hR.Ww * 0.88, y: Pt ? 200 : 300, w: Pt ? 120 : 170, dir: -1, poleH: hR.groundY - (Pt ? 200 : 300), layer: "main" });
    var labL = str(Ls.label) || natName(spL.nation), labR = str(Rs.label) || natName(spR.nation);
    S.tag(labL, 0.25, { x: Pt ? 0.24 : 0.25, y: Pt ? 0.158 : 0.1, color: natColor(spL.nation) });
    S.tag(labR, 0.35, { x: Pt ? 0.76 : 0.75, y: Pt ? 0.482 : 0.1, color: natColor(spR.nation) });
    dateTop(p.date, { x: Pt ? 0.76 : 0.5, y: Pt ? 0.158 : 0.1 });
    var texts = lines.map(function (l) { return l.text; }), win = findLines(texts);
    if (str(p.title) && win[0].start > 0.9) {
      S.thumb(p.title, 0.25, { x: 0.5, y: Pt ? 0.44 : 0.47, size: "md", until: Math.max(0.6, win[0].start - 0.12), width: Pt ? 0.8 : 0.4, shake: false });
    }
    var bub = Pt ? [{ x: 0.66, y: 0.235, w: 0.56 }, { x: 0.36, y: 0.545, w: 0.58 }] : [{ x: 0.25, y: 0.27, w: 0.36 }, { x: 0.75, y: 0.27, w: 0.36 }];
    lines.forEach(function (l, i) {
      var w = win[i], left = l.side === "left" ? true : l.side === "right" ? false : i % 2 === 0;
      var sp = left ? A : B, ls = left ? B : A, sv = left ? hL : hR, lv = left ? hR : hL, bb = bub[left ? 0 : 1];
      var st = w.start, nx = win[i + 1] ? win[i + 1].start : D, until = i < lines.length - 1 ? Math.max(st + 0.6, nx - 0.12) : D;
      sp.say(st, w.end);
      sp.gesture(l.gesture || (i % 2 ? "point" : "present"), st - 0.14);
      if (l.expression) sp.expression(l.expression, st - 0.05);
      sp.hop(st - 0.06, 22, 0.32);
      ls.expression(l.reaction || "neutral", Math.min(until - 0.1, st + 0.45));
      sv.dimTo(0, st - 0.2, 0.25); lv.dimTo(0.34, st - 0.2, 0.3);
      sv.cam.to({ zoom: 1.07 }, st - 0.25, 0.4); lv.cam.to({ zoom: 1 }, st - 0.25, 0.4);
      S.bubble(l.text, st - 0.12, until, { x: bb.x, y: bb.y, width: bb.w, tail: sp, size: Pt ? 46 : 44 });
    });
    var last = win[win.length - 1];
    if (last && last.end + 0.4 < D) { hL.dimTo(0, last.end + 0.35, 0.4); hR.dimTo(0, last.end + 0.35, 0.4); }
  };

  // ---- war-map: parchment map with regions, fronts, arrows, targets and a small narrator ----
  TPL["war-map"] = function (root, p) {
    var Pt = V.isPortrait, SQ = V.isSquare;
    var regions = arr(p.regions).map(obj).filter(function (r) { return ptKey(r.name); }).slice(0, 8);
    var arrows = arr(p.arrows).map(obj).filter(function (a) { return ptKey(a.from) && ptKey(a.to); }).slice(0, 6);
    var fronts = arr(p.fronts).map(obj).filter(function (f) { return arr(f.points).filter(ptKey).length >= 2; }).slice(0, 2);
    var targets = arr(p.targets).map(obj).filter(function (t) { return ptKey(t.at); }).slice(0, 4);
    var labels = arr(p.labels).map(obj).filter(function (l) { return str(l.text) && ptKey(l.at || l.text); }).slice(0, 6);
    var names = [];
    regions.forEach(function (r) { names.push(r.name); });
    arrows.forEach(function (a) { names.push(a.from, a.to); });
    fronts.forEach(function (f) { arr(f.points).forEach(function (q) { if (ptKey(q)) names.push(q); }); });
    targets.forEach(function (t) { names.push(t.at); });
    labels.forEach(function (l) { names.push(l.at || l.text); });
    if (!names.length) names = ["france", "germany", "britain", "poland"];
    var shot = S.shot("plain", 0, 1e9, { color: "#E6D8B6" }), Ww = shot.Ww;
    var box = Pt ? { x: 22, y: 166, w: Ww - 44, h: 420 } : SQ ? { x: Ww * 0.3, y: 70, w: Ww * 0.67, h: 860 } : { x: Ww * 0.25, y: 56, w: Ww * 0.72, h: 888 };
    var MV = shot.map({ x: box.x, y: box.y, w: box.w, h: box.h, names: names });
    var nar = obj(p.narrator), nsp = spec2({ role: nar.role || "general", nation: nar.nation || p.nation || (regions[0] && regions[0].nation) || "neutral" });
    var inset = Pt ? shot.inset({ x: 0, y: 0.59, w: 0.5, h: 0.41 }, { groundY: 500 }) : SQ ? shot.inset({ x: 0, y: 0.4, w: 0.34, h: 0.6 }, { groundY: 1000 }) : shot.inset({ x: 0, y: 0.36, w: 0.27, h: 0.64 }, { groundY: 1000 });
    var nsc = Pt ? 1.2 : SQ ? 1.25 : 1.4;
    var gen = inset.character(nsp, { x: inset.Ww * (Pt ? 0.42 : 0.5), y: inset.groundY - 278 * nsc, scale: nsc, facing: 0.6, expression: nar.expression || "serious", prop: "pointer", gesture: "hold" });
    narrate(gen, 0.05, D);
    var ev = [];
    var tR = syncTimes(regions.map(function (r) { return r.word || r.name; }), { a: 0.6, b: D * 0.5, gap: 0.35 });
    regions.forEach(function (r, i) {
      var nat = r.nation || nationKey(r.name, null) || "neutral";
      MV.region(r.name, nat, tR[i], { flag: r.flag !== false });
      MV.label(str(r.label) || natName(nat), tR[i] + 0.35, { at: r.name, size: Pt ? 24 : 26, dy: 26 });
      ev.push(tR[i]);
    });
    var tF = syncTimes(fronts.map(function (f) { return f.word; }), { a: D * 0.3, b: D * 0.7 });
    fronts.forEach(function (f, i) { MV.front(arr(f.points).filter(ptKey), tF[i], { color: f.color }); ev.push(tF[i]); });
    var tA = syncTimes(arrows.map(function (a) { return a.word || a.to; }), { a: D * 0.35, b: D * 0.7 });
    arrows.forEach(function (a, i) { MV.arrow(a.from, a.to, tA[i], { nation: a.nation, color: a.color }); ev.push(tA[i]); });
    var tT = syncTimes(targets.map(function (t) { return t.word || t.at; }), { a: D * 0.5, b: D * 0.8 });
    targets.forEach(function (t, i) {
      MV.target(t.at, tT[i], { label: t.label, boom: t.boom, size: Pt ? 24 : 28 });
      gen.expression("shocked", tT[i] + 0.1).gesture("hands-head", tT[i] + 0.05).hop(tT[i] + 0.05, 24);
      gen.expression(nar.expression || "serious", tT[i] + 1.6).gesture("hold", tT[i] + 1.6);
    });
    var tL = syncTimes(labels.map(function (l) { return l.word || l.text; }), { a: D * 0.3, b: D * 0.75 });
    labels.forEach(function (l, i) { MV.label(l.text, tL[i], { at: l.at || l.text, size: clamp(num(l.size, 32), 24, 48) }); });
    ev.sort(function (a, b) { return a - b; });
    var lastG = -9;
    ev.forEach(function (t, i) { if (t - lastG < 1.1) return; gen.gesture(i % 2 ? "point-up" : "point", t - 0.15); gen.gesture("hold", t + 0.9); lastG = t; });
    if (p.focus !== false && arrows.length) {
      MV.zoomTo(arrows[0].to, tA[0] - 0.2, 1.8, 1.14, 0.35);
    } else shot.cam.push(1.04, 0.2, Math.max(1, D - 1));
    if (str(p.title)) S.thumb(p.title, 0.3, { x: Pt ? 0.5 : SQ ? 0.63 : 0.61, y: Pt ? 0.175 : SQ ? 0.1 : 0.12, size: SQ ? "sm" : "md", kicker: p.kicker, width: Pt ? 0.86 : 0.5, shake: false });
    dateTop(p.date, Pt ? { x: 0.76, y: 0.64 } : SQ ? { x: 0.16, y: 0.12 } : {});
    if (str(p.caption)) S.caption(p.caption, tc(wordAt(p.captionWord, p.caption, D * 0.7)), Pt ? { x: 0.73, y: 0.715, width: 0.5, size: 40 } : SQ ? { x: 0.64, y: 0.88, width: 0.62, size: 38 } : { x: 0.62, y: 0.88, width: 0.62 });
  };

  // ---- diplomacy-desk: letters fly and pile up, a counter ticks, then the stamp ----
  TPL["diplomacy-desk"] = function (root, p) {
    var Pt = V.isPortrait, SQ = V.isSquare;
    var spS = spec2(p.sender, "diplomat", "britain"), spR = spec2(p.receiver, "diplomat", "ussr");
    var n = clamp(Math.round(num(p.letters, 3)), 1, 8), kind = p.kind === "telegram" ? "telegram" : "letter";
    var G0 = Pt ? 760 : SQ ? 850 : 900;
    var shot = S.shot("office", 0, 1e9, { groundY: G0 }), Ww = shot.Ww, G = shot.groundY;
    var sc = Pt ? 0.66 : SQ ? 0.78 : 1.15, sx = Ww * (Pt ? 0.25 : SQ ? 0.24 : 0.22), rx = Ww * (Pt ? 0.75 : SQ ? 0.76 : 0.78);
    var A = shot.character(spS, { x: sx, y: G - 278 * sc, scale: sc, facing: 0.6, expression: "smile", gesture: "hold", prop: kind });
    var B = shot.character(spR, { x: rx, y: G - 278 * sc, scale: sc, facing: -0.5, expression: p.receiverMood || "calm", gesture: p.receiverGesture || "cross" });
    narrate(A, 0.05, D);
    var dw = Pt ? 290 : 340, desk = svg("g", null, shot.L.chars);
    desk.innerHTML = '<g transform="translate(' + f1(sx) + " " + f1(G) + ") scale(" + sc + ')">' + deskMarkup(0, -146, dw, "#7A5236") + R(-dw * 0.3, -160, 60, 14, "#FFF4DC", 3, SK(INK, 3)) + P("M" + f1(dw * 0.18) + " -146V-196", "none", SK(INK, 6)) + C(dw * 0.18, -200, 9, GOLD, SK(INK, 3)) + "</g>" +
      '<g transform="translate(' + f1(rx) + " " + f1(G) + ") scale(" + sc + ')">' + deskMarkup(0, -146, dw, "#7A5236") + R(dw * 0.12, -176, 54, 30, "#C9C2B0", 4, SK(INK, 3)) + "</g>";
    function plaque(n) { return '<g transform="translate(-36 -118)">' + bannerMarkup(n, 72, 48) + R(0, 0, 72, 48, "none", 3, SK(INK, 4)) + "</g>"; }
    if (Pt) desk.innerHTML += '<g transform="translate(' + f1(sx) + " " + f1(G) + ") scale(" + sc + ')">' + plaque(spS.nation) + "</g>" + '<g transform="translate(' + f1(rx) + " " + f1(G) + ") scale(" + sc + ')">' + plaque(spR.nation) + "</g>";
    else [[sx, -1, spS.nation], [rx, 1, spR.nation]].forEach(function (q) { shot.flag(q[2], { x: q[0] + q[1] * dw * 0.4 * sc, y: G - 146 * sc - 150 * sc, w: 92 * sc, poleH: 150 * sc, dir: q[1] < 0 ? -1 : 1, layer: "chars" }); });
    var words = arr(p.words).map(str);
    var keys = []; for (var i = 0; i < n; i++) keys.push(words[i] || null);
    var times = syncTimes(keys, { a: 0.9, b: D * 0.72, gap: 0.42 });
    var deskTop = G - 146 * sc, handY = G - 278 * sc + 150 * sc, landed = [];
    times.forEach(function (t, i) {
      var land = { x: rx - 92 * sc + (hash(i * 3.1) - 0.5) * 34 * sc, y: deskTop - 20 * sc - i * 8 * sc };
      var lt = shot.letter({ x: sx + 90 * sc, y: handY }, land, t - 0.1, { kind: kind, dur: 0.5, arc: 150 + 30 * (i % 3), scale: sc * 1.05, rot: (hash(i) - 0.5) * 30 });
      landed.push(lt.lands);
      A.gesture("point", t - 0.22, 0.16).prop(null, t - 0.12).gesture("hold", t + 0.3).prop(kind, t + 0.32);
      if (i === Math.floor(n / 2) && n > 2) A.expression("worried", t);
      if (i === n - 1 && n > 1) A.expression("nervous", t);
      if (i === Math.floor((n - 1) / 2) && B) { B.gesture("shrug", t + 0.5).gesture(p.receiverGesture || "cross", t + 1.4); B.lookAt({ x: land.x, y: land.y }, t + 0.4).lookAt("auto", t + 1.3); }
    });
    // counter chip
    var F = film_(), lab = str(p.counterLabel) || (kind === "telegram" ? "telegrams" : "letters");
    var cfs = u(Pt ? 40 : 40), cw = measure("8 " + lab.toUpperCase(), cfs, 900) + cfs * 1.4, ch = cfs * 1.6;
    var cEl = div("ch-tag ch-count", F.over, "");
    cEl.style.fontSize = f1(cfs) + "px"; cEl.style.lineHeight = f1(ch) + "px"; cEl.style.width = f1(cw) + "px"; cEl.style.height = f1(ch) + "px";
    var cb = clampBox(0.5 * W, (Pt ? 0.32 : SQ ? 0.27 : 0.27) * H, cw, ch);
    cEl.style.left = f1(cb.x) + "px"; cEl.style.top = f1(cb.y) + "px";
    var c0 = landed[0] - 0.5;
    F.anims.push(function (t) {
      var on = t >= c0;
      showEl(cEl, on);
      if (!on) return;
      var k = 0, lastL = -9;
      landed.forEach(function (lt) { if (t >= lt) { k++; lastL = lt; } });
      cEl.textContent = k + " " + (k === 1 ? lab.replace(/s$/i, "") : lab).toUpperCase();
      var bump = t - lastL < 0.25 ? 1 + 0.18 * Math.sin(((t - lastL) / 0.25) * PI) : 1;
      setS(cEl, "transform", "rotate(-2deg) scale(" + f2(popK(t, c0, 0.3) * bump) + ")");
    });
    F.boxes.push(function (t) { return t >= c0 ? [{ kind: "counter", label: lab, x: cb.x, y: cb.y, w: cw, h: ch, moving: false }] : []; });
    if (str(p.title)) S.thumb(p.title, 0.3, { x: 0.5, y: Pt ? 0.235 : 0.13, size: "md", width: Pt ? 0.86 : SQ ? 0.8 : 0.5, shake: false });
    dateTop(p.date, Pt ? { x: 0.22, y: 0.15 } : {});
    var tEnd = landed[landed.length - 1] + 0.5;
    if (p.reply) {
      var tRp = tc(Math.max(tEnd, wordAt(p.replyWord, null, tEnd, tEnd - 0.5) || tEnd));
      shot.letter({ x: rx - 80 * sc, y: handY }, { x: sx + 40 * sc, y: deskTop - 22 * sc }, tRp, { kind: kind, dur: 0.6, arc: 200, scale: sc * 1.15 });
      B.gesture("point-left", tRp - 0.2).face(-0.5, tRp + 0.4);
      A.expression("excited", tRp + 0.6).gesture("cheer", tRp + 0.6).hop(tRp + 0.6, 30);
      S.stamp(str(p.stamp) || "FINALLY", tc(tRp + 0.9), { x: 0.5, y: Pt ? 0.43 : 0.45, color: "#2F8A4E", width: SQ ? 0.7 : null });
    } else {
      var tS = tc(Math.min(tEnd + 0.3, endLimit() - 0.3));
      S.stamp(str(p.stamp) || "NO REPLY", tS, { x: 0.5, y: Pt ? 0.43 : 0.47, width: SQ ? 0.7 : null });
      A.expression(p.senderReaction || "sad", tS + 0.2).gesture("shrug", tS + 0.2);
      if (!p.receiverMood) B.expression("smug", tS);
    }
    shot.cam.push(1.04, 0.2, Math.max(1, D - 1));
  };

  // ---- headline-thumb: stripes, one big reacting chibi, giant text with flash and shake ----
  TPL["headline-thumb"] = function (root, p) {
    var Pt = V.isPortrait, SQ = V.isSquare, sp = spec2(p, "pilot", "usa"), side = p.side === "right" ? "right" : "left";
    var title = str(p.title) || narrationTitle();
    var tH = tc(Math.max(0.8, wordAt(p.word, title, D * 0.3)));
    var shot = S.shot("plain", 0, 1e9, { nation: sp.nation }), Ww = shot.Ww;
    var sc = Pt ? 1.15 : SQ ? 1.05 : 1.45, x = Pt ? Ww * 0.5 : Ww * (side === "left" ? 0.25 : 0.75), hy = Pt ? 600 : SQ ? 620 : 590;
    shot.focusLines(tH, 1e9, { x: x, y: hy, layer: "back", color: "rgba(255,255,255,0.42)" });
    var fsd = Pt || side === "left" ? -1 : 1;
    if (p.flag !== false) shot.flag(sp.nation, { x: x + fsd * Ww * (Pt ? 0.3 : 0.15), y: Pt ? 360 : 250, w: Pt ? 170 : 230, poleH: 900, dir: -fsd, layer: "back" });
    var a = shot.character(sp, { x: x, y: hy, scale: sc, facing: Pt ? 0.25 : side === "left" ? 0.5 : -0.5, expression: p.expression || "worried" });
    narrate(a, 0.05, D);
    liven(a, 0.3, tH - 0.6, ["rest", "think", "rest"]);
    a.expression(p.reaction || "shocked", tH - 0.04).gesture(p.gesture || "hands-head", tH - 0.1).hop(tH - 0.05, 30, 0.4);
    var tAfter = tc(tH + 1.8);
    if (p.afterExpression && tAfter > tH + 1) a.expression(p.afterExpression, tAfter).gesture("rest", tAfter);
    S.flash(tH, "#FFFFFF", 0.24);
    S.shakeFrame(tH + 0.05, 16, 0.4);
    // before the hit the camera frames the chibi; on the hit it punches out to the thumbnail layout
    shot.cam.set({ x: Pt ? Ww / 2 : lerp(Ww / 2, x, 0.85), y: Pt ? 560 : 520, zoom: Pt ? 1.12 : 1.18 });
    shot.cam.push(Pt ? 1.18 : 1.24, 0.1, Math.max(0.5, tH - 0.2));
    shot.cam.to({ x: Ww / 2, y: 500, zoom: 1.1 }, tH - 0.06, 0.16, "outCubic");
    shot.cam.to({ zoom: 1.03 }, tH + 0.12, 0.7, "inOutSine");
    var tx = Pt ? 0.5 : side === "left" ? 0.66 : 0.34;
    S.thumb(title, tH, { x: tx, y: Pt ? 0.25 : SQ ? 0.28 : 0.4, size: Pt || SQ ? "lg" : "xl", kicker: p.kicker, width: Pt ? 0.9 : SQ ? 0.58 : 0.54, color: isColor(p.titleColor) ? p.titleColor : null, shakeAmp: 4 });
    if (p.target) shot.target(function (t) { return rigAt(a, t).hx; }, function (t) { return rigAt(a, t).hy - 10 * sc; }, tH + 0.3, { r: 175 * sc, layer: "fx", ring: true });
    if (str(p.sub)) S.caption(p.sub, tc(tH + 0.9), Pt ? { x: 0.5, y: 0.415, width: 0.9 } : SQ ? { x: tx, y: 0.6, width: 0.56, size: 40 } : { x: tx, y: 0.74, width: 0.52 });
    dateTop(p.date);
  };

  // ---- date-card: chapter opener ----
  TPL["date-card"] = function (root, p) {
    var Pt = V.isPortrait, SQ = V.isSquare, nk = nationKey(p.nation || "neutral"), role = roleKey(p.role, "soldier");
    var shot = S.shot("plain", 0, 1e9, { nation: nk }), Ww = shot.Ww;
    var title = str(p.title) || narrationTitle();
    var tT = tc(Math.max(1.0, wordAt(p.word, title, D * 0.3)));
    if (str(p.chapter)) S.tag(p.chapter, 0.2, { x: 0.5, y: Pt ? 0.2 : SQ ? 0.17 : 0.17, dark: true, size: 36 });
    S.dateTag(str(p.date) || "1939", 0.35, { x: 0.5, y: Pt ? 0.29 : SQ ? 0.33 : 0.35, size: Pt ? 118 : 150, rotate: -4, reserve: false });
    S.shakeFrame(0.42, 10, 0.3);
    S.thumb(title, tT, { x: 0.5, y: Pt ? 0.43 : SQ ? 0.56 : 0.58, size: "lg", width: Pt ? 0.86 : SQ ? 0.8 : 0.7, shakeAmp: 5 });
    if (str(p.place)) { var tP = V.find(contentWords(p.place)[0] || "", 0); S.tag(p.place, tc(tP != null ? tP : tT + 0.6), { x: 0.5, y: Pt ? 0.56 : SQ ? 0.77 : 0.78, color: natColor(nk) }); }
    shot.planes(0.4, 1e9, { kind: p.planes === "bomber" ? "bomber" : "fighter", count: 3, y: Pt ? 80 : 95, layer: "sky", formation: true, scale: Pt ? 0.5 : 0.6 });
    var fx = Pt ? Ww * 0.14 : Ww * 0.08;
    shot.flag(nk, { x: fx, y: Pt ? 640 : 560, w: Pt ? 120 : 170, poleH: 700, layer: "main" });
    var ax = Pt ? Ww * 0.74 : Ww * 0.88, hy = Pt ? 690 : SQ ? 800 : 820, sc = Pt ? 0.92 : 1.0;
    var a = shot.character({ role: role, nation: nk }, { x: ax, y: hy, scale: sc, facing: -0.4, expression: "smile" });
    a.noInspect = true;
    a.pos.set({ x: ax, y: hy + 460 }, 0);
    var tPeek = tc(Math.min(1.0, D * 0.15));
    a.pos.to({ x: ax, y: hy }, tPeek, 0.5, "out");
    a.gesture("wave", tPeek + 0.4).expression("happy", tT).hop(tT, 18, 0.34);
    a.gesture("salute", tc(tT + 1.4));
    shot.cam.push(1.04, 0.2, Math.max(1, D - 1));
  };

  // ---- versus-forces: split screen with pictogram rows that count up ----
  function pictoMarkup(kind, col) {
    var o = SK(INK, 5), d = shade(col, 0.78);
    if (kind === "tank") return R(10, 58, 80, 24, "#4A4752", 12, o) + C(24, 70, 6, "#8E8A82") + C(42, 70, 6, "#8E8A82") + C(60, 70, 6, "#8E8A82") + C(78, 70, 6, "#8E8A82") + P("M14 58L22 42H80L88 58Z", col, o) + P("M34 42Q36 26 52 26Q66 26 68 42Z", d, o) + R(64, 30, 32, 8, d, 3, SK(INK, 4));
    if (kind === "plane") return '<g transform="translate(50 52) scale(0.62)">' + planeMarkup("fighter", col) + "</g>";
    if (kind === "bomber") return '<g transform="translate(50 50) scale(0.38)">' + planeMarkup("bomber", col) + "</g>";
    if (kind === "ship") return P("M6 62H94L82 86H18Z", col, o) + R(30, 44, 36, 18, d, 3, o) + R(44, 28, 12, 16, "#4A4752", 2, o) + L(70, 44, 70, 22, INK, 4) + L(70, 26, 84, 30, INK, 3);
    return P("M28 92V62Q28 50 50 50Q72 50 72 62V92Z", col, o) + C(50, 34, 15, SKIN, o) + P("M30 30Q30 10 50 10Q70 10 70 30Q50 24 30 30Z", d, o) + L(76, 40, 76, 92, "#5A3E2B", 6);
  }
  TPL["versus-forces"] = function (root, p) {
    var Pt = V.isPortrait, SQ = V.isSquare, Ls = obj(p.left), Rs = obj(p.right), nL = nationKey(Ls.nation || "switzerland"), nR = nationKey(Rs.nation || "germany");
    var rows = arr(p.rows).map(obj).slice(0, 4);
    if (!rows.length) rows = [{ label: "Strength", left: 1, right: 2, icon: "soldier" }];
    var n = rows.length, F = film_();
    var shot = S.shot("plain", 0, 1e9, { color: BG });
    var hL = S.half(shot, "left", { dir: "vertical", groundY: Pt ? 820 : 1010 }), hR = S.half(shot, "right", { dir: "vertical", groundY: Pt ? 820 : 1010 });
    LOCATIONS.plain(hL, { color: tint(natOf(nL).b.field, 0.72) });
    LOCATIONS.plain(hR, { color: tint(natOf(nR).b.field, 0.72) });
    var fy = Pt ? 268 : 120, fw = Pt ? 80 : 150;
    hL.flag(nL, { x: hL.Ww * (Pt ? 0.32 : 0.3), y: fy, w: fw, poleH: fw * 0.9, layer: "main" });
    hR.flag(nR, { x: hR.Ww * (Pt ? 0.68 : 0.7), y: fy, w: fw, dir: -1, poleH: fw * 0.9, layer: "main" });
    S.tag(str(Ls.label) || natName(nL), 0.3, { x: Pt ? 0.24 : 0.17, y: Pt ? 0.215 : 0.27, color: natColor(nL) });
    S.tag(str(Rs.label) || natName(nR), 0.4, { x: Pt ? 0.76 : 0.83, y: Pt ? 0.215 : 0.27, color: natColor(nR) });
    if (str(p.title)) S.thumb(p.title, 0.2, { x: 0.5, y: Pt ? 0.155 : 0.09, size: Pt ? "md" : "sm", kicker: p.kicker, width: Pt ? 0.6 : 0.36, shake: false });
    S.vsBadge(0.45, { x: 0.5, y: Pt ? 0.29 : 0.235, r: Pt ? 58 : 68 });
    var gsc = Pt ? 0.5 : 0.62, gL = hL.character({ role: roleKey(Ls.role, "general"), nation: nL }, { x: hL.Ww * 0.5, y: hL.groundY - 278 * gsc, scale: gsc, facing: 0.5, expression: "smile" });
    var gR = hR.character({ role: roleKey(Rs.role, "general"), nation: nR }, { x: hR.Ww * 0.5, y: hR.groundY - 278 * gsc, scale: gsc, facing: -0.5, expression: "smile" });
    var times = syncTimes(rows.map(function (r) { return r.word || bestWord(r.label); }), { a: 0.9, b: D * 0.72, gap: 0.6 });
    var ST = Pt || SQ, y0 = Pt ? 0.36 : SQ ? 0.3 : 0.34, y1 = Pt ? 0.6 : SQ ? 0.7 : 0.73, pitch = (y1 - y0) / n, sa = safe();
    var iconPx = u(Pt ? (n > 3 ? 44 : 52) : SQ ? (n > 3 ? 38 : 46) : n > 3 ? 66 : 80), gapPx = iconPx * 1.08, numPx = u(Pt ? (n > 3 ? 42 : 50) : SQ ? (n > 3 ? 38 : 44) : n > 3 ? 54 : 64);
    rows.forEach(function (r, i) {
      var t = times[i], yc = (y0 + pitch * (i + 0.5)) * H, lv = Math.max(0, num(r.left, 0)), rv = Math.max(0, num(r.right, 0)), mx = Math.max(lv, rv, 1e-9);
      var maxI = ST ? 5 : 6, kl = Math.max(1, Math.round((maxI * lv) / mx)), kr = Math.max(1, Math.round((maxI * rv) / mx));
      if (lv === 0) kl = 0;
      if (rv === 0) kr = 0;
      var icon = ["soldier", "tank", "plane", "bomber", "ship"].indexOf(r.icon) >= 0 ? r.icon : "soldier", suf = str(r.suffix);
      S.tag(str(r.label) || icon, t - 0.1, { x: 0.5, y: yc / H, size: Pt ? 28 : 32, color: GOLD });
      [[lv, kl, nL, -1], [rv, kr, nR, 1]].forEach(function (q) {
        var val = q[0], k = q[1], col = natOf(q[2]).uni, sd = q[3];
        var full0 = V.format(val, val % 1 ? 1 : 0) + suf, nw0 = measure(full0, numPx, 900) + u(10);
        if (!ST) { var room = (sa.x1 - u(6)) - (W / 2 + u(140)) - nw0 - u(24); k = Math.min(k, Math.max(1, Math.floor((room - iconPx) / gapPx) + 1)); if (val === 0) k = 0; }
        var ic = div("ch-vicons", F.over), html = "";
        for (var j = 0; j < k; j++) html += '<svg viewBox="-6 -6 112 112" width="' + f1(iconPx) + '" height="' + f1(iconPx) + '" style="position:absolute;left:' + f1(j * gapPx) + 'px;top:0">' + pictoMarkup(icon, col) + "</svg>";
        ic.innerHTML = html;
        var iw = Math.max(iconPx, (k - 1) * gapPx + iconPx), numEl = div("ch-vnum", F.over, "0");
        numEl.style.fontSize = f1(numPx) + "px";
        var full = V.format(val, val % 1 ? 1 : 0) + suf, nw = measure(full, numPx, 900) + u(10), nh = numPx * 1.2, ix, iy, nx, ny;
        if (ST) {
          var cx = sd < 0 ? W * 0.25 : W * 0.75;
          ix = cx - iw / 2; iy = yc + u(4); nx = cx - nw / 2; ny = yc - nh;
        } else {
          var inner = sd < 0 ? W * 0.5 - u(140) : W * 0.5 + u(140);
          ix = sd < 0 ? inner - iw : inner; iy = yc - iconPx / 2;
          nx = sd < 0 ? ix - u(24) - nw : ix + iw + u(24); ny = yc - nh / 2;
          nx = clamp(nx, sa.x0 + u(4), sa.x1 - nw - u(4));
        }
        ic.style.left = f1(ix) + "px"; ic.style.top = f1(iy) + "px"; ic.style.width = f1(iw) + "px"; ic.style.height = f1(iconPx) + "px";
        numEl.style.left = f1(nx) + "px"; numEl.style.top = f1(ny) + "px"; numEl.style.width = f1(nw) + "px"; numEl.style.lineHeight = f1(nh) + "px";
        var kids = [].slice.call(ic.children);
        F.anims.push(function (tt) {
          showEl(ic, tt >= t); showEl(numEl, tt >= t);
          if (tt < t) return;
          kids.forEach(function (e, j) { var kk = popK(tt, t + j * 0.07, 0.28); e.style.transform = "scale(" + f2(kk) + ")"; e.style.visibility = kk > 0.01 ? "visible" : "hidden"; });
          var pp = CE.out((tt - t) / 0.9), cur = val * pp;
          numEl.textContent = V.format(val % 1 ? cur : Math.round(cur), val % 1 ? 1 : 0) + suf;
          setS(numEl, "transform", "scale(" + f2(popK(tt, t, 0.3)) + ")");
        });
        F.boxes.push(function (tt) { return tt >= t ? [{ kind: "count", label: full, x: nx, y: ny, w: nw, h: nh, moving: tt < t + 0.35 }, { kind: "icons", label: icon, x: ix, y: iy, w: iw, h: iconPx, moving: tt < t + 0.6 }] : []; });
      });
      var big = lv >= rv ? gL : gR, small = lv >= rv ? gR : gL;
      if (lv !== rv) { big.expression("proud", t + 0.2).gesture(i % 2 ? "hips" : "fist-up", t + 0.15).hop(t + 0.15, 22); small.expression(i === n - 1 ? "nervous" : "worried", t + 0.3).gesture(i % 2 ? "shrug" : "hands-head", t + 0.25); }
    });
    var tEnd = times[n - 1] + 1.6;
    if (tEnd < endLimit()) { gL.gesture("rest", tEnd); gR.gesture("rest", tEnd); }
  };

  // ---- neutral-question: the map zooms onto a neutral country, why not? ----
  TPL["neutral-question"] = function (root, p) {
    var Pt = V.isPortrait, SQ = V.isSquare, country = ptKey(p.country) || "switzerland", cn = nationKey(p.countryNation || country);
    var ag = nationKey(p.aggressor || "germany"), role = roleKey(p.role, "officer");
    var agRegs = arr(p.aggressorRegions).map(ptKey).filter(function (k) { return k && k !== country; }).slice(0, 6);
    if (!agRegs.length) agRegs = [ptKey(ag) || "germany"];
    var q = str(p.question) || "Why *not*?";
    var tQ = tc(Math.max(1.6, wordAt(p.word || "why", q, D * 0.55)));
    var regT = syncTimes(agRegs, { a: 0.9, b: Math.max(1.2, tQ - 0.9), gap: 0.4, limit: Math.max(1.2, tQ - 0.7) });
    var t1 = regT[0] > 1.6 ? clamp(regT[0] - 0.3, 1.2, 2.6) : 0;
    var asp = { role: role, nation: ag };
    if (t1 > 0) {
      var s1 = S.shot("war-room", 0, t1, { nation: ag });
      var f1_ = s1.frame("medium", Pt ? "center" : "left");
      var o1 = s1.character(asp, { x: f1_.x, y: f1_.y, scale: f1_.scale, facing: Pt ? 0.2 : 0.5, expression: p.expression || "thinking", gesture: "hold-both", prop: p.prop || "map" });
      narrate(o1, 0.05, t1);
      s1.cam.push(1.06, 0.1, t1);
    }
    var shot = S.shot("plain", t1, 1e9, { color: "#E6D8B6", enter: t1 > 0 ? "zoom" : "cut" }), Ww = shot.Ww;
    var box = Pt ? { x: 22, y: 166, w: Ww - 44, h: 420 } : SQ ? { x: Ww * 0.3, y: 70, w: Ww * 0.67, h: 860 } : { x: Ww * 0.25, y: 56, w: Ww * 0.72, h: 888 };
    var MV = shot.map({ x: box.x, y: box.y, w: box.w, h: box.h, names: [country].concat(agRegs) });
    agRegs.forEach(function (r, i) { MV.region(r, ag, Math.max(t1 + 0.15, regT[i]), { flag: true }); });
    MV.flag(country, cn, t1 + 0.4);
    MV.label(natName(cn), t1 + 0.6, { at: country, size: Pt ? 24 : 28, dy: 28 });
    if (p.arrows !== false) MV.arrow(agRegs[0], country, tc(Math.max(t1 + 0.6, tQ - 1.1)), { nation: ag, stop: 0.74, back: 0.14, dur: 0.6 });
    MV.qmarks(country, tQ, 1e9);
    MV.zoomTo(country, tc(Math.max(t1 + 0.4, tQ - 1.6)), 1.4, 1.4, 0.55);
    var inset = Pt ? shot.inset({ x: 0, y: 0.59, w: 0.5, h: 0.41 }, { groundY: 500 }) : SQ ? shot.inset({ x: 0, y: 0.4, w: 0.34, h: 0.6 }, { groundY: 1000 }) : shot.inset({ x: 0, y: 0.36, w: 0.27, h: 0.64 }, { groundY: 1000 });
    var nsc = Pt ? 1.2 : SQ ? 1.25 : 1.4;
    var o2 = inset.character(asp, { x: inset.Ww * (Pt ? 0.42 : 0.5), y: inset.groundY - 278 * nsc, scale: nsc, facing: 0.6, expression: p.expression || "thinking", gesture: "hold-both", prop: p.prop || "map" });
    narrate(o2, t1, D);
    o2.gesture("shrug", tQ - 0.1).prop(null, tQ - 0.1).expression(p.afterExpression || "nervous", tQ + 0.1).hop(tQ - 0.05, 26);
    S.thumb(q, tQ, { x: Pt ? 0.5 : SQ ? 0.63 : 0.62, y: Pt ? 0.175 : SQ ? 0.14 : 0.17, size: Pt ? "lg" : "xl", kicker: p.kicker, width: Pt ? 0.86 : 0.5 });
    dateTop(p.date, Pt ? { x: 0.76, y: 0.64 } : SQ ? { x: 0.16, y: 0.12 } : {});
    if (str(p.caption)) S.caption(p.caption, tc(Math.max(tQ + 1.0, D - 2.6)), Pt ? { x: 0.73, y: 0.715, width: 0.5, size: 38 } : SQ ? { x: 0.64, y: 0.88, width: 0.62, size: 36 } : { x: 0.62, y: 0.88, width: 0.62 });
  };

  // ---- timeline-war: a road with dated stops, a chibi marches along ----
  TPL["timeline-war"] = function (root, p) {
    var Pt = V.isPortrait, SQ = V.isSquare;
    var events = arr(p.events).map(obj).filter(function (e) { return str(e.label) || str(e.date); }).slice(0, 6);
    if (!events.length) events = [{ date: "1939", label: narrationTitle() }];
    var n = events.length, F = film_(), sa = safe();
    var shot = S.shot("plain", 0, 1e9, { color: isColor(p.color) ? hex6(p.color) : "#ECE0C2" }), Ww = shot.Ww;
    shot.cam.drift = 0;
    var times = syncTimes(events.map(function (e) { return e.word || bestWord(e.label); }), { a: 0.8, b: D * 0.8, gap: 0.6 });
    var sp = { role: roleKey(p.role, "soldier"), nation: nationKey(p.nation || "neutral") };
    var road = svg("g", null, shot.L.back), m = "", pts = [];
    var hasTitle = !!str(p.title);
    if (!Pt) {
      var ry = SQ ? 720 : 740, xa = Ww * 0.13, xb = Ww * 0.87;
      m += P("M-420 " + f1(ry + 16) + "Q" + f1(Ww * 0.3) + " " + f1(ry - 14) + " " + f1(Ww * 0.5) + " " + f1(ry + 6) + "T" + f1(Ww + 420) + " " + f1(ry + 2) + "V1100H-420Z", "#C8B48A", SK(INK, 4));
      m += R(-420, ry - 34, Ww + 840, 68, "#9C8E78", 0, SK(INK, 5)) + L(-420, ry, Ww + 420, ry, "#F3EAD6", 6, ' stroke-dasharray="34 26"');
      for (var i = 0; i < n; i++) pts.push({ x: n > 1 ? lerp(xa, xb, i / (n - 1)) : Ww / 2, y: ry });
    } else {
      var rx = Ww * 0.17, ya = hasTitle ? 270 : 230, yb = 690;
      m += R(rx - 34, -100, 68, 1200, "#9C8E78", 0, SK(INK, 5)) + L(rx, -100, rx, 1100, "#F3EAD6", 6, ' stroke-dasharray="34 26"');
      for (i = 0; i < n; i++) pts.push({ x: rx, y: n > 1 ? lerp(ya, yb, i / (n - 1)) : (ya + yb) / 2 });
    }
    pts.forEach(function (q, i) { m += C(q.x, q.y, 22, "#FFF7E6", SK(INK, 5)) + TX(q.x, q.y + 9, String(i + 1), 26, INK); });
    road.innerHTML = m;
    // cards
    var cardW = Pt ? W * 0.66 : Math.min(u(420), sa.w / n - u(22)), fsz = u(Pt ? 48 : n > 4 ? 36 : 46), conn = svg("g", null, shot.L.back);
    events.forEach(function (e, i) {
      var t = times[i], q = pts[i], sp_ = toScr(shot, camAt(shot, 0), q.x, q.y);
      var lay = layoutRich(str(e.label) || " ", { size: fsz, minSize: fsz * 0.55, maxWidth: cardW - u(36), maxLines: 3, weight: 900, lh: 1.08 });
      var dateTxt = plain(clean(e.date)).toUpperCase(), dfs = u(Pt ? 38 : 34), dh = dfs * 1.5, ch_ = lay.h + u(30) + dh * 0.6;
      var cx = Pt ? W * 0.6 : sp_[0], cy = Pt ? sp_[1] : (SQ ? 0.38 : 0.37) * H;
      var bx = clampBox(cx, cy + dh * 0.3, cardW, ch_ + dh * 0.4);
      var card = div("ch-card", F.over), dEl = div("ch-cardd", card, dateTxt || String(i + 1)), tEl = div("ch-cardt", card);
      fillRich(tEl, lay, "ch-ctw");
      card.style.left = f1(bx.x) + "px"; card.style.top = f1(bx.y + dh * 0.4) + "px"; card.style.width = f1(cardW) + "px"; card.style.height = f1(ch_) + "px";
      dEl.style.fontSize = f1(dfs) + "px"; dEl.style.height = f1(dh) + "px"; dEl.style.lineHeight = f1(dh) + "px"; dEl.style.top = f1(-dh * 0.55) + "px";
      tEl.style.top = f1(dh * 0.55) + "px"; tEl.style.width = f1(lay.w + 2) + "px"; tEl.style.left = f1((cardW - lay.w) / 2) + "px";
      if (e.nation) dEl.style.background = natColor(e.nation);
      // connector from the card to the marker (world units)
      var cw0 = (bx.x + cardW / 2 - shot.rect.x), cardBottom = bx.y + dh * 0.4 + ch_;
      var wq = Pt ? [(bx.x - shot.rect.x) / shot.k, q.y] : [q.x, (cardBottom) / shot.k];
      var ln = svg("path", { d: Pt ? "M" + f1(q.x + 24) + " " + f1(q.y) + "H" + f1(wq[0] - 6) : "M" + f1(q.x) + " " + f1(wq[1] + 6) + "V" + f1(q.y - 24), fill: "none", stroke: INK, "stroke-width": 5, "stroke-dasharray": "4 12", "stroke-linecap": "round" }, conn);
      void cw0;
      F.anims.push(function (tt) {
        var on = tt >= t;
        showEl(card, on); showEl(ln, on);
        if (on) setS(card, "transform", "translateY(" + f1((1 - CE.snap(clamp((tt - t) / 0.35, 0, 1))) * u(40)) + "px) scale(" + f2(popK(tt, t, 0.35)) + ")");
      });
      F.boxes.push(function (tt) { return tt >= t ? [{ kind: "card", label: e.label || e.date, x: bx.x, y: bx.y, w: cardW, h: ch_ + dh * 0.4, moving: tt < t + 0.4 }] : []; });
      if (e.nation && !Pt) shot.flag(e.nation, { x: q.x + 64, y: q.y - 150, w: 80, poleH: 128, layer: "back" }).pop(t);
    });
    // the marcher
    var sc = Pt ? 0.44 : SQ ? 0.6 : 0.7, off = 0, feet = function (q) { return Pt ? q.y + 40 : q.y + 46; };
    var start = Pt ? { x: pts[0].x, y: pts[0].y } : { x: pts[0].x, y: pts[0].y };
    var a = shot.character(sp, { x: start.x + off, y: feet(start) - 278 * sc, scale: sc, facing: Pt ? 0 : 1, expression: "smile", gesture: "march" });
    var prevT = 0.2;
    events.forEach(function (e, i) {
      var t = times[i], q = pts[i], dur = clamp(t - 0.05 - Math.max(prevT, t - 1.6), 0.4, 1.6), st = t - 0.05 - dur;
      a.gesture("rest", st).walkTo(q.x + off, feet(q) - 278 * sc, st, dur);
      if (Pt) a.face("front", t);
      a.gesture("cheer", t).hop(t, 28, 0.36).expression(e.expression || (i === n - 1 ? "excited" : "happy"), t);
      prevT = t + 0.7;
    });
    if (hasTitle) S.thumb(p.title, 0.25, { x: 0.5, y: Pt ? 0.155 : 0.12, size: "md", kicker: p.kicker, width: Pt ? 0.86 : 0.5, shake: false });
  };

  // ---- crowd-scene: many small chibis plus a leader ----
  TPL["crowd-scene"] = function (root, p) {
    var Pt = V.isPortrait, SQ = V.isSquare, nk = nationKey(p.nation || "france");
    var mood = ["cheer", "march", "wait"].indexOf(p.mood) >= 0 ? p.mood : "cheer";
    var count = clamp(Math.round(num(p.count, 14)), 6, 30), roles = arr(p.roles).map(function (r) { return roleKey(r, "civilian"); });
    if (mood === "march" && !roles.length) roles = ["soldier"];
    var loc = locKey(p.location, "parade");
    var shot = S.shot(loc, 0, 1e9, { nation: nk }), Ww = shot.Ww, G = shot.groundY;
    var text = str(p.text), tW = tc(Math.max(0.9, wordAt(p.word, text, D * 0.5)));
    var csc = Pt ? 0.3 : 0.46, crows = Pt ? 4 : count > 12 ? 3 : 2, cw_ = Pt ? Ww : Math.min(Ww * 0.86, Math.ceil(count / crows) * 250 * csc);
    var crowd = shot.crowd(count, { x: Pt ? Ww / 2 : Math.max(Ww * 0.56, Ww * 0.93 - cw_ / 2), w: cw_, y: G - 24, rows: crows, roles: roles, nation: nk, scale: csc, march: mood === "march" ? (p.direction === "left" ? "left" : "right") : null });
    crowd.forEach(function (c, i) {
      c.noInspect = true;
      var h = hash(i * 1.7 + 0.3);
      if (mood === "cheer") {
        c.expression(h < 0.5 ? "smile" : "neutral", 0).gesture(h < 0.3 ? "wave" : "rest", 0.2 + h);
        c.expression(h < 0.4 ? "excited" : "happy", tW + h * 0.3).gesture(i % 3 === 0 ? "cheer" : i % 3 === 1 ? "hold-up" : "arms-up", tW + h * 0.25);
        if (i % 3 === 1) c.prop("flag", tW + h * 0.25, nk);
        for (var tt = tW + h * 0.3; tt < endLimit() - 0.2; tt += 0.7 + h * 0.4) c.hop(tt, 24 + h * 18, 0.36);
      } else if (mood === "wait") {
        c.expression(["worried", "nervous", "neutral", "worried"][i % 4], 0).gesture(i % 4 === 1 ? "hands-head" : i % 4 === 2 ? "think" : "rest", 0.1);
        c.lookAt("up", 0.2 + h);
        c.expression(i % 2 ? "surprised" : "shocked", tW + h * 0.3).hop(tW + h * 0.3, 22);
      } else {
        c.expression("determined", 0);
        if (i % 2) c.prop("flag", 0, nk);
      }
    });
    var lsp = spec2(p.leader, mood === "march" ? "general" : "officer", nk);
    var lsc = Pt ? 0.82 : SQ ? 0.85 : 0.98, lx = Pt ? Ww * 0.5 : mood === "march" ? Ww * 0.16 : Ww * 0.2, ly = G + (Pt ? 70 : 60) - 278 * lsc;
    var L = shot.character(lsp, { x: lx, y: ly, scale: lsc, facing: Pt ? 0.25 : 0.55, expression: mood === "wait" ? "worried" : "smile" });
    narrate(L, 0.05, D);
    liven(L, 0.3, tW - 0.5, ["rest", "present"]);
    if (mood === "cheer") L.gesture("cheer", tW - 0.1).expression("excited", tW).hop(tW, 30);
    else if (mood === "march") L.gesture("salute", tW - 0.12).expression("proud", tW);
    else L.gesture("arms-up", tW - 0.1).expression("surprised", tW).hop(tW, 24);
    if (mood === "cheer") shot.sparkles(tW, 1e9, { count: 10, area: { x: Ww * 0.1, y: 120, w: Ww * 0.8, h: 380 } });
    if (text) S.thumb(text, tW, { x: Pt ? 0.5 : 0.62, y: Pt ? 0.2 : 0.22, size: "xl", width: Pt ? 0.86 : 0.56 });
    dateTop(p.date);
    if (str(p.caption)) S.caption(p.caption, tc(tW + 1.0), Pt ? { y: 0.34 } : { x: 0.62, y: 0.42, width: 0.56 });
    shot.cam.push(1.05, 0.2, Math.max(1, D - 1));
    shot.cam.shake(tW, 8, 0.4);
  };

  // ---- aftermath-reflection: quiet ending, hat in hand, lines fade in ----
  TPL["aftermath-reflection"] = function (root, p) {
    var Pt = V.isPortrait, SQ = V.isSquare, sp = spec2(p, "soldier", "britain");
    var loc = locKey(p.location, "field"), side = p.side === "right" ? "right" : "left", F = film_(), sa = safe();
    var shot = S.shot(loc, 0, 1e9, { night: loc === "city" || loc === "trench", planes: 0 }), Ww = shot.Ww;
    var lines = arr(p.lines).map(str).filter(Boolean).slice(0, 4);
    if (!lines.length) lines = [plain(clean(V.narration)).split(/[.!?]/)[0] || "And then it was quiet."];
    var f = shot.frame("medium", Pt ? "center" : side);
    if (Pt) { f.scale = 0.85; f.y = shot.groundY + 40 - 278 * f.scale; } else { f.scale = 1.2; f.y = shot.groundY - 278 * f.scale; }
    var a = shot.character(sp, { x: f.x, y: f.y, scale: f.scale, facing: Pt ? 0.25 : side === "left" ? 0.45 : -0.45, expression: p.expression || "gloomy" });
    if (p.hatOff !== false && hasHat(sp.role)) a.hatInHand(0.7);
    a.lookAt("up", 1.2).lookAt("auto", D * 0.55);
    var tEnd = tc(D * 0.66);
    a.expression(p.endExpression || "calm", tEnd);
    var win = findLines(lines), fs = u(Pt ? 56 : 64), bw = Pt ? sa.w * 0.94 : sa.w * 0.52;
    var lays = lines.map(function (l) { return layoutRich(l, { size: fs, minSize: fs * 0.55, maxWidth: bw, maxLines: 2, weight: 900, lh: 1.12 }); });
    var tot = 0; lays.forEach(function (l) { tot += l.h + u(18); });
    var bx = Pt ? W * 0.5 : side === "left" ? W * 0.68 : W * 0.32, by = Pt ? sa.y0 + u(30) + tot / 2 + u(10) : H * 0.42;
    var box = clampBox(bx, by, bw, tot);
    var block = div("ch-refl", F.over), yy = 0, els = [];
    lays.forEach(function (l, i) {
      var e = div("ch-refl-l", block);
      fillRich(e, l, "ch-rw");
      e.style.top = f1(yy) + "px"; e.style.width = f1(bw) + "px";
      yy += l.h + u(18);
      els.push({ el: e, at: Math.max(0.3, win[i].start - 0.1) });
    });
    block.style.left = f1(box.x) + "px"; block.style.top = f1(box.y) + "px"; block.style.width = f1(bw) + "px"; block.style.height = f1(tot) + "px";
    var title = str(p.title), tTitle = title ? tc(Math.max(win[win.length - 1].end + 0.4, D - 2.4)) : 1e9;
    F.anims.push(function (t) {
      var out = title ? smooth((t - tTitle + 0.1) / 0.4) : 0;
      els.forEach(function (e) {
        var k = smooth((t - e.at) / 0.7);
        showEl(e.el, k > 0.001 && out < 0.999);
        setS(e.el, "opacity", f2(k * (1 - out)));
        setS(e.el, "transform", "translateY(" + f1((1 - k) * u(24)) + "px)");
      });
    });
    F.boxes.push(function (t) { var o = []; els.forEach(function (e, i) { if (t >= e.at + 0.3 && t < tTitle) o.push({ kind: "line", label: lines[i], x: box.x, y: box.y + parseFloat(e.el.style.top), w: bw, h: lays[i].h, moving: false }); }); return o; });
    if (title) S.thumb(title, tTitle, { x: box.x / W + bw / 2 / W, y: (box.y + tot / 2) / H, size: "lg", width: Pt ? 0.86 : 0.46, shake: false });
    dateTop(p.date, Pt ? { x: 0.24, y: 0.4 } : {});
    S.vignette(0, 1e9, 0.62);
    S.film().filter(0, 1e9, "saturate(0.86)");
    shot.cam.push(1.07, 0.1, Math.max(1, D - 0.3));
    shot.cam.to({ x: Ww / 2 + (side === "left" ? -30 : 30) }, 0.1, Math.max(1, D - 0.3), "inOutSine");
  };

  // ------------------------- render, fallback, inspect -------------------------
  function render(id, root, props) {
    if (!TPL[id]) throw new Error("Unknown template: " + id);
    TPL[id](root, obj(props));
  }
  function fallback(root, narration) {
    try {
      if (film && film.el && film.el.parentNode) film.el.parentNode.removeChild(film.el);
      film = null;
      var s = makeShot("plain", 0, 1e9, { nation: "neutral" }), Pt = V.isPortrait;
      var f = s.frame("medium", Pt ? "center" : "left");
      var a = s.character({ role: "historian", nation: "neutral" }, { x: f.x, y: f.y, scale: f.scale, facing: Pt ? 0 : 0.5, expression: "smile", gesture: "present" });
      narrate(a, 0.05, D);
      liven(a, 0.4, endLimit());
      var words = contentWords(narration || V.narration).slice(0, 4).join(" ") || "Meanwhile";
      S.thumb(words, 0.35, { x: Pt ? 0.5 : 0.66, y: Pt ? 0.24 : 0.38, size: "lg" });
      s.cam.push(1.05, 0.2, Math.max(1, D - 1));
      if (S.flush) S.flush();
    } catch (e) { err("fallback", e); }
  }
  function inspect(t) {
    var F = film;
    if (!F) return [];
    if (!F.fin) finalizeFilm(F);
    var out = [];
    F.boxes.forEach(function (fn) { try { out = out.concat(fn(t) || []); } catch (e) { err("inspect", e); } });
    F.shots.forEach(function (sh) {
      if (!(t >= sh.from && t < sh.until)) return;
      var entering = ENTER[sh.enter] && t < sh.from + ENTER[sh.enter];
      sh.views.forEach(function (v) {
        var c = camAt(v, t), mv = c.moving || entering;
        v.actors.forEach(function (a) {
          if (a.vis.val(t) < 0.5 || a.noInspect) return;
          var b = actorBox(a, t), p0 = toScr(v, c, b.x, b.y), p1 = toScr(v, c, b.x + b.w, b.y + b.h);
          var moving = mv || a.pos.moving(t) || a.walks.some(function (w) { return t >= w.t0 && t <= w.t1 + 0.1; }) || !!a.posFn;
          out.push({ kind: "character", label: a.name, x: p0[0], y: p0[1], w: p1[0] - p0[0], h: p1[1] - p0[1], moving: moving });
        });
        (v.maps || []).forEach(function (MV) {
          MV.boxes.forEach(function (bx) {
            if (t < bx.at) return;
            var wx = MV.box.x + (bx.mx - MV.win.x0) * MV.sc, wy = MV.box.y + (bx.my - MV.win.y0) * MV.sc;
            var z0 = MV.toWorld(wx, wy, t), z1 = MV.toWorld(wx + bx.mw * MV.sc, wy + bx.mh * MV.sc, t);
            if (z1[0] < MV.box.x || z0[0] > MV.box.x + MV.box.w || z1[1] < MV.box.y || z0[1] > MV.box.y + MV.box.h) return; // zoomed out of the map frame
            var p0 = toScr(v, c, z0[0], z0[1]), p1 = toScr(v, c, z1[0], z1[1]);
            out.push({ kind: bx.kind, label: bx.label, x: p0[0], y: p0[1], w: p1[0] - p0[0], h: p1[1] - p0[1], moving: mv || t < bx.at + 0.35 || MV.zoomAt(t).moving });
          });
        });
        v.boxes.forEach(function (bx) {
          if (t < bx.at || t >= (bx.until == null ? 1e9 : bx.until)) return;
          var p0 = toScr(v, c, bx.x, bx.y), p1 = toScr(v, c, bx.x + bx.w, bx.y + bx.h);
          out.push({ kind: bx.kind, label: bx.label, x: p0[0], y: p0[1], w: p1[0] - p0[0], h: p1[1] - p0[1], moving: mv || t < bx.at + 0.3 });
        });
      });
    });
    return out;
  }

  // ------------------------- public API -------------------------
  S.film = function () { return film_().api; };
  S.shot = makeShot;
  S.scene = function (location, opts) { return makeShot(location, 0, 1e9, opts); };
  S.currentShot = function () { var F = film; return F && F.shots.length ? F.shots[F.shots.length - 1].main : null; };
  S.narrate = narrate;
  S.liven = liven;
  S.cast = ROLES.slice();
  S.roles = ROLES.slice();
  S.nations = Object.keys(NATIONS);
  S.safe = safe;
  S.u = u;
  S.find = kwFind;
  S.lines = function (lines, after) { return findLines(arr(lines).map(str), after); };
  S.syncTimes = function (keys, o) { return syncTimes(keys, o); };
  S.ease = CE;
  S.templates = Object.keys(TPL);
  S.render = render;
  S.fallback = fallback;
  S.inspect = inspect;
  S.flush = function () { if (film) { finalizeFilm(film); filmFrame(film, V.time()); } };
})();

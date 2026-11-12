/* Stick Figure Folk engine (style id: stick-figure-folk).
 *
 * Architecture
 * - Build time: S.paper(root) makes one div (.sf) holding the paper (CSS colour plus an optional
 *   screen-space grid or ruled lines), and one world SVG. Inside it a camera group holds the
 *   layers back, mid, figs, front and fx (world pixels); a hud group after it is fixed to the
 *   screen. Every drawing call builds its SVG once: pen strokes (paths with three "boil"
 *   variants), solid fills and hatch fills, all inside a "piece" (a <g> that can move, follow a
 *   hand or fade out). Figures are one jointed rig each, rebuilt from a pose blend every frame.
 * - Timing: each drawing call schedules its strokes in a window (explicit `at`, or the
 *   auto-cursor right after the previous drawing). Templates first find their spoken words
 *   (keyword props, V.find, the longest content word, a narration estimate), then plan the beats
 *   so something is visible by 0.3 s and everything is finished about 1 s before the end.
 * - One frame function (V.onFrame) sets everything from t only: the camera, each stroke
 *   (hidden, drawing on with a dash, or finished and boiling between its variants six times a
 *   second), each piece, each figure (pose blend, walk, jump, fall, talk, blink, breathing) and
 *   the marks by their heads. Nothing depends on the previous frame, so seeking works both ways.
 * - Layout, timing and drawing are separate: templates measure text (measureBlock) and lay out
 *   boxes first, then plan times, then call the drawing functions.
 * No network, no timers, no wall clock; randomness only from V.makeRand.
 */
(function () {
  "use strict";
  var V = window.V;
  if (!V) return;
  var S = (window.SceneStyle = window.SceneStyle || {});
  var NS = "http://www.w3.org/2000/svg";
  var doc = document;
  var W = V.width, H = V.height, D = V.duration, P = V.isPortrait, SQ = V.isSquare;
  var PI = Math.PI;
  var COL = { ink: "#161616", accent: "#E4572E", muted: "#8A8A8A", paper: "#FBFBF7" };

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
  function smooth(p) { return p * p * (3 - 2 * p); }
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
  function normWord(s) {
    return String(s == null ? "" : s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
  }
  function hash(n) { var x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function EZ(e) { if (typeof e === "function") return e; return (e && V.ease[e]) || V.ease.inOutCubic; }
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
  // Keyframe track: a base value, then segments {at, d, v, e}; the value at t chains every
  // segment that has started. A pure function of t.
  function Tr(base) { this.base = base; this.k = []; this.sorted = true; }
  Tr.prototype.to = function (v, at, dur, ease) {
    this.k.push({ at: num(at, 0), d: Math.max(0, num(dur, 0)), v: v, e: EZ(ease), i: this.k.length });
    this.sorted = false;
    return this;
  };
  Tr.prototype.set = function (v, at) { return this.to(v, at, 0); };
  Tr.prototype.val = function (t) {
    if (!this.sorted) { this.k.sort(function (a, b) { return a.at - b.at || a.i - b.i; }); this.sorted = true; }
    var v = this.base, k = this.k;
    for (var i = 0; i < k.length; i++) {
      var q = k[i];
      if (t < q.at) break;
      var p = q.d > 0 ? Math.min(1, (t - q.at) / q.d) : 1;
      v = mix(v, q.v, q.e(p));
    }
    return v;
  };
  Tr.prototype.moving = function (t) {
    for (var i = 0; i < this.k.length; i++) { var q = this.k[i]; if (q.d > 0.05 && t > q.at && t < q.at + q.d) return true; }
    return false;
  };
  Tr.prototype.last = function () { var m = 0; this.k.forEach(function (q) { m = Math.max(m, q.at + q.d); }); return m; };
  function setA(el, k, v) { v = String(v); if (el["_a" + k] !== v) { el["_a" + k] = v; el.setAttribute(k, v); } }
  function setS(el, k, v) { v = String(v); if (el["_s" + k] !== v) { el["_s" + k] = v; el.style[k] = v; } }
  function showEl(el, on) { setS(el, "display", on ? "" : "none"); }
  function colorOf(c, def) {
    if (c == null || c === "") return def || COL.ink;
    var k = String(c).toLowerCase();
    if (k === "ink" || k === "black") return COL.ink;
    if (k === "accent" || k === "red" || k === "orange") return COL.accent;
    if (k === "muted" || k === "grey" || k === "gray") return COL.muted;
    if (k === "paper" || k === "white") return COL.paper;
    if (/^(#[0-9a-f]{3,8}|rgba?\(|hsla?\()/i.test(String(c))) return String(c);
    return def || COL.ink;
  }

  // ------------------------- word timing -------------------------
  var STOP = {};
  "a an the and or but of to in on at by for with from into onto over under is are was were be been being it its this that these those your you we our us my me i his her their they them he she as than then so not no yes do does did have has had will would can could should very just more most less each every all any some about here there what when who how why which also too up out if dont don't never really still".split(" ").forEach(function (w) { STOP[normWord(w)] = 1; });
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
  function starWord(text) { var m = /\*([^*]+)\*/.exec(str(text)); return m ? m[1].trim() : ""; }
  // Time for a label: explicit keyword, then the starred word, then its longest content word.
  function labelTime(label, keyword, after) {
    var t;
    if (keyword) { t = kwFind(keyword, after); if (t != null) return t; }
    var sw = starWord(label);
    if (sw) { t = V.find(sw.split(/\s+/)[0], after || 0); if (t != null) return t; }
    var ws = contentWords(label).sort(function (a, b) { return b.length - a.length; });
    for (var i = 0; i < ws.length; i++) { var f = V.find(ws[i], after || 0); if (f != null) return f; }
    if (sw) { t = narrationEstimate(sw, after); if (t != null) return t; }
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
    out = spread(out, o.start, o.end);
    for (var i = 1; i < out.length; i++) if (out[i] < out[i - 1]) out[i] = out[i - 1];
    return out.map(function (t) { return Math.max(0, t - (o.lead || 0)); });
  }
  // Latest time a beat may land so it is finished about 1 s before the end.
  function lastBeat() { return Math.max(0.3, D - (D < 4 ? D * 0.25 : 1.05)); }
  function beat(t, min) { return clamp(t, min == null ? 0.2 : min, lastBeat()); }
  // Order beats: each at least `gap` after the previous, all inside the scene; compress if needed.
  function orderBeats(ts, gap, lim) {
    gap = gap == null ? 0.35 : gap;
    lim = lim == null ? lastBeat() : lim;
    var out = ts.map(function (t) { return clamp(t, 0.2, lim); });
    for (var i = 1; i < out.length; i++) if (out[i] < out[i - 1] + gap) out[i] = out[i - 1] + gap;
    if (out.length && out[out.length - 1] > lim) {
      var L = lim;
      for (i = out.length - 1; i >= 0; i--) { if (out[i] > L) out[i] = L; L = out[i] - gap; }
      if (out[0] < 0.2) { var a = out[0], span = out[out.length - 1] - a || 1, k = (lim - 0.2) / span; out = out.map(function (t) { return 0.2 + (t - a) * k; }); }
    }
    return out;
  }
  function syncAt(word, after, fallback, lead) {
    var t = kwFind(word, after || 0);
    if (t == null) t = fallback != null ? fallback : (after || 0) + 0.6;
    return Math.max(0, t - (lead || 0));
  }
  // Speech windows for lines that appear in the narration: [{start, end}], spread when missing.
  function lineWindows(lines) {
    var out = [], prev = 0, words = V.words || [];
    arr(lines).forEach(function (text) {
      var toks = str(typeof text === "object" && text ? text.text : text).replace(/\*/g, "").split(/\s+/).map(normWord).filter(Boolean);
      var s = null, e = null, idx = -1;
      for (var i = 0; i < toks.length && idx < 0; i++) {
        var j = V.wordIndex(toks.slice(i, i + 2).join(" "), prev);
        if (j < 0) j = V.wordIndex(toks[i], prev);
        if (j >= 0 && words[j]) { idx = j; s = words[j].start - (i ? Math.min(1.2, i * 0.3) : 0); }
      }
      if (idx >= 0) {
        var lastTok = toks[toks.length - 1], lim = idx + toks.length + 3, endIdx = Math.min(words.length - 1, idx + toks.length - 1);
        for (var q = idx; q < Math.min(words.length, lim); q++) if (normWord(words[q].word) === lastTok) { endIdx = q; break; }
        e = words[endIdx].end;
        prev = e + 0.01;
      }
      out.push(s == null ? null : { start: s, end: Math.max(e, s + 0.3) });
    });
    // fill gaps evenly
    var n = out.length, known = out.map(function (w) { return w ? w.start : null; });
    var filled = spread(known, Math.min(0.5, D * 0.08), D * 0.75);
    for (var i2 = 0; i2 < n; i2++) {
      if (!out[i2]) {
        var nextS = i2 + 1 < n && out[i2 + 1] ? out[i2 + 1].start : filled[i2 + 1] != null ? filled[i2 + 1] : D - 1;
        out[i2] = { start: filled[i2], end: Math.max(filled[i2] + 0.6, Math.min(nextS - 0.1, filled[i2] + 2.2)) };
      }
    }
    return out;
  }
  // Plan a sequence of drawings: each {land, dur, lead, min, stretch}. Sets .start/.dur/.end.
  function plan(items, o) {
    o = o || {};
    var gap = o.gap != null ? o.gap : 0.1, startMin = o.start != null ? o.start : 0.2;
    var hold = D < 5 ? Math.min(0.9, D * 0.16) : 1.0;
    var endLimit = Math.max(startMin + 0.6, o.end != null ? o.end : D - hold);
    var n = items.length;
    if (!n) return items;
    items.forEach(function (it) { it.dur = Math.max(0.08, it.dur || 0.5); it.lead = it.lead == null ? 0.5 : it.lead; it.min = Math.min(it.dur, it.min || 0.25); });
    var budget = endLimit - startMin - gap * (n - 1), tot = 0;
    items.forEach(function (it) { tot += it.dur; });
    if (tot > budget && tot > 0) {
      var f = budget / tot, tot2 = 0;
      items.forEach(function (it) { it.dur = Math.max(it.dur * f, it.min); tot2 += it.dur; });
      if (tot2 > budget) items.forEach(function (it) { it.dur *= budget / tot2; });
    }
    var last = -1;
    items.forEach(function (it) {
      if (it.land != null && isFinite(it.land)) { it.land = clamp(it.land, 0, endLimit); if (it.land < last) it.land = last; last = it.land; }
      else it.land = null;
    });
    var prevEnd = 0;
    items.forEach(function (it, i) {
      var want = it.land != null ? it.land - it.lead * it.dur : -1;
      var s0 = i ? Math.max(want, prevEnd + gap) : Math.max(want, startMin);
      if (i === 0 && s0 > startMin + 0.15 && !o.noStretch) {
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

  // ------------------------- safe area -------------------------
  function safe() {
    var x0, y0, x1, y1;
    if (P) { x0 = W * 0.0556 + 4; x1 = W - x0; y0 = H * 0.1302 + 4; y1 = H * 0.7552 - 4; }
    else if (SQ) { x0 = W * 0.07 + 4; x1 = W - x0; y0 = H * 0.07 + 4; y1 = H - y0; }
    else { x0 = W * 0.07 + 4; x1 = W - x0; y0 = H * 0.0704 + 4; y1 = H - y0; }
    return { x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }

  // ------------------------- path geometry and sampling -------------------------
  function circ(cx, cy, r) {
    return "M" + f2(cx) + " " + f2(cy - r) + " A" + r + " " + r + " 0 0 0 " + f2(cx) + " " + f2(cy + r) + " A" + r + " " + r + " 0 0 0 " + f2(cx) + " " + f2(cy - r);
  }
  function ell(cx, cy, rx, ry) {
    return "M" + f2(cx) + " " + f2(cy - ry) + " A" + rx + " " + ry + " 0 0 0 " + f2(cx) + " " + f2(cy + ry) + " A" + rx + " " + ry + " 0 0 0 " + f2(cx) + " " + f2(cy - ry);
  }
  function rell(cx, cy, rx, ry, rot, a0, a1) { // rotated ellipse (or arc a0..a1 degrees) as a polyline
    var r = rad(rot || 0), c = Math.cos(r), s = Math.sin(r), out = "";
    a0 = a0 == null ? 0 : a0; a1 = a1 == null ? 360 : a1;
    var n = Math.max(8, Math.ceil(Math.abs(a1 - a0) / 7.5));
    for (var i = 0; i <= n; i++) {
      var a = rad(a0 + ((a1 - a0) * i) / n), x = Math.cos(a) * rx, y = Math.sin(a) * ry;
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
  function pt(cx, cy, r, d) { var a = rad(d); return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; }
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
  function starP(cx, cy, R, r, n, rot) {
    var p = [];
    for (var i = 0; i < n * 2; i++) p.push(pt(cx, cy, i % 2 ? r : R, rot + (i * 180) / n));
    return poly(p, true);
  }
  function gearP(cx, cy, r, teeth, depth) {
    var p = [], step = 360 / teeth;
    for (var k = 0; k < teeth; k++) {
      var a = k * step;
      p.push(pt(cx, cy, r - depth, a - step * 0.5), pt(cx, cy, r - depth, a - step * 0.27), pt(cx, cy, r, a - step * 0.17), pt(cx, cy, r, a + step * 0.17), pt(cx, cy, r - depth, a + step * 0.27));
    }
    return poly(p, true);
  }
  // Smooth curve (Catmull-Rom) through [[x, y], ...].
  function smoothD(pts, closed) {
    var n = pts.length;
    if (n < 3) return poly(pts, closed);
    var d = "M" + f2(pts[0][0]) + " " + f2(pts[0][1]);
    for (var i = 0; i < (closed ? n : n - 1); i++) {
      var p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      if (!closed) { if (i === 0) p0 = p1; if (i + 2 >= n) p3 = p2; }
      d += " C" + f2(p1[0] + (p2[0] - p0[0]) / 6) + " " + f2(p1[1] + (p2[1] - p0[1]) / 6) + " " + f2(p2[0] - (p3[0] - p1[0]) / 6) + " " + f2(p2[1] - (p3[1] - p1[1]) / 6) + " " + f2(p2[0]) + " " + f2(p2[1]);
    }
    return d + (closed ? " Z" : "");
  }
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
  // Flat points [x0,y0,x1,y1,...] along one subpath, about `step` apart.
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
    var n = clamp(Math.ceil(len / step), 2, 900), out = [];
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
    var n = pts.length / 2, cum = new Float64Array(Math.max(1, n)), L = 0;
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
  function flat(list) { var o = []; list.forEach(function (p) { o.push(p[0], p[1]); }); return o; }
  // matrix [a,b,c,d,e,f]: x' = a x + c y + e, y' = b x + d y + f
  function mat(tx, ty, sc, rotDeg, flip, ox, oy) {
    var r = rad(rotDeg || 0), co = Math.cos(r) * sc, si = Math.sin(r) * sc, fx = flip ? -1 : 1;
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
  // Pen wobble: a smooth sideways offset along the stroke; `ws` scales the wavelengths.
  function wobble(pts, amp, rnd, ws) {
    if (!amp || pts.length < 6) return pts;
    ws = ws || 1;
    var cum = cumOf(pts), out = pts.slice(), n = pts.length / 2;
    var ph1 = rnd() * 6.283, ph2 = rnd() * 6.283, k1 = 6.283 / (u(170) * ws), k2 = 6.283 / (u(52) * ws);
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
  function unionBox(list) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    list.forEach(function (b) { if (!b) return; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); });
    if (!isFinite(x0)) return { x: 0, y: 0, w: 0, h: 0 };
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  // ------------------------- scene state, paper -------------------------
  var st = null;
  function paper(root, o) {
    o = obj(o);
    root = root || V.root();
    while (root.firstChild) root.removeChild(root.firstChild);
    var kind = o.paper === "grid" || o.paper === "lined" ? o.paper : "plain";
    var el = div("sf sf-" + kind, root);
    var bg = svg("svg", { class: "sf-bg", width: W, height: H, viewBox: "0 0 " + W + " " + H }, el);
    var world = svg("svg", { class: "sf-world", width: W, height: H, viewBox: "0 0 " + W + " " + H }, el);
    var defs = svg("defs", {}, world);
    var cam = svg("g", { class: "sf-cam" }, world);
    var L = {};
    ["back", "mid", "figs", "front", "fx"].forEach(function (k) { L[k] = svg("g", { class: "sf-l-" + k }, cam); });
    L.hud = svg("g", { class: "sf-hud" }, world);
    st = {
      root: root, el: el, bg: bg, world: world, defs: defs, cam: cam, L: L,
      strokes: [], pieces: [], anims: [], items: [], figs: [], cursor: 0.15, any: false, uid: 0,
      rnd: V.makeRand(((V.seed || 1) * 2654435761) >>> 0 || 7),
      camTr: new Tr({ cx: W / 2, cy: H / 2, z: 1 }), drift: o.drift != null ? num(o.drift, 0.02) : 0.02,
      boil: o.boil === false ? 0 : 1, warned: false, dirty: true,
    };
    drawPaper(kind);
    var me = st;
    V.onFrame(function (t) { if (st === me) frame(t); });
    return { el: el, svg: world, layers: L, safe: safe(), defs: defs };
  }
  function ensure() { if (!st) paper(V.root(), {}); return st; }
  function uid(p) { return "sf" + (p || "") + ++st.uid; }
  function layerOf(name, def) { var s = ensure(); return s.L[name] || s.L[def || "mid"]; }
  function drawPaper(kind) {
    var g = st.bg, sp, i;
    if (kind === "grid") {
      sp = u(54);
      for (i = sp / 2; i < W; i += sp) svg("line", { x1: f1(i), y1: 0, x2: f1(i), y2: H, class: "sf-rule" }, g);
      for (i = sp / 2; i < H; i += sp) svg("line", { x1: 0, y1: f1(i), x2: W, y2: f1(i), class: "sf-rule" }, g);
    } else if (kind === "lined") {
      sp = u(66);
      for (i = sp * 1.5; i < H; i += sp) svg("line", { x1: 0, y1: f1(i), x2: W, y2: f1(i), class: "sf-rule" }, g);
    }
  }

  // ------------------------- strokes and scheduling -------------------------
  var BOIL_FPS = 6, NV = 3, GAP = 0.1;
  function penW(mult) { return u(4.3) * (mult || 1); }
  function mkStroke(pts, o) {
    var s = ensure();
    o = o || {};
    var amp = o.boil != null ? o.boil : u(0.8) * (o.ws || 1);
    var vars = [dOf(pts)];
    if (amp > 0 && s.boil) for (var i = 1; i < NV; i++) vars.push(dOf(wobble(pts, amp, s.rnd, o.ws || 1)));
    var el = svg("path", { d: vars[0], fill: "none", stroke: o.color || COL.ink, "stroke-width": f2(o.width || penW()), "stroke-linecap": "round", "stroke-linejoin": "round" }, o.parent || s.L.mid);
    if (o.attrs) for (var k in o.attrs) el.setAttribute(k, o.attrs[k]);
    el.style.display = "none";
    var cum = cumOf(pts);
    return { el: el, vars: vars, pts: pts, len: Math.max(0.01, cum[cum.length - 1] || 0), w: Math.max(0.01, cum[cum.length - 1] || 0), state: -1, vi: 0, kind: "stroke" };
  }
  function mkSolid(d, color, parent, attrs) {
    var el = svg("path", { d: d, fill: color, stroke: "none" }, parent);
    if (attrs) for (var k in attrs) el.setAttribute(k, attrs[k]);
    el.style.display = "none";
    return { el: el, w: 0.001, state: -1, kind: "solid" };
  }
  // Zig-zag hatching inside a closed local path d (local -> world matrix m).
  function hatchPts(bb, sp, angDeg, rnd) {
    var a = rad(angDeg), ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
    var pad = sp * 0.4, x0 = bb.x - pad, y0 = bb.y - pad, x1 = bb.x + bb.w + pad, y1 = bb.y + bb.h + pad;
    var cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    var vmin = Infinity, vmax = -Infinity;
    corners.forEach(function (c) { var v = (c[0] - cx) * nx + (c[1] - cy) * ny; vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); });
    var out = [], k = 0;
    for (var v = vmin + sp * 0.5; v <= vmax; v += sp, k++) {
      var px = cx + nx * v, py = cy + ny * v, lo = -1e9, hi = 1e9;
      [[ux, x0 - px, x1 - px], [uy, y0 - py, y1 - py]].forEach(function (q) {
        if (Math.abs(q[0]) < 1e-9) { if (q[1] > 0 || q[2] < 0) { lo = 1; hi = 0; } return; }
        var s0 = q[1] / q[0], s1 = q[2] / q[0];
        if (s0 > s1) { var tmp = s0; s0 = s1; s1 = tmp; }
        lo = Math.max(lo, s0); hi = Math.min(hi, s1);
      });
      if (hi <= lo) continue;
      var j0 = (rnd() - 0.5) * sp * 0.5, j1 = (rnd() - 0.5) * sp * 0.5;
      var A = [px + ux * (lo + j0), py + uy * (lo + j0)], B = [px + ux * (hi + j1), py + uy * (hi + j1)];
      if (k % 2) out.push(B[0], B[1], A[0], A[1]);
      else out.push(A[0], A[1], B[0], B[1]);
    }
    if (out.length < 4) out = [bb.x, bb.y, bb.x + bb.w, bb.y + bb.h];
    return out;
  }
  function mkHatch(d, m, scale, color, spacing, parent, rule, width) {
    var s = ensure();
    var id = uid("clip");
    var cp = svg("clipPath", { id: id, clipPathUnits: "userSpaceOnUse" }, s.defs);
    svg("path", { d: d, "clip-rule": rule || "nonzero", transform: "matrix(" + m.map(function (v) { return +v.toFixed(5); }).join(" ") + ")" }, cp);
    var bb = bboxOfD(d);
    var local = hatchPts(bb, spacing / scale, -38 + (s.rnd() - 0.5) * 10, s.rnd);
    var pts = applyM(m, local);
    var g = mkStroke(pts, { color: color, width: width || spacing * 0.34, parent: parent, boil: 0, attrs: { "clip-path": "url(#" + id + ")" } });
    g.w = Math.max(1, Math.sqrt(bb.w * bb.h) * scale) * 1.2;
    return g;
  }
  // Give segs absolute times. Each seg.w is its share of the duration.
  function schedule(segs, opts, defDur) {
    var s = ensure();
    opts = opts || {};
    var start = opts.at != null && isFinite(+opts.at) ? +opts.at : s.any ? s.cursor + GAP : s.cursor;
    start = Math.max(0, start);
    var dur = opts.dur != null && isFinite(+opts.dur) ? Math.max(0.04, +opts.dur) : defDur;
    if (opts.speed) dur /= Math.max(0.1, +opts.speed);
    var n = segs.length, lift = n > 1 ? Math.min(0.045, (dur * 0.16) / (n - 1)) : 0, sumW = 0;
    segs.forEach(function (g) { sumW += g.w; });
    var draw = Math.max(0.01, dur - lift * (n - 1)), t = start;
    segs.forEach(function (g, i) {
      var d = sumW > 0 ? (draw * g.w) / sumW : draw / n;
      g.t0 = t;
      g.t1 = t + Math.max(0.004, d);
      t = g.t1 + (i < n - 1 ? lift : 0);
      s.strokes.push(g);
    });
    var end = n ? segs[n - 1].t1 : start;
    s.cursor = end;
    s.any = true;
    s.dirty = true;
    return { t0: start, t1: end };
  }
  function updStroke(g, t, bi) {
    if (t < g.t0) { if (g.state !== 0) { g.state = 0; g.el.style.display = "none"; } return; }
    if (g.kind === "solid") { if (g.state !== 2) { g.state = 2; g.el.style.display = ""; } return; }
    if (g.kind === "custom") {
      var pc0 = t < g.t1 ? 1 : 2;
      if (g.state === 0 || g.state === -1) g.el.style.display = "";
      g.state = pc0;
      g.update(pc0, pc0 === 1 ? clamp((t - g.t0) / (g.t1 - g.t0 || 1), 0, 1) : 1);
      return;
    }
    if (t < g.t1) {
      if (g.state !== 1) { g.state = 1; g.el.style.display = ""; }
      if (g.vi !== 0) { g.vi = 0; g.el.setAttribute("d", g.vars[0]); }
      var p = clamp((t - g.t0) / (g.t1 - g.t0 || 1), 0, 1), e = 0.7 * p + 0.3 * smooth(p);
      g.el.style.strokeDasharray = Math.max(0.01, e * g.len).toFixed(2) + " " + (g.len + 50).toFixed(1);
      return;
    }
    if (g.state !== 2) { g.state = 2; g.el.style.display = ""; g.el.style.strokeDasharray = "none"; }
    var vi = g.vars.length > 1 ? bi % g.vars.length : 0;
    if (vi !== g.vi) { g.vi = vi; g.el.setAttribute("d", g.vars[vi]); }
  }

  // ------------------------- pieces (movable groups) and items -------------------------
  function newPiece(parent, cls) {
    var s = ensure();
    var g = svg("g", { class: "sf-piece" + (cls ? " " + cls : "") }, parent || s.L.mid);
    var pc = { g: g, c0: [0, 0], tr: null, op: null, follows: [], hud: parent === s.L.hud };
    pc.to = function (v, at, dur, ease) {
      v = obj(v);
      var q = {};
      ["x", "y", "s", "rot"].forEach(function (k) { if (v[k] != null && isFinite(+v[k])) q[k] = +v[k]; });
      if (!pc.tr) { pc.tr = new Tr({ x: pc.c0[0], y: pc.c0[1], s: 1, rot: 0 }); track(pc); }
      pc.tr.to(q, num(at, s.cursor), num(dur, 0.6), ease || "inOutCubic");
      return pc;
    };
    pc.fade = function (v, at, dur) {
      if (!pc.op) { pc.op = new Tr(1); track(pc); }
      pc.op.to(clamp(num(v, 0), 0, 1), num(at, s.cursor), Math.max(0, num(dur, 0.3)), "linear");
      return pc;
    };
    pc.follow = function (fn, at) { pc.follows.push({ at: num(at, 0), fn: fn }); pc.follows.sort(function (a, b) { return a.at - b.at; }); track(pc); return pc; };
    return pc;
  }
  function track(pc) { if (!pc._tracked) { pc._tracked = true; ensure().pieces.push(pc); } }
  function pieceState(pc, t) {
    var v = pc.tr ? pc.tr.val(t) : { x: pc.c0[0], y: pc.c0[1], s: 1, rot: 0 };
    var f = null;
    pc.follows.forEach(function (q) { if (t >= q.at) f = q; });
    if (f) { var p = f.fn(t); v = { x: p[0], y: p[1], s: v.s, rot: p[2] != null ? p[2] : v.rot }; }
    return { x: v.x, y: v.y, s: v.s, rot: v.rot, op: pc.op ? pc.op.val(t) : 1 };
  }
  function updPiece(pc, t) {
    var v = pieceState(pc, t);
    setA(pc.g, "transform", "translate(" + f2(v.x) + " " + f2(v.y) + ") rotate(" + f2(v.rot) + ") scale(" + (+v.s).toFixed(4) + ") translate(" + f2(-pc.c0[0]) + " " + f2(-pc.c0[1]) + ")");
    if (pc.op) { var o = clamp(v.op, 0, 1); setS(pc.g, "opacity", o.toFixed(3)); showEl(pc.g, o > 0.004); }
  }
  function mkItem(kind, label, box, times, pc, noInspect) {
    var it = { x: box.x, y: box.y, w: box.w, h: box.h, cx: box.x + box.w / 2, cy: box.y + box.h / 2, t0: times.t0, t1: times.t1, end: times.t1, piece: pc, kind: kind };
    if (pc) pc.c0 = [it.cx, it.cy];
    if (!noInspect) ensure().items.push({ kind: kind, label: label, it: it, hud: !!(pc && pc.hud) });
    return it;
  }
  function itemBox(it, t) {
    var pc = it.piece;
    if (!pc || !pc._tracked) return { x: it.x, y: it.y, w: it.w, h: it.h, op: 1, moving: false };
    var v = pieceState(pc, t);
    return { x: v.x - (it.w * v.s) / 2, y: v.y - (it.h * v.s) / 2, w: it.w * v.s, h: it.h * v.s, op: v.op, moving: !!((pc.tr && pc.tr.moving(t)) || pc.follows.some(function (q) { return t >= q.at; })) };
  }
  function rectOf(t, at) {
    if (!t) return { x: W / 2, y: H / 2, w: 0, h: 0 };
    if (typeof t.box === "function") { var b = t.box(at == null ? (st ? st.cursor : 0) : at); return { x: b.x, y: b.y, w: b.w, h: b.h }; }
    if (t.piece && t.piece._tracked && t.w != null) { var ib = itemBox(t, at == null ? (st ? st.cursor : D) : at); return { x: ib.x, y: ib.y, w: ib.w, h: ib.h }; }
    if (Array.isArray(t)) return { x: +t[0], y: +t[1], w: 0, h: 0 };
    if (t.w != null) return { x: +t.x, y: +t.y, w: +t.w, h: +t.h };
    return { x: +t.x, y: +t.y, w: 0, h: 0 };
  }

  // ------------------------- camera -------------------------
  function camAt(t) {
    var c = st.camTr.val(t);
    var z = c.z * (1 + st.drift * V.ease.inOutSine(clamp(t / D, 0, 1)));
    return { cx: c.cx, cy: c.cy, z: z };
  }
  function proj(x, y, c) { return [(x - c.cx) * c.z + W / 2, (y - c.cy) * c.z + H / 2]; }
  function cleanCam(c) { c = obj(c); var o = {}; if (c.cx != null) o.cx = num(c.cx, W / 2); if (c.cy != null) o.cy = num(c.cy, H / 2); if (c.z != null) o.z = clamp(num(c.z, 1), 0.0002, 12); return o; }
  function cameraTo(c, at, dur, ease) { var s = ensure(); s.camTr.to(cleanCam(c), num(at, s.cursor), Math.max(0, num(dur, 1.2)), ease || "inOutCubic"); }
  // Camera that shows world rect r inside the safe area (margin = share of the rect).
  function camFor(r, margin) {
    var sa = safe(), m = margin == null ? 0.08 : num(margin, 0.08);
    var z = Math.min(sa.w / Math.max(1e-6, r.w * (1 + 2 * m)), sa.h / Math.max(1e-6, r.h * (1 + 2 * m)));
    z = clamp(z, 0.0002, 12);
    return { cx: r.x + r.w / 2 - (sa.cx - W / 2) / z, cy: r.y + r.h / 2 - (sa.cy - H / 2) / z, z: z };
  }
  function frameRect(r, at, dur, ease, margin) { cameraTo(camFor(rectOf(r), margin), at, dur, ease); }

  // ------------------------- the frame -------------------------
  function finalize() {
    var s = st;
    s.dirty = false;
    var last = 0;
    s.strokes.forEach(function (g) { last = Math.max(last, g.t1 || 0); });
    if (last > D + 0.05 && !s.warned) {
      s.warned = true;
      V.error("[stick-figure-folk] drawing runs past the end of the scene (" + last.toFixed(2) + " s > " + D.toFixed(2) + " s); give it less to draw or earlier times");
    }
  }
  function frame(t) {
    var s = st;
    if (s.dirty) finalize();
    var c = camAt(t);
    setA(s.cam, "transform", "translate(" + f2(W / 2) + " " + f2(H / 2) + ") scale(" + c.z.toFixed(6) + ") translate(" + f2(-c.cx) + " " + f2(-c.cy) + ")");
    var bi = s.boil ? Math.floor(t * BOIL_FPS + 1e-6) : 0;
    for (var i = 0; i < s.strokes.length; i++) updStroke(s.strokes[i], t, bi);
    for (i = 0; i < s.pieces.length; i++) updPiece(s.pieces[i], t);
    for (i = 0; i < s.anims.length; i++) {
      try { s.anims[i](t, c); } catch (e) { V.error("[stick-figure-folk] " + (e && e.message ? e.message : e)); }
    }
  }

  // ------------------------- doodle library (100 x 100 box) -------------------------
  // Each doodle: strokes (string = ink line; {d, a: accent part, w: weight, solid: "ink" | "paper" |
  // "accent", c: "paper" | "muted"}) and `hi`, closed paths hatched in the accent with accent: true.
  var DL = {};
  function dd(name, s, hi) { DL[name] = { s: s, hi: hi || [] }; }
  function A(d, w) { return { d: d, a: 1, w: w || 1 }; }
  var BULB = "M37 70 L37 62 C22 53 18 31 30 18 C40 8 60 8 70 18 C82 31 78 53 63 62 L63 70";
  dd("lightbulb", [BULB, "M36 72 L64 72", "M37 79 L63 79", "M41 86 L59 86", "M46 92 L54 92", "M44 62 L44 48 L50 42 L56 48 L56 62",
    A("M13 31 L5 28"), A("M87 31 L95 28"), A("M21 11 L15 5"), A("M79 11 L85 5")], [BULB + " Z"]);
  dd("question", [A("M30 30 C30 6 72 6 72 30 C72 48 50 46 50 64 L50 68", 1.5), A("M50 84 L50 85.5", 2.2)]);
  dd("exclamation", [A("M50 8 L50 64", 1.6), A("M50 82 L50 83.5", 2.3)]);
  dd("coin", [circ(50, 50, 38), circ(50, 50, 29), A("M58 38 C55 32 42 32 42 40 C42 48 58 46 58 56 C58 64 44 66 41 59"), A("M50 27 L50 73")], [circ(50, 50, 38)]);
  dd("money", ["M16 22 L92 22 L92 64", rr(8, 30, 78, 48, 3), circ(47, 54, 13), A("M52 47 C50 43 43 43 43 49 C43 54 52 53 52 59 C52 64 45 65 42 61"), A("M47 41 L47 67"), "M14 38 L20 38", "M74 70 L80 70"], [rr(8, 30, 78, 48, 3)]);
  dd("clock", [circ(50, 52, 38), A("M50 52 L50 28", 1.2), A("M50 52 L66 61", 1.2), "M50 17 L50 22 M85 52 L80 52 M50 87 L50 82 M15 52 L20 52", "M24 16 L15 9 M76 16 L85 9"], [circ(50, 52, 38)]);
  var CONT1 = "M30 26 C38 22 46 28 42 36 C38 44 28 42 26 36 C24 31 26 28 30 26 Z", CONT2 = "M56 52 C66 48 78 56 72 68 C66 78 54 72 56 52 Z", CONT3 = "M64 20 C72 18 80 26 74 32 C70 36 62 30 64 20 Z";
  dd("globe", [circ(50, 50, 38), CONT1, CONT2, CONT3, "M18 60 C26 66 34 66 40 62"], [CONT1, CONT2, CONT3]);
  (function () {
    var s = [circ(50, 50, 20)];
    for (var k = 0; k < 8; k++) { var a = pt(50, 50, 28, k * 45), b = pt(50, 50, 42, k * 45); s.push(A(poly([a, b]))); }
    dd("sun", s, [circ(50, 50, 20)]);
  })();
  var MOON = "M60 10 A41 41 0 1 0 91 66 A31 31 0 1 1 60 10 Z";
  dd("moon", [MOON, circ(30, 46, 5), circ(38, 68, 4), circ(50, 84, 2.5)], [MOON]);
  var STAR = starP(50, 53, 44, 19, 5, -90);
  dd("star", [STAR], [STAR]);
  var CLOUD = "M26 72 C12 72 8 56 20 51 C17 37 33 30 42 38 C46 24 66 24 70 38 C84 33 94 47 86 57 C94 65 86 76 76 72 Z";
  dd("cloud", [CLOUD], [CLOUD]);
  var CLOUD2 = "M26 56 C12 56 8 40 20 35 C17 21 33 14 42 22 C46 8 66 8 70 22 C84 17 94 31 86 41 C94 49 86 60 76 56 Z";
  dd("rain", [CLOUD2, A("M32 66 L27 80"), A("M50 66 L45 86"), A("M68 66 L63 80"), A("M41 82 L38 90"), A("M59 82 L56 92")], [CLOUD2]);
  dd("house", ["M12 50 L50 16 L88 50", "M22 44 L22 90 L78 90 L78 44", rr(44, 64, 14, 26, 0), rr(28, 56, 11, 11, 0), rr(62, 56, 11, 11, 0), "M66 33 L66 21 L74 21 L74 40", "M6 90 L94 90"], ["M12 50 L50 16 L88 50 Z"]);
  (function () {
    var s = [rr(30, 10, 40, 82, 0), "M50 10 L50 2", "M8 92 L92 92", rr(45, 78, 10, 14, 0)];
    for (var y = 18; y <= 66; y += 12) s.push("M36 " + y + " L44 " + y + " M56 " + y + " L64 " + y);
    s.push("M14 92 L14 56 L30 56", "M70 64 L86 64 L86 92");
    dd("building", s, [rr(30, 10, 40, 82, 0)]);
  })();
  var CANOPY = "M50 64 C30 70 16 58 22 44 C12 34 22 16 36 20 C40 8 60 8 64 20 C78 16 88 34 78 44 C84 58 70 70 50 64";
  dd("tree", [CANOPY, "M45 64 L44 92 M55 64 L56 92", "M32 92 L68 92", "M50 78 L58 70"], [CANOPY + " Z"]);
  var MTN = "M4 86 L36 28 L50 52 L62 36 L96 86 Z";
  dd("mountain", [MTN, "M27 45 L32 50 L37 44 L42 50 L45 46", A("M58 42 L62 46 L66 42")], [MTN]);
  var ROCKET = "M50 6 C66 20 68 46 62 70 L38 70 C32 46 34 20 50 6", FLAME = "M43 74 C42 84 50 95 50 95 C50 95 58 84 57 74 Z";
  dd("rocket", [ROCKET, circ(50, 36, 7), "M38 54 L24 74 L38 70", "M62 54 L76 74 L62 70", "M38 70 L62 70", A(FLAME)], [FLAME]);
  dd("phone", [rr(30, 8, 40, 84, 7), rr(35, 17, 30, 60, 2), "M46 85 L54 85"], [rr(35, 17, 30, 60, 2)]);
  dd("laptop", [rr(20, 20, 60, 42, 3), rr(25, 25, 50, 32, 1), "M20 62 L8 76 L92 76 L80 62", "M42 70 L58 70"], [rr(25, 25, 50, 32, 1)]);
  var BOOK = "M50 26 C38 18 20 18 10 22 L10 78 C20 74 38 74 50 82 C62 74 80 74 90 78 L90 22 C80 18 62 18 50 26";
  dd("book", [BOOK, "M50 26 L50 82", "M18 34 C26 32 34 32 42 35", "M18 46 C26 44 34 44 42 47", "M18 58 C26 56 34 56 42 59", "M58 35 C66 32 74 32 82 34", "M58 47 C66 44 74 44 82 46"], [BOOK + " Z"]);
  var HEART = "M50 86 C20 64 8 46 14 30 C20 14 42 12 50 30 C58 12 80 14 86 30 C92 46 80 64 50 86";
  dd("heart", [HEART], [HEART + " Z"]);
  dd("atom", [rell(50, 50, 42, 14, 0), rell(50, 50, 42, 14, 60), rell(50, 50, 42, 14, -60), circ(50, 50, 6), A(circ(92, 50, 3)), A(circ(29, 13.6, 3)), A(circ(29, 86.4, 3))], [circ(50, 50, 6)]);
  var GEAR = gearP(50, 50, 38, 9, 9);
  dd("gear", [GEAR, circ(50, 50, 12)], [GEAR]);
  var B1 = rr(22, 64, 12, 24, 0), B2 = rr(44, 52, 12, 36, 0), B3 = rr(66, 36, 12, 52, 0);
  dd("chart", ["M12 8 L12 88 L94 88", B1, B2, B3, A("M18 52 L40 34 L54 42 L82 13", 1.2), A("M70 13 L83 12 L82 25", 1.2)], [B1, B2, B3]);
  var C1 = rr(22, 36, 12, 52, 0), C2 = rr(44, 52, 12, 36, 0), C3 = rr(66, 64, 12, 24, 0);
  dd("chart-down", ["M12 8 L12 88 L94 88", C1, C2, C3, A("M18 16 L40 34 L54 28 L82 58", 1.2), A("M83 45 L83 59 L70 60", 1.2)], [C1, C2, C3]);
  (function () {
    var a = pt(50, 52, 38, -90), b = pt(50, 52, 38, 20), c = pt(50, 52, 38, 140);
    var slice = "M50 52 L" + f2(a[0]) + " " + f2(a[1]) + " A38 38 0 0 1 " + f2(b[0]) + " " + f2(b[1]) + " Z";
    dd("chart-pie", [circ(50, 52, 38), poly([a, [50, 52], b]), poly([[50, 52], c])], [slice]);
  })();
  var ARROW = "M8 40 L58 40 L58 22 L92 50 L58 78 L58 60 L8 60 Z";
  dd("arrow", [ARROW], [ARROW]);
  var FLAG = "M22 12 C36 6 48 18 62 12 C70 9 76 10 82 12 L82 48 C76 46 70 45 62 48 C48 54 36 42 22 48";
  dd("flag", [{ d: "M22 94 L22 6", w: 1.2 }, FLAG, "M12 94 L32 94"], [FLAG + " Z"]);
  var MUG = "M20 36 L72 36 L68 80 C67 86 62 90 56 90 L36 90 C30 90 25 86 24 80 Z";
  dd("coffee", [MUG, "M71 46 C86 44 88 66 69 68", { d: "M36 28 C30 20 42 16 36 6", c: "muted" }, { d: "M52 28 C46 20 58 16 52 6", c: "muted" }, "M12 94 L80 94"], [MUG]);
  var BOXF = "M14 40 L66 40 L66 88 L14 88 Z";
  dd("box", [BOXF, "M14 40 L34 24 L86 24 L66 40", "M86 24 L86 72 L66 88", "M40 40 L60 24", "M28 60 L50 60"], [BOXF]);
  dd("ball", [circ(50, 52, 36), "M22 30 C40 44 40 62 22 76", "M78 28 C60 42 60 62 78 76"], [circ(50, 52, 36)]);
  var CAR = "M8 66 L8 53 C8 49 12 47 18 47 L28 47 L37 32 L66 32 L77 47 L86 49 C90 50 92 53 92 57 L92 66";
  dd("car", [CAR, "M18 66 L36 66 M18 66 L8 66 M36 66 L64 66 M82 66 L92 66", "M40 36 L33 47 L50 47 L50 36 Z", "M54 36 L54 47 L72 47 L64 36 Z", circ(27, 68, 9), circ(73, 68, 9), "M4 80 L96 80"], [CAR + " L8 66 Z"]);
  var ABD = ell(30, 56, 18, 13);
  dd("ant", [ABD, ell(57, 52, 9, 7), circ(78, 46, 8), "M53 57 L44 72 L37 75", "M58 59 L58 76 L54 81", "M63 57 L72 71 L79 73", "M82 39 C85 28 90 25 95 27", "M77 38 C77 28 80 23 85 22", { d: "M80 44 L80 45.5", w: 1.8 }], [ABD]);
  var CATB = "M30 48 C20 62 20 86 30 92 L60 92 C70 86 70 62 52 49";
  dd("cat", [circ(40, 35, 15), "M27 27 L26 10 L36 21", "M44 20 L53 10 L54 27", CATB, "M60 90 C80 90 90 76 84 62 C82 56 76 56 78 62", { d: "M34 33 L34 35", w: 1.6 }, { d: "M46 33 L46 35", w: 1.6 }, "M38 40 L40 42 L42 40", "M31 41 L18 39 M31 43 L18 46 M49 41 L62 39 M49 43 L62 46"], [CATB + " Z"]);
  var FISH = "M12 50 C26 28 62 28 74 50 C62 72 26 72 12 50 Z";
  dd("fish", [FISH, "M72 50 L92 32 L90 68 Z", { d: "M27 46 L27 47.5", w: 2 }, "M40 38 C46 46 46 54 40 62", "M50 34 C54 28 60 28 62 34", A("M8 30 C6 26 8 22 12 22 M14 18 C14 15 17 14 18 16")], [FISH]);
  var WHALE = "M8 58 C8 34 36 26 60 34 C74 38 80 48 84 54 L94 42 L96 70 L84 62 C78 76 56 84 34 80 C18 78 8 70 8 58 Z";
  dd("whale", [WHALE, { d: "M24 52 L24 53.5", w: 2 }, "M10 64 C22 70 36 70 46 66", "M44 74 C46 84 54 86 56 80", A("M30 28 C28 18 22 14 18 16 M30 28 C32 18 38 14 42 16 M30 28 L30 13")], [WHALE]);
  var CELL = "M50 12 C72 10 90 28 88 50 C86 72 70 90 48 88 C26 86 10 72 12 50 C14 28 28 14 50 12 Z", NUC = circ(57, 46, 13);
  dd("cell", [CELL, NUC, { d: "M57 46 L57 47.5", w: 3 }, rell(32, 34, 9, 4, -25), rell(34, 66, 8, 4, 30), circ(70, 70, 3), circ(26, 52, 2.5), circ(46, 76, 2.5)], [NUC]);
  (function () {
    var s = [circ(50, 50, 25)];
    for (var k = 0; k < 9; k++) { var a = pt(50, 50, 25, k * 40 + 10), b = pt(50, 50, 37, k * 40 + 10), c = pt(50, 50, 41, k * 40 + 10); s.push(poly([a, b]), A(circ(c[0], c[1], 4))); }
    s.push(circ(43, 44, 4), circ(58, 56, 3), circ(54, 40, 2));
    dd("virus", s, [circ(50, 50, 25)]);
  })();
  (function () {
    var a1 = [], a2 = [];
    for (var i = 0; i <= 44; i++) {
      var k = i / 44, th = k * 2.7 * PI, r = 5 + 38 * k;
      a1.push([50 + Math.cos(th) * r, 50 + Math.sin(th) * r * 0.6]);
      a2.push([50 + Math.cos(th + PI) * r, 50 + Math.sin(th + PI) * r * 0.6]);
    }
    dd("galaxy", [smoothD(a1), smoothD(a2), A(circ(50, 50, 6)), { d: "M14 18 L14 19.5", w: 2 }, { d: "M86 82 L86 83.5", w: 2 }, { d: "M84 20 L84 21.5", w: 2 }, { d: "M18 80 L18 81.5", w: 2 }], [circ(50, 50, 6)]);
  })();
  dd("planet", [rell(50, 52, 46, 12, -16, 180, 360), { d: circ(50, 50, 26), solid: "paper" }, circ(50, 50, 26), "M27 40 C40 46 60 44 74 38", "M25 56 C38 62 60 62 75 54", A(rell(50, 52, 46, 12, -16, 0, 180), 1.1)], [circ(50, 50, 26)]);
  dd("bomb", [{ d: circ(46, 60, 30), solid: "ink" }, circ(46, 60, 30), rr(56, 26, 14, 10, 2), "M64 26 C66 18 72 14 80 16", { d: "M30 52 C32 44 38 40 44 38", c: "paper", w: 1.3 }, A("M84 6 L84 26 M74 16 L94 16 M77 9 L91 23 M91 9 L77 23")]);
  var CAKE = "M16 52 L84 52 L84 88 L16 88 Z", CFL = "M50 28 C44 22 48 14 50 9 C52 14 56 22 50 28 Z";
  dd("cake", [CAKE, "M16 62 C24 70 28 58 34 66 C40 74 46 58 52 66 C58 74 64 58 70 66 C76 72 80 60 84 64", "M8 90 L92 90", rr(46, 30, 8, 22, 0), A(CFL)], [CFL]);
  dd("chair", ["M28 56 L72 56 L72 62 L28 62 Z", "M28 56 L26 12", "M26 22 L34 22", "M30 62 L30 92", "M70 62 L70 92", "M30 80 L70 80"], ["M28 56 L72 56 L72 62 L28 62 Z"]);
  dd("door", [rr(26, 8, 48, 86, 0), rr(33, 16, 34, 30, 0), rr(33, 54, 34, 32, 0), A(circ(66, 52, 3)), "M14 94 L86 94"], [rr(26, 8, 48, 86, 0)]);
  (function () {
    var s = ["M33 6 L28 94", "M67 6 L72 94"];
    for (var y = 16; y <= 86; y += 14) { var k = (y - 6) / 88; s.push("M" + f2(33 - 5 * k) + " " + y + " L" + f2(67 + 5 * k) + " " + y); }
    dd("ladder", s);
  })();
  dd("key", [circ(28, 40, 16), circ(28, 40, 5), "M41 49 L86 76", "M72 68 L66 78", "M80 72 L74 82"], [circ(28, 40, 16)]);
  dd("magnifier", [circ(40, 40, 26), { d: "M59 59 L86 86", w: 2.4 }, "M27 33 C29 26 35 22 42 22"], [circ(40, 40, 26)]);
  var ROCK = "M14 80 C8 62 22 44 38 40 C46 28 66 28 74 40 C88 44 96 62 88 80 Z";
  dd("rock", [ROCK, "M40 56 L48 62 L46 70", "M66 48 L70 58", "M4 82 L96 82"], [ROCK]);
  var CUP = "M28 14 L72 14 L70 40 C68 58 32 58 30 40 Z";
  dd("trophy", [CUP, "M28 20 C14 20 14 40 31 43", "M72 20 C86 20 86 40 69 43", "M46 57 L46 70 M54 57 L54 70", rr(34, 70, 32, 10, 2), rr(28, 80, 44, 9, 2), A("M45 28 L50 24 L50 42")], [CUP]);
  var BRAIN = "M50 18 C44 10 30 10 26 20 C14 20 8 34 14 44 C6 52 10 68 22 70 C24 82 40 86 50 78 C60 86 76 82 78 70 C90 68 94 52 86 44 C92 34 86 20 74 20 C70 10 56 10 50 18";
  dd("brain", [BRAIN, "M50 18 C46 30 54 40 50 50 C46 60 54 68 50 78", "M24 34 C30 30 38 34 36 42", "M64 32 C70 28 78 34 74 42", "M22 56 C28 52 36 58 32 64", "M66 56 C72 52 80 58 76 64"], [BRAIN + " Z"]);
  (function () {
    var a = [], b = [], rungs = [];
    for (var i = 0; i <= 40; i++) {
      var y = 6 + i * 2.2, ph = (i / 40) * PI * 3;
      a.push([50 + Math.sin(ph) * 20, y]);
      b.push([50 - Math.sin(ph) * 20, y]);
      if (i % 4 === 2) rungs.push(poly([[50 + Math.sin(ph) * 20, y], [50 - Math.sin(ph) * 20, y]]));
    }
    dd("dna", [poly(a), A(poly(b))].concat(rungs));
  })();
  var APPLE = "M50 30 C38 20 14 24 14 50 C14 76 34 92 50 84 C66 92 86 76 86 50 C86 24 62 20 50 30 Z";
  dd("apple", [APPLE, "M50 30 C50 22 52 16 56 10", A("M53 20 C60 10 72 10 76 14 C70 22 60 24 53 20 Z"), "M26 46 C26 38 30 34 36 32"], [APPLE]);
  var FIRE = "M50 92 C26 92 16 74 20 56 C24 42 36 36 34 20 C46 26 52 36 50 48 C56 42 58 34 56 26 C72 38 84 56 80 70 C78 84 66 92 50 92 Z";
  var FIRE2 = "M50 90 C40 90 34 82 36 72 C38 64 46 60 46 52 C54 58 62 66 62 76 C62 84 56 90 50 90 Z";
  dd("fire", [FIRE, A(FIRE2)], [FIRE]);
  var BOLT = "M58 6 L24 54 L46 54 L38 94 L76 40 L54 40 L64 6 Z";
  dd("lightning", [BOLT], [BOLT]);
  var EYE = "M6 50 C26 22 74 22 94 50 C74 78 26 78 6 50 Z";
  dd("eye", [EYE, circ(50, 50, 16), { d: circ(50, 50, 6), solid: "ink" }, "M50 22 L50 13", "M30 27 L25 19", "M70 27 L75 19"], [circ(50, 50, 16)]);
  dd("person", [circ(50, 16, 10), "M50 26 L50 62", "M50 36 L34 55", "M50 36 L66 55", "M50 62 L38 92", "M50 62 L62 92", { d: "M46 15 L46 16.2", w: 1.4 }, { d: "M54 15 L54 16.2", w: 1.4 }]);
  (function () {
    var s = [], heads = [[30, 34], [70, 34], [16, 56], [50, 54], [84, 56]];
    heads.forEach(function (h, i) {
      var r = i < 2 ? 8 : 9, y = h[1];
      s.push(i === 3 ? A(circ(h[0], y, r)) : circ(h[0], y, r));
      s.push("M" + f2(h[0] - 13) + " " + f2(y + r + 22) + " C" + f2(h[0] - 13) + " " + f2(y + r + 4) + " " + f2(h[0] + 13) + " " + f2(y + r + 4) + " " + f2(h[0] + 13) + " " + f2(y + r + 22));
    });
    dd("crowd", s);
  })();
  var TRI = "M50 10 L92 86 L8 86 Z";
  dd("warning", [TRI, { d: "M50 36 L50 62", w: 1.6 }, { d: "M50 74 L50 75.5", w: 2 }], [TRI]);
  dd("calendar", [rr(14, 18, 72, 70, 4), "M14 36 L86 36", "M32 10 L32 26", "M68 10 L68 26", "M26 50 L34 50 M46 50 L54 50 M66 50 L74 50 M26 64 L34 64 M46 64 L54 64 M66 64 L74 64 M26 78 L34 78 M46 78 L54 78", A(circ(70, 77, 8))], ["M14 36 L14 22 Q14 18 18 18 L82 18 Q86 18 86 22 L86 36 Z"]);
  dd("battery", [rr(10, 30, 72, 40, 5), rr(82, 42, 8, 16, 2), "M30 36 L30 64", "M48 36 L48 64", A("M56 40 L50 51 L58 51 L52 62")], ["M15 35 L60 35 L60 65 L15 65 Z"]);
  dd("robot", [rr(26, 22, 48, 38, 6), circ(40, 40, 5), circ(60, 40, 5), "M40 52 L60 52", "M50 22 L50 11", A(circ(50, 8, 3)), "M44 60 L44 63 M56 60 L56 63", rr(30, 63, 40, 28, 4), "M30 70 L16 80", "M70 70 L84 60", "M42 74 L58 74"], [rr(26, 22, 48, 38, 6)]);
  var PIZZA = "M50 92 L14 24 C36 12 64 12 86 24 Z";
  dd("pizza", [PIZZA, "M17 30 C38 19 62 19 83 30", A(circ(44, 42, 6)), A(circ(60, 52, 5)), A(circ(50, 68, 4.5)), A(circ(33, 36, 3.5))], [PIZZA]);
  var DINO = "M4 60 C14 56 22 44 36 42 C48 40 58 42 64 44 C70 40 72 30 74 20 C75 13 80 10 86 11 C93 12 95 18 91 21 C88 23 84 22 82 24 C80 32 79 42 76 52 C74 62 66 68 56 68 L32 68 C22 68 14 64 4 60 Z";
  dd("dinosaur", [DINO, "M32 67 L31 88", "M40 68 L40 88", "M58 67 L58 88", "M66 64 L67 88", { d: "M86 15 L86 16.5", w: 2 }, A("M40 48 C44 44 50 44 52 48 M28 52 C30 49 34 49 36 52")], [DINO]);
  var FUSE = "M94 52 C94 46 86 44 76 44 L20 44 C12 44 6 47 6 52 C6 57 12 60 20 60 L76 60 C86 60 94 58 94 52 Z";
  dd("plane", [FUSE, "M52 50 L36 82 L46 82 L68 52", "M54 46 L42 24 L50 24 L66 46", "M18 46 L10 28 L17 28 L30 45", "M78 49 L84 49", A("M22 52 L64 52", 0.8)], [FUSE]);
  var PBODY = "M20 72 L66 26 L80 40 L34 86 Z";
  dd("pencil", [PBODY, "M20 72 L12 94 L34 86", { d: "M14.5 87 L12 94 L19 91.5", w: 1.4 }, "M66 26 L73 19 C76 16 80 16 83 19 L87 23 C90 26 90 30 87 33 L80 40", "M62 30 L76 44"], [PBODY]);
  var SAND1 = "M36 28 L64 28 C60 38 52 44 50 48 C48 44 40 38 36 28 Z", SAND2 = "M32 88 C36 74 46 70 50 70 C54 70 64 74 68 88 Z";
  dd("hourglass", ["M24 10 L76 10", "M24 90 L76 90", "M30 10 C30 36 46 42 46 50 C46 58 30 64 30 90", "M70 10 C70 36 54 42 54 50 C54 58 70 64 70 90", A("M50 52 L50 70")], [SAND1, SAND2]);
  var BAG = "M39 32 C20 44 12 64 18 78 C24 92 76 92 82 78 C88 64 80 44 61 32";
  dd("money-bag", [BAG, "M37 32 L63 32", "M40 30 C33 18 40 10 46 16 C48 9 53 9 55 16 C61 10 68 18 60 30", A("M56 56 C54 51 45 51 45 57 C45 63 56 61 56 68 C56 74 47 75 45 70"), A("M50 47 L50 79")], [BAG + " Z"]);
  dd("target", [circ(50, 52, 38), circ(50, 52, 25), circ(50, 52, 12), A("M50 52 L86 16", 1.2), A("M78 11 L86 16 L91 24")], [circ(50, 52, 12)]);
  var BEAM = "M36 64 L64 64 L80 96 L20 96 Z";
  dd("ufo", [A("M36 66 L22 95"), A("M64 66 L78 95"), "M30 50 C30 30 70 30 70 50", ell(50, 54, 42, 12), circ(28, 55, 2.5), circ(50, 58, 2.5), circ(72, 55, 2.5)], [BEAM]);
  var DOC = "M24 8 L64 8 L80 24 L80 92 L24 92 Z";
  dd("document", [DOC, "M64 8 L64 24 L80 24", "M34 40 L70 40", "M34 52 L70 52", "M34 64 L70 64", "M34 76 L56 76"], [DOC]);
  var PAN1 = "M5 56 C10 67 26 67 31 56 Z", PAN2 = "M69 56 C74 67 90 67 95 56 Z";
  dd("scale", ["M50 18 L50 86", "M30 88 L70 88", "M14 28 L86 28", circ(50, 16, 3), "M18 28 L8 56 M18 28 L28 56", "M82 28 L72 56 M82 28 L92 56", PAN1, PAN2], [PAN1, PAN2]);
  var DOGB = "M24 46 C24 40 30 38 36 38 L62 38 C68 38 72 42 72 46 L72 60 C72 64 68 66 64 66 L32 66 C28 66 24 64 24 60 Z";
  dd("dog", [DOGB, circ(76, 32, 12), "M86 28 L94 31 C97 33 95 38 91 38 L86 37", "M70 24 C63 26 61 36 66 43", { d: "M78 29 L78 30.5", w: 1.8 }, { d: "M94 32 L94 33.5", w: 2.2 }, "M32 66 L32 88", "M40 66 L40 88", "M58 66 L58 88", "M66 66 L66 88", "M24 46 C16 40 14 30 18 23", A("M84 44 C86 46 88 46 89 44")], [DOGB]);
  var TOOTH = "M24 20 C30 10 42 12 50 18 C58 12 70 10 76 20 C84 34 78 50 74 62 C70 76 70 90 62 90 C56 90 56 72 50 72 C44 72 44 90 38 90 C30 90 30 76 26 62 C22 50 16 34 24 20 Z";
  dd("tooth", [TOOTH, "M32 26 C30 32 30 38 32 42", A("M78 12 L84 6 M84 20 L92 18 M70 6 L71 0", 0.9)], [TOOTH]);

  var SYN = {
    idea: "lightbulb", ideas: "lightbulb", bulb: "lightbulb", insight: "lightbulb", why: "question", how: "question", what: "question", unknown: "question", mystery: "question",
    wow: "exclamation", alert: "exclamation", coins: "coin", cash: "money", dollar: "money", dollars: "money", price: "money", cost: "money", pay: "money", bill: "money", salary: "money",
    time: "clock", hour: "clock", hours: "clock", minute: "clock", late: "clock", earth: "globe", world: "globe", global: "globe", map: "globe", day: "sun", summer: "sun", light: "sun", hot: "fire",
    night: "moon", lunar: "moon", sleep: "moon", famous: "star", best: "star", weather: "cloud", sky: "cloud", storm: "rain", wet: "rain", home: "house", city: "building", office: "building",
    skyscraper: "building", tower: "building", nature: "tree", forest: "tree", plant: "tree", everest: "mountain", hill: "mountain", climb: "mountain", challenge: "mountain", launch: "rocket",
    space: "rocket", startup: "rocket", spaceship: "rocket", mobile: "phone", app: "phone", call: "phone", computer: "laptop", internet: "laptop", online: "laptop", code: "laptop",
    read: "book", learn: "book", study: "book", school: "book", love: "heart", health: "heart", care: "heart", physics: "atom", science: "atom", chemistry: "atom", system: "gear",
    machine: "gear", process: "gear", settings: "gear", engine: "gear", growth: "chart", data: "chart", graph: "chart", sales: "chart", up: "chart", decline: "chart-down", loss: "chart-down",
    crash: "chart-down", down: "chart-down", share: "chart-pie", percent: "chart-pie", pie: "chart-pie", next: "arrow", forward: "arrow", direction: "arrow", goal: "flag", finish: "flag",
    country: "flag", start: "flag", cup: "coffee", tea: "coffee", morning: "coffee", package: "box", parcel: "box", delivery: "box", toy: "ball", sport: "ball", game: "ball", football: "ball",
    drive: "car", traffic: "car", vehicle: "car", insect: "ant", bug: "ant", kitten: "cat", sea: "fish", ocean: "whale", biology: "cell", life: "cell", germ: "virus", disease: "virus",
    flu: "virus", universe: "galaxy", cosmos: "galaxy", cosmic: "galaxy", cosmically: "galaxy", saturn: "planet", mars: "planet", explosion: "bomb", explode: "bomb", birthday: "cake",
    party: "cake", seat: "chair", sit: "chair", exit: "door", entrance: "door", career: "ladder", steps: "ladder", password: "key", secret: "key", unlock: "key", search: "magnifier",
    find: "magnifier", research: "magnifier", stone: "rock", pebble: "rock", win: "trophy", winner: "trophy", prize: "trophy", award: "trophy", mind: "brain", think: "brain", smart: "brain",
    brain: "brain", genes: "dna", genetics: "dna", fruit: "apple", food: "apple", danger: "fire", burn: "fire", energy: "lightning", power: "lightning", electricity: "lightning",
    watch: "eye", see: "eye", vision: "eye", you: "person", human: "person", man: "person", woman: "person", people: "crowd", team: "crowd", everyone: "crowd", humans: "crowd",
    risk: "warning", caution: "warning", problem: "warning", date: "calendar", week: "calendar", month: "calendar", year: "calendar", schedule: "calendar", charge: "battery",
    ai: "robot", bot: "robot", automation: "robot", dinner: "pizza", lunch: "pizza", dino: "dinosaur", extinct: "dinosaur", flight: "plane", fly: "plane", travel: "plane",
    airplane: "plane", write: "pencil", draw: "pencil", writing: "pencil", wait: "hourglass", deadline: "hourglass", rich: "money-bag", wealth: "money-bag", profit: "money-bag",
    aim: "target", focus: "target", alien: "ufo", aliens: "ufo", paper: "document", report: "document", file: "document", contract: "document", law: "scale", justice: "scale",
    fair: "scale", balance: "scale", weight: "scale", puppy: "dog", pet: "dog", dentist: "tooth", teeth: "tooth",
  };
  function hasDoodle(n) { return !!DL[str(n)]; }
  function pickDoodle(text, fb) {
    var t = str(text).toLowerCase();
    if (DL[t]) return t;
    if (SYN[t]) return SYN[t];
    var ws = t.split(/[^a-z0-9-]+/).filter(Boolean);
    for (var i = 0; i < ws.length; i++) if (DL[ws[i]]) return ws[i];
    for (i = 0; i < ws.length; i++) if (SYN[ws[i]]) return SYN[ws[i]];
    for (i = 0; i < ws.length; i++) { var w = ws[i].replace(/(ies|es|s)$/, ""); if (DL[w]) return w; if (SYN[w]) return SYN[w]; }
    return fb === undefined ? "lightbulb" : fb;
  }
  function doodleName(n) { n = str(n); return DL[n] ? n : pickDoodle(n); }

  var localCache = {};
  function localDoodle(name) {
    if (localCache[name]) return localCache[name];
    var def = DL[name], parts = [], total = 0;
    def.s.forEach(function (s) {
      var o = typeof s === "string" ? { d: s } : s;
      if (o.solid) { parts.push({ solid: o.solid, d: o.d, a: !!o.a }); return; }
      splitD(o.d).forEach(function (sd) {
        var pts = sample(sd, 1.2), cum = cumOf(pts), L = cum[cum.length - 1];
        total += L;
        parts.push({ pts: pts, a: !!o.a, w: o.w || 1, c: o.c || null, len: L });
      });
    });
    return (localCache[name] = { parts: parts, hi: def.hi, total: total });
  }
  function doodleLW(size, ws) { return clamp(size * 0.028, u(2.4), u(6.2)) * (ws || 1); }
  function doodleDur(name, size, accent) {
    var L = localDoodle(name), n = L.parts.length;
    return clamp(0.4 + L.total / 620 + n * 0.03, 0.5, 2.4) + (accent && L.hi.length ? 0.35 : 0);
  }
  // S.doodle(name, {x, y, size, at, dur, speed, accent, color, rot, flip, layer, ws}) -> item
  function doodle(name, o) {
    o = obj(o);
    var s = ensure();
    name = doodleName(name);
    var L = localDoodle(name);
    var size = Math.max(4, num(o.size, u(240))), x = num(o.x, W / 2), y = num(o.y, H / 2), sc = size / 100, ws = Math.max(0.01, num(o.ws, 1));
    var m = mat(x, y, sc, num(o.rot, 0), !!o.flip, 50, 50);
    var pc = newPiece(layerOf(o.layer, "mid"), "sf-doodle");
    var hg = svg("g", {}, pc.g), lg = svg("g", {}, pc.g);
    var inkC = o.color ? colorOf(o.color) : COL.ink, acc = !!o.accent;
    var lw = num(o.width, doodleLW(size, ws)), amp = num(o.wobble, size * 0.006), wl = Math.max(ws, size / u(300));
    var segs = [], all = [];
    L.parts.forEach(function (k) {
      if (k.solid) {
        var col = k.solid === "paper" ? COL.paper : k.solid === "accent" || (k.a && acc) ? COL.accent : inkC;
        segs.push(mkSolid(k.d, col, lg, { transform: "matrix(" + m.map(function (v) { return +v.toFixed(5); }).join(" ") + ")" }));
        return;
      }
      var pts = wobble(applyM(m, k.pts), amp, s.rnd, wl);
      all.push(pts);
      var c = k.c === "paper" ? COL.paper : k.c === "muted" ? COL.muted : k.a && acc ? COL.accent : inkC;
      var g = mkStroke(pts, { color: c, width: lw * k.w, parent: lg, ws: wl, boil: u(0.8) * Math.max(ws, size / u(400)) });
      g.w = k.len * sc + size * 0.05;
      segs.push(g);
    });
    if (acc) {
      var sp = clamp(size * 0.05, u(7), u(15)) * Math.max(1, ws * 0.8);
      L.hi.forEach(function (h) { segs.push(mkHatch(h, m, sc, COL.accent, sp, hg, "nonzero", Math.max(u(1.8) * ws, sp * 0.3))); });
    }
    var times = schedule(segs, { at: o.at, dur: o.dur, speed: o.speed }, doodleDur(name, size, acc));
    var b = boundsOf(all);
    if (!(b.w > 0)) b = { x: x - size / 2, y: y - size / 2, w: size, h: size };
    var it = mkItem("doodle", name, b, times, pc);
    it.name = name;
    it.size = size;
    return it;
  }

  // ------------------------- hand lettering (single-stroke font, cap height 100) -------------------------
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
  GL["\u2248"] = [50, "M5 44 C13 34 23 52 31 44 C37 38 42 36 46 40 M5 66 C13 56 23 74 31 66 C37 60 42 58 46 62"];
  GL["\u00d7"] = [44, "M8 46 L36 78 M36 46 L8 78"];
  GL["\u2192"] = [72, "M6 62 L64 62 M46 44 L66 62 L46 80"];
  GL["~"] = [50, "M5 62 C13 50 23 70 31 60 C37 54 42 52 46 56"];
  GL["["] = [28, "M22 -4 L8 -4 L8 118 L22 118"];
  GL["]"] = [28, "M6 -4 L20 -4 L20 118 L6 118"];
  delete CHARMAP["\u00d7"];

  // ------------------------- text layout and writing -------------------------
  var glyphCache = {};
  function prepText(text) {
    text = String(text == null ? "" : text);
    var out = "";
    for (var i = 0; i < text.length; i++) out += CHARMAP[text[i]] != null ? CHARMAP[text[i]] : text[i];
    return out.normalize("NFD");
  }
  // Paragraphs -> words -> clusters {b: base, m: [marks], em}
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
    splitD(g[1]).forEach(function (sd) { strokes.push(sample(sd, 2.4)); });
    var cx = g[0] / 2, top = TALL.test(cl.b) ? 0 : 46;
    cl.m.forEach(function (mk) {
      var md = MARKS[mk];
      if (!md) return;
      if (md === "BELOW") md = CEDILLA;
      splitD(md).forEach(function (sd) {
        var pts = sample(sd, 2.4), dy = MARKS[mk] === "BELOW" ? 0 : top;
        for (var i = 0; i < pts.length; i += 2) { pts[i] += cx; pts[i + 1] += dy; }
        strokes.push(pts);
      });
    });
    return (glyphCache[key] = { adv: g[0], strokes: strokes });
  }
  function wordWidth(word, sc) { var w = 0; word.forEach(function (cl) { w += (glyphLocal(cl).adv + TRACK) * sc; }); return w - TRACK * sc; }
  var FALLBACK_FONT = "\"Segoe Print\", \"Bradley Hand\", \"Comic Sans MS\", \"Chalkboard SE\", \"Comic Neue\", \"Noto Sans\", cursive";
  var cvs = null;
  function fbWidth(txt, size) {
    if (!cvs) cvs = doc.createElement("canvas").getContext("2d");
    cvs.font = (size / 0.7).toFixed(1) + "px " + FALLBACK_FONT;
    return cvs.measureText(txt).width;
  }
  function layoutText(text, o) {
    var size = num(o.size, u(54)) > 0 ? num(o.size, u(54)) : u(54);
    var maxW = num(o.maxWidth, 0) > 0 ? +o.maxWidth : W * 0.8;
    var maxLines = num(o.maxLines, 0) > 0 ? Math.floor(+o.maxLines) : 3;
    var lh = num(o.lineHeight, 0) > 0 ? +o.lineHeight : 1.5;
    if (o.caps) text = String(text).toUpperCase();
    var Pt = parseText(text);
    function wrap(s, limit) {
      var sc = s / 100, sp = SPACE * sc, out = [];
      Pt.paras.forEach(function (words) {
        var line = { words: [], w: 0 };
        words.forEach(function (wd) {
          var ww = Pt.ok ? wordWidth(wd, sc) : fbWidth(wd.map(function (c) { return c.b + c.m.join(""); }).join("").normalize("NFC"), s);
          if (line.words.length && line.w + sp + ww > limit) { out.push(line); line = { words: [], w: 0 }; }
          line.w += (line.words.length ? sp : 0) + ww;
          line.words.push({ cls: wd, w: ww });
        });
        out.push(line);
      });
      return out;
    }
    function widestOf(ls) { var m = 0; ls.forEach(function (l) { m = Math.max(m, l.w); }); return m; }
    var lines, s = size, minS = num(o.minSize, size * 0.3);
    for (var iter = 0; iter < 24; iter++) {
      lines = wrap(s, maxW);
      if ((lines.length <= maxLines && widestOf(lines) <= maxW + 0.5) || s <= minS) break;
      s *= 0.94;
    }
    // Balance: the narrowest width that keeps the same number of lines (no orphan words).
    if (lines.length > 1 && o.balance !== false) {
      var lo = widestOf(lines) * 0.4, hi = widestOf(lines), n0 = lines.length;
      for (var b = 0; b < 12; b++) { var mid = (lo + hi) / 2; if (wrap(s, mid).length <= n0) hi = mid; else lo = mid; }
      lines = wrap(s, hi + 0.5);
    }
    var bw = widestOf(lines), bh = s + (lines.length - 1) * s * lh;
    return { lines: lines, size: s, lh: lh, w: bw, h: bh + s * 0.25, ok: Pt.ok };
  }
  function blockOrigin(lay, o) {
    var x = num(o.x, W / 2), y = num(o.y, H / 2);
    var anchor = o.anchor || "center", top, left, bh = lay.h;
    var ax = /left/.test(anchor) ? 0 : /right/.test(anchor) ? 1 : 0.5;
    var ay = /^top/.test(anchor) ? 0 : /^bottom/.test(anchor) ? 1 : 0.5;
    left = x - lay.w * ax;
    top = y - bh * ay;
    var align = o.align || (ax === 0 ? "left" : ax === 1 ? "right" : "center");
    return { left: left, top: top, align: align };
  }
  function measureBlock(text, o) { var l = layoutText(String(text == null ? "" : text), o || {}); return { w: l.w, h: l.h, size: l.size, lines: l.lines.length }; }
  function textDur(text) {
    var n = prepText(text).replace(/[\s*]/g, "").length;
    return clamp(0.2 + n * 0.052, 0.3, 8);
  }
  // S.write(text, opts) -> item: hand-lettered text written left to right.
  function write(text, o) {
    o = obj(o);
    var s = ensure();
    text = String(text == null ? "" : text);
    if (o.caps) text = text.toUpperCase();
    var lay = layoutText(text, Object.assign({}, o, { caps: false }));
    var org = blockOrigin(lay, o);
    var size = lay.size, sc = size / 100, ws = num(o.ws, 1);
    var col = colorOf(o.color, COL.ink), emc = colorOf(o.em, COL.accent);
    var width = size * (num(o.weight, 0) > 0 ? +o.weight : 0.078);
    var hud = o.layer === "hud";
    var pc = newPiece(layerOf(o.layer, "mid"), "sf-text");
    var segs = [], all = [], amp = size * 0.011;
    var rot = num(o.rot, 0), rc = [org.left + lay.w / 2, org.top + lay.h / 2];
    var rm = rot ? mat(rc[0], rc[1], 1, rot, false, rc[0], rc[1]) : null;
    if (lay.ok) {
      lay.lines.forEach(function (line, li) {
        var lx = org.align === "center" ? org.left + (lay.w - line.w) / 2 : org.align === "right" ? org.left + lay.w - line.w : org.left;
        var ly = org.top + li * size * lay.lh;
        var x = lx;
        line.words.forEach(function (wd, wi) {
          if (wi) x += SPACE * sc;
          wd.cls.forEach(function (cl) {
            var G = glyphLocal(cl);
            var jr = (s.rnd() - 0.5) * 3.4, jy = (s.rnd() - 0.5) * 2.8, js = 1 + (s.rnd() - 0.5) * 0.05;
            var m = mat(x + (G.adv * sc) / 2, ly + 50 * sc + jy * sc, sc * js, jr, false, G.adv / 2, 50);
            G.strokes.forEach(function (lp) {
              var pts = wobble(applyM(m, lp), amp, s.rnd, ws);
              if (rm) pts = applyM(rm, pts);
              all.push(pts);
              var g = mkStroke(pts, { color: cl.em ? emc : col, width: width, parent: pc.g, boil: u(0.45) * ws, ws: ws });
              g.w = g.len + size * 0.35;
              segs.push(g);
            });
            x += (G.adv + TRACK) * sc;
          });
        });
      });
    } else {
      // A script the stroke font does not cover: a hand-style system font revealed left to right.
      lay.lines.forEach(function (line, li) {
        var lx = org.align === "center" ? org.left + (lay.w - line.w) / 2 : org.align === "right" ? org.left + lay.w - line.w : org.left;
        var ly = org.top + li * size * lay.lh;
        var id = uid("rev");
        var cp = svg("clipPath", { id: id, clipPathUnits: "userSpaceOnUse" }, s.defs);
        var rect = svg("rect", { x: f1(lx - size * 0.3), y: f1(ly - size * 0.6), width: 0, height: f1(size * 2.2) }, cp);
        var tg = svg("text", { x: f1(lx), y: f1(ly + size), "clip-path": "url(#" + id + ")", class: "sf-fbtext", fill: col, style: "font-size:" + (size / 0.7).toFixed(1) + "px" }, pc.g);
        if (rot) tg.setAttribute("transform", "rotate(" + f2(rot) + " " + f2(rc[0]) + " " + f2(rc[1]) + ")");
        line.words.forEach(function (wd, wi) {
          var tsp = svg("tspan", { fill: wd.cls[0] && wd.cls[0].em ? emc : col }, tg);
          tsp.textContent = (wi ? " " : "") + wd.cls.map(function (c) { return c.b + c.m.join(""); }).join("").normalize("NFC");
        });
        all.push([lx, ly, lx + line.w, ly + size * 1.2]);
        var lw = line.w + size * 0.6;
        var g = { el: tg, w: line.w, state: -1, kind: "custom", t0: 0, t1: 0 };
        g.update = function (ns, e) { rect.setAttribute("width", f1(ns === 2 ? lw : lw * e)); };
        g.el.style.display = "none";
        segs.push(g);
      });
    }
    var times = schedule(segs, o, textDur(text));
    var b = boundsOf(all), box = { x: org.left, y: org.top, w: lay.w, h: lay.h };
    if (rot && b.w > 0) box = b;
    else if (b.w > 0) { box.x = Math.min(box.x, b.x); box.w = Math.max(org.left + lay.w, b.x + b.w) - box.x; }
    var it = mkItem("text", text, box, times, pc);
    it.size = size;
    it.lines = lay.lines.length;
    if (o.until != null && isFinite(+o.until)) pc.fade(0, +o.until, 0.25);
    it.hud = hud;
    return it;
  }

  // ------------------------- free lines, emphasis, arrows -------------------------
  function strokesJob(list, o, defDur, color, width, kind, label) {
    var s = ensure();
    var pc = newPiece(layerOf(o.layer, "mid"), "sf-" + (kind || "path"));
    var segs = [], all = [], ws = num(o.ws, 1);
    list.forEach(function (pts) {
      var w = o.wobble != null ? +o.wobble : u(1.5) * ws;
      var p = wobble(pts, w, s.rnd, ws);
      all.push(p);
      var g = mkStroke(p, { color: color, width: width, parent: pc.g, ws: ws });
      segs.push(g);
    });
    var times = schedule(segs, o, defDur);
    var it = mkItem(kind || "path", label || kind || "path", boundsOf(all), times, pc, o.noInspect);
    if (o.until != null && isFinite(+o.until)) pc.fade(0, +o.until, 0.25);
    return it;
  }
  function lineLen(list) { var L = 0; list.forEach(function (p) { var c = cumOf(p); L += c[c.length - 1]; }); return L; }
  // S.scribble(points, {at, dur, color, width, closed, sharp, fill, hatch, wobble}) -> item
  function scribble(points, o) {
    o = obj(o);
    var s = ensure();
    var ptsL = arr(points).filter(function (q) { return Array.isArray(q) && isFinite(+q[0]) && isFinite(+q[1]); }).map(function (q) { return [+q[0], +q[1]]; });
    if (ptsL.length < 2) ptsL = [[W / 2 - u(40), H / 2], [W / 2 + u(40), H / 2]];
    var d = o.sharp ? poly(ptsL, !!o.closed) : smoothD(ptsL, !!o.closed);
    var list = splitD(d).map(function (sd) { return sample(sd, 3); });
    var width = num(o.width, penW()), color = colorOf(o.color, COL.ink);
    var pc = newPiece(layerOf(o.layer, "mid"), "sf-scribble");
    var segs = [], all = [], ws = num(o.ws, 1);
    if (o.fill) segs.push(mkSolid(d + (o.closed ? "" : " Z"), colorOf(o.fill, COL.ink), pc.g));
    list.forEach(function (pts) {
      var p = wobble(pts, o.wobble != null ? +o.wobble : u(1.5) * ws, s.rnd, ws);
      all.push(p);
      segs.push(mkStroke(p, { color: color, width: width, parent: pc.g, ws: ws }));
    });
    if (o.hatch) {
      var bb = boundsOf(all), sp = clamp(Math.max(bb.w, bb.h) * 0.05, u(7), u(15));
      segs.push(mkHatch(d + (o.closed ? "" : " Z"), [1, 0, 0, 1, 0, 0], 1, colorOf(o.hatch, COL.accent), sp, pc.g));
    }
    var times = schedule(segs, o, clamp(0.25 + lineLen(list) / u(1300), 0.3, 3));
    return mkItem("scribble", "scribble", boundsOf(all), times, pc);
  }
  function line(x1, y1, x2, y2, o) {
    o = obj(o);
    var list = [sample("M" + x1 + " " + y1 + " L" + x2 + " " + y2, 3)];
    return strokesJob(list, o, clamp(0.2 + lineLen(list) / u(1500), 0.25, 1.6), colorOf(o.color, COL.ink), num(o.width, penW()), "line");
  }
  // S.ground(x0, x1, y): a scribbled floor line with a few short hatch dashes under it.
  function ground(x0, x1, y, o) {
    o = obj(o);
    var list = [sample("M" + x0 + " " + y + " L" + x1 + " " + y, 3)];
    var n = o.ticks === false ? 0 : Math.max(2, Math.round(Math.abs(x1 - x0) / u(150))), r = ensure().rnd;
    for (var i = 0; i < n; i++) {
      var x = lerp(x0, x1, (i + 0.3 + r() * 0.4) / n), l = u(16 + r() * 10);
      list.push(sample("M" + x + " " + (y + u(10)) + " L" + (x - l) + " " + (y + u(10) + l * 0.7), 2));
    }
    return strokesJob(list, Object.assign({ noInspect: true }, o), clamp(0.2 + Math.abs(x1 - x0) / u(1800), 0.25, 1.2), colorOf(o.color, COL.ink), num(o.width, penW(0.9)), "ground");
  }
  // S.panel(x, y, w, h): a comic panel border (corners overshoot a little).
  function panel(x, y, w, h, o) {
    o = obj(o);
    var ov = Math.min(u(10), Math.min(w, h) * 0.04), r = ensure().rnd, j = function () { return (r() - 0.5) * u(5); };
    var d = "M" + (x - ov) + " " + (y + j()) + " L" + (x + w + ov * 0.4) + " " + (y + j()) +
      " M" + (x + w + j()) + " " + (y - ov * 0.5) + " L" + (x + w + j()) + " " + (y + h + ov) +
      " M" + (x + w + ov * 0.6) + " " + (y + h + j()) + " L" + (x - ov * 0.3) + " " + (y + h + j()) +
      " M" + (x + j()) + " " + (y + h + ov * 0.5) + " L" + (x + j()) + " " + (y - ov);
    var list = splitD(d).map(function (sd) { return sample(sd, 3); });
    var it = strokesJob(list, Object.assign({ noInspect: true, wobble: u(1.2) }, o), clamp(0.35 + (w + h) / u(2600), 0.4, 1.2), colorOf(o.color, COL.ink), num(o.width, penW(1.25)), "panel");
    it.x = x; it.y = y; it.w = w; it.h = h; it.cx = x + w / 2; it.cy = y + h / 2;
    return it;
  }
  function edgePoint(r, toward, pad) {
    var cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    var dx = toward[0] - cx, dy = toward[1] - cy;
    if (!r.w && !r.h) { var l0 = Math.sqrt(dx * dx + dy * dy) || 1; return [cx + (dx / l0) * pad, cy + (dy / l0) * pad]; }
    var hw = r.w / 2 + pad, hh = r.h / 2 + pad;
    var k = Math.min(Math.abs(dx) > 1e-6 ? hw / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? hh / Math.abs(dy) : Infinity);
    if (!isFinite(k) || k > 1) k = Math.min(1, k);
    return [cx + dx * k, cy + dy * k];
  }
  // S.arrow(from, to, {at, dur, color, w, bend, head, pad}) -> item
  function arrow(from, to, o) {
    o = obj(o);
    var a = rectOf(from, o.at), b = rectOf(to, o.at);
    var pad = o.pad != null ? +o.pad : u(14);
    var ca = [a.x + a.w / 2, a.y + a.h / 2], cb = [b.x + b.w / 2, b.y + b.h / 2];
    var p0 = o.fromPt ? o.fromPt : edgePoint(a, cb, o.padFrom != null ? +o.padFrom : pad), p1 = o.toPt ? o.toPt : edgePoint(b, ca, pad);
    var bend = o.bend != null ? clamp(+o.bend, -1, 1) : 0.22;
    var dx = p1[0] - p0[0], dy = p1[1] - p0[1], dist = Math.sqrt(dx * dx + dy * dy) || 1;
    var mx = (p0[0] + p1[0]) / 2 - (dy / dist) * dist * bend * 0.5, my = (p0[1] + p1[1]) / 2 + (dx / dist) * dist * bend * 0.5;
    var shaft = sample("M" + p0[0] + " " + p0[1] + " Q" + mx + " " + my + " " + p1[0] + " " + p1[1], 3);
    var n = shaft.length, back = Math.min(n - 2, 8);
    var tx = shaft[n - 2] - shaft[n - 2 - back], ty = shaft[n - 1] - shaft[n - 1 - back], tl = Math.sqrt(tx * tx + ty * ty) || 1;
    tx /= tl; ty /= tl;
    var hl = num(o.headSize, clamp(dist * 0.2, u(14), u(30)));
    var list = [shaft];
    if (o.head !== false) {
      var ex = p1[0], ey = p1[1], c = Math.cos(0.48), s0 = Math.sin(0.48);
      var l1 = [ex - hl * (tx * c - ty * s0), ey - hl * (ty * c + tx * s0)], l2 = [ex - hl * (tx * c + ty * s0), ey - hl * (ty * c - tx * s0)];
      list.push(sample("M" + l1[0] + " " + l1[1] + " L" + ex + " " + ey + " L" + l2[0] + " " + l2[1], 2));
    }
    var wd = num(o.w, num(o.width, penW()));
    var it = strokesJob(list, Object.assign({ wobble: u(1.2) * num(o.ws, 1) }, o), clamp(0.25 + dist / u(1700), 0.3, 1.0), colorOf(o.color, COL.ink), wd, "arrow");
    it.p0 = p0; it.p1 = p1;
    return it;
  }
  // S.label(text, target, opts): text at opts.x, opts.y plus an arrow to the target.
  function label(text, target, o) {
    o = obj(o);
    var r = rectOf(target, o.at);
    var x = num(o.x, r.x + r.w + u(150)), y = num(o.y, r.y - u(40));
    var tOpts = Object.assign({ size: u(38), maxWidth: W * 0.22, maxLines: 3 }, o, { x: x, y: y });
    delete tOpts.dur;
    var ti = write(text, tOpts);
    var ar = arrow(ti, target, { at: o.arrowAt != null ? o.arrowAt : ti.t1 + 0.05, dur: o.arrowDur, color: o.arrowColor || o.color, bend: o.bend != null ? o.bend : 0.25, pad: o.pad != null ? o.pad : u(12), padFrom: u(10), layer: o.layer });
    ti.arrow = ar;
    ti.t1 = ar.t1;
    return ti;
  }
  // S.youAreHere(x, y, {text, dx, dy, at, size, dist}): accent dot, caps text and an arrow.
  function youAreHere(x, y, o) {
    o = obj(o);
    var s = ensure();
    var at = num(o.at, s.any ? s.cursor + GAP : s.cursor), r = num(o.r, u(11));
    var pc = newPiece(layerOf(o.layer, "front"), "sf-here");
    var dot = mkSolid(circ(x, y, r), COL.accent, pc.g);
    var dt = schedule([dot], { at: at, dur: 0.05 }, 0.05);
    mkItem("here-dot", "dot", { x: x - r, y: y - r, w: 2 * r, h: 2 * r }, dt, pc);
    var dx = num(o.dx, -0.75), dy = num(o.dy, -0.75), dist = num(o.dist, u(170));
    var dl = Math.sqrt(dx * dx + dy * dy) || 1;
    var tx = x + (dx / dl) * dist, ty = y + (dy / dl) * dist;
    var ti = write(o.text != null ? str(o.text) : "YOU ARE HERE", { x: tx, y: ty, size: num(o.size, u(32)), maxWidth: num(o.maxWidth, u(260)), maxLines: 2, caps: o.caps !== false, color: o.color || "accent", at: at + 0.12, layer: o.layer || "front" });
    var ar = arrow(ti, { x: x, y: y }, { at: ti.t1 + 0.05, color: o.color || "accent", pad: r + u(8), padFrom: u(8), bend: o.bend != null ? o.bend : -0.25, layer: o.layer || "front" });
    var box = unionBox([ti, { x: x - r, y: y - r, w: 2 * r, h: 2 * r }]);
    return { x: box.x, y: box.y, w: box.w, h: box.h, cx: box.x + box.w / 2, cy: box.y + box.h / 2, t0: at, t1: ar.t1, end: ar.t1, text: ti, arrow: ar, dot: { x: x, y: y } };
  }
  // S.circle(target): accent scribbled ellipse (radii 1.36 x half the box so corners stay inside).
  function circle(target, o) {
    o = obj(o);
    var r = rectOf(target, o.at), pad = o.pad != null ? +o.pad : u(14);
    var cx = r.x + r.w / 2, cy = r.y + r.h / 2, rx = (r.w / 2) * 1.3 + pad, ry = (r.h / 2) * 1.36 + pad * 0.8;
    var pts = [], a0 = -2.6, turns = 1.1, N = 96;
    for (var i = 0; i <= N; i++) {
      var a = a0 + (i / N) * turns * 2 * PI, k = 1 + 0.05 * (i / N) - 0.02;
      pts.push(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k);
    }
    return strokesJob([pts], o, 0.55, colorOf(o.color, COL.accent), num(o.width, penW(1.15)), "circle");
  }
  function underline(target, o) {
    o = obj(o);
    var r = rectOf(target, o.at), pad = o.pad != null ? +o.pad : u(8);
    var y = r.y + r.h + pad, x0 = r.x - r.w * 0.02, x1 = r.x + r.w * 1.02;
    var list = [sample("M" + x0 + " " + y + " Q" + (x0 + x1) / 2 + " " + (y + u(6)) + " " + x1 + " " + (y - u(3)), 3)];
    if (o.double) list.push(sample("M" + (x1 - r.w * 0.05) + " " + (y + u(15)) + " Q" + (x0 + x1) / 2 + " " + (y + u(21)) + " " + (x0 + r.w * 0.07) + " " + (y + u(16)), 3));
    return strokesJob(list, o, o.double ? 0.5 : 0.32, colorOf(o.color, COL.accent), num(o.width, penW(1.2)), "underline");
  }
  function cross(target, o) {
    o = obj(o);
    var r = rectOf(target, o.at), pad = o.pad != null ? +o.pad : u(6), list;
    if (o.strike) {
      var y = r.y + r.h * 0.55;
      list = [sample("M" + (r.x - pad * 2) + " " + (y + u(4)) + " Q" + (r.x + r.w / 2) + " " + (y - u(6)) + " " + (r.x + r.w + pad * 2) + " " + (y - u(2)), 3)];
    } else {
      list = [sample("M" + (r.x - pad) + " " + (r.y - pad) + " L" + (r.x + r.w + pad) + " " + (r.y + r.h + pad), 3), sample("M" + (r.x + r.w + pad) + " " + (r.y - pad) + " L" + (r.x - pad) + " " + (r.y + r.h + pad), 3)];
    }
    return strokesJob(list, o, o.strike ? 0.3 : 0.45, colorOf(o.color, COL.accent), num(o.width, penW(1.3)), "cross");
  }
  function box(target, o) {
    o = obj(o);
    var r = rectOf(target, o.at), pad = o.pad != null ? +o.pad : u(16);
    var x0 = r.x - pad, y0 = r.y - pad, x1 = r.x + r.w + pad, y1 = r.y + r.h + pad, ov = u(8);
    var d = "M" + (x0 - ov) + " " + y0 + " L" + (x1 + ov * 0.5) + " " + (y0 + u(2)) + " M" + x1 + " " + (y0 - ov) + " L" + (x1 - u(2)) + " " + (y1 + ov * 0.6) + " M" + (x1 + ov) + " " + y1 + " L" + (x0 - ov * 0.4) + " " + (y1 - u(2)) + " M" + x0 + " " + (y1 + ov) + " L" + (x0 + u(2)) + " " + (y0 - ov * 0.5);
    var list = splitD(d).map(function (sd) { return sample(sd, 3); });
    return strokesJob(list, o, 0.7, colorOf(o.color, COL.ink), num(o.width, penW()), "box");
  }

  // ------------------------- hand-drawn graph -------------------------
  // S.graph({x, y, w, h, type, values, labels, xLabel, yLabel, caps, highlight, annotations, at,
  //   dataAt, dataDur, lands, accent, size}) -> {pts, ox, oy, pw, ph, t1, items}
  function graph(o) {
    o = obj(o);
    var s = ensure();
    var gx = num(o.x, W * 0.12), gy = num(o.y, H * 0.12), gw = num(o.w, W * 0.76), gh = num(o.h, H * 0.76);
    var type = o.type === "bar" ? "bar" : "line";
    var vals = arr(o.values).map(function (v) { return num(v, 0); }).slice(0, 12);
    if (vals.length < 2) vals = vals.length ? [vals[0] * 0.5, vals[0]] : [2, 5];
    var n = vals.length, labels = arr(o.labels).map(str);
    var caps = o.caps !== false;
    var ls = num(o.size, clamp(Math.min(gw, gh) * 0.05, u(24), u(38)));
    var anns = arr(o.annotations).filter(function (a) { return a && str(a.text); }).slice(0, 3);
    var hasLab = labels.some(Boolean), xl = str(o.xLabel), yl = str(o.yLabel);
    var left = (yl ? ls * 1.9 : 0) + u(18), bottom = (hasLab ? ls * 1.75 : u(8)) + (xl ? ls * 1.7 : 0) + u(10);
    var top = anns.length ? ls * 3.2 : u(24), right = u(34);
    var ox = gx + left, oy = gy + gh - bottom, pw = gw - left - right, ph = gh - top - bottom;
    var vmax = Math.max.apply(null, vals), vmin = Math.min(0, Math.min.apply(null, vals));
    if (vmax - vmin < 1e-9) vmax = vmin + 1;
    var slot = pw / n;
    var pts = vals.map(function (v, i) {
      var x = type === "bar" ? ox + slot * (i + 0.5) : ox + pw * (0.06 + (0.88 * i) / (n - 1));
      return { x: x, y: oy - ((v - vmin) / (vmax - vmin)) * ph * 0.88, v: v };
    });
    var at = num(o.at, s.any ? s.cursor + GAP : s.cursor);
    var lw = num(o.width, penW(1.05)), items = [];
    // axes with arrowheads
    var ah = u(16);
    var axes = [
      sample("M" + ox + " " + (oy + u(8)) + " L" + (ox + u(2)) + " " + (oy - ph), 3),
      sample("M" + (ox - ah * 0.7) + " " + (oy - ph + ah) + " L" + (ox + u(2)) + " " + (oy - ph) + " L" + (ox + ah * 0.75) + " " + (oy - ph + ah), 2),
      sample("M" + (ox - u(8)) + " " + oy + " L" + (ox + pw) + " " + (oy - u(2)), 3),
      sample("M" + (ox + pw - ah) + " " + (oy - u(2) - ah * 0.72) + " L" + (ox + pw) + " " + (oy - u(2)) + " L" + (ox + pw - ah) + " " + (oy - u(2) + ah * 0.72), 2),
    ];
    var axI = strokesJob(axes, { at: at, wobble: u(1.6) }, 0.75, COL.ink, lw, "axes");
    items.push(axI);
    var tcur = axI.t1;
    if (yl) { var yi = write(yl, { x: gx + ls * 0.95, y: oy - ph / 2, size: ls * 0.92, maxWidth: ph * 0.95, maxLines: 1, caps: caps, rot: -90, at: tcur + 0.05, dur: Math.min(0.8, textDur(yl)) }); items.push(yi); tcur = yi.t1; }
    if (xl) { var xi = write(xl, { x: ox + pw / 2, y: gy + gh - ls * 0.62, size: ls * 0.92, maxWidth: pw * 0.95, maxLines: 1, caps: caps, at: tcur + 0.05, dur: Math.min(0.7, textDur(xl)) }); items.push(xi); tcur = xi.t1; }
    if (hasLab) {
      var lsz = Math.min(ls * 0.85, slot * 0.42);
      var labAt = tcur + 0.05, labDur = clamp(0.12 * n, 0.4, 1.2) / n;
      pts.forEach(function (p, i) {
        if (!labels[i]) return;
        items.push(write(labels[i], { x: p.x, y: oy + u(14), anchor: "top", size: lsz, maxWidth: slot * 0.94, maxLines: 2, at: labAt + i * labDur, dur: labDur * 0.9 }));
      });
      tcur = labAt + n * labDur;
    }
    // data
    var dataAt = num(o.dataAt, tcur + 0.15), dataDur = num(o.dataDur, clamp(0.35 * n, 0.9, 2.4));
    var lands = arr(o.lands).length === n ? o.lands.map(function (v) { return num(v, null); }) : null;
    var tp = [];
    if (lands) {
      tp = lands.slice();
      tp[0] = Math.max(dataAt - 0.2, Math.min(tp[0] == null ? dataAt : tp[0], dataAt));
      for (var q = 1; q < n; q++) { if (tp[q] == null || tp[q] < tp[q - 1] + 0.12) tp[q] = tp[q - 1] + Math.max(0.12, dataDur / n); }
    } else for (var q2 = 0; q2 < n; q2++) tp.push(dataAt + (dataDur * q2) / Math.max(1, n - 1));
    var hl = o.highlight != null && isFinite(+o.highlight) ? clamp(Math.round(+o.highlight), 0, n - 1) : -1;
    var dataCol = o.accent ? COL.accent : COL.ink;
    var pc = newPiece(s.L.mid, "sf-data"), dataEnd = dataAt, dataPts = [], barBoxes = [];
    var hiAt = null;
    if (type === "line") {
      var cp = pts.map(function (p) { return [p.x, p.y]; });
      for (var i = 1; i < n; i++) {
        var a = cp[Math.max(0, i - 2)], b = cp[i - 1], c = cp[i], d2 = cp[Math.min(n - 1, i + 1)];
        var seg = "M" + b[0] + " " + b[1] + " C" + (b[0] + (c[0] - a[0]) / 6) + " " + (b[1] + (c[1] - a[1]) / 6) + " " + (c[0] - (d2[0] - b[0]) / 6) + " " + (c[1] - (d2[1] - b[1]) / 6) + " " + c[0] + " " + c[1];
        var spts = wobble(sample(seg, 3), u(1.6), s.rnd);
        for (var dq = 0; dq < spts.length; dq += 4) dataPts.push([spts[dq], spts[dq + 1]]);
        var g = mkStroke(spts, { color: dataCol, width: lw * 1.3, parent: pc.g });
        var t1 = tp[i], t0 = Math.max(tp[i - 1], t1 - 1.3);
        schedule([g], { at: t0, dur: Math.max(0.12, t1 - t0) }, 0.4);
        dataEnd = Math.max(dataEnd, t1);
      }
      pts.forEach(function (p, i) {
        if (i === hl) return;
        var g = mkStroke([p.x, p.y, p.x + 0.01, p.y + 0.01], { color: dataCol, width: lw * 2.6, parent: pc.g, boil: 0 });
        schedule([g], { at: tp[i], dur: 0.05 }, 0.05);
      });
      if (hl >= 0) {
        var hp = pts[hl];
        var dot = mkSolid(circ(hp.x, hp.y, u(11)), COL.accent, pc.g);
        schedule([dot], { at: tp[hl], dur: 0.05 }, 0.05);
        var rg = circle({ x: hp.x - u(14), y: hp.y - u(14), w: u(28), h: u(28) }, { at: tp[hl] + 0.08, dur: 0.45, pad: u(6) });
        items.push(rg);
        hiAt = tp[hl];
      }
    } else {
      var bw = slot * 0.56;
      pts.forEach(function (p, i) {
        var x0 = p.x - bw / 2, x1 = p.x + bw / 2, y0 = p.y, isH = i === hl, col = isH ? COL.accent : COL.ink;
        barBoxes.push({ x: x0, y: y0, w: bw, h: oy - y0 });
        var outline = wobble(sample("M" + x0 + " " + oy + " L" + x0 + " " + y0 + " L" + x1 + " " + y0 + " L" + x1 + " " + oy, 3), u(1.4), s.rnd);
        var g = mkStroke(outline, { color: col, width: lw, parent: pc.g });
        var hdur = Math.max(0.12, Math.min(0.6, (i + 1 < n ? tp[i + 1] - tp[i] : 0.6) * 0.8));
        var hz = mkHatch(rr(x0, y0, bw, oy - y0, 0), [1, 0, 0, 1, 0, 0], 1, isH ? COL.accent : COL.ink, clamp(bw * 0.16, u(8), u(16)), pc.g, "nonzero", u(isH ? 3 : 2.2));
        schedule([g], { at: tp[i] - 0.25, dur: 0.3 }, 0.3);
        schedule([hz], { at: tp[i] + 0.06, dur: hdur }, 0.3);
        dataEnd = Math.max(dataEnd, tp[i] + 0.06 + hdur);
        if (isH) hiAt = tp[i];
      });
    }
    var dataBox = unionBox(pts.map(function (p) { return { x: p.x - u(10), y: p.y - u(10), w: u(20), h: u(20) }; }));
    items.push(mkItem("data", "data", dataBox, { t0: tp[0], t1: dataEnd }, pc));
    // annotations: text above (or beside) the point and an arrow to it
    var annEnd = dataEnd;
    var used = [];
    anns.forEach(function (an, k) {
      var idx = clamp(Math.round(num(an.index, 0)), 0, n - 1), p = pts[idx];
      var tA = an.at != null ? num(an.at, null) : null;
      if (tA == null && an.keyword) tA = kwFind(an.keyword, 0);
      var ready = tp[idx] + 0.2;
      tA = tA == null ? Math.max(ready, annEnd + 0.1) : Math.max(tA, ready);
      var tm = measureBlock(an.text, { size: ls * 0.95, maxWidth: Math.min(pw * 0.42, u(360)), maxLines: 2 });
      var side = p.x > ox + pw * 0.6 ? -1 : p.x < ox + pw * 0.3 ? 1 : (k % 2 ? 1 : -1);
      var pad = u(10), best = null;
      function hits(cx0, cy0) {
        var bx = cx0 - tm.w / 2 - pad, by = cy0 - tm.h / 2 - pad, bw2 = tm.w + 2 * pad, bh2 = tm.h + 2 * pad;
        if (bx < gx || bx + bw2 > gx + gw || by < gy || by + bh2 > oy - u(4)) return 1e9;
        var c = 0;
        dataPts.forEach(function (q) { if (q[0] > bx && q[0] < bx + bw2 && q[1] > by && q[1] < by + bh2) c++; });
        barBoxes.concat(used).forEach(function (b) { if (bx < b.x + b.w && bx + bw2 > b.x && by < b.y + b.h && by + bh2 > b.y) c += 50; });
        return c;
      }
      var dxs = [side, -side, 0], dys = [-1, 1], cands = [];
      [1, 1.8, 2.8].forEach(function (far) { dys.forEach(function (dyy) { dxs.forEach(function (dxx) { cands.push([p.x + dxx * (tm.w * 0.5 + u(30)) * far * 0.7, p.y + dyy * (u(56) * far + tm.h / 2)]); }); }); });
      cands.forEach(function (c) { var cx0 = clamp(c[0], gx + tm.w / 2 + pad, gx + gw - tm.w / 2 - pad), cy0 = c[1], sc0 = hits(cx0, cy0); if (!best || sc0 < best.s) best = { x: cx0, y: cy0, s: sc0 }; });
      var tx = best.x, ty = clamp(best.y, gy + tm.h / 2, oy - tm.h / 2 - u(10));
      used.push({ x: tx - tm.w / 2, y: ty - tm.h / 2, w: tm.w, h: tm.h });
      var ti = write(an.text, { x: tx, y: ty, size: ls * 0.95, maxWidth: Math.min(pw * 0.42, u(360)), maxLines: 2, at: tA });
      var ar = arrow(ti, { x: p.x, y: p.y }, { at: ti.t1 + 0.04, pad: u(16), padFrom: u(8), bend: (tx > p.x ? -1 : 1) * (ty < p.y ? 1 : -1) * 0.22 });
      items.push(ti, ar);
      annEnd = Math.max(annEnd, ar.t1);
    });
    return { pts: pts, ox: ox, oy: oy, pw: pw, ph: ph, t0: at, t1: annEnd, dataEnd: dataEnd, hiAt: hiAt, items: items, box: { x: gx, y: gy, w: gw, h: gh } };
  }

  // ------------------------- the cast -------------------------
  var CAST = {
    pip: { tuft: 1 }, ada: { glasses: 1, bun: 1 }, hank: { hat: 1 }, juno: { pony: 1 }, remy: { beret: 1 }, anon: { blank: 1 },
  };
  var CAST_SYN = { narrator: "pip", expert: "ada", scientist: "ada", skeptic: "hank", doubter: "hank", curious: "juno", asker: "juno", dreamer: "remy", artist: "remy", extra: "anon", someone: "anon", person: "anon", none: null };
  function castKey(id) { id = str(id).toLowerCase(); if (CAST[id]) return id; if (CAST_SYN[id] !== undefined) return CAST_SYN[id]; return null; }

  // Rig in local units: height about 100, feet on y = 0, up is -y. Arm A is the near arm (on the
  // facing side), arm B the far arm; angles in degrees from straight down, + = outward.
  var HR = 11, NECK = 1.5, TORSO = 29, TH = 21, SH = 21, UA = 18, FA = 17, SHO = 3.5;
  function dv(a, sg) { var r = rad(a); return [Math.sin(r) * sg, Math.cos(r)]; }
  function addv(p, v, k) { return [p[0] + v[0] * k, p[1] + v[1] * k]; }
  function rotP(p, c, d) { var r = rad(d), cs = Math.cos(r), sn = Math.sin(r), x = p[0] - c[0], y = p[1] - c[1]; return [c[0] + x * cs - y * sn, c[1] + x * sn + y * cs]; }
  // Two-bone arm IK: hand target (outward x, down y) from the shoulder -> [shoulder angle, elbow bend].
  function ik(tx, ty, bend) {
    var d0 = Math.sqrt(tx * tx + ty * ty) || 1, d = clamp(d0, Math.abs(UA - FA) + 0.6, UA + FA - 0.4);
    tx *= d / d0; ty *= d / d0;
    var th = deg(Math.atan2(tx, ty)), al = deg(Math.acos(clamp((UA * UA + d * d - FA * FA) / (2 * UA * d), -1, 1)));
    var a = th + (bend == null ? -1 : bend) * al;
    var ex = Math.sin(rad(a)) * UA, ey = Math.cos(rad(a)) * UA;
    var e = deg(Math.atan2(tx - ex, ty - ey)) - a;
    while (e > 180) e -= 360;
    while (e < -180) e += 360;
    return [a, e];
  }
  var PZ = { lean: 0, nod: 0, a: 9, e: 4, b: 9, f: 4, l: 7, k: 0, m: 7, n: 0, rot: 0, y: 0, seat: 0 };
  var POSES = {
    stand: { expr: "neutral" },
    talk: { a: 28, e: 55, expr: "smile" },
    explain: { a: 38, e: 80, b: 18, f: 20, expr: "smile" },
    point: { a: 86, e: 2, expr: "neutral" },
    "point-up": { a: 138, e: 16, nod: -8, expr: "smile" },
    "point-down": { a: 40, e: 0, lean: 8, nod: 12, expr: "neutral" },
    shrug: { a: 42, e: 84, b: 42, f: 84, front: 1, expr: "flat" },
    wave: { a: 122, e: 36, osc: "wave", front: 1, expr: "smile" },
    think: { ikA: [5.5, -6.5, -1], nod: -9, look: 1, expr: "flat" },
    panic: { a: 118, e: 38, b: 118, f: 38, front: 1, osc: "flail", shake: 1, expr: "scream" },
    celebrate: { a: 126, e: 20, b: 126, f: 20, front: 1, bounce: 1, expr: "grin" },
    sad: { lean: 12, nod: 22, a: 3, e: 0, b: 3, f: 0, l: 4, m: 4, expr: "frown" },
    facepalm: { ikA: [3.5, -14.5, -1], nod: 14, b: 5, f: 0, expr: "shut" },
    hold: { ikA: [14, 5, -1], ikB: [-12, 6, 1], expr: "neutral" },
    crossed: { ikA: [-5, 6, 1], ikB: [-5, 3.5, 1], expr: "flat" },
    smug: { ikA: [3, 18, 1], ikB: [3, 18, 1], nod: -10, front: 1, expr: "smirk" },
    "mind-blown": { ikA: [12.5, -16, -1], ikB: [12.5, -16, -1], front: 1, burst: 1, expr: "surprised" },
    sit: { lean: -6, a: 62, e: 18, b: -46, f: -12, l: 118, k: 60, m: -112, n: 56, seat: 1, expr: "neutral" },
    crouch: { lean: 28, nod: -12, a: 50, e: 20, b: 30, f: 30, l: 70, k: 125, m: -50, n: 105, expr: "worried" },
    jump: { a: 128, e: 20, b: 128, f: 20, l: 40, k: 70, m: -25, n: 65, y: -14, front: 1, expr: "grin" },
    fallen: { rot: 90, a: 150, e: 10, b: 120, f: 20, l: 18, k: 25, m: 12, n: 20, expr: "dizzy" },
    listen: { lean: -3, nod: -4, expr: "neutral" },
    present: { a: 62, e: 24, expr: "smile" },
    run: { lean: 14, a: 50, e: 80, b: 40, f: 70, l: 40, k: 30, m: 40, n: 80, expr: "worried" },
    walk: { l: 22, k: 4, m: 22, n: 10, a: -12, e: 8, b: -12, f: 8, expr: "neutral" },
  };
  var POSE_ALIAS = { fall: "fallen", falling: "fallen", lying: "fallen", "lie": "fallen", pointing: "point", thinking: "think", mindblown: "mind-blown", "mind_blown": "mind-blown", explaining: "explain",
    talking: "talk", waving: "wave", sitting: "sit", running: "run", walking: "walk", jumping: "jump", excited: "celebrate", cheer: "celebrate", confused: "shrug", angry: "crossed", annoyed: "crossed",
    surprised: "mind-blown", neutral: "stand", idle: "stand", scared: "panic", worried: "panic", proud: "smug", "arms-crossed": "crossed", holding: "hold", up: "point-up", down: "point-down" };
  function poseKey(name) { name = str(name).toLowerCase(); return POSES[name] ? name : POSE_ALIAS[name] || "stand"; }
  var poseCache = {};
  function poseVec(name) {
    var k = poseKey(name);
    if (poseCache[k]) return Object.assign({}, poseCache[k]);
    var p = POSES[k], o = {};
    for (var q in PZ) o[q] = p[q] != null ? p[q] : PZ[q];
    if (p.ikA) { var r = ik(p.ikA[0], p.ikA[1], p.ikA[2]); o.a = r[0]; o.e = r[1]; }
    if (p.ikB) { var r2 = ik(p.ikB[0], p.ikB[1], p.ikB[2]); o.b = r2[0]; o.f = r2[1]; }
    poseCache[k] = o;
    return Object.assign({}, o);
  }
  var EXPRS = ["neutral", "smile", "grin", "frown", "flat", "o", "surprised", "scream", "smirk", "worried", "angry", "dizzy", "sleepy"];

  // Joints for pose vector pv and facing value fv (-1 left .. 0 front .. 1 right).
  function skeleton(pv, fv) {
    var fs = fv < -0.01 ? -1 : 1;
    var hip = [0, 0], up = dv(180 - pv.lean, fs);
    var torso = TORSO + (pv.breath || 0);
    var neck = addv(hip, up, torso), sh = addv(hip, up, torso - SHO);
    var head = addv(neck, dv(180 - pv.lean - pv.nod, fs), NECK + HR);
    var eA = addv(sh, dv(pv.a + pv.lean, fs), UA), hA = addv(eA, dv(pv.a + pv.e + pv.lean, fs), FA);
    var eB = addv(sh, dv(pv.b - pv.lean, -fs), UA), hB = addv(eB, dv(pv.b + pv.f - pv.lean, -fs), FA);
    var kA = addv(hip, dv(pv.l, fs), TH), fA = addv(kA, dv(pv.l - pv.k, fs), SH);
    var kB = addv(hip, dv(pv.m, -fs), TH), fB = addv(kB, dv(pv.m + pv.n, -fs), SH);
    var J = { hip: hip, neck: neck, sh: sh, head: head, eA: eA, hA: hA, eB: eB, hB: hB, kA: kA, fA: fA, kB: kB, fB: fB };
    var k;
    if (pv.rot) { var ang = -pv.rot * fs; for (k in J) J[k] = rotP(J[k], hip, ang); }
    var low = pv.seat > 0.5 ? Math.max(J.hip[1] + 1.5, J.fA[1], J.fB[1]) : Math.max(J.fA[1], J.fB[1], J.kA[1], J.kB[1], J.hip[1] + 1.5, J.head[1] + HR, J.hA[1], J.hB[1], J.eA[1], J.eB[1]);
    var dy = -low - 0.8 + (pv.y || 0);
    for (k in J) J[k] = [J[k][0], J[k][1] + dy];
    var hx = J.head[0] - J.neck[0], hy = J.head[1] - J.neck[1], hl = Math.sqrt(hx * hx + hy * hy) || 1;
    J.hu = [hx / hl, hy / hl];
    J.fs = fs;
    return J;
  }

  // Marks drawn by the head (local 100 box centred on 50,50; pos and size in head radii).
  var MK = {
    sweat: { pos: [-1.3, -0.4], size: 0.9, s: [{ d: "M50 8 C64 32 76 50 76 64 C76 80 64 92 50 92 C36 92 24 80 24 64 C24 50 36 32 50 8 Z" }] },
    exclaim: { pos: [1.55, -1.55], size: 1.5, s: [{ d: "M50 6 L50 64", w: 1.8 }, { d: "M50 84 L50 85.5", w: 2.5 }] },
    question: { pos: [1.6, -1.55], size: 1.5, s: [{ d: "M28 30 C28 4 74 4 74 30 C74 48 50 46 50 64 L50 68", w: 1.6 }, { d: "M50 84 L50 85.5", w: 2.4 }] },
    idea: { pos: [0.1, -2.75], size: 1.8, doodle: "lightbulb" },
    heart: { pos: [1.35, -1.9], size: 1.1, s: [{ d: HEART + " Z", c: "accent", w: 1.3 }] },
    sparkle: { pos: [1.5, -1.5], size: 1.4, s: [{ d: "M30 12 L30 48 M12 30 L48 30", c: "accent" }, { d: "M74 56 L74 84 M60 70 L88 70", c: "accent" }, { d: "M66 18 L66 30 M60 24 L72 24" }] },
    anger: { pos: [1.05, -1.2], size: 0.9, s: [{ d: "M20 38 C36 38 40 34 40 18 M60 18 C60 34 64 38 80 38 M80 62 C64 62 60 66 60 82 M40 82 C40 66 36 62 20 62", c: "accent", w: 1.4 }] },
    dizzy: { pos: [0, -1.6], size: 2.1, spin: 1, s: [{ d: rell(50, 50, 40, 12, 0) , w: 0.8 }, { d: starP(90, 50, 9, 4, 5, -90), c: "accent" }, { d: starP(16, 54, 8, 3.5, 5, -90) }] },
    zzz: { pos: [1.35, -1.8], size: 1.5, rise: 1, s: [{ d: "M8 54 L34 54 L8 84 L34 84" }, { d: "M46 30 L66 30 L46 54 L66 54", w: 0.9 }, { d: "M76 10 L90 10 L76 28 L90 28", w: 0.8 }] },
    motion: { pos: [-2.4, 3.3], size: 2.4, s: [{ d: "M90 24 L30 24" }, { d: "M96 50 L14 50" }, { d: "M90 76 L40 76" }] },
    burst: { pos: [0, 0], size: 4.6, s: [] },
  };
  (function () { for (var i = 0; i < 10; i++) { var a = pt(50, 50, 33, i * 36 - 90), b = pt(50, 50, 47, i * 36 - 90); MK.burst.s.push({ d: poly([a, b]), c: "accent", w: 1.2 }); } })();
  var MARK_ALIAS = { "!": "exclaim", exclamation: "exclaim", "?": "question", bulb: "idea", lightbulb: "idea", love: "heart", stars: "sparkle", shine: "sparkle", angry: "anger", vein: "anger", spin: "dizzy", sleep: "zzz", z: "zzz", speed: "motion", lines: "motion", explode: "burst", boom: "burst" };
  function markKey(k) { k = str(k).toLowerCase(); return MK[k] ? k : MARK_ALIAS[k] || null; }

  function makeFigure(name, o) {
    var s = ensure();
    o = obj(o);
    var key = castKey(name) || "pip", cd = CAST[key];
    var h = Math.max(20, num(o.h, P ? H * 0.26 : H * 0.4));
    var sc = h / 100, ws = num(o.ws, 1);
    var lw = clamp(h * 0.0165, u(3.0), u(6.4)) * ws, lwl = lw / sc;
    var layer = layerOf(o.layer, "figs");
    var g = svg("g", { class: "sf-fig sf-c-" + key }, layer);
    var el = {};
    function part(k, extra) {
      var p = svg("path", Object.assign({ fill: "none", stroke: COL.ink, "stroke-width": f2(lwl), "stroke-linecap": "round", "stroke-linejoin": "round" }, extra || {}), g);
      p.style.display = "none";
      el[k] = p;
      return p;
    }
    if (cd.pony) { part("pony", { "stroke-width": f2(lwl * 2.1) }); part("tie", { "stroke-width": f2(lwl * 2.6) }); }
    if (cd.bun) part("bun", { fill: COL.ink });
    part("legB"); part("legA"); part("body"); part("armB");
    part("headFill", { fill: COL.paper, stroke: "none" });
    part("head");
    if (cd.tuft) part("tuft");
    if (cd.hat) { part("hat", { fill: COL.ink }); part("brim", { "stroke-width": f2(lwl * 1.5) }); }
    if (cd.beret) { part("beret", { fill: COL.ink }); part("stalk"); }
    if (cd.glasses) part("glasses", { "stroke-width": f2(lwl * 0.8) });
    part("eyes", { "stroke-width": f2(lwl * 0.85) });
    part("brows", { "stroke-width": f2(lwl * 0.8) });
    part("mouth", { "stroke-width": f2(lwl * 0.8) });
    part("armA");
    var p0 = poseKey(o.pose || "stand");
    var face0 = o.facing === "front" ? 0 : o.facing === "left" ? -1 : o.facing === "right" ? 1 : POSES[p0].front ? 0 : 1;
    var at0 = o.at != null ? Math.max(0, num(o.at, 0)) : s.any ? s.cursor + GAP : s.cursor;
    var f = {
      kind: "figure", id: key, cd: cd, h: h, sc: sc, g: g, el: el, lw: lw, lwl: lwl, label: key,
      tr: new Tr({ x: num(o.x, W / 2), y: num(o.y, H * 0.85) }), poseTr: new Tr(poseVec(p0)), nameTr: new Tr(p0),
      exprK: [{ at: -1, name: o.expr && EXPRS.indexOf(o.expr) >= 0 ? o.expr : POSES[p0].expr || "neutral", auto: !o.expr, i: 0 }],
      faceTr: new Tr(face0), op: null, at: at0, drawDur: Math.max(0.1, num(o.drawDur, 0.85)),
      talks: [], walks: [], jumps: [], lastSide: face0 || 1, seed: Math.floor(s.rnd() * 1000), ei: 1,
    };
    s.cursor = at0 + f.drawDur;
    s.any = true;
    function T0(at) { return at == null ? ensure().cursor : Math.max(0, num(at, ensure().cursor)); }
    f.pose = function (name, at, dur, ease, over) {
      var k = poseKey(name), t0 = T0(at);
      var d = dur == null ? (k === "fallen" ? 0.6 : 0.32) : Math.max(0, num(dur, 0.32));
      var vec = poseVec(k);
      if (over) for (var q in over) if (isFinite(+over[q])) vec[q] = +over[q];
      f.poseTr.to(vec, t0, d, ease || (k === "fallen" ? "outBounce" : "outBack"));
      f.nameTr.set(k, t0);
      f.exprK.push({ at: t0, name: POSES[k].expr || "neutral", auto: true, i: f.ei++ });
      var fv = f.faceTr.val(t0 + 1e-3);
      if (POSES[k].front) f.faceTr.to(0, t0, 0.14, "inOutSine");
      else if (Math.abs(fv) < 0.5) f.faceTr.to(f.lastSide || 1, t0, 0.14, "inOutSine");
      if (k === "panic") f.mark("sweat", t0 + 0.1, Math.max(0.8, Math.min(2.2, D - t0 - 0.2)));
      if (k === "mind-blown") f.mark("burst", t0 + 0.05, 1.3);
      return f;
    };
    f.expr = function (name, at) { name = str(name).toLowerCase(); if (EXPRS.indexOf(name) < 0) name = "neutral"; f.exprK.push({ at: T0(at), name: name, auto: false, i: f.ei++ }); return f; };
    f.face = function (dir, at, dur) {
      var v = dir === "front" ? 0 : dir === "left" || dir === -1 ? -1 : 1;
      if (v) f.lastSide = v;
      f.faceTr.to(v, T0(at), dur == null ? 0.14 : num(dur, 0.14), "inOutSine");
      return f;
    };
    f.lookAt = function (x, at) { var p = f.tr.val(T0(at)); return f.face(num(x, p.x) >= p.x ? "right" : "left", at); };
    f.pointAt = function (target, at, dur) {
      var t0 = T0(at), r = rectOf(target, t0), tx = r.x + r.w / 2, ty = r.y + r.h / 2;
      var p = f.tr.val(t0), side = tx >= p.x ? 1 : -1;
      f.face(side > 0 ? "right" : "left", t0);
      var J = skeleton(poseVec("point"), side), shx = p.x + J.sh[0] * sc, shy = p.y + J.sh[1] * sc;
      var want = clamp(deg(Math.atan2(Math.abs(tx - shx), ty - shy)), 15, 172), a = Math.min(want, 136);
      return f.pose("point", t0, dur, null, { a: a, e: clamp(want - a, 0, 30), nod: want > 120 ? -8 : want < 60 ? 8 : 0 });
    };
    f.move = function (x, at, dur, run) {
      var t0 = T0(at), x0 = f.tr.val(t0).x, x1 = num(x, x0), dist = Math.abs(x1 - x0);
      var d = dur == null ? Math.max(0.4, dist / (h * (run ? 2.3 : 1.05))) : Math.max(0.15, num(dur, 1));
      f.tr.to({ x: x1 }, t0, d, run ? "inOutSine" : "linear");
      var side = x1 >= x0 ? 1 : -1;
      f.lastSide = side;
      f.faceTr.to(side, t0, 0.12, "inOutSine");
      f.walks.push({ t0: t0, t1: t0 + d, run: !!run });
      return f;
    };
    f.walkTo = function (x, at, dur) { return f.move(x, at, dur, false); };
    f.runTo = function (x, at, dur) { return f.move(x, at, dur, true); };
    f.jump = function (at, height, dur) { f.jumps.push({ t0: T0(at), d: Math.max(0.3, num(dur, 0.75)), hgt: num(height, 0.32) * 100 }); return f; };
    f.fall = function (at, dur) { var t0 = T0(at), d = num(dur, 0.6); f.pose("fallen", t0, d); f.mark("dizzy", t0 + d * 0.8, Math.max(0.8, Math.min(2.2, D - t0 - d - 0.1))); return f; };
    f.getUp = function (at) { return f.pose("stand", T0(at), 0.5, "inOutCubic"); };
    f.talk = function (t0, t1) { f.talks.push([num(t0, 0), num(t1, D)]); return f; };
    f.out = function (at, dur) { if (!f.op) f.op = new Tr(1); f.op.to(0, T0(at), num(dur, 0.35), "linear"); return f; };
    f.skel = function (t) { return skelAt(f, t == null ? D : t); };
    f.world = function (p, t) { var q = f.tr.val(t); return [q.x + p[0] * sc, q.y + p[1] * sc]; };
    f.head = function (t) {
      t = t == null ? D : t;
      var J = skelAt(f, t), c = f.world(J.head, t), r = HR * sc, extra = cd.hat ? 0.75 : cd.bun || cd.beret ? 0.45 : cd.tuft ? 0.55 : 0;
      return { x: c[0], y: c[1], r: r, top: c[1] - r * (1 + extra), side: J.fs };
    };
    f.hand = function (t, which) { t = t == null ? D : t; var J = skelAt(f, t); var c = f.world(which === "b" ? J.hB : J.hA, t); return { x: c[0], y: c[1] }; };
    f.box = function (t) { return figBox(f, t == null ? D : t); };
    f.center = function (t) { var b = f.box(t); return [b.x + b.w / 2, b.y + b.h / 2]; };
    f.mark = function (kind, at, dur) { markOn(f, kind, T0(at), dur); return f; };
    f.say = function (text, so) { return sayOn(f, text, so); };
    f.think = function (rect, so) { return thinkOn(f, rect, so); };
    f.hold = function (item, which, at) {
      if (!item || !item.piece) return f;
      var wh = which === "b" ? "b" : "a", it = item;
      it.piece.follow(function (t) { var hp = f.hand(t, wh); return [hp.x + J0(t) * it.w * 0.18, hp.y - it.h * 0.32]; }, at == null ? 0 : num(at, 0));
      function J0(t) { return skelAt(f, t).fs; }
      return f;
    };
    f.moving = function (t) { return f.tr.moving(t) || f.jumps.some(function (j) { return t > j.t0 && t < j.t0 + j.d; }); };
    s.anims.push(function (t) { updFigure(f, t); });
    s.items.push({ kind: "figure", label: key, fig: f });
    s.figs.push(f);
    return f;
  }
  function exprAt(f, t) {
    var best = f.exprK[0];
    f.exprK.forEach(function (k) { if (k.at <= t + 1e-6 && (k.at > best.at || (k.at === best.at && (k.auto === best.auto ? k.i > best.i : !k.auto)))) best = k; });
    return best.name;
  }
  function talkOpen(f, t) {
    var on = false;
    for (var i = 0; i < f.talks.length; i++) if (t >= f.talks[i][0] && t <= f.talks[i][1]) { on = true; break; }
    if (!on) return 0;
    var ws = V.words, lo = 0, hi = ws.length - 1, idx = -1;
    while (lo <= hi) { var mid = (lo + hi) >> 1; if (ws[mid].start <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1; }
    if (idx < 0) return 0;
    var w = ws[idx];
    if (t > w.end) return 0;
    var p = (t - w.start) / Math.max(0.08, w.end - w.start);
    return clamp(Math.sin(PI * clamp(p, 0, 1)) * (0.55 + 0.45 * Math.abs(Math.sin((t - w.start) * 17 + idx))), 0, 1);
  }
  function skelAt(f, t) {
    var pv = f.poseTr.val(t), fv = f.faceTr.val(t), name = f.nameTr.val(t);
    pv = Object.assign({}, pv);
    var ph = f.seed * 0.37;
    // idle life: breathing and a slow sway
    pv.breath = 0.55 * Math.sin(t * 2.1 + ph);
    pv.a += 1.6 * Math.sin(t * 1.7 + ph); pv.b += 1.6 * Math.sin(t * 1.5 + ph + 1);
    pv.lean += 0.8 * Math.sin(t * 0.9 + ph);
    if (name === "wave") pv.e += 26 * Math.sin(t * 2 * PI * 1.7);
    if (name === "panic") { pv.a += 16 * Math.sin(t * 2 * PI * 3.1); pv.b += 16 * Math.sin(t * 2 * PI * 3.1 + 2); pv.e += 10 * Math.sin(t * 19); pv.f += 10 * Math.sin(t * 17); }
    if (name === "celebrate") { pv.y += -5 * Math.abs(Math.sin(t * 2 * PI * 1.4)); pv.a += 8 * Math.sin(t * 2 * PI * 1.4); pv.b += 8 * Math.sin(t * 2 * PI * 1.4); }
    var o = talkOpen(f, t);
    if (o > 0 && name !== "fallen") pv.nod += 3.5 * o - 1;
    // walk / run cycle from distance travelled
    f.walks.forEach(function (w) {
      if (t < w.t0 || t > w.t1 + 0.12) return;
      var x = f.tr.val(t).x, phs = (x / (f.h * (w.run ? 0.95 : 0.6))) * 2 * PI, A = w.run ? 40 : 26;
      var fade = clamp(Math.min((t - w.t0) / 0.12, (w.t1 + 0.12 - t) / 0.12), 0, 1);
      var sn = Math.sin(phs), cs = Math.cos(phs);
      var L = 4 + A * sn, M = 4 + A * sn;
      pv.l = lerp(pv.l, L, fade); pv.m = lerp(pv.m, M, fade);
      pv.k = lerp(pv.k, Math.max(0, (w.run ? 75 : 34) * -cs), fade); pv.n = lerp(pv.n, Math.max(0, (w.run ? 75 : 34) * cs), fade);
      pv.a = lerp(pv.a, (w.run ? 30 : 8) - (w.run ? 34 : 20) * sn, fade); pv.b = lerp(pv.b, (w.run ? 30 : 8) - (w.run ? 34 : 20) * sn, fade);
      if (w.run) { pv.e = lerp(pv.e, 85, fade); pv.f = lerp(pv.f, 85, fade); pv.lean = lerp(pv.lean, 14, fade); }
      pv.y += -1.6 * Math.abs(Math.sin(phs)) * fade;
    });
    // jumps: crouch, air, land
    f.jumps.forEach(function (j) {
      var p = (t - j.t0) / j.d;
      if (p <= 0 || p >= 1) return;
      var crouch = p < 0.2 ? Math.sin((p / 0.2) * PI * 0.5) : p > 0.82 ? Math.sin(((1 - p) / 0.18) * PI * 0.5) : 0;
      var air = p >= 0.2 && p <= 0.82 ? (p - 0.2) / 0.62 : -1;
      if (crouch > 0) { pv.l = lerp(pv.l, 60, crouch); pv.k = lerp(pv.k, 110, crouch); pv.m = lerp(pv.m, -40, crouch); pv.n = lerp(pv.n, 95, crouch); pv.lean = lerp(pv.lean, 14, crouch); pv.a = lerp(pv.a, 40, crouch); pv.b = lerp(pv.b, 40, crouch); }
      if (air >= 0) { var tuck = Math.sin(air * PI); pv.y -= j.hgt * 4 * air * (1 - air); pv.l = lerp(pv.l, 34, tuck); pv.k = lerp(pv.k, 60, tuck); pv.m = lerp(pv.m, -18, tuck); pv.n = lerp(pv.n, 55, tuck); pv.a = lerp(pv.a, 128, tuck); pv.b = lerp(pv.b, 128, tuck); pv.e = lerp(pv.e, 20, tuck); pv.f = lerp(pv.f, 20, tuck); }
    });
    var J = skeleton(pv, fv);
    // line boil: small joint jitter that changes six times a second
    if (st.boil) {
      var bf = Math.floor(t * BOIL_FPS + 1e-6), ks = ["eA", "hA", "eB", "hB", "kA", "kB", "neck", "head"], amp = [0.5, 0.6, 0.5, 0.6, 0.45, 0.45, 0.3, 0.25];
      for (var i = 0; i < ks.length; i++) {
        var jx = (hash(bf * 13.7 + i * 3.1 + f.seed) - 0.5) * 2 * amp[i], jy = (hash(bf * 7.3 + i * 5.9 + f.seed * 1.3) - 0.5) * 2 * amp[i];
        J[ks[i]] = [J[ks[i]][0] + jx, J[ks[i]][1] + jy];
      }
    }
    J.fv = fv; J.name = name; J.talk = o; J.bf = st.boil ? Math.floor(t * BOIL_FPS + 1e-6) : 0;
    if (name === "panic") J.shake = 1.1 * Math.sin(t * 61) + 0.6 * Math.sin(t * 37);
    return J;
  }
  function figBox(f, t) {
    var J = skelAt(f, t), p = f.tr.val(t), sc = f.sc;
    var ptsL = [J.sh, J.hip, J.eA, J.hA, J.eB, J.hB, J.kA, J.fA, J.kB, J.fB], x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    ptsL.forEach(function (q) { x0 = Math.min(x0, q[0] - 2); x1 = Math.max(x1, q[0] + 2); y0 = Math.min(y0, q[1] - 2); y1 = Math.max(y1, q[1] + 2); });
    var ex = f.cd.hat ? 1.75 : f.cd.bun || f.cd.beret ? 1.45 : f.cd.tuft ? 1.6 : 1.05;
    x0 = Math.min(x0, J.head[0] - HR * (f.cd.pony || f.cd.hat ? 1.4 : 1.05)); x1 = Math.max(x1, J.head[0] + HR * (f.cd.pony || f.cd.hat ? 1.4 : 1.05));
    y0 = Math.min(y0, J.head[1] - HR * ex); y1 = Math.max(y1, J.head[1] + HR);
    return { x: p.x + x0 * sc, y: p.y + y0 * sc, w: (x1 - x0) * sc, h: (y1 - y0) * sc };
  }
  // head-local point (lx right, ly down, in head radii) -> rig coords
  function HL(J, lx, ly) { var hu = J.hu, hr = [-hu[1], hu[0]]; return [J.head[0] + hr[0] * lx * HR - hu[0] * ly * HR, J.head[1] + hr[1] * lx * HR - hu[1] * ly * HR]; }
  function plen(list) { var L = 0; for (var i = 1; i < list.length; i++) { var dx = list[i][0] - list[i - 1][0], dy = list[i][1] - list[i - 1][1]; L += Math.sqrt(dx * dx + dy * dy); } return L; }
  function setPart(e, d, len, prog) {
    if (!e) return;
    if (prog <= 0) { showEl(e, false); return; }
    showEl(e, true);
    setA(e, "d", d);
    setS(e, "strokeDasharray", prog >= 1 ? "none" : (prog * len).toFixed(2) + " " + (len + 6).toFixed(1));
  }
  function pr(dp, a, b) { return clamp((dp - a) / (b - a), 0, 1); }
  function updFigure(f, t) {
    var op = f.op ? f.op.val(t) : 1, on = t >= f.at && op > 0.004;
    showEl(f.g, on);
    if (!on) return;
    var J = skelAt(f, t), p = f.tr.val(t), sc = f.sc, el = f.el, cd = f.cd;
    var jx = J.shake || 0;
    setA(f.g, "transform", "translate(" + f2(p.x + jx * sc) + " " + f2(p.y) + ") scale(" + sc.toFixed(4) + ")");
    if (f.op) setS(f.g, "opacity", op.toFixed(3));
    var dp = (t - f.at) / f.drawDur;
    var pHead = pr(dp, 0, 0.3), pBody = pr(dp, 0.22, 0.42), pLeg = pr(dp, 0.38, 0.62), pArm = pr(dp, 0.58, 0.82), pFace = pr(dp, 0.78, 1);
    var legA = [J.hip, J.kA, J.fA], legB = [J.hip, J.kB, J.fB], armA = [J.sh, J.eA, J.hA], armB = [J.sh, J.eB, J.hB], body = [J.neck, J.hip];
    setPart(el.legA, poly(legA), plen(legA), pLeg);
    setPart(el.legB, poly(legB), plen(legB), pLeg);
    setPart(el.body, poly(body), plen(body), pBody);
    setPart(el.armA, poly(armA), plen(armA), pArm);
    setPart(el.armB, poly(armB), plen(armB), pArm);
    // head: a slightly uneven circle that boils
    var hp = [], b1 = hash(J.bf * 3.3 + f.seed) * 6.28, b2 = hash(J.bf * 5.1 + f.seed) * 6.28;
    for (var i = 0; i < 18; i++) {
      var a = (i / 18) * 2 * PI - PI / 2, r = HR * (1 + 0.022 * Math.sin(2 * a + b1) + 0.016 * Math.sin(3 * a + b2));
      hp.push([J.head[0] + Math.cos(a) * r, J.head[1] + Math.sin(a) * r]);
    }
    var hd = smoothD(hp, true);
    setPart(el.head, hd, 2 * PI * HR, pHead);
    showEl(el.headFill, pHead > 0.98);
    if (pHead > 0.98) setA(el.headFill, "d", hd);
    var fv = J.fv, fs = J.fs, af = Math.abs(fv);
    // accessories
    if (el.tuft) {
      var tf = [HL(J, -0.05 - 0.1 * fv, -0.98), HL(J, -0.3 - 0.1 * fv, -1.42), HL(J, 0.12 - 0.1 * fv, -1.66), HL(J, 0.3 - 0.1 * fv, -1.34), HL(J, 0.06 - 0.1 * fv, -1.22)];
      setPart(el.tuft, smoothD(tf), plen(tf) * 1.15, pFace);
    }
    if (el.hat) {
      var hb = [HL(J, -0.78, -0.62), HL(J, -0.8, -1.25), HL(J, -0.35, -1.7), HL(J, 0.35, -1.7), HL(J, 0.8, -1.25), HL(J, 0.78, -0.62)];
      setPart(el.hat, smoothD(hb) + " Z", plen(hb) * 1.3, pFace);
      var br = [HL(J, -1.32, -0.56 + 0.04 * fv), HL(J, 0, -0.66), HL(J, 1.32, -0.56 - 0.04 * fv)];
      setPart(el.brim, smoothD(br), plen(br), pFace);
    }
    if (el.beret) {
      var bc = [0.22 * fs * af + 0.05, -1.0], bt = [];
      for (var q = 0; q < 12; q++) { var aa = (q / 12) * 2 * PI, rx = 1.0, ry = 0.34, tilt = rad(-12 * (fs || 1)); var lx = Math.cos(aa) * rx, ly = Math.sin(aa) * ry; bt.push(HL(J, bc[0] + lx * Math.cos(tilt) - ly * Math.sin(tilt), bc[1] + lx * Math.sin(tilt) + ly * Math.cos(tilt))); }
      setPart(el.beret, smoothD(bt, true), plen(bt) * 1.1, pFace);
      var sk = [HL(J, bc[0] + 0.05, bc[1] - 0.3), HL(J, bc[0] + 0.12, bc[1] - 0.55)];
      setPart(el.stalk, poly(sk), plen(sk), pFace);
    }
    if (el.bun) {
      var bnc = HL(J, -0.62 * fv, -1.02 - 0.12 * (1 - af)), bnr = HR * 0.42, bn = [];
      for (var q2 = 0; q2 < 12; q2++) { var ab = (q2 / 12) * 2 * PI; bn.push([bnc[0] + Math.cos(ab) * bnr, bnc[1] + Math.sin(ab) * bnr]); }
      setPart(el.bun, smoothD(bn, true), 2 * PI * bnr, pFace);
    }
    if (el.pony) {
      var sw = 0.16 * Math.sin(t * 3.4 + f.seed) + (f.tr.moving(t) ? 0.12 * Math.sin(t * 9) : 0), side = af > 0.3 ? -fs : -1;
      var pp = [HL(J, side * 0.7, -0.62), HL(J, side * 1.25, -0.35), HL(J, side * (1.42 + sw), 0.35), HL(J, side * (1.3 + sw * 1.6), 1.1)];
      setPart(el.pony, smoothD(pp), plen(pp) * 1.1, pFace);
      var ti = HL(J, side * 0.98, -0.52);
      setPart(el.tie, "M" + f2(ti[0]) + " " + f2(ti[1]) + " L" + f2(ti[0] + 0.01) + " " + f2(ti[1] + 0.01), 0.1, pFace);
    }
    // face
    var ex = exprAt(f, t), nm = J.name, o = J.talk;
    var blink = ((t + f.seed * 0.71) % 3.7) < 0.11 && dp > 1.1;
    var ox = fv * 0.34, spc = 0.34 - 0.1 * af, ey = -0.14 + (POSES[nm] && POSES[nm].look ? -0.12 : 0), lk = POSES[nm] && POSES[nm].look ? 0.08 * fs : 0;
    var eyeD = "", browD = "", mouthD = "", glD = "", eyeKind = "dot";
    if (!cd.blank) {
      var eL = [ox - spc + lk, ey], eR = [ox + spc + lk, ey];
      eyeKind = blink || ex === "sleepy" || ex === "shut" ? "line" : ex === "surprised" || ex === "scream" ? "ring" : ex === "dizzy" ? "x" : "dot";
      [eL, eR].forEach(function (e) {
        var c = HL(J, e[0], e[1]);
        if (eyeKind === "dot") eyeD += "M" + f2(c[0]) + " " + f2(c[1]) + " L" + f2(c[0] + 0.01) + " " + f2(c[1] + 0.35);
        else if (eyeKind === "line") { var a1 = HL(J, e[0] - 0.13, e[1] + 0.02), a2 = HL(J, e[0] + 0.13, e[1] + 0.02); eyeD += "M" + f2(a1[0]) + " " + f2(a1[1]) + " L" + f2(a2[0]) + " " + f2(a2[1]); }
        else if (eyeKind === "ring") eyeD += circ(c[0], c[1], HR * 0.12);
        else { var x1 = HL(J, e[0] - 0.11, e[1] - 0.11), x2 = HL(J, e[0] + 0.11, e[1] + 0.11), x3 = HL(J, e[0] + 0.11, e[1] - 0.11), x4 = HL(J, e[0] - 0.11, e[1] + 0.11); eyeD += poly([x1, x2]) + " " + poly([x3, x4]); }
        if (cd.glasses) glD += circ(c[0], c[1], HR * 0.22) + " ";
      });
      if (cd.glasses) { var g1 = HL(J, eL[0] + 0.22, eL[1]), g2 = HL(J, eR[0] - 0.22, eR[1]); if (eR[0] - eL[0] > 0.46) glD += poly([g1, g2]); }
      if (ex === "angry") browD = poly([HL(J, eL[0] - 0.16, ey - 0.3), HL(J, eL[0] + 0.12, ey - 0.18)]) + " " + poly([HL(J, eR[0] + 0.16, ey - 0.3), HL(J, eR[0] - 0.12, ey - 0.18)]);
      else if (ex === "worried" || ex === "scream") browD = poly([HL(J, eL[0] - 0.15, ey - 0.2), HL(J, eL[0] + 0.12, ey - 0.33)]) + " " + poly([HL(J, eR[0] + 0.15, ey - 0.2), HL(J, eR[0] - 0.12, ey - 0.33)]);
      else if (ex === "surprised") browD = poly([HL(J, eL[0] - 0.12, ey - 0.36), HL(J, eL[0] + 0.12, ey - 0.38)]) + " " + poly([HL(J, eR[0] - 0.12, ey - 0.38), HL(J, eR[0] + 0.12, ey - 0.36)]);
      var mx = ox + lk * 0.5, my = 0.42, mw = 0.27;
      function M_(list) { return smoothD(list.map(function (q) { return HL(J, mx + q[0], my + q[1]); })); }
      if (o > 0.06 && ex !== "scream") {
        var ry = 0.05 + 0.17 * o, rx = 0.13 + 0.05 * o, ml = [];
        for (var k = 0; k < 10; k++) { var am = (k / 10) * 2 * PI; ml.push(HL(J, mx + Math.cos(am) * rx, my + 0.03 + Math.sin(am) * ry)); }
        mouthD = smoothD(ml, true);
      } else if (ex === "smile") mouthD = M_([[-mw, -0.04], [0, 0.12], [mw, -0.04]]);
      else if (ex === "grin") mouthD = M_([[-0.32, -0.04], [0.32, -0.04]]) + " " + M_([[-0.32, -0.04], [-0.18, 0.16], [0, 0.22], [0.18, 0.16], [0.32, -0.04]]);
      else if (ex === "frown" || ex === "angry") mouthD = M_([[-mw, 0.12], [0, -0.03], [mw, 0.12]]);
      else if (ex === "o" || ex === "sleepy") mouthD = circ(HL(J, mx, my + 0.04)[0], HL(J, mx, my + 0.04)[1], HR * 0.09);
      else if (ex === "surprised") mouthD = circ(HL(J, mx, my + 0.06)[0], HL(J, mx, my + 0.06)[1], HR * 0.14);
      else if (ex === "scream") { var sl = []; for (var k2 = 0; k2 < 12; k2++) { var as = (k2 / 12) * 2 * PI; sl.push(HL(J, mx + Math.cos(as) * 0.2, my + 0.08 + Math.sin(as) * (0.24 + 0.04 * Math.sin(t * 30)))); } mouthD = smoothD(sl, true); }
      else if (ex === "smirk") mouthD = M_([[-0.24 * fs, 0.02], [0.02 * fs, 0.06], [0.26 * fs, -0.1]]);
      else if (ex === "worried" || ex === "dizzy") mouthD = M_([[-0.28, 0.06], [-0.14, -0.02], [0, 0.06], [0.14, -0.02], [0.28, 0.06]]);
      else if (ex === "flat" || ex === "shut") mouthD = M_([[-0.24, 0.03], [0.24, 0.03]]);
      else mouthD = M_([[-0.2, 0.02], [0, 0.05], [0.2, 0.02]]);
    }
    var faceOn = pFace > 0.5;
    showEl(el.eyes, faceOn && !!eyeD); if (faceOn && eyeD) { setA(el.eyes, "d", eyeD); setA(el.eyes, "stroke-width", f2(f.lwl * (eyeKind === "dot" ? 1.7 : 0.85))); }
    showEl(el.brows, faceOn && !!browD); if (faceOn && browD) setA(el.brows, "d", browD);
    showEl(el.mouth, faceOn && !!mouthD); if (faceOn && mouthD) setA(el.mouth, "d", mouthD);
    if (el.glasses) { showEl(el.glasses, faceOn && !!glD); if (faceOn && glD) setA(el.glasses, "d", glD); }
  }

  // ------------------------- marks, speech, thought clouds -------------------------
  function markOn(f, kind, at, dur) {
    var s = ensure(), k = markKey(kind);
    if (!k) return null;
    var def = MK[k], hd = f.head(at), fs = hd.side || 1;
    var size = def.size * hd.r, sc = size / 100;
    var pc = newPiece(s.L.fx, "sf-mark");
    var segs = [], lw = clamp(size * 0.06, u(2.6), u(5.2)) * (k === "burst" ? 1 : 1);
    if (def.doodle) {
      var Ld = localDoodle(def.doodle);
      Ld.parts.forEach(function (q) { if (q.solid) return; var m = mat(0, 0, sc, 0, false, 50, 50); segs.push(mkStroke(applyM(m, q.pts), { color: q.a ? COL.accent : COL.ink, width: lw * q.w, parent: pc.g })); });
    } else {
      def.s.forEach(function (q) {
        var m = mat(0, 0, sc, 0, fs < 0 && k !== "burst" && k !== "dizzy", 50, 50);
        splitD(q.d).forEach(function (sd) { segs.push(mkStroke(applyM(m, sample(sd, 2)), { color: q.c === "accent" ? COL.accent : COL.ink, width: lw * (q.w || 1), parent: pc.g })); });
      });
    }
    var d0 = num(dur, k === "dizzy" || k === "zzz" ? 2.4 : 1.8);
    var times = schedule(segs, { at: at, dur: 0.24 }, 0.24);
    var pos = def.pos;
    pc.c0 = [0, 0];
    pc.follow(function (t) {
      var h2 = f.head(t), rise = def.rise ? -((t - at) % 1.6) * h2.r * 0.5 : 0;
      return [h2.x + pos[0] * fs * h2.r, h2.y + pos[1] * h2.r + rise, 0];
    }, 0);
    pc.fade(0, at + d0, 0.15);
    var it = { x: -size / 2, y: -size / 2, w: size, h: size, t0: times.t0, t1: times.t1, piece: pc };
    s.items.push({ kind: "mark", label: k, it: it, follow: true });
    return it;
  }
  function sayOn(f, text, o) {
    o = obj(o);
    var s = ensure();
    var t0 = o.at != null ? num(o.at, s.cursor) : s.any ? s.cursor + GAP : s.cursor;
    var hd = f.head(t0), sa = safe(), fs = hd.side || 1;
    var size = num(o.size, u(44)), maxW = num(o.maxWidth, P ? sa.w * 0.6 : W * 0.3), maxL = num(o.maxLines, 3);
    var m = measureBlock(text, { size: size, maxWidth: maxW, maxLines: maxL });
    var x = num(o.x, hd.x + fs * (m.w * 0.22 + f.h * 0.1)), y = num(o.y, hd.top - u(54) - m.h / 2);
    if (o.x == null) x = clamp(x, sa.x0 + m.w / 2, sa.x1 - m.w / 2);
    if (o.y == null) y = clamp(y, sa.y0 + m.h / 2, sa.y1 - m.h / 2);
    var bubble = o.style === "bubble", pad = bubble ? size * 0.55 : 0;
    var tb = { x: x - m.w / 2 - pad, y: y - m.h / 2 - pad * 0.8, w: m.w + 2 * pad, h: m.h + 1.6 * pad };
    var hc = { x: hd.x, y: hd.y };
    var dx = hc.x - (tb.x + tb.w / 2), dy = hc.y - (tb.y + tb.h / 2);
    var a, b, above = tb.y + tb.h <= hd.top - u(6);
    if (above) {
      b = [hd.x + clamp(tb.x + tb.w / 2 - hd.x, -hd.r * 0.5, hd.r * 0.5), hd.top - u(10)];
      a = [clamp(b[0] + (tb.x + tb.w / 2 - b[0]) * 0.25, tb.x + u(12), tb.x + tb.w - u(12)), tb.y + tb.h + u(6)];
    } else {
      a = edgePoint(tb, [hc.x, hc.y], u(10));
      var hl = Math.sqrt((a[0] - hc.x) * (a[0] - hc.x) + (a[1] - hc.y) * (a[1] - hc.y)) || 1;
      var bgap = (hd.y - hd.top) + u(10);
      b = [hc.x + ((a[0] - hc.x) / hl) * bgap, hc.y + ((a[1] - hc.y) / hl) * bgap];
    }
    var parts = [], tail = null, bub = null, tEnd = t0;
    if (bubble) {
      var cx = tb.x + tb.w / 2, cy = tb.y + tb.h / 2, rx = tb.w / 2 * 1.08, ry = tb.h / 2 * 1.12, bp = [];
      for (var i = 0; i <= 40; i++) { var an = (i / 40) * 2 * PI + 0.4; bp.push(cx + Math.cos(an) * rx, cy + Math.sin(an) * ry); }
      bub = strokesJob([bp], { at: t0, layer: o.layer || "front", until: o.until }, 0.4, COL.ink, penW(0.95), "bubble");
      tEnd = bub.t1;
      a = above ? [a[0], cy + ry] : edgePoint({ x: cx - rx, y: cy - ry, w: 2 * rx, h: 2 * ry }, [hc.x, hc.y], 0);
    }
    var tl = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
    if (tl > u(18) && (dx * (b[0] - a[0]) + dy * (b[1] - a[1])) > 0) {
      var mx = (a[0] + b[0]) / 2 + (b[1] - a[1]) * 0.12 * fs, my = (a[1] + b[1]) / 2 - (b[0] - a[0]) * 0.12 * fs;
      tail = strokesJob([sample("M" + a[0] + " " + a[1] + " Q" + mx + " " + my + " " + b[0] + " " + b[1], 3)], { at: bubble ? tEnd : t0, layer: o.layer || "front", until: o.until, noInspect: true }, 0.16, COL.ink, penW(0.9), "tail");
      tEnd = tail.t1;
    }
    var ti = write(text, { x: x, y: y, size: size, maxWidth: maxW, maxLines: maxL, at: tEnd + 0.02, dur: o.dur, color: o.color, until: o.until, layer: o.layer || "front" });
    ti.tail = tail; ti.bubble = bub;
    if (bub) { ti.x = tb.x; ti.y = tb.y; ti.w = tb.w; ti.h = tb.h; }
    return ti;
  }
  function thinkOn(f, rect, o) {
    o = obj(o);
    var s = ensure();
    var t0 = o.at != null ? num(o.at, s.cursor) : s.any ? s.cursor + GAP : s.cursor;
    var r = rectOf(rect), hd = f.head(t0);
    var cx = r.x + r.w / 2, cy = r.y + r.h / 2, rx = r.w / 2, ry = r.h / 2;
    var bumpR = clamp(Math.min(rx, ry) * 0.2, u(24), u(62));
    var bx = rx - bumpR * 0.95, by = ry - bumpR * 0.95;
    var per = PI * (3 * (bx + by) - Math.sqrt((3 * bx + by) * (bx + 3 * by)));
    var nb = clamp(Math.round(per / (bumpR * 1.75)), 8, 28), i, d = "", ptsC = [];
    for (i = 0; i <= nb; i++) { var a0 = (i / nb) * 2 * PI - PI / 2 + (i % nb ? 0.06 * Math.sin(i * 2.7) : 0); ptsC.push([cx + Math.cos(a0) * bx, cy + Math.sin(a0) * by]); }
    for (i = 0; i < nb; i++) {
      var q0 = ptsC[i], q1 = ptsC[i + 1], ch = Math.sqrt((q1[0] - q0[0]) * (q1[0] - q0[0]) + (q1[1] - q0[1]) * (q1[1] - q0[1])), ar = ch * (0.56 + 0.06 * Math.sin(i * 1.9));
      if (!i) d = "M" + f2(q0[0]) + " " + f2(q0[1]);
      d += " A" + f2(ar) + " " + f2(ar) + " 0 0 1 " + f2(q1[0]) + " " + f2(q1[1]);
    }
    rx = bx + bumpR * 0.7; ry = by + bumpR * 0.7;
    // bubbles from the head to the cloud
    var dx = cx - hd.x, dy = cy - hd.y, L = Math.sqrt(dx * dx + dy * dy) || 1;
    var k = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry)) * 0.92;
    var edge = [cx - dx * k, cy - dy * k], start = [hd.x + (dx / L) * hd.r * 1.5, hd.y + (dy / L) * hd.r * 1.5];
    var bubs = [], rads = [u(8), u(12), u(17)];
    var sl = Math.sqrt((edge[0] - start[0]) * (edge[0] - start[0]) + (edge[1] - start[1]) * (edge[1] - start[1]));
    if (sl > u(30)) {
      [0.12, 0.42, 0.75].forEach(function (q, j) {
        var bx = lerp(start[0], edge[0], q), by = lerp(start[1], edge[1], q);
        bubs.push(strokesJob([sample(circ(bx, by, rads[j]), 2)], { at: t0 + j * 0.12, dur: 0.12, layer: o.layer || "front", noInspect: true }, 0.12, COL.ink, penW(0.9), "bubble"));
      });
    }
    var cloud = strokesJob([sample(d, 3)], { at: t0 + (bubs.length ? 0.38 : 0), dur: num(o.dur, 0.9), layer: o.layer || "front", wobble: u(1.4) }, 0.9, COL.ink, penW(1.0), "cloud");
    var inner = { x: cx - bx * 0.76, y: cy - by * 0.7, w: bx * 1.52, h: by * 1.4 };
    inner.cx = inner.x + inner.w / 2; inner.cy = inner.y + inner.h / 2; inner.t1 = cloud.t1; inner.t0 = t0; inner.cloud = cloud;
    return inner;
  }

  // ------------------------- template helpers -------------------------
  function T(p) { return p && typeof p === "object" ? p : {}; }
  function oneOf(v, list, d) { v = str(v).toLowerCase(); return list.indexOf(v) >= 0 ? v : d; }
  // A heading at the top of the safe area: measure now, draw later.
  function heading(text, o) {
    o = o || {};
    var sa = safe(), size = num(o.size, u(P ? 64 : 60)), maxW = num(o.maxWidth, sa.w * 0.9), ml = o.maxLines || 2;
    var m = text ? measureBlock(text, { size: size, maxWidth: maxW, maxLines: ml }) : { w: 0, h: 0 };
    var x = num(o.x, sa.cx), y = num(o.y, sa.y0 + u(8) + m.h / 2);
    return {
      m: m, bottom: text ? y + m.h / 2 : sa.y0, top: y - m.h / 2,
      draw: function (at, dur) { return text ? write(text, { x: x, y: y, size: size, maxWidth: maxW, maxLines: ml, at: at, dur: dur != null ? dur : Math.min(textDur(text), o.maxDur || 1.2), color: o.color, caps: o.caps }) : null; },
    };
  }
  function presenter(key, x, feet, h, o) {
    o = o || {};
    var f = makeFigure(key, { x: x, y: feet, h: h, facing: o.facing || "right", at: o.at != null ? o.at : 0.1, drawDur: o.drawDur || 0.75, pose: o.pose });
    if (o.talk !== false) f.talk(0.2, D - 0.2);
    return f;
  }
  function act(f, name, at) {
    var k = str(name).toLowerCase();
    if (!k || !f) return;
    at = Math.max(0, at);
    if (k === "jump" || k === "jumping") { f.jump(at, 0.3, Math.min(0.8, Math.max(0.45, D - at - 0.15))); f.expr("grin", at); return; }
    if (k === "fall" || k === "fallen" || k === "falling") { f.fall(at, Math.min(0.6, Math.max(0.3, D - at - 0.3))); return; }
    if (k === "walk") return;
    f.pose(k, at);
  }
  function endBeat(min) { return Math.max(min || 0.4, D - 1.35); }
  function fitBox(cx, cy, w, h, sa) { var m = u(20); return [clamp(cx, sa.x0 + m + w / 2, sa.x1 - m - w / 2), clamp(cy, sa.y0 + m + h / 2, sa.y1 - m - h / 2)]; }

  var TPL = {};

  // ------------------------- figure-explains -------------------------
  TPL["figure-explains"] = function (root, p) {
    paper(root);
    var sa = safe(), key = castKey(p.character) || "pip";
    var label = str(p.label), name = doodleName(p.doodle || label), says = str(p.says);
    var notes = arr(p.notes).map(str).filter(Boolean).slice(0, 3);
    var poseAfter = poseKey(p.pose || "explain"), endPose = str(p.endPose);
    var hd = heading(str(p.title)), top = hd.bottom + (p.title ? u(P ? 44 : 30) : 0);
    var lo = { size: u(P ? 54 : 52), maxWidth: P ? sa.w * 0.9 : sa.w * 0.42, maxLines: 2 };
    var lm = label ? measureBlock(label, lo) : { w: 0, h: 0 };
    var no = { size: u(P ? 34 : 36), maxLines: 3 };
    var so = { size: u(P ? 42 : 42), maxLines: 3 };
    var FH, fx, feet = sa.y1 - u(10), dS, dX, dY, lY, noteSpots = [], sx, sy, sm;
    if (!P) {
      so.maxWidth = sa.w * 0.27;
      sm = says ? measureBlock(says, so) : { w: 0, h: 0 };
      var avail = feet - top;
      FH = Math.min(avail * 0.86, says ? avail - sm.h - u(90) : avail * 0.86, sa.h * 0.8);
      FH = Math.max(FH, sa.h * 0.42);
      fx = sa.x0 + FH * 0.3;
      var aL = fx + FH * 0.36, aR = sa.x1, ncw = notes.length ? Math.min(u(400), (aR - aL) * 0.34) : 0;
      var zR = aR - (ncw ? ncw + u(50) : 0), zW = zR - aL;
      dS = Math.min(zW * 0.86, (feet - top - (label ? lm.h + u(36) : 0)) * 0.9, sa.h * 0.66);
      dX = aL + zW / 2;
      var blockH = dS + (label ? u(36) + lm.h : 0), bTop = top + Math.max(0, (feet - top - blockH) / 2);
      dY = bTop + dS / 2; lY = dY + dS / 2 + u(36) + lm.h / 2;
      no.maxWidth = ncw;
      notes.forEach(function (n, i) {
        var nn = notes.length, yy = nn === 1 ? dY - dS * 0.18 : dY - dS * 0.36 + (i * dS * 0.72) / (nn - 1);
        noteSpots.push([aR - ncw / 2, yy]);
      });
      sx = fx + FH * 0.1 + sm.w / 2; sy = feet - FH - u(64) - sm.h / 2;
      sx = clamp(sx, sa.x0 + sm.w / 2, sa.x1 - sm.w / 2); sy = Math.max(sy, top + sm.h / 2);
    } else {
      FH = Math.min(sa.h * 0.42, u(520));
      fx = sa.x0 + FH * 0.32;
      so.maxWidth = sa.x1 - (fx + FH * 0.2) - u(10);
      sm = says ? measureBlock(says, so) : { w: 0, h: 0 };
      var headTop = feet - FH * 1.02;
      var zoneB = Math.min(headTop, says ? headTop - u(10) : headTop) - u(46);
      var sideW = notes.length ? Math.min(u(230), sa.w * 0.25) : 0;
      dS = Math.min(sa.w - (sideW ? 2 * sideW + u(30) : 0), (zoneB - top - (label ? lm.h + u(34) : 0)) * 0.92, sa.w * 0.74);
      dX = sa.cx;
      var bH = dS + (label ? u(34) + lm.h : 0), bT = top + Math.max(0, (zoneB - top - bH) / 2);
      dY = bT + dS / 2; lY = dY + dS / 2 + u(34) + lm.h / 2;
      no.maxWidth = sideW;
      var spotsT = [[sa.x0 + sideW / 2, dY - dS * 0.3], [sa.x1 - sideW / 2, dY - dS * 0.3], [sa.x1 - sideW / 2, dY + dS * 0.25]];
      notes.forEach(function (n, i) { noteSpots.push(spotsT[i]); });
      sx = fx + FH * 0.26 + sm.w / 2 + u(16); sy = headTop + FH * 0.12 + sm.h / 2;
      sx = clamp(sx, sa.x0 + sm.w / 2, sa.x1 - sm.w / 2);
    }
    // timing: the doodle lands on its key word
    var tD = labelTime(label, p.keyword, 0);
    if (tD == null) tD = Math.min(1.6, D * 0.3);
    tD = clamp(tD, 0.95, Math.max(0.95, lastBeat() - 1.2));
    var fig = presenter(key, fx, feet, FH, { facing: "right" });
    hd.draw(0.3);
    if (tD > 2.4) fig.pose("talk", 1.0);
    var dDur = clamp(doodleDur(name, dS) * 0.9, 0.7, 1.3), dStart = Math.max(0.35, tD - 0.45);
    var di = doodle(name, { x: dX, y: dY, size: dS, at: dStart, dur: dDur, accent: !!p.accent });
    fig.pointAt({ x: dX - dS * 0.15, y: dY }, Math.max(0.9, tD - 0.3));
    var cur = di.t1;
    var li = null;
    if (label) { li = write(label, Object.assign({ x: dX, y: lY, at: cur + 0.05, dur: Math.min(textDur(label), 1.3) }, lo)); cur = li.t1; }
    if (poseAfter !== "point") fig.pose(poseAfter, Math.min(cur + 0.5, lastBeat()));
    // notes with arrows
    var prevT = tD, lands = notes.map(function (n) { var t = labelTime(n, null, prevT); if (t != null && t > prevT) prevT = t; else t = null; return t; });
    lands = spread(lands, cur + 0.2, lastBeat() - 0.6);
    var nEnd = cur, ni = [];
    notes.forEach(function (n, i) {
      var spot = noteSpots[i], st0 = Math.max(nEnd + 0.08, lands[i] - 0.25);
      var mm = measureBlock(n, Object.assign({}, no));
      var c = fitBox(spot[0], spot[1], mm.w, mm.h, sa);
      if (li && Math.abs(c[1] - lY) < (mm.h + lm.h) / 2 + u(8) && Math.abs(c[0] - dX) < (mm.w + lm.w) / 2 + u(8)) c[1] = lY - (mm.h + lm.h) / 2 - u(14);
      var ti = write(n, Object.assign({ x: c[0], y: c[1], at: st0, dur: Math.min(textDur(n), 1.1) }, no));
      var tx = clamp(c[0], di.x + di.w * 0.2, di.x + di.w * 0.8), ty = clamp(c[1], di.y + di.h * 0.18, di.y + di.h * 0.82);
      var ar = arrow(ti, { x: tx, y: ty, w: 0, h: 0 }, { at: ti.t1 + 0.04, pad: u(8), padFrom: u(10), bend: c[1] < dY ? 0.25 : -0.25, toPt: edgePoint({ x: di.x, y: di.y, w: di.w, h: di.h }, [c[0], c[1]], u(10)) });
      nEnd = ar.t1;
      ni.push(ti);
    });
    if (says) {
      var tS = labelTime(says, null, 0);
      tS = tS == null ? Math.max(nEnd + 0.15, D * 0.45) : tS - 0.2;
      tS = clamp(tS, fig.at + fig.drawDur + 0.1, Math.max(fig.at + 1, lastBeat() - textDur(says) - 0.2));
      fig.say(says, Object.assign({ x: sx, y: sy, at: tS }, so));
    }
    if (endPose) act(fig, endPose, endBeat(Math.max(cur, nEnd) + 0.2));
  };

  // ------------------------- conversation -------------------------
  var MOOD = { neutral: "talk", explain: "explain", excited: "celebrate", confused: "shrug", annoyed: "crossed", panic: "panic", smug: "smug", sad: "sad", thinking: "think", pointing: "point", celebrate: "celebrate", surprised: "stand" };
  var MOOD_MARK = { confused: "question", annoyed: "anger", excited: "exclaim", surprised: "exclaim", thinking: null, celebrate: "sparkle", sad: null };
  var MOOD_EXPR = { annoyed: "angry", surprised: "surprised", excited: "grin", sad: "frown", confused: "worried" };
  TPL.conversation = function (root, p) {
    paper(root);
    var sa = safe();
    var lk = castKey(p.left) || "hank", rk = castKey(p.right) || "ada";
    if (rk === lk) rk = lk === "ada" ? "juno" : "ada";
    var lines = arr(p.lines).filter(function (l) { return l && str(l.text); }).slice(0, 6);
    if (!lines.length) lines = [{ speaker: "left", text: contentWords(V.narration).slice(0, 6).join(" ") || "Hmm." }];
    var hd = heading(str(p.title), { size: u(P ? 54 : 50), maxLines: 1 });
    var top = hd.bottom + (p.title ? u(30) : 0);
    var xL = P ? W * 0.27 : W * 0.31, xR = P ? W * 0.73 : W * 0.69, feet = sa.y1 - u(10);
    var FH = P ? Math.min(sa.h * 0.54, u(650)) : Math.min(sa.h * 0.6, u(580));
    var headTop = feet - FH * 1.05;
    var mw = P ? sa.w * 0.5 : W * 0.34, zoneH = headTop - u(60) - top;
    var size = u(P ? 54 : 50), ml = 4;
    lines.forEach(function (l) { var m = measureBlock(l.text, { size: size, maxWidth: mw, maxLines: ml }); if (m.h > zoneH) size = Math.max(u(28), (size * zoneH) / m.h); });
    var left = presenter(lk, xL, feet, FH, { facing: "right", at: 0.1, talk: false });
    var right = presenter(rk, xR, feet, FH, { facing: "left", at: 0.28, talk: false });
    hd.draw(0.35, 0.8);
    var wins = lineWindows(lines.map(function (l) { return l.text; }));
    var minStart = 0.75;
    wins.forEach(function (w, i) {
      w.start = Math.max(w.start, i ? wins[i - 1].start + 0.6 : minStart);
      w.end = Math.max(w.end, w.start + 0.4);
    });
    var lastEnd = 0;
    lines.forEach(function (l, i) {
      var who = l.speaker === "right" ? "right" : "left", sp = who === "left" ? left : right, ls = who === "left" ? right : left;
      var w = wins[i], t0 = clamp(w.start - 0.3, 0.45, lastBeat() - 0.4);
      var nextSame = null;
      for (var j = i + 1; j < lines.length; j++) if ((lines[j].speaker === "right" ? "right" : "left") === who) { nextSame = wins[j].start - 0.35; break; }
      var m = measureBlock(l.text, { size: size, maxWidth: mw, maxLines: ml });
      var cx = who === "left" ? Math.max(sa.x0 + m.w / 2, xL - (P ? 0 : u(30))) : Math.min(sa.x1 - m.w / 2, xR + (P ? 0 : u(30)));
      if (P) cx = who === "left" ? sa.x0 + m.w / 2 + u(4) : sa.x1 - m.w / 2 - u(4);
      var cy = headTop - u(58) - m.h / 2;
      sp.say(l.text, { x: cx, y: cy, size: size, maxWidth: mw, maxLines: ml, at: t0, dur: Math.min(textDur(l.text), Math.max(0.4, w.end - t0)), until: nextSame });
      sp.talk(w.start - 0.05, w.end + 0.1);
      var mood = oneOf(l.mood, Object.keys(MOOD), "neutral"), ps = MOOD[mood];
      if (ps === "point") sp.pointAt(ls.head(t0), t0);
      else sp.pose(ps, Math.max(0.3, t0 - 0.05));
      if (MOOD_EXPR[mood]) sp.expr(MOOD_EXPR[mood], t0);
      if (MOOD_MARK[mood]) sp.mark(MOOD_MARK[mood], t0 + 0.25, 1.5);
      var re = str(l.reaction).toLowerCase();
      if (re && re !== "listen") act(ls, re, Math.min(t0 + 0.45, lastBeat()));
      else ls.pose("listen", Math.max(0.3, t0 + 0.2));
      lastEnd = Math.max(lastEnd, w.end);
    });
    if (p.endPose) { var te = endBeat(lastEnd + 0.3); act(left, p.endPose, te); act(right, p.endPose, te + 0.1); }
  };

  // ------------------------- hand-drawn-graph -------------------------
  TPL["hand-drawn-graph"] = function (root, p) {
    paper(root);
    var sa = safe(), key = castKey(p.character), caption = str(p.caption);
    var hd = heading(str(p.title)), top = hd.bottom + (p.title ? u(26) : 0);
    var co = { size: u(P ? 36 : 34), maxLines: 2, color: "muted" };
    var gx, gy, gw, gh, fx = 0, FH = 0, feet = sa.y1 - u(10), cx, cy;
    if (!P) {
      FH = key ? Math.min(sa.h * 0.5, u(470)) : 0;
      fx = sa.x0 + FH * 0.26;
      gx = key ? fx + FH * 0.5 : sa.x0 + sa.w * 0.04;
      gw = sa.x1 - gx - u(6);
      co.maxWidth = gw * 0.8;
      var cm = caption ? measureBlock(caption, co) : { h: 0 };
      gy = top; gh = sa.y1 - top - (caption ? cm.h + u(24) : 0);
      cx = gx + gw / 2; cy = sa.y1 - u(10) - cm.h / 2;
    } else {
      gx = sa.x0; gw = sa.w; gy = top;
      if (key) {
        FH = Math.min(sa.h * 0.3, u(380));
        gh = feet - FH * 1.08 - u(40) - top;
        fx = sa.x0 + FH * 0.3;
        co.maxWidth = sa.x1 - (fx + FH * 0.42);
        var cm2 = caption ? measureBlock(caption, co) : { w: 0, h: 0 };
        cx = sa.x1 - u(12) - cm2.w / 2; cy = feet - FH * 0.55;
      } else {
        co.maxWidth = sa.w * 0.9;
        var cm3 = caption ? measureBlock(caption, co) : { h: 0 };
        gh = Math.min(sa.h * 0.72, sa.y1 - top - (caption ? cm3.h + u(30) : 0));
        cx = sa.cx; cy = gy + gh + u(30) + cm3.h / 2;
      }
    }
    var n = clamp(arr(p.values).length, 2, 10), labels = arr(p.labels).map(str);
    var tK = labelTime(str(p.title), p.keyword, 0);
    var fig = key ? presenter(key, fx, feet, FH, { facing: "right" }) : null;
    hd.draw(0.25);
    var axesAt = 0.4;
    var dataAt = Math.max(axesAt + 1.5, tK != null ? tK - 0.1 : 1.8);
    dataAt = Math.min(dataAt, Math.max(axesAt + 1.0, lastBeat() - 2.4));
    var lands = null, found = 0;
    if (labels.length) {
      var prev = dataAt;
      lands = [];
      for (var i = 0; i < n; i++) { var t = labels[i] ? kwFind(labels[i], prev) : null; if (t != null && t >= prev - 0.05 && V.find(labels[i], prev) != null) { lands.push(t); prev = t; found++; } else lands.push(null); }
      if (found < 2) lands = null;
      else { lands[0] = lands[0] == null ? dataAt : Math.min(lands[0], dataAt + 0.2); lands = spread(lands, dataAt, lastBeat() - 0.8).map(function (v) { return Math.min(v, lastBeat() - 0.5); }); }
    }
    var anns = arr(p.annotations).filter(function (a) { return a && str(a.text); }).slice(0, 3).map(function (a) {
      var t = a.keyword ? kwFind(a.keyword, dataAt) : labelTime(a.text, null, dataAt);
      return { index: a.index, text: a.text, at: t != null ? Math.min(t - 0.1, lastBeat() - 0.6) : null };
    });
    var gr = graph({ x: gx, y: gy, w: gw, h: gh, type: p.type, values: p.values, labels: labels, xLabel: p.xLabel, yLabel: p.yLabel, highlight: p.highlight, annotations: anns, at: axesAt, dataAt: dataAt, dataDur: clamp(D * 0.3, 1.0, 2.6), lands: lands });
    if (fig) {
      var hi = p.highlight != null && isFinite(+p.highlight) ? clamp(Math.round(+p.highlight), 0, gr.pts.length - 1) : gr.pts.length - 1;
      var tp = gr.hiAt != null ? gr.hiAt : dataAt + 0.4;
      fig.pose("talk", Math.min(1.0, dataAt - 0.4));
      fig.pointAt(gr.pts[hi], clamp(tp - 0.35, 0.9, lastBeat()));
      if (p.endPose) act(fig, p.endPose, endBeat(gr.t1 + 0.2));
      else fig.pose("explain", Math.min(lastBeat(), Math.max(tp + 1.4, gr.t1 + 0.2)));
    }
    if (caption) write(caption, Object.assign({ x: cx, y: cy, at: Math.min(Math.max(gr.t1 + 0.1, D - 1.1 - textDur(caption)), lastBeat() - 0.3), dur: Math.min(textDur(caption), 1.2) }, co));
  };

  // ------------------------- labelled-diagram -------------------------
  var DIRS = { top: [0, -1], "top-right": [1, -1], right: [1, 0], "bottom-right": [1, 1], bottom: [0, 1], "bottom-left": [-1, 1], left: [-1, 0], "top-left": [-1, -1], center: [0, 0] };
  var RING = ["top", "top-right", "right", "bottom-right", "bottom", "bottom-left", "left", "top-left"];
  TPL["labelled-diagram"] = function (root, p) {
    paper(root);
    var sa = safe(), name = doodleName(p.doodle), caption = str(p.caption);
    var labels = arr(p.labels).filter(function (l) { return l && str(l.text); }).slice(0, 6);
    var yah = str(p.youAreHere), hp = oneOf(p.herePosition, Object.keys(DIRS), "bottom-left");
    var hd = heading(str(p.title)), top = hd.bottom + (p.title ? u(30) : 0);
    var co = { size: u(34), maxWidth: sa.w * 0.8, maxLines: 2, color: "muted" };
    var cm = caption ? measureBlock(caption, co) : { h: 0 };
    var bot = sa.y1 - (caption ? cm.h + u(22) : 0);
    var cxD = sa.cx, cyD = (top + bot) / 2, hasSide = false;
    var lsz = u(P ? 36 : 40);
    // assign slots (the you-are-here text takes one too)
    var want = labels.map(function (l) { return oneOf(l.where, Object.keys(DIRS), "center"); });
    var used = {}, slots = [];
    function take(w, pref) {
      if (w !== "center" && !used[w]) { used[w] = 1; return w; }
      var order = pref || RING, i0 = w === "center" ? 0 : RING.indexOf(w);
      for (var d = 1; d < 8; d++) {
        var cand = [RING[(i0 + d) % 8], RING[(i0 - d + 8) % 8]];
        for (var c = 0; c < 2; c++) if (!used[cand[c]]) { used[cand[c]] = 1; return cand[c]; }
      }
      return null;
    }
    var centerPref = ["bottom-right", "right", "top-right", "bottom-left", "left", "top-left", "bottom", "top"];
    want.forEach(function (w, i) {
      if (w === "center") { slots[i] = null; return; }
      slots[i] = take(w);
    });
    want.forEach(function (w, i) { if (w === "center") { for (var c = 0; c < centerPref.length; c++) if (!used[centerPref[c]]) { used[centerPref[c]] = 1; slots[i] = centerPref[c]; break; } } });
    var yahSlot = null;
    if (yah) { yahSlot = used[hp] || hp === "center" ? take(hp === "center" ? "bottom-left" : hp) : (used[hp] = 1, hp); }
    var all = slots.concat(yahSlot ? [yahSlot] : []);
    hasSide = all.some(function (s) { return s && DIRS[s][0] !== 0; });
    var hasTop = all.some(function (s) { return s && DIRS[s][1] < 0; }), hasBot = all.some(function (s) { return s && DIRS[s][1] > 0; });
    var dS, colW, rowH = lsz * 2.6;
    if (!P) {
      colW = hasSide ? Math.min(u(420), sa.w * 0.27) : 0;
      dS = Math.min(bot - top - (all.some(function (s) { return s === "top" || s === "bottom"; }) ? rowH * 1.2 : 0), sa.w - 2 * colW - u(120), sa.h * 0.8);
    } else {
      dS = Math.min(sa.w * (hasSide ? 0.64 : 0.8), bot - top - (hasTop ? rowH + u(30) : 0) - (hasBot ? rowH + u(30) : 0));
      colW = hasSide ? (sa.w - dS) / 2 - u(12) : 0;
      cyD = top + (hasTop ? rowH + u(30) : 0) + (bot - top - (hasTop ? rowH + u(30) : 0) - (hasBot ? rowH + u(30) : 0)) / 2;
    }
    function slotPos(sl) {
      var d = DIRS[sl];
      if (!P) {
        var x = d[0] < 0 ? sa.x0 + colW / 2 : d[0] > 0 ? sa.x1 - colW / 2 : cxD;
        var y = d[0] === 0 ? (d[1] < 0 ? Math.max(top + rowH / 2, cyD - dS / 2 - rowH / 2) : Math.min(bot - rowH / 2, cyD + dS / 2 + rowH / 2)) : cyD + d[1] * dS * 0.36;
        return { x: x, y: y, w: d[0] === 0 ? sa.w * 0.5 : colW };
      }
      if (d[1] === 0) return { x: d[0] < 0 ? sa.x0 + colW / 2 : sa.x1 - colW / 2, y: cyD, w: colW };
      var yy = d[1] < 0 ? cyD - dS / 2 - u(30) - rowH / 2 : cyD + dS / 2 + u(30) + rowH / 2;
      return { x: d[0] < 0 ? sa.x0 + sa.w / 6 : d[0] > 0 ? sa.x1 - sa.w / 6 : sa.cx, y: yy, w: sa.w / 3 - u(16) };
    }
    function partPt(w) { var d = DIRS[w] || [0, 0]; return [cxD + d[0] * dS * 0.27, cyD + d[1] * dS * 0.27]; }
    var tD = labelTime(str(p.title), p.keyword, 0);
    tD = tD == null ? 0.8 : clamp(tD, 0.6, lastBeat() - 2);
    hd.draw(0.2);
    var di = doodle(name, { x: cxD, y: cyD, size: dS, at: Math.max(0.3, tD - 0.5), dur: clamp(doodleDur(name, dS, p.accent), 0.8, 1.6), accent: !!p.accent });
    var prevT = tD, lands = labels.map(function (l) { var t = labelTime(l.text, l.keyword, prevT); if (t != null && t >= prevT) prevT = t; else t = null; return t; });
    lands = spread(lands, di.t1 + 0.2, lastBeat() - (yah ? 1.4 : 0.6));
    var cur = di.t1;
    labels.forEach(function (l, i) {
      var sl = slots[i];
      if (!sl) return;
      var sp = slotPos(sl), m = measureBlock(l.text, { size: lsz, maxWidth: sp.w, maxLines: 3 });
      var c = fitBox(sp.x, sp.y, m.w, m.h, sa);
      var st0 = Math.max(cur + 0.06, lands[i] - 0.25);
      var ti = write(l.text, { x: c[0], y: c[1], size: lsz, maxWidth: sp.w, maxLines: 3, at: st0, dur: Math.min(textDur(l.text), 1.1) });
      var pp = partPt(want[i]);
      var ar = arrow(ti, { x: pp[0], y: pp[1] }, { at: ti.t1 + 0.04, pad: u(6), padFrom: u(12), bend: (i % 2 ? -1 : 1) * 0.2 });
      var dot = mkSolid(circ(pp[0], pp[1], u(5)), COL.ink, ar.piece.g);
      schedule([dot], { at: ar.t1, dur: 0.03 }, 0.03);
      cur = ar.t1;
    });
    if (yah && yahSlot) {
      var th = kwFind("here", Math.max(0, tD));
      var tY = clamp(Math.max(cur + 0.15, th != null ? th - 0.3 : cur + 0.2), cur + 0.1, lastBeat() - 0.7);
      var spY = slotPos(yahSlot), hpP = partPt(hp);
      var my = measureBlock(yah, { size: u(32), maxWidth: Math.min(spY.w, u(280)), maxLines: 2 });
      var cY = fitBox(spY.x, spY.y, my.w, my.h, sa);
      var dl = Math.sqrt((cY[0] - hpP[0]) * (cY[0] - hpP[0]) + (cY[1] - hpP[1]) * (cY[1] - hpP[1])) || 1;
      var y1 = youAreHere(hpP[0], hpP[1], { text: yah, at: tY, dx: (cY[0] - hpP[0]) / dl, dy: (cY[1] - hpP[1]) / dl, dist: dl, maxWidth: Math.min(spY.w, u(280)) });
      cur = y1.t1;
    }
    if (caption) write(caption, Object.assign({ x: sa.cx, y: sa.y1 - cm.h / 2, at: Math.min(cur + 0.15, lastBeat() - 0.4), dur: Math.min(textDur(caption), 1.1) }, co));
  };

  // ------------------------- scale-comparison -------------------------
  // Drawn bounds of a doodle in its 100 box (so items sit on the ground and notes hug their tops).
  function doodleBox(name) {
    var L = localDoodle(name), x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    L.parts.forEach(function (q) { if (!q.pts) return; for (var i = 0; i < q.pts.length; i += 2) { x0 = Math.min(x0, q.pts[i]); x1 = Math.max(x1, q.pts[i]); y0 = Math.min(y0, q.pts[i + 1]); y1 = Math.max(y1, q.pts[i + 1]); } });
    return x1 > x0 ? { x0: x0, y0: y0, x1: x1, y1: y1 } : { x0: 0, y0: 0, x1: 100, y1: 100 };
  }
  TPL["scale-comparison"] = function (root, p) {
    paper(root, { drift: 0 });
    var sa = safe();
    var items = arr(p.items).filter(function (q) { return q && (q.doodle || str(q.label)); }).slice(0, 6);
    if (items.length < 2) items = items.concat([{ doodle: "ant", label: "small" }, { doodle: "mountain", label: "big" }]).slice(0, 2);
    var n = items.length, ratio = clamp(num(p.ratio, 3), 1.8, 4.5), key = castKey(p.character);
    var hdT = str(p.title) ? heading(str(p.title), { size: u(P ? 58 : 54), maxLines: 1 }) : null;
    var S0 = P ? Math.min(sa.w * 0.42, sa.h * 0.26) : sa.h * 0.36;
    var units, xr, topRoom = hdT ? hdT.m.h + u(20) : 0;
    for (var pass = 0; pass < 3; pass++) {
      build();
      var b0 = units[0].box, z0 = Math.min(sa.w / (b0.w * 1.16), (sa.h - topRoom) / (b0.h * 1.16));
      if (Math.abs(z0 - 1) < 0.04) break;
      S0 *= clamp(z0, 0.3, 3);
    }
    function build() {
    units = []; xr = 0;
    items.forEach(function (q, i) {
      var sz = S0 * Math.pow(ratio, i), k = sz / S0, nm = doodleName(q.doodle || q.label), bb = doodleBox(nm);
      var vw = ((bb.x1 - bb.x0) * sz) / 100, vh = ((bb.y1 - bb.y0) * sz) / 100;
      var lab = str(q.label), note = str(q.note);
      var lsz = u(P ? 58 : 50) * k, nsz = u(P ? 46 : 40) * k;
      var lm = lab ? measureBlock(lab, { size: lsz, maxWidth: Math.max(vw, sz * 0.9) * 1.3, maxLines: 2 }) : { w: 0, h: 0 };
      var nmm = note ? measureBlock(note, { size: nsz, maxWidth: Math.max(vw, sz * 0.9) * 1.4, maxLines: 2 }) : { w: 0, h: 0 };
      var wHalf = Math.max(vw, lm.w, nmm.w) / 2;
      var cxv = i ? xr + sz * 0.18 + wHalf : wHalf;
      var gl = u(22) * k;
      units.push({ q: q, nm: nm, sz: sz, k: k, bb: bb, vw: vw, vh: vh, cxv: cxv, lab: lab, note: note, lsz: lsz, nsz: nsz, lm: lm, nmm: nmm, gl: gl,
        box: { x: cxv - wHalf, y: -vh - (note ? nmm.h + gl : 0), w: 2 * wHalf, h: vh + (note ? nmm.h + gl : 0) + (lab ? lm.h + gl : 0) } });
      xr = cxv + wHalf;
    });
    }
    var figU = null;
    if (key) {
      var u0 = units[0], fh = Math.max(u0.vh * 1.05, S0 * 0.8);
      figU = { h: fh, x: u0.box.x - fh * 0.32 };
      units[0].box = unionBox([units[0].box, { x: figU.x - fh * 0.28, y: -fh * 1.08, w: fh * 0.56, h: fh * 1.08 }]);
    }
    function frameOf(i) { var b = []; for (var j = 0; j <= i; j++) b.push(units[j].box); return unionBox(b); }
    function camIn(r, capH) {
      var room = { x: sa.x0, y: sa.y0 + topRoom, w: sa.w, h: sa.h - topRoom - (capH || 0) };
      var z = Math.min(room.w / (r.w * 1.16), room.h / (r.h * 1.16));
      return { cx: r.x + r.w / 2 - (room.x + room.w / 2 - W / 2) / z, cy: r.y + r.h / 2 - (room.y + room.h / 2 - H / 2) / z, z: z };
    }
    st.camTr = new Tr(camIn(frameOf(0)));
    var lands = [], prev = 0;
    units.forEach(function (un) { var t = labelTime(un.lab, un.q.keyword, prev); if (t != null && t >= prev) prev = t; else t = null; lands.push(t); });
    lands[0] = lands[0] == null ? 0.6 : lands[0];
    lands = spread(lands, 0.6, D * 0.72);
    var cap = str(p.caption), capT = cap ? labelTime(cap, null, lands[n - 1]) : null;
    var beats = orderBeats(lands.map(function (t, i) { return i ? t : Math.max(0.5, Math.min(t, 0.9)); }), 1.3, D - (cap ? 3.1 : 2.1));
    if (hdT) write(str(p.title), { x: sa.cx, y: sa.y0 + u(8) + hdT.m.h / 2, size: u(P ? 58 : 54), maxWidth: sa.w * 0.9, maxLines: 1, layer: "hud", at: 0.2, dur: Math.min(1, textDur(str(p.title))) });
    var lastEnd = 0;
    units.forEach(function (un, i) {
      var tb = beats[i], ws = un.k, sz = un.sz;
      if (i) cameraTo(camIn(frameOf(i)), Math.max(0, tb - 0.8), 0.9, "inOutCubic");
      var dStart = i ? tb - 0.1 : Math.max(0.3, tb - 0.35), dDur = clamp(doodleDur(un.nm, sz) * 0.75, 0.55, 0.95);
      var dcx = un.cxv + (50 - (un.bb.x0 + un.bb.x1) / 2) * sz / 100;
      var dcy = -un.vh - (un.bb.y0 * sz) / 100 + sz / 2;
      ground(un.cxv - un.vw * 0.62 - sz * 0.06, un.cxv + un.vw * 0.62 + sz * 0.06, u(4) * ws, { at: dStart, dur: 0.25, ws: ws, width: penW(0.9) * ws, ticks: false });
      var di = doodle(un.nm, { x: dcx, y: dcy, size: sz, ws: ws, at: dStart + 0.1, dur: dDur, wobble: sz * 0.005 });
      var cur = di.t1;
      if (un.lab) { var li = write(un.lab, { x: un.cxv, y: un.gl + un.lm.h / 2, size: un.lsz, maxWidth: Math.max(un.vw, sz * 0.9) * 1.3, maxLines: 2, ws: ws, at: cur + 0.02, dur: Math.min(0.7, textDur(un.lab)) }); cur = li.t1; }
      if (un.note) { var ni = write(un.note, { x: un.cxv, y: -un.vh - un.gl - un.nmm.h / 2, size: un.nsz, maxWidth: Math.max(un.vw, sz * 0.9) * 1.4, maxLines: 2, color: "accent", ws: ws, at: cur + 0.02, dur: Math.min(0.6, textDur(un.note)) }); cur = ni.t1; }
      lastEnd = Math.max(lastEnd, cur);
    });
    if (figU) {
      var fg = makeFigure(key, { x: figU.x, y: 0, h: figU.h, ws: units[0].k, facing: "right", at: 0.15, drawDur: 0.6 });
      fg.talk(0.2, D);
      fg.pointAt({ x: units[0].cxv, y: -units[0].vh / 2 }, Math.max(0.9, beats[0] + 0.5));
      fg.pose("mind-blown", Math.min(lastBeat(), Math.max(beats[n - 1] + 0.3, 1.2)));
    }
    var all = frameOf(n - 1);
    var tF = Math.min(Math.max(lastEnd + 0.3, beats[n - 1] + 1.1), D - (cap ? 2.7 : 1.9));
    var cmm = cap ? measureBlock(cap, { size: u(P ? 52 : 48), maxWidth: sa.w * 0.9, maxLines: 2 }) : { h: 0 };
    cameraTo(camIn(all, cap ? cmm.h + u(30) : 0), tF, 1.1, "inOutCubic");
    if (cap) {
      var tCap = Math.max(tF + 0.9, capT != null ? capT - 0.2 : 0);
      tCap = Math.min(tCap, D - 1.05 - Math.min(1.2, textDur(cap)));
      write(cap, { x: sa.cx, y: sa.y1 - u(10) - cmm.h / 2, size: u(P ? 52 : 48), maxWidth: sa.w * 0.9, maxLines: 2, layer: "hud", at: tCap, dur: Math.min(1.2, textDur(cap)) });
    }
  };

  // ------------------------- what-if -------------------------
  TPL["what-if"] = function (root, p) {
    paper(root);
    var sa = safe(), key0 = castKey(p.character) || "pip", punch = str(p.punchline);
    var panels = arr(p.panels).filter(function (q) { return q && (str(q.caption) || q.pose || q.doodle || q.says); }).slice(0, 4);
    if (!panels.length) panels = [{ caption: contentWords(V.narration).slice(0, 5).join(" ") }];
    var n = panels.length;
    var hd = heading(str(p.title), { size: u(P ? 58 : 56) }), top = hd.bottom + (p.title ? u(30) : 0);
    var po = { size: u(P ? 50 : 48), maxWidth: sa.w * 0.9, maxLines: 2 };
    var pm = punch ? measureBlock(punch, po) : { h: 0 };
    var bot = sa.y1 - (punch ? pm.h + u(30) : 0);
    var cols = P ? (n === 4 ? 2 : 1) : n, rows = Math.ceil(n / cols), gap = u(P ? 26 : 30);
    var inX = u(10), pw = (sa.w - 2 * inX - gap * (cols - 1)) / cols, ph = (bot - top - gap * (rows - 1)) / rows;
    if (!P) ph = Math.min(ph, pw * 1.25);
    var oy = top + (bot - top - (ph * rows + gap * (rows - 1))) / 2;
    var cs = u(P ? (cols === 1 ? 38 : 32) : n >= 4 ? 30 : 34);
    var wins = lineWindows(panels.map(function (q) { return str(q.caption) || str(q.says); }));
    var beats = orderBeats(wins.map(function (w) { return w.start - 0.35; }), Math.min(1.5, (D - 1.6) / Math.max(1, n)), lastBeat() - 1.0);
    hd.draw(0.2, Math.min(1.0, textDur(str(p.title))));
    if (beats[0] < 0.5 && p.title) beats = beats.map(function (b, i) { return i ? b : Math.max(b, 0.45); });
    var lastEnd = 0;
    panels.forEach(function (q, i) {
      var c = i % cols, r = Math.floor(i / cols);
      var px = sa.x0 + inX + c * (pw + gap), py = oy + r * (ph + gap);
      var pad = u(16), tb = beats[i];
      var cap = str(q.caption), cm = cap ? measureBlock(cap, { size: cs, maxWidth: pw - 2 * pad, maxLines: 2 }) : { h: 0 };
      var says = str(q.says), wideRow = P && cols === 1;
      var sz = { size: u(P ? 32 : 30), maxWidth: wideRow ? pw * 0.4 : pw * 0.6, maxLines: 2 };
      var sm = says ? measureBlock(says, sz) : { w: 0, h: 0 };
      var stageTop = py + pad + (cap ? cm.h + u(10) : 0), groundY = py + ph - u(12);
      var nmD = q.doodle ? doodleName(q.doodle) : null, k = castKey(q.character) || key0;
      var fh = wideRow ? Math.min(groundY - stageTop - u(6), pw * 0.32) : Math.min((groundY - stageTop - (says ? sm.h + u(40) : u(10))) * 0.96, pw * 0.6);
      fh = Math.max(fh, u(90));
      var pose = str(q.pose).toLowerCase() || "stand";
      var fxL = px + pw * (wideRow ? (nmD ? 0.18 : 0.3) : nmD ? 0.32 : 0.5);
      if (pose === "walk") fxL = px + pw * 0.2;
      var falls = pose === "fall" || pose === "fallen";
      if (falls) { fh *= wideRow ? 0.9 : 0.78; fxL = px + pw * (wideRow ? (nmD ? 0.4 : 0.5) : nmD ? 0.44 : 0.62); }
      var bi = panel(px, py, pw, ph, { at: tb, dur: 0.4 });
      var t1 = bi.t1;
      if (cap) { var ci = write(cap, { x: px + pad, y: py + pad + cm.h / 2, anchor: "left", size: cs, maxWidth: pw - 2 * pad, maxLines: 2, at: t1, dur: Math.min(textDur(cap), 1.2) }); t1 = ci.t1; }
      var fg = makeFigure(k, { x: fxL, y: groundY, h: fh, facing: "right", at: bi.t1 + 0.1, drawDur: 0.55 });
      var fEnd = bi.t1 + 0.65;
      var nextB = i + 1 < n ? beats[i + 1] : lastBeat();
      if (nmD) {
        var ds = wideRow ? Math.min(groundY - stageTop, pw * 0.28) : Math.min((groundY - stageTop) * 0.5, pw * 0.34);
        var dx = px + pw * (wideRow ? 0.8 : falls ? 0.8 : 0.75), dy = wideRow ? (stageTop + groundY) / 2 : groundY - ds / 2 - u(4);
        if (pose === "walk") { dx = px + pw * 0.8; }
        var di = doodle(nmD, { x: dx, y: dy, size: ds, at: fEnd - 0.1, dur: clamp(doodleDur(nmD, ds), 0.5, 0.9) });
        t1 = Math.max(t1, di.t1);
      }
      var tPose = Math.min(fEnd + 0.05, nextB - 0.3);
      if (pose === "walk") fg.walkTo(px + pw * (nmD ? 0.55 : 0.75), tPose, Math.max(0.6, Math.min(1.6, nextB - tPose - 0.2)));
      else act(fg, pose, tPose);
      fg.talk(wins[i].start, wins[i].end + 0.2);
      if (says) {
        var hx = fxL + fh * 0.08;
        var sx = wideRow ? Math.min(px + pw - pad - sm.w / 2, fxL + fh * 0.3 + sm.w / 2) : clamp(hx + sm.w * 0.1, px + pad + sm.w / 2, px + pw - pad - sm.w / 2);
        var sy = wideRow ? stageTop + sm.h / 2 + u(4) : groundY - fh * 1.08 - u(34) - sm.h / 2;
        sy = Math.max(sy, stageTop + sm.h / 2);
        var tS = labelTime(says, null, tb);
        tS = clamp(tS != null ? tS - 0.2 : t1 + 0.1, fEnd, Math.max(fEnd, nextB - 0.4));
        var si = fg.say(says, Object.assign({ x: sx, y: sy, at: tS }, sz));
        t1 = Math.max(t1, si.t1);
      }
      lastEnd = Math.max(lastEnd, t1, fEnd);
    });
    if (punch) {
      var tP = labelTime(punch, null, beats[n - 1]);
      tP = clamp(tP != null ? tP - 0.2 : lastEnd + 0.2, Math.min(lastEnd + 0.05, lastBeat() - 1), lastBeat() - Math.min(1.0, textDur(punch)) + 0.4);
      write(punch, Object.assign({ x: sa.cx, y: sa.y1 - pm.h / 2, at: tP, dur: Math.min(textDur(punch), 1.0) }, po));
    }
  };

  // ------------------------- list-with-doodles -------------------------
  TPL["list-with-doodles"] = function (root, p) {
    paper(root);
    var sa = safe(), style = oneOf(p.style, ["doodles", "numbers", "checks"], "doodles");
    var key = str(p.character).toLowerCase() === "none" ? null : castKey(p.character) || "pip";
    var items = arr(p.items).filter(function (q) { return q && str(q.text); }).slice(0, 5);
    if (!items.length) items = [{ text: contentWords(V.narration).slice(0, 4).join(" ") || "One thing" }];
    var n = items.length, FH = 0, fx = 0, feet = sa.y1 - u(10), lx0, lx1, top, bot;
    if (!P) {
      FH = key ? Math.min(sa.h * 0.64, u(600)) : 0;
      fx = sa.x1 - FH * 0.3;
      lx0 = sa.x0 + u(10); lx1 = key ? fx - FH * 0.42 - u(30) : sa.x1;
    } else {
      FH = key ? Math.min(sa.h * 0.38, u(460)) : 0;
      fx = sa.x0 + sa.w * 0.68;
      lx0 = sa.x0; lx1 = sa.x1;
    }
    var lw = lx1 - lx0;
    var tsz = u(P ? 66 : 64);
    var hd = heading(str(p.title) || "", { size: tsz, x: (lx0 + lx1) / 2, maxWidth: lw * 0.95 });
    top = hd.bottom + u(P ? 50 : 40);
    bot = P && key ? feet - FH * 1.08 - u(30) : sa.y1;
    var rowH = Math.min((bot - top) / n, u(P ? 230 : 200)), bS = Math.min(rowH * 0.74, u(P ? 140 : 130));
    var to = { size: u(P ? 56 : 54), maxWidth: lw - bS - u(36), maxLines: 2 };
    var ms = items.map(function (q) { return measureBlock(q.text, to); });
    var maxTW = Math.max.apply(null, ms.map(function (m) { return m.w; }));
    var blockW = bS + u(36) + maxTW, bx = lx0 + Math.max(0, (lw - blockW) / 2) * (P ? 1 : 0.5);
    var blockH = rowH * n, by = top + Math.max(0, (bot - top - blockH) / 2);
    var tT = labelTime(str(p.title), null, 0);
    var fig = key ? presenter(key, fx, feet, FH, { facing: "left" }) : null;
    var title = hd.draw(0.25);
    if (title) underline(title, { at: title.t1 + 0.05, color: "ink", pad: u(6), width: penW(0.9) });
    var prevT = 0.5, lands = items.map(function (q) { var t = labelTime(q.text, q.keyword, prevT); if (t != null && t >= prevT) prevT = t; else t = null; return t; });
    lands = spread(lands, title ? title.t1 + 0.6 : 0.8, lastBeat() - 0.8);
    lands = orderBeats(lands, 0.9, lastBeat() - 0.6);
    var cur = title ? title.t1 + 0.1 : 0.4;
    items.forEach(function (q, i) {
      var yc = by + rowH * (i + 0.5), bcx = bx + bS / 2, tl = lands[i];
      var bStart = Math.max(cur + 0.05, tl - 0.5);
      var bul;
      if (q.doodle) bul = doodle(doodleName(q.doodle), { x: bcx, y: yc, size: bS, at: bStart, dur: 0.5 });
      else if (style === "numbers") bul = write((i + 1) + ".", { x: bcx, y: yc, size: bS * 0.62, at: bStart, dur: 0.3 });
      else if (style === "checks") bul = box({ x: bcx - bS * 0.28, y: yc - bS * 0.28, w: bS * 0.56, h: bS * 0.56 }, { at: bStart, dur: 0.35, pad: 0 });
      else bul = doodle(pickDoodle(q.text, "star"), { x: bcx, y: yc, size: bS, at: bStart, dur: 0.5 });
      var ti = write(q.text, Object.assign({ x: bx + bS + u(36), y: yc, anchor: "left", at: Math.max(bul.t1 + 0.02, tl - 0.15), dur: Math.min(textDur(q.text), 1.2) }, to));
      cur = ti.t1;
      if (fig) fig.pointAt({ x: P ? bx + bS + u(36) + ms[i].w * 0.6 : ti.x + ti.w, y: yc }, Math.max(1.0, bStart - 0.1));
      if (q.crossed) { var cr = cross(ti, { strike: true, at: cur + 0.12, dur: 0.3 }); cur = cr.t1; if (fig) fig.pose("shrug", Math.min(cur + 0.05, lastBeat())); }
      else if (style === "checks" && !q.doodle) { var ck = strokesJob([sample("M" + (bcx - bS * 0.22) + " " + (yc) + " L" + (bcx - bS * 0.04) + " " + (yc + bS * 0.2) + " L" + (bcx + bS * 0.32) + " " + (yc - bS * 0.34), 3)], { at: cur + 0.08 }, 0.25, COL.accent, penW(1.3), "check"); cur = ck.t1; }
    });
    if (fig) { if (p.endPose) act(fig, p.endPose, endBeat(cur + 0.2)); else fig.pose("explain", Math.min(cur + 0.4, lastBeat())); }
  };

  // ------------------------- thought-experiment -------------------------
  TPL["thought-experiment"] = function (root, p) {
    paper(root);
    var sa = safe(), key = castKey(p.character) || "remy";
    var premise = str(p.premise) || contentWords(V.narration).slice(0, 8).join(" ") || "Imagine...", question = str(p.question);
    var doods = arr(p.doodles).map(function (d) { return doodleName(d); }).slice(0, 3), reaction = str(p.reaction) || "mind-blown";
    var FH, fx, feet = sa.y1 - u(10), cloud, qo, qx, qy;
    if (!P) {
      FH = Math.min(sa.h * 0.5, u(480));
      fx = sa.x0 + FH * 0.28;
      cloud = { x: fx + FH * 0.3, y: sa.y0, w: sa.x1 - (fx + FH * 0.3), h: sa.h * 0.64 };
      qo = { size: u(64), maxWidth: sa.x1 - (fx + FH * 0.5), maxLines: 2 };
      var qm = question ? measureBlock(question, qo) : { h: 0 };
      qx = (fx + FH * 0.5 + sa.x1) / 2; qy = Math.max(cloud.y + cloud.h + u(24) + qm.h / 2, (cloud.y + cloud.h + sa.y1) / 2);
      qy = Math.min(qy, sa.y1 - qm.h / 2);
    } else {
      FH = Math.min(sa.h * 0.36, u(440));
      fx = sa.x0 + FH * 0.28;
      cloud = { x: sa.x0, y: sa.y0, w: sa.w, h: sa.h * 0.56 };
      qo = { size: u(60), maxWidth: sa.x1 - u(12) - (fx + FH * 0.45), maxLines: 3 };
      var qm2 = question ? measureBlock(question, qo) : { w: 0, h: 0 };
      qx = sa.x1 - u(12) - qm2.w / 2; qy = feet - FH * 0.58;
    }
    var fig = presenter(key, fx, feet, FH, { facing: "right" });
    var tC = kwFind(p.keyword || "imagine", 0);
    tC = clamp(tC == null ? 0.9 : tC, 0.85, lastBeat() - 2.5);
    fig.pose("think", Math.max(0.6, tC - 0.35));
    fig.mark("question", Math.max(0.7, tC - 0.2), 1.0);
    var inner = fig.think(cloud, { at: tC });
    var po = { size: u(P ? 50 : 50), maxWidth: inner.w, maxLines: 3 };
    var pm = measureBlock(premise, po);
    var dz = doods.length ? Math.min(inner.h - pm.h - u(20), (inner.w / doods.length) * 0.72, u(P ? 190 : 200)) : 0;
    dz = Math.max(dz, doods.length ? u(80) : 0);
    var blockH = pm.h + (doods.length ? dz + u(16) : 0), by = inner.cy - blockH / 2;
    var pi = write(premise, Object.assign({ x: inner.cx, y: by + pm.h / 2, at: inner.t1 - 0.15, dur: Math.min(textDur(premise), 2.0) }, po));
    var cur = pi.t1, prevT = tC;
    var lands = doods.map(function (d) { var t = kwFind(d, prevT); if (t != null && t >= prevT) prevT = t; else t = null; return t; });
    lands = spread(lands, cur + 0.1, lastBeat() - (question ? 2.2 : 0.8));
    doods.forEach(function (d, i) {
      var x = inner.cx + (i - (doods.length - 1) / 2) * (inner.w / doods.length);
      var di = doodle(d, { x: x, y: by + pm.h + u(16) + dz / 2, size: dz, at: Math.max(cur + 0.05, lands[i] - 0.4), dur: clamp(doodleDur(d, dz), 0.5, 0.9), rot: (i % 2 ? 6 : -6) });
      cur = di.t1;
    });
    if (question) {
      var tQ = p.questionKeyword ? kwFind(p.questionKeyword, tC) : labelTime(question, null, tC + 0.5);
      tQ = clamp(tQ != null ? tQ - 0.25 : cur + 0.3, cur + 0.1, lastBeat() - Math.min(1.4, textDur(question)));
      var qi = write(question, Object.assign({ x: qx, y: qy, at: tQ, dur: Math.min(textDur(question), 1.4) }, qo));
      cur = qi.t1;
    }
    act(fig, reaction, Math.min(cur + 0.15, lastBeat()));
  };

  // ------------------------- title-card -------------------------
  // Sequential beats with nominal durations, squeezed to fit [start, end] when the scene is short.
  function squeeze(list, start, end, gap) {
    gap = gap == null ? 0.06 : gap;
    var tot = 0;
    list.forEach(function (b) { tot += b.d + (b.par ? 0 : gap); });
    var k = tot > end - start ? Math.max(0.3, (end - start) / tot) : 1, t = start;
    list.forEach(function (b) { b.d = Math.max(0.15, b.d * k); b.at = t; if (!b.par) t += b.d + gap * k; else t += b.d * 0.35; });
    return list;
  }
  TPL["title-card"] = function (root, p) {
    paper(root);
    var sa = safe(), title = str(p.title) || "Untitled", sub = str(p.subtitle), kicker = str(p.kicker);
    var key = str(p.character).toLowerCase() === "none" ? null : castKey(p.character) || "pip";
    var pose = str(p.pose) || "point-up";
    var doods = arr(p.doodles).map(function (d) { return doodleName(d); }).slice(0, 3);
    var FH = 0, fx = 0, feet = sa.y1 - u(10), ax0, ax1, ay0, ay1;
    if (!P) {
      FH = key ? Math.min(sa.h * 0.6, u(560)) : 0;
      fx = sa.x0 + FH * 0.3;
      ax0 = key ? fx + FH * 0.42 : sa.x0; ax1 = sa.x1; ay0 = sa.y0; ay1 = sa.y1;
    } else {
      FH = key ? Math.min(sa.h * 0.36, u(440)) : 0;
      fx = sa.x0 + FH * 0.34;
      ax0 = sa.x0; ax1 = sa.x1; ay0 = sa.y0; ay1 = key ? feet - FH * 1.05 - u(30) : sa.y1;
    }
    var aw = ax1 - ax0, ds = doods.length ? u(P ? 150 : 140) : 0;
    var to = { size: u(P ? 116 : 120), maxWidth: (P ? aw : aw - ds * 1.6) * 0.95, maxLines: P ? 3 : 2 };
    var tm = measureBlock(title, to);
    var ko = { size: u(P ? 42 : 40), maxWidth: aw * 0.8, maxLines: 1, caps: true, color: "muted" }, km = kicker ? measureBlock(kicker, ko) : { h: 0 };
    var so = { size: u(P ? 56 : 54), maxWidth: aw * 0.8, maxLines: 2 }, sm = sub ? measureBlock(sub, so) : { w: 0, h: 0 };
    var gk = u(26), gu = u(46), gs = u(28);
    var blockH = (kicker ? km.h + gk : 0) + tm.h + gu + (sub ? gs + sm.h : 0);
    var cx = (ax0 + ax1) / 2, y0 = ay0 + Math.max(0, (ay1 - ay0 - blockH) / 2) + (P && doods.length ? ds * 0.2 : 0);
    var kY = y0 + km.h / 2, tY = y0 + (kicker ? km.h + gk : 0) + tm.h / 2, sY = tY + tm.h / 2 + gu + gs + sm.h / 2;
    var fig = key ? presenter(key, fx, feet, FH, { facing: "right" }) : null;
    var beats = [];
    if (kicker) beats.push({ id: "k", d: Math.min(0.6, textDur(kicker)) });
    beats.push({ id: "t", d: Math.min(1.4, textDur(title)) }, { id: "u", d: 0.4 });
    if (sub) beats.push({ id: "s", d: Math.min(0.9, textDur(sub)) });
    doods.forEach(function (d, i) { beats.push({ id: "d" + i, d: 0.55, par: i < doods.length - 1 }); });
    squeeze(beats, 0.25, lastBeat());
    var B = {};
    beats.forEach(function (b) { B[b.id] = b; });
    if (kicker) write(kicker, Object.assign({ x: cx, y: kY, at: B.k.at, dur: B.k.d }, ko));
    var ti = write(title, Object.assign({ x: cx, y: tY, at: B.t.at, dur: B.t.d }, to));
    underline(ti, { double: true, at: B.u.at, dur: B.u.d, pad: u(10) });
    if (fig) {
      var tf = Math.max(0.85, B.t.at + 0.1);
      if (poseKey(pose) === "point-up" || poseKey(pose) === "point") fig.pointAt({ x: ti.x + ti.w * 0.15, y: ti.y + ti.h * 0.5 }, tf);
      else act(fig, pose, tf);
    }
    if (sub) write(sub, Object.assign({ x: cx, y: sY, at: B.s.at, dur: B.s.d }, so));
    // small tilted doodles in free corners around the block
    var bTop = y0, bBot = y0 + blockH, bL = cx - Math.max(tm.w, sm.w || 0) / 2, bR = cx + Math.max(tm.w, sm.w || 0) / 2;
    var spots = P
      ? [[sa.x0 + ds * 0.62, Math.max(sa.y0 + ds * 0.6, bTop - ds * 0.72)], [sa.x1 - ds * 0.62, Math.max(sa.y0 + ds * 0.6, bTop - ds * 0.72)], [sa.x1 - ds * 0.75, key ? feet - FH * 0.5 : Math.min(sa.y1 - ds * 0.6, bBot + ds * 0.8)]]
      : [[Math.min(sa.x1 - ds * 0.6, bR + ds * 0.75), Math.max(sa.y0 + ds * 0.6, bTop + ds * 0.1)], [Math.min(sa.x1 - ds * 0.6, bR + ds * 0.7), Math.min(sa.y1 - ds * 0.6, bBot - ds * 0.05)], [Math.max(ax0 + ds * 0.5, bL - ds * 0.3), Math.max(sa.y0 + ds * 0.55, bTop - ds * 0.62)]];
    doods.forEach(function (d, i) {
      var s0 = spots[i], c = fitBox(s0[0], s0[1], ds, ds, sa), b = B["d" + i];
      doodle(d, { x: c[0], y: c[1], size: ds, rot: [-12, 10, -8][i], at: b.at, dur: b.d, accent: i === 0 && !!p.accent });
    });
  };

  // ------------------------- timeline-squiggle -------------------------
  TPL["timeline-squiggle"] = function (root, p) {
    paper(root);
    var sa = safe(), evs = arr(p.events).filter(function (e) { return e && (str(e.date) || str(e.label)); }).slice(0, 6);
    if (evs.length < 2) evs = evs.concat([{ date: "Then", label: "" }, { date: "Now", label: "" }]).slice(0, Math.max(2, evs.length));
    var n = evs.length, yah = str(p.youAreHere);
    var key = P || str(p.character).toLowerCase() === "none" ? null : castKey(p.character) || "juno";
    var hd = heading(str(p.title)), top = hd.bottom + (p.title ? u(36) : 0);
    var ticks = [], linePts = [], endPt;
    var dsz, dateO, labO, lineY, slot = 0, fh = 0;
    // a cursive loop between the first two events: in along the line, up, over and back across
    function loop(c, r, horiz) {
      var q = horiz
        ? [[-2.2, 0], [-0.6, 0.12], [0.7, -0.5], [0.85, -1.5], [0, -2.15], [-0.85, -1.5], [-0.7, -0.5], [0.6, 0.12], [2.2, 0]]
        : [[0, -2.2], [-0.12, -0.6], [0.5, 0.7], [1.5, 0.85], [2.15, 0], [1.5, -0.85], [0.5, -0.7], [-0.12, 0.6], [0, 2.2]];
      return q.map(function (v) { return [c[0] + v[0] * r, c[1] + v[1] * r]; });
    }
    if (!P) {
      fh = key ? Math.min((sa.y1 - top) * 0.36, u(320)) : 0;
      lineY = top + (sa.y1 - top) * 0.64;
      var x0 = sa.x0 + u(20), x1 = sa.x1 - u(yah ? 250 : 30);
      slot = (x1 - x0) / n;
      dsz = Math.min(u(200), slot * 0.5, (lineY - top - u(130)) * 0.85);
      dateO = { size: u(50), maxWidth: slot * 0.9, maxLines: 1 }; labO = { size: u(38), maxWidth: slot * 0.92, maxLines: 3 };
      for (var i = 0; i < n; i++) ticks.push([x0 + slot * (i + 0.5), lineY]);
      linePts.push([x0 - u(10), lineY]);
      for (var k = 0; k < n; k++) {
        if (k === 1) linePts = linePts.concat(loop([(ticks[0][0] + ticks[1][0]) / 2, lineY], Math.min(u(30), slot * 0.1), true));
        else if (k) linePts.push([(ticks[k - 1][0] + ticks[k][0]) / 2, lineY + (k % 2 ? 1 : -1) * u(12)]);
        linePts.push([ticks[k][0], ticks[k][1]]);
      }
      endPt = [x1 + u(70), lineY - u(4)];
      linePts.push(endPt);
    } else {
      var lineX = sa.x0 + u(80), yT = top + u(20), yB = sa.y1 - u(yah ? 170 : 40), slotY = (yB - yT) / n;
      dsz = Math.min(u(150), slotY * 0.62);
      dateO = { size: u(54), maxWidth: sa.x1 - lineX - dsz - u(80), maxLines: 1 }; labO = { size: u(40), maxWidth: sa.x1 - lineX - dsz - u(80), maxLines: 2 };
      for (var j = 0; j < n; j++) ticks.push([lineX, yT + slotY * (j + 0.5)]);
      linePts.push([lineX, yT - u(20)]);
      for (var k2 = 0; k2 < n; k2++) {
        if (k2 === 1) linePts = linePts.concat(loop([lineX, (ticks[0][1] + ticks[1][1]) / 2], Math.min(u(28), slotY * 0.12), false));
        else if (k2) linePts.push([lineX + (k2 % 2 ? 1 : -1) * u(14), (ticks[k2 - 1][1] + ticks[k2][1]) / 2]);
        linePts.push([ticks[k2][0], ticks[k2][1]]);
      }
      endPt = [lineX + u(4), yB + u(70)];
      linePts.push(endPt);
    }
    // timing
    var prevT = 0.4, lands = evs.map(function (e) { var t = labelTime(e.date, e.keyword, prevT); if (t == null) t = labelTime(e.label, null, prevT); if (t != null && t >= prevT) prevT = t; else t = null; return t; });
    lands = spread(lands, 1.1, lastBeat() - (yah ? 1.4 : 0.8));
    lands = orderBeats(lands.map(function (t) { return Math.max(t, 1.1); }), 0.9, lastBeat() - (yah ? 1.2 : 0.5));
    hd.draw(0.2);
    var li = scribble(linePts, { at: 0.35, dur: Math.min(1.2, Math.max(0.6, lands[0] - 0.6)), width: penW(1.2), wobble: u(1.2) });
    var fig = null, gap0 = slot * 0.4;
    if (key) {
      fig = makeFigure(key, { x: ticks[0][0] - gap0, y: lineY - u(3), h: fh, facing: "right", at: 0.15, drawDur: 0.6 });
      fig.talk(0.2, D);
    }
    var cur = li.t1;
    evs.forEach(function (e, i) {
      var tk = ticks[i], last = i === n - 1, tl = lands[i], col = last ? "accent" : "ink";
      var t0 = Math.max(cur + 0.04, tl - 0.35);
      var tkI = strokesJob([sample(P ? "M" + (tk[0] - u(18)) + " " + tk[1] + " L" + (tk[0] + u(18)) + " " + tk[1] : "M" + tk[0] + " " + (tk[1] - u(18)) + " L" + tk[0] + " " + (tk[1] + u(18)), 2)], { at: t0, noInspect: true }, 0.12, last ? COL.accent : COL.ink, penW(1.3), "tick");
      var dt = str(e.date), lb = str(e.label), di = null, dti = null, lbi = null;
      if (!P) {
        var dm = dt ? measureBlock(dt, dateO) : { h: 0 };
        if (dt) dti = write(dt, Object.assign({ x: tk[0], y: tk[1] - u(34) - dm.h / 2, at: tkI.t1, color: col, dur: Math.min(0.6, textDur(dt)) }, dateO));
        if (e.doodle) di = doodle(doodleName(e.doodle), { x: tk[0], y: tk[1] - u(34) - dm.h - u(24) - dsz / 2, size: dsz, at: (dti ? dti.t1 : tkI.t1) + 0.02, dur: 0.6, accent: last });
        if (lb) lbi = write(lb, Object.assign({ x: tk[0], y: tk[1] + u(36), anchor: "top", at: (di || dti || tkI).t1 + 0.02, dur: Math.min(1.0, textDur(lb)) }, labO));
      } else {
        var tx = tk[0] + u(50), dmm = dt ? measureBlock(dt, dateO) : { h: 0 }, lmm = lb ? measureBlock(lb, labO) : { h: 0 };
        var bh = dmm.h + (lb ? u(8) + lmm.h : 0);
        if (dt) dti = write(dt, Object.assign({ x: tx, y: tk[1] - bh / 2 + dmm.h / 2, anchor: "left", at: tkI.t1, color: col, dur: Math.min(0.6, textDur(dt)) }, dateO));
        if (lb) lbi = write(lb, Object.assign({ x: tx, y: tk[1] - bh / 2 + dmm.h + u(8) + lmm.h / 2, anchor: "left", at: (dti || tkI).t1 + 0.02, dur: Math.min(1.0, textDur(lb)) }, labO));
        if (e.doodle) di = doodle(doodleName(e.doodle), { x: sa.x1 - u(12) - dsz / 2, y: tk[1], size: dsz, at: (lbi || dti || tkI).t1 + 0.02, dur: 0.55, accent: last });
      }
      cur = Math.max((lbi || di || dti || tkI).t1, (di || tkI).t1);
      if (fig && i > 0) fig.walkTo(tk[0] - gap0, Math.max(t0 - 0.75, 0.9), Math.min(0.85, Math.max(0.4, t0 - 0.3)));
    });
    if (yah) {
      var th = kwFind("here", lands[n - 1]);
      var tY = clamp(th != null ? th - 0.3 : cur + 0.15, cur + 0.05, lastBeat() - 0.6);
      if (!P) youAreHere(endPt[0], endPt[1], { text: yah, at: tY, dx: 0.25, dy: 1, dist: u(150), size: u(32), maxWidth: u(230) });
      else youAreHere(endPt[0], endPt[1], { text: yah, at: tY, dx: 1, dy: 0.25, dist: u(230), size: u(34), maxWidth: u(320) });
    }
    if (fig) { if (p.endPose) act(fig, p.endPose, endBeat(cur + 0.2)); else fig.pointAt({ x: ticks[n - 1][0], y: ticks[n - 1][1] - u(80) }, Math.min(cur + 0.2, lastBeat())); }
  };

  // ------------------------- versus -------------------------
  TPL.versus = function (root, p) {
    paper(root);
    var sa = safe(), Lp = T(p.left), Rp = T(p.right), verdict = str(p.verdict), win = oneOf(p.winner, ["left", "right", "none"], "none");
    var vo = { size: u(P ? 50 : 46), maxWidth: sa.w * 0.9, maxLines: 2 }, vm = verdict ? measureBlock(verdict, vo) : { h: 0 };
    var y0 = sa.y0 + u(P ? 40 : 30), bot = sa.y1 - (verdict ? vm.h + u(34) : u(10));
    var gapC = P ? u(120) : u(160);
    var boxes = P
      ? [{ x: sa.x0, y: y0, w: sa.w, h: (bot - y0 - gapC) / 2 }, { x: sa.x0, y: y0 + (bot - y0 + gapC) / 2, w: sa.w, h: (bot - y0 - gapC) / 2 }]
      : [{ x: sa.x0, y: y0, w: (sa.w - gapC) / 2, h: bot - y0 }, { x: sa.x0 + (sa.w + gapC) / 2, y: y0, w: (sa.w - gapC) / 2, h: bot - y0 }];
    var lands = syncTimes([str(Lp.keyword) || str(Lp.label), str(Rp.keyword) || str(Rp.label)], { start: 0.4, end: D * 0.55 });
    lands[0] = clamp(lands[0], 0.3, Math.max(0.3, lastBeat() - 3));
    lands[1] = clamp(Math.max(lands[1], lands[0] + 1.2), lands[0] + 0.8, Math.max(lands[0] + 0.8, lastBeat() - 1.4));
    var hdrs = [], figs = [], ends = [0, 0];
    [Lp, Rp].forEach(function (d, i) {
      var b = boxes[i], lab = str(d.label) || (i ? "B" : "A"), pts = arr(d.points).map(str).filter(Boolean).slice(0, 3);
      var k = castKey(d.character), nmD = d.doodle ? doodleName(d.doodle) : pickDoodle(lab, null);
      var ho = { size: u(P ? 64 : 66), maxWidth: b.w * 0.9, maxLines: 1 }, hm = measureBlock(lab, ho);
      var po = { size: u(P ? 40 : 40), maxLines: 2 };
      var tStart = lands[i] - 0.3, cur;
      var ptLands = [], pv = lands[i];
      pts.forEach(function (q) { var t = labelTime(q, null, pv); if (t != null && t >= pv) pv = t; else t = null; ptLands.push(t); });
      if (!P) {
        var gh = u(26), gp = u(34);
        var ds = nmD ? Math.min(b.h * 0.36, b.w * (k ? 0.36 : 0.5)) : 0, fh = k ? Math.min(b.h * 0.44, Math.max(ds * 1.3, u(260))) : 0;
        var rowH = Math.max(ds, fh);
        po.maxWidth = b.w * 0.86;
        var pm = pts.map(function (q) { return measureBlock("- " + q, po); }), pH = 0, pW = 0;
        pm.forEach(function (m) { pH += m.h + u(10); pW = Math.max(pW, m.w); });
        var blockH = hm.h + gh + rowH + (pts.length ? gp + pH : 0), by = b.y + Math.max(0, (b.h - blockH) / 2);
        var hy = by + hm.h / 2, rowT = by + hm.h + gh;
        var hi = write(lab, Object.assign({ x: b.x + b.w / 2, y: hy, at: Math.max(0.25, tStart), dur: Math.min(0.7, textDur(lab)) }, ho));
        hdrs.push(hi); cur = hi.t1;
        var dX = k ? b.x + b.w * (i ? 0.66 : 0.34) : b.x + b.w / 2, fX = b.x + b.w * (i ? 0.24 : 0.76);
        if (nmD) { var di = doodle(nmD, { x: dX, y: rowT + rowH - ds / 2, size: ds, at: cur + 0.02, dur: 0.75 }); cur = di.t1; }
        if (k) { var fg = makeFigure(k, { x: fX, y: rowT + rowH, h: fh, facing: i ? "left" : "right", at: Math.max(0.15, tStart + 0.1), drawDur: 0.6 }); fg.talk(lands[i], (i ? D : lands[1]) - 0.1); figs[i] = fg; }
        ptLands = spread(ptLands, cur + 0.6, i ? lastBeat() - 1.4 : lands[1] - 0.4);
        var py = rowT + rowH + gp, px = b.x + (b.w - pW) / 2;
        pts.forEach(function (q, j) {
          var ti = write("- " + q, Object.assign({ x: px, y: py + pm[j].h / 2, anchor: "left", at: Math.max(cur + 0.05, ptLands[j] - 0.2), dur: Math.min(1.0, textDur(q)) }, po));
          py += pm[j].h + u(10); cur = ti.t1;
        });
      } else {
        var hy2 = b.y + hm.h / 2;
        var hi2 = write(lab, Object.assign({ x: b.x + b.w / 2, y: hy2, at: Math.max(0.25, tStart), dur: Math.min(0.7, textDur(lab)) }, ho));
        hdrs.push(hi2); cur = hi2.t1;
        var cTop = hy2 + hm.h / 2 + u(26), ch = b.y + b.h - cTop;
        var ds2 = nmD ? Math.min(ch * 0.8, b.w * 0.3) : 0, fh2 = k ? Math.min(ch * 0.98, u(330)) : 0;
        var dX2 = b.x + ds2 / 2 + u(8), fX2 = b.x + (nmD ? ds2 + u(16) : 0) + fh2 * 0.3;
        var rowB = cTop + Math.max(ds2, fh2) + Math.max(0, (ch - Math.max(ds2, fh2)) / 2);
        if (nmD) { var di2 = doodle(nmD, { x: dX2, y: rowB - ds2 / 2, size: ds2, at: cur + 0.02, dur: 0.7 }); cur = di2.t1; }
        if (k) { var fg2 = makeFigure(k, { x: fX2, y: rowB, h: fh2, facing: "right", at: Math.max(0.15, tStart + 0.1), drawDur: 0.6 }); fg2.talk(lands[i], (i ? D : lands[1]) - 0.1); figs[i] = fg2; }
        var px0 = k ? fX2 + fh2 * 0.48 : dX2 + ds2 / 2 + u(36);
        po.maxWidth = sa.x1 - u(10) - px0;
        var ms = pts.map(function (q) { return measureBlock("- " + q, po); }), th = 0;
        ms.forEach(function (m) { th += m.h + u(10); });
        ptLands = spread(ptLands, cur + 0.6, i ? lastBeat() - 1.4 : lands[1] - 0.4);
        var py2 = cTop + Math.max(0, (ch - th) / 2);
        pts.forEach(function (q, j) {
          var ti2 = write("- " + q, Object.assign({ x: px0, y: py2 + ms[j].h / 2, anchor: "left", at: Math.max(cur + 0.05, ptLands[j] - 0.2), dur: Math.min(1.0, textDur(q)) }, po));
          py2 += ms[j].h + u(10); cur = ti2.t1;
        });
      }
      ends[i] = cur;
    });
    // VS and the scribbled divider
    var vsX = sa.cx, vsY = P ? (boxes[0].y + boxes[0].h + boxes[1].y) / 2 : y0 + (bot - y0) * 0.45;
    var tVS = Math.max(0.5, Math.min(lands[1] - 0.6, ends[0] + 0.1));
    if (P) { line(sa.x0 + u(20), vsY, vsX - u(110), vsY + u(4), { at: tVS, dur: 0.3, color: "muted", width: penW(0.9) }); line(vsX + u(110), vsY - u(4), sa.x1 - u(20), vsY, { at: tVS + 0.3, dur: 0.3, color: "muted", width: penW(0.9) }); }
    else { line(vsX, y0, vsX + u(4), vsY - u(90), { at: tVS, dur: 0.3, color: "muted", width: penW(0.9) }); line(vsX - u(4), vsY + u(90), vsX, bot - u(10), { at: tVS + 0.3, dur: 0.3, color: "muted", width: penW(0.9) }); }
    write("VS", { x: vsX, y: vsY, size: u(P ? 88 : 100), color: "accent", at: tVS + 0.2, dur: 0.45, weight: 0.11 });
    var last = Math.max(ends[0], ends[1]);
    if (verdict) {
      var tv = p.verdictKeyword ? kwFind(p.verdictKeyword, lands[1]) : labelTime(verdict, null, lands[1] + 0.3);
      tv = clamp(tv != null ? tv - 0.2 : last + 0.2, Math.min(last + 0.05, lastBeat() - 1.2), lastBeat() - Math.min(1.2, textDur(verdict)) + 0.2);
      var vi = write(verdict, Object.assign({ x: sa.cx, y: sa.y1 - u(10) - vm.h / 2, at: tv, dur: Math.min(1.2, textDur(verdict)) }, vo));
      last = vi.t1;
    }
    if (win !== "none") {
      var wi = win === "left" ? 0 : 1, lo = 1 - wi, tw = Math.min(last + 0.05, lastBeat() - 0.3);
      circle(hdrs[wi], { at: tw, dur: 0.5, pad: u(14) });
      if (figs[wi]) act(figs[wi], "celebrate", Math.min(tw + 0.05, lastBeat()));
      if (figs[lo]) act(figs[lo], "sad", Math.min(tw + 0.15, lastBeat()));
    }
  };

  // ------------------------- public API -------------------------
  // Safety net for templates: when too much was asked of a short scene, squeeze every drawing after
  // the first beat so the last stroke ends about a second before the end (a short scene: earlier).
  function fitToScene() {
    var s = st;
    if (!s) return;
    var maxT = 0;
    s.strokes.forEach(function (g) { maxT = Math.max(maxT, g.t1 || 0); });
    var limit = Math.max(0.6, D - (D < 4 ? Math.min(0.7, D * 0.2) : 0.9));
    if (maxT <= limit) return;
    var pivot = Math.min(0.8, D * 0.2), k = (limit - pivot) / Math.max(0.01, maxT - pivot);
    function m(t) { return t <= pivot ? t : pivot + (t - pivot) * k; }
    s.strokes.forEach(function (g) { g.t0 = m(g.t0); g.t1 = Math.max(g.t0 + 0.004, m(g.t1)); });
    s.items.forEach(function (r) { if (r.it) { r.it.t0 = m(r.it.t0); r.it.t1 = m(r.it.t1); r.it.end = r.it.t1; } });
    s.dirty = true;
  }
  function render(id, root, props) {
    var fn = TPL[id];
    if (!fn) throw new Error("Unknown stick-figure-folk template: " + id);
    fn(root || V.root(), T(props));
    fitToScene();
  }
  function fallback(root, narration) {
    root = root || V.root();
    st = null;
    paper(root);
    var sa = safe(), words = contentWords(narration || V.narration).slice(0, 5).join(" ");
    var FH = P ? Math.min(sa.h * 0.32, u(400)) : Math.min(sa.h * 0.6, u(560));
    var f = makeFigure("pip", { x: P ? sa.x0 + FH * 0.35 : sa.x0 + sa.w * 0.2, y: sa.y1 - u(10), h: FH, facing: "right", at: 0.1, drawDur: Math.min(0.8, D * 0.25) });
    f.talk(0.2, D);
    f.pose("shrug", Math.min(1.2, D * 0.4));
    var dS = P ? sa.w * 0.5 : sa.h * 0.5;
    var di = doodle(pickDoodle(narration || V.narration || "", "question"), { x: P ? sa.cx : sa.x0 + sa.w * 0.62, y: P ? sa.y0 + sa.h * 0.28 : sa.cy - sa.h * 0.08, size: dS, at: 0.3, dur: Math.min(1.2, D * 0.3) });
    if (words) write(words, { x: P ? sa.cx : sa.x0 + sa.w * 0.62, y: P ? sa.y0 + sa.h * 0.28 + dS * 0.62 + u(40) : di.y + di.h + u(70), size: u(52), maxWidth: P ? sa.w * 0.9 : sa.w * 0.55, maxLines: 2, at: di.t1 + 0.1, dur: Math.min(1.5, Math.max(0.3, D * 0.3)) });
  }

  S.paper = paper;
  S.cameraTo = cameraTo;
  S.frameRect = frameRect;
  S.camera = function (t) { return st ? camAt(t == null ? V.time() : t) : { cx: W / 2, cy: H / 2, z: 1 }; };
  S.figure = makeFigure;
  S.cast = Object.keys(CAST);
  S.poses = Object.keys(POSES);
  S.exprs = EXPRS.slice();
  S.marks = Object.keys(MK);
  S.doodle = doodle;
  S.doodles = Object.keys(DL);
  S.hasDoodle = hasDoodle;
  S.pickDoodle = function (text) { return pickDoodle(text); };
  S.write = write;
  S.measureBlock = measureBlock;
  S.measureText = function (text, size) { return layoutText(String(text).replace(/\n/g, " "), { size: size, maxWidth: 1e9, maxLines: 1 }).w; };
  S.scribble = scribble;
  S.line = line;
  S.ground = ground;
  S.panel = panel;
  S.arrow = arrow;
  S.label = label;
  S.youAreHere = youAreHere;
  S.circle = circle;
  S.underline = underline;
  S.cross = cross;
  S.box = box;
  S.graph = graph;
  S.syncAt = syncAt;
  S.syncTimes = syncTimes;
  S.lineWindows = lineWindows;
  S.plan = plan;
  S.cursor = function () { return st ? st.cursor : 0.15; };
  S.wait = function (sec) { var s = ensure(); s.cursor += Math.max(0, +sec || 0); return s.cursor; };
  S.setCursor = function (t) { var s = ensure(); s.cursor = Math.max(0, +t || 0); return s.cursor; };
  S.safe = safe;
  S.u = u;
  S.colors = COL;
  S.templates = Object.keys(TPL);
  S.render = render;
  S.fallback = fallback;
  // Screen boxes of what is on screen at time t (for tests: safe area and overlaps).
  S.inspect = function (t) {
    if (!st) return [];
    var c = camAt(t), camMoving = st.camTr.moving(t), out = [];
    st.items.forEach(function (r) {
      var b, moving = camMoving;
      if (r.fig) {
        var f = r.fig, op = f.op ? f.op.val(t) : 1;
        if (t < f.at || op < 0.05) return;
        b = f.box(t);
        moving = moving || f.moving(t);
      } else {
        var it = r.it;
        if (it.t0 > t + 1e-6) return;
        var ib = itemBox(it, t);
        if (ib.op < 0.05) return;
        b = ib;
        moving = moving || ib.moving;
      }
      if (r.hud) { out.push({ kind: r.kind, label: r.label, x: b.x, y: b.y, w: b.w, h: b.h, moving: false }); return; }
      var p0 = proj(b.x, b.y, c);
      out.push({ kind: r.kind, label: r.label, x: p0[0], y: p0[1], w: b.w * c.z, h: b.h * c.z, moving: moving });
    });
    return out;
  };
  S.flush = function () { if (st) { finalize(); frame(V.time()); } };
})();

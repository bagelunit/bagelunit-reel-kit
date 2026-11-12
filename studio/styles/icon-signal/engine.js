/* Icon Signal engine (style id: icon-signal).
 *
 * Architecture
 * - Build time: S.pictogram(root) makes one root div (.pg) holding a shake wrapper with
 *   (1) a world SVG: camera group > layers wall, back, mid, figs, front, glow, fx (world pixels),
 *   (2) a screen SVG for marks aimed at screen items, (3) an HTML overlay for stamps, captions,
 *   clock, rule cards, phone and checklist, (4) vignette, flash, blackout and stinger layers.
 *   Every drawing call builds its DOM once and records keyframes on small tracks (Tr).
 * - One frame function: V.onFrame(frame) sets every property from t only: camera (push, moves,
 *   cuts, shake), light state (mode flips, flicker, lights out), then each registered anim(t)
 *   (objects, figures, overlays). Nothing depends on the previous frame, so seeking works both ways.
 * - Timing: templates find their spoken words (V.find, keyword props, starred stamp word, longest
 *   content word, narration estimate), then clamp() every beat into [0.2, duration - 1].
 * - Colours come from CSS variables (--ink, --paper, --void, --accent...), so light / dark mode and
 *   lights out are one class flip on the root.
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
  var FONT = 'Impact, Haettenschweiler, "Arial Narrow Bold", "Franklin Gothic Demi Cond", Oswald, "Roboto Condensed", "Liberation Sans Narrow", "Arial Narrow", "Arial Black", "Noto Sans", sans-serif';

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
  function normWord(s) {
    return String(s == null ? "" : s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
  }
  function fx01(v, total, d) { var n = num(v, d); return n > 1.5 ? n : n * total; } // 0-1 fraction or pixels
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
  // Keyframe track: base value, then segments {at, d, v, e}; the value at t chains every segment
  // that has started. Pure function of t.
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
  // Attribute / style setters that touch the DOM only when the value changes.
  function setA(el, k, v) { v = String(v); if (el["_a" + k] !== v) { el["_a" + k] = v; el.setAttribute(k, v); } }
  function setS(el, k, v) { v = String(v); if (el["_s" + k] !== v) { el["_s" + k] = v; el.style[k] = v; } }
  function showEl(el, on) { setS(el, "display", on ? "" : "none"); }

  // ------------------------- word timing -------------------------
  var STOP = {};
  "a an the and or but of to in on at by for with from into onto over under is are was were be been being it its this that these those your you we our us my me i his her their they them he she as than then so not no yes do does did have has had will would can could should very just more most less each every all any some about here there what when who how why which also too up out if dont don't never".split(" ").forEach(function (w) { STOP[normWord(w)] = 1; });
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
  function lastBeat() { return Math.max(0.3, D - (D < 4 ? D * 0.22 : 1.0)); }
  function beat(t, min) { return clamp(t, min == null ? 0.2 : min, lastBeat()); }
  // Order beats: each at least `gap` after the previous, all inside the scene; compress if needed.
  function orderBeats(ts, gap) {
    gap = gap == null ? 0.35 : gap;
    var out = ts.map(function (t) { return beat(t); });
    for (var i = 1; i < out.length; i++) if (out[i] < out[i - 1] + gap) out[i] = out[i - 1] + gap;
    var lim = lastBeat();
    if (out.length && out[out.length - 1] > lim) {
      for (i = out.length - 1; i >= 0; i--) { if (out[i] > lim) out[i] = lim; lim = out[i] - gap; }
      if (out[0] < 0.2) { var a = out[0], span = out[out.length - 1] - a || 1, k = (lastBeat() - 0.2) / span; out = out.map(function (t) { return 0.2 + (t - a) * k; }); }
    }
    return out;
  }
  function syncAt(word, after, fallback, lead) {
    var t = kwFind(word, after || 0);
    if (t == null) t = fallback != null ? fallback : (after || 0) + 0.6;
    return Math.max(0, t - (lead || 0));
  }

  // ------------------------- safe area -------------------------
  function safe() {
    var x0, y0, x1, y1;
    if (P) { x0 = W * 0.0556 + 4; x1 = W - x0; y0 = H * 0.1302 + 4; y1 = H * 0.7552 - 4; }
    else if (SQ) { x0 = W * 0.07 + 4; x1 = W - x0; y0 = H * 0.07 + 4; y1 = H - y0; }
    else { x0 = W * 0.07 + 4; x1 = W - x0; y0 = H * 0.0704 + 4; y1 = H - y0; }
    return { x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }

  // ------------------------- scene state -------------------------
  var st = null;
  function pictogram(root, o) {
    o = obj(o);
    root = root || V.root();
    while (root.firstChild) root.removeChild(root.firstChild);
    var sa = safe();
    var el = div("pg pg-light", root);
    var shake = div("pg-shake", el);
    var world = svg("svg", { class: "pg-world", width: W, height: H, viewBox: "0 0 " + W + " " + H }, shake);
    var defs = svg("defs", {}, world);
    var cam = svg("g", { class: "pg-cam" }, world);
    var masked = svg("g", { class: "pg-masked" }, cam);
    var L = {};
    ["wall", "back", "mid", "figs"].forEach(function (k) { L[k] = svg("g", { class: "pg-l-" + k }, masked); });
    ["beam", "front", "glow", "fx"].forEach(function (k) { L[k] = svg("g", { class: "pg-l-" + k }, cam); });
    var top = div("pg-top", shake); // the stinger: above the room, below marks and stamps
    var ov = div("pg-ov", shake);
    var ovsvg = svg("svg", { class: "pg-ovsvg", width: W, height: H, viewBox: "0 0 " + W + " " + H }, shake); // screen marks, above cards
    var vig = div("pg-vig", el);
    var blk = div("pg-black", el);
    var fl = div("pg-flash", el);
    blk.style.display = "none"; fl.style.display = "none";
    st = {
      root: root, el: el, shakeEl: shake, world: world, defs: defs, cam: cam, masked: masked, L: L, ovsvg: ovsvg, ov: ov, top: top,
      vig: vig, blk: blk, fl: fl, sa: sa, uid: 0, anims: [], items: [], figs: [], objs: [], room: null,
      mode: o.mode === "dark" ? "dark" : "light", modes: [], flickers: [], outs: [], flashes: [], blackouts: [], shakes: [],
      camTr: new Tr({ cx: W / 2, cy: H / 2, z: 1 }), push: num(o.push, 0.04), cursor: 0.3, cones: [], stingers: [],
      lastCls: "", vignette: o.vignette !== false,
    };
    // Room geometry: figure height, floor line, room span. The room is inset so the slow push-in keeps it inside the safe area.
    var k = 1 / (1 + st.push);
    if (P) {
      st.FH = Math.min(H * 0.235, W * 0.43);
      st.floor = sa.y0 + sa.h * 0.86;
      st.rx0 = W / 2 - (sa.w * k) / 2 + u(8); st.rx1 = W / 2 + (sa.w * k) / 2 - u(8);
    } else {
      st.FH = SQ ? H * 0.34 : H * 0.4;
      st.floor = SQ ? sa.y1 - sa.h * 0.14 : sa.y1 - sa.h * 0.13;
      st.rx0 = W / 2 - (sa.w * k) / 2 + u(10); st.rx1 = W / 2 + (sa.w * k) / 2 - u(10);
    }
    st.rw = st.rx1 - st.rx0;
    if (!st.vignette) vig.style.display = "none";
    V.onFrame(frame);
    var sc = { floor: st.floor, mx: sa.x0, my: sa.y0, portrait: P, square: SQ, landscape: !P && !SQ, fh: st.FH, rx0: st.rx0, rx1: st.rx1, safe: sa, el: el };
    st.sc = sc;
    return sc;
  }
  function ensure() { if (!st) pictogram(V.root(), {}); return st; }
  function uid(p) { return "pg" + (p || "") + ++st.uid; }
  function addAnim(f) { ensure().anims.push(f); }
  function addItem(kind, label, boxFn, world) { ensure().items.push({ kind: kind, label: label, box: boxFn, world: !!world }); }

  // ------------------------- camera, lights, shake -------------------------
  function camAt(t) {
    var c = st.camTr.val(t);
    var z = c.z * (1 + st.push * V.ease.inOutSine(clamp(t / D, 0, 1)));
    return { cx: c.cx, cy: c.cy, z: z };
  }
  function proj(x, y, c) { return [(x - c.cx) * c.z + W / 2, (y - c.cy) * c.z + H / 2]; }
  function projBox(b, c) { var p = proj(b.x, b.y, c); return { x: p[0], y: p[1], w: b.w * c.z, h: b.h * c.z }; }
  function unproj(x, y, c) { return [(x - W / 2) / c.z + c.cx, (y - H / 2) / c.z + c.cy]; }
  function cameraTo(c, at, dur, ease) { var s = ensure(); s.camTr.to(cleanCam(c), num(at, s.cursor), num(dur, 1.2), ease || "inOutCubic"); }
  function cameraCut(c, at) { var s = ensure(); s.camTr.set(cleanCam(c), num(at, s.cursor)); }
  function cleanCam(c) { c = obj(c); var o = {}; if (c.cx != null) o.cx = num(c.cx, W / 2); if (c.cy != null) o.cy = num(c.cy, H / 2); if (c.z != null) o.z = clamp(num(c.z, 1), 0.2, 6); return o; }
  function frameRect(r, at, dur) {
    r = rectOf(r) || { x: 0, y: 0, w: W, h: H };
    var sa = safe(), z = Math.min(sa.w / Math.max(1, r.w), sa.h / Math.max(1, r.h));
    cameraTo({ cx: r.x + r.w / 2, cy: r.y + r.h / 2, z: clamp(z, 0.3, 4) }, at, dur);
  }
  function shakeAt(t) {
    var x = 0, y = 0;
    st.shakes.forEach(function (s, i) {
      if (t < s.at || t > s.at + s.dur) return;
      var p = (t - s.at) / s.dur, a = s.amp * (1 - p) * (1 - p);
      x += a * Math.sin(t * 61 + i * 1.7) * 0.9 + a * Math.sin(t * 23 + i) * 0.4;
      y += a * Math.cos(t * 53 + i * 2.3) * 0.8;
    });
    return [x, y];
  }
  function shakeFx(at, dur, amp) { var s = ensure(); s.shakes.push({ at: num(at, s.cursor), dur: num(dur, 0.35), amp: num(amp, u(14)) }); }
  function setMode(mode, at) { var s = ensure(); s.modes.push({ at: num(at, s.cursor), mode: mode === "dark" ? "dark" : "light" }); s.modes.sort(function (a, b) { return a.at - b.at; }); }
  function modeAt(t) { var m = st.mode; st.modes.forEach(function (k) { if (t >= k.at) m = k.mode; }); return m; }
  function flicker(at, dur, density) { var s = ensure(); s.flickers.push({ at: num(at, s.cursor), dur: num(dur, 1.1), d: clamp(num(density, 0.45), 0.05, 0.95) }); }
  function lightsOut(at, until) { var s = ensure(); s.outs.push({ at: num(at, s.cursor), until: until == null ? 1e9 : num(until, 1e9) }); }
  function offAt(t) {
    for (var i = 0; i < st.outs.length; i++) if (t >= st.outs[i].at && t < st.outs[i].until) return true;
    for (i = 0; i < st.flickers.length; i++) {
      var f = st.flickers[i];
      if (t >= f.at && t < f.at + f.dur - 0.08) { var fr = Math.floor((t - f.at) * 15); if (fr === 0) return true; return hash(fr * 3.1 + i * 17 + f.at) < f.d; }
    }
    return false;
  }
  function flashFrame(at, dur, color) { var s = ensure(); s.flashes.push({ at: num(at, s.cursor), dur: num(dur, 0.09), c: color === "white" ? "#FFFFFF" : color === "black" ? "#000000" : "var(--accent)" }); }
  function blackout(at, dur, until) { var s = ensure(); s.blackouts.push({ at: num(at, s.cursor), dur: Math.max(0, num(dur, 0.6)), until: until == null ? 1e9 : num(until, 1e9) }); }

  function frame(t) {
    if (!st) return;
    var c = camAt(t), sh = shakeAt(t);
    setA(st.cam, "transform", "translate(" + f2(W / 2) + " " + f2(H / 2) + ") scale(" + c.z.toFixed(5) + ") translate(" + f2(-c.cx) + " " + f2(-c.cy) + ")");
    setS(st.shakeEl, "transform", "translate(" + f1(sh[0]) + "px," + f1(sh[1]) + "px)");
    var m = modeAt(t), off = offAt(t);
    var cls = "pg pg-" + m + (off ? " pg-off" : "") + (st.cones.length && conesOn(t) ? " pg-beam" : "");
    if (cls !== st.lastCls) { st.el.className = cls; st.lastCls = cls; }
    var fl = null;
    st.flashes.forEach(function (f) { if (t >= f.at && t < f.at + f.dur) fl = f.c; });
    showEl(st.fl, !!fl);
    if (fl) setS(st.fl, "background", fl);
    var bo = 0;
    st.blackouts.forEach(function (b) { if (t >= b.at && t < b.until) bo = Math.max(bo, b.dur > 0 ? clamp((t - b.at) / b.dur, 0, 1) : 1); });
    showEl(st.blk, bo > 0);
    if (bo > 0) setS(st.blk, "opacity", bo.toFixed(3));
    for (var i = 0; i < st.anims.length; i++) {
      try { st.anims[i](t, c); } catch (e) { V.error("[pictogram] " + (e && e.message ? e.message : e)); }
    }
  }
  function conesOn(t) { return st.cones.some(function (k) { return t >= k.at && t < k.until; }); }

  // ------------------------- path helpers (object box: height 100, bottom at y = 100) -------------------------
  function R(x, y, w, h, r) {
    r = Math.min(r || 0, w / 2, h / 2);
    if (!r) return "M" + f2(x) + " " + f2(y) + "h" + f2(w) + "v" + f2(h) + "h" + f2(-w) + "Z";
    return "M" + f2(x + r) + " " + f2(y) + "H" + f2(x + w - r) + "Q" + f2(x + w) + " " + f2(y) + " " + f2(x + w) + " " + f2(y + r) + "V" + f2(y + h - r) + "Q" + f2(x + w) + " " + f2(y + h) + " " + f2(x + w - r) + " " + f2(y + h) +
      "H" + f2(x + r) + "Q" + f2(x) + " " + f2(y + h) + " " + f2(x) + " " + f2(y + h - r) + "V" + f2(y + r) + "Q" + f2(x) + " " + f2(y) + " " + f2(x + r) + " " + f2(y) + "Z";
  }
  function C(cx, cy, r) { return "M" + f2(cx - r) + " " + f2(cy) + "a" + r + " " + r + " 0 1 0 " + f2(2 * r) + " 0a" + r + " " + r + " 0 1 0 " + f2(-2 * r) + " 0Z"; }
  function E(cx, cy, rx, ry) { return "M" + f2(cx - rx) + " " + f2(cy) + "a" + rx + " " + ry + " 0 1 0 " + f2(2 * rx) + " 0a" + rx + " " + ry + " 0 1 0 " + f2(-2 * rx) + " 0Z"; }
  function PL() {
    var a = [].slice.call(arguments), s = "";
    for (var i = 0; i < a.length; i++) s += (i ? "L" : "M") + f2(a[i][0]) + " " + f2(a[i][1]);
    return s + "Z";
  }
  function CAP(x1, y1, x2, y2, r) { // stadium between two points
    var dx = x2 - x1, dy = y2 - y1, l = Math.sqrt(dx * dx + dy * dy) || 1, nx = (-dy / l) * r, ny = (dx / l) * r;
    return "M" + f2(x1 + nx) + " " + f2(y1 + ny) + "L" + f2(x2 + nx) + " " + f2(y2 + ny) + "A" + r + " " + r + " 0 0 0 " + f2(x2 - nx) + " " + f2(y2 - ny) +
      "L" + f2(x1 - nx) + " " + f2(y1 - ny) + "A" + r + " " + r + " 0 0 0 " + f2(x1 + nx) + " " + f2(y1 + ny) + "Z";
  }
  function rotE(cx, cy, rx, ry, deg) {
    var a = rad(deg), dx = Math.cos(a) * rx, dy = Math.sin(a) * rx;
    return "M" + f2(cx - dx) + " " + f2(cy - dy) + "A" + rx + " " + ry + " " + f2(deg) + " 1 0 " + f2(cx + dx) + " " + f2(cy + dy) + "A" + rx + " " + ry + " " + f2(deg) + " 1 0 " + f2(cx - dx) + " " + f2(cy - dy) + "Z";
  }
  function rays(cx, cy, r0, r1, n, wdeg) {
    var out = "";
    for (var k = 0; k < n; k++) {
      var a = rad((k * 360) / n), b = rad(wdeg / 2);
      out += PL([cx + Math.cos(a - b) * r0, cy + Math.sin(a - b) * r0], [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1], [cx + Math.cos(a + b) * r0, cy + Math.sin(a + b) * r0]);
    }
    return out;
  }

  // ------------------------- pictogram objects -------------------------
  // Each part: [d, cls, name?, {sw, o:[ox,oy], hide, fr}] or { g: [parts], n: name, o, hide }.
  // cls: i ink, p paper (cut-out detail), a accent, y yellow, v void (dark opening), m muted, g glow, bg background,
  // w true white, pb paper with ink outline; a leading "-" makes it a stroke-only part (-i, -p, -a, -m).
  var OB = {};
  function ob(name, w, parts, extra) { OB[name] = Object.assign({ w: w, p: parts }, extra || {}); }
  function wheel(cx, cy, r, n) { return { n: n, o: [cx, cy], g: [[C(cx, cy, r), "i"], [C(cx, cy, r * 0.45), "p"], [R(cx - r * 0.1, cy - r * 0.45, r * 0.2, r * 0.9), "i"]] }; }
  ob("bed", 160, [[R(0, 24, 13, 76, 3), "i"], [R(147, 48, 13, 52, 3), "i"], [R(6, 56, 148, 23, 3), "i"], [R(17, 42, 34, 12, 6), "i"], [R(56, 57, 3.5, 21, 1.5), "p"]], { seat: 0.44, top: 0.56, under: 0.21 });
  ob("door", 46, [[R(5, 5, 36, 95), "v", "gap", { hide: true }], [R(0, 0, 46, 100) + R(5, 5, 36, 95), "i", null, { fr: "evenodd" }],
    [R(5.5, 5.5, 35, 94.5), "i", "panel"], [C(34, 56, 2.6), "p", "knob"]], { door: { hx: 5.5, y0: 5.5, y1: 100, pw: 35 } });
  ob("window", 84, [[R(9, 11, 66, 70), "p", "pane"], { n: "face", hide: true, g: [[E(42, 46, 13, 16), "v"], [PL([16, 81], [22, 62], [62, 62], [68, 81]), "v"], [E(37, 44, 2.6, 3.4), "w"], [E(47, 44, 2.6, 3.4), "w"], ["M34 53 Q42 59 50 53", "-w", null, { sw: 1.6 }]] },
    [R(9, 11, 11, 70), "i", "curtL", { o: [9, 46] }], [R(64, 11, 11, 70), "i", "curtR", { o: [75, 46] }],
    [R(40, 11, 4, 70), "i"], [R(9, 44, 66, 4), "i"], [R(4, 6, 76, 80) + R(9, 11, 66, 70), "i", null, { fr: "evenodd" }], [R(0, 85, 84, 7, 1.5), "i"]]);
  ob("phone", 52, [{ n: "waves", hide: true, g: [["M58 30 Q66 40 58 50", "-a", null, { sw: 4 }], ["M66 22 Q80 40 66 58", "-a", null, { sw: 4 }], ["M-6 30 Q-14 40 -6 50", "-a", null, { sw: 4 }], ["M-14 22 Q-28 40 -14 58", "-a", null, { sw: 4 }]] },
    [R(4, 0, 44, 100, 8), "i"], [R(9, 9, 34, 74, 2), "p", "screen"], [C(26, 91, 3.2), "p"]]);
  ob("clock", 100, [[C(50, 52, 47), "i"], [C(50, 52, 39), "p"], [R(48, 16, 4, 8), "i"], [R(48, 80, 4, 8), "i"], [R(14, 50, 8, 4), "i"], [R(78, 50, 8, 4), "i"],
    [R(47, 31, 6, 24, 3), "i", "hour", { o: [50, 52] }], [R(48.5, 19, 3, 36, 1.5), "i", "minute", { o: [50, 52] }], [C(50, 52, 4.5), "i"]], { clock: 1 });
  ob("clock-digital", 130, [[R(0, 30, 130, 62, 9), "i"], [R(8, 38, 114, 46, 4), "v"], [R(14, 92, 14, 8, 2), "i"], [R(102, 92, 14, 8, 2), "i"]], { clock: 1, text: { x: 65, y: 78, size: 38 } });
  ob("house", 110, [[PL([0, 48], [55, 4], [110, 48]), "i"], [R(78, 10, 11, 26), "i"], [R(12, 44, 86, 56), "i"], [R(46, 64, 18, 36), "p"], [R(21, 56, 17, 15), "p"], [R(72, 56, 17, 15), "p"]]);
  ob("car", 180, [["M6 80 L6 63 Q6 55 16 54 L44 51 L62 31 Q66 27 74 27 L122 27 Q130 27 136 33 L154 51 L168 54 Q176 56 176 65 L176 80 Z", "i"],
    ["M69 35 L57 51 L96 51 L96 35 Z", "p"], ["M102 35 L102 51 L146 51 L130 35 Z", "p"], [R(166, 59, 10, 7, 2), "y", "light"], wheel(46, 82, 16, "wheelA"), wheel(136, 82, 16, "wheelB")], { wheels: ["wheelA", "wheelB"] });
  ob("poster", 76, [[R(2, 1, 72, 98, 1), "pb", null, { sw: 3 }], [R(10, 8, 56, 14), "i"], [C(38, 52, 12), "i"], [E(27, 45, 5, 9), "i"], [E(49, 45, 5, 9), "i"], [E(38, 59, 7, 5), "i"], [C(34, 50, 1.6), "p"], [C(42, 50, 1.6), "p"],
    [R(12, 69, 52, 4), "i"], [R(12, 76, 40, 4), "i"], [R(10, 84, 6, 13), "i"], [R(19.5, 84, 6, 13), "i"], [R(29, 84, 6, 13), "i"], [R(38.5, 84, 6, 13), "i"], [R(48, 84, 6, 13), "i"], [R(57.5, 84, 6, 13), "i"]]);
  ob("lamp", 60, [[PL([6, 30], [54, 30], [92, 100], [-32, 100]), "g", "glow", { hide: true }], [PL([12, 4], [48, 4], [56, 30], [4, 30]), "i"], [R(28, 29, 4, 64), "i"], [R(14, 92, 32, 8, 3), "i"]], { light: 1 });
  ob("table-lamp", 54, [[PL([4, 62], [50, 62], [84, 100], [-30, 100]), "g", "glow", { hide: true }], [PL([10, 30], [44, 30], [52, 62], [2, 62]), "i"], [R(25, 61, 4, 24), "i"], [R(12, 84, 30, 16, 4), "i"]], { light: 1 });
  ob("nightstand", 64, [[R(0, 22, 64, 72, 3), "i"], [R(6, 55, 52, 3), "p"], [R(26, 37, 12, 4, 2), "p"], [R(26, 70, 12, 4, 2), "p"], [R(4, 92, 8, 8), "i"], [R(52, 92, 8, 8), "i"]]);
  ob("tv", 130, [[R(0, 6, 130, 78, 6), "i"], [R(8, 14, 114, 62, 2), "p", "screen"], { n: "static", hide: true, g: [] }, [PL([50, 84], [80, 84], [88, 100], [42, 100]), "i"]], { screen: [8, 14, 114, 62] });
  ob("couch", 170, [[R(14, 22, 142, 42, 10), "i"], [R(6, 56, 158, 23, 6), "i"], [R(0, 40, 24, 45, 8), "i"], [R(146, 40, 24, 45, 8), "i"], [R(10, 84, 8, 16), "i"], [R(152, 84, 8, 16), "i"], [R(83.5, 27, 3, 30), "p"]], { seat: 0.44 });
  ob("chair", 64, [[R(5, 6, 10, 94, 3), "i"], [R(5, 50, 54, 9, 2), "i"], [R(48, 52, 9, 48, 2), "i"]], { seat: 0.5 });
  ob("table", 130, [[R(0, 40, 130, 10, 3), "i"], [R(8, 48, 10, 52, 2), "i"], [R(112, 48, 10, 52, 2), "i"]], { top: 0.6 });
  ob("fridge", 64, [[R(2, 0, 60, 100, 6), "i"], [R(2, 34, 60, 3), "p"], [R(50, 12, 4, 16, 2), "p"], [R(50, 44, 4, 24, 2), "p"]]);
  ob("laptop", 110, [[R(14, 40, 82, 50, 4), "i"], [R(20, 46, 70, 38, 1), "p", "screen"], [PL([2, 90], [108, 90], [110, 100], [0, 100]), "i"]]);
  ob("stairs", 130, [[PL([0, 100], [0, 80], [26, 80], [26, 60], [52, 60], [52, 40], [78, 40], [78, 20], [104, 20], [104, 0], [130, 0], [130, 100]), "i"]]);
  ob("tree", 100, [[R(44, 56, 12, 44, 2), "i"], [C(50, 34, 30), "i"], [C(28, 50, 21), "i"], [C(72, 50, 21), "i"]]);
  ob("pine", 74, [[PL([37, 0], [60, 30], [50, 30], [68, 56], [56, 56], [74, 84], [0, 84], [18, 56], [6, 56], [24, 30], [14, 30]), "i"], [R(32, 83, 10, 17), "i"]]);
  ob("moon", 100, [[C(50, 52, 40), "i"], [C(70, 40, 34), "bg"]]);
  ob("key", 110, [[C(26, 50, 21) + C(26, 50, 9), "i", null, { fr: "evenodd" }], [R(44, 45, 64, 10, 2), "i"], [R(84, 54, 8, 15), "i"], [R(98, 54, 8, 11), "i"]]);
  ob("bag", 84, [["M26 38 C26 8 58 8 58 38", "-i", null, { sw: 7 }], [R(4, 34, 76, 66, 10), "i"], [R(4, 56, 76, 3), "p"], [R(36, 52, 12, 11, 2), "p"]]);
  ob("cup", 82, [["M60 46 C82 46 82 78 58 78", "-i", null, { sw: 8 }], [PL([6, 30], [64, 30], [59, 100], [11, 100]), "i"], ["M24 22 C18 14 30 8 24 0", "-m", null, { sw: 4 }], ["M44 22 C38 14 50 8 44 0", "-m", null, { sw: 4 }]]);
  ob("bath", 180, [[R(150, 12, 8, 28, 2), "i"], [R(132, 10, 26, 7, 3), "i"], ["M4 42 L176 42 L176 54 Q176 92 140 92 L40 92 Q4 92 4 54 Z", "i"], [R(0, 37, 180, 8, 3), "i"], [R(30, 88, 11, 12, 3), "i"], [R(139, 88, 11, 12, 3), "i"]]);
  ob("mirror", 64, [[E(32, 48, 28, 44), "i"], [E(32, 48, 21, 36), "p", "glass"], ["M20 40 L30 28 M22 52 L38 32", "-m", null, { sw: 2.5 }], { n: "face", hide: true, g: [[E(32, 44, 10, 13), "v"], [E(28, 42, 2.2, 3), "w"], [E(36, 42, 2.2, 3), "w"], ["M26 50 Q32 55 38 50", "-w", null, { sw: 1.4 }]] }]);
  ob("sink", 84, [[R(38, 14, 8, 18, 2), "i"], [R(38, 13, 24, 6, 3), "i"], ["M0 30 L84 30 L78 52 Q74 60 64 60 L20 60 Q10 60 6 52 Z", "i"], [PL([32, 58], [52, 58], [56, 100], [28, 100]), "i"]]);
  ob("wardrobe", 96, [[R(50, 4, 42, 92), "v", "gap", { hide: true }], [R(0, 0, 96, 100, 4), "i"], [R(46.5, 4, 3, 92), "p"], [C(40, 52, 3), "p"],
    [R(50, 4, 42, 92, 2), "i", "panel"], [C(56, 52, 3), "p", "knob"]], { door: { hx: 92, y0: 4, y1: 96, pw: -42 } });
  ob("mailbox", 74, [[R(32, 46, 10, 54), "i"], ["M6 48 L6 22 Q6 6 26 6 L58 6 Q70 6 70 22 L70 48 Z", "i"], [R(14, 25, 28, 4, 2), "p"], [R(70, 8, 3, 26), "a"], [R(70, 8, 13, 9), "a"]]);
  ob("bus", 240, [[R(0, 10, 240, 72, 10), "i"], [R(14, 20, 28, 26, 3), "p"], [R(50, 20, 28, 26, 3), "p"], [R(86, 20, 28, 26, 3), "p"], [R(122, 20, 28, 26, 3), "p"], [R(158, 20, 28, 26, 3), "p"], [R(198, 20, 26, 50, 2), "p"],
    [R(228, 58, 10, 8, 2), "y", "light"], wheel(52, 84, 16, "wheelA"), wheel(184, 84, 16, "wheelB")], { wheels: ["wheelA", "wheelB"] });
  ob("lamppost", 36, [[PL([10, 22], [26, 22], [76, 100], [-40, 100]), "g", "glow", { hide: true }], [R(15, 20, 6, 80), "i"], [R(8, 92, 20, 8, 2), "i"], [PL([1, 8], [35, 8], [27, 22], [9, 22]), "i"], [R(7, 2, 22, 7, 3), "i"]], { light: 1 });
  ob("sign", 70, [[R(31, 44, 8, 56), "i"], [R(2, 4, 66, 42, 4), "i"], [R(12, 16, 46, 5), "p"], [R(12, 28, 30, 5), "p"]]);
  (function () {
    var o = [], k;
    for (k = 0; k < 8; k++) { var a = rad(22.5 + k * 45); o.push([35 + Math.cos(a) * 34, 34 + Math.sin(a) * 34]); }
    ob("stop-sign", 70, [[R(31, 64, 8, 36), "i"], [PL.apply(null, o), "a"], [R(13, 29, 44, 10), "p"]]);
    ob("sun", 100, [[rays(50, 50, 30, 48, 8, 22), "i"], [C(50, 50, 24), "i"]]);
  })();
  ob("eye", 150, [["M4 50 Q75 -12 146 50 Q75 112 4 50 Z", "i"], [C(75, 50, 25), "p"], [C(75, 50, 12), "i", "pupil"], [C(83, 42, 4), "p"]]);
  ob("hand", 80, [[R(14, 40, 54, 56, 14), "i"], [R(14, 8, 11, 44, 5.5), "i"], [R(28, 2, 11, 48, 5.5), "i"], [R(42, 4, 11, 46, 5.5), "i"], [R(56, 14, 11, 40, 5.5), "i"], ["M16 70 L2 48 Q-2 41 4 38 Q10 36 13 42 L26 58 Z", "i"]]);
  (function () {
    var feet = [[16, 84, -8], [44, 64, 8], [76, 84, -8], [104, 64, 8]], parts = [];
    feet.forEach(function (f, i) { parts.push({ n: "f" + i, g: [[E(f[0], f[1], 8, 12), "i"], [E(f[0] + f[2] * 0.15, f[1] - 18, 6, 5), "i"]] }); });
    ob("footprints", 120, parts);
  })();
  ob("pill", 110, [[CAP(18, 76, 55, 50, 17), "i"], [CAP(55, 50, 92, 24, 17), "pb", null, { sw: 3 }], [CAP(54, 50, 56, 49, 1), "i"]]);
  ob("flashlight", 130, [[PL([104, 32], [260, -10], [260, 110], [104, 68]), "g", "glow", { hide: true }], [R(4, 40, 70, 20, 4), "i"], [PL([74, 34], [100, 26], [100, 74], [74, 66]), "i"], [R(98, 28, 6, 44, 2), "p"], [R(30, 35, 12, 6, 2), "i"]], { light: 1 });
  ob("candle", 44, [[R(10, 40, 24, 60, 3), "i"], [R(20.8, 29, 2.6, 13), "i"], ["M22 2 C34 16 32 30 22 32 C12 30 10 16 22 2 Z", "a", "flame", { o: [22, 32] }]], { light: 1, lit: 1 });
  ob("radio", 120, [["M90 32 L112 2", "-i", null, { sw: 4 }], [R(0, 30, 120, 66, 8), "i"], [C(36, 63, 20), "p"], [C(36, 63, 8), "i"], [R(70, 48, 36, 10, 2), "p"], [C(77, 78, 5), "p"], [C(98, 78, 5), "p"]]);
  ob("camera", 120, [[R(20, 14, 34, 16, 4), "i"], [R(0, 26, 120, 70, 10), "i"], [C(64, 61, 25), "p"], [C(64, 61, 16), "i"], [C(71, 54, 4), "p"], [R(92, 34, 18, 10, 2), "p"]]);
  ob("envelope", 130, [[R(0, 20, 130, 80, 4), "i"], ["M5 25 L65 66 L125 25", "-p", null, { sw: 5 }]]);
  ob("box", 110, [[R(0, 26, 110, 74, 2), "i"], [R(0, 41, 110, 3), "p"], [R(49, 26, 12, 15), "p"]]);
  ob("bench", 160, [[R(14, 22, 8, 30), "i"], [R(138, 22, 8, 30), "i"], [R(0, 20, 160, 10, 3), "i"], [R(0, 46, 160, 10, 3), "i"], [R(12, 54, 10, 46), "i"], [R(138, 54, 10, 46), "i"]], { seat: 0.5 });
  ob("plant", 70, [["M35 62 C10 50 8 26 20 14 C30 30 36 44 35 62 Z", "i"], ["M35 62 C60 50 62 26 50 14 C40 30 34 44 35 62 Z", "i"], ["M35 62 C26 40 28 16 35 2 C42 16 44 40 35 62 Z", "i"],
    [PL([14, 66], [56, 66], [50, 100], [20, 100]), "i"], [R(10, 61, 50, 8, 2), "i"]]);
  ob("frame", 84, [[R(0, 0, 84, 100, 2), "i"], [R(8, 8, 68, 84), "p"], [C(42, 38, 11), "i"], ["M24 92 L26 66 Q28 54 42 54 Q56 54 58 66 L60 92 Z", "i"]]);
  ob("teddy", 80, [[C(19, 20, 10), "i"], [C(61, 20, 10), "i"], [C(40, 33, 21), "i"], [E(40, 72, 24, 26), "i"], [E(13, 64, 9, 14), "i"], [E(67, 64, 9, 14), "i"], [E(24, 93, 11, 7), "i"], [E(56, 93, 11, 7), "i"],
    [E(40, 41, 8, 6), "p"], [C(32, 29, 2.6), "p"], [C(48, 29, 2.6), "p"]]);
  (function () {
    var parts = [[R(0, 36, 200, 8), "i"], [R(0, 72, 200, 8), "i"]];
    for (var i = 0; i < 7; i++) { var x = 4 + i * 28; parts.push([PL([x, 100], [x, 18], [x + 8, 8], [x + 16, 18], [x + 16, 100]), "i"]); }
    ob("fence", 200, parts);
    var rails = [[R(4, 0, 8, 100, 2), "i"], [R(42, 0, 8, 100, 2), "i"]];
    for (i = 0; i < 5; i++) rails.push([R(8, 12 + i * 19, 38, 6, 1), "i"]);
    ob("ladder", 54, rails);
    var crib = [[R(0, 30, 150, 8, 2), "i"], [R(0, 78, 150, 8, 2), "i"], [R(0, 20, 10, 80, 2), "i"], [R(140, 20, 10, 80, 2), "i"]];
    for (i = 0; i < 8; i++) crib.push([R(18 + i * 16, 37, 6, 42), "i"]);
    ob("crib", 150, crib);
  })();
  ob("stone", 110, [["M6 100 C0 70 18 44 46 40 C72 36 100 52 106 80 L108 100 Z", "i"], ["M46 58 L54 70 L48 84", "-p", null, { sw: 3 }]]);
  ob("bowl", 100, [[PL([2, 62], [98, 62], [86, 100], [14, 100]), "i"], [R(-2, 57, 104, 9, 4), "i"], [R(12, 75, 76, 4), "p"]]);
  ob("bone", 120, [[R(18, 43, 84, 14, 5), "i"], [C(18, 41, 12), "i"], [C(18, 59, 12), "i"], [C(102, 41, 12), "i"], [C(102, 59, 12), "i"]]);
  ob("shelf", 130, [[R(10, 30, 14, 42, 1), "i"], [R(26, 38, 12, 34, 1), "i"], [R(40, 26, 16, 46, 1), "i"], [R(58, 44, 10, 28, 1), "i"], [R(86, 46, 26, 26, 5), "i"], [R(0, 72, 130, 8, 2), "i"], [PL([10, 80], [26, 80], [10, 96]), "i"], [PL([104, 80], [120, 80], [120, 96]), "i"]]);
  ob("bulb", 50, [[C(25, 76, 36), "g", "glow", { hide: true }], [R(23.5, -40, 3, 84), "i"], [R(17, 42, 16, 13, 2), "i"], ["M25 54 C8 58 5 82 14 91 C19 97 31 97 36 91 C45 82 42 58 25 54 Z", "i", "glass"]], { light: 1 });
  ob("doormat", 150, [[R(0, 84, 150, 16, 3), "i"], [R(12, 89.5, 126, 3), "p"], [R(12, 94.5, 126, 2), "p"]]);
  ob("keyhole", 60, [[R(4, 0, 52, 100, 8), "i"], [C(30, 38, 10), "p"], [PL([25, 42], [35, 42], [40, 74], [20, 74]), "p"]]);
  ob("umbrella", 110, [[R(53, 6, 4, 14, 2), "i"], ["M2 50 C6 12 104 12 108 50 C98 42 88 42 82 50 C74 42 64 42 55 50 C46 42 36 42 28 50 C20 42 10 42 2 50 Z", "i"], [R(53, 40, 4, 46), "i"], ["M55 84 C55 99 39 99 39 88", "-i", null, { sw: 4 }]]);
  ob("monitor", 120, [[R(0, 4, 120, 72, 5), "i"], [R(7, 11, 106, 58, 1), "p", "screen"], [R(54, 75, 12, 16), "i"], [R(34, 90, 52, 10, 4), "i"]]);
  ob("mask", 90, [[E(45, 52, 36, 47), "i"], [E(31, 44, 8, 5), "p"], [E(59, 44, 8, 5), "p"], [R(33, 72, 24, 3.5, 1.5), "p"]]);
  ob("skull", 84, [[C(42, 40, 36), "i"], [R(22, 60, 40, 32, 6), "i"], [E(29, 42, 9, 10), "p"], [E(55, 42, 9, 10), "p"], [PL([42, 52], [37, 62], [47, 62]), "p"], [R(28, 78, 4, 12), "p"], [R(36, 78, 4, 12), "p"], [R(44, 78, 4, 12), "p"], [R(52, 78, 4, 12), "p"]]);
  ob("cross", 64, [[R(26, 0, 12, 100, 2), "i"], [R(6, 22, 52, 12, 2), "i"]]);
  ob("check", 110, [["M10 54 L40 84 L100 16", "-i", null, { sw: 16 }]]);
  ob("triangle", 116, [[PL([58, 2], [114, 98], [2, 98]), "i"], [PL([58, 19], [100, 90], [16, 90]), "y"], [R(53, 40, 10, 30, 4), "i"], [C(58, 80, 6), "i"]]);
  (function () {
    var road = [[R(0, 82, 300, 18), "i"]];
    for (var i = 0; i < 5; i++) road.push([R(16 + i * 60, 89, 32, 4), "p"]);
    ob("road", 300, road);
  })();
  ob("bus-stop", 70, [[R(31, 20, 8, 80), "i"], [R(24, 94, 22, 6, 2), "i"], [R(9, 0, 52, 38, 6), "i"], [R(17, 8, 36, 20, 3), "p"], [R(20, 11, 13, 7), "i"], [R(36, 11, 14, 7), "i"], [C(24, 28, 3), "i"], [C(46, 28, 3), "i"]]);
  ob("bush", 120, [[C(30, 70, 28), "i"], [C(60, 56, 33), "i"], [C(92, 72, 26), "i"], [R(4, 72, 112, 28, 4), "i"]]);
  ob("cloud", 140, [[C(40, 62, 24), "m"], [C(72, 46, 30), "m"], [C(104, 62, 24), "m"], [R(16, 60, 112, 26, 13), "m"]]);
  ob("grave", 76, [["M5 98 L5 34 C5 4 71 4 71 34 L71 98 Z", "i"], [R(34, 20, 8, 40), "p"], [R(24, 30, 28, 8), "p"], [E(38, 99, 44, 5), "i"]]);
  ob("cradle", 130, [["M8 88 Q65 104 122 88", "-i", null, { sw: 7 }], [R(30, 74, 7, 18), "i"], [R(93, 74, 7, 18), "i"], ["M10 42 L120 42 Q120 80 65 80 Q10 80 10 42 Z", "i"], ["M10 42 Q10 6 54 8 L54 42 Z", "i"]]);
  ob("cake", 100, [[R(4, 62, 92, 38, 4), "i"], [R(18, 32, 64, 32, 4), "i"], [R(4, 70, 92, 4), "p"], [R(18, 40, 64, 4), "p"], [R(47, 12, 6, 21), "i"], ["M50 -4 C57 4 56 10 50 11 C44 10 43 4 50 -4 Z", "a", "flame", { o: [50, 11] }]], { light: 1, lit: 1 });

  var OBJ_SYN = {
    curtain: "window", curtains: "window", glass: "window", television: "tv", telly: "tv", screen: "tv", sofa: "couch", picture: "frame", photo: "frame", painting: "frame", portrait: "frame",
    bear: "teddy", toy: "teddy", light: "bulb", lightbulb: "bulb", torch: "flashlight", letter: "envelope", mail: "envelope", note: "envelope", computer: "monitor", pc: "laptop",
    mobile: "phone", cell: "phone", cellphone: "phone", smartphone: "phone", call: "phone", text: "phone", message: "phone", time: "clock", midnight: "clock", alarm: "clock-digital",
    gate: "fence", rock: "stone", baby: "crib", flower: "plant", bathtub: "bath", tub: "bath", toilet: "sink", closet: "wardrobe", cupboard: "wardrobe", cabinet: "wardrobe",
    headstone: "grave", tomb: "grave", cemetery: "grave", graveyard: "grave", medicine: "pill", pills: "pill", food: "bowl", warning: "triangle", danger: "triangle", stop: "stop-sign",
    vehicle: "car", truck: "car", school: "bus", street: "road", lampost: "lamppost", streetlight: "lamppost", keys: "key", lock: "keyhole", eyes: "eye", hands: "hand", footprint: "footprints",
    steps: "footprints", footsteps: "footprints", stair: "stairs", staircase: "stairs", basement: "stairs", birthday: "cake", mug: "cup", coffee: "cup", backpack: "bag", purse: "bag",
    rain: "umbrella", bush: "bush", hedge: "bush", forest: "pine", woods: "pine", night: "moon", moonlight: "moon", day: "sun", morning: "sun", package: "box", parcel: "box", delivery: "box",
    knife: "mask", face: "mask", tape: "radio", music: "radio", photo2: "camera", record: "camera", table2: "table", desk: "table", kitchen: "fridge", seat: "chair", bedroom: "bed", sleep: "bed",
    room: "door", entrance: "door", knock: "door", knocking: "door", ok: "check", yes: "check", dead: "skull", death: "skull", church: "cross", prayer: "cross", candles: "candle", fire: "candle",
    radio: "radio", sign: "sign", notice: "sign", missing: "poster", flyer: "poster", posters: "poster", tree: "tree", trees: "tree", pinetree: "pine", window: "window", windows: "window",
  };
  function objectKey(n) {
    n = str(n).toLowerCase().replace(/\s+/g, "-");
    if (OB[n]) return n;
    var k = n.replace(/-/g, "");
    if (OB[k]) return k;
    if (OBJ_SYN[k] && OB[OBJ_SYN[k]]) return OBJ_SYN[k];
    if (/s$/.test(k) && OB[k.slice(0, -1)]) return k.slice(0, -1);
    return null;
  }
  function pickObject(text) {
    var ws = String(text || "").toLowerCase().replace(/\*/g, "").split(/[^\p{L}\p{N}-]+/u);
    for (var i = 0; i < ws.length; i++) { var k = objectKey(ws[i]); if (k) return k; }
    return "triangle";
  }

  // ------------------------- object instances -------------------------
  function clsOf(c) { return c && c[0] === "-" ? "ps-" + c.slice(1) : "pf-" + c; }
  function buildPart(pp, parent, parts) {
    var el, name, o;
    if (Array.isArray(pp)) {
      el = svg("path", { d: pp[0], class: clsOf(pp[1]) }, parent);
      name = pp[2]; o = pp[3] || {};
      if (o.sw) el.setAttribute("stroke-width", o.sw);
      if (o.fr) el.setAttribute("fill-rule", o.fr);
    } else {
      el = svg("g", {}, parent);
      (pp.g || []).forEach(function (q) { buildPart(q, el, parts); });
      name = pp.n; o = pp;
    }
    if (name) parts[name] = { el: el, ox: (o.o || [0, 0])[0], oy: (o.o || [0, 0])[1], tr: new Tr({ rot: 0, dx: 0, dy: 0, op: o.hide ? 0 : 1, sx: 1, sy: 1 }) };
    return el;
  }
  // A standalone pictogram drawn into `parent` (any SVG group) in a 100-high box at (0..w, 0..100).
  function drawDef(key, parent) {
    var def = OB[key], parts = {};
    def.p.forEach(function (pp) { buildPart(pp, parent, parts); });
    return parts;
  }
  function parseClock(s) {
    var m = /(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*([ap]\.?m\.?)?/i.exec(str(s));
    if (!m) return null;
    var h = +m[1] % 24, mi = +(m[2] || 0), se = +(m[3] || 0), ap = (m[4] || "").toLowerCase();
    if (ap[0] === "p" && h < 12) h += 12;
    if (ap[0] === "a" && h === 12) h = 0;
    return h * 60 + mi + se / 60;
  }
  function fmtClock(mins, ap, secs) {
    mins = ((mins % 1440) + 1440) % 1440;
    var h = Math.floor(mins / 60), m = Math.floor(mins % 60), s = Math.floor((mins * 60) % 60);
    var hh = ap ? (h % 12 === 0 ? 12 : h % 12) : h;
    return hh + ":" + (m < 10 ? "0" : "") + m + (secs ? ":" + (s < 10 ? "0" : "") + s : "") + (ap ? (h < 12 ? " AM" : " PM") : "");
  }

  function makeObject(name, o) {
    var s = ensure();
    o = obj(o);
    var key = objectKey(name) || "box", def = OB[key];
    var size = Math.max(4, num(o.size, s.FH * 0.5));
    var layer = s.L[o.layer] || s.L.mid;
    var g = svg("g", { class: "pg-obj pg-o-" + key + (o.accent ? " pg-acc" : "") }, layer);
    var inner = svg("g", { transform: "translate(" + -def.w / 2 + " -100)" }, g);
    var parts = {};
    def.p.forEach(function (pp) { buildPart(pp, inner, parts); });
    if (parts.panel) parts.panel.el.setAttribute("class", "pf-i pg-panel");
    var it = {
      kind: "object", name: key, def: def, g: g, inner: inner, parts: parts, size: size, w: (size * def.w) / 100, flip: !!o.flip,
      tr: new Tr({ x: num(o.x, W / 2), y: num(o.y, s.floor), s: 1, rot: num(o.rot, 0), op: 1 }), vis: new Tr(1),
      popAt: o.at == null ? 0 : num(o.at, 0), pop: o.pop !== false && o.at != null && num(o.at, 0) > 0.05,
      openTr: new Tr(0), openDeg: 72, curtTr: new Tr(clamp(num(o.curtains, 0), 0, 1)), lightTr: new Tr(o.lit != null ? (o.lit ? 1 : 0) : def.lit ? 1 : 0),
      rollTr: new Tr(0), statics: [], label: str(o.label) || key, isObj: true,
    };
    if (def.clock) {
      it.timeTr = new Tr(parseClock(o.time || "2:00") || 120);
      it.ampm = /[ap]m/i.test(str(o.time));
    }
    if (def.text) {
      it.textEl = svg("text", { x: def.text.x, y: def.text.y, "font-size": def.text.size, "text-anchor": "middle", class: "pg-dtext" }, inner);
    }
    if (def.screen) {
      var sr = def.screen, sg = parts["static"].el;
      for (var i = 0; i < 26; i++) it.statics.push(svg("rect", { x: sr[0], y: sr[1], width: 4, height: 3, class: i % 3 ? "pf-i" : "pf-m" }, sg));
    }
    // methods
    it.to = function (v, at, dur, ease) { it.tr.to(cleanXY(v), num(at, s.cursor), num(dur, 0.6), ease || "inOutCubic"); return it; };
    it.fade = function (to, at, dur) { it.tr.to({ op: clamp(num(to, 0), 0, 1) }, num(at, s.cursor), num(dur, 0.3), "linear"); return it; };
    it.show = function (at) { it.vis.set(1, num(at, s.cursor)); return it; };
    it.hide = function (at) { it.vis.set(0, num(at, s.cursor)); return it; };
    it.pop = function (at) { it.popAt = num(at, s.cursor); it.pop = true; return it; };
    it.box = function (t) { return objBox(it, t == null ? D : t); };
    it.open = function (at, deg, dur) { if (deg != null) it.openDeg = clamp(num(deg, 72), 5, 88); it.openTr.to(1, num(at, s.cursor), num(dur, 0.55), "outCubic"); return it; };
    it.close = function (at, dur) { it.openTr.to(0, num(at, s.cursor), num(dur, 0.16), "inQuad"); return it; };
    it.curtains = function (v, at, dur) { it.curtTr.to(clamp(num(v, 1), 0, 1), num(at, s.cursor), num(dur, 0.6), "inOutCubic"); return it; };
    it.setTime = function (txt, at, dur) { if (it.timeTr) { var m = parseClock(txt); if (m != null) { if (/[ap]m/i.test(str(txt))) it.ampm = true; it.timeTr.to(m, num(at, s.cursor), num(dur, 0), "inOutSine"); } } return it; };
    it.light = function (on, at) { it.lightTr.set(on === false || on === 0 ? 0 : 1, num(at, s.cursor)); return it; };
    it.roll = function (at, dur, turns) { it.rollTr.to(360 * num(turns, 3), num(at, s.cursor), num(dur, 1), "inOutSine"); return it; };
    it.staticOn = function (at, until) { (it.staticR = it.staticR || []).push([num(at, s.cursor), until == null ? 1e9 : num(until, 1e9)]); return it; };
    it.part = function (pn, v, at, dur, ease) { var pt = parts[pn]; if (pt) pt.tr.to(obj(v), num(at, s.cursor), num(dur, 0.3), ease || "inOutCubic"); return it; };
    it.shakeAt = function (at, dur, amp) { (it.wob = it.wob || []).push([num(at, s.cursor), num(dur, 0.5), num(amp, 4)]); return it; };
    it.center = function (t) { var b = it.box(t); return [b.x + b.w / 2, b.y + b.h / 2]; };
    addAnim(function (t) { updObject(it, t); });
    addItem("object", key, function (t) { return objVisible(it, t) ? objBox(it, t) : null; }, true);
    s.objs.push(it);
    return it;
  }
  function cleanXY(v) { v = obj(v); var o = {}; ["x", "y", "s", "rot", "op"].forEach(function (k) { if (v[k] != null && isFinite(+v[k])) o[k] = +v[k]; }); return o; }
  function objVisible(it, t) { return t >= it.popAt && it.vis.val(t) > 0.5 && it.tr.val(t).op > 0.02; }
  function posOf(it, t) {
    var v = it.tr.val(t);
    if (it.follow) { var fp = it.follow(t); return { x: fp[0], y: fp[1], s: v.s, rot: fp[2] || 0, op: v.op }; }
    return v;
  }
  function objBox(it, t) {
    var v = posOf(it, t), sc = v.s, w = it.w * sc, h = it.size * sc;
    return { x: v.x - w / 2, y: v.y - (it.anchorMid ? h / 2 : h), w: w, h: h };
  }
  function popScale(t, at) {
    var p = (t - at) / 0.2;
    if (p >= 1) return 1;
    if (p < 0) return 0;
    return 0.55 + 0.45 * V.ease.outBack(p);
  }
  function updObject(it, t) {
    var on = objVisible(it, t);
    showEl(it.g, on);
    if (!on) return;
    var v = posOf(it, t), sc = (it.size / 100) * v.s * (it.pop ? popScale(t, it.popAt) : 1), rot = v.rot;
    if (it.wob) it.wob.forEach(function (w) { if (t >= w[0] && t < w[0] + w[1]) { var p = (t - w[0]) / w[1]; rot += w[2] * (1 - p) * Math.sin((t - w[0]) * 70); } });
    setA(it.g, "transform", "translate(" + f2(v.x) + " " + f2(v.y) + ") rotate(" + f2(rot) + ") scale(" + (it.flip ? -sc : sc).toFixed(4) + " " + sc.toFixed(4) + ")");
    setA(it.g, "opacity", v.op >= 0.999 ? 1 : v.op.toFixed(3));
    var def = it.def, P_ = it.parts;
    // door / wardrobe panel
    if (def.door) {
      var a = it.openTr.val(t), dd = def.door, th = rad(a * it.openDeg), c = Math.cos(th), sn = Math.sin(th);
      var fx = dd.hx + dd.pw * c;
      var d = PL([dd.hx, dd.y0], [fx, dd.y0 - 6 * sn], [fx, dd.y1], [dd.hx, dd.y1]);
      setA(P_.panel.el, "d", d);
      if (P_.gap) showEl(P_.gap.el, a > 0.01);
      if (P_.knob) setA(P_.knob.el, "transform", "translate(" + f2(dd.pw * 0.82 * (c - 1)) + " 0)");
    }
    // clocks
    if (it.timeTr) {
      var mins = it.timeTr.val(t);
      if (P_.hour) {
        setA(P_.hour.el, "transform", "rotate(" + f2(((mins / 60) % 12) * 30) + " 50 52)");
        setA(P_.minute.el, "transform", "rotate(" + f2((mins % 60) * 6) + " 50 52)");
      }
      if (it.textEl) { var tx = fmtClock(mins, false); if (it.textEl._t !== tx) { it.textEl._t = tx; it.textEl.textContent = tx; } }
    }
    // curtains
    if (P_.curtL) {
      var cv = it.curtTr.val(t), k = 1 + cv * (33 / 11 - 1);
      setA(P_.curtL.el, "transform", "translate(9 0) scale(" + f2(k) + " 1) translate(-9 0)");
      setA(P_.curtR.el, "transform", "translate(75 0) scale(" + f2(k) + " 1) translate(-75 0)");
    }
    // lights
    if (def.light) {
      var lit = it.lightTr.val(t) > 0.5;
      if (P_.glow) showEl(P_.glow.el, lit);
      if (P_.flame) {
        showEl(P_.flame.el, lit);
        var fk = 1 + 0.08 * Math.sin(t * 17) + 0.05 * Math.sin(t * 31);
        setA(P_.flame.el, "transform", "translate(" + P_.flame.ox + " " + P_.flame.oy + ") scale(" + f2(1 / fk) + " " + f2(fk) + ") translate(" + -P_.flame.ox + " " + -P_.flame.oy + ")");
      }
      if (P_.glass) setA(P_.glass.el, "class", lit ? "pf-y" : "pf-i");
    }
    // wheels
    if (def.wheels) { var r = it.rollTr.val(t); def.wheels.forEach(function (wn) { var wp = P_[wn]; setA(wp.el, "transform", "rotate(" + f2(r) + " " + wp.ox + " " + wp.oy + ")"); }); }
    // tv static
    if (it.statics.length) {
      var sOn = (it.staticR || []).some(function (q) { return t >= q[0] && t < q[1]; });
      showEl(P_["static"].el, sOn);
      setA(P_.screen.el, "class", sOn ? "pf-p" : "pf-p");
      if (sOn) {
        var fr = Math.floor(t * 20), sr = def.screen;
        it.statics.forEach(function (rc, i) {
          var hx = hash(fr * 41 + i * 7.3), hy = hash(fr * 13 + i * 3.1), hw = hash(fr * 5 + i);
          setA(rc, "x", f1(sr[0] + hx * (sr[2] - 18))); setA(rc, "y", f1(sr[1] + hy * (sr[3] - 4))); setA(rc, "width", f1(6 + hw * 14)); setA(rc, "height", f1(2 + hw * 3));
        });
      }
    }
    // generic named-part tracks (rot, dx, dy, op, sx, sy)
    for (var pn in P_) {
      var pt = P_[pn];
      if (!pt.tr.k.length && pt.tr.base.op === 1) continue;
      if (pn === "static" || pn === "glow" || pn === "flame" || pn === "panel" || pn === "gap" || pn === "knob" || pn === "curtL" || pn === "curtR") { if (!pt.tr.k.length) continue; }
      var q = pt.tr.val(t);
      if (pt.tr.k.length) setA(pt.el, "transform", "translate(" + f2(q.dx + pt.ox) + " " + f2(q.dy + pt.oy) + ") rotate(" + f2(q.rot) + ") scale(" + f2(q.sx) + " " + f2(q.sy) + ") translate(" + -pt.ox + " " + -pt.oy + ")");
      showEl(pt.el, q.op > 0.02);
      if (q.op > 0.02 && q.op < 0.999) setA(pt.el, "opacity", q.op.toFixed(3));
    }
  }

  // ------------------------- the cast -------------------------
  // scale: height relative to the protagonist's height (FH).
  var CAST = {
    you: { kind: "person", scale: 1, look: "plain" },
    mom: { kind: "person", scale: 0.96, look: "plain", dress: 1, bun: 1 },
    dad: { kind: "person", scale: 1.04, look: "plain", cap: 1, broad: 1.15 },
    kid: { kind: "person", scale: 0.64, look: "plain", kid: 1 },
    grandma: { kind: "person", scale: 0.9, look: "plain", dress: 1, bun: 1, cane: 1, stoop: 10 },
    friend: { kind: "person", scale: 1, look: "plain", cap: -1 },
    stranger: { kind: "person", scale: 1.04, look: "plain", hat: 1, coat: 1 },
    visitor: { kind: "person", scale: 1.24, look: "visitor" },
    dog: { kind: "pet", scale: 0.4, pet: "dog" },
    cat: { kind: "pet", scale: 0.3, pet: "cat" },
    owl: { kind: "pet", scale: 0.3, pet: "owl" },
    crow: { kind: "pet", scale: 0.2, pet: "crow" },
  };
  var CAST_SYN = { me: "you", viewer: "you", hero: "you", mother: "mom", mum: "mom", mommy: "mom", father: "dad", daddy: "dad", child: "kid", son: "kid", daughter: "kid", brother: "kid", sister: "kid",
    granny: "grandma", grandmother: "grandma", nan: "grandma", buddy: "friend", neighbour: "stranger", neighbor: "stranger", courier: "stranger", man: "stranger", thing: "visitor", it: "visitor", monster: "visitor",
    creature: "visitor", entity: "visitor", puppy: "dog", kitten: "cat", bird: "crow", raven: "crow" };
  function castKey(id) { id = str(id).toLowerCase(); if (CAST[id]) return id; if (CAST_SYN[id]) return CAST_SYN[id]; return null; }

  // Person poses: lean (torso forward), nod (head), a/e near arm (shoulder from down, elbow bend), b/f far arm,
  // l/k near leg (hip from down, knee bend back), m/n far leg, rot (whole body tips forward). Angles in degrees.
  var POSES = {
    stand: { a: 6, e: 6, b: -6, f: 6, l: 3, k: 0, m: -3, n: 0 },
    walk: { a: 6, e: 10, b: -6, f: 10, l: 3, k: 0, m: -3, n: 0 },
    run: { lean: 14, a: 20, e: 80, b: -20, f: 80, l: 10, k: 20, m: -10, n: 20 },
    point: { a: 88, e: 0, b: -4, f: 8 },
    "point-up": { a: 138, e: -6, b: -4, f: 8 },
    "point-down": { lean: 6, a: 40, e: 0, b: -4, f: 8 },
    "hands-up": { a: 160, e: -12, b: 160, f: -12, front: 1 },
    scared: { lean: -10, nod: -6, a: 64, e: 76, b: 52, f: 86, l: 14, k: 20, m: -8, n: 12 },
    hide: { lean: 52, nod: 22, a: 150, e: 70, b: 140, f: 80, l: 104, k: 150, m: 96, n: 146 },
    crouch: { lean: 36, nod: -10, a: 52, e: 40, b: 42, f: 52, l: 106, k: 142, m: 92, n: 132 },
    sit: { a: 30, e: 50, b: 25, f: 55, l: 90, k: 90, m: 87, n: 87 },
    "sit-floor": { lean: -12, a: -32, e: 0, b: -28, f: 0, l: 86, k: 0, m: 84, n: 10 },
    "sit-bed": { a: 22, e: 44, b: -20, f: 10, l: 90, k: 90, m: 86, n: 86 },
    lie: { rot: -90, a: 4, e: 0, b: -4, f: 0, l: 2, k: 0, m: -2, n: 0 },
    sleep: { rot: -90, nod: 10, a: 30, e: 80, b: 20, f: 70, l: 22, k: 30, m: 14, n: 24 },
    phone: { nod: 6, a: 26, e: 150, b: -6, f: 8 },
    hush: { nod: 6, a: 16, e: 146, b: -6, f: 8 },
    "cover-ears": { a: 110, e: 122, b: 110, f: 122, front: 1 },
    "cover-eyes": { nod: 8, a: 140, e: 109, b: 140, f: 109, front: 1 },
    knock: { lean: 4, a: 100, e: 40, b: -6, f: 8 },
    flashlight: { a: 82, e: 4, b: -6, f: 8 },
    stop: { a: 90, e: 88, b: -6, f: 8 },
    wave: { a: 138, e: 32, b: -6, f: 8, front: 1 },
    shrug: { a: 30, e: 100, b: 30, f: 100, front: 1 },
    reach: { lean: 14, a: 96, e: -4, b: 74, f: 6, l: 16, k: 4, m: -10, n: 0 },
    look: { lean: 6, nod: 6, a: 78, e: 112, b: -6, f: 8 },
    listen: { lean: -4, nod: -12, a: 40, e: 150, b: -6, f: 8 },
    peek: { lean: 30, nod: 8, a: 56, e: 40, b: 40, f: 50, l: 30, k: 30, m: -10, n: 20 },
    open: { lean: 6, a: 72, e: 10, b: -4, f: 8 },
    hold: { a: 50, e: 60, b: 45, f: 65 },
    pray: { nod: 18, a: 40, e: 110, b: 40, f: 110 },
    fall: { rot: 62, a: 160, e: 0, b: 140, f: 20, l: -20, k: 0, m: 10, n: 10 },
  };
  var POSE_ALIAS = { alert: "look", stare: "stand", growl: "scared", sitting: "sit", lying: "lie", asleep: "sleep", hiding: "hide", running: "run", walking: "walk", pointing: "point" };
  var SEATED = { sit: 1, "sit-bed": 1, "sit-floor": 1, lie: 1, sleep: 1, crouch: 1, hide: 1 };
  var UPPER = { look: 1, listen: 1, phone: 1, hush: 1, "cover-ears": 1, "cover-eyes": 1, point: 1, "point-up": 1, "point-down": 1, "hands-up": 1, scared: 1, stop: 1, wave: 1, shrug: 1, pray: 1, hold: 1, knock: 1, flashlight: 1, reach: 1, open: 1, stand: 0 };
  var PZERO = { lean: 0, nod: 0, a: 6, e: 6, b: -6, f: 6, l: 3, k: 0, m: -3, n: 0, rot: 0 };
  function poseVec(name) {
    var p = POSES[name] || POSES[POSE_ALIAS[name]] || POSES.stand, o = {};
    for (var k in PZERO) o[k] = p[k] != null ? p[k] : PZERO[k];
    return o;
  }
  function poseKey(name) { name = str(name).toLowerCase(); return POSES[name] ? name : POSE_ALIAS[name] || "stand"; }
  var PET_POSES = {
    stand: { bh: 50, tilt: 0, hx: 14, hy: -26, ear: 0.3, tail: 45, fold: 0, rfold: 0 },
    walk: { bh: 50, tilt: 0, hx: 14, hy: -24, ear: 0.3, tail: 40, fold: 0, rfold: 0 },
    run: { bh: 52, tilt: 0, hx: 16, hy: -18, ear: 0, tail: 18, fold: 0, rfold: 0 },
    sit: { bh: 42, tilt: -30, hx: 10, hy: -26, ear: 0.4, tail: -12, fold: 0, rfold: 1 },
    lie: { bh: 17, tilt: 0, hx: 16, hy: -14, ear: 0.2, tail: 2, fold: 1, rfold: 1 },
    hide: { bh: 15, tilt: 0, hx: 18, hy: -5, ear: 0, tail: -6, fold: 1, rfold: 1 },
    alert: { bh: 53, tilt: -6, hx: 15, hy: -34, ear: 0.5, tail: 74, fold: 0, rfold: 0 },
    stare: { bh: 52, tilt: -4, hx: 12, hy: -30, ear: 0.7, tail: 10, fold: 0, rfold: 0, stare: 1 },
    sleep: { bh: 15, tilt: 0, hx: 12, hy: -4, ear: 0, tail: 12, fold: 1, rfold: 1, shut: 1 },
    growl: { bh: 45, tilt: 8, hx: 20, hy: -12, ear: 0, tail: -24, fold: 0, rfold: 0, teeth: 1 },
  };
  var PET_ALIAS = { hide: "hide", hiding: "hide", "sit-floor": "sit", "sit-bed": "sit", crouch: "lie", scared: "hide", look: "alert", listen: "alert", peek: "alert", sleeping: "sleep", running: "run", walking: "walk" };
  function petKey(n) { n = str(n).toLowerCase(); return PET_POSES[n] ? n : PET_ALIAS[n] || "stand"; }
  function petVec(n) { var p = PET_POSES[petKey(n)], o = {}; for (var k in PET_POSES.stand) o[k] = p[k]; o.stare = p.stare || 0; o.shut = p.shut || 0; o.teeth = p.teeth || 0; return o; }

  function dv(a, f) { var r = rad(a); return [Math.sin(r) * f, Math.cos(r)]; }
  function add(p, v, k) { return [p[0] + v[0] * k, p[1] + v[1] * k]; }
  function rotP(p, c, deg) { var r = rad(deg), cs = Math.cos(r), sn = Math.sin(r), x = p[0] - c[0], y = p[1] - c[1]; return [c[0] + x * cs - y * sn, c[1] + x * sn + y * cs]; }
  function dpts(list) { var s = ""; list.forEach(function (p, i) { s += (i ? "L" : "M") + f2(p[0]) + " " + f2(p[1]); }); return s; }

  // Skeleton of a person in local units (height 100, feet on y = 0, x = 0 centre). f: 1 right, -1 left, 0 front.
  function skeleton(pv, f, look) {
    var vis = look === "visitor", kid = look === "kid";
    var HR = vis ? 8.2 : kid ? 11.5 : 9, GAP = 2.4, TORSO = vis ? 29 : kid ? 25 : 30, TH = vis ? 25 : kid ? 19 : 23, SH = vis ? 25 : kid ? 18 : 22.5, UA = vis ? 25 : kid ? 13 : 15.5, FA = vis ? 25 : kid ? 12.5 : 15;
    var front = f === 0, fs = front ? 1 : f;
    var sw = front ? 12 : 8.2, hw = front ? 9 : 7.6;
    var hip = [0, 0];
    var up = dv(180 - pv.lean, fs), nrm = [-up[1], up[0]];
    if (front) { up = [0, -1]; nrm = [1, 0]; }
    var neck = add(hip, up, TORSO), shJ = add(hip, up, TORSO - 3.6);
    var head = add(neck, front ? [0, -1] : dv(180 - pv.lean - pv.nod, fs), GAP + HR);
    function arm(a, e, side) {
      var sg = front ? side : fs, s0 = front ? add(shJ, nrm, side * (sw - 4)) : shJ;
      var el = add(s0, dv(a + (front ? 0 : pv.lean), sg), UA);
      var ha = add(el, dv(a + e + (front ? 0 : pv.lean), sg), FA);
      return [s0, el, ha];
    }
    function leg(l, k, side) {
      var sg = front ? side : fs, h0 = front ? [hip[0] + side * hw * 0.5, hip[1]] : hip;
      var kn = add(h0, dv(l, sg), TH), ft = add(kn, dv(l - k, sg), SH);
      return [h0, kn, ft];
    }
    var A1 = arm(pv.a, pv.e, 1), A2 = arm(pv.b, pv.f, -1), L1 = leg(pv.l, pv.k, 1), L2 = leg(pv.m, pv.n, -1);
    var all = { hip: hip, neck: neck, sh: shJ, head: head, A1: A1, A2: A2, L1: L1, L2: L2, up: up, nrm: nrm, sw: sw, hw: hw, HR: HR, TORSO: TORSO };
    var rot = pv.rot * (front ? 1 : fs);
    function R_(p) { return rotP(p, hip, rot); }
    if (rot) {
      all.neck = R_(neck); all.sh = R_(shJ); all.head = R_(head);
      ["A1", "A2", "L1", "L2"].forEach(function (k) { all[k] = all[k].map(R_); });
      var rr_ = rad(rot), cs = Math.cos(rr_), sn = Math.sin(rr_);
      all.up = [up[0] * cs - up[1] * sn, up[0] * sn + up[1] * cs]; all.nrm = [-all.up[1], all.up[0]];
    }
    var LW = vis ? 6.6 : kid ? 9.4 : 10.6;
    var low = Math.max(all.L1[2][1] + LW / 2, all.L2[2][1] + LW / 2, all.L1[1][1] + LW / 2, all.L2[1][1] + LW / 2, hip[1] + 7.5, all.sh[1] + 6, all.head[1] + HR);
    var dy = -low;
    function T_(p) { return [p[0], p[1] + dy]; }
    all.hip = T_(hip); all.neck = T_(all.neck); all.sh = T_(all.sh); all.head = T_(all.head);
    ["A1", "A2", "L1", "L2"].forEach(function (k) { all[k] = all[k].map(T_); });
    all.LW = LW; all.AW = vis ? 5.4 : kid ? 7.6 : 8.4;
    return all;
  }

  function makeFigure(id, o) {
    var s = ensure();
    o = obj(o);
    var key = castKey(id) || "you", cd = CAST[key];
    if (cd.kind === "pet") return makePet(key, o);
    var h = Math.max(10, num(o.h, s.FH * cd.scale));
    var layer = o.parent || s.L[o.layer] || s.L.figs;
    var g = svg("g", { class: "pg-fig pg-c-" + key }, layer);
    var body = svg("g", { class: o.color === "transparent" || o.color === "void" ? "pg-void" : o.color === "accent" || o.color === "red" ? "pg-accent" : "" }, g);
    if (o.color && /^#|rgb/.test(o.color)) body.style.setProperty("--ink", o.color);
    var look = cd.look === "visitor" ? "visitor" : cd.kid ? "kid" : "plain";
    var halo = o.halo === false ? null : svg("g", { class: "pg-halos" }, body);
    var el = {
      coatB: cd.coat ? svg("path", { class: "pf-i" }, body) : null,
      a2: svg("path", { class: "pg-limb" }, body), l2: svg("path", { class: "pg-limb" }, body),
      torso: svg("path", { class: "pg-torso" }, body), l1: svg("path", { class: "pg-limb" }, body),
      dress: cd.dress ? svg("path", { class: "pf-i" }, body) : null, coat: cd.coat ? svg("path", { class: "pf-i" }, body) : null,
      cane: cd.cane ? svg("path", { class: "pg-limb pg-thin" }, body) : null,
      head: svg("path", { class: "pf-i" }, body), hat: cd.hat || cd.cap || cd.bun ? svg("path", { class: "pf-i" }, body) : null,
      a2kf: svg("path", { class: "pg-armkey" }, body), a2f: svg("path", { class: "pg-limb" }, body),
      a1k: svg("path", { class: "pg-armkey" }, body), a1: svg("path", { class: "pg-limb" }, body),
      eyes: svg("g", { class: "pg-eyes" }, g), smile: look === "visitor" ? svg("path", { class: "pg-smile" }, g) : null,
    };
    var e1 = svg("ellipse", { class: "pf-w" }, el.eyes), e2 = svg("ellipse", { class: "pf-w" }, el.eyes);
    el.halos = [];
    if (halo) ["coatB", "a2", "l2", "torso", "l1", "dress", "coat", "a1", "a2f", "cane", "head", "hat"].forEach(function (k) {
      if (!el[k]) return;
      var limb = /pg-limb/.test(el[k].getAttribute("class") || "");
      el.halos.push({ src: el[k], h: svg("path", { class: limb ? "pg-halo-limb" : "pg-halo" }, halo), limb: limb });
    });
    var p0 = poseKey(o.pose || "stand");
    var face0 = o.facing === "front" ? 0 : o.facing === "left" ? -1 : o.facing === "right" ? 1 : POSES[p0] && POSES[p0].front ? 0 : 1;
    var f = {
      kind: "figure", id: key, cd: cd, look: look, g: g, h: h, layer: layer, label: key,
      tr: new Tr({ x: num(o.x, W / 2), y: num(o.y, s.floor) }), poseTr: new Tr(poseVec(p0)), poseName: new Tr(p0),
      faceTr: new Tr(face0), vis: new Tr(1), baseName: new Tr(p0), at: o.at == null ? 0 : num(o.at, 0), eyesTr: new Tr(o.eyes || look === "visitor" ? 1 : 0),
      trem: [], talks: [], walks: [], holds: [], runs: [], smileT0: o.at == null ? 0 : num(o.at, 0), noGround: false,
    };
    if (look === "visitor") f.eyesTr = new Tr(1);
    f.pose = function (name, at, dur) {
      var k = poseKey(name), t0 = num(at, s.cursor), d = dur == null ? 0.28 : num(dur, 0.28), vec = poseVec(k);
      var base = f.baseName.val(t0 + 1e-4);
      if (SEATED[base] && UPPER[k]) {
        var bv = poseVec(base);
        ["l", "k", "m", "n", "rot"].forEach(function (q) { vec[q] = bv[q]; });
        if (base === "lie" || base === "sleep") { vec.lean = 0; }
        f.poseTr.to(vec, t0, d, "inOutCubic"); f.poseName.set(k, t0);
        return f;
      }
      f.poseTr.to(vec, t0, d, "inOutCubic"); f.poseName.set(k, t0); f.baseName.set(k, t0);
      if (POSES[k] && POSES[k].front) f.faceTr.set(0, t0);
      else if (POSES[k] && !POSES[k].front && f.faceTr.val(t0) === 0 && k !== "stand" && k !== "pray" && k !== "hold") f.faceTr.set(f.lastSide || 1, t0);
      return f;
    };
    f.lastSide = face0 || 1;
    f.face = function (dir, at) { var v = dir === "front" ? 0 : dir === "left" ? -1 : 1; if (v) f.lastSide = v; f.faceTr.set(v, num(at, s.cursor)); return f; };
    f.move = function (x, at, dur, run) {
      var t0 = num(at, s.cursor), x0 = f.tr.val(t0).x, dist = Math.abs(num(x, x0) - x0);
      var d = dur == null ? Math.max(0.4, dist / (h * (run ? 2.4 : 1.1))) : Math.max(0.15, num(dur, 1));
      f.tr.to({ x: num(x, x0) }, t0, d, run ? "inOutSine" : "linear");
      var side = num(x, x0) >= x0 ? 1 : -1;
      f.lastSide = side;
      f.faceTr.set(side, t0);
      f.walks.push({ t0: t0, t1: t0 + d, run: !!run });
      f.poseTr.to(poseVec(run ? "run" : "walk"), t0, 0.15, "linear");
      f.poseTr.to(poseVec("stand"), t0 + d, 0.2, "linear");
      f.poseName.set(run ? "run" : "walk", t0); f.poseName.set("stand", t0 + d);
      f.baseName.set(run ? "run" : "walk", t0); f.baseName.set("stand", t0 + d);
      return f;
    };
    f.seated = function (t) { return !!SEATED[f.baseName.val(t)]; };
    f.walkTo = function (x, at, dur) { return f.move(x, at, dur, false); };
    f.runTo = function (x, at, dur) { return f.move(x, at, dur, true); };
    f.to = function (v, at, dur, ease) { v = obj(v); var q = {}; if (v.x != null) q.x = +v.x; if (v.y != null) q.y = +v.y; f.tr.to(q, num(at, s.cursor), num(dur, 0.6), ease || "inOutCubic"); return f; };
    f.tremble = function (at, dur, amt) { f.trem.push([num(at, s.cursor), num(dur, 1.2), num(amt, 1)]); return f; };
    f.eyes = function (on, at) { f.eyesTr.set(on === false ? 0 : 1, num(at, s.cursor)); return f; };
    f.lieDown = function (at, dir) { if (dir) f.face(dir === "left" ? "right" : "left", at); return f.pose("lie", at, 0.5); };
    f.sleep = function (at) { return f.pose("sleep", at, 0.5); };
    f.talk = function (t0, t1) { f.talks.push([num(t0, 0), num(t1, D)]); return f; };
    f.show = function (at) { f.vis.set(1, num(at, s.cursor)); return f; };
    f.hide = function (at) { f.vis.set(0, num(at, s.cursor)); return f; };
    f.skel = function (t) { return skelAt(f, t); };
    f.head = function (t) { var k = skelAt(f, t == null ? D : t), sc = h / 100, p = f.tr.val(t == null ? D : t); var hx = p.x + k.head[0] * sc * k.flip, hy = p.y + k.head[1] * sc; return { x: hx, y: hy, r: k.HR * sc, top: hy - k.HR * sc }; };
    f.hand = function (t) { t = t == null ? D : t; var k = skelAt(f, t), sc = h / 100, p = f.tr.val(t); return [p.x + k.A1[2][0] * sc * k.flip, p.y + k.A1[2][1] * sc]; };
    f.box = function (t) { return figBox(f, t == null ? D : t); };
    f.shoulder = function (t) { t = t == null ? D : t; var k = skelAt(f, t), sc = h / 100, p = f.tr.val(t); return [p.x + k.A1[0][0] * sc, p.y + k.A1[0][1] * sc]; };
    f.aim = function (deg, at, dur) { var t0 = num(at, s.cursor), th = num(deg, 0), right = Math.cos(rad(th)) >= 0; f.face(right ? "right" : "left", t0); if (!right && th < 0) th += 360; f.poseTr.to({ a: clamp(right ? 90 - th : th - 90, -10, 175), e: 0 }, t0, num(dur, 0.4), "inOutCubic"); return f; };
    f.center = function (t) { var b = f.box(t); return [b.x + b.w / 2, b.y + b.h / 2]; };
    f.hold = function (name, ho) {
      ho = obj(ho);
      var it = makeObject(name, { size: num(ho.size, h * (objectKey(name) === "flashlight" ? 0.1 : 0.13)), layer: ho.layer || (f.layer === s.L.front ? "front" : "figs"), x: 0, y: 0 });
      if (it.g.parentNode !== f.g.parentNode) f.g.parentNode.appendChild(it.g);
      it.anchorMid = true;
      it.inner.setAttribute("transform", "translate(" + -it.def.w / 2 + " -50)");
      it.follow = function (t) {
        var k = skelAt(f, t), sc = h / 100, p = f.tr.val(t), hx = p.x + k.A1[2][0] * sc, hy = p.y + k.A1[2][1] * sc;
        var vx = k.A1[2][0] - k.A1[1][0], vy = k.A1[2][1] - k.A1[1][1], vl = Math.sqrt(vx * vx + vy * vy) || 1;
        vx /= vl; vy /= vl;
        if (it.name === "flashlight") {
          var left = vx < 0;
          it.flip = left;
          var ang = left ? (-Math.atan2(vy, -vx) * 180) / PI : (Math.atan2(vy, vx) * 180) / PI;
          return [hx + vx * it.w * 0.22, hy + vy * it.w * 0.22, ang];
        }
        it.flip = k.face < 0;
        return [hx + (k.face < 0 ? -1 : 1) * it.w * 0.15, hy - it.size * 0.1, 0];
      };
      it.vis = f.vis;
      it.popAt = f.at;
      f.holds.push(it);
      return it;
    };
    f.el = el; f.e1 = e1; f.e2 = e2;
    if (o.static) { f.at = 0; updFigure(f, num(o.t, 0)); return f; }
    addAnim(function (t) { updFigure(f, t); });
    addItem("figure", key, function (t) { return t >= f.at && f.vis.val(t) > 0.5 ? figBox(f, t) : null; }, true);
    f.moving = function (t) { return f.tr.moving(t); };
    s.figs.push(f);
    return f;
  }
  function skelAt(f, t) {
    var pv = f.poseTr.val(t), face = f.faceTr.val(t), name = f.poseName.val(t);
    pv = Object.assign({}, pv);
    // walk / run cycle from distance travelled
    f.walks.forEach(function (w) {
      if (t < w.t0 || t > w.t1 + 0.05) return;
      var x = f.tr.val(t).x, ph = (x / (f.h * (w.run ? 0.9 : 0.62))) * 2 * PI, A = w.run ? 38 : 24;
      var fade = clamp(Math.min((t - w.t0) / 0.12, (w.t1 + 0.05 - t) / 0.12), 0, 1);
      var sn = Math.sin(ph) * fade, cs = Math.cos(ph) * fade;
      pv.l += A * sn; pv.m -= A * sn; pv.k += Math.max(0, (w.run ? 60 : 30) * -cs); pv.n += Math.max(0, (w.run ? 60 : 30) * cs);
      pv.a -= (w.run ? 30 : 20) * sn; pv.b += (w.run ? 30 : 20) * sn;
    });
    // built-in motion for some poses
    var since = t;
    if (name === "knock") { var kn = Math.sin(t * 2 * PI * 3.2); pv.e += 22 * Math.max(0, kn); }
    if (name === "wave") pv.e += 22 * Math.sin(t * 2 * PI * 1.6);
    if (name === "sleep") pv.nod += 2 * Math.sin(t * 1.6);
    f.talks.forEach(function (q) { if (t >= q[0] && t <= q[1]) pv.nod += 4 * Math.abs(Math.sin(t * 9)); });
    var k = skeleton(pv, face, f.look === "visitor" ? "visitor" : f.look);
    k.flip = face === 0 ? 1 : 1;
    k.face = face;
    k.pose = name;
    return k;
  }
  function tremAt(f, t) {
    var a = 0, name = f.poseName.val(t);
    if (name === "scared" || name === "cover-ears" || name === "cover-eyes") a = 0.6;
    f.trem.forEach(function (q) { if (t >= q[0] && t < q[0] + q[1]) a = Math.max(a, q[2]); });
    return a;
  }
  function figBox(f, t) {
    var k = skelAt(f, t), sc = f.h / 100, p = f.tr.val(t);
    var pts = [k.head, k.sh, k.hip, k.A1[1], k.A1[2], k.A2[1], k.A2[2], k.L1[1], k.L1[2], k.L2[1], k.L2[2]];
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    pts.forEach(function (q, i) { var r = i === 0 ? k.HR : 5; x0 = Math.min(x0, q[0] - r); x1 = Math.max(x1, q[0] + r); y0 = Math.min(y0, q[1] - r); y1 = Math.max(y1, q[1] + r); });
    if (f.cd.hat) y0 = Math.min(y0, k.head[1] - k.HR - 7);
    return { x: p.x + x0 * sc, y: p.y + y0 * sc, w: (x1 - x0) * sc, h: (y1 - y0) * sc };
  }
  function updFigure(f, t) {
    var on = t >= f.at && f.vis.val(t) > 0.5;
    showEl(f.g, on);
    if (!on) return;
    var k = skelAt(f, t), p = f.tr.val(t), sc = f.h / 100, el = f.el, cd = f.cd;
    var tr = tremAt(f, t), jx = tr ? tr * 0.9 * Math.sin(t * 57) : 0;
    var popK = f.at > 0.05 ? popScale(t, f.at) : 1;
    setA(f.g, "transform", "translate(" + f2(p.x + jx * sc) + " " + f2(p.y) + ") scale(" + (sc * popK).toFixed(4) + ")");
    var A1 = k.A1, A2 = k.A2, L1 = k.L1, L2 = k.L2;
    var fr = k.face === 0;
    setA(el.a1, "d", dpts(A1)); setA(el.a1k, "d", dpts(A1)); setA(el.a2, "d", fr ? "M0 0" : dpts(A2)); setA(el.a2f, "d", fr ? dpts(A2) : "M0 0"); setA(el.a2kf, "d", fr ? dpts(A2) : "M0 0");
    setA(el.l1, "d", dpts(L1)); setA(el.l2, "d", dpts(L2));
    var aw = f.look === "visitor" ? 5.6 : f.look === "kid" ? 8.2 : 9.2;
    [el.a1, el.a2, el.a2f].forEach(function (e) { setA(e, "stroke-width", aw); });
    [el.a1k, el.a2kf].forEach(function (e) { setA(e, "stroke-width", f2(aw + 3.2)); });
    [el.l1, el.l2].forEach(function (e) { setA(e, "stroke-width", k.LW); });
    var br = cd.broad || 1, sw = k.sw * br * (f.look === "visitor" ? 0.78 : 1), hw = k.hw * br * (f.look === "visitor" ? 0.8 : 1);
    var up = k.up, n = k.nrm, hip = k.hip, top = add(hip, up, k.TORSO - 1.5);
    var tq = [add(add(hip, n, hw), up, -3), add(top, n, sw), add(top, n, -sw), add(add(hip, n, -hw), up, -3)];
    setA(el.torso, "d", dpts(tq) + "Z");
    if (el.dress) {
      var kn = [(L1[1][0] + L2[1][0]) / 2, (L1[1][1] + L2[1][1]) / 2], waist = add(hip, up, 9);
      var dvx = kn[0] - hip[0], dvy = kn[1] - hip[1], dl = Math.sqrt(dvx * dvx + dvy * dvy) || 1, hem = [hip[0] + (dvx / dl) * 24, hip[1] + (dvy / dl) * 24];
      var pn = [-dvy / dl, dvx / dl], ww = k.face === 0 ? 10 : 8.5, hh = k.face === 0 ? 19 : 16;
      setA(el.dress, "d", dpts([add(waist, pn, ww), add(hem, pn, hh), add(hem, pn, -hh), add(waist, pn, -ww)]) + "Z");
    }
    if (el.coat) {
      var c0 = add(top, up, -2), c1 = add(hip, up, -24), cw = k.face === 0 ? 1.15 : 1.2;
      setA(el.coat, "d", dpts([add(c0, n, sw * cw), add(c1, n, sw * 1.5), add(c1, n, -sw * 1.5), add(c0, n, -sw * cw)]) + "Z");
      setA(el.coatB, "d", "");
    }
    if (el.cane) {
      var hd = A2[2];
      var standing = Math.abs(k.L1[2][1]) < 2 && k.pose !== "sit" && k.pose !== "sit-bed" && k.pose !== "lie" && k.pose !== "sleep";
      setA(el.cane, "d", standing ? dpts([hd, [hd[0] + (k.face || 1) * 2, 0]]) : "M0 0");
      showEl(el.cane, standing);
    }
    var hc = k.head, HR = k.HR;
    if (f.look === "visitor") setA(el.head, "d", E(hc[0], hc[1], HR, HR * 1.28));
    else setA(el.head, "d", C(hc[0], hc[1], HR));
    if (el.hat) {
      var fd = k.face === 0 ? 0 : k.face, d = "";
      if (cd.hat) d = R(hc[0] - HR * 1.75, hc[1] - HR * 0.55, HR * 3.5, HR * 0.38, 1) + R(hc[0] - HR * 0.95, hc[1] - HR * 1.55, HR * 1.9, HR * 1.1, 2);
      else if (cd.cap) {
        var bd = fd === 0 ? 0 : fd * cd.cap;
        d = "M" + f2(hc[0] - HR * 1.02) + " " + f2(hc[1] - HR * 0.15) + "A" + HR * 1.02 + " " + HR * 1.02 + " 0 0 1 " + f2(hc[0] + HR * 1.02) + " " + f2(hc[1] - HR * 0.15) + "Z";
        if (bd) d += R(bd > 0 ? hc[0] + HR * 0.4 : hc[0] - HR * 1.75, hc[1] - HR * 0.4, HR * 1.35, HR * 0.34, 1);
        else d += R(hc[0] - HR * 1.2, hc[1] - HR * 0.4, HR * 2.4, HR * 0.3, 1);
      } else if (cd.bun) d = C(hc[0] - (fd || 0) * HR * 0.75, hc[1] - HR * (fd ? 0.75 : 1.15), HR * 0.5);
      setA(el.hat, "d", d);
    }
    // eyes: white dots (always on for the visitor)
    var eOn = f.eyesTr.val(t) > 0.5;
    showEl(f.el.eyes, eOn);
    if (eOn) {
      var ex = k.face === 0 ? HR * 0.36 : HR * 0.3, ox = k.face === 0 ? 0 : k.face * HR * 0.42, ey = hc[1] - HR * 0.1, er = f.look === "visitor" ? HR * 0.2 : HR * 0.15;
      var blink = f.look === "visitor" ? 1 : hash(Math.floor(t * 3.3) + f.h) < 0.08 && (t * 3.3) % 1 < 0.35 ? 0.15 : 1;
      setA(f.e1, "cx", f2(hc[0] + ox - ex)); setA(f.e1, "cy", f2(ey)); setA(f.e1, "rx", f2(er)); setA(f.e1, "ry", f2(er * (f.look === "visitor" ? 1.25 : 1) * blink));
      setA(f.e2, "cx", f2(hc[0] + ox + ex)); setA(f.e2, "cy", f2(ey)); setA(f.e2, "rx", f2(er)); setA(f.e2, "ry", f2(er * (f.look === "visitor" ? 1.25 : 1) * blink));
    }
    if (el.smile) {
      var grow = clamp((t - f.smileT0) / 4, 0, 1), sw2 = HR * (0.55 + 0.6 * grow), sy = hc[1] + HR * 0.55, ox2 = k.face === 0 ? 0 : k.face * HR * 0.3;
      setA(el.smile, "d", "M" + f2(hc[0] + ox2 - sw2) + " " + f2(sy - HR * 0.12) + "Q" + f2(hc[0] + ox2) + " " + f2(sy + HR * 0.55) + " " + f2(hc[0] + ox2 + sw2) + " " + f2(sy - HR * 0.12));
      setA(el.smile, "stroke-width", f2(HR * 0.2));
    }
    updHalos(el, f.look === "visitor" ? 1.3 : 1.7);
  }
  function updHalos(el, hk) {
    el.halos.forEach(function (q) {
      var d = q.src.getAttribute("d") || "M0 0", on = q.src.style.display !== "none";
      setA(q.h, "d", on ? d : "M0 0");
      if (q.limb) setA(q.h, "stroke-width", f2((parseFloat(q.src.getAttribute("stroke-width")) || 3.4) + hk * 2));
      else setA(q.h, "stroke-width", f2(hk * 2 + (q.src === el.torso ? 5 : 0)));
    });
  }

  // ------------------------- pets (dog, cat, owl, crow) -------------------------
  function makePet(key, o) {
    var s = ensure(), cd = CAST[key];
    var h = Math.max(6, num(o.h, s.FH * cd.scale));
    var layer = o.parent || s.L[o.layer] || s.L.figs;
    var g = svg("g", { class: "pg-fig pg-c-" + key }, layer);
    var body = svg("g", { class: o.color === "transparent" || o.color === "void" ? "pg-void" : "" }, g);
    var el = {}, halo = o.halo === false ? null : svg("g", { class: "pg-halos" }, body);
    el.halos = [];
    ["tail", "legB", "body", "neck", "head", "snout", "ears", "legF"].forEach(function (n) {
      el[n] = svg("path", { class: n === "tail" && key === "cat" ? "pg-limb pg-cattail" : "pf-i" }, body);
      if (halo) el.halos.push({ src: el[n], h: svg("path", { class: n === "tail" && key === "cat" ? "pg-halo-limb" : "pg-halo" }, halo), limb: n === "tail" && key === "cat" });
    });
    el.eyes = svg("g", { class: "pg-eyes" }, g);
    el.e1 = svg("ellipse", { class: "pf-w" }, el.eyes); el.e2 = svg("ellipse", { class: "pf-w" }, el.eyes);
    el.p1 = svg("circle", { class: "pf-i pg-pupil" }, el.eyes); el.p2 = svg("circle", { class: "pf-i pg-pupil" }, el.eyes);
    el.teeth = svg("path", { class: "ps-w" }, g);
    var p0 = petKey(o.pose || "stand");
    var f = {
      kind: "pet", id: key, cd: cd, g: g, h: h, el: el, layer: layer, label: key,
      tr: new Tr({ x: num(o.x, W / 2), y: num(o.y, s.floor) }), poseTr: new Tr(petVec(p0)), poseName: new Tr(p0),
      faceTr: new Tr(o.facing === "left" ? -1 : 1), vis: new Tr(1), at: o.at == null ? 0 : num(o.at, 0), eyesTr: new Tr(o.eyes ? 1 : key === "owl" ? 1 : 0),
      trem: [], walks: [], holds: [],
    };
    f.pose = function (name, at, dur) { var k = petKey(name), t0 = num(at, s.cursor); f.poseTr.to(petVec(k), t0, dur == null ? 0.3 : num(dur, 0.3), "inOutCubic"); f.poseName.set(k, t0); return f; };
    f.move = function (x, at, dur, run) {
      var t0 = num(at, s.cursor), x0 = f.tr.val(t0).x, dist = Math.abs(num(x, x0) - x0);
      var d = dur == null ? Math.max(0.35, dist / (h * (run ? 4.2 : 2))) : Math.max(0.15, num(dur, 1));
      f.tr.to({ x: num(x, x0) }, t0, d, run ? "inOutSine" : "linear");
      f.faceTr.set(num(x, x0) >= x0 ? 1 : -1, t0);
      f.walks.push({ t0: t0, t1: t0 + d, run: !!run });
      var keep = f.poseName.val(t0 + d + 0.01);
      f.poseTr.to(petVec(run ? "run" : "walk"), t0, 0.12, "linear");
      f.poseTr.to(petVec(keep === "walk" || keep === "run" ? "stand" : keep), t0 + d, 0.2, "linear");
      f.poseName.set(run ? "run" : "walk", t0); f.poseName.set(keep === "walk" || keep === "run" ? "stand" : keep, t0 + d);
      return f;
    };
    f.walkTo = function (x, at, dur) { return f.move(x, at, dur, false); };
    f.runTo = function (x, at, dur) { return f.move(x, at, dur, true); };
    f.face = function (dir, at) { f.faceTr.set(dir === "left" ? -1 : 1, num(at, s.cursor)); return f; };
    f.to = function (v, at, dur, ease) { v = obj(v); var q = {}; if (v.x != null) q.x = +v.x; if (v.y != null) q.y = +v.y; f.tr.to(q, num(at, s.cursor), num(dur, 0.6), ease || "inOutCubic"); return f; };
    f.tremble = function (at, dur, amt) { f.trem.push([num(at, s.cursor), num(dur, 1.2), num(amt, 1)]); return f; };
    f.eyes = function (on, at) { f.eyesTr.set(on === false ? 0 : 1, num(at, s.cursor)); return f; };
    f.sleep = function (at) { return f.pose("sleep", at, 0.5); };
    f.lieDown = function (at) { return f.pose("lie", at, 0.4); };
    f.talk = function () { return f; };
    f.hold = function () { return null; };
    f.show = function (at) { f.vis.set(1, num(at, s.cursor)); return f; };
    f.hide = function (at) { f.vis.set(0, num(at, s.cursor)); return f; };
    f.box = function (t) { return petBox(f, t == null ? D : t); };
    f.center = function (t) { var b = f.box(t); return [b.x + b.w / 2, b.y + b.h / 2]; };
    f.head = function (t) { t = t == null ? D : t; var q = petGeo(f, t), sc = h / 100, p = f.tr.val(t), fc = f.faceTr.val(t); return { x: p.x + q.head[0] * sc * fc, y: p.y + q.head[1] * sc, r: q.HR * sc, top: p.y + (q.head[1] - q.HR) * sc }; };
    f.hand = function (t) { var hd = f.head(t); return [hd.x, hd.y]; };
    f.moving = function (t) { return f.tr.moving(t); };
    if (o.static) { f.at = 0; updPet(f, num(o.t, 0)); return f; }
    addAnim(function (t) { updPet(f, t); });
    addItem("figure", key, function (t) { return t >= f.at && f.vis.val(t) > 0.5 ? petBox(f, t) : null; }, true);
    s.figs.push(f);
    return f;
  }
  function petGeo(f, t) {
    var pv = f.poseTr.val(t), key = f.id, cat = key === "cat";
    if (cat) { pv = Object.assign({}, pv); pv.bh *= 0.8; pv.hy *= 0.9; }
    var BL = cat ? 24 : 29, BR = cat ? 10.5 : 15, HR = cat ? 12 : 14.5, LWp = cat ? 6.5 : 9;
    var swing = 0;
    f.walks.forEach(function (w) {
      if (t < w.t0 || t > w.t1 + 0.05) return;
      var x = f.tr.val(t).x, ph = (x / (f.h * (w.run ? 1.3 : 0.8))) * 2 * PI, fade = clamp(Math.min((t - w.t0) / 0.1, (w.t1 + 0.05 - t) / 0.1), 0, 1);
      swing = Math.sin(ph) * (w.run ? 30 : 20) * fade;
    });
    var ta = rad(pv.tilt), ax = [Math.cos(ta), Math.sin(ta)], c = [0, -pv.bh];
    var front = add(c, ax, BL), rear = add(c, ax, -BL), head = [front[0] + pv.hx, front[1] + pv.hy];
    if (pv.bh < 25) { head[1] = Math.min(head[1], -HR); }
    return { pv: pv, BL: BL, BR: BR, HR: HR, LW: LWp, ax: ax, c: c, front: front, rear: rear, head: head, swing: swing, cat: cat };
  }
  function petBox(f, t) {
    var sc = f.h / 100, p = f.tr.val(t), fc = f.faceTr.val(t);
    if (f.id === "owl") return { x: p.x - 27 * sc, y: p.y - 100 * sc, w: 54 * sc, h: 100 * sc };
    if (f.id === "crow") return { x: p.x - 56 * sc, y: p.y - 86 * sc, w: 116 * sc, h: 86 * sc };
    var q = petGeo(f, t), xs = [q.rear[0] - q.BR - 14, q.head[0] + q.HR + (q.pv.stare ? 0 : 16)], y0 = Math.min(q.head[1] - q.HR - 10, q.c[1] - q.BR);
    var x0 = Math.min(xs[0], xs[1]) * fc, x1 = Math.max(xs[0], xs[1]) * fc;
    return { x: p.x + Math.min(x0, x1) * sc, y: p.y + y0 * sc, w: Math.abs(x1 - x0) * sc, h: -y0 * sc };
  }
  function updPet(f, t) {
    var on = t >= f.at && f.vis.val(t) > 0.5;
    showEl(f.g, on);
    if (!on) return;
    var p = f.tr.val(t), sc = f.h / 100, fc = f.faceTr.val(t), el = f.el, name = f.poseName.val(t);
    var tr = 0;
    f.trem.forEach(function (q) { if (t >= q[0] && t < q[0] + q[1]) tr = Math.max(tr, q[2]); });
    if (name === "growl") tr = Math.max(tr, 0.7);
    var jx = tr ? tr * 1.4 * Math.sin(t * 61) : 0;
    var popK = f.at > 0.05 ? popScale(t, f.at) : 1;
    setA(f.g, "transform", "translate(" + f2(p.x + jx * sc) + " " + f2(p.y) + ") scale(" + (sc * fc * popK).toFixed(4) + " " + (sc * popK).toFixed(4) + ")");
    var eOn = f.eyesTr.val(t) > 0.5;
    if (f.id === "owl") { drawOwl(f, t, eOn, name); updHalos(el, 2.2); return; }
    if (f.id === "crow") { drawCrow(f, t, eOn, name); updHalos(el, 2.2); return; }
    var q = petGeo(f, t), pv = q.pv, HR = q.HR, hd = q.head;
    setA(el.body, "d", CAP(q.rear[0], q.rear[1], q.front[0], q.front[1], q.BR));
    setA(el.neck, "d", CAP(q.front[0] - 3, q.front[1], hd[0], hd[1], q.cat ? 6 : 8));
    setA(el.head, "d", C(hd[0], hd[1], HR));
    var stare = pv.stare > 0.5;
    if (!q.cat && !stare) setA(el.snout, "d", CAP(hd[0] + 3, hd[1] + 3, hd[0] + 18, hd[1] + 6, 7));
    else if (q.cat && !stare) setA(el.snout, "d", CAP(hd[0] + 4, hd[1] + 3, hd[0] + 12, hd[1] + 4, 4.5));
    else setA(el.snout, "d", "M0 0");
    var ear = pv.ear, ed;
    if (q.cat) ed = PL([hd[0] - 10, hd[1] - 5], [hd[0] - 3, hd[1] - 10], [hd[0] - 8, hd[1] - 22 + 4 * (1 - ear)]) + PL([hd[0] + 1, hd[1] - 11], [hd[0] + 9, hd[1] - 6], [hd[0] + 7, hd[1] - 22 + 4 * (1 - ear)]);
    else if (stare) ed = E(hd[0] - 12, hd[1] - 2, 5, 10) + E(hd[0] + 12, hd[1] - 2, 5, 10);
    else { var ea = 115 + 140 * ear; ed = rotE(hd[0] - 5 + Math.cos(rad(ea)) * 8, hd[1] - 7 + Math.sin(rad(ea)) * 8, 10.5, 5.5, ea); }
    setA(el.ears, "d", ed);
    // legs
    var fold = pv.fold, rfold = Math.max(pv.fold, pv.rfold);
    var fa = add(q.front, q.ax, -6), ra = add(q.rear, q.ax, 6);
    fa = [fa[0], fa[1] + q.BR * 0.4]; ra = [ra[0], ra[1] + q.BR * 0.4];
    function legPath(at, fl, sw, dxs) {
      var out = "";
      [-1, 1].forEach(function (sd) {
        var a0 = [at[0] + sd * 4 + dxs, at[1]], sg = rad(sd * sw), gx = a0[0] + Math.sin(sg) * -a0[1];
        var endG = [gx, -q.LW / 2], endF = [a0[0] + 15, Math.min(-q.LW / 2, a0[1] + 3)];
        var e = [lerp(endG[0], endF[0], fl), lerp(endG[1], endF[1], fl)];
        out += CAP(a0[0], a0[1], e[0], e[1], q.LW / 2);
      });
      return out;
    }
    setA(el.legF, "d", legPath(fa, fold, q.swing, 0));
    setA(el.legB, "d", legPath(ra, rfold, -q.swing, 0));
    var ta = rad(pv.tail), tl = q.cat ? 34 : 22, te = [q.rear[0] - Math.cos(ta) * tl, q.rear[1] - Math.sin(ta) * tl];
    if (q.cat) { setA(el.tail, "d", "M" + f2(q.rear[0]) + " " + f2(q.rear[1]) + "Q" + f2(te[0] - 10) + " " + f2(q.rear[1] + 2) + " " + f2(te[0]) + " " + f2(te[1])); setA(el.tail, "stroke-width", 6); }
    else setA(el.tail, "d", CAP(q.rear[0] + 2, q.rear[1] - 2, te[0], te[1], 3.6));
    var showE = (eOn || stare) && !pv.shut;
    showEl(el.eyes, showE);
    showEl(el.p1, false); showEl(el.p2, false);
    if (showE) {
      if (stare) {
        [el.e1, el.e2].forEach(function (e, i) { setA(e, "cx", f2(hd[0] + (i ? 5 : -5))); setA(e, "cy", f2(hd[1] - 2)); setA(e, "rx", 2.9); setA(e, "ry", 3.3); });
      } else {
        setA(el.e1, "cx", f2(hd[0] + 6)); setA(el.e1, "cy", f2(hd[1] - 3)); setA(el.e1, "rx", 2.3); setA(el.e1, "ry", 2.5);
        setA(el.e2, "rx", 0); setA(el.e2, "ry", 0);
      }
    }
    var th = pv.teeth > 0.5 && !q.cat && !stare;
    showEl(el.teeth, th);
    if (th) { var x0 = hd[0] + 6, y0 = hd[1] + 9; setA(el.teeth, "d", "M" + f2(x0) + " " + f2(y0) + "l3 3 l3 -3 l3 3 l3 -3"); setA(el.teeth, "stroke-width", 1.6); }
    updHalos(el, 2.2);
  }
  function drawOwl(f, t, eOn, name) {
    var el = f.el, sleep = name === "sleep";
    setA(el.body, "d", E(0, -44, 25, 42));
    setA(el.ears, "d", PL([-21, -74], [-14, -99], [-6, -80]) + PL([21, -74], [14, -99], [6, -80]));
    setA(el.snout, "d", PL([-3.5, -57], [3.5, -57], [0, -48]));
    setA(el.snout, "class", "pf-m");
    setA(el.legF, "d", R(-12, -5, 9, 5, 2) + R(3, -5, 9, 5, 2));
    ["tail", "legB", "neck", "head"].forEach(function (n) { setA(el[n], "d", "M0 0"); });
    showEl(el.teeth, false);
    showEl(el.eyes, true);
    var blink = sleep ? 0.12 : (t * 0.6 + f.h * 0.01) % 1 < 0.05 ? 0.15 : 1;
    var look = name === "stare" ? 0 : Math.sin(t * 0.9) * 3.2, lookY = name === "stare" ? 0 : Math.cos(t * 0.7) * 1.2;
    [el.e1, el.e2].forEach(function (e, i) { setA(e, "cx", i ? 10.5 : -10.5); setA(e, "cy", -64); setA(e, "rx", 9.5); setA(e, "ry", f2(9.5 * blink)); });
    [el.p1, el.p2].forEach(function (e, i) { showEl(e, blink > 0.5); setA(e, "cx", f2((i ? 10.5 : -10.5) + look)); setA(e, "cy", f2(-64 + lookY)); setA(e, "r", name === "stare" ? 5.4 : 4.6); });
  }
  function drawCrow(f, t, eOn, name) {
    var el = f.el, hy = name === "alert" ? -76 : name === "sleep" || name === "hide" || name === "lie" ? -60 : -70;
    setA(el.body, "d", "M-30 -40 Q-8 -70 22 -60 Q36 -50 22 -34 Q0 -22 -30 -40 Z");
    setA(el.head, "d", C(26, hy, 13));
    setA(el.snout, "d", PL([36, hy - 5], [58, hy + 1], [37, hy + 6]));
    setA(el.snout, "class", "pf-i");
    setA(el.tail, "d", PL([-24, -44], [-56, -30], [-50, -20], [-20, -36]));
    setA(el.legF, "d", CAP(-2, -32, -6, -2, 1.8) + CAP(8, -32, 10, -2, 1.8) + R(-12, -4, 12, 3, 1) + R(6, -4, 12, 3, 1));
    ["legB", "neck", "ears"].forEach(function (n) { setA(el[n], "d", "M0 0"); });
    showEl(el.teeth, false);
    var showE = eOn || name === "stare";
    showEl(el.eyes, showE && name !== "sleep");
    showEl(el.p1, false); showEl(el.p2, false);
    setA(el.e1, "cx", 30); setA(el.e1, "cy", hy - 3); setA(el.e1, "rx", 2.6); setA(el.e1, "ry", 2.6);
    setA(el.e2, "rx", 0); setA(el.e2, "ry", 0);
  }

  // ------------------------- settings (rooms) -------------------------
  // Item: [object, name, fx (landscape, fraction of the room span), px (portrait; null = landscape only), size (x FH), up (x FH above floor), layer]
  var SETTINGS = {
    bedroom: { slots: [0.56, 0.72, 0.44], pslots: [0.6, 0.72, 0.4], items: [
      ["window", "window", 0.55, 0.56, 0.62, 0.56, "wall"], ["clock", "clock", 0.74, 0.2, 0.24, 0.88, "wall"], ["bed", "bed", 0.2, 0.26, 0.62, 0, "mid"],
      ["nightstand", "nightstand", 0.385, null, 0.3, 0, "mid"], ["table-lamp", "lamp", 0.385, null, 0.3, 0.232, "mid"], ["door", "door", 0.9, 0.86, 1.18, 0, "back"]] },
    hallway: { slots: [0.56, 0.67, 0.36], pslots: [0.56, 0.76, 0.34], items: [
      ["door", "door", 0.1, 0.16, 1.18, 0, "back"], ["frame", "frame", 0.29, null, 0.36, 0.58, "wall"], ["bulb", "bulb", 0.43, 0.4, 0.3, 1.02, "wall"],
      ["door", "door2", 0.8, null, 1.18, 0, "back"], ["plant", "plant", 0.94, 0.92, 0.4, 0, "mid"]] },
    "front-door": { slots: [0.32, 0.78, 0.9], pslots: [0.2, 0.8, 0.92], items: [
      ["window", "window", 0.2, null, 0.55, 0.52, "wall"], ["door", "door", 0.5, 0.5, 1.24, 0, "back"], ["doormat", "mat", 0.5, 0.5, 0.36, -0.02, "mid"],
      ["bulb", "bulb", 0.62, 0.68, 0.24, 1.02, "wall"], ["plant", "plant", 0.68, 0.88, 0.42, 0, "mid"]] },
    "living-room": { slots: [0.56, 0.3, 0.92], pslots: [0.6, 0.3, 0.45], items: [
      ["lamp", "lamp", 0.07, null, 0.84, 0, "mid"], ["frame", "frame", 0.3, 0.3, 0.3, 0.66, "wall"], ["window", "window", 0.52, null, 0.58, 0.58, "wall"],
      ["couch", "couch", 0.3, 0.29, 0.46, 0, "mid"], ["table", "table", 0.8, 0.8, 0.3, 0, "mid"], ["tv", "tv", 0.8, 0.8, 0.4, 0.18, "mid"]] },
    kitchen: { slots: [0.28, 0.84, 0.5], pslots: [0.45, 0.92, 0.62], items: [
      ["fridge", "fridge", 0.08, 0.15, 0.95, 0, "mid"], ["window", "window", 0.4, null, 0.55, 0.62, "wall"], ["sink", "sink", 0.4, null, 0.5, 0, "mid"],
      ["clock", "clock", 0.86, 0.72, 0.22, 0.92, "wall"], ["chair", "chair", 0.57, 0.6, 0.5, 0, "mid"], ["table", "table", 0.7, 0.74, 0.36, 0, "mid"]] },
    street: { road: 1, slots: [0.28, 0.64, 0.88], pslots: [0.66, 0.84, 0.5], items: [
      ["moon", "moon", 0.9, 0.84, 0.24, 1.2, "wall"], ["lamppost", "lamp", 0.08, 0.95, 1.25, 0, "mid"], ["house", "house", 0.45, 0.26, 0.8, 0, "back"],
      ["tree", "tree", 0.76, null, 1.0, 0, "back"], ["fence", "fence", 0.92, null, 0.36, 0, "back"]] },
    car: { road: 1, slots: [0.28, 0.72, 0.9], pslots: [0.13, 0.86, 0.5], items: [
      ["moon", "moon", 0.84, 0.8, 0.22, 1.22, "wall"], ["lamppost", "lamp", 0.1, null, 1.25, 0, "mid"], ["tree", "tree", 0.9, null, 1.0, 0, "back"], ["car", "car", 0.5, 0.5, 0.6, 0, "mid"]] },
    bathroom: { slots: [0.46, 0.78, 0.1], pslots: [0.5, 0.32, 0.86], items: [
      ["bath", "bath", 0.24, 0.26, 0.42, 0, "mid"], ["mirror", "mirror", 0.62, 0.66, 0.42, 0.66, "wall"], ["sink", "sink", 0.62, 0.66, 0.5, 0, "mid"], ["door", "door", 0.9, null, 1.18, 0, "back"]] },
    basement: { slots: [0.46, 0.62, 0.9], pslots: [0.56, 0.72, 0.9], items: [
      ["stairs", "stairs", 0.14, 0.2, 0.8, 0, "back"], ["bulb", "bulb", 0.5, 0.56, 0.3, 1.0, "wall"], ["box", "box", 0.74, 0.82, 0.3, 0, "mid"],
      ["box", "box2", 0.78, null, 0.22, 0.3, "mid"], ["shelf", "shelf", 0.9, null, 0.3, 0.66, "wall"]] },
    forest: { slots: [0.47, 0.22, 0.74], pslots: [0.5, 0.25, 0.75], items: [
      ["moon", "moon", 0.78, 0.74, 0.24, 1.22, "wall"], ["pine", "pine", 0.05, 0.08, 1.3, 0, "back"], ["pine", "pine2", 0.32, null, 1.05, 0, "back"],
      ["pine", "pine3", 0.64, 0.5, 1.24, 0, "back"], ["pine", "pine4", 0.94, 0.92, 1.12, 0, "back"], ["bush", "bush", 0.47, 0.3, 0.3, 0, "mid"], ["stone", "stone", 0.82, null, 0.18, 0, "mid"]] },
    "bus-stop": { road: 1, slots: [0.38, 0.62, 0.72], pslots: [0.36, 0.7, 0.55], items: [
      ["bus-stop", "sign", 0.24, 0.16, 0.9, 0, "mid"], ["bench", "bench", 0.5, 0.52, 0.3, 0, "mid"], ["lamppost", "lamp", 0.86, 0.92, 1.25, 0, "mid"], ["moon", "moon", 0.66, null, 0.22, 1.22, "wall"]] },
    "outside-window": { slots: [0.18, 0.82, 0.5], pslots: [0.18, 0.82, 0.5], items: [
      ["moon", "moon", 0.86, 0.84, 0.24, 1.24, "wall"], ["window", "window", 0.5, 0.5, 1.0, 0.24, "wall"], ["bush", "bush", 0.3, 0.2, 0.32, 0, "mid"], ["bush", "bush2", 0.7, 0.8, 0.32, 0, "mid"]] },
    plain: { slots: [0.5, 0.3, 0.7], pslots: [0.5, 0.25, 0.75], items: [] },
    none: { slots: [0.5, 0.3, 0.7], pslots: [0.5, 0.25, 0.75], items: [], nofloor: 1 },
  };
  var SET_SYN = { room: "bedroom", bed: "bedroom", corridor: "hallway", hall: "hallway", door: "front-door", entrance: "front-door", porch: "front-door", lounge: "living-room", livingroom: "living-room",
    tv: "living-room", road: "street", outside: "street", garage: "car", bath: "bathroom", toilet: "bathroom", cellar: "basement", woods: "forest", bus: "bus-stop", window: "outside-window", yard: "outside-window" };
  function settingKey(n) { n = str(n).toLowerCase().replace(/\s+/g, "-"); if (SETTINGS[n]) return n; var k = n.replace(/-/g, ""); return SET_SYN[k] || (SETTINGS[k] ? k : "plain"); }
  function roomX(f) { return st.rx0 + st.rw * f; }
  function setting(name, o) {
    var s = ensure();
    o = obj(o);
    var key = settingKey(name), def = SETTINGS[key], objs = {}, FH = s.FH;
    if (!def.nofloor) {
      var sa = s.sa;
      if (def.road) {
        var rb = svg("g", {}, s.L.back);
        svg("rect", { x: sa.x0 - u(40), y: s.floor, width: sa.w + u(80), height: FH * 0.075, class: "pf-i" }, rb);
        for (var i = 0; i < 9; i++) svg("rect", { x: sa.x0 + (sa.w / 9) * i + u(10), y: s.floor + FH * 0.032, width: sa.w / 18, height: FH * 0.012, class: "pf-p" }, rb);
      } else svg("rect", { x: sa.x0 - u(40), y: s.floor, width: sa.w + u(80), height: Math.max(u(7), FH * 0.017), class: "pg-floor" }, s.L.back);
    }
    def.items.forEach(function (itm) {
      var fx = P ? itm[3] : itm[2];
      if (fx == null) return;
      var ob_ = makeObject(itm[0], { x: roomX(fx), y: s.floor - itm[5] * FH, size: itm[4] * FH, layer: itm[6], at: o.at });
      var bx = ob_.box(0);
      if (bx.x < s.rx0) ob_.tr.base.x += s.rx0 - bx.x;
      else if (bx.x + bx.w > s.rx1) ob_.tr.base.x -= bx.x + bx.w - s.rx1;
      ob_.role = itm[1];
      objs[itm[1]] = ob_;
    });
    var slots = (P ? def.pslots : def.slots).map(function (f) { return roomX(f) / W; });
    s.room = { name: key, objs: objs, slots: slots, road: !!def.road };
    if (objs.clock && o.time) objs.clock.setTime(o.time, 0);
    return s.room;
  }
  // Spot under / behind furniture where a pet hides.
  function hideSpot(room) {
    var o = room.objs, b = o.bed || o.couch || o.table || o.bench || o.bath || o.box || o.bush;
    if (!b) return null;
    var bb = b.box(0);
    return { obj: b, x: bb.x + bb.w * (b === o.bed ? 0.56 : 0.5), y: st.floor };
  }

  // ------------------------- actions -------------------------
  var ACTIONS = ["door-opens", "door-slams", "knock", "lights-flicker", "lights-out", "phone-rings", "curtains-close", "curtains-open", "visitor-at-door", "visitor-at-window",
    "eyes-in-the-dark", "dog-hides", "dog-stares", "dog-growls", "tv-static", "car-arrives", "bus-arrives", "clock-strikes", "footsteps", "run", "hide", "lamp-on", "lamp-off", "owl-watches", "poster"];
  function protagonist() { return st.figs.filter(function (f) { return f.kind === "figure" && f.id !== "visitor"; })[0] || null; }
  function firstPet() { return st.figs.filter(function (f) { return f.kind === "pet"; })[0] || null; }
  function roomObj(names) { var r = st.room; if (!r) return null; for (var i = 0; i < names.length; i++) if (r.objs[names[i]]) return r.objs[names[i]]; return null; }
  function ensureObj(role, name, o) {
    var r = st.room || setting("plain");
    if (r.objs[role]) return r.objs[role];
    var it = makeObject(name, o);
    it.role = role;
    r.objs[role] = it;
    return it;
  }
  function doorway(door) { var b = door.box(0), dd = door.def.door, sx = b.w / door.def.w; return { x: b.x + Math.min(dd.hx, dd.hx + dd.pw) * sx, y: b.y + dd.y0 * (b.h / 100), w: Math.abs(dd.pw) * sx, h: (dd.y1 - dd.y0) * (b.h / 100) }; }
  function clipRect(r) {
    var id = uid("clip"), cp = svg("clipPath", { id: id, clipPathUnits: "userSpaceOnUse" }, st.defs);
    svg("rect", { x: r.x, y: r.y, width: r.w, height: r.h }, cp);
    return "url(#" + id + ")";
  }
  // Visitor standing in a doorway: only its eyes and smile show against the dark opening.
  function visitorInDoor(door, at) {
    var dw = doorway(door), g = svg("g", { "clip-path": clipRect(dw) }, st.L.figs);
    var vis = makeFigure("visitor", { x: dw.x + dw.w * 0.55, y: st.floor, h: dw.h * 0.97, color: "void", at: at, facing: "front", pose: "stand" });
    g.appendChild(vis.g);
    vis.smileT0 = at;
    vis.at = at;
    vis.inDoor = true;
    return vis;
  }
  function eyesAt(x, y, size, at, until) {
    var s = ensure(), g = svg("g", { class: "pg-darkeyes" }, s.L.glow), e1 = svg("ellipse", { class: "pf-w" }, g), e2 = svg("ellipse", { class: "pf-w" }, g);
    var it = { kind: "eyes", g: g, at: num(at, s.cursor), until: until == null ? 1e9 : num(until, 1e9), x: x, y: y, size: size };
    addAnim(function (t) {
      var on = t >= it.at && t < it.until;
      showEl(g, on);
      if (!on) return;
      var bl = (t - it.at) % 2.7 > 2.55 ? 0.12 : 1, k = popScale(t, it.at);
      [e1, e2].forEach(function (e, i) { setA(e, "cx", f1(x + (i ? 1 : -1) * size * 0.55)); setA(e, "cy", f1(y)); setA(e, "rx", f1(size * 0.24 * k)); setA(e, "ry", f1(size * 0.3 * bl * k)); });
    });
    return it;
  }
  function action(name, at, o) {
    var s = ensure();
    o = obj(o);
    name = str(name).toLowerCase();
    at = num(at, s.cursor);
    var r = s.room || setting("plain"), you = protagonist(), pet = firstPet(), FH = s.FH, focus = null, door, win;
    if (name === "door-opens" || name === "visitor-at-door") {
      door = ensureObj("door", "door", { x: roomX(P ? 0.86 : 0.9), size: FH * 1.18, layer: "back" });
      door.open(at - 0.15, 74, 0.6);
      if (name === "visitor-at-door") { var vv = visitorInDoor(door, at + 0.35); s.visitor = vv; focus = door; }
      else focus = door;
      if (you && name === "visitor-at-door") { you.pose("scared", at + 0.5); }
      else if (you) you.pose("look", at + 0.1);
    } else if (name === "door-slams") {
      door = ensureObj("door", "door", { x: roomX(P ? 0.86 : 0.9), size: FH * 1.18, layer: "back" });
      door.open(Math.max(0, at - 0.9), 60, 0.4);
      door.close(at, 0.12);
      shakeFx(at + 0.1, 0.4, u(16));
      if (you) you.pose("scared", at + 0.12);
      focus = door;
    } else if (name === "knock") {
      door = roomObj(["door"]) || ensureObj("door", "door", { x: roomX(P ? 0.86 : 0.9), size: FH * 1.18, layer: "back" });
      [0, 0.32, 0.64].forEach(function (d) { door.shakeAt(at + d, 0.22, 1.6); });
      knockMarks(door, at);
      shakeFx(at, 0.2, u(6)); shakeFx(at + 0.32, 0.2, u(6)); shakeFx(at + 0.64, 0.2, u(6));
      if (you) { you.pose("listen", at + 0.25); }
      if (pet) { pet.pose("alert", at + 0.2); }
      focus = door;
    } else if (name === "lights-flicker") {
      flicker(at, num(o.dur, 1.2), 0.5);
      if (you) you.pose("look", at + 0.3);
      focus = roomObj(["lamp", "bulb"]) || you;
    } else if (name === "lights-out" || name === "lamp-off") {
      var lamp = roomObj(["lamp", "bulb"]);
      if (lamp) lamp.light(false, at);
      if (name === "lights-out") { flicker(at - 0.3, 0.3, 0.6); lightsOut(at, o.until); if (you) you.eyes(true, at); if (pet) pet.eyes(true, at); }
      focus = lamp || you;
    } else if (name === "lamp-on") {
      var lp = roomObj(["lamp", "bulb"]) || ensureObj("lamp", "table-lamp", { x: roomX(P ? 0.5 : 0.4), size: FH * 0.3 });
      lp.light(true, at); focus = lp;
    } else if (name === "phone-rings") {
      var ph = roomObj(["phone"]);
      if (!ph) {
        var ns = roomObj(["nightstand", "table"]), nb = ns ? ns.box(0) : null;
        ph = ensureObj("phone", "phone", { x: nb ? nb.x + nb.w * 0.5 : you ? you.box(0).x + you.box(0).w + FH * 0.18 : W / 2, y: nb ? nb.y + nb.h * 0.04 : s.floor, size: FH * 0.16, at: at - 0.3 });
      }
      ringPhone(ph, at, num(o.dur, 2.2));
      if (you) you.pose("look", at + 0.2);
      focus = ph;
    } else if (name === "curtains-close" || name === "curtains-open") {
      win = roomObj(["window"]) || ensureObj("window", "window", { x: roomX(0.5), y: s.floor - FH * 0.56, size: FH * 0.62, layer: "wall" });
      if (name === "curtains-close") win.curtains(1, at - 0.1, 0.7); else { win.curtTr.set(1, 0); win.curtains(0, at - 0.1, 0.7); }
      focus = win;
    } else if (name === "visitor-at-window") {
      win = roomObj(["window"]) || ensureObj("window", "window", { x: roomX(0.5), y: s.floor - FH * 0.56, size: FH * 0.62, layer: "wall" });
      win.part("face", { op: 1 }, at, 0.01);
      if (you) you.pose("scared", at + 0.4);
      focus = win;
    } else if (name === "eyes-in-the-dark") {
      var cx = o.x != null ? o.x : roomX(P ? 0.8 : 0.82), cy = o.y != null ? o.y : s.floor - FH * 0.8;
      eyesAt(cx, cy, FH * 0.07, at);
      eyesAt(cx - FH * 0.35, cy + FH * 0.25, FH * 0.05, at + 0.5);
      if (you) you.pose("scared", at + 0.3);
      focus = { x: cx - FH * 0.15, y: cy - FH * 0.1, w: FH * 0.3, h: FH * 0.2 };
    } else if (name === "dog-hides" || name === "hide") {
      var who = name === "dog-hides" ? pet : you, sp = hideSpot(r);
      if (who) {
        if (sp && name === "dog-hides") { who.runTo(sp.x, Math.max(0.1, at - 0.55), 0.55); who.pose("hide", at); }
        else if (sp) { who.walkTo(sp.x + sp.obj.w * 0.55, Math.max(0.1, at - 0.7), 0.6); who.pose("hide", at); }
        else who.pose("hide", at);
        focus = sp ? sp.obj : who;
      }
      if (name === "dog-hides" && you) you.pose("look", at + 0.2);
    } else if (name === "dog-stares" || name === "dog-growls") {
      if (pet) { pet.pose(name === "dog-stares" ? "stare" : "growl", at); if (name === "dog-stares") pet.eyes(true, at); focus = pet; }
      if (you) you.pose("look", at + 0.3);
    } else if (name === "tv-static") {
      var tv = roomObj(["tv"]) || ensureObj("tv", "tv", { x: roomX(P ? 0.78 : 0.8), y: s.floor - FH * 0.18, size: FH * 0.4 });
      tv.staticOn(at, o.until); flicker(at, 0.6, 0.35); focus = tv;
    } else if (name === "car-arrives" || name === "bus-arrives") {
      var bus = name === "bus-arrives", vk = bus ? "bus" : "car";
      var v0 = roomObj([vk]);
      var tx = o.x != null ? o.x : roomX(bus ? (P ? 0.55 : 0.62) : 0.55), vsz = FH * (bus ? 0.62 : 0.55);
      if (!v0) v0 = ensureObj(vk, vk, { x: tx, size: vsz, layer: "mid" });
      var bx = v0.tr.base.x;
      v0.tr.base = Object.assign({}, v0.tr.base, { x: W + v0.w * 0.7 });
      v0.to({ x: bx }, at - 1.0, 1.0, "outCubic");
      v0.roll(at - 1.0, 1.0, -3);
      v0.light(true, at - 1.0);
      if (you) you.pose("look", at);
      focus = v0;
    } else if (name === "clock-strikes") {
      var ck = roomObj(["clock"]) || ensureObj("clock", "clock", { x: roomX(0.7), y: s.floor - FH * 0.88, size: FH * 0.24, layer: "wall" });
      ck.setTime(o.time || "3:00", at - 0.4, 0.4);
      [0, 0.3, 0.6].forEach(function (d) { ck.shakeAt(at + d, 0.25, 6); });
      knockMarks(ck, at);
      focus = ck;
    } else if (name === "footsteps") {
      var tgt = roomObj(["door", "bed"]), fx0 = you ? you.box(0).x + you.box(0).w : roomX(0.3), fx1 = tgt ? tgt.box(0).x : roomX(0.8);
      if (fx1 < fx0) { var tmp = fx0; fx0 = fx1; fx1 = tmp; }
      var fp = makeObject("footprints", { x: (fx0 + fx1) / 2, y: s.floor + FH * 0.06, size: FH * 0.1, layer: "front" });
      ["f0", "f1", "f2", "f3"].forEach(function (k, i) { fp.parts[k].tr.base = { rot: 0, dx: 0, dy: 0, op: 0, sx: 1, sy: 1 }; fp.part(k, { op: 1 }, at + i * 0.3, 0.01); });
      if (you) you.pose("listen", at);
      focus = fp;
    } else if (name === "run") {
      if (you) {
        var ex = roomObj(["door", "door2"]), xs = ex ? ex.box(0).x + ex.box(0).w / 2 : (you.tr.val(at).x > W / 2 ? s.rx0 + FH * 0.2 : s.rx1 - FH * 0.2);
        you.runTo(xs, at, null);
        focus = you;
      }
    } else if (name === "owl-watches") {
      var owl = st.figs.filter(function (f) { return f.id === "owl"; })[0];
      if (!owl) {
        var perch = roomObj(["window", "tree", "shelf", "frame"]), pb = perch ? perch.box(0) : null;
        owl = makeFigure("owl", { x: pb ? pb.x + pb.w * 0.7 : roomX(0.78), y: pb ? pb.y + (perch.name === "window" ? pb.h * 0.86 : 0) : s.floor - FH, at: at, h: FH * 0.26 });
      }
      owl.pose("stare", at + 1.2);
      focus = owl;
    } else if (name === "poster") {
      var pst = roomObj(["poster"]) || ensureObj("poster", "poster", { x: roomX(P ? 0.5 : 0.62), y: s.floor - FH * 0.5, size: FH * 0.42, layer: "wall", at: at });
      pst.pop(at); focus = pst;
    }
    return focus;
  }
  function knockMarks(target, at) {
    var s = st, b = target.box(0), g = svg("g", {}, s.L.fx), side = b.x + b.w / 2 > W / 2 ? -1 : 1;
    var x0 = side > 0 ? b.x + b.w + u(12) : b.x - u(12), y0 = b.y + b.h * 0.42, L = Math.max(u(26), b.h * 0.1);
    for (var i = 0; i < 3; i++) {
      var a = rad(-35 + i * 35), p = svg("path", { class: "ps-a", "stroke-width": u(7), d: "M" + f1(x0 + side * Math.cos(a) * L * 0.4) + " " + f1(y0 + Math.sin(a) * L * 0.4) + "L" + f1(x0 + side * Math.cos(a) * L * 1.3) + " " + f1(y0 + Math.sin(a) * L * 1.3) }, g);
      p.setAttribute("stroke-linecap", "round");
    }
    addAnim(function (t) {
      var on = false;
      [0, 0.32, 0.64].forEach(function (d) { if (t >= at + d && t < at + d + 0.2) on = true; });
      showEl(g, on);
    });
  }
  function ringPhone(ph, at, dur) {
    ph.shakeAt(at, dur, 7);
    var w = ph.parts.waves;
    if (w) { w.tr.base = Object.assign({}, w.tr.base, { op: 0 }); w.tr.set({ op: 1 }, at); w.tr.set({ op: 0 }, at + dur); }
    if (ph.parts.screen) { var sc_ = ph.parts.screen; addAnim(function (t) { setA(sc_.el, "class", t >= at && t < at + dur && Math.floor((t - at) * 4) % 2 === 0 ? "pf-a" : "pf-p"); }); }
  }

  // ------------------------- text measuring -------------------------
  var mctx = null;
  function textW(txt, size) {
    if (!mctx) mctx = doc.createElement("canvas").getContext("2d");
    mctx.font = size + "px " + FONT;
    return mctx.measureText(txt).width;
  }
  function parseKey(text, key) {
    var toks = [];
    str(text).replace(/\s*\*\s*\*\s*/g, " ").split("*").forEach(function (pt, i) {
      pt.split(/\s+/).filter(Boolean).forEach(function (w) { toks.push({ w: w.toUpperCase(), k: i % 2 === 1 }); });
    });
    if (key && !toks.some(function (t) { return t.k; })) {
      var nk = normWord(key);
      toks.forEach(function (t) { if (normWord(t.w) === nk) t.k = true; });
    }
    return toks;
  }
  // Balanced line breaking: the partition into n lines with the smallest widest line.
  function bestBreak(widths, n, lineW) {
    var m = widths.length, best = null;
    n = Math.min(n, m);
    function rec(start, left, cur) {
      if (left === 1) {
        var lines = cur.concat([[start, m]]), mw = 0;
        lines.forEach(function (l) { mw = Math.max(mw, lineW(l[0], l[1])); });
        if (!best || mw < best.w - 0.01) best = { w: mw, lines: lines };
        return;
      }
      for (var e = start + 1; e <= m - left + 1; e++) rec(e, left - 1, cur.concat([[start, e]]));
    }
    if (m) rec(0, n, []);
    return best || { w: 0, lines: [] };
  }
  // Lays out a stamp: lines of segments (runs of key / plain words). Returns size and lines.
  function layoutStamp(toks, size, maxW, maxLines) {
    var padX = 0.17, gapSeg = 0.07, space = textW(" ", 100) / 100;
    var tw = toks.map(function (t) { return textW(t.w, 100) / 100; });
    function lineW(a, b) {
      var w = 0, nseg = 0;
      for (var i = a; i < b; i++) {
        var newSeg = i === a || toks[i].k !== toks[i - 1].k || toks[i].k;
        if (newSeg) { nseg++; w += padX * 2; } else w += space;
        w += tw[i];
      }
      return w + Math.max(0, nseg - 1) * gapSeg;
    }
    var s0 = size, res = null;
    for (var it = 0; it < 30 && !res; it++) {
      for (var n = 1; n <= Math.max(1, maxLines); n++) {
        var b = bestBreak(tw, n, lineW);
        if (b.w * s0 <= maxW) { res = { size: s0, lines: b.lines, w: b.w * s0 }; break; }
      }
      if (!res) s0 *= 0.93;
      if (s0 < size * 0.25) break;
    }
    if (!res) { var bb = bestBreak(tw, Math.max(1, maxLines), lineW); s0 = maxW / Math.max(0.01, bb.w); res = { size: s0, lines: bb.lines, w: maxW }; }
    // Prefer two balanced lines over one very wide line for long stamps.
    if (res.lines.length === 1 && toks.length >= 4 && maxLines >= 2 && res.w > maxW * 0.86) {
      var b2 = bestBreak(tw, 2, lineW);
      if (b2.w * res.size * 1.12 <= maxW) res = { size: res.size * 1.12, lines: b2.lines, w: b2.w * res.size * 1.12 };
    }
    res.padX = padX; res.gapSeg = gapSeg;
    res.lineH = res.size * 1.13; res.gap = res.size * 0.07;
    res.h = res.lines.length * res.lineH + (res.lines.length - 1) * res.gap;
    return res;
  }

  // ------------------------- overlay items (screen space) -------------------------
  var SIZES = { xl: 150, lg: 118, md: 90, sm: 66, xs: 48 };
  function overlayItem(el, kind, label, at, until, extra) {
    var s = ensure(), it = Object.assign({ el: el, kind: kind, label: label, at: num(at, s.cursor), until: until == null ? 1e9 : num(until, 1e9), screen: true, cx: 0, cy: 0, w: 0, h: 0, rot: 0, slam: true, shown: new Tr(1) }, extra || {});
    it.hide = function (t) { it.until = Math.min(it.until, num(t, s.cursor)); return it; };
    it.box = function (t) { return { x: it.cx - it.w / 2, y: it.cy - it.h / 2, w: it.w, h: it.h }; };
    it.visible = function (t) { return t >= it.at && t < it.until && it.shown.val(t) > 0.5; };
    addAnim(function (t) {
      var on = it.visible(t);
      showEl(it.el, on);
      if (!on) return;
      if (it.pre) it.pre(t);
      var k = 1, r = it.rot;
      if (it.slam) { var p = clamp((t - it.at) / 0.16, 0, 1); k = 1 + (it.slamK || 0.65) * (1 - V.ease.outCubic(p)); r += (1 - p) * (it.slamR != null ? it.slamR : -5); }
      if (it.wipe) { var q = clamp((t - it.at) / it.wipe, 0, 1); setS(it.el, "clipPath", q >= 1 ? "none" : "inset(0 " + f1((1 - q) * 100) + "% 0 0)"); }
      if (it.pulse) { var pu = it.pulse(t); k *= pu; }
      var dx = 0, dy = 0;
      if (it.vib) { var vb = it.vib(t); dx = vb[0]; dy = vb[1]; r += vb[2] || 0; }
      setS(it.el, "transform", "translate(" + f1(it.cx - it.w / 2 + dx) + "px," + f1(it.cy - it.h / 2 + dy) + "px) rotate(" + f2(r) + "deg) scale(" + k.toFixed(4) + ")");
      if (it.upd) it.upd(t);
    });
    if (!it.noInspect) addItem(kind, label, function (t) { return it.visible(t) ? it.box(t) : null; }, false);
    s.cursor = Math.max(s.cursor, it.at + 0.4);
    return it;
  }
  function placeY(pos, h, sa) {
    if (pos === "top") return sa.y0 + h / 2;
    if (pos === "center") return P ? sa.cy : H / 2;
    if (pos === "lower") return P ? sa.y0 + sa.h * 0.7 : H * 0.7;
    if (pos === "bottom") return sa.y1 - h / 2;
    return Math.max(sa.y0 + h / 2, P ? sa.y0 + h / 2 + u(24) : H * 0.2);
  }
  function stamp(text, at, o) {
    var s = ensure();
    o = obj(o);
    var sa = s.sa, toks = parseKey(text, o.key);
    if (!toks.length) toks = [{ w: "!", k: true }];
    var size = u(SIZES[o.size] || (P ? SIZES.lg : SIZES.xl));
    var maxW = (o.maxWidth != null ? clamp(num(o.maxWidth, 0.86), 0.1, 1) * W : sa.w * 0.9);
    maxW = Math.min(maxW, sa.w);
    var nl = num(o.lines, toks.length > 3 ? 2 : 1) | 0 || 1;
    var lay = layoutStamp(toks, size, maxW, nl);
    if (o.lines == null && lay.lines.length === 1 && toks.length > 5) lay = layoutStamp(toks, size, maxW, 3);
    var kickH0 = str(o.kicker) ? Math.max(u(30), lay.size * 0.36) * 1.6 : 0;
    for (var tries = 0; o.maxHeight != null && lay.h + kickH0 > num(o.maxHeight, 1e9) && tries < 8; tries++) {
      size = lay.size * Math.max(0.6, (num(o.maxHeight, 1e9) - kickH0) / lay.h) * 0.98;
      lay = layoutStamp(toks, size, maxW, Math.max(nl, lay.lines.length));
      kickH0 = str(o.kicker) ? Math.max(u(30), lay.size * 0.36) * 1.6 : 0;
    }
    var el = div("pg-stamp c-" + (["mixed", "red", "ink", "yellow"].indexOf(o.color) >= 0 ? o.color : "mixed"), s.ov);
    var kick = str(o.kicker), kh = 0;
    if (kick) {
      var kd = div("pg-kicker", el, kick.toUpperCase());
      var ks = Math.max(u(30), lay.size * 0.36);
      kd.style.fontSize = f1(ks) + "px"; kd.style.padding = f1(ks * 0.2) + "px " + f1(ks * 0.45) + "px"; kd.style.marginBottom = f1(lay.gap * 1.4) + "px";
      kh = ks * 1.4 + lay.gap * 1.4;
    }
    lay.lines.forEach(function (ln, li) {
      var row = div("pg-sline", el);
      if (li) row.style.marginTop = f1(lay.gap) + "px";
      var seg = null;
      for (var i = ln[0]; i < ln[1]; i++) {
        var tk = toks[i];
        if (!seg || tk.k !== seg.k || tk.k) {
          var sp = doc.createElement("span");
          sp.className = "pg-seg" + (tk.k ? " k" : "");
          sp.style.fontSize = f1(lay.size) + "px";
          sp.style.padding = f1(lay.size * 0.07) + "px " + f1(lay.size * lay.padX) + "px " + f1(lay.size * 0.05) + "px";
          if (seg) sp.style.marginLeft = f1(lay.size * lay.gapSeg) + "px";
          row.appendChild(sp);
          seg = { el: sp, k: tk.k, txt: tk.w };
          sp.textContent = tk.w;
        } else { seg.txt += " " + tk.w; seg.el.textContent = seg.txt; }
      }
    });
    var w = lay.w + u(4), h = lay.h + kh;
    var cx = o.x != null ? num(o.x, 0.5) * W : o.pos === "left" ? sa.x0 + w / 2 : o.pos === "right" ? sa.x1 - w / 2 : W / 2;
    var cy = o.y != null ? num(o.y, 0.5) * H : placeY(o.pos === "left" || o.pos === "right" ? "center" : o.pos || "upper", h, sa);
    cx = clamp(cx, sa.x0 + w / 2, sa.x1 - w / 2); cy = clamp(cy, sa.y0 + h / 2, sa.y1 - h / 2);
    el.style.width = f1(w) + "px";
    var it = overlayItem(el, "stamp", str(text).replace(/\*/g, ""), at == null ? s.cursor : at, o.until, { cx: cx, cy: cy, w: w, h: h, rot: num(o.rot, 0), size: lay.size });
    var big = (o.size || (P ? "lg" : "xl")) === "xl" || (o.size || "lg") === "lg";
    if (o.shake === true || (o.shake !== false && big)) shakeFx(it.at + 0.12, 0.32, u(13));
    return it;
  }
  function richText(el, text, key) {
    parseKey(text, key).forEach(function (t, i) {
      if (i) el.appendChild(doc.createTextNode(" "));
      if (t.k) { var k = doc.createElement("span"); k.className = "k"; k.textContent = t.w; el.appendChild(k); } else el.appendChild(doc.createTextNode(t.w));
    });
  }
  function fitText(text, size, maxW, maxLines) {
    var toks = parseKey(text), tw = toks.map(function (t) { return textW(t.w, 100) / 100; }), sp = textW(" ", 100) / 100;
    function lineW(a, b) { var w = 0; for (var i = a; i < b; i++) w += tw[i] + (i > a ? sp : 0); return w; }
    var s0 = size;
    for (var it = 0; it < 30; it++) {
      for (var n = 1; n <= maxLines; n++) { var b = bestBreak(tw, n, lineW); if (b.w * s0 <= maxW) return { size: s0, lines: b.lines.map(function (l) { return toks.slice(l[0], l[1]); }), w: b.w * s0, n: b.lines.length }; }
      s0 *= 0.93;
    }
    var bb = bestBreak(tw, maxLines, lineW);
    return { size: s0, lines: bb.lines.map(function (l) { return toks.slice(l[0], l[1]); }), w: bb.w * s0, n: bb.lines.length };
  }
  function linesInto(el, lay) {
    lay.lines.forEach(function (ln, i) {
      if (i) el.appendChild(doc.createElement("br"));
      ln.forEach(function (t, j) {
        if (j) el.appendChild(doc.createTextNode(" "));
        if (t.k) { var k = doc.createElement("span"); k.className = "k"; k.textContent = t.w; el.appendChild(k); } else el.appendChild(doc.createTextNode(t.w));
      });
    });
  }
  function caption(text, at, o) {
    var s = ensure();
    o = obj(o);
    var sa = s.sa, size = u(num(o.size, 0) || (P ? 50 : 46)), maxW = sa.w * (o.maxWidth || 0.9);
    var lay = fitText(text, size, maxW - size * 1.2, 2);
    var el = div("pg-cap c-" + (o.color || "paper"), s.ov);
    linesInto(el, lay);
    var bw = Math.max(u(4), lay.size * 0.08), padX = lay.size * 0.5, padY = lay.size * 0.24;
    el.style.fontSize = f1(lay.size) + "px"; el.style.padding = f1(padY) + "px " + f1(padX) + "px"; el.style.borderWidth = f1(bw) + "px";
    var w = lay.w + padX * 2 + bw * 2 + u(6), h = lay.n * lay.size * 1.05 + padY * 2 + bw * 2;
    var pos = o.pos || "bottom";
    var cy = o.y != null ? num(o.y, 0.9) * H : pos === "bottom" ? (s.floor && !o.free ? Math.min(sa.y1 - h / 2, Math.max(s.floor + u(14) + h / 2, sa.y1 - h / 2 - u(4))) : sa.y1 - h / 2) : placeY(pos, h, sa);
    var cx = o.x != null ? num(o.x, 0.5) * W : W / 2;
    cx = clamp(cx, sa.x0 + w / 2, sa.x1 - w / 2); cy = clamp(cy, sa.y0 + h / 2, sa.y1 - h / 2);
    el.style.width = f1(w) + "px"; el.style.boxSizing = "border-box";
    return overlayItem(el, "caption", str(text).replace(/\*/g, ""), at == null ? s.cursor : at, o.until, { cx: cx, cy: cy, w: w, h: h, slam: false, wipe: 0.22 });
  }
  function clockStamp(text, at, o) {
    var s = ensure();
    o = obj(o);
    var sa = s.sa, size = u(num(o.size, 0) || (o.pos === "center" ? 150 : P ? 66 : 62));
    var el = div("pg-clock", s.ov);
    var main = doc.createElement("span"), ap = doc.createElement("span");
    ap.className = "ap";
    el.appendChild(main); el.appendChild(ap);
    var bar = div("bar", el);
    bar.style.display = "none";
    function setTxt(tx) {
      var m = /^(.*?)(\s*[AP]\.?M\.?)?$/i.exec(str(tx).toUpperCase());
      if (main._t !== m[1]) { main._t = m[1]; main.textContent = m[1]; }
      var a = m[2] ? " " + m[2].trim() : "";
      if (ap._t !== a) { ap._t = a; ap.textContent = a; }
    }
    setTxt(text);
    var samp = str(text).toUpperCase().replace(/\d/g, "0");
    var mw = textW(samp.replace(/\s*[AP]M$/, ""), size) + (/[AP]M/i.test(text) ? textW(" AM", size * 0.5) : 0);
    el.style.fontSize = f1(size) + "px"; ap.style.fontSize = f1(size * 0.5) + "px";
    var padX = size * 0.28, padY = size * 0.16;
    el.style.padding = f1(padY) + "px " + f1(padX) + "px";
    var w = mw + padX * 2 + u(4), h = size + padY * 2;
    var pos = o.pos || "top-left";
    var cx = pos === "top-right" ? sa.x1 - w / 2 : pos === "center" ? W / 2 : sa.x0 + w / 2;
    var cy = pos === "center" ? (P ? sa.y0 + sa.h * 0.3 : H * 0.36) : sa.y0 + h / 2;
    if (o.x != null) cx = num(o.x, 0.5) * W;
    if (o.y != null) cy = num(o.y, 0.5) * H;
    cx = clamp(cx, sa.x0 + w / 2, sa.x1 - w / 2); cy = clamp(cy, sa.y0 + h / 2, sa.y1 - h / 2);
    el.style.width = f1(w) + "px"; el.style.boxSizing = "border-box"; el.style.textAlign = "center";
    var it = overlayItem(el, "clock", str(text), at == null ? s.cursor : at, o.until, { cx: cx, cy: cy, w: w, h: h, slamK: 0.35, slamR: 0 });
    it.setTxt = setTxt; it.bar = bar; it.main = main;
    return it;
  }
  function countdown(from, to, at, dur, o) {
    var s = ensure();
    o = obj(o);
    at = num(at, s.cursor); dur = Math.max(0.3, num(dur, 2));
    var m0 = parseClock(from), m1 = parseClock(to);
    if (m0 == null) m0 = 118;
    if (m1 == null) m1 = m0 + 2;
    if (m1 < m0) m1 += 1440;
    var ap = /[ap]m/i.test(str(from) + str(to));
    var it = clockStamp(str(to) || fmtClock(m1, ap), at, o);
    it.setTxt(fmtClock(m0, ap));
    it.bar.style.display = "";
    var steps = Math.max(1, Math.round(m1 - m0)), secs = steps <= 3;
    it.upd = function (t) {
      var p = clamp((t - at) / dur, 0, 1), m = m0 + (m1 - m0) * p;
      it.setTxt(secs && p < 1 ? fmtClock(m, false, true) + (ap ? (Math.floor(m / 60) % 24 < 12 ? " AM" : " PM") : "") : fmtClock(p >= 1 ? m1 : Math.floor(m), ap));
      setS(it.bar, "width", f1(p * 100) + "%");
      setS(it.main, "color", p >= 1 ? "#FFFFFF" : "");
      setS(it.el, "background", p >= 1 ? "var(--accent)" : "");
    };
    if (secs) { // make room for the seconds
      var size = parseFloat(it.el.style.fontSize), extra = textW(":00", size);
      it.w += extra; it.el.style.width = f1(it.w) + "px";
      var sa = s.sa;
      if ((o.pos || "top-left") === "top-left") it.cx = Math.max(it.cx + extra / 2, sa.x0 + it.w / 2);
      else if (o.pos === "top-right") it.cx = Math.min(it.cx - extra / 2, sa.x1 - it.w / 2);
    }
    it.pulse = function (t) { var q = (t - (at + dur)) / 0.18; return q >= 0 && q < 1 ? 1 + 0.25 * (1 - q) : 1; };
    it.doneAt = at + dur;
    return it;
  }
  function badge(n, at, o) {
    var s = ensure();
    o = obj(o);
    var sa = s.sa, size = u(num(o.size, 0) || 96), el = div("pg-badge" + (o.color === "ink" ? " c-ink" : ""), s.ov, String(n == null ? "" : n));
    el.style.width = el.style.height = f1(size) + "px"; el.style.fontSize = f1(size * 0.62) + "px";
    var cx = o.x != null ? num(o.x, 0.9) * W : sa.x1 - size / 2, cy = o.y != null ? num(o.y, 0.1) * H : sa.y0 + size / 2;
    return overlayItem(el, "badge", "badge " + n, at == null ? s.cursor : at, o.until, { cx: clamp(cx, sa.x0 + size / 2, sa.x1 - size / 2), cy: clamp(cy, sa.y0 + size / 2, sa.y1 - size / 2), w: size, h: size, slamK: 0.5, slamR: 12 });
  }
  function svgIn(el, w, h, vb) { var sv = svg("svg", { width: f1(w), height: f1(h), viewBox: vb || "0 0 " + f1(w) + " " + f1(h) }); el.appendChild(sv); return sv; }
  function triangle(at, o) {
    var s = ensure();
    o = obj(o);
    var sa = s.sa, size = u(num(o.size, 0) || 120), el = div("pg-mark-svg", s.ov);
    el.style.width = f1(size * 1.16) + "px"; el.style.height = f1(size) + "px";
    var sv = svgIn(el, size * 1.16, size, "0 0 116 100");
    drawDef("triangle", sv);
    var cx = o.x != null ? num(o.x, 0.1) * W : sa.x0 + size * 0.58, cy = o.y != null ? num(o.y, 0.15) * H : sa.y0 + size / 2;
    var it = overlayItem(el, "triangle", "warning", at == null ? s.cursor : at, o.until, { cx: clamp(cx, sa.x0 + size * 0.58, sa.x1 - size * 0.58), cy: clamp(cy, sa.y0 + size / 2, sa.y1 - size / 2), w: size * 1.16, h: size, slamK: 0.5 });
    if (o.blink) it.shown = { val: function (t) { return t < it.at + 0.5 || (t - it.at) % 0.9 < 0.68 ? 1 : 0; } };
    return it;
  }
  function divider(at, o) {
    var s = ensure();
    o = obj(o);
    var sa = s.sa, hz = o.horizontal != null ? !!o.horizontal : P, th = u(12), el = div("pg-div", s.ov);
    el.style.position = "absolute"; el.style.left = "0"; el.style.top = "0"; el.style.background = "var(--st-bg)";
    var pos = num(o.pos, 0.5), a0 = num(o.from, 0), a1 = num(o.to, 1), w = hz ? sa.w * (a1 - a0) : th, h = hz ? th : sa.h * (a1 - a0);
    el.style.width = f1(w) + "px"; el.style.height = f1(h) + "px";
    var cx = hz ? sa.x0 + sa.w * (a0 + a1) / 2 : sa.x0 + sa.w * pos, cy = hz ? sa.y0 + sa.h * pos : sa.y0 + sa.h * (a0 + a1) / 2;
    if (o.x != null) cx = num(o.x, 0.5) * W;
    if (o.y != null) cy = num(o.y, 0.5) * H;
    var it = overlayItem(el, "divider", "divider", at == null ? s.cursor : at, o.until, { cx: cx, cy: cy, w: w, h: h, slam: false, wipe: 0.2, noInspect: true });
    return it;
  }

  // ------------------------- icons (pictogram inside an HTML card) -------------------------
  function iconSVG(name, w, h, o) {
    o = obj(o);
    var sv = svg("svg", { width: f1(w), height: f1(h), viewBox: "0 0 " + f1(w) + " " + f1(h), class: "pg-icon" });
    var ck = castKey(name), m = Math.min(w, h) * 0.06;
    if (ck) {
      var cd = CAST[ck], fh = (h - m * 2) * (cd.kind === "pet" ? (ck === "owl" ? 0.92 : ck === "crow" ? 0.7 : 0.78) : ck === "visitor" ? 0.98 : 0.95);
      var g = svg("g", {}, sv);
      makeFigure(ck, { static: true, parent: g, x: w / 2, y: h - m, h: fh, pose: o.pose || (ck === "visitor" ? "reach" : cd.kind === "pet" ? "stand" : "stand"), facing: o.facing || (cd.kind === "pet" ? "right" : "front"), eyes: ck === "visitor" || o.eyes, t: 3 });
    } else {
      var key = objectKey(name) || pickObject(name), def = OB[key], sc = Math.min((w - m * 2) / def.w, (h - m * 2) / 100);
      var g2 = svg("g", { transform: "translate(" + f2(w / 2 - (def.w * sc) / 2) + " " + f2(h / 2 - 50 * sc) + ") scale(" + sc.toFixed(4) + ")", class: o.accent ? "pg-acc" : "" }, sv);
      var parts = drawDef(key, g2);
      ["glow", "waves", "face", "static", "gap"].forEach(function (pn) { if (parts[pn]) parts[pn].el.style.display = "none"; });
      if (parts.hour) { parts.hour.el.setAttribute("transform", "rotate(60 50 52)"); }
      if (def.text) { var tx = svg("text", { x: def.text.x, y: def.text.y, "font-size": def.text.size, "text-anchor": "middle", class: "pg-dtext" }, g2); tx.textContent = "2:00"; }
    }
    if (o.forbidden) {
      var r = Math.min(w, h) * 0.46, cx = w / 2, cy = h / 2, sw = r * 0.16;
      svg("circle", { cx: cx, cy: cy, r: f1(r - sw / 2), class: "ps-a", "stroke-width": f1(sw) }, sv);
      var a = rad(-45), d = r - sw / 2;
      svg("path", { d: "M" + f1(cx - Math.cos(a) * d) + " " + f1(cy - Math.sin(a) * d) + "L" + f1(cx + Math.cos(a) * d) + " " + f1(cy + Math.sin(a) * d), class: "ps-a", "stroke-width": f1(sw) }, sv);
    }
    return sv;
  }

  // ------------------------- rule card -------------------------
  function ruleCard(n, text, at, o) {
    var s = ensure();
    o = obj(o);
    var sa = s.sa, el = div("pg-card", s.ov), stack = P && !o.row;
    var cw = Math.min(sa.w, o.width != null ? fx01(o.width, W, 0.6) : P ? sa.w * 0.94 : Math.min(sa.w * 0.7, u(1180)));
    var icon = str(o.icon), bw = u(9), pad = u(P ? 34 : 34);
    var ic = icon ? (stack ? Math.min(cw * 0.5, u(400)) : Math.min(cw * 0.3, u(330))) : 0;
    var tAreaW = stack ? cw - pad * 2 - bw * 2 : cw - pad * (icon ? 3 : 2) - bw * 2 - ic;
    var lay = fitText(text, u(num(o.size, 0) || (P ? 104 : 96)), tAreaW, 3);
    var textH = lay.n * lay.size * 1.02;
    var tabSize = u(P ? 58 : 50), tabH = tabSize * 1.36;
    var ch = stack ? tabH * 0.5 + pad + (icon ? ic + pad * 0.8 : 0) + textH + pad + bw * 2 : Math.max(ic + pad * 2, textH + pad * 2 + tabH * 0.4) + bw * 2;
    el.style.width = f1(cw) + "px"; el.style.height = f1(ch) + "px"; el.style.borderWidth = f1(bw) + "px";
    var tab = div("tab", el, (str(o.label) || "RULE").toUpperCase() + (n != null && n !== "" ? " " + n : ""));
    tab.style.fontSize = f1(tabSize) + "px"; tab.style.padding = f1(tabSize * 0.18) + "px " + f1(tabSize * 0.42) + "px";
    tab.style.transform = "translate(" + f1(-bw + u(26)) + "px," + f1(-bw - tabH * 0.55) + "px)";
    var tx = div("txt", el);
    linesInto(tx, lay);
    tx.style.fontSize = f1(lay.size) + "px";
    var iconBox = null;
    if (stack) {
      var top = tabH * 0.5 + pad;
      if (icon) { iconBox = { x: (cw - bw * 2 - ic) / 2, y: top, w: ic, h: ic }; top += ic + pad * 0.8; }
      tx.style.left = f1(pad) + "px"; tx.style.width = f1(tAreaW) + "px"; tx.style.top = f1(top) + "px"; tx.style.textAlign = "center";
    } else {
      var inH = ch - bw * 2;
      if (icon) iconBox = { x: pad, y: (inH - ic) / 2, w: ic, h: ic };
      tx.style.left = f1(icon ? pad * 2 + ic : pad) + "px"; tx.style.width = f1(tAreaW) + "px"; tx.style.top = f1((inH - textH) / 2 + tabH * 0.15) + "px"; tx.style.textAlign = icon ? "left" : "center";
    }
    if (icon && iconBox) {
      var isv = iconSVG(icon, iconBox.w, iconBox.h, { forbidden: !!o.forbidden, pose: o.pose });
      isv.style.left = f1(iconBox.x) + "px"; isv.style.top = f1(iconBox.y) + "px";
      el.appendChild(isv);
    }
    var cx = o.x != null ? fx01(o.x, W, 0.5) : W / 2, cy = o.y != null ? fx01(o.y, H, 0.5) : P ? sa.y0 + sa.h * 0.42 : H / 2;
    cx = clamp(cx, sa.x0 + cw / 2, sa.x1 - cw / 2); cy = clamp(cy, sa.y0 + ch / 2 + tabH * 0.6, sa.y1 - ch / 2);
    var it = overlayItem(el, "card", "rule " + n, at == null ? s.cursor : at, o.until, { cx: cx, cy: cy, w: cw, h: ch, slamK: 0.28, slamR: -2 });
    it.iconRect = iconBox ? { x: cx - cw / 2 + bw + iconBox.x, y: cy - ch / 2 + bw + iconBox.y, w: iconBox.w, h: iconBox.h } : null;
    it.textRect = { x: cx - cw / 2 + bw + parseFloat(tx.style.left), y: cy - ch / 2 + bw + parseFloat(tx.style.top), w: tAreaW, h: textH };
    it.top = cy - ch / 2 - tabH * 0.55;
    return it;
  }

  // ------------------------- marks: arrows, rings, check / X, labels -------------------------
  // Resolves a target to a box at time t: { x, y, w, h, world }.
  function rectAt(target, t) {
    if (!target) return null;
    if (typeof target === "string") {
      var r = st.room, tk = target.toLowerCase();
      if (tk === "character" || tk === "you" || tk === "protagonist") target = protagonist();
      else if (tk === "pet") target = firstPet();
      else if (r && r.objs[tk]) target = r.objs[tk];
      else if (r) { var k = objectKey(tk); for (var nm in r.objs) if (r.objs[nm].name === k) { target = r.objs[nm]; break; } }
      if (typeof target === "string") return null;
    }
    if (!target) return null;
    if (target.screen && target.box) { var b = target.box(t); return { x: b.x, y: b.y, w: b.w, h: b.h, world: false }; }
    if (target.box && typeof target.box === "function") { var wb = target.box(t); return { x: wb.x, y: wb.y, w: wb.w, h: wb.h, world: true }; }
    if (isFinite(target.x) && isFinite(target.y)) return { x: +target.x, y: +target.y, w: +target.w || 0, h: +target.h || 0, world: target.screen ? false : true };
    return null;
  }
  function rectOf(target) { var r = rectAt(target, D); return r; }
  function fxItem(world, at, until, draw, kind, label) {
    var s = ensure(), g = svg("g", { class: "pg-fx" }, world ? s.L.fx : s.ovsvg);
    var it = { g: g, at: num(at, s.cursor), until: until == null ? 1e9 : num(until, 1e9), world: world };
    addAnim(function (t) { var on = t >= it.at && t < it.until; showEl(g, on); if (on) draw(t, g, it); });
    return it;
  }
  function arrowTo(target, at, o) {
    var s = ensure();
    o = obj(o);
    at = num(at, s.cursor);
    var r0 = rectAt(target, at + 0.3);
    if (!r0) return null;
    var world = r0.world, poly = null;
    var cls = o.color === "ink" ? "pf-i" : o.color === "yellow" ? "pf-y" : "pf-a";
    var autoAng = o.from == null ? chooseArrow(target, r0, at + 0.3, num(o.len, 0) || u(P ? 170 : 190)) : null;
    if (autoAng != null && o.ringIfBlocked && chooseArrow.lastPen >= 2) return ring(target, at, o);
    var it = fxItem(world, at, o.until, function (t, g) {
      var r = rectAt(target, t) || r0;
      if (!poly) poly = svg("path", { class: cls }, g);
      var cx = r.x + r.w / 2, cy = r.y + r.h / 2, from = o.from || "top";
      var ang = FROM_ANG[from] != null ? FROM_ANG[from] : 90;
      if (typeof o.from === "number") ang = o.from;
      if (autoAng != null) ang = autoAng;
      var a = rad(ang), dx = Math.cos(a), dy = Math.sin(a);
      var ext = Math.min(Math.abs(dx) > 1e-3 ? r.w / 2 / Math.abs(dx) : 1e9, Math.abs(dy) > 1e-3 ? r.h / 2 / Math.abs(dy) : 1e9);
      var pad = u(12), wk = num(o.w, 1), len = num(o.len, 0) || u(P ? 170 : 190);
      var p = clamp((t - at) / 0.18, 0, 1), k = 0.3 + 0.7 * V.ease.outCubic(p), poke = p >= 1 ? u(7) * Math.abs(Math.sin((t - at) * 6)) : 0;
      var tip = [cx - dx * (ext + pad + poke), cy - dy * (ext + pad + poke)], L = len * k;
      var sw = u(15) * wk, hw = u(40) * wk, hl = u(52) * wk, nx = -dy, ny = dx;
      var b0 = [tip[0] - dx * Math.min(hl, L), tip[1] - dy * Math.min(hl, L)], tail = [tip[0] - dx * L, tip[1] - dy * L];
      setA(poly, "d", PL(tip, [b0[0] + nx * hw, b0[1] + ny * hw], [b0[0] + nx * sw, b0[1] + ny * sw], [tail[0] + nx * sw, tail[1] + ny * sw], [tail[0] - nx * sw, tail[1] - ny * sw], [b0[0] - nx * sw, b0[1] - ny * sw], [b0[0] - nx * hw, b0[1] - ny * hw]));
    });
    return it;
  }
  var FROM_ANG = { left: 18, right: 162, bottom: -90, "top-left": 40, "top-right": 140, top: 90, "bottom-left": -40, "bottom-right": -140 };
  // Picks the arrow direction whose body crosses the fewest other things and stays in the safe area.
  function chooseArrow(target, r, t, len) {
    var c = camAt(t), sa = st.sa, others = [];
    st.items.forEach(function (it) {
      var b = it.box(t);
      if (!b || it.kind === "divider") return;
      var sb = it.world ? projBox(b, c) : b;
      others.push(sb);
    });
    var sr = r.world ? projBox(r, c) : r, tb = sr;
    var cands = P ? [140, 40, 90, 18, 162] : [140, 40, 18, 162, 90];
    var best = null;
    cands.forEach(function (ang, ci) {
      var a = rad(ang), dx = Math.cos(a), dy = Math.sin(a), cx = sr.x + sr.w / 2, cy = sr.y + sr.h / 2;
      var ext = Math.min(Math.abs(dx) > 1e-3 ? sr.w / 2 / Math.abs(dx) : 1e9, Math.abs(dy) > 1e-3 ? sr.h / 2 / Math.abs(dy) : 1e9);
      var tip = [cx - dx * (ext + u(12)), cy - dy * (ext + u(12))], L = len * c.z, pen = ci * 0.01, hw = u(30);
      for (var i = 0; i <= 10; i++) {
        var px = tip[0] - dx * L * (i / 10), py = tip[1] - dy * L * (i / 10);
        if (px < sa.x0 || px > sa.x1 || py < sa.y0 || py > sa.y1) pen += 3;
        others.forEach(function (b) {
          if (Math.abs(b.x - tb.x) < 1 && Math.abs(b.y - tb.y) < 1 && Math.abs(b.w - tb.w) < 1) return;
          if (px > b.x - hw && px < b.x + b.w + hw && py > b.y - hw && py < b.y + b.h + hw) pen += 1;
        });
      }
      if (!best || pen < best.pen) best = { pen: pen, ang: ang };
    });
    chooseArrow.lastPen = best ? best.pen : 0;
    return best ? best.ang : 140;
  }
  function autoFrom(r, world) {
    var cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    if (P) return cy > H * 0.45 ? (cx > W / 2 ? "top-left" : "top-right") : cx > W / 2 ? "left" : "right";
    return cx > W / 2 ? "top-left" : "top-right";
  }
  function ring(target, at, o) {
    var s = ensure();
    o = obj(o);
    at = num(at, s.cursor);
    var r0 = rectAt(target, at + 0.3);
    if (!r0) return null;
    var path = null;
    return fxItem(r0.world, at, o.until, function (t, g) {
      var r = rectAt(target, t) || r0, pad = num(o.pad, u(14)), lw = r.w >= r.h, sa = st.sa, ccx = r.x + r.w / 2, ccy = r.y + r.h / 2;
      var rx = (r.w / 2 + pad) * (lw ? 1.1 : 1.28), ry = (r.h / 2 + pad) * (lw ? 1.28 : 1.1), sw2 = u(6);
      rx = Math.max(r.w / 2 + sw2, Math.min(rx, ccx - sa.x0 - sw2, sa.x1 - ccx - sw2));
      ry = Math.max(r.h / 2 + sw2, Math.min(ry, ccy - sa.y0 - sw2, sa.y1 - ccy - sw2));
      if (!path) { path = svg("path", { class: "ps-a", pathLength: 100, "stroke-dasharray": "100 100" }, g); path.setAttribute("stroke-width", f1(u(11))); }
      setA(path, "d", E(r.x + r.w / 2, r.y + r.h / 2, rx, ry));
      var p = clamp((t - at) / 0.3, 0, 1);
      setA(path, "stroke-dashoffset", f1(100 * (1 - V.ease.outCubic(p))));
    });
  }
  function mark(type, target, at, o) {
    var s = ensure();
    o = obj(o);
    at = num(at, s.cursor);
    var x = type === "x" || type === "cross" || type === "no", r0 = target ? rectAt(target, at + 0.2) : null, world = r0 ? r0.world : false;
    var size = num(o.size, u(110)), pth = null;
    return fxItem(world, at, o.until, function (t, g) {
      var r = target ? rectAt(target, t) || r0 : null;
      var cx = o.x != null ? num(o.x, 0.5) * W : r ? r.x + r.w + size * 0.15 : W / 2, cy = o.y != null ? num(o.y, 0.5) * H : r ? r.y + size * 0.35 : H / 2;
      if (o.x == null && r && o.place === "center") { cx = r.x + r.w / 2; cy = r.y + r.h / 2; }
      if (!pth) { pth = svg("path", { class: x ? "ps-a" : "ps-i" }, g); }
      var p = clamp((t - at) / 0.14, 0, 1), k = (1 + 0.6 * (1 - V.ease.outCubic(p))) * size, sw = size * 0.2;
      setA(pth, "stroke-width", f1(sw));
      setA(pth, "d", x ? "M" + f1(cx - k * 0.36) + " " + f1(cy - k * 0.36) + "L" + f1(cx + k * 0.36) + " " + f1(cy + k * 0.36) + "M" + f1(cx + k * 0.36) + " " + f1(cy - k * 0.36) + "L" + f1(cx - k * 0.36) + " " + f1(cy + k * 0.36)
        : "M" + f1(cx - k * 0.42) + " " + f1(cy + k * 0.02) + "L" + f1(cx - k * 0.12) + " " + f1(cy + k * 0.32) + "L" + f1(cx + k * 0.44) + " " + f1(cy - k * 0.34));
    });
  }
  function label(text, target, at, o) {
    var s = ensure();
    o = obj(o);
    at = num(at, s.cursor);
    var sa = s.sa, size = u(num(o.size, 0) || (P ? 46 : 42)), padX0 = size * 0.32;
    var lay = fitText(text, size, (o.maxWidth != null ? num(o.maxWidth, 400) : sa.w * 0.5) - padX0 * 2 - u(4), Math.max(1, num(o.lines, 1) | 0));
    var el = div("pg-label", s.ov);
    linesInto(el, lay);
    var padX = lay.size * 0.32, padY = lay.size * 0.2;
    el.style.fontSize = f1(lay.size) + "px"; el.style.padding = f1(padY) + "px " + f1(padX) + "px"; el.style.lineHeight = "1.05"; el.style.textAlign = "center";
    var w = lay.w + padX * 2 + u(4), h = lay.n * lay.size * 1.05 + padY * 2;
    el.style.width = f1(w) + "px"; el.style.boxSizing = "border-box";
    var r0 = target ? rectAt(target, at + 0.2) : null;
    var it = overlayItem(el, "label", str(text).replace(/\*/g, ""), at, o.until, { w: w, h: h, slamK: 0.3, slamR: 0 });
    var line = svg("path", { class: "ps-i", "stroke-width": f1(u(5)) }, s.ovsvg);
    function place(t) {
      var r = target ? rectAt(target, t) || r0 : null, c = camAt(t), sr = r ? (r.world ? projBox(r, c) : r) : null;
      var from = o.from || (sr ? (sr.x + sr.w / 2 > W / 2 ? "left" : "right") : "top"), gap = u(70), cx, cy;
      if (o.x != null) { cx = num(o.x, 0.5) * W; cy = num(o.y, 0.5) * H; }
      else if (o.px != null) { cx = o.px; cy = o.py; }
      else if (!sr) { cx = W / 2; cy = H / 2; }
      else if (from === "left") { cx = sr.x - gap - w / 2; cy = sr.y + sr.h * 0.3; }
      else if (from === "right") { cx = sr.x + sr.w + gap + w / 2; cy = sr.y + sr.h * 0.3; }
      else if (from === "bottom") { cx = sr.x + sr.w / 2; cy = sr.y + sr.h + gap + h / 2; }
      else { cx = sr.x + sr.w / 2; cy = sr.y - gap - h / 2; }
      it.cx = clamp(cx, sa.x0 + w / 2, sa.x1 - w / 2); it.cy = clamp(cy, sa.y0 + h / 2, sa.y1 - h / 2);
      if (sr) {
        var tx = clamp(it.cx, sr.x, sr.x + sr.w), ty = clamp(it.cy, sr.y, sr.y + sr.h);
        var lx = it.cx < sr.x ? it.cx + w / 2 : it.cx > sr.x + sr.w ? it.cx - w / 2 : it.cx, ly = it.cy < sr.y ? it.cy + h / 2 : it.cy > sr.y + sr.h ? it.cy - h / 2 : it.cy;
        setA(line, "d", "M" + f1(lx) + " " + f1(ly) + "L" + f1(tx) + " " + f1(ty));
      }
    }
    place(at + 0.3);
    it.pre = place;
    if (o.noLine) line.style.display = "none";
    addAnim(function (t) { showEl(line, !o.noLine && it.visible(t) && !!target && t > it.at + 0.08); });
    return it;
  }

  // ------------------------- flashlight cone -------------------------
  function cone(fig, o) {
    var s = ensure();
    o = obj(o);
    var at = num(o.at, s.cursor), until = o.until == null ? 1e9 : num(o.until, 1e9);
    var id = uid("mask"), mk = svg("mask", { id: id, maskUnits: "userSpaceOnUse", maskContentUnits: "userSpaceOnUse", x: -W, y: -H, width: W * 3, height: H * 3 }, s.defs);
    var amb = clamp(num(o.ambient, 0.08), 0, 1), gv = Math.round(amb * 255);
    svg("rect", { x: -W, y: -H, width: W * 3, height: H * 3, fill: "rgb(" + gv + "," + gv + "," + gv + ")" }, mk);
    var mpoly = svg("path", { fill: "#FFFFFF" }, mk), mhalo = svg("circle", { fill: "#FFFFFF", r: 0 }, mk);
    var beam = svg("path", { class: "pg-beamfill" }, s.L.beam);
    var c = { at: at, until: until, ang: new Tr(num(o.angle, 0)), spread: num(o.spread, 34), fig: fig, flick: !!o.flicker, followArm: !!o.followArm && fig && fig.skel };
    c.aim = function (deg, t, dur) { c.ang.to(num(deg, 0), num(t, s.cursor), num(dur, 0.5), "inOutCubic"); return c; };
    c.sweep = function (a0, a1, t, dur) { c.ang.set(num(a0, 0), num(t, s.cursor)); c.ang.to(num(a1, 0), num(t, s.cursor), num(dur, 1.5), "inOutSine"); return c; };
    c.box = function () { return null; };
    s.cones.push(c);
    addAnim(function (t) {
      var on = t >= c.at && t < c.until;
      if (on && c.flick && hash(Math.floor(t * 14) * 1.7) < 0.12) on = false;
      if (!on) { if (!conesOn(t)) setA(s.masked, "mask", "none"); showEl(beam, false); return; }
      var hp = fig && fig.hand ? fig.hand(t) : [W / 2, s.floor - s.FH * 0.6];
      var a = rad(c.ang.val(t)), sp = rad(c.spread / 2), L = Math.max(W, H) * 2.2;
      if (c.followArm) { var kk = fig.skel(t); a = Math.atan2(kk.A1[2][1] - kk.A1[1][1], kk.A1[2][0] - kk.A1[1][0]); }
      var p1 = [hp[0] + Math.cos(a - sp) * L, hp[1] + Math.sin(a - sp) * L], p2 = [hp[0] + Math.cos(a + sp) * L, hp[1] + Math.sin(a + sp) * L];
      var d = PL(hp, p1, p2);
      setA(mpoly, "d", d);
      setA(mhalo, "cx", f1(hp[0])); setA(mhalo, "cy", f1(hp[1])); setA(mhalo, "r", f1(s.FH * 0.02));
      setA(s.masked, "mask", "url(#" + id + ")");
      showEl(beam, true);
      setA(beam, "d", d);
    });
    return c;
  }

  // ------------------------- stinger: hard cut to the visitor -------------------------
  function stinger(at, o) {
    var s = ensure();
    o = obj(o);
    at = num(at, s.cursor);
    var hold = num(o.hold, 0), until = o.until != null ? num(o.until, 1e9) : hold > 0 ? at + hold : 1e9;
    var el = div("pg-sting", s.top), sv = svgIn(el, W, H), m = Math.min(W, H), sa = s.sa;
    var g = svg("g", {}, sv), full = o.pos === "full";
    var cy = P ? sa.y0 + sa.h * 0.36 : H * 0.42, eyes = [], smile = null;
    if (!full) {
      svg("path", { d: E(W / 2, cy + m * 0.08, m * 0.46, m * 0.6), fill: "#121212" }, g);
      [-1, 1].forEach(function (sd) { eyes.push(svg("ellipse", { cx: W / 2 + sd * m * 0.17, cy: cy, rx: m * 0.075, ry: m * 0.1, fill: "#FFFFFF" }, g)); });
      smile = svg("path", { fill: "none", stroke: "#FFFFFF", "stroke-linecap": "round", "stroke-width": f1(m * 0.035) }, g);
    } else {
      var fg = svg("g", { style: "--ink:#1C1C1C;--paper:#000" }, g);
      makeFigure("visitor", { static: true, parent: fg, x: W / 2, y: sa.y1 + (P ? 0 : m * 0.02), h: sa.h * 0.98, pose: "reach", facing: "front", t: 6 });
    }
    flashFrame(at, 0.07, "red");
    shakeFx(at, 0.55, u(24));
    var it = { kind: "stinger", at: at, until: until, el: el };
    addAnim(function (t) {
      var on = t >= at && t < until;
      showEl(el, on);
      if (!on) return;
      var p = clamp((t - at) / Math.max(1.5, (until < 1e8 ? until : D) - at), 0, 1), k = 1 + 0.07 * p;
      setA(g, "transform", "translate(" + f1(W / 2) + " " + f1(cy) + ") scale(" + k.toFixed(4) + ") translate(" + f1(-W / 2) + " " + f1(-cy) + ")");
      if (smile) {
        var sw = m * (0.24 + 0.12 * V.ease.outCubic(clamp((t - at) / 1.5, 0, 1)));
        setA(smile, "d", "M" + f1(W / 2 - sw) + " " + f1(cy + m * 0.2) + "Q" + f1(W / 2) + " " + f1(cy + m * 0.48) + " " + f1(W / 2 + sw) + " " + f1(cy + m * 0.2));
        var bl = (t - at) > 1.2 && ((t - at) % 2.4) > 2.28 ? 0.1 : 1;
        eyes.forEach(function (e) { setA(e, "ry", f1(m * 0.1 * bl)); });
      }
    });
    s.stingers.push(it);
    if (str(o.stamp)) it.stamp = stamp(o.stamp, at + 0.25, { key: o.key, color: "red", size: P ? "xl" : "lg", y: P ? 0.2 : 0.17, maxHeight: P ? u(300) : u(210), until: until < 1e8 ? until : null });
    return it;
  }

  // ------------------------- phone screen -------------------------
  function handsetPath(cx, cy, r) {
    return "M" + f1(cx - r) + " " + f1(cy + r * 0.1) + "Q" + f1(cx) + " " + f1(cy - r * 0.55) + " " + f1(cx + r) + " " + f1(cy + r * 0.1) + "L" + f1(cx + r * 0.75) + " " + f1(cy + r * 0.45) + "L" + f1(cx + r * 0.35) + " " + f1(cy + r * 0.2) +
      "L" + f1(cx + r * 0.3) + " " + f1(cy) + "Q" + f1(cx) + " " + f1(cy - r * 0.12) + " " + f1(cx - r * 0.3) + " " + f1(cy) + "L" + f1(cx - r * 0.35) + " " + f1(cy + r * 0.2) + "L" + f1(cx - r * 0.75) + " " + f1(cy + r * 0.45) + "Z";
  }
  // Head-and-shoulders avatar for a phone call (white on the black avatar disc).
  function bustSVG(key, sz) {
    var sv = svg("svg", { width: f1(sz), height: f1(sz), viewBox: "0 0 100 100" }), cd = CAST[key], vis = key === "visitor";
    var hc = [50, vis ? 40 : 42], hr = vis ? 17 : 19;
    svg("path", { d: "M12 104 Q12 66 50 66 Q88 66 88 104 Z", class: "pf-i" }, sv);
    svg("path", { d: vis ? E(hc[0], hc[1], hr, hr * 1.3) : C(hc[0], hc[1], hr), class: "pf-i" }, sv);
    if (cd.bun) svg("path", { d: C(50, hc[1] - hr - 4, 8), class: "pf-i" }, sv);
    if (cd.cap) svg("path", { d: "M" + (50 - hr - 1) + " " + (hc[1] - 3) + "A" + (hr + 1) + " " + (hr + 1) + " 0 0 1 " + (50 + hr + 1) + " " + (hc[1] - 3) + "Z" + R(50 - hr - 8, hc[1] - 6, hr * 2 + 16, 6, 2), class: "pf-p" }, sv);
    if (cd.hat) svg("path", { d: R(50 - hr - 12, hc[1] - hr * 0.7, hr * 2 + 24, 6, 2) + R(50 - hr * 0.9, hc[1] - hr * 1.6, hr * 1.8, hr, 3), class: "pf-i" }, sv);
    if (vis) {
      svg("path", { d: E(hc[0], hc[1], hr, hr * 1.3), fill: "#262626" }, sv);
      svg("path", { d: E(43, hc[1] - 3, 3.4, 4.4) + E(57, hc[1] - 3, 3.4, 4.4), fill: "#FFFFFF" }, sv);
      svg("path", { d: "M37 " + (hc[1] + 9) + " Q50 " + (hc[1] + 19) + " 63 " + (hc[1] + 9), fill: "none", stroke: "#FFFFFF", "stroke-width": 2.6, "stroke-linecap": "round" }, sv);
    }
    return sv;
  }
  function phoneUI(o) {
    var s = ensure();
    o = obj(o);
    var sa = s.sa, kind = o.kind === "message" ? "message" : "call";
    var h = num(o.h, 0) || (P ? sa.h * 0.6 : sa.h * 0.86), w = h * 0.5;
    var cx = o.x != null ? fx01(o.x, W, 0.5) : W / 2, cy = o.y != null ? fx01(o.y, H, 0.5) : sa.cy;
    var el = div("pg-phone", s.ov);
    el.style.width = f1(w) + "px"; el.style.height = f1(h) + "px"; el.style.borderRadius = f1(w * 0.14) + "px";
    var scr = div("scr", el), sx = w * 0.055, sy = h * 0.045, swd = w - sx * 2, sht = h - sy * 2;
    scr.style.left = f1(sx) + "px"; scr.style.top = f1(sy) + "px"; scr.style.width = f1(swd) + "px"; scr.style.height = f1(sht) + "px"; scr.style.borderRadius = f1(w * 0.09) + "px";
    var sb = div("sb", scr), fs = swd * 0.07;
    sb.style.fontSize = f1(fs) + "px"; sb.style.padding = f1(fs * 0.7) + "px " + f1(fs * 1.1) + "px";
    div("", sb, str(o.time) || "2:04 AM");
    var bat = div("", sb); bat.style.width = f1(fs * 1.7) + "px"; bat.style.height = f1(fs * 0.8) + "px"; bat.style.border = f1(fs * 0.12) + "px solid #0A0A0A"; bat.style.marginTop = f1(fs * 0.15) + "px";
    var batIn = div("", bat); batIn.style.width = "22%"; batIn.style.height = "100%"; batIn.style.background = "var(--accent)";
    var from = (str(o.from) || "UNKNOWN").toUpperCase(), at = num(o.at, s.cursor), ringAt = num(o.ringAt, at + 0.3), ringDur = num(o.ringDur, 1e9);
    var extra = { cx: cx, cy: cy, w: w, h: h, slamK: 0.18, slamR: 0 };
    var rings = [], av = null;
    if (kind === "call") {
      var lb = div("lbl", scr, (str(o.label) || "INCOMING CALL").toUpperCase());
      lb.style.top = f1(sht * 0.13) + "px"; lb.style.fontSize = f1(swd * 0.075) + "px";
      var ad = swd * 0.44, ay = sht * 0.22;
      var rs = svgIn(scr, swd, sht);
      rs.style.position = "absolute"; rs.style.left = "0"; rs.style.top = "0";
      for (var i = 0; i < 2; i++) rings.push(svg("circle", { cx: f1(swd / 2), cy: f1(ay + ad / 2), r: f1(ad / 2), class: "ps-a", "stroke-width": f1(swd * 0.02) }, rs));
      av = div("", scr);
      av.style.cssText = "position:absolute;border-radius:50%;background:#0A0A0A;overflow:hidden;--ink:#FFFFFF;--paper:#0A0A0A;--void:#0A0A0A;left:" + f1((swd - ad) / 2) + "px;top:" + f1(ay) + "px;width:" + f1(ad) + "px;height:" + f1(ad) + "px";
      var avk = castKey(o.avatar || "you"), ai;
      if (avk && CAST[avk].kind === "person") { ai = bustSVG(avk, ad); ai.style.left = "0px"; ai.style.top = "0px"; }
      else { ai = iconSVG(str(o.avatar) || "you", ad * 0.7, ad * 0.7, { facing: "front" }); ai.style.left = f1(ad * 0.15) + "px"; ai.style.top = f1(ad * 0.15) + "px"; }
      ai.style.position = "absolute";
      av.appendChild(ai);
      var nl = fitText(from, swd * 0.17, swd * 0.86, 1), nm = div("nm", scr, from);
      nm.style.top = f1(sht * 0.6) + "px"; nm.style.fontSize = f1(nl.size) + "px";
      var bd = swd * 0.22, by = sht * 0.8;
      extra.acceptRect = { x: cx - w / 2 + sx + swd * 0.73 - bd / 2, y: cy - h / 2 + sy + by, w: bd, h: bd };
      [["var(--accent)", swd * 0.27, 1], ["#0A0A0A", swd * 0.73, 0]].forEach(function (b) {
        var bt = div("btn", scr); bt.style.cssText += ";left:" + f1(b[1] - bd / 2) + "px;top:" + f1(by) + "px;width:" + f1(bd) + "px;height:" + f1(bd) + "px;background:" + b[0];
        var hs = svgIn(bt, bd, bd); svg("path", { d: handsetPath(bd / 2, bd / 2, bd * 0.3), fill: "#FFFFFF", transform: b[2] ? "rotate(180 " + f1(bd / 2) + " " + f1(bd / 2) + ")" : "" }, hs);
      });
      extra.vib = function (t) {
        if (t < ringAt || t > ringAt + ringDur) return [0, 0, 0];
        var q = (t - ringAt) % 0.9;
        return q < 0.55 ? [u(5) * Math.sin(t * 90), 0, 1.6 * Math.sin(t * 70)] : [0, 0, 0];
      };
      extra.upd = function (t) {
        var ringing = t >= ringAt && t <= ringAt + ringDur;
        rings.forEach(function (rc, i) {
          var ph = ((t - ringAt) / 1.1 + i * 0.5) % 1;
          showEl(rc, ringing);
          if (ringing) { setA(rc, "r", f1((ad / 2) * (1 + ph * 0.5))); setA(rc, "opacity", f2(1 - ph)); }
        });
      };
    } else {
      var hd = div("", scr);
      hd.style.cssText = "position:absolute;left:0;right:0;text-align:center;border-bottom:" + f1(swd * 0.012) + "px solid #0A0A0A;color:#0A0A0A;top:" + f1(sht * 0.07) + "px;padding-bottom:" + f1(sht * 0.015) + "px;font-size:" + f1(swd * 0.085) + "px";
      hd.textContent = from;
      var y = sht * 0.17, msgs = arr(o.messages).slice(0, 6), bubbles = [];
      var mfs = swd * 0.072;
      msgs.forEach(function (mg) {
        mg = obj(mg);
        var lay = fitText(str(mg.text) || "...", mfs, swd * 0.62, 3), bw = lay.w + mfs * 1.2, bh = lay.n * lay.size * 1.1 + mfs * 0.7;
        if (y + bh > sht * 0.97) return;
        var b = div("msg " + (mg.me ? "me" : "them"), scr);
        linesInto(b, lay);
        b.style.cssText += ";font-size:" + f1(lay.size) + "px;padding:" + f1(mfs * 0.35) + "px " + f1(mfs * 0.6) + "px;width:" + f1(bw + u(8)) + "px;top:" + f1(y) + "px;border-radius:" + f1(mfs * 0.5) + "px;" + (mg.me ? "right:" + f1(swd * 0.06) + "px" : "left:" + f1(swd * 0.06) + "px");
        bubbles.push({ el: b, at: num(mg.at, at + 0.5 + bubbles.length * 0.8) });
        y += bh + mfs * 0.55;
      });
      extra.upd = function (t) {
        bubbles.forEach(function (b) {
          var on = t >= b.at;
          showEl(b.el, on);
          if (on) { var p = clamp((t - b.at) / 0.16, 0, 1); setS(b.el, "transform", "scale(" + (0.6 + 0.4 * V.ease.outBack(p)).toFixed(3) + ")"); }
        });
      };
      extra.vib = function (t) { var v = [0, 0, 0]; bubbles.forEach(function (b) { if (t >= b.at && t < b.at + 0.3) v = [u(4) * Math.sin(t * 90), 0, 0]; }); return v; };
    }
    var it = overlayItem(el, "phone", from, at, o.until, extra);
    it.ringAt = ringAt;
    if (extra.acceptRect) it.acceptRect = extra.acceptRect;
    return it;
  }

  // ------------------------- checklist -------------------------
  function checklist(items, o) {
    var s = ensure();
    o = obj(o);
    var sa = s.sa, list = arr(items).filter(Boolean).slice(0, 8).map(obj), n = Math.max(1, list.length);
    var width = Math.min(sa.w, o.width != null ? fx01(o.width, W, 0.6) : P ? sa.w : sa.w * 0.6);
    var title = str(o.title), tabSize = u(P ? 60 : 52), tabH = title ? tabSize * 1.36 + u(18) : 0;
    var availH = (o.h != null ? num(o.h, 0.8) * H : P ? sa.h * 0.66 : sa.h * 0.94) - tabH, gap = u(P ? 18 : 14);
    var rh = clamp((availH - gap * (n - 1)) / n, u(70), u(P ? 160 : 132)), bw = u(6);
    var tW = width - rh - rh * 0.95 - rh * 0.95 - bw * 2 - u(20);
    var size = rh * 0.44;
    list.forEach(function (it) { var l = fitText(str(it.text) || "...", size, tW, 1); size = Math.min(size, l.size); });
    var totalH = tabH + n * rh + (n - 1) * gap;
    var x0 = o.x != null ? fx01(o.x, W, 0.5) - width / 2 : W / 2 - width / 2, y0 = o.y != null ? fx01(o.y, H, 0.5) - totalH / 2 : sa.cy - totalH / 2;
    x0 = clamp(x0, sa.x0, sa.x1 - width); y0 = clamp(y0, sa.y0, sa.y1 - totalH);
    var res = { rows: [], title: null, x: x0, y: y0, w: width, h: totalH };
    var t0 = num(o.at, s.cursor);
    if (title) {
      var te = div("pg-tabhead", s.ov, title.toUpperCase());
      var tsz = Math.min(tabSize, (width - u(10)) / (textW(title.toUpperCase(), 100) / 100 * 1.07 + 0.9));
      te.style.fontSize = f1(tsz) + "px"; te.style.padding = f1(tsz * 0.18) + "px " + f1(tsz * 0.45) + "px";
      var tw = textW(title.toUpperCase(), tsz) * 1.07 + tsz * 0.9;
      res.title = overlayItem(te, "title", title, t0, o.until, { cx: x0 + tw / 2, cy: y0 + (tabSize * 1.36) / 2, w: tw, h: tabSize * 1.36, slamK: 0.3, slamR: 0 });
    }
    list.forEach(function (st_, i) {
      var row = div("pg-row" + (st_.done === false ? " bad" : ""), s.ov);
      row.style.width = f1(width) + "px"; row.style.height = f1(rh) + "px"; row.style.borderWidth = f1(bw) + "px";
      var no = div("no", row, String(i + 1)); no.style.width = f1(rh - bw * 2) + "px"; no.style.fontSize = f1(rh * 0.5) + "px";
      var icn = iconSVG(str(st_.icon) || pickObject(st_.text), rh * 0.8, rh * 0.8, {});
      icn.style.marginLeft = f1(rh * 0.12) + "px";
      row.appendChild(icn);
      var tx = div("tx", row); richText(tx, str(st_.text) || "...", null);
      tx.style.fontSize = f1(size) + "px"; tx.style.marginLeft = f1(rh * 0.14) + "px"; tx.style.flex = "1";
      var mk = svgIn(row, rh * 0.8, rh * 0.8), bad = st_.done === false;
      mk.style.marginRight = f1(rh * 0.1) + "px";
      var mp = svg("path", { class: bad ? "ps-a" : "ps-i", "stroke-width": f1(rh * 0.13), d: bad ? "M" + f1(rh * 0.16) + " " + f1(rh * 0.16) + "L" + f1(rh * 0.64) + " " + f1(rh * 0.64) + "M" + f1(rh * 0.64) + " " + f1(rh * 0.16) + "L" + f1(rh * 0.16) + " " + f1(rh * 0.64)
        : "M" + f1(rh * 0.1) + " " + f1(rh * 0.42) + "L" + f1(rh * 0.32) + " " + f1(rh * 0.64) + "L" + f1(rh * 0.72) + " " + f1(rh * 0.14) }, mk);
      var at = num(st_.at, t0 + 0.4 + i * 0.8), ck = num(st_.checkAt, at + 0.55);
      var ry = y0 + tabH + i * (rh + gap);
      var item = overlayItem(row, "row", str(st_.text).replace(/\*/g, ""), at, o.until, { cx: x0 + width / 2, cy: ry + rh / 2, w: width, h: rh, slamK: 0.12, slamR: 0, wipe: 0.16 });
      item.upd = function (t) {
        var on = t >= ck;
        showEl(mk, on);
        if (on) { var p = clamp((t - ck) / 0.14, 0, 1); setS(mk, "transform", "scale(" + (1 + 0.7 * (1 - V.ease.outCubic(p))).toFixed(3) + ")"); }
      };
      item.checkAt = ck; item.bad = bad;
      item.iconRect = { x: x0 + bw + rh - bw * 2 + rh * 0.12, y: ry + rh * 0.1, w: rh * 0.8, h: rh * 0.8 };
      res.rows.push(item);
    });
    res.box = function () { return { x: x0, y: y0, w: width, h: totalH }; };
    return res;
  }

  // ------------------------- template helpers -------------------------
  function T(p) { return p && typeof p === "object" ? p : {}; }
  function oneOf(v, list, d) { v = str(v).toLowerCase(); return list.indexOf(v) >= 0 ? v : d; }
  // Top of the room's tall furniture (stamps above it do not cover the room).
  function roomTop() {
    var top = st.floor - st.FH * 0.3;
    st.objs.forEach(function (o) { if (o.role && ["moon", "bulb", "cloud"].indexOf(o.name) < 0 && o.layer !== "fx") { var b = o.box(0); top = Math.min(top, b.y); } });
    st.figs.forEach(function (f) { var b = f.box(0); top = Math.min(top, b.y); });
    return top;
  }
  function bandStamp(text, at, o, extra) {
    o = obj(o);
    var sa = st.sa, gap = u(26), bottom = Math.max(sa.y0 + u(150), (extra && extra.bottom) || roomTop() - gap), top = (extra && extra.top) || sa.y0;
    var mw = extra && extra.maxWidth;
    var it = stamp(text, at, Object.assign({ maxHeight: bottom - top, maxWidth: mw ? mw / W : null, size: o.size || (P ? "lg" : "lg") }, o, { y: ((top + bottom) / 2) / H }));
    return it;
  }
  function placeCast(room, chars, o) {
    o = obj(o);
    var figs = [], used = {}, FH = st.FH, objs = room.objs, nSlots = room.slots.length;
    chars.slice(0, 3).forEach(function (c, i) {
      c = typeof c === "string" ? { id: c } : obj(c);
      var id = castKey(c.id) || (i ? "dog" : "you"), cd = CAST[id];
      var slot = c.slot != null && isFinite(+c.slot) ? clamp(Math.round(+c.slot), 0, nSlots - 1) : i % nSlots;
      if (used[slot]) for (var j = 0; j < nSlots; j++) if (!used[j]) { slot = j; break; }
      used[slot] = 1;
      var x = room.slots[slot] * W, y = st.floor, pose = str(c.pose) || "stand", facing = c.facing, layer = null;
      var bed = objs.bed, seat = objs.couch || objs.chair || objs.bench, f;
      if (id === "visitor" && objs.door && o.visitorDoor !== false) { f = visitorInDoor(objs.door, 0); objs.door.openTr.set(1, 0); f.pose(pose, 0, 0); figs.push(f); return; }
      if (cd.kind === "person") {
        var pk = poseKey(pose);
        if (bed && (pk === "sit-bed" || pk === "sleep" || pk === "lie")) {
          var bb = bed.box(0);
          if (pk === "sit-bed") { x = bb.x + bb.w * 0.74; facing = facing || "right"; }
          else { x = bb.x + bb.w * 0.18 + FH * cd.scale * 0.5; y = bb.y + bb.h * 0.53; facing = "right"; }
        } else if (seat && (pk === "sit" || pk === "sit-bed")) { var sb = seat.box(0); x = sb.x + sb.w * 0.4; facing = facing || "right"; }
      } else if (id === "owl" || id === "crow") {
        var perch = objs.window || objs.shelf || objs.fence || objs.sign;
        if (perch) { var pb = perch.box(0); x = pb.x + pb.w * 0.74; y = pb.y + (perch.name === "window" ? pb.h * 0.86 : perch.name === "shelf" ? pb.h * 0.72 : 0); }
      }
      if (!facing) facing = i === 0 ? (x > W / 2 ? "left" : "right") : figs[0] ? (x > figs[0].tr.base.x ? "left" : "right") : "left";
      f = makeFigure(id, { x: x, y: y, pose: pose, facing: facing, layer: layer, at: 0, eyes: st.mode === "dark" && cd.kind === "pet" });
      f.slot = slot;
      figs.push(f);
    });
    return figs;
  }
  function faceToward(f, target, at) {
    if (!f || !target || (f.seated && f.seated(at))) return;
    var r = rectAt(target, at);
    if (!r || !r.world) return;
    var fx = f.tr.val(at).x, tx = r.x + r.w / 2;
    if (Math.abs(tx - fx) < st.FH * 0.1) return;
    f.face(tx > fx ? "right" : "left", at);
  }
  function resolveTarget(name, focus, figs) {
    name = str(name).toLowerCase();
    if (!name) return focus || null;
    if (name === "action") return focus || null;
    if (name === "character") return figs.filter(function (f) { return f.kind === "figure"; })[0] || figs[0] || null;
    if (name === "pet") return figs.filter(function (f) { return f.kind === "pet"; })[0] || null;
    var r = st.room;
    if (r && r.objs[name]) return r.objs[name];
    var k = objectKey(name);
    if (r && k) for (var nm in r.objs) if (r.objs[nm].name === k) return r.objs[nm];
    var ck = castKey(name);
    if (ck) { var cf = figs.filter(function (f) { return f.id === ck; })[0]; if (cf) return cf; }
    if (k) { var nb = makeObject(k, { x: roomX(P ? 0.5 : 0.62), y: st.floor, size: st.FH * 0.4, at: 0 }); nb.role = k; r.objs[k] = nb; return nb; }
    return focus || null;
  }
  function when(keyword, label, after, fb) {
    var t = keyword ? kwFind(keyword, after) : null;
    if (t == null && label) t = labelTime(label, null, after);
    if (t == null) t = fb;
    return t;
  }

  var TPL = {};

  TPL["rule-scene"] = function (root, p) {
    var mode = oneOf(p.mode, ["light", "dark"], "light");
    pictogram(root, { mode: mode });
    var room = setting(p.setting || "bedroom", { time: p.time });
    var chars = arr(p.characters).length ? arr(p.characters) : [{ id: "you" }];
    var figs = placeCast(room, chars);
    var you = figs.filter(function (f) { return f.kind === "figure" && f.id !== "visitor"; })[0] || null;
    var actionName = oneOf(p.action, ACTIONS, "none"), endName = oneOf(p.endAction, ACTIONS, "none");
    var stampTxt = str(p.stamp) || "DON'T *MOVE*";
    var tStamp0 = labelTime(stampTxt, p.keyword, 0), tAct0 = actionName !== "none" ? when(p.actionKeyword, null, 0, null) : null;
    if (tStamp0 == null) tStamp0 = D * 0.55;
    if (tAct0 == null && actionName !== "none") tAct0 = Math.min(D * 0.3, tStamp0 - 0.8);
    var tCap0 = p.caption ? labelTime(p.caption, p.captionKeyword, Math.max(0, tStamp0 - 0.2)) : null;
    var beats = [];
    if (actionName !== "none") beats.push(["act", tAct0]);
    beats.push(["stamp", tStamp0 - 0.1]);
    if (p.caption) beats.push(["cap", tCap0 != null ? tCap0 : tStamp0 + 1.3]);
    beats.sort(function (a, b) { return a[1] - b[1]; });
    var ts = orderBeats(beats.map(function (b) { return b[1]; }), 0.45), tm = {};
    beats.forEach(function (b, i) { tm[b[0]] = ts[i]; });
    var tStamp = tm.stamp;
    // corner clock
    var clk = null, sa = st.sa;
    if (str(p.time)) clk = clockStamp(str(p.time), 0.2, { pos: "top-left" });
    var focus = null;
    if (actionName !== "none") {
      focus = action(actionName, Math.max(0.35, tm.act));
      if (you && focus && actionName !== "run" && actionName !== "hide") faceToward(you, focus, tm.act);
    } else if (you) you.pose(p.pose || "point-up", tStamp);
    // stamp in the band above the room (beside the corner clock)
    var topY = clk && P ? clk.cy + clk.h / 2 + u(18) : sa.y0, mw = clk && !P ? sa.w - (clk.w + u(30)) * 2 : null;
    if (p.triangle) mw = (mw || sa.w) - u(250);
    var stIt = bandStamp(stampTxt, tStamp, { color: oneOf(p.stampColor, ["mixed", "red", "ink", "yellow"], "mixed"), pos: p.stampPos }, { top: topY, maxWidth: mw });
    if (p.stampPos && ["top", "upper", "center", "lower", "bottom"].indexOf(p.stampPos) >= 0 && p.stampPos !== "upper" && p.stampPos !== "top") {
      var hh = stIt.h;
      stIt.cy = clamp(placeY(p.stampPos, hh, sa), sa.y0 + hh / 2, sa.y1 - hh / 2);
    }
    if (p.triangle) triangle(tStamp + 0.08, { x: (stIt.cx - stIt.w / 2 - u(90)) / W, y: stIt.cy / H, size: u(110), blink: true });
    // arrow or ring on what matters
    var target = resolveTarget(p.arrowTo, focus, figs);
    var tMark = Math.min(tStamp + 0.35, lastBeat());
    if (target) {
      if (p.ring || !p.arrowTo) ring(target, tMark);
      else arrowTo(target, tMark, { ringIfBlocked: true });
    }
    if (p.caption) caption(p.caption, tm.cap, { key: p.captionKeyword });
    if (endName !== "none") action(endName, clamp(Math.max(tStamp + 1.1, D - 2.0), 0.4, lastBeat()));
    // keep it alive: the protagonist reacts a beat after the stamp
    if (you && actionName === "none") you.tremble(tStamp + 0.2, 0.8, 0.6);
  };

  // Natural size of a lone prop: [size x figure height, height above floor, stands on a nightstand]
  var NAT = { door: [1.18], wardrobe: [1.0], window: [0.62, 0.5], bed: [0.62], couch: [0.46], chair: [0.5], table: [0.36], fridge: [0.95], tv: [0.4, 0, 1], lamp: [0.84],
    "table-lamp": [0.3, 0, 1], nightstand: [0.3], phone: [0.17, 0, 1], clock: [0.26, 0.8], "clock-digital": [0.17, 0, 1], house: [0.95], car: [0.6], bus: [0.62], poster: [0.42, 0.45],
    laptop: [0.2, 0, 1], stairs: [0.8], tree: [1.0], pine: [1.1], moon: [0.24, 1.0], key: [0.12, 0, 1], bag: [0.3], cup: [0.13, 0, 1], bath: [0.42], mirror: [0.42, 0.55], sink: [0.5],
    mailbox: [0.6], lamppost: [1.2], sign: [0.6], "stop-sign": [0.7], eye: [0.24, 0.55], hand: [0.3, 0.45], footprints: [0.1], pill: [0.12, 0, 1], flashlight: [0.14, 0, 1], candle: [0.2, 0, 1],
    radio: [0.2, 0, 1], camera: [0.17, 0, 1], envelope: [0.16, 0, 1], box: [0.3], bench: [0.3], plant: [0.42], frame: [0.36, 0.55], teddy: [0.26], fence: [0.36], stone: [0.2], ladder: [0.9],
    bowl: [0.12], bone: [0.1], shelf: [0.3, 0.62], bulb: [0.28, 0.95], doormat: [0.36], keyhole: [0.3, 0.42], umbrella: [0.42], monitor: [0.3, 0, 1], crib: [0.5], sun: [0.3, 0.95], mask: [0.3, 0.55],
    skull: [0.24, 0, 1], cross: [0.5], check: [0.3, 0.45], triangle: [0.4, 0.4], road: [0.1], "bus-stop": [0.9], bush: [0.32], cloud: [0.3, 0.95], grave: [0.5], cradle: [0.4], cake: [0.22, 0, 1] };
  function placeProp(name, x, floorY, fh, o) {
    o = obj(o);
    var key = objectKey(name) || pickObject(name), nat = NAT[key] || [0.45], stand = null, y = floorY - (nat[1] || 0) * fh;
    if (nat[2]) { stand = makeObject("nightstand", { x: x, y: floorY, size: fh * 0.3, layer: o.layer || "mid", at: o.at }); y = floorY - fh * 0.3 * 0.78; }
    var it = makeObject(key, { x: x, y: y, size: fh * nat[0] * (o.scale || 1), layer: o.layer || (nat[1] ? "wall" : "mid"), at: o.at, accent: o.accent, flip: o.flip });
    it.stand = stand;
    it.role = it.role || key;
    return it;
  }
  function floorLine(x0, x1, y, parent) { return svg("rect", { x: f1(x0), y: f1(y), width: f1(x1 - x0), height: f1(Math.max(u(6), st.FH * 0.015)), class: "pg-floor" }, parent || st.L.back); }
  function circleSlash(rectFn, at, o) {
    o = obj(o);
    var circ_ = null, line_ = null;
    return fxItem(!!o.world, at, o.until, function (t, g) {
      var r = rectFn(t);
      if (!circ_) { circ_ = svg("circle", { class: "ps-a" }, g); line_ = svg("path", { class: "ps-a" }, g); }
      var p = clamp((t - at) / 0.14, 0, 1), k = 1 + 0.5 * (1 - V.ease.outCubic(p));
      var rr = (Math.min(r.w, r.h) / 2) * 0.98 * k, sw = rr * 0.15, cx = r.x + r.w / 2, cy = r.y + r.h / 2, d = rr - sw / 2, a = rad(-45);
      setA(circ_, "cx", f1(cx)); setA(circ_, "cy", f1(cy)); setA(circ_, "r", f1(rr - sw / 2)); setA(circ_, "stroke-width", f1(sw));
      setA(line_, "d", "M" + f1(cx - Math.cos(a) * d) + " " + f1(cy - Math.sin(a) * d) + "L" + f1(cx + Math.cos(a) * d) + " " + f1(cy + Math.sin(a) * d)); setA(line_, "stroke-width", f1(sw));
    });
  }
  // A thin red arrow between two screen points (functions of t).
  function arrowLine(fromFn, toFn, at, o) {
    o = obj(o);
    var pth = null;
    return fxItem(false, at, o.until, function (t, g) {
      if (!pth) pth = svg("path", { class: o.color === "ink" ? "pf-i" : "pf-a" }, g);
      var a = fromFn(t), b = toFn(t), dx = b[0] - a[0], dy = b[1] - a[1], L = Math.sqrt(dx * dx + dy * dy) || 1;
      dx /= L; dy /= L;
      var p = clamp((t - at) / 0.2, 0, 1), k = V.ease.outCubic(p), tip = [a[0] + dx * L * k, a[1] + dy * L * k];
      var sw = u(6), hw = u(19), hl = u(30), nx = -dy, ny = dx, b0 = [tip[0] - dx * hl, tip[1] - dy * hl];
      setA(pth, "d", PL(tip, [b0[0] + nx * hw, b0[1] + ny * hw], [b0[0] + nx * sw, b0[1] + ny * sw], [a[0] + nx * sw, a[1] + ny * sw], [a[0] - nx * sw, a[1] - ny * sw], [b0[0] - nx * sw, b0[1] - ny * sw], [b0[0] - nx * hw, b0[1] - ny * hw]));
    });
  }
  function sideOf(o) { o = obj(o); return o; }
  function objAction(it, act, at, fig) {
    if (!it) return;
    act = str(act).toLowerCase();
    if (act === "open") { if (it.def.door) it.open(at); else if (it.parts.curtL) { it.curtTr.set(1, 0); it.curtains(0, at); } else it.shakeAt(at, 0.4, 5); }
    else if (act === "close") { if (it.def.door) { it.openTr.set(1, 0); it.close(at); } else if (it.parts.curtL) it.curtains(1, at); }
    else if (act === "light") it.light(true, at);
    else if (act === "answer") { if (it.name === "phone") ringPhone(it, Math.max(0, at - 1.2), 1.2); if (fig && fig.pose) fig.pose("phone", at); }
  }

  TPL["rule-card"] = function (root, p) {
    var mode = oneOf(p.mode, ["light", "dark"], "light");
    pictogram(root, { mode: mode, push: 0.03 });
    setting("plain");
    var sa = st.sa, rule = str(p.rule) || "STAY *INSIDE*", ck = castKey(p.character), icon = str(p.icon);
    if (icon && !castKey(icon) && !objectKey(icon)) icon = pickObject(icon);
    var tCard = kwFind(str(p.label) || "rule", 0);
    tCard = tCard == null ? 0.25 : Math.max(0.2, tCard - 0.05);
    var tKey = labelTime(rule, p.keyword, tCard);
    if (tKey == null) tKey = Math.max(tCard + 1, D * 0.4);
    var tSub = p.subtext ? labelTime(p.subtext, p.subtextKeyword, tKey + 0.1) : null;
    if (p.subtext && tSub == null) tSub = tKey + 1.4;
    var ts = orderBeats([tCard, tKey].concat(p.subtext ? [tSub] : []), 0.4);
    tCard = Math.min(ts[0], 0.6); tKey = ts[1]; tSub = ts[2];
    var cw, cx, cy, fx;
    if (P) { cw = sa.w; cx = W / 2; }
    else if (ck) { cw = sa.w * 0.64; cx = sa.x0 + cw / 2; fx = sa.x0 + cw + (sa.w - cw) / 2; }
    else { cw = sa.w * 0.8; cx = W / 2; }
    var card = ruleCard(p.number != null && p.number !== "" ? p.number : 1, rule, tCard, { icon: icon, label: p.label, width: cw / W, x: cx / W, y: 0.5, row: P && !!ck });
    // vertical placement: landscape centred in the space above the floor; portrait at the top
    var topLim = sa.y0 + u(60), botLim = ck || P ? st.floor - u(26) : sa.y1;
    if (P) {
      var fhP = ck ? Math.min(st.FH, (st.floor - sa.y0) * 0.45) : 0;
      card.cy = ck ? topLim + card.h / 2 : clamp((topLim + st.floor - u(40)) / 2, topLim + card.h / 2, st.floor - card.h / 2 - u(30));
      if (ck && card.cy + card.h / 2 > st.floor - fhP - u(30)) card.cy = Math.max(topLim + card.h / 2, st.floor - fhP - u(30) - card.h / 2);
    } else card.cy = clamp((topLim + botLim) / 2, topLim + card.h / 2, botLim - card.h / 2);
    // recompute the icon rect from the card's final position
    var bw = parseFloat(card.el.style.borderWidth) || 0, isv = card.el.querySelector("svg.pg-icon");
    if (isv) card.iconRect = { x: card.cx - card.w / 2 + bw + parseFloat(isv.style.left), y: card.cy - card.h / 2 + bw + parseFloat(isv.style.top), w: parseFloat(isv.getAttribute("width")), h: parseFloat(isv.getAttribute("height")) };
    // the key word turns red on its word
    var keys = [].slice.call(card.el.querySelectorAll(".txt .k"));
    addAnim(function (t) { keys.forEach(function (k) { setS(k, "color", t >= tKey ? "" : "var(--card-ink)"); setS(k, "display", "inline-block"); setS(k, "transform", t >= tKey && t < tKey + 0.16 ? "scale(" + (1.25 - (t - tKey) * 1.5).toFixed(3) + ")" : "none"); }); });
    if (p.forbidden && card.iconRect) circleSlash(function () { return card.iconRect; }, tKey + 0.12);
    if (ck) {
      var fh = P ? Math.min(st.FH, (st.floor - (card.cy + card.h / 2) - u(40)) / (CAST[ck].scale * 1.02)) : st.FH;
      var fxp = P ? W / 2 : fx;
      var fig = makeFigure(ck, { x: fxp, y: st.floor, h: fh * CAST[ck].scale, pose: "stand", facing: P ? "front" : "left", at: 0 });
      fig.pose(p.pose || "stop", tKey);
      if (CAST[ck].kind === "person") fig.talk(tCard, tKey - 0.1);
      if (ck === "visitor") fig.eyes(true, 0);
    } else if (!P) {
      // no figure: a warning triangle keeps the sign look
    }
    if (p.subtext) caption(p.subtext, tSub, { key: p.subtextKeyword, pos: "bottom" });
  };

  // Two-panel layout for do-dont and outcome-split.
  function panels(hasTitle, hasVerdict) {
    var sa = st.sa, gap = u(P ? 50 : 50), tH = hasTitle ? (P ? u(190) : u(160)) : 0, vH = hasVerdict ? (P ? u(170) : u(140)) : 0;
    var y0 = sa.y0 + tH, y1 = sa.y1 - vH, out = [];
    for (var i = 0; i < 2; i++) {
      var pr = P ? { x0: sa.x0, x1: sa.x1, y0: y0 + i * ((y1 - y0 + gap) / 2), y1: y0 + i * ((y1 - y0 + gap) / 2) + (y1 - y0 - gap) / 2 }
        : { x0: sa.x0 + i * ((sa.w + gap) / 2), x1: sa.x0 + i * ((sa.w + gap) / 2) + (sa.w - gap) / 2, y0: y0, y1: y1 };
      pr.w = pr.x1 - pr.x0; pr.h = pr.y1 - pr.y0; pr.cx = (pr.x0 + pr.x1) / 2;
      pr.capH = u(P ? 74 : 78);
      pr.floor = pr.y1 - pr.capH - u(18);
      pr.fh = Math.min((pr.floor - pr.y0 - u(20)) * 0.86, pr.w * (P ? 0.55 : 0.62));
      out.push(pr);
    }
    var res = { list: out, tH: tH, vH: vH, gap: gap };
    res.divider = function (at) {
      var a = out[0], b = out[1];
      if (P) divider(at, { horizontal: true, pos: ((a.y1 + b.y0) / 2 - sa.y0) / sa.h, from: 0, to: 1 });
      else divider(at, { horizontal: false, pos: 0.5, from: (a.y0 - sa.y0) / sa.h, to: (a.y1 - sa.y0) / sa.h });
    };
    res.capMark = function (pr, text, t, o) {
      o = obj(o);
      var cap = caption(text, t, { x: pr.cx / W, y: (pr.y1 - pr.capH / 2 - u(4)) / H, color: o.color, size: P ? 46 : 44, maxWidth: (pr.w / sa.w) * 0.74, free: true, key: o.key });
      var ms = u(P ? 84 : 90), mx = cap.cx - cap.w / 2 - ms * 0.75;
      if (mx - ms / 2 < pr.x0) mx = cap.cx + cap.w / 2 + ms * 0.75;
      mark(o.bad ? "x" : "check", null, t + 0.22, { x: mx / W, y: cap.cy / H, size: ms });
      return cap;
    };
    return res;
  }
  function panelScene(pr, side, opts) {
    side = sideOf(side);
    var ck = castKey(side.character) || opts.defChar, cd = CAST[ck], objName = str(side.object || side.icon);
    var hasObj = !!objectKey(objName) || !!(objName && pickObject(objName));
    floorLine(pr.x0 + u(10), pr.x1 - u(10), pr.floor, opts.layerEl || opts.layer);
    var fx = hasObj ? pr.x0 + pr.w * (P ? 0.3 : 0.32) : pr.cx, ox = pr.x0 + pr.w * (P ? 0.68 : 0.7);
    var fig = makeFigure(ck, { x: fx, y: pr.floor, h: Math.min(pr.fh * cd.scale, opts.maxH || 1e9), pose: "stand", facing: hasObj ? "right" : "front", at: opts.at || 0, layer: opts.figLayer, color: opts.color });
    var it = null;
    if (hasObj) {
      var key = objectKey(objName) || pickObject(objName), nat = NAT[key] || [0.45], sz = nat[0];
      var scl = Math.min(1, (pr.floor - pr.y0 - u(30)) / (pr.fh * (sz + (nat[1] || 0))));
      it = placeProp(key, ox, pr.floor, pr.fh * scl, { at: opts.at || 0, accent: false, layer: opts.objLayer });
      var bb = it.box(0);
      if (bb.x + bb.w > pr.x1 - u(10)) { var sh = bb.x + bb.w - (pr.x1 - u(10)); it.tr.base.x -= sh; if (it.stand) it.stand.tr.base.x -= sh; }
      if (opts.layerEl) { opts.layerEl.appendChild(it.g); if (it.stand) opts.layerEl.appendChild(it.stand.g); }
    }
    if (opts.layerEl) opts.layerEl.appendChild(fig.g);
    return { fig: fig, obj: it };
  }

  TPL["do-dont"] = function (root, p) {
    var mode = oneOf(p.mode, ["light", "dark"], "light");
    pictogram(root, { mode: mode, push: 0.025 });
    setting("none");
    var sa = st.sa, d0 = T(p["do"]), d1 = T(p.dont), title = str(p.title), verdict = str(p.verdict);
    var lay = panels(!!title, !!verdict);
    var tTitle = title ? labelTime(title, null, 0) : null;
    var tDo = labelTime(str(d0.text), p.doKeyword || d0.keyword, 0), tDont = labelTime(str(d1.text), p.dontKeyword || d1.keyword, (tDo || 0) + 0.1);
    var tVer = verdict ? labelTime(verdict, p.verdictKeyword, (tDont || 0) + 0.1) : null;
    var raw = [tTitle == null ? 0.25 : tTitle, tDo == null ? D * 0.3 : tDo, tDont == null ? D * 0.55 : tDont];
    if (verdict) raw.push(tVer == null ? D * 0.78 : tVer);
    var ts = orderBeats(raw, 0.6);
    var tT = Math.min(ts[0], 0.5); tDo = ts[1]; tDont = ts[2]; tVer = ts[3];
    if (title) stamp(title, tT, { size: P ? "md" : "md", maxHeight: lay.tH - u(24), y: (sa.y0 + lay.tH / 2 - u(6)) / H });
    lay.divider(0.2);
    var A = panelScene(lay.list[0], d0, { defChar: "you" }), B = panelScene(lay.list[1], d1, { defChar: "you" });
    [[A, d0, tDo, lay.list[0], false], [B, d1, tDont, lay.list[1], true]].forEach(function (q) {
      var sc_ = q[0], sd = q[1], t = q[2], pr = q[3], bad = q[4];
      if (sc_.obj) sc_.fig.face("right", 0);
      sc_.fig.pose(sd.pose || (bad ? "reach" : "stop"), t);
      objAction(sc_.obj, sd.action, t + 0.1, sc_.fig);
      if (bad && sd.accent && sc_.obj) { var og = sc_.obj.g; addAnim(function (tt) { setA(og, "class", "pg-obj" + (tt >= t ? " pg-acc" : "")); }); }
      lay.capMark(pr, str(sd.text) || (bad ? "DON'T" : "DO"), t, { color: bad ? "red" : "ink", bad: bad });
      if (bad) { flashFrame(t + 0.22, 0.07, "red"); shakeFx(t + 0.24, 0.35, u(16)); }
    });
    if (verdict) stamp(verdict, tVer, { color: "red", size: "md", maxHeight: lay.vH - u(20), y: (sa.y1 - lay.vH / 2 + u(4)) / H, rot: -2 });
  };

  TPL["outcome-split"] = function (root, p) {
    var mode = oneOf(p.mode, ["light", "dark"], "light");
    pictogram(root, { mode: mode, push: 0.025 });
    setting("none");
    var sa = st.sa, d0 = T(p["do"]), d1 = T(p.dont), cond = str(p.condition) || "IF YOU *DO*", verdict = str(p.verdict);
    var lay = panels(true, !!verdict);
    var tC = labelTime(cond, p.conditionKeyword, 0), tA = labelTime(str(d0.text), p.doKeyword || d0.keyword, (tC || 0) + 0.1), tB = labelTime(str(d1.text), p.dontKeyword || d1.keyword, (tA || 0) + 0.1);
    var tV = verdict ? labelTime(verdict, p.verdictKeyword, (tB || 0) + 0.1) : null;
    var raw = [tC == null ? 0.25 : tC, tA == null ? D * 0.32 : tA, tB == null ? D * 0.56 : tB];
    if (verdict) raw.push(tV == null ? D * 0.8 : tV);
    var ts = orderBeats(raw, 0.6);
    var tCond = Math.min(ts[0], 0.6); tA = ts[1]; tB = ts[2]; tV = ts[3];
    stamp(cond, tCond, { size: "md", maxHeight: lay.tH - u(24), y: (sa.y0 + lay.tH / 2 - u(6)) / H });
    lay.divider(0.2);
    [[d0, tA, lay.list[0], 0], [d1, tB, lay.list[1], 1]].forEach(function (q) {
      var sd = q[0], t = q[1], pr = q[2], i = q[3];
      var good = sd.good != null ? !!sd.good : i === 0;
      var grp = svg("g", {}, st.L.mid), bg = svg("rect", { x: f1(pr.x0), y: f1(pr.y0), width: f1(pr.w), height: f1(pr.h), fill: "#060606" }, grp);
      var content = svg("g", {}, grp);
      var scn = panelScene(pr, { character: sd.character || (good ? "you" : "visitor"), icon: sd.icon }, { defChar: good ? "you" : "visitor", layerEl: content, at: good ? 0 : t, color: good ? null : "void", maxH: pr.floor - pr.y0 - u(80) });
      if (good) { if (!sd.pose || sd.pose === "wave") scn.fig.face("front", t); scn.fig.pose(sd.pose || "wave", t); }
      else {
        scn.fig.pose(sd.pose || "reach", t); scn.fig.eyes(true, t);
        if (scn.fig.smileT0 != null) scn.fig.smileT0 = t;
        flashFrame(t, 0.08, "red"); shakeFx(t, 0.45, u(18));
      }
      showEl(bg, false);
      addAnim(function (tt) { var dk = !good && tt >= t; showEl(bg, dk); setA(grp, "class", dk ? "pg-darkpanel" : ""); });
      var head = div("pg-tabhead", st.ov, (str(sd.label) || (i === 0 ? "IF YOU DO" : "IF YOU DON'T")).toUpperCase()), hs = u(P ? 40 : 40);
      head.style.fontSize = f1(hs) + "px"; head.style.padding = f1(hs * 0.18) + "px " + f1(hs * 0.42) + "px";
      if (good) head.style.background = "var(--st-bg)", head.style.color = "var(--st-fg)";
      var hw = textW(head.textContent, hs) * 1.07 + hs * 0.84;
      overlayItem(head, "heading", head.textContent, Math.max(0.2, Math.min(t - 0.4, i === 0 ? tCond + 0.3 : t - 0.4)), null, { cx: pr.x0 + hw / 2 + u(8), cy: pr.y0 + hs * 0.68 + u(6), w: hw, h: hs * 1.36, slamK: 0.25, slamR: 0 });
      lay.capMark(pr, str(sd.text) || (good ? "YOU ARE SAFE" : "IT FINDS YOU"), t, { color: good ? "ink" : "red", bad: !good });
    });
    if (verdict) stamp(verdict, tV, { color: "red", size: "md", maxHeight: lay.vH - u(24), y: (sa.y1 - lay.vH / 2 + u(8)) / H, rot: -2.5 });
  };

  function angTo(from, to) { return (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / PI; }
  function freeX(room, w) {
    var cands = [0.78, 0.36, 0.9, 0.62, 0.14, 0.5], taken = [];
    for (var k in room.objs) { var b = room.objs[k].box(0); taken.push([b.x, b.x + b.w]); }
    st.figs.forEach(function (f) { var b = f.box(0); taken.push([b.x, b.x + b.w]); });
    for (var i = 0; i < cands.length; i++) {
      var x = roomX(cands[i]), ok = taken.every(function (r) { return x + w / 2 < r[0] || x - w / 2 > r[1]; });
      if (ok) return x;
    }
    return roomX(cands[0]);
  }

  TPL["room-at-night"] = function (root, p) {
    pictogram(root, { mode: "dark", push: 0.045 });
    var room = setting(p.setting || "bedroom", { time: p.time });
    var ck = castKey(p.character) || "you", sa = st.sa;
    if (CAST[ck].kind === "pet") ck = "you";
    var tnames = arr(p.reveals).map(function (r) { return objectKey(obj(r).object) || ""; });
    var txs = [];
    for (var nm0 in room.objs) if (tnames.indexOf(room.objs[nm0].name) >= 0 || (p.visitor === "door" && nm0 === "door") || (p.visitor === "window" && nm0 === "window")) { var bb0 = room.objs[nm0].box(0); txs.push(bb0.x + bb0.w / 2); }
    var cands = [st.rx0 + st.FH * 0.22, st.rx1 - st.FH * 0.22].concat(room.slots.map(function (f) { return f * W; })), hx = cands[0], best = -1;
    cands.forEach(function (x, ci) {
      var d = txs.length ? Math.min.apply(null, txs.map(function (tx) { return Math.abs(tx - x); })) : st.FH;
      var blocked = 0;
      for (var nm1 in room.objs) { var o1 = room.objs[nm1], b1 = o1.box(0); if (o1.def.door) if (x > b1.x - st.FH * 0.08 && x < b1.x + b1.w + st.FH * 0.08) blocked = 1; }
      var sc_ = Math.min(d, st.FH * 1.2) - blocked * st.FH * 2 - ci * 2;
      if (sc_ > best) { best = sc_; hx = x; }
    });
    var holder = makeFigure(ck, { x: hx, y: st.floor, pose: "flashlight", facing: "right", layer: "front" });
    var torch = holder.hold("flashlight");
    torch.light(false, 0);
    var reveals = arr(p.reveals).slice(0, 4).map(obj);
    if (!reveals.length) reveals = [{ object: "door" }];
    var targets = reveals.map(function (r) {
      var key = objectKey(r.object) || pickObject(r.object), o = room.objs[str(r.object).toLowerCase()];
      if (!o) for (var nm in room.objs) if (room.objs[nm].name === key) { o = room.objs[nm]; break; }
      if (!o) { var nat = NAT[key] || [0.45]; o = placeProp(key, freeX(room, st.FH * nat[0] * ((OB[key] || OB.box).w / 100)), st.floor, st.FH, {}); room.objs[key + "_r"] = o; }
      return o;
    });
    var prev = 0, lands = reveals.map(function (r) { var t = labelTime(str(r.text) || str(r.object), r.keyword, prev); if (t != null) prev = t + 0.05; return t; });
    lands = spread(lands, 1.0, D * 0.6);
    var vis = oneOf(p.visitor, ["none", "door", "window", "corner"], "none");
    var stampT = str(p.stamp);
    var tV = vis !== "none" ? when(p.visitorKeyword, null, lands[lands.length - 1] + 0.1, lands[lands.length - 1] + 1.2) : null;
    var tS = stampT ? labelTime(stampT, p.keyword, (tV || lands[lands.length - 1]) + 0.1) : null;
    if (stampT && tS == null) tS = (tV || lands[lands.length - 1]) + 1;
    var all = lands.concat(tV != null ? [tV] : []).concat(stampT ? [tS] : []);
    all = orderBeats(all.map(function (t, i) { return Math.max(t, 0.9 + i * 0.1); }), 0.7);
    lands = all.slice(0, lands.length);
    if (tV != null) tV = all[lands.length];
    if (stampT) tS = all[all.length - 1];
    var cn = cone(holder, { at: 0.12, angle: 18, spread: 30, ambient: clamp(num(p.ambient, 0.08), 0, 0.3), followArm: true });
    function aimAt(rect, t, dur) {
      var tx = rect.x + rect.w / 2, ty = rect.y + rect.h / 2, fx = holder.tr.val(t).x, right = tx >= fx;
      holder.face(right ? "right" : "left", t);
      var sh = holder.shoulder(t + 0.01), th = angTo(sh, [tx, ty]);
      if (!right && th < 0) th += 360;
      holder.poseTr.to({ a: clamp(right ? 90 - th : th - 90, -10, 175), e: 0 }, t, dur, "inOutCubic");
    }
    holder.poseTr.to({ a: 66, e: 0 }, 0, 0.01);
    holder.poseTr.to({ a: 82, e: 0 }, 0.2, Math.max(0.3, lands[0] - 0.8), "inOutSine");
    targets.forEach(function (o, i) {
      var t = lands[i], r = reveals[i];
      aimAt(o.box(0), Math.max(0.2, t - 0.45), 0.42);
      if (str(r.text)) label(r.text, o, t, { from: "top", size: P ? 48 : 44, until: stampT ? tS : null });
      var act = oneOf(r.action, ACTIONS, "none");
      if (act !== "none") action(act, t + 0.1);
    });
    if (vis !== "none") {
      var tgt = null;
      if (vis === "door") {
        var door = room.objs.door || (room.objs.door = makeObject("door", { x: freeX(room, st.FH * 0.54), size: st.FH * 1.18, layer: "back" }));
        if (door.openTr.val(tV) < 0.5) door.open(tV - 0.5, 60, 0.5);
        visitorInDoor(door, tV);
        tgt = doorway(door);
      } else if (vis === "window") {
        var win = room.objs.window || (room.objs.window = makeObject("window", { x: freeX(room, st.FH * 0.52), y: st.floor - st.FH * 0.56, size: st.FH * 0.62, layer: "wall" }));
        win.part("face", { op: 1 }, tV, 0.01);
        tgt = win.box(0);
      } else {
        var cx = holder.tr.base.x > W / 2 ? st.rx0 + st.FH * 0.4 : st.rx1 - st.FH * 0.4, cy = st.floor - st.FH * 0.85;
        eyesAt(cx, cy, st.FH * 0.08, tV);
        tgt = { x: cx - st.FH * 0.1, y: cy - st.FH * 0.05, w: st.FH * 0.2, h: st.FH * 0.1 };
      }
      aimAt(tgt, tV - 0.4, 0.35);
      holder.tremble(tV + 0.2, D - tV, 0.8);
      shakeFx(tV + 0.05, 0.3, u(10));
    }
    if (str(p.time)) clockStamp(str(p.time), 0.2, { pos: "top-left" });
    if (stampT) bandStamp(stampT, tS, { color: "red" }, { top: str(p.time) && P ? sa.y0 + u(110) : sa.y0, maxWidth: str(p.time) && !P ? sa.w - u(600) : null });
  };

  TPL["countdown-clock"] = function (root, p) {
    var mode = oneOf(p.mode, ["light", "dark"], "light");
    pictogram(root, { mode: mode });
    var room = setting(p.setting || "bedroom", { time: p.from });
    var ck = castKey(p.character) || "you", pose = str(p.pose) || (room.objs.bed ? "sit-bed" : "stand");
    var chars = [{ id: ck, pose: pose }];
    var figs = placeCast(room, chars), you = figs[0];
    var sa = st.sa, stampT = str(p.stamp) || "DON'T *MOVE*", cap = str(p.caption);
    var tCap = cap ? labelTime(cap, p.captionKeyword, 0) : null;
    var tE = when(p.eventKeyword, null, tCap || 0, null);
    if (tE == null) tE = D * 0.45;
    var tS = labelTime(stampT, p.keyword, tE + 0.1);
    if (tS == null) tS = tE + 1.2;
    var raw = (cap ? [tCap == null ? 0.4 : tCap] : []).concat([Math.max(tE, 1.2), tS]);
    var ts = orderBeats(raw, 0.6);
    if (cap) { tCap = ts[0]; ts = ts.slice(1); }
    tE = ts[0]; tS = ts[1];
    var bandBot = roomTop() - u(26), size = P ? Math.min(u(170), (bandBot - sa.y0) * 0.55) : Math.min(u(150), (bandBot - sa.y0) * 0.62);
    var cd = countdown(p.from || "1:58 AM", p.to || "2:00 AM", 0.2, Math.max(0.5, tE - 0.2), { pos: "center", size: size / V.s(1), y: ((sa.y0 + bandBot) / 2) / H, until: tS });
    var ev = oneOf(p.event, ACTIONS, "none"), focus = null;
    if (ev !== "none") focus = action(ev, tE);
    if (room.objs.clock) { room.objs.clock.setTime(p.from || "1:58", 0); room.objs.clock.setTime(p.to || "2:00", 0.2, Math.max(0.5, tE - 0.2)); }
    if (you) { you.tremble(Math.max(0.3, tE - 1.2), 1.0, 0.4); if (ev === "none") you.pose("scared", tE + 0.1); }
    if (focus && ev !== "lights-flicker") ring(focus, tE + 0.25, { until: tS + 0.1 });
    if (cap) caption(cap, tCap, { key: p.captionKeyword, until: tS });
    clockStamp(str(p.to) || "2:00 AM", tS, { pos: "top-left" });
    var clkW = textW("0:00", u(P ? 66 : 62)) + u(120);
    bandStamp(stampT, tS, { color: "mixed" }, { top: P ? sa.y0 + u(110) : sa.y0, maxWidth: P ? null : sa.w - clkW * 2 - u(40) });
  };

  TPL["object-warning"] = function (root, p) {
    var mode = oneOf(p.mode, ["light", "dark"], "light");
    pictogram(root, { mode: mode, push: 0.035 });
    setting("none");
    var sa = st.sa, key = objectKey(p.object) || pickObject(p.object), def = OB[key], title = str(p.title), stampT = str(p.stamp);
    var callouts = arr(p.callouts).map(obj).filter(function (c) { return str(c.text); }).slice(0, 4), ncl = callouts.length;
    var topH = title ? (P ? u(170) : u(150)) : u(20), botH = stampT ? (P ? u(160) : u(140)) : u(20);
    var sideW = ncl ? sa.w * (P ? 0.27 : 0.25) : 0, avW = sa.w - sideW * 2 - u(P ? 30 : 80), avH = sa.h - topH - botH - u(40);
    var oh = Math.min(avH, (avW * 100) / def.w), ow = (oh * def.w) / 100;
    var ox = W / 2, oyB = sa.y0 + topH + u(20) + (avH + oh) / 2;
    var tTitle = title ? labelTime(title, p.titleKeyword, 0) : null, tObj = p.objectKeyword ? kwFind(p.objectKeyword, 0) : null;
    var prev = 0, lands = callouts.map(function (c) { var t = labelTime(c.text, c.keyword, prev); if (t != null) prev = t + 0.05; return t; });
    lands = spread(lands, 1.0, D * 0.62);
    var tS = stampT ? labelTime(stampT, p.keyword, lands.length ? lands[lands.length - 1] + 0.1 : 0) : null;
    if (stampT && tS == null) tS = D * 0.8;
    var raw = [tTitle == null ? 0.25 : tTitle].concat(lands).concat(stampT ? [tS] : []);
    var ts = orderBeats(raw, 0.5);
    tTitle = Math.min(ts[0], 0.8); lands = ts.slice(1, 1 + ncl); tS = ts[1 + ncl];
    tObj = tObj == null ? 0.2 : clamp(tObj - 0.25, 0.2, 1.0);
    var it = makeObject(key, { x: ox, y: oyB, size: oh, accent: !!p.accent, at: tObj, layer: "mid" });
    if (title) {
      var tit = stamp(title, tTitle, { size: P ? "md" : "md", maxHeight: topH - u(20), y: (sa.y0 + topH / 2 - u(4)) / H, maxWidth: (sa.w - u(300)) / W });
      if (p.warning !== false) triangle(tTitle + 0.1, { x: (tit.cx - tit.w / 2 - u(85)) / W, y: tit.cy / H, size: u(100), blink: true });
    } else if (p.warning !== false) triangle(0.3, { x: (ox - ow / 2 - u(80)) / W, y: (oyB - oh + u(60)) / H, size: u(110), blink: true });
    var sides = { l: [], r: [] };
    callouts.forEach(function (c, i) {
      var dx = c.dx != null ? clamp(num(c.dx, 0), -0.5, 0.5) : (i % 2 ? 0.22 : -0.22), dy = c.dy != null ? clamp(num(c.dy, 0.5), 0, 1) : 0.8 - (i / Math.max(1, ncl - 1)) * 0.6;
      var side = c.dx != null ? (dx >= 0 ? "r" : "l") : i % 2 ? "r" : "l";
      sides[side].push({ c: c, i: i, dx: dx, dy: dy, px: ox + dx * ow, py: oyB - dy * oh });
    });
    ["l", "r"].forEach(function (sd) {
      var list = sides[sd].sort(function (a, b) { return a.py - b.py; }), lastBot = sa.y0 + topH;
      list.forEach(function (q) {
        var cx = sd === "l" ? sa.x0 + sideW / 2 : sa.x1 - sideW / 2;
        var lb = label(q.c.text, null, lands[q.i], { px: cx, py: q.py, maxWidth: sideW, lines: 2, noLine: true, size: P ? 44 : 44 });
        lb.pre = null;
        lb.cx = cx;
        lb.cy = clamp(Math.max(q.py, lastBot + lb.h / 2 + u(16)), sa.y0 + lb.h / 2, sa.y1 - botH - lb.h / 2);
        lastBot = lb.cy + lb.h / 2;
        var lbx = sd === "l" ? lb.cx + lb.w / 2 + u(10) : lb.cx - lb.w / 2 - u(10), lby = lb.cy;
        arrowLine(function () { return [lbx, lby]; }, function (t) { var c = camAt(t); var pp = proj(q.px, q.py, c); return [pp[0] + (sd === "l" ? -u(6) : u(6)), pp[1]]; }, lands[q.i] + 0.08);
      });
    });
    if (stampT) {
      stamp(stampT, tS, { color: "red", size: "md", maxHeight: botH - u(16), y: (sa.y1 - botH / 2 + u(4)) / H });
      boxRing(it, tS + 0.2);
    }
  };
  function boxRing(target, at) {
    var pth = null;
    return fxItem(true, at, null, function (t, g) {
      var r = rectAt(target, t);
      if (!pth) { pth = svg("path", { class: "ps-a", pathLength: 100, "stroke-dasharray": "100 100" }, g); pth.setAttribute("stroke-width", f1(u(12))); }
      var pad = u(18);
      setA(pth, "d", R(r.x - pad, r.y - pad, r.w + pad * 2, r.h + pad * 2, u(26)));
      setA(pth, "stroke-dashoffset", f1(100 * (1 - V.ease.outCubic(clamp((t - at) / 0.35, 0, 1)))));
    });
  }

  TPL["phone-screen"] = function (root, p) {
    var mode = oneOf(p.mode, ["light", "dark"], "light");
    pictogram(root, { mode: mode, push: 0.03 });
    setting("none");
    var sa = st.sa, kind = p.kind === "message" ? "message" : "call", ck = p.character === "none" ? null : castKey(p.character) || "you";
    var cap = str(p.caption), stampT = str(p.stamp);
    var tCap = cap ? labelTime(cap, p.captionKeyword, 0) : null;
    var tRing = when(p.ringKeyword, null, 0, null);
    if (tRing == null) tRing = D * 0.35;
    var msgs = arr(p.messages).slice(0, 6).map(obj), prev = Math.max(0, tRing - 0.2);
    var mt = msgs.map(function (m) { var t = labelTime(m.text, m.keyword, prev); if (t != null) prev = t + 0.05; return t; });
    mt = spread(mt, tRing, D * 0.7);
    var tS = stampT ? labelTime(stampT, p.keyword, (mt.length ? mt[mt.length - 1] : tRing) + 0.1) : null;
    if (stampT && tS == null) tS = D * 0.78;
    var raw = (cap ? [tCap == null ? 0.3 : tCap] : []).concat([tRing]).concat(kind === "message" ? mt.slice(1) : []).concat(stampT ? [tS] : []);
    var ts = orderBeats(raw, 0.45), k = 0;
    if (cap) tCap = ts[k++];
    tRing = ts[k++];
    if (kind === "message") { mt[0] = tRing; for (var i = 1; i < mt.length; i++) mt[i] = ts[k++]; }
    if (stampT) tS = ts[k++];
    var ph, fx, capY, stY, stH, floorY, fh;
    if (P) {
      var capH = cap ? u(110) : 0;
      stH = stampT ? u(150) : 0;
      floorY = sa.y1 - stH - u(16);
      var phH = Math.min(sa.h * 0.58, floorY - sa.y0 - capH - u(40)), phY = sa.y0 + capH + u(20) + phH / 2;
      ph = { x: ck ? W * 0.36 : W / 2, y: phY, h: phH };
      fx = W * 0.79; fh = Math.min(st.FH * 0.95, (floorY - sa.y0 - capH) * 0.55);
      capY = sa.y0 + capH / 2; stY = sa.y1 - stH / 2;
    } else {
      floorY = st.floor;
      ph = { x: ck ? W * 0.34 : W / 2, y: sa.cy, h: sa.h * 0.9 };
      fx = W * 0.72; fh = st.FH;
      capY = sa.y0 + u(50); stY = null;
    }
    if (ck) floorLine(P ? W * 0.58 : W * 0.52, sa.x1 + u(20), floorY);
    var fig = ck ? makeFigure(ck, { x: fx, y: floorY, h: fh * CAST[ck].scale, pose: "stand", facing: "left" }) : null;
    var phone = phoneUI({ kind: kind, from: p.from, time: p.time, label: p.label, avatar: p.avatar, at: 0.2, ringAt: tRing, ringDur: stampT ? Math.max(0.6, tS - tRing) : 1e9, messages: msgs.map(function (m, i) { return { text: m.text, me: !!m.me, at: mt[i] }; }), x: ph.x / W, y: ph.y / H, h: ph.h });
    if (fig) {
      if (CAST[ck].kind === "person") { fig.pose("look", tRing + 0.15); fig.pose(p.pose || "cover-ears", stampT ? tS : tRing + 1.2); }
      else fig.pose("alert", tRing + 0.15);
      if (fig.seated) { /* person */ }
    }
    if (cap) {
      if (P) caption(cap, tCap, { key: p.captionKeyword, x: 0.5, y: capY / H, free: true });
      else caption(cap, tCap, { key: p.captionKeyword, x: (fx + (ph.x + ph.h * 0.25)) / 2 / W > 0 ? ((ph.x + ph.h * 0.25 + sa.x1) / 2) / W : 0.7, y: capY / H, free: true, maxWidth: 0.44 });
    }
    if (stampT) {
      if (P) stamp(stampT, tS, { color: "red", size: "md", maxHeight: stH - u(14), y: stY / H });
      else {
        var colX0 = ph.x + ph.h * 0.25 + u(40), colX1 = sa.x1, headY = floorY - fh * CAST[ck || "you"].scale - u(30), top = cap ? capY + u(60) : sa.y0;
        stamp(stampT, tS, { color: "red", size: "lg", maxWidth: (colX1 - colX0) / W, maxHeight: headY - top, x: ((colX0 + colX1) / 2) / W, y: ((top + headY) / 2) / H });
      }
      if (phone.acceptRect) { var ar = phone.acceptRect; mark("x", null, tS + 0.25, { x: (ar.x + ar.w / 2) / W, y: (ar.y + ar.h / 2) / H, size: ar.w * 1.5 }); }
      else mark("x", phone, tS + 0.25, { size: u(P ? 120 : 140) });
    }
  };

  TPL["checklist-protocol"] = function (root, p) {
    var mode = oneOf(p.mode, ["light", "dark"], "light");
    pictogram(root, { mode: mode, push: 0.02 });
    setting("none");
    var sa = st.sa, steps = arr(p.steps).slice(0, 6).map(obj), stampT = str(p.stamp);
    if (!steps.length) steps = [{ text: "STAY *INSIDE*" }];
    var ck = !P && p.character ? castKey(p.character) : null; // the spec keeps the figure to landscape / square
    var prev = 0, lands = steps.map(function (s_) { var t = labelTime(s_.text, s_.keyword, prev); if (t != null) prev = t + 0.05; return t; });
    lands = spread(lands, 0.6, D * 0.72);
    var tS = stampT ? labelTime(stampT, p.keyword, lands[lands.length - 1] + 0.1) : null;
    if (stampT && tS == null) tS = lands[lands.length - 1] + 1.0;
    var ts = orderBeats(lands.concat(stampT ? [tS] : []), 0.55);
    lands = ts.slice(0, steps.length); if (stampT) tS = ts[ts.length - 1];
    var stH = stampT && (!ck || P) ? (P ? u(170) : u(150)) : 0, figZ = ck && P ? u(400) : 0;
    var listW = ck && !P ? sa.w * 0.6 : P ? sa.w : sa.w * 0.82, listX = ck && !P ? sa.x0 + listW / 2 : W / 2;
    var listH = (sa.h - stH - figZ - (stH ? u(20) : 0)) / H;
    var cl = checklist(steps.map(function (s_, i) { return { text: s_.text, icon: s_.icon, at: Math.max(0.2, lands[i] - 0.2), checkAt: Math.min(lands[i] + 0.5, i + 1 < lands.length ? lands[i + 1] - 0.25 : lands[i] + 0.5), done: s_.done }; }),
      { title: str(p.title) || "THE PROTOCOL", width: listW / W, x: listX / W, y: (sa.y0 + (listH * H) / 2) / H, h: listH, at: 0.2 });
    if (ck) {
      var colX = sa.x0 + listW + (sa.w - listW) / 2;
      floorLine(sa.x0 + listW + u(50), sa.x1 + u(20), st.floor);
      var fig = makeFigure(ck, { x: colX, y: st.floor, pose: "stand", facing: "left" });
      var cyc = ["stop", "reach", "hold", "cover-eyes", "hush", "point"];
      steps.forEach(function (s_, i) { fig.pose(s_.pose || cyc[i % cyc.length], lands[i]); });
      if (stampT) {
        var headY = st.floor - st.FH * CAST[ck].scale - u(30);
        stamp(stampT, tS, { color: "red", size: "lg", maxWidth: (sa.w - listW - u(60)) / W, maxHeight: headY - sa.y0, x: colX / W, y: ((sa.y0 + headY) / 2) / H });
      }
    } else if (stampT) stamp(stampT, tS, { color: "red", size: "md", maxHeight: stH - u(16), y: (sa.y1 - stH / 2) / H });
  };

  TPL["stinger-reveal"] = function (root, p) {
    var mode = oneOf(p.mode, ["light", "dark"], "light");
    pictogram(root, { mode: mode });
    var room = setting(p.setting || "hallway", { time: p.time });
    var ck = castKey(p.character) || "you";
    if (ck === "visitor") ck = "you";
    var chars = [{ id: ck, pose: p.pose || "stand" }];
    var pk = castKey(p.pet);
    if (pk && CAST[pk].kind === "pet") chars.push({ id: pk });
    var figs = placeCast(room, chars), you = figs[0], pet = figs[1];
    var sa = st.sa, before = str(p.before), stampT = str(p.stamp), after = str(p.after), hold = Math.max(0, num(p.hold, 0));
    var tCut = kwFind(p.keyword, 0);
    if (tCut == null) tCut = D * 0.5;
    tCut = clamp(tCut, 1.2, lastBeat() - 0.3);
    var tBefore = before ? labelTime(before, null, 0) : null;
    if (before) tBefore = clamp(tBefore == null ? 0.3 : tBefore - 0.1, 0.2, Math.max(0.2, tCut - 1.4));
    var tStamp = stampT ? labelTime(stampT, p.stampKeyword, tCut) : null;
    if (stampT) tStamp = clamp(tStamp == null ? tCut + 0.5 : Math.max(tStamp - 0.1, tCut + 0.25), tCut + 0.25, lastBeat());
    var tBack = hold > 0 ? Math.min(tCut + hold, lastBeat() - 0.2) : null;
    if (tBack != null && tStamp != null && tBack < tStamp + 0.6) tBack = Math.min(lastBeat() - 0.1, tStamp + 0.6);
    var tAfter = after && tBack != null ? labelTime(after, p.afterKeyword, tBack) : null;
    if (after && tBack != null) tAfter = clamp(tAfter == null ? tBack + 0.3 : tAfter - 0.1, tBack + 0.15, lastBeat());
    var clkTop = sa.y0;
    if (str(p.time)) { var ck1 = clockStamp(str(p.time), 0.2, { pos: "top-left", until: tCut }); clkTop = P ? ck1.cy + ck1.h / 2 + u(18) : sa.y0; if (tBack != null) clockStamp(str(p.time), tBack, { pos: "top-left" }); }
    var mw = str(p.time) && !P ? sa.w - u(560) : null;
    if (before) bandStamp(before, tBefore, { color: "ink", size: "md", shake: false }, { top: clkTop, maxWidth: mw }).hide(tCut);
    var bu = oneOf(p.buildup, ACTIONS, "knock"), tB = clamp(tCut - 1.7, 0.5, tCut - 0.6);
    action(bu, tB);
    flicker(tCut - 0.5, 0.45, 0.55);
    if (you) you.pose("look", tCut - 0.9);
    stinger(tCut, { pos: p.visitorPos === "full" ? "full" : "face", until: tBack != null ? tBack : 1e9 });
    if (stampT) stamp(stampT, tStamp, { color: "red", size: P ? "xl" : "lg", y: P ? 0.2 : 0.17, maxHeight: P ? u(300) : u(210), until: tBack != null ? tBack : null });
    if (tBack != null) {
      setMode("dark", tBack);
      figs.forEach(function (f) { f.pose(f.kind === "pet" ? "hide" : "scared", tBack); f.eyes(true, tBack); f.tremble(tBack, D - tBack, 1); });
      shakeFx(tBack, 0.25, u(10));
      if (after) bandStamp(after, tAfter, { color: "red" }, { top: clkTop, maxWidth: mw });
    }
  };

  TPL["title-card"] = function (root, p) {
    var mode = oneOf(p.mode, ["light", "dark"], "light");
    pictogram(root, { mode: mode, push: 0.04 });
    var icon = str(p.icon), ck = castKey(icon);
    setting(icon ? "plain" : "none");
    var sa = st.sa, title = str(p.title) || "THE *RULES*", sub = str(p.subtitle), kick = str(p.kicker);
    flicker(0.0, 0.5, 0.5);
    var tKick = kick ? kwFind(kick.split(/\s+/)[0], 0) : null;
    tKick = kick ? clamp(tKick == null ? 0.25 : tKick - 0.05, 0.2, 0.9) : null;
    var tT = labelTime(title, p.keyword, 0);
    var tSub = sub ? labelTime(sub, p.subtitleKeyword, (tT || 0) + 0.1) : null;
    var raw = [tT == null ? 0.5 : tT - 0.1].concat(sub ? [tSub == null ? (tT || 0.5) + 1.4 : tSub] : []);
    var ts = orderBeats(raw, 0.6);
    tT = ts[0]; tSub = ts[1];
    if (kick && tKick > tT) tKick = Math.max(0.2, tT - 0.3);
    // icon under the title
    var subH = sub ? u(P ? 120 : 100) : 0, fig = null, it = null;
    if (icon) {
      if (ck) {
        var cd = CAST[ck];
        fig = makeFigure(ck, { x: W / 2, y: st.floor, h: st.FH * (cd.kind === "pet" ? 0.62 : cd.scale), pose: p.pose || (cd.kind === "pet" ? "stand" : "stand"), facing: cd.kind === "pet" ? "right" : "front", at: 0.25 });
        if (ck === "visitor") fig.eyes(true, 0);
        if (cd.kind === "pet") fig.pose(oneOf(p.pose, Object.keys(PET_POSES), "alert"), tT + 0.15);
        else if (p.pose) fig.pose(p.pose, tT + 0.15);
      } else {
        var k2 = objectKey(icon) || pickObject(icon), nat = NAT[k2] || [0.45];
        it = placeProp(k2, W / 2, st.floor, st.FH * Math.min(1.6, 0.9 / Math.max(0.2, nat[0] + (nat[1] || 0))), { at: 0.25 });
      }
    }
    var kickEl = null, kh = 0;
    var top = sa.y0, bottom = icon ? roomTop() - u(30) : sa.y1 - subH - u(20);
    if (kick) {
      var ks = u(P ? 58 : 52);
      kickEl = div("pg-tabhead", st.ov, kick.toUpperCase());
      kickEl.style.fontSize = f1(ks) + "px"; kickEl.style.padding = f1(ks * 0.18) + "px " + f1(ks * 0.45) + "px";
      var kw = textW(kick.toUpperCase(), ks) * 1.07 + ks * 0.9;
      kh = ks * 1.36;
      overlayItem(kickEl, "kicker", kick, tKick, null, { cx: W / 2, cy: top + kh / 2, w: kw, h: kh, slamK: 0.3, slamR: 0 });
      top += kh + u(18);
    }
    var ttl = stamp(title, tT, { size: "xl", maxHeight: bottom - top, y: ((top + bottom) / 2) / H, lines: P ? 3 : 2, maxWidth: P ? 1 : (sa.w - u(300)) / W });
    if (p.triangle !== false) triangle(0.3, { x: (sa.x0 + u(70)) / W, y: (sa.y0 + u(60)) / H, size: u(P ? 110 : 120), blink: true });
    if (p.number != null && p.number !== "") badge(p.number, Math.max(0.3, tKick || 0.3), { size: u(P ? 110 : 120) });
    if (sub) caption(sub, tSub, { color: oneOf(p.subtitleColor, ["ink", "red", "yellow"], "ink"), size: P ? 54 : 50, key: null });
    if (fig && CAST[fig.id].kind === "person") fig.tremble(tT + 0.2, 0.6, 0.5);
  };

  /*@@NEXT@@*/
  // ------------------------- public API -------------------------
  function render(id, root, props) {
    var fn = TPL[id];
    if (!fn) throw new Error("Unknown pictogram template: " + id);
    fn(root || V.root(), T(props));
  }
  function fallback(root, narration) {
    root = root || V.root();
    st = null;
    pictogram(root, { mode: "light" });
    var room = setting("plain");
    var you = makeFigure("you", { x: W * (P ? 0.5 : 0.62), y: st.floor, pose: "stand", facing: "left" });
    var words = contentWords(narration || V.narration).slice(0, 3).join(" ").toUpperCase();
    triangle(0.3, { x: (P ? 0.5 : 0.36) * 1, y: P ? (st.floor - st.FH * 1.5) / H : 0.55, size: u(P ? 260 : 300) });
    if (words) stamp(words, 0.5, { size: P ? "lg" : "xl", maxHeight: P ? u(400) : u(300), y: P ? 0.2 : 0.2 });
    you.pose("look", 0.8);
  }
  S.pictogram = pictogram;
  S.setMode = setMode;
  S.flicker = flicker;
  S.lightsOut = lightsOut;
  S.blackout = blackout;
  S.flashFrame = flashFrame;
  S.cameraTo = cameraTo;
  S.cameraCut = cameraCut;
  S.frameRect = frameRect;
  S.shake = shakeFx;
  S.setting = setting;
  S.object = makeObject;
  S.objects = Object.keys(OB);
  S.objectKey = objectKey;
  S.objectWidth = function (n) { var k = objectKey(n); return k ? OB[k].w : 100; };
  S.pickObject = pickObject;
  S.action = action;
  S.actions = ACTIONS.slice();
  S.figure = makeFigure;
  S.cast = Object.keys(CAST);
  S.CAST = CAST;
  S.poses = Object.keys(POSES);
  S.petPoses = Object.keys(PET_POSES);
  S.stamp = function (text, at, o) { return stamp(text, at, o); };
  S.caption = caption;
  S.clockStamp = clockStamp;
  S.countdown = countdown;
  S.ruleCard = ruleCard;
  S.badge = badge;
  S.triangle = triangle;
  S.divider = divider;
  S.arrowTo = function (target, at, o) { return arrowTo(target, at == null ? ensure().cursor : at, o); };
  S.ring = function (target, at, o) { return ring(target, at == null ? ensure().cursor : at, o); };
  S.mark = mark;
  S.label = label;
  S.cone = cone;
  S.stinger = stinger;
  S.phoneUI = phoneUI;
  S.checklist = checklist;
  S.syncAt = syncAt;
  S.syncTimes = syncTimes;
  S.lineWindows = function (lines) {
    var out = [], prev = 0;
    arr(lines).forEach(function (l, i) {
      var t0 = labelTime(str(l), null, prev);
      if (t0 == null) t0 = prev + (i ? 1.2 : 0.2);
      out.push([t0, null]); prev = t0 + 0.05;
    });
    for (var i = 0; i < out.length; i++) out[i][1] = i + 1 < out.length ? out[i + 1][0] : D;
    return out;
  };
  S.cursor = function () { return st ? st.cursor : 0.3; };
  S.wait = function (sec) { var s = ensure(); s.cursor += Math.max(0, +sec || 0); return s.cursor; };
  S.setCursor = function (t) { var s = ensure(); s.cursor = Math.max(0, +t || 0); return s.cursor; };
  S.safe = safe;
  S.u = u;
  S.templates = Object.keys(TPL);
  S.render = render;
  S.fallback = fallback;
  S.inspect = function (t) {
    if (!st) return [];
    var c = camAt(t), out = [];
    var camMoving = st.camTr.moving(t) || st.camTr.val(t).z > 1.02; // a zoomed camera crops on purpose
    var stung = st.stingers.some(function (k) { return t >= k.at && t < k.until; });
    st.items.forEach(function (it) {
      if (stung && it.world) return;
      var b = it.box(t);
      if (!b) return;
      var sb = it.world ? projBox(b, c) : b;
      var mv = camMoving;
      if (it.world) st.figs.forEach(function (f) { if (f.label === it.label && f.moving && f.moving(t)) mv = true; });
      if (it.world && it.label && st.room && st.room.objs) for (var k in st.room.objs) { var o = st.room.objs[k]; if (o.name === it.label && o.tr.moving(t)) mv = true; }
      out.push({ kind: it.kind, label: it.label, x: sb.x, y: sb.y, w: sb.w, h: sb.h, moving: mv });
    });
    return out;
  };
  S.flush = function () { if (st) frame(V.time()); };
})();

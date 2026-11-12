/* Anime engine (style id: anime).
 *
 * An original cel-shaded anime episode: a fixed cast of five acts out the narration, cut like anime.
 *
 * Architecture
 * - A scene is a FILM: a list of SHOTS on one time line. Each shot owns its painted location, its
 *   characters and its camera; only the active shot is displayed (display none for the rest).
 *   Shot DOM, back to front: svg bg (sky, far, mid, main layers with parallax), svg under (screen-space
 *   backdrops: focus lines or speed lines that replace the location), div whtml (world-space HTML, the
 *   chalk text), svg chars (world layers: aura, chars, front, world fx), svg over (screen-space lines,
 *   enter streaks). Film level, above all shots: svg ffx (impact burst lines, the eye cut-in strip),
 *   div letter (title cards, callouts, subtitles, stats, bubbles), a flash div and a stripe-wipe svg.
 * - World units per shot: the frame is 1000 units tall and Ww = 1000 * W / H wide. The camera is
 *   { x, y, zoom } in world units; a layer with parallax factor f is drawn with matrix
 *   scale k * (1 + (zoom - 1) * f) around the camera, plus the shot's enter move and shakes.
 * - Characters: ONE rig shared by the cast. Head centre is (0, 0) in local units (skull top -114,
 *   chin +114, half width 88). Bust = head + neck + torso that runs off the frame bottom, two arms
 *   solved with 2-bone IK toward per-gesture hand targets. Chibi = the same head on a tiny body with
 *   one-bone arms. Mochi = a mascot blob. Cel shading = hard shadow shapes clipped to the head and the
 *   hair (no gradients on the cast). Faces: prebuilt eye sets (normal, happy arcs, stars, spirals,
 *   > <, tiny pupils, closed) switched per expression; brows and the mouth are paths rebuilt per frame
 *   from an expression vector plus visemes from V.words (syllable flaps).
 * - One V.onFrame function sets everything from t only: active shot, camera, layer matrices, every
 *   actor rig, effects, film overlays. No state carries between frames, so seeking works both ways.
 * - Timing: templates find their words (V.find, keyword props, the longest content word, then a
 *   narration estimate) and clamp every beat into [0.2, duration - 1].
 * No network, no timers, no wall clock; randomness only from V.makeRand and hashes of fixed seeds.
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
  var FONT = '"Segoe UI", "Helvetica Neue", Arial, "Noto Sans", system-ui, -apple-system, sans-serif';
  var INK = "#1F1A3A", ACC = "#FF4F8B", MUTED = "#6C6A9C", BG = "#FDF6FF", GOLD = "#FFC93C";
  var PORT = V.isPortrait, SQUARE = V.isSquare;

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
  function mod(a, b) { return ((a % b) + b) % b; }
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
  function isColor(c) { c = str(c); return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c) || /^(rgb|hsl)a?\(/i.test(c) || /^[a-z]{3,20}$/i.test(c); }
  function hex6(c) { c = str(c); if (/^#[0-9a-f]{3}$/i.test(c)) return "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]; return c; }

  // ------------------------- easing -------------------------
  var CE = {
    // smear: fast start, tiny overshoot (anime key-to-key move)
    smear: function (p) {
      if (p <= 0) return 0;
      if (p >= 1) return 1;
      var q = p - 1, c = 1.9;
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
  function EZ(e) { if (typeof e === "function") return e; return (e && (CE[e] || V.ease[e])) || V.ease.inOutCubic; }

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
    return (kind === "soft" ? CE.soft : CE.snap)(clamp((t - at) / (dur || 0.3), 0, 1));
  }

  // ------------------------- text -------------------------
  var mctx = null;
  function measure(text, size, weight, italic) {
    if (!mctx) mctx = doc.createElement("canvas").getContext("2d");
    mctx.font = (italic ? "italic " : "") + (weight || 800) + " " + size + "px " + FONT;
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
  function wrapGreedy(words, size, maxW, weight, it) {
    var lines = [], cur = [], cw = 0, sp = measure(" ", size, weight, it);
    words.forEach(function (wd) {
      var ww = measure(wd.w, size, weight, it);
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
    var words = Array.isArray(text) ? text : parseRich(text), size = o.size || 48, minSize = o.minSize || size * 0.45;
    var maxW = o.maxWidth || 600, maxLines = o.maxLines || 3, weight = o.weight || 800, lh = o.lh || 1.12, it = !!o.italic;
    var lines;
    for (var guard = 0; guard < 40; guard++) {
      lines = wrapGreedy(words, size, maxW, weight, it);
      var widest = 0;
      words.forEach(function (wd) { widest = Math.max(widest, measure(wd.w, size, weight, it)); });
      var hOk = !o.maxHeight || lines.length * size * lh <= o.maxHeight;
      if ((lines.length <= maxLines && widest <= maxW && hOk) || size <= minSize) break;
      size = Math.max(minSize, size * 0.93);
    }
    if (lines.length > 1) {
      var lo = maxW * 0.35, hi = maxW, n = lines.length;
      for (var i = 0; i < 14; i++) {
        var mid = (lo + hi) / 2, l2 = wrapGreedy(words, size, mid, weight, it), ok = l2.length <= n;
        l2.forEach(function (l) { if (l.words.length === 1 && measure(l.words[0].w, size, weight, it) > mid) ok = false; });
        if (ok) hi = mid; else lo = mid;
      }
      lines = wrapGreedy(words, size, hi + 0.5, weight, it);
    }
    var w = 0;
    lines.forEach(function (l) { w = Math.max(w, l.w); });
    return { size: size, lines: lines, w: w, h: lines.length * size * lh, lh: lh, weight: weight };
  }
  function fillRich(el, lay, cls) {
    var spans = [];
    lay.lines.forEach(function (l, li) {
      var line = div("an-line", el);
      l.words.forEach(function (wd, wi) {
        if (wi) line.appendChild(doc.createTextNode(" "));
        var s = doc.createElement("span");
        s.className = (cls || "an-w") + (wd.em ? " an-em" : "");
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
  // Times for a list of {label, word} items in order: keyword, else label words, else spread.
  function planTimes(items, o) {
    o = o || {};
    var prev = o.after || 0, out = [];
    items.forEach(function (it) {
      var t = labelTime(it.label, it.word, prev);
      if (t != null && t < prev - 0.01) t = null;
      out.push(t);
      if (t != null) prev = t + 0.05;
    });
    out = spread(out, o.a, o.b);
    var gap = o.gap == null ? 0.3 : o.gap;
    for (var i = 1; i < out.length; i++) if (out[i] < out[i - 1] + gap) out[i] = out[i - 1] + gap;
    // compress if the last one runs past the end
    var lim = o.limit == null ? endLimit() - 0.3 : o.limit;
    if (out.length && out[out.length - 1] > lim) {
      var a0 = Math.min(out[0], lim), k = out.length > 1 ? (lim - a0) / Math.max(0.01, out[out.length - 1] - out[0]) : 0;
      out = out.map(function (t) { return a0 + (t - out[0]) * k; });
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
  // Narration phrases (for subtitles and lip-sync): split at punctuation, long gaps or 7 words.
  function phrases(from, to, maxWords) {
    var ws = V.words || [], out = [], cur = null;
    maxWords = maxWords || 7;
    from = from == null ? 0 : from; to = to == null ? 1e9 : to;
    for (var i = 0; i < ws.length; i++) {
      var w = ws[i];
      if (w.start < from - 0.05 || w.start >= to) continue;
      if (cur && (w.start - cur.end > 0.55 || cur.words.length >= maxWords)) { out.push(cur); cur = null; }
      if (!cur) cur = { start: w.start, end: w.end, words: [] };
      cur.words.push(w);
      cur.end = w.end;
      if (/[.!?;:,]$/.test(w.word) && cur.words.length >= 2) { out.push(cur); cur = null; }
      else if (/[.!?]$/.test(w.word)) { out.push(cur); cur = null; }
    }
    if (cur) out.push(cur);
    // avoid tiny trailing phrases: merge a one-word phrase into its neighbour
    for (var j = out.length - 1; j > 0; j--) {
      if (out[j].words.length === 1 && out[j - 1].words.length < maxWords + 2 && out[j].start - out[j - 1].end < 0.4) {
        out[j - 1].words = out[j - 1].words.concat(out[j].words); out[j - 1].end = out[j].end; out.splice(j, 1);
      }
    }
    out.forEach(function (p) { p.text = p.words.map(function (w) { return w.word; }).join(" "); });
    return out;
  }
  // A cut time near `target` that falls between two phrases (so a line is not split mid-word).
  function cutNear(target, lo, hi) {
    var ps = phrases(), best = null, bd = 1e9;
    for (var i = 1; i < ps.length; i++) {
      var c = (ps[i - 1].end + ps[i].start) / 2;
      if (c < lo || c > hi) continue;
      var d = Math.abs(c - target);
      if (d < bd) { bd = d; best = ps[i].start - 0.04; }
    }
    return best == null ? clamp(target, lo, hi) : best;
  }

  // ------------------------- svg markup helpers -------------------------
  function R(x, y, w, h, fill, rx, ex) { return '<rect x="' + f1(x) + '" y="' + f1(y) + '" width="' + f1(Math.max(0, w)) + '" height="' + f1(Math.max(0, h)) + '"' + (rx ? ' rx="' + rx + '"' : "") + ' fill="' + fill + '"' + (ex || "") + "/>"; }
  function C(x, y, r, fill, ex) { return '<circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="' + f1(r) + '" fill="' + fill + '"' + (ex || "") + "/>"; }
  function E(x, y, rx, ry, fill, ex) { return '<ellipse cx="' + f1(x) + '" cy="' + f1(y) + '" rx="' + f1(rx) + '" ry="' + f1(ry) + '" fill="' + fill + '"' + (ex || "") + "/>"; }
  function P(d, fill, ex) { return '<path d="' + d + '" fill="' + fill + '"' + (ex || "") + "/>"; }
  function L(x1, y1, x2, y2, stroke, w, ex) { return '<path d="M' + f1(x1) + " " + f1(y1) + "L" + f1(x2) + " " + f1(y2) + '" stroke="' + stroke + '" stroke-width="' + w + '" stroke-linecap="round" fill="none"' + (ex || "") + "/>"; }
  function SK(c, w) { return ' stroke="' + (c || INK) + '" stroke-width="' + (w == null ? 4 : w) + '" stroke-linejoin="round" stroke-linecap="round"'; }
  function starD(cx, cy, R0, r0, n, rot) {
    var s = "";
    for (var i = 0; i < n * 2; i++) { var a = rad((rot == null ? -90 : rot) + (i * 180) / n), rr = i % 2 ? r0 : R0; s += (i ? "L" : "M") + f1(cx + Math.cos(a) * rr) + " " + f1(cy + Math.sin(a) * rr); }
    return s + "Z";
  }
  function sparkD(cx, cy, r) { // four-point anime sparkle
    var k = r * 0.22;
    return "M" + f1(cx) + " " + f1(cy - r) + "Q" + f1(cx + k) + " " + f1(cy - k) + " " + f1(cx + r) + " " + f1(cy) + "Q" + f1(cx + k) + " " + f1(cy + k) + " " + f1(cx) + " " + f1(cy + r) + "Q" + f1(cx - k) + " " + f1(cy + k) + " " + f1(cx - r) + " " + f1(cy) + "Q" + f1(cx - k) + " " + f1(cy - k) + " " + f1(cx) + " " + f1(cy - r) + "Z";
  }
  var uidN = 0;
  function uid(p) { return "an" + (p || "") + ++uidN; }

  // ------------------------- icons (100 x 100, flat with ink outline) -------------------------
  var O4 = SK(INK, 5);
  var ICONS = {
    lightbulb: P("M50 8C29 8 18 24 18 40C18 54 28 60 32 70H68C72 60 82 54 82 40C82 24 71 8 50 8Z", "#FFE066", O4) + R(33, 70, 34, 16, "#C9CEE0", 4, O4) + L(42, 93, 58, 93, INK, 6) + P("M38 30Q42 20 52 18", "none", SK("#FFFFFF", 5)),
    rocket: P("M50 4C66 18 72 38 68 62H32C28 38 34 18 50 4Z", "#FFFFFF", O4) + C(50, 34, 9, "#7FD6FF", O4) + P("M32 50L16 70L32 66Z M68 50L84 70L68 66Z", ACC, O4) + P("M38 64L50 96L62 64Z", GOLD, O4),
    brain: P("M50 18C40 6 18 12 18 30C6 36 8 56 18 60C16 76 36 86 50 76C64 86 84 76 82 60C92 56 94 36 82 30C82 12 60 6 50 18Z", "#FFB3CC", O4) + P("M50 18V76M32 32Q40 38 34 46M68 32Q60 38 66 46M28 58Q38 56 40 64M72 58Q62 56 60 64", "none", SK("#D9608C", 4)),
    star: P(starD(50, 54, 44, 19, 5), GOLD, O4) + P("M36 40L44 38", "none", SK("#FFF2B3", 5)),
    heart: P("M50 86 C20 64 6 46 10 30 C14 14 36 10 50 28 C64 10 86 14 90 30 C94 46 80 64 50 86Z", "#FF5C8A", O4) + P("M26 32Q28 24 36 22", "none", SK("#FFFFFF", 5)),
    target: C(50, 50, 40, "#FF5C7A", O4) + C(50, 50, 28, "#FFFFFF") + C(50, 50, 16, "#FF5C7A") + C(50, 50, 6, "#FFFFFF") + P("M50 50L84 16", "none", SK(INK, 5)) + P("M76 12L88 12L88 24", "none", SK(INK, 5)),
    bolt: P("M58 4L18 56H46L38 96L82 40H54Z", GOLD, O4),
    book: R(16, 12, 68, 78, "#5B7CFA", 6, O4) + R(24, 12, 6, 78, "#3F5BD6") + R(38, 28, 36, 8, "#FFFFFF", 3) + R(38, 42, 26, 6, "#FFFFFF", 3),
    clock: C(50, 50, 40, "#FFFFFF", O4) + C(50, 50, 33, "#F2EEFF") + P("M50 50V26M50 50L66 60", "none", SK(INK, 6)) + C(50, 50, 4, INK) + R(44, 4, 12, 8, ACC, 2, O4),
    trophy: P("M28 12H72V36Q72 60 50 62Q28 60 28 36Z", GOLD, O4) + P("M28 20H14Q12 40 30 44M72 20H86Q88 40 70 44", "none", O4) + R(44, 62, 12, 14, "#E0A21C", 0, O4) + R(28, 76, 44, 14, "#7A5BD6", 4, O4),
    calendar: R(10, 16, 80, 74, "#FFFFFF", 8, O4) + P("M10 24Q10 16 18 16H82Q90 16 90 24V36H10Z", ACC) + R(10, 16, 80, 74, "none", 8, O4) + R(26, 8, 8, 18, INK, 3) + R(66, 8, 8, 18, INK, 3) + R(22, 46, 12, 10, "#C9CEE0", 2) + R(44, 46, 12, 10, "#C9CEE0", 2) + R(66, 46, 12, 10, ACC, 2) + R(22, 66, 12, 10, "#C9CEE0", 2) + R(44, 66, 12, 10, "#C9CEE0", 2),
    droplet: P("M50 6C66 30 80 46 80 62C80 80 66 92 50 92C34 92 20 80 20 62C20 46 34 30 50 6Z", "#4FA8FF", O4) + P("M36 60Q34 72 44 78", "none", SK("#FFFFFF", 5)),
    fire: P("M50 6C58 26 80 34 80 60C80 80 66 94 50 94C34 94 20 80 20 60C20 44 30 36 36 22C40 34 44 38 48 40C48 26 46 18 50 6Z", "#FF6A3C", O4) + P("M50 50C56 60 66 64 64 76C62 86 56 90 50 90C42 90 36 84 36 76C36 66 44 62 50 50Z", "#FFD24A"),
    sword: P("M50 4L60 16V66H40V16Z", "#E6ECFF", O4) + L(50, 16, 50, 62, "#B7C2E8", 4) + R(26, 64, 48, 10, GOLD, 4, O4) + R(44, 74, 12, 18, "#7A5BD6", 3, O4) + C(50, 94, 6, GOLD, O4),
    shield: P("M50 6L88 20V46C88 70 70 86 50 94C30 86 12 70 12 46V20Z", "#5B7CFA", O4) + P("M50 16L78 26V46C78 64 66 76 50 82Z", "#86A0FF") + P("M34 50L46 62L68 38", "none", SK("#FFFFFF", 9)),
    coin: C(50, 50, 40, GOLD, O4) + C(50, 50, 29, "#FFD966", SK("#E0A21C", 4)) + '<text x="50" y="63" text-anchor="middle" font-size="38" font-weight="900" fill="#C98A10" font-family="Arial, sans-serif">$</text>',
    money: R(6, 24, 88, 52, "#8BDC9A", 8, O4) + C(50, 50, 15, "#C6F0CF", SK("#3E9A55", 3)) + '<text x="50" y="58" text-anchor="middle" font-size="24" font-weight="900" fill="#2F7A44" font-family="Arial, sans-serif">$</text>',
    chart: P("M12 10V88H92", "none", SK(INK, 6)) + R(22, 56, 16, 30, "#7FD6FF", 3, O4) + R(44, 40, 16, 46, GOLD, 3, O4) + R(66, 20, 16, 66, ACC, 3, O4),
    check: C(50, 50, 40, "#3CCB8B", O4) + P("M30 52L44 66L72 36", "none", SK("#FFFFFF", 10)),
    cross: C(50, 50, 40, "#FF5C6C", O4) + P("M34 34L66 66M66 34L34 66", "none", SK("#FFFFFF", 10)),
    question: C(50, 50, 40, "#9B7BFF", O4) + '<text x="50" y="68" text-anchor="middle" font-size="52" font-weight="900" fill="#FFFFFF" font-family="Arial, sans-serif">?</text>',
    music: P("M36 74V22L80 12V64", "none", SK(INK, 7)) + E(28, 76, 13, 10, ACC, O4) + E(72, 66, 13, 10, ACC, O4),
    leaf: P("M16 84C16 40 44 14 86 14C86 56 60 84 16 84Z", "#6CD48A", O4) + P("M16 84L62 38", "none", SK("#2F8A4E", 4)),
    moon: P("M62 8C38 12 22 32 22 54C22 76 40 92 62 92C74 92 84 88 90 80C64 80 48 62 48 40C48 26 54 14 62 8Z", "#FFE38A", O4),
    sun: C(50, 50, 22, GOLD, O4) + P("M50 8V18M50 82V92M8 50H18M82 50H92M20 20L27 27M73 73L80 80M80 20L73 27M27 73L20 80", "none", SK(INK, 5)),
    globe: C(50, 50, 40, "#6EC6FF", O4) + P("M28 24Q40 22 42 34Q38 44 26 44Q18 40 16 34Q20 26 28 24Z M56 30Q70 26 80 38Q82 50 72 54Q62 50 58 58Q50 62 48 52Q52 40 56 30Z M40 66Q52 64 58 74Q54 84 44 86Q36 78 40 66Z", "#7ED37A"),
    key: C(28, 50, 20, GOLD, O4) + C(28, 50, 8, "#FFF6E8", SK(INK, 4)) + P("M46 50H92M78 50V64M90 50V60", "none", SK(INK, 13)) + P("M46 50H92M78 50V64M90 50V60", "none", SK(GOLD, 6)),
    lock: P("M30 46V32Q30 12 50 12Q70 12 70 32V46", "none", SK(INK, 9)) + P("M30 46V32Q30 12 50 12Q70 12 70 32V46", "none", SK("#C9CEE0", 4)) + R(18, 44, 64, 46, GOLD, 8, O4) + C(50, 62, 6, INK) + R(47, 62, 6, 14, INK, 2),
    flask: P("M38 8H62M42 8V38L16 84Q14 92 24 92H76Q86 92 84 84L58 38V8", "#FFFFFF", O4) + P("M28 66H72L82 86Q82 90 76 90H24Q18 90 20 86Z", "#B98CFF") + C(44, 76, 4, "#FFFFFF") + C(58, 70, 3, "#FFFFFF"),
    sakura: (function () { var s = ""; for (var i = 0; i < 5; i++) { var a = rad(-90 + i * 72); s += E(50 + Math.cos(a) * 22, 50 + Math.sin(a) * 22, 17, 13, "#FFB7D0", O4.replace('stroke-width="5"', 'stroke-width="4"') + ' transform="rotate(' + (i * 72) + " " + f1(50 + Math.cos(a) * 22) + " " + f1(50 + Math.sin(a) * 22) + ')"'); } return s + C(50, 50, 9, "#FF7AA8", SK(INK, 3)); })(),
    gift: R(12, 38, 76, 50, "#FF5C8A", 4, O4) + R(8, 28, 84, 16, "#FF86A8", 4, O4) + R(44, 28, 12, 60, GOLD, 0, SK(INK, 3)) + P("M50 28C36 8 22 18 36 28M50 28C64 8 78 18 64 28", GOLD, O4),
    phone: R(30, 6, 40, 88, "#2A2650", 9, O4) + R(35, 16, 30, 62, "#7FD6FF", 3) + C(50, 85, 3.5, MUTED),
    eye: P("M6 50Q50 4 94 50Q50 96 6 50Z", "#FFFFFF", O4) + C(50, 50, 20, "#7E5BD6", O4) + C(50, 50, 9, INK) + C(43, 43, 5, "#FFFFFF"),
    chat: P("M10 18Q10 10 18 10H82Q90 10 90 18V62Q90 70 82 70H40L20 88V70H18Q10 70 10 62Z", "#FFFFFF", O4) + C(32, 40, 5, INK) + C(50, 40, 5, INK) + C(68, 40, 5, INK),
    gem: P("M24 18H76L94 40L50 92L6 40Z", "#7FE3FF", O4) + P("M6 40H94M24 18L38 40L50 92L62 40L76 18M38 40L50 18L62 40", "none", SK(INK, 3)),
  };
  var ICON_SYN = { idea: "lightbulb", bulb: "lightbulb", light: "lightbulb", launch: "rocket", growth: "rocket", mind: "brain", think: "brain", memory: "brain", love: "heart", health: "heart", goal: "target", aim: "target", focus: "target", energy: "bolt", power: "bolt", lightning: "bolt", read: "book", study: "book", learn: "book", time: "clock", watch: "clock", award: "trophy", win: "trophy", prize: "trophy", date: "calendar", schedule: "calendar", plan: "calendar", water: "droplet", drop: "droplet", blood: "droplet", hot: "fire", flame: "fire", fight: "sword", battle: "sword", safe: "shield", protect: "shield", defense: "shield", dollar: "money", cash: "money", savings: "coin", gold: "coin", graph: "chart", stats: "chart", data: "chart", yes: "check", done: "check", ok: "check", no: "cross", wrong: "cross", help: "question", why: "question", song: "music", nature: "leaf", plant: "leaf", night: "moon", sleep: "moon", rest: "moon", day: "sun", world: "globe", earth: "globe", unlock: "key", secure: "lock", science: "flask", lab: "flask", flower: "sakura", blossom: "sakura", present: "gift", mobile: "phone", see: "eye", vision: "eye", talk: "chat", message: "chat", diamond: "gem", crystal: "gem" };
  function iconKey(n) { n = str(n).toLowerCase(); if (ICONS[n]) return n; if (ICON_SYN[n]) return ICON_SYN[n]; return null; }
  function iconSvg(name, px) {
    var k = iconKey(name) || "star";
    return '<svg class="an-icon" viewBox="-4 -4 108 108" width="' + f1(px || 64) + '" height="' + f1(px || 64) + '" xmlns="' + NS + '">' + ICONS[k] + "</svg>";
  }

  // ------------------------- the cast -------------------------
  var CAST = {
    hikari: { name: "Hikari", skin: "#FFE4D6", skinD: "#F3B9A8", hair: "#FF86B6", hairD: "#E05A90", hairH: "#FFC9DE", eye: "#E8407E", eyeD: "#8A1747", brow: "#C9467A",
      outfit: "sailor", top: "#FFFFFF", topD: "#D7DCF0", trim: "#2B3567", trim2: "#E8344E", aura: "pink", color: "#FF4F8B", hairStyle: "bob" },
    ren: { name: "Ren", skin: "#FFE7DA", skinD: "#EDBCAB", hair: "#D7DBEA", hairD: "#9EA6C4", hairH: "#FFFFFF", eye: "#2FA6CC", eyeD: "#10546E", brow: "#8A91AE",
      outfit: "coat", top: "#FFFFFF", topD: "#D3D9EC", trim: "#9CC3F5", trim2: "#2B3567", aura: "cyan", color: "#2FB8E0", hairStyle: "neat", glasses: true },
    kaito: { name: "Kaito", skin: "#FBDCC8", skinD: "#E3AE96", hair: "#2E3F80", hairD: "#1A2554", hairH: "#6382D6", eye: "#F0742E", eyeD: "#8A3210", brow: "#1A2554",
      outfit: "jacket", top: "#25273A", topD: "#15161F", trim: "#FFFFFF", trim2: "#E8344E", aura: "gold", color: "#FFB020", hairStyle: "spiky", headband: true },
    yuki: { name: "Yuki", skin: "#FFE8DE", skinD: "#F0BFAF", hair: "#2E2546", hairD: "#1A1530", hairH: "#7062A0", eye: "#8A63E6", eyeD: "#3B2585", brow: "#2E2546",
      outfit: "cardigan", top: "#EBD5A9", topD: "#CDAF7C", trim: "#FFFFFF", trim2: "#3F6FD8", aura: "violet", color: "#8A63E6", hairStyle: "hime" },
    mochi: { name: "Mochi", skin: "#FFFFFF", skinD: "#DCD8F0", hair: "#FFFFFF", hairD: "#DCD8F0", hairH: "#FFFFFF", eye: "#2A2140", eyeD: "#140F26", brow: "#2A2140",
      outfit: "none", top: "#FFFFFF", topD: "#DCD8F0", trim: "#FFB7CF", trim2: GOLD, aura: "gold", color: GOLD, mascot: true },
  };
  var CAST_IDS = ["hikari", "ren", "kaito", "yuki", "mochi"];
  var CAST_SYN = { hero: "hikari", protagonist: "hikari", narrator: "hikari", student: "hikari", mentor: "ren", teacher: "ren", genius: "ren", expert: "ren", rival: "kaito", friend: "kaito", classmate: "yuki", mascot: "mochi", pet: "mochi", bunny: "mochi", cat: "mochi" };
  function castKey(n, def) { n = str(n).toLowerCase(); return CAST[n] ? n : CAST_SYN[n] || def || "hikari"; }
  var AURAS = { pink: ["#FF5C9A", "#FFC2DA"], gold: ["#FFB020", "#FFF0A0"], cyan: ["#21C8F0", "#C4F4FF"], violet: ["#9A6BFF", "#E2D4FF"], green: ["#2FD483", "#C9FFE2"], red: ["#FF4A4A", "#FFD0C0"], blue: ["#3F7CFF", "#CFE0FF"] };
  function auraCols(name, cd) { var k = str(name).toLowerCase(); if (AURAS[k]) return AURAS[k]; if (isColor(name)) return [name, "#FFFFFF"]; return AURAS[(cd && cd.aura) || "pink"]; }

  // ------------------------- expressions -------------------------
  // eye: normal|happy|star|spiral|xx|tiny|closed. lid 0..1, by brow y, ba brow anger (+ inner down),
  // sm smile (-1..1), mo base open, mw mouth half width, mouth: line|grit|wavy|cat|o, marks list, pu pupil scale.
  var EXZ = { eye: "normal", lid: 0.06, by: 0, ba: 0, sm: 0.15, mo: 0, mw: 15, mouth: "line", marks: [], pu: 1, blush: 0 };
  var EXPR = {
    neutral: {},
    smile: { lid: 0.12, sm: 0.75, by: -2, blush: 0.25 },
    happy: { eye: "happy", sm: 1, mo: 0.5, mw: 18, by: -4, blush: 0.45 },
    excited: { eye: "star", sm: 1, mo: 0.62, mw: 19, by: -8, marks: ["sparkles"], blush: 0.35 },
    sparkle: { eye: "star", sm: 0.85, mo: 0.28, mw: 16, by: -6, marks: ["sparkles"], blush: 0.3 },
    shocked: { eye: "tiny", by: -16, ba: -0.5, sm: -0.4, mo: 0.75, mw: 14, mouth: "o", marks: ["gloom"] },
    surprised: { pu: 0.62, lid: 0, by: -15, ba: -0.3, sm: 0, mo: 0.55, mw: 12, mouth: "o" },
    determined: { lid: 0.3, by: 6, ba: 1, sm: -0.15, mw: 19, mouth: "grit" },
    serious: { lid: 0.26, by: 5, ba: 0.55, sm: -0.2, mw: 13 },
    "sweat-drop": { lid: 0.1, by: -6, ba: -0.5, sm: 0.35, mw: 16, mouth: "wavy", marks: ["sweat"] },
    panic: { eye: "spiral", by: -14, ba: -0.7, sm: -0.3, mo: 0.45, mw: 17, mouth: "wavy", marks: ["sweat"], blush: 0.2 },
    flustered: { eye: "xx", by: -8, ba: -0.4, sm: 0.1, mo: 0.2, mw: 15, mouth: "wavy", blush: 1, marks: ["hatch"] },
    sad: { lid: 0.2, by: -5, ba: -0.9, sm: -0.65, mw: 13, marks: ["tears"] },
    angry: { lid: 0.32, by: 8, ba: 1.25, sm: -0.4, mo: 0.2, mw: 18, mouth: "grit", marks: ["vein"] },
    smug: { lid: 0.46, by: 2, ba: 0.35, sm: 0.65, mw: 15, mouth: "cat" },
    calm: { lid: 0.4, by: -1, sm: 0.3, mw: 13 },
    thinking: { lid: 0.16, by: -5, ba: -0.25, sm: -0.12, mw: 10, marks: ["dots"] },
    embarrassed: { lid: 0.2, by: -5, ba: -0.55, sm: 0.25, mw: 13, mouth: "wavy", blush: 1, marks: ["hatch", "sweat"] },
    sleepy: { eye: "closed", by: 2, sm: 0, mo: 0.12, mw: 11, mouth: "o", marks: ["zz"] },
  };
  var EXPR_SYN = { happy2: "happy", joy: "happy", glad: "happy", laugh: "happy", star: "sparkle", stars: "sparkle", shock: "shocked", scared: "panic", afraid: "panic", nervous: "sweat-drop", awkward: "sweat-drop", sweat: "sweat-drop", sweatdrop: "sweat-drop", mad: "angry", proud: "smug", confident: "smug", focused: "determined", fierce: "determined", upset: "sad", cry: "sad", crying: "sad", shy: "embarrassed", blush: "embarrassed", tired: "sleepy", curious: "thinking", think: "thinking", confused: "thinking", wow: "surprised", surprise: "surprised" };
  function exKey(n, def) { n = str(n).toLowerCase(); return EXPR[n] ? n : EXPR_SYN[n] || (def === undefined ? "neutral" : def); }
  function exprVec(n) { var p = EXPR[exKey(n)], o = {}; for (var k in EXZ) o[k] = p[k] != null ? p[k] : EXZ[k]; return o; }

  // ------------------------- gestures -------------------------
  // Hand targets in head-local units (bust: shoulders at (+-150, 200), arm reach 310).
  // r/l = [x, y, hand]; hand: open|fist|point|peace|thumb. abs = do not mirror when facing left.
  var REST_R = [182, 520, "open"], REST_L = [-182, 520, "open"];
  var GEST = {
    rest: { r: REST_R, l: REST_L },
    fist: { r: [104, 262, "fist"], l: REST_L },
    "fist-up": { r: [214, -86, "fist"], l: REST_L },
    point: { r: [444, 236, "point"], l: REST_L },
    "point-left": { r: REST_R, l: [-444, 236, "point"], abs: true },
    "point-up": { r: [214, -74, "point"], l: REST_L },
    think: { r: [42, 146, "fist"], l: [-60, 330, "fist"] },
    wave: { r: [262, -36, "open"], l: REST_L, wave: 1 },
    peace: { r: [152, 14, "peace"], l: REST_L },
    thumbs: { r: [146, 250, "thumb"], l: REST_L },
    cheer: { r: [222, -96, "fist"], l: [-222, -96, "fist"] },
    panic: { r: [104, 64, "open"], l: [-104, 64, "open"] },
    glasses: { r: [20, 46, "point"], l: REST_L },
    explain: { r: [276, 300, "open"], l: REST_L },
    present: { r: [396, 322, "open"], l: REST_L },
    cross: { r: [-72, 318, "fist"], l: [74, 330, "fist"] },
    clasp: { r: [16, 268, "fist"], l: [-16, 268, "fist"] },
    ready: { r: [122, 236, "fist"], l: [-46, 206, "fist"] },
    punch: { r: [452, 176, "fist"], l: [-40, 230, "fist"] },
    "punch-left": { r: [40, 230, "fist"], l: [-452, 176, "fist"], abs: true },
  };
  var GEST_SYN = { idle: "rest", none: "rest", "fist-pump": "fist-up", pump: "fist-up", pointing: "point", "point-right": "point", up: "point-up", hmm: "think", thinking: "think", hello: "wave", hi: "wave", v: "peace", victory: "peace", "thumbs-up": "thumbs", thumb: "thumbs", celebrate: "cheer", hooray: "cheer", scared: "panic", "push-glasses": "glasses", teach: "explain", show: "present", "arms-crossed": "cross", crossed: "cross", pray: "clasp", fight: "ready", stance: "ready", attack: "punch", hit: "punch" };
  function gKey(n) { n = str(n).toLowerCase(); return GEST[n] ? n : GEST_SYN[n] || "rest"; }
  // Chibi / mascot arms: one bone, angle in degrees (0 = down, 90 = out sideways, 180 = up), per side.
  var CHIBI_ARMS = {
    rest: [18, 18], fist: [120, 18], "fist-up": [168, 18], point: [96, 18], "point-left": [18, 96], "point-up": [170, 18], think: [140, 30],
    wave: [150, 18], peace: [150, 18], thumbs: [110, 18], cheer: [160, 160], panic: [148, 148], glasses: [150, 18], explain: [80, 18], present: [100, 30],
    cross: [60, 60], clasp: [40, 40], ready: [110, 80], punch: [92, 40], "punch-left": [40, 92],
  };
  function ik(sx, sy, tx, ty, l1, l2, outward) {
    var dx = tx - sx, dy = ty - sy, d = Math.sqrt(dx * dx + dy * dy) || 1;
    d = clamp(d, Math.abs(l1 - l2) + 1, l1 + l2 - 1);
    var a = Math.atan2(dy, dx), cb = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1), b = Math.acos(cb);
    var e1 = [sx + Math.cos(a + b) * l1, sy + Math.sin(a + b) * l1], e2 = [sx + Math.cos(a - b) * l1, sy + Math.sin(a - b) * l1];
    function score(e) { return e[1] + (e[0] - sx) * outward * 0.45; }
    var el = score(e1) >= score(e2) ? e1 : e2;
    var hx = sx + Math.cos(a) * d, hy = sy + Math.sin(a) * d;
    return { e: el, h: [hx, hy] };
  }

  // ------------------------- hair & outfits (static markup, head-local units) -------------------------
  var HAIR = {
    bob: {
      back: "M-106 -18C-114 -112 -60 -152 0 -152C60 -152 114 -112 106 -18L116 74L94 58L100 112L72 86L44 106L20 70L-20 70L-44 106L-72 86L-100 112L-94 58L-116 74Z",
      front: "M-102 -6C-106 -102 -52 -144 0 -144C52 -144 106 -102 102 -6L86 -34L76 4L58 -40L42 -12L28 -50L8 -20L-10 -54L-26 -18L-42 -52L-58 -16L-72 -48L-88 0Z",
      locks: "M86 -46L106 -32L110 62L98 98L88 44L82 -2Z M-86 -46L-106 -32L-110 62L-98 98L-88 44L-82 -2Z",
      ring: "M-72 -104Q0 -136 72 -104",
    },
    neat: {
      back: "M-102 -10C-110 -112 -56 -152 0 -152C60 -152 110 -112 102 -10L100 66L82 44L72 76L-72 76L-82 44L-100 66Z",
      front: "M-102 4C-108 -100 -52 -148 10 -146C68 -144 108 -102 102 -4L92 -44C74 -66 42 -76 14 -66C40 -46 40 -22 30 -4C12 -42 -26 -60 -58 -46C-68 -32 -80 -12 -88 12Z",
      locks: "M88 -40L104 -22L104 44L92 64L88 10Z M-88 -36L-104 -18L-104 40L-94 60L-90 14Z",
      ring: "M-66 -110Q0 -138 66 -110",
    },
    spiky: {
      back: "M-108 4L-154 -56L-116 -80L-146 -150L-80 -128L-72 -192L-26 -148L8 -204L36 -148L88 -184L86 -122L144 -134L114 -72L154 -30L108 -2L106 54L-106 54Z",
      front: "M-100 -8C-102 -100 -52 -138 0 -138C52 -138 102 -100 100 -8L82 -30L74 8L54 -36L32 -6L18 -46L-4 -10L-20 -48L-40 -6L-56 -44L-78 2Z",
      locks: "M88 -40L106 -26L104 30L92 50L88 4Z M-88 -40L-106 -26L-104 30L-92 50L-88 4Z",
      ring: "M-64 -106Q0 -132 64 -106",
    },
    hime: {
      back: "M-110 -18C-118 -118 -62 -154 0 -154C62 -154 118 -118 110 -18L134 430L-134 430Z",
      front: "M-104 -2C-108 -104 -54 -146 0 -146C54 -146 108 -104 104 -2L96 -30L58 -28L30 -30L0 -28L-30 -30L-58 -28L-96 -30Z",
      locks: "M78 -36L108 -36L108 116L78 116Z M-78 -36L-108 -36L-108 116L-78 116Z",
      ring: "M-74 -106Q0 -138 74 -106",
    },
  };
  function headPathD(f) {
    var cx = f * 10;
    return "M-87 -12C-89 -84 -48 -116 0 -116C48 -116 89 -84 87 -12C85 34 64 72 " + f1(30 + cx) + " 98Q" + f1(cx) + " 118 " + f1(-30 + cx) + " 98C-64 72 -85 34 -87 -12Z";
  }
  var TORSO_D = "M-38 126C-92 138 -150 152 -168 216L-188 780L188 780L168 216C150 152 92 138 38 126Z";
  function torsoMarkup(cd) {
    var o = SK(INK, 4), m = "";
    m += P(TORSO_D, cd.top, o);
    m += P("M-168 222C-150 172 -112 158 -76 152L-104 780L-188 780Z", cd.topD);
    if (cd.outfit === "sailor") {
      m += P("M-44 126L-154 176L-164 268L-62 258L0 338L62 258L164 268L154 176L44 126L0 236Z", cd.trim, o);
      m += P("M-150 192L-152 252L-66 244L0 318L66 244L152 252L150 192", "none", SK("#FFFFFF", 5));
      m += P("M0 300L-44 280L-52 330L-10 318Z M0 300L44 280L52 330L10 318Z", cd.trim2, o) + P("M-14 312L-30 384L-6 366L0 320Z M14 312L30 384L6 366L0 320Z", cd.trim2, o) + C(0, 306, 13, shade(cd.trim2, 0.86), o);
    } else if (cd.outfit === "coat") {
      m += P("M-40 126L0 312L40 126Z", cd.trim, o);
      m += P("M-10 162H10L16 292L0 318L-16 292Z", cd.trim2, o);
      m += P("M-40 126L-12 320L-84 236L-70 150Z", cd.top, o) + P("M40 126L12 320L84 236L70 150Z", cd.top, o);
      m += P("M-70 150L-84 236L-92 230L-78 152Z", cd.topD);
      m += R(98, 330, 50, 10, "#9CC3F5", 3) + R(104, 318, 8, 30, "#3A3F5C", 3);
    } else if (cd.outfit === "jacket") {
      m += P("M-46 128L0 300L46 128Z", cd.trim, o) + P("M-26 200H26L22 222H-22Z", cd.trim2);
      m += P("M-46 128L-86 118L-106 178L-62 214Z", cd.top, o) + P("M46 128L86 118L106 178L62 214Z", cd.top, o);
      m += P("M-34 210L-8 780M34 210L8 780", "none", SK("#3B3E58", 4)) + R(-6, 260, 12, 520, "#9AA0C0", 2);
    } else if (cd.outfit === "cardigan") {
      m += P("M-42 126L0 262L42 126Z", cd.trim, o);
      m += P("M-42 126L-60 160L-20 214L0 262Z M42 126L60 160L20 214L0 262Z", "#FFFFFF", o);
      m += P("M0 262L-24 240L-30 270ZM0 262L24 240L30 270Z", cd.trim2, o) + C(0, 258, 8, shade(cd.trim2, 0.85), o);
      m += P("M-14 262L-30 780M14 262L30 780", "none", SK(shade(cd.top, 0.75), 4));
      [320, 400, 480].forEach(function (y) { m += C(-30, y, 6, "#FFFFFF", SK(INK, 2.5)); });
    }
    m += P(TORSO_D, "none", o);
    return m;
  }

  // ------------------------- actor build -------------------------
  // Eye sets for one side (s = -1 screen-left, 1 screen-right). Local x points outward.
  function buildEye(a, parent, s, scale) {
    var cd = a.cd, g = svg("g", null, parent), k = scale || 1;
    var cid = uid("ec");
    var cp = svg("clipPath", { id: cid }, a.defs);
    svg("ellipse", { cx: 0, cy: 0, rx: 25, ry: 31 }, cp);
    var e = { g: g, sets: {} };
    var inner = svg("g", { transform: (s < 0 ? "scale(-1 1)" : "") }, g);
    // normal
    var n = svg("g", null, inner);
    var nc = svg("g", { "clip-path": "url(#" + cid + ")" }, n);
    svg("ellipse", { cx: 0, cy: 0, rx: 25, ry: 31, fill: "#FFFFFF" }, nc);
    e.iris = svg("g", null, nc);
    e.iris.innerHTML = E(0, 2, 19, 25, cd.eyeD) + E(0, 8, 16, 19, cd.eye) + E(0, 4, 8, 12, cd.eyeD) + E(0, 15, 10, 5, tint(cd.eye, 0.45), ' opacity="0.8"') + C(-7, -9, 7.5, "#FFFFFF") + C(8, 11, 3.6, "#FFFFFF");
    svg("ellipse", { cx: 0, cy: 0, rx: 25, ry: 31, fill: "none", stroke: shade(cd.skinD, 0.85), "stroke-width": 3 }, nc);
    e.lid = svg("rect", { x: -32, y: -44, width: 64, height: 0, fill: cd.skin }, nc);
    e.lash = svg("path", { fill: INK }, n);
    svg("path", { d: "M2 30Q14 29 22 21", fill: "none", stroke: INK, "stroke-width": 3, "stroke-linecap": "round" }, n);
    e.sets.normal = n;
    // happy arcs
    var hp = svg("g", null, inner);
    hp.innerHTML = P("M-23 8Q0 -24 24 8", "none", SK(INK, 8));
    e.sets.happy = hp;
    // star eyes
    var stg = svg("g", null, inner);
    stg.innerHTML = E(0, 0, 25, 31, "#FFFFFF") + P(starD(0, 2, 24, 10, 5), cd.color === GOLD ? "#FFB020" : cd.eye, SK(cd.eyeD, 2.5)) + P(sparkD(-7, -9, 7), "#FFFFFF") + C(8, 12, 3, "#FFFFFF") + P("M-27 -14Q-4 -38 24 -24L34 -32L28 -18Q-4 -30 -27 -10Z", INK);
    e.sets.star = stg;
    // spiral
    var sp = svg("g", null, inner), sd = "";
    for (var i = 0; i <= 48; i++) { var an = i * 0.42, rr = 1 + i * 0.42; sd += (i ? "L" : "M") + f1(Math.cos(an) * rr) + " " + f1(Math.sin(an) * rr * 1.2); }
    sp.innerHTML = E(0, 0, 25, 31, "#FFFFFF", SK(INK, 2.5)) + P(sd, "none", SK(INK, 3.5));
    e.sets.spiral = sp;
    // > <
    var xx = svg("g", null, inner);
    xx.innerHTML = P("M18 -18L-16 2L18 20", "none", SK(INK, 8));
    e.sets.xx = xx;
    // tiny pupils (shocked)
    var ty = svg("g", null, inner);
    ty.innerHTML = E(0, 0, 25, 31, "#FFFFFF", SK(INK, 3)) + C(0, 2, 5, INK) + P("M-27 -30Q-2 -46 26 -34", "none", SK(INK, 5));
    e.sets.tiny = ty;
    // closed
    var cl = svg("g", null, inner);
    cl.innerHTML = P("M-22 2Q0 14 22 2", "none", SK(INK, 7)) + P("M20 2L30 -4", "none", SK(INK, 5));
    e.sets.closed = cl;
    e.cur = null;
    // brow (drawn later, above the bangs, into a.browG)
    e.brow = svg("path", { fill: "none", stroke: cd.brow, "stroke-width": 7, "stroke-linecap": "round" }, null);
    e.s = s; e.k = k;
    return e;
  }
  function lashD(yl, open) {
    var b = yl + 7, q = 10 * open;
    return "M-27 " + f1(b) + "Q-4 " + f1(yl - 7 - q) + " 24 " + f1(yl - 3) + "L35 " + f1(yl - 12) + "L28 " + f1(yl + 5) + "Q-4 " + f1(yl - 1 - q * 0.5) + " -27 " + f1(b + 2) + "Z";
  }
  function browD(by, ba) {
    var ix = -16, iy = -50 + by + ba * 10, ox = 30, oy = -57 + by - ba * 4, cy = -62 + by + ba * 2;
    return "M" + ix + " " + f1(iy) + "Q" + 8 + " " + f1(cy) + " " + ox + " " + f1(oy);
  }

  function buildMarks(a, parent) {
    var cd = a.cd, m = {}, g;
    var mascot = !!cd.mascot;
    g = svg("g", null, parent);
    g.innerHTML = P("M88 -70C80 -54 74 -44 74 -34C74 -24 81 -18 88 -18C95 -18 102 -24 102 -34C102 -44 96 -54 88 -70Z", "#8FD8FF", SK(INK, 3)) + P("M82 -34Q82 -28 87 -25", "none", SK("#FFFFFF", 3));
    m.sweat = g;
    g = svg("g", { transform: mascot ? "translate(-10 10)" : "" }, parent);
    g.innerHTML = P("M-74 -96Q-62 -86 -56 -98M-48 -106Q-56 -94 -46 -84M-62 -74Q-56 -86 -44 -80M-78 -86Q-66 -92 -72 -104", "none", SK("#FF3355", 5));
    m.vein = g;
    g = svg("g", null, parent);
    var gl = "";
    for (var i = 0; i < 7; i++) { var x = -64 + i * 21; gl += L(x, -98 + (i % 2) * 8, x, -46 - (i % 3) * 6, "#5A4C9A", 3.5, ' opacity="0.8"'); }
    g.innerHTML = P("M-87 -12C-89 -84 -48 -116 0 -116C48 -116 89 -84 87 -12Q0 6 -87 -12Z", "#4B3C8C", ' opacity="0.22"') + gl;
    m.gloom = g;
    g = svg("g", null, parent);
    g.innerHTML = P("M-44 34Q-48 70 -42 110Q-36 70 -36 34Z M44 34Q48 70 42 110Q36 70 36 34Z", "#A9E4FF", SK("#5AB6E6", 2) + ' opacity="0.9"');
    m.tears = g;
    m.tearsG = g;
    g = svg("g", null, parent);
    g.innerHTML = [-1, 1].map(function (s) { return L(s * 40, 40, s * 46, 52, "#E0507A", 3) + L(s * 50, 40, s * 56, 52, "#E0507A", 3) + L(s * 60, 40, s * 66, 52, "#E0507A", 3); }).join("");
    m.hatch = g;
    g = svg("g", null, parent);
    g.innerHTML = P(sparkD(-112, -96, 18), "#FFF07A", SK("#E0A21C", 2)) + P(sparkD(118, -60, 13), "#FFFFFF", SK("#9AB0FF", 2)) + P(sparkD(104, -124, 9), "#FFF07A", SK("#E0A21C", 1.5));
    m.sparkles = g;
    g = svg("g", null, parent);
    g.innerHTML = C(96, -96, 6, INK) + C(118, -112, 7, INK) + C(142, -130, 8, INK);
    m.dots = g;
    g = svg("g", null, parent);
    g.innerHTML = '<text x="96" y="-92" font-size="40" font-weight="900" fill="#7A6BD6" font-family="Arial, sans-serif" stroke="#FFFFFF" stroke-width="4" paint-order="stroke">Z</text><text x="128" y="-126" font-size="28" font-weight="900" fill="#7A6BD6" font-family="Arial, sans-serif" stroke="#FFFFFF" stroke-width="3" paint-order="stroke">z</text>';
    m.zz = g;
    for (var k in m) if (k !== "tearsG") showEl(m[k], false);
    return m;
  }

  function buildHead(a, parent) {
    var cd = a.cd, hs = HAIR[cd.hairStyle] || HAIR.bob, o = SK(INK, 4);
    var H_ = {};
    H_.g = svg("g", null, parent);
    // head skin + cel shadow under the bangs (clipped to the head)
    var hcid = uid("hc");
    var cp = svg("clipPath", { id: hcid }, a.defs);
    H_.clipPath = svg("path", { d: headPathD(0) }, cp);
    H_.skin = svg("path", { d: headPathD(0), fill: cd.skin, stroke: INK, "stroke-width": 4, "stroke-linejoin": "round" }, H_.g);
    H_.shadeG = svg("g", { "clip-path": "url(#" + hcid + ")" }, H_.g);
    H_.shadeG.innerHTML = P(hs.front, cd.skinD, ' transform="translate(6 16)"') + P("M-90 -40C-86 30 -64 76 -30 100L-66 130L-100 60Z", cd.skinD, ' opacity="0.85"');
    H_.blush = svg("g", null, H_.g);
    H_.blush.innerHTML = E(-52, 48, 19, 9, "#FF8FAE") + E(52, 48, 19, 9, "#FF8FAE");
    H_.feat = svg("g", null, H_.g);
    H_.eyes = [];
    [-1, 1].forEach(function (s) {
      var holder = svg("g", null, H_.feat);
      var e = buildEye(a, holder, s);
      e.holder = holder;
      H_.eyes.push(e);
    });
    H_.nose = svg("path", { d: "M2 38L6 47L0 48", fill: "none", stroke: shade(cd.skinD, 0.82), "stroke-width": 3, "stroke-linecap": "round", "stroke-linejoin": "round" }, H_.feat);
    H_.mouthG = svg("g", null, H_.feat);
    H_.mouth = svg("path", { fill: "none", stroke: INK, "stroke-width": 4, "stroke-linecap": "round", "stroke-linejoin": "round" }, H_.mouthG);
    H_.tongue = svg("ellipse", { fill: "#FF7A92" }, H_.mouthG);
    H_.teeth = svg("path", { fill: "none", stroke: INK, "stroke-width": 2 }, H_.mouthG);
    // front hair with cel shading and the angel ring highlight
    var fcid = uid("fc");
    var fcp = svg("clipPath", { id: fcid }, a.defs);
    svg("path", { d: hs.front + " " + hs.locks }, fcp);
    H_.front = svg("g", null, H_.g);
    H_.front.innerHTML = P(hs.locks, cd.hair, o) + P(hs.front, cd.hair, o);
    var fsh = svg("g", { "clip-path": "url(#" + fcid + ")" }, H_.front);
    fsh.innerHTML = P("M-130 -60L-40 -150L-60 -150L-150 -60Z", cd.hairD, ' opacity="0"') + P("M-120 -10C-100 -60 -80 -90 -40 -110L-46 120L-130 120Z", cd.hairD) + P("M-100 -40L-70 -40L-60 -10L-90 10Z", cd.hairD) + P(hs.ring, "none", SK(cd.hairH, 9) + ' stroke-dasharray="26 12 40 14"');
    H_.front.insertAdjacentHTML("beforeend", P(hs.front, "none", o));
    // accessories
    H_.acc = svg("g", null, H_.g);
    if (cd.headband) H_.acc.innerHTML = P("M-100 -70Q0 -104 100 -70L101 -46Q0 -80 -101 -46Z", cd.trim2, o) + P("M-70 -78Q0 -98 70 -78", "none", SK("#FF8A96", 4)) + R(-112, -72, 22, 30, shade(cd.trim2, 0.85), 6, o);
    if (cd.hairStyle === "bob") H_.acc.innerHTML = P(starD(-66, -64, 17, 7, 5, -100), GOLD, SK(INK, 3)) + C(-66, -64, 3, "#FFF2B3");
    if (cd.hairStyle === "hime") H_.acc.innerHTML = R(82, -40, 26, 10, cd.trim2, 4, SK(INK, 2.5)) + R(-108, -40, 26, 10, cd.trim2, 4, SK(INK, 2.5));
    // brows go above the hair
    H_.browG = svg("g", null, H_.g);
    H_.eyes.forEach(function (e) { var bg = svg("g", null, H_.browG); e.browHolder = bg; var inner = svg("g", { transform: e.s < 0 ? "scale(-1 1)" : "" }, bg); inner.appendChild(e.brow); });
    // glasses (ren): frames + glint, on the feature layer above the brows
    if (cd.glasses) {
      H_.glasses = svg("g", null, H_.g);
      var gcid = uid("gc");
      var gcp = svg("clipPath", { id: gcid }, a.defs);
      [-1, 1].forEach(function (s) { svg("rect", { x: s * 40 - 33, y: -22, width: 66, height: 52, rx: 14 }, gcp); });
      var gl = "";
      [-1, 1].forEach(function (s) { gl += R(s * 40 - 33, -22, 66, 52, "#FFFFFF", 14, ' fill-opacity="0.14"' + SK("#3A3F5C", 4.5)); });
      gl += P("M-7 -2Q0 -8 7 -2", "none", SK("#3A3F5C", 4)) + L(-73, -6, -88, -12, "#3A3F5C", 4) + L(73, -6, 88, -12, "#3A3F5C", 4);
      H_.glasses.innerHTML = gl;
      H_.glint = svg("g", { "clip-path": "url(#" + gcid + ")" }, H_.glasses);
      H_.glintBar = svg("path", { d: "M-30 60L10 -40L40 -40L0 60Z M20 60L60 -40L72 -40L32 60Z", fill: "#FFFFFF", opacity: 0.95 }, H_.glint);
      H_.glintStar = svg("path", { d: sparkD(0, 0, 22), fill: "#FFFFFF", stroke: "#9ADFFF", "stroke-width": 2 }, H_.glasses);
    }
    H_.marks = buildMarks(a, H_.g);
    return H_;
  }

  function buildMascot(a, parent) {
    var cd = a.cd, o = SK(INK, 4), M = {};
    M.g = svg("g", null, parent);
    M.ears = svg("g", null, M.g);
    M.earL = svg("g", null, M.ears);
    M.earL.innerHTML = P("M-20 -2C-34 -60 -36 -118 -18 -146C0 -120 4 -60 8 -4Z", "#FFFFFF", o) + P("M-14 -20C-24 -64 -24 -104 -16 -126C-6 -104 -4 -64 0 -22Z", "#FFB7CF");
    M.earR = svg("g", null, M.ears);
    M.earR.innerHTML = P("M20 -2C34 -60 36 -118 18 -146C0 -120 -4 -60 -8 -4Z", "#FFFFFF", o) + P("M14 -20C24 -64 24 -104 16 -126C6 -104 4 -64 0 -22Z", "#FFB7CF");
    M.arms = [];
    [-1, 1].forEach(function (s) {
      var ag = svg("g", null, M.g);
      ag.innerHTML = E(0, 30, 17, 30, "#FFFFFF", o);
      M.arms.push({ g: ag, s: s });
    });
    M.body = svg("g", null, M.g);
    M.body.innerHTML = E(0, 18, 112, 98, "#FFFFFF", o) + P("M-104 36C-96 80 -50 112 0 116C-46 100 -76 70 -86 24Z", cd.skinD) + E(-46, 112, 26, 13, "#FFFFFF", o) + E(46, 112, 26, 13, "#FFFFFF", o) + E(0, 18, 112, 98, "none", o);
    M.blush = svg("g", null, M.g);
    M.blush.innerHTML = E(-62, 34, 17, 9, "#FFB0C8") + E(62, 34, 17, 9, "#FFB0C8");
    M.feat = svg("g", null, M.g);
    M.eyes = [];
    [-1, 1].forEach(function (s) {
      var holder = svg("g", null, M.feat);
      var e = buildEye(a, holder, s, 0.62);
      e.holder = holder;
      M.eyes.push(e);
    });
    M.mouthG = svg("g", null, M.feat);
    M.mouth = svg("path", { fill: "none", stroke: INK, "stroke-width": 4, "stroke-linecap": "round", "stroke-linejoin": "round" }, M.mouthG);
    M.tongue = svg("ellipse", { fill: "#FF7A92" }, M.mouthG);
    M.teeth = svg("path", { fill: "none" }, M.mouthG);
    M.star = svg("g", null, M.g);
    M.star.innerHTML = P(starD(0, -52, 20, 8.5, 5), GOLD, SK(INK, 3.5)) + C(-4, -58, 3, "#FFF2B3");
    M.browG = svg("g", null, M.g);
    M.eyes.forEach(function (e) { var bg = svg("g", null, M.browG); e.browHolder = bg; var inner = svg("g", { transform: e.s < 0 ? "scale(-1 1)" : "" }, bg); inner.appendChild(e.brow); e.brow.setAttribute("stroke-width", 5); });
    M.marks = buildMarks(a, M.g);
    return M;
  }

  function buildArm(a, parent, side, chibi) {
    var cd = a.cd, A = { side: side };
    A.g = svg("g", null, parent);
    A.ink = svg("path", { fill: "none", stroke: INK, "stroke-width": chibi ? 30 : 52, "stroke-linecap": "round", "stroke-linejoin": "round" }, A.g);
    A.col = svg("path", { fill: "none", stroke: cd.top, "stroke-width": chibi ? 22 : 43, "stroke-linecap": "round", "stroke-linejoin": "round" }, A.g);
    A.shd = svg("path", { fill: "none", stroke: cd.topD, "stroke-width": chibi ? 6 : 12, "stroke-linecap": "round", "stroke-linejoin": "round", opacity: 0.9 }, A.g);
    A.hand = svg("g", null, A.g);
    var sk = cd.skin, hk = SK(INK, 3.5);
    function fing(x1, y1, x2, y2) { return L(x1, y1, x2, y2, INK, 15) + L(x1, y1, x2, y2, sk, 9); }
    A.types = {};
    var r = chibi ? 15 : 23;
    function hg(markup) { var g = svg("g", null, A.hand); g.innerHTML = markup; showEl(g, false); return g; }
    A.types.fist = hg(C(6, 0, r, sk, hk) + (chibi ? "" : P("M14 -12Q22 -6 16 2M16 4Q22 10 14 16", "none", SK(shade(cd.skinD, 0.85), 2.5))));
    A.types.open = hg(chibi ? C(6, 0, r, sk, hk) : fing(18, -14, 42, -22) + fing(22, -4, 48, -6) + fing(22, 6, 46, 10) + fing(16, 14, 36, 22) + C(6, 0, r, sk, hk));
    A.types.point = hg(chibi ? C(6, 0, r, sk, hk) : fing(20, -6, 58, -8) + C(6, 0, r, sk, hk));
    A.types.peace = hg(chibi ? C(6, 0, r, sk, hk) : fing(18, -10, 50, -26) + fing(22, 0, 56, -4) + C(6, 0, r, sk, hk));
    A.types.thumb = hg(chibi ? C(6, 0, r, sk, hk) : C(0, 0, r, sk, hk) + fing(-2, -16, -2, -46));
    A.cur = null;
    return A;
  }

  function buildChibiBody(a, parent) {
    var cd = a.cd, o = SK(INK, 3.5), B = {};
    B.g = svg("g", null, parent);
    var legs = svg("g", null, B.g);
    legs.innerHTML = R(-30, 180, 22, 50, cd.outfit === "jacket" ? "#3B3E58" : cd.outfit === "sailor" ? cd.trim : "#4A4E78", 6, o) + R(8, 180, 22, 50, cd.outfit === "jacket" ? "#3B3E58" : cd.outfit === "sailor" ? cd.trim : "#4A4E78", 6, o) + E(-22, 236, 20, 11, "#5A3A2E", o) + E(22, 236, 20, 11, "#5A3A2E", o);
    B.legs = legs;
    var body = svg("g", null, B.g), m = "";
    m += P("M-46 100Q0 92 46 100L64 196L-64 196Z", cd.top, o) + P("M-46 100L-64 196L-34 196L-24 104Z", cd.topD);
    if (cd.outfit === "sailor") m += P("M-36 100L0 150L36 100L54 122L0 170L-54 122Z", cd.trim, o) + P("M0 152L-16 146L-14 168ZM0 152L16 146L14 168Z", cd.trim2, o) + R(-64, 176, 128, 20, cd.trim, 4, o);
    else if (cd.outfit === "coat") m += P("M-26 100L0 160L26 100Z", cd.trim, o) + P("M-5 112H5L8 152L0 162L-8 152Z", cd.trim2);
    else if (cd.outfit === "jacket") m += P("M-30 100L0 150L30 100Z", cd.trim, o) + L(0, 150, 0, 196, "#9AA0C0", 4);
    else if (cd.outfit === "cardigan") m += P("M-28 100L0 140L28 100Z", "#FFFFFF", o) + P("M0 140L-10 132L-12 146ZM0 140L10 132L12 146Z", cd.trim2);
    body.innerHTML = m;
    B.body = body;
    return B;
  }

  var actorsAll = [];
  function makeActor(shot, name, o) {
    o = obj(o);
    var key = castKey(name), cd = CAST[key];
    var chibi = !!o.chibi && !cd.mascot, mascot = !!cd.mascot;
    var a = {
      __actor: true, name: key, cd: cd, shot: shot, chibi: chibi, mascot: mascot, seed: 17 + actorsAll.length * 7.3 + CAST_IDS.indexOf(key),
      sc: num(o.scale, 1), talks: [], hops: [], shakes: [], glints: [], gests: [], noArms: !!o.noArms, base: { x: num(o.x, shot.Ww / 2), y: num(o.y, 480) },
    };
    a.pos = new Tr({ x: a.base.x, y: a.base.y });
    a.vis = new Tr(o.hidden ? 0 : 1);
    a.facing = new Tr(faceNum(o.facing, 0));
    a.lookT = new Tr({ x: 0, y: 0 });
    a.lookSet = false;
    a.expr = new Tr(exKey(o.expression, null) || defaultExpr(key));
    a.windT = new Tr(clamp(num(o.wind, 0), 0, 1));
    a.gests.push({ at: -1, dur: 0, name: o.gesture ? gKey(o.gesture) : "rest" });
    a.defs = shot.defs2 || shot.defs;
    a.outer = svg("g", null, o.layer || shot.L.chars);
    if (o.clip) { var ccid = uid("ac"); var ccp = svg("clipPath", { id: ccid, clipPathUnits: "userSpaceOnUse" }, a.defs); svg("polygon", { points: o.clip }, ccp); a.outer.setAttribute("clip-path", "url(#" + ccid + ")"); a.clipId = ccid; }
    a.g = svg("g", null, a.outer);
    a.inner = svg("g", null, a.g);
    if (mascot) {
      a.M = buildMascot(a, a.inner);
    } else {
      var hs = HAIR[cd.hairStyle] || HAIR.bob;
      a.backHair = svg("g", null, a.inner);
      a.backHair.innerHTML = '<g' + (chibi && cd.hairStyle === "hime" ? ' transform="translate(0 -68) scale(1 0.55)"' : "") + ">" + P(hs.back, cd.hairD, SK(INK, 4)) + P(hs.back, cd.hair, ' transform="translate(5 -4) scale(0.95)"') + "</g>";
      if (cd.headband) {
        a.tails = svg("g", null, a.inner);
        a.tail1 = svg("path", { fill: cd.trim2, stroke: INK, "stroke-width": 3.5, "stroke-linejoin": "round" }, a.tails);
        a.tail2 = svg("path", { fill: shade(cd.trim2, 0.85), stroke: INK, "stroke-width": 3.5, "stroke-linejoin": "round" }, a.tails);
      }
      if (chibi) { a.B = buildChibiBody(a, a.inner); }
      else {
        a.torso = svg("g", null, a.inner);
        a.torso.innerHTML = torsoMarkup(cd);
      }
      a.neck = svg("g", null, a.inner);
      a.neck.innerHTML = P("M-24 70L-27 " + (chibi ? 108 : 136) + "L27 " + (chibi ? 108 : 136) + "L24 70Z", cd.skin, SK(INK, 4)) + P("M-25 76Q0 110 25 76L26 104Q0 124 -26 104Z", cd.skinD);
      a.Hd = buildHead(a, a.inner);
      a.arms = [buildArm(a, a.inner, -1, chibi), buildArm(a, a.inner, 1, chibi)];
    }
    a.popAt = [];
    actorsAll.push(a);
    shot.actors.push(a);
    actorMethods(a);
    return a.api;
  }
  function defaultExpr(key) { return key === "ren" ? "calm" : key === "kaito" ? "determined" : key === "yuki" ? "smile" : key === "mochi" ? "happy" : "smile"; }
  function faceNum(f, d) {
    if (typeof f === "number") return clamp(f, -1, 1);
    f = str(f).toLowerCase();
    if (f === "left") return -0.62;
    if (f === "right") return 0.62;
    if (f === "front" || f === "camera") return 0;
    return d == null ? 0 : d;
  }

  // ------------------------- actor per frame -------------------------
  var VIS = { A: { w: 1.0, o: 1.0 }, E: { w: 1.15, o: 0.55 }, I: { w: 1.05, o: 0.45 }, O: { w: 0.62, o: 0.9 }, U: { w: 0.52, o: 0.6 } };
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
  function mouthAt(a, t) {
    for (var i = 0; i < a.talks.length; i++) {
      var w = a.talks[i];
      if (t < w.from - 0.05 || t > w.to + 0.2) continue;
      var amp = 0, v = "A";
      for (var j = 0; j < w.syl.length; j++) {
        var q = w.syl[j];
        if (t >= q.t0 && t < q.t1) { amp = Math.pow(Math.sin((PI * (t - q.t0)) / (q.t1 - q.t0)), 0.8) * q.k; v = q.v; break; }
      }
      return { amp: amp, v: v };
    }
    return { amp: 0, v: "A" };
  }
  function blinkAt(a, t) {
    var tb = 0.6 + hash(a.seed) * 1.6, k = 0;
    while (tb < t + 0.2 && k < 400) {
      if (t >= tb && t < tb + 0.14) return Math.sin((PI * (t - tb)) / 0.14);
      tb += 2.0 + hash(a.seed + ++k * 1.37) * 2.6;
    }
    return 0;
  }
  function mouthD(type, w, open, sm) {
    if (type === "grit") {
      var gh = 10 + open * 14;
      return { d: "M" + f1(-w) + " -6Q0 " + f1(-8 + sm * 4) + " " + f1(w) + " -6L" + f1(w * 0.88) + " " + f1(gh - 6) + "Q0 " + f1(gh - 2) + " " + f1(-w * 0.88) + " " + f1(gh - 6) + "Z", fill: "#FFFFFF", teeth: "M" + f1(-w * 0.92) + " " + f1(gh / 2 - 6) + "H" + f1(w * 0.92) + "M" + f1(-w / 3) + " -7V" + f1(gh - 3) + "M" + f1(w / 3) + " -7V" + f1(gh - 3), tongue: null };
    }
    if (open < 0.07) {
      if (type === "cat") return { d: "M" + f1(-w) + " -3Q" + f1(-w / 2) + " 8 0 0Q" + f1(w / 2) + " 8 " + f1(w) + " -3", fill: "none" };
      if (type === "wavy") return { d: "M" + f1(-w) + " 0q" + f1(w / 4) + " -6 " + f1(w / 2) + " 0t" + f1(w / 2) + " 0t" + f1(w / 2) + " 0t" + f1(w / 2) + " 0", fill: "none" };
      if (type === "o") return { d: "M-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0", fill: "#5A1830" };
      return { d: "M" + f1(-w) + " " + f1(-sm * 3) + "Q0 " + f1(sm * 12) + " " + f1(w) + " " + f1(-sm * 3), fill: "none" };
    }
    if (type === "o") {
      var ry = 5 + open * 17, rx = Math.max(6, w * 0.55);
      return { d: "M" + f1(-rx) + " " + f1(ry * 0.4) + "a" + f1(rx) + " " + f1(ry) + " 0 1 0 " + f1(rx * 2) + " 0a" + f1(rx) + " " + f1(ry) + " 0 1 0 " + f1(-rx * 2) + " 0Z", fill: "#5A1830", tongue: [0, ry * 0.95, rx * 0.6, ry * 0.38] };
    }
    var top = -sm * 4, bot = 4 + open * 28 + Math.max(0, sm) * 6;
    return { d: "M" + f1(-w) + " " + f1(top) + "Q0 " + f1(top + sm * 6) + " " + f1(w) + " " + f1(top) + "Q" + f1(w * 0.7) + " " + f1(bot) + " 0 " + f1(bot) + "Q" + f1(-w * 0.7) + " " + f1(bot) + " " + f1(-w) + " " + f1(top) + "Z", fill: "#5A1830", tongue: [0, bot * 0.72, w * 0.5, Math.max(2, open * 7)], teeth: open > 0.25 && sm > 0.4 ? "M" + f1(-w * 0.8) + " " + f1(top + 3) + "Q0 " + f1(top + 6 + sm * 4) + " " + f1(w * 0.8) + " " + f1(top + 3) : null };
  }
  function gestAt(a, t) {
    var list = a.gests, cur = list[0], prev = list[0];
    for (var i = 0; i < list.length; i++) { if (list[i].at <= t) { prev = cur; cur = list[i]; } else break; }
    if (cur === list[0]) prev = cur;
    var p = cur.dur > 0 ? clamp((t - cur.at) / cur.dur, 0, 1) : 1;
    return { cur: cur, prev: prev, p: p, e: CE.smear(p) };
  }
  function handTargets(name, mirror) {
    var g = GEST[name] || GEST.rest, r = g.r, l = g.l;
    if (mirror && !g.abs) return { r: [-l[0], l[1], l[2]], l: [-r[0], r[1], r[2]], wave: g.wave };
    return { r: r, l: l, wave: g.wave };
  }
  function updArm(A, sx, sy, tx, ty, hand, l1, l2) {
    var s = ik(sx, sy, tx, ty, l1, l2, A.side), e = s.e, h = s.h;
    var d = "M" + f1(sx) + " " + f1(sy) + "L" + f1(e[0]) + " " + f1(e[1]) + "L" + f1(h[0]) + " " + f1(h[1]);
    setA(A.ink, "d", d); setA(A.col, "d", d);
    setA(A.shd, "d", "M" + f1(sx + 10 * A.side) + " " + f1(sy + 14) + "L" + f1(e[0] + 10 * A.side) + " " + f1(e[1] + 4));
    var ang = Math.atan2(h[1] - e[1], h[0] - e[0]) * 180 / PI;
    if (A.cur !== hand) { for (var k in A.types) showEl(A.types[k], k === hand); A.cur = hand; }
    var flip = A.side < 0 ? " scale(1 -1)" : "";
    setA(A.hand, "transform", "translate(" + f1(h[0]) + " " + f1(h[1]) + ")" + (hand === "thumb" ? "" : " rotate(" + f1(ang) + ")" + flip));
  }
  function updChibiArm(A, sx, sy, deg, len, hand) {
    var r_ = rad(deg), hx = sx + Math.sin(r_) * len * A.side, hy = sy + Math.cos(r_) * len;
    var d = "M" + f1(sx) + " " + f1(sy) + "L" + f1(hx) + " " + f1(hy);
    setA(A.ink, "d", d); setA(A.col, "d", d); setA(A.shd, "d", "M0 0");
    if (A.cur !== "fist") { for (var k in A.types) showEl(A.types[k], k === "fist"); A.cur = "fist"; }
    setA(A.hand, "transform", "translate(" + f1(hx) + " " + f1(hy) + ")");
  }
  function updFace(a, F, t, f, ex, mascot) {
    var bl = blinkAt(a, t), lk = a.lookT.val(t), talk = mouthAt(a, t);
    var lid = Math.max(ex.lid, bl);
    var eyeType = ex.eye;
    if (bl > 0.6 && (eyeType === "normal" || eyeType === "tiny" || eyeType === "star")) eyeType = "closed";
    var fx = f * (mascot ? 14 : 19);
    setA(F.feat, "transform", "translate(" + f1(fx) + " 0)");
    F.eyes.forEach(function (e) {
      var far = e.s > 0 ? Math.max(0, f) : Math.max(0, -f);
      var ex0 = (mascot ? 36 : 40) * e.s, ey0 = mascot ? 2 : 8, k = e.k;
      setA(e.holder, "transform", "translate(" + f1(ex0) + " " + ey0 + ") scale(" + f2(k * (1 - 0.3 * far)) + " " + f2(k) + ")");
      if (e.cur !== eyeType) { for (var s in e.sets) showEl(e.sets[s], s === eyeType); e.cur = eyeType; }
      if (eyeType === "normal") {
        var yl = -31 + lid * 60;
        setA(e.lid, "height", f1(Math.max(0, yl + 44)));
        setA(e.lash, "d", lashD(yl, 1 - lid));
        var lx = clamp(lk.x, -1, 1) * 7 * e.s, ly = clamp(lk.y, -1, 1) * 7;
        setA(e.iris, "transform", "translate(" + f1(lx) + " " + f1(ly) + ") scale(" + f2(ex.pu) + ")");
      }
      setA(e.browHolder, "transform", "translate(" + f1(ex0 + fx) + " " + (mascot ? 12 : ey0) + ") scale(" + f2(k * (1 - 0.3 * far)) + " " + f2(k) + ")");
      setA(e.brow, "d", browD(ex.by, ex.ba));
    });
    // mouth
    var open = ex.mo, w = ex.mw, type = ex.mouth;
    if (talk.amp > 0.02) {
      var vz = VIS[talk.v] || VIS.A;
      open = Math.max(open, talk.amp * 0.75 * vz.o);
      w = w * (0.75 + 0.25 * vz.w) * (type === "o" ? 1 : 1);
      if (type === "line" || type === "cat" || type === "wavy") type = "open";
    }
    var m = mouthD(type, w, open, ex.sm);
    setA(F.mouth, "d", m.d);
    setA(F.mouth, "fill", m.fill || "none");
    setA(F.mouthG, "transform", "translate(" + f1(f * (mascot ? 10 : 22)) + " " + (mascot ? 34 : 76) + ")");
    if (m.tongue) { showEl(F.tongue, true); setA(F.tongue, "cx", f1(m.tongue[0])); setA(F.tongue, "cy", f1(m.tongue[1])); setA(F.tongue, "rx", f1(m.tongue[2])); setA(F.tongue, "ry", f1(m.tongue[3])); }
    else showEl(F.tongue, false);
    if (m.teeth) { showEl(F.teeth, true); setA(F.teeth, "d", m.teeth); setA(F.teeth, "stroke", type === "grit" ? INK : "#FFFFFF"); setA(F.teeth, "stroke-width", type === "grit" ? 2 : 4); }
    else showEl(F.teeth, false);
    // marks
    var mk = {};
    ex.marks.forEach(function (n) { mk[n] = 1; });
    for (var n in F.marks) {
      if (n === "tearsG") continue;
      var on = !!mk[n];
      showEl(F.marks[n], on);
      if (on && n === "sparkles") setA(F.marks[n], "transform", "translate(0 " + f1(Math.sin(t * 5) * 4) + ") ");
      if (on && n === "tears") setA(F.marks[n], "transform", "translate(" + f1(fx) + " 0) scale(1 " + f2(0.85 + 0.15 * Math.sin(t * 9)) + ")");
      if (on && n === "sweat") setA(F.marks[n], "transform", "translate(0 " + f1(mod(t * 12, 10) * 0.6) + ")");
      if (on && n === "zz") setA(F.marks[n], "transform", "translate(" + f1(Math.sin(t * 2) * 5) + " " + f1(-mod(t * 10, 14)) + ")");
      if (on && n === "hatch") setA(F.marks[n], "transform", "translate(" + f1(fx * 0.7) + " 0)");
    }
    setA(F.blush, "opacity", f2(clamp(ex.blush, 0, 1) * 0.75));
    if (F.blush) setA(F.blush, "transform", "translate(" + f1(fx * 0.7) + " 0)");
  }
  function hopAt(a, t) {
    var y = 0;
    a.hops.forEach(function (h) { if (t >= h.at && t < h.at + h.dur) { var p = (t - h.at) / h.dur; y -= Math.sin(PI * p) * h.h; } });
    return y;
  }
  function shakeAt(a, t) {
    var x = 0;
    a.shakes.forEach(function (q, j) { if (t >= q.at && t < q.at + q.dur) { var k = 1 - (t - q.at) / q.dur; x += Math.sin((t - q.at) * 70 + j) * q.amp * k; } });
    return x;
  }
  function updActor(a, t) {
    var vis = a.vis.val(t) >= 0.5;
    showEl(a.outer, vis);
    if (!vis) return;
    var p = a.pos.val(t), f = clamp(a.facing.val(t), -1, 1), ek = a.expr.key(t), ex = exprVec(ek.v);
    var pop = 1;
    if (ek.at >= 0 && t - ek.at < 0.16) pop = 1 + 0.05 * Math.sin(PI * (t - ek.at) / 0.16);
    var breath = Math.sin(t * 2.1 + a.seed) * 2.2, wind = a.windT.val(t);
    var x = p.x + shakeAt(a, t), y = p.y + hopAt(a, t) + (a.mascot ? Math.sin(t * 2.6 + a.seed) * 6 : 0);
    setA(a.g, "transform", "translate(" + f1(x) + " " + f1(y) + ") scale(" + (a.sc * pop).toFixed(4) + ")");
    var g = gestAt(a, t), mirror = f < -0.2;
    if (a.mascot) {
      var M = a.M;
      updFace(a, M, t, f, ex, true);
      var ca0 = CHIBI_ARMS[g.prev.name] || CHIBI_ARMS.rest, ca1 = CHIBI_ARMS[g.cur.name] || CHIBI_ARMS.rest;
      M.arms.forEach(function (A, i) {
        var idx = mirror ? 1 - i : i, deg = lerp(ca0[idx], ca1[idx], g.e);
        if (g.cur.name === "wave" && i === (mirror ? 0 : 1)) deg += Math.sin(t * 16) * 18;
        setA(A.g, "transform", "translate(" + (A.s * 92) + " 46) rotate(" + f1(-A.s * deg * 0.8) + ") ");
      });
      var ew = Math.sin(t * 2.3 + a.seed) * 4 + wind * Math.sin(t * 9) * 6;
      setA(M.earL, "transform", "translate(-38 -64) rotate(" + f1(-14 + ew) + ")");
      setA(M.earR, "transform", "translate(38 -64) rotate(" + f1(14 - ew) + ")");
      setA(M.body, "transform", "translate(0 " + f1(breath * 0.5) + ")");
      return;
    }
    var Hd = a.Hd;
    setA(Hd.g, "transform", "translate(0 " + f1(breath * 0.3) + ")");
    setA(Hd.skin, "d", headPathD(f));
    setA(Hd.clipPath, "d", headPathD(f));
    setA(Hd.front, "transform", "translate(" + f1(f * 8) + " 0)");
    setA(Hd.acc, "transform", "translate(" + f1(f * 8) + " 0)");
    if (Hd.glasses) setA(Hd.glasses, "transform", "translate(" + f1(f * 19) + " 8)");
    var sway = Math.sin(t * 1.7 + a.seed) * 1.2 + wind * Math.sin(t * 7.3 + a.seed) * 3.2;
    setA(a.backHair, "transform", "translate(" + f1(-f * 6) + " 0) rotate(" + f2(sway) + " 0 -60)");
    if (a.tails) {
      var fl = Math.sin(t * 6 + a.seed) * (6 + wind * 16), fl2 = Math.sin(t * 6 + 1.3 + a.seed) * (6 + wind * 16), dir = f < -0.2 ? 1 : -1;
      setA(a.tail1, "d", "M" + (dir * 96) + " -66Q" + f1(dir * 150) + " " + f1(-70 + fl) + " " + f1(dir * (196 + wind * 30)) + " " + f1(-40 + fl2) + "L" + f1(dir * (186 + wind * 30)) + " " + f1(-22 + fl2) + "Q" + f1(dir * 140) + " " + f1(-44 + fl) + " " + (dir * 96) + " -48Z");
      setA(a.tail2, "d", "M" + (dir * 96) + " -58Q" + f1(dir * 140) + " " + f1(-30 + fl2) + " " + f1(dir * (168 + wind * 24)) + " " + f1(-2 + fl) + "L" + f1(dir * (154 + wind * 24)) + " " + f1(12 + fl) + "Q" + f1(dir * 126) + " " + f1(-18 + fl2) + " " + (dir * 92) + " -44Z");
    }
    updFace(a, Hd, t, f, ex, false);
    // glint
    if (Hd.glasses) {
      var gk = 0, gp = 0;
      a.glints.forEach(function (at) { if (t >= at && t < at + 0.45) { gp = (t - at) / 0.45; gk = Math.sin(PI * gp); } });
      showEl(Hd.glint, gk > 0.01);
      showEl(Hd.glintStar, gk > 0.01);
      if (gk > 0.01) {
        setA(Hd.glintBar, "transform", "translate(" + f1(-80 + gp * 150) + " 0)");
        setA(Hd.glintStar, "transform", "translate(54 -18) scale(" + f2(0.3 + gk * 1.1) + ") rotate(" + f1(gp * 90) + ")");
      }
    }
    // arms
    if (a.chibi) {
      var c0 = CHIBI_ARMS[g.prev.name] || CHIBI_ARMS.rest, c1 = CHIBI_ARMS[g.cur.name] || CHIBI_ARMS.rest;
      a.arms.forEach(function (A) {
        var i = A.side < 0 ? 0 : 1, idx = mirror ? 1 - i : i, deg = lerp(c0[idx], c1[idx], g.e);
        if (g.cur.name === "wave" && i === (mirror ? 0 : 1)) deg += Math.sin(t * 16) * 16;
        updChibiArm(A, A.side * 50, 116, deg, 62, "fist");
      });
      setA(a.B.g, "transform", "translate(0 " + f1(-breath * 0.3) + ")");
      return;
    }
    var T0 = handTargets(g.prev.name, mirror), T1 = handTargets(g.cur.name, mirror);
    a.arms.forEach(function (A) {
      var k0 = A.side > 0 ? T0.r : T0.l, k1 = A.side > 0 ? T1.r : T1.l;
      var tx = lerp(k0[0], k1[0], g.e), ty = lerp(k0[1], k1[1], g.e);
      if (T1.wave && A.side === (mirror ? -1 : 1)) tx += Math.sin(t * 15) * 26 * g.e;
      var hand = g.p > 0.4 ? k1[2] : k0[2];
      updArm(A, A.side * 150, 204 + breath * 0.4, tx, ty + breath * 0.4, hand, 162, 152);
    });
  }
  // Screen-relevant box of an actor in world units (head for busts, the whole body for chibi and mascot).
  function actorWorldBox(a, t) {
    var p = a.pos.val(t), s = a.sc, y = p.y + hopAt(a, t);
    if (a.mascot) return { x: p.x - 118 * s, y: y - 150 * s, w: 236 * s, h: 280 * s };
    if (a.chibi) return { x: p.x - 106 * s, y: y - 150 * s, w: 212 * s, h: 400 * s };
    return { x: p.x - 104 * s, y: y - 150 * s, w: 208 * s, h: 268 * s };
  }

  // ------------------------- actor API -------------------------
  function actorMethods(a) {
    var api = { __actor: true, name: a.name, _a: a };
    function T(v, d) { return tc0(v == null ? d : v); }
    api.expression = function (name, at) { a.expr.set(exKey(name, null) || defaultExpr(a.name), T(at, 0)); return api; };
    api.gesture = function (name, at, dur) {
      var g = { at: T(at, 0), dur: Math.max(0.01, num(dur, 0.18)), name: gKey(name) };
      a.gests.push(g);
      a.gests.sort(function (p, q) { return p.at - q.at; });
      return api;
    };
    api.say = function (from, to) {
      from = T(from, 0); to = T(to, D);
      (V.words || []).forEach(function (w) {
        if (w.start < from - 0.02 || w.start >= to) return;
        var e = Math.min(w.end, to);
        if (e - w.start < 0.06) return;
        a.talks.push({ from: w.start, to: e, syl: sylls(w.word, w.start, e, a.seed + w.start * 13) });
      });
      if (!(V.words || []).length && to > from) {
        // no timings: flap the mouth on an even beat so the shot still talks
        for (var t = from; t < to - 0.1; t += 0.32) a.talks.push({ from: t, to: t + 0.26, syl: sylls("ta", t, t + 0.26, a.seed + t) });
      }
      a.talks.sort(function (p, q) { return p.from - q.from; });
      return api;
    };
    api.face = function (dir, at) { a.facing.to(faceNum(dir, 0), T(at, 0), 0.14, "outCubic"); return api; };
    api.look = function (x, y, at) { a.lookT.to({ x: clamp(num(x, 0), -1, 1), y: clamp(num(y, 0), -1, 1) }, T(at, 0), 0.1, "outCubic"); return api; };
    api.lookAt = function (target, at) {
      var t0 = T(at, 0), x = 0, y = 0;
      if (target === "left") x = -1; else if (target === "right") x = 1; else if (target === "up") y = -1; else if (target === "down") y = 1;
      else if (target && target.__actor) { var b = target._a.pos.val(t0), p = a.pos.val(t0); x = clamp((b.x - p.x) / 200, -1, 1); y = clamp((b.y - p.y) / 300, -1, 1); }
      return api.look(x, y, t0);
    };
    api.moveTo = function (x, y, at, dur, ease) {
      var t0 = T(at, 0), cur = a.pos.val(t0), tgt = { x: x == null ? cur.x : num(x, cur.x), y: y == null ? cur.y : num(y, cur.y) };
      a.pos.to(tgt, t0, Math.max(0, num(dur, 0.35)), ease || "smear");
      return api;
    };
    api.slideIn = function (from, at, dur) {
      var t0 = T(at, 0), p = a.pos.val(t0), Ww = a.shot.Ww, off = { x: p.x, y: p.y };
      if (from === "left") off.x = -260 * a.sc; else if (from === "bottom") off.y = 1000 + 200 * a.sc; else off.x = Ww + 260 * a.sc;
      a.pos.set(off, 0);
      a.pos.to({ x: p.x, y: p.y }, t0, Math.max(0.05, num(dur, 0.35)), "smear");
      return api;
    };
    api.hop = function (at, height, dur) { a.hops.push({ at: T(at, 0), h: num(height, 40), dur: Math.max(0.1, num(dur, 0.32)) }); return api; };
    api.shake = function (at, dur, amp) { a.shakes.push({ at: T(at, 0), dur: Math.max(0.05, num(dur, 0.35)), amp: num(amp, 9) }); return api; };
    api.show = function (at) { a.vis.set(1, T(at, 0)); return api; };
    api.hide = function (at) { a.vis.set(0, T(at, 0)); return api; };
    api.glint = function (at) { a.glints.push(T(at, 0)); return api; };
    api.wind = function (amount, at) { a.windT.to(clamp(num(amount, 0.6), 0, 1), T(at, 0), 0.4, "inOutSine"); return api; };
    api.beats = function (list) {
      var prev = 0;
      arr(list).forEach(function (b) {
        b = obj(b);
        var t = b.at != null ? num(b.at, null) : b.word ? kwFind(b.word, prev) : null;
        if (t == null) return;
        t = tc(t);
        prev = t;
        if (b.expression) api.expression(b.expression, t);
        if (b.gesture) api.gesture(b.gesture, t);
        if (b.look) { if (typeof b.look === "string") api.lookAt(b.look, t); else api.look(obj(b.look).x, obj(b.look).y, t); }
        if (b.face) api.face(b.face, t);
        if (b.hop) api.hop(t, typeof b.hop === "number" ? b.hop : 40);
      });
      return api;
    };
    api.box = function (t) { var b = actorWorldBox(a, t == null ? V.time() : t); return b; };
    api.pos = function (t) { return a.pos.val(t == null ? V.time() : t); };
    Object.defineProperty(api, "x", { get: function () { return a.pos.val(V.time()).x; } });
    Object.defineProperty(api, "y", { get: function () { return a.pos.val(V.time()).y; } });
    Object.defineProperty(api, "scale", { get: function () { return a.sc; } });
    a.api = api;
    return api;
  }

  // ------------------------- film & shots -------------------------
  var film = null;
  function getFilm() {
    if (film) return film;
    var root = V.root();
    var F = { shots: [], impacts: [], flashes: [], shakes: [], stripes: [], memories: [], anims: [], letters: [], cutActors: [], fin: false, late: [] };
    F.el = div("an-film", root);
    F.shotsWrap = div("an-shots", F.el);
    var sv = { class: "an-layer", width: W, height: H, viewBox: "0 0 " + W + " " + H };
    F.ffx = svg("svg", sv, F.el);
    F.defs = svg("defs", null, F.ffx);
    F.ffxG = svg("g", null, F.ffx);
    F.letter = div("an-letter", F.el);
    F.top = svg("svg", sv, F.el);
    F.topDefs = svg("defs", null, F.top);
    F.flash = div("an-flash", F.el);
    showEl(F.flash, false);
    F.vign = div("an-vign", F.el);
    showEl(F.vign, false);
    film = F;
    V.onFrame(function (t) { if (film === F) filmFrame(t); });
    return F;
  }

  var LOCS = ["rooftop", "sunset-city", "classroom", "train", "night-city", "shrine", "space", "sky", "meadow", "plain"];
  var LOC_SYN = { roof: "rooftop", school: "classroom", class: "classroom", room: "classroom", sunset: "sunset-city", evening: "sunset-city", city: "night-city", night: "night-city", neon: "night-city", temple: "shrine", sakura: "shrine", spring: "shrine", stars: "space", galaxy: "space", clouds: "sky", cloud: "sky", field: "meadow", hill: "meadow", grass: "meadow", studio: "plain", pastel: "plain", white: "plain", subway: "train", metro: "train" };
  function locKey(n, def) { n = str(n).toLowerCase().replace(/[\s_]+/g, "-"); if (LOCS.indexOf(n) >= 0) return n; return LOC_SYN[n] || LOC_SYN[n.replace(/-/g, "")] || def || "sky"; }

  var shotCount = 0;
  function makeShot(location, from, to, o) {
    var F = getFilm();
    o = obj(o);
    var loc = locKey(location, "sky");
    var Ww = (1000 * W) / H;
    shotCount++;
    var s = {
      id: shotCount, loc: loc, from: Math.max(0, num(from, 0)), to: num(to, 1e9), enter: str(o.enter) || "cut", Ww: Ww, k: H / 1000,
      portrait: PORT, square: SQUARE, landscape: !PORT && !SQUARE, actors: [], anims: [], userFrames: [], segs: [], segSorted: true,
      shakes: [], rumbles: [], camBase: { x: Ww / 2, y: 500, z: 1 }, bgHide: [], color: isColor(o.color) ? hex6(o.color) : null, boxes: [], index: F.shots.length,
    };
    if (s.to <= s.from) s.to = s.from + 0.01;
    s.board = boardRect(s, o.board);
    s.cleanBoard = !!obj(o.board).clean;
    s.el = div("an-shot an-" + loc, F.shotsWrap);
    var sv = { class: "an-layer", width: W, height: H, viewBox: "0 0 " + W + " " + H };
    s.svgBg = svg("svg", sv, s.el);
    s.defs = svg("defs", null, s.svgBg);
    s.L = {};
    ["sky", "far", "mid", "main"].forEach(function (k) { s.L[k] = svg("g", null, s.svgBg); });
    s.under = svg("svg", sv, s.el);
    s.underG = svg("g", null, s.under);
    s.html = div("an-whtml", s.el);
    s.svgCh = svg("svg", sv, s.el);
    s.defs2 = svg("defs", null, s.svgCh);
    ["aura", "chars", "front", "wfx"].forEach(function (k) { s.L[k] = svg("g", null, s.svgCh); });
    s.over = svg("svg", sv, s.el);
    s.overG = svg("g", null, s.over);
    s.enterG = svg("g", null, s.over);
    s.fac = { sky: 0.06, far: 0.3, mid: 0.65, main: 1, aura: 1, chars: 1, front: 1.22, wfx: 1 };
    paintLocation(s);
    s.cam = new Camera(s);
    buildEnter(s);
    F.shots.push(s);
    s.api = shotApi(s);
    showEl(s.el, false);
    return s.api;
  }
  function boardRect(s, b) {
    b = obj(b);
    var Ww = s.Ww, r;
    if (s.portrait) r = { x: Ww * 0.06, y: 150, w: Ww * 0.88, h: 330 };
    else if (s.square) r = { x: Ww * 0.06, y: 130, w: Ww * 0.6, h: 400 };
    else r = { x: Ww * 0.07, y: 150, w: Ww * 0.53, h: 470 };
    return { x: num(b.x, r.x), y: num(b.y, r.y), w: num(b.w, r.w), h: num(b.h, r.h) };
  }
  function frameFor(s, kind, side) {
    kind = str(kind).toLowerCase() || "medium";
    var P_ = s.portrait, Q = s.square, Ww = s.Ww;
    var T = {
      wide: P_ ? [0.66, 600] : Q ? [0.62, 560] : [0.64, 560],
      medium: P_ ? [1.0, 560] : Q ? [1.0, 500] : [1.2, 455],
      close: P_ ? [1.32, 560] : Q ? [1.35, 500] : [1.62, 462],
      extreme: P_ ? [2.1, 500] : Q ? [2.2, 490] : [2.4, 500],
      low: P_ ? [1.12, 540] : Q ? [1.1, 480] : [1.18, 430],
      chibi: P_ ? [0.95, 480] : Q ? [0.9, 470] : [0.95, 450],
    }[kind] || [1, 470];
    var fx;
    if (typeof side === "number") fx = clamp(side, 0, 1);
    else {
      side = str(side).toLowerCase();
      var off = P_ ? 0.2 : Q ? 0.22 : kind === "close" || kind === "extreme" ? 0.17 : 0.2;
      fx = side === "left" ? 0.5 - off : side === "right" ? 0.5 + off : 0.5;
    }
    return { x: Ww * fx, y: T[1], scale: T[0] };
  }
  function shotApi(s) {
    var api = {
      __shot: true, location: s.loc, Ww: s.Ww, portrait: s.portrait, square: s.square, landscape: s.landscape, board: s.board,
      cam: s.cam, html: s.html, from: s.from, to: s.to, _s: s,
      frame: function (kind, side) { return frameFor(s, kind, side); },
      character: function (name, opts) { return makeActor(s, name, opts); },
      onFrame: function (fn) { if (typeof fn === "function") s.userFrames.push(fn); return api; },
      focusLines: function (from, to, o) { focusLines(s, from, to, o); return api; },
      speedLines: function (from, to, o) { speedLines(s, from, to, o); return api; },
      aura: function (actor, from, to, o) { aura(s, actor, from, to, o); return api; },
      sparkles: function (from, to, o) { sparkles(s, from, to, o); return api; },
      petals: function (from, to, o) { petals(s, from, to, o); return api; },
      burst: function (at, o) { burst(s, at, o); return api; },
      rings: function (at, o) { rings(s, at, o); return api; },
      toScreen: function (x, y, t) { var c = camAt(s, t == null ? V.time() : t); return toScr(s, c, x, y); },
    };
    return api;
  }
  function active(s, t) { return t >= s.from - 1e-6 && t < s.to; }

  // ------------------------- camera -------------------------
  function Camera(s) { this.s = s; }
  var CP = Camera.prototype;
  CP.set = function (o) { o = obj(o); var b = this.s.camBase; if (o.x != null) b.x = num(o.x, b.x); if (o.y != null) b.y = num(o.y, b.y); if (o.zoom != null) b.z = num(o.zoom, 1); return this; };
  CP._seg = function (g) { g.i = this.s.segs.length; this.s.segs.push(g); this.s.segSorted = false; return this; };
  CP.to = function (tg, at, dur, ease) {
    var d = dur == null ? 0.8 : Math.max(0, num(dur, 0.8)), a = tc0(at), self = this;
    tg = obj(tg);
    return this._seg({ at: a, dur: d, ease: EZ(ease || "inOutCubic"), tgt: function (prev) { return { x: tg.x != null ? num(tg.x, prev.x) : prev.x, y: tg.y != null ? num(tg.y, prev.y) : prev.y, z: tg.zoom != null ? num(tg.zoom, prev.z) : prev.z }; } });
  };
  CP.cut = function (tg, at) { return this.to(tg, at, 0); };
  CP.push = function (zoom, at, dur) { var z = num(zoom, 1.12); return this._seg({ at: tc0(at), dur: dur == null ? 2 : Math.max(0, num(dur, 2)), ease: EZ("inOutSine"), tgt: function (prev) { return { x: prev.x, y: prev.y, z: z }; } }); };
  CP.focus = function (actor, at, dur, zoom) {
    if (!actor || !actor.__actor) return this;
    var a = actor._a, z = num(zoom, 1.4), t0 = tc0(at);
    return this._seg({ at: t0, dur: dur == null ? 0.25 : Math.max(0, num(dur, 0.25)), ease: EZ("outCubic"), tgt: function () { var p = a.pos.val(t0 + 0.3); return { x: p.x, y: p.y + 30 * a.sc, z: z }; } });
  };
  CP.shake = function (at, amp, dur) { this.s.shakes.push({ at: tc0(at), amp: num(amp, 12), dur: Math.max(0.05, num(dur, 0.4)) }); return this; };
  CP.rumble = function (from, to, amp) { this.s.rumbles.push({ from: tc0(from), to: tc0(to == null ? D : to), amp: num(amp, 4) }); return this; };
  function camAt(s, t) {
    if (!s.segSorted) { s.segs.sort(function (a, b) { return a.at - b.at || a.i - b.i; }); s.segSorted = true; }
    var v = { x: s.camBase.x, y: s.camBase.y, z: s.camBase.z }, moving = false;
    for (var i = 0; i < s.segs.length; i++) {
      var g = s.segs[i];
      if (t < g.at) break;
      var p = g.dur > 0 ? clamp((t - g.at) / g.dur, 0, 1) : 1, tg = g.tgt(v), e = g.ease(p);
      v = { x: lerp(v.x, tg.x, e), y: lerp(v.y, tg.y, e), z: lerp(v.z, tg.z, e) };
      if (g.dur > 0.05 && p < 1 && Math.abs(tg.x - v.x) + Math.abs(tg.y - v.y) > 8) moving = true;
    }
    v.z = clamp(v.z, 0.6, 5);
    var sx = 0, sy = 0;
    function addShake(q, j) {
      if (t < q.at || t > q.at + q.dur) return;
      var k = Math.pow(1 - (t - q.at) / q.dur, 1.5) * u(q.amp);
      sx += k * Math.sin((t - q.at) * 73 + j * 1.7);
      sy += k * 0.8 * Math.cos((t - q.at) * 61 + j * 2.3);
    }
    s.shakes.forEach(addShake);
    if (film) film.shakes.forEach(function (q, j) { addShake(q, j + 9); });
    s.rumbles.forEach(function (q, j) {
      if (t < q.from || t > q.to) return;
      var fr = Math.floor(t * 24);
      sx += (hash(fr * 1.3 + j) - 0.5) * 2 * u(q.amp);
      sy += (hash(fr * 2.1 + j + 5) - 0.5) * 2 * u(q.amp);
    });
    // enter moves
    var ox = 0, oy = 0, ez = 1, dt = t - s.from, en = s.enter;
    if (en !== "cut" && dt >= 0 && dt < 0.4) {
      var ed = en === "drop" || en === "rise" ? 0.32 : 0.2, pe = clamp(dt / ed, 0, 1);
      var e2 = en === "drop" || en === "rise" ? V.ease.outBack(pe) : V.ease.outCubic(pe);
      if (en === "whip-left") ox = -W * 0.6 * (1 - e2);
      else if (en === "whip-right") ox = W * 0.6 * (1 - e2);
      else if (en === "zoom") ez = 1 + 0.7 * (1 - e2);
      else if (en === "drop") oy = -H * 0.28 * (1 - e2);
      else if (en === "rise") oy = H * 0.28 * (1 - e2);
      if (pe < 1) moving = true;
    }
    v.sx = sx + ox; v.sy = sy + oy; v.ez = ez; v.moving = moving;
    return v;
  }
  function layerM(s, c, f) {
    var zf = 1 + (c.z - 1) * f, sc = s.k * zf * c.ez;
    var cx = s.Ww / 2 + (c.x - s.Ww / 2) * f, cy = 500 + (c.y - 500) * f;
    return [sc, W / 2 - cx * sc + c.sx, H / 2 - cy * sc + c.sy];
  }
  function toScr(s, c, x, y) { var m = layerM(s, c, 1); return [x * m[0] + m[1], y * m[0] + m[2], m[0]]; }
  function worldOf(s, c, sx, sy) { var m = layerM(s, c, 1); return [(sx - m[1]) / m[0], (sy - m[2]) / m[0]]; }

  // ------------------------- locations -------------------------
  function grad(s, stops, vertical) {
    var id = uid("g");
    var g = svg("linearGradient", vertical === false ? { id: id, x1: 0, y1: 0, x2: 1, y2: 0 } : { id: id, x1: 0, y1: 0, x2: 0, y2: 1 }, s.defs);
    stops.forEach(function (st_) { svg("stop", { offset: st_[0], "stop-color": st_[1] }, g); });
    return "url(#" + id + ")";
  }
  function radial(s, defs, stops) {
    var id = uid("r");
    var g = svg("radialGradient", { id: id, cx: 0.5, cy: 0.5, r: 0.5 }, defs);
    stops.forEach(function (st_) { svg("stop", { offset: st_[0], "stop-color": st_[1], "stop-opacity": st_[2] == null ? 1 : st_[2] }, g); });
    return "url(#" + id + ")";
  }
  // Cel-shaded cumulus: shadow mass, then the lit mass offset up-left; flat bottom by a clip.
  function cloud(s, x, y, w, o) {
    o = o || {};
    w *= s.portrait ? 0.62 : s.square ? 0.8 : 1;
    var rnd = V.makeRand(Math.floor(x * 7 + y * 13 + w) + 5), n = o.n || 7, tall = o.tall || 0.5;
    var lit = o.lit || "#FFFFFF", sh = o.shade || "#C7D3F4", sh2 = o.shade2 || "#AEBEEB";
    var cid = uid("cl");
    var cp = svg("clipPath", { id: cid }, s.defs);
    svg("rect", { x: x - w, y: y - w * 3, width: w * 2, height: w * 3 }, cp);
    var bumps = [];
    for (var i = 0; i < n; i++) {
      var p = n > 1 ? i / (n - 1) : 0.5, mid = 1 - Math.abs(p - 0.5) * 2;
      var r = w * (0.1 + 0.1 * mid + rnd() * 0.05);
      bumps.push([x + (p - 0.5) * w * 0.86, y - r * 0.5 - mid * w * 0.12 * tall * 2, r]);
    }
    for (var j = 0; j < Math.round(n * 0.5); j++) {
      var p2 = 0.25 + (j / Math.max(1, Math.round(n * 0.5) - 1)) * 0.5, r2 = w * (0.12 + rnd() * 0.06);
      bumps.push([x + (p2 - 0.5) * w * 0.7, y - w * (0.22 + tall * 0.25) - rnd() * w * 0.05, r2]);
    }
    if (tall > 0.8) bumps.push([x + w * 0.02, y - w * (0.42 + tall * 0.2), w * 0.16], [x - w * 0.1, y - w * (0.36 + tall * 0.16), w * 0.12]);
    var m = '<g clip-path="url(#' + cid + ')">';
    bumps.forEach(function (b) { m += C(b[0], b[1], b[2], sh2); });
    m += R(x - w * 0.48, y - w * 0.12, w * 0.96, w * 0.14, sh2);
    bumps.forEach(function (b) { m += C(b[0] - b[2] * 0.06, b[1] - b[2] * 0.08, b[2] * 0.97, sh); });
    bumps.forEach(function (b) { m += C(b[0] - b[2] * 0.16, b[1] - b[2] * 0.22, b[2] * 0.86, lit); });
    m += "</g>";
    return m;
  }
  function paintLocation(s) {
    var Ww = s.Ww, X0 = -600, X1 = Ww + 600, XW = X1 - X0, Y0 = -500, Y1 = 1500, YH = Y1 - Y0;
    var rnd = V.makeRand(41 + LOCS.indexOf(s.loc) * 17);
    var out = { sky: "", far: "", mid: "", main: "" }, loc = s.loc, cx = Ww / 2;
    function each(step, start, fn) { for (var x = start; x < X1; x += step) fn(x, Math.round((x - start) / step)); }
    if (loc === "rooftop") {
      out.sky += R(X0, Y0, XW, YH, grad(s, [[0, "#2D74E6"], [0.45, "#5BA4F7"], [0.78, "#B4DEFF"], [1, "#E6F5FF"]]));
      out.far += cloud(s, cx - Ww * 0.34, 520, 620, { tall: 1, n: 8 }) + cloud(s, cx + Ww * 0.36, 470, 520, { tall: 0.9 }) + cloud(s, cx + Ww * 0.02, 300, 260, { tall: 0.3, n: 5 });
      var sk = "";
      for (var x = X0; x < X1; ) { var bw = 50 + rnd() * 90, bh = 40 + rnd() * 120; sk += R(x, 700 - bh, bw, bh + 300, "#9DB8E6"); x += bw + 4; }
      out.far += sk;
      var fence = "";
      each(230, X0, function (fx) { fence += R(fx - 6, 560, 12, 320, "#5E6E9E"); });
      var lines = "";
      for (var d = X0; d < X1 + 400; d += 34) lines += "M" + d + " 568L" + (d - 300) + " 868M" + (d - 300) + " 568L" + d + " 868";
      fence += P(lines, "none", SK("#7D8CBB", 2.2) + ' opacity="0.75"') + R(X0, 552, XW, 16, "#4F5E8E", 4) + R(X0, 860, XW, 12, "#4F5E8E", 4);
      out.mid += fence;
      out.main += R(X0, 860, XW, 700, "#C7C9DA") + R(X0, 860, XW, 14, "#AFB1C8");
      for (var gx = X0; gx < X1; gx += 160) out.main += L(gx, 880, gx - 60, 1500, "#B4B6CB", 3);
    } else if (loc === "sunset-city") {
      out.sky += R(X0, Y0, XW, YH, grad(s, [[0, "#2A1E5C"], [0.32, "#7A3A8E"], [0.55, "#FF6F91"], [0.72, "#FFA066"], [1, "#FFD08A"]]));
      out.far += C(cx + Ww * 0.16, 640, 170, "#FFE6A8", ' opacity="0.45"') + C(cx + Ww * 0.16, 640, 130, "#FFF3C8");
      for (var c1 = 0; c1 < 5; c1++) { var yy = 160 + c1 * 80 + rnd() * 30, xx = X0 + rnd() * XW; out.far += E(xx, yy, 260 + rnd() * 200, 16 + rnd() * 10, c1 % 2 ? "#FF9AB8" : "#C86FB0", ' opacity="0.85"'); }
      var cs = "";
      for (var x2 = X0; x2 < X1; ) { var bw2 = 70 + rnd() * 120, bh2 = 120 + rnd() * 260, by2 = 820 - bh2; cs += R(x2, by2, bw2, bh2 + 600, "#4A2B6E"); for (var wy = by2 + 26; wy < 800; wy += 44) for (var wx = x2 + 14; wx < x2 + bw2 - 20; wx += 30) if (rnd() > 0.72) cs += R(wx, wy, 14, 20, "#FFD48A"); x2 += bw2 + 6; }
      out.mid += cs;
      var pl = "";
      each(620, X0 + 120, function (px) { pl += R(px - 8, 180, 16, 1400, "#24163E") + R(px - 70, 230, 140, 12, "#24163E") + R(px - 54, 290, 108, 10, "#24163E"); });
      var wires = "";
      [236, 248, 296].forEach(function (wy2, k) { wires += "M" + X0 + " " + wy2; for (var wx2 = X0 + 120; wx2 < X1 + 620; wx2 += 620) wires += "Q" + (wx2 - 310) + " " + (wy2 + 70 + k * 10) + " " + wx2 + " " + wy2; });
      out.main += P(wires, "none", SK("#24163E", 3)) + pl;
    } else if (loc === "classroom") {
      var B = s.board;
      out.sky += R(X0, Y0, XW, YH, "#F3E9DA");
      out.far += R(X0, 0, XW, 40, "#E2D3BC");
      var winX = s.portrait ? -1e5 : B.x + B.w + 110;
      if (!s.portrait) {
        for (var wi = 0; wi < 3; wi++) {
          var wx3 = winX + wi * 300; if (wx3 > X1) break;
          out.far += R(wx3, 120, 250, 520, "#FFFFFF", 6) + R(wx3 + 14, 134, 222, 492, grad(s, [[0, "#5BA4F7"], [1, "#CDEBFF"]])) + cloud(s, wx3 + 130, 420, 170, { tall: 0.6, n: 5 }) + R(wx3 + 119, 134, 12, 492, "#FFFFFF") + R(wx3 + 14, 370, 222, 10, "#FFFFFF");
        }
      } else {
        out.far += R(-150, 560, 140, 260, "#FFFFFF", 6) + R(-140, 570, 120, 240, "#A9D6FF") + R(Ww + 10, 560, 140, 260, "#FFFFFF", 6) + R(Ww + 20, 570, 120, 240, "#A9D6FF");
      }
      out.mid += R(B.x - 22, B.y - 22, B.w + 44, B.h + 44, "#A8743F", 10, SK("#6E4A28", 4)) + R(B.x, B.y, B.w, B.h, "#2F5E4E") + R(B.x, B.y, B.w, B.h * 0.16, "#386B5A") + R(B.x - 30, B.y + B.h + 14, B.w + 60, 18, "#8F6234", 4) + R(B.x + B.w * 0.7, B.y + B.h + 6, 40, 10, "#FFFFFF", 3) + R(B.x + B.w * 0.78, B.y + B.h + 6, 30, 10, "#FFE08A", 3);
      if (!s.cleanBoard) {
        var bx = B.x, by = B.y, bw = B.w, bh = B.h, ch = SK("#E8F1E8", 5) + ' opacity="0.42"';
        out.mid += P("M" + f1(bx + bw * 0.08) + " " + f1(by + bh * 0.3) + "q" + f1(bw * 0.05) + " -" + f1(bh * 0.12) + " " + f1(bw * 0.1) + " 0t" + f1(bw * 0.1) + " 0t" + f1(bw * 0.1) + " 0", "none", ch);
        out.mid += P("M" + f1(bx + bw * 0.08) + " " + f1(by + bh * 0.55) + "h" + f1(bw * 0.3) + "M" + f1(bx + bw * 0.08) + " " + f1(by + bh * 0.7) + "h" + f1(bw * 0.2), "none", ch);
        out.mid += C(bx + bw * 0.74, by + bh * 0.42, Math.min(bw, bh) * 0.16, "none", ch) + P("M" + f1(bx + bw * 0.62) + " " + f1(by + bh * 0.78) + "l" + f1(bw * 0.24) + " -" + f1(bh * 0.5), "none", SK("#FFD166", 5) + ' opacity="0.5"');
      }
      if (!s.portrait) out.mid += C(B.x + B.w + 56, 90, 30, "#FFFFFF", SK(INK, 4)) + L(B.x + B.w + 56, 90, B.x + B.w + 56, 70, INK, 4) + L(B.x + B.w + 56, 90, B.x + B.w + 70, 96, INK, 4);
      out.main += R(X0, 760, XW, 800, "#DCC4A0") + R(X0, 752, XW, 12, "#C4A77D");
      each(360, X0 + 40, function (dx) { out.main += R(dx, 860, 230, 26, "#D9A869", 6, SK("#8A6234", 3)) + R(dx + 20, 886, 16, 400, "#7B6A8C") + R(dx + 194, 886, 16, 400, "#7B6A8C"); });
    } else if (loc === "train") {
      out.sky += R(X0, Y0, XW, YH, "#EBDCCB");
      var win = "";
      each(420, X0, function (wx4) {
        win += R(wx4, 180, 330, 300, "#7A6A8A", 22) + R(wx4 + 14, 194, 302, 272, grad(s, [[0, "#FF8A7A"], [0.6, "#FFB870"], [1, "#FFE0A0"]]), 16);
      });
      out.far += win;
      s.trainWin = svg("g", null, s.L.far);
      var sil = "";
      for (var x5 = X0; x5 < X1 + 900; ) { var bw5 = 40 + rnd() * 80, bh5 = 60 + rnd() * 140; sil += R(x5, 466 - bh5, bw5, bh5, "#6A4A78"); x5 += bw5 + 10; }
      var wcid = uid("tw"), wcp = svg("clipPath", { id: wcid }, s.defs);
      each(420, X0, function (wx4) { svg("rect", { x: wx4 + 14, y: 194, width: 302, height: 272, rx: 16 }, wcp); });
      s.trainWin.setAttribute("clip-path", "url(#" + wcid + ")");
      s.trainSil = svg("g", null, s.trainWin);
      s.trainSil.innerHTML = sil;
      s.anims.push(function (t) { setA(s.trainSil, "transform", "translate(" + f1(-mod(t * 260, 900)) + " 0)"); });
      out.mid += R(X0, 90, XW, 14, "#C9C2D6") + R(X0, 520, XW, 40, "#D6C6B2");
      each(210, X0 + 60, function (hx) { out.mid += R(hx - 3, 100, 6, 110, "#B9B2C6") + P("M" + (hx - 22) + " 210L" + (hx + 22) + " 210L" + hx + " 248Z", "none", SK("#F3EEF8", 9)) + P("M" + (hx - 22) + " 210L" + (hx + 22) + " 210L" + hx + " 248Z", "none", SK("#8C84A6", 3)); });
      each(840, X0 + 380, function (px) { out.mid += R(px - 9, 0, 18, 1500, "#E8C26A", 9, SK("#B58F3A", 3)); });
      out.main += R(X0, 780, XW, 120, "#5E7BC4", 0) + R(X0, 770, XW, 18, "#7C97D8") + R(X0, 900, XW, 700, "#8E8AA6");
    } else if (loc === "night-city") {
      out.sky += R(X0, Y0, XW, YH, grad(s, [[0, "#0A0926"], [0.5, "#241B58"], [0.8, "#4B2E7A"], [1, "#6A3A86"]]));
      var stars = "";
      for (var i6 = 0; i6 < 70; i6++) stars += C(X0 + rnd() * XW, -200 + rnd() * 720, 1.2 + rnd() * 2.4, "#FFFFFF", ' opacity="' + f2(0.4 + rnd() * 0.6) + '"');
      out.sky += stars + C(cx + Ww * 0.3, 160, 52, "#FFF6D8") + C(cx + Ww * 0.3 + 22, 146, 46, "#1A1446");
      var fb = "";
      for (var x6 = X0; x6 < X1; ) { var bw6 = 60 + rnd() * 100, bh6 = 220 + rnd() * 300; fb += R(x6, 760 - bh6, bw6, bh6 + 800, "#1D1846"); for (var wy6 = 760 - bh6 + 20; wy6 < 740; wy6 += 30) for (var wx6 = x6 + 10; wx6 < x6 + bw6 - 12; wx6 += 22) if (rnd() > 0.7) fb += R(wx6, wy6, 9, 12, rnd() > 0.5 ? "#FFD86B" : "#7FE3FF", ' opacity="0.8"'); x6 += bw6 + 8; }
      out.far += fb;
      var mb = "", neon = ["#FF4FA0", "#3FF0FF", "#FFE14F", "#B07BFF"];
      for (var x7 = X0, q = 0; x7 < X1; q++) {
        var bw7 = 150 + rnd() * 120, bh7 = 300 + rnd() * 260, by7 = 880 - bh7, nc = neon[q % 4];
        mb += R(x7, by7, bw7, bh7 + 800, "#271F55") + R(x7, by7, 10, bh7 + 800, "#1A1440");
        for (var wy7 = by7 + 30; wy7 < 840; wy7 += 54) for (var wx7 = x7 + 22; wx7 < x7 + bw7 - 30; wx7 += 40) if (rnd() > 0.5) mb += R(wx7, wy7, 18, 26, "#3B3274");
        var sx7 = x7 + bw7 * 0.2, sy7 = by7 + 40 + rnd() * 80, sw7 = bw7 * 0.6, sh7 = 70 + rnd() * 50;
        if (q % 2) mb += R(sx7 - 4, sy7 - 4, sw7 + 8, sh7 + 8, nc, 12, ' opacity="0.35"') + R(sx7, sy7, sw7, sh7, "#150F33", 10, SK(nc, 6)) + R(sx7 + 16, sy7 + sh7 / 2 - 5, sw7 - 32, 10, nc, 5) + R(sx7 + 16, sy7 + sh7 / 2 - 2, sw7 - 32, 4, "#FFFFFF", 2);
        else mb += R(sx7 + sw7 * 0.3, sy7, 28, 200, "#150F33", 8, SK(nc, 5)) + C(sx7 + sw7 * 0.3 + 14, sy7 + 40, 7, nc) + C(sx7 + sw7 * 0.3 + 14, sy7 + 90, 7, nc) + C(sx7 + sw7 * 0.3 + 14, sy7 + 140, 7, nc);
        x7 += bw7 + 20;
      }
      out.mid += mb;
      out.main += R(X0, 880, XW, 700, "#140F30") + R(X0, 880, XW, 8, "#FF4FA0", 0, ' opacity="0.7"');
      for (var x8 = X0; x8 < X1; x8 += 90) out.main += R(x8, 920 + (x8 % 3) * 20, 40, 5, "#3FF0FF", 2, ' opacity="0.35"');
    } else if (loc === "shrine") {
      out.sky += R(X0, Y0, XW, YH, grad(s, [[0, "#8FD0FF"], [0.55, "#CDEBFF"], [0.8, "#FFE6F0"], [1, "#FFF2F6"]]));
      out.sky += cloud(s, cx - Ww * 0.2, 260, 360, { tall: 0.4, n: 6 });
      out.far += P("M" + X0 + " 700L" + (cx - 700) + " 420L" + (cx - 380) + " 600L" + (cx - 100) + " 380L" + (cx + 300) + " 640L" + (cx + 600) + " 460L" + X1 + " 700V1500H" + X0 + "Z", "#C3CFF0") + P("M" + (cx - 100) + " 380L" + (cx - 40) + " 430L" + (cx - 140) + " 420Z", "#FFFFFF");
      function sakura(tx, ty, r) {
        var m = R(tx - 14, ty, 28, 900, "#6B4A5A", 8) + P("M" + tx + " " + (ty + 60) + "L" + (tx - 80) + " " + (ty - 30) + "M" + tx + " " + (ty + 100) + "L" + (tx + 90) + " " + (ty + 10), "none", SK("#6B4A5A", 14));
        var cl = "";
        for (var k = 0; k < 9; k++) { var a_ = (k / 9) * PI * 2, rr = r * (0.45 + rnd() * 0.25); cl += C(tx + Math.cos(a_) * r * 0.7, ty - 40 + Math.sin(a_) * r * 0.45, rr, "#F49CC0"); }
        for (k = 0; k < 9; k++) { var a2 = (k / 9) * PI * 2, r2 = r * (0.4 + rnd() * 0.2); cl += C(tx + Math.cos(a2) * r * 0.6 - 14, ty - 56 + Math.sin(a2) * r * 0.4, r2, "#FFBBD6"); }
        cl += C(tx - 30, ty - 90, r * 0.35, "#FFD9E8");
        return m + cl;
      }
      var trees = "";
      [cx - Ww * 0.5 - 140, cx + Ww * 0.5 + 120, cx - Ww * 0.25 - 400, cx + Ww * 0.25 + 400].forEach(function (tx2, k) { trees += sakura(tx2, 250 + k * 30, 230); });
      out.mid += trees;
      var tx3 = s.portrait ? cx : cx + Ww * 0.05, tw = s.portrait ? 460 : 620;
      out.mid += R(tx3 - tw * 0.36, 230, 40, 1300, "#E8344E", 0, SK("#8A1A2E", 3)) + R(tx3 + tw * 0.36 - 40, 230, 40, 1300, "#E8344E", 0, SK("#8A1A2E", 3)) + R(tx3 - tw * 0.44, 280, tw * 0.88, 30, "#E8344E", 0, SK("#8A1A2E", 3)) + P("M" + (tx3 - tw * 0.56) + " 196Q" + tx3 + " 214 " + (tx3 + tw * 0.56) + " 196L" + (tx3 + tw * 0.52) + " 232Q" + tx3 + " 246 " + (tx3 - tw * 0.52) + " 232Z", "#2A1A2E") + R(tx3 - tw * 0.5, 226, tw, 22, "#E8344E", 0, SK("#8A1A2E", 3)) + R(tx3 - 26, 248, 52, 32, "#2A1A2E");
      out.main += R(X0, 830, XW, 800, "#EADFD2") + P("M" + (cx - 120) + " 830L" + (cx + 120) + " 830L" + (cx + 420) + " 1500L" + (cx - 420) + " 1500Z", "#D4C6B8");
      for (var st2 = 850; st2 < 1500; st2 += 70) out.main += L(cx - 130 - (st2 - 830) * 0.45, st2, cx + 130 + (st2 - 830) * 0.45, st2, "#C2B3A4", 3);
      petals(s, 0, 1e9, { count: s.portrait ? 10 : 16, ambient: true });
    } else if (loc === "space") {
      out.sky += R(X0, Y0, XW, YH, grad(s, [[0, "#04031A"], [0.6, "#140E44"], [1, "#2A1A66"]]));
      out.sky += E(cx - Ww * 0.3, 300, 520, 200, "#5B3AAE", ' opacity="0.32"') + E(cx + Ww * 0.2, 700, 620, 220, "#E05AA8", ' opacity="0.2"');
      var st3 = "";
      for (var i9 = 0; i9 < 150; i9++) st3 += C(X0 + rnd() * XW, Y0 + rnd() * YH, 1 + rnd() * 2.6, "#FFFFFF", ' opacity="' + f2(0.35 + rnd() * 0.65) + '"');
      for (i9 = 0; i9 < 10; i9++) st3 += P(sparkD(X0 + rnd() * XW, -100 + rnd() * 1000, 8 + rnd() * 10), "#FFFFFF");
      out.sky += st3;
      out.far += C(cx + Ww * 0.32, 260, 120, "#FF9F68") + P("M" + (cx + Ww * 0.32 - 120) + " 260A120 120 0 0 0 " + (cx + Ww * 0.32 + 120) + " 260Z", "#E57A48") + E(cx + Ww * 0.32, 260, 210, 40, "none", SK("#FFD3A8", 10)) + P("M" + (cx + Ww * 0.32 - 210) + " 260A210 40 0 0 0 " + (cx + Ww * 0.32 + 210) + " 260", "none", SK("#FFD3A8", 10)) + C(cx - Ww * 0.36, 180, 40, "#C9C3F0") + C(cx - Ww * 0.36 - 12, 170, 10, "#AFA6E0");
      out.main += C(cx, 1500, 760, "#3A2E7A") + C(cx, 1500, 760, "none", SK("#6E5FC4", 8));
    } else if (loc === "sky") {
      out.sky += R(X0, Y0, XW, YH, grad(s, [[0, "#1E62D8"], [0.4, "#4C9CF5"], [0.75, "#9ED3FF"], [1, "#EAF7FF"]]));
      out.sky += C(cx + Ww * 0.36, 90, 90, "#FFFFFF", ' opacity="0.5"') + C(cx + Ww * 0.36, 90, 56, "#FFFFFF");
      out.far += cloud(s, cx - Ww * 0.28, 640, 760, { tall: 1.2, n: 9 }) + cloud(s, cx + Ww * 0.34, 600, 600, { tall: 1, n: 8 });
      out.mid += cloud(s, cx + Ww * 0.05, 820, 520, { tall: 0.5, n: 7 }) + cloud(s, cx - Ww * 0.6, 860, 520, { tall: 0.4 }) + cloud(s, cx + Ww * 0.62, 880, 520, { tall: 0.4 });
      out.main += R(X0, 920, XW, 700, "#F4F8FF") + cloud(s, cx - 400, 960, 700, { tall: 0.2, n: 9 }) + cloud(s, cx + 400, 980, 700, { tall: 0.2, n: 9 });
    } else if (loc === "meadow") {
      out.sky += R(X0, Y0, XW, YH, grad(s, [[0, "#3C8CF0"], [0.6, "#9FD4FF"], [1, "#E4F6FF"]]));
      out.sky += cloud(s, cx - Ww * 0.32, 360, 420, { tall: 0.7 }) + cloud(s, cx + Ww * 0.3, 250, 300, { tall: 0.5, n: 6 });
      out.far += P("M" + X0 + " 640Q" + (cx - 500) + " 520 " + (cx - 100) + " 620T" + (cx + 700) + " 600T" + X1 + " 620V1500H" + X0 + "Z", "#A8DB86");
      var tx4 = s.portrait ? cx + Ww * 0.25 : cx + Ww * 0.26;
      out.mid += P("M" + X0 + " 760Q" + (cx - 300) + " 640 " + (tx4 - 60) + " 640Q" + (tx4 + 300) + " 640 " + X1 + " 740V1500H" + X0 + "Z", "#6FC867") + P("M" + X0 + " 760Q" + (cx - 300) + " 640 " + (tx4 - 60) + " 640Q" + (cx - 400) + " 700 " + X0 + " 820Z", "#86D67A");
      out.mid += R(tx4 - 14, 470, 28, 190, "#7A5040", 6) + C(tx4, 430, 110, "#3E9A55") + C(tx4 - 70, 470, 70, "#3E9A55") + C(tx4 + 70, 466, 74, "#3E9A55") + C(tx4 - 20, 410, 86, "#56B66A") + C(tx4 - 50, 380, 44, "#7FD08A");
      out.main += R(X0, 860, XW, 700, "#5BB85A");
      var gr = "";
      for (var g9 = X0; g9 < X1; g9 += 46) gr += "M" + f1(g9) + " " + f1(900 + (g9 % 5) * 9) + "l8 -26l8 26";
      out.main += P(gr, "none", SK("#3E9A48", 4));
      for (var fl = 0; fl < 40; fl++) out.main += C(X0 + rnd() * XW, 880 + rnd() * 300, 6, ["#FFFFFF", "#FFE066", "#FF9EC0"][fl % 3]);
    } else {
      var col = s.color || "#FFE3F1";
      out.sky += R(X0, Y0, XW, YH, col);
      var dots = "", dc = tint(col, 0.55);
      for (var dy = Y0; dy < Y1; dy += 90) for (var dx2 = X0 + ((dy / 90) % 2) * 45; dx2 < X1; dx2 += 90) dots += C(dx2, dy, 14, dc);
      out.far += dots;
    }
    for (var k in out) if (out[k]) s.L[k].insertAdjacentHTML("afterbegin", out[k]);
  }

  // ------------------------- shot effects -------------------------
  function frac(v, d) { v = num(v, d); return v; }
  function screenXY(o, dx, dy) { return [frac(o.x, dx) * W, frac(o.y, dy) * H]; }
  function bgRect(g, color) { return svg("rect", { x: -200, y: -200, width: W + 400, height: H + 400, fill: color }, g); }
  function focusLines(s, from, to, o) {
    o = obj(o);
    from = tc0(from); to = num(to, D);
    var layer = o.layer === "under" ? "under" : "over";
    var parent = layer === "under" ? s.underG : s.overG;
    var g = svg("g", null, parent);
    var bg = o.bg ? bgRect(g, o.bg) : null;
    var c = screenXY(o, 0.5, PORT ? 0.42 : 0.45), inner = num(o.inner, 0.34) * Math.min(W, H) * (PORT ? 1.05 : 1);
    var col = o.color || (o.bg && /^#f/i.test(o.bg) ? INK : layer === "under" ? INK : "#FFFFFF");
    var Rout = Math.sqrt(W * W + H * H);
    var variants = [];
    for (var v = 0; v < 3; v++) {
      var rnd = V.makeRand(911 + v * 37 + s.id * 5), d = "", n = 150;
      for (var i = 0; i < n; i++) {
        var a0 = (i / n) * PI * 2 + rnd() * 0.04, wd = 0.006 + rnd() * 0.016, ri = inner * (1 + rnd() * 0.5);
        var ex = PORT ? 0.78 : 1.25;
        var tip = [c[0] + Math.cos(a0) * ri * ex, c[1] + Math.sin(a0) * ri];
        var b1 = [c[0] + Math.cos(a0 - wd) * Rout, c[1] + Math.sin(a0 - wd) * Rout], b2 = [c[0] + Math.cos(a0 + wd) * Rout, c[1] + Math.sin(a0 + wd) * Rout];
        d += "M" + f1(tip[0]) + " " + f1(tip[1]) + "L" + f1(b1[0]) + " " + f1(b1[1]) + "L" + f1(b2[0]) + " " + f1(b2[1]) + "Z";
      }
      variants.push(svg("path", { d: d, fill: col, opacity: num(o.opacity, layer === "under" ? 0.9 : 0.75) }, g));
    }
    if (layer === "under" && o.bg) s.bgHide.push([from, to]);
    s.anims.push(function (t) {
      var on = t >= from && t < to;
      showEl(g, on);
      if (!on) return;
      var fr = Math.floor(t * 12) % 3;
      variants.forEach(function (p, i) { showEl(p, i === fr); });
    });
  }
  function speedLines(s, from, to, o) {
    o = obj(o);
    from = tc0(from); to = num(to, D);
    var dir = str(o.dir) || "h";
    var layer = o.layer === "over" || (!o.bg && o.layer !== "under") ? "over" : "under";
    var parent = layer === "under" ? s.underG : s.overG;
    var g = svg("g", null, parent);
    if (o.bg) bgRect(g, o.bg);
    var col = o.color || (o.bg ? "#FFFFFF" : "#FFFFFF");
    var rot = dir === "v" || dir === "up" ? 90 : dir === "diag" ? -28 : 0;
    var span = Math.sqrt(W * W + H * H) * 1.2, rnd = V.makeRand(77 + s.id * 3);
    var rg = svg("g", { transform: "rotate(" + rot + " " + W / 2 + " " + H / 2 + ")" }, g);
    var tiles = [];
    var d = "";
    for (var i = 0; i < 70; i++) {
      var y = W / 2 - span / 2 + rnd() * span, x = rnd() * span, len = span * (0.08 + rnd() * 0.3), th = 2 + rnd() * 7;
      d += "M" + f1(x) + " " + f1(y) + "h" + f1(len) + "v" + f1(th) + "h" + f1(-len) + "Z";
    }
    for (var k = 0; k < 2; k++) {
      var tg = svg("g", null, rg);
      svg("path", { d: d, fill: col, opacity: num(o.lineOpacity, o.bg ? 0.55 : 0.6) }, tg);
      tiles.push(tg);
    }
    var x0 = W / 2 - span / 2, speed = num(o.speed, 2.6) * W;
    if (o.bg) s.bgHide.push([from, to]);
    s.anims.push(function (t) {
      var on = t >= from && t < to;
      showEl(g, on);
      if (!on) return;
      var off = -mod(t * speed, span);
      setA(tiles[0], "transform", "translate(" + f1(x0 + off) + " 0)");
      setA(tiles[1], "transform", "translate(" + f1(x0 + off + span) + " 0)");
    });
  }
  function aura(s, actor, from, to, o) {
    o = obj(o);
    if (!actor || !actor.__actor) return;
    var a = actor._a, cols = auraCols(o.color, a.cd);
    if (o.color2) cols = [cols[0], o.color2];
    from = tc0(from); to = num(to, D);
    var g = svg("g", a.clipId ? { "clip-path": "url(#" + a.clipId + ")" } : null, s.L.aura);
    var p1 = svg("path", { fill: cols[0], opacity: 0.85, stroke: shade(hex6(cols[0]).length === 7 ? hex6(cols[0]) : "#FF5C9A", 0.75), "stroke-width": 5 }, g);
    var p2 = svg("path", { fill: cols[1], opacity: 0.9 }, g);
    var ring = svg("ellipse", { fill: "none", stroke: cols[1], "stroke-width": 8, opacity: 0.8 }, g);
    var sparks = [];
    for (var i = 0; i < 16; i++) sparks.push({ el: svg("path", { d: sparkD(0, 0, 9 + (i % 3) * 4), fill: i % 2 ? "#FFFFFF" : cols[1] }, g), x: hash(i * 3.1 + a.seed) - 0.5, ph: hash(i * 7.7 + 1), sp: 0.6 + hash(i * 1.9) * 0.7 });
    function shapeD(cx, cy, rx, ry, t, k) {
      var pts = [], n = 40;
      for (var j = 0; j < n; j++) {
        var th = (j / n) * PI * 2, up = Math.max(0, -Math.sin(th));
        var r = 1 + 0.08 * Math.sin(th * 7 + t * 13) + 0.05 * Math.sin(th * 11 - t * 19) + up * (0.22 + 0.18 * Math.sin(th * 9 + t * 17)) * k;
        if (j % 2) r *= 1 + up * 0.32; else r *= 1 - up * 0.08;
        pts.push([cx + Math.cos(th) * rx * r, cy + Math.sin(th) * ry * r]);
      }
      // flame tongues: sharp tips on odd points, rounded valleys through the even ones
      var d = "";
      for (var q = 0; q < n; q += 2) {
        var a0 = pts[q], a1 = pts[(q + 1) % n], a2 = pts[(q + 2) % n];
        if (!q) d += "M" + f1(a0[0]) + " " + f1(a0[1]);
        d += "Q" + f1(lerp(a0[0], a1[0], 0.7)) + " " + f1(lerp(a0[1], a1[1], 0.7)) + " " + f1(a1[0]) + " " + f1(a1[1]) + "Q" + f1(lerp(a2[0], a1[0], 0.7)) + " " + f1(lerp(a2[1], a1[1], 0.7)) + " " + f1(a2[0]) + " " + f1(a2[1]);
      }
      return d + "Z";
    }
    s.anims.push(function (t) {
      var on = t >= from && t < to && a.vis.val(t) >= 0.5;
      showEl(g, on);
      if (!on) return;
      var grow = num(o.grow, 1) * smooth((t - from) / 0.4) * (1 - smooth((t - (to - 0.15)) / 0.15));
      var p = a.pos.val(t), sc = a.sc, cx = p.x, cy = p.y + 120 * sc;
      var rx = (a.mascot ? 170 : 250) * sc * (0.4 + 0.6 * grow), ry = (a.mascot ? 200 : 380) * sc * (0.4 + 0.6 * grow);
      setA(p1, "d", shapeD(cx, cy, rx, ry, t, 1.2));
      setA(p2, "d", shapeD(cx, cy + 20 * sc, rx * 0.74, ry * 0.74, t + 0.5, 0.9));
      setA(g, "opacity", f2(clamp(grow * 1.2, 0, 1)));
      var rp = mod((t - from) * 1.4, 1);
      setA(ring, "cx", f1(cx)); setA(ring, "cy", f1(p.y + 320 * sc)); setA(ring, "rx", f1(rx * (0.6 + rp * 0.9))); setA(ring, "ry", f1(40 * sc * (0.6 + rp * 0.9))); setA(ring, "opacity", f2((1 - rp) * 0.8));
      sparks.forEach(function (sp) {
        var q = mod(sp.ph + (t - from) * sp.sp, 1);
        var x = cx + sp.x * rx * 1.6, y = cy + ry * 0.8 - q * ry * 2.2;
        setA(sp.el, "transform", "translate(" + f1(x) + " " + f1(y) + ") scale(" + f2(sc * (1 - q) * 1.2) + ")");
      });
    });
  }
  function sparkles(s, from, to, o) {
    o = obj(o);
    from = tc0(from); to = num(to, D);
    var n = clamp(Math.round(num(o.count, 14)), 1, 60), area = arr(o.area).length === 4 ? o.area : [0.05, 0.08, 0.9, 0.8];
    var g = svg("g", null, s.overG), list = [], size = num(o.size, 26), col = o.color || "#FFFFFF";
    for (var i = 0; i < n; i++) {
      var x = (area[0] + hash(i * 3.3 + s.id) * area[2]) * W, y = (area[1] + hash(i * 5.1 + s.id + 2) * area[3]) * H;
      list.push({ el: svg("path", { d: sparkD(0, 0, size * (0.5 + hash(i * 2.2) * 0.8)), fill: i % 3 ? col : "#FFF3A0", stroke: "#B9A8FF", "stroke-width": 1.5 }, g), x: x, y: y, ph: hash(i * 9.1), sp: 1.4 + hash(i * 4.4) * 1.6 });
    }
    s.anims.push(function (t) {
      var on = t >= from && t < to;
      showEl(g, on);
      if (!on) return;
      list.forEach(function (q) {
        var k = Math.max(0, Math.sin((t * q.sp + q.ph) * PI * 2));
        setA(q.el, "transform", "translate(" + f1(q.x) + " " + f1(q.y) + ") scale(" + f2(k) + ") rotate(" + f1(t * 40) + ")");
      });
    });
  }
  var PETAL_D = "M0 -12C8 -10 12 -2 10 6C8 12 2 14 0 10C-2 14 -8 12 -10 6C-12 -2 -8 -10 0 -12Z";
  function petals(s, from, to, o) {
    o = obj(o);
    from = tc0(from); to = num(to, 1e9);
    var n = clamp(Math.round(num(o.count, PORT ? 14 : 22)), 1, 80), col = o.color || "#FFB7D0";
    var g = svg("g", null, o.ambient ? s.L.front : s.overG), list = [];
    for (var i = 0; i < n; i++) {
      list.push({ el: svg("path", { d: PETAL_D, fill: i % 4 ? col : "#FFD6E6", stroke: "#E57AA3", "stroke-width": 1.5 }, g), x: hash(i * 3.7 + s.id * 0.3), ph: hash(i * 6.1 + 4), sp: 0.12 + hash(i * 2.9) * 0.12, sw: 20 + hash(i * 1.3) * 50, sc: 0.8 + hash(i * 8.8) * 1.2 });
    }
    s.anims.push(function (t, c) {
      var on = t >= from && t < to;
      showEl(g, on);
      if (!on) return;
      list.forEach(function (q, i) {
        var yy = mod(q.ph + t * q.sp, 1), x, y;
        if (o.ambient) { x = -300 + q.x * (s.Ww + 600) + Math.sin(t * 1.3 + i) * q.sw - yy * 200; y = -100 + yy * 1200; }
        else { x = q.x * (W + 200) - 100 + Math.sin(t * 1.3 + i) * q.sw - yy * 160; y = -60 + yy * (H + 120); }
        setA(q.el, "transform", "translate(" + f1(x) + " " + f1(y) + ") rotate(" + f1(t * 90 + i * 40) + ") scale(" + f2(q.sc * (o.ambient ? 1.3 : u(1.3))) + " " + f2(q.sc * 0.8 * (0.6 + 0.4 * Math.sin(t * 3 + i))) + ")");
      });
    });
  }
  function burstD(cx, cy, r, n, seed) {
    var d = "";
    for (var i = 0; i < n * 2; i++) { var a0 = (i / (n * 2)) * PI * 2, rr = i % 2 ? r * (0.45 + hash(seed + i) * 0.12) : r * (0.85 + hash(seed + i * 2.3) * 0.3); d += (i ? "L" : "M") + f1(cx + Math.cos(a0) * rr) + " " + f1(cy + Math.sin(a0) * rr); }
    return d + "Z";
  }
  function burst(s, at, o) {
    o = obj(o);
    at = tc0(at);
    var c = screenXY(o, 0.5, 0.45), r = num(o.r, 0.28) * Math.min(W, H);
    var g = svg("g", null, o.under ? s.underG : s.overG);
    svg("path", { d: burstD(0, 0, r, 14, 3), fill: "#FFFFFF", stroke: INK, "stroke-width": u(6) }, g);
    svg("path", { d: burstD(0, 0, r * 0.62, 12, 9), fill: o.color || "#FFE14F" }, g);
    svg("path", { d: burstD(0, 0, r * 0.34, 10, 15), fill: "#FFFFFF" }, g);
    s.anims.push(function (t) {
      var on = t >= at && t < at + 0.6;
      showEl(g, on);
      if (!on) return;
      var p = (t - at) / 0.6, k = p < 0.25 ? CE.snap(p / 0.25) : 1;
      setA(g, "transform", "translate(" + f1(c[0]) + " " + f1(c[1]) + ") scale(" + f2(k * (1 + p * 0.15)) + ") rotate(" + f1(p * 12) + ")");
      setA(g, "opacity", f2(1 - smooth((p - 0.6) / 0.4)));
    });
  }
  function rings(s, at, o) {
    o = obj(o);
    at = tc0(at);
    var c = screenXY(o, 0.5, 0.5), g = svg("g", null, s.overG), list = [];
    for (var i = 0; i < 3; i++) list.push(svg("ellipse", { fill: "none", stroke: i % 2 ? INK : "#FFFFFF", "stroke-width": u(10 - i * 2) }, g));
    s.anims.push(function (t) {
      var on = t >= at && t < at + 0.9;
      showEl(g, on);
      if (!on) return;
      list.forEach(function (el, i) {
        var p = clamp((t - at - i * 0.08) / 0.7, 0, 1), r = Math.min(W, H) * (0.08 + p * 0.7);
        setA(el, "cx", f1(c[0])); setA(el, "cy", f1(c[1])); setA(el, "rx", f1(r * (PORT ? 1 : 1.3))); setA(el, "ry", f1(r * 0.5)); setA(el, "opacity", f2((1 - p) * (p > 0 ? 1 : 0)));
      });
    });
  }
  // enter streaks for whip pans and crash zooms
  function buildEnter(s) {
    var en = s.enter;
    if (en === "cut") return;
    var g = svg("g", null, s.enterG), d = "", rnd = V.makeRand(300 + s.id);
    if (en === "zoom") {
      for (var i = 0; i < 70; i++) { var a0 = (i / 70) * PI * 2 + rnd() * 0.05, r0 = Math.min(W, H) * (0.3 + rnd() * 0.3), r1 = Math.max(W, H); d += "M" + f1(W / 2 + Math.cos(a0) * r0) + " " + f1(H / 2 + Math.sin(a0) * r0) + "L" + f1(W / 2 + Math.cos(a0 + 0.012) * r1) + " " + f1(H / 2 + Math.sin(a0 + 0.012) * r1) + "L" + f1(W / 2 + Math.cos(a0 - 0.012) * r1) + " " + f1(H / 2 + Math.sin(a0 - 0.012) * r1) + "Z"; }
    } else if (en === "whip-left" || en === "whip-right") {
      for (var j = 0; j < 60; j++) { var y = rnd() * H, len = W * (0.3 + rnd() * 0.7), x = rnd() * W - len / 2; d += "M" + f1(x) + " " + f1(y) + "h" + f1(len) + "v" + f1(2 + rnd() * 10) + "h" + f1(-len) + "Z"; }
    } else {
      for (var k = 0; k < 50; k++) { var x2 = rnd() * W, len2 = H * (0.3 + rnd() * 0.6), y2 = rnd() * H - len2 / 2; d += "M" + f1(x2) + " " + f1(y2) + "v" + f1(len2) + "h" + f1(2 + rnd() * 8) + "v" + f1(-len2) + "Z"; }
    }
    svg("path", { d: d, fill: "#FFFFFF", opacity: 0.85 }, g);
    s.anims.push(function (t) {
      var dt = t - s.from, on = dt >= 0 && dt < 0.26;
      showEl(g, on);
      if (on) setA(g, "opacity", f2(1 - dt / 0.26));
    });
  }

  // ------------------------- film effects -------------------------
  function impact(at, o) {
    var F = getFilm();
    o = obj(o);
    at = tc0(at);
    F.impacts.push({ at: at, dur: 0.13, invert: o.invert !== false });
    if (o.flash !== false) F.flashes.push({ at: at + 0.12, dur: 0.2, color: "#FFFFFF" });
    if (o.shake !== false) F.shakes.push({ at: at, amp: num(o.shake, 20), dur: 0.45 });
    var c = screenXY(o, 0.5, 0.45), g = svg("g", null, F.ffxG), d = "", rnd = V.makeRand(700 + F.impacts.length * 11);
    var R0 = Math.sqrt(W * W + H * H);
    for (var i = 0; i < 46; i++) { var a0 = (i / 46) * PI * 2 + rnd() * 0.08, w0 = 0.02 + rnd() * 0.05, ri = Math.min(W, H) * (0.06 + rnd() * 0.12); d += "M" + f1(c[0] + Math.cos(a0) * ri) + " " + f1(c[1] + Math.sin(a0) * ri) + "L" + f1(c[0] + Math.cos(a0 - w0) * R0) + " " + f1(c[1] + Math.sin(a0 - w0) * R0) + "L" + f1(c[0] + Math.cos(a0 + w0) * R0) + " " + f1(c[1] + Math.sin(a0 + w0) * R0) + "Z"; }
    var p = svg("path", { d: d, fill: INK }, g);
    F.anims.push(function (t) {
      var on = t >= at && t < at + 0.13;
      showEl(g, on);
      if (on) setA(p, "fill", Math.floor((t - at) * 24) % 2 ? "#FFFFFF" : INK);
    });
  }
  function flash(at, color, dur) { getFilm().flashes.push({ at: tc0(at), dur: Math.max(0.05, num(dur, 0.25)), color: color || "#FFFFFF" }); }
  function shakeFrame(at, amp, dur) { getFilm().shakes.push({ at: tc0(at), amp: num(amp, 16), dur: Math.max(0.05, num(dur, 0.4)) }); }
  function stripes(at, dur) {
    var F = getFilm();
    at = tc0(at); dur = Math.max(0.2, num(dur, 0.6));
    var g = svg("g", null, F.top), cols = [ACC, "#FFFFFF", "#2B3567", GOLD, ACC, "#FFFFFF", "#7A5BD6"], span = W + H * 0.7;
    var band = span / cols.length, inner = svg("g", null, g);
    cols.forEach(function (col, i) { svg("polygon", { points: [i * band, 0, (i + 1) * band + 2, 0, (i + 1) * band + 2 - H * 0.7, H, i * band - H * 0.7, H].map(f1).join(" "), fill: col }, inner); });
    var total = span + W;
    F.anims.push(function (t) {
      var on = t >= at && t < at + dur;
      showEl(g, on);
      if (!on) return;
      var p = V.ease.inOutCubic((t - at) / dur), x = -span + p * (span + W + H * 0.7);
      setA(inner, "transform", "translate(" + f1(x) + " 0)");
    });
    return at + dur / 2;
  }
  function memory(from, to) {
    var F = getFilm();
    F.memories.push({ from: tc0(from), to: num(to, D) });
  }
  function cutIn(name, from, to, o) {
    var F = getFilm();
    o = obj(o);
    from = tc0(from); to = clamp(num(to, from + 0.6), from + 0.1, D);
    var yc = num(o.y, PORT ? 0.36 : 0.42) * H, hh = num(o.h, PORT ? 0.15 : 0.26) * H;
    var g = svg("g", null, F.ffxG);
    var dim = svg("rect", { x: -100, y: -100, width: W + 200, height: H + 200, fill: "#0A0820", opacity: 0.45 }, g);
    var strip = svg("g", null, g);
    var cid = uid("ci"), cp = svg("clipPath", { id: cid }, F.defs);
    svg("rect", { x: -20, y: f1(yc - hh / 2), width: W + 40, height: f1(hh) }, cp);
    var body = svg("g", { "clip-path": "url(#" + cid + ")" }, strip);
    svg("rect", { x: -20, y: f1(yc - hh / 2), width: W + 40, height: f1(hh), fill: o.bg || "#FFFFFF" }, body);
    var lines = "", rnd = V.makeRand(55 + F.cutActors.length);
    for (var i = 0; i < 40; i++) { var y = yc - hh / 2 + rnd() * hh, len = W * (0.2 + rnd() * 0.5), x = rnd() * W; lines += "M" + f1(x) + " " + f1(y) + "h" + f1(len) + "v" + f1(1.5 + rnd() * 4) + "h" + f1(-len) + "Z"; }
    svg("path", { d: lines, fill: o.bg ? "#FFFFFF" : "#C9C3E8", opacity: 0.7 }, body);
    var holder = svg("g", null, body);
    var pseudo = { Ww: W, defs: F.defs, L: { chars: holder }, actors: [], id: 999 + F.cutActors.length };
    var key = castKey(name), sc = hh / (key === "mochi" ? 150 : 104);
    var actor = makeActor(pseudo, key, { x: W / 2, y: yc - 8 * sc, scale: sc, expression: o.expression || "determined", facing: 0, noArms: true });
    svg("rect", { x: -20, y: f1(yc - hh / 2 - u(6)), width: W + 40, height: u(7), fill: INK }, strip);
    svg("rect", { x: -20, y: f1(yc + hh / 2 - u(1)), width: W + 40, height: u(7), fill: INK }, strip);
    F.cutActors.push({ a: actor._a, from: from, to: to });
    F.anims.push(function (t) {
      var on = t >= from && t < to;
      showEl(g, on);
      if (!on) return;
      var k = Math.min(smooth((t - from) / 0.08), smooth((to - t) / 0.06));
      setA(strip, "transform", "translate(0 " + f1(yc) + ") scale(1 " + f2(Math.max(0.01, k)) + ") translate(0 " + f1(-yc) + ")");
      setA(dim, "opacity", f2(0.45 * k));
      updActor(actor._a, t);
      setA(actor._a.g, "transform", "translate(" + f1(W / 2 + (t - from) * u(30)) + " " + f1(yc - 8 * sc) + ") scale(" + f2(sc * (1 + (t - from) * 0.05)) + ")");
    });
    return actor;
  }

  // ------------------------- frame -------------------------
  function activeShot(F, t) {
    var best = null;
    F.shots.forEach(function (s) { if (active(s, t) && (!best || s.from > best.from || (s.from === best.from && s.index > best.index))) best = s; });
    if (!best) { F.shots.forEach(function (s) { if (!best || Math.abs(s.from - t) < Math.abs(best.from - t)) best = s; }); }
    return best;
  }
  function finalize(F) {
    F.fin = true;
    F.late.forEach(function (fn) { try { fn(); } catch (e) { V.error("[anime] " + (e && e.message ? e.message : e)); } });
    F.late = [];
  }
  function shotFrame(s, t) {
    var c = camAt(s, t);
    s.camNow = c;
    var hide = s.bgHide.some(function (r) { return t >= r[0] && t < r[1]; });
    showEl(s.svgBg, !hide);
    ["sky", "far", "mid", "main"].forEach(function (k) { var m = layerM(s, c, s.fac[k]); setA(s.L[k], "transform", "matrix(" + m[0].toFixed(5) + " 0 0 " + m[0].toFixed(5) + " " + f2(m[1]) + " " + f2(m[2]) + ")"); });
    ["aura", "chars", "front", "wfx"].forEach(function (k) { var m = layerM(s, c, s.fac[k]); setA(s.L[k], "transform", "matrix(" + m[0].toFixed(5) + " 0 0 " + m[0].toFixed(5) + " " + f2(m[1]) + " " + f2(m[2]) + ")"); });
    var mh = layerM(s, c, 1);
    setS(s.html, "transform", "matrix(" + mh[0].toFixed(5) + ",0,0," + mh[0].toFixed(5) + "," + f2(mh[1]) + "," + f2(mh[2]) + ")");
    setA(s.underG, "transform", "translate(" + f2(c.sx * 0.3) + " " + f2(c.sy * 0.3) + ")");
    for (var i = 0; i < s.anims.length; i++) s.anims[i](t, c);
    for (var j = 0; j < s.actors.length; j++) updActor(s.actors[j], t);
    for (var k = 0; k < s.userFrames.length; k++) { try { s.userFrames[k](t); } catch (e) { V.error("[anime onFrame] " + (e && e.message ? e.message : e)); } }
  }
  function filmFrame(t) {
    var F = film;
    if (!F) return;
    if (!F.fin) finalize(F);
    var s = activeShot(F, t);
    F.current = s;
    F.shots.forEach(function (q) { showEl(q.el, q === s); });
    if (s) shotFrame(s, t);
    var filt = "";
    var mem = F.memories.some(function (m) { return t >= m.from && t < m.to; });
    if (mem) filt = "sepia(0.78) saturate(0.75) contrast(0.92) brightness(1.06)";
    var imp = F.impacts.some(function (q) { return q.invert && t >= q.at && t < q.at + q.dur; });
    if (imp) filt = "grayscale(1) contrast(4) invert(1)";
    setS(F.shotsWrap, "filter", filt || "none");
    showEl(F.vign, mem);
    if (mem) setS(F.vign, "opacity", String(f2(0.82 + 0.18 * hash(Math.floor(t * 12) * 1.7))));
    var fl = 0, fc = "#FFFFFF";
    F.flashes.forEach(function (q) { if (t >= q.at && t < q.at + q.dur) { var p = (t - q.at) / q.dur, k = p < 0.25 ? p / 0.25 : 1 - (p - 0.25) / 0.75; if (k > fl) { fl = k; fc = q.color; } } });
    showEl(F.flash, fl > 0.01);
    if (fl > 0.01) { setS(F.flash, "opacity", String(f2(fl))); setS(F.flash, "background", fc); }
    var sx = 0, sy = 0;
    F.shakes.forEach(function (q, j) { if (t >= q.at && t < q.at + q.dur) { var k = Math.pow(1 - (t - q.at) / q.dur, 1.5) * u(q.amp) * 0.35; sx += k * Math.sin((t - q.at) * 67 + j); sy += k * Math.cos((t - q.at) * 59 + j); } });
    setS(F.letter, "transform", sx || sy ? "translate(" + f2(sx) + "px," + f2(sy) + "px)" : "none");
    for (var i = 0; i < F.anims.length; i++) F.anims[i](t);
  }

  // ------------------------- lettering (film-level HTML) -------------------------
  function box(parent, cls, x, y, w, h) {
    var d = div(cls, parent);
    d.style.left = f1(x) + "px"; d.style.top = f1(y) + "px";
    if (w != null) d.style.width = f1(w) + "px";
    if (h != null) d.style.height = f1(h) + "px";
    return d;
  }
  function addLetter(el, kind, label, from, until, mover) { getFilm().letters.push({ el: el, kind: kind, label: plain(label), from: from, until: until == null ? 1e9 : until, mover: mover || el }); }
  function letterOn(L_, t) { return t >= L_.from && t < L_.until; }
  function emCol(el, c) { if (c) el.style.setProperty("--em", c); }
  function richInto(el, text, lay) { return fillRich(el, lay, "an-w"); }
  var SIZES = { xl: [150, 112], lg: [112, 92], md: [80, 68], sm: [60, 54] };
  // Scale centred text by its font size (not a CSS scale): Chromium can reuse glyph rasters made at another
  // scale after a seek, so transform-scaled text is not pixel-identical; real font sizes are.
  function sizeScale(el, size, k, top, h) {
    k = Math.round(k * 50) / 50;
    setS(el, "fontSize", f2(size * k) + "px");
    setS(el, "top", f1(top - (h * (k - 1)) / 2) + "px");
  }
  function titleCard(text, at, o) {
    var F = getFilm();
    o = obj(o);
    at = tc(num(at, 0.3));
    var until = o.until == null ? 1e9 : num(o.until, 1e9);
    var sz = (SIZES[o.size] || SIZES.lg)[PORT ? 1 : 0], pos = str(o.pos) || "center";
    var side = pos === "left" || pos === "right";
    var maxW = num(o.maxWidth, side ? 0.4 : PORT ? 0.86 : 0.76) * W;
    var lay = layoutRich(text || " ", { size: sz, maxWidth: maxW - sz * 0.9, maxLines: 3, weight: 900, italic: true, lh: 1.04, minSize: sz * 0.4 });
    var padX = lay.size * 0.5, padY = lay.size * 0.2, bw = lay.w + padX * 2, bh = lay.h + padY * 2;
    var fx = pos === "left" ? 0.29 : pos === "right" ? 0.71 : 0.5;
    var fy = pos === "top" ? (PORT ? 0.21 : 0.22) : pos === "bottom" ? (PORT ? 0.64 : 0.74) : PORT ? 0.36 : 0.44;
    if (o.y != null) fy = num(o.y, fy);
    if (o.x != null) fx = num(o.x, fx);
    var cx = clamp(fx * W, bw / 2 + W * 0.04, W - bw / 2 - W * 0.04), cy = fy * H;
    var wrap = box(F.letter, "an-tc", cx - bw / 2, cy - bh / 2, bw, bh);
    var band = box(wrap, "an-tc-band", 0, 0, bw, bh);
    band.style.background = o.color || ACC;
    var txt = box(wrap, "an-tc-text", 0, padY, bw, lay.h);
    fillRich(txt, lay);
    emCol(txt, o.emColor || GOLD);
    addLetter(band, "title", text, at, until, wrap);
    var kick = null, sub = null;
    if (str(o.kicker)) {
      var ks = Math.max(30, sz * 0.36);
      kick = box(wrap, "an-tc-kick", padX * 0.3, -ks * 1.25, null, null);
      kick.textContent = plain(o.kicker);
      kick.style.fontSize = f1(ks) + "px";
      addLetter(kick, "kicker", o.kicker, at + 0.08, until, wrap);
    }
    if (str(o.sub)) {
      var ss = Math.max(32, sz * 0.36), sl = layoutRich(o.sub, { size: ss, maxWidth: Math.max(bw * 0.9, maxW * 0.8), maxLines: 2, weight: 800 });
      sub = box(wrap, "an-tc-sub", (bw - sl.w - ss) / 2, bh + ss * 0.35, sl.w + ss, sl.h + ss * 0.4);
      var si = div("an-tc-subin", sub); fillRich(si, sl);
      addLetter(sub, "subtitle", o.sub, at + 0.2, until, wrap);
    }
    var slam = o.style !== "slide";
    F.anims.push(function (t) {
      var on = t >= at - 0.08 && t < until;
      showEl(wrap, on);
      if (!on) return;
      var p = (t - at) / 0.16, out = until < 1e8 ? clamp((t - (until - 0.1)) / 0.1, 0, 1) : 0;
      var bp = clamp((t - (at - 0.08)) / 0.14, 0, 1);
      setS(band, "transform", "skewX(-10deg) scaleX(" + f2(V.ease.outCubic(bp)) + ")");
      if (slam) {
        var k = p < 0 ? 0 : p < 1 ? 2.3 - 1.3 * CE.snap(p) : 1;
        sizeScale(txt, lay.size, k, padY, lay.h);
        setS(txt, "opacity", p < 0 ? "0" : "1");
      } else {
        var e = CE.smear(clamp(p * 0.7, 0, 1));
        setS(txt, "transform", "translateX(" + f1((1 - e) * -W * 0.4) + "px)");
        setS(txt, "opacity", p < 0 ? "0" : "1");
      }
      if (kick) { var kp = clamp((t - at - 0.08) / 0.18, 0, 1); setS(kick, "transform", "translateX(" + f1((1 - CE.smear(kp)) * -60) + "px)"); setS(kick, "opacity", kp > 0 ? "1" : "0"); }
      if (sub) { var sp2 = clamp((t - at - 0.2) / 0.22, 0, 1); setS(sub, "transform", "translateY(" + f1((1 - CE.smear(sp2)) * 30) + "px)"); setS(sub, "opacity", f2(sp2 > 0 ? 1 : 0)); }
      setS(wrap, "clipPath", out > 0 ? "inset(-40% " + f1(out * 100) + "% -40% -10%)" : "none");
    });
    return { el: wrap, box: { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh } };
  }
  function bigWord(text, at, o) {
    var F = getFilm();
    o = obj(o);
    at = tc0(at);
    var until = o.until == null ? 1e9 : num(o.until, 1e9);
    var maxW = num(o.width, PORT ? 0.86 : 0.5) * W, sz = num(o.size, PORT ? 170 : 200);
    var lay = layoutRich(text || "!", { size: sz, maxWidth: maxW, maxLines: num(o.maxLines, 2), weight: 900, italic: true, lh: 1.0, minSize: 60, maxHeight: num(o.maxHeight, PORT ? 0.24 : 0.5) * H });
    var bw = lay.w + lay.size * 0.3, bh = lay.h;
    var cx = clamp(num(o.x, 0.5) * W, bw / 2 + W * 0.04, W - bw / 2 - W * 0.04), cy = num(o.y, 0.45) * H;
    var wrap = box(F.letter, "an-big", cx - bw / 2, cy - bh / 2, bw, bh);
    var txt = div("an-big-in", wrap);
    fillRich(txt, lay);
    if (o.color) { txt.style.color = o.color; }
    emCol(txt, o.emColor || GOLD);
    addLetter(wrap, "reveal", text, at, until);
    F.anims.push(function (t) {
      var on = t >= at && t < until;
      showEl(wrap, on);
      if (!on) return;
      var p = clamp((t - at) / 0.13, 0, 1), k = 2.6 - 1.6 * CE.snap(p), wob = t - at < 0.4 ? Math.round(Math.sin((t - at) * 60) * (1 - (t - at) / 0.4) * 6) : 0;
      sizeScale(txt, lay.size, k, 0, lay.h);
      setS(wrap, "transform", "translate(" + wob + "px," + Math.round(wob * 0.6) + "px) rotate(-5deg)");
    });
    return { el: wrap, box: { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh } };
  }
  function callout(text, at, o) {
    var F = getFilm();
    o = obj(o);
    at = tc(num(at, 0.4));
    var until = o.until == null ? 1e9 : num(o.until, 1e9);
    var maxW = num(o.width, PORT ? 0.84 : 0.4) * W, sz = num(o.size, PORT ? 66 : 64), icon = str(o.icon) ? iconKey(o.icon) || "star" : null;
    var ip = icon ? sz * 1.5 : 0;
    var lay = layoutRich(text || " ", { size: sz, maxWidth: maxW - sz * 0.9 - (ip ? ip + sz * 0.4 : 0), maxLines: 3, weight: 900, lh: 1.08, minSize: 34 });
    var padX = lay.size * 0.5, padY = lay.size * 0.34, bw = lay.w + padX * 2 + (ip ? ip + lay.size * 0.35 : 0), bh = Math.max(lay.h, ip * 0.9) + padY * 2;
    var cx = clamp(num(o.x, 0.5) * W, bw / 2 + W * 0.05, W - bw / 2 - W * 0.05), cy = num(o.y, 0.3) * H;
    var wrap = box(F.letter, "an-co", cx - bw / 2, cy - bh / 2, bw, bh);
    var face = box(wrap, "an-co-box", 0, 0, bw, bh);
    if (ip) { var ic = box(wrap, "an-co-icon", padX * 0.7, (bh - ip) / 2, ip, ip); ic.innerHTML = iconSvg(icon, ip * 0.8); }
    var txt = box(wrap, "an-co-text", padX + (ip ? ip + lay.size * 0.2 : 0), (bh - lay.h) / 2, lay.w + 4, lay.h);
    fillRich(txt, lay);
    emCol(txt, o.emColor || ACC);
    addLetter(face, "callout", text, at, until, wrap);
    var kick = null;
    if (str(o.kicker)) {
      var ks = Math.max(28, sz * 0.48);
      kick = box(wrap, "an-co-kick", padX * 0.4, -ks * 1.15, null, null);
      kick.textContent = plain(o.kicker);
      kick.style.fontSize = f1(ks) + "px";
      addLetter(kick, "kicker", o.kicker, at, until, wrap);
    }
    F.anims.push(function (t) {
      var on = t >= at && t < until;
      showEl(wrap, on);
      if (!on) return;
      var p = clamp((t - at) / 0.22, 0, 1), e = V.ease.outCubic(p);
      setS(wrap, "clipPath", p >= 1 ? "none" : "inset(-30% " + f1((1 - e) * 100) + "% -30% -10%)");
      setS(wrap, "transform", "translateX(" + Math.round((1 - CE.smear(p)) * -50) + "px)");
    });
    return { el: wrap, box: { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh } };
  }
  function subtitles(o) {
    var F = getFilm();
    o = obj(o);
    var from = num(o.from, 0), to = num(o.to, D + 1), list;
    if (arr(o.lines).length) list = o.lines.map(function (l) { l = obj(l); return { text: str(l.text), start: num(l.start, 0), end: num(l.end, 1) }; });
    else list = phrases(from, to, PORT ? 6 : 8);
    var sz = num(o.size, PORT ? 50 : 46), maxW = (PORT ? 0.86 : 0.74) * W;
    var cy = o.top ? (PORT ? 0.17 : 0.11) * H : num(o.y, PORT ? 0.725 : 0.885) * H;
    if (o.top === undefined && o.y == null && PORT) cy = 0.725 * H;
    var wrap = box(F.letter, "an-subs", 0, 0, W, H);
    var items = [];
    list.forEach(function (ph, i) {
      if (!ph.text) return;
      var lay = layoutRich(ph.text, { size: sz, maxWidth: maxW, maxLines: 2, weight: 800, lh: 1.16, minSize: 30 });
      var bw = lay.w + 20, bh = lay.h;
      var top = PORT && !o.top ? Math.min(cy, 0.755 * H - bh) : cy - bh / 2;
      var el = box(wrap, "an-sub", (W - bw) / 2, top, bw, bh);
      fillRich(el, lay);
      var next = i + 1 < list.length ? list[i + 1].start : 1e9;
      var it = { el: el, from: Math.max(from, ph.start - 0.06), until: Math.min(to, Math.max(ph.end + 0.35, Math.min(next - 0.08, ph.end + 0.9)), next - 0.08) };
      if (it.until <= it.from) it.until = it.from + 0.3;
      items.push(it);
      addLetter(el, "subtitle", ph.text, it.from, it.until);
    });
    F.anims.push(function (t) { items.forEach(function (it) { showEl(it.el, t >= it.from && t < it.until); }); });
    return wrap;
  }
  function nameTag(name, from, to, o) {
    var F = getFilm();
    o = obj(o);
    from = tc0(from); to = num(to, from + 1.8);
    var key = CAST[str(name).toLowerCase()] ? str(name).toLowerCase() : null, cd = key ? CAST[key] : null;
    var label = cd ? cd.name : plain(name) || "???", sz = PORT ? 52 : 48;
    var w = measure(label, sz, 900, true) + sz * 1.4, h = sz * 1.45, side = o.side === "right" ? "right" : "left";
    var x = side === "left" ? W * 0.095 : W * 0.895 - w, y = num(o.y, PORT ? 0.31 : 0.7) * H;
    var el = box(F.letter, "an-tag", x, y, w, h);
    el.style.background = o.color || (cd ? cd.color : ACC);
    el.style.fontSize = f1(sz) + "px";
    el.textContent = label;
    addLetter(el, "nametag", label, from, to);
    F.anims.push(function (t) {
      var on = t >= from && t < to;
      showEl(el, on);
      if (!on) return;
      var p = clamp((t - from) / 0.2, 0, 1);
      setS(el, "transform", "skewX(-12deg) translateX(" + f1((1 - CE.smear(p)) * (side === "left" ? -40 : 40)) + "px)");
    });
    return el;
  }
  function stat(value, at, o) {
    var F = getFilm();
    o = obj(o);
    at = tc(num(at, 0.5));
    var v = num(value, 0), dec = clamp(Math.round(num(o.decimals, 0)), 0, 2), pre = str(o.prefix), suf = str(o.suffix);
    var sz = num(o.size, PORT ? 200 : 210), finalTxt = pre + V.format(v, dec) + suf;
    var maxW = num(o.width, PORT ? 0.86 : 0.46) * W;
    while (measure(finalTxt, sz, 900, true) > maxW && sz > 60) sz *= 0.94;
    var nw = measure(finalTxt, sz, 900, true) + sz * 0.25, nh = sz * 1.05;
    var lab = str(o.label), ls = PORT ? 50 : 46, ll = lab ? layoutRich(lab, { size: ls, maxWidth: maxW, maxLines: 2, weight: 900, lh: 1.1 }) : null;
    var lw = ll ? ll.w + ls * 1.2 : 0, lh = ll ? ll.h + ls * 0.5 : 0;
    var bw = Math.max(nw, lw), bh = nh + (ll ? lh + sz * 0.08 : 0);
    var cx = clamp(num(o.x, 0.5) * W, bw / 2 + W * 0.05, W - bw / 2 - W * 0.05), cy = num(o.y, 0.4) * H;
    var wrap = box(F.letter, "an-stat", cx - bw / 2, cy - bh / 2, bw, bh);
    var n = box(wrap, "an-stat-num", (bw - nw) / 2, 0, nw, nh);
    n.style.fontSize = f1(sz) + "px";
    if (o.color) n.style.color = o.color;
    var lb = null;
    if (ll) { lb = box(wrap, "an-stat-label", (bw - lw) / 2, nh + sz * 0.08, lw, lh); var li = div("an-stat-lin", lb); fillRich(li, ll); }
    var until = o.until == null ? 1e9 : num(o.until, 1e9);
    addLetter(n, "stat", finalTxt, at, until, wrap);
    if (lb) addLetter(lb, "label", lab, at + 0.3, until, wrap);
    F.anims.push(function (t) {
      var on = t >= at && t < until;
      showEl(wrap, on);
      if (!on) return;
      var p = clamp((t - at) / 0.9, 0, 1), cur = v * V.ease.outCubic(p);
      var s_ = pre + V.format(cur, dec) + suf;
      if (n.textContent !== s_) n.textContent = s_;
      var k = t - at < 0.14 ? 2.0 - 1.0 * CE.snap((t - at) / 0.14) : 1;
      sizeScale(n, sz, k, 0, nh);
      setS(n, "transform", "rotate(-4deg)");
      if (lb) { var lp = clamp((t - at - 0.3) / 0.2, 0, 1); setS(lb, "opacity", lp > 0 ? "1" : "0"); setS(lb, "transform", "skewX(-10deg)"); setS(lb, "clipPath", lp >= 1 ? "none" : "inset(-20% " + f1((1 - V.ease.outCubic(lp)) * 100) + "% -20% 0)"); }
    });
    return wrap;
  }
  function stepCard(nn, label, from, to, o) {
    var F = getFilm();
    o = obj(o);
    from = tc0(from); to = num(to, D + 1);
    var numS = (nn < 10 ? "0" : "") + Math.round(num(nn, 1)), ns = PORT ? 150 : 150, ls = PORT ? 66 : 64;
    var icon = str(o.icon) ? iconKey(o.icon) || "star" : null, ip = icon ? ls * 1.5 : 0;
    var maxW = num(o.width, PORT ? 0.86 : 0.48) * W;
    var nw = measure(numS, ns, 900, true) + ns * 0.5, nh = ns * 1.05;
    var ll = layoutRich(label || " ", { size: ls, maxWidth: maxW - (ip ? ip + ls * 0.6 : 0) - ls, maxLines: 2, weight: 900, lh: 1.06, minSize: 36 });
    var lw = ll.w + ls * 1.0 + (ip ? ip + ls * 0.4 : 0), lh = Math.max(ll.h, ip) + ls * 0.6;
    var stacked = PORT || lw + nw > maxW * 1.05;
    var bw = stacked ? Math.max(nw, lw) : nw + lw - ls * 0.2, bh = stacked ? nh + lh - ns * 0.12 : Math.max(nh, lh);
    var cx = clamp(num(o.x, 0.5) * W, bw / 2 + W * 0.05, W - bw / 2 - W * 0.05), cy = num(o.y, 0.3) * H;
    var wrap = box(F.letter, "an-step", cx - bw / 2, cy - bh / 2, bw, bh);
    var nb = box(wrap, "an-step-num", stacked ? (bw - nw) / 2 : 0, stacked ? 0 : (bh - nh) / 2, nw, nh);
    nb.style.fontSize = f1(ns) + "px";
    var nbt = div("an-step-numt", nb); nbt.textContent = numS;
    var lb = box(wrap, "an-step-label", stacked ? (bw - lw) / 2 : nw - ls * 0.2, stacked ? nh - ns * 0.12 : (bh - lh) / 2, lw, lh);
    if (ip) { var ic = box(lb, "an-step-icon", ls * 0.45, (lh - ip) / 2, ip, ip); ic.innerHTML = iconSvg(icon, ip); }
    var lt = box(lb, "an-step-text", ls * 0.5 + (ip ? ip + ls * 0.3 : 0), (lh - ll.h) / 2, ll.w + 4, ll.h);
    fillRich(lt, ll);
    emCol(lt, ACC);
    addLetter(nb, "step", numS, from, to, wrap);
    addLetter(lb, "step", label, from + 0.08, to, wrap);
    F.anims.push(function (t) {
      var on = t >= from && t < to;
      showEl(wrap, on);
      if (!on) return;
      var p = clamp((t - from) / 0.2, 0, 1), q = clamp((t - from - 0.08) / 0.2, 0, 1);
      setS(nb, "transform", "skewX(-10deg)");
      setS(nbt, "fontSize", f2(ns * (p < 1 ? Math.round((1.8 - 0.8 * CE.snap(p)) * 50) / 50 : 1)) + "px");
      setS(nb, "opacity", "1");
      setS(lb, "transform", "skewX(-10deg) translateX(" + f1((1 - CE.smear(q)) * W * 0.3) + "px)");
      setS(lb, "opacity", q > 0 ? "1" : "0");
    });
    return { el: wrap, box: { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh } };
  }
  function bubble(text, from, to, o) {
    var F = getFilm();
    o = obj(o);
    from = tc0(from); to = num(to, D + 1);
    var maxW = num(o.width, PORT ? 0.84 : 0.46) * W, sz = num(o.size, PORT ? 58 : 56);
    var lay = layoutRich(text || "...", { size: sz, maxWidth: maxW - sz * 1.4, maxLines: num(o.maxLines, 4), weight: 800, lh: 1.16, minSize: 32, maxHeight: num(o.maxHeight, 0.4) * H });
    var padX = lay.size * 0.7, padY = lay.size * 0.5, bw = lay.w + padX * 2, bh = lay.h + padY * 2;
    var cx = clamp(num(o.x, 0.5) * W, bw / 2 + W * 0.05, W - bw / 2 - W * 0.05), cy = num(o.y, 0.3) * H;
    var wrap = box(F.letter, "an-bub", cx - bw / 2, cy - bh / 2, bw, bh);
    var tail = str(o.tail) || "down", ts = lay.size * 1.1;
    var tsv = doc.createElementNS(NS, "svg");
    tsv.setAttribute("class", "an-bub-tail");
    var tw = ts * 1.6, th = ts * 1.3, tx, ty, pts;
    if (tail === "left") { tx = -th + 8; ty = bh * 0.55 - tw / 2; tsv.setAttribute("width", th); tsv.setAttribute("height", tw); pts = th + " 0 0 " + tw * 0.8 + " " + th + " " + tw * 0.62; }
    else if (tail === "right") { tx = bw - 8; ty = bh * 0.55 - tw / 2; tsv.setAttribute("width", th); tsv.setAttribute("height", tw); pts = "0 0 " + th + " " + tw * 0.8 + " 0 " + tw * 0.62; }
    else if (tail === "up") { tx = bw * 0.3; ty = -th + 8; tsv.setAttribute("width", tw); tsv.setAttribute("height", th); pts = "0 " + th + " " + tw * 0.2 + " 0 " + tw * 0.62 + " " + th; }
    else { tx = bw * (o.tailX == null ? 0.3 : num(o.tailX, 0.3)); ty = bh - 8; tsv.setAttribute("width", tw); tsv.setAttribute("height", th); pts = "0 0 " + tw * 0.2 + " " + th + " " + tw * 0.62 + " 0"; }
    tsv.style.left = f1(tx) + "px"; tsv.style.top = f1(ty) + "px";
    tsv.innerHTML = '<polygon points="' + pts + '" fill="#FFFFFF" stroke="' + INK + '" stroke-width="' + u(6) + '" stroke-linejoin="round"/>';
    var face = box(wrap, "an-bub-box", 0, 0, bw, bh);
    wrap.appendChild(tsv);
    var cover = box(wrap, "an-bub-cover", tail === "left" ? 0 : tail === "right" ? bw - 14 : tx + u(3), tail === "up" ? 0 : tail === "down" ? bh - 14 : ty + u(3), tail === "left" || tail === "right" ? 14 : tw * 0.62 - u(6), tail === "left" || tail === "right" ? tw * 0.62 - u(6) : 14);
    if (tail === "left" || tail === "right") { cover.style.top = f1(ty + u(6)) + "px"; cover.style.height = f1(tw * 0.56) + "px"; }
    var txt = box(wrap, "an-bub-text", padX, padY, lay.w + 4, lay.h);
    var spans = fillRich(txt, lay);
    emCol(txt, o.emColor || ACC);
    addLetter(face, "bubble", text, from, to, wrap);
    // light words up as they are spoken
    var ln = findLines([plain(text)], Math.max(0, from - 0.6))[0], times = [];
    spans.forEach(function (sp, i) { times.push(ln && ln.times && ln.times[i] != null ? ln.times[i] : from + i * 0.25); });
    var lightUp = o.highlight !== false;
    F.anims.push(function (t) {
      var on = t >= from && t < to;
      showEl(wrap, on);
      if (!on) return;
      var p = clamp((t - from) / 0.22, 0, 1);
      setS(wrap, "clipPath", p >= 1 ? "none" : "circle(" + f1(V.ease.outCubic(p) * Math.sqrt(bw * bw + bh * bh) * 1.1) + "px at " + f1(tx + tw * 0.2) + "px " + f1(ty + th) + "px)");
      spans.forEach(function (sp, i) { var lit = !lightUp || t >= times[i] - 0.05; if (sp._lit !== lit) { sp._lit = lit; sp.el.classList.toggle("an-on", lit); } });
    });
    return { el: wrap, box: { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh } };
  }
  function iconPop(icon, label, at, o) {
    var F = getFilm();
    o = obj(o);
    at = tc(num(at, 0.5));
    var until = o.until == null ? 1e9 : num(o.until, 1e9);
    var ip = num(o.size, PORT ? 130 : 140), ls = PORT ? 42 : 44, lab = plain(label);
    var lw = lab ? Math.min(measure(lab, ls, 900) + ls * 1.1, W * 0.42) : 0;
    var bw = Math.max(ip, lw), bh = ip + (lab ? ls * 1.6 + 10 : 0);
    var cx = clamp(num(o.x, 0.5) * W, bw / 2 + W * 0.05, W - bw / 2 - W * 0.05), cy = num(o.y, 0.5) * H;
    var wrap = box(F.letter, "an-chip", cx - bw / 2, cy - bh / 2, bw, bh);
    var c = box(wrap, "an-chip-c", (bw - ip) / 2, 0, ip, ip);
    c.innerHTML = iconSvg(icon, ip * 0.7);
    if (lab) {
      var lb = box(wrap, "an-chip-l", (bw - lw) / 2, ip + 10, lw, ls * 1.6);
      var lt = layoutRich(lab, { size: ls, maxWidth: lw - ls * 0.8, maxLines: 1, weight: 900, minSize: 22 });
      lb.style.fontSize = f1(lt.size) + "px";
      lb.textContent = lab;
    }
    addLetter(wrap, "icon", lab || icon, at, until);
    F.anims.push(function (t) {
      var on = t >= at && t < until;
      showEl(wrap, on);
      if (!on) return;
      var p = clamp((t - at) / 0.3, 0, 1);
      setS(wrap, "opacity", p > 0 ? "1" : "0");
      setS(wrap, "transform", "translateY(" + Math.round(Math.sin(t * 3 + cx) * 4 - (1 - V.ease.outBack(p)) * 70) + "px)");
    });
    return { el: wrap, box: { x: cx - bw / 2, y: cy - bh / 2, w: bw, h: bh } };
  }
  // Chalk text on the classroom board (world space: zooms with the camera).
  function boardText(shotApi_, title, items, times) {
    var s = shotApi_ && shotApi_._s ? shotApi_._s : null;
    if (!s) { var F0 = getFilm(); s = F0.shots[F0.shots.length - 1]; if (!s) return null; }
    var B = s.board, pad = B.w * 0.06, list = arr(items).map(function (x) { return typeof x === "string" ? x : str(obj(x).text); });
    times = arr(times);
    var n = Math.max(1, list.length), tsz = B.w * (s.portrait ? 0.085 : 0.06);
    var tl = layoutRich(title || "", { size: tsz, maxWidth: B.w - pad * 2, maxLines: 1, weight: 900, minSize: tsz * 0.5 });
    var top = B.y + pad * 0.7, avail = B.h - pad * 1.4 - (title ? tl.h + tsz * 0.5 : 0);
    var isz = Math.min(B.w * (s.portrait ? 0.075 : 0.062), (avail / n) * 0.6);
    var rows = [], lays = list.map(function (txt) { return layoutRich(txt, { size: isz, maxWidth: B.w - pad * 2 - isz * 1.5, maxLines: 2, weight: 800, lh: 1.08, minSize: isz * 0.55 }); });
    var minS = Math.min.apply(null, lays.map(function (l) { return l.size; }).concat([isz]));
    lays = list.map(function (txt) { return layoutRich(txt, { size: minS, maxWidth: B.w - pad * 2 - minS * 1.5, maxLines: 2, weight: 800, lh: 1.08, minSize: minS }); });
    var used = lays.reduce(function (a2, l) { return a2 + l.h; }, 0), gap = Math.max(minS * 0.3, Math.min(minS * 0.9, (avail - used) / Math.max(1, n)));
    var out = { title: null, rows: [] };
    if (title) {
      var te = box(s.html, "an-chalk an-chalk-title", B.x + pad, top, B.w - pad * 2, tl.h + tsz * 0.2);
      var ti = div("an-chalk-in", te); fillRich(ti, tl); ti.style.textAlign = "center";
      var t0 = num(times[0], 0.4) - 0.5;
      out.title = { el: te, at: Math.max(0.1, Math.min(t0, 0.6)) };
      top += tl.h + tsz * 0.5;
    }
    var y = top + Math.max(gap * 0.5, (avail - used - gap * (n - 1)) / 2);
    lays.forEach(function (l, i) {
      var re = box(s.html, "an-chalk an-chalk-row", B.x + pad, y, B.w - pad * 2, l.h);
      var dot = box(re, "an-chalk-num", 0, (l.size * 1.08 - minS * 1.0) / 2, minS * 1.0, minS * 1.0);
      dot.textContent = String(i + 1);
      dot.style.fontSize = f1(minS * 0.66) + "px";
      var ri = box(re, "an-chalk-in", minS * 1.4, 0, l.w + 6, l.h);
      fillRich(ri, l);
      rows.push({ el: re, at: num(times[i], 0.6 + i), x: B.x + pad, y: y, w: minS * 1.4 + l.w, h: l.h });
      y += l.h + gap;
    });
    out.rows = rows;
    var all = (out.title ? [out.title] : []).concat(rows);
    all.forEach(function (r) { r.el.style.clipPath = "inset(0 100% 0 0)"; });
    s.anims.push(function (t) {
      all.forEach(function (r) {
        var p = clamp((t - r.at) / 0.55, 0, 1);
        showEl(r.el, p > 0);
        setS(r.el, "clipPath", p >= 1 ? "none" : "inset(-10% " + f1((1 - p) * 100) + "% -10% 0)");
      });
    });
    rows.forEach(function (r) { s.boxes.push({ kind: "board", label: r.el.textContent, wx: r.x, wy: r.y, w: r.w, h: r.h, at: r.at }); });
    if (out.title) s.boxes.push({ kind: "board", label: title, wx: B.x + pad, wy: B.y + pad * 0.7, w: B.w - pad * 2, h: tl.h, at: out.title.at });
    return out;
  }

  // ------------------------- templates -------------------------
  var TPL = {};
  var SIGNATURE = { hikari: "fist", ren: "glasses", kaito: "fist-up", yuki: "explain", mochi: "cheer" };
  function narrate(actor, from, to) { if (actor && actor.__actor) actor.say(from == null ? 0 : from, to == null ? D : to); return actor; }
  function both(list, fn) { list.forEach(function (a) { if (a) fn(a); }); }
  function addBeats(list, beats) { both(list, function (a) { a.beats(beats); }); }
  function faceToward(side) { return side === "left" ? "right" : "left"; }

  TPL["character-speaks"] = function (root, p) {
    var who = castKey(p.character, "hikari"), loc = locKey(p.location, "rooftop"), side = p.side === "right" ? "right" : "left";
    var text = str(p.text), base = exKey(p.expression, null) || defaultExpr(who);
    var kwT = text ? labelTime(text, p.keyword, 0) : p.keyword ? kwFind(p.keyword) : null;
    if (kwT == null) kwT = D * 0.3;
    kwT = tc(kwT);
    var closeUp = p.closeUp !== false && D > 3.4;
    var tCut = closeUp ? cutNear(D * 0.55, Math.min(D - 1.6, Math.max(1.6, kwT + 0.7)), D - 1.5) : 1e9;
    if (closeUp && tCut > D - 1.4) closeUp = false, tCut = 1e9;
    var s1 = S.shot(loc, 0, tCut), f1_ = s1.frame("medium", PORT ? "center" : side);
    var facing = PORT ? (side === "left" ? 0.15 : -0.15) : side === "left" ? 0.45 : -0.45;
    var a1 = s1.character(who, { x: f1_.x, y: f1_.y, scale: f1_.scale * (who === "mochi" ? 0.95 : 1), facing: facing, expression: base });
    s1.cam.set({ zoom: 1 });
    s1.cam.push(1.07, 0.1, Math.max(1, Math.min(tCut, D) - 0.2));
    var actors = [a1];
    if (closeUp) {
      var s2 = S.shot(loc, tCut, 1e9, { enter: "zoom" }), f2_ = s2.frame("close", PORT ? "center" : side);
      var a2 = s2.character(who, { x: f2_.x, y: f2_.y, scale: f2_.scale * (who === "mochi" ? 0.85 : 1), facing: facing * 0.6, expression: exKey(p.closeExpression, null) || exKey(p.keyExpression, null) || base });
      s2.cam.push(1.05, tCut, Math.max(1, D - tCut - 0.3));
      actors.push(a2);
      if (exKey(p.closeExpression, null)) a2.expression(p.closeExpression, tCut);
    }
    both(actors, function (a) { narrate(a, 0, D); a.look(0, 0.05, 0); });
    var kx = exKey(p.keyExpression, null);
    both(actors, function (a) { if (kx) a.expression(kx, kwT); a.gesture(p.gesture || SIGNATURE[who], kwT - 0.04, 0.2); if (who === "ren") a.glint(kwT + 0.05); a.hop(kwT, 16, 0.22); });
    if (closeUp && exKey(p.closeExpression, null)) actors[1].expression(p.closeExpression, Math.max(tCut, kwT + 0.01));
    addBeats(actors, p.beats);
    s1.focusLines(kwT, Math.min(kwT + 0.55, tCut), { opacity: 0.4, inner: 0.46, x: PORT ? 0.5 : side === "left" ? 0.32 : 0.68, y: PORT ? 0.55 : 0.42 });
    if (text) {
      var co = PORT ? { x: 0.5, y: 0.235, width: 0.86 } : { x: side === "left" ? 0.71 : 0.29, y: 0.4, width: 0.44 };
      S.callout(text, kwT, { x: co.x, y: co.y, width: co.width, kicker: p.kicker, icon: p.icon });
    }
    if (p.subtitles !== false) S.subtitles({});
  };

  TPL.dialogue = function (root, p) {
    var chars = arr(p.characters).map(function (c) { return castKey(c, null); });
    var A = chars[0] || "hikari", B = chars[1] || (A === "yuki" ? "kaito" : "yuki");
    if (B === A) B = A === "yuki" ? "kaito" : "yuki";
    var who = [A, B], loc = locKey(p.location, "classroom");
    var lines = arr(p.lines).slice(0, 8).map(function (l) { l = obj(l); var sp = num(l.speaker, 0) === 1 || l.speaker === B ? 1 : 0; return { sp: sp, text: str(l.text), expression: l.expression, reaction: l.reaction, gesture: l.gesture }; }).filter(function (l) { return l.text; });
    if (!lines.length) lines = [{ sp: 0, text: V.narration || "..." }];
    var found = findLines(lines.map(function (l) { return l.text; }), 0);
    lines.forEach(function (l, i) { l.start = tc0(found[i].start); l.end = tc0(found[i].end); });
    // expression timeline per character
    var exT = [[{ at: 0, e: defaultExpr(A) }], [{ at: 0, e: defaultExpr(B) }]];
    lines.forEach(function (l) {
      if (l.expression) exT[l.sp].push({ at: Math.max(0, l.start - 0.05), e: l.expression });
      if (l.reaction) exT[1 - l.sp].push({ at: Math.max(0, l.start + Math.min(0.6, (l.end - l.start) * 0.4)), e: l.reaction });
    });
    // shots: two-shot for line 0, then the speaker per line, plus reaction inserts
    var cuts = [];
    lines.forEach(function (l, i) {
      var from = i === 0 ? 0 : Math.max(lines[i - 1].end - 0.02, l.start - 0.12);
      var to = i + 1 < lines.length ? Math.max(l.end, lines[i + 1].start - 0.12) : 1e9;
      if (i + 1 < lines.length) to = Math.min(to, lines[i + 1].start - 0.02);
      if (to <= from + 0.3) to = from + 0.3;
      var react = l.reaction && i > 0 && (l.end - l.start) > 1.5 ? Math.max(l.start + 0.9, l.end - 0.45) : null;
      if (i === 0) cuts.push({ kind: "two", from: from, to: react ? react : to, line: i });
      else cuts.push({ kind: "single", who: l.sp, from: from, to: react ? react : to, line: i });
      if (react) cuts.push({ kind: "react", who: 1 - l.sp, from: react, to: to, line: i });
    });
    var lastWho = -1, seen = [false, false];
    cuts.forEach(function (c, ci) {
      var enter = ci === 0 ? "cut" : c.kind === "react" ? "zoom" : c.who === 1 ? "whip-right" : "whip-left";
      var s = S.shot(loc, c.from, ci === cuts.length - 1 ? 1e9 : c.to, { enter: enter });
      var made = [];
      if (c.kind === "two") {
        var fa = s.frame("medium", PORT ? 0.27 : 0.3), fb = s.frame("medium", PORT ? 0.73 : 0.7), sc = PORT ? 0.64 : 0.95;
        made.push([0, s.character(A, { x: fa.x, y: PORT ? 610 : fa.y + 20, scale: sc, facing: 0.55 })]);
        made.push([1, s.character(B, { x: fb.x, y: PORT ? 610 : fb.y + 20, scale: sc, facing: -0.55 })]);
        s.cam.push(1.04, c.from, Math.max(0.5, c.to - c.from));
        S.nameTag(A, Math.max(0.2, c.from + 0.1), Math.min(c.to, 2.2), { side: "left" });
        S.nameTag(B, Math.max(0.3, c.from + 0.25), Math.min(c.to, 2.35), { side: "right" });
        seen = [true, true];
      } else {
        var w = c.who, f = s.frame(c.kind === "react" ? "medium" : "close", PORT ? (w === 0 ? 0.44 : 0.56) : w === 0 ? 0.36 : 0.64);
        var act = s.character(who[w], { x: f.x, y: f.y, scale: f.scale, facing: w === 0 ? 0.42 : -0.42 });
        made.push([w, act]);
        s.cam.push(1.05, c.from, Math.max(0.5, Math.min(c.to, D) - c.from));
        if (c.kind === "react") { act.shake(c.from + 0.02, 0.25, 6); s.focusLines(c.from, Math.min(c.to, D), { opacity: 0.35, inner: 0.5 }); }
        if (!seen[w]) { S.nameTag(who[w], c.from + 0.1, Math.min(c.to, c.from + 1.8), { side: w === 0 ? "left" : "right" }); seen[w] = true; }
      }
      made.forEach(function (m) {
        var w2 = m[0], a = m[1];
        exT[w2].forEach(function (k) { a.expression(k.e, Math.max(0, k.at)); });
        lines.forEach(function (l) { if (l.sp === w2) { a.say(l.start, l.end); if (l.gesture) a.gesture(l.gesture, l.start + 0.1); } });
        if (c.kind === "two") a.lookAt(w2 === 0 ? "right" : "left", 0);
      });
    });
    S.subtitles({});
  };

  TPL["dramatic-reveal"] = function (root, p) {
    var who = castKey(p.character, "hikari"), loc = locKey(p.location, "night-city"), side = p.side === "right" ? "right" : "left";
    var reveal = str(p.reveal) || contentWords(V.narration).slice(-2).join(" ") || "!!";
    var tW = p.word ? kwFind(p.word) : null;
    if (tW == null) tW = labelTime(reveal, null, D * 0.3);
    if (tW == null) tW = D * 0.62;
    tW = clamp(tW, Math.min(1.4, D * 0.4), Math.max(0.6, D - 1.4));
    var s1 = S.shot(loc, 0, tW), f = s1.frame("medium", PORT ? "center" : side);
    var a1 = s1.character(who, { x: f.x, y: f.y, scale: f.scale, facing: PORT ? 0 : side === "left" ? 0.3 : -0.3, expression: exKey(p.setupExpression, null) || "serious" });
    narrate(a1, 0, tW);
    s1.cam.to({ x: f.x, y: f.y + 30, zoom: 1.22 }, 0.1, Math.max(0.5, tW - 0.2), "inOutSine");
    s1.cam.rumble(Math.max(0.2, tW - 1.1), tW, 3);
    s1.speedLines(Math.max(0, tW - 1.1), tW, { dir: "v", layer: "over", color: "#1B1440", lineOpacity: 0.25 });
    if (p.eyes !== false && tW > 1.6) {
      S.cutIn(who, tW - 0.7, tW - 0.04, { expression: exKey(p.eyesExpression, null) || "determined" });
    }
    S.impact(tW, { x: 0.5, y: 0.45 });
    var s2 = S.shot(loc, tW, 1e9, { enter: "zoom" }), f2_ = s2.frame("close", PORT ? "center" : side);
    var py = PORT ? f2_.y + 20 : f2_.y;
    var a2 = s2.character(who, { x: f2_.x, y: py, scale: f2_.scale, facing: PORT ? 0 : side === "left" ? 0.2 : -0.2, expression: exKey(p.reaction, null) || "shocked" });
    narrate(a2, tW, D);
    a2.shake(tW + 0.04, 0.45, 12);
    a2.gesture("panic", tW + 0.02, 0.14);
    if (exKey(p.afterExpression, null)) { a2.expression(p.afterExpression, tc(tW + 1.5)); a2.gesture("rest", tc(tW + 1.5), 0.3); }
    s2.focusLines(tW, 1e9, { layer: "under", bg: "#FFFFFF", inner: 0.4, x: PORT ? 0.5 : side === "left" ? 0.32 : 0.68, y: PORT ? 0.56 : 0.45 });
    s2.cam.push(1.06, tW + 0.2, Math.max(0.5, D - tW - 0.4));
    var bwO = PORT ? { x: 0.5, y: 0.255, width: 0.88 } : { x: side === "left" ? 0.7 : 0.3, y: 0.42, width: 0.5 };
    S.bigWord(reveal, tW + 0.14, { x: bwO.x, y: bwO.y, width: bwO.width, color: p.color });
    if (p.subtitles !== false) S.subtitles({ to: tW });
  };

  TPL["eyecatch-title"] = function (root, p) {
    var who = castKey(p.character, "mochi");
    var s = S.shot("plain", 0, 1e9, { color: "#FFE3F1" });
    var ss = s._s, g = svg("g", null, ss.underG);
    var cy = PORT ? 0.31 * H : 0.46 * H;
    var rays = svg("g", null, g), rd = "";
    for (var i = 0; i < 24; i++) { var a0 = (i / 24) * PI * 2; rd += "M0 0L" + f1(Math.cos(a0) * W * 1.5) + " " + f1(Math.sin(a0) * W * 1.5) + "L" + f1(Math.cos(a0 + PI / 24) * W * 1.5) + " " + f1(Math.sin(a0 + PI / 24) * W * 1.5) + "Z"; }
    svg("path", { d: rd, fill: "#FFC7DE" }, rays);
    var bh = PORT ? H * 0.2 : H * 0.36;
    svg("polygon", { points: [-50, cy - bh / 2 + H * 0.05, W + 50, cy - bh / 2 - H * 0.05, W + 50, cy + bh / 2 - H * 0.05, -50, cy + bh / 2 + H * 0.05].map(f1).join(" "), fill: ACC, stroke: INK, "stroke-width": u(8) }, g);
    svg("polygon", { points: [-50, cy + bh / 2 + H * 0.05 + u(18), W + 50, cy + bh / 2 - H * 0.05 + u(18), W + 50, cy + bh / 2 - H * 0.05 + u(34), -50, cy + bh / 2 + H * 0.05 + u(34)].map(f1).join(" "), fill: "#2B3567" }, g);
    ss.anims.push(function (t) { setA(rays, "transform", "translate(" + f1(W / 2) + " " + f1(cy) + ") rotate(" + f1(t * 14) + ")"); });
    var tT = tc(Math.max(0.5, Math.min(1.2, kwFind(contentWords(p.title)[0] || "") || 0.6)));
    var tStripe = S.stripes(0, 0.6);
    var fc = PORT ? { x: s.Ww * 0.5, y: 600, sc: who === "mochi" ? 1.05 : 0.8 } : { x: s.Ww * 0.175, y: 560, sc: who === "mochi" ? 1.45 : 1.05 };
    var ch = s.character(who, { x: fc.x, y: fc.y, scale: fc.sc, chibi: who !== "mochi", facing: PORT ? 0 : 0.4, expression: who === "mochi" ? "happy" : "excited", gesture: "cheer" });
    for (var t = 0.5; t < D - 0.8; t += 0.62) ch.hop(t, 30, 0.34);
    ch.say(0, D);
    var titleY = PORT ? 0.3 : 0.45;
    S.titleCard(str(p.title) || "Episode", tT, { kicker: str(p.episode) || null, sub: str(p.subtitle) || null, size: "xl", pos: "center", y: titleY, maxWidth: PORT ? 0.9 : 0.66, x: PORT ? 0.5 : 0.58, color: "#2B3567", emColor: GOLD });
    s.sparkles(0.3, 1e9, { count: 12, area: PORT ? [0.06, 0.15, 0.88, 0.2] : [0.05, 0.08, 0.9, 0.2], size: 24 });
    S.shakeFrame(tT, 10, 0.3);
  };

  TPL["power-up-stat"] = function (root, p) {
    var who = castKey(p.character, "kaito");
    if (who === "mochi") who = "hikari";
    var loc = locKey(p.location, "rooftop"), side = p.side === "right" ? "right" : "left", cd = CAST[who], cols = auraCols(p.aura, cd);
    var tW = p.word ? kwFind(p.word) : null;
    if (tW == null) tW = labelTime(str(p.label), null, D * 0.3);
    if (tW == null) tW = D * 0.5;
    tW = clamp(tW, Math.min(1.5, D * 0.4), Math.max(0.8, D - 1.6));
    var s1 = S.shot(loc, 0, tW), f = s1.frame("medium", "center");
    s1.speedLines(0, tW, { dir: "up", bg: "#1B1440", color: cols[1], lineOpacity: 0.55, speed: 1.6 });
    var a1 = s1.character(who, { x: f.x, y: f.y + (PORT ? 0 : 20), scale: f.scale, facing: 0, expression: "determined", gesture: "ready", wind: 0.8 });
    s1.aura(a1, 0.15, tW, { color: p.aura || cd.aura });
    s1.cam.rumble(0.3, tW, 4);
    s1.cam.push(1.1, 0.2, Math.max(0.5, tW - 0.3));
    a1.gesture("fist", Math.max(0.3, tW - 0.9), 0.2);
    narrate(a1, 0, tW);
    if (str(p.title)) S.titleCard(p.title, 0.3, { size: "md", pos: "top", style: "slide", until: tW, color: "#2B3567", y: PORT ? 0.2 : 0.16 });
    S.impact(tW);
    var s2 = S.shot(loc, tW, 1e9, { enter: "rise" }), f2_ = s2.frame("low", PORT ? "center" : side);
    var a2 = s2.character(who, { x: f2_.x, y: f2_.y + (PORT ? 40 : 30), scale: f2_.scale, facing: PORT ? 0 : side === "left" ? 0.35 : -0.35, expression: exKey(p.expression, null) || "excited", gesture: "fist-up", wind: 0.6 });
    narrate(a2, tW, D);
    s2.aura(a2, tW, 1e9, { color: p.aura || cd.aura, grow: 0.8 });
    s2.focusLines(tW, tW + 0.7, { opacity: 0.5, inner: 0.5 });
    s2.sparkles(tW + 0.3, 1e9, { count: 10, color: cols[1] });
    s2.cam.set({ y: 470, zoom: 1.05 });
    s2.cam.to({ y: 500, zoom: 1 }, tW, 0.6, "outCubic");
    var so = PORT ? { x: 0.5, y: 0.25, width: 0.86 } : { x: side === "left" ? 0.7 : 0.3, y: 0.42, width: 0.48 };
    S.stat(num(p.value, 100), tW + 0.15, { prefix: p.prefix, suffix: p.suffix, decimals: p.decimals, label: p.label, x: so.x, y: so.y, width: so.width });
  };

  TPL["training-montage-list"] = function (root, p) {
    var who = castKey(p.character, "hikari");
    if (who === "mochi") who = "hikari";
    var loc = locKey(p.location, "rooftop"), loc2 = locKey(p.location2, loc === "classroom" ? "rooftop" : "classroom"), cd = CAST[who], cols = auraCols(null, cd);
    var steps = arr(p.steps).slice(0, 5).map(function (st_) { st_ = obj(st_); return { label: str(st_.label) || "Step", word: str(st_.word), icon: st_.icon }; });
    if (!steps.length) steps = [{ label: "Begin" }];
    var title = str(p.title);
    var times = planTimes(steps, { a: title ? 1.2 : 0.3, gap: 0.9 });
    if (!title) times[0] = Math.min(times[0], 0.3);
    var start0 = 0;
    if (title && times[0] > 1.0) {
      var s0 = S.shot("plain", 0, times[0], { color: "#2B3567" });
      s0.speedLines(0, times[0], { dir: "diag", bg: "#2B3567", color: "#FFFFFF", lineOpacity: 0.35 });
      var f0 = s0.frame("chibi", PORT ? "center" : 0.2);
      var c0 = s0.character(who, { x: f0.x, y: PORT ? f0.y + 40 : f0.y, scale: f0.scale * (PORT ? 0.85 : 1), chibi: true, expression: "determined", gesture: "fist-up" });
      c0.hop(0.3, 40, 0.35);
      c0.say(0, times[0]);
      S.titleCard(title, 0.25, { size: "lg", pos: "center", y: PORT ? 0.3 : 0.45, x: PORT ? 0.5 : 0.6, maxWidth: PORT ? 0.86 : 0.6, until: times[0] });
      start0 = times[0];
    } else times[0] = 0.25;
    var variants = [
      { bg: "loc", kind: "medium", g: "fist", e: "determined" },
      { bg: "speed", kind: "close", g: "point", e: "excited" },
      { bg: "loc2", kind: "low", g: "ready", e: "serious" },
      { bg: "focus", kind: "medium", g: "cheer", e: "happy" },
      { bg: "loc", kind: "close", g: "thumbs", e: "sparkle" },
    ];
    var nS = steps.length;
    steps.forEach(function (st_, i) {
      var from = i === 0 ? start0 : times[i] - 0.05, to = i + 1 < nS ? times[i + 1] - 0.05 : 1e9;
      var v = variants[i % variants.length], sideX = PORT ? "center" : i % 2 ? "right" : "left";
      var l = v.bg === "loc2" ? loc2 : v.bg === "loc" ? loc : "plain";
      var s = S.shot(l, from, to, { enter: i === 0 && !start0 ? "cut" : i % 2 ? "whip-right" : "whip-left", color: "#FFFFFF" });
      if (v.bg === "speed") s.speedLines(from, to, { dir: i % 2 ? "h" : "diag", bg: cols[0], color: "#FFFFFF", lineOpacity: 0.5 });
      if (v.bg === "focus") s.focusLines(from, to, { layer: "under", bg: "#FFFFFF", inner: 0.4, x: PORT ? 0.5 : sideX === "left" ? 0.3 : 0.7, y: PORT ? 0.62 : 0.45 });
      var f = s.frame(v.kind, sideX);
      var ty = PORT ? f.y + 20 : f.y;
      var a = s.character(who, { x: f.x, y: ty, scale: f.scale * (PORT && v.kind === "close" ? 0.94 : 1), facing: PORT ? (i % 2 ? -0.2 : 0.2) : sideX === "left" ? 0.4 : -0.4, expression: v.e, gesture: "rest", wind: v.bg === "speed" ? 0.7 : 0.2 });
      a.gesture(v.g, from + 0.12, 0.2);
      a.say(from, Math.min(to, D));
      if (who === "ren") a.glint(from + 0.2);
      s.cam.push(1.06, from, Math.max(0.5, Math.min(to, D) - from));
      var sc = PORT ? { x: 0.5, y: 0.235, width: 0.86 } : { x: sideX === "left" ? 0.69 : 0.31, y: 0.42, width: 0.46 };
      S.stepCard(i + 1, st_.label, from + 0.06, to, { x: sc.x, y: sc.y, width: sc.width, icon: st_.icon });
    });
    // progress pips
    var F = getFilm(), ps = PORT ? 30 : 26, gap = ps * 0.7, tw = nS * ps + (nS - 1) * gap;
    var py = PORT ? 0.335 * H : 0.57 * H, pxc = PORT ? 0.5 : 0.5;
    var pips = box(F.letter, "an-pips", pxc * W - tw / 2, py, tw, ps);
    var dots = [];
    for (var k = 0; k < nS; k++) dots.push(box(pips, "an-pip", k * (ps + gap), 0, ps, ps));
    addLetter(pips, "pips", "progress", start0 || 0.25, 1e9);
    F.anims.push(function (t) {
      showEl(pips, t >= (start0 || 0.25));
      dots.forEach(function (d, k) { var on = t >= (k === 0 ? start0 || 0.25 : times[k] - 0.05); if (d._on !== on) { d._on = on; d.classList.toggle("an-on", on); } });
    });
  };

  TPL.flashback = function (root, p) {
    var who = castKey(p.character, "yuki"), loc = locKey(p.location, "shrine"), ploc = locKey(p.presentLocation, "rooftop");
    var lines = arr(p.lines).slice(0, 3).map(str).filter(Boolean);
    var tR = p.returnWord ? kwFind(p.returnWord) : null;
    if (tR != null) tR = clamp(tR, Math.min(D * 0.45, D - 1.6), D - 1.2);
    var memEnd = tR == null ? 1e9 : tR;
    var s1 = S.shot(loc, 0, memEnd), f = s1.frame("medium", PORT ? "center" : "left");
    var a1 = s1.character(who, { x: f.x, y: f.y, scale: f.scale, facing: PORT ? 0.1 : 0.35, expression: exKey(p.memoryExpression, null) || "happy", wind: 0.4 });
    narrate(a1, 0, memEnd);
    a1.look(0.3, -0.2, 0);
    s1.cam.set({ zoom: 1.08 });
    s1.cam.to({ zoom: 1.0 }, 0, Math.max(1, Math.min(memEnd, D) - 0.2), "inOutSine");
    if (loc !== "shrine") s1.petals(0, memEnd, { count: PORT ? 10 : 16, color: "#FFF3D6" });
    S.memory(0, memEnd);
    // caption
    var F = getFilm(), cap = str(p.caption) || "Long ago", kick = str(p.kicker) || "Memory";
    var cs = PORT ? 64 : 60, cl = layoutRich(cap, { size: cs, maxWidth: PORT ? W * 0.84 : W * 0.4, maxLines: 2, weight: 900, italic: true });
    var cw = cl.w + cs * 1.2, chh = cl.h + cs * 0.5, cx = PORT ? (W - cw) / 2 : W * 0.08, cyy = PORT ? H * 0.17 : H * 0.13;
    var capEl = box(F.letter, "an-memcap", cx, cyy, cw, chh);
    var capIn = div("an-memcap-in", capEl); fillRich(capIn, cl);
    var kEl = box(F.letter, "an-memkick", cx, cyy - cs * 0.85, null, null);
    kEl.textContent = kick;
    kEl.style.fontSize = f1(cs * 0.5) + "px";
    var tCap = 0.3;
    addLetter(capEl, "caption", cap, tCap, memEnd);
    addLetter(kEl, "kicker", kick, tCap, memEnd);
    // memory lines, fading in on their words
    var lt = planTimes(lines.map(function (l) { return { label: l }; }), { a: 1.0, gap: 0.8, limit: Math.min(memEnd, D) - 0.6 });
    var lsz = PORT ? 56 : 52, lmax = PORT ? W * 0.84 : W * 0.44;
    var lays = lines.map(function (l) { return layoutRich(l, { size: lsz, maxWidth: lmax, maxLines: 2, weight: 800, italic: true, lh: 1.12, minSize: 34 }); });
    var totalH = lays.reduce(function (a2, l) { return a2 + l.h + lsz * 0.45; }, 0);
    var ly = PORT ? H * 0.3 : H * 0.5 - totalH / 2, lineEls = [];
    lays.forEach(function (l, i) {
      var x = PORT ? (W - l.w) / 2 - 10 : W * 0.52;
      var el = box(F.letter, "an-memline", x, ly, l.w + 20, l.h);
      fillRich(el, l);
      addLetter(el, "line", lines[i], lt[i], memEnd);
      lineEls.push({ el: el, at: lt[i] });
      ly += l.h + lsz * 0.45;
    });
    F.anims.push(function (t) {
      var on = t >= tCap && t < memEnd;
      showEl(capEl, on); showEl(kEl, on);
      if (on) { var q = clamp((t - tCap) / 0.4, 0, 1); setS(capEl, "transform", "translateX(" + f1((1 - CE.smear(q)) * 30) + "px)"); setS(capEl, "opacity", f2(q)); setS(kEl, "opacity", f2(q)); }
      lineEls.forEach(function (le) { var o2 = clamp((t - le.at) / 0.6, 0, 1); showEl(le.el, o2 > 0 && t < memEnd); if (o2 > 0) { setS(le.el, "opacity", f2(o2)); setS(le.el, "transform", "translateY(" + f1((1 - o2) * 14) + "px)"); } });
    });
    if (tR != null) {
      S.flash(tR - 0.06, "#FFFFFF", 0.45);
      var s2 = S.shot(ploc, tR, 1e9, { enter: "cut" }), f2_ = s2.frame("close", PORT ? "center" : "right");
      var a2 = s2.character(who, { x: f2_.x, y: f2_.y, scale: f2_.scale, facing: PORT ? 0 : -0.3, expression: exKey(p.presentExpression, null) || "determined", wind: 0.6 });
      narrate(a2, tR, D);
      a2.gesture("fist", tc(tR + 0.4), 0.2);
      s2.cam.push(1.06, tR, Math.max(0.5, D - tR - 0.3));
      s2.sparkles(tR + 0.2, 1e9, { count: 8, area: PORT ? [0.1, 0.15, 0.8, 0.25] : [0.05, 0.1, 0.45, 0.6] });
      S.subtitles({ from: tR });
    }
  };

  TPL["versus-battle"] = function (root, p) {
    var Lp = obj(p.left), Rp = obj(p.right);
    var A = castKey(Lp.character, "hikari"), B = castKey(Rp.character, A === "kaito" ? "hikari" : "kaito");
    if (B === A) B = A === "kaito" ? "hikari" : "kaito";
    var ca = auraCols(Lp.aura, CAST[A]), cb = auraCols(Rp.aura, CAST[B]);
    var tL = Lp.word ? kwFind(Lp.word) : labelTime(Lp.label, null, 0), tRr = Rp.word ? kwFind(Rp.word, tL || 0) : labelTime(Rp.label, null, tL || 0);
    var tC = p.word ? kwFind(p.word) : null;
    if (tC == null) tC = D * 0.62;
    tC = clamp(tC, Math.min(2.2, D * 0.45), Math.max(1, D - 1.8));
    tL = tc(tL == null ? 0.3 : Math.min(tL, tC - 1.0));
    tRr = tc(tRr == null ? tL + 0.6 : Math.max(tL + 0.4, Math.min(tRr, tC - 0.5)));
    var tVs = tc(Math.max(tRr - 0.25, kwFind("versus") || kwFind("vs") || (tL + tRr) / 2));
    var s1 = S.shot("plain", 0, tC, { color: "#FFFFFF" }), ss = s1._s, Ww = s1.Ww;
    // split polygons in screen px (camera is static in this shot)
    var polyA, polyB;
    if (PORT) { polyA = [-60, -60, W + 60, -60, W + 60, H * 0.45, -60, H * 0.56]; polyB = [-60, H * 0.56, W + 60, H * 0.45, W + 60, H + 60, -60, H + 60]; }
    else { polyA = [-60, -60, W * 0.58, -60, W * 0.42, H + 60, -60, H + 60]; polyB = [W * 0.58, -60, W + 60, -60, W + 60, H + 60, W * 0.42, H + 60]; }
    function half(poly, col, col2, seed) {
      var cid = uid("vs"), cp = svg("clipPath", { id: cid }, ss.defs2);
      svg("polygon", { points: poly.map(f1).join(" ") }, cp);
      var g = svg("g", { "clip-path": "url(#" + cid + ")" }, ss.underG);
      svg("rect", { x: -100, y: -100, width: W + 200, height: H + 200, fill: col }, g);
      var d = "", rnd = V.makeRand(seed);
      for (var i = 0; i < 60; i++) { var y = rnd() * H, len = W * (0.2 + rnd() * 0.5), x = rnd() * W * 1.4 - W * 0.2; d += "M" + f1(x) + " " + f1(y) + "h" + f1(len) + "v" + f1(2 + rnd() * 8) + "h" + f1(-len) + "Z"; }
      var lines = svg("path", { d: d, fill: col2, opacity: 0.6 }, g);
      return { g: g, lines: lines };
    }
    var hA = half(polyA, shade(ca[0], 0.8), ca[1], 5), hB = half(polyB, shade(cb[0], 0.8), cb[1], 9);
    var edge = svg("polyline", { points: (PORT ? [-60, H * 0.56, W + 60, H * 0.45] : [W * 0.58, -60, W * 0.42, H + 60]).map(f1).join(" "), stroke: INK, "stroke-width": u(16), fill: "none" }, ss.underG);
    svg("polyline", { points: (PORT ? [-60, H * 0.56, W + 60, H * 0.45] : [W * 0.58, -60, W * 0.42, H + 60]).map(f1).join(" "), stroke: "#FFFFFF", "stroke-width": u(6), fill: "none" }, ss.underG);
    ss.anims.push(function (t) { var o1 = mod(t * W * 1.2, W * 0.6); setA(hA.lines, "transform", "translate(" + f1(o1 - W * 0.3) + " 0)"); setA(hB.lines, "transform", "translate(" + f1(W * 0.3 - o1) + " 0)"); });
    var k = H / 1000;
    function toW(px, py) { return [px / k, py / k]; }
    var posA = PORT ? toW(W * 0.68, H * 0.27) : toW(W * 0.22, H * 0.47), posB = PORT ? toW(W * 0.32, H * 0.66) : toW(W * 0.78, H * 0.47);
    var scV = PORT ? 0.78 : 0.95;
    var clipA = polyA.map(function (v, i) { return f1(v / k); }).join(" "), clipB = polyB.map(function (v) { return f1(v / k); }).join(" ");
    var aA = s1.character(A, { x: posA[0], y: posA[1], scale: scV, facing: PORT ? -0.35 : 0.45, expression: "determined", gesture: "ready", clip: clipA, wind: 0.6 });
    var aB = s1.character(B, { x: posB[0], y: posB[1], scale: PORT ? 0.74 : scV, facing: PORT ? 0.35 : -0.45, expression: "determined", gesture: "ready", clip: clipB, wind: 0.6 });
    aA.slideIn(PORT ? "right" : "left", 0.05, 0.26);
    aB.slideIn(PORT ? "left" : "right", 0.22, 0.26);
    aA.hop(tL, 24, 0.3).expression("smug", tL);
    aB.hop(tRr, 24, 0.3).expression("smug", tRr);
    aA.expression("determined", tc(tVs)); aB.expression("determined", tc(tVs));
    s1.aura(aA, Math.min(tL, 0.3), tC, { color: Lp.aura || CAST[A].aura });
    s1.aura(aB, Math.min(tRr, 0.45), tC, { color: Rp.aura || CAST[B].aura });
    narrate(aA, 0, tC); narrate(aB, 0, tC);
    // labels
    function plate(pp, at, xf, yf, col) {
      var lab = str(pp.label) || CAST[castKey(pp.character, "hikari")].name;
      var r = S.callout(lab, at, { x: xf, y: yf, width: PORT ? 0.5 : 0.36, kicker: str(pp.stat) || null, size: PORT ? 56 : 58, emColor: col, until: tC });
      return r;
    }
    if (PORT) { plate(Lp, tL + 0.1, 0.3, 0.3, ca[0]); plate(Rp, tRr + 0.1, 0.7, 0.62, cb[0]); }
    else { plate(Lp, tL + 0.1, 0.22, 0.8, ca[0]); plate(Rp, tRr + 0.1, 0.78, 0.8, cb[0]); }
    var vs = S.bigWord("VS", tVs, { x: PORT ? 0.5 : 0.5, y: PORT ? 0.5 : 0.46, width: 0.3, size: PORT ? 170 : 200, until: tC, color: GOLD });
    S.shakeFrame(tVs, 12, 0.3);
    // clash
    S.impact(tC, { x: 0.5, y: 0.47 });
    var s2 = S.shot("plain", tC, 1e9, { enter: "zoom", color: "#FFFFFF" });
    s2.focusLines(tC, 1e9, { layer: "under", bg: "#FFFFFF", inner: 0.3, y: 0.47 });
    var fA = s2.frame("medium", PORT ? 0.3 : 0.38), fB = s2.frame("medium", PORT ? 0.7 : 0.62), sc2 = PORT ? 0.72 : 0.95;
    var yy = PORT ? 560 : 480;
    var cA = s2.character(A, { x: fA.x - 120, y: yy, scale: sc2, facing: 0.55, expression: "angry", gesture: "punch" });
    var cB = s2.character(B, { x: fB.x + 120, y: yy, scale: sc2, facing: -0.55, expression: "angry", gesture: "punch" });
    cA.moveTo(fA.x, null, tC, 0.16); cB.moveTo(fB.x, null, tC, 0.16);
    cA.shake(tC + 0.15, 0.4, 10); cB.shake(tC + 0.15, 0.4, 10);
    s2.burst(tC + 0.1, { x: 0.5, y: PORT ? 0.4 : 0.62, r: 0.22 });
    s2.rings(tC + 0.1, { x: 0.5, y: PORT ? 0.4 : 0.62 });
    narrate(cA, tC, D); narrate(cB, tC, D);
    var verdict = str(p.verdict) || "tie", tV = tc(tC + 0.8);
    function win(a, side) { a.expression("sparkle", tV).gesture("cheer", tV, 0.2).hop(tV, 30, 0.3); }
    function lose(a) { a.expression("panic", tV).gesture("panic", tV, 0.2).shake(tV, 0.4, 8); }
    if (verdict === "left") { win(cA); lose(cB); s2.sparkles(tV, 1e9, { count: 10, area: PORT ? [0.05, 0.18, 0.5, 0.3] : [0.1, 0.1, 0.35, 0.5] }); }
    else if (verdict === "right") { win(cB); lose(cA); s2.sparkles(tV, 1e9, { count: 10, area: PORT ? [0.5, 0.18, 0.45, 0.3] : [0.55, 0.1, 0.35, 0.5] }); }
    else { cA.expression("determined", tV).gesture("ready", tV); cB.expression("determined", tV).gesture("ready", tV); }
    if (verdict === "left" || verdict === "right") {
      var wp = verdict === "left" ? Lp : Rp, wl = str(wp.label) || CAST[verdict === "left" ? A : B].name;
      S.titleCard("*" + plain(wl) + "*", tV + 0.05, { kicker: "Winner", size: "md", pos: "top", y: PORT ? 0.21 : 0.17, x: PORT ? 0.5 : verdict === "left" ? 0.3 : 0.7, maxWidth: PORT ? 0.86 : 0.5, color: verdict === "left" ? shade(ca[0], 0.85) : shade(cb[0], 0.85) });
    }
  };

  TPL["lesson-board"] = function (root, p) {
    var who = castKey(p.character, "ren");
    if (who === "mochi") who = "ren";
    var pts = arr(p.points).slice(0, 4).map(function (q) { q = typeof q === "string" ? { text: q } : obj(q); return { label: str(q.text), word: str(q.word), expression: q.expression }; }).filter(function (q) { return q.label; });
    if (!pts.length) pts = [{ label: plain(p.title) || "Listen up" }];
    var times = planTimes(pts, { a: 1.2, gap: 0.7 });
    var tOpen = times[0] > 2.0 ? Math.min(1.3, times[0] - 0.6) : 0;
    if (tOpen > 0.6) {
      var s0 = S.shot("classroom", 0, tOpen, { board: { clean: true } }), f0 = s0.frame("close", PORT ? "center" : 0.6);
      var r0 = s0.character(who, { x: f0.x, y: f0.y, scale: f0.scale, facing: -0.25, expression: "smug", gesture: "glasses" });
      r0.glint(0.35);
      r0.say(0, tOpen);
      s0.sparkles(0.3, tOpen, { count: 6, area: PORT ? [0.2, 0.25, 0.6, 0.3] : [0.35, 0.15, 0.3, 0.4] });
    } else tOpen = 0;
    var s = S.shot("classroom", tOpen, 1e9, { enter: "cut", board: { clean: true } }), B = s.board;
    var rx = PORT ? s.Ww * 0.66 : s.Ww * 0.8, ry = PORT ? 640 : 470, rs = PORT ? 0.84 : 1.0;
    var ren = s.character(who, { x: rx, y: ry, scale: rs, facing: -0.4, expression: "calm" });
    ren.say(tOpen, D);
    if (!tOpen) ren.glint(0.35);
    var bt = boardText(s, str(p.title) || "Lesson", pts.map(function (q) { return q.label; }), times);
    var cyc = ["calm", "serious", "smug", "smile"];
    pts.forEach(function (q, i) {
      var t = times[i];
      ren.gesture(PORT ? "point-up" : "point", t - 0.1, 0.2);
      ren.expression(exKey(q.expression, null) || cyc[i % cyc.length], t - 0.05);
      ren.look(-0.8, PORT ? -0.6 : -0.1, t - 0.1);
      var back = i + 1 < pts.length ? times[i + 1] - 0.45 : t + 1.2;
      if (back > t + 0.7) { ren.gesture("explain", back, 0.25); ren.look(0, 0, back); }
    });
    if (pts.length > 1) ren.glint(tc(times[pts.length - 1] + 0.3));
    ren.expression(exKey(p.endExpression, null) || "smile", tc(Math.max(times[times.length - 1] + 0.9, D - 1.3)));
    s.cam.set({ zoom: 1.0 });
    s.cam.push(1.04, tOpen, Math.max(0.5, D - tOpen - 0.3));
  };

  TPL["sky-montage"] = function (root, p) {
    var loc = locKey(p.location, "sky"), lines = arr(p.lines).slice(0, 3).map(str).filter(Boolean);
    var two = p.cuts !== false && D > 7;
    var tMid = two ? cutNear(D * 0.5, D * 0.35, D * 0.65) : 1e9;
    var s1 = S.shot(loc, 0, tMid), s2 = two ? S.shot(loc, tMid, 1e9, { enter: "cut" }) : null;
    s1.cam.set({ y: 420, zoom: 1.14 });
    s1.cam.to({ y: 560, zoom: 1.05 }, 0, Math.min(tMid, D), "inOutSine");
    if (s2) { s2.cam.set({ x: s2.Ww * 0.56, y: 520, zoom: 1.24 }); s2.cam.to({ x: s2.Ww * 0.46, zoom: 1.16 }, tMid, D - tMid, "inOutSine"); }
    [s1, s2].forEach(function (s) {
      if (!s) return;
      if (loc === "space" || loc === "night-city") s.sparkles(0, 1e9, { count: 16, size: 18, area: [0.02, 0.02, 0.96, 0.6] });
      else if (loc !== "shrine") s.petals(0, 1e9, { count: PORT ? 8 : 14, color: loc === "sunset-city" ? "#FFD6A0" : "#FFFFFF" });
    });
    var F = getFilm(), cap = str(p.caption), sub = str(p.subcaption), tCap = 0.3;
    if (cap) {
      var cs = PORT ? 80 : 76, cl = layoutRich(cap, { size: cs, maxWidth: PORT ? W * 0.84 : W * 0.5, maxLines: 2, weight: 900, italic: true });
      var cx = PORT ? (W - cl.w) / 2 - 20 : W * 0.075, cy = PORT ? H * 0.16 : H * 0.12;
      var capEl = box(F.letter, "an-skycap", cx, cy, cl.w + 40, cl.h);
      fillRich(capEl, cl);
      addLetter(capEl, "caption", cap, tCap, 1e9);
      var subEl = null;
      if (sub) {
        var sz2 = PORT ? 44 : 40, sl = layoutRich(sub, { size: sz2, maxWidth: PORT ? W * 0.84 : W * 0.5, maxLines: 2, weight: 800 });
        subEl = box(F.letter, "an-skysub", PORT ? (W - sl.w) / 2 - 20 : cx + 4, cy + cl.h + sz2 * 0.4, sl.w + 40, sl.h + sz2 * 0.3);
        var si = div("an-skysub-in", subEl); fillRich(si, sl);
        addLetter(subEl, "caption", sub, tCap + 0.4, 1e9);
      }
      var bar = box(F.letter, "an-skybar", PORT ? W / 2 - cs * 1.2 : cx + 4, cy - cs * 0.3, cs * (PORT ? 2.4 : 2.2), u(8));
      F.anims.push(function (t) {
        var q = clamp((t - tCap) / 0.6, 0, 1);
        showEl(capEl, q > 0); showEl(bar, q > 0);
        setS(capEl, "opacity", f2(q)); setS(capEl, "transform", "translateY(" + f1((1 - q) * 20) + "px)");
        setS(bar, "transform", "scaleX(" + f2(V.ease.outCubic(q)) + ")");
        if (subEl) { var q2 = clamp((t - tCap - 0.4) / 0.6, 0, 1); showEl(subEl, q2 > 0); setS(subEl, "opacity", f2(q2)); }
      });
    }
    if (lines.length) {
      var lt = planTimes(lines.map(function (l) { return { label: l }; }), { a: 0.9, gap: 0.9 });
      var lsz = PORT ? 64 : 60, lays = lines.map(function (l) { return layoutRich(l, { size: lsz, maxWidth: PORT ? W * 0.84 : W * 0.6, maxLines: 2, weight: 800, italic: true, lh: 1.12, minSize: 34 }); });
      var tot = lays.reduce(function (a2, l) { return a2 + l.h + lsz * 0.4; }, 0);
      var y = PORT ? Math.min(H * 0.5, H * 0.74 - tot) : H * 0.66 - tot / 2;
      lays.forEach(function (l, i) {
        var el = box(F.letter, "an-poem", (W - l.w) / 2 - 16, y, l.w + 32, l.h);
        fillRich(el, l);
        addLetter(el, "line", lines[i], lt[i], 1e9);
        y += l.h + lsz * 0.4;
        F.anims.push(function (t) { var q = clamp((t - lt[i]) / 0.7, 0, 1); showEl(el, q > 0); if (q > 0) { setS(el, "opacity", f2(q)); setS(el, "transform", "translateY(" + f1((1 - q) * 16) + "px)"); } });
      });
    }
  };

  TPL["chibi-explainer"] = function (root, p) {
    var who = castKey(p.character, "mochi"), fact = str(p.fact) || plain(V.narration).split(/[.!?]/)[0] || "Fun fact!";
    var col = isColor(p.color) ? hex6(p.color) : "#E4F1FF";
    var s = S.shot("plain", 0, 1e9, { color: col });
    var tW = p.word ? kwFind(p.word) : labelTime(fact, null, 0.5);
    tW = tc(tW == null ? D * 0.55 : tW);
    var fc = PORT ? { x: s.Ww * 0.3, y: 590, sc: 0.8 } : { x: s.Ww * 0.2, y: 520, sc: 1.08 };
    if (who === "mochi") fc = PORT ? { x: s.Ww * 0.3, y: 630, sc: 0.95 } : SQUARE ? { x: s.Ww * 0.22, y: 600, sc: 1.05 } : { x: s.Ww * 0.2, y: 540, sc: 1.6 };
    else if (SQUARE) fc = { x: s.Ww * 0.22, y: 500, sc: 0.95 };
    else if (!PORT) fc = { x: s.Ww * 0.2, y: 470, sc: 1.3 };
    var ch = s.character(who, { x: fc.x, y: fc.y, scale: fc.sc, chibi: who !== "mochi", facing: 0.35, expression: who === "mochi" ? "happy" : "smile", gesture: "explain" });
    ch.say(0, D);
    for (var t = 0.4; t < D - 0.8; t += 0.9) if (Math.abs(t - tW) > 0.4) ch.hop(t, 14, 0.3);
    var rx = exKey(p.reaction, null) || "sparkle";
    ch.expression(rx, tW).hop(tW, 40, 0.34);
    if (rx === "panic" || rx === "shocked" || rx === "flustered") { ch.gesture("panic", tW, 0.16).shake(tW + 0.05, 0.4, 8); }
    else { ch.gesture("cheer", tW, 0.2); s.sparkles(tW, 1e9, { count: 10, area: PORT ? [0.06, 0.5, 0.5, 0.25] : [0.04, 0.2, 0.36, 0.6] }); }
    s.focusLines(tW, tW + 0.45, { opacity: 0.3, inner: 0.5 });
    var bo = PORT ? { x: 0.5, y: 0.25, width: 0.88, tail: "down", tailX: 0.18 } : { x: 0.64, y: 0.34, width: 0.56, tail: "left" };
    var bub = S.bubble(fact, 0.3, 1e9, { x: bo.x, y: bo.y, width: bo.width, tail: bo.tail, tailX: bo.tailX, maxHeight: PORT ? 0.26 : 0.42, size: PORT ? 58 : 66 });
    var icons = arr(p.icons).slice(0, 4).map(function (q) { q = obj(q); return { icon: q.icon || "star", label: str(q.label), word: str(q.word) }; });
    if (icons.length) {
      var it = planTimes(icons.map(function (q) { return { label: q.label, word: q.word }; }), { a: 1.0, gap: 0.4 });
      var n = icons.length, bb = bub.box;
      icons.forEach(function (q, i) {
        var x, y;
        if (PORT) { var cols2 = n > 2 ? 2 : 1, r = Math.floor(i / cols2), c = i % cols2; x = cols2 === 1 ? 0.74 : 0.62 + c * 0.25; y = (bb.y + bb.h) / H + 0.12 + r * 0.15; if (cols2 === 1) y = (bb.y + bb.h) / H + 0.12 + i * 0.15; }
        else { var span = Math.min(0.5, (n - 1) * (SQUARE ? 0.25 : 0.17)); x = 0.64 - span / 2 + (n > 1 ? (span * i) / (n - 1) : 0); y = Math.min(0.8, (bb.y + bb.h) / H + 0.2); }
        S.iconPop(q.icon, q.label, it[i], { x: x, y: y });
      });
    }
  };

  // ------------------------- render, fallback, inspect -------------------------
  function render(id, root, props) {
    if (!TPL[id]) throw new Error("Unknown template: " + id);
    TPL[id](root, obj(props));
  }
  function fallback(root, narration) {
    try {
      film = null;
      var sh = V.root().querySelector(".an-film");
      if (sh && sh.parentNode) sh.parentNode.removeChild(sh);
      var s = S.shot("sky", 0, 1e9), f = s.frame("medium", PORT ? "center" : "left");
      var a = s.character("hikari", { x: f.x, y: f.y, scale: f.scale, facing: PORT ? 0 : 0.4, expression: "smile", gesture: "wave" });
      narrate(a, 0, D);
      var words = contentWords(narration || V.narration).slice(0, 5).join(" ") || "Let's go!";
      S.titleCard(words, 0.3, { size: "md", pos: PORT ? "top" : "right", y: PORT ? 0.22 : 0.4 });
      S.subtitles({});
      if (S.flush) S.flush();
    } catch (e) { V.error("[anime fallback] " + (e && e.message ? e.message : e)); }
  }
  function inspect(t) {
    var F = film;
    if (!F) return [];
    if (!F.fin) finalize(F);
    var out = [], s = activeShot(F, t);
    var c = s ? camAt(s, t) : null, camMoving = !!(c && c.moving);
    F.letters.forEach(function (L_) {
      if (!letterOn(L_, t)) return;
      if (L_.el.style.display === "none" || (L_.mover && L_.mover.style.display === "none")) return;
      var r = L_.el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      out.push({ kind: L_.kind, label: L_.label, x: r.left, y: r.top, w: r.width, h: r.height, moving: t < L_.from + 0.4 });
    });
    if (s) {
      s.actors.forEach(function (a) {
        if (a.vis.val(t) < 0.5 || a.noInspect) return;
        if (s.enter !== "cut" && t < s.from + 0.3) return; // crash zooms and whips overshoot on purpose
        var b = actorWorldBox(a, t), p0 = toScr(s, c, b.x, b.y), p1 = toScr(s, c, b.x + b.w, b.y + b.h);
        out.push({ kind: "character", label: a.name, x: p0[0], y: p0[1], w: p1[0] - p0[0], h: p1[1] - p0[1], moving: camMoving || a.pos.moving(t) || t < s.from + 0.35 });
      });
      s.boxes.forEach(function (bx) { if (t >= bx.at + 0.5) { var q0 = toScr(s, c, bx.wx, bx.wy), q1 = toScr(s, c, bx.wx + bx.w, bx.wy + bx.h); out.push({ kind: bx.kind, label: bx.label, x: q0[0], y: q0[1], w: q1[0] - q0[0], h: q1[1] - q0[1], moving: camMoving }); } });
    }
    return out;
  }

  // ------------------------- public API -------------------------
  S.film = function () { var F = getFilm(); return { shots: F.shots.map(function (s) { return s.api; }), el: F.el }; };
  S.shot = function (location, from, to, opts) { return makeShot(location, from == null ? 0 : from, to == null ? 1e9 : to, opts); };
  S.scene = function (location, opts) { return makeShot(location, 0, 1e9, opts); };
  S.currentShot = function () { var F = getFilm(); var s = F.shots[F.shots.length - 1]; return s ? s.api : null; };
  S.narrate = narrate;
  S.impact = function (at, o) { impact(at, o); };
  S.flash = flash;
  S.shakeFrame = shakeFrame;
  S.stripes = stripes;
  S.memory = memory;
  S.cutIn = cutIn;
  S.titleCard = titleCard;
  S.bigWord = bigWord;
  S.callout = callout;
  S.subtitles = subtitles;
  S.nameTag = nameTag;
  S.stat = stat;
  S.stepCard = stepCard;
  S.bubble = bubble;
  S.iconPop = iconPop;
  S.boardText = boardText;
  S.castInfo = function () { var o = {}; CAST_IDS.forEach(function (k) { var c = CAST[k]; o[k] = { name: c.name, color: c.color, aura: c.aura }; }); return o; };
  S.cast = CAST_IDS.slice();
  S.expressions = Object.keys(EXPR);
  S.gestures = Object.keys(GEST);
  S.locations = LOCS.slice();
  S.icons = Object.keys(ICONS);
  S.icon = iconSvg;
  S.animeEase = CE;
  S.find = kwFind;
  S.phrases = function (from, to) { return phrases(from, to); };
  S.stage = function (opts) { return S.scene("plain", opts); };
  S.templates = Object.keys(TPL);
  S.render = render;
  S.fallback = fallback;
  S.inspect = inspect;
  S.flush = function () { if (film) { finalize(film); filmFrame(V.time()); } };
})();

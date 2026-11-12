/* Pixel World engine (style id: pixel-world).
 *
 * The video is an original 16-bit game. Everything is drawn on ONE low-res canvas (about 320x180
 * logical pixels in 16:9, 180x320 in 9:16, 180x180 in 1:1) that the page scales up by a whole
 * number with hard pixel edges, plus a static CSS scanline overlay.
 *
 * Architecture
 * - Build time: S.game(root, opts) makes the canvas and a Game. Templates and custom code only
 *   SCHEDULE things on the game (actors with timed moves, items with a grab time, windows with an
 *   open time, particles with a spawn time). Art (font glyphs, sprites, world layers) is drawn once
 *   into small cached canvases.
 * - Frame time: ONE V.onFrame per game calls g.frame(t), which clears the canvas and redraws the
 *   whole picture from t alone: world (sky, parallax layers, ground), world entities sorted by z,
 *   UI entities, flashes, intro transition. Seeking backwards works because nothing is mutated.
 * - Timing: templates find each beat with V.find(keyword) (labelTime / landTimes below, copied from
 *   the whiteboard pilot), spread missing ones, keep a minimum gap and keep the last beat about
 *   1.6 s before the end. Dialogue text is aligned word by word to the narration (alignText).
 * - Randomness only from fixed hashes of indexes, so the same props give the same frames.
 *
 * Contract: window.SceneStyle (S) with S.render, S.fallback, S.flush, S.inspect and the custom-mode
 * API in docs.md. No network, no timers, no wall clock, no DOM text.
 */
(function () {
  "use strict";
  var V = window.V;
  if (!V) return;
  var S = (window.SceneStyle = window.SceneStyle || {});
  var doc = document;
  var W = V.width, H = V.height, D = V.duration;
  var PORTRAIT = V.isPortrait, SQUARE = V.isSquare;
  var K = Math.max(1, Math.round(Math.min(W, H) / 180));
  var LW = Math.ceil(W / K), LH = Math.ceil(H / K);
  var OX = Math.floor((W - LW * K) / 2), OY = Math.floor((H - LH * K) / 2);
  var PI = Math.PI;

  // ------------------------- small utils -------------------------
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, p) { return a + (b - a) * p; }
  function num(v, d) { var n = typeof v === "number" ? v : parseFloat(v); return isFinite(n) ? n : d; }
  function str(v) { return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim(); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function T(p) { return p && typeof p === "object" ? p : {}; }
  function up(s) { return str(s).toUpperCase(); }
  function R(v) { return Math.round(v); }
  function prog(t, a, d) { return d <= 0 ? (t >= a ? 1 : 0) : clamp((t - a) / d, 0, 1); }
  function smooth(p) { return p * p * (3 - 2 * p); }
  function outBack(p) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); }
  function outBounce(x) { return V.ease.outBounce(x); }
  function hash(a, b) {
    var h = (Math.imul(a | 0, 374761393) + Math.imul((b | 0) + 1, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function strHash(s) { var h = 7; s = String(s); for (var i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; return h >>> 0; }
  function cv(w, h) {
    var c = doc.createElement("canvas");
    c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
    var x = c.getContext("2d"); x.imageSmoothingEnabled = false;
    return c;
  }
  function rect(ctx, x, y, w, h, c) { if (w <= 0 || h <= 0) return; ctx.fillStyle = c; ctx.fillRect(R(x), R(y), R(w), R(h)); }
  function hex2rgb(h) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(h));
    if (!m) return [20, 15, 38];
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function shade(hex, k) {
    var c = hex2rgb(hex);
    function f(v) { return clamp(Math.round(v * k), 0, 255); }
    return "#" + ((1 << 24) | (f(c[0]) << 16) | (f(c[1]) << 8) | f(c[2])).toString(16).slice(1);
  }
  function normWord(s) {
    return String(s == null ? "" : s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
  }

  // ------------------------- palette -------------------------
  var PAL = {
    ink: "#140f26", black: "#0a0714", white: "#f4f4e8", cream: "#f0e0b8", paper: "#ecd8a8",
    yellow: "#f8d040", gold: "#e0a020", orange: "#f08830", red: "#e04048", darkred: "#982838", pink: "#f07898",
    blue: "#3868d8", darkblue: "#243c8c", navy: "#18204c", sky: "#6cb0f0", lightsky: "#b4e0f8", cyan: "#58d8e8",
    teal: "#2a8c98", green: "#48b848", darkgreen: "#2a7038", lime: "#a8e058", brown: "#8a5430", darkbrown: "#55331f",
    tan: "#d8a868", skin: "#f8c8a0", skinDark: "#d89070", grey: "#8b8fa8", darkgrey: "#4a4a68", lightgrey: "#c8c8d8",
    purple: "#7040b8", violet: "#b078e8", deep: "#2a1c48", muted: "#8b8fa8", silver: "#d8dce8",
  };
  function col(c, d) { if (!c) return d || PAL.white; if (PAL[c]) return PAL[c]; if (/^#[0-9a-f]{6}$/i.test(String(c))) return c; return d || PAL.white; }

  // ------------------------- dither and gradients -------------------------
  var BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  var patCache = {};
  var patCtx = cv(4, 4).getContext("2d");
  function pattern(color, level) {
    var key = color + "|" + level;
    if (patCache[key]) return patCache[key];
    var c = cv(4, 4), x = c.getContext("2d");
    x.fillStyle = color;
    for (var i = 0; i < 16; i++) if (BAYER[i] < level) x.fillRect(i % 4, (i / 4) | 0, 1, 1);
    patCache[key] = patCtx.createPattern(c, "repeat");
    return patCache[key];
  }
  function dither(ctx, x, y, w, h, color, coverage) {
    var lv = Math.round(clamp(coverage == null ? 0.5 : coverage, 0, 1) * 16);
    if (lv <= 0 || w <= 0 || h <= 0) return;
    if (lv >= 16) { rect(ctx, x, y, w, h, color); return; }
    ctx.fillStyle = pattern(color, lv);
    ctx.fillRect(R(x), R(y), R(w), R(h));
  }
  function gradient(ctx, x, y, w, h, cols) {
    cols = arr(cols);
    if (!cols.length || h <= 0) return;
    if (cols.length === 1 || h < 3) { rect(ctx, x, y, w, h, cols[0]); return; }
    var seg = h / (cols.length - 1);
    for (var i = 0; i < cols.length - 1; i++) {
      var y0 = R(y + seg * i), y1 = R(y + seg * (i + 1));
      rect(ctx, x, y0, w, y1 - y0, cols[i]);
      var L = y1 - y0, steps = 4;
      for (var k = 1; k <= steps; k++) {
        var a = y0 + R(L * (0.45 + (0.55 * (k - 1)) / steps)), b = y0 + R(L * (0.45 + (0.55 * k) / steps));
        dither(ctx, x, a, w, b - a, cols[i + 1], k / (steps + 1));
      }
    }
  }
  function ellipse(ctx, cx, cy, rx, ry, c) {
    if (rx < 0.5 || ry < 0.5) { rect(ctx, cx, cy, 1, 1, c); return; }
    ctx.fillStyle = c;
    for (var dy = -Math.floor(ry); dy <= Math.floor(ry); dy++) {
      var k = 1 - (dy * dy) / ((ry + 0.45) * (ry + 0.45));
      if (k <= 0) continue;
      var hw = Math.floor(rx * Math.sqrt(k) + 0.35);
      ctx.fillRect(R(cx - hw), R(cy + dy), hw * 2 + 1, 1);
    }
  }
  function ring(ctx, cx, cy, r, c) {
    ctx.fillStyle = c;
    var n = Math.max(12, Math.ceil(r * 7));
    for (var i = 0; i < n; i++) { var a = (i / n) * 2 * PI; ctx.fillRect(R(cx + Math.cos(a) * r), R(cy + Math.sin(a) * r), 1, 1); }
  }
  function line(ctx, x0, y0, x1, y1, c, dash) {
    ctx.fillStyle = c;
    var dx = x1 - x0, dy = y1 - y0, n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    for (var i = 0; i <= n; i++) {
      if (dash && ((i / dash) | 0) % 2) continue;
      ctx.fillRect(R(x0 + (dx * i) / n), R(y0 + (dy * i) / n), 1, 1);
    }
  }

  // ------------------------- bitmap font (5x7, descenders to row 8) -------------------------
  // Each glyph: hex pairs, one per row, bit 0x10 = leftmost column. Glyphs are trimmed to their
  // used columns (digits keep the full 5 so numbers line up).
  var FONT_SRC = {
    A: "0e1111111f1111", B: "1e11111e11111e", C: "0e11101010110e", D: "1c12111111121c", E: "1f10101e10101f",
    F: "1f10101e101010", G: "0e11101711110f", H: "1111111f111111", I: "0e04040404040e", J: "0702020202120c",
    K: "11121418141211", L: "1010101010101f", M: "111b1515111111", N: "11111915131111", O: "0e11111111110e",
    P: "1e11111e101010", Q: "0e11111115120d", R: "1e11111e141211", S: "0f10100e01011e", T: "1f040404040404",
    U: "1111111111110e", V: "11111111110a04", W: "1111111515150a", X: "11110a040a1111", Y: "1111110a040404",
    Z: "1f01020408101f",
    a: "00000e010f110f", b: "1010161911111e", c: "00000e1010110e", d: "01010d1311110f", e: "00000e111f100e",
    f: "0609081c080808", g: "00000f1111110f010e", h: "10101619111111", i: "04000c0404040e", j: "02000602020202120c",
    k: "10101214181412", l: "0c04040404040e", m: "00001a15151111", n: "00001619111111", o: "00000e1111110e",
    p: "00001e1111111e1010", q: "00000f1111110f0101", r: "00001619101010", s: "00000f100e011e", t: "08081c08080906",
    u: "0000111111130d", v: "00001111110a04", w: "0000111115150a", x: "0000110a040a11", y: "0000111111110f010e",
    z: "00001f0204081f",
    0: "0e11131519110e", 1: "040c040404040e", 2: "0e11010204081f", 3: "1f02040201110e", 4: "02060a121f0202",
    5: "1f101e0101110e", 6: "0608101e11110e", 7: "1f010204080808", 8: "0e11110e11110e", 9: "0e11110f01020c",
    ".": "00000000000c0c", ",": "00000000000c0408", "!": "04040404040004", "?": "0e110102040004",
    ":": "000c0c000c0c00", ";": "000c0c000c0c0408", "'": "04040000000000", '"': "0a0a0000000000",
    "-": "0000000e000000", "+": "0004041f040400", "/": "00010204081000", "(": "02040808080402",
    ")": "08040202020408", "%": "18190204081303", "$": "040f140e051e04", "&": "0c12140815120d",
    "#": "0a0a1f0a1f0a0a", "=": "00001f001f0000", "*": "0004150e150400", "<": "02040810080402",
    ">": "08040201020408", "_": "0000000000001f", "[": "0e08080808080e", "]": "0e02020202020e",
    "\u00b0": "0c12120c000000", "\u2192": "0004021f020400", "\u2665": "000a1f1f0e0400", "\u25b6": "080c0e0f0e0c08",
    "\u2190": "0004081f080400",
  };
  var CHARMAP = { "\u2018": "'", "\u2019": "'", "\u201a": ",", "\u201c": '"', "\u201d": '"', "\u201e": '"', "\u2013": "-", "\u2014": "-", "\u2212": "-", "\u00d7": "x", "\u00df": "ss", "\u00e6": "ae", "\u00c6": "AE", "\u0153": "oe", "\u0152": "OE", "\u00f8": "o", "\u00d8": "O", "\u2026": "...", "\u00a0": " ", "\u00ab": '"', "\u00bb": '"', "\u20ac": "E", "\u00a3": "L", "@": "a", "~": "-", "|": "!", "`": "'", "^": "'", "{": "(", "}": ")", "\\": "/" };
  var GLYPH = {};
  Object.keys(FONT_SRC).forEach(function (ch) {
    var s = FONT_SRC[ch], rows = [];
    for (var i = 0; i + 1 < s.length; i += 2) rows.push(parseInt(s.substr(i, 2), 16));
    var mn = 5, mx = -1;
    rows.forEach(function (r) { for (var c = 0; c < 5; c++) if (r & (0x10 >> c)) { mn = Math.min(mn, c); mx = Math.max(mx, c); } });
    if (/[0-9]/.test(ch)) { mn = 0; mx = 4; }
    if (mx < 0) { mn = 0; mx = 2; }
    GLYPH[ch] = { rows: rows, off: mn, w: mx - mn + 1 };
  });
  GLYPH[" "] = { rows: [], off: 0, w: 3 };
  function normText(s) {
    s = String(s == null ? "" : s);
    var out = "";
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (CHARMAP[ch] != null) { out += CHARMAP[ch]; continue; }
      if (ch === "\n" || GLYPH[ch]) { out += ch; continue; }
      if (/\s/.test(ch)) { out += " "; continue; }
      var b = ch.normalize("NFD")[0];
      if (GLYPH[b]) { out += b; continue; }
      if (/[\u0300-\u036f]/.test(ch)) continue;
      out += "?";
    }
    return out;
  }
  var glyphCache = {};
  function glyphCanvas(ch, color) {
    var key = ch + "|" + (Array.isArray(color) ? color.join(",") : color);
    var c = glyphCache[key];
    if (c) return c;
    var g = GLYPH[ch] || GLYPH["?"];
    c = cv(g.w, 9);
    var x = c.getContext("2d");
    for (var r = 0; r < g.rows.length; r++) {
      x.fillStyle = Array.isArray(color) ? (r < 4 ? color[0] : color[1] || color[0]) : color;
      for (var k = 0; k < 5; k++) if (g.rows[r] & (0x10 >> k)) x.fillRect(k - g.off, r, 1, 1);
    }
    glyphCache[key] = c;
    return c;
  }
  // Text runs: '*word*' switches to the emphasis colour (not drawn, not measured).
  function runs(s, emph) {
    s = normText(s);
    var out = [], em = false;
    for (var i = 0; i < s.length; i++) {
      var ch = s[i];
      if (ch === "*" && emph !== false) { em = !em; continue; }
      out.push({ ch: ch, em: em });
    }
    return out;
  }
  function lineWidth(rs) {
    var w = 0;
    for (var i = 0; i < rs.length; i++) { var g = GLYPH[rs[i].ch] || GLYPH["?"]; w += g.w + (i < rs.length - 1 ? 1 : 0); }
    return w;
  }
  function measure(s, sc) {
    sc = Math.max(1, Math.round(sc || 1));
    var lines = String(s == null ? "" : s).split("\n"), w = 0;
    lines.forEach(function (l) { w = Math.max(w, lineWidth(runs(l))); });
    return w * sc;
  }
  function textH(nLines, sc) { sc = sc || 1; return nLines <= 0 ? 0 : ((nLines - 1) * 11 + 7) * sc; }
  function greedy(words, maxW, sc) {
    var lines = [], cur = "";
    words.forEach(function (w) {
      var test = cur ? cur + " " + w : w;
      if (!cur || measure(test, sc) <= maxW) { cur = test; return; }
      lines.push(cur); cur = w;
    });
    if (cur) lines.push(cur);
    // break words that are still too long
    var out = [];
    lines.forEach(function (l) {
      if (measure(l, sc) <= maxW) { out.push(l); return; }
      var piece = "";
      for (var i = 0; i < l.length; i++) {
        var t = piece + l[i];
        if (piece && measure(t + "-", sc) > maxW) { out.push(piece + "-"); piece = l[i] === " " ? "" : l[i]; }
        else piece = t;
      }
      if (piece) out.push(piece);
    });
    return out;
  }
  function wrap(s, maxW, sc) {
    sc = Math.max(1, Math.round(sc || 1));
    var out = [];
    String(s == null ? "" : s).split("\n").forEach(function (para) {
      var words = para.split(/\s+/).filter(Boolean);
      if (!words.length) { out.push(""); return; }
      var g = greedy(words, maxW, sc);
      if (g.length > 1) { // balance: narrowest width that keeps the same line count
        var lo = 0, hi = maxW, best = g;
        for (var i = 0; i < 9; i++) {
          var mid = (lo + hi) / 2, t = greedy(words, mid, sc), wd = 0;
          t.forEach(function (l) { wd = Math.max(wd, measure(l, sc)); });
          if (t.length === g.length && wd <= mid) { best = t; hi = mid; } else lo = mid;
        }
        g = best;
      }
      out = out.concat(g);
    });
    return out;
  }
  // Pick the biggest scale (from `scales`) at which s fits maxW in maxLines.
  function fitText(s, maxW, maxLines, scales) {
    scales = scales || [3, 2, 1];
    var words = String(s == null ? "" : s).split(/\s+/).filter(Boolean);
    for (var i = 0; i < scales.length; i++) {
      var okW = words.every(function (w) { return measure(w, scales[i]) <= maxW; });
      if (!okW && i < scales.length - 1) continue;
      var ls = wrap(s, maxW, scales[i]);
      if (ls.length <= maxLines) return { scale: scales[i], lines: ls };
    }
    var sc = scales[scales.length - 1], all = wrap(s, maxW, sc), keep = all.slice(0, Math.max(1, maxLines));
    if (all.length > keep.length) {
      var last = keep[keep.length - 1];
      while (last.length > 1 && measure(last + "...", sc) > maxW) last = last.slice(0, -1);
      keep[keep.length - 1] = last.replace(/\s+$/, "") + "...";
    }
    return { scale: sc, lines: keep };
  }
  /* Draw pixel text. y is the top of the capitals (o.top === false: y is the baseline).
     o: color, em (emphasis colour), scale, outline (true | colour), shadow (true | colour), align,
     n (visible characters, typewriter), wave (time: letters bob), depth (extrusion rows), depthColor. */
  function text(ctx, s, x, y, o) {
    o = o || {};
    var sc = Math.max(1, Math.round(o.scale || 1));
    var lines = String(s == null ? "" : s).split("\n");
    var color = o.color ? (Array.isArray(o.color) ? o.color : col(o.color)) : PAL.white;
    var em = col(o.em, PAL.yellow);
    var lh = (o.lineHeight || 11) * sc;
    var top = o.top === false ? y - 7 * sc : y;
    var n = o.n == null ? Infinity : o.n;
    var oc = o.outline === true ? PAL.ink : o.outline ? col(o.outline, PAL.ink) : null;
    var shc = o.shadow === true ? PAL.ink : o.shadow ? col(o.shadow, PAL.ink) : null;
    var align = o.align || "left";
    var chars = [], count = 0, maxW = 0;
    for (var li = 0; li < lines.length; li++) {
      var rs = runs(lines[li], o.emph), lw = lineWidth(rs) * sc;
      maxW = Math.max(maxW, lw);
      var lx = align === "center" ? x - lw / 2 : align === "right" ? x - lw : x;
      lx = R(lx);
      var cx = lx;
      for (var i = 0; i < rs.length; i++) {
        if (count >= n) break;
        var g = GLYPH[rs[i].ch] || GLYPH["?"];
        var dy = o.wave != null ? R(Math.sin(o.wave * 7 + (chars.length) * 0.6) * (o.waveAmp == null ? 1 : o.waveAmp)) : 0;
        if (rs[i].ch !== " ") chars.push({ ch: rs[i].ch, em: rs[i].em, x: cx, y: R(top + li * lh) + dy });
        cx += (g.w + 1) * sc;
        count++;
      }
    }
    var layers = [];
    if (o.depth) {
      var dc = col(o.depthColor, PAL.darkred), dp = o.depth;
      if (oc) {
        chars.forEach(function (c) {
          var gc = glyphCanvas(c.ch, oc), w = gc.width * sc, h = gc.height * sc;
          for (var ox = -1; ox <= 1; ox++) for (var oy = -1; oy <= 1 + dp; oy++) if (ox || oy) ctx.drawImage(gc, c.x + ox * sc, c.y + oy * sc, w, h);
        });
      }
      for (var d = dp; d >= 1; d--) layers.push({ dx: 0, dy: d * sc, c: dc, oc: null });
      layers.push({ dx: 0, dy: 0, c: color, oc: null, main: true });
    } else {
      if (shc) layers.push({ dx: sc, dy: sc, c: shc, oc: null });
      layers.push({ dx: 0, dy: 0, c: color, oc: oc, main: true });
    }
    layers.forEach(function (L) {
      if (L.oc) {
        chars.forEach(function (c) {
          var gc = glyphCanvas(c.ch, L.oc), w = gc.width * sc, h = gc.height * sc;
          for (var ox = -1; ox <= 1; ox++) for (var oy = -1; oy <= 1; oy++) if (ox || oy) ctx.drawImage(gc, c.x + L.dx + ox * sc, c.y + L.dy + oy * sc, w, h);
        });
      }
      chars.forEach(function (c) {
        var cc = L.main ? (c.em ? em : L.c) : L.c;
        var gc = glyphCanvas(c.ch, cc);
        ctx.drawImage(gc, c.x + L.dx, c.y + L.dy, gc.width * sc, gc.height * sc);
      });
    });
    return { w: maxW, h: textH(lines.length, sc) };
  }
  function visibleLen(s) { return runs(String(s).replace(/\n/g, "")).length; }

  // ------------------------- windows -------------------------
  var WSTYLE = {
    blue: { edge: PAL.ink, border: "#e8e8f4", border2: "#9898c0", bg: ["#3454c8", "#1c2c88"], title: PAL.yellow, text: PAL.white, dim: "#a8b8e8" },
    dark: { edge: PAL.black, border: "#b0b0c8", border2: "#606084", bg: ["#2a2244", "#140f26"], title: PAL.yellow, text: PAL.white, dim: "#9890b8" },
    red: { edge: PAL.ink, border: "#f8dcd4", border2: "#c07070", bg: ["#c83444", "#801828"], title: PAL.yellow, text: PAL.white, dim: "#f0b0b0" },
    green: { edge: PAL.ink, border: "#e0f8d0", border2: "#70b070", bg: ["#2c9444", "#185828"], title: PAL.yellow, text: PAL.white, dim: "#b0e0b0" },
    gold: { edge: PAL.ink, border: "#f8e080", border2: "#c08830", bg: ["#6c3e1c", "#3c200c"], title: PAL.yellow, text: PAL.white, dim: "#e0c090" },
    paper: { edge: "#3a2410", border: "#9a6a34", border2: "#5a3a1a", bg: ["#f4e6c0", "#e4cc94"], title: "#a02c1c", text: "#3a2410", dim: "#8a6a48" },
  };
  function wstyle(s) { return WSTYLE[s] || WSTYLE.blue; }
  // Returns the inner content box, or null while closed.
  function windowBox(ctx, x, y, w, h, o) {
    o = o || {};
    var st = wstyle(o.style), open = o.open == null ? 1 : clamp(o.open, 0, 1);
    if (open <= 0) return null;
    x = R(x); y = R(y); w = R(w); h = R(h);
    var hh = Math.max(6, R(h * open)), yy = R(y + (h - hh) / 2);
    if (o.shadow !== false) { ctx.fillStyle = "rgba(10,7,20,0.45)"; ctx.fillRect(x + 2, yy + 2, w, hh); }
    rect(ctx, x + 1, yy, w - 2, hh, st.edge);
    rect(ctx, x, yy + 1, w, hh - 2, st.edge);
    rect(ctx, x + 1, yy + 1, w - 2, hh - 2, st.border);
    rect(ctx, x + 2, yy + hh - 2, w - 3, 1, st.border2);
    rect(ctx, x + w - 2, yy + 2, 1, hh - 3, st.border2);
    rect(ctx, x + 2, yy + 2, w - 4, hh - 4, st.edge);
    gradient(ctx, x + 3, yy + 3, w - 6, hh - 6, st.bg);
    if (open < 1) return null;
    return { x: x + 5, y: y + 5, w: w - 10, h: h - 10, style: st };
  }

  // ------------------------- art: sprites -------------------------
  function outline(c, color) {
    var w = c.width, h = c.height, x = c.getContext("2d");
    var id = x.getImageData(0, 0, w, h), d = id.data, src = new Uint8ClampedArray(d), rgb = hex2rgb(color || PAL.ink);
    for (var yy = 0; yy < h; yy++) for (var xx = 0; xx < w; xx++) {
      var i = (yy * w + xx) * 4;
      if (src[i + 3] > 0) continue;
      var hit = (xx > 0 && src[i - 1] > 0) || (xx < w - 1 && src[i + 7] > 0) || (yy > 0 && src[i - w * 4 + 3] > 0) || (yy < h - 1 && src[i + w * 4 + 3] > 0);
      if (hit) { d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255; }
    }
    x.putImageData(id, 0, 0);
    return c;
  }
  function tinted(c, color, alpha) {
    var o = cv(c.width, c.height), x = o.getContext("2d");
    x.drawImage(c, 0, 0);
    x.globalCompositeOperation = "source-atop";
    x.globalAlpha = alpha == null ? 1 : alpha;
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    return o;
  }
  var MAPPAL = {
    k: PAL.ink, w: PAL.white, y: PAL.yellow, o: PAL.orange, r: PAL.red, R: PAL.darkred, b: PAL.blue, B: PAL.darkblue,
    s: PAL.sky, c: PAL.cyan, g: PAL.green, G: PAL.darkgreen, l: PAL.lime, n: PAL.brown, N: PAL.darkbrown, t: PAL.tan,
    e: PAL.grey, E: PAL.darkgrey, L: PAL.lightgrey, p: PAL.purple, v: PAL.violet, m: PAL.cream, P: PAL.pink, d: PAL.gold, f: PAL.skin,
  };
  function fromMap(rows, pal) {
    pal = pal || MAPPAL;
    var w = 0; rows.forEach(function (r) { w = Math.max(w, r.length); });
    var c = cv(w + 2, rows.length + 2), x = c.getContext("2d");
    rows.forEach(function (r, yy) { for (var i = 0; i < r.length; i++) { var k = r[i]; if (k !== "." && pal[k]) { x.fillStyle = pal[k]; x.fillRect(i + 1, yy + 1, 1, 1); } } });
    return outline(c);
  }

  // Items (power-ups). Small maps, outlined automatically.
  var ITEM_MAPS = {
    coin: ["..yyyyy..", ".yywwyyd.", "yywyyyydd", "yywyydydd", "yywyydydd", "yyyyydydd", "yyyyyyydd", ".yyyyydd.", "..ddddd.."],
    gem: ["..wwccc..", ".wcwcccc.", "wccwccccB", "cccccccBB", ".cccccBB.", "..cccBB..", "...cBB...", "....B...."],
    heart: [".rrr.rrr.", "rwwrrrrrr", "rwrrrrrrR", "rrrrrrrrR", ".rrrrrrR.", "..rrrrR..", "...rrR...", "....R...."],
    star: ["....y....", "....y....", "...yyy...", "yyyywyyyy", ".yyywyyo.", "..yyyyo..", "..yyyyy..", ".yyo.yyo.", ".yo...yo."],
    key: [".ddd.......", "dyyyd......", "dy.ydyyyyyy", "dyyyd...y.y", ".ddd....y.y"],
    scroll: [".tmmmmmmt.", "tnmmmmmmnt", ".meeeeeem.", ".mmmmmmmm.", ".meeeeemm.", ".mmmmmmmm.", ".meeeeeem.", "tnmmmmmmnt", ".tmmmmmmt."],
    potion: ["...NNN...", "...LwL...", "...LwL...", "..LwLLL..", ".LwrrrrL.", "LrwrrrrRL", "LrrrrrrRL", "LrrrrrrRL", ".LRRRRRL.", "..LLLLL.."],
    book: [".BBBBBBBB.", "Bbbbbbbbbw", "Bbyyyyybbw", "Bbbbbbbbbw", "Bbbbbbbbbw", "Bbbbbbbbbw", "Bbbbbbbbbw", "BBBBBBBBBw", ".wwwwwwwww"],
    sword: ["........ww", ".......wLw", "......wLw.", ".....wLw..", "....wLw...", ".d.wLw....", ".ddLw.....", "..dd......", ".nnd......", "nn..d....."],
    shield: ["eeeeeeeee", "ebbbybbbe", "ebbbybbbe", "eyyyyyyye", "ebbbybbbe", "ebbbybbbe", ".ebbybbe.", "..ebybe..", "...eye...", "....e...."],
    bulb: ["..yyyyy..", ".ywwyyyy.", "yywyyyyyo", "yyyyyyyyo", "yyyyyyyyo", ".yyyyyyo.", "..yyyyo..", "...LeL...", "...eLe...", "....E...."],
    trophy: ["ddyyyyyyydd", "d.yywyyyd.d", "d.yywyyyd.d", ".dyyyyyyyd.", "..yyyyyyd..", "...yyyyd...", "....yyd....", "....ydd....", "...yyyyd...", "..nnnnnnn.."],
    chest: [".NNNNNNNNN.", "NnnnnnnnnnN", "NnnnnnnnnnN", "NdddddddddN", "NnnnndynnnN", "NnnnnddnnnN", "NnnnnnnnnnN", "NNNNNNNNNNN"],
    crystal: ["....v....", "...vwv...", "...vwvp..", "..vvwvp..", ".vvwvvpp.", ".vvwvvpp.", "vvvvvvppp", ".vvvvvpp.", "..vvvpp.."],
    clock: ["...eeeee...", "..ewwwwwe..", ".ewwwkwwwe.", "ewwwwkwwwwe", "ewwwwkwwwwe", "ewwwwkkkwwe", "ewwwwwwwwwe", ".ewwwwwwwe.", "..ewwwwwe..", "...eeeee..."],
    bag: ["...NNN...", "....n....", "...ttt...", "..ttttt..", ".ttmtttt.", "ttmtddttt", "tttdttttt", "ttttddttt", "tttttdttt", ".ttddttt.", "..ttttt.."],
    gear: ["....LL....", ".LL.LL.LL.", ".LLLLLLLL.", "..LLeeLL..", "LLLe..eLLL", "LLLe..eLLL", "..LLeeLL..", ".LLLLLLLL.", ".LL.LL.LL.", "....LL...."],
    flag: ["nrrrrrr..", "nrrwrrrrr", "nrrrrrrrr", "nrrrrrr..", "n........", "n........", "n........", "n........", "N........", "NN......."],
    bomb: [".......yo", "......n.y", ".....n...", "..EEEE...", ".EwEEEE..", "EwEEEEEE.", "EEEEEEEE.", "EEEEEEEE.", ".EEEEEE..", "..EEEE..."],
    leaf: [".......ggG", ".....gggGG", "...ggglgG.", "..gglggG..", ".gglgggG..", ".glggGG...", ".lgggG....", ".lGGG.....", "n........."],
    zap: ["....yyyy", "...yyyo.", "..yyyo..", ".yyyo...", "yyyyyyyo", "...yyyo.", "..yyyo..", "..yyo...", ".yyo....", ".yo.....", "yo......"],
    chip: [".L.L.L.L.", "LEEEEEEEL", ".EcEEEEE.", "LEEEEEEEL", ".EEEccEE.", "LEEEccEEL", ".EEEEEEE.", "LEEEEEEEL", ".L.L.L.L."],
    map: ["mmmtmmmtmmm", "mbmtmmmtmgm", "mmmtmrmtggm", "mbbtmrrtmgm", "mmmtrmmtmmm", "mmmtmmmtmmm", "mmmtmmmtmmm"],
  };
  var ICON_ORDER = ["coin", "gem", "heart", "star", "key", "scroll", "potion", "book", "sword", "shield", "bulb", "trophy", "chest", "crystal", "clock", "bag", "gear", "flag", "bomb", "leaf", "zap", "chip", "map"];
  var itemCache = {};
  function itemCanvas(name) {
    name = ITEM_MAPS[name] ? name : "coin";
    if (!itemCache[name]) itemCache[name] = fromMap(ITEM_MAPS[name]);
    return itemCache[name];
  }
  // Guess an icon from a label when none was given.
  var ICON_HINTS = [
    [/water|drink|liquid|potion|medic|drug|pill|health|vitamin/, "potion"], [/sun|light|bright|star|shine|best|top/, "star"],
    [/money|cash|save|saving|pay|price|cost|coin|dollar|budget|income|earn/, "coin"], [/time|hour|minute|clock|daily|schedule|routine|timer/, "clock"],
    [/idea|think|learn|brain|smart|tip|insight/, "bulb"], [/book|read|study|note|fact|knowledge/, "book"],
    [/protect|safe|secur|defen|guard|insur/, "shield"], [/tool|setting|system|engine|process|machine|build/, "gear"],
    [/energy|power|electric|fast|speed|boost|zap/, "zap"], [/plant|leaf|tree|green|nature|carbon|air|oxygen|food|eat/, "leaf"],
    [/key|unlock|access|secret|password/, "key"], [/win|goal|award|prize|success|result/, "trophy"], [/heart|love|care|friend|kind|feel/, "heart"],
    [/data|tech|computer|chip|ai|code|digital|app|software/, "chip"], [/map|route|path|travel|plan|direction/, "map"],
    [/gem|value|rare|precious|treasure/, "gem"], [/crystal|mineral|salt|sugar|ice/, "crystal"], [/bag|pack|shop|buy|carry|store/, "bag"],
    [/risk|danger|bomb|warn|explo/, "bomb"], [/fight|attack|action|strength|strong|muscle/, "sword"], [/scroll|rule|law|contract|list/, "scroll"],
  ];
  function iconOf(name, label, i) {
    if (ITEM_MAPS[name]) return name;
    var l = str(label).toLowerCase();
    for (var k = 0; k < ICON_HINTS.length; k++) if (ICON_HINTS[k][0].test(l)) return ICON_HINTS[k][1];
    return ["star", "gem", "coin", "potion", "key", "book"][((i || 0) % 6 + 6) % 6];
  }

  // Cast. Characters face right; drawn with rectangles around the feet point, then outlined.
  var CAST = {
    kit: { name: "KIT", skin: PAL.skin, skin2: PAL.skinDark, hair: "#f07828", hair2: "#b84818", tunic: "#3c6cd8", tunic2: "#26489c", pants: "#2a3470", boots: "#7a4424", band: "#f8d040", scarf: "#e04048", scarf2: "#a02838" },
    orla: { name: "SAGE ORLA", skin: PAL.skin, skin2: PAL.skinDark, hair: "#e0e0ec", hair2: "#a8a8c4", tunic: "#8a54d8", tunic2: "#5a34a0", pants: "#5a34a0", boots: "#55331f", hat: "#5c3cb4", hat2: "#3c2480", star: "#f8d040", staff: "#9a6030", orb: "#68e0f0" },
    bolt: { name: "BOLT", body: "#c8d0e0", body2: "#8890a8", body3: "#5a6078", screen: "#1c2440", eye: "#58e0f0", tip: "#f04848" },
    vex: { name: "VEX", skin: "#f0c098", skin2: "#c88a68", hair: "#4a3070", hair2: "#2a1a44", tunic: "#3c3c50", tunic2: "#26263a", pants: "#2a2234", boots: "#2a1a1a", cape: "#d83444", cape2: "#8a1c2c" },
    mo: { name: "MO", skin: PAL.skin, skin2: PAL.skinDark, hair: "#7a4424", tunic: "#d09850", tunic2: "#9a6c34", pants: "#5a4030", boots: "#5a3420", cap: "#3c9a48", cap2: "#246a30", apron: "#f0e0b8", stache: "#6a3a1c", wide: true },
  };
  var CAST_IDS = ["kit", "orla", "bolt", "vex", "mo"];
  function castOf(id, d) { id = str(id).toLowerCase(); return CAST[id] ? id : d || "kit"; }
  var POSE = {
    idle0: { legs: [[-3, 0], [1, 0]], by: 0, arms: "down" },
    idle1: { legs: [[-3, 0], [1, 0]], by: 1, arms: "down" },
    walk0: { legs: [[-5, 0], [3, 0]], by: 0, arms: "swingA" },
    walk1: { legs: [[-2, 0], [0, 1]], by: -1, arms: "down" },
    walk2: { legs: [[2, 0], [-4, 0]], by: 0, arms: "swingB" },
    walk3: { legs: [[-2, 1], [0, 0]], by: -1, arms: "down" },
    run0: { legs: [[-6, 1], [4, 0]], by: 0, lean: 1, arms: "runA" },
    run1: { legs: [[-2, 0], [1, 2]], by: -1, lean: 1, arms: "down" },
    run2: { legs: [[3, 0], [-5, 1]], by: 0, lean: 1, arms: "runB" },
    run3: { legs: [[-2, 2], [0, 0]], by: -1, lean: 1, arms: "down" },
    jump: { legs: [[-4, 3], [2, 1]], by: 0, arms: "up1" },
    cheer0: { legs: [[-3, 0], [1, 0]], by: 0, arms: "up", eyes: "happy", mouth: true },
    cheer1: { legs: [[-4, 0], [2, 0]], by: -1, arms: "up", eyes: "happy", mouth: true },
    hurt: { legs: [[-4, 0], [2, 1]], by: 0, lean: -1, arms: "flail", eyes: "hurt", mouth: true },
    attack: { legs: [[-6, 0], [3, 0]], by: 1, lean: 1, arms: "sword" },
    talk: { legs: [[-3, 0], [1, 0]], by: 0, arms: "gesture" },
    point: { legs: [[-3, 0], [1, 0]], by: 0, arms: "point" },
    think: { legs: [[-3, 0], [1, 0]], by: 0, arms: "chin", eyes: "up" },
  };
  var SPR_W = 40, SPR_H = 50, SPR_CX = 20, SPR_FY = 46;
  function paintHuman(Rr, c, id, P, mouth, blink, f) {
    var by = P.by || 0, ln = P.lean || 0;
    var tl = c.wide ? -5 : -4, tr = c.wide ? 4 : 3;
    var bx = tl - 2 + ln, fx = tr + 1 + ln;
    var robe = id === "orla";
    // back layer: cape, long hair, scarf and bandana tails
    if (id === "vex") {
      Rr(tl - 3 + ln, -12 + by, 4, 10, c.cape2);
      Rr(tl - 2 + ln, -12 + by, 3, 9, c.cape);
      Rr(tl - 5 + ln, -6 + by + f, 3, 3, c.cape2);
      Rr(tl - 4 + ln, -5 + by + f, 2, 2, c.cape);
    }
    if (id === "kit") {
      Rr(-8 + ln, -12 + by, 3, 2, c.scarf2);
      Rr(-10 + ln, -11 + by + f, 3, 2, c.scarf);
      Rr(-8 + ln, -20 + by, 3, 1, c.band);
      Rr(-10 + ln, -19 + by + f, 3, 1, c.band);
    }
    if (robe) Rr(-6 + ln, -21 + by, 3, 11, c.hair2);
    // back arm
    function arm(which, mode) {
      var back = which === "b", x = back ? bx : fx, sl = back ? c.tunic2 : c.tunic, hd = back ? c.skin2 : c.skin;
      var dir = back ? -1 : 1;
      switch (mode) {
        case "swingA": x += dir; Rr(x, -11 + by, 2, 3, sl); Rr(x, -8 + by, 2, 2, hd); break;
        case "swingB": x -= dir; Rr(x, -11 + by, 2, 3, sl); Rr(x, -8 + by, 2, 2, hd); break;
        case "runA":
          if (back) { Rr(x - 1, -10 + by, 2, 3, sl); Rr(x - 2, -8 + by, 2, 2, hd); }
          else { Rr(x, -11 + by, 2, 2, sl); Rr(x + 2, -12 + by, 2, 2, hd); }
          break;
        case "runB":
          if (back) { Rr(x + 1, -11 + by, 2, 2, sl); Rr(x + 2, -12 + by, 2, 2, hd); }
          else { Rr(x - 1, -10 + by, 2, 3, sl); Rr(x - 1, -8 + by, 2, 2, hd); }
          break;
        case "up": Rr(x, -15 + by, 2, 4, sl); Rr(x, -17 + by, 2, 2, hd); break;
        case "up1":
          if (back) { Rr(x - 1, -11 + by, 2, 3, sl); Rr(x - 1, -8 + by, 2, 2, hd); }
          else { Rr(x, -15 + by, 2, 4, sl); Rr(x, -17 + by, 2, 2, hd); }
          break;
        case "flail":
          if (back) { Rr(x - 1, -14 + by, 2, 4, sl); Rr(x - 2, -16 + by, 2, 2, hd); }
          else { Rr(x + 1, -15 + by, 2, 4, sl); Rr(x + 2, -17 + by, 2, 2, hd); }
          break;
        case "sword":
          if (back) { Rr(x - 1, -11 + by, 2, 3, sl); Rr(x - 1, -8 + by, 2, 2, hd); }
          else {
            Rr(x, -11 + by, 3, 2, sl); Rr(x + 3, -11 + by, 2, 2, hd);
            Rr(x + 5, -13 + by, 1, 5, PAL.gold); Rr(x + 6, -11 + by, 7, 1, PAL.white); Rr(x + 6, -10 + by, 6, 1, PAL.lightgrey); Rr(x + 4, -12 + by, 1, 1, PAL.brown);
          }
          break;
        case "gesture":
          if (back) { Rr(x, -11 + by, 2, 3, sl); Rr(x, -8 + by, 2, 2, hd); }
          else { Rr(x, -11 + by, 2, 2, sl); Rr(x + 1, -13 + by, 2, 2, sl); Rr(x + 2, -15 + by, 2, 2, hd); }
          break;
        case "point":
          if (back) { Rr(x, -11 + by, 2, 3, sl); Rr(x, -8 + by, 2, 2, hd); }
          else { Rr(x, -11 + by, 3, 2, sl); Rr(x + 3, -11 + by, 3, 2, hd); Rr(x + 6, -11 + by, 1, 1, hd); }
          break;
        case "chin":
          if (back) { Rr(x, -11 + by, 2, 3, sl); Rr(x, -8 + by, 2, 2, hd); }
          else { Rr(x, -11 + by, 2, 2, sl); Rr(x - 1, -13 + by, 2, 2, sl); Rr(x - 2, -15 + by, 2, 2, hd); }
          break;
        default: Rr(x, -11 + by, 2, 3, sl); Rr(x, -8 + by, 2, 2, hd);
      }
    }
    arm("b", P.arms);
    // legs (back leg darker)
    P.legs.forEach(function (lg, i) {
      var lx = lg[0], lift = lg[1], dark = i === 0;
      if (robe) { Rr(lx, -1 - lift, 3, 1, dark ? shade(c.boots, 0.7) : c.boots); return; }
      Rr(lx, -5 - lift, 2, 3, dark ? shade(c.pants, 0.75) : c.pants);
      Rr(lx, -2 - lift, 3, 2, dark ? shade(c.boots, 0.75) : c.boots);
    });
    // torso
    if (robe) {
      Rr(tl + ln, -11 + by, tr - tl + 1, 6, c.tunic);
      Rr(tl - 1 + ln, -5 + by, tr - tl + 3, 3 - by, c.tunic);
      Rr(tl - 1 + ln, -2, tr - tl + 3, 1, c.tunic2);
      Rr(tl + ln, -7 + by, tr - tl + 1, 1, c.star);
      Rr(tl + ln, -11 + by, 1, 6, c.tunic2);
    } else {
      Rr(tl + ln, -11 + by, tr - tl + 1, 6, c.tunic);
      Rr(tl + ln, -11 + by, 1, 6, c.tunic2);
      Rr(tl + ln, -6 + by, tr - tl + 1, 1, id === "vex" ? PAL.darkgrey : PAL.brown);
      if (id === "mo") { Rr(0 + ln, -10 + by, 4, 4, c.apron); Rr(-5 + ln, -6 + by, 10, 1, PAL.brown); }
      if (id === "vex") Rr(1 + ln, -10 + by, 1, 4, PAL.grey);
      if (id === "kit") Rr(1 + ln, -10 + by, 1, 3, c.tunic2);
    }
    // head
    var hx = -5 + ln, hy = -21 + by;
    Rr(hx + 1, hy, 8, 1, c.skin); Rr(hx, hy + 1, 10, 8, c.skin); Rr(hx + 1, hy + 9, 8, 1, c.skin);
    Rr(hx, hy + 1, 1, 8, c.skin2);
    // eyes
    var ey = -17 + by, e1 = 0 + ln, e2 = 3 + ln, E = PAL.ink;
    var em = P.eyes || "open";
    if (blink && em === "open") em = "blink";
    if (em === "open") { Rr(e1, ey, 1, 2, E); Rr(e2, ey, 1, 2, E); }
    else if (em === "blink") { Rr(e1, ey + 1, 1, 1, E); Rr(e2, ey + 1, 1, 1, E); }
    else if (em === "happy") { Rr(e1 - 1, ey + 1, 1, 1, E); Rr(e1, ey, 1, 1, E); Rr(e1 + 1, ey + 1, 1, 1, E); Rr(e2, ey + 1, 1, 1, E); Rr(e2 + 1, ey, 1, 1, E); Rr(e2 + 2, ey + 1, 1, 1, E); }
    else if (em === "hurt") { Rr(e1, ey, 1, 1, E); Rr(e1 + 1, ey + 1, 1, 1, E); Rr(e2 + 1, ey, 1, 1, E); Rr(e2, ey + 1, 1, 1, E); }
    else if (em === "up") { Rr(e1 + 1, ey - 1, 1, 2, E); Rr(e2 + 1, ey - 1, 1, 2, E); }
    // cheeks
    if (id !== "vex") Rr(e2 + 1, ey + 2, 1, 1, "#f09890");
    // mouth
    var my = (id === "mo" ? -13 : -14) + by, mx = 2 + ln;
    if (mouth || P.mouth) { Rr(mx, my, 2, 2, "#8a2030"); if (P.mouth) Rr(mx - 1, my, 1, 1, "#8a2030"); }
    else Rr(mx, my, 2, 1, c.skin2);
    // hair, hats
    if (id === "kit") {
      Rr(hx, hy - 2, 10, 3, c.hair); Rr(hx + 1, hy - 3, 2, 1, c.hair); Rr(hx + 4, hy - 4, 2, 2, c.hair); Rr(hx + 7, hy - 3, 2, 1, c.hair);
      Rr(hx - 1, hy, 3, 7, c.hair); Rr(hx - 1, hy + 4, 2, 3, c.hair2);
      Rr(hx, hy + 1, 10, 2, c.band); Rr(hx, hy + 2, 10, 1, shade(c.band, 0.82));
      Rr(hx + 8, hy + 3, 2, 1, c.hair);
      Rr(-4 + ln, -12 + by, 8, 2, c.scarf); Rr(-4 + ln, -11 + by, 8, 1, c.scarf2);
    } else if (id === "vex") {
      Rr(hx, hy - 2, 10, 3, c.hair); Rr(hx - 2, hy - 1, 3, 2, c.hair); Rr(hx - 4, hy, 3, 1, c.hair); Rr(hx + 2, hy - 3, 3, 1, c.hair); Rr(hx + 6, hy - 3, 2, 1, c.hair);
      Rr(hx - 1, hy + 1, 3, 6, c.hair); Rr(hx - 2, hy + 3, 2, 3, c.hair2);
      Rr(hx + 7, hy + 1, 3, 2, c.hair); Rr(hx + 9, hy + 3, 1, 1, c.hair);
      Rr(e1 - 1, ey - 3, 1, 1, E); Rr(e1, ey - 2, 1, 1, E); Rr(e2, ey - 2, 1, 1, E); Rr(e2 + 1, ey - 3, 1, 1, E);
      Rr(-4 + ln, -12 + by, 8, 1, c.cape);
    } else if (id === "mo") {
      Rr(hx, hy - 1, 10, 3, c.cap); Rr(hx + 1, hy - 2, 8, 1, c.cap); Rr(hx + 4, hy - 3, 2, 1, c.cap2);
      Rr(hx + 7, hy + 2, 5, 1, c.cap2); Rr(hx, hy + 1, 10, 1, c.cap2);
      Rr(hx - 1, hy + 2, 2, 4, c.hair);
      Rr(1 + ln, -15 + by, 4, 1, c.stache); Rr(0 + ln, -14 + by, 2, 1, c.stache); Rr(4 + ln, -14 + by, 2, 1, c.stache);
    } else if (robe) {
      Rr(hx - 2, hy - 1, 14, 1, c.hat2); Rr(hx - 1, hy - 2, 12, 1, c.hat);
      Rr(hx + 1, hy - 4, 8, 2, c.hat); Rr(hx + 2, hy - 6, 6, 2, c.hat); Rr(hx + 3, hy - 8, 4, 2, c.hat); Rr(hx + 2, hy - 9, 3, 1, c.hat); Rr(hx, hy - 10, 3, 1, c.hat);
      Rr(hx + 1, hy - 4, 1, 2, c.hat2); Rr(hx + 2, hy - 6, 1, 2, c.hat2);
      Rr(hx + 5, hy - 6, 1, 3, c.star); Rr(hx + 4, hy - 5, 3, 1, c.star);
      Rr(hx - 1, hy, 3, 9, c.hair); Rr(hx + 8, hy, 2, 3, c.hair);
    }
    arm("f", P.arms);
    if (robe) { // staff in the front hand
      var sx = fx + 2, raise = P.arms === "up" || P.arms === "gesture" ? -5 : P.arms === "point" || P.arms === "sword" ? -2 : 0;
      Rr(sx, -23 + by + raise, 1, 22, c.staff);
      Rr(sx - 1, -26 + by + raise, 3, 3, c.orb); Rr(sx - 1, -26 + by + raise, 1, 1, PAL.white);
    }
  }
  function paintBolt(Rr, c, P, mouth, blink, f) {
    var by = (P.by || 0), ln = P.lean || 0;
    Rr(-1 + ln, -22 + by, 1, 3, c.body3); Rr(-2 + ln, -24 + by, 3, 2, c.tip);
    var arms = P.arms;
    var ay = arms === "up" || arms === "flail" || arms === "up1" ? -19 : -14;
    Rr(-8 + ln, ay + by, 2, 3, c.body2);
    Rr(-6 + ln, -19 + by, 12, 1, c.body); Rr(-7 + ln, -18 + by, 14, 9, c.body); Rr(-6 + ln, -9 + by, 12, 1, c.body2);
    Rr(-7 + ln, -11 + by, 14, 2, c.body2); Rr(-7 + ln, -18 + by, 1, 7, c.body2);
    Rr(-5 + ln, -17 + by, 10, 6, c.screen);
    var em = P.eyes || "open", ey = -16 + by;
    if (blink && em === "open") em = "blink";
    if (em === "open") { Rr(-2 + ln, ey, 2, 2, c.eye); Rr(2 + ln, ey, 2, 2, c.eye); }
    else if (em === "blink") { Rr(-2 + ln, ey + 1, 2, 1, c.eye); Rr(2 + ln, ey + 1, 2, 1, c.eye); }
    else if (em === "happy") { Rr(-3 + ln, ey + 1, 1, 1, c.eye); Rr(-2 + ln, ey, 2, 1, c.eye); Rr(0 + ln, ey + 1, 1, 1, c.eye); Rr(1 + ln, ey + 1, 1, 1, c.eye); Rr(2 + ln, ey, 2, 1, c.eye); Rr(4 + ln, ey + 1, 1, 1, c.eye); }
    else if (em === "hurt") { Rr(-2 + ln, ey, 1, 1, PAL.red); Rr(-1 + ln, ey + 1, 1, 1, PAL.red); Rr(3 + ln, ey, 1, 1, PAL.red); Rr(2 + ln, ey + 1, 1, 1, PAL.red); }
    else { Rr(-1 + ln, ey - 1, 2, 2, c.eye); Rr(3 + ln, ey - 1, 2, 2, c.eye); }
    if (mouth || P.mouth) { Rr(-1 + ln, -13 + by, 1, 1, c.eye); Rr(0 + ln, -12 + by, 2, 1, c.eye); Rr(2 + ln, -13 + by, 1, 1, c.eye); }
    else Rr(0 + ln, -13 + by, 2, 1, shade(c.eye, 0.6));
    var fax = arms === "point" || arms === "sword" ? 1 : 0;
    Rr(7 + ln + fax, ay + by, 2 + fax, 3, c.body2);
    if (arms === "sword") { Rr(10 + ln, -15 + by, 1, 1, PAL.yellow); Rr(11 + ln, -14 + by, 2, 1, PAL.yellow); Rr(13 + ln, -15 + by, 1, 1, PAL.yellow); Rr(14 + ln, -14 + by, 2, 1, PAL.white); }
    Rr(-2 + ln, -8 + by, 4, 2, c.body3);
    Rr(-1 + ln, -6 + by, 2, 2 + f, PAL.orange); Rr(-1 + ln, -6 + by, 2, 1, PAL.yellow);
  }
  var sprCache = {};
  function castSprite(id, pose, mouth, blink, f) {
    id = castOf(id); pose = POSE[pose] ? pose : "idle0";
    var key = id + "|" + pose + "|" + (mouth ? 1 : 0) + "|" + (blink ? 1 : 0) + "|" + (f ? 1 : 0);
    if (sprCache[key]) return sprCache[key];
    var c = cv(SPR_W, SPR_H), x = c.getContext("2d");
    function Rr(px, py, w, h, color) { if (w > 0 && h > 0) { x.fillStyle = color; x.fillRect(SPR_CX + px, SPR_FY + py, w, h); } }
    if (id === "bolt") paintBolt(Rr, CAST.bolt, POSE[pose], mouth, blink, f ? 1 : 0);
    else paintHuman(Rr, CAST[id], id, POSE[pose], mouth, blink, f ? 1 : 0);
    sprCache[key] = outline(c);
    return sprCache[key];
  }
  var PORTRAIT_TOP = { kit: -25, orla: -28, bolt: -25, vex: -25, mo: -25 };
  function portrait(id, o) {
    id = castOf(id); o = o || {};
    var key = "p|" + id + "|" + (o.talking ? 1 : 0) + "|" + (o.blink ? 1 : 0);
    if (sprCache[key]) return sprCache[key];
    var s = castSprite(id, "idle0", !!o.talking, !!o.blink, 0), c = cv(16, 16);
    c.getContext("2d").drawImage(s, SPR_CX - 8, SPR_FY + PORTRAIT_TOP[id], 16, 16, 0, 0, 16, 16);
    sprCache[key] = c;
    return c;
  }
  // Tiny overworld token for the world map (8x10 plus outline).
  function miniSprite(id, f) {
    id = castOf(id);
    var key = "mini|" + id + "|" + (f ? 1 : 0);
    if (sprCache[key]) return sprCache[key];
    var c = CAST[id], m = cv(12, 14), x = m.getContext("2d");
    function Rr(px, py, w, h, color) { x.fillStyle = color; x.fillRect(px + 2, py + 2, w, h); }
    if (id === "bolt") { Rr(1, 1, 6, 6, c.body); Rr(2, 2, 4, 3, c.screen); Rr(3, 3, 1, 1, c.eye); Rr(5, 3, 1, 1, c.eye); Rr(3, 0, 1, 1, c.tip); Rr(3, 7, 2, 1 + (f ? 1 : 0), PAL.orange); }
    else {
      var hair = id === "orla" ? c.hat : id === "mo" ? c.cap : c.hair;
      Rr(1, 1, 6, 5, c.skin); Rr(1, 0, 6, 2, hair); if (id === "orla") { Rr(2, -2, 4, 2, c.hat); Rr(3, -3, 2, 1, c.hat); }
      if (id === "kit") Rr(1, 2, 6, 1, c.band);
      Rr(3, 3, 1, 1, PAL.ink); Rr(5, 3, 1, 1, PAL.ink);
      Rr(1, 6, 6, 2, c.tunic);
      Rr(f ? 1 : 2, 8, 2, 1, c.boots); Rr(f ? 5 : 4, 8, 2, 1, c.boots);
    }
    sprCache[key] = outline(m);
    return sprCache[key];
  }

  // Enemies and bosses: procedural shapes, two frames.
  var ENEMY_IDS = ["slime", "bat", "spike", "ghost", "bugbot"];
  var BOSS_IDS = ["blob", "golem", "eye"];
  function enemyCanvas(type, f, tint) {
    type = ENEMY_IDS.indexOf(type) >= 0 ? type : "slime";
    var key = "e|" + type + "|" + (f ? 1 : 0) + "|" + (tint || "");
    if (sprCache[key]) return sprCache[key];
    var c = cv(22, 20), x = c.getContext("2d"), cx = 11, fy = 18;
    function Rr(px, py, w, h, color) { x.fillStyle = color; x.fillRect(cx + px, fy + py, w, h); }
    if (type === "slime") {
      var rx = f ? 7 : 6, ry = f ? 4 : 5;
      ellipse(x, cx, fy - ry, rx, ry, "#50c050"); x.clearRect(0, fy, 22, 4);
      ellipse(x, cx - 2, fy - ry - 1, 2, 1, "#a8f080");
      Rr(-3, -ry - 1, 2, 2, PAL.white); Rr(1, -ry - 1, 2, 2, PAL.white); Rr(-2, -ry, 1, 1, PAL.ink); Rr(2, -ry, 1, 1, PAL.ink);
      Rr(-rx + 1, -1, rx * 2 - 1, 1, "#2a8838");
    } else if (type === "bat") {
      ellipse(x, cx, fy - 9, 3, 3, "#6a3c9a"); Rr(-2, -13, 1, 2, "#6a3c9a"); Rr(2, -13, 1, 2, "#6a3c9a");
      Rr(-1, -10, 1, 1, PAL.yellow); Rr(1, -10, 1, 1, PAL.yellow); Rr(0, -8, 1, 1, PAL.white);
      if (f) { Rr(-8, -12, 5, 1, "#4a2870"); Rr(-7, -11, 4, 2, "#4a2870"); Rr(4, -12, 5, 1, "#4a2870"); Rr(4, -11, 4, 2, "#4a2870"); }
      else { Rr(-8, -9, 5, 1, "#4a2870"); Rr(-7, -8, 4, 2, "#4a2870"); Rr(-8, -7, 2, 1, "#4a2870"); Rr(4, -9, 5, 1, "#4a2870"); Rr(4, -8, 4, 2, "#4a2870"); Rr(7, -7, 2, 1, "#4a2870"); }
    } else if (type === "spike") {
      ellipse(x, cx, fy - 6, 5, 5, "#5a5a78"); ellipse(x, cx - 2, fy - 8, 1, 1, PAL.lightgrey);
      var sp = f ? [[0, -12], [0, 0], [-6, -6], [6, -6]] : [[-4, -10], [4, -10], [-4, -2], [4, -2]];
      sp.forEach(function (q) { Rr(q[0], q[1], 1, 1, PAL.white); });
      (f ? [[-4, -10], [4, -10], [-4, -2], [4, -2]] : [[0, -12], [-6, -6], [6, -6], [0, 0]]).forEach(function (q) { Rr(q[0], q[1], 1, 1, PAL.lightgrey); });
      Rr(-2, -7, 1, 2, PAL.red); Rr(2, -7, 1, 2, PAL.red);
    } else if (type === "ghost") {
      ellipse(x, cx, fy - 9, 6, 6, "#e8e8f8"); Rr(-6, -9, 13, 6, "#e8e8f8");
      for (var i = 0; i < 4; i++) Rr(-6 + i * 3 + (f ? 1 : 0), -3, 2, 1, "#e8e8f8");
      Rr(-6, -9, 1, 6, "#b8b8d8");
      Rr(-2, -11, 2, 3, PAL.ink); Rr(2, -11, 2, 3, PAL.ink); Rr(-3, -7, 1, 1, PAL.pink); Rr(4, -7, 1, 1, PAL.pink);
      Rr(0, -6, 2, 1, PAL.ink);
    } else {
      ellipse(x, cx, fy - 6, 6, 4, "#c84040"); x.clearRect(0, fy - 3, 22, 6);
      Rr(-6, -4, 13, 1, "#5a5a78"); Rr(0, -10, 1, 7, "#802830");
      ellipse(x, cx - 2, fy - 8, 1, 1, "#f08080");
      Rr(6, -7, 3, 3, "#5a5a78"); Rr(8, -6, 1, 1, PAL.yellow);
      var lg = f ? [-5, -1, 3] : [-4, 0, 4];
      lg.forEach(function (q) { Rr(q, -3, 1, 2, "#3a3a50"); Rr(q - 1 + (f ? 0 : 1), -1, 2, 1, "#3a3a50"); });
    }
    var out = outline(c);
    if (tint) out = tinted(out, col(tint), 0.45);
    sprCache[key] = out;
    return out;
  }
  function bossCanvas(type, f) {
    type = BOSS_IDS.indexOf(type) >= 0 ? type : "blob";
    var key = "b|" + type + "|" + (f ? 1 : 0);
    if (sprCache[key]) return sprCache[key];
    var c = cv(64, 56), x = c.getContext("2d"), cx = 32, fy = 54;
    function Rr(px, py, w, h, color) { x.fillStyle = color; x.fillRect(cx + px, fy + py, w, h); }
    if (type === "blob") {
      var rx = f ? 23 : 21, ry = f ? 17 : 19;
      ellipse(x, cx, fy - ry, rx, ry, "#9a4cd0"); x.clearRect(0, fy, 64, 4);
      dither(x, cx - rx, fy - 8, rx * 2 + 1, 8, "#6a2ca0", 0.5);
      Rr(-rx + 2, -2, rx * 2 - 3, 2, "#6a2ca0");
      ellipse(x, cx - 9, fy - ry - 8, 4, 3, "#d0a0f0"); Rr(-12, -ry - 9, 2, 1, PAL.white);
      Rr(-11, -ry + 3, 7, 6, PAL.white); Rr(4, -ry + 3, 7, 6, PAL.white);
      Rr(-8, -ry + 5, 3, 4, PAL.red); Rr(5, -ry + 5, 3, 4, PAL.red); Rr(-7, -ry + 6, 1, 2, PAL.ink); Rr(6, -ry + 6, 1, 2, PAL.ink);
      Rr(-12, -ry + 1, 8, 2, PAL.ink); Rr(4, -ry + 1, 8, 2, PAL.ink); Rr(-6, -ry + 3, 2, 1, PAL.ink); Rr(4, -ry + 3, 2, 1, PAL.ink);
      Rr(-9, -ry + 13, 18, 5, "#3a1050"); for (var i = 0; i < 6; i++) Rr(-8 + i * 3, -ry + 13, 2, 2, PAL.white);
      Rr(14, -9, 2, 5 + (f ? 2 : 0), "#9a4cd0");
    } else if (type === "golem") {
      var a = f ? -2 : 0;
      Rr(-14, -34, 28, 24, "#7a7a94"); Rr(-14, -34, 28, 2, "#a0a0b8"); Rr(-14, -12, 28, 2, "#5a5a74");
      Rr(-8, -46, 16, 12, "#8a8aa4"); Rr(-8, -46, 16, 2, "#b0b0c8");
      Rr(-5, -42, 4, 3, PAL.yellow); Rr(2, -42, 4, 3, PAL.yellow); Rr(-4, -41, 2, 1, PAL.white); Rr(3, -41, 2, 1, PAL.white);
      Rr(-4, -37, 9, 1, "#3a3a50");
      Rr(-23, -33 + a, 9, 18, "#6a6a84"); Rr(14, -33 + a, 9, 18, "#6a6a84"); Rr(-23, -17 + a, 9, 4, "#8a8aa4"); Rr(14, -17 + a, 9, 4, "#8a8aa4");
      Rr(-11, -10, 9, 10, "#5a5a74"); Rr(2, -10, 9, 10, "#5a5a74");
      Rr(-6, -30, 1, 6, "#4a4a60"); Rr(-5, -25, 3, 1, "#4a4a60"); Rr(6, -22, 1, 5, "#4a4a60");
      Rr(-14, -34, 6, 2, "#58a050"); Rr(8, -46, 3, 2, "#58a050"); Rr(-23, -33 + a, 4, 2, "#58a050");
      Rr(-2, -28, 5, 5, "#e05030"); Rr(-1, -27, 3, 3, PAL.yellow);
    } else {
      var wy = f ? -6 : 0;
      Rr(-28, -30 + wy, 10, 3, "#6a3c9a"); Rr(-26, -27 + wy, 8, 3, "#6a3c9a"); Rr(-24, -24 + wy, 5, 3, "#6a3c9a"); Rr(-28, -27 + wy, 2, 2, "#4a2870");
      Rr(18, -30 + wy, 10, 3, "#6a3c9a"); Rr(18, -27 + wy, 8, 3, "#6a3c9a"); Rr(19, -24 + wy, 5, 3, "#6a3c9a"); Rr(26, -27 + wy, 2, 2, "#4a2870");
      ellipse(x, cx, fy - 26, 17, 17, "#f0ecf8");
      dither(x, cx - 17, fy - 18, 34, 10, "#c8c0e0", 0.5);
      line(x, cx - 15, fy - 30, cx - 9, fy - 27, "#e06070"); line(x, cx + 15, fy - 22, cx + 9, fy - 24, "#e06070"); line(x, cx - 12, fy - 16, cx - 7, fy - 20, "#e06070");
      ellipse(x, cx + 2, fy - 26, 9, 9, "#d83838"); ellipse(x, cx + 2, fy - 26, 6, 6, "#f08030");
      ellipse(x, cx + 3, fy - 26, 3, 4, PAL.ink); Rr(-2, -31, 2, 2, PAL.white);
      Rr(-7 + (f ? 1 : 0), -10, 2, 5, "#6a3c9a"); Rr(5 - (f ? 1 : 0), -10, 2, 5, "#6a3c9a"); Rr(-1, -10, 2, 6 + (f ? 1 : 0), "#6a3c9a"); Rr(-8 + (f ? 2 : 0), -6, 2, 2, "#4a2870"); Rr(6 - (f ? 2 : 0), -6, 2, 2, "#4a2870");
    }
    sprCache[key] = outline(c);
    return sprCache[key];
  }

  // ------------------------- worlds -------------------------
  var WORLDS = {
    grassland: { name: "GREEN HILLS", sky: ["#5c9ee8", "#86c0f4", "#bfe6f8"], bg: "#5c9ee8", ground: ["#78d050", "#48a038", "#a86c3c", "#7a4a28", "#5a3420"], block: ["#d88838", "#a85a20", "#f0b860"], enemy: "slime" },
    cave: { name: "CRYSTAL CAVE", sky: ["#100c20", "#1c1638", "#2a2050"], bg: "#100c20", ground: ["#7a6ab0", "#4a3c78", "#3a3058", "#2a2244", "#1c1630"], block: ["#5a4c88", "#3a3060", "#8a7cc0"], enemy: "bat" },
    city: { name: "NEON CITY", sky: ["#140c30", "#2c1450", "#5a2066", "#a03c74"], bg: "#140c30", ground: ["#a8a8c4", "#70708c", "#34344a", "#26263a", "#1a1a2a"], block: ["#4a4a6a", "#2a2a44", "#7a7aa0"], enemy: "bugbot" },
    castle: { name: "MOON CASTLE", sky: ["#0a0a24", "#161848", "#26306a"], bg: "#0a0a24", ground: ["#8a8aa8", "#5a5a78", "#4a4a64", "#3a3a52", "#2a2a3c"], block: ["#6a6a88", "#4a4a64", "#9a9ab8"], enemy: "ghost" },
    space: { name: "ORBIT STATION", sky: ["#04030c", "#0a0a20", "#121238"], bg: "#04030c", ground: ["#8890a8", "#5a6078", "#3c4058", "#2c3044", "#1c2030"], block: ["#5a6078", "#3c4058", "#8890a8"], enemy: "bugbot" },
    underwater: { name: "CORAL DEEP", sky: ["#3c9cd8", "#2470b8", "#164888", "#0e2c5c"], bg: "#0e2c5c", ground: ["#f0dca0", "#d8bc78", "#c8a868", "#a88850", "#886838"], block: ["#e07890", "#a84860", "#f8a8b8"], enemy: "slime" },
  };
  var WORLD_IDS = Object.keys(WORLDS);
  function worldOf(w, d) { w = str(w).toLowerCase(); return WORLDS[w] ? w : d || "grassland"; }
  var layerCache = {};
  var TILE = 256;
  function hillsInto(x, gy, amp, base, colr, top, seed, freq) {
    for (var i = 0; i < TILE; i++) {
      var h = base + amp * (0.55 * Math.sin((i / TILE) * 2 * PI * freq + seed) + 0.3 * Math.sin((i / TILE) * 2 * PI * (freq * 2 + 1) + seed * 2.3) + 0.15 * Math.sin((i / TILE) * 2 * PI * (freq * 5 + 2) + seed));
      h = R(h);
      x.fillStyle = colr; x.fillRect(i, gy - h, 1, h);
      if (top) { x.fillStyle = top; x.fillRect(i, gy - h, 1, 1); }
    }
  }
  function cloud(x, cx, cy, s) {
    ellipse(x, cx, cy, 9 * s, 4 * s, "#ffffff"); ellipse(x, cx - 7 * s, cy + 1, 6 * s, 3 * s, "#ffffff"); ellipse(x, cx + 8 * s, cy + 1, 6 * s, 3 * s, "#ffffff");
    ellipse(x, cx - 2 * s, cy - 3 * s, 6 * s, 4 * s, "#ffffff");
    x.fillStyle = "#d8ecfa"; x.fillRect(R(cx - 12 * s), R(cy + 3 * s), R(24 * s), 1);
  }
  function tree(x, cx, gy, h, c1, c2, trunk) {
    x.fillStyle = trunk; x.fillRect(cx - 1, gy - h * 0.4, 3, h * 0.4);
    ellipse(x, cx, gy - h * 0.62, h * 0.32, h * 0.34, c1);
    ellipse(x, cx - 2, gy - h * 0.7, h * 0.16, h * 0.14, c2);
  }
  function worldLayers(w, gy) {
    var key = w + "|" + gy;
    if (layerCache[key]) return layerCache[key];
    var L = { sky: cv(LW, LH), layers: [] };
    var sx = L.sky.getContext("2d"), cfg = WORLDS[w];
    gradient(sx, 0, 0, LW, Math.max(4, gy + 4), cfg.sky);
    rect(sx, 0, gy + 4, LW, LH, cfg.sky[cfg.sky.length - 1]);
    function layer(par, paint) { var c = cv(TILE, LH); paint(c.getContext("2d")); L.layers.push({ c: c, par: par }); }
    var i, h;
    if (w === "grassland") {
      layer(0.06, function (x) { cloud(x, 40, R(gy * 0.2), 1); cloud(x, 150, R(gy * 0.34), 0.7); cloud(x, 220, R(gy * 0.14), 0.8); });
      layer(0.2, function (x) { hillsInto(x, gy, 18, R(gy * 0.2), "#7cb8d0", "#a8d8e8", 1.2, 1); });
      layer(0.45, function (x) {
        hillsInto(x, gy, 10, R(gy * 0.1), "#3c9848", "#58b858", 4.1, 2);
        for (i = 0; i < 5; i++) tree(x, 20 + i * 52 + R(hash(i, 3) * 20), gy - 4, 22 + R(hash(i, 4) * 8), "#2c7c3c", "#48a050", "#5a3420");
      });
    } else if (w === "cave") {
      layer(0.15, function (x) {
        for (i = 0; i < 10; i++) { var cx = i * 26 + R(hash(i, 1) * 10), hh = 8 + R(hash(i, 2) * 22); for (var k = 0; k < hh; k++) { var ww = R((1 - k / hh) * 6); x.fillStyle = "#241c40"; x.fillRect(cx - ww, k, ww * 2 + 1, 1); } }
        hillsInto(x, gy, 14, R(gy * 0.22), "#1e1838", "#2c2450", 2.2, 2);
      });
      layer(0.4, function (x) {
        for (i = 0; i < 6; i++) {
          var cx = 18 + i * 42 + R(hash(i, 5) * 14), bc = i % 2 ? "#58d8e8" : "#b078e8";
          for (var k = 0; k < 3; k++) { var hh = 8 + R(hash(i, k + 6) * 10), xx = cx + (k - 1) * 4; for (var r = 0; r < hh; r++) { var ww = r < 2 ? 0 : 1; x.fillStyle = r < 2 ? PAL.white : bc; x.fillRect(xx - ww, gy - 2 - hh + r, ww * 2 + 1, 1); } }
        }
      });
    } else if (w === "city") {
      var skyc = L.sky.getContext("2d");
      for (i = 0; i < 40; i++) rect(skyc, R(hash(i, 9) * LW), R(hash(i, 10) * gy * 0.55), 1, 1, i % 5 ? "#c8b8e8" : PAL.white);
      layer(0.15, function (x) {
        for (i = 0; i < 9; i++) {
          var bx = i * 30 + R(hash(i, 11) * 6), bw = 20 + R(hash(i, 12) * 10), bh = R(gy * 0.3) + R(hash(i, 13) * gy * 0.3);
          rect(x, bx, gy - bh, bw, bh, "#2c1a4c");
          for (var wy = gy - bh + 4; wy < gy - 4; wy += 6) for (var wx = bx + 3; wx < bx + bw - 3; wx += 5) if (hash(wx, wy) > 0.6) rect(x, wx, wy, 2, 2, "#6a4c9a");
        }
      });
      layer(0.4, function (x) {
        for (i = 0; i < 6; i++) {
          var bx = i * 44 + R(hash(i, 14) * 8), bw = 28 + R(hash(i, 15) * 10), bh = R(gy * 0.22) + R(hash(i, 16) * gy * 0.28);
          rect(x, bx, gy - bh, bw, bh, "#1a1030"); rect(x, bx, gy - bh, bw, 1, "#3a2a5a");
          for (var wy = gy - bh + 4; wy < gy - 3; wy += 7) for (var wx = bx + 3; wx < bx + bw - 4; wx += 6) { var q = hash(wx * 3, wy); if (q > 0.45) rect(x, wx, wy, 3, 3, q > 0.85 ? "#58d8e8" : "#f8d878"); }
          if (i % 2 === 0) { rect(x, bx + 4, gy - bh - 8, 14, 6, i % 4 ? "#f07898" : "#58d8e8"); rect(x, bx + 5, gy - bh - 7, 12, 4, "#1a1030"); rect(x, bx + 6, gy - bh - 6, 10, 2, i % 4 ? "#f8b8c8" : "#b8f0f8"); }
          rect(x, bx + bw - 6, gy - bh - 6, 1, 6, "#3a2a5a"); rect(x, bx + bw - 6, gy - bh - 7, 1, 1, PAL.red);
        }
      });
    } else if (w === "castle") {
      var cs = L.sky.getContext("2d");
      for (i = 0; i < 46; i++) rect(cs, R(hash(i, 21) * LW), R(hash(i, 22) * gy * 0.7), 1, 1, i % 4 ? "#a8a8d8" : PAL.white);
      var mx = R(LW * 0.8), my = R(PORTRAIT ? LH * 0.131 + 46 : Math.max(LH * 0.07 + 30, gy * 0.3));
      ellipse(cs, mx, my, 13, 13, "#f0ecc8"); ellipse(cs, mx - 4, my - 3, 3, 3, "#d8d0a8"); ellipse(cs, mx + 5, my + 4, 2, 2, "#d8d0a8"); ellipse(cs, mx + 3, my - 6, 1, 1, "#d8d0a8");
      layer(0.1, function (x) { hillsInto(x, gy, 20, R(gy * 0.25), "#1c1c44", "#2a2a5a", 0.7, 1); });
      layer(0.35, function (x) {
        var base = gy, cx0 = 60;
        rect(x, cx0, base - 34, 90, 34, "#14142e");
        for (var k = 0; k < 90; k += 6) rect(x, cx0 + k, base - 37, 3, 3, "#14142e");
        [[cx0 - 6, 50], [cx0 + 40, 62], [cx0 + 84, 50]].forEach(function (tw) {
          rect(x, tw[0], base - tw[1], 14, tw[1], "#14142e");
          for (var k = 0; k < 14; k += 4) rect(x, tw[0] + k, base - tw[1] - 3, 2, 3, "#14142e");
          rect(x, tw[0] + 5, base - tw[1] + 10, 3, 5, "#f8d060");
        });
        for (var k = 0; k < 6; k++) rect(x, cx0 + 10 + k * 13, base - 22, 3, 4, hash(k, 30) > 0.5 ? "#f8d060" : "#3a3a5a");
        hillsInto(x, gy, 6, 6, "#101028", "#1c1c3c", 3.3, 3);
      });
    } else if (w === "space") {
      var ss = L.sky.getContext("2d");
      for (i = 0; i < 70; i++) rect(ss, R(hash(i, 41) * LW), R(hash(i, 42) * gy), 1, 1, i % 6 ? "#7878a8" : PAL.white);
      var px = R(LW * (PORTRAIT ? 0.74 : 0.22)), py = R(PORTRAIT ? LH * 0.131 + 50 : Math.max(LH * 0.07 + 30, gy * 0.3));
      ellipse(ss, px, py, 16, 16, "#d86848"); dither(ss, px - 16, py, 33, 17, "#a03c30", 0.5); ellipse(ss, px - 5, py - 6, 4, 3, "#f09068");
      ss.fillStyle = "#f0d8a0"; for (var a = 0; a < 60; a++) { var an = (a / 60) * 2 * PI; var rx = Math.cos(an) * 26, ry = Math.sin(an) * 5; if (ry < 0 && Math.abs(rx) < 15) continue; ss.fillRect(R(px + rx), R(py + ry - rx * 0.12), 1, 1); }
      layer(0.08, function (x) { for (i = 0; i < 26; i++) rect(x, R(hash(i, 43) * TILE), R(hash(i, 44) * gy), 1, 1, "#b8b8e8"); });
      layer(0.4, function (x) {
        for (i = 0; i < 4; i++) {
          var bx = i * 64 + 10, hh = R(gy * 0.25) + R(hash(i, 45) * gy * 0.2);
          rect(x, bx, gy - hh, 8, hh, "#2a2e48"); for (var k = gy - hh; k < gy; k += 6) { line(x, bx, k, bx + 7, k + 5, "#3c4260"); }
          rect(x, bx - 8, gy - hh - 4, 24, 5, "#3c4260"); rect(x, bx - 6, gy - hh - 3, 2, 2, i % 2 ? PAL.red : "#58d8e8");
          rect(x, bx + 16, gy - R(hh * 0.5), 26, 4, "#2a2e48");
        }
      });
    } else if (w === "underwater") {
      var us = L.sky.getContext("2d");
      for (i = 0; i < 5; i++) { var rx0 = R(LW * (0.1 + i * 0.22)); for (var k = 0; k < gy; k++) dither(us, rx0 + R(k * 0.35), k, 6, 1, "#88c8f0", 0.25 * (1 - k / gy)); }
      layer(0.15, function (x) { hillsInto(x, gy, 16, R(gy * 0.2), "#12406c", "#1c5480", 1.9, 2); });
      layer(0.4, function (x) {
        for (i = 0; i < 5; i++) {
          var cx = 20 + i * 52 + R(hash(i, 51) * 14), c1 = i % 2 ? "#e07890" : "#f0a040";
          for (var k = 0; k < 4; k++) { var hh = 6 + R(hash(i, k + 52) * 10); rect(x, cx + k * 3 - 4, gy - hh, 2, hh, c1); rect(x, cx + k * 3 - 4, gy - hh, 2, 1, shade(c1, 1.25)); }
          ellipse(x, cx + 14, gy - 3, 4, 3, "#6a5a8a");
        }
      });
    }
    // ground tile (16 wide, from the ground line to the bottom)
    var gt = cv(16, Math.max(2, LH - gy)), gx = gt.getContext("2d"), gc = cfg.ground, gh = LH - gy;
    rect(gx, 0, 0, 16, gh, gc[2]);
    if (w === "grassland") {
      rect(gx, 0, 0, 16, 3, gc[0]); rect(gx, 0, 3, 16, 2, gc[1]); rect(gx, 2, 5, 3, 1, gc[1]); rect(gx, 10, 5, 2, 1, gc[1]);
      for (var yy = 9; yy < gh; yy += 8) { rect(gx, 0, yy, 16, 1, gc[3]); rect(gx, ((yy / 8) | 0) % 2 ? 4 : 12, yy - 7, 1, 7, gc[3]); }
      rect(gx, 6, 12, 2, 1, gc[4]); rect(gx, 13, 22, 1, 1, gc[4]);
    } else if (w === "underwater") {
      rect(gx, 0, 0, 16, 2, gc[0]); dither(gx, 0, 2, 16, gh, gc[1], 0.25); rect(gx, 4, 7, 2, 1, gc[3]); rect(gx, 11, 15, 2, 1, gc[3]); rect(gx, 7, 24, 1, 1, PAL.pink);
    } else if (w === "city") {
      rect(gx, 0, 0, 16, 3, gc[0]); rect(gx, 0, 3, 16, 1, gc[1]); rect(gx, 15, 0, 1, 3, gc[1]);
      rect(gx, 0, 4, 16, gh, gc[2]); rect(gx, 2, R(Math.min(gh - 2, 14)), 8, 1, PAL.yellow); dither(gx, 0, 18, 16, gh, gc[3], 0.5);
    } else if (w === "space") {
      rect(gx, 0, 0, 16, 2, gc[0]); rect(gx, 0, 2, 16, 1, "#58d8e8"); rect(gx, 0, 3, 16, gh, gc[2]);
      for (var yy2 = 8; yy2 < gh; yy2 += 10) { rect(gx, 0, yy2, 16, 1, gc[3]); rect(gx, 2, yy2 + 3, 1, 1, gc[0]); rect(gx, 13, yy2 + 3, 1, 1, gc[0]); }
      rect(gx, 15, 3, 1, gh, gc[3]);
    } else {
      rect(gx, 0, 0, 16, 2, gc[0]); rect(gx, 0, 2, 16, 1, gc[1]);
      for (var yy3 = 7; yy3 < gh; yy3 += 6) { rect(gx, 0, yy3, 16, 1, gc[3]); rect(gx, ((yy3 / 6) | 0) % 2 ? 5 : 13, yy3 - 5, 1, 5, gc[3]); }
      if (w === "castle") { rect(gx, 3, 2, 3, 1, "#58a050"); rect(gx, 11, 2, 2, 1, "#58a050"); }
      if (w === "cave") { rect(gx, 7, 2, 2, 1, "#b078e8"); }
    }
    for (var dd = 0; dd < 4; dd++) {
      var y0d = 24 + dd * 20, dk = shade(gc[2], 0.86 - dd * 0.1), dk0 = shade(gc[2], 0.96 - dd * 0.1);
      if (y0d >= gh) break;
      dither(gx, 0, y0d, 16, 4, dk, 0.5); rect(gx, 0, y0d + 4, 16, gh - y0d - 4, dk);
      if (dd === 0) rect(gx, 0, y0d - 1, 16, 1, dk0);
    }
    if (w !== "space" && w !== "city") for (var st = 0; st < 3; st++) { var sy = 30 + st * 26 + R(hash(st, 131) * 8); if (sy < gh - 4) { rect(gx, 3 + st * 5, sy, 4, 2, shade(gc[2], 0.62 - st * 0.06)); rect(gx, 3 + st * 5, sy, 4, 1, shade(gc[2], 0.8 - st * 0.06)); } }
    L.ground = gt;
    layerCache[key] = L;
    return L;
  }
  function decoAt(ctx, w, x, gy, t, i) {
    if (w === "grassland") {
      if (i % 3 === 0) { rect(ctx, x, gy - 4, 1, 4, "#2a7038"); rect(ctx, x - 1, gy - 6, 3, 2, i % 2 ? PAL.pink : PAL.yellow); rect(ctx, x, gy - 5, 1, 1, PAL.white); }
      else if (i % 3 === 1) { ellipse(ctx, x, gy - 3, 5, 3, "#2c8c3c"); ellipse(ctx, x - 1, gy - 4, 2, 1, "#58b858"); }
      else { rect(ctx, x - 1, gy - 10, 2, 10, PAL.brown); rect(ctx, x - 5, gy - 12, 11, 5, "#c88a48"); rect(ctx, x - 5, gy - 8, 11, 1, PAL.darkbrown); rect(ctx, x - 2, gy - 10, 6, 1, PAL.darkbrown); }
    } else if (w === "cave") {
      var gl = 0.5 + 0.5 * Math.sin(t * 3 + i);
      rect(ctx, x, gy - 7, 2, 7, "#58d8e8"); rect(ctx, x - 2, gy - 4, 2, 4, "#b078e8"); rect(ctx, x, gy - 7, 1, 2, gl > 0.6 ? PAL.white : "#a8f0f8");
    } else if (w === "city") {
      rect(ctx, x, gy - 20, 1, 20, "#5a5a78"); rect(ctx, x - 2, gy - 21, 5, 2, "#5a5a78"); rect(ctx, x - 1, gy - 19, 3, 1, "#f8e8a0");
      dither(ctx, x - 4, gy - 18, 9, 6, "#f8e8a0", 0.2);
    } else if (w === "castle") {
      rect(ctx, x, gy - 12, 2, 8, PAL.brown); var fl = Math.floor(t * 8 + i) % 2;
      rect(ctx, x - 1, gy - 15 - fl, 4, 3 + fl, PAL.orange); rect(ctx, x, gy - 14, 2, 2, PAL.yellow);
    } else if (w === "space") {
      rect(ctx, x - 4, gy - 9, 9, 9, "#3c4058"); rect(ctx, x - 3, gy - 8, 7, 4, "#1c2440"); rect(ctx, x - 2, gy - 7, 2, 1, Math.floor(t * 3 + i) % 2 ? "#58d8e8" : PAL.lime); rect(ctx, x + 1, gy - 6, 2, 1, PAL.red);
    } else if (w === "underwater") {
      for (var k = 0; k < 6; k++) { var sw = R(Math.sin(t * 2 + k * 0.6 + i) * (k / 3)); rect(ctx, x + sw, gy - 2 - k * 2, 2, 2, k % 2 ? "#3ca850" : "#58c060"); }
    }
  }
  function drawWorld(ctx, g, t, cam) {
    var L = worldLayers(g.world, g.groundY), w = g.world;
    ctx.drawImage(L.sky, 0, 0);
    // animated sky bits
    if (w === "grassland") { /* static clouds layer drifts below */ }
    if (w === "castle" || w === "space" || w === "city") {
      for (var s = 0; s < 6; s++) if (Math.floor(t * 2 + s * 1.7) % 4 === 0) rect(ctx, R(hash(s, 61) * LW), R(hash(s, 62) * g.groundY * 0.6), 1, 1, PAL.white);
    }
    L.layers.forEach(function (ly, i) {
      var drift = w === "grassland" && i === 0 ? t * 3 : 0;
      var off = -(((R(cam * ly.par + drift) % TILE) + TILE) % TILE);
      for (var x = off; x < LW; x += TILE) ctx.drawImage(ly.c, x, 0);
    });
    if (w === "underwater") {
      for (var b = 0; b < 14; b++) {
        var per = 4 + hash(b, 71) * 3, ph = ((t + hash(b, 72) * per) % per) / per, bx = R(hash(b, 73) * LW + Math.sin(t * 2 + b) * 2), by = R(g.groundY - ph * (g.groundY + 10));
        rect(ctx, bx, by, 2, 2, "#a8e0f8"); rect(ctx, bx, by, 1, 1, PAL.white);
      }
    }
    // deco at ground level (world parallax 1)
    if (g.deco) {
      var first = Math.floor((cam - 40) / 64);
      for (var i = first; i < first + Math.ceil(LW / 64) + 2; i++) {
        if (i < 0) continue;
        var dx = i * 64 + 24 + R(hash(i, 81) * 24);
        if (g.inGap(dx)) continue;
        decoAt(ctx, w, dx - cam, g.groundY, t, i);
      }
    }
    // ground tiles, skipping pits
    var gt = L.ground, x0 = Math.floor(cam / 16) * 16;
    for (var gx = x0; gx < cam + LW + 16; gx += 16) {
      if (g.inGap(gx + 8)) {
        rect(ctx, gx - cam, g.groundY, 16, LH - g.groundY, PAL.black);
        continue;
      }
      ctx.drawImage(gt, gx - cam, g.groundY);
    }
    g.gaps.forEach(function (gp) {
      var a = gp.x - cam, b = gp.x + gp.w - cam;
      if (b < 0 || a > LW) return;
      rect(ctx, a, g.groundY, gp.w, LH - g.groundY, PAL.black);
      rect(ctx, a - 1, g.groundY, 1, LH - g.groundY, shade(WORLDS[w].ground[2], 0.6));
      rect(ctx, b, g.groundY, 1, LH - g.groundY, shade(WORLDS[w].ground[2], 0.6));
    });
  }

  // ------------------------- timing helpers (copied from the whiteboard pilot) -------------------------
  var STOP = {};
  "a an the and or but of to in on at by for with from into onto over under is are was were be been being it its this that these those your you we our us my me i his her their they them he she as than then so not no yes do does did have has had will would can could should very just more most less each every all any some about here there what when who how why which also too up out if".split(" ").forEach(function (w) { STOP[w] = 1; });
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
  function labelTime(label, keyword, after) {
    if (keyword) { var t = kwFind(keyword, after); if (t != null) return t; }
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
  // Beat times for a list of {label, keyword}: found words, missing ones spread, a minimum gap,
  // everything between o.first and D - o.tail.
  function landTimes(list, o) {
    o = o || {};
    var n = list.length;
    if (!n) return [];
    var lo = Math.min(o.first != null ? o.first : 0.5, D * 0.2), hi = Math.max(lo + 0.3, D - (o.tail != null ? o.tail : 1.6));
    var gap = Math.min(o.gap != null ? o.gap : 0.4, (hi - lo) / Math.max(1, n));
    var prev = o.after || 0;
    var t = list.map(function (it) { var x = labelTime(it.label, it.keyword, prev); if (x != null) prev = x + 0.01; return x; });
    t = spread(t, lo, hi);
    for (var i = 0; i < n; i++) { t[i] = clamp(t[i], lo, hi); if (i && t[i] < t[i - 1] + gap) t[i] = t[i - 1] + gap; }
    for (i = n - 1; i >= 0; i--) { var lim = hi - (n - 1 - i) * gap; if (t[i] > lim) t[i] = lim; }
    return t;
  }
  // Word-by-word alignment of an on-screen line with the narration.
  var NW = V.words.map(function (w) { return normWord(w.word); });
  function wmatch(a, b) { return a && b && (a === b || (a.length >= 3 && b.length >= 3 && (a.indexOf(b) === 0 || b.indexOf(a) === 0))); }
  function alignText(textIn, after, t0Fix, t1Fix) {
    var plain = runs(String(textIn || "")).map(function (r) { return r.ch; }).join("");
    var toks = [], re = /\S+/g, m;
    while ((m = re.exec(plain))) toks.push({ w: normWord(m[0]), c0: m.index, c1: m.index + m[0].length });
    var total = plain.length, ws = V.words;
    after = Math.max(0, after || 0);
    function linear(a, b) {
      var span = Math.max(0.3, b - a);
      toks.forEach(function (tk) { tk.s = a + (tk.c0 / Math.max(1, total)) * span; tk.e = a + (tk.c1 / Math.max(1, total)) * span; });
    }
    if (!toks.length) return mkClock(toks, total, after, after + 0.3);
    if (t0Fix != null && t1Fix != null) { linear(t0Fix, t1Fix); return mkClock(toks, total, t0Fix, t1Fix); }
    var start = -1, tokAt = 0, i, k, j;
    if (ws.length) {
      for (i = 0; i < ws.length && start < 0; i++) {
        if (ws[i].start < after - 0.2) continue;
        if (t0Fix != null && ws[i].start < t0Fix - 0.2) continue;
        for (k = 0; k < Math.min(3, toks.length); k++) if (wmatch(NW[i], toks[k].w)) { start = i; tokAt = k; break; }
        if (start < 0 && ws[i].start > after + 12) break;
      }
    }
    if (start < 0) {
      var a = t0Fix != null ? t0Fix : after + 0.05, b = t1Fix != null ? t1Fix : a + Math.max(0.6, total / 15);
      linear(a, b);
      return mkClock(toks, total, a, b);
    }
    var cur = start;
    for (k = tokAt; k < toks.length; k++) {
      for (j = cur; j < Math.min(ws.length, cur + 5); j++) if (wmatch(NW[j], toks[k].w)) { toks[k].s = ws[j].start; toks[k].e = ws[j].end; cur = j + 1; break; }
    }
    // fill the gaps by character position
    var known = toks.filter(function (tk) { return tk.s != null; });
    toks.forEach(function (tk, idx) {
      if (tk.s != null) return;
      var p = null, q = null;
      for (var a2 = idx - 1; a2 >= 0; a2--) if (toks[a2].s != null) { p = toks[a2]; break; }
      for (var b2 = idx + 1; b2 < toks.length; b2++) if (toks[b2].s != null) { q = toks[b2]; break; }
      if (p && q) { var f = (tk.c0 - p.c1) / Math.max(1, q.c0 - p.c1); tk.s = lerp(p.e, q.s, clamp(f, 0, 1)); }
      else if (p) tk.s = p.e + (tk.c0 - p.c1) / 15;
      else if (q) tk.s = Math.max(after, q.s - (q.c0 - tk.c0) / 15);
      else tk.s = after;
      tk.e = tk.s + Math.max(0.12, (tk.c1 - tk.c0) / 15);
    });
    toks.forEach(function (tk, idx) { if (idx && tk.s < toks[idx - 1].s) tk.s = toks[idx - 1].s; if (tk.e < tk.s + 0.05) tk.e = tk.s + 0.05; });
    var t0 = t0Fix != null ? t0Fix : toks[0].s, t1 = t1Fix != null ? t1Fix : toks[toks.length - 1].e;
    if (known.length === 0) linear(t0, t1);
    return mkClock(toks, total, t0, t1);
  }
  function mkClock(toks, total, t0, t1) {
    return {
      t0: t0, t1: t1, total: total,
      n: function (t) {
        if (!toks.length) return t >= t0 ? total : 0;
        if (t < toks[0].s) return 0;
        var nn = 0;
        for (var i = 0; i < toks.length; i++) {
          var tk = toks[i];
          if (t >= tk.e) nn = i + 1 < toks.length ? toks[i + 1].c0 : total;
          else if (t >= tk.s) { nn = tk.c0 + Math.ceil((tk.c1 - tk.c0) * (t - tk.s) / Math.max(0.01, tk.e - tk.s)); break; }
          else break;
        }
        return nn;
      },
      speaking: function (t) {
        if (!toks.length) return false;
        for (var i = 0; i < toks.length; i++) if (t >= toks[i].s - 0.02 && t < toks[i].e + 0.04) return true;
        return false;
      },
    };
  }
  function textClock(textIn, t0, t1) {
    if (t0 != null && t1 != null) return alignText(textIn, t0, t0, t1);
    return alignText(textIn, t0 || 0, null, null);
  }
  function speakingAt(t) {
    var ws = V.words;
    if (!ws.length) return true;
    var lo = 0, hi = ws.length - 1;
    while (lo <= hi) { var mid = (lo + hi) >> 1; if (ws[mid].start > t) hi = mid - 1; else lo = mid + 1; }
    return hi >= 0 && t < ws[hi].end + 0.03;
  }

  // ------------------------- safe area (logical pixels) -------------------------
  function safe() {
    var x0, y0, x1, y1;
    if (PORTRAIT) { x0 = Math.ceil(LW * 0.056); x1 = Math.floor(LW * 0.944); y0 = Math.ceil(LH * 0.131); y1 = Math.floor(LH * 0.755); }
    else { x0 = Math.ceil(LW * 0.07); x1 = Math.floor(LW * 0.93); y0 = Math.ceil(LH * 0.07); y1 = Math.floor(LH * 0.93); }
    return { x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0, h: y1 - y0, cx: R((x0 + x1) / 2), cy: R((y0 + y1) / 2) };
  }

  // ------------------------- inspection (tests) -------------------------
  var REC = null;
  function rec(kind, label, x, y, w, h, moving) { if (REC) REC.push({ kind: kind, label: label, x: x, y: y, w: w, h: h, moving: !!moving }); }

  // ------------------------- the game -------------------------
  var GAMES = [];
  var PSEED = 1;
  function Game(root, o) {
    o = T(o);
    var g = this;
    g.W = LW; g.H = LH; g.portrait = PORTRAIT; g.square = SQUARE; g.landscape = !PORTRAIT && !SQUARE;
    g.groundY = R(o.groundY != null ? num(o.groundY, 0) : LH * (PORTRAIT ? 0.62 : 0.8));
    g.world = worldOf(o.world);
    g.length = num(o.length, 2400);
    g.intro = o.intro == null ? "iris" : String(o.intro);
    g.background = o.background !== false;
    g.bgColor = col(o.bgColor, WORLDS[g.world].bg);
    g.deco = o.deco !== false;
    g.safe = safe();
    g.ents = []; g.seq = 0; g.dirty = true;
    g.gaps = []; g.platforms = [];
    g.shakes = []; g.flashes = []; g.scoreEv = []; g.heartEv = [];
    g.hearts0 = o.hearts != null ? clamp(num(o.hearts, 3), 0, 10) : 3;
    g.maxHearts = Math.max(g.hearts0, o.maxHearts != null ? clamp(num(o.maxHearts, 3), 1, 10) : 3);
    g.score0 = num(o.score, 0);
    g.hudOn = false; g.hudOpts = {};
    g.camKeys = null; g.camFn = null; g.followA = null;
    g.actors = [];
    var wrapEl = doc.createElement("div"); wrapEl.className = "pq";
    var c = doc.createElement("canvas"); c.width = LW; c.height = LH; c.className = "pq-cv";
    c.style.width = LW * K + "px"; c.style.height = LH * K + "px"; c.style.left = OX + "px"; c.style.top = OY + "px";
    var scan = doc.createElement("div"); scan.className = "pq-scan";
    var dark = Math.max(1, Math.round(K / 3));
    scan.style.backgroundImage = "linear-gradient(to bottom, rgba(0,0,0,0) 0px, rgba(0,0,0,0) " + (K - dark) + "px, rgba(8,4,20,0.16) " + (K - dark) + "px, rgba(8,4,20,0.16) " + K + "px)";
    scan.style.backgroundSize = "100% " + K + "px";
    scan.style.backgroundPosition = "0 " + OY + "px";
    wrapEl.appendChild(c); wrapEl.appendChild(scan);
    (root || V.root()).appendChild(wrapEl);
    g.el = wrapEl; g.canvas = c; g.ctx = c.getContext("2d"); g.ctx.imageSmoothingEnabled = false;
    GAMES.push(g);
    V.onFrame(function (t) { g.frame(t); });
  }
  var GP = Game.prototype;
  GP._ent = function (z, ui, fn) { this.ents.push({ z: num(z, 50), ui: ui ? 1 : 0, fn: fn, seq: this.seq++ }); this.dirty = true; };
  GP.inGap = function (x) { for (var i = 0; i < this.gaps.length; i++) if (x >= this.gaps[i].x && x < this.gaps[i].x + this.gaps[i].w) return true; return false; };
  GP.camAt = function (t) {
    var x = 0;
    if (typeof this.camFn === "function") { try { x = +this.camFn(t) || 0; } catch (e) { x = 0; } }
    else if (this.camKeys && this.camKeys.length) {
      var ks = this.camKeys;
      if (t <= ks[0][0]) x = ks[0][1];
      else if (t >= ks[ks.length - 1][0]) x = ks[ks.length - 1][1];
      else for (var i = 0; i < ks.length - 1; i++) if (t >= ks[i][0] && t < ks[i + 1][0]) { x = lerp(ks[i][1], ks[i + 1][1], smooth((t - ks[i][0]) / Math.max(0.001, ks[i + 1][0] - ks[i][0]))); break; }
    } else if (this.followA) {
      x = this.followA.xAt(t) - LW * this.followAt + this.followLead;
      if (this.followMin != null) x = Math.max(this.followMin, x);
    }
    return R(x);
  };
  GP.shakeAt = function (t) {
    var dx = 0, dy = 0;
    this.shakes.forEach(function (s, i) {
      if (t < s.at || t > s.at + s.dur) return;
      var a = s.power * (1 - (t - s.at) / s.dur);
      dx += Math.sin(t * 93 + i * 1.7) * a; dy += Math.cos(t * 71 + i * 2.3) * a;
    });
    return [R(dx), R(dy)];
  };
  GP.scoreAt = function (t) {
    var s = this.score0;
    this.scoreEv.forEach(function (e) { if (t >= e.at) s += e.v * prog(t, e.at, 0.35); });
    return Math.max(0, R(s));
  };
  GP.heartsAt = function (t) {
    var h = this.hearts0;
    this.heartEv.forEach(function (e) { if (t >= e.at) h += e.v; });
    return clamp(h, 0, this.maxHearts);
  };
  GP.frame = function (t) {
    var g = this, ctx = g.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = 1;
    rect(ctx, 0, 0, LW, LH, g.bgColor);
    var cam = g.camAt(t);
    g.cam = cam; g.t = t;
    g.camMoving = Math.abs(g.camAt(t + 0.05) - g.camAt(Math.max(0, t - 0.05))) >= 1;
    var sh = g.shakeAt(t);
    ctx.translate(sh[0], sh[1]);
    if (g.background) drawWorld(ctx, g, t, cam);
    if (g.dirty) { g.ents.sort(function (a, b) { return a.ui - b.ui || a.z - b.z || a.seq - b.seq; }); g.dirty = false; }
    for (var i = 0; i < g.ents.length; i++) {
      var e = g.ents[i];
      try { ctx.save(); e.fn(ctx, t, cam); } catch (err) { V.error("[pixel-world draw] " + (err && err.message ? err.message : err)); } finally { ctx.restore(); }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    g.flashes.forEach(function (f) {
      if (t < f.at || t > f.at + f.dur) return;
      var p = (t - f.at) / f.dur;
      if (p < 0.4) rect(ctx, 0, 0, LW, LH, f.color); else dither(ctx, 0, 0, LW, LH, f.color, 1 - (p - 0.4) / 0.6);
    });
    g.drawIntro(ctx, t);
  };
  GP.drawIntro = function (ctx, t) {
    var d = 0.3, p = t / d;
    if (this.intro === "none" || p >= 1) return;
    var c = PAL.black;
    if (this.intro === "dither") { dither(ctx, 0, 0, LW, LH, c, 1 - p); return; }
    if (this.intro === "wipe") { var x = R(LW * smooth(p)); rect(ctx, x, 0, LW - x, LH, c); return; }
    var maxR = Math.sqrt(LW * LW + LH * LH) / 2 + 2, r = maxR * smooth(p), cx = LW / 2, cy = LH / 2;
    for (var y = 0; y < LH; y++) {
      var dy = y + 0.5 - cy, hw = r * r - dy * dy;
      if (hw <= 0) { rect(ctx, 0, y, LW, 1, c); continue; }
      hw = Math.sqrt(hw);
      rect(ctx, 0, y, Math.max(0, R(cx - hw)), 1, c);
      rect(ctx, R(cx + hw), y, LW, 1, c);
    }
  };

  // --- HUD ---
  GP.hud = function (o) {
    o = T(o);
    var g = this;
    g.hudOn = true;
    g.hudOpts = o;
    if (o.hearts != null) g.hearts0 = clamp(num(o.hearts, 3), 0, 10);
    if (o.maxHearts != null) g.maxHearts = Math.max(g.hearts0, clamp(num(o.maxHearts, 3), 1, 10));
    if (o.score != null && o.score !== false) g.score0 = num(o.score, 0);
    if (g._hudEnt) return g;
    g._hudEnt = true;
    g._ent(120, true, function (ctx, t) {
      var sa = g.safe, ho = g.hudOpts, y = sa.y0 + 1, lvl = up(ho.level);
      var hearts = g.heartsAt(t);
      for (var i = 0; i < g.maxHearts; i++) {
        var full = i < hearts, lost = g.heartEv.some(function (e) { return e.v < 0 && t >= e.at && t < e.at + 0.6; });
        var ic = itemCanvas("heart");
        var hx = sa.x0 + i * 10;
        if (full) ctx.drawImage(ic, hx, y - 1);
        else if (!(lost && i === hearts && Math.floor(t * 12) % 2)) { ctx.drawImage(tintCache(ic, PAL.darkgrey), hx, y - 1); }
      }
      var sc = ho.score === false ? "" : ("000000" + g.scoreAt(t)).slice(-6);
      if (sc) text(ctx, sc, sa.x1, y, { align: "right", outline: true, color: PAL.white });
      var hw = g.maxHearts * 10;
      if (lvl) {
        if (PORTRAIT) text(ctx, lvl, sa.cx, y + 13, { align: "center", outline: true, color: PAL.yellow });
        else {
          var room = sa.w - hw - measure(sc) - 12;
          var lv = lvl; while (lv.length > 3 && measure(lv) > room) lv = lv.slice(0, -1);
          text(ctx, lv, R(sa.x0 + hw + 6 + room / 2), y, { align: "center", outline: true, color: PAL.yellow });
        }
      }
      if (ho.xp !== false) {
        var by = PORTRAIT ? y + (lvl ? 24 : 12) : y + 11, bw = PORTRAIT ? sa.w : sa.w, bx = sa.x0;
        rect(ctx, bx, by, bw, 4, PAL.ink);
        rect(ctx, bx + 1, by + 1, bw - 2, 2, PAL.deep);
        var p = clamp(t / D, 0, 1);
        rect(ctx, bx + 1, by + 1, R((bw - 2) * p), 2, PAL.lime);
        rect(ctx, bx + 1, by + 1, R((bw - 2) * p), 1, "#d8f8a0");
      }
      rec("hud", lvl || "hud", sa.x0, y - 1, sa.w, g.hudHeight());
    });
    return g;
  };
  GP.hudHeight = function () { if (!this.hudOn) return 0; var lvl = up(this.hudOpts.level); return PORTRAIT ? (lvl ? 30 : 18) : 16; };
  var tintCacheMap = new Map();
  function tintCache(c, color) {
    var m = tintCacheMap.get(c);
    if (!m) { m = {}; tintCacheMap.set(c, m); }
    if (!m[color]) m[color] = tinted(c, color, 1);
    return m[color];
  }

  // --- camera ---
  GP.follow = function (actor, o) {
    o = T(o);
    this.followA = actor; this.followLead = num(o.lead, 0); this.followAt = num(o.at, 0.35);
    this.followMin = o.min === undefined ? 0 : o.min;
    this.camFn = null; this.camKeys = null;
    return this;
  };
  GP.camera = function (keys) {
    this.camKeys = arr(keys).filter(function (k) { return Array.isArray(k) && isFinite(+k[0]) && isFinite(+k[1]); }).map(function (k) { return [+k[0], +k[1]]; }).sort(function (a, b) { return a[0] - b[0]; });
    this.followA = null; this.camFn = null;
    return this;
  };
  // --- level pieces ---
  GP.platform = function (x, y, w) {
    var g = this; x = num(x, 0); y = num(y, g.groundY - 30); w = Math.max(8, num(w, 32));
    var pf = { x: x, y: y, w: w };
    g.platforms.push(pf);
    var bl = WORLDS[g.world].block;
    g._ent(30, false, function (ctx, t, cam) {
      var sx = R(x - cam);
      if (sx > LW || sx + w < 0) return;
      for (var k = 0; k < w; k += 8) {
        var bw = Math.min(8, w - k);
        rect(ctx, sx + k, y, bw, 8, bl[0]); rect(ctx, sx + k, y, bw, 1, bl[2]); rect(ctx, sx + k + bw - 1, y, 1, 8, bl[1]); rect(ctx, sx + k, y + 7, bw, 1, bl[1]);
      }
      rect(ctx, sx - 1, y - 1, w + 2, 1, PAL.ink); rect(ctx, sx - 1, y + 8, w + 2, 1, PAL.ink); rect(ctx, sx - 1, y, 1, 8, PAL.ink); rect(ctx, sx + w, y, 1, 8, PAL.ink);
    });
    return pf;
  };
  GP.gap = function (x, w) { var gp = { x: num(x, 0), w: Math.max(8, num(w, 32)) }; this.gaps.push(gp); return gp; };

  // --- actors ---
  function Actor(g, id, o) {
    o = T(o);
    this.g = g; this.id = castOf(id); this.x0 = num(o.x, 40); this.floor0 = num(o.y, g.groundY);
    this.face0 = o.face === -1 || o.face === "left" ? -1 : 1; this.scale = o.scale === 2 ? 2 : 1; this.z = num(o.z, 50);
    this.shadow = o.shadow !== false;
    this.moves = []; this.jumps = []; this.poses = []; this.faces = []; this.talks = []; this.vis = []; this.hurts = []; this.cheers = [];
    this.hideAt0 = o.hidden === true;
    var a = this;
    g.actors.push(a);
    g._ent(a.z, false, function (ctx, t, cam) { a.draw(ctx, t, cam); });
  }
  var AP = Actor.prototype;
  AP.xAt = function (t) {
    var x = this.x0;
    for (var i = 0; i < this.moves.length; i++) {
      var m = this.moves[i];
      if (t < m.t0) break;
      x = t >= m.t1 ? m.x1 : lerp(m.x0, m.x1, (t - m.t0) / Math.max(0.001, m.t1 - m.t0));
    }
    return x;
  };
  AP.floorAt = function (t) {
    var y = this.floor0;
    for (var i = 0; i < this.jumps.length; i++) { var j = this.jumps[i]; if (t >= j.t1) y = j.y1; }
    return y;
  };
  AP.yAt = function (t) {
    for (var i = 0; i < this.jumps.length; i++) {
      var j = this.jumps[i];
      if (t >= j.t0 && t < j.t1) {
        var p = (t - j.t0) / (j.t1 - j.t0), yc = Math.min(j.y0, j.y1) - 2 * j.h;
        return (1 - p) * (1 - p) * j.y0 + 2 * p * (1 - p) * yc + p * p * j.y1;
      }
    }
    return this.floorAt(t);
  };
  AP._addMove = function (x, at, dur, run, sort) {
    at = Math.max(0, num(at, 0));
    var x0 = this.xAt(at), x1 = num(x, x0);
    var d = dur != null && isFinite(+dur) ? Math.max(0.05, +dur) : Math.max(0.1, Math.abs(x1 - x0) / (run ? 110 : 55));
    this.moves.push({ t0: at, t1: at + d, x0: x0, x1: x1, run: !!run, jump: !!sort });
    this.moves.sort(function (a, b) { return a.t0 - b.t0; });
    return this;
  };
  AP.walkTo = function (x, at, dur) { return this._addMove(x, at, dur, false); };
  AP.runTo = function (x, at, dur) { return this._addMove(x, at, dur, true); };
  AP.jump = function (at, o) {
    o = T(o); at = Math.max(0, num(at, 0));
    var dur = Math.max(0.15, num(o.dur, 0.55)), y0 = this.floorAt(at), y1 = o.to != null ? num(o.to, y0) : y0;
    this.jumps.push({ t0: at, t1: at + dur, h: num(o.h, 20), y0: y0, y1: y1 });
    this.jumps.sort(function (a, b) { return a.t0 - b.t0; });
    if (o.dx) this._addMove(this.xAt(at) + num(o.dx, 0), at, dur, false, true);
    return this;
  };
  AP.cheer = function (at, dur) { this.cheers.push({ t0: num(at, 0), t1: num(at, 0) + num(dur, 1.2) }); return this; };
  AP.hurt = function (at, dur) { this.hurts.push({ t0: num(at, 0), t1: num(at, 0) + num(dur, 0.6) }); return this; };
  AP.pose = function (name, t0, t1) { this.poses.push({ name: POSE[name] ? name : "idle0", t0: num(t0, 0), t1: t1 == null ? Infinity : num(t1, Infinity) }); return this; };
  AP.face = function (dir, t) { this.faces.push({ t: num(t, 0), dir: dir === -1 || dir === "left" ? -1 : 1 }); this.faces.sort(function (a, b) { return a.t - b.t; }); return this; };
  AP.talk = function (t0, t1) { this.talks.push({ t0: num(t0, 0), t1: t1 == null ? Infinity : num(t1, Infinity) }); return this; };
  AP.hide = function (t) { this.vis.push({ t: num(t, 0), show: false }); this.vis.sort(function (a, b) { return a.t - b.t; }); return this; };
  AP.show = function (t) { this.vis.push({ t: num(t, 0), show: true }); this.vis.sort(function (a, b) { return a.t - b.t; }); return this; };
  AP.visibleAt = function (t) {
    var v = !this.hideAt0, since = -1;
    for (var i = 0; i < this.vis.length; i++) if (t >= this.vis[i].t) { v = this.vis[i].show; since = this.vis[i].t; }
    return { v: v, since: since };
  };
  AP.faceAt = function (t) {
    var dir = this.face0, best = -1;
    for (var i = 0; i < this.moves.length; i++) { var m = this.moves[i]; if (t >= m.t0 && m.t0 >= best && m.x1 !== m.x0) { dir = m.x1 > m.x0 ? 1 : -1; best = m.t0; } }
    for (i = 0; i < this.faces.length; i++) if (t >= this.faces[i].t && this.faces[i].t >= best) { dir = this.faces[i].dir; best = this.faces[i].t; }
    return dir;
  };
  function inRange(list, t) { for (var i = list.length - 1; i >= 0; i--) if (t >= list[i].t0 && t < list[i].t1) return list[i]; return null; }
  AP.state = function (t) {
    var pose = null, explicit = null;
    for (var i = this.poses.length - 1; i >= 0; i--) if (t >= this.poses[i].t0 && t < this.poses[i].t1) { explicit = this.poses[i].name; break; }
    var jmp = null;
    for (i = 0; i < this.jumps.length; i++) if (t >= this.jumps[i].t0 && t < this.jumps[i].t1) jmp = this.jumps[i];
    var mv = null;
    for (i = 0; i < this.moves.length; i++) if (!this.moves[i].jump && t >= this.moves[i].t0 && t < this.moves[i].t1 && this.moves[i].x1 !== this.moves[i].x0) mv = this.moves[i];
    var hurt = inRange(this.hurts, t), cheer = inRange(this.cheers, t), talk = inRange(this.talks, t);
    if (hurt) pose = "hurt";
    else if (explicit) pose = explicit;
    else if (jmp) pose = "jump";
    else if (mv) pose = (mv.run ? "run" : "walk") + (Math.floor((t - mv.t0) * (mv.run ? 12 : 8)) % 4);
    else if (cheer) pose = "cheer" + (Math.floor((t - cheer.t0) * 4) % 2);
    else if (talk && speakingAt(t)) pose = Math.floor((t - talk.t0) * 1.6) % 3 === 2 ? "idle0" : "talk";
    else pose = "idle" + (Math.floor(t * 2 + this.x0 * 0.01) % 2);
    var mouth = !!(talk && speakingAt(t) && Math.floor(t * 9) % 2 === 0);
    var blink = ((t + (strHash(this.id) % 100) / 33) % 3.1) < 0.12;
    return { pose: pose, mouth: mouth, blink: blink, hurt: hurt, jmp: jmp, cheer: cheer };
  };
  AP.draw = function (ctx, t, cam) {
    var vis = this.visibleAt(t);
    if (!vis.v) return;
    if (vis.since >= 0 && t - vis.since < 0.5 && Math.floor((t - vis.since) * 14) % 2) return;
    var st = this.state(t);
    if (st.hurt && Math.floor((t - st.hurt.t0) * 14) % 2 === 1) return;
    var x = this.xAt(t), y = this.yAt(t), face = this.faceAt(t), sc = this.scale;
    if (this.id === "bolt") y -= 3 + R(Math.sin(t * 4 + this.x0) * 1.5);
    var cheerHop = st.cheer && !st.jmp ? (Math.floor((t - st.cheer.t0) * 4) % 2 ? -2 : 0) : 0;
    y += cheerHop;
    var f = Math.floor(t * 6) % 2;
    var spr = castSprite(this.id, st.pose, st.mouth, st.blink, f);
    var sx = R(x - cam), sy = R(y);
    if (this.shadow) {
      var fl = this.floorAt(t), hgt = clamp((fl - this.yAt(t)) / 40, 0, 1);
      ctx.fillStyle = "rgba(10,7,20,0.32)";
      var sw = R((10 - hgt * 4) * sc);
      ctx.fillRect(sx - sw, R(fl) - 1, sw * 2, 2);
    }
    if (face < 0) { ctx.save(); ctx.translate(sx, 0); ctx.scale(-1, 1); ctx.drawImage(spr, -SPR_CX * sc, sy - SPR_FY * sc, SPR_W * sc, SPR_H * sc); ctx.restore(); }
    else ctx.drawImage(spr, sx - SPR_CX * sc, sy - SPR_FY * sc, SPR_W * sc, SPR_H * sc);
    var top = this.id === "orla" ? 31 : this.id === "bolt" ? 26 : 26;
    rec("actor", this.id, sx - 8 * sc, sy - top * sc, 16 * sc, top * sc, this.g.camMoving);
  };
  AP.headY = function (t) { return this.yAt(t) - (this.id === "orla" ? 31 : 26) * this.scale - (this.id === "bolt" ? 3 : 0); };
  GP.actor = function (id, o) { return new Actor(this, id, o); };
  GP.actorById = function (id) { for (var i = 0; i < this.actors.length; i++) if (this.actors[i].id === id) return this.actors[i]; return null; };

  // --- items, enemies ---
  GP.item = function (icon, o) {
    o = T(o);
    var g = this, name = ITEM_MAPS[icon] ? icon : iconOf(icon, o.label, 0);
    var x = num(o.x, 100), y = num(o.y, g.groundY - 30), at = o.at != null && isFinite(+o.at) ? +o.at : Infinity, appear = num(o.appear, 0);
    var value = o.value == null ? 100 : num(o.value, 0), label = str(o.label);
    if (isFinite(at)) {
      if (value) { g.score(at, value); g.popup("+" + value, x, y - 10, at); }
      g.sparkle(x, y, at);
      if (o.toast !== false && label) g.toast(label, at, { icon: name, title: o.title || "ITEM GET!" });
    }
    var ic = itemCanvas(name), seed = strHash(name + x);
    g._ent(40, false, function (ctx, t, cam) {
      if (t < appear) return;
      var sx = R(x - cam);
      if (t < at) {
        var bob = R(Math.sin(t * 4 + seed) * 1.5);
        if (sx < -20 || sx > LW + 20) return;
        ctx.drawImage(ic, sx - (ic.width >> 1), R(y) - (ic.height >> 1) + bob);
        if (((t + (seed % 7) * 0.2) % 1.6) < 0.12) { rect(ctx, sx + 2, R(y) - 4 + bob, 1, 1, PAL.white); rect(ctx, sx + 1, R(y) - 3 + bob, 3, 1, PAL.white); rect(ctx, sx + 2, R(y) - 2 + bob, 1, 1, PAL.white); }
        if (sx >= g.safe.x0 && sx <= g.safe.x1) rec("item", label || name, sx - ic.width / 2, y - ic.height / 2, ic.width, ic.height, g.camMoving);
      } else if (t < at + 0.3) {
        var p = (t - at) / 0.3;
        if (Math.floor(p * 8) % 2 === 0) ctx.drawImage(ic, sx - (ic.width >> 1), R(y - 14 * outBack(p)) - (ic.height >> 1));
      }
    });
    return { x: x, y: y, at: at, icon: name };
  };
  GP.enemy = function (type, o) {
    o = T(o);
    var g = this; type = ENEMY_IDS.indexOf(type) >= 0 ? type : "slime";
    var x = num(o.x, 160), y = num(o.y, g.groundY), appear = num(o.appear, 0);
    var defeat = o.defeat != null && isFinite(+o.defeat) ? +o.defeat : null;
    var patrol = num(o.patrol, 0), label = str(o.label), labelAt = num(o.labelAt, appear), tint = o.tint || "";
    var flying = type === "bat" || type === "ghost";
    function ex(t) { if (!patrol) return x; var tt = Math.min(t, defeat == null ? t : defeat), per = Math.max(1, (patrol * 4) / 20), ph = (tt % per) / per; return x + patrol * (ph < 0.5 ? ph * 4 - 1 : 3 - ph * 4); }
    function ey(t) { return y - (flying ? 10 + R(Math.sin(t * 3 + x) * 3) : 0); }
    if (defeat != null) {
      if (o.value !== 0) { g.score(defeat, o.value == null ? 200 : num(o.value, 200)); g.popup("+" + (o.value == null ? 200 : o.value), ex(defeat), ey(defeat) - 18, defeat); }
      g.burst(ex(defeat), ey(defeat) - 5, defeat, { n: 10, colors: [PAL.white, PAL.lightgrey, PAL.yellow], speed: 50, life: 0.45, gravity: 60 });
    }
    g._ent(45, false, function (ctx, t, cam) {
      if (t < appear) return;
      var f = Math.floor(t * 4) % 2, cx = ex(t), cy = ey(t), sx = R(cx - cam);
      if (sx < -24 || sx > LW + 24) return;
      var dir = patrol ? (Math.cos(((t % 2) / 2) * 2 * PI) > 0 ? 1 : -1) : -1;
      var c = enemyCanvas(type, f, tint);
      if (defeat != null && t >= defeat) {
        if (t < defeat + 0.35) { var sq = enemyCanvas(type, 0, tint); ctx.drawImage(sq, sx - (sq.width >> 1), R(cy) - (sq.height >> 2) - 2, sq.width, sq.height >> 1); }
        return;
      }
      if (dir > 0) { ctx.save(); ctx.translate(sx, 0); ctx.scale(-1, 1); ctx.drawImage(c, -(c.width >> 1), R(cy) - c.height + 2); ctx.restore(); }
      else ctx.drawImage(c, sx - (c.width >> 1), R(cy) - c.height + 2);
      if (label && t >= labelAt) drawTag(ctx, up(label), sx, R(cy) - c.height - 2, "red");
      if (sx >= g.safe.x0 && sx <= g.safe.x1) rec("enemy", type, sx - 8, cy - 16, 16, 16, g.camMoving);
    });
    return { x: x, y: y, defeat: defeat };
  };
  function drawTag(ctx, s, cx, bottom, style) {
    var w = measure(s) + 6, h = 11, x = R(cx - w / 2), y = R(bottom - h);
    x = clamp(x, 1, LW - w - 1);
    var st = wstyle(style);
    rect(ctx, x, y, w, h, st.edge); rect(ctx, x + 1, y + 1, w - 2, h - 2, st.bg[0]); rect(ctx, x + 1, y + h - 2, w - 2, 1, st.bg[1]);
    text(ctx, s, x + 3, y + 2, { color: PAL.white });
    rec("label", s, x, y, w, h);
  }

  // --- particles and juice ---
  GP.burst = function (x, y, at, o) {
    o = T(o);
    var g = this, n = clamp(num(o.n, 12), 1, 80), speed = num(o.speed, 60), life = num(o.life, 0.6), grav = num(o.gravity, 120);
    var colors = arr(o.colors).length ? o.colors.map(function (c) { return col(c); }) : [PAL.yellow, PAL.orange, PAL.white];
    var screen = !!o.screen, seed = PSEED++;
    at = num(at, 0);
    var parts = [];
    for (var i = 0; i < n; i++) {
      var a = (i / n) * 2 * PI + (hash(seed, i) - 0.5) * 0.8, sp = speed * (0.45 + hash(seed, i + 100) * 0.55);
      parts.push({ vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - speed * 0.3, life: life * (0.6 + hash(seed, i + 200) * 0.4), c: colors[i % colors.length], s: hash(seed, i + 300) > 0.6 ? 2 : 1 });
    }
    g._ent(screen ? 160 : 60, screen, function (ctx, t, cam) {
      if (t < at || t > at + life) return;
      var dt = t - at, ox = screen ? 0 : cam;
      parts.forEach(function (p) {
        if (dt > p.life) return;
        rect(ctx, R(x + p.vx * dt - ox), R(y + p.vy * dt + 0.5 * grav * dt * dt), p.s, p.s, p.c);
      });
    });
    return g;
  };
  GP.explode = function (x, y, at, o) {
    o = T(o); at = num(at, 0);
    var g = this, big = !!o.big;
    g.burst(x, y, at, { n: big ? 28 : 16, colors: [PAL.white, PAL.yellow, PAL.orange, PAL.red], speed: big ? 90 : 60, life: big ? 0.8 : 0.55, gravity: 40, screen: o.screen });
    if (big) {
      g.burst(x - 10, y + 4, at + 0.15, { n: 14, colors: [PAL.yellow, PAL.orange, PAL.white], speed: 60, life: 0.6, gravity: 30, screen: o.screen });
      g.burst(x + 10, y - 6, at + 0.3, { n: 14, colors: [PAL.orange, PAL.red, PAL.white], speed: 60, life: 0.6, gravity: 30, screen: o.screen });
      g.shake(at, 4, 0.6); g.flash(at, "white", 0.18);
    }
    g._ent(o.screen ? 159 : 59, !!o.screen, function (ctx, t, cam) {
      if (t < at || t > at + 0.35) return;
      var p = (t - at) / 0.35, ox = o.screen ? 0 : cam;
      ring(ctx, x - ox, y, 3 + p * (big ? 26 : 14), p < 0.5 ? PAL.white : PAL.yellow);
      if (p < 0.4) ellipse(ctx, x - ox, y, (big ? 8 : 5) * (1 - p), (big ? 8 : 5) * (1 - p), PAL.white);
      for (var k = 0; k < 4; k++) { var a = k * 1.7 + 0.4, d = p * (big ? 18 : 10); dither(ctx, x - ox + Math.cos(a) * d - 2, y - p * 8 + Math.sin(a) * d - 2, 5, 5, PAL.lightgrey, 0.6 * (1 - p)); }
    });
    return g;
  };
  GP.sparkle = function (x, y, at, o) {
    o = T(o); at = num(at, 0);
    var g = this, screen = !!o.screen, seed = PSEED++;
    g._ent(screen ? 161 : 61, screen, function (ctx, t, cam) {
      if (t < at || t > at + 0.6) return;
      var ox = screen ? 0 : cam;
      for (var k = 0; k < 4; k++) {
        var tk = at + k * 0.08, p = (t - tk) / 0.35;
        if (p < 0 || p > 1) continue;
        var a = hash(seed, k) * 2 * PI, d = 6 + p * 6, sx = R(x - ox + Math.cos(a) * d), sy = R(y + Math.sin(a) * d), r = p < 0.5 ? 2 : 1;
        rect(ctx, sx - r, sy, r * 2 + 1, 1, PAL.white); rect(ctx, sx, sy - r, 1, r * 2 + 1, PAL.white); rect(ctx, sx, sy, 1, 1, PAL.yellow);
      }
    });
    return g;
  };
  GP.popup = function (s, x, y, at, o) {
    o = T(o); at = num(at, 0);
    var g = this, screen = !!o.screen, c = col(o.color, PAL.yellow), dur = num(o.dur, 0.85);
    g._ent(screen ? 162 : 62, screen, function (ctx, t, cam) {
      if (t < at || t > at + dur) return;
      var p = (t - at) / dur, ox = screen ? 0 : cam;
      text(ctx, String(s), R(x - ox), R(y - 12 * outBack(Math.min(1, p * 1.6))), { align: "center", outline: true, color: c, scale: o.scale || 1 });
    });
    return g;
  };
  GP.shake = function (at, power, dur) { this.shakes.push({ at: num(at, 0), power: num(power, 2), dur: Math.max(0.05, num(dur, 0.3)) }); return this; };
  GP.flash = function (at, color, dur) { this.flashes.push({ at: num(at, 0), color: col(color, PAL.white), dur: Math.max(0.04, num(dur, 0.15)) }); return this; };
  GP.score = function (at, value) { this.scoreEv.push({ at: num(at, 0), v: num(value, 0) }); return this; };
  GP.loseHeart = function (at) { this.heartEv.push({ at: num(at, 0), v: -1 }); return this; };
  GP.gainHeart = function (at) { this.heartEv.push({ at: num(at, 0), v: 1 }); return this; };
  GP.draw = function (fn, z) { if (typeof fn === "function") this._ent(num(z, 55), false, function (ctx, t, cam) { fn(ctx, t, cam); }); return this; };
  GP.overlay = function (fn, z) { if (typeof fn === "function") this._ent(num(z, 130), true, function (ctx, t) { fn(ctx, t); }); return this; };

  // --- UI: label, window, toast, banner ---
  GP.label = function (s, x, y, o) {
    o = T(o);
    var at = num(o.at, 0), until = o.until == null ? Infinity : num(o.until, Infinity), sc = o.scale || 1;
    var g = this;
    g._ent(num(o.z, 135), true, function (ctx, t) {
      if (t < at || t >= until) return;
      var n = o.type ? Math.floor((t - at) * (o.cps || 30)) : null;
      var r = text(ctx, s, x, y, { color: o.color || PAL.white, scale: sc, align: o.align, outline: o.outline === false ? null : o.outline || true, n: n, wave: o.wave ? t : null, shadow: o.shadow });
      var lx = o.align === "center" ? x - r.w / 2 : o.align === "right" ? x - r.w : x;
      rec("label", s, lx, y, r.w, r.h);
    });
    return g;
  };
  GP.window = function (x, y, w, h, o) {
    o = T(o);
    var g = this, at = num(o.at, 0), until = o.until == null ? Infinity : num(o.until, Infinity);
    var title = str(o.title), txt = o.text != null ? String(o.text) : "", style = o.style || "blue";
    var st = wstyle(style), tlines = null;
    g._ent(num(o.z, 100), true, function (ctx, t) {
      if (t < at || t >= until) return;
      var open = Math.min(prog(t, at, 0.18), until < Infinity ? 1 - prog(t, until - 0.15, 0.15) : 1);
      var box = windowBox(ctx, x, y, w, h, { style: style, open: open });
      rec("window", title || txt.slice(0, 20) || "window", x, y, w, h);
      if (!box) return;
      var cy = box.y;
      if (title) {
        var tw = measure(up(title)) + 8, tx = R(x + 6);
        windowBox(ctx, tx, R(y - 6), tw, 13, { style: style === "paper" ? "gold" : "dark", shadow: false });
        text(ctx, up(title), tx + 4, R(y - 3), { color: st.title === "#a02c1c" ? PAL.yellow : st.title });
        cy += 4;
      }
      if (txt) {
        if (!tlines) tlines = wrap(txt, box.w, 1);
        text(ctx, tlines.join("\n"), box.x, cy, { color: st.text, n: o.type ? Math.floor((t - at - 0.2) * (o.cps || 35)) : null });
      }
      if (typeof o.draw === "function") o.draw(ctx, t, box.x, cy, box.w, box.h - (cy - box.y));
    });
    return g;
  };
  GP.toast = function (label, at, o) {
    o = T(o); at = num(at, 0);
    var g = this, dur = num(o.dur, 2.2), title = o.title == null ? "" : up(o.title), lab = str(label), icon = o.icon && ITEM_MAPS[o.icon] ? o.icon : null;
    var pos = o.pos === "bottom" ? "bottom" : "top", style = o.style || "blue", sa = g.safe;
    var maxTxt = sa.w - (icon ? 18 : 0) - 12, lines = wrap(lab, maxTxt, 1).slice(0, 2);
    var tw = Math.max(title ? measure(title) : 0, measure(lines.join("\n")));
    var w = Math.min(sa.w, tw + (icon ? 18 : 0) + 12), h = 10 + (title ? 11 : 0) + lines.length * 11 - 2;
    g._ent(150, true, function (ctx, t) {
      if (t < at || t > at + dur) return;
      var pin = outBack(prog(t, at, 0.22)), pout = prog(t, at + dur - 0.18, 0.18);
      var baseY = pos === "top" ? sa.y0 + g.hudHeight() + 3 : sa.y1 - h;
      var off = pos === "top" ? -(h + baseY + 4) : LH - baseY + 4;
      var y = R(baseY + off * (1 - pin) + off * smooth(pout)), x = R(sa.cx - w / 2);
      windowBox(ctx, x, y, w, h, { style: style });
      var tx = x + 6;
      if (icon) { var ic = itemCanvas(icon); ctx.drawImage(ic, x + 5, R(y + h / 2 - ic.height / 2)); tx += 16; }
      var ty = y + 5;
      if (title) { text(ctx, title, tx, ty, { color: PAL.yellow }); ty += 11; }
      text(ctx, lines.join("\n"), tx, ty, { color: PAL.white });
      rec("toast", lab, x, y, w, h, pin < 1 || pout > 0);
    });
    return g;
  };
  GP.banner = function (s, at, o) {
    o = T(o); at = num(at, 0);
    var g = this, sa = g.safe, dur = o.dur == null ? Infinity : num(o.dur, Infinity);
    var want = o.scale || 2, f = fitText(up(s), sa.w, 2, want >= 3 ? [3, 2, 1] : want === 2 ? [2, 1] : [1]);
    var bh = textH(f.lines.length, f.scale), cy = o.y != null ? num(o.y, sa.cy) : sa.y0 + g.hudHeight() + 6 + bh / 2;
    var cx = o.x != null ? num(o.x, sa.cx) : sa.cx;
    var colr = o.color ? col(o.color) : null;
    g._ent(170, true, function (ctx, t) {
      if (t < at || t >= at + dur) return;
      var p = prog(t, at, 0.5), dy = -(1 - outBounce(p)) * (cy + bh);
      var y = R(cy - bh / 2 + dy);
      text(ctx, f.lines.join("\n"), cx, y, { align: "center", scale: f.scale, outline: true, color: colr || [PAL.yellow, PAL.orange], depth: 1, depthColor: PAL.darkred, wave: t - at, waveAmp: 1 });
      rec("banner", s, cx - measure(f.lines.join("\n"), f.scale) / 2, y, measure(f.lines.join("\n"), f.scale), bh, p < 1);
    });
    return { lines: f.lines, scale: f.scale, h: bh, w: measure(f.lines.join("\n"), f.scale) };
  };

  // --- dialogue ---
  GP.dialog = function (lines, o) {
    o = T(o);
    var g = this, sa = g.safe;
    var style = o.style || "blue";
    var x = sa.x0, w = sa.w;
    var portW = 34, textX = x + 5 + portW + 4, textW = w - 10 - portW - 4;
    // height: o.h, else just enough for the longest line (portrait 32 px minimum, 4 or 7 lines maximum)
    var need = 1;
    arr(lines).forEach(function (ln) { if (ln && str(ln.text)) need = Math.max(need, wrap(str(ln.text), textW, 1).length); });
    var maxRows = PORTRAIT ? 7 : 4;
    var h = o.h != null ? num(o.h, 50) : Math.max(46, 14 + Math.min(maxRows, need) * 11);
    var y = o.y != null ? num(o.y, sa.y1 - h) : o.bottom != null ? num(o.bottom, sa.y1) - h : sa.y1 - h;
    var maxLines = Math.max(1, Math.floor((h - 10 + 4) / 11));
    var prev = num(o.after, 0);
    var L = arr(lines).filter(function (ln) { return ln && str(ln.text); }).map(function (ln) {
      var who = castOf(ln.who || ln.speaker, "orla"), clock = alignText(str(ln.text), ln.at != null ? num(ln.at, prev) : prev, ln.at != null ? num(ln.at, prev) : null, ln.end != null ? num(ln.end, null) : null);
      prev = clock.t1 + 0.05;
      var wrapped = wrap(str(ln.text), textW, 1), pages = [];
      for (var i = 0; i < wrapped.length; i += maxLines) pages.push(wrapped.slice(i, i + maxLines));
      var pageStart = [], c = 0;
      pages.forEach(function (pg) { pageStart.push(c); pg.forEach(function (l) { c += visibleLen(l) + 1; }); });
      return { who: who, name: str(ln.name) || CAST[who].name, text: str(ln.text), clock: clock, pages: pages, pageStart: pageStart };
    });
    if (!L.length) return { lines: [], y: y, h: h };
    // shown from the first line until the next line (the last one stays)
    L.forEach(function (ln, i) { ln.show = i === 0 ? Math.max(0, ln.clock.t0 - 0.25) : ln.clock.t0 - 0.05; });
    L.forEach(function (ln, i) { ln.hideAt = i < L.length - 1 ? L[i + 1].show : Infinity; var a = g.actorById(ln.who); if (a) a.talk(ln.clock.t0, Math.min(ln.hideAt, ln.clock.t1 + 0.1)); });
    var t0 = L[0].show, until = o.until == null ? Infinity : num(o.until, Infinity);
    g._ent(num(o.z, 140), true, function (ctx, t) {
      if (t < t0 || t >= until) return;
      var open = prog(t, t0, 0.16);
      var ln = null;
      for (var i = 0; i < L.length; i++) if (t >= L[i].show) ln = L[i];
      if (!ln) ln = L[0];
      var box = windowBox(ctx, x, y, w, h, { style: style, open: open });
      rec("dialog", ln.text.slice(0, 30), x, y - 7, w, h + 7);
      if (!box) return;
      // name plate
      var nm = up(ln.name), nw = measure(nm) + 8;
      windowBox(ctx, x + 4, y - 7, nw, 13, { style: "dark", shadow: false });
      text(ctx, nm, x + 8, y - 4, { color: PAL.yellow });
      // portrait
      var talking = ln.clock.speaking(t) && Math.floor(t * 9) % 2 === 0;
      var px = box.x, py = box.y + 4;
      rect(ctx, px - 1, py - 1, 34, 34, PAL.ink); gradient(ctx, px, py, 32, 32, ["#5a78d8", "#2a3c8c"]);
      ctx.drawImage(portrait(ln.who, { talking: talking }), px, py, 32, 32);
      // typed text, paged
      var n = ln.clock.n(t), page = 0;
      for (var pgi = 0; pgi < ln.pages.length; pgi++) if (n > ln.pageStart[pgi] + (pgi ? 0 : -1)) page = pgi;
      var shown = clamp(n - ln.pageStart[page], 0, 9999);
      text(ctx, ln.pages[page].join("\n"), textX, box.y + 4, { color: PAL.white, n: shown });
      var pageLen = 0; ln.pages[page].forEach(function (l) { pageLen += visibleLen(l) + 1; });
      var more = page < ln.pages.length - 1 || L.indexOf(ln) < L.length - 1;
      if (shown >= pageLen - 1 && more && Math.floor(t * 3) % 2 === 0) { var mkx = x + w - 11, mky = y + h - 9; rect(ctx, mkx, mky, 5, 1, PAL.yellow); rect(ctx, mkx + 1, mky + 1, 3, 1, PAL.yellow); rect(ctx, mkx + 2, mky + 2, 1, 1, PAL.yellow); }
    });
    return { lines: L, y: y, h: h, t0: t0, t1: L[L.length - 1].clock.t1 };
  };
  GP.narrate = function (o) {
    o = T(o);
    var sentences = String(V.narration || "").split(/(?<=[.!?])\s+/).map(str).filter(Boolean);
    if (!sentences.length) sentences = ["..."];
    var who = castOf(o.who, "orla");
    return this.dialog(sentences.map(function (s) { return { who: who, text: s }; }), o);
  };

  // ------------------------- templates -------------------------
  var TPL = {};
  function heroOf(p, d) { return castOf(p.hero, d || "kit"); }
  // Height of a dialogue box that fits the longest of these texts (same rule as g.dialog).
  function dlgHeight(texts) {
    var sa = safe(), textW = sa.w - 10 - 38, need = 1;
    texts.forEach(function (t) { if (str(t)) need = Math.max(need, wrap(str(t), textW, 1).length); });
    return Math.max(46, 14 + Math.min(PORTRAIT ? 7 : 4, need) * 11);
  }
  function wName(w) { return WORLDS[w].name; }

  TPL["title-screen"] = function (root, p) {
    var world = worldOf(p.world, "grassland");
    var g = S.game(root, { world: world, intro: "iris", groundY: R(LH * (PORTRAIT ? 0.66 : 0.82)) });
    var sa = g.safe;
    var title = up(p.title) || "PIXEL QUEST", sub = str(p.subtitle), prompt = up(p.prompt) || "PRESS START", foot = str(p.footer);
    var heroId = heroOf(p), compId = castOf(p.companion, heroId === "bolt" ? "kit" : "bolt");
    if (compId === heroId) compId = heroId === "bolt" ? "kit" : "bolt";
    var speed = 26;
    g.camFn = function (t) { return t * speed; };
    var hx = R(LW * (PORTRAIT ? 0.5 : 0.34));
    var hero = g.actor(heroId, { x: hx });
    var comp = g.actor(compId, { x: hx - 24 });
    hero.walkTo(hx + speed * D, 0, D);
    comp.walkTo(hx - 24 + speed * D, 0, D);
    // logo
    var f = fitText(title, sa.w - 6, PORTRAIT ? 3 : 2, [3, 2, 1]);
    var lh = textH(f.lines.length, f.scale);
    var subLines = sub ? wrap(sub, sa.w - 30, 1).slice(0, 2) : [];
    var subH = subLines.length ? subLines.length * 11 + 8 : 0;
    var promptY, logoY;
    var block = lh + f.scale * 2 + (subH ? 8 + subH : 0) + 12 + 7;
    var top = sa.y0 + 4 + Math.max(0, R(((g.groundY - 34) - sa.y0 - block) / 2));
    if (PORTRAIT) top = sa.y0 + 10 + Math.max(0, R(((g.groundY - 40) - sa.y0 - 10 - block) / 2));
    logoY = top;
    var subY = logoY + lh + f.scale * 2 + 8;
    promptY = subY + (subH ? subH + 10 : 4);
    var words = prompt.split(/\s+/), lastWord = words[words.length - 1];
    var tP = kwFind(lastWord, 0.5);
    if (tP == null || tP > D - 1.0) tP = clamp(D * 0.7, 1.2, D - 1.0);
    tP = clamp(tP, 0.9, D - 0.9);
    var tLogo = 0.1, tSub = Math.min(0.9, tP - 0.4), tPrompt = Math.min(1.3, tP - 0.3);
    g._ent(150, true, function (ctx, t) {
      if (t < tLogo) return;
      var pp = prog(t, tLogo, 0.6), dy = -(1 - outBounce(pp)) * (logoY + lh + 10);
      var bump = t >= tP && t < tP + 0.25 ? -R(Math.sin(prog(t, tP, 0.25) * PI) * 3) : 0;
      text(ctx, f.lines.join("\n"), sa.cx, R(logoY + dy + bump), { align: "center", scale: f.scale, outline: true, color: [PAL.yellow, PAL.orange], depth: 1, depthColor: PAL.darkred, wave: pp >= 1 ? t : null, waveAmp: 0.6 });
      rec("logo", title, sa.cx - measure(f.lines.join("\n"), f.scale) / 2, logoY + dy, measure(f.lines.join("\n"), f.scale), lh + f.scale * 3, pp < 1);
    });
    if (subLines.length) {
      g._ent(151, true, function (ctx, t) {
        if (t < tSub) return;
        var pp = smooth(prog(t, tSub, 0.3)), sw = Math.max.apply(null, subLines.map(function (l) { return measure(l); })) + 16;
        var w = R(sw * pp), x = R(sa.cx - w / 2), h = subH;
        if (w < 4) return;
        rect(ctx, x - 6, subY + 3, 8, h - 2, PAL.darkred); rect(ctx, x + w - 2, subY + 3, 8, h - 2, PAL.darkred);
        rect(ctx, x - 8, subY + 3, 2, 2, PAL.ink);
        rect(ctx, x, subY, w, h, PAL.ink); rect(ctx, x + 1, subY + 1, w - 2, h - 2, PAL.red); rect(ctx, x + 1, subY + h - 3, w - 2, 2, PAL.darkred); rect(ctx, x + 1, subY + 1, w - 2, 1, PAL.pink);
        if (pp >= 1) text(ctx, subLines.join("\n"), sa.cx, subY + 4, { align: "center", color: PAL.white });
        rec("subtitle", sub, x - 8, subY, w + 16, h);
      });
    }
    g._ent(152, true, function (ctx, t) {
      if (t < tPrompt) return;
      var pressed = t >= tP;
      if (!pressed && Math.floor((t - tPrompt) * 2.5) % 2 === 1) return;
      if (pressed && t < tP + 0.5 && Math.floor((t - tP) * 16) % 2 === 1) return;
      var pw = measure(prompt);
      if (pressed) { windowBox(ctx, sa.cx - pw / 2 - 7, promptY - 4, pw + 14, 15, { style: "gold", shadow: false }); }
      text(ctx, prompt, sa.cx, promptY, { align: "center", outline: true, color: pressed ? PAL.yellow : PAL.white });
      rec("prompt", prompt, sa.cx - pw / 2 - 7, promptY - 4, pw + 14, 15);
    });
    g.flash(tP, "white", 0.16);
    g.sparkle(sa.cx - measure(prompt) / 2 - 6, promptY + 3, tP, { screen: true });
    g.sparkle(sa.cx + measure(prompt) / 2 + 6, promptY + 3, tP + 0.05, { screen: true });
    hero.jump(tP + 0.02, { h: 16, dur: 0.5 });
    comp.jump(tP + 0.14, { h: 12, dur: 0.45 });
    hero.cheer(tP + 0.55, D);
    if (foot) g.label(foot, sa.cx, Math.min(sa.y1 - 8, g.groundY + 8), { align: "center", color: PAL.white, at: 0.3 });
    return g;
  };

  TPL["level-walk"] = function (root, p) {
    var world = worldOf(p.world, "grassland");
    var sa0 = safe();
    var g = S.game(root, { world: world, intro: "iris", groundY: PORTRAIT ? sa0.y1 - 16 : undefined });
    var sa = g.safe, gy = g.groundY;
    var items = arr(p.items).filter(function (it) { return it && (str(it.label) || it.icon); }).slice(0, 6);
    if (!items.length) items = [{ label: "Power up", icon: "star" }];
    var n = items.length;
    g.hud({ level: str(p.level) || wName(world) });
    var times = landTimes(items.map(function (it) { return { label: it.label, keyword: it.keyword }; }), { first: 0.9, tail: 1.8, gap: 0.45 });
    var tLast = times[n - 1], tClear = Math.min(tLast + 1.1, D - 1.0);
    var v = 36, t0w = 0.15, hx0 = 36;
    function hxAt(t) { return hx0 + v * (clamp(t, t0w, tClear) - t0w); }
    var hero = g.actor(heroOf(p), { x: hx0 });
    hero.walkTo(hxAt(tClear), t0w, tClear - t0w);
    var comp = null, compId = p.companion ? castOf(p.companion, null) : null;
    if (compId && compId !== hero.id) { comp = g.actor(compId, { x: hx0 - 22, z: 49 }); comp.walkTo(hxAt(tClear) - 22, t0w, tClear - t0w); }
    g.follow(hero, { at: 0.34, min: 0 });
    // a jump for each grab (no jump when the previous one has not landed yet)
    var lastJumpEnd = -1, jumpDur = 0.44;
    var grabs = items.map(function (it, i) {
      var ti = times[i], canJump = ti - jumpDur / 2 > lastJumpEnd + 0.04;
      if (canJump) { hero.jump(ti - jumpDur / 2, { h: 15, dur: jumpDur }); lastJumpEnd = ti + jumpDur / 2; }
      var icon = iconOf(it.icon, it.label, i);
      return { label: up(it.label) || up(icon), icon: icon, t: ti, x: hxAt(ti) + 3, y: canJump ? gy - 36 : gy - 14 };
    });
    // one enemy, stomped in the biggest free gap
    var evs = [t0w + 0.6].concat(times).concat([tClear]), best = -1, bestGap = 0;
    for (var i = 0; i < evs.length - 1; i++) { var gp = evs[i + 1] - evs[i]; if (gp > bestGap) { bestGap = gp; best = i; } }
    if (bestGap >= 1.4) {
      var tm = (evs[best] + evs[best + 1]) / 2, etype = ENEMY_IDS.indexOf(p.enemy) >= 0 ? p.enemy : WORLDS[world].enemy;
      hero.jump(tm - 0.25, { h: 12, dur: 0.5 });
      g.enemy(etype, { x: hxAt(tm) + 3, defeat: tm + 0.02 });
      g.shake(tm, 1, 0.15);
    }
    grabs.forEach(function (gr) { g.item(gr.icon, { x: gr.x, y: gr.y, at: gr.t, label: gr.label, toast: false }); g.popup("ITEM GET!", gr.x, gr.y - 30, gr.t + 0.05, { color: PAL.white }); });
    // goal flag
    var flagX = hxAt(tClear) + 14, goal = up(p.goal) || "STAGE CLEAR!";
    g.draw(function (ctx, t, cam) {
      var sx = R(flagX - cam);
      if (sx < -20 || sx > LW + 20) return;
      rect(ctx, sx, gy - 44, 2, 44, PAL.lightgrey); rect(ctx, sx - 1, gy - 47, 4, 3, PAL.yellow); rect(ctx, sx - 2, gy - 2, 6, 2, PAL.darkgrey);
      var fp = prog(t, tClear, 0.6), fy = R(lerp(gy - 14, gy - 42, smooth(fp)));
      rect(ctx, sx + 2, fy, 12, 8, PAL.red); rect(ctx, sx + 2, fy, 12, 1, PAL.pink); rect(ctx, sx + 6, fy + 2, 4, 4, PAL.white);
      rect(ctx, sx + 2, fy + 8, 12, 1, PAL.ink); rect(ctx, sx + 14, fy, 1, 9, PAL.ink);
    }, 35);
    hero.cheer(tClear + 0.05, D);
    if (comp) comp.cheer(tClear + 0.2, D);
    g.sparkle(flagX, gy - 40, tClear);
    // collected-items window
    var rowH = 11, iconW = 14;
    var labW = 0; grabs.forEach(function (gr) { labW = Math.max(labW, measure(gr.label)); });
    var maxW = PORTRAIT ? sa.w : R(sa.w * 0.55);
    var cols = 1, winW = Math.min(maxW, labW + iconW + 14);
    var head = "ITEMS", rowsN = n, hudH = g.hudHeight();
    var winY = sa.y0 + hudH + 9, winH = 14 + rowsN * rowH;
    if (!PORTRAIT && winY + winH > gy - 48 && n > 3) { cols = 2; rowsN = Math.ceil(n / 2); winW = Math.min(sa.w, (labW + iconW + 6) * 2 + 12); winH = 14 + rowsN * rowH; }
    var lblMax = R((winW - 10) / cols - iconW - (cols > 1 ? 4 : 0));
    grabs.forEach(function (gr) { var l = gr.label; while (l.length > 2 && measure(l) > lblMax) l = l.slice(0, -1); if (l !== gr.label) l = l.replace(/\s+$/, "") + "."; gr.short = l; });
    var winX = PORTRAIT ? R(sa.cx - winW / 2) : sa.x1 - winW;
    g._ent(110, true, function (ctx, t) {
      var box = windowBox(ctx, winX, winY, winW, winH, { style: "dark", open: prog(t, 0.25, 0.18) });
      rec("window", "items", winX, winY - 6, winW, winH + 6);
      if (!box) return;
      var got = 0; grabs.forEach(function (gr) { if (t >= gr.t) got++; });
      var hd = head + " " + got + "/" + n;
      windowBox(ctx, winX + 5, winY - 6, measure(hd) + 8, 13, { style: "gold", shadow: false });
      text(ctx, hd, winX + 9, winY - 3, { color: PAL.yellow });
      grabs.forEach(function (gr, k) {
        var c = cols === 2 ? k % 2 : 0, r = cols === 2 ? Math.floor(k / 2) : k;
        var rx = box.x + c * R(box.w / cols), ry = box.y + 3 + r * rowH;
        var ic = itemCanvas(gr.icon);
        if (t < gr.t + 0.1) { rect(ctx, rx + 3, ry + 3, 5, 1, "#4a4068"); text(ctx, "???", rx + iconW, ry, { color: "#5a5078" }); return; }
        var fly = prog(t, gr.t + 0.1, 0.3);
        if (fly < 1) {
          var sx = gr.x - g.camAt(t), sy = gr.y;
          ctx.drawImage(ic, R(lerp(sx, rx, smooth(fly))) - 2, R(lerp(sy, ry, smooth(fly)) - 12 * Math.sin(fly * PI)) - 2);
          return;
        }
        ctx.drawImage(ic, rx - 1 + R((12 - ic.width) / 2), ry - 1 + R((9 - ic.height) / 2));
        var fresh = t < gr.t + 1.0 && Math.floor(t * 10) % 2 === 0;
        text(ctx, gr.short, rx + iconW, ry, { color: fresh ? PAL.yellow : PAL.white, n: Math.floor((t - gr.t - 0.4) * 40) });
      });
    });
    // STAGE CLEAR banner: left of the window (wide), between window and hero (tall)
    var bx = PORTRAIT ? sa.cx : R((sa.x0 + (winX - 4)) / 2);
    var by = PORTRAIT ? R((winY + winH + gy - 46) / 2) : sa.y0 + hudH + 22;
    g.banner(goal, tClear + 0.05, { scale: 2, x: bx, y: by });
    return g;
  };

  TPL["dialogue"] = function (root, p) {
    var world = worldOf(p.world, "castle");
    var lines = arr(p.lines).filter(function (l) { return l && str(l.text); }).slice(0, 8);
    if (!lines.length) lines = [{ speaker: "orla", text: str(V.narration) || "..." }];
    var sa = safe();
    var boxH = dlgHeight(lines.map(function (l) { return str(l.text); })), boxY = sa.y1 - boxH;
    var g = S.game(root, { world: world, intro: "iris", groundY: boxY - (PORTRAIT ? 14 : 9) });
    var who = [];
    lines.forEach(function (l) { var id = castOf(l.speaker || l.who, "orla"); if (who.indexOf(id) < 0 && who.length < 3) who.push(id); });
    if (who.length === 1) who.push(who[0] === "kit" ? "orla" : "kit");
    var n = who.length;
    var xs = n === 2 ? (PORTRAIT ? [0.28, 0.72] : [0.3, 0.7]) : (PORTRAIT ? [0.2, 0.5, 0.8] : [0.22, 0.5, 0.78]);
    var actors = who.map(function (id, i) { return g.actor(id, { x: R(LW * xs[i]), scale: 2, face: i < n / 2 ? 1 : -1 }); });
    g.window(sa.x0, sa.y0, measure(wName(world)) + 12, 15, { style: "dark", at: 0.15, z: 90, draw: function (ctx, t, x, y) { text(ctx, wName(world), x + 1, y - 2, { color: PAL.yellow }); } });
    var dl = g.dialog(lines.map(function (l) { return { who: castOf(l.speaker || l.who, "orla"), text: str(l.text) }; }), { y: boxY, h: boxH });
    // marker over the speaker; listeners turn to the speaker
    g._ent(70, false, function (ctx, t, cam) {
      var cur = null;
      dl.lines.forEach(function (ln) { if (t >= ln.show) cur = ln; });
      if (!cur) return;
      var a = g.actorById(cur.who);
      if (!a) return;
      var bob = Math.floor(t * 4) % 2, x = R(a.xAt(t) - cam), y = R(a.headY(t) - 6 - bob);
      rect(ctx, x - 3, y - 1, 7, 1, PAL.ink); rect(ctx, x - 3, y, 7, 1, PAL.ink); rect(ctx, x - 2, y + 1, 5, 1, PAL.yellow); rect(ctx, x - 1, y + 2, 3, 1, PAL.yellow); rect(ctx, x, y + 3, 1, 1, PAL.yellow);
      rect(ctx, x - 2, y, 5, 1, PAL.yellow);
    });
    dl.lines.forEach(function (ln) {
      var sp = g.actorById(ln.who);
      actors.forEach(function (a) { if (a !== sp && sp) a.face(sp.x0 > a.x0 ? 1 : -1, ln.show); });
      if (sp) { var other = actors.filter(function (a) { return a !== sp; })[0]; if (other) sp.face(other.x0 > sp.x0 ? 1 : -1, ln.show); }
    });
    return g;
  };

  TPL["boss-battle"] = function (root, p) {
    var world = worldOf(p.world, "castle");
    var sa = safe();
    var moves = arr(p.moves).filter(function (m) { return m && str(m.name); }).slice(0, 4);
    if (!moves.length) moves = [{ name: "Attack" }];
    var n = moves.length;
    var menuH = 14 + n * 10, msgH = PORTRAIT ? 26 : menuH;
    var gy = PORTRAIT ? R(sa.y1 - menuH - msgH - 16) : R(sa.y1 - menuH - 8);
    var g = S.game(root, { world: world, intro: "iris", groundY: gy });
    var heroId = heroOf(p), bossType = BOSS_IDS.indexOf(p.bossType) >= 0 ? p.bossType : "blob", bossName = up(p.boss) || "BIG BOSS";
    g.hud({ level: "", hearts: 3 });
    var hpW = PORTRAIT ? sa.w : R(sa.w * 0.5), hpX = PORTRAIT ? sa.x0 : sa.x1 - hpW, hpY = sa.y0 + g.hudHeight() + 6, hpH = 26;
    var hx = R(LW * 0.24), bxc = R(LW * (PORTRAIT ? 0.66 : 0.7));
    var bossFloor = PORTRAIT ? R(Math.min(gy - 30, hpY + hpH + 62)) : gy;
    if (PORTRAIT) g.platform(bxc - 30, bossFloor, 60);
    var hero = g.actor(heroId, { x: hx });
    var times = landTimes(moves.map(function (m) { return { label: m.name, keyword: m.keyword }; }), { first: 1.0, tail: 2.2, gap: 0.9 });
    var tEnd = times[n - 1], tBoom = tEnd + 0.35, tWin = Math.min(tBoom + 0.75, D - 1.0);
    var reach = PORTRAIT ? bxc - 28 : bxc - 34;
    var hits = times.map(function (ti, i) {
      var hitT = ti + 0.28;
      hero.runTo(reach, ti, 0.25);
      hero.pose("attack", hitT - 0.05, hitT + 0.2);
      hero.runTo(hx, hitT + 0.22, 0.28);
      hero.face(1, hitT + 0.5);
      if (PORTRAIT) { hero.jump(ti, { h: 10, dur: 0.25, to: bossFloor }); hero.jump(hitT + 0.22, { h: 8, dur: 0.28, to: gy }); }
      g.shake(hitT, 2, 0.25);
      g.score(hitT, i === n - 1 ? 500 : 100);
      var dmg = i === n - 1 ? "FINISH!" : "-" + (Math.round(100 / n) + (i % 2 ? 3 : -2));
      g.popup(dmg, bxc + (PORTRAIT ? 0 : 30), (PORTRAIT ? bossFloor - 10 : gy - 30), hitT, { color: i === n - 1 ? PAL.yellow : PAL.white });
      g.burst(bxc - 14, (PORTRAIT ? bossFloor : gy) - 18, hitT, { n: 8, colors: [PAL.white, PAL.yellow], speed: 50, life: 0.35, gravity: 0 });
      return hitT;
    });
    var counter = null;
    for (var i = 0; i < n - 1 && counter == null; i++) if (times[i + 1] - hits[i] > 1.5) counter = hits[i] + 0.55;
    if (counter == null && n === 1 && times[0] > 2.2) counter = times[0] - 1.1;
    if (counter != null) { hero.hurt(counter + 0.4, 0.5); g.loseHeart(counter + 0.4); g.shake(counter + 0.4, 2, 0.2); }
    g.explode(bxc, (PORTRAIT ? bossFloor : gy) - 20, tBoom, { big: true });
    hero.cheer(tWin, D);
    g._ent(46, false, function (ctx, t, cam) {
      if (t >= tBoom + 0.15) return;
      var f = Math.floor(t * 3) % 2, c = bossCanvas(bossType, f);
      var flash = hits.some(function (h) { return t >= h && t < h + 0.18; }) || (t >= tBoom - 0.1 && Math.floor(t * 20) % 2 === 0);
      var floor = PORTRAIT ? bossFloor : gy, bob = bossType === "eye" ? R(Math.sin(t * 3) * 2) - 6 : 0;
      var recoil = hits.reduce(function (a, h) { return a + (t >= h && t < h + 0.25 ? 3 : 0); }, 0);
      var dx = R(bxc - cam - c.width / 2 + recoil), dy = R(floor - c.height + 2 + bob);
      if (counter != null && t >= counter && t < counter + 0.3) dx -= 3;
      ctx.drawImage(flash ? tintCache(c, PAL.white) : c, dx, dy);
      rec("boss", bossName, dx + 8, dy + 4, c.width - 16, c.height - 6);
    });
    if (counter != null) {
      g._ent(65, false, function (ctx, t, cam) {
        if (t < counter || t > counter + 0.42) return;
        var pp = (t - counter) / 0.4, floor = PORTRAIT ? bossFloor : gy;
        var x = lerp(bxc - 20, hx + 4, pp) - cam, y = lerp(floor - 22, gy - 14, pp) - Math.sin(pp * PI) * 10;
        ellipse(ctx, R(x), R(y), 3, 3, PAL.violet); ellipse(ctx, R(x), R(y), 1, 1, PAL.white);
        dither(ctx, R(x) + 3, R(y) - 2, 6, 4, PAL.violet, 0.4);
      });
    }
    // HP window (closes after the boss falls)
    var hpClose = tBoom + 0.35;
    g._ent(110, true, function (ctx, t) {
      if (t >= hpClose + 0.15) return;
      var box = windowBox(ctx, hpX, hpY, hpW, hpH, { style: "dark", open: Math.min(prog(t, 0.2, 0.2), 1 - prog(t, hpClose, 0.15)) });
      rec("window", "hp", hpX, hpY, hpW, hpH);
      if (!box) return;
      var nm = bossName; while (nm.length > 3 && measure(nm) > box.w) nm = nm.slice(0, -1);
      text(ctx, nm, box.x, box.y - 1, { color: PAL.white });
      var hp = 1;
      hits.forEach(function (h) { hp -= (1 / n) * smooth(prog(t, h, 0.4)); });
      hp = clamp(hp, 0, 1);
      var bw = box.w - 18, by = box.y + 9;
      text(ctx, "HP", box.x, by - 1, { color: PAL.yellow });
      rect(ctx, box.x + 15, by, bw + 2, 5, PAL.ink);
      var c = hp > 0.5 ? PAL.green : hp > 0.25 ? PAL.yellow : PAL.red;
      rect(ctx, box.x + 16, by + 1, R(bw * hp), 3, c); rect(ctx, box.x + 16, by + 1, R(bw * hp), 1, PAL.white);
    });
    // battle menu and message box
    var menuW = PORTRAIT ? sa.w : R(sa.w * 0.46), menuX = sa.x0, menuY = sa.y1 - menuH;
    var msgX = PORTRAIT ? sa.x0 : menuX + menuW + 4, msgW = PORTRAIT ? sa.w : sa.w - menuW - 4, msgY = PORTRAIT ? menuY - msgH - 4 : menuY;
    var names = moves.map(function (m) { var s = up(m.name); while (s.length > 3 && measure(s) > menuW - 22) s = s.slice(0, -1); return s; });
    g._ent(112, true, function (ctx, t) {
      var box = windowBox(ctx, menuX, menuY, menuW, menuH, { style: "blue", open: prog(t, 0.3, 0.2) });
      rec("window", "menu", menuX, menuY - 6, menuW, menuH + 6);
      if (!box) return;
      windowBox(ctx, menuX + 5, menuY - 6, measure("MOVES") + 8, 13, { style: "dark", shadow: false });
      text(ctx, "MOVES", menuX + 9, menuY - 3, { color: PAL.yellow });
      var sel = -1;
      times.forEach(function (ti, k) { if (t >= ti - 0.35) sel = k; });
      names.forEach(function (nm, k) {
        var used = t >= hits[k], y = box.y + 3 + k * 10;
        if (k === sel && t < tWin) { var blink = t < times[k] ? Math.floor(t * 8) % 2 : 0; if (!blink) text(ctx, "\u25b6", box.x, y, { color: PAL.yellow }); }
        text(ctx, nm, box.x + 8, y, { color: used ? (k === sel ? PAL.yellow : "#8890c8") : PAL.white });
      });
    });
    var heroName = CAST[heroId].name.split(" ").pop();
    g._ent(113, true, function (ctx, t) {
      var box = windowBox(ctx, msgX, msgY, msgW, msgH, { style: "dark", open: prog(t, 0.35, 0.2) });
      rec("window", "message", msgX, msgY, msgW, msgH);
      if (!box) return;
      var msg = "", st = 0.35;
      if (t >= 0.35) { msg = "A BOSS APPEARS!"; st = 0.35; }
      times.forEach(function (ti, k) { if (t >= ti) { msg = heroName + " USES " + names[k] + "!"; st = ti; } });
      if (counter != null && t >= counter && t < counter + 0.9) { msg = "THE BOSS STRIKES BACK!"; st = counter; }
      if (t >= tBoom) { msg = "THE BOSS IS DEFEATED!"; st = tBoom; }
      var ls = wrap(msg, box.w, 1).slice(0, Math.max(1, Math.floor((box.h + 4) / 11)));
      text(ctx, ls.join("\n"), box.x, box.y, { color: PAL.white, n: Math.floor((t - st) * 45) });
    });
    var vY = PORTRAIT ? R((hpY + bossFloor) / 2) : R((sa.y0 + g.hudHeight() + gy - 40) / 2);
    g.banner(up(p.victory) || "VICTORY!", tWin, { scale: 2, y: vY, x: PORTRAIT ? sa.cx : R((sa.x0 + sa.x1) / 2) });
    g.score(tWin, 1000);
    return g;
  };

  TPL["inventory"] = function (root, p) {
    var world = worldOf(p.world, "cave");
    var g = S.game(root, { world: world, intro: "dither" });
    var sa = g.safe;
    var items = arr(p.items).filter(function (it) { return it && str(it.name); }).slice(0, 9);
    if (!items.length) items = [{ name: "Item" }];
    var n = items.length;
    g.camFn = function (t) { return t * 6; };
    g.overlay(function (ctx) { dither(ctx, 0, 0, LW, LH, PAL.ink, 0.6); }, 95);
    var times = landTimes(items.map(function (it) { return { label: it.name, keyword: it.keyword }; }), { first: 0.6, tail: 1.6, gap: 0.5 });
    var title = up(p.title) || "INVENTORY";
    var cols = 3, rows = Math.ceil(n / cols);
    var wx = sa.x0, wy = sa.y0 + 6, ww = sa.w, wh = sa.h - 6;
    var slot = PORTRAIT ? (rows > 2 ? 26 : 32) : (rows > 2 ? 30 : 34);
    var gridW = cols * slot + (cols - 1) * 3, gridH = rows * slot + (rows - 1) * 3;
    var gx, gyy, dx, dy, dw, dh;
    if (PORTRAIT) { gx = R(sa.cx - gridW / 2); gyy = wy + 12; dx = wx + 8; dy = gyy + gridH + 10; dw = ww - 16; dh = wy + wh - 8 - dy; }
    else { gx = wx + 12; gyy = wy + 12 + Math.max(0, R((wh - 24 - gridH) / 2)); dx = gx + gridW + 12; dy = wy + 12; dw = wx + ww - 8 - dx; dh = wh - 20; }
    var iconBox = 40;
    var info = items.map(function (it, i) {
      var icon = iconOf(it.icon, it.name, i), nm = up(it.name);
      var nw = dw - 12 - iconBox - 6;
      var nf = fitText(nm, nw, 2, [2, 1]);
      var desc = wrap(str(it.description), dw - 12, 1);
      var maxL = Math.max(1, Math.floor((dh - 12 - iconBox - 8 + 4) / 11));
      desc = desc.slice(0, maxL);
      var len = visibleLen(desc.join(" "));
      var next = i < n - 1 ? times[i + 1] : D - 0.8;
      var cps = Math.max(40, len / Math.max(0.35, next - times[i] - 0.45));
      var blockH = iconBox + (desc.length ? 8 + textH(desc.length, 1) : 0);
      return { icon: icon, name: nm, nf: nf, desc: desc, qty: str(it.qty), t: times[i], cps: cps, top: dy + Math.max(6, R((dh - blockH) / 2)) };
    });
    g._ent(100, true, function (ctx, t) {
      var box = windowBox(ctx, wx, wy, ww, wh, { style: "blue", open: prog(t, 0.1, 0.2) });
      rec("window", title, wx, wy - 6, ww, wh + 6);
      if (!box) return;
      var tt = title; while (tt.length > 3 && measure(tt) > ww - 30) tt = tt.slice(0, -1);
      windowBox(ctx, wx + 6, wy - 6, measure(tt) + 8, 13, { style: "gold", shadow: false });
      text(ctx, tt, wx + 10, wy - 3, { color: PAL.yellow });
      var sel = -1;
      info.forEach(function (it, k) { if (t >= it.t) sel = k; });
      for (var k = 0; k < rows * cols; k++) {
        var c = k % cols, r = Math.floor(k / cols), sx = gx + c * (slot + 3), sy = gyy + r * (slot + 3);
        rect(ctx, sx, sy, slot, slot, PAL.ink); rect(ctx, sx + 1, sy + 1, slot - 2, slot - 2, "#1c2468"); rect(ctx, sx + 1, sy + slot - 2, slot - 2, 1, "#3c4ca8");
        var it = info[k];
        if (!it || t < it.t) continue;
        var pp = prog(t, it.t, 0.25), ic = itemCanvas(it.icon), s2 = 2;
        if (ic.width * 2 > slot - 4 || ic.height * 2 > slot - 4) s2 = 1;
        var iw = ic.width * s2, ih = ic.height * s2;
        ctx.drawImage(ic, R(sx + (slot - iw) / 2), R(sy + (slot - ih) / 2) - (pp < 1 ? R(Math.sin(pp * PI) * 4) : 0), iw, ih);
        if (it.qty) text(ctx, it.qty, sx + slot - 2, sy + slot - 9, { align: "right", outline: true, color: PAL.white });
        if (k === sel) {
          var b = Math.floor(t * 4) % 2;
          rect(ctx, sx - 1 - b, sy - 1 - b, slot + 2 + b * 2, 1, PAL.yellow); rect(ctx, sx - 1 - b, sy + slot + b, slot + 2 + b * 2, 1, PAL.yellow);
          rect(ctx, sx - 1 - b, sy - 1 - b, 1, slot + 2 + b * 2, PAL.yellow); rect(ctx, sx + slot + b, sy - 1 - b, 1, slot + 2 + b * 2, PAL.yellow);
        }
        rec("slot", it.name, sx, sy, slot, slot);
      }
      rect(ctx, dx, dy, dw, dh, "#14206a"); rect(ctx, dx, dy, dw, 1, "#4c5cc0"); rect(ctx, dx, dy + dh - 1, dw, 1, PAL.ink);
      rec("panel", "detail", dx, dy, dw, dh);
      if (sel < 0) { text(ctx, "SELECT AN ITEM", dx + dw / 2, dy + dh / 2 - 3, { align: "center", color: "#6a78c8" }); return; }
      var it2 = info[sel], ic2 = itemCanvas(it2.icon), s3 = 3;
      var ix = dx + 6, iy = it2.top;
      rect(ctx, ix, iy, iconBox, iconBox, PAL.ink); gradient(ctx, ix + 1, iy + 1, iconBox - 2, iconBox - 2, ["#3c4cb0", "#1c2468"]);
      var bob = R(Math.sin(t * 3) * 1);
      ctx.drawImage(ic2, R(ix + (iconBox - ic2.width * s3) / 2), R(iy + (iconBox - ic2.height * s3) / 2) + bob, ic2.width * s3, ic2.height * s3);
      var nx = ix + iconBox + 6, nh = textH(it2.nf.lines.length, it2.nf.scale);
      text(ctx, it2.nf.lines.join("\n"), nx, R(iy + iconBox / 2 - nh / 2), { scale: it2.nf.scale, color: PAL.yellow, outline: true });
      if (it2.qty) text(ctx, "x" + it2.qty, dx + dw - 6, iy + iconBox - 8, { align: "right", color: PAL.white });
      if (it2.desc.length) text(ctx, it2.desc.join("\n"), dx + 6, iy + iconBox + 8, { color: PAL.white, n: Math.floor((t - it2.t - 0.15) * it2.cps) });
    });
    return g;
  };

  TPL["world-map"] = function (root, p) {
    var g = S.game(root, { world: "underwater", intro: "iris", background: false, bgColor: "#2c64c8" });
    var sa = g.safe;
    var nodes = arr(p.nodes).filter(function (nd) { return nd && str(nd.label); }).slice(0, 7);
    if (nodes.length < 2) nodes = nodes.concat([{ label: "Start" }, { label: "Goal" }]).slice(0, Math.max(2, nodes.length));
    var n = nodes.length;
    var title = up(p.title) || "WORLD MAP";
    var times = landTimes(nodes.map(function (nd) { return { label: nd.label, keyword: nd.keyword }; }), { first: 0.7, tail: 1.5, gap: 0.7 });
    // banner: stage line + the sublabel on up to two lines
    var bw = sa.w, bx = sa.x0, by = sa.y0, inner = bw - 10;
    var subs = nodes.map(function (nd) { return wrap(str(nd.sublabel), inner, 1).slice(0, 2); });
    var subRows = 1; subs.forEach(function (s) { subRows = Math.max(subRows, s.length); });
    var bannerH = 11 + 11 * (1 + subRows);
    var top = sa.y0 + bannerH + 8;
    var pts = [], i;
    if (PORTRAIT) {
      var y0 = top + 14, y1 = sa.y1 - 10, step = (y1 - y0) / Math.max(1, n - 1);
      for (i = 0; i < n; i++) pts.push({ x: sa.x0 + 20 + (i % 2 ? 10 : 0), y: R(y0 + step * i) });
    } else {
      var x0 = sa.x0 + 26, x1 = sa.x1 - 26, stepx = (x1 - x0) / Math.max(1, n - 1), mid = R((top + sa.y1) / 2) + 6;
      for (i = 0; i < n; i++) pts.push({ x: R(x0 + stepx * i), y: mid + (i % 2 ? 18 : -12) });
    }
    var labels = nodes.map(function (nd, k) {
      var s = up(nd.label), q = pts[k];
      if (PORTRAIT) {
        var lw = sa.x1 - (q.x + 12) - 1, ls = wrap(s, lw, 1).slice(0, 2);
        return { lines: ls, x: q.x + 12, y: q.y - (ls.length > 1 ? 9 : 3), align: "left" };
      }
      var room = n > 1 ? (sa.w / (n - 1)) * 2 - 10 : sa.w, ls2 = wrap(s, Math.min(room, 110), 1).slice(0, 2);
      var lwid = Math.max.apply(null, ls2.map(function (l) { return measure(l); }));
      var cx = clamp(q.x, sa.x0 + lwid / 2 + 1, sa.x1 - lwid / 2 - 1);
      var below = k % 2 === 1;
      return { lines: ls2, x: R(cx), y: below ? q.y + 8 : q.y - 17 - textH(ls2.length, 1), align: "center" };
    });
    var terrain = cv(LW, LH), tx = terrain.getContext("2d");
    (function paintTerrain() {
      gradient(tx, 0, 0, LW, LH, ["#3070d0", "#2458b0", "#1c4898"]);
      for (var k = 0; k < 60; k++) rect(tx, R(hash(k, 91) * LW), R(hash(k, 92) * LH), 4, 1, "#5c94e0");
      var ix0 = sa.x0 - 6, ix1 = sa.x1 + 6, iy0 = top - 10, iy1 = sa.y1 + 8;
      for (var yy = iy0; yy < iy1; yy++) {
        var f = (yy - iy0) / (iy1 - iy0), wob = Math.sin(f * 9 + 1) * 3 + Math.sin(f * 23) * 2;
        var rnd = Math.min(1, Math.min(f, 1 - f) * 6), inset = (1 - Math.sqrt(Math.max(0, rnd))) * 18;
        var a = R(ix0 + inset + wob), b = R(ix1 - inset - wob * 0.7);
        rect(tx, a - 2, yy, b - a + 4, 1, "#e8d898");
        rect(tx, a, yy, b - a, 1, "#58b050");
      }
      for (var yy2 = iy0 + 2; yy2 < iy1 - 2; yy2 += 3) for (var xx = ix0; xx < ix1; xx += 3) if (hash(xx * 7, yy2) > 0.86) rect(tx, xx, yy2, 2, 1, "#4ca448");
      function free(x, y, r) {
        for (var k2 = 0; k2 < pts.length; k2++) if (Math.abs(pts[k2].x - x) < r + 9 && Math.abs(pts[k2].y - y) < r + 14) return false;
        for (k2 = 0; k2 < labels.length; k2++) { var L = labels[k2], lw2 = Math.max.apply(null, L.lines.map(function (l) { return measure(l); })), lx = L.align === "center" ? L.x - lw2 / 2 : L.x; if (x > lx - r - 3 && x < lx + lw2 + r + 3 && y > L.y - 3 && y < L.y + L.lines.length * 11 + r + 2) return false; }
        for (k2 = 0; k2 < pts.length - 1; k2++) { var A = pts[k2], B = pts[k2 + 1]; for (var s2 = 0; s2 <= 12; s2++) { var px = lerp(A.x, B.x, s2 / 12), py = lerp(A.y, B.y, s2 / 12); if (Math.abs(px - x) < r + 4 && Math.abs(py - y) < r + 6) return false; } }
        return true;
      }
      var placed = [];
      for (var k3 = 0; k3 < 120 && placed.length < (PORTRAIT ? 22 : 30); k3++) {
        var x = R(lerp(sa.x0 + 6, sa.x1 - 6, hash(k3, 93))), y = R(lerp(top, sa.y1 - 2, hash(k3, 94)));
        if (!free(x, y, 6)) continue;
        if (placed.some(function (q) { return Math.abs(q[0] - x) < 12 && Math.abs(q[1] - y) < 10; })) continue;
        placed.push([x, y]);
        if (hash(k3, 95) > 0.65) { for (var r = 0; r < 8; r++) rect(tx, x - r, y - 8 + r, r * 2 + 1, 1, r < 3 ? PAL.white : r < 5 ? "#9a9ab0" : "#7a7a90"); rect(tx, x - 7, y, 15, 1, "#5a5a70"); }
        else { ellipse(tx, x, y - 3, 3, 3, "#2a7a38"); ellipse(tx, x - 1, y - 4, 1, 1, "#58b858"); rect(tx, x, y, 1, 2, PAL.brown); }
      }
    })();
    g.overlay(function (ctx) { ctx.drawImage(terrain, 0, 0); }, 1);
    g.overlay(function (ctx, t) { for (var k = 0; k < 18; k++) { var wx = R(hash(k, 96) * LW + Math.sin(t * 1.5 + k) * 3), wy = R(hash(k, 97) * LH); if (Math.floor(t * 2 + k) % 3) rect(ctx, wx, wy, 3, 1, "#8cc0f0"); } }, 2);
    var heroId = heroOf(p);
    g._ent(10, true, function (ctx, t) {
      for (var k = 0; k < n - 1; k++) {
        var A = pts[k], B = pts[k + 1], done = t >= times[k + 1];
        var steps = Math.max(1, R(Math.hypot(B.x - A.x, B.y - A.y) / 3));
        for (var s = 1; s < steps; s++) { var px = R(lerp(A.x, B.x, s / steps)), py = R(lerp(A.y, B.y, s / steps)); rect(ctx, px, py, 2, 2, PAL.ink); rect(ctx, px, py, 1, 1, done ? PAL.yellow : "#f0e8c8"); }
      }
      pts.forEach(function (q, k) {
        var reached = t >= times[k], cur = reached && (k === n - 1 || t < times[k + 1]);
        ellipse(ctx, q.x, q.y + 1, 6, 4, PAL.ink);
        ellipse(ctx, q.x, q.y, 5, 3, reached ? PAL.red : "#8a8aa8"); ellipse(ctx, q.x, q.y - 1, 3, 1, reached ? PAL.pink : PAL.lightgrey);
        text(ctx, String(k + 1), q.x + 1, q.y - 3, { align: "center", color: PAL.white, outline: true });
        if (reached && !cur) { var fy = q.y - 13; rect(ctx, q.x + 4, fy, 1, 10, PAL.lightgrey); rect(ctx, q.x + 5, fy, 6, 4, PAL.green); }
        if (reached && t < times[k] + 0.4) ring(ctx, q.x, q.y, 4 + prog(t, times[k], 0.4) * 10, PAL.white);
        var L = labels[k];
        text(ctx, L.lines.join("\n"), L.x, L.y, { align: L.align, color: reached ? PAL.yellow : PAL.white, outline: true });
        var lw = Math.max.apply(null, L.lines.map(function (l) { return measure(l); }));
        rec("label", L.lines.join(" "), L.align === "center" ? L.x - lw / 2 : L.x, L.y, lw, textH(L.lines.length, 1));
      });
      var seg = -1;
      for (var k2 = 0; k2 < n; k2++) if (t >= times[k2] - 0.7) seg = k2;
      var hx = pts[0].x, hy = pts[0].y, moving = false;
      if (seg > 0) {
        var a = pts[seg - 1], b = pts[seg], st = Math.max(times[seg - 1] + 0.1, times[seg] - 0.7), pp = prog(t, st, times[seg] - st);
        hx = lerp(a.x, b.x, smooth(pp)); hy = lerp(a.y, b.y, smooth(pp)); moving = pp > 0 && pp < 1;
      }
      var ms = miniSprite(heroId, moving ? Math.floor(t * 8) % 2 : 0);
      ctx.drawImage(ms, R(hx) - 6, R(hy) - 13 - (moving ? Math.floor(t * 8) % 2 : 0));
    });
    g._ent(120, true, function (ctx, t) {
      var cur = -1; times.forEach(function (ti, k) { if (t >= ti) cur = k; });
      var box = windowBox(ctx, bx, by, bw, bannerH, { style: "dark", open: prog(t, 0.15, 0.2) });
      rec("window", title, bx, by, bw, bannerH);
      if (!box) return;
      if (cur < 0) {
        var tf = fitText(title, box.w, 1, [2, 1]);
        text(ctx, tf.lines[0], sa.cx, R(box.y + (box.h - textH(1, tf.scale)) / 2), { align: "center", scale: tf.scale, color: PAL.yellow });
        return;
      }
      var nd = nodes[cur], head = "STAGE " + (cur + 1), nm = up(nd.label);
      var line1 = head + "  " + nm; if (measure(line1) > box.w) line1 = nm; while (line1.length > 3 && measure(line1) > box.w) line1 = line1.slice(0, -1);
      text(ctx, line1, box.x, box.y, { color: PAL.yellow, n: Math.floor((t - times[cur]) * 60) });
      var sl = subs[cur].length ? subs[cur] : [title];
      text(ctx, sl.join("\n"), box.x, box.y + 11, { color: subs[cur].length ? PAL.white : "#9890b8", n: Math.floor((t - times[cur] - 0.15) * 55) });
    });
    return g;
  };

  TPL["level-up"] = function (root, p) {
    var world = worldOf(p.world, "grassland");
    var sa = safe();
    var stats = arr(p.stats).filter(function (s) { return s && str(s.label); }).slice(0, 6);
    if (!stats.length) stats = [{ label: "Power", from: 10, to: 20 }];
    var n = stats.length, unlock = str(p.unlock);
    var title = up(p.title) || "LEVEL UP!";
    var titleScale = measure(title, 3) <= (PORTRAIT ? sa.w : sa.w * 0.7) ? 3 : 2;
    var titleTop = sa.y0 + 4, titleH = textH(1, titleScale);
    var lvlY = titleTop + titleH + titleScale + 5;
    var rowH = PORTRAIT ? 21 : 15, winH = 16 + n * rowH, toastH = unlock ? 34 : 0;
    var gy, heroScale;
    if (PORTRAIT) {
      var winTop = sa.y1 - toastH - winH;
      gy = winTop - 6;
      heroScale = gy - (lvlY + 12) >= 58 ? 2 : 1;
    } else { gy = R(sa.y1 - toastH - 2); heroScale = 2; }
    var g = S.game(root, { world: world, intro: "iris", groundY: gy });
    var heroId = heroOf(p);
    var hx = PORTRAIT ? sa.cx : R(sa.x0 + sa.w * 0.17);
    var hero = g.actor(heroId, { x: hx, scale: heroScale });
    var lvl = clamp(R(num(p.level, 5)), 2, 99);
    var times = landTimes(stats.map(function (s) { return { label: s.label, keyword: s.keyword }; }), { first: 1.0, tail: unlock ? 2.2 : 1.6, gap: 0.5 });
    var tUnlock = Math.min(times[n - 1] + 0.9, D - 1.3);
    hero.cheer(0.35, D);
    g.flash(0.32, "white", 0.12);
    g.draw(function (ctx, t, cam) {
      var pp = prog(t, 0.3, 0.3), w = R((heroScale === 2 ? 36 : 22) * pp);
      if (w < 2) return;
      var x = R(hx - cam - w / 2), topY = PORTRAIT ? lvlY + 10 : 0;
      dither(ctx, x - 4, topY, w + 8, gy - topY, PAL.yellow, 0.25);
      dither(ctx, x, topY, w, gy - topY, PAL.white, 0.5 + 0.15 * Math.sin(t * 6));
      for (var k = 0; k < 8; k++) { var per = 1.2, ph = ((t * 0.9 + k / 8) % per) / per, py = R(gy - ph * (gy - topY)), px = R(x + hash(k, 101) * w); rect(ctx, px, py, 1, 2, PAL.yellow); }
    }, 20);
    var cx = PORTRAIT ? sa.cx : R((sa.x0 + sa.x1) / 2);
    g.banner(title, 0.35, { scale: titleScale, x: cx, y: titleTop + titleH / 2 });
    g._ent(150, true, function (ctx, t) {
      if (t < 0.6) return;
      var sw = t < 0.9 ? lvl - 1 : lvl, s = "LV " + (lvl - 1) + " \u2192 " + sw;
      text(ctx, s, cx, lvlY, { align: "center", outline: true, color: t >= 0.9 && t < 1.4 && Math.floor(t * 10) % 2 ? PAL.yellow : PAL.white });
      rec("label", s, cx - measure(s) / 2, lvlY, measure(s), 7);
    });
    var wx = PORTRAIT ? sa.x0 : R(sa.x0 + sa.w * 0.36), ww = PORTRAIT ? sa.w : sa.x1 - wx;
    var wy = PORTRAIT ? gy + 6 : R(Math.max(lvlY + 16, (lvlY + 14 + gy - winH) / 2));
    if (!PORTRAIT && wy + winH > gy) wy = gy - winH;
    var labW = 0; stats.forEach(function (s) { labW = Math.max(labW, measure(up(s.label))); });
    g._ent(110, true, function (ctx, t) {
      var box = windowBox(ctx, wx, wy, ww, winH, { style: "blue", open: prog(t, 0.5, 0.2) });
      rec("window", "stats", wx, wy - 6, ww, winH + 6);
      if (!box) return;
      windowBox(ctx, wx + 5, wy - 6, measure("STATS") + 8, 13, { style: "dark", shadow: false });
      text(ctx, "STATS", wx + 9, wy - 3, { color: PAL.yellow });
      stats.forEach(function (s, k) {
        var from = num(s.from, 0), to = num(s.to, from), suf = str(s.suffix), tk = times[k];
        var pp = smooth(prog(t, tk, 0.6)), val = R(lerp(from, to, pp));
        var maxV = Math.max(to, from, to <= 100 && from <= 100 ? 100 : Math.max(to, from) * 1.1);
        var y = box.y + 3 + k * rowH, lab = up(s.label), hot = t >= tk && t < tk + 1.0, numS = String(val) + suf;
        var barX, barW, barY;
        if (PORTRAIT) {
          text(ctx, lab, box.x, y, { color: hot ? PAL.yellow : PAL.white });
          text(ctx, numS, box.x + box.w, y, { align: "right", color: hot ? PAL.yellow : PAL.white });
          barX = box.x; barW = box.w; barY = y + 9;
        } else {
          var lw = Math.min(labW, R(box.w * 0.36)), labT = lab; while (labT.length > 3 && measure(labT) > lw) labT = labT.slice(0, -1);
          text(ctx, labT, box.x, y, { color: hot ? PAL.yellow : PAL.white });
          var numW = Math.max(measure(String(R(to)) + suf), measure(String(R(from)) + suf));
          text(ctx, numS, box.x + box.w, y, { align: "right", color: hot ? PAL.yellow : PAL.white });
          barX = box.x + lw + 6; barW = box.w - lw - 6 - numW - 6; barY = y + 1;
        }
        rect(ctx, barX, barY, barW, 6, PAL.ink); rect(ctx, barX + 1, barY + 1, barW - 2, 4, "#1c2468");
        var bf = R((barW - 2) * clamp(lerp(from, to, pp) / maxV, 0, 1)), b0 = R((barW - 2) * clamp(from / maxV, 0, 1));
        rect(ctx, barX + 1, barY + 1, Math.min(b0, bf), 4, "#58a0e0");
        if (bf > b0) rect(ctx, barX + 1 + b0, barY + 1, bf - b0, 4, hot && Math.floor(t * 10) % 2 ? PAL.white : PAL.lime);
        rect(ctx, barX + 1, barY + 1, Math.max(b0, bf), 1, "#d8f0ff");
        if (t >= tk && t < tk + 0.9) {
          var dlt = R(to - from), pu = (dlt >= 0 ? "+" : "") + dlt + suf, ppp = prog(t, tk, 0.9);
          text(ctx, pu, clamp(barX + 1 + bf, barX + 10, barX + barW - 10), R(barY - 3 - ppp * 5), { align: "center", outline: true, color: PAL.yellow });
        }
      });
    });
    if (unlock) {
      g.toast(unlock, tUnlock, { title: "NEW SKILL!", icon: "star", dur: D, pos: "bottom", style: "gold" });
      g.sparkle(sa.cx, sa.y1 - 12, tUnlock + 0.2, { screen: true });
    }
    times.forEach(function (tk) { g.sparkle(hx, gy - 14 * heroScale, tk, {}); });
    return g;
  };

  TPL["choice-menu"] = function (root, p) {
    var world = worldOf(p.world, "grassland");
    var sa = safe();
    var options = arr(p.options).filter(function (o) { return o && str(o.label); }).slice(0, 5);
    if (options.length < 2) options = options.concat([{ label: "Yes" }, { label: "No" }]).slice(0, 2);
    var n = options.length;
    var askerId = castOf(p.asker, "orla"), heroId = heroOf(p);
    if (askerId === heroId) askerId = heroId === "orla" ? "kit" : "orla";
    var q = str(p.question) || "Which one?";
    var chosen = p.chosen == null ? -1 : R(num(p.chosen, -1));
    if (chosen >= n) chosen = n - 1;
    var verdict = str(p.verdict) || (chosen >= 0 ? up(options[chosen].label) + "!" : "");
    var detailText = options.map(function (o) { return (up(o.label) + ": " + (str(o.detail) || "")).replace(/:\s*$/, ""); });
    var boxH = dlgHeight([q, verdict].concat(detailText)), boxY = sa.y1 - boxH;
    var g = S.game(root, { world: world, intro: "iris", groundY: boxY - (PORTRAIT ? 14 : 9) });
    var gy = g.groundY;
    var asker = g.actor(askerId, { x: R(LW * (PORTRAIT ? 0.27 : 0.15)), face: 1, scale: PORTRAIT ? 2 : 1 });
    var hero = g.actor(heroId, { x: R(LW * (PORTRAIT ? 0.73 : 0.35)), face: -1, scale: PORTRAIT ? 2 : 1 });
    var times = landTimes(options.map(function (o) { return { label: o.label, keyword: o.keyword }; }), { first: 1.6, tail: 2.0, gap: 0.8 });
    var tC = chosen >= 0 ? Math.min(times[n - 1] + 1.4, D - 1.1) : Infinity;
    var lines = [{ who: askerId, text: q }];
    options.forEach(function (o, i) { lines.push({ who: askerId, text: detailText[i], at: times[i], end: Math.min(i < n - 1 ? times[i + 1] - 0.1 : (isFinite(tC) ? tC : D) - 0.1, times[i] + Math.max(0.8, visibleLen(detailText[i]) / 22)) }); });
    if (chosen >= 0 && verdict) lines.push({ who: heroId, text: verdict, at: tC, end: Math.min(D - 0.6, tC + Math.max(0.8, visibleLen(verdict) / 18)) });
    var ql = alignText(q, 0, null, null);
    lines[0].at = Math.max(0.3, Math.min(ql.t0, times[0] - 0.6)); lines[0].end = Math.max(lines[0].at + 0.5, Math.min(ql.t1, times[0] - 0.15));
    g.dialog(lines, { y: boxY, h: boxH });
    var title = up(p.title) || "CHOOSE";
    var labW = 0; options.forEach(function (o) { labW = Math.max(labW, measure(up(o.label))); });
    var mw = Math.min(PORTRAIT ? sa.w : R(sa.w * 0.55), Math.max(labW + 24, measure(title) + 24)), mh = 14 + n * 12;
    var actorTop = gy - (PORTRAIT ? 62 : 32);
    var mx = PORTRAIT ? R(sa.cx - mw / 2) : sa.x1 - mw;
    var my = PORTRAIT ? R(Math.max(sa.y0 + 8, (sa.y0 + actorTop - mh) / 2)) : Math.max(sa.y0 + 8, R((sa.y0 + gy - 20 - mh) / 2));
    var labs = options.map(function (o) { var s = up(o.label); while (s.length > 3 && measure(s) > mw - 22) s = s.slice(0, -1); return s; });
    g._ent(110, true, function (ctx, t) {
      var box = windowBox(ctx, mx, my, mw, mh, { style: "blue", open: prog(t, 0.6, 0.2) });
      rec("window", "menu", mx, my - 6, mw, mh + 6);
      if (!box) return;
      windowBox(ctx, mx + 5, my - 6, measure(title) + 8, 13, { style: "dark", shadow: false });
      text(ctx, title, mx + 9, my - 3, { color: PAL.yellow });
      var cur = -1; times.forEach(function (ti, k) { if (t >= ti) cur = k; });
      if (t >= tC) cur = chosen;
      labs.forEach(function (s, k) {
        var y = box.y + 3 + k * 12, isC = t >= tC && k === chosen;
        if (isC) { var fl = t < tC + 0.6 && Math.floor(t * 12) % 2; rect(ctx, box.x - 2, y - 2, box.w + 4, 11, fl ? PAL.white : PAL.gold); }
        if (k === cur && !isC && Math.floor(t * 4) % 2 === 0) text(ctx, "\u25b6", box.x, y, { color: PAL.yellow });
        if (isC) text(ctx, "\u25b6", box.x, y, { color: PAL.ink });
        text(ctx, s, box.x + 8, y, { color: isC ? PAL.ink : k === cur ? PAL.yellow : PAL.white });
      });
    });
    if (chosen >= 0) { g.flash(tC, "white", 0.12); hero.cheer(tC + 0.1, D); g.sparkle(mx + mw / 2, my + 8 + chosen * 12, tC, { screen: true }); }
    asker.pose("point", times[0] - 0.1, chosen >= 0 ? tC : Infinity);
    hero.pose("think", 0.5, times[0] - 0.1);
    return g;
  };

  TPL["quest-log"] = function (root, p) {
    var world = worldOf(p.world, "grassland");
    var sa = safe();
    var quests = arr(p.quests).filter(function (q) { return q && str(q.title); }).slice(0, 6);
    if (!quests.length) quests = [{ title: "Begin the quest" }];
    var n = quests.length;
    var stampW = measure("CLEAR!") + 6;
    var innerW = sa.w - 10;
    var rows = quests.map(function (q, i) {
      var rw = up(str(q.reward) || "+" + 50 * (i + 1) + " XP");
      var titleW = PORTRAIT ? innerW - 14 : innerW - 14 - Math.max(stampW, measure(rw)) - 6;
      var ls = wrap(str(q.title), titleW, 1).slice(0, 3);
      return { lines: ls, reward: rw, h: Math.max(1, ls.length) * 11 + (PORTRAIT ? 11 : 0) + 4 };
    });
    var listH = 0; rows.forEach(function (r) { listH += r.h; });
    var stripH = PORTRAIT ? 44 : 34;
    var winH = Math.min(sa.h - stripH - 6, 14 + listH);
    var gy = Math.min(R(sa.y0 + 6 + winH + stripH), PORTRAIT ? sa.y1 : LH - 12);
    var g = S.game(root, { world: world, intro: "iris", groundY: gy });
    var heroId = heroOf(p), hx = R(LW * 0.3);
    g.camFn = function (t) { return t * 30; };
    var hero = g.actor(heroId, { x: hx });
    hero.walkTo(hx + 30 * D, 0, D);
    var times = landTimes(quests.map(function (q) { return { label: q.title, keyword: q.keyword }; }), { first: 0.8, tail: 1.6, gap: 0.55 });
    var wy = sa.y0 + 6, wx = sa.x0, ww = sa.w;
    var title = up(p.title) || "QUEST LOG";
    var xpX = sa.x1 - 2, xpY = R(Math.min(gy - 30, wy + winH + 6));
    g._ent(110, true, function (ctx, t) {
      var box = windowBox(ctx, wx, wy, ww, winH, { style: "paper", open: prog(t, 0.15, 0.2) });
      rec("window", title, wx, wy - 6, ww, winH + 6);
      if (!box) return;
      var done = 0; times.forEach(function (ti) { if (t >= ti) done++; });
      var cnt = done + "/" + n, cw = measure(cnt) + 8;
      var tt = title; while (tt.length > 3 && measure(tt) > ww - cw - 30) tt = tt.slice(0, -1);
      windowBox(ctx, wx + 5, wy - 6, measure(tt) + 8, 13, { style: "gold", shadow: false });
      text(ctx, tt, wx + 9, wy - 3, { color: PAL.yellow });
      windowBox(ctx, wx + ww - cw - 5, wy - 6, cw, 13, { style: "gold", shadow: false });
      text(ctx, cnt, wx + ww - cw - 1, wy - 3, { color: done === n ? PAL.yellow : PAL.white });
      var y = box.y + 4;
      rows.forEach(function (r, k) {
        var clear = t >= times[k], cb = box.x, ty = y;
        rect(ctx, cb, ty, 9, 9, "#5a3a1a"); rect(ctx, cb + 1, ty + 1, 7, 7, clear ? "#f8f0d8" : "#e8d4a0");
        if (clear) { var pp = prog(t, times[k], 0.15); if (pp > 0.3) { rect(ctx, cb + 2, ty + 4, 1, 2, PAL.green); rect(ctx, cb + 3, ty + 5, 1, 2, PAL.green); } if (pp > 0.7) { rect(ctx, cb + 4, ty + 4, 1, 2, PAL.green); rect(ctx, cb + 5, ty + 2, 1, 3, PAL.green); rect(ctx, cb + 6, ty + 1, 1, 2, PAL.green); } }
        text(ctx, r.lines.join("\n"), cb + 14, ty + 1, { color: clear ? "#8a6a48" : "#3a2410" });
        var rwX, rwY;
        if (!PORTRAIT) { rwX = box.x + box.w; rwY = ty + 1; text(ctx, r.reward, rwX, rwY, { align: "right", color: clear ? "#3a8a3a" : "#8a6a48" }); }
        else { rwX = cb + 14; rwY = ty + 1 + r.lines.length * 11; text(ctx, r.reward, rwX, rwY, { color: clear ? "#3a8a3a" : "#a08868" }); }
        if (clear) {
          var sp = prog(t, times[k], 0.22), ss = sp < 1 ? 2 : 1, sw2 = measure("CLEAR!", ss) + 4 * ss, sh = 7 * ss + 4;
          var sx = PORTRAIT ? box.x + box.w - sw2 : box.x + box.w - measure(r.reward) - sw2 - 6;
          var sy = PORTRAIT ? ty + r.lines.length * 11 - 1 : ty - 1;
          if (ss > 1) { sx -= R(sw2 / 4); sy -= 4; }
          rect(ctx, sx, sy, sw2, sh, PAL.darkred); rect(ctx, sx + 1, sy + 1, sw2 - 2, sh - 2, PAL.red); rect(ctx, sx + 1, sy + 1, sw2 - 2, 1, "#f07070");
          text(ctx, "CLEAR!", sx + 2 * ss, sy + 2, { scale: ss, color: PAL.white });
        }
        y += r.h;
      });
    });
    times.forEach(function (ti, k) {
      var m = /(\d+)/.exec(rows[k].reward), v = m ? +m[1] : 50;
      g.score(ti, v);
      g.popup("+" + v, xpX - measure("XP 0000") - 14, xpY + 8, ti + 0.05, { color: PAL.yellow, screen: true });
      g.sparkle(hero.xAt(ti), gy - 20, ti);
      hero.jump(ti - 0.12, { h: 10, dur: 0.4 });
    });
    hero.cheer(Math.min(times[n - 1] + 0.6, D - 0.8), D);
    g._ent(120, true, function (ctx, t) {
      var s = "XP " + g.scoreAt(t);
      text(ctx, s, xpX, xpY, { align: "right", outline: true, color: PAL.yellow });
      rec("label", s, xpX - measure(s), xpY, measure(s), 7);
    });
    return g;
  };

  TPL["game-over"] = function (root, p) {
    var world = worldOf(p.world, "cave");
    var g = S.game(root, { world: world, intro: "iris", groundY: PORTRAIT ? safe().y1 - 14 : undefined });
    var sa = g.safe, gy = g.groundY;
    var mistakes = arr(p.mistakes).filter(function (m) { return m && str(m.label); }).slice(0, 5);
    if (!mistakes.length) mistakes = [{ label: "A mistake" }];
    var n = mistakes.length, lesson = str(p.lesson);
    g.hud({ level: str(p.level) || wName(world), hearts: n, maxHearts: Math.max(3, n), score: false });
    var times = landTimes(mistakes.map(function (m) { return { label: m.label, keyword: m.keyword }; }), { first: 0.9, tail: 2.8, gap: 0.6 });
    var tLast = times[n - 1];
    // the tip lands on the lesson's first spoken word; GAME OVER, CONTINUE? and YES fit before it
    var lt = null;
    if (lesson) { var lc = alignText(lesson, tLast + 0.05, null, null); if (lc.t0 > tLast + 0.05 && lc.t0 < D) lt = lc.t0; }
    var span = clamp((lt != null ? lt : tLast + 1.6) - tLast, 1.05, 1.6);
    span = Math.max(0.6, Math.min(span, D - 1.4 - tLast));
    var tOver = tLast + 0.28 * span, tCont = tLast + 0.6 * span, tYes = tLast + 0.88 * span, tTip = tLast + span;
    var v = 34, hx0 = 40, t0w = 0.15;
    function hxAt(t) { return hx0 + v * (clamp(t, t0w, tLast) - t0w); }
    var heroId = heroOf(p);
    var hero = g.actor(heroId, { x: hx0 });
    hero.walkTo(hxAt(tLast), t0w, tLast - t0w);
    hero.hide(tOver);
    g.follow(hero, { at: 0.34, min: 0 });
    var types = ENEMY_IDS.slice(), off = strHash(world) % 5;
    times.forEach(function (ti, i) {
      g.enemy(types[(i + off) % 5], { x: hxAt(ti) + 12, defeat: ti + 0.3, value: 0 });
      hero.hurt(ti, 0.45);
      g.loseHeart(ti);
      g.shake(ti, 2, 0.25);
      g.flash(ti, "red", 0.1);
      g.popup("OUCH!", hxAt(ti), gy - 34, ti, { color: PAL.red });
    });
    // mistakes log (stays to the end)
    var logW = PORTRAIT ? sa.w : R(sa.w * 0.48);
    var logLines = mistakes.map(function (m) { return wrap(str(m.label), logW - 24, 1).slice(0, 2); });
    var logH = 11; logLines.forEach(function (l) { logH += l.length * 11 + 2; });
    var wid = 0; logLines.forEach(function (l) { l.forEach(function (s) { wid = Math.max(wid, measure(s)); }); });
    logW = Math.min(logW, Math.max(wid + 24, measure("MISTAKES") + 20));
    var hudH = g.hudHeight();
    var logX = PORTRAIT ? R(sa.cx - logW / 2) : sa.x0, logY = sa.y0 + hudH + 9;
    // tip: right of the log (wide), under it (tall)
    var tipW = PORTRAIT ? sa.w : sa.w - logW - 6, tl = lesson ? wrap(lesson, tipW - 12, 1).slice(0, 5) : [], tipH = 15 + tl.length * 11;
    var tipX = PORTRAIT ? sa.x0 : sa.x1 - tipW, tipY = PORTRAIT ? logY + logH + 10 : logY;
    g._ent(110, true, function (ctx, t) {
      if (t < times[0] || (t >= tOver && t < tYes + 0.1)) return;
      var box = windowBox(ctx, logX, logY, logW, logH, { style: "red", open: t >= tYes ? prog(t, tYes + 0.1, 0.15) : prog(t, times[0], 0.15) });
      rec("window", "mistakes", logX, logY - 6, logW, logH + 6);
      if (!box) return;
      windowBox(ctx, logX + 5, logY - 6, measure("MISTAKES") + 8, 13, { style: "dark", shadow: false });
      text(ctx, "MISTAKES", logX + 9, logY - 3, { color: PAL.yellow });
      var y = box.y + 2;
      logLines.forEach(function (ls, k) {
        if (t < times[k]) return;
        rect(ctx, box.x, y + 1, 5, 5, PAL.ink); line(ctx, box.x, y + 1, box.x + 4, y + 5, PAL.white); line(ctx, box.x + 4, y + 1, box.x, y + 5, PAL.white);
        text(ctx, ls.join("\n"), box.x + 9, y, { color: PAL.white, n: t >= tYes ? null : Math.floor((t - times[k]) * 50) });
        y += ls.length * 11 + 2;
      });
    });
    g._ent(165, true, function (ctx, t) {
      if (t < tOver || t >= tYes + 0.12) return;
      var pp = prog(t, tOver, 0.25);
      dither(ctx, 0, 0, LW, LH, PAL.black, 0.35 + 0.5 * pp);
      var sc = measure("GAME OVER", 3) <= sa.w ? 3 : 2, y = R(sa.cy - 26 - (1 - outBounce(prog(t, tOver, 0.45))) * 60);
      text(ctx, "GAME OVER", sa.cx, y, { align: "center", scale: sc, outline: true, color: [PAL.red, PAL.darkred], depth: 1, depthColor: PAL.black });
      rec("banner", "GAME OVER", sa.cx - measure("GAME OVER", sc) / 2, y, measure("GAME OVER", sc), 7 * sc);
      if (t >= tCont) {
        text(ctx, "CONTINUE?", sa.cx, sa.cy + 4, { align: "center", outline: true, color: PAL.white });
        var yx = sa.cx - 22, nx = sa.cx + 14, yy = sa.cy + 18;
        text(ctx, "YES", yx, yy, { outline: true, color: t >= tYes ? PAL.yellow : PAL.white });
        text(ctx, "NO", nx, yy, { outline: true, color: PAL.grey });
        if (Math.floor(t * 6) % 2 === 0 || t >= tYes) text(ctx, "\u25b6", yx - 8, yy, { color: PAL.yellow, outline: true });
        rec("menu", "continue", sa.cx - 34, sa.cy + 4, 68, 22);
      }
    });
    g.flash(tYes, "white", 0.12);
    var hero2 = g.actor(heroId, { x: hxAt(tLast) - 40, hidden: true });
    hero2.show(tYes + 0.1);
    hero2.cheer(tTip + 0.3, D);
    for (var k2 = 0; k2 < n; k2++) g.gainHeart(tYes + 0.1 * (k2 + 1));
    if (lesson) {
      var len = visibleLen(tl.join(" ")), cps = Math.max(30, len / Math.max(0.4, D - 0.9 - tTip - 0.2));
      var clock = alignText(lesson, tTip, tTip, null);
      g._ent(112, true, function (ctx, t) {
        if (t < tTip) return;
        var box = windowBox(ctx, tipX, tipY, tipW, tipH, { style: "green", open: prog(t, tTip, 0.18) });
        rec("window", "tip", tipX, tipY - 6, tipW, tipH + 6);
        if (!box) return;
        windowBox(ctx, tipX + 5, tipY - 6, measure("TIP") + 18, 13, { style: "dark", shadow: false });
        ctx.drawImage(itemCanvas("bulb"), tipX + 7, tipY - 7);
        text(ctx, "TIP", tipX + 19, tipY - 3, { color: PAL.yellow });
        text(ctx, tl.join("\n"), box.x + 1, box.y + 3, { color: PAL.white, n: Math.max(clock.n(t), Math.floor((t - tTip - 0.2) * cps)) });
      });
    }
    return g;
  };

  TPL["pixel-chart"] = function (root, p) {
    var world = worldOf(p.world, "city");
    var sa = safe();
    var bars = arr(p.bars).filter(function (b) { return b && str(b.label); }).slice(0, 6);
    if (bars.length < 2) bars = bars.concat([{ label: "A", value: 3 }, { label: "B", value: 5 }]).slice(0, 2);
    var n = bars.length, unit = str(p.unit);
    var vals = bars.map(function (b) { return Math.max(0, num(b.value, 0)); }), vmax = Math.max.apply(null, vals.concat([1]));
    var hl = p.highlight != null ? clamp(R(num(p.highlight, 0)), 0, n - 1) : vals.indexOf(vmax);
    var lane = 20;
    var chartX0 = sa.x0 + lane, chartX1 = sa.x1 - 4, slotW = (chartX1 - chartX0) / n;
    var labs = bars.map(function (b) { return up(b.label); });
    var stagger = labs.some(function (l) { return measure(l) > slotW - 8; });
    var labW = stagger ? slotW * 2 - 4 : slotW - 2;
    var labLines = labs.map(function (l) { return wrap(l, labW, 1).slice(0, 2); });
    var maxLL = Math.max.apply(null, labLines.map(function (l) { return l.length; }));
    var labBlock = (stagger ? 2 : 1) * (maxLL * 11) + 2;
    var gy = R(sa.y1 - labBlock - 2);
    var g = S.game(root, { world: world, intro: "iris", groundY: gy, deco: false });
    g.camFn = function () { return 0; };
    // calm the background so the bars read
    g.draw(function (ctx) { dither(ctx, 0, 0, LW, gy, PAL.ink, 0.55); }, 2);
    var title = str(p.title), titleTop = sa.y0 + 2;
    var tf = title ? fitText(up(title), sa.w, 2, [2, 1]) : null;
    var chartTop = titleTop + (tf ? textH(tf.lines.length, tf.scale) + 8 : 0) + 30;
    var maxH = gy - chartTop;
    var brick = Math.max(3, Math.min(8, Math.floor(maxH / 14)));
    var times = landTimes(bars.map(function (b) { return { label: b.label, keyword: b.keyword }; }), { first: 0.8, tail: 2.2, gap: 0.45 });
    var tHero = Math.min(times[n - 1] + 0.8, D - 1.6);
    var barW = Math.max(6, Math.min(28, R(slotW * 0.62)));
    var info = bars.map(function (b, i) {
      var cx = R(chartX0 + slotW * (i + 0.5)), hh = R((vals[i] / vmax) * maxH), nb = Math.max(1, Math.round(hh / brick));
      return { cx: cx, x: R(cx - barW / 2), nb: nb, h: nb * brick, t: times[i], v: vals[i] };
    });
    var colors = ["#e04048", "#3868d8", "#48b848", "#f08830", "#b078e8", "#58d8e8"];
    if (tf) g.label(tf.lines.join("\n"), sa.cx, titleTop, { align: "center", scale: tf.scale, color: PAL.yellow, at: 0.2 });
    g._ent(40, false, function (ctx, t) {
      rect(ctx, chartX0 - 2, gy - 1, chartX1 - chartX0 + 4, 1, "#8a8aa8");
      info.forEach(function (b, i) {
        var c = colors[i % colors.length], c2 = shade(c, 0.7), c3 = shade(c, 1.3);
        for (var k = 0; k < b.nb; k++) {
          var tk = b.t + k * Math.min(0.06, 0.6 / b.nb), pp = prog(t, tk, 0.22);
          if (t < tk) break;
          var ty = gy - (k + 1) * brick, y = ty - R((1 - outBounce(pp)) * (ty - chartTop + 30));
          rect(ctx, b.x, y, barW, brick, PAL.ink); rect(ctx, b.x + 1, y + 1, barW - 2, brick - 1, c); rect(ctx, b.x + 1, y + 1, barW - 2, 1, c3); rect(ctx, b.x + barW - 2, y + 1, 1, brick - 1, c2);
          if (brick >= 6) rect(ctx, b.x + R(barW / 2), y + 1, 1, brick - 1, c2);
        }
        if (t >= b.t) {
          var cv2 = b.v * smooth(prog(t, b.t, 0.6)), s = (b.v % 1 ? cv2.toFixed(1) : String(R(cv2))) + unit;
          var onTop = i === hl && t >= tHero + 0.3;
          var ly = onTop ? gy - b.h - 36 : gy - b.h - 10;
          text(ctx, s, b.cx, ly, { align: "center", outline: true, color: i === hl && t >= tHero ? PAL.yellow : PAL.white });
          rec("value", s, b.cx - measure(s) / 2, ly, measure(s), 7);
        }
      });
    });
    g._ent(115, true, function (ctx, t) {
      info.forEach(function (b, i) {
        var row = stagger ? i % 2 : 0, y = gy + 3 + row * maxLL * 11;
        text(ctx, labLines[i].join("\n"), b.cx, y, { align: "center", outline: true, color: t >= b.t ? PAL.white : PAL.grey });
        var lw = Math.max.apply(null, labLines[i].map(function (l) { return measure(l); }));
        rec("label", labs[i], b.cx - lw / 2, y, lw, textH(labLines[i].length, 1));
        if (stagger && row === 1) rect(ctx, b.cx, gy + 1, 1, maxLL * 11 - 1, "#8a8aa8");
      });
    });
    var H0 = info[hl], heroId = heroOf(p);
    var startX = hl > 0 ? R((info[hl - 1].x + barW + H0.x) / 2) : sa.x0 + 9;
    var hero = g.actor(heroId, { x: sa.x0 + 9, z: 55 });
    if (startX !== sa.x0 + 9) hero.walkTo(startX, Math.max(0.3, tHero - 1.2), Math.min(1.0, Math.abs(startX - sa.x0) / 40));
    hero.jump(tHero, { h: 10, dur: 0.6, to: gy - H0.h, dx: H0.cx - startX - 4 });
    hero.cheer(tHero + 0.7, D);
    g.draw(function (ctx, t) {
      if (t < tHero + 0.6) return;
      var pp = prog(t, tHero + 0.6, 0.25), fx = H0.cx + 5, top = gy - H0.h, hgt = R(16 * pp);
      rect(ctx, fx, top - hgt, 1, hgt, PAL.lightgrey);
      if (pp >= 1) { rect(ctx, fx + 1, top - 16, 7, 5, PAL.yellow); rect(ctx, fx + 1, top - 16, 7, 1, PAL.white); rect(ctx, fx + 1, top - 11, 7, 1, PAL.ink); }
    }, 56);
    g.sparkle(H0.cx, gy - H0.h - 10, tHero + 0.6);
    return g;
  };

  TPL["high-scores"] = function (root, p) {
    var g = S.game(root, { world: "space", intro: "iris", background: false, bgColor: "#05030c", deco: false });
    var sa = g.safe;
    var entries = arr(p.entries).filter(function (e) { return e && str(e.name); }).slice(0, 8);
    if (!entries.length) entries = [{ name: "YOU", score: 100 }];
    var n = entries.length, unit = up(p.unit);
    g.overlay(function (ctx, t) {
      for (var k = 0; k < 90; k++) {
        var sp = 6 + hash(k, 111) * 18, x = R(((hash(k, 112) * LW - t * sp) % LW + LW) % LW), y = R(hash(k, 113) * LH);
        rect(ctx, x, y, 1, 1, Math.floor(t * 3 + k) % 5 === 0 ? PAL.white : k % 3 ? "#5a5a90" : "#a0a0d0");
      }
    }, 1);
    var title = up(p.title) || "HIGH SCORES";
    var tf = fitText(title, sa.w, 2, [3, 2, 1]), titleH = textH(tf.lines.length, tf.scale);
    var times = landTimes(entries.map(function (e) { return { label: e.name, keyword: e.keyword }; }), { first: 0.7, tail: 1.7, gap: 0.4 });
    var foot = str(p.footer);
    var rows = entries.map(function (e, i) {
      var sc = num(e.score, 0);
      return { name: up(e.name), score: sc, sS: V.format(sc, 0, true) + (unit ? " " + unit : ""), rank: ["1ST", "2ND", "3RD"][i] || (i + 1) + "TH", t: times[i] };
    });
    var rankW = Math.max(measure("RANK"), measure("8TH")) + 2, scoreW = 0; rows.forEach(function (r) { scoreW = Math.max(scoreW, measure(r.sS)); });
    var tblX = sa.x0, tblW = sa.w, innerX = tblX + 6, innerW = tblW - 12;
    var nameX = innerX + rankW + 6, nameW = innerW - rankW - 6 - scoreW - 8, fullW = innerW - rankW - 6;
    rows.forEach(function (r) {
      r.below = false;
      var longest = Math.max.apply(null, r.name.split(/\s+/).map(function (w) { return measure(w); }));
      if (longest > nameW && measure(r.name) <= fullW) { r.below = true; r.lines = [r.name, ""]; }
      else r.lines = wrap(r.name, longest > nameW ? fullW : nameW, 1).slice(0, 2);
    });
    var tblTop = sa.y0 + titleH + 12, tblBot = sa.y1 - (foot ? 14 : 0);
    var natural = 0; rows.forEach(function (r) { natural += r.lines.length * 11 - 4; });
    var gapMax = PORTRAIT ? 14 : 10, gapRow = clamp(Math.floor((tblBot - tblTop - 26 - natural) / Math.max(1, n)), 4, gapMax);
    var tblH = 26 + natural + gapRow * n;
    var tblY = tblTop + Math.max(0, R((tblBot - tblTop - tblH) / 2));
    var rainbow = [PAL.red, PAL.orange, PAL.yellow, PAL.lime, PAL.cyan, PAL.violet, PAL.pink];
    g._ent(150, true, function (ctx, t) {
      var y0 = sa.y0 + 2;
      tf.lines.forEach(function (l, li) {
        var lw = measure(l, tf.scale), x = R(sa.cx - lw / 2);
        for (var i = 0; i < l.length; i++) {
          var ch = l[i], gw = (GLYPH[normText(ch)] || GLYPH["?"]).w;
          if (ch !== " ") text(ctx, ch, x, y0 + li * 11 * tf.scale + (Math.floor(t * 4 + i) % 6 === 0 ? -1 : 0), { scale: tf.scale, outline: true, color: rainbow[(i + Math.floor(t * 6)) % rainbow.length] });
          x += (gw + 1) * tf.scale;
        }
      });
      rec("title", title, sa.cx - measure(tf.lines.join("\n"), tf.scale) / 2, y0, measure(tf.lines.join("\n"), tf.scale), titleH);
      var box = windowBox(ctx, tblX, tblY, tblW, tblH, { style: "dark", open: prog(t, 0.2, 0.2) });
      rec("window", "table", tblX, tblY, tblW, tblH);
      if (!box) return;
      text(ctx, "RANK", innerX, box.y, { color: PAL.cyan });
      text(ctx, "NAME", nameX, box.y, { color: PAL.cyan });
      text(ctx, "SCORE", innerX + innerW, box.y, { align: "right", color: PAL.cyan });
      rect(ctx, innerX, box.y + 10, innerW, 1, "#3a3460");
      var y = box.y + 16;
      rows.forEach(function (r, i) {
        if (t >= r.t) {
          var pp = prog(t, r.t, 0.3), off = R((1 - smooth(pp)) * (LW * 0.8));
          var c = i === 0 ? PAL.yellow : i === 1 ? PAL.silver : i === 2 ? "#e0a070" : PAL.white;
          var hot = t < r.t + 0.6 && Math.floor(t * 12) % 2;
          text(ctx, r.rank, innerX + off, y, { color: hot ? PAL.white : c });
          text(ctx, r.lines.join("\n"), nameX + off, y, { color: c });
          var sc = R(r.score * smooth(prog(t, r.t + 0.1, 0.6)));
          text(ctx, V.format(sc, 0, true) + (unit ? " " + unit : ""), innerX + innerW + off, y + (r.below ? 11 : 0), { align: "right", color: c });
          if (i === 0 && pp >= 1) {
            var cxr = nameX + measure(r.lines[0]) + 4, cy = y - 1 + (Math.floor(t * 3) % 2 ? -1 : 0);
            if (cxr + 11 < innerX + innerW - scoreW - 4) {
              rect(ctx, cxr, cy + 3, 11, 5, PAL.ink); rect(ctx, cxr + 1, cy + 4, 9, 3, PAL.yellow);
              rect(ctx, cxr, cy, 1, 4, PAL.ink); rect(ctx, cxr + 5, cy - 1, 1, 5, PAL.ink); rect(ctx, cxr + 10, cy, 1, 4, PAL.ink);
              rect(ctx, cxr + 1, cy + 1, 1, 3, PAL.yellow); rect(ctx, cxr + 4, cy, 3, 4, PAL.yellow); rect(ctx, cxr + 9, cy + 1, 1, 3, PAL.yellow); rect(ctx, cxr + 5, cy + 4, 1, 1, PAL.red);
            }
          }
          rec("row", r.name, innerX + off, y, innerW, textH(r.lines.length, 1), pp < 1);
        } else text(ctx, "---", innerX, y, { color: "#3a3a60" });
        y += r.lines.length * 11 - 4 + gapRow;
      });
      if (foot && t >= 0.5 && Math.floor(t * 2) % 2 === 0) { var fy = sa.y1 - 8; text(ctx, up(foot), sa.cx, fy, { align: "center", color: PAL.white, outline: true }); rec("footer", foot, sa.cx - measure(up(foot)) / 2, fy, measure(up(foot)), 7); }
    });
    return g;
  };

  // ------------------------- public API -------------------------
  function render(id, root, props) {
    var fn = TPL[id];
    if (!fn) throw new Error("Unknown pixel-world template: " + id);
    return fn(root || V.root(), T(props));
  }
  function fallback(root, narration) {
    root = root || V.root();
    while (root.firstChild) root.removeChild(root.firstChild);
    GAMES.length = 0;
    var sentences = String(V.narration || narration || "").split(/(?<=[.!?])\s+/).map(str).filter(Boolean);
    var h = dlgHeight(sentences.length ? sentences : ["..."]), sa = safe();
    var g = new Game(root, { world: "grassland", intro: "iris", groundY: sa.y1 - h - 10 });
    var x0 = R(LW * 0.45);
    var hero = g.actor("kit", { x: x0 }), orla = g.actor("orla", { x: x0 - 26, z: 49 });
    g.camFn = function (t) { return t * 26; };
    hero.walkTo(x0 + 26 * D, 0, D);
    orla.walkTo(x0 - 26 + 26 * D, 0, D);
    if (narration && !V.narration) g.dialog([{ who: "orla", text: str(narration) }], { h: h });
    else g.narrate({ who: "orla", h: h });
    return g;
  }
  S.game = function (root, opts) { return new Game(root || V.root(), opts); };
  S.render = render;
  S.fallback = fallback;
  S.templates = Object.keys(TPL);
  S.cast = CAST_IDS.slice();
  S.castInfo = CAST;
  S.poses = Object.keys(POSE);
  S.items = ICON_ORDER.slice();
  S.enemies = ENEMY_IDS.slice();
  S.bosses = BOSS_IDS.slice();
  S.worlds = WORLD_IDS.slice();
  S.palette = PAL;
  S.safe = safe;
  S.landTimes = landTimes;
  S.iconFor = function (label) { return iconOf(null, label, 0); };
  S.sprite = function (name, o) {
    o = T(o);
    if (CAST[name]) {
      var pose = o.pose || "idle0";
      if (!POSE[pose] && POSE[pose + (o.frame || 0)]) pose = pose + (o.frame || 0);
      var c = castSprite(name, pose, !!o.mouth, !!o.blink, o.frame ? 1 : 0);
      return o.tint ? tinted(c, col(o.tint), 0.45) : c;
    }
    if (ITEM_MAPS[name]) return o.tint ? tinted(itemCanvas(name), col(o.tint), 0.45) : itemCanvas(name);
    if (ENEMY_IDS.indexOf(name) >= 0) return enemyCanvas(name, o.frame ? 1 : 0, o.tint);
    if (BOSS_IDS.indexOf(name) >= 0) return o.tint ? tinted(bossCanvas(name, o.frame ? 1 : 0), col(o.tint), 0.45) : bossCanvas(name, o.frame ? 1 : 0);
    if (name === "mini" || /^mini-/.test(name)) return miniSprite(name.replace(/^mini-?/, "") || "kit", o.frame ? 1 : 0);
    return itemCanvas("coin");
  };
  S.portrait = function (id, o) { return portrait(id, o); };
  S.pixel = {
    text: text, measure: measure, wrap: wrap, fit: fitText, height: textH,
    window: function (ctx, x, y, w, h, o) { return windowBox(ctx, x, y, w, h, o); },
    dither: dither, gradient: gradient, rect: rect, ellipse: ellipse, line: line, ring: ring,
    textClock: textClock,
  };
  S.inspect = function (t) {
    if (!GAMES.length) return [];
    REC = [];
    try { GAMES.forEach(function (g) { g.frame(t); }); } finally { var out = REC; REC = null; }
    return out.map(function (b) { return { kind: b.kind, label: b.label, x: b.x * K + OX, y: b.y * K + OY, w: b.w * K, h: b.h * K, moving: b.moving }; });
  };
  S.flush = function () { GAMES.forEach(function (g) { g.frame(V.time()); }); };
  S.u = function (px) { return px; };
  S.K = K;
  S.size = { W: LW, H: LH, scale: K };
})();

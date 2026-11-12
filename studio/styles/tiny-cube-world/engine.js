/* Tiny Cube World engine (style id: tiny-cube-world).
 *
 * Architecture
 * - Every world (S.iso.world) is ONE <canvas> covering the frame, redrawn from scratch for each time t by
 *   a single V.onFrame handler. The frame is a pure function of t: object state comes from build-time data
 *   (positions, appear times, paths) and t; randomness only from S.iso.hash (integer hash, no Math.random).
 * - Build time (templates, custom code): create worlds, ground tiles, roads, objects, life, labels, camera
 *   keyframes. Nothing is drawn yet.
 * - One frame (drawWorld): camera(t) -> projection; ground pass (island slabs, tiles, roads, shadows, ground
 *   flows, pings, painted text); object pass (objects sorted by footprint depth, each object's primitives
 *   sorted by base height then depth); over pass (clouds, planes, elevated arcs); label pass (callout
 *   cards laid out, pushed apart and clamped inside the safe area).
 * - Projection: world x east, y south, z up, in tiles. Rotate (x, y) about the island centre by yaw
 *   (45 = the classic view), screen = origin + K * (rx, ry / 2 - z * 0.866). K comes from fitting the
 *   island (or fitPoints) into the viewport for the current yaw, times the camera zoom.
 * - Timing: templates find each element's spoken word (V.find, then the label's longest content word,
 *   then a narration estimate, then even spreading), keep them in order and clamp them so every entrance
 *   ends about 1 s before V.duration. The island and its life are visible from frame 0.
 * - DOM is used only for headlines, captions and badges (S.iso.head, S.iso.caption), animated with
 *   V.timeline tweens. Labels live on the canvas so they move with the camera.
 *
 * Contract: window.SceneStyle (S) with S.render(templateId, root, props), S.flush(), S.fallback(root,
 * narration), S.inspect(t) and the custom API S.iso documented in docs.md.
 */
(function () {
  "use strict";
  var V = window.V;
  if (!V) return;
  var S = (window.SceneStyle = window.SceneStyle || {});
  var doc = document;
  var W = V.width, H = V.height, D = V.duration;
  var PORT = V.isPortrait;
  var PI = Math.PI, SQ3 = Math.sqrt(3) / 2;
  var FONT = '"Nunito", "Poppins", "Segoe UI Rounded", Inter, "Noto Sans", "Segoe UI", system-ui, sans-serif';

  // ------------------------- small utils -------------------------
  function u(px) { return V.s(px); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, p) { return a + (b - a) * p; }
  function num(v, d) { var n = typeof v === "number" ? v : parseFloat(v); return isFinite(n) ? n : d; }
  function str(v) { return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim(); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function smooth(p) { p = clamp(p, 0, 1); return p * p * (3 - 2 * p); }
  function frac(x) { return x - Math.floor(x); }
  var E = V.ease;
  function ez(name) { return typeof name === "function" ? name : E[name] || E.outCubic; }
  function prog(t, a, d) { return d > 0 ? clamp((t - a) / d, 0, 1) : t >= a ? 1 : 0; }
  // integer hash -> [0, 1): deterministic everywhere, never Math.random
  function hash(n) {
    var h = (Math.round(num(n, 0) * 1013) | 0) ^ 0x9e3779b9;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function hash2(a, b) { return hash(a * 7919 + b * 104729 + 17); }
  function normWord(s) {
    return String(s == null ? "" : s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
  }

  // ------------------------- colours -------------------------
  var rgbCache = {};
  function rgb(c) {
    if (rgbCache[c]) return rgbCache[c];
    var s = String(c).trim(), m, out = null;
    if ((m = /^#([0-9a-f]{3,8})$/i.exec(s))) {
      var h = m[1];
      if (h.length < 6) h = h.replace(/./g, function (x) { return x + x; });
      out = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
    } else if ((m = /^rgba?\(([^)]+)\)$/i.exec(s))) {
      var p = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat);
      out = [p[0] || 0, p[1] || 0, p[2] || 0, p.length > 3 ? p[3] : 1];
    }
    if (out) rgbCache[c] = out;
    return out;
  }
  function css(r, g, b, a) {
    r = Math.round(clamp(r, 0, 255)); g = Math.round(clamp(g, 0, 255)); b = Math.round(clamp(b, 0, 255));
    return a == null || a >= 1 ? "rgb(" + r + "," + g + "," + b + ")" : "rgba(" + r + "," + g + "," + b + "," + (+a.toFixed(3)) + ")";
  }
  var shadeCache = {};
  // f < 1 darkens toward black, f > 1 lightens toward white
  function shade(c, f) {
    f = Math.round(f * 100) / 100;
    var key = c + "|" + f;
    if (shadeCache[key]) return shadeCache[key];
    var q = rgb(c);
    if (!q) return c;
    var r, g, b;
    if (f <= 1) { r = q[0] * f; g = q[1] * f; b = q[2] * f; }
    else { var k = Math.min(1, f - 1); r = q[0] + (255 - q[0]) * k; g = q[1] + (255 - q[1]) * k; b = q[2] + (255 - q[2]) * k; }
    return (shadeCache[key] = css(r, g, b, q[3]));
  }
  function mix(a, b, p) {
    var x = rgb(a), y = rgb(b);
    if (!x || !y) return p < 0.5 ? a : b;
    return css(lerp(x[0], y[0], p), lerp(x[1], y[1], p), lerp(x[2], y[2], p), lerp(x[3], y[3], p));
  }
  function alpha(c, a) { var q = rgb(c); return q ? css(q[0], q[1], q[2], q[3] * a) : c; }

  // ------------------------- themes -------------------------
  var THEMES = {
    day: {
      bg: ["#CFE6EE", "#E3EEF1", "#F1F6F2"], grass: "#8FCC70", grass2: "#99D27B", lip: "#7DBB60", soil: "#C4925F", soil2: "#9C6D47",
      road: "#5F6782", line: "#F7F2E2", walk: "#D9DDE4", water: "#5DB8E2", water2: "#9AD8F2", plaza: "#ECE6DA", plaza2: "#DED6C7",
      ink: "#283050", muted: "#5B6488", accent: "#FF6F59",
      accents: ["#FF6F59", "#4C8DF6", "#FFB020", "#1FB89E", "#9B6CF0", "#F25FA8"],
      walls: ["#F6F0E6", "#FFE1C2", "#DCE7F5", "#F8D8D0", "#E6E0F4", "#D4EEE2"],
      roofs: ["#E2574C", "#4B6CB7", "#3E8E78", "#EF9638", "#7A5CC2"],
      glass: "#86BFE8", win: "#A8D2F2", lit: "#FFE08A", dark: "#454E6E", metal: "#AEB7C7",
      tree: ["#5DB25B", "#49A35A", "#78C35E"], trunk: "#8B5E3C", skin: ["#F2C7A5", "#D9A27C", "#A8714B", "#7A4E33"],
      card: "#FFFFFF", cardInk: "#283050", shadow: "rgba(36,44,84,0.17)", cable: "#46507A", data: "#FFB020", cloud: "#FFFFFF", night: 0,
    },
    dusk: {
      bg: ["#6F6AAE", "#E99A93", "#FBD7B4"], grass: "#86B867", grass2: "#90BE6E", lip: "#749F57", soil: "#B7835A", soil2: "#8A5F43",
      road: "#555A78", line: "#F7E6C8", walk: "#D2CDD6", water: "#5C9FD0", water2: "#9CC6E8", plaza: "#E8DCCB", plaza2: "#D8C8B4",
      ink: "#2B2950", muted: "#5E5A86", accent: "#FF6F59",
      accents: ["#FF6F59", "#5B8DEF", "#FFB020", "#22B39B", "#A070EE", "#F25FA8"],
      walls: ["#F4E3D4", "#FFD3B0", "#D8D8EE", "#F4C8C0", "#E2D4EE", "#D2E4D8"],
      roofs: ["#D9534A", "#4A5FA8", "#3B8170", "#E58A35", "#7357B5"],
      glass: "#8FA9DA", win: "#B9C3E4", lit: "#FFD27A", dark: "#43456A", metal: "#A9A9C2",
      tree: ["#57A257", "#468F52", "#6DB05A"], trunk: "#7E553A", skin: ["#F2C7A5", "#D9A27C", "#A8714B", "#7A4E33"],
      card: "#FFFFFF", cardInk: "#2B2950", shadow: "rgba(48,30,70,0.22)", cable: "#4A4A78", data: "#FFC24A", cloud: "#FFF1E6", night: 0.45,
    },
    night: {
      bg: ["#0E1430", "#18204A", "#252F60"], grass: "#3F6E5E", grass2: "#447563", lip: "#355E50", soil: "#56465E", soil2: "#3E3249",
      road: "#2E3554", line: "#C9C2A0", walk: "#4A5274", water: "#24508A", water2: "#4E86C4", plaza: "#4C5577", plaza2: "#434B6B",
      ink: "#F2F4FF", muted: "#AEB6E0", accent: "#FF7A66",
      accents: ["#FF7A66", "#46B4FF", "#FFC23D", "#2FE0B8", "#B07CFF", "#FF6BB5"],
      walls: ["#5F6896", "#6C6A99", "#55709A", "#78668F", "#5E7C8E", "#6B7296"],
      roofs: ["#A94A55", "#3D4E8C", "#2E6B66", "#B0703A", "#5F4A99"],
      glass: "#3F5F9E", win: "#3B4675", lit: "#FFD66B", dark: "#262C4A", metal: "#6E7799",
      tree: ["#2F6A55", "#2A5E4D", "#377661"], trunk: "#4F3A33", skin: ["#E8BFA0", "#CC9A78", "#9D6B49", "#704A31"],
      card: "#FFFFFF", cardInk: "#1C2246", shadow: "rgba(0,0,10,0.32)", cable: "#2B3E78", data: "#46E0FF", cloud: "#C9D2F2", night: 1,
    },
    mint: {
      bg: ["#C9EEE2", "#DDF5EC", "#F2FBF7"], grass: "#7FD3AE", grass2: "#89D9B5", lip: "#6CC09B", soil: "#B79BCB", soil2: "#9179AA",
      road: "#6A6F92", line: "#FFF8E8", walk: "#DCE4EA", water: "#62C4E4", water2: "#A2E2F4", plaza: "#EEF0EA", plaza2: "#DFE3DC",
      ink: "#283050", muted: "#5B6488", accent: "#FF6F59",
      accents: ["#FF6F59", "#5A8CF2", "#FFB020", "#2AA3A0", "#9B6CF0", "#F25FA8"],
      walls: ["#FFF6EC", "#FFE4CC", "#E2EAFA", "#FADCD6", "#EBE4F8", "#E0F4EA"],
      roofs: ["#EE6A5E", "#5A78C8", "#3E9A86", "#F3A24A", "#8A6AD0"],
      glass: "#93CFEA", win: "#B4DCF2", lit: "#FFE08A", dark: "#4C5676", metal: "#B4BECE",
      tree: ["#4FB58A", "#3FA57C", "#6BC596"], trunk: "#8B6A4E", skin: ["#F2C7A5", "#D9A27C", "#A8714B", "#7A4E33"],
      card: "#FFFFFF", cardInk: "#283050", shadow: "rgba(40,60,80,0.15)", cable: "#4C5A80", data: "#FFB020", cloud: "#FFFFFF", night: 0,
    },
  };
  function themeName(t) { t = str(t).toLowerCase(); return THEMES[t] ? t : "day"; }

  // ------------------------- text measuring -------------------------
  var mctx = null, mcache = {};
  function fontOf(size, weight) { return (weight || 800) + " " + Math.round(size * 10) / 10 + "px " + FONT; }
  function textW(text, size, weight) {
    var key = (weight || 800) + "|" + size + "|" + text;
    if (mcache[key] != null) return mcache[key];
    if (!mctx) mctx = doc.createElement("canvas").getContext("2d");
    mctx.font = fontOf(size, weight);
    return (mcache[key] = mctx.measureText(String(text)).width);
  }
  // Balanced wrap: the narrowest width that keeps the greedy line count (no orphan words).
  function wrapLines(text, size, weight, maxW, maxLines) {
    var words = str(text).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    function greedy(limit) {
      var lines = [], cur = "";
      words.forEach(function (wd) {
        var tryS = cur ? cur + " " + wd : wd;
        if (!cur || textW(tryS, size, weight) <= limit) cur = tryS;
        else { lines.push(cur); cur = wd; }
      });
      if (cur) lines.push(cur);
      return lines;
    }
    var base = greedy(maxW);
    if (base.length <= 1) return base;
    var lo = 0, hi = maxW;
    for (var i = 0; i < 14; i++) {
      var mid = (lo + hi) / 2;
      if (greedy(mid).length <= base.length) hi = mid; else lo = mid;
    }
    var out = greedy(hi);
    if (maxLines && out.length > maxLines) out = out.slice(0, maxLines - 1).concat([out.slice(maxLines - 1).join(" ")]);
    return out;
  }
  // "*word*" -> [{t, em}]
  function emParts(text) {
    var out = [], re = /\*([^*]+)\*/g, last = 0, m, s = str(text);
    while ((m = re.exec(s))) {
      if (m.index > last) out.push({ t: s.slice(last, m.index), em: false });
      out.push({ t: m[1], em: true });
      last = m.index + m[0].length;
    }
    if (last < s.length) out.push({ t: s.slice(last), em: false });
    return out;
  }
  function plainText(text) { return str(text).replace(/\*/g, ""); }

  // ------------------------- timing helpers (from the pilot) -------------------------
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
    if (after) { t = V.find(word, 0); if (t != null) return t; }
    return narrationEstimate(word, after);
  }
  function contentWords(text) {
    return plainText(text).split(/[^\p{L}\p{N}'-]+/u).filter(function (w) { var n = normWord(w); return n.length > 1 && !STOP[n]; });
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
  function syncTimes(keys, o) {
    o = o || {};
    var prev = 0, out = [];
    (keys || []).forEach(function (k) { var t = kwFind(k, prev); out.push(t); if (t != null) prev = t + 0.01; });
    out = spread(out);
    for (var i = 1; i < out.length; i++) if (out[i] < out[i - 1]) out[i] = out[i - 1];
    return out.map(function (t) { return Math.max(0, t - (o.lead || 0)); });
  }
  // Landing times for a list: each item's spoken word, kept in order, spaced and clamped so every
  // entrance (about 0.7 s) ends before the last second. o: {lo, hi, gap, a, b, after}
  function landsFor(list, labelOf, kwOf, o) {
    o = o || {};
    var n = list.length;
    if (!n) return [];
    var lo = o.lo != null ? o.lo : 0.35;
    var hi = o.hi != null ? o.hi : Math.max(lo + 0.3, D - 1.6);
    var prev = o.after || 0, out = [];
    list.forEach(function (it) {
      var t = labelTime(labelOf(it), kwOf(it), prev);
      if (t != null && t >= prev - 0.05) { out.push(t); prev = t + 0.05; } else out.push(null);
    });
    out = spread(out, o.a != null ? o.a : Math.max(lo, Math.min(0.8, D * 0.1)), o.b != null ? o.b : Math.min(hi, D * 0.78));
    var gap = Math.min(o.gap != null ? o.gap : 0.35, n > 1 ? (hi - lo) / (n - 1) : 1);
    for (var i = 0; i < n; i++) out[i] = clamp(out[i], lo, hi);
    for (i = 1; i < n; i++) if (out[i] < out[i - 1] + gap) out[i] = out[i - 1] + gap;
    if (out[n - 1] > hi) for (i = n - 1; i >= 0; i--) out[i] = Math.min(out[i], hi - (n - 1 - i) * gap);
    for (i = 0; i < n; i++) out[i] = Math.max(lo, out[i]);
    return out;
  }
  function fmtNum(n, dec, pre, suf) { return (pre || "") + V.format(n, dec || 0) + (suf || ""); }

  // ------------------------- state -------------------------
  var worlds = [], hooked = false, heads = [], domBoxes = [];
  function hook() {
    if (hooked) return;
    hooked = true;
    V.onFrame(function (t) { for (var i = 0; i < worlds.length; i++) drawWorld(worlds[i], t); });
  }
  function ensureWrap(root, theme) {
    root = root || V.root();
    for (var i = 0; i < root.children.length; i++) {
      var c = root.children[i];
      if (c.classList && c.classList.contains("iso")) return c;
    }
    var wr = doc.createElement("div");
    wr.className = "iso iso-" + theme;
    var b = THEMES[theme].bg;
    wr.style.background = "radial-gradient(ellipse at 50% 40%, rgba(255,255,255," + (theme === "night" ? 0.07 : 0.42) + ") 0%, rgba(255,255,255,0) 60%), linear-gradient(180deg, " + b[0] + " 0%, " + b[1] + " 55%, " + b[2] + " 100%)";
    root.appendChild(wr);
    return wr;
  }
  // Viewport (fractions of the frame) that leaves room for S.iso.head.
  function layout(hasHead, pos) {
    var r;
    if (PORT) r = !hasHead ? { x: 0, y: 0.16, w: 1, h: 0.57 } : pos === "bottom" ? { x: 0, y: 0.14, w: 1, h: 0.42 } : { x: 0, y: 0.29, w: 1, h: 0.45 };
    else r = !hasHead ? { x: 0.06, y: 0.07, w: 0.88, h: 0.86 } : pos === "bottom" ? { x: 0.06, y: 0.05, w: 0.88, h: 0.62 } : { x: 0.06, y: 0.21, w: 0.88, h: 0.75 };
    if (hasHead) r.head = pos === "bottom" ? "bottom" : "top";
    return r;
  }
  function safeRect() {
    if (PORT) return { x0: 66, y0: 256, x1: W - 66, y1: Math.min(H, 1444) };
    return { x0: W * 0.07 + 4, y0: H * 0.07 + 4, x1: W * 0.93 - 4, y1: H * 0.93 - 4 };
  }

  // ------------------------- world -------------------------
  function world(root, o) {
    o = obj(o);
    root = root || V.root();
    var th = themeName(o.theme);
    var pal = Object.assign({}, THEMES[th]);
    var wrap = ensureWrap(root, th);
    var cv = doc.createElement("canvas");
    cv.width = W; cv.height = H; cv.className = "iso-canvas";
    wrap.appendChild(cv);
    var cols = Math.max(1, Math.round(num(o.cols, 12))), rows = Math.max(1, Math.round(num(o.rows, 10)));
    var w = {
      cols: cols, rows: rows, pal: pal, theme: th, canvas: cv, ctx: cv.getContext("2d"), root: wrap, island: o.island !== false,
      thick: num(o.thickness, 0.9), headroom: num(o.headroom, 3), fill: num(o.fill, 0.94), crop: num(o.crop, 1.16), maxFitH: o.maxFitH,
      vp0: o.viewport || layout(false), vp: null, fitPoints: Array.isArray(o.fitPoints) && o.fitPoints.length ? o.fitPoints : null,
      objs: [], ground: [], over: [], labels: [], tiles: {}, roads: {}, slabs: [], flows: [], pings: [], gtexts: [], cloudList: [], cuts: [],
      cx: cols / 2, cy: rows / 2, camSegs: {}, camBase: { yaw: num(o.yaw, 45), zoom: num(o.zoom, 1) }, camSet: false, camDirty: true, breath: null,
      cur: null, _cmds: null, _tf: null, uid: 0, ready: false, lastLabels: [], lastKeys: [], stars: th === "night" && o.stars !== false,
      checker: o.checker !== false, index: worlds.length,
    };
    if (w.fitPoints) {
      var bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9;
      w.fitPoints.forEach(function (p) { bx0 = Math.min(bx0, p[0]); bx1 = Math.max(bx1, p[0]); by0 = Math.min(by0, p[1]); by1 = Math.max(by1, p[1]); });
      w.cx = (bx0 + bx1) / 2; w.cy = (by0 + by1) / 2;
    }
    if (w.island) w.slabs.push({ shape: rectPts(0, 0, cols, rows), thick: w.thick, at: null, hang: 0.8, main: true, dur: 0.8 });
    attachWorld(w);
    buildAPI(w);
    worlds.push(w);
    hook();
    return w;
  }
  function rectPts(x, y, ww, dd) { return [[x, y], [x + ww, y], [x + ww, y + dd], [x, y + dd]]; }
  function centroid(pts) { var x = 0, y = 0; pts.forEach(function (p) { x += p[0]; y += p[1]; }); return [x / pts.length, y / pts.length]; }

  // ------------------------- camera -------------------------
  function camVal(w, k, t) {
    var segs = w.camSegs[k];
    if (!segs || !segs.length) return w.camBase[k];
    if (w.camDirty) compileCam(w);
    for (var i = segs.length - 1; i >= 0; i--) {
      var s = segs[i];
      if (t >= s.at) return lerp(s.from, s.to, s.ease(prog(t, s.at, s.dur)));
    }
    return w.camBase[k];
  }
  function compileCam(w) {
    w.camDirty = false;
    for (var k in w.camSegs) {
      var segs = w.camSegs[k];
      segs.sort(function (a, b) { return a.at - b.at || a.id - b.id; });
      for (var i = 0; i < segs.length; i++) {
        var v = w.camBase[k];
        for (var j = i - 1; j >= 0; j--) if (segs[i].at >= segs[j].at) { v = lerp(segs[j].from, segs[j].to, segs[j].ease(prog(segs[i].at, segs[j].at, segs[j].dur))); break; }
        segs[i].from = v;
      }
    }
  }
  function camMoving(w, t) {
    for (var k in w.camSegs) {
      var s = w.camSegs[k];
      for (var i = 0; i < s.length; i++) if (s[i].dur > 0.05 && t > s[i].at && t < s[i].at + s[i].dur) return true;
    }
    return false;
  }
  function resolveVP(w) {
    var v = w.vp0, x = num(v.x, 0) * W, y = num(v.y, 0) * H, ww = num(v.w, 1) * W, hh = num(v.h, 1) * H;
    if (v.head) {
      var hd = headFor(w.root);
      if (hd) {
        var r = hd.rect;
        if (v.head === "top") { var y1 = y + hh; y = r.y + r.h + H * (PORT ? 0.012 : 0.02); hh = y1 - y; }
        else { var nb = r.y - H * 0.012; if (nb < y + hh) hh = nb - y; }
      }
    }
    w.vp = { x: x, y: y, w: ww, h: Math.max(H * 0.15, hh) };
  }
  function fitPts(w) {
    if (w._fitPts) return w._fitPts;
    var pts = [], hr = w.headroom, low = -(w.thick + 0.4);
    var src = w.fitPoints || rectPts(0, 0, w.cols, w.rows);
    src.forEach(function (p) { pts.push([p[0], p[1], p.length > 2 ? p[2] : hr], [p[0], p[1], low]); });
    return (w._fitPts = pts);
  }
  function fitAt(w, yaw) {
    var key = Math.round(yaw * 20);
    w._fitCache = w._fitCache || {};
    if (w._fitCache[key]) return w._fitCache[key];
    var a = (yaw * PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    fitPts(w).forEach(function (p) {
      var dx = p[0] - w.cx, dy = p[1] - w.cy, rx = dx * ca - dy * sa, ry = dx * sa + dy * ca, sy = ry * 0.5 - p[2] * SQ3;
      if (rx < x0) x0 = rx; if (rx > x1) x1 = rx; if (sy < y0) y0 = sy; if (sy > y1) y1 = sy;
    });
    var bw = Math.max(0.5, x1 - x0), bh = Math.max(0.5, y1 - y0), vp = w.vp;
    var K = Math.min((vp.w * w.fill * (PORT ? w.crop : 1)) / bw, (vp.h * w.fill) / bh);
    if (w.maxFitH) K = Math.min(K, (vp.h * w.maxFitH) / bh);
    return (w._fitCache[key] = { K: K, ucx: (x0 + x1) / 2, ucy: (y0 + y1) / 2 });
  }
  function setupWorld(w) {
    w.ready = true;
    resolveVP(w);
    var hasXYZ = ["x", "y", "z"].some(function (k) { return w.camSegs[k] && w.camSegs[k].length; });
    w.camAuto = !hasXYZ && !w.camSet;
    if (!w.camAuto) {
      var f = fitAt(w, w.camBase.yaw), a = (w.camBase.yaw * PI) / 180;
      if (w.camBase.x == null) w.camBase.x = w.cx + f.ucx * Math.cos(a);
      if (w.camBase.y == null) w.camBase.y = w.cy - f.ucx * Math.sin(a);
      if (w.camBase.z == null) w.camBase.z = -f.ucy / SQ3;
    }
    w.camDirty = true;
    w._tileList = Object.keys(w.tiles).map(function (k) { return w.tiles[k]; });
    w._roadList = Object.keys(w.roads).map(function (k) { return w.roads[k]; });
    w._roadList.forEach(function (r) {
      var bits = (r.m & 1 ? 1 : 0) + (r.m & 2 ? 1 : 0) + (r.m & 4 ? 1 : 0) + (r.m & 8 ? 1 : 0);
      if (bits === 1) { // a dead end on the island edge runs off the edge
        if (r.m === 2 && r.x === 0) r.m |= 8; if (r.m === 8 && r.x === w.cols - 1) r.m |= 2;
        if (r.m === 4 && r.y === 0) r.m |= 1; if (r.m === 1 && r.y === w.rows - 1) r.m |= 4;
      }
    });
    // cutaways: everything standing in front of the target at that moment sinks
    w.cuts.forEach(function (c) {
      camFrame(w, c.at);
      var tg = c.target, tc = [tg.x + tg.w / 2, tg.y + tg.d / 2];
      var cr = w.cur, tr = rotXY(w, tc[0], tc[1]);
      var half = (Math.abs(tg.w * cr.ca) + Math.abs(tg.d * cr.sa)) / 2;
      var halfD = (Math.abs(tg.w * cr.sa) + Math.abs(tg.d * cr.ca)) / 2;
      w.objs.forEach(function (o) {
        if (o === tg || o.layer === "over" || o.noCut || o.parent === tg) return;
        var oc = rotXY(w, o.x + o.w / 2, o.y + o.d / 2);
        var oh = (Math.abs(o.w * cr.ca) + Math.abs(o.d * cr.sa)) / 2;
        if (oc[1] > tr[1] + halfD * 0.6 && Math.abs(oc[0] - tr[0]) < half + oh + 1.2 && oc[1] - tr[1] < (c.depth || 7)) { o.cutAt = c.at; o.cutDur = c.dur; }
      });
    });
  }
  function rotXY(w, x, y) { var c = w.cur, dx = x - w.cx, dy = y - w.cy; return [dx * c.ca - dy * c.sa, dx * c.sa + dy * c.ca]; }
  function camFrame(w, t) {
    if (!w.vp) resolveVP(w);
    var yaw = camVal(w, "yaw", t), zoom = camVal(w, "zoom", t);
    if (w.breath) {
      var b = w.breath, q = smooth((t - b.t0) / Math.max(0.1, b.t1 - b.t0));
      yaw += b.sway * (2 * q - 1); zoom *= 1 + b.zoom * q;
    }
    var fit = fitAt(w, yaw);
    var a = (yaw * PI) / 180, ca = Math.cos(a), sa = Math.sin(a), K = fit.K * zoom, ux, uy;
    if (w.camAuto) { ux = fit.ucx; uy = fit.ucy; }
    else {
      var fx = camVal(w, "x", t), fy = camVal(w, "y", t), fz = camVal(w, "z", t), dx = fx - w.cx, dy = fy - w.cy;
      ux = dx * ca - dy * sa; uy = (dx * sa + dy * ca) * 0.5 - fz * SQ3;
    }
    var vx = w.vp.x + w.vp.w / 2, vy = w.vp.y + w.vp.h / 2;
    w.cur = { yaw: yaw, ca: ca, sa: sa, K: K, ox: vx - K * ux, oy: vy - K * uy, zoom: zoom, t: t };
  }

  // ------------------------- projection and primitives -------------------------
  function attachWorld(w) {
    function P(x, y, z) {
      var tf = w._tf;
      if (tf) { x = tf.ax + (x - tf.ax) * tf.sx; y = tf.ay + (y - tf.ay) * tf.sy; z = tf.az + (z - tf.az) * tf.sz + tf.dz; }
      var c = w.cur, dx = x - w.cx, dy = y - w.cy;
      return [c.ox + c.K * (dx * c.ca - dy * c.sa), c.oy + c.K * ((dx * c.sa + dy * c.ca) * 0.5 - z * SQ3)];
    }
    function zT(z) { var tf = w._tf; return tf ? tf.az + (z - tf.az) * tf.sz + tf.dz : z; }
    function rY(x, y) {
      var tf = w._tf;
      if (tf) { x = tf.ax + (x - tf.ax) * tf.sx; y = tf.ay + (y - tf.ay) * tf.sy; }
      return (x - w.cx) * w.cur.sa + (y - w.cy) * w.cur.ca;
    }
    function kS(units) { return units * w.cur.K * (w._tf ? w._tf.sx : 1); }
    function emit(z0, r, fn) {
      if (w._cmds) w._cmds.push({ z: Math.round(zT(z0) * 40), r: r, i: w._cmds.length, fn: fn });
      else fn(w.ctx);
    }
    w.P = P; w.K = kS; w.depthOf = rY; w.emit = emit;

    // normal in world -> {vis, f}
    function lightN(nx, ny, nz) {
      var c = w.cur, l = Math.hypot(nx, ny, nz) || 1;
      nx /= l; ny /= l; nz /= l;
      var nrx = nx * c.ca - ny * c.sa, nry = nx * c.sa + ny * c.ca;
      return { vis: nry * SQ3 + nz * 0.5 > 1e-4, f: 0.83 - 0.11 * nrx * (1 - Math.abs(nz)) + 0.24 * nz, nrx: nrx, nry: nry };
    }
    w.lightN = lightN;

    // Extruded polygon: visible sides (with optional windows / decorations) then the top.
    function prism(pts, z0, z1, color, o) {
      o = o || {};
      var n = pts.length;
      if (n < 3) return;
      var c = w.cur, cen = centroid(pts), faces = [];
      if (z1 - z0 > 1e-4) {
        for (var i = 0; i < n; i++) {
          var a = pts[i], b = pts[(i + 1) % n], ex = b[0] - a[0], ey = b[1] - a[1], len = Math.hypot(ex, ey);
          if (len < 1e-6) continue;
          var nx = ey / len, ny = -ex / len;
          if (nx * ((a[0] + b[0]) / 2 - cen[0]) + ny * ((a[1] + b[1]) / 2 - cen[1]) < 0) { nx = -nx; ny = -ny; }
          var nrx = nx * c.ca - ny * c.sa, nry = nx * c.sa + ny * c.ca;
          if (nry <= 1e-4) continue;
          faces.push({ i: i, len: len, f: 0.83 - 0.11 * nrx, r: rY((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), q: [P(a[0], a[1], z0), P(b[0], b[1], z0), P(b[0], b[1], z1), P(a[0], a[1], z1)] });
        }
        faces.sort(function (p, q) { return p.r - q.r; });
      }
      var top = o.noTop ? null : pts.map(function (p) { return P(p[0], p[1], z1); });
      var hgt = z1 - z0, seed = o.seed != null ? o.seed : Math.round(cen[0] * 31 + cen[1] * 17);
      var tColor = o.top || shade(color, 1.07);
      emit(o.z0 != null ? o.z0 : z0, rY(cen[0], cen[1]), function (ctx) {
        for (var k = 0; k < faces.length; k++) {
          var fc = faces[k], col = shade(color, fc.f * (o.dim || 1));
          fillPoly(ctx, fc.q, col);
          if (o.win) drawWin(w, ctx, fc.q, fc.len, hgt, o.win, fc.f, seed + fc.i * 101);
          if (o.deco) o.deco(ctx, fc.i, fc.q, fc.f);
        }
        if (top) {
          fillPoly(ctx, top, tColor);
          if (o.topDeco) o.topDeco(ctx, top);
        }
      });
    }
    function box(x, y, z, bw, bd, bh, color, o) {
      o = o || {};
      var pts;
      if (o.rot) {
        var cxx = x + bw / 2, cyy = y + bd / 2, cr = Math.cos(o.rot), sr = Math.sin(o.rot);
        pts = [[-bw / 2, -bd / 2], [bw / 2, -bd / 2], [bw / 2, bd / 2], [-bw / 2, bd / 2]].map(function (p) { return [cxx + p[0] * cr - p[1] * sr, cyy + p[0] * sr + p[1] * cr]; });
      } else pts = rectPts(x, y, bw, bd);
      prism(pts, z, z + Math.max(0, bh), color, o);
    }
    // Faces of a closed solid (each {p: [[x,y,z]...], color}); normals point away from centre c3.
    function solid(faces, c3, z0, o) {
      o = o || {};
      var list = [];
      faces.forEach(function (fc) {
        var p = fc.p, a = p[0], b = p[1], d = p[2];
        var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
        var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        var mx = 0, my = 0, mz = 0;
        p.forEach(function (q) { mx += q[0]; my += q[1]; mz += q[2]; });
        mx /= p.length; my /= p.length; mz /= p.length;
        if (nx * (mx - c3[0]) + ny * (my - c3[1]) + nz * (mz - c3[2]) < 0) { nx = -nx; ny = -ny; nz = -nz; }
        var L = lightN(nx, ny, nz);
        if (!L.vis && !fc.both) return;
        list.push({ s: p.map(function (q) { return P(q[0], q[1], q[2]); }), col: fc.flat ? fc.color : shade(fc.color, L.f * (o.dim || 1)), r: rY(mx, my) + mz * 0.001, deco: fc.deco, f: L.f });
      });
      list.sort(function (p, q) { return p.r - q.r; });
      emit(z0, rY(c3[0], c3[1]), function (ctx) {
        list.forEach(function (fc) { fillPoly(ctx, fc.s, fc.col); if (fc.deco) fc.deco(ctx, fc.s, fc.f); });
      });
    }
    function gable(x, y, z, bw, bd, bh, color, axis, o) {
      o = o || {};
      if (axis !== "x" && axis !== "y") axis = bw >= bd ? "x" : "y";
      var x1 = x + bw, y1 = y + bd, z1 = z + bh, wall = o.wall || shade(color, 1.25), F;
      if (axis === "x") {
        var ym = y + bd / 2;
        F = [{ p: [[x, y1, z], [x1, y1, z], [x1, ym, z1], [x, ym, z1]], color: color }, { p: [[x1, y, z], [x, y, z], [x, ym, z1], [x1, ym, z1]], color: color },
          { p: [[x1, y1, z], [x1, y, z], [x1, ym, z1]], color: wall }, { p: [[x, y, z], [x, y1, z], [x, ym, z1]], color: wall }];
      } else {
        var xm = x + bw / 2;
        F = [{ p: [[x1, y, z], [x1, y1, z], [xm, y1, z1], [xm, y, z1]], color: color }, { p: [[x, y1, z], [x, y, z], [xm, y, z1], [xm, y1, z1]], color: color },
          { p: [[x, y1, z], [x1, y1, z], [xm, y1, z1]], color: wall }, { p: [[x1, y, z], [x, y, z], [xm, y, z1]], color: wall }];
      }
      solid(F, [x + bw / 2, y + bd / 2, z + bh * 0.33], z, o);
    }
    function pyramid(x, y, z, bw, bd, bh, color, o) {
      var ax = x + bw / 2, ay = y + bd / 2, ap = [ax, ay, z + bh], x1 = x + bw, y1 = y + bd;
      solid([{ p: [[x, y1, z], [x1, y1, z], ap], color: color }, { p: [[x1, y1, z], [x1, y, z], ap], color: color },
        { p: [[x1, y, z], [x, y, z], ap], color: color }, { p: [[x, y, z], [x, y1, z], ap], color: color }], [ax, ay, z + bh * 0.25], z, o);
    }
    function cyl(cx, cy, z0, z1, r, color, o) {
      o = o || {};
      var b = P(cx, cy, z0), tp = P(cx, cy, z1), R = kS(r), Ry = R * 0.5;
      var bands = arr(o.bands).map(function (bd) { return { b: P(cx, cy, bd.z0 != null ? bd.z0 : bd[0]), t: P(cx, cy, bd.z1 != null ? bd.z1 : bd[1]), c: bd.color || bd[2] || shade(color, 0.7) }; });
      emit(z0, rY(cx, cy), function (ctx) {
        function side(bb, tt, col) {
          var g = ctx.createLinearGradient(bb[0] - R, 0, bb[0] + R, 0);
          g.addColorStop(0, shade(col, 0.97)); g.addColorStop(0.42, shade(col, 0.88)); g.addColorStop(1, shade(col, 0.7));
          ctx.beginPath(); ctx.moveTo(tt[0] - R, tt[1]); ctx.lineTo(bb[0] - R, bb[1]);
          ctx.ellipse(bb[0], bb[1], R, Ry, 0, PI, 0, true);
          ctx.lineTo(tt[0] + R, tt[1]);
          ctx.ellipse(tt[0], tt[1], R, Ry, 0, 0, PI, true);
          ctx.closePath(); ctx.fillStyle = g; ctx.fill();
        }
        if (Math.abs(tp[1] - b[1]) > 0.2) side(b, tp, color);
        bands.forEach(function (bd) { side(bd.b, bd.t, bd.c); });
        if (!o.noTop) { ctx.beginPath(); ctx.ellipse(tp[0], tp[1], R, Ry, 0, 0, 2 * PI); ctx.fillStyle = o.top || shade(color, 1.08); ctx.fill(); }
      });
    }
    function ball(cx, cy, z, r, color, o) {
      o = o || {};
      var c = P(cx, cy, z), R = kS(r);
      emit(o.z0 != null ? o.z0 : z - r, rY(cx, cy), function (ctx) {
        ctx.beginPath(); ctx.arc(c[0], c[1], R, 0, 2 * PI); ctx.fillStyle = shade(color, 0.82); ctx.fill();
        ctx.beginPath(); ctx.arc(c[0] - R * 0.16, c[1] - R * 0.18, R * 0.8, 0, 2 * PI); ctx.fillStyle = color; ctx.fill();
        if (!o.matte) { ctx.beginPath(); ctx.arc(c[0] - R * 0.36, c[1] - R * 0.4, R * 0.24, 0, 2 * PI); ctx.fillStyle = alpha(shade(color, 1.3), 0.6); ctx.fill(); }
      });
    }
    function dome(cx, cy, z, r, color, o) {
      var c = P(cx, cy, z), R = kS(r);
      emit(z, rY(cx, cy), function (ctx) {
        var g = ctx.createLinearGradient(c[0] - R, 0, c[0] + R, 0);
        g.addColorStop(0, shade(color, 1.06)); g.addColorStop(0.45, color); g.addColorStop(1, shade(color, 0.74));
        ctx.beginPath(); ctx.ellipse(c[0], c[1], R, R * 0.5, 0, 0, PI, false); ctx.arc(c[0], c[1], R, PI, 2 * PI, false); ctx.closePath();
        ctx.fillStyle = g; ctx.fill();
      });
    }
    function cone(cx, cy, z, r, h, color) {
      var c = P(cx, cy, z), ap = P(cx, cy, z + h), R = kS(r);
      emit(z, rY(cx, cy), function (ctx) {
        var g = ctx.createLinearGradient(c[0] - R, 0, c[0] + R, 0);
        g.addColorStop(0, shade(color, 1.05)); g.addColorStop(0.45, color); g.addColorStop(1, shade(color, 0.72));
        ctx.beginPath(); ctx.moveTo(ap[0], ap[1]); ctx.lineTo(c[0] - R, c[1]); ctx.ellipse(c[0], c[1], R, R * 0.5, 0, PI, 0, true); ctx.closePath();
        ctx.fillStyle = g; ctx.fill();
      });
    }
    function line3(points, color, width, o) {
      o = o || {};
      var pts = arr(points);
      if (pts.length < 2) return;
      var s = pts.map(function (p) { return P(p[0], p[1], p[2] || 0); }), zmin = 1e9, rr = 0;
      pts.forEach(function (p) { zmin = Math.min(zmin, p[2] || 0); rr += rY(p[0], p[1]); });
      var lw = width != null ? width : u(2.5);
      emit(o.z0 != null ? o.z0 : zmin, o.r != null ? o.r : rr / pts.length, function (ctx) {
        ctx.beginPath(); ctx.moveTo(s[0][0], s[0][1]);
        for (var i = 1; i < s.length; i++) ctx.lineTo(s[i][0], s[i][1]);
        ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineCap = o.cap || "round"; ctx.lineJoin = "round";
        if (o.dash) ctx.setLineDash(o.dash);
        ctx.stroke();
        if (o.dash) ctx.setLineDash([]);
      });
    }
    function flat(points, z, fillC, o) {
      o = o || {};
      var pts = arr(points);
      if (pts.length < 3) return;
      var s = pts.map(function (p) { return P(p[0], p[1], z); }), cc = centroid(pts);
      emit(z, rY(cc[0], cc[1]), function (ctx) { fillPoly(ctx, s, fillC, o.seam); if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || u(2); ctx.stroke(); } });
    }
    function disc(cx, cy, z, r, fillC, o) {
      o = o || {};
      var c = P(cx, cy, z), R = kS(r);
      emit(z, rY(cx, cy), function (ctx) {
        ctx.beginPath(); ctx.ellipse(c[0], c[1], R, R * 0.5, 0, 0, 2 * PI);
        if (fillC) { ctx.fillStyle = fillC; ctx.fill(); }
        if (o.stroke) { ctx.strokeStyle = o.stroke; ctx.lineWidth = o.lw || u(2); ctx.stroke(); }
      });
    }
    function glow(x, y, z, r, color, o) {
      o = o || {};
      var c = P(x, y, z), R = Math.max(1, kS(r));
      emit(z + 0.01, rY(x, y), function (ctx) {
        var g = ctx.createRadialGradient(c[0], c[1], 0, c[0], c[1], R);
        g.addColorStop(0, alpha(color, o.a != null ? o.a : 0.85)); g.addColorStop(0.35, alpha(color, (o.a != null ? o.a : 0.85) * 0.45)); g.addColorStop(1, alpha(color, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c[0], c[1], R, 0, 2 * PI); ctx.fill();
      });
    }
    function face(points3, normal, color, o) {
      o = o || {};
      var pts = arr(points3);
      if (pts.length < 3) return;
      var n = normal || [0, 0, 1], L = lightN(n[0], n[1], n[2]);
      if (!L.vis && !o.both) return;
      var s = pts.map(function (p) { return P(p[0], p[1], p[2]); }), zmin = 1e9, cx = 0, cy = 0;
      pts.forEach(function (p) { zmin = Math.min(zmin, p[2]); cx += p[0]; cy += p[1]; });
      var col = o.flat ? color : shade(color, L.f);
      emit(o.z0 != null ? o.z0 : zmin, rY(cx / pts.length, cy / pts.length), function (ctx) { fillPoly(ctx, s, col); if (o.deco) o.deco(ctx, s, L.f); });
    }
    w.prism = prism; w.box = box; w.solid = solid; w.gable = gable; w.pyramid = pyramid; w.cyl = cyl; w.ball = ball; w.dome = dome;
    w.cone = cone; w.line3 = line3; w.flat = flat; w.disc = disc; w.glow = glow; w.face = face;

    // ------------------------- camera API -------------------------
    var segId = 0;
    w.camera = {
      set: function (o) {
        o = obj(o);
        ["yaw", "zoom", "x", "y", "z"].forEach(function (k) { if (o[k] != null && isFinite(+o[k])) { w.camBase[k] = +o[k]; if (k !== "yaw" && k !== "zoom") w.camSet = true; } });
        w.camDirty = true; w._fitCache = {};
        return w.camera;
      },
      to: function (o, at, dur, ease) {
        o = obj(o);
        ["yaw", "zoom", "x", "y", "z"].forEach(function (k) {
          if (o[k] == null || !isFinite(+o[k])) return;
          (w.camSegs[k] = w.camSegs[k] || []).push({ at: Math.max(0, num(at, 0)), dur: Math.max(0.01, num(dur, 1)), to: +o[k], ease: ez(ease || "inOutCubic"), id: segId++ });
        });
        w.camDirty = true;
        return w.camera;
      },
      rotate: function (q, at, dur) { return w.camera.to({ yaw: 45 + 90 * num(q, 0) }, at, dur != null ? dur : 1.4); },
      focus: function (target, zoom, at, dur) {
        var p = pointOf(target);
        return w.camera.to({ x: p[0], y: p[1], z: p[2], zoom: num(zoom, 1.6) }, at, dur != null ? dur : 1.2);
      },
    };
    function pointOf(tg) {
      if (Array.isArray(tg)) return [num(tg[0], w.cx), num(tg[1], w.cy), num(tg[2], 0)];
      if (tg && tg.x != null) return [tg.x + (tg.w || 0) / 2, tg.y + (tg.d || 0) / 2, (tg.z || 0) + (tg.h || 0) * 0.45];
      return [w.cx, w.cy, 0];
    }
    w.pointOf = pointOf;

    // ------------------------- ground -------------------------
    var TILE = { road: 1, water: 1, field: 1, crop: 1, plaza: 1, park: 1, sand: 1, dirt: 1, rail: 1, grass: 1, glow: 1 };
    w.tile = function (x, y, type, at) {
      x = Math.round(num(x, 0)); y = Math.round(num(y, 0));
      type = TILE[type] ? type : "plaza";
      if (type === "road") { w.road([[x, y], [x, y]], { at: at }); return; }
      w.tiles[x + "," + y] = { x: x, y: y, type: type, at: at == null ? null : Math.max(0, +at) };
    };
    w.area = function (x0, y0, x1, y1, type, at) {
      var ax = Math.round(Math.min(x0, x1)), bx = Math.round(Math.max(x0, x1)), ay = Math.round(Math.min(y0, y1)), by = Math.round(Math.max(y0, y1));
      for (var x = ax; x <= bx; x++) for (var y = ay; y <= by; y++) w.tile(x, y, type, at);
    };
    w.road = function (points, o) {
      o = obj(o);
      var pts = arr(points).map(function (p) { return [Math.round(num(p[0], 0)), Math.round(num(p[1], 0))]; });
      if (!pts.length) return [];
      var seq = [pts[0]];
      for (var i = 1; i < pts.length; i++) {
        var a = seq[seq.length - 1], b = pts[i], x = a[0], y = a[1];
        while (x !== b[0]) { x += b[0] > x ? 1 : -1; seq.push([x, y]); }
        while (y !== b[1]) { y += b[1] > y ? 1 : -1; seq.push([x, y]); }
      }
      var at = o.at != null && isFinite(+o.at) ? Math.max(0, +o.at) : null, dur = num(o.dur, 0.8), n = seq.length;
      var prev = null;
      seq.forEach(function (p, k) {
        var key = p[0] + "," + p[1], r = w.roads[key];
        var ta = at == null ? null : at + (dur * k) / Math.max(1, n - 1);
        if (!r) r = w.roads[key] = { x: p[0], y: p[1], m: 0, at: ta, k: k };
        else r.at = r.at == null || ta == null ? null : Math.min(r.at, ta);
        if (prev) {
          var dx = p[0] - prev.x, dy = p[1] - prev.y;
          if (dx === 1) { prev.m |= 2; r.m |= 8; } else if (dx === -1) { prev.m |= 8; r.m |= 2; }
          else if (dy === 1) { prev.m |= 4; r.m |= 1; } else if (dy === -1) { prev.m |= 1; r.m |= 4; }
        }
        prev = r;
      });
      var out = [[seq[0][0] + 0.5, seq[0][1] + 0.5]];
      for (i = 1; i < seq.length - 1; i++) {
        var p0 = seq[i - 1], p1 = seq[i], p2 = seq[i + 1];
        if (p1[0] - p0[0] !== p2[0] - p1[0] || p1[1] - p0[1] !== p2[1] - p1[1]) out.push([p1[0] + 0.5, p1[1] + 0.5]);
      }
      if (seq.length > 1) out.push([seq[n - 1][0] + 0.5, seq[n - 1][1] + 0.5]);
      out.at = at; out.dur = dur;
      return out;
    };
    w.river = function (points, o) {
      o = obj(o);
      var pts = arr(points).map(function (p) { return [Math.round(num(p[0], 0)), Math.round(num(p[1], 0))]; });
      if (!pts.length) return [];
      var out = [[pts[0][0] + 0.5, pts[0][1] + 0.5]], x = pts[0][0], y = pts[0][1];
      w.tile(x, y, "water", o.at);
      for (var i = 1; i < pts.length; i++) {
        var b = pts[i];
        while (x !== b[0]) { x += b[0] > x ? 1 : -1; w.tile(x, y, "water", o.at); }
        while (y !== b[1]) { y += b[1] > y ? 1 : -1; w.tile(x, y, "water", o.at); }
        out.push([x + 0.5, y + 0.5]);
      }
      return out;
    };
    w.slabAdd = function (o) {
      o = obj(o);
      var shape = Array.isArray(o.shape) && o.shape.length >= 3 ? o.shape.map(function (p) { return [num(p[0], 0), num(p[1], 0)]; }) : rectPts(num(o.x, 0), num(o.y, 0), num(o.w, 4), num(o.d, 4));
      var s = { shape: shape, thick: num(o.thick, 0.8), at: o.at != null && isFinite(+o.at) ? Math.max(0, +o.at) : null, top: o.top || null, hang: num(o.hang, 0.7), dur: num(o.dur, 0.8), checker: !!o.checker };
      w.slabs.push(s);
      return s;
    };
    w.groundText = function (x, y, text, o) {
      o = obj(o);
      var g = { x: num(x, 0), y: num(y, 0), z: num(o.z, 0.02), text: plainText(text), size: num(o.size, 0.8), at: o.at != null ? Math.max(0, +o.at) : null, color: o.color || w.pal.ink, weight: o.weight || 900, a: num(o.alpha, 0.85) };
      w.gtexts.push(g);
      return g;
    };
    w.ping = function (x, y, o) {
      o = obj(o);
      var p = { x: num(x, 0), y: num(y, 0), z: num(o.z, 0.03), at: Math.max(0, num(o.at, 0)), color: o.color || w.pal.accent, radius: num(o.radius, 1.2), loop: !!o.loop, period: num(o.period, 1.8), until: o.until };
      w.pings.push(p);
      return p;
    };

    // ------------------------- objects -------------------------
    w.add = function (o) {
      o = o || {};
      o.x = num(o.x, 0); o.y = num(o.y, 0); o.w = num(o.w, 1); o.d = num(o.d, 1); o.h = num(o.h, 1);
      if (o.at != null) o.at = Math.max(0, num(o.at, 0));
      o.id = ++w.uid;
      o.world = w;
      if (typeof o.draw !== "function") o.draw = function () {};
      w.objs.push(o);
      return o;
    };
    w.label = function (anchor, text, o) {
      o = obj(o);
      var L = {
        anchor: anchor, text: plainText(text), at: Math.max(0, num(o.at, 0.2)), until: o.until != null ? +o.until : null, color: o.color || w.pal.accent,
        value: o.value && typeof o.value === "object" ? o.value : null, big: o.big != null ? str(o.big) : "", lift: o.lift != null ? +o.lift : null,
        side: o.side || null, size: o.size ? +o.size : null, plain: !!o.plain, badge: o.badge != null ? str(o.badge) : "", key: o.key !== false, dim: o.dim,
        maxW: o.maxW ? +o.maxW : null, z: o.z || 0,
      };
      w.labels.push(L);
      return L;
    };
    w.cutaway = function (target, at, dur) { if (target) w.cuts.push({ target: target, at: Math.max(0, num(at, 0)), dur: num(dur, 0.8) }); };
  }

  function fillPoly(ctx, pts, color, seam) {
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    if (seam !== false) { ctx.strokeStyle = color; ctx.lineWidth = 0.9; ctx.lineJoin = "round"; ctx.stroke(); }
  }
  function bil(q, uu, vv) { return [q[0][0] + (q[1][0] - q[0][0]) * uu + (q[3][0] - q[0][0]) * vv, q[0][1] + (q[1][1] - q[0][1]) * uu + (q[3][1] - q[0][1]) * vv]; }
  function quadUV(ctx, q, u0, v0, u1, v1, color) {
    var a = bil(q, u0, v0), b = bil(q, u1, v0), c = bil(q, u1, v1), d = bil(q, u0, v1);
    ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
  }
  // Window grid (or ribbons) on one side face q = [bottom a, bottom b, top b, top a].
  function drawWin(w, ctx, q, len, hgt, win, f, seed) {
    win = win === true ? {} : win;
    var rows = Math.max(1, Math.round(win.rows || Math.max(1, hgt / 0.36)));
    var cols = Math.max(1, Math.round(win.cols || Math.max(1, len / 0.4)));
    var nightF = win.lit != null ? (win.lit === true ? 0.9 : +win.lit) : w.pal.night * 0.7;
    var base = win.color || w.pal.win, litC = w.pal.lit, t = w.cur.t;
    var my0 = win.bottom != null ? win.bottom : 0.1, my1 = win.top != null ? win.top : 0.08, mx = win.mx != null ? win.mx : 0.12;
    var ch = (1 - my0 - my1) / rows;
    if (win.ribbon) {
      for (var r = 0; r < rows; r++) {
        var v0 = my0 + r * ch + ch * 0.22, v1 = v0 + ch * 0.56, lit = hash(seed + r * 13) < nightF;
        quadUV(ctx, q, 0.04, v0, 0.96, v1, lit ? litC : shade(base, f));
      }
      return;
    }
    var cw = (1 - 2 * mx) / cols;
    for (r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var u0 = mx + c * cw + cw * 0.2, u1 = u0 + cw * 0.6, w0 = my0 + r * ch + ch * 0.24, w1 = w0 + ch * 0.5;
        var on = hash(seed + r * 31 + c * 7) < nightF;
        if (win.blink) on = hash(seed + r * 31 + c * 7 + Math.floor(t * (win.blink || 2)) * 53) < 0.5;
        quadUV(ctx, q, u0, w0, u1, w1, on ? (win.litColor || litC) : shade(base, f));
      }
    }
  }

  // ------------------------- object state (entrances, exits, cutaways) -------------------------
  function objState(o, t) {
    if (o.hidden) return null;
    if (o.at != null && t < o.at) return null;
    var st = { sx: 1, sy: 1, sz: 1, dz: 0, alpha: 1, p: 1 };
    if (o.at != null) {
      var p = prog(t, o.at, o.dur || 0.7), an = o.anim || "rise";
      st.p = p;
      if (p < 1) {
        if (an === "rise") st.sz = Math.max(0.02, E.outBack(p));
        else if (an === "drop") { st.dz = (1 - E.outBounce(p)) * (o.dropH || 5); st.alpha = Math.min(1, p * 6); }
        else if (an === "pop") { var s = Math.max(0.01, E.outBack(p)); st.sx = st.sy = st.sz = s; }
        else if (an === "grow") { var g = Math.max(0.01, E.outCubic(p)); st.sx = st.sy = st.sz = g; }
        else if (an === "fade") st.alpha = p;
      }
    }
    if (o.leaveAt != null && t >= o.leaveAt) {
      var q = prog(t, o.leaveAt, o.leaveDur || 0.5);
      if (q >= 1) return null;
      st.sz *= Math.max(0.02, 1 - E.inCubic(q)); st.alpha *= 1 - q * q;
    }
    if (o.cutAt != null && t >= o.cutAt) {
      var c = E.inOutCubic(prog(t, o.cutAt, o.cutDur || 0.8));
      st.sz *= Math.max(0.035, 1 - c); st.alpha *= 1 - c * 0.7;
    }
    return st;
  }
  var errSeen = {};
  function errOnce(e, where) {
    var m = "[isometric " + where + "] " + (e && e.message ? e.message : String(e));
    if (errSeen[m]) return;
    errSeen[m] = 1;
    V.error(m);
  }

  // ------------------------- frame -------------------------
  function drawWorld(w, t) {
    if (!w.ready) setupWorld(w);
    camFrame(w, t);
    var ctx = w.ctx, i;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    w._tf = null; w._cmds = null;
    if (w.stars) drawStars(w, t);
    var vis = [], over = [];
    for (i = 0; i < w.objs.length; i++) {
      var o = w.objs[i];
      if (o.update) { try { o.update(t, w, o); } catch (e) { errOnce(e, "update"); } }
      var st = objState(o, t);
      if (st && o.alphaMul != null) st.alpha *= o.alphaMul;
      o.st = st && st.alpha > 0.004 ? st : null;
      if (!o.st) continue;
      (o.layer === "over" ? over : vis).push(o);
    }
    // ground pass
    w._clip = [];
    var slabs = w.slabs.map(function (s) { var c = centroid(s.shape); return { s: s, k: rotXY(w, c[0], c[1])[1] }; }).sort(function (a, b) { return a.k - b.k; });
    slabs.forEach(function (e) { drawSlab(w, e.s, t); });
    drawTiles(w, t);
    drawShadows(w, t, vis.concat(over));
    w.ground.forEach(function (fn) { try { fn(w, ctx, t); } catch (e) { errOnce(e, "ground"); } });
    w.flows.forEach(function (F) { if (!F.over) drawFlow(w, F, t); });
    w.pings.forEach(function (p) { drawPing(w, p, t); });
    w.gtexts.forEach(function (g) { drawGText(w, g, t); });
    // objects
    vis.forEach(function (o) { o._k = rotXY(w, o.x + o.w / 2, o.y + o.d / 2)[1] + (o.bias || 0); });
    vis.sort(function (a, b) { return a._k - b._k || a.id - b.id; });
    w.lastKeys = [];
    vis.forEach(function (o) { drawObj(w, o, t); });
    // over pass
    drawClouds(w, t);
    over.forEach(function (o) { o._k = rotXY(w, o.x + o.w / 2, o.y + o.d / 2)[1] + (o.z || 0) * 0.01; });
    over.sort(function (a, b) { return a._k - b._k || a.id - b.id; });
    over.forEach(function (o) { drawObj(w, o, t); });
    w.flows.forEach(function (F) { if (F.over) drawFlow(w, F, t); });
    w.over.forEach(function (fn) { try { fn(w, ctx, t); } catch (e) { errOnce(e, "over"); } });
    ctx.globalAlpha = 1;
    w.lastLabels = drawLabels(w, t);
    w.lastT = t;
  }
  function drawObj(w, o, t) {
    var st = o.st, ctx = w.ctx;
    w._tf = { ax: o.x + o.w / 2, ay: o.y + o.d / 2, az: o.z || 0, sx: st.sx, sy: st.sy, sz: st.sz, dz: st.dz };
    ctx.globalAlpha = clamp(st.alpha, 0, 1);
    w._cmds = [];
    try { o.draw(w, ctx, t, o); } catch (e) { errOnce(e, "draw " + (o.type || "object")); }
    var cm = w._cmds;
    w._cmds = null;
    if (!o.manual) cm.sort(function (a, b) { return a.z - b.z || a.r - b.r || a.i - b.i; });
    for (var k = 0; k < cm.length; k++) { try { cm[k].fn(ctx); } catch (e) { errOnce(e, "paint"); } }
    if (o.key) {
      var top = (o.z || 0) + (o.top != null ? o.top : o.h), x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      [[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.d], [o.x, o.y + o.d]].forEach(function (p) {
        [o.z || 0, top].forEach(function (z) { var s = w.P(p[0], p[1], z); x0 = Math.min(x0, s[0]); x1 = Math.max(x1, s[0]); y0 = Math.min(y0, s[1]); y1 = Math.max(y1, s[1]); });
      });
      w.lastKeys.push({ kind: o.type || "object", label: o.keyLabel || o.type || "object", x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
    w._tf = null;
    if (o.anim === "drop" && o.at != null) {
      var tl = o.at + (o.dur || 0.7) * 0.364, q = (t - tl) / 0.55;
      if (q > 0 && q < 1) {
        ctx.globalAlpha = (1 - q) * 0.75;
        for (var d = 0; d < 7; d++) {
          var an = (d / 7) * 2 * PI + 0.4, rr = Math.max(o.w, o.d) * 0.5 + q * 0.35;
          var p = w.P(o.x + o.w / 2 + Math.cos(an) * rr, o.y + o.d / 2 + Math.sin(an) * rr, 0.06 + q * 0.12);
          ctx.beginPath(); ctx.arc(p[0], p[1], w.cur.K * (0.07 + q * 0.09), 0, 2 * PI); ctx.fillStyle = "#FFFFFF"; ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }
  function drawStars(w, t) {
    var ctx = w.ctx;
    for (var i = 0; i < 70; i++) {
      var x = hash(i * 3 + 1) * W, y = hash(i * 3 + 2) * H * 0.75, a = 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * (1 + hash(i) * 2) + i));
      ctx.globalAlpha = a; ctx.fillStyle = "#FFFFFF";
      ctx.beginPath(); ctx.arc(x, y, u(1.2 + hash(i * 7) * 1.8), 0, 2 * PI); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  function tq(w, x0, y0, x1, y1, z) { return [w.P(x0, y0, z), w.P(x1, y0, z), w.P(x1, y1, z), w.P(x0, y1, z)]; }
  function drawSlab(w, s, t) {
    var ctx = w.ctx, pal = w.pal, dz = 0, al = 1;
    if (s.at != null) {
      var p = prog(t, s.at, s.dur);
      if (p <= 0) return;
      dz = -(1 - E.outBack(p)) * 3; al = clamp(p * 2.5, 0, 1);
    }
    w._tf = dz ? { ax: 0, ay: 0, az: 0, sx: 1, sy: 1, sz: 1, dz: dz } : null;
    ctx.globalAlpha = al;
    var sh = s.shape, cen = centroid(sh), low = -s.thick, hz = low - s.hang, c = w.cur;
    if (s.hang > 0) {
      var insD = s.hang * 0.8, inner = sh.map(function (q) { var dx = q[0] - cen[0], dy = q[1] - cen[1], L = Math.hypot(dx, dy) || 1, k = Math.max(0.2, 1 - insD / L); return [cen[0] + dx * k, cen[1] + dy * k]; }), hf = [];
      for (var i = 0; i < sh.length; i++) {
        var a = sh[i], b = sh[(i + 1) % sh.length], ex = b[0] - a[0], ey = b[1] - a[1], len = Math.hypot(ex, ey) || 1;
        var nx = ey / len, ny = -ex / len;
        if (nx * ((a[0] + b[0]) / 2 - cen[0]) + ny * ((a[1] + b[1]) / 2 - cen[1]) < 0) { nx = -nx; ny = -ny; }
        var nrx = nx * c.ca - ny * c.sa, nry = nx * c.sa + ny * c.ca;
        if (nry <= 0.02) continue;
        hf.push({ r: w.depthOf((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), f: 0.7 - 0.1 * nrx, q: [w.P(a[0], a[1], low), w.P(b[0], b[1], low), w.P(inner[(i + 1) % sh.length][0], inner[(i + 1) % sh.length][1], hz), w.P(inner[i][0], inner[i][1], hz)] });
      }
      hf.sort(function (x, y) { return x.r - y.r; });
      hf.forEach(function (f) { fillPoly(ctx, f.q, shade(pal.soil2, f.f + 0.12)); });
    }
    w.prism(sh, low, 0, s.side || pal.soil, { noTop: true });
    w.prism(sh, low * 0.55, low * 0.5, shade(s.side || pal.soil, 0.9), { noTop: true });
    w.prism(sh, -0.16, 0, s.lip || pal.lip, { noTop: true });
    var top = sh.map(function (q) { return w.P(q[0], q[1], 0); });
    fillPoly(ctx, top, s.top || pal.grass);
    w._clip.push(top);
    if (s.checker) {
      ctx.save(); ctx.beginPath(); ctx.moveTo(top[0][0], top[0][1]); for (var ti = 1; ti < top.length; ti++) ctx.lineTo(top[ti][0], top[ti][1]); ctx.closePath(); ctx.clip();
      var xs = sh.map(function (q) { return q[0]; }), ys = sh.map(function (q) { return q[1]; });
      for (var x = Math.ceil(Math.min.apply(null, xs)); x < Math.max.apply(null, xs); x++)
        for (var y = Math.ceil(Math.min.apply(null, ys)); y < Math.max.apply(null, ys); y++)
          if (hash2(x, y) > 0.55 && inPoly(sh, x + 0.5, y + 0.5)) fillPoly(ctx, tq(w, x, y, x + 1, y + 1, 0.001), pal.grass2, false);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    w._tf = null;
  }
  function inPoly(pts, x, y) {
    var ins = false;
    for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      var a = pts[i], b = pts[j];
      if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) ins = !ins;
    }
    return ins;
  }
  function drawTiles(w, t) {
    var ctx = w.ctx, pal = w.pal;
    if (w.island && w.checker) {
      if (!w._checker) {
        w._checker = [];
        for (var y = 0; y < w.rows; y++) for (var x = 0; x < w.cols; x++) if (!w.tiles[x + "," + y] && !w.roads[x + "," + y] && hash2(x, y) > 0.55) w._checker.push([x, y]);
      }
      w._checker.forEach(function (q) { fillPoly(ctx, tq(w, q[0], q[1], q[0] + 1, q[1] + 1, 0.001), pal.grass2, false); });
    }
    w._tileList.forEach(function (tl) {
      var a = tl.at == null ? 1 : prog(t, tl.at, 0.35);
      if (a <= 0) return;
      ctx.globalAlpha = a;
      drawTile(w, tl, t);
    });
    w._roadList.forEach(function (r) {
      var a = r.at == null ? 1 : prog(t, r.at, 0.25);
      if (a <= 0) return;
      ctx.globalAlpha = a;
      drawRoad(w, r);
    });
    ctx.globalAlpha = 1;
  }
  function drawRoad(w, r) {
    var ctx = w.ctx, pal = w.pal, x = r.x, y = r.y, m = r.m, s = 0.17, z = 0.004;
    fillPoly(ctx, tq(w, x, y, x + 1, y + 1, z), pal.road);
    var wc = pal.walk;
    if (!(m & 1)) fillPoly(ctx, tq(w, x, y, x + 1, y + s, z), wc);
    if (!(m & 2)) fillPoly(ctx, tq(w, x + 1 - s, y, x + 1, y + 1, z), wc);
    if (!(m & 4)) fillPoly(ctx, tq(w, x, y + 1 - s, x + 1, y + 1, z), wc);
    if (!(m & 8)) fillPoly(ctx, tq(w, x, y, x + s, y + 1, z), wc);
    if (m & 1 && m & 2) fillPoly(ctx, tq(w, x + 1 - s, y, x + 1, y + s, z), wc);
    if (m & 2 && m & 4) fillPoly(ctx, tq(w, x + 1 - s, y + 1 - s, x + 1, y + 1, z), wc);
    if (m & 4 && m & 8) fillPoly(ctx, tq(w, x, y + 1 - s, x + s, y + 1, z), wc);
    if (m & 8 && m & 1) fillPoly(ctx, tq(w, x, y, x + s, y + s, z), wc);
    var bits = (m & 1 ? 1 : 0) + (m & 2 ? 1 : 0) + (m & 4 ? 1 : 0) + (m & 8 ? 1 : 0), lc = alpha(pal.line, 0.9), z2 = 0.006;
    if (m === 10) { fillPoly(ctx, tq(w, x + 0.1, y + 0.475, x + 0.38, y + 0.525, z2), lc, false); fillPoly(ctx, tq(w, x + 0.62, y + 0.475, x + 0.9, y + 0.525, z2), lc, false); }
    else if (m === 5) { fillPoly(ctx, tq(w, x + 0.475, y + 0.1, x + 0.525, y + 0.38, z2), lc, false); fillPoly(ctx, tq(w, x + 0.475, y + 0.62, x + 0.525, y + 0.9, z2), lc, false); }
    else if (bits >= 3) {
      for (var k = 0; k < 4; k++) {
        var a0 = 0.22 + k * 0.155, a1 = a0 + 0.08;
        if (m & 1) fillPoly(ctx, tq(w, x + a0, y + 0.03, x + a1, y + 0.15, z2), lc, false);
        if (m & 4) fillPoly(ctx, tq(w, x + a0, y + 0.85, x + a1, y + 0.97, z2), lc, false);
        if (m & 2) fillPoly(ctx, tq(w, x + 0.85, y + a0, x + 0.97, y + a1, z2), lc, false);
        if (m & 8) fillPoly(ctx, tq(w, x + 0.03, y + a0, x + 0.15, y + a1, z2), lc, false);
      }
    }
  }
  function drawTile(w, tl, t) {
    var ctx = w.ctx, pal = w.pal, x = tl.x, y = tl.y, z = 0.003, k;
    var Q = function (a, b, c, d, col) { fillPoly(ctx, tq(w, x + a, y + b, x + c, y + d, z + 0.001), col, false); };
    switch (tl.type) {
      case "water":
        fillPoly(ctx, tq(w, x, y, x + 1, y + 1, z), pal.water);
        var nb = function (dx, dy) { var q = w.tiles[x + dx + "," + (y + dy)]; return q && q.type === "water"; };
        var fc = alpha(pal.water2, 0.9);
        if (!nb(0, -1)) Q(0, 0, 1, 0.07, fc); if (!nb(0, 1)) Q(0, 0.93, 1, 1, fc);
        if (!nb(-1, 0)) Q(0, 0, 0.07, 1, fc); if (!nb(1, 0)) Q(0.93, 0, 1, 1, fc);
        for (k = 0; k < 2; k++) {
          var ph = frac(t * 0.22 + hash2(x, y + k * 9)), sx = 0.12 + ph * 0.6, sy = 0.28 + k * 0.4;
          ctx.globalAlpha *= 1; Q(sx, sy, sx + 0.22, sy + 0.035, alpha(pal.water2, 0.75 * Math.sin(ph * PI)));
        }
        break;
      case "field":
        fillPoly(ctx, tq(w, x, y, x + 1, y + 1, z), mix(pal.soil, "#E7C58A", 0.35));
        for (k = 0; k < 4; k++) Q(0.06, 0.1 + k * 0.23, 0.94, 0.17 + k * 0.23, shade(pal.soil, 0.9));
        break;
      case "crop":
        fillPoly(ctx, tq(w, x, y, x + 1, y + 1, z), mix(pal.soil, "#E8D58C", 0.45));
        for (k = 0; k < 4; k++) Q(0.06, 0.08 + k * 0.23, 0.94, 0.19 + k * 0.23, shade(pal.grass, 0.82));
        break;
      case "plaza":
        fillPoly(ctx, tq(w, x, y, x + 1, y + 1, z), pal.plaza);
        Q(0, 0, 1, 0.025, pal.plaza2); Q(0, 0, 0.025, 1, pal.plaza2); Q(0, 0.49, 1, 0.51, alpha(pal.plaza2, 0.6)); Q(0.49, 0, 0.51, 1, alpha(pal.plaza2, 0.6));
        break;
      case "park":
        fillPoly(ctx, tq(w, x, y, x + 1, y + 1, z), shade(pal.grass, 0.94));
        for (k = 0; k < 3; k++) { var px = 0.15 + hash2(x + k, y) * 0.7, py = 0.15 + hash2(x, y + k) * 0.7; Q(px, py, px + 0.07, py + 0.07, k ? "#FFE58A" : "#FFFFFF"); }
        break;
      case "sand": fillPoly(ctx, tq(w, x, y, x + 1, y + 1, z), mix("#EFDAA6", pal.plaza, pal.night * 0.6)); break;
      case "dirt": fillPoly(ctx, tq(w, x, y, x + 1, y + 1, z), shade(pal.soil, 1.12)); break;
      case "grass": fillPoly(ctx, tq(w, x, y, x + 1, y + 1, z), pal.grass); break;
      case "glow": fillPoly(ctx, tq(w, x + 0.04, y + 0.04, x + 0.96, y + 0.96, z), alpha(pal.accent, 0.35), false); break;
      case "rail":
        fillPoly(ctx, tq(w, x, y, x + 1, y + 1, z), pal.plaza2);
        var vert = !!(w.tiles[x + "," + (y - 1)] && w.tiles[x + "," + (y - 1)].type === "rail") || !!(w.tiles[x + "," + (y + 1)] && w.tiles[x + "," + (y + 1)].type === "rail");
        for (k = 0; k < 4; k++) { var a0 = 0.06 + k * 0.25; if (vert) Q(0.2, a0, 0.8, a0 + 0.09, pal.soil2); else Q(a0, 0.2, a0 + 0.09, 0.8, pal.soil2); }
        if (vert) { Q(0.3, 0, 0.34, 1, pal.metal); Q(0.66, 0, 0.7, 1, pal.metal); } else { Q(0, 0.3, 1, 0.34, pal.metal); Q(0, 0.66, 1, 0.7, pal.metal); }
        break;
    }
  }
  function hull(pts) {
    pts = pts.slice().sort(function (a, b) { return a[0] - b[0] || a[1] - b[1]; });
    if (pts.length < 3) return pts;
    function cr(o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); }
    var lo = [], up = [], i;
    for (i = 0; i < pts.length; i++) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], pts[i]) <= 0) lo.pop(); lo.push(pts[i]); }
    for (i = pts.length - 1; i >= 0; i--) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], pts[i]) <= 0) up.pop(); up.push(pts[i]); }
    up.pop(); lo.pop();
    return lo.concat(up);
  }
  function areaOf(p) { var s = 0; for (var i = 0; i < p.length; i++) { var a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s; }
  function drawShadows(w, t, list) {
    var ctx = w.ctx, c = w.cur;
    if (!w._clip.length) return;
    ctx.save();
    ctx.beginPath();
    w._clip.forEach(function (poly) { ctx.moveTo(poly[0][0], poly[0][1]); for (var i = 1; i < poly.length; i++) ctx.lineTo(poly[i][0], poly[i][1]); ctx.closePath(); });
    ctx.clip();
    ctx.beginPath();
    function ell(x, y, rx, ry) { ctx.moveTo(x + rx, y); ctx.ellipse(x, y, rx, ry, 0, 0, 2 * PI); }
    list.forEach(function (o) {
      if (o.shadow === false || !o.st) return;
      var st = o.st, hh = (o.shadowH != null ? o.shadowH : o.top != null ? Math.min(o.top, o.h * 1.4) : o.h) * st.sz;
      var L = Math.min(Math.max(0, hh), 2.4) * 0.62 * c.K, vx = L * 0.74, vy = -L * 0.1;
      var ax = o.x + o.w / 2, ay = o.y + o.d / 2;
      w._tf = { ax: ax, ay: ay, az: 0, sx: st.sx, sy: st.sy, sz: 1, dz: 0 };
      if ((o.z || 0) > 0.3 || o.layer === "over") {
        w._tf = null;
        var g = w.P(ax, ay, 0), R = Math.max(o.w, o.d) * 0.42 * c.K * st.sx;
        ell(g[0] + c.K * 0.35, g[1] - c.K * 0.05, R, R * 0.45);
        return;
      }
      if (L < 0.5) return;
      if (o.round) {
        var cc = w.P(ax, ay, 0), R2 = o.round * c.K * st.sx;
        ell(cc[0] + vx * 0.5, cc[1] + vy * 0.5, R2 + vx * 0.5, R2 * 0.5 + Math.abs(vy) * 0.5 + L * 0.05);
      } else {
        var ins = o.sInset != null ? o.sInset : 0.12, x0 = o.x + ins, y0 = o.y + ins, x1 = o.x + o.w - ins, y1 = o.y + o.d - ins;
        var base = [w.P(x0, y0, 0), w.P(x1, y0, 0), w.P(x1, y1, 0), w.P(x0, y1, 0)], all = base.slice();
        base.forEach(function (p) { all.push([p[0] + vx, p[1] + vy]); });
        var hl = hull(all);
        if (areaOf(hl) < 0) hl.reverse();
        ctx.moveTo(hl[0][0], hl[0][1]);
        for (var i = 1; i < hl.length; i++) ctx.lineTo(hl[i][0], hl[i][1]);
        ctx.closePath();
      }
    });
    w._tf = null;
    w.cloudList.forEach(function (cl) {
      var s = cloudPos(w, cl, t);
      if (s.a <= 0) return;
      var g = w.P(s.x + 0.8, s.y + 0.2, 0), R = cl.size * 0.9 * c.K;
      ell(g[0], g[1], R, R * 0.42);
    });
    ctx.fillStyle = w.pal.shadow;
    ctx.fill();
    ctx.restore();
  }

  // ------------------------- paths, flows, pings, painted text -------------------------
  function mkPath(points, closed) {
    var pts = arr(points).filter(function (p) { return Array.isArray(p) && p.length >= 2; }).map(function (p) { return [num(p[0], 0), num(p[1], 0), p.length > 2 ? num(p[2], 0) : 0]; });
    if (!pts.length) return null;
    if (pts.length === 1) pts.push(pts[0].slice());
    if (closed) pts.push(pts[0].slice());
    var cum = [0];
    for (var i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]));
    return { pts: pts, cum: cum, len: Math.max(1e-4, cum[cum.length - 1]), closed: !!closed };
  }
  function pathAt(pa, s) {
    s = clamp(s, 0, pa.len);
    var c = pa.cum, i = 1;
    while (i < c.length - 1 && c[i] < s) i++;
    var a = pa.pts[i - 1], b = pa.pts[i], seg = c[i] - c[i - 1], q = seg > 0 ? (s - c[i - 1]) / seg : 0;
    return [lerp(a[0], b[0], q), lerp(a[1], b[1], q), lerp(a[2], b[2], q)];
  }
  function travel(pa, t, speed, phase, mode, t0) {
    var L = pa.len, d = Math.max(0, t - (t0 || 0)) * speed + phase * L, s, dir = 1, a = 1;
    if (mode === "pingpong") { var m = d % (2 * L); if (m <= L) s = m; else { s = 2 * L - m; dir = -1; } }
    else if (mode === "once") s = Math.min(d, L);
    else { s = d % L; if (!pa.closed) a = clamp(Math.min(s, L - s) / Math.min(0.4, L * 0.2), 0, 1); }
    return { s: s, dir: dir, a: a };
  }
  function headingAt(pa, s, dir) {
    var p = pathAt(pa, s), q = pathAt(pa, s + 0.16 * dir);
    if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-3) { var r = pathAt(pa, s - 0.16 * dir); return Math.atan2(p[1] - r[1], p[0] - r[0]); }
    return Math.atan2(q[1] - p[1], q[0] - p[0]);
  }
  function drawFlow(w, F, t) {
    var ctx = w.ctx, c = w.cur;
    if (F.at != null && t < F.at) return;
    if (F.until != null && t > F.until + 0.4) return;
    var fade = F.until != null && t > F.until ? 1 - (t - F.until) / 0.4 : 1;
    var reveal = F.at == null ? 1 : E.outCubic(prog(t, F.at, F.reveal));
    var pa = F.path, lw = Math.max(u(2), c.K * 0.045) * F.width;
    var s = [], lim = reveal * pa.len;
    for (var i = 0; i < pa.pts.length; i++) {
      if (pa.cum[i] <= lim) s.push(w.P(pa.pts[i][0], pa.pts[i][1], pa.pts[i][2]));
      else { var e = pathAt(pa, lim); s.push(w.P(e[0], e[1], e[2])); break; }
    }
    ctx.globalAlpha = fade;
    if (F.cable && s.length > 1 && F.over) {
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      stroke(ctx, s, alpha(F.color, 0.22), lw * 3.4);
      ctx.setLineDash([c.K * 0.22, c.K * 0.16]); ctx.lineDashOffset = -t * c.K * 0.9;
      stroke(ctx, s, alpha(F.color, 0.95), lw * 1.1);
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
    } else if (F.cable && s.length > 1) {
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      if (w.pal.night > 0.5 || F.pipe) { stroke(ctx, s, alpha(F.color, 0.22), lw * 3.2); }
      stroke(ctx, s, F.pipe ? w.pal.metal : alpha(w.pal.cable, 0.95), F.pipe ? lw * 1.8 : lw);
      if (F.pipe) stroke(ctx, s, shade(w.pal.metal, 1.2), lw * 0.6);
    }
    if (reveal >= 0.98 && F.count > 0) {
      var t0 = F.at == null ? 0 : F.at + F.reveal;
      for (var k = 0; k < F.count; k++) {
        var d = (Math.max(0, t - t0) * F.speed) / pa.len + k / F.count, sp = frac(F.dir > 0 ? d : -d) * pa.len;
        var q = pathAt(pa, sp), pa2 = clamp(Math.min(sp, pa.len - sp) / 0.35, 0, 1), p2 = w.P(q[0], q[1], q[2]);
        ctx.globalAlpha = fade * pa2;
        if (F.goods) {
          w.box(q[0] - 0.13, q[1] - 0.13, q[2], 0.26 * F.size, 0.26 * F.size, 0.22 * F.size, F.goods === true ? "#D9A05B" : F.goods);
        } else {
          var R = c.K * 0.17 * F.size;
          var g = ctx.createRadialGradient(p2[0], p2[1], 0, p2[0], p2[1], R);
          g.addColorStop(0, alpha(F.color, 0.95)); g.addColorStop(0.4, alpha(F.color, 0.4)); g.addColorStop(1, alpha(F.color, 0));
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p2[0], p2[1], R, 0, 2 * PI); ctx.fill();
          ctx.fillStyle = "#FFFFFF"; ctx.beginPath(); ctx.arc(p2[0], p2[1], Math.max(1.5, R * 0.3), 0, 2 * PI); ctx.fill();
        }
      }
    }
    ctx.globalAlpha = 1;
  }
  function stroke(ctx, s, col, lw) {
    ctx.beginPath(); ctx.moveTo(s[0][0], s[0][1]);
    for (var i = 1; i < s.length; i++) ctx.lineTo(s[i][0], s[i][1]);
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke();
  }
  function drawPing(w, p, t) {
    var ctx = w.ctx, c = w.cur;
    if (t < p.at || (p.until != null && t > p.until)) return;
    for (var k = 0; k < 2; k++) {
      var ph = p.loop ? frac((t - p.at) / p.period + k * 0.5) : prog(t, p.at + k * 0.3, 1.1);
      if (ph <= 0 || ph >= 1) continue;
      if (p.loop && t - p.at < k * 0.5 * p.period) continue;
      var r = p.radius * E.outCubic(ph), g = w.P(p.x, p.y, p.z);
      ctx.globalAlpha = (1 - ph) * 0.9;
      ctx.beginPath(); ctx.ellipse(g[0], g[1], r * c.K, r * c.K * 0.5, 0, 0, 2 * PI);
      ctx.fillStyle = alpha(p.color, 0.14); ctx.fill();
      ctx.strokeStyle = p.color; ctx.lineWidth = u(3.5); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function drawGText(w, g, t) {
    var ctx = w.ctx;
    if (g.at != null && t < g.at) return;
    var a = g.at == null ? 1 : prog(t, g.at, 0.4);
    var o = w.P(g.x, g.y, g.z), ex = w.P(g.x + 1, g.y, g.z), ey = w.P(g.x, g.y + 1, g.z);
    ctx.save();
    ctx.setTransform(ex[0] - o[0], ex[1] - o[1], ey[0] - o[0], ey[1] - o[1], o[0], o[1]);
    ctx.scale(g.size / 100, g.size / 100);
    ctx.font = fontOf(100, g.weight);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.globalAlpha = a * g.a;
    ctx.fillStyle = g.color;
    ctx.fillText(g.text, 0, 0);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // ------------------------- clouds -------------------------
  function cloudPos(w, cl, t) {
    var span = w.cols + 8, x = -4 + frac((cl.x0 + cl.speed * t) / span) * span, a = clamp(Math.min(x + 4, w.cols + 4 - x) / 2, 0, 1);
    return { x: x, y: cl.y, z: cl.z + Math.sin(t * 0.6 + cl.x0) * 0.08, a: a * 0.92 };
  }
  function drawClouds(w, t) {
    var ctx = w.ctx, c = w.cur;
    w.cloudList.forEach(function (cl) {
      var s = cloudPos(w, cl, t);
      if (s.a <= 0) return;
      ctx.globalAlpha = s.a;
      var col = w.pal.cloud, R = cl.size * c.K;
      [[0, 0, 0, 0.62], [-0.62, 0.12, -0.12, 0.44], [0.6, -0.08, -0.1, 0.48], [0.2, 0.34, -0.16, 0.4]].forEach(function (b) {
        var p = w.P(s.x + b[0] * cl.size, s.y + b[1] * cl.size, s.z + b[2] * cl.size), r = b[3] * R;
        ctx.beginPath(); ctx.arc(p[0], p[1] + r * 0.12, r, 0, 2 * PI); ctx.fillStyle = shade(col, 0.9); ctx.fill();
        ctx.beginPath(); ctx.arc(p[0] - r * 0.08, p[1] - r * 0.06, r * 0.92, 0, 2 * PI); ctx.fillStyle = col; ctx.fill();
      });
    });
    ctx.globalAlpha = 1;
  }

  // ------------------------- labels -------------------------
  function anchor3(w, a, t) {
    if (typeof a === "function") { var r = a(t); return Array.isArray(r) ? [num(r[0], w.cx), num(r[1], w.cy), num(r[2], 0)] : [w.cx, w.cy, 0]; }
    if (Array.isArray(a)) return [num(a[0], w.cx), num(a[1], w.cy), num(a[2], 0)];
    if (a && a.x != null) {
      var st = a.st, sz = st ? st.sz : 1, dz = st ? st.dz : 0;
      return [a.x + a.w / 2 + (a.lx || 0), a.y + a.d / 2 + (a.ly || 0), (a.z || 0) + (a.top != null ? a.top : a.h) * sz + dz + (a.liveZ ? a.liveZ : 0)];
    }
    return [w.cx, w.cy, 0];
  }
  function obstaclesFor(w) {
    var out = [];
    heads.forEach(function (hd) { if (hd.wrap === w.root) out.push(hd.rect); });
    domBoxes.forEach(function (b) { if (b.wrap === w.root) out.push(b.rect); });
    return out;
  }
  function rrect(ctx, x, y, ww, hh, r) {
    r = Math.min(r, ww / 2, hh / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + ww - r, y); ctx.quadraticCurveTo(x + ww, y, x + ww, y + r);
    ctx.lineTo(x + ww, y + hh - r); ctx.quadraticCurveTo(x + ww, y + hh, x + ww - r, y + hh); ctx.lineTo(x + r, y + hh);
    ctx.quadraticCurveTo(x, y + hh, x, y + hh - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function cardOf(w, L, t) {
    var size = L.size || u(PORT ? 34 : 29), bigS = size * 1.7;
    var bigNow = L.big, bigFinal = L.big;
    if (L.value) {
      var v = L.value, from = num(v.from, 0), to = num(v.to, 0), dec = num(v.decimals, 0);
      var p = ez(v.ease || "outCubic")(prog(t, L.at + num(v.delay, 0), num(v.dur, 1.2)));
      bigNow = fmtNum(from + (to - from) * p, dec, v.prefix, v.suffix);
      bigFinal = fmtNum(Math.abs(from) > Math.abs(to) ? from : to, dec, v.prefix, v.suffix);
    }
    var maxW = L.maxW || u(PORT ? 440 : 400);
    var lines = L.text ? wrapLines(L.text, size, 800, maxW, 2) : [];
    var tw = 0;
    lines.forEach(function (l) { tw = Math.max(tw, textW(l, size, 800)); });
    var bw = bigFinal ? Math.max(textW(bigFinal, bigS, 900), textW(bigNow, bigS, 900)) : 0;
    if (L.plain) {
      var ph = (bigFinal ? bigS * 1.05 : 0) + lines.length * size * 1.15;
      return { size: size, bigS: bigS, lines: lines, bigNow: bigNow, bw: Math.max(tw, bw), h: ph, w: Math.max(tw, bw) + size * 0.4, plain: true };
    }
    var padX = size * 0.6, padY = size * 0.4, lead = 0;
    if (L.badge) lead = size * 1.25 + size * 0.4;
    else if (!bigFinal && lines.length) lead = size * 0.5 + size * 0.32;
    var inner = Math.max(tw, bw) + lead;
    var hh = padY * 2 + (bigFinal ? bigS * 1.0 : 0) + (lines.length ? lines.length * size * 1.16 - size * 0.16 : 0);
    return { size: size, bigS: bigS, lines: lines, bigNow: bigNow, hasBig: !!bigFinal, w: inner + padX * 2, h: hh, padX: padX, padY: padY, lead: lead };
  }
  function drawLabels(w, t) {
    var ctx = w.ctx, cards = [], sa = safeRect();
    w.labels.forEach(function (L) {
      if (t < L.at) return;
      var fade = 1;
      if (L.until != null) { if (t >= L.until + 0.3) return; if (t > L.until) fade = 1 - (t - L.until) / 0.3; }
      var an = L.anchor;
      if (an && an.world && !an.st) return;
      var p3 = anchor3(w, an, t);
      w._tf = null;
      var a = w.P(p3[0], p3[1], p3[2] + (L.z || 0));
      var off = Math.max(0, -a[0], a[0] - W, -a[1], a[1] - H);
      if (off > u(40)) return;
      if (off > 0) fade *= 1 - off / u(40);
      var cd = cardOf(w, L, t), pin = prog(t, L.at, 0.4);
      var lift = L.lift != null ? L.lift : cd.plain ? 0 : u(PORT ? 58 : 50), x, y;
      if (cd.plain) { x = a[0] - cd.w / 2; y = a[1] - lift - cd.h / 2; }
      else if (L.side === "left") { x = a[0] - u(34) - cd.w; y = a[1] - lift * 0.3 - cd.h / 2; }
      else if (L.side === "right") { x = a[0] + u(34); y = a[1] - lift * 0.3 - cd.h / 2; }
      else { x = a[0] - cd.w / 2; y = a[1] - lift - cd.h; }
      cards.push({ L: L, cd: cd, ax: a[0], ay: a[1], x: x, y: y, w: cd.w, h: cd.h, pin: pin, fade: fade });
    });
    relax(cards, obstaclesFor(w), sa);
    var rects = [];
    cards.forEach(function (k) {
      if (k.fade <= 0) return;
      var L = k.L, cd = k.cd, al = clamp(k.pin * 3, 0, 1) * k.fade;
      ctx.globalAlpha = al;
      var col = L.dim ? w.pal.muted : L.color;
      if (!cd.plain) {
        var tx = clamp(k.ax, k.x + u(16), k.x + k.w - u(16)), below = k.ay > k.y + k.h / 2, ty = below ? k.y + k.h : k.y;
        if (k.ay > k.y && k.ay < k.y + k.h) ty = k.y + k.h;
        var dist = Math.hypot(tx - k.ax, ty - k.ay), lp = E.outCubic(clamp(k.pin * 1.6, 0, 1));
        if (dist > u(10)) {
          ctx.beginPath(); ctx.moveTo(k.ax, k.ay); ctx.lineTo(lerp(k.ax, tx, lp), lerp(k.ay, ty, lp));
          ctx.strokeStyle = w.pal.night > 0.5 ? "rgba(255,255,255,0.85)" : alpha(w.pal.ink, 0.7); ctx.lineWidth = u(3); ctx.lineCap = "round"; ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(k.ax, k.ay, u(7), 0, 2 * PI); ctx.fillStyle = "#FFFFFF"; ctx.fill();
        ctx.beginPath(); ctx.arc(k.ax, k.ay, u(4.5), 0, 2 * PI); ctx.fillStyle = col; ctx.fill();
      }
      var sc = 0.65 + 0.35 * E.outBack(clamp(k.pin * 1.4, 0, 1));
      ctx.save();
      var ox = k.x + k.w / 2, oy = cd.plain ? k.y + k.h / 2 : k.ay < k.y ? k.y : k.y + k.h;
      ctx.translate(ox, oy); ctx.scale(sc, sc); ctx.translate(-ox, -oy);
      if (cd.plain) {
        ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
        var yy = k.y + (cd.hasBig || L.big || L.value ? cd.bigS * 0.55 : cd.size * 0.6);
        if (cd.bigNow) {
          ctx.font = fontOf(cd.bigS, 900); ctx.lineWidth = cd.bigS * 0.22; ctx.strokeStyle = w.pal.night > 0.5 ? "rgba(14,20,48,0.85)" : "rgba(255,255,255,0.92)";
          ctx.strokeText(cd.bigNow, k.x + k.w / 2, yy); ctx.fillStyle = col; ctx.fillText(cd.bigNow, k.x + k.w / 2, yy); yy += cd.bigS * 0.55 + cd.size * 0.6;
        }
        ctx.font = fontOf(cd.size, 800); ctx.lineWidth = cd.size * 0.26;
        cd.lines.forEach(function (ln) {
          ctx.strokeStyle = w.pal.night > 0.5 ? "rgba(14,20,48,0.85)" : "rgba(255,255,255,0.92)"; ctx.strokeText(ln, k.x + k.w / 2, yy);
          ctx.fillStyle = w.pal.night > 0.5 ? "#FFFFFF" : w.pal.ink; ctx.fillText(ln, k.x + k.w / 2, yy); yy += cd.size * 1.15;
        });
      } else {
        ctx.shadowColor = "rgba(20,24,56,0.22)"; ctx.shadowBlur = u(16); ctx.shadowOffsetY = u(6);
        rrect(ctx, k.x, k.y, k.w, k.h, u(14)); ctx.fillStyle = w.pal.card; ctx.fill();
        ctx.shadowColor = "rgba(0,0,0,0)"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
        var x0 = k.x + cd.padX, y0 = k.y + cd.padY;
        if (L.badge) {
          var bdR = cd.size * 0.62, bcY = k.y + k.h / 2;
          ctx.beginPath(); ctx.arc(x0 + bdR, bcY, bdR, 0, 2 * PI); ctx.fillStyle = col; ctx.fill();
          ctx.font = fontOf(cd.size * 0.78, 900); ctx.fillStyle = "#FFFFFF"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(L.badge, x0 + bdR, bcY + cd.size * 0.03);
        } else if (!cd.hasBig && cd.lines.length) {
          ctx.beginPath(); ctx.arc(x0 + cd.size * 0.25, y0 + cd.size * 0.5, cd.size * 0.25, 0, 2 * PI); ctx.fillStyle = col; ctx.fill();
        }
        var tx0 = x0 + cd.lead;
        ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
        if (cd.hasBig) {
          ctx.font = fontOf(cd.bigS, 900); ctx.fillStyle = col;
          ctx.fillText(cd.bigNow, tx0, y0 + cd.bigS * 0.8); y0 += cd.bigS;
        }
        ctx.font = fontOf(cd.size, 800); ctx.fillStyle = L.dim ? w.pal.muted : w.pal.cardInk;
        cd.lines.forEach(function (ln, i) { ctx.fillText(ln, tx0, y0 + cd.size * 0.86 + i * cd.size * 1.16); });
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      if (L.key && k.pin >= 1) rects.push({ kind: "label", label: L.text || L.big || "label", x: k.x, y: k.y, w: k.w, h: k.h });
    });
    return rects;
  }
  // Push overlapping cards apart, keep them off headlines and inside the safe area. Same input, same output.
  function relax(cards, obst, sa) {
    var m = u(12), n = cards.length;
    function clampC(c) {
      c.x = clamp(c.x, sa.x0, Math.max(sa.x0, sa.x1 - c.w));
      c.y = clamp(c.y, sa.y0, Math.max(sa.y0, sa.y1 - c.h));
    }
    cards.forEach(clampC);
    for (var it = 0; it < 40; it++) {
      var moved = false;
      for (var i = 0; i < n; i++) {
        for (var j = i + 1; j < n; j++) {
          var a = cards[i], b = cards[j];
          var ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) + m, oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) + m;
          if (ox <= 0 || oy <= 0) continue;
          moved = true;
          if (oy <= ox * 1.2) {
            var up = a.y + a.h / 2 <= b.y + b.h / 2 ? a : b, dn = up === a ? b : a;
            up.y -= oy / 2; dn.y += oy / 2;
          } else {
            var lf = a.x + a.w / 2 <= b.x + b.w / 2 ? a : b, rt = lf === a ? b : a;
            lf.x -= ox / 2; rt.x += ox / 2;
          }
        }
        var c = cards[i];
        obst.forEach(function (r) {
          var ox2 = Math.min(c.x + c.w, r.x + r.w) - Math.max(c.x, r.x) + m, oy2 = Math.min(c.y + c.h, r.y + r.h) - Math.max(c.y, r.y) + m;
          if (ox2 <= 0 || oy2 <= 0) return;
          moved = true;
          var down = r.y + r.h + m - c.y, upw = c.y + c.h + m - r.y, left = c.x + c.w + m - r.x, right = r.x + r.w + m - c.x;
          var best = Math.min(down, upw, left, right);
          if (best === down) c.y += down; else if (best === upw) c.y -= upw; else if (best === left) c.x -= left; else c.x += right;
        });
      }
      cards.forEach(clampC);
      if (!moved) break;
    }
    cards.forEach(function (c) {
      obst.forEach(function (r) { if (Math.min(c.x + c.w, r.x + r.w) > Math.max(c.x, r.x) + 2 && Math.min(c.y + c.h, r.y + r.h) > Math.max(c.y, r.y) + 2) c.fade = 0; });
    });
  }

  // ------------------------- life -------------------------
  function lifeAPI(w) {
    var pal = w.pal;
    w.walker = function (points, o) {
      o = obj(o);
      var pa = mkPath(points, !!o.closed);
      if (!pa) return null;
      var seed = w.uid * 7 + 3, mode = o.mode || (o.closed ? "loop" : "pingpong"), speed = num(o.speed, 0.32), phase = num(o.phase, hash(seed));
      var shirt = o.color || pal.accents[Math.floor(hash(seed + 1) * pal.accents.length)], skin = pal.skin[Math.floor(hash(seed + 2) * pal.skin.length)];
      var legs = shade(pal.dark, 1.1), side = (hash(seed + 5) - 0.5) * 0.16;
      var wk = w.add({ type: "walker", x: 0, y: 0, w: 0.2, d: 0.2, h: 0.42, at: o.at, anim: o.anim || "pop", dur: 0.35, round: 0.08, shadow: false, noCut: !!o.noCut });
      wk.update = function (t) {
        var tr = travel(pa, t, speed, phase, mode, o.t0 || 0), p = pathAt(pa, tr.s), hd = headingAt(pa, tr.s, tr.dir);
        wk.hd = hd; wk.alphaMul = tr.a;
        wk.x = p[0] - 0.1 - Math.sin(hd) * side; wk.y = p[1] - 0.1 + Math.cos(hd) * side;
        wk.step = (tr.s * 9) % (2 * PI);
      };
      wk.draw = function (w2, ctx, t) {
        var cx = wk.x + 0.1, cy = wk.y + 0.1, ch = Math.cos(wk.hd), sh = Math.sin(wk.hd), sw = Math.sin(wk.step) * 0.055, bob = Math.abs(Math.cos(wk.step)) * 0.015;
        var lw = Math.max(1.4, w.K(0.032));
        if (o.idle) sw = 0;
        w.line3([[cx + ch * sw - sh * 0.03, cy + sh * sw + ch * 0.03, 0], [cx - sh * 0.03, cy + ch * 0.03, 0.16]], legs, lw);
        w.line3([[cx - ch * sw + sh * 0.03, cy - sh * sw - ch * 0.03, 0], [cx + sh * 0.03, cy - ch * 0.03, 0.16]], legs, lw);
        w.cyl(cx, cy, 0.15 + bob, 0.3 + bob, 0.058, shirt);
        if (o.wave) {
          var wv = Math.sin(t * 6 + seed) * 0.05;
          w.line3([[cx, cy, 0.28 + bob], [cx + 0.03 + wv, cy, 0.44 + bob]], skin, lw * 0.9, { z0: 0.3 });
        }
        w.ball(cx, cy, 0.36 + bob, 0.058, skin, { matte: true });
      };
      return wk;
    };
    w.crowd = function (x, y, n, o) {
      o = obj(o);
      var out = [];
      n = clamp(Math.round(num(n, 5)), 0, 30);
      for (var i = 0; i < n; i++) {
        var a = (i / Math.max(1, n)) * 2 * PI + hash(i + x * 3), r = 0.18 + hash(i * 5 + y) * 0.35, cxx = num(x, 0) + Math.cos(a) * r, cyy = num(y, 0) + Math.sin(a) * r * 0.9;
        var loop = [[cxx, cyy], [cxx + 0.2, cyy + 0.06], [cxx + 0.12, cyy + 0.22], [cxx - 0.06, cyy + 0.12]];
        out.push(w.walker(loop, { closed: true, speed: 0.12 + hash(i) * 0.1, at: o.at != null ? o.at + i * 0.05 : null, wave: o.wave && i % 2 === 0, idle: !!o.idle }));
      }
      return out;
    };
    var CARC = ["#FF6F59", "#4C8DF6", "#FFFFFF", "#FFB020", "#1FB89E", "#E8EBF2", "#9B6CF0"];
    w.car = function (points, o) {
      o = obj(o);
      var pa = mkPath(points, !!o.closed);
      if (!pa) return null;
      var seed = w.uid * 13 + 5, kind = o.kind || "car", mode = o.mode || "loop", speed = num(o.speed, kind === "truck" || kind === "bus" ? 1.15 : 1.5);
      var phase = num(o.phase, hash(seed)), lane = num(o.lane, 0.21);
      var color = o.color || (kind === "bus" ? "#FFB020" : kind === "truck" ? "#4C8DF6" : CARC[Math.floor(hash(seed + 1) * CARC.length)]);
      var L = kind === "bus" ? 0.92 : kind === "truck" ? 0.78 : kind === "van" ? 0.56 : 0.48;
      var car = w.add({ type: "vehicle", x: 0, y: 0, w: 0.5, d: 0.5, h: 0.3, at: o.at, anim: o.anim || "fade", dur: 0.4, shadow: false });
      car.update = function (t) {
        var tr = travel(pa, t, speed, phase, mode, o.t0 || 0), p = pathAt(pa, tr.s), hd = headingAt(pa, tr.s, tr.dir);
        car.hd = hd; car.alphaMul = tr.a;
        car.x = p[0] - 0.25 - Math.sin(hd) * lane; car.y = p[1] - 0.25 + Math.cos(hd) * lane;
      };
      car.draw = function (w2, ctx, t) { drawVehicle(w, car.x + 0.25, car.y + 0.25, car.hd, kind, color, L, o.cargo); };
      return car;
    };
    w.truck = function (points, o) { o = obj(o); o.kind = o.kind || "truck"; return w.car(points, o); };
    function drawVehicle(w, cx, cy, hd, kind, color, L, cargo) {
      var c = Math.cos(hd), s = Math.sin(hd), Wd = kind === "bus" ? 0.3 : 0.26;
      function at(along) { return [cx + c * along, cy + s * along]; }
      var glass = w.pal.night > 0.5 ? "#7F95C8" : "#BFE0F7";
      if (kind === "truck") {
        var cb = at(L * 0.34), cg = at(-L * 0.12);
        w.box(cg[0] - L * 0.31, cg[1] - Wd / 2, 0.04, L * 0.62, Wd, 0.3, cargo || "#F3F4F7", { rot: hd });
        w.box(cb[0] - L * 0.13, cb[1] - Wd / 2, 0.04, L * 0.26, Wd, 0.22, color, { rot: hd });
      } else if (kind === "bus") {
        w.box(cx - L / 2, cy - Wd / 2, 0.04, L, Wd, 0.28, color, { rot: hd, win: { ribbon: true, rows: 1, color: glass, bottom: 0.45, top: 0.12 } });
      } else if (kind === "van") {
        w.box(cx - L / 2, cy - Wd / 2, 0.04, L, Wd, 0.26, color, { rot: hd });
      } else {
        w.box(cx - L / 2, cy - Wd / 2, 0.04, L, Wd, 0.12, color, { rot: hd });
        var cab = at(-L * 0.06);
        w.box(cab[0] - L * 0.26, cab[1] - Wd * 0.42, 0.16, L * 0.52, Wd * 0.84, 0.1, glass, { rot: hd, top: shade(color, 1.05) });
      }
      if (w.pal.night >= 0.4) { var hl = at(L * 0.5); w.glow(hl[0], hl[1], 0.1, 0.28, "#FFE9A8", { a: 0.7 * w.pal.night }); }
    }
    w.boat = function (points, o) {
      o = obj(o);
      var pa = mkPath(points, !!o.closed);
      if (!pa) return null;
      var kind = o.kind || "boat", L = kind === "ship" ? 1.7 : 0.8, Wd = kind === "ship" ? 0.48 : 0.3, speed = num(o.speed, kind === "ship" ? 0.4 : 0.6), mode = o.mode || "pingpong";
      var bt = w.add({ type: "boat", x: 0, y: 0, w: 0.6, d: 0.6, h: 0.3, at: o.at, anim: "fade", dur: 0.5, shadow: false });
      bt.update = function (t) {
        var tr = travel(pa, t, speed, num(o.phase, 0), mode, o.t0 || 0), p = pathAt(pa, tr.s);
        bt.hd = headingAt(pa, tr.s, tr.dir); bt.alphaMul = tr.a; bt.x = p[0] - 0.3; bt.y = p[1] - 0.3; bt.bob = Math.sin(t * 2.2) * 0.012;
      };
      bt.draw = function (w2, ctx, t) {
        var cx = bt.x + 0.3, cy = bt.y + 0.3, c = Math.cos(bt.hd), s = Math.sin(bt.hd);
        var loc = [[-L / 2, -Wd / 2], [L / 2 - 0.16, -Wd / 2], [L / 2, 0], [L / 2 - 0.16, Wd / 2], [-L / 2, Wd / 2]];
        var pts = loc.map(function (p) { return [cx + p[0] * c - p[1] * s, cy + p[0] * s + p[1] * c]; });
        w.line3([[cx - c * L * 0.55 - s * 0.12, cy - s * L * 0.55 + c * 0.12, 0.01], [cx - c * L * 1.1 - s * 0.24, cy - s * L * 1.1 + c * 0.24, 0.01]], "rgba(255,255,255,0.6)", w.K(0.05), { z0: -0.2 });
        w.line3([[cx - c * L * 0.55 + s * 0.12, cy - s * L * 0.55 - c * 0.12, 0.01], [cx - c * L * 1.1 + s * 0.24, cy - s * L * 1.1 - c * 0.24, 0.01]], "rgba(255,255,255,0.6)", w.K(0.05), { z0: -0.2 });
        w.prism(pts, 0.0 + bt.bob, 0.14 + bt.bob, kind === "ship" ? "#E2574C" : "#FFFFFF", { top: kind === "ship" ? "#8A94AA" : "#F2E3C6" });
        if (kind === "ship") {
          for (var k = 0; k < 3; k++) { var q = [cx + c * (-0.45 + k * 0.32), cy + s * (-0.45 + k * 0.32)]; w.box(q[0] - 0.14, q[1] - 0.13, 0.14 + bt.bob, 0.28, 0.26, 0.2, w.pal.accents[(k + 1) % w.pal.accents.length], { rot: bt.hd }); }
          var br = [cx - c * 0.68, cy - s * 0.68];
          w.box(br[0] - 0.1, br[1] - 0.14, 0.14 + bt.bob, 0.2, 0.28, 0.34, "#FFFFFF", { rot: bt.hd, win: { rows: 1, ribbon: true } });
        } else {
          var cb = [cx - c * 0.08, cy - s * 0.08];
          w.box(cb[0] - 0.14, cb[1] - 0.1, 0.14 + bt.bob, 0.28, 0.2, 0.14, "#4C8DF6", { rot: bt.hd });
        }
      };
      return bt;
    };
    w.plane = function (points3, o) {
      o = obj(o);
      var pts = arr(points3).map(function (p) { return [num(p[0], 0), num(p[1], 0), num(p[2], 4)]; });
      var pa = mkPath(pts, o.closed !== false);
      if (!pa) return null;
      var speed = num(o.speed, 1.8);
      var pl = w.add({ type: "plane", x: 0, y: 0, w: 0.8, d: 0.8, h: 0.2, z: 4, layer: "over", at: o.at, anim: "fade", dur: 0.5 });
      pl.update = function (t) {
        var tr = travel(pa, t, speed, num(o.phase, 0), "loop", o.t0 || 0), p = pathAt(pa, tr.s);
        pl.hd = headingAt(pa, tr.s, 1); pl.alphaMul = tr.a; pl.x = p[0] - 0.4; pl.y = p[1] - 0.4; pl.z = p[2]; pl.pz = p[2];
      };
      pl.draw = function (w2, ctx, t) {
        var cx = pl.x + 0.4, cy = pl.y + 0.4, z = pl.pz, c = Math.cos(pl.hd), s = Math.sin(pl.hd);
        function R(a, b) { return [cx + a * c - b * s, cy + a * s + b * c]; }
        var wing = [R(0.1, -0.5), R(0.22, -0.5), R(0.06, 0), R(0.22, 0.5), R(0.1, 0.5), R(-0.1, 0)];
        w.prism(wing, z + 0.02, z + 0.045, "#E9EDF5");
        w.box(cx - 0.42, cy - 0.07, z, 0.84, 0.14, 0.12, "#FFFFFF", { rot: pl.hd, top: "#F4F6FA" });
        var tl = [R(-0.36, -0.2), R(-0.28, -0.2), R(-0.32, 0), R(-0.28, 0.2), R(-0.36, 0.2)];
        w.prism(tl, z + 0.1, z + 0.12, "#E9EDF5");
        var fin = R(-0.36, 0);
        w.box(fin[0] - 0.06, fin[1] - 0.015, z + 0.1, 0.12, 0.03, 0.18, w.pal.accent, { rot: pl.hd });
      };
      return pl;
    };
    w.clouds = function (n, o) {
      o = obj(o);
      n = clamp(Math.round(num(n, 2)), 0, 8);
      for (var i = 0; i < n; i++) {
        var sd = w.uid * 3 + i * 17 + 1;
        w.cloudList.push({ x0: hash(sd) * (w.cols + 8), y: lerp(-1.5, w.rows * 0.4, hash(sd + 1)), z: num(o.z, 4.4) + hash(sd + 2) * 0.8, speed: 0.22 + hash(sd + 3) * 0.14, size: 0.85 + hash(sd + 4) * 0.45 });
      }
      w.uid++;
      return w.cloudList;
    };
    w.flow = function (points3, o) {
      o = obj(o);
      var pts = arr(points3).map(function (p) { return [num(p[0], 0), num(p[1], 0), num(p[2], 0.05)]; });
      var pa = mkPath(pts, false);
      if (!pa) return null;
      var maxZ = 0;
      pts.forEach(function (p) { maxZ = Math.max(maxZ, p[2]); });
      var F = {
        path: pa, color: o.color || pal.data, speed: num(o.speed, 1.6), count: Math.round(num(o.count, Math.max(2, Math.min(9, pa.len / 1.3)))), at: o.at != null && isFinite(+o.at) ? Math.max(0, +o.at) : null,
        width: num(o.width, 1), pipe: !!o.pipe, goods: o.goods || false, size: num(o.size, 1), dir: o.reverse ? -1 : 1, cable: o.cable !== false, until: o.until != null ? +o.until : null,
        reveal: num(o.reveal, 0.55), over: o.over != null ? !!o.over : maxZ > 0.4,
      };
      w.flows.push(F);
      return F;
    };
    w.arc = function (a, b, o) {
      o = obj(o);
      var A = endPt(a), B = endPt(b), dist = Math.hypot(B[0] - A[0], B[1] - A[1]), hgt = num(o.height, dist * 0.32 + 0.8), pts = [];
      for (var i = 0; i <= 24; i++) { var s = i / 24; pts.push([lerp(A[0], B[0], s), lerp(A[1], B[1], s), lerp(A[2], B[2], s) + hgt * 4 * s * (1 - s)]); }
      return w.flow(pts, Object.assign({ over: true }, o));
    };
    function endPt(p) {
      if (Array.isArray(p)) return [num(p[0], 0), num(p[1], 0), num(p[2], 0)];
      if (p && p.x != null) return [p.x + p.w / 2, p.y + p.d / 2, (p.z || 0) + (p.top != null ? p.top : p.h)];
      return [w.cx, w.cy, 0];
    }
  }
  function smoke(w, x, y, z, t, o) {
    o = o || {};
    var n = o.count || 5, rate = o.rate || 0.45, col = o.color || (w.pal.night > 0.5 ? "#8E97BC" : "#E6E8EE");
    for (var i = 0; i < n; i++) {
      var ph = frac(t * rate + i / n + (o.seed || 0)), pz = z + ph * (o.rise || 1.5), px = x + ph * 0.45 + Math.sin(ph * 5 + i) * 0.06;
      var r = (0.1 + ph * 0.24) * (o.size || 1), a = (1 - ph) * 0.75 * Math.min(1, ph * 6);
      (function (px, pz, r, a) {
        var c = w.P(px, y - ph * 0.15, pz), R = w.K(r);
        w.emit(z + 0.02, w.depthOf(x, y), function (ctx) { var g = ctx.globalAlpha; ctx.globalAlpha = g * a; ctx.beginPath(); ctx.arc(c[0], c[1], R, 0, 2 * PI); ctx.fillStyle = col; ctx.fill(); ctx.globalAlpha = g; });
      })(px, pz, r, a);
    }
  }

  // ------------------------- building kit -------------------------
  var BT = {};
  var ALIAS = { skyscraper: "tower", rack: "server", home: "house", apartment: "tower", store: "shop", mill: "factory", plant: "factory", hub: "datacenter" };
  function bdef(name, ww, dd, def) { def.w = ww; def.d = dd; BT[name] = def; }
  function pk(w, list, seed) { var L = w.pal[list]; return L[Math.floor(hash(seed) * L.length) % L.length]; }
  function litC(w, seed, f, base) { return hash(seed) < w.pal.night * 0.72 ? w.pal.lit : shade(base || w.pal.win, f); }
  function ins(b, m) { return { x: b.x + m, y: b.y + m, w: b.w - 2 * m, d: b.d - 2 * m, cx: b.x + b.w / 2, cy: b.y + b.d / 2 }; }

  bdef("house", 1, 1, {
    init: function (w, b) { b.fl = clamp(Math.round(num(b.floors, 1)), 1, 4); b.hb = 0.46 * b.fl + 0.08; b.h = b.hb + 0.4; b.wall = b.color || pk(w, "walls", b.seed); b.roofC = b.roof || pk(w, "roofs", b.seed + 1); },
    draw: function (w, b) {
      var r = ins(b, Math.min(0.14, b.w * 0.14)), hb = b.hb, fl = b.fl, seed = b.seed, door = shade(b.roofC, 0.62);
      w.box(r.x, r.y, 0, r.w, r.d, hb, b.wall, { deco: function (ctx, i, q, f) {
        var n = Math.max(1, Math.round((i % 2 ? r.d : r.w) / 0.34));
        for (var k = 0; k < fl; k++) {
          var v0 = (k + 0.38) / fl, v1 = (k + 0.74) / fl;
          for (var c = 0; c < n; c++) {
            var u0 = (c + 0.22) / n, u1 = (c + 0.7) / n;
            if (i === 2 && k === 0 && c === n - 1) { quadUV(ctx, q, u0 + 0.04 / n, 0, u1, Math.min(0.66, 0.3 / hb), door); continue; }
            quadUV(ctx, q, u0, v0, u1, v1, litC(w, seed + k * 5 + c * 3 + i * 7, f));
          }
        }
      } });
      w.box(r.x + r.w * 0.16, r.y + r.d * 0.18, hb, 0.11, 0.11, 0.46, shade(b.wall, 0.76));
      w.gable(r.x - 0.05, r.y - 0.05, hb, r.w + 0.1, r.d + 0.1, 0.38 * Math.min(1.4, Math.max(r.w, r.d) / 0.72), b.roofC, r.w >= r.d ? "x" : "y", { wall: b.wall });
    },
  });
  bdef("cottage", 1, 1, {
    init: function (w, b) { b.hb = 0.38; b.h = 0.72; b.wall = b.color || "#F4E9D6"; b.roofC = b.roof || (w.pal.night > 0.5 ? "#7A5A3E" : "#C98A4B"); },
    draw: function (w, b) {
      var r = ins(b, 0.2), seed = b.seed;
      w.box(r.x, r.y, 0, r.w, r.d, b.hb, b.wall, { deco: function (ctx, i, q, f) {
        if (i === 2) quadUV(ctx, q, 0.58, 0, 0.8, 0.62, shade(b.roofC, 0.6));
        quadUV(ctx, q, 0.18, 0.36, 0.42, 0.7, litC(w, seed + i, f));
      } });
      w.gable(r.x - 0.06, r.y - 0.06, b.hb, r.w + 0.12, r.d + 0.12, 0.34, b.roofC, r.w >= r.d ? "x" : "y", { wall: b.wall });
    },
  });
  bdef("tower", 1, 1, {
    init: function (w, b) {
      b.fl = clamp(Math.round(num(b.floors, 8)), 1, 60); b.hb = b.fl * 0.3; b.h = b.hb + 0.2; b.top = b.hb + 0.7;
      b.glassy = b.style === "glass"; b.col = b.color || (b.glassy ? w.pal.glass : pk(w, "walls", b.seed));
    },
    draw: function (w, b, t) {
      var r = ins(b, Math.min(0.13, b.w * 0.13));
      w.box(r.x, r.y, 0, r.w, r.d, b.hb, b.col, b.glassy ? { win: { ribbon: true, rows: b.fl, color: shade(b.col, 1.24), lit: w.pal.night * 0.55 } } : { win: { rows: b.fl, mx: 0.08 } });
      w.box(r.x + r.w * 0.14, r.y + r.d * 0.14, b.hb, r.w * 0.72, r.d * 0.72, 0.2, shade(b.col, 0.86));
      w.line3([[r.cx, r.cy, b.hb + 0.2], [r.cx, r.cy, b.hb + 0.7]], w.pal.dark, Math.max(1.5, w.K(0.028)));
      if (w.pal.night > 0.3) w.glow(r.cx, r.cy, b.hb + 0.72, 0.16, "#FF5A5A", { a: 0.45 + 0.35 * Math.sin(t * 3 + b.seed) });
    },
  });
  bdef("office", 2, 2, {
    init: function (w, b) { b.fl = clamp(Math.round(num(b.floors, 5)), 1, 30); b.hb = b.fl * 0.32; b.h = b.hb + 0.18; b.col = b.color || pk(w, "walls", b.seed + 2); },
    draw: function (w, b) {
      var r = ins(b, 0.16);
      w.box(r.x, r.y, 0, r.w, r.d, b.hb, b.col, { win: { rows: b.fl, mx: 0.07 } });
      w.box(r.x + r.w * 0.15, r.y + r.d * 0.2, b.hb, r.w * 0.22, r.d * 0.18, 0.16, w.pal.metal);
      w.box(r.x + r.w * 0.55, r.y + r.d * 0.5, b.hb, r.w * 0.2, r.d * 0.2, 0.14, w.pal.metal);
      w.box(r.x + r.w * 0.32, r.y + r.d, 0.3, r.w * 0.36, 0.14, 0.05, b.accent || w.pal.accent, { z0: 0 });
    },
  });
  bdef("shop", 1, 1, {
    init: function (w, b) { b.hb = 0.6; b.h = 0.82; b.col = b.color || pk(w, "walls", b.seed + 3); b.acc = b.accent || pk(w, "accents", b.seed + 4); },
    draw: function (w, b) {
      var r = ins(b, 0.12), hb = b.hb;
      w.box(r.x, r.y, 0, r.w, r.d, hb, b.col, { deco: function (ctx, i, q, f) {
        if (i === 2) { quadUV(ctx, q, 0.08, 0.1, 0.62, 0.66, shade(w.pal.night > 0.4 ? w.pal.lit : w.pal.win, f)); quadUV(ctx, q, 0.7, 0, 0.9, 0.66, shade(b.acc, 0.7)); }
        else quadUV(ctx, q, 0.25, 0.35, 0.75, 0.68, litC(w, b.seed + i, f));
      } });
      var n = Math.max(3, Math.round(r.w / 0.16));
      for (var k = 0; k < n; k++) {
        var xa = r.x + (r.w * k) / n, xb = r.x + (r.w * (k + 1)) / n;
        w.face([[xa, r.y + r.d, hb * 0.8], [xb, r.y + r.d, hb * 0.8], [xb, r.y + r.d + 0.2, hb * 0.6], [xa, r.y + r.d + 0.2, hb * 0.6]], [0, 0.2, 0.2], k % 2 ? "#FFFFFF" : b.acc, { z0: 0 });
      }
      w.box(r.x + r.w * 0.12, r.y + r.d - 0.06, hb, r.w * 0.76, 0.05, 0.2, b.acc);
    },
  });
  bdef("factory", 2, 2, {
    init: function (w, b) { b.hb = 0.8; b.h = 1.12; b.top = 2.3; b.col = b.color || mix(w.pal.metal, "#FFFFFF", w.pal.night > 0.5 ? 0 : 0.45); },
    draw: function (w, b, t) {
      var r = ins(b, 0.1), y0 = r.y + 0.28, dd = r.d - 0.28, roof = b.roof || (w.pal.night > 0.5 ? "#4A557A" : "#7F8DAA");
      w.box(r.x, y0, 0, r.w, dd, b.hb, b.col, { win: { rows: 1, bottom: 0.42, top: 0.18, mx: 0.06 } });
      for (var k = 0; k < 3; k++) w.gable(r.x + (k * r.w) / 3, y0, b.hb, r.w / 3, dd, 0.3, roof, "y", { wall: b.col });
      w.cyl(r.x + 0.3, r.y + 0.14, 0, 2.2, 0.15, "#CDD2DC", { bands: [[1.66, 1.82, "#E2574C"], [1.98, 2.1, "#E2574C"]] });
      if (b.smoke !== false) smoke(w, r.x + 0.3, r.y + 0.14, 2.24, t, { seed: b.seed * 0.01 });
    },
  });
  bdef("hospital", 2, 2, {
    init: function (w, b) { b.hb = 1.12; b.h = 1.2; b.col = b.color || (w.pal.night > 0.5 ? "#8E98C2" : "#F3F5F9"); },
    draw: function (w, b) {
      var r = ins(b, 0.14), red = "#E5484D";
      w.box(r.x, r.y, 0, r.w, r.d, b.hb, b.col, { win: { rows: 3, color: "#9FD0F0", mx: 0.08 } });
      w.box(r.x + 0.06, r.y + 0.06, b.hb, r.w - 0.12, r.d - 0.12, 0.04, shade(b.col, 0.92));
      var cx = r.cx, cy = r.cy, z = b.hb + 0.05, a = Math.min(r.w, r.d) * 0.3, s = a * 0.34;
      w.flat([[cx - a, cy - s], [cx + a, cy - s], [cx + a, cy + s], [cx - a, cy + s]], z, red);
      w.flat([[cx - s, cy - a], [cx + s, cy - a], [cx + s, cy + a], [cx - s, cy + a]], z + 0.001, red);
      w.box(r.x + r.w * 0.38, r.y + r.d, 0.42, r.w * 0.24, 0.1, 0.16, red, { z0: 0 });
    },
  });
  bdef("school", 2, 2, {
    init: function (w, b) { b.hb = 0.84; b.h = 1.2; b.top = 1.62; b.col = b.color || (w.pal.night > 0.5 ? "#9A8A72" : "#F7D58A"); },
    draw: function (w, b, t) {
      var r = ins(b, 0.14);
      w.box(r.x, r.y, 0, r.w, r.d, b.hb, b.col, { win: { rows: 2, mx: 0.08 } });
      w.gable(r.x + r.w * 0.34, r.y - 0.04, b.hb, r.w * 0.32, r.d + 0.08, 0.36, b.roof || "#E2574C", "y", { wall: b.col });
      var px = r.x + 0.1, py = r.y + r.d - 0.1, wv = Math.sin(t * 3 + b.seed) * 0.04;
      w.line3([[px, py, 0], [px, py, 1.62]], w.pal.dark, Math.max(1.4, w.K(0.025)));
      w.face([[px, py, 1.6], [px + 0.36, py, 1.56 + wv], [px + 0.36, py, 1.36 + wv], [px, py, 1.4]], [0, 1, 0], b.accent || w.pal.accent, { both: true, flat: true, z0: 0.02 });
    },
  });
  bdef("bank", 2, 2, {
    init: function (w, b) { b.h = 1.45; b.col = b.color || (w.pal.night > 0.5 ? "#9C97B4" : "#EFE7D6"); },
    draw: function (w, b) {
      var r = ins(b, 0.12), st = b.col;
      w.box(r.x - 0.02, r.y - 0.02, 0, r.w + 0.04, r.d + 0.04, 0.1, shade(st, 0.88));
      w.box(r.x + 0.1, r.y + 0.1, 0.1, r.w - 0.2, r.d - 0.46, 0.9, st, { win: { rows: 1, cols: 3, bottom: 0.18, top: 0.3 } });
      for (var k = 0; k < 4; k++) w.cyl(r.x + 0.18 + (k * (r.w - 0.36)) / 3, r.y + r.d - 0.2, 0.1, 1.0, 0.07, shade(st, 1.08), { top: shade(st, 0.95) });
      w.box(r.x - 0.02, r.y - 0.02, 1.0, r.w + 0.04, r.d + 0.04, 0.12, shade(st, 0.96));
      w.gable(r.x, r.y, 1.12, r.w, r.d, 0.32, shade(st, 0.9), "y", { wall: shade(st, 1.04) });
    },
  });
  bdef("datacenter", 2, 2, {
    init: function (w, b) { b.hb = 0.72; b.h = 0.84; b.col = b.color || (w.pal.night > 0.5 ? "#323A5E" : "#4E5878"); },
    draw: function (w, b, t) {
      var r = ins(b, 0.1);
      w.box(r.x, r.y, 0, r.w, r.d, b.hb, b.col, { win: { rows: 3, blink: 2.5, litColor: "#46F0C8", color: shade(b.col, 0.72), mx: 0.05 } });
      for (var k = 0; k < 3; k++) {
        var fx = r.x + r.w * (0.2 + k * 0.3), fy = r.y + r.d * 0.42;
        w.cyl(fx, fy, b.hb, b.hb + 0.08, 0.16, w.pal.metal, { top: shade(w.pal.dark, 0.9) });
        var a = t * 5 + k;
        w.line3([[fx + Math.cos(a) * 0.13, fy + Math.sin(a) * 0.13, b.hb + 0.09], [fx - Math.cos(a) * 0.13, fy - Math.sin(a) * 0.13, b.hb + 0.09]], w.pal.metal, Math.max(1.5, w.K(0.04)));
      }
    },
  });
  bdef("server", 1, 1, {
    init: function (w, b) { b.h = 1.1 * Math.min(1.4, b.w); b.col = b.color || "#2E3552"; },
    draw: function (w, b) {
      var s = Math.min(b.w, b.d) * 0.56;
      w.box(b.x + (b.w - s) / 2, b.y + (b.d - s) / 2, 0, s, s, b.h, b.col, { win: { rows: 6, cols: 2, blink: 3, litColor: "#46F0C8", color: "#1C2036", mx: 0.12 }, top: shade(b.col, 1.3) });
    },
  });
  bdef("warehouse", 2, 2, {
    init: function (w, b) { b.hb = 0.8; b.h = 1.04; b.col = b.color || (w.pal.night > 0.5 ? "#59698E" : "#A3B5CC"); },
    draw: function (w, b) {
      var r = ins(b, 0.1);
      w.box(r.x, r.y, 0, r.w, r.d, b.hb, b.col, { deco: function (ctx, i, q, f) {
        var n = Math.max(1, Math.round((i % 2 ? r.d : r.w) / 0.8));
        for (var k = 0; k < n; k++) {
          var u0 = (k + 0.18) / n, u1 = (k + 0.82) / n;
          quadUV(ctx, q, u0, 0, u1, 0.62, shade("#DCE3EC", f));
          for (var l = 1; l < 4; l++) quadUV(ctx, q, u0, l * 0.15, u1, l * 0.15 + 0.02, shade("#B8C3D2", f));
        }
      } });
      w.gable(r.x - 0.04, r.y - 0.04, b.hb, r.w + 0.08, r.d + 0.08, 0.24, b.roof || (w.pal.night > 0.5 ? "#3E4C70" : "#6F84A6"), r.w >= r.d ? "x" : "y", { wall: b.col });
    },
  });
  bdef("turbine", 1, 1, {
    init: function (w, b) { b.h = 2.35; b.top = 2.4; b.round = 0.1; },
    draw: function (w, b, t) {
      var cx = b.x + b.w / 2, cy = b.y + b.d / 2, hz = 2.36;
      w.cyl(cx, cy, 0, 2.3, 0.05, "#F2F4F8");
      w.box(cx - 0.1, cy - 0.06, 2.27, 0.22, 0.12, 0.1, "#E3E7EE");
      var hub = w.P(cx, cy, hz), L = w.K(0.86), wd = w.K(0.05), a0 = t * 2.1 + b.seed;
      w.emit(2.4, w.depthOf(cx, cy) + 0.2, function (ctx) {
        for (var k = 0; k < 3; k++) {
          var a = a0 + (k * 2 * PI) / 3, ca = Math.cos(a), sa = Math.sin(a);
          ctx.beginPath(); ctx.moveTo(hub[0] - sa * wd, hub[1] + ca * wd); ctx.lineTo(hub[0] + ca * L, hub[1] + sa * L); ctx.lineTo(hub[0] + sa * wd, hub[1] - ca * wd); ctx.closePath();
          ctx.fillStyle = "#FFFFFF"; ctx.fill(); ctx.strokeStyle = "rgba(120,130,150,0.5)"; ctx.lineWidth = 1; ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(hub[0], hub[1], wd * 1.2, 0, 2 * PI); ctx.fillStyle = "#DDE2EA"; ctx.fill();
      });
    },
  });
  bdef("solar", 1, 1, {
    init: function (w, b) { b.h = 0.45; },
    draw: function (w, b) {
      var nx = Math.max(1, Math.round(b.w / 0.95)), ny = Math.max(1, Math.round(b.d / 0.75)), pw = b.w / nx, pd = b.d / ny, panel = "#2F4E8F";
      for (var i = 0; i < nx; i++) for (var j = 0; j < ny; j++) {
        var x0 = b.x + i * pw + 0.08, x1 = x0 + pw - 0.16, y0 = b.y + j * pd + 0.12, y1 = y0 + pd - 0.24;
        w.line3([[x0 + 0.1, y0 + 0.05, 0], [x0 + 0.1, y0 + 0.05, 0.38]], w.pal.dark, Math.max(1.2, w.K(0.02)));
        w.face([[x0, y1, 0.12], [x1, y1, 0.12], [x1, y0, 0.42], [x0, y0, 0.42]], [0, 0.3, y1 - y0], panel, { deco: function (ctx, q, f) {
          var Qd = [q[0], q[1], q[2], q[3]];
          for (var g = 1; g < 3; g++) quadUV(ctx, Qd, g / 3 - 0.01, 0, g / 3 + 0.01, 1, "rgba(170,205,255,0.55)");
          quadUV(ctx, Qd, 0, 0.49, 1, 0.51, "rgba(170,205,255,0.55)");
        } });
      }
    },
  });
  bdef("barn", 2, 2, {
    init: function (w, b) { b.s = clamp(Math.min(b.w, b.d) / 2, 0.55, 1.2); b.hb = 0.72 * b.s; b.h = b.hb + 0.45 * b.s; b.col = b.color || "#C8473C"; },
    draw: function (w, b) {
      var r = ins(b, 0.14 * b.s);
      w.box(r.x, r.y, 0, r.w, r.d, b.hb, b.col, { deco: function (ctx, i, q, f) {
        if (i !== 2) return;
        quadUV(ctx, q, 0.32, 0, 0.68, 0.66, shade("#FFFFFF", f));
        quadUV(ctx, q, 0.36, 0.04, 0.64, 0.6, shade(b.col, f * 0.85));
      } });
      w.gable(r.x - 0.05, r.y - 0.05, b.hb, r.w + 0.1, r.d + 0.1, 0.45 * b.s, b.roof || "#5B5F72", "y", { wall: b.col });
    },
  });
  bdef("silo", 1, 1, {
    init: function (w, b) { b.h = 1.72; b.round = 0.3; },
    draw: function (w, b) {
      var cx = b.x + b.w / 2, cy = b.y + b.d / 2;
      w.cyl(cx, cy, 0, 1.4, 0.3, b.color || "#DADFE6", { bands: [[0.45, 0.5], [0.92, 0.97]], noTop: true });
      w.dome(cx, cy, 1.4, 0.3, b.roof || "#C9473F");
    },
  });
  bdef("tank", 1, 1, {
    init: function (w, b) { b.h = 0.6; b.round = 0.4; },
    draw: function (w, b) {
      var cx = b.x + b.w / 2, cy = b.y + b.d / 2, r = Math.min(b.w, b.d) * 0.4;
      w.cyl(cx, cy, 0, 0.56, r, b.color || "#ECEFF3", { bands: [[0.3, 0.36, b.accent || w.pal.accent]] });
    },
  });
  bdef("crane", 1, 1, {
    init: function (w, b) { b.mast = num(b.hh, 3); b.h = b.mast + 0.3; b.top = b.mast + 0.35; b.round = 0.1; },
    draw: function (w, b, t) {
      var cx = b.x + b.w / 2, cy = b.y + b.d / 2, hc = b.mast, yel = "#F5B82E";
      w.box(cx - 0.07, cy - 0.07, 0, 0.14, 0.14, hc, yel, { deco: function (ctx, i, q) {
        var n = Math.max(2, Math.round(hc / 0.3));
        ctx.beginPath();
        for (var k = 0; k < n; k++) { var a = bil(q, 0, k / n), c = bil(q, 1, (k + 1) / n); ctx.moveTo(a[0], a[1]); ctx.lineTo(c[0], c[1]); }
        ctx.strokeStyle = "rgba(120,80,10,0.55)"; ctx.lineWidth = 1.2; ctx.stroke();
      } });
      w.box(cx - 0.13, cy - 0.13, hc, 0.26, 0.26, 0.16, yel);
      var ang = typeof b.angle === "function" ? b.angle(t) : b.angle != null ? +b.angle : -0.9 + 0.55 * Math.sin(t * 0.45 + b.seed), ca = Math.cos(ang), sa = Math.sin(ang);
      var z = hc + 0.2, lw = Math.max(2, w.K(0.06));
      w.line3([[cx - ca * 0.7, cy - sa * 0.7, z], [cx + ca * 2.1, cy + sa * 2.1, z]], "#E9A21A", lw);
      w.box(cx - ca * 0.7 - 0.11, cy - sa * 0.7 - 0.11, z - 0.12, 0.22, 0.22, 0.2, "#8C93A6");
      var hp = [cx + ca * 1.45, cy + sa * 1.45], hz = typeof b.hookZ === "function" ? b.hookZ(t) : b.hookZ != null ? +b.hookZ : hc * 0.55 + 0.35 * Math.sin(t * 0.7 + b.seed);
      w.line3([[hp[0], hp[1], z], [hp[0], hp[1], hz + 0.2]], w.pal.dark, Math.max(1, w.K(0.015)), { z0: z });
      w.box(hp[0] - 0.16, hp[1] - 0.16, hz, 0.32, 0.32, 0.2, b.load || "#C9CDD6", { z0: z });
    },
  });
  bdef("containers", 2, 2, {
    init: function (w, b) { b.h = 1.1; },
    draw: function (w, b) {
      var nx = Math.max(1, Math.round(b.w / 1)), ny = Math.max(1, Math.round(b.d / 0.62));
      for (var i = 0; i < nx; i++) for (var j = 0; j < ny; j++) {
        var n = 1 + Math.floor(hash(b.seed + i * 7 + j * 13) * 3);
        for (var k = 0; k < n; k++) {
          var col = pk(w, k % 2 ? "roofs" : "accents", b.seed + i * 3 + j * 5 + k);
          w.box(b.x + i * (b.w / nx) + 0.06, b.y + j * (b.d / ny) + 0.06, k * 0.34, b.w / nx - 0.12, b.d / ny - 0.12, 0.32, col, { deco: function (ctx, fi, q) {
            for (var l = 1; l < 6; l++) quadUV(ctx, q, l / 6 - 0.012, 0.06, l / 6 + 0.012, 0.94, "rgba(0,0,0,0.16)");
          } });
        }
      }
    },
  });
  bdef("dockcrane", 2, 2, {
    init: function (w, b) { b.h = 1.7; },
    draw: function (w, b) {
      var blue = "#3F6FD8", r = ins(b, 0.2);
      [[r.x, r.y], [r.x + r.w - 0.1, r.y], [r.x, r.y + r.d - 0.1], [r.x + r.w - 0.1, r.y + r.d - 0.1]].forEach(function (p) { w.box(p[0], p[1], 0, 0.1, 0.1, 1.5, blue); });
      w.box(r.x - 0.05, r.y, 1.5, r.w + 0.1, 0.12, 0.16, blue);
      w.box(r.x - 0.05, r.y + r.d - 0.12, 1.5, r.w + 0.1, 0.12, 0.16, blue);
      w.box(r.x + r.w * 0.42, r.y - 1.0, 1.66, 0.18, r.d + 1.0, 0.12, "#E2574C");
      w.box(r.x + r.w * 0.38, r.y + r.d * 0.2, 1.5, 0.26, 0.3, 0.16, "#F4F6FA");
    },
  });
  bdef("rocket", 1, 1, {
    init: function (w, b) { b.h = 2.0; b.round = 0.25; },
    draw: function (w, b, t) {
      var cx = b.x + b.w / 2, cy = b.y + b.d / 2, L = b.launch != null ? +b.launch : null, lz = 0, acc = b.accent || w.pal.accent;
      if (L != null && t > L) { var q = t - L; lz = q * 0.6 + q * q * 1.6; }
      b.liveZ = lz;
      w.box(b.x + 0.06, b.y + 0.06, 0, b.w - 0.12, b.d - 0.12, 0.08, "#B8BFCC");
      if (L != null && t > L) { w.glow(cx, cy, 0.1 + lz, 0.55, "#FFB020", { a: 0.95 }); smoke(w, cx, cy, 0.1, t, { size: 1.6, rate: 0.9, rise: 0.8 }); }
      w.box(cx - 0.32, cy - 0.025, 0.08 + lz, 0.64, 0.05, 0.32, acc);
      w.box(cx - 0.025, cy - 0.32, 0.08 + lz, 0.05, 0.64, 0.32, acc);
      w.cyl(cx, cy, 0.08 + lz, 1.5 + lz, 0.2, "#F6F7FA", { bands: [[1.02 + lz, 1.12 + lz, acc]], noTop: true });
      w.cone(cx, cy, 1.5 + lz, 0.2, 0.5, acc);
    },
  });
  bdef("cloud", 2, 2, {
    init: function (w, b) { if (b.z == null || b.z === 0) b.z = 3; b.h = 0.9; b.top = 1.0; b.manual = true; },
    draw: function (w, b, t) {
      var cx = b.x + b.w / 2, cy = b.y + b.d / 2, s = Math.min(b.w, b.d) * 0.6, zc = b.z + 0.35 + Math.sin(t * 1.1 + b.seed) * 0.07, c = w.cur;
      var parts = [[0, 0, 0.12, 0.62], [-0.62, 0.16, 0, 0.45], [0.64, -0.1, 0, 0.48], [0.18, 0.5, -0.06, 0.42], [-0.24, -0.44, 0.1, 0.4], [0.5, 0.4, -0.1, 0.34]];
      parts.sort(function (p, q) { return (p[0] * c.sa + p[1] * c.ca) - (q[0] * c.sa + q[1] * c.ca); });
      var col = b.color || w.pal.cloud;
      parts.forEach(function (p) { w.ball(cx + p[0] * s, cy + p[1] * s, zc + p[2] * s, p[3] * s, col, { matte: true }); });
      if (b.glyph) {
        var g = w.P(cx, cy, zc + 0.1), fs = w.K(0.55 * s);
        w.emit(b.z + 2, 0, function (ctx) { ctx.font = fontOf(fs, 900); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = b.accent || w.pal.accent; ctx.fillText(String(b.glyph), g[0], g[1]); });
      }
    },
  });
  function screenDeco(w, b, t, light) {
    return function (ctx, i, q, f) {
      if (i !== 2) return;
      var bg = w.pal.night > 0.5 ? "#1F2E5E" : "#EAF3FF";
      quadUV(ctx, q, 0.08, 0.05, 0.92, 0.95, light ? shade(bg, 1) : bg);
      quadUV(ctx, q, 0.08, 0.82, 0.92, 0.95, b.accent || w.pal.accent);
      for (var k = 0; k < 4; k++) {
        var v = 0.1 + frac(k / 4 + t * 0.16) * 0.62, wd = 0.35 + 0.45 * hash(b.seed + k), a = Math.sin(clamp((v - 0.1) / 0.62, 0, 1) * PI);
        quadUV(ctx, q, 0.16, v, 0.16 + wd * 0.68, v + 0.07, alpha(w.pal.accents[(k + 1) % w.pal.accents.length], 0.25 + 0.75 * a));
      }
    };
  }
  bdef("phone", 1, 1, {
    init: function (w, b) { b.s = Math.min(b.w, b.d); b.h = 1.25 * b.s; },
    draw: function (w, b, t) {
      var s = b.s, cx = b.x + b.w / 2, cy = b.y + b.d / 2;
      w.box(cx - 0.33 * s, cy - 0.07 * s, 0, 0.66 * s, 0.14 * s, b.h, b.color || "#262B45", { deco: screenDeco(w, b, t) });
    },
  });
  bdef("laptop", 1, 1, {
    init: function (w, b) { b.s = Math.min(b.w, b.d); b.h = 0.6 * b.s; },
    draw: function (w, b, t) {
      var s = b.s, x = b.x + (b.w - 0.84 * s) / 2, y = b.y + (b.d - 0.66 * s) / 2;
      w.box(x, y + 0.06 * s, 0, 0.84 * s, 0.6 * s, 0.05 * s, w.pal.metal);
      w.box(x, y, 0.05 * s, 0.84 * s, 0.06 * s, 0.55 * s, b.color || "#3A4060", { deco: screenDeco(w, b, t) });
    },
  });
  bdef("fountain", 1, 1, {
    init: function (w, b) { b.h = 0.6; b.round = 0.42; },
    draw: function (w, b, t) {
      var cx = b.x + b.w / 2, cy = b.y + b.d / 2;
      w.cyl(cx, cy, 0, 0.16, 0.42, "#D9D4CA", { top: "#CFC9BE" });
      w.disc(cx, cy, 0.165, 0.34, w.pal.water);
      w.glow(cx, cy, 0.4, 0.24, w.pal.water2, { a: 0.9 });
      for (var k = 0; k < 6; k++) {
        var ph = frac(t * 0.8 + k / 6), a = (k / 6) * 2 * PI, rr = 0.3 * ph;
        w.ball(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 0.18 + 0.5 * 4 * ph * (1 - ph), 0.035, w.pal.water2, { matte: true });
      }
    },
  });
  bdef("lamp", 1, 1, {
    init: function (w, b) { b.h = 0.7; b.round = 0.05; b.sInset = 0.45; },
    draw: function (w, b) {
      var cx = b.x + b.w / 2, cy = b.y + b.d / 2;
      w.cyl(cx, cy, 0, 0.62, 0.025, w.pal.dark);
      w.ball(cx, cy, 0.66, 0.065, "#FFE7A3", { matte: true });
      if (w.pal.night > 0) w.glow(cx, cy, 0.62, 0.55, "#FFD98A", { a: 0.55 * w.pal.night });
    },
  });
  bdef("bench", 1, 1, {
    init: function (w, b) { b.h = 0.3; b.shadow = false; },
    draw: function (w, b) {
      var cx = b.x + b.w / 2, cy = b.y + b.d / 2, wood = "#B07A4A";
      w.box(cx - 0.25, cy - 0.08, 0.12, 0.5, 0.16, 0.04, wood);
      w.box(cx - 0.25, cy - 0.1, 0.16, 0.5, 0.03, 0.14, shade(wood, 0.9));
      w.line3([[cx - 0.2, cy, 0], [cx - 0.2, cy, 0.12]], w.pal.dark, 1.5); w.line3([[cx + 0.2, cy, 0], [cx + 0.2, cy, 0.12]], w.pal.dark, 1.5);
    },
  });
  bdef("block", 1, 1, {
    init: function (w, b) { b.h = num(b.hh, 1); b.col = b.color || pk(w, "accents", b.seed); },
    draw: function (w, b) { w.box(b.x, b.y, 0, b.w, b.d, b.h, b.col, b.win ? { win: b.win } : null); },
  });
  bdef("lab", 2, 2, {
    init: function (w, b) { b.hb = 0.8; b.h = 1.3; b.col = b.color || (w.pal.night > 0.5 ? "#8E98C2" : "#F3F5F9"); },
    draw: function (w, b) {
      var r = ins(b, 0.14);
      w.box(r.x, r.y, 0, r.w, r.d, b.hb, b.col, { win: { rows: 2, color: "#A8E0D8", mx: 0.08 } });
      w.dome(r.x + r.w * 0.62, r.y + r.d * 0.45, b.hb, Math.min(r.w, r.d) * 0.3, "#9AD4F0");
      w.line3([[r.x + 0.2, r.y + 0.2, b.hb], [r.x + 0.2, r.y + 0.2, b.hb + 0.5]], w.pal.dark, Math.max(1.4, w.K(0.025)));
    },
  });
  bdef("mine", 2, 2, {
    init: function (w, b) { b.h = 0.95; },
    draw: function (w, b) {
      var r = ins(b, 0.05), rock = shade(w.pal.soil, 0.95);
      w.pyramid(r.x, r.y, 0, r.w, r.d * 0.8, 0.95, rock);
      w.box(r.x + r.w * 0.36, r.y + r.d * 0.6, 0, r.w * 0.28, 0.08, 0.42, "#6B4A33", { z0: 0, deco: function (ctx, i, q) { if (i === 2) quadUV(ctx, q, 0.15, 0, 0.85, 0.8, "#2A2026"); } });
      w.box(r.x + r.w * 0.62, r.y + r.d * 0.8, 0, 0.32, 0.22, 0.16, "#7C8496", { z0: 0 });
      w.ball(r.x + r.w * 0.62 + 0.12, r.y + r.d * 0.8 + 0.11, 0.2, 0.07, "#F2C14E", { z0: 0 });
    },
  });
  function buildingTypes() { return Object.keys(BT).concat(Object.keys(ALIAS), ["tree"]); }

  function buildAPI(w) {
    w.building = function (type, x, y, o) {
      o = obj(o);
      var ty = str(type).toLowerCase();
      if (ty === "tree") return w.tree(x, y, o);
      ty = ALIAS[ty] || ty;
      if (!BT[ty]) ty = "block";
      var def = BT[ty];
      var b = w.add({ type: ty, x: num(x, 0), y: num(y, 0), w: Math.max(0.3, num(o.w, def.w)), d: Math.max(0.3, num(o.d, def.d)), h: 1, at: o.at, anim: o.anim || "rise", dur: o.dur, z: num(o.z, 0) });
      ["floors", "color", "roof", "accent", "style", "smoke", "launch", "glyph", "angle", "hookZ", "load", "win", "key", "keyLabel", "noCut", "bias", "shadow"].forEach(function (k) { if (o[k] != null) b[k] = o[k]; });
      if (o.h != null) b.hh = +o.h;
      b.seed = Math.floor(hash2(b.x * 3 + 1, b.y * 5 + 2) * 9973);
      if (def.init) def.init(w, b);
      b.draw = function (w2, ctx, t) { def.draw(w, b, t); };
      if (o.label) b.labelRef = w.label(b, o.label, { at: (b.at || 0) + 0.3 });
      return b;
    };
    w.tree = function (x, y, o) {
      o = obj(o);
      var kind = o.kind || (hash2(num(x, 0), num(y, 0)) > 0.6 ? "pine" : "round"), s = num(o.size, 1);
      var tr = w.add({ type: "tree", x: num(x, 0), y: num(y, 0), w: 1, d: 1, h: kind === "bush" ? 0.35 * s : 0.9 * s, at: o.at, anim: o.anim || "pop", dur: o.dur || 0.5, round: (kind === "bush" ? 0.2 : 0.26) * s });
      var g = o.color || pk(w, "tree", tr.x * 7 + tr.y * 3), ox = (hash2(tr.x, tr.y + 3) - 0.5) * 0.3, oy = (hash2(tr.x + 3, tr.y) - 0.5) * 0.3;
      tr.lx = ox; tr.ly = oy;
      tr.draw = function () {
        var cx = tr.x + 0.5 + ox, cy = tr.y + 0.5 + oy;
        if (kind === "bush") { w.ball(cx, cy, 0.16 * s, 0.2 * s, g); return; }
        w.cyl(cx, cy, 0, 0.3 * s, 0.045 * s, w.pal.trunk);
        if (kind === "pine") { w.cone(cx, cy, 0.18 * s, 0.27 * s, 0.42 * s, g); w.cone(cx, cy, 0.42 * s, 0.21 * s, 0.42 * s, shade(g, 1.06)); }
        else { w.ball(cx, cy, 0.52 * s, 0.27 * s, g); w.ball(cx + 0.08 * s, cy - 0.1 * s, 0.66 * s, 0.17 * s, shade(g, 1.08)); }
      };
      return tr;
    };
    w.block = function (x, y, o) {
      o = obj(o);
      var bl = w.add({ type: "block", x: num(x, 0), y: num(y, 0), w: num(o.w, 1), d: num(o.d, 1), h: num(o.h, 1), z: num(o.z, 0), at: o.at, anim: o.anim || "rise", dur: o.dur });
      var col = o.color || pk(w, "accents", bl.id);
      bl.draw = function () { w.box(bl.x, bl.y, bl.z, bl.w, bl.d, bl.h, col, o.win ? { win: o.win } : o.top ? { top: o.top } : null); };
      return bl;
    };
    w.blockText = function (text, x, y, o) {
      o = obj(o);
      var cell = num(o.cell, 0.34), depth = num(o.depth, 2) * cell, at = o.at != null ? Math.max(0, +o.at) : null, stg = num(o.stagger, 0.07);
      var cols = Array.isArray(o.colors) && o.colors.length ? o.colors : w.pal.accents.slice(0, 4);
      var cx = num(x, 0), out = [], idx = 0;
      String(text || "").toUpperCase().split("").forEach(function (ch) {
        if (ch === " ") { cx += 3 * cell; return; }
        var g = glyph(ch);
        if (!g) return;
        var gw = g.w * cell, color = cols[idx % cols.length];
        var L = w.add({ type: "letter", keyLabel: ch, x: cx, y: num(y, 0), w: gw, d: depth, h: 7 * cell, at: at == null ? null : at + idx * stg, anim: o.anim || "drop", dur: num(o.dur, 0.8), dropH: 6, key: o.key !== false, sInset: 0 });
        L.draw = function () {
          g.runs.forEach(function (r) { w.box(L.x + r.c0 * cell, L.y, (L.z || 0) + (6 - r.row) * cell, r.n * cell, depth, cell, color); });
        };
        out.push(L);
        cx += (g.w + 1) * cell;
        idx++;
      });
      out.width = Math.max(0, cx - num(x, 0) - cell);
      return out;
    };
    lifeAPI(w);
  }

  // ------------------------- block letters (5 x 7 cells) -------------------------
  var GLYPHS = {
    A: ".###.|#...#|#...#|#####|#...#|#...#|#...#", B: "####.|#...#|#...#|####.|#...#|#...#|####.", C: ".###.|#...#|#....|#....|#....|#...#|.###.",
    D: "####.|#...#|#...#|#...#|#...#|#...#|####.", E: "#####|#....|#....|####.|#....|#....|#####", F: "#####|#....|#....|####.|#....|#....|#....",
    G: ".###.|#...#|#....|#.###|#...#|#...#|.####", H: "#...#|#...#|#...#|#####|#...#|#...#|#...#", I: "###|.#.|.#.|.#.|.#.|.#.|###",
    J: "..###|...#.|...#.|...#.|#..#.|#..#.|.##..", K: "#...#|#..#.|#.#..|##...|#.#..|#..#.|#...#", L: "#....|#....|#....|#....|#....|#....|#####",
    M: "#...#|##.##|#.#.#|#.#.#|#...#|#...#|#...#", N: "#...#|##..#|#.#.#|#..##|#...#|#...#|#...#", O: ".###.|#...#|#...#|#...#|#...#|#...#|.###.",
    P: "####.|#...#|#...#|####.|#....|#....|#....", Q: ".###.|#...#|#...#|#...#|#.#.#|#..#.|.##.#", R: "####.|#...#|#...#|####.|#.#..|#..#.|#...#",
    S: ".####|#....|#....|.###.|....#|....#|####.", T: "#####|..#..|..#..|..#..|..#..|..#..|..#..", U: "#...#|#...#|#...#|#...#|#...#|#...#|.###.",
    V: "#...#|#...#|#...#|#...#|#...#|.#.#.|..#..", W: "#...#|#...#|#...#|#.#.#|#.#.#|##.##|#...#", X: "#...#|#...#|.#.#.|..#..|.#.#.|#...#|#...#",
    Y: "#...#|#...#|.#.#.|..#..|..#..|..#..|..#..", Z: "#####|....#|...#.|..#..|.#...|#....|#####",
    0: ".###.|#...#|#..##|#.#.#|##..#|#...#|.###.", 1: ".#.|##.|.#.|.#.|.#.|.#.|###", 2: ".###.|#...#|....#|...#.|..#..|.#...|#####",
    3: "####.|....#|....#|.###.|....#|....#|####.", 4: "...#.|..##.|.#.#.|#..#.|#####|...#.|...#.", 5: "#####|#....|####.|....#|....#|#...#|.###.",
    6: ".###.|#....|#....|####.|#...#|#...#|.###.", 7: "#####|....#|...#.|..#..|.#...|.#...|.#...", 8: ".###.|#...#|#...#|.###.|#...#|#...#|.###.",
    9: ".###.|#...#|#...#|.####|....#|....#|.###.", "!": "#|#|#|#|#|.|#", "?": ".###.|#...#|....#|...#.|..#..|.....|..#..", ".": ".|.|.|.|.|.|#",
    "%": "##..#|##..#|...#.|..#..|.#...|#..##|#..##", "$": "..#..|.####|#.#..|.###.|..#.#|####.|..#..", "&": ".##..|#..#.|#.#..|.#...|#.#.#|#..#.|.##.#",
    "+": ".....|..#..|..#..|#####|..#..|..#..|.....", "-": "....|....|....|####|....|....|....",
  };
  var glyphCache = {};
  function glyph(ch) {
    if (glyphCache[ch] !== undefined) return glyphCache[ch];
    var src = GLYPHS[ch];
    if (!src) { var n = String(ch).normalize("NFKD").replace(/[\u0300-\u036f]/g, ""); src = GLYPHS[n]; }
    if (!src) return (glyphCache[ch] = null);
    var rows = src.split("|"), gw = rows[0].length, runs = [];
    rows.forEach(function (r, ri) {
      var c = 0;
      while (c < gw) {
        if (r[c] !== "#") { c++; continue; }
        var c0 = c;
        while (c < gw && r[c] === "#") c++;
        runs.push({ row: ri, c0: c0, n: c - c0 });
      }
    });
    return (glyphCache[ch] = { w: gw, runs: runs });
  }
  function blockTextWidth(text, cell) {
    cell = num(cell, 0.34);
    var x = 0, any = false;
    String(text || "").toUpperCase().split("").forEach(function (ch) {
      if (ch === " ") { x += 3 * cell; return; }
      var g = glyph(ch);
      if (!g) return;
      x += (g.w + 1) * cell; any = true;
    });
    return any ? x - cell : 0;
  }
  function blockClean(text) {
    return String(text || "").toUpperCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").split("").filter(function (c) { return c === " " || GLYPHS[c]; }).join("").replace(/\s+/g, " ").trim();
  }

  // ------------------------- lots, groups and towns -------------------------
  function fillLot(w, lot, kind, o) {
    o = obj(o);
    lot = obj(lot);
    var x = num(lot.x, 0), y = num(lot.y, 0), lw = num(lot.w, 2), ld = num(lot.d, 2), at = o.at != null ? +o.at : null, out = [], k = 0;
    function T(i) { return at == null ? null : at + i * (o.stagger != null ? o.stagger : 0.08); }
    kind = str(kind).toLowerCase();
    switch (kind) {
      case "trees":
        for (var i = 0; i < lw; i++) for (var j = 0; j < ld; j++) if (hash2(x + i, y + j) > 0.25) out.push(w.tree(x + i, y + j, { at: T(k++) }));
        break;
      case "park":
        w.area(x, y, x + lw - 1, y + ld - 1, "park", at);
        out.push(w.building("fountain", x + (lw > 1 ? 0.5 : 0), y + (ld > 1 ? 0.5 : 0), { at: T(k++), anim: "pop" }));
        out.push(w.tree(x, y, { at: T(k++), kind: "round" }));
        if (lw > 1 && ld > 1) { out.push(w.tree(x + lw - 1, y + ld - 1, { at: T(k++), kind: "round" })); out.push(w.building("bench", x + lw - 1, y, { at: T(k++), anim: "pop" })); }
        break;
      case "cottages":
        out.push(w.building("cottage", x, y, { at: T(k++) }));
        if (lw > 1) out.push(w.building("cottage", x + 1, y + (ld > 1 ? 1 : 0), { at: T(k++) }));
        if (lw > 1 && ld > 1) out.push(w.tree(x, y + 1, { at: T(k++) }), w.tree(x + 1, y, { at: T(k++), kind: "bush" }));
        break;
      case "turbines":
        out.push(w.building("turbine", x, y, { at: T(k++) }));
        if (lw > 1 && ld > 1) out.push(w.building("turbine", x + 1, y + 1, { at: T(k++) }));
        break;
      case "farm":
        w.area(x, y + (ld > 1 ? 1 : 0), x + lw - 1, y + ld - 1, "crop", at);
        out.push(w.building("barn", x, y, { w: 1, d: 1, at: T(k++) }));
        if (lw > 1) out.push(w.building("silo", x + 1, y, { at: T(k++) }));
        break;
      case "barnyard":
        out.push(w.building("barn", x, y, { w: Math.min(2, lw), d: Math.min(2, ld), at: T(k++) }));
        break;
      case "tanks":
        out.push(w.building("tank", x, y, { at: T(k++) }));
        if (lw > 1 && ld > 1) out.push(w.building("tank", x + 1, y + 1, { at: T(k++) }), w.building("tank", x + 1, y, { at: T(k++) }));
        break;
      case "servers":
        for (i = 0; i < lw; i++) for (j = 0; j < ld; j++) out.push(w.building("server", x + i, y + j, { at: T(k++) }));
        break;
      case "portyard":
        out.push(w.building("dockcrane", x, y, { w: lw, d: Math.max(1, ld - 1), at: T(k++) }));
        if (ld > 1) out.push(w.building("containers", x, y + ld - 1, { w: lw, d: 1, at: T(k++) }));
        break;
      default:
        var ty = ALIAS[kind] || kind;
        if (ty === "tree") out.push(w.tree(x, y, { at: T(0) }));
        else out.push(w.building(BT[ty] ? ty : "block", x, y, { w: lw, d: ld, at: T(0), floors: o.floors, style: o.style, color: o.color }));
    }
    return out.filter(Boolean);
  }
  function townLayout(cols, rows) {
    cols = Math.max(4, Math.round(num(cols, 12))); rows = Math.max(4, Math.round(num(rows, 10)));
    function lines(n) { var out = []; for (var p = 4; p < n - 2; p += 5) out.push(p); if (!out.length && n >= 6) out.push(Math.floor(n / 2)); return out; }
    var xs = lines(cols), ys = lines(rows), roads = [], lots = [], strips = [];
    xs.forEach(function (xr) { roads.push([[xr, 0], [xr, rows - 1]]); strips.push([[xr + 0.09, 0.2], [xr + 0.09, rows - 0.2]], [[xr + 0.91, 0.2], [xr + 0.91, rows - 0.2]]); });
    ys.forEach(function (yr) { roads.push([[0, yr], [cols - 1, yr]]); strips.push([[0.2, yr + 0.09], [cols - 0.2, yr + 0.09]], [[0.2, yr + 0.91], [cols - 0.2, yr + 0.91]]); });
    function spans(n, cuts) { var s = [], a = 0; cuts.concat([n]).forEach(function (c) { if (c - a > 0) s.push([a, c - 1]); a = c + 1; }); return s; }
    spans(cols, xs).forEach(function (sx) {
      spans(rows, ys).forEach(function (sy) {
        for (var x = sx[0]; x + 1 <= sx[1]; x += 2) for (var y = sy[0]; y + 1 <= sy[1]; y += 2) lots.push({ x: x, y: y, w: 2, d: 2 });
        if ((sx[1] - sx[0] + 1) % 2) for (var y2 = sy[0]; y2 <= sy[1]; y2++) lots.push({ x: sx[1], y: y2, w: 1, d: 1, edge: true });
        if ((sy[1] - sy[0] + 1) % 2) for (var x2 = sx[0]; x2 + 1 <= sx[1]; x2 += 2) lots.push({ x: x2, y: sy[1], w: 2, d: 1, edge: true });
      });
    });
    return { cols: cols, rows: rows, roads: roads, lots: lots, strips: strips, xs: xs, ys: ys };
  }
  function townLife(w, lay, o) {
    o = obj(o);
    var roads = arr(lay && lay.roads).map(function (r) { return w.road(r, { at: o.at, dur: o.dur }); });
    var nc = Math.round(num(o.cars, Math.min(6, roads.length * 2))), nw = Math.round(num(o.walkers, 6)), kinds = ["car", "car", "van", "bus", "car", "truck"], out = [];
    for (var i = 0; i < nc && roads.length; i++) out.push(w.car(roads[i % roads.length], { kind: kinds[i % kinds.length], phase: hash(i * 7 + 1), at: o.carAt != null ? o.carAt + i * 0.2 : null }));
    var strips = arr(lay && lay.strips);
    for (i = 0; i < nw && strips.length; i++) out.push(w.walker(strips[(i * 3) % strips.length], { phase: hash(i * 5 + 2), at: o.walkAt != null ? o.walkAt + i * 0.15 : null }));
    return out;
  }

  // ------------------------- DOM: headline, caption, badge -------------------------
  function wrapTheme(wrap) { for (var k in THEMES) if (wrap.classList.contains("iso-" + k)) return k; return "day"; }
  function headFor(wrap) { for (var i = 0; i < heads.length; i++) if (heads[i].wrap === wrap) return heads[i]; return null; }
  function head(root, o) {
    o = obj(o);
    root = root || V.root();
    var wrap = ensureWrap(root, themeName(o.theme || (worlds.length ? worlds[worlds.length - 1].theme : "day")));
    var pal = THEMES[wrapTheme(wrap)], pos = o.pos === "bottom" ? "bottom" : "top", centred = PORT || pos === "bottom";
    var el = doc.createElement("div");
    el.className = "iso-head" + (centred ? " iso-head-c" : "") + (o.plate ? " iso-plate" : "");
    var dark = wrapTheme(wrap) === "night";
    el.style.textShadow = dark ? "0 0 18px rgba(10,14,40,0.85)" : "0 0 18px rgba(255,255,255,0.85)";
    if (o.plate) el.style.background = dark ? "rgba(18,24,58,0.86)" : "rgba(255,255,255,0.9)";
    var maxW = PORT ? W * 0.88 : pos === "bottom" ? W * 0.82 : W * 0.84;
    el.style.maxWidth = maxW + "px";
    var kS = u(PORT ? 28 : 23), tS = u(PORT ? 70 : 60), sS = u(PORT ? 36 : 30);
    if (pos === "bottom") tS = u(PORT ? 74 : 66);
    var kick = null, ttl = null, sub = null;
    if (str(o.kicker)) {
      kick = doc.createElement("div"); kick.className = "iso-kicker"; kick.textContent = plainText(o.kicker);
      kick.style.fontSize = kS + "px"; kick.style.background = pal.accent; el.appendChild(kick);
    }
    if (str(o.title)) {
      ttl = doc.createElement("div"); ttl.className = "iso-title";
      emParts(o.title).forEach(function (pt) {
        var sp = doc.createElement("span");
        sp.textContent = pt.t;
        if (pt.em) { sp.className = "iso-em"; sp.style.color = pal.accent; }
        ttl.appendChild(sp);
      });
      ttl.style.fontSize = tS + "px"; ttl.style.color = pal.ink; el.appendChild(ttl);
    }
    if (str(o.sub)) {
      sub = doc.createElement("div"); sub.className = "iso-sub"; sub.textContent = plainText(o.sub);
      sub.style.fontSize = sS + "px"; sub.style.color = pal.muted; el.appendChild(sub);
    }
    if (!kick && !ttl && !sub) return null;
    wrap.appendChild(el);
    function shrink(node, size, lines, min) {
      if (!node) return;
      for (var i = 0; i < 14 && node.offsetHeight > lines * size * 1.16 + 2 && size > min; i++) { size *= 0.93; node.style.fontSize = size + "px"; }
    }
    shrink(ttl, tS, PORT ? 3 : 2, u(34));
    shrink(sub, sS, 2, u(22));
    var hh = el.offsetHeight, ww = el.offsetWidth, left, top;
    if (PORT) { left = (W - ww) / 2; top = pos === "bottom" ? 1440 - hh : 262; }
    else if (pos === "bottom") { left = (W - ww) / 2; top = H * 0.925 - hh; }
    else { left = W * 0.07; top = H * 0.075; }
    el.style.left = Math.round(left) + "px"; el.style.top = Math.round(top) + "px";
    var hd = { wrap: wrap, el: el, rect: { x: left, y: top, w: ww, h: hh }, pos: pos };
    heads.push(hd);
    var tl = V.timeline(), at = Math.max(0, num(o.at, 0.1));
    tl.fromTo(el, { opacity: 0, y: u(26) }, { opacity: 1, y: 0 }, { at: at, dur: 0.6, ease: "outCubic" });
    return el;
  }
  function caption(root, text, at, tl, o) {
    o = obj(o);
    root = root || V.root();
    var wrap = ensureWrap(root, worlds.length ? worlds[worlds.length - 1].theme : "day"), pal = THEMES[wrapTheme(wrap)];
    var el = doc.createElement("div");
    el.className = "iso-caption";
    el.textContent = plainText(text);
    el.style.fontSize = u(PORT ? 34 : 30) + "px";
    el.style.maxWidth = (PORT ? W * 0.86 : W * 0.7) + "px";
    el.style.color = pal.cardInk;
    wrap.appendChild(el);
    var hh = el.offsetHeight, ww = el.offsetWidth, left = (W - ww) / 2, top = PORT ? 1440 - hh : H * 0.925 - hh;
    el.style.left = Math.round(left) + "px"; el.style.top = Math.round(top) + "px";
    domBoxes.push({ wrap: wrap, el: el, rect: { x: left, y: top, w: ww, h: hh }, kind: "caption", label: plainText(text) });
    tl = tl && tl.fromTo ? tl : V.timeline();
    at = Math.max(0, num(at, 0.3));
    tl.fromTo(el, { opacity: 0, y: u(18) }, { opacity: 1, y: 0 }, { at: at, dur: 0.45, ease: "outCubic" });
    if (o.until != null) tl.to(el, { opacity: 0 }, { at: Math.max(at + 0.5, +o.until), dur: 0.3 });
    return el;
  }
  function badge(root, text, cx, cy, at, color) {
    var wrap = ensureWrap(root || V.root(), "day");
    var el = doc.createElement("div"), sz = u(PORT ? 104 : 112);
    el.className = "iso-badge";
    el.textContent = plainText(text) || "VS";
    el.style.width = el.style.height = sz + "px";
    el.style.fontSize = sz * 0.36 + "px";
    el.style.background = color || THEMES[wrapTheme(wrap)].accent;
    el.style.left = Math.round(cx - sz / 2) + "px"; el.style.top = Math.round(cy - sz / 2) + "px";
    wrap.appendChild(el);
    domBoxes.push({ wrap: wrap, el: el, rect: { x: cx - sz / 2, y: cy - sz / 2, w: sz, h: sz }, kind: "badge", label: el.textContent });
    V.timeline().fromTo(el, { opacity: 0, scale: 0.3 }, { opacity: 1, scale: 1 }, { at: Math.max(0, num(at, 0.3)), dur: 0.5, ease: "outBack" });
    return el;
  }
  function breathe(w, o) { o = obj(o); if (w) w.breath = { sway: num(o.sway, 6), zoom: num(o.zoom, 0.05), t0: num(o.from, 0), t1: num(o.to, D) }; return w; }
  function appear(o, at, style, dur) {
    if (Array.isArray(o)) { o.forEach(function (x) { appear(x, at, style, dur); }); return o; }
    if (!o) return o;
    o.at = Math.max(0, num(at, 0));
    if (style) o.anim = style; else if (!o.anim) o.anim = "rise";
    o.dur = num(dur, o.dur || 0.7);
    return o;
  }
  function leave(o, at, dur) {
    if (Array.isArray(o)) { o.forEach(function (x) { leave(x, at, dur); }); return o; }
    if (o) { o.leaveAt = Math.max(0, num(at, 0)); o.leaveDur = num(dur, 0.5); }
    return o;
  }
  function blob(cx, cy, r, n, seed) {
    n = Math.max(6, Math.round(num(n, 14))); r = num(r, 3); seed = num(seed, 1);
    var rad = [];
    for (var i = 0; i < n; i++) rad.push(r * (0.86 + 0.24 * hash(seed * 31 + i * 7)));
    for (var pass = 0; pass < 2; pass++) rad = rad.map(function (v, k) { return 0.25 * rad[(k + n - 1) % n] + 0.5 * v + 0.25 * rad[(k + 1) % n]; });
    return rad.map(function (v, k) { var a = (k / n) * 2 * PI; return [num(cx, 0) + Math.cos(a) * v, num(cy, 0) + Math.sin(a) * v]; });
  }
  function circlePts(cx, cy, r, n) { var out = []; for (var i = 0; i < n; i++) { var a = (i / n) * 2 * PI; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return out; }
  function autoFocus(w) {
    resolveVP(w);
    var f = fitAt(w, w.camBase.yaw), a = (w.camBase.yaw * PI) / 180;
    return { x: w.cx + f.ucx * Math.cos(a), y: w.cy - f.ucx * Math.sin(a), z: -f.ucy / SQ3, K: f.K };
  }
  function anchorBox(w, x, y, ww, dd, hh, at) {
    return w.add({ type: "anchor", x: x, y: y, w: ww, d: dd, h: hh, at: at, anim: "fade", dur: 0.2, shadow: false, noCut: true });
  }
  function fmtOf(vf) { vf = obj(vf); return { prefix: str(vf.prefix), suffix: str(vf.suffix), decimals: clamp(Math.round(num(vf.decimals, 0)), 0, 4) }; }

  // A whole lot (2x2 footprint) of one kind; returns { anchor, objs } with an invisible anchor for labels.
  function placeKind(w, kind, x, y, at, o) {
    o = o || {};
    kind = str(kind).toLowerCase();
    var objs = [], T = function (i) { return at == null ? null : at + i * 0.08; };
    function b(type, bx, by, opt) { var r = w.building(type, bx, by, Object.assign({ at: T(objs.length) }, opt || {})); objs.push(r); return r; }
    switch (kind) {
      case "farm": w.area(x, y + 1, x + 1, y + 1, "crop", at); b("barn", x, y, { w: 1, d: 1 }); b("silo", x + 1, y); break;
      case "home": case "house": b("house", x + 0.15, y + 0.15, { w: 1.7, d: 1.7, floors: 2 }); break;
      case "port": b("dockcrane", x, y, { w: 2, d: 1 }); b("containers", x, y + 1, { w: 2, d: 1 }); break;
      case "energy": b("turbine", x, y); b("solar", x + 1, y + 1); b("turbine", x + 1, y, {}); break;
      case "server": b("server", x, y); b("server", x + 1, y + 1); b("server", x + 1, y); break;
      case "phone": b("phone", x + 0.2, y + 0.2, { w: 1.6, d: 1.6 }); break;
      case "laptop": b("laptop", x + 0.1, y + 0.1, { w: 1.8, d: 1.8 }); break;
      case "cloud": b("cloud", x, y, { w: 2, d: 2, z: num(o.cloudZ, 2.2), anim: "pop" }); break;
      case "rocket": b("rocket", x + 0.5, y + 0.5, { launch: o.launch }); break;
      case "tower": b("tower", x + 0.25, y + 0.25, { w: 1.5, d: 1.5, floors: 10, style: "glass" }); break;
      case "people": w.area(x, y, x + 1, y + 1, "plaza", at); objs = objs.concat(w.crowd(x + 0.9, y + 0.8, 5, { at: at, wave: true })); break;
      case "village": objs = objs.concat(fillLot(w, { x: x, y: y, w: 2, d: 2 }, "cottages", { at: at })); break;
      case "city": b("office", x, y, { w: 1, d: 2, floors: 4 }); b("tower", x + 1, y, { floors: 9 }); b("tower", x + 1, y + 1, { floors: 6, style: "glass" }); break;
      case "forest": objs = objs.concat(fillLot(w, { x: x, y: y, w: 2, d: 2 }, "trees", { at: at })); break;
      case "industry": b("factory", x, y); break;
      case "tech": b("datacenter", x, y); break;
      default: b(BT[ALIAS[kind] || kind] ? kind : "office", x, y, { w: 2, d: 2 });
    }
    var top = 0.5;
    objs.forEach(function (q) { if (q) top = Math.max(top, (q.z || 0) + (q.top != null ? q.top : q.h)); });
    return { anchor: anchorBox(w, x, y, 2, 2, Math.min(top, 3.2), at), objs: objs, top: top };
  }

  // Fill free island tiles with trees, bushes, cottages and small fields so a diorama never looks bare.
  function scatter(w, o) {
    o = o || {};
    var occ = {}, pad = o.pad != null ? o.pad : 1, dens = o.density != null ? o.density : 0.3, out = [];
    function mark(x0, y0, x1, y1) { for (var x = Math.floor(x0); x < Math.ceil(x1); x++) for (var y = Math.floor(y0); y < Math.ceil(y1); y++) occ[x + "," + y] = 1; }
    w.objs.forEach(function (ob) {
      if (ob.type === "walker" || ob.type === "vehicle" || ob.type === "boat" || ob.layer === "over") return;
      var pp = ob.type === "tree" || ob.type === "lamp" || ob.type === "bench" ? 0 : pad;
      mark(ob.x - pp, ob.y - pp, ob.x + ob.w + pp, ob.y + ob.d + pp);
    });
    Object.keys(w.roads).forEach(function (k) { occ[k] = 1; });
    Object.keys(w.tiles).forEach(function (k) { occ[k] = 1; });
    arr(o.avoid).forEach(function (r) { mark(r[0], r[1], r[2], r[3]); });
    for (var y = 0; y < w.rows; y++) for (var x = 0; x < w.cols; x++) {
      if (occ[x + "," + y] || hash2(x * 3 + 11, y * 7 + 5) > dens) continue;
      var r = hash2(x + 5, y + 9);
      if (r < 0.5) out.push(w.tree(x, y, { kind: r < 0.18 ? "pine" : "round", at: o.at }));
      else if (r < 0.78) out.push(w.tree(x, y, { kind: "bush", at: o.at }));
      else if (o.houses !== false && r < 0.9) out.push(w.building("cottage", x, y, { at: o.at }));
      else w.tile(x, y, "crop", o.at);
      occ[x + "," + y] = 1;
    }
    return out;
  }

  // Camera that starts close on the first item, travels with the narration, then pulls back to the whole world.
  function followCam(w, spots, lands, zoom) {
    var foc = autoFocus(w), n = spots.length;
    if (!n) return;
    w.camera.set({ zoom: zoom, x: spots[0][0], y: spots[0][1], z: spots[0][2] });
    for (var i = 1; i < n; i++) w.camera.to({ x: spots[i][0], y: spots[i][1], z: spots[i][2] }, Math.max(0, lands[i] - 0.75), 0.85, "inOutSine");
    var tb = clamp(lands[n - 1] + 0.45, Math.min(lands[n - 1] + 0.1, D - 1.5), Math.max(0.5, D - 1.5));
    w.camera.to({ zoom: 1, x: foc.x, y: foc.y, z: foc.z }, tb, 1.0, "inOutCubic");
  }

  // ------------------------- templates -------------------------
  var TPL = {};
  function tWorld(root, p, o) {
    var title = str(p.title), hasHead = !!title || !!o.sub || !!o.kicker;
    var w = world(root, { cols: o.cols, rows: o.rows, theme: p.theme || o.theme, viewport: layout(hasHead, o.pos), headroom: o.headroom, yaw: o.yaw, island: o.island, fitPoints: o.fitPoints, fill: o.fill, crop: o.crop, thickness: o.thick, zoom: o.zoom });
    if (hasHead) head(root, { title: title, kicker: o.kicker, sub: o.sub, pos: o.pos, at: o.headAt != null ? o.headAt : 0.1, theme: w.theme, plate: o.plate });
    return w;
  }
  function decorate(w, spots, at) {
    spots.forEach(function (s, i) {
      if (s[2] === "lamp") w.building("lamp", s[0], s[1], { at: at, anim: "pop" });
      else if (s[2] === "bench") w.building("bench", s[0], s[1], { at: at, anim: "pop" });
      else w.tree(s[0], s[1], { at: at, kind: s[2] });
    });
  }

  TPL["iso-title"] = function (root, p) {
    var title = str(p.title) || "Untitled";
    var bt = blockClean(p.blockText);
    if (!bt) {
      var em = /\*([^*]+)\*/.exec(title), cand = em ? em[1] : contentWords(title).sort(function (a, b) { return b.length - a.length; })[0];
      bt = blockClean(cand || "HELLO") || "HELLO";
    }
    var maxL = PORT ? 7 : 11, words = bt.split(" ").filter(Boolean), lines = [bt];
    if (bt.replace(/ /g, "").length > maxL && words.length > 1) {
      var best = null;
      for (var k = 1; k < words.length; k++) {
        var a = words.slice(0, k).join(" "), b2 = words.slice(k).join(" "), sc = Math.max(blockTextWidth(a), blockTextWidth(b2));
        if (!best || sc < best.sc) best = { sc: sc, l: [a, b2] };
      }
      lines = best.l;
    }
    var cell = 0.34, lw = lines.map(function (l) { return blockTextWidth(l, cell); }), maxW = Math.max.apply(null, lw), two = lines.length > 1;
    var cols = Math.max(PORT ? 9 : 12, Math.ceil(maxW + (PORT ? 2.6 : 4))), rows = two ? 9 : PORT ? 7 : 6, lh = 7 * cell;
    var w = world(root, { cols: cols, rows: rows, theme: p.theme, viewport: layout(true, "bottom"), headroom: two ? 2.0 + lh + 0.3 : lh + 0.25, yaw: 28, fill: 1, zoom: 1.1 });
    var yFront = two ? 3.5 : 1.7, n = 0;
    lines.forEach(function (l) { n += l.replace(/ /g, "").length; });
    var stg = Math.min(0.07, (Math.min(2.2, D * 0.4) - 0.25) / Math.max(1, n)), t0 = 0.22, idx = 0;
    if (two) {
      var px0 = (cols - lw[0]) / 2 - 0.25;
      var plinth = w.block(px0, 0.8, { w: lw[0] + 0.5, d: 1.0, h: 2.0, color: w.pal.night > 0.5 ? "#5A6390" : "#E9E2D3", at: 0.1, anim: "rise" });
      plinth.shadowH = 2.0;
      var back = w.blockText(lines[0], (cols - lw[0]) / 2, 0.95, { at: t0, stagger: stg, cell: cell });
      back.forEach(function (L) { L.z = 2.0; L.dropH = 5; L.shadow = false; });
      idx = back.length;
    }
    var front = w.blockText(lines[lines.length - 1], (cols - lw[lw.length - 1]) / 2, yFront, { at: t0 + idx * stg, stagger: stg, cell: cell, colors: two ? [w.pal.accents[1], w.pal.accents[2], w.pal.accents[3], w.pal.accents[0]] : null });
    var lastAt = t0 + (idx + front.length) * stg + 0.8;
    var yRoad = rows - 2;
    w.area(0, Math.ceil(yFront + 0.7), cols - 1, yRoad - 1, "plaza");
    var road = w.road([[0, yRoad], [cols - 1, yRoad]]), rev = road.slice().reverse();
    w.car(road, { phase: 0.1 }); w.car(rev, { phase: 0.55, kind: "bus" }); if (cols > 12) w.car(road, { phase: 0.62, kind: "van" });
    for (var x = 1.5; x < cols - 1; x += 3) w.building("lamp", x - 0.5, yRoad - 1, { at: 0.15 + x * 0.02, anim: "pop" });
    w.walker([[1, yRoad - 0.55], [cols - 1, yRoad - 0.55]], { phase: 0.2 });
    w.walker([[cols - 1.5, yRoad - 0.75], [1.5, yRoad - 0.75]], { phase: 0.6 });
    w.walker([[0.5, yRoad + 0.92], [cols - 0.5, yRoad + 0.92]], { phase: 0.4 });
    decorate(w, [[0, rows - 1, "round"], [cols - 1, rows - 1, "pine"], [Math.floor(cols / 2), rows - 1, "bush"], [0, 0, "pine"], [cols - 1, 0, "round"], [2, rows - 1, "bush"], [cols - 3, rows - 1, "round"]], 0.1);
    w.clouds(2, { z: (two ? 2.0 : 0) + lh + 2.2 });
    breathe(w, { sway: 4, zoom: 0.03 });
    w.camera.to({ zoom: 1 }, 0, Math.min(2.4, D * 0.5), "outCubic");
    head(root, { title: title, kicker: p.kicker, sub: p.subtitle, pos: "bottom", at: Math.min(lastAt * 0.55, D * 0.3), theme: w.theme });
  };

  function districtFill(w, lot, kind, at, i) {
    var x = lot.x, y = lot.y, out = [], h = hash2(x, y), T = function (k) { return at + k * 0.07; };
    function b(type, bx, by, o) { var r = w.building(type, bx, by, Object.assign({ at: T(out.length) }, o || {})); out.push(r); return r; }
    function grp(g, l) { out = out.concat(fillLot(w, l || lot, g, { at: T(out.length) })); }
    if (lot.w < 2 || lot.d < 2) { grp(kind === "industry" ? "tanks" : kind === "farm" ? "farm" : "trees", lot); return out; }
    switch (kind) {
      case "homes": b("house", x, y, { floors: h > 0.5 ? 2 : 1 }); b("house", x + 1, y + 1); b("house", x + 1, y, { floors: h > 0.7 ? 2 : 1 }); out.push(w.tree(x, y + 1, { at: T(3) })); break;
      case "village": b("cottage", x, y); if (i % 2) b("silo", x, y + 1); else out.push(w.tree(x, y + 1, { at: T(out.length), kind: "round" })); w.area(x + 1, y, x + 1, y + 1, i % 3 ? "crop" : "field", at); break;
      case "shops": b("shop", x, y, { w: 2, d: 1 }); b("shop", x, y + 1); b("house", x + 1, y + 1, { floors: 2 }); break;
      case "downtown": b("office", x, y, { floors: 3 + Math.floor(h * 4) }); break;
      case "towers": b("tower", x, y, { w: 2, d: 2, floors: 9 + Math.floor(h * 7), style: i % 2 ? "glass" : null }); break;
      case "industry": b(i % 3 === 0 ? "factory" : i % 3 === 1 ? "warehouse" : "factory", x, y); if (i % 3 === 2) b("tank", x + 1, y + 1, { w: 1, d: 1 }); break;
      case "tech": if (i % 3 === 1) b("tower", x, y, { w: 2, d: 2, floors: 8 + Math.floor(h * 4), style: "glass" }); else if (i % 3 === 2) grp("servers"); else b("datacenter", x, y); break;
      case "green": grp(i % 3 === 0 ? "park" : i % 3 === 1 ? "turbines" : "trees"); break;
      case "farm": grp(i % 2 ? "barnyard" : "farm"); break;
      case "civic": b(["hospital", "school", "bank"][i % 3], x, y); break;
      case "port": if (i % 2) grp("portyard"); else b("containers", x, y); break;
      default: b("office", x, y, { floors: 4 });
    }
    return out;
  }
  TPL["city-grows"] = function (root, p) {
    var KINDS = ["village", "shops", "industry", "towers", "tech", "green"];
    var ms = arr(p.milestones).filter(function (m) { return m && (str(m.label) || str(m.year)); }).slice(0, 6);
    if (!ms.length) ms = [{ label: "A village", kind: "village" }, { label: "A town", kind: "shops" }, { label: "A city", kind: "towers" }];
    var n = ms.length, cols = PORT ? 12 : 14, rows = 12;
    var w = tWorld(root, p, { cols: cols, rows: rows, headroom: 4.4, yaw: 45 });
    var lay = townLayout(cols, rows), lands = landsFor(ms, function (m) { return m.label; }, function (m) { return m.keyword; }, { lo: 0.45 });
    var full = lay.lots.filter(function (l) { return !l.edge; }), edge = lay.lots.filter(function (l) { return l.edge; });
    var a0 = -0.75 * PI;
    full.sort(function (a, b) {
      function ang(l) { var v = Math.atan2(l.y + 1 - rows / 2, l.x + 1 - cols / 2) - a0; while (v < 0) v += 2 * PI; return v; }
      return ang(a) - ang(b);
    });
    var dist = full.map(function (l, i) { return Math.min(n - 1, Math.floor((i * n) / full.length)); });
    var dObjs = ms.map(function () { return []; }), dLots = ms.map(function () { return []; });
    full.forEach(function (l, i) {
      var di = dist[i], m = ms[di], kind = str(m.kind).toLowerCase() || KINDS[di % KINDS.length];
      dLots[di].push(l);
      l.t = Math.max(0.1, lands[di] - 0.3) + dLots[di].length * 0.06;
      dObjs[di] = dObjs[di].concat(districtFill(w, l, kind, l.t, dLots[di].length - 1));
      if (di > 0) [[0, 0], [1, 1], [1, 0]].forEach(function (q, k) {
        if (hash2(l.x + q[0] * 3, l.y + q[1] * 5) > 0.55 && k < 2) return;
        var tr = w.tree(l.x + q[0], l.y + q[1], { kind: k % 2 ? "pine" : "round" });
        leave(tr, Math.max(0.05, l.t - 0.25), 0.3);
      });
    });
    edge.forEach(function (l) { fillLot(w, l, "trees", {}); });
    lay.roads.forEach(function (r) { w.road(r); });
    setupRoadTimes(w, full, dist, lands);
    // camera: start on the first district, pull back as the town grows
    var foc = autoFocus(w);
    function dCenter(k) { var sx = 0, sy = 0, c = 0; for (var j = 0; j <= k; j++) dLots[j].forEach(function (l) { sx += l.x + 1; sy += l.y + 1; c++; }); return c ? [sx / c, sy / c] : [cols / 2, rows / 2]; }
    var c0 = dCenter(0);
    w.camera.set({ zoom: n > 1 ? 1.55 : 1.15, x: lerp(foc.x, c0[0], 0.75), y: lerp(foc.y, c0[1], 0.75), z: foc.z * 0.6 });
    for (var i = 1; i < n; i++) {
      var q = i / (n - 1), ci = dCenter(i);
      w.camera.to({ zoom: lerp(1.55, 1, q), x: lerp(lerp(foc.x, ci[0], 0.6), foc.x, q), y: lerp(lerp(foc.y, ci[1], 0.6), foc.y, q), z: lerp(foc.z * 0.6, foc.z, q) }, Math.max(0, lands[i] - 0.9), 1.1);
    }
    // cranes move on to the next district
    for (i = 1; i < n; i++) {
      if (!dLots[i].length) continue;
      var l = dLots[i][0], cr = w.building("crane", l.x + 0.5, l.y + 0.5, { h: 2.6, at: Math.max(0.1, lands[i - 1] + 0.25), anim: "pop", dur: 0.4, shadow: false });
      leave(cr, Math.max(lands[i - 1] + 0.8, lands[i] - 0.45), 0.35);
    }
    ms.forEach(function (m, k) {
      var best = null;
      dObjs[k].forEach(function (o) { if (o && o.type !== "tree" && (!best || o.h > best.h)) best = o; });
      if (!best) best = dObjs[k][0];
      if (!best) return;
      w.label(best, str(m.label), { big: str(m.year), at: lands[k] + 0.25, color: w.pal.accents[k % w.pal.accents.length], size: u(PORT ? (n > 4 ? 28 : 31) : n > 4 ? 25 : 27) });
    });
    var roads = lay.roads.map(function (r) { return r.map(function (pt) { return [pt[0] + 0.5, pt[1] + 0.5]; }); });
    ms.forEach(function (m, k) {
      if (!roads.length) return;
      w.car(roads[k % roads.length], { at: lands[k], phase: hash(k * 3), kind: ["car", "van", "bus", "truck", "car", "car"][k % 6] });
      if (lay.strips.length) w.walker(lay.strips[(k * 3) % lay.strips.length], { at: lands[k] + 0.2, phase: hash(k * 5 + 1) });
    });
    if (lay.strips.length) w.walker(lay.strips[1 % lay.strips.length], { phase: 0.3 });
    w.clouds(2);
    breathe(w, { sway: 3, zoom: 0 });
  };
  function setupRoadTimes(w, lots, dist, lands) {
    var keys = Object.keys(w.roads);
    keys.forEach(function (k) {
      var r = w.roads[k], best = null;
      lots.forEach(function (l, i) {
        if (r.x >= l.x - 1 && r.x <= l.x + l.w && r.y >= l.y - 1 && r.y <= l.y + l.w) { var di = dist[i]; if (best == null || di < best) best = di; }
      });
      r.at = best == null || best === 0 ? null : Math.max(0, lands[best] - 0.45);
    });
  }

  TPL["iso-bar-chart"] = function (root, p) {
    var bars = arr(p.bars).filter(function (b) { return b && isFinite(+b.value); }).slice(0, 7);
    if (!bars.length) bars = [{ label: "A", value: 3 }, { label: "B", value: 5 }, { label: "C", value: 2 }];
    var n = bars.length, vf = fmtOf(p.valueFormat), style = ["columns", "buildings", "stacks"].indexOf(p.style) >= 0 ? p.style : "columns";
    var hl = Number.isInteger(p.highlight) && p.highlight >= 0 && p.highlight < n ? p.highlight : null;
    var vmax = 0;
    bars.forEach(function (b) { vmax = Math.max(vmax, Math.abs(+b.value)); });
    vmax = vmax || 1;
    var cols = n * 2 + 2, rows = 5, Hm = PORT ? 6 : 4.8;
    var w = tWorld(root, p, { cols: cols, rows: rows, headroom: Hm + 1.2, yaw: PORT ? 24 : 30 });
    var lands = landsFor(bars, function (b) { return b.label; }, function (b) { return b.keyword; }, { lo: 0.4 });
    w.area(1, 1, cols - 2, 3, "plaza");
    var road = w.road([[0, rows - 1], [cols - 1, rows - 1]]);
    w.truck(road, { phase: 0.15, cargo: w.pal.accents[2] }); w.car(road.slice().reverse(), { phase: 0.6, kind: "van" });
    w.walker([[1.2, 3.75], [cols - 1.2, 3.75]], { phase: 0.1 }); w.walker([[cols - 1.4, 3.45], [1.4, 3.45]], { phase: 0.55 });
    w.walker([[1.1, 0.75], [cols - 1.1, 0.75]], { phase: 0.3 });
    decorate(w, [[0, 0, "pine"], [cols - 1, 0, "round"], [0, 2, "bush"], [cols - 1, 2, "round"]], null);
    var muted = w.pal.night > 0.5 ? "#6B7399" : "#B9C3D8", size = u(PORT ? (n > 5 ? 27 : 31) : n > 5 ? 24 : 27);
    bars.forEach(function (b, i) {
      var v = Math.abs(+b.value), h = Math.max(0.15, (Hm * v) / vmax), x = 1.35 + 2 * i, y = 1.35, at = Math.max(0, lands[i] - 0.25);
      var col = hl != null ? (i === hl ? w.pal.accent : muted) : w.pal.accents[i % w.pal.accents.length], top;
      if (style === "buildings") {
        top = w.building("tower", x - 0.05, y - 0.05, { w: 1.4, d: 1.4, floors: Math.max(1, Math.round(h / 0.3)), color: hl != null && i !== hl ? muted : null, style: hl === i || hl == null ? "glass" : null, at: at, dur: 0.9, key: true, keyLabel: str(b.label) });
        if (hl == null) top.col = mix(w.pal.glass, col, 0.45);
      } else if (style === "stacks") {
        var cnt = Math.max(1, Math.round((8 * v) / vmax)), ch = 0.72;
        for (var k = 0; k < cnt; k++) {
          var cube = w.block(x + 0.1, y + 0.1, { w: 1.1, d: 1.1, h: ch - 0.04, z: k * ch, color: col, at: at + k * Math.min(0.09, 0.8 / cnt), anim: "drop", dur: 0.6 });
          cube.dropH = 3; cube.key = true; cube.keyLabel = str(b.label); if (k) cube.shadow = false;
          top = cube;
        }
      } else {
        top = w.block(x, y, { w: 1.3, d: 1.3, h: h, color: col, at: at, anim: "rise", dur: 0.9 });
        top.key = true; top.keyLabel = str(b.label);
        w.block(x - 0.1, y - 0.1, { w: 1.5, d: 1.5, h: 0.08, color: shade(w.pal.plaza2, 0.95), at: at, anim: "pop", dur: 0.3 }).shadow = false;
      }
      if (hl === i) w.ping(x + 0.65, y + 0.65, { at: lands[i], color: w.pal.accent, radius: 1.4 });
      w.label(top, str(b.label), { at: lands[i] + 0.15, value: { from: 0, to: +b.value, prefix: vf.prefix, suffix: vf.suffix, decimals: vf.decimals, dur: 0.9 }, color: col === muted ? w.pal.muted : col, dim: hl != null && i !== hl, size: size, maxW: u(PORT ? 300 : 280) });
    });
    w.clouds(1);
    breathe(w, { sway: 4, zoom: 0.03 });
  };

  TPL["stat-tower"] = function (root, p) {
    var val = num(p.value, 0), dec = clamp(Math.round(num(p.decimals, 0)), 0, 4), pre = str(p.prefix), suf = str(p.suffix), label = str(p.label);
    var cmp = p.compare && isFinite(+p.compare.value) ? { value: +p.compare.value, label: str(p.compare.label) } : null;
    var X0 = PORT ? 0 : 2, cols = 9 + 2 * X0, rows = 8, Ht = 7, scale = Ht / Math.max(Math.abs(val), cmp ? Math.abs(cmp.value) : 0, 1e-9);
    var hMain = Math.max(0.9, Math.abs(val) * scale), hCmp = cmp ? Math.max(0.6, Math.abs(cmp.value) * scale) : 0;
    var w = tWorld(root, p, { cols: cols, rows: rows, headroom: Math.max(hMain, hCmp) + 1.4, yaw: 40, sub: str(p.context) });
    var tEnd = kwFind(p.keyword, 0);
    if (tEnd == null) tEnd = labelTime(label, null, 0);
    if (tEnd == null) tEnd = D * 0.6;
    tEnd = clamp(tEnd, Math.min(1.4, D * 0.5), Math.max(1.2, D - 1.3));
    var t0 = Math.min(0.3, tEnd * 0.3), dur = Math.max(0.5, tEnd - t0), fh = 0.35, tx = 3 + X0, ty = 2.5, tw = 2;
    function hNow(t) { return hMain * E.inOutSine(prog(t, t0, dur)); }
    var tower = w.add({ type: "stat-tower", x: tx, y: ty, w: tw, d: tw, h: hMain, at: 0, anim: "none", key: true, keyLabel: label || "tower" });
    var col = w.pal.night > 0.5 ? "#7C86B8" : "#EDE7DD", acc = w.pal.accent;
    tower.update = function (t) { tower.liveZ = hNow(t) - hMain; };
    tower.draw = function (w2, ctx, t) {
      var hn = hNow(t), done = Math.floor(hn / fh + 1e-6), hd = done * fh, m = 0.14;
      w.box(tx - 0.08, ty - 0.08, 0, tw + 0.16, tw + 0.16, 0.12, shade(w.pal.plaza2, 0.95));
      if (hd > 0.01) w.box(tx + m, ty + m, 0.12, tw - 2 * m, tw - 2 * m, hd - 0.0, col, { win: { rows: done, mx: 0.07, color: w.pal.glass } });
      if (hn - hd > 0.01) w.box(tx + m + 0.04, ty + m + 0.04, 0.12 + hd, tw - 2 * m - 0.08, tw - 2 * m - 0.08, hn - hd, "#B8BFCC", { top: "#CBD1DB" });
      if (t >= t0 + dur) {
        var q = E.outBack(prog(t, t0 + dur, 0.5));
        w.box(tx + 0.4, ty + 0.4, 0.12 + hn, tw - 0.8, tw - 0.8, 0.28 * q, acc);
        w.line3([[tx + tw / 2, ty + tw / 2, 0.4 + hn], [tx + tw / 2, ty + tw / 2, 0.4 + hn + 0.6 * q]], w.pal.dark, Math.max(1.5, w.K(0.03)));
      }
    };
    tower.top = hMain + 0.12;
    var crane = w.building("crane", tx - 1.3, ty - 0.9, { h: hMain + 1.3, at: 0.05, anim: "pop", dur: 0.4, shadow: false });
    crane.angle = function (t) { return 0.72 + 0.18 * Math.sin(t * 0.8); };
    crane.hookZ = function (t) { return t < t0 + dur ? hNow(t) + 0.45 + 0.2 * Math.sin(t * 2) : hMain + 0.8; };
    w.label(tower, label, { at: t0, value: { from: 0, to: val, prefix: pre, suffix: suf, decimals: dec, dur: dur, ease: "inOutSine" }, size: u(PORT ? 34 : 31), maxW: u(PORT ? 480 : 460), side: "right", lift: u(10) });
    if (cmp) {
      var tc = labelTime(cmp.label, null, tEnd);
      tc = clamp(tc != null ? tc : tEnd + 0.8, Math.min(tEnd + 0.4, D - 1.4), Math.max(0.5, D - 1.4));
      var ct = w.building("tower", 6.1 + X0, 4.2, { w: 1.5, d: 1.5, floors: Math.max(1, Math.round(hCmp / 0.3)), color: w.pal.night > 0.5 ? "#59618C" : "#C9D1E2", at: tc - 0.2, dur: 0.8, key: true, keyLabel: cmp.label });
      w.label(ct, cmp.label, { at: tc + 0.15, big: fmtNum(cmp.value, dec, pre, suf), color: w.pal.accents[1], size: u(PORT ? 30 : 26), side: "right" });
    }
    var road = w.road([[0, rows - 1], [cols - 1, rows - 1]]);
    w.car(road, { phase: 0.2 }); w.car(road.slice().reverse(), { phase: 0.7, kind: "truck", cargo: w.pal.accents[2] });
    w.area(2 + X0, 2, 5 + X0, 5, "plaza");
    w.building("house", 0, 0); w.building("house", 1, 0, { floors: 2 }); w.building("house", 0, 1);
    w.building("shop", 7 + X0, 0); w.building("house", 8 + X0, 1);
    if (X0) { w.building("office", 10, 3, { floors: 3 }); w.building("house", 11, 0); w.building("shop", 0, 4); w.building("house", 1, 4, { floors: 2 }); }
    decorate(w, [[0, 5, "round"], [1, 6, "pine"], [8 + X0, 3, "round"], [7 + X0, 6, "bush"], [0, 3, "pine"], [6 + X0, 1, "round"], [8 + X0, 6, "pine"]], null);
    w.walker([[2.2 + X0, 5.8], [6.5 + X0, 5.8]], { phase: 0.1 }); w.walker([[1.6 + X0, 2.2], [1.6 + X0, 5.6]], { phase: 0.5 }); w.crowd(2.5 + X0, 5.0, 3, { at: 0.2 });
    scatter(w, { density: 0.35, avoid: [[tx - 2, ty - 2, tx + tw + 1, ty + tw + 1]] });
    w.clouds(2);
    var foc = autoFocus(w);
    w.camera.set({ zoom: 1.3, x: tx + 1, y: ty + 1, z: 1.0 });
    w.camera.to({ zoom: 1, x: foc.x, y: foc.y, z: foc.z }, t0, dur + 0.4, "inOutSine");
    breathe(w, { sway: 5, zoom: 0 });
  };

  function beltItem(w, item, x, y, z, t, k) {
    switch (item) {
      case "data": w.glow(x, y, z + 0.12, 0.22, w.pal.data, { a: 0.95 }); w.ball(x, y, z + 0.12, 0.06, "#FFFFFF", { matte: true }); break;
      case "leaf": w.ball(x, y, z + 0.1, 0.1, k % 2 ? "#6CC04A" : "#4FA83D"); break;
      case "coin": w.cyl(x, y, z, z + 0.05, 0.13, "#F5C542", { top: "#FFD966" }); break;
      case "parcel": w.box(x - 0.13, y - 0.11, z, 0.26, 0.22, 0.16, "#C98B4E", { top: "#D9A066" }); w.flat([[x - 0.04, y - 0.11], [x + 0.04, y - 0.11], [x + 0.04, y + 0.11], [x - 0.04, y + 0.11]], z + 0.161, "#F3E6CF"); break;
      case "box": w.box(x - 0.12, y - 0.12, z, 0.24, 0.24, 0.2, "#D9A05B", { top: "#E8B776" }); break;
      default: w.box(x - 0.13, y - 0.13, z, 0.26, 0.26, 0.22, "#B57A45", { top: "#C98D55", deco: function (ctx, i, q) { quadUV(ctx, q, 0, 0.45, 1, 0.55, "rgba(0,0,0,0.18)"); } });
    }
  }
  function belt(w, x0, x1, y, at, item, speed) {
    var len = x1 - x0, bz = 0.3;
    var bl = w.add({ type: "belt", x: x0, y: y - 0.25, w: len, d: 0.5, h: 0.4, at: at, anim: "grow", dur: 0.5 });
    bl.draw = function (w2, ctx, t) {
      for (var k = 0; k <= Math.floor(len / 0.7); k++) { var px = x0 + 0.2 + k * 0.7; w.line3([[px, y - 0.18, 0], [px, y - 0.18, bz]], w.pal.dark, Math.max(1.4, w.K(0.03))); w.line3([[px, y + 0.18, 0], [px, y + 0.18, bz]], w.pal.dark, Math.max(1.4, w.K(0.03))); }
      var off = frac(t * speed / 0.25);
      w.box(x0, y - 0.24, bz, len, 0.48, 0.08, "#5A6382", { top: "#3E4560", topDeco: function (ctx, q) {
        var Qd = [q[0], q[1], q[2], q[3]];
        for (var r = 0; r < len / 0.25; r++) { var uu = (r + off) / (len / 0.25); if (uu < 1) quadUV(ctx, Qd, uu, 0.05, Math.min(1, uu + 0.02), 0.95, "rgba(255,255,255,0.18)"); }
      } });
      w.box(x0, y - 0.27, bz + 0.08, len, 0.03, 0.06, "#8A93AE"); w.box(x0, y + 0.24, bz + 0.08, len, 0.03, 0.06, "#8A93AE");
      if (t < at + 0.4) return;
      var cnt = Math.max(2, Math.round(len / 0.55));
      for (var i = 0; i < cnt; i++) {
        var s = frac(((t - at - 0.4) * speed) / len + i / cnt) * len, a = clamp(Math.min(s, len - s) / 0.2, 0, 1);
        if (a <= 0.05) continue;
        beltItem(w, item, x0 + s, y, bz + 0.08, t, i);
      }
    };
    return bl;
  }
  TPL["process-line"] = function (root, p) {
    var DEF = ["farm", "factory", "warehouse", "shop", "office", "home"];
    var steps = arr(p.steps).filter(function (s) { return s && str(s.label); }).slice(0, 6);
    if (!steps.length) steps = [{ label: "Start" }, { label: "Make" }, { label: "Ship" }];
    var n = steps.length, item = ["box", "crate", "data", "leaf", "parcel", "coin"].indexOf(p.item) >= 0 ? p.item : "crate";
    var cols = 4 * n + 1, rows = 6;
    var w = tWorld(root, p, { cols: cols, rows: rows, headroom: 2.6, yaw: PORT ? 60 : 30 });
    var lands = landsFor(steps, function (s) { return s.label; }, function (s) { return s.keyword; }, { lo: 0.45, gap: 0.5 });
    steps.forEach(function (s, i) {
      var x = 1 + 4 * i, y = 1, at = Math.max(0.05, lands[i] - 0.3), kind = str(s.kind).toLowerCase() || DEF[i % DEF.length];
      w.area(x, y, x + 1, y + 1, "plaza", at);
      w.area(x, y + 2, x + 1, y + 2, "glow", lands[i]);
      var pl = placeKind(w, kind, x, y, at, { cloudZ: 1.6 });
      w.ping(x + 1, y + 1, { at: lands[i], color: w.pal.accents[i % w.pal.accents.length], radius: 1.5 });
      w.label(pl.anchor, str(s.label), { at: lands[i] + 0.15, badge: String(i + 1), color: w.pal.accents[i % w.pal.accents.length], size: u(PORT ? 31 : 27) });
      if (i < n - 1) belt(w, x + 2, x + 4, 2, Math.max(0.05, lands[i + 1] - 0.55), item, 0.75);
    });
    var road = w.road([[0, rows - 1], [cols - 1, rows - 1]]);
    w.truck(road, { phase: 0.3, cargo: "#D9A05B" }); w.car(road.slice().reverse(), { phase: 0.75 });
    w.walker([[0.6, 4.3], [cols - 0.6, 4.3]], { phase: 0.2 }); w.walker([[cols - 0.8, 3.7], [0.8, 3.7]], { phase: 0.65 });
    for (var x = 0; x < cols; x += 4) { w.tree(x, 0, { kind: x % 8 ? "pine" : "round" }); if (x + 2 < cols) w.building("lamp", x + 2, 4, { at: null }); }
    scatter(w, { density: 0.3, houses: false });
    w.clouds(1);
    if (n > 2) followCam(w, steps.map(function (s, i) { return [2 + 4 * i - (i ? 0.6 : 0), 2.0, 1.1]; }), lands, PORT ? 1.35 : 1.45);
    breathe(w, { sway: 4, zoom: n > 2 ? 0 : 0.04 });
  };

  TPL["network"] = function (root, p) {
    var hub = obj(p.hub), hubKind = ["server", "datacenter", "cloud", "office", "tower", "bank", "phone", "laptop", "people"].indexOf(hub.kind) >= 0 ? hub.kind : "server";
    var nodes = arr(p.nodes).filter(function (nd) { return nd && str(nd.label); }).slice(0, 8);
    if (!nodes.length) nodes = [{ label: "Phone", kind: "phone" }, { label: "Laptop", kind: "laptop" }];
    var n = nodes.length, cols = PORT ? 12 : 15, rows = 12, theme = p.theme || "night";
    var w = tWorld(root, { title: p.title, theme: theme }, { cols: cols, rows: rows, headroom: hubKind === "cloud" ? 3.3 : 2.6, yaw: 45 });
    var lands = landsFor(nodes, function (nd) { return nd.label; }, function (nd) { return nd.keyword; }, { lo: 0.7 });
    var cx = cols / 2, cy = rows / 2, tHub = 0.15, cloudHub = hubKind === "cloud", hubTop;
    w.area(cx - 1, cy - 1, cx, cy, "plaza");
    var hp = placeKind(w, hubKind, cx - 1, cy - 1, tHub, { cloudZ: 1.9 });
    hubTop = cloudHub ? 1.9 : Math.min(hp.top, 2.2);
    if (cloudHub) {
      var beam = w.add({ type: "beam", x: cx - 0.5, y: cy - 0.5, w: 1, d: 1, h: 1.9, at: 0.25, anim: "fade", dur: 0.5, shadow: false });
      beam.draw = function (w2, ctx, t) {
        var a = w.P(cx, cy, 0.05), b = w.P(cx, cy, 1.9), lw = w.K(0.5);
        w.emit(0, 0, function (cx2) {
          var g = cx2.createLinearGradient(a[0], a[1], b[0], b[1]);
          g.addColorStop(0, alpha(w.pal.data, 0.45)); g.addColorStop(1, alpha(w.pal.data, 0.05));
          cx2.strokeStyle = g; cx2.lineWidth = lw; cx2.lineCap = "round"; cx2.beginPath(); cx2.moveTo(a[0], a[1]); cx2.lineTo(b[0], b[1]); cx2.stroke();
          for (var k = 0; k < 3; k++) { var q = frac(t * 0.6 + k / 3), y = lerp(a[1], b[1], q); cx2.fillStyle = alpha("#FFFFFF", 0.9 * Math.sin(q * PI)); cx2.beginPath(); cx2.arc(a[0], y, w.K(0.06), 0, 2 * PI); cx2.fill(); }
        });
      };
    }
    if (str(hub.label)) w.label(hp.anchor, str(hub.label), { at: 0.45, color: w.pal.accents[1], size: u(PORT ? 32 : 28) });
    if (cloudHub) w.ping(cx, cy, { at: 0.3, loop: true, color: w.pal.data, radius: 1.6, period: 2.2 });
    var Rx = PORT ? 4.1 : 5.3, Ry = PORT ? 4.4 : 3.7, ca = Math.cos(PI / 4), sa = Math.sin(PI / 4);
    nodes.forEach(function (nd, i) {
      var phi = -PI / 2 + (2 * PI * i) / n + (n % 2 ? 0 : PI / n);
      var rx = Rx * Math.cos(phi), ry = Ry * Math.sin(phi), dx = rx * ca + ry * sa, dy = -rx * sa + ry * ca;
      var kind = str(nd.kind).toLowerCase() || "house", big = ["phone", "laptop", "server", "people", "cloud", "rocket"].indexOf(kind) < 0;
      var sz = 2, nx = clamp(Math.round(cx + dx - sz / 2), 0, cols - sz), ny = clamp(Math.round(cy + dy - sz / 2), 0, rows - sz);
      var at = Math.max(0.2, lands[i] - 0.3), pl;
      if (kind === "phone") pl = placeKind(w, "phone", nx, ny, at);
      else if (kind === "laptop") pl = placeKind(w, "laptop", nx, ny, at);
      else pl = placeKind(w, kind === "people" ? "people" : kind, nx, ny, at, { cloudZ: 1.6 });
      var A = [nx + 1, ny + 1, 0.06], B = [cx, cy, 0.06];
      if (cloudHub) {
        w.arc([nx + 1, ny + 1, Math.min(pl.top, 1.4)], [cx, cy, hubTop + 0.2], { at: lands[i], color: w.pal.data, height: 0.9, count: 3, speed: 1.4 });
        w.arc([cx, cy, hubTop + 0.2], [nx + 1, ny + 1, Math.min(pl.top, 1.4)], { at: lands[i] + 0.3, color: w.pal.accents[(i + 3) % 6], height: 1.3, count: 2, speed: 1.2, cable: false });
      } else {
        var off = 0.12, ux = B[0] - A[0], uy = B[1] - A[1], L = Math.hypot(ux, uy) || 1, ox = (-uy / L) * off, oy = (ux / L) * off;
        w.flow([[A[0] + ox, A[1] + oy, 0.06], [B[0] + ox, B[1] + oy, 0.06]], { at: lands[i], color: w.pal.data, count: 3, speed: 1.4 });
        w.flow([[B[0] - ox, B[1] - oy, 0.06], [A[0] - ox, A[1] - oy, 0.06]], { at: lands[i] + 0.25, color: w.pal.accents[(i + 3) % 6], count: 2, speed: 1.2 });
      }
      w.ping(nx + 1, ny + 1, { at: lands[i], color: w.pal.data, radius: 1.2 });
      w.label(pl.anchor, str(nd.label), { at: lands[i] + 0.2, color: w.pal.accents[i % w.pal.accents.length], size: u(PORT ? (n > 5 ? 27 : 30) : n > 5 ? 24 : 27) });
    });
    var occ = {};
    w.objs.forEach(function (o) { for (var x = Math.floor(o.x); x < o.x + o.w; x++) for (var y = Math.floor(o.y); y < o.y + o.d; y++) occ[x + "," + y] = 1; });
    for (var k = 0; k < 18; k++) { var x = Math.floor(hash(k * 3 + 1) * cols), y = Math.floor(hash(k * 3 + 2) * rows); if (!occ[x + "," + y] && Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > 1.8) { occ[x + "," + y] = 1; if (k % 4 === 0) w.building("lamp", x, y); else w.tree(x, y, { kind: k % 3 ? "pine" : "round" }); } }
    w.walker([[1, rows - 0.6], [cols - 1, rows - 0.6]], { phase: 0.3 }); w.walker([[0.6, 1], [0.6, rows - 1]], { phase: 0.7 });
    if (w.pal.night < 0.5) w.clouds(1);
    breathe(w, { sway: 5, zoom: 0.04 });
  };

  function islandContent(w, kind, cx, cy, at) {
    var objs = [], T = function (i) { return at + i * 0.08; };
    function b(type, x, y, o) { var r = w.building(type, x, y, Object.assign({ at: T(objs.length) }, o || {})); objs.push(r); return r; }
    function tr(x, y, k) { objs.push(w.tree(x, y, { at: T(objs.length), kind: k })); }
    var x = Math.round(cx) - 2, y = Math.round(cy) - 2;
    switch (kind) {
      case "farm": w.area(x + 1, y + 2, x + 2, y + 3, "crop", at); w.area(x + 3, y + 2, x + 3, y + 3, "field", at); b("barn", x + 1, y + 0.4, { w: 1.6, d: 1.5 }); b("silo", x + 3, y + 0.6); tr(x, y + 2, "round"); break;
      case "forest": [[1, 1, "pine"], [2, 0.6, "pine"], [3, 1.2, "round"], [0.8, 2.3, "round"], [2, 2.1, "pine"], [3, 2.6, "pine"], [1.6, 3.2, "round"], [2.6, 3.4, "bush"]].forEach(function (q) { tr(x + q[0], y + q[1], q[2]); }); break;
      case "industry": b("factory", x + 0.8, y + 0.6); b("tank", x + 2.8, y + 0.8); b("tank", x + 2.9, y + 2.0); b("warehouse", x + 0.9, y + 2.6, { w: 2, d: 1 }); break;
      case "port": w.area(x + 2, y + 2, x + 3, y + 3, "water", at); b("dockcrane", x + 2, y + 0.8, { w: 2, d: 1.1 }); b("containers", x + 0.6, y + 1, { w: 1.4, d: 2 }); w.boat([[x + 2.4, y + 2.5], [x + 3.6, y + 3.5]], { at: at + 0.4 }); break;
      case "tech": b("datacenter", x + 0.7, y + 1.6); b("tower", x + 2.6, y + 0.7, { w: 1.2, d: 1.2, floors: 8, style: "glass" }); b("server", x + 1.2, y + 0.6); b("server", x + 2.8, y + 2.4); break;
      case "energy": b("turbine", x + 1, y + 0.7); b("turbine", x + 2.6, y + 0.6); b("solar", x + 1, y + 2.2, { w: 2.2, d: 1.4 }); tr(x + 3.2, y + 2.6, "round"); break;
      case "village": b("cottage", x + 1, y + 1); b("cottage", x + 2.4, y + 0.8); b("cottage", x + 1.6, y + 2.4); tr(x + 3, y + 2.2, "round"); tr(x + 0.6, y + 2.4, "pine"); break;
      default: b("office", x + 0.6, y + 0.6, { w: 1.6, d: 1.6, floors: 4 }); b("tower", x + 2.4, y + 0.5, { w: 1.2, d: 1.2, floors: 10 }); b("tower", x + 2.5, y + 2.0, { w: 1.1, d: 1.1, floors: 6, style: "glass" }); b("house", x + 1, y + 2.5); b("house", x + 0.6, y + 3.1, { floors: 2 });
    }
    var top = 0.6;
    objs.forEach(function (o) { top = Math.max(top, (o.z || 0) + (o.top != null ? o.top : o.h)); });
    return { objs: objs, top: top };
  }
  TPL["island-map"] = function (root, p) {
    var KINDS = ["city", "farm", "forest", "industry", "port", "tech", "energy", "village"];
    var regs = arr(p.regions).filter(function (r) { return r && str(r.label); }).slice(0, 6);
    if (!regs.length) regs = [{ label: "City", kind: "city" }, { label: "Farms", kind: "farm" }];
    var n = regs.length, S1 = 5.0, rad = 2.35;
    var ARR = PORT ? { 1: [[0, 0]], 2: [[-0.25, -0.5], [0.25, 0.5]], 3: [[-0.5, -0.5], [0.5, -0.22], [-0.05, 0.56]], 4: [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]], 5: [[-0.5, -0.85], [0.5, -0.85], [0, 0], [-0.5, 0.85], [0.5, 0.85]], 6: [[-0.5, -0.95], [0.5, -0.95], [-0.5, 0], [0.5, 0], [-0.5, 0.95], [0.5, 0.95]] }
      : { 1: [[0, 0]], 2: [[-0.55, 0.1], [0.55, -0.1]], 3: [[-0.96, 0.32], [0, -0.36], [0.96, 0.32]], 4: [[-1.36, 0.3], [-0.45, -0.32], [0.45, 0.3], [1.36, -0.32]], 5: [[-1.56, 0.36], [-0.78, -0.36], [0, 0.36], [0.78, -0.36], [1.56, 0.36]], 6: [[-0.99, -0.48], [0, -0.48], [0.99, -0.48], [-0.99, 0.5], [0, 0.5], [0.99, 0.5]] };
    var c45 = Math.cos(PI / 4), centres = ARR[n].map(function (q) { var rx = q[0] * S1, ry = q[1] * S1 * 2; return [8 + rx * c45 + ry * c45, 8 - rx * c45 + ry * c45]; });
    var fit = [];
    centres.forEach(function (c) { fit = fit.concat(circlePts(c[0], c[1], rad * 1.05, 12)); });
    var w = tWorld(root, p, { island: false, fitPoints: fit, headroom: 2.7, yaw: 45, cols: 16, rows: 16, crop: 1.0 });
    var lands = landsFor(regs, function (r) { return r.label; }, function (r) { return r.keyword; }, { lo: 0.45, gap: 0.5 });
    var tops = [];
    regs.forEach(function (r, i) {
      var c = centres[i], at = Math.max(0.05, lands[i] - 0.55), kind = KINDS.indexOf(r.kind) >= 0 ? r.kind : KINDS[i % KINDS.length];
      w.slabAdd({ shape: blob(c[0], c[1], rad, 16, i + 3), at: at, thick: 0.85, hang: 0.9, dur: 0.75, checker: true });
      var ic = islandContent(w, kind, c[0], c[1], at + 0.5);
      tops.push(ic.top);
      var an = anchorBox(w, c[0] - 0.5, c[1] - 0.5, 1, 1, Math.min(ic.top, 2.4), at + 0.5);
      w.label(an, str(r.label), { big: str(r.value), at: lands[i] + 0.2, color: w.pal.accents[i % w.pal.accents.length], size: u(PORT ? 31 : 27) });
    });
    if (p.connect !== "none" && n > 1) {
      for (var i = 0; i < n - 1; i++) w.arc([centres[i][0], centres[i][1], 0.4], [centres[i + 1][0], centres[i + 1][1], 0.4], { at: lands[i + 1] + 0.3, color: w.pal.data, height: 2.2, count: 3, speed: 2, width: 1.2 });
      var route = centres.map(function (c) { return [c[0], c[1], 3.6]; });
      if (n === 2) route = [[centres[0][0], centres[0][1], 3.6], [centres[1][0], centres[1][1], 3.9], [centres[1][0] + 1, centres[1][1] - 1.5, 3.8], [centres[0][0] + 1, centres[0][1] - 1.5, 3.7]];
      w.plane(route, { at: lands[1] + 0.4, speed: 2.4, t0: lands[1] + 0.4 });
    }
    breathe(w, { sway: 4, zoom: 0.03 });
  };

  function roomFurniture(w, kind, rx, ry, rw, rd, at, i) {
    var out = [], T = function (k) { return at + k * 0.07; }, cx = rx + rw / 2, cy = ry + rd / 2;
    function add(x, y, ww, dd, hh, draw) { var o = w.add({ type: "furniture", x: x, y: y, w: ww, d: dd, h: hh, at: T(out.length), anim: "pop", dur: 0.45, noCut: true, shadow: false }); o.draw = draw; out.push(o); return o; }
    var wood = "#B9824F", dark = "#353B57";
    switch (kind) {
      case "server": for (var k = 0; k < 3; k++) out.push(w.building("server", rx + 0.2 + k * (rw - 0.4) / 3, ry + 0.3, { w: 0.62, d: 0.62, at: T(out.length), anim: "pop", noCut: true })); break;
      case "bed": for (k = 0; k < 2; k++) (function (bx) { add(bx, ry + 0.3, 0.6, 1.0, 0.3, function () { w.box(bx, ry + 0.3, 0, 0.6, 1.0, 0.18, "#F4F6FA"); w.box(bx + 0.05, ry + 0.32, 0.18, 0.5, 0.2, 0.08, "#FFFFFF"); w.box(bx, ry + 0.62, 0.18, 0.6, 0.68, 0.05, w.pal.accents[(i + k) % 6]); }); })(rx + 0.2 + k * (rw / 2)); break;
      case "machine": add(rx + 0.3, ry + 0.3, 1.2, 0.9, 0.8, function (w2, ctx, t) { w.box(rx + 0.3, ry + 0.3, 0, 1.2, 0.9, 0.55, "#7C8AA8"); w.cyl(rx + 0.9, ry + 0.75, 0.55, 0.75, 0.25, "#F5B82E"); var a = t * 3; w.line3([[rx + 0.9 + Math.cos(a) * 0.22, ry + 0.75 + Math.sin(a) * 0.22, 0.76], [rx + 0.9 - Math.cos(a) * 0.22, ry + 0.75 - Math.sin(a) * 0.22, 0.76]], dark, w.K(0.05)); }); break;
      case "vault": add(rx + 0.3, ry + 0.25, 1.2, 0.6, 1.0, function () { w.box(rx + 0.3, ry + 0.25, 0, 1.2, 0.6, 0.95, "#6E7690", { deco: function (ctx, fi, q) { if (fi !== 2) return; var c = bil(q, 0.5, 0.5), r = Math.abs(bil(q, 0.85, 0.5)[0] - c[0]) * 0.75; ctx.beginPath(); ctx.arc(c[0], c[1], r, 0, 2 * PI); ctx.fillStyle = "#AEB5C8"; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = "#4A5068"; ctx.stroke(); } }); });
        for (k = 0; k < 3; k++) (function (gx) { add(gx, ry + rd - 0.7, 0.3, 0.18, 0.1, function () { w.box(gx, ry + rd - 0.7, 0, 0.3, 0.16, 0.1, "#F5C542"); w.box(gx + 0.05, ry + rd - 0.69, 0.1, 0.2, 0.14, 0.08, "#FFD966"); }); })(rx + 0.4 + k * 0.4); break;
      case "shelf": for (k = 0; k < 2; k++) (function (sy) { add(rx + 0.25, sy, rw - 0.5, 0.3, 0.9, function () { w.box(rx + 0.25, sy, 0, rw - 0.5, 0.3, 0.9, wood, { deco: function (ctx, fi, q) { for (var l = 0; l < 3; l++) for (var c = 0; c < 4; c++) quadUV(ctx, q, 0.06 + c * 0.24, 0.08 + l * 0.32, 0.24 + c * 0.24, 0.3 + l * 0.32, w.pal.accents[(l + c) % 6]); } }); }); })(ry + 0.3 + k * (rd / 2)); break;
      case "people": out = out.concat(w.crowd(cx, cy, 4, { at: at, wave: true })); out.forEach(function (o) { o.noCut = true; }); break;
      case "plant": for (k = 0; k < 4; k++) (function (px, py) { add(px - 0.2, py - 0.2, 0.4, 0.4, 0.6, function () { w.cyl(px, py, 0, 0.22, 0.14, "#C8734A"); w.ball(px, py, 0.42, 0.2, w.pal.tree[k % 3]); }); })(rx + 0.45 + (k % 2) * (rw - 0.9), ry + 0.45 + Math.floor(k / 2) * (rd - 0.9)); break;
      case "lab": add(rx + 0.25, ry + 0.35, rw - 0.5, 0.45, 0.6, function (w2, ctx, t) { w.box(rx + 0.25, ry + 0.35, 0, rw - 0.5, 0.45, 0.42, "#E8ECF2"); for (var q = 0; q < 3; q++) { var fx = rx + 0.5 + q * (rw - 1) / 2; w.cyl(fx, ry + 0.57, 0.42, 0.62, 0.06, "#BFE8F2"); w.glow(fx, ry + 0.57, 0.6, 0.15, w.pal.accents[q + 2], { a: 0.6 + 0.3 * Math.sin(t * 3 + q) }); } }); break;
      default:
        for (k = 0; k < 2; k++) (function (dx) {
          add(dx, ry + 0.35, 0.8, 0.5, 0.6, function () { w.box(dx, ry + 0.35, 0, 0.8, 0.45, 0.32, wood); w.box(dx + 0.2, ry + 0.4, 0.32, 0.42, 0.05, 0.26, dark, { deco: function (ctx, fi, q) { if (fi === 2) quadUV(ctx, q, 0.1, 0.12, 0.9, 0.88, "#9FD6FF"); } }); w.box(dx + 0.25, ry + 0.95, 0, 0.3, 0.3, 0.25, w.pal.accents[(i + k + 1) % 6]); });
        })(rx + 0.2 + k * (rw / 2));
        out = out.concat(w.crowd(cx, ry + rd - 0.5, 2, { at: at, idle: false }));
    }
    return out;
  }
  TPL["zoom-into"] = function (root, p) {
    var KIND = ["house", "shop", "office", "bank", "hospital", "school", "factory", "datacenter", "warehouse"];
    var bk = KIND.indexOf(p.building) >= 0 ? p.building : "office";
    var rooms = arr(p.rooms).filter(function (r) { return r && str(r.label); }).slice(0, 4);
    if (!rooms.length) rooms = [{ label: "Inside", kind: "people" }];
    var n = rooms.length, cols = PORT ? 12 : 14, rows = 12, xs = PORT ? [3, 8] : [4, 9], ys = [3, 8];
    var w = tWorld(root, p, { cols: cols, rows: rows, headroom: 2.6, yaw: 45, plate: true });
    var tx = xs[0] + 1, ty = ys[0] + 1, S4 = 4;
    var lands = landsFor(rooms, function (r) { return r.label; }, function (r) { return r.keyword; }, { lo: Math.min(2.2, D * 0.35), gap: 0.5 });
    var tDive = clamp(lands[0] - 1.45, 0.95, Math.max(1.0, D * 0.45));
    // town around the target block
    xs.forEach(function (x) { w.road([[x, 0], [x, rows - 1]]); });
    ys.forEach(function (y) { w.road([[0, y], [cols - 1, y]]); });
    var kinds = ["house", "office", "shop", "trees", "house", "tower", "cottages", "office"], li = 0;
    function spansOf(nn, cuts) { var s = [], a = 0; cuts.concat([nn]).forEach(function (c) { if (c - a > 0) s.push([a, c - 1]); a = c + 1; }); return s; }
    spansOf(cols, xs).forEach(function (sx) {
      spansOf(rows, ys).forEach(function (sy) {
        if (sx[0] === tx && sy[0] === ty) return;
        for (var x = sx[0]; x <= sx[1]; x += 2) for (var y = sy[0]; y <= sy[1]; y += 2) {
          var lw = Math.min(2, sx[1] - x + 1), ld = Math.min(2, sy[1] - y + 1), k = kinds[li++ % kinds.length];
          if (lw < 2 || ld < 2) { fillLot(w, { x: x, y: y, w: lw, d: ld }, "trees", {}); continue; }
          if (k === "house") { w.building("house", x, y); w.building("house", x + 1, y + 1, { floors: 2 }); w.tree(x + 1, y); }
          else if (k === "tower") w.building("tower", x, y, { w: 2, d: 2, floors: 7 });
          else fillLot(w, { x: x, y: y, w: 2, d: 2 }, k === "shop" ? "shop" : k, { floors: 3 });
        }
      });
    });
    // the target: floor, walls, roof (all separate objects so the dive can open it)
    w.area(tx, ty, tx + S4 - 1, ty + S4 - 1, "plaza");
    var STY = {
      house: ["#F6EBDD", "gable", "#E2574C"], shop: ["#FFE1C2", "flat", "#FF6F59"], office: ["#DCE7F5", "flat", "#9AA6BF"], bank: ["#EFE7D6", "temple", "#E5DCC6"],
      hospital: ["#F3F5F9", "cross", "#E5484D"], school: ["#F7D58A", "gable", "#E2574C"], factory: ["#D9DDE5", "saw", "#7F8DAA"], datacenter: ["#4E5878", "fans", "#3A4260"], warehouse: ["#A3B5CC", "gable", "#6F84A6"],
    }[bk];
    var wallC = w.pal.night > 0.5 ? shade(STY[0], 0.62) : STY[0], hs = bk === "house" ? 1.2 : 1.55, th = 0.14, tOpen = tDive + 0.45;
    var tgt = anchorBox(w, tx, ty, S4, S4, hs + 0.6, null);
    tgt.type = "target";
    var walls = [
      { x: tx, y: ty, w: S4, d: th, back: true }, { x: tx, y: ty, w: th, d: S4, back: true },
      { x: tx, y: ty + S4 - th, w: S4, d: th, back: false }, { x: tx + S4 - th, y: ty, w: th, d: S4, back: false },
    ];
    var winO = bk === "datacenter" ? { rows: 3, blink: 2.5, litColor: "#46F0C8", color: shade(wallC, 0.72), mx: 0.05 } : bk === "warehouse" || bk === "factory" ? { rows: 1, bottom: 0.45, top: 0.18 } : { rows: bk === "house" ? 2 : 3, mx: 0.07 };
    walls.forEach(function (wl) {
      var o = w.add({ type: "wall", x: wl.x, y: wl.y, w: wl.w, d: wl.d, h: hs, parent: tgt, noCut: true, sInset: 0 });
      o.draw = function () { w.box(wl.x, wl.y, 0, wl.w, wl.d, hs, wallC, { win: winO, top: shade(wallC, 0.85) }); };
      if (!wl.back) { o.cutAt = tOpen; o.cutDur = 0.7; }
      else o.shadow = false;
    });
    if (bk === "bank") for (var k = 0; k < 5; k++) (function (cxx) { var c = w.add({ type: "column", x: cxx - 0.1, y: ty + S4 + 0.05, w: 0.2, d: 0.2, h: hs, parent: tgt, noCut: true, round: 0.08 }); c.cutAt = tOpen; c.cutDur = 0.6; c.draw = function () { w.cyl(cxx, ty + S4 + 0.15, 0, hs, 0.09, "#F7F2E6"); }; })(tx + 0.3 + k * (S4 - 0.6) / 4);
    if (bk === "shop") { var aw = w.add({ type: "awning", x: tx, y: ty + S4, w: S4, d: 0.35, h: 0.9, parent: tgt, noCut: true, shadow: false }); aw.cutAt = tOpen; aw.cutDur = 0.6; aw.draw = function () { for (var q = 0; q < 10; q++) w.face([[tx + q * 0.4, ty + S4, 1.0], [tx + q * 0.4 + 0.4, ty + S4, 1.0], [tx + q * 0.4 + 0.4, ty + S4 + 0.35, 0.8], [tx + q * 0.4, ty + S4 + 0.35, 0.8]], [0, 0.2, 0.35], q % 2 ? "#FFFFFF" : STY[2]); }; }
    var roof = w.add({ type: "roof", x: tx, y: ty, w: S4, d: S4, h: 0.6, z: hs, parent: tgt, noCut: true, shadow: false });
    roof.draw = function (w2, ctx, t) {
      var q = prog(t, tDive + 0.1, 0.8), lz = E.inCubic(q) * 5;
      if (q >= 1) return;
      ctx.globalAlpha *= 1 - q;
      var z = hs + lz, rc = w.pal.night > 0.5 ? shade(STY[2], 0.7) : STY[2], st = STY[1];
      if (st === "gable" || st === "temple") w.gable(tx - 0.08, ty - 0.08, z, S4 + 0.16, S4 + 0.16, st === "temple" ? 0.55 : 0.9, rc, st === "temple" ? "y" : "x", { wall: wallC });
      else if (st === "saw") { for (var s = 0; s < 4; s++) w.gable(tx + s, ty, z, 1, S4, 0.4, rc, "y", { wall: wallC }); w.cyl(tx + 0.4, ty + 0.4, z, z + 1.4, 0.16, "#CDD2DC", { bands: [[z + 1.0, z + 1.12, "#E2574C"]] }); smoke(w, tx + 0.4, ty + 0.4, z + 1.45, t); }
      else {
        w.box(tx, ty, z, S4, S4, 0.14, shade(wallC, 0.9));
        if (st === "cross") { var a = 1.0, s2 = 0.34, cx = tx + 2, cy = ty + 2; w.flat([[cx - a, cy - s2], [cx + a, cy - s2], [cx + a, cy + s2], [cx - a, cy + s2]], z + 0.15, rc); w.flat([[cx - s2, cy - a], [cx + s2, cy - a], [cx + s2, cy + a], [cx - s2, cy + a]], z + 0.151, rc); }
        else if (st === "fans") { for (var f = 0; f < 3; f++) w.cyl(tx + 0.8 + f * 1.2, ty + 1.6, z + 0.14, z + 0.26, 0.35, w.pal.metal, { top: shade(w.pal.dark, 0.9) }); }
        else { w.box(tx + 0.6, ty + 0.8, z + 0.14, 0.7, 0.6, 0.3, w.pal.metal); w.box(tx + 2.2, ty + 1.8, z + 0.14, 0.6, 0.6, 0.26, w.pal.metal); if (bk === "shop") w.box(tx + 0.5, ty + S4 - 0.25, z + 0.14, 3, 0.1, 0.45, STY[2]); }
      }
    };
    // rooms
    var RL = { 1: [[0, 0, 4, 4]], 2: [[0, 0, 2, 4], [2, 0, 2, 4]], 3: [[0, 0, 2, 4], [2, 0, 2, 2], [2, 2, 2, 2]], 4: [[0, 0, 2, 2], [2, 0, 2, 2], [0, 2, 2, 2], [2, 2, 2, 2]] }[n];
    if (n >= 2) { var pw = w.add({ type: "partition", x: tx + 1.95, y: ty + th, w: 0.1, d: S4 - 2 * th, h: 0.45, at: tOpen + 0.3, anim: "rise", dur: 0.5, noCut: true, shadow: false }); pw.draw = function () { w.box(tx + 1.95, ty + th, 0, 0.1, S4 - 2 * th, 0.45, shade(wallC, 0.95)); }; }
    if (n >= 3) { var px0 = n === 3 ? tx + 2.05 : tx + th; var pz = w.add({ type: "partition", x: px0, y: ty + 1.95, w: tx + S4 - th - px0, d: 0.1, h: 0.45, at: tOpen + 0.3, anim: "rise", dur: 0.5, noCut: true, shadow: false }); pz.draw = function () { w.box(px0, ty + 1.95, 0, tx + S4 - th - px0, 0.1, 0.45, shade(wallC, 0.95)); }; }
    rooms.forEach(function (r, i) {
      var q = RL[i], rx = tx + q[0] + th, ry = ty + q[1] + th, rw = q[2] - 2 * th, rd = q[3] - 2 * th, at = Math.max(tOpen + 0.4, lands[i] - 0.25);
      var kind = ["desk", "server", "bed", "machine", "vault", "shelf", "people", "plant", "lab"].indexOf(r.kind) >= 0 ? r.kind : "desk";
      roomFurniture(w, kind, rx, ry, rw, rd, at, i);
      var an = anchorBox(w, rx + rw / 2 - 0.3, ry + rd / 2 - 0.3, 0.6, 0.6, 0.8, at);
      w.label(an, str(r.label), { at: Math.max(at + 0.15, lands[i]), color: w.pal.accents[i % w.pal.accents.length], size: u(PORT ? 31 : 27) });
    });
    w.label(tgt, str(p.label) || plainText(p.title) || bk, { at: 0.4, until: tDive + 0.15, color: w.pal.accents[1], size: u(PORT ? 32 : 28) });
    w.cutaway(tgt, tDive + 0.05, 0.8);
    var lay = { strips: [] };
    xs.forEach(function (x) { lay.strips.push([[x + 0.09, 0.2], [x + 0.09, rows - 0.2]]); });
    ys.forEach(function (y) { lay.strips.push([[0.2, y + 0.91], [cols - 0.2, y + 0.91]]); });
    xs.forEach(function (x, k2) { w.car([[x + 0.5, 0.5], [x + 0.5, rows - 0.5]], { phase: 0.2 + k2 * 0.4 }); });
    ys.forEach(function (y, k2) { w.car([[cols - 0.5, y + 0.5], [0.5, y + 0.5]], { phase: 0.5 + k2 * 0.3, kind: k2 ? "bus" : "car" }); });
    lay.strips.forEach(function (s, k2) { w.walker(s, { phase: hash(k2 + 3) }); });
    w.clouds(1);
    var foc = autoFocus(w), Z = clamp((w.vp.w * (PORT ? 0.8 : 0.6)) / (S4 * 1.414 * foc.K), 1.3, 3.2);
    w.camera.set({ x: foc.x, y: foc.y, z: foc.z });
    w.camera.to({ x: tx + 2, y: ty + 2, z: 0.25, zoom: Z }, tDive, 1.3, "inOutCubic");
    breathe(w, { sway: 3, zoom: 0 });
  };

  function kindWorld(w, kind, at) {
    var objs = [], T = function (i) { return at + i * 0.07; }, c = w.cols, r = w.rows, n0 = w.objs.length;
    function b(type, x, y, o) { var q = w.building(type, x, y, Object.assign({ at: T(objs.length) }, o || {})); objs.push(q); return q; }
    function tr(x, y, k) { objs.push(w.tree(x, y, { at: T(objs.length), kind: k })); }
    var road = w.road([[0, 3], [c - 1, 3]], { at: at, dur: 0.5 });
    var tile = function (x0, y0, x1, y1, ty) { w.area(x0, y0, x1, y1, ty, at); };
    switch (kind) {
      case "green": b("turbine", 0.2, 0.2); b("turbine", 2, 0.4); b("turbine", 4.2, 0.1); b("solar", 4, 4, { w: 2, d: 2 }); b("house", 0, 4); b("house", 1, 5); tr(2, 4, "round"); tr(0, 6, "pine"); tr(6, 1, "round"); tr(3, 6, "round");
        w.walker([[0.5, 3.92], [c - 0.5, 3.92]], { phase: 0.2 }); w.walker([[c - 0.5, 2.1], [0.5, 2.1]], { phase: 0.6 }); w.car(road, { phase: 0.3, kind: "car", color: "#1FB89E" }); break;
      case "industrial": b("factory", 0, 0); b("factory", 3, 0, { w: 2, d: 2 }); b("tank", 5.5, 0.3); b("tank", 5.5, 1.5); b("warehouse", 0, 4, { w: 3, d: 2 }); b("tank", 4, 4); b("tank", 5, 5); b("tank", 5.6, 4.1); b("tank", 4.2, 5.6);
        w.truck(road, { phase: 0.2, cargo: "#E2574C" }); w.truck(road.slice().reverse(), { phase: 0.7, cargo: "#FFB020" }); break;
      case "village": tile(0, 4, 2, 5, "crop"); tile(4, 0, 6, 1, "field"); b("cottage", 0.2, 0.2); b("cottage", 1.6, 0.6); b("cottage", 4.4, 4.4); b("barn", 4.6, 5.0, { w: 1.6, d: 1.4 }); tr(3, 0, "round"); tr(2.6, 4.6, "pine"); tr(6, 6, "round"); tr(0, 6, "bush");
        w.walker([[0.5, 3.92], [c - 0.5, 3.92]], { phase: 0.4 }); w.car(road, { phase: 0.5, kind: "van", color: "#F2E3C6" }); break;
      case "tech": b("datacenter", 0, 0); b("tower", 3, 0, { w: 2, d: 2, floors: 10, style: "glass" }); b("tower", 5.5, 0.5, { w: 1, d: 1, floors: 7, style: "glass" }); b("server", 0.3, 4.2); b("server", 1.3, 4.2); b("server", 0.3, 5.3); b("office", 4, 4, { floors: 4, color: w.pal.glass });
        w.walker([[0.5, 3.92], [c - 0.5, 3.92]], { phase: 0.1 }); w.walker([[c - 0.5, 2.1], [0.5, 2.1]], { phase: 0.5 }); w.car(road, { phase: 0.3 }); break;
      case "farm": tile(0, 0, 2, 2, "crop"); tile(4, 4, 6, 6, "crop"); tile(0, 4, 2, 6, "field"); b("barn", 4, 0); b("silo", 6, 0.2); b("silo", 6, 1.3); tr(3, 5, "round"); tr(3, 0, "pine");
        w.truck(road, { phase: 0.4, cargo: "#E8C547" }); break;
      default: b("office", 0, 0, { floors: 5 }); b("tower", 3, 0, { w: 2, d: 2, floors: 11 }); b("tower", 5.5, 0.4, { w: 1, d: 1, floors: 7, style: "glass" }); b("house", 0, 4); b("house", 1, 5, { floors: 2 }); b("shop", 0.2, 5.6); b("shop", 4, 4, { w: 2, d: 1 }); b("tower", 4.2, 5.2, { w: 1.6, d: 1.6, floors: 6, style: "glass" });
        w.walker([[0.5, 3.92], [c - 0.5, 3.92]], { phase: 0.2 }); w.walker([[c - 0.5, 2.1], [0.5, 2.1]], { phase: 0.7 }); w.car(road, { phase: 0.1 }); w.car(road.slice().reverse(), { phase: 0.6, kind: "bus" });
    }
    for (var i = n0; i < w.objs.length; i++) if (w.objs[i].at == null) { w.objs[i].at = at + 0.5; if (!w.objs[i].anim) w.objs[i].anim = "fade"; }
    return objs;
  }
  TPL["compare-worlds"] = function (root, p) {
    var KINDS = ["city", "green", "industrial", "village", "tech", "farm"];
    var L = obj(p.left), R = obj(p.right), title = str(p.title), theme = themeName(p.theme);
    var lk = KINDS.indexOf(L.kind) >= 0 ? L.kind : "industrial", rk = KINDS.indexOf(R.kind) >= 0 ? R.kind : "green";
    ensureWrap(root || V.root(), theme);
    var hd = title ? (head(root, { title: title, at: 0.1, theme: theme }), headFor(ensureWrap(root || V.root(), theme))) : null;
    var top = hd ? (hd.rect.y + hd.rect.h) / H + (PORT ? 0.012 : 0.03) : PORT ? 0.15 : 0.08, vpA, vpB;
    if (PORT) { var bot = 0.79, mid = (top + bot) / 2; vpA = { x: 0, y: top, w: 1, h: mid - top - 0.01 }; vpB = { x: 0, y: mid + 0.01, w: 1, h: bot - mid - 0.01 }; }
    else { vpA = { x: 0.06, y: top, w: 0.41, h: 0.93 - top }; vpB = { x: 0.53, y: top, w: 0.41, h: 0.93 - top }; }
    var lands = landsFor([L, R], function (s) { return s.label; }, function (s) { return s.keyword; }, { lo: 0.3, gap: 1.0 });
    var tL = str(L.keyword) ? lands[0] : 0.25, tR = Math.max(tL + 0.8, lands[1]);
    if (!str(R.keyword) && lands[1] < D * 0.35) tR = Math.max(tL + 0.8, D * 0.42);
    tR = Math.min(tR, Math.max(tL + 0.4, D - 1.6));
    var size = 7, worldsAB = [[vpA, L, lk, tL], [vpB, R, rk, tR]].map(function (cfg, i) {
      var w = world(root, { cols: size, rows: size, theme: theme, viewport: cfg[0], headroom: PORT ? 2.5 : 3.0, yaw: 45, island: i === 0, fitPoints: i === 0 ? null : rectPts(0, 0, size, size), fill: PORT ? 0.96 : 0.94, crop: PORT ? 1.08 : 1.0, thickness: 0.75 });
      if (i === 1) w.slabAdd({ x: 0, y: 0, w: size, d: size, at: Math.max(0, cfg[3] - 0.45), thick: 0.75, hang: 0.7, checker: true });
      kindWorld(w, cfg[2], Math.max(0.05, cfg[3] + (i ? 0.25 : 0)));
      var an = anchorBox(w, size / 2 - 0.5, size / 2 - 0.5, 1, 1, 3.0, cfg[3]);
      w.label(an, str(cfg[1].label), { big: str(cfg[1].stat), at: cfg[3] + 0.5, color: i ? w.pal.accents[3] : w.pal.accents[0], size: u(PORT ? 30 : 28) });
      w.clouds(1);
      breathe(w, { sway: 4, zoom: 0.03 });
      return w;
    });
    var bx = PORT ? W / 2 : W / 2, by = PORT ? (vpA.y + vpA.h + 0.01) * H : (top + (0.93 - top) / 2) * H;
    badge(root, str(p.vsText) || "VS", bx, by, tR - 0.1, worldsAB[0].pal.accent);
  };

  TPL["supply-chain"] = function (root, p) {
    var DEF = ["farm", "factory", "port", "warehouse", "shop", "home"];
    var stops = arr(p.stops).filter(function (s) { return s && str(s.label); }).slice(0, 6);
    if (!stops.length) stops = [{ label: "Farm", kind: "farm" }, { label: "Shop", kind: "shop" }];
    var n = stops.length, cols = 4 * n + 1, rows = 9;
    var w = tWorld(root, p, { cols: cols, rows: rows, headroom: 2.4, yaw: PORT ? 60 : 30 });
    var lands = landsFor(stops, function (s) { return s.label; }, function (s) { return s.keyword; }, { lo: 0.45, gap: 0.6 });
    stops.forEach(function (s, i) {
      var top = i % 2 === 0, x = 1 + 4 * i, y = top ? 1 : 6, at = Math.max(0.05, lands[i] - 0.3), kind = str(s.kind).toLowerCase() || DEF[i % DEF.length];
      if (kind === "port") {
        var wy = top ? 0 : 8;
        w.area(x - 1, wy, x + 2, wy, "water");
        w.boat([[x - 0.7, wy + 0.5], [x + 2.7, wy + 0.5]], { at: at + 0.3, kind: "ship", speed: 0.35 });
      }
      var pl = placeKind(w, kind === "home" ? "house" : kind, x, y, at);
      w.ping(x + 1, y + 1, { at: lands[i], color: w.pal.accents[i % w.pal.accents.length], radius: 1.4 });
      w.label(pl.anchor, str(s.label), { at: lands[i] + 0.15, badge: String(i + 1), color: w.pal.accents[i % w.pal.accents.length], size: u(PORT ? 30 : 27) });
      var ya = top ? 3 : 5, yb = top ? 5 : 3;
      w.road([[x + 1, top ? 3 : 5], [x + 1, top ? 3 : 5]], { at: at });
      if (i < n - 1) {
        var t0 = lands[i] + 0.25, t1 = Math.max(t0 + 0.35, lands[i + 1] - 0.2);
        var path = w.road([[x + 1, ya], [x + 3, ya], [x + 3, yb], [x + 5, yb]], { at: t0, dur: t1 - t0 });
        w.truck(path, { at: t1, mode: "pingpong", phase: 0, speed: 1.1, cargo: w.pal.accents[(i + 2) % w.pal.accents.length], t0: t1 });
      }
    });
    w.walker([[0.5, 4.5], [cols - 0.5, 4.5]], { phase: 0.3 }); w.walker([[cols - 0.5, 4.3], [0.5, 4.3]], { phase: 0.6 });
    scatter(w, { density: 0.32 });
    w.clouds(1);
    if (n > 2) followCam(w, stops.map(function (s, i) { return [2 + 4 * i - (i ? 0.8 : 0), i % 2 ? 6.2 : 2.6, 1.0]; }), lands, PORT ? 1.3 : 1.4);
    breathe(w, { sway: 4, zoom: n > 2 ? 0 : 0.04 });
  };

  TPL["iso-donut"] = function (root, p) {
    var slices = arr(p.slices).filter(function (s) { return s && isFinite(+s.value) && +s.value > 0; }).slice(0, 6);
    if (!slices.length) slices = [{ label: "A", value: 60 }, { label: "B", value: 40 }];
    var n = slices.length, total = 0, raw = !!p.valueFormat, vf = fmtOf(p.valueFormat), donut = p.donut !== false;
    slices.forEach(function (s) { total += +s.value; });
    var C = 5, Rout = 3.0, Rin = donut ? 1.45 : 0, hgt = 0.85, PR = 4.6;
    var fit = circlePts(C, C, PR, 12);
    var w = tWorld(root, p, { island: false, fitPoints: fit, headroom: 1.6, yaw: 45, cols: 10, rows: 10 });
    w.slabAdd({ shape: circlePts(C, C, PR, 48), thick: 0.9, hang: 0.8 });
    var lands = landsFor(slices, function (s) { return s.label; }, function (s) { return s.keyword; }, { lo: 0.45, gap: 0.45 });
    var big = 0;
    slices.forEach(function (s, i) { if (+s.value > +slices[big].value) big = i; });
    var tSlide = Math.min(lands[n - 1] + 0.8, Math.max(lands[n - 1] + 0.2, D - 1.6));
    var a0 = -0.75 * PI, acc = a0, sl = slices.map(function (s, i) {
      var f = +s.value / total, a = acc, b = acc + f * 2 * PI;
      acc = b;
      return { s: s, f: f, a: a, b: b, mid: (a + b) / 2, col: w.pal.accents[i % w.pal.accents.length], t: Math.max(0.05, lands[i] - 0.25) };
    });
    w.ground.push(function (w2, ctx, t) {
      var c = w.P(C, C, 0.01), K = w.cur.K;
      ctx.beginPath(); ctx.ellipse(c[0], c[1], (Rout + 0.45) * K, (Rout + 0.45) * K * 0.5, 0, 0, 2 * PI); ctx.fillStyle = w.pal.plaza; ctx.fill();
      ctx.beginPath(); ctx.ellipse(c[0], c[1], (Rout + 0.45) * K, (Rout + 0.45) * K * 0.5, 0, 0, 2 * PI); ctx.strokeStyle = w.pal.plaza2; ctx.lineWidth = u(4); ctx.stroke();
      ctx.setLineDash([u(10), u(8)]); ctx.strokeStyle = alpha(w.pal.muted, 0.45); ctx.lineWidth = u(3);
      ctx.beginPath(); ctx.ellipse(c[0], c[1], Rout * K, Rout * K * 0.5, 0, 0, 2 * PI); ctx.stroke();
      if (Rin > 0) { ctx.beginPath(); ctx.ellipse(c[0], c[1], Rin * K, Rin * K * 0.5, 0, 0, 2 * PI); ctx.stroke(); }
      ctx.setLineDash([]);
    });
    var dn = w.add({ type: "donut", x: C - Rout, y: C - Rout, w: 2 * Rout, d: 2 * Rout, h: hgt, manual: true, shadow: false, key: false });
    dn.draw = function (w2, ctx, t) {
      var c = w.cur, units = [];
      sl.forEach(function (S, i) {
        var hs = hgt * Math.max(0, E.outBack(prog(t, S.t, 0.7)));
        if (t < S.t || hs < 0.005) return;
        var off = i === big ? 0.45 * E.outBack(prog(t, tSlide, 0.6)) : 0, ox = Math.cos(S.mid) * off, oy = Math.sin(S.mid) * off;
        var m = Math.max(1, Math.ceil((S.b - S.a) / (PI / 8)));
        for (var k = 0; k < m; k++) {
          var b0 = S.a + ((S.b - S.a) * k) / m, b1 = S.a + ((S.b - S.a) * (k + 1)) / m, mid = (b0 + b1) / 2, rr = (Rout + Rin) / 2;
          var mx = C + ox + Math.cos(mid) * rr, my = C + oy + Math.sin(mid) * rr;
          units.push({ S: S, hs: hs, ox: ox, oy: oy, b0: b0, b1: b1, first: k === 0, last: k === m - 1, r: (mx - w.cx) * c.sa + (my - w.cy) * c.ca });
        }
      });
      units.sort(function (a, b) { return a.r - b.r; });
      units.forEach(function (U) {
        var steps = 4, outer = [], inner = [], z0 = 0.02, z1 = 0.02 + U.hs, col = U.S.col, i;
        for (i = 0; i <= steps; i++) { var a = U.b0 + ((U.b1 - U.b0) * i) / steps; outer.push([C + U.ox + Math.cos(a) * Rout, C + U.oy + Math.sin(a) * Rout]); inner.push([C + U.ox + Math.cos(a) * Rin, C + U.oy + Math.sin(a) * Rin]); }
        var walls = [];
        for (i = 0; i < steps; i++) {
          var am = U.b0 + ((U.b1 - U.b0) * (i + 0.5)) / steps;
          walls.push({ p: [outer[i], outer[i + 1]], n: [Math.cos(am), Math.sin(am)] });
          if (Rin > 0) walls.push({ p: [inner[i + 1], inner[i]], n: [-Math.cos(am), -Math.sin(am)] });
        }
        if (U.first) walls.push({ p: [inner[0], outer[0]], n: [Math.sin(U.b0), -Math.cos(U.b0)] });
        if (U.last) walls.push({ p: [outer[steps], inner[steps]], n: [-Math.sin(U.b1), Math.cos(U.b1)] });
        walls.forEach(function (wl) { wl.L = w.lightN(wl.n[0], wl.n[1], 0); wl.r = w.depthOf((wl.p[0][0] + wl.p[1][0]) / 2, (wl.p[0][1] + wl.p[1][1]) / 2); });
        walls.filter(function (wl) { return wl.L.vis; }).sort(function (a, b) { return a.r - b.r; }).forEach(function (wl) {
          var q = [w.P(wl.p[0][0], wl.p[0][1], z0), w.P(wl.p[1][0], wl.p[1][1], z0), w.P(wl.p[1][0], wl.p[1][1], z1), w.P(wl.p[0][0], wl.p[0][1], z1)];
          var colr = shade(col, wl.L.f);
          w.emit(0, 0, function (cx2) { fillPoly(cx2, q, colr); });
        });
        var topPts = outer.concat(inner.slice().reverse()).map(function (q) { return w.P(q[0], q[1], z1); });
        var tc = shade(col, 1.07);
        w.emit(0, 0, function (cx2) { fillPoly(cx2, topPts, tc); });
      });
    };
    if (Rin > 0 && str(p.centerLabel)) {
      var cl = plainText(p.centerLabel).slice(0, 10).toUpperCase();
      w.label([C, C, hgt + 0.35], cl, { plain: true, at: 0.3, size: u(PORT ? 40 : 36), key: true });
    }
    sl.forEach(function (S, i) {
      var pct = S.f * 100, rr = Rout + 0.1, mid = S.mid, side = (Math.cos(mid) - Math.sin(mid)) * 0.707 >= 0 ? "right" : "left";
      var anchor = function (t) { var off = i === big ? 0.45 * E.outBack(prog(t, tSlide, 0.6)) : 0; return [C + Math.cos(mid) * (rr + off), C + Math.sin(mid) * (rr + off), hgt * 0.7]; };
      var val = raw ? { from: 0, to: +S.s.value, prefix: vf.prefix, suffix: vf.suffix, decimals: vf.decimals, dur: 0.9 } : { from: 0, to: pct, suffix: "%", decimals: pct < 10 && pct % 1 ? 1 : 0, dur: 0.9 };
      w.label(anchor, str(S.s.label), { at: lands[i] + 0.15, value: val, color: S.col, side: side, size: u(PORT ? 30 : 27), lift: u(20) });
    });
    var ring = circlePts(C, C, Rout + 0.75, 24);
    w.walker(ring, { closed: true, speed: 0.3, phase: 0.1 }); w.walker(ring.slice().reverse(), { closed: true, speed: 0.28, phase: 0.55 }); w.walker(ring, { closed: true, speed: 0.33, phase: 0.8 });
    [-0.75, -0.45, -1.05, 0.25, -1.9, -2.3].forEach(function (a, k) { var ang = a * PI; var x = C + Math.cos(ang) * (PR - 0.45), y = C + Math.sin(ang) * (PR - 0.45); if (k % 3 === 2) w.building("lamp", x - 0.5, y - 0.5); else w.tree(x - 0.5, y - 0.5, { kind: k % 2 ? "pine" : "round" }); });
    breathe(w, { sway: 5, zoom: 0.03 });
  };

  TPL["town-signs"] = function (root, p) {
    var signs = arr(p.signs).filter(function (s) { return s && str(s.text); }).slice(0, 5);
    if (!signs.length) signs = [{ text: "Hello" }];
    var n = signs.length, cols = PORT ? 12 : 14, rows = 12;
    var w = tWorld(root, p, { cols: cols, rows: rows, headroom: 3.6, yaw: 45 });
    var lands = landsFor(signs, function (s) { return s.text; }, function (s) { return s.keyword; }, { lo: 0.5, gap: 0.6 });
    var lay = townLayout(cols, rows), KS = ["house", "office", "shop", "tower", "trees", "school", "house", "office", "park", "tower", "shop", "hospital", "house", "bank"], cands = [];
    lay.lots.forEach(function (l, i) {
      if (l.edge) { fillLot(w, l, "trees", {}); return; }
      var k = KS[(i * 5 + 3) % KS.length], objs;
      if (k === "house") { objs = [w.building("house", l.x, l.y, { floors: 2 }), w.building("house", l.x + 1, l.y + 1), w.tree(l.x + 1, l.y)]; }
      else if (k === "tower") objs = [w.building("tower", l.x, l.y, { w: 2, d: 2, floors: 8 + (i % 4), style: i % 2 ? "glass" : null })];
      else if (k === "shop") objs = [w.building("shop", l.x, l.y, { w: 2, d: 1 }), w.building("shop", l.x, l.y + 1), w.building("house", l.x + 1, l.y + 1)];
      else objs = fillLot(w, l, k, { floors: 4 });
      var best = null;
      objs.forEach(function (o) { if (o && o.type !== "tree" && (!best || o.h > best.h)) best = o; });
      if (best) cands.push(best);
    });
    townLife(w, lay, { cars: 5, walkers: 7 });
    // pick n buildings spread across the screen, ordered left to right (reading order)
    var c45 = Math.cos(PI / 4);
    cands.forEach(function (o) { var dx = o.x + o.w / 2 - cols / 2, dy = o.y + o.d / 2 - rows / 2; o._sx = (dx - dy) * c45; o._sy = (dx + dy) * c45; });
    var pickd = [];
    for (var i = 0; i < n; i++) {
      var half = (cols + rows) * 0.354, tgtX = n === 1 ? 0 : lerp(-half, half, i / (n - 1)) * (PORT ? 0.5 : 0.62), tgtY = (i % 2 ? 1 : -1) * (PORT ? 2.6 : 2.2), best = null, bs = 1e9;
      cands.forEach(function (o) { if (pickd.indexOf(o) >= 0) return; var sc = Math.hypot(o._sx - tgtX, (o._sy - tgtY) * 0.8) - o.h * 0.2; if (sc < bs) { bs = sc; best = o; } });
      if (best) pickd.push(best);
    }
    pickd.sort(function (a, b) { return a._sx - b._sx; });
    signs.forEach(function (s, k) {
      var o = pickd[k] || pickd[pickd.length - 1];
      if (!o) return;
      w.ping(o.x + o.w / 2, o.y + o.d / 2, { at: lands[k], color: w.pal.accents[k % w.pal.accents.length], radius: 1.3 });
      w.label(o, str(s.text), { at: lands[k], color: w.pal.accents[k % w.pal.accents.length], size: u(PORT ? 40 : 36), maxW: u(PORT ? 520 : 520) });
    });
    w.clouds(2);
    w.plane([[-3, rows * 0.3, 4.6], [cols + 3, rows * 0.1, 4.8]], { closed: false, speed: 1.6, phase: 0.1 });
    breathe(w, { sway: 7, zoom: 0.05 });
  };

  // ------------------------- public API -------------------------
  function render(id, root, props) {
    var fn = TPL[id];
    if (!fn) throw new Error("Unknown isometric template: " + id);
    fn(root || V.root(), obj(props));
  }
  function fallback(root, narration) {
    root = root || V.root();
    while (root.firstChild) root.removeChild(root.firstChild);
    worlds.length = 0; heads.length = 0; domBoxes.length = 0; hooked = false;
    var w = world(root, { cols: 7, rows: 7, viewport: layout(true, "bottom"), headroom: 3.2 });
    kindWorld(w, "city", 0.15);
    w.clouds(1);
    breathe(w, { sway: 5, zoom: 0.04 });
    var words = contentWords(narration || V.narration).slice(0, 4).join(" ");
    if (words) caption(root, words, 0.4);
  }
  var api = {
    world: world, layout: layout, head: head, caption: caption, badge: badge, breathe: breathe, appear: appear, leave: leave, blob: blob, hash: hash, shade: shade, mix: mix,
    buildingTypes: buildingTypes, blockTextWidth: blockTextWidth, fillLot: fillLot, townLayout: townLayout, townLife: townLife, smoke: smoke, safe: safeRect,
    scatter: scatter, follow: function (w, spots, lands, zoom) { followCam(w, arr(spots), arr(lands), num(zoom, 1.4)); return w; },
    themes: Object.keys(THEMES), syncTimes: syncTimes, landsFor: function (list, labelOf, kwOf, o) { return landsFor(arr(list), labelOf || function (x) { return x && x.label; }, kwOf || function (x) { return x && x.keyword; }, o); },
    templates: {},
  };
  Object.keys(TPL).forEach(function (id) { api.templates[id] = function (root, props) { TPL[id](root || V.root(), obj(props)); }; });
  S.iso = api;
  S.u = u;
  S.safe = safeRect;
  S.templates = Object.keys(TPL);
  S.render = render;
  S.fallback = fallback;
  S.flush = function () { worlds.forEach(function (w) { if (!w.ready) setupWorld(w); drawWorld(w, V.time()); }); };
  // Screen boxes of labels, headlines, badges and key objects visible at time t (for core/test-style.mjs).
  S.inspect = function (t) {
    var out = [];
    worlds.forEach(function (w) {
      if (w.lastT !== t) drawWorld(w, t);
      var mv = camMoving(w, t);
      w.lastLabels.forEach(function (r) { out.push({ kind: r.kind, label: r.label, x: r.x, y: r.y, w: r.w, h: r.h, moving: mv }); });
      w.lastKeys.forEach(function (r) { out.push({ kind: r.kind, label: r.label, x: r.x, y: r.y, w: r.w, h: r.h, moving: mv }); });
    });
    heads.forEach(function (hd) { var o = +getComputedStyle(hd.el).opacity; if (o > 0.5) out.push({ kind: "head", label: hd.el.textContent.slice(0, 40), x: hd.rect.x, y: hd.rect.y, w: hd.rect.w, h: hd.rect.h }); });
    domBoxes.forEach(function (b) { var o = +getComputedStyle(b.el).opacity; if (o > 0.5) out.push({ kind: b.kind, label: b.label, x: b.rect.x, y: b.rect.y, w: b.rect.w, h: b.rect.h }); });
    return out;
  };
})();

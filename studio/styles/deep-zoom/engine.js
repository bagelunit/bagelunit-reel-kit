/* Deep Zoom engine (style id: deep-zoom).
 *
 * A cinematic macro-photography / product-render look for science explainers: glossy and translucent
 * objects (ice, glass, water, metal) lit in a near-black studio, slow weighty camera moves and seamless
 * dives between scales (object, crystal, molecule, atom, nucleus, quarks).
 *
 * Architecture
 *  - Build time. S.render (templates) or custom code call S.scene(root), which makes ONE full-frame
 *    <canvas>. Scenes register views (a camera + a viewport + a tree of nodes) and overlays (labels with
 *    leader lines, headlines, numbers). Meshes are built once in local units. Sprites (shaded spheres per
 *    material, colour, size tier and blur level; glow, bokeh, bubbles, grain tiles, vignette, background)
 *    are rendered once into offscreen canvases, lazily on first use, with no randomness outside
 *    V.makeRand, so every load gives the same pixels.
 *  - One V.onFrame(t) handler (frame) repaints everything from t: background, far bokeh, every view
 *    (nodes emit draw items with a view-space depth: mesh faces, sprite impostors, bonds, lines; the list
 *    is sorted far to near and painted), dive flashes, near bokeh, vignette, film grain, then the 2D
 *    overlay. Nothing is kept between frames, so a seek in any direction gives identical frames.
 *  - Our own tiny 3D renderer: perspective camera (orbit parameters, keyframed on time), Lambert plus
 *    Blinn specular plus cool rim light, fresnel for translucent materials, a fake studio environment for
 *    metal, painter's sort, sphere and drop impostors with per-pixel shading and baked bloom, depth of
 *    field by pre-blurred sprite levels. Canvas 2D only, no WebGL, no libraries.
 *  - Timing: template lands come from keyword props, spoken labels (V.find), else an even spread (the
 *    pilot's kwFind / labelTime / spread). Something is visible by 0.3 s; everything settles about
 *    1 s before the end. Motion uses smooth eases only (no overshoot, no bounce).
 *  Layout, timing and drawing live in separate functions; templates measure text first, then place.
 */
(function () {
  "use strict";
  var V = window.V;
  if (!V) return;
  var S = (window.SceneStyle = window.SceneStyle || {});
  var doc = document;
  var W = V.width, H = V.height, D = V.duration;
  var PI = Math.PI, TAU = PI * 2, DEG = PI / 180;
  var LAND = V.isLandscape, PORT = V.isPortrait;
  var MIN = Math.min(W, H);

  // ------------------------- small utils -------------------------
  function u(px) { return V.s(px); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, p) { return a + (b - a) * p; }
  function num(v, d) { var n = typeof v === "number" ? v : parseFloat(v); return isFinite(n) ? n : d; }
  function str(v) { return typeof v === "string" ? v.trim() : v == null ? "" : String(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return v && typeof v === "object" && !Array.isArray(v) ? v : {}; }
  function sstep(a, b, x) { var p = b === a ? (x >= b ? 1 : 0) : clamp((x - a) / (b - a), 0, 1); return p * p * (3 - 2 * p); }
  function fract(x) { return x - Math.floor(x); }
  var EASE = {
    linear: function (x) { return x; },
    out: function (x) { return 1 - Math.pow(1 - x, 3); },
    "in": function (x) { return x * x * x; },
    inOut: function (x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; },
    sine: function (x) { return -(Math.cos(PI * x) - 1) / 2; },
    outSine: function (x) { return Math.sin((x * PI) / 2); },
    quart: function (x) { return x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2; },
    outQuart: function (x) { return 1 - Math.pow(1 - x, 4); },
    expo: function (x) { return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x); },
    inOutExpo: function (x) { return x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2; },
  };
  EASE.inOutCubic = EASE.inOut; EASE.outCubic = EASE.out; EASE.inOutSine = EASE.sine; EASE.inCubic = EASE["in"];
  function ease(e) { return typeof e === "function" ? e : EASE[e] || EASE.inOut; }
  function prog(t, a, d, e) { if (!(d > 0)) return t >= a ? 1 : 0; return ease(e)(clamp((t - a) / d, 0, 1)); }
  function normWord(s) {
    return String(s == null ? "" : s).toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, "");
  }

  // ------------------------- colour -------------------------
  function hex(h) {
    var s = String(h).replace("#", "");
    if (/^[0-9a-f]{3}$/i.test(s)) s = s.replace(/./g, function (c) { return c + c; });
    if (!/^[0-9a-f]{6}$/i.test(s)) return [0.9, 0.93, 0.96];
    var n = parseInt(s, 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  function c255(v) { return Math.round(clamp(v, 0, 1) * 255); }
  function rgba(c, a) { return "rgba(" + c255(c[0]) + "," + c255(c[1]) + "," + c255(c[2]) + "," + (a == null ? 1 : +clamp(a, 0, 1).toFixed(4)) + ")"; }
  function mixc(a, b, p) { return [lerp(a[0], b[0], p), lerp(a[1], b[1], p), lerp(a[2], b[2], p)]; }
  var PAL = {
    bg: "#06080E", ice: "#7FD8FF", coral: "#FF7A59", gold: "#FFC857", text: "#EAF2F8", muted: "#8DA2B8",
    pearl: "#E6ECF2", steel: "#9AA7B4", slate: "#4E5D70", graphite: "#3B4148", white: "#FFFFFF",
  };
  var C_ICE = hex(PAL.ice), C_CORAL = hex(PAL.coral), C_GOLD = hex(PAL.gold), C_TEXT = hex(PAL.text), C_MUTED = hex(PAL.muted);
  var C_WHITE = [1, 1, 1], C_LINE = [0.78, 0.9, 1], C_SUB = hex("#B4C3D2");
  function colorOf(c, def) {
    if (Array.isArray(c) && c.length >= 3) return c;
    c = str(c).toLowerCase();
    if (PAL[c]) return hex(PAL[c]);
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)) return hex(c);
    return def || C_TEXT;
  }

  // ------------------------- vector and matrix math -------------------------
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function vlen(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); }
  function nrm(a) { var l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function vlerp(a, b, p) { return [lerp(a[0], b[0], p), lerp(a[1], b[1], p), lerp(a[2], b[2], p)]; }
  function vec(v, d) {
    if (Array.isArray(v) && v.length >= 3) return [num(v[0], 0), num(v[1], 0), num(v[2], 0)];
    return d ? d.slice() : [0, 0, 0];
  }
  var I3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  function mm(A, B) {
    var o = new Array(9);
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) o[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
    return o;
  }
  function mv(M, v) { return [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]]; }
  function msc(M, s) { return [M[0] * s[0], M[1] * s[1], M[2] * s[2], M[3] * s[0], M[4] * s[1], M[5] * s[2], M[6] * s[0], M[7] * s[1], M[8] * s[2]]; }
  // Rotation in degrees, R = Ry * Rx * Rz (turntable yaw outermost).
  function rot(rx, ry, rz) {
    var a = rx * DEG, b = ry * DEG, c = rz * DEG;
    var ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(b), sb = Math.sin(b), cc = Math.cos(c), sc = Math.sin(c);
    var Rx = [1, 0, 0, 0, ca, -sa, 0, sa, ca], Ry = [cb, 0, sb, 0, 1, 0, -sb, 0, cb], Rz = [cc, -sc, 0, sc, cc, 0, 0, 0, 1];
    return mm(Ry, mm(Rx, Rz));
  }
  // Rodrigues: rotate v around unit axis k by ang radians.
  function axisRot(v, k, ang) {
    var c = Math.cos(ang), s = Math.sin(ang), kv = cross(k, v), kd = dot(k, v) * (1 - c);
    return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
  }

  // ------------------------- lights and materials -------------------------
  // View space: X right, Y up, Z into the screen. Lights travel with the camera (studio rig).
  var LK = nrm([-0.5, 0.62, -0.6]);   // key: upper left, in front
  var LR = nrm([0.72, 0.4, 0.56]);    // rim: upper right, behind
  var LK2 = nrm([LK[0], LK[1], 0]);
  var SB2 = nrm([0.86, 0.12, -0.5]);  // strip light on the right (metal reflections)
  var SB3 = nrm([-0.88, 0.05, -0.46]); // tall strip light on the left
  var KEYC = [1.0, 0.97, 0.93], RIMC = [0.62, 0.84, 1.0], FILLC = [0.42, 0.55, 0.75];
  var VZ = [0, 0, -1];
  var MATS = {
    ice: { col: "#8CD0F2", back: "#0F3854", a: 0.24, ab: 0.58, kd: 0.42, amb: 0.2, ks: 0.95, sh: 34, rim: 1.0, edge: 0.75, sheen: 0.26, tr: 1, core: 0.55, caustic: 0.55 },
    glass: { col: "#C4E2EE", back: "#0A2230", a: 0.08, ab: 0.34, kd: 0.16, amb: 0.1, ks: 1.25, sh: 90, rim: 1.15, edge: 0.95, sheen: 0.36, tr: 1, core: 0.06, caustic: 0.85 },
    water: { col: "#78BFE6", back: "#0A2A40", a: 0.18, ab: 0.4, kd: 0.24, amb: 0.12, ks: 1.15, sh: 70, rim: 1.05, edge: 0.55, sheen: 0.34, tr: 1, core: 0.12, caustic: 0.95 },
    metal: { col: "#C8D1DB", kd: 0.3, amb: 0.16, ks: 1.0, sh: 46, rim: 0.5, sheen: 0.32, env: 1 },
    matte: { col: "#7A8594", kd: 0.82, amb: 0.15, ks: 0.06, sh: 8, rim: 0.32, sheen: 0.08 },
    rubber: { col: "#2B2F35", kd: 0.72, amb: 0.17, ks: 0.22, sh: 14, rim: 0.38, sheen: 0.1 },
    gloss: { col: "#D2553E", kd: 0.78, amb: 0.14, ks: 0.75, sh: 60, rim: 0.5, sheen: 0.18 },
    light: { col: "#7FD8FF", kd: 0.35, amb: 0.75, ks: 0.6, sh: 30, rim: 0.5, sheen: 0.15 },
  };
  var MATCACHE = {};
  function mat(name, color) {
    name = MATS[name] ? name : "ice";
    var key = name + "|" + (color ? str(Array.isArray(color) ? color.join(",") : color) : "");
    if (MATCACHE[key]) return MATCACHE[key];
    var b = MATS[name], m = {};
    for (var k in b) m[k] = b[k];
    m.name = name; m.key = key;
    m.col = color ? colorOf(color, hex(b.col)) : hex(b.col);
    m.back = b.back ? hex(b.back) : m.col;
    return (MATCACHE[key] = m);
  }
  function matKey(v, def) { v = str(v).toLowerCase(); return MATS[v] && v !== "light" && v !== "gloss" ? v : def; }
  // Studio environment seen by metal: a sky dome, a large key softbox and a strip light.
  function envAt(x, y, z) {
    var l = Math.sqrt(x * x + y * y + z * z) || 1; x /= l; y /= l; z /= l;
    var e = 0.035 + (y > 0 ? 0.22 * y : 0.02 * (1 + y));
    e += 1.15 * sstep(0.8, 0.95, x * LK[0] + y * LK[1] + z * LK[2]);
    e += 0.55 * sstep(0.86, 0.97, x * SB2[0] + y * SB2[1] + z * SB2[2]);
    e += 0.7 * sstep(0.8, 0.96, x * SB3[0] + z * SB3[2]) * sstep(0.7, 0.2, Math.abs(y));
    e += 0.16 * sstep(0, -1, z);
    e += 0.12 * sstep(0.2, 0.0, Math.abs(y)) * (z > 0 ? 1 : 0.4);
    return e;
  }
  var SH = [0, 0, 0, 0, 0];
  // Shade a surface point. n: unit normal (view), v: unit vector to the camera. Out: r, g, b (may exceed 1), alpha, spec.
  function shadeN(m, n, v, out) {
    var nv = n[0] * v[0] + n[1] * v[1] + n[2] * v[2], facing = nv < 0 ? 0 : nv;
    var nl = n[0] * LK[0] + n[1] * LK[1] + n[2] * LK[2];
    var diff = m.tr ? (nl + 0.6) / 1.6 : nl;
    if (diff < 0) diff = 0;
    var fres = Math.pow(1 - facing, 3);
    var hx = LK[0] + v[0], hy = LK[1] + v[1], hz = LK[2] + v[2], hl = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
    var nh = (n[0] * hx + n[1] * hy + n[2] * hz) / hl;
    var spec = nh > 0 ? Math.pow(nh, m.sh) * m.ks : 0;
    var rl = n[0] * LR[0] + n[1] * LR[1] + n[2] * LR[2];
    var rim = Math.pow(1 - facing, 2.2) * Math.max(0, rl + 0.35) * m.rim;
    var fillv = 0.5 + 0.5 * n[1], c = m.col, R, G, B;
    if (m.env) {
      var e = envAt(2 * nv * n[0] - v[0], 2 * nv * n[1] - v[1], 2 * nv * n[2] - v[2]);
      var k = m.amb + e * 0.95 + diff * m.kd;
      R = c[0] * k; G = c[1] * k; B = c[2] * k;
    } else {
      var kk = m.amb + m.kd * diff;
      R = c[0] * (kk * KEYC[0] + 0.14 * fillv * FILLC[0]);
      G = c[1] * (kk * KEYC[1] + 0.14 * fillv * FILLC[1]);
      B = c[2] * (kk * KEYC[2] + 0.14 * fillv * FILLC[2]);
    }
    R += rim * RIMC[0] + spec; G += rim * RIMC[1] + spec; B += rim * RIMC[2] + spec;
    out[0] = R; out[1] = G; out[2] = B;
    out[3] = m.tr ? clamp(m.a + (1 - m.a) * fres * 0.75 + spec * 0.6 + rim * 0.2, 0, 1) : 1;
    out[4] = spec;
    return out;
  }

  // ------------------------- offscreen canvases and sprites -------------------------
  function canvas(w, h) { var c = doc.createElement("canvas"); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  // Separable box blur on a premultiplied RGBA float buffer (3 passes approximate a gaussian). Zero outside.
  function blurPass(src, dst, w, h, r, horiz) {
    var n = horiz ? w : h, lines = horiz ? h : w, div = 2 * r + 1, stride = horiz ? 4 : w * 4;
    for (var L = 0; L < lines; L++) {
      var o0 = horiz ? L * w * 4 : L * 4;
      for (var ch = 0; ch < 4; ch++) {
        var o = o0 + ch, acc = 0, i;
        for (i = 0; i <= r && i < n; i++) acc += src[o + i * stride];
        for (i = 0; i < n; i++) {
          dst[o + i * stride] = acc / div;
          var ia = i + r + 1, ib = i - r;
          if (ia < n) acc += src[o + ia * stride];
          if (ib >= 0) acc -= src[o + ib * stride];
        }
      }
    }
  }
  function blurBuf(buf, w, h, radius) {
    var r = Math.max(1, Math.round(radius / 1.7)), tmp = new Float32Array(buf.length);
    for (var k = 0; k < 3; k++) { blurPass(buf, tmp, w, h, r, true); blurPass(tmp, buf, w, h, r, false); }
  }
  function bufCanvas(buf, w, h) {
    var c = canvas(w, h), g = c.getContext("2d"), img = g.createImageData(w, h), d = img.data;
    for (var i = 0; i < w * h * 4; i += 4) {
      var A = Math.max(buf[i + 3], buf[i], buf[i + 1], buf[i + 2]);
      if (A <= 0.0008) continue;
      if (A > 1) A = 1;
      d[i] = c255(buf[i] / A); d[i + 1] = c255(buf[i + 1] / A); d[i + 2] = c255(buf[i + 2] / A); d[i + 3] = Math.round(A * 255);
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  // Silhouette profiles for lathe impostors: radius at height y in [-1, 1] (y = -1 is the top).
  function PROF_SPHERE(y) { return Math.sqrt(Math.max(0, 1 - y * y)); }
  function PROF_DROP(y) {
    var s = Math.acos(clamp(-y, -1, 1));
    return 0.62 * Math.sin(s) * Math.pow(Math.sin(s / 2), 1.6) * 1.18;
  }
  var SPR = {};
  var PAD = 0.36;
  // Per-pixel shaded impostor: d = diameter in px (height for a drop). Bakes bloom; blurFrac blurs (depth of field).
  function latheSprite(m, d, prof, blurFrac, asp) {
    var Wd = Math.ceil(d * (asp + 2 * PAD)), Hd = Math.ceil(d * (1 + 2 * PAD));
    var buf = new Float32Array(Wd * Hd * 4), bloom = null;
    var cx = Wd / 2, cy = Hd / 2, R = d / 2, out = [0, 0, 0, 0, 0], n = [0, 0, 0];
    for (var py = 0; py < Hd; py++) {
      var y = (py + 0.5 - cy) / R;
      if (y <= -1 - 2 / R || y >= 1 + 2 / R) continue;
      var yc = clamp(y, -0.9995, 0.9995), rad = prof(yc);
      var dr = (prof(Math.min(0.9995, yc + 0.004)) - prof(Math.max(-0.9995, yc - 0.004))) / 0.008;
      for (var px = 0; px < Wd; px++) {
        var x = (px + 0.5 - cx) / R;
        var e = (rad - Math.abs(x)) / Math.sqrt(1 + dr * dr);
        var cov;
        if (e * R > 1.6 && Math.abs(y) < 1 - 2 / R) cov = 1;
        else if (e * R < -1.6 && Math.abs(y) < 1) continue;
        else {
          var hits = 0;
          for (var sy = 0; sy < 4; sy++) for (var sx = 0; sx < 4; sx++) {
            var ys = (py + (sy + 0.5) / 4 - cy) / R, xs = (px + (sx + 0.5) / 4 - cx) / R;
            if (ys > -1 && ys < 1 && Math.abs(xs) < prof(ys)) hits++;
          }
          if (!hits) continue;
          cov = hits / 16;
        }
        var rr = Math.max(rad, 1e-4), xx = clamp(x / rr, -0.999, 0.999), zz = Math.sqrt(1 - xx * xx) * rr;
        n[0] = xx * rr; n[1] = rr * dr; n[2] = -zz;
        var nl = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]) || 1;
        n[0] /= nl; n[1] /= nl; n[2] /= nl;
        shadeN(m, n, VZ, out);
        var r0 = out[0], g0 = out[1], b0 = out[2], a0 = out[3];
        if (m.tr) {
          var edg = 1 - Math.abs(n[2]);
          var away = -(n[0] * LK2[0] + n[1] * LK2[1]);
          var caus = m.caustic * sstep(0.3, 0.78, edg) * (1 - sstep(0.86, 1.0, edg)) * Math.pow(Math.max(0, away), 2);
          var core = m.core * Math.pow(1 - edg, 1.6) * 0.45;
          r0 += caus * 0.85 + core * 0.75; g0 += caus * 0.95 + core * 0.88; b0 += caus + core;
          a0 = clamp(a0 + caus * 0.6 + core * 0.55, 0, 1);
        }
        var i4 = (py * Wd + px) * 4, a = a0 * cov;
        buf[i4] = r0 * a; buf[i4 + 1] = g0 * a; buf[i4 + 2] = b0 * a; buf[i4 + 3] = a;
        var lum = Math.max(r0, g0, b0);
        if (lum > 0.92) {
          if (!bloom) bloom = new Float32Array(buf.length);
          var k = Math.min(1.5, lum - 0.92) * a;
          bloom[i4] = r0 * k; bloom[i4 + 1] = g0 * k; bloom[i4 + 2] = b0 * k; bloom[i4 + 3] = k;
        }
      }
    }
    if (bloom) {
      blurBuf(bloom, Wd, Hd, Math.max(2, d * 0.05));
      for (var i = 0; i < buf.length; i++) buf[i] += bloom[i] * 0.9;
    }
    if (blurFrac > 0) blurBuf(buf, Wd, Hd, d * blurFrac);
    return { c: bufCanvas(buf, Wd, Hd), pw: Wd / d, ph: Hd / d };
  }
  var TIERS = [20, 40, 72, 128, 224, 384, 640];
  var BLURS = [0, 0.07, 0.15, 0.27, 0.42];
  function tierFor(px) { for (var i = 0; i < TIERS.length; i++) if (TIERS[i] >= px * 0.9) return TIERS[i]; return TIERS[TIERS.length - 1]; }
  function spriteOf(kind, m, px, bl) {
    var tier = tierFor(px);
    if (bl > 0) tier = Math.min(tier, 72);
    var key = kind + "|" + m.key + "|" + tier + "|" + bl, s = SPR[key];
    if (s) return s;
    return (SPR[key] = latheSprite(m, tier, kind === "drop" ? PROF_DROP : PROF_SPHERE, BLURS[bl] || 0, kind === "drop" ? 0.8 : 1));
  }
  // Soft radial sprites (glow, bokeh disc, bubble, shadow), 128 px, tinted.
  function radial(key, size, stops) {
    if (SPR[key]) return SPR[key];
    var c = canvas(size, size), g = c.getContext("2d"), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach(function (s) { gr.addColorStop(s[0], s[1]); });
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    return (SPR[key] = c);
  }
  function glowSpr(c) {
    c = c || C_WHITE;
    return radial("glow" + c.join(","), 128, [[0, rgba(c, 1)], [0.12, rgba(c, 0.62)], [0.32, rgba(c, 0.2)], [0.6, rgba(c, 0.05)], [1, rgba(c, 0)]]);
  }
  function bokehSpr(c) {
    c = c || C_WHITE;
    return radial("bokeh" + c.join(","), 64, [[0, rgba(c, 0.42)], [0.7, rgba(c, 0.5)], [0.86, rgba(c, 0.66)], [0.95, rgba(c, 0.25)], [1, rgba(c, 0)]]);
  }
  function bubbleSpr() {
    return radial("bubble", 32, [[0, "rgba(220,240,255,0.06)"], [0.55, "rgba(220,240,255,0.12)"], [0.78, "rgba(235,248,255,0.85)"], [0.9, "rgba(235,248,255,0.35)"], [1, "rgba(235,248,255,0)"]]);
  }
  function shadowSpr() {
    return radial("shadow", 128, [[0, "rgba(0,0,0,0.78)"], [0.35, "rgba(0,0,0,0.5)"], [0.7, "rgba(0,0,0,0.16)"], [1, "rgba(0,0,0,0)"]]);
  }
  function floorSpr() {
    return radial("floor", 256, [[0, "rgba(120,165,210,0.34)"], [0.3, "rgba(90,130,180,0.18)"], [0.65, "rgba(60,90,130,0.05)"], [1, "rgba(40,60,90,0)"]]);
  }
  // Electron cloud: a stippled probability density (dots densest near the nucleus) over a soft glow.
  function cloudSpr() {
    if (SPR.cloud) return SPR.cloud;
    var n = 420, c = canvas(n, n), g = c.getContext("2d"), rnd = V.makeRand(911), h = n / 2;
    var gr = g.createRadialGradient(h, h, 0, h, h, h);
    gr.addColorStop(0, "rgba(127,216,255,0.34)"); gr.addColorStop(0.25, "rgba(127,216,255,0.16)"); gr.addColorStop(0.6, "rgba(90,160,220,0.05)"); gr.addColorStop(1, "rgba(60,110,170,0)");
    g.fillStyle = gr; g.fillRect(0, 0, n, n);
    for (var i = 0; i < 5200; i++) {
      var shell = rnd() < 0.42, r = shell ? -Math.log(1 - rnd() * 0.98) * 0.11 : 0.32 + Math.abs(Math.log(1 - rnd() * 0.97)) * 0.16;
      if (r > 0.98) continue;
      var th = rnd() * TAU, ph = Math.acos(2 * rnd() - 1), x = Math.sin(ph) * Math.cos(th) * r, y = Math.sin(ph) * Math.sin(th) * r;
      g.fillStyle = "rgba(200,236,255," + (0.18 + 0.4 * rnd()).toFixed(3) + ")";
      var s = 0.8 + rnd() * 1.1;
      g.fillRect(h + x * h - s / 2, h + y * h - s / 2, s, s);
    }
    return (SPR.cloud = c);
  }
  function bgCanvas() {
    if (SPR.bg) return SPR.bg;
    var c = canvas(W, H), g = c.getContext("2d");
    g.fillStyle = PAL.bg; g.fillRect(0, 0, W, H);
    var cx = W / 2, cy = H * 0.44, R = Math.max(W, H) * 0.78;
    var gr = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    gr.addColorStop(0, "#101A28"); gr.addColorStop(0.35, "#0A111C"); gr.addColorStop(0.72, "#060910"); gr.addColorStop(1, "#030407");
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    return (SPR.bg = c);
  }
  function vignetteCanvas() {
    if (SPR.vig) return SPR.vig;
    var c = canvas(W, H), g = c.getContext("2d"), cx = W / 2, cy = H / 2, R = Math.sqrt(W * W + H * H) / 2;
    var gr = g.createRadialGradient(cx, cy, R * 0.42, cx, cy, R);
    gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(0.55, "rgba(0,0,0,0.26)"); gr.addColorStop(1, "rgba(0,0,0,0.7)");
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    return (SPR.vig = c);
  }
  // Film grain: four seeded noise tiles, one per frame step, laid over the frame at low alpha.
  function grainTiles() {
    if (SPR.grain) return SPR.grain;
    var out = [], rnd = V.makeRand(4242);
    for (var k = 0; k < 4; k++) {
      var n = 192, c = canvas(n, n), g = c.getContext("2d"), img = g.createImageData(n, n), d = img.data;
      for (var i = 0; i < n * n * 4; i += 4) {
        var v = rnd();
        if (v < 0.5) { d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = Math.round((0.5 - v) * 2 * 34); }
        else { d[i] = 214; d[i + 1] = 228; d[i + 2] = 240; d[i + 3] = Math.round((v - 0.5) * 2 * 22); }
      }
      g.putImageData(img, 0, 0);
      out.push(c);
    }
    return (SPR.grain = out);
  }

  // ------------------------- meshes (local units, about 1 = object radius) -------------------------
  function Mesh() { this.v = []; this.f = []; this.r = 1; this.lo = -1; }
  function addFace(m, idx, n, e, two) { m.f.push({ i: idx, n: n || null, e: e || 0, two: !!two }); }
  function newell(vs, idx) {
    var n = [0, 0, 0];
    for (var i = 0; i < idx.length; i++) {
      var a = vs[idx[i]], b = vs[idx[(i + 1) % idx.length]];
      n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    return n;
  }
  function centroidOf(vs, idx) { var c = [0, 0, 0]; idx.forEach(function (i) { c[0] += vs[i][0]; c[1] += vs[i][1]; c[2] += vs[i][2]; }); return mul(c, 1 / idx.length); }
  function finishMesh(m, convex) {
    var c = [0, 0, 0];
    m.v.forEach(function (p) { c = add(c, p); });
    c = mul(c, 1 / Math.max(1, m.v.length));
    m.f.forEach(function (f) {
      if (f.n) return;
      var n = newell(m.v, f.i);
      if (convex && dot(n, sub(centroidOf(m.v, f.i), c)) < 0) n = mul(n, -1);
      f.n = nrm(n);
    });
    var r = 0, lo = 1e9;
    m.v.forEach(function (p) { r = Math.max(r, vlen(p)); lo = Math.min(lo, p[1]); });
    m.r = r; m.lo = lo;
    return m;
  }
  function boxMesh(hx, hy, hz, b) {
    var m = new Mesh();
    b = Math.max(0, Math.min(b || 0, hx * 0.45, hy * 0.45, hz * 0.45));
    if (b <= 0) {
      for (var i = 0; i < 8; i++) m.v.push([i & 1 ? hx : -hx, i & 2 ? hy : -hy, i & 4 ? hz : -hz]);
      [[0, 2, 6, 4], [1, 3, 7, 5], [0, 1, 5, 4], [2, 3, 7, 6], [0, 1, 3, 2], [4, 5, 7, 6]].forEach(function (f) { addFace(m, f); });
      return finishMesh(m, true);
    }
    var id = {};
    function P(sx, sy, sz, k) {
      var key = sx + "," + sy + "," + sz + "," + k;
      if (id[key] != null) return id[key];
      m.v.push([sx * (k === 0 ? hx : hx - b), sy * (k === 1 ? hy : hy - b), sz * (k === 2 ? hz : hz - b)]);
      return (id[key] = m.v.length - 1);
    }
    [-1, 1].forEach(function (s) {
      addFace(m, [P(s, -1, -1, 0), P(s, 1, -1, 0), P(s, 1, 1, 0), P(s, -1, 1, 0)]);
      addFace(m, [P(-1, s, -1, 1), P(1, s, -1, 1), P(1, s, 1, 1), P(-1, s, 1, 1)]);
      addFace(m, [P(-1, -1, s, 2), P(1, -1, s, 2), P(1, 1, s, 2), P(-1, 1, s, 2)]);
    });
    [-1, 1].forEach(function (a) {
      [-1, 1].forEach(function (c) {
        addFace(m, [P(-1, a, c, 1), P(1, a, c, 1), P(1, a, c, 2), P(-1, a, c, 2)], null, 1);
        addFace(m, [P(a, -1, c, 0), P(a, 1, c, 0), P(a, 1, c, 2), P(a, -1, c, 2)], null, 1);
        addFace(m, [P(a, c, -1, 0), P(a, c, 1, 0), P(a, c, 1, 1), P(a, c, -1, 1)], null, 1);
        [-1, 1].forEach(function (z) { addFace(m, [P(a, c, z, 0), P(a, c, z, 1), P(a, c, z, 2)], null, 1); });
      });
    });
    return finishMesh(m, true);
  }
  function cylMesh(r, hh, seg, r2) {
    var m = new Mesh(), top = [], bot = [];
    r2 = r2 == null ? r : r2;
    for (var i = 0; i < seg; i++) {
      var a = (i / seg) * TAU + (seg === 6 ? PI / 6 : 0);
      m.v.push([Math.cos(a) * r2, hh, Math.sin(a) * r2]); top.push(m.v.length - 1);
      m.v.push([Math.cos(a) * r, -hh, Math.sin(a) * r]); bot.push(m.v.length - 1);
    }
    for (i = 0; i < seg; i++) { var j = (i + 1) % seg; addFace(m, [bot[i], bot[j], top[j], top[i]], null, seg > 12 ? 2 : 0); }
    addFace(m, top.slice()); addFace(m, bot.slice());
    return finishMesh(m, true);
  }
  function coneMesh(r, h, seg) {
    var m = new Mesh(), ring = [];
    m.v.push([0, h, 0]);
    for (var i = 0; i < seg; i++) { var a = (i / seg) * TAU; m.v.push([Math.cos(a) * r, 0, Math.sin(a) * r]); ring.push(i + 1); }
    for (i = 0; i < seg; i++) addFace(m, [0, ring[i], ring[(i + 1) % seg]], null, 2);
    addFace(m, ring.slice());
    return finishMesh(m, true);
  }
  function crystalMesh(r, hh, tip) {
    var m = new Mesh(), top = [], bot = [];
    for (var i = 0; i < 6; i++) {
      var a = (i / 6) * TAU + PI / 6;
      m.v.push([Math.cos(a) * r, hh, Math.sin(a) * r]); top.push(m.v.length - 1);
      m.v.push([Math.cos(a) * r, -hh, Math.sin(a) * r]); bot.push(m.v.length - 1);
    }
    m.v.push([0, hh + tip, 0]); var A = m.v.length - 1;
    m.v.push([0, -hh - tip, 0]); var B = m.v.length - 1;
    for (i = 0; i < 6; i++) {
      var j = (i + 1) % 6;
      addFace(m, [bot[i], bot[j], top[j], top[i]]);
      addFace(m, [top[i], top[j], A], null, 1);
      addFace(m, [bot[i], bot[j], B], null, 1);
    }
    return finishMesh(m, true);
  }
  function gemMesh() {
    var m = new Mesh(), T = [], G = [];
    for (var k = 0; k < 8; k++) { var a = (k / 8) * TAU; m.v.push([Math.cos(a) * 0.56, 0.34, Math.sin(a) * 0.56]); T.push(m.v.length - 1); }
    for (var j = 0; j < 16; j++) { var b = (j / 16) * TAU; m.v.push([Math.cos(b), 0, Math.sin(b)]); G.push(m.v.length - 1); }
    m.v.push([0, -0.86, 0]); var C = m.v.length - 1;
    addFace(m, T.slice());
    for (k = 0; k < 8; k++) {
      var k1 = (k + 1) % 8, g0 = G[2 * k], g1 = G[2 * k + 1], g2 = G[(2 * k + 2) % 16];
      addFace(m, [T[k], g0, g1], null, 1);
      addFace(m, [T[k], g1, T[k1]], null, 1);
      addFace(m, [T[k1], g1, g2], null, 1);
    }
    for (j = 0; j < 16; j++) addFace(m, [G[j], G[(j + 1) % 16], C]);
    return finishMesh(m, true);
  }
  function planeMesh(hx, hz) {
    var m = new Mesh();
    m.v.push([-hx, 0, -hz], [hx, 0, -hz], [hx, 0, hz], [-hx, 0, hz]);
    addFace(m, [0, 1, 2, 3], [0, 1, 0], 0, true);
    return finishMesh(m, false);
  }
  // Extrude a 2D outline. axis "z": outline in (x, y), depth along z. axis "y": outline in (x, z), depth along y.
  function extrudeMesh(pts, depth, axis) {
    var m = new Mesh(), n = pts.length, area = 0, hd = depth / 2, i;
    for (i = 0; i < n; i++) { var p = pts[i], q = pts[(i + 1) % n]; area += p[0] * q[1] - q[0] * p[1]; }
    var sgn = area >= 0 ? 1 : -1;
    for (i = 0; i < n; i++) m.v.push(axis === "y" ? [pts[i][0], hd, pts[i][1]] : [pts[i][0], pts[i][1], hd]);
    for (i = 0; i < n; i++) m.v.push(axis === "y" ? [pts[i][0], -hd, pts[i][1]] : [pts[i][0], pts[i][1], -hd]);
    var front = [], back = [];
    for (i = 0; i < n; i++) { front.push(i); back.push(n + i); }
    addFace(m, front, axis === "y" ? [0, 1, 0] : [0, 0, 1]);
    addFace(m, back, axis === "y" ? [0, -1, 0] : [0, 0, -1]);
    for (i = 0; i < n; i++) {
      var j = (i + 1) % n, da = pts[j][0] - pts[i][0], db = pts[j][1] - pts[i][1], l = Math.sqrt(da * da + db * db) || 1;
      var na = (db / l) * sgn, nb = (-da / l) * sgn;
      addFace(m, [i, j, n + j, n + i], axis === "y" ? [na, 0, nb] : [na, nb, 0], 2);
    }
    return finishMesh(m, false);
  }
  function meshMerge(list) {
    var m = new Mesh();
    list.forEach(function (it) {
      var src = it.mesh, R = it.rot ? rot(it.rot[0], it.rot[1], it.rot[2]) : I3, off = it.pos || [0, 0, 0], base = m.v.length;
      src.v.forEach(function (p) { m.v.push(add(mv(R, p), off)); });
      src.f.forEach(function (f) { m.f.push({ i: f.i.map(function (k) { return k + base; }), n: mv(R, f.n), e: f.e, two: f.two }); });
    });
    return finishMesh(m, false);
  }

  // ------------------------- camera (orbit parameters keyed on time) -------------------------
  var CAM0 = { target: [0, 0, 0], dist: 6, yaw: 0, pitch: 12, roll: 0, fov: 30, sx: 0, sy: 0 };
  var CAMKEYS = ["dist", "yaw", "pitch", "roll", "fov", "sx", "sy"];
  function camCopy(a) { return { target: a.target.slice(), dist: a.dist, yaw: a.yaw, pitch: a.pitch, roll: a.roll, fov: a.fov, sx: a.sx, sy: a.sy }; }
  function camMerge(a, o) {
    var c = camCopy(a);
    o = o || {};
    if (Array.isArray(o.target)) c.target = vec(o.target);
    CAMKEYS.forEach(function (k) { if (o[k] != null && isFinite(+o[k])) c[k] = +o[k]; });
    c.dist = Math.max(1e-3, c.dist);
    c.fov = clamp(c.fov, 8, 90);
    return c;
  }
  function camLerp(a, b, p) {
    var c = { target: vlerp(a.target, b.target, p), dist: Math.exp(lerp(Math.log(a.dist), Math.log(b.dist), p)) };
    ["yaw", "pitch", "roll", "fov", "sx", "sy"].forEach(function (k) { c[k] = lerp(a[k], b[k], p); });
    return c;
  }
  var LIFE = { push: 0.08, yaw: 7, pitch: 1.2 };
  function Camera(init) { this.base = camMerge(CAM0, init); this.keys = []; this.drv = null; this.hooks = []; this.dirty = true; }
  Camera.prototype.set = function (o) { this.base = camMerge(this.base, o); this.dirty = true; return this; };
  Camera.prototype.to = function (t, o, dur, e) {
    this.keys.push({ at: Math.max(0, num(t, 0)), dur: Math.max(0, num(dur, 1.6)), e: e || "sine", o: o || {}, id: this.keys.length });
    this.dirty = true;
    return this;
  };
  Camera.prototype.drift = function (o) { this.drv = obj(o); return this; };
  Camera.prototype.hook = function (fn) { if (typeof fn === "function") this.hooks.push(fn); return this; };
  Camera.prototype.compile = function () {
    this.keys.sort(function (a, b) { return a.at - b.at || a.id - b.id; });
    var cur = this.base;
    this.keys.forEach(function (k) { k.from = cur; k.toS = camMerge(cur, k.o); cur = k.toS; });
    this.dirty = false;
  };
  Camera.prototype.state = function (t) {
    if (this.dirty) this.compile();
    var s = this.base, ks = this.keys;
    for (var i = ks.length - 1; i >= 0; i--) {
      if (ks[i].at <= t + 1e-9) { var k = ks[i]; s = t >= k.at + k.dur ? k.toS : camLerp(k.from, k.toS, ease(k.e)((t - k.at) / k.dur)); break; }
    }
    s = camCopy(s);
    var d = this.drv;
    if (d) {
      var tt = Math.min(t, num(d.until, 1e9));
      s.yaw += num(d.yaw, 0) * tt; s.pitch += num(d.pitch, 0) * tt; s.roll += num(d.roll, 0) * tt;
      s.dist *= Math.exp(num(d.dist, 0) * tt);
      if (d.sway) s.yaw += d.sway * Math.sin((TAU * t) / num(d.period, 18));
    }
    // Life: every camera keeps moving across the scene (slow push and a yaw sweep, a slight breathing pitch).
    if (this.life !== false) {
      var L = this.life || LIFE, q = EASE.sine(clamp(t / D, 0, 1));
      s.dist *= 1 - num(L.push, 0.08) * q;
      s.yaw += num(L.yaw, 7) * (q - 0.5) * 2;
      s.pitch += num(L.pitch, 1.2) * Math.sin((TAU * t) / 19);
    }
    for (var h = 0; h < this.hooks.length; h++) this.hooks[h](t, s);
    return s;
  };
  Camera.prototype.moving = function (t) {
    if (this.dirty) this.compile();
    for (var i = 0; i < this.keys.length; i++) {
      var k = this.keys[i];
      if (t > k.at && t < k.at + k.dur) {
        var a = k.from, b = k.toS;
        if (Math.abs(Math.log(b.dist / a.dist)) > 0.12 || Math.abs(b.yaw - a.yaw) > 8 || vlen(sub(b.target, a.target)) > 0.15 * a.dist || Math.abs(b.sx - a.sx) > 0.03 || Math.abs(b.sy - a.sy) > 0.03) return true;
      }
    }
    return false;
  };
  // Preset moves across [from, to] (default the whole scene). Slow and weighty; never overshoots.
  Camera.prototype.move = function (kind, o) {
    o = obj(o);
    var a = num(o.from, 0), b = Math.max(a + 0.5, num(o.to, D)), amt = num(o.amount, 1), base = this.base, d0 = base.dist;
    kind = str(kind) || "orbit";
    if (kind === "push-in") { this.set({ dist: d0 * (1 + 0.16 * amt) }); this.to(a, { dist: d0 * (1 - 0.1 * amt) }, b - a, "sine"); this.drift({ yaw: 1.2 }); }
    else if (kind === "pull-out") { this.set({ dist: d0 * (1 - 0.1 * amt) }); this.to(a, { dist: d0 * (1 + 0.16 * amt) }, b - a, "sine"); this.drift({ yaw: -1.2 }); }
    else if (kind === "dolly-left" || kind === "dolly-right") {
      var sg = kind === "dolly-left" ? 1 : -1, y0 = base.yaw;
      this.set({ yaw: y0 + sg * 16 * amt });
      this.to(a, { yaw: y0 - sg * 16 * amt }, b - a, "sine");
    } else if (kind === "rise") { var p0 = base.pitch; this.set({ pitch: p0 - 8 * amt }); this.to(a, { pitch: p0 + 8 * amt }, b - a, "sine"); }
    else this.drift({ yaw: num(o.speed, 7) * amt });
    return this;
  };
  // Camera basis for a viewport. View space: X right, Y up, Z forward.
  function camBasis(cs, rect) {
    var cp = Math.cos(cs.pitch * DEG), sp = Math.sin(cs.pitch * DEG), cy = Math.cos(cs.yaw * DEG), sy = Math.sin(cs.yaw * DEG);
    var dir = [cp * sy, sp, cp * cy], eye = add(cs.target, mul(dir, cs.dist)), f = mul(dir, -1);
    var r = nrm(cross(f, [0, 1, 0])), up = cross(r, f);
    if (cs.roll) { var c = Math.cos(cs.roll * DEG), s = Math.sin(cs.roll * DEG), r2 = add(mul(r, c), mul(up, s)); up = sub(mul(up, c), mul(r, s)); r = r2; }
    var F = Math.min(rect.w, rect.h) / 2 / Math.tan((cs.fov * DEG) / 2);
    return { eye: eye, r: r, u: up, f: f, F: F, cx: rect.x + rect.w * (0.5 + cs.sx), cy: rect.y + rect.h * (0.5 + cs.sy), dist: cs.dist, near: cs.dist * 0.04, cs: cs, rect: rect };
  }
  function toView(C, p) { var dx = p[0] - C.eye[0], dy = p[1] - C.eye[1], dz = p[2] - C.eye[2]; return [dx * C.r[0] + dy * C.r[1] + dz * C.r[2], dx * C.u[0] + dy * C.u[1] + dz * C.u[2], dx * C.f[0] + dy * C.f[1] + dz * C.f[2]]; }
  function dirView(C, n) { return [dot(n, C.r), dot(n, C.u), dot(n, C.f)]; }
  function projQ(C, q) { return [C.cx + (C.F * q[0]) / q[2], C.cy - (C.F * q[1]) / q[2]]; }
  function project(C, p) { var q = toView(C, p); if (q[2] < C.near) return null; var s = projQ(C, q); return [s[0], s[1], q[2]]; }

  // ------------------------- scene nodes -------------------------
  var NID = 0;
  var ROOTXF = { M: I3, p: [0, 0, 0], a: 1, s: 1 };
  function scl(v) { if (Array.isArray(v)) return vec(v, [1, 1, 1]); var s = num(v, 1); return [s, s, s]; }
  function Node(type, o) {
    o = obj(o);
    this.type = type; this.id = ++NID; this.kids = []; this.parent = null; this.view = null;
    this.base = { pos: vec(o.pos), rot: vec(o.rot), scale: scl(o.scale), op: o.opacity == null ? 1 : num(o.opacity, 1) };
    this.keys = []; this.spinV = [0, 0, 0]; this.inT = null; this.inD = 0.9; this.inK = "rise"; this.outT = null; this.outD = 0.8;
    this.hooks = []; this.r = 1; this.dirty = true; this.subject = !!o.subject; this.label = str(o.label) || type; this.shadow = !!o.shadow;
  }
  function nodeMerge(a, o) {
    return { pos: o.pos ? vec(o.pos) : a.pos.slice(), rot: o.rot ? vec(o.rot) : a.rot.slice(), scale: o.scale != null ? scl(o.scale) : a.scale.slice(), op: o.opacity != null ? num(o.opacity, 1) : a.op };
  }
  Node.prototype.to = function (t, o, dur, e) { this.keys.push({ at: Math.max(0, num(t, 0)), dur: Math.max(0, num(dur, 1)), e: e || "inOut", o: obj(o), id: this.keys.length }); this.dirty = true; return this; };
  Node.prototype.enter = function (t, kind, dur) { this.inT = Math.max(0, num(t, 0)); this.inK = str(kind) || "rise"; this.inD = Math.max(0.05, num(dur, 0.9)); return this; };
  Node.prototype.exit = function (t, dur) { this.outT = Math.max(0, num(t, D)); this.outD = Math.max(0.05, num(dur, 0.8)); return this; };
  Node.prototype.spin = function (dps, axis) { this.spinV[axis === "x" ? 0 : axis === "z" ? 2 : 1] = num(dps, 8); return this; };
  Node.prototype.hook = function (fn) { if (typeof fn === "function") this.hooks.push(fn); return this; };
  Node.prototype.add = function (k) { if (k && k instanceof Node) { k.parent = this; this.kids.push(k); } return k; };
  Node.prototype.local = function (t) {
    if (this.dirty) {
      this.keys.sort(function (a, b) { return a.at - b.at || a.id - b.id; });
      var cur = this.base;
      this.keys.forEach(function (k) { k.from = cur; k.toS = nodeMerge(cur, k.o); cur = k.toS; });
      this.dirty = false;
    }
    var s = this.base, ks = this.keys;
    for (var i = ks.length - 1; i >= 0; i--) {
      if (ks[i].at <= t + 1e-9) {
        var k = ks[i];
        if (t >= k.at + k.dur) s = k.toS;
        else {
          var p = ease(k.e)((t - k.at) / k.dur);
          s = { pos: vlerp(k.from.pos, k.toS.pos, p), rot: vlerp(k.from.rot, k.toS.rot, p), scale: vlerp(k.from.scale, k.toS.scale, p), op: lerp(k.from.op, k.toS.op, p) };
        }
        break;
      }
    }
    s = { pos: s.pos.slice(), rot: s.rot.slice(), scale: s.scale.slice(), op: s.op };
    s.rot[0] += this.spinV[0] * t; s.rot[1] += this.spinV[1] * t; s.rot[2] += this.spinV[2] * t;
    if (this.inT != null) {
      var q = prog(t, this.inT, this.inD, "out");
      s.op *= q;
      if (this.inK === "rise") s.pos[1] -= (1 - q) * 0.18 * this.r * s.scale[1];
      if (this.inK === "rise" || this.inK === "grow") { var g = this.inK === "grow" ? 0.82 + 0.18 * q : 0.97 + 0.03 * q; s.scale = mul(s.scale, g); }
    }
    if (this.outT != null) s.op *= 1 - prog(t, this.outT, this.outD, "inOut");
    for (var h = 0; h < this.hooks.length; h++) this.hooks[h](t, s, this);
    return s;
  };
  Node.prototype.xf = function (t, P) {
    var s = this.local(t), R = rot(s.rot[0], s.rot[1], s.rot[2]);
    var us = Math.cbrt(Math.abs(s.scale[0] * s.scale[1] * s.scale[2])) || 1e-6;
    return { M: mm(P.M, msc(R, s.scale)), p: add(P.p, mv(P.M, s.pos)), a: P.a * s.op, s: P.s * us, st: s };
  };
  Node.prototype.chain = function () { var l = []; for (var n = this; n; n = n.parent) l.unshift(n); return l; };
  Node.prototype.worldXf = function (t) {
    var X = ROOTXF, l = this.chain();
    if (l[0].view && l[0].view.alphaAt) X = { M: I3, p: [0, 0, 0], a: l[0].view.alphaAt(t), s: 1 };
    for (var i = 0; i < l.length; i++) X = l[i].xf(t, X);
    return X;
  };
  Node.prototype.point = function (t, local) { var X = this.worldXf(t); return add(X.p, mv(X.M, local || [0, 0, 0])); };
  Node.prototype.viewOf = function () { var l = this.chain(); return l[0].view || (st && st.views[0]) || null; };
  Node.prototype.emit = function (t, C, items, P) {
    var X = this.xf(t, P);
    if (X.a <= 0.003) return;
    if (this.draw) this.draw(t, C, items, X);
    for (var i = 0; i < this.kids.length; i++) this.kids[i].emit(t, C, items, X);
  };
  // Screen circle of a node (centre and projected bounding radius) at time t.
  Node.prototype.screen = function (t) {
    var v = this.viewOf();
    if (!v) return null;
    var C = viewCam(v, t), X = this.worldXf(t), q = toView(C, X.p);
    if (q[2] < C.near) return null;
    var s = projQ(C, q);
    return { x: s[0], y: s[1], r: (C.F * this.r * X.s) / q[2], z: q[2], a: X.a };
  };

  // ------------------------- draw items -------------------------
  // t: 0 polygon, 1 image, 2 bond (shaded stick), 3 line, 4 custom function
  var TMPV = [0, 0, 0, 0, 0];
  function emitMesh(mesh, m, t, C, items, X, o) {
    o = o || {};
    var vs = mesh.v, nv = vs.length, qv = new Array(nv), sv = new Array(nv), i;
    var inv = [1 / Math.max(1e-6, vlen([X.M[0], X.M[3], X.M[6]])), 1 / Math.max(1e-6, vlen([X.M[1], X.M[4], X.M[7]])), 1 / Math.max(1e-6, vlen([X.M[2], X.M[5], X.M[8]]))];
    for (i = 0; i < nv; i++) {
      var w = add(X.p, mv(X.M, vs[i]));
      var q = toView(C, w);
      qv[i] = q;
      sv[i] = q[2] > C.near ? projQ(C, q) : null;
    }
    var alpha = X.a * (o.alpha == null ? 1 : o.alpha), tr = !!m.tr, bias = o.bias || 0;
    for (var fi = 0; fi < mesh.f.length; fi++) {
      var f = mesh.f[fi], idx = f.i, k, ok = true, cz = 0, cx = 0, cy = 0;
      for (k = 0; k < idx.length; k++) { if (!sv[idx[k]]) { ok = false; break; } cx += qv[idx[k]][0]; cy += qv[idx[k]][1]; cz += qv[idx[k]][2]; }
      if (!ok) continue;
      cx /= idx.length; cy /= idx.length; cz /= idx.length;
      var nl = f.n, nw = nrm(mv(X.M, [nl[0] * inv[0] * inv[0], nl[1] * inv[1] * inv[1], nl[2] * inv[2] * inv[2]]));
      var n = dirView(C, nw), vd = nrm([-cx, -cy, -cz]), facing = dot(n, vd) > 0;
      if (!facing) {
        if (f.two) { n = mul(n, -1); facing = true; }
        else if (!tr) continue;
      }
      var pts = new Array(idx.length);
      for (k = 0; k < idx.length; k++) pts[k] = sv[idx[k]];
      var it = { t: 0, z: cz + bias + (facing ? 0 : 1e-4 * C.dist), pts: pts, a: alpha, sheen: 0, edge: 0, seam: !tr };
      var nvv = Math.max(0, dot(n, vd)), rx = 2 * nvv * n[0] - vd[0], ry = 2 * nvv * n[1] - vd[1], rz = 2 * nvv * n[2] - vd[2];
      var box = sstep(0.55, 0.92, (rx * LK[0] + ry * LK[1] + rz * LK[2]) / (Math.sqrt(rx * rx + ry * ry + rz * rz) || 1));
      if (!facing) {
        var nb = mul(n, -1);
        shadeN(m, nb, vd, TMPV);
        var bc = mixc(m.back, [TMPV[0], TMPV[1], TMPV[2]], 0.3);
        it.fill = rgba(bc, 1); it.a = alpha * m.ab; it.seam = false;
        if (tr) { it.edge = alpha * 0.16 * (m.edge || 0.6); it.ew = u(1); }
      } else {
        shadeN(m, n, vd, TMPV);
        it.fill = rgba([TMPV[0], TMPV[1], TMPV[2]], 1);
        it.a = alpha * TMPV[3];
        var lk = Math.max(0, dot(n, LK));
        it.sheen = ((m.sheen || 0) * (0.25 + 0.5 * lk) + (m.ks || 0) * box * 0.45) * alpha;
        it.band = true; it.sw = t;
        if (tr) {
          it.glass = [TMPV[0], TMPV[1], TMPV[2]];
          var fres = Math.pow(1 - nvv, 2);
          it.edge = alpha * clamp((m.edge || 0.6) * (f.e === 1 ? 0.3 + 0.9 * lk + TMPV[4] : f.e === 2 ? 0 : 0.12 + 0.35 * fres + 0.3 * lk * lk + TMPV[4] * 0.5), 0, 1);
          it.ew = f.e === 1 ? u(1.5) : u(1.1);
        } else if (f.e === 1 && TMPV[4] > 0.25) { it.edge = alpha * clamp(TMPV[4] * 0.6, 0, 0.8); it.ew = u(1.2); }
        if (TMPV[4] > 0.5 && f.e === 1 && o.glints !== false) {
          var ex = 0, ey = 0;
          for (k = 0; k < pts.length; k++) { ex += pts[k][0]; ey += pts[k][1]; }
          ex /= pts.length; ey /= pts.length;
          var gs = clamp((C.F * 0.16 * X.s) / cz, u(10), u(70)) * (o.glint || 1);
          items.push({ t: 1, z: cz - 1e-3, img: glowSpr(C_WHITE), x: ex - gs, y: ey - gs, w: gs * 2, h: gs * 2, a: alpha * clamp((TMPV[4] - 0.5) * 0.7, 0, 0.55), add: true });
        }
      }
      if (it.sheen < 0.01) it.sheen = 0;
      items.push(it);
    }
  }
  // Sphere or drop impostor at world point p with world radius r.
  function emitBall(kind, m, p, r, C, items, a, o) {
    var q = toView(C, p);
    if (q[2] < C.near + r) return null;
    var s = projQ(C, q), d = (2 * C.F * r) / q[2];
    if (d < 0.6) return null;
    o = o || {};
    var bl = 0;
    if (o.dof) {
      var coc = o.dof * C.F * Math.abs(q[2] - C.dist) / q[2] * 0.03;
      bl = clamp(coc / Math.max(4, d) / 0.11, 0, 4);
    }
    var b0 = Math.floor(bl), fb = bl - b0;
    if (fb < 0.08) fb = 0;
    if (fb > 0.92) { b0 += 1; fb = 0; }
    var sp = spriteOf(kind, m, d, b0), w = sp.pw * d, h = sp.ph * d;
    var z = q[2] + (o.bias || 0);
    items.push({ t: 1, z: z, img: sp.c, x: s[0] - w / 2, y: s[1] - h / 2, w: w, h: h, a: a * (1 - fb) });
    if (fb > 0) {
      var sp2 = spriteOf(kind, m, d, Math.min(4, b0 + 1)), w2 = sp2.pw * d, h2 = sp2.ph * d;
      items.push({ t: 1, z: z - 1e-6, img: sp2.c, x: s[0] - w2 / 2, y: s[1] - h2 / 2, w: w2, h: h2, a: a * fb });
    }
    return { x: s[0], y: s[1], z: q[2], d: d, bl: bl };
  }
  function emitGlow(C, p, size, col, a, items, zb) {
    var q = toView(C, p);
    if (q[2] < C.near) return;
    var s = projQ(C, q), r = (C.F * size) / q[2];
    items.push({ t: 1, z: q[2] + (zb || 0), img: glowSpr(col), x: s[0] - r, y: s[1] - r, w: r * 2, h: r * 2, a: clamp(a, 0, 1), add: true });
  }
  function emitBond(C, p1, p2, r, col, a, items, zb) {
    var q1 = toView(C, p1), q2 = toView(C, p2);
    if (q1[2] < C.near || q2[2] < C.near) return;
    var s1 = projQ(C, q1), s2 = projQ(C, q2), z = (q1[2] + q2[2]) / 2;
    items.push({ t: 2, z: z + (zb || 0), x1: s1[0], y1: s1[1], x2: s2[0], y2: s2[1], w: Math.max(0.8, (2 * C.F * r) / z), c: col, a: a });
  }
  function emitLine(C, p1, p2, col, w, a, items, dash, zb, add2) {
    var q1 = toView(C, p1), q2 = toView(C, p2);
    if (q1[2] < C.near || q2[2] < C.near) return;
    var s1 = projQ(C, q1), s2 = projQ(C, q2);
    items.push({ t: 3, z: (q1[2] + q2[2]) / 2 + (zb || 0), pts: [s1, s2], c: col, w: w, a: a, dash: dash || null, add: !!add2 });
  }
  function pathOf(g, pts) {
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (var i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
  }
  function paintItems(g, items) {
    var comp = "source-over";
    g.globalCompositeOperation = comp;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.a <= 0.002) continue;
      var want = it.add ? "lighter" : "source-over";
      if (want !== comp) { g.globalCompositeOperation = want; comp = want; }
      if (it.t === 1) { g.globalAlpha = Math.min(1, it.a); g.drawImage(it.img, it.x, it.y, it.w, it.h); }
      else if (it.t === 0) {
        var pts = it.pts;
        pathOf(g, pts);
        if (it.glass) {
          var gx = 0, gy = 0, gd = 0, q;
          for (q = 0; q < pts.length; q++) { gx += pts[q][0]; gy += pts[q][1]; }
          gx /= pts.length; gy /= pts.length;
          for (q = 0; q < pts.length; q++) gd = Math.max(gd, Math.hypot(pts[q][0] - gx, pts[q][1] - gy));
          if (gd > 6) {
            var rg = g.createRadialGradient(gx, gy, 0, gx, gy, gd), gc = it.glass, ga = Math.min(1, it.a);
            rg.addColorStop(0, rgba(mul(gc, 0.7), ga * 0.42)); rg.addColorStop(0.6, rgba(gc, ga * 0.75)); rg.addColorStop(1, rgba(mul(gc, 1.35), Math.min(1, ga * 1.35)));
            g.globalAlpha = 1; g.fillStyle = rg;
          } else { g.globalAlpha = Math.min(1, it.a); g.fillStyle = it.fill; }
        } else { g.globalAlpha = Math.min(1, it.a); g.fillStyle = it.fill; }
        g.fill();
        if (it.seam) { g.strokeStyle = it.fill; g.lineWidth = 1; g.lineJoin = "round"; g.stroke(); }
        if (it.sheen > 0) {
          var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
          for (var k = 0; k < pts.length; k++) { x0 = Math.min(x0, pts[k][0]); y0 = Math.min(y0, pts[k][1]); x1 = Math.max(x1, pts[k][0]); y1 = Math.max(y1, pts[k][1]); }
          if ((x1 - x0) * (y1 - y0) > 300) {
            var gr = g.createLinearGradient(x0, y0, x1, y1);
            var shv = Math.min(0.6, it.sheen).toFixed(3);
            if (it.band) {
              // the softbox reflection sweeps slowly across the face as the light and the object move
              var bc = 0.1 + 0.8 * fract(it.sw * 0.085 + ((x0 + x1) / (2 * W)) * 0.45), b0 = Math.max(0, bc - 0.2), b1 = Math.min(1, bc + 0.2);
              gr.addColorStop(0, "rgba(255,255,255,0)"); if (b0 > 0) gr.addColorStop(b0, "rgba(255,255,255,0)");
              gr.addColorStop(bc, "rgba(255,255,255," + shv + ")"); if (b1 < 1) gr.addColorStop(b1, "rgba(255,255,255,0)"); gr.addColorStop(1, "rgba(255,255,255,0)");
            }
            else { gr.addColorStop(0, "rgba(255,255,255," + shv + ")"); gr.addColorStop(0.55, "rgba(255,255,255,0)"); }
            g.globalAlpha = 1;
            g.fillStyle = gr;
            g.fill();
          }
        }
        if (it.edge > 0.01) { g.globalAlpha = Math.min(1, it.edge); g.strokeStyle = "rgba(230,246,255,1)"; g.lineWidth = it.ew || 1; g.lineJoin = "round"; g.stroke(); }
      } else if (it.t === 2) {
        var dx = it.x2 - it.x1, dy = it.y2 - it.y1, l = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / l, ny = dx / l, mx = (it.x1 + it.x2) / 2, my = (it.y1 + it.y2) / 2, hw = it.w / 2;
        var bg = g.createLinearGradient(mx - nx * hw, my - ny * hw, mx + nx * hw, my + ny * hw), c = it.c;
        bg.addColorStop(0, rgba(mul(c, 0.28), 1)); bg.addColorStop(0.32, rgba(mul(c, 1.05), 1)); bg.addColorStop(0.5, rgba(mul(c, 0.82), 1)); bg.addColorStop(1, rgba(mul(c, 0.2), 1));
        g.globalAlpha = Math.min(1, it.a); g.strokeStyle = bg; g.lineWidth = it.w; g.lineCap = "butt";
        g.beginPath(); g.moveTo(it.x1, it.y1); g.lineTo(it.x2, it.y2); g.stroke();
      } else if (it.t === 3) {
        g.globalAlpha = Math.min(1, it.a); g.strokeStyle = typeof it.c === "string" ? it.c : rgba(it.c, 1); g.lineWidth = it.w; g.lineCap = "round";
        if (it.dash) g.setLineDash(it.dash);
        g.beginPath(); g.moveTo(it.pts[0][0], it.pts[0][1]);
        for (var j = 1; j < it.pts.length; j++) g.lineTo(it.pts[j][0], it.pts[j][1]);
        g.stroke();
        if (it.dash) g.setLineDash([]);
      } else if (it.t === 4) { g.save(); it.fn(g); g.restore(); comp = g.globalCompositeOperation; }
    }
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
  }
  function byDepth(a, b) { return b.z - a.z; }

  // ------------------------- stage, views and the frame -------------------------
  var st = null, registered = false;
  function safe() {
    var x0, y0, x1, y1;
    if (PORT) { x0 = W * 0.056; x1 = W * 0.944; y0 = H * 0.13; y1 = H * 0.755; }
    else { x0 = W * 0.07; x1 = W * 0.93; y0 = H * 0.075; y1 = H * 0.925; }
    return { x0: x0, y0: y0, x1: x1, y1: y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  }
  function stage(root, o) {
    o = obj(o);
    root = root || V.root();
    while (root.firstChild) root.removeChild(root.firstChild);
    var wrap = doc.createElement("div");
    wrap.className = "dz";
    var cv = doc.createElement("canvas");
    cv.width = W; cv.height = H; cv.className = "dz-canvas";
    wrap.appendChild(cv);
    root.appendChild(wrap);
    st = {
      root: root, cv: cv, g: cv.getContext("2d"), views: [], over: [], fx: [], items: [], opts: o, laid: false, cacheT: null, cacheC: {},
      grain: o.grain == null ? 1 : num(o.grain, 1), trans: o.transitions !== false, vignette: o.vignette !== false, dust: o.dust === false ? null : makeDust(o.dust),
    };
    if (!registered) { V.onFrame(frame); registered = true; }
    return st;
  }
  function ensure() { if (!st) stage(V.root(), {}); return st; }
  function View(o) {
    o = obj(o);
    this.rect = o.rect || { x: 0, y: 0, w: W, h: H };
    this.cam = o.camera instanceof Camera ? o.camera : new Camera(o.camera);
    this.nodes = []; this.floor = o.floor == null ? null : num(o.floor, null); this.dof = num(o.dof, 0); this.clip = !!o.clip;
    this.alpha = o.alpha == null ? 1 : o.alpha; this.order = num(o.order, 0); this.floorGlow = o.floorGlow !== false;
    this.cache = {};
  }
  View.prototype.add = function (n) { if (n && n instanceof Node) { n.view = this; this.nodes.push(n); } return n; };
  View.prototype.alphaAt = function (t) { return typeof this.alpha === "function" ? clamp(num(this.alpha(t), 1), 0, 1) : clamp(num(this.alpha, 1), 0, 1); };
  function addView(o) { var s = ensure(), v = new View(o); s.views.push(v); s.views.sort(function (a, b) { return a.order - b.order; }); return v; }
  function viewCam(v, t) {
    var c = v.cache;
    if (c.t === t && c.C) return c.C;
    c.t = t; c.C = camBasis(v.cam.state(t), v.rect);
    return c.C;
  }
  function renderView(g, v, t) {
    var a = v.alphaAt(t);
    if (a <= 0.003) return;
    var C = viewCam(v, t), items = [], P = { M: I3, p: [0, 0, 0], a: a, s: 1 };
    if (v.floor != null) floorItems(v, C, t, items, a);
    for (var i = 0; i < v.nodes.length; i++) v.nodes[i].emit(t, C, items, P);
    items.sort(byDepth);
    if (v.clip) { g.save(); g.beginPath(); g.rect(v.rect.x, v.rect.y, v.rect.w, v.rect.h); g.clip(); }
    if (v.floor != null && v.reflect) reflectPass(g, v, C, t, a, items);
    paintItems(g, items);
    if (v.clip) g.restore();
  }
  // Glossy studio floor: nodes marked .reflect are mirrored in the floor plane, faded with distance from it.
  function reflectPass(g, v, C, t, a, items) {
    var fy = v.floor, Pm = { M: [1, 0, 0, 0, -1, 0, 0, 0, 1], p: [0, 2 * fy, 0], a: a, s: 1 }, ri = [], R = 0;
    v.nodes.forEach(function (n) { if (n.reflect) { n.emit(t, C, ri, Pm); R = Math.max(R, n.r * n.worldXf(t).s); } });
    if (!ri.length) return;
    ri.sort(byDepth);
    if (!st.rc) { st.rc = canvas(W, H); st.rg = st.rc.getContext("2d"); }
    var rg = st.rg, tg = C.cs.target, q = toView(C, [tg[0], fy, tg[2]]);
    if (q[2] < C.near) return;
    // Only the band below the floor line is ever visible: clear, paint and mask just that band.
    var sy = projQ(C, q)[1], fall = (C.F * R * 1.1) / q[2], y0 = Math.max(0, Math.floor(sy - u(4))), y1 = Math.min(H, Math.ceil(sy + fall));
    if (y1 - y0 < 2) return;
    rg.setTransform(1, 0, 0, 1, 0, 0);
    rg.globalCompositeOperation = "source-over";
    rg.clearRect(0, y0, W, y1 - y0);
    rg.save(); rg.beginPath(); rg.rect(0, y0, W, y1 - y0); rg.clip();
    paintItems(rg, ri);
    rg.restore();
    var mg = rg.createLinearGradient(0, sy, 0, sy + fall);
    mg.addColorStop(0, "rgba(0,0,0,1)"); mg.addColorStop(1, "rgba(0,0,0,0)");
    rg.globalCompositeOperation = "destination-in";
    rg.fillStyle = mg; rg.fillRect(0, y0, W, y1 - y0);
    rg.globalCompositeOperation = "source-over";
    var ra = v.reflect === true ? 0.26 : num(v.reflect, 0.26), band = y1 - y0;
    items.push({ t: 4, z: 1e9 - 2, a: ra, fn: function (g) { g.globalAlpha = ra; g.drawImage(st.rc, 0, y0, W, band, 0, y0, W, band); } });
  }
  // Studio floor: a faint pool of light and a soft contact shadow under every node that asks for one.
  function floorItems(v, C, t, items, a) {
    var fy = v.floor, tg = C.cs.target, far = 1e9;
    if (v.floorGlow) {
      var q = toView(C, [tg[0], fy, tg[2]]), R0 = 0;
      v.nodes.forEach(function (n) { if (n.shadow) R0 = Math.max(R0, n.r * Math.abs(n.base.scale[0])); });
      if (!R0) R0 = C.dist * 0.25;
      if (q[2] > C.near) {
        var s = projQ(C, q), r = (C.F * R0 * 1.7) / q[2], sq = clamp(Math.abs(Math.sin(C.cs.pitch * DEG)) * 1.4 + 0.08, 0.1, 1);
        items.push({ t: 1, z: far, img: floorSpr(), x: s[0] - r * 1.4, y: s[1] - r * sq, w: r * 2.8, h: r * 2 * sq, a: 0.9 * a });
      }
    }
    v.nodes.forEach(function (n) {
      if (!n.shadow) return;
      var X = n.worldXf(t);
      if (X.a <= 0.01) return;
      var h = Math.max(0, X.p[1] - fy), R = n.r * X.s, q2 = toView(C, [X.p[0], fy, X.p[2]]);
      if (q2[2] < C.near) return;
      var s2 = projQ(C, q2), rr = (C.F * R * (0.85 + h * 0.35)) / q2[2], sq2 = clamp(Math.abs(Math.sin(C.cs.pitch * DEG)) * 1.2 + 0.06, 0.08, 1);
      var al = X.a * clamp(0.85 - h / (R * 3), 0.25, 0.85);
      items.push({ t: 1, z: far - 1, img: shadowSpr(), x: s2[0] - rr, y: s2[1] - rr * sq2, w: rr * 2, h: rr * 2 * sq2, a: al });
    });
  }
  // Bokeh dust: out-of-focus motes in a box around the focus plane. Far ones paint behind the views, near ones in front.
  function makeDust(o) {
    o = obj(o);
    var n = Math.round(num(o.count, LAND ? 46 : 40)), rnd = V.makeRand(num(o.seed, 3141)), list = [];
    for (var i = 0; i < n; i++) {
      list.push({ x: (rnd() * 2 - 1) * 1.7, y: (rnd() * 2 - 1) * 1.6, z: rnd(), ph: rnd() * TAU, sp: 0.6 + rnd(), a: 0.35 + rnd() * 0.65, warm: rnd() < 0.12 });
    }
    return { list: list, flow: null, alpha: num(o.alpha, 1), aperture: num(o.aperture, 1) };
  }
  function dustPass(g, t, front) {
    var ds = st.dust;
    if (!ds || ds.alpha <= 0) return;
    var flow = ds.flow ? ds.flow(t) : t * 0.045, v0 = st.views[0], yawOff = 0, pitOff = 0, roll = 0;
    if (v0) { var cs = viewCam(v0, t).cs; yawOff = cs.yaw * DEG; pitOff = cs.pitch * DEG; roll = cs.roll * DEG; }
    var cr = Math.cos(roll), sr = Math.sin(roll);
    g.globalCompositeOperation = "lighter";
    for (var i = 0; i < ds.list.length; i++) {
      var p = ds.list[i];
      var zz = fract(p.z - flow * 0.32), z = 0.3 + zz * 3.2;
      if (front ? z >= 0.95 : z < 0.95) continue;
      var x = p.x + 0.05 * Math.sin(t * 0.11 * p.sp + p.ph), y = p.y + 0.05 * Math.cos(t * 0.09 * p.sp + p.ph * 1.3);
      var X = x * MIN * 0.5 / z - yawOff * MIN * 1.1 * (1 / z - 1), Y = y * MIN * 0.5 / z + pitOff * MIN * 0.8 * (1 / z - 1);
      var sx = W / 2 + X * cr - Y * sr, sy = H / 2 + X * sr + Y * cr;
      var coc = Math.abs(1 / z - 1) * MIN * 0.03 * ds.aperture + 1.4, r = coc;
      if (sx < -r || sx > W + r || sy < -r || sy > H + r) continue;
      var fade = sstep(0, 0.12, zz) * (1 - sstep(0.88, 1, zz));
      var al = ds.alpha * p.a * fade * clamp(1.15 - coc / (MIN * 0.09), 0.18, 1) * (front ? 0.5 : 0.75) * 0.16;
      if (al < 0.003) continue;
      g.globalAlpha = al;
      g.drawImage(bokehSpr(p.warm ? [1, 0.82, 0.62] : [0.72, 0.88, 1]), sx - r, sy - r, r * 2, r * 2);
    }
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
  }
  function frame(t) {
    if (!st) return;
    if (!st.laid) layoutOverlays();
    var g = st.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-over";
    g.drawImage(bgCanvas(), 0, 0);
    dustPass(g, t, false);
    for (var i = 0; i < st.views.length; i++) renderView(g, st.views[i], t);
    for (i = 0; i < st.fx.length; i++) { g.save(); st.fx[i](g, t); g.restore(); }
    dustPass(g, t, true);
    if (st.vignette) g.drawImage(vignetteCanvas(), 0, 0);
    if (st.grain > 0) {
      var tiles = grainTiles(), k = Math.floor(t * 12) % 4, tile = tiles[k];
      if (!st.pat) st.pat = tiles.map(function (c) { return g.createPattern(c, "repeat"); });
      var ox = (k * 53) % 192, oy = (k * 97) % 192;
      g.globalAlpha = clamp(st.grain, 0, 2) * 0.9;
      g.translate(-ox, -oy);
      g.fillStyle = st.pat[k];
      g.fillRect(ox, oy, W, H);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = 1;
      void tile;
    }
    for (i = 0; i < st.over.length; i++) {
      var ov = st.over[i];
      if (ov.draw) { g.save(); ov.draw(g, t); g.restore(); }
    }
    if (st.trans) transition(g, t);
  }
  // In and out of every scene: a short push-through (zoom ghosts) and a soft light sweep, so cuts are not hard.
  function transition(g, t) {
    var kin = 1 - prog(t, 0, 0.45, "out"), kout = D > 2 ? prog(t, D - 0.4, 0.4, "in") * 0.7 : 0, k = Math.max(kin, kout);
    if (k < 0.01) return;
    if (kin >= kout) {
      if (!st.tc) { st.tc = canvas(W, H); st.tg = st.tc.getContext("2d"); }
      st.tg.setTransform(1, 0, 0, 1, 0, 0);
      st.tg.globalCompositeOperation = "copy";
      st.tg.drawImage(st.cv, 0, 0);
    }
    g.save();
    g.globalCompositeOperation = "source-over";
    if (kin >= kout) [0.035, 0.07].forEach(function (z, j) {
      var sc = 1 + z * k;
      g.globalAlpha = k * (j ? 0.22 : 0.32);
      g.drawImage(st.tc, (W - W * sc) / 2, (H - H * sc) / 2, W * sc, H * sc);
    });
    var pos = kin >= kout ? 1.3 - 1.6 * (1 - kin) : -0.3 + 1.6 * (kout / 0.7), bx = W * pos;
    var gr = g.createLinearGradient(bx - W * 0.25, 0, bx + W * 0.25, H * 0.3);
    gr.addColorStop(0, "rgba(160,215,250,0)"); gr.addColorStop(0.5, "rgba(190,230,255," + (0.16 * k).toFixed(3) + ")"); gr.addColorStop(1, "rgba(160,215,250,0)");
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 1;
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "rgba(3,5,9," + (0.22 * k * k).toFixed(3) + ")"; g.fillRect(0, 0, W, H);
    g.restore();
  }

  // ------------------------- type: measure, wrap, balance, draw -------------------------
  var FONT = 'Inter, "Helvetica Neue", Helvetica, "Avenir Next", system-ui, Arial, sans-serif';
  var MC = null;
  function fontStr(sz, wt) { return (wt || 400) + " " + sz.toFixed(2) + "px " + FONT; }
  function setFont(g, sz, wt, tr) { g.font = fontStr(sz, wt); if ("letterSpacing" in g) g.letterSpacing = (tr || 0).toFixed(2) + "px"; }
  function tw(text, sz, wt, tr) { if (!MC) MC = doc.createElement("canvas").getContext("2d"); setFont(MC, sz, wt, tr); return MC.measureText(text).width; }
  function cleanText(s) { return str(s).replace(/\s*[\u2014\u2013]\s*/g, ", ").replace(/\s+/g, " "); }
  // Words with an emphasis flag: *word* (or *two words*) is set in the gold accent.
  // A word is a list of runs, so punctuation after an emphasised word stays glued to it ("*slippery*?").
  function parseEm(text, upper) {
    var out = [], em = false, cur = null, buf = "", s = cleanText(text);
    if (upper) s = s.toUpperCase();
    function flush() { if (buf) { if (!cur) cur = { runs: [] }; cur.runs.push({ s: buf, em: em }); buf = ""; } }
    function endWord() { flush(); if (cur) { cur.w = cur.runs.map(function (r) { return r.s; }).join(""); cur.em = cur.runs.some(function (r) { return r.em; }); out.push(cur); cur = null; } }
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === "*") { flush(); em = !em; }
      else if (/\s/.test(ch)) endWord();
      else buf += ch;
    }
    endWord();
    return out;
  }
  // Measure first: returns lines (balanced, no orphan words), the fitted size and the block size.
  // Bold documentary caps (owner's choice, 2026-11-13). Every text call is normalised here: upper case unless
  // upper === false, heavy weights only (display 900, labels 800, body 700), tight tracking on big sizes and
  // readable tracking on small ones. Emphasis is never a colour: a *word* becomes the bigger, heavier line.
  function capsOpts(o) {
    var c = {};
    for (var k in o) c[k] = o[k];
    var w = num(o.weight, 700), sz = num(o.size, u(40));
    c.weight = w <= 300 ? 900 : w <= 450 ? 700 : w < 900 ? Math.max(800, w) : w;
    if (o.caps === false) c.weight = w;
    c.upper = o.upper !== false;
    if (o.track == null) c.track = sz >= u(44) ? -sz * 0.012 : sz * 0.055;
    return c;
  }
  function layoutText(text, o) {
    o = capsOpts(o || {});
    var toks0 = parseEm(text, o.upper);
    // Emphasis stack: split into segments at the *...* marks, big lines for the emphasised part.
    if (o.stack !== false && toks0.some(function (tk) { return tk.em; }) && toks0.some(function (tk) { return !tk.em; })) {
      var segs = [], cur = null;
      toks0.forEach(function (tk) {
        var punct = !/[\p{L}\p{N}]/u.test(tk.w);
        if (cur && (cur.em === tk.em || punct)) cur.words.push(tk.w);
        else { cur = { em: tk.em, words: [tk.w] }; segs.push(cur); }
      });
      var base = num(o.size, u(40)), out = { lines: [], w: 0, h: 0, n: 0, size: base, stacked: true }, y = 0;
      segs.forEach(function (sg, k) {
        var o2 = {}; for (var kk in o) o2[kk] = o[kk];
        o2.stack = false; o2.size = sg.em ? base : base * 0.6; o2.weight = sg.em ? 900 : 800; o2.track = sg.em ? -base * 0.014 : base * 0.6 * 0.03;
        o2.maxLines = sg.em ? Math.max(1, num(o.maxLines, 3) - 1) : 2; o2.upper = o.upper;
        var Ls = layoutText(sg.words.join(" "), o2);
        if (k) y += Ls.size * 0.12;
        Ls.lines.forEach(function (ln) { ln.y += y; out.lines.push(ln); });
        y += Ls.h; out.w = Math.max(out.w, Ls.w); out.n += Ls.n;
      });
      out.h = y; out.lh = base * 1.0; out.wt = 900; out.tr = 0;
      return out;
    }
    var toks = toks0, wt = o.weight || 700, trk = o.track || 0;
    var size = num(o.size, u(40)), maxW = num(o.maxWidth, W * 0.8), maxL = Math.max(1, Math.floor(num(o.maxLines, 3))), lh = num(o.lh, o.upper ? 1.04 : 1.2), minS = num(o.min, size * 0.5);
    if (size < u(30)) lh = Math.max(lh, 1.22);
    function wrap(sz, lim) {
      var sp = tw(" ", sz, wt, trk), lines = [], line = { ws: [], w: 0 };
      toks.forEach(function (tk) {
        var ww = 0, runs = tk.runs.map(function (r) { var o3 = { s: r.s, em: r.em, dx: ww }; ww += tw(r.s, sz, wt, trk); return o3; });
        if (line.ws.length && line.w + sp + ww > lim) { lines.push(line); line = { ws: [], w: 0 }; }
        line.w += (line.ws.length ? sp : 0) + ww;
        line.ws.push({ w: tk.w, em: tk.em, ww: ww, runs: runs });
      });
      if (line.ws.length) lines.push(line);
      lines.sp = sp;
      return lines;
    }
    function widest(ls) { var m = 0; ls.forEach(function (l) { m = Math.max(m, l.w); }); return m; }
    if (!toks.length) return { lines: [], size: size, w: 0, h: 0, lh: size * lh, wt: wt, tr: trk, n: 0 };
    var lines, s = size;
    for (var it = 0; it < 24; it++) {
      lines = wrap(s, maxW);
      if ((lines.length <= maxL && widest(lines) <= maxW + 0.5) || s <= minS) break;
      s = Math.max(minS, s * 0.94);
    }
    if (lines.length > 1 && o.balance !== false) {
      var n0 = lines.length, lo = widest(lines) * 0.35, hi = widest(lines);
      for (var b = 0; b < 14; b++) { var mid = (lo + hi) / 2; if (wrap(s, mid).length <= n0) hi = mid; else lo = mid; }
      lines = wrap(s, hi + 0.5);
    }
    var sp = lines.sp, n = 0, capH = o.upper ? 0.76 : 0.93;
    lines.forEach(function (l, li) {
      var x = 0;
      l.ws.forEach(function (wd) { wd.x = x; x += wd.ww + sp; n++; });
      l.size = s; l.wt = wt; l.tr = trk; l.y = s * capH + li * s * lh;
    });
    var h = s * (o.upper ? 0.82 : 1.16) + (lines.length - 1) * s * lh;
    return { lines: lines, size: s, w: widest(lines), h: h, lh: s * lh, wt: wt, tr: trk, n: n };
  }
  // Draw a measured block. top = top of the block. Lines build in with a left-to-right wipe and a short slide
  // (o.times: per-word times instead, for text synced to the voice). o.outline: a thick dark outline (thumbnails).
  function drawText(g, L, x, top, align, col, alpha, t, t0, o) {
    if (!L.lines.length || alpha <= 0.003) return;
    o = o || {};
    var base = rgba(col, 1), emc = o.em ? rgba(o.em, 1) : base, times = o.times, wi = 0, fd = num(o.fade, 0.6);
    g.textBaseline = "alphabetic";
    g.textAlign = "left";
    for (var li = 0; li < L.lines.length; li++) {
      var line = L.lines[li], lx = align === "center" ? x - line.w / 2 : align === "right" ? x - line.w : x, by = top + line.y, sz = line.size;
      var p = 1;
      if (t0 != null && !times) p = prog(t, t0 + li * num(o.lineStagger, 0.13), num(o.wipe, 0.7), "outQuart");
      if (p <= 0.002) { wi += line.ws.length; continue; }
      g.save();
      setFont(g, sz, line.wt, line.tr);
      if (p < 1) { var pad = sz * 0.35; g.beginPath(); g.rect(lx - pad, by - sz * 1.15, (line.w + pad * 2) * p, sz * 1.6); g.clip(); }
      if (o.shadow !== false) { g.shadowColor = "rgba(0,0,0,0.6)"; g.shadowBlur = Math.max(4, sz * 0.18); g.shadowOffsetY = sz * 0.03; }
      var slide = -(1 - p) * sz * 0.45;
      for (var k = 0; k < line.ws.length; k++, wi++) {
        var wd = line.ws[k], q = 1;
        if (times) q = prog(t, times[wi] != null ? times[wi] : t0, fd, "outQuart");
        if (q <= 0.002) continue;
        g.globalAlpha = alpha * Math.min(1, p * 1.5) * q;
        for (var ri = 0; ri < wd.runs.length; ri++) {
          var rn = wd.runs[ri], px = lx + wd.x + rn.dx + slide, py = by + (1 - q) * sz * 0.25;
          if (o.outline) { g.lineJoin = "round"; g.lineWidth = sz * o.outline; g.strokeStyle = "rgba(2,4,8,0.92)"; g.strokeText(rn.s, px, py); }
          g.fillStyle = rn.em ? emc : base;
          g.fillText(rn.s, px, py);
        }
      }
      g.restore();
    }
    g.globalAlpha = 1;
  }

  // ------------------------- timing (copied from the pilot, adapted) -------------------------
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
  // Landing times for a list of {text, kw}: spoken order, monotonic, inside [start, end], compressed if needed.
  function landsFor(items, o) {
    o = o || {};
    var a = num(o.start, Math.min(0.4, D * 0.08)), b = Math.max(a + 0.3, num(o.end, D - 1.6)), gap = num(o.gap, 0.3), prev = 0;
    var out = items.map(function (it) { var t = labelTime(it.text, it.kw, prev); if (t != null) prev = t + 0.05; return t; });
    out = spread(out, a, b);
    for (var i = 0; i < out.length; i++) { out[i] = clamp(out[i], a, b); if (i && out[i] < out[i - 1] + gap) out[i] = out[i - 1] + gap; }
    var n = out.length;
    if (n && out[n - 1] > b) {
      var first = out[0], span = out[n - 1] - first, room = Math.max(0.1, b - first);
      for (i = 0; i < n; i++) out[i] = first + ((out[i] - first) * room) / (span || 1);
    }
    return out;
  }
  function when(word, frac) {
    var t = kwFind(word, 0);
    if (t != null) return t;
    return clamp(num(frac, 0.3), 0, 1) * D;
  }
  function syncTimes(keys, o) {
    o = o || {};
    var prev = 0, out = [];
    (keys || []).forEach(function (k) { var t = kwFind(k, prev); out.push(t); if (t != null) prev = t + 0.01; });
    out = spread(out);
    for (var i = 1; i < out.length; i++) if (out[i] < out[i - 1]) out[i] = out[i - 1];
    return out.map(function (t) { return Math.max(0, t - (o.lead || 0)); });
  }

  // ------------------------- overlays (2D, drawn after the 3D) -------------------------
  function addOverlay(ov) { var s = ensure(); s.over.push(ov); s.laid = false; return ov; }
  function revealAlpha(t, at, until, fd) { var a = prog(t, at, fd || 0.6, "out"); if (until != null) a *= 1 - prog(t, until, 0.6, "inOut"); return a; }
  function anchorFn(target, o, viewHint) {
    o = o || {};
    if (typeof target === "function") return { fn: target, view: viewHint };
    if (target instanceof Node) {
      var n = target, off = o.offset ? vec(o.offset) : null, edge = Array.isArray(o.edge) ? o.edge : null;
      if (edge) return { screenFn: function (t) { var sc = n.screen(t); if (!sc) return null; return [sc.x + edge[0] * sc.r, sc.y - edge[1] * sc.r]; } };
      return { fn: function (t) { return off ? n.point(t, off) : n.point(t); }, view: n.viewOf() };
    }
    if (Array.isArray(target) && target.length >= 3) { var p = vec(target); return { fn: function () { return p; }, view: viewHint }; }
    return null;
  }
  function anchorScreen(A, t) {
    if (!A) return null;
    if (A.screenFn) return A.screenFn(t);
    var v = A.view || (st && st.views[0]);
    if (!v) return null;
    var p = A.fn(t);
    if (!p) return null;
    var s = project(viewCam(v, t), p);
    return s ? [s[0], s[1]] : null;
  }
  // Label: a dot on the target, a fine leader line with one elbow, then the text (upper case, tracked) and an optional sub line.
  function label(text, o) {
    o = obj(o);
    var sa = safe(), sz = num(o.size, u(LAND ? 25 : 27));
    var L = layoutText(text, { size: sz, weight: 900, upper: o.upper !== false, track: sz * 0.07, maxWidth: num(o.maxWidth, u(LAND ? 420 : 440)), maxLines: 2, lh: 1.18, stack: false });
    var Ls = o.sub ? layoutText(o.sub, { size: sz * 0.86, weight: 800, maxWidth: num(o.maxWidth, u(LAND ? 420 : 440)), maxLines: 2, lh: 1.2, stack: false }) : null;
    var Lk = o.kicker ? layoutText(o.kicker, { size: sz * 1.25, weight: 900, maxWidth: u(420), maxLines: 1, stack: false }) : null;
    var gap = u(8), bw = Math.max(L.w, Ls ? Ls.w : 0, Lk ? Lk.w : 0), bh = L.h + (Ls ? Ls.h + gap * 0.6 : 0) + (Lk ? Lk.h + gap * 0.5 : 0);
    var A = o.target != null ? anchorFn(o.target, o, o.view) : null;
    var fixed = o.x != null && o.y != null ? [num(o.x, W / 2), num(o.y, H / 2)] : null;
    var at = num(o.at, 0.5), ov = {
      kind: "label", label: str(text), at: at, until: o.until, A: A, fixed: fixed, L: L, Ls: Ls, Lk: Lk, bw: bw, bh: bh,
      side: o.side || "auto", dir: o.dir || "up", stem: !!o.stem, len: num(o.len, u(58)), col: colorOf(o.color, C_TEXT), subc: colorOf(o.subColor, C_ICE), line: o.line !== false, dx: 0, dy: 0, sa: o.safe || sa,
    };
    ov.restT = num(o.restAt, clamp(at + 1.2, 0, D - 0.3));
    ov.geom = function (t) {
      var a = this.A ? anchorScreen(this.A, t) : this.fixed;
      if (!a) return null;
      var s = this.sideR, sg = s === "left" ? -1 : 1, up = this.dirR === "down" ? 1 : -1;
      var len = this.line ? this.len : 0, ex = a[0] + sg * len * 0.62, ey = a[1] + up * len * 0.62 + this.dy;
      var hx = ex + sg * u(26), bx = sg > 0 ? hx + u(10) : hx - u(10) - this.bw, by = ey - this.bh / 2;
      if (!this.line) { bx = a[0] - this.bw / 2; by = a[1] - this.bh / 2; }
      if (this.stem) {
        ex = a[0]; ey = a[1] + up * len + this.dy;
        bx = a[0] - this.bw / 2; by = up < 0 ? ey - this.bh - u(8) : ey + u(8);
        var S1 = this.sa, sx = clamp(bx, S1.x0, S1.x1 - this.bw), sy = clamp(by, S1.y0, S1.y1 - this.bh);
        return { a: a, e: [ex, ey], h: [ex, ey], x: sx, y: sy, shift: [sx - bx, sy - by], sg: 0 };
      }
      var S0 = this.sa, cx = clamp(bx, S0.x0, S0.x1 - this.bw), cy = clamp(by, S0.y0, S0.y1 - this.bh);
      var shift = [cx - bx, cy - by];
      return { a: a, e: [ex, ey + shift[1] * 0.0], h: [sg > 0 ? cx - u(10) : cx + this.bw + u(10), cy + this.bh / 2], x: cx, y: cy, shift: shift, sg: sg };
    };
    ov.draw = function (g, t) {
      if (t < this.at - 0.001) return;
      var a = revealAlpha(t, this.at, this.until, 0.5);
      if (a <= 0.003) return;
      var G = this.geom(t);
      if (!G) return;
      var lp = prog(t, this.at, 0.55, "inOut"), tp = prog(t, this.at + 0.28, 0.55, "out");
      g.globalAlpha = a;
      if (this.line) {
        g.globalCompositeOperation = "lighter";
        g.drawImage(glowSpr(C_ICE), G.a[0] - u(10), G.a[1] - u(10), u(20), u(20));
        g.globalCompositeOperation = "source-over";
        g.fillStyle = rgba(C_ICE, 1);
        g.beginPath(); g.arc(G.a[0], G.a[1], u(3.2), 0, TAU); g.fill();
        // leader: anchor to elbow to the text edge, drawn on progressively
        var p0 = G.a, p1 = [G.e[0], G.h[1]], p2 = G.h;
        var l1 = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), l2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), dl = (l1 + l2) * lp;
        g.strokeStyle = rgba(C_LINE, 0.85); g.lineWidth = u(1.3); g.lineCap = "round";
        g.beginPath(); g.moveTo(p0[0], p0[1]);
        if (dl <= l1) g.lineTo(p0[0] + ((p1[0] - p0[0]) * dl) / (l1 || 1), p0[1] + ((p1[1] - p0[1]) * dl) / (l1 || 1));
        else { g.lineTo(p1[0], p1[1]); var r2 = (dl - l1) / (l2 || 1); g.lineTo(p1[0] + (p2[0] - p1[0]) * r2, p1[1] + (p2[1] - p1[1]) * r2); }
        g.stroke();
      }
      g.globalAlpha = a * tp * 0.7;
      g.drawImage(shadowSpr(), G.x - u(40), G.y - u(26), this.bw + u(80), this.bh + u(52));
      g.globalAlpha = a;
      var al = this.stem ? "center" : this.sideR === "left" && this.line ? "right" : this.line ? "left" : "center";
      var tx = al === "right" ? G.x + this.bw : al === "center" ? G.x + this.bw / 2 : G.x, y = G.y;
      if (this.Lk) { drawText(g, this.Lk, tx, y, al, C_ICE, a * tp, t, null); y += this.Lk.h + u(4); }
      drawText(g, this.L, tx, y, al, this.col, a * tp, t, null);
      if (this.Ls) drawText(g, this.Ls, tx, y + this.L.h + u(5), al, this.subc, a * tp, t, null);
    };
    ov.box = function (t) { if (t < this.at) return null; var G = this.geom(t); return G ? { x: G.x, y: G.y, w: this.bw, h: this.bh } : null; };
    ov.moving = function (t) { return t < this.at + 0.85 || (this.until != null && t > this.until); };
    return addOverlay(ov);
  }
  // After everything is built: choose label sides and push overlapping labels apart (at their rest time).
  function layoutOverlays() {
    st.laid = true;
    var labs = st.over.filter(function (o) { return o.kind === "label"; });
    labs.forEach(function (o) {
      var a = o.A ? anchorScreen(o.A, o.restT) : o.fixed;
      o.dirR = o.dir;
      if (o.side === "left" || o.side === "right") o.sideR = o.side;
      else {
        var v = o.A && o.A.view ? o.A.view : st.views[0], cx = v ? v.rect.x + v.rect.w / 2 : W / 2;
        o.sideR = a && a[0] < cx - u(4) ? "left" : "right";
        if (a) {
          var room = o.sideR === "left" ? a[0] - o.sa.x0 : o.sa.x1 - a[0];
          if (room < o.bw + o.len) o.sideR = o.sideR === "left" ? "right" : "left";
        }
      }
    });
    var fixedBoxes = st.over.filter(function (o) { return o.kind !== "label" && o.kind !== "source" && o.box; }).map(function (o) { return o.box(D - 0.2); }).filter(Boolean);
    for (var pass = 0; pass < 12; pass++) {
      var moved = false;
      for (var i = 0; i < labs.length; i++) {
        var A = labs[i], ba = A.box(A.restT);
        if (!ba) continue;
        var others = fixedBoxes.slice();
        for (var j = 0; j < i; j++) { var bb = labs[j].box(labs[j].restT); if (bb && Math.abs(labs[j].at - A.at) < 1e9) others.push(bb); }
        for (var k = 0; k < others.length; k++) {
          var o2 = others[k], pad = u(12);
          var ox = Math.min(ba.x + ba.w, o2.x + o2.w) + pad - Math.max(ba.x, o2.x), oy = Math.min(ba.y + ba.h, o2.y + o2.h) + pad - Math.max(ba.y, o2.y);
          if (ox > 0 && oy > 0) {
            var dirn = ba.y + ba.h / 2 >= o2.y + o2.h / 2 ? 1 : -1;
            if (ba.y + ba.h + oy > A.sa.y1 && dirn > 0) dirn = -1;
            if (ba.y - oy < A.sa.y0 && dirn < 0) dirn = 1;
            A.dy += dirn * oy;
            ba = A.box(A.restT);
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
    placeSources();
  }
  // Headline: at most one per scene, light weight, top of the safe area unless placed.
  function say(text, o) {
    o = obj(o);
    var sa = safe(), align = o.align || "center";
    var L = layoutText(text, { size: num(o.size, u(LAND ? 64 : 62)), weight: num(o.weight, 900), maxWidth: num(o.maxWidth, sa.w * (LAND ? 0.7 : 0.96)), maxLines: num(o.maxLines, 2) });
    var x = o.x != null ? num(o.x, W / 2) : align === "left" ? sa.x0 : align === "right" ? sa.x1 : W / 2;
    var y = o.y != null ? num(o.y, sa.y0) : sa.y0 + u(6);
    if (o.valign === "bottom") y -= L.h; else if (o.valign === "middle") y -= L.h / 2;
    var ov = {
      kind: "headline", label: str(text), L: L, x: x, y: y, align: align, at: num(o.at, 0.3), until: o.until, col: colorOf(o.color, C_TEXT),
      draw: function (g, t) { if (t < this.at - 0.001) return; drawText(g, this.L, this.x, this.y, this.align, this.col, revealAlpha(t, this.at, this.until, 0.01), t, this.at, {}); },
      box: function (t) { if (t < this.at) return null; var bx = this.align === "left" ? this.x : this.align === "right" ? this.x - this.L.w : this.x - this.L.w / 2; return { x: bx, y: this.y, w: this.L.w, h: this.L.h }; },
      moving: function (t) { return t < this.at + 0.07 * this.L.n + 0.8 || (this.until != null && t > this.until); },
    };
    ov.w = L.w; ov.h = L.h;
    return addOverlay(ov);
  }
  // Generic text block (used for chart labels, points, dates). x, y = anchor; align left|center|right; valign top|middle|bottom.
  function textBlock(text, o) {
    o = obj(o);
    var L = layoutText(text, { size: num(o.size, u(30)), weight: num(o.weight, 400), maxWidth: num(o.maxWidth, W * 0.4), maxLines: num(o.maxLines, 2), upper: o.upper !== false, track: o.track, lh: o.lh, caps: o.caps });
    var align = o.align || "left", A = o.target != null ? anchorFn(o.target, o, o.view) : null;
    var ov = {
      kind: o.kind || "text", label: str(text), L: L, x: num(o.x, W / 2), y: num(o.y, H / 2), align: align, valign: o.valign || "top", at: num(o.at, 0.4), until: o.until, A: A,
      off: [num(o.dx, 0), num(o.dy, 0)], col: colorOf(o.color, C_TEXT), stagger: num(o.stagger, 0.04), sa: safe(), clampSafe: o.clamp !== false,
      pos: function (t) {
        var x = this.x, y = this.y;
        if (this.A) { var a = anchorScreen(this.A, t); if (!a) return null; x = a[0] + this.off[0]; y = a[1] + this.off[1]; }
        var top = this.valign === "middle" ? y - this.L.h / 2 : this.valign === "bottom" ? y - this.L.h : y;
        var left = this.align === "center" ? x - this.L.w / 2 : this.align === "right" ? x - this.L.w : x;
        if (this.clampSafe && this.A) {
          var nl = clamp(left, this.sa.x0, this.sa.x1 - this.L.w), nt = clamp(top, this.sa.y0, this.sa.y1 - this.L.h);
          x += nl - left; left = nl; top = nt;
        }
        return { x: x, top: top, left: left };
      },
      draw: function (g, t) { if (t < this.at - 0.001) return; var p = this.pos(t); if (!p) return; drawText(g, this.L, p.x, p.top, this.align, this.col, revealAlpha(t, this.at, this.until, 0.01), t, this.at, { stagger: this.stagger, fade: 0.6, rise: 0.18 }); },
      box: function (t) { if (t < this.at) return null; var p = this.pos(t); return p ? { x: p.left, y: p.top, w: this.L.w, h: this.L.h } : null; },
      moving: function (t) { return t < this.at + this.stagger * this.L.n + 0.6 || (this.until != null && t > this.until); },
    };
    ov.w = L.w; ov.h = L.h;
    return addOverlay(ov);
  }
  // Thin rule that draws on (dividers, lower-third accents).
  function rule(x1, y1, x2, y2, o) {
    o = obj(o);
    return addOverlay({
      kind: "rule", at: num(o.at, 0.3), dur: num(o.dur, 0.8), until: o.until, c: colorOf(o.color, C_ICE), a: num(o.alpha, 0.7), w: num(o.width, u(1.5)),
      draw: function (g, t) {
        if (t < this.at) return;
        var p = prog(t, this.at, this.dur, "inOut"), a = this.a * (this.until != null ? 1 - prog(t, this.until, 0.6, "inOut") : 1);
        g.globalAlpha = a; g.strokeStyle = rgba(this.c, 1); g.lineWidth = this.w; g.lineCap = "round";
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 + (x2 - x1) * p, y1 + (y2 - y1) * p); g.stroke();
      },
    });
  }
  // Lower third: a hairline in the accent, then the title (light) and a muted subtitle. Bottom left of the safe area.
  // Lower third: kicker, heavy caps title (emphasis stacks a bigger line), subtitle. No accent line, ever.
  function lowerThird(title, subtitle, o) {
    o = obj(o);
    var sa = safe(), at = num(o.at, 0.6), maxW = num(o.maxWidth, LAND ? sa.w * 0.58 : sa.w * 0.94);
    var Lk = o.kicker ? layoutText(o.kicker, { size: u(24), weight: 900, maxWidth: maxW, maxLines: 1, stack: false }) : null;
    var Lt = title ? layoutText(title, { size: num(o.size, u(LAND ? 76 : 80)), weight: 900, maxWidth: maxW, maxLines: 3 }) : null;
    var Ls = subtitle ? layoutText(subtitle, { size: u(LAND ? 27 : 29), weight: 800, maxWidth: maxW, maxLines: 2, stack: false }) : null;
    var gap = u(16), h = (Lk ? Lk.h + gap : 0) + (Lt ? Lt.h : 0) + (Ls ? gap + Ls.h : 0);
    var x = num(o.x, sa.x0), bottom = num(o.bottom, sa.y1), top = bottom - h;
    var w = Math.max(Lk ? Lk.w : 0, Lt ? Lt.w : 0, Ls ? Ls.w : 0);
    var ov = {
      kind: "lower-third", label: str(title || subtitle), at: at, until: o.until, x: x, top: top, h: h, w: w,
      draw: function (g, t) {
        if (t < at - 0.001) return;
        var a = this.until != null ? 1 - prog(t, this.until, 0.6, "inOut") : 1, y = top;
        if (Lk) { drawText(g, Lk, x, y, "left", C_ICE, a, t, at); y += Lk.h + gap; }
        if (Lt) { drawText(g, Lt, x, y, "left", C_TEXT, a, t, at + 0.12); y += Lt.h + gap; }
        if (Ls) drawText(g, Ls, x, y, "left", C_SUB, a, t, at + 0.45);
      },
      box: function (t) { return t < at ? null : { x: x, y: top, w: w, h: h }; },
      moving: function (t) { return t < at + 1.3 || (this.until != null && t > this.until); },
    };
    ov.h = h; ov.w = w; ov.top = top;
    return addOverlay(ov);
  }
  function fmtNum(v, dec) {
    var s = Math.abs(v).toFixed(dec), parts = s.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
  }
  // Big number: a large light numeral counting to its value, prefix (a minus is set as a true minus) and suffix or unit.
  function number(o) {
    o = obj(o);
    var sa = safe(), value = num(o.value, 0), from = num(o.from, 0), dec = clamp(Math.round(num(o.decimals, Math.abs(value % 1) > 1e-9 ? 1 : 0)), 0, 4);
    var prefix = str(o.prefix).replace(/^-$/, "\u2212"), suffix = str(o.suffix), neg = value < 0;
    if (neg && !prefix) prefix = "\u2212";
    var wordSuf = suffix.replace(/\s/g, "").length > 3;
    var size = num(o.size, u(LAND ? 240 : 220)), maxW = num(o.maxWidth, sa.w * 0.94), wt = num(o.weight, 900);
    var final = prefix + fmtNum(value, dec), sufSize = wordSuf ? size * 0.3 : size * 0.62;
    for (var i = 0; i < 20; i++) {
      var wN = tw(final, size, wt, -size * 0.02), wS = suffix ? tw(suffix, sufSize, wordSuf ? 800 : 900, 0) + size * 0.06 : 0;
      if (wN + wS <= maxW) break;
      size *= 0.93; sufSize = wordSuf ? size * 0.3 : size * 0.62;
    }
    var totalW = tw(final, size, wt, -size * 0.02) + (suffix ? tw(suffix, sufSize, wordSuf ? 800 : 900, 0) + size * 0.06 : 0);
    var cx = num(o.x, W / 2), cy = num(o.y, sa.cy), at = num(o.at, 0.4), dur = num(o.dur, 1.6), left = cx - totalW / 2, numRight = left + tw(final, size, wt, -size * 0.02);
    var ov = {
      kind: "number", label: final + suffix, at: at, until: o.until, size: size,
      draw: function (g, t) {
        if (t < at - 0.001) return;
        var a = revealAlpha(t, at, this.until, 0.5), p = prog(t, at, dur, "outQuart"), v = lerp(from, Math.abs(value) * (neg ? -1 : 1), p);
        var s = prefix + fmtNum(Math.abs(v), dec);
        g.globalAlpha = a;
        g.shadowColor = "rgba(0,0,0,0.6)"; g.shadowBlur = size * 0.12;
        setFont(g, size, wt, -size * 0.02); g.textBaseline = "alphabetic"; g.textAlign = "right"; g.fillStyle = rgba(C_TEXT, 1);
        var base = cy + size * 0.36 + (1 - prog(t, at, 0.7, "outQuart")) * size * 0.18;
        g.fillText(s, numRight, base);
        if (suffix) {
          setFont(g, sufSize, wordSuf ? 800 : 900, 0); g.textAlign = "left"; g.fillStyle = rgba(wordSuf ? C_SUB : C_ICE, 1);
          g.fillText(suffix, numRight + size * 0.06, base);
        }
        g.shadowBlur = 0;
      },
      box: function (t) { return t < at ? null : { x: left, y: cy - size * 0.38, w: totalW, h: size * 0.76 }; },
      moving: function (t) { return t < at + 0.5 || (this.until != null && t > this.until); },
    };
    ov.top = cy - size * 0.38; ov.bottom = cy + size * 0.38; ov.w = totalW;
    return addOverlay(ov);
  }

  // Source box: an on-screen citation (dark panel, thin outline, small bold SOURCE tag, the citation and an
  // optional second line). Appears on its keyword (else at 30 % of the scene) and stays to the end. The corner
  // is chosen after layout so it does not collide with the scene's other text or its subject.
  function source(o) {
    o = typeof o === "string" ? { text: o } : obj(o);
    var txt = str(o.text);
    if (!txt) return null;
    var sz = num(o.size, u(LAND ? 22 : 23)), maxW = num(o.maxWidth, u(LAND ? 520 : 620));
    var Ltag = layoutText("Source", { size: sz * 0.8, weight: 900, track: sz * 0.18, maxWidth: maxW, maxLines: 1, stack: false });
    var Lt = layoutText(txt.replace(/\*/g, ""), { size: sz, weight: 900, maxWidth: maxW, maxLines: 2, stack: false });
    var Ls = o.sub ? layoutText(str(o.sub).replace(/\*/g, ""), { size: sz * 0.86, weight: 700, maxWidth: maxW, maxLines: 2, stack: false }) : null;
    var pad = u(16), gap = u(9), w = Math.max(Ltag.w, Lt.w, Ls ? Ls.w : 0) + pad * 2, h = pad * 2 + Ltag.h + gap + Lt.h + (Ls ? gap * 0.8 + Ls.h : 0);
    var at = o.at != null ? num(o.at, D * 0.3) : (o.keyword ? kwFind(o.keyword, 0) : null);
    if (at == null) at = D * 0.3;
    at = clamp(at, 0.3, Math.max(0.3, D - 1.6));
    var sa = safe(), ov = {
      kind: "source", label: txt, at: at, w: w, h: h, corner: str(o.corner) || "auto", x: sa.x1 - w, y: sa.y1 - h,
      draw: function (g, t) {
        if (t < this.at - 0.001) return;
        // panel and text arrive together: one wipe reveals both, so an empty box is never on screen
        var p = prog(t, this.at, 0.6, "outQuart"), x = this.x, y = this.y;
        g.save();
        g.beginPath(); g.rect(x - 2, y - 2, (w + 4) * p, h + 4); g.clip();
        g.globalAlpha = 0.84; g.fillStyle = "rgba(5,8,14,1)"; g.fillRect(x, y, w, h);
        g.globalAlpha = 0.5; g.strokeStyle = "rgba(190,226,250,1)"; g.lineWidth = u(1.3); g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        g.globalAlpha = 1;
        var yy = y + pad;
        drawText(g, Ltag, x + pad, yy, "left", C_ICE, 1, t, null, { shadow: false }); yy += Ltag.h + gap;
        drawText(g, Lt, x + pad, yy, "left", C_TEXT, 1, t, null, { shadow: false }); yy += Lt.h + gap * 0.8;
        if (Ls) drawText(g, Ls, x + pad, yy, "left", C_SUB, 1, t, null, { shadow: false });
        g.restore();
      },
      box: function (t) { return t < this.at ? null : { x: this.x, y: this.y, w: w, h: h }; },
      moving: function (t) { return t < this.at + 0.9; },
    };
    return addOverlay(ov);
  }
  function placeSources() {
    var srcs = st.over.filter(function (o) { return o.kind === "source"; });
    if (!srcs.length) return;
    var sa = safe(), tR = D - 0.3, others = [];
    st.over.forEach(function (o) { if (o.kind !== "source" && o.box) { var b = o.box(Math.max(tR, (o.at || 0) + 0.01)); if (b) others.push({ b: b, k: 1 }); } });
    st.views.forEach(function (v) { v.nodes.forEach(function (n) { if (!n.subject) return; var sc = n.screen(tR); if (sc) others.push({ b: { x: sc.x - sc.r, y: sc.y - sc.r, w: sc.r * 2, h: sc.r * 2 }, k: 0.35 }); }); });
    srcs.forEach(function (sv) {
      var c = { "bottom-right": [sa.x1 - sv.w, sa.y1 - sv.h], "bottom-left": [sa.x0, sa.y1 - sv.h], "top-right": [sa.x1 - sv.w, sa.y0], "top-left": [sa.x0, sa.y0] }, best = null, bs = 1e18;
      var order = sv.corner !== "auto" && c[sv.corner] ? [sv.corner] : ["bottom-right", "top-right", "bottom-left", "top-left"];
      var hit = function (x, y) {
        var s = 0;
        others.forEach(function (ob) { var b = ob.b, ox = Math.min(x + sv.w, b.x + b.w) - Math.max(x, b.x), oy = Math.min(y + sv.h, b.y + b.h) - Math.max(y, b.y); if (ox > 0 && oy > 0) s += ox * oy * ob.k; });
        return s;
      };
      // Each corner first; when every corner hits something (a tall frame with a caption below and labels above),
      // the same corner slid up (bottom) or down (top) just clear of each box it would cover, kept in the safe area.
      // Sliding costs a little per pixel, so a free corner always wins over a free slid spot.
      var gapS = u(18);
      order.forEach(function (k, i) {
        var x = c[k][0], y0 = c[k][1], bottom = k.indexOf("bottom") === 0, cands = [y0];
        others.forEach(function (ob) {
          var b = ob.b;
          if (Math.min(x + sv.w, b.x + b.w) - Math.max(x, b.x) <= 0) return;
          cands.push(bottom ? b.y - gapS - sv.h : b.y + b.h + gapS);
        });
        cands.forEach(function (y) {
          if (y < sa.y0 - 0.5 || y + sv.h > sa.y1 + 0.5) return;
          var sc = i * 10 + Math.abs(y - y0) * 4 + hit(x, y);
          if (sc < bs) { bs = sc; best = [x, y]; }
        });
      });
      sv.x = best[0]; sv.y = best[1];
      others.push({ b: { x: sv.x, y: sv.y, w: sv.w, h: sv.h }, k: 1 });
    });
  }

  // ------------------------- mesh, ball and object nodes -------------------------
  function meshNode(mesh, m, o) {
    o = obj(o);
    var n = new Node("mesh", o);
    n.mesh = mesh; n.mat = m; n.r = mesh.r; n.opts = o;
    n.draw = function (t, C, items, X) { emitMesh(this.mesh, this.mat, t, C, items, X, this.opts); };
    return n;
  }
  function ballNode(kind, r, m, o) {
    o = obj(o);
    var n = new Node("ball", o);
    n.kind = kind; n.rad = r; n.mat = m; n.r = r; n.dof = num(o.dof, 0);
    n.draw = function (t, C, items, X) {
      emitBall(this.kind, this.mat, X.p, this.rad * X.s, C, items, X.a, { dof: this.dof || 0, bias: o.bias || 0 });
    };
    return n;
  }
  var PRIMS = {
    sphere: function (o) { return null; },
    box: function (o) { var s = scl(o.dims || [1, 1, 1]); return boxMesh(s[0] / 2, s[1] / 2, s[2] / 2, num(o.bevel, 0)); },
    rbox: function (o) { var s = scl(o.dims || [1, 1, 1]); return boxMesh(s[0] / 2, s[1] / 2, s[2] / 2, num(o.bevel, 0.08)); },
    cylinder: function (o) { return cylMesh(num(o.radius, 0.5), num(o.height, 1) / 2, Math.round(num(o.segments, 40))); },
    hexprism: function (o) { return cylMesh(num(o.radius, 0.5), num(o.height, 1) / 2, 6); },
    disc: function (o) { return cylMesh(num(o.radius, 0.6), num(o.height, 0.06) / 2, Math.round(num(o.segments, 48))); },
    plane: function (o) { var s = Array.isArray(o.dims) ? o.dims : [2, 2]; return planeMesh(num(s[0], 2) / 2, num(s[1], 2) / 2); },
    cone: function (o) { return coneMesh(num(o.radius, 0.4), num(o.height, 0.8), Math.round(num(o.segments, 32))); },
    crystal: function (o) { return crystalMesh(num(o.radius, 0.42), num(o.height, 1.24) / 2, num(o.tip, 0.36)); },
    gem: function () { return gemMesh(); },
  };
  // S.mesh(kind, opts): primitives with a material. A "bond" is a stick between opts.from and opts.to.
  function mesh(kind, o) {
    o = obj(o);
    kind = str(kind) || "sphere";
    var m = mat(o.material || "ice", o.color);
    if (kind === "sphere" || kind === "drop") return ballNode(kind, num(o.radius, 0.5), m, o);
    if (kind === "bond") {
      var a = vec(o.from), b = vec(o.to, [0, 1, 0]), r = num(o.radius, 0.08), n = new Node("bond", o);
      n.r = vlen(sub(b, a)) / 2; n.col = colorOf(o.color, [0.82, 0.86, 0.9]);
      n.draw = function (t, C, items, X) { emitBond(C, add(X.p, mv(X.M, a)), add(X.p, mv(X.M, b)), r * X.s, this.col, X.a, items); };
      return n;
    }
    var mk = PRIMS[kind] || PRIMS.box;
    return meshNode(mk(o), m, o);
  }
  var OBJ_NAMES = ["ice-cube", "glass-cube", "sphere", "drop", "crystal", "gem", "coin", "cylinder", "skate-blade", "boot-sole", "snowflake"];
  var OBJ_MAT = { "ice-cube": "ice", "glass-cube": "glass", sphere: "glass", drop: "water", crystal: "ice", gem: "glass", coin: "metal", cylinder: "metal", "skate-blade": "metal", "boot-sole": "rubber", snowflake: "ice" };
  var OBJ_ALIAS = { ice: "ice-cube", cube: "ice-cube", "ice cube": "ice-cube", glass: "glass-cube", ball: "sphere", water: "drop", droplet: "drop", "water-drop": "drop", diamond: "gem", jewel: "gem", quartz: "crystal", blade: "skate-blade", skate: "skate-blade", boot: "boot-sole", sole: "boot-sole", shoe: "boot-sole", flake: "snowflake", can: "cylinder", rod: "cylinder", penny: "coin" };
  function objKey(v, def) { v = str(v).toLowerCase(); if (OBJ_NAMES.indexOf(v) >= 0) return v; if (OBJ_ALIAS[v]) return OBJ_ALIAS[v]; return def || "ice-cube"; }
  function bladeOutline() {
    var p = [], i;
    for (i = 0; i <= 12; i++) { var x = -1.32 + (2.5 * i) / 12; p.push([x, -0.06 + 0.06 * Math.pow(x / 1.3, 2)]); }
    for (i = 1; i <= 6; i++) { var a = -PI / 2 + (i / 6) * PI * 0.62; p.push([1.18 + Math.cos(a) * 0.26, 0.2 + Math.sin(a) * 0.26]); }
    p.push([0.9, 0.24], [-1.4, 0.24], [-1.42, 0.02]);
    return p;
  }
  function soleOutline(inner) {
    var top = [], bot = [], N = 26;
    for (var i = 0; i <= N; i++) {
      var x = -1.05 + (2.15 * i) / N, s = (x - 0.025) / 1.075, ef = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(s), 4)), 0.5);
      var hw = 0.27 + 0.1 * Math.exp(-Math.pow((x - 0.55) / 0.35, 2)) - 0.03 * Math.exp(-Math.pow((x + 0.1) / 0.3, 2));
      var hi = hw - 0.07 * Math.exp(-Math.pow((x + 0.05) / 0.32, 2));
      top.push([x, ef * hw * inner]); bot.unshift([x, -ef * hi * inner]);
    }
    return top.concat(bot);
  }
  function inclusionsNode(rnd, R, count) {
    var pts = [];
    for (var i = 0; i < count; i++) {
      var p = [rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1];
      if (vlen(p) > 1) { i--; continue; }
      var cl = rnd() < 0.6;
      pts.push({ p: mul(p, R * (cl ? 0.42 : 0.85)), s: R * (0.006 + rnd() * rnd() * 0.03), a: 0.2 + rnd() * 0.45 });
    }
    var n = new Node("inclusions", {});
    n.r = R;
    n.draw = function (t, C, items, X) {
      var img = bubbleSpr();
      for (var i = 0; i < pts.length; i++) {
        var w = add(X.p, mv(X.M, pts[i].p)), q = toView(C, w);
        if (q[2] < C.near) continue;
        var s = projQ(C, q), r = Math.max(0.8, (C.F * pts[i].s * X.s) / q[2]);
        items.push({ t: 1, z: q[2], img: img, x: s[0] - r, y: s[1] - r, w: r * 2, h: r * 2, a: X.a * pts[i].a });
      }
      var qc = toView(C, X.p);
      if (qc[2] > C.near) {
        var sc = projQ(C, qc), rc = (C.F * R * 0.85 * X.s) / qc[2];
        items.push({ t: 1, z: qc[2] + R * 0.1 * X.s, img: glowSpr([0.86, 0.94, 1]), x: sc[0] - rc, y: sc[1] - rc, w: rc * 2, h: rc * 2, a: X.a * 0.4 });
      }
    };
    return n;
  }
  // S.object(name, opts): one of the named studio objects, built from meshes and impostors. Returns a node (radius ~1).
  function object3d(name, o) {
    o = obj(o);
    name = objKey(name);
    var mname = matKey(o.material, OBJ_MAT[name]), m = mat(mname, o.color), rnd = V.makeRand(num(o.seed, 7) + name.length * 31);
    var root = new Node("object", o), inner = root.add(new Node("rest", {})), R = 1;
    root.label = name; root.objName = name; root.matName = mname;
    var rest = [0, 0, 0];
    if (name === "ice-cube" || name === "glass-cube") {
      var bev = name === "ice-cube" ? 0.1 : 0.035;
      inner.add(meshNode(boxMesh(0.6, 0.6, 0.6, bev), m, { glint: 1.2 }));
      if (mname === "ice") inner.add(inclusionsNode(rnd, 0.6, 70));
      rest = [-14, 32, 5]; R = 1.0;
    } else if (name === "sphere" || name === "drop") {
      var rr = name === "drop" ? 0.9 : 0.82;
      inner.add(ballNode(name, rr, m, {}));
      if (mname === "ice") inner.add(inclusionsNode(rnd, rr * 0.8, 26));
      R = rr;
    } else if (name === "crystal") {
      inner.add(meshNode(crystalMesh(0.4, 0.62, 0.34), m, {}));
      rest = [10, 0, -18]; R = 1.0;
    } else if (name === "gem") {
      inner.add(meshNode(gemMesh(), m, { glint: 1.4 }));
      rest = [-12, 0, 0]; R = 1.0;
    } else if (name === "coin") {
      inner.add(meshNode(cylMesh(0.86, 0.065, 72), m, {}));
      var ring = inner.add(new Node("decal", {}));
      ring.draw = function (t, C, items, X) {
        [0.065, -0.065].forEach(function (yy, side) {
          var nw = nrm(mv(X.M, [0, side ? -1 : 1, 0])), cpt = add(X.p, mv(X.M, [0, yy, 0])), q = toView(C, cpt);
          if (dot(dirView(C, nw), nrm(mul(q, -1))) <= 0.02) return;
          [[0.78, 0.5], [0.72, 0.25]].forEach(function (rc) {
            var pts = [];
            for (var k = 0; k <= 48; k++) { var a = (k / 48) * TAU, s = project(C, add(X.p, mv(X.M, [Math.cos(a) * rc[0], yy * 1.02, Math.sin(a) * rc[0]]))); if (!s) return; pts.push([s[0], s[1]]); }
            items.push({ t: 3, z: q[2] - 1e-3, pts: pts, c: "rgba(255,255,255,1)", w: u(1.4), a: X.a * rc[1] });
          });
          var hx = [];
          for (var k2 = 0; k2 <= 6; k2++) { var b = (k2 / 6) * TAU + PI / 6, s2 = project(C, add(X.p, mv(X.M, [Math.cos(b) * 0.36, yy * 1.02, Math.sin(b) * 0.36]))); if (s2) hx.push([s2[0], s2[1]]); }
          if (hx.length === 7) items.push({ t: 3, z: q[2] - 1e-3, pts: hx, c: "rgba(255,255,255,1)", w: u(1.6), a: X.a * 0.45 });
        });
      };
      rest = [72, 0, 8]; R = 0.9;
    } else if (name === "cylinder") {
      inner.add(meshNode(cylMesh(0.5, 0.72, 48), m, {}));
      rest = [12, 0, 0]; R = 0.9;
    } else if (name === "skate-blade") {
      inner.add(meshNode(extrudeMesh(bladeOutline(), 0.05, "z"), m, {}));
      inner.add(meshNode(extrudeMesh([[-1.3, 0.22], [1.0, 0.22], [0.86, 0.6], [0.42, 0.6], [0.3, 0.4], [-0.5, 0.4], [-0.62, 0.6], [-1.16, 0.6]], 0.16, "z"), mat("matte", "#4C5560"), {}));
      rest = [8, -28, 0]; R = 1.45;
    } else if (name === "boot-sole") {
      var rub = mat(mname, o.color || "#3A4048");
      inner.add(meshNode(extrudeMesh(soleOutline(1), 0.16, "y"), rub, { pos: [0, 0.02, 0] }));
      inner.add(meshNode(extrudeMesh(soleOutline(0.985), 0.1, "y"), mat("matte", "#7A838F"), { pos: [0, 0.15, 0] }));
      var lugs = [];
      for (var lx = -0.92; lx <= 0.98; lx += 0.2) {
        for (var lz = -0.3; lz <= 0.34; lz += 0.16) {
          var s = (lx - 0.025) / 1.075, ef = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(s), 4)), 0.5), hw = (0.25 + 0.1 * Math.exp(-Math.pow((lx - 0.55) / 0.35, 2))) * ef;
          if (Math.abs(lz) > hw - 0.06) continue;
          lugs.push({ mesh: boxMesh(0.06, 0.035, 0.05, 0.01), pos: [lx, -0.09, lz], rot: [0, ((Math.round(lx * 5) + Math.round(lz * 6)) % 2 ? 1 : -1) * 28, 0] });
        }
      }
      if (lugs.length) inner.add(meshNode(meshMerge(lugs), mat("rubber", "#30353C"), {}));
      rest = [-62, 18, 0]; R = 1.15;
    } else if (name === "snowflake") {
      var parts = [{ mesh: cylMesh(0.2, 0.025, 6), rot: [90, 0, 0] }];
      for (var arm = 0; arm < 6; arm++) {
        var ang = arm * 60;
        var Ra = rot(0, 0, ang);
        parts.push({ mesh: boxMesh(0.43, 0.035, 0.022, 0), pos: mv(Ra, [0.6, 0, 0]), rot: [0, 0, ang] });
        [[0.42, 0.26], [0.64, 0.19], [0.84, 0.11]].forEach(function (br) {
          [-1, 1].forEach(function (sg) {
            var a2 = ang + sg * 60, base = mv(Ra, [br[0], 0, 0]), dir = mv(rot(0, 0, a2), [1, 0, 0]);
            parts.push({ mesh: boxMesh(br[1] / 2, 0.025, 0.018, 0), pos: add(base, mul(dir, br[1] / 2)), rot: [0, 0, a2] });
          });
        });
      }
      inner.add(meshNode(meshMerge(parts), m, { glints: false }));
      rest = [-8, 18, 0]; R = 1.08;
    }
    if (Array.isArray(o.rest)) rest = vec(o.rest);
    inner.base.rot = rest;
    // Long or flat objects would turn edge-on in a full turntable spin: they sway instead.
    if (name === "boot-sole" || name === "skate-blade" || name === "snowflake") {
      root.spin = function (dps, axis) {
        if (axis && axis !== "y") { Node.prototype.spin.call(this, dps, axis); return this; }
        var amp = name === "snowflake" ? 26 : 24, per = 18;
        if (name === "snowflake") this.spinV[2] = num(dps, 8) * 0.5;
        this.hook(function (t, st2) { st2.rot[1] += amp * Math.sin((TAU * t) / per); });
        return this;
      };
    }
    var TOPS = { "ice-cube": 0.6, "glass-cube": 0.6, sphere: 0.8, drop: 0.86, crystal: 0.9, gem: 0.36, coin: 0.8, cylinder: 0.74, "skate-blade": 0.56, "boot-sole": 0.5, snowflake: 0.86 };
    root.top = (TOPS[name] || 0.7) * (name === "sphere" || name === "drop" ? R / 0.85 : 1);
    root.r = R;
    // Lowest point after the rest tilt (a spin about the vertical axis never changes it): the floor goes here.
    var Rr = rot(rest[0], rest[1], rest[2]), lo = 0;
    inner.kids.forEach(function (k) {
      if (k.mesh) k.mesh.v.forEach(function (v) { lo = Math.min(lo, mv(Rr, add(v, k.base.pos))[1]); });
      else if (k.type === "ball") lo = Math.min(lo, -k.rad);
    });
    root.lo = lo || -R * 0.8;
    return root;
  }

  // ------------------------- atoms and molecules -------------------------
  var ELEM = {
    H: { c: "#E9EEF3", r: 0.25 }, O: { c: "#D2553E", r: 0.4 }, C: { c: "#3B4148", r: 0.42 }, N: { c: "#5C7FD8", r: 0.41 },
    S: { c: "#D9B44A", r: 0.5 }, Cl: { c: "#79B86A", r: 0.48 }, Na: { c: "#A88AD6", r: 0.5 }, F: { c: "#9CCB6A", r: 0.36 }, P: { c: "#E08A3C", r: 0.48 },
  };
  function elem(e) { e = str(e); var k = e.charAt(0).toUpperCase() + e.slice(1).toLowerCase(); return ELEM[k] ? k : ELEM[e.toUpperCase()] ? e.toUpperCase() : "C"; }
  function atomMat(el) { return mat("gloss", (ELEM[el] || ELEM.C).c); }
  var BOND_COL = [0.8, 0.84, 0.88];
  var PRESETS = {
    water: [["O", 0, 0, 0], ["H", 0.757, -0.586, 0], ["H", -0.757, -0.586, 0]],
    "carbon-dioxide": [["C", 0, 0, 0], ["O", 1.16, 0, 0], ["O", -1.16, 0, 0]],
    methane: [["C", 0, 0, 0], ["H", 0.629, 0.629, 0.629], ["H", 0.629, -0.629, -0.629], ["H", -0.629, 0.629, -0.629], ["H", -0.629, -0.629, 0.629]],
    ammonia: [["N", 0, 0.12, 0], ["H", 0.94, -0.26, 0], ["H", -0.47, -0.26, 0.814], ["H", -0.47, -0.26, -0.814]],
    oxygen: [["O", 0.605, 0, 0], ["O", -0.605, 0, 0]],
    hydrogen: [["H", 0.37, 0, 0], ["H", -0.37, 0, 0]],
  };
  // Positions for a list of atoms with no coordinates: the first is the centre, the rest sit around it (VSEPR-like).
  function autoPlace(list) {
    var dirs = { 1: [[1, 0, 0]], 2: [[1, 0, 0], [-1, 0, 0]], 3: [[1, 0, 0], [-0.5, 0.866, 0], [-0.5, -0.866, 0]], 4: [[0.577, 0.577, 0.577], [0.577, -0.577, -0.577], [-0.577, 0.577, -0.577], [-0.577, -0.577, 0.577]] };
    var n = list.length - 1, ds = dirs[n] || null;
    return list.map(function (a, i) {
      if (i === 0) return [0, 0, 0];
      var d = ds ? ds[i - 1] : [Math.cos((i / n) * TAU), Math.sin((i / n) * TAU) * 0.6, Math.sin((i / n) * TAU) * 0.8];
      var bl = (ELEM[list[0].el].r + ELEM[a.el].r) * 1.75;
      return mul(nrm(d), bl);
    });
  }
  // S.molecule(opts): ball-and-stick molecule node. preset or atoms [{element, x, y, z}], bonds [[i, j]].
  function molecule(o) {
    o = obj(o);
    var preset = str(o.preset).toLowerCase(), atoms = [];
    if (PRESETS[preset] && !arr(o.atoms).length) atoms = PRESETS[preset].map(function (a) { return { el: a[0], p: [a[1], a[2], a[3]] }; });
    else {
      var list = arr(o.atoms).slice(0, 24).map(function (a) { a = typeof a === "string" ? { element: a } : obj(a); return { el: elem(a.element || a.el || a.symbol), raw: a }; });
      if (!list.length) list = PRESETS.water.map(function (a) { return { el: a[0], raw: { x: a[1], y: a[2], z: a[3] } }; });
      var has = list.every(function (a) { return isFinite(+a.raw.x) && isFinite(+a.raw.y); });
      var auto = has ? null : autoPlace(list);
      atoms = list.map(function (a, i) { return { el: a.el, p: has ? [num(a.raw.x, 0), num(a.raw.y, 0), num(a.raw.z, 0)] : auto[i] }; });
    }
    var c = [0, 0, 0];
    atoms.forEach(function (a) { c = add(c, a.p); });
    c = mul(c, 1 / atoms.length);
    atoms.forEach(function (a) { a.p = sub(a.p, c); a.r = ELEM[a.el].r * num(o.atomScale, 1); a.m = atomMat(a.el); });
    var bonds = arr(o.bonds).filter(function (b) { return Array.isArray(b) && atoms[b[0]] && atoms[b[1]] && b[0] !== b[1]; });
    if (!bonds.length) {
      for (var i = 0; i < atoms.length; i++) for (var j = i + 1; j < atoms.length; j++) {
        var dd = vlen(sub(atoms[i].p, atoms[j].p));
        if (dd < (ELEM[atoms[i].el].r + ELEM[atoms[j].el].r) * 2.25 && !(atoms[i].el === "H" && atoms[j].el === "H" && atoms.length > 2)) bonds.push([i, j]);
      }
    }
    var R = 0;
    atoms.forEach(function (a) { R = Math.max(R, vlen(a.p) + a.r); });
    var n = new Node("molecule", o);
    n.atoms = atoms; n.bonds = bonds; n.r = R; n.dof = num(o.dof, 0); n.bondR = num(o.bondRadius, 0.085);
    n.glowAt = null; n.highlight = o.highlight;
    n.draw = function (t, C, items, X) {
      var self = this, sp = [];
      self.atoms.forEach(function (a, i) {
        var vib = self.vibrate * (i ? 1 : 0.3), f = 1 + 0.03 * vib * Math.sin(t * 7.1 + i * 1.9);
        var w = add(X.p, mv(X.M, add(mul(a.p, f), [0.012 * vib * Math.sin(t * 5.3 + i), 0.012 * vib * Math.sin(t * 6.1 + i * 2), 0])));
        sp[i] = w;
        emitBall("sphere", a.m, w, a.r * X.s, C, items, X.a, { dof: self.dof });
      });
      self.bonds.forEach(function (b) { emitBond(C, sp[b[0]], sp[b[1]], self.bondR * X.s, BOND_COL, X.a, items, 1e-4); });
      if (self.charge) {
        var g = self.charge(t);
        if (g > 0.01) self.atoms.forEach(function (a, i) {
          var neg = a.el === "O" || a.el === "N" || a.el === "F" || a.el === "Cl";
          emitGlow(C, sp[i], a.r * X.s * 2.6, neg ? C_CORAL : C_ICE, g * X.a * 0.55, items, a.r * X.s * 1.2);
        });
      }
    };
    n.vibrate = num(o.vibrate, 1);
    n.atomWorld = function (t, i) { var X = this.worldXf(t); return add(X.p, mv(X.M, (this.atoms[i] || this.atoms[0]).p)); };
    return n;
  }

  // ------------------------- ice lattice (hexagonal ice, ball-and-stick water) -------------------------
  // Bilayers of puckered honeycombs stacked so the hexagonal channels line up (ice Ih). Each oxygen has 4
  // neighbours; every O-O link carries exactly one hydrogen, and every oxygen owns exactly two (ice rules).
  function iceStructure(o) {
    var layers = clamp(Math.round(num(o.layers, 3)), 1, 5), ring = clamp(num(o.radius, 2.6), 1.2, 5);
    var b = 2.6, dz = 0.92, cH = 3.68, OH = 0.96, s3 = Math.sqrt(3) / 2;
    var d = [[0, b], [b * s3, -b / 2], [-b * s3, -b / 2]];
    var a1 = [d[0][0] - d[1][0], d[0][1] - d[1][1]], a2 = [d[0][0] - d[2][0], d[0][1] - d[2][1]];
    var Rm = ring * b * 1.732, N = Math.ceil(ring) + 3, mols = [], index = {};
    var hexR = function (x, z) { var ax = Math.abs(x), az = Math.abs(z); return Math.max(az * 0.5 + ax * s3, az); };
    for (var k = 0; k < layers; k++) {
      for (var nn = -N; nn <= N; nn++) for (var mm2 = -N; mm2 <= N; mm2++) {
        for (var sub2 = 0; sub2 < 2; sub2++) {
          var x = nn * a1[0] + mm2 * a2[0] + (sub2 ? d[0][0] : 0) + d[0][0], z = nn * a1[1] + mm2 * a2[1] + (sub2 ? d[0][1] : 0) + d[0][1];
          if (hexR(x, z) > Rm) continue;
          var upper = (k % 2 === 0) ? sub2 === 1 : sub2 === 0;
          var y = k * cH + (upper ? dz : 0);
          var key = k + "," + nn + "," + mm2 + "," + sub2;
          index[key] = mols.length;
          mols.push({ key: key, k: k, n: nn, m: mm2, sub: sub2, upper: upper, O: [x, y, z] });
        }
      }
    }
    var cy = ((layers - 1) * cH + dz) / 2;
    mols.forEach(function (mo) { mo.O[1] -= cy; });
    function nb(mo, idx) {
      if (mo.sub === 0) return idx === 0 ? [mo.n, mo.m, 1] : idx === 1 ? [mo.n - 1, mo.m, 1] : [mo.n, mo.m - 1, 1];
      return idx === 0 ? [mo.n, mo.m, 0] : idx === 1 ? [mo.n + 1, mo.m, 0] : [mo.n, mo.m + 1, 0];
    }
    var hb = [];
    mols.forEach(function (mo) {
      var sg = mo.sub === 0 ? 1 : -1, vy = mo.upper ? -dz : dz, own = mo.upper ? [0] : [1, 2], dirs = [];
      own.forEach(function (idx) {
        var dv = nrm([sg * d[idx][0], vy, sg * d[idx][1]]), q = nb(mo, idx);
        dirs.push({ v: dv, other: index[mo.k + "," + q[0] + "," + q[1] + "," + q[2]] });
      });
      if (mo.upper) dirs.push({ v: [0, 1, 0], other: index[(mo.k + 1) + "," + mo.n + "," + mo.m + "," + mo.sub] });
      mo.H = dirs.slice(0, 2).map(function (dd) { return mul(dd.v, OH); });
      mo.Hto = dirs.slice(0, 2).map(function (dd) { return dd.other; });
      mo.Hto.forEach(function (oi, hi) { if (oi != null) hb.push([mols.indexOf(mo), hi, oi]); });
    });
    var maxR = 0;
    mols.forEach(function (mo) { maxR = Math.max(maxR, Math.hypot(mo.O[0], mo.O[2])); });
    return { mols: mols, hb: hb, layers: layers, R: maxR + 1.2, H: (layers - 1) * cH + dz + 2, top: (layers - 1) * cH + dz - cy, bottom: -cy };
  }
  // S.lattice(opts): returns a node. Lattice units are angstroms times opts.scale (default 0.28).
  function lattice(o) {
    o = obj(o);
    var S0 = iceStructure(o), sc = num(o.scale, 0.28), rnd = V.makeRand(num(o.seed, 19));
    var n = new Node("lattice", o);
    n.base.scale = scl(o.nodeScale != null ? o.nodeScale : 1);
    n.S = S0; n.sc = sc; n.r = Math.sqrt(S0.R * S0.R + (S0.H / 2) * (S0.H / 2)) * sc; n.dof = num(o.dof, 0.9);
    n.mO = atomMat("O"); n.mH = atomMat("H");
    n.rO = num(o.oxygenRadius, 0.46); n.rH = num(o.hydrogenRadius, 0.27); n.stick = 0.1;
    n.hbonds = o.hbonds !== false; n.highlight = str(o.highlight);
    var b0 = num(o.buildFrom, 0.1), b1 = num(o.buildTo, b0 + 1.2), order = S0.mols.map(function (mo, i) { return i; });
    order.sort(function (a, b) { var A = S0.mols[a], B = S0.mols[b]; return A.k - B.k || Math.hypot(A.O[0], A.O[2]) - Math.hypot(B.O[0], B.O[2]); });
    order.forEach(function (mi, r) { S0.mols[mi].tb = b0 + ((b1 - b0) * r) / Math.max(1, order.length - 1); });
    // disorder: top bilayers turn liquid-like (offsets, tilts, broken hydrogen bonds, thermal motion)
    n.disAmt = clamp(num(o.disorder, 0), 0, 1); n.disT = num(o.disorderAt, D * 0.5); n.disLayers = clamp(Math.round(num(o.disorderLayers, 1)), 1, S0.layers);
    n.disDur = num(o.disorderDur, 1.8);
    S0.mols.forEach(function (mo) {
      mo.off = mul([rnd() * 2 - 1, (rnd() * 2 - 1) * 0.6 + 0.35, rnd() * 2 - 1], 1.25);
      mo.ax = nrm([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]); mo.ang = (rnd() * 2 - 1) * 1.4;
      mo.ph = [rnd() * TAU, rnd() * TAU, rnd() * TAU]; mo.fr = 2 + rnd() * 2.5;
    });
    n.disorderOf = function (t, mo) {
      if (this.disAmt <= 0 || mo.k < this.S.layers - this.disLayers) return 0;
      var depth = this.S.layers - 1 - mo.k;
      return this.disAmt * prog(t, this.disT - 0.4 + depth * 0.25, this.disDur, "sine") * (depth ? 0.55 : 1);
    };
    n.molLocal = function (t, mo) {
      var dis = this.disorderOf(t, mo), O = mo.O.slice(), bp = prog(t, mo.tb, 0.6, "out");
      O[1] += (1 - bp) * 1.4;
      var H = mo.H, th0 = 0.07;
      O = add(O, [Math.sin(t * mo.fr * 0.8 + mo.ph[0]) * th0, Math.sin(t * mo.fr * 0.7 + mo.ph[1]) * th0, Math.sin(t * mo.fr * 0.9 + mo.ph[2]) * th0]);
      H = H.map(function (h) { return axisRot(h, mo.ax, 0.08 * Math.sin(t * 1.7 + mo.ph[2])); });
      if (dis > 0) {
        var th = 0.22 * dis;
        O = add(O, add(mul(mo.off, dis), [Math.sin(t * mo.fr + mo.ph[0]) * th, Math.sin(t * mo.fr * 1.1 + mo.ph[1]) * th, Math.sin(t * mo.fr * 0.9 + mo.ph[2]) * th]));
        var ang = mo.ang * dis + 0.25 * dis * Math.sin(t * 1.3 + mo.ph[0]);
        H = H.map(function (h) { return axisRot(h, mo.ax, ang); });
      }
      return { O: O, H: [add(O, H[0]), add(O, H[1])], a: bp, dis: dis };
    };
    n.world = function (X, p) { return add(X.p, mv(X.M, mul(p, this.sc))); };
    n.draw = function (t, C, items, X) {
      var self = this, mols = self.S.mols, rs = self.sc * X.s, cache = new Array(mols.length), top = self.S.layers - 1;
      for (var i = 0; i < mols.length; i++) {
        var mo = mols[i];
        if (t < mo.tb - 0.01) continue;
        var L = self.molLocal(t, mo);
        if (L.a <= 0.01) continue;
        var hl = self.highlight, la = 1;
        if (hl === "top" || hl === "bottom") la = (hl === "top" ? mo.k === top : mo.k === 0) ? 1 : 0.42;
        var a = X.a * L.a * la, Ow = self.world(X, L.O), H1 = self.world(X, L.H[0]), H2 = self.world(X, L.H[1]);
        cache[i] = { O: Ow, H: [H1, H2], a: a, dis: L.dis };
        emitBall("sphere", self.mO, Ow, self.rO * rs, C, items, a, { dof: self.dof });
        emitBall("sphere", self.mH, H1, self.rH * rs, C, items, a, { dof: self.dof });
        emitBall("sphere", self.mH, H2, self.rH * rs, C, items, a, { dof: self.dof });
        emitBond(C, Ow, H1, self.stick * rs, BOND_COL, a, items, 1e-4);
        emitBond(C, Ow, H2, self.stick * rs, BOND_COL, a, items, 1e-4);
        if (la === 1 && (hl === "top" || hl === "bottom")) emitGlow(C, Ow, self.rO * rs * 2.4, C_ICE, a * 0.16, items, self.rO * rs * 2);
      }
      if (!self.hbonds) return;
      var dash = [u(4), u(5)];
      for (var j = 0; j < self.S.hb.length; j++) {
        var hb = self.S.hb[j], A = cache[hb[0]], B = cache[hb[2]];
        if (!A || !B) continue;
        var br = 1 - clamp(Math.max(A.dis, B.dis) * 1.2, 0, 1), al = Math.min(A.a, B.a) * br * 0.75;
        if (al < 0.02) continue;
        emitLine(C, A.H[hb[1]], B.O, rgba(C_ICE, 1), u(1.4), al, items, dash, 2e-4);
      }
    };
    // Named anchor points (world) for labels: top-layer, bottom-layer, molecule, oxygen, hydrogen, bond, hydrogen-bond, surface.
    n.pick = function (where) {
      var mols = this.S.mols, top = this.S.layers - 1, best = 0, bs = -1e9, want;
      where = str(where) || "molecule";
      var lay = where === "bottom-layer" ? 0 : where === "molecule" || where === "oxygen" || where === "hydrogen" || where === "bond" || where === "hydrogen-bond" ? Math.min(top, Math.max(0, Math.floor(top / 2))) : top;
      want = where === "bottom-layer" ? [-0.7, 0, 0.55] : where === "top-layer" || where === "surface" || where === "liquid-layer" ? [0.75, 0, 0.45] : [0.05, 0, 0.9];
      var R = this.S.R;
      mols.forEach(function (mo, i) {
        if (mo.k !== lay) return;
        var s = (mo.O[0] * want[0] + mo.O[2] * want[2]) / R - Math.abs(Math.hypot(mo.O[0], mo.O[2]) / R - 0.72) * 0.6 + (mo.upper ? 0.05 : 0);
        if (s > bs) { bs = s; best = i; }
      });
      return best;
    };
    n.anchor = function (where) {
      var self = this, mi = self.pick(where);
      return function (t) {
        var X = self.worldXf(t), L = self.molLocal(t, self.S.mols[mi]);
        if (where === "hydrogen") return self.world(X, L.H[0]);
        if (where === "bond") return self.world(X, vlerp(L.O, L.H[0], 0.55));
        if (where === "hydrogen-bond") {
          var mo = self.S.mols[mi], oi = mo.Hto[0] != null ? mo.Hto[0] : mo.Hto[1];
          if (oi != null) { var L2 = self.molLocal(t, self.S.mols[oi]); return self.world(X, vlerp(L.H[mo.Hto[0] != null ? 0 : 1], L2.O, 0.5)); }
        }
        return self.world(X, L.O);
      };
    };
    n.topY = S0.top * sc; n.bottomY = S0.bottom * sc; n.radiusXZ = S0.R * sc;
    return n;
  }

  // ------------------------- particle fields -------------------------
  // S.particles(opts): many small glossy spheres (or water molecules) with a behaviour.
  function particles(o) {
    o = obj(o);
    var beh = str(o.behaviour || o.behavior || "jitter").toLowerCase();
    if (["roll", "jitter", "flow", "settle", "scatter"].indexOf(beh) < 0) beh = "jitter";
    var count = Math.round(clamp(num(o.count, 90), 6, 260)), rp = num(o.radius, 0.16), rnd = V.makeRand(num(o.seed, 23));
    var mk = matKey(o.material, ""), m = mk ? mat(mk, o.color) : mat("gloss", o.color || "#A9DDF2");
    var water = str(o.particle) === "water", ext = num(o.extent, 2.4), sp = rp * 2.15, pts = [];
    var cols = Math.max(2, Math.round((ext * 2) / sp)), rowsZ = Math.max(2, Math.round((ext * 1.3) / (sp * 0.866))), perLayer = cols * rowsZ;
    for (var i = 0; i < count; i++) {
      var layer = Math.floor(i / perLayer), j = i % perLayer, cx = j % cols, cz = Math.floor(j / cols);
      var site = [-ext + sp / 2 + cx * sp + (cz % 2 ? sp / 2 : 0) + (layer % 2 ? sp / 4 : 0), rp + layer * sp * 0.82, -ext * 0.65 + sp / 2 + cz * sp * 0.866 + (layer % 2 ? sp * 0.29 : 0)];
      var rand = [(rnd() * 2 - 1) * ext, rp + rnd() * ext * 0.9, (rnd() * 2 - 1) * ext * 0.65];
      pts.push({ site: site, rand: rand, layer: layer, ph: [rnd() * TAU, rnd() * TAU, rnd() * TAU], fr: 4 + rnd() * 5, del: rnd(), spd: 0.7 + rnd() * 0.6, rot: rnd() * 360, ax: nrm([rnd() - 0.5, rnd() - 0.5, rnd() - 0.5]) });
    }
    var n = new Node("particles", o);
    n.pts = pts; n.r = ext * 1.15; n.beh = beh; n.m = m; n.m2 = mk ? m : mat("gloss", "#E3F4FF"); n.rp = rp; n.dof = num(o.dof, 0.8);
    n.kT = num(o.at, D * 0.4); n.ext = ext;
    var mO = atomMat("O"), mH = atomMat("H");
    n.posOf = function (t, p) {
      var k = prog(t, this.kT - 0.3, 1.6, "sine"), e = this.ext;
      if (this.beh === "jitter") {
        var amp = rp * (0.12 + 0.55 * k);
        return add(p.site, [Math.sin(t * p.fr + p.ph[0]) * amp, Math.sin(t * p.fr * 1.13 + p.ph[1]) * amp * 0.8, Math.sin(t * p.fr * 0.87 + p.ph[2]) * amp]);
      }
      if (this.beh === "settle" || this.beh === "scatter") {
        var q = prog(t, this.kT - 0.4 + p.del * 0.8, 1.5, "inOut");
        if (this.beh === "scatter") q = 1 - q;
        var drift = (1 - q) * rp * 0.5;
        var base = vlerp(p.rand, p.site, q);
        return add(base, [Math.sin(t * 0.9 + p.ph[0]) * drift, Math.sin(t * 0.8 + p.ph[1]) * drift, Math.sin(t * 0.7 + p.ph[2]) * drift]);
      }
      if (this.beh === "roll") {
        if (p.layer === 0) return p.site;
        var x = -e + ((p.site[0] + e + this.rollDist(t) * p.spd) % (2 * e) + 2 * e) % (2 * e);
        var bump = Math.abs(Math.sin((PI * (x + e)) / sp)) * rp * 0.18;
        return [x, rp + sp * 0.82 + bump, p.site[2]];
      }
      var fx = -e + ((((p.rand[0] + e) + t * 0.55 * p.spd) % (2 * e)) + 2 * e) % (2 * e);
      return [fx, p.rand[1] + Math.sin(t * 0.8 + p.ph[0] + fx) * rp * 0.8, p.rand[2] + Math.sin(t * 0.6 + p.ph[1]) * rp * 0.5];
    };
    n.rollDist = function (t) {
      var a = this.kT - 0.3, v0 = 0.1, v1 = 0.6;
      if (t <= a) return v0 * t;
      var d = Math.min(t - a, 1.6), ramp = v0 * d + (v1 - v0) * (d - (1.6 / PI) * Math.sin((PI * d) / 1.6)) / 2;
      return v0 * a + ramp + (t > a + 1.6 ? v1 * (t - a - 1.6) : 0);
    };
    n.draw = function (t, C, items, X) {
      var self = this, e = self.ext;
      for (var i = 0; i < self.pts.length; i++) {
        var p = self.pts[i], lp = self.posOf(t, p), edge = 1;
        if (self.beh === "roll" || self.beh === "flow") edge = sstep(-e, -e + rp * 3, lp[0]) * (1 - sstep(e - rp * 3, e, lp[0]));
        var a = X.a * edge;
        if (a < 0.01) continue;
        var w = add(X.p, mv(X.M, lp));
        if (water) {
          var Rm = rot(0, p.rot + t * 20 * p.spd, p.rot * 0.5), s = X.s * rp * 1.2;
          var hA = add(w, mv(X.M, mv(Rm, [0.757 * rp * 1.25, -0.586 * rp * 1.25, 0]))), hB = add(w, mv(X.M, mv(Rm, [-0.757 * rp * 1.25, -0.586 * rp * 1.25, 0])));
          emitBall("sphere", mO, w, s * 0.62, C, items, a, { dof: self.dof });
          emitBall("sphere", mH, hA, s * 0.4, C, items, a, { dof: self.dof });
          emitBall("sphere", mH, hB, s * 0.4, C, items, a, { dof: self.dof });
        } else emitBall("sphere", p.layer > 0 && self.beh === "roll" ? self.m2 : self.m, w, rp * X.s, C, items, a, { dof: self.dof });
      }
    };
    n.anchorAt = function (which) {
      var self = this;
      return function (t) {
        var X = self.worldXf(t), e = self.ext;
        if (which === "surface") return add(X.p, mv(X.M, [e * 0.55, 0, e * 0.4]));
        if (which === "left") return add(X.p, mv(X.M, [-e * 0.6, self.rp * 2, 0]));
        if (which === "right") return add(X.p, mv(X.M, [e * 0.6, self.rp * 2, 0]));
        if (which === "top") return add(X.p, mv(X.M, [0, self.rp * 4, 0]));
        var p = self.pts[Math.min(self.pts.length - 1, Math.floor(self.pts.length * 0.62))];
        return add(X.p, mv(X.M, self.posOf(t, p)));
      };
    };
    return n;
  }

  // ------------------------- subatomic levels -------------------------
  function atomNode(o) {
    o = obj(o);
    var n = new Node("atom", o);
    n.r = 1.05;
    n.draw = function (t, C, items, X) {
      var q = toView(C, X.p);
      if (q[2] < C.near) return;
      var s = projQ(C, q), r = (C.F * 1.05 * X.s) / q[2], img = cloudSpr(), a = X.a, ang = t * 0.05;
      items.push({ t: 4, z: q[2] + 1.05 * X.s, a: a, fn: function (g) {
        g.globalCompositeOperation = "lighter";
        g.translate(s[0], s[1]);
        g.rotate(ang); g.globalAlpha = a * 0.8; g.drawImage(img, -r, -r, r * 2, r * 2);
        g.rotate(-ang * 2.3); g.globalAlpha = a * 0.45; g.drawImage(img, -r * 0.82, -r * 0.82, r * 1.64, r * 1.64);
      } });
      var gr = Math.max(u(6), r * 0.09);
      items.push({ t: 1, z: q[2], img: glowSpr([1, 0.86, 0.72]), x: s[0] - gr * 2.2, y: s[1] - gr * 2.2, w: gr * 4.4, h: gr * 4.4, a: a * 0.9, add: true });
      items.push({ t: 1, z: q[2] - 1e-3, img: glowSpr(C_WHITE), x: s[0] - gr * 0.7, y: s[1] - gr * 0.7, w: gr * 1.4, h: gr * 1.4, a: a, add: true });
    };
    return n;
  }
  function nucleusNode(o) {
    o = obj(o);
    var n = new Node("nucleus", o), pts = [], k;
    var shell = 12, inner = [[0.32, 0.32, 0.32], [0.32, -0.32, -0.32], [-0.32, 0.32, -0.32], [-0.32, -0.32, 0.32]];
    inner.forEach(function (p) { pts.push(mul(p, 1.4)); });
    for (k = 0; k < shell; k++) {
      var y = 1 - (2 * (k + 0.5)) / shell, rr = Math.sqrt(1 - y * y), th = k * 2.39996;
      pts.push(mul([Math.cos(th) * rr, y, Math.sin(th) * rr], 1.08));
    }
    var mp = mat("gloss", "#C9664F"), mn = mat("gloss", "#8E9BAC"), rnd = V.makeRand(55);
    var list = pts.map(function (p, i) { return { p: p, prot: i % 2 === 0, ph: rnd() * TAU }; });
    n.r = 1.7; n.list = list;
    n.draw = function (t, C, items, X) {
      emitGlow(C, X.p, 2.4 * X.s, [1, 0.6, 0.45], X.a * 0.22, items, 3 * X.s);
      list.forEach(function (it) {
        var j = 0.035, w = add(X.p, mv(X.M, add(it.p, [Math.sin(t * 3.1 + it.ph) * j, Math.sin(t * 2.7 + it.ph * 2) * j, Math.sin(t * 3.4 + it.ph * 3) * j])));
        emitBall("sphere", it.prot ? mp : mn, w, 0.6 * X.s, C, items, X.a, {});
      });
    };
    n.front = function () { var b = 0, bz = -1e9; list.forEach(function (it, i) { if (it.prot && it.p[2] > bz) { bz = it.p[2]; b = i; } }); return list[b].p; };
    return n;
  }
  function quarksNode(o) {
    o = obj(o);
    var n = new Node("quarks", o), shell = mat("glass", "#E8D2C4");
    var q = [{ c: "#6FB4D6" }, { c: "#C8644C" }, { c: "#C9A252" }].map(function (x) { return mat("gloss", x.c); });
    n.r = 1.25;
    n.draw = function (t, C, items, X) {
      emitBall("sphere", shell, X.p, 1.2 * X.s, C, items, X.a * 0.85, { bias: 0 });
      var pos = [];
      for (var i = 0; i < 3; i++) {
        var a = t * 0.35 + (i * TAU) / 3, rr = 0.48 + 0.05 * Math.sin(t * 1.7 + i * 2);
        pos.push(add(X.p, mv(X.M, [Math.cos(a) * rr, Math.sin(a * 0.7 + i) * 0.12, Math.sin(a) * rr * 0.7])));
      }
      pos.forEach(function (p, i) {
        emitBall("sphere", q[i], p, 0.15 * X.s, C, items, X.a, {});
        emitGlow(C, p, 0.42 * X.s, [C_ICE, C_CORAL, C_GOLD][i], X.a * 0.35, items, 0.2 * X.s);
      });
      for (var k = 0; k < 3; k++) {
        var A = pos[k], B = pos[(k + 1) % 3], qa = toView(C, A), qb = toView(C, B);
        if (qa[2] < C.near || qb[2] < C.near) continue;
        var pts = [], sa = projQ(C, qa), sb = projQ(C, qb), dx = sb[0] - sa[0], dy = sb[1] - sa[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
        for (var s = 0; s <= 24; s++) {
          var f = s / 24, wob = Math.sin(f * PI) * Math.sin(f * PI * 5 + t * 4 + k * 2) * L * 0.035;
          pts.push([sa[0] + dx * f + nx * wob, sa[1] + dy * f + ny * wob]);
        }
        var zz = (qa[2] + qb[2]) / 2 + 1e-3;
        items.push({ t: 3, z: zz, pts: pts, c: rgba([1, 0.9, 0.75], 1), w: u(5), a: X.a * 0.16, add: true });
        items.push({ t: 3, z: zz - 1e-5, pts: pts, c: rgba([1, 0.95, 0.88], 1), w: u(1.6), a: X.a * 0.6, add: true });
      }
    };
    return n;
  }

  // ------------------------- scale dive -------------------------
  var LEVEL_KINDS = ["object", "crystal-lattice", "molecule", "atom", "nucleus", "quarks", "surface-layer"];
  function buildLevel(def) {
    var kind = LEVEL_KINDS.indexOf(def.kind) >= 0 ? def.kind : "object", node, focus = [0, 0, 0], pitch = 10, dof = 0;
    if (kind === "object") { node = object3d(def.object || "ice-cube", { material: def.material }); node.spin(9); pitch = 14; focus = [0, 0, 0]; }
    else if (kind === "crystal-lattice" || kind === "surface-layer") {
      var surf = kind === "surface-layer";
      node = lattice({ layers: surf ? 2 : 3, radius: surf ? 2.2 : 2.0, scale: 0.3, buildFrom: -1, buildTo: -0.5, disorder: surf ? 0.85 : 0, disorderAt: -5, disorderLayers: 1, dof: 0.8 });
      node.spin(4);
      pitch = surf ? 24 : 30;
      var mi = node.pick(surf ? "top-layer" : "molecule"), mo = node.S.mols[mi];
      focus = mul(mo.O, 0.3);
      if (!surf) { mi = 0; var bd = 1e9; node.S.mols.forEach(function (m2, i) { var dd = vlen(m2.O); if (dd < bd) { bd = dd; mi = i; } }); focus = mul(node.S.mols[mi].O, 0.3); }
      node.focusMol = mi; dof = 0.8;
    } else if (kind === "molecule") { node = molecule({ preset: "water", dof: 0 }); node.hook(function (t, s) { s.rot[1] += 30 * Math.sin((TAU * t) / 20); }); pitch = 6; focus = [0, 0, 0]; }
    else if (kind === "atom") { node = atomNode({}); pitch = 0; }
    else if (kind === "nucleus") { node = nucleusNode({}); node.spin(6); pitch = 6; focus = node.front(); }
    else { node = quarksNode({}); pitch = 0; }
    return { kind: kind, node: node, R: node.r, focus: focus, pitch: pitch, dof: dof };
  }
  // S.dive(levels, opts): continuous camera dive through nested levels (outermost first). opts.reverse zooms out.
  function dive(levels, o) {
    o = obj(o);
    var s = ensure(), list = arr(levels).slice(0, 6).map(function (l) { l = obj(l); return { kind: str(l.kind) || "object", object: l.object, material: l.material, label: str(l.label), note: str(l.note), keyword: l.keyword }; });
    if (!list.length) list = [{ kind: "object", object: "ice-cube", label: "" }, { kind: "molecule", label: "" }];
    if (list.length === 1) list.push({ kind: "atom", label: "" });
    var n = list.length, rev = !!o.reverse, K = num(o.K, 6), fill = num(o.fill, 0.6), rect = o.rect || { x: 0, y: 0, w: W, h: H };
    var cxy = o.center || [W / 2, H / 2];
    var visit = list.map(function (l, i) { return rev ? n - 1 - i : i; });
    var lands = Array.isArray(o.times) ? o.times.slice() : landsFor(visit.map(function (li) { return { text: list[li].label, kw: list[li].keyword }; }), { start: 0.3, end: D - 1.4, gap: 1.0 });
    var arrive = lands.map(function (t, j) { return j === 0 ? 0 : t - 0.15; }), trans = [];
    for (var j = 1; j < n; j++) {
      var room = arrive[j] - arrive[j - 1] - 0.35;
      trans[j] = clamp(Math.min(num(o.dur, 2.1), room), 0.6, 3.2);
      if (arrive[j] - trans[j] < arrive[j - 1] + 0.2) trans[j] = Math.max(0.5, arrive[j] - arrive[j - 1] - 0.2);
      if (j === 1 && arrive[1] - trans[1] < 1.4) trans[1] = Math.max(0.8, arrive[1] - 1.4);
    }
    function sv(t) {
      for (var j = n - 1; j >= 1; j--) {
        if (t >= arrive[j]) return j;
        if (t > arrive[j] - trans[j]) return j - 1 + EASE.quart((t - (arrive[j] - trans[j])) / trans[j]);
      }
      return 0;
    }
    function sl(t) { var v = sv(t); return rev ? n - 1 - v : v; }
    var built = list.map(buildLevel);
    var fovT = 30, tn = Math.tan((fovT * DEG) / 2);
    built.forEach(function (lv, i) {
      var base = lv.R / (fill * tn), cam = new Camera({ fov: fovT, pitch: lv.pitch, yaw: -20 + i * 23, dist: base, sx: (cxy[0] - (rect.x + rect.w / 2)) / rect.w, sy: (cxy[1] - (rect.y + rect.h / 2)) / rect.h });
      cam.hook(function (t, cs) {
        var rel = i - sl(t);
        cs.dist = base * Math.pow(K, rel);
        var into = rel < 0 ? sstep(0, 0.75, -rel) : 0;
        cs.target = mul(lv.focus, into);
        cs.yaw += 5 * t;
        cs.roll = rel < 0 ? -rel * 8 : rel > 0 ? -rel * 8 : 0;
      });
      var v = addView({ rect: rect, camera: cam, dof: lv.dof, alpha: function (t) { var rel = i - sl(t); return (1 - sstep(0.3, 0.66, rel)) * (1 - sstep(0.34, 0.7, -rel)); }, order: 10 + (rev ? n - i : i) });
      v.add(lv.node);
      lv.view = v;
    });
    s.dust = s.dust || makeDust({});
    s.dust.flow = function (t) { return sl(t) * 1.4 + t * 0.03; };
    var streak = V.makeRand(808), rays = [];
    for (var k = 0; k < 90; k++) rays.push({ a: streak() * TAU, r: 0.08 + streak() * 0.9, l: 0.3 + streak() * 0.7, w: 0.6 + streak() * 1.2 });
    s.fx.push(function (g, t) {
      var x = sl(t), d = Math.abs(x - Math.round(x - 0.5) - 0.5), fl = Math.exp(-(d * d) / 0.02), speed = Math.abs(sl(t + 0.03) - sl(t - 0.03)) / 0.06;
      if (fl < 0.01 && speed < 0.05) return;
      var cx = cxy[0], cy = cxy[1], R = Math.hypot(W, H) * 0.5;
      g.globalCompositeOperation = "lighter";
      if (fl > 0.01) { var gr = MIN * (0.5 + fl * 0.3); g.globalAlpha = fl * 0.24; g.drawImage(glowSpr([0.62, 0.86, 1]), cx - gr, cy - gr, gr * 2, gr * 2); }
      var sp = clamp(speed / 1.2, 0, 1);
      if (sp > 0.02) {
        g.strokeStyle = "rgba(190,230,255,1)";
        g.lineCap = "round";
        rays.forEach(function (ry) {
          var ph = fract(ry.r + x * 0.9 * (rev ? -1 : 1)), r0 = R * (0.05 + ph * 0.95), r1 = r0 * (1 + 0.08 + sp * 0.22 * ry.l);
          g.globalAlpha = sp * 0.16 * sstep(0, 0.2, ph) * (1 - sstep(0.75, 1, ph));
          g.lineWidth = u(ry.w);
          g.beginPath(); g.moveTo(cx + Math.cos(ry.a) * r0, cy + Math.sin(ry.a) * r0); g.lineTo(cx + Math.cos(ry.a) * r1, cy + Math.sin(ry.a) * r1); g.stroke();
        });
      }
      g.globalCompositeOperation = "source-over";
    });
    return { levels: built, lands: lands, arrive: arrive, trans: trans, visit: visit, s: sl, sv: sv, n: n, reverse: rev };
  }

  // ------------------------- scene setup helpers -------------------------
  function scene(root, o) {
    o = obj(o);
    stage(root, o);
    var v = addView({ camera: o.camera, floor: o.floor, dof: o.dof });
    st.main = v;
    return { W: W, H: H, safe: safe(), view: v, camera: v.cam, add: function (n) { return v.add(n); }, portrait: PORT, landscape: LAND, square: V.isSquare, stage: st };
  }
  // Place a bounding sphere (radius R at the camera target) so it fills `fill` of the region's short side, centred in it.
  // Portrait (a wide-first scene drawn at 1080x1920): the subject is kept a margin inside the safe area, so a big hero
  // never reaches the sides or Instagram's caption area. Only for full-frame framing; split views (rect) and the
  // thumbnail (which bleeds on purpose, frameCamRaw) are left alone. Landscape and square are unchanged.
  var PORT_MARGIN = 0.022, PORT_MAX_FILL = 0.96;
  function portraitRegion(reg) {
    var sa = safe(), m = W * PORT_MARGIN, x0 = Math.max(reg.x, sa.x0 + m), y0 = Math.max(reg.y, sa.y0), x1 = Math.min(reg.x + reg.w, sa.x1 - m), y1 = Math.min(reg.y + reg.h, sa.y1 - m);
    return x1 - x0 < 10 || y1 - y0 < 10 ? reg : region(x0, y0, x1, y1);
  }
  function frameCam(cam, R, reg, fill, rect) {
    if (PORT && !rect) { reg = portraitRegion(reg); fill = Math.min(num(fill, 1), PORT_MAX_FILL); }
    return frameCamRaw(cam, R, reg, fill, rect);
  }
  function frameCamRaw(cam, R, region, fill, rect) {
    rect = rect || { x: 0, y: 0, w: W, h: H };
    var tn = Math.tan((cam.base.fov * DEG) / 2), F = Math.min(rect.w, rect.h) / 2 / tn, px = (fill * Math.min(region.w, region.h)) / 2;
    cam.set({ dist: Math.max(0.01, (R * F) / Math.max(4, px)) + R * 0.0, sx: (region.x + region.w / 2 - (rect.x + rect.w / 2)) / rect.w, sy: (region.y + region.h / 2 - (rect.y + rect.h / 2)) / rect.h });
    return cam;
  }
  // Fit a box of half extents (world units, as seen by the camera: hw across, hh up) inside the region.
  function frameBox(cam, hw, hh, reg, fill, rect) {
    if (PORT && !rect) reg = portraitRegion(reg);
    rect = rect || { x: 0, y: 0, w: W, h: H };
    fill = fill || 0.92;
    var tn = Math.tan((cam.base.fov * DEG) / 2), F = Math.min(rect.w, rect.h) / 2 / tn;
    var dist = Math.max((hw * F) / Math.max(4, (reg.w / 2) * fill), (hh * F) / Math.max(4, (reg.h / 2) * fill));
    cam.set({ dist: dist, sx: (reg.x + reg.w / 2 - (rect.x + rect.w / 2)) / rect.w, sy: (reg.y + reg.h / 2 - (rect.y + rect.h / 2)) / rect.h });
    return cam;
  }
  // Screen half extents of a box (hx, hy, hz) seen at yaw / pitch (degrees).
  function boxView(hx, hy, hz, yaw, pitch) {
    var cy = Math.abs(Math.cos(yaw * DEG)), sy = Math.abs(Math.sin(yaw * DEG)), cp = Math.abs(Math.cos(pitch * DEG)), sp = Math.abs(Math.sin(pitch * DEG));
    return [hx * cy + hz * sy, hy * cp + (hx * sy + hz * cy) * sp];
  }
  function region(x0, y0, x1, y1) { return { x: x0, y: y0, w: Math.max(10, x1 - x0), h: Math.max(10, y1 - y0) }; }
  function T(p) { return obj(p); }
  var CAM_KINDS = ["orbit", "push-in", "pull-out", "dolly-left", "dolly-right"];

  // ------------------------- templates -------------------------
  var TPL = {};

  TPL["hero-object"] = function (root, p) {
    var name = objKey(p.object), mname = matKey(p.material, OBJ_MAT[name]), ck = CAM_KINDS.indexOf(str(p.camera)) >= 0 ? str(p.camera) : "orbit";
    var ctx = scene(root, {}), sa = safe();
    var lt = p.title || p.subtitle ? lowerThird(str(p.title), str(p.subtitle), { at: 0.5, kicker: p.kicker }) : null;
    var capT = p.caption ? landsFor([{ text: p.caption, kw: p.keyword }], { start: 1.0 })[0] : null;
    var bottom = lt ? lt.box(D).y - u(LAND ? 24 : 60) : sa.y1, topY = sa.y0 + (p.caption && !LAND ? u(150) : 0);
    var reg = LAND ? region(sa.x0 + sa.w * 0.12, topY, sa.x1 - sa.w * 0.12, bottom) : region(sa.x0, topY, sa.x1, bottom);
    var node = object3d(name, { material: mname, subject: true });
    node.subject = true; node.shadow = true; node.reflect = true;
    ctx.view.reflect = true;
    ctx.add(node);
    node.enter(0, "rise", 1.1);
    ctx.camera.set({ pitch: 13, yaw: -12, fov: 28 });
    frameCam(ctx.camera, node.r, reg, LAND ? 0.78 : 0.8);
    ctx.view.floor = node.lo - node.r * 0.03;
    if (ck === "orbit") { node.spin(11); ctx.camera.drift({ sway: 3, period: 22 }); }
    else { node.spin(4); ctx.camera.move(ck, { from: 0, to: D - 0.4, amount: ck === "push-in" ? 0.9 : 1 }); }
    if (p.caption) label(str(p.caption), { target: node, offset: [0, node.top, 0], at: capT, side: "right", len: u(LAND ? 120 : 96), sub: p.captionSub });
  };

  TPL["scale-dive"] = function (root, p) {
    var ctx = scene(root, {}), sa = safe();
    var levels = arr(p.levels).slice(0, 6).map(function (l) { l = obj(l); return { kind: str(l.kind) || "object", object: l.object, material: l.material, label: str(l.label), note: str(l.note), keyword: l.keyword }; });
    if (levels.length < 2) levels = [{ kind: "object", object: "ice-cube", label: "Ice cube" }, { kind: "crystal-lattice", label: "Crystal" }, { kind: "molecule", label: "Molecule" }];
    var titleOv = p.title ? say(str(p.title), { at: 0.3 }) : null;
    var cy = LAND ? sa.cy - u(40) + (titleOv ? u(30) : 0) : sa.y0 + sa.h * 0.43 + (titleOv ? u(40) : 0);
    var dv = dive(levels, { reverse: !!p.reverse, center: [W / 2, cy], fill: LAND ? 0.6 : 0.62 });
    if (titleOv && dv.n > 1) titleOv.until = Math.max(1.2, dv.arrive[1] - dv.trans[1] - 0.2);
    var n = dv.n;
    for (var j = 0; j < n; j++) {
      var li = dv.visit[j], lv = levels[li];
      if (!lv.label && !lv.note) continue;
      var at = j === 0 ? 0.25 : dv.arrive[j] - dv.trans[j] * 0.45, until = j < n - 1 ? dv.arrive[j + 1] - dv.trans[j + 1] * 0.55 : null;
      var idx = (li + 1 < 10 ? "0" : "") + (li + 1) + " / " + (n < 10 ? "0" : "") + n;
      lowerThird(lv.label, lv.note, { at: at, until: until, kicker: idx, size: u(LAND ? 56 : 60) });
    }
  };

  TPL["crystal-lattice"] = function (root, p) {
    var ctx = scene(root, {}), sa = safe();
    var title = p.title ? say(str(p.title), { at: 0.3 }) : null;
    var top = title ? title.y + title.h + u(24) : sa.y0;
    var kw = when(p.keyword, 0.15), bEnd = clamp(kw + 0.5, 1.2, Math.max(1.3, D - 2));
    var dAmt = clamp(num(p.disorder, 0), 0, 1), dT = p.disorderKeyword ? when(p.disorderKeyword, 0.55) : D * 0.5;
    if (dAmt > 0) dT = clamp(dT, bEnd + 0.3, D - 2.4);
    var lat = lattice({ layers: clamp(num(p.layers, LAND ? 3 : 4), 2, 4), radius: LAND ? 2.9 : 2.1, dof: 0.45, highlight: p.highlight, disorder: dAmt, disorderAt: dT, disorderLayers: num(p.disorderLayers, 1), buildFrom: 0.05, buildTo: bEnd, hbonds: p.hbonds !== false });
    ctx.add(lat);
    ctx.camera.set({ pitch: 24, yaw: -22, fov: 30 });
    ctx.camera.drift({ yaw: 1.6 });
    var reg = region(sa.x0, top, sa.x1, sa.y1), ext = boxView(lat.radiusXZ, (lat.topY - lat.bottomY) / 2 + 0.2, lat.radiusXZ * 0.87, -22, 24);
    frameBox(ctx.camera, ext[0], ext[1], reg, LAND ? 0.8 : 0.96);
    var sl = str(p.slider), slider = null;
    if (sl === "boot-sole" || sl === "skate-blade" || sl === "ball") {
      var sT = p.sliderKeyword ? when(p.sliderKeyword, 0.5) : D * 0.45;
      sT = clamp(sT, 0.8, D - 2);
      slider = sl === "ball" ? object3d("sphere", { material: "metal" }) : object3d(sl, { rest: sl === "boot-sole" ? [0, 8, 0] : [0, 0, 0] });
      var sz = lat.radiusXZ * (sl === "ball" ? 0.22 : 0.36), gapY = lat.topY + sz * (sl === "ball" ? 1.05 : sl === "skate-blade" ? 0.18 : 0.12) + 0.12;
      slider.base.scale = [sz, sz, sz];
      slider.base.pos = [-lat.radiusXZ * 0.45, gapY + lat.radiusXZ * 0.9, 0];
      slider.enter(sT - 0.9, "fade", 0.8);
      slider.to(sT - 0.9, { pos: [-lat.radiusXZ * 0.45, gapY, 0] }, 1.0, "out");
      if (sl !== "boot-sole") slider.to(sT + 0.2, { pos: [lat.radiusXZ * 0.45, gapY, 0] }, Math.max(0.8, D - 1.2 - (sT + 0.2)), "sine");
      else slider.to(sT + 0.2, { pos: [-lat.radiusXZ * 0.45, gapY - 0.06, 0] }, 0.8, "inOut");
      if (sl === "ball") slider.spin(-60, "z");
      ctx.add(slider);
    }
    var labs = arr(p.labels).slice(0, 4).map(function (l) { return typeof l === "string" ? { text: l } : obj(l); }).filter(function (l) { return str(l.text); });
    var times = landsFor(labs.map(function (l) { return { text: l.text, kw: l.keyword }; }), { start: Math.min(bEnd, D * 0.3), gap: 0.5 });
    labs.forEach(function (l, i) {
      var tg = str(l.target) || "molecule", target = tg === "slider" && slider ? slider : lat.anchor(tg);
      label(str(l.text), { target: target, at: times[i], sub: l.sub, dir: tg === "bottom-layer" ? "down" : "up", len: u(LAND ? 120 : 90) });
    });
  };

  TPL.molecule = function (root, p) {
    var ctx = scene(root, {}), sa = safe();
    var title = p.title ? say(str(p.title), { at: 0.3 }) : null;
    var top = title ? title.y + title.h + u(30) : sa.y0;
    var preset = str(p.preset) || (arr(p.atoms).length ? "custom" : "water");
    var mol = molecule({ preset: preset, atoms: p.atoms, bonds: p.bonds });
    mol.subject = true; mol.label = preset;
    ctx.add(mol);
    mol.enter(0, "rise", 1.0);
    var sway = num(p.sway, 26);
    mol.hook(function (t, s) { s.rot[1] += sway * Math.sin((TAU * t) / 18); s.rot[0] += 4 * Math.sin((TAU * t) / 23); });
    var R = mol.r, isWater = preset === "water" && !arr(p.atoms).length;
    var tch = p.charges ? clamp(p.chargeKeyword ? when(p.chargeKeyword, 0.45) : (labelTime("negative positive charge", null) || D * 0.45), 0.6, D - 1.6) : null;
    var tdp = p.dipole ? clamp(p.dipoleKeyword ? when(p.dipoleKeyword, 0.6) : (labelTime("dipole", null) || D * 0.6), 0.6, D - 1.4) : null;
    if (tch != null) mol.charge = function (t) { return prog(t, tch - 0.35, 1.1, "inOut"); };
    var arrow = null;
    if (tdp != null) {
      arrow = mol.add(new Node("dipole", { pos: [-R - 0.3, -0.62, 0] }));
      var lm = mat("light", "#7FD8FF");
      arrow.add(meshNode(cylMesh(0.04, 0.42, 18), lm, { pos: [0, 0.42, 0] }));
      arrow.add(meshNode(coneMesh(0.11, 0.3, 24), lm, { pos: [0, 0.84, 0] }));
      arrow.add(meshNode(boxMesh(0.12, 0.02, 0.02, 0), lm, { pos: [0, 0.16, 0] }));
      arrow.base.scale = [1, 0.02, 1];
      arrow.enter(tdp - 0.5, "fade", 0.5);
      arrow.to(tdp - 0.5, { scale: [1, 1, 1] }, 1.0, "inOut");
      R = Math.max(R, R + 0.42);
    }
    ctx.camera.set({ pitch: 6, yaw: 0, fov: 26 });
    var reg = region(sa.x0, top, sa.x1, sa.y1);
    if (LAND) reg = region(sa.x0 + sa.w * 0.12, top, sa.x1 - sa.w * 0.12, sa.y1);
    frameCam(ctx.camera, R + 0.15, reg, LAND ? 1.0 : 1.12);
    if (arrow) { var sh = ctx.camera.base; void sh; }
    if (tch != null) {
      mol.atoms.forEach(function (a, i) {
        var neg = a.el === "O" || a.el === "N" || a.el === "F" || a.el === "Cl";
        if (!neg && a.el !== "H") return;
        var off = neg ? [0, a.r + 0.32, 0] : [0, -a.r - 0.26, 0];
        textBlock(neg ? "\u03b4\u2212" : "\u03b4+", { target: function (t) { var X = mol.worldXf(t); return add(mol.atomWorld(t, i), mul(off, X.s)); }, view: ctx.view, size: u(46), weight: 900, upper: false, color: neg ? C_CORAL : C_ICE, align: "center", valign: "middle", at: tch + 0.2, kind: "charge" });
      });
    }
    if (p.showAngle && isWater) {
      var arc = mol.add(new Node("angle", {}));
      var ta = clamp(p.angleKeyword ? when(p.angleKeyword, 0.5) : (labelTime("degrees angle", null) || D * 0.5), 0.6, D - 1.4);
      arc.draw = function (t, C, items, X) {
        var pr = prog(t, ta - 0.3, 0.9, "inOut");
        if (pr <= 0) return;
        var A = mol.atoms[0].p, h1 = nrm(sub(mol.atoms[1].p, A)), h2 = nrm(sub(mol.atoms[2].p, A)), pts = [], rr = 0.62;
        var ang = Math.acos(clamp(dot(h1, h2), -1, 1)), ax = nrm(cross(h1, h2));
        for (var k = 0; k <= 24; k++) { var v = axisRot(h1, ax, ang * (k / 24) * pr), s = project(C, add(X.p, mv(X.M, add(A, mul(v, rr))))); if (s) pts.push([s[0], s[1]]); }
        var q = toView(C, X.p);
        if (pts.length > 1) items.push({ t: 3, z: q[2] - 0.5, pts: pts, c: rgba(C_ICE, 1), w: u(2.4), a: X.a * 0.9 });
      };
      textBlock(str(p.angleLabel) || "104.5\u00b0", { target: function (t) { var X = mol.worldXf(t); return add(X.p, mv(X.M, [0, -0.95, 0])); }, view: ctx.view, size: u(36), weight: 900, color: C_TEXT, align: "center", valign: "top", at: ta + 0.3, kind: "angle" });
    }
    var labs = arr(p.labels).slice(0, 4).map(function (l) { return typeof l === "string" ? { text: l } : obj(l); }).filter(function (l) { return str(l.text); });
    var times = landsFor(labs.map(function (l) { return { text: l.text, kw: l.keyword }; }), { start: 0.8, gap: 0.5 });
    labs.forEach(function (l, i) {
      var tg = l.target, idx = 0;
      if (typeof tg === "number" || /^\d+$/.test(str(tg))) { idx = clamp(Math.round(+tg), 0, mol.atoms.length - 1); tg = "atom"; }
      else {
        tg = str(tg).toLowerCase();
        var want = tg === "hydrogen" ? "H" : tg === "oxygen" ? "O" : tg === "carbon" ? "C" : tg === "nitrogen" ? "N" : null;
        if (want) mol.atoms.some(function (a, k) { if (a.el === want) { idx = k; return true; } return false; });
      }
      var fn = tg === "bond" && mol.bonds.length ? function (t) { return vlerp(mol.atomWorld(t, mol.bonds[0][0]), mol.atomWorld(t, mol.bonds[0][1]), 0.5); } : function (t) { return mol.atomWorld(t, idx); };
      if (tg === "molecule") fn = function (t) { return mol.point(t, [R * 0.7, R * 0.3, 0]); };
      if (tg === "dipole" && arrow) fn = function (t) { return arrow.point(t, [0, 0.9, 0]); };
      label(str(l.text), { target: fn, view: ctx.view, at: times[i], sub: l.sub });
    });
  };

  TPL["particle-field"] = function (root, p) {
    var ctx = scene(root, {}), sa = safe();
    var title = p.title ? say(str(p.title), { at: 0.3 }) : null;
    var top = title ? title.y + title.h + u(24) : sa.y0;
    var kT = clamp(when(p.keyword, 0.4), 0.6, D - 1.6), ext = LAND ? 2.4 : 1.75;
    var beh = str(p.behaviour || p.behavior) || "jitter", srf = str(p.surface) || (beh === "roll" || beh === "settle" || beh === "scatter" ? "ice" : "none");
    var parts = particles({ behaviour: beh, particle: p.particle, count: num(p.count, LAND ? 110 : 64), material: p.material, color: p.color, at: kT, extent: ext });
    if (srf !== "none" && MATS[srf]) {
      var slab = mesh("rbox", { dims: [ext * 2 + 0.5, 0.36, ext * 1.4 + 0.5], bevel: 0.06, material: srf, pos: [0, -0.18, 0] });
      ctx.add(slab);
    }
    parts.enter(0, "fade", 0.6);
    ctx.add(parts);
    var pit = LAND ? 26 : 38;
    ctx.camera.set({ pitch: pit, yaw: -16, fov: 30, target: [0, 0.5, 0] });
    ctx.camera.drift({ sway: 5, period: 24 });
    var pe = boxView(ext + 0.25, 0.6, ext * 0.7 + 0.25, -16, pit);
    frameBox(ctx.camera, pe[0], pe[1], region(sa.x0, top + u(20), sa.x1, sa.y1), LAND ? 0.78 : 0.95);
    var labs = arr(p.labels).slice(0, 3).map(function (l) { return typeof l === "string" ? { text: l } : obj(l); }).filter(function (l) { return str(l.text); });
    var times = landsFor(labs.map(function (l) { return { text: l.text, kw: l.keyword }; }), { start: 0.8, gap: 0.5 });
    labs.forEach(function (l, i) { label(str(l.text), { target: parts.anchorAt(str(l.target) || "particles"), view: ctx.view, at: times[i], sub: l.sub }); });
  };

  TPL["split-compare"] = function (root, p) {
    stage(root, {});
    var sa = safe(), STACK = !LAND, sides = [obj(p.left), obj(p.right)];
    var titleOv = p.title ? say(str(p.title), { at: 0.3 }) : null, top = titleOv ? titleOv.y + titleOv.h + u(26) : sa.y0;
    var tl = landsFor(sides.map(function (s) { return { text: s.title, kw: s.keyword }; }), { start: 0.4, gap: 0.9 });
    sides.forEach(function (s, i) {
      var name = objKey(s.object, i ? "drop" : "ice-cube"), mname = matKey(s.material, OBJ_MAT[name]);
      var rect, objReg, txt;
      if (!STACK) {
        rect = { x: i ? W / 2 : 0, y: 0, w: W / 2, h: H };
        var x0 = i ? W / 2 + u(50) : sa.x0, x1 = i ? sa.x1 : W / 2 - u(50);
        objReg = region(x0, top, x1, top + (sa.y1 - top) * 0.6);
        txt = { x: (x0 + x1) / 2, y: objReg.y + objReg.h + u(26), w: x1 - x0, align: "center" };
      } else {
        rect = { x: 0, y: i ? H / 2 : 0, w: W, h: H / 2 };
        var y0 = i ? H / 2 + u(36) : top, y1 = i ? sa.y1 : H / 2 - u(36);
        objReg = region(sa.x0, y0, sa.x0 + sa.w * 0.44, y1);
        txt = { x: sa.x0 + sa.w * 0.5, y: (y0 + y1) / 2, w: sa.w * 0.5, align: "left", mid: true };
      }
      var v = addView({ rect: rect, clip: true, camera: { pitch: 12, yaw: i ? 14 : -14, fov: 28 } });
      var node = object3d(name, { material: mname });
      node.subject = true; node.shadow = true;
      v.add(node);
      node.enter(Math.max(0, tl[i] - 0.9), "rise", 1.0);
      node.spin(i ? -10 : 10);
      frameCam(v.cam, node.r, objReg, 0.84, rect);
      v.floor = -node.r * 1.12;
      var tS = layoutText(str(s.title), { size: u(46), weight: 300, maxWidth: txt.w, maxLines: 2 });
      var pts = arr(s.points).slice(0, 2).map(str).filter(Boolean);
      var Ls = pts.map(function (pt) { return layoutText(pt, { size: u(28), weight: 400, maxWidth: txt.w, maxLines: 2 }); });
      var blockH = tS.h + Ls.reduce(function (a, L) { return a + L.h + u(12); }, 0) + (pts.length ? u(10) : 0);
      var y = txt.mid ? txt.y - blockH / 2 : txt.y;
      textBlock(str(s.title), { x: txt.x, y: y, align: txt.align, size: u(46), weight: 300, maxWidth: txt.w, maxLines: 2, at: tl[i] - 0.1, kind: "title" });
      y += tS.h + u(14);
      var pt0 = landsFor(pts.map(function (pt) { return { text: pt }; }), { start: tl[i] + 0.5, gap: 0.5 });
      pts.forEach(function (pt, k) {
        textBlock(pt, { x: txt.x, y: y, align: txt.align, size: u(28), weight: 400, color: C_MUTED, maxWidth: txt.w, maxLines: 2, at: Math.max(tl[i] + 0.4, pt0[k]), kind: "point" });
        y += Ls[k].h + u(12);
      });
    });
    if (!STACK) rule(W / 2, top + u(10), W / 2, sa.y1, { at: 0.2, dur: 1.0, alpha: 0.35 });
    else rule(sa.x0, H / 2, sa.x1, H / 2, { at: 0.2, dur: 1.0, alpha: 0.35 });
  };

  TPL["big-number"] = function (root, p) {
    var ctx = scene(root, {}), sa = safe();
    var name = objKey(p.object, "ice-cube"), node = object3d(name, { material: matKey(p.material, OBJ_MAT[name]) });
    ctx.add(node);
    node.hook(function (t, s) { s.rot[1] += 24 * Math.sin((TAU * t) / 22); s.rot[2] += 6 * t; });
    node.enter(0, "fade", 1.2);
    ctx.view.alpha = 0.38;
    ctx.camera.set({ pitch: 12, yaw: -10, fov: 30 });
    ctx.camera.drift({ yaw: 1.5 });
    frameCam(ctx.camera, node.r, region(sa.x0, sa.y0, sa.x1, sa.y1), LAND ? 0.95 : 0.8);
    var kw = when(p.keyword, 0.3), at = clamp(kw - 1.3, 0.25, Math.max(0.3, D - 2.8));
    var cy = LAND ? sa.cy - u(20) : sa.cy - u(40);
    var nb = number({ value: p.value, from: p.from, decimals: p.decimals, prefix: p.prefix, suffix: p.suffix, at: at, dur: 1.5, y: cy });
    if (p.kicker) textBlock(str(p.kicker), { x: W / 2, y: nb.top - u(26), align: "center", valign: "bottom", size: u(24), weight: 600, upper: true, track: u(3.4), color: C_ICE, at: 0.3, maxWidth: sa.w, maxLines: 1, kind: "kicker" });
    if (p.label) textBlock(str(p.label), { x: W / 2, y: nb.bottom + u(30), align: "center", size: u(LAND ? 36 : 38), weight: 400, color: C_MUTED, at: at + 1.0, maxWidth: sa.w * (LAND ? 0.6 : 0.95), maxLines: 2, kind: "label" });
  };

  TPL["data-bars"] = function (root, p) {
    var ctx = scene(root, {}), sa = safe();
    var bars = arr(p.bars).slice(0, 6).map(function (b) { b = obj(b); return { label: str(b.label), value: num(b.value, NaN), keyword: b.keyword }; }).filter(function (b) { return isFinite(b.value); });
    if (!bars.length) bars = [{ label: "A", value: 3 }, { label: "B", value: 5 }];
    var n = bars.length, unit = str(p.unit), dec = clamp(Math.round(num(p.decimals, bars.some(function (b) { return Math.abs(b.value % 1) > 1e-9; }) ? 1 : 0)), 0, 3);
    var title = p.title ? say(str(p.title), { at: 0.3 }) : null, top = title ? title.y + title.h + u(30) : sa.y0;
    var maxP = 0, maxN = 0;
    bars.forEach(function (b) { maxP = Math.max(maxP, b.value); maxN = Math.max(maxN, -b.value); });
    // Size the chart from the safe area: the bars' spread matches the region's aspect, so the board is used.
    var creg = region(sa.x0, top + u(20), sa.x1, sa.y1 - u(30)), aspect = creg.w / creg.h;
    var range = maxP + maxN || 1, Hm = LAND ? 5.0 : 5.2, hl = -1;
    var spc = clamp((2 * (aspect * (Hm / 2 + 0.7) * 0.98 - 0.35)) / n, 0.9, LAND ? 3.2 : 1.6), bw = Math.min(spc * 0.46, 1.0);
    if (typeof p.highlight === "number") hl = Math.round(p.highlight);
    else if (str(p.highlight)) bars.forEach(function (b, i) { if (normWord(b.label) === normWord(p.highlight)) hl = i; });
    var times = landsFor(bars.map(function (b) { return { text: b.label, kw: b.keyword }; }), { start: 0.5, gap: 0.45 });
    var wHalf = ((n - 1) * spc) / 2 + bw * 0.5 + 0.2, cyW = ((maxP - maxN) / range) * Hm * 0.5;
    var plane = meshNode(planeMesh(wHalf + 0.35, bw * 1.6), mat("glass"), {});
    plane.mat = mat("glass", "#9FC9DD");
    ctx.add(plane);
    var zl = ctx.add(new Node("zero", {}));
    zl.draw = function (t, C, items, X) { var a = X.a * prog(t, 0.1, 0.8, "out"); emitLine(C, [-wHalf - 0.35, 0, bw * 0.75], [wHalf + 0.35, 0, bw * 0.75], rgba(C_ICE, 1), u(1.6), a * 0.85, items, null, -0.05); };
    var bm = boxMesh(bw / 2, 0.5, bw / 2, 0.035);
    bars.forEach(function (b, i) {
      var h = (b.value / range) * Hm, x = (i - (n - 1) / 2) * spc, sg = h < 0 ? -1 : 1, t0 = Math.max(0.15, times[i] - 0.8), isH = i === hl;
      var node = meshNode(bm, mat("ice", isH ? "#D4F1FF" : "#A6D9F0"), { pos: [x, 0, 0], opacity: hl >= 0 && !isH ? 0.72 : 1 });
      node.hook(function (t, s) { var g = prog(t, t0, 1.0, "out"), hh = Math.max(0.004, Math.abs(h) * g); s.scale[1] = hh; s.pos[1] = (sg * hh) / 2; });
      ctx.add(node);
      if (isH) {
        var gl = ctx.add(new Node("hl", {}));
        gl.draw = function (t, C, items, X) { var g = prog(t, t0, 1.0, "out"); emitGlow(C, [x, h * g, 0], bw * 1.6, C_ICE, X.a * 0.35 * g, items, -0.2); };
      }
      var vs = (b.value < 0 ? "\u2212" : "") + fmtNum(Math.abs(b.value), dec) + (unit ? (/^[%\u00b0]/.test(unit) ? "" : " ") + unit : "");
      textBlock(vs, { target: function (t) { var g = prog(t, t0, 1.0, "out"); return sg > 0 ? [x, h * g + 0.12, -bw / 2] : [x, h * g - 0.14, bw / 2]; }, view: ctx.view, align: "center", valign: sg > 0 ? "bottom" : "top", size: u(LAND ? 34 : 32), weight: 500, color: isH ? C_ICE : C_TEXT, at: t0 + 0.75, maxWidth: u(240), maxLines: 1, kind: "value" });
      textBlock(b.label, { target: sg > 0 ? [x, 0, bw * 0.75] : [x, 0, -bw * 0.6], view: ctx.view, align: "center", valign: sg > 0 ? "top" : "bottom", dy: sg > 0 ? u(16) : -u(18), size: u(LAND ? 25 : n > 4 ? 20 : 22), weight: 500, upper: true, track: u(1.2), color: C_MUTED, at: t0 + 0.2, maxWidth: Math.min(u(LAND ? 230 : 200), sa.w / n - u(14)), maxLines: 2, kind: "category" });
    });
    ctx.camera.set({ pitch: 13, yaw: -14, fov: 26, target: [0, cyW, 0] });
    ctx.camera.drift({ sway: 3, period: 26 });
    var be = boxView(wHalf + 0.35, Hm / 2 + 0.25, bw * 1.6, -14, 13);
    frameBox(ctx.camera, be[0], be[1] + 0.2, creg, 0.97);
    if (p.note) textBlock(str(p.note), { x: sa.x1, y: sa.y1, align: "right", valign: "bottom", size: u(20), weight: 400, color: C_MUTED, at: 0.6, maxWidth: sa.w * 0.5, maxLines: 1, kind: "note" });
  };

  TPL.timeline = function (root, p) {
    var ctx = scene(root, {}), sa = safe();
    var ev = arr(p.events).slice(0, 6).map(function (e) { e = obj(e); return { date: str(e.date), label: str(e.label), keyword: e.keyword }; }).filter(function (e) { return e.date || e.label; });
    if (!ev.length) ev = [{ date: "Start", label: "" }, { date: "End", label: "" }];
    var n = ev.length, title = p.title ? say(str(p.title), { at: 0.3 }) : null, top = title ? title.y + title.h + u(30) : sa.y0;
    var times = landsFor(ev.map(function (e) { return { text: e.date + " " + e.label, kw: e.keyword || e.date }; }), { start: 0.5, gap: 0.55 });
    var step = 1.8, L = (n - 1) * step, pos = ev.map(function (e, i) { var d = -L / 2 + i * step; return LAND ? [d, 0, 0] : [0, 0, -d]; });
    var rail = ctx.add(new Node("rail", {}));
    var head = function (t) {
      if (t <= times[0] - 0.6) return 0;
      for (var i = n - 1; i >= 1; i--) if (t >= times[i] - 0.7) return i - 1 + prog(t, times[i] - 0.7, 0.7, "inOut");
      return 0;
    };
    var ext = 0.6, a0 = LAND ? [-L / 2 - ext, 0, 0] : [0, 0, L / 2 + ext], a1 = LAND ? [L / 2 + ext, 0, 0] : [0, 0, -L / 2 - ext];
    rail.draw = function (t, C, items, X) {
      var a = X.a * prog(t, 0, 0.9, "out");
      emitLine(C, a0, a1, rgba(C_ICE, 1), u(1.4), a * 0.35, items, null, 1);
      var h = head(t), f = h / Math.max(1, n - 1), pe = vlerp(pos[0], pos[n - 1], f);
      if (t >= times[0] - 0.6) {
        emitLine(C, pos[0], pe, rgba(C_ICE, 1), u(2.4), a * 0.9, items, null, 0.5);
        emitGlow(C, pe, 0.5, C_ICE, a * 0.55, items, -0.1);
      }
      ev.forEach(function (e, i) {
        var lit = prog(t, times[i] - 0.15, 0.5, "out");
        emitGlow(C, pos[i], 0.42, C_ICE, a * (0.08 + 0.4 * lit), items, -0.05);
      });
    };
    var mk = mat("gloss", "#BFEAFF");
    ev.forEach(function (e, i) {
      var b = ballNode("sphere", 0.1, mk, { pos: pos[i] });
      b.enter(Math.max(0.1, times[i] - 0.5), "fade", 0.5);
      ctx.add(b);
      var lab = e.label || e.date;
      label(lab, { target: b, kicker: e.label ? e.date : null, at: times[i], dir: LAND ? (i % 2 ? "down" : "up") : "up", side: LAND ? "right" : i % 2 ? "left" : "right", stem: LAND, len: u(LAND ? 84 : 54), maxWidth: u(LAND ? Math.min(330, 1500 / n) : 360) });
    });
    if (LAND) ctx.camera.set({ pitch: 12, yaw: -12, fov: 26 });
    else ctx.camera.set({ pitch: 34, yaw: 8, fov: 26 });
    ctx.camera.drift({ sway: 2.5, period: 24 });
    var te = LAND ? boxView(L / 2 + ext, 0.6, 0.3, -12, 12) : boxView(0.3, 0.3, L / 2 + ext, 8, 34);
    frameBox(ctx.camera, te[0], te[1], LAND ? region(sa.x0 + u(40), top + u(120), sa.x1 - u(260), sa.y1 - u(120)) : region(sa.x0, top + u(100), sa.x1, sa.y1 - u(80)), 0.95);
  };

  TPL["title-card"] = function (root, p) {
    var ctx = scene(root, {}), sa = safe(), bd = str(p.backdrop).toLowerCase() || "ice-cube", node;
    if (bd === "lattice" || bd === "crystal-lattice") { node = lattice({ layers: 3, radius: 2.2, buildFrom: -1, buildTo: -0.5, dof: 1.1 }); node.spin(3); ctx.view.dof = 1; }
    else if (bd === "molecule") { node = molecule({ preset: "water" }); node.hook(function (t, s) { s.rot[1] += 30 * Math.sin((TAU * t) / 20); }); }
    else { var nm = objKey(bd, "ice-cube"); node = object3d(nm, { material: matKey(p.material, OBJ_MAT[nm]) }); node.spin(8); }
    node.enter(0, "fade", 1.4);
    ctx.add(node);
    ctx.view.alpha = 0.82;
    ctx.camera.set({ pitch: 14, yaw: -14, fov: 28 });
    ctx.camera.drift({ yaw: 1.2, dist: -0.008 });
    var maxW = LAND ? W * 0.44 : sa.w;
    var Lk = p.kicker ? layoutText(str(p.kicker), { size: u(24), weight: 600, upper: true, track: u(3.6), maxWidth: maxW, maxLines: 1 }) : null;
    var Lt = layoutText(str(p.title) || "Deep Zoom", { size: u(LAND ? 96 : 92), weight: 300, maxWidth: maxW, maxLines: 3, track: -u(1), lh: 1.08 });
    var Ls = p.subtitle ? layoutText(str(p.subtitle), { size: u(LAND ? 34 : 36), weight: 400, maxWidth: maxW, maxLines: 3, lh: 1.3 }) : null;
    var gap = u(26), blockH = (Lk ? Lk.h + gap * 1.4 : 0) + Lt.h + (Ls ? gap + Ls.h : 0);
    var x = sa.x0, y = LAND ? sa.cy - blockH / 2 + u(20) : sa.y1 - blockH;
    var objReg = LAND ? region(W * 0.5, sa.y0, sa.x1, sa.y1) : region(sa.x0, sa.y0, sa.x1, y - u(40));
    frameCam(ctx.camera, node.r, objReg, LAND ? 0.92 : 0.9);
    var tT = clamp(labelTime(p.title, p.keyword) != null ? labelTime(p.title, p.keyword) - 0.3 : 0.5, 0.35, 1.2);
    if (Lk) {
      textBlock(str(p.kicker), { x: x, y: y, size: u(24), weight: 600, upper: true, track: u(3.6), color: C_ICE, at: 0.3, maxWidth: maxW, maxLines: 1, kind: "kicker" });
      y += Lk.h + gap * 0.8;
    }
    textBlock(str(p.title) || "Deep Zoom", { x: x, y: y, size: u(LAND ? 96 : 92), weight: 300, maxWidth: maxW, maxLines: 3, track: -u(1), lh: 1.08, at: tT, stagger: 0.08, kind: "title" });
    y += Lt.h + gap;
    if (Ls) textBlock(str(p.subtitle), { x: x, y: y, size: u(LAND ? 34 : 36), weight: 400, color: C_MUTED, maxWidth: maxW, maxLines: 3, lh: 1.3, at: tT + 0.7, kind: "subtitle" });
  };

  TPL["quote-card"] = function (root, p) {
    stage(root, { dust: { count: LAND ? 64 : 56 } });
    var sa = safe(), v = addView({ camera: { dist: 6 } });
    st.main = v;
    var lightN = v.add(new Node("light", {}));
    lightN.draw = function (t, C, items) {
      var x = W * (0.32 + 0.36 * Math.sin(t * 0.07 + 0.6)), y = H * (0.36 + 0.08 * Math.sin(t * 0.05)), r = MIN * 0.9;
      items.push({ t: 1, z: 1e6, img: glowSpr([0.35, 0.55, 0.8]), x: x - r, y: y - r, w: r * 2, h: r * 2, a: 0.16 });
    };
    var q = str(p.quote) || "Look closer.", maxW = LAND ? sa.w * 0.7 : PORT ? sa.w * 0.94 : sa.w * 0.82;
    var Lq = layoutText(q, { size: u(LAND ? 58 : 56), weight: 900, maxWidth: maxW, maxLines: 6, lh: 1.08, stack: false });
    var La = p.author ? layoutText(str(p.author), { size: u(24), weight: 600, upper: true, track: u(3.2), maxWidth: maxW, maxLines: 1 }) : null;
    var Lr = p.role ? layoutText(str(p.role), { size: u(26), weight: 400, maxWidth: maxW, maxLines: 2 }) : null;
    var markS = u(LAND ? 150 : 140), blockH = markS * 0.5 + Lq.h + (La ? u(60) + La.h : 0) + (Lr ? u(10) + Lr.h : 0);
    var QL = !PORT, x = W / 2 - Lq.w / 2, y = sa.cy - blockH / 2;
    if (!QL) { x = sa.x0; y = sa.cy - blockH / 2; }
    var at = clamp(when(p.keyword, 0.06), 0.3, 1.2), toks = parseEm(q), prev = 0, times = [], found = 0;
    toks.forEach(function (tk, i) { var f = V.find(tk.w.replace(/[^\p{L}\p{N}']/gu, ""), prev); if (f != null && f >= prev) { times.push(f - 0.05); prev = f; found++; } else times.push(null); });
    var useSync = toks.length && found / toks.length > 0.6;
    if (useSync) { var last = at; times = times.map(function (tt) { if (tt == null) tt = last + 0.12; tt = Math.max(tt, last); last = tt; return Math.min(tt, D - 1.6); }); }
    else times = null;
    addOverlay({
      kind: "quote-mark", label: "quote", at: 0.2,
      draw: function (g, t) {
        var a = prog(t, 0.2, 0.9, "out");
        g.globalAlpha = a * 0.75; setFont(g, markS * 1.2, 900, 0); g.fillStyle = rgba(C_ICE, 1); g.textBaseline = "alphabetic"; g.textAlign = "left";
        g.fillText("\u201c", x - (QL ? markS * 0.42 : 0), y + markS * 0.62);
      },
    });
    var qy = y + markS * 0.5;
    addOverlay({
      kind: "quote", label: q, L: Lq, at: at,
      draw: function (g, t) { drawText(g, Lq, QL ? x : sa.x0, qy, "left", C_TEXT, 1, t, at, { stagger: Math.min(0.12, (D - 2.5 - at) / Math.max(1, Lq.n)), fade: 0.7, times: times }); },
      box: function (t) { return t < at ? null : { x: QL ? x : sa.x0, y: qy, w: Lq.w, h: Lq.h }; },
      moving: function (t) { return t < at + 1; },
    });
    var ay = qy + Lq.h + u(60), tA = useSync ? Math.min(D - 1.4, times[times.length - 1] + 0.4) : Math.min(D - 1.4, at + Lq.n * 0.1 + 0.4);
    if (La) {
      textBlock(str(p.author), { x: QL ? x : sa.x0, y: ay, size: u(24), weight: 600, upper: true, track: u(3.2), color: C_ICE, at: tA, maxWidth: maxW, maxLines: 1, kind: "author" });
      if (Lr) textBlock(str(p.role), { x: QL ? x : sa.x0, y: ay + La.h + u(10), size: u(26), weight: 400, color: C_MUTED, at: tA + 0.2, maxWidth: maxW, maxLines: 2, kind: "role" });
    }
  };

  TPL["cause-chain"] = function (root, p) {
    var ctx = scene(root, {}), sa = safe();
    var steps = arr(p.steps).slice(0, 5).map(function (s) { s = obj(s); return { label: str(s.label), note: str(s.note), object: s.object, material: s.material, keyword: s.keyword }; }).filter(function (s) { return s.label; });
    if (steps.length < 2) steps = [{ label: "Cause" }, { label: "Effect" }];
    var n = steps.length, title = p.title ? say(str(p.title), { at: 0.3 }) : null, top = title ? title.y + title.h + u(30) : sa.y0;
    var times = landsFor(steps.map(function (s) { return { text: s.label, kw: s.keyword }; }), { start: 0.5, gap: 0.7 });
    var cyc = ["ice-cube", "drop", "crystal", "sphere", "snowflake"], stepW = LAND ? 2.6 : 1.85, nodes = [];
    var pos = steps.map(function (s, i) { var d = (i - (n - 1) / 2) * stepW; return LAND ? [d, 0, 0] : [0, -d, 0]; });
    steps.forEach(function (s, i) {
      var nm = objKey(s.object, cyc[i % cyc.length]), node = object3d(nm, { material: matKey(s.material, OBJ_MAT[nm]), pos: pos[i], scale: 0.78 });
      node.subject = true; node.label = s.label;
      node.enter(Math.max(0.05, times[i] - 0.7), "rise", 0.9);
      node.spin(i % 2 ? -10 : 10);
      ctx.add(node);
      nodes.push(node);
      var anchorPt = LAND ? [0, -0.78 * 1.12, 0] : [-0.78 * 1.15, 0, 0];
      var tgt = function (t) { var X = node.worldXf(t); return add(pos[i], mul(anchorPt, X.st ? 1 : 1)); };
      textBlock(s.label, { target: tgt, view: ctx.view, align: LAND ? "center" : "right", valign: LAND ? "top" : "middle", dy: LAND ? u(18) : s.note ? -u(16) : 0, dx: LAND ? 0 : -u(26), size: u(LAND ? 30 : 34), weight: 500, maxWidth: LAND ? u(300) : u(500), maxLines: 2, at: times[i] - 0.1, kind: "step" });
      if (s.note) textBlock(s.note, { target: tgt, view: ctx.view, align: LAND ? "center" : "right", valign: "top", dy: LAND ? u(66) : u(16), dx: LAND ? 0 : -u(26), size: u(24), weight: 400, color: C_MUTED, maxWidth: LAND ? u(300) : u(500), maxLines: 2, at: times[i] + 0.3, kind: "note" });
    });
    var links = ctx.add(new Node("links", {}));
    links.draw = function (t, C, items, X) {
      for (var i = 1; i < n; i++) {
        var a0 = times[i] - 1.0, pr = prog(t, a0, 0.8, "inOut");
        if (pr <= 0) continue;
        var A = pos[i - 1], B = pos[i], ctl = LAND ? [(A[0] + B[0]) / 2, 0.95, 0.2] : [(A[0] + B[0]) / 2 + 1.0, (A[1] + B[1]) / 2, 0.3];
        var pts = [], head = null, K = 28;
        for (var k = 0; k <= K; k++) {
          var f = (k / K) * pr, w = 1 - f, P3 = [w * w * A[0] + 2 * w * f * ctl[0] + f * f * B[0], w * w * A[1] + 2 * w * f * ctl[1] + f * f * B[1], w * w * A[2] + 2 * w * f * ctl[2] + f * f * B[2]];
          var s = project(C, P3);
          if (s) pts.push([s[0], s[1]]);
          head = P3;
        }
        var trim = Math.floor(pts.length * 0.16);
        var shown = pts.slice(Math.min(trim, pts.length - 1), Math.max(trim + 1, pts.length - (pr >= 1 ? trim : 0)));
        if (shown.length > 1) items.push({ t: 3, z: 1e5, pts: shown, c: rgba(C_ICE, 1), w: u(1.6), a: X.a * 0.7 });
        if (pr < 1 && head) emitGlow(C, head, 0.35, C_ICE, X.a * 0.8, items, -10);
      }
    };
    ctx.camera.set({ pitch: 8, yaw: -6, fov: 28 });
    ctx.camera.drift({ sway: 3, period: 24 });
    var reg = LAND ? region(sa.x0 + u(80), top, sa.x1 - u(80), sa.y1 - u(90)) : region(sa.x0 + sa.w * 0.56, top + u(110), sa.x1 - u(10), sa.y1 - u(70));
    if (LAND) frameBox(ctx.camera, ((n - 1) * stepW) / 2 + 1.0, 1.0, reg, 0.95);
    else frameBox(ctx.camera, 1.3, ((n - 1) * stepW) / 2 + 1.0, reg, 1.0);
  };

  // Thumbnail: one dramatic still (render it at 1280x720 from wide). Big hero with a strong backlight and rim,
  // 2 to 4 words of very large outlined caps on a dark backing, optional X strike or arrow on a word or the hero.
  TPL.thumbnail = function (root, p) {
    var ctx = scene(root, { transitions: false, dust: { count: 26, alpha: 0.8 } }), sa = safe();
    ctx.camera.life = false;
    var hero = str(p.hero).toLowerCase() || "ice-cube", node, R, sl = str(p.slider), right = str(p.side) !== "right";
    if (hero === "crystal-lattice" || hero === "lattice") {
      node = lattice({ layers: 3, radius: 2.2, buildFrom: -1, buildTo: -0.6, disorder: sl === "boot-sole" || sl === "skate-blade" ? 0.75 : 0, disorderAt: -6, dof: 0.5 });
      R = node.r;
    } else if (hero === "molecule") { node = molecule({ preset: str(p.preset) || "water" }); node.base.rot = [0, -20, 0]; R = node.r; }
    else { var nm = objKey(hero, "ice-cube"); node = object3d(nm, { material: matKey(p.material, OBJ_MAT[nm]) }); node.shadow = true; node.reflect = true; ctx.view.reflect = 0.3; R = node.r; }
    node.subject = false; // a thumbnail hero bleeds off the frame on purpose
    ctx.add(node);
    if ((sl === "boot-sole" || sl === "skate-blade") && node.radiusXZ) {
      var so = object3d(sl, { rest: sl === "boot-sole" ? [0, 8, 0] : [0, 0, 0] }), ssz = node.radiusXZ * (sl === "boot-sole" ? 0.62 : 0.5);
      so.base.scale = [ssz, ssz, ssz]; so.base.pos = [node.radiusXZ * 0.05, node.topY + ssz * 0.16, 0];
      ctx.add(so);
    }
    // strong backlight and rim: a big cool glow behind the hero, a warmer kick from one side
    var back = ctx.add(new Node("backlight", {}));
    back.draw = function (t, C, items, X) {
      emitGlow(C, [0, 0, -R * 0.6], R * 3.2, [0.45, 0.72, 1], 0.55, items, R * 4);
      emitGlow(C, [R * 0.9, R * 0.5, -R * 0.4], R * 1.6, [1, 0.62, 0.45], 0.16, items, R * 4);
    };
    ctx.camera.set({ pitch: hero === "molecule" ? 6 : 16, yaw: -16, fov: 30 });
    var heroReg = LAND ? (right ? region(W * 0.42, sa.y0 - u(20), W * 0.98, sa.y1 + u(20)) : region(W * 0.02, sa.y0 - u(20), W * 0.58, sa.y1 + u(20))) : region(sa.x0, sa.y0, sa.x1, sa.y0 + sa.h * 0.56);
    frameCamRaw(ctx.camera, R, heroReg, node.radiusXZ ? 1.3 : 1.05);
    if (ctx.view.reflect) ctx.view.floor = node.lo - node.r * 0.03;
    // text block
    var words = str(p.text) || "Why is ice *slippery*?";
    var maxW = LAND ? W * 0.5 : sa.w;
    var L = layoutText(words, { size: u(LAND ? 190 : 170), weight: 900, maxWidth: maxW, maxLines: 4 });
    var tx = LAND ? (right ? sa.x0 : sa.x1 - L.w) : W / 2 - L.w / 2, ty = LAND ? H / 2 - L.h / 2 : sa.y0 + sa.h * 0.6 + (sa.h * 0.4 - L.h) / 2;
    if (!LAND) ty = Math.min(ty, sa.y1 - L.h);
    var mk = obj(p.mark), mtype = str(mk.type), mtarget = str(mk.target) || "word", mword = Math.round(num(mk.word, 0));
    function wordBox() {
      var k = 0, out = null;
      L.lines.forEach(function (ln) { ln.ws.forEach(function (wd) { if (k++ === mword) out = { x: tx + (ln.w ? 0 : 0) + wd.x, y: ty + ln.y - ln.size * 0.78, w: wd.ww, h: ln.size * 0.8 }; }); });
      return out;
    }
    function heroBox(t) { var sc = node.screen(t); return sc ? { x: sc.x - sc.r * 0.7, y: sc.y - sc.r * 0.7, w: sc.r * 1.4, h: sc.r * 1.4, cx: sc.x, cy: sc.y, r: sc.r } : null; }
    addOverlay({
      kind: "thumb-text", label: words,
      draw: function (g, t) {
        // dark backing behind the words for readability at 320 px wide
        var gx = LAND ? (right ? 0 : W) : W / 2, gy = LAND ? H / 2 : ty + L.h / 2, rr = LAND ? W * 0.62 : H * 0.42;
        var gr = g.createRadialGradient(gx, gy, 0, gx, gy, rr);
        gr.addColorStop(0, "rgba(2,4,8,0.78)"); gr.addColorStop(0.55, "rgba(2,4,8,0.5)"); gr.addColorStop(1, "rgba(2,4,8,0)");
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
        drawText(g, L, tx, ty, "left", C_WHITE, 1, t, null, { outline: 0.11 });
        if (!mtype) return;
        var B = mtarget === "object" ? heroBox(t) : wordBox();
        if (!B) return;
        g.lineCap = "round"; g.lineJoin = "round";
        function stroke(path, wdt) { g.strokeStyle = "rgba(2,4,8,0.9)"; g.lineWidth = wdt * 1.7; path(); g.stroke(); g.strokeStyle = rgba(C_CORAL, 1); g.lineWidth = wdt; path(); g.stroke(); }
        if (mtype === "x") {
          var px = B.w * 0.06, py = B.h * 0.1, wx = u(LAND ? 18 : 16);
          stroke(function () { g.beginPath(); g.moveTo(B.x - px, B.y - py); g.lineTo(B.x + B.w + px, B.y + B.h + py); }, wx);
          stroke(function () { g.beginPath(); g.moveTo(B.x + B.w + px, B.y - py); g.lineTo(B.x - px, B.y + B.h + py); }, wx);
        } else if (mtype === "arrow") {
          var hb = heroBox(t), wb = wordBox() || { x: tx, y: ty, w: L.w, h: L.h };
          if (!hb) return;
          var fromText = mtarget === "object", sx0, sy0, ex, ey, cx, cy, aw = u(LAND ? 20 : 17);
          if (fromText) {
            // from under the words, sweeping low, into the hero's near side
            sx0 = tx + L.w * (right ? 0.45 : 0.55); sy0 = ty + L.h + u(34);
            ex = hb.cx + (LAND ? (right ? -1 : 1) * hb.r * 0.62 : 0); ey = LAND ? hb.cy + hb.r * 0.32 : hb.cy + hb.r * 0.8;
            cx = (sx0 + ex) / 2; cy = Math.max(sy0, ey) + u(LAND ? 150 : 90);
          } else {
            sx0 = hb.cx; sy0 = hb.cy - hb.r * 0.6; ex = wb.x + wb.w / 2; ey = wb.y - u(26);
            cx = (sx0 + ex) / 2; cy = Math.min(sy0, ey) - u(LAND ? 140 : 80);
          }
          stroke(function () { g.beginPath(); g.moveTo(sx0, sy0); g.quadraticCurveTo(cx, cy, ex, ey); }, aw);
          var ang = Math.atan2(ey - cy, ex - cx), hl = aw * 3.2;
          stroke(function () { g.beginPath(); g.moveTo(ex - Math.cos(ang - 0.5) * hl, ey - Math.sin(ang - 0.5) * hl); g.lineTo(ex, ey); g.lineTo(ex - Math.cos(ang + 0.5) * hl, ey - Math.sin(ang + 0.5) * hl); }, aw);
        }
      },
      box: function () { return { x: tx, y: ty, w: L.w, h: L.h }; },
      moving: function () { return false; },
    });
  };

  // ------------------------- public API -------------------------
  function render(id, root, props) {
    var fn = TPL[id];
    if (!fn) throw new Error("Unknown deep-zoom template: " + id);
    var P0 = T(props);
    fn(root || V.root(), P0);
    if (P0.source && id !== "thumbnail") source(P0.source);
  }
  function fallback(root, narration) {
    registered = false;
    st = null;
    var ctx = scene(root, {});
    var node = object3d("ice-cube", {});
    node.subject = true; node.shadow = true; node.spin(10); node.enter(0, "rise", 1.0);
    ctx.add(node);
    var sa = safe();
    ctx.camera.set({ pitch: 13, yaw: -12, fov: 28 });
    frameCam(ctx.camera, node.r, region(sa.x0, sa.y0 + sa.h * 0.18, sa.x1, sa.y1), 0.7);
    ctx.view.floor = -node.r * 1.12;
    var words = contentWords(narration || V.narration).slice(0, 4).join(" ");
    if (words) say(words, { at: 0.3 });
  }
  S.scene = scene;
  S.view = function (o) { return addView(o); };
  S.camera = function (v) { return (v || (st && st.main) || ensure() && st.views[0] || addView({})).cam; };
  S.Camera = Camera;
  S.mesh = mesh;
  S.object = object3d;
  S.lattice = lattice;
  S.molecule = molecule;
  S.particles = particles;
  S.atom = atomNode;
  S.nucleus = nucleusNode;
  S.quarks = quarksNode;
  S.dive = dive;
  S.label = label;
  S.say = say;
  S.text = textBlock;
  S.rule = rule;
  S.lowerThird = lowerThird;
  S.number = number;
  S.source = source;
  S.node = function (drawFn, o) {
    var n = new Node("custom", o);
    if (typeof drawFn === "function") n.draw = function (t, C, items, X) { drawFn(t, { C: C, items: items, X: X, project: function (p) { return project(C, p); }, line: function (a, b, o2) { o2 = obj(o2); emitLine(C, a, b, rgba(colorOf(o2.color, C_ICE), 1), num(o2.width, u(1.5)), num(o2.alpha, 0.8) * X.a, items, o2.dash || null); }, glow: function (p, size, col, a) { emitGlow(C, p, size, colorOf(col, C_ICE), num(a, 0.5) * X.a, items); } }); };
    return n;
  };
  S.frameSubject = function (cam, R, reg, fill, rect) { return frameCam(cam, R, reg, fill, rect); };
  S.when = when;
  S.syncTimes = syncTimes;
  S.lands = function (items, o) { return landsFor(arr(items).map(function (it) { return typeof it === "string" ? { text: it } : { text: str(obj(it).text), kw: obj(it).keyword }; }), o); };
  S.measureBlock = function (text, o) { var L = layoutText(text, obj(o)); return { w: L.w, h: L.h, size: L.size, lines: L.lines.length }; };
  S.measureText = function (text, size, weight) { return tw(str(text), num(size, u(40)), num(weight, 400), 0); };
  S.safe = safe;
  S.u = u;
  S.ease = EASE;
  S.palette = PAL;
  S.colorOf = colorOf;
  S.materials = Object.keys(MATS).filter(function (k) { return k !== "light"; });
  S.objects = OBJ_NAMES.slice();
  S.levels = LEVEL_KINDS.slice();
  S.presets = Object.keys(PRESETS);
  S.templates = Object.keys(TPL);
  S.stage = function () { return st; };
  S.render = render;
  S.fallback = fallback;
  S.flush = function () { if (st) { layoutOverlays(); frame(V.time()); } };
  // Screen boxes on screen at time t: hero objects (bounding circle), headlines, labels, numbers, text blocks.
  // Lattices, particle fields and dive levels are texture and are left out.
  S.inspect = function (t) {
    if (!st) return [];
    if (!st.laid) layoutOverlays();
    var out = [];
    st.views.forEach(function (v) {
      v.nodes.forEach(function (n) {
        if (!n.subject) return;
        var sc = n.screen(t);
        if (!sc || sc.a < 0.3) return;
        out.push({ kind: "object", label: n.label, x: sc.x - sc.r, y: sc.y - sc.r, w: sc.r * 2, h: sc.r * 2, moving: v.cam.moving(t) || (n.inT != null && t < n.inT + n.inD) });
      });
    });
    st.over.forEach(function (ov) {
      if (!ov.box) return;
      var b = ov.box(t);
      if (!b) return;
      out.push({ kind: ov.kind, label: ov.label, x: b.x, y: b.y, w: b.w, h: b.h, moving: ov.moving ? !!ov.moving(t) : false });
    });
    return out;
  };
})();

// ───────────────────────── tween.js: a tiny frame-exact tween timeline (Susanoo Reel Kit talking engine) ─────────────────────────
// A timeline of tweens at ABSOLUTE times. seek(t) is a pure function of t: every property's value is computed from the tweens on
// it (no recorded state, no clock), so frames render identically in any order.
//
//   const tl = TW.timeline();
//   tl.fromTo(el, { autoAlpha: 0, y: 30 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'back.out(1.7)' }, 2.5);
//   tl.to(el, { x: 200, duration: 0.3, ease: 'expo.out' }, 3.1);      // starts from wherever el is at 3.1 s
//   tl.set(el, { autoAlpha: 0 }, 5);                                   // a jump
//   tl.seek(t);                                                         // writes the styles for time t
//
// Rules (per element + property):
//   · after a tween starts, it owns the value (a later-starting tween takes over from its start); between tweens the last one holds
//   · before the FIRST tween: a fromTo shows its "from" values (immediateRender, default) unless immediateRender: false; otherwise
//     the element's own value at the moment the tween was added
//   · a to() starts from the value the earlier tweens give at its start time (computed once, cached)
// Properties: autoAlpha (opacity + visibility), opacity, x, y (px), scale, scaleX, scaleY, rotation (deg) → one transform
// "translate(x,y) rotate(r) scale(sx,sy)" (don't also set a CSS transform on a tweened element; wrap it instead),
// width/height/left/top/right/bottom/fontSize (px), strokeDashoffset, colours (hex/rgb/rgba), and any string with numbers in the
// same pattern (clipPath 'inset(0% 100% 0% 0%)', filter 'blur(4px)', backgroundSize, ...). Non-matching strings switch at the start.
// Vars: duration (s, default 0.5), ease (default 'power1.out'), immediateRender, repeat (n), yoyo, delay (added to the time).
(function () {
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

  // ── eases: none/linear · power0-4 · quad cubic quart quint · sine · expo · circ · back(N) · elastic(a,p) · bounce · steps(n)
  //    each with .in / .out / .inOut ('power2' alone = .out). Example: parseEase('back.out(2.2)')(0.5)
  const outOf = (f) => (x) => 1 - f(1 - x), inOutOf = (f) => (x) => (x < 0.5 ? f(x * 2) / 2 : 1 - f((1 - x) * 2) / 2);
  const bounceOut = (x) => { const n = 7.5625, d = 2.75; if (x < 1 / d) return n * x * x; if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75; if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375; return n * (x -= 2.625 / d) * x + 0.984375; };
  const BASE = {   // "in" curves
    power0: () => (x) => x, linear: () => (x) => x, none: () => (x) => x,
    power1: () => (x) => x * x, quad: () => (x) => x * x,
    power2: () => (x) => x * x * x, cubic: () => (x) => x * x * x,
    power3: () => (x) => x ** 4, quart: () => (x) => x ** 4,
    power4: () => (x) => x ** 5, quint: () => (x) => x ** 5, strong: () => (x) => x ** 5,
    sine: () => (x) => 1 - Math.cos((x * Math.PI) / 2),
    expo: () => (x) => (x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, 10 * (x - 1)) - 0.001 * (1 - x)),
    circ: () => (x) => 1 - Math.sqrt(1 - x * x),
    back: (s = 1.70158) => (x) => x * x * ((s + 1) * x - s),
    elastic: (a = 1, p = 0.3) => { a = Math.max(1, a); const s = (p / (2 * Math.PI)) * Math.asin(1 / a); return (x) => (x <= 0 ? 0 : x >= 1 ? 1 : -(a * Math.pow(2, 10 * (x -= 1)) * Math.sin(((x - s) * 2 * Math.PI) / p))); },
    bounce: () => (x) => 1 - bounceOut(1 - x),
  };
  const CACHE = {};
  function parseEase(name) {
    if (typeof name === 'function') return name;
    const key = String(name == null ? 'power1.out' : name).replace(/\s+/g, '');
    if (CACHE[key]) return CACHE[key];
    let f;
    const st = key.match(/^steps\((\d+)\)$/);
    if (st) { const n = +st[1]; f = (x) => (x >= 1 ? 1 : Math.floor(x * n) / n); }
    else {
      const m = key.match(/^([a-z0-9]+)(?:\.(in|out|inOut|easeIn|easeOut|easeInOut))?(?:\(([^)]*)\))?$/i);
      const b = m && BASE[m[1].toLowerCase()];
      if (!b) { console.error('[warn] unknown ease "' + name + '", using power1.out'); return (CACHE[key] = parseEase('power1.out')); }
      const args = m[3] ? m[3].split(',').map(Number).filter((v) => isFinite(v)) : [];
      const fin = b(...args), dir = (m[2] || 'out').replace('ease', '').replace(/^./, (c) => c.toLowerCase());
      f = dir === 'in' ? fin : dir === 'inOut' ? inOutOf(fin) : outOf(fin);
      if (/^(none|linear|power0)$/i.test(m[1])) f = (x) => x;
    }
    return (CACHE[key] = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : f(x)));
  }

  // ── values
  const TRANSFORM = new Set(['x', 'y', 'scale', 'scaleX', 'scaleY', 'rotation']);
  const PX = new Set(['x', 'y', 'width', 'height', 'left', 'top', 'right', 'bottom', 'fontSize', 'borderRadius', 'marginTop', 'marginLeft']);
  const SPECIAL = new Set(['duration', 'ease', 'immediateRender', 'repeat', 'yoyo', 'delay', 'overwrite']);
  const DEF = { x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, rotation: 0, autoAlpha: 1, opacity: 1, strokeDashoffset: 0 };
  const NUM = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;
  const hexRgba = (s) => String(s).replace(/#([0-9a-f]{3,8})\b/gi, (_, h) => {
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    const v = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)), a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return `rgba(${v[0]},${v[1]},${v[2]},${+a.toFixed(3)})`;
  }).replace(/rgb\(([^)]+)\)/g, 'rgba($1,1)');
  function lerpVal(a, b, k) {
    if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * k;
    const A = hexRgba(a), B = hexRgba(b), na = A.match(NUM) || [], nb = B.match(NUM) || [];
    if (na.length && na.length === nb.length && A.replace(NUM, '#') === B.replace(NUM, '#')) {
      let i = 0;
      return B.replace(NUM, (m) => { const v = +na[i] + (+nb[i] - +na[i]) * k; i++; return String(+v.toFixed(4)); })
        .replace(/rgba\(([^)]+)\)/g, (m, p) => 'rgba(' + p.split(',').map((x, j) => (j < 3 ? Math.round(+x) : clamp(+x)).toString()).join(',') + ')');
    }
    return k > 0 ? b : a;
  }
  const num = (v) => (typeof v === 'string' && /^-?\d*\.?\d+(px|deg)?$/.test(v.trim()) ? parseFloat(v) : v);
  const cssName = (p) => p.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

  function timeline() {
    const tracks = new Map();          // target → Map(prop → { base, tweens: [] })
    let seq = 0, end = 0;
    const baseOf = (el, p) => {
      if (p in DEF && (TRANSFORM.has(p) || p === 'autoAlpha' || p === 'opacity' || p === 'strokeDashoffset')) {
        if (p === 'autoAlpha' || p === 'opacity') { const o = el.style && el.style.opacity; return o !== '' && o != null ? +o : 1; }
        if (p === 'strokeDashoffset') { const o = el.style && el.style.strokeDashoffset; return o ? parseFloat(o) : 0; }
        return DEF[p];
      }
      let v = el.style && el.style[p];
      if (!v && el.isConnected) { try { v = getComputedStyle(el)[p]; } catch (e) { v = ''; } }
      return num(v || (PX.has(p) ? 0 : ''));
    };
    const track = (el, p) => {
      let m = tracks.get(el); if (!m) tracks.set(el, (m = new Map()));
      let tr = m.get(p); if (!tr) m.set(p, (tr = { base: baseOf(el, p), tweens: [], sorted: true })); return tr;
    };
    const targets = (t) => (t == null ? [] : typeof t === 'string' ? [...document.querySelectorAll(t)] : t.length !== undefined && !t.style ? [...t] : [t]);
    function add(target, from, to, at, kind) {
      if (typeof at !== 'number' || !isFinite(at)) { console.error('[warn] tween time must be a number of seconds (got ' + at + ')'); at = 0; }
      at += +(to.delay || 0);
      const d = Math.max(0, to.duration ?? (kind === 'set' ? 0 : 0.5)), ease = parseEase(to.ease ?? 'power1.out');
      const rep = Math.max(0, Math.floor(to.repeat || 0)), total = d * (rep + 1);
      end = Math.max(end, at + total);
      for (const el of targets(target)) {
        const props = new Set([...Object.keys(to), ...Object.keys(from || {})].filter((p) => !SPECIAL.has(p)));
        for (const p of props) {
          const tr = track(el, p);
          tr.tweens.push({ at, d, total, rep, yoyo: !!to.yoyo, ease, seq: seq++, kind, imm: kind === 'fromTo' ? to.immediateRender !== false : false,
            from: from && p in from ? num(from[p]) : undefined, to: p in to ? num(to[p]) : from && p in from ? num(from[p]) : undefined });   // a from-only prop holds its value
          tr.sorted = false;
        }
      }
      return api;
    }
    // value of a track at time t (pure)
    function valueAt(tr, t) {
      if (!tr.sorted) { tr.tweens.sort((a, b) => a.at - b.at || a.seq - b.seq); tr.tweens.forEach((w, i) => (w.i = i)); tr.sorted = true; }
      const tw = tr.tweens;
      let k = -1; for (let i = 0; i < tw.length; i++) { if (tw[i].at <= t + 1e-9) k = i; else break; }
      if (k < 0) { const f = tw[0]; return f && f.imm && f.from !== undefined ? f.from : tr.base; }
      return tweenAt(tr, tw[k], t);
    }
    function startOf(tr, w) {
      if (w.from !== undefined) return w.from;
      if (w._start === undefined) w._start = w.i > 0 ? tweenAt(tr, tr.tweens[w.i - 1], w.at) : (tr.base);
      return w._start;
    }
    function tweenAt(tr, w, t) {
      const a = startOf(tr, w), b = w.to !== undefined ? w.to : tr.base;
      if (w.total <= 0) return b;
      const lt = t - w.at;
      let p;
      if (lt >= w.total) p = w.yoyo && w.rep % 2 === 1 ? 0 : 1;
      else { const c = Math.floor(lt / w.d); p = (lt - c * w.d) / w.d; if (w.yoyo && c % 2 === 1) p = 1 - p; }
      return lerpVal(a, b, w.ease(clamp(p)));
    }
    function seek(t) {
      for (const [el, m] of tracks) {
        let tf = null, st = el.style; if (!st) continue;
        for (const [p, tr] of m) {
          const v = valueAt(tr, t);
          if (TRANSFORM.has(p)) { (tf || (tf = {}))[p] = v; continue; }
          if (p === 'autoAlpha') { const o = +(+v).toFixed(4); set(el, 'opacity', String(o)); set(el, 'visibility', o <= 0 ? 'hidden' : 'inherit'); continue; }
          if (typeof v === 'number') set(el, p, p === 'opacity' || p === 'strokeDashoffset' || p === 'zIndex' ? String(+v.toFixed(5)) : (+v.toFixed(3)) + 'px');
          else set(el, p, v);
        }
        if (tf) {
          const g = (p) => (p in tf ? tf[p] : m.has(p) ? valueAt(m.get(p), t) : DEF[p]);
          const sc = g('scale'), sx = sc * g('scaleX'), sy = sc * g('scaleY');
          set(el, 'transform', `translate(${(+g('x')).toFixed(2)}px,${(+g('y')).toFixed(2)}px) rotate(${(+g('rotation')).toFixed(3)}deg) scale(${sx.toFixed(4)},${sy.toFixed(4)})`);
        }
      }
      return api;
    }
    function set(el, p, v) {
      const c = el.__tw || (el.__tw = {}); if (c[p] === v) return; c[p] = v;
      if (p in el.style) el.style[p] = v; else el.style.setProperty(cssName(p), v);
    }
    const api = {
      fromTo: (target, from, to, at) => add(target, from, to, at, 'fromTo'),
      to: (target, vars, at) => add(target, null, vars, at, 'to'),
      set: (target, vars, at) => add(target, null, Object.assign({}, vars, { duration: 0 }), at, 'set'),
      seek, duration: () => end,
    };
    return api;
  }

  window.TW = { timeline, parseEase };
})();

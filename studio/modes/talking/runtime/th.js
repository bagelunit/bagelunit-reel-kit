// ───────────────────────── talking engine (Susanoo Reel Kit): face take + hard-cut layouts + per-word captions ─────────────────────────
// A frame-exact seek(t) page. Every tween lives on ONE timeline (TH.tl, core/tween.js) at absolute word times; tl.seek(t) is a
// pure function of t, so any frame renders identically in any order. Values that aren't element tweens (counters, typing,
// caption state, the face frame) are computed per frame in TH.fx callbacks.
// Layouts (hard cuts, no transitions): SPLIT · SEAM · FACE · PAPER · TINT · DARK  (geometry in TH.LAY, guide: modes/talking/GUIDE.md)
(function () {
  const W = 1080, H = 1920, clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v)), lerp = (a, b, k) => a + (b - a) * k;
  const E = (name) => TW.parseEase(name);
  const TH = { tl: TW.timeline(), fx: [], sfx: [], scenes: [], onReady: [], missing: [], W, H, clamp, lerp, E };
  const $ = (id) => document.getElementById(id);
  TH.$ = $;

  // ── themes: reel.json "theme": "studio" | "harbor" | "ochre" | "ink" (older clay / cobalt / forest / mono still work) | { preset, paper, accent, ink2, ink }
  TH.THEMES = {
    studio: { paper: '#F4F1EA', accent: '#E5482D', ink2: '#2F6F6A', ink: '#161514' },
    harbor: { paper: '#EDF1F1', accent: '#0B6E99', ink2: '#F08A2E', ink: '#0F1B22' },
    ochre:  { paper: '#F5F0E3', accent: '#D4911A', ink2: '#2F5F7E', ink: '#1B1712' },
    ink:    { paper: '#F2F1EE', accent: '#1C1C1C', ink2: '#9A9A9A', ink: '#111111' },
  };
  const hex = (c) => { c = String(c).replace('#', ''); if (c.length === 3) c = c.split('').map((x) => x + x).join(''); return [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) || 0); };
  TH.mix = (a, b, k) => { const A = hex(a), B = hex(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join(''); };
  TH.alpha = (c, a) => { const [r, g, b] = hex(c); return `rgba(${r},${g},${b},${a})`; };
  const lum = (c) => { const [r, g, b] = hex(c); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
  TH.applyTheme = (theme) => {
    const OLD = { clay: 'studio', cobalt: 'harbor', forest: 'ochre', mono: 'ink' };   // older preset names map onto the house four
    const th = typeof theme === 'string' ? { preset: theme } : Object.assign({}, theme || {});
    if (OLD[th.preset]) th.preset = OLD[th.preset];
    if (th.preset && !TH.THEMES[th.preset]) console.error('[warn] unknown theme preset "' + th.preset + '" (have: ' + Object.keys(TH.THEMES).join(', ') + ')');
    const c = Object.assign({}, TH.THEMES.studio, TH.THEMES[th.preset] || {});
    for (const k of ['paper', 'accent', 'ink2', 'ink']) if (th[k]) c[k] = th[k];
    Object.assign(c, {
      line: TH.mix(c.paper, c.ink, 0.12),                 // grid / rules
      tint: TH.mix(c.paper, c.accent, 0.11),              // the second full-canvas colour
      dark: TH.mix(c.ink, '#000000', 0.2),                // DARK layout background
      card: TH.mix(c.ink, c.paper, 0.07),                 // card surface on DARK
      sheet: TH.mix(c.paper, '#FFFFFF', 0.55),            // card surface on light layouts
      mute: TH.mix(c.ink, c.paper, 0.48),                 // secondary text
      onaccent: lum(c.accent) > 0.62 ? c.ink : c.paper,   // text on the accent tape
    });
    TH.C = c;
    const r = document.documentElement.style;
    for (const [k, v] of Object.entries(c)) r.setProperty('--' + k, v);
    return c;
  };

  // ── words (build/words.json → [{w, s, e}])
  const norm = (s) => String(s).toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}'+#.]/gu, '').replace(/^[.']+|[.']+$/g, '');
  TH.norm = norm;
  TH.initWords = (words, o = {}) => {
    TH.W = words.filter((w) => w && String(w.w).trim()).map((w, i) => ({ i, text: String(w.w), s: +w.s, e: +w.e, n: norm(w.w) }));
    TH.VO_END = TH.W.length ? TH.W[TH.W.length - 1].e : 3;
    TH.DUR = o.dur || TH.VO_END + (o.tail ?? 0.6);
  };
  // T('word', after) → start time of the first occurrence at/after `after`. Phrases work: T('best part'). A number = word index.
  TH.T = (word, after = -1) => {
    if (typeof word === 'number') return TH.W[clamp(word, 0, TH.W.length - 1)].s;
    const q = String(word).split(/\s+/).map(norm).filter(Boolean);
    for (let i = 0; i < TH.W.length; i++) {
      if (TH.W[i].s < after - 0.001) continue;
      if (q.every((x, k) => TH.W[i + k] && TH.W[i + k].n === x)) return TH.W[i].s;
    }
    TH.missing.push(`"${word}" after ${after.toFixed(2)}`);
    return Math.max(0, after);
  };
  TH.Tend = (word, after = -1) => { const t = TH.T(word, after), w = TH.W.find((x) => Math.abs(x.s - t) < 1e-6); if (!w) return t + 0.3; const q = String(word).split(/\s+/).filter(Boolean).length; return (TH.W[w.i + q - 1] || w).e; };

  // ── sound cues → window.studio.cues for tools/sound.py (which synthesizes every sound). gain = dB vs the default level (0 normal, -6 quieter)
  const SFXMAP = { pop: 'pop', impact: 'impact', stamp: 'stamp', slam: 'stamp', swipe: 'swoosh', slide: 'swoosh', marker: 'swoosh', scratch: 'swoosh',
    pen: 'tick', tick: 'tick', 'whoosh-fast': 'whoosh', 'whoosh-deep': 'whoosh', whoosh: 'whoosh', swoosh: 'swoosh', click: 'click', key: 'click',
    ding: 'pop', notify: 'pop', success: 'pop', sparkle: 'shimmer', shimmer: 'shimmer', error: 'thud', thud: 'thud', loading: 'riser', riser: 'riser',
    type: 'type', cash: 'cash', boom: 'boom' };
  TH.sound = (t, name, gain = 0) => { if (!isFinite(t)) return; const n = SFXMAP[name]; if (!n) console.error('[warn] unknown sound "' + name + '" (have: ' + Object.keys(SFXMAP).join(' ') + ')'); TH.sfx.push({ t: +Math.max(0, t).toFixed(3), name: n || name, gain }); };

  // ── DOM
  TH.mk = (parent, html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); const el = d.firstElementChild; parent.appendChild(el); return el; };
  TH.build = () => {
    const f = $('frame');
    f.innerHTML = `<div id="stage"></div>
      <svg id="grain" width="1080" height="1920"><filter id="thGrain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#thGrain)"/></svg>
      <div id="faceWin"><div id="faceBox"><div id="ph"></div><img id="faceImg" alt=""></div></div>
      <div id="winEdge"></div><div id="seamTab"></div>
      <div id="over"></div><div id="cap"></div>`;
  };
  TH.placeholder = () => {
    const c = TH.C, bg = TH.mix(c.ink2, c.ink, 0.45), fg = TH.mix(c.ink, c.ink2, 0.2);
    $('ph').innerHTML = `<div class="ab" style="inset:0;background:linear-gradient(180deg,${TH.mix(bg, c.paper, 0.12)},${bg})"></div>
      <div class="ab" style="left:360px;top:470px;width:360px;height:440px;border-radius:50%;background:${fg};opacity:.85"></div>
      <div class="ab" style="left:120px;top:880px;width:840px;height:1100px;border-radius:46% 46% 0 0;background:${fg};opacity:.85"></div>
      <div class="ab" style="left:0;width:1080px;top:395px;text-align:center"><span class="tag" style="background:${c.paper};color:${c.ink}">your take goes here · tools/take.py</span></div>`;
  };

  // ── layouts: where the face, the graphics and the caption sit (1080×1920). cap = caption BASELINE y.
  //   SPLIT  paper top + the take in a framed window (ink border, rounded top) from y 900; graphics authored at 1080 wide, scaled 0.8 from (540, 90)
  //   SEAM   grid paper above a hard ink seam at y 960, the take below; caption above the seam
  //   FACE   the take full frame, punched in 1.22×; caption on the chest; overlays go in s.ov
  //   PAPER  full paper canvas, one hero graphic; TINT = the same on the accent-tinted paper
  //   DARK   ink background (put TH.blurClone() + a sharp TH.glowCard() on it)
  TH.LAY = {
    SPLIT: { bg: 'paper', grain: 1, win: 900, inset: 24, r: 46, k: 0.8, origin: '540px 90px', face: { s: 1, x: 0, y: 560 }, cap: 866, voice: 'ink' },
    SEAM:  { bg: 'paper', grain: 1, grid: 1, seam: 960, k: 1, origin: '540px 480px', face: { s: 1, x: 0, y: 600 }, cap: 928, voice: 'ink' },
    FACE:  { face: { s: 1.22, x: 0, y: -40 }, cap: 1330, voice: 'onface' },
    PAPER: { bg: 'paper', grain: 1, full: 1, origin: '540px 800px', cap: 1300, voice: 'ink' },
    TINT:  { bg: 'tint', grain: 1, full: 1, origin: '540px 800px', cap: 1300, voice: 'ink' },
    DARK:  { bg: 'dark', full: 1, origin: '540px 800px', cap: 1440, voice: 'paper' },
  };
  TH.scene = (id, t0, lay, o = {}) => {
    if (!TH.LAY[lay]) { console.error(`scene "${id}": unknown layout "${lay}" (have: ${Object.keys(TH.LAY).join(', ')})`); lay = 'FACE'; }
    const bg = TH.mk($('stage'), `<div class="sc" data-id="${id}-bg"></div>`), el = TH.mk($('stage'), `<div class="sc" data-id="${id}"></div>`), ov = TH.mk($('over'), `<div class="sc" data-id="${id}-ov"></div>`);
    const s = Object.assign({ id, t0: Math.max(0, t0), lay, el, ov, bg }, o); TH.scenes.push(s); return s;
  };
  TH.finalize = () => {
    if (!TH.scenes.length) TH.scene('face', 0, 'FACE');
    TH.scenes.sort((a, b) => a.t0 - b.t0); TH.scenes[0].t0 = 0;
    TH.scenes.forEach((s, i) => (s.t1 = i < TH.scenes.length - 1 ? TH.scenes[i + 1].t0 : TH.DUR + 1));
    TH.scenes.forEach((s, i) => { if (i && s.lay !== TH.scenes[i - 1].lay && !s.quiet) TH.sound(s.t0 - 0.1, 'whoosh', s.lay === 'DARK' ? -3 : -6); });
  };
  TH.at = (t) => { if (TH.ONLY) { const o = TH.scenes.find((x) => x.id === TH.ONLY); if (o) return o; } let s = TH.scenes[0]; for (const x of TH.scenes) if (t >= x.t0 - 0.001) s = x; return s; };
  TH.on = (s, fn) => TH.fx.push((t, sc) => { if (sc === s) fn(t); });   // per-frame callback while scene s is on screen

  // ── tween helpers (all on the master timeline, absolute word times)
  const tl = TH.tl;
  TH.pop = (el, at, o = {}) => { tl.fromTo(el, { autoAlpha: 0, scale: o.s0 ?? 0.86, y: o.dy ?? 26, x: o.dx ?? 0, rotation: o.r ?? 0 }, { autoAlpha: 1, scale: 1, y: 0, x: 0, rotation: o.rot ?? 0, duration: o.d ?? 0.38, ease: o.ease ?? 'back.out(1.7)', immediateRender: true }, at); if (o.sound !== false) TH.sound(at, o.sound || 'pop', o.gain ?? -3); return el; };
  TH.slam = (el, at, o = {}) => TH.pop(el, at, Object.assign({ s0: 1.6, dy: 0, d: 0.32, ease: 'back.out(2.2)', sound: 'impact', gain: 0 }, o));
  TH.fade = (el, at, o = {}) => { tl.fromTo(el, { autoAlpha: 0 }, { autoAlpha: 1, duration: o.d ?? 0.18, ease: 'power1.out', immediateRender: true }, at); return el; };
  TH.out = (el, at, o = {}) => { tl.to(el, { autoAlpha: 0, scale: o.s ?? 0.92, y: o.dy ?? -12, duration: o.d ?? 0.2, ease: 'power2.in' }, at); return el; };
  TH.drift = (el, t0, t1, o = {}) => { tl.fromTo(el, { scale: o.from ?? 1 }, { scale: o.to ?? 1.06, duration: Math.max(0.1, t1 - t0), ease: 'none', immediateRender: false }, t0); return el; };
  TH.draw = (path, at, d = 0.45, ease = 'power2.inOut', sound = true) => { path.setAttribute('pathLength', '1'); path.style.strokeDasharray = '1 1'; tl.fromTo(path, { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: d, ease, immediateRender: true }, at); if (sound) TH.sound(at, 'pen', -4); return path; };
  TH.wipe = (el, at, d = 0.18) => { tl.fromTo(el, { clipPath: 'inset(-20% 100% -20% -5%)' }, { clipPath: 'inset(-20% 0% -20% -5%)', duration: d, ease: 'power2.out', immediateRender: true }, at); return el; };
  // the sliding highlight frame: one frame that moves to each rect [{x, y, w, h, at}] inside `parent` as the item is named
  TH.slider = (parent, rects, o = {}) => { const c = o.color || TH.C.accent;
    const f = TH.mk(parent, `<div class="ab" style="left:0;top:0;border-radius:${o.r ?? 16}px;box-shadow:0 0 0 ${o.bw ?? 6}px ${c};background:${TH.alpha(c, o.fill ?? 0.12)};pointer-events:none"></div>`);
    rects.forEach((r, k) => { if (!k) tl.fromTo(f, { autoAlpha: 0, x: r.x, y: r.y, width: r.w, height: r.h, scale: 1.18 }, { autoAlpha: 1, scale: 1, duration: 0.3, ease: 'back.out(2)', immediateRender: true }, r.at);
      else tl.to(f, { x: r.x, y: r.y, width: r.w, height: r.h, duration: 0.32, ease: 'expo.out' }, r.at); TH.sound(r.at, 'swipe', -5); }); return f; };
  // hand-drawn strike across a box (accent by default)
  TH.strike = (parent, x, y, w, h, at, o = {}) => { const s = TH.mk(parent, `<svg class="ab" style="left:${x}px;top:${y}px;overflow:visible" width="${w}" height="${h}"><path d="M${w * 0.03} ${h * 0.9} C ${w * 0.3} ${h * 0.66}, ${w * 0.6} ${h * 0.4}, ${w * 0.97} ${h * 0.1}" stroke="${o.color || TH.C.accent}" stroke-width="${o.w || 14}" stroke-linecap="round" fill="none"/></svg>`); TH.draw(s.querySelector('path'), at, 0.22, 'power2.out', false); TH.sound(at, 'scratch', -3); return s; };
  // handwritten numbers with arrows converging on a target point
  TH.handNums = (parent, nums, target, at, o = {}) => nums.map((n, k) => { const ang = (o.from ?? -Math.PI * 0.85) + (k / Math.max(1, nums.length - 1)) * (o.spread ?? Math.PI * 0.7), R = o.R ?? 260, x = target[0] + Math.cos(ang) * R, y = target[1] + Math.sin(ang) * R;
    const el = TH.mk(parent, `<div class="ab hand" style="left:${x - 30}px;top:${y - 64}px;font-size:${o.size || 104}px;line-height:1;color:${o.color || TH.C.accent}">${n}</div>`); TH.pop(el, at[k], { s0: 0.3, dy: 0, d: 0.3, sound: 'pen', gain: -3 });
    const ax = x + (target[0] - x) * 0.24 + 18, ay = y + (target[1] - y) * 0.24 + 16, bx = x + (target[0] - x) * (o.reach ?? 0.55), by = y + (target[1] - y) * (o.reach ?? 0.55), sg = Math.sign(bx - ax || 1);
    const a = TH.mk(parent, `<svg class="ab" style="left:0;top:0;overflow:visible" width="10" height="10"><path d="M${ax} ${ay} L${bx} ${by} M${bx} ${by} l${-16 * sg} -4 M${bx} ${by} l${-6 * sg} -16" stroke="${o.ink || TH.C.ink}" stroke-width="5" stroke-linecap="round" fill="none"/></svg>`); TH.draw(a.querySelector('path'), at[k] + 0.06, 0.2, 'power2.inOut', false); return el; });
  // a connector that draws on (node graphs); o.dash = dashed, fades in instead
  TH.line = (parent, pts, at, o = {}) => { const d = 'M' + pts.map((p) => p.join(' ')).join(' L'); const s = TH.mk(parent, `<svg class="ab" style="left:0;top:0;overflow:visible" width="10" height="10"><path d="${d}" stroke="${o.color || TH.C.ink2}" stroke-width="${o.w || 6}" fill="none" stroke-linecap="round" stroke-linejoin="round" ${o.dash ? 'stroke-dasharray="14 12"' : ''}/></svg>`); if (!o.dash) TH.draw(s.querySelector('path'), at, o.d ?? 0.4, 'power2.inOut', o.sound !== false); else TH.fade(s, at); return s; };
  // star burst at (x, y) inside parent
  TH.sparks = (parent, x, y, at, o = {}) => { const n = o.n || 10, R = o.R || 260, cols = [TH.C.accent, TH.C.ink2, TH.C.ink];
    for (let k = 0; k < n; k++) { const a = (k / n) * 6.283 + 0.3, sz = 34 + (k % 3) * 12, el = TH.mk(parent, `<svg class="ab" style="left:0;top:0;overflow:visible" width="${sz}" height="${sz}" viewBox="-10 -10 20 20"><path d="M0-10 L2.2-2.2 L10 0 L2.2 2.2 L0 10 L-2.2 2.2 L-10 0 L-2.2-2.2Z" fill="${cols[k % 3]}"/></svg>`);
      tl.fromTo(el, { x: x - sz / 2, y: y - sz / 2, autoAlpha: 0, scale: 0.3, rotation: 0 }, { x: x - sz / 2 + Math.cos(a) * R, y: y - sz / 2 + Math.sin(a) * R * (o.squash ?? 0.75), autoAlpha: 1, scale: 1, rotation: 90, duration: 0.5, ease: 'expo.out', immediateRender: true }, at);
      tl.to(el, { autoAlpha: 0, scale: 0.6, duration: 0.3 }, at + 0.45); }
    if (o.sound !== false) TH.sound(at, 'sparkle', -4); };
  // a pointer cursor; move it with tl.fromTo(cur, {x, y}, {x, y, ...}, at) and press with TH.click(cur, at)
  TH.CURSOR = (c) => `<svg width="56" height="66" viewBox="0 0 24 28"><path d="M3 2l17 13-8 1.2 4.6 8.6-3.4 1.8-4.6-8.7L3 23z" fill="${c ? c.paper : 'var(--paper)'}" stroke="${c ? c.ink : 'var(--ink)'}" stroke-width="2" stroke-linejoin="round"/></svg>`;
  TH.cursor = (parent) => TH.mk(parent, `<div class="ab" style="left:0;top:0;z-index:5">${TH.CURSOR(TH.C)}</div>`);
  TH.click = (el, at, o = {}) => { tl.to(el, { scale: 0.84, duration: 0.06, yoyo: true, repeat: 1 }, at); if (o.sound !== false) TH.sound(at, 'click', o.gain ?? 0); };

  TH.rectOf = (el, root) => { let x = 0, y = 0, n = el; while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; } return { x, y, w: el.offsetWidth, h: el.offsetHeight }; };
  TH.later = (fn) => TH.onReady.push(fn);    // runs once fonts + layout exist (every scene is visible then): measure with rectOf here
  // per-frame value helpers
  TH.roll = (t, t0, t1, a, b, ease = 'power3.out') => a + (b - a) * E(ease)(clamp((t - t0) / Math.max(0.05, t1 - t0)));
  TH.count = (el, t0, t1, from, to, o = {}) => { const fmt = o.fmt || ((v) => (o.prefix || '') + Math.round(v).toLocaleString('en-US') + (o.suffix || ''));
    TH.fx.push((t) => { if (!el.isConnected) return; const v = t < t0 ? from : TH.roll(t, t0, t1, from, to, o.ease || 'power2.out'), s = fmt(v); if (el.textContent !== s) el.textContent = s; });
    if (o.sound) TH.sound(t1, o.sound === true ? 'pop' : o.sound, -3); return el; };
  TH.type = (el, text, t0, o = {}) => { const cps = o.cps || 30, caret = o.caret ? '▌' : '';
    TH.fx.push((t) => { const n = t < t0 ? 0 : Math.min(text.length, Math.floor((t - t0) * cps + 1e-6)), s = text.slice(0, n) + (caret && n < text.length && t >= t0 ? caret : ''); if (el.textContent !== s) el.textContent = s; });
    if (o.sound !== false) TH.sound(t0, 'type', -4); return el; };
  TH.meter = (cls, d, o = {}) => `<div class="${cls}" style="position:relative;width:${d}px;height:${d}px;border-radius:50%;background:conic-gradient(${o.color || 'var(--accent)'} 0 0%,${o.track || 'var(--line)'} 0 100%)"><div style="position:absolute;inset:${Math.round(d * 0.2)}px;border-radius:50%;background:${o.hole || 'var(--sheet)'}"></div></div>`;
  TH.setMeter = (el, v, o = {}) => { if (el) el.style.background = `conic-gradient(${o.color || 'var(--accent)'} 0 ${v.toFixed(2)}%,${o.track || 'var(--line)'} ${v.toFixed(2)}% 100%)`; };

  // ── house pieces (HTML strings)
  TH.tape = (text, o = {}) => `<span class="tape" style="${o.size ? `font-size:${o.size}px;` : ''}${o.color ? `background:${o.color};` : ''}${o.ink ? `color:${o.ink};` : ''}transform:rotate(${o.rot ?? -1.6}deg)">${text}</span>`;
  TH.tag = (text, o = {}) => `<span class="tag ${o.kind || ''}" style="${o.size ? `font-size:${o.size}px;` : ''}">${text}</span>`;
  TH.paperCard = (inner, o = {}) => `<div style="border-radius:${o.r ?? 28}px;padding:${o.pad ?? 0}px;background:${o.bg || 'var(--sheet)'};box-shadow:0 0 0 3px var(--ink),${o.lift ?? 12}px ${o.lift ?? 12}px 0 3px ${TH.alpha(TH.C.ink, 0.9)};overflow:hidden;box-sizing:border-box">${inner}</div>`;
  TH.glowCard = (inner, o = {}) => { const c = o.color || TH.C.accent; return `<div style="border-radius:${o.r ?? 28}px;padding:${o.pad ?? 0}px;background:${o.bg || 'var(--card)'};color:var(--paper);box-shadow:0 0 0 ${o.bw ?? 5}px ${c},14px 16px 0 ${o.bw ?? 5}px rgba(0,0,0,.45),0 0 70px ${TH.alpha(c, 0.28)};overflow:hidden;box-sizing:border-box">${inner}</div>`; };
  TH.blurClone = (parent, html) => TH.mk(parent, `<div class="ab" style="left:0;top:0;width:1080px;height:1920px;overflow:hidden"><div style="position:absolute;left:-200px;top:-80px;width:1480px;transform:scale(1.9);transform-origin:50% 20%;filter:blur(30px) brightness(.5) saturate(1.2)">${html}</div></div>`);
  TH.device = (inner, w, h, o = {}) => `<div style="display:inline-block;text-align:center"><div style="position:relative;width:${w + 40}px;padding:20px 20px 34px;box-sizing:border-box;border-radius:32px;background:var(--ink);box-shadow:12px 14px 0 ${TH.alpha(TH.C.ink, 0.22)}"><div style="width:${w}px;height:${h}px;border-radius:14px;overflow:hidden;background:#fff;text-align:left">${inner}</div><div style="position:absolute;left:50%;bottom:12px;width:12px;height:12px;margin-left:-6px;border-radius:6px;background:var(--accent)"></div></div>${o.stand === false ? '' : `<div style="width:150px;height:56px;margin:0 auto;background:var(--ink);clip-path:polygon(18% 0,82% 0,100% 100%,0 100%)"></div><div style="width:330px;height:16px;margin:0 auto;border-radius:8px;background:var(--ink)"></div>`}</div>`;
  TH.STAR = (s, c) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M12 1.8l3.1 6.6 7.2.9-5.3 5 1.4 7.1L12 17.9l-6.4 3.5L7 14.3 1.7 9.3l7.2-.9z" fill="${c || 'var(--accent)'}" stroke="var(--ink)" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
  // a generic repo card: plain star icon, owner/repo, a big count (animate .rwN with TH.count)
  TH.repoWidget = (owner, repo, o = {}) => `<div style="text-align:center">${TH.STAR(o.icon || 96)}
    <div class="mono" style="margin-top:18px;font-weight:700;font-size:42px;color:var(--ink)">${owner}<span style="color:var(--mute)"> / </span>${repo}</div>
    <div class="rwN anton" style="margin-top:8px;font-size:${o.size || 210}px;line-height:1;color:var(--ink)">0</div>
    <div class="oswald" style="font-weight:600;font-size:34px;letter-spacing:.14em;color:var(--mute)">${o.label || 'stars'}</div></div>`;
  TH.statusCard = (label, body, o = {}) => TH.paperCard(`<div style="padding:26px 30px"><div class="row" style="gap:14px;font:700 36px Figtree"><span class="stDot" style="width:18px;height:18px;border-radius:9px;background:var(--ink2)"></span>${label}</div><div style="margin-top:18px">${body}</div></div>`, { r: 24, lift: 8, ...o });
  // optional backdrop decoration for a scene: soft colour pools, a grid, a vignette
  TH.world = (s, o = {}) => { const b = s.bg; b.style.background = o.base || 'transparent';
    const blobs = (o.blobs || []).map(([c, x, y, r], k) => [TH.mk(b, `<div class="ab" style="left:${x - r}px;top:${y - r}px;width:${2 * r}px;height:${2 * r}px;border-radius:50%;background:radial-gradient(circle,${c} 0%,transparent 68%)"></div>`), k]);
    if (o.grid) TH.mk(b, `<div class="ab" style="inset:0;background-image:linear-gradient(${o.grid === true ? 'var(--line)' : o.grid} 2px,transparent 2px),linear-gradient(90deg,${o.grid === true ? 'var(--line)' : o.grid} 2px,transparent 2px);background-size:72px 72px"></div>`);
    if (o.vignette) TH.mk(b, `<div class="ab" style="inset:0;background:radial-gradient(ellipse 90% 70% at 50% 40%,transparent 55%,rgba(0,0,0,${o.vignette === true ? 0.35 : o.vignette}) 100%)"></div>`);
    TH.on(s, (t) => blobs.forEach(([e, k]) => (e.style.transform = `translate(${(Math.sin(t * 0.45 + k * 2.1) * 46).toFixed(1)}px,${(Math.cos(t * 0.37 + k * 1.3) * 34).toFixed(1)}px)`))); };
  // an image sequence (frames dir/0001.jpg …) playing from t0
  TH.seq = (parent, dir, n, t0, o = {}) => { const el = TH.mk(parent, `<img style="display:block;width:${o.w}px;${o.h ? 'height:' + o.h + 'px;object-fit:cover;' : ''}">`);
    TH.fx.push((t) => { const i = Math.max(0, Math.floor((t - t0) * (o.fps || 15) + 1e-6)) % n + 1, src = `${dir}/${String(i).padStart(4, '0')}.jpg`; if (el.dataset.s !== src) { el.dataset.s = src; el.src = src; } }); return el; };
  // the CTA: an Oswald "comment" chip, then the keyword slams on an accent tape, then an optional sub line
  TH.cta = (parent, word, at, o = {}) => { const y = o.y ?? 1080;
    const el = TH.mk(parent, `<div class="ab" style="left:0;width:1080px;top:${y}px;text-align:center">
      <div class="ctaC">${TH.tag(o.pre || 'comment', { size: 46 })}</div>
      <div class="ctaW" style="margin-top:26px"><span class="tape" style="font-size:${o.size || 190}px;padding:26px 52px 14px;border-radius:24px;box-shadow:0 18px 40px rgba(0,0,0,.3)">${word}</span></div>
      ${o.sub ? `<div class="ctaS" style="margin-top:34px">${TH.tag(o.sub, { kind: 'line', size: 38 })}</div>` : ''}</div>`);
    const c = el.querySelector('.ctaC'), w = el.querySelector('.ctaW'), sb = el.querySelector('.ctaS');
    TH.pop(c, o.preAt ?? at - 0.3, { dy: 20, s0: 0.8, sound: false });
    TH.slam(w, at, { s0: 1.5, sound: 'stamp' }); TH.wipe(w.firstElementChild, at, 0.16);
    if (sb) { sb.firstElementChild.style.background = 'var(--paper)'; TH.pop(sb, o.subAt ?? at + 0.6, { dy: 24 }); }
    return el; };

  // ── captions: 1-2 words, swapped per word. KEY words (names, nouns, numbers) = Anton CAPS on the accent tape (HOT ones on the
  //    second ink); everything else = Figtree 800. On PAPER/TINT/DARK a lone long word is set big in Anton without tape.
  TH.captions = (KEY, o = {}) => {
    const K = new Set([...(KEY || [])].map(norm)), HOT = new Set([...(o.hot || [])].map(norm));
    let words = TH.W.filter((w) => w.n); const CH = []; let cur = [];
    // o.swap: { 'one hundred': '100', 'sixty-nine': '69' } → shown as one caption word (numbers then count up)
    for (const [k, disp] of Object.entries(o.swap || {})) { const q = k.split(/\s+/).map(norm).filter(Boolean), out = [];
      for (let i = 0; i < words.length; i++) { if (q.length && q.every((x, j) => words[i + j] && words[i + j].n === x)) { const a = words[i], b = words[i + q.length - 1], p = (b.text.match(/[.,!?:;]+$/) || [''])[0];
        out.push(Object.assign({}, a, { text: disp + p, e: b.e, n: norm(disp) })); i += q.length - 1; } else out.push(words[i]); }
      words = out; }
    words.forEach((w, i) => { const k = K.has(w.n), nx = words[i + 1]; if (k && cur.length) { CH.push(cur); cur = []; } cur.push(w);
      if (k || cur.length >= (o.max || 2) || /[.,!?:;]["”]?$/.test(w.text) || !nx || K.has(nx.n) || nx.s - w.e > 0.18) { CH.push(cur); cur = []; } });
    TH.CH = CH; TH.KEY = K; TH.HOT = HOT; return CH; };
  const STOP = new Set("your this that with from have just they them what when then than there their about because into over more some will would could should been were it's here's that's i'll you're don't can't also only very much".split(' '));
  const isNum = (s) => /^[$€£]?\d[\d,.]*[%kKmM+]?$/.test(s);
  const capText = (w) => w.text.replace(/["“”]/g, '').replace(/[.,!?:;]+$/, '');
  TH.renderCap = (t, s) => {
    const el = $('cap'), CH = TH.CH || [];
    const clear = () => { if (el.dataset.c) { el.innerHTML = ''; el.dataset.c = ''; } };
    if (s.noCap || TH.capsOff) return clear();
    let ci = -1; for (let i = 0; i < CH.length; i++) if (CH[i][0].s - 0.03 <= t) ci = i; else break;
    const nextS = ci >= 0 && ci < CH.length - 1 ? CH[ci + 1][0].s : Infinity, endT = ci >= 0 ? CH[ci][CH[ci].length - 1].e + 0.5 : 0;
    if (ci < 0 || (t > endT && nextS - endT > 0.6)) return clear();
    const L = TH.LAY[s.lay], voice = s.voice || L.voice, ch = CH[ci], cap = s.cap ?? L.cap;
    if (el.dataset.c !== ci + '|' + s.id) {
      el.dataset.c = ci + '|' + s.id;
      const col = voice === 'ink' ? 'var(--ink)' : 'var(--paper)', sh = voice === 'onface' ? 'text-shadow:0 3px 0 rgba(0,0,0,.28),0 8px 26px rgba(0,0,0,.55);' : '';
      const big = L.full && ch.length === 1 && !TH.KEY.has(ch[0].n) && capText(ch[0]).length > 3 && !STOP.has(ch[0].n);
      el.innerHTML = `<div class="capRow" style="top:${cap}px">` + ch.map((w) => { const tx = capText(w), num = isNum(tx) ? tx.replace(/[^\d.]/g, '') : '';
        const dn = num ? ` data-num="${num}" data-pre="${tx.match(/^[$€£]?/)[0]}" data-suf="${tx.match(/[%kKmM+]?$/)[0]}"` : '';
        if (TH.KEY.has(w.n)) return `<span class="cw key${TH.HOT.has(w.n) ? ' hot' : ''}"${dn} style="${voice === 'onface' ? 'filter:drop-shadow(0 8px 18px rgba(0,0,0,.35));' : ''}"><span class="tp"></span><span class="tx">${tx}</span></span>`;
        return `<span class="cw ${big ? 'big' : 'plain'}"${dn} style="color:${col};${sh}">${tx}</span>`; }).join('') + '</div>';
      const row = el.firstElementChild; let wsum = 0; for (const c of row.children) wsum += c.offsetWidth + 20;
      row.dataset.fit = Math.min(1, 980 / Math.max(1, wsum)).toFixed(4);
    }
    const row = el.firstElementChild, e = E('back.out(2.4)')(clamp((t - (ch[0].s - 0.03)) / 0.16)), fit = +row.dataset.fit || 1;
    row.style.transform = `translateY(-100%) scale(${(fit * (0.82 + 0.18 * e)).toFixed(4)})`;
    [...row.children].forEach((sp, k) => { const w = ch[k];
      sp.classList.toggle('wait', k > 0 && t < w.s - 0.05);
      if (sp.classList.contains('key')) { const p = E('power2.out')(clamp((t - (w.s - 0.06)) / 0.14)); sp.style.clipPath = `inset(-30% ${((1 - p) * 104).toFixed(2)}% -30% -10%)`; }
      const n = sp.dataset.num; if (n) { const p = clamp((t - w.s) / Math.max(0.25, w.e - w.s)), v = +n * E('power2.out')(p), dec = (n.split('.')[1] || '').length;
        const s2 = sp.dataset.pre + (dec ? v.toFixed(dec) : Math.round(v).toLocaleString('en-US')) + sp.dataset.suf; const tgt = sp.querySelector('.tx') || sp; if (tgt.textContent !== s2) tgt.textContent = s2; } });
  };

  // ── face: frames/face/%05d.jpg (from tools/take.py, build/face.json) or the placeholder silhouette
  TH.useFace = (f) => { TH.FACE = f; $('ph').style.display = 'none'; $('faceImg').style.display = 'block'; };
  TH.faceRect = (s) => { const L = TH.LAY[s.lay]; if (!L.face) return null; if (L.win) return [L.inset, L.win, W - 2 * L.inset, H - L.win]; if (L.seam) return [0, L.seam, W, H - L.seam]; return [0, 0, W, H]; };
  TH.faceSeek = (t, s) => { const L = TH.LAY[s.lay], win = $('faceWin'), edge = $('winEdge'), tab = $('seamTab'), box = $('faceBox');
    if (!L.face) { win.style.display = edge.style.display = tab.style.display = 'none'; return; }
    win.style.display = '';
    if (TH.FACE) { const F = TH.FACE, fi = Math.min(F.n - 1, Math.max(0, Math.floor(t * (F.fps || 30) + 1e-6))), src = `frames/face/${String(fi).padStart(5, '0')}.jpg`, img = $('faceImg'); if (img.dataset.f !== src) { img.dataset.f = src; img.src = src; } }
    const cuts = (TH.FACE && TH.FACE.cuts) || [], ci = cuts.filter((c) => t >= c - 0.001).length, alt = ci % 2 ? 0.06 : 0;   // alternate a small zoom on every jump cut
    const f = Object.assign({}, L.face, s.face || {}), g = TH.FACEADJ || {}, push = 0.025 * clamp((t - s.t0) / Math.max(1, s.t1 - s.t0));
    box.style.transform = `translate(${f.x + (g.dx || 0)}px,${f.y + (g.dy || 0)}px) scale(${(f.s * (g.zoom || 1) * (1 + alt + push)).toFixed(4)})`;
    if (L.win) { win.style.clipPath = `inset(${L.win}px ${L.inset}px 0 ${L.inset}px round ${L.r}px ${L.r}px 0 0)`;
      Object.assign(edge.style, { display: '', left: L.inset + 'px', top: L.win + 'px', width: W - 2 * L.inset + 'px', height: H - L.win + 40 + 'px', border: '6px solid var(--ink)', borderRadius: `${L.r}px ${L.r}px 0 0`, background: 'none' });
      tab.style.display = 'none';
    } else if (L.seam) { win.style.clipPath = `inset(${L.seam}px 0 0 0)`;
      Object.assign(edge.style, { display: '', left: '0px', top: L.seam - 3 + 'px', width: W + 'px', height: '6px', border: 'none', borderRadius: '0', background: 'var(--ink)' });
      Object.assign(tab.style, { display: '', left: '0px', top: L.seam + 3 + 'px', width: W + 'px', height: '5px', borderRadius: '0', background: 'var(--accent)', transform: 'none' });   // double rule: ink over accent
    } else { win.style.clipPath = 'none'; edge.style.display = tab.style.display = 'none'; } };

  // ── the per-frame seek
  const BG = { paper: 'var(--paper)', tint: 'var(--tint)', dark: 'var(--dark)' };
  TH.seek = (t) => { const s = TH.at(t), L = TH.LAY[s.lay];
    for (const x of TH.scenes) { const d = x === s ? 'block' : 'none'; if (x.el.style.display !== d) x.el.style.display = x.ov.style.display = x.bg.style.display = d; }
    const stage = $('stage'); stage.style.background = BG[L.bg] || 'transparent';
    stage.style.backgroundImage = L.grid ? 'linear-gradient(var(--line) 2px,transparent 2px),linear-gradient(90deg,var(--line) 2px,transparent 2px)' : 'none';
    stage.style.backgroundSize = '72px 72px'; stage.style.backgroundPosition = L.seam ? `-18px ${L.seam % 72}px` : '0 0';
    stage.style.clipPath = L.seam ? `inset(0 0 ${H - L.seam}px 0)` : (L.face && !L.win) ? `inset(0 0 ${H}px 0)` : 'none';
    $('grain').style.display = L.grain && !(L.face && !L.win && !L.seam) ? '' : 'none';
    // camera: a slow push across each scene (graphics and face); frames never sit still
    const pr = clamp((t - s.t0) / Math.max(1, s.t1 - s.t0)), cam = `scale(${((s.k ?? L.k ?? 1) * (1 + 0.025 * pr)).toFixed(4)})`;
    s.el.style.transformOrigin = s.ov.style.transformOrigin = L.origin || '540px 800px';
    s.el.style.transform = cam; s.ov.style.transform = L.face && !L.win ? 'none' : cam;
    TH.tl.seek(t, true);
    for (const f of TH.fx) f(t, s);
    TH.faceSeek(t, s); TH.renderCap(t, s);
    void $('frame').offsetHeight; };
  // wait until every visible image (the face frame first) is decoded, so the screenshot shows THIS frame
  TH.settle = () => Promise.all([...document.images].filter((i) => i.getAttribute('src') && i.offsetParent !== null).map((i) => i.decode().catch(() => {})));
  // regions the motion gate must NOT count (the face moving by itself) and the regions inside them it must count (captions, overlays)
  TH.maskList = () => TH.scenes.map((s) => { const L = TH.LAY[s.lay], fr = TH.faceRect(s), keep = [];
    if (fr) { const cap = s.cap ?? L.cap; keep.push([0, cap - 150, W, 175]);
      for (const c of s.ov.children) { const r = TH.rectOf(c, $('frame')); if (r.w && r.h) keep.push([r.x - 30, r.y - 30, r.w + 60, r.h + 60].map(Math.round)); } }
    return { id: s.id, lay: s.lay, t0: +s.t0.toFixed(3), t1: +Math.min(s.t1, TH.DUR).toFixed(3), ignore: fr ? [fr] : [], keep }; });
  window.TH = TH;
})();

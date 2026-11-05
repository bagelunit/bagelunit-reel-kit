/* Susanoo Reel Kit print · mechanics
   How things MOVE, not finished props: springs, a pendulum, gravity, speed curves, idle float; the build-up stage and its camera;
   presenter acting presets (moods and their effects, stepping into the hero spot, a REC viewfinder); live interface mocks (a chat
   composer, a video player with a scrubber, an odometer, a live stat card, a notification stack); and the palette flood.
   There are deliberately no finished metaphor props here. Each reel draws its own two to five props for its script
   (playbook/ideas.md) and uses these for the motion; the studied props in examples/objects/ show techniques, not parts to paste.
   Everything is a pure function of t, cued on the word times you pass in. Each component enters with overshoot and settles, keeps
   moving gently once it has landed, reacts to its cues, puts glows and soft shadows on T and crisp ink on K, and returns anchor
   points (scene space) for act({ focus }) so the presenter points at the newest thing.
   Top level holds only `function` and `var`, so loading this file twice (index.html and SCENE_FILES) is harmless.
   Guide: modes/print/GUIDE.md, Part 1 (the bar) and §3.8 (how things move). */

/* ======================= 1 · physics ======================= */
// a value that springs from key to key, keys [[t, v], …] sorted by time: it overshoots and settles at every key (f = frequency,
// z = damping)
function springTo(t, keys, f = 2.2, z = 0.42) {
  return keys.slice(1).reduce((v, key, i) => v + (key[1] - keys[i][1]) * spring(t - key[0], f, z), keys[0][1]);
}
// the same for objects, keys [[t, {x, y, s, r}], …]; a field a key leaves out keeps the value it had
function springObj(t, keys, f = 2.2, z = 0.5) {
  const out = { ...keys[0][1] };
  const last = { ...keys[0][1] };
  keys.slice(1).forEach(([kt, target]) => {
    const amount = spring(t - kt, f, z);
    Object.keys(target).forEach(field => {
      const from = last[field] ?? target[field];
      out[field] = (out[field] ?? from) + (target[field] - from) * amount;
      last[field] = target[field];
    });
  });
  return out;
}
// the angle (degrees) of a pendulum knocked at dt = 0: it swings at f Hz and dies away at rate k
function pendulum(dt, amp = 14, f = 1.2, k = 2) {
  if (dt < 0) return 0;
  return amp * Math.exp(-k * dt) * Math.cos(TAU * f * dt);
}
// a throw from t0 under gravity: { dx, dy, r (degrees), on }; vx, vy in px/s, spin in deg/s, g in px/s²
function gravityFall(t, t0, vx = 0, vy = -300, spin = 120, g = 5200) {
  const d = Math.max(0, t - t0);
  const fall = { dx: vx * d, dy: vy * d + 0.5 * g * d * d, r: spin * d };
  fall.on = t > t0;
  return fall;
}
// how far something has turned when its speed follows keys [[t, speed], …] (straight lines between keys, flat outside them):
// the area under the speed curve, e.g. a clock hand's revolutions
function phaseAt(t, keys) {
  let phase = 0, from = 0, speed = keys[0][1];
  for (let i = 0; i < keys.length; i++) {
    const kt = keys[i][0], ks = keys[i][1];
    if (kt > from) {
      const span = kt - from;
      if (t <= kt) return phase + (t - from) * (speed + lerp(speed, ks, (t - from) / span)) / 2;
      phase += span * (speed + ks) / 2;
      from = kt;
    }
    speed = ks;
  }
  return phase + (t - from) * speed;
}
// the speed itself at t on the same keys
function speedAt(t, keys) {
  const first = keys[0];
  if (t <= first[0]) return first[1];
  const i = keys.findIndex((key, n) => n > 0 && t <= key[0]);
  if (i < 0) return keys[keys.length - 1][1];
  return lerp(keys[i - 1][1], keys[i][1], inv(keys[i - 1][0], keys[i][0], t));
}
// the float of anything that has landed: { dx, dy, r }; amp 1 is about ±6 px and ±1.2°
var MECH_SWAY = { dx: [0.7, 3.1, 4], dy: [2.1, 1.7, 6], r: [1.6, 2.3, 1.2] };   // [rate, seed step, size]
function idleSway(t, seed = 0, amp = 1) {
  const [ax, bx, cx] = MECH_SWAY.dx, [ay, by, cy] = MECH_SWAY.dy, [ar, br, cr] = MECH_SWAY.r;
  return {
    dx: noise1(t * ax + seed * bx) * cx * amp,
    dy: Math.sin(t * ay + seed * by) * cy * amp,
    r: Math.sin(t * ar + seed * br) * cr * amp,
  };
}
// a rectangle {x, y, w, h} morphing from a to b, lifted on an arc on the way (carry-over transitions)
function morphRect(a, b, p, lift = 60) {
  const q = clamp(p);
  const mix = key => lerp(a[key], b[key], q);
  return { x: mix('x'), y: mix('y') - Math.sin(q * Math.PI) * lift, w: mix('w'), h: mix('h') };
}

/* ---------- option defaults, per component ---------- */
var MECH_OPTS = {
  cam: { k: 0.1, z: 0.035, push: 0.006, release: 1e9 },
  rec: { t0: 0, t1: 1e9, from: 1.8, tag: null, tagT: null, glow: 1, hunt: null, rec: 'REC' },
  hero: { x: 540, y: 1990, s: 1.1, dur: 0.45 },
  prompt: { title: 'Assistant', label: 'new chat', text: '', tType: 0, cps: 38, tSend: null, reply: '', replyCps: 70, blur: 0, size: 34, placeholder: 'Message…' },
  video: { t0: 0, dur: 52, start: 0, seek: [], markers: [], content: null, title: null, paused: [] },
  odometer: { size: 130, prefix: '', suffix: '', sep: ',', align: 'left', weight: 700 },   // colour: the ink at call time
  stat: { label: 'users', keys: [[0, 0]], prefix: '', suffix: '', size: 130, roll: 0.8, hot: null, delta: null, spark: true, live: true },
  toasts: { max: 4, h: 92, from: 1 },
  flood: { col: '#15161A', x: 540, y: 1300 },
};

/* ---------- small shared helpers (the example objects use the short names) ---------- */
var MECH_GREY = '#8a8780';
var _MG = MECH_GREY;
var mechMeasurer = null;
// a spare 2D context for measuring text outside a frame
function _mctx() {
  if (!mechMeasurer) mechMeasurer = document.createElement('canvas').getContext('2d');
  return mechMeasurer;
}
// run fn with every context in cs faded to a (skipped when invisible)
function _mA(cs, a, fn) {
  if (a <= 0.002) return;
  cs.forEach(c => {
    c.save();
    c.globalAlpha *= clamp(a);
  });
  fn();
  cs.forEach(c => c.restore());
}
// a window that eases open over inDur from t0 and shut over outDur from t1 (0 → 1 → 0)
function mechGlide(t, t0, t1, inDur, outDur) {
  return E.inOutCubic(clamp((t - t0) / inDur)) * (1 - E.inOutCubic(clamp((t - t1) / outDur)));
}
// the grey mono label style, with overrides
function _mono(size, o = {}) {
  return { font: F.mono, weight: 500, size, color: MECH_GREY, align: 'left', ...o };
}
// wrap a string into lines no wider than maxW in face f (a "\n" always breaks)
function wrapText(str, f, maxW) {
  const ctx = _mctx();
  const lines = [];
  String(str).split('\n').forEach(para => {
    const rest = para.split(' ').reduce((current, word) => {
      const longer = current ? current + ' ' + word : word;
      if (current && measure(ctx, longer, f) > maxW) {
        lines.push(current);
        return word;
      }
      return longer;
    }, '');
    lines.push(rest);
  });
  return lines;
}
// a spinning arc
function spinner(K, x, y, r, t, col = C.red, lw = 5) {
  K.save();
  runOps(K, [['translate', x, y], ['rotate', t * 7]]);
  Object.assign(K, { strokeStyle: col, lineWidth: lw, lineCap: 'round' });
  runOps(K, [['beginPath'], ['arc', 0, 0, r, 0, 4.2], ['stroke']]);
  K.restore();
}
// three bobbing "someone is typing" dots
function typingDots(K, x, y, t, col = MECH_GREY, r = 6) {
  [0, 1, 2].forEach(i => {
    const lift = 0.5 + 0.5 * Math.sin(t * 9 - i * 0.9);
    circle(K, x + i * r * 3, y - lift * r * 0.8, r * (0.75 + 0.25 * lift), col);
  });
}
// a pulsing "live" dot
function liveDot(K, x, y, r, t, col = C.red) {
  const beat = 0.5 + 0.5 * Math.sin(t * 8);
  circle(K, x, y, r * (1 + 0.9 * beat), accentA(0.25 * (1 - beat)));
  circle(K, x, y, r, col);
}

/* ======================= 2 · the build-up stage ======================= */
/* The stage builds up: every stressed word adds or changes one element, and the earlier ones stay and keep moving.
     const ST = buildStage([
       { id: 'thing', t: T_A, x: 330, y: 760, enter: 'drop', draw: (T, K, t, e) => { …your prop, centred on 0, 0… } },
       { id: 'part',  t: T_B, x: 830, y: 620, enter: 'pop', idle: 1, focus: [0, -20] },
       { id: 'hit',   t: T_C, x: 800, y: 980, enter: 'slide', from: 1, moves: [[T_D, { x: 700, s: 0.8 }]], exit: T_E, exitMode: 'fall' },
     ], { sfx: true });
     draw: ST.draw(T, K, t)    guy: t => act(t, { focus: t => ST.focus(t) })    cam: t => stageCam(t, ST, { release: S1 - 0.3 })
   An element: id; t (it enters on its word); x, y, s = 1, r = 0; draw(T, K, t, e) with e = { age, p, newest, i, x, y, s, el };
     enter: 'pop' | 'drop' | 'slide' (from -1 = left, 1 = right) | 'rise' | 'swing' | 'stamp' | 'none';
     idle (float strength once landed, default 1, 0 = still); nudge (jolts when a newer element lands, default 1);
     moves [[t, {x, y, s, r}]] (springs to new spots: make room, shrink aside); exit (a time) with exitMode 'fall' | 'up' | 'shrink' |
     'left' | 'right'; focus [dx, dy] (where to point on it); z (draw order); sfx (a name, null for none; the default follows the
     entrance) and gain (dB); kick (a camera punch on landing);
     carry: true = it carries over from the previous scene: there from the first frame, no entrance or sound, already floating, the
     oldest for focus (t can be left out). Other elements stay hidden until their entrance starts ('drop' shows 0.2 s early, falling).
   Focus: the presenter and the stage camera follow the newest element unless an override is active:
     buildStage(els, { focus: [[t0, t1, target], …] }) or ST.focusOn(target, t0, t1 = forever) (chainable), where target is an element
     id, an [x, y] scene point, t => [x, y], or null (nobody points). Overrides glide in and out over 0.25 s; a later one wins. */
var MECH_ENTER_SFX = { pop: 'pop', drop: 'thud', slide: 'swoosh', rise: 'swoosh', swing: 'swoosh', stamp: 'stamp', none: null };
// each entrance adjusts the pose g {x, y, s, r, a, p} for dt seconds after its word; false = not visible yet
var MECH_ENTER = {
  pop(g, dt) {
    g.p = pop(dt, 2.6, 0.45);
    g.s *= Math.max(0, g.p);
    g.a = clamp(dt / 0.06);
    g.r += (1 - clamp(g.p)) * -8;
  },
  drop(g, dt, e) {
    if (dt >= 0) {
      e._sq = ring(dt, 4, 10) * 0.1;
      g.p = 1;
      return;
    }
    if (dt < -0.2) return false;
    g.y -= Math.pow(-dt / 0.2, 2) * 700;   // falls in during the 0.2 s before its word
    g.p = 0;
  },
  slide(g, dt, e) {
    const dir = e.from || 1;
    g.p = pop(dt, 2.2, 0.6);
    g.x += (1 - g.p) * 760 * dir;
    g.r += (1 - clamp(g.p)) * 10 * dir;
    g.a = clamp(dt / 0.05);
  },
  rise(g, dt) {
    g.p = pop(dt, 2.0, 0.55);
    g.y += (1 - g.p) * 900;
    g.a = clamp(dt / 0.05);
  },
  swing(g, dt) {
    g.p = pop(dt, 2.4, 0.5);
    g.s *= clamp(g.p * 1.4, 0, 1);
    g.r += pendulum(dt, 26, 1.3, 3) * (dt >= 0 ? 1 : 0);
    g.a = clamp(dt / 0.05);
  },
  stamp(g, dt) {
    if (dt < 0) return false;
    g.s *= dt < 0.14 ? lerp(2.4, 1, E.inQuart(dt / 0.14)) : 1 + ring(dt - 0.14, 5, 12) * 0.05;
    g.a = clamp(dt / 0.06);
    g.p = clamp(dt / 0.14);
  },
};
// each exit moves the pose d seconds after it starts; false = gone
var MECH_EXIT = {
  up(g, d, e, t) {
    g.y += exitY(t, e.exit, 0.4, 1700);
    return d <= 0.42;
  },
  shrink(g, d) {
    g.s *= Math.max(0, 1 - E.inBack(clamp(d / 0.24)));
    return d <= 0.24;
  },
  left: (g, d) => mechExitSide(g, d, -1),
  right: (g, d) => mechExitSide(g, d, 1),
  fall(g, d, e, t) {
    const f = gravityFall(t, e.exit, (hash(e.i * 7 + 1) - 0.5) * 900, -380 - hash(e.i) * 200, (hash(e.i * 3) - 0.5) * 300, 5600);
    g.x += f.dx;
    g.y += f.dy;
    g.r += f.r;
    return f.dy <= 2200;
  },
};
function mechExitSide(g, d, dir) {
  g.x += E.inCubic(clamp(d / 0.3)) * 1400 * dir;
  g.r += d * 40 * dir;
  return d <= 0.3;
}
// an element's defaults (each also gets its index as i and z, and its own focus offset)
var MECH_EL = { s: 1, r: 0, enter: 'pop', idle: 1, nudge: 1, exitMode: 'fall' };
var MECH_LOUD = { stamp: -2, thud: -2 };   // entrance sounds that play louder than the -5 dB default
var mechOwn = (table, key) => Object.prototype.hasOwnProperty.call(table, key) ? table[key] : null;
function buildStage(els, o = {}) {
  const L = [];
  els.forEach((e, i) => {
    const el = Object.assign({ i, z: i, focus: [0, 0] }, MECH_EL, e);
    if (e.carry) Object.assign(el, { enter: 'none', sfx: null, t: e.t ?? -1e9 });   // already there: no entrance, no sound
    L.push(el);
  });
  const overrides = [];
  (o.focus || []).forEach(([t0, t1, target]) => overrides.push({ t0, t1, target }));
  const sounds = o.sfx !== false && typeof cue === 'function';
  for (const el of sounds ? L : []) {
    const name = el.sfx === undefined ? MECH_ENTER_SFX[el.enter] : el.sfx;
    const loud = mechOwn(MECH_LOUD, name);
    if (name && isFinite(el.t)) cue(el.t, name, el.gain ?? (loud === null ? -5 : loud));
    if (el.kick && typeof kick === 'function') kick(el.t + 0.02, el.kick, el.kick);
  }
  // where an element rests (following its moves), before entrances, float, nudges and exits
  const rest = (e, t) => {
    const home = { x: e.x, y: e.y, s: e.s, r: e.r };
    return e.moves ? springObj(t, [[-1e9, home], ...e.moves], 2.0, 0.55) : home;
  };
  // its pose at t → { x, y, s, r, a, p, dt } or null when it is not on stage
  function geom(e, t) {
    const home = rest(e, t);
    const dt = e.carry ? Math.max(t - e.t, 9) : t - e.t;
    if (dt < -0.25 && e.enter !== 'none') return null;
    const g = { x: home.x, y: home.y, s: home.s, r: home.r, a: 1, p: 1 };
    const enter = mechOwn(MECH_ENTER, e.enter);
    if (enter && enter(g, dt, e) === false) return null;
    if (dt < 0 && e.enter !== 'drop') return null;
    if (e.idle && dt > 0) {
      const sway = idleSway(t, e.i * 1.37 + 0.5, clamp((dt - 0.25) / 0.5) * e.idle);
      g.x += sway.dx;
      g.y += sway.dy;
      g.r += sway.r;
    }
    if (e.nudge) {   // pushed away from every newer element that lands
      L.filter(n => !(n === e || n.t <= e.t) && !(t - n.t < 0 || t - n.t > 0.9)).forEach(n => {
        const d = t - n.t;
        const vx = home.x - n.x, vy = home.y - n.y, len = Math.hypot(vx, vy) || 1;
        const push = 18 * e.nudge * Math.exp(-5.5 * d) * Math.sin(TAU * 2.1 * d);
        g.x += vx / len * push;
        g.y += vy / len * push;
        g.r += (vx > 0 ? 1 : -1) * push * 0.12;
      });
    }
    if (e.exit != null && t >= e.exit) {
      const leave = mechOwn(MECH_EXIT, e.exitMode) || MECH_EXIT.fall;
      if (!leave(g, t - e.exit, e, t)) return null;
    }
    return { x: g.x, y: g.y, s: g.s, r: g.r, a: g.a, p: g.p, dt };
  }
  const onStage = (e, t) => {
    const entered = e.carry || t >= e.t - 0.02;
    const gone = e.exit != null && t >= e.exit;
    return entered && !gone;
  };
  const newestAt = t => L.reduce((best, e) => (onStage(e, t) && (!best || e.t >= best.t) ? e : best), null);
  const pointOf = (e, t) => {
    const g = geom(e, t) || rest(e, t);
    const k = g.s || 1;
    return [g.x + e.focus[0] * k, g.y + e.focus[1] * k];
  };
  const resolve = (target, t) => {
    if (target == null) return null;
    if (typeof target === 'function') return target(t);
    if (Array.isArray(target)) return target;
    const el = L.find(x => x.id === target);
    return el ? pointOf(el, t) : null;
  };
  const blend = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
  // the newest live element, glided to from the one before it over 0.25 s so the arm moves rather than jumps
  function autoFocus(t) {
    const n = newestAt(t);
    if (!n) return null;
    const here = pointOf(n, t);
    const k = n.carry ? 1 : E.inOutCubic(clamp((t - n.t + 0.02) / 0.25));
    const before = L.filter(e => e !== n && e.t < n.t && onStage(e, n.t - 0.01)).reduce((best, e) => (!best || e.t > best.t ? e : best), null);
    return before && k < 1 ? blend(pointOf(before, t), here, k) : here;
  }
  function drawElement(T, K, t, e, g, newest) {
    const dropped = e.enter === 'drop';
    const squash = dropped && g.dt > 0 ? ring(g.dt, 4, 10) * 0.1 : 0;   // the landing squash
    if (dropped && g.dt >= 0 && g.dt < 0.55) [-1, 1].forEach(side => puff(T, g.x + side * 120 * g.s, g.y + 120 * g.s, g.dt, 0.7, side));
    _mA([T, K], g.a, () => {
      const both = [T, K];
      both.forEach(c => runOps(c, [['save'], ['translate', g.x, g.y], ['rotate', g.r * D2R], ['scale', g.s * (1 + squash), g.s * (1 - squash)]]));
      if (e.draw) e.draw(T, K, t, { age: t - e.t, p: g.p, newest, i: e.i, x: g.x, y: g.y, s: g.s, el: e });
      both.forEach(c => c.restore());
    });
  }
  const api = { els: L, overrides, resolve, newest: newestAt };
  api.draw = (T, K, t) => {
    const newest = newestAt(t);
    const byDepth = L.slice().sort((a, b) => a.z - b.z);
    for (const e of byDepth) {
      const g = geom(e, t);
      if (!g || g.s <= 0.001) continue;
      drawElement(T, K, t, e, g, e === newest);
    }
  };
  // where the presenter should point: the newest element, blended toward any focus override that is active
  api.focus = t => {
    const byStart = overrides.slice().sort((a, b) => a.t0 - b.t0);
    let aim = autoFocus(t);
    for (const fo of byStart) {
      const weight = mechGlide(t, fo.t0, fo.t1, 0.25, 0.25);
      if (weight <= 0) continue;
      const target = resolve(fo.target, t);
      if (!target) {
        if (weight > 0.5) aim = null;   // a null target means nobody points
        continue;
      }
      aim = aim ? blend(aim, target, weight) : target;
    }
    return aim;
  };
  api.focusOn = (target, t0, t1 = 1e9) => {
    overrides.push({ t0, t1, target });
    return api;
  };
  api.at = (id, t) => {
    const el = L.find(x => x.id === id);
    return el ? geom(el, t) : null;
  };
  return api;
}
// a pointing target that glides from spot to spot: keys [[t, x, y], …] (x or y may be functions of t) → [x, y], null before the
// first key. guy: t => act(t, { focus: t => focusTrack(t, [[T_A, 300, 700], [T_B, 760, 640]]) })
function focusTrack(t, keys, glide = 0.25) {
  const valueOf = (key, slot) => (typeof key[slot] === 'function' ? key[slot](t) : key[slot]);
  const pointAt = key => [valueOf(key, 1), valueOf(key, 2)];
  let i = -1;
  keys.forEach((key, k) => {
    if (t >= key[0] - 0.02) i = k;
  });
  if (i < 0) return null;
  const p = pointAt(keys[i]);
  if (i === 0) return p;
  const u = E.inOutCubic(clamp((t - keys[i][0] + 0.02) / glide));
  const q = pointAt(keys[i - 1]);
  return [lerp(q[0], p[0], u), lerp(q[1], p[1], u)];
}
// a camera that leans toward each new element (on a spring) and pushes in slowly; it eases back to rest from `release`.
// o: { k: 0.1 lean, z: 0.035 zoom, push: 0.006 per second, release (0.3 s back to rest), t0 (the scene's start by default: the zoom
// eases in over 0.6 s and the push counts from there) }
function stageCam(t, st, o = {}) {
  const c = withDefaults(o, MECH_OPTS.cam);
  const t0 = o.t0 ?? (typeof sceneAt === 'function' && SCENES.length ? sceneAt(t).start : 0);
  const lean = (px, py) => [(540 - px) * c.k, (900 - py) * c.k * 0.6];
  const keys = [[-1e9, 0, 0]];
  st.els.filter(e => isFinite(e.t) && !e.carry).forEach(e => keys.push([e.t, ...lean(e.x, e.y)]));
  (st.overrides || []).forEach(fo => {   // an override leans to its target, then back to the newest element
    const p = st.resolve(fo.target, fo.t0);
    if (p) keys.push([fo.t0, ...lean(p[0], p[1])]);
    const n = fo.t1 < 1e8 && st.newest(fo.t1);
    if (n) keys.push([fo.t1, ...lean(n.x, n.y)]);
  });
  keys.sort((a, b) => a[0] - b[0]);
  const rest = 1 - E.inOutCubic(clamp((t - c.release) / 0.3));
  const cx = springTo(t, keys.map(q => [q[0], q[1]]), 1.3, 0.6);
  const cy = springTo(t, keys.map(q => [q[0], q[2]]), 1.3, 0.6);
  const zoom = c.z * clamp((t - t0) / 0.6) + c.push * Math.max(0, t - t0);
  return { x: cx * rest, y: cy * rest, z: 1 + zoom * rest };
}

/* ======================= 3 · the presenter as the hero ======================= */
// a REC viewfinder: corner brackets spring in on a target (usually the presenter's face), a REC pill blinks with a running timer,
// an optional tag pops on its word, an accent glow sits behind the target (on T, so it stays behind him) and an optional
// face-detect box hunts around. Draw it in the scene's `front`.
// o: { t0, t1 (the brackets fly open), cx, cy, hw: 340, hh: 440 (numbers or t => number), from: 1.8, tag, tagT, glow: 1,
// hunt: [t0, t1], rec: 'REC' }
var MECH_CORNERS = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
function recFrame(T, K, t, o = {}) {
  const f = withDefaults(o, MECH_OPTS.rec);
  const val = v => (typeof v === 'function' ? v(t) : v);
  const cx = val(o.cx ?? 540), cy = val(o.cy ?? 1300), hw0 = val(o.hw ?? 340), hh0 = val(o.hh ?? 440);
  if (t < f.t0 || t > f.t1 + 0.35) return;
  const a = pop(t - f.t0, 2.4, 0.55);
  const out = E.inCubic(P(t, f.t1, 0.3));
  const k = lerp(f.from, 1, clamp(a, 0, 1.08)) + out * 0.6;
  const hw = hw0 * k, hh = hh0 * k;
  const shown = clamp((t - f.t0) / 0.08) * (1 - out);
  if (f.glow) glow(T, cx, cy + hh0 * 0.25, hw0 * 1.5, hh0 * 1.2, 0.55 * f.glow * shown * clamp(a));
  _mA([K], shown, () => {
    mechRecBrackets(K, cx, cy, hw, hh);
    mechRecPill(K, t, f, cx - hw + 110, cy - hh - 56);
    if (f.tag) mechRecTag(K, t, f, cx + hw - 130, cy - hh - 56);
    if (f.hunt) mechRecHunt(K, t, f.hunt, cx, cy, hw0, hh0);
  });
}
function mechRecBrackets(K, cx, cy, hw, hh) {
  const arm = Math.min(hw, hh) * 0.26, bend = 30;
  K.save();
  Object.assign(K, { strokeStyle: C.ink, lineWidth: 8, lineCap: 'round', lineJoin: 'round' });
  MECH_CORNERS.forEach(([sx, sy]) => {
    const px = cx + sx * hw, py = cy + sy * hh;
    runOps(K, [['beginPath'], ['moveTo', px, py - sy * arm], ['lineTo', px, py - sy * bend], ['quadraticCurveTo', px, py, px - sx * bend, py],
      ['lineTo', px - sx * arm, py], ['stroke']]);
  });
  K.restore();
}
// a capsule badge: box [x, y, w, h] filled (and outlined when look.edge is set), an optional dot [x, y, r, colour], then its label
function mechCapsule(K, box, look) {
  const [bx, by, bw, bh] = box;
  fillRR(K, bx, by, bw, bh, bh / 2, look.fill);
  if (look.edge) strokeRR(K, bx, by, bw, bh, bh / 2, look.edge, 3);
  if (look.dot) circle(K, ...look.dot);
  text(K, look.label, look.at[0], look.at[1], look.face);
}
function mechRecPill(K, t, f, x, y) {
  const shown = pop(t - f.t0 - 0.12, 3, 0.45);
  if (shown <= 0) return;
  const secs = Math.max(0, Math.floor((t - f.t0) * 1.6));   // the timer runs a little fast, so it visibly ticks
  const blink = Math.floor(t * 3) % 2 === 0 ? C.red : '#5a2a22';
  X([K], x, y, shown, 0, () => mechCapsule(K, [-110, -27, 220, 54], {
    fill: C.ink, dot: [-80, 0, 10, blink], label: `${f.rec} 00:${String(secs % 60).padStart(2, '0')}`, at: [90, 8],
    face: _mono(23, { weight: 700, color: C.paper, align: 'right' }),
  }));
}
function mechRecTag(K, t, f, x, y) {
  const shown = pop(t - (f.tagT ?? f.t0 + 0.3), 3.2, 0.4);
  if (shown <= 0) return;
  X([K], x, y, shown, 3, () => {
    const face = _mono(23, { weight: 700, color: C.red, align: 'center' });
    const tw = measure(K, f.tag, face) + 60;
    mechCapsule(K, [-tw / 2, -27, tw, 54], { fill: '#FFFFFF', edge: C.red, dot: [-tw / 2 + 26, 0, 7, C.red], label: f.tag, at: [12, 8], face });
  });
}
function mechRecHunt(K, t, hunt, cx, cy, hw0, hh0) {
  const shown = win(t, hunt[0], hunt[1], 0.12, 0.15);
  if (shown <= 0) return;
  const mx = cx + noise1(t * 3.1 + 4) * hw0 * 0.22, my = cy + noise1(t * 2.7 + 9) * hh0 * 0.12;
  const size = hw0 * 0.32 + noise1(t * 4 + 2) * 14, arm = 26;
  K.save();
  K.globalAlpha *= shown * (Math.floor(t * 8) % 5 === 0 ? 0.4 : 1);   // flickers like a detector
  Object.assign(K, { strokeStyle: C.red, lineWidth: 5, lineCap: 'round' });
  MECH_CORNERS.forEach(([sx, sy]) => runOps(K, [['beginPath'], ['moveTo', mx + sx * size, my + sy * (size - arm)], ['lineTo', mx + sx * size, my + sy * size],
    ['lineTo', mx + sx * (size - arm), my + sy * size], ['stroke']]));
  K.restore();
}
// the presenter steps into the hero spot (centred, bigger) between t0 and t1 and is docked otherwise: act({ at: t => heroAt(t, a, b) })
function heroAt(t, t0, t1, o = {}) {
  const h = withDefaults(o, MECH_OPTS.hero);
  const dock = PRESENTER_DOCK;
  const m = mechGlide(t, t0, t1, h.dur, h.dur);
  const mix = key => lerp(dock[key], h[key], m);
  return { x: mix('x'), y: mix('y'), s: mix('s') };
}
// the presenter's face box at position g {x, y, s}, to aim recFrame at him
function faceBox(g) {
  const u = g.s;
  return { cx: g.x, cy: g.y - 560 * u, hw: 300 * u, hh: 380 * u };
}

/* ======================= 4 · acting presets ======================= */
/* mood(t, list, opts) → options for act(); list = [[name, t0, t1, extra], …]:
     panic      hand over the mouth, sweat, worried brows, shrinks and shivers, looks away   (moodFx: an accent glow behind him)
     shock      both hands to the face, O mouth, brows up, jerks back                         (moodFx: ink burst lines round the head)
     thinking   hand to the chin, one brow up, looks up and away, head tilt                  (moodFx: a "…" thought bubble; extra
                { bubble: [x, y] | t => [x, y] } puts its centre there in scene space, default up-left of the head)
     shh        finger to the lips, lips shut, brows up, small lean in
     celebrate  both fists up, big smile, bounces                                             (moodFx: confetti)
     lean       steps toward the focus, bigger, brows up (for the key reveal)
     shrug · facepalm · wave · thumbs (thumb + wink) · no (head shake) · nod
     hero       steps to the centre, big (pair it with recFrame); t0 / t1 = in / out
   guy: t => act(t, mood(t, MOODS, { focus: t => ST.focus(t) }))    draw or front: moodFx(T, K, t, MOODS, { …the same opts }) */
// per mood: the arm pose (side 'R' unless the extra names one; fixed sides ignore it), pose extras, the face, and how the body moves
var MOOD_SPEC = {
  panic: {
    pose: 'cover',
    face: () => ({ browTilt: 1, brow: 0.35, smile: -0.55, sweat: 0.95, lookX: 0.45, headTilt: -7 }),
    move(m, w, t) {
      m.dy += 34 * w;
      m.dx += Math.sin(t * 44) * 4 * w;
    },
  },
  shock: {
    pose: 'cover', fixed: 'LR',
    face: () => ({ shock: 1, brow: 1, mouth: 0.8 }),
    move(m, w, t, t0) {
      m.dy += -26 * pendulum(t - t0, 1, 2.2, 5) * w + 10 * w;
      m.ds *= 1 + 0.03 * w;
    },
  },
  thinking: {
    pose: 'cover', extra: () => ({ armRp: 0.8 }),
    face: () => ({ browTilt: 0.8, smile: 0.1, lookX: 0.4, lookY: -0.7, headTilt: 7 }),
  },
  shh: {
    pose: 'shh',
    face: () => ({ press: 1, brow: 0.45, browTilt: 0.25, smile: 0.25, lookX: -0.15, headTilt: -3 }),
    move(m, w) {
      m.dy += -10 * w;
      m.ds *= 1 + 0.03 * w;
    },
  },
  celebrate: {
    pose: 'fist', fixed: 'LR',
    face: () => ({ smile: 1, brow: 0.75 }),
    move(m, w, t, t0) {
      m.dy += -Math.abs(Math.sin((t - t0) * 9)) * 26 * w;
    },
  },
  lean: {
    face: () => ({ brow: 0.6, smile: 0.55, lean: -5 }),
    move(m, w) {
      m.dx += -70 * w;
      m.dy += -24 * w;
      m.ds *= 1 + 0.08 * w;
    },
  },
  shrug: { pose: 'shrug', fixed: 'LR', face: () => ({ browTilt: 0.6, brow: 0.4, smile: -0.2, headTilt: 6 }) },
  facepalm: { pose: 'facepalm', face: () => ({ smile: -0.45, brow: -0.3, headTilt: -6, sweat: 0.4 }) },
  wave: { pose: 'wave', extra: t => ({ wave: t * 9 }), face: () => ({ smile: 0.9, brow: 0.5 }) },
  thumbs: { pose: 'thumb', face: () => ({ smile: 0.95, wink: 1 }) },
  no: { face: (t, t0) => ({ headTurn: 0.3 * Math.sin((t - t0) * 18), browTilt: 0.4, smile: -0.2 }) },
  nod: { face: (t, t0) => ({ headNod: 0.5 * Math.abs(Math.sin((t - t0) * 9)), smile: 0.4 }) },
};
function mood(t, list, opts = {}) {
  const out = Object.assign({}, opts);
  const beats = (opts.beats || []).slice();
  const faces = (opts.faces || []).slice();
  const m = { dx: 0, dy: 0, ds: 1 };
  let hero = null;
  for (const [name, t0, t1, ex = {}] of list) {
    if (name === 'hero') {
      hero = [t0, t1, ex];
      continue;
    }
    const w = win(t, t0, t1, 0.12, 0.25);
    const spec = mechOwn(MOOD_SPEC, name);
    if (w <= 0 || !spec) continue;
    if (spec.pose) {
      const beat = [t0, t1, spec.fixed || ex.side || 'R', spec.pose];
      if (spec.extra) beat.push(spec.extra(t));
      beats.push(beat);
    }
    faces.push([t0, t1, spec.face(t, t0)]);
    if (spec.move) spec.move(m, w, t, t0);
  }
  const base = hero ? heroAt(t, hero[0], hero[1], hero[2]) : typeof opts.at === 'function' ? opts.at(t) : opts.at || PRESENTER_DOCK;
  out.at = { x: base.x + m.dx, y: base.y + m.dy, s: base.s * m.ds };
  out.beats = beats;
  out.faces = faces;
  return out;
}
// the effects that go with the moods (in draw or front; the glows are on T so they sit behind the presenter)
var MOOD_FX = {
  panic(T, K, t, s) {
    if (s.w > 0) glow(T, s.g.x, s.g.y - 430 * s.g.s, 520 * s.g.s, 560 * s.g.s, 0.62 * s.w);
  },
  shock(T, K, t, s) {
    const u = s.g.s;
    burst(K, s.hx, s.hy - 40 * u, t - s.t0, { n: 14, r0: 300 * u, r1: 470 * u, color: C.ink, lw: 9, dur: 0.42 });
    if (s.w > 0) glow(T, s.hx, s.hy, 420 * u, 420 * u, 0.35 * s.w, '0,0,0');
  },
  celebrate(T, K, t, s) {
    const u = s.g.s;
    confetti(K, s.hx, s.hy - 260 * u, t - s.t0, { n: 30, spread: 640, seed: 9, dur: 1.2 });
    if (s.w > 0) glow(T, s.hx, s.hy, 460 * u, 460 * u, 0.4 * s.w);
  },
  thinking(T, K, t, s) {
    if (s.w > 0) mechThoughtBubble(T, K, t, s);
  },
};
function moodFx(T, K, t, list, opts = {}) {
  const g = mood(t, list, opts).at;
  const hx = g.x, hy = g.y - 575 * g.s;
  for (const [name, t0, t1, ex = {}] of list) {
    const w = win(t, t0, t1, 0.12, 0.25);
    const fx = mechOwn(MOOD_FX, name);
    if (fx) fx(T, K, t, { g, hx, hy, w, t0, ex, opts });
  }
}
// the "…" thought bubble with its two trail dots: up-left of the head, or at a chosen centre with the dots stepping toward it
function mechThoughtBubble(T, K, t, s) {
  const { hx, hy } = s, u = s.g.s;
  const choice = s.ex.bubble ?? s.opts.bubble;
  const at = typeof choice === 'function' ? choice(t) : choice;
  const bx = at ? at[0] : hx - 330 * u, by = at ? at[1] : hy - 260 * u;
  let d1 = [hx - 150 * u, hy - 200 * u], d2 = [hx - 210 * u, hy - 240 * u];
  if (at) {
    const vx = bx - hx, vy = by - hy, len = Math.hypot(vx, vy) || 1;
    const near = Math.min((200 + 150 * Math.max(0, -vy / len)) * u, len * 0.6);
    const far = Math.max(near + 30 * u, len - 120 * u);
    const along = r => [hx + vx / len * r, hy + vy / len * r];
    d1 = along(near);
    d2 = along(lerp(near, far, 0.55));
  }
  _mA([T, K], s.w, () => {
    circle(K, d1[0], d1[1], 12 * u, '#FFFFFF', C.ink, 4);
    circle(K, d2[0], d2[1], 20 * u, '#FFFFFF', C.ink, 4);
    const cloud = [bx - 110 * u, by - 60 * u, 220 * u, 110 * u, 55 * u];
    T.save();
    Object.assign(T, { shadowColor: 'rgba(0,0,0,0.3)', shadowBlur: 20, shadowOffsetY: 12 });
    fillRR(T, ...cloud, '#FFFFFF');
    T.restore();
    fillRR(K, ...cloud, '#FFFFFF');
    strokeRR(K, ...cloud, C.ink, 4);
    typingDots(K, bx - 42 * u, by + 6 * u, t, C.ink, 12 * u);
  });
}

/* ======================= 5 · live interface mocks ======================= */
// write the first `count` characters of wrapped lines (each line break counts as one) in ink at at(i) → [x, y] where the last
// written line ends, or null when nothing was written
function mechTypeLines(K, lines, count, face, at) {
  const style = Object.assign({}, face, { color: C.ink, align: 'left' });
  let used = 0, end = null;
  lines.forEach((ln, i) => {
    const room = count - used;   // characters still to show when this line starts
    used += ln.length + 1;
    if (room <= 0) return;
    const shown = ln.slice(0, room);
    const [px, py] = at(i);
    text(K, shown, px, py, style);
    end = [px + measure(K, shown, face), py];
  });
  return end;
}
// ── a chat composer: the prompt types in with a caret, the send button turns accent, presses with a ring at tSend, the prompt rides
// up into a sent bubble, the field shrinks to a reply bar and the answer streams in behind a pulsing dot.
// o: { title: 'Assistant', label: 'new chat', text, tType, cps: 38, tSend, reply, replyCps: 70, blur: 0 (px, an unreadable prompt),
// size: 34, placeholder: 'Message…' }; (x, y) = top-left → { send: [x, y], field: {x, y, w, h} }
function promptBox(T, K, x, y, w, h, t, o = {}) {
  const c = withDefaults(o, MECH_OPTS.prompt);
  const face = { font: F.grot, weight: 500, size: c.size };
  const sent = c.tSend != null ? E.inOutCubic(P(t, c.tSend + 0.05, 0.36)) : 0;
  const typed = Math.max(0, Math.floor((t - c.tType) * c.cps));
  const lines = wrapText(c.text, face, w - 120);
  mechChatHead(T, K, x, y, w, h, c);
  const open = [x + 30, y + 126, w - 60, h - 156];
  const closed = [x + 30, y + h - 96, w - 60, 66];
  const fr = open.map((v, i) => lerp(v, closed[i], sent));
  const active = typed > 0 && sent < 0.5;
  fillRR(K, ...fr, 26, '#FFFFFF');
  strokeRR(K, ...fr, 26, active ? C.ink : HAIR, 3);
  if (typed === 0 && sent < 0.5) text(K, c.placeholder, fr[0] + 30, fr[1] + c.size + 26, Object.assign({}, face, { color: '#b3b0a8', align: 'left' }));
  if (sent > 0.5) _mA([K], (sent - 0.5) * 2, () => text(K, 'Reply…', fr[0] + 30, fr[1] + 44, { font: F.grot, weight: 500, size: 26, color: '#b3b0a8', align: 'left' }));
  const button = mechSendButton(K, t, c, fr, sent, active);
  if (typed > 0) mechPromptText(K, t, x, y, w, h, c, lines, face, typed, fr, open, sent);
  if (c.tSend != null && t > c.tSend + 0.34 && c.reply) mechReply(K, t, x, y, w, c, lines);
  return { send: button, field: { x: fr[0], y: fr[1], w: fr[2], h: fr[3] } };
}
// the composer's card, its title, the chat label and the rule under them
function mechChatHead(T, K, x, y, w, h, c) {
  const rule = y + 100;
  uiCard(T, K, x, y, w, h, { r: 34 });
  text(K, c.title, x + 42, y + 64, { font: F.grot, weight: 700, size: 38, color: C.ink, align: 'left', ls: -1 });
  uiLabel(K, c.label, x + w - 42, y + 60, { align: 'right' });
  line(K, x, rule, x + w, rule, HAIR, 3, 'butt');
}
// the round send button with its arrow (it shrinks into the reply bar) → its centre
function mechSendButton(K, t, c, fr, sent, active) {
  const bx = fr[0] + fr[2] - 50, by = fr[1] + fr[3] - lerp(50, 33, sent), r = lerp(30, 22, sent);
  const press = c.tSend != null ? win(t, c.tSend - 0.05, c.tSend + 0.05, 0.04, 0.12) : 0;
  X([K], bx, by, 1 - press * 0.22, 0, () => {
    circle(K, 0, 0, r, active ? C.red : '#D8D5CD');
    K.save();
    Object.assign(K, { strokeStyle: '#FFFFFF', lineWidth: 5, lineCap: 'round', lineJoin: 'round' });
    runOps(K, [['beginPath'], ['moveTo', 0, r * 0.42], ['lineTo', 0, -r * 0.42], ['moveTo', -r * 0.36, -r * 0.06], ['lineTo', 0, -r * 0.42],
      ['lineTo', r * 0.36, -r * 0.06], ['stroke']]);
    K.restore();
  });
  if (c.tSend != null) shock(K, bx, by, t - c.tSend, { r: 90, color: C.red, lw: 6, dur: 0.4 });
  return [bx, by];
}
// the prompt as it types, then shrinking into the sent bubble at the top right
function mechPromptText(K, t, x, y, w, h, c, lines, face, typed, fr, open, sent) {
  const size = c.size, total = c.text.length;
  const scale = lerp(1, 0.72, sent), lead = size * 1.3;
  const widest = lines.reduce((m, l) => Math.max(m, measure(K, l, face)), 0);
  const bw = Math.min(w - 140, (widest + 60) * 0.72);
  const bh = lines.length * lead * 0.72 + 36;
  const bx = x + w - 40 - bw, by = y + 126;
  if (sent > 0) _mA([K], sent, () => fillRR(K, bx, by, bw, bh, 24, '#F2F0EA'));
  const ox = lerp(fr[0] + 30, bx + 22, sent);
  const oy = lerp(open[1] + size + 26, by + 18 + size * 0.72, sent);
  K.save();
  rr(K, x + 10, y + 104, w - 20, h - 110, 26);
  K.clip();
  runOps(K, [['translate', ox, oy], ['scale', scale, scale]]);
  if (c.blur) K.filter = `blur(${c.blur}px)`;
  const end = mechTypeLines(K, lines, Math.min(typed, total), face, i => [0, i * lead]) || [0, 0];
  K.restore();
  const blinkOn = typed < total || Math.floor(t * 2.4) % 2 === 0;
  if (sent < 0.05 && blinkOn) fillRR(K, ox + end[0] + 4, oy + end[1] - size * 0.82, 4, size * 1.02, 2, C.ink);
}
// the assistant's answer streaming in under the sent prompt
function mechReply(K, t, x, y, w, c, lines) {
  const r0 = c.tSend + 0.34;
  const count = Math.floor((t - r0) * c.replyCps);
  const face = { font: F.grot, weight: 500, size: 28 };
  const wrapped = wrapText(c.reply, face, w - 100);
  const top = y + 126 + lines.length * c.size * 1.3 * 0.72 + 70;
  _mA([K], clamp((t - r0) / 0.15), () => {
    circle(K, x + 52, top - 8, 12, C.red);
    text(K, c.title, x + 74, top, { font: F.grot, weight: 700, size: 24, color: MECH_GREY, align: 'left' });
  });
  const end = mechTypeLines(K, wrapped, count, face, i => [x + 42, top + 46 + i * 40]) || [x + 42, top + 46];
  if (count < c.reply.length) circle(K, end[0] + 16, end[1] - 9, 7 * (0.6 + 0.4 * Math.sin(t * 14)), C.red);
}

// ── a video player with a live scrubber: the playhead runs in real time from t0, seek [[t, toSec]] jumps with an expo ease,
// markers [{ sec, label }] sit on the track and light up as the playhead passes; content(K, x, y, w, h, sec) draws the picture.
// o: { t0: 0, dur: 52, start: 0, seek, markers, content, title, paused: [[t0, t1]] }; (x, y) = top-left → { head: [x, y], sec }
// the playing position (seconds) at t
function mechVideoTime(t, v) {
  let sec = v.start + Math.max(0, t - v.t0);
  v.paused.forEach(([a, b]) => {
    if (t > a) sec -= Math.min(t, b) - a;
  });
  v.seek.forEach(([ts, to]) => {
    if (t < ts) return;
    const since = t - ts;
    const before = sec - since;
    sec = lerp(before + since, to + since, E.inOutExpo(clamp(since / 0.45)));
  });
  return clamp(sec, 0, v.dur);
}
// a play triangle, flat side at `left`, point at `right`
function mechPlay(K, left, cy, half, right) {
  runOps(K, [['beginPath'], ['moveTo', left, cy - half], ['lineTo', left, cy + half], ['lineTo', right, cy], ['closePath']]);
  K.fillStyle = C.ink;
  K.fill();
}
// the stand-in picture when no content is given: a dark screen of bouncing level bars
function mechVideoBars(K, x, y, w, vh, sec) {
  fillRR(K, x + 14, y + 14, w - 28, vh - 14, 20, '#15161A');
  for (let i = 0; i < 24; i++) mechLevelBar(K, i, x, y, w, vh, sec);
}
// level bar i of 24, its height wandering with the playing position (every fifth one in the accent)
function mechLevelBar(K, i, x, y, w, vh, sec) {
  const level = 0.25 + 0.75 * Math.abs(noise1(sec * 3 + i * 0.7));
  const tall = level * (vh - 120) * 0.6;
  const left = x + 50 + i * (w - 100) / 24;
  const mid = y + vh / 2;
  fillRR(K, left, mid - tall / 2, (w - 100) / 24 - 8, tall, 4, i % 5 === 2 ? C.red : '#3A3C42');
}
function videoPlayer(T, K, x, y, w, h, t, o = {}) {
  const v = withDefaults(o, MECH_OPTS.video);
  const sec = mechVideoTime(t, v);
  const isPaused = v.paused.some(([a, b]) => t >= a && t < b);
  const vh = h - VIDEO_BAR;
  uiCard(T, K, x, y, w, h, { r: 30 });
  mechVideoScreen(K, x, y, w, vh, v, sec, isPaused);
  const by = y + vh + VIDEO_BAR / 2;
  const head = mechVideoControls(K, x, w, by, v, sec, isPaused);
  return { head: [head, by], sec };
}
var VIDEO_BAR = 92;   // the control bar's height
// the picture (clipped to the rounded screen), the title over it and a big play button while paused
function mechVideoScreen(K, x, y, w, vh, v, sec, isPaused) {
  const screen = [x + 14, y + 14, w - 28, vh - 14];
  K.save();
  rr(K, ...screen, 20);
  K.clip();
  if (v.content) v.content(K, ...screen, sec);
  else mechVideoBars(K, x, y, w, vh, sec);
  if (v.title) text(K, v.title, x + 44, y + 64, { font: F.grot, weight: 700, size: 30, color: '#FFFFFF', align: 'left' });
  if (isPaused) {
    const cx = x + w / 2, cy = y + vh / 2;
    circle(K, cx, cy, 60, 'rgba(255,255,255,0.9)');
    mechPlay(K, cx - 16, cy, 26, cx + 28);
  }
  K.restore();
}
// play / pause, the track with its markers, the playhead and the clock → the playhead's x
function mechVideoControls(K, x, w, by, v, sec, isPaused) {
  if (isPaused) mechPlay(K, x + 42, by, 15, x + 68);
  else [x + 40, x + 56].forEach(px => fillRR(K, px, by - 15, 9, 30, 3, C.ink));
  const from = x + 100, to = x + w - 215, span = to - from;
  const head = from + span * (sec / v.dur);
  line(K, from, by, to, by, '#E4E1D9', 10);
  line(K, from, by, head, by, C.red, 10);
  for (const m of v.markers) {
    const mx = from + span * m.sec / v.dur;
    const reached = sec >= m.sec - 0.05;   // a marker lights up once the playhead reaches it
    const ink = reached ? C.red : C.ink;
    X([K], mx, by, reached ? 1.12 : 1, 0, () => fillRR(K, -16, -16, 32, 32, 9, ink));
    if (m.label) text(K, m.label, mx, by - 30, _mono(19, { weight: 700, color: ink, align: 'center' }));
  }
  circle(K, head, by, 17, '#FFFFFF', C.ink, 5);
  const clock = secs => Math.floor(secs / 60) + ':' + String(Math.floor(secs % 60)).padStart(2, '0');
  text(K, `${clock(sec)} / ${clock(v.dur)}`, x + w - 30, by + 9, _mono(23, { weight: 700, color: C.ink, align: 'right' }));
  return head;
}

// ── an odometer: each digit column rolls like a mechanical counter, and a column only turns while the one below it passes 9 → 0;
// leading columns slide in when they are needed. v = the value now (a float).
// o: { size: 130, color, prefix, suffix, digits (a fixed column count), sep: ',', align: 'left', weight: 700, vel (units per second:
// fast columns smear) } → the total width
function odometer(K, v, x, y, o = {}) {
  const d = withDefaults(o, { ...MECH_OPTS.odometer, color: C.ink });
  const face = { font: F.grot, weight: d.weight, size: d.size, ls: 0 };
  const value = Math.max(0, v);
  const columns = o.digits || Math.max(1, String(Math.floor(value)).length);
  const mc = _mctx();
  const digitW = measure(mc, '0', face) * 1.02;
  const [sepW, prefixW, suffixW] = [d.sep, d.prefix, d.suffix].map(s => measure(mc, s, face));
  // the columns from the left: digits, with a separator after every third
  const cols = Array.from({ length: columns }, (_, n) => columns - 1 - n)
    .flatMap(k => (k % 3 === 0 && k > 0 && d.sep ? [{ digit: k }, { sep: k }] : [{ digit: k }]));
  // a column's position: the units are the value itself; a higher column adds how far the part below it has gone past …9
  const rollOf = k => mechOdoRoll(value, k);
  const shownOf = k => clamp(rollOf(k));
  const widthOf = c => (c.sep === undefined ? digitW * (c.digit === 0 ? 1 : shownOf(c.digit)) : sepW * shownOf(c.sep));
  const total = cols.reduce((sum, c) => sum + widthOf(c), prefixW + suffixW);
  const plain = { color: d.color, align: 'left', ...face };
  let pen = d.align === 'left' ? x : d.align === 'right' ? x - total : x - total / 2;
  text(K, d.prefix, pen, y, plain);
  pen += prefixW;
  const lh = d.size * 1.05;
  cols.forEach(c => {
    if (c.sep !== undefined) {
      const a = shownOf(c.sep);
      if (a > 0.01) _mA([K], a, () => text(K, d.sep, pen, y, plain));
      pen += sepW * a;
      return;
    }
    const a = c.digit === 0 ? 1 : shownOf(c.digit);
    if (a <= 0.01) return;
    mechOdoColumn(K, c.digit, rollOf(c.digit), pen, y, a, digitW, lh, face, d, o.vel);
    pen += digitW * a;
  });
  text(K, d.suffix, pen, y, plain);
  return total;
}
// how far digit column k (0 = units) has rolled: the units are the value itself; a higher column adds how far the part below it has
// gone past …9 (so it turns only during the carry)
function mechOdoRoll(value, k) {
  if (k === 0) return value;
  const place = Math.pow(10, k);
  const whole = Math.floor(value / place);
  const below = value - whole * place;
  return whole + clamp(below - (place - 1), 0, 1);
}
// one rolling digit column: the digit leaving upward and the next one arriving, smeared into three passes when it spins fast
function mechOdoColumn(K, k, pos, x, y, a, dw, lh, face, d, vel) {
  const digit = Math.floor(pos), frac = pos - digit;
  K.save();
  runOps(K, [['beginPath'], ['rect', x - 4, y - d.size * 0.98, dw * a + 8, d.size * 1.2], ['clip']]);
  const rate = Math.abs(vel || 0) / Math.pow(10, k);
  const smear = clamp((rate - 4) / 14);
  const passes = smear > 0.05 ? [-0.22, 0, 0.22] : [0];
  const style = { color: d.color, align: 'center', ...face };
  passes.forEach(off => _mA([K], a * (passes.length > 1 ? 0.45 : 1), () => {
    const yy = y + off * smear * lh;
    text(K, String(digit % 10), x + dw / 2, yy - frac * lh, style);
    if (frac > 0.001) text(K, String((digit + 1) % 10), x + dw / 2, yy + (1 - frac) * lh, style);
  }));
  K.restore();
}
// ── a live stat card: a label and a blinking LIVE pill, an odometer number rolling between keys [[t, value]], a sparkline that keeps
// drawing (with live jitter, the newest point pulsing) and an optional delta pill.
// o: { label, keys, prefix, suffix, size: 130, roll: 0.8, hot, delta: [t, text], spark: true, live: true }; (x, y) = top-left →
// { num: [x, y] }
function liveStat(T, K, x, y, w, h, t, o = {}) {
  const s = withDefaults(o, MECH_OPTS.stat);
  // the value at tt: each key's step eases in over `roll` seconds
  const valueAt = tt => {
    let v = s.keys[0][1];
    for (let i = 1; i < s.keys.length; i++) v += (s.keys[i][1] - s.keys[i - 1][1]) * E.outCubic(clamp((tt - s.keys[i][0]) / s.roll));
    return v;
  };
  const v = valueAt(t);
  const top = Math.max(...s.keys.map(k => k[1]), 1);
  const isHot = typeof s.hot === 'function' ? s.hot(t) : s.hot ?? false;
  uiCard(T, K, x, y, w, h, { r: 28 });
  uiLabel(K, s.label, x + 32, y + 56);
  if (s.live) mechLiveBadge(K, x + w, y, t);
  const lastKey = s.keys.filter(k => t >= k[0]).slice(-1)[0] || s.keys[0];
  const settled = t > lastKey[0] + s.roll * 0.6 && lastKey !== s.keys[0];
  const bump = 1 + ring(t - lastKey[0] - s.roll * 0.6, 3.2, 7) * 0.08 * (settled ? 1 : 0);
  const speed = (valueAt(t + 0.02) - valueAt(t - 0.02)) / 0.04;
  X([K], x + 32, y + 92 + s.size * 0.86, bump, 0, () => odometer(K, v, 0, 0, {
    size: s.size, prefix: s.prefix, suffix: s.suffix, digits: String(Math.floor(top)).length, color: isHot ? C.red : C.ink, vel: speed,
  }));
  if (s.delta) mechDeltaPill(K, x + w - 90, y + 92 + s.size * 0.5, t, s.delta);
  if (s.spark) mechSparkline(K, t, x, y, w, h, s, valueAt, top, isHot);
  return { num: [x + 32 + 120, y + 92 + s.size * 0.5] };
}
function mechLiveBadge(K, right, y, t) {
  const blink = Math.floor(t * 2.4) % 2 ? C.red : '#F3B5AB';
  mechCapsule(K, [right - 132, y + 26, 104, 42], {
    fill: '#FFFFFF', edge: HAIR, dot: [right - 108, y + 47, 8, blink], label: 'LIVE', at: [right - 44, y + 56],
    face: _mono(20, { weight: 700, color: C.ink, align: 'right' }),
  });
}
function mechDeltaPill(K, cx, cy, t, delta) {
  const shown = pop(t - delta[0], 3, 0.45);
  if (shown <= 0) return;
  X([K], cx, cy, shown, -4, () => {
    const face = _mono(24, { weight: 700, color: '#FFFFFF', align: 'center' });
    const tw = measure(K, delta[1], face) + 30;
    mechCapsule(K, [-tw / 2, -22, tw, 44], { fill: C.red, label: delta[1], at: [0, 8], face });
  });
}
// the last four seconds of the value as a line, with a dashed ceiling, a floor and a pulsing dot on the newest point
function mechSparkline(K, t, x, y, w, h, s, valueAt, top, isHot) {
  const sx0 = x + 32, sx1 = x + w - 32, sy1 = y + h - 40, sy0 = y + 92 + s.size + 30;
  const steps = 40, span = 4;
  if (sy1 - sy0 <= 30) return;
  K.save();
  K.setLineDash([4, 8]);
  line(K, sx0, sy0, sx1, sy0, '#E6E3DC', 2, 'butt');
  K.restore();
  line(K, sx0, sy1, sx1, sy1, HAIR, 2, 'butt');
  const pts = Array.from({ length: steps + 1 }, (_, i) => {
    const tt = t - span + span * i / steps;
    const jitter = s.live ? noise1(tt * 2.3) * 0.06 + noise1(tt * 7) * 0.02 : 0;
    return [lerp(sx0, sx1, i / steps), lerp(sy1 - 8, sy0, clamp(valueAt(tt) / top * 0.85 + 0.07 + jitter))];
  });
  K.save();
  runOps(K, [['beginPath'], ...pts.map((p, i) => [i ? 'lineTo' : 'moveTo', p[0], p[1]])]);
  Object.assign(K, { strokeStyle: isHot ? C.red : C.ink, lineWidth: 5, lineJoin: 'round', lineCap: 'round' });
  K.stroke();
  K.restore();
  const tip = pts[steps];
  circle(K, tip[0], tip[1], 9, C.red);
  shock(K, tip[0], tip[1], t % 1.1, { r: 40, color: C.red, lw: 4, dur: 0.7 });
}

// ── a notification stack: toasts push in from the side on their words, older ones spring down, shrink and fade; the newest is accent.
// items [{ t, title, body, glyph: 'bell' | 'mail' | any text, time: 'now' }]; o: { max: 4, h: 92, from: 1 (right) | -1 };
// (x, y) = top-left of the newest slot → { newest: [x, y] | null }
function toastStack(T, K, x, y, w, t, items, o = {}) {
  const ts = withDefaults(o, MECH_OPTS.toasts);
  const arrived = items.filter(n => t >= n.t);
  const count = arrived.length;
  // how far each toast has been pushed down: a slot per newer toast, springing in as that one arrives
  const pushes = arrived.map(n => pop(t - n.t, 2.4, 0.6));
  arrived.forEach((n, i) => {
    const age = count - 1 - i;   // 0 = the newest
    if (age > ts.max) return;
    let slot = 0;
    for (let j = i + 1; j < count; j++) slot += pushes[j];
    const fade = clamp(1 - (slot - (ts.max - 1.2)) / 0.8);
    if (fade <= 0) return;
    const inP = pop(t - n.t, 2.8, 0.55), settled = clamp(inP);
    const pose = {
      x: x + w / 2 + (1 - settled) * 560 * ts.from,   // flies in from the side
      y: y + slot * (ts.h + 12) * 0.86 + ts.h / 2,
      s: (1 - slot * 0.045) * lerp(0.9, 1, settled),
      r: (1 - settled) * 8 * ts.from,
    };
    _mA([T, K], fade * clamp(inP * 3), () => X([T, K], pose.x, pose.y, pose.s, pose.r, () => mechToastCard(T, K, t, n, age, w, ts.h)));
  });
  return { newest: count ? [x + w / 2, y + ts.h / 2] : null };
}
// one toast centred on 0, 0
function mechToastCard(T, K, t, n, age, w, h) {
  const x0 = -w / 2, y0 = -h / 2, mid = y0 + h / 2;
  uiCard(T, K, x0, y0, w, h, { r: 22, shadow: 0.75 });
  fillRR(K, x0 + 18, y0 + (h - 54) / 2, 54, 54, 14, age === 0 ? C.red : C.ink);
  const glyph = n.glyph || 'bell', gx = x0 + 45;
  const icons = {
    bell: () => mechBell(K, gx, mid, age === 0 ? pendulum(t - n.t, 0.35, 3, 3) : 0),   // the newest bell rings
    mail: () => envelope(K, gx, mid, 30, 22, 3, '#FFFFFF', 'rgba(0,0,0,0)'),
  };
  const icon = mechOwn(icons, glyph) || (() => text(K, glyph, gx, mid + 11, { font: F.grot, weight: 700, size: 32, color: '#FFFFFF' }));
  icon();
  const rows = [
    [n.title || '', x0 + 88, mid - 6, { font: F.grot, weight: 700, size: 26, color: C.ink, align: 'left' }],
    [n.time || 'now', x0 + w - 22, mid - 6, _mono(19, { align: 'right' })],
    [n.body, x0 + 88, mid + 26, { font: F.grot, weight: 500, size: 23, color: '#55524C', align: 'left' }],
  ];
  rows.forEach(([str, rx, ry, style], k) => {
    if (k < 2 || str) text(K, str, rx, ry, style);
  });
}
// a white bell, tilted (radians)
function mechBell(K, x, y, tilt) {
  K.save();
  runOps(K, [['translate', x, y], ['rotate', tilt]]);
  K.fillStyle = '#fff';
  runOps(K, [['beginPath'], ['moveTo', -12, 8], ['quadraticCurveTo', -11, -13, 0, -13], ['quadraticCurveTo', 11, -13, 12, 8], ['closePath'], ['fill']]);
  circle(K, 0, 11, 4, '#fff');
  K.restore();
}

/* ======================= 6 · palette flood (a whole section in another colour) ======================= */
// In the scene's `back` (screen space): floods the frame with `col` from (x, y) at t0 as a growing circle, drains back at t1.
// Pair it with hl: t => ({ color: paletteOn(t, t0, t1) > 0.5 ? '#F6F5F1' : undefined }). While flooded, T (the tone layer) is hidden:
// draw shadows and glows on K (rgba) and use light ink for text.
function paletteOn(t, t0, t1 = 1e9) {
  return mechGlide(t, t0, t1, 0.32, 0.3);
}
function paletteFlood(T, K, t, t0, t1 = 1e9, o = {}) {
  const flood = withDefaults(o, MECH_OPTS.flood);
  const grown = paletteOn(t, t0, t1);
  if (grown <= 0) return;
  // the circle has to reach the farthest corner of the frame
  const reach = Math.hypot(Math.max(flood.x, W - flood.x), Math.max(flood.y, H - flood.y));
  K.save();
  runOps(K, [['beginPath'], ['arc', flood.x, flood.y, reach * grown, 0, TAU]]);
  K.fillStyle = flood.col;
  K.fill();
  K.restore();
}

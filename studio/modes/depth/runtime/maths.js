// Small numeric toolbox shared by the depth runtime, the prop library and every shot file (k.ease, k.spring … in a shot).
// Everything here is a pure function of its inputs: no clocks, no Math.random. Frames must render in any order.

export const clamp = (x, lo = 0, hi = 1) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a, b, u) => a + (b - a) * u;
export const span = (t, t0, len) => clamp((t - t0) / Math.max(1e-6, len));      // 0 → 1 across [t0, t0 + len]
export const window01 = (t, a, b) => clamp((t - a) / Math.max(1e-6, b - a));

// easing family (input clamped to 0..1)
export const ease = {
  in: (u) => clamp(u) ** 3,
  out: (u) => 1 - (1 - clamp(u)) ** 3,
  both: (u) => { u = clamp(u); return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2; },
  soft: (u) => { u = clamp(u); return u * u * (3 - 2 * u); },
  back: (u, s = 1.6) => { u = clamp(u) - 1; return 1 + u * u * ((s + 1) * u + s); },
};

// critically-underdamped settle: 0 at u <= 0, overshoots, rests at 1. `wobble` = how many swings, `damp` = how fast they die.
export function spring(u, wobble = 1.4, damp = 5) {
  if (u <= 0) return 0;
  return 1 - Math.exp(-damp * u) * Math.cos(wobble * Math.PI * 2 * u);
}
// a one-off bump: 0 → peak → 0 (for punches and hops). dt = time since the hit.
export function bump(dt, len = 0.35) {
  if (dt <= 0 || dt >= len) return 0;
  const u = dt / len;
  return Math.sin(Math.PI * u) * (1 - u * 0.35);
}
// ringing decay after an impact (sign-changing), for wobbling things that just landed
export const ring = (dt, hz = 2.2, decay = 5.5) => (dt <= 0 ? 0 : Math.sin(dt * hz * 6.2832) * Math.exp(-dt * decay));

// seeded generator (mulberry-ish): same seed, same sequence, every render
export function rng(seed = 1) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
// smooth value noise in 1D (idle breathing, hand-held drift): deterministic in t and channel
export function drift(t, ch = 0) {
  const f = (x) => { const s = Math.sin(x * 127.1 + ch * 311.7) * 43758.5453; return s - Math.floor(s); };
  const i = Math.floor(t), u = t - i, w = u * u * (3 - 2 * u);
  return lerp(f(i), f(i + 1), w) * 2 - 1;
}

export const deg = (d) => (d * Math.PI) / 180;

// ── lit-room motion (v1.2): the springs the characters and props use. f = swings per second, z = damping ratio (0..1).
export const TAU = Math.PI * 2;
// settle 0 → 1 with a natural overshoot (a different shape from `spring`: physical frequency + damping, for props landing)
export function settle(u, f = 2.4, z = 0.55) {
  if (u <= 0) return 0;
  const w = TAU * f, wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * u) * (Math.cos(wd * u) + ((z * w) / wd) * Math.sin(wd * u));
}
// a jolt that peaks at 1 right after the hit and rings out (scale punches, a needle being flicked)
export function jolt(u, f = 2.8, z = 0.5) {
  if (u <= 0) return 0;
  const w = TAU * f, wd = w * Math.sqrt(1 - z * z), tp = Math.atan(wd / (z * w)) / wd;
  return (Math.exp(-z * w * (u - tp)) * Math.sin(wd * u)) / Math.sin(wd * tp);
}
// grow-in for anything that appears: never exactly 0 (three.js dislikes zero scale)
export const grow = (u, f = 3.2, z = 0.5) => Math.max(0.001, settle(u, f, z));
// a hop: returns [lift, squashY] for a jump of height h that takes d seconds (squat, arc, landing squash)
export function hopAt(u, h, d = 0.36) {
  if (u < -0.1 || u > d + 0.7) return [0, 1];
  if (u < 0) return [0, 1 - 0.1 * Math.sin((Math.PI * (u + 0.1)) / 0.1)];
  if (u < d) return [h * Math.sin((Math.PI * u) / d), 1 + 0.07 * Math.sin((Math.PI * u) / d)];
  return [0, 1 - 0.13 * jolt(u - d, 3.2, 0.4)];
}
// stable pseudo-random in [0,1) for an integer-ish input (flickers, scatter), and smooth 1D noise in [-1,1]
export const noise01 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export const wander = (t, ch = 0) => { const i = Math.floor(t), f = t - i, s = f * f * (3 - 2 * f); return lerp(noise01(i + ch * 101.3), noise01(i + 1 + ch * 101.3), s) * 2 - 1; };

// Bix: the kit's boxy 3D character. A rounded block body on four stubby legs, two arms, painted eyes, and a wardrobe
// (overalls, suit + tie, hats, glasses, apron, headset, bow). One Bix is the host of a reel; small recoloured Bixes are the crowd.
// The kit's default look is LOOK: denim overalls over a cream tee and a red cap.
//
//   const b = k.buddy({ ...k.LOOK }, shot.root)  ·  k.buddy({ color: '#F2B544', overalls: 0x3f6390, hat: 'cap', hatColor: 0xd9653b }, shot.root)    → b.root (place it), b.arms, b.eyes …
//   in frame(): b.idle(t) · b.walk(t) · b.hop(t - tWord, 0.2) · b.blink(t, [1.2, 3.4]) · b.arm('left', angle) · b.wave(t, t0)
//               b.point(t, t0, side) · b.type(t) · b.cheer(t, t0) · b.talk(t, words)  (a small bob on every spoken word)
// Units: one Bix is about 1 m tall at scale 1. Everything is a pure function of t, so frames render in any order.
import * as THREE from 'three';
import { box, tube, ball, put, group, contact, paint, mat } from './kit3d.js';
import { clamp, settle, jolt, hopAt, TAU } from '../runtime/maths.js';

export const BIX = { color: 0xf2b544, suit: 0x23305c, tie: 0xc8302a, denim: 0x3f6390, shirt: 0xf3ecdd, cap: 0xd9653b };   // mustard body; wardrobe colours
export const LOOK = { overalls: BIX.denim, hat: 'cap', hatColor: BIX.cap };                                                  // the kit's default host

export function buddy(o = {}, parent) {
  const { color = BIX.color, scale = 1, suit = false, suitColor = BIX.suit, tie = BIX.tie, overalls = null, shirt = BIX.shirt, hat = null, hatColor = suitColor,
    beanie = null, glasses = false, apron = null, bow = null, headset = false, chef = false } = o;
  const root = new THREE.Group(), rig = group(root), body = group(rig);
  const W = 1.0, H = 0.8, D = 0.7, LEG = 0.22, skin = paint(color), cloth = paint(suitColor);
  put(box(W, H, D, skin, 0.05), 0, LEG + H / 2, 0, body);
  const eyeY = LEG + H * 0.64, front = D / 2 + 0.008;
  const eyes = [-0.2, 0.2].map((x) => put(box(0.11, 0.17, 0.03, mat.ink, 0.01), x, eyeY, front, body));
  const legs = [-0.36, -0.12, 0.12, 0.36].map((x) => { const p = group(rig, x, LEG, 0); put(box(0.11, LEG, 0.14, skin, 0.02), 0, -LEG / 2, 0, p); return p; });
  const arms = [-1, 1].map((side) => {
    const p = group(body, side * (W / 2 + 0.03), LEG + H * 0.5, 0);
    put(box(0.15, 0.28, 0.18, suit ? cloth : overalls != null ? paint(shirt) : skin, 0.03), side * 0.07, -0.12, 0, p);
    if (suit || overalls != null) put(box(0.15, 0.12, 0.17, skin, 0.03), side * 0.07, -0.31, 0, p);
    return p;
  });
  const top = LEG + H;
  if (suit) {                                              // jacket on the lower half, a shirt V and a tie in front
    const v = LEG + H * 0.52, z = D / 2 + 0.021;
    put(box(W + 0.04, H * 0.52, D + 0.04, cloth, 0.05), 0, LEG + H * 0.26, 0, body);
    put(new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(-0.16, v), new THREE.Vector2(0.16, v), new THREE.Vector2(0, v - 0.3)])), paint(0xf4f0e6, { map: null })), 0, 0, z, body);
    const tieShape = new THREE.Shape([[-0.035, v], [0.035, v], [0.025, v - 0.05], [0.05, v - 0.25], [0, v - 0.31], [-0.05, v - 0.25], [-0.025, v - 0.05]].map(([x, y]) => new THREE.Vector2(x, y)));
    put(new THREE.Mesh(new THREE.ShapeGeometry(tieShape), paint(tie, { map: null, rough: 0.5 })), 0, 0, z + 0.003, body);
    [0.05, -0.06].forEach((dy) => put(ball(0.018, mat.ink, 10), 0.09, v - 0.33 + dy, z, body));
  }
  if (overalls != null && !suit) {                         // denim overalls: trousers half, a short bib with a pocket under the eyes, two straps, brass buttons
    const den = paint(overalls), z = D / 2 + 0.021, waist = LEG + H * 0.36, bibTop = LEG + H * 0.52;
    put(box(W + 0.04, H * 0.36, D + 0.04, den, 0.05), 0, LEG + H * 0.18, 0, body);
    put(box(0.46, bibTop - waist, 0.03, den, 0.02), 0, (bibTop + waist) / 2, z - 0.005, body);
    put(box(0.2, 0.08, 0.012, paint(new THREE.Color(overalls).multiplyScalar(0.78).getHex()), 0.01), 0, waist + 0.06, z + 0.014, body);
    [-0.36, 0.36].forEach((x) => { put(box(0.07, top - waist, 0.02, den, 0.005), x, (top + waist) / 2, z, body); put(box(0.07, 0.02, D * 0.75, den, 0.005), x, top + 0.004, 0, body); put(ball(0.026, mat.brass, 10), x, waist + 0.05, z + 0.02, body); });
    [-0.18, 0.18].forEach((x) => put(box(0.02, H * 0.22, 0.012, paint(0xe2b45a, { map: null }), 0), x, LEG + H * 0.14, z + 0.004, body));
  }
  const hatColorMat = paint(hatColor);
  if (hat === 'fedora') { const h = group(body, 0, top, 0); h.rotation.set(-0.05, 0, 0.08); put(tube(0.43, 0.43, 0.025, hatColorMat, 40), 0, 0.012, 0, h); put(tube(0.22, 0.26, 0.17, hatColorMat, 40), 0, 0.1, 0, h); put(tube(0.262, 0.262, 0.04, paint(tie, { map: null }), 40), 0, 0.045, 0, h); }
  if (hat === 'cap') { const h = group(body, 0, top, 0); const dome = put(new THREE.Mesh(new THREE.SphereGeometry(0.38, 24, 12, 0, TAU, 0, Math.PI / 2), hatColorMat), 0, -0.01, 0, h); dome.scale.set(1.12, 0.72, 0.95); dome.castShadow = true; put(box(0.5, 0.025, 0.28, hatColorMat, 0.01), 0, 0.01, 0.42, h); }
  if (chef) { const h = group(body, 0, top, 0); put(tube(0.3, 0.27, 0.16, mat.cream, 30), 0, 0.08, 0, h); const puff = put(ball(0.36, mat.cream, 20), 0, 0.3, 0, h); puff.scale.set(1, 0.62, 1); }
  if (beanie) { const h = group(body, 0, top, 0); const m = paint(beanie); const b = put(new THREE.Mesh(new THREE.SphereGeometry(0.42, 24, 12, 0, TAU, 0, Math.PI / 2), m), 0, -0.02, 0, h); b.scale.set(1.15, 0.55, 0.85); b.castShadow = true; put(tube(0.49, 0.49, 0.09, m, 30), 0, 0.02, 0, h).scale.set(1, 1, 0.74); }
  if (glasses) { const gz = D / 2 + 0.03; [-0.2, 0.2].forEach((x) => { const r = put(new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.018, 8, 4), mat.ink), x, eyeY, gz, body); r.rotation.z = Math.PI / 4; r.scale.set(1.05, 1.35, 1); }); put(box(0.16, 0.02, 0.02, mat.ink, 0), 0, eyeY + 0.03, gz, body); }
  if (apron) { put(box(0.62, 0.42, 0.02, paint(apron), 0.01), 0, LEG + 0.24, D / 2 + 0.012, body); put(box(0.2, 0.08, 0.025, paint(0xffffff, { map: null })), 0, LEG + 0.3, D / 2 + 0.024, body); }
  if (bow) { const b = group(body, 0.27, top + 0.02, 0.1); [-1, 1].forEach((s) => { const c = put(new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.16, 4), paint(bow, { map: null })), s * 0.08, 0, 0, b); c.rotation.z = (s * Math.PI) / 2; }); put(ball(0.04, paint(bow, { map: null }), 10), 0, 0, 0, b); }
  if (headset) { const h = group(body, 0, top - 0.02, 0); const band = put(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.025, 8, 32, Math.PI), mat.charcoal), 0, -0.12, 0, h); band.rotation.y = Math.PI / 2; [-1, 1].forEach((s) => put(box(0.06, 0.18, 0.16, mat.charcoal, 0.02), s * 0.53, -0.14, 0, h)); const mic = put(box(0.24, 0.02, 0.02, mat.charcoal, 0), -0.48, -0.32, 0.22, h); mic.rotation.y = -0.6; }
  const shadow = put(contact(1.3, 1.0, 0.4), 0, 0.006, 0, root);
  root.scale.setScalar(scale);
  parent && parent.add(root);

  const b = {
    root, rig, body, eyes, legs, arms, scale, shadow,
    idle(t, seed = 0) { rig.position.y = 0; rig.scale.set(1, 1 + 0.014 * Math.sin(TAU * 0.5 * t + seed), 1); body.rotation.set(0, 0.04 * Math.sin(TAU * 0.3 * t + seed), 0); legs.forEach((l) => { l.rotation.x = 0; }); },
    walk(t, seed = 0, pace = 2.6) { const ph = TAU * pace * t + seed; legs.forEach((l, j) => { l.rotation.x = 0.6 * Math.sin(ph + (j % 2) * Math.PI); }); rig.position.y = 0.05 * Math.abs(Math.sin(ph)); body.rotation.z = 0.06 * Math.sin(ph); },
    lift(dy, squashY = 1) { rig.position.y += dy; const k = 1 / Math.sqrt(squashY); rig.scale.set(k, squashY, k); },
    hop(dt, height = 0.2) { const [y, s] = hopAt(dt, height); b.lift(y, s); },
    blink(t, times) { const shut = times.some((x) => t >= x && t < x + 0.1); eyes.forEach((e) => { e.scale.y = shut ? 0.15 : 1; }); },
    arm(side, angle, forward = 0) { const a = arms[side === 'left' ? 0 : 1]; a.rotation.set(forward, 0, side === 'left' ? -angle : angle); },
    rest(t) { b.arm('left', 0.12); b.arm('right', 0.12 + 0.08 * Math.sin(TAU * 0.6 * t)); },
    wave(t, t0, side = 'right') { const u = settle(t - t0, 2.2, 0.5); b.arm(side, 0.12 + 2.4 * u + 0.35 * Math.sin(TAU * 2 * t) * clamp((t - t0) / 0.4)); },
    point(t, t0, side = 'left', reach = 1.25) { b.arm(side, 0.12 + reach * settle(t - t0, 2, 0.5) - 0.06 * Math.sin(TAU * 1.6 * t) * clamp((t - t0 - 0.3) / 0.3)); },
    type(t) { const tap = (k) => 0.25 * Math.max(0, Math.sin(TAU * 4.5 * t + k)); arms[0].rotation.set(-1.25 - tap(0), 0, -0.35); arms[1].rotation.set(-1.25 - tap(1.7), 0, 0.25); },
    cheer(t, t0) { const u = Math.max(0, settle(t - t0, 2.4, 0.45)); b.arm('left', 0.12 + 2.2 * u); b.arm('right', 0.12 + 2.2 * u); },
    talk(t, words) { let up = 0; for (const w of words) { const v = t - w.s; if (v > 0 && v < 0.6) up += 0.012 * jolt(v, 4, 0.5); } rig.position.y += up; },
  };
  return b;
}

// a crowd of small Bixes in colours that read well together (each gets a little accessory)
export const CROWD = [0x6c8ef5, 0x58c08a, 0xf08bb4, 0xe8d6a8, 0xa98bea, 0xe58a5c, 0x5bc6d8, 0xf09a5b, 0x8fd16a, 0xe76f6f, 0x9aa4ff, 0xffb070];
export const EXTRAS = [{ beanie: 0xd9342b }, {}, { bow: 0xd9342b }, { glasses: true }, {}, { beanie: 0x2f6fb0 }, {}, { glasses: true }, { bow: 0x6c3fb0 }, {}, { beanie: 0x1f9a55 }, {}];
export function crowd(n, parent, scale = 0.32) { return Array.from({ length: n }, (_, i) => buddy({ color: CROWD[i % CROWD.length], scale, ...EXTRAS[i % EXTRAS.length] }, parent)); }

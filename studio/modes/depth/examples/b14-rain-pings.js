// b14 · lots of little false alarms. Fits "Rain hits the glass and every drop looks like a tap."
// A shopfront at night in the rain. Streaks fall the whole shot; from the first cue, drops land on the shop window one after
// another on a schedule, and each landing throws a ring on the glass and ticks the PINGS badge. Bix waits under the canopy
// and flinches on the cue. Cue words: rain · tap (fallbacks: 20 %, 70 %). Change DROPS to change the rhythm.
const DROPS = [0, 0.18, 0.31, 0.52, 0.6, 0.77, 0.95, 1.04, 1.22, 1.35, 1.5, 1.58];   // seconds after the first cue

export default {
  build(k, shot) {
    const S = (shot.s = {}), { kit, THREE } = k;
    shot.set = k.rooms.street(shot.root, { sign: 'OPEN LATE' });
    shot.set.wordAt = shot.t0 + 0.1;
    S.tRain = shot.at('rain', 0.2); S.tTap = shot.at('tap', 0.7);
    const r = k.rng(14);
    S.streaks = Array.from({ length: 70 }, () => ({ m: kit.put(kit.sheet(0.008, 0.22, kit.lit(0.55, 0.62, 0.75, { transparent: true, opacity: 0.45 })), 0, 0, 0, shot.root), x: -2.4 + r() * 4.8, z: -2.4 + r() * 1.6, ph: r(), v: 3.2 + r() * 1.4 }));
    S.hits = DROPS.map((d, i) => ({ t: S.tRain + d, x: -1.7 + r() * 1.4, y: 0.75 + r() * 0.9, ring: kit.put(new THREE.Mesh(new THREE.RingGeometry(0.05, 0.065, 32), kit.lit(1.4, 1.6, 2.0, { transparent: true })), 0, 0, -2.6, shot.root) }));
    S.bix = k.buddy({ ...k.LOOK }, shot.root); S.bix.root.position.copy(shot.set.host);
    shot.badge = ['PINGS', (t) => S.hits.filter((h) => t >= h.t).length];
    S.hits.forEach((h, i) => { if (i % 3 === 0) k.sound(h.t, 'tick', -12); });
    k.punch(S.tTap, 0.4);
  },

  frame(k, t, shot) {
    const S = shot.s, b = S.bix;
    shot.set.frame(t);
    b.idle(t, 2.2); b.blink(t, [shot.t0 + 1.0]); b.hop(t - S.tTap, 0.12); b.arm('left', 0.12 + 0.6 * k.settle(t - S.tTap, 2.4, 0.5)); b.arm('right', 0.14);
    b.body.rotation.y = -0.35 + 0.15 * Math.sin(k.TAU * 0.25 * t);
    S.streaks.forEach((q) => { const f = (t * q.v / 3.2 + q.ph) % 1; q.m.position.set(q.x, 3.2 - f * 3.2, q.z); q.m.quaternion.copy(k.camera.quaternion); });
    S.hits.forEach((h) => { const u = (t - h.t) / 0.6; h.ring.visible = u > 0 && u < 1; if (!h.ring.visible) return; h.ring.position.set(h.x, 0.3 + h.y, -2.62); h.ring.scale.setScalar(1 + u * 4); h.ring.material.opacity = 0.9 * (1 - u); });
  },

  view: () => 'front',
};

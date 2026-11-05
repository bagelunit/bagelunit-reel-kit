// 01 · the shop. "This tiny bakery sells out every single morning."
// A bakery at night: the OPEN sign flips on the first beat, the neon BAKERY lights letter by letter on "bakery", and on
// "sells" a line of customers walks in through the lit door and gathers in front of Bix. The badge counts loaves sold.
export default {
  build(k, shot) {
    const S = (shot.s = {});
    shot.set = k.rooms.shop(shot.root, { wall: 'clay', neonWord: 'BAKERY' });
    shot.set.signAt = shot.t0 + 0.12;
    shot.set.wordAt = shot.at('bakery', 0.3);
    S.bix = k.buddy({ ...k.LOOK }, shot.root);
    S.bix.root.position.copy(shot.set.host); S.bix.root.rotation.y = -0.1;
    S.tSells = shot.at('sells', 0.45);
    S.tMorning = shot.at('morning', 0.85);
    const spots = [[-1.05, -2.2], [-0.55, -2.32], [-0.05, -2.2], [-1.3, -1.8], [-0.8, -1.88], [-0.3, -1.75], [-1.05, -1.38], [-0.55, -1.3], [-1.45, -1.05], [-0.95, -0.95]];
    S.walkers = k.crowd(spots.length, shot.root, 0.3).map((c, i) => ({ c, x: spots[i][0], z: spots[i][1], i, go: S.tSells - 0.35 + i * 0.12, dur: 0.85 }));
    S.door = new k.THREE.Vector2(shot.set.door.x, shot.set.door.z);
    S.bend = new k.THREE.Vector2(0.15, -2.62);
    shot.badge = ['LOAVES SOLD', (t) => Math.round(120 * k.ease.out((t - S.tSells) / 1.4))];
    k.sound(shot.set.wordAt, 'tick', -6);
    k.sound(S.tSells, 'pop', -6);
    k.punch(S.tMorning, 0.6);
  },

  frame(k, t, shot) {
    const S = shot.s, b = S.bix;
    shot.set.frame(t);
    b.idle(t, 0.7); b.talk(t, shot.words); b.blink(t, [shot.t0 + 0.9, shot.t0 + 2.6]);
    b.hop(t - S.tMorning, 0.16);
    b.point(t, shot.t0 + 0.25, 'left', 1.25);
    b.wave(t, S.tSells + 0.2, 'right');
    b.body.rotation.y = -0.2 * k.settle(t - shot.t0 - 0.3, 2, 0.6);
    const cam = k.camera.position;
    S.walkers.forEach((w) => {
      const c = w.c, on = t >= w.go; c.root.visible = on; if (!on) return;
      const u = k.clamp((t - w.go) / w.dur), s0 = u * 0.75 + k.ease.both(u) * 0.25;
      const p = curve(S, w, s0), p2 = curve(S, w, Math.min(1, s0 + 0.02));
      c.root.position.set(p.x, 0, p.y);
      const heading = Math.atan2(p2.x - p.x, p2.y - p.y), face = Math.atan2(cam.x - shot.root.position.x - p.x, cam.z - p.y);
      c.root.rotation.y = u < 1 ? heading : k.lerp(heading, face, k.ease.out((t - w.go - w.dur) / 0.25));
      if (u < 1) c.walk(t - w.go, w.i); else c.idle(t, w.i);
      c.hop(t - w.go - w.dur - 0.12, 0.22);
      c.root.scale.setScalar(c.scale * k.grow(t - w.go, 3, 0.5));
    });
  },

  view: () => 'wide',
};

function curve(S, w, u) {   // door → bend → the walker's spot (a quadratic path)
  const a = S.door, b = S.bend, q = 1 - u;
  return { x: q * q * a.x + 2 * q * u * b.x + u * u * w.x, y: q * q * a.y + 2 * q * u * b.y + u * u * w.z };
}

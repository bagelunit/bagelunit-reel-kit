// b08 · they come to you. Fits "Its only job is to get you customers." (any line about people arriving)
// A shop interior at night: the neon word lights letter by letter, the OPEN sign flips, and on "customers" a line of
// small Bixes walks in through the lit door, turns to the lens and hops. The badge counts them in. Cue word: customers.
export default {
  build(k, shot) {
    const S = (shot.s = {});
    shot.set = k.rooms.shop(shot.root, { wall: 'moss', neonWord: 'OPEN' });
    shot.set.signAt = shot.t0 + 0.12; shot.set.wordAt = shot.t0 + 0.3;
    S.tCome = shot.at('customers', 0.4);
    S.bix = k.buddy({ ...k.LOOK }, shot.root); S.bix.root.position.copy(shot.set.host); S.bix.root.rotation.y = -0.1;
    const spots = [[-1.05, -2.2], [-0.55, -2.32], [-0.05, -2.2], [-1.3, -1.8], [-0.8, -1.88], [-0.3, -1.75], [-1.05, -1.38], [-0.55, -1.3]];
    S.walkers = k.crowd(spots.length, shot.root, 0.3).map((c, i) => ({ c, x: spots[i][0], z: spots[i][1], i, go: S.tCome - 0.3 + i * 0.16, dur: 0.85 }));
    shot.badge = ['CUSTOMERS', (t) => S.walkers.filter((w) => t >= w.go + w.dur).length];
    k.sound(S.tCome, 'pop', -6);
  },

  frame(k, t, shot) {
    const S = shot.s, b = S.bix, D = shot.set.door;
    shot.set.frame(t);
    b.idle(t, 0.7); b.talk(t, shot.words); b.point(t, shot.t0 + 0.3, 'left'); b.wave(t, S.tCome + 0.4); b.blink(t, [shot.t0 + 1.1]);
    const cx = k.camera.position.x - shot.root.position.x, cz = k.camera.position.z;
    S.walkers.forEach((w) => {
      const c = w.c, on = t >= w.go; c.root.visible = on; if (!on) return;
      const u = k.clamp((t - w.go) / w.dur), s0 = u * 0.75 + k.ease.both(u) * 0.25, q = 1 - s0;
      const x = q * q * D.x + 2 * q * s0 * 0.15 + s0 * s0 * w.x, z = q * q * D.z + 2 * q * s0 * -2.62 + s0 * s0 * w.z;
      c.root.position.set(x, 0, z);
      c.root.rotation.y = u < 1 ? Math.atan2(w.x - D.x, w.z - D.z) : Math.atan2(cx - x, cz - z);
      if (u < 1) c.walk(t - w.go, w.i); else c.idle(t, w.i);
      c.hop(t - w.go - w.dur - 0.12, 0.22); c.root.scale.setScalar(c.scale * k.grow(t - w.go, 3, 0.5));
    });
  },

  view: () => 'wide',
};

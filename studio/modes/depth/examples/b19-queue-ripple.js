// b19 · a slowdown that travels backwards. Fits "One car brakes, and the jam ripples back down the road."
// A line of toy cars on the main street of the table town, all rolling. On the first cue the front car brakes (red); the
// red front then travels BACK along the queue car by car, each one stopping, and a ring ripples on the road at the front.
// The QUEUE badge counts stopped cars. Cue words: brakes · back (fallbacks: 25 %, 55 %).
export default {
  build(k, shot) {
    const S = (shot.s = {}), { kit, THREE } = k, set = (shot.set = k.rooms.mapTable(shot.root, { wall: 'moss' }));
    S.tBrake = shot.at('brakes', 0.25); S.tBack = shot.at('back', 0.55);
    const TOP = 0.86, N = 9;
    S.cars = Array.from({ length: N }, (_, i) => {
      const g = kit.group(shot.root), body = kit.paint(0x3f6390, { map: null, rough: 0.4 }); g.scale.setScalar(1.6);
      kit.put(kit.box(0.12, 0.05, 0.07, body, 0.015), 0, 0.04, 0, g); kit.put(kit.box(0.06, 0.035, 0.06, kit.paint(0xeaf2f6, { map: null, rough: 0.2 }), 0.01), -0.01, 0.08, 0, g);
      const tail = kit.put(kit.box(0.01, 0.02, 0.06, kit.lit(0.5, 0.1, 0.08), 0), -0.065, 0.045, 0, g);
      return { g, body, tail, x0: 1.05 - i * 0.24 };
    });
    S.ring = kit.put(new THREE.Mesh(new THREE.RingGeometry(0.09, 0.11, 40), kit.lit(1.8, 0.4, 0.3, { transparent: true })), 0, TOP + 0.006, -0.2, shot.root); S.ring.rotation.x = -Math.PI / 2;
    S.TOP = TOP; S.blue = new THREE.Color(0x3f6390); S.red = new THREE.Color(0xd9342b);
    S.bix = k.buddy({ ...k.LOOK, scale: 0.34 }, shot.root); S.bix.root.position.set(-1.15, TOP, 0.32); S.bix.root.rotation.y = 0.6; S.bix.shadow.visible = false;
    shot.badge = ['QUEUE', (t) => S.cars.filter((c, i) => t >= stopT(S, i)).length];
    k.sound(S.tBrake, 'thud', -8); k.sound(S.tBack, 'swoosh', -10);
  },

  frame(k, t, shot) {
    const S = shot.s, b = S.bix;
    shot.set.frame(t, k.camera);
    b.idle(t, 1.9); b.blink(t, [shot.t0 + 1.1]); b.point(t, S.tBrake, 'right', 1.0);
    S.cars.forEach((c, i) => {
      const ts = stopT(S, i), roll = t < ts ? t - shot.t0 : ts - shot.t0 + 0.12 * k.ease.out(k.clamp((t - ts) / 0.3));   // distance rolled, eased to a stop
      c.g.position.set(c.x0 + 0.08 * roll, S.TOP + (t < ts ? 0.004 * Math.abs(Math.sin(k.TAU * 3 * t + i)) : 0), -0.2);
      const r = k.clamp((t - ts) / 0.15); c.body.color.copy(S.blue).lerp(S.red, r); c.tail.material.color.setRGB(0.5 + 2.4 * r, 0.1 + 0.3 * r, 0.08);
    });
    const front = Math.min(S.cars.length - 1, Math.max(0, Math.floor((t - S.tBack) / 0.18) + 1)), fu = ((t - S.tBack) % 0.18) / 0.18;
    S.ring.visible = t > S.tBrake; S.ring.position.x = S.cars[t < S.tBack ? 0 : front].g.position.x; S.ring.scale.setScalar(1 + 2.5 * (t < S.tBack ? ((t - S.tBrake) % 0.5) / 0.5 : fu)); S.ring.material.opacity = 1 - (t < S.tBack ? ((t - S.tBrake) % 0.5) / 0.5 : fu);
  },

  view() { return { from: [-0.15, 5.3, 1.75], to: [0.12, 5.15, 1.6], look0: [0, 0.86, -0.55], look1: [0, 0.86, -0.5], fov: 44, ap: 0.0008 }; },   // high, looking down: the streets read (the low 'table' view hides them behind the front row)
};

const stopT = (S, i) => (i === 0 ? S.tBrake : S.tBack + i * 0.18);

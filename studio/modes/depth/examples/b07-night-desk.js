// b07 · it never stops. Fits "all running 24/7 on your computer."
// Bix types at a desk by a big window; outside, days race past (sun up, moon up, clouds drift) while the 24/7 neon on the
// desk lights on "24/7" and the lamp light shifts from cool night to warm day. Cue word: 24/7 (said "twenty-four seven").
export default {
  build(k, shot) {
    const S = (shot.s = {});
    shot.set = k.rooms.desk(shot.root, { wall: 'denim', sky: 'cycle', neonWord: '24/7', laptopFaces: 'host' });
    shot.set.signAt = shot.at('24/7', 0.35); shot.set.cycleFrom = shot.t0;
    S.bix = k.buddy({ ...k.LOOK }, shot.root);
    S.bix.root.position.set(0.12, 0.3, -1.9); S.bix.root.rotation.y = 0; S.bix.shadow.visible = false;
    k.sound(shot.set.signAt, 'tick', -6);
  },

  frame(k, t, shot) {
    const b = shot.s.bix;
    shot.set.frame(t, true);
    b.idle(t, 5.0); b.type(t); b.body.rotation.y = 0.2; b.blink(t, [shot.t0 + 1.0]);
  },

  view: () => ({ from: [0.3, 1.45, 2.2], to: [0.12, 1.42, 1.8], look0: [0.0, 1.5, -2.6], look1: [0.0, 1.48, -2.6], fov: 40, ap: 0.0022, focus: [0.1, 1.05, -1.9] }),
};

// b05 · the pipeline as plumbing. Fits "It manages your whole sales pipeline."
// Three glass tanks on the wall joined by glass pipes; on "manages" the valve wheel turns and little block tokens start
// flowing down from NEW to TALKING to DONE while the liquid levels shift. Bix works a lever at the side. Cue: manages.
export default {
  build(k, shot) {
    const S = (shot.s = {});
    shot.set = k.rooms.tanks(shot.root, { wall: 'denim', names: ['NEW', 'TALKING', 'BOOKED'] });
    shot.set.flowAt = shot.at('manages', 0.15);
    S.bix = k.buddy({ ...k.LOOK, scale: 0.82 }, shot.root);
    S.bix.root.position.set(0.82, 0, -1.9); S.bix.root.rotation.y = -0.35;
    k.sound(shot.set.flowAt, 'swoosh', -8);
  },

  frame(k, t, shot) {
    const b = shot.s.bix;
    shot.set.frame(t);
    b.idle(t, 3.1); b.talk(t, shot.words); b.blink(t, [shot.t0 + 0.9]);
    b.arms[0].rotation.set(-0.9, 0, -0.9 + 0.3 * Math.sin(k.TAU * 1.5 * t)); b.arm('right', 0.15);
  },

  view: () => 'wall',
};

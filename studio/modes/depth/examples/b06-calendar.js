// b06 · meetings on the week. Fits "and works toward booking meetings."
// A week planner on the wall; on "booking" two meeting cards pop into their slots (each stamped PROPOSED: it suggests,
// you confirm), a pencil hovers over each in turn, and Bix gestures at the board. Cue word: booking.
export default {
  build(k, shot) {
    const S = (shot.s = {}), { kit } = k;
    shot.set = k.rooms.calendar(shot.root, { wall: 'butter' });
    S.tBook = shot.at('booking', 0.4);
    shot.set.add(1, 1, '10:00', 'Bakery', '#ffe39a', S.tBook - 0.15, 'PROPOSED');
    shot.set.add(3, 5, '14:00', 'Cafe Luna', '#c9ecd2', S.tBook + 0.17, 'PROPOSED');
    S.pen = kit.group(shot.root);
    kit.put(kit.tube(0.022, 0.022, 0.34, kit.paint(0xf2c14e), 12), 0, 0.17, 0, S.pen);
    kit.put(new k.THREE.Mesh(new k.THREE.ConeGeometry(0.022, 0.06, 12), kit.paint(0xe9d3a8)), 0, -0.03, 0, S.pen).rotation.x = Math.PI;
    S.bix = k.buddy({ ...k.LOOK }, shot.root); S.bix.root.position.set(0.62, 0, -2.25); S.bix.root.rotation.y = -0.4;
    shot.set.focusPts = [[-0.48, 1.86], [0.2, 1.33]];
    k.sound(S.tBook - 0.15, 'pop', -6); k.sound(S.tBook + 0.17, 'pop', -6);
  },

  frame(k, t, shot) {
    const S = shot.s, b = S.bix;
    shot.set.frame(t);
    b.idle(t, 4.2); b.blink(t, [shot.t0 + 1.4]);
    b.arms[0].rotation.set(-0.4, 0, -1.9 * k.settle(t - shot.t0, 2.4, 0.5) + 0.15 * Math.sin(k.TAU * 2 * t)); b.arm('right', 0.15);
    const [px, py] = shot.set.focusPts[t < S.tBook + 0.2 ? 0 : 1];
    S.pen.position.set(px + 0.24 + 0.02 * Math.sin(k.TAU * 3 * t), py - 0.1 + 0.03 * Math.cos(k.TAU * 3 * t), -3.05); S.pen.rotation.set(0, 0, 0.6);
  },

  view: () => 'wall',
};

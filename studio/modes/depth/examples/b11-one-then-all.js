// b11 · one point, then every point. Fits "It checks one spot. Then every spot, all at once, many times a second."
// A light board stands on the workbench: a grid of bulbs. The camera starts close on one bulb, which lights on the first
// cue; it pulls back as the rest light in a ripple from that bulb outward on the second cue; a scan bar sweeps the board
// on the third. Cue words: one · every · second (fallbacks: 22 %, 50 %, 78 %).
export default {
  build(k, shot) {
    const S = (shot.s = {}), { kit } = k, set = (shot.set = k.rooms.bench(shot.root, { wall: 'clay' }));
    S.tOne = shot.at('one', 0.22); S.tAll = shot.at('every', 0.5); S.tScan = shot.at('second', 0.78);
    const C = set.centre, board = (S.board = kit.group(shot.root, C.x, C.y, C.z - 0.15));
    kit.put(kit.box(1.36, 1.0, 0.06, kit.paint(0x1f2226, { rough: 0.5 }), 0.03), 0, 0.55, 0, board);
    kit.put(kit.box(1.44, 0.06, 0.2, kit.mat.woodDark, 0.02), 0, 0.03, 0.02, board);
    S.bulbs = [];
    const NX = 9, NY = 6, I0 = 4, J0 = 2;
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const x = -0.56 + i * 0.14, y = 0.2 + j * 0.14, m = kit.put(kit.ball(0.035, kit.lit(0.25, 0.22, 0.2), 14), x, y, 0.045, board);
      kit.put(kit.tube(0.04, 0.04, 0.02, kit.mat.brass, 16), x, y, 0.035, board).rotation.x = Math.PI / 2;
      S.bulbs.push({ m, d: Math.hypot(i - I0, j - J0), first: i === I0 && j === J0 });
    }
    S.focal = [C.x - 0.56 + I0 * 0.14, C.y + 0.2 + J0 * 0.14, C.z - 0.1];
    S.bar = kit.put(kit.sheet(0.05, 1.0, kit.lit(1.2, 1.0, 0.6, { transparent: true, add: true, opacity: 0.7 })), 0, 0.55, 0.075, board);
    S.bix = k.buddy({ ...k.LOOK, scale: 0.32 }, shot.root); S.bix.root.position.copy(set.peek); S.bix.root.rotation.y = set.peekYaw; S.bix.shadow.visible = false;
    k.sound(S.tOne, 'tick', -4); k.sound(S.tAll, 'shimmer', -8); k.sound(S.tScan, 'swoosh', -10);
  },

  frame(k, t, shot) {
    const S = shot.s, b = S.bix;
    shot.set.frame(t);
    b.idle(t, 2.4); b.blink(t, [shot.t0 + 1.1]); b.cheer(t, S.tAll + 0.3);
    const scanX = -0.68 + 1.36 * k.clamp((t - S.tScan) / 0.55);
    S.bar.visible = t > S.tScan && t < S.tScan + 0.55; S.bar.position.x = scanX;
    S.bulbs.forEach((q) => {
      const on = q.first ? t > S.tOne : t > S.tAll + q.d * 0.06, age = on ? t - (q.first ? S.tOne : S.tAll + q.d * 0.06) : 0;
      let v = on ? 0.9 + 0.7 * Math.exp(-age * 3) : 0.22;
      if (Math.abs(q.m.position.x - scanX) < 0.07 && S.bar.visible) v += 0.7;
      q.m.material.color.setRGB(1.25 * v, 0.85 * v, 0.4 * v); q.m.scale.setScalar(on ? 1 + 0.25 * Math.exp(-age * 4) : 1);
    });
  },

  view(k, t, shot) {
    const S = shot.s, [fx, fy, fz] = S.focal, out = k.ease.both(k.clamp((t - S.tAll + 0.1) / 1.1));
    const from = [fx + 0.05, fy + 0.02, fz + 0.5], to = [0.15, fy + 0.25, fz + 2.6];
    return { pos: from.map((v, i) => k.lerp(v, to[i], out)), look: [k.lerp(fx, 0, out), k.lerp(fy, fy + 0.04, out), fz], fov: 40, ap: k.lerp(0.004, 0.002, out), focus: [fx, fy, fz] };
  },
};

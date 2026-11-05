// b16 · break the whole into numbered pieces. Fits "It splits your route into small pieces and scores each one."
// A little town on a table. A route ribbon runs along the main street; on the first cue it cracks into eight tiles that
// lift off in a wave; numbers pop onto them; on the second cue each tile takes its score colour (green / amber / red) and
// they land back in place. Bix stands at the end of the table and points. Cue words: pieces · each (fallbacks: 30 %, 65 %).
const SCORES = [0, 0, 1, 2, 0, 1, 0, 0];   // 0 fine · 1 slow · 2 jammed

export default {
  build(k, shot) {
    const S = (shot.s = {}), { kit, THREE } = k, set = (shot.set = k.rooms.mapTable(shot.root, { wall: 'butter' }));
    S.tCrack = shot.at('pieces', 0.3); S.tScore = shot.at('each', 0.65);
    const TOP = 0.86, Z = -0.2, N = 8, L = 2.4 / N;
    S.tiles = Array.from({ length: N }, (_, i) => {
      const g = kit.group(shot.root, -1.2 + L / 2 + i * L, TOP + 0.012, Z);
      const m = kit.put(kit.box(L - 0.01, 0.022, 0.12, kit.paint(0xd9653b, { map: null, rough: 0.45 }), 0.006), 0, 0, 0, g);
      const num = kit.put(kit.sheet(0.11, 0.11, new THREE.MeshBasicMaterial({ map: kit.label(String(i + 1), { w: 128, h: 128, size: 84, radius: 64, bw: 6 }), transparent: true })), 0, 0.09, 0, g);
      return { g, m, num, x: g.position.x };
    });
    S.cols = [new THREE.Color(0x58c08a), new THREE.Color(0xe3a21a), new THREE.Color(0xd9342b)]; S.base = new THREE.Color(0xd9653b);
    S.bix = k.buddy({ ...k.LOOK, scale: 0.36 }, shot.root); S.bix.root.position.set(1.15, TOP, 0.25); S.bix.root.rotation.y = -0.9; S.bix.shadow.visible = false;
    k.sound(S.tCrack, 'pop', -6); k.sound(S.tScore, 'tick', -6); k.punch(S.tScore + 0.2, 0.4);
  },

  frame(k, t, shot) {
    const S = shot.s, b = S.bix;
    shot.set.frame(t, k.camera);
    b.idle(t, 2.9); b.blink(t, [shot.t0 + 1.2]); b.point(t, S.tCrack - 0.2, 'left', 1.2); b.hop(t - S.tScore - 0.3, 0.08);
    const draw = k.ease.out(k.clamp((t - shot.t0) / 0.5));
    S.tiles.forEach((q, i) => {
      const lift = k.settle(t - S.tCrack - i * 0.07, 2.4, 0.55), land = k.settle(t - S.tScore - 0.35 - i * 0.05, 2.6, 0.5);
      const up = lift * (1 - land);
      q.g.visible = (i + 0.5) / S.tiles.length < draw;
      q.g.position.set(q.x + (lift > 0 ? (i - 3.5) * 0.02 * (1 - land) : 0), 0.872 + up * 0.32, -0.2);
      q.g.rotation.set(0.25 * up * Math.sin(i), 0, 0.15 * up * Math.cos(i * 1.7));
      const sc = k.clamp((t - S.tScore - i * 0.05) / 0.25); q.m.material.color.copy(S.base).lerp(S.cols[SCORES[i]], sc);
      q.num.visible = t > S.tCrack + 0.2 + i * 0.07; q.num.scale.setScalar(k.grow(t - S.tCrack - 0.2 - i * 0.07, 3.5, 0.5)); q.num.quaternion.copy(k.camera.quaternion);
    });
  },

  view() { return { from: [-0.15, 5.3, 1.75], to: [0.12, 5.15, 1.6], look0: [0, 0.86, -0.55], look1: [0, 0.86, -0.5], fov: 44, ap: 0.0008 }; },   // high, looking down: the streets read (the low 'table' view hides them behind the front row)
};

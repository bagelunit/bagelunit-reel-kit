// b21 · the pieces add up. Fits "Add every piece together and you get the whole trip: 34 minutes."
// Six numbered blocks lie across the workbench. On the first cue they lift one by one, fly on arcs and stack into a tower
// (each landing squashes it); on the second the total card pops on top and the badge rolls to the sum. Cue words: together ·
// minutes (fallbacks: 25 %, 75 %). Put your own numbers in PIECES; the badge shows their sum.
const PIECES = [4, 7, 3, 9, 5, 6];

export default {
  build(k, shot) {
    const S = (shot.s = {}), { kit, THREE } = k, set = (shot.set = k.rooms.bench(shot.root, { wall: 'butter' }));
    S.tGo = shot.at('together', 0.25); S.tSum = shot.at('minutes', 0.75);
    const C = set.centre, cols = [0xd9653b, 0x2f8f83, 0xe3a21a, 0x6b5bb8, 0x3f6390, 0xc2557a], BH = 0.085;
    S.blocks = PIECES.map((n, i) => {
      const tex = kit.label(String(n), { w: 256, h: 256, size: 150, radius: 30, bg: '#d9cfbd', bw: 10 });
      const mats = [0, 1, 2, 3, 4, 5].map((f) => (f === 4 ? new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }) : kit.paint(cols[i], { map: null, rough: 0.5 })));
      const m = kit.put(new THREE.Mesh(new THREE.BoxGeometry(0.16, BH, 0.16), mats), 0, 0, 0, shot.root); m.castShadow = true;
      return { m, from: new THREE.Vector3(C.x - 0.75 + i * 0.3, C.y + BH / 2, C.z + 0.28), to: new THREE.Vector3(C.x + 0.1, C.y + BH / 2 + i * BH, C.z - 0.15), t0: S.tGo + i * 0.16 };
    });
    S.total = kit.put(kit.sheet(0.42, 0.2, new THREE.MeshBasicMaterial({ map: kit.label(`${PIECES.reduce((a, b) => a + b, 0)} MIN`, { w: 512, h: 240, bg: '#D9653B', fg: '#FFF3DF', size: 120 }), transparent: true })), C.x - 0.3, C.y + 0.42, C.z - 0.1, shot.root);
    S.bix = k.buddy({ ...k.LOOK, scale: 0.32 }, shot.root); S.bix.root.position.copy(set.peek).add(new THREE.Vector3(0.12, 0, 0.35)); S.bix.root.rotation.y = set.peekYaw; S.bix.shadow.visible = false;
    shot.badge = ['TOTAL', (t) => S.blocks.reduce((a, b, i) => a + (t >= b.t0 + 0.55 ? PIECES[i] : 0), 0)];
    S.blocks.forEach((b, i) => k.sound(b.t0 + 0.55, 'tick', -10 - i)); k.sound(S.tSum, 'stamp', -6); k.punch(S.tSum, 0.6);
  },

  frame(k, t, shot) {
    const S = shot.s, b = S.bix;
    shot.set.frame(t);
    b.idle(t, 3.1); b.blink(t, [shot.t0 + 1.0]); b.cheer(t, S.tSum);
    S.blocks.forEach((q) => {
      const u = k.clamp((t - q.t0) / 0.55), e = k.ease.both(u);
      q.m.position.lerpVectors(q.from, q.to, e); q.m.position.y += 0.35 * Math.sin(Math.PI * u);
      q.m.rotation.set(0, (1 - e) * 0.8, 0);
      const land = t - q.t0 - 0.55, sq = land > 0 ? 0.18 * k.jolt(land, 4, 0.45) : 0; q.m.scale.set(1 + sq, 1 - sq, 1 + sq);
    });
    S.total.visible = t > S.tSum; S.total.scale.setScalar(k.grow(t - S.tSum, 3, 0.5)); S.total.quaternion.copy(k.camera.quaternion);
  },

  view: () => 'top',
};

// b13 · the dip gives it away. Fits "Where you touch, the numbers dip, and it locks onto that exact spot."
// A field of short bars on the workbench, gently breathing like live readings. On the first cue a crater opens where Bix
// points (the bars there sink, a ring around it rises); on the second four lock-on brackets snap in from wide to tight
// around the crater and a FOUND tag pops. Cue words: dip · locks (fallbacks: 35 %, 65 %).
export default {
  build(k, shot) {
    const S = (shot.s = {}), { kit, THREE } = k, set = (shot.set = k.rooms.bench(shot.root, { wall: 'sage' }));
    S.tDip = shot.at('dip', 0.35); S.tLock = shot.at('locks', 0.65);
    const C = set.centre; S.C = C;
    kit.put(kit.box(1.2, 0.03, 0.78, kit.paint(0x26292e, { rough: 0.5 }), 0.01), C.x, C.y + 0.015, C.z, shot.root);
    S.bars = []; S.target = new THREE.Vector2(0.18, 0.06);
    for (let j = 0; j < 7; j++) for (let i = 0; i < 11; i++) {
      const x = -0.5 + i * 0.1, z = -0.3 + j * 0.1, m = kit.put(kit.box(0.07, 1, 0.07, kit.paint(0x3a8a98, { map: null, rough: 0.85 }), 0.008), C.x + x, C.y, C.z + z, shot.root);
      S.bars.push({ m, x, z, d: Math.hypot(x - S.target.x, z - S.target.y), seed: i * 7 + j * 3 });
    }
    S.brackets = [0, 1, 2, 3].map((q) => {
      const g = kit.group(shot.root), w = kit.lit(2.6, 1.3, 0.5);
      kit.put(kit.box(0.09, 0.012, 0.016, w, 0), 0.045, 0, 0, g); kit.put(kit.box(0.016, 0.012, 0.09, w, 0), 0, 0, 0.045, g);
      return g;
    });
    S.tag = kit.put(kit.sheet(0.34, 0.11, new THREE.MeshBasicMaterial({ map: kit.label('FOUND', { w: 512, h: 160, bg: '#D9653B', fg: '#FFF3DF', border: '#17161A', size: 92 }), transparent: true })), 0, 0, 0, shot.root);
    S.bix = k.buddy({ ...k.LOOK, scale: 0.32 }, shot.root); S.bix.root.position.copy(set.peek); S.bix.root.rotation.y = set.peekYaw; S.bix.shadow.visible = false;
    k.sound(S.tDip, 'pop', -6); k.sound(S.tLock, 'stamp', -6); k.punch(S.tLock + 0.15, 0.6);
  },

  frame(k, t, shot) {
    const S = shot.s, b = S.bix, C = S.C;
    shot.set.frame(t);
    b.idle(t, 4.2); b.blink(t, [shot.t0 + 0.8]); b.point(t, S.tDip - 0.3, 'left', 1.15); b.hop(t - S.tLock - 0.2, 0.1);
    const dip = k.settle(t - S.tDip, 2.2, 0.6);
    S.bars.forEach((q) => {
      const live = 0.12 + 0.05 * Math.sin(k.TAU * 0.6 * t + q.seed) + 0.03 * Math.sin(k.TAU * 1.3 * t + q.seed * 2);
      const crater = Math.exp(-((q.d / 0.12) ** 2)), rim = Math.exp(-(((q.d - 0.2) / 0.06) ** 2));
      const h = Math.max(0.02, live * (1 - 0.85 * crater * dip) + 0.1 * rim * dip);
      q.m.scale.y = h; q.m.position.y = C.y + 0.03 + h / 2;
      const hot = crater * dip; q.m.material.color.setRGB(0.1 + 0.6 * hot, 0.26 - 0.08 * hot, 0.3 - 0.22 * hot);   /* mid tones: light bars bloom to white under the bench lamp */
    });
    const lock = k.settle(t - S.tLock, 2.6, 0.55), half = k.lerp(0.42, 0.13, lock);
    S.brackets.forEach((g, q) => { const sx = q === 0 || q === 3 ? -1 : 1, sz = q < 2 ? -1 : 1; g.visible = t > S.tLock - 0.05; g.position.set(C.x + S.target.x + sx * half, C.y + 0.12, C.z + S.target.y + sz * half); g.scale.set(-sx, 1, -sz); });   /* mirror the L so both arms point inward */
    const tg = k.grow(t - S.tLock - 0.25, 3, 0.5); S.tag.visible = t > S.tLock + 0.25; S.tag.scale.setScalar(tg);
    S.tag.position.set(C.x + S.target.x, C.y + 0.42, C.z + S.target.y); S.tag.quaternion.copy(k.camera.quaternion);
  },

  view(k, t, shot) { const C = shot.set.centre; return { from: [0.35, C.y + 1.35, 1.1], to: [0.25, C.y + 1.25, 0.95], look0: [0.1, C.y + 0.08, C.z], look1: [0.12, C.y + 0.08, C.z], fov: 42, ap: 0.0018, focus: [0.18, C.y + 0.1, C.z + 0.06] }; },
};

// b23 · sealed and sent. Fits "Your note gets locked before it leaves, then it flies to the cloud."
// A desk by the window. A note rises out of the laptop and folds; on the first cue a small padlock drops onto it and its
// shackle snaps shut; on the second the sealed note flies an arc out of the window toward a cloud, leaving a short trail.
// Bix sits behind the desk and watches it go. Cue words: locked · flies (fallbacks: 35 %, 65 %).
export default {
  build(k, shot) {
    const S = (shot.s = {}), { kit, THREE } = k, set = (shot.set = k.rooms.desk(shot.root, { wall: 'clay', sky: 'day', laptopFaces: 'host' }));
    set.dawn = null;
    S.tLock = shot.at('locked', 0.35); S.tFly = shot.at('flies', 0.65);
    S.note = kit.group(shot.root);
    kit.put(kit.box(0.26, 0.18, 0.012, new THREE.MeshStandardMaterial({ map: kit.card({ w: 520, h: 360, title: 'NOTE', lines: ['meet at 6'], titleSize: 60, lineSize: 64 }), roughness: 0.8 }), 0.004), 0, 0, 0, S.note);
    S.lock = kit.group(S.note, 0, 0.0, 0.03);
    kit.put(kit.box(0.08, 0.065, 0.03, kit.mat.brass, 0.01), 0, 0, 0, S.lock);
    S.shackle = kit.put(new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.007, 8, 20, Math.PI), kit.mat.steel), 0, 0.05, 0, S.lock);
    S.trail = Array.from({ length: 8 }, () => kit.put(kit.ball(0.01, kit.lit(2.2, 1.8, 1.2, { transparent: true }), 8), 0, 0, 0, shot.root));
    S.cloud = kit.group(shot.root, 0.55, 2.15, -3.05);
    [[0, 0, 0.16], [0.17, 0.03, 0.13], [-0.17, -0.02, 0.12], [0.06, 0.12, 0.12]].forEach(([x, y, r]) => kit.put(kit.ball(r, kit.paint(0xffffff, { map: null, rough: 0.9 }), 18), x, y, 0, S.cloud));
    S.bix = k.buddy({ ...k.LOOK, scale: 0.85 }, shot.root); S.bix.root.position.copy(set.host); S.bix.root.rotation.y = set.hostYaw; S.bix.shadow.visible = false;
    S.path = (u) => new THREE.Vector3(k.lerp(-0.05, 0.55, u), k.lerp(1.35, 2.15, u) + 0.5 * Math.sin(Math.PI * u), k.lerp(0.15, -3.0, u));
    k.sound(S.tLock, 'click', -2); k.sound(S.tFly, 'swoosh', -8); k.punch(S.tLock + 0.05, 0.4);
  },

  frame(k, t, shot) {
    const S = shot.s, b = S.bix;
    shot.set.frame(t, false);
    b.idle(t, 0.5); b.blink(t, [shot.t0 + 1.0]); b.type(t); if (t > S.tFly) b.cheer(t, S.tFly + 0.2);
    const rise = k.settle(t - shot.t0 - 0.2, 2.2, 0.6), fold = k.ease.both(k.clamp((t - S.tLock + 0.5) / 0.35)), u = k.ease.in(k.clamp((t - S.tFly) / 1.0));
    const p = u > 0 ? S.path(u) : new k.THREE.Vector3(-0.05, 1.05 + 0.3 * rise, 0.15);
    S.note.position.copy(p); S.note.rotation.set(-0.2 - 0.5 * u, 0.4 * Math.sin(k.TAU * 0.3 * t) + 1.5 * u, 0.1 * u);
    S.note.scale.set(1.9 * (1 - 0.35 * fold - 0.5 * u), 1.9 * (1 - 0.5 * fold - 0.5 * u), 1.9);
    const drop = k.settle(t - S.tLock + 0.15, 2.6, 0.5); S.lock.visible = t > S.tLock - 0.15; S.lock.position.y = 0.18 * (1 - drop);
    S.shackle.position.y = 0.05 - 0.02 * k.ease.out(k.clamp((t - S.tLock) / 0.1));
    S.trail.forEach((m, i) => { const v = u - (i + 1) * 0.04; m.visible = u > 0 && v > 0; if (m.visible) { m.position.copy(S.path(v)); m.material.opacity = 0.8 * (1 - i / 8); } });
    S.cloud.scale.setScalar(1 + 0.12 * k.jolt(t - S.tFly - 1.0, 3, 0.5)); S.cloud.position.x = 0.55 + 0.04 * Math.sin(k.TAU * 0.2 * t);
  },

  view: () => 'wide',
};

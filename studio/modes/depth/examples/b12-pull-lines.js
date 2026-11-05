// b12 · something near pulls the little pieces up. Fits "As it gets close, it pulls the charge up toward it."
// A tray of small tokens on the workbench. A red horseshoe magnet lowers from above; on the first cue curved field lines
// draw from every token up to the magnet; on the second the tokens lift and ride the lines up to it. A badge counts the gap
// down in millimetres as it lowers. Cue words: close · pulls (fallbacks: 30 %, 60 %).
export default {
  build(k, shot) {
    const S = (shot.s = {}), { kit, THREE } = k, set = (shot.set = k.rooms.bench(shot.root, { wall: 'oat' }));
    S.tLines = shot.at('close', 0.3); S.tPull = shot.at('pulls', 0.6);
    const C = set.centre;
    kit.put(kit.box(0.9, 0.04, 0.6, kit.paint(0x6e4a2e), 0.02), C.x, C.y + 0.02, C.z, shot.root);
    S.magnet = kit.group(shot.root);
    const red = kit.paint(0xc8302a, { map: null, rough: 0.45 }), steel = kit.mat.steel;
    kit.put(new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.045, 14, 32, Math.PI), red), 0, 0, 0, S.magnet).castShadow = true;
    [-0.11, 0.11].forEach((x) => { kit.put(kit.box(0.09, 0.14, 0.09, red, 0.01), x, -0.07, 0, S.magnet); kit.put(kit.box(0.09, 0.05, 0.09, steel, 0.01), x, -0.165, 0, S.magnet); });
    kit.put(kit.box(0.01, 1.2, 0.01, kit.mat.ink, 0), 0, 0.75, 0, S.magnet);   // the string it hangs from (the tips point down)
    S.end = new THREE.Vector3(C.x, C.y + 0.62, C.z);                          // where the magnet stops
    S.tokens = []; S.lines = [];
    const cols = [0xd9653b, 0xe3a21a, 0x2f8f83, 0x6b5bb8];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) {
      const p = new THREE.Vector3(C.x - 0.3 + i * 0.2, C.y + 0.07, C.z - 0.18 + j * 0.18);
      const m = kit.put(kit.box(0.06, 0.04, 0.06, kit.paint(cols[(i + j) % 4], { map: null, rough: 0.5 }), 0.01), p.x, p.y, p.z, shot.root);
      const mid = p.clone().lerp(S.end, 0.5).add(new THREE.Vector3((p.x - C.x) * 0.9, 0.05, (p.z - C.z) * 0.9));
      const curve = new THREE.QuadraticBezierCurve3(p, mid, S.end.clone().add(new THREE.Vector3((p.x - C.x) * 0.25, -0.12, 0)));
      const geo = new THREE.TubeGeometry(curve, 40, 0.004, 6, false), line = kit.put(new THREE.Mesh(geo, kit.lit(1.6, 1.0, 0.45, { transparent: true, opacity: 0.85 })), 0, 0, 0, shot.root);
      S.tokens.push({ m, p, curve, d: (i + j) * 0.05 }); S.lines.push({ line, n: geo.index.count });
    }
    S.bix = k.buddy({ ...k.LOOK, scale: 0.32 }, shot.root); S.bix.root.position.copy(set.peek); S.bix.root.rotation.y = set.peekYaw; S.bix.shadow.visible = false;
    shot.badge = ['GAP mm', (t) => Math.max(0, Math.round(40 * (1 - k.ease.out(k.clamp((t - shot.t0) / Math.max(0.5, S.tPull - shot.t0))))))];
    k.sound(S.tLines, 'shimmer', -10); k.sound(S.tPull + 0.5, 'click', -6);
  },

  frame(k, t, shot) {
    const S = shot.s, b = S.bix;
    shot.set.frame(t);
    b.idle(t, 0.9); b.blink(t, [shot.t0 + 1.4]); b.point(t, shot.t0 + 0.3, 'left', 1.0); b.hop(t - S.tPull - 0.5, 0.08);
    const down = k.ease.out(k.clamp((t - shot.t0) / Math.max(0.5, S.tPull - shot.t0)));
    S.magnet.position.set(S.end.x, S.end.y + 0.55 * (1 - down) + 0.01 * Math.sin(k.TAU * 0.8 * t), S.end.z);
    S.lines.forEach((L, i) => { const u = k.ease.out(k.clamp((t - S.tLines - S.tokens[i].d) / 0.45)); L.line.visible = u > 0; L.line.geometry.setDrawRange(0, Math.floor(L.n * u / 6) * 6); });
    S.tokens.forEach((q) => { const u = k.ease.in(k.clamp((t - S.tPull - q.d) / 0.55)); q.m.position.copy(u > 0 ? q.curve.getPointAt(u) : q.p); q.m.rotation.set(u * 2, u * 3, 0); });
  },

  view: () => 'top',
};

// b20 · the town becomes a network. Fits "Behind the scenes it's one big network, passing messages along."
// The table town dims on the first cue; a glowing node lifts off every block and lines draw between neighbours, spreading
// out from the first node; from the second cue bright messages hop along the lines, one link after another. Bix stands at the
// table's edge and points. Cue words: network · messages (fallbacks: 25 %, 60 %).
export default {
  build(k, shot) {
    const S = (shot.s = {}), { kit, THREE } = k, set = (shot.set = k.rooms.mapTable(shot.root, { wall: 'indigo' }));
    S.tDim = shot.at('network', 0.25); S.tMsg = shot.at('messages', 0.6);
    const H = 0.86 + 0.62;
    S.nodes = set.blocks.map((b, i) => { const m = kit.put(kit.ball(0.04, kit.lit(0.6, 1.4, 1.8), 14), b.x, H, b.z, shot.root); return { m, x: b.x, z: b.z, i }; });
    const key = (b) => `${Math.round(b.x * 10)},${Math.round(b.z * 10)}`, idx = {}; S.nodes.forEach((n) => { idx[key(n)] = n; });
    // breadth-first from node 0 over the 4 × 3 grid: hop count = when its links draw
    const depth = S.nodes.map(() => 99); depth[0] = 0; const q = [0];
    const nbrs = (n) => S.nodes.filter((o) => o !== n && Math.abs(o.x - n.x) + Math.abs(o.z - n.z) < 0.65);
    while (q.length) { const a = q.shift(); nbrs(S.nodes[a]).forEach((o) => { if (depth[o.i] > depth[a] + 1) { depth[o.i] = depth[a] + 1; q.push(o.i); } }); }
    S.edges = [];
    S.nodes.forEach((a) => nbrs(a).forEach((b) => { if (b.i < a.i) return; const A = new THREE.Vector3(a.x, H, a.z), B = new THREE.Vector3(b.x, H, b.z), len = A.distanceTo(B);
      const m = kit.put(kit.tube(0.006, 0.006, 1, kit.lit(0.5, 1.2, 1.6, { transparent: true, opacity: 0.8 }), 6), 0, 0, 0, shot.root);
      S.edges.push({ m, A, B, len, d: Math.min(depth[a.i], depth[b.i]) }); }));
    S.depth = depth;
    S.dots = S.edges.map(() => kit.put(kit.ball(0.022, kit.lit(3.0, 2.2, 1.0), 10), 0, 0, 0, shot.root));
    S.bix = k.buddy({ ...k.LOOK, scale: 0.34 }, shot.root); S.bix.root.position.set(-1.15, 0.86, 0.32); S.bix.root.rotation.y = 0.6; S.bix.shadow.visible = false;
    k.sound(S.tDim, 'riser', -14); k.sound(S.tMsg, 'tick', -8);
  },

  lights(k, t, shot, rig, at) {                       // the set's own light, dimmed toward a night look from the first cue
    shot.set.light(rig, at, t); const dim = 1 - 0.65 * k.ease.both(k.clamp((t - shot.s.tDim) / 0.6));
    rig.key.intensity *= dim; rig.accent.intensity *= dim; rig.fill.intensity *= dim; rig.sky.intensity = 0.8 * dim;
  },

  frame(k, t, shot) {
    const S = shot.s, b = S.bix;
    shot.set.frame(t, k.camera);
    b.idle(t, 2.7); b.blink(t, [shot.t0 + 0.9]); b.point(t, S.tDim + 0.1, 'right', 1.35);
    S.nodes.forEach((n) => { const u = k.settle(t - S.tDim - 0.1 - S.depth[n.i] * 0.12, 2.6, 0.5); n.m.visible = t > S.tDim; n.m.scale.setScalar(Math.max(0.001, u)); n.m.position.y = 1.48 + 0.01 * Math.sin(k.TAU * 0.5 * t + n.i); });
    S.edges.forEach((e, j) => {
      const u = k.ease.out(k.clamp((t - S.tDim - 0.25 - e.d * 0.12) / 0.3)); e.m.visible = u > 0;
      const end = e.A.clone().lerp(e.B, u); e.m.scale.set(1, Math.max(0.001, e.len * u), 1); e.m.position.lerpVectors(e.A, end, 0.5); e.m.lookAt(end); e.m.rotateX(Math.PI / 2);
      const dot = S.dots[j], f = (t - S.tMsg - e.d * 0.15) / 0.35; dot.visible = f > 0 && f % 1.4 < 1; if (dot.visible) dot.position.lerpVectors(e.A, e.B, k.ease.both(f % 1.4));
    });
  },

  view() { return { from: [-0.15, 5.3, 1.75], to: [0.12, 5.15, 1.6], look0: [0, 0.86, -0.55], look1: [0, 0.86, -0.5], fov: 44, ap: 0.0008 }; },   // high, looking down: the streets read (the low 'table' view hides them behind the front row)
};

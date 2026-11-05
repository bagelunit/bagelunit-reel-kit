// b24 · from one to millions. Fits "It's not one device. It's millions of them, all helping each other."
// It starts close on one block of the table town, its dot glowing; on the first cue the camera spirals up and back while
// thousands of dots light across the table and the floor in a ripple from that block, and a relay of bright hops runs
// outward; the badge rolls into the millions. Cue words: millions · helping (fallbacks: 30 %, 70 %).
export default {
  build(k, shot) {
    const S = (shot.s = {}), { kit, THREE } = k, set = (shot.set = k.rooms.mapTable(shot.root, { wall: 'night' }));
    S.tOut = shot.at('millions', 0.3); S.tHelp = shot.at('helping', 0.7);
    const blk = set.blocks[5]; S.O = new THREE.Vector3(blk.x, 0.86 + blk.h + 0.05, blk.z);
    const r = k.rng(24), N = 2600, pos = new Float32Array(N * 3), dist = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let x, y, z;
      if (i < 900) { x = -1.25 + r() * 2.5; z = -1.45 + r() * 1.9; y = 0.875; }                  // on the table
      else { const a = r() * k.TAU, d = 1.6 + r() * 5.5; x = Math.cos(a) * d; z = -0.5 + Math.sin(a) * d * 0.8; y = 0.01; }   // across the floor around it
      pos.set([x, y, z], i * 3); dist[i] = Math.hypot(x - S.O.x, z - S.O.z);
    }
    S.dist = dist; S.N = N;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    S.dots = kit.put(new THREE.Points(geo, new THREE.PointsMaterial({ size: 0.028, vertexColors: true, transparent: true, depthWrite: false })), 0, 0, 0, shot.root);
    S.first = kit.put(kit.ball(0.03, kit.lit(2.4, 1.4, 0.6), 12), S.O.x, S.O.y, S.O.z, shot.root);
    S.hops = Array.from({ length: 10 }, (_, i) => kit.put(kit.ball(0.018, kit.lit(3, 2.2, 1), 8), 0, 0, 0, shot.root));
    shot.badge = ['DEVICES', (t) => Math.round(1 + 2.4e6 * k.ease.in(k.clamp((t - S.tOut) / 1.6)))];
    k.sound(S.tOut, 'riser', -12); k.sound(S.tHelp, 'shimmer', -10);
  },

  lights(k, t, shot, rig, at) { shot.set.light(rig, at, t); const d = 1 - 0.55 * k.ease.both(k.clamp((t - shot.s.tOut) / 1.0)); rig.key.intensity *= d; rig.fill.intensity *= d; rig.accent.intensity *= d; },

  frame(k, t, shot) {
    const S = shot.s;
    shot.set.frame(t, k.camera);
    const front = 6.5 * k.ease.in(k.clamp((t - S.tOut) / 1.5)), col = S.dots.geometry.attributes.color;
    for (let i = 0; i < S.N; i++) { const v = k.clamp((front - S.dist[i]) / 0.3), f = v > 0 ? 1 + 1.5 * Math.exp(-(front - S.dist[i]) * 2) : 0; col.setXYZ(i, 1.4 * f * v, 1.0 * f * v, 0.5 * f * v); }
    col.needsUpdate = true;
    S.first.scale.setScalar(1 + 0.2 * Math.sin(k.TAU * 1.5 * t));
    S.hops.forEach((m, i) => { const a = i * 2.4, u = (t - S.tHelp - i * 0.08) / 0.7; m.visible = u > 0 && u < 1; if (!m.visible) return; const d = 0.2 + u * 2.4; m.position.set(S.O.x + Math.cos(a) * d, S.O.y + 0.25 * Math.sin(Math.PI * u), S.O.z + Math.sin(a) * d * 0.7); });
  },

  view(k, t, shot) {
    const S = shot.s, O = S.O, u = k.ease.both(k.clamp((t - S.tOut + 0.2) / 1.6)), a = -0.5 + 1.2 * u, d = k.lerp(0.55, 4.6, u), h = k.lerp(0.35, 3.8, u);
    return { pos: [O.x + Math.sin(a) * d, O.y + h, O.z + Math.cos(a) * d], look: [k.lerp(O.x, 0, u), k.lerp(O.y, 0.6, u), k.lerp(O.z, -0.6, u)], fov: 44, ap: k.lerp(0.004, 0.0012, u), focus: [O.x, O.y, O.z] };
  },
};

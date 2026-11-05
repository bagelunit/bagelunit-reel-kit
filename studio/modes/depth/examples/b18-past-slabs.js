// b18 · what usually happens, as a chart over the place. Fits "It remembers every past Tuesday, so it knows 6 pm gets busy."
// A 3D chart floats above the table town: on the first cue seven slabs (past days) rise one after another; a curve draws
// through their tops; on the second cue today's slab lights in the accent and a beam drops from it to the block it's about.
// Bix points up at it. Cue words: past · busy (fallbacks: 25 %, 70 %). Heights in DAYS, the block in PLACE.
const DAYS = [0.35, 0.5, 0.42, 0.7, 0.62, 0.9, 0.78], PLACE = 'CAFE';

export default {
  build(k, shot) {
    const S = (shot.s = {}), { kit, THREE } = k, set = (shot.set = k.rooms.mapTable(shot.root, { wall: 'denim' }));
    S.tRise = shot.at('past', 0.25); S.tNow = shot.at('busy', 0.7);
    const BASE = new THREE.Vector3(-0.05, 1.32, -0.75), W = 0.17;
    S.chart = kit.group(shot.root, BASE.x, BASE.y, BASE.z);
    kit.put(kit.box(1.36, 0.02, 0.26, kit.paint(0xfbf8f1, { rough: 0.7 }), 0.01), 0, -0.01, 0, S.chart);
    S.slabs = DAYS.map((h, i) => { const m = kit.put(kit.box(W - 0.03, 1, 0.16, kit.paint(0x8fb8d8, { map: null, rough: 0.4, transparent: true, opacity: 0.85 }), 0.01), -0.51 + i * W, 0, 0, S.chart); return { m, h }; });
    const pts = DAYS.map((h, i) => new THREE.Vector3(-0.51 + i * W, h * 0.5 + 0.02, 0.1)), curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 80, 0.012, 8, false); S.curve = kit.put(new THREE.Mesh(geo, kit.lit(1.8, 0.9, 0.4)), 0, 0, 0, S.chart); S.curveN = geo.index.count;
    const blk = set.blocks.find((b) => b.name === PLACE) || set.blocks[5];
    S.beam = kit.put(kit.tube(0.008, 0.008, 1, kit.lit(1.8, 0.9, 0.4, { transparent: true, opacity: 0.7 }), 8), 0, 0, 0, shot.root);
    S.from = new THREE.Vector3(BASE.x - 0.51 + 6 * W, BASE.y, BASE.z); S.to = new THREE.Vector3(blk.x, 0.86 + blk.h + 0.05, blk.z);
    S.bix = k.buddy({ ...k.LOOK, scale: 0.34 }, shot.root); S.bix.root.position.set(-1.12, 0.86, 0.3); S.bix.root.rotation.y = 0.5; S.bix.shadow.visible = false;
    shot.chip = { text: 'history --tuesdays', at: shot.t0 + 0.2 };
    k.sound(S.tRise, 'tick', -8); k.sound(S.tNow, 'pop', -4); k.punch(S.tNow, 0.4);
  },

  frame(k, t, shot) {
    const S = shot.s, b = S.bix;
    shot.set.frame(t, k.camera);
    b.idle(t, 0.6); b.blink(t, [shot.t0 + 1.3]); b.point(t, S.tRise - 0.1, 'right', 1.6); b.hop(t - S.tNow - 0.1, 0.08);
    S.chart.position.y = 1.32 + 0.015 * Math.sin(k.TAU * 0.3 * t);
    S.slabs.forEach((q, i) => { const u = k.settle(t - S.tRise - i * 0.1, 2.4, 0.55), h = Math.max(0.002, q.h * 0.5 * u); q.m.scale.y = h; q.m.position.y = h / 2; const today = i === 6 && t > S.tNow; q.m.material.color.setHex(today ? 0xd9653b : 0x8fb8d8); q.m.scale.x = today ? 1 + 0.08 * k.jolt(t - S.tNow, 3, 0.5) : 1; });
    const draw = k.ease.out(k.clamp((t - S.tRise - 0.5) / 0.8)); S.curve.visible = draw > 0; S.curve.geometry.setDrawRange(0, Math.floor((S.curveN * draw) / 6) * 6);
    const bu = k.ease.out(k.clamp((t - S.tNow - 0.15) / 0.35)), top = S.from.clone().setY(S.chart.position.y), len = top.distanceTo(S.to);
    S.beam.visible = bu > 0; S.beam.scale.set(1, Math.max(0.001, len * bu), 1); S.beam.position.lerpVectors(top, S.to, bu / 2);
    S.beam.lookAt(S.to); S.beam.rotateX(Math.PI / 2);
  },

  view(k, t, shot) { return { from: [-0.4, 2.35, 2.55], to: [0.3, 2.3, 2.4], look0: [-0.15, 1.15, -0.75], look1: [0.15, 1.15, -0.7], fov: 46, ap: 0.0016 }; },
};

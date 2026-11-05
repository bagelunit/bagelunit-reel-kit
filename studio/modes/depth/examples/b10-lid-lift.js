// b10 · open it up and show the hidden wiring. Fits "Under the glass there's a grid of wires: rows one way, columns the other."
// A closed gadget case on the workbench. On the first cue its glass top and the cover lift apart on springs (an exploded
// view); a copper grid draws itself on the circuit board underneath; on "rows" every row flares, on "columns" every column.
// Bix stands beside the bench and points. Cue words: glass · rows · columns (fallbacks spread them over the shot).
export default {
  build(k, shot) {
    const S = (shot.s = {}), { kit, THREE } = k, set = (shot.set = k.rooms.bench(shot.root, { wall: 'denim' }));
    S.tOpen = shot.at('glass', 0.15); S.tDraw = S.tOpen + 0.45; S.tRows = shot.at('rows', 0.55); S.tCols = shot.at('columns', 0.78);
    const C = set.centre, case0 = kit.group(shot.root, C.x, C.y, C.z);
    kit.put(kit.box(1.0, 0.1, 0.66, kit.paint(0x2b2d33, { rough: 0.45 }), 0.03), 0, 0.05, 0, case0);                 // the base tray
    kit.put(kit.box(0.9, 0.012, 0.56, kit.paint(0x2f6f5e, { rough: 0.6 }), 0.004), 0, 0.106, 0, case0);              // the circuit board
    S.cover = kit.put(kit.box(1.0, 0.04, 0.66, kit.paint(0xd9653b, { rough: 0.55 }), 0.02), 0, 0.13, 0, case0);       // the coloured cover
    S.glass = kit.put(kit.box(0.98, 0.012, 0.64, kit.mat.glass, 0.004), 0, 0.16, 0, case0);                         // the glass top
    S.rows = []; S.cols = [];
    for (let i = 0; i < 6; i++) { const m = kit.put(kit.box(0.82, 0.008, 0.01, kit.lit(0.75, 0.42, 0.2), 0), 0, 0.116, -0.22 + i * 0.088, case0); S.rows.push(m); }
    for (let i = 0; i < 9; i++) { const m = kit.put(kit.box(0.01, 0.009, 0.48, kit.lit(0.75, 0.42, 0.2), 0), -0.36 + i * 0.09, 0.118, 0, case0); S.cols.push(m); }
    S.case0 = case0;
    S.bix = k.buddy({ ...k.LOOK, scale: 0.32 }, shot.root); S.bix.root.position.copy(set.peek); S.bix.root.rotation.y = set.peekYaw; S.bix.shadow.visible = false;
    k.sound(S.tOpen, 'swoosh', -8); k.sound(S.tRows, 'tick', -6); k.sound(S.tCols, 'tick', -6); k.punch(S.tCols, 0.5);
  },

  frame(k, t, shot) {
    const S = shot.s, b = S.bix;
    shot.set.frame(t);
    b.idle(t, 1.7); b.blink(t, [shot.t0 + 0.7]); b.point(t, S.tOpen - 0.1, 'left', 1.1); b.hop(t - S.tCols, 0.08);
    const lift = k.settle(t - S.tOpen, 2.2, 0.6);
    S.cover.position.y = 0.13 + 0.22 * lift; S.cover.rotation.z = -0.12 * lift;
    S.glass.position.y = 0.16 + 0.4 * k.settle(t - S.tOpen - 0.08, 2.0, 0.62); S.glass.rotation.z = 0.08 * lift;
    const hot = (t0) => (t > t0 ? 1 + 2.6 * Math.exp(-(t - t0) * 2.4) : 1);
    S.rows.forEach((m, i) => { const u = k.ease.out(k.clamp((t - S.tDraw - i * 0.06) / 0.3)); m.scale.x = Math.max(0.001, u); m.visible = u > 0; const h = hot(S.tRows + i * 0.05); m.material.color.setRGB(0.75 * h, 0.42 * h, 0.2 * h); });
    S.cols.forEach((m, i) => { const u = k.ease.out(k.clamp((t - S.tDraw - 0.3 - i * 0.04) / 0.3)); m.scale.z = Math.max(0.001, u); m.visible = u > 0; const h = hot(S.tCols + i * 0.04); m.material.color.setRGB(0.75 * h, 0.42 * h, 0.2 * h); });
  },

  view(k, t, shot) {
    const C = shot.set.centre;
    return { from: [0.6, C.y + 1.15, 1.25], to: [0.35, C.y + 1.25, 1.0], look0: [0.12, C.y + 0.2, C.z], look1: [0.12, C.y + 0.22, C.z], fov: 42, ap: 0.002, focus: [0, C.y + 0.12, C.z] };
  },
};

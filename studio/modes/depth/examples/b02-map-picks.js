// b02 · picks on a map. Fits "It finds leads, researches them and picks the best fits."
// A little town on a table. On "finds" six pins drop one after another; Bix sweeps a magnifying glass across them on
// "researches"; on "fits" the right three get a green ring and a ✓ while the rest grey out. The badge counts the leads.
export default {
  build(k, shot) {
    const S = (shot.s = {}), { kit, THREE } = k;
    shot.set = k.rooms.mapTable(shot.root, { wall: 'clay' });
    S.tFind = shot.at('finds', 0.2); S.tLook = shot.at('researches', 0.45); S.tPick = shot.at('fits', 0.8);
    const picks = ['BAKERY', 'CAFE', 'DELI'], all = ['BAKERY', 'GYM', 'PIZZA', 'CAFE', 'DELI', 'YOGA'];
    all.forEach((n, i) => shot.set.pin(n, S.tFind + i * 0.07, picks.includes(n) ? { pickAt: S.tPick + 0.1 + picks.indexOf(n) * 0.12 } : { greyAt: S.tPick + 0.15 }));
    S.stops = all.map((n) => shot.set.blocks.find((b) => b.name === n)).filter(Boolean);
    S.lens = kit.group(shot.root);
    kit.put(new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.022, 12, 40), kit.mat.ink), 0, 0, 0, S.lens).castShadow = true;
    kit.put(new THREE.Mesh(new THREE.CircleGeometry(0.15, 40), new THREE.MeshStandardMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.25, roughness: 0.05 })), 0, 0, 0, S.lens);
    kit.put(kit.tube(0.02, 0.024, 0.26, kit.mat.woodDark, 10), 0, -0.29, 0, S.lens);
    S.bix = k.buddy({ ...k.LOOK }, shot.root); S.bix.root.position.set(0.1, 0.32, -1.85); S.bix.shadow.visible = false;
    shot.badge = ['LEADS', (t) => Math.round(36 * k.ease.out((t - S.tFind) / 0.55))];
    k.sound(S.tFind, 'tick', -8); k.sound(S.tPick + 0.1, 'pop', -6);
  },

  frame(k, t, shot) {
    const S = shot.s, b = S.bix;
    shot.set.frame(t, k.camera);
    b.idle(t, 1.3); b.hop(t - S.tPick - 0.1, 0.1); b.blink(t, [shot.t0 + 0.8]);
    const sw = k.clamp((t - S.tLook + 0.1) / Math.max(0.4, S.tPick - S.tLook + 0.2)), n = S.stops.length - 1, x = sw * n, i = Math.min(n - 1, Math.floor(x)), f = k.ease.both(x - i);
    const px = k.lerp(S.stops[i].x, S.stops[i + 1].x, f), pz = k.lerp(S.stops[i].z, S.stops[i + 1].z, f);
    S.lens.position.set(px, 1.41 + 0.03 * Math.sin(k.TAU * 1.3 * t), pz + 0.12); S.lens.rotation.set(-1.0, 0, 0.2);
    S.lens.visible = t >= S.tLook - 0.25; S.lens.scale.setScalar(k.grow(t - S.tLook + 0.25, 3, 0.55));
    b.arms[0].rotation.set(-1.1 * k.settle(t - shot.t0, 2.2, 0.6), 0, -0.45); b.arm('right', 0.15 + 0.1 * Math.sin(k.TAU * 0.7 * t));
    b.body.rotation.y = k.clamp((px - 0.1) * 0.25, -0.3, 0.3);
  },

  view: () => 'table',
};

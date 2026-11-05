// b22 · a little tag that keeps calling out. Fits "The tag pings every few seconds, and anything nearby can hear it."
// A parcel waits on the shop's stoop with a round tag on top. The tag pulses a ring on every spoken word of the shot; on the
// cue a dashed range circle sweeps around it on the pavement and the badge rolls the range in metres. Bix stands beside
// it. Cue word: nearby (fallback 55 %).
export default {
  build(k, shot) {
    const S = (shot.s = {}), { kit, THREE } = k, set = (shot.set = k.rooms.street(shot.root, { sign: 'PARCELS' }));
    set.wordAt = shot.t0 + 0.1;
    S.tRange = shot.at('nearby', 0.55);
    S.P = new THREE.Vector3(0.2, set.stoop, -1.25);
    kit.put(kit.box(0.34, 0.24, 0.26, kit.paint(0xc89a62, { rough: 0.85 }), 0.015), S.P.x, S.P.y + 0.12, S.P.z, shot.root);
    kit.put(kit.box(0.35, 0.03, 0.06, kit.paint(0xe9dcc0), 0.004), S.P.x, S.P.y + 0.24, S.P.z, shot.root);
    S.tag = kit.put(kit.tube(0.06, 0.06, 0.025, kit.paint(0xfbf8f1, { map: null, rough: 0.3 }), 32), S.P.x, S.P.y + 0.265, S.P.z, shot.root);
    S.led = kit.put(kit.ball(0.015, kit.lit(0.6, 1.8, 1.0), 10), S.P.x, S.P.y + 0.282, S.P.z, shot.root);
    S.pulses = shot.words.map((w) => ({ t: w.s, m: kit.put(new THREE.Mesh(new THREE.RingGeometry(0.07, 0.085, 40), kit.lit(0.6, 1.8, 1.1, { transparent: true })), S.P.x, S.P.y + 0.28, S.P.z, shot.root) }));
    S.pulses.forEach((p) => { p.m.rotation.x = -Math.PI / 2; });
    const dash = kit.canvasTex(512, 32, (g, w, h) => { g.fillStyle = '#ffffff'; for (let x = 0; x < w; x += 48) g.fillRect(x, 0, 28, h); }, { repeat: [10, 1] });
    S.range = kit.put(new THREE.Mesh(new THREE.RingGeometry(0.9, 0.93, 96, 1, 0, 0.01), new THREE.MeshBasicMaterial({ map: dash, color: 0xb8ffd8, transparent: true })), S.P.x, set.stoop + 0.006, S.P.z, shot.root);
    S.range.rotation.x = -Math.PI / 2;
    S.bix = k.buddy({ ...k.LOOK, scale: 0.8 }, shot.root); S.bix.root.scale.setScalar(0.7); S.bix.root.position.set(-0.75, set.stoop, -1.75); S.bix.root.rotation.y = 0.6;
    shot.badge = ['RANGE m', (t) => Math.round(30 * k.ease.out(k.clamp((t - S.tRange) / 0.8)))];
    k.sound(S.tRange, 'shimmer', -8);
  },

  frame(k, t, shot) {
    const S = shot.s, b = S.bix;
    shot.set.frame(t);
    b.idle(t, 1.4); b.blink(t, [shot.t0 + 0.7]); b.point(t, shot.t0 + 0.2, 'left', 0.9);
    let flash = 0;
    S.pulses.forEach((p) => { const u = (t - p.t) / 0.8; p.m.visible = u > 0 && u < 1; p.m.scale.setScalar(1 + u * 6); p.m.material.opacity = 0.9 * (1 - u); if (u > 0 && u < 0.15) flash = 1; });
    S.led.material.color.setRGB(0.6 + 2.4 * flash, 1.8 + 1.2 * flash, 1.0 + 0.8 * flash);
    const sw = k.ease.out(k.clamp((t - S.tRange) / 0.8));
    S.range.visible = sw > 0; S.range.geometry.dispose(); S.range.geometry = new k.THREE.RingGeometry(0.9, 0.93, 96, 1, 0, Math.max(0.01, k.TAU * sw));
    S.range.rotation.z = -k.TAU * 0.1 * t;
  },

  view() { return { from: [0.35, 1.15, 2.9], to: [0.25, 1.1, 2.55], look0: [0.05, 0.75, -1.6], look1: [0.05, 0.75, -1.6], fov: 42, ap: 0.0018, focus: [0.2, 0.55, -1.25] }; },
};

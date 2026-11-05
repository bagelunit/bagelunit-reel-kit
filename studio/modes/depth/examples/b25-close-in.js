// b25 · from "somewhere near" to "right there". Fits "Close up, it switches to exact pulses and points you right to it: four metres."
// Bix walks into a shop toward a bag left on the floor. At first soft, blurry rings float around the bag (it's near,
// somewhere). On the first cue they snap into sharp pulses that travel between Bix and the bag, a time counter riding one
// pulse; on the second the fuzzy glow collapses into one crisp ring with "4 m"; on the third an arrow lights on a little
// handheld screen floating by Bix. Cue words: exact · metres · points (fallbacks: 30 %, 75 %, 55 %).
export default {
  build(k, shot) {
    const S = (shot.s = {}), { kit, THREE } = k, set = (shot.set = k.rooms.shop(shot.root, { wall: 'oat', neonWord: 'LOST & FOUND', openSign: false }));
    set.wordAt = shot.t0 + 0.1;
    S.tSharp = shot.at('exact', 0.3); S.tPin = shot.at('metres', 0.75); S.tArrow = shot.at('points', 0.55);
    S.BAG = new THREE.Vector3(1.0, 0, -1.9);
    const bag = kit.group(shot.root, S.BAG.x, 0, S.BAG.z);
    kit.put(kit.box(0.42, 0.3, 0.2, kit.paint(0x7a3f2a, { rough: 0.7 }), 0.05), 0, 0.15, 0, bag);
    kit.put(new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.018, 8, 24, Math.PI), kit.mat.woodDark), 0, 0.3, 0, bag);
    kit.put(kit.contact(0.6, 0.4, 0.4), 0, 0.005, 0, bag);
    S.fuzz = [0, 1, 2].map((i) => { const m = kit.put(kit.sheet(1, 1, kit.lit(0.22, 0.45, 0.65, { map: kit.tex.blob, transparent: true, add: true, opacity: 0.4 })), S.BAG.x, 0.01, S.BAG.z, shot.root); m.rotation.x = -Math.PI / 2; return m; });
    S.pin = kit.put(new THREE.Mesh(new THREE.RingGeometry(0.3, 0.33, 48), kit.lit(0.6, 1.8, 1.0, { transparent: true })), S.BAG.x, 0.012, S.BAG.z, shot.root); S.pin.rotation.x = -Math.PI / 2;
    S.pinLabel = kit.put(kit.sheet(0.34, 0.15, new THREE.MeshBasicMaterial({ map: kit.label('4 m', { w: 360, h: 160, bg: '#1f9a55', fg: '#ffffff', border: '#17161A', size: 100 }), transparent: true })), S.BAG.x, 0.62, S.BAG.z, shot.root);
    S.pulses = [0, 1, 2, 3].map(() => kit.put(kit.box(0.03, 0.03, 0.03, kit.lit(0.6, 1.8, 1.1), 0.01), 0, 0, 0, shot.root));
    S.counter = kit.put(kit.sheet(0.3, 0.1, new THREE.MeshBasicMaterial({ map: kit.label('', { w: 360, h: 120 }), transparent: true })), 0, 0, 0, shot.root); S.cKey = '';
    S.phone = kit.group(shot.root);
    S.pTex = kit.canvasTex(300, 520, (g, w, h) => { g.fillStyle = '#1d2533'; g.fillRect(0, 0, w, h); }, { edge: true });
    kit.put(kit.box(0.16, 0.28, 0.02, kit.mat.charcoal, 0.02), 0, 0, 0, S.phone); kit.put(kit.sheet(0.14, 0.25, kit.lit(1.0, 1.0, 1.0, { map: S.pTex })), 0, 0, 0.011, S.phone);
    S.bix = k.buddy({ ...k.LOOK, scale: 0.85 }, shot.root);
    k.sound(S.tSharp, 'tick', -6); k.sound(S.tPin, 'pop', -4); k.sound(S.tArrow, 'click', -6); k.punch(S.tPin, 0.5);
  },

  frame(k, t, shot) {
    const S = shot.s, b = S.bix, { THREE } = k;
    shot.set.frame(t);
    const walk = k.clamp((t - shot.t0) / Math.max(0.8, S.tSharp - shot.t0));
    b.root.position.set(k.lerp(-1.3, -0.1, k.ease.out(walk)), 0, k.lerp(-0.6, -1.4, k.ease.out(walk))); b.root.rotation.y = 0.9;
    if (walk < 1) b.walk(t, 0.3); else b.idle(t, 0.3);
    b.blink(t, [shot.t0 + 1.4]); if (t > S.tArrow) b.point(t, S.tArrow, 'left', 1.0);
    const sharp = k.clamp((t - S.tSharp) / 0.25), pinned = k.ease.out(k.clamp((t - S.tPin) / 0.4));
    S.fuzz.forEach((m, i) => { const s = 1.4 + 0.5 * Math.sin(k.TAU * 0.4 * t + i * 2) + i * 0.5; m.scale.setScalar(s * (1 - 0.8 * pinned)); m.material.opacity = 0.45 * (1 - pinned); m.visible = pinned < 1; });
    const A = b.root.position.clone().add(new THREE.Vector3(0.25, 0.55, 0)), B = S.BAG.clone().setY(0.25);
    S.pulses.forEach((m, i) => { const f = ((t - S.tSharp) * 1.6 + i / 4) % 1; m.visible = sharp > 0 && pinned < 1; m.position.lerpVectors(A, B, f); });
    const f0 = ((t - S.tSharp) * 1.6) % 1, ns = Math.round(14 * f0);
    S.counter.visible = sharp > 0 && pinned < 1; S.counter.position.lerpVectors(A, B, f0); S.counter.position.y += 0.14; S.counter.quaternion.copy(k.camera.quaternion);
    if (S.counter.visible && String(ns) !== S.cKey) { S.cKey = String(ns); S.counter.material.map.paint((g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#FBF7EE'; g.beginPath(); g.roundRect(4, 4, w - 8, h - 8, 20); g.fill(); g.fillStyle = '#17161A'; g.font = "700 64px 'JetBrains Mono'"; g.fillText(`${ns} ns`, 40, 84); }); }
    S.pin.visible = pinned > 0; S.pin.scale.setScalar(k.lerp(3, 1, pinned) * (1 + 0.04 * Math.sin(k.TAU * 1.5 * t)));
    S.pinLabel.visible = t > S.tPin + 0.2; S.pinLabel.scale.setScalar(k.grow(t - S.tPin - 0.2, 3, 0.5)); S.pinLabel.quaternion.copy(k.camera.quaternion);
    const pu = k.settle(t - S.tArrow + 0.2, 2.4, 0.55);
    S.phone.visible = t > S.tArrow - 0.2; S.phone.position.copy(b.root.position).add(new THREE.Vector3(0.45, 1.05 + 0.02 * Math.sin(k.TAU * 0.6 * t), 0.25)); S.phone.scale.setScalar(Math.max(0.001, pu)); S.phone.rotation.y = 0.5;
    const pk = t > S.tArrow ? 'on' : 'off';   /* repaint on a state key, never a one-way flag: frames render in any order */
    if (pk !== S.pKey) { S.pKey = pk; if (pk === 'off') S.pTex.paint((g, w, h) => { g.fillStyle = '#1d2533'; g.fillRect(0, 0, w, h); }); else S.pTex.paint((g, w, h) => { g.fillStyle = '#1d2533'; g.fillRect(0, 0, w, h); g.fillStyle = '#58c08a'; g.beginPath(); g.moveTo(w / 2, 90); g.lineTo(w / 2 + 90, 230); g.lineTo(w / 2 + 34, 230); g.lineTo(w / 2 + 34, 380); g.lineTo(w / 2 - 34, 380); g.lineTo(w / 2 - 34, 230); g.lineTo(w / 2 - 90, 230); g.closePath(); g.fill(); g.fillStyle = '#ffffff'; g.font = '800 64px Inter'; g.textAlign = 'center'; g.fillText('4 m', w / 2, 470); }); }
  },

  view: () => 'wide',
};

// b15 · press follow, send it off. Fits "Hit follow, and I'll send it straight to you."
// An alternative ending to the comment box: a big profile card floats in a shop at night. Bix presses its Follow button on
// the first cue (the button sinks, flips to "Following ✓", rings ripple out); on the second a paper plane folds out of the
// card and flies an arc toward the lens. Cue words: follow · send (fallbacks: 35 %, 68 %). Swap NAME / HANDLE.
const NAME = 'your shop', HANDLE = '@yourhandle';

export default {
  build(k, shot) {
    const S = (shot.s = {}), { kit, THREE } = k;
    shot.set = k.rooms.shop(shot.root, { wall: 'wine', neonWord: 'HELLO' });
    shot.set.signAt = shot.t0 + 0.1; shot.set.wordAt = shot.t0 + 0.2;
    S.tPress = shot.at('follow', 0.35); S.tSend = shot.at('send', 0.68); S.key = '';
    S.card = kit.group(shot.root, 0.05, 1.32, -1.0);
    S.tex = kit.canvasTex(800, 520, null, { edge: true });
    kit.put(kit.box(1.0, 0.65, 0.04, kit.paint(0xfbf8f1, { rough: 0.6 }), 0.04), 0, 0, 0, S.card);
    kit.put(kit.sheet(0.96, 0.62, new THREE.MeshStandardMaterial({ map: S.tex, color: 0xb8b1a6, roughness: 0.85 })), 0, 0, 0.021, S.card);   /* toned down: under the shop's key a white card blooms */
    S.rings = [0, 1, 2].map(() => kit.put(new THREE.Mesh(new THREE.RingGeometry(0.1, 0.115, 40), kit.lit(1.6, 0.9, 0.5, { transparent: true })), 0, -0.17, 0.03, S.card));
    S.plane = kit.group(shot.root);
    const wing = new THREE.MeshStandardMaterial({ color: 0xfbf8f1, roughness: 0.7, side: THREE.DoubleSide });
    [-1, 1].forEach((s) => { const m = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -0.18), new THREE.Vector3(s * 0.12, 0, 0.1), new THREE.Vector3(0, -0.03, 0.1)]), wing); m.geometry.computeVertexNormals(); m.castShadow = true; S.plane.add(m); });
    S.bix = k.buddy({ ...k.LOOK, scale: 0.72 }, shot.root); S.bix.root.position.set(0.95, 0, -0.35); S.bix.root.rotation.y = -0.6;
    k.sound(S.tPress, 'click', -4); k.sound(S.tSend, 'swoosh', -8); k.punch(S.tPress + 0.05, 0.5);
  },

  frame(k, t, shot) {
    const S = shot.s, b = S.bix;
    shot.set.frame(t);
    b.idle(t, 1.1); b.blink(t, [shot.t0 + 0.8]);
    const reach = k.clamp((t - S.tPress + 0.35) / 0.35) * (1 - k.clamp((t - S.tPress - 0.25) / 0.35));
    b.arm('left', 0.12 + 1.4 * k.ease.both(reach), -0.4 * reach); b.cheer(t, S.tSend + 0.4);
    S.card.position.y = 1.32 + 0.03 * Math.sin(k.TAU * 0.4 * t); S.card.rotation.y = 0.12 * Math.sin(k.TAU * 0.2 * t) - 0.1;
    const key = (t > S.tPress) + '' + Math.round(k.clamp((t - S.tPress) / 0.25) * 8);
    if (key !== S.key) { S.key = key; S.tex.paint((g, w, h) => paintCard(g, w, h, t, S, k)); }
    S.rings.forEach((m, i) => { const u = (t - S.tPress - i * 0.12) / 0.6; m.visible = u > 0 && u < 1; m.scale.setScalar(1 + u * 3); m.material.opacity = 1 - u; });
    const u = k.clamp((t - S.tSend) / 1.1), card = S.card.position;
    S.plane.visible = t > S.tSend - 0.05;
    S.plane.position.set(card.x + k.lerp(0, 0.6, u), card.y + 0.1 + 0.6 * Math.sin(Math.PI * u) - 0.2 * u, card.z + 0.1 + k.lerp(0, 3.6, k.ease.in(u)));
    S.plane.rotation.set(-0.3 + 0.5 * u, Math.PI + 0.4 * Math.sin(k.TAU * u), 0.3 * Math.sin(k.TAU * 1.5 * u));
  },

  view: () => 'wide',
};

function paintCard(g, w, h, t, S, k) {
  const on = t > S.tPress, p = k.clamp((t - S.tPress) / 0.25);
  g.fillStyle = '#fbf8f1'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#D9653B'; g.beginPath(); g.arc(120, 130, 72, 0, k.TAU); g.fill();
  g.fillStyle = '#1b1a20'; g.font = "800 62px 'Playfair Display'"; g.fillText(NAME, 220, 120); g.fillStyle = '#6f6a62'; g.font = "700 36px 'JetBrains Mono'"; g.fillText(HANDLE, 222, 172);
  [['248', 'posts'], ['12.4K', 'followers'], ['310', 'following']].forEach(([n, l], i) => { g.fillStyle = '#1b1a20'; g.font = '800 44px Inter'; g.fillText(n, 60 + i * 250, 290); g.fillStyle = '#6f6a62'; g.font = '700 26px Inter'; g.fillText(l, 60 + i * 250, 326); });
  const by = 380 + (on ? 6 * (1 - p) : 0);
  g.fillStyle = on ? '#2F8F83' : '#D9653B'; g.beginPath(); g.roundRect(60, by, w - 120, 96, 48); g.fill();
  g.fillStyle = '#FFF3DF'; g.font = '800 46px Inter'; g.textAlign = 'center'; g.fillText(on ? 'Following ✓' : 'Follow', w / 2, by + 64); g.textAlign = 'left';
}

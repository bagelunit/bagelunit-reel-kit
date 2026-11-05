// b03 · in one end, out the other. Fits "Then it turns that research into personal emails."
// Research cards ride the belt into the machine; on "turns" Bix hits the button; envelopes ride out to the OUTBOX and one
// letter lifts toward the lens on "personal". The badge counts what went out. Cue words: turns · personal.
export default {
  build(k, shot) {
    const S = (shot.s = {}), { kit, THREE } = k;
    shot.set = k.rooms.machine(shot.root, { wall: 'butter', name: 'MAIL BOT', outLabel: 'OUTBOX', outSub: 'waits for your OK', inLabel: 'INBOX', inSub: 'replies' });
    S.tGo = shot.at('turns', 0.25); S.tLetter = shot.at('personal', 0.6); shot.set.startAt = S.tGo;
    const line = shot.set.line;
    S.cards = [['BAKERY', '★ 4.8 · 3 km'], ['CAFE', '★ 4.7 · 6 km'], ['DELI', '★ 4.9 · 2 km']].map(([n, l], i) => {
      const m = kit.put(kit.sheet(0.4, 0.3, new THREE.MeshStandardMaterial({ map: kit.card({ w: 400, h: 300, title: n, titleSize: 44, lines: [l], lineSize: 34, face: 'mono', seed: 410 + i }), roughness: 0.85 })), 0, 0.66, 0.05, line);
      m.castShadow = true; return m;
    });
    const env = (who) => kit.canvasTex(400, 260, (g, w, h) => {
      g.fillStyle = '#fbf8f1'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 5;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(w / 2, h * 0.55); g.lineTo(w, 0); g.stroke();
      g.fillStyle = '#c8302a'; g.beginPath(); g.arc(w / 2, h * 0.55, 26, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#1b1a20'; g.font = "800 44px 'Playfair Display'"; g.textAlign = 'center'; g.fillText(`Hi ${who},`, w / 2, h * 0.88);
    }, { edge: true });
    S.envs = ['Sam', 'Luna', 'Theo'].map((n) => { const m = kit.put(kit.box(0.4, 0.26, 0.012, new THREE.MeshStandardMaterial({ map: env(n), roughness: 0.85 }), 0), 0, 0.7, 0.05, line); m.castShadow = true; return m; });
    S.letter = kit.put(kit.sheet(0.62, 0.44, new THREE.MeshStandardMaterial({ map: kit.canvasTex(700, 500, (g, w, h) => {
      g.fillStyle = '#fbf8f1'; g.fillRect(0, 0, w, h); g.fillStyle = '#1b1a20'; g.font = "800 60px 'Playfair Display'"; g.fillText('Hi Sam,', 44, 110);
      g.font = '700 42px Inter'; ['Your Saturday brunch', 'would love our fresh', 'sourdough. Samples?'].forEach((s, i) => g.fillText(s, 44, 200 + i * 66));
      g.fillStyle = '#D9653B'; g.fillRect(44, 420, 210, 10);
    }, { edge: true }), roughness: 0.85 })), 0, 0, 0, shot.root);
    S.letter.castShadow = true;
    S.bix = k.buddy({ ...k.LOOK, scale: 0.8 }, shot.root); S.bix.root.position.set(0.6, 0, 0.62); S.bix.root.rotation.y = -0.65;
    shot.badge = ['EMAILS WRITTEN', (t) => S.envs.filter((_, i) => t >= S.tGo + 0.5 + i * 0.4 + 0.65).length];
    k.sound(S.tGo - 0.2, 'click', -4);
  },

  frame(k, t, shot) {
    const S = shot.s, b = S.bix, X = shot.set.beltX;
    shot.set.frame(t);
    b.idle(t, 2.1); b.blink(t, [shot.t0 + 1.2]);
    const press = Math.max(0, Math.sin(Math.PI * k.clamp((t - S.tGo + 0.25) / 0.4)));
    b.arm('left', 0.12 + 2.3 * press, -0.5 * press); b.arm('right', 0.14);
    S.cards.forEach((m, i) => { const v = (t - (S.tGo - 0.45) - i * 0.4) / 0.95; m.visible = v > 0 && v < 1; m.position.set(k.lerp(X.inFrom, X.inTo, v), X.y, 0.05); m.rotation.set(-Math.PI / 2 + 0.25, 0, 0.15 * Math.sin(i * 2.3)); });
    S.envs.forEach((m, i) => { const t0 = S.tGo + 0.5 + i * 0.4, v = (t - t0) / 0.8; m.visible = v > 0; m.position.set(k.lerp(X.outFrom, X.outTo, k.ease.out(k.clamp(v))), v < 1 ? 0.8 : 0.86 + i * 0.016, 0.05); m.rotation.set(v < 1 ? -Math.PI / 2 + 0.4 : -Math.PI / 2, 0, v < 1 ? 0.1 * Math.sin(t * 3 + i) : 0.12 * (i - 1)); });
    const lv = t - S.tLetter + 0.15, up = k.settle(lv, 2.3, 0.62), back = k.ease.both((t - S.tLetter - 0.95) / 0.35);
    S.letter.visible = lv > 0;
    S.letter.position.set(k.lerp(0.9, 0.42, up) + back, k.lerp(0.85, 1.4, up) - back * 0.4, k.lerp(-0.2, 0.55, up) - back * 0.5);
    S.letter.rotation.set(k.lerp(-1.2, -0.15, up), k.lerp(-0.6, -0.12, up), k.lerp(0.4, 0.03, up)); S.letter.scale.setScalar(1 - back * 0.4);
  },

  view: () => 'line',
};

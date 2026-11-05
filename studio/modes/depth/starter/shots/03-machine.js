// 03 · the machine. "A little machine turns them into tomorrow's bake list."
// The order cards ride the input belt into the sage press; on "machine" Bix pulls the lever, the bulbs run, the gauge
// swings and steam puffs from the copper pipes; on "bake list" the finished list lifts out toward the lens, then drops into the tray.
export default {
  build(k, shot) {
    const S = (shot.s = {}), { kit, THREE } = k;
    shot.set = k.rooms.machine(shot.root, { wall: 'butter', name: 'BAKE BOT', outLabel: 'BAKE LIST', outSub: 'for 5 am', inLabel: 'ORDERS', inSub: 'tonight' });
    S.tGo = shot.at('machine', 0.25);
    S.tList = shot.at('list', 0.75);
    shot.set.startAt = S.tGo;
    const line = shot.set.line;
    S.cards = ['Ana · 6 sourdough', 'Cafe 12 · 30 croissants', 'Hotel Rio · 48 rolls'].map((txt, i) => {
      const [who, what] = txt.split(' · ');
      const m = kit.put(kit.sheet(0.4, 0.3, new THREE.MeshStandardMaterial({ map: kit.card({ w: 400, h: 300, title: who, titleSize: 44, lines: [what], lineSize: 36, face: 'mono', seed: 400 + i }), roughness: 0.85 })), 0, 0.66, 0.05, line);
      m.castShadow = true; return m;
    });
    S.sheets = [0, 1, 2].map(() => { const m = kit.put(kit.box(0.4, 0.26, 0.012, kit.mat.paper, 0), 0, 0.7, 0.05, line); return m; });
    S.list = kit.put(kit.sheet(0.62, 0.44, new THREE.MeshStandardMaterial({ map: kit.canvasTex(700, 500, (g, w, h) => {
      g.fillStyle = '#fbf8f1'; g.fillRect(0, 0, w, h); g.fillStyle = '#1b1a20'; g.font = "800 58px 'Playfair Display'"; g.fillText('Bake list · 5 am', 40, 96);
      g.font = "700 40px 'JetBrains Mono'"; [['sourdough', 40], ['croissant', 64], ['rolls', 48], ['rye', 12]].forEach(([n, q], i) => { g.fillText(n, 44, 186 + i * 70); g.textAlign = 'right'; g.fillText(String(q), w - 44, 186 + i * 70); g.textAlign = 'left'; });
      g.fillStyle = '#D9653B'; g.fillRect(40, 450, 220, 10); g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 5; g.strokeRect(2, 2, w - 4, h - 4);
    }, { edge: true }), roughness: 0.85 })), 0, 0, 0, shot.root);
    S.list.castShadow = true;
    S.bix = k.buddy({ ...k.LOOK, scale: 0.8 }, shot.root);
    S.bix.root.position.set(0.6, 0, 0.62); S.bix.root.rotation.y = -0.65;
    k.sound(S.tGo - 0.2, 'click', -4);
    k.sound(S.tList, 'stamp', -6);
    k.punch(S.tList, 0.6);
  },

  frame(k, t, shot) {
    const S = shot.s, b = S.bix, X = shot.set.beltX;
    shot.set.frame(t);
    b.idle(t, 2.1); b.talk(t, shot.words); b.blink(t, [shot.t0 + 1.1]);
    const press = Math.max(0, Math.sin(Math.PI * k.clamp((t - S.tGo + 0.25) / 0.45)));
    b.arm('left', 0.12 + 2.3 * press, -0.5 * press); b.arm('right', 0.12 + 0.1 * Math.sin(Math.PI * 1.2 * t));
    b.hop(t - S.tList - 0.1, 0.12);
    S.cards.forEach((m, i) => { const v = (t - (S.tGo - 0.6) - i * 0.4) / 0.95; m.visible = v > 0 && v < 1; m.position.set(k.lerp(X.inFrom, X.inTo, v), X.y, 0.05); m.rotation.set(-Math.PI / 2 + 0.25, 0, 0.15 * Math.sin(i * 2.3)); });
    S.sheets.forEach((m, i) => { const t0 = S.tGo + 0.5 + i * 0.35, v = (t - t0) / 0.8; m.visible = v > 0; m.position.set(k.lerp(X.outFrom, X.outTo, k.ease.out(k.clamp(v))), v < 1 ? 0.8 : 0.86 + i * 0.016, 0.05); m.rotation.set(v < 1 ? -Math.PI / 2 + 0.4 : -Math.PI / 2, 0, v < 1 ? 0.1 * Math.sin(t * 3 + i) : 0.12 * (i - 1)); });
    const lv = t - S.tList + 0.15, up = k.settle(lv, 2.3, 0.62), down = k.ease.both((t - S.tList - 0.95) / 0.35);
    S.list.visible = lv > 0;
    S.list.position.set(k.lerp(0.9, 0.42, up) + down * 1.0, k.lerp(0.85, 1.4, up) - down * 0.4, k.lerp(-0.2, 0.55, up) - down * 0.5);
    S.list.rotation.set(k.lerp(-1.2, -0.15, up), k.lerp(-0.6, -0.12, up), k.lerp(0.4, 0.03, up));
    S.list.scale.setScalar(1 - down * 0.4);
  },

  view: () => 'line',
};

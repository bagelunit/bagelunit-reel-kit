// b26 · one touch, then look inside. Fits "One tap wakes the phone, and inside you can see every part."
// The studio table: a phone lies dark on the felt mat under the lamp. A hand slides in and taps the glass on the first cue:
// a ring ripples out and the screen wakes. On the second cue the phone goes x-ray: the shell turns ghostly, a scan line
// sweeps it and the insides lift apart, and three callout labels pin themselves to the battery, the board and the camera.
// A small Bix watches from the back of the table and hops on the reveal.
// Cue words: tap · inside (fallbacks: 22 % and 52 % of the shot). Labels in LABELS.
const LABELS = [['battery', 'Battery', '4,500 mAh'], ['chip', 'Logic board', 'the brain'], ['camera', 'Camera', '3 lenses']];

export default {
  build(k, shot) {
    const S = (shot.s = {}), { THREE } = k;
    const set = (shot.set = k.rooms.studio(shot.root, { wall: 'oat' }));
    S.tTap = shot.at('tap', 0.22); S.tIn = shot.at('inside', 0.52);
    S.phone = k.gear.phone(shot.root, { face: 'up' }); S.phone.g.position.copy(set.centre); S.phone.g.rotation.y = 0.12;
    S.hand = k.gear.hand(shot.root, { sleeve: 0x2f6f5e });
    S.ring = k.kit.put(new THREE.Mesh(new THREE.RingGeometry(0.03, 0.038, 40), k.kit.lit(2.0, 1.6, 1.0, { transparent: true })), 0, 0, 0, shot.root); S.ring.rotation.x = -Math.PI / 2;
    S.bix = k.buddy({ ...k.LOOK, scale: 0.26 }, shot.root); S.bix.root.position.copy(set.peek).add(new THREE.Vector3(-0.05, 0, -0.08)); S.bix.root.rotation.y = set.peekYaw; S.bix.shadow.visible = false;
    S.key = '';
    LABELS.forEach(([mark, text, sub], i) => k.label(mark, S.phone.marks[mark], text, { at: S.tIn + 0.45 + i * 0.28, sub, side: ['right', 'right', 'left'][i], dy: [150, -120, -150][i] }));
    k.sound(S.tTap, 'click', -4); k.sound(S.tTap + 0.08, 'pop', -9); k.sound(S.tIn, 'riser', -10); k.sound(S.tIn + 0.45, 'tick', -8); k.punch(S.tIn + 0.1, 0.5);
  },

  frame(k, t, shot) {
    const S = shot.s, set = shot.set, p = S.phone;
    set.frame(t);
    const tapAt = p.spot(0.05, -0.12);
    const c = S.hand.tap(t, S.tTap, tapAt, { lift: 0.1, from: tapAt.clone().add(new k.THREE.Vector3(0.6, 0.35, 0.3)) });
    // after the tap the hand drifts back out of frame before the x-ray, so nothing covers the reveal
    const away = k.ease.both(k.clamp((t - S.tTap - 0.35) / 0.5));
    if (away > 0) S.hand.at(tapAt.clone().add(new k.THREE.Vector3(0.75 * away, 0.1 + 0.35 * away, 0.35 * away)), 0);
    S.hand.g.visible = t > S.tTap - 0.75 && away < 0.999; S.hand.shadow.visible = S.hand.g.visible;
    const rv = (t - S.tTap) / 0.5; S.ring.visible = rv > 0 && rv < 1; S.ring.position.copy(tapAt).setY(tapAt.y + 0.004); S.ring.scale.setScalar(1 + rv * 5); S.ring.material.opacity = 1 - k.clamp(rv);
    p.wake(t, S.tTap + 0.02);
    p.xray(t, S.tIn, 0.75);
    const key = Math.round(t * 15);
    if (key !== S.key) { S.key = key; p.screen.draw((g, w, h) => screenArt(g, w, h, t, S, k)); }
    const b = S.bix; b.idle(t, 2.1); b.blink(t, [shot.t0 + 0.8, S.tIn + 1.4]); b.hop(t - S.tIn - 0.2, 0.05); b.point(t, S.tIn + 0.1, 'left', 1.1);
  },

  view: () => 'hero',
};

function screenArt(g, w, h, t, S, k) {
  g.fillStyle = '#16191f'; g.fillRect(0, 0, w, h);
  const on = k.clamp((t - S.tTap) / 0.3);
  if (on <= 0) return;
  g.globalAlpha = on;
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#2b3a52'); gr.addColorStop(1, '#5a3e3a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.fillStyle = '#f3ecdf'; g.textAlign = 'center'; g.font = '800 150px Inter'; g.fillText('9:41', w / 2, 300);
  g.font = '700 40px Inter'; g.fillStyle = '#d9cdb8'; g.fillText('Tuesday', w / 2, 360);
  ['#D9653B', '#E3A21A', '#2F8F83', '#6B5BB8', '#3f6390', '#c2557a', '#58c08a', '#f08bb4'].forEach((c, i) => {
    const pop = k.settle(t - S.tTap - 0.2 - i * 0.05, 3, 0.5); if (pop <= 0) return;
    const x = 60 + (i % 4) * 110, y = 560 + Math.floor(i / 4) * 130, s = 86 * pop;
    g.fillStyle = c; g.beginPath(); g.roundRect(x + (86 - s) / 2, y + (86 - s) / 2, s, s, 22); g.fill();
  });
  g.globalAlpha = 1; g.textAlign = 'left';
}

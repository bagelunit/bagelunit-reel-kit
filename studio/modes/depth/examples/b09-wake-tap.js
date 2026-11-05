// b09 · force does nothing, the right touch does everything. Fits "Hitting it harder won't help. One light tap wakes it up."
// A desk at night with a dark laptop. On the first cue a big wooden mallet slams the desk: the mug jumps, the frame shakes,
// the screen stays black. On the second cue a small Bix beside the laptop taps one key: a warm light sweep crosses the
// screen, a trail of sparks runs from his hand to the glass and the screen wakes to a greeting + app tiles.
// Cue words: harder · tap (any words work: the fallbacks place the slam at 25 % and the tap at 62 % of the shot).
export default {
  build(k, shot) {
    const S = (shot.s = {}), { kit, THREE } = k;
    shot.set = k.rooms.desk(shot.root, { wall: 'moss', sky: 'night' });
    S.tSlam = shot.at('harder', 0.25); S.tTap = shot.at('tap', 0.62); S.key = '';
    S.mallet = kit.group(shot.root);
    kit.put(kit.tube(0.11, 0.11, 0.3, kit.mat.woodLight, 28), 0, 0, 0, S.mallet).rotation.z = Math.PI / 2;
    kit.put(kit.tube(0.025, 0.03, 0.62, kit.mat.woodDark, 12), 0, 0.31, 0, S.mallet);
    S.bix = k.buddy({ ...k.LOOK, scale: 0.4 }, shot.root); S.bix.root.position.copy(shot.set.peek).add(new THREE.Vector3(0.06, 0, 0.12)); S.bix.root.rotation.y = -0.8; S.bix.shadow.visible = false;
    S.sparks = Array.from({ length: 9 }, (_, i) => kit.put(kit.ball(0.012 + 0.006 * (i % 3), kit.lit(3.2, 2.2, 1.0), 8), 0, 0, 0, shot.root));
    k.sound(S.tSlam, 'thud', -2); k.shake(S.tSlam + 0.02, 1.1); k.sound(S.tTap, 'click', -4); k.sound(S.tTap + 0.12, 'shimmer', -8); k.punch(S.tTap + 0.1, 0.6);
  },

  frame(k, t, shot) {
    const S = shot.s, b = S.bix, set = shot.set, { THREE } = k;
    set.frame(t);
    b.idle(t, 3.3); b.blink(t, [shot.t0 + 0.9]);
    // the mallet: swings in from above the frame, slams, rings out and lifts away
    const sw = t - S.tSlam, down = k.ease.in(k.clamp((sw + 0.22) / 0.22)), up = k.ease.both(k.clamp((sw - 0.45) / 0.35));
    S.mallet.visible = sw > -0.3 && up < 1;
    S.mallet.position.set(0.32, 0.9 + (1 - down) * 0.9 + up * 1.0 + (sw > 0 ? 0.02 * k.jolt(sw, 6, 0.4) : 0), -1.0);
    S.mallet.rotation.z = (1 - down) * 0.9 - up * 0.6;
    set.laptop.position.y = 0.795 + (sw > 0 ? 0.012 * k.jolt(sw, 7, 0.45) : 0);
    // the tap: his near arm reaches the keys, presses and comes back
    const reach = k.clamp((t - S.tTap + 0.4) / 0.4) * (1 - k.clamp((t - S.tTap - 0.35) / 0.3));
    b.arm('right', 0.12, -1.3 * k.ease.both(reach)); b.arm('left', 0.12); b.hop(t - S.tTap - 0.4, 0.06);
    // sparks: a short arc from his hand to the screen, each one a little behind the last
    const hand = b.root.position.clone().add(new THREE.Vector3(-0.14, 0.2, 0.05)), glass = new THREE.Vector3(-0.12, 1.06, -1.32);
    S.sparks.forEach((m, i) => { const u = (t - S.tTap - i * 0.03) / 0.45; m.visible = u > 0 && u < 1; if (!m.visible) return; m.position.lerpVectors(hand, glass, k.ease.out(u)); m.position.y += 0.12 * Math.sin(Math.PI * u); m.scale.setScalar(1 - u * 0.6); });
    // the screen: black, then a light sweep and the woken home screen
    const key = Math.round(t * 20);
    if (key !== S.key) { S.key = key; set.screen.draw((g, w, h) => paint(g, w, h, t, S, k)); }
  },

  view: () => 'screen',
};

function paint(g, w, h, t, S, k) {
  const wake = k.clamp((t - S.tTap - 0.1) / 0.5);
  g.fillStyle = '#07080b'; g.fillRect(0, 0, w, h);
  if (t > S.tSlam && t < S.tSlam + 0.25) { g.fillStyle = 'rgba(255,255,255,0.04)'; g.fillRect(0, 0, w, h); }   // the slam rattles the glass, nothing more
  if (wake <= 0) return;
  g.globalAlpha = wake; g.fillStyle = '#1d2533'; g.fillRect(0, 0, w, h);   /* a dark home screen: a white one blooms to mush */
  g.fillStyle = '#f3ecdf'; g.font = '800 58px Inter'; g.fillText('Good morning', 36, 82);   /* the laptop screen is 640 × 420 */
  g.fillStyle = '#9aa6b8'; g.font = '700 26px Inter'; g.fillText('3 new things since last night', 38, 124);
  const cols = ['#D9653B', '#E3A21A', '#2F8F83', '#6B5BB8', '#3f6390', '#c2557a'];
  cols.forEach((c, i) => { const pop = k.settle(t - S.tTap - 0.35 - i * 0.07, 3, 0.5); if (pop <= 0) return; const x = 38 + (i % 3) * 196, y = 150 + Math.floor(i / 3) * 128, s = 112 * pop; g.fillStyle = c; g.beginPath(); g.roundRect(x + (180 - s) / 2, y + (112 - s) / 2, s, s, 24); g.fill(); });
  g.globalAlpha = 1;
  const sweep = (t - S.tTap - 0.05) / 0.5;                  // a warm diagonal band runs across once
  if (sweep > 0 && sweep < 1) { const x = -300 + sweep * (w + 600), gr = g.createLinearGradient(x - 160, 0, x + 160, 0); gr.addColorStop(0, 'rgba(255,214,150,0)'); gr.addColorStop(0.5, 'rgba(255,214,150,0.55)'); gr.addColorStop(1, 'rgba(255,214,150,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
}

// b01 · the brief on the board. Fits a line like "Tell it what you sell and who your ideal customer is."
// Two cards fly onto a corkboard and pin themselves (on "sell" and on "customer"), a red string links them, and Bix
// stands on a crate beside the board pointing at each card as it lands. Cue words: sell · customer (fallbacks if unsaid).
export default {
  build(k, shot) {
    const S = (shot.s = {}), { kit } = k;
    shot.set = k.rooms.board(shot.root, { wall: 'sage', x: -0.2, cards: [
      { title: 'WHAT YOU SELL', lines: ['Sourdough,', 'baked daily'], icon: kit.icons.parcel },
      { title: 'WHO BUYS', lines: ['Cafés within', '10 km'], icon: kit.icons.target },
    ] });
    shot.set.cards[0].at = shot.at('sell', 0.3);
    shot.set.cards[1].at = shot.at('customer', 0.65);
    shot.set.yarnAt = shot.set.cards[1].at + 0.25;
    S.crate = kit.put(kit.box(0.66, 0.35, 0.6, kit.mat.woodDark, 0.02), 0.62, 0.175, -2.6, shot.root);
    S.bix = k.buddy({ ...k.LOOK, scale: 0.85 }, shot.root);
    S.bix.root.position.set(0.62, 0.35, -2.6); S.bix.root.rotation.y = -0.35; S.bix.shadow.visible = false;
    shot.set.cards.forEach((c) => k.sound(c.at, 'pop', -6));
  },

  frame(k, t, shot) {
    const S = shot.s, b = S.bix, [c1, c2] = shot.set.cards;
    shot.set.frame(t);
    b.idle(t, 0.3); b.talk(t, shot.words); b.blink(t, [shot.t0 + 1]);
    const reach = k.settle(t - c1.at + 0.1, 2.2, 0.5) - 0.25 * k.settle(t - c2.at + 0.05, 2.4, 0.5);
    b.arm('left', 0.12 + 2.3 * reach); b.arm('right', 0.12 + 0.25 * Math.sin(Math.PI * 1.6 * t));
    b.body.rotation.y = 0.18 * k.settle(t - shot.t0, 2, 0.6);
  },

  view: () => ({ from: [0.25, 1.15, 1.9], to: [0.15, 1.2, 1.6], look0: [0.05, 1.35, -3.0], look1: [0.05, 1.38, -3.0], fov: 38, ap: 0.0018, focus: [0, 1.4, -3.0] }),
};

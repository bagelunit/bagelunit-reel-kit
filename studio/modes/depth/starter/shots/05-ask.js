// 05 · the ask. "Comment BAKE and I'll send you the whole setup."
// The bakery from the street at dusk: string lights, a round blade sign, BAKERY in gold on the window, a queue on the
// pavement, Bix waving from the stoop.
// The comment box rises, BAKE types on the spoken word, Post presses and hearts float up; the queue hops.
export default {
  build(k, shot) {
    const S = (shot.s = {}), cta = k.reel.cta || {};
    shot.set = k.rooms.street(shot.root, { sign: 'BAKERY', board: 'FRESH AT 6' });
    shot.set.wordAt = shot.t0 + 0.15;
    S.bix = k.buddy({ ...k.LOOK }, shot.root);
    S.bix.root.position.copy(shot.set.host);
    S.queue = k.crowd(8, shot.root, 0.42);
    S.queue.forEach((q, i) => { q.root.position.set(shot.set.queueFrom.x + i * 0.5, shot.set.stoop, shot.set.queueFrom.z + (i % 2) * 0.12); q.root.rotation.y = -1.2; });
    const kw = cta.keyword || 'LINK';
    S.tKey = shot.at(kw, 0.25);
    shot.cta = { keyword: kw, at: S.tKey, sub: cta.sub || '' };
    k.sound(S.tKey + 0.75, 'click', -6);
  },

  frame(k, t, shot) {
    const S = shot.s, b = S.bix, u = t - shot.t0;
    shot.set.frame(t);
    b.idle(t, 8); b.wave(t, shot.t0, 'right'); b.arm('left', 0.12); b.blink(t, [shot.t0 + 1.6]); b.hop(t - S.tKey - 0.25, 0.14);
    S.queue.forEach((q, i) => { q.idle(t, i); q.hop(t - S.tKey - 0.35 - i * 0.07, 0.14); q.hop(t - S.tKey - 1.55 - i * 0.06, 0.12); q.root.position.x = shot.set.queueFrom.x + i * 0.5 - 0.15 * k.ease.out(u / 1.2); });
  },

  view: () => 'front',
};

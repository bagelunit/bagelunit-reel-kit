// 02 · the desk. "Every order lands on one laptop overnight."
// A desk by a window at night. The laptop screen is an order inbox: a new order card slides in on every word from "order"
// on, the counter climbs and the window behind goes from night to sunrise. A chip types the command. Bix sits on the
// desk beside the laptop, leans in to read each order and hops on "laptop".
export default {
  build(k, shot) {
    const S = (shot.s = {});
    shot.set = k.rooms.desk(shot.root, { wall: 'denim', sky: 'night', neonWord: '24/7' });
    shot.set.dawn = [shot.t0 + 0.3, shot.t1];
    shot.set.signAt = shot.at('overnight', 0.75);
    S.tOrder = shot.at('order', 0.2);
    S.tLaptop = shot.at('laptop', 0.55);
    S.orders = [['Ana', '6 sourdough'], ['Cafe 12', '30 croissants'], ['Ben', '2 rye'], ['Mira', '1 birthday cake'], ['Hotel Rio', '48 rolls'], ['Leo', '4 baguettes']];
    S.landAt = S.orders.map((_, i) => S.tOrder + 0.12 + i * 0.28);
    S.key = '';
    S.bix = k.buddy({ ...k.LOOK, scale: 0.3 }, shot.root); S.bix.root.position.copy(shot.set.peek); S.bix.root.rotation.y = -0.6; S.bix.shadow.visible = false;
    shot.chip = { text: 'orders --overnight', at: shot.t0 + 0.15 };
    shot.badge = ['ORDERS', (t) => S.landAt.filter((x) => t >= x).length * 8];
    S.landAt.forEach((x) => k.sound(x, 'tick', -10));
    k.punch(S.tLaptop, 0.5);
  },

  frame(k, t, shot) {
    const S = shot.s, b = S.bix;
    shot.set.frame(t);
    b.idle(t, 1.4); b.blink(t, [shot.t0 + 0.7, shot.t0 + 2.2]); b.type(t); b.hop(t - S.tLaptop, 0.18);
    b.body.rotation.x = 0.12 + 0.06 * Math.max(0, Math.sin(Math.PI * k.clamp((t - S.tOrder) / 0.5)));
    const shown = S.landAt.filter((x) => t >= x - 0.25).length, last = S.landAt.findLastIndex((x) => t >= x - 0.25);
    const slide = last >= 0 ? k.clamp((t - S.landAt[last] + 0.25) / 0.25) : 1;
    const key = shown + ':' + Math.round(slide * 10);
    if (key !== S.key) { S.key = key; shot.set.screen.draw((g, w, h) => inbox(g, w, h, S.orders.slice(0, shown), slide)); }
  },

  view: () => 'screen',
};

function inbox(g, w, h, rows, slide) {   // the laptop's order inbox: the newest order slides in on top, highlighted
  g.fillStyle = '#0d1117'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#20232c'; g.fillRect(0, 0, w, 50);
  [['#ff5f56', 26], ['#ffbd2e', 56], ['#27c93f', 86]].forEach(([c, x]) => { g.fillStyle = c; g.beginPath(); g.arc(x, 25, 10, 0, Math.PI * 2); g.fill(); });
  g.fillStyle = '#e6edf3'; g.font = '800 32px Inter'; g.fillText('New orders', 120, 36);
  rows.slice(-3).reverse().forEach(([who, what], i) => {
    const y = 62 + i * 118 - (i === 0 ? (1 - slide) * 50 : 0);
    g.globalAlpha = i === 0 ? slide : 1;
    g.fillStyle = i === 0 ? '#26402c' : '#1d2634'; g.beginPath(); g.roundRect(16, y, w - 32, 104, 14); g.fill();
    if (i === 0) { g.strokeStyle = '#3fb950'; g.lineWidth = 5; g.stroke(); }
    g.fillStyle = '#e6edf3'; g.font = '800 42px Inter'; g.fillText(who, 40, y + 46);
    g.fillStyle = '#7fd69a'; g.font = "700 32px 'JetBrains Mono'"; g.fillText(what, 40, y + 88);
    g.globalAlpha = 1;
  });
}

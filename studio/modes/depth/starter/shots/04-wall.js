// 04 · the wall. "By sunrise, the numbers are already up on the wall."
// The bakery's day board fills the frame: a bright paper-white screen. On "numbers" the four bake rows fill and count up,
// the LIVE tag starts pulsing on "already", the pick-up feed slides in and the week's line draws. Bix pops up at the
// screen's bottom-right corner and points at the board.
export default {
  build(k, shot) {
    const S = (shot.s = {});
    shot.set = k.rooms.monitor(shot.root, { wall: 'oat' });
    S.tNum = shot.at('numbers', 0.35);
    S.tLive = shot.at('already', 0.6);
    S.tWall = shot.at('wall', 0.85);
    S.bix = k.buddy({ ...k.LOOK, scale: 0.3 }, shot.root);
    S.bix.root.position.copy(shot.set.peek); S.bix.root.rotation.y = -0.45; S.bix.shadow.visible = false;
    S.key = '';
    k.sound(S.tNum, 'pop', -6);
    k.sound(S.tWall, 'tick', -6);
    k.punch(S.tWall, 0.5);
  },

  frame(k, t, shot) {
    const S = shot.s, b = S.bix;
    shot.set.frame(t);
    b.idle(t, 3.3); b.blink(t, [shot.t0 + 1.2]);
    b.lift(-0.45 * (1 - k.settle(t - shot.t0 - 0.15, 2.4, 0.55)));          // pops up from behind the desk edge
    b.point(t, shot.t0 + 0.45, 'left', 1.45); b.hop(t - S.tWall, 0.12);
    const key = Math.round(t * 15);
    if (key !== S.key) { S.key = key; shot.set.screen.draw((g, w, h) => board(g, w, h, t, S, k)); }
  },

  view: () => 'screen',
};

// a light dashboard: big type, full-colour bars, dark ink on paper (reads at phone size, no dark-on-dark)
const ROWS = [['SOURDOUGH', 40, '#D9653B'], ['CROISSANT', 64, '#E3A21A'], ['ROLLS', 48, '#2F8F83'], ['RYE', 12, '#6B5BB8']];
const FEED = [['Cafe 12', 'picked up 06:10'], ['Hotel Rio', 'picked up 06:25'], ['Ana', 'paid · 6 sourdough']];
function board(g, w, h, t, S, k) {
  const u = t - S.tNum, ink = '#1b1a20', soft = '#6f6a62';
  g.fillStyle = '#f7f2e8'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, 130); g.fillStyle = '#e4dccd'; g.fillRect(0, 128, w, 3);
  g.fillStyle = ink; g.font = '800 64px Inter'; g.fillText('Bakery', 40, 88);
  g.fillStyle = soft; g.font = "700 36px 'JetBrains Mono'"; g.fillText('today', 290, 86);
  const live = t > S.tLive - 0.05, pulse = live ? 0.75 + 0.25 * Math.sin(t * 9) : 0;
  g.fillStyle = live ? `rgba(217,52,43,${pulse})` : '#cfc8bb'; g.beginPath(); g.roundRect(w - 230, 34, 190, 64, 32); g.fill();
  g.fillStyle = '#ffffff'; g.font = '800 40px Inter'; g.fillText('● LIVE', w - 210, 80);
  g.fillStyle = soft; g.font = '800 34px Inter'; g.fillText('BAKE BY 5 AM', 40, 196);
  ROWS.forEach(([name, n, col], i) => {
    const y = 222 + i * 132, val = Math.max(0, Math.round(n * k.ease.out((u + 0.25 - i * 0.07) / 1.0)));
    g.fillStyle = '#ebe4d6'; g.beginPath(); g.roundRect(32, y, w - 64, 112, 18); g.fill();
    g.fillStyle = col; g.beginPath(); g.roundRect(32, y, Math.max(24, (w - 64) * Math.min(1, val / 70)), 112, 18); g.fill();
    g.fillStyle = '#ffffff'; g.font = '800 44px Inter'; g.fillText(name, 60, y + 72);
    g.fillStyle = ink; g.font = "800 76px 'Playfair Display'"; g.textAlign = 'right'; g.fillText(String(val), w - 56, y + 86); g.textAlign = 'left';
  });
  g.fillStyle = soft; g.font = '800 34px Inter'; g.fillText('PICK-UPS', 40, 790);
  FEED.forEach(([who, what], j) => {
    const v = k.clamp((t - S.tLive - j * 0.25) / 0.25); if (v <= 0) return;
    const y = 816 + j * 116 + (1 - v) * 24; g.globalAlpha = v;
    g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(32, y, w - 330, 100, 16); g.fill(); g.strokeStyle = '#e4dccd'; g.lineWidth = 3; g.stroke();
    g.fillStyle = ink; g.font = '800 38px Inter'; g.fillText(who, 56, y + 46); g.fillStyle = '#2F8F83'; g.font = "700 30px 'JetBrains Mono'"; g.fillText(what, 56, y + 84);
    g.globalAlpha = 1;
  });
  g.strokeStyle = '#D9653B'; g.lineWidth = 8; g.lineJoin = 'round'; g.beginPath();
  const pts = 24, n2 = Math.max(2, Math.floor(pts * k.clamp(u / 1.6 + 0.15)));
  for (let i = 0; i < n2; i++) { const x = 40 + (i / (pts - 1)) * (w - 360), y = 1270 - 80 * (0.15 + 0.85 * (i / pts) ** 1.6 + 0.08 * Math.sin(i * 1.7)); i ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke();
}

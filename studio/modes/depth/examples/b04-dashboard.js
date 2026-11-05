// b04 · the live board. Fits "And it comes with a live dashboard for your whole pipeline."
// The screen fills the frame: a bright board of four big stat cards (each counts up and lifts as it lands), a LIVE tag that
// pulses from "live", a stage strip whose stages fill one by one, and a fresh card that pushes in on "pipeline". Bix pops up
// at the screen's bottom-right corner and points. A chip types the command. Cue words: live · pipeline. Swap CARDS / STAGES.
const CARDS = [['NEW LEADS', 36, '#D9653B'], ['RESEARCHED', 18, '#E3A21A'], ['CONTACTED', 9, '#2F8F83'], ['BOOKED', 2, '#6B5BB8']];
const STAGES = ['found', 'checked', 'written', 'sent', 'booked'];
const FRESH = ['Corner Deli', 'meeting proposed · Tue 10:00'];

export default {
  build(k, shot) {
    const S = (shot.s = {});
    shot.set = k.rooms.monitor(shot.root, { wall: 'oat' });
    S.tLive = shot.at('live', 0.3); S.tPipe = shot.at('pipeline', 0.75); S.key = '';
    S.bix = k.buddy({ ...k.LOOK, scale: 0.3 }, shot.root);
    S.bix.root.position.copy(shot.set.peek); S.bix.root.rotation.y = -0.45; S.bix.shadow.visible = false;
    shot.chip = { text: 'board --live', at: shot.t0 + 0.15 };
    k.sound(S.tLive, 'tick', -6); k.sound(S.tPipe, 'pop', -6);
  },

  frame(k, t, shot) {
    const S = shot.s, b = S.bix;
    shot.set.frame(t);
    b.idle(t, 5.1); b.blink(t, [shot.t0 + 1.0]);
    b.lift(-0.45 * (1 - k.settle(t - shot.t0 - 0.2, 2.4, 0.55)));
    b.point(t, shot.t0 + 0.5, 'left', 1.45); b.hop(t - S.tPipe, 0.12);
    const key = Math.round(t * 15);
    if (key !== S.key) { S.key = key; shot.set.screen.draw((g, w, h) => paint(g, w, h, t, shot, S, k)); }
  },

  view: () => 'screen',
};

function paint(g, w, h, t, shot, S, k) {
  const u = t - shot.t0, ink = '#1b1a20', soft = '#6f6a62';
  g.fillStyle = '#f4efe5'; g.fillRect(0, 0, w, h);
  g.fillStyle = ink; g.font = '800 62px Inter'; g.fillText('Pipeline', 40, 92);
  const live = t > S.tLive - 0.05, pulse = live ? 0.7 + 0.3 * Math.sin(t * 9) : 0;
  g.fillStyle = live ? `rgba(217,52,43,${pulse})` : '#cfc8bb'; g.beginPath(); g.roundRect(w - 230, 40, 190, 64, 32); g.fill();
  g.fillStyle = '#ffffff'; g.font = '800 40px Inter'; g.fillText('● LIVE', w - 210, 86);
  // four stat cards in a 2 × 2 grid
  CARDS.forEach(([name, n, col], i) => {
    const cx = 32 + (i % 2) * ((w - 80) / 2 + 16), cy = 150 + Math.floor(i / 2) * 290, cw = (w - 80) / 2, chh = 266;
    const land = k.clamp((u - 0.2 - i * 0.12) / 0.3), lift = 18 * (1 - k.settle(u - 0.2 - i * 0.12, 3, 0.5));
    if (land <= 0) return;
    const val = Math.max(0, Math.round(n * k.ease.out((u - 0.25 - i * 0.12) / 0.9)));
    g.globalAlpha = land;
    g.fillStyle = 'rgba(0,0,0,0.08)'; g.beginPath(); g.roundRect(cx + 4, cy + 10 + lift, cw, chh, 22); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(cx, cy + lift, cw, chh, 22); g.fill();
    g.fillStyle = col; g.beginPath(); g.roundRect(cx, cy + lift, cw, 18, [22, 22, 0, 0]); g.fill();
    g.fillStyle = soft; g.font = '800 30px Inter'; g.fillText(name, cx + 26, cy + lift + 72);
    g.fillStyle = col; g.font = "800 128px 'Playfair Display'"; g.fillText(String(val), cx + 22, cy + lift + 214);
    g.globalAlpha = 1;
  });
  // the stage strip: each stage fills in turn
  g.fillStyle = soft; g.font = '800 30px Inter'; g.fillText('STAGES', 40, 768);
  STAGES.forEach((st, i) => {
    const x = 32 + i * ((w - 64) / STAGES.length), sw = (w - 64) / STAGES.length - 10, on = k.clamp((u - 0.9 - i * 0.22) / 0.2);
    g.fillStyle = '#e6dfd1'; g.beginPath(); g.roundRect(x, 790, sw, 74, 37); g.fill();
    g.fillStyle = `rgba(47,143,131,${on})`; g.beginPath(); g.roundRect(x, 790, sw, 74, 37); g.fill();
    g.fillStyle = on > 0.5 ? '#ffffff' : soft; g.font = '800 28px Inter'; g.textAlign = 'center'; g.fillText(st, x + sw / 2, 837); g.textAlign = 'left';
  });
  // the fresh card pushes in on "pipeline"
  const nk = k.clamp((t - S.tPipe) / 0.3);
  if (nk > 0) {
    const y = 900 + (1 - k.ease.out(nk)) * 60; g.globalAlpha = nk;
    g.fillStyle = '#ffffff'; g.beginPath(); g.roundRect(32, y, w - 330, 128, 20); g.fill(); g.strokeStyle = '#2F8F83'; g.lineWidth = 6; g.stroke();
    g.fillStyle = ink; g.font = '800 42px Inter'; g.fillText(FRESH[0], 58, y + 54); g.fillStyle = '#2F8F83'; g.font = "700 30px 'JetBrains Mono'"; g.fillText(FRESH[1], 58, y + 100);
    g.globalAlpha = 1;
  }
}

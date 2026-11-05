// ───────────────────────── Video B through-object: THE POWER STRIP ─────────────────────────
// NOTE: reference code from a real reel. Word indices (wi(n)) refer to that reel's script; re-cue on your own words.json.
// A "Claude Code" power strip with four sockets. Each plugin is a physical plug on a cable that clicks into its
// socket; the socket LED lights red and the strip's meter fills. The metaphor: plugins literally plug in.
// Strip drawn at nominal 640×130 and scaled by `s`.
const STRIP_W = 640, STRIP_H = 130;
const STRIP_DOCK = { x: 60, y: 1560, s: 1 };               // where the strip sits at every cut (bottom-left, the presenter bottom-right)
const PLUG_NAMES = ['database', 'deploy', 'agent-crew', 'browser-tools'];
const plugIn = (t, i) => clamp((t - PLUGIN_DONE[i] + 0.25) / 0.25);   // 0 = hanging above, 1 = fully in (lands on PLUGIN_DONE[i])
const socketX = i => 262 + i * 110;                                    // socket centre x in strip space

// one plug (local coords: prongs point down, (0,0) = bottom centre of the plug body). o: { name, lit, s }
function plugHead(T, K, x, y, o = {}) {
  const s = o.s ?? 1;
  X([T, K], x, y, s, o.rot || 0, () => {
    fillRR(T, -30, -104, 70, 110, 16, '#8C8C8C');                        // halftone shadow
    [-14, 14].forEach(px => fillRR(K, px - 5, -4, 10, 30, 3, '#B9B6AE'));  // prongs
    fillRR(K, -38, -110, 76, 110, 16, C.ink);
    fillRR(K, -38, -110, 76, 20, 16, '#2A2B30');
    fillRR(K, -28, -70, 56, 6, 3, o.lit ? C.red : '#3A3B41');
    if (o.name) {
      const f = { font: F.mono, weight: 700, size: 15 }, nw = measure(K, o.name, f) + 20;
      fillRR(K, -nw / 2, -150, nw, 28, 8, '#FFFFFF'); strokeRR(K, -nw / 2, -150, nw, 28, 8, 'rgba(17,17,17,0.18)', 2);
      text(K, o.name, 0, -131, Object.assign({ color: C.ink }, f));
    }
  });
}
// the cable from a plug top curving up and out of frame (drawn in the caller's space)
// It keeps rising past its old end and dissolves between canvas y 830 and 620, so it never stops mid-air and never cuts the headline.
function plugCable(K, x0, y0, x1, y1) {
  K.save(); K.lineCap = 'round';
  const m = K.getTransform(), ly = Y => (Y - m.f - m.b * x1) / m.d;   // local y of a canvas y
  const g = K.createLinearGradient(0, ly(830), 0, ly(620)); g.addColorStop(0, C.ink); g.addColorStop(1, 'rgba(17,17,17,0)');
  K.strokeStyle = g; K.lineWidth = 10;
  K.beginPath(); K.moveTo(x0, y0); K.bezierCurveTo(x0, y0 - 160, x1, y1 + 220, x1, y1); K.lineTo(x1, Math.min(y1, ly(600))); K.stroke();
  K.restore();
}
// o: { t, p: [p0..p3] (plug-in progress, default from PLUGIN_DONE), cables: true, names: true }
function powerStrip(T, K, x, y, s = 1, o = {}) {
  const t = o.t ?? 0, p = o.p || [0, 1, 2, 3].map(i => plugIn(t, i));
  X([T, K], x, y, s, 0, () => {
    const w = STRIP_W, h = STRIP_H;
    // plugs + cables first (behind the strip face? no — plugs sit on top of the sockets)
    T.save(); T.shadowColor = 'rgba(0,0,0,0.45)'; T.shadowBlur = 40; T.shadowOffsetY = 22; fillRR(T, 0, 0, w, h, 34, '#FFFFFF'); T.restore();
    fillRR(K, 0, 0, w, h, 34, '#F4F2EC'); strokeRR(K, 0, 0, w, h, 34, C.ink, 5);
    // label + master LED + meter
    const on = p.filter(v => v > 0.99).length;
    circle(K, 44, 44, 11, on ? C.red : '#D6D2C9', C.ink, 3);
    text(K, 'CLAUDE CODE', 66, 50, { font: F.mono, weight: 700, size: 17, color: C.ink, align: 'left' });
    text(K, `${on}/4`, 66, 90, { font: F.mono, weight: 700, size: 26, color: on ? C.red : '#9A968D', align: 'left' });
    // sockets
    [0, 1, 2, 3].forEach(i => {
      const sx = socketX(i), sy = h / 2 + 6;
      fillRR(K, sx - 42, sy - 42, 84, 84, 18, '#E7E4DC'); strokeRR(K, sx - 42, sy - 42, 84, 84, 18, C.ink, 3);
      [-14, 14].forEach(px => fillRR(K, sx + px - 5, sy - 14, 10, 28, 3, C.ink));
      const lit = p[i] > 0.99;
      circle(K, sx + 30, sy - 30, 5, lit ? C.red : '#C9C5BC');
    });
    // plugs (seated plugs sit in the socket; hanging ones float above with their cable)
    [0, 1, 2, 3].forEach(i => {
      if (p[i] <= 0) return;
      const sx = socketX(i), sy = h / 2 + 6, drop = (1 - E.outBack(p[i])) * 260;
      const py = sy - 8 - drop;
      if (o.cables !== false) plugCable(K, sx, py - 110, sx + 60 + i * 30, -900);
      plugHead(T, K, sx, py, { name: o.names === false ? null : PLUG_NAMES[i], lit: p[i] > 0.99, s: 0.62 });
    });
  });
}

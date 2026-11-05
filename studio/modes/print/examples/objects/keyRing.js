// ── OUR PROP · KEY RING: a ring hanging on a string; keys drop onto it one by one, then the named ones turn red and fall off.
// Story it tells: access you've handed out ("every app you gave your password to"), things that pile up on one owner,
// or a set you thin out one by one.
// How it moves:
//   · the ring drops in on its string and swings (pendulum, slowly dying)
//   · each key drops onto the ring in 0.2 s and knocks its neighbours (they rock ±4°, settling over ~0.7 s); the ×n badge ticks
//   · redAt: a key turns accent as it is named · offAt: it slips off the ring and falls, turning, out of frame
// Idle life: a ±1° sway that never stops, keys swinging a beat behind the ring.
// Loading: not part of the engine; the props showcase (examples/props-reel) loads it.

// o: { keys: [{ label, sub, redAt, offAt }], arriveAt: [t, …], ringAt = first key - 0.4, string = 180 (px above the ring), s = 1 }
function keyRing(T, K, x, y, t, o = {}) {
  const { keys = [], arriveAt = [], string = 180, s = 1 } = o;
  const ringAt = o.ringAt ?? (arriveAt.length ? arriveAt[0] - 0.4 : 0);
  if (t < ringAt) return;
  const R = 90, drop = -900 * (1 - E.outCubic(clamp((t - ringAt) / 0.3)));
  const sway = pendulum(t - ringAt - 0.3, 8, 0.9, 1.4) + Math.sin(t * 1.6) * 1;
  const n = keys.length;
  const on = keys.filter((k, j) => t >= (arriveAt[j] ?? 0) && !(k.offAt != null && t >= k.offAt)).length;
  X([T, K], x, y + drop, s, 0, () => {
    // a short string from a hook, so it stays out of the caption zone
    line(K, 0, -R - 40 - string, 0, -R - 40, C.ink, 5);
    fillRR(K, -40, -R - 52 - string, 80, 14, 7, C.ink);
    X([T, K], 0, -R - 40, 1, sway, () => {
      // clip, ring
      fillRR(K, -16, -10, 32, 44, 8, '#B9BEC6'); strokeRR(K, -16, -10, 32, 44, 8, C.ink, 4);
      T.beginPath(); T.arc(10, R + 52, R, 0, TAU); Object.assign(T, { strokeStyle: C.k45, lineWidth: 16 }); T.stroke();   // print shadow
      K.beginPath(); K.arc(0, R + 40, R, 0, TAU); Object.assign(K, { strokeStyle: C.ink, lineWidth: 16 }); K.stroke();
      K.beginPath(); K.arc(0, R + 40, R, 0, TAU); Object.assign(K, { strokeStyle: '#C9CED4', lineWidth: 8 }); K.stroke();
      K.beginPath(); K.arc(0, R + 40, R, 3.6, 4.4); Object.assign(K, { strokeStyle: '#FFFFFF', lineWidth: 4 }); K.stroke();
      // keys hang from the bottom of the ring, fanned
      keys.forEach((key, j) => {
        const at = arriveAt[j] ?? 0; if (t < at) return;
        const fan = (j - (n - 1) / 2) * 30;
        const knock = arriveAt.reduce((m, a, i) => (i === j || t < a ? m : m + Math.sign(j - i) * 4 * ring(t - a, 1.6, 4)), 0);
        const fall = key.offAt != null && t >= key.offAt ? gravityFall(t, key.offAt, (j - n / 2) * 80, -200, (j % 2 ? 1 : -1) * 240) : null;
        if (fall && fall.dy > 2400) return;
        const dIn = -120 * (1 - E.outCubic(clamp((t - at) / 0.2)));
        const ang = fan + knock + Math.sin(t * 1.6 - 0.6 - j) * 1.5 - sway * 0.4;
        const hot = key.redAt != null && t >= key.redAt;
        X([T, K], fall ? fall.dx : 0, R * 2 + 30 + dIn + (fall ? fall.dy : 0), 1, ang + (fall ? fall.r : 0), () => krKey(T, K, key, hot, t - (key.redAt ?? 1e9), ang + sway + (fall ? fall.r : 0)));
      });
    });
    if (on > 0) {
      const last = Math.max(...arriveAt.filter(a => t >= a), ...keys.map(k => (k.offAt != null && t >= k.offAt ? k.offAt : -9)));
      X([K], R + 70, -R - 20, 1 + ring(t - last, 4, 8) * 0.25, 0, () => {
        circle(K, 0, 0, 40, C.red, C.ink, 4);
        text(K, '×' + on, 0, 13, { font: F.anton, size: 40, color: '#FFFFFF' });
      });
    }
  });
}

// one key hanging from its top: a round bow, a shaft, teeth, and a label tag on a short loop under the tip (kept level, so it reads)
function krKey(T, K, key, hot, dHot, tilt) {
  const col = hot ? C.red : '#D9DDE2', len = 230;
  fillRR(T, -24 + 10, 0 + 12, 48, len, 10, C.k45);
  circle(K, 0, 46, 46, col, C.ink, 5); circle(K, 0, 20, 12, '#FFFFFF', C.ink, 4);
  fillRR(K, -14, 88, 28, len - 60, 4, col); strokeRR(K, -14, 88, 28, len - 60, 4, C.ink, 4);
  polyPath(K, [[14, len - 70], [34, len - 64], [34, len - 48], [22, len - 44], [34, len - 36], [34, len - 22], [14, len - 18]]);
  Object.assign(K, { fillStyle: col, strokeStyle: C.ink, lineWidth: 4, lineJoin: 'round' }); K.fill(); K.stroke();
  line(K, -4, 100, -4, len - 40, hot ? C.redD : '#B9BEC6', 4);
  const k = hot ? 1 + ring(dHot, 4, 8) * 0.2 : 1;
  line(K, 0, len - 14, 0, len + 22, C.ink, 3);
  X([K], 0, len + 44, k, -tilt * 0.85, () => {
    const tw = Math.max(110, key.label.length * 22 + 30);
    fillRR(K, -tw / 2, -22, tw, 44, 10, hot ? C.ink : CARD); strokeRR(K, -tw / 2, -22, tw, 44, 10, C.ink, 4);
    text(K, key.label, 0, 12, { font: F.anton, size: 32, color: hot ? '#FFFFFF' : C.ink, ls: 1 });
    if (key.sub) text(K, key.sub, 0, 48, { font: F.mono, weight: 700, size: 18, color: '#6E6A63' });
  });
}

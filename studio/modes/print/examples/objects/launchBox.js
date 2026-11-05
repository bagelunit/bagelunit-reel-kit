// ── OUR PROP · LAUNCH BOX: a premium white product box. It drops in, a pill slams onto the lid, the lid springs off and a
// product card rises out of it, grows, overshoots and settles.
// Story it tells: "it just launched", "here's what's inside", unboxing a release, a tool, a template, a freebie.
// How it moves:
//   · dropAt: it falls from above with a squash on landing and dust ticks at the contact
//   · stampAt: the accent pill slams onto the lid (oversized → 1 with a ring)
//   · openAt: the lid lifts on a spring, then flies off up-right, turning; ink ticks burst from the opening
//   · the card rises out small 0.2 s later, grows past full size and settles; its slot chips pop in one by one
// Idle life: the card floats ±4 px and its header dot blinks.
// Loading: not part of the engine; the props showcase (examples/props-reel) loads it.

// o: { word = 'NEW', sub, pill = 'new', dropAt, stampAt, openAt, card: { title, pill, files: [], slots: [] }, w = 440, s = 1 }
function launchBox(T, K, x, y, t, o = {}) {
  const { word = 'NEW', sub = 'version 1.0', pill = 'new', dropAt = 0, stampAt = null, openAt = null, w = 440, s = 1 } = o;
  const cardO = o.card || {};
  if (t < dropAt) return;
  const W = w, BH = W * 0.72, DX = W * 0.14, DY = W * 0.11;
  const fallP = clamp((t - dropAt) / 0.28);
  const dy = -760 * (1 - E.inCubic(fallP));
  const land = t - dropAt - 0.28;
  const squash = land > 0 ? ring(land, 3.4, 7) * 0.08 : 0;
  X([T, K], x, y + dy, s, 0, () => {
    K.save(); T.save();
    K.scale(1 + squash, 1 - squash); T.scale(1 + squash, 1 - squash);
    const L = -W / 2, Bt = -BH;
    // the card rises out of the box first, so the box front covers its lower part
    if (openAt != null) lbCard(T, K, t, openAt + 0.2, L + W / 2, Bt, W, cardO);
    // base: shadow, side (grey, prints as line screen), front, the dark opening once the lid is off
    fillRR(T, L + 24, Bt + 26, W + DX, BH, 10, C.k60);
    T.beginPath(); T.moveTo(L + W, Bt); T.lineTo(L + W + DX, Bt - DY); T.lineTo(L + W + DX, -DY); T.lineTo(L + W, 0); T.closePath(); T.fillStyle = C.k30; T.fill();
    K.beginPath(); K.moveTo(L + W, Bt); K.lineTo(L + W + DX, Bt - DY); K.lineTo(L + W + DX, -DY); K.lineTo(L + W, 0); K.closePath(); Object.assign(K, { strokeStyle: C.ink, lineWidth: 5, lineJoin: 'round' }); K.stroke();
    const open = openAt != null && t >= openAt;
    if (open) { K.beginPath(); K.moveTo(L, Bt); K.lineTo(L + DX, Bt - DY); K.lineTo(L + W + DX, Bt - DY); K.lineTo(L + W, Bt); K.closePath(); K.fillStyle = C.ink; K.fill(); }
    fillRR(T, L, Bt, W, BH, 6, '#FFFFFF'); strokeRR(K, L, Bt, W, BH, 6, C.ink, 5);
    fillRR(K, L + W / 2 - 34, Bt + BH * 0.62, 68, 18, 5, C.red);
    text(K, sub, L + W / 2, Bt + BH * 0.9, { font: F.mono, weight: 700, size: 22, color: '#8a8780' });
    // lid: on the box, then lifting on a spring and flying away up-right
    const lu = open ? t - openAt : -1;
    const lift = lu < 0 ? 0 : lu < 0.22 ? -60 * spring(lu, 3, 0.5) : -60 - 2600 * (lu - 0.22) * (lu - 0.22) - 900 * (lu - 0.22);
    const lx = lu < 0.22 ? 0 : 1300 * (lu - 0.22), lr = lu < 0.22 ? 0 : 140 * (lu - 0.22);
    if (lu < 1.2) X([T, K], lx, lift, 1, lr, () => lbLid(T, K, t, L, Bt, W, BH, DX, DY, word, pill, stampAt));
    if (open) burst(K, L + W / 2 + DX / 2, Bt - DY / 2, lu, { n: 14, r0: 60, r1: 260, color: C.ink, lw: 7, dur: 0.35 });
    K.restore(); T.restore();
  });
  if (land >= 0 && land < 0.3) burst(K, x, y + 6, land, { n: 10, r0: W * 0.5, r1: W * 0.75, color: C.ink, lw: 5, dur: 0.26, rot: 0.3 });
}

function lbLid(T, K, t, L, Bt, W, BH, DX, DY, word, pill, stampAt) {
  const LH = BH * 0.42, lt = Bt - LH * 0.62, ext = 8;
  // lid top face (3/4 view) and its front band, a touch wider than the base
  T.beginPath(); T.moveTo(L - ext, lt); T.lineTo(L - ext + DX, lt - DY); T.lineTo(L + W + ext + DX, lt - DY); T.lineTo(L + W + ext, lt); T.closePath(); T.fillStyle = C.k10; T.fill();
  K.beginPath(); K.moveTo(L - ext, lt); K.lineTo(L - ext + DX, lt - DY); K.lineTo(L + W + ext + DX, lt - DY); K.lineTo(L + W + ext, lt); K.closePath(); Object.assign(K, { strokeStyle: C.ink, lineWidth: 5, lineJoin: 'round' }); K.stroke();
  T.beginPath(); T.moveTo(L + W + ext, lt); T.lineTo(L + W + ext + DX, lt - DY); T.lineTo(L + W + ext + DX, lt - DY + LH); T.lineTo(L + W + ext, lt + LH); T.closePath(); T.fillStyle = C.k30; T.fill();
  K.beginPath(); K.moveTo(L + W + ext, lt); K.lineTo(L + W + ext + DX, lt - DY); K.lineTo(L + W + ext + DX, lt - DY + LH); K.lineTo(L + W + ext, lt + LH); K.closePath(); K.stroke();
  fillRR(T, L - ext, lt, W + 2 * ext, LH, 6, '#FFFFFF'); strokeRR(K, L - ext, lt, W + 2 * ext, LH, 6, C.ink, 5);
  text(K, word, L + W / 2, lt + LH * 0.72, { font: F.anton, size: LH * 0.62, color: C.ink, ls: 10 });
  if (!pill) return;
  const dt = stampAt == null ? 1 : t - stampAt; if (dt < 0) return;
  const k = dt < 0.12 ? lerp(2.2, 1, E.inQuart(dt / 0.12)) : 1 + ring(dt - 0.12, 5, 12) * 0.06;
  X([K], L + W - 20, lt - 8, k, 8, () => {
    fillRR(K, -58, -24, 116, 48, 24, C.red); strokeRR(K, -58, -24, 116, 48, 24, C.ink, 4);
    text(K, pill.toUpperCase(), 0, 11, { font: F.anton, size: 32, color: '#FFFFFF', ls: 3 });
  });
}
// the product card that rises out of the box: header strip, title + pill, a file line, slot chips
function lbCard(T, K, t, at, cx, top, W, c) {
  const u = t - at; if (u < 0) return;
  const { title = 'your-product', pill = 'new', files = ['README.md', 'setup.json'], slots = ['fast', 'free', 'yours'] } = c;
  const CW = W * 1.32, CH = CW * 0.62;
  const k = lerp(0.3, 1, Math.min(1.08, spring(u, 1.8, 0.45)));
  const rise = lerp(0, -CH - 70, Math.min(1.05, spring(u, 1.6, 0.5))) + Math.sin(t * 2.2) * 4;
  // the crisp layer always prints over the tone layer, so the box front can't hide the card: clip it to the opening instead
  [T, K].forEach(c => { c.save(); c.beginPath(); c.rect(-3000, -5000, 6000, 5000 + top); c.clip(); });
  X([T, K], cx, top + rise + CH / 2, k, -2 * ring(u, 1.5, 3), () => {
    const L = -CW / 2, Tp = -CH / 2;
    card(T, K, L, Tp, CW, CH, { r: 22, sh: 20, lw: 5 });
    fillRR(T, L + CW - 40, Tp, 40, CH, 0, C.k20);
    fillRR(K, L + 4, Tp + 4, CW - 8, 52, 18, '#F6E1D9'); line(K, L, Tp + 56, L + CW, Tp + 56, C.ink, 4);
    circle(K, L + 32, Tp + 30, 9, Math.sin(t * 5) > 0 ? C.red : C.redD);
    text(K, 'shop.example.com', L + 54, Tp + 38, { font: F.mono, weight: 700, size: 20, color: '#8a8780', align: 'left' });
    fillRR(K, L + 28, Tp + 82, 70, 70, 14, C.red); strokeRR(K, L + 28, Tp + 82, 70, 70, 14, C.ink, 4);
    text(K, title.slice(0, 1).toUpperCase(), L + 63, Tp + 134, { font: F.anton, size: 52, color: '#FFFFFF' });
    text(K, title, L + 118, Tp + 132, { font: F.grot, weight: 800, size: 44, color: C.ink, align: 'left' });
    fillRR(K, L + CW - 122, Tp + 92, 90, 40, 20, C.red);
    text(K, pill.toUpperCase(), L + CW - 77, Tp + 121, { font: F.anton, size: 26, color: '#FFFFFF', ls: 2 });
    text(K, files.join('  ·  '), L + 28, Tp + 192, { font: F.mono, weight: 700, size: 22, color: '#6E6A63', align: 'left' });
    slots.forEach((sl, j) => {
      const m = Math.min(1.1, pop(u - 0.3 - j * 0.12, 3.4, 0.5)); if (m <= 0) return;
      const sw = (CW - 56 - 2 * 16) / 3, sx = L + 28 + j * (sw + 16) + sw / 2;
      X([K], sx, Tp + CH - 62, m, 0, () => {
        fillRR(K, -sw / 2, -26, sw, 52, 12, '#FFFFFF'); strokeRR(K, -sw / 2, -26, sw, 52, 12, C.ink, 4);
        text(K, sl, 0, 9, { font: F.grot, weight: 800, size: 24, color: C.ink });
      });
    });
  });
  [T, K].forEach(c => c.restore());
}

// ───────────────────────── casino props (shared by every scene; loaded first) ─────────────────────────
// Every prop draws around its own origin, shadows and shade sides on T (they print as the engraved line screen: greys = ink lines,
// '#00FF00' = the navy second ink), crisp outlines, type and flat fills on K. All are pure functions of t.
const CZ_GREEN = '#00FF00';                                            // tone-layer code for the navy second ink
const CZ_NAVY = () => THEME.ink2;                                      // the same navy as a crisp K fill
const CZ_GOLD = '#F4C95D';

// a wall clock: ink rim, card face, 12 ticks, four numerals, hour + minute hands and an accent second hand. spin = extra turns
function czClock(T, K, x, y, r, t, o = {}) {
  const spin = o.spin || 0, sec = (o.sec ?? t) * 1.0;
  circle(T, x + r * 0.12, y + r * 0.14, r * 1.04, C.k60);
  circle(K, x, y, r * 1.04, C.ink);
  circle(K, x, y, r * 0.9, CARD);
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU, big = i % 3 === 0, r0 = r * (big ? 0.7 : 0.76);
    line(K, x + Math.sin(a) * r0, y - Math.cos(a) * r0, x + Math.sin(a) * r * 0.84, y - Math.cos(a) * r * 0.84, C.ink, big ? r * 0.06 : r * 0.03);
  }
  if (!o.noNumbers) [['12', 0], ['3', 3], ['6', 6], ['9', 9]].forEach(([n, i]) => {
    const a = i / 12 * TAU; text(K, n, x + Math.sin(a) * r * 0.52, y - Math.cos(a) * r * 0.52 + r * 0.1, { font: F.anton, size: r * 0.28 });
  });
  if (o.noHands) return;
  const hA = (2.3 + spin / 12 + sec / 3000) * TAU, mA = (0.62 + spin + sec / 60) * TAU, sA = (sec + spin * 60) / 60 * TAU * 1;
  line(K, x, y, x + Math.sin(hA) * r * 0.42, y - Math.cos(hA) * r * 0.42, C.ink, r * 0.08);
  line(K, x, y, x + Math.sin(mA) * r * 0.66, y - Math.cos(mA) * r * 0.66, C.ink, r * 0.055);
  line(K, x - Math.sin(sA) * r * 0.14, y + Math.cos(sA) * r * 0.14, x + Math.sin(sA) * r * 0.74, y - Math.cos(sA) * r * 0.74, C.red, r * 0.025);
  circle(K, x, y, r * 0.07, C.red);
}

// a chasing marquee bulb row from (x0, y0) to (x1, y1): every 4th bulb lit, the pattern runs at `speed` bulbs per second
function czBulbs(K, x0, y0, x1, y1, n, t, o = {}) {
  const r = o.r || 9, speed = o.speed ?? 8;
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 0 : i / (n - 1), x = lerp(x0, x1, k), y = lerp(y0, y1, k), on = (i + Math.floor(t * speed)) % 4 === 0;
    circle(K, x, y, r + 3, C.ink); circle(K, x, y, r, on ? CZ_GOLD : '#6E6A62');
    if (on) circle(K, x - r * 0.3, y - r * 0.3, r * 0.3, '#FFF6D8');
  }
}

// the casino front: stone walls with a shaded side, an accent cornice, the CASINO marquee with chasing bulbs, two glass doors that
// breathe light, steps, a swinging OPEN 24/7 tag and a security dome that sweeps the doors. Local box -380..380 × -330..300
function czFacade(T, K, t) {
  // walls (shade side + pilasters on T: they print as engraved lines)
  card(T, K, -380, -250, 760, 520, { r: 14, sh: 22, lw: 6 });
  fillRR(T, 250, -250, 130, 520, 14, C.k20);
  for (const px of [-300, 300]) { fillRR(T, px - 26, -250, 52, 520, 0, C.k10); line(K, px - 26, -238, px - 26, 262, C.ink, 3); line(K, px + 26, -238, px + 26, 262, C.ink, 3); }
  // cornice
  fillRR(K, -410, -300, 820, 62, 12, C.red); strokeRR(K, -410, -300, 820, 62, 12, C.ink, 6);
  for (let i = 0; i < 14; i++) fillRR(K, -390 + i * 56, -250, 30, 16, 3, C.ink);
  // marquee
  const mx = -250, my = -200, mw = 500, mh = 170;
  fillRR(T, mx + 16, my + 18, mw, mh, 18, C.k70);
  fillRR(K, mx, my, mw, mh, 18, C.ink);
  czBulbs(K, mx + 26, my + 22, mx + mw - 26, my + 22, 13, t, { r: 9 });
  czBulbs(K, mx + 26, my + mh - 22, mx + mw - 26, my + mh - 22, 13, t + 0.25, { r: 9 });
  letters(K, 'CASINO', 0, my + 118, { font: F.anton, size: 104, ls: 8 }, (i) => ({ c: (Math.floor(t * 3) + i) % 6 === 0 ? CZ_GOLD : C.red, dy: Math.sin(t * 6 + i) * 2 }));
  // doors
  for (const s of [-1, 1]) {
    const dx = s * 70, open = 0;
    fillRR(K, dx - 66 + s * open, 20, 132, 228, 10, C.ink);
    const gl = 0.5 + 0.5 * Math.sin(t * 4 + s);
    fillRR(K, dx - 52, 34, 104, 200, 6, `rgba(244,201,93,${0.55 + 0.25 * gl})`);
    line(K, dx - s * 34, 110, dx - s * 34, 170, C.ink, 9);
  }
  fillRR(K, -170, -2, 340, 22, 6, C.ink);
  // steps
  fillRR(T, -230, 262, 460, 34, 8, C.k30); strokeRR(K, -230, 262, 460, 34, 8, C.ink, 5);
  fillRR(K, -190, 248, 380, 20, 6, C.red); strokeRR(K, -190, 248, 380, 20, 6, C.ink, 4);
  // OPEN 24/7 tag swinging on the left door
  X([T, K], -150, 60, 1, Math.sin(t * 3.4) * 7, () => {
    line(K, -26, 0, 0, -24, C.ink, 3); line(K, 26, 0, 0, -24, C.ink, 3);
    fillRR(T, -54 + 6, 6, 108, 46, 8, C.k50); fillRR(K, -54, 0, 108, 46, 8, CARD); strokeRR(K, -54, 0, 108, 46, 8, C.ink, 3);
    text(K, 'OPEN 24/7', 0, 32, { font: F.voice, size: 21, color: C.red });
  });
  // security dome, top-left of the wall
  const cx = -300, cy = -170, sw = Math.sin(t * 1.6) * 26;
  fillRR(K, cx - 46, cy - 16, 92, 22, 6, C.ink);
  X([T, K], cx, cy + 6, 1, sw, () => {
    T.save(); T.fillStyle = 'rgba(0,0,0,0.18)'; T.beginPath(); T.moveTo(0, 30); T.lineTo(-70, 210); T.lineTo(70, 210); T.closePath(); T.fill(); T.restore();
    circle(K, 0, 16, 34, '#3A3D46', C.ink, 4); circle(K, 0, 22, 13, C.ink); circle(K, -9, 12, 6, 'rgba(255,255,255,0.6)');
  });
  circle(K, cx + 34, cy - 6, 6, Math.floor(t * 2.5) % 2 ? C.red : '#5A2A20');
}

// a picture frame on the wall (w × h, top-left at x, y) hung from a nail: ink moulding, card mat, and one of three insides.
// kind 'clock': an empty hook and the pale ring where a clock was · 'window': sky, a cloud, shutters that slam shut at o.shutAt
// · 'sun': a sun that sinks under the sill at o.setAt, the sky going navy behind it, then neon OPEN 24/7 buzzing on at o.neonAt
function czFrame(T, K, x, y, w, h, kind, t, o = {}) {
  line(K, x + w / 2 - 46, y + 2, x + w / 2, y - 40, C.ink, 3); line(K, x + w / 2 + 46, y + 2, x + w / 2, y - 40, C.ink, 3); circle(K, x + w / 2, y - 40, 7, C.ink);
  fillRR(T, x + 14, y + 16, w, h, 10, C.k60);
  fillRR(K, x, y, w, h, 10, C.ink);
  const ix = x + 18, iy = y + 18, iw = w - 36, ih = h - 36;
  K.save(); rr(K, ix, iy, iw, ih, 4); K.clip();
  T.save(); rr(T, ix, iy, iw, ih, 4); T.clip();
  if (kind === 'clock') {
    fillRR(K, ix, iy, iw, ih, 0, '#EAE5DB');
    fillRR(T, ix, iy, iw, ih, 0, C.k10);
    circle(K, ix + iw / 2, iy + ih / 2 + 16, iw * 0.34, '#DCD6CA');
    line(K, ix + iw / 2 - 34, iy + ih / 2 - 46, ix + iw / 2, iy + 26, C.ink, 4); line(K, ix + iw / 2 + 34, iy + ih / 2 - 46, ix + iw / 2, iy + 26, C.ink, 4);
    circle(K, ix + iw / 2, iy + 26, 9, C.ink);
  } else if (kind === 'window') {
    fillRR(K, ix, iy, iw, ih, 0, '#BFD7EA');
    const cx = ix + iw * 0.35 + Math.sin(t * 0.8) * 16;
    for (const [dx, dy, r] of [[0, 0, 26], [28, 6, 22], [-26, 8, 20]]) circle(K, cx + dx, iy + ih * 0.32 + dy, r, '#FFFFFF');
    line(K, ix + iw / 2, iy, ix + iw / 2, iy + ih, C.ink, 6); line(K, ix, iy + ih / 2, ix + iw, iy + ih / 2, C.ink, 6);
    const shut = clamp(spring(t - (o.shutAt ?? 1e9), 3.2, 0.5));
    if (shut > 0) for (const s of [0, 1]) {
      const sw = iw / 2 * shut, sx = s ? ix + iw - sw : ix;
      fillRR(K, sx, iy, sw, ih, 0, '#5B4636');
      for (let k = 0; k < 9; k++) line(K, sx + 4, iy + 14 + k * (ih / 9), sx + sw - 4, iy + 14 + k * (ih / 9), '#2F241B', 4);
      fillRR(T, sx, iy, sw, ih, 0, C.k40);
    }
  } else if (kind === 'sun') {
    const set = E.inOutCubic(P(t, o.setAt ?? 1e9, 0.5)), dark = set;
    fillRR(K, ix, iy, iw, ih, 0, `rgb(${Math.round(lerp(255, 30, dark))},${Math.round(lerp(214, 42, dark))},${Math.round(lerp(150, 68, dark))})`);
    if (dark > 0.3) fillRR(T, ix, iy, iw, ih, 0, CZ_GREEN);
    const sy = iy + ih * 0.5 + set * ih * 0.65;
    circle(K, ix + iw / 2, sy, iw * 0.24, C.red);
    for (let k = 0; k < 10; k++) { const a = k / 10 * TAU + t * 0.6; line(K, ix + iw / 2 + Math.cos(a) * iw * 0.3, sy + Math.sin(a) * iw * 0.3, ix + iw / 2 + Math.cos(a) * iw * 0.38, sy + Math.sin(a) * iw * 0.38, C.red, 6); }
    fillRR(K, ix, iy + ih * 0.78, iw, ih * 0.22, 0, '#3B5B44');
    if (t > (o.neonAt ?? 1e9)) {
      const fl = t < o.neonAt + 0.5 ? (Math.floor(t * 24) % 3 ? 1 : 0.25) : 0.85 + 0.15 * Math.sin(t * 9);
      K.save(); K.globalAlpha *= fl;
      strokeRR(K, ix + 14, iy + ih * 0.32, iw - 28, 74, 37, CZ_GOLD, 6);
      text(K, 'OPEN 24/7', ix + iw / 2, iy + ih * 0.32 + 52, { font: F.anton, size: 44, color: CZ_GOLD, ls: 3 });
      K.restore();
    }
  }
  K.restore(); T.restore();
  strokeRR(K, ix, iy, iw, ih, 4, C.ink, 4);
}

// a wristwatch, face radius r: navy strap with holes, steel case with a crown, card face; spin = extra turns (racing hands);
// from goneAt its numerals fly off one by one, then the hands fade: a blank face
function czWatch(T, K, x, y, r, t, o = {}) {
  const gone = o.goneAt ?? 1e9;
  for (const s of [-1, 1]) {
    fillRR(T, x - r * 0.55 + 16, y + s * r * 0.7 - (s < 0 ? r * 1.25 : 0) + 18, r * 1.1, r * 1.25, r * 0.2, C.k60);
    fillRR(K, x - r * 0.55, y + s * r * 0.7 - (s < 0 ? r * 1.25 : 0), r * 1.1, r * 1.25, r * 0.2, CZ_NAVY());
    strokeRR(K, x - r * 0.55, y + s * r * 0.7 - (s < 0 ? r * 1.25 : 0), r * 1.1, r * 1.25, r * 0.2, C.ink, 5);
    if (s > 0) for (let k = 0; k < 3; k++) circle(K, x, y + r * 1.2 + k * r * 0.24, r * 0.05, C.ink);
  }
  circle(T, x + r * 0.12, y + r * 0.14, r * 1.12, C.k70);
  fillRR(K, x + r * 1.02, y - r * 0.14, r * 0.2, r * 0.28, 5, '#9A968E'); strokeRR(K, x + r * 1.02, y - r * 0.14, r * 0.2, r * 0.28, 5, C.ink, 4);
  circle(K, x, y, r * 1.12, '#C9C5BC', C.ink, 6);
  circle(K, x, y, r * 0.96, CARD, C.ink, 4);
  fillRR(T, x - r * 0.96, y, r * 1.92, r * 0.96, 0, 'rgba(0,0,0,0)');
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU, t0 = gone + i * 0.035;
    let dx = 0, dy = 0, rot = 0, on = true;
    if (t > t0) { const g = gravityFall(t, t0, Math.sin(a) * 520, -420 - (i % 3) * 120, (i % 2 ? 1 : -1) * 7); dx = g.dx; dy = g.dy; rot = g.r; on = g.on !== false && dy < 1600; }
    if (!on) continue;
    const nx = x + Math.sin(a) * r * 0.72 + dx, ny = y - Math.cos(a) * r * 0.72 + dy;
    X([K], nx, ny, 1, rot * 57, () => text(K, String(i || 12), 0, r * 0.1, { font: F.anton, size: r * 0.26, color: i === 0 ? C.red : C.ink }));
  }
  const fade = 1 - clamp((t - gone - 0.45) / 0.2);
  if (fade <= 0) { if (o.blankMark !== false && t > gone + 0.6) text(K, '?', x, y + r * 0.22, { font: F.anton, size: r * 0.7, color: '#D8D2C6' }); return; }
  const spin = o.spin || 0;
  K.save(); K.globalAlpha *= fade;
  const hA = (0.3 + spin / 12) * TAU, mA = (0.05 + spin) * TAU;
  line(K, x, y, x + Math.sin(hA) * r * 0.42, y - Math.cos(hA) * r * 0.42, C.ink, r * 0.08);
  line(K, x, y, x + Math.sin(mA) * r * 0.68, y - Math.cos(mA) * r * 0.68, C.ink, r * 0.05);
  circle(K, x, y, r * 0.07, C.red);
  K.restore();
}

// a poker chip seen from the top: coloured disc, 8 white edge inserts, a dashed inner ring and a value; spin squashes it (flipping)
function czChip(K, x, y, r, col, o = {}) {
  const sq = Math.abs(Math.cos(o.spin || 0)) * 0.85 + 0.15;
  K.save(); K.translate(x, y); K.scale(1, sq);
  circle(K, 0, 0, r, col, C.ink, 4);
  for (let i = 0; i < 8; i++) { K.save(); K.rotate(i / 8 * TAU); fillRR(K, -r * 0.13, -r * 0.98, r * 0.26, r * 0.26, 3, '#FFFFFF'); K.restore(); }
  K.setLineDash([r * 0.16, r * 0.12]); circle(K, 0, 0, r * 0.66, null, '#FFFFFF', 3); K.setLineDash([]);
  if (o.text) text(K, o.text, 0, r * 0.18, { font: F.anton, size: r * 0.5, color: '#FFFFFF' });
  K.restore();
}
// a chip stack seen at an angle: n chips from the bottom (x, y = bottom centre), edge stripes, a shade side on T. Returns the top y
function czStack(T, K, x, y, n, col, r = 70) {
  const h = r * 0.3;
  fillRR(T, x - r + 18, y - n * h + 10, r * 2, n * h + 14, r * 0.4, C.k50);
  for (let i = 0; i < n; i++) {
    const cy = y - i * h;
    K.save(); K.translate(x, cy); K.scale(1, 0.34);
    circle(K, 0, 0, r, col, C.ink, 10);
    K.restore();
    fillRR(K, x - r, cy - h, r * 2, h, 0, col);
    for (let k = 0; k < 5; k++) fillRR(K, x - r + 8 + k * (r * 2 - 16) / 4.6, cy - h + 4, r * 0.16, h - 8, 2, '#FFFFFF');
    line(K, x - r, cy - h, x - r, cy, C.ink, 4); line(K, x + r, cy - h, x + r, cy, C.ink, 4);
  }
  const ty = y - n * h;
  K.save(); K.translate(x, ty); K.scale(1, 0.34);
  circle(K, 0, 0, r, col, C.ink, 10);
  K.setLineDash([r * 0.2, r * 0.14]); circle(K, 0, 0, r * 0.62, null, '#FFFFFF', 8); K.setLineDash([]);
  K.restore();
  return ty;
}

// slot-machine reel symbols, drawn at size s around (x, y): 0 a seven · 1 BAR · 2 a bell · 3 cherries
function czSymbol(K, kind, x, y, s) {
  if (kind === 0) text(K, '7', x, y + 34 * s, { font: F.anton, size: 104 * s, color: C.red, slw: 6 * s, stroke: C.ink });
  else if (kind === 1) { fillRR(K, x - 50 * s, y - 22 * s, 100 * s, 44 * s, 8 * s, C.ink); text(K, 'BAR', x, y + 13 * s, { font: F.anton, size: 36 * s, color: '#FFFFFF' }); }
  else if (kind === 2) { circle(K, x, y + 2 * s, 30 * s, CZ_GOLD, C.ink, 4 * s); fillRR(K, x - 36 * s, y + 16 * s, 72 * s, 14 * s, 5 * s, CZ_GOLD); strokeRR(K, x - 36 * s, y + 16 * s, 72 * s, 14 * s, 5 * s, C.ink, 4 * s); circle(K, x, y + 38 * s, 8 * s, C.ink); }
  else { line(K, x - 16 * s, y + 6 * s, x + 6 * s, y - 34 * s, '#2F7D4F', 6 * s); line(K, x + 18 * s, y + 8 * s, x + 6 * s, y - 34 * s, '#2F7D4F', 6 * s); circle(K, x - 18 * s, y + 18 * s, 20 * s, C.red, C.ink, 4 * s); circle(K, x + 20 * s, y + 20 * s, 20 * s, C.red, C.ink, 4 * s); }
}

// a guest walking into the casino: a little suited figure (head, navy jacket, legs that scissor), seen from behind, shrinking
// toward the doors. s = scale, ph = walk phase
function czGuest(T, K, x, y, s, ph, col) {
  X([T, K], x, y, s, Math.sin(ph) * 3, () => {
    T.fillStyle = 'rgba(0,0,0,0.35)'; T.beginPath(); T.ellipse(0, 4, 34, 9, 0, 0, TAU); T.fill();
    const sw = Math.sin(ph) * 14;
    line(K, -8, -60, -8 + sw, 0, C.ink, 12); line(K, 8, -60, 8 - sw, 0, C.ink, 12);
    fillRR(K, -26, -140, 52, 86, 16, col); strokeRR(K, -26, -140, 52, 86, 16, C.ink, 4);
    circle(K, 0, -162, 22, '#C98E62', C.ink, 4);
    fillRR(K, -22, -186, 44, 18, 9, C.ink);
  });
}

// a free cocktail on a napkin: a martini glass (stem, foot, cone) with an olive on a pick and liquid that sloshes after a slide;
// slosh = 0..1 after the slide stops
function czDrink(T, K, x, y, s, slosh, t) {
  X([T, K], x, y, s, 0, () => {
    fillRR(T, -60 + 10, -6 + 8, 120, 24, 6, C.k50);
    fillRR(K, -60, -6, 120, 22, 6, '#FFFFFF'); strokeRR(K, -60, -6, 120, 22, 6, C.ink, 3);
    for (let k = 0; k < 6; k++) line(K, -52 + k * 20, 16, -46 + k * 20, 16, C.red, 3);
    K.beginPath(); K.ellipse(0, -8, 38, 9, 0, 0, TAU); K.fillStyle = '#E9E4DA'; K.fill(); K.lineWidth = 4; K.strokeStyle = C.ink; K.stroke();
    line(K, 0, -10, 0, -96, C.ink, 6);
    const tilt = Math.sin(t * 14) * 10 * slosh;
    K.save(); K.translate(0, -100);
    K.beginPath(); K.moveTo(-70, -80); K.lineTo(70, -80); K.lineTo(0, 0); K.closePath(); K.fillStyle = 'rgba(255,255,255,0.9)'; K.fill();
    K.save(); K.clip(); K.beginPath(); K.moveTo(-80, -52 + tilt); K.lineTo(80, -52 - tilt); K.lineTo(80, 10); K.lineTo(-80, 10); K.closePath(); K.fillStyle = C.red; K.fill(); K.restore();
    K.beginPath(); K.moveTo(-70, -80); K.lineTo(70, -80); K.lineTo(0, 0); K.closePath(); K.lineWidth = 5; K.strokeStyle = C.ink; K.lineJoin = 'round'; K.stroke();
    line(K, 18, -120, -10, -40, '#9A968E', 4); circle(K, 2, -66, 15, '#6E8B3D', C.ink, 3); circle(K, 2, -66, 5, C.red);
    K.restore();
  });
}

// a velvet rope line: brass posts with ball tops and an accent rope sagging between them that sways a little. x0..x1 at floor y
function czRope(T, K, x0, x1, y, n, t) {
  const posts = [...Array(n)].map((_, i) => lerp(x0, x1, i / (n - 1)));
  posts.forEach(px => { T.fillStyle = 'rgba(0,0,0,0.3)'; T.beginPath(); T.ellipse(px + 8, y + 6, 30, 8, 0, 0, TAU); T.fill(); });
  for (let i = 0; i + 1 < n; i++) {
    const a = posts[i], b = posts[i + 1], sag = 46 + Math.sin(t * 2.4 + i) * 6;
    K.beginPath(); K.moveTo(a, y - 92); K.quadraticCurveTo((a + b) / 2, y - 92 + sag * 2, b, y - 92);
    K.lineWidth = 16; K.strokeStyle = C.ink; K.lineCap = 'round'; K.stroke(); K.lineWidth = 9; K.strokeStyle = C.red; K.stroke();
  }
  posts.forEach(px => {
    fillRR(K, px - 26, y - 10, 52, 14, 6, CZ_GOLD); strokeRR(K, px - 26, y - 10, 52, 14, 6, C.ink, 3);
    fillRR(K, px - 7, y - 100, 14, 92, 5, CZ_GOLD); strokeRR(K, px - 7, y - 100, 14, 92, 5, C.ink, 3);
    circle(K, px, y - 108, 14, CZ_GOLD, C.ink, 3); circle(K, px - 4, y - 112, 4, '#FFF3C4');
  });
}

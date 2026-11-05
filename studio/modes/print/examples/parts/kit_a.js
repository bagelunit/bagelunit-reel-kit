// ───────────────────────── learn reel: shared kit (assets, chips, the LEARNING-MODE through-object, readout) ─────────────────────────
// NOTE: reference code from a real reel. Word indices (wi(n)) refer to that reel's script; re-cue on your own words.json.
// assets not included: IMG.gh_light, IMG.gh_dark, IMG.gh_readme (TOUR_ASSETS below points at placeholders).
// Whole reel in an older orange look (style 'print').
const GTM = { lime: C.red };
window.TOUR_ASSETS = [["gh_light", "assets/placeholder_gh_light.png"], ["gh_dark", "assets/placeholder_gh_dark.png"], ["gh_readme", "assets/placeholder_gh_readme.png"]];
// IMG.gh_light / IMG.gh_dark: the github.com/owner/learn-mode repo page top (2560×1800 @2x; About 'A Claude Code / Codex plugin that helps you learn how to build while AI writes the code.', 2.1k stars, 97 forks). IMG.gh_readme: the page scrolled down (README start).
// draw a region of a screenshot (source px) into a box, cover-fit, rounded
function shot(K, im, sx, sy, sw, sh, x, y, w, h, r = 18) {
  if (!im || !im.naturalWidth) return;
  K.save(); rr(K, x, y, w, h, r); K.clip(); K.fillStyle = '#FFFFFF'; K.fillRect(x, y, w, h);
  const k = Math.max(w / sw, h / sh); K.drawImage(im, sx, sy, sw, sh, x + (w - sw * k) / 2, y + (h - sh * k) / 2, sw * k, sh * k); K.restore();
}
// chips of the through-object: [label, time it lights, accent?]
const CHIPS = [
  ['approach', owi(33)],
  ['tradeoffs', owi(43)],
  ['concepts', owi(47)],
  ['you decide', owi(53), true],
  ['explained', owi(64)],
  ['map', owi(79)],
];
const CARD_HEAD = '// learn-mode', CARD_TAG = 'learning mode';

const CARD_COUNT = t => { const n = chipsOn(t); return { v: n ? `${n}/6` : 'off', on: n > 0, hot: false }; };
const CARD_PROGRESS = t => chipsOn(t) / 6;

// ── through-object: the LEARNING-MODE card (nominal 560×250, white, halftone shadow): mono header + an italic red tag, a right-side counter,
// a thin red progress bar, and chips in two rows that go grey → ink (the accent chip turns red) on their words. Automatic from t. ──
const TC_W = 560, TC_H = 250;
const TC = { x: 60, y: 1380, s: 1 };
const PRESENTER_DOCK = { x: 842, y: 1990, s: 0.8 };
const chipsOn = t => CHIPS.filter(c => t >= c[1]).length;
// o: { t, focus: chip index to ring }
function learnCard(T, K, x, y, s = 1, o = {}) {
  const t = o.t ?? 0, w = TC_W, h = TC_H, n = chipsOn(t);
  X([T, K], x, y, s, 0, () => {
    T.save(); T.shadowColor = 'rgba(0,0,0,0.38)'; T.shadowBlur = 30; T.shadowOffsetY = 14; fillRR(T, 0, 0, w, h, 20, '#FFFFFF'); T.restore();
    fillRR(K, 0, 0, w, h, 20, '#FFFFFF'); strokeRR(K, 0, 0, w, h, 20, 'rgba(17,17,17,0.14)', 2);
    const hf = { font: F.mono, weight: 700, size: 20 };
    text(K, CARD_HEAD, 24, 42, Object.assign({ color: C.ink, align: 'left' }, hf));
    text(K, CARD_TAG, 24 + measure(K, CARD_HEAD, hf) + 12, 42, { font: F.serif, italic: true, weight: 400, size: 26, color: C.red, align: 'left' });
    const cv = CARD_COUNT(t);
    text(K, cv.v, w - 24, 42, { font: F.grot, weight: 700, size: 24, color: cv.hot ? C.red : cv.on ? C.ink : '#9A968D', align: 'right' });
    fillRR(K, 24, 58, w - 48, 6, 3, '#F1EFEA'); const pr = CARD_PROGRESS(t); if (pr > 0) fillRR(K, 24, 58, (w - 48) * pr, 6, 3, C.red);
    const N = CHIPS.length, top = Math.ceil(N / 2);
    CHIPS.forEach(([nm, t0, star], i) => {
      const row = i < top ? 0 : 1, col = row ? i - top : i, cols = row ? N - top : top, cw = (w - 48 - (cols - 1) * 8) / cols;
      const cx = 24 + col * (cw + 8), cy = 80 + row * 82, p = clamp((t - t0) / 0.3);
      const sc = 1 + (p > 0 && p < 1 ? ring(p * 0.3, 3, 6) * 0.14 : 0);
      K.save(); K.translate(cx + cw / 2, cy + 34); K.scale(sc, sc); K.translate(-(cx + cw / 2), -(cy + 34));
      fillRR(K, cx, cy, cw, 68, 14, p > 0.5 ? (star ? C.red : C.ink) : '#F1EFEA');
      text(K, String(i + 1).padStart(2, '0'), cx + 12, cy + 26, { font: F.mono, weight: 700, size: 15, color: p > 0.5 ? 'rgba(255,255,255,0.7)' : '#B3AFA6', align: 'left' });
      const fs = Math.min(16, (cw - 14) / (nm.length * 0.62));
      text(K, nm, cx + cw / 2, cy + 54, { font: F.mono, weight: 700, size: fs, color: p > 0.5 ? '#FFFFFF' : '#9A968D' });
      K.restore();
      if (o.focus === i) strokeRR(K, cx - 5, cy - 5, cw + 10, 78, 18, C.red, 3);
    });
  });
}

const REEL_READOUT = t => t < owi(28) - 0.1 ? { k: 'YOUR SKILLS', v: t >= owi(6) ? 'GETTING WORSE' : '—', hot: t >= owi(6) } : t < owi(106) - 0.1 ? { k: 'UNDERSTANDING', v: Math.round(100 * clamp(chipsOn(t) / 6 * 0.75 + (t >= owi(102) ? 0.25 : 0))) + '%', hot: t >= owi(102) } : { k: 'COMMENT', v: 'LEARN', hot: true };

// ═════ re-timed to the v2 voice ("its creator says you can install it straight from the official plugin directory") ═════
// Scenes were built on the v1 clock (owi = v1 words). WT(t) maps v2 time → v1 time word by word.
const WARP = [[0.0, 0.0], [0.06, 0.06], [0.29, 0.26], [0.6, 0.66], [0.74, 0.8], [1.16, 1.26], [1.53, 1.66], [1.74, 1.85], [2.02, 2.19], [2.19, 2.32], [2.6, 2.84], [2.73, 2.96], [3.03, 3.3], [3.16, 3.36], [3.2, 3.4], [3.49, 3.77], [3.63, 3.92], [3.71, 4.0], [3.88, 4.38], [4.24, 4.56], [4.53, 4.78], [4.85, 5.11], [5.47, 5.68], [5.59, 5.83], [7.17, 6.03], [7.35, 6.15], [7.84, 6.78], [8.11, 7.13], [8.68, 7.6], [8.97, 7.86], [9.17, 8.12], [9.43, 8.38], [9.88, 8.86], [10.0, 8.94], [10.32, 9.19], [10.44, 9.29], [10.62, 9.54], [10.92, 9.95], [11.08, 10.2], [11.16, 10.29], [11.38, 10.57], [11.51, 10.63], [11.81, 10.93], [11.97, 11.06], [12.4, 11.52], [12.56, 11.67], [12.92, 12.09], [13.08, 12.22], [13.52, 12.57], [13.64, 12.71], [13.85, 13.0], [14.0, 13.17], [14.28, 13.48], [14.43, 13.61], [14.63, 13.85], [14.78, 13.92], [15.08, 14.19], [15.72, 14.76], [16.02, 15.07], [16.27, 15.29], [16.61, 15.58], [16.72, 15.78], [16.96, 16.03], [17.06, 16.15], [17.2, 16.31], [17.64, 16.64], [17.76, 16.79], [17.84, 16.88], [18.32, 17.33], [18.34, 17.52], [18.68, 17.92], [18.77, 18.02], [18.86, 18.12], [19.25, 18.52], [19.72, 19.0], [19.84, 19.09], [20.07, 19.32], [20.48, 19.69], [20.53, 19.73], [20.87, 20.01], [21.0, 20.15], [21.12, 20.24], [21.29, 20.38], [21.36, 20.52], [21.72, 20.8], [21.88, 20.96], [22.24, 21.52], [22.41, 21.69], [22.69, 21.98], [22.97, 22.21], [23.2, 22.47], [23.26, 22.57], [23.68, 23.0], [23.8, 23.13], [24.22, 23.56], [24.3, 23.65], [24.55, 23.94], [24.58, 23.95], [24.79, 24.16], [24.95, 24.33], [25.2, 24.6], [25.42, 24.85], [25.68, 25.22], [26.16, 25.67], [26.32, 25.85], [26.48, 25.98], [26.8, 26.28], [27.21, 26.65], [27.53, 26.92], [27.67, 27.06], [27.83, 27.23], [28.01, 27.36], [28.14, 27.48], [28.28, 27.6], [29.3, 28.6]];
function WT(t) {
  if (t <= WARP[0][0]) return t;
  for (let i = 1; i < WARP.length; i++) { const [a, oa] = WARP[i - 1], [b, ob] = WARP[i]; if (t <= b) return lerp(oa, ob, (t - a) / (b - a)); }
  const [a, oa] = WARP[WARP.length - 1]; return oa + (t - a);
}

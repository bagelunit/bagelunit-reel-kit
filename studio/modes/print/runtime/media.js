/* Susanoo Reel Kit print · media
   Images from the reel's assets/ folder, and typing helpers. A scene registers an image while it loads:
     ASSETS.push(['shot', 'assets/screenshot.png'])   → IMG.shot once the page is ready
   Every helper does nothing when an image is missing, so a bad path never breaks a frame. */
const IMG = {};
const ASSETS = [];
// load one image; resolves on load, on error (with a warning) or after 20 s, whichever comes first
const loadImg = (key, src) => new Promise(done => {
  const warnMissing = () => {
    console.warn('missing image ' + src);
    done();
  };
  setTimeout(done, 20000);
  IMG[key] = Object.assign(new Image(), { onload: () => done(), onerror: warnMissing, src });
});
const hasPixels = im => !!(im && im.naturalWidth);
// fill the box with the image (cropped to cover it): focus point fx, fy (0..1), zoom, corner radius r, grey/bright filter
const coverImg = (ctx, im, x, y, w, h, o = {}) => {
  if (!hasPixels(im)) return;
  const f = withDefaults(o, { fx: 0.5, fy: 0.4, zoom: 1, r: 0 });
  const k = Math.max(w / im.naturalWidth, h / im.naturalHeight) * f.zoom;
  const [dw, dh] = [im.naturalWidth * k, im.naturalHeight * k];
  ctx.save();
  if (f.r) rr(ctx, x, y, w, h, f.r);
  else {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
  }
  ctx.clip();
  if (o.gray) ctx.filter = `grayscale(${o.gray}) brightness(${o.bright ?? 1})`;
  ctx.drawImage(im, x + (w - dw) * f.fx, y + (h - dh) * f.fy, dw, dh);
  ctx.restore();
};
// fit the whole image inside the box (letterboxed, centred) and return the rectangle it took
const containImg = (ctx, im, x, y, w, h) => {
  if (!hasPixels(im)) return null;
  const k = Math.min(w / im.naturalWidth, h / im.naturalHeight);
  const box = { w: im.naturalWidth * k, h: im.naturalHeight * k };
  box.x = x + (w - box.w) / 2;
  box.y = y + (h - box.h) / 2;
  ctx.drawImage(im, box.x, box.y, box.w, box.h);
  return { x: box.x, y: box.y, w: box.w, h: box.h };
};
// the typed part of str at time t, typing from t0 at cps characters per second
const typedStr = (str, t, t0, cps = 26) => str.slice(0, clamp(Math.floor((t - t0) * cps), 0, str.length));
// typing that follows the voice: segs = [[str, t0, t1], ...], each piece typed across its own window
const typeSeg = (t, segs) => {
  const waiting = segs.findIndex(seg => t < seg[1]);            // pieces after the first one not yet started stay hidden
  const started = waiting < 0 ? segs : segs.slice(0, waiting);
  return started.map(([piece, t0, t1]) => piece.slice(0, Math.ceil(piece.length * clamp((t - t0) / Math.max(0.01, t1 - t0))))).join('');
};
// a blinking caret at (x, baseline y), h tall
const caretAt = (K, x, y, h, t, col = C.ink) => {
  if (Math.floor(t * 2.4) % 2 === 0) fillRR(K, x + 3, y - h * 0.8, 3, h, 1.5, col);
};
// a four-point sparkle of radius r
const sparkle4 = (ctx, x, y, r, col = C.red) => {
  const tip = a => [Math.cos(a) * r, Math.sin(a) * r];
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = i * TAU / 4;
    ctx.quadraticCurveTo(0, 0, ...tip(a));
    ctx.quadraticCurveTo(0, 0, ...tip(a + TAU / 4));
  }
  ctx.fillStyle = col;
  ctx.fill();
  ctx.restore();
};

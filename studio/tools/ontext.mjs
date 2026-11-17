// ontext.mjs · what is written on screen, read from the page that draws it (local addition).
//
// One probe for every kind of reel. It is injected before the page loads (PROBE_INIT) and sees text two ways:
//   - the DOM: every text node that is on screen (display, visibility and opacity checked up the tree, text-transform applied),
//     with its real bounding box after transforms. The depth overlay, the talking mode and most scene styles draw this way.
//   - the 2D canvas: every fillText / strokeText call. A canvas that is the whole 1080x1920 frame (the print mode draws its two
//     layers that way) gives a box, through the context's transform; text drawn on any other canvas (a texture inside a 3D scene)
//     is only a string: it has no place on the screen the probe could measure, so it never gets a box.
// The page is sampled every 0.1 s of the reel during the render the kit does anyway. The result is:
//   build/on_screen_text.txt   one line per text, "[t0-t1s kind] text", read by tools/facts.py (final scope)
//   build/text_boxes.json      {"source", "seconds", "boxes": [{t0, t1, x, y, w, h, size, label, kind}]}, read by tools/qa.py
//                              (x, y, w, h: the drawn ink for canvas text, the text's own box for page text; size: the font's own box)
// Scene styles (tools/scenes.mjs) draw their lettering as shapes, so this probe finds no text there; scenes.mjs feeds it the engine's own
// S.inspect labels of the text-like kinds instead, and adds the text props of the plan.
// Times are the first and last sample a text was seen in (to 0.1 s). A box is the median of the sampled boxes over the text's life,
// so an entrance or a camera shake does not decide it. Nothing is guessed: a text the probe could not read is not listed, and a
// render that did not cover the whole reel writes nothing.
import fs from 'node:fs';
import path from 'node:path';

export const SOURCE = 'kit render (text probe, tools/ontext.mjs)';
export const SAMPLE_DT = 0.1;     // s between samples
const W = 1080, H = 1920;

/* ── in the page ────────────────────────────────────────────────────────────────────────────────────────────────────── */
export const PROBE_INIT = String.raw`(() => {
  if (window.__ontext) return;
  const S = window.__ontext = { on: false, rows: [], build: [], t: null };
  const proto = CanvasRenderingContext2D.prototype;
  const record = (ctx, str, x, y) => {
    if (!S.on) return;
    const text = String(str).replace(/\s+/g, ' ').trim();
    if (!text || !(ctx.globalAlpha >= 0.05)) return;
    const kind = window.__ontextKind || null, c = ctx.canvas;
    if (!(c && c.width === ${W} && c.height === ${H})) { S.rows.push({ text, src: 'texture', kind }); return; }
    const m = ctx.measureText(text), asc = m.fontBoundingBoxAscent, desc = m.fontBoundingBoxDescent;
    if (!(Number.isFinite(asc) && Number.isFinite(desc) && Number.isFinite(m.actualBoundingBoxAscent))) { S.rows.push({ text, src: 'texture', kind }); return; }
    const M = ctx.getTransform();
    // a box of the text in frame pixels, through the context's transform: the ink (what is drawn) and the font box (the line it sits in)
    const frame = (l, t, r, b) => {
      const xs = [], ys = [];
      for (const [px, py] of [[l, t], [r, t], [r, b], [l, b]]) { xs.push(M.a * px + M.c * py + M.e); ys.push(M.b * px + M.d * py + M.f); }
      return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    };
    const left = ctx.textAlign === 'center' ? x - m.width / 2 : ctx.textAlign === 'right' || ctx.textAlign === 'end' ? x - m.width : x;
    const ink = frame(x - m.actualBoundingBoxLeft, y - m.actualBoundingBoxAscent, x + m.actualBoundingBoxRight, y + m.actualBoundingBoxDescent);
    const fb = frame(left, y - asc, left + m.width, y + desc);
    if (ink[2] <= 0 || ink[3] <= 0 || ink[0] >= ${W} || ink[1] >= ${H} || !(ink[2] > ink[0] && ink[3] > ink[1])) return;       // entirely off the frame
    S.rows.push({ text, src: 'canvas', kind, x: ink[0], y: ink[1], w: ink[2] - ink[0], h: ink[3] - ink[1], fx: fb[0], fy: fb[1], fw: fb[2] - fb[0], fh: fb[3] - fb[1] });
  };
  for (const fn of ['fillText', 'strokeText']) {
    const orig = proto[fn];
    proto[fn] = function (str, x, y, ...rest) { try { record(this, str, x, y); } catch (e) { /* the probe never breaks a page */ } return orig.call(this, str, x, y, ...rest); };
  }
  // text in the DOM: what is on screen right now
  const dom = () => {
    const out = [], range = document.createRange();
    const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const raw = n.nodeValue;
      if (!raw || !raw.trim()) continue;
      const el = n.parentElement;
      if (!el || el.closest('script,style,noscript,title,head,template')) continue;
      const own = getComputedStyle(el);
      if (own.visibility === 'hidden' || own.visibility === 'collapse') continue;
      let opacity = 1, shown = true;
      for (let p = el; p && p.nodeType === 1; p = p.parentElement) {
        const cs = p === el ? own : getComputedStyle(p);
        if (cs.display === 'none') { shown = false; break; }
        opacity *= Number(cs.opacity);
      }
      if (!shown || !(opacity >= 0.05)) continue;
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0) || r.right <= 0 || r.bottom <= 0 || r.left >= ${W} || r.top >= ${H}) continue;
      let text = raw.replace(/\s+/g, ' ').trim();
      if (own.textTransform === 'uppercase') text = text.toUpperCase(); else if (own.textTransform === 'lowercase') text = text.toLowerCase();
      out.push({ text, src: 'dom', kind: null, x: r.left, y: r.top, w: r.width, h: r.height, fx: r.left, fy: r.top, fw: r.width, fh: r.height });
    }
    return out;
  };
  // wrap the page's draw call (studio.show or __scene.seek): rows are the canvas text of the newest call
  S.wrap = (obj, name) => {
    S.build.push(...S.rows.filter((r) => r.src === 'texture'));       // drawn before the first frame: textures made at load
    S.rows = []; S.on = true;
    const orig = obj[name];
    obj[name] = function (...a) { S.t = a[0]; S.rows = []; return orig.apply(this, a); };
  };
  S.collect = () => {
    const seen = new Set(), canvas = [];
    for (const r of S.rows) { const k = r.text + '|' + r.src + '|' + Math.round(r.x || 0) + '|' + Math.round(r.y || 0); if (!seen.has(k)) { seen.add(k); canvas.push(r); } }
    return { canvas, dom: dom(), build: S.build };
  };
})();`;

// wrap the page's draw call once the page is ready; false when the probe is not in the page
export async function attach(page, expr = 'window.studio', fn = 'show') {
  return page.evaluate(([e, f]) => {
    const obj = (0, eval)(e);
    if (!window.__ontext || !obj || typeof obj[f] !== 'function') return false;
    window.__ontext.wrap(obj, f);
    return true;
  }, [expr, fn]).catch(() => false);
}
export const collect = (page) => page.evaluate(() => (window.__ontext ? window.__ontext.collect() : null));

/* ── on the machine: samples → lines and boxes ──────────────────────────────────────────────────────────────────────── */
const median = (a) => { const s = [...a].sort((p, q) => p - q), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// words drawn one by one (captions, tiles) become one line: same row, next to each other, same source and kind
const union = (a, b) => { const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), x1 = Math.max(a.x + a.w, b.x + b.w), y1 = Math.max(a.y + a.h, b.y + b.h); return { x, y, w: x1 - x, h: y1 - y }; };
function toLines(items) {
  const out = [];
  for (const it of items) {
    const prev = out.at(-1);
    if (prev && prev.box && it.box && prev.src === it.src && prev.kind === it.kind) {
      const a = prev.fb, b = it.fb, h = Math.max(a.h, b.h);                       // lines are judged on the font boxes: they do not jump with the letters
      const rowGap = Math.abs(a.y + a.h / 2 - (b.y + b.h / 2)), gap = b.x - (a.x + a.w);
      if (rowGap <= 0.3 * h && gap >= -0.3 * h && gap <= 1.6 * h) {
        prev.text += ' ' + it.text;
        prev.box = union(prev.box, it.box); prev.fb = union(a, b);
        continue;
      }
    }
    out.push({ text: it.text, src: it.src, kind: it.kind, box: it.box || null, fb: it.fb || null });
  }
  return out;
}

export class TextLog {
  constructor({ dt = SAMPLE_DT } = {}) { this.dt = dt; this.open = []; this.spans = []; this.tex = new Map(); this.build = new Set(); this.samples = 0; this.last = null; this.broken = false; }

  // one sample: `got` is what collect() returned at reel time t
  add(t, got) {
    if (!got) { this.broken = true; return; }
    this.samples++; this.last = t;
    for (const b of got.build || []) this.build.add(b.text);
    // inspect: [{kind, label, x, y, w, h}] a scene style's engine reports (it draws lettering as shapes, so the page has no text to read);
    // the caller has already kept only the text-like kinds
    const told = (got.inspect || []).filter((b) => b && String(b.label ?? '').trim()).map((b) => ({ text: String(b.label).replace(/\s+/g, ' ').trim(), src: 'inspect', kind: null, x: b.x, y: b.y, w: b.w, h: b.h, fx: b.x, fy: b.y, fw: b.w, fh: b.h }));
    const items = [...(got.canvas || []), ...(got.dom || []), ...told].map((r) => (r.src === 'texture' ? { text: r.text, src: r.src, kind: r.kind, box: null, fb: null }
      : { text: r.text, src: r.src, kind: r.kind, box: { x: r.x, y: r.y, w: r.w, h: r.h }, fb: { x: r.fx, y: r.fy, w: r.fw, h: r.fh } }));
    const lines = [...toLines(items.filter((i) => i.src === 'canvas')), ...toLines(items.filter((i) => i.src === 'dom')), ...items.filter((i) => i.src === 'texture' || i.src === 'inspect').map((i) => ({ ...i }))];
    const used = new Set();
    for (const ln of lines) {
      if (ln.src === 'texture') {        // a texture is drawn when the scene needs it, not while it is seen: one span per string, first to last draw
        const tex = this.tex.get(ln.text);
        if (tex) tex.last = t; else { const o = { text: ln.text, kind: ln.kind, src: 'texture', t0: t, last: t, centre: null, boxes: [], fbs: [] }; this.tex.set(ln.text, o); this.spans.push(o); }
        continue;
      }
      const centre = ln.box ? [ln.box.x + ln.box.w / 2, ln.box.y + ln.box.h / 2] : null;
      const hit = this.open.find((o) => !used.has(o) && o.text === ln.text && o.kind === ln.kind && o.src === ln.src && t - o.last <= this.dt * 1.5 + 1e-6
        && (!centre || !o.centre || Math.hypot(o.centre[0] - centre[0], o.centre[1] - centre[1]) < 250));
      if (hit) { hit.last = t; hit.centre = centre; if (ln.box) { hit.boxes.push(ln.box); hit.fbs.push(ln.fb); } used.add(hit); }
      else { const o = { text: ln.text, kind: ln.kind, src: ln.src, t0: t, last: t, centre, boxes: ln.box ? [ln.box] : [], fbs: ln.fb ? [ln.fb] : [] }; this.open.push(o); this.spans.push(o); used.add(o); }
    }
    this.open = this.open.filter((o) => t - o.last <= this.dt * 1.5 + 1e-6);
  }

  // the finished spans: {t0, t1, text, kind, src, box|null}. Typing steps and counting states are folded away (see below)
  finish(end) {
    const dt = this.dt;
    let spans = this.spans.map((s) => ({
      t0: s.t0, t1: Math.min(end, s.last + dt), text: s.text, kind: s.kind, src: s.src,
      box: s.boxes.length ? { x: median(s.boxes.map((b) => b.x)), y: median(s.boxes.map((b) => b.y)), w: median(s.boxes.map((b) => b.w)), h: median(s.boxes.map((b) => b.h)), size: median(s.fbs.map((b) => b.h)) } : null,
    }));
    for (const s of spans) { s.t0 = Math.round(s.t0 * 100) / 100; s.t1 = Math.round(s.t1 * 100) / 100; }
    // typing: a text that is the start of a longer one which takes over right after it (a caption growing word by word, a command typed
    // out) is a step of it; only the full text is listed
    spans = spans.filter((a) => !spans.some((b) => b !== a && b.kind === a.kind && b.src === a.src && b.text.length > a.text.length && b.text.startsWith(a.text)
      && b.t0 >= a.t0 - 1e-6 && b.t0 <= a.t1 + 0.25));
    // counting: a text that is on screen for less than 0.4 s and is followed at once, in the same place, by the same text with other
    // digits (a counter ticking up, a clock running) is a step, not a statement; every state a viewer has to read is held for 0.4 s
    // or more (modes/MODE-RULES.md), so those stay. The last value of a count always stays.
    const shape = (text) => text.replace(/\d+/g, '#');
    spans = spans.filter((a) => !(shape(a.text).includes('#') && a.t1 - a.t0 < 0.4 - 1e-6 && spans.some((b) => b !== a && b.text !== a.text && shape(b.text) === shape(a.text)
      && b.kind === a.kind && b.src === a.src && b.t0 >= a.t1 - 1e-6 && b.t0 <= a.t1 + 0.25
      && (!a.box || !b.box || Math.hypot(a.box.x - b.box.x, a.box.y - b.box.y) < 150))));
    return spans.sort((a, b) => a.t0 - b.t0 || (a.box?.y ?? 0) - (b.box?.y ?? 0));
  }
}

const f2 = (x) => x.toFixed(2);
export const FLEETING = 0.3;     // s: a text seen for less than this passes too fast to read (a counter rolling, a wipe); it is listed, but marked
export const lineOf = (s, tag = null) => `[${f2(s.t0)}-${f2(s.t1)}s ${tag || s.kind || (s.src === 'texture' ? 'in-scene' : 'text')}${s.t1 - s.t0 < FLEETING - 1e-6 ? ' fleeting' : ''}] ${s.text}`;

// the lines of build/on_screen_text.txt: spans first, then the strings only a 3D texture drew before the first frame
export function linesFor(spans, build = [], end = 0) {
  const seen = new Set(spans.map((s) => s.text));
  const extra = [...build].filter((t) => !seen.has(t)).map((text) => `[0.00-${f2(end)}s in-scene] ${text}`);
  return [...spans.map((s) => lineOf(s)), ...extra];
}

export function boxesFor(spans) {
  return spans.filter((s) => s.box).map((s) => ({
    t0: s.t0, t1: s.t1, x: Math.round(s.box.x), y: Math.round(s.box.y), w: Math.round(s.box.w), h: Math.round(s.box.h), size: Math.round(s.box.size),
    label: s.text.slice(0, 60), kind: s.kind || 'text',
  }));
}

/* ── files ──────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
// a file the kit wrote (a dict naming SOURCE), or none: anything else was written by hand and is never overwritten
export function ours(file) {
  if (!fs.existsSync(file)) return true;
  const d = readJSON(file, null);
  return Boolean(d && !Array.isArray(d) && d.source === SOURCE);
}

// write what a full render saw. `shots` is the page's own scene list (print) or null. Returns the notes to print.
export function writeAll(reelDir, log, { seconds, shots = null }) {
  const build = path.join(reelDir, 'build');
  fs.mkdirSync(build, { recursive: true });
  const notes = [];
  if (log.broken || !log.samples) { notes.push('on-screen text: the page could not be read (no probe), so build/on_screen_text.txt and build/text_boxes.json were NOT written'); return notes; }
  const spans = log.finish(seconds);
  const lines = linesFor(spans, log.build, seconds);
  fs.writeFileSync(path.join(build, 'on_screen_text.txt'), lines.join('\n') + (lines.length ? '\n' : ''));
  const boxes = boxesFor(spans);
  const bf = path.join(build, 'text_boxes.json');
  if (ours(bf)) fs.writeFileSync(bf, JSON.stringify({ source: SOURCE, seconds: Math.round(seconds * 1000) / 1000, sample_s: log.dt, boxes }, null, 1) + '\n');
  else notes.push('build/text_boxes.json was written by hand, so it was kept (delete it to let kit render measure the text)');
  notes.push(`on-screen text: ${lines.length} line(s) in build/on_screen_text.txt, ${boxes.length} measured box(es) in build/text_boxes.json`);
  if (Array.isArray(shots) && shots.length) {
    const sf = path.join(build, 'shots.json');
    if (ours(sf)) { fs.writeFileSync(sf, JSON.stringify({ source: SOURCE, shots }, null, 1) + '\n'); notes.push(`${shots.length} shot(s) from the page's scene list in build/shots.json (kit lint)`); }
    else notes.push('build/shots.json was written by hand, so it was kept (delete it to let kit render write the page\'s scene list)');
  }
  return notes;
}

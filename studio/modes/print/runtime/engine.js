/* Susanoo Reel Kit print · engine
   Boot, the scene timeline, the camera, the presenter's automatic life, the chapter chrome and the frame itself.
   The page publishes window.studio = { ready, length, show(t), grab: 'canvas', cues } for the kit's tools (tools/session.mjs).
   Boot: reel.json → build/words.json (or stand-in timings from script.txt) → timeline.js → each file in SCENE_FILES → TIMELINE()
   → phrases → lip sync → fonts and images → ready.
   timeline.js sets: SCENE_FILES = [...]; TIMELINE = () => [[key, start], ...]; PHRASES = null | [...];
                     READOUT = t => ({ k, v, hot }) | null; END_AT = seconds | null */
let REEL = {}, SCENE_FILES = [], TIMELINE = null, READOUT = null, END_AT = null, SCENES = [], DUR = 0;
const SC = {};
const KICKS = [];
const WIPES = [];
const SFX_CUES = [];
const QS = new URLSearchParams(location.search);
const ONLY = QS.get('only');

/* ---------- things scenes register while they load (times come from words) ---------- */
// a sound at t; gain in dB against the default level (0 normal, -6 quieter)
function cue(t, name, gain = 0) {
  if (isFinite(t)) SFX_CUES.push({ t: +Math.max(0, t).toFixed(3), name, gain });
}
// a camera punch at t: a zoom bump plus a shake. It never outlives its scene: near a cut it is shortened and eased out, so the
// camera is back at rest on the scene's last frame
function kick(t, amp = 1, shake = 1, dur = 0.8) {
  if (isFinite(t)) KICKS.push({ t, amp, shake, dur });
}
// a blind wipe into the scene that starts at t. mode: 0 diagonal, 1 from the centre, 2 bottom-up, 3 left to right. It covers the
// last 0.24 s before t (land nothing important there) and clears over 0.3 s after. col: '#hex' or [r, g, b] in 0..1
function wipe(t, mode = 0, col = '#111111') {
  if (!isFinite(t)) return;
  const hex = Array.isArray(col) ? '#' + col.map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('') : col;
  WIPES.push({ t, mode, col: hex });
}

/* ---------- scenes in time ---------- */
// the scene playing at t (or the one asked for with ?only=)
function sceneAt(t) {
  if (ONLY && SC[ONLY]) return SCENES.find(s => s.key === ONLY) || { key: ONLY, start: 0, ...SC[ONLY] };
  return SCENES.reduce((current, s) => (t >= s.start ? s : current), SCENES[0]);
}
// the reel's length (works while scenes load, before DUR is set)
const DUR_END = () => END_AT || (VO_END + (REEL.tail ?? 0.8));
const sceneStart = key => {
  const found = SCENES.find(s => s.key === key);
  return found ? found.start : 0;
};
const sceneEnd = key => {
  const next = SCENES[SCENES.findIndex(s => s.key === key) + 1];
  return SCENES.some(s => s.key === key) && next ? next.start : DUR;
};

/* ---------- the canvases ---------- */
const out = document.getElementById('c');
const toneC = document.createElement('canvas');
const inkC = document.createElement('canvas');
for (const layer of [toneC, inkC]) Object.assign(layer, { width: W, height: H });
const T = toneC.getContext('2d', { willReadFrequently: false });
const K = inkC.getContext('2d');
const halftone = makeHalftone(out, toneC, inkC);
const SAFE_X = 130;    // the inset of the captions and chrome
const SAFE_S = 0.88;   // scene content is scaled by this around the bottom-centre, which keeps it inside the side safe zones
// screen y ↔ scene y (captions and chrome are drawn in screen space, scenes in scene space); cam = a camera to undo (default none)
const engRestingCam = cam => cam || { y: 0, z: 1 };
// the camera's vertical offset and zoom (missing = none)
const engCamYZ = cam => {
  const c = engRestingCam(cam);
  return [c.y || 0, c.z || 1];
};
function screenToSceneY(y, cam) {
  const [shift, zoom] = engCamYZ(cam);
  const unshrunk = H - (H - y) / SAFE_S;
  return (unshrunk - H / 2 - shift) / zoom + H / 2;
}
function sceneToScreenY(y, cam) {
  const [shift, zoom] = engCamYZ(cam);
  const viewed = (y - H / 2) * zoom + H / 2 + shift;
  return H - (H - viewed) * SAFE_S;
}
// the bottom of the caption block in scene space at t (keep scene content under it). withCam also undoes this frame's camera:
// exact for this frame, where the default stays put while the camera kicks or leans
function captionBottomScene(t, withCam = false) {
  const sc = sceneAt(t);
  return screenToSceneY(captionBottom(t), withCam && sc ? camera(t, sc) : null);
}

/* ---------- themes: reel.json "theme": a name, or { preset, paper, accent, ink2, ink, grain, bloom } ---------- */
const THEMES = {};
`studio #F3F1EC #F2542D #1E2A44 #151515
harbor #EDF0F2 #1F5EFF #F2A93B #12161D
ochre #F3EEE2 #D49A1E #2B4C7E #1A1712
ink #F1F1EF #151515 #8E8E8E #0F0F0F`.split('\n').forEach(row => {
  const [name, paper, accent, ink2, ink] = row.split(' ');
  THEMES[name] = { paper, accent, ink2, ink };
});
THEMES.ink.bloom = 0;
Object.assign(THEMES, { clay: THEMES.studio, cobalt: THEMES.harbor, forest: THEMES.ochre, mono: THEMES.ink });   // the v1.0 names keep working
const THEME = { grain: 0.03, bloom: 1, ...THEMES.studio };
// a colour made darker (k < 0) or lighter (k > 0)
function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const shade = v => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k).toString(16).padStart(2, '0');
  return '#' + [16, 8, 0].map(shift => shade(n >> shift & 255)).join('');
}

/* ---------- the camera: the scene's cam(t) → {x, y, z, r}, plus every kick that is live ---------- */
// how long a kick may live: its own length, cut short by the next scene's start
function kickLife(k) {
  const nextScene = SCENES.find(s => s.start > k.t + 1e-6);
  return Math.min(k.dur, nextScene ? nextScene.start - k.t : 1e9);
}
function camera(t, sc) {
  const own = sc.cam ? sc.cam(t) : {};
  const view = Object.assign({ x: 0, y: 0, z: 1, r: 0 }, own);
  KICKS.filter(k => t - k.t >= 0 && t - k.t <= k.dur).forEach(k => {
    const age = t - k.t, life = kickLife(k);
    if (age >= life) return;
    const fade = E.inOutCubic(clamp((life - age) / Math.min(0.2, life)));   // reaches exactly 0 when its life ends
    const shake = k.shake * 16 * Math.exp(-age * 11) * fade;
    view.z *= 1 + k.amp * 0.05 * Math.exp(-age * 9) * fade;
    view.x += noise1(age * 38 + k.t * 13) * shake;
    view.y += noise1(age * 38 + 50 + k.t * 7) * shake;
  });
  return view;
}

/* ---------- the presenter's own life: blinks, breathing, head motion, lip sync (added to the scene's state) ---------- */
function engBlinkAt(t) {
  const now = Math.floor(t / 3.1);
  let blink = 0;
  for (const k of [now - 1, now, now + 1]) {
    const away = Math.abs(t - (k * 3.1 + hash(k) * 1.6));
    if (away < 0.08) blink = Math.max(blink, 1 - away / 0.08);
  }
  return blink;
}
function autoGuy(t) {
  const talk = envAt(t);
  return {
    blink: engBlinkAt(t),
    bob: Math.sin(t * 2.4) * 5 - talk * 6,
    headTilt: Math.sin(t * 1.3) * 2.2 + noise1(t * 2.2) * 2.5 * talk,
    lookX: noise1(t * 0.45 + 7) * 0.25,
    lookY: noise1(t * 0.4 + 3) * 0.15,
    ...visAt(t),
    brow: noise1(t * 1.7) * 0.25 * talk,
    sy: 1 + Math.sin(t * 2.4) * 0.006,
  };
}
const ADDITIVE = ['bob', 'headTilt', 'lookX', 'lookY', 'brow'];
const ENG_UNIT_FIELDS = ['shock', 'sweat', 'wink', 'blink', 'browTilt', 'armLp', 'armRp'];
const ENG_SIGNED_FIELDS = ['brow', 'smile', 'lookX', 'lookY', 'headTurn'];
// the state the engine draws: the automatic life under the scene's state, the additive fields summed, everything clamped
function guyState(t, base) {
  const life = autoGuy(t);
  const st = { ...life, ...base };
  const scale = base.still ? 0 : 1;
  ADDITIVE.filter(k => base[k] !== undefined).forEach(k => { st[k] = base[k] + life[k] * scale; });
  if (base.mouth !== undefined) {
    if (base.talk) st.mouth = Math.max(base.mouth, life.mouth);
    else if (base.jaw === undefined) Object.assign(st, { jaw: Math.min(1, base.mouth), lipW: -0.2, press: 0, teeth: 0.2, tongue: 0 });   // a scripted mouth (a shocked O) replaces the lip sync
  }
  if (base.blink !== undefined) st.blink = Math.max(base.blink, life.blink);
  ENG_UNIT_FIELDS.filter(k => st[k] !== undefined).forEach(k => { st[k] = clamp(st[k]); });
  ENG_SIGNED_FIELDS.filter(k => st[k] !== undefined).forEach(k => { st[k] = clamp(st[k], -1, 1); });
  if (st.mouth !== undefined) st.mouth = clamp(st.mouth, 0, 1.2);
  Object.defineProperty(st, '_norm', { value: true });   // PRESENTER.anchors() then knows it needs no second pass
  return st;
}
// draw the presenter in the given state (from act() or your own object); reel.json "presenter": false hides it
function guy(T, K, t, base) {
  if (!base || base.hide || REEL.presenter === false) return;
  const st = guyState(t, { t, ...base });
  if (window.STICKER_HOST && STICKER_HOST.on) { STICKER_HOST.draw(K, t, st); return; }   // local add-on: picture stickers
  const plain = REEL.sticker === false || base.sticker === false;
  if (plain) PRESENTER.draw(T, K, st);
  else stickerDraw(K, k => PRESENTER.draw(T, k, st), base.stickerR);
}

/* ---------- the die-cut sticker: whatever fn(k) draws on the ink layer gets a paper border r px wide with a thin ink edge ---------- */
// The presenter always wears it (reel.json "sticker": false turns it off); a scene can give one of its own props a sticker too.
const STK = { a: document.createElement('canvas'), b: document.createElement('canvas') };
for (const c of [STK.a, STK.b]) Object.assign(c, { width: W, height: H });
function stickerDraw(K, fn, r = 9) {
  const art = STK.a.getContext('2d'), halo = STK.b.getContext('2d');
  const flat = [1, 0, 0, 1, 0, 0];
  art.setTransform(...flat);
  art.clearRect(0, 0, W, H);
  art.setTransform(K.getTransform());
  fn(art);
  art.setTransform(...flat);
  // grow the silhouette by `grow` px (16 offset copies) and flood it with one colour
  const outline = (grow, colour) => {
    halo.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 16; i++) halo.drawImage(STK.a, Math.cos(i / 16 * TAU) * grow, Math.sin(i / 16 * TAU) * grow);
    halo.globalCompositeOperation = 'source-in';
    halo.fillStyle = colour;
    halo.fillRect(0, 0, W, H);
  };
  halo.setTransform(...flat);
  halo.clearRect(0, 0, W, H);
  K.save();
  K.setTransform(...flat);
  outline(r + 3, C.ink);
  K.drawImage(STK.b, 0, 0);
  halo.globalCompositeOperation = 'source-over';
  halo.clearRect(0, 0, W, H);
  outline(r, C.paper);
  K.drawImage(STK.b, 0, 0);
  halo.globalCompositeOperation = 'source-over';
  K.drawImage(STK.a, 0, 0);
  K.restore();
}

/* ---------- chrome: the chapter mark top-left (an accent disc with the number, the label underlined), a readout tag top-right ---------- */
// sc.label is the engine default ("// 02 — key") or your own text; a "// NN — " prefix becomes the number
const CHROME_Y = 132;
const CHROME_H = 46;
const ENG_LABEL_PREFIX = new RegExp(String.raw`^\s*\/\/\s*(\d+)\s*[—–-]+\s*(.*)$`);
const ENG_SLASHES = new RegExp(String.raw`^\s*\/\/\s*`);
function chapterMark(ctx, label) {
  const parsed = label.match(ENG_LABEL_PREFIX);
  const num = parsed ? parsed[1] : '';
  const words = (parsed ? parsed[2] : label.replace(ENG_SLASHES, '')).toUpperCase();
  if (!words && !num) return;
  const labelFace = { font: F.voice, weight: 400, size: 25, ls: 1.5 };
  const r = CHROME_H / 2;
  const textX = num ? SAFE_X + r * 2 + 14 : SAFE_X;
  if (num) {
    ctx.beginPath();
    ctx.arc(SAFE_X + r, CHROME_Y + r, r, 0, TAU);
    ctx.fillStyle = C.red;
    ctx.fill();
    text(ctx, num, SAFE_X + r, CHROME_Y + 33, { color: C.paper, font: F.anton, weight: 400, size: 27 });
  }
  if (words) {
    const width = measure(ctx, words, labelFace);
    text(ctx, words, textX, CHROME_Y + 31, { color: C.ink, align: 'left', ...labelFace });
    fillRR(ctx, textX, CHROME_Y + 40, Math.min(width, 120), 4, 2, C.ink);
  }
}
// { k: 'CLIPS', v: '12/40', hot } → a square tag with an accent edge, the value turning accent when hot
function readoutTag(ctx, r) {
  const keyFace = { font: F.voice, weight: 400, size: 23, ls: 1.5 };
  const valueFace = { font: F.anton, weight: 400, size: 27 };
  const key = String(r.k || '').toUpperCase(), value = String(r.v);
  const w = measure(ctx, key, keyFace) + measure(ctx, value, valueFace) + 46;
  const x = W - SAFE_X - w;
  strokeRR(ctx, x, CHROME_Y + 1, w, CHROME_H - 2, 6, C.ink, 3);
  fillRR(ctx, x, CHROME_Y + 1, 9, CHROME_H - 2, 3, C.red);
  text(ctx, key, x + 18, CHROME_Y + 31, { color: C.ink, align: 'left', ...keyFace });
  text(ctx, value, x + w - 18, CHROME_Y + 33, { color: r.hot ? r.col || C.red : C.ink, align: 'right', ...valueFace });
}
function chrome(ctx, t, sc) {
  if (sc.noChrome || REEL.chrome === false) return;
  chapterMark(ctx, String(sc.label || ''));
  const reading = sc.readout ? sc.readout(t) : null;
  const handle = REEL.brand && REEL.brand.handle;
  if (reading) readoutTag(ctx, reading);
  else if (handle) text(ctx, String(handle), W - SAFE_X, CHROME_Y + 32, { font: F.voice, weight: 400, size: 25, ls: 1.5, color: C.ink, align: 'right' });
}

/* ---------- one frame ---------- */
// the wipe in progress at t: closing 0 → 0.85 over the 0.24 s before the cut (about 99 % covered on its last frame), then opening
// from 1.4 with the next scene already showing between the slats
function wipeAt(t, sc) {
  if (sc.key === 'presenter') return null;   // the presenter sheet's pages are not reel time
  let live = null;
  for (const w of WIPES) {
    if (t >= w.t - 0.24 && t < w.t) live = { p: 0.85 * (t - (w.t - 0.24)) / 0.24, mode: w.mode, col: w.col };
    else if (t >= w.t && t < w.t + 0.3) live = { p: 1.4 + 0.6 * (t - w.t) / 0.3, mode: w.mode, col: w.col };
  }
  return live;
}
// scene space: scaled into the safe zone around the bottom-centre, then the camera (moved, turned, zoomed around the frame centre)
function enterSceneSpace(ctx, cam) {
  runOps(ctx, [
    ['save'],
    ['translate', W / 2, H], ['scale', SAFE_S, SAFE_S], ['translate', -W / 2, -H],                                       // the safe-zone shrink
    ['translate', W / 2 + cam.x, H / 2 + cam.y], ['rotate', cam.r], ['scale', cam.z, cam.z], ['translate', -W / 2, -H / 2],   // the camera
  ]);
}
// the scene's own drawing, its presenter(s) and its front layer; an error is reported and the frame carries on
function drawScene(sc, t) {
  const layers = [
    () => sc.draw && sc.draw(T, K, t),
    () => sc.guy && [].concat(sc.guy(t)).forEach(state => guy(T, K, t, state)),
    () => sc.front && sc.front(T, K, t),
  ];
  try {
    layers.forEach(layer => layer());
  } catch (e) {
    console.error('scene "' + sc.key + '" error @' + t.toFixed(2) + ': ' + e.message + '\n' + e.stack);
  }
}
// captions, chrome and the scene's top layer, in screen space
function drawOverlay(sc, t) {
  try {
    headline(K, t, sc);
    chrome(K, t, sc);
    if (sc.top) sc.top(T, K, t);
  } catch (e) {
    console.error('caption/chrome error: ' + e.message);
  }
}
function renderFrame(t) {
  const sc = sceneAt(t);
  T.setTransform(1, 0, 0, 1, 0, 0);
  K.setTransform(1, 0, 0, 1, 0, 0);
  K.clearRect(0, 0, W, H);
  T.fillStyle = '#FFFFFF';   // white tone = bare paper (the compositor prints the paper colour)
  T.fillRect(0, 0, W, H);
  if (sc.back) sc.back(T, K, t);   // an optional full-frame background, in screen space
  const cam = camera(t, sc);
  [T, K].forEach(ctx => enterSceneSpace(ctx, cam));
  drawScene(sc, t);
  [T, K].forEach(ctx => ctx.restore());
  drawOverlay(sc, t);
  halftone({ t, paper: THEME.paper, accent: THEME.accent, ink2: THEME.ink2, ink: THEME.ink, grain: THEME.grain, bloom: THEME.bloom, wipe: wipeAt(t, sc) });
}

/* ---------- the presenter sheet: kit frames <reel> 0 1 2 3 4 5 --only presenter ---------- */
// 0 portrait · 1 poses · 2 expressions · 3 every hairstyle · 4 act() aimed at up-left targets · 5 moods and a stamp
const SHEET_POSES = (up) => [
  ['point', { armL: 'point', pointAng: -45, lean: -4, bodyTurn: -0.2, lookX: -0.6, lookY: -0.4 }], ['point up', { armL: 'point', pointAng: -80, ...up }],
  ['present', { armL: 'present', pointAng: -50, lean: -4, lookX: -0.5, lookY: -0.4, smile: 0.7 }],
  ['frame', { armL: 'frame', armR: 'frame', pointAngL: -70, pointAngR: -95, smile: 0.6, ...up, lean: -3 }],
  ['hold', { armR: 'hold' }], ['thumb', { armR: 'thumb', smile: 0.9 }], ['shrug', { armL: 'shrug', armR: 'shrug', brow: 0.6 }], ['fist', { armR: 'fist', smile: 0.8 }],
  ['wave', { armR: 'wave', wave: 0.5 }], ['facepalm', { armR: 'facepalm', smile: -0.3 }], ['cover', { armR: 'cover', brow: 0.8 }], ['present up', { armL: 'present', pointAng: -82, smile: 0.7, ...up }],
  ['shh', { armR: 'shh', press: 1, brow: 0.4, smile: 0.2 }],
];
const SHEET_FACES = [['neutral', {}], ['smile', { smile: 1, brow: 0.4 }], ['skeptical', { browTilt: 0.7, smile: 0.2 }], ['shock', { shock: 1, mouth: 0.8 }],
  ['worried', { brow: -0.7, smile: -0.5, sweat: 1 }], ['wink', { wink: 1, smile: 0.9 }], ['talking', { jaw: 0.6, lipW: 0.3, teeth: 0.5 }], ['oo', { jaw: 0.4, lipW: -0.9 }], ['mm', { press: 1 }]];
const sheetPages = {
  0(at, lbl) {   // portrait: front, three-quarter talking, pointing
    at(540, 1300, 1.0, {});
    lbl('front', 540, 380);
    at(300, 2000, 0.55, { headTurn: -0.55, lookX: -0.5, headTilt: -4, jaw: 0.45, lipW: 0.4, teeth: 0.5, smile: 0.7 });
    at(800, 2000, 0.55, { headTurn: 0.4, lookX: -0.6, lookY: -0.5, headTilt: 3, armL: 'point', pointAng: -62 });
    lbl('3/4 talking', 300, 1420);
    lbl('pointing (default acting)', 760, 1420);
  },
  1(at, lbl) {
    const up = { lean: -7, bodyTurn: -0.28, headTurn: -0.3, headNod: -0.3, lookX: -0.5, lookY: -0.8 };
    SHEET_POSES(up).forEach(([name, st], i) => {
      const x = 150 + (i % 4) * 260, y = 700 + Math.floor(i / 4) * 390;
      at(x, y, 0.28, st);
      lbl(name, x, y + 34);
    });
  },
  2(at, lbl) {
    SHEET_FACES.forEach(([name, st], i) => {
      const x = 200 + (i % 3) * 340, y = 860 + Math.floor(i / 3) * 500;
      at(x, y, 0.5, st);
      lbl(name, x, y + 40);
    });
  },
  4(at, lbl, T, K, t) {   // the docked presenter usually aims up-left: point, present and frame at three angles
    const s = 0.3;
    const offsets = [[-800, -1112, 'shallow'], [-542, -1290, 'typical'], [-177, -1362, 'steep']];
    ['point', 'present', 'frame'].forEach((pose, row) => offsets.forEach(([dx, dy, name], col) => {
      const g = { x: 250 + col * 360, y: 700 + row * 540, s };
      const spot = [g.x + dx * s, g.y + dy * s];
      circle(K, spot[0], spot[1], 16, C.red);
      circle(K, spot[0], spot[1], 30, null, C.red, 4);
      const st = act(t, { at: g, focus: () => spot, pose, jab: false, gestures: false });
      guy(T, K, t, st);
      const an = PRESENTER.anchors(st);   // a raw act() state: the rings must land on the drawn hands and mouth
      [an.handL, an.handR, an.mouth].filter(Boolean).forEach(p => circle(K, p.x, p.y, 9, null, C.ink, 3));
      lbl(pose + ' · ' + name, g.x - 60, g.y + 36);
    }));
  },
  5(at, lbl, T, K, t) {   // mood() presets with their moodFx, one per cell, and a stamp with a long sub line
    [['panic'], ['shock'], ['thinking', { bubble: [0, -1] }], ['celebrate'], ['shh'], ['shrug']].forEach(([name, extra], i) => {
      const g = { x: 200 + (i % 3) * 340, y: 900 + Math.floor(i / 3) * 520, s: 0.4 };
      const e = extra && extra.bubble ? { bubble: [g.x + 190, g.y - 500] } : extra;   // thinking: its bubble up-right of the head
      const moods = [[name, t - 0.7, t + 2, e]];
      moodFx(T, K, t, moods, { at: g });
      guy(T, K, t, act(t, mood(t, moods, { at: g, focus: null, gestures: false })));
      lbl(name + (e && e.bubble ? ' (bubble: [x, y])' : ''), g.x, g.y + 36);
    });
    stamp(K, T, 'SHIPPED', 540, 1600, 1, { size: 104, rot: -6, sub: 'ON TIME · UNDER BUDGET · NO WEEKEND WORK' });
  },
};
SC.presenter = {
  label: '// presenter', noHeadline: () => true, readout: null,
  draw(T, K, t) {
    const page = Math.floor(t + 0.001);
    const L = PRESENTER.look(window.PRESENTER_LOOK);
    const lbl = (s, x, y) => text(K, s, x, y, { font: F.mono, weight: 500, size: 26, color: '#8a8780' });
    const base = { blink: 0, bob: 0, headTilt: 0, lookX: 0, lookY: 0, jaw: 0, lipW: 0, press: 0.1, teeth: 0, tongue: 0, smile: 0.35, still: true, t };
    const at = (x, y, s, st) => PRESENTER.draw(T, K, { ...base, x, y, s, ...st });
    const extras = (L.glasses ? ' · glasses' : '') + (L.beanie ? ' · beanie' : '');
    text(K, `${L.hair} · ${L.skin} · ${L.top} · beard ${L.beard}${extras}`, W / 2, 230, { font: F.mono, weight: 500, size: 26, color: C.ink });
    if (sheetPages[page]) return sheetPages[page](at, lbl, T, K, t);
    // any other page: every hairstyle in the configured colours, spaced so they all fit
    const styles = PRESENTER.HAIRSTYLES;
    const rowH = Math.min(520, 1220 / Math.max(1, Math.ceil(styles.length / 4) - 1));
    styles.forEach((hair, i) => {
      const x = 160 + (i % 4) * 255, y = 600 + Math.floor(i / 4) * rowH;
      PRESENTER.draw(T, K, { ...base, x, y, s: 0.3, look: { ...window.PRESENTER_LOOK, hair, beanie: false } });
      lbl(hair, x, y + 36);
    });
  },
};

/* ---------- boot ---------- */
const engFetchAs = kind => (url, fallback) => fetch(url, { cache: 'no-store' }).then(r => (r.ok ? r[kind]() : fallback)).catch(() => fallback);
const fetchJSON = engFetchAs('json');
const fetchText = engFetchAs('text');
const loadScript = src => new Promise((resolve, reject) => {
  const tag = Object.assign(document.createElement('script'), { src, onload: resolve, onerror: () => reject(new Error('could not load ' + src)) });
  document.body.appendChild(tag);
});
const ENG_CAPTION_KEYS = ['size', 'maxW', 'x', 'y', 'lead', 'maxWords', 'color', 'emphasis', 'align', 'upper'];
// reel.json → the theme, the colours, the caption settings and the presenter's look
function applyReelSettings() {
  const th = typeof REEL.theme === 'string' ? { preset: REEL.theme } : REEL.theme || {};
  if (th.preset && !THEMES[th.preset]) console.warn('[warn] unknown theme preset "' + th.preset + '" (have: ' + Object.keys(THEMES).join(', ') + ')');
  Object.assign(THEME, THEMES[th.preset] || {});
  ['paper', 'accent', 'ink2', 'ink', 'grain', 'bloom'].filter(k => th[k] !== undefined).forEach(k => { THEME[k] = th[k]; });
  Object.assign(C, { red: THEME.accent, redD: shadeHex(THEME.accent, -0.22), ink: THEME.ink, paper: THEME.paper });
  window.ACCENT = THEME.accent;
  window.THEME_INK = THEME.ink;
  if (REEL.captions && typeof REEL.captions === 'object') ENG_CAPTION_KEYS.filter(k => REEL.captions[k] !== undefined).forEach(k => { CAP[k] = REEL.captions[k]; });
  if (window.STICKER_HOST) STICKER_HOST.setup(REEL);   // local add-on: picture stickers
  if (REEL.presenter && typeof REEL.presenter === 'object') {
    window.PRESENTER_LOOK = REEL.presenter;
    if (REEL.presenter.dock) PRESENTER_DOCK = { ...PRESENTER_DOCK, ...REEL.presenter.dock };
  }
}
// the voice clock: build/words.json, or stand-in timings from script.txt before there is a voice
async function loadWords() {
  let words = await fetchJSON('build/words.json', null);
  if (!Array.isArray(words) || !words.length) {
    console.warn('build/words.json missing: using fake timings from script.txt (run tools/voice.py for the real voice clock)');
    words = fakeWords((await fetchText('script.txt', '')) || 'Write your script in script.txt.');
  }
  WORDS = words.filter(w => w && String(w.w).trim()).map(w => ({ w: String(w.w), s: +w.s, e: +w.e }));
  VO_END = WORDS.length ? WORDS[WORDS.length - 1].e : 3;
  buildSentences();
}
// TIMELINE() (or every registered scene, spread over the voice) → SCENES in time order
function buildScenes() {
  const keys = Object.keys(SC).filter(k => k !== 'presenter');
  const list = TIMELINE ? TIMELINE() : keys.map((k, i) => [k, i === 0 ? 0 : frac(i / Object.keys(SC).length)]);
  SCENES = list.map(([key, start], i) => ({
    label: `// ${String(i + 1).padStart(2, '0')} — ${key}`, readout: READOUT,
    ...(SC[key] || { draw: () => {}, guy: t => act(t) }),
    key, start: i === 0 ? 0 : start,
  }));
  SCENES.sort((a, b) => a.start - b.start);
}
// caption phrases (PHRASES, or automatic) and the key-word times the acting jabs on
function buildPhrases() {
  const phrases = PHRASES || autoPhrases(SCENES.slice(1).map(s => s.start));
  PHRASE_LIST = phrases.map(([i0, i1, em = [], o = {}], n) => ({ n, i0, i1, em, o, s: wi(i0), end: phrases[n + 1] ? wi(phrases[n + 1][0]) - 0.04 : DUR + 1 }));
  EMPH_TIMES = PHRASE_LIST.flatMap(p => p.em.map(i => wi(i)));
}
const ENG_FACES = ['500 100px Figtree', '700 100px Figtree', '800 100px Figtree', '500 100px Oswald', '600 100px Oswald', '700 100px Oswald',
  '500 100px "JetBrains Mono"', '700 100px "JetBrains Mono"', '400 100px Anton', '800 100px "Barlow Condensed"', '700 100px "Barlow Condensed"',
  '500 100px Inter', '700 100px Inter', '800 100px Inter'];
// every font face and image, then the Fallback faces when any word or kit string is outside Latin (Cyrillic, Greek, Arabic, CJK…)
async function loadFacesAndImages() {
  await Promise.all([...ENG_FACES.map(f => document.fonts.load(f).catch(() => {})), ...ASSETS.map(([k, src]) => loadImg(k, src))]);
  const everything = [(WORDS || []).map(w => w.w).join(' '), uiStrings().join(' '), (REEL.cta && REEL.cta.keyword) || ''].join(' ');
  if (!new RegExp(String.raw`[^\u0000-ɏ]`).test(everything)) return;
  await Promise.all(['400 80px Fallback', '500 80px Fallback', '700 80px Fallback', 'italic 400 80px Fallback'].map(f => document.fonts.load(f, everything).catch(() => {})));
}
const studio = window.studio = { grab: 'canvas' };
studio.ready = (async () => {
  REEL = (await fetchJSON('reel.json', {})) || {};
  applyReelSettings();
  await loadWords();
  await loadScript('timeline.js');
  for (const file of SCENE_FILES) await loadScript(file);
  buildScenes();
  DUR = DUR_END();
  studio.length = DUR;
  buildPhrases();
  buildLipSync(WORDS, DUR);
  await loadFacesAndImages();
  studio.cues = SFX_CUES.filter(c => c.t <= DUR).sort((a, b) => a.t - b.t);
  return true;
})();
studio.ready.catch(e => console.error('boot failed: ' + e.message));
studio.show = t => renderFrame(Math.max(0, Math.min(t, DUR - 1e-3)));

// ?t=3.5 draws one frame · ?play plays in real time with the voice (click to start) · otherwise frame 0
function playWithVoice() {
  document.body.classList.add('fit');
  const audio = new Audio(QS.get('audio') || 'audio/vo.mp3');
  const from = +(QS.get('from') || 0);
  let startedAt = null;
  renderFrame(from);
  const tick = () => {
    const t = audio.paused && audio.currentTime === 0 ? (performance.now() - startedAt) / 1000 : audio.currentTime;
    renderFrame(Math.min(t, DUR - 0.001));
    if (t < DUR) requestAnimationFrame(tick);
  };
  document.addEventListener('click', () => {
    audio.currentTime = from;
    audio.play().catch(() => {});
    startedAt = performance.now() - audio.currentTime * 1000;
    tick();
  }, { once: true });
  console.log('click the page to play with audio');
}
studio.ready.then(() => (QS.has('play') ? playWithVoice() : renderFrame(QS.has('t') ? parseFloat(QS.get('t')) : 0)));

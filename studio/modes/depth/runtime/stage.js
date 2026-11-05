// depth · lit rooms. Boots three.js, the shared light rig and the film finish (depth of field, a soft bloom on lamps and
// neon, grain, vignette, a hint of lens fringe and a one-frame jolt on every cut), builds every shot in cuts.js in its own
// corner of the world, and fills window.studio for the kit tools: { ready, length, show(t), grab, cues, quiet, fps }.
//
// How a reel looks: each cut is its own little lit set (a shop at night, a desk by a window, a machine room, a street).
// The camera glides slowly through every shot and springs in on the cut. Bix, the boxy host, acts on the words.
// The flat layer on top carries a taped title, counters, a typing chip, the caption tiles and the comment-box ask.
//
// Project files: reel.json · cuts.js · shots/<id>.js · build/words.json (or script.txt before the voice exists).
// Query: ?t=3.5 one frame · ?play real time (click for audio) · ?only=<shotId> render that shot only.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import * as M from './maths.js';
import { swatch, pickTheme } from './swatch.js';
import { readCuts, guessWords } from './cutlist.js';
import { Overlay } from './overlay.js';
import { Callouts } from './callouts.js';
import * as gear from '../parts/gear.js';
import { buildKit } from '../parts/kit3d.js';
import * as rooms from '../parts/rooms.js';
import { buddy, crowd, LOOK } from '../parts/buddy.js';

const W = 1080, H = 1920, FPS = 30, CORNER = 60;               // shots sit CORNER metres apart on x; only the live one is drawn
const here = new URL('.', location.href);
const query = new URLSearchParams(location.search);
const studio = window.studio = { grab: 'screen' };

function stageDom() {
  document.documentElement.style.cssText = 'margin:0;background:#000;overflow:hidden';
  document.body.style.cssText = 'margin:0;background:#000;overflow:hidden';
  const css = document.createElement('style');
  css.textContent = `#stage{position:relative;width:${W}px;height:${H}px;overflow:hidden;background:#0d0e1c}#c{position:absolute;inset:0;width:${W}px;height:${H}px}#ovl{position:absolute;inset:0;pointer-events:none;overflow:hidden}`;
  document.head.appendChild(css);
  document.body.insertAdjacentHTML('beforeend', `<div id="stage"><canvas id="c" width="${W}" height="${H}"></canvas><div id="ovl"></div></div>`);
}

const FINISH = {
  uniforms: { tDiffuse: { value: null }, uSeed: { value: 0 }, uFringe: { value: 0.0045 }, uJolt: { value: 0 }, uGrain: { value: 0.06 }, uLift: { value: 0.025 }, uRes: { value: new THREE.Vector2(W, H) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uSeed, uFringe, uJolt, uGrain, uLift; uniform vec2 uRes; varying vec2 vUv;
    float n2(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
    void main(){
      vec2 uv = vUv; uv.x += step(0.5, n2(vec2(floor(uv.y * 38.0), uSeed))) * uJolt * 0.012;   // a torn-line jolt on the cut frame
      vec2 c = uv - 0.5; float r = length(c * vec2(0.5625, 1.0)); vec2 off = c * (uFringe + uJolt * 0.01) * (0.4 + r * 2.0);
      vec3 col = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      col = col * (1.0 - uLift) + uLift * vec3(1.0, 0.86, 0.72);                                  // lifted, warm blacks: no muddy navy
      col *= mix(0.62, 1.0, smoothstep(0.64, 0.18, r));                                            // vignette
      col += (n2(floor(uv * uRes / 2.0) + uSeed * 17.13) - 0.5) * uGrain;                         // 2 px film grain
      gl_FragColor = vec4(col, 1.0); }`,
};

async function start() {
  const preview = window.DEPTH_PREVIEW || {};
  const reel = preview.reel ?? (await fetch(new URL('reel.json', here)).then((r) => r.json()).catch(() => ({})));
  pickTheme(reel.theme);
  if (!document.getElementById('stage')) stageDom();

  let words = preview.words ?? (await fetch(new URL('build/words.json', here)).then((r) => r.json()).catch(() => []));
  if (!words.length) {
    console.warn('no build/words.json yet: timing the script by guess (run tools/voice.py for the real clock)');
    words = guessWords(await fetch(new URL('script.txt', here)).then((r) => (r.ok ? r.text() : '')).catch(() => ''));
  }
  const { cuts, length, keys, W: WT } = await readCuts(words, reel, here, preview.cuts);
  // fonts first: signs, cards and screens are painted on canvas while the shots build
  for (const f of ["800 64px Inter", "700 30px 'JetBrains Mono'", "800 64px 'Playfair Display'", "700 40px Inter"]) await document.fonts.load(f).catch(() => null);
  { const all = words.map((w) => w.w).join(' '); if (/[^\u0000-ɏ\s\p{P}\p{N}]/u.test(all)) await Promise.all(['800 68px Fallback', '700 50px Fallback'].map((f) => document.fonts.load(f, all).catch(() => {}))); }
  await document.fonts.ready;

  // ── renderer, scene, environment ──
  const canvas = document.getElementById('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1); renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = reel.exposure ?? 1.0;
  const kit = buildKit(renderer);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0d0e1c);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.34;
  const camera = new THREE.PerspectiveCamera(36, W / H, 0.05, 80);

  // ── the light rig: the same five lights in every shot (no shader recompiles); each shot's set places them ──
  const key = new THREE.SpotLight(0xffd3a4, 0, 12, 0.8, 0.65, 1.6); key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0006; key.shadow.normalBias = 0.02;
  const accent = new THREE.SpotLight(0xffe2bd, 0, 12, 0.6, 0.7, 1.6); accent.castShadow = true; accent.shadow.mapSize.set(1024, 1024); accent.shadow.bias = -0.0008;
  const fill = new THREE.SpotLight(0xfff0e0, 0, 16, 0.5, 0.8, 1.5);
  const rim = new THREE.DirectionalLight(0x9aa4ff, 0.9), sky = new THREE.HemisphereLight(0xc9d0ff, 0x5a3c24, 0.8);
  [key, accent, fill].forEach((l) => scene.add(l, l.target)); scene.add(rim, rim.target, sky);
  const rig = { key, accent, fill, rim, sky };
  // a set's light() may stretch a light (the city sets distance 0, decay 1): every frame starts from these defaults again
  const RIG0 = [key, accent, fill].map((l) => [l, l.distance, l.decay, l.penumbra, l.angle]), SKY0 = sky.intensity;
  const resetRig = () => { RIG0.forEach(([l, d, dc, p, a]) => { l.distance = d; l.decay = dc; l.penumbra = p; l.angle = a; }); sky.intensity = SKY0; };

  // ── the finish ──
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 }));
  composer.setPixelRatio(1); composer.setSize(W, H);
  composer.addPass(new RenderPass(scene, camera));
  const dof = new BokehPass(scene, camera, { focus: 6, aperture: 0.002, maxblur: 0.0065 }); composer.addPass(dof);
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), reel.bloom ?? 0.32, 0.4, 1.12);   /* threshold above 1: only lamps, neon and screens glow, never a lit hat */ composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const finish = new ShaderPass(FINISH); composer.addPass(finish);
  if (reel.grain != null) finish.uniforms.uGrain.value = reel.grain;
  if (reel.lift != null) finish.uniforms.uLift.value = reel.lift;

  // ── what a shot gets ──
  const SFX = [], punches = [], shakes = [];
  const callouts = new Callouts(document.getElementById('ovl'), camera, swatch.accent);
  let building = null;                                          // the shot whose build() is running (k.label binds to it)
  const overlay = new Overlay(document.getElementById('ovl'), WT.list, { accent: swatch.accent, keys: [...keys, ...((reel.tiles || {}).keys || [])], tiles: reel.tiles || {}, tape: reel.tape !== false });
  const k = {
    THREE, scene, camera, renderer, swatch, kit, rooms, rig, gear, ...M,
    buddy: (o, parent) => buddy(o, parent), crowd: (n, parent, s) => crowd(n, parent, s), LOOK,
    words: WT.list, lines: WT.lines, length, reel,
    at: (phrase, nth = 0, after = 0) => WT.at(phrase, after, nth),
    sound(t, name, db = 0) { if (t != null && isFinite(t)) SFX.push({ t: +Math.max(0, t).toFixed(3), name, gain: db }); },
    punch(t, amount = 1) { if (isFinite(t)) punches.push([t, amount]); },
    shake(t, amount = 1) { if (isFinite(t)) shakes.push([t, amount]); },
    // a card-stock label pinned to a 3D point with a leader line (runtime/callouts.js has the options)
    label(key, point, text, o = {}) { const sh = o.shot || building; if (!sh) { console.error('k.label: call it inside a shot build()'); return null; } return callouts.add(key, sh, point, text, o); },
  };
  window.k = k;

  const only = query.get('only');
  const shots = [];
  for (const [i, cut] of cuts.entries()) {
    const root = new THREE.Group(); root.name = cut.id; root.position.set(i * CORNER, 0, 0); scene.add(root);
    const shot = { id: cut.id, n: i, cut, root, t0: cut.t0, t1: cut.t1, len: cut.t1 - cut.t0, words: WT.list.filter((w) => w.s >= cut.t0 - 0.02 && w.s < cut.t1 - 0.02) };
    shot.line = shot.words.map((w) => w.text).join(' ');
    shot.at = (phrase, fallback = 0.5, nth = 0) => {             // when the word is said inside this shot, else a time inside the shot
      if (typeof phrase === 'number') return shot.w(phrase, fallback);
      const t = WT.at(phrase, shot.t0 - 0.3, nth);
      return t != null && t < shot.t1 + 0.3 ? t : shot.t0 + M.clamp(fallback) * shot.len;
    };
    shot.w = (j, fallback = null) => { const ws = shot.words; if (!ws.length) return shot.t0 + (fallback ?? 0) * shot.len; const x = j < 0 ? ws.length + j : j; return x >= 0 && x < ws.length ? ws[x].s : fallback != null ? shot.t0 + fallback * shot.len : ws[M.clamp(x, 0, ws.length - 1)].s; };
    shot.u = (t) => M.clamp((t - shot.t0) / shot.len);
    shot.toWorld = (x, y, z) => new THREE.Vector3(x + root.position.x, y, z);
    let mod = null;
    try { mod = preview.shots?.[cut.id] ?? (await import(new URL(`shots/${cut.id}.js`, here).href)).default; }
    catch (e) { console.error(`shot "${cut.id}" is missing or broken (shots/${cut.id}.js):`, e.message); mod = {}; }
    shots.push({ shot, mod: mod || {} });
  }
  for (const s of shots) { building = s.shot; try { await s.mod.build?.(k, s.shot); } catch (e) { console.error('build failed in shot', s.shot.id, e); s.dead = true; } }
  building = null;
  // whip and swoop cuts bring their own air: a whoosh just before the cut (cut.sound: false to skip it)
  cuts.forEach((c) => { if ((c.turn === 'whip' || c.turn === 'swoop') && c.sound !== false) k.sound(c.t0 - 0.1, c.turn === 'whip' ? 'whoosh' : 'swoosh', c.turn === 'whip' ? -8 : -7); });
  SFX.sort((a, b) => a.t - b.t);
  studio.cues = SFX.filter((c) => c.t >= 0 && c.t < length);
  studio.quiet = reel.tape === false ? [] : [{ t0: 0, ignore: [[160, 196, 760, 116]] }];   // the taped title is chrome: kit pace leaves it out

  const cutAt = (t) => { const i = cuts.findIndex((c) => t >= c.t0 && t < c.t1); return i < 0 ? (t < 0 ? 0 : cuts.length - 1) : i; };
  const onlyAt = only ? shots.findIndex((s) => s.shot.id === only) : -1;
  if (only && onlyAt < 0) console.error(`?only=${only}: no such shot (have ${cuts.map((c) => c.id).join(', ')})`);

  const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const DEFAULT_VIEW = { from: [0, 1.6, 3.6], to: [0, 1.5, 3.2], look0: [0, 0.9, -1.5], look1: [0, 0.9, -1.5], fov: 38, ap: 0.002 };
  function viewOf(s, t) {
    let v = null;
    try { v = !s.dead && s.mod.view ? s.mod.view(k, t, s.shot) : null; } catch (e) { console.error('view failed in shot', s.shot.id, e); }
    if (typeof v === 'string') v = s.shot.set?.views?.[v];
    if (!v) v = s.shot.set?.views ? Object.values(s.shot.set.views)[0] : null;
    return { ...DEFAULT_VIEW, ...(v || {}) };
  }

  // ── one frame ──
  const show = studio.show = (tOut) => {
    let t = Math.min(Math.max(0, tOut), length - 0.001);
    let i = cutAt(t);
    if (onlyAt >= 0 && i !== onlyAt) { i = onlyAt; t = M.clamp(t, cuts[i].t0, cuts[i].t1 - 0.001); }
    const s = shots[i], shot = s.shot, u = t - shot.t0, f = Math.round(tOut * FPS);
    shots.forEach((x, j) => { x.shot.root.visible = j === i; });
    if (!s.dead && s.mod.frame) { try { s.mod.frame(k, t, shot); } catch (e) { console.error('frame failed in shot', shot.id, e); } }

    // camera: glide from → to (a touch of ease so it never stops dead), spring in from `kick` on the cut, breathe
    const v = viewOf(s, t), kk = 0.6 * shot.u(t) + 0.4 * M.ease.both(shot.u(t));
    const ox = shot.root.position.x;
    // a view can be a spline: path: [[x,y,z], …] for the lens (lookPath for the target), eased across the shot; roll in degrees (or [from, to])
    const along = (pts) => new THREE.CatmullRomCurve3(pts.map(v3), false, 'centripetal').getPointAt(M.clamp(kk));
    const pos = v.path ? along(v.path) : v.pos ? v3(v.pos) : v3(v.from).lerp(v3(v.to), kk);
    const look = v.lookPath ? along(v.lookPath) : v.look ? v3(v.look) : v3(v.look0).lerp(v3(v.look1), kk);
    if (shot.n > 0 || u < 0.9) pos.add(v3(v.kick || [0, 0.3, 0.6]).multiplyScalar(shot.n > 0 ? 1 - M.settle(u, 2.0, 0.78) : 0));
    pos.x += ox + 0.012 * M.wander(t * 0.7, 1); pos.y += 0.009 * M.wander(t * 0.6, 2); look.x += ox;
    let fov = v.fov;
    for (const [tp, a] of punches) { const b = M.bump(t - tp, 0.34); pos.lerp(look, 0.07 * a * b); }
    for (const [ts, a] of shakes) { const e = t >= ts ? Math.exp(-(t - ts) * 9) : 0; pos.x += Math.sin((t - ts) * 71) * 0.03 * a * e; pos.y += Math.cos((t - ts) * 63) * 0.02 * a * e; }
    camera.position.copy(pos); camera.fov = fov; camera.updateProjectionMatrix(); camera.lookAt(look);
    if (v.roll != null) camera.rotateZ(M.deg(Array.isArray(v.roll) ? M.lerp(v.roll[0], v.roll[1], kk) : v.roll));
    // whip (a fast pan) and swoop (a fast tilt) across a cut: the outgoing shot turns away in its last 0.16 s, the incoming
    // one arrives turning from the other side in its first 0.24 s, so the motion runs on through the cut
    const OUT = 0.16, IN = 0.24, next = cuts[i + 1];
    let turn = null, amt = 0, tdir = 1;
    if (next && (next.turn === 'whip' || next.turn === 'swoop') && t > cuts[i].t1 - OUT) { turn = next.turn; tdir = next.dir ?? 1; amt = M.ease.in((t - (cuts[i].t1 - OUT)) / OUT); }
    else if ((cuts[i].turn === 'whip' || cuts[i].turn === 'swoop') && u < IN) { turn = cuts[i].turn; tdir = cuts[i].dir ?? 1; amt = -(1 - M.ease.out(u / IN)); }
    if (turn === 'whip') camera.rotateY(-tdir * amt * 0.95);
    if (turn === 'swoop') camera.rotateX(-tdir * amt * 0.75);
    camera.updateMatrixWorld();

    // lights: the shot's own lights() if it has one, else its set's preset
    const at = (x, y, z) => new THREE.Vector3(x + ox, y, z);
    resetRig();
    try { if (s.mod.lights) s.mod.lights(k, t, shot, rig, at); else if (shot.set?.light) shot.set.light(rig, at, t); } catch (e) { console.error('lights failed in shot', shot.id, e); }

    // depth of field holds the view's focus point (or the set's)
    const fp = v.focus ? v3(v.focus) : shot.set?.focus ? shot.set.focus.clone() : look.clone().setX(look.x - ox);
    fp.x += ox; dof.uniforms.focus.value = camera.position.distanceTo(fp); dof.uniforms.aperture.value = v.ap;
    finish.uniforms.uSeed.value = f; finish.uniforms.uJolt.value = u < 1.5 / FPS && i > 0 && cuts[i].turn === 'cut' ? 1 : 0;
    overlay.frame(t, shot, FPS);
    callouts.frame(t, shot); callouts.streak(turn, Math.abs(amt), turn === 'whip' ? tdir : -tdir);
    composer.render();
    return true;
  };
  studio.length = length;
  studio.fps = FPS;

  for (const s of shots) show(s.shot.t0 + Math.min(0.4, s.shot.len / 2));   // compile every set's shaders up front
  if (query.has('t')) show(parseFloat(query.get('t')));
  else if (query.has('play')) {
    const audio = new Audio(new URL('audio/vo.mp3', here).href);
    let since = performance.now(), on = false;
    document.addEventListener('click', () => { audio.currentTime = 0; audio.play().catch(() => {}); since = performance.now(); on = true; });
    const tick = () => { show((on && !audio.paused ? audio.currentTime : (performance.now() - since) / 1000) % length); requestAnimationFrame(tick); };
    tick();
  } else show(Math.min(2, length / 2));
  return true;
}

studio.ready = start().catch((e) => { console.error('depth failed to start:', e); throw e; });

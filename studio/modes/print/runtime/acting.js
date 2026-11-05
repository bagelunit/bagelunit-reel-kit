/* Susanoo Reel Kit print · acting
   Directing the presenter. A scene's guy(t) returns a presenter state ({ x, y, s, armL, armR, armLp, armRp, pointAng, brow,
   smile, … }, see the guide). act(t, options) builds a fully acted one: it points at the focus, changes gesture and face every
   phrase, jabs on the key words, and turns its eyes, head and body toward what it points at. arms() and expr() take hand-written
   beats for special moments. */
let PRESENTER_DOCK = { x: 842, y: 1990, s: 0.8 };   // home: the bust in the bottom-right corner; every scene starts and ends here

// the acting's tuning, in one place
const ACT = {
  shoulderX: 226, shoulderY: 264, headY: 575,            // bust geometry at s = 1
  sideBias: 150,                                         // a target further right than this (× s) is pointed at with the right arm
  jabDeg: 7, jabDur: 0.3,                                // finger dip on key words
  steepFrom: -78, steepLimit: -200, steepSpan: 30, steepKeep: 0.12,   // aims steeper than -78° flatten into a reach beside the head
  frameMin: -70, frameMax: 60, frameMinDur: 0.9,         // when the free hand may frame the target too
  gestureMinDur: 0.7,
  gazeRange: 520, gazeX: 0.75, gazeY: 0.7, headTurnK: 0.3,
  leanRange: 480, leanDeg: 4, turnK: 0.28, stepPx: 26, liftRange: 700, liftPx: 14, nodK: 0.3,
  faceRiseIn: 0.1, faceFadeOut: 0.3, segFade: 0.24, mixDur: 0.3,
};

// a soft on/off window: 0 before t0, eases up over rin, back down over rout after t1
const win = (t, t0, t1, rin = 0.22, rout = 0.25) => {
  const rise = E.inOutCubic(clamp((t - t0) / rin));
  const fall = 1 - E.inOutCubic(clamp((t - t1) / rout));
  return Math.min(rise, fall);
};
// add numbers onto a state's fields (a missing field counts as 0)
const actAdd = (state, deltas) => {
  for (const k in deltas) state[k] = (state[k] || 0) + deltas[k];
  return state;
};
// arm beats [[t0, t1, 'L' | 'R' | 'LR', pose, {extra state}]] → { armL, armR, armLp, armRp, …extra }; later beats win.
// poses: point (aimed by pointAng in degrees: 0 out to the side, -90 straight up, 90 down) · wave (st.wave = swing phase) · thumb ·
// shrug · facepalm · cover (hand over the mouth) · hold (palm up) · fist · shh · present · frame · down
function arms(t, list) {
  return list.reduce((state, [t0, t1, side, name, extra]) => {
    const amount = win(t, t0, t1);
    if (amount > 0) {
      for (const s of side) Object.assign(state, { ['arm' + s]: name, ['arm' + s + 'p']: amount });
      Object.assign(state, extra || {});
    }
    return state;
  }, { armL: 'down', armR: 'down', armLp: 0, armRp: 0 });
}
// face beats [[t0, t1, {numbers}]], each faded in and out and added up (brow, smile, browTilt, lookX, lookY, headTilt, shock…)
function expr(t, list) {
  return list.reduce((sum, [t0, t1, props]) => {
    const amount = win(t, t0, t1, ACT.faceRiseIn, ACT.faceFadeOut);
    if (amount <= 0) return sum;
    return actAdd(sum, Object.fromEntries(Object.entries(props).map(([k, v]) => [k, v * amount])));
  }, {});
}
const enterY = (t, t0, dist = 900) => (1 - pop(t - t0, 2.0, 0.55)) * dist;            // springs up from below (add to y)
const exitY = (t, t0, d = 0.4, dist = 1600) => -E.inBack(clamp((t - t0) / d)) * dist;   // flies up and out
const inAt = (t, t0, f = 2.6, z = 0.5) => pop(t - t0, f, z);                            // a spring 0 → 1 from t0
// a bump 0 → 1 → 0 after each time in ts (jabs, nods)
const pulses = (t, ts, dur = 0.32) => Math.max(0, ...ts.map(x => (t >= x ? Math.sin(Math.PI * clamp((t - x) / dur)) : 0)));

// presenter geometry (scene space) for a bust at {x, y, s}: an arm's shoulder, the pointAng that aims that arm at (tx, ty), the head
const shoulderAt = (g, side) => [g.x + (side === 'L' ? -ACT.shoulderX : ACT.shoulderX) * g.s, g.y - ACT.shoulderY * g.s];
function aimAt(g, side, tx, ty) {
  const [sx, sy] = shoulderAt(g, side);
  const run = tx - sx;
  return Math.atan2(ty - sy, side === 'L' ? -run : run) / D2R;
}
const headAt = g => [g.x, g.y - ACT.headY * g.s];

// the variety, picked per phrase (always the same for the same phrase): faces, free-hand gestures, and the pointing pose
const FACES = 'brow=.45 smile=.55|browTilt=.5 smile=.35|brow=.75 smile=.8|brow=.15 smile=.25 headNod=.2|brow=.6 smile=.65|brow=-.25 smile=.1|brow=.35 smile=.9|browTilt=.35 smile=.5'
  .split('|').map(face => Object.fromEntries(face.split(' ').map(pair => [pair.split('=')[0], +pair.split('=')[1]])));
const GESTURES = ',hold,,fist,,,hold,'.split(',').map(g => g || null);
const POINT_POSES = 'point point present point frame point present point'.split(' ');
const ACT_HEAD_TILTS = [3, -2.5, 4, -3.5, 1.5, -1];
const actCycle = (list, n, mul, add) => list[(n * mul + add) % list.length];
// a phrase's pointing pose. A two-hand frame needs a long enough phrase and a free hand that can reach the target without crossing
// the head (frameOk); otherwise it becomes an open-palm present (two hands up beside the head read as a salute).
const _poseOf = (p, frameOk = true) => {
  if (!p) return 'point';
  const pick = actCycle(POINT_POSES, p.n, 3, 1);
  if (pick !== 'frame') return pick;
  return p.end - p.s < ACT.frameMinDur || !frameOk ? 'present' : pick;
};
const actOtherArm = s => (s === 'L' ? 'R' : 'L');
// an aim steeper than ACT.steepFrom (the target right above the bust) keeps only a little of its extra steepness
const actEaseSteep = a => (a < ACT.steepFrom && a > ACT.steepLimit ? ACT.steepFrom + (a - ACT.steepFrom) * ACT.steepKeep : a);
const actValue = (v, t) => (typeof v === 'function' ? v(t) : v);

/* act(t, o) → a presenter state
   o.at        {x, y, s} or t => {x, y, s}        where the bust stands (default PRESENTER_DOCK)
   o.focus     t => [x, y] | null                 what it points at (scene space); pointing is the default state
               or [[t0, t1, x, y], …]              pointing segments (faded in and out); x / y may be functions of t
   o.side      'L' | 'R' | 'auto'                 the pointing arm (auto: the one on the target's side; L = screen-left)
   o.beats     [[t0, t1, side, pose, extra]]      extra arm beats, over the automatic pointing and gestures
   o.faces     [[t0, t1, {brow, smile, …}]]       extra face beats, added on top
   o.gestures  false                              no automatic free-hand gestures
   o.poses     false                              always the plain point (no present / two-hand frame variety)
   o.pose      'point' | 'present' | 'frame'      one pointing pose for the whole call
   o.lean      false                              no automatic lean, step and turn toward the target
   o.jab       false                              no finger jabs and brow pops on key words
   o.extra     {…}                                merged last (e.g. { shock: 0.4 }) */

// the target at t and how strongly it holds (segments fade in and out; the last live segment wins)
function actFocusAt(t, focus) {
  const none = { target: null, weight: 0 };
  if (typeof focus === 'function') {
    const spot = focus(t);
    return spot ? { target: spot, weight: 1 } : none;
  }
  if (!Array.isArray(focus)) return none;
  return focus.reduce((found, [t0, t1, x, y]) => {
    const weight = win(t, t0, t1, ACT.segFade, ACT.segFade);
    return weight > 0 ? { target: [actValue(x, t), actValue(y, t)], weight } : found;
  }, none);
}
// the pointing pose now and in the phrase before (fully pointing only): forced by o.pose, else the per-phrase actCycle unless o.poses is off
function actPoses(o, ph, frameOk) {
  if (o.pose) {
    const forced = o.pose === 'frame' && !frameOk ? 'present' : o.pose;
    return { pose: forced, prevPose: forced };
  }
  if (o.poses === false) return {};
  const before = ph && PHRASE_LIST.find(p => p.n === ph.n - 1);
  return { pose: _poseOf(ph, frameOk), prevPose: _poseOf(before, frameOk) };
}
// the pointing beats for this frame → { beats, side, pose, prevPose, steep }
function actPointing(t, g, o, ph, target, weight) {
  const plan = { beats: [], side: 'L', pose: 'point', prevPose: 'point', steep: 0 };
  if (!target) return plan;
  const [tx, ty] = target;
  const side = o.side && o.side !== 'auto' ? o.side : tx > g.x + ACT.sideBias * g.s ? 'R' : 'L';
  const free = actOtherArm(side);
  const freeAim = aimAt(g, free, tx, ty);
  plan.side = side;
  if (weight >= 1) Object.assign(plan, actPoses(o, ph, freeAim > ACT.frameMin && freeAim < ACT.frameMax));
  const jabbing = o.jab !== false && plan.pose === 'point';
  const raw = aimAt(g, side, tx, ty) - ACT.jabDeg * (jabbing ? pulses(t, EMPH_TIMES, ACT.jabDur) : 0);
  const steep = raw < ACT.steepFrom && raw > ACT.steepLimit;
  if (steep) plan.steep = clamp((ACT.steepFrom - raw) / ACT.steepSpan);
  const ang = steep ? actEaseSteep(raw) : raw;
  const aim = { pointAng: ang, ['pointAng' + side]: ang };
  if (plan.pose === 'frame') aim['pointAng' + free] = actEaseSteep(aimAt(g, free, tx, ty));   // the other hand frames it too
  plan.beats.push([-1e9, 1e9, side, plan.pose, aim]);
  const framing = plan.pose === 'frame' && (ph || o.pose);
  if (framing) plan.beats.push(o.pose ? [-1e9, 1e9, free, 'frame'] : [ph.s + 0.02, ph.end - 0.08, free, 'frame']);
  if (weight < 1) aim[`arm${side}p`] = weight;
  return plan;
}
// the face beats around t: a preset per phrase, a brow pop on each key word, then the scene's own
function actFaces(t, o) {
  const nearby = PHRASE_LIST.filter(p => t > p.s - 0.4 && t < p.end + 0.5);
  const faces = nearby.map(p => [p.s - 0.08, p.end, actCycle(FACES, p.n, 3, 1)]);
  if (o.jab !== false) for (const et of EMPH_TIMES) if (Math.abs(t - et) < 0.6) faces.push([et - 0.04, et + 0.18, { brow: 0.3 }]);
  return o.faces ? faces.concat(o.faces) : faces;
}
// eyes, head and body turn toward the target (adds onto st)
function actFollow(st, g, target, weight, steep, lean) {
  const [hx, hy] = headAt(g);
  const reach = (from, to, range) => clamp((to - from) / range, -1, 1);
  const gazeX = target ? reach(hx, target[0], ACT.gazeRange) * ACT.gazeX * weight : 0;
  const gazeY = target ? reach(hy, target[1], ACT.gazeRange) * ACT.gazeY * weight : 0;
  actAdd(st, { lookX: gazeX, lookY: gazeY, headTurn: gazeX * ACT.headTurnK });
  if (!target || !lean) return;
  // a lean and a turn toward it, a small step, the head tipped back for a target above it
  const toward = reach(g.x, target[0], ACT.leanRange) * weight;
  const above = clamp((hy - target[1]) / ACT.liftRange) * weight;
  actAdd(st, {
    lean: toward * (ACT.leanDeg + ACT.leanDeg * steep), bodyTurn: toward * ACT.turnK, x: toward * ACT.stepPx * g.s,
    y: -(above * ACT.liftPx * g.s), headNod: -(above * ACT.nodK),
  });
}
function act(t, o = {}) {
  const g = actValue(o.at || PRESENTER_DOCK, t);
  const st = { x: g.x, y: g.y, s: g.s };
  const ph = phraseAt(t);
  const { target, weight } = actFocusAt(t, o.focus);
  const plan = actPointing(t, g, o, ph, target, weight);
  const beats = plan.beats;
  const gesture = ph && o.gestures !== false && plan.pose !== 'frame' ? actCycle(GESTURES, ph.n, 5, 3) : null;   // a free-hand gesture per phrase
  if (gesture && ph.end - ph.s > ACT.gestureMinDur) beats.push([ph.s + 0.05, ph.end - 0.12, actOtherArm(plan.side), gesture]);
  if (o.beats) beats.push(...o.beats);
  const armState = arms(t, beats);
  const name = 'arm' + plan.side;
  if (target && weight < 1 && armState[name] === 'point') armState[name + 'p'] = Math.min(armState[name + 'p'], weight);
  // a new pose at a phrase change cross-fades from the last phrase's pose, so the arm stays up
  const settled = armState[name] === plan.pose && armState[name + 'p'] >= 0.999;
  if (target && ph && plan.prevPose !== plan.pose && settled) {
    armState[name + 'From'] = plan.prevPose;
    armState[name + 'Mix'] = E.inOutCubic(clamp((t - ph.s + 0.06) / ACT.mixDur));
  }
  Object.assign(st, armState, expr(t, actFaces(t, o)));
  actFollow(st, g, target, weight, plan.steep, o.lean !== false);
  actAdd(st, { headTilt: PHRASE_LIST.reduce((sum, p) => sum + ACT_HEAD_TILTS[p.n % ACT_HEAD_TILTS.length] * win(t, p.s - 0.05, p.end, 0.25, 0.3), 0) });
  if (o.extra) Object.assign(st, o.extra);
  st.t = t;   // lets PRESENTER.anchors(st) normalise this raw state itself
  return st;
}

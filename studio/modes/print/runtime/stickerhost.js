/* LOCAL ADD-ON (added 2026-11-05, see studio LOCAL-CHANGES.md)
   Picture-sticker presenter for print reels: instead of the code-drawn bust, show pose images (transparent PNGs that already
   carry their own die-cut sticker border) and switch pose with a pop on cues, phrases and the acting state.

   reel.json:
     "presenter": {
       "type": "stickers",
       "dir": "host",                      // folder in the reel with <pose>.png files (copy or symlink the brand's pose set)
       "height": 600,                      // drawn height in px at dock scale 0.8
       "lift": 120,                        // px the sticker sits above the dock point, so the chest logo stays inside the frame
       "hold": 1.4,                        // seconds a word cue keeps its pose
       "cues": [["three", "three"], ["first", "one", 1], ...],   // [word, pose, nth occurrence (1-based, default 1)]
       "dock": { "x": 842, "y": 1990, "s": 0.8 }
     }
   A scene can force a pose: guy: t => ({ ...act(t, {...}), pose: 'magnifier' }).
   Everything is a pure function of t (frames render in any order). */
const STICKER_HOST = (() => {
  const POSES = ['idle', 'point', 'guns', 'thumbs', 'shock', 'shrug', 'think', 'wave', 'magnifier', 'open', 'tshirt',
    'one', 'two', 'three', 'four', 'five', 'celebrate', 'facepalm', 'raise'];
  const ARM_TO_POSE = { facepalm: 'facepalm', cover: 'facepalm', shrug: 'shrug', thumb: 'thumbs', wave: 'wave', fist: 'celebrate',
    hold: 'open', present: 'open', point: 'point', frame: 'point', shh: 'idle', down: 'idle' };
  const api = { on: false };
  let cfg = null;
  let cueTimes = null;

  api.setup = reel => {
    const p = reel && reel.presenter;
    if (!p || typeof p !== 'object' || p.type !== 'stickers') return false;
    cfg = { dir: 'host', height: 600, lift: 120, hold: 1.4, cues: [], poses: POSES, ...p };
    cfg.poses.forEach(n => ASSETS.push(['stk_' + n, cfg.dir + '/' + n + '.png']));
    api.on = true;
    return true;
  };

  const clean = w => String(w).toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
  function resolveCues() {
    if (cueTimes) return cueTimes;
    cueTimes = [];
    (cfg.cues || []).forEach(([word, pose, nth = 1]) => {
      let seen = 0;
      for (const w of WORDS || []) {
        if (clean(w.w) === clean(word) && ++seen === nth) { cueTimes.push({ s: w.s, pose }); break; }
      }
      if (seen < nth) console.warn('[stickers] cue word not found: ' + word + ' #' + nth);
    });
    cueTimes.sort((a, b) => a.s - b.s);
    return cueTimes;
  }
  const activeCue = t => {
    let hit = null;
    for (const c of resolveCues()) if (c.s <= t && t < c.s + cfg.hold) hit = c;
    return hit;
  };
  function phraseStart(t) {
    let s = 0;
    for (const p of (typeof PHRASE_LIST !== 'undefined' ? PHRASE_LIST : [])) if (p.s <= t) s = p.s;
    return s;
  }
  function poseFor(t, st) {
    if (st.pose && cfg.poses.includes(st.pose)) return { pose: st.pose, since: t - phraseStart(t) };
    const cue = activeCue(t);
    if (cue) return { pose: cue.pose, since: t - cue.s };
    const since = t - phraseStart(t);
    if ((st.shock || 0) > 0.45) return { pose: 'shock', since };
    if ((st.wink || 0) > 0.5) return { pose: 'guns', since };
    for (const arm of [st.armL, st.armR]) {
      if (arm && ARM_TO_POSE[arm] && ARM_TO_POSE[arm] !== 'point' && ARM_TO_POSE[arm] !== 'idle') return { pose: ARM_TO_POSE[arm], since };
    }
    if ((st.armL && ARM_TO_POSE[st.armL] === 'point') || (st.armR && ARM_TO_POSE[st.armR] === 'point')) return { pose: 'point', since };
    return { pose: 'idle', since };
  }

  // the pop when a pose changes: starts a little small, overshoots, settles (a damped spring)
  const pop = since => (since >= 0 && since < 0.45 ? 1 - 0.16 * Math.exp(-since * 11) * Math.cos(since * 24) : 1);

  api.draw = (K, t, st) => {
    const { pose, since } = poseFor(t, st);
    const im = hasPixels(IMG['stk_' + pose]) ? IMG['stk_' + pose] : IMG.stk_idle;
    if (!hasPixels(im)) return;
    const s = (st.s ?? 0.8) / 0.8;
    const h = cfg.height * s * pop(since) * (st.sy || 1);
    const w = h * im.naturalWidth / im.naturalHeight;
    const x = st.x ?? PRESENTER_DOCK.x;
    const y = (st.y ?? PRESENTER_DOCK.y) - cfg.lift * s + (st.bob || 0);
    const rot = ((st.headTilt || 0) * 0.35 + (st.rot || 0)) * Math.PI / 180;
    K.save();
    K.translate(x, y);
    K.rotate(rot);
    K.drawImage(im, -w / 2, -h, w, h);   // anchored at the bust's bottom centre, like the code presenter
    K.restore();
  };
  return api;
})();
window.STICKER_HOST = STICKER_HOST;

// ───────────────────────── talking engine: boot + page contract ─────────────────────────
// What the kit tools read: window.studio = { ready, length, show(t), grab: 'screen', cues, quiet } (tools/session.mjs);
// quiet = the face regions the motion gate ignores.
// Boot order: reel.json (theme) → build/words.json (or fake timings from script.txt) → build/face.json (the take from
// tools/take.py; none = placeholder silhouette) → the scene files (reel.json "scenes", default ["scenes.js"]) → captions →
// fonts + images → measure (TH.later callbacks) → READY.
// Query: ?t=3.5 one frame · ?play real time with audio/vo.mp3 (click to start) · ?only=<sceneId> that scene for every t
(function () {
  const QS = new URLSearchParams(location.search);
  const fetchJSON = (u, d) => fetch(u, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : d)).catch(() => d);
  const fetchText = (u, d) => fetch(u, { cache: 'no-store' }).then((r) => (r.ok ? r.text() : d)).catch(() => d);
  const loadScript = (src) => new Promise((res) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { console.error('could not load ' + src); res(); }; document.body.appendChild(s); });
  // no voice yet: ~2.7 words per second from script.txt (lines starting with # are notes)
  const fakeWords = (txt) => { const out = []; let t = 0.2;
    for (const w of txt.split('\n').filter((l) => !l.trim().startsWith('#')).join(' ').split(/\s+/).filter(Boolean)) {
      const d = 0.16 + Math.min(0.3, w.length * 0.03); out.push({ w, s: +t.toFixed(3), e: +(t + d).toFixed(3) }); t += d + 0.05 + (/[.!?]$/.test(w) ? 0.3 : /[,:;]$/.test(w) ? 0.12 : 0); }
    return out; };
  // default caption KEY words when the scenes don't call TH.captions: reel.json captions.key + numbers + the CTA keyword + names
  const autoKeys = (R) => { const cap = R.captions || {}, K = new Set((cap.key || cap.emphasize || []).map(TH.norm));
    const kw = R.cta && R.cta.keyword ? TH.norm(R.cta.keyword) : ''; if (kw) K.add(kw);
    TH.W.forEach((w, i) => { const raw = w.text.replace(/^["“(]+/, ''), prev = TH.W[i - 1];
      if (/\d/.test(w.n)) K.add(w.n);
      else if (/^\p{Lu}/u.test(raw) && w.n.length > 2 && prev && !/[.!?:]["”]?$/.test(prev.text) && w.n !== "i'm" && w.n !== "i'll") K.add(w.n); });
    return K; };

  const studio = window.studio = { grab: 'screen' };
  studio.ready = (async () => {
    TH.build();
    const R = window.REEL = (await fetchJSON('reel.json', {})) || {};
    TH.applyTheme(R.theme || 'studio');
    TH.placeholder();
    TH.FACEADJ = R.face || {};
    let words = await fetchJSON('build/words.json', null);
    if (!Array.isArray(words) || !words.length) { console.error('[warn] build/words.json missing: fake timings from script.txt (run tools/take.py on your take)'); words = fakeWords((await fetchText('script.txt', '')) || 'Record your take and run tools take.py.'); }
    const face = await fetchJSON('build/face.json', null);
    if (face && face.n > 0) TH.useFace(face);
    TH.initWords(words, { dur: face && face.n > 0 ? face.n / (face.fps || 30) : null, tail: R.tail ?? 0.6 });
    TH.ONLY = QS.get('only');
    Object.assign(window, { T: TH.T, Tend: TH.Tend, mk: TH.mk, pop: TH.pop, tl: TH.tl, C: TH.C });
    for (const f of R.scenes || ['scenes.js']) await loadScript(f);
    if (!TH.CH) TH.captions(autoKeys(R), { hot: (R.captions && R.captions.hot) || [] });
    if (R.captions === false) TH.capsOff = true;
    TH.finalize();
    const fonts = ['400 100px Anton', '500 100px Figtree', '700 100px Figtree', '800 100px Figtree', '500 100px Oswald', '600 100px Oswald',
      '500 100px "JetBrains Mono"', '700 100px "JetBrains Mono"', '700 100px Caveat'];
    await Promise.all(fonts.map((f) => document.fonts.load(f).catch(() => {})));
    await document.fonts.ready;
    await Promise.all([...document.images].filter((i) => i.getAttribute('src')).map((i) => i.decode().catch(() => console.error('[warn] image failed to load: ' + i.getAttribute('src')))));
    // measure with every scene visible (rectOf needs layout), then hide them again
    TH.tl.seek(0);
    document.querySelectorAll('.sc').forEach((e) => (e.style.display = 'block'));
    for (const fn of TH.onReady) { try { fn(); } catch (e) { console.error('TH.later callback failed: ' + e.message); } }
    studio.quiet = TH.maskList();
    document.querySelectorAll('.sc').forEach((e) => (e.style.display = 'none'));
    if (TH.missing.length) console.error('[warn] cue words not found in build/words.json (check build/word_index.txt): ' + TH.missing.slice(0, 12).join(', '));
    studio.length = TH.DUR;
    studio.cues = TH.sfx.filter((c) => c.t <= TH.DUR).sort((a, b) => a.t - b.t);
    TH.seek(0); await TH.settle();
    return true;
  })();
  studio.ready.catch((e) => console.error('boot failed: ' + e.message));
  studio.show = async (t) => { TH.seek(Math.max(0, Math.min(t, TH.DUR - 1e-3))); await TH.settle(); };

  studio.ready.then(() => {
    if (QS.has('play')) {
      document.body.classList.add('fit');
      const fit = () => { document.getElementById('frame').style.transform = `scale(${Math.min(innerHeight / 1920, innerWidth / 1080)})`; }; fit(); addEventListener('resize', fit);
      const au = new Audio(QS.get('audio') || 'audio/vo.mp3'), from = +(QS.get('from') || 0);
      TH.seek(from);
      document.addEventListener('click', () => {
        au.currentTime = from; au.play().catch(() => {}); const t0 = performance.now() - from * 1000;
        const loop = () => { const t = au.paused && au.currentTime === from ? (performance.now() - t0) / 1000 : au.currentTime; TH.seek(Math.min(t, TH.DUR - 0.001)); if (t < TH.DUR) requestAnimationFrame(loop); };
        loop();
      }, { once: true });
      console.log('click the page to play with audio');
    } else studio.show(QS.has('t') ? parseFloat(QS.get('t')) : 0);
  });
})();

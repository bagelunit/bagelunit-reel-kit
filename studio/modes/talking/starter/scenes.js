// ───────────────────────── scenes.js: one TH.scene per beat, cued on spoken words ─────────────────────────
// This example follows the template script in script.txt and shows every layout once. Replace it beat by beat for your take:
// open build/word_index.txt, pick the cue words, and build each beat's graphic for THIS script (modes/talking/GUIDE.md).
//   TH.scene(id, T('word'), 'SPLIT' | 'SEAM' | 'FACE' | 'PAPER' | 'TINT' | 'DARK', { noCap, face, k, cap, voice })
//   graphics go in s.el (under the face); overlays on FACE beats go in s.ov (above the face)
// Each beat sits in its own { } block so names don't collide.
const KEYWORD = String((REEL.cta && REEL.cta.keyword) || 'REEL').toUpperCase();

// 1 · HOOK (SPLIT): the tool card slams in, FREE lands, a rough take turns into a finished reel
{ const s = TH.scene('hook', 0, 'SPLIT'), p = s.el, tTake = T('take'), tReel = T('reel', tTake);
  const card = mk(p, `<div class="ab" style="left:110px;top:120px;width:860px">${TH.paperCard(`<div style="padding:40px 44px">
      <div class="row" style="justify-content:space-between">${TH.tag('new tool')}<span class="mono" style="font-size:30px;color:var(--mute)">v1.0</span></div>
      <div class="anton" style="margin-top:26px;font-size:150px;line-height:.95">REEL KIT</div>
      <div style="margin-top:18px;font:600 40px/1.3 Figtree;color:var(--mute)">one take in, one reel out</div></div>`)}</div>`);
  TH.slam(card, 0.02, { s0: 1.25 });
  const free = mk(p, `<div class="ab" style="left:700px;top:70px">${TH.tape('FREE', { size: 84, rot: 6 })}</div>`);
  TH.pop(free, T('free') - 0.04, { s0: 1.8, dy: 0, d: 0.3, ease: 'back.out(2.4)', sound: 'stamp', gain: 0 });
  const a = mk(p, `<div class="ab" style="left:110px;top:640px">${TH.tag('take.mov', { kind: 'line', size: 40 })}</div>`);
  const b = mk(p, `<div class="ab" style="left:700px;top:640px">${TH.tag('reel.mp4', { kind: 'acc', size: 40 })}</div>`);
  pop(a, tTake - 0.05, { dx: -40, dy: 0 });
  TH.line(p, [[400, 672], [660, 672]], tTake + 0.12, { w: 7 });
  TH.slam(b, tReel - 0.05, { s0: 1.4 }); }

// 2 · PROOF (PAPER): the repo card, the star count rolls up on the spoken number
{ const s = TH.scene('proof', T("it's called") - 0.03, 'PAPER'), p = s.el, tN = T('12,000');
  const w = mk(p, `<div class="ab" style="left:140px;top:300px;width:800px">${TH.paperCard(`<div style="padding:56px 40px">${TH.repoWidget('you', 'reel-kit')}</div>`)}</div>`);
  pop(w, s.t0, { dy: 80, s0: 0.92 }); TH.drift(w, s.t0 + 0.35, s.t1, { to: 1.05 });
  TH.count(w.querySelector('.rwN'), tN - 0.1, tN + 0.5, 0, 12000, { sound: 'pop' }); }

// 3 · FACE: "here's how it works", a tag lands on the take (overlays on FACE beats go in s.ov)
{ const s = TH.scene('how', T("here's") - 0.02, 'FACE');
  const tg = mk(s.ov, `<div class="ab" style="left:80px;top:300px">${TH.tag('how it works', { kind: 'acc', size: 48 })}</div>`);
  pop(tg, T('works') - 0.1, { dx: -60, dy: 0 }); }

// 4 · DARK: the four steps on a lit card over its own blurred copy; the frame slides to each step as it is named
{ const s = TH.scene('steps', T('you record') - 0.03, 'DARK'), p = s.el;
  const STEPS = [['01', 'You record one take'], ['02', 'Pauses get cut'], ['03', 'Captions get written'], ['04', 'Graphics get built']];
  const html = TH.glowCard(`<div style="padding:40px 34px 26px"><div class="row" style="justify-content:space-between;padding:0 12px">${TH.tag('how it works', { kind: 'acc' })}<span class="mono" style="font-size:28px;color:var(--mute)">4 steps</span></div>
      ${STEPS.map(([n, t], k) => `<div class="st row" style="height:132px;padding:0 16px;border-top:2px solid ${TH.alpha(C.paper, 0.1)};margin-top:${k ? 0 : 24}px;gap:26px"><span class="anton" style="font-size:56px;color:var(--accent)">${n}</span><span style="font:700 46px Figtree">${t}</span></div>`).join('')}</div>`);
  TH.blurClone(p, html);
  const card = mk(p, `<div class="ab" style="left:70px;top:330px;width:940px">${html}</div>`);
  pop(card, s.t0, { dy: 80, s0: 0.92 }); TH.drift(card, s.t0 + 0.3, s.t1, { to: 1.04 });
  const cues = [T('record'), T('cuts'), T('writes'), T('builds')];
  TH.later(() => { const R = [...card.querySelectorAll('.st')].map((g) => TH.rectOf(g, card));
    TH.slider(card, R.map((r, k) => ({ x: r.x + 8, y: r.y + 8, w: r.w - 16, h: r.h - 16, at: cues[k] - 0.05 })), { r: 16 }); }); }

// 5 · FACE: "and the best part?" a tape sticker slaps onto the take
{ const s = TH.scene('best', T('and the best') - 0.02, 'FACE');
  const st = mk(s.ov, `<div class="ab" style="left:560px;top:360px">${TH.tape('the best part', { size: 70, rot: -5 })}</div>`);
  TH.pop(st, T('best') - 0.04, { s0: 1.8, dy: 0, d: 0.3, ease: 'back.out(2.4)', sound: 'stamp' }); }

// 6 · SEAM: it runs on your own laptop (device mockup on grid paper; the take sits under the seam)
{ const s = TH.scene('laptop', T('it runs') - 0.03, 'SEAM'), p = s.el;
  const screen = `<div style="height:100%;background:var(--sheet);padding:34px 38px;box-sizing:border-box;font:600 34px 'JetBrains Mono';color:var(--ink)">
      <div style="color:var(--mute)">~/reels $</div><div class="lpT" style="margin-top:14px"></div><div class="lpOk" style="margin-top:26px;color:var(--ink2)">✓ rendered on this machine</div></div>`;
  const d = mk(p, `<div class="ab" style="left:150px;top:150px">${TH.device(screen, 740, 400)}</div>`);
  pop(d, s.t0, { dy: 70, s0: 0.92 });
  TH.type(d.querySelector('.lpT'), 'kit render my-reel', s.t0 + 0.15, { cps: 34, caret: true });
  pop(d.querySelector('.lpOk'), T('laptop') - 0.05, { dx: -30, dy: 0, sound: 'pop' }); }

// 7 · TINT: 4 hours struck out, 20 minutes rolls up
{ const s = TH.scene('result', T('my last') - 0.03, 'TINT'), p = s.el, t20 = T('20'), t4 = T('4', t20);
  const now = mk(p, `<div class="ab" style="left:0;width:1080px;top:330px;text-align:center"><div class="anton" style="font-size:300px;line-height:1"><span class="r20">0</span><span style="font-size:120px"> MIN</span></div><div style="margin-top:6px">${TH.tag('my last reel', { kind: 'ink2' })}</div></div>`);
  pop(now, s.t0, { dy: 60 });
  TH.count(now.querySelector('.r20'), t20 - 0.08, t20 + 0.4, 0, 20);
  const old = mk(p, `<div class="ab" style="left:0;width:1080px;top:830px;text-align:center"><span class="anton" style="font-size:130px;color:var(--mute)">4 HOURS</span></div>`);
  pop(old, t4 - 0.05, { dy: 30 });
  TH.strike(p, 330, 830, 420, 150, T('hours', t4) + 0.05); }

// 8 · CTA (FACE): comment KEYWORD, the keyword slams on the tape; captions off (the CTA replaces them)
{ const s = TH.scene('cta', T('comment') - 0.03, 'FACE', { noCap: true });
  TH.cta(s.ov, KEYWORD, T(KEYWORD, s.t0) - 0.05, { preAt: s.t0, sub: "I'll send you the link", subAt: T('send', s.t0) - 0.05 }); }

// ── captions: KEY words land on the accent tape (HOT ones on the second ink); numbers count up inside the caption
TH.captions(['free', 'reel', 'kit', '12,000', 'record', 'pauses', 'captions', 'graphic', 'best', 'laptop', '20', 'hours', KEYWORD], { hot: ['free', '20'] });

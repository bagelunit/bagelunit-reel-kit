// ───────────────────────── plugins kit: Claude Code session window, GitHub README card, plugin counter ─────────────────────────
// NOTE: reference code from a real reel. Word indices (wi(n)) refer to that reel's script; re-cue on your own words.json.
// assets not included: IMG.db_av, IMG.deploy_av, IMG.tools_av, IMG.crew_char (REPO_ASSETS below points at placeholders).
// Print look (paper #F6F5F1, ink #111, signal red C.red, round halftone on T). Everything draws in local coords;
// wrap in X([T,K], x, y, s, rot, fn) to place/animate.

// repo images (downloaded from each repo's README / owner avatar) — keys usable as IMG[key]
window.REPO_ASSETS = [
  ['db_av', 'assets/placeholder_db_av.png'], ['deploy_av', 'assets/placeholder_deploy_av.png'],
  ['tools_av', 'assets/placeholder_tools_av.png'], ['crew_char', 'assets/placeholder_crew_char.png'],
];
const CC = {
  bg: '#15161A', bar: '#1D1E23', line: '#2A2C33', text: '#E9E9EC', dim: '#8B8D94', orange: '#D97757', ok: '#79D08A', warn: C.red,
  font: '"JetBrains Mono"',
};

// when each plugin counts as installed (drives the PLUGINS n/4 readout; scenes should land their "installed" beat here)
const PLUGIN_DONE = [wi(18) + 0.55, wi(51) + 0.45, wi(77) + 0.5, wi(110) + 0.45];
const pluginsAt = t => PLUGIN_DONE.filter(x => t >= x).length;
const PLUGIN_READOUT = t => ({ k: 'PLUGINS', v: `${pluginsAt(t)}/4`, hot: pluginsAt(t) > 0 });

// ── Claude Code session window ───────────────────────────────────────────────────────────────
// lines: [{ t0, txt, kind: 'cmd'|'out'|'ok'|'warn'|'claude'|'spin'|'dim'|'blank', cps, dur }]
//   cmd    → "> " + typed at cps (default 30) from t0
//   claude → "⏺ " orange bullet (assistant output), appears at t0 (typed fast)
//   spin   → "✻ txt…" orange spinner until t0+dur, then turns into a ✓ ok line
// o: { t, title, welcome: bool, input: { txt, t0, cps, blur }, status: [left, right], fs, lh, pad }
function ccWindow(T, K, x, y, w, h, o = {}) {
  const t = o.t ?? 0, fs = o.fs ?? 24, lh = o.lh ?? fs * 1.42, pad = o.pad ?? 26, bar = 50;
  // halftone drop shadow on T + window on K
  T.save(); T.shadowColor = 'rgba(0,0,0,0.45)'; T.shadowBlur = 44; T.shadowOffsetY = 26; fillRR(T, x, y, w, h, 22, '#FFFFFF'); T.restore();
  fillRR(K, x, y, w, h, 22, CC.bg);
  K.save(); rr(K, x, y, w, h, 22); K.clip();
  K.fillStyle = CC.bar; K.fillRect(x, y, w, bar);
  line(K, x, y + bar, x + w, y + bar, CC.line, 2, 'butt');
  [0, 1, 2].forEach(i => circle(K, x + 28 + i * 26, y + bar / 2, 8, i === 0 ? C.red : '#4A4C53'));
  text(K, o.title || 'claude — ~/my-app', x + w / 2, y + bar / 2 + 7, { font: CC.font, weight: 500, size: 19, color: CC.dim });
  // body
  let cy = y + bar + pad;
  const bodyTop = cy, inputH = o.input ? 78 : 0, statusH = o.status ? 34 : 0;
  const bodyBottom = y + h - pad - inputH - statusH;
  if (o.welcome) {
    const bh = 118;
    strokeRR(K, x + pad, cy, w - pad * 2, bh, 12, CC.orange, 2.5);
    text(K, '✻ Welcome to Claude Code!', x + pad + 22, cy + 42, { font: CC.font, weight: 700, size: fs, color: CC.text, align: 'left' });
    text(K, '/help for help, /status for your current setup', x + pad + 22, cy + 76, { font: CC.font, weight: 500, size: fs * 0.72, color: CC.dim, align: 'left' });
    text(K, 'cwd: ~/my-app', x + pad + 22, cy + 102, { font: CC.font, weight: 500, size: fs * 0.72, color: CC.dim, align: 'left' });
    cy += bh + 22;
  }
  // visible lines (scroll so the newest line stays in view, eased)
  const vis = (o.lines || []).filter(l => t >= l.t0);
  const rows = vis.map(l => rowOf(l, t, fs));
  const needH = rows.length * lh, room = bodyBottom - cy;
  const over = Math.max(0, needH - room);
  const scroll = over > 0 ? over : 0;
  K.save(); K.beginPath(); K.rect(x, bodyTop - 4, w, bodyBottom - bodyTop + 8); K.clip();
  rows.forEach((r, i) => {
    const ry = cy + (i + 0.8) * lh - scroll;
    if (ry < bodyTop - lh || ry > bodyBottom + lh) return;
    const age = t - r.l.t0, a = clamp(age / 0.12);
    K.save(); K.globalAlpha *= a; K.translate(0, (1 - E.outCubic(clamp(age / 0.18))) * 10);
    let cx = x + pad;
    if (r.prefix) { text(K, r.prefix, cx, ry, { font: CC.font, weight: 700, size: fs, color: r.pcol, align: 'left' }); cx += measure(K, r.prefix, { font: CC.font, weight: 700, size: fs }); }
    let txt = r.txt; const avail = x + w - pad - cx, tf = { font: CC.font, weight: r.bold ? 700 : 500, size: fs };
    if (measure(K, txt, tf) > avail) { while (txt.length > 1 && measure(K, txt + '…', tf) > avail) txt = txt.slice(0, -1); txt += '…'; }   // never overflow the window
    text(K, txt, cx, ry, Object.assign({ color: r.col, align: 'left' }, tf));
    if (r.caret) caretAt(K, cx + measure(K, txt, { font: CC.font, weight: 500, size: fs }), ry, fs * 1.05, t, CC.text);
    K.restore();
  });
  K.restore();
  // input box
  if (o.input) {
    const iy = y + h - pad - statusH - 62;
    strokeRR(K, x + pad, iy, w - pad * 2, 62, 12, '#44464E', 2);
    const inp = o.input, typed = inp.t0 !== undefined ? typedStr(inp.txt, t, inp.t0, inp.cps || 30) : (inp.txt || '');
    text(K, '>', x + pad + 20, iy + 40, { font: CC.font, weight: 700, size: fs, color: CC.dim, align: 'left' });
    if (inp.blur) { K.save(); K.filter = `blur(${inp.blur}px)`; }
    text(K, typed || (inp.ph ? '' : ''), x + pad + 52, iy + 40, { font: CC.font, weight: 500, size: fs, color: CC.text, align: 'left' });
    if (inp.blur) K.restore();
    if (!typed && inp.ph) text(K, inp.ph, x + pad + 52, iy + 40, { font: CC.font, weight: 500, size: fs, color: '#5C5E66', align: 'left' });
    caretAt(K, x + pad + 52 + measure(K, typed, { font: CC.font, weight: 500, size: fs }), iy + 40, fs * 1.05, t, CC.text);
  }
  if (o.status) {
    const sy = y + h - pad + 2;
    text(K, o.status[0] || '', x + pad + 4, sy, { font: CC.font, weight: 500, size: fs * 0.66, color: CC.dim, align: 'left' });
    text(K, o.status[1] || '', x + w - pad - 4, sy, { font: CC.font, weight: 500, size: fs * 0.66, color: CC.dim, align: 'right' });
  }
  K.restore();
}
const SPIN = ['✻', '✶', '✳', '✢', '·', '✢', '✳', '✶'];
function rowOf(l, t, fs) {
  const age = t - l.t0;
  switch (l.kind) {
    case 'cmd': { const s = typedStr(l.txt, t, l.t0, l.cps || 30); return { l, prefix: '> ', pcol: CC.dim, txt: s, col: CC.text, caret: s.length < l.txt.length }; }
    case 'claude': return { l, prefix: '⏺ ', pcol: CC.orange, txt: typedStr(l.txt, t, l.t0, l.cps || 90), col: CC.text };
    case 'ok': return { l, prefix: '✓ ', pcol: CC.ok, txt: l.txt, col: CC.text };
    case 'warn': return { l, prefix: '✗ ', pcol: CC.warn, txt: l.txt, col: CC.warn, bold: true };
    case 'spin': {
      if (age >= (l.dur ?? 1)) return { l, prefix: '✓ ', pcol: CC.ok, txt: l.done || l.txt, col: CC.text };
      const g = SPIN[Math.floor(t * 12) % SPIN.length];
      return { l, prefix: g + ' ', pcol: CC.orange, txt: l.txt + '.'.repeat(1 + Math.floor(t * 3) % 3), col: CC.orange };
    }
    case 'dim': return { l, txt: '  ' + l.txt, col: CC.dim };
    case 'blank': return { l, txt: '', col: CC.dim };
    default: return { l, txt: l.txt, col: l.col || CC.dim };
  }
}

// ── GitHub README card (light, like github.com on a phone) ────────────────────────────────────
// o: { t, owner, repo, avatar (IMG key), stars (number), starsT0 (roll start), title, titleT0, tagline, img (IMG key), imgH,
//      badges: [str], lang: str }  → returns total height
function repoCard(T, K, x, y, w, o = {}) {
  const t = o.t ?? 0, pad = 30, imgH = o.img ? (o.imgH ?? Math.round((w - pad * 2) * 0.5)) : 0;
  const h = o.h ?? (86 + 56 + 92 + (o.tagline ? 50 : 0) + (imgH ? imgH + 24 : 0) + (o.badges ? 54 : 0) + pad);
  uiCard(T, K, x, y, w, h, { r: 24 });
  // header: avatar · owner / repo · ★ stars
  const hy = y + 50;
  if (o.avatar && IMG[o.avatar]) { K.save(); K.beginPath(); K.arc(x + pad + 24, hy, 24, 0, TAU); K.clip(); coverImg(K, IMG[o.avatar], x + pad, hy - 24, 48, 48); K.restore(); strokeRR(K, x + pad, hy - 24, 48, 48, 24, 'rgba(17,17,17,0.12)', 2); }
  else circle(K, x + pad + 24, hy, 24, '#E6E3DC');
  const f1 = { font: F.grot, weight: 500, size: 30 }, f2 = { font: F.grot, weight: 700, size: 30 };
  const own = (o.owner || 'owner') + ' / ';
  text(K, own, x + pad + 64, hy + 11, Object.assign({ color: '#6B6B6B', align: 'left' }, f1));
  text(K, o.repo || 'repo', x + pad + 64 + measure(K, own, f1), hy + 11, Object.assign({ color: C.ink, align: 'left' }, f2));
  if (o.stars !== undefined) {
    const p = o.starsT0 !== undefined ? E.outCubic(clamp((t - o.starsT0) / 1.1)) : 1;
    const sv = Math.round(o.stars * p).toLocaleString('en-US');
    const sf = { font: F.mono, weight: 700, size: 24 }, sw = measure(K, sv, sf) + 74;
    const sx = x + w - pad - sw;
    fillRR(K, sx, hy - 24, sw, 48, 10, '#F3F1EC'); strokeRR(K, sx, hy - 24, sw, 48, 10, 'rgba(17,17,17,0.14)', 2);
    text(K, '★', sx + 22, hy + 9, { font: F.grot, weight: 700, size: 26, color: '#E3A008' });
    text(K, sv, sx + 44, hy + 9, Object.assign({ color: C.ink, align: 'left' }, sf));
  }
  // tabs
  const ty = y + 86 + 26;
  text(K, 'README', x + pad, ty, { font: F.grot, weight: 700, size: 24, color: C.ink, align: 'left' });
  fillRR(K, x + pad - 6, ty + 14, measure(K, 'README', { font: F.grot, weight: 700, size: 24 }) + 12, 5, 2.5, '#FD8C73');
  if (o.lang) text(K, o.lang, x + pad + 130, ty, { font: F.grot, weight: 500, size: 24, color: '#6B6B6B', align: 'left' });
  line(K, x, ty + 19, x + w, ty + 19, 'rgba(17,17,17,0.10)', 2, 'butt');
  // H1 (typed) + tagline
  let cy = ty + 19 + 70;
  const title = o.titleT0 !== undefined ? typedStr(o.title || '', t, o.titleT0, o.cps || 26) : (o.title || '');
  text(K, title, x + pad, cy, { font: F.grot, weight: 700, size: 52, color: C.ink, align: 'left', ls: -1.5 });
  if (o.titleT0 !== undefined && title.length < (o.title || '').length) caretAt(K, x + pad + measure(K, title, { font: F.grot, weight: 700, size: 52, ls: -1.5 }), cy, 50, t, C.ink);
  if (o.tagline) { cy += 50; text(K, o.tagline, x + pad, cy, { font: F.serif, italic: true, weight: 400, size: 34, color: '#555', align: 'left' }); }
  cy += 24;
  if (imgH && IMG[o.img]) { coverImg(K, IMG[o.img], x + pad, cy, w - pad * 2, imgH, { fx: o.fx ?? 0.5, fy: o.fy ?? 0.5, zoom: o.zoom ?? 1, r: 14 }); strokeRR(K, x + pad, cy, w - pad * 2, imgH, 14, 'rgba(17,17,17,0.10)', 2); cy += imgH + 24; }
  if (o.badges) { let bx = x + pad; for (const b of o.badges) { const bw = measure(K, b, { font: F.mono, weight: 500, size: 20 }) + 28; fillRR(K, bx, cy, bw, 36, 8, '#F3F1EC'); text(K, b, bx + 14, cy + 25, { font: F.mono, weight: 500, size: 20, color: '#444', align: 'left' }); bx += bw + 10; } }
  return h;
}

// small inline code chip (dark), left-aligned at x, centred on y; returns width
function codeChip(K, str, x, y, o = {}) {
  const f = { font: F.mono, weight: 700, size: o.size || 26 }, w = measure(K, str, f) + 32, hh = (o.size || 26) * 1.75;
  fillRR(K, x, y - hh / 2, w, hh, 10, o.fill || CC.bg);
  text(K, str, x + 16, y + (o.size || 26) * 0.36, Object.assign({ color: o.color || CC.text, align: 'left' }, f));
  return w;
}

// ── hand-off state at every scene cut (so the through-objects never jump) ─────────────────────
// At each cut the Claude Code window sits docked bottom-left and the presenter bottom-right. A scene may move them anywhere
// in between, but must start (from 0.0 s after its cut) and end (by its last frame) in exactly this state.
// Exceptions: the hook's opening and the CTA's closing.
const CC_DOCK = { x: 60, y: 1300, w: 600, h: 400, fs: 21 };
const PRESENTER_DOCK = { x: 842, y: 1990, s: 0.8 };

// ── shared terminal history: what the session already shows when a scene starts (lines appear instantly) ──
// Scene n prepends ccHistory(n) to its own lines. 0 = hook, 1 = omni, 2 = pony, 3 = graph, 4 = skills, 5 = cta.
const CC_HISTORY = [
  [{ kind: 'cmd', txt: 'build me a SaaS this weekend' }, { kind: 'warn', txt: 'hold on: 0 of 4 plugins installed' }],
  [{ kind: 'cmd', txt: '/plugin install database@official-plugins' }, { kind: 'ok', txt: 'database connected · database tools ready' }],
  [{ kind: 'cmd', txt: '/plugin install deploy@official-plugins' }, { kind: 'ok', txt: 'deploy ready · "deploy my app"' }],
  [{ kind: 'cmd', txt: '/plugin install agent-crew' }, { kind: 'ok', txt: '19 agents ready · type "team"' }],
  [{ kind: 'cmd', txt: 'claude mcp add browser-tools --scope user npx browser-tools-mcp@latest' }, { kind: 'ok', txt: 'browser-tools connected' }],
];
const ccHistory = n => CC_HISTORY.slice(0, n).flat().map(l => Object.assign({ t0: -99 }, l));

// the exact docked terminal every scene shows at its cuts: history n, same input placeholder, same status line
// usage: ccWindow(T, K, CC_DOCK.x, CC_DOCK.y, CC_DOCK.w, CC_DOCK.h, ccDockOpts(n, t))   (spread + add your own lines as needed)
const ccDockOpts = (n, t, extra = []) => ({ t, fs: CC_DOCK.fs, lines: ccHistory(n).concat(extra),
  input: { txt: '', ph: 'Try "fix the login bug"' }, status: ['? for shortcuts', `● plugins ${pluginsAt(t)}/4`] });

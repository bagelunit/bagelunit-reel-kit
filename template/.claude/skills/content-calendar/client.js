// The dashboard's interactive parts, run in the browser. One shared state ties them together:
//   the filter bar (find, needs you, stage) applies to Needs you, the next 14 days, the calendar, the pipeline and top posts;
//   a reel is lit up everywhere it appears when you point at it, and stays lit while its card is open;
//   every reel anywhere opens the same card; the calendar has month, week and day views;
//   the state (filters, view, date, open card, scroll) survives a redraw, so the live Wi-Fi view and the
//   brand folder's sync never lose your place.
// page.mjs puts this file inside the page; the data it reads is the JSON in <script id="dash-data">.
(() => {
  const D = JSON.parse(document.getElementById('dash-data').textContent);
  const byId = new Map(D.items.map((i) => [i.id, i]));
  const STAGE_NAME = Object.fromEntries(D.stages.map((s) => [s.k, s.n]));
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const h = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const local = location.protocol === 'file:';
  const safe = (u) => { const s = String(u == null ? '' : u).trim(); return /^https:\/\/[^\s"'<>\\]+$/i.test(s) ? s : ''; };   // only https links to posts (page.mjs checks too)
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (v) => (window.CSS && CSS.escape ? CSS.escape(v) : String(v).replace(/"/g, '\\"'));

  /* ── shared state, kept for this tab across redraws ──────────────────────────────────────────────────────── */
  const KEY = 'bu-dash:' + location.pathname;
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem(KEY)) || {}; } catch (_) { return {}; } })();
  const state = { q: saved.q || '', needs: !!saved.needs, stage: saved.stage || '', series: saved.series || '', view: saved.view || localStorage.getItem('bu-cal-view') || 'month', cur: saved.cur || D.today, open: null };
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify({ q: state.q, needs: state.needs, stage: state.stage, series: state.series, view: state.view, cur: state.cur, y: scrollY })); } catch (_) {} };
  addEventListener('pagehide', save);
  const filtering = () => !!(state.q || state.needs || state.stage || state.series);
  const matches = (it) => {
    if (!it) return true;
    if (state.needs && !it.needs.length) return false;
    if (state.stage && it.stage !== state.stage) return false;
    if (state.series && it.series !== state.series) return false;
    if (state.q) { const t = state.q.toLowerCase(); if (!(it.title + ' ' + it.hook + ' ' + it.goal + ' ' + it.angle).toLowerCase().includes(t)) return false; }
    return true;
  };

  /* dates: plain YYYY-MM-DD keys in the brand's timezone, worked on as UTC days */
  const parse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const key = (dt) => dt.toISOString().slice(0, 10);
  const add = (k, n) => { const d = parse(k); d.setUTCDate(d.getUTCDate() + n); return key(d); };
  const addMonths = (k, n) => { const d = parse(k); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); return key(d); };
  const wd = (k) => parse(k).getUTCDay();
  const fd = (k, o) => parse(k).toLocaleDateString('en-US', Object.assign({ timeZone: 'UTC' }, o));
  const monday = (k) => add(k, -((wd(k) + 6) % 7));
  const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const byDay = {};
  for (const e of D.entries) (byDay[e.d] = byDay[e.d] || []).push(e);
  for (const l of Object.values(byDay)) l.sort((a, b) => (a.t || '99').localeCompare(b.t || '99'));
  // open slots per posting time, the same rule as openTimesOn in lib.mjs: a reel with a time takes the nearest free
  // time, one without takes the earliest, and today's times that have gone by are not open
  const PT = D.postTimes || (D.postTime ? [D.postTime] : []);
  const mins = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const openTimes = (k) => {
    if (k < D.today || !D.postDays.includes(DAYS[wd(k)])) return [];
    const list = byDay[k] || [];
    if (!PT.length) return list.length ? [] : [''];
    const left = PT.slice();
    list.filter((e) => e.t).forEach((e) => { if (!left.length) return; let at = 0; left.forEach((t, i) => { if (Math.abs(mins(t) - mins(e.t)) < Math.abs(mins(left[at]) - mins(e.t))) at = i; }); left.splice(at, 1); });
    left.splice(0, list.filter((e) => !e.t).length);
    return k === D.today ? left.filter((t) => t > D.nowTime) : left;
  };
  const tText = (l, max) => (l.length > max + 1 ? l.slice(0, max).join(', ') + ' and ' + (l.length - max) + ' more' : l.join(', '));
  const openText = (open, max) => (open.length > 1 ? open.length + ' open posting slots · ' + h(tText(open, max)) : 'Open posting slot' + (open[0] ? ' · ' + h(open[0]) : ''));
  const LBL = { posted: 'Posted', scheduled: 'Scheduled', planned: 'Planned', late: 'Date passed' };
  const kindText = (e) => { const it = byId.get(e.id); return e.k === 'posted' || e.k === 'scheduled' ? LBL[e.k] : LBL[e.k] + ' · ' + (it ? STAGE_NAME[it.stage] : ''); };
  const k1 = (n) => n == null ? '–' : Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : Math.abs(n) >= 1e4 ? Math.round(n / 1e3) + 'K' : Math.abs(n) >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n));
  const pc = (x) => x == null ? '–' : (x * 100).toFixed(1) + '%';
  const withCmd = (s) => h(s).replace(/(\/[a-z][a-z-]+(?: (?:plan|days|host|connect instagram|connect telegram|auto))?)/g, '<code>$1</code>');
  const dimCls = (id) => filtering() && !matches(byId.get(id)) ? ' is-dim' : '';

  /* ── calendar ────────────────────────────────────────────────────────────────────────────────────────────── */
  const cal = $('#cal');
  let renderCal = () => {};
  if (cal) {
    const body = $('#cal-body', cal), title = $('#cal-title', cal);
    const ev = (e) => '<button type="button" class="ev ' + e.k + dimCls(e.id) + '" data-open="' + h(e.id) + '" title="' + h((byId.get(e.id) || {}).title + ' · ' + kindText(e)) + '">' + (e.t ? '<b>' + h(e.t) + '</b> ' : '') + '<span>' + h((byId.get(e.id) || {}).title) + '</span></button>';
    const card = (e) => { const it = byId.get(e.id) || {}; return '<button type="button" class="calcard ' + e.k + dimCls(e.id) + '" data-open="' + h(e.id) + '"><span class="cc-time">' + (e.t ? h(e.t) : 'Any time') + '</span><b>' + h(it.title) + '</b><span class="cc-kind"><i class="sw ' + e.k + '"></i>' + h(kindText(e)) + '</span></button>'; };
    function month() {
      const first = state.cur.slice(0, 8) + '01', m = parse(first).getUTCMonth();
      const last = add(addMonths(first, 1), -1), end = add(monday(last), 6);
      let out = '<div class="month-grid">' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => '<div class="wd">' + w + '</div>').join('');
      for (let k = monday(first); k <= end; k = add(k, 1)) {
        const inM = parse(k).getUTCMonth() === m, list = byDay[k] || [], open = inM ? openTimes(k) : [], extra = list.length > 4 ? list.length - 3 : 0;
        out += '<div class="day' + (inM ? '' : ' out') + (k === D.today ? ' today' : '') + (k < D.today ? ' past' : '') + (open.length ? ' slot' : '') + '"' + (open.length ? ' title="' + openText(open, 8) + '"' : '') + '>'
          + '<button type="button" class="dn" data-day="' + k + '" aria-label="Open ' + h(fd(k, { weekday: 'long', month: 'long', day: 'numeric' })) + '">' + parse(k).getUTCDate() + '</button>'
          + (extra ? list.slice(0, 3) : list).map(ev).join('') + (extra ? '<button type="button" class="ev-more" data-day="' + k + '">+' + extra + ' more</button>' : '')
          + (open.length ? '<div class="open">' + (open.length > 1 ? open.length + ' open' : 'Open slot' + (open[0] ? ' · ' + h(open[0]) : '')) + '</div>' : '') + '</div>';
      }
      title.textContent = fd(first, { month: 'long', year: 'numeric' });
      return out + '</div>';
    }
    function week() {
      const start = monday(state.cur), end = add(start, 6);
      let out = '<div class="week">';
      for (let k = start; k <= end; k = add(k, 1)) {
        const list = byDay[k] || [], open = openTimes(k);
        out += '<div class="wk-day' + (k === D.today ? ' today' : '') + (k < D.today ? ' past' : '') + (open.length ? ' slot' : '') + '">'
          + '<button type="button" class="wk-head" data-day="' + k + '"><span>' + h(fd(k, { weekday: 'short' })) + '</span><b>' + parse(k).getUTCDate() + '</b></button>'
          + '<div class="wk-list">' + list.map(card).join('') + (open.length ? '<div class="open">' + openText(open, 3) + '</div>' : '') + (!list.length && !open.length ? '<div class="quiet">Nothing</div>' : '') + '</div></div>';
      }
      const sm = fd(start, { month: 'short' }), em = fd(end, { month: 'short' });
      title.textContent = sm + ' ' + parse(start).getUTCDate() + ' to ' + (sm === em ? '' : em + ' ') + parse(end).getUTCDate() + ', ' + parse(end).getUTCFullYear();
      return out + '</div>';
    }
    function day() {
      const list = byDay[state.cur] || [], timed = list.filter((e) => e.t), loose = list.filter((e) => !e.t);
      const hours = new Set([6, 8, 10, 12, 14, 16, 18, 20, 22]);
      timed.forEach((e) => hours.add(Number(e.t.slice(0, 2))));
      const open = openTimes(state.cur), openAt = open.filter(Boolean);
      openAt.forEach((t) => hours.add(Number(t.slice(0, 2))));
      let out = '<div class="dayview"><div class="dv-any"><span class="dv-h">Any time</span><div>' + (loose.length ? loose.map(card).join('') : '<span class="quiet">Nothing without a time</span>') + (open.length && !open[0] ? '<div class="open">Open posting slot</div>' : '') + '</div></div>';
      for (const hr of [...hours].sort((a, b) => a - b)) {
        const here = timed.filter((e) => Number(e.t.slice(0, 2)) === hr);
        const openHere = openAt.filter((t) => Number(t.slice(0, 2)) === hr);
        out += '<div class="dv-row' + (here.length || openHere.length ? ' has' : '') + '"><span class="dv-h">' + String(hr).padStart(2, '0') + ':00</span><div>' + here.map(card).join('') + openHere.map((t) => '<div class="open">Open posting slot · ' + h(t) + '</div>').join('') + '</div></div>';
      }
      title.textContent = fd(state.cur, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
      return out + '</div>';
    }
    renderCal = (animate) => {
      cal.dataset.mode = state.view;
      $$('button[data-view]', cal).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));
      body.innerHTML = state.view === 'week' ? week() : state.view === 'day' ? day() : month();
      if (animate && !reduce) { body.classList.remove('swap'); void body.offsetWidth; body.classList.add('swap'); }
      paintSelection();
    };
    cal.addEventListener('click', (e) => {
      const v = e.target.closest('button[data-view]'), n = e.target.closest('button[data-nav]'), d = e.target.closest('button[data-day]');
      if (v) { state.view = v.dataset.view; localStorage.setItem('bu-cal-view', state.view); }
      else if (n) { const s = Number(n.dataset.nav); state.cur = s === 0 ? D.today : state.view === 'month' ? addMonths(state.cur, s) : add(state.cur, state.view === 'week' ? 7 * s : s); }
      else if (d) { state.cur = d.dataset.day; state.view = 'day'; localStorage.setItem('bu-cal-view', 'day'); }
      else return;
      save(); renderCal(true);
    });
  }

  /* ── the platform switch (All, Instagram, Facebook, Threads), when Facebook or Threads is connected ─────────── */
  const pfButtons = $$('[data-pf-pick]');
  if (pfButtons.length) {
    const setPlatform = (p) => {
      pfButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pfPick === p)));
      $$('[data-pf]').forEach((el) => { el.hidden = el.dataset.pf !== p; });
      $$('[data-pf-in]').forEach((el) => { el.hidden = !el.dataset.pfIn.split(' ').includes(p); });
      try { localStorage.setItem('bu-platform', p); } catch (_) {}
    };
    let saved = null; try { saved = localStorage.getItem('bu-platform'); } catch (_) {}
    setPlatform(pfButtons.some((b) => b.dataset.pfPick === saved) ? saved : 'all');
    pfButtons.forEach((b) => b.addEventListener('click', () => setPlatform(b.dataset.pfPick)));
  }

  /* ── the filter bar, applied everywhere ──────────────────────────────────────────────────────────────────── */
  const fq = $('#f-q'), fneeds = $('#f-needs'), fstage = $('#f-stage'), fseries = $('#f-series'), fclear = $('#f-clear'), fcount = $('#f-count');
  const LIMIT = 6;
  function applyFilter() {
    if (fq && fq.value !== state.q) fq.value = state.q;
    if (fneeds) fneeds.setAttribute('aria-pressed', String(state.needs));
    if (fstage) fstage.value = state.stage;
    if (fseries) fseries.value = state.series;
    $$('[data-series-pick]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.seriesPick === state.series)));
    if (fclear) fclear.hidden = !filtering();
    // Needs you and the next 14 days: hide what does not match
    $$('.needs li[data-id]').forEach((li) => { li.hidden = !matches(byId.get(li.dataset.id)); });
    $$('.agenda li').forEach((li) => {
      const ags = $$('.ag[data-id]', li);
      ags.forEach((a) => { a.hidden = !matches(byId.get(a.dataset.id)); });
      li.hidden = filtering() && (ags.length ? ags.every((a) => a.hidden) : true);
    });
    // pipeline: hide cards that do not match, dim stages outside the chosen one, fold long stages
    let shown = 0;
    $$('.board .col').forEach((col) => {
      const lis = $$('li[data-id]', col), ok = lis.filter((li) => matches(byId.get(li.dataset.id)));
      const open = col.dataset.expanded === '1' || filtering();
      lis.forEach((li) => { li.hidden = !ok.includes(li) || (!open && ok.indexOf(li) >= LIMIT); });
      const more = $('.more', col), extra = ok.length - LIMIT;
      more.hidden = filtering() || ok.length <= LIMIT;
      more.textContent = col.dataset.expanded === '1' ? 'Show fewer' : 'Show ' + extra + ' more';
      $('.cnt', col).textContent = ok.length;
      $('.none', col).hidden = ok.length > 0 || filtering();
      col.classList.toggle('is-dim', !!state.stage && col.dataset.stage !== state.stage);
      col.classList.toggle('is-focus', !!state.stage && col.dataset.stage === state.stage);
      shown += ok.length;
    });
    // top posts and the agents' lists: dim what does not match
    $$('tbody tr[data-id], .agent li[data-id], .variants li[data-id]').forEach((el) => el.classList.toggle('is-dim', filtering() && !matches(byId.get(el.dataset.id))));
    if (fcount) fcount.textContent = filtering() ? shown + ' of ' + D.items.length + ' reels and ideas' : '';
    renderCal(false);
    save();
  }
  if (fq) fq.addEventListener('input', () => { state.q = fq.value.trim(); applyFilter(); });
  if (fneeds) fneeds.addEventListener('click', () => { state.needs = !state.needs; applyFilter(); });
  if (fstage) fstage.addEventListener('change', () => { state.stage = fstage.value; applyFilter(); });
  if (fseries) fseries.addEventListener('change', () => { state.series = fseries.value; applyFilter(); });
  if (fclear) fclear.addEventListener('click', () => { state.q = ''; state.needs = false; state.stage = ''; state.series = ''; applyFilter(); });
  document.addEventListener('click', (e) => {
    const more = e.target.closest('.col .more');
    if (more) { const col = more.closest('.col'); col.dataset.expanded = col.dataset.expanded === '1' ? '' : '1'; applyFilter(); return; }
    const sp = e.target.closest('[data-series-pick]');
    if (sp) { state.series = state.series === sp.dataset.seriesPick ? '' : sp.dataset.seriesPick; applyFilter(); return; }
    const pick = e.target.closest('[data-stage-pick]');
    if (pick) {
      const k = pick.dataset.stagePick;
      state.stage = state.stage === k && pick.matches('.col-btn') ? '' : k;
      applyFilter();
      if (pick.matches('a')) return;         // a number card: let the link scroll to the pipeline
    }
  });

  /* ── one reel, lit up everywhere ─────────────────────────────────────────────────────────────────────────── */
  const sameReel = (id) => $$('[data-open="' + esc(id) + '"], [data-id="' + esc(id) + '"]');
  let hover = null;
  function paintSelection() {
    $$('.is-sel').forEach((el) => el.classList.remove('is-sel'));
    if (state.open) sameReel(state.open).forEach((el) => { if (!el.closest('dialog')) el.classList.add('is-sel'); });
    $$('.is-hl').forEach((el) => el.classList.remove('is-hl'));
    if (hover) sameReel(hover).forEach((el) => { if (!el.closest('dialog')) el.classList.add('is-hl'); });
  }
  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest('[data-open], [data-id]');
    const id = el && !el.closest('dialog') ? (el.dataset.open || el.dataset.id) : null;
    if (id !== hover) { hover = id; paintSelection(); }
  });
  document.addEventListener('focusin', (e) => { const el = e.target.closest('[data-open]'); if (el && !el.closest('dialog')) { hover = el.dataset.open; paintSelection(); } });

  /* ── the reel card ───────────────────────────────────────────────────────────────────────────────────────── */
  const dlg = $('#card'), cb = $('#card-body');
  const siblings = (it) => $$('.board .col[data-stage="' + it.stage + '"] li:not([hidden]) .card-btn').map((b) => b.dataset.open);
  const fact = (k, v) => v ? '<div><dt>' + h(k) + '</dt><dd>' + v + '</dd></div>' : '';
  const PRIO = { 1: 'Now', 2: 'Soon', 3: 'Later' };
  const svg = (d, cls) => '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>';
  const ARROW_R = svg('M5 12h14M13 6l6 6-6 6'), ARROW_L = svg('M5 12h14M13 6l6 6-6 6', 'flip'), CROSS = svg('M6 6l12 12M18 6L6 18');
  function cardHtml(it) {
    const idx = D.stages.findIndex((s) => s.k === it.stage), sib = siblings(it), pos = sib.indexOf(it.id), n = it.nums;
    const fileText = it.file ? h(it.file.name) + ' · ' + (it.file.state === 'match' ? '<span class="up">matches what you approved</span>' : it.file.state === 'posted' ? 'posted (not checked again)' : it.file.state === 'changed' ? '<span class="down">changed after you approved it</span>' : '<span class="down">missing</span>') : '';
    const fileLink = (f) => local && it.slug ? '<a href="../reels/' + encodeURIComponent(it.slug) + '/' + f.split('/').map(encodeURIComponent).join('/') + '">' + h(f) + '</a>' : '<span>' + h(f) + '</span>';
    const dateText = (k, t) => h(fd(k, { weekday: 'short', month: 'short', day: 'numeric' }) + (t ? ' ' + t : ''));
    const goDay = (k) => ' <button type="button" class="link small" data-goto-day="' + k + '">See the day</button>';
    return '<header class="dr-head"><span class="stage-chip">' + h(STAGE_NAME[it.stage]) + '</span><div class="dr-nav">'
      + '<button type="button" data-step="-1" aria-label="Previous in this stage"' + (pos > 0 ? '' : ' disabled') + '>' + ARROW_L + '</button>'
      + '<button type="button" data-step="1" aria-label="Next in this stage"' + (pos >= 0 && pos < sib.length - 1 ? '' : ' disabled') + '>' + ARROW_R + '</button>'
      + '<button type="button" data-close aria-label="Close">' + CROSS + '</button></div></header>'
      + '<h2 id="card-title">' + h(it.title) + '</h2><p class="dr-ref">' + h(it.ref) + (pos >= 0 ? ' · ' + (pos + 1) + ' of ' + sib.length + ' at this stage' : '') + '</p>'
      + '<p class="track-label">Stage ' + (idx + 1) + ' of ' + D.stages.length + ' · <b>' + h(STAGE_NAME[it.stage]) + '</b></p><ol class="track" aria-label="Stage">' + D.stages.map((s, i) => '<li class="' + (i < idx ? 'done' : i === idx ? 'now' : '') + '"' + (i === idx ? ' aria-current="step"' : '') + '><i></i><span>' + h(s.n) + '</span></li>').join('') + '</ol>'
      + (it.needs.length ? '<div class="dr-needs">' + it.needs.map((x) => '<p><span class="prio ' + ['', 'now', 'soon', 'later'][x.p] + '">' + PRIO[x.p] + '</span>' + withCmd(x.what) + '</p>').join('') + '</div>' : '')
      + '<div class="dr-next"><span class="kicker">Next step</span><p>' + h(it.next) + '</p><div class="cmdrow"><code>' + h(it.cmd) + '</code><button type="button" class="copy" data-copy="' + h(it.cmd) + '">Copy</button></div><small>Paste it into Claude Code, opened in this brand folder.</small></div>'
      + '<dl class="facts">' + fact('Planned', it.planned ? dateText(it.planned) + goDay(it.planned) : '')
      + fact('Scheduled', it.scheduled ? dateText(it.scheduled.d, it.scheduled.t) + ' · ' + h(it.scheduled.via) + (it.scheduled.dry ? ' <span class="down">dry run</span>' : '') + (it.schedPlatforms ? ' · ' + h(it.schedPlatforms.map((x) => x[0].toUpperCase() + x.slice(1)).join(', ')) : '') + goDay(it.scheduled.d) : '')
      + fact('Posted', it.posted ? dateText(it.posted.d, it.posted.t) + (safe(it.posted.link) ? ' · <a href="' + h(safe(it.posted.link)) + '" target="_blank" rel="noopener">Open on Instagram</a>' : '') + goDay(it.posted.d) : '')
      + fact('Goal', h(it.goal)) + fact('Angle', h(it.angle)) + fact('Series', h(it.series)) + fact('Final file', fileText) + fact('Notes', h(it.notes)) + '</dl>'
      + (it.test ? '<div class="dr-sec"><span class="kicker">A/B test</span><p>Version <b>' + h(it.test.label) + '</b> of ' + h(it.test.title) + (it.trial ? ', posted as a trial reel' : '') + '.</p>' + (it.test.others.length ? '<div class="chips">' + it.test.others.map((o) => '<button type="button" data-open="' + h(o.id) + '">Open version ' + h(o.label) + '</button>').join('') + '</div>' : '') + '</div>' : '')
      + (it.timeline.length > 1 ? '<div class="dr-sec"><span class="kicker">Timeline</span><ol class="timeline">' + it.timeline.map((x, i) => { const prev = i ? it.timeline[i - 1].d : null, gap = prev ? Math.round((parse(x.d) - parse(prev)) / 864e5) : null; return '<li><span>' + h(x.n) + '</span><span>' + h(fd(x.d, { weekday: 'short', month: 'short', day: 'numeric' })) + '</span><em>' + (gap == null ? '' : gap === 0 ? 'same day' : '+' + gap + ' day' + (gap === 1 ? '' : 's')) + '</em></li>'; }).join('') + '</ol></div>' : '')
      + (it.voice ? '<div class="dr-sec"><span class="kicker">Voice cost</span><p>About <b>' + k1(it.voice.chars) + '</b> credits (' + it.voice.chars.toLocaleString('en-US') + ' characters' + (it.voice.calls > 1 ? ', ' + it.voice.calls + ' takes' : '') + ')' + (it.voice.estimated ? ', estimated from the script' : '') + '.</p></div>' : '')
      + (it.stickers.length ? '<div class="dr-sec"><span class="kicker">New stickers made for this reel</span><div class="chips">' + it.stickers.map((x) => '<span title="' + h(x.pose) + '">' + h(x.name) + '</span>').join('') + '</div></div>' : '')
      + (it.platforms.length ? '<div class="dr-sec"><span class="kicker">Other platforms</span><ul class="files">' + it.platforms.map((f) => '<li>' + fileLink(f) + '</li>').join('') + '</ul></div>' : '')
      + (n ? '<div class="dr-sec"><span class="kicker">Numbers' + (n.source ? ' · from ' + h(n.source) : '') + '</span><div class="nums">'
        + [['Views', k1(n.views)], ['Reach', k1(n.reach)], ['Engagement', pc(n.eng)], ['Avg watch', n.watch == null ? '–' : n.watch.toFixed(1) + ' s'], ['Skip rate', pc(n.skip)], ['Saves', k1(n.saves)], ['Shares', k1(n.shares)], ['Comments', k1(n.comments)]]
          .map((x) => '<div><dt>' + x[0] + '</dt><dd>' + x[1] + '</dd></div>').join('') + '</div></div>' : '')
      + (it.pub ? '<div class="dr-sec"><span class="kicker">Publisher</span><ul class="files">' + Object.keys(it.pub.targets).map((k) => { const t = it.pub.targets[k], nm = { instagram: 'Instagram', facebook: 'Facebook', threads: 'Threads' }[k] || k, st = { published: 'posted', dry_run: 'dry run, nothing posted', failed: 'failed', pending: 'waiting for its time', cancelled: 'cancelled' }[t.status] || h(t.status);
          return '<li><b>' + h(nm) + '</b>: ' + h(st) + (safe(t.link) ? ' · <a href="' + h(safe(t.link)) + '" target="_blank" rel="noopener">open</a>' : '') + (t.error ? ' <span class="down">' + h(t.error) + '</span>' : '') + '</li>'; }).join('') + '</ul></div>' : '')
      + (it.elsewhere ? Object.keys(it.elsewhere).map((k) => { const e = it.elsewhere[k], fb = k === 'facebook';
          return '<div class="dr-sec"><span class="kicker">' + (fb ? 'On Facebook' : 'On Threads') + (safe(e.link) ? ' · <a href="' + h(safe(e.link)) + '" target="_blank" rel="noopener">open</a>' : '') + '</span><div class="nums">'
            + (fb ? [['Plays', k1(e.plays)], ['Reach', k1(e.reach)], ['Avg watch', e.watch == null ? '–' : e.watch.toFixed(1) + ' s'], ['Likes', k1(e.likes)], ['Comments', k1(e.comments)], ['Shares', k1(e.shares)], ['Follows', k1(e.follows)]]
              : [['Views', k1(e.views)], ['Likes', k1(e.likes)], ['Replies', k1(e.replies)], ['Reposts', k1(e.reposts)], ['Quotes', k1(e.quotes)], ['Shares', k1(e.shares)]])
              .map((x) => '<div><dt>' + x[0] + '</dt><dd>' + x[1] + '</dd></div>').join('') + '</div></div>'; }).join('') : '')
      + (it.hook ? '<div class="dr-sec"><span class="kicker">Hook</span><blockquote>' + h(it.hook) + '</blockquote></div>' : '')
      + (it.script ? '<details class="dr-sec"><summary><span class="kicker">Script</span></summary><pre>' + h(it.script) + '</pre></details>' : '')
      + (it.caption ? '<details class="dr-sec"><summary><span class="kicker">Caption</span></summary><pre>' + h(it.caption) + '</pre><button type="button" class="copy" data-copy="' + h(it.caption) + '">Copy caption</button></details>' : '')
      + (it.history.length ? '<details class="dr-sec"><summary><span class="kicker">Approvals and checks</span></summary>' + it.history.map((x) => '<h4>' + h(x.head) + '</h4><ul>' + x.lines.map((l) => '<li>' + h(l) + '</li>').join('') + '</ul>').join('') + '</details>' : '')
      + (it.files.length ? '<div class="dr-sec"><span class="kicker">Files' + (local ? '' : ' (on the computer)') + '</span><ul class="files">' + it.files.map((f) => '<li>' + fileLink(f) + '</li>').join('') + '</ul></div>' : '')
      + (it.fromPlan ? '<div class="dr-sec"><span class="kicker">From the plan</span><p class="quiet">This idea is a row in brand/plan.md. It gets its own folder when the reel starts.</p></div>' : '');
  }
  const clearHash = () => { if (location.hash.startsWith('#reel=')) history.replaceState(null, '', location.pathname + location.search); };
  function openCard(id, setHash) {
    const it = byId.get(id);
    if (!it || !dlg) return;
    state.open = id;
    cb.innerHTML = cardHtml(it);
    if (!dlg.open) dlg.showModal();
    cb.scrollTop = 0;
    if (setHash !== false) history.replaceState(null, '', '#reel=' + encodeURIComponent(id));
    const c = $('[data-close]', cb); if (c) c.focus({ preventScroll: true });
    paintSelection();
  }
  const closeCard = () => { if (dlg && dlg.open) dlg.close(); };
  const gotoDay = (k) => { if (!cal) return; state.cur = k; state.view = 'day'; localStorage.setItem('bu-cal-view', 'day'); closeCard(); renderCal(true); save(); const c = $('#calendar'); if (c) c.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); };
  if (dlg) {
    dlg.addEventListener('close', () => { state.open = null; clearHash(); paintSelection(); });
    dlg.addEventListener('cancel', clearHash);
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg || e.target.closest('[data-close]')) return closeCard();
      const other = e.target.closest('[data-open]');
      if (other) { openCard(other.dataset.open); return; }
      const st = e.target.closest('[data-step]');
      if (st && state.open) { const sib = siblings(byId.get(state.open)), next = sib[sib.indexOf(state.open) + Number(st.dataset.step)]; if (next) openCard(next); return; }
      const g = e.target.closest('[data-goto-day]');
      if (g) gotoDay(g.dataset.gotoDay);
    });
    dlg.addEventListener('keydown', (e) => {
      if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !e.target.closest('input,textarea')) { const b = $('[data-step="' + (e.key === 'ArrowRight' ? 1 : -1) + '"]', cb); if (b && !b.disabled) b.click(); }
    });
  }
  document.addEventListener('click', (e) => {
    const o = e.target.closest('[data-open]');
    if (o && !e.target.closest('dialog')) { e.preventDefault(); openCard(o.dataset.open); return; }
    const g = e.target.closest('[data-goto-day]');
    if (g && !e.target.closest('dialog')) { gotoDay(g.dataset.gotoDay); return; }
    const cp = e.target.closest('[data-copy]');
    if (cp) {
      const text = cp.dataset.copy, done = () => { const was = cp.textContent; cp.textContent = 'Copied'; cp.classList.add('ok'); setTimeout(() => { cp.textContent = was; cp.classList.remove('ok'); }, 1400); };
      const old = () => { const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (_) {} t.remove(); if (ok) done(); else { cp.textContent = 'Select and copy'; setTimeout(() => { cp.textContent = 'Copy'; }, 1800); } };
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, old); else old();   // the old way when the browser refuses (some file pages)
    }
  });
  const fromHash = () => { const m = location.hash.match(/^#reel=(.+)$/); if (m) openCard(decodeURIComponent(m[1]), false); };
  addEventListener('hashchange', fromHash);

  /* ── start: restore the last state, then draw ────────────────────────────────────────────────────────────── */
  applyFilter();
  fromHash();
  if (saved.y && performance.getEntriesByType && (performance.getEntriesByType('navigation')[0] || {}).type === 'reload') requestAnimationFrame(() => scrollTo(0, saved.y));
})();

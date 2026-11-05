// ───────────────────────── props reel: one shot per prop ─────────────────────────
// Each shot places one prop in the action area and cues it on its sentence's words (wordAt(word, from, nth, fallback)).
// The fallbacks keep the page working on any timing; the real cue is always the spoken word.
(() => {
  const shot = i => [SHOT_AT[i], SHOT_AT[i + 1] ?? VO_END + 1];
  const w = (word, i, fb = 0.5) => wordAt(word, shot(i)[0], 1, shot(i)[0] + fb);

  SC.badges = {
    label: '// 01 — badge line',
    draw: (T, K, t) => badgeLine(T, K, 540, 600, t, {
      ropeAt: shot(0)[0] + 0.05,
      badges: [[w('founder', 0, 1.2), 'FOUNDER', 'crown'], [w('sales', 0, 1.6), 'SALES', 'phone'], [w('support', 0, 2), 'SUPPORT', 'headset']],
    }),
  };
  SC.board = {
    label: '// 02 — flap board',
    draw: (T, K, t) => flapBoard(T, K, 540, 900, t, {
      title: 'NEXT ROLE',
      big: [[w('board', 1, 0.2), 'SALES', 'phone'], [w('finance', 1, 1.6), 'FINANCE', 'coin']],
      line: [[w('board', 1, 0.2), 'call prep · pipeline'], [w('finance', 1, 1.6), 'invoices · payroll']],
      count: [[w('board', 1, 0.2), '036'], [w('finance', 1, 1.6), '008']],
      countLabel: 'SKILLS',
    }),
  };
  SC.rail = {
    label: '// 03 — rail route',
    draw: (T, K, t) => railRoute(T, K, 540, 960, t, { s: 1.12,
      plate: 'HOW THE TEAM WORKS',
      layAt: [w('team', 2, 0.2), w('lays', 2, 0.5), w('track', 2, 0.9)],
      trainAt: w('train', 2, 1.3),
      passAt: [w('runs', 2, 1.6), w('whole', 2, 1.9), w('route', 2, 2.2)],
    }),
  };
  SC.gauge = {
    label: '// 04 — score gauge',
    draw: (T, K, t) => scoreGauge(T, K, 540, 860, t, {
      label: 'SITE SCORE', tag: 'audit · this week', value: 64, sweepAt: w('needle', 3, 0.9),
      flags: [[w('swings', 3, 1.2), '14 no meta'], [w('sixty', 3, 1.6), '4.1 s load'], [w('four', 3, 1.9), '6 dead links']],
    }),
  };
  SC.box = {
    label: '// 05 — launch box',
    draw: (T, K, t) => launchBox(T, K, 540, 1360, t, {
      word: 'KIT', sub: 'version 1.4', pill: 'new',
      dropAt: shot(4)[0] + 0.02, stampAt: w('lands', 4, 0.5), openAt: w('pops', 4, 1.1),
      card: { title: 'reel-kit', pill: 'new', files: ['GUIDE.md', 'starter/', 'examples/'], slots: ['print', 'depth', 'talking'] },
    }),
  };
  SC.tube = {
    label: '// 06 — tube mail',
    draw: (T, K, t) => tubeMail(T, K, 540, 960, t, {
      aTitle: 'session A · planner', bTitle: 'session B · builder', arriveAt: shot(5)[0] + 0.02,
      aLines: [[shot(5)[0] + 0.3, 'plan the login page', 'cmd'], [w('plan', 5, 0.8), '✓ plan written', 'ok']],
      bLines: [[w('other', 5, 1.4), 'build from plan.md', 'cmd'], [w('built', 5, 2.4), '✓ 2 files changed', 'ok']],
      sends: [{ at: w('sends', 5, 0.6), label: 'PLAN', lines: ['users table', '/login route'] },
              { at: w('back', 5, 2), label: 'BUILT', dir: 'ba', lines: ['users.sql', 'login.ts'] }],
    }),
  };
  SC.receipts = {
    label: '// 07 — receipt fan',
    draw: (T, K, t) => receiptFan(T, K, 540, 900, t, { s: 1.45,
      items: [
        { title: 'HOSTING', amount: '$20', lines: [['plan', 'pro'], ['seats', '1']] },
        { title: 'EMAIL', amount: '$45', lines: [['contacts', '5k'], ['sends', '∞']], stamp: 'DUE' },
        { title: 'DESIGN', amount: '$15', lines: [['seats', '1'], ['storage', '2 TB']], stamp: 'PAID' },
      ],
      arriveAt: [w('three', 6, 0.1), w('receipts', 6, 0.4), w('pile', 6, 0.7)],
      totalAt: w('add', 6, 1.4), total: 960, totalLine: 'EVERY YEAR', totalSub: 'for three tools',
    }),
  };
  SC.keys = {
    label: '// 08 — key ring',
    draw: (T, K, t) => keyRing(T, K, 540, 760, t, { s: 1.4,
      keys: [
        { label: 'EMAIL', offAt: w('back', 7, 2.6) },
        { label: 'BANK', redAt: w('take', 7, 2.2), offAt: w('back', 7, 2.6) + 0.12 },
        { label: 'CRM' },
        { label: 'DRIVE', offAt: w('back', 7, 2.6) + 0.24 },
      ],
      arriveAt: [w('key', 7, 0.3), w('hand', 7, 0.6), w('hangs', 7, 1.0), w('same', 7, 1.3)],
    }),
  };
})();

// The set catalogue: one shot per room builder in parts/rooms.js, with Bix in it and the builder's name on the taped
// title, one second each. Open it to see what exists before inventing: node modes/depth/tools/props-sheet.mjs <project>
// (any depth project works; it only borrows the folder for its stills/ output).
const SETS = [
  ['shop', (k, root) => { const s = k.rooms.shop(root, { neonWord: 'OPEN' }); s.signAt = -1; s.wordAt = -1; const b = k.buddy({ ...k.LOOK }, root); b.root.position.copy(s.host); return { s, b, view: 'wide' }; }],
  ['board', (k, root) => { const s = k.rooms.board(root, { cards: [{ title: 'CARD ONE', lines: ['two short', 'lines'], icon: k.kit.icons.parcel }, { title: 'CARD TWO', lines: ['pinned', 'on cue'], icon: k.kit.icons.target }] }); s.cards.forEach((c) => { c.at = -1; }); s.yarnAt = -1; return { s, view: 'board' }; }],
  ['desk', (k, root) => { const s = k.rooms.desk(root, { sky: 'night', neonWord: '24/7' }); s.signAt = -1; s.screen.draw((g, w, h) => { g.fillStyle = '#0d1117'; g.fillRect(0, 0, w, h); g.fillStyle = '#7fd69a'; g.font = "700 40px 'JetBrains Mono'"; g.fillText('> screen.draw(fn)', 30, 90); }); return { s, view: 'screen' }; }],
  ['monitor', (k, root) => { const s = k.rooms.monitor(root); s.screen.draw((g, w, h) => { g.fillStyle = '#0f141c'; g.fillRect(0, 0, w, h); g.fillStyle = '#e6edf3'; g.font = '800 64px Inter'; g.fillText('any live screen', 40, 120); }); return { s, view: 'screen' }; }],
  ['machine', (k, root) => { const s = k.rooms.machine(root, { name: 'MACHINE' }); s.startAt = 0; const b = k.buddy({ ...k.LOOK, scale: 0.8 }, root); b.root.position.set(0.6, 0, 0.62); b.root.rotation.y = -0.65; return { s, b, view: 'line' }; }],
  ['mapTable', (k, root) => { const s = k.rooms.mapTable(root); ['BAKERY', 'CAFE', 'GYM'].forEach((n, i) => s.pin(n, -1, i < 2 ? { pickAt: -1 } : {})); return { s, view: 'table' }; }],
  ['street', (k, root) => { const s = k.rooms.street(root, { sign: 'SHOP' }); s.wordAt = -1; const b = k.buddy({ ...k.LOOK }, root); b.root.position.copy(s.host); return { s, b, view: 'front' }; }],
  ['calendar', (k, root) => { const s = k.rooms.calendar(root); s.add(1, 1, '10:00', 'Event', '#ffe39a', -1, 'PROPOSED'); s.add(3, 4, '14:00', 'Another', '#c9ecd2', -1); return { s, view: 'wall' }; }],
  ['bench', (k, root) => { const s = k.rooms.bench(root); const b = k.buddy({ ...k.LOOK, scale: 0.8 }, root); b.root.position.copy(s.host); b.root.rotation.y = s.hostYaw; return { s, b, view: 'wide' }; }],
  ['tanks', (k, root) => { const s = k.rooms.tanks(root); s.flowAt = -1; return { s, view: 'wall' }; }],
];

export function catalogue() {
  const n = SETS.length;
  const words = SETS.map(([name], i) => ({ w: name, s: i + 0.1, e: i + 0.6 }));
  const shots = {};
  SETS.forEach(([name, make], i) => {
    shots[`s${i}`] = {
      build(k, shot) { const o = make(k, shot.root); shot.set = o.s; shot.o = o; shot.title = `k.rooms.${name}()`; },
      frame(k, t, shot) { if (name === 'mapTable') shot.set.frame(t, k.camera); else shot.set.frame?.call(shot.set, t); const b = shot.o.b; if (b) { b.idle(t); b.wave(t, shot.t0); } },
      view(k, t, shot) { return shot.o.view; },
    };
  });
  return {
    reel: { style: 'depth', theme: 'studio', tiles: { off: true }, tape: true, tail: 0.5, length: n },
    words,
    cuts: () => ({ cuts: SETS.map(([name], i) => ({ id: `s${i}`, from: { s: i }, label: name })), length: n }),
    shots,
  };
}

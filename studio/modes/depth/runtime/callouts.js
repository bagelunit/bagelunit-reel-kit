// Callouts: card-stock labels pinned to points in the 3D world with a leader line, re-projected through the camera on
// every frame, so they stay stuck to the thing as the camera glides. Plus the speed lines that ride a whip or swoop cut.
// Both are flat DOM over the 3D frame and pure functions of t.
//
//   k.label('battery', phone.marks.battery, 'Battery', { at: shot.at('battery'), sub: '4,500 mAh' })
//   point: an Object3D (follows it), a THREE.Vector3 / [x, y, z] in the shot's set coordinates, or (t) => either
//   opts: at (appear, default the shot start) · until (leave, default the shot end) · side 'left' | 'right' | 'auto'
//         · dx, dy (card offset from the point, px; default 150 sideways, -130 up) · sub (a small second line) · accent (dot colour)
// A label never sits in the caption band (y > 1350), under the taped title (y < 430), past the frame edges or under the
// right-hand buttons, and labels of the same shot step aside so they don't overlap.
import * as THREE from 'three';
import { clamp, settle, ease, grow, noise01 } from './maths.js';

const W = 1080, H = 1920, TOP = 432, BOTTOM = 1340, LEFT = 52, RIGHT = 1028, RAIL_X = 968;   // RAIL_X: keep clear of IG's buttons in y 1000-1600

const CSS = (accent) => `
#cl{position:absolute;inset:0;pointer-events:none}
#cl svg{position:absolute;left:0;top:0;width:${W}px;height:${H}px;overflow:visible}
#cl .card{position:absolute;left:0;top:0;padding:16px 26px 14px 54px;background:#FBF7EE;border:4px solid #17161A;border-radius:16px;
 box-shadow:0 8px 0 rgba(0,0,0,.28),0 16px 26px rgba(0,0,0,.3);white-space:nowrap;transform-origin:0 50%;box-sizing:border-box}
#cl .card b{display:block;font:800 42px/1.05 'Inter','Fallback',sans-serif;color:#17161A;letter-spacing:-.005em}
#cl .card s{display:block;margin-top:6px;font:700 26px/1 'JetBrains Mono','Fallback',monospace;color:#7d776d;text-decoration:none}
#cl .card i{position:absolute;left:18px;top:50%;width:22px;height:22px;margin-top:-11px;border-radius:50%;background:${accent};border:3px solid #17161A;box-sizing:border-box}
#sl{position:absolute;inset:0;pointer-events:none;overflow:hidden}
#sl i{position:absolute;display:block;background:rgba(255,246,226,.9);border-radius:3px}`;

export class Callouts {
  constructor(host, camera, accent = '#D9653B') {
    const st = document.createElement('style'); st.textContent = CSS(accent); document.head.appendChild(st);
    host.insertAdjacentHTML('beforeend', `<div id="cl"><svg viewBox="0 0 ${W} ${H}"></svg></div><div id="sl"></div>`);
    this.layer = host.querySelector('#cl'); this.svg = this.layer.querySelector('svg'); this.speed = host.querySelector('#sl');
    this.camera = camera; this.accent = accent; this.all = []; this.v = new THREE.Vector3();
    this.streaks = Array.from({ length: 22 }, (_, i) => { const el = document.createElement('i'); this.speed.appendChild(el); return { el, a: noise01(i * 3.1 + 1), b: noise01(i * 7.7 + 2), c: noise01(i * 1.9 + 5) }; });
  }

  add(key, shot, point, text, o = {}) {
    const card = document.createElement('div'); card.className = 'card';
    card.innerHTML = `<i${o.accent ? ` style="background:${o.accent}"` : ''}></i><b></b>${o.sub ? '<s></s>' : ''}`;
    card.querySelector('b').textContent = text; if (o.sub) card.querySelector('s').textContent = o.sub;
    this.layer.appendChild(card);
    const ns = 'http://www.w3.org/2000/svg', line = document.createElementNS(ns, 'path'), dot = document.createElementNS(ns, 'circle'), ring = document.createElementNS(ns, 'circle');
    line.setAttribute('fill', 'none'); line.setAttribute('stroke', '#17161A'); line.setAttribute('stroke-width', '5'); line.setAttribute('stroke-linecap', 'round');
    ring.setAttribute('r', '15'); ring.setAttribute('fill', '#FBF7EE'); ring.setAttribute('stroke', '#17161A'); ring.setAttribute('stroke-width', '4');
    dot.setAttribute('r', '7'); dot.setAttribute('fill', o.accent || this.accent);
    this.svg.append(line, ring, dot);
    const L = { key, shot, point, card, line, dot, ring, o, at: o.at ?? shot.t0 + 0.25, until: o.until ?? shot.t1, size: null };
    this.all.push(L); return L;
  }

  // where the point is on screen at t (or null when it is behind the lens)
  project(L, t) {
    let p = L.point;
    if (typeof p === 'function') p = p(t);
    if (p && p.isObject3D) { p.updateWorldMatrix(true, false); this.v.setFromMatrixPosition(p.matrixWorld); }
    else { const q = p instanceof THREE.Vector3 ? p : new THREE.Vector3(...(p || [0, 0, 0])); this.v.copy(q); L.shot.root.updateWorldMatrix(true, false); this.v.applyMatrix4(L.shot.root.matrixWorld); }
    this.v.project(this.camera);
    if (this.v.z > 1 || this.v.z < -1) return null;
    return [(this.v.x + 1) * 0.5 * W, (1 - this.v.y) * 0.5 * H];
  }

  frame(t, shot) {
    const placed = [];
    for (const L of this.all) {
      const live = L.shot === shot && t >= L.at - 0.001 && t < L.until + 0.25;
      const hide = () => { L.card.style.display = 'none'; L.line.style.display = L.dot.style.display = L.ring.style.display = 'none'; };
      if (!live) { hide(); continue; }
      const A = this.project(L, t);
      if (!A || A[0] < -40 || A[0] > W + 40 || A[1] < -40 || A[1] > H + 40) { hide(); continue; }
      L.card.style.display = ''; L.line.style.display = L.dot.style.display = L.ring.style.display = '';
      if (!L.size) L.size = [L.card.offsetWidth, L.card.offsetHeight];
      const [cw, ch] = L.size, side = L.o.side === 'left' ? -1 : L.o.side === 'right' ? 1 : A[0] > W / 2 ? -1 : 1;
      let x = side > 0 ? A[0] + (L.o.dx ?? 150) : A[0] - (L.o.dx ?? 150) - cw, y = A[1] + (L.o.dy ?? -130) - ch / 2;
      const fit = () => {
        x = clamp(x, LEFT, RIGHT - cw); y = clamp(y, TOP, BOTTOM - ch);
        if (y + ch > 1000 && x + cw > RAIL_X) x = RAIL_X - cw;
      };
      fit();
      for (let tries = 0; tries < 6; tries++) {                       // step aside from labels already placed this frame
        const hit = placed.find((r) => x < r[0] + r[2] + 12 && x + cw + 12 > r[0] && y < r[1] + r[3] + 12 && y + ch + 12 > r[1]);
        if (!hit) break;
        y = hit[1] + hit[3] + 16 + ch > BOTTOM ? hit[1] - ch - 16 : hit[1] + hit[3] + 16; fit();
      }
      placed.push([x, y, cw, ch]);
      // appear: the dot pops, the line draws to the card, the card grows from its anchor edge; leave: everything fades
      const v = t - L.at, out = clamp((t - L.until) / 0.22), fade = 1 - out;
      const gc = grow(v - 0.14, 3.4, 0.55), drawn = ease.out(clamp((v - 0.04) / 0.22));
      const ex = side > 0 ? x : x + cw, ey = clamp(A[1], y + 14, y + ch - 14);
      const mx = A[0] + (ex - A[0]) * drawn, my = A[1] + (ey - A[1]) * drawn;
      L.line.setAttribute('d', `M${A[0].toFixed(1)} ${A[1].toFixed(1)} L${mx.toFixed(1)} ${my.toFixed(1)}`);
      L.line.style.opacity = fade; L.ring.style.opacity = L.dot.style.opacity = fade;
      const pop = grow(v, 4, 0.5);
      L.ring.setAttribute('cx', A[0].toFixed(1)); L.ring.setAttribute('cy', A[1].toFixed(1)); L.ring.setAttribute('r', (15 * pop).toFixed(1));
      L.dot.setAttribute('cx', A[0].toFixed(1)); L.dot.setAttribute('cy', A[1].toFixed(1)); L.dot.setAttribute('r', (7 * pop).toFixed(1));
      L.card.style.transformOrigin = side > 0 ? '0 50%' : '100% 50%';
      L.card.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${(gc * (1 - 0.08 * out)).toFixed(3)})`;
      L.card.style.opacity = (fade * clamp(v / 0.12)).toFixed(3);
    }
  }

  // speed lines for a whip (horizontal) or swoop (vertical) cut: amount 0..1, dir ±1; no blur, just crisp streaks
  streak(kind, amount, dir = 1) {
    const on = kind && amount > 0.02;
    this.speed.style.display = on ? '' : 'none';
    if (!on) return;
    this.streaks.forEach((s, i) => {
      const len = 180 + 520 * s.b * amount, thick = 3 + 5 * s.c, travel = (1 - amount) * 900 * dir;
      if (kind === 'whip') { s.el.style.width = `${len}px`; s.el.style.height = `${thick}px`; s.el.style.left = `${(s.a * (W + 400) - 200 - travel).toFixed(1)}px`; s.el.style.top = `${(260 + s.c * 1300).toFixed(1)}px`; }
      else { s.el.style.width = `${thick}px`; s.el.style.height = `${len}px`; s.el.style.left = `${(40 + s.c * 1000).toFixed(1)}px`; s.el.style.top = `${(s.a * (H + 400) - 200 - travel).toFixed(1)}px`; }
      s.el.style.opacity = (amount * (0.35 + 0.5 * s.b)).toFixed(3);
    });
  }
}

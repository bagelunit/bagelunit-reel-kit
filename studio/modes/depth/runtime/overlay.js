// The flat layer on top of the 3D frame: a taped title per shot, a counter badge, a typing command chip, the comment-box
// call to action, and the caption tiles. Plain DOM, positioned for 1080×1920 and Instagram's safe zones (nothing below
// y 1600 or under the right-hand buttons). Every update is a pure function of t.
//
// What a shot sets in build() (all optional):
//   shot.title = 'TEXT'                       the taped title (default: the cut's title / label; reel.json "tape": false hides it)
//   shot.badge = ['LABEL', (t) => number]     a counter card that pops in and punches when the number changes
//   shot.chip  = '› command'  or { text, at }  a terminal chip that types itself in
//   shot.cta   = { keyword, at, sub }          the comment box: the keyword types on the spoken word, Post presses, hearts float
import { clamp, settle, jolt, grow, noise01, TAU, ease } from './maths.js';
import { plain } from './cutlist.js';

const CSS = (accent, ink) => `
#ov .tape{position:absolute;left:50%;top:222px;transform-origin:50% 0;padding:20px 44px 18px;background:#EEE4CD;color:#17161A;
 font:800 44px/1 'Inter','Fallback',sans-serif;letter-spacing:.005em;text-transform:uppercase;white-space:nowrap;
 box-shadow:0 7px 0 rgba(0,0,0,.28),0 18px 30px rgba(0,0,0,.35);
 clip-path:polygon(0 4%,2% 0,30% 3%,55% 0,80% 2%,100% 0,99% 50%,100% 100%,70% 97%,45% 100%,20% 97%,0 100%,1% 50%);
 background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' seed='4'/%3E%3CfeColorMatrix values='0 0 0 0 .35 0 0 0 0 .28 0 0 0 0 .18 0 0 0 .22 0'/%3E%3C/filter%3E%3Crect width='300' height='120' filter='url(%23n)'/%3E%3C/svg%3E")}
#ov .strip{position:absolute;top:206px;width:118px;height:40px;background:rgba(214,195,148,.86);box-shadow:0 2px 3px rgba(0,0,0,.25)}
#ov .badge{position:absolute;left:72px;top:430px;min-width:300px;padding:18px 26px 14px;border-radius:18px;background:#FBF7EE;border:4px solid #17161A;
 box-shadow:0 9px 0 rgba(0,0,0,.3);transform-origin:0 0;box-sizing:border-box}
#ov .badge .l{font:800 25px/1 'Inter','Fallback',sans-serif;letter-spacing:.08em;color:#8A847A;margin-left:56px;white-space:nowrap}
#ov .badge .dot{position:absolute;left:20px;top:13px;width:40px;height:40px;border-radius:50%;background:${accent}}
#ov .badge .n{font:800 104px/1 'Inter','Fallback',sans-serif;color:${accent};margin-top:8px;transform-origin:0 70%;display:inline-block}
#ov .chip{position:absolute;left:80px;top:1268px;height:62px;padding:0 26px 0 22px;border-radius:12px;background:#17181E;border:2px solid #34353F;
 color:#ECE8E0;font:700 30px/62px 'JetBrains Mono','Fallback',monospace;white-space:nowrap;box-shadow:0 10px 24px rgba(0,0,0,.45);transform-origin:0 50%}
#ov .chip b{color:${accent};font-weight:700}#ov .chip i{display:inline-block;width:15px;height:32px;margin-left:4px;vertical-align:-6px;background:#ECE8E0}
#ov .chip u{text-decoration:none;color:#3FB950;margin-left:16px}
#ov .cta{position:absolute;left:120px;width:840px;top:690px;height:112px;border-radius:56px;background:#FBF7EE;border:4px solid #17161A;box-shadow:0 10px 0 rgba(0,0,0,.3);box-sizing:border-box}
#ov .cta .av{position:absolute;left:18px;top:16px;width:72px;height:72px;border-radius:50%;background:${accent};border:3px solid #17161A;box-sizing:border-box}
#ov .cta .tx{position:absolute;left:112px;top:0;height:104px;font:800 50px/104px 'Inter','Fallback',sans-serif;color:#17161A;white-space:nowrap}
#ov .cta .tx.ph{color:#9C968C}#ov .cta .tx i{display:inline-block;width:4px;height:52px;vertical-align:-10px;margin-left:3px;background:#17161A}
#ov .cta .post{position:absolute;right:14px;top:14px;height:76px;padding:0 34px;border-radius:38px;background:${accent};color:#FFF3DF;font:800 40px/76px 'Inter','Fallback',sans-serif;border:3px solid #17161A;box-sizing:border-box}
#ov .sub{position:absolute;left:50%;top:828px;height:72px;padding:0 30px;border-radius:14px;background:#17181E;border:3px solid #34353F;color:#ECE8E0;font:700 34px/72px 'Inter','Fallback',sans-serif;white-space:nowrap;box-shadow:0 10px 24px rgba(0,0,0,.45)}
#ov .hearts i{position:absolute;top:640px;font:800 60px/1 'Inter',sans-serif;font-style:normal;color:#e5484d;text-shadow:0 4px 0 rgba(0,0,0,.25);opacity:0}
#ov .hearts i:nth-child(3n+2){color:#f2c14e}
#ov .band{position:absolute;left:0;right:0;top:1360px;height:250px;pointer-events:none;background:linear-gradient(180deg,rgba(14,11,16,0) 0%,rgba(14,11,16,.5) 38%,rgba(14,11,16,.5) 70%,rgba(14,11,16,0) 100%)}
#ov .tiles{position:absolute;left:36px;right:36px;top:1420px;text-align:center;white-space:nowrap}
#ov .tiles span{display:inline-block;margin:0 8px;padding:16px 30px 22px;border-radius:9px;background:${accent};color:#FFF3DF;
 font:800 94px/1 'Playfair Display','Fallback',serif;box-shadow:0 6px 0 rgba(0,0,0,.32),0 14px 22px rgba(0,0,0,.35);text-shadow:0 3px 0 rgba(0,0,0,.25)}
#ov .tiles span.key{background:#FFF3DF;color:${accent};box-shadow:0 6px 0 #b9a98c,0 14px 22px rgba(0,0,0,.35);text-shadow:none}`;

export class Overlay {
  constructor(host, words, { accent = '#D9653B', ink = '#17161A', keys = [], tiles = {}, tape = true } = {}) {
    const st = document.createElement('style'); st.textContent = CSS(accent, ink); document.head.appendChild(st);
    host.id = 'ov';
    host.insertAdjacentHTML('beforeend', `<div class="tape"></div><i class="strip L"></i><i class="strip R"></i>
<div class="badge"><i class="dot"></i><div class="l"></div><div><span class="n">0</span></div></div><div class="chip"></div>
<div class="cta"><i class="av"></i><div class="tx"></div><div class="post">Post</div></div><div class="sub"></div>
<div class="hearts">${'<i>♥</i><i>★</i><i>♥</i><i>♥</i><i>★</i><i>♥</i><i>♥</i><i>★</i>'}</div><div class="band"></div><div class="tiles"></div>`);
    const q = (s) => host.querySelector(s);
    Object.assign(this, { host, tapeEl: q('.tape'), L: q('.strip.L'), R: q('.strip.R'), badge: q('.badge'), blab: q('.badge .l'), num: q('.badge .n'), chip: q('.chip'),
      cta: q('.cta'), ctx: q('.cta .tx'), post: q('.cta .post'), sub: q('.sub'), hearts: [...host.querySelectorAll('.hearts i')], tilesEl: q('.tiles'), bandEl: q('.band'), tape, last: {} });
    [...this.hearts].forEach((h, i) => { h.style.left = `${790 + (i % 4) * 34}px`; });
    this.groups = groupWords(words, new Set([...keys, ...(tiles.keys || [])].map(plain)), tiles.perTile || 3, tiles.chars || 14);
    this.tilesOff = tiles.off === true;
  }

  // one frame: shot = the live shot (title/badge/chip/cta), u = seconds since its cut
  frame(t, shot, fps = 30) {
    const u = t - shot.t0, L = this.last;
    // taped title: drops in on every cut with a little swing
    const title = this.tape ? (shot.title ?? shot.cut.title ?? shot.cut.label ?? '') : '';
    this.tapeEl.style.display = this.L.style.display = this.R.style.display = title ? '' : 'none';
    if (title) {
      if (this.tapeEl.textContent !== title) this.tapeEl.textContent = title;
      const s = settle(u, 3.2, 0.55), bw = this.tapeEl.offsetWidth, dy = -46 * (1 - s), rot = -1.2 + 3 * (1 - s);
      this.tapeEl.style.transform = `translateX(-50%) translateY(${dy.toFixed(1)}px) rotate(${rot.toFixed(2)}deg)`;
      this.L.style.left = `${540 - bw / 2 - 44}px`; this.R.style.left = `${540 + bw / 2 - 74}px`;
      this.L.style.transform = `translateY(${dy.toFixed(1)}px) rotate(-31deg)`; this.R.style.transform = `translateY(${dy.toFixed(1)}px) rotate(29deg)`;
    }
    // counter badge
    if (shot.badge) {
      const [lab, fn] = shot.badge, n = fn(t);
      if (this.blab.textContent !== lab) this.blab.textContent = lab;
      if (this.num.textContent !== String(n)) this.num.textContent = String(n);
      let since = 99; for (let k = 1; k < 12; k++) if (fn(t - k / fps) !== n) { since = (k - 1) / fps; break; }
      this.badge.style.opacity = 1; this.badge.style.transform = `scale(${grow(u - 0.15, 3.2, 0.5).toFixed(3)})`;
      this.num.style.transform = `scale(${(1 + 0.26 * jolt(since, 4, 0.5)).toFixed(3)})`;
    } else this.badge.style.opacity = 0;
    // command chip
    const chip = typeof shot.chip === 'string' ? { text: shot.chip, at: shot.t0 + 0.18 } : shot.chip;
    if (chip) {
      const v = t - chip.at, n = clamp(Math.floor(v * 26), 0, chip.text.length), done = n >= chip.text.length, caret = !done || Math.floor(t * 4) % 2 === 0;
      const html = `<b>›</b> ${esc(chip.text.slice(0, n))}${caret ? '<i></i>' : ''}${done && v > chip.text.length / 26 + 0.3 ? '<u>● running</u>' : ''}`;
      this.chip.style.opacity = v > -0.1 ? 1 : 0; this.chip.style.transform = `scaleX(${grow(v + 0.1, 4, 0.6).toFixed(3)})`;
      if (html !== L.chip) { this.chip.innerHTML = html; L.chip = html; }
    } else this.chip.style.opacity = 0;
    // the comment box
    const cta = shot.cta;
    if (cta) {
      const kw = String(cta.keyword || 'LINK'), tk = cta.at ?? shot.t0 + 0.6, step = Math.max(0.05, (cta.typeFor ?? 0.5) / kw.length);
      const n = clamp(Math.floor((t - tk) / step) + 1, 0, kw.length), typed = t >= tk ? kw.slice(0, n) : '', tp = tk + kw.length * step + 0.25;
      const press = Math.max(0, Math.sin(Math.PI * clamp((t - tp) / 0.22)));
      this.cta.style.opacity = 1; this.cta.style.transform = `translateY(${(140 * (1 - settle(u - 0.05, 2.6, 0.62))).toFixed(1)}px)`;
      const html = typed ? `${esc(typed)}${t < tp && Math.floor(t * 4) % 2 === 0 ? '<i></i>' : ''}` : 'Add a comment…';
      if (html !== L.cta) { this.ctx.innerHTML = html; L.cta = html; }
      this.ctx.className = typed ? 'tx' : 'tx ph';
      const posted = t > tp + 0.1;
      this.post.style.transform = `scale(${(1 - 0.14 * press + 0.1 * jolt(t - tp - 0.2, 3, 0.4)).toFixed(3)})`;
      this.post.style.background = posted ? '#1f9a55' : ''; this.post.textContent = posted ? 'Posted ✓' : 'Post';
      const sv = t - tp - 0.25; this.sub.style.display = cta.sub ? '' : 'none';
      if (cta.sub) { if (this.sub.textContent !== cta.sub) this.sub.textContent = cta.sub; this.sub.style.opacity = sv > 0 ? 1 : 0; this.sub.style.transform = `translateX(-50%) scale(${grow(sv, 3.4, 0.5).toFixed(3)})`; }
      this.hearts.forEach((el, i) => { const v = (t - tp - 0.15 - i * 0.13) / 1.1; el.style.opacity = v <= 0 || v >= 1 ? 0 : (1 - v * v).toFixed(3); if (v > 0 && v < 1) el.style.transform = `translate(${(18 * Math.sin(TAU * (v * 1.2 + i * 0.37))).toFixed(1)}px,${(-300 * ease.out(v)).toFixed(1)}px) scale(${(0.6 + 0.6 * grow(v * 1.1, 3, 0.5)).toFixed(3)})`; });
    } else { this.cta.style.opacity = 0; this.sub.style.opacity = 0; this.hearts.forEach((el) => { el.style.opacity = 0; }); }
    // caption tiles
    if (this.tilesOff || shot.tiles === false) { this.tilesEl.style.display = this.bandEl.style.display = 'none'; return; }
    this.tilesEl.style.display = this.bandEl.style.display = '';
    const gi = this.groups.findLastIndex((g) => t >= g[0].s), grp = gi >= 0 && t < this.groups[gi].end ? this.groups[gi] : [];
    const key = gi + ':' + grp.filter((w) => t >= w.s).length;
    if (key !== L.tiles) { this.tilesEl.innerHTML = grp.map((w) => `<span class="${w.key ? 'key' : ''}">${esc(w.show)}</span>`).join(''); L.tiles = key; }
    [...this.tilesEl.children].forEach((el, j) => { const v = t - grp[j].s; el.style.visibility = v < 0 ? 'hidden' : 'visible'; el.style.transform = `rotate(${((noise01(gi * 7 + j) - 0.5) * 5).toFixed(2)}deg) scale(${(0.55 + 0.45 * settle(v, 4.2, 0.5)).toFixed(3)})`; });
  }
}

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

// words → tile groups of up to `per` words: break after punctuation, never past `chars` characters. A group stays up
// until the next one starts (or 0.8 s after its last word, whichever is first).
function groupWords(words, keys, per, chars) {
  const out = []; let cur = [];
  const flush = () => { if (cur.length) out.push(cur); cur = []; };
  words.forEach((w) => {
    const show = String(w.text).replace(/^["“'(]+|["”'),.!?:;]+$/g, '');
    if (!show) return;
    const len = cur.reduce((n, x) => n + x.show.length + 1, 0) + show.length;
    if (cur.length >= per || (cur.length && len > chars)) flush();
    cur.push({ s: w.s, e: w.e, show, key: keys.has(plain(w.text)) });
    if (/[.!?,:;]["”']?$/.test(w.text)) { cur.stop = true; flush(); }
  });
  flush();
  // no lone word on its own tile row ("up."): a one-word group that ends a phrase joins the group before it when that group ran on
  // (no punctuation) and the pair still fits; otherwise it borrows that group's last word
  for (let i = out.length - 1; i > 0; i--) {
    const g = out[i], prev = out[i - 1];
    if (g.length !== 1 || prev.stop) continue;
    const joined = prev.reduce((n, x) => n + x.show.length + 1, 0) + g[0].show.length;
    if (prev.length < per + 1 && joined <= chars + 4) { const stop = g.stop; prev.push(g[0]); prev.stop = stop; out.splice(i, 1); }
    else if (prev.length >= 3) g.unshift(prev.pop());
  }
  out.forEach((g, i) => { g.end = Math.min(out[i + 1] ? out[i + 1][0].s : Infinity, g.at(-1).e + 0.8); });
  return out;
}

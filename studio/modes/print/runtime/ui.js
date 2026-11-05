/* Susanoo Reel Kit print · ui
   Interface pieces drawn in the house finish (paper-white card stock, a 3 px ink edge, a hard offset shadow on the tone layer,
   Oswald labels) and the on-screen words of the kit in the reel's language. Helpers draw at the coordinates they are given; wrap
   them in X([T, K], x, y, s, rotDeg, fn) to place or animate a group. */

// a spring that rests at 0 until its start (dt ≤ 0), then overshoots and settles on 1
const pop = (dt, f = 2.6, z = 0.42) => (dt <= 0 ? 0 : spring(dt, f, z));
// run fn with every context in cs moved to (x, y), turned r degrees and scaled by s
const X = (cs, x, y, s, r, fn) => {
  cs.forEach(c => {
    c.save();
    c.translate(x, y);
    c.rotate(r * D2R);
    c.scale(s, s);
  });
  fn();
  cs.forEach(c => c.restore());
};
const HAIR = '#E0D6C8';   // warm hairline for dividers inside cards (card edges are ink)
const CARD = '#FFFDF9';   // card stock
// the house shadow: the card's shape dropped down-right as a solid grey block on T (no blur); s scales the offset
const cardShadow = (T, x, y, w, h, r, s = 1) => fillRR(T, x + 12 * s, y + 14 * s, w, h, r, '#7A7A7A');

/* ---------- the kit's own words, per language ---------- */
// reel.json "language" picks the column (ISO code); reel.json "ui": { key: "text" } overrides any key, and your own keys work too.
const UI_KEYS = 'comments addComment post you newMessage sentLink newTab workflow today plan done doneCount nope sceneProblem sceneHow sceneGet'.split(' ');
const UI = {};
`en|Comments|Add a comment…|Post|you|new message|sent you the link|New tab|your workflow|today|the plan|Done.|DONE|NOPE|the problem|how it works|get it
ru|Комментарии|Добавьте комментарий…|Опубликовать|вы|новое сообщение|держи ссылку|Новая вкладка|ваши задачи|сегодня|план|Готово.|ГОТОВО|НЕТ|проблема|как это работает|забирай
uk|Коментарі|Додайте коментар…|Опублікувати|ви|нове повідомлення|тримай посилання|Нова вкладка|ваші задачі|сьогодні|план|Готово.|ГОТОВО|НІ|проблема|як це працює|забирай
es|Comentarios|Añade un comentario…|Publicar|tú|nuevo mensaje|te envié el enlace|Nueva pestaña|tu flujo de trabajo|hoy|el plan|Listo.|LISTO|NO|el problema|cómo funciona|consíguelo
pt|Comentários|Adicione um comentário…|Publicar|você|nova mensagem|te mandei o link|Nova aba|seu fluxo de trabalho|hoje|o plano|Pronto.|PRONTO|NÃO|o problema|como funciona|pegue o seu
de|Kommentare|Kommentar hinzufügen…|Posten|du|neue Nachricht|hier ist der Link|Neuer Tab|dein Workflow|heute|der Plan|Fertig.|FERTIG|NEIN|das Problem|so geht’s|hol es dir
fr|Commentaires|Ajouter un commentaire…|Publier|vous|nouveau message|voici le lien|Nouvel onglet|ton flux de travail|aujourd’hui|le plan|Terminé.|FAIT|NON|le problème|comment ça marche|à toi
it|Commenti|Aggiungi un commento…|Pubblica|tu|nuovo messaggio|ecco il link|Nuova scheda|il tuo flusso di lavoro|oggi|il piano|Fatto.|FATTO|NO|il problema|come funziona|prendilo
tr|Yorumlar|Yorum ekle…|Paylaş|sen|yeni mesaj|linki gönderdim|Yeni sekme|iş akışın|bugün|plan|Tamam.|TAMAM|HAYIR|sorun|nasıl çalışır|hemen al
ar|التعليقات|أضف تعليقًا…|نشر|أنت|رسالة جديدة|أرسلت لك الرابط|علامة تبويب جديدة|سير عملك|اليوم|الخطة|تم.|تم|لا|المشكلة|كيف يعمل|احصل عليه
hi|कमेंट्स|कमेंट जोड़ें…|पोस्ट करें|आप|नया मैसेज|लिंक भेज दिया|नया टैब|आपका वर्कफ़्लो|आज|प्लान|हो गया।|हो गया|नहीं|समस्या|कैसे काम करता है|अभी पाएँ`
  .split('\n').forEach(row => {
    const [lang, ...words] = row.split('|');
    UI[lang] = Object.fromEntries(UI_KEYS.map((key, i) => [key, words[i]]));
  });
// the reel's settings, or nothing before reel.json has loaded
const reelSettings = () => (typeof REEL !== 'undefined' && REEL ? REEL : {});
// a word of the kit in the reel's language: reel.json "ui" first, then the language, then English, then the key itself
function uiText(key) {
  const reel = reelSettings();
  if (reel.ui && reel.ui[key] != null) return String(reel.ui[key]);
  const lang = String(reel.language || 'en').toLowerCase().split(/[-_]/)[0];
  const own = UI[lang] && UI[lang][key];
  return own ?? UI.en[key] ?? key;
}
// every word of the kit for this reel (the engine preloads Fallback glyphs for them)
const uiStrings = () => Object.keys({ ...UI.en, ...(reelSettings().ui || {}) }).map(uiText);

/* ---------- cards and controls ---------- */
// a card: the house shadow and a white face on T, the card-stock fill and the ink edge on K
const uiCard = (T, K, x, y, w, h, o = {}) => {
  const c = withDefaults(o, { r: 26, shadow: 1, fill: CARD, border: C.ink, lw: 3 });
  if (c.shadow) cardShadow(T, x, y, w, h, c.r, c.shadow);
  fillRR(T, x, y, w, h, c.r, '#FFFFFF');
  if (c.fill) fillRR(K, x, y, w, h, c.r, c.fill);
  if (c.lw) strokeRR(K, x, y, w, h, c.r, c.border, c.lw);
};
// a card's header label: caps in the Oswald voice, grey by default
const uiLabel = (K, str, x, y, o = {}) => text(K, String(str).toUpperCase(), x, y, {
  font: F.voice, weight: 400, size: (o.size || 24) * 1.08, ls: 1.5, color: o.color || '#8a8076', align: o.align || 'left',
});
// a capsule button centred on (x, y); press 0..1 squeezes it
const uiPill = (K, str, x, y, w, h, o = {}) => {
  const p = withDefaults(o, { fill: C.ink, color: C.paper, size: 32, press: 0, weight: 700 });
  const squeeze = 1 - p.press * 0.06;
  K.save();
  K.translate(x, y);
  K.scale(squeeze, squeeze);
  fillRR(K, -w / 2, -h / 2, w, h, h / 2, p.fill);
  if (o.stroke) strokeRR(K, -w / 2, -h / 2, w, h, h / 2, o.stroke, 3);
  text(K, str, 0, p.size * 0.36, { font: F.grot, weight: p.weight, size: p.size, color: p.color });
  K.restore();
};
// a form field with an optional mono label above it; missing = a dashed accent outline instead of the field
const uiField = (K, x, y, w, h, value, o = {}) => {
  const f = withDefaults(o, { label: null, missing: false, t: 0 });
  if (f.label) text(K, f.label, x, y - 14, { font: F.mono, weight: 500, size: 22, color: f.missing ? C.red : '#8a8780', align: 'left' });
  if (f.missing) {
    K.save();
    K.setLineDash([12, 10]);
    strokeRR(K, x, y, w, h, 14, C.red, 3);
    K.restore();
    return;
  }
  fillRR(K, x, y, w, h, 14, '#FFFFFF');
  strokeRR(K, x, y, w, h, 14, o.focus ? C.ink : HAIR, 3);
  if (value) text(K, value, x + 22, y + h / 2 + 12, { font: F.grot, weight: 500, size: o.size || 32, color: C.ink, align: 'left' });
};
// a big rolling number (p 0 → 1), tightly spaced
const bigFigure = (K, str, x, y, size, p, o = {}) =>
  slot(K, str, x, y, { font: F.grot, weight: 700, size, color: o.color || C.ink, align: o.align || 'center', ls: -size * 0.04 }, p);
// a seal: a word in the accent voice inside a rotated double capsule, slammed on at dt = 0 (use sparingly)
const seal = (K, str, x, y, dt, o = {}) => {
  if (dt < 0) return;
  const s = withDefaults(o, { size: 120, col: C.red, rot: -10 });
  const k = dt < 0.12 ? lerp(1.9, 1, E.inQuart(dt / 0.12)) : 1 + ring(dt - 0.12, 5, 11) * 0.04;
  const face = { font: F.serif, italic: true, weight: 400, size: s.size };
  const w = measure(K, str, face) + s.size * 0.7;
  const h = s.size * 1.25;
  K.save();
  K.translate(x, y);
  K.rotate(s.rot * D2R);
  K.scale(k, k);
  K.globalAlpha *= clamp(dt / 0.05);
  strokeRR(K, -w / 2, -h / 2, w, h, h / 2, s.col, 6);
  strokeRR(K, -w / 2 + 12, -h / 2 + 12, w - 24, h - 24, h / 2 - 12, s.col, 2.5);
  text(K, str, 0, s.size * 0.3, { ...face, color: s.col });
  K.restore();
};
// line icons sized by s, drawn on by p
const iconCheck = (K, x, y, s, p, col = C.ink) => check(K, x, y, s, p, col, s * 0.16);
const iconX = (K, x, y, s, p, col = C.red) => cross(K, x, y, s, p, col, s * 0.16);

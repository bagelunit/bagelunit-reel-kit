// ctafill.mjs: the brand's call to action, laid over a new reel's reel.json, and the closing scene of a scene-style plan.
//
// A reel's call to action is often "Comment KEYWORD", the word the brand's comment auto-reply answers. reel.json holds it as
//   "cta": { "keyword": "REEL", "text": "I'll send you the link" }
// keyword: one word shown large in the closing scene, inside the safe zone (top 250, bottom 300, left 60, right 120 px).
// text:    an optional short line under it (up to 48 characters).
// The brand's own words live in brand/brand.json "cta": tested_keywords (keywords whose DM auto-reply was tested from a second
// account; the first one is the brand's keyword for new reels) and default (the brand's usual ask, used as the line under it).
//
//   brandCta(brand)                    -> { keyword, text } read from brand.json, '' for anything missing or unusable
//   applyBrandCta(reel, brand)         -> notes (plain words); sets reel.cta.keyword / reel.cta.text, moves a depth tile key along
//   ctaScene(templateDefs, cta)        -> one scene ({template, props, narration}) for the end of a scene-style plan, or null
//
// kit start calls applyBrandCta(reel, brand) next to applyBrandLook. With no tested keyword the starter's sample keyword stays
// (existing behaviour) and the note says so. Pure functions, no files touched.
export const KEYWORD_MAX = 14;
export const TEXT_MAX = 48;

// one word, letters and digits only, upper case: what a comment can say and the big pill can hold
export function cleanKeyword(v) {
  const k = String(v ?? '').normalize('NFKD').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  return k && k.length <= KEYWORD_MAX ? k : '';
}

export function cleanText(v) {
  const t = String(v ?? '').replace(/\s+/g, ' ').trim();
  return t && t.length <= TEXT_MAX ? t : '';
}

export function brandCta(brand) {
  const c = brand && typeof brand === 'object' && brand.cta && typeof brand.cta === 'object' ? brand.cta : {};
  const tested = Array.isArray(c.tested_keywords) ? c.tested_keywords : [];
  const keyword = tested.map(cleanKeyword).find(Boolean) || '';
  // brand.cta.default is often a whole sentence ("Comment REEL for the kit"); only a short line fits under the keyword
  return { keyword, text: cleanText(c.default) };
}

export function applyBrandCta(reel, brand) {
  const notes = [];
  const was = reel.cta && typeof reel.cta === 'object' ? reel.cta : {};
  const { keyword, text } = brandCta(brand);
  if (!keyword) {
    notes.push(`brand.json cta.tested_keywords is empty: the sample keyword ${was.keyword || 'REEL'} stays in reel.json cta. Use a keyword call to action only once its auto-reply is tested (brand rule 4); otherwise end on a save or follow ask`);
    return notes;
  }
  const next = { ...was, keyword };
  if (text) next.text = text;
  reel.cta = next;
  // the depth starter shows the keyword as a tile too: keep the tile in step
  const old = cleanKeyword(was.keyword);
  if (old && old !== keyword && reel.tiles && Array.isArray(reel.tiles.keys)) reel.tiles.keys = reel.tiles.keys.map((k) => (cleanKeyword(k) === old ? keyword : k));
  notes.push(`the brand's keyword ${keyword} is in reel.json cta${text ? ` with the line "${text}"` : ''}; the closing scene shows it large, and the last sentence of script.txt must say it (kit lint warns when it does not)`);
  return notes;
}

// a scene-style plan ends on one scene: the style's own title-like template with the keyword as its big word. Which template and
// which props differ per style, so this looks for the first template of an ordered list that has a short big-text prop.
const TEMPLATES = ['title-card', 'headline-title', 'splash-title', 'big-reveal', 'eyecatch-title', 'chapter-title', 'headline-thumb', 'dramatic-reveal', 'title-screen'];
const BIG = ['title', 'headline', 'reveal', 'kicker', 'caption', 'text'];
const SMALL = ['subtitle', 'kicker', 'caption', 'setup', 'tagline'];

export function ctaScene(templateDefs, cta) {
  const keyword = cleanKeyword(cta && cta.keyword);
  if (!keyword || !Array.isArray(templateDefs)) return null;
  const text = cleanText(cta && (cta.text || cta.sub));
  const props = (t) => (t.propsSchema && t.propsSchema.properties) || {};
  const isString = (t, k) => props(t)[k] && props(t)[k].type === 'string';
  const pick = TEMPLATES.map((id) => templateDefs.find((t) => t.id === id)).find((t) => t && BIG.some((k) => isString(t, k)));
  const tpl = pick || templateDefs.find((t) => BIG.some((k) => isString(t, k)));
  if (!tpl) return null;
  const big = BIG.find((k) => isString(tpl, k));
  const small = SMALL.find((k) => k !== big && isString(tpl, k));
  const out = { ...(tpl.exampleProps || {}), [big]: keyword };
  if (small) out[small] = text || 'Comment below';
  if (isString(tpl, 'keyword')) out.keyword = keyword.toLowerCase();   // the narration word the scene lands on
  const narration = `Comment ${keyword} and I'll send it to you.`;
  return { template: tpl.id, props: out, narration };
}

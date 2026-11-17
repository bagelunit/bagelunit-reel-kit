// tips.mjs · one short, non-blocking line on stderr at the step where an optional outside tool would help. Rules: a tool the brand
// has (found here or declared), dismissed, or whose category already has a tool the brand uses gets no tip; at most ONE tip per
// command; a tool is never named twice within 7 days (brand/.tips.json); off with BAGELUNIT_NO_TIPS=1, --no-tips or brand.json
// tools.tips = false. A tip never changes an exit code or anything on stdout, and any failure here is silent.
import fs from 'node:fs';
import path from 'node:path';
import { loadCatalog, allTools, findBrandDir, readBrandJson, stateOf, statusAll, mcpServers } from './suggest.mjs';

export const WEEK_MS = 7 * 24 * 3600 * 1000;
const file = (brandDir) => path.join(brandDir, 'brand', '.tips.json');
const readMemory = (brandDir) => { try { const d = JSON.parse(fs.readFileSync(file(brandDir), 'utf8')); return d && typeof d === 'object' ? d : {}; } catch { return {}; } };
function writeMemory(brandDir, mem) {
  const tmp = `${file(brandDir)}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(mem, null, 2) + '\n');
  fs.renameSync(tmp, file(brandDir));
}

export const suppressed = ({ flags = {}, env = process.env, state = null } = {}) =>
  env.BAGELUNIT_NO_TIPS === '1' || Boolean(flags['no-tips']) || (state !== null && state.tips === false);

// the connector list is slow to ask for, so it is remembered for a day in the tips file
function connectors(mem, now) {
  if (mem.mcp && Array.isArray(mem.mcp.servers) && now - Date.parse(mem.mcp.at) < 24 * 3600 * 1000) return { servers: mem.mcp.servers, fresh: false };
  const servers = mcpServers(5000);
  return { servers, fresh: servers !== null };
}

// the tip text for a step, or null. Records nothing: use printTip to show it and remember it.
export function tipFor(step, { brandDir, now = Date.now() } = {}) {
  if (!brandDir) return null;
  const catalog = loadCatalog(), state = stateOf(readBrandJson(brandDir).data), mem = readMemory(brandDir);
  const mcp = connectors(mem, now);
  const rows = statusAll(catalog, state, mcp.servers);
  const connectedCategories = new Set(rows.filter((r) => r.status === 'connected').map((r) => r.category));
  const shown = mem.shown || {};
  const order = (catalog.tip_order && catalog.tip_order[step]) || [];
  const eligible = rows.filter((r) => (r.tips || []).includes(step) && r.status === 'not connected' && !connectedCategories.has(r.category)
    && !(now - Date.parse(shown[r.id]) < WEEK_MS));
  eligible.sort((a, b) => (order.indexOf(a.category) + 99) % 99 - (order.indexOf(b.category) + 99) % 99);
  if (!eligible.length) return { text: null, ids: [], mcp };
  const first = eligible[0], group = eligible.filter((r) => r.category === first.category);
  const names = group.map((g) => g.name.replace(/ \(with .*\)$/, '')).join(' or ');
  const dismiss = group.length > 1 ? first.category : first.id;
  return {
    ids: group.map((g) => g.id), mcp,
    text: `Tip: ${names} ${first.tip_lines?.[step] || 'could help here'} (kit suggest ${first.id}). Dismiss: kit suggest --dismiss ${dismiss}`,
  };
}

export function printTip(step, { brandDir = findBrandDir(process.cwd()), flags = {}, env = process.env, now = Date.now() } = {}) {
  try {
    if (!brandDir || suppressed({ flags, env })) return false;
    const state = stateOf(readBrandJson(brandDir).data);
    if (suppressed({ state })) return false;
    const tip = tipFor(step, { brandDir, now });
    const mem = readMemory(brandDir);
    if (tip && tip.mcp.fresh) mem.mcp = { at: new Date(now).toISOString(), servers: tip.mcp.servers };
    if (tip && tip.text) {
      process.stderr.write(tip.text + '\n');
      mem.shown = { ...(mem.shown || {}), ...Object.fromEntries(tip.ids.map((id) => [id, new Date(now).toISOString()])) };
    }
    if (tip && (tip.text || tip.mcp.fresh)) writeMemory(brandDir, mem);
    return Boolean(tip && tip.text);
  } catch { return false; }
}

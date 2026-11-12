# Scene styles (synced copy)

These folders are copies made by `sync-to-kit.mjs` in the **bagelunit-styles** repo. Edit a style there, never here:
the next sync replaces every file in this folder, and `node sync-to-kit.mjs --kit <this kit> --check` fails while a copy
differs from the styles repo.

- `_core/` is the scene runtime: `runtime.js` (the `V` API and the `window.__scene` seek contract), `build-scene.mjs`
  (one scene page from runtime + engine + template props + narration + word times), `render-scene.mjs` and `assemble.sh`
  (the styles repo's own renderer and joiner, kept for reference; the kit renders with `tools/scenes.mjs`).
- `<id>/` is one style: `engine.js` + `engine.css` (the drawing engine), `meta.json` (name, palette, fonts),
  `SKILL.md` (art direction), `docs.md` (the drawing API for custom scenes), `templates.json` (scene templates with props
  schemas, example props and example narration).
- `STYLES.json` is the registry the kit reads to offer these styles (`kit start <reel> --style <id>`, `kit scene list`):
  id, name, palette, formats, template ids, the styles repo version and the sync date, and a fingerprint of every file.

How a reel uses them: `modes/MODE-RULES.md`, section "Scene styles".

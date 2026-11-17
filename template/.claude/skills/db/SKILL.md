---
name: db
description: >
  Opens this brand's dashboard in the browser. Redraws it first from the files in this folder, so what you see is current.
  Use on /db, or when the user says "open the dashboard", "show the dashboard", "open my dashboard" or "dash".
user-invokable: true
argument-hint: "[refresh | live]"
metadata:
  author: BagelUnit
  version: "1.0.0"
  category: content
---

# /db: open the dashboard

Run from this brand folder. Reads and shows only: it posts, schedules and approves nothing.

1. **No argument:** run `node .claude/skills/content-calendar/calendar.mjs --open`. It redraws `brand/dashboard.html` from this folder's files (no network, no AI, free) and opens it in the default browser.
2. **`refresh`:** run `node .claude/skills/content-calendar/refresh.mjs`, which also pulls the numbers for each account the brand has connected, then `node .claude/skills/content-calendar/calendar.mjs --open`.
3. **`live`:** run `node .claude/skills/content-calendar/serve.mjs` in the background. It serves the dashboard on this computer and on the same Wi-Fi, reloads by itself when a file changes, and plays the reel previews. Tell the owner the address it prints.

If `brand/brand.json` has no name yet, the brand is not set up: say so in one line and point to `/brand-setup`. If the page does not open (a remote or headless computer), print the full path of `brand/dashboard.html` and say it can be opened from there.

Reply in one or two lines: what was opened and when the dashboard was last redrawn. Everything else about the dashboard is in `/content-calendar` and `docs/dashboard.md`.

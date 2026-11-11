# Content dashboard: design notes

For anyone changing `template/.claude/skills/content-calendar/page.mjs`. The dashboard is version 1 of the kit's content dashboard (kit 1.10.0).

## Who it is for

A brand owner checking in once or twice a day, on a laptop or on a phone after the Telegram summary. In five seconds it must answer: how am I doing, what needs me, what is next. It is a tool, not a marketing page: everything on it is real data from the brand folder or the brand's own Instagram numbers, and nothing is invented to fill space.

## Look

- Light paper world: off-white paper (#EFEFEE) with a faint 48 px grid and a soft glow of the brand's colour at the top. Raised surfaces are a near-white (#FBFBFD), never pure white; ink is #16121F, never pure black.
- One navy band (#14142B) for the agents, the part with the most weight. Its own grid, a glow of the brand colour, lighter surfaces to rise.
- The brand's accent from `brand.json` -> `colors.accent` drives every accent; tints are mixed from it in OKLCH, and a darker mix is used where accent colour sits behind or as small text. Default when empty: #E4572E.
- Poppins (bundled, OFL): 800 in capitals for the brand name, section titles and big numbers; 600 spaced capitals for labels; 400 and 500 for text and data.
- Sharp corners, hairlines, square icon chips next to labels, corner-bracket frames on the agent panels, numbered rows (01, 02) for lists.
- Status is never colour alone: a word, an icon or a dashed outline goes with it.
- Not allowed: coloured side stripes on cards or list items, gradient text, glass blur, identical icon-card grids, modals.

## Motion

- Entrances: elements rise 14 px and fade in over 480 ms on cubic-bezier(.16,1,.3,1), 70 ms apart; numbers count up; chart lines draw; bars grow from the base.
- Always moving, by the owner's choice: the agents' loop (dots travel the dotted path, the agent boxes breathe) and each agent panel's small picture of its job. The status light on each agent is the honest part: green and pulsing only when it made something today.
- Everything else responds within 150 to 250 ms (hover lifts, the "What it made" panel opening).
- With reduced motion asked for, the page shows its final state and the loop stands still. Without scripting, nothing is hidden.

## Interaction

- `client.js` runs the calendar views (month, week, day), the pipeline's find and filter, and the reel card. `page.mjs` puts it and the page's data (`<script id="dash-data">`) inside the page.
- The reel card is a side panel (a native `<dialog>`, full screen on a phone): Escape, the close button or a click outside closes it, the arrow keys step through the same stage, and the address gets `#reel=<id>` so a card can be linked.
- Nothing on the page changes a reel's stage. Stages come from the approvals; the card offers the next command to copy instead.
- Without scripting, the page still shows this month and every card title; only the views and the card need the script.

## Connected and in sync

- `client.js` keeps one state: the filter (find, needs you, stage), the calendar view and date, and the open card. Every section reads it, so a filter applies everywhere at once. Elements that stand for a reel carry `data-open` (opens the card) or `data-id` (a row about it); `is-hl` lights a reel on hover or focus, `is-sel` while its card is open, `is-dim` when the filter leaves it out.
- The state is kept in the tab's session storage, so a redraw (the Wi-Fi view reloading, or a reload by hand) comes back to the same place.
- `sync.mjs` is the brand folder's PostToolUse hook: it compares a stamp of the files the dashboard reads and redraws only when it changed. It must stay fast, silent and unable to fail the step it follows.

## First run and the online copy

- `lib.mjs` builds `setup` (each step with `done` worked out from the folder) and `setupOpen` (a core step is not done). The panel shows only while `setupOpen`; with no numbers yet the number strip is left out so a new page is not a row of dashes.
- `host.mjs` `queuePublish()` marks the page as changed and starts at most one detached waiter (`--later`), which uploads no more often than `publish_every` minutes and once more after the last change. Its output goes to `.cache/publish.log`; failures show under "Needs you".

## Colours, honesty and the rest

- `palette()` in `page.mjs` keeps any brand accent readable: lines and marks at 3:1 on the paper, text at 4.5:1 on the paper and the light tint, and accent text at 4.5:1 in the navy band. The raw colour stays for the glow, the tint and the brand-name dot.
- Agent lights come from `.cache/agent-events.json`: a signature of each agent's real output (plan topics, scripts and gate A, plan dates, pulled numbers) and the time it last changed.
- Tests, mix, series, flow and costs are worked out in `lib.mjs`; the tests' verdict rule (enough views each, 10% apart) is a rule of thumb and the page says so.
- `overview.mjs` reads every registered brand folder with the same `load()` and draws `~/.config/bagelunit-reels/overview.html`; `notice.mjs` is the SessionStart hook.

## Competitors section

- Sits after Trends. Data comes from `competitors-model.mjs` (read only), attached to the model as `M.competitors`; `competitors.mjs` is what reads and saves. Never fake a number: with no view counts the table shows a dash, and an account Meta cannot read says so under "Accounts that need attention".
- The brand's own row sits first in the table, tinted. The 3x rule and the hook-shape guess are labelled as rules of thumb on the page.
- Ideas show a Copy button for the command that accepts them; the page changes nothing itself.

## Build rules

- One self-contained HTML file: fonts as data, no network requests, no libraries. The same file is used locally, on the Wi-Fi server and online.
- Icons are drawn in `page.mjs` (24 px grid, 1.6 stroke). Add new ones there.
- Check every change at 1280, 980 and 390 px wide, with and without reduced motion, before release.

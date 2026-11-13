# BagelUnit Reel Kit: what changed

Newest first. The reel engine has its own, older log in `studio/CHANGELOG.md`. To update a brand workspace to the latest kit, see "Updating" in `template/README.md`.

## 1.0.0 (2026-11-12)

**The first public release.** The kit makes short vertical videos (reels, Shorts, TikToks) for any brand, in any niche: baking, fitness, money, travel, pets, a local shop, software, a craft. Nothing in it is tied to one topic. Earlier development versions were folded into this one release.

**What you get**

- **A reel from an idea.** Script, voice, animated scenes, a self-check and an mp4, in three styles: Print, 3D and Talking head (your own camera take, cut clean). A sticker host (a cartoon of you or your mascot) can act on screen.
- **19 scene styles on top of the three.** Besides Print, 3D and Talking head, a reel can be made in any of 19 more looks, each a set of ready scene templates: Anime, Dusty Archive, Toon World, Mini Chronicle, Skyline Rush, Comic, Doodle World, Clean Shapes, Origin Story, Inked Body, Tiny Cube World, Map, Brush Strokes, Icon Signal, Pixel World, Stick Figure Folk, Paper Theatre, Bedtime Story and Marker Board. `kit scene list` shows them, `kit start reels/<slug> --style <id>` starts a reel in one. Scenes open on real content instead of a blank flash. A 10-second sample of every look is in `docs/samples/`.
- **A brand folder per brand.** `/brand-setup` makes it and asks the brand questions: name, handle, colours, logo, fonts, presenter, voice, call to action, how often to post, and the niche (topic, audience, search phrases, steady hashtags).
- **Captions and hashtags tailored to the niche.** The caption, up to 5 hashtags from what has worked for the brand, and a keyword line, checked before approval.
- **Three approvals you control.** Script, visual plan and final video, each a clickable question. A fact check runs before the script and before the final, and a reel must score 90 or more in review before it can be approved.
- **A logo library.** Add other companies' marks with their rights recorded, and a reel can only show the ones you approved.
- **A content calendar and dashboard.** Every reel from idea to posted, what needs you, open posting slots, followers and trends, competitors and post ideas from what is working for them.
- **Posting through your own publisher.** Instagram, a Facebook Page, Threads, YouTube Shorts and TikTok, dry run first, only after your yes for each reel and its time.
- **Comment replies and DMs.** Answer comments and send DMs one at a time after your yes, or set up a keyword auto-reply that you test first, with a follow check. Automatic replies need Meta's approval of your app, which takes days to weeks and cannot be sped up; until then you send each DM by hand, and the guides say exactly what Meta asks for.
- **Instagram skills.** Thirteen ready-made skills for reels, captions, carousels, stories, comments, replies, DMs, profile scoring, weekly plans, audits, repurposing and a humanizer (`/ig-reel`, `/ig-caption` and so on).
- **Reaction scoring.** `engagement.py` scores each posted reel by how people reacted (likes, comments, saves, shares, follows per person reached) against the brand's own usual, with weights you can change.
- **Comment-to-DM, as Meta really works.** Optional button cards for the follow gate (Follow me, I'm following, Open the link), with a fallback to a chip and then plain text. The guides now say what Meta's review actually asks for: the Tech Provider step, one submission for every permission, test calls, the sections, the screen-recording upload problem, and the setting that lets Instagram share messages.
- **Research and learning.** Audit an account, mine comments for questions, mine hooks, study a reel, and a loop that reads what posted reels did and changes one thing in the next.
- **Web setup done for you.** Claude does each setup step on a website in your browser; you log in, paste secrets into the file it opens and click the last Delete.
- **One-step updates.** `/kit-update` shows what changed, updates the workspace and then the engine.

**Added since the first release (still 1.0.0)**

- **Watch a reel from the calendar.** Click a reel on its day and its card plays the approved final, with its cover, so you can see exactly what goes out then. Every reel past the last approval (approved, scheduled or posted) has it, and calendar entries with a video carry a play mark. It plays on this computer and on the live Wi-Fi view; the online copy leaves the videos out unless you turn on `dashboard.previews_online`, which uploads small copies of the reels that are not posted yet.
- **A watch section you name yourself.** A dashboard section for the news pages, release notes, changelogs or industry bodies you follow, and what is new on them. It is called "News watch" until you rename it (`/content-calendar watch rename`). `/content-calendar watch add` picks the pages (their own official ones, you confirm each), `/content-calendar watch` reads them. Each item is a lead, not a fact, until you add it to `brand/facts.md`. The daily refresh only redraws it.
- **Builds of the same version.** Small changes no longer need a new version number. Each change carries a build stamp, and a brand folder notices a newer build of the version it is on: Claude says "a newer build of 1.0.0 is out" at the start of a session, and `/kit-update` downloads that build fresh and installs it. The engine is reinstalled only when the engine itself changed.
- **Changing the voice's speed is free.** A new tempo or pause length for a reel re-cuts the take you already have instead of paying ElevenLabs for the same words again. Reels voiced before this keep their take too.
- To get all of this in an existing brand folder: `/kit-update`. A folder updated before builds existed has no stamp yet, so it is told about the newest build once and is current after that update.

**Safe by default.** Nothing posts, sends or scrapes without your permission, only facts you have cleared appear in a video, and keys, renders, audio and photos of people stay out of the repo.

**To start:** run `bash setup/install.sh` (Windows: `node setup/install.mjs`), then type `/brand-setup`.

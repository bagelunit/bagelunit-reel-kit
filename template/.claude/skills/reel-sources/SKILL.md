---
name: reel-sources
description: >
  Find and fetch reference material for a reel: what people in the niche actually ask (Reddit and similar),
  trending reels to model, and a downloaded reel with frames and a transcript ready for /reel-analyzer.
  Use ONLY when the user asks for it or when /account-audit, /reel-analyzer or /content-factory needs a
  reel fetched. For ordinary web research use the project's own web tool first. Fetching a reel from a URL
  only runs when brand/brand.json autopilot.scrape is true; a file the person supplies needs no permission.
user-invokable: true
argument-hint: "[reel URL, a local video file, or a topic to research]"
metadata:
  author: BagelUnit
  version: "1.0.0"
  category: research
---

# Reel sources

Three jobs, smallest first.

## 1. Demand: what people actually ask
Read the niche's real questions (Reddit threads, YouTube comments, forum posts) with the project's web tool, at human
speed. Report the recurring questions with counts and the exact phrases people use. Each topic idea must trace to a
real post. Do not log in anywhere.

Reddit pages are blocked to the crawler (robots.txt, login). Use the owner's own browser or pasted threads for post bodies. The search source kind can be a paid call (state the cost first, and only with the owner's OK); if threads cannot be read, say so and report titles only, never invent comment counts or phrases.

## 2. Trending reels to model
Search for reels in the niche (web search, or the owner's own browser). List 5 with the hook, length and why it is
getting traction.

**Hashtag search (Meta's official API).** With the brand's Instagram connected through Unified or Facebook Login and
Meta's "Instagram Public Content Access" feature approved for the app (`docs/connect.md`),
`node .claude/skills/content-calendar/research.mjs hashtag <tag>` (add `--recent` for the newest instead of the top
posts) writes `brand/research/hashtag-<tag>.csv` with each post's link, date, likes, comments and caption. Meta allows
30 different hashtags per account in 7 days, so pick them with the owner first; the script says plainly when the
feature is not approved. Models only: shape, never the video. Web search can cost money, so say so before using a paid one. A SearXNG search is not running by default.

## 3. Fetch one reel for a teardown
`python3 ./.claude/skills/reel-sources/reel_fetch.py <URL or file> --out <folder>`
- From a URL it needs `autopilot.scrape: true` in `brand/brand.json`. A local file does not.
- It writes `video.mp4`, `frames/` (one a second), `audio.wav`, `transcript.txt` (with timestamps) and `timeline.md`: for every second, the frame and the words spoken then. That is how Claude sees what is shown, hears what is said, and knows exactly when. `/reel-analyzer` reads `timeline.md` and opens the frame images it points to.
- Tools used: `yt-dlp`, `ffmpeg`, and Whisper (`whisper-cli` with its model file, or `faster-whisper`). The kit's installer sets them up; a missing one is reported plainly.
- Respect the platform: public reels only, one at a time, no bulk downloading, no re-uploading anyone's video.

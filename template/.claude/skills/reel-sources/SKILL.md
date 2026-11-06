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
  author: Susanoo
  version: "1.0.0"
  category: research
---

# Reel sources

Three jobs, smallest first.

## 1. Demand: what people actually ask
Read the niche's real questions (Reddit threads, YouTube comments, forum posts) with the project's web tool, at human
speed. Report the recurring questions with counts and the exact phrases people use. Each topic idea must trace to a
real post. Do not log in anywhere.

## 2. Trending reels to model
Search for reels in the niche (web search, or the owner's own browser). List 5 with the hook, length and why it is
getting traction. Models only: shape, never the video.

## 3. Fetch one reel for a teardown
`python3 ./.claude/skills/reel-sources/reel_fetch.py <URL or file> --out <folder>`
- From a URL it needs `autopilot.scrape: true` in `brand/brand.json`. A local file does not.
- It writes `video.mp4`, `frames/` (one a second), `audio.wav` and `transcript.txt`, then `/reel-analyzer` reads them.
- Tools used: `yt-dlp`, `ffmpeg`, `whisper-cli` (all installed by the kit's setup; a missing one is reported plainly).
- Respect the platform: public reels only, one at a time, no bulk downloading, no re-uploading anyone's video.

# After you post: your numbers

A day or more after a reel goes out, its numbers tell you what to make next. This page shows where to find them, where to put them, and what the kit does with them.

## 1. Find the numbers (2 minutes per reel)

In the Instagram app, open the reel, tap **View insights**. Note these, as shown there:

| Column in `brand/insights.csv` | What Instagram calls it |
|---|---|
| `reel` | (you type the reel's folder name from `reels/`, for example `claude-vs-codex`) |
| `date` | the day it was posted, as `2026-11-10` |
| `views` | Views |
| `reach` | Accounts reached |
| `avg_watch_time_s` | Average watch time (in seconds, `9.4` or `0:09` both work) |
| `skip_rate` | Skip rate (`41%` or `0.41` both work) |
| `likes`, `comments`, `saves`, `shares`, `follows` | the same names |

Instagram renames things now and then; if a number is missing, leave the cell empty. Meta Business Suite (Insights, then Content, then Export) can also give you a spreadsheet for many posts at once; copy the matching columns over.

Easiest of all: type `/analytics-readout` and paste or type the numbers. Claude adds the row for you and reads it back.

## 2. One file for everything

`brand/insights.csv` has one row per posted reel. Keep adding rows; never delete old ones. Three tools read it:

- `/analytics-readout`: what to make more of and what to stop, against this brand's own median. It says when there are too few reels to conclude anything.
- `/account-audit`: which reels beat the brand's own median by 3 times (worth studying), from this same file.
- `kit calibrate`: once **8 or more** posted reels are in the file (and their videos are still in `reels/`), it learns how this brand's reels hold viewers. After that, `/reel-predict` gives each new draft a watch-time and skip-rate estimate with a likely range, before you post it. Under 8 reels it gives measurements only, never a guess.

## 3. The prompt

```
Add my numbers for [REEL FOLDER NAME]: views [N], reach [N], average watch time [SECONDS], skip rate [PERCENT], likes [N], comments [N], saves [N], shares [N], follows [N]. Then run /analytics-readout. If brand/insights.csv now has 8 or more reels, run kit calibrate on it and tell me how accurate it is.
```

Claude also adds the reel's row to `brand/log.md` if it is not there yet, so the next reel picks a different angle.

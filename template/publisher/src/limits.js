// Text limits for each platform, shared by the Worker (when a post is scheduled) and scripts/schedule.mjs (before
// anything is uploaded), so both refuse the same things.
//
// Sources, read 2026-11-09:
//   Instagram caption: 2,200 characters, 20 @ tags (IG User Media reference, "caption"). Hashtags: 5. Meta's API page still
//   says 30, but Instagram announced in December 2025 that a caption is being limited to 5 (rolling out in steps), so the
//   kit holds to 5 and never sends a sixth; hashtags go in the caption only (read 2026-11-12, press reports of Instagram's announcement).
//   Instagram collaborators: up to 3 usernames, not on stories (IG User Media reference, "collaborators").
//   Threads text: 500 characters, emojis counted as their UTF-8 bytes (Threads Posts guide, "Limitations").
//   Facebook Reel description: Meta's Reels Publishing guide names no limit, so the kit uses its own cap of 2,200.
// Video lengths and cover size, read 2026-11-10:
//   Instagram reel: 3 seconds to 15 minutes; Instagram story video: 3 to 60 seconds; cover JPEG 8 MB at most
//     (IG User Media reference, "Reel Specifications" and "Story Video Specifications").
//   Facebook Reel: 3 to 90 seconds (Reels Publishing API guide, "Video Specifications"; error 1363128 otherwise).
//     Its custom cover (video thumbnails) takes up to 10 MB, so the Instagram cover rule covers it.
//   Threads video: up to 300 seconds (Threads API overview, "Video Specifications").
// YouTube and TikTok, read 2026-11-11:
//   YouTube Short: a vertical or square video up to 3 minutes (YouTube Help, "Get started creating YouTube Shorts").
//     Title 100 characters and description 5,000 bytes, neither with < or > (Data API videos.insert; the title and
//     description limits are the API's, from memory of its error messages: the API itself has the last word).
//   TikTok caption: 2,200 UTF-16 units (Content Posting API, Direct Post reference, post_info.title). A video sent
//     through the API can be up to 10 minutes (Media Transfer Guide); the creator's own limit (3, 5 or 10 minutes) is
//     read from TikTok when the post goes out (tiktok.js).

export const LIMITS = {
  instagram: { chars: 2200, hashtags: 5, mentions: 20, collaborators: 3, carouselMax: 20, carouselMin: 2, coverBytes: 8 * 1024 * 1024 },
  facebook: { chars: 2200 },
  threads: { chars: 500 },
  youtube: { title: 100, descriptionBytes: 5000 },
  tiktok: { chars: 2200 },
};

// Seconds allowed for a video on each target. instagram_story is a reel shared to the story (--story) or a story post.
export const LENGTHS = {
  instagram: { min: 3, max: 900, label: 'an Instagram reel', range: '3 seconds to 15 minutes' },
  instagram_story: { min: 3, max: 60, label: 'an Instagram story', range: '3 to 60 seconds' },
  facebook: { min: 3, max: 90, label: 'a Facebook Reel', range: '3 to 90 seconds' },
  threads: { min: 0, max: 300, label: 'a Threads video', range: 'up to 5 minutes' },
  youtube: { min: 1, max: 180, label: 'a YouTube Short', range: 'up to 3 minutes' },
  tiktok: { min: 3, max: 600, label: 'a TikTok', range: '3 seconds to 10 minutes' },
};

// The video targets of a post: which length rules its video has to meet.
export function videoTargets({ kind = 'reel', platforms = ['instagram'], story = false, threadsMode = 'video' } = {}) {
  if (kind === 'story') return ['instagram_story'];
  if (kind !== 'reel') return [];
  const out = [];
  for (const p of platforms) if (p !== 'threads' || threadsMode !== 'text') out.push(p);
  if (story) out.push('instagram_story');
  return out;
}

// Plain-words problems with a video's length (seconds, or null when it could not be read).
export function checkLength(seconds, targets, file = 'the video') {
  if (!targets.length) return [];
  if (seconds == null) return [`could not read how long ${file} is (it needs to be an MP4 or MOV with its length recorded)`];
  const s = Math.round(seconds * 100) / 100;           // two decimals, so 90.03 never shows as "90"
  const out = [];
  for (const t of targets) {
    const L = LENGTHS[t];
    if (!L) continue;
    if (seconds > L.max || seconds < L.min) out.push(`${file} is ${s} seconds; ${L.label} must be ${L.range}`);
  }
  return out;
}

// Threads counts an emoji as its UTF-8 bytes. Letters, digits, marks, punctuation and spaces count as one each,
// anything else (emoji, symbols) as its byte length: never under Meta's count.
export function threadsLength(text) {
  let n = 0;
  for (const ch of String(text || '')) {
    if (/[\p{L}\p{M}\p{N}\p{P}\p{Zs}\n\r\t]/u.test(ch)) n += 1;
    else n += new TextEncoder().encode(ch).length;
  }
  return n;
}

// A YouTube text file is the title on its first line and the description after it. A description with no #Shorts gets
// it added, so the video is shelved as a Short whatever the aspect ratio check says.
export function youtubeParts(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const i = lines.findIndex((l) => l.trim());
  const title = i < 0 ? '' : lines[i].trim();
  let description = i < 0 ? '' : lines.slice(i + 1).join('\n').trim() || title;
  if (!/#shorts\b/i.test(`${title}\n${description}`)) description = `${description}\n\n#Shorts`.trim();
  return { title, description };
}

const count = (re, text) => (String(text || '').match(re) || []).length;

// Returns a list of plain-words problems; empty means the text fits.
export function checkText(platform, text, { story = false } = {}) {
  const t = String(text || '');
  const out = [];
  if (platform === 'instagram') {
    if (story) return out;                              // stories take no caption
    if (!t.trim()) out.push('the Instagram caption is empty');
    if ([...t].length > LIMITS.instagram.chars) out.push(`the Instagram caption is ${[...t].length} characters; Instagram allows ${LIMITS.instagram.chars.toLocaleString('en-US')}`);
    const tags = count(/(^|\s)#[\p{L}\p{N}_]+/gu, t);
    if (tags > LIMITS.instagram.hashtags) out.push(`the Instagram caption has ${tags} hashtags; Instagram allows ${LIMITS.instagram.hashtags} in a caption (pick the 3 to 5 that fit best)`);
    const ats = count(/(^|\s)@[A-Za-z0-9._]+/g, t);
    if (ats > LIMITS.instagram.mentions) out.push(`the Instagram caption has ${ats} @ tags; Instagram allows ${LIMITS.instagram.mentions}`);
  } else if (platform === 'facebook') {
    if (!t.trim()) out.push('the Facebook description is empty');
    if ([...t].length > LIMITS.facebook.chars) out.push(`the Facebook description is ${[...t].length} characters; the kit allows ${LIMITS.facebook.chars.toLocaleString('en-US')}`);
  } else if (platform === 'youtube') {
    const { title, description } = youtubeParts(t);
    if (!title) out.push('the YouTube title is empty (the first line of out/platforms/youtube.txt is the title)');
    if ([...title].length > LIMITS.youtube.title) out.push(`the YouTube title is ${[...title].length} characters; YouTube allows ${LIMITS.youtube.title} (write out/platforms/youtube.txt: the title on the first line, then the description)`);
    if (/[<>]/.test(`${title}${description}`)) out.push('the YouTube title and description cannot contain < or >');
    const bytes = new TextEncoder().encode(description).length;
    if (bytes > LIMITS.youtube.descriptionBytes) out.push(`the YouTube description is ${bytes} bytes; YouTube allows ${LIMITS.youtube.descriptionBytes.toLocaleString('en-US')}`);
  } else if (platform === 'tiktok') {
    if (!t.trim()) out.push('the TikTok caption is empty');
    if (t.length > LIMITS.tiktok.chars) out.push(`the TikTok caption is ${t.length} characters; TikTok allows ${LIMITS.tiktok.chars.toLocaleString('en-US')}`);
  } else if (platform === 'threads') {
    if (!t.trim()) out.push('the Threads text is empty');
    const n = threadsLength(t);
    if (n > LIMITS.threads.chars) out.push(`the Threads text counts as ${n} characters (emojis count as several); Threads allows ${LIMITS.threads.chars}`);
  }
  return out;
}

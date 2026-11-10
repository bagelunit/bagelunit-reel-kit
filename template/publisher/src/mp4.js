// The length of an MP4 or MOV file, read from its movie header (moov > mvhd), without any package.
//
// Shared by scripts/schedule.mjs (reading the file on the owner's computer) and the Worker (reading the uploaded copy
// in R2 with small range reads), so both refuse the same videos. `readAt(offset, length)` returns the bytes at that
// place (a Uint8Array, shorter at the end of the file) and `size` is the file size in bytes. fileSeconds takes
// node:fs as an argument, so the Worker bundle never imports a Node module.
//
// MP4 layout: a file is a list of boxes, each "4-byte size, 4-byte type, content". A size of 1 means a 64-bit size
// follows the type; 0 means "to the end of the file". The movie header box mvhd sits inside moov and holds the
// timescale (units per second) and the duration in those units (32-bit in version 0, 64-bit in version 1).
// Meta asks for moov at the front of the file (the kit renders with +faststart), but this reads it anywhere.

const MAX_BOXES = 64;   // a normal file has a handful of top-level boxes; this stops a broken file from looping

const u32 = (b, i) => ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3];
const u64 = (b, i) => u32(b, i) * 2 ** 32 + u32(b, i + 4);
const type = (b, i) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);

// The parser asks for bytes with `yield [offset, length]` and gets them back, so the same code reads a file on disk
// (synchronously) and a file in R2 (with awaited range reads).
function* findBox(start, end, want) {
  let at = start;
  for (let n = 0; n < MAX_BOXES && at + 8 <= end; n++) {
    const h = yield [at, 16];
    if (h.length < 8) return null;
    let size = u32(h, 0); let head = 8;
    if (size === 1) { if (h.length < 16) return null; size = u64(h, 8); head = 16; }
    else if (size === 0) size = end - at;
    if (size < head) return null;                         // a broken box
    if (type(h, 4) === want) return { start: at, end: Math.min(at + size, end), body: at + head };
    at += size;
  }
  return null;
}

function* seconds(size) {
  const moov = yield* findBox(0, size, 'moov');
  if (!moov) return null;
  const mvhd = yield* findBox(moov.body, moov.end, 'mvhd');
  if (!mvhd) return null;
  const b = yield [mvhd.body, 32];
  if (b.length < 20) return null;
  const v1 = b[0] === 1;
  const scale = v1 ? u32(b, 20) : u32(b, 12);
  const units = v1 ? (b.length >= 32 ? u64(b, 24) : null) : u32(b, 16);
  const allOnes = v1 ? (b.length >= 32 && u32(b, 24) === 0xffffffff && u32(b, 28) === 0xffffffff) : units === 0xffffffff;
  if (!scale || units == null || units === 0 || allOnes) return null;   // 0 or all-ones (32 or 64 bits): length not recorded
  return units / scale;
}

// Seconds (a number), or null when the file has no readable movie header (not an MP4, or a broken one).
export function mp4SecondsSync(readAt, size) {
  try {
    const g = seconds(size);
    for (let r = g.next(); ; r = g.next(readAt(...r.value))) if (r.done) return r.value;
  } catch { return null; }
}
export async function mp4Seconds(readAt, size) {
  try {
    const g = seconds(size);
    for (let r = g.next(); ; r = g.next(await readAt(...r.value))) if (r.done) return r.value;
  } catch { return null; }
}

// Node: the length of a file on disk (synchronous, like the rest of the scheduling checks).
export function fileSeconds(file, fs) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    return mp4SecondsSync((offset, length) => {
      const buf = Buffer.alloc(Math.max(0, Math.min(length, size - offset)));
      if (buf.length) fs.readSync(fd, buf, 0, buf.length, offset);
      return buf;
    }, size);
  } finally { fs.closeSync(fd); }
}

// Worker: the length of a file in R2, read with range requests (a few small reads, never the whole video).
export async function r2Seconds(bucket, key) {
  const head = await bucket.head(key);
  if (!head) return null;
  const readAt = async (offset, length) => {
    const len = Math.max(0, Math.min(length, head.size - offset));
    if (!len) return new Uint8Array(0);
    const obj = await bucket.get(key, { range: { offset, length: len } });
    return new Uint8Array(await new Response(obj.body).arrayBuffer());
  };
  return mp4Seconds(readAt, head.size);
}

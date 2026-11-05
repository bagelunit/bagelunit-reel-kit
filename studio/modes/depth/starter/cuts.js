// The cut list: which shot plays when. Every cut starts on a spoken word, never on typed seconds.
// Each id is a file in shots/. A new set every 2–4 s keeps the reel moving; title = the taped title for that shot.
//   from: 'word' | 'a phrase' | word index | { s: seconds }   title: 'TEXT'   turn: 'cut' (default) | 'soft'
export default ({ lines, at }) => [
  { id: '01-shop', from: 0, title: 'SOLD OUT BY 9 AM' },
  { id: '02-desk', from: 'Every order', title: 'ORDERS COME IN OVERNIGHT' },
  { id: '03-machine', from: 'A little', title: 'IT WRITES THE BAKE LIST' },
  { id: '04-wall', from: 'By sunrise', title: 'NUMBERS BY SUNRISE' },
  // the ask starts on the word "Comment" (any sentence it sits in), else on the last sentence
  { id: '05-ask', from: at('Comment') != null ? 'Comment' : lines.length > 1 ? { s: lines.at(-1).t0 } : 'Comment', title: 'COMMENT “BAKE”' },
];

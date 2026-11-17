// The first comment on an Instagram reel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { step } from '../src/instagram.js';

function ctx(options, over = {}) {
  const calls = []; const logs = [];
  const post = { kind: 'reel', options, text: { instagram: 'cap' }, media: [{ role: 'video', token: 'a', type: 'video' }] };
  const t = { status: 'processing', container_id: 'C1', started: new Date().toISOString(), ...over.t };
  const api = {
    get: async (p) => (p.startsWith('C1') ? { status_code: 'FINISHED' } : p.includes('content_publishing_limit') ? { data: [] } : { permalink: 'https://instagram.com/reel/x' }),
    post: async (p, b) => { calls.push([p, b]); if (over.failComment && p.endsWith('/comments')) throw new Error('boom'); return p.endsWith('/comments') ? { id: 'K1' } : { id: 'M1' }; },
  };
  return { c: { api, post, t, env: { IG_USER_ID: 'IG' }, name: 'instagram', now: Date.now(), stamp: new Date().toISOString(), url: () => 'u', log: (e, x) => logs.push([e, x]), fail: () => {}, wait: () => {} }, calls, logs, t };
}

test('a reel with a first comment publishes, then posts the comment on its media id', async () => {
  const { c, calls, t } = ctx({ first_comment: 'the prompt' });
  await step(c);
  assert.equal(t.status, 'published'); assert.equal(t.comment_pending, true);
  await step(c);
  assert.deepEqual(calls.at(-1), ['M1/comments', { message: 'the prompt' }]);
  assert.equal(t.comment_id, 'K1'); assert.equal(t.comment_pending, undefined);
});

test('no first comment: nothing is pending', async () => {
  const { c, t } = ctx({});
  await step(c);
  assert.equal(t.comment_pending, undefined);
});

test('a failing comment is retried then given up, and never fails the post', async () => {
  const { c, t, logs } = ctx({ first_comment: 'x' }, { failComment: true });
  await step(c);
  for (let i = 0; i < 6; i++) await step(c);
  assert.equal(t.status, 'published'); assert.equal(t.comment_pending, undefined);
  assert.ok(logs.some(([e]) => /given up/.test(e)));
});

test('the story target never gets a comment', async () => {
  const { c, t } = ctx({ first_comment: 'x' });
  c.name = 'instagram_story';
  await step(c);
  assert.equal(t.comment_pending, undefined);
});

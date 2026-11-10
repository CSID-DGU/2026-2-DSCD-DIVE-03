import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sharePendingRequest } from './pendingRequests.js';

test('identical pending requests share one execution and result', async () => {
  let calls = 0;
  let finish;
  const send = () => {
    calls += 1;
    return new Promise((resolve) => { finish = resolve; });
  };
  const first = sharePendingRequest('same', send);
  const second = sharePendingRequest('same', send);
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(first, second);
  finish({ score: 42 });
  assert.deepEqual(await Promise.all([first, second]), [{ score: 42 }, { score: 42 }]);
});

test('completed requests are not cached', async () => {
  let calls = 0;
  const send = () => ++calls;
  assert.equal(await sharePendingRequest('complete', send), 1);
  assert.equal(await sharePendingRequest('complete', send), 2);
});

test('failure clears the pending entry and permits retry', async () => {
  let calls = 0;
  const send = () => {
    calls += 1;
    if (calls === 1) throw new Error('temporary');
    return 'ok';
  };
  const results = await Promise.allSettled([
    sharePendingRequest('retry', send), sharePendingRequest('retry', send),
  ]);
  assert.deepEqual(results.map((r) => r.status), ['rejected', 'rejected']);
  assert.equal(calls, 1);
  assert.equal(await sharePendingRequest('retry', send), 'ok');
});

test('different inputs remain independent', async () => {
  const a = sharePendingRequest('A', () => 'A');
  const b = sharePendingRequest('B', () => 'B');
  assert.deepEqual(await Promise.all([a, b]), ['A', 'B']);
});

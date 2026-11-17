import test from 'node:test';
import assert from 'node:assert/strict';
import { sharePendingRequest } from './pendingRequests.js';

test('동일한 진행 중 요청은 한 번만 실행한다', async () => {
  let calls = 0;
  let finish;
  const send = () => {
    calls += 1;
    return new Promise((resolve) => { finish = resolve; });
  };
  const first = sharePendingRequest('tradeoff-same', send);
  const second = sharePendingRequest('tradeoff-same', send);
  assert.strictEqual(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);
  finish({ spaces: [{}, {}] });
  assert.deepEqual(await first, { spaces: [{}, {}] });
});

test('응답 완료 후 재요청은 새로 실행된다', async () => {
  let calls = 0;
  const send = () => { calls += 1; return Promise.resolve(calls); };
  assert.equal(await sharePendingRequest('tradeoff-repeat', send), 1);
  assert.equal(await sharePendingRequest('tradeoff-repeat', send), 2);
});

test('실패 후 재시도는 새로운 요청을 만든다', async () => {
  let calls = 0;
  const send = () => {
    calls += 1;
    return calls === 1 ? Promise.reject(new Error('network')) : Promise.resolve('ok');
  };
  await assert.rejects(sharePendingRequest('tradeoff-retry', send), /network/);
  assert.equal(await sharePendingRequest('tradeoff-retry', send), 'ok');
  assert.equal(calls, 2);
});

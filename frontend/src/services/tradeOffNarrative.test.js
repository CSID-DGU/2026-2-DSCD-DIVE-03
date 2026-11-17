import test from 'node:test';
import assert from 'node:assert/strict';
import { splitTradeOffNarrative } from './tradeOffNarrative.js';

test('중간에 추천 제목이 다시 나와도 적합도 추천은 카드 한 개로 표시된다', () => {
  const text = [
    '공간 A와 공간 B를 비교합니다.',
    '적합도 우선이라면, 공간 B는 88.5376점으로 공간 A보다 0.3666점 높아 적합도 우선이라면 공간 B를 추천합니다.',
    '비용 우선이라면, 공간 A는 300,000원으로 B보다 1,700,000원 저렴합니다.',
    '종합적으로는, 적합도는 B, 비용은 A를 고려할 수 있습니다.',
  ].join('\n\n');
  const items = splitTradeOffNarrative(text);
  assert.equal(items.length, 4);
  assert.ok(items[1].includes('높아 적합도 우선이라면 공간 B를 추천합니다.'));
  assert.ok(items[2].startsWith('비용 우선이라면'));
  assert.ok(items[3].startsWith('종합적으로는'));
});

test('추천 제목이 첫 문단 중간에 언급되어도 잘못 분리하지 않는다', () => {
  const text = '적합도 우선이라면이라는 표현은 추천 기준입니다.\n\n적합도 우선이라면, 공간 A를 추천합니다.';
  const items = splitTradeOffNarrative(text);
  assert.equal(items.length, 2);
  assert.ok(items[0].includes('추천 기준입니다.'));
});

test('일반 정량 설명과 빈 입력은 안전하게 표시된다', () => {
  assert.deepEqual(splitTradeOffNarrative('두 공간은 차이가 작습니다.'), ['두 공간은 차이가 작습니다.']);
  assert.deepEqual(splitTradeOffNarrative(''), ['분석 요약 정보가 없습니다.']);
});

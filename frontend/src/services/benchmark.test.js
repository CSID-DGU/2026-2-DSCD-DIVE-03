import test from 'node:test';
import assert from 'node:assert/strict';
import { getBenchmarkRegions, getBenchmarkDistricts } from './benchmark.js';

test('권역 API 요청은 기본 경로와 query를 사용한다', async () => {
  const previousFetch = globalThis.fetch;
  let requested;
  globalThis.fetch = async (url) => {
    requested = new URL(url);
    return { ok: true, json: async () => ({ scope: 'regions' }) };
  };
  try {
    const response = await getBenchmarkRegions({ asOf: '2026-11-22' });
    assert.equal(requested.pathname, '/api/benchmark/regions');
    assert.equal(requested.searchParams.get('as_of'), '2026-11-22');
    assert.equal(response.scope, 'regions');
  } finally { globalThis.fetch = previousFetch; }
});

test('행정동 API 권역명을 한글로 올바르게 전달한다', async () => {
  const previousFetch = globalThis.fetch;
  let requested;
  globalThis.fetch = async (url) => {
    requested = new URL(url);
    return { ok: true, json: async () => ({ scope: 'districts' }) };
  };
  try {
    await getBenchmarkDistricts('성수');
    assert.equal(requested.pathname, '/api/benchmark/districts');
    assert.equal(requested.searchParams.get('region'), '성수');
  } finally { globalThis.fetch = previousFetch; }
});

test('API 오류의 detail을 사용자에게 전달한다', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 422, json: async () => ({ detail: '잘못된 지역' }) });
  try {
    await assert.rejects(getBenchmarkDistricts('성'), /잘못된 지역/);
  } finally { globalThis.fetch = previousFetch; }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { recommendationError } from './apiError.js';
test('shows structured brand failure reason and action', async () => {
 const error = await recommendationError({status:503,json:async()=>({detail:{message:'공식몰과 대체몰 모두 보안 확인으로 수집 실패',action:'잠시 후 다시 시도하세요.'}})});
 assert.match(error.message,/대체몰/);
 assert.match(error.message,/다시 시도/);
});
test('preserves string detail and handles non-json errors', async () => {
 assert.equal((await recommendationError({status:400,json:async()=>({detail:'조건을 확인하세요'})})).message,'조건을 확인하세요');
 assert.equal((await recommendationError({status:502,json:async()=>{throw Error('html')}})).message,'추천 API 오류 (502)');
});

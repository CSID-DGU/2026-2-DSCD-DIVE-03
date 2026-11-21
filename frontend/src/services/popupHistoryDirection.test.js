import test from 'node:test';
import assert from 'node:assert/strict';
import { POPUP_HISTORY_MODES, historyDirectionLabel } from './popupHistoryDirection.js';

test('only two mutually exclusive popup-history preference choices exist', () => {
  assert.deepEqual(POPUP_HISTORY_MODES.map((mode) => mode.value), ['frequent', 'rare']);
  assert.equal(new Set(POPUP_HISTORY_MODES.map((mode) => mode.value)).size, 2);
});

test('chosen mode is clearly labeled in results', () => {
  assert.match(historyDirectionLabel('rare'), /적게/);
  assert.match(historyDirectionLabel('frequent'), /많이/);
  assert.match(historyDirectionLabel(undefined), /많이/);
});

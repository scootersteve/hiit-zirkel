import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, formatRemaining, formatElapsed } from '../js/core/format.js';

test('Dauer: Abnahmetest 1210 s = 20:10', () => {
  assert.equal(formatDuration(1210), '20:10');
  assert.equal(formatDuration(230), '3:50');
  assert.equal(formatDuration(0), '0:00');
  assert.equal(formatDuration(3725), '1:02:05');
});

test('Restzeit rundet auf, verstrichene Zeit rundet ab', () => {
  assert.equal(formatRemaining(40_000), '0:40');
  assert.equal(formatRemaining(39_001), '0:40');
  assert.equal(formatRemaining(39_000), '0:39');
  assert.equal(formatRemaining(1), '0:01');
  assert.equal(formatRemaining(0), '0:00');
  assert.equal(formatElapsed(59_999), '0:59');
  assert.equal(formatElapsed(60_000), '1:00');
});

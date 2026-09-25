import { test } from 'node:test';
import assert from 'node:assert/strict';
import { psnr, normalizedCorrelation, bitErrorRate, channelHistogram } from '../src/metrics.js';

function makeImage(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    data[i] = fn(0); data[i + 1] = fn(1); data[i + 2] = fn(2); data[i + 3] = 255;
  }
  return { data, width: w, height: h };
}

test('psnr: citra identik -> Infinity', () => {
  const a = makeImage(4, 4, () => 100);
  const b = makeImage(4, 4, () => 100);
  assert.equal(psnr(a, b), Infinity);
});

test('psnr: selisih 1 tiap kanal -> ~48.13 dB (dihitung tangan)', () => {
  const a = makeImage(2, 2, () => 100);
  const b = makeImage(2, 2, () => 101);
  assert.ok(Math.abs(psnr(a, b) - 48.13) < 0.01);
});

test('psnr: selisih 2 tiap kanal -> ~42.11 dB (dihitung tangan)', () => {
  const a = makeImage(2, 2, () => 100);
  const b = makeImage(2, 2, () => 102);
  assert.ok(Math.abs(psnr(a, b) - 42.11) < 0.01);
});

test('psnr: ukuran beda -> error', () => {
  const a = makeImage(2, 2, () => 1);
  const b = makeImage(3, 2, () => 1);
  assert.throws(() => psnr(a, b), RangeError);
});

test('bitErrorRate & normalizedCorrelation: bit identik', () => {
  const bits = [1, 0, 1, 1, 0, 0, 1, 0];
  assert.equal(bitErrorRate(bits, bits), 0);
  assert.equal(normalizedCorrelation(bits, bits), 1);
});

test('bitErrorRate: 2 dari 8 bit salah -> 25%', () => {
  const a = [1, 0, 1, 1, 0, 0, 1, 0];
  const b = [0, 0, 1, 1, 0, 0, 1, 1];
  assert.equal(bitErrorRate(a, b), 25);
});

test('channelHistogram: total per kanal sesuai jumlah pixel', () => {
  const img = makeImage(5, 5, (c) => (c === 0 ? 10 : 200));
  const h = channelHistogram(img);
  assert.equal(h.r[10], 25);
  assert.equal(h.g[200], 25);
});
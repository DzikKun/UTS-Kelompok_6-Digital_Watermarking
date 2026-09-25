import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attackBrightness, attackGaussianNoise, attackJPEG, attackResize, attackCrop } from '../src/attacks.js';
import { psnr } from '../src/metrics.js';

function makeImage(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    data[i] = fn(0); data[i + 1] = fn(1); data[i + 2] = fn(2); data[i + 3] = 255;
  }
  return { data, width: w, height: h };
}

test('attackBrightness: clamp ke 255', () => {
  const img = makeImage(2, 2, () => 250);
  const out = attackBrightness(img, 20);
  assert.equal(out.data[0], 255);
});

test('attackGaussianNoise: sigma 0 -> identik; deterministik per seed', () => {
  const img = makeImage(8, 8, () => 128);
  assert.equal(psnr(attackGaussianNoise(img, 0), img), Infinity);
  assert.deepEqual(attackGaussianNoise(img, 10, 5).data, attackGaussianNoise(img, 10, 5).data);
});

test('attackJPEG: ukuran tetap, kualitas rendah lebih rusak dari kualitas tinggi', async () => {
  const img = makeImage(32, 32, (c) => (c * 40) % 256);
  const q90 = await attackJPEG(img, 90);
  const q30 = await attackJPEG(img, 30);
  assert.equal(q90.width, 32);
  assert.ok(psnr(img, q90) > psnr(img, q30));
});

test('attackResize: faktor 1 identik, ukuran akhir sama seperti input', () => {
  const img = makeImage(16, 16, (c) => c * 30);
  assert.equal(psnr(attackResize(img, 1), img), Infinity);
  const r = attackResize(img, 0.5);
  assert.equal(r.width, 16);
  assert.equal(r.height, 16);
});

test('attackCrop: 0% identik, ukuran akhir sama seperti input', () => {
  const img = makeImage(20, 20, (c) => c * 30);
  assert.equal(psnr(attackCrop(img, 0), img), Infinity);
  const c = attackCrop(img, 20);
  assert.equal(c.width, 20);
  assert.equal(c.height, 20);
});
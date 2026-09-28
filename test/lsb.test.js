import test from 'node:test'; import assert from 'node:assert/strict';
import { textToBits, bitsToText, embedLSB, extractLSB } from '../src/lsb.js';
import { makeImage } from './helpers.js';
const bits = textToBits('NPM:1234');
test('textToBits ke bitsToText round-trip', () => assert.equal(bitsToText(textToBits('NPM:213040001 é')), 'NPM:213040001 é'));
test('embed lalu extract tanpa manipulasi: BER 0 dan NC 1', () => {
  const s = embedLSB(makeImage(32, 32), 32, 32, bits, 'kunci'); const r = extractLSB(s, 32, 32, bits, 'kunci');
  assert.equal(r.ber, 0); assert.equal(r.nc, 1);
});
test('perubahan pixel maksimal 1 tingkat', () => {
  const c = makeImage(32, 32), s = embedLSB(c, 32, 32, bits, 'kunci');
  for (let i = 0; i < c.data.length; i++) assert.ok(Math.abs(c.data[i] - s.data[i]) <= 1);
});
test('manipulasi terdeteksi tepat pada pixel yang diubah', () => {
  const s = embedLSB(makeImage(32, 32), 32, 32, bits, 'kunci');
  for (let i = 0; i < 200; i++) s.data[i * 4 + 2] ^= 1;
  const r = extractLSB(s, 32, 32, bits, 'kunci'); assert.equal(r.mismatches, 200); assert.ok(r.ber > 0);
});
test('stego-key salah gagal mengekstraksi', () => {
  const s = embedLSB(makeImage(32, 32), 32, 32, bits, 'kunci'); assert.ok(extractLSB(s, 32, 32, bits, 'salah').ber > 30);
});

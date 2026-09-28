import { test } from "node:test";
import assert from "node:assert/strict";

import { embedDCT, extractDCT } from "../src/dct.js";
import { textToBits } from "../src/lsb.js";
import { mulberry32 } from "../src/prng.js";
import { psnr } from "../src/metrics.js";
import { attackBrightness, attackGaussianNoise } from "../src/attacks.js";

const BLOCK = 8;
const DELTA = 25;
const KEY = "kunci-uji-dct";

function makeImage(width, height, seed = 7) {
  const rand = mulberry32(seed);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.floor(rand() * 256);
    data[i + 1] = Math.floor(rand() * 256);
    data[i + 2] = Math.floor(rand() * 256);
    data[i + 3] = 255;
  }
  return { data, width, height };
}

const payload = "kimpul";
const bits = textToBits(payload);

test("embed -> extract tanpa serangan: BER 0, NC 1, pesan pulih persis", () => {
  const cover = makeImage(64, 64);
  const stego = embedDCT(cover, BLOCK, BLOCK, bits, KEY, DELTA);
  const r = extractDCT(stego, BLOCK, BLOCK, bits, KEY);

  assert.equal(r.berFinal, 0);
  assert.equal(r.rawBer, 0);
  assert.equal(r.nc, 1);
  assert.equal(r.recoveredText, payload);
  assert.deepEqual(r.recovered, bits);
});

test("stego berbeda dari cover tetapi tetap imperceptible (PSNR > 28 dB)", () => {
  const cover = makeImage(64, 64);
  const stego = embedDCT(cover, BLOCK, BLOCK, bits, KEY, DELTA);

  assert.equal(stego.width, cover.width);
  assert.equal(stego.height, cover.height);
  assert.notDeepEqual(Array.from(stego.data), Array.from(cover.data));

  const p = psnr(cover, stego);
  assert.ok(Number.isFinite(p) && p > 28, `PSNR terlalu rendah: ${p}`);
});

test("kanal alpha tidak berubah setelah embed", () => {
  const cover = makeImage(32, 32);
  for (let i = 3; i < cover.data.length; i += 4) cover.data[i] = 200;
  const stego = embedDCT(cover, BLOCK, BLOCK, bits, KEY, DELTA);
  for (let i = 3; i < stego.data.length; i += 4) assert.equal(stego.data[i], 200);
});

test("embed deterministik: input dan key sama menghasilkan stego identik", () => {
  const cover = makeImage(64, 64);
  const a = embedDCT(cover, BLOCK, BLOCK, bits, KEY, DELTA);
  const b = embedDCT(cover, BLOCK, BLOCK, bits, KEY, DELTA);
  assert.deepEqual(Array.from(a.data), Array.from(b.data));
});

test("key salah gagal mengekstrak (BER tinggi, pesan tidak pulih)", () => {
  const cover = makeImage(64, 64);
  const stego = embedDCT(cover, BLOCK, BLOCK, bits, KEY, DELTA);
  const r = extractDCT(stego, BLOCK, BLOCK, bits, "key-yang-salah");

  assert.ok(r.berFinal > 20, `BER dengan key salah seharusnya tinggi, dapat ${r.berFinal}`);
  assert.notEqual(r.recoveredText, payload);
});

test("robust: bertahan terhadap brightness +15 dan Gaussian noise sigma 5", () => {
  const cover = makeImage(128, 128);
  const stego = embedDCT(cover, BLOCK, BLOCK, bits, KEY, DELTA);

  const bright = extractDCT(attackBrightness(stego, 15), BLOCK, BLOCK, bits, KEY);
  assert.equal(bright.berFinal, 0);
  assert.equal(bright.recoveredText, payload);

  const noisy = extractDCT(attackGaussianNoise(stego, 5, 42), BLOCK, BLOCK, bits, KEY);
  assert.equal(noisy.berFinal, 0);
  assert.equal(noisy.recoveredText, payload);
});

test("blockMap berukuran sama dengan citra", () => {
  const cover = makeImage(64, 64);
  const stego = embedDCT(cover, BLOCK, BLOCK, bits, KEY, DELTA);
  const { blockMap } = extractDCT(stego, BLOCK, BLOCK, bits, KEY);
  assert.equal(blockMap.width, 64);
  assert.equal(blockMap.height, 64);
  assert.equal(blockMap.data.length, 64 * 64 * 4);
});

test("menolak citra yang ukurannya bukan kelipatan blok", () => {
  const cover = makeImage(60, 64);
  assert.throws(() => embedDCT(cover, BLOCK, BLOCK, bits, KEY, DELTA), /kelipatan/);
  assert.throws(() => extractDCT(cover, BLOCK, BLOCK, bits, KEY), /kelipatan/);
});

test("menolak payload kosong", () => {
  const cover = makeImage(64, 64);
  assert.throws(() => embedDCT(cover, BLOCK, BLOCK, [], KEY, DELTA), /kosong/);
  assert.throws(() => extractDCT(cover, BLOCK, BLOCK, [], KEY), /kosong/);
});
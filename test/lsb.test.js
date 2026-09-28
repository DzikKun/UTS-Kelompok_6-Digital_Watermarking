import { test } from "node:test";
import assert from "node:assert/strict";
import { textToBits, bitsToText, embedLSB, extractLSB } from "../src/lsb.js";

function makeRandomImage(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.floor(Math.random() * 256);
    data[i + 1] = Math.floor(Math.random() * 256);
    data[i + 2] = Math.floor(Math.random() * 256);
    data[i + 3] = 255;
  }
  return { data, width, height };
}

test("textToBits <-> bitsToText: round-trip menghasilkan teks yang sama persis", () => {
  const original = "NPM:213040001";
  const bits = textToBits(original);
  const restored = bitsToText(bits);
  assert.equal(restored, original);
});

test("embedLSB lalu extractLSB tanpa manipulasi apa pun: BER=0 dan NC=1", () => {
  const cover = makeRandomImage(16, 16);
  const payload = textToBits("NPM:213040001");
  const key = "kunci-rahasia-tim";

  const stego = embedLSB(cover, payload, key);
  const result = extractLSB(stego, payload, key);

  assert.equal(result.ber, 0);
  assert.equal(result.nc, 1);
  assert.equal(result.mismatchCount, 0);
  assert.equal(result.totalBits, 16 * 16);
});

test("extractLSB mendeteksi manipulasi TEPAT pada satu pixel yang diubah (sifat fragile)", () => {
  const cover = makeRandomImage(20, 20);
  const payload = textToBits("NPM:213040001");
  const key = "kunci-rahasia-tim";

  const stego = embedLSB(cover, payload, key);

  const tampered = {
    data: new Uint8ClampedArray(stego.data),
    width: stego.width,
    height: stego.height,
  };
  tampered.data[0] = 255 - tampered.data[0];
  tampered.data[1] = 255 - tampered.data[1];
  tampered.data[2] = 255 - tampered.data[2];

  const result = extractLSB(tampered, payload, key);

  assert.equal(result.mismatchCount, 1);
  assert.equal(result.ber, (1 / (20 * 20)) * 100);

  assert.equal(result.tamperMap.data[0], 220);
  assert.equal(result.tamperMap.data[1], 38);
  assert.equal(result.tamperMap.data[2], 38);
  assert.equal(result.tamperMap.data[3], 255);
});

test("extractLSB dengan stego-key yang SALAH: verifikasi gagal (BER tinggi)", () => {
  const cover = makeRandomImage(32, 32);
  const payload = textToBits("NPM:213040001");

  const stego = embedLSB(cover, payload, "kunci-benar");
  const result = extractLSB(stego, payload, "kunci-yang-salah");

  assert.ok(result.ber > 5, `Diharapkan BER tinggi dengan key salah, tapi didapat ${result.ber}%`);
});

test("embedLSB menolak payload kosong", () => {
  const cover = makeRandomImage(8, 8);
  assert.throws(() => embedLSB(cover, [], "kunci-apa-saja"), /payloadBits kosong/);
});

test("extractLSB menolak expectedBits kosong", () => {
  const cover = makeRandomImage(8, 8);
  const payload = textToBits("A");
  const stego = embedLSB(cover, payload, "kunci");
  assert.throws(() => extractLSB(stego, [], "kunci"), /expectedBits kosong/);
});

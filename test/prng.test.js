import { test } from "node:test";
import assert from "node:assert/strict";
import { xmur3, mulberry32, keyedPermutation, generateSecretKey } from "../src/prng.js";

test("keyedPermutation: key yang sama menghasilkan permutasi identik", () => {
  const a = keyedPermutation("stego-key-123", 200);
  const b = keyedPermutation("stego-key-123", 200);
  assert.deepEqual(Array.from(a), Array.from(b));
});

test("keyedPermutation: key yang berbeda menghasilkan permutasi berbeda", () => {
  const a = keyedPermutation("kunci-A", 200);
  const b = keyedPermutation("kunci-B", 200);
  assert.notDeepEqual(Array.from(a), Array.from(b));
});

test("keyedPermutation: hasil selalu berupa permutasi valid (semua indeks 0..n-1 muncul tepat sekali)", () => {
  const n = 500;
  const perm = keyedPermutation("kunci-apa-saja", n);
  const sorted = Array.from(perm).sort((x, y) => x - y);
  const expected = Array.from({ length: n }, (_, i) => i);
  assert.deepEqual(sorted, expected);
});

test("mulberry32: seed yang sama menghasilkan urutan angka acak yang sama", () => {
  const rngA = mulberry32(987654321);
  const rngB = mulberry32(987654321);
  const seqA = [rngA(), rngA(), rngA()];
  const seqB = [rngB(), rngB(), rngB()];
  assert.deepEqual(seqA, seqB);
});

test("xmur3: string yang sama menghasilkan seed yang sama", () => {
  const seedA = xmur3("halo-dunia")();
  const seedB = xmur3("halo-dunia")();
  assert.equal(seedA, seedB);
});

test("generateSecretKey: menghasilkan string heksadesimal dengan panjang sesuai byteLength", () => {
  const key = generateSecretKey(16);
  assert.equal(key.length, 32);
  assert.match(key, /^[0-9a-f]+$/);
});

test("generateSecretKey: dua kali panggil menghasilkan key yang berbeda (CSPRNG, bukan hardcoded)", () => {
  const keyA = generateSecretKey(16);
  const keyB = generateSecretKey(16);
  assert.notEqual(keyA, keyB);
});

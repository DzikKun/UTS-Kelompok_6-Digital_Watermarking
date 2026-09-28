import test from 'node:test'; import assert from 'node:assert/strict';
import { generateSecretKey, keyedPermutation } from '../src/prng.js';
test('kunci sama menghasilkan permutasi identik', () => assert.deepEqual(keyedPermutation('k|8', 500), keyedPermutation('k|8', 500)));
test('kunci berbeda menghasilkan permutasi berbeda', () => assert.notDeepEqual(keyedPermutation('a', 500), keyedPermutation('b', 500)));
test('hasil adalah permutasi valid 0..n-1', () => { const p = keyedPermutation('k', 300); assert.equal(new Set(p).size, 300); assert.equal(Math.max(...p), 299); });
test('generateSecretKey berformat hex dan acak', () => { const a = generateSecretKey(16); assert.match(a, /^[0-9a-f]{32}$/); assert.notEqual(a, generateSecretKey(16)); });

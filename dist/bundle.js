// Auto-generated oleh build.js — JANGAN diedit manual.
// Sumber asli ada di src/*.js (ES Module).
(function () {
"use strict";

/* ===== src/prng.js ===== */
function generateSecretKey(byteLength = 16) {
  if (typeof crypto === "undefined" || !crypto.getRandomValues) {
    throw new Error(
      "Web Crypto API tidak tersedia di environment ini. " +
      "Jalankan di browser modern atau Node.js >= 19."
    );
  }
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function keyedPermutation(key, n) {
  const rng = mulberry32(xmur3(key)());
  const arr = new Uint32Array(n);
  for (let i = 0; i < n; i++) arr[i] = i;
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/* ===== src/lsb.js ===== */
function textToBits(str) {
  const bytes = new TextEncoder().encode(str);
  const bits = [];
  for (const byte of bytes) {
    for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
  }
  return bits;
}

function bitsToText(bits) {
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    bytes.push(b);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return "[gagal decode sbg UTF-8] " + bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
  }
}

function embedLSB(cover, payloadBits, key) {
  if (!payloadBits.length) throw new Error("payloadBits kosong");
  const { width, height } = cover;
  const n = width * height;
  const perm = keyedPermutation(key + "|" + payloadBits.length, n);

  const stegoData = new Uint8ClampedArray(cover.data);

  for (let i = 0; i < n; i++) {
    const pixelIndex = perm[i];
    const channelOffset = pixelIndex * 4 + 2;
    const bit = payloadBits[i % payloadBits.length];
    stegoData[channelOffset] = (stegoData[channelOffset] & 0xfe) | bit;
  }

  return { data: stegoData, width, height };
}

function extractLSB(current, expectedBits, key) {
  if (!expectedBits.length) throw new Error("expectedBits kosong");
  const { width, height } = current;
  const n = width * height;
  const perm = keyedPermutation(key + "|" + expectedBits.length, n);

  const tamperData = new Uint8ClampedArray(n * 4);
  let mismatchCount = 0;
  let dot = 0;

  for (let i = 0; i < n; i++) {
    const pixelIndex = perm[i];
    const channelOffset = pixelIndex * 4 + 2;
    const extractedBit = current.data[channelOffset] & 1;
    const expectedBit = expectedBits[i % expectedBits.length];
    const match = extractedBit === expectedBit;

    if (!match) mismatchCount++;

    const tp = pixelIndex * 4;
    if (match) {
      tamperData[tp] = 240; tamperData[tp + 1] = 240; tamperData[tp + 2] = 240; tamperData[tp + 3] = 255;
    } else {
      tamperData[tp] = 220; tamperData[tp + 1] = 38; tamperData[tp + 2] = 38; tamperData[tp + 3] = 255;
    }

    const a = extractedBit ? 1 : -1;
    const b = expectedBit ? 1 : -1;
    dot += a * b;
  }

  return {
    ber: (mismatchCount / n) * 100,
    nc: dot / n,
    mismatchCount,
    totalBits: n,
    tamperMap: { data: tamperData, width, height },
  };
}

/* ===== src/dct.js ===== */
// src/dct.js
// Modul Robust Watermarking berbasis DCT 2D blok 8x8, blind extraction.
// Environment-agnostic — TIDAK mengimpor document/canvas/window.
//
// Ringkasan teknik:
//   1. RGB -> YCbCr, watermark hanya disisip di kanal Y (luminansi).
//   2. Kanal Y dibagi blok blockWidth x blockHeight (standar 8x8).
//   3. Urutan blok yang dipakai = keyedPermutation(key + '|' + panjangPayload, totalBlok)
//      dari prng.js — deterministik terhadap key, konsisten dengan pola lsb.js.
//   4. Payload bit diulang ke SELURUH blok yang tersedia (payloadBits[i % panjang]),
//      sama seperti pola redundansi di lsb.js — supaya ekstraksi bisa majority-vote
//      per posisi bit asli, menaikkan ketahanan terhadap serangan.
//   5. Tiap blok: DCT 2D, lalu bandingkan koefisien frekuensi-menengah di posisi
//      (row=3,col=4) vs (row=4,col=3). Bit 1 -> coef(3,4) dibuat lebih besar
//      dari coef(4,3) sebesar `delta`; bit 0 -> sebaliknya. Perubahan dilakukan
//      simetris di sekitar rata-rata kedua koefisien supaya energi blok (dan
//      distorsi visual) minimal.
//   6. Inverse DCT 2D, gabung lagi ke YCbCr asli (Cb/Cr tidak disentuh) -> RGB.
//   7. Ekstraksi: DCT ulang tiap blok pada citra saat ini (current), baca relasi
//      koefisien (tanpa butuh citra cover asli -> blind), lalu majority-vote per
//      posisi bit asli dari seluruh pengulangannya.
//   8. NC & BER final dihitung lewat normalizedCorrelation()/bitErrorRate() dari
//      metrics.js — TIDAK dihitung ulang manual di sini.




// Posisi koefisien frekuensi-menengah yang dipakai untuk menyisip 1 bit per blok.
const POS_A = [1, 2]; // [row, col]
const POS_B = [2, 1];

/* ------------------------------------------------------------------ */
/* Konversi ruang warna RGB <-> YCbCr (ITU-R BT.601)                    */
/* ------------------------------------------------------------------ */

function rgbToY(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
function rgbToYCbCr(r, g, b) {
  const y = rgbToY(r, g, b);
  const cb = -0.168736 * r - 0.331264 * g + 0.5 * b + 128;
  const cr = 0.5 * r - 0.418688 * g - 0.081312 * b + 128;
  return [y, cb, cr];
}
function yCbCrToRgb(y, cb, cr) {
  const r = y + 1.402 * (cr - 128);
  const g = y - 0.344136 * (cb - 128) - 0.714136 * (cr - 128);
  const b = y + 1.772 * (cb - 128);
  return [r, g, b];
}
function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/* ------------------------------------------------------------------ */
/* DCT 2D ortonormal (separable: transform 1D di lebar, lalu di tinggi) */
/* ------------------------------------------------------------------ */

const cosTableCache = new Map();

function getCosTable(N) {
  let table = cosTableCache.get(N);
  if (table) return table;
  table = [];
  for (let n = 0; n < N; n++) {
    const row = new Array(N);
    for (let u = 0; u < N; u++) row[u] = Math.cos((Math.PI / N) * (n + 0.5) * u);
    table.push(row);
  }
  cosTableCache.set(N, table);
  return table;
}

function alpha(u, N) {
  return u === 0 ? Math.sqrt(1 / N) : Math.sqrt(2 / N);
}

/** DCT-II 1D ortonormal: vec (spasial, panjang N) -> koefisien (panjang N). */
function dct1d(vec) {
  const N = vec.length;
  const table = getCosTable(N);
  const out = new Array(N).fill(0);
  for (let u = 0; u < N; u++) {
    let sum = 0;
    for (let n = 0; n < N; n++) sum += vec[n] * table[n][u];
    out[u] = alpha(u, N) * sum;
  }
  return out;
}

/** Invers eksak dari dct1d (DCT-III ortonormal). */
function idct1d(vec) {
  const N = vec.length;
  const table = getCosTable(N);
  const out = new Array(N).fill(0);
  for (let n = 0; n < N; n++) {
    let sum = 0;
    for (let u = 0; u < N; u++) sum += alpha(u, N) * vec[u] * table[n][u];
    out[n] = sum;
  }
  return out;
}

/** DCT 2D pada blok persegi panjang (array baris x kolom). */
function dct2d(block) {
  const h = block.length, w = block[0].length;
  const rows = block.map((row) => dct1d(row)); // transform sepanjang lebar
  const cols = [];
  for (let c = 0; c < w; c++) cols.push(rows.map((row) => row[c]));
  const colsDct = cols.map((col) => dct1d(col)); // transform sepanjang tinggi
  const out = [];
  for (let r = 0; r < h; r++) out.push(colsDct.map((col) => col[r]));
  return out; // out[row_freq][col_freq]
}

/** Invers dct2d — urutan transform dibalik (tinggi dulu, baru lebar). */
function idct2d(coef) {
  const h = coef.length, w = coef[0].length;
  const cols = [];
  for (let c = 0; c < w; c++) cols.push(coef.map((row) => row[c]));
  const colsIdct = cols.map((col) => idct1d(col));
  const rows = [];
  for (let r = 0; r < h; r++) rows.push(colsIdct.map((col) => col[r]));
  return rows.map((row) => idct1d(row));
}

/* ------------------------------------------------------------------ */
/* Util lokal: bits -> text (duplikasi kecil dari lsb.js supaya dct.js */
/* tetap tidak bergantung pada modul lain selain prng.js & metrics.js) */
/* ------------------------------------------------------------------ */

function bitsToTextLocal(bits) {
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    bytes.push(b);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
  } catch {
    return "[gagal decode sbg UTF-8] " + bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
  }
}

/* ------------------------------------------------------------------ */
/* API publik sesuai kontrak                                           */
/* ------------------------------------------------------------------ */

function validateBlockSize(blockWidth, blockHeight) {
  if (blockWidth <= POS_A[1] || blockHeight <= POS_B[0]) {
    throw new RangeError(
      `Ukuran blok minimal ${POS_B[0] + 1}x${POS_A[1] + 1} untuk posisi koefisien yang dipakai.`
    );
  }
}

/**
 * Sisipkan payloadBits ke citra cover memakai DCT 2D blok pada kanal Y.
 * @param {{data: Uint8ClampedArray, width: number, height: number}} cover
 * @param {number} blockWidth  - lebar blok, standar 8
 * @param {number} blockHeight - tinggi blok, standar 8
 * @param {number[]} payloadBits - array bit (0/1)
 * @param {string} key - stego-key
 * @param {number} delta - margin/kekuatan sisipan antar koefisien
 * @returns {{data: Uint8ClampedArray, width: number, height: number}} citra stego
 */
function embedDCT(cover, blockWidth, blockHeight, payloadBits, key, delta) {
  if (cover.width % blockWidth !== 0 || cover.height % blockHeight !== 0) {
    throw new Error("Lebar dan tinggi citra harus kelipatan ukuran blok (mis. 8).");
  }
  if (!payloadBits.length) throw new Error("payloadBits kosong");
  validateBlockSize(blockWidth, blockHeight);

  const { width, height, data } = cover;
  const blocksX = width / blockWidth;
  const blocksY = height / blockHeight;
  const totalBlocks = blocksX * blocksY;

  const perm = keyedPermutation(key + "|" + payloadBits.length, totalBlocks);

  const yPlane = new Float64Array(width * height);
  const cbPlane = new Float64Array(width * height);
  const crPlane = new Float64Array(width * height);
  for (let p = 0; p < width * height; p++) {
    const idx = p * 4;
    const [y, cb, cr] = rgbToYCbCr(data[idx], data[idx + 1], data[idx + 2]);
    yPlane[p] = y;
    cbPlane[p] = cb;
    crPlane[p] = cr;
  }

  for (let i = 0; i < totalBlocks; i++) {
    const blockIndex = perm[i];
    const bx = blockIndex % blocksX;
    const by = Math.floor(blockIndex / blocksX);
    const bit = payloadBits[i % payloadBits.length];

    const block = [];
    for (let r = 0; r < blockHeight; r++) {
      const row = new Array(blockWidth);
      for (let c = 0; c < blockWidth; c++) {
        const px = bx * blockWidth + c;
        const py = by * blockHeight + r;
        row[c] = yPlane[py * width + px];
      }
      block.push(row);
    }

    const coef = dct2d(block);
    const cA = coef[POS_A[0]][POS_A[1]];
    const cB = coef[POS_B[0]][POS_B[1]];
    const avg = (cA + cB) / 2;
    if (bit === 1) {
      coef[POS_A[0]][POS_A[1]] = avg + delta / 2;
      coef[POS_B[0]][POS_B[1]] = avg - delta / 2;
    } else {
      coef[POS_A[0]][POS_A[1]] = avg - delta / 2;
      coef[POS_B[0]][POS_B[1]] = avg + delta / 2;
    }

    const reconstructed = idct2d(coef);
    for (let r = 0; r < blockHeight; r++) {
      for (let c = 0; c < blockWidth; c++) {
        const px = bx * blockWidth + c;
        const py = by * blockHeight + r;
        yPlane[py * width + px] = reconstructed[r][c];
      }
    }
  }

  const stegoData = new Uint8ClampedArray(data.length);
  for (let p = 0; p < width * height; p++) {
    const idx = p * 4;
    const [r, g, b] = yCbCrToRgb(yPlane[p], cbPlane[p], crPlane[p]);
    stegoData[idx] = clamp255(Math.round(r));
    stegoData[idx + 1] = clamp255(Math.round(g));
    stegoData[idx + 2] = clamp255(Math.round(b));
    stegoData[idx + 3] = data[idx + 3];
  }

  return { data: stegoData, width, height };
}

/**
 * Ekstrak payload dari citra (blind — tidak butuh citra cover asli).
 * @param {{data: Uint8ClampedArray, width: number, height: number}} current
 * @param {number} blockWidth
 * @param {number} blockHeight
 * @param {number[]} expectedBits - dipakai untuk hitung NC/BER & majority-vote
 * @param {string} key
 * @returns {{nc: number, berFinal: number, rawBer: number, recovered: number[],
 *            recoveredText: string, blockMap: {data:Uint8ClampedArray,width:number,height:number}}}
 */
function extractDCT(current, blockWidth, blockHeight, expectedBits, key) {
  if (!expectedBits.length) throw new Error("expectedBits kosong");
  if (current.width % blockWidth !== 0 || current.height % blockHeight !== 0) {
    throw new Error("Lebar dan tinggi citra harus kelipatan ukuran blok (mis. 8).");
  }
  validateBlockSize(blockWidth, blockHeight);

  const { width, height, data } = current;
  const blocksX = width / blockWidth;
  const blocksY = height / blockHeight;
  const totalBlocks = blocksX * blocksY;
  const expectedLen = expectedBits.length;

  const perm = keyedPermutation(key + "|" + expectedLen, totalBlocks);

  const yPlane = new Float64Array(width * height);
  for (let p = 0; p < width * height; p++) {
    const idx = p * 4;
    yPlane[p] = rgbToY(data[idx], data[idx + 1], data[idx + 2]);
  }

  const extractedRaw = new Array(totalBlocks);
  const blockMapData = new Uint8ClampedArray(width * height * 4);
  const votes = Array.from({ length: expectedLen }, () => ({ zero: 0, one: 0 }));

  for (let i = 0; i < totalBlocks; i++) {
    const blockIndex = perm[i];
    const bx = blockIndex % blocksX;
    const by = Math.floor(blockIndex / blocksX);

    const block = [];
    for (let r = 0; r < blockHeight; r++) {
      const row = new Array(blockWidth);
      for (let c = 0; c < blockWidth; c++) {
        const px = bx * blockWidth + c;
        const py = by * blockHeight + r;
        row[c] = yPlane[py * width + px];
      }
      block.push(row);
    }

    const coef = dct2d(block);
    const bit = coef[POS_A[0]][POS_A[1]] > coef[POS_B[0]][POS_B[1]] ? 1 : 0;
    extractedRaw[i] = bit;

    const originalPos = i % expectedLen;
    if (bit === 1) votes[originalPos].one++;
    else votes[originalPos].zero++;

    const expectedBit = expectedBits[originalPos];
    const match = bit === expectedBit;
    for (let r = 0; r < blockHeight; r++) {
      for (let c = 0; c < blockWidth; c++) {
        const px = bx * blockWidth + c;
        const py = by * blockHeight + r;
        const o = (py * width + px) * 4;
        if (match) {
          blockMapData[o] = 240; blockMapData[o + 1] = 240; blockMapData[o + 2] = 240; blockMapData[o + 3] = 255;
        } else {
          blockMapData[o] = 220; blockMapData[o + 1] = 38; blockMapData[o + 2] = 38; blockMapData[o + 3] = 255;
        }
      }
    }
  }

  const recovered = votes.map((v) => (v.one >= v.zero ? 1 : 0));
  const rawExpectedRepeated = extractedRaw.map((_, i) => expectedBits[i % expectedLen]);

  const rawBer = bitErrorRate(extractedRaw, rawExpectedRepeated);
  const berFinal = bitErrorRate(recovered, expectedBits);
  const nc = normalizedCorrelation(recovered, expectedBits);

  let recoveredText;
  try {
    recoveredText = bitsToTextLocal(recovered);
  } catch {
    recoveredText = "[gagal decode]";
  }

  return {
    nc,
    berFinal,
    rawBer,
    recovered,
    recoveredText,
    blockMap: { data: blockMapData, width, height },
  };
}

/* ===== src/metrics.js ===== */
function psnr(imageA, imageB) {
  if (imageA.width !== imageB.width || imageA.height !== imageB.height) {
    throw new RangeError('Ukuran citra harus sama untuk menghitung PSNR');
  }
  const totalPixel = imageA.width * imageA.height;
  let sumSquaredError = 0;
  for (let p = 0; p < totalPixel; p++) {
    const idx = p * 4;
    for (let offset = 0; offset < 3; offset++) {
      const diff = imageA.data[idx + offset] - imageB.data[idx + offset];
      sumSquaredError += diff * diff;
    }
  }
  const mse = sumSquaredError / (totalPixel * 3);
  if (mse === 0) return Infinity;
  return 10 * Math.log10((255 * 255) / mse);
}

function normalizedCorrelation(bitsA, bitsB) {
  if (bitsA.length !== bitsB.length) throw new RangeError('Panjang bit harus sama');
  if (bitsA.length === 0) throw new RangeError('Deret bit kosong');
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < bitsA.length; i++) {
    dot += bitsA[i] * bitsB[i];
    normA += bitsA[i] * bitsA[i];
    normB += bitsB[i] * bitsB[i];
  }
  if (normA === 0 && normB === 0) return 1;
  if (normA === 0 || normB === 0) return 0;
  return dot / Math.sqrt(normA * normB);
}

function bitErrorRate(bitsA, bitsB) {
  if (bitsA.length !== bitsB.length) throw new RangeError('Panjang bit harus sama');
  if (bitsA.length === 0) throw new RangeError('Deret bit kosong');
  let errorCount = 0;
  for (let i = 0; i < bitsA.length; i++) if (bitsA[i] !== bitsB[i]) errorCount++;
  return (errorCount / bitsA.length) * 100;
}

function channelHistogram(image) {
  const r = new Array(256).fill(0);
  const g = new Array(256).fill(0);
  const b = new Array(256).fill(0);
  const totalPixel = image.width * image.height;
  for (let p = 0; p < totalPixel; p++) {
    const idx = p * 4;
    r[image.data[idx]]++;
    g[image.data[idx + 1]]++;
    b[image.data[idx + 2]]++;
  }
  return { r, g, b };
}

/* ===== src/attacks.js ===== */
function clone(image) {
  return { data: new Uint8ClampedArray(image.data), width: image.width, height: image.height };
}

function attackBrightness(image, delta) {
  const out = clone(image);
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] += delta;
    out.data[i + 1] += delta;
    out.data[i + 2] += delta;
  }
  return out;
}

function attackGaussianNoise(image, sigma, seed = 1) {
  const rand = mulberry32(seed);
  const gaussian = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const out = clone(image);
  for (let i = 0; i < out.data.length; i += 4) {
    for (let c = 0; c < 3; c++) out.data[i + c] = out.data[i + c] + sigma * gaussian();
  }
  return out;
}

async function attackJPEG(image, quality) {
  if (!(quality >= 1 && quality <= 100)) throw new RangeError('quality harus 1..100');
  const jpegModule = await import('jpeg-js');
  const jpeg = jpegModule.default ?? jpegModule;
  const encoded = jpeg.encode({ data: image.data, width: image.width, height: image.height }, quality);
  const decoded = jpeg.decode(encoded.data, { useTArray: true, formatAsRGBA: true });
  return { data: new Uint8ClampedArray(decoded.data), width: decoded.width, height: decoded.height };
}

function resample(image, newWidth, newHeight) {
  const { width: sw, height: sh, data } = image;
  const out = new Uint8ClampedArray(newWidth * newHeight * 4);
  for (let dy = 0; dy < newHeight; dy++) {
    const sy = Math.min(Math.max((dy + 0.5) * (sh / newHeight) - 0.5, 0), sh - 1);
    const y0 = Math.floor(sy), y1 = Math.min(y0 + 1, sh - 1), fy = sy - y0;
    for (let dx = 0; dx < newWidth; dx++) {
      const sx = Math.min(Math.max((dx + 0.5) * (sw / newWidth) - 0.5, 0), sw - 1);
      const x0 = Math.floor(sx), x1 = Math.min(x0 + 1, sw - 1), fx = sx - x0;
      const o = (dy * newWidth + dx) * 4;
      for (let c = 0; c < 4; c++) {
        const top = data[(y0 * sw + x0) * 4 + c] * (1 - fx) + data[(y0 * sw + x1) * 4 + c] * fx;
        const bot = data[(y1 * sw + x0) * 4 + c] * (1 - fx) + data[(y1 * sw + x1) * 4 + c] * fx;
        out[o + c] = top * (1 - fy) + bot * fy;
      }
    }
  }
  return { data: out, width: newWidth, height: newHeight };
}

function attackResize(image, scaleFactor) {
  if (!(scaleFactor > 0)) throw new RangeError('scaleFactor harus > 0');
  const nw = Math.max(1, Math.round(image.width * scaleFactor));
  const nh = Math.max(1, Math.round(image.height * scaleFactor));
  return resample(resample(image, nw, nh), image.width, image.height);
}

function attackCrop(image, cropPercent) {
  if (!(cropPercent >= 0 && cropPercent < 100)) throw new RangeError('cropPercent harus 0..<100');
  const marginX = Math.floor((image.width * cropPercent) / 200);
  const marginY = Math.floor((image.height * cropPercent) / 200);
  const cw = image.width - 2 * marginX;
  const ch = image.height - 2 * marginY;
  const cropped = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    const srcStart = ((y + marginY) * image.width + marginX) * 4;
    cropped.set(image.data.subarray(srcStart, srcStart + cw * 4), y * cw * 4);
  }
  return resample({ data: cropped, width: cw, height: ch }, image.width, image.height);
}

/* ===== src/ui.js ===== */
function canvasToPlainImage(canvas) {
  const ctx = canvas.getContext("2d");
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { data: imgData.data, width: canvas.width, height: canvas.height };
}

function drawPlainImageToCanvas(plainImage, canvas) {
  canvas.width = plainImage.width;
  canvas.height = plainImage.height;
  const ctx = canvas.getContext("2d");
  const imgData = new ImageData(
    new Uint8ClampedArray(plainImage.data),
    plainImage.width,
    plainImage.height
  );
  ctx.putImageData(imgData, 0, 0);
}

function loadFileToCanvas(file, canvas) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      resolve(canvasToPlainImage(canvas));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function setResult(el, html) {
  el.innerHTML = html;
}

function fmtMetric(label, value, unit = "") {
  return `<span class="metric">${label}: ${value}${unit}</span>`;
}

function attackJPEGBrowser(image, quality) {
  return new Promise((resolve, reject) => {
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = image.width;
    tempCanvas.height = image.height;
    const ctx = tempCanvas.getContext("2d");
    const imgData = new ImageData(
      new Uint8ClampedArray(image.data),
      image.width,
      image.height
    );
    ctx.putImageData(imgData, 0, 0);

    const dataUrl = tempCanvas.toDataURL("image/jpeg", Math.min(Math.max(quality, 1), 100) / 100);

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
      ctx.drawImage(img, 0, 0);
      const result = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
      resolve({ data: result.data, width: tempCanvas.width, height: tempCanvas.height });
    };
    img.onerror = () => reject(new Error("Gagal decode ulang hasil kompresi JPEG."));
    img.src = dataUrl;
  });
}

const ATTACK_PARAM_DEFAULTS = {
  none: { label: "Parameter (tidak dipakai)", value: "" },
  jpeg: { label: "Kualitas JPEG (1-100)", value: "70" },
  noise: { label: "Sigma (kekuatan noise)", value: "10" },
  brightness: { label: "Delta kecerahan (-255..255)", value: "20" },
  resize: { label: "Skala (0-1, mis. 0.5 = setengah)", value: "0.5" },
  crop: { label: "Persentase crop tepi (0-99)", value: "10" },
};

async function applyAttackByType(type, image, paramValue) {
  switch (type) {
    case "none":
      return image;
    case "jpeg":
      return attackJPEGBrowser(image, paramValue);
    case "noise":
      return attackGaussianNoise(image, paramValue);
    case "brightness":
      return attackBrightness(image, paramValue);
    case "resize":
      return attackResize(image, paramValue);
    case "crop":
      return attackCrop(image, paramValue);
    default:
      throw new Error(`Jenis serangan tidak dikenal: ${type}`);
  }
}

function wireAttackParamDefaults(selectEl, paramEl, labelEl) {
  selectEl.addEventListener("change", () => {
    const def = ATTACK_PARAM_DEFAULTS[selectEl.value] || { label: "Parameter", value: "" };
    labelEl.textContent = def.label;
    paramEl.value = def.value;
  });
  const initial = ATTACK_PARAM_DEFAULTS[selectEl.value] || { label: "Parameter", value: "" };
  labelEl.textContent = initial.label;
}

const tabButtons = document.querySelectorAll("nav.tabs button[data-tab]");
const panels = document.querySelectorAll("main[data-panel]");

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.setAttribute("aria-selected", "false"));
    btn.setAttribute("aria-selected", "true");
    panels.forEach((p) => {
      p.setAttribute("data-active", String(p.dataset.panel === btn.dataset.tab));
    });
  });
});

const lsbCoverInput = document.getElementById("lsb-cover");
const lsbCanvasCover = document.getElementById("lsb-canvas-cover");
const lsbCanvasStego = document.getElementById("lsb-canvas-stego");
const lsbPayloadEl = document.getElementById("lsb-payload");
const lsbKeyEl = document.getElementById("lsb-key");
const lsbGenKeyBtn = document.getElementById("lsb-gen-key");
const lsbEmbedBtn = document.getElementById("lsb-embed");
const lsbExtractBtn = document.getElementById("lsb-extract");
const lsbAttackRunBtn = document.getElementById("lsb-attack-run");
const lsbResultsEl = document.getElementById("lsb-results");

let lsbCoverImage = null;

lsbCoverInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  lsbCoverImage = await loadFileToCanvas(file, lsbCanvasCover);
  lsbEmbedBtn.disabled = false;
  lsbAttackRunBtn.disabled = false;
  setResult(lsbResultsEl, `Citra dimuat: ${lsbCoverImage.width}×${lsbCoverImage.height}px.`);
});

lsbGenKeyBtn.addEventListener("click", () => {
  lsbKeyEl.value = generateSecretKey(16);
});

lsbEmbedBtn.addEventListener("click", () => {
  if (!lsbCoverImage) return;
  const key = lsbKeyEl.value.trim();
  if (!key) {
    alert("Isi atau generate stego-key terlebih dahulu.");
    return;
  }
  try {
    const payloadBits = textToBits(lsbPayloadEl.value);
    const stego = embedLSB(lsbCoverImage, payloadBits, key);
    drawPlainImageToCanvas(stego, lsbCanvasStego);
    lsbCoverImage.__lastStego = stego;
    lsbCoverImage.__lastPayloadBits = payloadBits;
    lsbCoverImage.__lastPsnr = psnr(lsbCoverImage, stego);
    lsbCoverImage.__lastPayloadText = lsbPayloadEl.value;
    lsbExtractBtn.disabled = false;
    setResult(lsbResultsEl, `Payload (${payloadBits.length} bit) berhasil disisipkan.`);
  } catch (err) {
    console.error(err);
    alert("Gagal embed (LSB): " + err.message);
  }
});

lsbExtractBtn.addEventListener("click", () => {
  const key = lsbKeyEl.value.trim();
  const current = canvasToPlainImage(lsbCanvasStego);
  const expectedBits = lsbCoverImage.__lastPayloadBits;
  if (!expectedBits) {
    alert("Belum ada proses embed pada sesi ini.");
    return;
  }
  try {
    const result = extractLSB(current, expectedBits, key);
    const { ber, nc, mismatchCount, totalBits } = result;
    lsbCoverImage.__lastExtractResult = result;
    const okClass = ber === 0 ? "ok" : "bad";
    setResult(
      lsbResultsEl,
      [
        `<span class="metric ${okClass}">BER: ${ber.toFixed(4)}%</span>`,
        fmtMetric("NC", nc.toFixed(4)),
        fmtMetric("Bit salah", `${mismatchCount}/${totalBits}`),
      ].join("&nbsp;&nbsp;·&nbsp;&nbsp;")
    );
  } catch (err) {
    console.error(err);
    alert("Gagal extract (LSB): " + err.message);
  }
});

const lsbAttackSelect = document.getElementById("lsb-attack");
const lsbAttackParamEl = document.getElementById("lsb-attack-param");
const lsbAttackParamLabelEl = document.getElementById("lsb-attack-param-label");
wireAttackParamDefaults(lsbAttackSelect, lsbAttackParamEl, lsbAttackParamLabelEl);

lsbAttackRunBtn.addEventListener("click", async () => {
  if (!lsbCoverImage || !lsbCoverImage.__lastStego) {
    alert("Lakukan embed terlebih dahulu sebelum menerapkan serangan.");
    return;
  }
  const type = lsbAttackSelect.value;
  const paramValue = parseFloat(lsbAttackParamEl.value);
  if (type !== "none" && !Number.isFinite(paramValue)) {
    alert("Isi nilai parameter serangan terlebih dahulu.");
    return;
  }
  try {
    lsbAttackRunBtn.disabled = true;
    const attacked = await applyAttackByType(type, lsbCoverImage.__lastStego, paramValue);
    drawPlainImageToCanvas(attacked, lsbCanvasStego);
    setResult(
      lsbResultsEl,
      `Serangan "${lsbAttackSelect.selectedOptions[0].text}" diterapkan. Klik "Ekstrak & Verifikasi" untuk lihat dampaknya.`
    );
  } catch (err) {
    console.error(err);
    alert("Gagal menerapkan serangan: " + err.message);
  } finally {
    lsbAttackRunBtn.disabled = false;
  }
});

const dctCoverInput = document.getElementById("dct-cover");
const dctCanvasCover = document.getElementById("dct-canvas-cover");
const dctCanvasStego = document.getElementById("dct-canvas-stego");
const dctPayloadEl = document.getElementById("dct-payload");
const dctEmbedBtn = document.getElementById("dct-embed");
const dctExtractBtn = document.getElementById("dct-extract");
const dctAttackRunBtn = document.getElementById("dct-attack-run");
const dctGenKeyBtn = document.getElementById("dct-gen-key");
const dctKeyEl = document.getElementById("dct-key");
const dctResultsEl = document.getElementById("dct-results");

let dctCoverImage = null;

dctCoverInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  dctCoverImage = await loadFileToCanvas(file, dctCanvasCover);
  dctEmbedBtn.disabled = false;
  dctAttackRunBtn.disabled = false;
  setResult(
    dctResultsEl,
    `Citra dimuat: ${dctCoverImage.width}×${dctCoverImage.height}px. ` +
      (dctCoverImage.width % 8 || dctCoverImage.height % 8
        ? `<span class="metric bad">Peringatan: lebar/tinggi harus kelipatan 8 untuk DCT.</span>`
        : "")
  );
});

dctGenKeyBtn.addEventListener("click", () => {
  dctKeyEl.value = generateSecretKey(16);
});

const dctDeltaEl = document.getElementById("dct-delta");

dctEmbedBtn.addEventListener("click", () => {
  if (!dctCoverImage) return;
  const key = dctKeyEl.value.trim();
  if (!key) {
    alert("Isi atau generate stego-key terlebih dahulu.");
    return;
  }
  const delta = parseFloat(dctDeltaEl.value);
  if (!Number.isFinite(delta) || delta <= 0) {
    alert("Delta harus berupa angka positif (disarankan 20-30).");
    return;
  }
  try {
    const payloadBits = textToBits(dctPayloadEl.value);
    const stego = embedDCT(dctCoverImage, 8, 8, payloadBits, key, delta);
    drawPlainImageToCanvas(stego, dctCanvasStego);
    dctCoverImage.__lastStego = stego;
    dctCoverImage.__lastPayloadBits = payloadBits;
    dctCoverImage.__lastPsnr = psnr(dctCoverImage, stego);
    dctCoverImage.__lastPayloadText = dctPayloadEl.value;
    dctExtractBtn.disabled = false;
    setResult(
      dctResultsEl,
      `Payload (${payloadBits.length} bit) berhasil disisipkan lewat DCT (delta=${delta}).`
    );
  } catch (err) {
    console.error(err);
    alert("Gagal embed (DCT): " + err.message);
  }
});

dctExtractBtn.addEventListener("click", () => {
  const key = dctKeyEl.value.trim();
  const current = canvasToPlainImage(dctCanvasStego);
  const expectedBits = dctCoverImage && dctCoverImage.__lastPayloadBits;
  if (!expectedBits) {
    alert("Belum ada proses embed pada sesi ini.");
    return;
  }
  try {
    const result = extractDCT(current, 8, 8, expectedBits, key);
    const { berFinal, nc, rawBer, recoveredText } = result;
    dctCoverImage.__lastExtractResult = result;
    const okClass = berFinal === 0 ? "ok" : "bad";
    setResult(
      dctResultsEl,
      [
        `<span class="metric ${okClass}">BER final: ${berFinal.toFixed(2)}%</span>`,
        fmtMetric("NC", nc.toFixed(4)),
        fmtMetric("Raw BER per-blok", rawBer.toFixed(2), "%"),
        fmtMetric("Pesan pulih", `"${recoveredText}"`),
      ].join("&nbsp;&nbsp;·&nbsp;&nbsp;")
    );
  } catch (err) {
    console.error(err);
    alert("Gagal extract (DCT): " + err.message);
  }
});

const dctAttackSelect = document.getElementById("dct-attack");
const dctAttackParamEl = document.getElementById("dct-attack-param");
const dctAttackParamLabelEl = document.getElementById("dct-attack-param-label");
wireAttackParamDefaults(dctAttackSelect, dctAttackParamEl, dctAttackParamLabelEl);

dctAttackRunBtn.addEventListener("click", async () => {
  if (!dctCoverImage || !dctCoverImage.__lastStego) {
    alert("Lakukan embed terlebih dahulu sebelum menerapkan serangan.");
    return;
  }
  const type = dctAttackSelect.value;
  const paramValue = parseFloat(dctAttackParamEl.value);
  if (type !== "none" && !Number.isFinite(paramValue)) {
    alert("Isi nilai parameter serangan terlebih dahulu.");
    return;
  }
  try {
    dctAttackRunBtn.disabled = true;
    const attacked = await applyAttackByType(type, dctCoverImage.__lastStego, paramValue);
    drawPlainImageToCanvas(attacked, dctCanvasStego);
    setResult(
      dctResultsEl,
      `Serangan "${dctAttackSelect.selectedOptions[0].text}" diterapkan. Klik "Ekstrak & Verifikasi" untuk lihat dampaknya.`
    );
  } catch (err) {
    console.error(err);
    alert("Gagal menerapkan serangan: " + err.message);
  } finally {
    dctAttackRunBtn.disabled = false;
  }
});

/* ------------------------------------------------------------------ */
/* Tab: Bandingkan                                                      */
/* ------------------------------------------------------------------ */

const compareRunBtn = document.getElementById("compare-run");
const compareExportBtn = document.getElementById("compare-export");
const compareTableBody = document.getElementById("compare-table-body");

let lastCompareRows = null;

function formatPsnr(value) {
  if (value === undefined || value === null) return "-";
  return value === Infinity ? "∞ (identik)" : value.toFixed(2) + " dB";
}

function renderCompareTable(rows) {
  compareTableBody.innerHTML = rows
    .map(
      ([label, lsbVal, dctVal]) =>
        `<tr><td>${label}</td><td>${lsbVal}</td><td>${dctVal}</td></tr>`
    )
    .join("");
}

compareRunBtn.addEventListener("click", () => {
  const lsbReady = lsbCoverImage && lsbCoverImage.__lastExtractResult;
  const dctReady = dctCoverImage && dctCoverImage.__lastExtractResult;
  if (!lsbReady || !dctReady) {
    alert(
      "Lengkapi dulu proses embed + ekstrak di KEDUA tab (Fragile LSB dan Robust DCT) " +
        "sebelum membandingkan. Boleh coba dengan/ tanpa serangan sesuai skenario uji."
    );
    return;
  }

  const lsbR = lsbCoverImage.__lastExtractResult;
  const dctR = dctCoverImage.__lastExtractResult;
  const lsbAttackName = lsbAttackSelect.selectedOptions[0].text;
  const dctAttackName = dctAttackSelect.selectedOptions[0].text;

  const rows = [
    ["Pesan/payload", lsbCoverImage.__lastPayloadText ?? "-", dctCoverImage.__lastPayloadText ?? "-"],
    ["Serangan diterapkan", lsbAttackName, dctAttackName],
    ["PSNR cover vs stego", formatPsnr(lsbCoverImage.__lastPsnr), formatPsnr(dctCoverImage.__lastPsnr)],
    ["NC", lsbR.nc.toFixed(4), dctR.nc.toFixed(4)],
    ["BER final (%)", lsbR.ber.toFixed(2), dctR.berFinal.toFixed(2)],
    ["Detail tambahan", `Bit salah: ${lsbR.mismatchCount}/${lsbR.totalBits}`, `Raw BER per-blok: ${dctR.rawBer.toFixed(2)}%`],
  ];

  renderCompareTable(rows);
  lastCompareRows = rows;
  compareExportBtn.disabled = false;
});

function xlsxTextEncode(str) {
  return new TextEncoder().encode(str);
}

const XLSX_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function xlsxCrc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = XLSX_CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function xlsxBuildZip(files) {
  function u16(v) { return new Uint8Array([v & 0xff, (v >>> 8) & 0xff]); }
  function u32(v) { return new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]); }
  function concatAll(arrs) {
    const len = arrs.reduce((s, a) => s + a.length, 0);
    const out = new Uint8Array(len);
    let p = 0;
    for (const a of arrs) { out.set(a, p); p += a.length; }
    return out;
  }

  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = xlsxTextEncode(file.name);
    const crc = xlsxCrc32(file.data);
    const size = file.data.length;

    const localHeader = concatAll([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0),
    ]);
    const localEntry = concatAll([localHeader, nameBytes, file.data]);
    localChunks.push(localEntry);

    const centralHeader = concatAll([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(size), u32(size), u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(offset),
    ]);
    centralChunks.push(concatAll([centralHeader, nameBytes]));

    offset += localEntry.length;
  }

  const centralDir = concatAll(centralChunks);
  const localData = concatAll(localChunks);

  const eocd = concatAll([
    u32(0x06054b50), u16(0), u16(0),
    u16(files.length), u16(files.length),
    u32(centralDir.length), u32(localData.length), u16(0),
  ]);

  return concatAll([localData, centralDir, eocd]);
}

function xlsxEscape(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function xlsxColLetter(n) {
  let s = "";
  n += 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function xlsxBuildSheetXml(rows) {
  let rowsXml = "";
  rows.forEach((row, rIdx) => {
    const rowNum = rIdx + 1;
    let cellsXml = "";
    row.forEach((val, cIdx) => {
      const ref = xlsxColLetter(cIdx) + rowNum;
      if (typeof val === "number" && Number.isFinite(val)) {
        cellsXml += `<c r="${ref}"><v>${val}</v></c>`;
      } else {
        const text = val === undefined || val === null ? "" : String(val);
        cellsXml += `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xlsxEscape(text)}</t></is></c>`;
      }
    });
    rowsXml += `<row r="${rowNum}">${cellsXml}</row>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml}</sheetData></worksheet>`;
}

function buildXlsxBytes(sheetName, rows) {
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${xlsxEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;
  const sheetXml = xlsxBuildSheetXml(rows);

  return xlsxBuildZip([
    { name: "[Content_Types].xml", data: xlsxTextEncode(contentTypes) },
    { name: "_rels/.rels", data: xlsxTextEncode(rootRels) },
    { name: "xl/workbook.xml", data: xlsxTextEncode(workbookXml) },
    { name: "xl/_rels/workbook.xml.rels", data: xlsxTextEncode(workbookRels) },
    { name: "xl/worksheets/sheet1.xml", data: xlsxTextEncode(sheetXml) },
  ]);
}

compareExportBtn.addEventListener("click", () => {
  if (!lastCompareRows) {
    alert("Susun tabel perbandingan dulu sebelum ekspor.");
    return;
  }
  try {
    const header = ["Metrik", "Fragile (LSB)", "Robust (DCT)"];
    const bytes = buildXlsxBytes("Perbandingan", [header, ...lastCompareRows]);
    const blob = new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "data-uji.xlsx";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
    alert("Gagal membuat file xlsx: " + err.message);
  }
});

})();

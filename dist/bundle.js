(function () {
"use strict";

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
  const extracted = new Array(n);
  const expected = new Array(n);

  for (let i = 0; i < n; i++) {
    const pixelIndex = perm[i];
    const channelOffset = pixelIndex * 4 + 2;
    const extractedBit = current.data[channelOffset] & 1;
    const expectedBit = expectedBits[i % expectedBits.length];
    const match = extractedBit === expectedBit;

    if (!match) mismatchCount++;
    extracted[i] = extractedBit;
    expected[i] = expectedBit;

    const tp = pixelIndex * 4;
    if (match) {
      tamperData[tp] = 240; tamperData[tp + 1] = 240; tamperData[tp + 2] = 240; tamperData[tp + 3] = 255;
    } else {
      tamperData[tp] = 220; tamperData[tp + 1] = 38; tamperData[tp + 2] = 38; tamperData[tp + 3] = 255;
    }
  }

  return {
    ber: bitErrorRate(extracted, expected),
    nc: normalizedCorrelation(extracted, expected),
    mismatchCount,
    totalBits: n,
    tamperMap: { data: tamperData, width, height },
  };
}

const POS_A = [1, 2];
const POS_B = [2, 1];

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

function dct2d(block) {
  const h = block.length, w = block[0].length;
  const rows = block.map((row) => dct1d(row));
  const cols = [];
  for (let c = 0; c < w; c++) cols.push(rows.map((row) => row[c]));
  const colsDct = cols.map((col) => dct1d(col));
  const out = [];
  for (let r = 0; r < h; r++) out.push(colsDct.map((col) => col[r]));
  return out;
}

function idct2d(coef) {
  const h = coef.length, w = coef[0].length;
  const cols = [];
  for (let c = 0; c < w; c++) cols.push(coef.map((row) => row[c]));
  const colsIdct = cols.map((col) => idct1d(col));
  const rows = [];
  for (let r = 0; r < h; r++) rows.push(colsIdct.map((col) => col[r]));
  return rows.map((row) => idct1d(row));
}

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

function validateBlockSize(blockWidth, blockHeight) {
  if (blockWidth <= POS_A[1] || blockHeight <= POS_B[0]) {
    throw new RangeError(
      `Ukuran blok minimal ${POS_B[0] + 1}x${POS_A[1] + 1} untuk posisi koefisien yang dipakai.`
    );
  }
}

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

const modes = {
  frag: { state: { cover: null, original: null, current: null, bits: null } },
  rob: { state: { cover: null, original: null, current: null, bits: null } },
  cmp: { state: { cover: null, lsbOriginal: null, dctOriginal: null, lsbCurrent: null, dctCurrent: null, bits: null } },
};

function copyImage(image) {
  return { data: new Uint8ClampedArray(image.data), width: image.width, height: image.height };
}

function canvasToImage(canvas) {
  const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height);
  return { data: pixels.data, width: canvas.width, height: canvas.height };
}

function drawImage(image, canvas) {
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
}

function clearCanvas(canvas) {
  canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
}

function loadImage(file, alignToBlocks = false) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const width = alignToBlocks ? Math.floor(image.naturalWidth / 8) * 8 : image.naturalWidth;
      const height = alignToBlocks ? Math.floor(image.naturalHeight / 8) * 8 : image.naturalHeight;
      if (!width || !height) {
        URL.revokeObjectURL(url);
        reject(new Error("Citra harus berukuran minimal 8×8 piksel."));
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height);
      resolve({ data: pixels.data, width, height });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Berkas gambar tidak dapat dibuka."));
    };
    image.src = url;
  });
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function renderMessage(id, message) {
  document.getElementById(id).innerHTML = message ? `<div class="hint">${escapeHTML(message)}</div>` : "";
}

function formatPsnr(value) {
  return value === Infinity ? "∞ (identik)" : `${value.toFixed(2)} dB`;
}

function formatVerdict(ok, success, failure) {
  return `<div class="verdict ${ok ? "ok" : "bad"}">${ok ? success : failure}</div>`;
}

function attackJPEGBrowser(image, quality) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d");
    context.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
    const encoded = canvas.toDataURL("image/jpeg", Math.min(Math.max(quality, 1), 100) / 100);
    const decoded = new Image();
    decoded.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(decoded, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
      resolve({ data: pixels.data, width: canvas.width, height: canvas.height });
    };
    decoded.onerror = () => reject(new Error("Gagal membaca hasil kompresi JPEG."));
    decoded.src = encoded;
  });
}

async function applyAttack(type, image, mode) {
  const controlName = type === "brightness" ? "brightness" : type;
  const value = Number(document.getElementById(`${mode}-${controlName}`).value);
  switch (type) {
    case "jpeg": return attackJPEGBrowser(image, value);
    case "resize": return attackResize(image, value / 100);
    case "crop": return attackCrop(image, value);
    case "noise": return attackGaussianNoise(image, value);
    case "brightness": return attackBrightness(image, value);
    default: throw new Error(`Jenis serangan tidak dikenal: ${type}`);
  }
}

function modeCanvas(mode, suffix) {
  return document.getElementById(`${mode}-${suffix}`);
}

function enableModeActions(mode, enabled) {
  document.querySelectorAll(`[data-attack-mode="${mode}"]`).forEach((button) => { button.disabled = !enabled; });
  const reset = document.getElementById(`${mode}-reset-attack`);
  if (reset) reset.disabled = !enabled;
  if (mode === "frag") document.getElementById("frag-reset").disabled = !enabled;
}

function downloadCanvas(canvas, filename) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

document.querySelectorAll("[data-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    const activeTab = button.dataset.tab;
    document.querySelectorAll("[data-tab]").forEach((tab) => {
      const selected = tab === button;
      tab.classList.toggle("active", selected);
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    document.querySelectorAll("[role='tabpanel']").forEach((panel) => { panel.hidden = panel.id !== `tab-${activeTab}`; });
  });
});

document.querySelectorAll("[data-range]").forEach((range) => {
  range.addEventListener("input", () => {
    const output = document.querySelector(`[data-value-for="${range.id}"]`);
    if (output) output.textContent = range.value;
  });
});

for (const mode of ["frag", "rob"]) {
  const state = modes[mode].state;
  const isDct = mode === "rob";
  const fileInput = document.getElementById(`${mode}-file`);
  const embedButton = document.getElementById(`${mode}-embed`);
  const verifyButton = document.getElementById(`${mode}-verify`);
  const downloadButton = document.getElementById(`${mode}-download`);

  document.getElementById(`${mode}-key-gen`).addEventListener("click", () => {
    document.getElementById(`${mode}-key-embed`).value = generateSecretKey(16);
  });

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      state.cover = await loadImage(file, isDct);
      drawImage(state.cover, modeCanvas(mode, "coverCanvas"));
      clearCanvas(modeCanvas(mode, "stegoCanvas"));
      clearCanvas(modeCanvas(mode, "mapCanvas"));
      state.original = state.current = null;
      embedButton.disabled = false;
      verifyButton.disabled = downloadButton.disabled = true;
      enableModeActions(mode, false);
      renderMessage(`${mode}-embed-out`, `Citra dimuat: ${state.cover.width}×${state.cover.height} piksel.`);
    } catch (error) { alert(error.message); }
  });

  embedButton.addEventListener("click", () => {
    if (!state.cover) return;
    const payload = document.getElementById(`${mode}-payload`).value;
    const key = document.getElementById(`${mode}-key-embed`).value.trim();
    if (!payload) return alert("Isi identitas watermark terlebih dahulu.");
    if (!key) return alert("Isi atau generate stego-key terlebih dahulu.");
    try {
      state.bits = textToBits(payload);
      state.payload = payload;
      state.key = key;
      state.original = isDct
        ? embedDCT(state.cover, 8, 8, state.bits, key, Number(document.getElementById("rob-delta").value))
        : embedLSB(state.cover, state.bits, key);
      state.current = copyImage(state.original);
      drawImage(state.original, modeCanvas(mode, "stegoCanvas"));
      document.getElementById(`${mode}-key-extract`).value = key;
      document.getElementById(`${mode}-expected`).value = payload;
      verifyButton.disabled = downloadButton.disabled = false;
      enableModeActions(mode, true);
      document.getElementById(`${mode}-embed-out`).innerHTML = `<span class="metric">PSNR: ${escapeHTML(formatPsnr(psnr(state.cover, state.original)))}</span><span class="metric">Payload: ${state.bits.length} bit</span>`;
    } catch (error) { alert(`Gagal embed: ${error.message}`); }
  });

  downloadButton.addEventListener("click", () => downloadCanvas(modeCanvas(mode, "stegoCanvas"), `stego-${isDct ? "dct" : "lsb"}.png`));

  verifyButton.addEventListener("click", () => {
    if (!state.current) return;
    const key = document.getElementById(`${mode}-key-extract`).value.trim();
    const expected = textToBits(document.getElementById(`${mode}-expected`).value);
    if (!key || !expected.length) return alert("Stego-key dan identitas yang diharapkan harus diisi.");
    try {
      const result = isDct ? extractDCT(state.current, 8, 8, expected, key) : extractLSB(state.current, expected, key);
      const ber = isDct ? result.berFinal : result.ber;
      drawImage(isDct ? result.blockMap : result.tamperMap, modeCanvas(mode, "mapCanvas"));
      const detail = isDct
        ? `<span class="metric">BER mentah/blok: ${result.rawBer.toFixed(2)}%</span><div class="hint">Teks pulih: <code>${escapeHTML(result.recoveredText)}</code></div>`
        : `<span class="metric">Bit tidak cocok: ${result.mismatchCount.toLocaleString()}</span>`;
      const verdict = formatVerdict(ber < (isDct ? 5 : 0.5), isDct ? "✅ Watermark terverifikasi" : "✅ Citra UTUH", isDct ? "⚠️ Rusak / key salah / serangan terlalu berat" : "⚠️ TERDETEKSI PERUBAHAN");
      document.getElementById(`${mode}-verify-out`).innerHTML = `<span class="metric">NC: ${result.nc.toFixed(4)}</span><span class="metric">BER: ${ber.toFixed(3)}%</span>${detail}${verdict}`;
    } catch (error) { alert(`Gagal verifikasi: ${error.message}`); }
  });

  const resetStego = () => {
    if (!state.original) return;
    state.current = copyImage(state.original);
    drawImage(state.current, modeCanvas(mode, "stegoCanvas"));
  };
  if (isDct) document.getElementById("rob-reset-attack").addEventListener("click", resetStego);
  else document.getElementById("frag-reset").addEventListener("click", resetStego);
}

function attachTamperCanvas() {
  const canvas = modeCanvas("frag", "stegoCanvas"), state = modes.frag.state;
  let drawing = false, start = null;
  const point = (event) => {
    const bounds = canvas.getBoundingClientRect();
    return [Math.floor((event.clientX - bounds.left) * canvas.width / bounds.width), Math.floor((event.clientY - bounds.top) * canvas.height / bounds.height)];
  };
  const paint = (event) => {
    if (!state.current || !start) return;
    drawImage(state.current, canvas);
    const [x, y] = point(event), context = canvas.getContext("2d");
    context.fillStyle = "rgba(255,140,0,.9)";
    context.fillRect(Math.min(start[0], x), Math.min(start[1], y), Math.max(4, Math.abs(x - start[0])), Math.max(4, Math.abs(y - start[1])));
  };
  canvas.addEventListener("pointerdown", (event) => {
    if (!state.current) return;
    drawing = true; start = point(event); canvas.setPointerCapture(event.pointerId); paint(event);
  });
  canvas.addEventListener("pointermove", (event) => { if (drawing) paint(event); });
  canvas.addEventListener("pointerup", () => {
    if (!drawing) return;
    drawing = false; state.current = canvasToImage(canvas); start = null;
  });
  canvas.addEventListener("pointercancel", () => { drawing = false; start = null; });
}
attachTamperCanvas();

document.querySelectorAll('[data-attack-mode="rob"]').forEach((button) => {
  button.addEventListener("click", async () => {
    const mode = button.dataset.attackMode, state = modes[mode].state;
    if (!state.current) return;
    button.disabled = true;
    try {
      state.current = await applyAttack(button.dataset.attackType, state.current, mode);
      drawImage(state.current, modeCanvas(mode, "stegoCanvas"));
    } catch (error) { alert(`Gagal menerapkan serangan: ${error.message}`); }
    finally { button.disabled = false; }
  });
});

const compare = modes.cmp.state;
document.getElementById("cmp-key-gen").addEventListener("click", () => { document.getElementById("cmp-key-embed").value = generateSecretKey(16); });
document.getElementById("cmp-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    compare.cover = await loadImage(file, true);
    drawImage(compare.cover, modeCanvas("cmp", "coverCanvas"));
    clearCanvas(modeCanvas("cmp", "fragCanvas"));
    clearCanvas(modeCanvas("cmp", "robCanvas"));
    compare.lsbOriginal = compare.dctOriginal = compare.lsbCurrent = compare.dctCurrent = null;
    document.getElementById("cmp-embed").disabled = false;
    document.getElementById("cmp-verify").disabled = true;
    document.getElementById("cmp-download-lsb").disabled = true;
    document.getElementById("cmp-download-dct").disabled = true;
    document.getElementById("compare-export").disabled = true;
    enableModeActions("cmp", false);
    renderMessage("cmp-embed-out", `Cover bersama dimuat: ${compare.cover.width}×${compare.cover.height} piksel.`);
  } catch (error) { alert(error.message); }
});

document.getElementById("cmp-embed").addEventListener("click", () => {
  const payload = document.getElementById("cmp-payload").value, key = document.getElementById("cmp-key-embed").value.trim();
  if (!compare.cover) return;
  if (!payload) return alert("Isi identitas watermark terlebih dahulu.");
  if (!key) return alert("Isi atau generate stego-key terlebih dahulu.");
  try {
    compare.bits = textToBits(payload); compare.payload = payload; compare.key = key;
    compare.lsbOriginal = embedLSB(compare.cover, compare.bits, key);
    compare.dctOriginal = embedDCT(compare.cover, 8, 8, compare.bits, key, Number(document.getElementById("cmp-delta").value));
    compare.lsbCurrent = copyImage(compare.lsbOriginal); compare.dctCurrent = copyImage(compare.dctOriginal);
    drawImage(compare.lsbCurrent, modeCanvas("cmp", "fragCanvas")); drawImage(compare.dctCurrent, modeCanvas("cmp", "robCanvas"));
    document.getElementById("cmp-key-extract").value = key; document.getElementById("cmp-expected").value = payload;
    document.getElementById("cmp-verify").disabled = false;
    document.getElementById("cmp-download-lsb").disabled = false; document.getElementById("cmp-download-dct").disabled = false;
    document.getElementById("compare-export").disabled = true; enableModeActions("cmp", true);
    document.getElementById("cmp-embed-out").innerHTML = `<span class="metric">PSNR LSB: ${escapeHTML(formatPsnr(psnr(compare.cover, compare.lsbOriginal)))}</span><span class="metric">PSNR DCT: ${escapeHTML(formatPsnr(psnr(compare.cover, compare.dctOriginal)))}</span><span class="metric">Payload: ${compare.bits.length} bit</span>`;
  } catch (error) { alert(`Gagal menyisipkan kedua watermark: ${error.message}`); }
});

document.getElementById("cmp-download-lsb").addEventListener("click", () => downloadCanvas(modeCanvas("cmp", "fragCanvas"), "stego-lsb.png"));
document.getElementById("cmp-download-dct").addEventListener("click", () => downloadCanvas(modeCanvas("cmp", "robCanvas"), "stego-dct.png"));
document.querySelectorAll('[data-attack-mode="cmp"]').forEach((button) => {
  button.addEventListener("click", async () => {
    if (!compare.lsbCurrent || !compare.dctCurrent) return;
    button.disabled = true;
    try {
      const type = button.dataset.attackType;
      [compare.lsbCurrent, compare.dctCurrent] = await Promise.all([applyAttack(type, compare.lsbCurrent, "cmp"), applyAttack(type, compare.dctCurrent, "cmp")]);
      drawImage(compare.lsbCurrent, modeCanvas("cmp", "fragCanvas")); drawImage(compare.dctCurrent, modeCanvas("cmp", "robCanvas"));
    } catch (error) { alert(`Gagal menerapkan serangan: ${error.message}`); }
    finally { button.disabled = false; }
  });
});

document.getElementById("cmp-reset-attack").addEventListener("click", () => {
  if (!compare.lsbOriginal || !compare.dctOriginal) return;
  compare.lsbCurrent = copyImage(compare.lsbOriginal); compare.dctCurrent = copyImage(compare.dctOriginal);
  drawImage(compare.lsbCurrent, modeCanvas("cmp", "fragCanvas")); drawImage(compare.dctCurrent, modeCanvas("cmp", "robCanvas"));
});

let lastCompareRows = null;
document.getElementById("cmp-verify").addEventListener("click", () => {
  if (!compare.lsbCurrent || !compare.dctCurrent) return;
  const key = document.getElementById("cmp-key-extract").value.trim(), expected = textToBits(document.getElementById("cmp-expected").value);
  if (!key || !expected.length) return alert("Stego-key dan identitas yang diharapkan harus diisi.");
  try {
    const lsb = extractLSB(compare.lsbCurrent, expected, key), dct = extractDCT(compare.dctCurrent, 8, 8, expected, key);
    const lsbOk = lsb.ber < 0.5, dctOk = dct.berFinal < 5;
    lastCompareRows = [
      ["Fragile (LSB)", lsb.nc.toFixed(4), `${lsb.ber.toFixed(3)}%`, lsbOk ? "Utuh" : "Terdeteksi perubahan"],
      ["Robust (DCT)", dct.nc.toFixed(4), `${dct.berFinal.toFixed(3)}%`, dctOk ? "Terverifikasi" : "Rusak / key salah"],
      ["BER mentah/blok DCT", "—", `${dct.rawBer.toFixed(3)}%`, "Sebelum majority-vote"],
    ];
    document.getElementById("cmp-table-out").innerHTML = `<table><thead><tr><th>Metode</th><th>NC</th><th>BER</th><th>Status</th></tr></thead><tbody>${lastCompareRows.map((row, index) => `<tr><td>${row[0]}</td><td>${row[1]}</td><td>${row[2]}</td><td>${index === 2 ? escapeHTML(row[3]) : `<span class="verdict ${index === 0 ? (lsbOk ? "ok" : "bad") : (dctOk ? "ok" : "bad")}">${escapeHTML(row[3])}</span>`}</td></tr>`).join("")}</tbody></table>`;
    document.getElementById("compare-export").disabled = false;
  } catch (error) { alert(`Gagal memverifikasi perbandingan: ${error.message}`); }
});

function xlsxTextEncode(value) { return new TextEncoder().encode(value); }
const xlsxCrcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let crc = n; for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1; table[n] = crc >>> 0; }
  return table;
})();
function xlsxCrc32(bytes) { let crc = 0xffffffff; for (const byte of bytes) crc = xlsxCrcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function zipStored(files) {
  const u16 = (value) => new Uint8Array([value & 255, value >>> 8 & 255]);
  const u32 = (value) => new Uint8Array([value & 255, value >>> 8 & 255, value >>> 16 & 255, value >>> 24 & 255]);
  const concat = (parts) => { const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0; for (const part of parts) { out.set(part, offset); offset += part.length; } return out; };
  const local = [], central = []; let offset = 0;
  for (const file of files) {
    const name = xlsxTextEncode(file.name), crc = xlsxCrc32(file.data), size = file.data.length;
    const header = concat([u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(size), u32(size), u16(name.length), u16(0)]);
    const entry = concat([header, name, file.data]); local.push(entry);
    central.push(concat([u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(size), u32(size), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), name]));
    offset += entry.length;
  }
  const directory = concat(central), localData = concat(local);
  return concat([localData, directory, concat([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(directory.length), u32(localData.length), u16(0)])]);
}
function xmlEscape(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]); }
function columnName(index) { let name = ""; for (index++; index; index = Math.floor((index - 1) / 26)) name = String.fromCharCode(65 + (index - 1) % 26) + name; return name; }
function buildXlsx(rows) {
  const sheetRows = rows.map((row, r) => `<row r="${r + 1}">${row.map((value, c) => `<c r="${columnName(c)}${r + 1}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`).join("")}</row>`).join("");
  const entries = [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Perbandingan" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`],
    ["xl/worksheets/sheet1.xml", `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`],
  ].map(([name, xml]) => ({ name, data: xlsxTextEncode(xml) }));
  return zipStored(entries);
}
document.getElementById("compare-export").addEventListener("click", () => {
  if (!lastCompareRows) return;
  const blob = new Blob([buildXlsx([["Metode", "NC", "BER", "Status"], ...lastCompareRows])], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = "data-uji.xlsx"; link.click(); URL.revokeObjectURL(url);
});

})();

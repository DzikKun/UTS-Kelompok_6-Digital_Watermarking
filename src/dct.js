import { keyedPermutation } from "./prng.js";
import { normalizedCorrelation, bitErrorRate } from "./metrics.js";

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

export function embedDCT(cover, blockWidth, blockHeight, payloadBits, key, delta) {
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

export function extractDCT(current, blockWidth, blockHeight, expectedBits, key) {
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

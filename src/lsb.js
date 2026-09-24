import { keyedPermutation } from "./prng.js";

export function textToBits(str) {
  const bytes = new TextEncoder().encode(str);
  const bits = [];
  for (const byte of bytes) {
    for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
  }
  return bits;
}

export function bitsToText(bits) {
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

export function embedLSB(cover, payloadBits, key) {
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

export function extractLSB(current, expectedBits, key) {
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
export function psnr(imageA, imageB) {
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

export function normalizedCorrelation(bitsA, bitsB) {
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

export function bitErrorRate(bitsA, bitsB) {
  if (bitsA.length !== bitsB.length) throw new RangeError('Panjang bit harus sama');
  if (bitsA.length === 0) throw new RangeError('Deret bit kosong');
  let errorCount = 0;
  for (let i = 0; i < bitsA.length; i++) if (bitsA[i] !== bitsB[i]) errorCount++;
  return (errorCount / bitsA.length) * 100;
}

export function channelHistogram(image) {
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
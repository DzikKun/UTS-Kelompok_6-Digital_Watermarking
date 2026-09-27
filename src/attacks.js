import { mulberry32 } from './prng.js';

function clone(image) {
  return { data: new Uint8ClampedArray(image.data), width: image.width, height: image.height };
}

export function attackBrightness(image, delta) {
  const out = clone(image);
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] += delta;
    out.data[i + 1] += delta;
    out.data[i + 2] += delta;
  }
  return out;
}

export function attackGaussianNoise(image, sigma, seed = 1) {
  const rand = mulberry32(seed);
  const gaussian = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const out = clone(image);
  for (let i = 0; i < out.data.length; i += 4) {
    for (let c = 0; c < 3; c++) out.data[i + c] = out.data[i + c] + sigma * gaussian();
  }
  return out;
}

export async function attackJPEG(image, quality) {
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

export function attackResize(image, scaleFactor) {
  if (!(scaleFactor > 0)) throw new RangeError('scaleFactor harus > 0');
  const nw = Math.max(1, Math.round(image.width * scaleFactor));
  const nh = Math.max(1, Math.round(image.height * scaleFactor));
  return resample(resample(image, nw, nh), image.width, image.height);
}

export function attackCrop(image, cropPercent) {
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
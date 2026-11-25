/**
 * Zero-dependency pure-JS PNG decoder using node:zlib.
 * Supports 8-bit RGB (colorType 2) and RGBA (colorType 6) non-interlaced PNGs
 * (exact format emitted by Chrome DevTools Protocol Page.captureScreenshot).
 */

import { inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export function decodePng(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 33) {
    throw new Error('Invalid PNG buffer');
  }
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Not a valid PNG signature');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks = [];

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    if (type === 'IHDR') {
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      bitDepth = buffer[dataStart + 8];
      colorType = buffer[dataStart + 9];
      const interlace = buffer[dataStart + 12];
      if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
        throw new Error(
          `Unsupported PNG format (bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace})`
        );
      }
    } else if (type === 'IDAT') {
      idatChunks.push(buffer.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      break;
    }

    offset = dataEnd + 4; // skip CRC
  }

  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const raw = inflateSync(Buffer.concat(idatChunks));
  const rgba = new Uint8Array(width * height * 4);

  const prevRow = new Uint8Array(stride);
  const currRow = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filterType = raw[rowStart];

    for (let i = 0; i < stride; i++) {
      const rawByte = raw[rowStart + 1 + i];
      const a = i >= bpp ? currRow[i - bpp] : 0;
      const b = prevRow[i];
      const c = i >= bpp ? prevRow[i - bpp] : 0;

      let recon;
      switch (filterType) {
        case 0:
          recon = rawByte;
          break;
        case 1:
          recon = (rawByte + a) & 0xff;
          break;
        case 2:
          recon = (rawByte + b) & 0xff;
          break;
        case 3:
          recon = (rawByte + ((a + b) >> 1)) & 0xff;
          break;
        case 4:
          recon = (rawByte + paethPredictor(a, b, c)) & 0xff;
          break;
        default:
          throw new Error(`Unsupported PNG filter type: ${filterType}`);
      }
      currRow[i] = recon;
    }

    const outOffset = y * width * 4;
    if (bpp === 4) {
      rgba.set(currRow, outOffset);
    } else {
      for (let x = 0; x < width; x++) {
        rgba[outOffset + x * 4] = currRow[x * 3];
        rgba[outOffset + x * 4 + 1] = currRow[x * 3 + 1];
        rgba[outOffset + x * 4 + 2] = currRow[x * 3 + 2];
        rgba[outOffset + x * 4 + 3] = 255;
      }
    }
    prevRow.set(currRow);
  }

  return { width, height, data: rgba };
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Samples the dominant rendered background color around the perimeter/padding
 * of an element's bounding box, filtering out pixels too close to the text foreground.
 * Ideal for resolving true contrast over CSS gradients, glassmorphism, and hero images.
 */
export function sampleBackgroundAroundRect(png, rect, fgRgb, dpr = 1) {
  const insetX = Math.min(Math.round(4 * dpr), Math.floor((rect.width * dpr) * 0.15));
  const insetY = Math.min(Math.round(3 * dpr), Math.floor((rect.height * dpr) * 0.15));
  const x0 = Math.max(0, Math.floor(rect.x * dpr) + insetX);
  const y0 = Math.max(0, Math.floor(rect.y * dpr) + insetY);
  const x1 = Math.min(png.width - 1, Math.ceil((rect.x + rect.width) * dpr) - insetX);
  const y1 = Math.min(png.height - 1, Math.ceil((rect.y + rect.height) * dpr) - insetY);

  if (x1 <= x0 || y1 <= y0) return null;

  const samples = [];
  const stepX = Math.max(1, Math.floor((x1 - x0) / 14));
  const stepY = Math.max(1, Math.floor((y1 - y0) / 8));

  const pushPixel = (px, py) => {
    const idx = (py * png.width + px) * 4;
    const r = png.data[idx];
    const g = png.data[idx + 1];
    const b = png.data[idx + 2];
    const dist = Math.abs(r - fgRgb.r) + Math.abs(g - fgRgb.g) + Math.abs(b - fgRgb.b);
    samples.push({ r, g, b, dist });
  };

  // Sample border edges inside the rect (background around glyphs) + sparse interior grid
  for (let x = x0; x <= x1; x += stepX) {
    pushPixel(x, y0);
    pushPixel(x, y1);
    if (y0 + 1 < y1) pushPixel(x, y0 + 1);
    if (y1 - 1 > y0) pushPixel(x, y1 - 1);
  }
  for (let y = y0; y <= y1; y += stepY) {
    pushPixel(x0, y);
    pushPixel(x1, y);
  }

  if (samples.length === 0) return null;

  // Exclude pixels that belong to the foreground text glyphs (distance < 35) unless all pixels are identical
  const bgCandidates = samples.filter((s) => s.dist >= 35);
  const pool = bgCandidates.length >= 4 ? bgCandidates : samples;

  // Median per channel is robust against anti-aliased glyph edges & noisy hero photos
  const median = (arr) => {
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };

  const r = median(pool.map((s) => s.r));
  const g = median(pool.map((s) => s.g));
  const b = median(pool.map((s) => s.b));

  // Also compute color variance to know if background is a busy image
  const variance =
    pool.reduce(
      (acc, s) => acc + Math.abs(s.r - r) + Math.abs(s.g - g) + Math.abs(s.b - b),
      0
    ) /
    (pool.length * 3);

  return { r, g, b, a: 1, variance: Math.round(variance * 10) / 10, sampleCount: pool.length };
}

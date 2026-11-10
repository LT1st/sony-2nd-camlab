import type {
  DarkroomStageId,
  FilmPreset,
  FilmRecipe,
  ToneCurvePreset
} from '@camera-lab/contracts';

export interface PixelBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface ImageHistogram {
  r: number[];
  g: number[];
  b: number[];
  luma: number[];
  meanLuma: number;
  dynamicRangeStops: number;
  shadowClipPercent: number;
  highlightClipPercent: number;
}

export interface AutoAlignmentSuggestion {
  translationX: number;
  translationY: number;
  nccScore: number;
}

export interface BayerPhotositeSample {
  x: number;
  y: number;
  bayerChannel: 'R' | 'G1' | 'G2' | 'B';
  r: number;
  g: number;
  b: number;
  luma: number;
}

/**
 * Inspects a single pixel in an RGBA PixelBuffer and determines its 2x2 RGGB Bayer
 * photosite channel ('R' at even row/col, 'G1' at even row/odd col, 'G2' at odd row/even col, 'B' at odd row/col).
 */
export function samplePixelAndBayerSite(
  buffer: PixelBuffer,
  x: number,
  y: number
): BayerPhotositeSample {
  const cx = Math.max(0, Math.min(buffer.width - 1, Math.floor(x)));
  const cy = Math.max(0, Math.min(buffer.height - 1, Math.floor(y)));
  const idx = (cy * buffer.width + cx) * 4;
  const r = buffer.data[idx] ?? 0;
  const g = buffer.data[idx + 1] ?? 0;
  const b = buffer.data[idx + 2] ?? 0;
  const luma = clampByte(0.299 * r + 0.587 * g + 0.114 * b);

  const rowEven = (cy & 1) === 0;
  const colEven = (cx & 1) === 0;
  const bayerChannel: 'R' | 'G1' | 'G2' | 'B' = rowEven
    ? colEven
      ? 'R'
      : 'G1'
    : colEven
      ? 'G2'
      : 'B';

  return { x: cx, y: cy, bayerChannel, r, g, b, luma };
}

function clampByte(value: number): number {
  return value < 0 ? 0 : value > 255 ? 255 : Math.round(value);
}

export function applyToneCurveSample(
  normalizedValue: number,
  curve: ToneCurvePreset
): number {
  const x = Math.max(0, Math.min(1, normalizedValue));
  switch (curve) {
    case 'S_CURVE_CLASSIC': {
      return x * x * (3 - 2 * x);
    }
    case 'MATTE_SHADOW': {
      return 0.08 + 0.86 * Math.pow(x, 0.92);
    }
    case 'HIGH_KEY': {
      return Math.pow(x, 0.78);
    }
    case 'LINEAR':
    default:
      return x;
  }
}

export function applyFilmPresetRgb(
  r: number,
  g: number,
  b: number,
  preset: FilmPreset
): [number, number, number] {
  switch (preset) {
    case 'WARM_AMBER': {
      const nr = r * 1.07 + g * 0.04;
      const ng = g * 1.01 + r * 0.02;
      const nb = b * 0.89;
      return [nr, ng, nb];
    }
    case 'MONO_SILVER': {
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      return [luma * 1.01, luma * 1.0, luma * 0.97];
    }
    case 'CLASSIC_COLOR':
    default: {
      const nr = r * 1.03 - b * 0.02;
      const ng = g * 1.01;
      const nb = b * 1.04 - r * 0.01;
      return [nr, ng, nb];
    }
  }
}

/**
 * Pure pixel pipeline for JPEG_SIMULATION stages.
 * Can run inside a Web Worker or main thread fallback without DOM dependencies.
 */
export function processStagePixelBuffer(
  source: PixelBuffer,
  stage: DarkroomStageId,
  recipe: FilmRecipe
): PixelBuffer {
  const { width, height, data } = source;
  const out = new Uint8ClampedArray(data.length);

  const evGain = Math.pow(2, recipe.exposureEv * 0.65);
  const tempGainR = 1 + (recipe.temperatureShift / 100) * 0.28;
  const tempGainB = 1 - (recipe.temperatureShift / 100) * 0.28;
  const tintGainG = 1 - (recipe.tintShift / 100) * 0.2;
  const contrastFactor =
    (259 * (recipe.contrast * 1.8 + 255)) /
    (255 * (259 - recipe.contrast * 1.8));
  const satFactor = 1 + recipe.saturation / 100;
  const grainScale = (recipe.grainAmount / 100) * 28;

  for (let y = 0; y < height; y++) {
    const rowEven = (y & 1) === 0;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r0 = data[idx]!;
      const g0 = data[idx + 1]!;
      const b0 = data[idx + 2]!;
      const a0 = data[idx + 3]!;

      if (stage === 'RAW_SENSOR') {
        const colEven = (x & 1) === 0;
        if (rowEven && colEven) {
          out[idx] = clampByte(r0 * 0.95);
          out[idx + 1] = clampByte(r0 * 0.14);
          out[idx + 2] = clampByte(r0 * 0.14);
        } else if (!rowEven && !colEven) {
          out[idx] = clampByte(b0 * 0.14);
          out[idx + 1] = clampByte(b0 * 0.18);
          out[idx + 2] = clampByte(b0 * 0.95);
        } else {
          out[idx] = clampByte(g0 * 0.15);
          out[idx + 1] = clampByte(g0 * 0.92);
          out[idx + 2] = clampByte(g0 * 0.15);
        }
        out[idx + 3] = a0;
        continue;
      }

      if (stage === 'BLACK_LEVEL') {
        const luma = 0.299 * r0 + 0.587 * g0 + 0.114 * b0;
        const rFlat = Math.max(0, (r0 - 18) * 0.62) * 0.45 + luma * 0.28;
        const gFlat = Math.max(0, (g0 - 14) * 0.68) * 0.45 + luma * 0.34;
        const bFlat = Math.max(0, (b0 - 20) * 0.58) * 0.45 + luma * 0.25;
        out[idx] = clampByte(rFlat);
        out[idx + 1] = clampByte(gFlat);
        out[idx + 2] = clampByte(bFlat);
        out[idx + 3] = a0;
        continue;
      }

      if (stage === 'DEMOSAIC') {
        const avg = (r0 + g0 + b0) / 3;
        out[idx] = clampByte(avg + (r0 - avg) * 0.55);
        out[idx + 1] = clampByte(avg + (g0 - avg) * 0.62 + 6);
        out[idx + 2] = clampByte(avg + (b0 - avg) * 0.52);
        out[idx + 3] = a0;
        continue;
      }

      let r = r0 * tempGainR;
      let g = g0 * tintGainG;
      let b = b0 * tempGainB;

      if (stage === 'WHITE_BALANCE') {
        out[idx] = clampByte(r * 0.92);
        out[idx + 1] = clampByte(g * 0.92);
        out[idx + 2] = clampByte(b * 0.92);
        out[idx + 3] = a0;
        continue;
      }

      r = applyToneCurveSample((r * evGain) / 255, recipe.toneCurve) * 255;
      g = applyToneCurveSample((g * evGain) / 255, recipe.toneCurve) * 255;
      b = applyToneCurveSample((b * evGain) / 255, recipe.toneCurve) * 255;

      r = contrastFactor * (r - 128) + 128;
      g = contrastFactor * (g - 128) + 128;
      b = contrastFactor * (b - 128) + 128;

      if (stage === 'TONE') {
        out[idx] = clampByte(r);
        out[idx + 1] = clampByte(g);
        out[idx + 2] = clampByte(b);
        out[idx + 3] = a0;
        continue;
      }

      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      r = luma + (r - luma) * satFactor;
      g = luma + (g - luma) * satFactor;
      b = luma + (b - luma) * satFactor;

      const [fr, fg, fb] = applyFilmPresetRgb(r, g, b, recipe.filmPreset);
      r = fr;
      g = fg;
      b = fb;

      if (grainScale > 0) {
        const hash = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        const noise = (hash - Math.floor(hash) - 0.5) * 2 * grainScale;
        r += noise;
        g += noise;
        b += noise;
      }

      out[idx] = clampByte(r);
      out[idx + 1] = clampByte(g);
      out[idx + 2] = clampByte(b);
      out[idx + 3] = a0;
    }
  }

  return { width, height, data: out };
}

/**
 * Computes a real 256-bin RGB & Luminance histogram plus shadow/highlight clipping
 * and estimated dynamic range stops from an RGBA PixelBuffer.
 */
export function computeHistogram(buffer: PixelBuffer): ImageHistogram {
  const rBins = new Array<number>(256).fill(0);
  const gBins = new Array<number>(256).fill(0);
  const bBins = new Array<number>(256).fill(0);
  const lumaBins = new Array<number>(256).fill(0);

  const totalPixels = Math.max(1, buffer.width * buffer.height);
  let lumaSum = 0;
  let shadowClips = 0;
  let highlightClips = 0;

  const { data } = buffer;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] ?? 0;
    const g = data[i + 1] ?? 0;
    const b = data[i + 2] ?? 0;
    const luma = clampByte(0.299 * r + 0.587 * g + 0.114 * b);

    rBins[r] = (rBins[r] ?? 0) + 1;
    gBins[g] = (gBins[g] ?? 0) + 1;
    bBins[b] = (bBins[b] ?? 0) + 1;
    lumaBins[luma] = (lumaBins[luma] ?? 0) + 1;
    lumaSum += luma;

    if (luma <= 3) shadowClips += 1;
    if (luma >= 252) highlightClips += 1;
  }

  // Estimate 1st and 99th luminance percentiles for dynamic range in stops
  const p01Target = totalPixels * 0.01;
  const p99Target = totalPixels * 0.99;
  let cumulative = 0;
  let p01Val = 1;
  let p99Val = 254;
  let foundP01 = false;

  for (let bin = 0; bin < 256; bin++) {
    cumulative += lumaBins[bin] ?? 0;
    if (!foundP01 && cumulative >= p01Target) {
      p01Val = Math.max(1, bin);
      foundP01 = true;
    }
    if (cumulative >= p99Target) {
      p99Val = Math.max(p01Val + 1, bin);
      break;
    }
  }

  const dynamicRangeStops = Number(Math.log2(p99Val / p01Val).toFixed(2));

  return {
    r: rBins,
    g: gBins,
    b: bBins,
    luma: lumaBins,
    meanLuma: Number((lumaSum / totalPixels).toFixed(1)),
    dynamicRangeStops,
    shadowClipPercent: Number(((shadowClips / totalPixels) * 100).toFixed(2)),
    highlightClipPercent: Number(
      ((highlightClips / totalPixels) * 100).toFixed(2)
    )
  };
}

export function computeAbsoluteDifferenceBuffer(
  reference: PixelBuffer,
  current: PixelBuffer
): PixelBuffer {
  const width = Math.min(reference.width, current.width);
  const height = Math.min(reference.height, current.height);
  const out = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const refIdx = (y * reference.width + x) * 4;
      const curIdx = (y * current.width + x) * 4;
      const outIdx = (y * width + x) * 4;

      out[outIdx] = Math.abs(
        (reference.data[refIdx] ?? 0) - (current.data[curIdx] ?? 0)
      );
      out[outIdx + 1] = Math.abs(
        (reference.data[refIdx + 1] ?? 0) - (current.data[curIdx + 1] ?? 0)
      );
      out[outIdx + 2] = Math.abs(
        (reference.data[refIdx + 2] ?? 0) - (current.data[curIdx + 2] ?? 0)
      );
      out[outIdx + 3] = 255;
    }
  }

  return { width, height, data: out };
}

/**
 * Estimates normalized 2D translation (translationX, translationY) between a reference
 * and current image buffer using coarse-to-fine Normalized Cross-Correlation (NCC) on luminance.
 * Per spec §5.2: M1 optional alignment suggestion that never hides manual controls.
 */
export function estimateTranslationOffsetNcc(
  reference: PixelBuffer,
  current: PixelBuffer,
  maxShiftRatio = 0.15
): AutoAlignmentSuggestion {
  const w = Math.min(reference.width, current.width);
  const h = Math.min(reference.height, current.height);
  if (w < 8 || h < 8) {
    return { translationX: 0, translationY: 0, nccScore: 0 };
  }

  // Downsample to ~96x64 grid for fast deterministic NCC search
  const stepX = Math.max(1, Math.floor(w / 96));
  const stepY = Math.max(1, Math.floor(h / 64));
  const gw = Math.floor(w / stepX);
  const gh = Math.floor(h / stepY);

  const refLuma = new Float32Array(gw * gh);
  const curLuma = new Float32Array(gw * gh);

  for (let gy = 0; gy < gh; gy++) {
    const py = gy * stepY;
    for (let gx = 0; gx < gw; gx++) {
      const px = gx * stepX;
      const rIdx = (py * reference.width + px) * 4;
      const cIdx = (py * current.width + px) * 4;
      refLuma[gy * gw + gx] =
        0.299 * (reference.data[rIdx] ?? 0) +
        0.587 * (reference.data[rIdx + 1] ?? 0) +
        0.114 * (reference.data[rIdx + 2] ?? 0);
      curLuma[gy * gw + gx] =
        0.299 * (current.data[cIdx] ?? 0) +
        0.587 * (current.data[cIdx + 1] ?? 0) +
        0.114 * (current.data[cIdx + 2] ?? 0);
    }
  }

  const maxDx = Math.max(1, Math.round(gw * maxShiftRatio));
  const maxDy = Math.max(1, Math.round(gh * maxShiftRatio));

  let bestDx = 0;
  let bestDy = 0;
  let bestScore = -Infinity;

  for (let dy = -maxDy; dy <= maxDy; dy++) {
    for (let dx = -maxDx; dx <= maxDx; dx++) {
      let sumRef = 0;
      let sumCur = 0;
      let count = 0;

      const yStart = Math.max(0, -dy);
      const yEnd = Math.min(gh, gh - dy);
      const xStart = Math.max(0, -dx);
      const xEnd = Math.min(gw, gw - dx);

      for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
          sumRef += refLuma[y * gw + x]!;
          sumCur += curLuma[(y + dy) * gw + (x + dx)]!;
          count += 1;
        }
      }

      if (count < 16) continue;
      const meanRef = sumRef / count;
      const meanCur = sumCur / count;

      let num = 0;
      let denRef = 0;
      let denCur = 0;

      for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
          const dr = refLuma[y * gw + x]! - meanRef;
          const dc = curLuma[(y + dy) * gw + (x + dx)]! - meanCur;
          num += dr * dc;
          denRef += dr * dr;
          denCur += dc * dc;
        }
      }

      const denom = Math.sqrt(denRef * denCur);
      const score = denom > 1e-5 ? num / denom : 0;
      if (score > bestScore) {
        bestScore = score;
        bestDx = dx;
        bestDy = dy;
      }
    }
  }

  return {
    translationX: Number(((bestDx * stepX) / w).toFixed(4)),
    translationY: Number(((bestDy * stepY) / h).toFixed(4)),
    nccScore: Number(Math.max(0, Math.min(1, bestScore)).toFixed(3))
  };
}

/**
 * Parses JPEG APP1 EXIF Orientation tag (1..8) from raw file bytes without external libraries.
 * Returns 1 (normal) if no EXIF Orientation tag is present or if file is PNG/WebP.
 */
export function parseJpegExifOrientation(bytes: Uint8Array): number {
  if (bytes.length < 12 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return 1;
  }

  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1]!;
    if (marker === 0xda || marker === 0xd9) break;

    const segLen = ((bytes[offset + 2]! << 8) | bytes[offset + 3]!) & 0xffff;
    if (segLen < 2 || offset + 2 + segLen > bytes.length) break;

    // APP1 marker (0xFFE1) with "Exif\0\0"
    if (
      marker === 0xe1 &&
      segLen >= 14 &&
      bytes[offset + 4] === 0x45 &&
      bytes[offset + 5] === 0x78 &&
      bytes[offset + 6] === 0x69 &&
      bytes[offset + 7] === 0x66 &&
      bytes[offset + 8] === 0x00 &&
      bytes[offset + 9] === 0x00
    ) {
      const tiffStart = offset + 10;
      const littleEndian =
        bytes[tiffStart] === 0x49 && bytes[tiffStart + 1] === 0x49;
      const readU16 = (pos: number): number => {
        if (pos + 2 > bytes.length) return 0;
        return littleEndian
          ? bytes[pos]! | (bytes[pos + 1]! << 8)
          : (bytes[pos]! << 8) | bytes[pos + 1]!;
      };
      const readU32 = (pos: number): number => {
        if (pos + 4 > bytes.length) return 0;
        return littleEndian
          ? (bytes[pos]! |
              (bytes[pos + 1]! << 8) |
              (bytes[pos + 2]! << 16) |
              (bytes[pos + 3]! << 24)) >>>
              0
          : ((bytes[pos]! << 24) |
              (bytes[pos + 1]! << 16) |
              (bytes[pos + 2]! << 8) |
              bytes[pos + 3]!) >>>
              0;
      };

      const ifd0Offset = readU32(tiffStart + 4);
      const ifdStart = tiffStart + ifd0Offset;
      const entryCount = readU16(ifdStart);

      for (let i = 0; i < entryCount; i++) {
        const entryPos = ifdStart + 2 + i * 12;
        if (entryPos + 12 > bytes.length) break;
        const tag = readU16(entryPos);
        if (tag === 0x0112) {
          const val = readU16(entryPos + 8);
          return val >= 1 && val <= 8 ? val : 1;
        }
      }
      return 1;
    }

    offset += 2 + segLen;
  }

  return 1;
}

/**
 * Normalizes an RGBA PixelBuffer according to EXIF Orientation (1..8) so that
 * rotated/flipped photos are upright in standard 3:2/landscape orientation.
 */
export function normalizeBufferByExifOrientation(
  source: PixelBuffer,
  orientation: number
): PixelBuffer {
  if (orientation <= 1 || orientation > 8) {
    return {
      width: source.width,
      height: source.height,
      data: new Uint8ClampedArray(source.data)
    };
  }

  const sw = source.width;
  const sh = source.height;
  const swapDims = orientation >= 5 && orientation <= 8;
  const dw = swapDims ? sh : sw;
  const dh = swapDims ? sw : sh;
  const out = new Uint8ClampedArray(dw * dh * 4);

  for (let sy = 0; sy < sh; sy++) {
    for (let sx = 0; sx < sw; sx++) {
      let dx = sx;
      let dy = sy;
      switch (orientation) {
        case 2: // Flip horizontal
          dx = sw - 1 - sx;
          dy = sy;
          break;
        case 3: // Rotate 180
          dx = sw - 1 - sx;
          dy = sh - 1 - sy;
          break;
        case 4: // Flip vertical
          dx = sx;
          dy = sh - 1 - sy;
          break;
        case 5: // Transpose
          dx = sy;
          dy = sx;
          break;
        case 6: // Rotate 90 CW
          dx = sh - 1 - sy;
          dy = sx;
          break;
        case 7: // Transverse
          dx = sh - 1 - sy;
          dy = sw - 1 - sx;
          break;
        case 8: // Rotate 270 CW
          dx = sy;
          dy = sw - 1 - sx;
          break;
      }

      const sIdx = (sy * sw + sx) * 4;
      const dIdx = (dy * dw + dx) * 4;
      out[dIdx] = source.data[sIdx]!;
      out[dIdx + 1] = source.data[sIdx + 1]!;
      out[dIdx + 2] = source.data[sIdx + 2]!;
      out[dIdx + 3] = source.data[sIdx + 3]!;
    }
  }

  return { width: dw, height: dh, data: out };
}

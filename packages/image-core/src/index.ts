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
      // Smooth S-curve enhancing midtone contrast
      return x * x * (3 - 2 * x);
    }
    case 'MATTE_SHADOW': {
      // Lifted blacks + soft highlights
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
      // Subtle silver-gelatin warm paper tint
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
        // Simulated Bayer RGGB mosaic pattern (2x2 block)
        const colEven = (x & 1) === 0;
        if (rowEven && colEven) {
          // Red photosite
          out[idx] = clampByte(r0 * 0.95);
          out[idx + 1] = clampByte(r0 * 0.14);
          out[idx + 2] = clampByte(r0 * 0.14);
        } else if (!rowEven && !colEven) {
          // Blue photosite
          out[idx] = clampByte(b0 * 0.14);
          out[idx + 1] = clampByte(b0 * 0.18);
          out[idx + 2] = clampByte(b0 * 0.95);
        } else {
          // Green photosites (G1 / G2)
          out[idx] = clampByte(g0 * 0.15);
          out[idx + 1] = clampByte(g0 * 0.92);
          out[idx + 2] = clampByte(g0 * 0.15);
        }
        out[idx + 3] = a0;
        continue;
      }

      if (stage === 'BLACK_LEVEL') {
        // Linear dark-current subtraction & flat uncalibrated sensor look
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
        // Reconstructed RGB prior to white balance & tone curve (desaturated neutral base)
        const avg = (r0 + g0 + b0) / 3;
        out[idx] = clampByte(avg + (r0 - avg) * 0.55);
        out[idx + 1] = clampByte(avg + (g0 - avg) * 0.62 + 6);
        out[idx + 2] = clampByte(avg + (b0 - avg) * 0.52);
        out[idx + 3] = a0;
        continue;
      }

      // Stage >= WHITE_BALANCE
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

      // Stage >= TONE: Apply EV exposure, tone curve, and contrast
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

      // Stage >= FILM_LOOK (FILM_LOOK and JPEG_EXPORT)
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      r = luma + (r - luma) * satFactor;
      g = luma + (g - luma) * satFactor;
      b = luma + (b - luma) * satFactor;

      const [fr, fg, fb] = applyFilmPresetRgb(r, g, b, recipe.filmPreset);
      r = fr;
      g = fg;
      b = fb;

      if (grainScale > 0) {
        // Deterministic pseudo-random film grain based on pixel coordinate
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

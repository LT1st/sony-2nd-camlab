import { describe, expect, it } from 'vitest';
import { DEFAULT_FILM_RECIPE } from '@camera-lab/contracts';
import {
  DARKROOM_STAGES,
  MonotonicJobGuard,
  advanceDevelopStage,
  clampGhostParams,
  computeGhostAffineMatrix,
  createDevelopJob,
  createGhostSession,
  updateGhostSession
} from '@camera-lab/domain';
import {
  computeAbsoluteDifferenceBuffer,
  computeHistogram,
  estimateTranslationOffsetNcc,
  normalizeBufferByExifOrientation,
  parseJpegExifOrientation,
  processStagePixelBuffer
} from '@camera-lab/image-core';

describe('Darkroom Pipeline & Ghost Affine Engine', () => {
  it('produces visually distinct pixel outputs across all 7 darkroom stages (AC-04)', () => {
    const width = 8;
    const height = 6;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 180; // R
      data[i + 1] = 130; // G
      data[i + 2] = 95; // B
      data[i + 3] = 255; // A
    }

    const baseBuffer = { width, height, data };
    const recipe = {
      ...DEFAULT_FILM_RECIPE,
      exposureEv: 0.4,
      temperatureShift: 20,
      contrast: 15,
      grainAmount: 20
    };

    const stageSignatures = new Map<string, string>();
    for (const stage of DARKROOM_STAGES) {
      const out = processStagePixelBuffer(baseBuffer, stage.id, recipe);
      expect(out.width).toBe(width);
      expect(out.height).toBe(height);
      const sig = Array.from(out.data.slice(0, 24)).join(',');
      stageSignatures.set(stage.id, sig);
    }

    expect(stageSignatures.get('RAW_SENSOR')).not.toBe(
      stageSignatures.get('BLACK_LEVEL')
    );
    expect(stageSignatures.get('BLACK_LEVEL')).not.toBe(
      stageSignatures.get('DEMOSAIC')
    );
    expect(stageSignatures.get('DEMOSAIC')).not.toBe(
      stageSignatures.get('WHITE_BALANCE')
    );
    expect(stageSignatures.get('WHITE_BALANCE')).not.toBe(
      stageSignatures.get('TONE')
    );
    expect(stageSignatures.get('TONE')).not.toBe(
      stageSignatures.get('FILM_LOOK')
    );
  });

  it('guards against stale darkroom worker jobs overwriting newer selections', () => {
    const guard = new MonotonicJobGuard();
    const job1 = guard.startNewJob('job-photo-1');
    const job2 = guard.startNewJob('job-photo-2');

    expect(guard.isCurrent(job1.token, job1.jobId)).toBe(false);
    expect(guard.isCurrent(job2.token, job2.jobId)).toBe(true);

    guard.cancelActive();
    expect(guard.isCurrent(job2.token, job2.jobId)).toBe(false);
  });

  it('advances and creates develop jobs cleanly', () => {
    const job = createDevelopJob({
      jobId: 'job-001',
      assetId: 'sample-001',
      mode: 'JPEG_SIMULATION',
      preset: 'WARM_AMBER'
    });
    expect(job.recipe.filmPreset).toBe('WARM_AMBER');
    expect(advanceDevelopStage('RAW_SENSOR', 1)).toBe('BLACK_LEVEL');
    expect(advanceDevelopStage('RAW_SENSOR', -1)).toBe('RAW_SENSOR');
  });

  it('computes repeatable 2D affine matrix and clamps out-of-range Ghost parameters (AC-06)', () => {
    const clamped = clampGhostParams({
      translationX: 99,
      translationY: -99,
      scale: 0.001,
      rotationDeg: 400,
      opacity: 2
    });
    expect(clamped.translationX).toBe(2);
    expect(clamped.translationY).toBe(-2);
    expect(clamped.scale).toBe(0.1);
    expect(clamped.rotationDeg).toBe(180);
    expect(clamped.opacity).toBe(1);

    const m1 = computeGhostAffineMatrix(
      {
        translationX: 0.1,
        translationY: -0.05,
        scale: 1.2,
        rotationDeg: 10,
        opacity: 0.5
      },
      960,
      640
    );
    const m2 = computeGhostAffineMatrix(
      {
        translationX: 0.1,
        translationY: -0.05,
        scale: 1.2,
        rotationDeg: 10,
        opacity: 0.5
      },
      960,
      640
    );
    expect(m1).toEqual(m2);
    expect(m1.a).toBeCloseTo(1.2 * Math.cos((10 * Math.PI) / 180), 4);

    let session = createGhostSession({
      id: 'gs-1',
      name: 'Test Pair',
      referenceAssetId: 'sample-011',
      currentAssetId: 'sample-012'
    });
    session = updateGhostSession(session, {
      rotationDeg: 10,
      scale: 1.2,
      translationX: 0.08
    });
    expect(session.rotationDeg).toBe(10);
    expect(session.scale).toBe(1.2);
    expect(session.version).toBe(2);
  });

  it('computes pixel difference buffer for Ghost difference view', () => {
    const a = {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray([100, 100, 100, 255, 50, 50, 50, 255, 0, 0, 0, 255, 255, 255, 255, 255])
    };
    const b = {
      width: 2,
      height: 2,
      data: new Uint8ClampedArray([80, 110, 100, 255, 50, 50, 50, 255, 10, 10, 10, 255, 200, 200, 200, 255])
    };
    const diff = computeAbsoluteDifferenceBuffer(a, b);
    expect(diff.data[0]).toBe(20);
    expect(diff.data[1]).toBe(10);
    expect(diff.data[2]).toBe(0);
  });

  it('computes 256-bin RGB & Luminance histogram, dynamic range stops, and clipping telemetry', () => {
    const width = 4;
    const height = 4;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < data.length; i += 4) {
      const idx = i / 4;
      if (idx === 0) {
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
      } else if (idx === 15) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
      } else {
        data[i] = 128;
        data[i + 1] = 128;
        data[i + 2] = 128;
      }
      data[i + 3] = 255;
    }

    const hist = computeHistogram({ width, height, data });
    expect(hist.r).toHaveLength(256);
    expect(hist.luma).toHaveLength(256);
    expect(hist.r[0]).toBe(1);
    expect(hist.r[128]).toBe(14);
    expect(hist.r[255]).toBe(1);
    expect(hist.shadowClipPercent).toBeGreaterThan(0);
    expect(hist.highlightClipPercent).toBeGreaterThan(0);
    expect(hist.dynamicRangeStops).toBeGreaterThan(7);
  });

  it('estimates translation offset via Normalized Cross-Correlation (NCC) and parses/normalizes EXIF orientation', () => {
    const w = 32;
    const h = 32;
    const ref = new Uint8ClampedArray(w * h * 4);
    const cur = new Uint8ClampedArray(w * h * 4);

    // Draw a bright feature block at (12, 10) in ref and shifted to (14, 11) in cur
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const inRefBox = x >= 10 && x <= 16 && y >= 8 && y <= 14;
        const inCurBox = x >= 12 && x <= 18 && y >= 9 && y <= 15;
        const rv = inRefBox ? 230 : 30;
        const cv = inCurBox ? 230 : 30;
        ref[idx] = rv;
        ref[idx + 1] = rv;
        ref[idx + 2] = rv;
        ref[idx + 3] = 255;
        cur[idx] = cv;
        cur[idx + 1] = cv;
        cur[idx + 2] = cv;
        cur[idx + 3] = 255;
      }
    }

    const suggestion = estimateTranslationOffsetNcc(
      { width: w, height: h, data: ref },
      { width: w, height: h, data: cur }
    );
    expect(suggestion.nccScore).toBeGreaterThan(0.8);
    expect(suggestion.translationX).toBeGreaterThan(0);

    // Build minimal synthetic JPEG header with little-endian EXIF Orientation = 6 (90 CW)
    const exifBytes = new Uint8Array([
      0xff, 0xd8, // SOI
      0xff, 0xe1, 0x00, 0x1e, // APP1 length 30
      0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, // TIFF II header, offset 8
      0x01, 0x00, // 1 IFD entry
      0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, 0x06, 0x00, 0x00, 0x00, // Tag 0x0112 = 6
      0xff, 0xd9 // EOI
    ]);
    expect(parseJpegExifOrientation(exifBytes)).toBe(6);

    // Normalize 2x1 buffer with orientation 6 -> becomes 1x2 rotated
    const src2x1 = {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([10, 20, 30, 255, 200, 210, 220, 255])
    };
    const rotated = normalizeBufferByExifOrientation(src2x1, 6);
    expect(rotated.width).toBe(1);
    expect(rotated.height).toBe(2);
    expect(rotated.data[0]).toBe(10);
    expect(rotated.data[4]).toBe(200);
  });
});

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
});

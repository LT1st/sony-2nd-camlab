import { describe, expect, it } from 'vitest';
import {
  CameraCapabilitiesSchema,
  CaptureResultSchema,
  DiagnosticEventSchema,
  FilmRollSchema,
  GhostSessionSchema
} from '@camera-lab/contracts';
import {
  applyCaptureCompleted,
  archiveFilmRoll,
  assertCanReviewRoll,
  completeDevelopingRoll,
  createFilmRoll,
  getRemainingFrames,
  interruptDevelopingRoll,
  replayEventsJsonl,
  sealFilmRoll,
  startDevelopingRoll
} from '@camera-lab/domain';
import canonicalVectors from '../../packages/contracts/fixtures/canonical-vectors.json';

describe('Film OS Domain & Contracts', () => {
  it('validates canonical cross-platform contract fixtures', () => {
    expect(() =>
      FilmRollSchema.parse(canonicalVectors.filmRoll)
    ).not.toThrow();
    expect(() =>
      CaptureResultSchema.parse(canonicalVectors.captureResult)
    ).not.toThrow();
    expect(() =>
      CameraCapabilitiesSchema.parse(canonicalVectors.capabilities)
    ).not.toThrow();
    expect(() =>
      GhostSessionSchema.parse(canonicalVectors.ghostSession)
    ).not.toThrow();
    expect(() =>
      DiagnosticEventSchema.parse(canonicalVectors.diagnosticEvent)
    ).not.toThrow();
  });

  it('creates a 12-frame roll, exposes 3 frames, blocks review before develop, and seals/develops/archives', () => {
    let roll = createFilmRoll({
      id: 'roll-12',
      name: 'Portra 400',
      capacity: 12,
      preset: 'CLASSIC_COLOR',
      strictMode: true
    });

    expect(roll.status).toBe('LOADED');
    expect(getRemainingFrames(roll)).toBe(12);

    // Expose 3 frames
    for (let i = 1; i <= 3; i++) {
      const outcome = applyCaptureCompleted(roll, {
        captureId: `cap-00${i}`,
        rollId: 'roll-12'
      });
      roll = outcome.roll;
      expect(outcome.deduplicated).toBe(false);
    }

    expect(roll.frameIds).toHaveLength(3);
    expect(getRemainingFrames(roll)).toBe(9);

    // Strict mode blocks review before development (AC-02)
    expect(() => assertCanReviewRoll(roll)).toThrowError(
      /本卷冲洗前不可回看/
    );

    // Seal roll early, interrupt develop, then complete develop
    roll = sealFilmRoll(roll);
    expect(roll.status).toBe('SEALED');

    roll = startDevelopingRoll(roll);
    expect(roll.status).toBe('DEVELOPING');

    roll = interruptDevelopingRoll(roll);
    expect(roll.status).toBe('SEALED');

    roll = startDevelopingRoll(roll);
    roll = completeDevelopingRoll(roll);
    expect(roll.status).toBe('DEVELOPED');

    // Review is allowed once developed (AC-03)
    expect(() => assertCanReviewRoll(roll)).not.toThrow();

    roll = archiveFilmRoll(roll);
    expect(roll.status).toBe('ARCHIVED');
  });

  it('enforces idempotency when duplicate capture.completed events arrive (AC-08)', () => {
    const roll = createFilmRoll({
      id: 'roll-dup',
      name: 'Dup Test',
      capacity: 12
    });

    const first = applyCaptureCompleted(roll, {
      captureId: 'cap-same-id',
      rollId: 'roll-dup'
    });
    expect(first.deduplicated).toBe(false);
    expect(first.roll.frameIds).toHaveLength(1);

    const second = applyCaptureCompleted(first.roll, {
      captureId: 'cap-same-id',
      rollId: 'roll-dup'
    });
    expect(second.deduplicated).toBe(true);
    expect(second.roll.frameIds).toHaveLength(1);
  });

  it('auto-seals roll when 12th frame is exposed and rejects 13th frame', () => {
    let roll = createFilmRoll({
      id: 'roll-auto',
      name: 'Auto Seal',
      capacity: 12
    });

    for (let i = 1; i <= 12; i++) {
      const res = applyCaptureCompleted(roll, {
        captureId: `cap-${i}`,
        rollId: 'roll-auto'
      });
      roll = res.roll;
      if (i === 12) {
        expect(res.autoSealed).toBe(true);
      }
    }

    expect(roll.status).toBe('SEALED');
    expect(getRemainingFrames(roll)).toBe(0);

    expect(() =>
      applyCaptureCompleted(roll, {
        captureId: 'cap-13',
        rollId: 'roll-auto'
      })
    ).toThrowError(/Cannot expose frame on roll in status SEALED/);
  });

  it('replays JSONL event stream deterministically', () => {
    const jsonl = [
      JSON.stringify({
        timestamp: '2026-11-09T08:00:00.000Z',
        sessionId: 's1',
        eventId: 'e1',
        level: 'INFO',
        domain: 'FILM',
        name: 'roll.created',
        rollId: 'r1',
        adapter: 'MOCK',
        details: { rollId: 'r1', name: 'Test', capacity: 12 }
      }),
      JSON.stringify({
        timestamp: '2026-11-09T08:00:01.000Z',
        sessionId: 's1',
        eventId: 'e2',
        level: 'INFO',
        domain: 'FILM',
        name: 'capture.completed',
        rollId: 'r1',
        captureId: 'c1',
        adapter: 'MOCK',
        details: {}
      }),
      JSON.stringify({
        timestamp: '2026-11-09T08:00:02.000Z',
        sessionId: 's1',
        eventId: 'e3',
        level: 'WARN',
        domain: 'FILM',
        name: 'capture.completed',
        rollId: 'r1',
        captureId: 'c1',
        adapter: 'MOCK',
        details: {}
      })
    ].join('\n');

    const summary = replayEventsJsonl(jsonl);
    expect(summary.appliedEventsCount).toBe(3);
    expect(summary.deduplicatedCapturesCount).toBe(1);
    expect(summary.rolls.r1?.frameIds).toEqual(['c1']);
  });
});

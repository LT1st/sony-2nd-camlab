import {
  type CaptureResult,
  CaptureResultSchema,
  type DiagnosticEvent,
  DiagnosticEventSchema,
  type FilmPreset,
  type FilmRoll,
  type FilmRollCapacity
} from '@camera-lab/contracts';
import {
  applyCaptureCompleted,
  archiveFilmRoll,
  completeDevelopingRoll,
  createFilmRoll,
  interruptDevelopingRoll,
  sealFilmRoll,
  startDevelopingRoll
} from '../film/index.js';

export interface ReplayStateSummary {
  rolls: Record<string, FilmRoll>;
  capturesByRoll: Record<string, CaptureResult[]>;
  activeRollId: string | null;
  appliedEventsCount: number;
  deduplicatedCapturesCount: number;
  failedCapturesCount: number;
  errors: string[];
}

export function replayEventsJsonl(jsonlText: string): ReplayStateSummary {
  const lines = jsonlText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));

  const events: DiagnosticEvent[] = [];
  const parseErrors: string[] = [];

  for (let idx = 0; idx < lines.length; idx++) {
    try {
      const parsed = DiagnosticEventSchema.parse(JSON.parse(lines[idx]!));
      events.push(parsed);
    } catch (err) {
      parseErrors.push(
        `Line ${idx + 1}: ${err instanceof Error ? err.message : 'Invalid JSONL event'}`
      );
    }
  }

  const summary = replayDiagnosticEvents(events);
  if (parseErrors.length > 0) {
    summary.errors.unshift(...parseErrors);
  }
  return summary;
}

export function replayDiagnosticEvents(
  events: DiagnosticEvent[]
): ReplayStateSummary {
  const rolls: Record<string, FilmRoll> = {};
  const capturesByRoll: Record<string, CaptureResult[]> = {};
  let activeRollId: string | null = null;
  let appliedEventsCount = 0;
  let deduplicatedCapturesCount = 0;
  let failedCapturesCount = 0;
  const errors: string[] = [];

  for (const evt of events) {
    appliedEventsCount += 1;
    const rollId =
      evt.rollId ??
      (typeof evt.details.rollId === 'string' ? evt.details.rollId : undefined);

    try {
      if (evt.name === 'roll.created' && rollId) {
        const capacityRaw = Number(evt.details.capacity ?? 12);
        const capacity: FilmRollCapacity =
          capacityRaw === 24 || capacityRaw === 36 ? capacityRaw : 12;
        const preset =
          typeof evt.details.preset === 'string'
            ? (evt.details.preset as FilmPreset)
            : 'CLASSIC_COLOR';
        const name =
          typeof evt.details.name === 'string'
            ? evt.details.name
            : `Roll ${rollId}`;
        const strictMode =
          typeof evt.details.strictMode === 'boolean'
            ? evt.details.strictMode
            : true;

        rolls[rollId] = createFilmRoll({
          id: rollId,
          name,
          capacity,
          preset,
          strictMode,
          nowIso: evt.timestamp
        });
        capturesByRoll[rollId] = capturesByRoll[rollId] ?? [];
        activeRollId = rollId;
      } else if (evt.name === 'capture.completed' && rollId) {
        const targetRoll = rolls[rollId];
        const captureId =
          evt.captureId ??
          (typeof evt.details.captureId === 'string'
            ? evt.details.captureId
            : undefined);
        if (!targetRoll || !captureId) {
          errors.push(`Missing roll or captureId on event ${evt.eventId}`);
          continue;
        }
        const outcome = applyCaptureCompleted(
          targetRoll,
          { captureId, rollId },
          evt.timestamp
        );
        rolls[rollId] = outcome.roll;
        if (outcome.deduplicated) {
          deduplicatedCapturesCount += 1;
        } else {
          const assetId =
            typeof evt.details.assetId === 'string'
              ? evt.details.assetId
              : 'sample-001';
          const frameIndex = outcome.roll.frameIds.length;
          const captureRecord = CaptureResultSchema.parse({
            captureId,
            rollId,
            frameIndex,
            assetId,
            capturedAt: evt.timestamp,
            source: evt.adapter,
            mode: 'JPEG_SIMULATION',
            originalPreserved: true,
            exposureMeta: {
              shutterSpeed: '1/250',
              aperture: 'f/2.8',
              iso: 400,
              focalLengthMm: 35
            }
          });
          const list = capturesByRoll[rollId] ?? [];
          capturesByRoll[rollId] = [...list, captureRecord];
        }
      } else if (evt.name === 'capture.failed') {
        failedCapturesCount += 1;
      } else if (evt.name === 'roll.sealed' && rollId && rolls[rollId]) {
        rolls[rollId] = sealFilmRoll(rolls[rollId]!, evt.timestamp);
      } else if (evt.name === 'develop.started' && rollId && rolls[rollId]) {
        rolls[rollId] = startDevelopingRoll(rolls[rollId]!, evt.timestamp);
      } else if (evt.name === 'develop.interrupted' && rollId && rolls[rollId]) {
        rolls[rollId] = interruptDevelopingRoll(rolls[rollId]!, evt.timestamp);
      } else if (evt.name === 'develop.completed' && rollId && rolls[rollId]) {
        rolls[rollId] = completeDevelopingRoll(rolls[rollId]!, evt.timestamp);
      } else if (evt.name === 'roll.archived' && rollId && rolls[rollId]) {
        rolls[rollId] = archiveFilmRoll(rolls[rollId]!, evt.timestamp);
      }
    } catch (err) {
      errors.push(
        err instanceof Error ? err.message : `Replay error at ${evt.eventId}`
      );
    }
  }

  return {
    rolls,
    capturesByRoll,
    activeRollId,
    appliedEventsCount,
    deduplicatedCapturesCount,
    failedCapturesCount,
    errors
  };
}

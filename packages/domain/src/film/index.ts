import {
  type CaptureResult,
  type ErrorCode,
  type FilmPreset,
  type FilmRoll,
  type FilmRollCapacity,
  FilmRollSchema
} from '@camera-lab/contracts';
import { createMachine } from 'xstate';

export class DomainRuleError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'DomainRuleError';
    this.code = code;
  }
}

export interface CreateFilmRollInput {
  id: string;
  name: string;
  capacity: FilmRollCapacity;
  preset?: FilmPreset;
  strictMode?: boolean;
  nowIso?: string;
}

export function createFilmRoll(input: CreateFilmRollInput): FilmRoll {
  const now = input.nowIso ?? new Date().toISOString();
  return FilmRollSchema.parse({
    id: input.id,
    name: input.name.trim() || 'Untitled Roll',
    capacity: input.capacity,
    preset: input.preset ?? 'CLASSIC_COLOR',
    strictMode: input.strictMode ?? true,
    status: 'LOADED',
    frameIds: [],
    createdAt: now,
    updatedAt: now,
    version: 1
  });
}

export interface CaptureTransitionOutcome {
  roll: FilmRoll;
  deduplicated: boolean;
  autoSealed: boolean;
  remainingFrames: number;
}

export function applyCaptureCompleted(
  roll: FilmRoll,
  capture: Pick<CaptureResult, 'captureId' | 'rollId'>,
  nowIso?: string
): CaptureTransitionOutcome {
  if (roll.id !== capture.rollId) {
    throw new DomainRuleError(
      'ROLL_NOT_LOADED',
      `Capture rollId (${capture.rollId}) does not match active roll (${roll.id}).`
    );
  }

  // Idempotency check BEFORE status check so duplicate events arriving after auto-seal remain idempotent
  if (roll.frameIds.includes(capture.captureId)) {
    return {
      roll,
      deduplicated: true,
      autoSealed: roll.status === 'SEALED',
      remainingFrames: Math.max(0, roll.capacity - roll.frameIds.length)
    };
  }

  if (roll.status !== 'LOADED') {
    throw new DomainRuleError(
      'ROLL_ALREADY_SEALED',
      `Cannot expose frame on roll in status ${roll.status}.`
    );
  }

  const nextFrames = [...roll.frameIds, capture.captureId];
  const isFull = nextFrames.length >= roll.capacity;
  const nextStatus = isFull ? 'SEALED' : 'LOADED';
  const updated: FilmRoll = {
    ...roll,
    frameIds: nextFrames,
    status: nextStatus,
    updatedAt: nowIso ?? new Date().toISOString(),
    version: roll.version + 1
  };

  return {
    roll: updated,
    deduplicated: false,
    autoSealed: isFull,
    remainingFrames: Math.max(0, updated.capacity - updated.frameIds.length)
  };
}

export function sealFilmRoll(roll: FilmRoll, nowIso?: string): FilmRoll {
  if (roll.status === 'SEALED') {
    return roll;
  }
  if (roll.status !== 'LOADED') {
    throw new DomainRuleError(
      'ROLL_ALREADY_SEALED',
      `Only a LOADED roll can be sealed (current: ${roll.status}).`
    );
  }
  return {
    ...roll,
    status: 'SEALED',
    updatedAt: nowIso ?? new Date().toISOString(),
    version: roll.version + 1
  };
}

export function startDevelopingRoll(roll: FilmRoll, nowIso?: string): FilmRoll {
  if (roll.status !== 'SEALED' && roll.status !== 'DEVELOPING') {
    throw new DomainRuleError(
      'ROLL_NOT_LOADED',
      `Roll must be SEALED before developing (current: ${roll.status}).`
    );
  }
  return {
    ...roll,
    status: 'DEVELOPING',
    updatedAt: nowIso ?? new Date().toISOString(),
    version: roll.version + 1
  };
}

export function interruptDevelopingRoll(roll: FilmRoll, nowIso?: string): FilmRoll {
  if (roll.status !== 'DEVELOPING') {
    return roll;
  }
  return {
    ...roll,
    status: 'SEALED',
    updatedAt: nowIso ?? new Date().toISOString(),
    version: roll.version + 1
  };
}

export function completeDevelopingRoll(roll: FilmRoll, nowIso?: string): FilmRoll {
  if (roll.status !== 'DEVELOPING' && roll.status !== 'SEALED') {
    throw new DomainRuleError(
      'DEVELOP_INTERRUPTED',
      `Roll must be DEVELOPING or SEALED to complete development (current: ${roll.status}).`
    );
  }
  return {
    ...roll,
    status: 'DEVELOPED',
    updatedAt: nowIso ?? new Date().toISOString(),
    version: roll.version + 1
  };
}

export function archiveFilmRoll(roll: FilmRoll, nowIso?: string): FilmRoll {
  if (roll.status !== 'DEVELOPED') {
    throw new DomainRuleError(
      'ROLL_NOT_LOADED',
      `Only DEVELOPED rolls can be archived (current: ${roll.status}).`
    );
  }
  return {
    ...roll,
    status: 'ARCHIVED',
    updatedAt: nowIso ?? new Date().toISOString(),
    version: roll.version + 1
  };
}

export function assertCanReviewRoll(roll: FilmRoll): void {
  if (
    roll.strictMode &&
    (roll.status === 'EMPTY' ||
      roll.status === 'LOADED' ||
      roll.status === 'SEALED' ||
      roll.status === 'DEVELOPING')
  ) {
    throw new DomainRuleError(
      'REVIEW_LOCKED_BEFORE_DEVELOP',
      '本卷冲洗前不可回看（原始拍摄数据已在后台安全保留，封卷并完成显影冲洗后可查看接触印样）。'
    );
  }
}

export function getRemainingFrames(roll: FilmRoll): number {
  return Math.max(0, roll.capacity - roll.frameIds.length);
}

export const filmRollStateMachine = createMachine({
  id: 'filmRoll',
  initial: 'EMPTY',
  states: {
    EMPTY: {
      on: {
        LOAD: 'LOADED'
      }
    },
    LOADED: {
      on: {
        SEAL: 'SEALED'
      }
    },
    SEALED: {
      on: {
        START_DEVELOP: 'DEVELOPING'
      }
    },
    DEVELOPING: {
      on: {
        INTERRUPT_DEVELOP: 'SEALED',
        COMPLETE_DEVELOP: 'DEVELOPED'
      }
    },
    DEVELOPED: {
      on: {
        ARCHIVE: 'ARCHIVED'
      }
    },
    ARCHIVED: {
      type: 'final'
    }
  }
});

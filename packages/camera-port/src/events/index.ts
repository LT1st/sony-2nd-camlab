import type { CaptureResult, ErrorCode } from '@camera-lab/contracts';

export type PhysicalKeyCode =
  | 'KEY_UP'
  | 'KEY_DOWN'
  | 'KEY_LEFT'
  | 'KEY_RIGHT'
  | 'KEY_ENTER'
  | 'KEY_MENU'
  | 'KEY_DELETE'
  | 'KEY_S1'
  | 'KEY_S2'
  | 'DIAL_CW'
  | 'DIAL_CCW'
  | 'KEY_FN'
  | 'KEY_PLAY';

export type CameraEvent =
  | {
      type: 'session.opened';
      sessionId: string;
      timestamp: string;
    }
  | {
      type: 'session.closed';
      sessionId: string;
      timestamp: string;
    }
  | {
      type: 'capture.requested';
      captureId: string;
      rollId: string;
      timestamp: string;
    }
  | {
      type: 'capture.started';
      captureId: string;
      rollId: string;
      assetId: string;
      timestamp: string;
    }
  | {
      type: 'capture.completed';
      captureId: string;
      rollId: string;
      result: CaptureResult;
      durationMs: number;
      timestamp: string;
    }
  | {
      type: 'capture.failed';
      captureId: string;
      rollId: string;
      errorCode: ErrorCode;
      message: string;
      timestamp: string;
    }
  | {
      type: 'key.pressed';
      key: PhysicalKeyCode;
      scanCode: number;
      timestamp: string;
    };

export class CameraPortError extends Error {
  readonly code: ErrorCode;
  readonly recoverable: boolean;

  constructor(code: ErrorCode, message: string, recoverable = true) {
    super(message);
    this.name = 'CameraPortError';
    this.code = code;
    this.recoverable = recoverable;
  }
}

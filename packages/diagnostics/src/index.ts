import {
  type CameraCapabilities,
  type DiagnosticDomain,
  type DiagnosticEvent,
  DiagnosticEventSchema,
  type DiagnosticLevel,
  type ErrorCode
} from '@camera-lab/contracts';
import { strToU8, zipSync } from 'fflate';

export interface DiagnosticsPort {
  emit(
    event: Omit<DiagnosticEvent, 'timestamp' | 'sessionId' | 'eventId'> & {
      timestamp?: string;
      sessionId?: string;
      eventId?: string;
    }
  ): DiagnosticEvent;
  listEvents(filter?: {
    domain?: DiagnosticDomain;
    namePrefix?: string;
    level?: DiagnosticLevel;
  }): DiagnosticEvent[];
  subscribe(listener: (events: DiagnosticEvent[]) => void): () => void;
  toJsonl(): string;
  clear(): void;
  exportBundle(options: DiagnosticsBundleOptions): Promise<Uint8Array>;
}

export interface DiagnosticsBundleOptions {
  includeImages?: boolean;
  appState: Record<string, unknown>;
  capabilities: CameraCapabilities;
  assetManifest: unknown;
  reproSteps?: string[];
  randomSeed?: string;
}

const FORBIDDEN_DETAIL_KEYS = new Set([
  'dataUrl',
  'rawBytes',
  'imageBlob',
  'gpsLatitude',
  'gpsLongitude',
  'localFilePath',
  'secretKey'
]);

export function sanitizeDetails(
  details: Record<string, unknown>
): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (FORBIDDEN_DETAIL_KEYS.has(key)) {
      clean[key] = '[REDACTED_BY_POLICY]';
      continue;
    }
    if (typeof value === 'string' && value.startsWith('data:image/')) {
      clean[key] = '[IMAGE_DATA_URL_OMITTED]';
      continue;
    }
    clean[key] = value;
  }
  return clean;
}

export class DiagnosticsManager implements DiagnosticsPort {
  private readonly maxBufferSize: number;
  private readonly sessionId: string;
  private events: DiagnosticEvent[] = [];
  private listeners = new Set<(events: DiagnosticEvent[]) => void>();
  private counter = 0;

  constructor(options?: { maxBufferSize?: number; sessionId?: string }) {
    this.maxBufferSize = options?.maxBufferSize ?? 1000;
    this.sessionId =
      options?.sessionId ?? `session-${Date.now().toString(36)}-camlab`;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  emit(
    input: Omit<DiagnosticEvent, 'timestamp' | 'sessionId' | 'eventId'> & {
      timestamp?: string;
      sessionId?: string;
      eventId?: string;
      errorCode?: ErrorCode;
    }
  ): DiagnosticEvent {
    this.counter += 1;
    const rawEvent: DiagnosticEvent = {
      timestamp: input.timestamp ?? new Date().toISOString(),
      sessionId: input.sessionId ?? this.sessionId,
      eventId:
        input.eventId ??
        `evt-${String(this.counter).padStart(4, '0')}-${Date.now().toString(36)}`,
      level: input.level,
      domain: input.domain,
      name: input.name,
      rollId: input.rollId,
      captureId: input.captureId,
      durationMs: input.durationMs,
      errorCode: input.errorCode,
      adapter: input.adapter,
      stateBefore: input.stateBefore,
      stateAfter: input.stateAfter,
      details: sanitizeDetails(input.details ?? {})
    };

    const validated = DiagnosticEventSchema.parse(rawEvent);
    this.events.push(validated);
    if (this.events.length > this.maxBufferSize) {
      this.events.shift();
    }
    this.notify();
    return validated;
  }

  listEvents(filter?: {
    domain?: DiagnosticDomain;
    namePrefix?: string;
    level?: DiagnosticLevel;
  }): DiagnosticEvent[] {
    if (!filter) {
      return [...this.events];
    }
    return this.events.filter((evt) => {
      if (filter.domain && evt.domain !== filter.domain) return false;
      if (filter.level && evt.level !== filter.level) return false;
      if (filter.namePrefix && !evt.name.startsWith(filter.namePrefix)) {
        return false;
      }
      return true;
    });
  }

  subscribe(listener: (events: DiagnosticEvent[]) => void): () => void {
    this.listeners.add(listener);
    listener([...this.events]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  toJsonl(): string {
    return this.events.map((e) => JSON.stringify(e)).join('\n');
  }

  clear(): void {
    this.events = [];
    this.notify();
  }

  async exportBundle(options: DiagnosticsBundleOptions): Promise<Uint8Array> {
    const sanitizedState = JSON.parse(
      JSON.stringify(options.appState, (key, val) => {
        if (!options.includeImages && typeof val === 'string' && val.startsWith('data:image/')) {
          return '[OMITTED_PRIVATE_IMAGE_DATA]';
        }
        if (FORBIDDEN_DETAIL_KEYS.has(key)) {
          return '[REDACTED]';
        }
        return val;
      })
    );

    const reproLines = [
      '# Camera Lab Diagnostic Reproduction Bundle',
      `Generated At: ${new Date().toISOString()}`,
      `Session ID: ${this.sessionId}`,
      `Random Seed: ${options.randomSeed ?? 'deterministic-seed-2026'}`,
      `Include Private Images: ${Boolean(options.includeImages)}`,
      '',
      '## Recent Events Summary',
      ...(options.reproSteps ??
        this.events.slice(-25).map(
          (e, idx) =>
            `${idx + 1}. [${e.timestamp}] (${e.level}) ${e.domain}/${e.name} ${
              e.captureId ? `captureId=${e.captureId}` : ''
            } ${e.errorCode ? `errorCode=${e.errorCode}` : ''}`.trim()
        ))
    ];

    const toPlainBytes = (text: string) => new Uint8Array(strToU8(text));
    const archive = zipSync({
      'logs.jsonl': toPlainBytes(this.toJsonl() + '\n'),
      'app-state.json': toPlainBytes(JSON.stringify(sanitizedState, null, 2)),
      'capabilities.json': toPlainBytes(
        JSON.stringify(options.capabilities, null, 2)
      ),
      'asset-manifest.json': toPlainBytes(
        JSON.stringify(options.assetManifest, null, 2)
      ),
      'repro-steps.txt': toPlainBytes(reproLines.join('\n') + '\n')
    });

    return archive;
  }

  private notify(): void {
    const snapshot = [...this.events];
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

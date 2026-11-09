import type { DarkroomStageId, FilmRecipe } from '@camera-lab/contracts';
import { MonotonicJobGuard } from '@camera-lab/domain';
import {
  computeHistogram,
  type ImageHistogram,
  processStagePixelBuffer
} from '@camera-lab/image-core';
import type {
  DarkroomWorkerRequest,
  DarkroomWorkerResponse
} from './darkroom.worker.js';

export interface ProcessedStageResult {
  jobId: string;
  imageData: ImageData;
  durationMs: number;
  stale: boolean;
  histogram: ImageHistogram;
}

export class DarkroomProcessorClient {
  private worker: Worker | null = null;
  private readonly guard = new MonotonicJobGuard();
  private pendingResolvers = new Map<
    number,
    (res: DarkroomWorkerResponse) => void
  >();
  private queueDepth = 0;
  private lastDurationMs = 14;

  constructor() {
    if (typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(
          new URL('./darkroom.worker.ts', import.meta.url),
          { type: 'module' }
        );
        this.worker.onmessage = (
          evt: MessageEvent<DarkroomWorkerResponse>
        ) => {
          const resp = evt.data;
          const resolver = this.pendingResolvers.get(resp.token);
          if (resolver) {
            this.pendingResolvers.delete(resp.token);
            resolver(resp);
          }
        };
      } catch {
        this.worker = null;
      }
    }
  }

  getMetrics(): { queueDepth: number; lastDurationMs: number } {
    return {
      queueDepth: this.queueDepth,
      lastDurationMs: this.lastDurationMs
    };
  }

  cancelPending(): void {
    this.guard.cancelActive();
    this.pendingResolvers.clear();
    this.queueDepth = 0;
  }

  async processStage(params: {
    jobId: string;
    sourceImageData: ImageData;
    stage: DarkroomStageId;
    recipe: FilmRecipe;
  }): Promise<ProcessedStageResult> {
    const { token, jobId } = this.guard.startNewJob(params.jobId);
    this.queueDepth += 1;

    try {
      if (this.worker) {
        const cloned = new Uint8ClampedArray(params.sourceImageData.data);
        const req: DarkroomWorkerRequest = {
          jobId,
          token,
          width: params.sourceImageData.width,
          height: params.sourceImageData.height,
          buffer: cloned.buffer,
          stage: params.stage,
          recipe: params.recipe
        };

        const workerResponse = await new Promise<DarkroomWorkerResponse>(
          (resolve) => {
            this.pendingResolvers.set(token, resolve);
            this.worker!.postMessage(req, [req.buffer]);
          }
        );

        this.lastDurationMs = workerResponse.durationMs;
        const isCurrent = this.guard.isCurrent(token, jobId);
        return {
          jobId,
          imageData: new ImageData(
            new Uint8ClampedArray(workerResponse.buffer),
            workerResponse.width,
            workerResponse.height
          ),
          durationMs: workerResponse.durationMs,
          stale: !isCurrent,
          histogram: workerResponse.histogram
        };
      }

      // Fallback when Worker is unavailable
      const start = performance.now();
      const out = processStagePixelBuffer(
        {
          width: params.sourceImageData.width,
          height: params.sourceImageData.height,
          data: params.sourceImageData.data
        },
        params.stage,
        params.recipe
      );
      const histogram = computeHistogram(out);
      const durationMs = Math.max(1, Math.round(performance.now() - start));
      this.lastDurationMs = durationMs;
      const isCurrent = this.guard.isCurrent(token, jobId);
      return {
        jobId,
        imageData: new ImageData(
          new Uint8ClampedArray(out.data),
          out.width,
          out.height
        ),
        durationMs,
        stale: !isCurrent,
        histogram
      };
    } finally {
      this.queueDepth = Math.max(0, this.queueDepth - 1);
    }
  }
}

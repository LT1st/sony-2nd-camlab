import type { DarkroomStageId, FilmRecipe } from '@camera-lab/contracts';
import { processStagePixelBuffer } from '@camera-lab/image-core';

export interface DarkroomWorkerRequest {
  jobId: string;
  token: number;
  width: number;
  height: number;
  buffer: ArrayBuffer;
  stage: DarkroomStageId;
  recipe: FilmRecipe;
}

export interface DarkroomWorkerResponse {
  jobId: string;
  token: number;
  width: number;
  height: number;
  buffer: ArrayBuffer;
  durationMs: number;
}

self.onmessage = (evt: MessageEvent<DarkroomWorkerRequest>) => {
  const req = evt.data;
  const start = performance.now();
  const inputData = new Uint8ClampedArray(req.buffer);
  const processed = processStagePixelBuffer(
    {
      width: req.width,
      height: req.height,
      data: inputData
    },
    req.stage,
    req.recipe
  );
  const durationMs = Math.max(1, Math.round(performance.now() - start));
  const outBuffer = processed.data.buffer;

  const response: DarkroomWorkerResponse = {
    jobId: req.jobId,
    token: req.token,
    width: processed.width,
    height: processed.height,
    buffer: outBuffer,
    durationMs
  };

  (self as unknown as Worker).postMessage(response, [outBuffer]);
};

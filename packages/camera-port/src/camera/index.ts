import type {
  CameraCapabilities,
  CaptureResult,
  ExposureMeta,
  ImagePipelineMode
} from '@camera-lab/contracts';
import type { CameraEvent } from '../events/index.js';

export interface PreviewFrame {
  frameId: string;
  assetId: string;
  title: string;
  previewUrl: string;
  width: number;
  height: number;
  timestamp: string;
  simulatedLiveView: true;
  exposureMeta: ExposureMeta;
}

export interface CaptureRequest {
  captureId: string;
  rollId: string;
  frameIndex: number;
  requestedAssetId?: string;
  mode?: ImagePipelineMode;
  exposureMeta?: Partial<ExposureMeta>;
}

export interface CameraPort {
  getCapabilities(): Promise<CameraCapabilities>;
  openSession(): Promise<{ sessionId: string }>;
  closeSession(): Promise<void>;
  getPreviewFrame(): Promise<PreviewFrame>;
  advancePreviewSample(direction?: 1 | -1): Promise<PreviewFrame>;
  selectPreviewSample(assetId: string): Promise<PreviewFrame>;
  capturePhoto(request: CaptureRequest): Promise<CaptureResult>;
  subscribeEvents(handler: (evt: CameraEvent) => void): () => void;
}

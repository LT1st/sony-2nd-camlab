import {
  FaultInjector,
  MockCameraAdapter,
  MockMediaAdapter
} from '@camera-lab/adapters-mock';
import { type ImageAsset, ImageAssetSchema } from '@camera-lab/contracts';
import { DiagnosticsManager } from '@camera-lab/diagnostics';
import { DexieStorageAdapter } from '@camera-lab/persistence';
import manifestJson from '../../../../assets/manifest.json';
import rawPipelineJson from '../../../../assets/generated/sample-001/pipeline.json';
import rawMetaJson from '../../../../assets/generated/sample-001/original.meta.json';
import { DarkroomProcessorClient } from '../workers/darkroomWorkerClient.js';

export const initialManifestAssets: ImageAsset[] = (
  manifestJson.assets ?? []
).map((item) => ImageAssetSchema.parse(item));

export const rawDemoMetadata = {
  meta: rawMetaJson,
  pipeline: rawPipelineJson
};

export const diagnostics = new DiagnosticsManager({
  maxBufferSize: 1000,
  sessionId: 'camlab-web-session-01'
});

export const faultInjector = new FaultInjector();

export const storagePort = new DexieStorageAdapter('CameraLabDatabase');

export const mediaPort = new MockMediaAdapter({
  initialAssets: initialManifestAssets,
  faultInjector,
  diagnostics
});

export const cameraPort = new MockCameraAdapter({
  mediaPort,
  faultInjector,
  diagnostics
});

export const darkroomProcessor = new DarkroomProcessorClient();

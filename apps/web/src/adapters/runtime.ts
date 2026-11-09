import {
  FaultInjector,
  MockCameraAdapter,
  MockMediaAdapter
} from '@camera-lab/adapters-mock';
import { type ImageAsset, ImageAssetSchema } from '@camera-lab/contracts';
import { DiagnosticsManager } from '@camera-lab/diagnostics';
import { DexieStorageAdapter } from '@camera-lab/persistence';
import manifestJson from '../../../../assets/manifest.json';
import rawMeta001 from '../../../../assets/generated/sample-001/original.meta.json';
import rawPipeline001 from '../../../../assets/generated/sample-001/pipeline.json';
import rawMeta017 from '../../../../assets/generated/sample-017/original.meta.json';
import rawPipeline017 from '../../../../assets/generated/sample-017/pipeline.json';
import rawMeta018 from '../../../../assets/generated/sample-018/original.meta.json';
import rawPipeline018 from '../../../../assets/generated/sample-018/pipeline.json';
import { DarkroomProcessorClient } from '../workers/darkroomWorkerClient.js';

export const initialManifestAssets: ImageAsset[] = (
  manifestJson.assets ?? []
).map((item) => ImageAssetSchema.parse(item));

export type RawSampleMetaBundle = {
  meta: typeof rawMeta001;
  pipeline: typeof rawPipeline001;
};

export const rawDemoCatalog: Record<string, RawSampleMetaBundle> = {
  'sample-001': { meta: rawMeta001, pipeline: rawPipeline001 },
  'sample-017': { meta: rawMeta017, pipeline: rawPipeline017 },
  'sample-018': { meta: rawMeta018, pipeline: rawPipeline018 }
};

export const rawDemoMetadata: RawSampleMetaBundle =
  rawDemoCatalog['sample-001']!;

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

import type {
  AssetOrigin,
  ExportRecord,
  ImageAsset,
  ImagePipelineMode
} from '@camera-lab/contracts';

export interface AssetQuery {
  origin?: AssetOrigin;
  pipelineMode?: ImagePipelineMode;
  ghostPairOnly?: boolean;
}

export interface ExportRequest {
  sourceAssetId: string;
  rollId?: string;
  kind: ExportRecord['kind'];
  mode: ImagePipelineMode;
  mimeType: string;
  dataUrl: string;
  filename: string;
  metadata?: Record<string, unknown>;
}

export interface MediaPort {
  getAsset(id: string): Promise<ImageAsset | null>;
  listAssets(query?: AssetQuery): Promise<ImageAsset[]>;
  importUserAsset(asset: ImageAsset): Promise<ImageAsset>;
  saveDerivative(request: ExportRequest): Promise<ExportRecord>;
  listDerivatives(sourceAssetId?: string): Promise<ExportRecord[]>;
}

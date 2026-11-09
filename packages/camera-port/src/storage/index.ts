import type {
  CaptureResult,
  DevelopJob,
  ExportRecord,
  FilmRoll,
  GhostSession,
  ImageAsset
} from '@camera-lab/contracts';

export interface StorageStats {
  rollsCount: number;
  capturesCount: number;
  assetsCount: number;
  exportsCount: number;
  ghostSessionsCount: number;
  estimatedBytes: number;
}

export interface StoragePort {
  saveRoll(roll: FilmRoll): Promise<void>;
  getRoll(id: string): Promise<FilmRoll | null>;
  listRolls(): Promise<FilmRoll[]>;
  saveCapture(capture: CaptureResult): Promise<void>;
  listCapturesByRoll(rollId: string): Promise<CaptureResult[]>;
  saveDevelopJob(job: DevelopJob): Promise<void>;
  getDevelopJob(jobId: string): Promise<DevelopJob | null>;
  saveGhostSession(session: GhostSession): Promise<void>;
  listGhostSessions(): Promise<GhostSession[]>;
  saveAsset(asset: ImageAsset): Promise<void>;
  listAssets(): Promise<ImageAsset[]>;
  saveExport(record: ExportRecord): Promise<void>;
  listExports(): Promise<ExportRecord[]>;
  getStats(): Promise<StorageStats>;
  clearAll(): Promise<void>;
}

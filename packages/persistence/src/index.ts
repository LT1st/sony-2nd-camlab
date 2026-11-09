import type {
  StorageBackupSnapshot,
  StoragePort,
  StorageStats
} from '@camera-lab/camera-port';
import {
  type CaptureResult,
  CaptureResultSchema,
  type DevelopJob,
  DevelopJobSchema,
  type ExportRecord,
  ExportRecordSchema,
  type FilmRoll,
  FilmRollSchema,
  type GhostSession,
  GhostSessionSchema,
  type ImageAsset,
  ImageAssetSchema
} from '@camera-lab/contracts';
import Dexie, { type Table } from 'dexie';

export class CameraLabDexieDb extends Dexie {
  rolls!: Table<FilmRoll, string>;
  captures!: Table<CaptureResult, string>;
  developJobs!: Table<DevelopJob, string>;
  ghostSessions!: Table<GhostSession, string>;
  assets!: Table<ImageAsset, string>;
  exports!: Table<ExportRecord, string>;
  meta!: Table<{ key: string; value: unknown }, string>;

  constructor(dbName = 'CameraLabDatabase') {
    super(dbName);

    this.version(1).stores({
      rolls: 'id, status, updatedAt',
      captures: 'captureId, rollId, assetId, capturedAt',
      developJobs: 'jobId, assetId, rollId, status, updatedAt',
      ghostSessions: 'id, referenceAssetId, currentAssetId, updatedAt',
      assets: 'id, origin, pipelineMode, ghostPairId',
      exports: 'id, sourceAssetId, rollId, kind, createdAt',
      meta: 'key'
    });

    this.version(2)
      .stores({
        rolls: 'id, status, preset, updatedAt',
        captures: 'captureId, rollId, frameIndex, assetId, capturedAt',
        developJobs: 'jobId, assetId, rollId, mode, status, updatedAt',
        ghostSessions: 'id, referenceAssetId, currentAssetId, comparisonMode, updatedAt',
        assets: 'id, origin, pipelineMode, ghostPairId, createdAt',
        exports: 'id, sourceAssetId, rollId, kind, mode, createdAt',
        meta: 'key'
      })
      .upgrade(async (tx) => {
        await tx
          .table('rolls')
          .toCollection()
          .modify((roll: Record<string, unknown>) => {
            if (!roll.preset) roll.preset = 'CLASSIC_COLOR';
            if (typeof roll.strictMode !== 'boolean') roll.strictMode = true;
            if (typeof roll.version !== 'number') roll.version = 1;
          });
      });
  }
}

export class DexieStorageAdapter implements StoragePort {
  private readonly db: CameraLabDexieDb;

  constructor(dbName = 'CameraLabDatabase') {
    this.db = new CameraLabDexieDb(dbName);
  }

  getDatabase(): CameraLabDexieDb {
    return this.db;
  }

  async saveRoll(roll: FilmRoll): Promise<void> {
    const parsed = FilmRollSchema.parse(roll);
    await this.db.rolls.put(parsed);
  }

  async getRoll(id: string): Promise<FilmRoll | null> {
    const found = await this.db.rolls.get(id);
    return found ? FilmRollSchema.parse(found) : null;
  }

  async listRolls(): Promise<FilmRoll[]> {
    const items = await this.db.rolls.orderBy('updatedAt').reverse().toArray();
    return items.map((r) => FilmRollSchema.parse(r));
  }

  async saveCapture(capture: CaptureResult): Promise<void> {
    const parsed = CaptureResultSchema.parse(capture);
    await this.db.captures.put(parsed);
  }

  async listCapturesByRoll(rollId: string): Promise<CaptureResult[]> {
    const items = await this.db.captures.where('rollId').equals(rollId).toArray();
    return items
      .map((c) => CaptureResultSchema.parse(c))
      .sort((a, b) => a.frameIndex - b.frameIndex);
  }

  async saveDevelopJob(job: DevelopJob): Promise<void> {
    const parsed = DevelopJobSchema.parse(job);
    await this.db.developJobs.put(parsed);
  }

  async getDevelopJob(jobId: string): Promise<DevelopJob | null> {
    const found = await this.db.developJobs.get(jobId);
    return found ? DevelopJobSchema.parse(found) : null;
  }

  async saveGhostSession(session: GhostSession): Promise<void> {
    const parsed = GhostSessionSchema.parse(session);
    await this.db.ghostSessions.put(parsed);
  }

  async listGhostSessions(): Promise<GhostSession[]> {
    const items = await this.db.ghostSessions
      .orderBy('updatedAt')
      .reverse()
      .toArray();
    return items.map((s) => GhostSessionSchema.parse(s));
  }

  async saveAsset(asset: ImageAsset): Promise<void> {
    const parsed = ImageAssetSchema.parse(asset);
    await this.db.assets.put(parsed);
  }

  async listAssets(): Promise<ImageAsset[]> {
    const items = await this.db.assets.toArray();
    return items.map((a) => ImageAssetSchema.parse(a));
  }

  async saveExport(record: ExportRecord): Promise<void> {
    const parsed = ExportRecordSchema.parse(record);
    await this.db.exports.put(parsed);
  }

  async listExports(): Promise<ExportRecord[]> {
    const items = await this.db.exports.orderBy('createdAt').reverse().toArray();
    return items.map((e) => ExportRecordSchema.parse(e));
  }

  async setSetting<T>(key: string, value: T): Promise<void> {
    await this.db.meta.put({ key, value });
  }

  async getSetting<T>(key: string, fallback: T): Promise<T> {
    const row = await this.db.meta.get(key);
    return row ? (row.value as T) : fallback;
  }

  async getStats(): Promise<StorageStats> {
    const [rolls, captures, assets, exportsList, ghostSessions] =
      await Promise.all([
        this.db.rolls.toArray(),
        this.db.captures.toArray(),
        this.db.assets.toArray(),
        this.db.exports.toArray(),
        this.db.ghostSessions.toArray()
      ]);

    const jsonSize =
      JSON.stringify(rolls).length +
      JSON.stringify(captures).length +
      JSON.stringify(assets).length +
      JSON.stringify(exportsList).length +
      JSON.stringify(ghostSessions).length;

    return {
      rollsCount: rolls.length,
      capturesCount: captures.length,
      assetsCount: assets.length,
      exportsCount: exportsList.length,
      ghostSessionsCount: ghostSessions.length,
      estimatedBytes: jsonSize
    };
  }

  async exportBackup(): Promise<StorageBackupSnapshot> {
    const [rolls, captures, ghostSessions, allAssets] = await Promise.all([
      this.listRolls(),
      this.db.captures.toArray(),
      this.listGhostSessions(),
      this.listAssets()
    ]);

    return {
      schemaVersion: '2.0.0',
      exportedAt: new Date().toISOString(),
      rolls,
      captures: captures.map((c) => CaptureResultSchema.parse(c)),
      ghostSessions,
      userAssets: allAssets.filter((a) => a.origin === 'USER_IMPORT')
    };
  }

  async importBackup(snapshot: StorageBackupSnapshot): Promise<{
    rollsImported: number;
    capturesImported: number;
    ghostSessionsImported: number;
  }> {
    let rollsImported = 0;
    let capturesImported = 0;
    let ghostSessionsImported = 0;

    for (const rawRoll of snapshot.rolls ?? []) {
      const normalized = {
        ...rawRoll,
        preset: rawRoll.preset ?? 'CLASSIC_COLOR',
        strictMode:
          typeof rawRoll.strictMode === 'boolean' ? rawRoll.strictMode : true,
        version: typeof rawRoll.version === 'number' ? rawRoll.version : 1
      };
      const parsed = FilmRollSchema.parse(normalized);
      await this.db.rolls.put(parsed);
      rollsImported += 1;
    }

    for (const rawCap of snapshot.captures ?? []) {
      const parsed = CaptureResultSchema.parse(rawCap);
      await this.db.captures.put(parsed);
      capturesImported += 1;
    }

    for (const rawGhost of snapshot.ghostSessions ?? []) {
      const parsed = GhostSessionSchema.parse(rawGhost);
      await this.db.ghostSessions.put(parsed);
      ghostSessionsImported += 1;
    }

    for (const rawAsset of snapshot.userAssets ?? []) {
      const parsed = ImageAssetSchema.parse(rawAsset);
      await this.db.assets.put(parsed);
    }

    return {
      rollsImported,
      capturesImported,
      ghostSessionsImported
    };
  }

  async clearAll(): Promise<void> {
    await Promise.all([
      this.db.rolls.clear(),
      this.db.captures.clear(),
      this.db.developJobs.clear(),
      this.db.ghostSessions.clear(),
      this.db.assets.clear(),
      this.db.exports.clear(),
      this.db.meta.clear()
    ]);
  }
}

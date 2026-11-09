import 'fake-indexeddb/auto';
import { unzipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  FaultInjector,
  MOCK_A7R2_CAPABILITIES,
  MockCameraAdapter,
  MockMediaAdapter
} from '@camera-lab/adapters-mock';
import { DiagnosticsManager } from '@camera-lab/diagnostics';
import { createFilmRoll } from '@camera-lab/domain';
import { DexieStorageAdapter } from '@camera-lab/persistence';
import manifestJson from '../../assets/manifest.json';
import { ImageAssetSchema } from '@camera-lab/contracts';

describe('Adapters, Fault Injection, IndexedDB Persistence & Diagnostics ZIP', () => {
  const sampleAssets = manifestJson.assets.map((a) =>
    ImageAssetSchema.parse(a)
  );

  it('injects 4th frame capture failure without advancing frame count and recovers on retry (AC-07)', async () => {
    const faultInjector = new FaultInjector();
    const diag = new DiagnosticsManager();
    const media = new MockMediaAdapter({
      initialAssets: sampleAssets,
      faultInjector,
      diagnostics: diag
    });
    const camera = new MockCameraAdapter({
      mediaPort: media,
      faultInjector,
      diagnostics: diag
    });

    faultInjector.update({ failOnFrameNumber: 4 });

    // Frames 1..3 succeed
    for (let i = 1; i <= 3; i++) {
      const res = await camera.capturePhoto({
        captureId: `cap-${i}`,
        rollId: 'roll-ac07',
        frameIndex: i
      });
      expect(res.frameIndex).toBe(i);
    }

    // 4th frame fails
    await expect(
      camera.capturePhoto({
        captureId: 'cap-4-fail',
        rollId: 'roll-ac07',
        frameIndex: 4
      })
    ).rejects.toThrowError(/第 4 张快门曝光或存储写入失败/);

    // Immediate retry of 4th frame succeeds because fault was consumed
    const retry4 = await camera.capturePhoto({
      captureId: 'cap-4-retry',
      rollId: 'roll-ac07',
      frameIndex: 4
    });
    expect(retry4.frameIndex).toBe(4);
  });

  it('handles 404, corrupted asset, and storage full faults gracefully (AC-09)', async () => {
    const faultInjector = new FaultInjector();
    const media = new MockMediaAdapter({
      initialAssets: sampleAssets,
      faultInjector
    });

    faultInjector.update({ simulateAsset404: true });
    await expect(media.getAsset('sample-001')).rejects.toThrowError(/404/);

    faultInjector.reset();
    faultInjector.update({ simulateCorruptedAsset: true });
    await expect(media.getAsset('sample-001')).rejects.toThrowError(/损坏/);

    faultInjector.reset();
    faultInjector.update({ simulateStorageFull: true });
    await expect(
      media.saveDerivative({
        sourceAssetId: 'sample-001',
        kind: 'DARKROOM_JPEG',
        mode: 'JPEG_SIMULATION',
        mimeType: 'image/jpeg',
        dataUrl: 'data:image/jpeg;base64,AA==',
        filename: 'test.jpg'
      })
    ).rejects.toThrowError(/配额已满/);
  });

  it('persists rolls and captures in IndexedDB via DexieStorageAdapter', async () => {
    const store = new DexieStorageAdapter(`TestDb-${Date.now()}`);
    const roll = createFilmRoll({
      id: 'roll-idb-1',
      name: 'IDB Persistence Roll',
      capacity: 24,
      preset: 'WARM_AMBER'
    });
    await store.saveRoll(roll);

    const loaded = await store.getRoll('roll-idb-1');
    expect(loaded?.name).toBe('IDB Persistence Roll');
    expect(loaded?.capacity).toBe(24);

    const stats = await store.getStats();
    expect(stats.rollsCount).toBe(1);

    // Export full backup snapshot and import into a second database instance
    const backup = await store.exportBackup();
    expect(backup.schemaVersion).toBe('2.0.0');
    expect(backup.rolls).toHaveLength(1);

    const store2 = new DexieStorageAdapter(`TestDb-Restore-${Date.now()}`);
    const restoreRes = await store2.importBackup(backup);
    expect(restoreRes.rollsImported).toBe(1);
    const restoredRoll = await store2.getRoll('roll-idb-1');
    expect(restoredRoll?.name).toBe('IDB Persistence Roll');
  });

  it('enforces PoolExhaustionStrategy PAUSE when sample pool is exhausted', async () => {
    const faultInjector = new FaultInjector();
    const media = new MockMediaAdapter({
      initialAssets: sampleAssets.slice(0, 2),
      faultInjector
    });
    const camera = new MockCameraAdapter({
      mediaPort: media,
      faultInjector,
      exhaustionStrategy: 'PAUSE'
    });

    await camera.capturePhoto({
      captureId: 'cap-p1',
      rollId: 'roll-pause',
      frameIndex: 1
    });
    await camera.capturePhoto({
      captureId: 'cap-p2',
      rollId: 'roll-pause',
      frameIndex: 2
    });

    // 3rd capture exceeds 2-item pool under PAUSE strategy
    await expect(
      camera.capturePhoto({
        captureId: 'cap-p3',
        rollId: 'roll-pause',
        frameIndex: 3
      })
    ).rejects.toThrowError(/PAUSE/);

    // Switching to CYCLE immediately allows continuing
    camera.setExhaustionStrategy('CYCLE');
    const c3 = await camera.capturePhoto({
      captureId: 'cap-p3-cycle',
      rollId: 'roll-pause',
      frameIndex: 3
    });
    expect(c3.frameIndex).toBe(3);
  });

  it('exports a sanitized ZIP diagnostics bundle omitting private image data by default', async () => {
    const diag = new DiagnosticsManager({ sessionId: 'zip-test-session' });
    diag.emit({
      level: 'INFO',
      domain: 'FILM',
      name: 'capture.completed',
      adapter: 'MOCK',
      details: {
        assetId: 'sample-001',
        dataUrl: 'data:image/jpeg;base64,SECRET_PRIVATE_BYTES',
        gpsLatitude: 35.6895
      }
    });

    const zipBytes = await diag.exportBundle({
      includeImages: false,
      appState: {
        previewData: 'data:image/png;base64,PRIVATE_PREVIEW',
        activeRollId: 'roll-001'
      },
      capabilities: MOCK_A7R2_CAPABILITIES,
      assetManifest: { count: 16 }
    });

    const unzipped = unzipSync(new Uint8Array(zipBytes));
    expect(Object.keys(unzipped).sort()).toEqual([
      'app-state.json',
      'asset-manifest.json',
      'capabilities.json',
      'logs.jsonl',
      'repro-steps.txt'
    ]);

    const logsText = strFromU8(unzipped['logs.jsonl']!);
    expect(logsText).not.toContain('SECRET_PRIVATE_BYTES');
    expect(logsText).toContain('[REDACTED_BY_POLICY]');

    const stateText = strFromU8(unzipped['app-state.json']!);
    expect(stateText).not.toContain('PRIVATE_PREVIEW');
    expect(stateText).toContain('[OMITTED_PRIVATE_IMAGE_DATA]');
  });
});

import {
  CameraPortError,
  type AssetQuery,
  type CameraEvent,
  type CameraPort,
  type CaptureRequest,
  type ClockPort,
  type ExportRequest,
  type MediaPort,
  type PreviewFrame,
  SystemClock
} from '@camera-lab/camera-port';
import {
  type CameraCapabilities,
  CameraCapabilitiesSchema,
  type CaptureResult,
  CaptureResultSchema,
  type ExportRecord,
  ExportRecordSchema,
  type ExposureMeta,
  type ImageAsset,
  ImageAssetSchema
} from '@camera-lab/contracts';
import type { DiagnosticsPort } from '@camera-lab/diagnostics';

export interface FaultInjectionConfig {
  failNextCapture: boolean;
  failOnFrameNumber: number | null;
  shutterDelayMs: number;
  duplicateCaptureCompleted: boolean;
  simulateAsset404: boolean;
  simulateCorruptedAsset: boolean;
  simulateStorageFull: boolean;
  interruptDevelopOnStage: string | null;
  simulateParallelExportConflict: boolean;
}

export const DEFAULT_FAULT_CONFIG: FaultInjectionConfig = {
  failNextCapture: false,
  failOnFrameNumber: null,
  shutterDelayMs: 0,
  duplicateCaptureCompleted: false,
  simulateAsset404: false,
  simulateCorruptedAsset: false,
  simulateStorageFull: false,
  interruptDevelopOnStage: null,
  simulateParallelExportConflict: false
};

export class FaultInjector {
  private config: FaultInjectionConfig = { ...DEFAULT_FAULT_CONFIG };
  private listeners = new Set<(config: FaultInjectionConfig) => void>();

  getConfig(): FaultInjectionConfig {
    return { ...this.config };
  }

  update(patch: Partial<FaultInjectionConfig>): FaultInjectionConfig {
    this.config = { ...this.config, ...patch };
    this.notify();
    return this.getConfig();
  }

  reset(): FaultInjectionConfig {
    this.config = { ...DEFAULT_FAULT_CONFIG };
    this.notify();
    return this.getConfig();
  }

  consumeNextCaptureFault(frameIndex: number): boolean {
    if (this.config.failNextCapture) {
      this.config.failNextCapture = false;
      this.notify();
      return true;
    }
    if (
      this.config.failOnFrameNumber !== null &&
      this.config.failOnFrameNumber === frameIndex
    ) {
      this.config.failOnFrameNumber = null;
      this.notify();
      return true;
    }
    return false;
  }

  subscribe(listener: (config: FaultInjectionConfig) => void): () => void {
    this.listeners.add(listener);
    listener(this.getConfig());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const snap = this.getConfig();
    for (const l of this.listeners) {
      l(snap);
    }
  }
}

export const MOCK_A7R2_CAPABILITIES: CameraCapabilities =
  CameraCapabilitiesSchema.parse({
    deviceModel: 'ILCE-7RM2 (Simulated)',
    firmwareVersion: '4.01-mock',
    adapterType: 'MOCK',
    screenLogicalSize: { width: 640, height: 480 },
    sensorAspect: '3:2',
    liveView: 'simulated',
    captureJPEG: 'simulated',
    captureRAW: 'unavailable',
    rawDemoAssets: 'available',
    keyEvents: 'simulated',
    previewOverlay: 'web-rendered',
    focusDrive: 'unavailable',
    rawBuffer: 'unavailable',
    saveToCard: 'simulated',
    dspProcessing: 'unavailable',
    maxPreviewSize: { width: 1200, height: 800 }
  });

const DEFAULT_EXPOSURE_POOL: ExposureMeta[] = [
  { shutterSpeed: '1/250', aperture: 'f/2.8', iso: 400, focalLengthMm: 35 },
  { shutterSpeed: '1/500', aperture: 'f/4.0', iso: 200, focalLengthMm: 50 },
  { shutterSpeed: '1/125', aperture: 'f/2.0', iso: 800, focalLengthMm: 28 },
  { shutterSpeed: '1/1000', aperture: 'f/5.6', iso: 100, focalLengthMm: 85 },
  { shutterSpeed: '1/60', aperture: 'f/1.8', iso: 1600, focalLengthMm: 55 }
];

export type PoolExhaustionStrategy = 'CYCLE' | 'PAUSE';

export class MockMediaAdapter implements MediaPort {
  private assets = new Map<string, ImageAsset>();
  private derivatives: ExportRecord[] = [];
  private readonly faultInjector: FaultInjector;
  private readonly diagnostics?: DiagnosticsPort;
  private readonly clock: ClockPort;

  constructor(options: {
    initialAssets: ImageAsset[];
    faultInjector: FaultInjector;
    diagnostics?: DiagnosticsPort;
    clock?: ClockPort;
  }) {
    this.faultInjector = options.faultInjector;
    this.diagnostics = options.diagnostics;
    this.clock = options.clock ?? new SystemClock();
    for (const asset of options.initialAssets) {
      this.assets.set(asset.id, ImageAssetSchema.parse(asset));
    }
  }

  async getAsset(id: string): Promise<ImageAsset | null> {
    const faults = this.faultInjector.getConfig();
    if (faults.simulateAsset404) {
      this.diagnostics?.emit({
        level: 'ERROR',
        domain: 'STORAGE',
        name: 'asset.load_failed',
        errorCode: 'ASSET_MISSING',
        adapter: 'MOCK',
        details: { assetId: id, reason: 'Injected 404 fault' }
      });
      throw new CameraPortError(
        'ASSET_MISSING',
        `模拟网络样片不可达 (404): ${id}。请切换离线缓存样片或重试。`
      );
    }
    if (faults.simulateCorruptedAsset) {
      this.diagnostics?.emit({
        level: 'ERROR',
        domain: 'STORAGE',
        name: 'asset.corrupted',
        errorCode: 'ASSET_CORRUPTED',
        adapter: 'MOCK',
        details: { assetId: id, reason: 'Injected corrupted asset fault' }
      });
      throw new CameraPortError(
        'ASSET_CORRUPTED',
        `样片数据校验失败或图像损坏: ${id}。原始库不受影响，请更换样片。`
      );
    }
    return this.assets.get(id) ?? null;
  }

  async listAssets(query?: AssetQuery): Promise<ImageAsset[]> {
    const all = Array.from(this.assets.values());
    if (!query) return all;
    return all.filter((asset) => {
      if (query.origin && asset.origin !== query.origin) return false;
      if (query.pipelineMode && asset.pipelineMode !== query.pipelineMode) {
        return false;
      }
      if (query.ghostPairOnly && !asset.ghostPairId) return false;
      return true;
    });
  }

  async importUserAsset(asset: ImageAsset): Promise<ImageAsset> {
    const parsed = ImageAssetSchema.parse(asset);
    this.assets.set(parsed.id, parsed);
    this.diagnostics?.emit({
      level: 'INFO',
      domain: 'STORAGE',
      name: 'asset.user_imported',
      adapter: 'MOCK',
      details: {
        assetId: parsed.id,
        title: parsed.title,
        width: parsed.width,
        height: parsed.height
      }
    });
    return parsed;
  }

  async saveDerivative(request: ExportRequest): Promise<ExportRecord> {
    const faults = this.faultInjector.getConfig();
    if (faults.simulateStorageFull) {
      this.diagnostics?.emit({
        level: 'ERROR',
        domain: 'STORAGE',
        name: 'export.failed',
        errorCode: 'STORAGE_FULL',
        adapter: 'MOCK',
        details: { sourceAssetId: request.sourceAssetId, kind: request.kind }
      });
      throw new CameraPortError(
        'STORAGE_FULL',
        '存储空间配额已满（模拟故障），无法写入导出衍生图，原始样片保持安全。'
      );
    }
    if (faults.simulateParallelExportConflict) {
      this.faultInjector.update({ simulateParallelExportConflict: false });
      this.diagnostics?.emit({
        level: 'ERROR',
        domain: 'STORAGE',
        name: 'export.conflict',
        errorCode: 'EXPORT_CONFLICT',
        adapter: 'MOCK',
        details: { sourceAssetId: request.sourceAssetId, kind: request.kind }
      });
      throw new CameraPortError(
        'EXPORT_CONFLICT',
        '检测到并行导出写入冲突（模拟故障），已取消覆盖，请重试导出。'
      );
    }

    const record: ExportRecord = ExportRecordSchema.parse({
      id: `exp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      sourceAssetId: request.sourceAssetId,
      rollId: request.rollId,
      kind: request.kind,
      mode: request.mode,
      mimeType: request.mimeType,
      dataUrl: request.dataUrl,
      filename: request.filename,
      originalPreserved: true,
      createdAt: this.clock.nowIso(),
      metadata: request.metadata ?? {}
    });

    this.derivatives.unshift(record);
    this.diagnostics?.emit({
      level: 'INFO',
      domain: 'STORAGE',
      name: 'export.saved',
      rollId: request.rollId,
      adapter: 'MOCK',
      details: {
        exportId: record.id,
        sourceAssetId: record.sourceAssetId,
        kind: record.kind,
        filename: record.filename,
        originalPreserved: true
      }
    });
    return record;
  }

  async listDerivatives(sourceAssetId?: string): Promise<ExportRecord[]> {
    if (!sourceAssetId) return [...this.derivatives];
    return this.derivatives.filter((d) => d.sourceAssetId === sourceAssetId);
  }
}

export class MockCameraAdapter implements CameraPort {
  private readonly mediaPort: MediaPort;
  private readonly faultInjector: FaultInjector;
  private readonly diagnostics?: DiagnosticsPort;
  private readonly clock: ClockPort;
  private listeners = new Set<(evt: CameraEvent) => void>();
  private queueIndex = 0;
  private sessionId: string | null = null;
  private exhaustionStrategy: PoolExhaustionStrategy = 'CYCLE';
  private busy = false;

  constructor(options: {
    mediaPort: MediaPort;
    faultInjector: FaultInjector;
    diagnostics?: DiagnosticsPort;
    clock?: ClockPort;
    exhaustionStrategy?: PoolExhaustionStrategy;
  }) {
    this.mediaPort = options.mediaPort;
    this.faultInjector = options.faultInjector;
    this.diagnostics = options.diagnostics;
    this.clock = options.clock ?? new SystemClock();
    this.exhaustionStrategy = options.exhaustionStrategy ?? 'CYCLE';
  }

  setExhaustionStrategy(strategy: PoolExhaustionStrategy): void {
    this.exhaustionStrategy = strategy;
  }

  getExhaustionStrategy(): PoolExhaustionStrategy {
    return this.exhaustionStrategy;
  }

  async getCapabilities(): Promise<CameraCapabilities> {
    return MOCK_A7R2_CAPABILITIES;
  }

  async openSession(): Promise<{ sessionId: string }> {
    const id = `cam-sess-${this.clock.nowMs().toString(36)}`;
    this.sessionId = id;
    const evt: CameraEvent = {
      type: 'session.opened',
      sessionId: id,
      timestamp: this.clock.nowIso()
    };
    this.emitEvent(evt);
    this.diagnostics?.emit({
      level: 'INFO',
      domain: 'CAMERA',
      name: 'session.opened',
      adapter: 'MOCK',
      details: { sessionId: id, deviceModel: MOCK_A7R2_CAPABILITIES.deviceModel }
    });
    return { sessionId: id };
  }

  async closeSession(): Promise<void> {
    const id = this.sessionId ?? 'cam-sess-closed';
    this.sessionId = null;
    this.emitEvent({
      type: 'session.closed',
      sessionId: id,
      timestamp: this.clock.nowIso()
    });
    this.diagnostics?.emit({
      level: 'INFO',
      domain: 'CAMERA',
      name: 'session.closed',
      adapter: 'MOCK',
      details: { sessionId: id }
    });
  }

  async getPreviewFrame(): Promise<PreviewFrame> {
    const assets = await this.mediaPort.listAssets();
    if (assets.length === 0) {
      throw new CameraPortError(
        'ASSET_MISSING',
        '样片池为空，无法生成模拟取景画面。'
      );
    }
    if (this.exhaustionStrategy === 'PAUSE' && this.queueIndex >= assets.length) {
      throw new CameraPortError(
        'ASSET_MISSING',
        '预置样片队列已耗尽（当前策略：PAUSE）。请切换为循环模式（CYCLE）或导入新样片。'
      );
    }
    const safeIndex =
      ((this.queueIndex % assets.length) + assets.length) % assets.length;
    const asset = assets[safeIndex]!;
    // Verify asset accessibility via mediaPort.getAsset so injected 404/corrupted faults surface accurately
    await this.mediaPort.getAsset(asset.id);
    const exposure =
      DEFAULT_EXPOSURE_POOL[safeIndex % DEFAULT_EXPOSURE_POOL.length]!;
    return {
      frameId: `preview-${safeIndex}-${asset.id}`,
      assetId: asset.id,
      title: asset.title,
      previewUrl: asset.url,
      width: asset.width,
      height: asset.height,
      timestamp: this.clock.nowIso(),
      simulatedLiveView: true,
      exposureMeta: exposure
    };
  }

  async advancePreviewSample(direction: 1 | -1 = 1): Promise<PreviewFrame> {
    const assets = await this.mediaPort.listAssets();
    if (assets.length === 0) {
      throw new CameraPortError('ASSET_MISSING', '样片池为空。');
    }
    const nextIdx = this.queueIndex + direction;
    if (nextIdx >= assets.length && this.exhaustionStrategy === 'PAUSE') {
      throw new CameraPortError(
        'ASSET_MISSING',
        '预置样片队列已耗尽（当前策略：PAUSE）。请切换为循环模式或导入新样片。'
      );
    }
    this.queueIndex =
      ((nextIdx % assets.length) + assets.length) % assets.length;
    return this.getPreviewFrame();
  }

  async selectPreviewSample(assetId: string): Promise<PreviewFrame> {
    const assets = await this.mediaPort.listAssets();
    const idx = assets.findIndex((a) => a.id === assetId);
    if (idx === -1) {
      throw new CameraPortError('ASSET_MISSING', `未找到样片 ${assetId}`);
    }
    this.queueIndex = idx;
    return this.getPreviewFrame();
  }

  async capturePhoto(request: CaptureRequest): Promise<CaptureResult> {
    if (this.busy) {
      throw new CameraPortError(
        'CAMERA_BUSY',
        '快门正在曝光或写入中，请稍候再按快门。'
      );
    }

    this.busy = true;
    const startedMs = this.clock.nowMs();
    const nowIso = this.clock.nowIso();

    this.emitEvent({
      type: 'capture.requested',
      captureId: request.captureId,
      rollId: request.rollId,
      timestamp: nowIso
    });
    this.diagnostics?.emit({
      level: 'INFO',
      domain: 'FILM',
      name: 'capture.requested',
      rollId: request.rollId,
      captureId: request.captureId,
      adapter: 'MOCK',
      details: { frameIndex: request.frameIndex }
    });

    try {
      const faults = this.faultInjector.getConfig();
      if (faults.shutterDelayMs > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, faults.shutterDelayMs)
        );
      }

      if (this.faultInjector.consumeNextCaptureFault(request.frameIndex)) {
        const err = new CameraPortError(
          'SHUTTER_FAILED',
          `第 ${request.frameIndex} 张快门曝光或存储写入失败（故障注入）。胶卷未增加帧数，可直接重试。`
        );
        this.emitEvent({
          type: 'capture.failed',
          captureId: request.captureId,
          rollId: request.rollId,
          errorCode: err.code,
          message: err.message,
          timestamp: this.clock.nowIso()
        });
        this.diagnostics?.emit({
          level: 'ERROR',
          domain: 'FILM',
          name: 'capture.failed',
          rollId: request.rollId,
          captureId: request.captureId,
          errorCode: err.code,
          adapter: 'MOCK',
          details: { frameIndex: request.frameIndex, message: err.message }
        });
        throw err;
      }

      if (faults.simulateStorageFull) {
        const err = new CameraPortError(
          'STORAGE_FULL',
          '模拟存储卡已满（STORAGE_FULL），本次拍摄未落盘，胶卷计数保持不变。'
        );
        this.emitEvent({
          type: 'capture.failed',
          captureId: request.captureId,
          rollId: request.rollId,
          errorCode: err.code,
          message: err.message,
          timestamp: this.clock.nowIso()
        });
        this.diagnostics?.emit({
          level: 'ERROR',
          domain: 'STORAGE',
          name: 'capture.failed',
          rollId: request.rollId,
          captureId: request.captureId,
          errorCode: err.code,
          adapter: 'MOCK',
          details: { frameIndex: request.frameIndex, message: err.message }
        });
        throw err;
      }

      const preview = request.requestedAssetId
        ? await this.selectPreviewSample(request.requestedAssetId)
        : await this.getPreviewFrame();

      this.emitEvent({
        type: 'capture.started',
        captureId: request.captureId,
        rollId: request.rollId,
        assetId: preview.assetId,
        timestamp: this.clock.nowIso()
      });

      const durationMs = Math.max(12, this.clock.nowMs() - startedMs);
      const result: CaptureResult = CaptureResultSchema.parse({
        captureId: request.captureId,
        rollId: request.rollId,
        frameIndex: request.frameIndex,
        assetId: preview.assetId,
        capturedAt: this.clock.nowIso(),
        source: 'MOCK',
        mode: request.mode ?? 'JPEG_SIMULATION',
        originalPreserved: true,
        exposureMeta: {
          ...preview.exposureMeta,
          ...request.exposureMeta
        }
      });

      // Advance sample queue so each shutter consumes the next sample in pool
      const assets = await this.mediaPort.listAssets();
      if (assets.length > 0) {
        if (this.exhaustionStrategy === 'PAUSE') {
          this.queueIndex = Math.min(assets.length, this.queueIndex + 1);
        } else {
          this.queueIndex = (this.queueIndex + 1) % assets.length;
        }
      }

      const completedEvent: CameraEvent = {
        type: 'capture.completed',
        captureId: request.captureId,
        rollId: request.rollId,
        result,
        durationMs,
        timestamp: result.capturedAt
      };

      this.emitEvent(completedEvent);
      this.diagnostics?.emit({
        level: 'INFO',
        domain: 'FILM',
        name: 'capture.completed',
        rollId: request.rollId,
        captureId: request.captureId,
        durationMs,
        adapter: 'MOCK',
        details: {
          frameIndex: request.frameIndex,
          assetId: result.assetId
        }
      });

      if (faults.duplicateCaptureCompleted) {
        this.faultInjector.update({ duplicateCaptureCompleted: false });
        this.emitEvent(completedEvent);
        this.diagnostics?.emit({
          level: 'WARN',
          domain: 'FILM',
          name: 'capture.completed',
          rollId: request.rollId,
          captureId: request.captureId,
          durationMs,
          adapter: 'MOCK',
          details: {
            frameIndex: request.frameIndex,
            assetId: result.assetId,
            injectedDuplicate: true
          }
        });
      }

      return result;
    } finally {
      this.busy = false;
    }
  }

  subscribeEvents(handler: (evt: CameraEvent) => void): () => void {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  private emitEvent(evt: CameraEvent): void {
    for (const listener of this.listeners) {
      listener(evt);
    }
  }
}

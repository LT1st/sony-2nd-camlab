import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import type { PreviewFrame } from '@camera-lab/camera-port';
import type {
  CameraCapabilities,
  CaptureResult,
  DiagnosticEvent,
  ExportRecord,
  FilmPreset,
  FilmRoll,
  FilmRollCapacity,
  GhostSession,
  ImageAsset
} from '@camera-lab/contracts';
import type { FaultInjectionConfig } from '@camera-lab/adapters-mock';
import {
  applyCaptureCompleted,
  archiveFilmRoll,
  assertCanReviewRoll,
  completeDevelopingRoll,
  createFilmRoll,
  createGhostSession,
  interruptDevelopingRoll,
  replayEventsJsonl,
  sealFilmRoll,
  startDevelopingRoll,
  updateGhostSession,
  type GhostTransformParams
} from '@camera-lab/domain';
import {
  cameraPort,
  diagnostics,
  faultInjector,
  initialManifestAssets,
  mediaPort,
  storagePort
} from '../adapters/runtime.js';
import { useUiStore } from '../stores/uiStore.js';

interface CameraLabContextValue {
  hydrated: boolean;
  capabilities: CameraCapabilities | null;
  assets: ImageAsset[];
  rolls: FilmRoll[];
  activeRoll: FilmRoll | null;
  capturesByRoll: Record<string, CaptureResult[]>;
  ghostSessions: GhostSession[];
  exportsList: ExportRecord[];
  previewFrame: PreviewFrame | null;
  faultConfig: FaultInjectionConfig;
  events: DiagnosticEvent[];
  statusMessage: string;
  errorBanner: string | null;
  clearError: () => void;
  refreshPreview: (direction?: 1 | -1) => Promise<void>;
  selectPreviewAsset: (assetId: string) => Promise<void>;
  createNewRoll: (input: {
    name: string;
    capacity: FilmRollCapacity;
    preset: FilmPreset;
    strictMode: boolean;
  }) => Promise<FilmRoll>;
  selectRoll: (rollId: string) => void;
  shutterCapture: () => Promise<CaptureResult | null>;
  attemptReviewActiveRoll: () => boolean;
  sealActiveRoll: () => Promise<void>;
  startRollDevelop: (rollId?: string) => Promise<void>;
  interruptRollDevelop: (rollId?: string) => Promise<void>;
  completeRollDevelop: (rollId?: string) => Promise<void>;
  archiveRoll: (rollId: string) => Promise<void>;
  importLocalImageFile: (file: File) => Promise<ImageAsset>;
  saveGhostAlignment: (input: {
    id?: string;
    name: string;
    referenceAssetId: string;
    currentAssetId: string;
    params: GhostTransformParams;
    comparisonMode: GhostSession['comparisonMode'];
  }) => Promise<GhostSession>;
  saveExportDerivative: (input: {
    sourceAssetId: string;
    rollId?: string;
    kind: ExportRecord['kind'];
    mode: ExportRecord['mode'];
    mimeType: string;
    dataUrl: string;
    filename: string;
    metadata?: Record<string, unknown>;
  }) => Promise<ExportRecord | null>;
  updateFaultConfig: (patch: Partial<FaultInjectionConfig>) => void;
  resetFaultConfig: () => void;
  applyReplayJsonlToStore: (jsonl: string) => Promise<void>;
}

const CameraLabContext = createContext<CameraLabContextValue | null>(null);

export const CameraLabProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const [hydrated, setHydrated] = useState(false);
  const [capabilities, setCapabilities] = useState<CameraCapabilities | null>(
    null
  );
  const [assets, setAssets] = useState<ImageAsset[]>(initialManifestAssets);
  const [rolls, setRolls] = useState<FilmRoll[]>([]);
  const [capturesByRoll, setCapturesByRoll] = useState<
    Record<string, CaptureResult[]>
  >({});
  const [ghostSessions, setGhostSessions] = useState<GhostSession[]>([]);
  const [exportsList, setExportsList] = useState<ExportRecord[]>([]);
  const [previewFrame, setPreviewFrame] = useState<PreviewFrame | null>(null);
  const [faultConfig, setFaultConfig] = useState<FaultInjectionConfig>(
    faultInjector.getConfig()
  );
  const [events, setEvents] = useState<DiagnosticEvent[]>(
    diagnostics.listEvents()
  );
  const [statusMessage, setStatusMessage] = useState<string>(
    '相机模拟器就绪 · Sony ILCE-7RM2 (MockPort)'
  );
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const selectedRollId = useUiStore((s) => s.selectedRollId);
  const setSelectedRollId = useUiStore((s) => s.setSelectedRollId);

  const activeRoll = useMemo(() => {
    if (!rolls.length) return null;
    if (selectedRollId) {
      const found = rolls.find((r) => r.id === selectedRollId);
      if (found) return found;
    }
    return rolls[0] ?? null;
  }, [rolls, selectedRollId]);

  useEffect(() => {
    const unsubDiag = diagnostics.subscribe((evts) => {
      setEvents(evts);
    });
    const unsubFault = faultInjector.subscribe((cfg) => {
      setFaultConfig(cfg);
    });
    return () => {
      unsubDiag();
      unsubFault();
    };
  }, []);

  // Hydrate from IndexedDB on initial mount
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [caps, storedRolls, storedAssets, storedGhosts, storedExports] =
          await Promise.all([
            cameraPort.getCapabilities(),
            storagePort.listRolls(),
            storagePort.listAssets(),
            storagePort.listGhostSessions(),
            storagePort.listExports()
          ]);

        await cameraPort.openSession();

        // Ensure manifest assets exist in IndexedDB
        if (storedAssets.length === 0) {
          for (const asset of initialManifestAssets) {
            await storagePort.saveAsset(asset);
          }
        } else {
          for (const asset of storedAssets) {
            if (asset.origin === 'USER_IMPORT') {
              await mediaPort.importUserAsset(asset);
            }
          }
        }

        const allAssets = await mediaPort.listAssets();

        let effectiveRolls = storedRolls;
        const captureMap: Record<string, CaptureResult[]> = {};

        if (effectiveRolls.length === 0) {
          const defaultRoll = createFilmRoll({
            id: 'roll-default-001',
            name: 'Kodak Portra 400 · Shinjuku Walk',
            capacity: 12,
            preset: 'CLASSIC_COLOR',
            strictMode: true
          });
          await storagePort.saveRoll(defaultRoll);
          effectiveRolls = [defaultRoll];
          captureMap[defaultRoll.id] = [];
          diagnostics.emit({
            level: 'INFO',
            domain: 'FILM',
            name: 'roll.created',
            rollId: defaultRoll.id,
            adapter: 'MOCK',
            stateBefore: 'EMPTY',
            stateAfter: 'LOADED(0/12)',
            details: {
              rollId: defaultRoll.id,
              name: defaultRoll.name,
              capacity: defaultRoll.capacity,
              preset: defaultRoll.preset,
              strictMode: defaultRoll.strictMode
            }
          });
        } else {
          for (const r of effectiveRolls) {
            captureMap[r.id] = await storagePort.listCapturesByRoll(r.id);
          }
        }

        const savedActiveRollId = await storagePort.getSetting<string | null>(
          'activeRollId',
          effectiveRolls[0]?.id ?? null
        );

        let initialPreview: PreviewFrame | null = null;
        try {
          initialPreview = await cameraPort.getPreviewFrame();
        } catch (err) {
          if (mounted) {
            setErrorBanner(
              err instanceof Error ? err.message : '取景画面加载失败'
            );
          }
        }

        if (!mounted) return;
        setCapabilities(caps);
        setAssets(allAssets);
        setRolls(effectiveRolls);
        setCapturesByRoll(captureMap);
        setGhostSessions(storedGhosts);
        setExportsList(storedExports);
        setSelectedRollId(savedActiveRollId ?? effectiveRolls[0]?.id ?? null);
        setPreviewFrame(initialPreview);
        setHydrated(true);
      } catch (err) {
        if (!mounted) return;
        setErrorBanner(
          err instanceof Error ? err.message : '初始化本地存储失败'
        );
        setHydrated(true);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [setSelectedRollId]);

  const clearError = useCallback(() => setErrorBanner(null), []);

  const refreshPreview = useCallback(async (direction: 1 | -1 = 1) => {
    try {
      setErrorBanner(null);
      const frame = await cameraPort.advancePreviewSample(direction);
      setPreviewFrame(frame);
      setStatusMessage(`取景切换：${frame.title}`);
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : '切换模拟取景样片失败'
      );
    }
  }, []);

  const selectPreviewAsset = useCallback(async (assetId: string) => {
    try {
      setErrorBanner(null);
      const frame = await cameraPort.selectPreviewSample(assetId);
      setPreviewFrame(frame);
      setStatusMessage(`已加载样片：${frame.title}`);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : '加载样片失败');
    }
  }, []);

  const createNewRoll = useCallback(
    async (input: {
      name: string;
      capacity: FilmRollCapacity;
      preset: FilmPreset;
      strictMode: boolean;
    }): Promise<FilmRoll> => {
      setErrorBanner(null);
      const roll = createFilmRoll({
        id: `roll-${Date.now().toString(36)}`,
        name: input.name,
        capacity: input.capacity,
        preset: input.preset,
        strictMode: input.strictMode
      });
      await storagePort.saveRoll(roll);
      await storagePort.setSetting('activeRollId', roll.id);
      setRolls((prev) => [roll, ...prev]);
      setCapturesByRoll((prev) => ({ ...prev, [roll.id]: [] }));
      setSelectedRollId(roll.id);
      setStatusMessage(
        `已装填新胶卷「${roll.name}」(${roll.capacity} 张 · ${roll.preset})`
      );
      diagnostics.emit({
        level: 'INFO',
        domain: 'FILM',
        name: 'roll.created',
        rollId: roll.id,
        adapter: 'MOCK',
        stateBefore: 'EMPTY',
        stateAfter: `LOADED(0/${roll.capacity})`,
        details: {
          rollId: roll.id,
          name: roll.name,
          capacity: roll.capacity,
          preset: roll.preset,
          strictMode: roll.strictMode
        }
      });
      return roll;
    },
    [setSelectedRollId]
  );

  const selectRoll = useCallback(
    (rollId: string) => {
      setSelectedRollId(rollId);
      void storagePort.setSetting('activeRollId', rollId);
    },
    [setSelectedRollId]
  );

  const shutterCapture = useCallback(async (): Promise<CaptureResult | null> => {
    if (!activeRoll) {
      setErrorBanner('当前未装填胶卷，请先新建或选择一卷胶卷。');
      return null;
    }
    if (activeRoll.status !== 'LOADED') {
      const msg = `当前胶卷状态为 ${activeRoll.status}，已封卷或已冲洗，无法继续拍摄。请新建胶卷或进入冲洗室。`;
      setErrorBanner(msg);
      diagnostics.emit({
        level: 'WARN',
        domain: 'FILM',
        name: 'capture.rejected',
        rollId: activeRoll.id,
        errorCode: 'ROLL_ALREADY_SEALED',
        adapter: 'MOCK',
        stateBefore: activeRoll.status,
        stateAfter: activeRoll.status,
        details: { reason: msg }
      });
      return null;
    }

    setErrorBanner(null);
    const nextFrameIndex = activeRoll.frameIds.length + 1;
    const captureId = `cap-${activeRoll.id}-f${String(nextFrameIndex).padStart(2, '0')}-${Date.now().toString(36).slice(-4)}`;
    setStatusMessage(`快门按下 · 正在曝光第 ${nextFrameIndex} 张...`);

    let latestRollState = activeRoll;
    const handleEvent = async (evt: {
      type: string;
      captureId?: string;
      rollId?: string;
      result?: CaptureResult;
    }) => {
      if (evt.type === 'capture.completed' && evt.result) {
        const beforeStr = `${latestRollState.status}(${latestRollState.frameIds.length}/${latestRollState.capacity})`;
        const outcome = applyCaptureCompleted(latestRollState, {
          captureId: evt.result.captureId,
          rollId: evt.result.rollId
        });
        latestRollState = outcome.roll;
        const afterStr = `${outcome.roll.status}(${outcome.roll.frameIds.length}/${outcome.roll.capacity})`;

        if (!outcome.deduplicated) {
          await storagePort.saveCapture(evt.result);
          await storagePort.saveRoll(outcome.roll);
          setRolls((prev) =>
            prev.map((r) => (r.id === outcome.roll.id ? outcome.roll : r))
          );
          setCapturesByRoll((prev) => {
            const list = prev[outcome.roll.id] ?? [];
            if (list.some((c) => c.captureId === evt.result!.captureId)) {
              return prev;
            }
            return {
              ...prev,
              [outcome.roll.id]: [...list, evt.result!]
            };
          });
        } else {
          diagnostics.emit({
            level: 'WARN',
            domain: 'FILM',
            name: 'capture.deduplicated',
            rollId: outcome.roll.id,
            captureId: evt.result.captureId,
            adapter: 'MOCK',
            stateBefore: beforeStr,
            stateAfter: afterStr,
            details: {
              captureId: evt.result.captureId,
              message: 'Idempotent duplicate capture.completed ignored'
            }
          });
        }
      }
    };

    const unsub = cameraPort.subscribeEvents((evt) => {
      void handleEvent(evt);
    });

    try {
      const result = await cameraPort.capturePhoto({
        captureId,
        rollId: activeRoll.id,
        frameIndex: nextFrameIndex
      });
      await handleEvent({
        type: 'capture.completed',
        captureId: result.captureId,
        rollId: result.rollId,
        result
      });
      const nextPreview = await cameraPort.getPreviewFrame();
      setPreviewFrame(nextPreview);

      const remaining = Math.max(
        0,
        latestRollState.capacity - latestRollState.frameIds.length
      );
      if (latestRollState.status === 'SEALED') {
        setStatusMessage(
          `第 ${nextFrameIndex} 张写入完成 · 本卷已拍满自动封卷 (SEALED)！请前往冲洗室。`
        );
      } else {
        setStatusMessage(
          `第 ${nextFrameIndex} 张写入完成 · 剩余 ${remaining} 张`
        );
      }
      return result;
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : '拍摄失败，胶卷计数未增加';
      setErrorBanner(msg);
      setStatusMessage(`拍摄失败：请重试快门（剩余张数保持不变）`);
      return null;
    } finally {
      unsub();
    }
  }, [activeRoll]);

  const attemptReviewActiveRoll = useCallback((): boolean => {
    if (!activeRoll) return false;
    try {
      assertCanReviewRoll(activeRoll);
      setErrorBanner(null);
      return true;
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : '本卷冲洗前不可回看（原始文件已安全保留）';
      setErrorBanner(msg);
      setStatusMessage('不可回看：本卷需先封卷并完成显影冲洗');
      diagnostics.emit({
        level: 'WARN',
        domain: 'FILM',
        name: 'roll.review_blocked',
        rollId: activeRoll.id,
        errorCode: 'REVIEW_LOCKED_BEFORE_DEVELOP',
        adapter: 'MOCK',
        stateBefore: activeRoll.status,
        stateAfter: activeRoll.status,
        details: { strictMode: activeRoll.strictMode }
      });
      return false;
    }
  }, [activeRoll]);

  const sealActiveRoll = useCallback(async () => {
    if (!activeRoll) return;
    try {
      setErrorBanner(null);
      const before = activeRoll.status;
      const sealed = sealFilmRoll(activeRoll);
      await storagePort.saveRoll(sealed);
      setRolls((prev) => prev.map((r) => (r.id === sealed.id ? sealed : r)));
      setStatusMessage(
        `胶卷「${sealed.name}」已封卷（共 ${sealed.frameIds.length} 张），可进入冲洗室显影。`
      );
      diagnostics.emit({
        level: 'INFO',
        domain: 'FILM',
        name: 'roll.sealed',
        rollId: sealed.id,
        adapter: 'MOCK',
        stateBefore: before,
        stateAfter: sealed.status,
        details: { exposedFrames: sealed.frameIds.length }
      });
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : '封卷失败');
    }
  }, [activeRoll]);

  const startRollDevelop = useCallback(
    async (rollId?: string) => {
      const target = rollId
        ? rolls.find((r) => r.id === rollId)
        : activeRoll;
      if (!target) return;
      try {
        setErrorBanner(null);
        const before = target.status;
        const developing = startDevelopingRoll(target);
        await storagePort.saveRoll(developing);
        setRolls((prev) =>
          prev.map((r) => (r.id === developing.id ? developing : r))
        );
        setStatusMessage(`正在冲洗胶卷「${developing.name}」...`);
        diagnostics.emit({
          level: 'INFO',
          domain: 'FILM',
          name: 'develop.started',
          rollId: developing.id,
          adapter: 'MOCK',
          stateBefore: before,
          stateAfter: developing.status,
          details: { frameCount: developing.frameIds.length }
        });
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : '启动冲洗失败');
      }
    },
    [activeRoll, rolls]
  );

  const interruptRollDevelop = useCallback(
    async (rollId?: string) => {
      const target = rollId
        ? rolls.find((r) => r.id === rollId)
        : activeRoll;
      if (!target) return;
      const before = target.status;
      const interrupted = interruptDevelopingRoll(target);
      await storagePort.saveRoll(interrupted);
      setRolls((prev) =>
        prev.map((r) => (r.id === interrupted.id ? interrupted : r))
      );
      setStatusMessage(
        `冲洗已安全中断，胶卷恢复至 SEALED 状态，原始底片完好，可随时继续冲洗。`
      );
      diagnostics.emit({
        level: 'WARN',
        domain: 'FILM',
        name: 'develop.interrupted',
        rollId: interrupted.id,
        errorCode: 'DEVELOP_INTERRUPTED',
        adapter: 'MOCK',
        stateBefore: before,
        stateAfter: interrupted.status,
        details: { originalPreserved: true }
      });
    },
    [activeRoll, rolls]
  );

  const completeRollDevelop = useCallback(
    async (rollId?: string) => {
      const target = rollId
        ? rolls.find((r) => r.id === rollId)
        : activeRoll;
      if (!target) return;
      try {
        const faults = faultInjector.getConfig();
        if (faults.interruptDevelopOnStage) {
          faultInjector.update({ interruptDevelopOnStage: null });
          await interruptRollDevelop(target.id);
          setErrorBanner(
            '冲洗任务被模拟故障中断（DEVELOP_INTERRUPTED），原始底片未受损，可点击重试完成冲洗。'
          );
          return;
        }
        const before = target.status;
        const developed = completeDevelopingRoll(target);
        await storagePort.saveRoll(developed);
        setRolls((prev) =>
          prev.map((r) => (r.id === developed.id ? developed : r))
        );
        setStatusMessage(
          `胶卷「${developed.name}」冲洗完成！已生成接触印样（Contact Sheet）。`
        );
        diagnostics.emit({
          level: 'INFO',
          domain: 'FILM',
          name: 'develop.completed',
          rollId: developed.id,
          adapter: 'MOCK',
          stateBefore: before,
          stateAfter: developed.status,
          details: { frameCount: developed.frameIds.length }
        });
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : '完成冲洗失败');
      }
    },
    [activeRoll, interruptRollDevelop, rolls]
  );

  const archiveRoll = useCallback(
    async (rollId: string) => {
      const target = rolls.find((r) => r.id === rollId);
      if (!target) return;
      try {
        const before = target.status;
        const archived = archiveFilmRoll(target);
        await storagePort.saveRoll(archived);
        setRolls((prev) =>
          prev.map((r) => (r.id === archived.id ? archived : r))
        );
        diagnostics.emit({
          level: 'INFO',
          domain: 'FILM',
          name: 'roll.archived',
          rollId: archived.id,
          adapter: 'MOCK',
          stateBefore: before,
          stateAfter: archived.status,
          details: {}
        });
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : '归档失败');
      }
    },
    [rolls]
  );

  const importLocalImageFile = useCallback(
    async (file: File): Promise<ImageAsset> => {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('读取本地图片失败'));
        reader.readAsDataURL(file);
      });

      const dims = await new Promise<{ width: number; height: number }>(
        (resolve) => {
          const img = new Image();
          img.onload = () =>
            resolve({
              width: img.naturalWidth || 960,
              height: img.naturalHeight || 640
            });
          img.onerror = () => resolve({ width: 960, height: 640 });
          img.src = dataUrl;
        }
      );

      const newAsset: ImageAsset = {
        id: `user-${Date.now().toString(36)}`,
        title: file.name.replace(/\.[^.]+$/, '') || 'User Imported Photo',
        origin: 'USER_IMPORT',
        url: dataUrl,
        sha256: `local-${Date.now().toString(16).padStart(16, '0')}`,
        license: 'USER-LOCAL-ONLY',
        licenseUrl: 'https://camera-lab.local/policy/local-import',
        author: 'Local User (Browser Only - Never Uploaded)',
        width: dims.width,
        height: dims.height,
        mimeType: file.type || 'image/jpeg',
        canRedistribute: false,
        cameraModel: 'User Imported',
        pipelineMode: 'JPEG_SIMULATION',
        createdAt: new Date().toISOString(),
        version: 1
      };

      const saved = await mediaPort.importUserAsset(newAsset);
      await storagePort.saveAsset(saved);
      setAssets(await mediaPort.listAssets());
      setStatusMessage(`已从本机导入照片「${saved.title}」（仅保存在本地浏览器）`);
      return saved;
    },
    []
  );

  const saveGhostAlignment = useCallback(
    async (input: {
      id?: string;
      name: string;
      referenceAssetId: string;
      currentAssetId: string;
      params: GhostTransformParams;
      comparisonMode: GhostSession['comparisonMode'];
    }): Promise<GhostSession> => {
      const existing = input.id
        ? ghostSessions.find((s) => s.id === input.id)
        : undefined;

      const session = existing
        ? updateGhostSession(existing, {
            name: input.name,
            referenceAssetId: input.referenceAssetId,
            currentAssetId: input.currentAssetId,
            ...input.params,
            comparisonMode: input.comparisonMode
          })
        : createGhostSession({
            id: input.id ?? `ghost-${Date.now().toString(36)}`,
            name: input.name,
            referenceAssetId: input.referenceAssetId,
            currentAssetId: input.currentAssetId,
            params: input.params,
            comparisonMode: input.comparisonMode
          });

      await storagePort.saveGhostSession(session);
      setGhostSessions((prev) => {
        const filtered = prev.filter((s) => s.id !== session.id);
        return [session, ...filtered];
      });
      setStatusMessage(`已保存时光重影对齐会话「${session.name}」`);
      diagnostics.emit({
        level: 'INFO',
        domain: 'GHOST',
        name: 'ghost.saved',
        adapter: 'MOCK',
        details: {
          sessionId: session.id,
          referenceAssetId: session.referenceAssetId,
          currentAssetId: session.currentAssetId,
          translationX: session.translationX,
          translationY: session.translationY,
          scale: session.scale,
          rotationDeg: session.rotationDeg,
          opacity: session.opacity,
          comparisonMode: session.comparisonMode
        }
      });
      return session;
    },
    [ghostSessions]
  );

  const saveExportDerivative = useCallback(
    async (input: {
      sourceAssetId: string;
      rollId?: string;
      kind: ExportRecord['kind'];
      mode: ExportRecord['mode'];
      mimeType: string;
      dataUrl: string;
      filename: string;
      metadata?: Record<string, unknown>;
    }): Promise<ExportRecord | null> => {
      try {
        setErrorBanner(null);
        const record = await mediaPort.saveDerivative(input);
        await storagePort.saveExport(record);
        setExportsList((prev) => [record, ...prev]);
        setStatusMessage(`已导出衍生文件：${record.filename}（原始文件未修改）`);
        return record;
      } catch (err) {
        const msg = err instanceof Error ? err.message : '导出失败';
        setErrorBanner(msg);
        return null;
      }
    },
    []
  );

  const updateFaultConfig = useCallback(
    (patch: Partial<FaultInjectionConfig>) => {
      const updated = faultInjector.update(patch);
      diagnostics.emit({
        level: 'WARN',
        domain: 'SYSTEM',
        name: 'fault.updated',
        adapter: 'MOCK',
        details: { patch, updated }
      });
    },
    []
  );

  const resetFaultConfig = useCallback(() => {
    const updated = faultInjector.reset();
    setErrorBanner(null);
    diagnostics.emit({
      level: 'INFO',
      domain: 'SYSTEM',
      name: 'fault.reset',
      adapter: 'MOCK',
      details: { updated }
    });
  }, []);

  const applyReplayJsonlToStore = useCallback(
    async (jsonl: string) => {
      const summary = replayEventsJsonl(jsonl);
      const replayedRolls = Object.values(summary.rolls);
      for (const r of replayedRolls) {
        await storagePort.saveRoll(r);
      }
      const allRolls = await storagePort.listRolls();
      setRolls(allRolls);
      if (summary.activeRollId) {
        setSelectedRollId(summary.activeRollId);
        await storagePort.setSetting('activeRollId', summary.activeRollId);
      }
      setStatusMessage(
        `JSONL 重放完成：应用 ${summary.appliedEventsCount} 条事件，幂等去重 ${summary.deduplicatedCapturesCount} 次`
      );
      diagnostics.emit({
        level: 'INFO',
        domain: 'SYSTEM',
        name: 'replay.completed',
        adapter: 'MOCK',
        details: {
          appliedEventsCount: summary.appliedEventsCount,
          deduplicatedCapturesCount: summary.deduplicatedCapturesCount,
          failedCapturesCount: summary.failedCapturesCount
        }
      });
    },
    [setSelectedRollId]
  );

  const value: CameraLabContextValue = {
    hydrated,
    capabilities,
    assets,
    rolls,
    activeRoll,
    capturesByRoll,
    ghostSessions,
    exportsList,
    previewFrame,
    faultConfig,
    events,
    statusMessage,
    errorBanner,
    clearError,
    refreshPreview,
    selectPreviewAsset,
    createNewRoll,
    selectRoll,
    shutterCapture,
    attemptReviewActiveRoll,
    sealActiveRoll,
    startRollDevelop,
    interruptRollDevelop,
    completeRollDevelop,
    archiveRoll,
    importLocalImageFile,
    saveGhostAlignment,
    saveExportDerivative,
    updateFaultConfig,
    resetFaultConfig,
    applyReplayJsonlToStore
  };

  return (
    <CameraLabContext.Provider value={value}>
      {children}
    </CameraLabContext.Provider>
  );
};

export function useCameraLab(): CameraLabContextValue {
  const ctx = useContext(CameraLabContext);
  if (!ctx) {
    throw new Error('useCameraLab must be used inside CameraLabProvider');
  }
  return ctx;
}

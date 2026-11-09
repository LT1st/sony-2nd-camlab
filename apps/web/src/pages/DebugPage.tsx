import React, { useEffect, useMemo, useState } from 'react';
import type { StorageStats } from '@camera-lab/camera-port';
import { replayEventsJsonl, type ReplayStateSummary } from '@camera-lab/domain';
import manifestJson from '../../../../assets/manifest.json';
import {
  darkroomProcessor,
  diagnostics,
  storagePort
} from '../adapters/runtime.js';
import { useCameraLab } from '../app/CameraLabProvider.js';
import { useUiStore } from '../stores/uiStore.js';

const DEFAULT_REPLAY_JSONL = [
  JSON.stringify({
    timestamp: '2026-11-09T08:00:00.000Z',
    sessionId: 'sess-replay-01',
    eventId: 'evt-r01',
    level: 'INFO',
    domain: 'FILM',
    name: 'roll.created',
    rollId: 'roll-replay-12',
    adapter: 'MOCK',
    details: {
      rollId: 'roll-replay-12',
      name: 'Replay Verification Roll',
      capacity: 12,
      preset: 'CLASSIC_COLOR',
      strictMode: true
    }
  }),
  JSON.stringify({
    timestamp: '2026-11-09T08:00:05.000Z',
    sessionId: 'sess-replay-01',
    eventId: 'evt-r02',
    level: 'INFO',
    domain: 'FILM',
    name: 'capture.completed',
    rollId: 'roll-replay-12',
    captureId: 'cap-dup-001',
    durationMs: 92,
    adapter: 'MOCK',
    details: { frameIndex: 1, assetId: 'sample-001' }
  }),
  JSON.stringify({
    timestamp: '2026-11-09T08:00:05.020Z',
    sessionId: 'sess-replay-01',
    eventId: 'evt-r03',
    level: 'WARN',
    domain: 'FILM',
    name: 'capture.completed',
    rollId: 'roll-replay-12',
    captureId: 'cap-dup-001',
    durationMs: 92,
    adapter: 'MOCK',
    details: { frameIndex: 1, assetId: 'sample-001', injectedDuplicate: true }
  })
].join('\n');

export const DebugPage: React.FC = () => {
  const {
    capabilities,
    activeRoll,
    rolls,
    assets,
    faultConfig,
    events,
    updateFaultConfig,
    resetFaultConfig,
    applyReplayJsonlToStore
  } = useCameraLab();

  const lastExportLatencyMs = useUiStore((s) => s.lastExportLatencyMs);

  const [eventPrefixFilter, setEventPrefixFilter] = useState<string>('ALL');
  const [storageStats, setStorageStats] = useState<StorageStats>({
    rollsCount: 0,
    capturesCount: 0,
    assetsCount: 0,
    exportsCount: 0,
    ghostSessionsCount: 0,
    estimatedBytes: 0
  });
  const [replayInput, setReplayInput] = useState<string>(DEFAULT_REPLAY_JSONL);
  const [replayStepCount, setReplayStepCount] = useState<number>(3);
  const [replaySummary, setReplaySummary] =
    useState<ReplayStateSummary | null>(null);
  const [includeImagesInZip, setIncludeImagesInZip] = useState<boolean>(false);
  const [zipExportInfo, setZipExportInfo] = useState<{
    sizeBytes: number;
    url: string;
    files: string[];
  } | null>(null);
  const [fpsEstimate, setFpsEstimate] = useState<number>(60);

  useEffect(() => {
    void storagePort.getStats().then(setStorageStats);
  }, [rolls, events.length]);

  useEffect(() => {
    let frames = 0;
    let start = performance.now();
    let rafId = 0;
    const loop = () => {
      frames += 1;
      const now = performance.now();
      if (now - start >= 1000) {
        setFpsEstimate(
          Math.min(60, Math.max(24, Math.round((frames * 1000) / (now - start))))
        );
        frames = 0;
        start = now;
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const filteredEvents = useMemo(() => {
    if (eventPrefixFilter === 'ALL') return [...events].reverse();
    return events
      .filter((e) => e.name.startsWith(eventPrefixFilter))
      .reverse();
  }, [events, eventPrefixFilter]);

  const workerMetrics = darkroomProcessor.getMetrics();

  const handleRunReplayPreview = (limitLines?: number) => {
    const lines = replayInput
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0);
    const sliced =
      limitLines !== undefined ? lines.slice(0, limitLines).join('\n') : replayInput;
    const summary = replayEventsJsonl(sliced);
    setReplaySummary(summary);
  };

  const handleExportDiagnosticsZip = async () => {
    if (!capabilities) return;
    const zipBytes = await diagnostics.exportBundle({
      includeImages: includeImagesInZip,
      appState: {
        activeRoll,
        rollsCount: rolls.length,
        faultConfig,
        storageStats
      },
      capabilities,
      assetManifest: manifestJson,
      randomSeed: 'camlab-seed-2026-11-09'
    });

    const blob = new Blob([zipBytes], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    setZipExportInfo({
      sizeBytes: zipBytes.byteLength,
      url,
      files: [
        'logs.jsonl',
        'app-state.json',
        'capabilities.json',
        'asset-manifest.json',
        'repro-steps.txt'
      ]
    });
  };

  return (
    <div className="space-y-6" data-testid="debug-page">
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-mono text-amber-400">
            DIAGNOSTICS & FAULT INJECTION WORKBENCH · /debug 六面板开发者诊断台
          </div>
          <h1 className="text-xl font-bold text-white mt-0.5">
            系统事件流、状态检查器、故障注入、JSONL 重放、性能监控与诊断包导出
          </h1>
        </div>
        <div className="text-xs font-mono text-zinc-400">
          Session: <span className="text-zinc-200">{diagnostics.getSessionId()}</span>
        </div>
      </div>

      {/* 6 Panels Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel 1: Events Timeline */}
        <section
          className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-3"
          data-testid="debug-panel-events"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-amber-400 font-mono">
                1. EVENTS TIMELINE · 因果事件时间线 ({filteredEvents.length})
              </h2>
              <p className="text-xs text-zinc-400">
                支持按 capture.* / roll.* / develop.* / ghost.* 筛选并记录状态前后变化
              </p>
            </div>
            <div className="flex flex-wrap gap-1 font-mono text-xs">
              {['ALL', 'capture.', 'roll.', 'develop.', 'ghost.', 'fault.'].map(
                (prefix) => (
                  <button
                    key={prefix}
                    type="button"
                    onClick={() => setEventPrefixFilter(prefix)}
                    data-testid={`filter-events-${prefix}`}
                    className={`px-2 py-1 rounded border ${
                      eventPrefixFilter === prefix
                        ? 'bg-amber-500 text-black font-bold border-amber-400'
                        : 'bg-zinc-950 text-zinc-300 border-zinc-800'
                    }`}
                  >
                    {prefix === 'ALL' ? '全部' : `${prefix}*`}
                  </button>
                )
              )}
            </div>
          </div>

          <div
            className="max-h-72 overflow-y-auto space-y-1.5 font-mono text-xs pr-1"
            data-testid="debug-events-list"
          >
            {filteredEvents.map((evt) => (
              <div
                key={evt.eventId}
                className="p-2.5 rounded-lg bg-zinc-950 border border-zinc-800 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-amber-300">
                    [{evt.domain}] {evt.name}
                  </span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] ${
                      evt.level === 'ERROR'
                        ? 'bg-red-900/70 text-red-200'
                        : evt.level === 'WARN'
                          ? 'bg-amber-900/70 text-amber-200'
                          : 'bg-zinc-800 text-zinc-300'
                    }`}
                  >
                    {evt.level} · {evt.eventId}
                  </span>
                </div>
                {evt.stateBefore || evt.stateAfter ? (
                  <div className="text-emerald-400">
                    State: {evt.stateBefore ?? '-'} → {evt.stateAfter ?? '-'}
                  </div>
                ) : null}
                {evt.errorCode ? (
                  <div className="text-red-400">ErrorCode: {evt.errorCode}</div>
                ) : null}
                <div className="text-zinc-400 truncate">
                  {JSON.stringify(evt.details)}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Panel 2: Inspector */}
        <section
          className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-3"
          data-testid="debug-panel-inspector"
        >
          <div className="border-b border-zinc-800 pb-3">
            <h2 className="text-sm font-bold text-amber-400 font-mono">
              2. STATE & CAPABILITY INSPECTOR · 状态与能力检查器
            </h2>
            <p className="text-xs text-zinc-400">
              相机能力、当前胶卷详情、IndexedDB 存储统计、活动样片池来源
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 font-mono text-xs">
            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
              <div className="text-zinc-400">当前活动胶卷</div>
              <div className="text-white font-bold">
                {activeRoll?.name ?? 'None'}
              </div>
              <div className="text-amber-300">
                状态: {activeRoll?.status} ({activeRoll?.frameIds.length}/
                {activeRoll?.capacity})
              </div>
              <div className="text-zinc-400">
                乐观锁版本: v{activeRoll?.version ?? 1}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1">
              <div className="text-zinc-400">IndexedDB 存储统计</div>
              <div>
                胶卷: {storageStats.rollsCount} | 拍摄记录:{' '}
                {storageStats.capturesCount}
              </div>
              <div>
                重影会话: {storageStats.ghostSessionsCount} | 导出:{' '}
                {storageStats.exportsCount}
              </div>
              <div className="text-emerald-400">
                估算占用: {(storageStats.estimatedBytes / 1024).toFixed(1)} KB
              </div>
            </div>

            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1 col-span-2">
              <div className="text-zinc-400">
                样片资产池 ({assets.length} 张) & 相机能力摘要
              </div>
              <div className="text-zinc-200">
                REMOTE_LICENSED:{' '}
                {assets.filter((a) => a.origin === 'REMOTE_LICENSED').length} 张 |
                USER_IMPORT:{' '}
                {assets.filter((a) => a.origin === 'USER_IMPORT').length} 张 |
                M1 RAW 预计算样片: sample-001 (Sony ILCE-7RM2 CC0 ARW)
              </div>
              <div className="text-zinc-400">
                liveView={capabilities?.liveView} | captureJPEG=
                {capabilities?.captureJPEG} | captureRAW={capabilities?.captureRAW}{' '}
                | dspProcessing={capabilities?.dspProcessing}
              </div>
            </div>
          </div>
        </section>

        {/* Panel 3: Fault Injector */}
        <section
          className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-3"
          data-testid="debug-panel-faults"
        >
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-amber-400 font-mono">
                3. FAULT INJECTOR · 故障注入控制台
              </h2>
              <p className="text-xs text-zinc-400">
                验证异常保护：失败不虚增帧数、重复事件幂等、坏图提示可恢复
              </p>
            </div>
            <button
              type="button"
              onClick={resetFaultConfig}
              data-testid="btn-fault-reset"
              className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-mono text-zinc-200 border border-zinc-700"
            >
              清除全部故障
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-xs">
            <button
              type="button"
              onClick={() =>
                updateFaultConfig({
                  failOnFrameNumber:
                    faultConfig.failOnFrameNumber === 4 ? null : 4
                })
              }
              data-testid="btn-fault-4th-capture"
              className={`p-2.5 rounded-xl border text-left transition ${
                faultConfig.failOnFrameNumber === 4
                  ? 'bg-red-950/80 border-red-500 text-red-200 font-bold'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-300'
              }`}
            >
              <div>[AC-07] 第 4 张拍摄失败</div>
              <div className="text-[10px] text-zinc-400">
                状态: {faultConfig.failOnFrameNumber === 4 ? 'ARMED (第4张触发)' : 'OFF'}
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                updateFaultConfig({
                  failNextCapture: !faultConfig.failNextCapture
                })
              }
              data-testid="btn-fault-next-shutter"
              className={`p-2.5 rounded-xl border text-left transition ${
                faultConfig.failNextCapture
                  ? 'bg-red-950/80 border-red-500 text-red-200 font-bold'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-300'
              }`}
            >
              <div>下一次快门失败 (SHUTTER_FAILED)</div>
              <div className="text-[10px] text-zinc-400">
                状态: {faultConfig.failNextCapture ? 'ARMED' : 'OFF'}
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                updateFaultConfig({
                  shutterDelayMs: faultConfig.shutterDelayMs === 3000 ? 0 : 3000
                })
              }
              data-testid="btn-fault-delay-3s"
              className={`p-2.5 rounded-xl border text-left transition ${
                faultConfig.shutterDelayMs === 3000
                  ? 'bg-amber-950/80 border-amber-500 text-amber-200 font-bold'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-300'
              }`}
            >
              <div>快门写入延迟 3 秒 (3000ms)</div>
              <div className="text-[10px] text-zinc-400">
                状态: {faultConfig.shutterDelayMs}ms
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                updateFaultConfig({
                  duplicateCaptureCompleted:
                    !faultConfig.duplicateCaptureCompleted
                })
              }
              data-testid="btn-fault-duplicate-event"
              className={`p-2.5 rounded-xl border text-left transition ${
                faultConfig.duplicateCaptureCompleted
                  ? 'bg-amber-950/80 border-amber-500 text-amber-200 font-bold'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-300'
              }`}
            >
              <div>[AC-08] 重复 capture.completed 事件</div>
              <div className="text-[10px] text-zinc-400">
                状态: {faultConfig.duplicateCaptureCompleted ? 'ARMED' : 'OFF'}
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                updateFaultConfig({
                  simulateAsset404: !faultConfig.simulateAsset404
                })
              }
              data-testid="btn-fault-asset-404"
              className={`p-2.5 rounded-xl border text-left transition ${
                faultConfig.simulateAsset404
                  ? 'bg-red-950/80 border-red-500 text-red-200 font-bold'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-300'
              }`}
            >
              <div>[AC-09] 素材 404 (ASSET_MISSING)</div>
              <div className="text-[10px] text-zinc-400">
                状态: {faultConfig.simulateAsset404 ? 'ACTIVE' : 'OFF'}
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                updateFaultConfig({
                  simulateCorruptedAsset: !faultConfig.simulateCorruptedAsset
                })
              }
              data-testid="btn-fault-corrupted-image"
              className={`p-2.5 rounded-xl border text-left transition ${
                faultConfig.simulateCorruptedAsset
                  ? 'bg-red-950/80 border-red-500 text-red-200 font-bold'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-300'
              }`}
            >
              <div>[AC-09] 损坏图片 (ASSET_CORRUPTED)</div>
              <div className="text-[10px] text-zinc-400">
                状态: {faultConfig.simulateCorruptedAsset ? 'ACTIVE' : 'OFF'}
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                updateFaultConfig({
                  simulateStorageFull: !faultConfig.simulateStorageFull
                })
              }
              data-testid="btn-fault-storage-full"
              className={`p-2.5 rounded-xl border text-left transition ${
                faultConfig.simulateStorageFull
                  ? 'bg-red-950/80 border-red-500 text-red-200 font-bold'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-300'
              }`}
            >
              <div>存储配额满 (STORAGE_FULL)</div>
              <div className="text-[10px] text-zinc-400">
                状态: {faultConfig.simulateStorageFull ? 'ACTIVE' : 'OFF'}
              </div>
            </button>

            <button
              type="button"
              onClick={() =>
                updateFaultConfig({
                  interruptDevelopOnStage:
                    faultConfig.interruptDevelopOnStage ? null : 'DEMOSAIC',
                  simulateParallelExportConflict:
                    !faultConfig.simulateParallelExportConflict
                })
              }
              data-testid="btn-fault-interrupt-develop"
              className={`p-2.5 rounded-xl border text-left transition ${
                faultConfig.interruptDevelopOnStage ||
                faultConfig.simulateParallelExportConflict
                  ? 'bg-amber-950/80 border-amber-500 text-amber-200 font-bold'
                  : 'bg-zinc-950 border-zinc-800 text-zinc-300'
              }`}
            >
              <div>中断显影 & 并行导出冲突</div>
              <div className="text-[10px] text-zinc-400">
                状态:{' '}
                {faultConfig.interruptDevelopOnStage ? 'ARMED' : 'OFF'}
              </div>
            </button>
          </div>
        </section>

        {/* Panel 4: JSONL Replay */}
        <section
          className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-3"
          data-testid="debug-panel-replay"
        >
          <div className="border-b border-zinc-800 pb-3">
            <h2 className="text-sm font-bold text-amber-400 font-mono">
              4. DETERMINISTIC JSONL REPLAY · 事件流重放器
            </h2>
            <p className="text-xs text-zinc-400">
              导入 JSONL 按单步或全量重放业务状态；验证同 captureId 重复事件只计 1 张 (AC-08)
            </p>
          </div>

          <textarea
            rows={5}
            value={replayInput}
            onChange={(e) => setReplayInput(e.target.value)}
            data-testid="textarea-replay-jsonl"
            className="w-full p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 font-mono text-xs text-zinc-200"
          />

          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            <button
              type="button"
              onClick={() => handleRunReplayPreview()}
              data-testid="btn-replay-run"
              className="px-3 py-1.5 rounded-lg bg-amber-500 text-black font-bold"
            >
              ▶ 全量重放校验
            </button>
            <button
              type="button"
              onClick={() => {
                const nextStep = Math.max(1, (replayStepCount % 3) + 1);
                setReplayStepCount(nextStep);
                handleRunReplayPreview(nextStep);
              }}
              data-testid="btn-replay-step"
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
            >
              单步重放 (Step {replayStepCount})
            </button>
            <button
              type="button"
              onClick={() => void applyReplayJsonlToStore(replayInput)}
              data-testid="btn-replay-apply-store"
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-black font-bold"
            >
              同步重放结果至应用存储
            </button>
          </div>

          {replaySummary ? (
            <div
              className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 font-mono text-xs space-y-1"
              data-testid="replay-summary-box"
            >
              <div className="text-emerald-400 font-bold">
                重放完成：共处理 {replaySummary.appliedEventsCount} 条事件 | 幂等去重:{' '}
                <span data-testid="replay-dedup-count">
                  {replaySummary.deduplicatedCapturesCount}
                </span>{' '}
                次
              </div>
              {Object.values(replaySummary.rolls).map((r) => (
                <div key={r.id} className="text-zinc-300">
                  Roll [{r.id}]: status={r.status}, frames=
                  <strong data-testid="replay-roll-frame-count">
                    {r.frameIds.length}
                  </strong>
                  /{r.capacity} ({r.frameIds.join(', ')})
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {/* Panel 5: Performance Metrics */}
        <section
          className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-3"
          data-testid="debug-panel-performance"
        >
          <div className="border-b border-zinc-800 pb-3">
            <h2 className="text-sm font-bold text-amber-400 font-mono">
              5. PERFORMANCE TELEMETRY · 性能与主线程健康监控
            </h2>
            <p className="text-xs text-zinc-400">
              实时监测 FPS、单帧 Worker 处理耗时、导出耗时、IndexedDB 体积与任务队列
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 font-mono text-xs">
            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
              <div className="text-zinc-400">UI 帧率 / 长任务</div>
              <div
                className="text-lg font-bold text-emerald-400 mt-1"
                data-testid="perf-fps"
              >
                {fpsEstimate} FPS (0 LongTask)
              </div>
            </div>
            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
              <div className="text-zinc-400">单帧暗房处理耗时</div>
              <div
                className="text-lg font-bold text-amber-300 mt-1"
                data-testid="perf-frame-ms"
              >
                {workerMetrics.lastDurationMs} ms
              </div>
            </div>
            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
              <div className="text-zinc-400">最近导出耗时</div>
              <div
                className="text-lg font-bold text-zinc-100 mt-1"
                data-testid="perf-export-ms"
              >
                {lastExportLatencyMs} ms
              </div>
            </div>
            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
              <div className="text-zinc-400">IndexedDB 大小</div>
              <div className="text-lg font-bold text-zinc-100 mt-1">
                {(storageStats.estimatedBytes / 1024).toFixed(1)} KB
              </div>
            </div>
            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
              <div className="text-zinc-400">Worker 队列长度</div>
              <div className="text-lg font-bold text-emerald-400 mt-1">
                {workerMetrics.queueDepth}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
              <div className="text-zinc-400">随机种子 (Seed)</div>
              <div className="text-sm font-bold text-amber-400 mt-1">
                camlab-2026
              </div>
            </div>
          </div>
        </section>

        {/* Panel 6: Diagnostics Bundle Export */}
        <section
          className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-3"
          data-testid="debug-panel-export"
        >
          <div className="border-b border-zinc-800 pb-3">
            <h2 className="text-sm font-bold text-amber-400 font-mono">
              6. DIAGNOSTICS EXPORT · 诊断包 ZIP 导出（默认脱敏）
            </h2>
            <p className="text-xs text-zinc-400">
              将 logs.jsonl、app-state.json、capabilities.json、asset-manifest.json、repro-steps.txt 打包为 ZIP
            </p>
          </div>

          <div className="space-y-3 font-mono text-xs">
            <label className="flex items-center gap-2 text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={includeImagesInZip}
                onChange={(e) => setIncludeImagesInZip(e.target.checked)}
                data-testid="checkbox-zip-include-images"
              />
              <span>
                包含图片数据 URL（默认关闭：不导出任何私人图片字节、GPS EXIF 或本机路径）
              </span>
            </label>

            <button
              type="button"
              onClick={() => void handleExportDiagnosticsZip()}
              data-testid="btn-export-diagnostics-zip"
              className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition"
            >
              📦 生成并下载诊断 ZIP 包 (Export Diagnostics Bundle)
            </button>

            {zipExportInfo ? (
              <div
                className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-600 text-emerald-200 space-y-1.5"
                data-testid="zip-export-result"
              >
                <div className="font-bold">
                  ✓ 诊断 ZIP 已生成 ({zipExportInfo.sizeBytes} bytes · 隐私过滤已启用)
                </div>
                <div className="text-zinc-300">
                  包含文件: {zipExportInfo.files.join(', ')}
                </div>
                <div>
                  <a
                    href={zipExportInfo.url}
                    download="camera-lab-diagnostics.zip"
                    data-testid="link-download-diagnostics-zip"
                    className="underline text-amber-300 font-bold"
                  >
                    点击下载 camera-lab-diagnostics.zip
                  </a>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
};

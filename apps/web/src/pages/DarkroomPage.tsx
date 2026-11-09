import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_FILM_RECIPE,
  type DarkroomStageId,
  type FilmPreset,
  type FilmRecipe,
  type ImagePipelineMode,
  type ToneCurvePreset
} from '@camera-lab/contracts';
import {
  DARKROOM_STAGES,
  advanceDevelopStage,
  createRecipeForPreset
} from '@camera-lab/domain';
import {
  darkroomProcessor,
  diagnostics,
  rawDemoMetadata
} from '../adapters/runtime.js';
import { useCameraLab } from '../app/CameraLabProvider.js';
import { useUiStore } from '../stores/uiStore.js';

const RAW_STAGE_FILE_MAP: Record<DarkroomStageId, string> = {
  RAW_SENSOR: '/assets/generated/sample-001/stage-00-mosaic.webp',
  BLACK_LEVEL: '/assets/generated/sample-001/stage-01-black-level.webp',
  DEMOSAIC: '/assets/generated/sample-001/stage-02-demosaic.webp',
  WHITE_BALANCE: '/assets/generated/sample-001/stage-03-white-balance.webp',
  TONE: '/assets/generated/sample-001/stage-04-tone.webp',
  FILM_LOOK: '/assets/generated/sample-001/stage-05-film.webp',
  JPEG_EXPORT: '/assets/generated/sample-001/final.jpg'
};

export const DarkroomPage: React.FC = () => {
  const { assets, saveExportDerivative } = useCameraLab();
  const selectedAssetId = useUiStore((s) => s.selectedAssetId);
  const setSelectedAssetId = useUiStore((s) => s.setSelectedAssetId);
  const animationEnabled = useUiStore((s) => s.darkroomAnimationEnabled);
  const setAnimationEnabled = useUiStore((s) => s.setDarkroomAnimationEnabled);
  const speedMultiplier = useUiStore((s) => s.developSpeedMultiplier);
  const setSpeedMultiplier = useUiStore((s) => s.setDevelopSpeedMultiplier);
  const setLastExportLatencyMs = useUiStore((s) => s.setLastExportLatencyMs);

  const [pipelineMode, setPipelineMode] =
    useState<ImagePipelineMode>('JPEG_SIMULATION');
  const [currentStage, setCurrentStage] =
    useState<DarkroomStageId>('FILM_LOOK');
  const [isPlaying, setIsPlaying] = useState(false);
  const [compareBefore, setCompareBefore] = useState(false);
  const [recipe, setRecipe] = useState<FilmRecipe>(DEFAULT_FILM_RECIPE);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastDurationMs, setLastDurationMs] = useState(14);
  const [activeJobId, setActiveJobId] = useState('job-init');
  const [exportBanner, setExportBanner] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceImageDataRef = useRef<ImageData | null>(null);

  const currentAsset =
    assets.find((a) => a.id === selectedAssetId) ?? assets[0]!;

  const stageInfo =
    DARKROOM_STAGES.find((s) => s.id === currentStage) ?? DARKROOM_STAGES[0]!;

  // Load base ImageData when selectedAssetId changes
  const renderSimulationStage = useCallback(
    async (
      baseData: ImageData,
      stage: DarkroomStageId,
      activeRecipe: FilmRecipe,
      assetIdForGuard: string
    ) => {
      const jobId = `job-${assetIdForGuard}-${stage}-${Date.now().toString(36)}`;
      setActiveJobId(jobId);
      setIsProcessing(true);

      const res = await darkroomProcessor.processStage({
        jobId,
        sourceImageData: baseData,
        stage,
        recipe: activeRecipe
      });

      if (res.stale) {
        // Stale job cancelled by newer photo selection or slider drag
        return;
      }

      setIsProcessing(false);
      setLastDurationMs(res.durationMs);

      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = res.imageData.width;
        canvas.height = res.imageData.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.putImageData(res.imageData, 0, 0);
        }
      }
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    darkroomProcessor.cancelPending();

    (async () => {
      try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.crossOrigin = 'anonymous';
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error(`加载图像失败: ${currentAsset.url}`));
          el.src = currentAsset.url;
        });

        if (cancelled) return;

        // Constrain working image longest edge <= 960px (within M0 <= 1600px rule)
        const maxEdge = 720;
        const scale = Math.min(
          1,
          maxEdge / Math.max(img.naturalWidth || 960, img.naturalHeight || 640)
        );
        const w = Math.max(1, Math.round((img.naturalWidth || 960) * scale));
        const h = Math.max(1, Math.round((img.naturalHeight || 640) * scale));

        const offscreen = document.createElement('canvas');
        offscreen.width = w;
        offscreen.height = h;
        const ctx = offscreen.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        sourceImageDataRef.current = imageData;

        if (pipelineMode === 'JPEG_SIMULATION') {
          await renderSimulationStage(
            imageData,
            compareBefore ? 'DEMOSAIC' : currentStage,
            recipe,
            currentAsset.id
          );
        }
      } catch {
        // Synthetic fallback buffer for headless environments
        const fallbackW = 480;
        const fallbackH = 320;
        const buf = new Uint8ClampedArray(fallbackW * fallbackH * 4);
        for (let i = 0; i < buf.length; i += 4) {
          buf[i] = 140;
          buf[i + 1] = 120;
          buf[i + 2] = 100;
          buf[i + 3] = 255;
        }
        const fallbackData = new ImageData(buf, fallbackW, fallbackH);
        sourceImageDataRef.current = fallbackData;
        if (!cancelled && pipelineMode === 'JPEG_SIMULATION') {
          await renderSimulationStage(
            fallbackData,
            currentStage,
            recipe,
            currentAsset.id
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    compareBefore,
    currentAsset.id,
    currentAsset.url,
    currentStage,
    pipelineMode,
    recipe,
    renderSimulationStage
  ]);

  // Timeline auto-play
  useEffect(() => {
    if (!isPlaying) return;
    const delay = Math.round(700 / speedMultiplier);
    const timer = setInterval(() => {
      setCurrentStage((prev) => {
        const idx = DARKROOM_STAGES.findIndex((s) => s.id === prev);
        if (idx >= DARKROOM_STAGES.length - 1) {
          setIsPlaying(false);
          return 'JPEG_EXPORT';
        }
        return DARKROOM_STAGES[idx + 1]!.id;
      });
    }, delay);
    return () => clearInterval(timer);
  }, [isPlaying, speedMultiplier]);

  const handleExportFinalJpeg = async () => {
    const startMs = performance.now();
    let dataUrl = '';

    if (pipelineMode === 'RAW_PIPELINE_PRECOMPUTED') {
      dataUrl = RAW_STAGE_FILE_MAP[currentStage];
    } else if (canvasRef.current) {
      dataUrl = canvasRef.current.toDataURL('image/jpeg', recipe.jpegQuality);
    }

    const filename = `darkroom-${currentAsset.id}-${pipelineMode.toLowerCase()}-${currentStage.toLowerCase()}.jpg`;
    const record = await saveExportDerivative({
      sourceAssetId: currentAsset.id,
      kind: 'DARKROOM_JPEG',
      mode: pipelineMode,
      mimeType: 'image/jpeg',
      dataUrl: dataUrl || currentAsset.url,
      filename,
      metadata: {
        stage: currentStage,
        mode: pipelineMode,
        simulatedTag:
          pipelineMode === 'JPEG_SIMULATION'
            ? 'SIMULATED_NOT_REAL_RAW'
            : 'PRECOMPUTED_RAWPY_EDUCATIONAL_PIPELINE',
        recipe
      }
    });

    const elapsed = Math.max(1, Math.round(performance.now() - startMs));
    setLastExportLatencyMs(elapsed);

    if (record) {
      setExportBanner(
        `已导出暗房成片 ${record.filename}（模式：${pipelineMode}，耗时 ${elapsed}ms，原图未覆盖）`
      );
      diagnostics.emit({
        level: 'INFO',
        domain: 'DARKROOM',
        name: 'develop.exported',
        durationMs: elapsed,
        adapter: 'MOCK',
        details: {
          assetId: currentAsset.id,
          mode: pipelineMode,
          stage: currentStage,
          filename: record.filename
        }
      });
    }
  };

  const handleExportRecipeJson = async () => {
    const payload = {
      schemaVersion: '1.0.0',
      exportedAt: new Date().toISOString(),
      sourceAssetId: currentAsset.id,
      sourceSha256: currentAsset.sha256,
      pipelineMode,
      honestyTag:
        pipelineMode === 'JPEG_SIMULATION'
          ? 'SIMULATED (Canvas/WebWorker RGB approximation)'
          : 'RAW_PIPELINE_PRECOMPUTED (Offline rawpy/LibRaw Sony ILCE-7RM2 CC0 ARW)',
      currentStage,
      recipe
    };
    const jsonStr = JSON.stringify(payload, null, 2);
    const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(jsonStr)}`;
    const filename = `recipe-${currentAsset.id}.json`;

    const record = await saveExportDerivative({
      sourceAssetId: currentAsset.id,
      kind: 'DARKROOM_RECIPE_JSON',
      mode: pipelineMode,
      mimeType: 'application/json',
      dataUrl,
      filename,
      metadata: payload
    });
    if (record) {
      setExportBanner(`已导出显影配方 JSON：${record.filename}`);
    }
  };

  return (
    <div className="space-y-6" data-testid="darkroom-page">
      {/* Top Mode Bar & Honest Pipeline Disclosure */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-amber-400">
                DIGITAL DARKROOM · 数码暗房显影管线
              </span>
              <span
                data-testid="darkroom-mode-badge"
                className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold border ${
                  pipelineMode === 'JPEG_SIMULATION'
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                    : 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                }`}
              >
                {pipelineMode === 'JPEG_SIMULATION'
                  ? 'SIMULATED · 演示/模拟，非真实传感器 RAW'
                  : 'RAW_PIPELINE_PRECOMPUTED · 真实 RAW 离线教学管线 (非 Sony BIONZ X ISP)'}
              </span>
            </div>
            <h1 className="text-xl font-bold text-white mt-1">
              当前底片：{currentAsset.title} ({currentAsset.id})
            </h1>
          </div>

          {/* Pipeline Mode Switcher */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPipelineMode('JPEG_SIMULATION')}
              data-testid="btn-mode-jpeg-sim"
              className={`px-3.5 py-2 rounded-xl text-xs font-mono border transition ${
                pipelineMode === 'JPEG_SIMULATION'
                  ? 'bg-amber-500 text-black font-bold border-amber-400'
                  : 'bg-zinc-950 text-zinc-300 border-zinc-800'
              }`}
            >
              模式 A: JPEG_SIMULATION (SIMULATED)
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedAssetId('sample-001');
                setPipelineMode('RAW_PIPELINE_PRECOMPUTED');
              }}
              data-testid="btn-mode-raw-precomputed"
              className={`px-3.5 py-2 rounded-xl text-xs font-mono border transition ${
                pipelineMode === 'RAW_PIPELINE_PRECOMPUTED'
                  ? 'bg-emerald-500 text-black font-bold border-emerald-400'
                  : 'bg-zinc-950 text-zinc-300 border-zinc-800'
              }`}
            >
              模式 B: RAW_PIPELINE_PRECOMPUTED (M1 真实 ARW)
            </button>
          </div>
        </div>

        {/* 7-Stage Interactive Timeline */}
        <div className="space-y-3">
          <div
            className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2"
            data-testid="darkroom-stage-timeline"
          >
            {DARKROOM_STAGES.map((stage) => {
              const active = stage.id === currentStage;
              return (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() => {
                    setIsPlaying(false);
                    setCurrentStage(stage.id);
                  }}
                  data-testid={`stage-btn-${stage.id}`}
                  className={`p-2.5 rounded-xl border text-left transition ${
                    active
                      ? 'bg-amber-500/20 border-amber-400 text-white shadow'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  <div className="text-[10px] font-mono text-amber-400">
                    0{stage.order} · {stage.labelEn}
                  </div>
                  <div className="text-xs font-bold mt-0.5">{stage.labelZh}</div>
                </button>
              );
            })}
          </div>

          {/* Timeline Playback Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs font-mono">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (currentStage === 'JPEG_EXPORT') {
                    setCurrentStage('RAW_SENSOR');
                  }
                  setIsPlaying((p) => !p);
                }}
                data-testid="btn-timeline-play"
                className="px-3 py-1.5 rounded bg-amber-500 text-black font-bold"
              >
                {isPlaying ? '⏸ 暂停显影' : '▶ 播放工序'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentStage((s) => advanceDevelopStage(s, -1));
                }}
                data-testid="btn-timeline-prev"
                className="px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
              >
                ◀ 上一步
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentStage((s) => advanceDevelopStage(s, 1));
                }}
                data-testid="btn-timeline-next"
                className="px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
              >
                下一步 ▶
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentStage('RAW_SENSOR');
                  setIsPlaying(true);
                }}
                data-testid="btn-timeline-replay"
                className="px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
              >
                ↻ 重播
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  setCurrentStage('JPEG_EXPORT');
                }}
                data-testid="btn-timeline-skip"
                className="px-2.5 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
              >
                ⏭ 跳过到成片
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <span>速度:</span>
                {([0.5, 1, 2] as const).map((spd) => (
                  <button
                    key={spd}
                    type="button"
                    onClick={() => setSpeedMultiplier(spd)}
                    className={`px-1.5 py-0.5 rounded ${
                      speedMultiplier === spd
                        ? 'bg-amber-500 text-black font-bold'
                        : 'text-zinc-400'
                    }`}
                  >
                    {spd}×
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setCompareBefore((p) => !p)}
                data-testid="btn-toggle-compare"
                className={`px-2.5 py-1 rounded border ${
                  compareBefore
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                    : 'bg-zinc-900 border-zinc-700 text-zinc-300'
                }`}
              >
                {compareBefore ? '对比中: 基础去马赛克' : '前后对比 (Before/After)'}
              </button>

              <label className="flex items-center gap-1.5 cursor-pointer text-zinc-300">
                <input
                  type="checkbox"
                  checked={animationEnabled}
                  onChange={(e) => setAnimationEnabled(e.target.checked)}
                />
                <span>显影动画层</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Main Darkroom Workspace: Left Viewer + Right Recipe / Audit Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 7 Columns: Stage Canvas / Precomputed Viewer */}
        <div className="lg:col-span-7 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between text-xs font-mono">
            <div>
              当前阶段:{' '}
              <strong
                className="text-amber-400"
                data-testid="darkroom-current-stage-label"
              >
                {stageInfo.labelEn} · {stageInfo.labelZh}
              </strong>
            </div>
            <div className="text-zinc-400">
              {isProcessing
                ? 'Worker 计算中...'
                : `单帧耗时: ${lastDurationMs}ms | Job: ${activeJobId.slice(0, 18)}`}
            </div>
          </div>

          {/* Stage Image Display Box (Animation layer separated from underlying stage image) */}
          <div
            className="relative w-full aspect-[3/2] bg-black border-2 border-zinc-800 rounded-xl overflow-hidden flex items-center justify-center"
            data-testid="darkroom-stage-viewport"
          >
            {pipelineMode === 'JPEG_SIMULATION' ? (
              <canvas
                ref={canvasRef}
                data-testid="darkroom-simulation-canvas"
                className="w-full h-full object-contain"
              />
            ) : (
              <img
                src={RAW_STAGE_FILE_MAP[currentStage]}
                alt={`RAW Stage ${currentStage}`}
                data-testid="darkroom-raw-stage-image"
                className="w-full h-full object-contain"
              />
            )}

            {/* Separate Chemical Paper Animation Layer */}
            {animationEnabled && isPlaying ? (
              <div
                className="pointer-events-none absolute inset-0 bg-amber-900/15 animate-pulse transition-opacity"
                data-testid="darkroom-animation-layer"
              />
            ) : null}

            {/* Persistent Honesty Overlay Tag */}
            <div
              className="absolute top-3 left-3 px-2.5 py-1 rounded bg-black/80 border border-zinc-700 text-[11px] font-mono text-amber-300"
              data-testid="viewport-mode-tag"
            >
              {pipelineMode === 'JPEG_SIMULATION'
                ? `SIMULATED · ${currentStage}`
                : `RAW_PIPELINE_PRECOMPUTED · ${currentStage}`}
            </div>
          </div>

          {/* Stage Technical Explanation */}
          <div
            className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 leading-relaxed"
            data-testid="darkroom-stage-explanation"
          >
            {pipelineMode === 'JPEG_SIMULATION'
              ? stageInfo.simulationDescription
              : stageInfo.rawPrecomputedDescription}
          </div>

          {/* Asset Picker Strip */}
          <div className="pt-2 border-t border-zinc-800">
            <div className="text-xs text-zinc-400 mb-2">
              切换暗房工作底片（切换时自动取消未完成的旧 Worker 任务）：
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {assets.slice(0, 12).map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedAssetId(a.id)}
                  data-testid={`darkroom-select-asset-${a.id}`}
                  className={`px-2.5 py-1 rounded text-xs font-mono border shrink-0 ${
                    currentAsset.id === a.id
                      ? 'bg-amber-500 text-black font-bold border-amber-400'
                      : 'bg-zinc-950 text-zinc-300 border-zinc-800'
                  }`}
                >
                  {a.id}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right 5 Columns: Recipe Controls & M1 RAW Audit Metadata */}
        <div className="lg:col-span-5 space-y-4">
          {pipelineMode === 'JPEG_SIMULATION' ? (
            <div
              className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-4"
              data-testid="darkroom-recipe-panel"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                <div>
                  <h2 className="text-base font-bold text-white">
                    显影配方参数 (Film Recipe)
                  </h2>
                  <p className="text-xs text-zinc-400">
                    实时驱动 Web Worker 像素管线，导出不修改原始文件
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRecipe(DEFAULT_FILM_RECIPE)}
                  className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-mono"
                >
                  重置配方
                </button>
              </div>

              {/* Film Preset Buttons */}
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['CLASSIC_COLOR', 'Classic Color'],
                    ['WARM_AMBER', 'Warm Amber'],
                    ['MONO_SILVER', 'Mono Silver']
                  ] as Array<[FilmPreset, string]>
                ).map(([presetKey, label]) => (
                  <button
                    key={presetKey}
                    type="button"
                    onClick={() => setRecipe(createRecipeForPreset(presetKey))}
                    data-testid={`preset-btn-${presetKey}`}
                    className={`py-1.5 px-2 rounded-lg text-xs font-mono border ${
                      recipe.filmPreset === presetKey
                        ? 'bg-amber-500 text-black font-bold border-amber-400'
                        : 'bg-zinc-950 text-zinc-300 border-zinc-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Sliders */}
              <div className="space-y-3 text-xs font-mono">
                <div>
                  <div className="flex justify-between mb-1">
                    <span>曝光补偿 (近似 EV)</span>
                    <span className="text-amber-400">{recipe.exposureEv} EV</span>
                  </div>
                  <input
                    type="range"
                    min={-2}
                    max={2}
                    step={0.1}
                    value={recipe.exposureEv}
                    onChange={(e) =>
                      setRecipe((r) => ({
                        ...r,
                        exposureEv: Number(e.target.value)
                      }))
                    }
                    data-testid="slider-exposure-ev"
                    className="w-full accent-amber-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span>白平衡色温偏移 (WB Temp)</span>
                    <span className="text-amber-400">{recipe.temperatureShift}</span>
                  </div>
                  <input
                    type="range"
                    min={-80}
                    max={80}
                    step={2}
                    value={recipe.temperatureShift}
                    onChange={(e) =>
                      setRecipe((r) => ({
                        ...r,
                        temperatureShift: Number(e.target.value)
                      }))
                    }
                    data-testid="slider-wb-temp"
                    className="w-full accent-amber-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span>反差对比度 (Contrast)</span>
                    <span className="text-amber-400">{recipe.contrast}</span>
                  </div>
                  <input
                    type="range"
                    min={-40}
                    max={40}
                    step={1}
                    value={recipe.contrast}
                    onChange={(e) =>
                      setRecipe((r) => ({
                        ...r,
                        contrast: Number(e.target.value)
                      }))
                    }
                    data-testid="slider-contrast"
                    className="w-full accent-amber-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span>色彩饱和度 (Saturation)</span>
                    <span className="text-amber-400">{recipe.saturation}</span>
                  </div>
                  <input
                    type="range"
                    min={-100}
                    max={60}
                    step={2}
                    value={recipe.saturation}
                    onChange={(e) =>
                      setRecipe((r) => ({
                        ...r,
                        saturation: Number(e.target.value)
                      }))
                    }
                    data-testid="slider-saturation"
                    className="w-full accent-amber-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-1">
                    <span>银盐颗粒强度 (Film Grain)</span>
                    <span className="text-amber-400">{recipe.grainAmount}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={80}
                    step={2}
                    value={recipe.grainAmount}
                    onChange={(e) =>
                      setRecipe((r) => ({
                        ...r,
                        grainAmount: Number(e.target.value)
                      }))
                    }
                    data-testid="slider-grain"
                    className="w-full accent-amber-500"
                  />
                </div>

                <div>
                  <label className="block mb-1">特征色调曲线 (Tone Curve)</label>
                  <select
                    value={recipe.toneCurve}
                    onChange={(e) =>
                      setRecipe((r) => ({
                        ...r,
                        toneCurve: e.target.value as ToneCurvePreset
                      }))
                    }
                    data-testid="select-tone-curve"
                    className="w-full px-3 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                  >
                    <option value="S_CURVE_CLASSIC">S_CURVE_CLASSIC (经典 S 曲线)</option>
                    <option value="MATTE_SHADOW">MATTE_SHADOW (胶片哑光暗部)</option>
                    <option value="HIGH_KEY">HIGH_KEY (明亮清透)</option>
                    <option value="LINEAR">LINEAR (线性反差)</option>
                  </select>
                </div>
              </div>
            </div>
          ) : (
            <div
              className="bg-zinc-900/80 border border-emerald-800/70 rounded-2xl p-5 space-y-3 font-mono text-xs"
              data-testid="raw-audit-panel"
            >
              <div className="text-emerald-400 font-bold text-sm">
                M1 真实 RAW 离线预处理审计清单 (pipeline.json)
              </div>
              <p className="text-zinc-300 leading-relaxed">
                {rawDemoMetadata.pipeline.honestyDisclosure}
              </p>
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1 text-zinc-300">
                <div>
                  机身型号: <strong>{rawDemoMetadata.meta.cameraModel}</strong> (
                  {rawDemoMetadata.meta.rawFormat})
                </div>
                <div>
                  许可证: <strong>{rawDemoMetadata.meta.license}</strong> (
                  {rawDemoMetadata.meta.sourceRepository})
                </div>
                <div className="break-all">
                  原始 ARW SHA256:{' '}
                  <span className="text-amber-300">
                    {rawDemoMetadata.meta.originalRawSha256}
                  </span>
                </div>
                <div>
                  传感器黑电平:{' '}
                  {JSON.stringify(
                    rawDemoMetadata.pipeline.sensorParameters.blackLevelPerChannel
                  )}
                </div>
                <div>
                  生成器: {rawDemoMetadata.pipeline.generator} (rawpy{' '}
                  {rawDemoMetadata.pipeline.rawpyVersion})
                </div>
              </div>
              <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                {rawDemoMetadata.pipeline.stages.map((st) => (
                  <div
                    key={st.stageId}
                    className="p-2 rounded bg-zinc-950 border border-zinc-800"
                  >
                    <div className="text-amber-300 font-bold">
                      {st.stageId} → {st.file}
                    </div>
                    <div className="text-zinc-400">{st.algorithm}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Export Actions */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-3">
            <div className="text-sm font-bold text-white">
              导出衍生文件与配方（保护原始样片只读）
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void handleExportFinalJpeg()}
                data-testid="btn-darkroom-export-jpeg"
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition"
              >
                ⬇ 导出当前阶段 JPEG
              </button>
              <button
                type="button"
                onClick={() => void handleExportRecipeJson()}
                data-testid="btn-darkroom-export-recipe"
                className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-mono border border-zinc-700"
              >
                ⬇ 导出 recipe.json
              </button>
            </div>

            {exportBanner ? (
              <div
                className="p-2.5 rounded-lg bg-emerald-950/70 border border-emerald-600 text-emerald-200 text-xs font-mono"
                data-testid="darkroom-export-banner"
              >
                ✓ {exportBanner}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

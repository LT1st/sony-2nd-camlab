import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { GhostComparisonMode } from '@camera-lab/contracts';
import {
  clampGhostParams,
  computeGhostAffineMatrix,
  type GhostTransformParams
} from '@camera-lab/domain';
import {
  computeAbsoluteDifferenceBuffer,
  estimateTranslationOffsetNcc
} from '@camera-lab/image-core';
import { soundSynth } from '../adapters/soundSynth.js';
import { useCameraLab } from '../app/CameraLabProvider.js';
import { useUiStore } from '../stores/uiStore.js';

const GHOST_PAIR_PRESETS = [
  {
    pairId: 'ghost-pair-1',
    label: '丸之内车站广场 (1986 vs 2026)',
    refId: 'sample-011',
    curId: 'sample-012'
  },
  {
    pairId: 'ghost-pair-2',
    label: '隅田川铁桥 (1998 日间 vs 2026 蓝调时刻)',
    refId: 'sample-013',
    curId: 'sample-014'
  },
  {
    pairId: 'ghost-pair-3',
    label: '涩谷天际线展望 (深秋 vs 冬日复拍)',
    refId: 'sample-015',
    curId: 'sample-016'
  }
] as const;

export const GhostPage: React.FC = () => {
  const {
    assets,
    ghostSessions,
    faultConfig,
    saveGhostAlignment,
    saveExportDerivative,
    resetFaultConfig
  } = useCameraLab();
  const soundEnabled = useUiStore((s) => s.soundEnabled);

  const [sessionId, setSessionId] = useState<string>('ghost-default-session');
  const [sessionName, setSessionName] = useState<string>(
    'Marunouchi 1986 vs 2026 Alignment'
  );
  const [referenceAssetId, setReferenceAssetId] =
    useState<string>('sample-011');
  const [currentAssetId, setCurrentAssetId] = useState<string>('sample-012');
  const [params, setParams] = useState<GhostTransformParams>({
    translationX: 0,
    translationY: 0,
    scale: 1,
    rotationDeg: 0,
    opacity: 0.5
  });
  const [comparisonMode, setComparisonMode] =
    useState<GhostComparisonMode>('overlay');
  const [splitPosition, setSplitPosition] = useState<number>(50);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [holdHideRef, setHoldHideRef] = useState<boolean>(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [nccSuggestionText, setNccSuggestionText] = useState<string | null>(
    null
  );
  const [meanAbsDiffScore, setMeanAbsDiffScore] = useState<number | null>(null);
  const [hydratedFromSession, setHydratedFromSession] = useState(false);

  const diffCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const dragStartRef = useRef<{
    x: number;
    y: number;
    tx: number;
    ty: number;
  } | null>(null);

  useEffect(() => {
    if (!hydratedFromSession && ghostSessions.length > 0) {
      const latest = ghostSessions[0]!;
      setSessionId(latest.id);
      setSessionName(latest.name);
      setReferenceAssetId(latest.referenceAssetId);
      setCurrentAssetId(latest.currentAssetId);
      setParams({
        translationX: latest.translationX,
        translationY: latest.translationY,
        scale: latest.scale,
        rotationDeg: latest.rotationDeg,
        opacity: latest.opacity
      });
      setComparisonMode(latest.comparisonMode);
      setHydratedFromSession(true);
    }
  }, [ghostSessions, hydratedFromSession]);

  const refAsset = useMemo(
    () => assets.find((a) => a.id === referenceAssetId) ?? null,
    [assets, referenceAssetId]
  );
  const curAsset = useMemo(
    () => assets.find((a) => a.id === currentAssetId) ?? null,
    [assets, currentAssetId]
  );

  const matrix = useMemo(
    () => computeGhostAffineMatrix(params, 960, 640),
    [params]
  );

  // When comparisonMode === 'difference', compute real pixel-by-pixel absolute difference buffer
  useEffect(() => {
    if (comparisonMode !== 'difference' || !refAsset || !curAsset) return;
    let cancelled = false;

    const loadImg = (url: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.crossOrigin = 'anonymous';
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = url;
      });

    (async () => {
      try {
        const [curImg, refImg] = await Promise.all([
          loadImg(curAsset.url),
          loadImg(refAsset.url)
        ]);
        if (cancelled) return;

        const w = 480;
        const h = 320;
        const m480 = computeGhostAffineMatrix(params, w, h);

        const cCur = document.createElement('canvas');
        cCur.width = w;
        cCur.height = h;
        const ctxCur = cCur.getContext('2d');

        const cRef = document.createElement('canvas');
        cRef.width = w;
        cRef.height = h;
        const ctxRef = cRef.getContext('2d');

        if (!ctxCur || !ctxRef) return;

        ctxCur.drawImage(curImg, 0, 0, w, h);
        ctxRef.save();
        ctxRef.setTransform(m480.a, m480.b, m480.c, m480.d, m480.tx, m480.ty);
        ctxRef.drawImage(refImg, 0, 0, w, h);
        ctxRef.restore();

        const curData = ctxCur.getImageData(0, 0, w, h);
        const refData = ctxRef.getImageData(0, 0, w, h);

        const diffBuf = computeAbsoluteDifferenceBuffer(
          { width: w, height: h, data: refData.data },
          { width: w, height: h, data: curData.data }
        );

        let sumDiff = 0;
        for (let i = 0; i < diffBuf.data.length; i += 4) {
          sumDiff +=
            ((diffBuf.data[i] ?? 0) +
              (diffBuf.data[i + 1] ?? 0) +
              (diffBuf.data[i + 2] ?? 0)) /
            3;
        }
        setMeanAbsDiffScore(
          Number((sumDiff / (w * h)).toFixed(2))
        );

        const targetCanvas = diffCanvasRef.current;
        if (targetCanvas) {
          targetCanvas.width = w;
          targetCanvas.height = h;
          targetCanvas
            .getContext('2d')
            ?.putImageData(
              new ImageData(new Uint8ClampedArray(diffBuf.data), w, h),
              0,
              0
            );
        }
      } catch {
        // Fallback if image decode skipped in headless test
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [comparisonMode, curAsset, params, refAsset]);

  const updateParamAndPersist = (patch: Partial<GhostTransformParams>) => {
    const next = clampGhostParams({ ...params, ...patch });
    setParams(next);
    void saveGhostAlignment({
      id: sessionId,
      name: sessionName,
      referenceAssetId,
      currentAssetId,
      params: next,
      comparisonMode
    });
  };

  useEffect(() => {
    const handleKeyDown = (evt: KeyboardEvent) => {
      const target = evt.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }
      if (evt.key === 'ArrowLeft') {
        evt.preventDefault();
        soundSynth.play('DIAL_CLICK', soundEnabled);
        updateParamAndPersist({ translationX: params.translationX - 0.02 });
      } else if (evt.key === 'ArrowRight') {
        evt.preventDefault();
        soundSynth.play('DIAL_CLICK', soundEnabled);
        updateParamAndPersist({ translationX: params.translationX + 0.02 });
      } else if (evt.key === 'ArrowUp') {
        evt.preventDefault();
        soundSynth.play('DIAL_CLICK', soundEnabled);
        updateParamAndPersist({ translationY: params.translationY - 0.02 });
      } else if (evt.key === 'ArrowDown') {
        evt.preventDefault();
        soundSynth.play('DIAL_CLICK', soundEnabled);
        updateParamAndPersist({ translationY: params.translationY + 0.02 });
      } else if (evt.key === '[') {
        evt.preventDefault();
        soundSynth.play('DIAL_CLICK', soundEnabled);
        updateParamAndPersist({ rotationDeg: params.rotationDeg - 1 });
      } else if (evt.key === ']') {
        evt.preventDefault();
        soundSynth.play('DIAL_CLICK', soundEnabled);
        updateParamAndPersist({ rotationDeg: params.rotationDeg + 1 });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const handleSuggestAutoAlign = async () => {
    if (!refAsset || !curAsset) return;
    const loadImg = (url: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.crossOrigin = 'anonymous';
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = url;
      });

    try {
      const [curImg, refImg] = await Promise.all([
        loadImg(curAsset.url),
        loadImg(refAsset.url)
      ]);
      const w = 360;
      const h = 240;
      const cCur = document.createElement('canvas');
      cCur.width = w;
      cCur.height = h;
      const cRef = document.createElement('canvas');
      cRef.width = w;
      cRef.height = h;

      const ctxCur = cCur.getContext('2d');
      const ctxRef = cRef.getContext('2d');
      if (!ctxCur || !ctxRef) return;

      ctxCur.drawImage(curImg, 0, 0, w, h);
      ctxRef.drawImage(refImg, 0, 0, w, h);

      const curData = ctxCur.getImageData(0, 0, w, h);
      const refData = ctxRef.getImageData(0, 0, w, h);

      const suggestion = estimateTranslationOffsetNcc(
        { width: w, height: h, data: refData.data },
        { width: w, height: h, data: curData.data }
      );

      updateParamAndPersist({
        translationX: suggestion.translationX,
        translationY: suggestion.translationY
      });
      setNccSuggestionText(
        `NCC 互相关建议位移已应用：ΔX=${suggestion.translationX}, ΔY=${suggestion.translationY} (相关系数 r=${suggestion.nccScore}，仍可手动微调)`
      );
    } catch {
      setNccSuggestionText('当前构图差异较大，已保留手动微调模式');
    }
  };

  const handleExportComposite = async (
    exportKind: 'GHOST_COMPOSITE' | 'GHOST_SIDE_BY_SIDE'
  ) => {
    if (!refAsset || !curAsset) return;

    const canvas = document.createElement('canvas');
    const isSideBySide = exportKind === 'GHOST_SIDE_BY_SIDE';
    canvas.width = isSideBySide ? 1920 : 960;
    canvas.height = 640;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const loadImg = (url: string) =>
        new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.crossOrigin = 'anonymous';
          el.onload = () => resolve(el);
          el.onerror = reject;
          el.src = url;
        });

      try {
        const [curImg, refImg] = await Promise.all([
          loadImg(curAsset.url),
          loadImg(refAsset.url)
        ]);

        if (isSideBySide) {
          ctx.drawImage(refImg, 0, 0, 960, 640);
          ctx.drawImage(curImg, 960, 0, 960, 640);
        } else {
          ctx.drawImage(curImg, 0, 0, 960, 640);
          ctx.save();
          ctx.globalAlpha = params.opacity;
          ctx.setTransform(
            matrix.a,
            matrix.b,
            matrix.c,
            matrix.d,
            matrix.tx,
            matrix.ty
          );
          ctx.drawImage(refImg, 0, 0, 960, 640);
          ctx.restore();
        }
      } catch {
        // Fallback if headless image decode is skipped
      }
    }

    const dataUrl = canvas.toDataURL('image/png');
    const filename =
      exportKind === 'GHOST_SIDE_BY_SIDE'
        ? `ghost-side-by-side-${referenceAssetId}-vs-${currentAssetId}.png`
        : `ghost-overlay-${referenceAssetId}-vs-${currentAssetId}.png`;

    const record = await saveExportDerivative({
      sourceAssetId: currentAssetId,
      kind: exportKind,
      mode: 'JPEG_SIMULATION',
      mimeType: 'image/png',
      dataUrl,
      filename,
      metadata: {
        referenceAssetId,
        currentAssetId,
        transform: params,
        affineMatrix: matrix,
        comparisonMode
      }
    });

    if (record) {
      setExportStatus(`已导出时光重影图像：${record.filename}`);
    }
  };

  const handleExportSessionJson = async () => {
    const payload = {
      id: sessionId,
      name: sessionName,
      referenceAssetId,
      currentAssetId,
      ...params,
      comparisonMode,
      affineMatrix960x640: matrix,
      exportedAt: new Date().toISOString()
    };
    const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(
      JSON.stringify(payload, null, 2)
    )}`;
    const record = await saveExportDerivative({
      sourceAssetId: currentAssetId,
      kind: 'GHOST_SESSION_JSON',
      mode: 'JPEG_SIMULATION',
      mimeType: 'application/json',
      dataUrl,
      filename: `ghost-session-${sessionId}.json`,
      metadata: payload
    });
    if (record) {
      setExportStatus(`已导出对齐参数 JSON：${record.filename}`);
    }
  };

  const assetFaultTriggered =
    faultConfig.simulateAsset404 ||
    faultConfig.simulateCorruptedAsset ||
    !refAsset ||
    !curAsset;

  return (
    <div className="space-y-6" data-testid="ghost-page">
      {/* Header & Pair Selector */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div>
            <div className="text-xs font-mono text-amber-400">
              GHOST VIEWFINDER · 时光重影与跨时空复拍对齐
            </div>
            <h1 className="text-xl font-bold text-white mt-0.5">
              {sessionName}
            </h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              支持平移 (X/Y)、缩放 (Scale)、旋转 (Rotation)、透明度 (Opacity)、NCC 互相关对齐建议与 4 种对比模式；参数刷新后自动恢复
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {GHOST_PAIR_PRESETS.map((pair) => (
              <button
                key={pair.pairId}
                type="button"
                onClick={() => {
                  setReferenceAssetId(pair.refId);
                  setCurrentAssetId(pair.curId);
                  setSessionName(pair.label);
                }}
                data-testid={`ghost-pair-${pair.pairId}`}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono border transition ${
                  referenceAssetId === pair.refId &&
                  currentAssetId === pair.curId
                    ? 'bg-amber-500 text-black font-bold border-amber-400'
                    : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {pair.label}
              </button>
            ))}
          </div>
        </div>

        {/* Comparison Mode Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {(
              [
                ['overlay', 'Overlay 叠影'],
                ['side-by-side', 'Side-by-Side 左右并排'],
                ['split-slider', 'Split-Slider 卷帘分割'],
                ['difference', 'Difference 像素差分']
              ] as Array<[GhostComparisonMode, string]>
            ).map(([modeKey, label]) => (
              <button
                key={modeKey}
                type="button"
                onClick={() => {
                  setComparisonMode(modeKey);
                  void saveGhostAlignment({
                    id: sessionId,
                    name: sessionName,
                    referenceAssetId,
                    currentAssetId,
                    params,
                    comparisonMode: modeKey
                  });
                }}
                data-testid={`ghost-mode-${modeKey}`}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono border ${
                  comparisonMode === modeKey
                    ? 'bg-amber-500 text-black font-bold border-amber-400'
                    : 'bg-zinc-950 text-zinc-300 border-zinc-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSuggestAutoAlign()}
              data-testid="btn-ghost-ncc-suggest"
              className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-mono border border-emerald-500/50"
            >
              ✦ NCC 互相关建议位移
            </button>

            <label className="flex items-center gap-1.5 text-xs font-mono text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={showGrid}
                onChange={(e) => setShowGrid(e.target.checked)}
              />
              <span>九宫格与中心十字线</span>
            </label>

            <button
              type="button"
              onMouseDown={() => setHoldHideRef(true)}
              onMouseUp={() => setHoldHideRef(false)}
              onMouseLeave={() => setHoldHideRef(false)}
              data-testid="btn-hold-hide-ref"
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-amber-300 text-xs font-mono border border-zinc-700"
            >
              按住临时隐藏参考图
            </button>
          </div>
        </div>

        {nccSuggestionText ? (
          <div
            className="px-3.5 py-2 rounded-xl bg-emerald-950/60 border border-emerald-700 text-emerald-200 text-xs font-mono"
            data-testid="ghost-ncc-banner"
          >
            {nccSuggestionText}
          </div>
        ) : null}
      </div>

      {/* Main Ghost Alignment Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left 8 Columns: Interactive Viewport */}
        <div className="lg:col-span-8 bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <div
            className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono bg-zinc-950 border border-zinc-800 px-3.5 py-2 rounded-xl"
            data-testid="ghost-telemetry-readout"
          >
            <span>
              X:{' '}
              <strong data-testid="readout-tx" className="text-amber-400">
                {params.translationX}
              </strong>
            </span>
            <span>
              Y:{' '}
              <strong data-testid="readout-ty" className="text-amber-400">
                {params.translationY}
              </strong>
            </span>
            <span>
              Scale:{' '}
              <strong data-testid="readout-scale" className="text-amber-400">
                {params.scale}
              </strong>
            </span>
            <span>
              Rotation:{' '}
              <strong data-testid="readout-rotation" className="text-amber-400">
                {params.rotationDeg}°
              </strong>
            </span>
            <span>
              Opacity:{' '}
              <strong data-testid="readout-opacity" className="text-amber-400">
                {Math.round(params.opacity * 100)}%
              </strong>
            </span>
            {comparisonMode === 'difference' && meanAbsDiffScore !== null ? (
              <span>
                MAD 像素残差:{' '}
                <strong
                  data-testid="readout-mad-score"
                  className="text-emerald-400"
                >
                  {meanAbsDiffScore}
                </strong>
              </span>
            ) : null}
          </div>

          {assetFaultTriggered ? (
            <div
              className="w-full aspect-[3/2] bg-red-950/40 border-2 border-red-600 rounded-xl flex flex-col items-center justify-center p-6 text-center space-y-3"
              data-testid="ghost-asset-error"
            >
              <div className="text-red-300 font-bold text-sm">
                ⚠ 参考图损坏或当前图不可用 (ASSET_CORRUPTED / ASSET_MISSING)
              </div>
              <p className="text-xs text-zinc-300 max-w-md">
                检测到样片加载异常。系统已保护现有对齐参数不丢失，您可以一键恢复默认样片或更换其他照片。
              </p>
              <button
                type="button"
                onClick={() => {
                  resetFaultConfig();
                  setReferenceAssetId('sample-011');
                  setCurrentAssetId('sample-012');
                }}
                data-testid="btn-ghost-recover"
                className="px-4 py-2 rounded-lg bg-amber-500 text-black font-bold text-xs"
              >
                清除故障并恢复默认参考图对
              </button>
            </div>
          ) : comparisonMode === 'side-by-side' ? (
            <div
              className="grid grid-cols-2 gap-3"
              data-testid="ghost-side-by-side-view"
            >
              <div className="bg-black border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-3 py-1 text-[11px] font-mono text-amber-400 bg-zinc-950 border-b border-zinc-800">
                  REFERENCE · {refAsset.title}
                </div>
                <img
                  src={refAsset.url}
                  alt={refAsset.title}
                  className="w-full aspect-[3/2] object-cover"
                />
              </div>
              <div className="bg-black border border-zinc-800 rounded-xl overflow-hidden">
                <div className="px-3 py-1 text-[11px] font-mono text-emerald-400 bg-zinc-950 border-b border-zinc-800">
                  CURRENT · {curAsset.title}
                </div>
                <img
                  src={curAsset.url}
                  alt={curAsset.title}
                  className="w-full aspect-[3/2] object-cover"
                />
              </div>
            </div>
          ) : (
            <div
              data-testid="ghost-interactive-stage"
              onMouseDown={(e) => {
                dragStartRef.current = {
                  x: e.clientX,
                  y: e.clientY,
                  tx: params.translationX,
                  ty: params.translationY
                };
              }}
              onMouseMove={(e) => {
                if (!dragStartRef.current) return;
                const dx = (e.clientX - dragStartRef.current.x) / 640;
                const dy = (e.clientY - dragStartRef.current.y) / 426;
                setParams(
                  clampGhostParams({
                    ...params,
                    translationX: dragStartRef.current.tx + dx,
                    translationY: dragStartRef.current.ty + dy
                  })
                );
              }}
              onMouseUp={() => {
                if (dragStartRef.current) {
                  dragStartRef.current = null;
                  void saveGhostAlignment({
                    id: sessionId,
                    name: sessionName,
                    referenceAssetId,
                    currentAssetId,
                    params,
                    comparisonMode
                  });
                }
              }}
              className="relative w-full aspect-[3/2] bg-black border-2 border-zinc-800 rounded-xl overflow-hidden cursor-move select-none"
            >
              {/* Base Layer: Current Image */}
              <img
                src={curAsset.url}
                alt={curAsset.title}
                data-testid="ghost-current-img"
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              />

              {/* Transformed Reference Layer */}
              <div
                style={{
                  clipPath:
                    comparisonMode === 'split-slider'
                      ? `inset(0 ${100 - splitPosition}% 0 0)`
                      : undefined
                }}
                className="absolute inset-0 w-full h-full pointer-events-none"
              >
                <img
                  src={refAsset.url}
                  alt={refAsset.title}
                  data-testid="ghost-reference-img"
                  style={{
                    opacity: holdHideRef ? 0 : params.opacity,
                    mixBlendMode:
                      comparisonMode === 'difference' ? 'difference' : 'normal',
                    transform: `translate(${params.translationX * 100}%, ${
                      params.translationY * 100
                    }%) scale(${params.scale}) rotate(${params.rotationDeg}deg)`,
                    transformOrigin: 'center center'
                  }}
                  className="w-full h-full object-cover transition-opacity duration-75"
                />
              </div>

              {/* Real Pixel-by-Pixel Absolute Difference Canvas Overlay */}
              {comparisonMode === 'difference' && !holdHideRef ? (
                <canvas
                  ref={diffCanvasRef}
                  data-testid="ghost-difference-canvas"
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                />
              ) : null}

              {/* Split Slider Handle */}
              {comparisonMode === 'split-slider' ? (
                <div
                  style={{ left: `${splitPosition}%` }}
                  className="absolute inset-y-0 w-0.5 bg-amber-400 pointer-events-none"
                />
              ) : null}

              {/* Grid & Center Crosshair Guides */}
              {showGrid ? (
                <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className="border border-white/15" />
                  ))}
                  <div className="absolute inset-x-0 top-1/2 h-px bg-amber-400/40" />
                  <div className="absolute inset-y-0 left-1/2 w-px bg-amber-400/40" />
                </div>
              ) : null}
            </div>
          )}

          {comparisonMode === 'split-slider' ? (
            <div className="flex items-center gap-3 text-xs font-mono">
              <span>卷帘分割位置: {splitPosition}%</span>
              <input
                type="range"
                min={0}
                max={100}
                value={splitPosition}
                onChange={(e) => setSplitPosition(Number(e.target.value))}
                className="flex-1 accent-amber-500"
              />
            </div>
          ) : null}
        </div>

        {/* Right 4 Columns: Transform Sliders, Asset Selectors, Save & Export */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-4 font-mono text-xs">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="font-bold text-sm text-white">
                仿射变换参数 (Affine 2D)
              </span>
              <button
                type="button"
                onClick={() =>
                  updateParamAndPersist({
                    translationX: 0,
                    translationY: 0,
                    scale: 1,
                    rotationDeg: 0,
                    opacity: 0.5
                  })
                }
                data-testid="btn-ghost-reset"
                className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
              >
                复位归零
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-zinc-400 mb-1">
                  参考图 (Reference)
                </label>
                <select
                  value={referenceAssetId}
                  onChange={(e) => setReferenceAssetId(e.target.value)}
                  data-testid="select-ghost-ref"
                  className="w-full px-2 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                >
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.id} · {a.title.slice(0, 18)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">
                  当前图 (Current)
                </label>
                <select
                  value={currentAssetId}
                  onChange={(e) => setCurrentAssetId(e.target.value)}
                  data-testid="select-ghost-cur"
                  className="w-full px-2 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                >
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.id} · {a.title.slice(0, 18)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Numeric & Slider Controls */}
            <div className="space-y-3">
              <div>
                <div className="flex justify-between mb-1">
                  <span>叠加透明度 (Opacity)</span>
                  <span className="text-amber-400">
                    {Math.round(params.opacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={params.opacity}
                  onChange={(e) =>
                    updateParamAndPersist({ opacity: Number(e.target.value) })
                  }
                  data-testid="input-ghost-opacity"
                  className="w-full accent-amber-500"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span>旋转角度 (Rotation Deg)</span>
                  <span className="text-amber-400">{params.rotationDeg}°</span>
                </div>
                <input
                  type="number"
                  step={1}
                  min={-180}
                  max={180}
                  value={params.rotationDeg}
                  onChange={(e) =>
                    updateParamAndPersist({
                      rotationDeg: Number(e.target.value)
                    })
                  }
                  data-testid="input-ghost-rotation"
                  className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1">
                  <span>缩放倍率 (Scale)</span>
                  <span className="text-amber-400">{params.scale}×</span>
                </div>
                <input
                  type="number"
                  step={0.05}
                  min={0.2}
                  max={3}
                  value={params.scale}
                  onChange={(e) =>
                    updateParamAndPersist({ scale: Number(e.target.value) })
                  }
                  data-testid="input-ghost-scale"
                  className="w-full px-2.5 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block mb-1">水平位移 X</label>
                  <input
                    type="number"
                    step={0.02}
                    min={-1}
                    max={1}
                    value={params.translationX}
                    onChange={(e) =>
                      updateParamAndPersist({
                        translationX: Number(e.target.value)
                      })
                    }
                    data-testid="input-ghost-tx"
                    className="w-full px-2 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                  />
                </div>
                <div>
                  <label className="block mb-1">垂直位移 Y</label>
                  <input
                    type="number"
                    step={0.02}
                    min={-1}
                    max={1}
                    value={params.translationY}
                    onChange={(e) =>
                      updateParamAndPersist({
                        translationY: Number(e.target.value)
                      })
                    }
                    data-testid="input-ghost-ty"
                    className="w-full px-2 py-1.5 rounded bg-zinc-950 border border-zinc-800 text-white"
                  />
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                void saveGhostAlignment({
                  id: sessionId,
                  name: sessionName,
                  referenceAssetId,
                  currentAssetId,
                  params,
                  comparisonMode
                })
              }
              data-testid="btn-ghost-save-session"
              className="w-full py-2 rounded-xl bg-zinc-100 hover:bg-white text-black font-bold text-xs transition"
            >
              💾 保存对齐会话到 IndexedDB
            </button>
          </div>

          {/* Export Card */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-3">
            <div className="text-sm font-bold text-white">
              导出重影合成图与变换参数
            </div>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void handleExportComposite('GHOST_COMPOSITE')}
                data-testid="btn-ghost-export-overlay"
                className="w-full py-2 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs"
              >
                ⬇ 导出叠影合成图 (Overlay PNG)
              </button>
              <button
                type="button"
                onClick={() =>
                  void handleExportComposite('GHOST_SIDE_BY_SIDE')
                }
                data-testid="btn-ghost-export-side-by-side"
                className="w-full py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-mono border border-zinc-700"
              >
                ⬇ 导出左右对照图 (Before/After PNG)
              </button>
              <button
                type="button"
                onClick={() => void handleExportSessionJson()}
                data-testid="btn-ghost-export-json"
                className="w-full py-2 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs font-mono border border-zinc-700"
              >
                ⬇ 导出变换参数 JSON
              </button>
            </div>

            {exportStatus ? (
              <div
                className="p-2.5 rounded-lg bg-emerald-950/70 border border-emerald-600 text-emerald-200 text-xs font-mono"
                data-testid="ghost-export-banner"
              >
                ✓ {exportStatus}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { soundSynth } from '../adapters/soundSynth.js';
import { useCameraLab } from '../app/CameraLabProvider.js';
import { useUiStore } from '../stores/uiStore.js';

export const RollsPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    rolls,
    activeRoll,
    capturesByRoll,
    assets,
    exportsList,
    selectRoll,
    sealActiveRoll,
    startRollDevelop,
    interruptRollDevelop,
    completeRollDevelop,
    archiveRoll,
    saveExportDerivative
  } = useCameraLab();

  const developSpeed = useUiStore((s) => s.developSpeedMultiplier);
  const setDevelopSpeed = useUiStore((s) => s.setDevelopSpeedMultiplier);
  const setSelectedAssetId = useUiStore((s) => s.setSelectedAssetId);
  const soundEnabled = useUiStore((s) => s.soundEnabled);

  const [developProgress, setDevelopProgress] = useState(0);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [focusedFrameIdx, setFocusedFrameIdx] = useState(0);

  const activeCaptures = activeRoll
    ? capturesByRoll[activeRoll.id] ?? []
    : [];

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
      if (evt.key === 'ArrowLeft' || evt.key === '[') {
        evt.preventDefault();
        soundSynth.play('DIAL_CLICK', soundEnabled);
        setFocusedFrameIdx((p) =>
          activeCaptures.length > 0
            ? (p - 1 + activeCaptures.length) % activeCaptures.length
            : 0
        );
      } else if (evt.key === 'ArrowRight' || evt.key === ']') {
        evt.preventDefault();
        soundSynth.play('DIAL_CLICK', soundEnabled);
        setFocusedFrameIdx((p) =>
          activeCaptures.length > 0 ? (p + 1) % activeCaptures.length : 0
        );
      } else if (evt.key === 'Enter' || evt.key === ' ') {
        evt.preventDefault();
        if (activeRoll?.status === 'SEALED') {
          soundSynth.play('DEVELOP_AGITATE', soundEnabled);
          setDevelopProgress(10);
          void startRollDevelop(activeRoll.id);
        } else if (
          (activeRoll?.status === 'DEVELOPED' ||
            activeRoll?.status === 'ARCHIVED') &&
          activeCaptures[focusedFrameIdx]
        ) {
          soundSynth.play('DIAL_CLICK', soundEnabled);
          setSelectedAssetId(activeCaptures[focusedFrameIdx]!.assetId);
          navigate('/darkroom');
        }
      } else if (evt.key === 'Escape' || evt.key === 'm' || evt.key === 'M') {
        evt.preventDefault();
        navigate('/camera');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeCaptures,
    activeRoll,
    focusedFrameIdx,
    navigate,
     setSelectedAssetId,
    soundEnabled,
    startRollDevelop
  ]);

  useEffect(() => {
    if (activeRoll?.status !== 'DEVELOPING') {
      if (activeRoll?.status === 'DEVELOPED') {
        setDevelopProgress(100);
      } else {
        setDevelopProgress(0);
      }
      return;
    }

    const intervalMs = Math.round(120 / developSpeed);
    const timer = setInterval(() => {
      setDevelopProgress((prev) => Math.min(100, prev + 25));
    }, intervalMs);

    return () => clearInterval(timer);
  }, [activeRoll?.id, activeRoll?.status, developSpeed]);

  useEffect(() => {
    if (activeRoll?.status === 'DEVELOPING' && developProgress >= 100) {
      void completeRollDevelop(activeRoll.id);
    }
  }, [activeRoll?.id, activeRoll?.status, completeRollDevelop, developProgress]);

  const handleExportContactSheet = async (format: 'image/jpeg' | 'image/png') => {
    if (!activeRoll) return;
    const cols = Math.min(4, Math.max(1, activeCaptures.length || 1));
    const rows = Math.max(1, Math.ceil((activeCaptures.length || 1) / cols));
    const cellW = 280;
    const cellH = 220;
    const canvas = document.createElement('canvas');
    canvas.width = cols * cellW + 48;
    canvas.height = rows * cellH + 96;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      ctx.fillStyle = '#09090b';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(
        `CAMERA LAB CONTACT SHEET · ${activeRoll.name} (${activeCaptures.length}/${activeRoll.capacity})`,
        24,
        36
      );

      ctx.fillStyle = '#a1a1aa';
      ctx.font = '12px monospace';
      ctx.fillText(
        `Preset: ${activeRoll.preset} | Developed At: ${activeRoll.updatedAt} | Original Preserved: TRUE`,
        24,
        58
      );

      for (let i = 0; i < activeCaptures.length; i++) {
        const cap = activeCaptures[i]!;
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = 24 + col * cellW;
        const y = 76 + row * cellH;

        ctx.strokeStyle = '#3f3f46';
        ctx.strokeRect(x, y, cellW - 16, cellH - 16);

        ctx.fillStyle = '#18181b';
        ctx.fillRect(x + 8, y + 24, cellW - 32, cellH - 64);

        const asset = assets.find((a) => a.id === cap.assetId);
        if (asset) {
          try {
            const img = await new Promise<HTMLImageElement>((resolve, reject) => {
              const el = new Image();
              el.crossOrigin = 'anonymous';
              el.onload = () => resolve(el);
              el.onerror = reject;
              el.src = asset.url;
            });
            ctx.drawImage(img, x + 8, y + 24, cellW - 32, cellH - 64);
          } catch {
            // Keep placeholder box if image fails in headless environment
          }
        }

        ctx.fillStyle = '#fbbf24';
        ctx.font = '11px monospace';
        ctx.fillText(
          `#${String(cap.frameIndex).padStart(2, '0')}A · ${cap.assetId}`,
          x + 10,
          y + 16
        );
        ctx.fillStyle = '#d4d4d8';
        ctx.fillText(
          `${cap.exposureMeta.shutterSpeed} ${cap.exposureMeta.aperture} ISO${cap.exposureMeta.iso}`,
          x + 10,
          y + cellH - 24
        );
      }
    }

    const ext = format === 'image/png' ? 'png' : 'jpg';
    const dataUrl = canvas.toDataURL(format, 0.92);
    const filename = `contact-sheet-${activeRoll.id}.${ext}`;
    const record = await saveExportDerivative({
      sourceAssetId: activeCaptures[0]?.assetId ?? 'sample-001',
      rollId: activeRoll.id,
      kind: 'FILM_CONTACT_SHEET',
      mode: 'JPEG_SIMULATION',
      mimeType: format,
      dataUrl,
      filename,
      metadata: {
        rollName: activeRoll.name,
        frameCount: activeCaptures.length,
        preset: activeRoll.preset
      }
    });

    if (record) {
      setExportMessage(
        `已生成并保存接触印样：${record.filename}（原始底片保持只读未覆盖）`
      );
    }
  };

  return (
    <div className="space-y-6" data-testid="rolls-page">
      {/* Top Roll Switcher & Status Header */}
      <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-800 pb-4">
          <div>
            <div className="text-xs font-mono text-amber-400">
              FILM OS DEVELOPING ROOM · 胶卷冲洗室与接触印样
            </div>
            <h1 className="text-xl font-bold text-white mt-0.5">
              {activeRoll?.name ?? '未选择胶卷'}
            </h1>
            <p className="text-xs text-zinc-400 mt-1">
              状态流转：EMPTY → LOADED → SEALED → DEVELOPING → DEVELOPED → ARCHIVED
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {rolls.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => selectRoll(r.id)}
                data-testid={`roll-tab-${r.id}`}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition ${
                  activeRoll?.id === r.id
                    ? 'bg-amber-500 text-black font-bold border-amber-400'
                    : 'bg-zinc-950 text-zinc-300 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {r.name} [{r.status} · {r.frameIds.length}/{r.capacity}]
              </button>
            ))}
          </div>
        </div>

        {/* Roll Lifecycle Action Controls */}
        {activeRoll ? (
          <div className="flex flex-wrap items-center justify-between gap-4 bg-zinc-950 border border-zinc-800 rounded-xl p-4">
            <div className="space-y-1 font-mono text-xs">
              <div>
                当前状态:{' '}
                <strong
                  className="text-amber-400"
                  data-testid="rolls-active-status"
                >
                  {activeRoll.status}
                </strong>{' '}
                | 已拍帧数:{' '}
                <strong data-testid="rolls-exposed-count">
                  {activeRoll.frameIds.length}
                </strong>{' '}
                / {activeRoll.capacity} | 预设: {activeRoll.preset}
              </div>
              <div className="text-zinc-400">
                严格不可回看规则: {activeRoll.strictMode ? '开启' : '关闭'} |
                乐观锁版本: v{activeRoll.version}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {activeRoll.status === 'LOADED' ? (
                <>
                  <button
                    type="button"
                    onClick={() => navigate('/camera')}
                    className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-mono"
                  >
                    ← 返回取景继续拍摄
                  </button>
                  <button
                    type="button"
                    onClick={() => void sealActiveRoll()}
                    data-testid="btn-rolls-seal"
                    className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs"
                  >
                    封卷并准备显影 (Seal Roll)
                  </button>
                </>
              ) : null}

              {activeRoll.status === 'SEALED' ? (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 px-2 py-1 rounded text-xs font-mono">
                    <span>速度:</span>
                    {([0.5, 1, 2] as const).map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => setDevelopSpeed(spd)}
                        className={`px-1.5 py-0.5 rounded ${
                          developSpeed === spd
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
                    onClick={async () => {
                      setDevelopProgress(10);
                      await startRollDevelop(activeRoll.id);
                    }}
                    data-testid="btn-start-develop"
                    className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs"
                  >
                    ▶ 开始显影冲洗 (Develop Roll)
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await startRollDevelop(activeRoll.id);
                      await completeRollDevelop(activeRoll.id);
                    }}
                    data-testid="btn-skip-develop"
                    className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-mono border border-zinc-700"
                  >
                    跳过动画立即出片
                  </button>
                </div>
              ) : null}

              {activeRoll.status === 'DEVELOPING' ? (
                <div className="flex items-center gap-3">
                  <div className="w-40 bg-zinc-800 h-3 rounded-full overflow-hidden">
                    <div
                      className="bg-amber-500 h-full transition-all"
                      style={{ width: `${developProgress}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono text-amber-300">
                    冲洗中 {developProgress}%
                  </span>
                  <button
                    type="button"
                    onClick={() => void completeRollDevelop(activeRoll.id)}
                    data-testid="btn-finish-develop-now"
                    className="px-2.5 py-1 rounded bg-emerald-500 text-black font-bold text-xs"
                  >
                    立即完成
                  </button>
                  <button
                    type="button"
                    onClick={() => void interruptRollDevelop(activeRoll.id)}
                    data-testid="btn-interrupt-develop"
                    className="px-2.5 py-1 rounded bg-red-900/70 text-red-100 text-xs"
                  >
                    安全中断
                  </button>
                </div>
              ) : null}

              {(activeRoll.status === 'DEVELOPED' ||
                activeRoll.status === 'ARCHIVED') ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleExportContactSheet('image/jpeg')}
                    data-testid="btn-export-contact-sheet-jpg"
                    className="px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs"
                  >
                    ⬇ 导出接触印样 (JPEG)
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleExportContactSheet('image/png')}
                    data-testid="btn-export-contact-sheet-png"
                    className="px-3.5 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-100 text-xs border border-zinc-700"
                  >
                    ⬇ 导出接触印样 (PNG)
                  </button>
                  {activeRoll.status === 'DEVELOPED' ? (
                    <button
                      type="button"
                      onClick={() => void archiveRoll(activeRoll.id)}
                      data-testid="btn-archive-roll"
                      className="px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-400 text-xs border border-zinc-800"
                    >
                      归档胶卷 (Archive)
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {exportMessage ? (
          <div
            className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-600 text-emerald-200 text-xs font-mono"
            data-testid="contact-sheet-export-banner"
          >
            ✓ {exportMessage}
          </div>
        ) : null}
      </div>

      {/* Contact Sheet Content */}
      {activeRoll &&
      activeRoll.strictMode &&
      activeRoll.status !== 'DEVELOPED' &&
      activeRoll.status !== 'ARCHIVED' ? (
        <div
          className="bg-zinc-900/70 border border-zinc-800 rounded-2xl p-8 text-center space-y-3"
          data-testid="strict-lock-notice"
        >
          <div className="text-amber-400 font-mono text-sm font-bold">
            [LOCKED BEFORE DEVELOPMENT · 本卷冲洗前不可回看]
          </div>
          <p className="text-sm text-zinc-300 max-w-xl mx-auto">
            当前胶卷已拍摄 <strong>{activeRoll.frameIds.length}</strong> 张原始照片并安全保存在本地存储中。
            遵循胶片摄影仪式感，完成封卷并执行「开始显影冲洗」后即可在此查看整卷接触印样（Contact Sheet）。
          </p>
        </div>
      ) : (
        <div
          className="bg-zinc-950 border-2 border-zinc-800 rounded-2xl p-6 space-y-4"
          data-testid="contact-sheet-container"
        >
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3 font-mono text-xs text-zinc-400">
            <span>
              35MM SAFETY FILM · {activeRoll?.name} · FRAMES:{' '}
              {activeCaptures.length}
            </span>
            <span>ORIGINAL FILES PRESERVED · NON-DESTRUCTIVE RECIPES</span>
          </div>

          {activeCaptures.length === 0 ? (
            <div className="py-8 text-center text-sm text-zinc-400">
              本卷暂无已曝光画面。您可以前往「Film 取景拍摄」按下快门拍照。
            </div>
          ) : (
            <div
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
              data-testid="contact-sheet-grid"
            >
              {activeCaptures.map((cap, idx) => {
                const asset = assets.find((a) => a.id === cap.assetId);
                const isFocused = idx === focusedFrameIdx;
                return (
                  <div
                    key={cap.captureId}
                    data-testid={`contact-frame-${cap.frameIndex}`}
                    onClick={() => setFocusedFrameIdx(idx)}
                    className={`bg-zinc-900 border rounded-xl overflow-hidden flex flex-col justify-between shadow-lg transition ${
                      isFocused
                        ? 'border-amber-400 ring-1 ring-amber-400/50'
                        : 'border-zinc-800'
                    }`}
                  >
                    {/* Top Sprocket Strip */}
                    <div className="bg-black px-3 py-1.5 flex items-center justify-between font-mono text-[11px] text-amber-400 border-b border-zinc-800">
                      <span>#{String(cap.frameIndex).padStart(2, '0')}A</span>
                      <span>{cap.assetId}</span>
                      <span>
                        {cap.exposureMeta.shutterSpeed} {cap.exposureMeta.aperture}
                      </span>
                    </div>

                    <div className="p-3 bg-zinc-950">
                      {asset ? (
                        <img
                          src={asset.url}
                          alt={asset.title}
                          className="w-full aspect-[3/2] object-cover rounded border border-zinc-800"
                        />
                      ) : (
                        <div className="w-full aspect-[3/2] bg-zinc-900 flex items-center justify-center text-xs text-zinc-500">
                          Asset {cap.assetId}
                        </div>
                      )}
                    </div>

                    <div className="p-3 bg-zinc-900 border-t border-zinc-800 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAssetId(cap.assetId);
                          navigate('/darkroom');
                        }}
                        data-testid={`btn-frame-to-darkroom-${cap.frameIndex}`}
                        className="flex-1 py-1.5 px-2.5 rounded bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition"
                      >
                        进入暗房显影 →
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedAssetId(cap.assetId);
                          navigate('/ghost');
                        }}
                        className="py-1.5 px-2.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs border border-zinc-700"
                      >
                        送入重影
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Recent Derivative Exports */}
      {exportsList.length > 0 ? (
        <div
          className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 space-y-3"
          data-testid="exports-history-list"
        >
          <div className="text-sm font-bold text-zinc-200">
            已保存的导出作品记录 ({exportsList.length})
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {exportsList.slice(0, 6).map((exp) => (
              <div
                key={exp.id}
                className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono flex items-center justify-between gap-2"
              >
                <div className="truncate">
                  <div className="text-amber-300 font-bold truncate">
                    {exp.filename}
                  </div>
                  <div className="text-zinc-400">
                    {exp.kind} · {exp.mode}
                  </div>
                </div>
                <a
                  href={exp.dataUrl}
                  download={exp.filename}
                  className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 shrink-0"
                >
                  下载
                </a>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
};

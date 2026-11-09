import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PhysicalKeyCode } from '@camera-lab/camera-port';
import type { FilmPreset, FilmRollCapacity } from '@camera-lab/contracts';
import { SonyCameraChassis } from '@camera-lab/ui';
import { useCameraLab } from '../app/CameraLabProvider.js';

export const CameraPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    activeRoll,
    rolls,
    assets,
    previewFrame,
    statusMessage,
    errorBanner,
    refreshPreview,
    selectPreviewAsset,
    createNewRoll,
    selectRoll,
    shutterCapture,
    attemptReviewActiveRoll,
    sealActiveRoll,
    resetFaultConfig
  } = useCameraLab();

  const [newRollName, setNewRollName] = useState('Ilford HP5 Plus · Tokyo Street');
  const [newRollCapacity, setNewRollCapacity] = useState<FilmRollCapacity>(12);
  const [newRollPreset, setNewRollPreset] = useState<FilmPreset>('CLASSIC_COLOR');
  const [newRollStrict, setNewRollStrict] = useState(true);
  const [confirmEarlySeal, setConfirmEarlySeal] = useState(false);
  const [afLocked, setAfLocked] = useState(false);
  const [shutterFlash, setShutterFlash] = useState(false);

  const exposedCount = activeRoll?.frameIds.length ?? 0;
  const capacity = activeRoll?.capacity ?? 12;
  const remaining = Math.max(0, capacity - exposedCount);

  const triggerShutter = async () => {
    setShutterFlash(true);
    setTimeout(() => setShutterFlash(false), 140);
    await shutterCapture();
  };

  const handlePhysicalKey = (key: PhysicalKeyCode) => {
    if (key === 'KEY_S1') {
      setAfLocked((prev) => !prev);
    } else if (key === 'KEY_S2' || key === 'KEY_ENTER') {
      void triggerShutter();
    } else if (key === 'KEY_LEFT' || key === 'DIAL_CCW') {
      void refreshPreview(-1);
    } else if (key === 'KEY_RIGHT' || key === 'DIAL_CW') {
      void refreshPreview(1);
    } else if (key === 'KEY_PLAY') {
      const allowed = attemptReviewActiveRoll();
      if (allowed) {
        navigate('/rolls');
      }
    } else if (key === 'KEY_MENU') {
      navigate('/');
    }
  };

  return (
    <div className="space-y-6" data-testid="camera-page">
      <div className="flex flex-col xl:flex-row items-center xl:items-start gap-6">
        {/* Left: 640x480 Sony Camera Simulator */}
        <SonyCameraChassis
          activeModuleLabel={`FILM · ${activeRoll?.preset ?? 'CLASSIC'}`}
          remainingText={`REM ${String(remaining).padStart(2, '0')} / ${capacity} [${
            activeRoll?.status ?? 'EMPTY'
          }]`}
          exposureText={
            previewFrame
              ? `${previewFrame.exposureMeta.shutterSpeed}  ${previewFrame.exposureMeta.aperture}  ISO ${previewFrame.exposureMeta.iso}  ${previewFrame.exposureMeta.focalLengthMm}mm`
              : '1/250  f/2.8  ISO 400  35mm'
          }
          statusMessage={statusMessage}
          errorMessage={errorBanner}
          onPhysicalKey={handlePhysicalKey}
        >
          <div className="relative flex-1 w-full h-full bg-black flex items-center justify-center overflow-hidden">
            {previewFrame ? (
              <img
                src={previewFrame.previewUrl}
                alt={previewFrame.title}
                data-testid="viewfinder-preview-image"
                className={`w-full h-full object-cover transition duration-150 ${
                  shutterFlash ? 'opacity-20 scale-[0.99]' : 'opacity-100'
                }`}
              />
            ) : (
              <div
                className="text-center p-6 space-y-3"
                data-testid="viewfinder-fallback"
              >
                <div className="text-amber-400 font-bold text-sm">
                  取景器样片暂不可用
                </div>
                <p className="text-xs text-zinc-400">
                  网络样片不可达或处于故障模拟状态。您可以点击下方重试或切换本地缓存样片。
                </p>
                <button
                  type="button"
                  onClick={async () => {
                    resetFaultConfig();
                    await refreshPreview(1);
                  }}
                  data-testid="btn-recover-preview"
                  className="px-3 py-1.5 rounded bg-amber-500 text-black font-bold text-xs"
                >
                  恢复离线缓存样片并重试
                </button>
              </div>
            )}

            {/* 3:2 Frame Guides & AF Reticle */}
            <div className="pointer-events-none absolute inset-4 border border-white/25 rounded-sm flex items-center justify-center">
              <div
                className={`w-16 h-12 border-2 transition ${
                  afLocked ? 'border-emerald-400 scale-95' : 'border-white/50'
                }`}
              />
            </div>

            {/* Top-left Overlay Badge */}
            <div className="absolute top-3 left-3 bg-black/75 border border-zinc-700 px-2.5 py-1 rounded text-[11px] flex items-center gap-2">
              <span className="text-amber-400 font-bold">
                {activeRoll?.name ?? '未装卷'}
              </span>
              <span className="text-zinc-300">
                已拍 <strong data-testid="vf-exposed-count">{exposedCount}</strong> /{' '}
                {capacity}
              </span>
              <span className="text-emerald-400">
                剩余 <strong data-testid="vf-remaining-count">{remaining}</strong>
              </span>
            </div>

            {/* Bottom Controls Overlay inside Viewfinder */}
            <div className="absolute top-3 right-3 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void refreshPreview(-1)}
                data-testid="btn-prev-sample"
                className="px-2 py-1 rounded bg-black/75 hover:bg-zinc-800 border border-zinc-700 text-[11px]"
              >
                ◀ 换景
              </button>
              <button
                type="button"
                onClick={() => void refreshPreview(1)}
                data-testid="btn-next-sample"
                className="px-2 py-1 rounded bg-black/75 hover:bg-zinc-800 border border-zinc-700 text-[11px]"
              >
                换景 ▶
              </button>
            </div>
          </div>
        </SonyCameraChassis>

        {/* Right: Film Roll Management & Quick Actions */}
        <div className="flex-1 w-full space-y-4">
          {/* Active Roll Action Card */}
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
              <div>
                <div className="text-xs font-mono text-amber-400">
                  ACTIVE FILM ROLL · 当前装填胶卷
                </div>
                <h2
                  className="text-lg font-bold text-white"
                  data-testid="active-roll-title"
                >
                  {activeRoll?.name ?? '未装填'}
                </h2>
              </div>
              <span
                className="px-2.5 py-1 rounded font-mono text-xs font-bold bg-zinc-800 border border-zinc-700 text-amber-300"
                data-testid="active-roll-status"
              >
                {activeRoll?.status ?? 'EMPTY'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center font-mono">
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                <div className="text-xs text-zinc-400">胶卷容量</div>
                <div
                  className="text-xl font-bold text-zinc-100 mt-1"
                  data-testid="roll-capacity-value"
                >
                  {capacity} 张
                </div>
              </div>
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                <div className="text-xs text-zinc-400">已曝光帧数</div>
                <div
                  className="text-xl font-bold text-amber-400 mt-1"
                  data-testid="roll-exposed-value"
                >
                  {exposedCount} 张
                </div>
              </div>
              <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
                <div className="text-xs text-zinc-400">剩余可拍</div>
                <div
                  className="text-xl font-bold text-emerald-400 mt-1"
                  data-testid="roll-remaining-value"
                >
                  {remaining} 张
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => void triggerShutter()}
                disabled={activeRoll?.status !== 'LOADED'}
                data-testid="btn-shutter-expose"
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-black font-bold text-sm transition"
              >
                ● 按下快门曝光 (Space)
              </button>

              <button
                type="button"
                onClick={() => {
                  const ok = attemptReviewActiveRoll();
                  if (ok) navigate('/rolls');
                }}
                data-testid="btn-attempt-review"
                className="px-3.5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 text-sm transition"
              >
                ▶ 尝试机内回看 (Play)
              </button>

              {activeRoll?.status === 'LOADED' ? (
                !confirmEarlySeal ? (
                  <button
                    type="button"
                    onClick={() => setConfirmEarlySeal(true)}
                    data-testid="btn-early-seal"
                    className="px-3.5 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-amber-300 text-sm"
                  >
                    提前封卷 (Seal Roll)
                  </button>
                ) : (
                  <div className="flex items-center gap-2 bg-amber-950/50 border border-amber-500/60 px-3 py-1.5 rounded-xl">
                    <span className="text-xs text-amber-200">
                      确认提前封卷？（封卷后不可再拍）
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        setConfirmEarlySeal(false);
                        await sealActiveRoll();
                      }}
                      data-testid="btn-confirm-early-seal"
                      className="px-2.5 py-1 rounded bg-amber-500 text-black font-bold text-xs"
                    >
                      确认封卷
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmEarlySeal(false)}
                      className="px-2 py-1 rounded bg-zinc-800 text-zinc-300 text-xs"
                    >
                      取消
                    </button>
                  </div>
                )
              ) : null}

              {activeRoll && activeRoll.status !== 'LOADED' ? (
                <button
                  type="button"
                  onClick={() => navigate('/rolls')}
                  data-testid="btn-goto-develop-room"
                  className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm"
                >
                  前往冲洗室显影 (Develop Roll) →
                </button>
              ) : null}
            </div>

            {/* Sample Selector Strip */}
            <div className="pt-2 border-t border-zinc-800">
              <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
                <span>取景器模拟场景队列（每次快门自动推进下一张，避免重复画面）</span>
                <span>当前: {previewFrame?.assetId ?? 'N/A'}</span>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {assets.slice(0, 10).map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => void selectPreviewAsset(asset.id)}
                    data-testid={`select-sample-${asset.id}`}
                    className={`px-2 py-1 rounded text-xs font-mono shrink-0 border ${
                      previewFrame?.assetId === asset.id
                        ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                        : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {asset.id}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Create New Roll Form */}
          <div
            className="bg-zinc-900/80 border border-zinc-800 rounded-2xl p-5 space-y-4"
            data-testid="create-roll-card"
          >
            <div className="text-sm font-bold text-zinc-100 border-b border-zinc-800 pb-2">
              装填新胶卷 (Load New Film Roll)
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  胶卷名称
                </label>
                <input
                  type="text"
                  value={newRollName}
                  onChange={(e) => setNewRollName(e.target.value)}
                  data-testid="input-roll-name"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  张数规格 (12 / 24 / 36)
                </label>
                <select
                  value={newRollCapacity}
                  onChange={(e) =>
                    setNewRollCapacity(Number(e.target.value) as FilmRollCapacity)
                  }
                  data-testid="select-roll-capacity"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-white"
                >
                  <option value={12}>12 张标准卷</option>
                  <option value={24}>24 张纪实卷</option>
                  <option value={36}>36 张全长卷</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-zinc-400 mb-1">
                  后期胶片预设 (仅影响暗房初始配方)
                </label>
                <select
                  value={newRollPreset}
                  onChange={(e) => setNewRollPreset(e.target.value as FilmPreset)}
                  data-testid="select-roll-preset"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-white"
                >
                  <option value="CLASSIC_COLOR">Classic Color (经典负片)</option>
                  <option value="WARM_AMBER">Warm Amber (暖调琥珀)</option>
                  <option value="MONO_SILVER">Mono Silver (银盐黑白)</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={newRollStrict}
                  onChange={(e) => setNewRollStrict(e.target.checked)}
                  data-testid="checkbox-strict-mode"
                  className="rounded border-zinc-700"
                />
                <span>启用真实胶片规则（封卷并完成冲洗前禁止在应用 UI 内回看）</span>
              </label>

              <button
                type="button"
                onClick={async () => {
                  await createNewRoll({
                    name: newRollName,
                    capacity: newRollCapacity,
                    preset: newRollPreset,
                    strictMode: newRollStrict
                  });
                }}
                data-testid="btn-create-roll"
                className="px-4 py-2 rounded-xl bg-zinc-100 hover:bg-white text-black font-bold text-xs transition"
              >
                + 装填新胶卷
              </button>
            </div>

            {/* Existing Rolls Switcher */}
            {rolls.length > 1 ? (
              <div className="pt-3 border-t border-zinc-800">
                <div className="text-xs text-zinc-400 mb-2">切换已有胶卷：</div>
                <div className="flex flex-wrap gap-2">
                  {rolls.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => selectRoll(r.id)}
                      data-testid={`switch-roll-${r.id}`}
                      className={`px-2.5 py-1 rounded text-xs font-mono border ${
                        activeRoll?.id === r.id
                          ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400'
                      }`}
                    >
                      {r.name} [{r.status} · {r.frameIds.length}/{r.capacity}]
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

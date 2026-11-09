import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { PhysicalKeyCode } from '@camera-lab/camera-port';
import { SonyCameraChassis } from '@camera-lab/ui';
import { useCameraLab } from '../app/CameraLabProvider.js';

const MODULE_CARDS = [
  {
    id: 'film',
    route: '/camera',
    code: '01 · FILM OS',
    title: '胶卷操作系统 (Film OS)',
    subtitle: '12/24/36 张定量装填 · 拍摄期不可回看 · 整卷显影与接触印样',
    badge: 'State Machine Ready'
  },
  {
    id: 'darkroom',
    route: '/darkroom',
    code: '02 · DIGITAL DARKROOM',
    title: '数码暗房 (Digital Darkroom)',
    subtitle: '7 阶段显影时间轴 · 诚实区分 SIMULATED 与 M1 真实 RAW 预计算管线',
    badge: 'Web Worker + rawpy M1'
  },
  {
    id: 'ghost',
    route: '/ghost',
    code: '03 · GHOST VIEWFINDER',
    title: '时光重影 (Ghost Viewfinder)',
    subtitle: '历史参考图与当前画面仿射对齐 · 4 种对比视图 · 参数持久化与合成导出',
    badge: 'Affine 2D Engine'
  }
] as const;

export const HomePage: React.FC = () => {
  const navigate = useNavigate();
  const {
    activeRoll,
    capabilities,
    rolls,
    exportsList,
    statusMessage,
    errorBanner,
    importLocalImageFile
  } = useCameraLab();
  const [focusedIdx, setFocusedIdx] = useState(0);

  const handlePhysicalKey = (key: PhysicalKeyCode) => {
    if (key === 'KEY_UP' || key === 'KEY_LEFT' || key === 'DIAL_CCW') {
      setFocusedIdx(
        (prev) => (prev - 1 + MODULE_CARDS.length) % MODULE_CARDS.length
      );
    } else if (key === 'KEY_DOWN' || key === 'KEY_RIGHT' || key === 'DIAL_CW') {
      setFocusedIdx((prev) => (prev + 1) % MODULE_CARDS.length);
    } else if (key === 'KEY_ENTER' || key === 'KEY_S2') {
      const target = MODULE_CARDS[focusedIdx];
      if (target) navigate(target.route);
    } else if (key === 'KEY_PLAY') {
      navigate('/rolls');
    }
  };

  const remaining = activeRoll
    ? Math.max(0, activeRoll.capacity - activeRoll.frameIds.length)
    : 0;

  return (
    <div className="space-y-8" data-testid="home-page">
      <div className="flex flex-col xl:flex-row items-center xl:items-start justify-between gap-6">
        <SonyCameraChassis
          activeModuleLabel="PLAYMEMORIES LAB OS"
          remainingText={
            activeRoll
              ? `ROLL: ${activeRoll.name.slice(0, 14)} (${remaining}/${activeRoll.capacity})`
              : 'NO ROLL'
          }
          exposureText="MENU SELECT · 1/250 f/2.8 ISO 400"
          statusMessage={statusMessage}
          errorMessage={errorBanner}
          onPhysicalKey={handlePhysicalKey}
        >
          <div className="flex-1 flex flex-col justify-between p-5 bg-gradient-to-b from-zinc-900 via-zinc-900 to-zinc-950">
            <div>
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-3">
                <span className="text-sm font-bold text-amber-400">
                  α7R II 摄影体验实验室 · 主菜单
                </span>
                <span className="text-xs text-zinc-400">
                  方向键选择 / AF·OK 进入
                </span>
              </div>

              <div className="space-y-2.5">
                {MODULE_CARDS.map((card, index) => {
                  const selected = index === focusedIdx;
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => {
                        setFocusedIdx(index);
                        navigate(card.route);
                      }}
                      data-testid={`launch-${card.id}`}
                      className={`w-full text-left p-3.5 rounded-lg border transition flex items-center justify-between ${
                        selected
                          ? 'bg-amber-500/15 border-amber-400 text-white shadow'
                          : 'bg-zinc-950/70 border-zinc-800 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-mono text-amber-400">
                          {card.code}
                        </div>
                        <div className="text-base font-bold mt-0.5">
                          {card.title}
                        </div>
                        <div className="text-xs text-zinc-400 mt-0.5">
                          {card.subtitle}
                        </div>
                      </div>
                      <span className="text-xs font-mono px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-zinc-200">
                        {selected ? '▶ ENTER' : card.badge}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-zinc-400 border-t border-zinc-800 pt-2.5">
              <span>已存胶卷: {rolls.length} 卷</span>
              <span>已导出作品: {exportsList.length} 件</span>
              <span>离线样片池: 16 张 (含 CC0 ARW 阶段)</span>
            </div>
          </div>
        </SonyCameraChassis>

        {/* Right Side: Capabilities & Quick Import Panel */}
        <div className="flex-1 w-full bg-zinc-900/70 border border-zinc-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div>
              <h2 className="text-lg font-bold text-zinc-100">
                机身能力协商清单 (CameraCapabilities)
              </h2>
              <p className="text-xs text-zinc-400">
                所有能力经 `CameraPort.getCapabilities()` 动态协商，绝不把 unknown 当作 true
              </p>
            </div>
            <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition">
              + 导入本机照片测试
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                data-testid="home-import-input"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) await importLocalImageFile(f);
                }}
              />
            </label>
          </div>

          {capabilities ? (
            <div
              className="grid grid-cols-2 gap-2 text-xs font-mono"
              data-testid="capabilities-summary"
            >
              <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                <span className="text-zinc-400">机身型号:</span>{' '}
                <strong className="text-amber-300">{capabilities.deviceModel}</strong>
              </div>
              <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                <span className="text-zinc-400">适配器:</span>{' '}
                <strong className="text-emerald-400">{capabilities.adapterType}</strong>
              </div>
              <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                <span className="text-zinc-400">实时取景 (liveView):</span>{' '}
                <strong className="text-amber-300">{capabilities.liveView}</strong>
              </div>
              <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                <span className="text-zinc-400">JPEG 拍摄:</span>{' '}
                <strong className="text-amber-300">{capabilities.captureJPEG}</strong>
              </div>
              <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                <span className="text-zinc-400">机内实时 RAW (captureRAW):</span>{' '}
                <strong className="text-zinc-400">{capabilities.captureRAW}</strong>
              </div>
              <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                <span className="text-zinc-400">M1 预计算 RAW 素材:</span>{' '}
                <strong className="text-emerald-400">{capabilities.rawDemoAssets}</strong>
              </div>
              <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                <span className="text-zinc-400">取景器叠图:</span>{' '}
                <strong className="text-amber-300">{capabilities.previewOverlay}</strong>
              </div>
              <div className="p-2.5 rounded bg-zinc-950 border border-zinc-800">
                <span className="text-zinc-400">BIONZ X 硬件 DSP:</span>{' '}
                <strong className="text-zinc-400">{capabilities.dspProcessing}</strong>
              </div>
            </div>
          ) : null}

          <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 space-y-1.5">
            <div className="font-bold text-amber-400">快速体验指引</div>
            <p>
              1. <strong>Film OS</strong>：进入「Film 取景拍摄」，新建 12/24/36 张胶卷，按{' '}
              <code>Space</code> 或右侧 <code>S2 快门</code> 拍摄；冲洗前点击回放会触发胶片保护提示。
            </p>
            <p>
              2. <strong>冲洗室 & 数码暗房</strong>：封卷后进入「冲洗室 & 印样」生成接触印样，点击任一底片进入「数码暗房」体验 7 阶段显影与 M1 真实 Sony A7R II RAW 阶段对照。
            </p>
            <p>
              3. <strong>时光重影 & 诊断台</strong>：在「时光重影」对齐新旧照片并导出；在「/debug 诊断台」注入第 4 张失败、重复事件或导出无隐私诊断 ZIP。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

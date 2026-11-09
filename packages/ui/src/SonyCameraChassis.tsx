import React, { useEffect } from 'react';
import type { PhysicalKeyCode } from '@camera-lab/camera-port';

export interface CameraBodyChassisProps {
  activeModuleLabel: string;
  remainingText: string;
  exposureText: string;
  statusMessage?: string;
  errorMessage?: string | null;
  onPhysicalKey: (key: PhysicalKeyCode) => void;
  children: React.ReactNode;
  footerHint?: string;
}

const KEYBOARD_TO_PHYSICAL: Record<string, PhysicalKeyCode> = {
  ArrowUp: 'KEY_UP',
  ArrowDown: 'KEY_DOWN',
  ArrowLeft: 'KEY_LEFT',
  ArrowRight: 'KEY_RIGHT',
  Enter: 'KEY_ENTER',
  ' ': 'KEY_S2',
  f: 'KEY_S1',
  F: 'KEY_S1',
  m: 'KEY_MENU',
  M: 'KEY_MENU',
  Escape: 'KEY_MENU',
  Backspace: 'KEY_DELETE',
  Delete: 'KEY_DELETE',
  '[': 'DIAL_CCW',
  ']': 'DIAL_CW',
  p: 'KEY_PLAY',
  P: 'KEY_PLAY'
};

export const SonyCameraChassis: React.FC<CameraBodyChassisProps> = ({
  activeModuleLabel,
  remainingText,
  exposureText,
  statusMessage,
  errorMessage,
  onPhysicalKey,
  children,
  footerHint
}) => {
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
      const mapped = KEYBOARD_TO_PHYSICAL[evt.key];
      if (mapped) {
        evt.preventDefault();
        onPhysicalKey(mapped);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onPhysicalKey]);

  return (
    <div
      className="inline-flex flex-col lg:flex-row items-center lg:items-stretch gap-5 bg-zinc-950 border-2 border-zinc-800 rounded-2xl p-5 shadow-2xl select-none"
      data-testid="sony-a7r2-chassis"
    >
      {/* Left: 640x480 Logical LCD Display */}
      <div className="flex flex-col items-center">
        <div className="w-full flex items-center justify-between px-2 pb-1.5 text-xs tracking-wider text-zinc-400 font-mono">
          <span>SONY α7R II · ILCE-7RM2 [SIMULATED BODY]</span>
          <span>LCD 640×480 (3:2 VF)</span>
        </div>

        <div
          style={{ width: 640, height: 480 }}
          className="relative bg-black border-2 border-zinc-700 rounded overflow-hidden flex flex-col justify-between text-zinc-100 font-mono shadow-inner"
          data-testid="camera-lcd-screen"
        >
          {/* Top Telemetry Bar (27px) */}
          <div
            style={{ height: 27 }}
            className="w-full bg-zinc-950/95 border-b border-zinc-800 px-3 flex items-center justify-between text-xs"
          >
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 border border-amber-500/40 rounded font-bold">
                {activeModuleLabel}
              </span>
              <span className="text-zinc-300 font-semibold" data-testid="hud-remaining">
                {remainingText}
              </span>
            </div>
            <div className="flex items-center gap-2 text-zinc-300">
              <span>3:2 42MP-SIM</span>
              <span className="px-1 bg-zinc-800 rounded text-emerald-400">MOCK</span>
            </div>
          </div>

          {/* Center 3:2 Viewfinder Area (640x426 exact 3:2 aspect ratio) */}
          <div
            style={{ width: 640, height: 426 }}
            className="relative w-full overflow-hidden bg-zinc-900 flex flex-col"
            data-testid="camera-viewfinder-3x2"
          >
            {children}

            {errorMessage ? (
              <div
                className="absolute inset-x-3 bottom-3 bg-red-950/95 border border-red-500 text-red-100 px-3 py-2 rounded text-xs flex items-center justify-between gap-2 shadow-lg z-30"
                data-testid="lcd-error-banner"
              >
                <span>⚠ {errorMessage}</span>
              </div>
            ) : null}
          </div>

          {/* Bottom Exposure & Status Bar (27px) */}
          <div
            style={{ height: 27 }}
            className="w-full bg-zinc-950/95 border-t border-zinc-800 px-3 flex items-center justify-between text-xs"
          >
            <span className="text-amber-300 font-semibold">{exposureText}</span>
            <span className="text-zinc-400 truncate max-w-[330px]" data-testid="hud-status">
              {statusMessage ?? footerHint ?? 'SPACE:快门 | 方向键:导航 | ENTER:确认 | M:菜单'}
            </span>
          </div>
        </div>
      </div>

      {/* Right: Physical Hardware Key Deck (ScalarInput scanCode Equivalent) */}
      <div
        className="w-64 bg-zinc-900/90 border border-zinc-800 rounded-xl p-4 flex flex-col justify-between gap-3 font-mono"
        data-testid="physical-key-deck"
      >
        <div>
          <div className="text-[11px] uppercase tracking-widest text-zinc-400 mb-2 border-b border-zinc-800 pb-1">
            Top Plate · 快门与转盘
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onPhysicalKey('KEY_S1')}
              data-testid="btn-key-s1"
              className="px-2.5 py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs border border-zinc-700 active:scale-95 transition"
            >
              S1 半按对焦 [F]
            </button>
            <button
              type="button"
              onClick={() => onPhysicalKey('KEY_S2')}
              data-testid="btn-key-s2"
              className="px-2.5 py-2 rounded bg-amber-600 hover:bg-amber-500 text-black font-bold text-xs border border-amber-400 active:scale-95 transition"
            >
              ● S2 快门 [Space]
            </button>
            <button
              type="button"
              onClick={() => onPhysicalKey('DIAL_CCW')}
              data-testid="btn-dial-ccw"
              className="px-2 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs border border-zinc-700"
            >
              ⟲ 前转盘 [
            </button>
            <button
              type="button"
              onClick={() => onPhysicalKey('DIAL_CW')}
              data-testid="btn-dial-cw"
              className="px-2 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs border border-zinc-700"
            >
              前转盘 ] ⟳
            </button>
          </div>
        </div>

        {/* Rear Function Keys */}
        <div>
          <div className="text-[11px] uppercase tracking-widest text-zinc-400 mb-2 border-b border-zinc-800 pb-1">
            Rear Deck · 机身功能键
          </div>
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            <button
              type="button"
              onClick={() => onPhysicalKey('KEY_MENU')}
              data-testid="btn-key-menu"
              className="px-2 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs border border-zinc-700"
            >
              MENU [M]
            </button>
            <button
              type="button"
              onClick={() => onPhysicalKey('KEY_FN')}
              data-testid="btn-key-fn"
              className="px-2 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs border border-zinc-700"
            >
              Fn
            </button>
            <button
              type="button"
              onClick={() => onPhysicalKey('KEY_PLAY')}
              data-testid="btn-key-play"
              className="px-2 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-amber-300 text-xs border border-zinc-700"
            >
              ▶ 回放 [P]
            </button>
          </div>

          {/* 5-Way D-Pad */}
          <div className="grid grid-cols-3 gap-1.5 items-center justify-items-center bg-zinc-950 p-2.5 rounded-xl border border-zinc-800">
            <div />
            <button
              type="button"
              onClick={() => onPhysicalKey('KEY_UP')}
              data-testid="btn-key-up"
              className="w-full py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs border border-zinc-700"
            >
              ▲ DISP
            </button>
            <div />
            <button
              type="button"
              onClick={() => onPhysicalKey('KEY_LEFT')}
              data-testid="btn-key-left"
              className="w-full py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs border border-zinc-700"
            >
              ◀
            </button>
            <button
              type="button"
              onClick={() => onPhysicalKey('KEY_ENTER')}
              data-testid="btn-key-enter"
              className="w-full py-2 rounded-full bg-zinc-700 hover:bg-zinc-600 text-amber-300 font-bold text-xs border border-zinc-500"
            >
              AF/OK
            </button>
            <button
              type="button"
              onClick={() => onPhysicalKey('KEY_RIGHT')}
              data-testid="btn-key-right"
              className="w-full py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs border border-zinc-700"
            >
              ▶ ISO
            </button>
            <div />
            <button
              type="button"
              onClick={() => onPhysicalKey('KEY_DOWN')}
              data-testid="btn-key-down"
              className="w-full py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs border border-zinc-700"
            >
              ▼ WB
            </button>
            <div />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => onPhysicalKey('KEY_DELETE')}
            data-testid="btn-key-delete"
            className="w-full py-1.5 rounded bg-zinc-800 hover:bg-red-950/60 text-zinc-300 hover:text-red-200 text-xs border border-zinc-700"
          >
            🗑 C2 / 删除 / 返回 [Del]
          </button>
        </div>
      </div>
    </div>
  );
};

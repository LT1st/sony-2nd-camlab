import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useCameraLab } from './CameraLabProvider.js';
import { useUiStore } from '../stores/uiStore.js';

export const AppLayout: React.FC = () => {
  const { activeRoll, capabilities, errorBanner, clearError, importLocalImageFile } =
    useCameraLab();
  const viewMode = useUiStore((s) => s.viewMode);
  const setViewMode = useUiStore((s) => s.setViewMode);

  const handleDrop: React.DragEventHandler<HTMLDivElement> = async (evt) => {
    evt.preventDefault();
    const file = evt.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      await importLocalImageFile(file);
    }
  };

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-lg text-sm font-medium transition ${
      isActive
        ? 'bg-amber-500 text-black font-bold shadow'
        : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
    }`;

  return (
    <div
      className="min-h-screen flex flex-col bg-zinc-950 text-zinc-100"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Top Navigation Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-amber-500 animate-pulse" />
            <div>
              <div className="text-base font-bold tracking-tight flex items-center gap-2">
                <span>CAMERA LAB</span>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-800 text-amber-400 border border-zinc-700">
                  {capabilities?.deviceModel ?? 'ILCE-7RM2 (Simulated)'}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Film OS · Digital Darkroom · Ghost Viewfinder（无硬件离线模拟工作台）
              </p>
            </div>
          </div>

          <nav className="flex items-center gap-1.5 flex-wrap" data-testid="main-nav">
            <NavLink to="/" end className={navLinkClass} data-testid="nav-home">
              机身主页
            </NavLink>
            <NavLink to="/camera" className={navLinkClass} data-testid="nav-camera">
              Film 取景拍摄
            </NavLink>
            <NavLink to="/rolls" className={navLinkClass} data-testid="nav-rolls">
              冲洗室 & 印样
            </NavLink>
            <NavLink to="/darkroom" className={navLinkClass} data-testid="nav-darkroom">
              数码暗房
            </NavLink>
            <NavLink to="/ghost" className={navLinkClass} data-testid="nav-ghost">
              时光重影
            </NavLink>
            <NavLink to="/debug" className={navLinkClass} data-testid="nav-debug">
              /debug 诊断台
            </NavLink>
          </nav>

          <div className="flex items-center gap-2">
            {activeRoll ? (
              <div
                className="text-xs font-mono px-2.5 py-1 rounded bg-zinc-800 border border-zinc-700 text-zinc-200"
                data-testid="header-roll-badge"
              >
                当前卷: <strong className="text-amber-400">{activeRoll.name}</strong> [
                {activeRoll.status}] 剩余{' '}
                <strong data-testid="header-remaining-count">
                  {Math.max(0, activeRoll.capacity - activeRoll.frameIds.length)}
                </strong>
                /{activeRoll.capacity}
              </div>
            ) : null}

            <button
              type="button"
              onClick={() =>
                setViewMode(
                  viewMode === 'CAMERA_SIMULATOR'
                    ? 'DESKTOP_WORKBENCH'
                    : 'CAMERA_SIMULATOR'
                )
              }
              data-testid="toggle-view-mode"
              className="text-xs font-mono px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-300"
            >
              视图: {viewMode === 'CAMERA_SIMULATOR' ? '相机模拟器' : '桌面工作台'}
            </button>
          </div>
        </div>
      </header>

      {/* Global Recoverable Error Banner */}
      {errorBanner ? (
        <div
          className="bg-red-950/90 border-b border-red-700 px-4 py-2.5 text-sm text-red-100"
          data-testid="global-error-banner"
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <span>⚠ {errorBanner}</span>
            <button
              type="button"
              onClick={clearError}
              className="px-2.5 py-1 rounded bg-red-800 hover:bg-red-700 text-xs font-mono"
            >
              关闭提示
            </button>
          </div>
        </div>
      ) : null}

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        <Outlet />
      </main>

      {/* Honest Boundary Footer */}
      <footer className="border-t border-zinc-900 bg-zinc-950 py-3 px-4 text-xs text-zinc-500 font-mono">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <span>
            M0/M1 硬件安全边界：纯浏览器离线模拟 · 不连接 Sony USB/Wi-Fi · 不刷写固件 ·
            支持拖拽本地照片测试（零网络上传）
          </span>
          <span>
            管线披露：JPEG_SIMULATION (SIMULATED) 与 RAW_PIPELINE_PRECOMPUTED (rawpy 离线阶段) 严格区分
          </span>
        </div>
      </footer>
    </div>
  );
};

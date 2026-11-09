import { create } from 'zustand';

export type WorkspaceViewMode = 'CAMERA_SIMULATOR' | 'DESKTOP_WORKBENCH';

interface UiStoreState {
  viewMode: WorkspaceViewMode;
  soundEnabled: boolean;
  developSpeedMultiplier: 0.5 | 1 | 2;
  darkroomAnimationEnabled: boolean;
  selectedRollId: string | null;
  selectedAssetId: string;
  lastExportLatencyMs: number;
  setViewMode: (mode: WorkspaceViewMode) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setDevelopSpeedMultiplier: (speed: 0.5 | 1 | 2) => void;
  setDarkroomAnimationEnabled: (enabled: boolean) => void;
  setSelectedRollId: (rollId: string | null) => void;
  setSelectedAssetId: (assetId: string) => void;
  setLastExportLatencyMs: (ms: number) => void;
}

export const useUiStore = create<UiStoreState>((set) => ({
  viewMode: 'CAMERA_SIMULATOR',
  soundEnabled: false,
  developSpeedMultiplier: 1,
  darkroomAnimationEnabled: true,
  selectedRollId: null,
  selectedAssetId: 'sample-001',
  lastExportLatencyMs: 22,
  setViewMode: (viewMode) => set({ viewMode }),
  setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
  setDevelopSpeedMultiplier: (developSpeedMultiplier) =>
    set({ developSpeedMultiplier }),
  setDarkroomAnimationEnabled: (darkroomAnimationEnabled) =>
    set({ darkroomAnimationEnabled }),
  setSelectedRollId: (selectedRollId) => set({ selectedRollId }),
  setSelectedAssetId: (selectedAssetId) => set({ selectedAssetId }),
  setLastExportLatencyMs: (lastExportLatencyMs) =>
    set({ lastExportLatencyMs })
}));

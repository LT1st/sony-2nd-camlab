import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppLayout } from './AppLayout.js';
import { CameraLabProvider } from './CameraLabProvider.js';
import { CameraPage } from '../pages/CameraPage.js';
import { DarkroomPage } from '../pages/DarkroomPage.js';
import { DebugPage } from '../pages/DebugPage.js';
import { GhostPage } from '../pages/GhostPage.js';
import { HomePage } from '../pages/HomePage.js';
import { RollsPage } from '../pages/RollsPage.js';

export const App: React.FC = () => {
  return (
    <CameraLabProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/camera" element={<CameraPage />} />
            <Route path="/rolls" element={<RollsPage />} />
            <Route path="/darkroom" element={<DarkroomPage />} />
            <Route path="/ghost" element={<GhostPage />} />
            <Route path="/debug" element={<DebugPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </CameraLabProvider>
  );
};

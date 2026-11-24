import type { ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { getToken } from './lib/api';
import ContentPage from './pages/ContentPage';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import PacksPage from './pages/PacksPage';
import PublicJoinPage from './pages/PublicJoinPage';
import ServerDetailPage from './pages/ServerDetailPage';
import ServersPage from './pages/ServersPage';
import SettingsPage from './pages/SettingsPage';

function Protected({ children }: { children: ReactNode }) {
  const token = getToken();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public player invite & mod download portal (No login required) */}
        <Route path="/join/:slug" element={<PublicJoinPage />} />

        {/* Admin login */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected Admin Panel */}
        <Route
          path="/"
          element={
            <Protected>
              <DashboardPage />
            </Protected>
          }
        />
        <Route
          path="/servers"
          element={
            <Protected>
              <ServersPage />
            </Protected>
          }
        />
        <Route
          path="/servers/:id"
          element={
            <Protected>
              <ServerDetailPage />
            </Protected>
          }
        />
        <Route
          path="/content"
          element={
            <Protected>
              <ContentPage />
            </Protected>
          }
        />
        <Route
          path="/packs"
          element={
            <Protected>
              <PacksPage />
            </Protected>
          }
        />
        <Route
          path="/settings"
          element={
            <Protected>
              <SettingsPage />
            </Protected>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

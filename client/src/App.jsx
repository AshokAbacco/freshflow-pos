import { lazy, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { Toaster } from './components/ui/Toaster';
import LoginPage from './pages/LoginPage';
import PosPage from './pages/PosPage';
import { RequireAuth, RequireRole } from './routes/guards';
import { useAuthStore } from './store/authStore';

// Admin areas are split out of the register bundle so terminals load less code.
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const InventoryPage = lazy(() => import('./pages/InventoryPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

export default function App() {
  const refreshProfile = useAuthStore((s) => s.refreshProfile);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<PosPage />} />
          <Route element={<RequireRole roles={['ADMIN']} />}>
            <Route path="reports" element={<ReportsPage />} />
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}

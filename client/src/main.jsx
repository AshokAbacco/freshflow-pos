import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { configureApi } from './lib/api';
import { startSyncEngine } from './lib/sync';
import { useAuthStore } from './store/authStore';
import { toast } from './store/toastStore';

configureApi({
  getToken: () => useAuthStore.getState().token,
  onUnauthorized: (code) => {
    if (!useAuthStore.getState().token) return;
    const message =
      code === 'ACCOUNT_DISABLED'
        ? 'This account has been deactivated. Ask your store admin.'
        : code === 'ROLE_CHANGED'
          ? 'Your role changed. Sign in again to continue.'
          : 'Your session expired. Sign in again.';
    useAuthStore.getState().logout(message);
    toast.warn(message);
  },
});

startSyncEngine();

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);

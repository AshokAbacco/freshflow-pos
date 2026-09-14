import { create } from 'zustand';

export const useSyncStore = create((set) => ({
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  serverReachable: true,
  syncing: false,
  pendingCount: 0,
  failedCount: 0,
  entries: [],
  lastSyncAt: null,
  lastError: null,
  set: (patch) => set(patch),
}));

export const selectConnection = (s) => {
  if (!s.online) return 'offline';
  if (!s.serverReachable) return 'unreachable';
  return 'online';
};

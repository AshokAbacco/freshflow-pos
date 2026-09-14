/**
 * Outbox sync engine.
 *
 * Every completed bill is written to IndexedDB first (durable), then uploaded. This single path
 * handles both online and offline selling: if the upload fails for a transient reason (no network,
 * server down, expired session) the bill stays queued and retries on reconnect, on an interval, and
 * when the tab regains focus. The server de-duplicates by clientId, so retries never double-count.
 */
import { api, errorMessage, isNetworkError } from './api';
import { idb } from './idb';
import { useSyncStore } from '../store/syncStore';

const STORE = 'outbox';
const BATCH_SIZE = 25;
const RETRY_INTERVAL_MS = 30_000;

let inFlight = null;
let started = false;
const listeners = new Set();

/** Subscribe to per-bill results as they sync (used to show invoice numbers on receipts). */
export function onBillSynced(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function refreshOutboxState() {
  try {
    const entries = await idb.getAll(STORE);
    entries.sort((a, b) => a.createdAt - b.createdAt);
    useSyncStore.getState().set({
      entries,
      pendingCount: entries.filter((e) => e.status === 'pending').length,
      failedCount: entries.filter((e) => e.status === 'failed').length,
    });
  } catch (err) {
    useSyncStore.getState().set({ lastError: err.message });
  }
}

export async function enqueueBill(payload) {
  await idb.put(STORE, { clientId: payload.clientId, payload, status: 'pending', attempts: 0, lastError: null, createdAt: Date.now() });
  await refreshOutboxState();
}

async function uploadPending() {
  const store = useSyncStore.getState();
  const pending = (await idb.getAll(STORE)).filter((e) => e.status === 'pending').sort((a, b) => a.createdAt - b.createdAt);
  const synced = [];
  if (!pending.length) return synced;

  store.set({ syncing: true });
  try {
    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE);
      let response;
      try {
        response = await api.post('/transactions/sync', { transactions: batch.map((e) => e.payload) }, { timeout: 30_000 });
      } catch (err) {
        const status = err.response?.status;
        const transient = isNetworkError(err) || status === 401 || status === 408 || status === 429 || status >= 500;
        const message = errorMessage(err);
        await Promise.all(
          batch.map((e) => idb.put(STORE, { ...e, attempts: e.attempts + 1, lastError: message, status: transient ? 'pending' : 'failed' })),
        );
        store.set({ lastError: message, serverReachable: !isNetworkError(err) });
        if (transient) break; // stop; try again later in order
        continue;
      }

      store.set({ serverReachable: true, lastError: null });
      for (const result of response.data.results) {
        const entry = batch.find((e) => e.clientId === result.clientId);
        if (!entry) continue;
        if (result.status === 'created' || result.status === 'duplicate') {
          await idb.delete(STORE, entry.clientId);
          synced.push(result);
        } else {
          await idb.put(STORE, { ...entry, status: 'failed', attempts: entry.attempts + 1, lastError: result.error?.message || 'Rejected by the server' });
        }
      }
      store.set({ lastSyncAt: Date.now() });
    }
  } finally {
    store.set({ syncing: false });
    await refreshOutboxState();
  }
  return synced;
}

/** Upload queued bills now. Concurrent callers (and other open tabs) share one run. */
export function flushOutbox() {
  if (inFlight) return inFlight;
  const run = async () => {
    if (!navigator.onLine) {
      await refreshOutboxState();
      return [];
    }
    return navigator.locks?.request ? navigator.locks.request('freshflow-outbox', uploadPending) : uploadPending();
  };
  inFlight = run()
    .then((synced) => {
      synced.forEach((r) => listeners.forEach((fn) => fn(r)));
      return synced;
    })
    .catch((err) => {
      useSyncStore.getState().set({ lastError: err.message, syncing: false });
      return [];
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export async function retryBill(clientId) {
  const entry = await idb.get(STORE, clientId);
  if (entry) await idb.put(STORE, { ...entry, status: 'pending', lastError: null });
  await refreshOutboxState();
  return flushOutbox();
}

export async function discardBill(clientId) {
  await idb.delete(STORE, clientId);
  await refreshOutboxState();
}

async function pingServer() {
  try {
    await api.get('/health', { timeout: 5000, skipAuthHandling: true });
    useSyncStore.getState().set({ serverReachable: true });
    return true;
  } catch (err) {
    useSyncStore.getState().set({ serverReachable: !isNetworkError(err) && err.response?.status < 500 });
    return false;
  }
}

export function startSyncEngine() {
  if (started) return;
  started = true;
  const store = useSyncStore.getState();

  window.addEventListener('online', async () => {
    store.set({ online: true });
    if (await pingServer()) flushOutbox();
  });
  window.addEventListener('offline', () => store.set({ online: false }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') flushOutbox();
  });
  setInterval(async () => {
    if (!navigator.onLine) return;
    const reachable = await pingServer();
    if (reachable && useSyncStore.getState().pendingCount > 0) flushOutbox();
  }, RETRY_INTERVAL_MS);

  refreshOutboxState().then(() => flushOutbox());
}

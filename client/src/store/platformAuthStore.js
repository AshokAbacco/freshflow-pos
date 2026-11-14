import { create } from 'zustand';
import {
  configurePlatformApi,
  platformApi,
  refreshAccessToken,
  setPlatformAccessToken,
} from '../lib/platformApi.js';

/**
 * Who is signed in to the platform panel.
 *
 * Nothing is persisted. On reload the session is restored by trading the HttpOnly refresh
 * cookie for a new access token, which is why `restoring` exists: until that call settles we
 * genuinely do not know whether anyone is signed in, and redirecting to the login page before
 * then would throw out a valid session on every refresh.
 */
/** Shared by every caller of restore(), so one reload makes one refresh call. */
let restorePromise = null;

export const usePlatformAuthStore = create((set, get) => ({
  admin: null,
  /** True until the first refresh attempt settles. Guards must wait for this. */
  restoring: true,
  /** Set when a session ends by itself, so the login page can explain why. */
  sessionMessage: null,

  /**
   * Replaces the signed-in admin after they edit their own profile, so the sidebar shows the
   * new name straight away rather than the old one until the next reload.
   */
  setAdmin(admin) {
    if (admin) set({ admin });
  },

  async signIn(email, password) {
    const { data } = await platformApi.post(
      '/auth/login',
      { email, password },
      { skipPlatformAuthRetry: true },
    );
    setPlatformAccessToken(data.accessToken);
    set({ admin: data.admin, sessionMessage: null });
    return data.admin;
  },

  async signOut() {
    try {
      await platformApi.post('/auth/logout');
    } catch {
      // Already signed out server-side, or offline. Clear locally regardless.
    }
    setPlatformAccessToken(null);
    set({ admin: null, sessionMessage: null });
  },

  /**
   * Restores a session from the refresh cookie.
   *
   * Single-flight: the login page and the route guard both need this to have run before they
   * can decide anything, and whichever mounts first should start it while the other waits on
   * the same promise. Without that the login page sat on its "checking your session" spinner
   * forever, because only the guard ever called it.
   */
  async restore() {
    if (restorePromise) return restorePromise;
    restorePromise = get()._doRestore().finally(() => {
      restorePromise = null;
    });
    return restorePromise;
  },

  async _doRestore() {
    try {
      const data = await refreshAccessToken();
      set({ admin: data.admin, restoring: false });
      return data.admin;
    } catch {
      // No cookie, expired, or revoked. Not an error worth showing: it is the normal state
      // for anyone who has not signed in yet.
      setPlatformAccessToken(null);
      set({ admin: null, restoring: false });
      return null;
    }
  },

  /** Called by the API client when a request comes back unauthenticated. */
  endSession(code) {
    if (!get().admin) return;
    const message =
      code === 'ACCOUNT_DISABLED'
        ? 'This platform account has been disabled.'
        : code === 'ROLE_CHANGED'
          ? 'Your role changed. Sign in again to continue.'
          : code === 'SESSION_REVOKED'
            ? 'You were signed out. Sign in again.'
            : 'Your session has expired. Sign in again.';
    set({ admin: null, sessionMessage: message });
  },

  can(...roles) {
    const role = get().admin?.role;
    return Boolean(role) && roles.includes(role);
  },
}));

configurePlatformApi({
  onSignedOut: (code) => usePlatformAuthStore.getState().endSession(code),
});

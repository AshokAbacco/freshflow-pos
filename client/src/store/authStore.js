import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { api } from '../lib/api';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      sessionMessage: null,

      async login(email, password) {
        const { data } = await api.post('/auth/login', { email, password }, { skipAuthHandling: true });
        set({ token: data.token, user: data.user, sessionMessage: null });
        return data.user;
      },

      /** Refresh the profile when online; offline terminals keep their cached session so selling continues. */
      async refreshProfile() {
        if (!get().token || !navigator.onLine) return;
        try {
          const { data } = await api.get('/auth/me');
          set({ user: data.user });
        } catch {
          /* 401s are handled by the API interceptor; network errors keep the cached session */
        }
      },

      logout(message = null) {
        // Deliberately does NOT clear the IndexedDB outbox: unsynced bills upload after the next sign-in.
        set({ token: null, user: null, sessionMessage: message });
      },
    }),
    {
      name: 'ff_auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ token: s.token, user: s.user }),
    },
  ),
);

export const selectIsAdmin = (s) => s.user?.role === 'ADMIN';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { api } from '../lib/api';

export const useAuthStore = create(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      organization: null,
      subscription: null,
      sessionMessage: null,

      async login(email, password) {
        const { data } = await api.post('/auth/login', { email, password }, { skipAuthHandling: true });
        set({ token: data.token, user: data.user, organization: data.organization ?? null, sessionMessage: null });
        get().refreshSubscription();
        return data.user;
      },

      /** Create a store and its first admin, then sign straight in. */
      async signup(details) {
        const { data } = await api.post('/public/signup', details, { skipAuthHandling: true });
        set({
          token: data.token,
          user: data.user,
          organization: data.organization,
          subscription: data.subscription,
          sessionMessage: null,
        });
        return data.user;
      },

      async refreshSubscription() {
        if (!get().token) return null;
        try {
          const { data } = await api.get('/billing/subscription');
          set({ subscription: data.subscription, paymentsEnabled: data.paymentsEnabled });
          return data.subscription;
        } catch {
          return null;
        }
      },

      /** Refresh the profile when online; offline terminals keep their cached session so selling continues. */
      async refreshProfile() {
        if (!get().token || !navigator.onLine) return;
        try {
          const { data } = await api.get('/auth/me');
          set({ user: data.user, organization: data.organization ?? get().organization });
          get().refreshSubscription();
        } catch {
          /* 401s are handled by the API interceptor; network errors keep the cached session */
        }
      },

      logout(message = null) {
        // Deliberately does NOT clear the IndexedDB outbox: unsynced bills upload after the next sign-in.
        set({ token: null, user: null, organization: null, subscription: null, sessionMessage: message });
      },
    }),
    {
      name: 'ff_auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ token: s.token, user: s.user, organization: s.organization, subscription: s.subscription }),
    },
  ),
);

export const selectIsAdmin = (s) => s.user?.role === 'ADMIN';

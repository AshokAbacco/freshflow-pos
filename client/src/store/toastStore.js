import { create } from 'zustand';

let nextId = 1;

export const useToastStore = create((set, get) => ({
  toasts: [],
  push(message, tone = 'neutral', duration = 3200) {
    const id = nextId++;
    set({ toasts: [...get().toasts.slice(-3), { id, message, tone }] });
    setTimeout(() => get().dismiss(id), duration);
    return id;
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

export const toast = {
  info: (m) => useToastStore.getState().push(m, 'neutral'),
  success: (m) => useToastStore.getState().push(m, 'success'),
  error: (m) => useToastStore.getState().push(m, 'error', 5000),
  warn: (m) => useToastStore.getState().push(m, 'warn', 4500),
};

import { create } from 'zustand';

export type ToastKind = 'error' | 'info';

export type Toast = {
  id: string;
  message: string;
  kind: ToastKind;
};

type ToastStore = {
  toasts: Toast[];
  pushToast: (message: string, kind?: ToastKind) => string;
  dismissToast: (id: string) => void;
};

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  pushToast(message, kind = 'error') {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
    return id;
  },

  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

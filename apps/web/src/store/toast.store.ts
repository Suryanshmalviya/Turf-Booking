import { create } from 'zustand';

import type { ToastVariant } from '../types/ui';

export interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  /** Auto-dismiss delay in milliseconds. `0` keeps the toast until dismissed. */
  duration: number;
}

export interface ToastInput {
  variant?: ToastVariant;
  title: string;
  description?: string;
  duration?: number;
}

const DEFAULT_DURATION = 5000;

interface ToastState {
  toasts: Toast[];
  push: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

let counter = 0;

function nextId(): string {
  counter += 1;
  return `toast-${counter}`;
}

/**
 * Ephemeral notifications. Kept outside React so any service or hook can raise a
 * toast without prop drilling or context lookups.
 */
export const useToastStore = create<ToastState>()(set => ({
  toasts: [],
  push: (toast: ToastInput) => {
    const id = nextId();
    const entry: Toast = {
      id,
      variant: toast.variant ?? 'info',
      title: toast.title,
      description: toast.description,
      duration: toast.duration ?? DEFAULT_DURATION,
    };
    set(state => ({ toasts: [...state.toasts, entry].slice(-4) }));
    return id;
  },
  dismiss: id => set(state => ({ toasts: state.toasts.filter(toast => toast.id !== id) })),
  clear: () => set({ toasts: [] }),
}));
import { useEffect } from 'react';

import type { Toast as ToastModel } from '../../store/toast.store';
import type { ToastVariant } from '../../types/ui';
import { cn } from '../../utils/cn';

const VARIANT_CLASS: Record<ToastVariant, string> = {
  info: 'border-blue-200 bg-blue-50 text-blue-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  danger: 'border-red-200 bg-red-50 text-red-900',
};

export interface ToastViewportProps {
  toasts: ToastModel[];
  onDismiss: (id: string) => void;
}

/**
 * Fixed-position stack of notifications. Rendered once at the app root by
 * `ToastProvider`; individual toasts are read from the Zustand toast store.
 */
export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastModel; onDismiss: (id: string) => void }) {
  useEffect(() => {
    if (toast.duration <= 0) return undefined;
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => window.clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border p-4 shadow-lg',
        VARIANT_CLASS[toast.variant]
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{toast.title}</p>
        {toast.description && <p className="mt-1 text-sm opacity-90">{toast.description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="rounded p-1 text-lg leading-none opacity-60 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
      >
        &times;
      </button>
    </div>
  );
}
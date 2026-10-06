import type { ReactNode } from 'react';

import { ToastViewport } from '../components/ui/Toast';
import { useToastStore } from '../store/toast.store';

/**
 * Mounts the notification viewport. Toast state lives in the Zustand store so
 * any part of the app can raise a notification without prop drilling.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const toasts = useToastStore(state => state.toasts);
  const dismiss = useToastStore(state => state.dismiss);

  return (
    <>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </>
  );
}

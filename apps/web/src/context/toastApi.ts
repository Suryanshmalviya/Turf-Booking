import { type ToastInput,useToastStore } from '../store/toast.store';

export interface ToastApi {
  push: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
  success: (title: string, description?: string) => string;
  error: (title: string, description?: string) => string;
}

/**
 * Module-level toast API. Kept outside the provider so mutations and stores can
 * raise notifications without a React context lookup.
 */
export const toastApi: ToastApi = {
  push: toast => useToastStore.getState().push(toast),
  dismiss: id => useToastStore.getState().dismiss(id),
  success: (title, description) =>
    useToastStore.getState().push({ variant: 'success', title, description }),
  error: (title, description) =>
    useToastStore.getState().push({ variant: 'danger', title, description }),
};
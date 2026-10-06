import { type ToastApi,toastApi } from '../context/toastApi';

/**
 * Raise transient notifications. The API is module-level so it can be called
 * from mutation callbacks without threading props through component trees.
 */
export function useToast(): ToastApi {
  return toastApi;
}
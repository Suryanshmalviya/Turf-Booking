export const CSRF_COOKIE_NAME = 'pb_csrf';

/**
 * Read the (non-HttpOnly) CSRF cookie so unsafe requests can echo it back in
 * the `X-CSRF-Token` header (double-submit cookie pattern).
 */
export function getCsrfToken(): string | undefined {
  return document.cookie
    .split('; ')
    .find(value => value.startsWith(`${CSRF_COOKIE_NAME}=`))
    ?.split('=')
    .slice(1)
    .join('=');
}

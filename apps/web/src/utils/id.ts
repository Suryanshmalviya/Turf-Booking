/**
 * Idempotency key generation.
 *
 * The API collapses duplicate requests carrying the same key, so a key must be
 * stable across retries of one logical action. Every caller therefore mints the
 * key once, stores it for the lifetime of the action, and reuses it — never
 * regenerating per attempt, which is exactly the case the server dedupes.
 */
export function newIdempotencyKey(prefix = 'pb'): string {
  // `randomUUID` needs a secure context; the fallback keeps non-HTTPS dev
  // environments and older runtimes working.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  const random = Math.random().toString(16).slice(2);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}
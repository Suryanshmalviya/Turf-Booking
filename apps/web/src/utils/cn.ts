/**
 * Join conditional class names. Falsy entries are dropped so call sites can
 * inline ternaries without producing `"false"` or `"undefined"` classes.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}
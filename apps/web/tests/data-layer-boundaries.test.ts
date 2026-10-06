import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Architectural guards.
 *
 * The browser has no database credentials and no ORM, so the only path from the
 * UI to persisted data is the HTTP layer. These checks read the source rather
 * than the runtime, because an accidental import is exactly the kind of
 * regression that otherwise shows up in production as a bundle that pulls in a
 * driver.
 */

const SRC = join(process.cwd(), 'src');

function sourceFiles(dir = SRC): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? sourceFiles(full) : [full];
  });
}

const sources = sourceFiles().filter(path => /\.(ts|tsx)$/.test(path));

const read = (path: string) => readFileSync(path, 'utf8');

const importers = (pattern: RegExp) =>
  sources
    .filter(path => pattern.test(read(path)))
    .map(path => relative(process.cwd(), path).split(sep).join('/'));

describe('frontend data access boundaries', () => {
  it('has source files to scan', () => {
    expect(sources.length).toBeGreaterThan(0);
  });

  it('never imports a database driver or ORM from the frontend', () => {
    expect(importers(/from\s+['"](mongodb|mongoose)['"]/)).toEqual([]);
    expect(importers(/require\(\s*['"](mongodb|mongoose)['"]\s*\)/)).toEqual([]);
  });

  it('never reaches the network outside the API layer', () => {
    // `fetch` belongs to `api-client.ts`; anywhere else it bypasses the envelope
    // handling, the timeout, and the single-flight refresh.
    expect(importers(/\bfetch\s*\(/).filter(path => path !== 'src/services/api-client.ts')).toEqual(
      []
    );
  });

  it('never hard-codes an API origin or bearer token', () => {
    expect(importers(/https?:\/\/(localhost|127\.0\.0\.1|\d+\.\d+\.\d+\.\d+)(:\d+)?\//)).toEqual(
      []
    );
    expect(importers(/Authorization\s*:/)).toEqual([]);
  });

  it('only builds absolute request URLs in the API layer', () => {
    // Cross-origin targets would bypass cookies and CSRF headers.
    expect(importers(/API_BASE_URL/).filter(path => path !== 'src/services/api-client.ts')).toEqual(
      []
    );
  });
});

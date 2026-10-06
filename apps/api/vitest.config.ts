import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'dist/', 'tests/', '**/*.d.ts', '**/*.config.*'],
    },
    testTimeout: 10000,
    // Suites that boot an in-memory MongoDB need longer than a normal hook: the
    // first `mongod` start can take several seconds, and two suites may start
    // theirs at the same time.
    hookTimeout: 120000,
    teardownTimeout: 60000,
  },
});

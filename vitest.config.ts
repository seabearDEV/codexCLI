import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    root: './src',
    include: ['**/__tests__/**/*.ts', '**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reportsDirectory: '../coverage',
      include: ['**/*.ts'],
      exclude: ['**/*.d.ts', '**/__tests__/**'],
    },
  },
});

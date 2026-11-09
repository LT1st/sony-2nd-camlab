import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@camera-lab/contracts': path.resolve(__dirname, 'packages/contracts/src/index.ts'),
      '@camera-lab/domain': path.resolve(__dirname, 'packages/domain/src/index.ts'),
      '@camera-lab/camera-port': path.resolve(__dirname, 'packages/camera-port/src/index.ts'),
      '@camera-lab/adapters-mock': path.resolve(__dirname, 'packages/adapters-mock/src/index.ts'),
      '@camera-lab/image-core': path.resolve(__dirname, 'packages/image-core/src/index.ts'),
      '@camera-lab/persistence': path.resolve(__dirname, 'packages/persistence/src/index.ts'),
      '@camera-lab/diagnostics': path.resolve(__dirname, 'packages/diagnostics/src/index.ts'),
      '@camera-lab/ui': path.resolve(__dirname, 'packages/ui/src/index.ts')
    }
  },
  test: {
    globals: true,
    pool: 'forks',
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**']
  }
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@camera-lab/contracts': path.resolve(
        __dirname,
        '../../packages/contracts/src/index.ts'
      ),
      '@camera-lab/domain': path.resolve(
        __dirname,
        '../../packages/domain/src/index.ts'
      ),
      '@camera-lab/camera-port': path.resolve(
        __dirname,
        '../../packages/camera-port/src/index.ts'
      ),
      '@camera-lab/adapters-mock': path.resolve(
        __dirname,
        '../../packages/adapters-mock/src/index.ts'
      ),
      '@camera-lab/image-core': path.resolve(
        __dirname,
        '../../packages/image-core/src/index.ts'
      ),
      '@camera-lab/persistence': path.resolve(
        __dirname,
        '../../packages/persistence/src/index.ts'
      ),
      '@camera-lab/diagnostics': path.resolve(
        __dirname,
        '../../packages/diagnostics/src/index.ts'
      ),
      '@camera-lab/ui': path.resolve(__dirname, '../../packages/ui/src/index.ts')
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173
  }
});

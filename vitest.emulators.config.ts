import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@shared': fileURLToPath(new URL('./shared/src', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['**/*.emu.test.ts'],
    exclude: ['**/node_modules/**'],
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});

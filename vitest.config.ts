import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const sharedAlias = { '@shared': fileURLToPath(new URL('./shared/src', import.meta.url)) };
const exclude = ['**/*.emu.test.ts', '**/node_modules/**'];

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias: sharedAlias },
        test: { name: 'shared', environment: 'node', include: ['shared/test/**/*.test.ts'], exclude },
      },
      {
        resolve: { alias: sharedAlias },
        test: { name: 'functions', environment: 'node', include: ['functions/test/**/*.test.ts'], exclude },
      },
      {
        plugins: [react()],
        resolve: { alias: sharedAlias },
        test: {
          name: 'app',
          environment: 'jsdom',
          include: ['app/test/**/*.test.{ts,tsx}'],
          exclude,
          setupFiles: ['app/test/setup.ts'],
        },
      },
    ],
  },
});

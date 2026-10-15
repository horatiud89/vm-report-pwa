import { fileURLToPath } from 'node:url';
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
    ],
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { localCoverStoragePlugin } from './scripts/local-cover-storage-plugin.mjs';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: command === 'build' ? '/masterfull-library/' : '/',
    plugins: [react(), localCoverStoragePlugin({
      root: process.cwd(),
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      pagesBaseUrl: env.VITE_GITHUB_PAGES_URL || 'https://masterfullgroup.github.io/masterfull-library/',
    })],
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
  };
});
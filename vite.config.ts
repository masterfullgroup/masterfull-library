import { defineConfig, type OutputAsset, type OutputBundle, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { localCoverStoragePlugin } from './scripts/local-cover-storage-plugin.mjs';

function inlineProductionStyles(): Plugin {
  return {
    name: 'inline-production-styles',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle: OutputBundle) {
      const html = bundle['index.html'];
      if (!html || html.type !== 'asset') throw new Error('No se encontró index.html para publicar.');
      let markup = typeof html.source === 'string' ? html.source : new TextDecoder().decode(html.source);
      const stylesheets = Object.values(bundle).filter((file): file is OutputAsset => file.type === 'asset' && file.fileName.endsWith('.css'));
      for (const stylesheet of stylesheets) {
        const escapedName = stylesheet.fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const link = new RegExp(`<link\\b(?=[^>]*href=["'][^"']*${escapedName}["'])[^>]*>`);
        if (!link.test(markup)) throw new Error(`No se encontró el enlace a ${stylesheet.fileName} en index.html.`);
        const css = typeof stylesheet.source === 'string' ? stylesheet.source : new TextDecoder().decode(stylesheet.source);
        markup = markup.replace(link, `<style>${css}</style>`);
        delete bundle[stylesheet.fileName];
      }
      html.source = markup;
    },
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: command === 'build' ? '/masterfull-library/' : '/',
    plugins: [react(), localCoverStoragePlugin({
      root: process.cwd(),
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      pagesBaseUrl: env.VITE_GITHUB_PAGES_URL || 'https://masterfullgroup.github.io/masterfull-library/',
    }), inlineProductionStyles()],
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
  };
});

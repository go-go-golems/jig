import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build` → dist/ (index.html + hashed assets); `vite build --mode single` → dist-single/index.html, one
// self-contained file like the original workbench build (works from file://, no network needed).
export default defineConfig(({ mode }) => ({
  base: './',
  esbuild: { jsx: 'transform', jsxFactory: 'React.createElement', jsxFragment: 'React.Fragment' },
  build: {
    target: 'es2022',
    outDir: mode === 'single' ? 'dist-single' : 'dist',
    chunkSizeWarningLimit: 4096,
  },
  // dev server reachable from the LAN (http://bling.local:5173/); Vite rejects other Host headers with 403
  server: { host: '0.0.0.0', allowedHosts: ['bling.local', 'bling', '.ts.net', 'localhost'] },
  preview: { host: '0.0.0.0', allowedHosts: ['bling.local', 'bling', '.ts.net', 'localhost'] },
  plugins: mode === 'single' ? [viteSingleFile()] : [],
}));

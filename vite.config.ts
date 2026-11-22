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
  plugins: mode === 'single' ? [viteSingleFile()] : [],
}));

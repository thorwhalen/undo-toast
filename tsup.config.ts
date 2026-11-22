import { defineConfig } from 'tsup';

/** One ESM build (the core, the React and DOM renderers, the CLI; React stays external) and one script-tag file. */
export default defineConfig([{
  entry: {
    index: 'src/index.ts',
    'react/index': 'src/react/index.tsx',
    'dom/index': 'src/dom/index.ts',
    'cli/main': 'src/cli/main.ts',
  },
  format: ['esm'],
  dts: { entry: { index: 'src/index.ts', 'react/index': 'src/react/index.tsx', 'dom/index': 'src/dom/index.ts' } },
  splitting: true,
  treeshake: true,
  clean: false,
  target: 'es2022',
  platform: 'neutral',
  external: ['react', 'react-dom', /^node:/],
  onSuccess: 'cp src/styles.css dist/styles.css',
},
{
  // The script-tag build: one self-contained file defining the global `UndoToast`.
  entry: { 'undo-toast': 'src/dom/global.ts' },
  format: ['iife'],
  globalName: 'UndoToast',
  outExtension: () => ({ js: '.global.js' }),
  minify: true,
  clean: false,
  target: 'es2022',
  platform: 'browser',
}]);

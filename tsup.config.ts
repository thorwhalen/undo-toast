import { defineConfig } from 'tsup';

/** One ESM build: the framework-free core, the React renderer, the CLI. React stays external. */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'react/index': 'src/react/index.tsx',
    'cli/main': 'src/cli/main.ts',
  },
  format: ['esm'],
  dts: { entry: { index: 'src/index.ts', 'react/index': 'src/react/index.tsx' } },
  splitting: true,
  treeshake: true,
  clean: true,
  target: 'es2022',
  platform: 'neutral',
  external: ['react', 'react-dom', /^node:/],
  onSuccess: 'cp src/styles.css dist/styles.css',
});

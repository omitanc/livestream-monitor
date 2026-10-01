import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
await build({
  entryPoints: ['src/main/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outfile: 'dist/main/index.cjs',
  external: ['electron', 'electron-updater'],
});
await build({
  entryPoints: ['src/preload/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  outfile: 'dist/preload/index.cjs',
  external: ['electron'],
});
await viteBuild();

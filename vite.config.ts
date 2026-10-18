import { createRequire } from 'node:module';
import path from 'node:path';

type RuntimeProcess = { env: Record<string, string | undefined> };
const env = (globalThis as typeof globalThis & { process?: RuntimeProcess }).process?.env ?? {};
const externalModules = env.LEDGERLY_NODE_MODULES?.replace(/[\\/]+$/, '');
const resolveExternal = externalModules ? createRequire(path.join(externalModules, 'package.json')) : null;
const importEntryPaths: Record<string, string> = {
  'react-router-dom': 'react-router-dom/dist/index.js',
  'lucide-react': 'lucide-react/dist/esm/lucide-react.js',
  recharts: 'recharts/es6/index.js',
  dexie: 'dexie/dist/dexie.mjs',
  zod: 'zod/lib/index.mjs',
};
const dependencyAliases = resolveExternal ? [
  'react/jsx-runtime', 'react-dom/client', 'react', 'react-router-dom', 'lucide-react', 'recharts', 'dexie', 'zod', 'vitest', 'fake-indexeddb/auto',
].map((name) => ({
  find: new RegExp(`^${name}$`),
  replacement: name === 'vitest'
    ? path.join(externalModules!, 'vitest', 'dist', 'index.js')
    : importEntryPaths[name]
      ? path.join(externalModules!, importEntryPaths[name])
      : resolveExternal.resolve(name),
})) : [];

export default {
  resolve: { alias: dependencyAliases },
  build: {
    outDir: env.LEDGERLY_BUILD_OUT_DIR || 'dist',
    emptyOutDir: Boolean(env.LEDGERLY_BUILD_OUT_DIR),
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          const normalized = id.replaceAll('\\', '/');
          if (normalized.includes('/node_modules/recharts/') || /\/node_modules\/(?:d3-[^/]+|internmap)\//.test(normalized)) return 'charts';
          if (/\/node_modules\/(?:react|react-dom|scheduler)\//.test(normalized)) return 'react-vendor';
          if (normalized.includes('/node_modules/dexie/')) return 'storage-vendor';
        },
      },
    },
  },
  test: { environment: 'jsdom', setupFiles: './tests/setup.ts', clearMocks: true },
};

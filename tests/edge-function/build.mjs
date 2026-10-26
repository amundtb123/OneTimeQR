// Bundles the Edge Function for Node: npm: specifiers -> project packages, supabase-js -> PGlite mock
import { createRequire } from 'node:module';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
// Repository root (override with an explicit path, e.g. to test another checkout)
const project = path.resolve(process.argv[2] ?? path.join(here, '../..'));
const require = createRequire(path.join(project, 'package.json'));
const esbuild = require('esbuild');

await esbuild.build({
  entryPoints: [path.join(project, 'src/supabase/functions/server/index-standalone.tsx')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: path.join(here, '.out/server.mjs'),
  logLevel: 'warning',
  plugins: [{
    name: 'deno-npm',
    setup(build) {
      build.onResolve({ filter: /^npm:@supabase\/supabase-js/ }, () => ({ path: path.join(here, 'mock-supabase.mjs') }));
      build.onResolve({ filter: /^npm:hono\/logger$/ }, () => ({ path: 'logger', namespace: 'stub' }));
      build.onResolve({ filter: /^npm:hono/ }, (args) => ({ path: require.resolve(args.path.slice(4)) }));
      build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
        contents: 'export const logger = () => async (_c, next) => { await next(); };',
        loader: 'js',
      }));
    },
  }],
});
console.log('bundled');

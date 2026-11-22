// Runs the Edge Function locally, against the same in-memory Postgres the tests use, so the app
// can be tried out without Supabase or Docker. Nothing here talks to production, and everything
// is gone when the server stops.
//
//   cd tests/edge-function && npm run dev     (then, in the project root: npm run dev:local)
//
// The app is logged in as one dev user with 1000 kr of balance (see VITE_LOCAL_API in
// src/utils/local-dev.ts). Files are kept in memory and served from /files/.
import http from 'node:http';
import path from 'node:path';
import { createDb } from './setup-db.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const project = path.resolve(path.join(here, '../..'));
const PORT = Number(process.env.PORT ?? 8787);
const APP_ORIGIN = 'http://localhost:3000';

// Must match DEV_USER_ID and DEV_TOKEN in src/utils/local-dev.ts
const DEV_USER_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const DEV_TOKEN = 'local-dev-token';

const db = await createDb(project);
await db.query(`insert into auth.users (id, email) values ($1, 'dev@localhost')`, [DEV_USER_ID]);
await db.query(`insert into public.user_profiles (id, coins) values ($1, 1000)
  on conflict (id) do update set coins = 1000`, [DEV_USER_ID]);
globalThis.__users = { [DEV_TOKEN]: DEV_USER_ID };
globalThis.__files = new Map();
globalThis.__storageBase = `http://localhost:${PORT}/files`;

const env = { SUPABASE_URL: 'http://db', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon-key', STRIPE_WEBHOOK_SECRET: 'whsec_local' };
globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { globalThis.__handler = h; } };
await import(path.join(here, '.out/server.mjs'));

const cors = {
  'Access-Control-Allow-Origin': APP_ORIGIN,
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    // The stand-in for Storage's signed URLs
    if (url.pathname.startsWith('/files/')) {
      const body = globalThis.__files.get(decodeURIComponent(url.pathname.slice('/files/'.length)));
      res.writeHead(body ? 200 : 404, { ...cors, 'Content-Type': 'application/octet-stream' });
      res.end(body ?? '');
      return;
    }

    // The dev user's balance (the real app reads it from Supabase directly)
    if (url.pathname === '/dev/coins') {
      const coins = (await db.query(`select coins from public.user_profiles where id = $1`, [DEV_USER_ID])).rows[0]?.coins ?? 0;
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      res.end(req.method === 'OPTIONS' ? '' : JSON.stringify({ coins }));
      return;
    }

    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks);
    const response = await globalThis.__handler(new Request(url, { method: req.method, headers: req.headers, body, duplex: 'half' }));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error(error);
    res.writeHead(500);
    res.end();
  }
}).listen(PORT, () => {
  console.log(`\nLocal Edge Function on http://localhost:${PORT} (in-memory database, dev user has 1000 kr)`);
  console.log('Start the app with: npm run dev:local   (in the project root)\n');
});

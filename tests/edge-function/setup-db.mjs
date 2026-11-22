// A real Postgres (PGlite, in-process WASM) set up like Supabase: its roles, a stand-in auth
// schema, and every migration in the repository applied (each one twice, to check that it is
// safe to re-run). Used by the tests and by the local dev server.
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

export async function createDb(project) {
  const sqlFile = (p) => fs.readFileSync(path.join(project, p), 'utf8');
  const db = new PGlite();
  globalThis.__db = db;
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    grant usage on schema public, auth to anon, authenticated, service_role;
    create table public.kv_store_c3c9181e (key text primary key, value jsonb not null);
  `);
  await db.exec(sqlFile('supabase_migration.sql'));
  await db.exec(sqlFile('supabase_migration_idempotency.sql'));
  // Supabase default: anon/authenticated get all table privileges; RLS is the only guard
  await db.exec(`grant all on all tables in schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant execute on functions to public;`);
  // Each migration must be safe to run again right after it was applied
  for (const f of fs.readdirSync(path.join(project, 'supabase/migrations')).sort()) {
    await db.exec(sqlFile(path.join('supabase/migrations', f)));
    await db.exec(sqlFile(path.join('supabase/migrations', f)));
  }
  return db;
}

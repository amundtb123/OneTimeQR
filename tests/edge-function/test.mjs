// End-to-end tests for the Edge Function's access control, run against real Postgres (PGlite).
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
// Repository root (override with an explicit path, e.g. to test another checkout)
const project = path.resolve(process.argv[2] ?? path.join(here, '../..'));
const sqlFile = (p) => fs.readFileSync(path.join(project, p), 'utf8');

const failures = [];
let passed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log('  ok  ', name); }
  else { failures.push(name); console.log('  FAIL', name, detail !== undefined ? JSON.stringify(detail) : ''); }
}

// ---------- Database: emulate Supabase roles/auth, then apply real migrations ----------
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
await db.exec(`grant all on all tables in schema public to anon, authenticated, service_role;`);
for (const f of fs.readdirSync(path.join(project, 'supabase/migrations')).sort()) {
  await db.exec(sqlFile(path.join('supabase/migrations', f)));
}
// Migrations must be re-runnable
for (const f of fs.readdirSync(path.join(project, 'supabase/migrations')).sort()) {
  await db.exec(sqlFile(path.join('supabase/migrations', f)));
}

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const USER_C = '33333333-3333-4333-8333-333333333333';
await db.exec(`insert into auth.users (id) values ('${USER_A}'), ('${USER_B}'), ('${USER_C}');`);
globalThis.__users = { 'tok-A': USER_A, 'tok-B': USER_B };

// Seed expired and fresh tokens; the function's startup cleanup must remove only the expired ones
const now = Date.now();
for (const k of ['access:old', 'view:old', 'pwfail:old', 'qr1_scanned:old', 'unlock_token:old']) {
  await db.query(`insert into public.kv_store_c3c9181e values ($1, $2)`, [k, JSON.stringify({ expiresAt: 1 })]);
}
await db.query(`insert into public.kv_store_c3c9181e values ($1, $2)`, ['view:fresh', JSON.stringify({ expiresAt: now + 1e6 })]);

// ---------- Load the Edge Function ----------
const env = { SUPABASE_URL: 'http://db', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon-key' };
globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { globalThis.__handler = h; } };
await import(path.join(here, '.out/server.mjs'));

async function call(method, p, { body, token, viewToken, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (viewToken) headers['X-View-Token'] = viewToken;
  let reqBody;
  if (form) reqBody = form;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; reqBody = JSON.stringify(body); }
  const res = await globalThis.__handler(new Request('http://local/make-server-c3c9181e' + p, { method, headers, body: reqBody }));
  let json = null;
  try { json = await res.json(); } catch {}
  return { status: res.status, json };
}
async function meta(id, opts) {
  const t = await call('GET', `/qr/${id}`, opts);
  return call('GET', `/qr/${id}?access=${t.json.accessToken}`, opts);
}
const future = () => new Date(Date.now() + 3600e3).toISOString();
async function create(extra = {}, opts = {}) {
  const r = await call('POST', '/create', {
    ...opts,
    body: { contentType: 'text', textContent: 'hemmelig', expiryType: '24h', expiryDate: future(), viewOnly: false, ...extra },
  });
  if (r.status !== 200) throw new Error('create failed ' + JSON.stringify(r));
  return r.json;
}
const rawDrop = async (id) => (await db.query(`select value from public.kv_store_c3c9181e where key = $1`, ['qrdrop:' + id])).rows[0]?.value;

// Wait for startup cleanup to finish
await new Promise((r) => setTimeout(r, 500));

console.log('\nCleanup');
{
  const { rows } = await db.query(`select key from public.kv_store_c3c9181e where key like '%:old' or key = 'view:fresh'`);
  check('expired access/view/pwfail/qr1/unlock tokens removed', !rows.some((r) => r.key.endsWith(':old')), rows);
  check('unexpired view token kept', rows.some((r) => r.key === 'view:fresh'), rows);
}

console.log('\nS1: password-protected drop');
{
  const created = await create({ password: 'riktig' });
  const id = created.id;
  check('create response hides password hash', created.qrDrop.password === true, created.qrDrop.password);
  check('hash is stored server-side', typeof (await rawDrop(id)).password === 'string');

  const m = await meta(id);
  check('metadata returns 200', m.status === 200, m);
  check('metadata has no content', m.json.qrDrop.textContent === undefined && m.json.qrDrop.hasTextContent === true, m.json.qrDrop);
  check('metadata has no password hash', m.json.qrDrop.password === true);

  check('/key without view token is 403', (await call('GET', `/qrdrop/${id}/key`)).status === 403);
  check('/file without view token is 403', (await call('GET', `/qr/${id}/file`)).status === 403);
  check('/open without password is 401', (await call('POST', `/qr/${id}/open`, { body: {} })).status === 401);
  check('/open with wrong password is 401', (await call('POST', `/qr/${id}/open`, { body: { password: 'feil' } })).status === 401);
  const opened = await call('POST', `/qr/${id}/open`, { body: { password: 'riktig' } });
  check('/open with correct password returns content', opened.status === 200 && opened.json.qrDrop.textContent === 'hemmelig', opened);
  check('/open returns a view token', typeof opened.json.viewToken === 'string');
  check('/open hides password hash', opened.json.qrDrop.password === null);
  check('view is counted server-side', (await rawDrop(id)).scanCount === 1);
  check('successful password clears attempt counter', (await db.query(`select 1 from public.kv_store_c3c9181e where key = $1`, ['pwfail:' + id])).rows.length === 0);
  check('old /verify endpoint is gone', (await call('POST', `/qr/${id}/verify`, { body: { password: 'riktig' } })).status === 404);
}

console.log('\nS1: password brute force');
{
  const { id } = await create({ password: 'riktig' });
  const statuses = [];
  for (let i = 0; i < 5; i++) statuses.push((await call('POST', `/qr/${id}/open`, { body: { password: 'feil' + i } })).status);
  check('first 5 wrong attempts are 401', statuses.every((s) => s === 401), statuses);
  const locked = await call('POST', `/qr/${id}/open`, { body: { password: 'riktig' } });
  check('6th attempt is 429 even with correct password', locked.status === 429, locked);

  const { id: id2 } = await create({ password: 'riktig' });
  const parallel = await Promise.all(Array.from({ length: 12 }, (_, i) => call('POST', `/qr/${id2}/open`, { body: { password: 'feil' + i } })));
  const n401 = parallel.filter((r) => r.status === 401).length;
  check('parallel guesses are capped at 5', n401 === 5, parallel.map((r) => r.status));
}

console.log('\nS1: encryption key needs view token');
{
  const { id } = await create({ encryptionKey: 'a'.repeat(64) });
  const other = await create({});
  const otherOpen = await call('POST', `/qr/${other.id}/open`, { body: {} });
  check('/key with another drop\'s view token is 403', (await call('GET', `/qrdrop/${id}/key`, { viewToken: otherOpen.json.viewToken })).status === 403);
  check('/key with forged view token is 403', (await call('GET', `/qrdrop/${id}/key`, { viewToken: crypto.randomUUID() })).status === 403);
  const opened = await call('POST', `/qr/${id}/open`, { body: {} });
  const key = await call('GET', `/qrdrop/${id}/key`, { viewToken: opened.json.viewToken });
  check('/key with own view token returns key', key.status === 200 && key.json.encryptionKey === 'a'.repeat(64), key);
  check('metadata hides encryptionKey', (await meta(id)).json.qrDrop.encryptionKey === undefined);
}

console.log('\nB2 + S1: view limits');
{
  const { id } = await create({ expiryType: 'scan' });
  check('scan-once: first open 200', (await call('POST', `/qr/${id}/open`, { body: {} })).status === 200);
  check('scan-once: second open 410', (await call('POST', `/qr/${id}/open`, { body: {} })).status === 410);
  check('scan-once: metadata now 410', (await meta(id)).status === 410);
  check('scan-once: drop kept while the viewer\'s token is valid', !!(await rawDrop(id)));

  const { id: id2 } = await create({ expiryType: 'scan' });
  const parallel = await Promise.all(Array.from({ length: 8 }, () => call('POST', `/qr/${id2}/open`, { body: {} })));
  check('scan-once: exactly one of 8 parallel opens succeeds', parallel.filter((r) => r.status === 200).length === 1, parallel.map((r) => r.status));

  const { id: id3 } = await create({ maxScans: 2 });
  const s = [];
  for (let i = 0; i < 3; i++) s.push((await call('POST', `/qr/${id3}/open`, { body: {} })).status);
  check('maxScans=2: 200, 200, 410', s.join() === '200,200,410', s);

  const { id: id4 } = await create({ expiryDate: new Date(Date.now() - 1000).toISOString() });
  check('time-expired: metadata 410', (await meta(id4)).status === 410);
  check('time-expired: deleted', !(await rawDrop(id4)));
  const { id: id5 } = await create({ expiryDate: new Date(Date.now() - 1000).toISOString() });
  check('time-expired: open 410', (await call('POST', `/qr/${id5}/open`, { body: {} })).status === 410);

  const { id: id6 } = await create({});
  await call('POST', `/qr/${id6}/scan`);
  check('deprecated /scan no longer counts', ((await rawDrop(id6)).scanCount || 0) === 0);
}

console.log('\nS1: files and downloads');
{
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(100)], { type: 'application/octet-stream' }), 'doc.pdf');
  form.append('metadata', JSON.stringify({ contentType: 'bundle', expiryType: '24h', expiryDate: future(), maxDownloads: 1, viewOnly: false, encryptionKey: 'b'.repeat(64), originalFileTypes: { file: 'application/pdf' } }));
  const up = await call('POST', '/upload', { form });
  check('upload ok', up.status === 200, up);
  const id = up.json.id;
  check('metadata has no file URLs', (await meta(id)).json.files === undefined);
  check('/file without token 403', (await call('GET', `/qr/${id}/file`)).status === 403);
  check('/download without token 403', (await call('POST', `/qr/${id}/download`)).status === 403);
  const opened = await call('POST', `/qr/${id}/open`, { body: {} });
  check('/open returns signed file URLs', opened.json.files?.length === 1 && opened.json.fileUrl?.startsWith('https://signed.test/'), opened.json);
  const vt = opened.json.viewToken;
  check('/file with token 200', (await call('GET', `/qr/${id}/file`, { viewToken: vt })).status === 200);
  check('/file?index=0 with token 200', (await call('GET', `/qr/${id}/file?index=0`, { viewToken: vt })).status === 200);
  check('/download with token 200', (await call('POST', `/qr/${id}/download`, { viewToken: vt })).status === 200);
  check('/download beyond maxDownloads 410', (await call('POST', `/qr/${id}/download`, { viewToken: vt })).status === 410);
  check('/file after maxDownloads 410', (await call('GET', `/qr/${id}/file`, { viewToken: vt })).status === 410);
}

console.log('\nS1: ownership');
{
  const { id } = await create({}, { token: 'tok-A' });
  const ownerOpen = await call('POST', `/qr/${id}/open`, { body: {}, token: 'tok-A' });
  check('owner preview works', ownerOpen.status === 200);
  check('owner preview does not use a view', ((await rawDrop(id)).scanCount || 0) === 0);
  check('owner can fetch files without view token', (await call('GET', `/qr/${id}/file`, { token: 'tok-A' })).status === 404 /* no files, but access granted */);
  check('other user cannot fetch files without token', (await call('GET', `/qr/${id}/file`, { token: 'tok-B' })).status === 403);
  await call('POST', `/qr/${id}/open`, { body: {}, token: 'tok-B' });
  check('other user\'s open is counted', (await rawDrop(id)).scanCount === 1);

  const list = await call('GET', '/qrdrops', { token: 'tok-A' });
  check('/qrdrops returns own drops only', list.json.qrDrops.length >= 1 && list.json.qrDrops.every((q) => q.userId === USER_A), list.json.qrDrops.length);
  const pw = await create({ password: 'x' }, { token: 'tok-A' });
  const list2 = await call('GET', '/qrdrops', { token: 'tok-A' });
  check('/qrdrops hides password hash', list2.json.qrDrops.find((q) => q.id === pw.id)?.password === true);
  check('/qrdrops without auth is empty', (await call('GET', '/qrdrops')).json.qrDrops.length === 0);

  check('delete without auth 401', (await call('DELETE', `/qr/${id}`)).status === 401);
  check('delete by other user 403', (await call('DELETE', `/qr/${id}`, { token: 'tok-B' })).status === 403);
  const anon = await create({});
  check('anonymous drop cannot be deleted by anyone', (await call('DELETE', `/qr/${anon.id}`, { token: 'tok-B' })).status === 403);
  check('delete by owner 200', (await call('DELETE', `/qr/${id}`, { token: 'tok-A' })).status === 200 && !(await rawDrop(id)));
}

console.log('\nOwner token (anonymous creator preview)');
{
  const created = await create({ expiryType: 'scan' });
  check('create returns owner token', typeof created.ownerToken === 'string');
  check('owner token hash is not exposed', created.qrDrop.ownerTokenHash === undefined && (await meta(created.id)).json.qrDrop.ownerTokenHash === undefined);
  const call2 = (h) => globalThis.__handler(new Request(`http://local/make-server-c3c9181e/qr/${created.id}/open`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: '{}' }));
  check('preview with owner token 200', (await call2({ 'X-Owner-Token': created.ownerToken })).status === 200);
  check('preview with owner token does not use the view', ((await rawDrop(created.id)).scanCount || 0) === 0);
  check('wrong owner token is a normal view', (await call2({ 'X-Owner-Token': crypto.randomUUID() })).status === 200 && (await rawDrop(created.id)).scanCount === 1);
  check('recipient after that gets 410', (await call2({})).status === 410);
  const other = await create({});
  check('owner token of another drop does not grant access', (await call('GET', `/qr/${other.id}/file`, { viewToken: undefined })).status === 403);
}

console.log('\nB1: Single QR Mode text-only');
{
  const clientId = crypto.randomUUID();
  const ct = JSON.stringify({ iv: 'i', salt: 's', ciphertext: 'c' });
  const r = await call('POST', '/create', { body: { contentType: 'bundle', singleQrMode: true, textContentCiphertext: ct, clientId, expiryType: '24h', expiryDate: future(), viewOnly: false } });
  check('uses client id', r.json.id === clientId);
  const opened = await call('POST', `/qr/${clientId}/open`, { body: {} });
  check('ciphertext is stored and returned', opened.json.qrDrop.textContent === ct, opened.json.qrDrop.textContent);
}

console.log('\nSQL: privileges and RLS');
async function asRole(role, sub, sql, params = []) {
  await db.exec(`set role ${role}`);
  if (sub) await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [sub]);
  try { return { ok: true, res: await db.query(sql, params) }; }
  catch (e) { return { ok: false, err: e.message }; }
  finally { await db.exec(`reset role`); await db.query(`select set_config('request.jwt.claim.sub', '', false)`); }
}
{
  check('anon cannot call qrdrop_consume', !(await asRole('anon', null, `select public.qrdrop_consume('x', 'scan', 0)`)).ok);
  check('authenticated cannot call qrdrop_register_password_attempt', !(await asRole('authenticated', USER_A, `select public.qrdrop_register_password_attempt('x', 0, 1)`)).ok);
  check('anon cannot read kv store', ((await asRole('anon', null, `select * from public.kv_store_c3c9181e`)).res?.rows.length ?? 0) === 0);
  check('authenticated cannot read kv store', ((await asRole('authenticated', USER_A, `select * from public.kv_store_c3c9181e`)).res?.rows.length ?? 0) === 0);
  check('anon cannot truncate kv store', !(await asRole('anon', null, `truncate public.kv_store_c3c9181e`)).ok);

  const upd = await asRole('authenticated', USER_A, `update public.user_profiles set coins = 99999 where id = $1`, [USER_A]);
  const coinsA = (await db.query(`select coins from public.user_profiles where id = $1`, [USER_A])).rows[0].coins;
  check('S3: user cannot set own coins', !upd.ok && coinsA === 0, { upd, coinsA });
  check('user can read own profile', (await asRole('authenticated', USER_A, `select coins from public.user_profiles`)).res?.rows.length === 1);
  check('user cannot read other profiles', (await asRole('authenticated', USER_A, `select * from public.user_profiles where id = $1`, [USER_B])).res?.rows.length === 0);

  await db.query(`delete from public.user_profiles where id = $1`, [USER_C]);
  check('S3: user cannot create profile with coins', !(await asRole('authenticated', USER_C, `insert into public.user_profiles (id, coins) values ($1, 50)`, [USER_C])).ok);
  check('user can create own profile with 0 coins', (await asRole('authenticated', USER_C, `insert into public.user_profiles (id, coins) values ($1, 0)`, [USER_C])).ok);
  check('user cannot create profile for someone else', !(await asRole('authenticated', USER_C, `insert into public.user_profiles (id, coins) values ($1, 0)`, [USER_B])).ok);
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) console.log('Failed:', failures);
process.exit(failures.length ? 1 : 0);

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
await db.exec(`grant all on all tables in schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to public;`);
// Each migration must be safe to run again right after it was applied
for (const f of fs.readdirSync(path.join(project, 'supabase/migrations')).sort()) {
  await db.exec(sqlFile(path.join('supabase/migrations', f)));
  await db.exec(sqlFile(path.join('supabase/migrations', f)));
}

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const USER_C = '33333333-3333-4333-8333-333333333333';
const USER_R = '44444444-4444-4444-8444-444444444444'; // has plenty of coins for paid features
const USER_P = '55555555-5555-4555-8555-555555555555'; // pricing tests
const USER_W = '66666666-6666-4666-8666-666666666666'; // webhook tests
await db.exec(`insert into auth.users (id) values ('${USER_A}'), ('${USER_B}'), ('${USER_C}'), ('${USER_R}'), ('${USER_P}'), ('${USER_W}');`);
await db.exec(`update public.user_profiles set coins = 100000 where id = '${USER_R}';`);
globalThis.__users = { 'tok-A': USER_A, 'tok-B': USER_B, 'tok-R': USER_R, 'tok-P': USER_P, 'tok-W': USER_W };
const paid = { token: 'tok-R' };

// Seed expired and fresh rows; the function's startup cleanup must remove only the expired ones
const EXPIRED_DROP = crypto.randomUUID();
const FRESH_DROP = crypto.randomUUID();
await db.query(`insert into public.qr_drops (id, content_type, expiry_type, expires_at, files) values
  ($1, 'bundle', '10m', now() - interval '1 minute', '[{"name":"a","path":"expired/a.bin"}]'),
  ($2, 'text', '10m', now() + interval '1 hour', '[]')`, [EXPIRED_DROP, FRESH_DROP]);
(globalThis.__files ??= new Map()).set('expired/a.bin', Buffer.from('x'));
await db.query(`insert into public.qr_password_attempts values ($1, 3, now() - interval '1 second')`, [FRESH_DROP]);
for (const [hash, expires] of [['old-view-1', '-1 minute'], ['old-view-2', '-1 second'], ['fresh-view', '1 hour']]) {
  await db.query(`insert into public.qr_tokens values ($1, 'view', $2, now() + $3::interval)`, [hash, FRESH_DROP, expires]);
}
await db.query(`insert into public.rate_limits values ('create:old', 5, now() - interval '1 minute')`);

// ---------- Load the Edge Function ----------
const env = { SUPABASE_URL: 'http://db', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon-key', STRIPE_WEBHOOK_SECRET: 'whsec_test' };
globalThis.Deno = { env: { get: (k) => env[k] }, serve: (h) => { globalThis.__handler = h; } };
await import(path.join(here, '.out/server.mjs'));

// Each request comes from a fresh IP unless one is given, so anonymous rate limits don't interfere
const randomIp = () => `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
async function call(method, p, { body, token, viewToken, form, ip, headers: extraHeaders } = {}) {
  const headers = { 'x-forwarded-for': ip ?? randomIp(), ...extraHeaders };
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
const meta = (id, opts) => call('GET', `/qr/${id}`, opts);
async function create(extra = {}, opts = {}) {
  const r = await call('POST', '/create', {
    ...opts,
    body: { contentType: 'text', textContent: 'hemmelig', expiryType: '10m', viewOnly: false, ...extra },
  });
  if (r.status !== 200) throw new Error('create failed ' + JSON.stringify(r));
  return r.json;
}
// The stored row, with the field names the tests check
const rawDrop = async (id) => {
  const row = (await db.query(`select * from public.qr_drops where id = $1`, [id])).rows[0];
  return row && { password: row.password_hash, scanCount: row.scan_count, maxScans: row.max_scans, textContent: row.text_content, expiresAt: row.expires_at.getTime() };
};
const coinsOf = async (id) => (await db.query(`select coins from public.user_profiles where id = $1`, [id])).rows[0]?.coins;
const setCoins = (id, coins) => db.query(`update public.user_profiles set coins = $2 where id = $1`, [id, coins]);
// Makes a drop time-expired without waiting
const expireNow = (id) => db.query(`update public.qr_drops set expires_at = now() - interval '1 second' where id = $1`, [id]);

// Wait for startup cleanup to finish
await new Promise((r) => setTimeout(r, 500));

console.log('\nCleanup');
{
  const tokens = (await db.query(`select token_hash from public.qr_tokens where token_hash in ('old-view-1', 'old-view-2', 'fresh-view')`)).rows.map((r) => r.token_hash);
  check('expired view tokens removed', tokens.join() === 'fresh-view', tokens);
  check('expired rate limit removed', (await db.query(`select 1 from public.rate_limits where key = 'create:old'`)).rows.length === 0);
  check('expired password attempt window removed', (await db.query(`select 1 from public.qr_password_attempts where qr_drop_id = $1`, [FRESH_DROP])).rows.length === 0);
  check('expired drop deleted, fresh drop kept', !(await rawDrop(EXPIRED_DROP)) && !!(await rawDrop(FRESH_DROP)));
  check('files of the expired drop removed from storage', !globalThis.__files.has('expired/a.bin'));
  check('storage deletion queue drained', (await db.query(`select 1 from public.storage_deletion_queue`)).rows.length === 0);
}

console.log('\nS1: password-protected drop');
{
  const created = await create({ password: 'riktig' }, paid);
  const id = created.id;
  check('create response hides password hash', created.qrDrop.password === true, created.qrDrop.password);
  check('hash is stored server-side', typeof (await rawDrop(id)).password === 'string');

  const m = await meta(id);
  check('metadata returns 200', m.status === 200, m);
  check('metadata has no content', m.json.qrDrop.textContent === undefined && m.json.qrDrop.hasTextContent === true, m.json.qrDrop);
  check('metadata has no password hash', m.json.qrDrop.password === true);

  check('/file without view token is 403', (await call('GET', `/qr/${id}/file`)).status === 403);
  check('/open without password is 401', (await call('POST', `/qr/${id}/open`, { body: {} })).status === 401);
  check('/open with wrong password is 401', (await call('POST', `/qr/${id}/open`, { body: { password: 'feil' } })).status === 401);
  const opened = await call('POST', `/qr/${id}/open`, { body: { password: 'riktig' } });
  check('/open with correct password returns content', opened.status === 200 && opened.json.qrDrop.textContent === 'hemmelig', opened);
  check('/open returns a view token', typeof opened.json.viewToken === 'string');
  check('/open hides password hash', opened.json.qrDrop.password === null);
  check('view is counted server-side', (await rawDrop(id)).scanCount === 1);
  check('successful password clears attempt counter', (await db.query(`select 1 from public.qr_password_attempts where qr_drop_id = $1`, [id])).rows.length === 0);
  check('old /verify endpoint is gone', (await call('POST', `/qr/${id}/verify`, { body: { password: 'riktig' } })).status === 404);
}

console.log('\nS1: password brute force');
{
  const { id } = await create({ password: 'riktig' }, paid);
  const statuses = [];
  for (let i = 0; i < 5; i++) statuses.push((await call('POST', `/qr/${id}/open`, { body: { password: 'feil' + i } })).status);
  check('first 5 wrong attempts are 401', statuses.every((s) => s === 401), statuses);
  const locked = await call('POST', `/qr/${id}/open`, { body: { password: 'riktig' } });
  check('6th attempt is 429 even with correct password', locked.status === 429, locked);

  const { id: id2 } = await create({ password: 'riktig' }, paid);
  const parallel = await Promise.all(Array.from({ length: 12 }, (_, i) => call('POST', `/qr/${id2}/open`, { body: { password: 'feil' + i } })));
  const n401 = parallel.filter((r) => r.status === 401).length;
  check('parallel guesses are capped at 5', n401 === 5, parallel.map((r) => r.status));
}

console.log('\nS1: encryption key only via /open');
{
  const { id } = await create({ encryptionKey: 'a'.repeat(64) });
  check('metadata hides encryptionKey', (await meta(id)).json.qrDrop.encryptionKey === undefined);
  const opened = await call('POST', `/qr/${id}/open`, { body: {} });
  check('/open returns the key for standard files', opened.json.qrDrop.encryptionKey === 'a'.repeat(64));
  check('/file with another drop\'s view token is 403', (await call('GET', `/qr/${id}/file`, { viewToken: (await call('POST', `/qr/${(await create({})).id}/open`, { body: {} })).json.viewToken })).status === 403);
  check('/file with forged view token is 403', (await call('GET', `/qr/${id}/file`, { viewToken: crypto.randomUUID() })).status === 403);
}

console.log('\nB2 + S1: view limits');
{
  const { id } = await create({ expiryType: 'scan' }, paid);
  check('scan-once: first open 200', (await call('POST', `/qr/${id}/open`, { body: {} })).status === 200);
  check('scan-once: second open 410', (await call('POST', `/qr/${id}/open`, { body: {} })).status === 410);
  check('scan-once: metadata now 410', (await meta(id)).status === 410);
  check('scan-once: drop kept while the viewer\'s token is valid', !!(await rawDrop(id)));

  const { id: id2 } = await create({ expiryType: 'scan' }, paid);
  const parallel = await Promise.all(Array.from({ length: 8 }, () => call('POST', `/qr/${id2}/open`, { body: {} })));
  check('scan-once: exactly one of 8 parallel opens succeeds', parallel.filter((r) => r.status === 200).length === 1, parallel.map((r) => r.status));

  const { id: id3 } = await create({ maxScans: 2 });
  const s = [];
  for (let i = 0; i < 3; i++) s.push((await call('POST', `/qr/${id3}/open`, { body: {} })).status);
  check('maxScans=2: 200, 200, 410', s.join() === '200,200,410', s);

  const { id: id4 } = await create({});
  await expireNow(id4);
  check('time-expired: metadata 410', (await meta(id4)).status === 410);
  check('time-expired: deleted', !(await rawDrop(id4)));
  const { id: id5 } = await create({});
  await expireNow(id5);
  check('time-expired: open 410', (await call('POST', `/qr/${id5}/open`, { body: {} })).status === 410);

  const { id: id6 } = await create({ maxScans: 1 });
  for (let i = 0; i < 3; i++) await meta(id6);
  check('metadata does not use up a view', (await meta(id6)).status === 200 && ((await rawDrop(id6)).scanCount || 0) === 0);
  check('old access-token links still work', (await call('GET', `/qr/${id6}?access=${crypto.randomUUID()}`)).status === 200);
  for (const [method, p] of [['POST', `/qr/${id6}/scan`], ['POST', `/qr/${id6}/access-token`], ['POST', `/qrdrop/${id6}/qr1-scanned`], ['POST', `/qrdrop/${id6}/verify-qr1-for-qr2`], ['GET', `/qrdrop/${id6}/check`], ['GET', `/qrdrop/${id6}/key`]]) {
    check(`removed endpoint ${p.split('/').pop()} is 404`, (await call(method, p)).status === 404);
  }
}

console.log('\nS1: files and downloads');
{
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(100)], { type: 'application/octet-stream' }), 'doc.pdf');
  form.append('metadata', JSON.stringify({ contentType: 'bundle', expiryType: '10m', maxDownloads: 1, viewOnly: false, encryptionKey: 'b'.repeat(64), originalFileTypes: { file: 'application/pdf' } }));
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
  const pw = await create({ password: 'x' }, paid);
  const list2 = await call('GET', '/qrdrops', paid);
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
  const created = await create({ maxScans: 1 });
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
  const r = await call('POST', '/create', { ...paid, body: { contentType: 'bundle', singleQrMode: true, textContentCiphertext: ct, clientId, expiryType: '10m', viewOnly: false } });
  check('uses client id', r.json.id === clientId);
  const opened = await call('POST', `/qr/${clientId}/open`, { body: {} });
  check('ciphertext is stored and returned', opened.json.qrDrop.textContent === ct, opened.json.qrDrop.textContent);
}

console.log('\nS3: server-side pricing');
{
  const free = await call('POST', '/create', { body: { contentType: 'text', textContent: 'x', expiryType: '10m' } });
  check('anonymous free drop (10 min) is allowed', free.status === 200 && free.json.coinsCharged === 0, free);
  const anonPw = await call('POST', '/create', { body: { contentType: 'text', textContent: 'x', expiryType: '10m', password: 'p' } });
  check('anonymous password drop is 401 LOGIN_REQUIRED', anonPw.status === 401 && anonPw.json.code === 'LOGIN_REQUIRED', anonPw);
  const anonLong = await call('POST', '/create', { body: { contentType: 'text', textContent: 'x', expiryType: '24h' } });
  check('anonymous 24h drop is 401', anonLong.status === 401, anonLong);
  const anonSecure = await call('POST', '/create', { body: { contentType: 'bundle', secureMode: true, textContentCiphertext: '{}', expiryType: '10m' } });
  check('anonymous Secure Mode is 401', anonSecure.status === 401, anonSecure);
  const badExpiry = await call('POST', '/create', { body: { contentType: 'text', textContent: 'x', expiryType: '1y' } });
  check('unknown expiry type is 400', badExpiry.status === 400, badExpiry);

  const before = Date.now();
  const longDate = await create({ expiryDate: new Date(Date.now() + 365 * 864e5).toISOString() });
  const expiresAt = (await rawDrop(longDate.id)).expiresAt;
  check('client expiryDate is ignored (free drop lives 10 min)', expiresAt >= before + 10 * 60e3 && expiresAt <= Date.now() + 10 * 60e3, expiresAt - before);
  check('junk maxScans is dropped', (await rawDrop((await create({ maxScans: 'abc' })).id)).maxScans === null);

  const clientId = crypto.randomUUID();
  const broke = await call('POST', '/create', { token: 'tok-P', body: { contentType: 'text', textContent: 'x', expiryType: '10m', password: 'p', clientId } });
  check('user without coins gets 402 INSUFFICIENT_COINS', broke.status === 402 && broke.json.code === 'INSUFFICIENT_COINS' && broke.json.coinCost === 1, broke);
  check('nothing is stored when payment fails', !(await rawDrop(clientId)));

  await setCoins(USER_P, 10);
  const bought = await call('POST', '/create', { token: 'tok-P', body: { contentType: 'text', textContent: 'x', expiryType: '7d', password: 'p' } });
  check('password + 7 days costs 8 coins', bought.status === 200 && bought.json.coinsCharged === 8 && bought.json.coins === 2, bought.json);
  check('balance is 2 after paying 8 of 10', (await coinsOf(USER_P)) === 2);
  const priced = { '30m': 1, '1h': 1, '24h': 1, 'scan': 7 };
  for (const [expiryType, cost] of Object.entries(priced)) {
    await setCoins(USER_P, 100);
    const r = await call('POST', '/create', { token: 'tok-P', body: { contentType: 'text', textContent: 'x', expiryType } });
    check(`expiry ${expiryType} costs ${cost}`, r.json?.coinsCharged === cost && (await coinsOf(USER_P)) === 100 - cost, r.json);
  }

  // Files: 1 MB free, then 1 coin per started 2 MB (encrypted size minus a small allowance)
  const upload = (bytes, token) => {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(bytes)]), 'a.bin');
    form.append('metadata', JSON.stringify({ contentType: 'bundle', expiryType: '10m' }));
    return call('POST', '/upload', { form, token });
  };
  const MB = 1024 * 1024;
  const exactlyFree = await upload(MB + 28, undefined);
  check('1 MB file (+ encryption overhead) is free for anonymous users', exactlyFree.status === 200 && exactlyFree.json.coinsCharged === 0, exactlyFree);
  await setCoins(USER_P, 100);
  const threeMb = await upload(3 * MB + 28, 'tok-P');
  check('3 MB file costs 1 coin', threeMb.json?.coinsCharged === 1 && (await coinsOf(USER_P)) === 99, threeMb.json);
  const fourMb = await upload(4 * MB, 'tok-P');
  check('4 MB file costs 2 coins', fourMb.json?.coinsCharged === 2, fourMb.json);
  check('anonymous 2 MB file is rejected', (await upload(2 * MB, undefined)).status >= 400);

  await setCoins(USER_P, 5);
  globalThis.__failStorageUpload = true;
  const failed = await upload(3 * MB, 'tok-P');
  globalThis.__failStorageUpload = false;
  check('failed upload returns 500', failed.status === 500, failed);
  check('failed upload refunds the coins', (await coinsOf(USER_P)) === 5, await coinsOf(USER_P));

  await setCoins(USER_P, 3);
  const parallel = await Promise.all(Array.from({ length: 6 }, () =>
    call('POST', '/create', { token: 'tok-P', body: { contentType: 'text', textContent: 'x', expiryType: '10m', password: 'p' } })));
  check('parallel paid creates: only as many as the balance allows', parallel.filter((r) => r.status === 200).length === 3 && parallel.filter((r) => r.status === 402).length === 3, parallel.map((r) => r.status));
  check('balance never goes negative', (await coinsOf(USER_P)) === 0, await coinsOf(USER_P));

  check('old /deduct-coins endpoint is gone', (await call('POST', '/deduct-coins', { token: 'tok-P', body: { amount: -100 } })).status === 404);
  check('debug /test-coins endpoint is gone', (await call('GET', '/test-coins', { token: 'tok-P' })).status === 404);
}

console.log('\nClient-chosen IDs');
{
  const victim = await create({ textContent: 'original' });
  const hijack = await call('POST', '/create', { body: { contentType: 'text', textContent: 'phishing', expiryType: '10m', clientId: victim.id } });
  check('create with an existing ID is 409', hijack.status === 409, hijack);
  check('existing drop is untouched', (await rawDrop(victim.id)).textContent === 'original');
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(10)]), 'a.bin');
  form.append('metadata', JSON.stringify({ contentType: 'bundle', expiryType: '10m', clientId: victim.id }));
  check('upload with an existing ID is 409', (await call('POST', '/upload', { form })).status === 409);
  check('existing drop is still untouched', (await rawDrop(victim.id)).textContent === 'original');
}

console.log('\nS5: rate limiting');
{
  const ip = '203.0.113.7';
  const statuses = [];
  for (let i = 0; i < 21; i++) {
    statuses.push((await call('POST', '/create', { ip, body: { contentType: 'text', textContent: 'x', expiryType: '10m' } })).status);
  }
  check('anonymous: 20 creates per hour per IP', statuses.slice(0, 20).every((s) => s === 200) && statuses[20] === 429, statuses);
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(10)]), 'a.bin');
  form.append('metadata', JSON.stringify({ contentType: 'bundle', expiryType: '10m' }));
  check('the limit also covers /upload', (await call('POST', '/upload', { ip, form })).status === 429);
  check('another IP is not affected', (await call('POST', '/create', { ip: '203.0.113.8', body: { contentType: 'text', textContent: 'x', expiryType: '10m' } })).status === 200);
  const { rows } = await db.query(`select key from public.rate_limits`);
  check('rate limit keys hold no raw IPs', rows.length > 0 && !rows.some((r) => r.key.includes(ip)), rows.slice(0, 2));
  // Logged-in users have their own, larger bucket regardless of IP
  check('logged-in user is not limited by the IP bucket', (await call('POST', '/create', { ip, token: 'tok-A', body: { contentType: 'text', textContent: 'x', expiryType: '10m' } })).status === 200);
}

console.log('\nB5: Stripe webhook');
{
  const deliver = (event, signature = 'whsec_test') => call('POST', '/webhook', { headers: { 'stripe-signature': signature, 'Content-Type': 'application/json' }, form: JSON.stringify(event) });
  const session = (id, extra = {}) => ({ id: 'evt_' + id, type: 'checkout.session.completed', data: { object: { id, payment_status: 'paid', metadata: { userId: USER_W, coins: '50' }, ...extra } } });

  check('missing signature is 400', (await call('POST', '/webhook', { form: '{}' })).status === 400);
  check('wrong signature is 400', (await deliver(session('cs_forged'), 'forged')).status === 400);
  check('forged event adds no coins', (await coinsOf(USER_W)) === 0);

  check('paid checkout is 200', (await deliver(session('cs_1'))).status === 200);
  check('paid checkout adds 50 coins', (await coinsOf(USER_W)) === 50);
  await deliver(session('cs_1'));
  check('redelivery does not add coins again', (await coinsOf(USER_W)) === 50);
  await Promise.all(Array.from({ length: 5 }, () => deliver(session('cs_2'))));
  check('parallel deliveries add coins exactly once', (await coinsOf(USER_W)) === 100, await coinsOf(USER_W));

  await deliver(session('cs_unpaid', { payment_status: 'unpaid' }));
  check('unpaid session adds no coins', (await coinsOf(USER_W)) === 100);
  await deliver({ ...session('cs_unpaid', { payment_status: 'paid' }), type: 'checkout.session.async_payment_succeeded' });
  check('async payment success adds coins', (await coinsOf(USER_W)) === 150);
  check('invalid metadata is 400', (await deliver(session('cs_bad', { metadata: { userId: 'nope', coins: '50' } }))).status === 400);
  const resp = await deliver(session('cs_3'));
  check('webhook response leaks no user data', !JSON.stringify(resp.json).includes(USER_W), resp.json);
}

console.log('\nB4: owner list pagination');
{
  const { json: first } = await call('GET', '/qrdrops?limit=2', { token: 'tok-P' });
  check('limit=2 returns 2 drops', first.qrDrops.length === 2, first.qrDrops.length);
  check('total counts all own drops', first.total > 2 && first.nextOffset === 2, first);
  const { json: second } = await call('GET', '/qrdrops?limit=2&offset=2', { token: 'tok-P' });
  check('next page has different drops', second.qrDrops.every((q) => !first.qrDrops.some((f) => f.id === q.id)));
  check('pages are newest first', first.qrDrops[0].createdAt >= first.qrDrops[1].createdAt && first.qrDrops[1].createdAt >= second.qrDrops[0].createdAt);
  const { json: all } = await call('GET', '/qrdrops', { token: 'tok-P' });
  check('only own drops are listed', all.qrDrops.every((q) => q.userId === USER_P) && all.qrDrops.length === Math.min(all.total, 100));
}

console.log('\nTables: tokens, files and cleanup');
{
  const { id } = await create({});
  const opened = await call('POST', `/qr/${id}/open`, { body: {} });
  const stored = (await db.query(`select token_hash from public.qr_tokens where qr_drop_id = $1 and kind = 'view'`, [id])).rows;
  check('view token is stored only as a hash', stored.length === 1 && stored[0].token_hash !== opened.json.viewToken && stored[0].token_hash.length === 64);

  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(10)]), 'a.bin');
  form.append('metadata', JSON.stringify({ contentType: 'bundle', expiryType: '10m' }));
  const up = await call('POST', '/upload', { form, token: 'tok-A' });
  const paths = [...globalThis.__files.keys()].filter((k) => k.includes(up.json.id));
  check('upload stores the file', paths.length === 1, paths);
  check('legacy single-file fields are derived from files', up.json.qrDrop.fileName === 'a.bin' && up.json.qrDrop.filePath === paths[0] && up.json.qrDrop.fileCount === 1, up.json.qrDrop);
  await call('DELETE', `/qr/${up.json.id}`, { token: 'tok-A' });
  check('deleting a drop removes its files', !globalThis.__files.has(paths[0]));

  // A used-up drop survives cleanup while the last viewer's token is valid
  const once = await create({ maxScans: 1 });
  await call('POST', `/qr/${once.id}/open`, { body: {} });
  await db.query(`select public.cleanup_expired_qr_drops()`);
  check('cleanup keeps a used-up drop during the view window', !!(await rawDrop(once.id)));
  await db.query(`update public.qr_drops set last_opened_at = now() - interval '16 minutes' where id = $1`, [once.id]);
  await db.query(`select public.cleanup_expired_qr_drops()`);
  check('cleanup deletes it afterwards', !(await rawDrop(once.id)));
}

console.log('\nCORS');
{
  const preflight = (origin) => globalThis.__handler(new Request('http://local/make-server-c3c9181e/qr/x/open', {
    method: 'OPTIONS',
    headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'x-view-token' },
  }));
  const ok = await preflight('https://www.onetimeqr.com');
  check('preflight from the site is allowed', ok.headers.get('access-control-allow-origin') === 'https://www.onetimeqr.com' && /x-view-token/i.test(ok.headers.get('access-control-allow-headers') ?? ''));
  const evil = await preflight('https://evil.example');
  check('preflight from another origin is not allowed', evil.headers.get('access-control-allow-origin') !== 'https://evil.example');
}

console.log('\nSQL: privileges and RLS');
async function asRole(role, sub, sql, params = []) {
  await db.exec(`set role ${role}`);
  if (sub) await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [sub]);
  try { return { ok: true, res: await db.query(sql, params) }; }
  catch (e) { return { ok: false, err: e.message }; }
  finally { await db.exec(`reset role`); await db.query(`select set_config('request.jwt.claim.sub', '', false)`); }
}
const denied = (r) => !r.ok && /permission denied/.test(r.err);
{
  check('KV store and its functions are gone', (await db.query(`select to_regclass('public.kv_store_c3c9181e') as t, to_regproc('public.qrdrop_consume') as f`)).rows[0].t === null
    && (await db.query(`select to_regproc('public.qrdrop_consume') as f, to_regproc('public.copy_kv_qr_drops') as c`)).rows.every((r) => r.f === null && r.c === null));
  check('only view tokens can be stored', !(await db.query(`insert into public.qr_tokens values ('x', 'access', gen_random_uuid(), now())`).then(() => true, () => false)));
  check('authenticated cannot call deduct_coins', !(await asRole('authenticated', USER_A, `select public.deduct_coins($1, 1)`, [USER_A])).ok);
  check('authenticated cannot call refund_coins', !(await asRole('authenticated', USER_A, `select public.refund_coins($1, 1000)`, [USER_A])).ok);
  check('authenticated cannot call credit_checkout_session', !(await asRole('authenticated', USER_A, `select public.credit_checkout_session('x', $1, 1000, 'e')`, [USER_A])).ok);
  check('anon cannot call rate_limit_hit', !(await asRole('anon', null, `select public.rate_limit_hit('x', 0, 1)`)).ok);
  for (const table of ['qr_drops', 'qr_tokens', 'qr_password_attempts', 'rate_limits', 'storage_deletion_queue']) {
    check(`anon cannot read ${table}`, denied(await asRole('anon', null, `select * from public.${table}`)));
    check(`authenticated cannot read ${table}`, denied(await asRole('authenticated', USER_A, `select * from public.${table}`)));
  }
  check('authenticated cannot insert a QR drop', denied(await asRole('authenticated', USER_A, `insert into public.qr_drops (id, content_type, expiry_type, expires_at) values (gen_random_uuid(), 'text', '10m', now())`)));
  for (const fn of [`qr_drop_consume(gen_random_uuid(), 'scan', 0)`, `qr_drop_password_attempt(gen_random_uuid(), 0, 1)`, `cleanup_expired_qr_drops()`]) {
    check(`authenticated cannot call ${fn.split('(')[0]}`, denied(await asRole('authenticated', USER_A, `select public.${fn}`)));
  }

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

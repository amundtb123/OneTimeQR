import { Hono } from 'npm:hono@4.13.14';
import { cors } from 'npm:hono@4.13.14/cors';
import { logger } from 'npm:hono@4.13.14/logger';
import { createClient } from 'npm:@supabase/supabase-js@2';

const app = new Hono();

// Middleware
// SECURITY: Restrict CORS to allowed origins only
app.use('*', cors({
  origin: [
    'https://onetimeqr.com',
    'https://www.onetimeqr.com',
    'http://localhost:5173', // Development
    'http://localhost:3000', // Development
  ],
  credentials: true,
  allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-View-Token', 'X-Owner-Token'],
}));
app.use('*', logger(console.log));

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL');
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase configuration!');
  console.error('SUPABASE_URL:', supabaseUrl ? '✅ Set' : '❌ Missing');
  console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✅ Set' : '❌ Missing');
}

const supabase = createClient(
  supabaseUrl ?? '',
  supabaseServiceKey ?? ''
);

// Initialize storage bucket
const BUCKET_NAME = 'make-c3c9181e-qrdrop-files';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------- QR drops (table public.qr_drops) ----------
// The rest of the function works with the camelCase shape the API has always returned.

const toMs = (value: any): number | null => (value == null ? null : new Date(value).getTime());
const toIso = (ms: number | null | undefined): string | null => (ms == null ? null : new Date(ms).toISOString());

function dropFromRow(row: any) {
  const files = Array.isArray(row.files) ? row.files : [];
  const isFileDrop = files.length > 0;
  const isText = row.content_type === 'text';
  const content = isText ? row.text_content : row.url_content;
  return {
    id: row.id,
    userId: row.user_id,
    contentType: row.content_type,
    title: row.title,
    // Backwards compatibility fields (first file, or a description of the text/URL)
    fileName: isFileDrop ? files[0].name : (isText ? 'Tekstmelding' : 'URL-lenke'),
    fileType: isFileDrop ? files[0].type : (isText ? 'text/plain' : 'text/url'),
    fileSize: isFileDrop ? files.reduce((sum: number, f: any) => sum + (f.size || 0), 0) : (content?.length || 0),
    filePath: isFileDrop ? files[0].path : null,
    files: isFileDrop ? files : undefined,
    fileCount: isFileDrop ? files.length : undefined,
    textContent: row.text_content,
    urlContent: row.url_content,
    expiryType: row.expiry_type,
    expiresAt: toMs(row.expires_at),
    activatesAt: toMs(row.activates_at),
    maxScans: row.max_scans,
    maxDownloads: row.max_downloads,
    scanCount: row.scan_count,
    downloadCount: row.download_count,
    viewOnly: row.view_only,
    noPreview: row.no_preview,
    password: row.password_hash, // Hash; stripped by withoutSecrets() before leaving the server
    qrStyle: row.qr_style,
    encrypted: row.encrypted,
    secureMode: row.secure_mode,
    singleQrMode: row.single_qr_mode,
    encryptionKey: row.encryption_key,
    ownerTokenHash: row.owner_token_hash,
    createdAt: toMs(row.created_at),
    lastOpenedAt: toMs(row.last_opened_at),
  };
}

function dropToRow(drop: any) {
  return {
    id: drop.id,
    user_id: drop.userId,
    owner_token_hash: drop.ownerTokenHash,
    content_type: drop.contentType,
    title: drop.title,
    text_content: drop.textContent,
    url_content: drop.urlContent,
    files: (drop.files ?? []).map((f: any) => ({ name: f.name, type: f.type, size: f.size, path: f.path })),
    expiry_type: drop.expiryType,
    expires_at: toIso(drop.expiresAt),
    activates_at: toIso(drop.activatesAt),
    max_scans: drop.maxScans,
    max_downloads: drop.maxDownloads,
    view_only: drop.viewOnly,
    no_preview: drop.noPreview,
    password_hash: drop.password,
    qr_style: drop.qrStyle,
    encrypted: drop.encrypted,
    secure_mode: drop.secureMode,
    single_qr_mode: drop.singleQrMode,
    encryption_key: drop.encryptionKey,
    created_at: toIso(drop.createdAt),
  };
}

async function getQrDrop(id: string): Promise<any | null> {
  if (!UUID_REGEX.test(id)) return null;
  const { data, error } = await supabase.from('qr_drops').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? dropFromRow(data) : null;
}

// Insert without overwriting; returns false if the ID is already taken
async function insertQrDrop(drop: any): Promise<boolean> {
  const { error } = await supabase.from('qr_drops').insert(dropToRow(drop));
  if (error?.code === '23505') return false;
  if (error) throw new Error(error.message);
  return true;
}

async function updateQrDrop(id: string, fields: Record<string, unknown>): Promise<void> {
  const { error } = await supabase.from('qr_drops').update(fields).eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------- View tokens (table public.qr_tokens, stored as SHA-256) ----------

async function issueViewToken(qrDropId: string): Promise<string> {
  const token = crypto.randomUUID();
  const { error } = await supabase.from('qr_tokens').insert({
    token_hash: await sha256Hex(token),
    kind: 'view',
    qr_drop_id: qrDropId,
    expires_at: toIso(Date.now() + VIEW_TOKEN_TTL_MS),
  });
  if (error) throw new Error(error.message);
  return token;
}

// Returns the drop ID a view token was issued for, or null if it is unknown or expired
async function viewTokenDropId(token: string | undefined): Promise<string | null> {
  if (!token || !UUID_REGEX.test(token)) return null;
  const { data, error } = await supabase
    .from('qr_tokens')
    .select('qr_drop_id, expires_at')
    .eq('token_hash', await sha256Hex(token))
    .eq('kind', 'view');
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row || toMs(row.expires_at)! < Date.now()) return null;
  return row.qr_drop_id;
}

// SECURITY: Content, keys and file URLs are only handed out by /open, which issues a
// short-lived view token. Follow-up calls (/file, /download) must present it.
const VIEW_TOKEN_TTL_MS = 15 * 60 * 1000;
const PASSWORD_MAX_ATTEMPTS = 5;
const PASSWORD_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

// Resolve the logged-in user from the Authorization header (null for anon key or invalid token)
async function getRequestUserId(c: any): Promise<string | null> {
  const accessToken = c.req.header('Authorization')?.split(' ')[1];
  if (!accessToken || accessToken === Deno.env.get('SUPABASE_ANON_KEY')) {
    return null;
  }
  try {
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    return error ? null : (user?.id ?? null);
  } catch {
    return null;
  }
}

// Why a QR drop can no longer be opened, or null if it can.
// Must stay in sync with qrdrop_consume() in supabase/migrations.
function getExpiryReason(qrDrop: any, now = Date.now()): string | null {
  const scanCount = qrDrop.scanCount || 0;
  if (qrDrop.expiresAt && qrDrop.expiresAt < now) return 'Time expired';
  if (qrDrop.expiryType === 'scan' && scanCount >= 1) return 'Already scanned';
  if (qrDrop.maxScans && scanCount >= qrDrop.maxScans) return 'Max scans reached';
  if (qrDrop.maxDownloads && (qrDrop.downloadCount || 0) >= qrDrop.maxDownloads) return 'Max downloads reached';
  return null;
}

// Scheduled drops can only be opened by their owner until activatesAt
function isNotYetActive(qrDrop: any, now = Date.now()): boolean {
  return !!qrDrop.activatesAt && qrDrop.activatesAt > now;
}

// A used-up drop is kept until the last viewer's token has expired, so an ongoing view can finish
function isDeletable(qrDrop: any, now = Date.now()): boolean {
  if (qrDrop.expiresAt && qrDrop.expiresAt < now) return true;
  if (!getExpiryReason(qrDrop, now)) return false;
  return !qrDrop.lastOpenedAt || qrDrop.lastOpenedAt + VIEW_TOKEN_TTL_MS < now;
}

// The password hash never leaves the server; clients only need to know whether one is set
function withoutSecrets(qrDrop: any) {
  const { password, ownerTokenHash, ...rest } = qrDrop;
  return { ...rest, password: password ? true : null };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Owner = the logged-in creator, or whoever holds the secret owner token returned at creation
// (lets anonymous creators preview without using up a view)
async function isRequestOwner(c: any, qrDrop: any): Promise<boolean> {
  const ownerToken = c.req.header('X-Owner-Token');
  if (ownerToken && qrDrop.ownerTokenHash && (await sha256Hex(ownerToken)) === qrDrop.ownerTokenHash) {
    return true;
  }
  return !!qrDrop.userId && (await getRequestUserId(c)) === qrDrop.userId;
}

// What anyone holding the link may see before opening: no content, no keys
function publicMetadata(qrDrop: any) {
  const { textContent, urlContent, encryptionKey, ...rest } = withoutSecrets(qrDrop);
  return { ...rest, hasTextContent: !!textContent, hasUrlContent: !!urlContent };
}

// Viewers need a view token from /open; owners always have access to their own drops
async function hasViewAccess(c: any, qrDrop: any): Promise<boolean> {
  if ((await viewTokenDropId(c.req.header('X-View-Token'))) === qrDrop.id) {
    return true;
  }
  return isRequestOwner(c, qrDrop);
}

// Atomically count a scan or download, enforcing limits in the database.
// Returns the updated QR drop, or null if the limit was already reached.
async function consumeQrDrop(id: string, kind: 'scan' | 'download'): Promise<any | null> {
  const { data, error } = await supabase.rpc('qr_drop_consume', { p_id: id, p_kind: kind, p_now: Date.now() });
  if (error) throw new Error(`qr_drop_consume failed: ${error.message}`);
  return data ? dropFromRow(data) : null;
}

// Atomically register a password attempt; returns the number of attempts in the current window
async function registerPasswordAttempt(id: string): Promise<number> {
  const { data, error } = await supabase.rpc('qr_drop_password_attempt', {
    p_id: id,
    p_now: Date.now(),
    p_window_ms: PASSWORD_ATTEMPT_WINDOW_MS,
  });
  if (error) throw new Error(`qr_drop_password_attempt failed: ${error.message}`);
  return data;
}

// SECURITY (S3): Prices are decided here, never by the client.
// Must stay in sync with calculateCoinCost() in src/utils/create-drop.ts.
// A key is free, or a Pluss key: 1 from the balance (= 5 kr), whatever it adds beyond the free one.
const EXPIRY_DURATIONS_MS: Record<string, number> = {
  '10m': 10 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  'scan': 7 * 24 * 60 * 60 * 1000, // Scan-once drops live at most 7 days
};
const FREE_EXPIRY_MS = EXPIRY_DURATIONS_MS['10m'];
// Scheduled release: at most 3 months ahead
const MAX_ACTIVATION_DELAY_MS = 92 * 24 * 60 * 60 * 1000;
const FREE_FILE_BYTES = 1 * 1024 * 1024;
// Every open of a large file is downloaded again, so it can be opened at most this many times
const LARGE_FILE_BYTES = 5 * 1024 * 1024;
const MAX_OPENS_LARGE_FILE = 100;
// Files arrive encrypted (IV + auth tag), slightly larger than the originals the client prices
const ENCRYPTION_OVERHEAD_ALLOWANCE = 1024;

const contentBytes = (fileSizes: number[]) =>
  fileSizes.reduce((sum, size) => sum + Math.max(0, size - ENCRYPTION_OVERHEAD_ALLOWANCE), 0);

function calculateCoinCost(options: { hasPassword: boolean; fileSizes: number[]; expiryType: string; scheduled: boolean; twoKeys: boolean }): number {
  const pluss = options.hasPassword
    || options.scheduled
    || options.twoKeys
    || contentBytes(options.fileSizes) > FREE_FILE_BYTES
    || EXPIRY_DURATIONS_MS[options.expiryType] > FREE_EXPIRY_MS;
  return pluss ? 1 : 0;
}

function toPositiveInt(value: unknown): number | null {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// A requested activation time in ms: null for "open right away", undefined if it is not
// a valid time in the future (at most MAX_ACTIVATION_DELAY_MS ahead)
function parseActivatesAt(value: unknown, now = Date.now()): number | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  const ms = typeof value === 'number' ? value : Date.parse(String(value));
  if (!Number.isFinite(ms) || ms <= now || ms > now + MAX_ACTIVATION_DELAY_MS) return undefined;
  return ms;
}

function invalidActivationResponse(c: any) {
  return c.json({ error: 'Activation date must be in the future and at most 3 months ahead', code: 'INVALID_ACTIVATION_DATE' }, 400);
}

// Rejects options the creator isn't allowed to pick, or returns the price (0 = free)
// and when the drop opens (null = right away)
function priceQrDrop(c: any, userId: string | null, metadata: any, fileSizes: number[]): { cost: number; activatesAt: number | null } | Response {
  if (!(metadata.expiryType in EXPIRY_DURATIONS_MS)) {
    return c.json({ error: 'Invalid expiry type' }, 400);
  }
  const activatesAt = parseActivatesAt(metadata.activatesAt);
  if (activatesAt === undefined) return invalidActivationResponse(c);
  if (contentBytes(fileSizes) > LARGE_FILE_BYTES) {
    const maxScans = toPositiveInt(metadata.maxScans);
    if (!maxScans || maxScans > MAX_OPENS_LARGE_FILE) {
      return c.json({ error: `Large files can be opened at most ${MAX_OPENS_LARGE_FILE} times`, code: 'TOO_MANY_OPENS', maxOpens: MAX_OPENS_LARGE_FILE }, 400);
    }
  }
  // Only Pluss keys need an account
  const cost = calculateCoinCost({ hasPassword: !!metadata.password, fileSizes, expiryType: metadata.expiryType, scheduled: activatesAt !== null, twoKeys: metadata.secureMode === true });
  if (cost > 0 && !userId) {
    return c.json({ error: 'Log in to use paid features', code: 'LOGIN_REQUIRED', coinCost: cost }, 401);
  }
  return { cost, activatesAt };
}

// Atomically takes coins from the user. Returns the new balance, or null if they can't afford it.
async function deductCoins(userId: string, amount: number): Promise<number | null> {
  const { data, error } = await supabase.rpc('deduct_coins', { p_user_id: userId, p_amount: amount });
  if (error) throw new Error(`deduct_coins failed: ${error.message}`);
  return data;
}

async function refundCoins(userId: string, amount: number): Promise<void> {
  const { error } = await supabase.rpc('refund_coins', { p_user_id: userId, p_amount: amount });
  if (error) console.error('❌ Failed to refund coins after a failed create:', error.message);
}

// SECURITY (S5): Limits how many QR drops one user (or one IP for anonymous users) can create
const CREATE_RATE_WINDOW_MS = 60 * 60 * 1000;
const CREATE_RATE_LIMIT_ANON = 20;
const CREATE_RATE_LIMIT_USER = 100;

function getClientIp(c: any): string {
  return c.req.header('x-forwarded-for')?.split(',')[0].trim() || c.req.header('x-real-ip') || 'unknown';
}

// Counts this request; returns true if the creator is over the limit
async function isCreateRateLimited(c: any, userId: string | null): Promise<boolean> {
  // IPs are hashed so the rate limit table holds no personal data
  const subject = userId ? `user:${userId}` : `ip:${await sha256Hex(getClientIp(c))}`;
  const { data, error } = await supabase.rpc('rate_limit_hit', {
    p_key: `create:${subject}`,
    p_now: Date.now(),
    p_window_ms: CREATE_RATE_WINDOW_MS,
  });
  if (error) throw new Error(`rate_limit_hit failed: ${error.message}`);
  return data > (userId ? CREATE_RATE_LIMIT_USER : CREATE_RATE_LIMIT_ANON);
}

function rateLimitedResponse(c: any) {
  c.header('Retry-After', String(CREATE_RATE_WINDOW_MS / 1000));
  return c.json({ error: 'Too many QR codes created. Please try again later.', code: 'RATE_LIMITED' }, 429);
}

function insufficientCoinsResponse(c: any, cost: number) {
  return c.json({ error: 'Insufficient coins', code: 'INSUFFICIENT_COINS', coinCost: cost }, 402);
}

// Signed download URLs for all files in a QR drop (supports legacy single-file drops)
async function createSignedFileUrls(qrDrop: any) {
  const files = Array.isArray(qrDrop.files) && qrDrop.files.length > 0
    ? qrDrop.files
    : (qrDrop.filePath ? [{ name: qrDrop.fileName, type: qrDrop.fileType, size: qrDrop.fileSize, path: qrDrop.filePath }] : []);

  const signed = await Promise.all(files.map(async (file: any, index: number) => {
    const { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(file.path, 120); // 2 minutes expiry for security

    if (error || !data) {
      console.error(`Error getting signed URL for file ${index}:`, error);
      return null;
    }

    return {
      fileUrl: data.signedUrl,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      fileIndex: index,
    };
  }));

  return signed.filter((f) => f !== null);
}

// Password hashing using Web Crypto API (works in Deno)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  // Add salt by hashing with timestamp (simple approach for Deno compatibility)
  const salted = hashHex + Date.now().toString();
  const saltedBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(salted));
  const saltedArray = Array.from(new Uint8Array(saltedBuffer));
  return saltedArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  // For now, use simple comparison (since we're using SHA-256 with timestamp salt)
  // In production, you'd want to store the salt separately
  // This is a simplified version - for better security, use a proper bcrypt library
  // that works in Deno, or store salt separately
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    // Simple comparison - in production, extract salt from hashedPassword
    // For now, we'll use a simpler approach: store password hash directly
    // This means we need to change how we hash passwords
    return hashHex === hashedPassword;
  } catch (error) {
    console.error('Error verifying password:', error);
    return false;
  }
}

// Better password hashing using PBKDF2 (more secure, works in Deno)
async function hashPasswordSecure(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const passwordData = encoder.encode(password);
  
  // Generate a random salt
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  // Import password as a key
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordData,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  
  // Derive key using PBKDF2
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt']
  );
  
  // Export key to get hash
  const keyBuffer = await crypto.subtle.exportKey('raw', key);
  const hashArray = Array.from(new Uint8Array(keyBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  
  // Return salt:hash format
  return `${saltHex}:${hashHex}`;
}

async function verifyPasswordSecure(password: string, hashedPassword: string): Promise<boolean> {
  try {
    const [saltHex, hashHex] = hashedPassword.split(':');
    if (!saltHex || !hashHex) {
      return false;
    }
    
    const encoder = new TextEncoder();
    const passwordData = encoder.encode(password);
    const salt = new Uint8Array(saltHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    
    // Import password as a key
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordData,
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );
    
    // Derive key using PBKDF2 with same parameters
    const key = await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt']
    );
    
    // Export key to get hash
    const keyBuffer = await crypto.subtle.exportKey('raw', key);
    const hashArray = Array.from(new Uint8Array(keyBuffer));
    const computedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return computedHash === hashHex;
  } catch (error) {
    console.error('Error verifying password:', error);
    return false;
  }
}

async function initStorage() {
  try {
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some(bucket => bucket.name === BUCKET_NAME);
    
    if (!bucketExists) {
      console.log('Creating storage bucket:', BUCKET_NAME);
      await supabase.storage.createBucket(BUCKET_NAME, { public: false });
    }
  } catch (error) {
    console.error('Error initializing storage:', error);
  }
}

// Removes files of deleted drops from Storage (the database queues them on delete)
async function drainStorageDeletionQueue(): Promise<number> {
  let removed = 0;
  for (;;) {
    const { data, error } = await supabase.from('storage_deletion_queue').select('path').limit(100);
    if (error) throw new Error(error.message);
    const paths = (data ?? []).map((row: any) => row.path);
    if (paths.length === 0) return removed;

    const { error: removeError } = await supabase.storage.from(BUCKET_NAME).remove(paths);
    if (removeError && removeError.message !== 'Object not found') {
      console.error('Error deleting files:', removeError.message);
      return removed; // Keep them queued and retry on the next cleanup
    }
    const { error: dequeueError } = await supabase.from('storage_deletion_queue').delete().in('path', paths);
    if (dequeueError) throw new Error(dequeueError.message);
    removed += paths.length;
  }
}

// Cleanup expired QR drops and tokens. pg_cron also runs the SQL part every 10 minutes,
// so content is deleted even when this function gets no traffic.
async function cleanupExpired() {
  try {
    const { data: deletedCount, error } = await supabase.rpc('cleanup_expired_qr_drops', { p_view_ttl_ms: VIEW_TOKEN_TTL_MS });
    if (error) throw new Error(error.message);
    const removedFiles = await drainStorageDeletionQueue();

    // SECURITY: Minimal logging - only counts, no details
    if (deletedCount > 0 || removedFiles > 0) {
      console.log(`Cleanup: ${deletedCount} QR drops, ${removedFiles} files`);
    }
    return deletedCount;
  } catch (error) {
    console.error('Error during cleanup:', error);
    return 0;
  }
}

// Initialize on startup
initStorage();
// Run cleanup on startup
cleanupExpired();
// Run cleanup every 10 minutes
setInterval(cleanupExpired, 10 * 60 * 1000);

// Health check
app.get('/make-server-c3c9181e/health', (c) => {
  return c.json({ status: 'ok', service: 'qrdrop' });
});

// Deletes a QR drop; its files are queued by the database and removed right away
async function deleteQrDrop(id: string) {
  const { error } = await supabase.from('qr_drops').delete().eq('id', id);
  if (error) throw new Error(error.message);
  try {
    await drainStorageDeletionQueue();
  } catch (error) {
    console.error('Error deleting files:', error);
  }
}

// Largest upload a request may carry: 20 MB of files plus room for encryption, form fields and boundaries
const MAX_UPLOAD_REQUEST_BYTES = 21 * 1024 * 1024;

// Reads the request body, but stops as soon as it grows beyond maxBytes (null = too large),
// so an oversized upload never ends up in memory
async function readBodyCapped(req: Request, maxBytes: number): Promise<Uint8Array | null> {
  if (Number(req.headers.get('Content-Length')) > maxBytes) return null;
  const reader = req.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.length;
  }
  return body;
}

// Upload files and create QR drop (supports multiple files)
app.post('/make-server-c3c9181e/upload', async (c) => {
  try {
    // SECURITY: Refuse oversized uploads before reading them
    const body = await readBodyCapped(c.req.raw, MAX_UPLOAD_REQUEST_BYTES);
    if (!body) {
      return c.json({ error: 'Upload is too large. Maximum size is 20 MB.', code: 'UPLOAD_TOO_LARGE' }, 413);
    }
    const formData = await new Response(body, { headers: { 'Content-Type': c.req.header('Content-Type') ?? '' } }).formData();
    const metadata = JSON.parse(formData.get('metadata') as string);

    // SECURITY: Don't log full metadata - may contain sensitive data

    // Get all files from formData (can be multiple)
    const files: File[] = [];
    let fileIndex = 0;
    while (true) {
      const file = formData.get(`file${fileIndex === 0 ? '' : fileIndex}`) as File;
      if (!file) break;
      files.push(file);
      fileIndex++;
    }

    // Also check for 'file' (backwards compatibility)
    if (files.length === 0) {
      const singleFile = formData.get('file') as File;
      if (singleFile) {
        files.push(singleFile);
      }
    }

    if (files.length === 0) {
      return c.json({ error: 'No files provided' }, 400);
    }

    // User is optional - anonymous uploads are allowed for free drops
    const userId = await getRequestUserId(c);
    if (await isCreateRateLimited(c, userId)) {
      return rateLimitedResponse(c);
    }

    // SECURITY: Validate metadata size
    const MAX_METADATA_SIZE = 10 * 1024; // 10 KB
    const metadataString = JSON.stringify(metadata);
    if (metadataString.length > MAX_METADATA_SIZE) {
      return c.json({ error: 'Metadata too large. Maximum size is 10 KB.' }, 400);
    }

    // SECURITY: Validate file sizes on server side
    // The limits the app shows: 20 MB in all when logged in, 1 MB without an account
    const MAX_FILE_SIZE = userId ? 20 * 1024 * 1024 : FREE_FILE_BYTES;
    const MAX_TOTAL_SIZE = MAX_FILE_SIZE;
    
    // Limits apply to the original size; files arrive slightly larger because they are encrypted
    let totalSize = 0;
    for (const file of files) {
      if (file.size - ENCRYPTION_OVERHEAD_ALLOWANCE > MAX_FILE_SIZE) {
        return c.json({ 
          error: `File "${file.name}" exceeds maximum size of ${MAX_FILE_SIZE / (1024 * 1024)} MB` 
        }, 400);
      }
      totalSize += file.size;
    }
    
    if (totalSize - files.length * ENCRYPTION_OVERHEAD_ALLOWANCE > MAX_TOTAL_SIZE) {
      return c.json({ 
        error: `Total file size exceeds maximum of ${MAX_TOTAL_SIZE / (1024 * 1024)} MB` 
      }, 400);
    }

    // SECURITY: Validate file types
    const ALLOWED_FILE_TYPES = [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      'application/pdf',
      'text/plain', 'text/csv',
      'application/zip', 'application/x-zip-compressed',
      'video/mp4', 'video/webm',
      'audio/mpeg', 'audio/wav', 'audio/ogg',
      'application/json',
    ];
    
    const BLOCKED_EXTENSIONS = ['.exe', '.bat', '.sh', '.js', '.html', '.htm', '.php', '.asp', '.jsp'];
    
    for (const file of files) {
      // Check extension
      const fileName = file.name.toLowerCase();
      const ext = fileName.substring(fileName.lastIndexOf('.'));
      if (BLOCKED_EXTENSIONS.includes(ext)) {
        return c.json({ error: `File type ${ext} is not allowed for security reasons` }, 400);
      }
      
      // Check MIME type if available (but be lenient since MIME types can be spoofed)
      if (file.type && file.type !== 'application/octet-stream') {
        // Only block if it's explicitly a dangerous type
        const dangerousTypes = ['text/html', 'application/x-javascript', 'application/javascript'];
        if (dangerousTypes.includes(file.type)) {
          return c.json({ error: `File type ${file.type} is not allowed for security reasons` }, 400);
        }
      }
    }

    // Generate unique ID (use client-provided ID if available for Secure Mode)
    // This ensures encryption/decryption use the same ID
    // SECURITY: Don't log clientId or IDs
    
    const id = metadata.clientId && UUID_REGEX.test(metadata.clientId)
      ? metadata.clientId
      : crypto.randomUUID();
    const timestamp = Date.now();
    const ownerToken = crypto.randomUUID();

    if (metadata.secureMode && !metadata.clientId && id !== metadata.clientId) {
      console.warn('⚠️ [SERVER] Secure Mode file upload WITHOUT clientId! This will cause decryption to fail!');
    }

    // SECURITY: A client-chosen ID must never replace someone else's drop
    if (await getQrDrop(id)) {
      return c.json({ error: 'QR drop ID already in use' }, 409);
    }

    const price = priceQrDrop(c, userId, metadata, files.map((file) => file.size));
    if (price instanceof Response) return price;
    const { cost, activatesAt } = price;

    let coinBalance: number | null = null;
    if (cost > 0) {
      coinBalance = await deductCoins(userId!, cost);
      if (coinBalance === null) return insufficientCoinsResponse(c, cost);
    }

    // SECURITY: Sanitize filename to prevent path traversal attacks
    const sanitizeFileName = (fileName: string): string => {
      // Remove path traversal attempts
      let sanitized = fileName.replace(/\.\./g, '').replace(/\//g, '_').replace(/\\/g, '_');
      // Remove or replace dangerous characters
      sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, '_');
      // Limit length to prevent issues
      return sanitized.substring(0, 255);
    };

    // Upload all files to Supabase Storage. Any failure undoes the whole drop and refunds the coins.
    const uploadedFiles: Array<{name: string; type: string; size: number; path: string}> = [];
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const sanitizedFileName = sanitizeFileName(file.name);
        const filePath = `${id}/${timestamp}-${i}-${sanitizedFileName}`;

        // Get original file type from metadata if available (files are encrypted, so file.type is application/octet-stream)
        const fileKey = i === 0 ? 'file' : `file${i}`;
        const originalFileType = metadata.originalFileTypes?.[fileKey] || file.type;

        const fileBuffer = await file.arrayBuffer();
        const { error: uploadError } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(filePath, fileBuffer, {
            contentType: 'application/octet-stream', // Always store as octet-stream since files are encrypted
            upsert: false,
          });

        if (uploadError) {
          throw new Error(`Upload failed for file ${i}: ${uploadError.message}`);
        }

        // Store original file type in metadata (before encryption) for proper decryption and display
        uploadedFiles.push({
          name: file.name,
          type: originalFileType, // Original type (before encryption) - important for decryption
          size: file.size, // Encrypted size (may differ from original, but we store what we have)
          path: filePath
        });
      }

      // Store metadata in KV
      // For backwards compatibility, also store first file info in old fields
      const firstFile = uploadedFiles[0];

      // CRITICAL FIX: Handle Secure Mode ciphertext fields (same as create endpoint)
      const isSecureMode = metadata.secureMode || false;
      const isSingleQrMode = metadata.singleQrMode || false;
      const isEncryptedMode = isSecureMode || isSingleQrMode;
      const textContentToStore = isEncryptedMode
        ? (metadata.textContentCiphertext || null)
        : (metadata.textContent || null);
      const urlContentToStore = isEncryptedMode
        ? (metadata.urlContentCiphertext || null)
        : (metadata.urlContent || null);

      // SECURITY: Don't log content details

      const qrDropData = {
        id,
        userId,
        contentType: metadata.contentType || (uploadedFiles.length > 1 ? 'bundle' : 'file') as const,
        title: metadata.title || null,
        // Backwards compatibility fields (first file)
        fileName: firstFile.name,
        fileType: firstFile.type,
        fileSize: totalSize,
        filePath: firstFile.path,
        // New fields for multiple files
        files: uploadedFiles,
        fileCount: uploadedFiles.length,
        textContent: textContentToStore,
        urlContent: urlContentToStore,
        expiryType: metadata.expiryType,
        // SECURITY: Lifetime follows the paid-for expiry type, not a client-supplied date.
        // It starts when the drop opens.
        expiresAt: (activatesAt ?? timestamp) + EXPIRY_DURATIONS_MS[metadata.expiryType],
        activatesAt,
        maxScans: toPositiveInt(metadata.maxScans),
        maxDownloads: toPositiveInt(metadata.maxDownloads),
        scanCount: 0,
        downloadCount: 0,
        viewOnly: metadata.viewOnly || false,
        noPreview: metadata.noPreview || false,
        password: metadata.password ? await hashPasswordSecure(metadata.password) : null, // Hash password before storing
        qrStyle: metadata.qrStyle || null,
        // NOTE: qrCodeDataUrl is not stored (too large - 30-50 KB, generated on-demand)
        encrypted: metadata.encrypted || false,
        secureMode: metadata.secureMode || false,
        singleQrMode: metadata.singleQrMode || false,
        encryptionKey: metadata.encryptionKey || null,
        ownerTokenHash: await sha256Hex(ownerToken),
        createdAt: timestamp,
      };

      if (!(await insertQrDrop(qrDropData))) {
        throw Object.assign(new Error('QR drop ID already in use'), { status: 409 });
      }

      // SECURITY: Don't log user IDs or file counts

      return c.json({
        success: true,
        id,
        qrDrop: withoutSecrets(qrDropData),
        ownerToken, // Secret for the creator only; lets them preview without using up a view
        coinsCharged: cost,
        coins: coinBalance,
      });
    } catch (error) {
      if (uploadedFiles.length > 0) {
        await supabase.storage.from(BUCKET_NAME).remove(uploadedFiles.map((f) => f.path));
      }
      if (cost > 0) await refundCoins(userId!, cost);
      if (error?.status === 409) return c.json({ error: error.message }, 409);
      throw error;
    }
  } catch (error) {
    console.error('Error in upload endpoint:', error);
    return c.json({ error: 'Server error during upload' }, 500);
  }
});

// Create QR drop (for text/URL content without file upload)
app.post('/make-server-c3c9181e/create', async (c) => {
  try {
    const metadata = await c.req.json();
    
    // SECURITY: Don't log metadata - may contain sensitive data

    // SECURITY: Validate metadata size (excluding ciphertext for secureMode/singleQrMode)
    // For secureMode/singleQrMode, ciphertext is sent as separate fields and not counted in metadata size
    const MAX_METADATA_SIZE = 10 * 1024; // 10 KB
    const metadataForSizeCheck = { ...metadata };
    // Remove ciphertext fields from size check (they're stored separately)
    if (metadataForSizeCheck.textContentCiphertext) delete metadataForSizeCheck.textContentCiphertext;
    if (metadataForSizeCheck.urlContentCiphertext) delete metadataForSizeCheck.urlContentCiphertext;
    // Remove qrCodeDataUrl if present (should not be sent, but remove for safety)
    if (metadataForSizeCheck.qrCodeDataUrl) delete metadataForSizeCheck.qrCodeDataUrl;
    
    const metadataString = JSON.stringify(metadataForSizeCheck);
    const metadataSize = metadataString.length;
    
    // SECURITY: Don't log metadata size details
    if (metadataSize > MAX_METADATA_SIZE) {
      console.error(`❌ Metadata too large (${metadataSize} bytes, max: ${MAX_METADATA_SIZE} bytes)`);
      return c.json({ error: 'Metadata too large. Maximum size is 10 KB.' }, 400);
    }

    // User is optional - anonymous creation is allowed for free drops
    const userId = await getRequestUserId(c);
    if (await isCreateRateLimited(c, userId)) {
      return rateLimitedResponse(c);
    }

    // Validate content type
    if (!['text', 'url', 'bundle'].includes(metadata.contentType)) {
      return c.json({ error: 'Invalid content type. Must be text, url, or bundle.' }, 400);
    }

    // Validate content (at least one type must be present)
    // For secureMode/singleQrMode: check ciphertext fields, for standard: check textContent/urlContent
    const isSecureMode = metadata.secureMode === true;
    const isSingleQrMode = metadata.singleQrMode === true;
    const isEncryptedMode = isSecureMode || isSingleQrMode;
    const hasText = isEncryptedMode
      ? (metadata.textContentCiphertext && metadata.textContentCiphertext.length > 0)
      : (metadata.textContent && metadata.textContent.trim().length > 0);
    const hasUrl = isEncryptedMode
      ? (metadata.urlContentCiphertext && metadata.urlContentCiphertext.length > 0)
      : (metadata.urlContent && metadata.urlContent.length > 0);
    
    if (!hasText && !hasUrl) {
      return c.json({ error: 'At least text or URL content is required' }, 400);
    }

    // Generate unique ID (use client-provided ID if available for Secure Mode)
    // This ensures encryption/decryption use the same ID
    // SECURITY: Don't log clientId or IDs
    
    const id = metadata.clientId && UUID_REGEX.test(metadata.clientId)
      ? metadata.clientId
      : crypto.randomUUID();
    const timestamp = Date.now();
    const ownerToken = crypto.randomUUID();
    
    if (isSecureMode && !metadata.clientId) {
      console.warn('⚠️ [SERVER] Secure Mode QR drop created WITHOUT clientId! This will cause decryption to fail!');
    } else if (isSecureMode && metadata.clientId && id !== metadata.clientId) {
      console.error('❌ [SERVER] clientId provided but UUID validation failed!');
    }

    // SECURITY: A client-chosen ID must never replace someone else's drop
    if (await getQrDrop(id)) {
      return c.json({ error: 'QR drop ID already in use' }, 409);
    }

    const price = priceQrDrop(c, userId, metadata, []);
    if (price instanceof Response) return price;
    const { cost, activatesAt } = price;
    // Done before charging so a hashing failure can't cost coins
    const passwordHash = metadata.password ? await hashPasswordSecure(metadata.password) : null;

    let coinBalance: number | null = null;
    if (cost > 0) {
      coinBalance = await deductCoins(userId!, cost);
      if (coinBalance === null) return insufficientCoinsResponse(c, cost);
    }

    // Store metadata in KV
    // For secureMode/singleQrMode: use ciphertext fields, for standard: use textContent/urlContent
    const textContentToStore = isEncryptedMode
      ? (metadata.textContentCiphertext || null)
      : (metadata.textContent || null);
    const urlContentToStore = isEncryptedMode
      ? (metadata.urlContentCiphertext || null)
      : (metadata.urlContent || null);
    
    const qrDropData = {
      id,
      userId,
      contentType: metadata.contentType,
      title: metadata.title || null,
      fileName: metadata.contentType === 'text' ? 'Tekstmelding' : 'URL-lenke',
      fileType: metadata.contentType === 'text' ? 'text/plain' : 'text/url',
      fileSize: metadata.contentType === 'text' 
        ? (textContentToStore?.length || 0) 
        : (urlContentToStore?.length || 0),
      filePath: null,
      textContent: textContentToStore,
      urlContent: urlContentToStore,
      expiryType: metadata.expiryType,
      // SECURITY: Lifetime follows the paid-for expiry type, not a client-supplied date.
      // It starts when the drop opens.
      expiresAt: (activatesAt ?? timestamp) + EXPIRY_DURATIONS_MS[metadata.expiryType],
      activatesAt,
      maxScans: toPositiveInt(metadata.maxScans),
      maxDownloads: toPositiveInt(metadata.maxDownloads),
      scanCount: 0,
      downloadCount: 0,
      viewOnly: metadata.viewOnly || false,
      noPreview: metadata.noPreview || false,
      password: passwordHash, // Hashed before storing
      qrStyle: metadata.qrStyle || null,
      // NOTE: qrCodeDataUrl is not stored (too large - 30-50 KB, generated on-demand)
      encrypted: metadata.encrypted || false,
      secureMode: metadata.secureMode || false,
      singleQrMode: metadata.singleQrMode || false,
      encryptionKey: metadata.encryptionKey || null,
      ownerTokenHash: await sha256Hex(ownerToken),
      createdAt: timestamp,
    };

    try {
      if (!(await insertQrDrop(qrDropData))) {
        if (cost > 0) await refundCoins(userId!, cost);
        return c.json({ error: 'QR drop ID already in use' }, 409);
      }
    } catch (error) {
      if (cost > 0) await refundCoins(userId!, cost);
      throw error;
    }

    // SECURITY: Don't log IDs or user IDs

    return c.json({
      success: true,
      id,
      qrDrop: withoutSecrets(qrDropData),
      ownerToken, // Secret for the creator only; lets them preview without using up a view
      coinsCharged: cost,
      coins: coinBalance,
    });
  } catch (error) {
    console.error('Error in create endpoint:', error);
    return c.json({ error: 'Server error during create' }, 500);
  }
});

// Get QR drop metadata by ID (for scanning)
// SECURITY: Returns metadata only. Content, keys and file URLs require /open.
app.get('/make-server-c3c9181e/qr/:id', async (c) => {
  try {
    const id = c.req.param('id');

    // SECURITY: Validate UUID format
    if (!UUID_REGEX.test(id)) {
      return c.json({ error: 'Invalid QR drop ID format' }, 400);
    }

    const qrDrop = await getQrDrop(id);

    if (!qrDrop) {
      return c.json({ error: 'QR drop not found' }, 404);
    }

    if (getExpiryReason(qrDrop)) {
      if (isDeletable(qrDrop)) {
        await deleteQrDrop(id);
      }
      return c.json({ error: 'QR drop has expired and been deleted', code: 'EXPIRED' }, 410);
    }

    return c.json({ qrDrop: publicMetadata(qrDrop) });
  } catch (error) {
    console.error('Error getting QR drop:', error);
    return c.json({ error: 'Failed to get QR drop' }, 500);
  }
});

// Open a QR drop: verifies password, counts the view atomically and returns content.
// This is the only endpoint that hands out content, keys and file URLs.
app.post('/make-server-c3c9181e/qr/:id/open', async (c) => {
  try {
    const id = c.req.param('id');
    if (!UUID_REGEX.test(id)) {
      return c.json({ error: 'Invalid QR drop ID format' }, 400);
    }

    const body = await c.req.json().catch(() => ({}));
    const password = typeof body?.password === 'string' ? body.password : '';

    let qrDrop = await getQrDrop(id);
    if (!qrDrop) {
      return c.json({ error: 'QR drop not found' }, 404);
    }

    if (getExpiryReason(qrDrop)) {
      if (isDeletable(qrDrop)) {
        await deleteQrDrop(id);
      }
      return c.json({ error: 'QR drop has expired and been deleted', code: 'EXPIRED' }, 410);
    }

    // Owners can preview a scheduled drop; everyone else waits (and can't guess the password yet)
    const isOwner = await isRequestOwner(c, qrDrop);
    if (isNotYetActive(qrDrop) && !isOwner) {
      return c.json({ error: 'QR drop is not active yet', code: 'NOT_YET_ACTIVE', activatesAt: qrDrop.activatesAt }, 403);
    }

    if (qrDrop.password) {
      if (!password) {
        return c.json({ error: 'Password required', code: 'PASSWORD_REQUIRED' }, 401);
      }

      // SECURITY: Count the attempt before verifying, so parallel guesses are limited too
      const attempts = await registerPasswordAttempt(id);
      if (attempts > PASSWORD_MAX_ATTEMPTS) {
        return c.json({ error: 'Too many password attempts. Try again later.', code: 'TOO_MANY_ATTEMPTS' }, 429);
      }

      if (!(await verifyPasswordSecure(password, qrDrop.password))) {
        return c.json({ error: 'Invalid password', code: 'INVALID_PASSWORD' }, 401);
      }
      const { error: resetError } = await supabase.from('qr_password_attempts').delete().eq('qr_drop_id', id);
      if (resetError) throw new Error(resetError.message);
    }

    // Owners previewing their own drop don't use up a view
    if (!isOwner) {
      const consumed = await consumeQrDrop(id, 'scan');
      if (!consumed) {
        // Another viewer used the last view between our read and the atomic update
        return c.json({ error: 'QR drop has expired and been deleted', code: 'EXPIRED' }, 410);
      }
      qrDrop = consumed;
    }

    const viewToken = await issueViewToken(id);
    const files = await createSignedFileUrls(qrDrop);

    // A password was supplied and verified, so the client no longer needs to treat it as locked
    return c.json({
      qrDrop: { ...withoutSecrets(qrDrop), password: null },
      files: files.length > 0 ? files : null,
      fileUrl: files[0]?.fileUrl ?? null, // Backwards compatibility - first file
      viewToken,
    });
  } catch (error) {
    console.error('Error opening QR drop:', error);
    return c.json({ error: 'Failed to open QR drop' }, 500);
  }
});

// Get file URL(s) (for file downloads) - supports multiple files
// SECURITY: Requires a view token from /open (or ownership)
app.get('/make-server-c3c9181e/qr/:id/file', async (c) => {
  const id = c.req.param('id');

  // SECURITY: Validate UUID format
  if (!UUID_REGEX.test(id)) {
    return c.json({ error: 'Invalid QR drop ID format' }, 400);
  }

  const fileIndex = c.req.query('index'); // Optional: specific file index

  try {
    const qrDrop = await getQrDrop(id);
    if (!qrDrop) {
      return c.json({ error: 'QR drop not found' }, 404);
    }

    if (!(await hasViewAccess(c, qrDrop))) {
      return c.json({ error: 'Open the QR drop first', code: 'VIEW_TOKEN_REQUIRED' }, 403);
    }

    if (qrDrop.expiresAt && Date.now() > qrDrop.expiresAt) {
      return c.json({
        error: 'This QR drop has expired',
        expired: true
      }, 410);
    }

    if (qrDrop.maxDownloads && (qrDrop.downloadCount || 0) >= qrDrop.maxDownloads) {
      return c.json({
        error: 'Maximum downloads reached',
        expired: true
      }, 410);
    }

    const validFiles = await createSignedFileUrls(qrDrop);

    if (validFiles.length === 0) {
      return c.json({ error: 'This QR drop does not contain any files' }, 404);
    }

    // If specific index requested, return only that file
    if (fileIndex !== undefined) {
      const file = validFiles.find((f: any) => f.fileIndex === parseInt(fileIndex));
      if (!file) {
        return c.json({ error: 'Invalid file index' }, 400);
      }
      return c.json({ ...file, totalFiles: validFiles.length });
    }

    // For backwards compatibility, also include first file at root level
    return c.json({
      files: validFiles,
      fileCount: validFiles.length,
      // Backwards compatibility fields (first file)
      fileUrl: validFiles[0].fileUrl,
      fileName: validFiles[0].fileName,
      fileType: validFiles[0].fileType
    });
  } catch (error) {
    console.error('Error getting files:', error);
    return c.json({ error: 'Server error' }, 500);
  }
});

// Increment download count
// SECURITY: Requires a view token; the limit is enforced atomically in the database
app.post('/make-server-c3c9181e/qr/:id/download', async (c) => {
  try {
    const id = c.req.param('id');
    if (!UUID_REGEX.test(id)) {
      return c.json({ error: 'Invalid QR drop ID format' }, 400);
    }

    const qrDrop = await getQrDrop(id);

    if (!qrDrop) {
      return c.json({ error: 'QR drop not found' }, 404);
    }

    if (!(await hasViewAccess(c, qrDrop))) {
      return c.json({ error: 'Open the QR drop first', code: 'VIEW_TOKEN_REQUIRED' }, 403);
    }

    const updated = await consumeQrDrop(id, 'download');
    if (!updated) {
      return c.json({ error: 'Maximum downloads reached', expired: true }, 410);
    }

    return c.json({ success: true, downloadCount: updated.downloadCount });
  } catch (error) {
    console.error('Error incrementing download count:', error);
    return c.json({ error: 'Failed to increment download count' }, 500);
  }
});

// Change or cancel the release date of a scheduled drop (logged-in owner only).
// Body: { activatesAt: ISO date | null }, where null opens it right away. The lifetime
// moves along with it. Drops that are already open can't be scheduled again.
app.post('/make-server-c3c9181e/qr/:id/activation', async (c) => {
  try {
    const id = c.req.param('id');
    if (!UUID_REGEX.test(id)) {
      return c.json({ error: 'Invalid QR drop ID format' }, 400);
    }

    const userId = await getRequestUserId(c);
    if (!userId) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const qrDrop = await getQrDrop(id);
    if (!qrDrop || getExpiryReason(qrDrop)) {
      return c.json({ error: 'QR drop not found' }, 404);
    }
    if (qrDrop.userId !== userId) {
      return c.json({ error: 'Unauthorized: You can only change your own QR drops' }, 403);
    }
    if (!isNotYetActive(qrDrop)) {
      return c.json({ error: 'QR drop is already active', code: 'ALREADY_ACTIVE' }, 409);
    }

    const body = await c.req.json().catch(() => null);
    if (!body || !('activatesAt' in body)) {
      return c.json({ error: 'activatesAt is required' }, 400);
    }
    const now = Date.now();
    const activatesAt = parseActivatesAt(body.activatesAt, now);
    if (activatesAt === undefined) return invalidActivationResponse(c);

    const lifetimeMs = qrDrop.expiresAt - qrDrop.activatesAt;
    const expiresAt = (activatesAt ?? now) + lifetimeMs;
    await updateQrDrop(id, { activates_at: toIso(activatesAt), expires_at: toIso(expiresAt) });

    return c.json({ success: true, qrDrop: withoutSecrets({ ...qrDrop, activatesAt, expiresAt }) });
  } catch (error) {
    console.error('Error changing activation date:', error);
    return c.json({ error: 'Failed to change activation date' }, 500);
  }
});

// Get the caller's QR drops (for list view), one page at a time
const QRDROPS_PAGE_SIZE = 100;

app.get('/make-server-c3c9181e/qrdrops', async (c) => {
  try {
    const userId = await getRequestUserId(c);
    if (!userId) {
      return c.json({ qrDrops: [] });
    }

    const limit = Math.min(toPositiveInt(c.req.query('limit')) ?? QRDROPS_PAGE_SIZE, QRDROPS_PAGE_SIZE);
    const offset = Math.max(0, parseInt(c.req.query('offset') ?? '0', 10) || 0);

    // Only the caller's own drops, newest first
    const { data, count, error } = await supabase
      .from('qr_drops')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(error.message);

    // SECURITY: Don't log user IDs or QR drop counts
    const total = count ?? 0;
    return c.json({
      // SECURITY: The key ring shows rules and status, never content or keys
      qrDrops: (data ?? []).map((row: any) => {
        const { textContent, urlContent, encryptionKey, ...rest } = withoutSecrets(dropFromRow(row));
        return { ...rest, hasTextContent: !!textContent, hasUrlContent: !!urlContent };
      }),
      total,
      nextOffset: offset + limit < total ? offset + limit : null,
    });
  } catch (error) {
    console.error('❌ Error getting QR drops:', error);
    return c.json({ error: 'Failed to get QR drops' }, 500);
  }
});

// Delete QR drop
// SECURITY: Only the logged-in owner can delete. Anonymous drops can't be deleted
// (nobody can prove ownership) and are removed when they expire.
app.delete('/make-server-c3c9181e/qr/:id', async (c) => {
  try {
    const id = c.req.param('id');
    
    // SECURITY: Validate UUID format
    if (!UUID_REGEX.test(id)) {
      return c.json({ error: 'Invalid QR drop ID format' }, 400);
    }
    
    const userId = await getRequestUserId(c);
    if (!userId) {
      return c.json({ error: 'Authentication required to delete this QR drop' }, 401);
    }
    
    const qrDrop = await getQrDrop(id);
    if (!qrDrop) {
      return c.json({ error: 'QR drop not found' }, 404);
    }
    
    if (qrDrop.userId !== userId) {
      return c.json({ error: 'Unauthorized: You can only delete your own QR drops' }, 403);
    }
    
    await deleteQrDrop(id);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting QR drop:', error);
    return c.json({ error: 'Failed to delete QR drop' }, 500);
  }
});

// The balance counts Pluss keys; each is worth PLUSS_PRICE_ORE. Must match src/utils/create-drop.ts.
const PLUSS_PRICE_ORE = 500;
const SALDO_PACKAGES: Record<string, { coins: number }> = {
  saldo50: { coins: 10 },
  saldo100: { coins: 20 },
};

// Stripe Checkout - Create session
app.post('/make-server-c3c9181e/checkout', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken || accessToken === Deno.env.get('SUPABASE_ANON_KEY')) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return c.json({ error: 'Invalid authentication' }, 401);
    }

    // Initialize Stripe
    const Stripe = (await import('npm:stripe@17.3.1')).default;
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2024-12-18.acacia',
    });

    // SECURITY: Validate and sanitize origin to prevent redirect attacks
    const ALLOWED_ORIGINS = ['https://onetimeqr.com', 'https://www.onetimeqr.com'];
    const origin = c.req.header('Origin');
    let baseUrl = 'https://onetimeqr.com'; // Default fallback
    
    if (origin) {
      try {
        const originUrl = new URL(origin);
        if (ALLOWED_ORIGINS.includes(originUrl.origin)) {
          baseUrl = originUrl.origin;
        }
      } catch (error) {
        // Invalid origin, use default
        console.warn('Invalid origin header:', origin);
      }
    }

    const body = await c.req.json().catch(() => ({}));
    const pkg = SALDO_PACKAGES[body?.package as string];
    if (!pkg) {
      return c.json({ error: 'Unknown package', code: 'UNKNOWN_PACKAGE' }, 400);
    }

    // Create Stripe Checkout session
    // Apple Pay and Google Pay are automatically available when supported
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'link'],
      line_items: [
        {
          price_data: {
            currency: 'nok',
            product_data: {
              name: `OneTimeQR-saldo ${pkg.coins * PLUSS_PRICE_ORE / 100} kr`,
              description: `${pkg.coins} Pluss-nøkler à ${PLUSS_PRICE_ORE / 100} kr`,
            },
            unit_amount: pkg.coins * PLUSS_PRICE_ORE,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/`,
      customer_email: user.email || undefined,
      metadata: {
        userId: user.id,
        userEmail: user.email || '',
        coins: String(pkg.coins),
      },
      // Enable automatic payment methods (Apple Pay, Google Pay)
      payment_method_options: {
        card: {
          request_three_d_secure: 'automatic',
        },
      },
      // Enable Apple Pay and Google Pay automatically
      allow_promotion_codes: false,
    });

    return c.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return c.json({ error: `Failed to create checkout session: ${error.message}` }, 500);
  }
});

// Stripe Webhook - Handle payment completion
app.post('/make-server-c3c9181e/webhook', async (c) => {
  console.log('🔔 Webhook received!');
  
  // SECURITY: Don't log headers or body - they contain signatures and customer data

  // Check if service role key is set
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceRoleKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY not set!');
    return c.json({ error: 'Service role key not configured' }, 500);
  }
  // SECURITY: Don't log that service role key exists
  
  try {
    const signature = c.req.header('stripe-signature');
    if (!signature) {
      console.error('❌ Missing stripe-signature header');
      return c.json({ error: 'Missing stripe-signature header' }, 400);
    }

    const body = await c.req.text();
    
    const Stripe = (await import('npm:stripe@17.3.1')).default;
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2024-12-18.acacia',
    });

    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      console.error('❌ STRIPE_WEBHOOK_SECRET not set');
      return c.json({ error: 'Webhook secret not configured' }, 500);
    }
    // SECURITY: Never log webhook secrets or signatures - even partial logging is dangerous

    let event;
    try {
      // Use constructEventAsync for Deno Edge Functions (async crypto required)
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
      console.log('✅ Webhook signature verified');
      console.log('📋 Event type:', event.type);
      console.log('📋 Event ID:', event.id);
    } catch (err) {
      console.error('❌ Webhook signature verification failed:', err?.message);
      return c.json({ error: 'Signature verification failed' }, 400);
    }

    // Card and Link payments complete synchronously; async methods report success separately
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object;

      if (session.payment_status !== 'paid') {
        console.log('ℹ️ Checkout session completed without payment yet - waiting for async payment');
        return c.json({ received: true });
      }

      const userId = session.metadata?.userId;
      const coinsToAdd = parseInt(session.metadata?.coins ?? '', 10);

      // SECURITY: Don't log user IDs, emails or session metadata
      if (!userId || !UUID_REGEX.test(userId) || !Number.isInteger(coinsToAdd) || coinsToAdd <= 0) {
        console.error('❌ Checkout session has invalid metadata');
        return c.json({ error: 'Invalid session metadata' }, 400);
      }

      // Marking the session as processed and adding coins is one transaction (B5)
      const { data: credit, error: creditError } = await supabase.rpc('credit_checkout_session', {
        p_session_id: session.id,
        p_user_id: userId,
        p_coins: coinsToAdd,
        p_event_id: event.id,
      });

      if (creditError) {
        console.error('❌ Error crediting coins:', creditError.message);
        // 500 makes Stripe retry; the session is only marked as processed if coins were added
        return c.json({ error: 'Failed to credit coins' }, 500);
      }

      if (credit?.alreadyProcessed) {
        console.log('⚠️ Session already processed - skipping coin addition');
      } else {
        console.log(`🎊 Added ${coinsToAdd} coins`);
      }
      return c.json({ received: true });
    }

    console.log('ℹ️ Webhook event received but not handled:', event.type);
    return c.json({ received: true });
  } catch (error) {
    console.error('❌ Error processing webhook:', error?.message);
    return c.json({ error: 'Webhook error' }, 500);
  }
});

// Coins are charged by /upload and /create (see priceQrDrop); there is no client-driven deduct endpoint.

Deno.serve(app.fetch);



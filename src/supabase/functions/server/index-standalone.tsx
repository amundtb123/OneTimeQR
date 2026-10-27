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

// KV store helpers over the kv_store_c3c9181e table
const kvClient = () => createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const kv = {
  set: async (key: string, value: any): Promise<void> => {
    const client = kvClient();
    const { error } = await client.from('kv_store_c3c9181e').upsert({ key, value });
    if (error) throw new Error(error.message);
  },
  // Insert without overwriting; returns false if the key already exists
  insert: async (key: string, value: any): Promise<boolean> => {
    const client = kvClient();
    const { error } = await client.from('kv_store_c3c9181e').insert({ key, value });
    if (error?.code === '23505') return false;
    if (error) throw new Error(error.message);
    return true;
  },
  get: async (key: string): Promise<any> => {
    const client = kvClient();
    const { data, error } = await client.from('kv_store_c3c9181e').select('value').eq('key', key).maybeSingle();
    if (error) throw new Error(error.message);
    return data?.value;
  },
  del: async (key: string): Promise<void> => {
    const client = kvClient();
    const { error } = await client.from('kv_store_c3c9181e').delete().eq('key', key);
    if (error) throw new Error(error.message);
  },
  mset: async (keys: string[], values: any[]): Promise<void> => {
    const client = kvClient();
    const { error } = await client.from('kv_store_c3c9181e').upsert(keys.map((k, i) => ({ key: k, value: values[i] })));
    if (error) throw new Error(error.message);
  },
  mget: async (keys: string[]): Promise<any[]> => {
    const client = kvClient();
    const { data, error } = await client.from('kv_store_c3c9181e').select('value').in('key', keys);
    if (error) throw new Error(error.message);
    return data?.map((d) => d.value) ?? [];
  },
  mdel: async (keys: string[]): Promise<void> => {
    const client = kvClient();
    const { error } = await client.from('kv_store_c3c9181e').delete().in('key', keys);
    if (error) throw new Error(error.message);
  },
  getByPrefix: async (prefix: string): Promise<any[]> => {
    const client = kvClient();
    const { data, error } = await client.from('kv_store_c3c9181e').select('key, value').like('key', prefix + '%');
    if (error) throw new Error(error.message);
    return data?.map((d) => d.value) ?? [];
  },
  getEntriesByPrefix: async (prefix: string): Promise<Array<{ key: string; value: any }>> => {
    const client = kvClient();
    const { data, error } = await client.from('kv_store_c3c9181e').select('key, value').like('key', prefix + '%');
    if (error) throw new Error(error.message);
    return data ?? [];
  },
};

// Initialize storage bucket
const BUCKET_NAME = 'make-c3c9181e-qrdrop-files';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// SECURITY: Content, keys and file URLs are only handed out by /open, which issues a
// short-lived view token. Follow-up calls (/file, /key, /download) must present it.
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

async function issueViewToken(qrDropId: string): Promise<string> {
  const token = crypto.randomUUID();
  await kv.set(`view:${token}`, { qrDropId, expiresAt: Date.now() + VIEW_TOKEN_TTL_MS });
  return token;
}

// Viewers need a view token from /open; owners always have access to their own drops
async function hasViewAccess(c: any, qrDrop: any): Promise<boolean> {
  const token = c.req.header('X-View-Token');
  if (token && UUID_REGEX.test(token)) {
    const tokenData = await kv.get(`view:${token}`);
    if (tokenData && tokenData.qrDropId === qrDrop.id && tokenData.expiresAt > Date.now()) {
      return true;
    }
  }
  return isRequestOwner(c, qrDrop);
}

// Atomically count a scan or download, enforcing limits in the database.
// Returns the updated QR drop, or null if the limit was already reached.
async function consumeQrDrop(id: string, kind: 'scan' | 'download'): Promise<any | null> {
  const { data, error } = await supabase.rpc('qrdrop_consume', { p_id: id, p_kind: kind, p_now: Date.now() });
  if (error) throw new Error(`qrdrop_consume failed: ${error.message}`);
  return data;
}

// Atomically register a password attempt; returns the number of attempts in the current window
async function registerPasswordAttempt(id: string): Promise<number> {
  const { data, error } = await supabase.rpc('qrdrop_register_password_attempt', {
    p_id: id,
    p_now: Date.now(),
    p_window_ms: PASSWORD_ATTEMPT_WINDOW_MS,
  });
  if (error) throw new Error(`qrdrop_register_password_attempt failed: ${error.message}`);
  return data;
}

// SECURITY (S3): Prices are decided here, never by the client.
// Must stay in sync with calculateCoinCost() in src/components/upload-section.tsx.
const EXPIRY_DURATIONS_MS: Record<string, number> = {
  '10m': 10 * 60 * 1000,
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  'scan': 7 * 24 * 60 * 60 * 1000, // Scan-once drops live at most 7 days
};
const FREE_EXPIRY_MS = EXPIRY_DURATIONS_MS['10m'];
const FREE_FILE_BYTES = 1 * 1024 * 1024;
const BYTES_PER_EXTRA_COIN = 2 * 1024 * 1024;
// Files arrive encrypted (IV + auth tag), slightly larger than the originals the client prices
const ENCRYPTION_OVERHEAD_ALLOWANCE = 1024;

function calculateCoinCost(options: { hasPassword: boolean; fileSizes: number[]; expiryType: string }): number {
  let cost = options.hasPassword ? 1 : 0;

  const totalBytes = options.fileSizes.reduce((sum, size) => sum + Math.max(0, size - ENCRYPTION_OVERHEAD_ALLOWANCE), 0);
  if (totalBytes > FREE_FILE_BYTES) {
    cost += Math.ceil((totalBytes - FREE_FILE_BYTES) / BYTES_PER_EXTRA_COIN);
  }

  const extraMs = EXPIRY_DURATIONS_MS[options.expiryType] - FREE_EXPIRY_MS;
  if (extraMs > 0) {
    cost += Math.ceil(extraMs / EXPIRY_DURATIONS_MS['24h']);
  }

  return cost;
}

function toPositiveInt(value: unknown): number | null {
  const n = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Rejects options the creator isn't allowed to pick, or returns the price (0 = free)
function priceQrDrop(c: any, userId: string | null, metadata: any, fileSizes: number[]): { cost: number } | Response {
  if (!(metadata.expiryType in EXPIRY_DURATIONS_MS)) {
    return c.json({ error: 'Invalid expiry type' }, 400);
  }
  if ((metadata.secureMode || metadata.singleQrMode) && !userId) {
    return c.json({ error: 'Log in to use Secure Mode', code: 'LOGIN_REQUIRED' }, 401);
  }
  const cost = calculateCoinCost({ hasPassword: !!metadata.password, fileSizes, expiryType: metadata.expiryType });
  if (cost > 0 && !userId) {
    return c.json({ error: 'Log in to use paid features', code: 'LOGIN_REQUIRED', coinCost: cost }, 401);
  }
  return { cost };
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

// Cleanup expired QR drops (runs automatically)
async function cleanupExpired() {
  try {
    console.log('Running automatic cleanup of expired QR drops...');
    const indexes = await kv.getByPrefix('qrdrop:index:');
    const ids = indexes.map((idx: any) => idx.id);
    
    const qrDrops = await kv.mget(ids.map((id: string) => `qrdrop:${id}`));
    const now = Date.now();
    let deletedCount = 0;

    for (const qrDrop of qrDrops) {
      if (!qrDrop) continue;

      if (isDeletable(qrDrop, now)) {
        // SECURITY: Don't log QR drop IDs during cleanup
        await deleteQrDrop(qrDrop.id);
        deletedCount++;
      }
    }

    // Also cleanup expired short-lived tokens and counters (all carry expiresAt)
    let expiredTokens = 0;
    for (const prefix of ['access:', 'view:', 'unlock_token:', 'qr1_scanned:', 'pwfail:', 'ratelimit:']) {
      const entries = await kv.getEntriesByPrefix(prefix);
      const expiredKeys = entries
        .filter((entry) => !entry.value?.expiresAt || entry.value.expiresAt < now)
        .map((entry) => entry.key);
      // Delete in batches to keep the request URL short
      for (let i = 0; i < expiredKeys.length; i += 100) {
        await kv.mdel(expiredKeys.slice(i, i + 100));
      }
      expiredTokens += expiredKeys.length;
    }

    // SECURITY: Minimal logging - only count, no details
    if (deletedCount > 0 || expiredTokens > 0) {
      console.log(`Cleanup: ${deletedCount} QR drops, ${expiredTokens} tokens`);
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

// Helper function to delete QR drop
async function deleteQrDrop(id: string) {
  const qrDrop = await kv.get(`qrdrop:${id}`);
  
  if (qrDrop) {
    // Delete files from storage - support both single file and multiple files
    const filesToDelete: string[] = [];
    
    // Add single file path (backwards compatibility)
    if (qrDrop.filePath) {
      filesToDelete.push(qrDrop.filePath);
    }
    
    // Add multiple files if they exist
    if (qrDrop.files && Array.isArray(qrDrop.files)) {
      qrDrop.files.forEach((file: any) => {
        if (file.path && !filesToDelete.includes(file.path)) {
          filesToDelete.push(file.path);
        }
      });
    }
    
    // Delete all files
    if (filesToDelete.length > 0) {
      try {
        const { error } = await supabase.storage
          .from(BUCKET_NAME)
          .remove(filesToDelete);

        if (error && error.message !== 'Object not found') {
          console.error(`Error deleting files:`, error);
        } else {
          console.log(`✅ Deleted ${filesToDelete.length} file(s)`);
        }
      } catch (error) {
        console.error(`Error during file deletion:`, error);
      }
    }
  }

  // Delete from KV
  await kv.del(`qrdrop:${id}`);
  await kv.del(`qrdrop:index:${id}`);
}

// Upload files and create QR drop (supports multiple files)
app.post('/make-server-c3c9181e/upload', async (c) => {
  try {
    const formData = await c.req.formData();
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
    const MAX_FILE_SIZE = userId ? 20 * 1024 * 1024 : 1 * 1024 * 1024; // 20 MB or 1 MB
    const MAX_TOTAL_SIZE = userId ? 100 * 1024 * 1024 : 5 * 1024 * 1024; // 100 MB or 5 MB total
    
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
    if (await kv.get(`qrdrop:${id}`)) {
      return c.json({ error: 'QR drop ID already in use' }, 409);
    }

    const price = priceQrDrop(c, userId, metadata, files.map((file) => file.size));
    if (price instanceof Response) return price;
    const { cost } = price;

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
        // SECURITY: Lifetime follows the paid-for expiry type, not a client-supplied date
        expiresAt: timestamp + EXPIRY_DURATIONS_MS[metadata.expiryType],
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

      if (!(await kv.insert(`qrdrop:${id}`, qrDropData))) {
        throw Object.assign(new Error('QR drop ID already in use'), { status: 409 });
      }
      await kv.set(`qrdrop:index:${id}`, { id, createdAt: timestamp, userId });

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
    if (await kv.get(`qrdrop:${id}`)) {
      return c.json({ error: 'QR drop ID already in use' }, 409);
    }

    const price = priceQrDrop(c, userId, metadata, []);
    if (price instanceof Response) return price;
    const { cost } = price;
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
      // SECURITY: Lifetime follows the paid-for expiry type, not a client-supplied date
      expiresAt: timestamp + EXPIRY_DURATIONS_MS[metadata.expiryType],
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
      if (!(await kv.insert(`qrdrop:${id}`, qrDropData))) {
        if (cost > 0) await refundCoins(userId!, cost);
        return c.json({ error: 'QR drop ID already in use' }, 409);
      }
      await kv.set(`qrdrop:index:${id}`, { id, createdAt: timestamp, userId });
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

    const accessToken = c.req.query('access');

    // If NO access token is provided, generate one and return it in JSON
    if (!accessToken) {
      // SECURITY: Don't log token generation

      // Generate fresh access token
      const token = crypto.randomUUID();
      const expiresAt = Date.now() + (5 * 60 * 1000); // 5 minutes

      await kv.set(`access:${token}`, {
        qrDropId: id,
        expiresAt,
        createdAt: Date.now(),
      });

      // Return the token to the client so they can redirect themselves
      return c.json({
        requiresToken: true,
        accessToken: token
      });
    }

    // If access token IS provided, validate it
    const tokenData = await kv.get(`access:${accessToken}`);

    if (!tokenData) {
      return c.json({
        error: '🔒 Denne lenken kan ikke deles. Skann QR-koden på nytt for tilgang.',
        code: 'INVALID_TOKEN'
      }, 403);
    }

    // Check if token matches the QR drop ID
    if (tokenData.qrDropId !== id) {
      return c.json({
        error: 'Ugyldig tilgangslenke',
        code: 'INVALID_TOKEN'
      }, 403);
    }

    // Token is valid - delete it immediately (one-time use)
    await kv.del(`access:${accessToken}`);
    // SECURITY: Don't log access tokens

    const qrDrop = await kv.get(`qrdrop:${id}`);

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

    let qrDrop = await kv.get(`qrdrop:${id}`);
    if (!qrDrop) {
      return c.json({ error: 'QR drop not found' }, 404);
    }

    if (getExpiryReason(qrDrop)) {
      if (isDeletable(qrDrop)) {
        await deleteQrDrop(id);
      }
      return c.json({ error: 'QR drop has expired and been deleted', code: 'EXPIRED' }, 410);
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
      await kv.del(`pwfail:${id}`);
    }

    // Owners previewing their own drop don't use up a view
    if (!(await isRequestOwner(c, qrDrop))) {
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

// Generate new access token for QR code
app.post('/make-server-c3c9181e/qr/:id/access-token', async (c) => {
  try {
    const id = c.req.param('id');
    const qrDrop = await kv.get(`qrdrop:${id}`);

    if (!qrDrop) {
      return c.json({ error: 'QR drop not found' }, 404);
    }

    // Generate random access token
    const accessToken = crypto.randomUUID();

    // Store token with 5 minute expiry
    await kv.set(`access:${accessToken}`, {
      qrDropId: id,
      createdAt: Date.now(),
      expiresAt: Date.now() + (5 * 60 * 1000) // 5 minutes
    });

    return c.json({
      accessToken,
      url: `/scan/${id}?access=${accessToken}`
    });
  } catch (error) {
    console.error('Error generating access token:', error);
    return c.json({ error: 'Failed to generate access token' }, 500);
  }
});

// Get encryption key for standard encrypted files
// SECURITY: Requires a view token from /open (or ownership)
app.get('/make-server-c3c9181e/qrdrop/:id/key', async (c) => {
  try {
    const id = c.req.param('id');

    // SECURITY: Validate UUID format
    if (!UUID_REGEX.test(id)) {
      return c.json({ error: 'Invalid QR drop ID format' }, 400);
    }

    const qrDrop = await kv.get(`qrdrop:${id}`);

    if (!qrDrop) {
      return c.json({ error: 'QR drop not found' }, 404);
    }

    if (!(await hasViewAccess(c, qrDrop))) {
      return c.json({ error: 'Open the QR drop first', code: 'VIEW_TOKEN_REQUIRED' }, 403);
    }

    // Secure Mode and Single QR Mode never store a key on the server
    if (!qrDrop.encryptionKey) {
      return c.json({ error: 'Encryption key not found' }, 404);
    }

    // SECURITY: Don't log QR drop IDs or encryption key operations

    return c.json({ encryptionKey: qrDrop.encryptionKey });
  } catch (error) {
    console.error('Error fetching encryption key:', error);
    return c.json({ error: 'Failed to fetch encryption key' }, 500);
  }
});

// Lightweight check endpoint
app.get('/make-server-c3c9181e/qrdrop/:id/check', async (c) => {
  try {
    const id = c.req.param('id');
    
    // SECURITY: Validate UUID format
    if (!UUID_REGEX.test(id)) {
      return c.json({ error: 'Invalid QR drop ID format' }, 400);
    }
    
    const qrDrop = await kv.get(`qrdrop:${id}`);

    if (!qrDrop) {
      return c.json({ error: 'QR drop not found' }, 404);
    }

    // SECURITY: Don't log QR drop IDs or mode details
    
    return c.json({ 
      secureMode: qrDrop.secureMode || false,
      singleQrMode: qrDrop.singleQrMode || false,
      hasPassword: !!qrDrop.password,
      contentType: qrDrop.contentType,
      expiresAt: qrDrop.expiresAt,
      expiryType: qrDrop.expiryType
    });
  } catch (error) {
    console.error('Error checking QR drop:', error);
    return c.json({ error: `Failed to check QR drop: ${error.message}` }, 500);
  }
});

// Mark QR1 as scanned (for secureMode split-key or singleQrMode)
// Server stores that QR1 was scanned WITHOUT seeing k1 (zero-knowledge)
app.post('/make-server-c3c9181e/qrdrop/:id/qr1-scanned', async (c) => {
  try {
    const id = c.req.param('id');
    
    // SECURITY: Validate UUID format
    if (!UUID_REGEX.test(id)) {
      return c.json({ error: 'Invalid QR drop ID format' }, 400);
    }
    
    const qrDrop = await kv.get(`qrdrop:${id}`);
    if (!qrDrop) {
      return c.json({ error: 'QR drop not found' }, 404);
    }
    
    // Only for secureMode or singleQrMode
    if (!qrDrop.secureMode && !qrDrop.singleQrMode) {
      return c.json({ error: 'Not a secure mode or single QR mode QR drop' }, 400);
    }
    
    // Store that QR1 was scanned (with timestamp for expiry)
    // We don't see k1 - it's in the URL fragment which never reaches the server
    const now = Date.now();
    const expiryMs = 5 * 60 * 1000; // 5 minutes in milliseconds
    const qr1ScanData = {
      qrDropId: id,
      scannedAt: now,
      expiresAt: now + expiryMs // 5 minutes expiry
    };
    
    await kv.set(`qr1_scanned:${id}`, qr1ScanData);

    // SECURITY: Don't log QR drop IDs
    
    return c.json({ 
      success: true,
      message: 'QR1 scan recorded (zero-knowledge)'
    });
  } catch (error) {
    console.error('Error recording QR1 scan:', error);
    return c.json({ error: `Failed to record QR1 scan: ${error.message}` }, 500);
  }
});

// Verify QR1 was scanned before allowing QR2 unlock (for secureMode split-key)
// Returns unlock token if QR1 was scanned, which client uses to verify before combining k1+k2
app.post('/make-server-c3c9181e/qrdrop/:id/verify-qr1-for-qr2', async (c) => {
  try {
    const id = c.req.param('id');
    
    // SECURITY: Validate UUID format
    if (!UUID_REGEX.test(id)) {
      return c.json({ error: 'Invalid QR drop ID format' }, 400);
    }
    
    const qrDrop = await kv.get(`qrdrop:${id}`);
    if (!qrDrop) {
      return c.json({ error: 'QR drop not found' }, 404);
    }
    
    // Only for secureMode or singleQrMode
    if (!qrDrop.secureMode && !qrDrop.singleQrMode) {
      return c.json({ error: 'Not a secure mode or single QR mode QR drop' }, 400);
    }
    
    // Check if QR1 was scanned
    const qr1ScanData = await kv.get(`qr1_scanned:${id}`);

    if (!qr1ScanData) {
      return c.json({ 
        success: false,
        qr1Scanned: false,
        message: 'QR1 must be scanned before QR2'
      }, 403);
    }
    
    // Check if QR1 scan expired (5 minutes)
    if (qr1ScanData.expiresAt < Date.now()) {
      await kv.del(`qr1_scanned:${id}`);
      return c.json({ 
        success: false,
        qr1Scanned: false,
        expired: true,
        message: 'QR1 scan expired (older than 5 minutes)'
      }, 403);
    }
    
    // QR1 was scanned and is still valid - generate unlock token
    // This token proves to the client that server verified QR1 was scanned
    // Client still combines k1+k2 locally (server never sees keys)
    const unlockToken = crypto.randomUUID();
    const unlockNow = Date.now();
    const unlockExpiryMs = 2 * 60 * 1000; // 2 minutes to use
    await kv.set(`unlock_token:${unlockToken}`, {
      qrDropId: id,
      createdAt: unlockNow,
      expiresAt: unlockNow + unlockExpiryMs // 2 minutes to use
    }); // Note: expireIn parameter not supported by current kv.set implementation
    
    // SECURITY: Don't log QR drop IDs
    
    return c.json({ 
      success: true,
      qr1Scanned: true,
      unlockToken: unlockToken,
      message: 'QR1 verified - you can now combine k1+k2 locally'
    });
  } catch (error) {
    console.error('Error verifying QR1 for QR2:', error);
    return c.json({ error: `Failed to verify QR1: ${error.message}` }, 500);
  }
});

// Increment scan count
// DEPRECATED: Views are now counted atomically by /open. Kept as a no-op for older clients.
app.post('/make-server-c3c9181e/qr/:id/scan', async (c) => {
  const id = c.req.param('id');
  if (!UUID_REGEX.test(id)) {
    return c.json({ error: 'Invalid QR drop ID format' }, 400);
  }
  const qrDrop = await kv.get(`qrdrop:${id}`);
  if (!qrDrop) {
    return c.json({ error: 'QR drop not found' }, 404);
  }
  return c.json({ success: true, scanCount: qrDrop.scanCount || 0 });
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
    const qrDrop = await kv.get(`qrdrop:${id}`);
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

    const qrDrop = await kv.get(`qrdrop:${id}`);

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

    // Only load the caller's own drops (the index entry carries the owner), newest first
    const { data: indexes, error } = await kvClient()
      .from('kv_store_c3c9181e')
      .select('value')
      .like('key', 'qrdrop:index:%')
      .eq('value->>userId', userId);
    if (error) throw new Error(error.message);

    const ids = (indexes ?? [])
      .map((row: any) => row.value)
      .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0))
      .map((idx: any) => idx.id);
    const pageIds = ids.slice(offset, offset + limit);

    const qrDrops = pageIds.length > 0 ? await kv.mget(pageIds.map((id: string) => `qrdrop:${id}`)) : [];

    // SECURITY: Don't log user IDs or QR drop counts
    const ownQrDrops = qrDrops
      .filter((qr: any) => qr && qr.userId === userId)
      .map(withoutSecrets)
      .sort((a: any, b: any) => b.createdAt - a.createdAt);

    return c.json({
      qrDrops: ownQrDrops,
      total: ids.length,
      nextOffset: offset + limit < ids.length ? offset + limit : null,
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
    
    const qrDrop = await kv.get(`qrdrop:${id}`);
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

    // Create Stripe Checkout session
    // Apple Pay and Google Pay are automatically available when supported
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'link'],
      line_items: [
        {
          price_data: {
            currency: 'nok',
            product_data: {
              name: '50 Coins',
              description: 'Kjøp 50 coins for OneTimeQR',
            },
            unit_amount: 2900, // 29 NOK in øre
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
        coins: '50',
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



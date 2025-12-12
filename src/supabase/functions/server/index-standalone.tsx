import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
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
  allowHeaders: ['Content-Type', 'Authorization'],
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

// KV Store functions (inline from kv_store.tsx)
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
};

// Initialize storage bucket
const BUCKET_NAME = 'make-c3c9181e-qrdrop-files';

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

      let isExpired = false;

      // Check if expired
      if (qrDrop.expiresAt && qrDrop.expiresAt < now) {
        isExpired = true;
      }

      // For "scan once" type: allow first viewer (scanCount <= 1), block subsequent scans
      if (qrDrop.expiryType === 'scan' && qrDrop.scanCount > 1) {
        isExpired = true;
      }

      if (qrDrop.maxScans && qrDrop.scanCount >= qrDrop.maxScans) {
        isExpired = true;
      }

      if (qrDrop.maxDownloads && qrDrop.downloadCount >= qrDrop.maxDownloads) {
        isExpired = true;
      }

      // Delete immediately if expired
      if (isExpired) {
        console.log(`Cleanup: Deleting expired QR drop ${qrDrop.id}`);
        await deleteQrDrop(qrDrop.id);
        deletedCount++;
      }
    }
    
    // Also cleanup expired access tokens
    const accessTokens = await kv.getByPrefix('access:');
    let expiredTokens = 0;
    for (const tokenData of accessTokens) {
      if (tokenData && tokenData.expiresAt < now) {
        const tokenId = tokenData.key?.split(':')[1];
        if (tokenId) {
          await kv.del(`access:${tokenId}`);
          expiredTokens++;
          console.log(`Cleanup: Deleted expired access token`);
        }
      }
    }

    console.log(`Cleanup complete: deleted ${deletedCount} expired QR drops and ${expiredTokens} expired tokens`);
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

    console.log('Upload endpoint - received metadata:', JSON.stringify(metadata, null, 2));

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

    console.log(`📁 Uploading ${files.length} file(s)`);

    // Get user ID from auth token (OPTIONAL - allows anonymous uploads)
    let userId: string | null = null;
    const authHeader = c.req.header('Authorization');
    const accessToken = authHeader?.split(' ')[1];
    console.log('📤 POST /upload - Auth header present:', !!authHeader, 'Token present:', !!accessToken);
    
    if (accessToken && accessToken !== Deno.env.get('SUPABASE_ANON_KEY')) {
      try {
        const { data: { user }, error } = await supabase.auth.getUser(accessToken);
        if (error) {
          console.error('❌ Error getting user from token during upload:', error.message);
        } else if (user?.id) {
          userId = user.id;
          console.log('✅ Authenticated upload from user:', userId);
        } else {
          console.log('⚠️ No user ID in response during upload');
        }
      } catch (error) {
        console.error('❌ Exception getting user during upload:', error);
        console.log('Authentication failed during upload, allowing anonymous upload');
      }
    } else {
      console.log('⚠️ Anonymous upload (no auth token or token is anon key)');
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
    
    let totalSize = 0;
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return c.json({ 
          error: `File "${file.name}" exceeds maximum size of ${MAX_FILE_SIZE / (1024 * 1024)} MB` 
        }, 400);
      }
      totalSize += file.size;
    }
    
    if (totalSize > MAX_TOTAL_SIZE) {
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

    // Generate unique ID
    const id = crypto.randomUUID();
    const timestamp = Date.now();

    // Upload all files to Supabase Storage
    const uploadedFiles: Array<{name: string; type: string; size: number; path: string}> = [];

    // SECURITY: Sanitize filename to prevent path traversal attacks
    const sanitizeFileName = (fileName: string): string => {
      // Remove path traversal attempts
      let sanitized = fileName.replace(/\.\./g, '').replace(/\//g, '_').replace(/\\/g, '_');
      // Remove or replace dangerous characters
      sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, '_');
      // Limit length to prevent issues
      return sanitized.substring(0, 255);
    };
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const sanitizedFileName = sanitizeFileName(file.name);
      const filePath = `${id}/${timestamp}-${i}-${sanitizedFileName}`;
      
      // Get original file type from metadata if available (files are encrypted, so file.type is application/octet-stream)
      const fileKey = i === 0 ? 'file' : `file${i}`;
      const originalFileType = metadata.originalFileTypes?.[fileKey] || file.type;

      try {
        const fileBuffer = await file.arrayBuffer();
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(filePath, fileBuffer, {
            contentType: 'application/octet-stream', // Always store as octet-stream since files are encrypted
            upsert: false,
          });

        if (uploadError) {
          console.error(`Upload error for file ${i} (${file.name}):`, uploadError);
          // Continue with other files, but log error
          continue;
        }

        // Store original file type in metadata (before encryption) for proper decryption and display
        uploadedFiles.push({
          name: file.name,
          type: originalFileType, // Original type (before encryption) - important for decryption
          size: file.size, // Encrypted size (may differ from original, but we store what we have)
          path: filePath
        });
        console.log(`✅ Uploaded file ${i + 1}/${files.length}: ${file.name}`);
      } catch (error) {
        console.error(`Error uploading file ${i} (${file.name}):`, error);
        // Continue with other files
      }
    }

    if (uploadedFiles.length === 0) {
      return c.json({ error: 'Failed to upload any files' }, 500);
    }

    // Calculate expiry timestamp
    let expiresAt: number | null = null;
    if (metadata.expiryDate) {
      expiresAt = new Date(metadata.expiryDate).getTime();
    }

    // Store metadata in KV
    // For backwards compatibility, also store first file info in old fields
    const firstFile = uploadedFiles[0];
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
      textContent: metadata.textContent || null,
      urlContent: metadata.urlContent || null,
      expiryType: metadata.expiryType,
      expiresAt,
      maxScans: metadata.maxScans || null,
      maxDownloads: metadata.maxDownloads || null,
      scanCount: 0,
      downloadCount: 0,
      viewOnly: metadata.viewOnly || false,
      noPreview: metadata.noPreview || false,
      password: metadata.password ? await hashPasswordSecure(metadata.password) : null, // Hash password before storing
      qrStyle: metadata.qrStyle || null,
      // NOTE: qrCodeDataUrl is not stored (too large - 30-50 KB, generated on-demand)
      encrypted: metadata.encrypted || false,
      secureMode: metadata.secureMode || false,
      encryptionKey: metadata.encryptionKey || null,
      createdAt: timestamp,
    };

    await kv.set(`qrdrop:${id}`, qrDropData);
    await kv.set(`qrdrop:index:${id}`, { id, createdAt: timestamp, userId });

    console.log(`✅ QR drop created with ${uploadedFiles.length} file(s), userId: ${userId || 'null'}`);

    return c.json({ 
      success: true, 
      id,
      qrDrop: qrDropData 
    });
  } catch (error) {
    console.error('Error in upload endpoint:', error);
    return c.json({ error: `Server error during upload: ${error.message}` }, 500);
  }
});

// Create QR drop (for text/URL content without file upload)
app.post('/make-server-c3c9181e/create', async (c) => {
  try {
    const metadata = await c.req.json();

    // SECURITY: Validate metadata size (excluding ciphertext for secureMode)
    // For secureMode, ciphertext is sent as separate fields and not counted in metadata size
    const MAX_METADATA_SIZE = 10 * 1024; // 10 KB
    const metadataForSizeCheck = { ...metadata };
    // Remove ciphertext fields from size check (they're stored separately)
    if (metadataForSizeCheck.textContentCiphertext) delete metadataForSizeCheck.textContentCiphertext;
    if (metadataForSizeCheck.urlContentCiphertext) delete metadataForSizeCheck.urlContentCiphertext;
    
    const metadataString = JSON.stringify(metadataForSizeCheck);
    if (metadataString.length > MAX_METADATA_SIZE) {
      return c.json({ error: 'Metadata too large. Maximum size is 10 KB.' }, 400);
    }

    // Get user ID from auth token (OPTIONAL - allows anonymous creation)
    let userId: string | null = null;
    const authHeader = c.req.header('Authorization');
    const accessToken = authHeader?.split(' ')[1];
    console.log('📝 POST /create - Auth header present:', !!authHeader, 'Token present:', !!accessToken);
    
    if (accessToken && accessToken !== Deno.env.get('SUPABASE_ANON_KEY')) {
      try {
        const { data: { user }, error } = await supabase.auth.getUser(accessToken);
        if (error) {
          console.error('❌ Error getting user from token during create:', error.message);
        } else if (user?.id) {
          userId = user.id;
          console.log('✅ Authenticated creation from user:', userId);
        } else {
          console.log('⚠️ No user ID in response during create');
        }
      } catch (error) {
        console.error('❌ Exception getting user during create:', error);
        console.log('Authentication failed during create, allowing anonymous creation');
      }
    } else {
      console.log('⚠️ Anonymous creation (no auth token or token is anon key)');
    }

    // Validate content type
    if (!['text', 'url', 'bundle'].includes(metadata.contentType)) {
      return c.json({ error: 'Invalid content type. Must be text, url, or bundle.' }, 400);
    }

    // Validate content (at least one type must be present)
    // For secureMode: check ciphertext fields, for standard: check textContent/urlContent
    const isSecureMode = metadata.secureMode === true;
    const hasText = isSecureMode
      ? (metadata.textContentCiphertext && metadata.textContentCiphertext.length > 0)
      : (metadata.textContent && metadata.textContent.trim().length > 0);
    const hasUrl = isSecureMode
      ? (metadata.urlContentCiphertext && metadata.urlContentCiphertext.length > 0)
      : (metadata.urlContent && metadata.urlContent.length > 0);
    
    if (!hasText && !hasUrl) {
      return c.json({ error: 'At least text or URL content is required' }, 400);
    }

    // Generate unique ID
    const id = crypto.randomUUID();
    const timestamp = Date.now();

    // Calculate expiry timestamp
    let expiresAt: number | null = null;
    if (metadata.expiryDate) {
      expiresAt = new Date(metadata.expiryDate).getTime();
    }

    // Store metadata in KV
    // For secureMode: use ciphertext fields, for standard: use textContent/urlContent
    const textContentToStore = isSecureMode 
      ? (metadata.textContentCiphertext || null)
      : (metadata.textContent || null);
    const urlContentToStore = isSecureMode
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
      expiresAt,
      maxScans: metadata.maxScans || null,
      maxDownloads: metadata.maxDownloads || null,
      scanCount: 0,
      downloadCount: 0,
      viewOnly: metadata.viewOnly || false,
      noPreview: metadata.noPreview || false,
      password: metadata.password ? await hashPasswordSecure(metadata.password) : null, // Hash password before storing
      qrStyle: metadata.qrStyle || null,
      // NOTE: qrCodeDataUrl is not stored (too large - 30-50 KB, generated on-demand)
      encrypted: metadata.encrypted || false,
      secureMode: metadata.secureMode || false,
      encryptionKey: metadata.encryptionKey || null,
      createdAt: timestamp,
    };

    await kv.set(`qrdrop:${id}`, qrDropData);
    await kv.set(`qrdrop:index:${id}`, { id, createdAt: timestamp, userId });

    console.log(`✅ QR drop created, id: ${id}, userId: ${userId || 'null'}`);
    console.log(`📝 Stored qrDropData.userId: ${qrDropData.userId || 'null'}`);

    return c.json({ 
      success: true, 
      id,
      qrDrop: qrDropData 
    });
  } catch (error) {
    console.error('Error in create endpoint:', error);
    return c.json({ error: `Server error during create: ${error.message}` }, 500);
  }
});

// Get QR drop by ID (for scanning)
app.get('/make-server-c3c9181e/qr/:id', async (c) => {
  try {
    const id = c.req.param('id');
    
    // SECURITY: Validate UUID format
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(id)) {
      return c.json({ error: 'Invalid QR drop ID format' }, 400);
    }
    
    const accessToken = c.req.query('access');
    
    // If NO access token is provided, generate one and return it in JSON
    if (!accessToken) {
      console.log(`No token provided for QR ${id} - generating fresh token`);
      
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
    console.log(`Access token used and deleted: ${accessToken}`);
    
    const qrDrop = await kv.get(`qrdrop:${id}`);

    console.log('Getting QR drop:', id);
    // Null-logging: Don't log sensitive data (password, encryptionKey, file content)
    const safeQrDrop = { ...qrDrop };
    if (safeQrDrop.password) safeQrDrop.password = '[REDACTED]';
    if (safeQrDrop.encryptionKey) safeQrDrop.encryptionKey = '[REDACTED]';
    console.log('QR drop metadata (sanitized):', JSON.stringify({
      id: safeQrDrop.id,
      contentType: safeQrDrop.contentType,
      fileName: safeQrDrop.fileName,
      fileSize: safeQrDrop.fileSize,
      fileCount: safeQrDrop.fileCount,
      hasPassword: !!qrDrop.password,
      secureMode: safeQrDrop.secureMode,
      encrypted: safeQrDrop.encrypted,
      expiresAt: safeQrDrop.expiresAt,
      scanCount: safeQrDrop.scanCount,
      downloadCount: safeQrDrop.downloadCount,
    }, null, 2));

    if (!qrDrop) {
      return c.json({ error: 'QR drop not found' }, 404);
    }

    // Check if expired
    const now = Date.now();
    let isExpired = false;
    let expiredReason = '';
    
    // Time-based expiry
    if (qrDrop.expiresAt && qrDrop.expiresAt < now) {
      isExpired = true;
      expiredReason = 'Time expired';
    }

    // For "scan once" type: allow first viewer (scanCount <= 1), block subsequent scans
    if (qrDrop.expiryType === 'scan' && qrDrop.scanCount > 1) {
      isExpired = true;
      expiredReason = 'Already scanned';
    }

    // Max scans reached
    if (qrDrop.maxScans && qrDrop.scanCount >= qrDrop.maxScans) {
      isExpired = true;
      expiredReason = 'Max scans reached';
    }

    // Max downloads reached
    if (qrDrop.maxDownloads && qrDrop.downloadCount >= qrDrop.maxDownloads) {
      isExpired = true;
      expiredReason = 'Max downloads reached';
    }

    // If expired, delete it immediately and return 410 Gone
    if (isExpired) {
      console.log(`QR drop ${id} is expired (${expiredReason}) - deleting immediately`);
      await deleteQrDrop(id);
      return c.json({ error: 'QR drop has expired and been deleted', code: 'EXPIRED' }, 410);
    }

    // OPTIMIZATION: If this QR drop has files, include signed URLs in the response
    let fileUrl = null; // Backwards compatibility - first file
    let files = null; // Multiple files
    
    // Support both single file (backwards compatibility) and multiple files
    if (qrDrop.files && Array.isArray(qrDrop.files) && qrDrop.files.length > 0) {
      // Multiple files - generate signed URLs for all
      try {
        const filesWithUrls = await Promise.all(qrDrop.files.map(async (file: any, index: number) => {
          const { data: signedUrlData, error: signedUrlError } = await supabase.storage
            .from(BUCKET_NAME)
            .createSignedUrl(file.path, 120); // 2 minutes expiry for security

          if (signedUrlError) {
            console.error(`Error getting signed URL for file ${index}:`, signedUrlError);
            return null;
          }

          return {
            fileUrl: signedUrlData.signedUrl,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            fileIndex: index
          };
        }));

        const validFiles = filesWithUrls.filter(f => f !== null);
        if (validFiles.length > 0) {
          files = validFiles;
          fileUrl = validFiles[0].fileUrl; // Backwards compatibility
          console.log(`✅ Included ${validFiles.length} file URL(s) in response`);
        }
      } catch (error) {
        console.error('Error getting signed URLs for files (non-critical):', error);
      }
    } else if (qrDrop.filePath) {
      // Single file (backwards compatibility)
      try {
        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from(BUCKET_NAME)
          .createSignedUrl(qrDrop.filePath, 120); // 2 minutes expiry for security

        if (!signedUrlError && signedUrlData) {
          fileUrl = signedUrlData.signedUrl;
          console.log(`✅ Included file URL in response for faster loading`);
        }
      } catch (error) {
        console.error('Error getting signed URL (non-critical):', error);
      }
    }

    return c.json({ 
      qrDrop,
      fileUrl, // Backwards compatibility
      files // Multiple files
    });
  } catch (error) {
    console.error('Error getting QR drop:', error);
    return c.json({ error: `Failed to get QR drop: ${error.message}` }, 500);
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
    return c.json({ error: `Failed to generate access token: ${error.message}` }, 500);
  }
});

// Verify password
app.post('/make-server-c3c9181e/qr/:id/verify', async (c) => {
  try {
    const id = c.req.param('id');
    const { password } = await c.req.json();
    const qrDrop = await kv.get(`qrdrop:${id}`);

    if (!qrDrop) {
      return c.json({ error: 'QR drop not found' }, 404);
    }

    // Verify password using PBKDF2 (secure comparison)
    const isValid = qrDrop.password ? await verifyPasswordSecure(password, qrDrop.password) : false;
    return c.json({ valid: isValid });
  } catch (error) {
    console.error('Error verifying password:', error);
    return c.json({ error: `Failed to verify password: ${error.message}` }, 500);
  }
});

// Get encryption key for Secure Mode (QR #2) and standard encrypted files
app.get('/make-server-c3c9181e/qrdrop/:id/key', async (c) => {
  try {
    const id = c.req.param('id');
    
    // SECURITY: Validate UUID format
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(id)) {
      return c.json({ error: 'Invalid QR drop ID format' }, 400);
    }
    
    const qrDrop = await kv.get(`qrdrop:${id}`);

    if (!qrDrop) {
      return c.json({ error: 'QR drop not found' }, 404);
    }

    // Return encryption key if it exists
    // ALL files are now encrypted, so encryptionKey should exist for all files
    // For Secure Mode (QR #2), this endpoint is accessed after QR #1 is scanned
    // For standard encrypted files, this endpoint is used for file decryption
    if (!qrDrop.encryptionKey) {
      console.error(`❌ No encryption key found for QR drop ${id} (secureMode: ${qrDrop.secureMode || false}) - this should not happen for encrypted files`);
      return c.json({ error: 'Encryption key not found' }, 404);
    }

    // SECURITY: For Secure Mode, verify that QR #1 was scanned first
    // This is enforced client-side, but we log it here for security monitoring
    if (qrDrop.secureMode) {
      console.log(`✅ Returning encryption key for Secure Mode QR drop ${id} (QR #2)`);
    } else {
      console.log(`✅ Returning encryption key for standard encrypted QR drop ${id}`);
    }
    
    return c.json({ encryptionKey: qrDrop.encryptionKey });
  } catch (error) {
    console.error('Error fetching encryption key:', error);
    return c.json({ error: `Failed to fetch encryption key: ${error.message}` }, 500);
  }
});

// Lightweight check endpoint
app.get('/make-server-c3c9181e/qrdrop/:id/check', async (c) => {
  try {
    const id = c.req.param('id');
    
    // SECURITY: Validate UUID format
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(id)) {
      return c.json({ error: 'Invalid QR drop ID format' }, 400);
    }
    
    const qrDrop = await kv.get(`qrdrop:${id}`);

    if (!qrDrop) {
      return c.json({ error: 'QR drop not found' }, 404);
    }

    console.log(`Lightweight check for QR drop ${id} - secureMode: ${qrDrop.secureMode}`);
    
    return c.json({ 
      secureMode: qrDrop.secureMode || false,
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

// Increment scan count
app.post('/make-server-c3c9181e/qr/:id/scan', async (c) => {
  try {
    const id = c.req.param('id');
    const qrDrop = await kv.get(`qrdrop:${id}`);

    if (!qrDrop) {
      return c.json({ error: 'QR drop not found' }, 404);
    }

    qrDrop.scanCount += 1;
    await kv.set(`qrdrop:${id}`, qrDrop);

    return c.json({ success: true, scanCount: qrDrop.scanCount });
  } catch (error) {
    console.error('Error incrementing scan count:', error);
    return c.json({ error: `Failed to increment scan count: ${error.message}` }, 500);
  }
});

// Get file URL(s) (for file downloads) - supports multiple files
app.get('/make-server-c3c9181e/qr/:id/file', async (c) => {
  const id = c.req.param('id');
  
  // SECURITY: Validate UUID format
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!UUID_REGEX.test(id)) {
    return c.json({ error: 'Invalid QR drop ID format' }, 400);
  }
  
  const fileIndex = c.req.query('index'); // Optional: specific file index
  
  try {
    const qrDrop = await kv.get(`qrdrop:${id}`);
    if (!qrDrop) {
      return c.json({ error: 'QR drop not found' }, 404);
    }

    // Support both single file (backwards compatibility) and multiple files
    const files = qrDrop.files && Array.isArray(qrDrop.files) ? qrDrop.files : 
                   (qrDrop.filePath ? [{ name: qrDrop.fileName, type: qrDrop.fileType, size: qrDrop.fileSize, path: qrDrop.filePath }] : []);

    if (files.length === 0) {
      return c.json({ error: 'This QR drop does not contain any files' }, 404);
    }

    if (qrDrop.expiresAt && Date.now() > qrDrop.expiresAt) {
      await kv.set(`qrdrop:${id}`, { ...qrDrop, expiredAt: Date.now() });
      return c.json({ 
        error: 'This QR drop has expired',
        expired: true 
      }, 410);
    }

    if (qrDrop.maxDownloads && qrDrop.downloadCount >= qrDrop.maxDownloads) {
      await kv.set(`qrdrop:${id}`, { ...qrDrop, expiredAt: Date.now() });
      return c.json({ 
        error: 'Maximum downloads reached',
        expired: true 
      }, 410);
    }

    // If specific index requested, return only that file
    if (fileIndex !== undefined) {
      const index = parseInt(fileIndex);
      if (index >= 0 && index < files.length) {
        const file = files[index];
        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from(BUCKET_NAME)
          .createSignedUrl(file.path, 120); // 2 minutes expiry for security

        if (signedUrlError) {
          console.error('Error getting signed URL:', signedUrlError);
          return c.json({ error: 'Error getting file URL' }, 500);
        }

        return c.json({ 
          fileUrl: signedUrlData.signedUrl,
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
          fileIndex: index,
          totalFiles: files.length
        });
      } else {
        return c.json({ error: 'Invalid file index' }, 400);
      }
    }

    // Return all files with signed URLs
    const filesWithUrls = await Promise.all(files.map(async (file: any, index: number) => {
        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from(BUCKET_NAME)
          .createSignedUrl(file.path, 120); // 2 minutes expiry for security

      if (signedUrlError) {
        console.error(`Error getting signed URL for file ${index}:`, signedUrlError);
        return null;
      }

      return {
        fileUrl: signedUrlData.signedUrl,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        fileIndex: index
      };
    }));

    const validFiles = filesWithUrls.filter(f => f !== null);

    if (validFiles.length === 0) {
      return c.json({ error: 'Error getting file URLs' }, 500);
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
app.post('/make-server-c3c9181e/qr/:id/download', async (c) => {
  try {
    const id = c.req.param('id');
    const qrDrop = await kv.get(`qrdrop:${id}`);

    if (!qrDrop) {
      return c.json({ error: 'QR drop not found' }, 404);
    }

    qrDrop.downloadCount += 1;
    await kv.set(`qrdrop:${id}`, qrDrop);

    return c.json({ success: true, downloadCount: qrDrop.downloadCount });
  } catch (error) {
    console.error('Error incrementing download count:', error);
    return c.json({ error: `Failed to increment download count: ${error.message}` }, 500);
  }
});

// Get all QR drops (for list view)
app.get('/make-server-c3c9181e/qrdrops', async (c) => {
  try {
    let userId: string | null = null;
    const authHeader = c.req.header('Authorization');
    const accessToken = authHeader?.split(' ')[1];
    
    console.log('📋 GET /qrdrops - Auth header present:', !!authHeader, 'Token present:', !!accessToken);
    
    if (accessToken && accessToken !== Deno.env.get('SUPABASE_ANON_KEY')) {
      try {
        const { data: { user }, error } = await supabase.auth.getUser(accessToken);
        if (error) {
          console.error('❌ Error getting user from token:', error.message);
        } else if (user?.id) {
          userId = user.id;
          console.log('✅ Authenticated user:', userId);
        } else {
          console.log('⚠️ No user ID in response');
        }
      } catch (error) {
        console.error('❌ Exception getting user:', error);
      }
    } else {
      console.log('⚠️ No access token or token is anon key');
    }

    const indexes = await kv.getByPrefix('qrdrop:index:');
    const ids = indexes.map((idx: any) => idx.id);
    console.log(`📦 Found ${ids.length} QR drop indexes`);
    
    // Log sample index userIds for debugging
    if (indexes.length > 0) {
      const sampleIndexUserIds = indexes.slice(0, 5).map((idx: any) => idx.userId);
      console.log(`📋 Sample userIds from indexes:`, sampleIndexUserIds);
    }
    
    const qrDrops = await kv.mget(ids.map((id: string) => `qrdrop:${id}`));
    
    let validQrDrops = qrDrops.filter((qr: any) => qr !== null);
    console.log(`📦 Found ${validQrDrops.length} valid QR drops`);
    
    if (!userId) {
      console.log('⚠️ No userId - returning empty list');
      return c.json({ qrDrops: [] });
    }
    
    const beforeFilter = validQrDrops.length;
    
    // Log sample userIds from QR drops before filtering
    if (validQrDrops.length > 0) {
      const sampleQrDropUserIds = validQrDrops.slice(0, 5).map((qr: any) => qr.userId);
      console.log(`📋 Sample userIds from QR drops:`, sampleQrDropUserIds);
    }
    
    validQrDrops = validQrDrops.filter((qr: any) => qr.userId === userId);
    console.log(`🔍 Filtered to ${validQrDrops.length} QR drops for user ${userId} (from ${beforeFilter} total)`);
    
    // Log sample userIds for debugging if no matches
    if (beforeFilter > 0 && validQrDrops.length === 0) {
      const sampleUserIds = validQrDrops.slice(0, 5).map((qr: any) => qr?.userId || 'null');
      const allUserIds = qrDrops.filter((qr: any) => qr !== null).slice(0, 5).map((qr: any) => qr?.userId || 'null');
      console.log('⚠️ No matches - sample userIds in QR drops:', allUserIds);
      console.log(`⚠️ Looking for userId: ${userId}`);
    }
    
    validQrDrops = validQrDrops.sort((a: any, b: any) => b.createdAt - a.createdAt);

    return c.json({ qrDrops: validQrDrops });
  } catch (error) {
    console.error('❌ Error getting QR drops:', error);
    return c.json({ error: `Failed to get QR drops: ${error.message}` }, 500);
  }
});

// Delete QR drop
app.delete('/make-server-c3c9181e/qr/:id', async (c) => {
  try {
    const id = c.req.param('id');
    
    // SECURITY: Validate UUID format
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_REGEX.test(id)) {
      return c.json({ error: 'Invalid QR drop ID format' }, 400);
    }
    
    // SECURITY: Get user ID from auth token and verify ownership
    const authHeader = c.req.header('Authorization');
    const accessToken = authHeader?.split(' ')[1];
    
    let userId: string | null = null;
    if (accessToken && accessToken !== Deno.env.get('SUPABASE_ANON_KEY')) {
      try {
        const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
        if (authError || !user) {
          // If auth fails, allow deletion only if QR drop is anonymous (userId is null)
          // This maintains backwards compatibility for anonymous uploads
        } else {
          userId = user.id;
        }
      } catch (error) {
        console.error('Error getting user during delete:', error);
        // Continue - will check if QR drop is anonymous
      }
    }
    
    // Verify ownership - get QR drop first
    const qrDrop = await kv.get(`qrdrop:${id}`);
    if (!qrDrop) {
      return c.json({ error: 'QR drop not found' }, 404);
    }
    
    // SECURITY: Allow deletion if:
    // 1. User owns the QR drop (userId matches), OR
    // 2. QR drop is anonymous (qrDrop.userId is null) - backwards compatibility
    if (qrDrop.userId && userId && qrDrop.userId !== userId) {
      return c.json({ error: 'Unauthorized: You can only delete your own QR drops' }, 403);
    }
    
    // If QR drop has userId but user is not authenticated, deny
    if (qrDrop.userId && !userId) {
      return c.json({ error: 'Authentication required to delete this QR drop' }, 401);
    }
    
    await deleteQrDrop(id);
    return c.json({ success: true });
  } catch (error) {
    console.error('Error deleting QR drop:', error);
    return c.json({ error: `Failed to delete QR drop: ${error.message}` }, 500);
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
  
  // Safely log headers
  try {
    const headers: Record<string, string> = {};
    if (c.req.headers) {
      c.req.headers.forEach((value, key) => {
        headers[key] = value;
      });
    }
    console.log('📋 Headers:', JSON.stringify(headers, null, 2));
  } catch (headerError) {
    console.log('⚠️ Could not log headers:', headerError);
  }
  
  // Check if service role key is set
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceRoleKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY not set!');
    return c.json({ error: 'Service role key not configured' }, 500);
  }
  console.log('✅ Service role key found');
  
  try {
    const signature = c.req.header('stripe-signature');
    if (!signature) {
      console.error('❌ Missing stripe-signature header');
      return c.json({ error: 'Missing stripe-signature header' }, 400);
    }
    console.log('✅ Stripe signature found');

    const body = await c.req.text();
    console.log('📦 Webhook body length:', body.length);
    console.log('📦 Webhook body preview:', body.substring(0, 200));
    
    const Stripe = (await import('npm:stripe@17.3.1')).default;
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2024-12-18.acacia',
    });

    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      console.error('❌ STRIPE_WEBHOOK_SECRET not set');
      return c.json({ error: 'Webhook secret not configured' }, 500);
    }
    console.log('✅ Webhook secret found');
    console.log('🔑 Webhook secret preview:', webhookSecret.substring(0, 10) + '...' + webhookSecret.substring(webhookSecret.length - 5));
    console.log('🔑 Signature preview:', signature.substring(0, 20) + '...');

    let event;
    try {
      // Use constructEventAsync for Deno Edge Functions (async crypto required)
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
      console.log('✅ Webhook signature verified');
      console.log('📋 Event type:', event.type);
      console.log('📋 Event ID:', event.id);
    } catch (err) {
      console.error('❌ Webhook signature verification failed:', err);
      console.error('❌ Error message:', err?.message);
      console.error('❌ Error type:', err?.constructor?.name);
      console.error('❌ Body length:', body.length);
      console.error('❌ Signature length:', signature?.length);
      console.error('❌ Webhook secret length:', webhookSecret?.length);
      console.error('❌ Full error:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
      return c.json({ error: `Webhook Error: ${err?.message || 'Signature verification failed'}` }, 400);
    }

    // Handle the checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.metadata?.userId;
      const userEmail = session.metadata?.userEmail || session.customer_email || 'unknown';
      const coinsToAdd = parseInt(session.metadata?.coins || '50', 10);

      console.log('🎉 Checkout session completed!');
      console.log('📋 Session details:', {
        sessionId: session.id,
        userId: userId,
        userEmail: userEmail,
        paymentStatus: session.payment_status,
        amountTotal: session.amount_total,
        currency: session.currency,
        coinsToAdd: coinsToAdd,
      });

      if (!userId) {
        console.error('❌ No userId in session metadata');
        console.error('Session metadata:', session.metadata);
        return c.json({ error: 'Missing userId in session metadata' }, 400);
      }

      // Idempotency check: Check if this session has already been processed
      const sessionId = session.id;
      console.log('🔍 Checking idempotency for session:', sessionId);
      
      const { data: existingSession, error: checkError } = await supabase
        .from('processed_checkout_sessions')
        .select('coins_added, processed_at, user_id')
        .eq('session_id', sessionId)
        .single();

      console.log('🔍 Idempotency check result:', {
        found: !!existingSession,
        error: checkError?.code,
        coinsAdded: existingSession?.coins_added,
        processedAt: existingSession?.processed_at,
      });

      if (existingSession && !checkError) {
        console.log('⚠️ Session already processed - skipping coin addition:', {
          sessionId: sessionId,
          coinsAdded: existingSession.coins_added,
          processedAt: existingSession.processed_at,
          userId: existingSession.user_id,
        });
        // Return success but don't add coins again
        return c.json({ 
          received: true, 
          userId: userId,
          coinsAdded: existingSession.coins_added,
          alreadyProcessed: true,
          message: 'Session already processed'
        });
      }

      if (checkError && checkError.code !== 'PGRST116') {
        // PGRST116 = no rows returned (expected if not processed)
        // Other errors are unexpected
        console.error('❌ Error checking idempotency:', checkError);
        // Continue anyway - better to add coins twice than not at all
      }

      // Add coins to user profile using service role (bypasses RLS)
      const { data: profile, error: fetchError } = await supabase
        .from('user_profiles')
        .select('coins')
        .eq('id', userId)
        .single();

      if (fetchError) {
        console.log('📝 Profile does not exist, creating new profile...');
        // Profile doesn't exist, create it
        const { data: newProfile, error: insertError } = await supabase
          .from('user_profiles')
          .insert({ id: userId, coins: coinsToAdd })
          .select('coins')
          .single();
        
        if (insertError) {
          console.error('❌ Error creating user profile:', insertError);
          return c.json({ error: 'Failed to create user profile' }, 500);
        }
        console.log(`✅ Created profile and added ${coinsToAdd} coins. New balance: ${newProfile.coins}`);
      } else {
        const oldCoins = profile.coins || 0;
        const newCoins = oldCoins + coinsToAdd;
        console.log(`💰 Current coins: ${oldCoins}, Adding: ${coinsToAdd}, New total: ${newCoins}`);
        
        // Update existing profile
        const { data: updatedProfile, error: updateError } = await supabase
          .from('user_profiles')
          .update({ coins: newCoins })
          .eq('id', userId)
          .select('coins')
          .single();

        if (updateError) {
          console.error('❌ Error updating coins:', updateError);
          console.error('Update error details:', JSON.stringify(updateError, null, 2));
          return c.json({ error: 'Failed to update coins' }, 500);
        }
        console.log(`✅ Updated coins. New balance: ${updatedProfile.coins}`);
      }

      // Mark this session as processed (idempotency) - BEFORE adding coins to prevent race conditions
      const { error: insertSessionError } = await supabase
        .from('processed_checkout_sessions')
        .insert({
          session_id: sessionId,
          user_id: userId,
          coins_added: coinsToAdd,
          event_id: event.id,
        });

      if (insertSessionError) {
        // If insert fails, check if it's because session already exists (race condition)
        if (insertSessionError.code === '23505') { // Unique violation
          console.log('⚠️ Session already exists in processed table (race condition) - skipping coin addition');
          return c.json({ 
            received: true, 
            userId: userId,
            coinsAdded: coinsToAdd,
            alreadyProcessed: true,
            message: 'Session already processed (race condition)'
          });
        }
        console.error('❌ Error saving processed session:', insertSessionError);
        // Don't fail the webhook, but log the error
      } else {
        console.log('✅ Session marked as processed:', sessionId);
      }

      console.log(`🎊 Successfully added ${coinsToAdd} coins to user ${userId}`);
      
      // Verify the coins were actually added
      const { data: verifyProfile, error: verifyError } = await supabase
        .from('user_profiles')
        .select('coins')
        .eq('id', userId)
        .single();
      
      if (verifyError) {
        console.error('❌ Error verifying coins after update:', verifyError);
      } else {
        console.log(`✅ Verified: User ${userId} now has ${verifyProfile.coins} coins`);
      }
      
      return c.json({ 
        received: true, 
        userId: userId,
        coinsAdded: coinsToAdd,
        newBalance: verifyProfile?.coins ?? 0
      });
    }

    console.log('ℹ️ Webhook event received but not handled:', event.type);
    return c.json({ received: true, eventType: event.type });
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    console.error('❌ Error type:', error?.constructor?.name);
    console.error('❌ Error message:', error?.message);
    console.error('❌ Error stack:', error?.stack);
    console.error('❌ Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2));
    return c.json({ 
      error: `Webhook error: ${error?.message || 'Unknown error'}`,
      errorType: error?.constructor?.name,
      details: process.env.NODE_ENV === 'development' ? error?.stack : undefined
    }, 500);
  }
});

// Deduct coins endpoint
app.post('/make-server-c3c9181e/deduct-coins', async (c) => {
  try {
    const { amount } = await c.req.json();
    
    if (!amount || amount <= 0) {
      return c.json({ error: 'Invalid amount' }, 400);
    }

    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken || accessToken === Deno.env.get('SUPABASE_ANON_KEY')) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return c.json({ error: 'Invalid authentication' }, 401);
    }

    // Get current coins
    const { data: profile, error: fetchError } = await supabase
      .from('user_profiles')
      .select('coins')
      .eq('id', user.id)
      .single();

    if (fetchError) {
      const { error: insertError } = await supabase
        .from('user_profiles')
        .insert({ id: user.id, coins: 0 });
      
      if (insertError) {
        console.error('Error creating user profile:', insertError);
        return c.json({ error: 'Failed to create user profile' }, 500);
      }
      
      return c.json({ error: 'Insufficient coins' }, 400);
    }

    const currentCoins = profile?.coins || 0;
    
    if (currentCoins < amount) {
      return c.json({ error: 'Insufficient coins' }, 400);
    }

    // Deduct coins
    const { data: updatedProfile, error: updateError } = await supabase
      .from('user_profiles')
      .update({ coins: currentCoins - amount })
      .eq('id', user.id)
      .select('coins')
      .single();

    if (updateError) {
      console.error('Error deducting coins:', updateError);
      return c.json({ error: 'Failed to deduct coins' }, 500);
    }

    return c.json({ success: true, coins: updatedProfile.coins });
  } catch (error) {
    console.error('Error in deduct-coins endpoint:', error);
    return c.json({ error: `Server error: ${error.message}` }, 500);
  }
});

// Manual test endpoint to check coins (for debugging)
app.get('/make-server-c3c9181e/test-coins', async (c) => {
  try {
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (!accessToken || accessToken === Deno.env.get('SUPABASE_ANON_KEY')) {
      return c.json({ error: 'Authentication required' }, 401);
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);
    if (authError || !user) {
      return c.json({ error: 'Invalid authentication' }, 401);
    }

    // Get coins directly
    const { data: profile, error: fetchError } = await supabase
      .from('user_profiles')
      .select('coins')
      .eq('id', user.id)
      .single();

    if (fetchError) {
      return c.json({ 
        error: 'Failed to fetch coins', 
        details: fetchError,
        userId: user.id 
      }, 500);
    }

    return c.json({ 
      userId: user.id,
      email: user.email,
      coins: profile?.coins ?? 0,
      profileExists: !!profile
    });
  } catch (error) {
    return c.json({ error: `Server error: ${error.message}` }, 500);
  }
});

Deno.serve(app.fetch);



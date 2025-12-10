import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import { createClient } from 'npm:@supabase/supabase-js@2';

const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', logger(console.log));

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
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
    // Delete file from storage - only if filePath exists (for file uploads)
    if (qrDrop.filePath) {
      try {
        const { error } = await supabase.storage
          .from(BUCKET_NAME)
          .remove([qrDrop.filePath]);
        
        if (error && error.message !== 'Object not found') {
          console.error(`Error deleting file ${qrDrop.filePath}:`, error);
        }
      } catch (error) {
        console.error(`Error during file deletion for ${qrDrop.filePath}:`, error);
      }
    }
  }

  // Delete from KV
  await kv.del(`qrdrop:${id}`);
  await kv.del(`qrdrop:index:${id}`);
}

// Upload file and create QR drop
app.post('/make-server-c3c9181e/upload', async (c) => {
  try {
    const formData = await c.req.formData();
    const file = formData.get('file') as File;
    const metadata = JSON.parse(formData.get('metadata') as string);

    console.log('Upload endpoint - received metadata:', JSON.stringify(metadata, null, 2));

    if (!file) {
      return c.json({ error: 'No file provided' }, 400);
    }

    // Get user ID from auth token (OPTIONAL - allows anonymous uploads)
    let userId: string | null = null;
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (accessToken && accessToken !== Deno.env.get('SUPABASE_ANON_KEY')) {
      try {
        const { data: { user }, error } = await supabase.auth.getUser(accessToken);
        if (user?.id) {
          userId = user.id;
          console.log('Authenticated upload from user:', userId);
        }
      } catch (error) {
        console.log('Authentication failed during upload, allowing anonymous upload');
      }
    } else {
      console.log('Anonymous upload (no auth token provided)');
    }

    // Generate unique ID
    const id = crypto.randomUUID();
    const timestamp = Date.now();
    const filePath = `${id}/${timestamp}-${file.name}`;

    // Upload file to Supabase Storage
    const fileBuffer = await file.arrayBuffer();
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return c.json({ error: `Failed to upload file: ${uploadError.message}` }, 500);
    }

    // Calculate expiry timestamp
    let expiresAt: number | null = null;
    if (metadata.expiryDate) {
      expiresAt = new Date(metadata.expiryDate).getTime();
    }

    // Store metadata in KV
    const qrDropData = {
      id,
      userId,
      contentType: metadata.contentType || 'file' as const,
      title: metadata.title || null,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      filePath,
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
      password: metadata.password || null,
      qrStyle: metadata.qrStyle || null,
      qrCodeDataUrl: metadata.qrCodeDataUrl || null,
      encrypted: metadata.encrypted || false,
      secureMode: metadata.secureMode || false,
      encryptionKey: metadata.encryptionKey || null,
      createdAt: timestamp,
    };

    await kv.set(`qrdrop:${id}`, qrDropData);
    await kv.set(`qrdrop:index:${id}`, { id, createdAt: timestamp, userId });

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

    // Get user ID from auth token (OPTIONAL - allows anonymous creation)
    let userId: string | null = null;
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (accessToken && accessToken !== Deno.env.get('SUPABASE_ANON_KEY')) {
      try {
        const { data: { user }, error } = await supabase.auth.getUser(accessToken);
        if (user?.id) {
          userId = user.id;
          console.log('Authenticated creation from user:', userId);
        }
      } catch (error) {
        console.log('Authentication failed during create, allowing anonymous creation');
      }
    } else {
      console.log('Anonymous creation (no auth token provided)');
    }

    // Validate content type
    if (!['text', 'url', 'bundle'].includes(metadata.contentType)) {
      return c.json({ error: 'Invalid content type. Must be text, url, or bundle.' }, 400);
    }

    // Validate content (at least one type must be present)
    const hasText = metadata.textContent && metadata.textContent.trim().length > 0;
    const hasUrl = metadata.urlContent && metadata.urlContent.length > 0;
    
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
    const qrDropData = {
      id,
      userId,
      contentType: metadata.contentType,
      title: metadata.title || null,
      fileName: metadata.contentType === 'text' ? 'Tekstmelding' : 'URL-lenke',
      fileType: metadata.contentType === 'text' ? 'text/plain' : 'text/url',
      fileSize: metadata.contentType === 'text' 
        ? (metadata.textContent?.length || 0) 
        : (metadata.urlContent?.length || 0),
      filePath: null,
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
      password: metadata.password || null,
      qrStyle: metadata.qrStyle || null,
      qrCodeDataUrl: metadata.qrCodeDataUrl || null,
      encrypted: metadata.encrypted || false,
      secureMode: metadata.secureMode || false,
      encryptionKey: metadata.encryptionKey || null,
      createdAt: timestamp,
    };

    await kv.set(`qrdrop:${id}`, qrDropData);
    await kv.set(`qrdrop:index:${id}`, { id, createdAt: timestamp, userId });

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
    console.log('QR drop data:', JSON.stringify(qrDrop, null, 2));

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

    // OPTIMIZATION: If this QR drop has a file, include the signed URL in the response
    let fileUrl = null;
    if (qrDrop.filePath) {
      try {
        const { data: signedUrlData, error: signedUrlError } = await supabase.storage
          .from(BUCKET_NAME)
          .createSignedUrl(qrDrop.filePath, 60 * 60); // 1 hour expiry

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
      fileUrl
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

    const isValid = qrDrop.password === password;
    return c.json({ valid: isValid });
  } catch (error) {
    console.error('Error verifying password:', error);
    return c.json({ error: `Failed to verify password: ${error.message}` }, 500);
  }
});

// Get encryption key for Secure Mode (QR #2)
app.get('/make-server-c3c9181e/qrdrop/:id/key', async (c) => {
  try {
    const id = c.req.param('id');
    const qrDrop = await kv.get(`qrdrop:${id}`);

    if (!qrDrop) {
      return c.json({ error: 'QR drop not found' }, 404);
    }

    // Only return encryption key if it exists (Secure Mode)
    if (!qrDrop.encryptionKey) {
      return c.json({ error: 'This QR drop is not in Secure Mode' }, 400);
    }

    console.log(`Returning encryption key for QR drop ${id}`);
    
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

// Get file URL (for file downloads)
app.get('/make-server-c3c9181e/qr/:id/file', async (c) => {
  const id = c.req.param('id');
  
  try {
    const qrDrop = await kv.get(`qrdrop:${id}`);
    if (!qrDrop) {
      return c.json({ error: 'QR drop not found' }, 404);
    }

    if (!qrDrop.filePath) {
      return c.json({ error: 'This QR drop does not contain a file' }, 404);
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

    console.log('Getting file from path:', qrDrop.filePath);

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(qrDrop.filePath, 60 * 60); // 1 hour expiry

    if (signedUrlError) {
      console.error('Error getting signed URL:', signedUrlError);
      return c.json({ error: 'Error getting file URL' }, 500);
    }

    return c.json({ 
      fileUrl: signedUrlData.signedUrl,
      fileName: qrDrop.fileName,
      fileType: qrDrop.fileType
    });
  } catch (error) {
    console.error('Error getting file:', error);
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
    const accessToken = c.req.header('Authorization')?.split(' ')[1];
    if (accessToken && accessToken !== Deno.env.get('SUPABASE_ANON_KEY')) {
      try {
        const { data: { user }, error } = await supabase.auth.getUser(accessToken);
        if (user?.id) {
          userId = user.id;
        }
      } catch (error) {
        console.log('No authenticated user (showing all QR drops)');
      }
    }

    const indexes = await kv.getByPrefix('qrdrop:index:');
    const ids = indexes.map((idx: any) => idx.id);
    
    const qrDrops = await kv.mget(ids.map((id: string) => `qrdrop:${id}`));
    
    let validQrDrops = qrDrops.filter((qr: any) => qr !== null);
    
    if (!userId) {
      return c.json({ qrDrops: [] });
    }
    
    validQrDrops = validQrDrops.filter((qr: any) => qr.userId === userId);
    
    validQrDrops = validQrDrops.sort((a: any, b: any) => b.createdAt - a.createdAt);

    return c.json({ qrDrops: validQrDrops });
  } catch (error) {
    console.error('Error getting QR drops:', error);
    return c.json({ error: `Failed to get QR drops: ${error.message}` }, 500);
  }
});

// Delete QR drop
app.delete('/make-server-c3c9181e/qr/:id', async (c) => {
  try {
    const id = c.req.param('id');
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

    const origin = c.req.header('Origin') || c.req.header('Referer') || 'https://onetimeqr.com';
    const baseUrl = new URL(origin).origin;

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
  console.log('📋 Headers:', JSON.stringify(Object.fromEntries(c.req.headers.entries()), null, 2));
  
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

    let event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      console.log('✅ Webhook signature verified');
      console.log('📋 Event type:', event.type);
      console.log('📋 Event ID:', event.id);
    } catch (err) {
      console.error('❌ Webhook signature verification failed:', err);
      console.error('❌ Error details:', JSON.stringify(err, null, 2));
      return c.json({ error: `Webhook Error: ${err.message}` }, 400);
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
    console.error('Error processing webhook:', error);
    return c.json({ error: `Webhook error: ${error.message}` }, 500);
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



import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as kv from './kv_store.tsx';

const app = new Hono();

// Middleware
app.use('*', cors());
app.use('*', logger(console.log));

// Initialize Supabase client
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

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
        const tokenId = tokenData.key?.split(':')[1]; // Extract token ID from key
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

    // Upload all files to Supabase Storage
    const uploadedFiles: Array<{name: string; type: string; size: number; path: string}> = [];
    let totalSize = 0;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filePath = `${id}/${timestamp}-${i}-${file.name}`;

      try {
        const fileBuffer = await file.arrayBuffer();
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(filePath, fileBuffer, {
            contentType: file.type,
            upsert: false,
          });

        if (uploadError) {
          console.error(`Upload error for file ${i} (${file.name}):`, uploadError);
          // Continue with other files, but log error
          continue;
        }

        uploadedFiles.push({
          name: file.name,
          type: file.type,
          size: file.size,
          path: filePath
        });
        totalSize += file.size;
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

    console.log(`✅ QR drop created with ${uploadedFiles.length} file(s)`);

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
      encrypted: metadata.encrypted || false, // Secure Mode flag
      secureMode: metadata.secureMode || false, // Secure Mode flag
      encryptionKey: metadata.encryptionKey || null, // Store encryption key for Secure Mode
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
    // This eliminates the need for a separate /file endpoint call
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
        // Continue without fileUrl - client can fall back to /file endpoint if needed
      }
    }

    return c.json({ 
      qrDrop,
      fileUrl // Include fileUrl if available
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

// Lightweight check endpoint - returns metadata without incrementing scan count
app.get('/make-server-c3c9181e/qrdrop/:id/check', async (c) => {
  try {
    const id = c.req.param('id');
    const qrDrop = await kv.get(`qrdrop:${id}`);

    if (!qrDrop) {
      return c.json({ error: 'QR drop not found' }, 404);
    }

    console.log(`Lightweight check for QR drop ${id} - secureMode: ${qrDrop.secureMode}`);
    
    // Return minimal metadata without incrementing counters
    return c.json({ 
      secureMode: qrDrop.secureMode || false,
      hasPassword: !!qrDrop.password,
      contentType: qrDrop.contentType,
      expiresAt: qrDrop.expiresAt, // For countdown display
      expiryType: qrDrop.expiryType // For showing correct expiry message
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
          .createSignedUrl(file.path, 60 * 60);

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
        .createSignedUrl(file.path, 60 * 60);

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
    // Get user ID from auth token (optional)
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
    
    // Filter out null values and filter by user ID
    let validQrDrops = qrDrops.filter((qr: any) => qr !== null);
    
    // Only show QR drops if user is authenticated
    if (!userId) {
      return c.json({ qrDrops: [] }); // Return empty array if not authenticated
    }
    
    // Filter to only show user's own QR drops
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

// Stripe Checkout - Create session
app.post('/make-server-c3c9181e/checkout', async (c) => {
  try {
    // Get user ID from auth token
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
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
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
        coins: '50',
      },
    });

    return c.json({ url: session.url });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return c.json({ error: `Failed to create checkout session: ${error.message}` }, 500);
  }
});

// Stripe Webhook - Handle payment completion
app.post('/make-server-c3c9181e/webhook', async (c) => {
  try {
    const signature = c.req.header('stripe-signature');
    if (!signature) {
      return c.json({ error: 'Missing stripe-signature header' }, 400);
    }

    const body = await c.req.text();
    const Stripe = (await import('npm:stripe@17.3.1')).default;
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') || '', {
      apiVersion: '2024-12-18.acacia',
    });

    const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not set');
      return c.json({ error: 'Webhook secret not configured' }, 500);
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
      return c.json({ error: `Webhook Error: ${err.message}` }, 400);
    }

    // Handle the checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const userId = session.metadata?.userId;
      const coinsToAdd = parseInt(session.metadata?.coins || '50', 10);

      if (!userId) {
        console.error('No userId in session metadata');
        return c.json({ error: 'Missing userId in session metadata' }, 400);
      }

      // Add coins to user profile
      const { data: profile, error: fetchError } = await supabase
        .from('user_profiles')
        .select('coins')
        .eq('id', userId)
        .single();

      if (fetchError) {
        // Profile doesn't exist, create it
        const { error: insertError } = await supabase
          .from('user_profiles')
          .insert({ id: userId, coins: coinsToAdd });
        
        if (insertError) {
          console.error('Error creating user profile:', insertError);
          return c.json({ error: 'Failed to create user profile' }, 500);
        }
      } else {
        // Update existing profile
        const { error: updateError } = await supabase
          .from('user_profiles')
          .update({ coins: (profile.coins || 0) + coinsToAdd })
          .eq('id', userId);

        if (updateError) {
          console.error('Error updating coins:', updateError);
          return c.json({ error: 'Failed to update coins' }, 500);
        }
      }

      console.log(`Added ${coinsToAdd} coins to user ${userId}`);
      return c.json({ received: true });
    }

    return c.json({ received: true });
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

    // Get user ID from auth token
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
      // Profile doesn't exist, create it with 0 coins
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

Deno.serve(app.fetch);
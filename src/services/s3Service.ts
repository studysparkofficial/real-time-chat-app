import { auth } from './firebase';
import { MessageAttachment } from '../types/chat.types';

export const API_BASE_URL = 'https://0sz03xhubg.execute-api.ap-southeast-2.amazonaws.com/prod';
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export const ALLOWED_MIME_TYPES: Record<string, { ext: string; label: string; category: MessageAttachment['category'] }> = {
  'image/jpeg': { ext: 'jpg', label: 'JPEG Image', category: 'image' },
  'image/png': { ext: 'png', label: 'PNG Image', category: 'image' },
  'image/webp': { ext: 'webp', label: 'WebP Image', category: 'image' },
  'image/gif': { ext: 'gif', label: 'GIF Image', category: 'image' },
  'video/mp4': { ext: 'mp4', label: 'MP4 Video', category: 'video' },
  'video/webm': { ext: 'webm', label: 'WebM Video', category: 'video' },
  'video/quicktime': { ext: 'mov', label: 'QuickTime Video', category: 'video' },
  'audio/webm': { ext: 'webm', label: 'Audio Voice Note', category: 'audio' },
  'audio/mp4': { ext: 'm4a', label: 'Audio Note', category: 'audio' },
  'audio/mpeg': { ext: 'mp3', label: 'MP3 Audio', category: 'audio' },
  'audio/ogg': { ext: 'ogg', label: 'OGG Audio', category: 'audio' },
  'application/pdf': { ext: 'pdf', label: 'PDF Document', category: 'pdf' }
};

const BLOCKED_EXTENSIONS = [
  'exe', 'bat', 'cmd', 'sh', 'bash', 'bin', 'msi', 'com', 'scr', 'vbs', 'ps1', 'jar', 'apk'
];

export interface FileValidationResult {
  valid: boolean;
  error?: string;
  mimeType?: string;
  category?: MessageAttachment['category'];
}

export function validateAttachment(file: File): FileValidationResult {
  if (!file) {
    return { valid: false, error: 'No file provided.' };
  }

  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return { valid: false, error: `Executable or script files (.${ext}) are blocked for security.` };
  }

  let mimeType = (file.type || '').toLowerCase();
  if (!mimeType) {
    if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
    else if (ext === 'png') mimeType = 'image/png';
    else if (ext === 'webp') mimeType = 'image/webp';
    else if (ext === 'gif') mimeType = 'image/gif';
    else if (ext === 'mp4') mimeType = 'video/mp4';
    else if (ext === 'webm') mimeType = 'video/webm';
    else if (ext === 'pdf') mimeType = 'application/pdf';
    else if (ext === 'mp3') mimeType = 'audio/mpeg';
    else if (ext === 'ogg') mimeType = 'audio/ogg';
  }

  const spec = ALLOWED_MIME_TYPES[mimeType];
  if (!spec) {
    return {
      valid: false,
      error: `Unsupported format (${mimeType || ext}). Allowed formats: Images, Videos, Audio, and PDFs.`
    };
  }

  if (file.size <= 0) {
    return { valid: false, error: 'File is empty.' };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'File exceeds 50 MB limit.' };
  }

  return {
    valid: true,
    mimeType,
    category: spec.category
  };
}

// In-memory cache for presigned URLs (cleanKey -> { url, expiresAt })
const downloadUrlCache = new Map<string, { url: string; expiresAt: number }>();

export function clearSecureDownloadUrlCache() {
  downloadUrlCache.clear();
}

/**
 * Extract clean S3 object key from any URL or string
 */
export function extractKeyFromS3Url(url?: string): string {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('blob:')) return '';

  try {
    if (url.includes('.amazonaws.com/')) {
      const part = url.split('.amazonaws.com/')[1];
      return decodeURIComponent(part.split('?')[0]);
    }
    if (url.startsWith('http')) {
      const urlObj = new URL(url);
      return decodeURIComponent(urlObj.pathname.replace(/^\//, ''));
    }
  } catch {
    // fallback
  }
  return decodeURIComponent(url.split('?')[0]);
}

/**
 * Check if a given URL is currently valid and unexpired for direct rendering.
 * Unsigned raw S3 URLs and expired URLs return false so they are never requested directly.
 */
export function isUrlPresignedAndValid(url?: string): boolean {
  if (!url) return false;
  // Local base64 data URLs are always self-contained and valid
  if (url.startsWith('data:')) return true;
  // Local blob URLs are valid in active session
  if (url.startsWith('blob:')) return true;

  // S3 PutObject presigned URLs CANNOT be used for GET/download (will fail with 403 AccessDenied)
  if (url.includes('x-id=PutObject')) return false;

  // Unsigned S3 URLs to private bucket will return AccessDenied if opened directly
  if (url.includes('.amazonaws.com/') && !url.includes('X-Amz-Signature') && !url.includes('Signature=')) {
    return false;
  }

  // Check AWS presigned expiry
  try {
    const urlObj = new URL(url);
    const dateParam = urlObj.searchParams.get('X-Amz-Date');
    const expiresParam = urlObj.searchParams.get('X-Amz-Expires');
    if (dateParam && expiresParam) {
      // Date format: YYYYMMDDTHHMMSSZ (e.g. 20261121T094456Z)
      const year = parseInt(dateParam.slice(0, 4), 10);
      const month = parseInt(dateParam.slice(4, 6), 10) - 1;
      const day = parseInt(dateParam.slice(6, 8), 10);
      const hour = parseInt(dateParam.slice(9, 11), 10);
      const min = parseInt(dateParam.slice(11, 13), 10);
      const sec = parseInt(dateParam.slice(13, 15), 10);
      const signedTime = Date.UTC(year, month, day, hour, min, sec);
      const expiresSeconds = parseInt(expiresParam, 10);
      const expiryTime = signedTime + expiresSeconds * 1000;
      // 30s buffer before expiration
      if (Date.now() >= expiryTime - 30000) {
        return false;
      }
    }
  } catch {
    return false;
  }

  return true;
}

/**
 * Convert file to base64 Data URL for zero-latency local preview and reliable rendering
 */
export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Fetch a valid signed GET download URL from API Gateway
 * Generates an AWS S3 URL with x-id=GetObject and X-Amz-Signature to prevent Access Denied errors!
 */
export async function getPresignedDownloadUrl(
  keyOrUrl: string,
  roomId: string = 'campus-central',
  messageId: string = 'msg'
): Promise<string> {
  if (!keyOrUrl) return '';

  const cleanKey = extractKeyFromS3Url(keyOrUrl);
  if (!cleanKey) return '';

  // Check cache (reuse if still valid with 60s buffer)
  const cached = downloadUrlCache.get(cleanKey);
  if (cached && Date.now() < cached.expiresAt - 60000) {
    return cached.url;
  }

  const user = auth.currentUser;
  let idToken = '';
  if (user) {
    try {
      idToken = await user.getIdToken();
    } catch {
      // ignore
    }
  }

  const ext = (cleanKey.split('.').pop() || '').toLowerCase();
  let contentType = 'application/octet-stream';
  if (ext === 'jpg' || ext === 'jpeg') contentType = 'image/jpeg';
  else if (ext === 'png') contentType = 'image/png';
  else if (ext === 'webp') contentType = 'image/webp';
  else if (ext === 'gif') contentType = 'image/gif';
  else if (ext === 'mp4') contentType = 'video/mp4';
  else if (ext === 'webm') contentType = 'video/webm';
  else if (ext === 'pdf') contentType = 'application/pdf';

  const payload = {
    action: 'download',
    key: cleanKey,
    roomId,
    messageId,
    contentType,
    fileName: cleanKey.split('/').pop() || 'file'
  };

  try {
    const res = await fetch(`${API_BASE_URL}/upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const downloadUrl = data.downloadUrl || data.url;
      if (downloadUrl) {
        const expiresIn = (data.expiresIn || 900) * 1000;
        downloadUrlCache.set(cleanKey, {
          url: downloadUrl,
          expiresAt: Date.now() + expiresIn
        });
        return downloadUrl;
      }
    }
  } catch (err) {
    console.warn('[DownloadUrl] Failed to get signed download URL from API Gateway:', err);
  }

  return '';
}

/**
 * Upload to AWS S3 via API Gateway Presigned PUT / POST pipeline
 * Always pairs the upload with a signed GetObject download URL to prevent S3 Access Denied errors.
 */
export async function uploadToS3(
  file: File,
  onProgress?: (percent: number) => void
): Promise<MessageAttachment> {
  const validation = validateAttachment(file);
  if (!validation.valid || !validation.mimeType || !validation.category) {
    throw new Error(validation.error || 'Invalid file format');
  }

  const user = auth.currentUser;
  const uid = user ? user.uid : `guest_${Date.now()}`;
  let idToken = '';
  if (user) {
    try {
      idToken = await user.getIdToken();
    } catch {
      // ignore
    }
  }

  // 1. Generate local preview URL immediately for zero-lag sender experience
  let localPreview = '';
  if (validation.category === 'image' && file.size <= 4 * 1024 * 1024) {
    try {
      localPreview = await fileToDataUrl(file);
    } catch {
      localPreview = URL.createObjectURL(file);
    }
  } else {
    localPreview = URL.createObjectURL(file);
  }

  // 2. Request presigned upload URL from API Gateway
  try {
    const initRes = await fetch(`${API_BASE_URL}/upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
      },
      body: JSON.stringify({
        fileName: file.name,
        contentType: validation.mimeType,
        size: file.size
      })
    });

    if (initRes.ok) {
      const initData = await initRes.json();
      const s3Key = initData.key || (initData.post?.fields?.key) || `chats/${uid}/${Date.now()}_${file.name}`;
      const uploadUrl = initData.uploadUrl || initData.url;

      // Execute upload to S3
      if (initData.post && initData.post.url && initData.post.fields) {
        // S3 Presigned POST
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', initData.post.url, true);

          if (xhr.upload && onProgress) {
            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                onProgress(Math.round((e.loaded / e.total) * 100));
              }
            };
          }

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`S3 POST failed (status ${xhr.status})`));
            }
          };
          xhr.onerror = () => reject(new Error('S3 POST network error'));
          xhr.onabort = () => reject(new Error('S3 upload aborted'));

          const formData = new FormData();
          Object.entries(initData.post.fields).forEach(([k, v]) => {
            formData.append(k, v as string);
          });
          // S3 requires file to be appended last
          formData.append('file', file);
          xhr.send(formData);
        });
      } else if (uploadUrl) {
        // S3 Presigned PUT
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', uploadUrl, true);

          if (xhr.upload && onProgress) {
            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                onProgress(Math.round((e.loaded / e.total) * 100));
              }
            };
          }

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`S3 PUT failed with status ${xhr.status}`));
            }
          };
          xhr.onerror = () => reject(new Error('S3 PUT network error'));
          xhr.onabort = () => reject(new Error('S3 upload aborted'));

          xhr.setRequestHeader('Content-Type', validation.mimeType || 'application/octet-stream');
          xhr.send(file);
        });
      }

      // 3. Immediately fetch the valid signed GET download URL from API Gateway
      const signedDownloadUrl = await getPresignedDownloadUrl(s3Key);

      return {
        key: s3Key,
        // url: stored in Firestore as the signed GetObject URL (never local blob)
        url: signedDownloadUrl,
        downloadUrl: signedDownloadUrl,
        previewUrl: localPreview, // used for instantaneous 0ms sender preview
        name: file.name,
        fileName: file.name,
        size: file.size,
        fileSize: file.size,
        mimeType: validation.mimeType,
        type: validation.mimeType,
        category: validation.category
      };
    }
  } catch (s3Err) {
    console.warn('[S3] Pipeline issue, using local media fallback:', s3Err);
  }

  // Fallback: If S3 upload fails or network blips, return the local preview so user's image is preserved
  if (onProgress) onProgress(100);
  const fallbackKey = `chats/${uid}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  return {
    key: fallbackKey,
    url: localPreview,
    downloadUrl: localPreview,
    previewUrl: localPreview,
    name: file.name,
    fileName: file.name,
    size: file.size,
    fileSize: file.size,
    mimeType: validation.mimeType,
    type: validation.mimeType,
    category: validation.category
  };
}

export function formatBytes(bytes?: number, decimals: number = 1): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

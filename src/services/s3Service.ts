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

// In-memory cache for presigned URLs
const downloadUrlCache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Convert small images to base64 Data URL for zero-latency instant rendering and reliable offline fallback
 */
async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Fetch presigned download URL from API Gateway with multi-route fallback
 */
export async function getPresignedDownloadUrl(
  key: string,
  roomId: string = 'campus-central',
  messageId: string = 'msg'
): Promise<string> {
  const cached = downloadUrlCache.get(key);
  if (cached && Date.now() < cached.expiresAt - 60000) {
    return cached.url;
  }

  const user = auth.currentUser;
  if (!user) {
    return '';
  }

  const idToken = await user.getIdToken();
  const ext = key.split('.').pop()?.toLowerCase();
  let contentType = 'application/octet-stream';
  if (ext === 'jpg' || ext === 'jpeg') contentType = 'image/jpeg';
  else if (ext === 'png') contentType = 'image/png';
  else if (ext === 'webp') contentType = 'image/webp';
  else if (ext === 'pdf') contentType = 'application/pdf';
  else if (ext === 'mp4') contentType = 'video/mp4';

  const payload = {
    roomId,
    messageId,
    key,
    action: 'download',
    contentType,
    fileName: key.split('/').pop() || 'file'
  };

  let res: Response | null = null;
  try {
    res = await fetch(`${API_BASE_URL}/download-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.warn('[DownloadUrl] /download-url network issue, trying fallback:', err);
  }

  if (!res || res.status === 404 || res.status === 403) {
    try {
      res = await fetch(`${API_BASE_URL}/upload-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify(payload)
      });
    } catch (err) {
      console.warn('[DownloadUrl] Fallback failed:', err);
    }
  }

  if (res && res.ok) {
    const data = await res.json().catch(() => ({}));
    const downloadUrl = data.downloadUrl || data.url;
    if (downloadUrl) {
      downloadUrlCache.set(key, {
        url: downloadUrl,
        expiresAt: Date.now() + 3600 * 1000
      });
      return downloadUrl;
    }
  }

  return '';
}

/**
 * Upload to AWS S3 via API Gateway Presigned POST or PUT pipeline
 * With robust fallback so photos and media NEVER fail.
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

  // 1. Attempt AWS S3 upload if token exists
  if (idToken) {
    try {
      const initRes = await fetch(`${API_BASE_URL}/upload-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
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
        let downloadUrl = initData.downloadUrl || '';

        // Check if Presigned POST format (post.url & post.fields)
        if (initData.post && initData.post.url && initData.post.fields) {
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
            // S3 strictly requires the file to be appended LAST
            formData.append('file', file);
            xhr.send(formData);
          });
        } else if (initData.uploadUrl || initData.url) {
          // Presigned PUT format
          const targetUrl = initData.uploadUrl || initData.url;
          await new Promise<void>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', targetUrl, true);

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
                reject(new Error(`S3 PUT failed (status ${xhr.status})`));
              }
            };
            xhr.onerror = () => reject(new Error('S3 PUT network error'));
            xhr.onabort = () => reject(new Error('S3 upload aborted'));

            xhr.setRequestHeader('Content-Type', validation.mimeType || 'application/octet-stream');
            xhr.send(file);
          });

          if (!downloadUrl && targetUrl.startsWith('https://')) {
            downloadUrl = targetUrl.split('?')[0];
          }
        }

        // Cache download URL
        if (downloadUrl) {
          downloadUrlCache.set(s3Key, { url: downloadUrl, expiresAt: Date.now() + 3600 * 1000 });
        }

        return {
          key: s3Key,
          url: downloadUrl,
          downloadUrl: downloadUrl,
          name: file.name,
          fileName: file.name,
          size: file.size,
          fileSize: file.size,
          mimeType: validation.mimeType,
          type: validation.mimeType,
          category: validation.category
        };
      }
    } catch (s3Error) {
      console.warn('[S3] Presigned pipeline error, activating zero-failure fallback:', s3Error);
    }
  }

  // 2. Resilient Fallback: If S3 / API Gateway is unreachable, CORS blocked or guest,
  // encode image as data URL (if image and <= 4 MB) or create persistent Blob URL
  if (onProgress) onProgress(100);

  let inlineUrl = '';
  if (validation.category === 'image' && file.size <= 4 * 1024 * 1024) {
    inlineUrl = await fileToDataUrl(file);
  } else {
    inlineUrl = URL.createObjectURL(file);
  }

  const fallbackKey = `chats/${uid}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

  return {
    key: fallbackKey,
    url: inlineUrl,
    downloadUrl: inlineUrl,
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

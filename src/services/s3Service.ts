import { auth, functions, httpsCallable } from './firebase';
import { MessageAttachment } from '../types/chat.types';

const configuredMediaApi = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_MEDIA_API_URL?.trim();
const isLocalhost = typeof window !== 'undefined'
  && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const API_BASE_URL = configuredMediaApi
  ? configuredMediaApi.replace(/\/+$/, '')
  : (isLocalhost
    ? `http://${window.location.hostname || 'localhost'}:${Number(window.location.port) || 3001}/api/media`
    : 'https://0sz03xhubg.execute-api.ap-southeast-2.amazonaws.com/prod');

export async function ensureAuthReady(): Promise<void> {
  if (auth.currentUser) return;
  if (typeof (auth as unknown as { authStateReady?: () => Promise<void> }).authStateReady === 'function') {
    try {
      await (auth as unknown as { authStateReady: () => Promise<void> }).authStateReady();
    } catch {
      // ignore
    }
  }
}
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

const MIME_TYPES_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  m4a: 'audio/mp4', mp3: 'audio/mpeg', ogg: 'audio/ogg', pdf: 'application/pdf'
};

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
  if (!mimeType || mimeType === 'application/octet-stream') {
    mimeType = MIME_TYPES_BY_EXTENSION[ext] || mimeType;
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
      const cleanPart = decodeURIComponent(part.split('?')[0]);
      // If path-style URL (e.g. s3.amazonaws.com/bucket-name/key), strip leading bucket segment
      try {
        const urlObj = new URL(url);
        if (urlObj.hostname.startsWith('s3.') || urlObj.hostname === 's3.amazonaws.com') {
          const segments = cleanPart.split('/');
          if (segments.length > 1) {
            segments.shift();
            return segments.join('/');
          }
        }
      } catch {
        // ignore
      }
      return cleanPart;
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
  const lowerUrl = url.toLowerCase();
  if (url.includes('.amazonaws.com/') && !lowerUrl.includes('x-amz-signature') && !lowerUrl.includes('signature=')) {
    return false;
  }

  // Check AWS presigned expiry (supports both case-sensitive and case-insensitive query parameters)
  try {
    const urlObj = new URL(url);
    const dateParam = urlObj.searchParams.get('X-Amz-Date') || urlObj.searchParams.get('x-amz-date');
    const expiresParam = urlObj.searchParams.get('X-Amz-Expires') || urlObj.searchParams.get('x-amz-expires');
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
 * Convert file to base64 Data URL when a local preview is explicitly needed.
 */
export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function inferAttachmentCategory(
  mimeType?: string,
  fileName?: string
): MessageAttachment['category'] {
  const mime = (mimeType || '').toLowerCase();
  const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'pdf';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return 'image';
  if (['mp4', 'mov'].includes(ext)) return 'video';
  if (['mp3', 'ogg', 'm4a', 'wav'].includes(ext)) return 'audio';
  if (ext === 'pdf') return 'pdf';
  return 'file';
}

function contentTypeForKey(cleanKey: string): string {
  const ext = (cleanKey.split('.').pop() || '').toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'mp4') return 'video/mp4';
  if (ext === 'webm') return 'video/webm';
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'ogg') return 'audio/ogg';
  if (ext === 'm4a') return 'audio/mp4';
  if (ext === 'pdf') return 'application/pdf';
  return 'application/octet-stream';
}

/** A URL that can be opened with GET. PutObject signatures always 403 on open. */
export function isOpenableS3Url(url?: string): boolean {
  if (!url) return false;
  if (url.startsWith('data:') || url.startsWith('blob:')) return true;
  if (url.includes('x-id=PutObject')) return false;
  return isUrlPresignedAndValid(url);
}

function pickGetObjectUrl(data: Record<string, unknown>, uploadUrlToIgnore?: string): string {
  const candidates = [
    data.downloadUrl,
    data.getObjectUrl,
    data.getUrl,
    data.presignedUrl,
    data.signedUrl,
    data.url
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate) continue;
    if (uploadUrlToIgnore && candidate === uploadUrlToIgnore) continue;
    if (candidate.includes('x-id=PutObject')) continue;
    if (isUrlPresignedAndValid(candidate)) return candidate;
  }
  return '';
}

function unwrapApiPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  let payload = value as Record<string, unknown>;

  // Support API Gateway proxy responses as well as direct Lambda JSON responses.
  if (typeof payload.body === 'string') {
    try {
      const body = JSON.parse(payload.body) as unknown;
      if (body && typeof body === 'object' && !Array.isArray(body)) {
        payload = { ...payload, ...(body as Record<string, unknown>) };
      }
    } catch {
      payload = { ...payload, message: payload.body };
    }
  }
  if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    payload = { ...payload, ...(payload.data as Record<string, unknown>) };
  }
  return payload;
}

async function readApiPayload(response: Response): Promise<Record<string, unknown>> {
  const responseText = await response.text();
  if (!responseText) return {};
  try {
    return unwrapApiPayload(JSON.parse(responseText) as unknown);
  } catch {
    return { message: responseText.slice(0, 300) };
  }
}

function responseErrorMessage(payload: Record<string, unknown>, status: number): string {
  const detail = payload.error || payload.message;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();
  if (status === 401) return 'Your sign-in session expired. Please sign in again.';
  if (status === 403) return 'Your account is not authorized to upload this file.';
  return `Upload request failed (HTTP ${status}).`;
}

function s3XhrError(operation: 'PUT' | 'POST', xhr: XMLHttpRequest): Error {
  const detail = (xhr.responseText || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
  return new Error(`S3 ${operation} rejected (HTTP ${xhr.status || 'network error'})${detail ? `: ${detail}` : ''}`);
}

/**
 * Fetch a valid signed GET download URL from API Gateway.
 * Upload (PutObject) URLs are rejected — opening them returns S3 AccessDenied.
 */
export async function getPresignedDownloadUrl(
  keyOrUrl: string,
  roomId: string = 'campus-central',
  messageId: string = 'msg',
  forceRefresh: boolean = false,
  attachmentDetails?: { fileName?: string; mimeType?: string }
): Promise<string> {
  if (!keyOrUrl) return '';

  const cleanKey = extractKeyFromS3Url(keyOrUrl);
  if (!cleanKey) return '';

  if (forceRefresh) {
    downloadUrlCache.delete(cleanKey);
  }

  const cached = downloadUrlCache.get(cleanKey);
  if (cached && isOpenableS3Url(cached.url) && Date.now() < cached.expiresAt - 60000) {
    return cached.url;
  }
  downloadUrlCache.delete(cleanKey);

  // Ensure Firebase Auth has finished resolving initial state
  await ensureAuthReady();
  const user = auth.currentUser;
  let idToken = '';
  if (user) {
    try {
      idToken = await user.getIdToken(forceRefresh);
    } catch {
      try {
        idToken = await user.getIdToken();
      } catch {
        // unsigned request still attempted; API may allow it
      }
    }
  }

  const fileName = attachmentDetails?.fileName || cleanKey.split('/').pop() || 'file';
  const payload = {
    action: 'download',
    key: cleanKey,
    roomId,
    messageId,
    contentType: attachmentDetails?.mimeType || contentTypeForKey(cleanKey),
    fileName,
    disposition: 'inline'
  };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (idToken) headers.Authorization = `Bearer ${idToken}`;

  // Candidate routes: configured API_BASE_URL, dedicated /download-url, /upload-url, and local /api/media proxy
  const candidateEndpoints = Array.from(new Set([
    `${API_BASE_URL}/download-url`,
    `${API_BASE_URL}/upload-url`,
    '/api/media/download-url',
    '/api/media/upload-url'
  ]));

  for (const endpoint of candidateEndpoints) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        continue;
      }
      const data = await readApiPayload(res);
      const downloadUrl = pickGetObjectUrl(data);
      if (!downloadUrl) {
        continue;
      }
      const expiresInSec = typeof data.expiresIn === 'number' ? data.expiresIn : 900;
      downloadUrlCache.set(cleanKey, {
        url: downloadUrl,
        expiresAt: Date.now() + expiresInSec * 1000
      });
      return downloadUrl;
    } catch {
      // try next candidate endpoint
    }
  }

  // Cloud Function fallback: handles CORS and authenticated token exchange directly
  try {
    const getMediaFn = httpsCallable<typeof payload, { downloadUrl?: string; expiresIn?: number }>(
      functions,
      'getMediaDownloadUrl'
    );
    const result = await getMediaFn(payload);
    if (result?.data?.downloadUrl && isOpenableS3Url(result.data.downloadUrl)) {
      const downloadUrl = result.data.downloadUrl;
      const expiresInSec = typeof result.data.expiresIn === 'number' ? result.data.expiresIn : 900;
      downloadUrlCache.set(cleanKey, {
        url: downloadUrl,
        expiresAt: Date.now() + expiresInSec * 1000
      });
      return downloadUrl;
    }
  } catch (fnErr) {
    console.warn('[DownloadUrl] Cloud Function fallback attempt:', fnErr);
  }

  return '';
}

/**
 * Upload to AWS S3 via API Gateway Presigned PUT / POST pipeline.
 * The message viewer requests a signed GetObject URL after the Firestore message is saved.
 */
export async function uploadToS3(
  file: File,
  onProgress?: (percent: number) => void
): Promise<MessageAttachment> {
  const validation = validateAttachment(file);
  if (!validation.valid || !validation.mimeType || !validation.category) {
    throw new Error(validation.error || 'Invalid file format');
  }

  await ensureAuthReady();
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Your sign-in session is not ready. Please sign in again before uploading.');
  }
  let idToken = '';
  try {
    idToken = await user.getIdToken();
  } catch {
    throw new Error('Could not refresh your sign-in session. Please sign in again before uploading.');
  }

  // Request a presigned upload URL from candidate endpoints
  try {
    const uploadEndpoints = Array.from(new Set([
      `${API_BASE_URL}/upload-url`,
      '/api/media/upload-url'
    ]));

    let initRes: Response | null = null;
    let initData: Record<string, unknown> = {};

    const uploadPayload = {
      fileName: file.name,
      contentType: validation.mimeType,
      size: file.size
    };

    for (const endpoint of uploadEndpoints) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(idToken ? { 'Authorization': `Bearer ${idToken}` } : {})
          },
          body: JSON.stringify(uploadPayload)
        });
        if (res.ok) {
          initRes = res;
          initData = await readApiPayload(res);
          break;
        }
      } catch {
        // try next endpoint
      }
    }

    // Cloud Function fallback for upload URL
    if (!initRes || !initRes.ok) {
      try {
        const getUploadFn = httpsCallable<typeof uploadPayload, Record<string, unknown>>(
          functions,
          'getMediaUploadUrl'
        );
        const fnRes = await getUploadFn(uploadPayload);
        if (fnRes?.data && typeof fnRes.data === 'object') {
          initData = unwrapApiPayload(fnRes.data);
          initRes = { ok: true, status: 200 } as unknown as Response;
        }
      } catch (fnErr) {
        console.warn('[UploadToS3] Cloud Function upload authorization fallback attempt:', fnErr);
      }
    }

    if (initRes && initRes.ok) {
      const rawPost = initData.post || initData.presignedPost;
      const postData = rawPost && typeof rawPost === 'object'
        ? rawPost as Record<string, unknown>
        : initData.fields && initData.url
          ? { url: initData.url, fields: initData.fields }
          : null;
      const postUrl = typeof postData?.url === 'string' ? postData.url : '';
      const postFields = postData?.fields && typeof postData.fields === 'object'
        ? postData.fields as Record<string, unknown>
        : null;
      const uploadUrl = typeof initData.uploadUrl === 'string'
        ? initData.uploadUrl
        : typeof initData.putUrl === 'string'
          ? initData.putUrl
          : !postData && typeof initData.url === 'string'
            ? initData.url
            : '';
      const s3Key = (typeof initData.key === 'string' ? initData.key : '')
        || (typeof postFields?.key === 'string' ? postFields.key : '')
        || extractKeyFromS3Url(uploadUrl);

      // Execute upload to S3
      if (postUrl && postFields) {
        // S3 Presigned POST
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', postUrl, true);

          if (xhr.upload && onProgress) {
            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                onProgress(Math.round((e.loaded / e.total) * 100));
              }
            };
          }

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              onProgress?.(100);
              resolve();
            } else {
              reject(s3XhrError('POST', xhr));
            }
          };
          xhr.onerror = () => reject(new Error('S3 POST network/CORS error. Check the bucket CORS settings and allowed origin.'));
          xhr.onabort = () => reject(new Error('S3 upload aborted'));

          const formData = new FormData();
          Object.entries(postFields).forEach(([k, v]) => {
            formData.append(k, typeof v === 'string' ? v : String(v));
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
              onProgress?.(100);
              resolve();
            } else {
              reject(s3XhrError('PUT', xhr));
            }
          };
          xhr.onerror = () => reject(new Error('S3 PUT network/CORS error. Check the bucket CORS settings and allowed origin.'));
          xhr.onabort = () => reject(new Error('S3 upload aborted'));

          xhr.setRequestHeader('Content-Type', validation.mimeType || 'application/octet-stream');
          xhr.send(file);
        });
      }

      if (!s3Key || (!(postUrl && postFields) && !uploadUrl)) {
        throw new Error('Upload service did not return an S3 upload URL.');
      }

      // Keep a GetObject URL only when the upload endpoint returned one. If it
      // did not, the message viewer requests one with the persisted room/message IDs.
      const signedDownloadUrl = pickGetObjectUrl(initData, uploadUrl || postUrl);

      return {
        key: s3Key,
        url: signedDownloadUrl,
        downloadUrl: signedDownloadUrl,
        name: file.name,
        fileName: file.name,
        size: file.size,
        fileSize: file.size,
        mimeType: validation.mimeType,
        type: validation.mimeType,
        category: validation.category
      };
    }

    throw new Error(responseErrorMessage(initData, initRes ? initRes.status : 500));
  } catch (s3Err) {
    console.error('[S3] Upload failed:', s3Err);
    if (s3Err instanceof TypeError) {
      throw new Error('Could not reach the upload service. Check API Gateway and S3 CORS/network settings.');
    }
    throw s3Err instanceof Error ? s3Err : new Error('Could not upload the file to S3.');
  }
}

export function formatBytes(bytes?: number, decimals: number = 1): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

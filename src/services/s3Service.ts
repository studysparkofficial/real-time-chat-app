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

// Dangerous executable extensions blacklist
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

  // Extension check
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return { valid: false, error: `Executable or script files (.${ext}) are strictly blocked for security.` };
  }

  let mimeType = (file.type || '').toLowerCase();
  if (!mimeType) {
    // Inferred mime
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
      error: `Unsupported file format (${mimeType || ext}). Allowed formats: Images, Videos, Voice Notes, and PDFs.`
    };
  }

  if (file.size <= 0) {
    return { valid: false, error: 'File is empty (0 bytes).' };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File exceeds the maximum enterprise limit of 50 MB.` };
  }

  return {
    valid: true,
    mimeType,
    category: spec.category
  };
}

// In-memory presigned URL cache
const downloadUrlCache = new Map<string, { url: string; expiresAt: number }>();

export async function getPresignedDownloadUrl(key: string): Promise<string> {
  const cached = downloadUrlCache.get(key);
  if (cached && Date.now() < cached.expiresAt - 60000) {
    return cached.url;
  }

  const user = auth.currentUser;
  if (!user) {
    throw new Error('User authentication required to access attachments.');
  }

  const idToken = await user.getIdToken();
  const res = await fetch(`${API_BASE_URL}/download-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({ key })
  });

  if (!res.ok) {
    throw new Error(`Failed to retrieve download link: ${res.statusText}`);
  }

  const data = await res.json();
  const url = data.downloadUrl || data.url;
  if (!url) {
    throw new Error('No download URL returned by media service.');
  }

  downloadUrlCache.set(key, {
    url,
    expiresAt: Date.now() + 3600 * 1000 // 1 hour TTL
  });

  return url;
}

/**
 * Uploads a file directly to AWS S3 using API Gateway presigned pipeline
 */
export async function uploadToS3(
  file: File,
  onProgress?: (percent: number) => void
): Promise<MessageAttachment> {
  const validation = validateAttachment(file);
  if (!validation.valid || !validation.mimeType || !validation.category) {
    throw new Error(validation.error || 'Invalid file');
  }

  const user = auth.currentUser;
  if (!user) {
    throw new Error('Sign in required to upload files.');
  }

  const idToken = await user.getIdToken();

  // 1. Request presigned upload URL
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

  if (!initRes.ok) {
    const errorText = await initRes.text();
    throw new Error(`Upload authorization failed: ${errorText || initRes.statusText}`);
  }

  const initData = await initRes.json();
  const uploadUrl = initData.uploadUrl || initData.url;
  const s3Key = initData.key || `chats/${user.uid}/${Date.now()}_${file.name}`;
  const method = (initData.method || 'PUT').toUpperCase();

  // 2. Upload file directly to S3 via XHR for real-time progress
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, uploadUrl, true);

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`S3 upload rejected with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during file upload to S3.'));
    xhr.onabort = () => reject(new Error('File upload was aborted.'));

    if (method === 'POST' && initData.fields) {
      const formData = new FormData();
      Object.entries(initData.fields).forEach(([k, v]) => {
        formData.append(k, v as string);
      });
      formData.append('file', file);
      xhr.send(formData);
    } else {
      // Direct PUT
      xhr.setRequestHeader('Content-Type', validation.mimeType || 'application/octet-stream');
      xhr.send(file);
    }
  });

  // Try to seed download URL if returned
  let initialUrl = initData.downloadUrl;
  if (!initialUrl && uploadUrl.startsWith('https://')) {
    // If it's a direct presigned PUT URL without query params
    initialUrl = uploadUrl.split('?')[0];
  }

  return {
    key: s3Key,
    url: initialUrl,
    downloadUrl: initialUrl,
    fileName: file.name,
    fileSize: file.size,
    mimeType: validation.mimeType,
    category: validation.category
  };
}

export function formatBytes(bytes: number, decimals: number = 1): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

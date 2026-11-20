/**
 * Reusable Attachment Upload & Download Service
 * Connects PulseChat with AWS S3 + API Gateway
 * Features:
 * - 50 MB max file validation & MIME type checking
 * - Presigned URL / Presigned POST retrieval with Firebase Bearer Auth
 * - Direct S3 upload with accurate XMLHttpRequest progress tracking
 * - Presigned GET download URLs with client-side caching & route fallback
 */

export const ALLOWED_MIME_TYPES = {
  'image/jpeg': { ext: 'jpg', label: 'JPEG Image', type: 'image' },
  'image/png': { ext: 'png', label: 'PNG Image', type: 'image' },
  'image/webp': { ext: 'webp', label: 'WebP Image', type: 'image' },
  'video/mp4': { ext: 'mp4', label: 'MP4 Video', type: 'video' },
  'video/webm': { ext: 'webm', label: 'WebM Video', type: 'video' },
  'application/pdf': { ext: 'pdf', label: 'PDF Document', type: 'pdf' }
};

export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
export const API_BASE_URL = 'https://0sz03xhubg.execute-api.ap-southeast-2.amazonaws.com/prod';

// Client-side presigned download URL cache (key -> { url, expiresAt })
const downloadUrlCache = new Map();

export function clearSecureDownloadUrlCache() {
  downloadUrlCache.clear();
}

/**
 * Format bytes to human readable string (KB, MB)
 */
export function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Determine category (image, video, pdf, file)
 */
export function getAttachmentCategory(mimeType) {
  if (!mimeType) return 'file';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'application/pdf') return 'pdf';
  return 'file';
}

/**
 * Validate a user selected file against allowed MIME types and 50 MB limit
 */
export function validateAttachmentFile(file) {
  if (!file) {
    return { valid: false, error: 'No file selected.' };
  }

  // Normalize MIME type
  let mimeType = (file.type || '').toLowerCase();

  // Fallback MIME inference by extension if browser left type empty
  if (!mimeType && file.name) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
    else if (ext === 'png') mimeType = 'image/png';
    else if (ext === 'webp') mimeType = 'image/webp';
    else if (ext === 'mp4') mimeType = 'video/mp4';
    else if (ext === 'webm') mimeType = 'video/webm';
    else if (ext === 'pdf') mimeType = 'application/pdf';
  }

  if (!ALLOWED_MIME_TYPES[mimeType]) {
    return {
      valid: false,
      error: `Unsupported file format (${mimeType || 'unknown'}). Supported formats: JPEG, PNG, WebP, MP4, WebM, and PDF.`
    };
  }

  if (file.size <= 0) {
    return { valid: false, error: 'File appears to be empty (0 bytes).' };
  }

  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size (${formatBytes(file.size)}) exceeds the maximum limit of 50 MB.`
    };
  }

  if (file.name && file.name.length > 200) {
    return { valid: false, error: 'Filename is too long (maximum 200 characters).' };
  }

  return {
    valid: true,
    mimeType,
    category: getAttachmentCategory(mimeType)
  };
}

/**
 * Request an S3 upload authorization (presigned PUT or presigned POST)
 */
export async function requestUploadAuthorization(file, idToken) {
  if (!idToken) {
    throw new Error('Authentication required. Please sign in first.');
  }

  const validation = validateAttachmentFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const endpoint = `${API_BASE_URL}/upload-url`;

  let response;
  try {
    response = await fetch(endpoint, {
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
  } catch (networkErr) {
    console.error('API Gateway request failed:', networkErr);
    if (networkErr.message && (networkErr.message.includes('fetch') || networkErr.name === 'TypeError')) {
      throw new Error('API Gateway CORS blocked: please enable CORS on API Gateway (JNUCampusConnectMediaAPI).');
    }
    throw networkErr;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error(data.error || 'Your login session has expired. Please sign in again.');
    }
    if (response.status === 403) {
      throw new Error(data.error || 'Your account is not authorized to upload this file.');
    }
    throw new Error(data.error || `Upload request failed with status ${response.status}`);
  }

  if (!data.key || (!data.uploadUrl && !data.post)) {
    throw new Error('Invalid upload parameters returned from server.');
  }

  return data;
}

/**
 * Upload file directly to S3 with live progress callbacks
 * Supports Presigned POST (strict size enforcement) or Presigned PUT
 */
export function uploadFileToS3(uploadData, file, onProgress, contentType = file.type || 'application/octet-stream') {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        if (onProgress) onProgress(percent, e.loaded, e.total);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({
          success: true,
          key: uploadData.key,
          size: file.size,
          name: file.name,
          mimeType: contentType
        });
      } else {
        let msg = `S3 upload failed (HTTP ${xhr.status})`;
        if (xhr.status === 400 && xhr.responseText && xhr.responseText.includes('EntityTooLarge')) {
          msg = 'File rejected by S3: exceeds 50 MB limit.';
        }
        reject(new Error(msg));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload to S3. Check connection and S3 CORS settings.'));
    });

    xhr.addEventListener('abort', () => {
      reject(new Error('Upload was cancelled.'));
    });

    // 1. Prefer Presigned POST if available (strictly enforces content-length-range at S3 policy level)
    if (uploadData.post && uploadData.post.url && uploadData.post.fields) {
      xhr.open('POST', uploadData.post.url, true);

      const formData = new FormData();
      Object.entries(uploadData.post.fields).forEach(([k, v]) => {
        formData.append(k, v);
      });
      // S3 requires the file to be appended last in the FormData
      formData.append('file', file);

      xhr.send(formData);
    } else if (uploadData.uploadUrl) {
      // 2. Presigned PUT fallback
      xhr.open('PUT', uploadData.uploadUrl, true);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.send(file);
    } else {
      reject(new Error('No valid upload URL or form parameters provided.'));
    }
  });
}

/**
 * Securely fetch a presigned GET download URL for an attachment
 * Checks local memory cache before hitting backend API
 */
export async function getSecureDownloadUrl(roomId, messageId, key, idToken, userId = 'anonymous') {
  if (!key) return null;

  // Check cache
  const cacheKey = `${userId}:${key}`;
  const cached = downloadUrlCache.get(cacheKey);
  if (cached && (cached.expiresAt - Date.now() > 30000)) {
    return cached.url;
  }

  if (!idToken) {
    throw new Error('Authentication required to view attachment.');
  }

  // Request download URL from backend
  const payload = {
    roomId,
    messageId,
    key,
    action: 'download' // Fallback flag in case API Gateway routes to upload-url handler
  };

  let response;
  // First attempt: POST /download-url
  try {
    response = await fetch(`${API_BASE_URL}/download-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    // network issue
  }

  // If /download-url returned 404 (route not registered on API Gateway yet),
  // fall back seamlessly to POST /upload-url which dispatches by body.action === 'download'
  if (!response || response.status === 404) {
    response = await fetch(`${API_BASE_URL}/upload-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify(payload)
    });
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Unable to load attachment (HTTP ${response.status})`);
  }

  if (!data.downloadUrl) {
    throw new Error('Download URL was not generated.');
  }

  // Cache download URL (expire 30s before presigned expiry)
  const ttl = (data.expiresIn || 300) * 1000;
  downloadUrlCache.set(cacheKey, {
    url: data.downloadUrl,
    expiresAt: Date.now() + ttl
  });

  return data.downloadUrl;
}

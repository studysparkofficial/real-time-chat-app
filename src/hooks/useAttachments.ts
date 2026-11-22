import { useState, useRef, useCallback, useEffect } from 'react';
import {
  uploadToS3,
  validateAttachment,
  ALLOWED_MIME_TYPES
} from '../services/s3Service';
import { MessageAttachment } from '../types/chat.types';

export function useAttachments() {
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [stagedPreview, setStagedPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Audio Voice Note Recording State
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeUploadsRef = useRef(0);

  // Clean up object URLs to avoid memory leaks
  useEffect(() => {
    return () => {
      if (stagedPreview && stagedPreview.startsWith('blob:')) {
        URL.revokeObjectURL(stagedPreview);
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [stagedPreview]);

  // Stage a file for review before sending
  const stageFile = useCallback((file: File) => {
    setUploadError(null);
    const validation = validateAttachment(file);
    if (!validation.valid) {
      setUploadError(validation.error || 'Invalid file format or size');
      return false;
    }

    setStagedFile(file);

    // Generate local preview if image or video
    if (validation.category === 'image' || validation.category === 'video') {
      const previewUrl = URL.createObjectURL(file);
      setStagedPreview(previewUrl);
    } else {
      setStagedPreview(null);
    }

    return true;
  }, []);

  const clearStagedFile = useCallback(() => {
    if (stagedPreview && stagedPreview.startsWith('blob:')) {
      URL.revokeObjectURL(stagedPreview);
    }
    setStagedFile(null);
    setStagedPreview(null);
    setUploadError(null);
  }, [stagedPreview]);

  // Clipboard Paste handler (Ctrl+V / Cmd+V for screenshots)
  const handleClipboardPaste = useCallback(
    (e: React.ClipboardEvent | ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) {
            // Rename pasted screenshot with readable timestamp
            const namedFile = new File(
              [file],
              `screenshot_${new Date().toISOString().replace(/[:.]/g, '-')}.png`,
              { type: 'image/png' }
            );
            stageFile(namedFile);
            e.preventDefault();
            break;
          }
        }
      }
    },
    [stageFile]
  );

  // Voice Note Recording
  const startRecording = useCallback(async () => {
    setUploadError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setUploadError('Microphone audio recording not supported on this device.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.start(100);
      setIsRecording(true);
      setRecordingSeconds(0);

      timerIntervalRef.current = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('[AudioRecord] Microphone access denied:', err);
      setUploadError('Microphone access denied or unavailable.');
    }
  }, []);

  const stopRecording = useCallback((): Promise<File | null> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        setIsRecording(false);
        resolve(null);
        return;
      }

      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }

      const recorder = mediaRecorderRef.current;
      recorder.onstop = () => {
        // Stop audio tracks
        recorder.stream.getTracks().forEach((track) => track.stop());

        const mimeType = recorder.mimeType || 'audio/webm';
        const ext = ALLOWED_MIME_TYPES[mimeType]?.ext || 'webm';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const voiceFile = new File(
          [blob],
          `voice_note_${Date.now()}.${ext}`,
          { type: mimeType }
        );

        setIsRecording(false);
        setRecordingSeconds(0);
        stageFile(voiceFile);
        resolve(voiceFile);
      };

      recorder.stop();
    });
  }, [stageFile]);

  const cancelRecording = useCallback(() => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    if (mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current.stop();
      } catch {
        // ignore
      }
    }
    setIsRecording(false);
    setRecordingSeconds(0);
    audioChunksRef.current = [];
  }, []);

  // Upload file to S3
  const uploadCurrentAttachment = useCallback(
    async (
      fileToUpload?: File,
      onProgress?: (percent: number) => void
    ): Promise<MessageAttachment> => {
      const file = fileToUpload || stagedFile;
      if (!file) {
        throw new Error('No file staged for upload.');
      }

      activeUploadsRef.current += 1;
      setIsUploading(true);
      setUploadError(null);

      try {
        const attachment = await uploadToS3(file, (percent) => {
          onProgress?.(percent);
        });
        return attachment;
      } catch (err: unknown) {
        const error = err as Error;
        setUploadError(error.message || 'Upload failed');
        throw error;
      } finally {
        activeUploadsRef.current = Math.max(0, activeUploadsRef.current - 1);
        setIsUploading(activeUploadsRef.current > 0);
      }
    },
    [stagedFile]
  );

  return {
    stagedFile,
    stagedPreview,
    isUploading,
    uploadError,
    isRecording,
    recordingSeconds,
    stageFile,
    clearStagedFile,
    handleClipboardPaste,
    startRecording,
    stopRecording,
    cancelRecording,
    uploadCurrentAttachment
  };
}

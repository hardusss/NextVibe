import * as FileSystem from 'expo-file-system/legacy';
import { Video } from 'react-native-compressor';
import BackgroundUploadService from './BackgroundUploadService';
import { sendWebSocketMessage } from '../api/chat';

export interface UploadTask {
  uploadId: string;
  chatId: number;
  clientMsgId: string;
  targetUserId?: number;
  replyToId?: number;
  messageText: string;
  mediaFiles: Array<{
    uri: string;
    type?: string;
    mimeType?: string;
    name?: string;
    fileName?: string;
  }>;
  progressPercent: number;
  statusText: string;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  error?: string;
}

type UploadProgressListener = (task: UploadTask) => void;

class MediaUploadManager {
  private static instance: MediaUploadManager;
  private tasks: Map<string, UploadTask> = new Map();
  private listeners: Set<UploadProgressListener> = new Set();
  private isProcessing: boolean = false;
  private taskQueue: string[] = [];

  private constructor() {}

  public static getInstance(): MediaUploadManager {
    if (!MediaUploadManager.instance) {
      MediaUploadManager.instance = new MediaUploadManager();
    }
    return MediaUploadManager.instance;
  }

  public addListener(listener: UploadProgressListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(task: UploadTask) {
    this.listeners.forEach((listener) => {
      try {
        listener(task);
      } catch (err) {
        console.warn('[MediaUploadManager] Listener error:', err);
      }
    });
  }

  public getTask(uploadId: string): UploadTask | undefined {
    return this.tasks.get(uploadId);
  }

  public enqueueUpload(params: {
    chatId: number;
    clientMsgId: string;
    messageText: string;
    mediaFiles: any[];
    replyToId?: number;
    targetUserId?: number;
  }): string {
    const uploadId = `upload_${params.clientMsgId}`;
    const task: UploadTask = {
      uploadId,
      chatId: params.chatId,
      clientMsgId: params.clientMsgId,
      targetUserId: params.targetUserId,
      replyToId: params.replyToId,
      messageText: params.messageText,
      mediaFiles: params.mediaFiles,
      progressPercent: 0,
      statusText: 'Queued for background upload...',
      status: 'pending',
    };

    this.tasks.set(uploadId, task);
    this.taskQueue.push(uploadId);
    this.notifyListeners(task);

    this.processQueue();
    return uploadId;
  }

  private async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.taskQueue.length > 0) {
      const uploadId = this.taskQueue.shift();
      if (!uploadId) continue;

      const task = this.tasks.get(uploadId);
      if (!task) continue;

      await this.executeUploadTask(task);
    }

    this.isProcessing = false;
  }

  private async executeUploadTask(task: UploadTask) {
    task.status = 'uploading';
    task.progressPercent = 2;
    task.statusText = 'Starting background upload...';
    this.notifyListeners(task);

    await BackgroundUploadService.startUpload(task.uploadId, task.mediaFiles.length);

    try {
      const preparedMedia: any[] = [];
      const totalFiles = task.mediaFiles.length;

      for (let i = 0; i < totalFiles; i++) {
        const file = task.mediaFiles[i];
        const filename = file.fileName || file.name || file.uri.split('/').pop() || `media_${Date.now()}_${i}.jpg`;
        let contentType = file.mimeType || file.type || '';

        const ext = filename.split('.').pop()?.toLowerCase();
        const isVideo = contentType.includes('video') || ext === 'mp4' || ext === 'mov';

        if (!contentType || contentType === 'image' || contentType === 'video') {
          if (ext === 'png') contentType = 'image/png';
          else if (ext === 'gif') contentType = 'image/gif';
          else if (ext === 'webp') contentType = 'image/webp';
          else if (isVideo) contentType = 'video/mp4';
          else contentType = 'image/jpeg';
        }

        let processUri = file.uri;
        const fileWeightStart = (i / totalFiles) * 80;
        const fileWeightEnd = ((i + 1) / totalFiles) * 80;

        if (isVideo) {
          try {
            task.statusText = `Compressing video ${i + 1}/${totalFiles}...`;
            this.notifyListeners(task);

            processUri = await Video.compress(
              file.uri,
              {
                compressionMethod: 'auto',
                maxSize: 1280,
              },
              (progress) => {
                const compPercent = Math.round(fileWeightStart + progress * (fileWeightEnd - fileWeightStart) * 0.5);
                task.progressPercent = compPercent;
                task.statusText = `Compressing video ${i + 1}/${totalFiles} (${Math.round(progress * 100)}%)`;
                BackgroundUploadService.updateUploadProgress(task.uploadId, compPercent, task.statusText);
                this.notifyListeners(task);
              }
            );
          } catch (compErr) {
            console.warn('[MediaUploadManager] Video compression fallback:', compErr);
            processUri = file.uri;
          }
        }

        task.statusText = `Processing file ${i + 1}/${totalFiles}...`;
        this.notifyListeners(task);

        const fileInfo = await FileSystem.getInfoAsync(processUri, { size: true });
        const sizeInBytes = fileInfo.exists && (fileInfo as any).size ? (fileInfo as any).size : 0;
        const sizeMB = sizeInBytes > 0 ? (sizeInBytes / (1024 * 1024)).toFixed(1) : '0';

        const base64Data = await FileSystem.readAsStringAsync(processUri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        preparedMedia.push({
          data: base64Data,
          type: contentType,
          name: filename,
        });

        const fileCompletePercent = Math.round(fileWeightEnd);
        task.progressPercent = fileCompletePercent;
        task.statusText = `Processed ${i + 1}/${totalFiles} (${sizeMB} MB)`;
        BackgroundUploadService.updateUploadProgress(task.uploadId, fileCompletePercent, task.statusText);
        this.notifyListeners(task);
      }

      task.progressPercent = 90;
      task.statusText = 'Encrypting & sending...';
      BackgroundUploadService.updateUploadProgress(task.uploadId, 90, task.statusText);
      this.notifyListeners(task);

      await sendWebSocketMessage(
        task.chatId,
        task.messageText,
        task.mediaFiles,
        task.replyToId,
        task.clientMsgId,
        task.targetUserId
      );

      task.status = 'completed';
      task.progressPercent = 100;
      task.statusText = 'Upload complete';
      BackgroundUploadService.notifyUploadComplete(task.uploadId, task.mediaFiles.length);
      this.notifyListeners(task);
    } catch (err: any) {
      console.error('[MediaUploadManager] Upload task error:', err);
      task.status = 'failed';
      task.error = err?.message || 'Upload failed';
      BackgroundUploadService.notifyUploadFailed(task.uploadId, task.error);
      this.notifyListeners(task);
    }
  }
}

export default MediaUploadManager.getInstance();

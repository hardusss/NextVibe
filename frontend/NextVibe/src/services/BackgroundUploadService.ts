import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

class BackgroundUploadService {
  private static instance: BackgroundUploadService;
  private activeUploads: Map<string, number> = new Map();

  private constructor() {
    this.setupNotificationChannel();
  }

  public static getInstance(): BackgroundUploadService {
    if (!BackgroundUploadService.instance) {
      BackgroundUploadService.instance = new BackgroundUploadService();
    }
    return BackgroundUploadService.instance;
  }

  private async setupNotificationChannel() {
    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('media-upload', {
          name: 'Media Upload Progress',
          importance: Notifications.AndroidImportance.LOW,
          vibrationPattern: [0],
          lightColor: '#a78bfa',
          showBadge: false,
        });
      } catch (e) {
        // Channel setup fallback
      }
    }
  }

  public async requestPermissions(): Promise<boolean> {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      return finalStatus === 'granted';
    } catch (e) {
      return false;
    }
  }

  public async startUpload(uploadId: string, fileCount: number = 1) {
    this.activeUploads.set(uploadId, 0);
    await this.requestPermissions();
    await this.updateUploadProgress(uploadId, 5, fileCount > 1 ? `Uploading ${fileCount} files...` : 'Starting media upload...');
  }

  private renderProgressBar(percent: number): string {
    const totalBlocks = 10;
    const filled = Math.min(totalBlocks, Math.max(0, Math.round((percent / 100) * totalBlocks)));
    const empty = totalBlocks - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  public async updateUploadProgress(uploadId: string, progressPercent: number, statusText?: string) {
    const clampedProgress = Math.min(100, Math.max(0, Math.round(progressPercent)));
    this.activeUploads.set(uploadId, clampedProgress);

    const bar = this.renderProgressBar(clampedProgress);
    const bodyText = statusText ? `[${bar}] ${statusText}` : `[${bar}] ${clampedProgress}% complete`;

    try {
      await Notifications.scheduleNotificationAsync({
        identifier: uploadId,
        content: {
          title: `📤 Uploading media • ${clampedProgress}%`,
          body: bodyText,
          data: { uploadId, progress: clampedProgress },
          sound: false,
        },
        trigger: null,
      });
    } catch (err) {
      // Silent notification update
    }
  }

  public async notifyUploadComplete(uploadId: string, count: number = 1) {
    this.activeUploads.delete(uploadId);
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: uploadId,
        content: {
          title: '✅ Media upload complete',
          body: count > 1 ? `All ${count} media files sent successfully` : 'Media file sent successfully',
          sound: true,
        },
        trigger: null,
      });

      setTimeout(async () => {
        try {
          await Notifications.dismissNotificationAsync(uploadId);
        } catch {}
      }, 3000);
    } catch {}
  }

  public async notifyUploadFailed(uploadId: string, errorMessage?: string) {
    this.activeUploads.delete(uploadId);
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: uploadId,
        content: {
          title: '❌ Upload failed',
          body: errorMessage || 'Failed to send media files. Please try again.',
          sound: true,
        },
        trigger: null,
      });
    } catch {}
  }
}

export default BackgroundUploadService.getInstance();

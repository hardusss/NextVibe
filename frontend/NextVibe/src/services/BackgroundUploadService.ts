class BackgroundUploadService {
  private static instance: BackgroundUploadService;

  private constructor() {}

  public static getInstance(): BackgroundUploadService {
    if (!BackgroundUploadService.instance) {
      BackgroundUploadService.instance = new BackgroundUploadService();
    }
    return BackgroundUploadService.instance;
  }

  public async startUpload(_uploadId: string, _fileCount: number = 1) {}
  public async updateUploadProgress(_uploadId: string, _progressPercent: number, _statusText?: string) {}
  public async notifyUploadComplete(_uploadId: string, _count: number = 1) {}
  public async notifyUploadFailed(_uploadId: string, _errorMessage?: string) {}
}

export default BackgroundUploadService.getInstance();

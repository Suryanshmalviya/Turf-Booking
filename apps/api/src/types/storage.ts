export interface ImageUploadRequest {
  filename: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  sizeBytes: number;
}

export interface ImageStorageAdapter {
  createUploadUrl(
    request: ImageUploadRequest
  ): Promise<{ key: string; uploadUrl: string; expiresAt: Date }>;
}

export class UnconfiguredImageStorageAdapter implements ImageStorageAdapter {
  public async createUploadUrl(
    _request: ImageUploadRequest
  ): Promise<{ key: string; uploadUrl: string; expiresAt: Date }> {
    throw new Error('Image storage provider is not configured');
  }
}

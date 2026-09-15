import { LocalStorageProvider } from './providers/local.provider';
import { S3StorageProvider } from './providers/s3.provider';
import type { StorageProvider } from './types';

export interface StorageSettings {
  provider: 'local' | 's3';
  localPath: string;
  bucket?: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle?: boolean;
  signedUrlTtl?: number;
}

/**
 * One place decides which backend is in use, so the API and the worker cannot end up
 * writing to different buckets from the same environment.
 */
export function createStorageProvider(settings: StorageSettings): StorageProvider {
  if (settings.provider === 's3') {
    if (!settings.bucket || !settings.region) {
      throw new Error('STORAGE_PROVIDER=s3 requires S3_BUCKET and S3_REGION');
    }
    return new S3StorageProvider({
      bucket: settings.bucket,
      region: settings.region,
      endpoint: settings.endpoint,
      accessKeyId: settings.accessKeyId,
      secretAccessKey: settings.secretAccessKey,
      forcePathStyle: settings.forcePathStyle ?? false,
      signedUrlTtl: settings.signedUrlTtl ?? 900,
    });
  }
  return new LocalStorageProvider(settings.localPath);
}

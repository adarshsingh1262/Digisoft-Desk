import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../config/config.module';
import { STORAGE_PROVIDER, type StorageProvider } from './storage.types';
import { LocalStorageProvider } from './providers/local.provider';
import { S3StorageProvider } from './providers/s3.provider';

function createProvider(config: AppConfig): StorageProvider {
  if (config.get('STORAGE_PROVIDER') === 's3') {
    const bucket = config.get('S3_BUCKET');
    const region = config.get('S3_REGION');
    if (!bucket || !region) {
      throw new Error('STORAGE_PROVIDER=s3 requires S3_BUCKET and S3_REGION');
    }
    return new S3StorageProvider({
      bucket,
      region,
      endpoint: config.get('S3_ENDPOINT'),
      accessKeyId: config.get('S3_ACCESS_KEY'),
      secretAccessKey: config.get('S3_SECRET_KEY'),
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE'),
      signedUrlTtl: config.get('S3_SIGNED_URL_TTL_SECONDS'),
    });
  }
  return new LocalStorageProvider(config.get('STORAGE_LOCAL_PATH'));
}

@Global()
@Module({
  providers: [{ provide: STORAGE_PROVIDER, inject: [AppConfig], useFactory: createProvider }],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}

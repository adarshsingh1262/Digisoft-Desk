import { Global, Module } from '@nestjs/common';
import { STORAGE_PROVIDER, createStorageProvider, type StorageProvider } from '@digisoft/storage';
import { AppConfig } from '../config/config.module';

function createProvider(config: AppConfig): StorageProvider {
  return createStorageProvider({
    provider: config.get('STORAGE_PROVIDER'),
    localPath: config.get('STORAGE_LOCAL_PATH'),
    bucket: config.get('S3_BUCKET'),
    region: config.get('S3_REGION'),
    endpoint: config.get('S3_ENDPOINT'),
    accessKeyId: config.get('S3_ACCESS_KEY'),
    secretAccessKey: config.get('S3_SECRET_KEY'),
    forcePathStyle: config.get('S3_FORCE_PATH_STYLE'),
    signedUrlTtl: config.get('S3_SIGNED_URL_TTL_SECONDS'),
  });
}

@Global()
@Module({
  providers: [{ provide: STORAGE_PROVIDER, inject: [AppConfig], useFactory: createProvider }],
  exports: [STORAGE_PROVIDER],
})
export class StorageModule {}

import { Global, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { AppConfig } from '../config/config.module';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [AppConfig],
      useFactory: (config: AppConfig): Redis =>
        new Redis(config.get('REDIS_URL'), { maxRetriesPerRequest: null }),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    // ioredis connections are closed by the Nest shutdown hooks on the provider.
  }
}

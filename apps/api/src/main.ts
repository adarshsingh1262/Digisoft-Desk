import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Redis } from 'ioredis';
import { AppModule } from './app.module';
import { AppConfig } from './config/config.module';
import { REDIS_CLIENT } from './redis/redis.module';
import { RedisIoAdapter } from './realtime/redis-io.adapter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(AppConfig);

  app.useLogger(app.get(PinoLogger));
  app.setGlobalPrefix(config.get('API_PREFIX'));
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.get('FRONTEND_URL'),
    credentials: true,
  });
  app.enableShutdownHooks();

  const redisAdapter = new RedisIoAdapter(app);
  await redisAdapter.connectToRedis(app.get<Redis>(REDIS_CLIENT));
  app.useWebSocketAdapter(redisAdapter);

  await app.listen(config.get('PORT'), '0.0.0.0');
}

void bootstrap();

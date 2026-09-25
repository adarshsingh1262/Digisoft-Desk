import { Controller, Get, Inject } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Public()
  @Get()
  async check() {
    const [database, redis] = await Promise.all([
      this.prisma
        .$queryRaw`SELECT 1`.then(() => 'up' as const)
        .catch(() => 'down' as const),
      this.redis
        .ping()
        .then(() => 'up' as const)
        .catch(() => 'down' as const),
    ]);

    return {
      status: database === 'up' && redis === 'up' ? 'ok' : 'degraded',
      dependencies: { database, redis },
      timestamp: new Date().toISOString(),
    };
  }
}

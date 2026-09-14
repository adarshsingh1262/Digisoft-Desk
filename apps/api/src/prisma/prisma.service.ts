import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@digisoft/db';

/**
 * Raw, unscoped client. Inject this only in platform-level code (auth lookup by
 * email, organization provisioning, health checks). Everything else must inject
 * TENANT_PRISMA so tenant isolation is enforced.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

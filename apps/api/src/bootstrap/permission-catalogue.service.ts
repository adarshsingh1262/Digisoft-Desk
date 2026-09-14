import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { syncPermissionCatalogue } from '@digisoft/db';

/** Keeps the database's permission catalogue in step with the code's definition. */
@Injectable()
export class PermissionCatalogueService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PermissionCatalogueService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    await syncPermissionCatalogue(this.prisma);
    this.logger.log('Permission catalogue synchronised');
  }
}

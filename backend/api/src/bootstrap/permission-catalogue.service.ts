import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { syncPermissionCatalogue, syncSystemRolePermissions } from '@digisoft/db';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Keeps the database's permission catalogue in step with the code's definition, and
 * reconciles system roles so grants added by a new release reach existing tenants
 * without a manual data fix.
 */
@Injectable()
export class PermissionCatalogueService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PermissionCatalogueService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap(): Promise<void> {
    await syncPermissionCatalogue(this.prisma);
    const updatedRoles = await syncSystemRolePermissions(this.prisma);
    this.logger.log(
      updatedRoles > 0
        ? `Permission catalogue synchronised; ${updatedRoles} system role(s) updated`
        : 'Permission catalogue synchronised',
    );
  }
}

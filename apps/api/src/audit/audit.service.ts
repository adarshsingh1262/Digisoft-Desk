import { Inject, Injectable, Logger } from '@nestjs/common';
import { type ActorType, type Prisma } from '@digisoft/db';
import { TENANT_PRISMA } from '../prisma/prisma.module';
import type { TenantPrismaClient } from '@digisoft/db';

export interface AuditEntry {
  organizationId: string;
  actorId?: string | null;
  actorType?: ActorType;
  action: string;
  entity: string;
  entityId: string;
  oldValue?: unknown;
  newValue?: unknown;
  ip?: string | null;
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined || value === null
    ? undefined
    : (JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue);
}

/**
 * Append-only change history. Audit writes must never fail a business operation, so
 * failures are logged rather than thrown.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@Inject(TENANT_PRISMA) private readonly db: TenantPrismaClient) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.db.auditLog.create({
        data: {
          organizationId: entry.organizationId,
          actorId: entry.actorId ?? null,
          actorType: entry.actorType ?? 'USER',
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId,
          oldValue: toJson(entry.oldValue),
          newValue: toJson(entry.newValue),
          ip: entry.ip ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to write audit entry ${entry.action} for ${entry.entity}:${entry.entityId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}

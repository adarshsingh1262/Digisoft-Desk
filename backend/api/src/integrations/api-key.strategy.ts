import { Injectable } from '@nestjs/common';
import type { AuthenticatedUser } from '@digisoft/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { hashApiKey } from './api-keys.service';

/**
 * Authenticates a machine caller. An API key carries a role, so an integration is
 * authorised through exactly the same permission checks as a person — there is no
 * parallel, weaker authorisation path.
 *
 * Platform-level: it runs before a tenant scope exists and passes ids explicitly.
 */
@Injectable()
export class ApiKeyStrategy {
  constructor(private readonly prisma: PrismaService) {}

  async authenticate(rawKey: string): Promise<AuthenticatedUser> {
    const key = await this.prisma.apiKey.findUnique({
      where: { keyHash: hashApiKey(rawKey) },
      select: {
        id: true,
        name: true,
        organizationId: true,
        revokedAt: true,
        expiresAt: true,
        userId: true,
        user: { select: { isActive: true, deletedAt: true } },
        role: {
          select: {
            id: true,
            name: true,
            systemKey: true,
            permissions: { select: { permission: { select: { key: true } } } },
          },
        },
      },
    });

    if (
      !key ||
      key.revokedAt ||
      (key.expiresAt && key.expiresAt.getTime() <= Date.now()) ||
      !key.user.isActive ||
      key.user.deletedAt
    ) {
      throw AppError.unauthenticated('Invalid API key', 'INVALID_API_KEY');
    }

    // Best-effort usage stamp; never fail a request because the stamp did not write.
    void this.prisma.apiKey
      .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    return {
      // The service user's id: ownership columns and the audit trail stay valid.
      id: key.userId,
      organizationId: key.organizationId,
      email: `${key.name} (API key)`,
      firstName: key.name,
      lastName: 'API key',
      type: 'AGENT',
      roles: [key.role.systemKey ?? key.role.name],
      permissions: key.role.permissions.map((entry) => entry.permission.key),
      departmentIds: [],
      contactId: null,
    };
  }
}

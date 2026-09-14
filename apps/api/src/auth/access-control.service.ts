import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import type { AuthenticatedUser } from '@digisoft/shared';
import { REDIS_CLIENT } from '../redis/redis.module';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import type { AccessTokenPayload } from './token.service';

const CACHE_TTL_SECONDS = 60;

/**
 * Resolves the effective identity (roles + permissions) for an authenticated request.
 * Cached in Redis for a minute and invalidated explicitly whenever role membership or
 * role permissions change, so revoking access takes effect without waiting for the
 * access token to expire.
 */
@Injectable()
export class AccessControlService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  private cacheKey(organizationId: string, userId: string): string {
    return `org:${organizationId}:acl:user:${userId}`;
  }

  async resolveUser(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    const key = this.cacheKey(payload.org, payload.sub);
    const cached = await this.redis.get(key);
    if (cached) {
      return JSON.parse(cached) as AuthenticatedUser;
    }

    const user = await this.prisma.user.findFirst({
      where: {
        id: payload.sub,
        organizationId: payload.org,
        isActive: true,
        deletedAt: null,
      },
      select: {
        id: true,
        organizationId: true,
        email: true,
        firstName: true,
        lastName: true,
        type: true,
        departments: { select: { departmentId: true } },
        roles: {
          select: {
            role: {
              select: {
                name: true,
                systemKey: true,
                permissions: { select: { permission: { select: { key: true } } } },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw AppError.unauthenticated('Account is no longer active', 'ACCOUNT_DISABLED');
    }

    const permissions = new Set<string>();
    const roles: string[] = [];
    for (const link of user.roles) {
      roles.push(link.role.systemKey ?? link.role.name);
      for (const rp of link.role.permissions) {
        permissions.add(rp.permission.key);
      }
    }

    const resolved: AuthenticatedUser = {
      id: user.id,
      organizationId: user.organizationId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      type: user.type,
      roles,
      permissions: [...permissions],
      departmentIds: user.departments.map((link) => link.departmentId),
    };

    await this.redis.set(key, JSON.stringify(resolved), 'EX', CACHE_TTL_SECONDS);
    return resolved;
  }

  async invalidateUser(organizationId: string, userId: string): Promise<void> {
    await this.redis.del(this.cacheKey(organizationId, userId));
  }

  /** Used when a role's permissions change and every holder must be re-resolved. */
  async invalidateUsers(organizationId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) {
      return;
    }
    await this.redis.del(...userIds.map((id) => this.cacheKey(organizationId, id)));
  }
}

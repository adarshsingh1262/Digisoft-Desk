import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { Redis } from 'ioredis';
import { TenantContext } from '@digisoft/db';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { PORTAL_HELP_CENTER_SELECT, portalCacheKey, type PortalHelpCenter } from './portal.types';

const CACHE_TTL_SECONDS = 30;

/**
 * Resolves `/portal/:slug/...` to the organization that owns the help center and opens
 * the tenant scope for anonymous visitors, who have no token to open one with. A
 * request carrying a bearer token is already inside its own tenant context by the time
 * this runs; the portal guard is what checks that the two agree.
 */
@Injectable()
export class PortalContextMiddleware implements NestMiddleware {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const slug = PortalContextMiddleware.slugFromUrl(req.originalUrl ?? req.url);
    if (!slug) {
      next();
      return;
    }

    const helpCenter = await this.load(slug);
    if (!helpCenter) {
      next();
      return;
    }

    req.helpCenter = helpCenter;

    if (TenantContext.organizationId) {
      next();
      return;
    }
    TenantContext.run(helpCenter.organizationId, () => next());
  }

  static slugFromUrl(url: string): string | null {
    const match = /\/portal\/([A-Za-z0-9][A-Za-z0-9-]{0,79})(?:[/?#]|$)/.exec(url);
    return match?.[1] ?? null;
  }

  private async load(slug: string): Promise<PortalHelpCenter | null> {
    const key = portalCacheKey(slug);
    const cached = await this.redis.get(key);
    if (cached) {
      return JSON.parse(cached) as PortalHelpCenter;
    }

    const helpCenter = await this.prisma.helpCenter.findUnique({
      where: { slug },
      select: PORTAL_HELP_CENTER_SELECT,
    });
    if (!helpCenter) {
      return null;
    }

    await this.redis.set(key, JSON.stringify(helpCenter), 'EX', CACHE_TTL_SECONDS);
    return helpCenter;
  }
}

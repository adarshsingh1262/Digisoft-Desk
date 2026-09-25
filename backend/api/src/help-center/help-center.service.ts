import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { availableHelpCenterSlug, provisionHelpCenter } from '@digisoft/db';
import type { AuthenticatedUser, HelpCenterSettingsInput } from '@digisoft/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { AuditService } from '../audit/audit.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { portalCacheKey } from '../portal/portal.types';

export const HELP_CENTER_SELECT = {
  id: true,
  slug: true,
  name: true,
  tagline: true,
  welcomeMessage: true,
  logoUrl: true,
  primaryColor: true,
  supportEmail: true,
  footerText: true,
  isPublished: true,
  allowPublicBrowsing: true,
  allowSelfRegistration: true,
  allowTicketSubmission: true,
  kbEnabled: true,
  communityEnabled: true,
  moderateCommunity: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * The organization's customer-facing site. The slug is unique across the platform, so
 * this service uses the unscoped client with an explicit `organizationId` — the same
 * pattern as the auth module — rather than the tenant-scoped one, which by design
 * cannot see another organization's slug to avoid colliding with it.
 */
@Injectable()
export class HelpCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async get(organizationId: string) {
    const existing = await this.prisma.helpCenter.findUnique({
      where: { organizationId },
      select: HELP_CENTER_SELECT,
    });
    if (existing) {
      return existing;
    }

    // Organizations created before the portal existed get theirs on first read.
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, slug: true },
    });
    if (!organization) {
      throw AppError.notFound('organization');
    }
    await provisionHelpCenter(this.prisma, organizationId, organization);

    return this.prisma.helpCenter.findUniqueOrThrow({
      where: { organizationId },
      select: HELP_CENTER_SELECT,
    });
  }

  async update(actor: AuthenticatedUser, input: HelpCenterSettingsInput) {
    const current = await this.get(actor.organizationId);

    let slug: string | undefined;
    if (input.slug && input.slug !== current.slug) {
      const taken = await this.prisma.helpCenter.findUnique({
        where: { slug: input.slug },
        select: { organizationId: true },
      });
      if (taken && taken.organizationId !== actor.organizationId) {
        throw AppError.conflict('That help center address is already taken');
      }
      slug = input.slug;
    }

    const helpCenter = await this.prisma.helpCenter.update({
      where: { organizationId: actor.organizationId },
      data: {
        ...(slug ? { slug } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.tagline !== undefined ? { tagline: input.tagline } : {}),
        ...(input.welcomeMessage !== undefined ? { welcomeMessage: input.welcomeMessage } : {}),
        ...(input.logoUrl !== undefined ? { logoUrl: input.logoUrl } : {}),
        ...(input.primaryColor !== undefined ? { primaryColor: input.primaryColor } : {}),
        ...(input.supportEmail !== undefined ? { supportEmail: input.supportEmail } : {}),
        ...(input.footerText !== undefined ? { footerText: input.footerText } : {}),
        ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
        ...(input.allowPublicBrowsing !== undefined
          ? { allowPublicBrowsing: input.allowPublicBrowsing }
          : {}),
        ...(input.allowSelfRegistration !== undefined
          ? { allowSelfRegistration: input.allowSelfRegistration }
          : {}),
        ...(input.allowTicketSubmission !== undefined
          ? { allowTicketSubmission: input.allowTicketSubmission }
          : {}),
        ...(input.kbEnabled !== undefined ? { kbEnabled: input.kbEnabled } : {}),
        ...(input.communityEnabled !== undefined ? { communityEnabled: input.communityEnabled } : {}),
        ...(input.moderateCommunity !== undefined
          ? { moderateCommunity: input.moderateCommunity }
          : {}),
      },
      select: HELP_CENTER_SELECT,
    });

    // The portal middleware caches the site by slug; settings must take effect now,
    // not a cache lifetime later, and the old address must stop resolving at once.
    await this.redis.del(portalCacheKey(current.slug), portalCacheKey(helpCenter.slug));

    await this.audit.record({
      organizationId: actor.organizationId,
      actorId: actor.id,
      action: 'help_center.updated',
      entity: 'HelpCenter',
      entityId: helpCenter.id,
      oldValue: { slug: current.slug, isPublished: current.isPublished },
      newValue: { slug: helpCenter.slug, isPublished: helpCenter.isPublished },
    });
    return helpCenter;
  }

  /** Suggests a free address for the settings form. */
  suggestSlug(preferred: string): Promise<string> {
    return availableHelpCenterSlug(this.prisma, preferred);
  }
}

import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthenticatedUser } from '@digisoft/shared';
import { createParamDecorator } from '@nestjs/common';
import { AppError } from '../common/errors/app-error';
import { AccessControlService } from '../auth/access-control.service';
import type { PortalHelpCenter } from './portal.types';

export const PORTAL_ACCESS_KEY = 'digisoft:portalAccess';

/** Route needs a signed-in portal visitor. */
export const PortalAuth = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PORTAL_ACCESS_KEY, 'user');

/** Route stays reachable even on a help center that requires signing in (login, signup). */
export const PortalOpen = (): MethodDecorator & ClassDecorator =>
  SetMetadata(PORTAL_ACCESS_KEY, 'open');

export const CurrentHelpCenter = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PortalHelpCenter => {
    const request = ctx.switchToHttp().getRequest<Request>();
    if (!request.helpCenter) {
      throw AppError.notFound('help center');
    }
    return request.helpCenter;
  },
);

/** The signed-in visitor, or null on a public route. */
export const PortalUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser | null => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user ?? null;
  },
);

/**
 * Everything the portal routes rely on, in one place: the site exists and is published,
 * a bearer token belongs to the same organization as the site (a token from another
 * tenant is refused rather than silently ignored), and the site's own visibility rules
 * are applied before any handler runs.
 */
@Injectable()
export class PortalGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessControl: AccessControlService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const helpCenter = request.helpCenter;

    if (!helpCenter || !helpCenter.isPublished) {
      throw AppError.notFound('help center');
    }

    if (request.authError === 'expired') {
      throw AppError.unauthenticated('Access token has expired', 'TOKEN_EXPIRED');
    }
    if (request.accessTokenPayload) {
      if (request.accessTokenPayload.org !== helpCenter.organizationId) {
        throw AppError.forbidden('This account belongs to a different help center');
      }
      request.user = await this.accessControl.resolveUser(request.accessTokenPayload);
    }

    const access = this.reflector.getAllAndOverride<'user' | 'open' | undefined>(
      PORTAL_ACCESS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (access === 'user' && !request.user) {
      throw AppError.unauthenticated('Sign in to continue');
    }
    if (access !== 'open' && !request.user && !helpCenter.allowPublicBrowsing) {
      throw AppError.unauthenticated('This help center is only available to signed-in customers');
    }
    return true;
  }
}

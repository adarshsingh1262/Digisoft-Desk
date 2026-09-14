import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AppError } from '../errors/app-error';
import { AccessControlService } from '../../auth/access-control.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly accessControl: AccessControlService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();

    // An API key was already resolved to its service user by the middleware.
    if (request.apiKeyAuthenticated && request.user) {
      return true;
    }

    if (request.authError === 'expired') {
      throw AppError.unauthenticated('Access token has expired', 'TOKEN_EXPIRED');
    }
    if (request.authError === 'invalid' || !request.accessTokenPayload) {
      throw AppError.unauthenticated();
    }

    // Resolved per request (Redis-cached) so a revoked role stops working immediately
    // instead of at the next token refresh.
    request.user = await this.accessControl.resolveUser(request.accessTokenPayload);
    return true;
  }
}

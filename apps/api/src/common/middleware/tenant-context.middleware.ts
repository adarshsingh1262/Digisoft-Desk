import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { TenantContext } from '@digisoft/db';
import { TokenService } from '../../auth/token.service';

/**
 * Verifies the bearer token (if present) and opens the tenant scope for the rest of
 * the request. Requests without a valid token run with no tenant scope at all, so any
 * accidental query against a tenant-owned model fails closed rather than leaking rows.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(private readonly tokens: TokenService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const header = req.headers.authorization;
    const raw = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : undefined;

    if (!raw) {
      next();
      return;
    }

    const result = this.tokens.verifyAccessToken(raw);
    if (!result.ok) {
      req.authError = result.reason;
      next();
      return;
    }

    req.accessTokenPayload = result.payload;
    TenantContext.run(result.payload.org, () => next());
  }
}

import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { TenantContext } from '@digisoft/db';
import { TokenService } from '../../auth/token.service';
import { ApiKeyStrategy } from '../../integrations/api-key.strategy';

/**
 * Verifies the bearer token (if present) and opens the tenant scope for the rest of
 * the request. Requests without a valid token run with no tenant scope at all, so any
 * accidental query against a tenant-owned model fails closed rather than leaking rows.
 */
@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(
    private readonly tokens: TokenService,
    private readonly apiKeys: ApiKeyStrategy,
  ) {}

  use(req: Request, res: Response, next: NextFunction): void {
    // Machine callers present a key instead of a bearer token; it resolves to the
    // service user behind the key, so everything downstream sees an ordinary identity.
    const apiKey = req.headers['x-api-key'];
    if (typeof apiKey === 'string' && apiKey.length > 0) {
      void this.apiKeys
        .authenticate(apiKey)
        .then((user) => {
          req.user = user;
          req.apiKeyAuthenticated = true;
          TenantContext.run(user.organizationId, () => next());
        })
        .catch(() => {
          req.authError = 'invalid';
          next();
        });
      return;
    }

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

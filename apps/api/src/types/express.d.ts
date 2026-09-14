import type { AuthenticatedUser } from '@digisoft/shared';
import type { AccessTokenPayload } from '../auth/token.service';

declare global {
  namespace Express {
    interface Request {
      /** Verified access-token claims, set by TenantContextMiddleware. */
      accessTokenPayload?: AccessTokenPayload;
      /** Why the bearer token was rejected, so the guard can answer precisely. */
      authError?: 'expired' | 'invalid';
      /** Effective identity, resolved by JwtAuthGuard. */
      user?: AuthenticatedUser;
    }
  }
}

export {};

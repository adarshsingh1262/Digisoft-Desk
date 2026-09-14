import type { AuthenticatedUser } from '@digisoft/shared';
import type { AccessTokenPayload } from '../auth/token.service';
import type { PortalHelpCenter } from '../portal/portal.types';

declare global {
  namespace Express {
    interface Request {
      /** Verified access-token claims, set by TenantContextMiddleware. */
      accessTokenPayload?: AccessTokenPayload;
      /** Why the bearer token was rejected, so the guard can answer precisely. */
      authError?: 'expired' | 'invalid';
      /** Effective identity, resolved by JwtAuthGuard or, on portal routes, PortalGuard. */
      user?: AuthenticatedUser;
      /** Help center addressed by a /portal/:slug route, set by PortalContextMiddleware. */
      helpCenter?: PortalHelpCenter;
    }
  }
}

export {};

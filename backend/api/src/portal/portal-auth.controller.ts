import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  portalForgotPasswordSchema,
  portalLoginSchema,
  portalRegisterSchema,
  type AuthenticatedUser,
  type LoginResponse,
  type PortalForgotPasswordInput,
  type PortalLoginInput,
  type PortalRegisterInput,
} from '@digisoft/shared';
import { Public } from '../common/decorators/public.decorator';
import { zodBody } from '../common/pipes/zod-validation.pipe';
import { AppConfig } from '../config/config.module';
import { REFRESH_COOKIE } from '../auth/auth.controller';
import type { RequestMeta, SessionResult } from '../auth/auth.service';
import { CurrentHelpCenter, PortalAuth, PortalGuard, PortalOpen, PortalUser } from './portal.guard';
import { PortalAuthService } from './portal-auth.service';
import type { PortalHelpCenter } from './portal.types';

/**
 * Customer sessions. The refresh cookie is the same one the agent app uses — same
 * name, same path, same rotation — so `/auth/refresh` and `/auth/logout` serve both
 * audiences and there is only one session implementation to keep correct.
 */
@Public()
@UseGuards(PortalGuard)
@Controller('portal/:slug/auth')
export class PortalAuthController {
  constructor(
    private readonly portalAuth: PortalAuthService,
    private readonly config: AppConfig,
  ) {}

  @PortalOpen()
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(
    @CurrentHelpCenter() helpCenter: PortalHelpCenter,
    @Body(zodBody(portalRegisterSchema)) dto: PortalRegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const session = await this.portalAuth.register(helpCenter, dto, this.meta(req));
    return this.respondWithSession(res, session);
  }

  @PortalOpen()
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @CurrentHelpCenter() helpCenter: PortalHelpCenter,
    @Body(zodBody(portalLoginSchema)) dto: PortalLoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponse> {
    const session = await this.portalAuth.login(helpCenter, dto, this.meta(req));
    return this.respondWithSession(res, session);
  }

  @PortalOpen()
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('forgot-password')
  async forgotPassword(
    @CurrentHelpCenter() helpCenter: PortalHelpCenter,
    @Body(zodBody(portalForgotPasswordSchema)) dto: PortalForgotPasswordInput,
  ): Promise<{ requested: true }> {
    await this.portalAuth.forgotPassword(helpCenter, dto.email);
    return { requested: true };
  }

  @PortalAuth()
  @Get('me')
  me(
    @CurrentHelpCenter() helpCenter: PortalHelpCenter,
    @PortalUser() user: AuthenticatedUser | null,
  ) {
    return this.portalAuth.profile(helpCenter.organizationId, user!.id);
  }

  private respondWithSession(res: Response, session: SessionResult): LoginResponse {
    const maxAge = session.refreshTokenExpiresAt.getTime() - Date.now();
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE'),
      sameSite: 'lax' as const,
      domain: this.config.get('COOKIE_DOMAIN'),
      path: `/${this.config.get('API_PREFIX')}/auth`,
      maxAge,
    });
    return {
      status: 'authenticated',
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
      user: session.user,
    };
  }

  private meta(req: Request): RequestMeta {
    return { ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null };
  }
}

import { Injectable } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { createHmac, randomBytes } from 'node:crypto';
import { AppConfig } from '../config/config.module';
import { durationToSeconds } from '../common/util/duration';

export interface AccessTokenPayload {
  /** User id */
  sub: string;
  /** Organization id — the only tenant source the request layer trusts. */
  org: string;
  email: string;
  typ: 'AGENT' | 'CUSTOMER';
}

export type VerifyResult =
  | { ok: true; payload: AccessTokenPayload }
  | { ok: false; reason: 'expired' | 'invalid' };

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: AppConfig,
  ) {}

  get accessTokenTtlSeconds(): number {
    return durationToSeconds(this.config.get('JWT_EXPIRES_IN'));
  }

  get refreshTokenTtlMs(): number {
    return this.config.get('JWT_REFRESH_EXPIRES_IN_DAYS') * 24 * 60 * 60 * 1000;
  }

  signAccessToken(payload: AccessTokenPayload): string {
    const options: JwtSignOptions = {
      secret: this.config.get('JWT_SECRET'),
      expiresIn: this.accessTokenTtlSeconds,
    };
    return this.jwt.sign(payload, options);
  }

  verifyAccessToken(token: string): VerifyResult {
    try {
      const payload = this.jwt.verify<AccessTokenPayload>(token, {
        secret: this.config.get('JWT_SECRET'),
      });
      if (!payload?.sub || !payload?.org) {
        return { ok: false, reason: 'invalid' };
      }
      return { ok: true, payload };
    } catch (error) {
      const name = error instanceof Error ? error.name : '';
      return { ok: false, reason: name === 'TokenExpiredError' ? 'expired' : 'invalid' };
    }
  }

  /** Opaque refresh token; only its HMAC ever reaches the database. */
  createRefreshToken(): { token: string; tokenHash: string } {
    const token = randomBytes(48).toString('base64url');
    return { token, tokenHash: this.hashRefreshToken(token) };
  }

  hashRefreshToken(token: string): string {
    return createHmac('sha256', this.config.get('JWT_REFRESH_SECRET')).update(token).digest('hex');
  }
}

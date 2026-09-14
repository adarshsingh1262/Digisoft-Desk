import { Injectable, Logger } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  LoginResponse,
  RegisterInput,
  ResetPasswordInput,
} from '@digisoft/shared';
import { SYSTEM_ROLES } from '@digisoft/shared';
import type { TokenType } from '@digisoft/db';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { AccessControlService } from './access-control.service';
import { MailerService } from '../email/mailer.service';
import {
  DEFAULT_BUSINESS_HOURS,
  provisionSystemRoles,
  provisionTicketDefaults,
} from '@digisoft/db';

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

export interface SessionResult extends LoginResponse {
  refreshToken: string;
  refreshTokenExpiresAt: Date;
}

const PASSWORD_RESET_TTL_MINUTES = 60;
const EMAIL_VERIFICATION_TTL_HOURS = 48;

/**
 * Platform-level module: it runs before a tenant context exists, so it uses the
 * unscoped Prisma client and passes `organizationId` explicitly on every query.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
    private readonly accessControl: AccessControlService,
    private readonly mailer: MailerService,
  ) {}

  async register(input: RegisterInput, meta: RequestMeta): Promise<SessionResult> {
    const existingOrg = await this.prisma.organization.findUnique({
      where: { slug: input.organizationSlug },
      select: { id: true },
    });
    if (existingOrg) {
      throw AppError.conflict('That organization address is already taken');
    }

    const passwordHash = await this.passwords.hash(input.password);

    const { userId, organizationId } = await this.prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: input.organizationName,
          slug: input.organizationSlug,
          timezone: input.timezone,
        },
        select: { id: true },
      });

      const roleIds = await provisionSystemRoles(tx, organization.id);
      const superAdminRoleId = roleIds[SYSTEM_ROLES.SUPER_ADMIN];
      if (!superAdminRoleId) {
        throw new Error('System roles were not provisioned');
      }

      await tx.businessHours.create({
        data: {
          organizationId: organization.id,
          name: DEFAULT_BUSINESS_HOURS.name,
          timezone: input.timezone,
          isDefault: true,
          weeklySchedule: DEFAULT_BUSINESS_HOURS.weeklySchedule,
        },
      });

      await tx.department.create({
        data: {
          organizationId: organization.id,
          name: 'General',
          description: 'Default department for incoming requests.',
          isDefault: true,
        },
      });

      // Statuses, priorities and categories, so the organization can raise a ticket
      // the moment registration finishes.
      await provisionTicketDefaults(tx, organization.id);

      const user = await tx.user.create({
        data: {
          organizationId: organization.id,
          email: input.email,
          passwordHash,
          firstName: input.firstName,
          lastName: input.lastName,
          type: 'AGENT',
          roles: { create: { roleId: superAdminRoleId } },
        },
        select: { id: true },
      });

      return { userId: user.id, organizationId: organization.id };
    });

    await this.sendEmailVerification(userId);
    return this.createSession(userId, organizationId, meta);
  }

  async login(input: LoginInput, meta: RequestMeta): Promise<SessionResult> {
    const candidates = await this.prisma.user.findMany({
      where: {
        email: input.email,
        deletedAt: null,
        ...(input.organizationSlug
          ? { organization: { slug: input.organizationSlug, deletedAt: null } }
          : { organization: { deletedAt: null } }),
      },
      select: { id: true, organizationId: true, passwordHash: true, isActive: true },
    });

    if (candidates.length > 1) {
      throw AppError.validation(
        'This email address is used in more than one organization. Include your organization address to sign in.',
      );
    }

    const candidate = candidates[0];
    // Always run a verification so a missing account costs the same as a wrong password.
    const matches = await this.passwords.verify(
      candidate?.passwordHash ?? null,
      input.password,
    );

    if (!candidate || !matches) {
      throw AppError.unauthenticated('Incorrect email address or password', 'INVALID_CREDENTIALS');
    }
    if (!candidate.isActive) {
      throw AppError.unauthenticated('This account has been deactivated', 'ACCOUNT_DISABLED');
    }

    await this.prisma.user.update({
      where: { id: candidate.id },
      data: { lastLoginAt: new Date() },
    });

    return this.createSession(candidate.id, candidate.organizationId, meta);
  }

  async refresh(rawToken: string, meta: RequestMeta): Promise<SessionResult> {
    const tokenHash = this.tokens.hashRefreshToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        organizationId: true,
        familyId: true,
        expiresAt: true,
        revokedAt: true,
      },
    });

    if (!stored) {
      throw AppError.unauthenticated('Invalid session', 'TOKEN_EXPIRED');
    }

    if (stored.revokedAt) {
      // Replay of a rotated token: assume theft and drop the whole family.
      await this.prisma.refreshToken.updateMany({
        where: { familyId: stored.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      this.logger.warn(
        `Refresh token replay detected for user ${stored.userId}; session family revoked`,
      );
      throw AppError.unauthenticated('Session is no longer valid', 'TOKEN_EXPIRED');
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw AppError.unauthenticated('Session has expired', 'TOKEN_EXPIRED');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    return this.createSession(stored.userId, stored.organizationId, meta, stored.familyId);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) {
      return;
    }
    const tokenHash = this.tokens.hashRefreshToken(rawToken);
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      select: { familyId: true },
    });
    if (!stored) {
      return;
    }
    await this.prisma.refreshToken.updateMany({
      where: { familyId: stored.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async forgotPassword(input: ForgotPasswordInput): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: {
        email: input.email,
        deletedAt: null,
        isActive: true,
        ...(input.organizationSlug ? { organization: { slug: input.organizationSlug } } : {}),
      },
      select: { id: true, firstName: true, email: true, organizationId: true },
    });

    // Always succeed: the response must not reveal whether the address exists.
    if (!user) {
      return;
    }

    const { raw, hash } = this.createOpaqueToken();
    await this.prisma.verificationToken.create({
      data: {
        userId: user.id,
        type: 'PASSWORD_RESET',
        tokenHash: hash,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MINUTES * 60 * 1000),
      },
    });

    await this.mailer.send(user.organizationId, user.email, {
      kind: 'reset-password',
      firstName: user.firstName,
      url: `${this.mailer.frontendUrl}/reset-password?token=${raw}`,
      expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
    });
  }

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const record = await this.consumeToken(input.token, ['PASSWORD_RESET', 'INVITE']);
    const passwordHash = await this.passwords.hash(input.password);
    const isInvite = record.type === 'INVITE';

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        // Accepting an invite proves control of the mailbox, so it verifies the address.
        data: { passwordHash, ...(isInvite ? { emailVerifiedAt: new Date() } : {}) },
      }),
      this.prisma.verificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // Password change invalidates every existing session.
      this.prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.accessControl.invalidateUser(record.user.organizationId, record.userId);
    await this.mailer.send(record.user.organizationId, record.user.email, {
      kind: 'password-changed',
      firstName: record.user.firstName,
    });
  }

  async verifyEmail(token: string): Promise<void> {
    const record = await this.consumeToken(token, ['EMAIL_VERIFICATION']);
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      }),
      this.prisma.verificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);
  }

  async sendEmailVerification(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        organizationId: true,
        emailVerifiedAt: true,
      },
    });
    if (!user || user.emailVerifiedAt) {
      return;
    }

    const { raw, hash } = this.createOpaqueToken();
    await this.prisma.verificationToken.create({
      data: {
        userId: user.id,
        type: 'EMAIL_VERIFICATION',
        tokenHash: hash,
        expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 3600 * 1000),
      },
    });

    await this.mailer.send(user.organizationId, user.email, {
      kind: 'verify-email',
      firstName: user.firstName,
      url: `${this.mailer.frontendUrl}/verify-email?token=${raw}`,
    });
  }

  async changePassword(
    userId: string,
    organizationId: string,
    input: ChangePasswordInput,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { id: true, passwordHash: true, email: true, firstName: true },
    });
    if (!user) {
      throw AppError.notFound('user');
    }

    const matches = await this.passwords.verify(user.passwordHash, input.currentPassword);
    if (!matches) {
      throw AppError.unauthenticated('Current password is incorrect', 'INVALID_CREDENTIALS');
    }

    const passwordHash = await this.passwords.hash(input.newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    await this.accessControl.invalidateUser(organizationId, user.id);
    await this.mailer.send(organizationId, user.email, {
      kind: 'password-changed',
      firstName: user.firstName,
    });
  }

  private async createSession(
    userId: string,
    organizationId: string,
    meta: RequestMeta,
    familyId: string = randomUUID(),
  ): Promise<SessionResult> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId },
      select: { id: true, email: true, type: true },
    });
    if (!user) {
      throw AppError.unauthenticated();
    }

    const { token: refreshToken, tokenHash } = this.tokens.createRefreshToken();
    const refreshTokenExpiresAt = new Date(Date.now() + this.tokens.refreshTokenTtlMs);

    await this.prisma.refreshToken.create({
      data: {
        organizationId,
        userId,
        tokenHash,
        familyId,
        expiresAt: refreshTokenExpiresAt,
        ip: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    const accessToken = this.tokens.signAccessToken({
      sub: user.id,
      org: organizationId,
      email: user.email,
      typ: user.type,
    });

    await this.accessControl.invalidateUser(organizationId, userId);
    const resolved = await this.accessControl.resolveUser({
      sub: user.id,
      org: organizationId,
      email: user.email,
      typ: user.type,
    });

    return {
      accessToken,
      expiresIn: this.tokens.accessTokenTtlSeconds,
      user: resolved,
      refreshToken,
      refreshTokenExpiresAt,
    };
  }

  private createOpaqueToken(): { raw: string; hash: string } {
    const raw = randomBytes(32).toString('base64url');
    return { raw, hash: this.tokens.hashRefreshToken(raw) };
  }

  private async consumeToken(raw: string, types: TokenType[]) {
    const tokenHash = this.tokens.hashRefreshToken(raw);
    const record = await this.prisma.verificationToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        type: true,
        expiresAt: true,
        usedAt: true,
        user: {
          select: { id: true, email: true, firstName: true, organizationId: true },
        },
      },
    });

    if (
      !record ||
      !types.includes(record.type) ||
      record.usedAt ||
      record.expiresAt.getTime() <= Date.now()
    ) {
      throw AppError.validation('This link is invalid or has expired');
    }
    return record;
  }
}

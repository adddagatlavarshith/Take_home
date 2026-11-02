import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { authenticator } from 'otplib';
import { v4 as uuidv4 } from 'uuid';

import { PrismaService } from '../infra/prisma.service';
import { RedisService } from '../infra/redis.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from '../common/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MiB
  timeCost: 3,
  parallelism: 4,
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new ConflictException('Email already registered');

    const passwordHash = await argon2.hash(dto.password, ARGON2_OPTIONS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        role: UserRole.patient,
        profile: {
          create: {
            firstName: dto.firstName,
            lastName: dto.lastName,
          },
        },
      },
      include: { profile: true },
    });

    this.logger.log({ userId: user.id, email: user.email }, 'User registered');
    return this.issueTokens(user.id, user.email, user.role, false);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) throw new UnauthorizedException('Invalid credentials');
    if (user.status !== 'active') throw new ForbiddenException('Account is not active');

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (user.mfaEnabled) {
      const challengeId = uuidv4();
      await this.redis.setex(`mfa:challenge:${challengeId}`, 300, user.id);
      return { mfaRequired: true, challengeId };
    }

    // Doctors/admins must have MFA enabled
    if (user.role === UserRole.doctor || user.role === UserRole.admin) {
      throw new ForbiddenException('MFA setup is required for your account role. Please contact admin.');
    }

    return this.issueTokens(user.id, user.email, user.role, false);
  }

  async loginMfa(challengeId: string, totpCode: string) {
    const userId = await this.redis.get(`mfa:challenge:${challengeId}`);
    if (!userId) throw new UnauthorizedException('MFA challenge expired or invalid');

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaSecret) throw new BadRequestException('MFA not configured');

    const isValid = authenticator.verify({ token: totpCode, secret: user.mfaSecret });
    if (!isValid) throw new UnauthorizedException('Invalid TOTP code');

    await this.redis.del(`mfa:challenge:${challengeId}`);
    return this.issueTokens(user.id, user.email, user.role, true);
  }

  async refresh(token: string) {
    let payload: JwtPayload & { jti: string };
    try {
      payload = this.jwt.verify<JwtPayload & { jti: string }>(token, {
        secret: this.config.get<string>('app.auth.refreshSecret'),
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenHash = await argon2.hash(token, ARGON2_OPTIONS);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { userId: payload.sub, revokedAt: null },
    });

    if (!stored || new Date() > stored.expiresAt) {
      throw new UnauthorizedException('Refresh token expired or revoked');
    }

    // Rotate: revoke current, issue new
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
    return this.issueTokens(user.id, user.email, user.role, payload.mfaVerified);
  }

  async logout(userId: string) {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async setupMfa(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.mfaEnabled) throw new ConflictException('MFA already enabled');

    const secret = authenticator.generateSecret();
    const issuer = this.config.get<string>('app.auth.mfaIssuer', 'Amrutam');
    const otpauth = authenticator.keyuri(user.email, issuer, secret);

    // Store pending secret (not yet confirmed)
    await this.redis.setex(`mfa:pending:${userId}`, 600, secret);

    return { otpauth, secret };
  }

  async verifyMfaSetup(userId: string, totpCode: string) {
    const pendingSecret = await this.redis.get(`mfa:pending:${userId}`);
    if (!pendingSecret) throw new BadRequestException('No pending MFA setup. Call /auth/mfa/setup first.');

    const isValid = authenticator.verify({ token: totpCode, secret: pendingSecret });
    if (!isValid) throw new UnauthorizedException('Invalid TOTP code');

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: pendingSecret, mfaEnabled: true },
    });
    await this.redis.del(`mfa:pending:${userId}`);

    return { message: 'MFA enabled successfully' };
  }

  async disableMfa(userId: string, totpCode: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaEnabled || !user.mfaSecret) throw new BadRequestException('MFA not enabled');

    // Doctors/admins cannot disable MFA
    if (user.role === UserRole.doctor || user.role === UserRole.admin) {
      throw new ForbiddenException('MFA cannot be disabled for this account role');
    }

    const isValid = authenticator.verify({ token: totpCode, secret: user.mfaSecret });
    if (!isValid) throw new UnauthorizedException('Invalid TOTP code');

    await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: null, mfaEnabled: false },
    });

    return { message: 'MFA disabled successfully' };
  }

  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Don't reveal whether the email exists
    if (!user) return { message: 'If that email exists, a reset token has been issued' };

    const token = uuidv4();
    const ttl = this.config.get<number>('app.auth.passwordResetTtl', 1800);
    await this.redis.setex(`pwd:reset:${token}`, ttl, user.id);

    // In production this would send an email; in dev we return the token
    const devToken = process.env.NODE_ENV !== 'production' ? token : undefined;
    return {
      message: 'If that email exists, a reset token has been issued',
      ...(devToken ? { devToken } : {}),
    };
  }

  async confirmPasswordReset(token: string, newPassword: string) {
    const userId = await this.redis.get(`pwd:reset:${token}`);
    if (!userId) throw new BadRequestException('Reset token is invalid or expired');

    const passwordHash = await argon2.hash(newPassword, ARGON2_OPTIONS);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await this.redis.del(`pwd:reset:${token}`);
    // Revoke all existing refresh tokens
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return { message: 'Password reset successfully' };
  }

  private async issueTokens(userId: string, email: string, role: string, mfaVerified: boolean) {
    const payload: JwtPayload = { sub: userId, email, role, mfaVerified };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get<string>('app.auth.accessSecret'),
      expiresIn: this.config.get<number>('app.auth.accessTtl', 900),
    });

    const refreshTtl = this.config.get<number>('app.auth.refreshTtl', 604800);
    const refreshToken = this.jwt.sign(
      { ...payload, jti: uuidv4() },
      {
        secret: this.config.get<string>('app.auth.refreshSecret'),
        expiresIn: refreshTtl,
      },
    );

    const tokenHash = await argon2.hash(refreshToken, ARGON2_OPTIONS);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      },
    });

    return { accessToken, refreshToken };
  }
}

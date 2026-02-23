// =============================================================
// apps/auth-service/src/auth/auth.service.ts
// Core authentication business logic
// =============================================================

import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { DatabaseService } from '@finance/database';
import { UsersService } from '../users/users.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto } from './dto/auth.dto';
import { JwtPayload, JwtTokens } from '@finance/shared-types';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ── Register ─────────────────────────────────────────────────
  async register(dto: CreateUserDto, meta: { ip?: string; userAgent?: string } = {}) {
    // Create the user (throws ConflictException if email exists)
    const user = await this.usersService.create(dto);

    // Issue tokens immediately after registration
    const tokens = await this.issueTokens(user.id, user.email);

    // Save refresh token to DB
    await this.saveRefreshToken(user.id, tokens.refreshToken, meta);

    // Audit log
    await this.audit(user.id, 'REGISTER', meta);

    this.logger.log(`User registered and logged in: ${user.id}`);
    return { user, tokens };
  }

  // ── Login ────────────────────────────────────────────────────
  async login(dto: LoginDto, meta: { ip?: string; userAgent?: string } = {}) {
    // Find user — use consistent timing to prevent email enumeration
    const user = await this.usersService.findByEmail(dto.email);

    const isValid =
      user &&
      (await this.usersService.validatePassword(dto.password, user.passwordHash));

    if (!isValid) {
      // Log failed attempt for security monitoring
      await this.audit(user?.id, 'LOGIN_FAILED', { ...meta, email: dto.email });
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const tokens = await this.issueTokens(user.id, user.email);
    await this.saveRefreshToken(user.id, tokens.refreshToken, meta);
    await this.audit(user.id, 'LOGIN', meta);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _, ...safeUser } = user;

    this.logger.log(`User logged in: ${user.id}`);
    return { user: safeUser, tokens };
  }

  // ── Refresh ──────────────────────────────────────────────────
  // Called after JwtRefreshGuard validates the refresh token
  async refresh(
    userId: string,
    email: string,
    oldTokenHash: string,
    meta: { ip?: string; userAgent?: string } = {},
  ) {
    // Rotate refresh token — revoke old one, issue new
    await this.db.refreshToken.updateMany({
      where: { tokenHash: oldTokenHash },
      data: { isRevoked: true },
    });

    const tokens = await this.issueTokens(userId, email);
    await this.saveRefreshToken(userId, tokens.refreshToken, meta);
    await this.audit(userId, 'TOKEN_REFRESH', meta);

    return tokens;
  }

  // ── Logout ───────────────────────────────────────────────────
  async logout(userId: string, refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);

    await this.db.refreshToken.updateMany({
      where: { userId, tokenHash },
      data: { isRevoked: true },
    });

    await this.audit(userId, 'LOGOUT', {});
    this.logger.log(`User logged out: ${userId}`);
  }

  // ── Logout All Devices ───────────────────────────────────────
  async logoutAll(userId: string) {
    await this.db.refreshToken.updateMany({
      where: { userId, isRevoked: false },
      data: { isRevoked: true },
    });

    await this.audit(userId, 'LOGOUT_ALL', {});
    this.logger.log(`All sessions revoked for user: ${userId}`);
  }

  // ── Private Helpers ──────────────────────────────────────────

  private async issueTokens(userId: string, email: string): Promise<JwtTokens> {
    const payload: JwtPayload = { sub: userId, email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('app.jwt.accessSecret'),
        expiresIn: this.config.get<string>('app.jwt.accessExpiresIn', '15m'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.config.get<string>('app.jwt.refreshSecret'),
        expiresIn: this.config.get<string>('app.jwt.refreshExpiresIn', '7d'),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async saveRefreshToken(
    userId: string,
    rawToken: string,
    meta: { ip?: string; userAgent?: string },
  ) {
    const tokenHash = this.hashToken(rawToken);

    // Refresh token expires in 7 days
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.db.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        ipAddress: meta.ip,
        userAgent: meta.userAgent,
      },
    });

    // Clean up old expired/revoked tokens for this user
    await this.db.refreshToken.deleteMany({
      where: {
        userId,
        OR: [
          { isRevoked: true },
          { expiresAt: { lt: new Date() } },
        ],
      },
    });
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async audit(
    userId: string | undefined,
    action: string,
    meta: { ip?: string; userAgent?: string; email?: string },
  ) {
    try {
      await this.db.auditLog.create({
        data: {
          userId,
          action,
          ipAddress: meta.ip,
          userAgent: meta.userAgent,
          metadata: meta.email ? { email: meta.email } : undefined,
        },
      });
    } catch (err) {
      // Audit failures should not break the main flow
      this.logger.warn(`Audit log failed for action ${action}: ${err.message}`);
    }
  }
}

// =============================================================
// apps/upload-service/src/upload/guards/jwt-auth.guard.ts
//
// KEY DESIGN DECISION:
// The upload-service does NOT issue JWT tokens — auth-service does.
// But upload-service needs to VALIDATE incoming Bearer tokens.
// Both services share the same JWT_ACCESS_SECRET, so tokens
// issued by auth-service can be verified here without any
// service-to-service call (stateless validation).
// =============================================================

import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../../../../../libs/shared-types/src';

// ── Strategy: validates JWT in Authorization: Bearer <token> header
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Injectable as Inj } from '@nestjs/common';
import { DatabaseService } from '@finance/database';

@Inj()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly db: DatabaseService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // Same secret as auth-service — this is how stateless JWT validation works
      secretOrKey: config.get<string>('upload.jwt.accessSecret'),
    });
  }

  async validate(payload: JwtPayload) {
    // Verify user still exists and is active
    const user = await this.db.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or deactivated');
    }

    return { id: user.id, email: user.email };
  }
}

// ── Guard: apply with @UseGuards(JwtAuthGuard) on protected routes
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any) {
    if (err || !user) {
      throw new UnauthorizedException(
        'Invalid or expired token. Please login again.',
      );
    }
    return user;
  }
}

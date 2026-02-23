// =============================================================
// apps/auth-service/src/auth/guards/jwt-refresh.guard.ts
// Only used on the /refresh endpoint
// =============================================================

import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtRefreshGuard extends AuthGuard('jwt-refresh') {}

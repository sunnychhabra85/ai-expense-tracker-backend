// =============================================================
// apps/auth-service/src/auth/guards/jwt-access.guard.ts
// Use this decorator on any protected route: @UseGuards(JwtAccessGuard)
// =============================================================

import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAccessGuard extends AuthGuard('jwt-access') {}

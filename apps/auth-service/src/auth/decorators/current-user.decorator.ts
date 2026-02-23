// =============================================================
// apps/auth-service/src/auth/decorators/current-user.decorator.ts
// Usage: @CurrentUser() user: AuthenticatedUser
// =============================================================

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from '@finance/shared-types';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);

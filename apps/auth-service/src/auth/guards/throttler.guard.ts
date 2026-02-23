// =============================================================
// apps/auth-service/src/auth/guards/throttler.guard.ts
// Applied to auth endpoints to prevent brute-force
// =============================================================

import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  // Override to customize error message
  protected async throwThrottlingException(): Promise<void> {
    throw new Error('Too many requests. Please try again later.');
  }
}

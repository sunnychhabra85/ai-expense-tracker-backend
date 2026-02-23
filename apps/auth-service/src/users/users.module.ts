// =============================================================
// apps/auth-service/src/users/users.module.ts
// =============================================================

import { Module } from '@nestjs/common';
import { UsersService } from './users.service';

@Module({
  providers: [UsersService],
  exports: [UsersService], // Exported so AuthModule can use it
})
export class UsersModule {}

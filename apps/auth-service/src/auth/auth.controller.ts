// =============================================================
// apps/auth-service/src/auth/auth.controller.ts
// REST endpoints for authentication
// =============================================================

import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  Delete,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
} from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { LoginDto, RefreshTokenDto } from './dto/auth.dto';
import { JwtAccessGuard } from './guards/auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthenticatedUser } from '@finance/shared-types';

// Helper to extract client metadata from request
function getMeta(req: Request) {
  return {
    ip: (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip,
    userAgent: req.headers['user-agent'],
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ── POST /api/v1/auth/register ────────────────────────────────
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  async register(@Body() dto: CreateUserDto, @Req() req: Request) {
    const result = await this.authService.register(dto, getMeta(req));
    return {
      success: true,
      message: 'Registration successful',
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  // ── POST /api/v1/auth/login ───────────────────────────────────
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    const result = await this.authService.login(dto, getMeta(req));
    return {
      success: true,
      message: 'Login successful',
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  // ── POST /api/v1/auth/refresh ─────────────────────────────────
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtRefreshGuard)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({ status: 200, description: 'Tokens refreshed' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(@Req() req: Request & { user: any }) {
    // req.user set by JwtRefreshStrategy.validate()
    const { id, email, tokenHash } = req.user;
    const tokens = await this.authService.refresh(id, email, tokenHash, getMeta(req));
    return {
      success: true,
      message: 'Tokens refreshed successfully',
      data: { tokens },
      timestamp: new Date().toISOString(),
    };
  }

  // ── POST /api/v1/auth/logout ──────────────────────────────────
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout current session' })
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RefreshTokenDto,
  ) {
    await this.authService.logout(user.id, dto.refreshToken);
    return {
      success: true,
      message: 'Logged out successfully',
      timestamp: new Date().toISOString(),
    };
  }

  // ── DELETE /api/v1/auth/sessions ─────────────────────────────
  @Delete('sessions')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout all devices (revoke all refresh tokens)' })
  async logoutAll(@CurrentUser() user: AuthenticatedUser) {
    await this.authService.logoutAll(user.id);
    return {
      success: true,
      message: 'All sessions revoked',
      timestamp: new Date().toISOString(),
    };
  }

  // ── GET /api/v1/auth/me ───────────────────────────────────────
  @Get('me')
  @UseGuards(JwtAccessGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Current user info' })
  async me(@CurrentUser() user: AuthenticatedUser) {
    return {
      success: true,
      data: { user },
      timestamp: new Date().toISOString(),
    };
  }
}

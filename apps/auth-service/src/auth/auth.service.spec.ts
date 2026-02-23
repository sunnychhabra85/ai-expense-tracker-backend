// =============================================================
// apps/auth-service/src/auth/auth.service.spec.ts
// Unit tests for AuthService
// Run: npx nx test auth-service
// =============================================================

import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { DatabaseService } from '@finance/database';

// ── Mocks ────────────────────────────────────────────────────
const mockDb = {
  refreshToken: {
    create: jest.fn(),
    updateMany: jest.fn(),
    deleteMany: jest.fn(),
    findUnique: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
};

const mockUsersService = {
  create: jest.fn(),
  findByEmail: jest.fn(),
  validatePassword: jest.fn(),
};

const mockJwtService = {
  signAsync: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string, defaultVal?: any) => {
    const config: Record<string, any> = {
      'app.jwt.accessSecret': 'test-access-secret',
      'app.jwt.refreshSecret': 'test-refresh-secret',
      'app.jwt.accessExpiresIn': '15m',
      'app.jwt.refreshExpiresIn': '7d',
      'app.bcryptRounds': 12,
    };
    return config[key] ?? defaultVal;
  }),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  // ── Register ───────────────────────────────────────────────
  describe('register', () => {
    it('should register a new user and return tokens', async () => {
      const mockUser = { id: 'user-123', email: 'test@test.com' };
      mockUsersService.create.mockResolvedValue(mockUser);
      mockJwtService.signAsync
        .mockResolvedValueOnce('access-token-value')
        .mockResolvedValueOnce('refresh-token-value');
      mockDb.refreshToken.create.mockResolvedValue({});
      mockDb.refreshToken.deleteMany.mockResolvedValue({});
      mockDb.auditLog.create.mockResolvedValue({});

      const result = await service.register({
        email: 'test@test.com',
        password: 'SecureP@ss123',
      });

      expect(result.user).toEqual(mockUser);
      expect(result.tokens.accessToken).toBe('access-token-value');
      expect(result.tokens.refreshToken).toBe('refresh-token-value');
      expect(mockUsersService.create).toHaveBeenCalledTimes(1);
    });

    it('should propagate ConflictException when email exists', async () => {
      mockUsersService.create.mockRejectedValue(
        new ConflictException('Email already registered'),
      );

      await expect(
        service.register({ email: 'existing@test.com', password: 'SecureP@ss123' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ── Login ──────────────────────────────────────────────────
  describe('login', () => {
    it('should login successfully with valid credentials', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@test.com',
        passwordHash: 'hashed',
        isActive: true,
      };
      mockUsersService.findByEmail.mockResolvedValue(mockUser);
      mockUsersService.validatePassword.mockResolvedValue(true);
      mockJwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');
      mockDb.refreshToken.create.mockResolvedValue({});
      mockDb.refreshToken.deleteMany.mockResolvedValue({});
      mockDb.auditLog.create.mockResolvedValue({});

      const result = await service.login({
        email: 'test@test.com',
        password: 'SecureP@ss123',
      });

      expect(result.tokens.accessToken).toBe('access-token');
      // passwordHash should NOT be in response
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        id: 'user-123',
        email: 'test@test.com',
        passwordHash: 'hashed',
      });
      mockUsersService.validatePassword.mockResolvedValue(false);
      mockDb.auditLog.create.mockResolvedValue({});

      await expect(
        service.login({ email: 'test@test.com', password: 'WrongPass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for unknown email', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.validatePassword.mockResolvedValue(false);
      mockDb.auditLog.create.mockResolvedValue({});

      await expect(
        service.login({ email: 'nobody@test.com', password: 'AnyPass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for deactivated user', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        id: 'user-123',
        email: 'test@test.com',
        passwordHash: 'hashed',
        isActive: false, // Deactivated
      });
      mockUsersService.validatePassword.mockResolvedValue(true);
      mockDb.auditLog.create.mockResolvedValue({});

      await expect(
        service.login({ email: 'test@test.com', password: 'SecureP@ss123' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ── Logout ─────────────────────────────────────────────────
  describe('logout', () => {
    it('should revoke the refresh token', async () => {
      mockDb.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      mockDb.auditLog.create.mockResolvedValue({});

      await service.logout('user-123', 'some-refresh-token');

      expect(mockDb.refreshToken.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isRevoked: true },
        }),
      );
    });
  });
});

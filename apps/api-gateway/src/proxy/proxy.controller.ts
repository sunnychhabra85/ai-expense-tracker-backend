// =============================================================
// apps/api-gateway/src/proxy/proxy.controller.ts
// Controller to route requests to appropriate microservices
// =============================================================

import {
  All,
  Controller,
  Req,
  Res,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ProxyService } from './proxy.service';
import { ApiTags } from '@nestjs/swagger';

@Controller()
export class ProxyController {
  private readonly logger = new Logger(ProxyController.name);

  constructor(private readonly proxyService: ProxyService) {}

  // ── Auth Service Routes ──────────────────────────────────────
  @All('auth/*')
  @ApiTags('auth')
  async proxyAuth(@Req() req: Request, @Res() res: Response) {
    return this.proxy('auth', req, res);
  }

  // ── Upload Service Routes ────────────────────────────────────
  @All('upload/*')
  @ApiTags('upload')
  async proxyUpload(@Req() req: Request, @Res() res: Response) {
    return this.proxy('upload', req, res);
  }

  // ── Processing Service Routes ────────────────────────────────
  @All('processing/*')
  @ApiTags('processing')
  async proxyProcessing(@Req() req: Request, @Res() res: Response) {
    return this.proxy('processing', req, res);
  }

  // ── Analytics Service Routes ─────────────────────────────────
  @All('analytics/*')
  @ApiTags('analytics')
  async proxyAnalytics(@Req() req: Request, @Res() res: Response) {
    return this.proxy('analytics', req, res);
  }

  // ── Chat Route (Analytics Service) ───────────────────────────
  @All('chat')
  @All('chat/*')
  @ApiTags('analytics')
  async proxyChat(@Req() req: Request, @Res() res: Response) {
    return this.proxy('analytics', req, res);
  }

  // ── Notification Service Routes ──────────────────────────────
  @All('notifications/*')
  @ApiTags('notifications')
  async proxyNotifications(@Req() req: Request, @Res() res: Response) {
    return this.proxy('notification', req, res);
  }

  // ── Helper method to handle proxying ─────────────────────────
  private async proxy(
    serviceName: 'auth' | 'upload' | 'processing' | 'analytics' | 'notification',
    req: Request,
    res: Response,
  ) {
    try {
      // Forward the complete path including /api/v1/{service}/...
      // Gateway receives: /api/v1/auth/register -> Forward to auth-service: /api/v1/auth/register
      const targetPath = req.path;

      this.logger.debug(
        `Routing ${req.method} ${req.path} to ${serviceName} service`,
      );

      const result = await this.proxyService.proxyRequest(
        serviceName,
        targetPath,
        req.method,
        req.headers as Record<string, string>,
        req.body,
        req.query,
      );

      // Forward response headers
      Object.entries(result.headers).forEach(([key, value]) => {
        res.setHeader(key, value as string);
      });

      return res.status(result.status).json(result.data);
    } catch (error) {
      this.logger.error(
        `Error proxying request to ${serviceName}: ${error.message}`,
        error.stack,
      );

      if (error.response) {
        // Forward error response from downstream service
        return res.status(error.response.status).json(error.response.data);
      }

      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_GATEWAY,
          message: `Failed to connect to ${serviceName} service`,
          error: 'Bad Gateway',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}

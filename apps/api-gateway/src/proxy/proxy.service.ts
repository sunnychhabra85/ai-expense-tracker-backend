// =============================================================
// apps/api-gateway/src/proxy/proxy.service.ts
// Service to handle proxying requests to microservices
// =============================================================

import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosRequestConfig } from 'axios';

export interface ProxyResponse {
  status: number;
  headers: Record<string, any>;
  data: any;
}

@Injectable()
export class ProxyService {
  private readonly logger = new Logger(ProxyService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async proxyRequest(
    serviceName: 'auth' | 'upload' | 'processing' | 'analytics' | 'notification',
    path: string,
    method: string,
    headers: Record<string, string>,
    body?: any,
    query?: any,
  ): Promise<ProxyResponse> {
    const services = this.configService.get('services');
    const serviceUrl = services[serviceName];
    
    if (!serviceUrl) {
      throw new Error(`Service ${serviceName} not configured`);
    }

    // Path already includes /api/v1/... from the gateway
    const url = `${serviceUrl}${path}`;
    
    this.logger.debug(`Proxying ${method} ${path} to ${url}`);

    // Forward relevant headers (exclude host, connection, etc.)
    const forwardHeaders = this.filterHeaders(headers);

    const config: AxiosRequestConfig = {
      method: method as any,
      url,
      headers: forwardHeaders,
      params: query,
      data: body,
      timeout: 30000,
    };

    try {
      const response = await firstValueFrom(this.httpService.request(config));
      return {
        status: response.status,
        headers: { ...response.headers } as Record<string, any>,
        data: response.data,
      };
    } catch (error) {
      this.logger.error(
        `Error proxying to ${serviceName}: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private filterHeaders(headers: Record<string, string>): Record<string, string> {
    const filtered: Record<string, string> = {};
    const excludeHeaders = ['host', 'connection', 'content-length'];

    for (const [key, value] of Object.entries(headers)) {
      if (!excludeHeaders.includes(key.toLowerCase())) {
        filtered[key] = value;
      }
    }

    return filtered;
  }
}

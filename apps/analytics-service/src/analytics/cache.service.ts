// =============================================================
// apps/analytics-service/src/analytics/cache.service.ts
// Redis wrapper for dashboard data caching
// =============================================================

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private client: RedisClientType;
  private isConnected = false;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    try {
      this.client = createClient({ url: this.config.get<string>('analytics.redis.url') }) as RedisClientType;
      this.client.on('error', (err) => this.logger.warn(`Redis error: ${err.message}`));
      await this.client.connect();
      this.isConnected = true;
      this.logger.log('Redis connected');
    } catch (err) {
      this.logger.warn(`Redis connection failed — caching disabled: ${err.message}`);
    }
  }

  async onModuleDestroy() {
    if (this.isConnected) await this.client.disconnect();
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.isConnected) return null;
    try {
      const val = await this.client.get(key);
      return val ? JSON.parse(val) : null;
    } catch { return null; }
  }

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    if (!this.isConnected) return;
    try {
      const ttl = ttlSeconds ?? this.config.get<number>('analytics.redis.cacheTtlSeconds', 300);
      await this.client.setEx(key, ttl, JSON.stringify(value));
    } catch (err) {
      this.logger.warn(`Cache set failed: ${err.message}`);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.isConnected) return;
    try { await this.client.del(key); } catch {}
  }

  async delPattern(pattern: string): Promise<void> {
    if (!this.isConnected) return;
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) await this.client.del(keys);
    } catch {}
  }
}

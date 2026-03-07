import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '@finance/database';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';

@ApiTags('health')
@Controller('health')
export class HealthController {
  private readonly s3: S3Client;

  constructor(
    private readonly db: DatabaseService,
    private readonly config: ConfigService,
  ) {
    const region = config.get<string>('upload.s3.region');
    this.s3 = new S3Client({
      region,
      // Add this block for local development with LocalStack:
      ...(process.env.NODE_ENV !== 'production' && {
        endpoint: process.env.AWS_ENDPOINT_URL || 'http://localhost:4566',
        forcePathStyle: true,  // Required for LocalStack S3
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
        },
      }),
    });
  }

  // ── Liveness: Is the service alive? ─────────────────────────
  // K8s restarts the container if this fails 3 times
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Liveness probe' })
  liveness() {
    return {
      status: 'ok',
      service: 'upload-service',
      timestamp: new Date().toISOString(),
    };
  }

  // ── Readiness: Is the service ready for traffic? ─────────────
  // K8s stops routing traffic to this pod if this fails
  // Checks: DB connection + S3 bucket accessibility (if configured)
  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe — checks DB and S3' })
  async readiness() {
    const checks: Record<string, string> = {};
    let allHealthy = true;

    // Check DB
    const dbOk = await this.db.isHealthy();
    checks.database = dbOk ? 'UP' : 'DOWN';
    if (!dbOk) allHealthy = false;

    // Check S3 bucket accessibility (only if bucket is configured)
    const bucketName = this.config.get<string>('upload.s3.bucket');
    if (bucketName) {
      try {
        await this.s3.send(
          new HeadBucketCommand({
            Bucket: bucketName,
          }),
        );
        checks.s3 = 'UP';
      } catch {
        checks.s3 = 'DOWN';
        allHealthy = false;
      }
    } else {
      checks.s3 = 'SKIPPED (not configured)';
    }

    const status = allHealthy ? 200 : 503;
    return {
      status: allHealthy ? 'ok' : 'error',
      service: 'upload-service',
      checks,
      timestamp: new Date().toISOString(),
    };
  }
}
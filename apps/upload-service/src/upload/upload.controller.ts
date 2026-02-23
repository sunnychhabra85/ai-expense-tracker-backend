// =============================================================
// apps/upload-service/src/upload/upload.controller.ts
// REST endpoints for the upload pipeline
// =============================================================

import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { Request } from 'express';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import {
  RequestPresignedUrlDto,
  ConfirmUploadDto,
  ListDocumentsQueryDto,
} from './dto/upload.dto';
import { AuthenticatedUser } from '../../../../libs/shared-types/src';

// Helper: pull current user from request (set by JwtAuthGuard)
function getUser(req: Request & { user: AuthenticatedUser }): AuthenticatedUser {
  return req.user;
}

function getCorrelationId(req: Request & { correlationId?: string }): string {
  return req.correlationId || 'no-correlation-id';
}

@ApiTags('upload')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard) // All upload endpoints require valid JWT
@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  // ── POST /api/v1/upload/presigned-url ────────────────────────
  // Step 1 of 2: Get a presigned URL to upload directly to S3
  @Post('presigned-url')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Request a presigned S3 URL for PDF upload',
    description: `
      Step 1 of the upload flow.
      Returns a presigned URL valid for 5 minutes.
      
      Client must then PUT the file directly to this URL:
      \`\`\`
      PUT {uploadUrl}
      Content-Type: application/pdf
      Body: <file bytes>
      \`\`\`
      Then call /upload/confirm with the documentId.
    `,
  })
  @ApiResponse({ status: 201, description: 'Presigned URL generated' })
  @ApiResponse({ status: 400, description: 'Invalid file type or size' })
  async requestPresignedUrl(
    @Body() dto: RequestPresignedUrlDto,
    @Req() req: any,
  ) {
    const user = getUser(req);
    const result = await this.uploadService.requestPresignedUrl(
      user.id,
      dto,
      getCorrelationId(req),
    );

    return {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  // ── POST /api/v1/upload/confirm ───────────────────────────────
  // Step 2 of 2: Confirm the upload and trigger processing
  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirm upload complete and start processing',
    description: `
      Step 2 of the upload flow. Call this AFTER uploading the file to S3.
      This verifies the file exists in S3 and triggers the processing pipeline.
    `,
  })
  @ApiResponse({ status: 200, description: 'Processing started' })
  @ApiResponse({ status: 400, description: 'File not found in S3 or already confirmed' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async confirmUpload(@Body() dto: ConfirmUploadDto, @Req() req: any) {
    const user = getUser(req);
    const result = await this.uploadService.confirmUpload(
      user.id,
      dto,
      getCorrelationId(req),
    );

    return {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  // ── GET /api/v1/upload/documents ─────────────────────────────
  // List all uploads for the authenticated user
  @Get('documents')
  @ApiOperation({ summary: 'List all uploaded documents (paginated)' })
  @ApiResponse({ status: 200, description: 'Paginated list of documents' })
  async listDocuments(@Query() query: ListDocumentsQueryDto, @Req() req: any) {
    const user = getUser(req);
    const result = await this.uploadService.listDocuments(user.id, query);

    return {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  // ── GET /api/v1/upload/documents/:id/status ──────────────────
  // Poll for processing status — frontend uses this for the progress bar
  @Get('documents/:id/status')
  @ApiOperation({
    summary: 'Get document processing status',
    description: 'Frontend polls this every 2-3 seconds to show progress: UPLOADED → EXTRACTING → COMPLETED',
  })
  @ApiParam({ name: 'id', description: 'Document ID from presigned-url response' })
  @ApiResponse({ status: 200, description: 'Document status' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async getDocumentStatus(@Param('id') id: string, @Req() req: any) {
    const user = getUser(req);
    const result = await this.uploadService.getDocumentStatus(user.id, id);

    return {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  // ── DELETE /api/v1/upload/documents/:id ──────────────────────
  @Delete('documents/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a document and its S3 file' })
  @ApiParam({ name: 'id', description: 'Document ID to delete' })
  async deleteDocument(@Param('id') id: string, @Req() req: any) {
    const user = getUser(req);
    const result = await this.uploadService.deleteDocument(user.id, id);

    return {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }
}

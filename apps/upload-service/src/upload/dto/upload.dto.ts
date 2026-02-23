// =============================================================
// apps/upload-service/src/upload/dto/upload.dto.ts
// All DTOs for upload-related API calls
// =============================================================

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsNumber,
  IsPositive,
  IsOptional,
  IsIn,
} from 'class-validator';

// ── Request: Get a presigned URL ─────────────────────────────
export class RequestPresignedUrlDto {
  @ApiProperty({
    example: 'bank-statement-jan-2024.pdf',
    description: 'Original file name (PDF only)',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;

  @ApiProperty({
    example: 'application/pdf',
    description: 'Must be application/pdf',
  })
  @IsString()
  @IsIn(['application/pdf'], { message: 'Only PDF files are allowed' })
  contentType: string;

  @ApiProperty({
    example: 1048576,
    description: 'File size in bytes (max 10MB)',
  })
  @IsNumber()
  @IsPositive()
  fileSize: number;
}

// ── Response: Presigned URL + document ID ────────────────────
export class PresignedUrlResponseDto {
  @ApiProperty({ example: 'https://s3.amazonaws.com/bucket/uploads/...' })
  uploadUrl: string;

  @ApiProperty({ example: 'doc-uuid-here' })
  documentId: string;

  @ApiProperty({ example: 'uploads/user-id/uuid-filename.pdf' })
  s3Key: string;

  @ApiProperty({ example: 300, description: 'URL expires in this many seconds' })
  expiresInSeconds: number;
}

// ── Request: Confirm upload completed ────────────────────────
// Client calls this AFTER successfully uploading to S3
export class ConfirmUploadDto {
  @ApiProperty({ example: 'doc-uuid-here', description: 'Document ID from presigned URL response' })
  @IsString()
  @IsNotEmpty()
  documentId: string;
}

// ── Response: Document status ────────────────────────────────
export class DocumentStatusDto {
  @ApiProperty()
  id: string;

  @ApiProperty({ example: 'UPLOADED' })
  status: string;

  @ApiProperty()
  fileName: string;

  @ApiProperty()
  createdAt: Date;

  @ApiPropertyOptional({ description: 'Error message if processing failed' })
  errorMsg?: string;
}

// ── Query: List documents ─────────────────────────────────────
export class ListDocumentsQueryDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  page?: number = 1;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  pageSize?: number = 10;
}

// =============================================================
// apps/upload-service/src/upload/upload.service.ts
// Core business logic for the upload pipeline:
//
// Flow:
//   1. User requests presigned URL (POST /upload/presigned-url)
//   2. We create a Document record with status UPLOADED
//   3. We return presigned URL — user uploads directly to S3
//   4. User calls confirm (POST /upload/confirm)
//   5. We verify file exists in S3 (prevents fake confirms)
//   6. We publish SQS message → processing-service picks it up
//   7. User can poll status (GET /upload/documents/:id/status)
// =============================================================

import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '@finance/database';
import { S3Service } from './s3.service';
import { SqsService } from './sqs.service';
import {
  RequestPresignedUrlDto,
  ConfirmUploadDto,
  ListDocumentsQueryDto,
} from './dto/upload.dto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly s3: S3Service,
    private readonly sqs: SqsService,
    private readonly config: ConfigService,
  ) {}

  // ── Step 1: Generate presigned URL ───────────────────────────
  async requestPresignedUrl(
    userId: string,
    dto: RequestPresignedUrlDto,
    correlationId: string,
  ) {
    // Validate: only PDFs allowed
    const allowedTypes = this.config.get<string[]>('upload.allowedMimeTypes', [
      'application/pdf',
    ]);
    if (!allowedTypes.includes(dto.contentType)) {
      throw new BadRequestException(
        `Invalid file type '${dto.contentType}'. Only PDF files are accepted.`,
      );
    }

    // Validate: file size
    const maxSize = this.config.get<number>('upload.maxFileSizeBytes', 10_485_760);
    if (dto.fileSize > maxSize) {
      throw new BadRequestException(
        `File too large. Maximum allowed size is ${maxSize / 1_048_576}MB.`,
      );
    }

    // ── Check for duplicate uploads ─────────────────────────────
    // Prevent uploading the same file (same name + size) multiple times
    // Allow retry only if previous attempt FAILED
    const existingDocument = await this.db.document.findFirst({
      where: {
        userId,
        fileName: dto.fileName,
        fileSize: dto.fileSize,
        status: { in: ['UPLOADED', 'EXTRACTING', 'COMPLETED'] },
      },
      select: { id: true, status: true, createdAt: true },
    });

    if (existingDocument) {
      throw new BadRequestException(
        `Duplicate file detected. You have already uploaded "${dto.fileName}" ` +
          `(Status: ${existingDocument.status}). ` +
          `Please use the existing document or delete it before uploading again.`,
      );
    }

    // ── Create document record with PENDING status ─────────────
    // We use a pre-generated documentId so S3 key and DB record
    // reference the same identifier from the start
    const documentId = uuidv4();

    // Generate S3 presigned URL
    const { uploadUrl, s3Key } = await this.s3.generatePresignedPutUrl({
      userId,
      fileName: dto.fileName,
      contentType: dto.contentType,
      fileSize: dto.fileSize,
      documentId,
    });

    // Save document to DB — status is UPLOADED (not yet confirmed)
    const document = await this.db.document.create({
      data: {
        id: documentId,
        userId,
        s3Key,
        fileName: dto.fileName,
        fileSize: dto.fileSize,
        status: 'UPLOADED',
      },
    });

    this.logger.log(
      JSON.stringify({
        type: 'presigned_url_issued',
        documentId,
        userId,
        fileName: dto.fileName,
        correlationId,
      }),
    );

    return {
      uploadUrl,
      documentId: document.id,
      s3Key,
      expiresInSeconds: this.config.get<number>('upload.s3.presignedUrlExpiry', 300),
    };
  }

  // ── Step 2: Confirm upload & trigger processing ───────────────
  async confirmUpload(
    userId: string,
    dto: ConfirmUploadDto,
    correlationId: string,
  ) {
    // Find the document — must belong to this user
    const document = await this.db.document.findUnique({
      where: { id: dto.documentId },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    // Authorization: users can only confirm their own documents
    if (document.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }

    // Guard against double-confirm
    if (document.status !== 'UPLOADED') {
      throw new BadRequestException(
        `Document is already in status '${document.status}'. Cannot confirm again.`,
      );
    }

    // ── Verify file actually exists in S3 ─────────────────────
    // Prevents users from confirming without actually uploading
    const { exists, contentType } = await this.s3.verifyFileExists(document.s3Key);

    if (!exists) {
      throw new BadRequestException(
        'File not found in storage. Please upload the file before confirming.',
      );
    }

    // Validate content type from S3 metadata
    if (contentType && !contentType.includes('pdf')) {
      // Delete the non-PDF file and reject
      await this.s3.deleteObject(document.s3Key);
      await this.db.document.update({
        where: { id: document.id },
        data: { status: 'FAILED', errorMsg: 'Invalid file type detected in storage' },
      });
      throw new BadRequestException('Only PDF files are accepted.');
    }

    // ── Update status to EXTRACTING ────────────────────────────
    await this.db.document.update({
      where: { id: document.id },
      data: { status: 'EXTRACTING' },
    });

    // ── Publish to SQS — triggers processing-service ──────────
    const messageId = await this.sqs.publishProcessingJob({
      documentId: document.id,
      userId,
      s3Key: document.s3Key,
      fileName: document.fileName,
      correlationId,
    });

    this.logger.log(
      JSON.stringify({
        type: 'upload_confirmed_processing_triggered',
        documentId: document.id,
        userId,
        sqsMessageId: messageId,
        correlationId,
      }),
    );

    return {
      documentId: document.id,
      status: 'EXTRACTING',
      message: 'Upload confirmed. Processing has started.',
      sqsMessageId: messageId,
    };
  }

  // ── Poll document status ──────────────────────────────────────
  async getDocumentStatus(userId: string, documentId: string) {
    const document = await this.db.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        userId: true,
        status: true,
        fileName: true,
        fileSize: true,
        errorMsg: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!document) throw new NotFoundException('Document not found');
    if (document.userId !== userId) throw new ForbiddenException('Access denied');

    return document;
  }

  // ── List all documents for a user ────────────────────────────
  async listDocuments(userId: string, query: ListDocumentsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 10, 50); // cap at 50
    const skip = (page - 1) * pageSize;

    const [documents, total] = await Promise.all([
      this.db.document.findMany({
        where: { userId },
        select: {
          id: true,
          status: true,
          fileName: true,
          fileSize: true,
          errorMsg: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.db.document.count({ where: { userId } }),
    ]);

    return {
      items: documents,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  // ── Delete a document (and its S3 file) ──────────────────────
  async deleteDocument(userId: string, documentId: string) {
    const document = await this.db.document.findUnique({
      where: { id: documentId },
    });

    if (!document) throw new NotFoundException('Document not found');
    if (document.userId !== userId) throw new ForbiddenException('Access denied');

    // Delete from S3 first (if it exists)
    try {
      await this.s3.deleteObject(document.s3Key);
    } catch (err) {
      // Log but don't fail — DB cleanup is more important
      this.logger.warn(`S3 delete failed for ${document.s3Key}: ${err.message}`);
    }

    // Soft-delete approach: mark as deleted vs hard delete
    // For financial data, keeping the record (without file) is safer
    await this.db.document.update({
      where: { id: documentId },
      data: { status: 'FAILED', errorMsg: 'Deleted by user' },
    });

    return { deleted: true, documentId };
  }
}

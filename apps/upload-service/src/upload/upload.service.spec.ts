// =============================================================
// apps/upload-service/src/upload/upload.service.spec.ts
// Unit tests for UploadService — covers the entire upload flow
// =============================================================

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { UploadService } from './upload.service';
import { S3Service } from './s3.service';
import { SqsService } from './sqs.service';
import { DatabaseService } from '../../../../libs/database/src/database.service';

// ── Mocks ────────────────────────────────────────────────────
const mockDb = {
  document: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

const mockS3Service = {
  generatePresignedPutUrl: jest.fn(),
  verifyFileExists: jest.fn(),
  deleteObject: jest.fn(),
};

const mockSqsService = {
  publishProcessingJob: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string, defaultVal?: any) => {
    const config: Record<string, any> = {
      'upload.allowedMimeTypes': ['application/pdf'],
      'upload.maxFileSizeBytes': 10_485_760,
      'upload.s3.presignedUrlExpiry': 300,
    };
    return config[key] ?? defaultVal;
  }),
};

const MOCK_USER_ID = 'user-123';
const MOCK_DOC_ID = 'doc-456';
const MOCK_S3_KEY = `uploads/${MOCK_USER_ID}/${MOCK_DOC_ID}/statement.pdf`;

describe('UploadService', () => {
  let service: UploadService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadService,
        { provide: DatabaseService, useValue: mockDb },
        { provide: S3Service, useValue: mockS3Service },
        { provide: SqsService, useValue: mockSqsService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<UploadService>(UploadService);
    jest.clearAllMocks();
  });

  // ── requestPresignedUrl ────────────────────────────────────
  describe('requestPresignedUrl', () => {
    it('should generate presigned URL for valid PDF', async () => {
      mockS3Service.generatePresignedPutUrl.mockResolvedValue({
        uploadUrl: 'https://s3.example.com/presigned',
        s3Key: MOCK_S3_KEY,
      });
      mockDb.document.create.mockResolvedValue({
        id: MOCK_DOC_ID,
        s3Key: MOCK_S3_KEY,
      });

      const result = await service.requestPresignedUrl(
        MOCK_USER_ID,
        { fileName: 'statement.pdf', contentType: 'application/pdf', fileSize: 500_000 },
        'corr-123',
      );

      expect(result.uploadUrl).toBe('https://s3.example.com/presigned');
      expect(result.expiresInSeconds).toBe(300);
      expect(mockS3Service.generatePresignedPutUrl).toHaveBeenCalledTimes(1);
      expect(mockDb.document.create).toHaveBeenCalledTimes(1);
    });

    it('should reject non-PDF file types', async () => {
      await expect(
        service.requestPresignedUrl(
          MOCK_USER_ID,
          { fileName: 'image.jpg', contentType: 'image/jpeg', fileSize: 100_000 },
          'corr-123',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject files exceeding 10MB', async () => {
      await expect(
        service.requestPresignedUrl(
          MOCK_USER_ID,
          { fileName: 'big.pdf', contentType: 'application/pdf', fileSize: 20_000_000 },
          'corr-123',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── confirmUpload ──────────────────────────────────────────
  describe('confirmUpload', () => {
    const mockDocument = {
      id: MOCK_DOC_ID,
      userId: MOCK_USER_ID,
      s3Key: MOCK_S3_KEY,
      fileName: 'statement.pdf',
      status: 'UPLOADED',
    };

    it('should confirm upload and publish to SQS', async () => {
      mockDb.document.findUnique.mockResolvedValue(mockDocument);
      mockS3Service.verifyFileExists.mockResolvedValue({
        exists: true,
        contentType: 'application/pdf',
      });
      mockDb.document.update.mockResolvedValue({
        ...mockDocument,
        status: 'EXTRACTING',
      });
      mockSqsService.publishProcessingJob.mockResolvedValue('msg-789');

      const result = await service.confirmUpload(
        MOCK_USER_ID,
        { documentId: MOCK_DOC_ID },
        'corr-123',
      );

      expect(result.status).toBe('EXTRACTING');
      expect(result.sqsMessageId).toBe('msg-789');
      expect(mockSqsService.publishProcessingJob).toHaveBeenCalledWith(
        expect.objectContaining({ documentId: MOCK_DOC_ID, userId: MOCK_USER_ID }),
      );
    });

    it('should throw NotFoundException if document does not exist', async () => {
      mockDb.document.findUnique.mockResolvedValue(null);
      await expect(
        service.confirmUpload(MOCK_USER_ID, { documentId: 'nonexistent' }, 'corr-123'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if document belongs to another user', async () => {
      mockDb.document.findUnique.mockResolvedValue({
        ...mockDocument,
        userId: 'other-user-id',
      });
      await expect(
        service.confirmUpload(MOCK_USER_ID, { documentId: MOCK_DOC_ID }, 'corr-123'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if file not found in S3', async () => {
      mockDb.document.findUnique.mockResolvedValue(mockDocument);
      mockS3Service.verifyFileExists.mockResolvedValue({ exists: false });
      await expect(
        service.confirmUpload(MOCK_USER_ID, { documentId: MOCK_DOC_ID }, 'corr-123'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if already confirmed', async () => {
      mockDb.document.findUnique.mockResolvedValue({
        ...mockDocument,
        status: 'EXTRACTING',
      });
      await expect(
        service.confirmUpload(MOCK_USER_ID, { documentId: MOCK_DOC_ID }, 'corr-123'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ── getDocumentStatus ──────────────────────────────────────
  describe('getDocumentStatus', () => {
    it('should return document status for owner', async () => {
      const doc = { id: MOCK_DOC_ID, userId: MOCK_USER_ID, status: 'COMPLETED', fileName: 'stmt.pdf' };
      mockDb.document.findUnique.mockResolvedValue(doc);
      const result = await service.getDocumentStatus(MOCK_USER_ID, MOCK_DOC_ID);
      expect(result.status).toBe('COMPLETED');
    });

    it('should throw ForbiddenException for non-owner', async () => {
      mockDb.document.findUnique.mockResolvedValue({
        id: MOCK_DOC_ID,
        userId: 'other-user',
        status: 'COMPLETED',
      });
      await expect(
        service.getDocumentStatus(MOCK_USER_ID, MOCK_DOC_ID),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});

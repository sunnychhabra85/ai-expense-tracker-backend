// =============================================================
// apps/notification-service/src/notification/notification.service.ts
// =============================================================

import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { DatabaseService } from '@finance/database';

@Injectable()
export class NotificationService {
  constructor(private readonly db: DatabaseService) {}

  async getDocumentStatus(userId: string, documentId: string) {
    const doc = await this.db.document.findUnique({
      where: { id: documentId },
      select: {
        id: true,
        userId: true,
        status: true,
        fileName: true,
        updatedAt: true,
        errorMsg: true,
      },
    });
    if (!doc) throw new NotFoundException('Document not found');
    if (doc.userId !== userId) throw new ForbiddenException('Access denied');
    return doc;
  }
}

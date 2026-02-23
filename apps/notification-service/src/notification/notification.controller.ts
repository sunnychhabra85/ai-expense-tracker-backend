// =============================================================
// apps/notification-service/src/notification/notification.controller.ts
// Server-Sent Events (SSE) for real-time document processing status
// Frontend subscribes to this stream to get live status updates
// =============================================================

import {
  Controller, Get, Param, Req, Res, UseGuards,
  HttpCode, HttpStatus, Sse, MessageEvent,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Observable, interval, from, switchMap, map, takeWhile } from 'rxjs';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { NotificationService } from './notification.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  // GET /api/v1/notifications/documents/:id/status-stream
  // Frontend subscribes with EventSource API for real-time updates
  @Sse('documents/:id/status-stream')
  @ApiOperation({
    summary: 'Server-Sent Events stream for document processing status',
    description: `Connect with EventSource:
const es = new EventSource('/api/v1/notifications/documents/{id}/status-stream', {
  headers: { Authorization: 'Bearer <token>' }
});
es.onmessage = (e) => console.log(JSON.parse(e.data));
`,
  })
  statusStream(
    @Param('id') documentId: string,
    @Req() req: any,
  ): Observable<MessageEvent> {
    // Poll DB every 2 seconds, push status via SSE
    return interval(2000).pipe(
      switchMap(() => from(this.notificationService.getDocumentStatus(req.user.id, documentId))),
      map((doc) => ({
        data: JSON.stringify({
          documentId: doc.id,
          status: doc.status,
          fileName: doc.fileName,
          updatedAt: doc.updatedAt,
          errorMsg: doc.errorMsg,
        }),
        type: 'status',
        id: Date.now().toString(),
      })),
      // Stop the stream once processing is done
      takeWhile((event) => {
        const data = JSON.parse(event.data as string);
        return data.status !== 'COMPLETED' && data.status !== 'FAILED';
      }, true), // 'true' emits the last value before stopping
    );
  }
}

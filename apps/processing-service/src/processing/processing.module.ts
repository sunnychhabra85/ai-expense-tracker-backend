// =============================================================
// apps/processing-service/src/processing/processing.module.ts
// =============================================================

import { Module } from '@nestjs/common';
import { WorkerService } from './worker.service';
import { PdfParserService } from './pdf-parser.service';
import { CategorizerService } from './categorizer.service';

@Module({
  providers: [WorkerService, PdfParserService, CategorizerService],
})
export class ProcessingModule {}

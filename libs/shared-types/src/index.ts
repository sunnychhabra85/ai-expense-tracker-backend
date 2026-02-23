// =============================================================
// libs/shared-types/src/index.ts
// Shared TypeScript types across all services
// =============================================================

// ── JWT ──────────────────────────────────────────────────────
export interface JwtPayload {
  sub: string;    // user id
  email: string;
  iat?: number;
  exp?: number;
}

export interface JwtTokens {
  accessToken: string;
  refreshToken: string;
}

// ── User ─────────────────────────────────────────────────────
export interface AuthenticatedUser {
  id: string;
  email: string;
}

export interface RequestWithUser extends Request {
  user: AuthenticatedUser;
  correlationId?: string;
}

// ── API Responses ─────────────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
  correlationId?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── Document ─────────────────────────────────────────────────
export type DocStatus = 'UPLOADED' | 'EXTRACTING' | 'COMPLETED' | 'FAILED';

// ── Transaction ───────────────────────────────────────────────
export type TxnType = 'DEBIT' | 'CREDIT';
export type SpendingCategory = 'Food' | 'Travel' | 'Shopping' | 'Bills' | 'Entertainment' | 'Others';

// ── SQS Message ───────────────────────────────────────────────
export interface ProcessingJobMessage {
  eventType: 'DOCUMENT_UPLOADED';
  documentId: string;
  userId: string;
  s3Key: string;
  fileName: string;
  correlationId: string;
  timestamp: string;
}

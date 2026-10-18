import type { ApiClient } from './api-client';

export interface PageResponse<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ApiErrorResponse {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  requestId: string;
}

export interface RemoteRepositoryContext {
  api: ApiClient;
  tenantId: string;
}

/** Contract only: the MVP deliberately selects IndexedDB until a real service exists. */
export interface RemoteSyncContract {
  pushChanges(since: string, idempotencyKey: string): Promise<{ acceptedIds: string[]; conflicts: string[]; serverCursor: string }>;
  pullChanges(cursor: string | null, limit: number): Promise<PageResponse<unknown>>;
}

# Synchronization strategy (future)

Synchronization is planned and not implemented. Local IndexedDB is the only active repository.

## Proposed flow

1. Every local mutation commits to business tables and an outbox in the same IndexedDB transaction.
2. Each outbox item has a stable operation ID, entity ID, schema version, creation time, and idempotency key.
3. A worker sends changes in order over HTTPS and retains the item until the server acknowledges it.
4. Retries reuse the same idempotency key. The server stores processed keys with the transaction result so network retries cannot duplicate sales, payments, or purchase receipts.
5. The client pulls changes using an opaque server cursor, validates them, and applies them in a transaction.

## Conflicts

Catalogue edits can use version/ETag checks and show a field-level choice when both local and remote versions changed. Financial records are append-only; resolve concurrent payments and stock changes on the server using serializable/appropriate row locks and return a conflict requiring review. Do not use last-write-wins for invoices, payments, or stock movements.

## Recovery and retries

Use exponential backoff with jitter for transient network errors, bounded retry intervals, and a visible “sync needs attention” state for permanent validation/auth errors. Never discard a local record because an upload failed. The server must provide a change cursor that can be resumed after browser restarts and a full resync endpoint for cursor expiry.

## Required before enabling cloud mode

- Tenant-scoped authentication and authorization.
- Transactional server writes with idempotency storage.
- Outbox/inbox schema and migration policy.
- Conflict UX and audit history.
- Duplicate/retry/network interruption tests.
- Backup, restore, and data retention runbooks.

# Future API contract

The browser MVP has no server. These examples define a versioned HTTP boundary; they are not live endpoints. A future implementation should expose `/api/v1` and validate every request on the server.

## Conventions

- HTTPS only in production.
- Authenticated requests use a short-lived bearer token. The browser must never hold a database credential or private AI key.
- JSON records use stable string `id`, ISO 8601 UTC timestamps, integer `*_minor` currency values, and a `schema_version`.
- Collection endpoints accept `limit` (1–100), opaque `cursor`, `updated_since`, and resource-specific filters. Responses return `{ items, next_cursor, has_more }`.
- Financial mutations require `Idempotency-Key`. Reusing a key with a different payload returns `409 idempotency_conflict`.
- Validation errors return `{ code, message, details, request_id }` with `400` or `422`. Unauthorized/forbidden resources return `401`/`403`; stale versions return `409`.

## Proposed endpoints

| Method and path | Purpose |
| --- | --- |
| `GET /api/v1/products?limit=50&cursor=…` | List products with cursor pagination. |
| `POST /api/v1/products` | Create a validated product. |
| `PATCH /api/v1/products/{id}` | Update mutable catalogue fields using `If-Match`/version. |
| `POST /api/v1/sales` | Atomically create invoice, items, payments, stock movements, and audit event. |
| `GET /api/v1/sales?from=…&to=…&cursor=…` | Filter sales by date and cursor. |
| `POST /api/v1/purchases` | Create a draft purchase. |
| `POST /api/v1/purchases/{id}/receive` | Atomically receive a draft once. |
| `POST /api/v1/payments` | Record a payment against an open sale or purchase balance. |
| `GET /api/v1/sync/changes?cursor=…&limit=…` | Pull ordered changes. |
| `POST /api/v1/sync/changes` | Push idempotent operations and return accepted IDs/conflicts. |

## Sale example

```json
{
  "schema_version": 1,
  "id": "sale_01J…",
  "customer_id": "customer_01J…",
  "items": [{ "product_id": "product_01J…", "quantity": 2 }],
  "discount_minor": 100,
  "tax_rate_bps": 0,
  "payment": { "amount_minor": 5000, "method": "upi" }
}
```

The server resolves current product price/cost, verifies stock, calculates totals, and commits all related rows in one database transaction. It returns the persisted invoice and remaining balance.

## Authorization expectations

Every record is scoped to a business/tenant derived from the authenticated identity, never a caller-supplied tenant ID alone. Enforce role permissions, server-side validation, rate limits, audit logging, and ownership checks for all IDs. Use optimistic concurrency tokens for mutable catalogue/settings records. Keep financial records append-only or use explicit reversal events rather than silent overwrite.

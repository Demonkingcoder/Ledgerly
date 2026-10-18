# Security and data handling

## Implemented now

- Business records stay in IndexedDB in the current browser profile. The UI does not send records to a server or model.
- Import files are limited to 10 MB, parsed as JSON, checked against a versioned Zod schema and cross-record financial/stock consistency rules, previewed, and only then restored after confirmation.
- The service worker caches the static app shell only; it does not cache business records or API responses.
- The app clearly identifies local/demo mode and does not claim browser storage is encrypted.

## Not implemented

- User accounts, authentication, authorization, tenant isolation, encrypted local storage, remote backup, server-side validation, multi-user access, or secure cloud sync.
- Audit events are ordinary local records and are not immutable against a user with access to browser storage.
- A local browser profile can be lost through device failure, browser cleanup, or profile removal.

## Production requirements

Before handling real multi-user business data, add authenticated access, role/tenant checks, secure transport, server validation, database access controls, secure key management, tested backups and restoration, auditability of corrections, retention/deletion policy, privacy review, and incident response. Encrypt backups where appropriate and manage keys outside the browser application. Do not store secrets in `VITE_*` frontend variables.

Users should export a backup regularly and store copies in a location they control. Backup JSON is readable text and should be protected accordingly.

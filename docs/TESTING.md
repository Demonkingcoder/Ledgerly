# Testing and verification

## Automated checks

Run from the project directory:

```powershell
npm run typecheck
npm test
npm run build
```

`tests/domain.test.ts` covers paise parsing, rounding, sale calculation, derived balances, and supported/unsupported assistant questions. `tests/workflows.test.ts` uses fake IndexedDB to cover stock and payment transactions, concurrent duplicate submissions, purchase receiving/cancellation, customer and supplier balances, persistence, schema migration, backup consistency, and import rollback. `tests/ui.test.tsx` covers keyboard focus handling for dialogs and the mobile navigation drawer.

The current environment may restrict package installation or Vite output writes on `D:`. If so, report the exact command and filesystem error, then attempt a non-destructive dependency/output workaround. Do not claim a check passed unless it completed successfully.

## Reliability audit — 2026-10-18

- `npm test`: passed, 30 tests across 3 files.
- `npm run typecheck`: passed.
- `npm run build`: passed, including typecheck and the production Vite bundle.
- Automated checks used the dependencies already available in `D:\coding\ledgerly-app\node_modules`; package installation was not needed for this audit.
- A manual visual browser smoke test was not completed in this audit. Responsive behavior was reviewed in the CSS and the mobile drawer keyboard behavior is covered by a UI test.

## Manual smoke checks

1. Open the dashboard and confirm the demo label and saved local data state.
2. Create a product, adjust stock with a reason, reload, and confirm it remains.
3. Record a sale and verify receipt, payment status, stock movement, and quantity decrement.
4. Create a purchase draft, confirm stock does not change, receive it once, and confirm a second receive has no effect.
5. Record a customer and supplier payment and verify derived balances.
6. Export a backup, attempt an invalid file, and restore a valid backup only after reviewing the preview.
7. Build and serve the production bundle; verify the static shell can reopen offline after it has been visited once.

Playwright browser automation is not configured in this MVP. It can be added when a supported browser binary is available in the development environment.

import type { LedgerSnapshot } from './models';
import { roundRatio } from './money';

/**
 * Checks relationships and arithmetic that individual record schemas cannot
 * validate. Backups are user supplied, so validate their whole ledger before
 * replacing the active database.
 */
export function assertSnapshotIntegrity(snapshot: LedgerSnapshot): void {
  const fail = (detail: string): never => { throw new Error(`Backup records are inconsistent: ${detail}`); };
  const unique = (values: string[], label: string) => {
    if (new Set(values).size !== values.length) fail(`duplicate ${label}.`);
  };
  const assertMap = (expected: Map<string, number>, actual: Map<string, number>, label: string) => {
    const keys = new Set([...expected.keys(), ...actual.keys()]);
    for (const key of keys) {
      if ((expected.get(key) ?? 0) !== (actual.get(key) ?? 0)) fail(`${label} do not match their source records.`);
    }
  };
  const add = (map: Map<string, number>, key: string, value: number) => map.set(key, (map.get(key) ?? 0) + value);

  for (const [rows, label] of [
    [snapshot.products, 'product IDs'], [snapshot.categories, 'category IDs'], [snapshot.customers, 'customer IDs'],
    [snapshot.suppliers, 'supplier IDs'], [snapshot.sales, 'sale IDs'], [snapshot.saleItems, 'sale item IDs'],
    [snapshot.purchases, 'purchase IDs'], [snapshot.purchaseItems, 'purchase item IDs'], [snapshot.payments, 'payment IDs'],
    [snapshot.stockMovements, 'stock movement IDs'], [snapshot.auditEvents, 'audit event IDs'],
  ] as const) unique(rows.map((row) => row.id), label);
  unique(snapshot.categories.map((row) => row.name.toLowerCase()), 'category names');
  unique(snapshot.products.filter((row) => row.sku).map((row) => row.sku.toLowerCase()), 'product SKUs');
  unique(snapshot.sales.map((row) => row.invoiceNo), 'invoice numbers');
  unique(snapshot.sales.map((row) => row.operationKey), 'sale operation keys');
  unique(snapshot.purchases.map((row) => row.reference), 'purchase references');

  const products = new Set(snapshot.products.map((row) => row.id));
  const categories = new Set(snapshot.categories.map((row) => row.id));
  const customers = new Set(snapshot.customers.map((row) => row.id));
  const suppliers = new Set(snapshot.suppliers.map((row) => row.id));
  const sales = new Map(snapshot.sales.map((row) => [row.id, row]));
  const purchases = new Map(snapshot.purchases.map((row) => [row.id, row]));

  for (const product of snapshot.products) {
    if (product.categoryId && !categories.has(product.categoryId)) fail(`product ${product.name} refers to a missing category.`);
  }
  for (const sale of snapshot.sales) {
    if (sale.customerId && !customers.has(sale.customerId)) fail(`sale ${sale.invoiceNo} refers to a missing customer.`);
  }
  for (const purchase of snapshot.purchases) {
    if (!suppliers.has(purchase.supplierId)) fail(`purchase ${purchase.reference} refers to a missing supplier.`);
    if ((purchase.status === 'received') !== Boolean(purchase.receivedAt)) fail(`purchase ${purchase.reference} has an invalid receipt date.`);
  }

  const saleItemsBySale = new Map<string, typeof snapshot.saleItems>();
  const saleItemsBySource = new Map<string, number>();
  for (const item of snapshot.saleItems) {
    const sale = sales.get(item.saleId) ?? fail(`sale item ${item.id} refers to a missing sale.`);
    if (!products.has(item.productId)) fail(`sale item ${item.id} refers to a missing product.`);
    const lineSubtotal = item.quantity * item.unitPriceMinor;
    const taxable = lineSubtotal - item.discountMinor;
    if (!Number.isSafeInteger(lineSubtotal) || lineSubtotal !== item.lineSubtotalMinor || item.discountMinor > lineSubtotal ||
      item.taxMinor !== roundRatio(taxable, sale.taxRateBps, 10000) || item.lineTotalMinor !== taxable + item.taxMinor) {
      fail(`sale item ${item.id} has inconsistent totals.`);
    }
    saleItemsBySale.set(item.saleId, [...(saleItemsBySale.get(item.saleId) ?? []), item]);
    add(saleItemsBySource, `${item.saleId}\u0000${item.productId}`, -item.quantity);
  }

  for (const sale of snapshot.sales) {
    const items = saleItemsBySale.get(sale.id) ?? [];
    const subtotal = items.reduce((sum, item) => sum + item.lineSubtotalMinor, 0);
    const discount = items.reduce((sum, item) => sum + item.discountMinor, 0);
    const tax = items.reduce((sum, item) => sum + item.taxMinor, 0);
    const total = items.reduce((sum, item) => sum + item.lineTotalMinor, 0);
    const cost = items.reduce((sum, item) => sum + item.quantity * item.unitCostMinor, 0);
    const grossProfit = subtotal - discount - cost;
    if (!items.length || ![subtotal, discount, tax, total, cost, grossProfit].every(Number.isSafeInteger) || subtotal !== sale.subtotalMinor ||
      discount !== sale.discountMinor || tax !== sale.taxMinor || total !== sale.totalMinor || discount > subtotal) {
      fail(`sale ${sale.invoiceNo} does not balance to its item rows.`);
    }
  }

  const purchaseItemsByPurchase = new Map<string, typeof snapshot.purchaseItems>();
  for (const item of snapshot.purchaseItems) {
    if (!purchases.has(item.purchaseId)) fail(`purchase item ${item.id} refers to a missing purchase.`);
    if (!products.has(item.productId)) fail(`purchase item ${item.id} refers to a missing product.`);
    const lineTotal = item.quantity * item.unitCostMinor;
    if (!Number.isSafeInteger(lineTotal) || lineTotal !== item.lineTotalMinor) fail(`purchase item ${item.id} has an inconsistent total.`);
    purchaseItemsByPurchase.set(item.purchaseId, [...(purchaseItemsByPurchase.get(item.purchaseId) ?? []), item]);
  }
  for (const purchase of snapshot.purchases) {
    const items = purchaseItemsByPurchase.get(purchase.id) ?? [];
    const subtotal = items.reduce((sum, item) => sum + item.lineTotalMinor, 0);
    if (!items.length || !Number.isSafeInteger(subtotal) || subtotal !== purchase.subtotalMinor) {
      fail(`purchase ${purchase.reference} does not balance to its item rows.`);
    }
  }

  const paymentsBySale = new Map<string, number>();
  const paymentsByPurchase = new Map<string, number>();
  for (const payment of snapshot.payments) {
    if (payment.saleId) {
      const sale = sales.get(payment.saleId);
      if (!sale || payment.purchaseId || payment.direction !== 'in' || payment.partyType !== 'customer' ||
        payment.partyId !== (sale.customerId ?? 'walk-in')) fail(`payment ${payment.id} does not match its sale.`);
      add(paymentsBySale, payment.saleId, payment.amountMinor);
    } else if (payment.purchaseId) {
      const purchase = purchases.get(payment.purchaseId);
      if (!purchase || payment.direction !== 'out' || payment.partyType !== 'supplier' || payment.partyId !== purchase.supplierId) {
        fail(`payment ${payment.id} does not match its purchase.`);
      }
      add(paymentsByPurchase, payment.purchaseId, payment.amountMinor);
    } else fail(`payment ${payment.id} is not allocated to a sale or purchase.`);
  }
  for (const [saleId, amount] of paymentsBySale) {
    if (amount > sales.get(saleId)!.totalMinor) fail(`payments exceed sale ${sales.get(saleId)!.invoiceNo}.`);
  }
  for (const [purchaseId, amount] of paymentsByPurchase) {
    const purchase = purchases.get(purchaseId)!;
    if (purchase.status !== 'received' || amount > purchase.subtotalMinor) fail(`payments exceed the received balance for ${purchase.reference}.`);
  }

  const saleMovements = new Map<string, number>();
  const purchaseMovements = new Map<string, number>();
  for (const movement of snapshot.stockMovements) {
    if (!products.has(movement.productId)) fail(`stock movement ${movement.id} refers to a missing product.`);
    if (movement.source === 'sale') {
      if (!movement.sourceId || !sales.has(movement.sourceId) || movement.quantityDelta >= 0) fail(`stock movement ${movement.id} has an invalid sale source.`);
      add(saleMovements, `${movement.sourceId}\u0000${movement.productId}`, movement.quantityDelta);
    } else if (movement.source === 'purchase') {
      const purchase = movement.sourceId ? purchases.get(movement.sourceId) : undefined;
      if (!purchase || purchase.status !== 'received' || movement.quantityDelta <= 0) fail(`stock movement ${movement.id} has an invalid purchase source.`);
      add(purchaseMovements, `${movement.sourceId}\u0000${movement.productId}`, movement.quantityDelta);
    } else if (movement.sourceId !== null) fail(`stock adjustment ${movement.id} has an unexpected source.`);
  }
  assertMap(saleItemsBySource, saleMovements, 'sale stock movements');

  const receivedPurchaseItems = new Map<string, number>();
  for (const purchase of snapshot.purchases.filter((row) => row.status === 'received')) {
    for (const item of purchaseItemsByPurchase.get(purchase.id) ?? []) add(receivedPurchaseItems, `${purchase.id}\u0000${item.productId}`, item.quantity);
  }
  assertMap(receivedPurchaseItems, purchaseMovements, 'purchase stock movements');
}

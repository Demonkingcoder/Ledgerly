import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LedgerService } from '../src/application/ledger-service';
import { DexieLedgerRepository } from '../src/infrastructure/local/dexie-ledger-repository';
import { LedgerDatabase } from '../src/infrastructure/local/database';
import { customerBalances, supplierBalances } from '../src/domain/calculations';

let db: LedgerDatabase;
let repository: DexieLedgerRepository;
let service: LedgerService;
const names: string[] = [];

async function createRepository() {
  const name = `Ledgerly-test-${crypto.randomUUID()}`;
  names.push(name);
  const database = new LedgerDatabase(name);
  const repo = new DexieLedgerRepository(database);
  await repo.initialize();
  return { database, repo, service: new LedgerService(repo) };
}

beforeEach(async () => {
  const current = await createRepository();
  db = current.database;
  repository = current.repo;
  service = current.service;
});

afterEach(async () => {
  db.close();
  for (const name of names.splice(0)) await new LedgerDatabase(name).delete();
});

describe('atomic sales workflow', () => {
  it('records the sale, payment, and stock movement together', async () => {
    const before = await service.snapshot();
    const stockBefore = before.products.find((product) => product.id === 'prod-tape')!.quantity;
    const saleId = await service.recordSale({
      operationKey: crypto.randomUUID(), customerId: 'customer-meera', lines: [{ productId: 'prod-tape', quantity: 2 }],
      discountMinor: 100, taxRateBps: 0, paidMinor: 5000, method: 'upi',
    });
    const after = await service.snapshot();
    expect(after.products.find((product) => product.id === 'prod-tape')?.quantity).toBe(stockBefore - 2);
    expect(after.sales.some((sale) => sale.id === saleId && sale.totalMinor === 9900)).toBe(true);
    expect(after.payments.some((payment) => payment.saleId === saleId && payment.amountMinor === 5000)).toBe(true);
    expect(after.stockMovements.filter((movement) => movement.sourceId === saleId)).toHaveLength(1);
  });

  it('saves a new checkout customer with the sale and includes their details on the invoice snapshot', async () => {
    const saleId = await service.recordSale({
      operationKey: crypto.randomUUID(), customerId: null,
      newCustomer: { name: 'Riya Patel', phone: '+91 98765 43210', email: 'riya@example.com', address: '12 Market Road' },
      lines: [{ productId: 'prod-paper', quantity: 1 }], discountMinor: 0, taxRateBps: 0, paidMinor: 0, method: 'cash',
    });
    const snapshot = await service.snapshot();
    const customer = snapshot.customers.find((row) => row.name === 'Riya Patel');
    const sale = snapshot.sales.find((row) => row.id === saleId);
    expect(customer).toMatchObject({ address: '12 Market Road', phone: '+91 98765 43210', email: 'riya@example.com', archived: false });
    expect(sale).toMatchObject({ customerId: customer?.id, customerName: 'Riya Patel', customerAddress: '12 Market Road', customerPhone: '+91 98765 43210', customerEmail: 'riya@example.com' });
    expect(snapshot.auditEvents.some((event) => event.entityType === 'customer' && event.entityId === customer?.id)).toBe(true);
  });

  it('does not leave a customer record when a new-customer sale fails stock validation', async () => {
    const before = await service.snapshot();
    await expect(service.recordSale({
      operationKey: crypto.randomUUID(), customerId: null,
      newCustomer: { name: 'Riya Patel', phone: '+91 98765 43210', email: 'riya@example.com' },
      lines: [{ productId: 'prod-marker', quantity: 1 }], discountMinor: 0, taxRateBps: 0, paidMinor: 0, method: 'cash',
    })).rejects.toThrow('Not enough Marker Set');
    expect(await service.snapshot()).toEqual(before);
  });

  it('requires a valid email and phone for a new checkout customer', async () => {
    await expect(service.recordSale({
      operationKey: crypto.randomUUID(), customerId: null,
      newCustomer: { name: 'Riya Patel', phone: '', email: 'not-an-email' },
      lines: [{ productId: 'prod-paper', quantity: 1 }], discountMinor: 0, taxRateBps: 0, paidMinor: 0, method: 'cash',
    })).rejects.toThrow();
    expect((await service.snapshot()).customers.some((customer) => customer.name === 'Riya Patel')).toBe(false);
  });

  it('rejects insufficient stock without partial writes', async () => {
    const before = await service.snapshot();
    await expect(service.recordSale({ operationKey: crypto.randomUUID(), customerId: null, lines: [{ productId: 'prod-marker', quantity: 1 }], discountMinor: 0, taxRateBps: 0, paidMinor: 0, method: 'cash' })).rejects.toThrow('Not enough Marker Set');
    const after = await service.snapshot();
    expect(after.sales).toHaveLength(before.sales.length);
    expect(after.stockMovements).toHaveLength(before.stockMovements.length);
  });

  it('makes repeated submissions with the same idempotency key create only one sale', async () => {
    const operationKey = crypto.randomUUID();
    const input = { operationKey, customerId: null, lines: [{ productId: 'prod-paper', quantity: 1 }], discountMinor: 0, taxRateBps: 0, paidMinor: 26000, method: 'cash' as const };
    const first = await service.recordSale(input);
    const second = await service.recordSale(input);
    const snapshot = await service.snapshot();
    expect(second).toBe(first);
    expect(snapshot.sales.filter((sale) => sale.operationKey === operationKey)).toHaveLength(1);
  });

  it('deduplicates concurrent sale submissions before changing stock or payment history twice', async () => {
    const operationKey = crypto.randomUUID();
    const input = { operationKey, customerId: null, lines: [{ productId: 'prod-paper', quantity: 1 }], discountMinor: 0, taxRateBps: 0, paidMinor: 26000, method: 'cash' as const };
    const before = await service.snapshot();
    const stockBefore = before.products.find((product) => product.id === 'prod-paper')!.quantity;
    const [first, second] = await Promise.all([service.recordSale(input), service.recordSale(input)]);
    const after = await service.snapshot();
    expect(second).toBe(first);
    expect(after.sales.filter((sale) => sale.operationKey === operationKey)).toHaveLength(1);
    expect(after.payments.filter((payment) => payment.saleId === first)).toHaveLength(1);
    expect(after.products.find((product) => product.id === 'prod-paper')?.quantity).toBe(stockBefore - 1);
    expect(after.stockMovements.filter((movement) => movement.sourceId === first)).toHaveLength(1);
  });

  it('rejects duplicate product rows whose combined quantity exceeds available stock', async () => {
    const before = await service.snapshot();
    const stockBefore = before.products.find((product) => product.id === 'prod-tape')!.quantity;
    await expect(service.recordSale({ operationKey: crypto.randomUUID(), customerId: null, lines: [
      { productId: 'prod-tape', quantity: stockBefore }, { productId: 'prod-tape', quantity: 1 },
    ], discountMinor: 0, taxRateBps: 0, paidMinor: 0, method: 'cash' })).rejects.toThrow('Not enough Packing Tape');
    const after = await service.snapshot();
    expect(after.products.find((product) => product.id === 'prod-tape')?.quantity).toBe(stockBefore);
    expect(after.sales).toHaveLength(before.sales.length);
    expect(after.stockMovements).toHaveLength(before.stockMovements.length);
  });

  it('rejects stock adjustments that exceed the safe quantity range', async () => {
    const product = (await db.products.get('prod-paper'))!;
    await db.products.put({ ...product, quantity: Number.MAX_SAFE_INTEGER });
    const movementCount = await db.stockMovements.count();
    await expect(service.adjustStock(product.id, 1, 'Count correction')).rejects.toThrow('outside the supported range');
    expect((await db.products.get(product.id))?.quantity).toBe(Number.MAX_SAFE_INTEGER);
    expect(await db.stockMovements.count()).toBe(movementCount);
  });

  it('records a later payment against the selected invoice balance', async () => {
    const sale = (await service.snapshot()).sales.find((row) => row.id === 'sale-demo-1046')!;
    await service.recordSalePayment({ saleId: sale.id, amountMinor: 5000, method: 'cash', note: '', operationKey: crypto.randomUUID() });
    const snapshot = await service.snapshot();
    expect(snapshot.payments.filter((payment) => payment.saleId === sale.id).reduce((sum, payment) => sum + payment.amountMinor, 0)).toBe(15000);
  });

  it('deduplicates concurrent payment submissions using one operation key', async () => {
    const sale = (await service.snapshot()).sales.find((row) => row.id === 'sale-demo-1046')!;
    const operationKey = crypto.randomUUID();
    const input = { saleId: sale.id, amountMinor: 5000, method: 'cash' as const, note: '', operationKey };
    await Promise.all([service.recordSalePayment(input), service.recordSalePayment(input)]);
    const snapshot = await service.snapshot();
    expect(snapshot.payments.filter((payment) => payment.operationKey === operationKey)).toHaveLength(1);
    expect(snapshot.payments.filter((payment) => payment.saleId === sale.id).reduce((sum, payment) => sum + payment.amountMinor, 0)).toBe(15000);
  });
});

describe('purchase and payments workflows', () => {
  it('does not increase stock for a draft and receives it exactly once', async () => {
    const before = await service.snapshot();
    const initialStock = before.products.find((product) => product.id === 'prod-roll')!.quantity;
    const purchaseId = await service.createPurchase({ supplierId: 'supplier-bhopal', lines: [{ productId: 'prod-roll', quantity: 4, unitCostMinor: 14000 }], notes: '', status: 'draft', paidMinor: 0, method: 'bank', operationKey: crypto.randomUUID() });
    expect((await service.snapshot()).products.find((product) => product.id === 'prod-roll')?.quantity).toBe(initialStock);
    await service.receivePurchase(purchaseId);
    await service.receivePurchase(purchaseId);
    const after = await service.snapshot();
    expect(after.products.find((product) => product.id === 'prod-roll')?.quantity).toBe(initialStock + 4);
    expect(after.stockMovements.filter((movement) => movement.sourceId === purchaseId)).toHaveLength(1);
  });

  it('combines repeated product lines when receiving a purchase', async () => {
    const initialStock = (await service.snapshot()).products.find((product) => product.id === 'prod-paper')!.quantity;
    const purchaseId = await service.createPurchase({
      supplierId: 'supplier-central',
      lines: [
        { productId: 'prod-paper', quantity: 3, unitCostMinor: 20000 },
        { productId: 'prod-paper', quantity: 2, unitCostMinor: 20500 },
      ],
      notes: '', status: 'received', paidMinor: 0, method: 'bank', operationKey: crypto.randomUUID(),
    });
    const after = await service.snapshot();
    expect(after.products.find((product) => product.id === 'prod-paper')?.quantity).toBe(initialStock + 5);
    expect(after.stockMovements.filter((movement) => movement.sourceId === purchaseId).map((movement) => movement.quantityDelta)).toEqual([5]);
    expect(after.purchaseItems.filter((item) => item.purchaseId === purchaseId)).toHaveLength(2);
  });

  it('does not receive a purchase twice when two receipt requests race', async () => {
    const initialStock = (await service.snapshot()).products.find((product) => product.id === 'prod-roll')!.quantity;
    const purchaseId = await service.createPurchase({ supplierId: 'supplier-bhopal', lines: [{ productId: 'prod-roll', quantity: 3, unitCostMinor: 14000 }], notes: '', status: 'draft', paidMinor: 0, method: 'bank', operationKey: crypto.randomUUID() });
    await Promise.all([service.receivePurchase(purchaseId), service.receivePurchase(purchaseId)]);
    const after = await service.snapshot();
    expect(after.products.find((product) => product.id === 'prod-roll')?.quantity).toBe(initialStock + 3);
    expect(after.stockMovements.filter((movement) => movement.sourceId === purchaseId)).toHaveLength(1);
  });

  it('rolls back a receipt when adding stock would exceed the safe quantity range', async () => {
    const purchaseId = await service.createPurchase({ supplierId: 'supplier-bhopal', lines: [{ productId: 'prod-roll', quantity: 1, unitCostMinor: 14500 }], notes: '', status: 'draft', paidMinor: 0, method: 'bank', operationKey: crypto.randomUUID() });
    const product = (await db.products.get('prod-roll'))!;
    await db.products.put({ ...product, quantity: Number.MAX_SAFE_INTEGER });
    const movementCount = await db.stockMovements.count();
    await expect(service.receivePurchase(purchaseId)).rejects.toThrow('outside the supported range');
    expect((await db.purchases.get(purchaseId))?.status).toBe('draft');
    expect((await db.products.get(product.id))?.quantity).toBe(Number.MAX_SAFE_INTEGER);
    expect(await db.stockMovements.count()).toBe(movementCount);
  });

  it('cancels a draft without affecting inventory', async () => {
    const initialStock = (await service.snapshot()).products.find((product) => product.id === 'prod-paper')!.quantity;
    const purchaseId = await service.createPurchase({ supplierId: 'supplier-central', lines: [{ productId: 'prod-paper', quantity: 5, unitCostMinor: 20000 }], notes: '', status: 'draft', paidMinor: 0, method: 'bank', operationKey: crypto.randomUUID() });
    await service.cancelPurchase(purchaseId);
    const after = await service.snapshot();
    expect(after.products.find((product) => product.id === 'prod-paper')?.quantity).toBe(initialStock);
    expect(after.purchases.find((purchase) => purchase.id === purchaseId)?.status).toBe('cancelled');
  });

  it('derives balances from payments and rejects overpayment without writes', async () => {
    const before = await service.snapshot();
    await expect(service.recordPartyPayment({ partyType: 'customer', partyId: 'customer-kabir', amountMinor: 999999, method: 'cash', note: '', operationKey: crypto.randomUUID() })).rejects.toThrow('Payment exceeds');
    const after = await service.snapshot();
    expect(after.payments).toHaveLength(before.payments.length);
  });

  it('allocates customer and supplier payments to open records and updates both balances', async () => {
    await service.recordPartyPayment({ partyType: 'customer', partyId: 'customer-meera', amountMinor: 5000, method: 'upi', note: '', operationKey: crypto.randomUUID() });
    await service.recordPartyPayment({ partyType: 'supplier', partyId: 'supplier-bhopal', amountMinor: 20000, method: 'bank', note: '', operationKey: crypto.randomUUID() });
    const snapshot = await service.snapshot();
    expect(customerBalances(snapshot).find((row) => row.partyId === 'customer-meera')?.balanceMinor).toBe(10000);
    expect(supplierBalances(snapshot).find((row) => row.partyId === 'supplier-bhopal')?.balanceMinor).toBe(40000);
  });
});

describe('local persistence and backup safety', () => {
  it('keeps records when a fresh repository instance opens the same IndexedDB database', async () => {
    const name = db.name;
    const count = (await service.snapshot()).sales.length;
    db.close();
    db = new LedgerDatabase(name);
    repository = new DexieLedgerRepository(db);
    service = new LedgerService(repository);
    await repository.initialize();
    expect((await service.snapshot()).sales).toHaveLength(count);
  });

  it('rejects an invalid backup without changing saved records', async () => {
    const before = await service.snapshot();
    await expect(service.validateBackupText('{"schemaVersion":99}')).rejects.toThrow();
    await expect(service.validateBackupText('not json')).rejects.toThrow('valid JSON');
    expect((await service.snapshot()).sales).toHaveLength(before.sales.length);
  });

  it('rejects a backup whose sale header disagrees with its item records', async () => {
    const before = await service.snapshot();
    const corrupted = structuredClone(before);
    corrupted.sales[0].totalMinor += 1;
    const backupText = JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), data: corrupted });
    await expect(service.validateBackupText(backupText)).rejects.toThrow('does not balance to its item rows');
    await expect(service.importBackup(corrupted)).rejects.toThrow('does not balance to its item rows');
    expect(await service.snapshot()).toEqual(before);
  });

  it('accepts older backups without customer addresses or sale contact snapshots', async () => {
    const oldSnapshot = structuredClone(await service.snapshot()) as Record<string, any>;
    for (const customer of oldSnapshot.customers) delete customer.address;
    for (const sale of oldSnapshot.sales) {
      delete sale.customerAddress;
      delete sale.customerPhone;
      delete sale.customerEmail;
    }
    const backup = JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), data: oldSnapshot });
    const validated = await service.validateBackupText(backup);
    expect(validated.document.data.customers[0].address).toBe('');
    expect(validated.document.data.sales[0].customerPhone).toBeUndefined();
  });

  it('keeps the active database intact when an import write fails after clearing starts', async () => {
    const before = await service.snapshot();
    const failedWrite = vi.spyOn(db.sales, 'bulkAdd').mockRejectedValueOnce(new Error('simulated interrupted import'));
    await expect(service.importBackup(before)).rejects.toThrow('simulated interrupted import');
    failedWrite.mockRestore();
    expect(await service.snapshot()).toEqual(before);
  });

  it('upgrades a version 1 database without losing records and creates missing settings', async () => {
    const name = `Ledgerly-migration-${crypto.randomUUID()}`;
    names.push(name);
    const legacy = new Dexie(name);
    legacy.version(1).stores({ products: '&id', customers: '&id, name, phone, archived', settings: '&id' });
    await legacy.open();
    await legacy.table('products').add({
      id: 'legacy-product', name: 'Legacy item', sku: '', categoryId: null, categoryName: 'General', unit: 'each',
      costMinor: 10, priceMinor: 20, quantity: 7, reorderPoint: 1, archived: false,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    await legacy.table('customers').add({
      id: 'legacy-customer', name: 'Legacy Customer', phone: '', email: '', notes: '', archived: false,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    await legacy.close();

    const upgraded = new LedgerDatabase(name);
    await upgraded.open();
    expect((await upgraded.products.get('legacy-product'))?.quantity).toBe(7);
    expect((await upgraded.customers.get('legacy-customer'))?.address).toBe('');
    expect(await upgraded.settings.get('business')).toMatchObject({ businessName: 'My Shop', currency: 'INR', demoData: true });
    expect(await upgraded.stockMovements.where('productId').equals('legacy-product').toArray()).toMatchObject([
      { productId: 'legacy-product', quantityDelta: 7, reason: 'Stock count at database upgrade', source: 'adjustment' },
    ]);
    upgraded.close();
  });

  it('shows demo stock quantities that reconcile with movement history', async () => {
    const snapshot = await service.snapshot();
    for (const product of snapshot.products) {
      const movementTotal = snapshot.stockMovements.filter((movement) => movement.productId === product.id)
        .reduce((sum, movement) => sum + movement.quantityDelta, 0);
      expect(movementTotal, product.name).toBe(product.quantity);
    }
  });
});

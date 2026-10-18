import Dexie, { type Table } from 'dexie';
import type {
  AuditEvent, BusinessSettings, Category, Customer, OperationRecord, Payment, Product,
  Purchase, PurchaseItem, Sale, SaleItem, StockMovement, Supplier,
} from '../../domain/models';

export class LedgerDatabase extends Dexie {
  products!: Table<Product, string>;
  categories!: Table<Category, string>;
  customers!: Table<Customer, string>;
  suppliers!: Table<Supplier, string>;
  sales!: Table<Sale, string>;
  saleItems!: Table<SaleItem, string>;
  purchases!: Table<Purchase, string>;
  purchaseItems!: Table<PurchaseItem, string>;
  payments!: Table<Payment, string>;
  stockMovements!: Table<StockMovement, string>;
  auditEvents!: Table<AuditEvent, string>;
  operations!: Table<OperationRecord, string>;
  settings!: Table<BusinessSettings, string>;

  constructor(name = 'LedgerlyLocal') {
    super(name);
    this.version(1).stores({
      products: '&id, sku, categoryName, archived, updatedAt',
      categories: '&id, &name',
      customers: '&id, name, phone, archived',
      suppliers: '&id, name, phone, archived',
      sales: '&id, &invoiceNo, operationKey, customerId, createdAt',
      saleItems: '&id, saleId, productId',
      purchases: '&id, &reference, supplierId, status, createdAt',
      purchaseItems: '&id, purchaseId, productId',
      payments: '&id, operationKey, partyId, direction, saleId, purchaseId, createdAt',
      stockMovements: '&id, productId, source, createdAt',
      auditEvents: '&id, entityType, entityId, createdAt',
      operations: '&id, createdAt',
      settings: '&id',
    });
    this.version(2).stores({
      products: '&id, sku, categoryName, archived, updatedAt',
      categories: '&id, &name',
      customers: '&id, name, phone, archived',
      suppliers: '&id, name, phone, archived',
      sales: '&id, &invoiceNo, operationKey, customerId, createdAt',
      saleItems: '&id, saleId, productId',
      purchases: '&id, &reference, supplierId, status, createdAt',
      purchaseItems: '&id, purchaseId, productId',
      payments: '&id, operationKey, partyId, direction, saleId, purchaseId, createdAt',
      stockMovements: '&id, productId, source, createdAt',
      auditEvents: '&id, entityType, entityId, createdAt',
      operations: '&id, createdAt',
      settings: '&id',
    }).upgrade(async (transaction) => {
      const settings = transaction.table('settings');
      if (!(await settings.get('business'))) {
        await settings.put({
          id: 'business', businessName: 'My Shop', phone: '', address: '', currency: 'INR',
          taxEnabled: false, taxRateBps: 0, defaultReorderPoint: 10, theme: 'light', demoData: true,
          updatedAt: new Date().toISOString(),
        });
      }
    });
    this.version(3).stores({
      products: '&id, sku, categoryName, archived, updatedAt',
      categories: '&id, &name',
      customers: '&id, name, phone, archived',
      suppliers: '&id, name, phone, archived',
      sales: '&id, &invoiceNo, operationKey, customerId, createdAt',
      saleItems: '&id, saleId, productId',
      purchases: '&id, &reference, supplierId, status, createdAt',
      purchaseItems: '&id, purchaseId, productId',
      payments: '&id, operationKey, partyId, direction, saleId, purchaseId, createdAt',
      stockMovements: '&id, productId, source, createdAt',
      auditEvents: '&id, entityType, entityId, createdAt',
      operations: '&id, createdAt',
      settings: '&id',
    }).upgrade(async (transaction) => {
      const products = await transaction.table('products').toArray() as Product[];
      const movements = await transaction.table('stockMovements').toArray() as StockMovement[];
      const movementTotals = new Map<string, number>();
      for (const movement of movements) {
        const quantity = (movementTotals.get(movement.productId) ?? 0) + movement.quantityDelta;
        if (!Number.isSafeInteger(quantity)) throw new Error('Existing stock history is outside the supported range; database migration stopped safely.');
        movementTotals.set(movement.productId, quantity);
      }
      const now = new Date().toISOString();
      const reconciliation: StockMovement[] = [];
      for (const product of products) {
        if (!Number.isSafeInteger(product.quantity) || product.quantity < 0) throw new Error(`Product ${product.name} has an invalid stock quantity; database migration stopped safely.`);
        const quantityDelta = product.quantity - (movementTotals.get(product.id) ?? 0);
        if (!Number.isSafeInteger(quantityDelta)) throw new Error(`Product ${product.name} stock cannot be reconciled safely; database migration stopped safely.`);
        if (quantityDelta !== 0) reconciliation.push({
          id: makeId('move'), productId: product.id, productName: product.name, quantityDelta,
          reason: 'Stock count at database upgrade', source: 'adjustment', sourceId: null, createdAt: now,
        });
      }
      if (reconciliation.length) await transaction.table('stockMovements').bulkAdd(reconciliation);
    });
    this.version(4).stores({
      products: '&id, sku, categoryName, archived, updatedAt',
      categories: '&id, &name',
      customers: '&id, name, phone, archived',
      suppliers: '&id, name, phone, archived',
      sales: '&id, &invoiceNo, operationKey, customerId, createdAt',
      saleItems: '&id, saleId, productId',
      purchases: '&id, &reference, supplierId, status, createdAt',
      purchaseItems: '&id, purchaseId, productId',
      payments: '&id, operationKey, partyId, direction, saleId, purchaseId, createdAt',
      stockMovements: '&id, productId, source, createdAt',
      auditEvents: '&id, entityType, entityId, createdAt',
      operations: '&id, createdAt',
      settings: '&id',
    }).upgrade(async (transaction) => {
      await transaction.table('customers').toCollection().modify((customer: Customer) => {
        customer.address ??= '';
      });
    });
  }
}

export const ledgerDatabase = new LedgerDatabase();

export function makeId(prefix: string): string {
  const uuid = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${uuid}`;
}

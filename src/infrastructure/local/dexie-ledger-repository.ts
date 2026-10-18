import { type Table } from 'dexie';
import type { LedgerRepository, NewCategory, NewCustomer, NewProduct, NewSupplier } from '../../application/ports';
import { calculateSaleTotals } from '../../domain/calculations';
import type {
  AuditEvent, BusinessSettings, Category, CreatePurchaseInput, Customer, LedgerSnapshot, OperationRecord,
  Payment, Product, Purchase, PurchaseItem, RecordSaleInput, Sale, SaleItem, StockMovement, Supplier,
} from '../../domain/models';
import { assertSnapshotIntegrity } from '../../domain/snapshot-integrity';
import {
  auditEventSchema, categorySchema, customerSchema, paymentSchema, productSchema, purchaseItemSchema,
  purchaseSchema, saleCustomerInputSchema, saleItemSchema, saleSchema, settingsSchema, stockMovementSchema, supplierSchema,
} from '../../domain/validation';
import { emptySnapshot, makeDemoSnapshot, seedDemoData } from './demo-data';
import { LedgerDatabase, makeId } from './database';

const stamp = () => new Date().toISOString();
const required = <T>(value: T | undefined, message: string): T => {
  if (value === undefined) throw new Error(message);
  return value;
};
type ReceiptRow = { product: Product; quantity: number; unitCostMinor: number };
function mergeReceiptRows(rows: ReceiptRow[]): ReceiptRow[] {
  const grouped = new Map<string, ReceiptRow>();
  for (const row of rows) {
    const current = grouped.get(row.product.id);
    if (current) {
      current.quantity += row.quantity;
      if (!Number.isSafeInteger(current.quantity)) throw new Error(`Received quantity for ${row.product.name} is outside the supported range.`);
      current.unitCostMinor = row.unitCostMinor;
    } else grouped.set(row.product.id, { ...row });
  }
  return [...grouped.values()];
}

function stockAfterChange(product: Product, delta: number): number {
  const quantity = product.quantity + delta;
  if (!Number.isSafeInteger(quantity)) throw new Error(`Stock quantity for ${product.name} is outside the supported range.`);
  if (quantity < 0) throw new Error('This adjustment would make stock negative.');
  return quantity;
}

export class DexieLedgerRepository implements LedgerRepository {
  private readonly listeners = new Set<() => void>();

  constructor(private readonly db: LedgerDatabase) {}

  async initialize(): Promise<void> {
    await this.db.open();
    const settings = await this.db.settings.get('business');
    if (!settings) await seedDemoData(this.db);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  async getSnapshot(): Promise<LedgerSnapshot> {
    const [products, categories, customers, suppliers, sales, saleItems, purchases, purchaseItems, payments, stockMovements, auditEvents, settings] = await Promise.all([
      this.db.products.toArray(), this.db.categories.toArray(), this.db.customers.toArray(), this.db.suppliers.toArray(),
      this.db.sales.toArray(), this.db.saleItems.toArray(), this.db.purchases.toArray(), this.db.purchaseItems.toArray(),
      this.db.payments.toArray(), this.db.stockMovements.toArray(), this.db.auditEvents.toArray(), this.db.settings.get('business'),
    ]);
    return { products, categories, customers, suppliers, sales, saleItems, purchases, purchaseItems, payments, stockMovements, auditEvents, settings: settings ?? emptySnapshot().settings };
  }

  async addProduct(input: NewProduct): Promise<Product> {
    const now = stamp();
    const sku = input.sku.trim();
    if (sku && (await this.db.products.toArray()).some((product) => product.sku.toLowerCase() === sku.toLowerCase())) throw new Error('That SKU is already in use.');
    const categoryName = input.categoryName.trim() || 'General';
    const existingCategory = (await this.db.categories.toArray()).find((category) => category.name.toLowerCase() === categoryName.toLowerCase());
    const category: Category = existingCategory ?? categorySchema.parse({ id: makeId('cat'), name: categoryName, createdAt: now });
    const product = productSchema.parse({ ...input, name: input.name.trim(), sku, categoryId: category.id, categoryName, archived: false, id: makeId('prod'), createdAt: now, updatedAt: now });
    await this.db.transaction('rw', [this.db.products, this.db.categories, this.db.stockMovements, this.db.auditEvents], async () => {
      if (!existingCategory) await this.db.categories.add(category);
      await this.db.products.add(product);
      if (product.quantity > 0) {
        const movement: StockMovement = stockMovementSchema.parse({ id: makeId('move'), productId: product.id, productName: product.name, quantityDelta: product.quantity, reason: 'Opening stock', source: 'adjustment', sourceId: null, createdAt: now });
        await this.db.stockMovements.add(movement);
      }
      await this.writeAudit('product.created', 'product', product.id, `Added ${product.name}`);
    });
    this.notify();
    return product;
  }

  async updateProduct(product: Product): Promise<void> {
    const current = required(await this.db.products.get(product.id), 'Product not found.');
    const normalized = productSchema.parse({ ...product, updatedAt: stamp() });
    if (normalized.sku && (await this.db.products.toArray()).some((item) => item.id !== normalized.id && item.sku.toLowerCase() === normalized.sku.toLowerCase())) throw new Error('That SKU is already in use.');
    await this.db.products.put({ ...normalized, quantity: current.quantity, createdAt: current.createdAt });
    await this.writeAudit('product.updated', 'product', product.id, `Updated ${product.name}`);
    this.notify();
  }

  async archiveProduct(productId: string): Promise<void> {
    const product = required(await this.db.products.get(productId), 'Product not found.');
    await this.db.products.put({ ...product, archived: true, updatedAt: stamp() });
    await this.writeAudit('product.archived', 'product', productId, `Archived ${product.name}`);
    this.notify();
  }

  async addCategory(input: NewCategory): Promise<Category> {
    const name = input.name.trim();
    const existing = (await this.db.categories.toArray()).find((category) => category.name.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    const category = categorySchema.parse({ id: makeId('cat'), name, createdAt: stamp() });
    await this.db.categories.add(category);
    this.notify();
    return category;
  }

  async addCustomer(input: NewCustomer): Promise<Customer> {
    const now = stamp();
    const customer = customerSchema.parse({ ...input, name: input.name.trim(), id: makeId('cus'), archived: false, createdAt: now, updatedAt: now });
    await this.db.customers.add(customer);
    await this.writeAudit('customer.created', 'customer', customer.id, `Added ${customer.name}`);
    this.notify();
    return customer;
  }

  async updateCustomer(customer: Customer): Promise<void> {
    required(await this.db.customers.get(customer.id), 'Customer not found.');
    await this.db.customers.put(customerSchema.parse({ ...customer, updatedAt: stamp() }));
    await this.writeAudit('customer.updated', 'customer', customer.id, `Updated ${customer.name}`);
    this.notify();
  }

  async archiveCustomer(customerId: string): Promise<void> {
    const customer = required(await this.db.customers.get(customerId), 'Customer not found.');
    await this.db.customers.put({ ...customer, archived: true, updatedAt: stamp() });
    await this.writeAudit('customer.archived', 'customer', customerId, `Archived ${customer.name}`);
    this.notify();
  }

  async addSupplier(input: NewSupplier): Promise<Supplier> {
    const now = stamp();
    const supplier = supplierSchema.parse({ ...input, name: input.name.trim(), id: makeId('sup'), archived: false, createdAt: now, updatedAt: now });
    await this.db.suppliers.add(supplier);
    await this.writeAudit('supplier.created', 'supplier', supplier.id, `Added ${supplier.name}`);
    this.notify();
    return supplier;
  }

  async updateSupplier(supplier: Supplier): Promise<void> {
    required(await this.db.suppliers.get(supplier.id), 'Supplier not found.');
    await this.db.suppliers.put(supplierSchema.parse({ ...supplier, updatedAt: stamp() }));
    await this.writeAudit('supplier.updated', 'supplier', supplier.id, `Updated ${supplier.name}`);
    this.notify();
  }

  async archiveSupplier(supplierId: string): Promise<void> {
    const supplier = required(await this.db.suppliers.get(supplierId), 'Supplier not found.');
    await this.db.suppliers.put({ ...supplier, archived: true, updatedAt: stamp() });
    await this.writeAudit('supplier.archived', 'supplier', supplierId, `Archived ${supplier.name}`);
    this.notify();
  }

  async adjustStock(productId: string, delta: number, reason: string): Promise<void> {
    if (!Number.isSafeInteger(delta) || delta === 0) throw new Error('Enter a non-zero whole number adjustment.');
    const cleanReason = reason.trim();
    if (!cleanReason) throw new Error('A reason is required for every stock adjustment.');
    await this.db.transaction('rw', [this.db.products, this.db.stockMovements, this.db.auditEvents], async () => {
      const product = required(await this.db.products.get(productId), 'Product not found.');
      const quantity = stockAfterChange(product, delta);
      const now = stamp();
      await this.db.products.put({ ...product, quantity, updatedAt: now });
      await this.db.stockMovements.add(stockMovementSchema.parse({ id: makeId('move'), productId, productName: product.name, quantityDelta: delta, reason: cleanReason, source: 'adjustment', sourceId: null, createdAt: now }));
      await this.writeAudit('stock.adjusted', 'product', productId, `${product.name}: ${delta > 0 ? '+' : ''}${delta} (${cleanReason})`);
    });
    this.notify();
  }

  async recordSale(input: RecordSaleInput): Promise<string> {
    const existingOperation = await this.db.operations.get(input.operationKey);
    if (existingOperation) return existingOperation.resultId;
    if (!input.operationKey.trim()) throw new Error('Sale operation key is required.');
    const quantities = new Map<string, number>();
    input.lines.forEach((line) => quantities.set(line.productId, (quantities.get(line.productId) ?? 0) + line.quantity));
    if (!quantities.size) throw new Error('Add at least one product to the sale.');

    const saleId = makeId('sale');
    const now = stamp();
    await this.db.transaction('rw', [this.db.products, this.db.sales, this.db.saleItems, this.db.payments, this.db.stockMovements, this.db.auditEvents, this.db.operations, this.db.customers], async () => {
      if (await this.db.operations.get(input.operationKey)) return;
      const products: Product[] = [];
      for (const [productId, quantity] of quantities) {
        const product = required(await this.db.products.get(productId), 'A selected product no longer exists.');
        if (product.archived) throw new Error(`${product.name} is archived and cannot be sold.`);
        if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Sale quantities must be positive whole numbers.');
        if (quantity > product.quantity) throw new Error(`Not enough ${product.name} in stock. Available: ${product.quantity} ${product.unit}.`);
        products.push(product);
      }
      const lines = products.map((product) => ({ product, quantity: quantities.get(product.id) ?? 0 }));
      const totals = calculateSaleTotals(lines.map(({ product, quantity }) => ({ quantity, unitPriceMinor: product.priceMinor, unitCostMinor: product.costMinor })), input.discountMinor, input.taxRateBps);
      if (!Number.isSafeInteger(input.paidMinor) || input.paidMinor < 0 || input.paidMinor > totals.totalMinor) throw new Error('Payment must be between zero and the sale total.');
      if (input.newCustomer && input.customerId) throw new Error('Choose either an existing customer or enter a new customer.');
      let customer = input.customerId ? required(await this.db.customers.get(input.customerId), 'Customer not found.') : undefined;
      if (input.newCustomer) {
        const details = saleCustomerInputSchema.parse(input.newCustomer);
        customer = customerSchema.parse({
          ...details, id: makeId('cus'), notes: '', archived: false, createdAt: now, updatedAt: now,
        });
        await this.db.customers.add(customer);
        await this.writeAudit('customer.created', 'customer', customer.id, `Added ${customer.name} during checkout`);
      }
      const sale: Sale = saleSchema.parse({
        id: saleId, invoiceNo: `INV-${new Date().toISOString().slice(2, 10).replaceAll('-', '')}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
        operationKey: input.operationKey, customerId: customer?.id ?? null, customerName: customer?.name ?? 'Walk-in customer',
        customerAddress: customer?.address ?? '', customerPhone: customer?.phone ?? '', customerEmail: customer?.email ?? '',
        createdAt: now, subtotalMinor: totals.subtotalMinor, discountMinor: totals.discountMinor, taxMinor: totals.taxMinor, taxRateBps: input.taxRateBps, totalMinor: totals.totalMinor,
      });
      const saleItems: SaleItem[] = lines.map(({ product, quantity }, index) => saleItemSchema.parse({
        id: makeId('sli'), saleId, productId: product.id, productName: product.name, sku: product.sku, quantity,
        unitPriceMinor: product.priceMinor, unitCostMinor: product.costMinor, lineSubtotalMinor: product.priceMinor * quantity,
        ...totals.itemAdjustments[index],
      }));
      await this.db.sales.add(sale);
      await this.db.saleItems.bulkAdd(saleItems);
      for (const { product, quantity } of lines) {
        await this.db.products.put({ ...product, quantity: product.quantity - quantity, updatedAt: now });
        await this.db.stockMovements.add(stockMovementSchema.parse({ id: makeId('move'), productId: product.id, productName: product.name, quantityDelta: -quantity, reason: `Sale ${sale.invoiceNo}`, source: 'sale', sourceId: saleId, createdAt: now }));
      }
      if (input.paidMinor > 0) {
        const payment: Payment = paymentSchema.parse({ id: makeId('pay'), direction: 'in', partyType: 'customer', partyId: customer?.id ?? 'walk-in', saleId, purchaseId: null, amountMinor: input.paidMinor, method: input.method, operationKey: input.operationKey, createdAt: now, note: 'Sale payment' });
        await this.db.payments.add(payment);
      }
      await this.db.operations.add({ id: input.operationKey, resultId: saleId, createdAt: now } satisfies OperationRecord);
      await this.writeAudit('sale.created', 'sale', saleId, `Recorded ${sale.invoiceNo} for ${sale.customerName}`);
    });
    const operation = await this.db.operations.get(input.operationKey);
    this.notify();
    return operation?.resultId ?? saleId;
  }

  async createPurchase(input: CreatePurchaseInput): Promise<string> {
    const existing = await this.db.operations.get(input.operationKey);
    if (existing) return existing.resultId;
    if (!input.lines.length) throw new Error('Add at least one product to the purchase.');
    const purchaseId = makeId('pur');
    const now = stamp();
    await this.db.transaction('rw', [this.db.products, this.db.suppliers, this.db.purchases, this.db.purchaseItems, this.db.payments, this.db.stockMovements, this.db.auditEvents, this.db.operations], async () => {
      if (await this.db.operations.get(input.operationKey)) return;
      const supplier = required(await this.db.suppliers.get(input.supplierId), 'Supplier not found.');
      if (supplier.archived) throw new Error('Unarchive this supplier before creating a purchase.');
      const lines: Array<{ item: PurchaseItem; product: Product }> = [];
      for (const line of input.lines) {
        const product = required(await this.db.products.get(line.productId), 'A selected product no longer exists.');
        if (product.archived) throw new Error(`${product.name} is archived and cannot be reordered.`);
        if (!Number.isSafeInteger(line.quantity) || line.quantity < 1 || !Number.isSafeInteger(line.unitCostMinor) || line.unitCostMinor < 0) throw new Error('Purchase quantities and costs must be valid.');
        lines.push({ product, item: purchaseItemSchema.parse({ id: makeId('pri'), purchaseId, productId: product.id, productName: product.name, sku: product.sku, quantity: line.quantity, unitCostMinor: line.unitCostMinor, lineTotalMinor: line.quantity * line.unitCostMinor }) });
      }
      const subtotalMinor = lines.reduce((sum, row) => sum + row.item.lineTotalMinor, 0);
      if (!Number.isSafeInteger(input.paidMinor) || input.paidMinor < 0 || input.paidMinor > subtotalMinor) throw new Error('Payment must be between zero and the purchase total.');
      if (input.status === 'draft' && input.paidMinor > 0) throw new Error('Payments can be recorded after a purchase is received.');
      const purchase: Purchase = purchaseSchema.parse({ id: purchaseId, reference: `PUR-${new Date().toISOString().slice(2, 10).replaceAll('-', '')}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`, supplierId: supplier.id, supplierName: supplier.name, status: input.status, createdAt: now, receivedAt: input.status === 'received' ? now : null, subtotalMinor, notes: input.notes.trim() });
      await this.db.purchases.add(purchase);
      await this.db.purchaseItems.bulkAdd(lines.map((row) => row.item));
      if (input.status === 'received') {
        const received = mergeReceiptRows(lines.map(({ item, product }) => ({ product, quantity: item.quantity, unitCostMinor: item.unitCostMinor })));
        for (const { product, quantity, unitCostMinor } of received) {
          await this.db.products.put({ ...product, quantity: stockAfterChange(product, quantity), costMinor: unitCostMinor, updatedAt: now });
          await this.db.stockMovements.add(stockMovementSchema.parse({ id: makeId('move'), productId: product.id, productName: product.name, quantityDelta: quantity, reason: `Received ${purchase.reference}`, source: 'purchase', sourceId: purchaseId, createdAt: now }));
        }
        if (input.paidMinor > 0) await this.db.payments.add(paymentSchema.parse({ id: makeId('pay'), direction: 'out', partyType: 'supplier', partyId: supplier.id, saleId: null, purchaseId, amountMinor: input.paidMinor, method: input.method, operationKey: input.operationKey, createdAt: now, note: 'Purchase payment' }));
      }
      await this.db.operations.add({ id: input.operationKey, resultId: purchaseId, createdAt: now } satisfies OperationRecord);
      await this.writeAudit(input.status === 'received' ? 'purchase.received' : 'purchase.created', 'purchase', purchaseId, `${input.status === 'received' ? 'Received' : 'Created draft'} ${purchase.reference}`);
    });
    const operation = await this.db.operations.get(input.operationKey);
    this.notify();
    return operation?.resultId ?? purchaseId;
  }

  async recordSalePayment(input: { saleId: string; amountMinor: number; method: 'cash' | 'upi' | 'card' | 'bank' | 'other'; note: string; operationKey: string }): Promise<void> {
    await this.db.transaction('rw', [this.db.sales, this.db.payments, this.db.operations, this.db.auditEvents], async () => {
      if (await this.db.operations.get(input.operationKey)) return;
      const sale = required(await this.db.sales.get(input.saleId), 'Sale not found.');
      const payments = await this.db.payments.where('saleId').equals(sale.id).toArray();
      const paid = payments.filter((payment) => payment.direction === 'in').reduce((sum, payment) => sum + payment.amountMinor, 0);
      const due = Math.max(0, sale.totalMinor - paid);
      if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 1 || input.amountMinor > due) throw new Error(`Payment must be between ₹0.01 and the remaining balance of ₹${(due / 100).toFixed(2)}.`);
      const now = stamp();
      const payment = paymentSchema.parse({ id: makeId('pay'), direction: 'in', partyType: 'customer', partyId: sale.customerId ?? 'walk-in', saleId: sale.id, purchaseId: null, amountMinor: input.amountMinor, method: input.method, operationKey: input.operationKey, createdAt: now, note: input.note.trim() || `Payment for ${sale.invoiceNo}` });
      await this.db.payments.add(payment);
      await this.db.operations.add({ id: input.operationKey, resultId: payment.id, createdAt: now });
      await this.writeAudit('payment.recorded', 'sale', sale.id, `Recorded payment for ${sale.invoiceNo}`);
    });
    this.notify();
  }

  async receivePurchase(purchaseId: string): Promise<void> {
    await this.db.transaction('rw', [this.db.products, this.db.purchases, this.db.purchaseItems, this.db.stockMovements, this.db.auditEvents, this.db.operations], async () => {
      const operationKey = `receive:${purchaseId}`;
      if (await this.db.operations.get(operationKey)) return;
      const purchase = required(await this.db.purchases.get(purchaseId), 'Purchase not found.');
      if (purchase.status === 'received') {
        await this.db.operations.put({ id: operationKey, resultId: purchaseId, createdAt: stamp() });
        return;
      }
      if (purchase.status === 'cancelled') throw new Error('A cancelled purchase cannot be received.');
      const items = await this.db.purchaseItems.where('purchaseId').equals(purchaseId).toArray();
      const now = stamp();
      const receiptRows: ReceiptRow[] = [];
      for (const item of items) {
        receiptRows.push({ product: required(await this.db.products.get(item.productId), `Product ${item.productName} is missing.`), quantity: item.quantity, unitCostMinor: item.unitCostMinor });
      }
      for (const { product, quantity, unitCostMinor } of mergeReceiptRows(receiptRows)) {
        await this.db.products.put({ ...product, quantity: stockAfterChange(product, quantity), costMinor: unitCostMinor, updatedAt: now });
        await this.db.stockMovements.add(stockMovementSchema.parse({ id: makeId('move'), productId: product.id, productName: product.name, quantityDelta: quantity, reason: `Received ${purchase.reference}`, source: 'purchase', sourceId: purchase.id, createdAt: now }));
      }
      await this.db.purchases.put({ ...purchase, status: 'received', receivedAt: now });
      await this.db.operations.add({ id: operationKey, resultId: purchaseId, createdAt: now });
      await this.writeAudit('purchase.received', 'purchase', purchaseId, `Received ${purchase.reference}`);
    });
    this.notify();
  }

  async cancelPurchase(purchaseId: string): Promise<void> {
    await this.db.transaction('rw', [this.db.purchases, this.db.auditEvents], async () => {
      const purchase = required(await this.db.purchases.get(purchaseId), 'Purchase not found.');
      if (purchase.status === 'cancelled') return;
      if (purchase.status !== 'draft') throw new Error('Only a draft purchase can be cancelled.');
      await this.db.purchases.put({ ...purchase, status: 'cancelled' });
      await this.writeAudit('purchase.cancelled', 'purchase', purchase.id, `Cancelled ${purchase.reference}`);
    });
    this.notify();
  }

  async recordPartyPayment(input: { partyType: 'customer' | 'supplier'; partyId: string; amountMinor: number; method: 'cash' | 'upi' | 'card' | 'bank' | 'other'; note: string; operationKey: string }): Promise<void> {
    await this.db.transaction('rw', [this.db.customers, this.db.suppliers, this.db.sales, this.db.purchases, this.db.payments, this.db.auditEvents, this.db.operations], async () => {
      if (await this.db.operations.get(input.operationKey)) return;
      if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 1) throw new Error('Payment must be greater than zero.');
      const now = stamp();
      const rows: Payment[] = [];
      let remaining = input.amountMinor;
      if (input.partyType === 'customer') {
        required(await this.db.customers.get(input.partyId), 'Customer not found.');
        const [sales, payments] = await Promise.all([this.db.sales.where('customerId').equals(input.partyId).sortBy('createdAt'), this.db.payments.where('partyId').equals(input.partyId).toArray()]);
        for (const sale of sales) {
          const paid = payments.filter((payment) => payment.direction === 'in' && payment.saleId === sale.id).reduce((sum, payment) => sum + payment.amountMinor, 0);
          const due = Math.max(0, sale.totalMinor - paid);
          const applied = Math.min(remaining, due);
          if (applied > 0) {
            rows.push(paymentSchema.parse({ id: makeId('pay'), direction: 'in', partyType: 'customer', partyId: input.partyId, saleId: sale.id, purchaseId: null, amountMinor: applied, method: input.method, operationKey: input.operationKey, createdAt: now, note: input.note.trim() || `Payment for ${sale.invoiceNo}` }));
            remaining -= applied;
          }
          if (remaining === 0) break;
        }
      } else {
        required(await this.db.suppliers.get(input.partyId), 'Supplier not found.');
        const [purchases, payments] = await Promise.all([this.db.purchases.where('supplierId').equals(input.partyId).sortBy('createdAt'), this.db.payments.where('partyId').equals(input.partyId).toArray()]);
        for (const purchase of purchases.filter((row) => row.status === 'received')) {
          const paid = payments.filter((payment) => payment.direction === 'out' && payment.purchaseId === purchase.id).reduce((sum, payment) => sum + payment.amountMinor, 0);
          const due = Math.max(0, purchase.subtotalMinor - paid);
          const applied = Math.min(remaining, due);
          if (applied > 0) {
            rows.push(paymentSchema.parse({ id: makeId('pay'), direction: 'out', partyType: 'supplier', partyId: input.partyId, saleId: null, purchaseId: purchase.id, amountMinor: applied, method: input.method, operationKey: input.operationKey, createdAt: now, note: input.note.trim() || `Payment for ${purchase.reference}` }));
            remaining -= applied;
          }
          if (remaining === 0) break;
        }
      }
      if (remaining > 0) throw new Error('Payment exceeds the outstanding balance.');
      await this.db.payments.bulkAdd(rows);
      await this.db.operations.add({ id: input.operationKey, resultId: rows[0]?.id ?? input.partyId, createdAt: now });
      await this.writeAudit('payment.recorded', input.partyType, input.partyId, `Recorded payment of ₹${(input.amountMinor / 100).toFixed(2)}`);
    });
    this.notify();
  }

  async updateSettings(settings: BusinessSettings): Promise<void> {
    await this.db.settings.put(settingsSchema.parse({ ...settings, updatedAt: stamp() }));
    this.notify();
  }

  async importBackup(snapshot: LedgerSnapshot): Promise<void> {
    assertSnapshotIntegrity(snapshot);
    const validated: LedgerSnapshot = {
      ...snapshot,
      products: snapshot.products.map((row) => productSchema.parse(row)), categories: snapshot.categories.map((row) => categorySchema.parse(row)),
      customers: snapshot.customers.map((row) => customerSchema.parse(row)), suppliers: snapshot.suppliers.map((row) => supplierSchema.parse(row)),
      sales: snapshot.sales.map((row) => saleSchema.parse(row)), saleItems: snapshot.saleItems.map((row) => saleItemSchema.parse(row)),
      purchases: snapshot.purchases.map((row) => purchaseSchema.parse(row)), purchaseItems: snapshot.purchaseItems.map((row) => purchaseItemSchema.parse(row)),
      payments: snapshot.payments.map((row) => paymentSchema.parse(row)), stockMovements: snapshot.stockMovements.map((row) => stockMovementSchema.parse(row)),
      auditEvents: snapshot.auditEvents.map((row) => auditEventSchema.parse(row)), settings: settingsSchema.parse({ ...snapshot.settings, demoData: false }),
    };
    await this.db.transaction('rw', this.db.tables, async () => {
      await Promise.all(this.db.tables.map((table) => table.clear()));
      await Promise.all([
        this.db.products.bulkAdd(validated.products), this.db.categories.bulkAdd(validated.categories), this.db.customers.bulkAdd(validated.customers),
        this.db.suppliers.bulkAdd(validated.suppliers), this.db.sales.bulkAdd(validated.sales), this.db.saleItems.bulkAdd(validated.saleItems),
        this.db.purchases.bulkAdd(validated.purchases), this.db.purchaseItems.bulkAdd(validated.purchaseItems), this.db.payments.bulkAdd(validated.payments),
        this.db.stockMovements.bulkAdd(validated.stockMovements), this.db.auditEvents.bulkAdd(validated.auditEvents), this.db.settings.put(validated.settings),
      ]);
    });
    this.notify();
  }

  async resetDemoData(): Promise<void> {
    const currentSettings = await this.db.settings.get('business');
    if (!currentSettings?.demoData) throw new Error('Demo reset is only available in the demo workspace.');
    const snapshot = makeDemoSnapshot();
    await this.db.transaction('rw', this.db.tables, async () => {
      await Promise.all(this.db.tables.map((table: Table<unknown, string>) => table.clear()));
      await Promise.all([
        this.db.products.bulkAdd(snapshot.products), this.db.categories.bulkAdd(snapshot.categories), this.db.customers.bulkAdd(snapshot.customers),
        this.db.suppliers.bulkAdd(snapshot.suppliers), this.db.sales.bulkAdd(snapshot.sales), this.db.saleItems.bulkAdd(snapshot.saleItems),
        this.db.purchases.bulkAdd(snapshot.purchases), this.db.purchaseItems.bulkAdd(snapshot.purchaseItems), this.db.payments.bulkAdd(snapshot.payments),
        this.db.stockMovements.bulkAdd(snapshot.stockMovements), this.db.auditEvents.bulkAdd(snapshot.auditEvents), this.db.settings.put(snapshot.settings),
      ]);
    });
    this.notify();
  }

  private async writeAudit(eventType: string, entityType: string, entityId: string, summary: string): Promise<void> {
    const event: AuditEvent = auditEventSchema.parse({ id: makeId('audit'), eventType, entityType, entityId, summary, createdAt: stamp() });
    await this.db.auditEvents.add(event);
  }
}

export function isStorageUnavailable(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/database|indexeddb|quota|storage/i.test(message)) {
    return 'Ledgerly could not open local browser storage. Check that this browser allows site data for this app.';
  }
  return error instanceof Error ? error.message : 'Something went wrong while saving your records.';
}
